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

export type TimestampFormat = "none" | "EPOCH" | "YYYYMMDD" | "YYYY-MM-DD" | "YYYYMMDD-HHMMSS";

export interface PaginaSettings {
	includeFileNameAsTitle: boolean;
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
}

export const DEFAULT_SETTINGS: PaginaSettings = {
	includeFileNameAsTitle: true,
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
		printBackground: data.printBackground ?? DEFAULT_SETTINGS.printBackground,
		generateTaggedPDF: data.generateTaggedPDF ?? DEFAULT_SETTINGS.generateTaggedPDF,
		pdfMetadata: data.pdfMetadata ?? DEFAULT_SETTINGS.pdfMetadata,
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
	const raw = String(value ?? "locale");
	return DATETIME_FORMATS.some((entry) => entry.id === raw) ? (raw as DatetimeFormat) : "locale";
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}
