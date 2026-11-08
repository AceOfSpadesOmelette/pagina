import { borderExtentMm } from "./header-borders";
import { RULE_GAP_DEFAULT_MM, SLOT_FONT_DEFAULT_PT } from "./types";

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
export const TEXT_BORDER_GAP_MM = RULE_GAP_DEFAULT_MM;

/** Header baseline, measured from the top of the page. `marginTopMm` is the empty frame. */
export function headerBaselineFromTopMm(fontSizePt = SLOT_FONT_DEFAULT_PT, marginTopMm = 0): number {
	return marginTopMm + descenderMm(fontSizePt) / 2 + emMm(fontSizePt) * 0.8;
}

/** Footer baseline, measured from the bottom of the page. `marginBottomMm` is the empty frame. */
export function footerBaselineFromBottomMm(fontSizePt = SLOT_FONT_DEFAULT_PT, marginBottomMm = 0): number {
	return marginBottomMm + descenderMm(fontSizePt) / 2 + emMm(fontSizePt) * 0.2;
}
/** Space between the border and the note body. */
export const CLEARANCE_MM = 1.0;

export function bandHeightMm(
	borderStyle: string | undefined,
	lines = 1,
	fontSizePt = SLOT_FONT_DEFAULT_PT,
	gapMm = TEXT_BORDER_GAP_MM,
): number {
	const count = Math.max(1, lines);
	const gap = Number.isFinite(gapMm) && gapMm >= 0 ? gapMm : TEXT_BORDER_GAP_MM;
	return lineMm(fontSizePt) * count + gap + borderExtentMm(borderStyle);
}

export function requiredMarginMm(borderStyle: string | undefined, lines = 1, fontSizePt = SLOT_FONT_DEFAULT_PT): number {
	return FRAME_INSET_MM + bandHeightMm(borderStyle, lines, fontSizePt) + CLEARANCE_MM;
}

export function mmToCssPx(mm: number): number {
	return Math.round((mm / 25.4) * 96 * 100) / 100;
}
