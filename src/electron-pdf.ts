import { promises as fs } from "fs";
import os from "os";
import path from "path";
import electron from "electron";
import { borderSvg } from "./header-borders";
import { EM_MM, LINE_MM, TEXT_BORDER_GAP_MM, mmToCssPx } from "./header-footer-layout";
import type { PaginaSettings, TimestampFormat } from "./types";
import { effectiveLandscape, layoutWarning, resolvePageSizeMm, resolvePrintMarginsMm } from "./page-presets";
import { formatTimestamp, renderTemplate, type VariableContext } from "./variables";

interface IpcRendererLike {
	send: (channel: string, ...args: unknown[]) => void;
	once: (channel: string, listener: (event: unknown, result?: unknown) => void) => void;
}

interface WithWin {
	win?: { electron?: { ipcRenderer?: IpcRendererLike } };
}

export class ExportCancelledError extends Error {
	constructor() {
		super("Export cancelled");
		this.name = "ExportCancelledError";
	}
}

function ipcFrom(target: object | null | undefined): IpcRendererLike | undefined {
	if (!target) return undefined;
	return (target as WithWin).win?.electron?.ipcRenderer;
}

function ipcFromModule(): IpcRendererLike | undefined {
	try {
		return electron.ipcRenderer;
	} catch {
		return undefined;
	}
}

function getIpc(printEl?: HTMLElement): IpcRendererLike {
	const viaWindow = (window as unknown as { electron?: { ipcRenderer?: IpcRendererLike } }).electron
		?.ipcRenderer;
	const ipc =
		(printEl ? ipcFrom(printEl) : undefined) ?? ipcFrom(document.body) ?? viaWindow ?? ipcFromModule();
	if (!ipc) {
		throw new Error("Electron IPC is not available");
	}
	return ipc;
}

export function isElectronPrintAvailable(): boolean {
	try {
		const hasDialog = Boolean(electron.remote?.dialog?.showSaveDialog);
		const hasIpc = Boolean(
			(window as unknown as { electron?: { ipcRenderer?: IpcRendererLike } }).electron?.ipcRenderer ||
				ipcFrom(document.body) ||
				ipcFromModule(),
		);
		return hasDialog && hasIpc;
	} catch {
		return false;
	}
}

function suggestedFileName(basename: string, timestampFormat: TimestampFormat): string {
	if (timestampFormat === "none") return `${basename}.pdf`;
	const stamp = formatTimestamp(timestampFormat);
	return `${basename}-${stamp}.pdf`;
}

export async function promptSavePath(basename: string, timestampFormat: TimestampFormat): Promise<string> {
	const dialog = electron.remote?.dialog;
	if (!dialog?.showSaveDialog) {
		throw new Error("Save dialog is not available");
	}
	const result = await dialog.showSaveDialog({
		title: "Export to PDF",
		defaultPath: suggestedFileName(basename, timestampFormat),
		filters: [{ name: "PDF", extensions: ["pdf"] }],
		properties: ["showOverwriteConfirmation", "createDirectory"],
	});
	if (result.canceled || !result.filePath) {
		throw new ExportCancelledError();
	}
	return result.filePath;
}

export async function writePdfToPath(filePath: string, bytes: Uint8Array): Promise<void> {
	await fs.writeFile(filePath, bytes);
}

export async function openPath(filePath: string): Promise<void> {
	const shell = electron.remote?.shell ?? electron.shell;
	await shell?.openPath(filePath);
}

export function tempPdfPath(filePath: string): string {
	const safe = filePath.replace(/[/\\:]/g, "_");
	return path.join(os.tmpdir(), `pagina-${safe}-${Date.now()}.pdf`);
}

function chromiumSlot(template: string, ctx: VariableContext, datetimeFormat?: string): string {
	const pagePlaceholder = "\u0000PAGE\u0000";
	const pagesPlaceholder = "\u0000PAGES\u0000";
	const protectedText = template
		.replace(/\{\{\s*page\s*\}\}/gi, pagePlaceholder)
		.replace(/\{\{\s*pages\s*\}\}/gi, pagesPlaceholder);
	const rendered = renderTemplate(protectedText, { ...ctx, datetimeFormat });
	return rendered
		.replaceAll(pagePlaceholder, '<span class="pageNumber"></span>')
		.replaceAll(pagesPlaceholder, '<span class="totalPages"></span>');
}

/** Font stack used by the open note, or by the Obsidian interface when no note is rendered. */
export function obsidianTextFont(root?: ParentNode | null): string {
	if (typeof document === "undefined") return "";
	const note = root?.querySelector?.(".markdown-rendered");
	const el = note?.instanceOf(HTMLElement) ? note : document.body;
	const computed = getComputedStyle(el).fontFamily?.trim();
	if (computed) return computed;
	return getComputedStyle(document.body).getPropertyValue("--font-text").trim();
}

export function obsidianFontLabel(): string {
	try {
		const fromVariable = fontNameFromStack(noteFontVariable());
		if (fromVariable) return fromVariable;
		const fromComputed = fontNameFromStack(obsidianTextFont());
		if (fromComputed) return fromComputed;
	} catch (error) {
		console.error("Pagina: could not read the note font name", error);
	}
	return "the note font";
}

/** The vault text font, from Obsidian's CSS variables rather than the computed UI face. */
function noteFontVariable(): string {
	if (typeof document === "undefined") return "";
	const style = getComputedStyle(document.body);
	for (const name of ["--font-text-override", "--font-text-theme", "--font-text"]) {
		const value = style.getPropertyValue(name).trim();
		if (value) return value;
	}
	return "";
}

function fontNameFromStack(stack: string): string {
	for (const part of fontFamilyNames(stack)) {
		if (!part || part === "??" || part.startsWith("var(")) continue;
		if (GENERIC_FAMILIES.has(part.toLowerCase())) continue;
		return part;
	}
	return "";
}

const GENERIC_FAMILIES = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-sans-serif",
	"ui-serif",
	"ui-monospace",
]);

function fontFamilyNames(stack: string): string[] {
	return stack
		.split(",")
		.map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
		.filter(Boolean);
}

function cssFontFamily(value: string | undefined, fallback: string): string {
	const names = fontFamilyNames((value ?? "").trim() || fallback.trim());
	if (names.length === 0) return "sans-serif";
	return names.map((name) => `'${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(", ");
}

function headerFooterHtml(
	slots: {
		left: string;
		center: string;
		right: string;
		borderStyle?: string;
		borderColor?: string;
		textColor?: string;
		fontFamily?: string;
		datetimeFormat?: string;
	},
	ctx: VariableContext,
	marginLeftIn: number,
	marginRightIn: number,
	edge: "header" | "footer",
	noteFont: string,
	omitText: boolean,
	lines: number,
): string {
	const left = omitText ? "" : chromiumSlot(slots.left, ctx, slots.datetimeFormat);
	const center = omitText ? "" : chromiumSlot(slots.center, ctx, slots.datetimeFormat);
	const right = omitText ? "" : chromiumSlot(slots.right, ctx, slots.datetimeFormat);
	const textColor = slots.textColor || "#555555";
	const fontFamily = cssFontFamily(slots.fontFamily, noteFont);
	const rule = borderSvg(slots.borderStyle, slots.borderColor);
	const linePx = mmToCssPx(LINE_MM);
	const rowPx = mmToCssPx(LINE_MM * Math.max(1, lines));
	const emPx = mmToCssPx(EM_MM);
	const gapPx = mmToCssPx(TEXT_BORDER_GAP_MM);
	const justify = edge === "header" ? "flex-start" : "flex-end";
	const alignItems = edge === "header" ? "flex-start" : "flex-end";
	const ruleHtml = rule ? `<div style="width:100%;line-height:0;">${rule}</div>` : "";
	const gapHtml = rule ? `<div style="height:${gapPx}px;line-height:0;font-size:0;"></div>` : "";
	const slot = (align: string, text: string) =>
		`<div style="flex:1;min-width:0;height:${rowPx}px;line-height:${linePx}px;font-size:${emPx}px;overflow:hidden;white-space:normal;word-break:break-word;text-align:${align};">${text}</div>`;
	const row = `<div style="width:100%;height:${rowPx}px;display:flex;align-items:${alignItems};overflow:hidden;">
${slot("left", left)}${slot("center", center)}${slot("right", right)}
</div>`;
	if (omitText && !rule) return "<span></span>";
	const body = edge === "header" ? `${row}${gapHtml}${ruleHtml}` : `${ruleHtml}${gapHtml}${row}`;
	return `<div style="width:100%;height:100%;box-sizing:border-box;font-size:9px;line-height:${linePx}px;font-family:${fontFamily};color:${textColor};padding-left:${marginLeftIn}in;padding-right:${marginRightIn}in;display:flex;flex-direction:column;justify-content:${justify};">${body}</div>`;
}

export interface ElectronPrintExtras {
	/** Vault font is stamped on afterwards, so the template keeps the border spacer only. */
	headerOmitText?: boolean;
	footerOmitText?: boolean;
	/** Lines reserved so a wrapped slot stays above the border. */
	headerLines?: number;
	footerLines?: number;
}

export function makeElectronPrintOptions(
	settings: PaginaSettings,
	ctx: VariableContext,
	noteRoot?: ParentNode | null,
	extras?: ElectronPrintExtras,
): Record<string, unknown> {
	const page = resolvePageSizeMm(
		settings.pageSize,
		settings.customPageWidthMm,
		settings.customPageHeightMm,
		false,
	);
	const banded = {
		...settings,
		header: { borderStyle: settings.header.borderStyle, lines: extras?.headerLines },
		footer: { borderStyle: settings.footer.borderStyle, lines: extras?.footerLines },
	};
	const margins = resolvePrintMarginsMm(banded);
	const layoutMessage = layoutWarning(banded);
	if (layoutMessage) {
		throw new Error(layoutMessage);
	}
	const noteFont = obsidianTextFont(noteRoot);
	const toIn = (mm: number) => mm / 25.4;
	const scale = Math.min(2, Math.max(0.01, settings.downscalePercent / 100));

	return {
		landscape: effectiveLandscape(settings),
		printBackground: settings.printBackground,
		generateTaggedPDF: settings.generateTaggedPDF,
		pageSize: {
			width: toIn(page.width),
			height: toIn(page.height),
		},
		scale,
		margins: {
			marginType: "custom",
			top: toIn(margins.top),
			bottom: toIn(margins.bottom),
			left: toIn(margins.left),
			right: toIn(margins.right),
		},
		displayHeaderFooter: settings.displayHeader || settings.displayFooter,
		headerTemplate: settings.displayHeader
			? headerFooterHtml(
					settings.header,
					ctx,
					toIn(margins.left),
					toIn(margins.right),
					"header",
					noteFont,
					Boolean(extras?.headerOmitText),
					Math.max(1, extras?.headerLines ?? 1),
				)
			: "<span></span>",
		footerTemplate: settings.displayFooter
			? headerFooterHtml(
					settings.footer,
					ctx,
					toIn(margins.left),
					toIn(margins.right),
					"footer",
					noteFont,
					Boolean(extras?.footerOmitText),
					Math.max(1, extras?.footerLines ?? 1),
				)
			: "<span></span>",
	};
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** One print at a time. Obsidian's print-to-pdf uses the live window title and .print nodes. */
class PrintMutex {
	private tail: Promise<void> = Promise.resolve();

	run<T>(fn: () => Promise<T>): Promise<T> {
		const job = this.tail.then(fn, fn);
		this.tail = job.then(
			() => undefined,
			() => undefined,
		);
		return job;
	}
}

const printMutex = new PrintMutex();

/**
 * Print a `.print` element with Obsidian's built-in print-to-pdf IPC.
 * Chromium writes the PDF to `filepath`; this reads those bytes back.
 */
export async function printElementToPdf(
	printEl: HTMLElement,
	options: Record<string, unknown>,
	filepath: string,
	title: string,
): Promise<Uint8Array> {
	return printMutex.run(async () => {
		const ipc = getIpc(printEl);
		const previousTitle = document.title;
		printEl.addClass("pagina-print-shown");
		document.title = title;
		await sleep(200);

		try {
			await new Promise<void>((resolve, reject) => {
				const timer = window.setTimeout(() => reject(new Error("print-to-pdf timed out")), 60000);
				ipc.once("print-to-pdf", () => {
					window.clearTimeout(timer);
					resolve();
				});
				ipc.send("print-to-pdf", { ...options, filepath });
			});

			try {
				await fs.access(filepath);
			} catch {
				throw new Error(
					"Chromium could not render the PDF. Check page size, margins, and header/footer settings.",
				);
			}
			const data = await fs.readFile(filepath);
			const bytes = new Uint8Array(data.byteLength);
			bytes.set(data);
			return bytes;
		} finally {
			void fs.unlink(filepath).catch(() => undefined);
			printEl.removeClass("pagina-print-shown");
			document.title = previousTitle;
		}
	});
}
