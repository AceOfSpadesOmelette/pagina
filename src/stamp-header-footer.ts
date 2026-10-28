import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { footerBaselineFromBottomMm, FRAME_INSET_MM, headerBaselineFromTopMm, LINE_MM, TEXT_BORDER_GAP_MM } from "./header-footer-layout";
import { resolvePrintMarginsMm } from "./page-presets";
import type { HeaderFooterSlots, PaginaSettings } from "./types";
import { renderTemplate, type VariableContext } from "./variables";

/** 9px at 96dpi, matching the header and footer line. */
const FONT_PT = 6.75;

export interface StampOptions {
	/** Paint out Chromium's header or footer text before drawing a replacement. */
	cover?: boolean;
	/** Use Helvetica when that edge has no embedded font. */
	standardFallback?: boolean;
	/** {{section}} text for each page, in order. */
	sections?: readonly string[];
}

export async function stampHeaderFooter(
	bytes: Uint8Array,
	settings: PaginaSettings,
	ctx: VariableContext,
	fonts: { header: Uint8Array | null; footer: Uint8Array | null },
	options?: StampOptions,
): Promise<Uint8Array> {
	const fallback = options?.standardFallback === true;
	const needsDraw = Boolean(fonts.header || fonts.footer || (fallback && (settings.displayHeader || settings.displayFooter)));
	if (!needsDraw) return bytes;
	const doc = await PDFDocument.load(bytes);
	doc.registerFontkit(fontkit);
	const embedded = new Map<Uint8Array, PDFFont>();
	const fontFor = async (data: Uint8Array): Promise<PDFFont> => {
		let font = embedded.get(data);
		if (!font) {
			font = await doc.embedFont(data, { subset: true });
			embedded.set(data, font);
		}
		return font;
	};
	let standard: PDFFont | null = null;
	const standardFont = async (): Promise<PDFFont> => {
		if (!standard) standard = await doc.embedFont(StandardFonts.Helvetica);
		return standard;
	};
	const headerFont = fonts.header
		? await fontFor(fonts.header)
		: fallback && settings.displayHeader
			? await standardFont()
			: null;
	const footerFont = fonts.footer
		? await fontFor(fonts.footer)
		: fallback && settings.displayFooter
			? await standardFont()
			: null;
	const margins = resolvePrintMarginsMm(settings);
	const pages = doc.getPages();
	const total = pages.length;
	for (let index = 0; index < pages.length; index++) {
		const page = pages[index];
		if (!page) continue;
		const pageCtx: VariableContext = {
			...ctx,
			page: index + 1,
			pages: total,
			section: options?.sections?.[index] ?? ctx.section ?? "",
		};
		const { height } = page.getSize();
		if (settings.displayHeader && headerFont) {
			if (options?.cover && !fonts.header) coverEdge(page, "header");
			drawEdge(
				page,
				headerFont,
				settings.header,
				pageCtx,
				margins,
				height - mm(headerBaselineFromTopMm()),
			);
		}
		if (settings.displayFooter && footerFont) {
			if (options?.cover && !fonts.footer) coverEdge(page, "footer");
			drawEdge(page, footerFont, settings.footer, pageCtx, margins, mm(footerBaselineFromBottomMm()));
		}
	}
	return doc.save();
}

/** Cover the running text, and stop short of the border rule. */
function coverEdge(page: PDFPage, edge: "header" | "footer"): void {
	const { width, height } = page.getSize();
	const band = mm(FRAME_INSET_MM + LINE_MM + TEXT_BORDER_GAP_MM * 0.5);
	if (edge === "header") {
		page.drawRectangle({ x: 0, y: height - band, width, height: band, color: rgb(1, 1, 1) });
		return;
	}
	page.drawRectangle({ x: 0, y: 0, width, height: band, color: rgb(1, 1, 1) });
}

function drawEdge(
	page: PDFPage,
	font: PDFFont,
	slots: HeaderFooterSlots,
	ctx: VariableContext,
	margins: { left: number; right: number },
	baseline: number,
): void {
	const slotCtx = { ...ctx, datetimeFormat: slots.datetimeFormat };
	const width = page.getWidth();
	const left = mm(margins.left);
	const content = Math.max(0, width - mm(margins.left) - mm(margins.right));
	const col = content / 3;
	const color = parseColor(slots.textColor || "#555555");
	const draw = (template: string, slotLeft: number, align: "left" | "center" | "right") => {
		const text = textThatFits(font, renderTemplate(template, slotCtx), FONT_PT, col);
		if (!text) return;
		const textWidth = font.widthOfTextAtSize(text, FONT_PT);
		let x = slotLeft;
		if (align === "center") x = slotLeft + (col - textWidth) / 2;
		if (align === "right") x = slotLeft + col - textWidth;
		page.drawText(text, { x, y: baseline, size: FONT_PT, font, color });
	};
	draw(slots.left, left, "left");
	draw(slots.center, left + col, "center");
	draw(slots.right, left + col * 2, "right");
}

function textThatFits(font: PDFFont, text: string, size: number, maxWidth: number): string {
	if (!text || maxWidth <= 0) return "";
	let kept = "";
	for (const ch of Array.from(text)) {
		const next = kept + ch;
		if (!canMeasure(font, next, size)) continue;
		kept = next;
	}
	if (!kept) return "";
	if (measure(font, kept, size) <= maxWidth) return kept;
	const ellipsis = canMeasure(font, "…", size) ? "…" : "";
	const chars = Array.from(kept);
	while (chars.length > 0) {
		chars.pop();
		const candidate = chars.join("") + ellipsis;
		if (candidate && canMeasure(font, candidate, size) && measure(font, candidate, size) <= maxWidth) {
			return candidate;
		}
	}
	return "";
}

function canMeasure(font: PDFFont, text: string, size: number): boolean {
	try {
		font.widthOfTextAtSize(text, size);
		return true;
	} catch {
		return false;
	}
}

function measure(font: PDFFont, text: string, size: number): number {
	return font.widthOfTextAtSize(text, size);
}

function parseColor(hex: string): ReturnType<typeof rgb> {
	const raw = hex.trim().replace("#", "");
	const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
	const value = Number.parseInt(full, 16);
	if (!Number.isFinite(value) || full.length !== 6) return rgb(0.33, 0.33, 0.33);
	return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function mm(value: number): number {
	return (value * 72) / 25.4;
}
