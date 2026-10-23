import {
	App,
	Notice,
	PluginSettingTab,
	type SettingDefinition,
	type SettingDefinitionItem,
} from "obsidian";
import { HEADER_BORDERS, type HeaderBorderStyle } from "./header-borders";
import { obsidianFontLabel } from "./electron-pdf";
import { layoutWarning, MARGIN_OPTIONS, PAGE_SIZE_OPTIONS } from "./page-presets";
import { isPhoneSession } from "./session";
import { applyImportedSettings, downloadSettingsJson, parseSettingsJson } from "./settings-io";
import {
	clampCheatSheetFontSize,
	DATETIME_FORMATS,
	type DatetimeFormat,
	type HeaderFooterSlots,
	type MaxHeadingLevel,
	type PaginaSettings,
	type TimestampFormat,
} from "./types";
import { VARIABLE_HINT } from "./variables";
import type PaginaPlugin from "./main";

const HEADING_LEVELS = ["1", "2", "3", "4", "5", "6"] as const;
const TIMESTAMP_FORMATS = ["none", "EPOCH", "YYYYMMDD", "YYYY-MM-DD", "YYYYMMDD-HHMMSS"] as const;

function recordOptions(values: readonly string[]): Record<string, string> {
	const options: Record<string, string> = {};
	for (const value of values) options[value] = value;
	return options;
}

function isHeadingLevel(value: unknown): value is MaxHeadingLevel {
	return typeof value === "string" && (HEADING_LEVELS as readonly string[]).includes(value);
}

function isTimestampFormat(value: unknown): value is TimestampFormat {
	return typeof value === "string" && (TIMESTAMP_FORMATS as readonly string[]).includes(value);
}

function isBorderStyle(value: unknown): value is HeaderBorderStyle {
	return typeof value === "string" && HEADER_BORDERS.some((border) => border.id === value);
}

function isDatetimeFormat(value: unknown): value is DatetimeFormat {
	return typeof value === "string" && DATETIME_FORMATS.some((format) => format.id === value);
}

function isHexColor(value: string): boolean {
	return /^#[0-9a-fA-F]{6}$/.test(value);
}

type SlotField = keyof HeaderFooterSlots;

function slotKey(key: string): { which: "header" | "footer"; field: SlotField } | null {
	const match = /^(header|footer)\.(left|center|right|borderStyle|borderColor|textColor|fontFamily|datetimeFormat)$/.exec(key);
	if (!match) return null;
	return { which: match[1] as "header" | "footer", field: match[2] as SlotField };
}

export class PaginaSettingTab extends PluginSettingTab {
	plugin: PaginaPlugin;

	constructor(app: App, plugin: PaginaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override getControlValue(key: string): unknown {
		if (key === "orientation") return this.plugin.settings.landscape ? "landscape" : "portrait";
		const slot = slotKey(key);
		if (slot) return this.plugin.settings[slot.which][slot.field];
		return super.getControlValue(key);
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		if (key === "orientation") {
			settings.landscape = value === "landscape";
			await this.plugin.saveSettings();
			return;
		}
		const slot = slotKey(key);
		if (slot) {
			if (!this.assignSlot(settings[slot.which], slot.field, value)) return;
			await this.plugin.saveSettings();
			return;
		}
		if (key === "maxHeadingLevel" && !isHeadingLevel(value)) return;
		if (key === "timestampFormat" && !isTimestampFormat(value)) return;
		if (key === "cheatSheetDensity") {
			settings.cheatSheetDensity = value === "continuous" ? "continuous" : "compact";
			await this.plugin.saveSettings();
			return;
		}
		if (key === "cheatSheetFontSizePt") {
			settings.cheatSheetFontSizePt = clampCheatSheetFontSize(value);
			await this.plugin.saveSettings();
			return;
		}
		await super.setControlValue(key, value);
		if (
			key === "pageSize" ||
			key === "marginPreset" ||
			key === "displayHeader" ||
			key === "displayFooter" ||
			key === "cheatSheet"
		) {
			this.update();
		}
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;
		return [
			{
				name: "Export defaults",
				desc: "Default options for Export to PDF. The export dialog starts from these values.",
			},
			{
				name: "Layout",
				desc: layoutWarning(settings) ?? "",
				visible: () => Boolean(layoutWarning(this.plugin.settings)),
			},
			{
				type: "group",
				heading: "Exam cheat sheet",
				items: [
					{
						name: "Exam cheat sheet",
						desc: "Landscape, three columns per page. Page size, margins, headers, and footers stay as set. Turning this off restores your orientation.",
						control: { type: "toggle", key: "cheatSheet" },
					},
					{
						name: "Density",
						desc: "Compact keeps each line and tightens the spacing. Continuous joins paragraphs, lists, and headings into one run. Code, tables, images, math, and diagrams stay as blocks.",
						visible: () => this.plugin.settings.cheatSheet,
						control: {
							type: "dropdown",
							key: "cheatSheetDensity",
							options: { compact: "Compact", continuous: "Continuous" },
						},
					},
					{
						name: "Text size",
						desc: "Points, from 6 to 14. Downscale percent still scales the whole page, including this text.",
						visible: () => this.plugin.settings.cheatSheet,
						control: { type: "slider", key: "cheatSheetFontSizePt", min: 6, max: 14, step: 1 },
					},
					{
						name: "Uniform text size",
						desc: "Use one size for headings and body text. Headings stay bold. Continuous density always uses one size.",
						visible: () => this.plugin.settings.cheatSheet,
						control: { type: "toggle", key: "cheatSheetUniformText" },
					},
				],
			},
			{
				type: "group",
				heading: "Document",
				items: [
					{
						name: "Include file name as title",
						desc: "Center the note name at the top of the export.",
						control: { type: "toggle", key: "includeFileNameAsTitle" },
					},
				],
			},
			{
				type: "group",
				heading: "Heading 1",
				items: [
					{
						name: "Page break before H1",
						desc: "Start a new page at each heading 1 after the first (not the file-name title).",
						control: { type: "toggle", key: "pageBreakBeforeH1" },
					},
					{
						name: "Center H1",
						desc: "Horizontally center heading 1 text (not the file-name title).",
						control: { type: "toggle", key: "centerH1" },
					},
					{
						name: "Underline H1",
						desc: "Underline heading 1 text (not the file-name title).",
						control: { type: "toggle", key: "underlineH1" },
					},
				],
			},
			{
				type: "group",
				heading: "Page",
				items: [
					{
						name: "Page size",
						control: { type: "dropdown", key: "pageSize", options: recordOptions(PAGE_SIZE_OPTIONS) },
					},
					{
						name: "Custom width",
						desc: "Millimeters.",
						visible: () => this.plugin.settings.pageSize === "Custom",
						control: { type: "number", key: "customPageWidthMm", min: 1, placeholder: "width" },
					},
					{
						name: "Custom height",
						desc: "Millimeters.",
						visible: () => this.plugin.settings.pageSize === "Custom",
						control: { type: "number", key: "customPageHeightMm", min: 1, placeholder: "height" },
					},
					{
						name: "Margin",
						desc: "The unit is millimeters.",
						control: { type: "dropdown", key: "marginPreset", options: recordOptions(MARGIN_OPTIONS) },
					},
					...this.marginFields(),
					{
						name: "Downscale percent",
						desc: "Default 100%. Range 0–200.",
						control: { type: "slider", key: "downscalePercent", min: 0, max: 200, step: 1 },
					},
					{
						name: "Reset downscale",
						desc: "Set downscale percent back to 100.",
						action: () => {
							this.plugin.settings.downscalePercent = 100;
							void this.plugin.saveSettings().then(() => this.update());
						},
					},
					{
						name: "Orientation",
						desc: "Portrait is the default.",
						visible: () => !this.plugin.settings.cheatSheet,
						control: {
							type: "dropdown",
							key: "orientation",
							options: { portrait: "Portrait", landscape: "Landscape" },
						},
					},
					{
						name: "Orientation",
						desc: "Exam cheat sheet uses landscape. Your orientation setting is kept for when the cheat sheet is off.",
						visible: () => this.plugin.settings.cheatSheet,
					},
				],
			},
			{
				type: "group",
				heading: "PDF",
				items: [
					{
						name: "Enable PDF preview",
						desc: "Show PDF preview in the export dialog. Turn off to open the dialog immediately on slow devices.",
						visible: () => !isPhoneSession(),
						control: { type: "toggle", key: "enablePreview" },
					},
					{
						name: "Print background",
						desc: "Whether to print background graphics.",
						control: { type: "toggle", key: "printBackground" },
					},
					{
						name: "Generate tagged PDF",
						desc: "Experimental accessible MarkInfo flag. Image-based export may not fully meet PDF/UA.",
						control: { type: "toggle", key: "generateTaggedPDF" },
					},
					{
						name: "Max headings level of the outline",
						desc: "Include headings up to this level in the PDF outline.",
						control: {
							type: "dropdown",
							key: "maxHeadingLevel",
							options: { "1": "h1", "2": "h2", "3": "h3", "4": "h4", "5": "h5", "6": "h6" },
						},
					},
					{
						name: "PDF metadata",
						desc: "Add frontmatter (title, author, keywords, subject, creator) to PDF metadata.",
						control: { type: "toggle", key: "pdfMetadata" },
					},
					{
						name: "Timestamp format",
						desc: "Format for appending a timestamp to the output file name.",
						control: {
							type: "dropdown",
							key: "timestampFormat",
							options: {
								none: "None",
								EPOCH: "EPOCH (Unix timestamp)",
								YYYYMMDD: "YYYYMMDD",
								"YYYY-MM-DD": "YYYY-MM-DD",
								"YYYYMMDD-HHMMSS": "YYYYMMDD-HHMMSS",
							},
						},
					},
				],
			},
			{
				type: "group",
				heading: "Header",
				items: [
					{
						name: "Display header",
						desc: VARIABLE_HINT,
						control: { type: "toggle", key: "displayHeader" },
					},
					...this.slotDefinitions("header", "Header"),
				],
			},
			{
				type: "group",
				heading: "Footer",
				items: [
					{
						name: "Display footer",
						desc: VARIABLE_HINT,
						control: { type: "toggle", key: "displayFooter" },
					},
					...this.slotDefinitions("footer", "Footer"),
				],
			},
			{
				type: "group",
				heading: "Output",
				items: [
					{
						name: "Open after export",
						control: { type: "toggle", key: "openAfterExport" },
					},
				],
			},
			{
				type: "group",
				heading: "Backup",
				items: [
					{
						name: "Export settings",
						desc: "Download the current configuration as JSON.",
						action: () => {
							downloadSettingsJson(this.plugin.settings);
						},
					},
					{
						name: "Import settings",
						desc: "Replace the current configuration from a JSON file.",
						action: () => {
							this.importSettings();
						},
					},
				],
			},
		];
	}

	private marginFields(): SettingDefinition[] {
		const visible = () => this.plugin.settings.marginPreset === "Custom";
		const field = (name: string, key: keyof PaginaSettings, placeholder: string): SettingDefinition => ({
			name,
			desc: "Millimeters.",
			visible,
			control: { type: "number", key, min: 0, placeholder },
		});
		return [
			field("Margin top", "customMarginTopMm", "margin top"),
			field("Margin bottom", "customMarginBottomMm", "margin bottom"),
			field("Margin left", "customMarginLeftMm", "margin left"),
			field("Margin right", "customMarginRightMm", "margin right"),
		];
	}

	private slotDefinitions(which: "header" | "footer", label: string): SettingDefinition[] {
		const visible = () => (which === "header" ? this.plugin.settings.displayHeader : this.plugin.settings.displayFooter);
		const text = (name: string, field: SlotField): SettingDefinition => ({
			name,
			visible,
			control: { type: "text", key: `${which}.${field}` },
		});
		const borders: Record<string, string> = {};
		for (const border of HEADER_BORDERS) borders[border.id] = border.label;
		const formats: Record<string, string> = {};
		for (const format of DATETIME_FORMATS) formats[format.id] = format.label;
		return [
			text(`${label} left`, "left"),
			text(`${label} center`, "center"),
			text(`${label} right`, "right"),
			{
				name: `${label} border style`,
				visible,
				control: { type: "dropdown", key: `${which}.borderStyle`, options: borders },
			},
			{
				name: `${label} border color`,
				visible,
				control: { type: "text", key: `${which}.borderColor`, placeholder: "#000000" },
			},
			{
				name: `${label} text color`,
				visible,
				control: { type: "text", key: `${which}.textColor`, placeholder: "#555555" },
			},
			{
				name: `${label} font`,
				desc: `Leave blank to match Obsidian: ${obsidianFontLabel()}`,
				visible,
				control: { type: "text", key: `${which}.fontFamily`, placeholder: "e.g. Georgia, Times New Roman" },
			},
			{
				name: `${label} date/time format`,
				visible,
				control: { type: "dropdown", key: `${which}.datetimeFormat`, options: formats },
			},
		];
	}

	private assignSlot(slots: HeaderFooterSlots, field: SlotField, value: unknown): boolean {
		if (field === "borderStyle") {
			if (!isBorderStyle(value)) return false;
			slots.borderStyle = value;
			return true;
		}
		if (field === "datetimeFormat") {
			if (!isDatetimeFormat(value)) return false;
			slots.datetimeFormat = value;
			return true;
		}
		if (field === "borderColor" || field === "textColor") {
			if (typeof value !== "string" || (value !== "" && !isHexColor(value))) return false;
			const fallback = field === "borderColor" ? "#000000" : "#555555";
			slots[field] = value || fallback;
			return true;
		}
		if (typeof value !== "string") return false;
		if (field === "fontFamily") slots.fontFamily = value.trim();
		else slots[field] = value;
		return true;
	}

	private importSettings(): void {
		const input = createEl("input", { type: "file", attr: { accept: ".json,application/json" } });
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (!file) return;
			void file.text().then(
				(text) => {
					try {
						applyImportedSettings(this.plugin.settings, parseSettingsJson(text));
						void this.plugin.saveSettings().then(() => {
							this.update();
							new Notice("Pagina settings imported");
						});
					} catch (err) {
						new Notice(err instanceof Error ? err.message : "Could not import settings");
					}
				},
				() => {
					new Notice("Could not read the settings file");
				},
			);
		});
		input.click();
	}
}
