import { App, Notice, Platform, TFile } from "obsidian";
import html2canvas from "html2canvas";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

export { isPhoneSession } from "./session";
import type { PaginaSettings, TimestampFormat } from "./types";
import { borderExtentMm, drawBorderBand } from "./header-borders";
import {
	footerBaselineFromBottomMm,
	FRAME_INSET_MM,
	headerBaselineFromTopMm,
	LINE_MM,
	TEXT_BORDER_GAP_MM,
} from "./header-footer-layout";
import { layoutWarning, resolvePageSizeMm, resolvePrintMarginsMm } from "./page-presets";
import { fitStampedImages } from "./image-fit";
import { computePageLayout, type PageLayout } from "./paginate";
import {
	PRINT_CSS,
	insertForcedBreakSpacers,
	insertH1PageBreakSpacers,
	prepareConspectusForPrint,
} from "./print-styles";
import { applyH1StyleClasses, collectStyles, renderNoteForExport, type RenderedNote } from "./render";
import { renderTemplate, formatTimestamp, type VariableContext } from "./variables";
import { prepareCloneForCapture, sanitizeCssText } from "./css-sanitize";
import {
	applyPdfPostProcess,
	buildOutlineTree,
	collectHeadings,
	type OutlineItem,
} from "./outline";
import {
	ExportCancelledError,
	isElectronPrintAvailable,
	makeElectronPrintOptions,
	obsidianTextFont,
	openPath,
	printElementToPdf,
	promptSavePath,
	tempPdfPath,
	writePdfToPath,
} from "./electron-pdf";
import { stampHeaderFooter } from "./stamp-header-footer";
import { loadEmbeddableFont, vaultTextFontFamily, type VaultFontFiles } from "./vault-font";

export interface BuildPdfResult {
	bytes: Uint8Array;
	totalPages: number;
}

export type PdfProgress = (message: string) => void;

const RASTER_PAGE_TIMEOUT_MS = 45_000;

const PT_PER_MM = 72 / 25.4;

function pt(mm: number): number {
	return mm * PT_PER_MM;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error(message)), ms);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				window.clearTimeout(timer);
				reject(err instanceof Error ? err : new Error("Export timed out"));
			},
		);
	});
}

function yieldToUi(): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/** Lay the note out at the margin-adjusted column and fit images into that box. */
async function applyExportContentBox(rendered: RenderedNote, layout: PageLayout): Promise<void> {
	const width = `${Math.max(1, Math.ceil(layout.contentWidthPx))}px`;
	rendered.printEl.style.width = width;
	rendered.contentEl.style.width = width;
	rendered.contentEl.style.maxWidth = width;
	rendered.contentEl.addClass("pagina-border-box");
	await fitStampedImages(rendered.contentEl, layout.contentWidthPx, layout.contentHeightPx);
}

/**
 * Build PDF bytes for a note (used by export and PDF preview).
 */
export async function buildPdfBytes(
	app: App,
	file: TFile,
	settings: PaginaSettings,
	existingRender?: RenderedNote,
	onProgress?: PdfProgress,
): Promise<BuildPdfResult> {
	const layoutMessage = layoutWarning(settings);
	if (layoutMessage) {
		throw new Error(layoutMessage);
	}
	if (!isElectronPrintAvailable()) {
		return buildPdfBytesRaster(app, file, settings, onProgress);
	}
	return buildPdfBytesElectron(app, file, settings, existingRender);
}

async function buildPdfBytesElectron(
	app: App,
	file: TFile,
	settings: PaginaSettings,
	existingRender?: RenderedNote,
): Promise<BuildPdfResult> {
	const layout = computePageLayout(settings);
	const rendered =
		existingRender ??
		(await renderNoteForExport({
			app,
			file,
			includeTitle: settings.includeFileNameAsTitle,
			pageBreakBeforeH1: settings.pageBreakBeforeH1,
			centerH1: settings.centerH1,
			underlineH1: settings.underlineH1,
		}));
	applyH1StyleClasses(rendered.printEl, settings);
	prepareConspectusForPrint(rendered.contentEl);
	const shouldCleanup = !existingRender;
	try {
		const frontmatter = rendered.frontmatter ?? app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const ctx: VariableContext = {
			title: file.basename,
			filename: file.name,
			page: 1,
			pages: 1,
			frontmatter,
			now: new Date(),
		};
		const files = vaultFontFiles(app);
		const noteFont = obsidianTextFont(rendered.printEl);
		const vaultFont = await vaultTextFontFamily(files);
		const headerChoice = (settings.header.fontFamily ?? "").trim() || vaultFont || noteFont;
		const footerChoice = (settings.footer.fontFamily ?? "").trim() || vaultFont || noteFont;
		const headerLoaded = settings.displayHeader ? await loadEmbeddableFont(headerChoice, files) : { bytes: null };
		const footerLoaded = settings.displayFooter ? await loadEmbeddableFont(footerChoice, files) : { bytes: null };
		const headerFace = headerLoaded.bytes;
		const footerFace = footerLoaded.bytes;
		if (headerLoaded.error) new Notice(headerLoaded.error);
		if (footerLoaded.error && footerLoaded.error !== headerLoaded.error) new Notice(footerLoaded.error);
		const options = makeElectronPrintOptions(settings, ctx, rendered.printEl, {
			headerOmitText: headerFace != null,
			footerOmitText: footerFace != null,
		});
		await applyExportContentBox(rendered, layout);
		const raw = await printElementToPdf(
			rendered.printEl,
			options,
			tempPdfPath(file.path),
			file.basename,
		);
		const processed = await applyPdfPostProcess(copyBuffer(raw), {
			headingRoot: rendered.contentEl,
			maxLevel: Number(settings.maxHeadingLevel) || 6,
			tagged: settings.generateTaggedPDF,
			metadata: metadataFrom(settings, file, frontmatter),
		});
		const stamped = await stampHeaderFooter(copyBytes(processed), settings, ctx, {
			header: headerFace,
			footer: footerFace,
		});
		return { bytes: copyBytes(stamped), totalPages: 0 };
	} finally {
		if (shouldCleanup) rendered.cleanup();
	}
}

export async function buildPdfBytesRaster(
	app: App,
	file: TFile,
	settings: PaginaSettings,
	onProgress?: PdfProgress,
): Promise<BuildPdfResult> {
	const layout = computePageLayout(settings);
	onProgress?.("Pagina: preparing PDF…");
	// HTML preview is not raster-ready (no inlined images / mermaid snapshots).
	const rendered = await renderNoteForExport({
		app,
		file,
		includeTitle: settings.includeFileNameAsTitle,
		pageBreakBeforeH1: settings.pageBreakBeforeH1,
		centerH1: settings.centerH1,
		underlineH1: settings.underlineH1,
		forRaster: true,
		bakeMermaid: false,
		contentWidthPx: layout.contentWidthPx,
	});

	try {
		rendered.printEl.addClass("pagina-print-shown");
		await applyExportContentBox(rendered, layout);
		const contentEl = rendered.contentEl;
		void contentEl.offsetHeight;

		prepareConspectusForPrint(contentEl);
		if (settings.pageBreakBeforeH1) {
			insertH1PageBreakSpacers(contentEl, layout.contentHeightPx);
		}
		insertForcedBreakSpacers(contentEl, layout.contentHeightPx);

		const maxLevel = Number(settings.maxHeadingLevel) || 6;
		const headings = collectHeadings(contentEl, maxLevel);
		const outlines = buildOutlineTree(headings, layout.contentHeightPx);

		const contentWidth = Math.ceil(layout.contentWidthPx);
		const totalHeight = Math.ceil(Math.max(contentEl.scrollHeight, contentEl.offsetHeight, 1));
		const pageHeight = Math.max(1, Math.ceil(layout.contentHeightPx));
		const totalPages = Math.max(1, Math.ceil(totalHeight / pageHeight));
		const scale = captureScale(contentWidth, Math.min(pageHeight, totalHeight));

		const pdf = await PDFDocument.create();
		const font = await pdf.embedFont(StandardFonts.Helvetica);
		const pageWidthPt = pt(layout.pageWidthMm);
		const pageHeightPt = pt(layout.pageHeightMm);

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const now = new Date();
		const prevOverflow = rendered.printEl.style.overflow;
		const prevHostHeight = rendered.printEl.style.height;
		const prevTransform = contentEl.style.transform;

		try {
			for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
				onProgress?.(`Pagina: exporting PDF… page ${pageIndex + 1}/${totalPages}`);
				await yieldToUi();

				const page = pdf.addPage([pageWidthPt, pageHeightPt]);

				const srcY = pageIndex * pageHeight;
				const srcH = Math.min(pageHeight, totalHeight - srcY);
				if (srcH <= 0) continue;

				let strip: HTMLCanvasElement | null = null;
				let detached: DetachedNode[] = [];
				try {
					rendered.printEl.addClass("pagina-clip");
					rendered.printEl.style.height = `${Math.ceil(srcH)}px`;
					contentEl.style.transform = `translateY(${-srcY}px)`;
					void contentEl.offsetHeight;
					detached = detachOffPageChildren(contentEl, rendered.printEl);

					strip = await withTimeout(
						html2canvas(rendered.printEl, {
							backgroundColor: "#ffffff",
							scale,
							useCORS: true,
							logging: false,
							x: 0,
							y: 0,
							windowWidth: contentWidth,
							windowHeight: Math.ceil(srcH),
							width: contentWidth,
							height: Math.ceil(srcH),
							scrollX: 0,
							scrollY: 0,
							onclone: (clonedDoc) => {
								const sheet = new CSSStyleSheet();
								sheet.replaceSync(sanitizeCssText(collectStyles()));
								clonedDoc.adoptedStyleSheets = [sheet];
								prepareCloneForCapture(clonedDoc, settings.printBackground);
							},
						}),
						RASTER_PAGE_TIMEOUT_MS,
						`Timed out drawing page ${pageIndex + 1}/${totalPages}. Try a shorter note or a smaller page size.`,
					);

					const imgHeightMm = (srcH / contentWidth) * layout.contentWidthMm;
					const jpeg = await pdf.embedJpg(strip.toDataURL("image/jpeg", 0.72));
					const imgHeightPt = pt(imgHeightMm);
					const drawHeight = Math.min(imgHeightPt, pt(layout.contentHeightMm));
					page.drawImage(jpeg, {
						x: pt(layout.marginLeftMm),
						y: pageHeightPt - pt(layout.marginTopMm) - drawHeight,
						width: pt(layout.contentWidthMm),
						height: drawHeight,
					});
				} catch (error) {
					console.error("Pagina: raster capture failed", error);
					const message = error instanceof Error ? error.message : String(error);
					if (message.startsWith("Timed out")) {
						throw error instanceof Error ? error : new Error(message);
					}
					new Notice(
						"Pagina could not draw this PDF on this device. Try a shorter note or a smaller page size.",
						8000,
					);
					throw new Error("Raster PDF capture ran out of memory");
				} finally {
					restoreDetached(detached);
					if (strip) releaseCanvas(strip);
				}

				const varCtx: VariableContext = {
					title: file.basename,
					filename: file.name,
					page: pageIndex + 1,
					pages: totalPages,
					frontmatter,
					now,
				};
				drawHeaderFooter(page, pageHeightPt, font, settings, layout, varCtx);
			}
		} finally {
			rendered.printEl.removeClass("pagina-clip");
			rendered.printEl.style.overflow = prevOverflow;
			rendered.printEl.style.height = prevHostHeight;
			contentEl.style.transform = prevTransform;
		}

		clampOutlinePages(outlines, totalPages - 1);

		const raw = await pdf.save();
		const processed = await applyPdfPostProcess(copyBuffer(raw), {
			outlines,
			tagged: settings.generateTaggedPDF,
			metadata: metadataFrom(settings, file, frontmatter),
		});

		const out = new Uint8Array(processed.byteLength);
		out.set(processed);
		return { bytes: out, totalPages };
	} finally {
		rendered.cleanup();
	}
}

function captureScale(width: number, height: number): number {
	const maxPixels = Platform.isMobile ? 700_000 : 16_000_000;
	let scale = Platform.isMobile ? 0.5 : 2;
	const area = Math.max(1, width) * Math.max(1, height);
	while (area * scale * scale > maxPixels && scale > 0.35) {
		scale = Math.round((scale - 0.1) * 100) / 100;
	}
	if (area * scale * scale > maxPixels) {
		scale = Math.max(0.2, Math.sqrt(maxPixels / area));
	}
	return scale;
}

interface DetachedNode {
	parent: Node;
	node: HTMLElement;
	next: ChildNode | null;
}

function detachOffPageChildren(contentEl: HTMLElement, hostEl: HTMLElement): DetachedNode[] {
	const host = hostEl.getBoundingClientRect();
	const detached: DetachedNode[] = [];
	for (const node of Array.from(contentEl.children)) {
		if (!(node.instanceOf(HTMLElement)) || node.tagName === "STYLE") continue;
		const box = node.getBoundingClientRect();
		if (box.bottom <= host.top + 1 || box.top >= host.bottom - 1) {
			detached.push({ parent: contentEl, node, next: node.nextSibling });
			node.remove();
		}
	}
	return detached;
}

function restoreDetached(detached: DetachedNode[]): void {
	for (const item of detached) {
		item.parent.insertBefore(item.node, item.next);
	}
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
	canvas.width = 0;
	canvas.height = 0;
}

export async function exportNoteToPdf(
	app: App,
	file: TFile,
	settings: PaginaSettings,
	onProgress?: PdfProgress,
): Promise<string> {
	if (!isElectronPrintAvailable()) {
		return exportNoteWithoutElectron(app, file, settings, onProgress);
	}
	const { bytes } = await buildPdfBytes(app, file, settings, undefined, onProgress);

	const dest = await promptSavePath(file.basename, settings.timestampFormat);
	await writePdfToPath(dest, bytes);
	if (settings.openAfterExport) {
		await openPath(dest);
	}
	return dest;
}

export class WebPrintUnavailableError extends Error {
	constructor() {
		super("WebView print is not available");
		this.name = "WebPrintUnavailableError";
	}
}

/**
 * Android/iOS export through the WebView print dialog (Save as PDF).
 * Throws WebPrintUnavailableError when print() cannot be called.
 */
export async function exportNoteViaWebPrint(
	app: App,
	file: TFile,
	settings: PaginaSettings,
	onProgress?: PdfProgress,
): Promise<void> {
	const layoutMessage = layoutWarning(settings);
	if (layoutMessage) throw new Error(layoutMessage);
	onProgress?.("Pagina: preparing the print dialog…");
	const rendered = await renderNoteForExport({
		app,
		file,
		includeTitle: settings.includeFileNameAsTitle,
		pageBreakBeforeH1: settings.pageBreakBeforeH1,
		centerH1: settings.centerH1,
		underlineH1: settings.underlineH1,
		forPrint: true,
	});
	applyH1StyleClasses(rendered.printEl, settings);

	const iframe = createEl("iframe", {
		cls: "pagina-print-iframe",
		attr: { title: file.basename },
	});
	document.body.appendChild(iframe);

	let settled = false;
	const finish = () => {
		if (settled) return;
		settled = true;
		rendered.cleanup();
		iframe.remove();
	};

	try {
		const doc = iframe.contentDocument;
		const win = iframe.contentWindow;
		if (!doc || !win || typeof win.print !== "function") {
			throw new WebPrintUnavailableError();
		}
		const page = resolvePageSizeMm(
			settings.pageSize,
			settings.customPageWidthMm,
			settings.customPageHeightMm,
			settings.landscape,
		);
		const margins = resolvePrintMarginsMm(settings);
		const frontmatter = rendered.frontmatter ?? app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const ctx: VariableContext = {
			title: file.basename,
			filename: file.name,
			page: 1,
			pages: 1,
			frontmatter,
			now: new Date(),
		};
		const css = printFrameCss(page, margins, settings);
		mountPrintFrame(doc, file.basename, css, settings, ctx);

		rendered.printEl.removeClass("pagina-parked-print");
		rendered.printEl.addClass("pagina-print-flow");
		rendered.printEl.style.removeProperty("transform");
		doc.body.appendChild(rendered.printEl);
		await applyExportContentBox(rendered, computePageLayout(settings));
		await waitForPrintImages(doc);

		let dialogOpened = false;
		win.addEventListener(
			"beforeprint",
			() => {
				dialogOpened = true;
			},
			{ once: true },
		);
		win.addEventListener("afterprint", finish, { once: true });
		window.setTimeout(finish, 120_000);
		win.focus();
		try {
			win.print();
		} catch {
			throw new WebPrintUnavailableError();
		}
		await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
		if (!dialogOpened) {
			throw new WebPrintUnavailableError();
		}
		onProgress?.("Pagina: choose Save as PDF…");
		iframe.addClass("is-parked");
	} catch (error) {
		finish();
		throw error;
	}
}

export async function exportNoteWithoutElectron(
	app: App,
	file: TFile,
	settings: PaginaSettings,
	onProgress?: PdfProgress,
): Promise<string> {
	try {
		await exportNoteViaWebPrint(app, file, settings, onProgress);
		return "";
	} catch (error) {
		if (!(error instanceof WebPrintUnavailableError)) throw error;
	}
	onProgress?.("Pagina: print dialog unavailable, building a smaller PDF…");
	const { bytes } = await buildPdfBytesRaster(app, file, settings, onProgress);
	return sharePdfOutsideVault(app, file, bytes, settings, onProgress);
}

function printFrameCss(
	page: { width: number; height: number },
	margins: { top: number; bottom: number; left: number; right: number },
	settings: PaginaSettings,
): string {
	const colorAdjust = settings.printBackground
		? "-webkit-print-color-adjust:exact;print-color-adjust:exact;"
		: "";
	return `
@page { size: ${page.width}mm ${page.height}mm; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }
html, body { margin: 0; padding: 0; background: #fff; color: #222; ${colorAdjust} }
.pagina-run-header, .pagina-run-footer {
  position: fixed; left: 0; right: 0; display: flex; gap: 8px;
  font-size: 9pt; line-height: 1.2; box-sizing: border-box;
}
.pagina-run-header { top: 2mm; }
.pagina-run-footer { bottom: 2mm; }
.pagina-run-header > div, .pagina-run-footer > div { flex: 1; min-width: 0; }
.pagina-run-header .center, .pagina-run-footer .center { text-align: center; }
.pagina-run-header .right, .pagina-run-footer .right { text-align: right; }
.pagina-page-num::after { content: counter(page); }
.pagina-pages-num::after { content: counter(pages); }
${PRINT_CSS}
`;
}

function appendPrintSlot(
	parent: HTMLElement,
	template: string,
	ctx: VariableContext,
	datetimeFormat?: string,
): void {
	const pageToken = "\u0001PAGINA_PAGE\u0001";
	const pagesToken = "\u0001PAGINA_PAGES\u0001";
	const marked = template
		.replace(/\{\{\s*page\s*\}\}/gi, pageToken)
		.replace(/\{\{\s*pages\s*\}\}/gi, pagesToken);
	const rendered = renderTemplate(marked, { ...ctx, datetimeFormat });
	for (const piece of rendered.split(new RegExp(`(${pageToken}|${pagesToken})`))) {
		if (!piece) continue;
		if (piece === pageToken || piece === pagesToken) {
			parent.appendChild(
				createSpan({ cls: piece === pageToken ? "pagina-page-num" : "pagina-pages-num" }),
			);
			continue;
		}
		parent.appendText(piece);
	}
}

function appendPrintBand(
	doc: Document,
	kind: "header" | "footer",
	slots: PaginaSettings["header"],
	ctx: VariableContext,
): void {
	if (!slots.left && !slots.center && !slots.right) return;
	const band = createDiv({ cls: `pagina-run-${kind}` });
	band.style.color = slots.textColor || "#555555";
	if (slots.borderStyle && slots.borderStyle !== "none") {
		const border = `1px solid ${slots.borderColor || "#000000"}`;
		if (kind === "header") band.style.borderBottom = border;
		else band.style.borderTop = border;
	}
	for (const align of ["left", "center", "right"] as const) {
		const cell = band.createDiv({ cls: align });
		appendPrintSlot(cell, slots[align], ctx, slots.datetimeFormat);
	}
	doc.body.appendChild(doc.importNode(band, true));
	band.remove();
}

function mountPrintFrame(
	doc: Document,
	title: string,
	css: string,
	settings: PaginaSettings,
	ctx: VariableContext,
): void {
	const titleEl = createEl("title", { text: title });
	doc.head.appendChild(doc.importNode(titleEl, true));
	titleEl.remove();
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	doc.adoptedStyleSheets = [sheet];
	if (settings.displayHeader) appendPrintBand(doc, "header", settings.header, ctx);
	if (settings.displayFooter) appendPrintBand(doc, "footer", settings.footer, ctx);
}

function waitForPrintImages(doc: Document): Promise<void> {
	const pending = Array.from(doc.images).map(
		(img) =>
			new Promise<void>((resolve) => {
				if (img.complete) {
					resolve();
					return;
				}
				img.addEventListener("load", () => resolve(), { once: true });
				img.addEventListener("error", () => resolve(), { once: true });
			}),
	);
	return Promise.race([
		Promise.all(pending).then(() => undefined),
		new Promise<void>((resolve) => window.setTimeout(resolve, 8000)),
	]);
}

function vaultFontFiles(app: App): VaultFontFiles {
	return {
		configDir: app.vault.configDir,
		read: (normalizedPath) => app.vault.adapter.read(normalizedPath),
	};
}

function copyBuffer(data: Uint8Array): ArrayBuffer {
	return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function copyBytes(data: Uint8Array): Uint8Array {
	const out = new Uint8Array(data.byteLength);
	out.set(data);
	return out;
}

function metadataFrom(
	settings: PaginaSettings,
	file: TFile,
	frontmatter: object,
):
	| {
			title?: string;
			author?: string;
			subject?: string;
			keywords?: string;
			creator?: string;
			producer?: string;
	  }
	| undefined {
	if (!settings.pdfMetadata) return undefined;
	const fm = frontmatter as Record<string, unknown>;
	return {
		title: str(fm.title) || file.basename,
		author: str(fm.author),
		subject: str(fm.subject),
		keywords: str(fm.keywords) || str(fm.tags),
		creator: str(fm.creator) || "Pagina",
		producer: str(fm.producer) || "Pagina for Obsidian",
	};
}

function clampOutlinePages(items: OutlineItem[], maxPage: number): void {
	for (const item of items) {
		item.pageIndex = Math.min(item.pageIndex, maxPage);
		clampOutlinePages(item.children, maxPage);
	}
}

function str(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.map((item) => str(item)).join(", ");
	return "";
}

function drawHeaderFooter(
	page: PDFPage,
	pageHeightPt: number,
	font: PDFFont,
	settings: PaginaSettings,
	layout: PageLayout,
	ctx: VariableContext,
): void {
	const ink = rgb(80 / 255, 80 / 255, 80 / 255);
	const contentLeft = layout.marginLeftMm;
	const contentWidth = layout.contentWidthMm;
	const contentRight = contentLeft + contentWidth;
	const centerX = contentLeft + contentWidth / 2;

	if (settings.displayHeader) {
		const borderMm = borderExtentMm(settings.header.borderStyle);
		const textY = headerBaselineFromTopMm();
		drawSlots(page, pageHeightPt, font, ink, settings.header, contentLeft, centerX, contentRight, textY, contentWidth, ctx);
		if (borderMm > 0) {
			drawBorderBand(
				page,
				pageHeightPt,
				settings.header.borderStyle,
				settings.header.borderColor,
				contentLeft,
				FRAME_INSET_MM + LINE_MM + TEXT_BORDER_GAP_MM,
				contentWidth,
			);
		}
	}
	if (settings.displayFooter) {
		const borderMm = borderExtentMm(settings.footer.borderStyle);
		const textY = layout.pageHeightMm - footerBaselineFromBottomMm();
		if (borderMm > 0) {
			drawBorderBand(
				page,
				pageHeightPt,
				settings.footer.borderStyle,
				settings.footer.borderColor,
				contentLeft,
				layout.pageHeightMm - FRAME_INSET_MM - LINE_MM - TEXT_BORDER_GAP_MM - borderMm,
				contentWidth,
			);
		}
		drawSlots(page, pageHeightPt, font, ink, settings.footer, contentLeft, centerX, contentRight, textY, contentWidth, ctx);
	}
}

function drawSlots(
	page: PDFPage,
	pageHeightPt: number,
	font: PDFFont,
	ink: ReturnType<typeof rgb>,
	slots: { left: string; center: string; right: string; datetimeFormat?: string },
	leftX: number,
	centerX: number,
	rightX: number,
	y: number,
	maxWidth: number,
	ctx: VariableContext,
): void {
	const slotCtx = { ...ctx, datetimeFormat: slots.datetimeFormat };
	const colW = maxWidth / 3;
	drawSlot(page, pageHeightPt, font, ink, renderTemplate(slots.left, slotCtx), leftX, y, colW, "left");
	drawSlot(page, pageHeightPt, font, ink, renderTemplate(slots.center, slotCtx), centerX, y, colW, "center");
	drawSlot(page, pageHeightPt, font, ink, renderTemplate(slots.right, slotCtx), rightX, y, colW, "right");
}

function drawSlot(
	page: PDFPage,
	pageHeightPt: number,
	font: PDFFont,
	ink: ReturnType<typeof rgb>,
	text: string,
	anchorMm: number,
	yMm: number,
	maxWidthMm: number,
	align: "left" | "center" | "right",
): void {
	const printable = winAnsi(text);
	if (!printable) return;
	const size = 9;
	let width = 0;
	try {
		width = font.widthOfTextAtSize(printable, size);
	} catch {
		return;
	}
	const used = Math.min(width, pt(maxWidthMm));
	let x = pt(anchorMm);
	if (align === "center") x = pt(anchorMm) - used / 2;
	if (align === "right") x = pt(anchorMm) - used;
	try {
		page.drawText(printable, {
			x,
			y: pageHeightPt - pt(yMm),
			size,
			font,
			color: ink,
			maxWidth: pt(maxWidthMm),
			lineHeight: size * 1.2,
		});
	} catch {
		// The raster fallback uses Helvetica. Skip a slot it cannot encode.
	}
}

function winAnsi(text: string): string {
	let out = "";
	for (const ch of text) {
		if (ch.length !== 1) continue;
		const code = ch.charCodeAt(0);
		if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 255)) out += ch;
	}
	return out;
}

function suggestedPdfName(file: TFile, timestampFormat: TimestampFormat): string {
	const stamp = timestampFormat !== "none" ? `-${formatTimestamp(timestampFormat)}` : "";
	return `${file.basename}${stamp}.pdf`;
}

function bytesToBase64(data: Uint8Array): string {
	const chunk = 0x2000;
	let binary = "";
	for (let i = 0; i < data.length; i += chunk) {
		binary += String.fromCharCode(...data.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function isShareCancel(error: unknown): boolean {
	if (error instanceof ExportCancelledError) return true;
	if (error instanceof DOMException && error.name === "AbortError") return true;
	const message = error instanceof Error ? error.message : "";
	const lower = message.toLowerCase();
	return lower.includes("cancel") || lower.includes("dismiss") || lower.includes("abort");
}

interface CapacitorFilesystem {
	writeFile: (opts: { path: string; data: string; directory: string }) => Promise<unknown>;
	getUri: (opts: { path: string; directory: string }) => Promise<{ uri: string }>;
}

interface CapacitorShare {
	share: (opts: { title?: string; text?: string; url?: string; files?: string[]; dialogTitle?: string }) => Promise<unknown>;
}

function capacitorPlugins(): { Filesystem?: CapacitorFilesystem; Share?: CapacitorShare } | null {
	const cap = (window as unknown as { Capacitor?: { Plugins?: { Filesystem?: CapacitorFilesystem; Share?: CapacitorShare } } })
		.Capacitor;
	return cap?.Plugins ?? null;
}

async function shareViaCapacitor(fileName: string, data: Uint8Array, dialogTitle: string): Promise<string> {
	const plugins = capacitorPlugins();
	const fs = plugins?.Filesystem;
	const share = plugins?.Share;
	if (!fs || !share) return "";
	const path = fileName;
	await fs.writeFile({ path, data: bytesToBase64(data), directory: "CACHE" });
	const { uri } = await fs.getUri({ path, directory: "CACHE" });
	await share.share({
		title: fileName,
		url: uri,
		files: [uri],
		dialogTitle,
	});
	return uri;
}

async function shareViaWebShare(fileName: string, data: Uint8Array, mime: string): Promise<boolean> {
	const nav = navigator as Navigator & {
		canShare?: (data: ShareData) => boolean;
		share?: (data: ShareData) => Promise<void>;
	};
	if (typeof nav.share !== "function" || typeof File === "undefined") return false;
	const fileObj = new File([copyBuffer(data)], fileName, { type: mime });
	const payload: ShareData = { files: [fileObj], title: fileName };
	if (typeof nav.canShare === "function" && !nav.canShare(payload)) return false;
	await nav.share(payload);
	return true;
}

function downloadViaObjectUrl(fileName: string, data: Uint8Array, mime: string): boolean {
	const blob = new Blob([copyBuffer(data)], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = createEl("a", {
		cls: "pagina-hidden",
		attr: { href: url, download: fileName, rel: "noopener" },
	});
	document.body.appendChild(a);
	a.click();
	window.setTimeout(() => {
		a.remove();
		URL.revokeObjectURL(url);
	}, 2000);
	return true;
}

export async function sharePdfOutsideVault(
	app: App,
	file: TFile,
	data: Uint8Array,
	settings: PaginaSettings,
	onProgress?: PdfProgress,
): Promise<string> {
	const fileName = suggestedPdfName(file, settings.timestampFormat);
	onProgress?.("Pagina: choose where to save…");
	try {
		const capacitorUri = await shareViaCapacitor(fileName, data, "Save PDF");
		if (capacitorUri) return capacitorUri;
		if (await shareViaWebShare(fileName, data, "application/pdf")) return fileName;
		if (downloadViaObjectUrl(fileName, data, "application/pdf")) return fileName;
	} catch (error) {
		if (isShareCancel(error)) throw new ExportCancelledError();
		console.error("Pagina: share outside vault failed", error);
	}

	new Notice("Pagina: share sheet unavailable — saved inside the vault instead.", 8000);
	const outPath = await writePdfToVault(app, file, data, settings.timestampFormat);
	if (settings.openAfterExport) {
		await openExportedPdf(app, outPath);
	}
	return outPath;
}

async function writePdfToVault(
	app: App,
	file: TFile,
	data: Uint8Array,
	timestampFormat: TimestampFormat,
): Promise<string> {
	const folder = file.parent?.path && file.parent.path !== "/" ? file.parent.path : "";
	const stamp = timestampFormat !== "none" ? `-${formatTimestamp(timestampFormat)}` : "";
	const baseName = `${file.basename}${stamp}.pdf`;
	const outPath = folder ? `${folder}/${baseName}` : baseName;

	const existing = app.vault.getAbstractFileByPath(outPath);
	const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	if (existing instanceof TFile) {
		await app.vault.modifyBinary(existing, buffer);
	} else {
		await app.vault.createBinary(outPath, buffer);
	}
	return outPath;
}

async function openExportedPdf(app: App, path: string): Promise<void> {
	const openDefault = (app as App & { openWithDefaultApp?: (path: string) => Promise<void> })
		.openWithDefaultApp;
	if (typeof openDefault === "function") {
		try {
			await openDefault.call(app, path);
			return;
		} catch {
			/* fall through */
		}
	}
	try {
		const abstract = app.vault.getAbstractFileByPath(path);
		if (abstract instanceof TFile) {
			await app.workspace.getLeaf(false).openFile(abstract);
			return;
		}
	} catch {
		/* ignore */
	}
	new Notice(`Pagina: saved ${path}`);
}
