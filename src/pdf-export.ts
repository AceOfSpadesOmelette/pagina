import { App, Notice, Platform, TFile } from "obsidian";
import html2canvas from "html2canvas";

export { isPhoneSession } from "./session";
import { jsPDF } from "jspdf";
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
import { computePageLayout, type PageLayout } from "./paginate";
import {
	PRINT_CSS,
	insertForcedBreakSpacers,
	insertH1PageBreakSpacers,
	prepareConspectusForPrint,
} from "./print-styles";
import { applyH1StyleClasses, renderNoteForExport, type RenderedNote } from "./render";
import { renderTemplate, formatTimestamp, type VariableContext } from "./variables";
import { prepareCloneForCapture } from "./css-sanitize";
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
import { loadEmbeddableFont, usePluginFontDir, vaultTextFontFamily, type VaultFontFiles } from "./vault-font";

export interface BuildPdfResult {
	bytes: Uint8Array;
	totalPages: number;
}

export type PdfProgress = (message: string) => void;

const RASTER_PAGE_TIMEOUT_MS = 45_000;

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
				reject(err);
			},
		);
	});
}

function yieldToUi(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
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
		usePluginFontDir(pluginFontDir(app));
		const files = vaultFontFiles(app);
		const noteFont = obsidianTextFont(rendered.printEl);
		const vaultFont = vaultTextFontFamily(files);
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
		rendered.printEl.style.display = "block";
		const contentEl = rendered.contentEl;
		contentEl.style.width = `${Math.ceil(layout.contentWidthPx)}px`;
		contentEl.style.maxWidth = `${Math.ceil(layout.contentWidthPx)}px`;
		contentEl.style.boxSizing = "border-box";
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

		const pdf = new jsPDF({
			orientation: layout.pageWidthMm >= layout.pageHeightMm ? "landscape" : "portrait",
			unit: "mm",
			format: [layout.pageWidthMm, layout.pageHeightMm],
			compress: true,
		});

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const now = new Date();
		const prevOverflow = rendered.printEl.style.overflow;
		const prevHostHeight = rendered.printEl.style.height;
		const prevTransform = contentEl.style.transform;

		try {
			for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
				onProgress?.(`Pagina: exporting PDF… page ${pageIndex + 1}/${totalPages}`);
				await yieldToUi();

				if (pageIndex > 0) {
					pdf.addPage([layout.pageWidthMm, layout.pageHeightMm]);
				}

				const srcY = pageIndex * pageHeight;
				const srcH = Math.min(pageHeight, totalHeight - srcY);
				if (srcH <= 0) continue;

				let strip: HTMLCanvasElement | null = null;
				let detached: DetachedNode[] = [];
				try {
					rendered.printEl.style.overflow = "hidden";
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
								prepareCloneForCapture(clonedDoc, settings.printBackground);
							},
						}),
						RASTER_PAGE_TIMEOUT_MS,
						`Timed out drawing page ${pageIndex + 1}/${totalPages}. Try a shorter note or a smaller page size.`,
					);

					const imgHeightMm = (srcH / contentWidth) * layout.contentWidthMm;
					const jpeg = strip.toDataURL("image/jpeg", 0.72);
					pdf.addImage(
						jpeg,
						"JPEG",
						layout.marginLeftMm,
						layout.marginTopMm,
						layout.contentWidthMm,
						Math.min(imgHeightMm, layout.contentHeightMm),
					);
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
				drawHeaderFooter(pdf, settings, layout, varCtx);
			}
		} finally {
			rendered.printEl.style.overflow = prevOverflow;
			rendered.printEl.style.height = prevHostHeight;
			contentEl.style.transform = prevTransform;
		}

		clampOutlinePages(outlines, totalPages - 1);

		const raw = new Uint8Array(pdf.output("arraybuffer"));
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
		if (!(node instanceof HTMLElement) || node.tagName === "STYLE") continue;
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

	const iframe = document.createElement("iframe");
	iframe.setAttribute("title", file.basename);
	iframe.style.cssText =
		"position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;z-index:2147483646;";
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
		doc.open();
		doc.write(printDocumentHtml(file.basename, page, margins, settings, ctx));
		doc.close();

		rendered.printEl.style.position = "static";
		rendered.printEl.style.left = "auto";
		rendered.printEl.style.top = "auto";
		rendered.printEl.style.width = "100%";
		rendered.printEl.style.height = "auto";
		rendered.printEl.style.zIndex = "auto";
		rendered.printEl.style.pointerEvents = "auto";
		rendered.printEl.style.transform = "";
		doc.body.appendChild(rendered.printEl);
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
		iframe.style.left = "-10000px";
		iframe.style.width = "794px";
		iframe.style.height = "1123px";
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

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function slotHtml(template: string, ctx: VariableContext, datetimeFormat?: string): string {
	const pageToken = "\u0001PAGINA_PAGE\u0001";
	const pagesToken = "\u0001PAGINA_PAGES\u0001";
	const marked = template
		.replace(/\{\{\s*page\s*\}\}/gi, pageToken)
		.replace(/\{\{\s*pages\s*\}\}/gi, pagesToken);
	const rendered = renderTemplate(marked, { ...ctx, datetimeFormat });
	return escapeHtml(rendered)
		.replaceAll(pageToken, '<span class="pagina-page-num"></span>')
		.replaceAll(pagesToken, '<span class="pagina-pages-num"></span>');
}

function runningBand(
	kind: "header" | "footer",
	slots: PaginaSettings["header"],
	ctx: VariableContext,
): string {
	const left = slotHtml(slots.left, ctx, slots.datetimeFormat);
	const center = slotHtml(slots.center, ctx, slots.datetimeFormat);
	const right = slotHtml(slots.right, ctx, slots.datetimeFormat);
	if (!left && !center && !right) return "";
	const color = escapeHtml(slots.textColor || "#555555");
	const borderColor = escapeHtml(slots.borderColor || "#000000");
	const edge =
		slots.borderStyle && slots.borderStyle !== "none"
			? kind === "header"
				? `border-bottom:1px solid ${borderColor};`
				: `border-top:1px solid ${borderColor};`
			: "";
	return `<div class="pagina-run-${kind}" style="color:${color};${edge}"><div class="left">${left}</div><div class="center">${center}</div><div class="right">${right}</div></div>`;
}

function printDocumentHtml(
	title: string,
	page: { width: number; height: number },
	margins: { top: number; bottom: number; left: number; right: number },
	settings: PaginaSettings,
	ctx: VariableContext,
): string {
	const colorAdjust = settings.printBackground
		? "-webkit-print-color-adjust:exact;print-color-adjust:exact;"
		: "";
	const css = `
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
	const header = settings.displayHeader ? runningBand("header", settings.header, ctx) : "";
	const footer = settings.displayFooter ? runningBand("footer", settings.footer, ctx) : "";
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${header}${footer}</body></html>`;
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
	const adapter = app.vault.adapter as { getBasePath?: () => string; basePath?: string };
	const basePath = typeof adapter.getBasePath === "function" ? adapter.getBasePath() : (adapter.basePath ?? "");
	return { basePath, configDir: app.vault.configDir };
}

function pluginFontDir(app: App): string {
	const path = require("path") as typeof import("path");
	const adapter = app.vault.adapter as { getBasePath?: () => string; basePath?: string };
	const base = typeof adapter.getBasePath === "function" ? adapter.getBasePath() : (adapter.basePath ?? "");
	if (!base) return "";
	return path.join(base, app.vault.configDir, "plugins", "pagina");
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
	if (value == null) return "";
	if (Array.isArray(value)) return value.map(String).join(", ");
	return String(value);
}

function drawHeaderFooter(
	pdf: jsPDF,
	settings: PaginaSettings,
	layout: PageLayout,
	ctx: VariableContext,
): void {
	pdf.setFontSize(9);
	pdf.setTextColor(80);

	const contentLeft = layout.marginLeftMm;
	const contentWidth = layout.contentWidthMm;
	const contentRight = contentLeft + contentWidth;
	const centerX = contentLeft + contentWidth / 2;

	if (settings.displayHeader) {
		const borderMm = borderExtentMm(settings.header.borderStyle);
		const textY = headerBaselineFromTopMm();
		drawSlots(pdf, settings.header, contentLeft, centerX, contentRight, textY, contentWidth, ctx);
		if (borderMm > 0) {
			drawBorderBand(
				pdf,
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
				pdf,
				settings.footer.borderStyle,
				settings.footer.borderColor,
				contentLeft,
				layout.pageHeightMm - FRAME_INSET_MM - LINE_MM - TEXT_BORDER_GAP_MM - borderMm,
				contentWidth,
			);
		}
		drawSlots(pdf, settings.footer, contentLeft, centerX, contentRight, textY, contentWidth, ctx);
	}
}

function drawSlots(
	pdf: jsPDF,
	slots: { left: string; center: string; right: string; datetimeFormat?: string },
	leftX: number,
	centerX: number,
	rightX: number,
	y: number,
	maxWidth: number,
	ctx: VariableContext,
): void {
	const slotCtx = { ...ctx, datetimeFormat: slots.datetimeFormat };
	const left = renderTemplate(slots.left, slotCtx);
	const center = renderTemplate(slots.center, slotCtx);
	const right = renderTemplate(slots.right, slotCtx);
	const colW = maxWidth / 3;

	if (left) {
		pdf.text(left, leftX, y, { align: "left", maxWidth: colW });
	}
	if (center) {
		pdf.text(center, centerX, y, { align: "center", maxWidth: colW });
	}
	if (right) {
		pdf.text(right, rightX, y, { align: "right", maxWidth: colW });
	}
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
	const message = error instanceof Error ? error.message : String(error ?? "");
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
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.rel = "noopener";
	a.style.display = "none";
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
