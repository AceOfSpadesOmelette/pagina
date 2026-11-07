import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { borderExtentMm, drawBorderBand } from "./header-borders";
import { bandHeightMm, footerBaselineFromBottomMm, headerBaselineFromTopMm, lineMm, TEXT_BORDER_GAP_MM } from "./header-footer-layout";
import { resolveFrameMarginsMm } from "./page-presets";
import { slotSpansForTexts, wrapSlotText } from "./slot-wrap";
import { slotFontPt, type HeaderFooterSlots, type PaginaSettings } from "./types";
import { renderTemplate, type VariableContext } from "./variables";

/**
 * CFF faces (`OTTO`) must be embedded whole. Subsetting them writes a
 * CIDFontType0C program that Chromium's PDF viewer replaces with a serif.
 * TrueType faces keep the subset path.
 */
export function embedFullFace(bytes: Uint8Array): boolean {
	return bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f;
}

export interface StampOptions {
	/** Paint out Chromium's header or footer text before drawing a replacement. */
	cover?: boolean;
	/** Use Helvetica when that edge has no embedded font. */
	standardFallback?: boolean;
	/** {{section}} text for each page, in order. */
	sections?: readonly string[];
	/** Reserved lines. The rule is drawn above this band, with the stamped text. */
	headerLines?: number;
	footerLines?: number;
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
			if (embedFullFace(data)) {
				font = await doc.embedFont(data, { subset: false });
			} else {
				try {
					font = await doc.embedFont(data, { subset: true });
				} catch (error) {
					console.error("Pagina: could not subset the header or footer font; embedding the full face", error);
					font = await doc.embedFont(data, { subset: false });
				}
			}
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
	const margins = resolveFrameMarginsMm(settings);
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
		const { height, width } = page.getSize();
		const pageHeightMm = height / mm(1);
		const contentWidthMm = Math.max(0, width / mm(1) - margins.left - margins.right);
		if (settings.displayHeader && headerFont) {
			const headerPt = slotFontPt(settings.header.fontSizePx);
			const headerCover =
				margins.top + bandHeightMm(settings.header.borderStyle, options?.headerLines, headerPt);
			if (options?.cover && !fonts.header) coverEdge(page, "header", headerCover);
			if (fonts.header) {
				drawEdgeRule(
					page,
					height,
					settings.header,
					margins.left,
					contentWidthMm,
					headerRuleTopMm(margins.top, headerPt, options?.headerLines),
				);
			}
			drawEdge(
				page,
				headerFont,
				settings.header,
				pageCtx,
				margins,
				height - mm(headerBaselineFromTopMm(headerPt, margins.top)),
				"header",
			);
		}
		if (settings.displayFooter && footerFont) {
			const footerPt = slotFontPt(settings.footer.fontSizePx);
			const footerCover =
				margins.bottom + bandHeightMm(settings.footer.borderStyle, options?.footerLines, footerPt);
			if (options?.cover && !fonts.footer) coverEdge(page, "footer", footerCover);
			if (fonts.footer) {
				drawEdgeRule(
					page,
					height,
					settings.footer,
					margins.left,
					contentWidthMm,
					footerRuleTopMm(pageHeightMm, margins.bottom, footerPt, options?.footerLines, settings.footer.borderStyle),
				);
			}
			drawEdge(
				page,
				footerFont,
				settings.footer,
				pageCtx,
				margins,
				mm(footerBaselineFromBottomMm(footerPt, margins.bottom)),
				"footer",
			);
		}
	}
	return doc.save();
}

function headerRuleTopMm(marginTopMm: number, fontSizePt: number, lines: number | undefined): number {
	return marginTopMm + lineMm(fontSizePt) * Math.max(1, lines ?? 1) + TEXT_BORDER_GAP_MM;
}

function footerRuleTopMm(
	pageHeightMm: number,
	marginBottomMm: number,
	fontSizePt: number,
	lines: number | undefined,
	borderStyle: unknown,
): number {
	return (
		pageHeightMm -
		marginBottomMm -
		lineMm(fontSizePt) * Math.max(1, lines ?? 1) -
		TEXT_BORDER_GAP_MM -
		borderExtentMm(borderStyle)
	);
}

function drawEdgeRule(
	page: PDFPage,
	pageHeightPt: number,
	slots: HeaderFooterSlots,
	xMm: number,
	widthMm: number,
	yTopMm: number,
): void {
	drawBorderBand(page, pageHeightPt, slots.borderStyle, slots.borderColor, xMm, yTopMm, widthMm);
}

/** Cover the running text, and stop short of the border rule. */
function coverEdge(page: PDFPage, edge: "header" | "footer", coverMm: number): void {
	const { width, height } = page.getSize();
	const band = mm(coverMm);
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
	edge: "header" | "footer",
): void {
	const slotCtx = { ...ctx, datetimeFormat: slots.datetimeFormat };
	const width = page.getWidth();
	const left = mm(margins.left);
	const content = Math.max(0, width - mm(margins.left) - mm(margins.right));
	const color = parseColor(slots.textColor || "#555555");
	const fontPt = slotFontPt(slots.fontSizePx);
	const lineAdvance = mm(lineMm(fontPt));
	const widthOf = (sample: string): number | null => {
		try {
			return font.widthOfTextAtSize(sample, fontPt);
		} catch {
			return null;
		}
	};
	const texts = [slots.left, slots.center, slots.right].map((template) =>
		renderTemplate(template, slotCtx),
	) as [string, string, string];
	const spans = slotSpansForTexts(content, texts, widthOf);
	const draw = (
		text: string,
		span: { width: number; left: number },
		align: "left" | "center" | "right",
	) => {
		const lines = wrapSlotText(text, widthOf, span.width);
		lines.forEach((line, index) => {
			let textWidth = 0;
			try {
				textWidth = font.widthOfTextAtSize(line, fontPt);
			} catch {
				return;
			}
			const slotLeft = left + span.left;
			let x = slotLeft;
			if (align === "center") x = slotLeft + (span.width - textWidth) / 2;
			if (align === "right") x = slotLeft + span.width - textWidth;
			const y = edge === "header" ? baseline - index * lineAdvance : baseline + index * lineAdvance;
			page.drawText(line, { x, y, size: fontPt, font, color });
		});
	};
	draw(texts[0], spans[0], "left");
	draw(texts[1], spans[1], "center");
	draw(texts[2], spans[2], "right");
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
