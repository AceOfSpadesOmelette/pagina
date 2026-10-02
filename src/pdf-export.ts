import { App, Notice, TFile } from "obsidian";
import html2canvas from "html2canvas";
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
import { layoutWarning } from "./page-presets";
import { computePageLayout, type PageLayout } from "./paginate";
import { renderNoteForExport, type RenderedNote } from "./render";
import { renderTemplate, formatTimestamp, type VariableContext } from "./variables";
import { prepareCloneForCapture } from "./css-sanitize";
import {
	applyPdfPostProcess,
	buildOutlineTree,
	collectHeadings,
	type OutlineItem,
} from "./outline";
import {
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

/**
 * Build PDF bytes for a note (used by export and PDF preview).
 */
export async function buildPdfBytes(
	app: App,
	file: TFile,
	settings: PaginaSettings,
	existingRender?: RenderedNote,
): Promise<BuildPdfResult> {
	const layoutMessage = layoutWarning(settings);
	if (layoutMessage) {
		throw new Error(layoutMessage);
	}
	if (isElectronPrintAvailable()) {
		return buildPdfBytesElectron(app, file, settings, existingRender);
	}
	return buildPdfBytesRaster(app, file, settings, existingRender);
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
		}));
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

async function buildPdfBytesRaster(
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
			forRaster: true,
			contentWidthPx: layout.contentWidthPx,
		}));
	const shouldCleanup = !existingRender;

	try {
		rendered.printEl.style.display = "block";
		const contentEl = rendered.contentEl;
		contentEl.style.width = `${Math.ceil(layout.contentWidthPx)}px`;
		contentEl.style.maxWidth = `${Math.ceil(layout.contentWidthPx)}px`;
		contentEl.style.boxSizing = "border-box";
		void contentEl.offsetHeight;

		const maxLevel = Number(settings.maxHeadingLevel) || 6;
		const headings = collectHeadings(contentEl, maxLevel);
		const outlines = buildOutlineTree(headings, layout.contentHeightPx);

		const fullCanvas = await html2canvas(contentEl, {
			backgroundColor: "#ffffff",
			scale: 2,
			useCORS: true,
			logging: false,
			windowWidth: Math.ceil(layout.contentWidthPx),
			width: Math.ceil(layout.contentWidthPx),
			height: Math.ceil(Math.max(contentEl.scrollHeight, contentEl.offsetHeight, 1)),
			onclone: (clonedDoc) => {
				prepareCloneForCapture(clonedDoc, settings.printBackground);
			},
		});

		const pdf = new jsPDF({
			orientation: layout.pageWidthMm >= layout.pageHeightMm ? "landscape" : "portrait",
			unit: "mm",
			format: [layout.pageWidthMm, layout.pageHeightMm],
			compress: true,
		});

		const sliceHeightCanvas = Math.max(
			1,
			Math.round((layout.contentHeightPx / layout.contentWidthPx) * fullCanvas.width),
		);
		const totalPages = Math.max(1, Math.ceil(fullCanvas.height / sliceHeightCanvas));

		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const now = new Date();

		for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
			if (pageIndex > 0) {
				pdf.addPage([layout.pageWidthMm, layout.pageHeightMm]);
			}

			const srcY = pageIndex * sliceHeightCanvas;
			const srcH = Math.min(sliceHeightCanvas, fullCanvas.height - srcY);
			if (srcH <= 0) continue;

			const pageCanvas = document.createElement("canvas");
			pageCanvas.width = fullCanvas.width;
			pageCanvas.height = srcH;
			const ctx = pageCanvas.getContext("2d");
			if (!ctx) throw new Error("Could not create canvas context");
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
			ctx.drawImage(fullCanvas, 0, srcY, fullCanvas.width, srcH, 0, 0, fullCanvas.width, srcH);

			const imgData = pageCanvas.toDataURL("image/jpeg", 0.92);
			const imgHeightMm = (srcH / fullCanvas.width) * layout.contentWidthMm;
			const contentTopMm = layout.marginTopMm;
			pdf.addImage(
				imgData,
				"JPEG",
				layout.marginLeftMm,
				contentTopMm,
				layout.contentWidthMm,
				Math.min(imgHeightMm, layout.contentHeightMm),
			);

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

		// Clamp outline page indices to total pages
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
		if (shouldCleanup) {
			rendered.cleanup();
		}
	}
}

export async function exportNoteToPdf(app: App, file: TFile, settings: PaginaSettings): Promise<string> {
	const { bytes } = await buildPdfBytes(app, file, settings);

	if (isElectronPrintAvailable()) {
		const dest = await promptSavePath(file.basename, settings.timestampFormat);
		await writePdfToPath(dest, bytes);
		if (settings.openAfterExport) {
			await openPath(dest);
		}
		return dest;
	}

	const outPath = await writePdfToVault(app, file, bytes, settings.timestampFormat);
	if (settings.openAfterExport) {
		await openExportedPdf(app, outPath);
	}
	return outPath;
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
