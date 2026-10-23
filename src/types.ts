import { normalizeBorderStyle, type HeaderBorderStyle } from "./header-borders";

export interface HeaderFooterSlots {
	left: string;
	center: string;
	right: string;
	borderStyle?: HeaderBorderStyle;
	borderColor?: string;
	textColor?: string;
	/** CSS font-family name. Blank uses the font of the open note. */
	fontFamily?: string;
	/** Applied to a plain {{datetime}}. An explicit {{datetime:FORMAT}} still wins. */
	datetimeFormat?: DatetimeFormat;
}

export type DatetimeFormat =
	| "locale"
	| "EPOCH"
	| "YYYYMMDD"
	| "YYYY-MM-DD"
	| "YYYYMMDD-HHMMSS"
	| "YYYY-MM-DD HH:MM"
	| "YYYY-MM-DD HH:MM:SS";

export const DATETIME_FORMATS: { id: DatetimeFormat; label: string }[] = [
	{ id: "locale", label: "System default" },
	{ id: "EPOCH", label: "EPOCH" },
	{ id: "YYYYMMDD", label: "YYYYMMDD" },
	{ id: "YYYY-MM-DD", label: "YYYY-MM-DD" },
	{ id: "YYYYMMDD-HHMMSS", label: "YYYYMMDD-HHMMSS" },
	{ id: "YYYY-MM-DD HH:MM", label: "YYYY-MM-DD HH:MM" },
	{ id: "YYYY-MM-DD HH:MM:SS", label: "YYYY-MM-DD HH:MM:SS" },
];

export type MaxHeadingLevel = "1" | "2" | "3" | "4" | "5" | "6";

/** Compact keeps each line. Continuous joins text into one run. */
export type CheatSheetDensity = "compact" | "continuous";

export const CHEAT_SHEET_FONT_MIN_PT = 6;
export const CHEAT_SHEET_FONT_MAX_PT = 14;
export const CHEAT_SHEET_FONT_DEFAULT_PT = 8;

export type TimestampFormat = "none" | "EPOCH" | "YYYYMMDD" | "YYYY-MM-DD" | "YYYYMMDD-HHMMSS";

export interface PaginaSettings {
	includeFileNameAsTitle: boolean;
	/** Start a new PDF page at each body H1 (excludes the file-name title). */
	pageBreakBeforeH1: boolean;
	/** Horizontally center body H1s in the PDF (excludes the file-name title). */
	centerH1: boolean;
	/** Underline body H1s in the PDF (excludes the file-name title). */
	underlineH1: boolean;
	pageSize: string;
	customPageWidthMm: number;
	customPageHeightMm: number;
	marginPreset: string;
	customMarginTopMm: number;
	customMarginBottomMm: number;
	customMarginLeftMm: number;
	customMarginRightMm: number;
	downscalePercent: number;
	landscape: boolean;
	/** Landscape, three columns. Does not change the saved orientation. */
	cheatSheet: boolean;
	cheatSheetDensity: CheatSheetDensity;
	/** Body text size in points while the cheat sheet is on. */
	cheatSheetFontSizePt: number;
	/** Headings use the body size. They stay bold. */
	cheatSheetUniformText: boolean;
	displayHeader: boolean;
	header: HeaderFooterSlots;
	displayFooter: boolean;
	footer: HeaderFooterSlots;
	openAfterExport: boolean;
	printBackground: boolean;
	generateTaggedPDF: boolean;
	maxHeadingLevel: MaxHeadingLevel;
	pdfMetadata: boolean;
	timestampFormat: TimestampFormat;
	/** Show a PDF preview in the export dialog. Off skips the slow raster on phones. */
	enablePreview: boolean;
}

export const DEFAULT_SETTINGS: PaginaSettings = {
	includeFileNameAsTitle: true,
	pageBreakBeforeH1: false,
	centerH1: false,
	underlineH1: false,
	pageSize: "A4",
	customPageWidthMm: 210,
	customPageHeightMm: 297,
	marginPreset: "Default",
	customMarginTopMm: 18,
	customMarginBottomMm: 18,
	customMarginLeftMm: 23,
	customMarginRightMm: 23,
	downscalePercent: 100,
	landscape: false,
	cheatSheet: false,
	cheatSheetDensity: "compact",
	cheatSheetFontSizePt: CHEAT_SHEET_FONT_DEFAULT_PT,
	cheatSheetUniformText: true,
	displayHeader: false,
	header: {
		left: "",
		center: "{{title}}",
		right: "",
		borderStyle: "none",
		borderColor: "#000000",
		textColor: "#555555",
		fontFamily: "",
		datetimeFormat: "locale",
	},
	displayFooter: true,
	footer: {
		left: "",
		center: "{{page}} / {{pages}}",
		right: "",
		borderStyle: "none",
		borderColor: "#000000",
		textColor: "#555555",
		fontFamily: "",
		datetimeFormat: "locale",
	},
	openAfterExport: true,
	printBackground: true,
	generateTaggedPDF: false,
	maxHeadingLevel: "6",
	pdfMetadata: true,
	timestampFormat: "none",
	enablePreview: true,
};

export function normalizeSettings(raw: unknown): PaginaSettings {
	const data = (raw ?? {}) as Partial<PaginaSettings>;
	const level = String(data.maxHeadingLevel ?? DEFAULT_SETTINGS.maxHeadingLevel);
	const maxHeadingLevel = (["1", "2", "3", "4", "5", "6"].includes(level)
		? level
		: "6") as MaxHeadingLevel;

	return {
		...DEFAULT_SETTINGS,
		...data,
		header: normalizeSlots(DEFAULT_SETTINGS.header, data.header),
		footer: normalizeSlots(DEFAULT_SETTINGS.footer, data.footer),
		downscalePercent: clamp(
			typeof data.downscalePercent === "number" ? data.downscalePercent : DEFAULT_SETTINGS.downscalePercent,
			0,
			200,
		),
		maxHeadingLevel,
		pageBreakBeforeH1: data.pageBreakBeforeH1 ?? DEFAULT_SETTINGS.pageBreakBeforeH1,
		centerH1: data.centerH1 ?? DEFAULT_SETTINGS.centerH1,
		underlineH1: data.underlineH1 ?? DEFAULT_SETTINGS.underlineH1,
		printBackground: data.printBackground ?? DEFAULT_SETTINGS.printBackground,
		generateTaggedPDF: data.generateTaggedPDF ?? DEFAULT_SETTINGS.generateTaggedPDF,
		pdfMetadata: data.pdfMetadata ?? DEFAULT_SETTINGS.pdfMetadata,
		enablePreview: data.enablePreview ?? DEFAULT_SETTINGS.enablePreview,
		landscape: data.landscape === true,
		cheatSheet: data.cheatSheet === true,
		cheatSheetDensity: data.cheatSheetDensity === "continuous" ? "continuous" : "compact",
		cheatSheetFontSizePt: clampCheatSheetFontSize(data.cheatSheetFontSizePt),
		cheatSheetUniformText: data.cheatSheetUniformText ?? DEFAULT_SETTINGS.cheatSheetUniformText,
		timestampFormat: (["none", "EPOCH", "YYYYMMDD", "YYYY-MM-DD", "YYYYMMDD-HHMMSS"].includes(
			String(data.timestampFormat),
		)
			? (data.timestampFormat as TimestampFormat)
			: DEFAULT_SETTINGS.timestampFormat),
	};
}

function normalizeSlots(defaults: HeaderFooterSlots, raw?: Partial<HeaderFooterSlots>): HeaderFooterSlots {
	const slots = { ...defaults, ...(raw ?? {}) };
	slots.borderStyle = normalizeBorderStyle(slots.borderStyle);
	slots.datetimeFormat = normalizeDatetimeFormat(slots.datetimeFormat);
	return slots;
}

function normalizeDatetimeFormat(value: unknown): DatetimeFormat {
	const raw = typeof value === "string" ? value : "locale";
	return DATETIME_FORMATS.some((entry) => entry.id === raw) ? (raw as DatetimeFormat) : "locale";
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

export function clampCheatSheetFontSize(value: unknown): number {
	const n = typeof value === "number" && Number.isFinite(value) ? value : CHEAT_SHEET_FONT_DEFAULT_PT;
	return clamp(n, CHEAT_SHEET_FONT_MIN_PT, CHEAT_SHEET_FONT_MAX_PT);
}
