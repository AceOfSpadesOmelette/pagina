import { borderExtentMm } from "./header-borders";
import { SLOT_FONT_DEFAULT_PT } from "./types";

/** Chromium's header and footer frames start this far inside the page edge. */
export const FRAME_INSET_MM = 5.1;

/** One em in millimetres for a point size. 6.75pt is 9px at 96dpi. */
export function emMm(fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	return (fontSizePt * 25.4) / 72;
}

/**
 * Extra depth under the baseline. Atkinson Hyperlegible's y, g, and p
 * extend past a single em and were sliced by the rule. The extra room stays
 * 0.6 of the em.
 */
export function descenderMm(fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	return emMm(fontSizePt) * 0.6;
}

/** Line box: the em square plus room for descenders. */
export function lineMm(fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	return emMm(fontSizePt) + descenderMm(fontSizePt);
}

/** 9px running text, in millimetres. */
export const EM_MM = emMm();
export const DESCENDER_MM = descenderMm();
export const LINE_MM = lineMm();
/** Space between the text and its border. */
export const TEXT_BORDER_GAP_MM = 0.8;

/** Header baseline, measured from the top of the page. */
export function headerBaselineFromTopMm(fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	return FRAME_INSET_MM + descenderMm(fontSizePt) / 2 + emMm(fontSizePt) * 0.8;
}

/** Footer baseline, measured from the bottom of the page. */
export function footerBaselineFromBottomMm(fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	return FRAME_INSET_MM + descenderMm(fontSizePt) / 2 + emMm(fontSizePt) * 0.2;
}
/** Space between the border and the note body. */
export const CLEARANCE_MM = 1.0;

export function bandHeightMm(borderStyle: string | undefined, lines = 1, fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	const count = Math.max(1, lines);
	return lineMm(fontSizePt) * count + TEXT_BORDER_GAP_MM + borderExtentMm(borderStyle);
}

export function requiredMarginMm(borderStyle: string | undefined, lines = 1, fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	return FRAME_INSET_MM + bandHeightMm(borderStyle, lines, fontSizePt) + CLEARANCE_MM;
}

/**
 * Grow the top and bottom margins so the header and footer bands, including
 * Chromium's frame inset, stay outside the note body. The user's margin is the minimum.
 * A larger footer deepens only the bottom margin.
 */
export function effectiveVerticalMargins(
	user: { top: number; bottom: number },
	header: { display: boolean; borderStyle?: string; lines?: number; fontSizePt?: number },
	footer: { display: boolean; borderStyle?: string; lines?: number; fontSizePt?: number },
): { top: number; bottom: number } {
	return {
		top: header.display ? Math.max(user.top, requiredMarginMm(header.borderStyle, header.lines, header.fontSizePt)) : user.top,
		bottom: footer.display ? Math.max(user.bottom, requiredMarginMm(footer.borderStyle, footer.lines, footer.fontSizePt)) : user.bottom,
	};
}

export function mmToCssPx(mm: number): number {
	return Math.round((mm / 25.4) * 96 * 100) / 100;
}
