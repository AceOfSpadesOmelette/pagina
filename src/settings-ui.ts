import { Notice, Setting } from "obsidian";
import { HEADER_BORDERS, type HeaderBorderStyle } from "./header-borders";
import { obsidianFontLabel } from "./electron-pdf";
import { layoutWarning, MARGIN_OPTIONS, PAGE_SIZE_OPTIONS } from "./page-presets";
import { isPhoneSession } from "./session";
import {
	applyImportedSettings,
	downloadSettingsJson,
	parseSettingsJson,
} from "./settings-io";
import { cheatSheetColumnBounds, clampCheatSheetColumns, clampTextPx, clampTitleGapMm, DATETIME_FORMATS, type DatetimeFormat, type HeaderFooterSlots, type PaginaSettings, TEXT_PX_MAX, TEXT_PX_MIN, TEXT_SIZE_DESC } from "./types";
import { VARIABLE_HINT } from "./variables";

export interface NoteTitleField {
	value: string;
	placeholder?: string;
	onChange: (value: string) => void;
}

export interface RenderPaginaSettingsOptions {
	onRebuild: () => void;
	onChange?: () => void | Promise<void>;
	/** Export window only. The plugin settings tab has no per-note title. */
	noteTitle?: NoteTitleField;
}

/**
 * Shared export-defaults UI used by the Community plugins settings tab and the export modal.
 */
export function renderPaginaSettings(
	container: HTMLElement,
	settings: PaginaSettings,
	opts: RenderPaginaSettingsOptions,
): void {
	const warningEl = container.createDiv({ cls: "pagina-layout-warning" });
	const refreshWarning = () => {
		const message = layoutWarning(settings);
		warningEl.setText(message ?? "");
		warningEl.toggle(Boolean(message));
	};
	const notify = () => {
		refreshWarning();
		void opts.onChange?.();
	};
	refreshWarning();

	new Setting(container).setName("Exam cheat sheet").setHeading();

	new Setting(container)
		.setName("Exam cheat sheet")
		.setDesc(
			"Packs the note into 2, 3, or 4 columns. Page size, orientation, margins, headers, and footers stay as set.",
		)
		.addToggle((t) =>
			t.setValue(settings.cheatSheet).onChange((v) => {
				settings.cheatSheet = v;
				notify();
				opts.onRebuild();
			}),
		);

	if (settings.cheatSheet) {
		new Setting(container)
			.setName("Density")
			.setDesc(
				"Compact keeps each line and tightens the spacing. Continuous joins paragraphs, lists, and headings into one run. Code, tables, images, math, and diagrams stay as blocks.",
			)
			.addDropdown((dd) => {
				dd.addOption("compact", "Compact");
				dd.addOption("continuous", "Continuous");
				dd.setValue(settings.cheatSheetDensity).onChange((v) => {
					settings.cheatSheetDensity = v === "continuous" ? "continuous" : "compact";
					notify();
				});
			});

		const columnBounds = cheatSheetColumnBounds();
		new Setting(container)
			.setName("Columns")
			.setDesc("Two, three, or four columns in either orientation.")
			.addDropdown((dd) => {
				for (let n = columnBounds.min; n <= columnBounds.max; n++) dd.addOption(String(n), String(n));
				dd.setValue(String(clampCheatSheetColumns(settings.cheatSheetColumns))).onChange((v) => {
					settings.cheatSheetColumns = clampCheatSheetColumns(Number(v));
					notify();
				});
			});

		new Setting(container)
			.setName("Uniform text size")
			.setDesc("Use one size for headings and body text. Headings stay bold. Continuous density always uses one size.")
			.addToggle((t) =>
				t.setValue(settings.cheatSheetUniformText).onChange((v) => {
					settings.cheatSheetUniformText = v;
					notify();
				}),
			);
	}

	new Setting(container).setName("Document").setHeading();

	new Setting(container)
		.setName("Body text size")
		.setDesc(`${TEXT_SIZE_DESC} A normal export keeps the note's size until you change this.`)
		.addText((text) => {
			text.inputEl.type = "number";
			text.inputEl.min = String(TEXT_PX_MIN);
			text.inputEl.max = String(TEXT_PX_MAX);
			text.inputEl.step = "1";
			text.setValue(String(settings.bodyFontSizePx)).onChange((value) => {
				if (value.trim() === "" || !Number.isFinite(Number(value))) return;
				settings.bodyFontSizePx = clampTextPx(value, settings.bodyFontSizePx);
				settings.applyBodyFontSize = true;
				notify();
			});
		});

	new Setting(container)
		.setName("Include note title")
		.setDesc("Show the note title at the top of the export.")
		.addToggle((t) =>
			t.setValue(settings.includeFileNameAsTitle).onChange((v) => {
				settings.includeFileNameAsTitle = v;
				notify();
				opts.onRebuild();
			}),
		);

	const noteTitle = opts.noteTitle;
	if (settings.includeFileNameAsTitle && noteTitle) {
		addWrappedText(new Setting(container).setName("Note title").setDesc(
			"Printed at the top and used for {{title}}. Leave blank to use the file name. This is not saved into the note.",
		), {
			value: noteTitle.value,
			placeholder: noteTitle.placeholder,
			rows: 2,
			onChange: (value) => {
				noteTitle.onChange(value);
				notify();
			},
		});
	}

	if (settings.includeFileNameAsTitle) {
		new Setting(container)
			.setName("Center note title")
			.setDesc("Horizontally center the note title.")
			.addToggle((t) =>
				t.setValue(settings.centerNoteTitle).onChange((v) => {
					settings.centerNoteTitle = v;
					notify();
				}),
			);
		new Setting(container)
			.setName("Space above note title")
			.setDesc("Millimetres between the header and the note title. Heading 1 is unchanged.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.step = "0.5";
				text.setValue(String(settings.noteTitleGapMm)).onChange((value) => {
					if (value.trim() === "" || !Number.isFinite(Number(value))) return;
					settings.noteTitleGapMm = clampTitleGapMm(value);
					notify();
				});
			});
	}

	new Setting(container)
		.setName("Include properties")
		.setDesc("Print the note's properties under the title.")
		.addToggle((t) =>
			t.setValue(settings.showProperties).onChange((v) => {
				settings.showProperties = v;
				notify();
			}),
		);

	new Setting(container).setName("Heading 1").setHeading();

	new Setting(container)
		.setName("Page break before h1")
		.setDesc("Start a new page at each heading 1 after the first (not the note title).")
		.addToggle((t) =>
			t.setValue(settings.pageBreakBeforeH1).onChange((v) => {
				settings.pageBreakBeforeH1 = v;
				notify();
			}),
		);

	new Setting(container)
		.setName("Center h1")
		.setDesc("Horizontally center heading 1 text (not the note title).")
		.addToggle((t) =>
			t.setValue(settings.centerH1).onChange((v) => {
				settings.centerH1 = v;
				notify();
			}),
		);

	new Setting(container)
		.setName("Underline h1")
		.setDesc("Underline heading 1 text (not the note title).")
		.addToggle((t) =>
			t.setValue(settings.underlineH1).onChange((v) => {
				settings.underlineH1 = v;
				notify();
			}),
		);

	new Setting(container).setName("Page").setHeading();

	new Setting(container)
		.setName("Page size")
		.addDropdown((dd) => {
			for (const opt of PAGE_SIZE_OPTIONS) {
				dd.addOption(opt, opt);
			}
			dd.setValue(settings.pageSize).onChange((v) => {
				settings.pageSize = v;
				notify();
				opts.onRebuild();
			});
		});

	if (settings.pageSize === "Custom") {
		addPairedText(
			container,
			"Width/Height",
			{
				placeholder: "width",
				value: String(settings.customPageWidthMm),
				onChange: (v) => setPositive(v, (n) => (settings.customPageWidthMm = n), notify),
			},
			{
				placeholder: "height",
				value: String(settings.customPageHeightMm),
				onChange: (v) => setPositive(v, (n) => (settings.customPageHeightMm = n), notify),
			},
		);
	}

	new Setting(container)
		.setName("Margin")
		.setDesc("The unit is millimeters.")
		.addDropdown((dd) => {
			for (const opt of MARGIN_OPTIONS) {
				dd.addOption(opt, opt);
			}
			dd.setValue(settings.marginPreset).onChange((v) => {
				settings.marginPreset = v;
				notify();
				opts.onRebuild();
			});
		});

	if (settings.marginPreset === "Custom") {
		addPairedText(
			container,
			"Top/Bottom",
			{
				placeholder: "margin top",
				value: String(settings.customMarginTopMm),
				onChange: (v) => setNonNegative(v, (n) => (settings.customMarginTopMm = n), notify),
			},
			{
				placeholder: "margin bottom",
				value: String(settings.customMarginBottomMm),
				onChange: (v) => setNonNegative(v, (n) => (settings.customMarginBottomMm = n), notify),
			},
		);
		addPairedText(
			container,
			"Left/Right",
			{
				placeholder: "margin left",
				value: String(settings.customMarginLeftMm),
				onChange: (v) => setNonNegative(v, (n) => (settings.customMarginLeftMm = n), notify),
			},
			{
				placeholder: "margin right",
				value: String(settings.customMarginRightMm),
				onChange: (v) => setNonNegative(v, (n) => (settings.customMarginRightMm = n), notify),
			},
		);
	}

	new Setting(container)
		.setName("Downscale percent")
		.setDesc("Default 100%. Range 0–200.")
		.addSlider((s) =>
			s
				.setLimits(0, 200, 1)
				.setValue(settings.downscalePercent)
				.onChange((v) => {
					settings.downscalePercent = v;
					notify();
				}),
		)
		.addExtraButton((btn) =>
			btn
				.setIcon("reset")
				.setTooltip("Reset to 100%")
				.onClick(() => {
					settings.downscalePercent = 100;
					notify();
					opts.onRebuild();
				}),
		);

	new Setting(container)
		.setName("Orientation")
		.setDesc("Portrait is the default.")
		.addDropdown((dd) => {
			dd.addOption("portrait", "Portrait");
			dd.addOption("landscape", "Landscape");
			dd.setValue(settings.landscape ? "landscape" : "portrait").onChange((v) => {
				settings.landscape = v === "landscape";
				settings.cheatSheetColumns = clampCheatSheetColumns(settings.cheatSheetColumns);
				notify();
				opts.onRebuild();
			});
		});

	new Setting(container).setName("PDF").setHeading();

	if (!isPhoneSession()) {
		new Setting(container)
			.setName("Enable PDF preview")
			.setDesc("Show PDF preview in the export dialog. Turn off to open the dialog immediately on slow devices.")
			.addToggle((t) =>
				t.setValue(settings.enablePreview).onChange((v) => {
					settings.enablePreview = v;
					notify();
				}),
			);
	}

	new Setting(container)
		.setName("Print background")
		.setDesc("Whether to print background graphics")
		.addToggle((t) =>
			t.setValue(settings.printBackground).onChange((v) => {
				settings.printBackground = v;
				notify();
			}),
		);

	new Setting(container)
		.setName("Generate tagged PDF")
		.setDesc(
			"Add accessibility structure so screen readers can follow headings and paragraphs. The image-based export cannot be fully tagged.",
		)
		.addToggle((t) =>
			t.setValue(settings.generateTaggedPDF).onChange((v) => {
				settings.generateTaggedPDF = v;
				notify();
			}),
		);

	new Setting(container)
		.setName("Max headings level of the outline")
		.setDesc("Include headings up to this level in the PDF outline.")
		.addDropdown((dd) => {
			for (const level of ["1", "2", "3", "4", "5", "6"]) {
				dd.addOption(level, `h${level}`);
			}
			dd.setValue(settings.maxHeadingLevel).onChange((v) => {
				settings.maxHeadingLevel = v as PaginaSettings["maxHeadingLevel"];
				notify();
			});
		});

	new Setting(container)
		.setName("PDF metadata")
		.setDesc("Add frontmatter (title, author, keywords, subject, creator) to PDF metadata")
		.addToggle((t) =>
			t.setValue(settings.pdfMetadata).onChange((v) => {
				settings.pdfMetadata = v;
				notify();
			}),
		);

	new Setting(container)
		.setName("Timestamp format")
		.setDesc("Format for appending timestamp to the output file name")
		.addDropdown((dd) => {
			dd.addOption("none", "None");
			dd.addOption("EPOCH", "Epoch (unix timestamp)");
			dd.addOption("YYYYMMDD", "YYYYMMDD");
			dd.addOption("YYYY-MM-DD", "Yyyy-mm-dd");
			dd.addOption("YYYYMMDD-HHMMSS", "Yyyymmdd-hhmmss");
			dd.setValue(settings.timestampFormat).onChange((v) => {
				settings.timestampFormat = v as typeof settings.timestampFormat;
				notify();
			});
		});

	new Setting(container)
		.setName("Link table of contents entries")
		.setDesc("Contents lines jump to the matching heading. Turn off to leave those lines as plain text.")
		.addToggle((t) =>
			t.setValue(settings.linkTocEntries).onChange((v) => {
				settings.linkTocEntries = v;
				notify();
			}),
		);

	new Setting(container)
		.setName("Link heading text")
		.setDesc("Heading text jumps back to the first printed table of contents. Turn off to make headings easier to select.")
		.addToggle((t) =>
			t.setValue(settings.linkHeadingText).onChange((v) => {
				settings.linkHeadingText = v;
				notify();
			}),
		);

	new Setting(container).setName("Header").setHeading();

	new Setting(container)
		.setName("Section heading level")
		.setDesc("Heading level used by {{section}} in the header or footer. If that level does not appear in the note, each page shows the deepest heading still in effect at the top. A later heading replaces one of the same or deeper level.")
		.addDropdown((dd) => {
			for (const level of ["1", "2", "3", "4", "5", "6"]) {
				dd.addOption(level, `Heading ${level}`);
			}
			dd.setValue(settings.sectionHeadingLevel).onChange((v) => {
				settings.sectionHeadingLevel = v as PaginaSettings["sectionHeadingLevel"];
				notify();
			});
		});

	new Setting(container)
		.setName("Display header")
		.setDesc(VARIABLE_HINT)
		.addToggle((t) =>
			t.setValue(settings.displayHeader).onChange((v) => {
				settings.displayHeader = v;
				notify();
				opts.onRebuild();
			}),
		);

	if (settings.displayHeader) {
		addSlotSettings(container, "Header", settings.header, notify);
	}

	new Setting(container).setName("Footer").setHeading();

	new Setting(container)
		.setName("Display footer")
		.setDesc(VARIABLE_HINT)
		.addToggle((t) =>
			t.setValue(settings.displayFooter).onChange((v) => {
				settings.displayFooter = v;
				notify();
				opts.onRebuild();
			}),
		);

	if (settings.displayFooter) {
		addSlotSettings(container, "Footer", settings.footer, notify);
	}

	new Setting(container).setName("Output").setHeading();

	new Setting(container)
		.setName("Open after export")
		.addToggle((t) =>
			t.setValue(settings.openAfterExport).onChange((v) => {
				settings.openAfterExport = v;
				notify();
			}),
		);

	new Setting(container).setName("Settings file").setHeading();

	new Setting(container)
		.setName("Export settings")
		.setDesc("Download the current configuration as JSON.")
		.addButton((btn) =>
			btn.setButtonText("Export").onClick(() => {
				downloadSettingsJson(settings);
			}),
		);

	new Setting(container)
		.setName("Import settings")
		.setDesc("Replace the current configuration from a JSON file.")
		.addButton((btn) =>
			btn.setButtonText("Import").onClick(() => {
				pickSettingsFile((text) => {
					try {
						applyImportedSettings(settings, parseSettingsJson(text));
						notify();
						opts.onRebuild();
						new Notice("Pagina settings imported");
					} catch (err) {
						new Notice(err instanceof Error ? err.message : "Could not import settings");
					}
				});
			}),
		);
}

function pickSettingsFile(onText: (text: string) => void): void {
	const input = createEl("input", { type: "file", attr: { accept: ".json,application/json" } });
	input.addEventListener("change", () => {
		const file = input.files?.[0];
		if (!file) return;
		void file.text().then(onText, () => {
			new Notice("Could not read the settings file");
		});
	});
	input.click();
}

function addPairedText(
	container: HTMLElement,
	name: string,
	first: { placeholder: string; value: string; onChange: (v: string) => void },
	second: { placeholder: string; value: string; onChange: (v: string) => void },
): void {
	const setting = new Setting(container).setName(name);
	for (const spec of [first, second]) {
		setting.addText((t) => {
			t.inputEl.addClass("pagina-mm-input");
			t.setPlaceholder(spec.placeholder).setValue(spec.value).onChange(spec.onChange);
		});
	}
}

function setPositive(value: string, assign: (n: number) => void, notify: () => void): void {
	const n = Number(value);
	if (!Number.isNaN(n) && n > 0) {
		assign(n);
		notify();
	}
}

function addWrappedText(
	setting: Setting,
	spec: { value: string; placeholder?: string; rows?: number; onChange: (value: string) => void },
): void {
	setting.addTextArea((area) => {
		if (spec.placeholder) area.setPlaceholder(spec.placeholder);
		area.setValue(spec.value).onChange(spec.onChange);
		area.inputEl.rows = spec.rows ?? 2;
		area.inputEl.wrap = "soft";
		area.inputEl.addClass("pagina-wrap-field");
	});
}

function setNonNegative(value: string, assign: (n: number) => void, notify: () => void): void {
	const n = Number(value);
	if (!Number.isNaN(n) && n >= 0) {
		assign(n);
		notify();
	}
}

function isValidHexColor(value: string): boolean {
	return /^#[0-9a-fA-F]{6}$/.test(value);
}

function addSlotSettings(
	container: HTMLElement,
	label: string,
	slots: HeaderFooterSlots,
	notify: () => void,
): void {
	addWrappedText(new Setting(container).setName(`${label} left`), {
		value: slots.left,
		onChange: (value) => {
			slots.left = value;
			notify();
		},
	});
	addWrappedText(new Setting(container).setName(`${label} center`), {
		value: slots.center,
		onChange: (value) => {
			slots.center = value;
			notify();
		},
	});
	addWrappedText(new Setting(container).setName(`${label} right`), {
		value: slots.right,
		onChange: (value) => {
			slots.right = value;
			notify();
		},
	});

	new Setting(container).setName(`${label} border style`).addDropdown((dd) => {
		for (const border of HEADER_BORDERS) {
			dd.addOption(border.id, border.label);
		}
		dd.setValue(slots.borderStyle || "none").onChange((v) => {
			slots.borderStyle = v as HeaderBorderStyle;
			notify();
		});
	});

	addWrappedText(new Setting(container).setName(`${label} border color`), {
		value: slots.borderColor || "#000000",
		placeholder: "#000000",
		rows: 1,
		onChange: (value) => {
			if (isValidHexColor(value) || value === "") {
				slots.borderColor = value || "#000000";
				notify();
			}
		},
	});

	addWrappedText(new Setting(container).setName(`${label} text color`), {
		value: slots.textColor || "#555555",
		placeholder: "#555555",
		rows: 1,
		onChange: (value) => {
			if (isValidHexColor(value) || value === "") {
				slots.textColor = value || "#555555";
				notify();
			}
		},
	});

	addWrappedText(
		new Setting(container)
			.setName(`${label} font`)
			.setDesc(`Leave blank to match Obsidian: ${obsidianFontLabel()}`),
		{
			value: slots.fontFamily || "",
			placeholder: "E.g. Georgia, times new roman",
			onChange: (value) => {
				slots.fontFamily = value.trim();
				notify();
			},
		},
	);

	new Setting(container)
		.setName(`${label} text size`)
		.setDesc(TEXT_SIZE_DESC)
		.addText((text) => {
			text.inputEl.type = "number";
			text.inputEl.min = String(TEXT_PX_MIN);
			text.inputEl.max = String(TEXT_PX_MAX);
			text.inputEl.step = "1";
			text.setValue(String(slots.fontSizePx)).onChange((value) => {
				if (value.trim() === "" || !Number.isFinite(Number(value))) return;
				slots.fontSizePx = clampTextPx(value, slots.fontSizePx);
				notify();
			});
		});

	new Setting(container).setName(`${label} date/time format`).addDropdown((dd) => {
		for (const format of DATETIME_FORMATS) {
			dd.addOption(format.id, format.label);
		}
		dd.setValue(slots.datetimeFormat || "locale").onChange((v) => {
			slots.datetimeFormat = v as DatetimeFormat;
			notify();
		});
	});
}
