import { bandHeightMm } from "./header-footer-layout";
import type { PaginaSettings } from "./types";
import { effectiveLandscape, resolvePageSizeMm, resolvePrintMarginsMm } from "./page-presets";

/** CSS reference pixel density used by html2canvas layout. */
export const CSS_DPI = 96;
export const MM_PER_INCH = 25.4;

export function mmToPx(mm: number): number {
	return (mm / MM_PER_INCH) * CSS_DPI;
}

export function pxToMm(px: number): number {
	return (px / CSS_DPI) * MM_PER_INCH;
}

export interface PageLayout {
	pageWidthMm: number;
	pageHeightMm: number;
	marginTopMm: number;
	marginBottomMm: number;
	marginLeftMm: number;
	marginRightMm: number;
	/** Usable content width (between side margins), mm */
	contentWidthMm: number;
	/** Usable content height (between top/bottom margins, minus header/footer bands), mm */
	contentHeightMm: number;
	headerBandMm: number;
	footerBandMm: number;
	/** Lines reserved in the header band. Short pages still use the first line only. */
	headerLines: number;
	footerLines: number;
	scale: number;
	contentWidthPx: number;
	contentHeightPx: number;
}

export function computePageLayout(
	settings: PaginaSettings,
	bands?: { headerLines?: number; footerLines?: number },
): PageLayout {
	const page = resolvePageSizeMm(
		settings.pageSize,
		settings.customPageWidthMm,
		settings.customPageHeightMm,
		effectiveLandscape(settings),
	);
	const headerLines = Math.max(1, bands?.headerLines ?? 1);
	const footerLines = Math.max(1, bands?.footerLines ?? 1);
	const margins = resolvePrintMarginsMm({
		...settings,
		header: { borderStyle: settings.header.borderStyle, lines: headerLines },
		footer: { borderStyle: settings.footer.borderStyle, lines: footerLines },
	});

	const headerBandMm = settings.displayHeader ? bandHeightMm(settings.header.borderStyle, headerLines) : 0;
	const footerBandMm = settings.displayFooter ? bandHeightMm(settings.footer.borderStyle, footerLines) : 0;

	const contentWidthMm = Math.max(1, page.width - margins.left - margins.right);
	const contentHeightMm = Math.max(1, page.height - margins.top - margins.bottom);

	const scale = Math.max(0, settings.downscalePercent) / 100;
	// Content is laid out at unscaled width; visual scale applied at capture time.
	const layoutScale = scale <= 0 ? 0.01 : scale;
	const contentWidthPx = mmToPx(contentWidthMm) / layoutScale;
	const contentHeightPx = mmToPx(contentHeightMm) / layoutScale;

	return {
		pageWidthMm: page.width,
		pageHeightMm: page.height,
		marginTopMm: margins.top,
		marginBottomMm: margins.bottom,
		marginLeftMm: margins.left,
		marginRightMm: margins.right,
		contentWidthMm,
		contentHeightMm,
		headerBandMm,
		footerBandMm,
		headerLines,
		footerLines,
		scale: layoutScale,
		contentWidthPx,
		contentHeightPx,
	};
}
