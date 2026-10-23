import { effectiveVerticalMargins } from "./header-footer-layout";

/** Page size presets in millimetres [width, height]. */
export const PAGE_SIZE_PRESETS: Record<string, [number, number]> = {
	A0: [841, 1189],
	A1: [594, 841],
	A2: [420, 594],
	A3: [297, 420],
	A4: [210, 297],
	A5: [148, 210],
	A6: [105, 148],
	// Values from print dialogs listed as 0.1 mm → converted to mm
	Letter: [215.9, 279.4],
	Tabloid: [279.4, 431.8],
	Ledger: [431.8, 279.4],
	Legal: [215.9, 355.6],
	Executive: [184.2, 266.7],
	"11x17": [279.4, 431.8],
	Screen: [165.1, 131.5],
	"ANSI C": [431.8, 558.8],
	"ARCH A": [228.6, 304.8],
	"ARCH B": [304.8, 457.2],
	"ISO B5": [176, 250.1],
	"ISO B4": [250.1, 353.1],
	C5: [161.9, 228.9],
	"JIS B4": [257.1, 364],
	"JIS B3": [364, 515],
	"Slide 7.5 × 10": [190.5, 254],
	"PostScript Custom Page Size": [210, 297],
};

export const PAGE_SIZE_OPTIONS = [...Object.keys(PAGE_SIZE_PRESETS), "Custom"] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/** Margin presets in mm: top, bottom, left, right. */
export const MARGIN_PRESETS: Record<string, [number, number, number, number]> = {
	Normal: [25.4, 25.4, 25.4, 25.4],
	Narrow: [12.7, 12.7, 12.7, 12.7],
	Moderate: [25.4, 25.4, 19.1, 19.1],
	Wide: [25.4, 25.4, 50.8, 50.8],
	Default: [18, 18, 23, 23],
};

export const MARGIN_OPTIONS = [...Object.keys(MARGIN_PRESETS), "Custom"] as const;
export type MarginOption = (typeof MARGIN_OPTIONS)[number];

export function resolvePageSizeMm(
	preset: string,
	customWidth: number,
	customHeight: number,
	landscape: boolean,
): { width: number; height: number } {
	let width: number;
	let height: number;
	if (preset === "Custom") {
		width = Math.max(1, customWidth);
		height = Math.max(1, customHeight);
		if (landscape && width < height) {
			return { width: height, height: width };
		}
		if (!landscape && width > height) {
			return { width: height, height: width };
		}
		return { width, height };
	}
	const size = PAGE_SIZE_PRESETS[preset] ?? PAGE_SIZE_PRESETS.A4!;
	const shortSide = Math.min(size[0], size[1]);
	const longSide = Math.max(size[0], size[1]);
	if (landscape) {
		return { width: longSide, height: shortSide };
	}
	return { width: shortSide, height: longSide };
}

const MIN_PRINTABLE_MM = 20;

function formatMm(n: number): string {
	const rounded = Math.round(n * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Returns a user-facing message when margins do not fit the page.
 * Chromium rejects printToPDF when margins are greater than or equal to the page size.
 */
export function validateLayout(
	page: { width: number; height: number },
	margins: { top: number; bottom: number; left: number; right: number },
	pageName = "page",
): string | null {
	const { top, bottom, left, right } = margins;
	if ([top, bottom, left, right].some((n) => !Number.isFinite(n) || n < 0)) {
		return "Margins must be zero or greater. Reduce the margins in Pagina settings.";
	}
	const horizontal = left + right;
	const vertical = top + bottom;
	if (horizontal >= page.width) {
		return `Left + right margins (${formatMm(horizontal)} mm) are wider than the ${pageName} page (${formatMm(page.width)} mm). Reduce the margins in Pagina settings.`;
	}
	if (vertical >= page.height) {
		return `Top + bottom margins (${formatMm(vertical)} mm) are taller than the ${pageName} page (${formatMm(page.height)} mm). Reduce the margins in Pagina settings.`;
	}
	if (page.width - horizontal < MIN_PRINTABLE_MM) {
		return `Left + right margins leave less than ${MIN_PRINTABLE_MM} mm of printable width on the ${pageName} page (${formatMm(page.width)} mm). Reduce the margins in Pagina settings.`;
	}
	if (page.height - vertical < MIN_PRINTABLE_MM) {
		return `Top + bottom margins leave less than ${MIN_PRINTABLE_MM} mm of printable height on the ${pageName} page (${formatMm(page.height)} mm). Reduce the margins in Pagina settings.`;
	}
	return null;
}

/** Cheat sheet forces landscape without changing the saved orientation. */
export function effectiveLandscape(input: { landscape?: boolean; cheatSheet?: boolean }): boolean {
	return input.cheatSheet === true || input.landscape === true;
}

export interface LayoutInput {
	pageSize: string;
	customPageWidthMm: number;
	customPageHeightMm: number;
	landscape: boolean;
	cheatSheet?: boolean;
	marginPreset: string;
	customMarginTopMm: number;
	customMarginBottomMm: number;
	customMarginLeftMm: number;
	customMarginRightMm: number;
	displayHeader?: boolean;
	displayFooter?: boolean;
	header?: { borderStyle?: string };
	footer?: { borderStyle?: string };
}

/**
 * User margins plus the vertical space of the header and footer rules.
 * Chromium draws those rules inside the top and bottom margin boxes.
 */
export function resolvePrintMarginsMm(input: LayoutInput): {
	top: number;
	bottom: number;
	left: number;
	right: number;
} {
	const margins = resolveMarginsMm(input.marginPreset, {
		top: input.customMarginTopMm,
		bottom: input.customMarginBottomMm,
		left: input.customMarginLeftMm,
		right: input.customMarginRightMm,
	});
	const vertical = effectiveVerticalMargins(
		margins,
		{ display: Boolean(input.displayHeader), borderStyle: input.header?.borderStyle },
		{ display: Boolean(input.displayFooter), borderStyle: input.footer?.borderStyle },
	);
	return {
		top: vertical.top,
		bottom: vertical.bottom,
		left: margins.left,
		right: margins.right,
	};
}

/** Layout check using the page orientation Chromium will actually print. */
export function layoutWarning(input: LayoutInput): string | null {
	const page = resolvePageSizeMm(
		input.pageSize,
		input.customPageWidthMm,
		input.customPageHeightMm,
		effectiveLandscape(input),
	);
	return validateLayout(page, resolvePrintMarginsMm(input), input.pageSize);
}

export function resolveMarginsMm(
	preset: string,
	custom: { top: number; bottom: number; left: number; right: number },
): { top: number; bottom: number; left: number; right: number } {
	if (preset === "Custom") {
		return { ...custom };
	}
	const m = MARGIN_PRESETS[preset] ?? MARGIN_PRESETS.Default!;
	return { top: m[0], bottom: m[1], left: m[2], right: m[3] };
}
