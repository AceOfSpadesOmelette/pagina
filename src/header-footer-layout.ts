import { borderExtentMm } from "./header-borders";

/** Chromium's header and footer frames start this far inside the page edge. */
export const FRAME_INSET_MM = 5.1;
/** 9px running text, in millimetres. */
export const EM_MM = (9 / 96) * 25.4;
/**
 * Extra depth under the baseline. Atkinson Hyperlegible's y, g, and p
 * extend past a 9px line box and were sliced by the rule.
 */
export const DESCENDER_MM = EM_MM * 0.6;
/** Line box: the em square plus room for descenders. */
export const LINE_MM = EM_MM + DESCENDER_MM;
/** Space between the text and its border. */
export const TEXT_BORDER_GAP_MM = 0.8;

/** Header baseline, measured from the top of the page. */
export function headerBaselineFromTopMm(): number {
	return FRAME_INSET_MM + DESCENDER_MM / 2 + EM_MM * 0.8;
}

/** Footer baseline, measured from the bottom of the page. */
export function footerBaselineFromBottomMm(): number {
	return FRAME_INSET_MM + DESCENDER_MM / 2 + EM_MM * 0.2;
}
/** Space between the border and the note body. */
export const CLEARANCE_MM = 1.0;

export function bandHeightMm(borderStyle: string | undefined): number {
	return LINE_MM + TEXT_BORDER_GAP_MM + borderExtentMm(borderStyle);
}

export function requiredMarginMm(borderStyle: string | undefined): number {
	return FRAME_INSET_MM + bandHeightMm(borderStyle) + CLEARANCE_MM;
}

/**
 * Grow the top and bottom margins so the header and footer bands, including
 * Chromium's frame inset, stay outside the note body. The user's margin is the minimum.
 */
export function effectiveVerticalMargins(
	user: { top: number; bottom: number },
	header: { display: boolean; borderStyle?: string },
	footer: { display: boolean; borderStyle?: string },
): { top: number; bottom: number } {
	return {
		top: header.display ? Math.max(user.top, requiredMarginMm(header.borderStyle)) : user.top,
		bottom: footer.display ? Math.max(user.bottom, requiredMarginMm(footer.borderStyle)) : user.bottom,
	};
}

export function mmToCssPx(mm: number): number {
	return Math.round((mm / 25.4) * 96 * 100) / 100;
}
