import { readFileSync } from "fs";
import { join } from "path";
import { Platform } from "obsidian";
import { PaginaSettingTab } from "../src/settings";
import { applyCheatSheetClasses, applyContinuousText, markCompactSpacers } from "../src/cheat-sheet";
import { contentBoxHasText } from "../src/blank-page";
import { sanitizeCssText } from "../src/css-sanitize";
import { bandHeightMm } from "../src/header-footer-layout";
import { computePageLayout } from "../src/paginate";
import { effectiveLandscape, resolvePageSizeMm, validateLayout } from "../src/page-presets";
import {
	applyHeaderLinePreference,
	CHEAT_SHEET_CSS,
	fitWideTables,
	headerLineFits,
	PRINT_CSS,
	shiftWordDeficits,
} from "../src/print-styles";
import { applyH1StyleClasses, dropBlankLineBeforeTables, labelCodeBlockLanguages, separateHeadingBodies } from "../src/render";
import { isPhoneSession } from "../src/session";
import { DEFAULT_SETTINGS, clampCheatSheetColumns, normalizeSettings } from "../src/types";
import { applyOrderedListStarts, orderedListStarts } from "../src/ordered-lists";
import { formatPropertyValue, formatTimestamp, propertyRows, propertyTokenErrors, renderTemplate, resolveNoteTitle } from "../src/variables";

describe("page presets", () => {
	it("resolves A4 portrait and landscape", () => {
		expect(resolvePageSizeMm("A4", 0, 0, false)).toEqual({
			width: 210,
			height: 297,
		});
		expect(resolvePageSizeMm("A4", 0, 0, true)).toEqual({
			width: 297,
			height: 210,
		});
	});

	it("validates margins against page size", () => {
		expect(
			validateLayout(
				{ width: 210, height: 297 },
				{ top: 20, bottom: 20, left: 20, right: 20 },
			),
		).toBeNull();
		expect(
			validateLayout(
				{ width: 210, height: 297 },
				{ top: 20, bottom: 20, left: 120, right: 120 },
			),
		).toMatch(/margins/i);
	});
});

describe("variables", () => {
	const now = new Date(2026, 0, 2, 15, 4, 5);

	it("renders common tokens", () => {
		const out = renderTemplate(
			"{{title}} / {{filename}} / {{page}} of {{pages}} / {{property:tags}}",
			{
				title: "Note",
				filename: "note.md",
				page: 2,
				pages: 5,
				frontmatter: { tags: ["a", "b"] },
				now,
			},
		);
		expect(out).toBe("Note / note.md / 2 of 5 / a, b");
	});

	it("formats property lists, scalars, and objects", () => {
		expect(formatPropertyValue(["recipe", "dinner"])).toBe("recipe, dinner");
		expect(formatPropertyValue([1, 2])).toBe("1, 2");
		expect(formatPropertyValue(false)).toBe("false");
		expect(formatPropertyValue(["a", ["b", "c"], 3])).toBe("a, b, c, 3");
		expect(formatPropertyValue([])).toBe("");
		expect(formatPropertyValue({ nested: true })).toBe("");
		expect(formatPropertyValue(null)).toBe("");
		expect(
			renderTemplate("{{property:counts}}", {
				title: "Note",
				filename: "note.md",
				page: 1,
				pages: 1,
				frontmatter: { counts: [1, 2] },
			}),
		).toBe("1, 2");
	});

	it("lists printable properties and skips position and blanks", () => {
		expect(
			propertyRows({
				position: { start: { line: 0 } },
				tags: ["a", "b"],
				title: "Hello",
				empty: "",
				count: 1,
				meta: { hidden: true },
			}),
		).toEqual([
			{ key: "tags", value: "a, b" },
			{ key: "title", value: "Hello" },
			{ key: "count", value: "1" },
		]);
	});

	it("resolves the printed title from a property, the file name, or a typed override", () => {
		expect(resolveNoteTitle({ title: "From YAML" }, "file")).toBe("From YAML");
		expect(resolveNoteTitle({}, "file")).toBe("file");
		expect(resolveNoteTitle({ title: "" }, "file")).toBe("file");
		expect(resolveNoteTitle({ title: 12 }, "file")).toBe("file");
		expect(resolveNoteTitle({ title: "From YAML" }, "file", "Typed")).toBe("Typed");
		expect(resolveNoteTitle({ title: "From YAML" }, "file", "  ")).toBe("file");
		expect(resolveNoteTitle({ title: "From YAML" }, "file", "")).toBe("file");
	});

	it("prints one list item, including names with spaces, beside other text", () => {
		const ctx = {
			title: "Note",
			filename: "note.md",
			page: 1,
			pages: 1,
			frontmatter: {
				tags: ["recipe", ["a", "b"]],
				"due date": ["today", "tomorrow"],
				author: "Ada",
			},
		};
		expect(renderTemplate("{{property:tags[0]}}", ctx)).toBe("recipe");
		expect(renderTemplate("{{property:tags[1]}}", ctx)).toBe("a, b");
		expect(renderTemplate("{{property:tags[ 0 ]}}", ctx)).toBe("recipe");
		expect(renderTemplate("{{property:tags}}", ctx)).toBe("recipe, a, b");
		expect(renderTemplate("{{property:due date}}", ctx)).toBe("today, tomorrow");
		expect(renderTemplate("{{property:due date[0]}}", ctx)).toBe("today");
		expect(renderTemplate("Author: {{property:author}} ({{property:tags[0]}})", ctx)).toBe("Author: Ada (recipe)");
	});

	it("prefers a property whose name looks like an index", () => {
		expect(
			renderTemplate("{{property:tags[0]}}", {
				title: "Note",
				filename: "note.md",
				page: 1,
				pages: 1,
				frontmatter: { "tags[0]": "literal", tags: ["recipe"] },
			}),
		).toBe("literal");
	});

	it("reports a bad list index and still throws from the template", () => {
		const tags = { tags: ["a", "b"], title: "Hello" };
		expect(propertyTokenErrors(["{{property:tags[2]}}"], tags)).toEqual(["tags[2] is out of range (2 items)"]);
		expect(propertyTokenErrors(["{{property:tags[0]}}"], { tags: [] })).toEqual([
			"tags[0] is out of range (0 items)",
		]);
		expect(propertyTokenErrors(["{{property:title[0]}}"], tags)).toEqual(["title is not a list"]);
		expect(propertyTokenErrors(["{{property:missing[0]}}"], tags)).toEqual(["missing is not a list"]);
		expect(propertyTokenErrors(["{{property:missing}}"], tags)).toEqual([]);
		expect(propertyTokenErrors(["{{property:tags[-1]}}"], tags)[0]).toMatch(/invalid property index/);
		expect(propertyTokenErrors(["{{property:tags[1.5]}}"], tags)[0]).toMatch(/invalid property index/);
		expect(propertyTokenErrors(["{{property:tags[0][1]}}"], tags)[0]).toMatch(/invalid property index/);
		expect(propertyTokenErrors(["{{property:tags[2]}}", "X {{property:tags[2]}}"], tags)).toEqual([
			"tags[2] is out of range (2 items)",
		]);
		expect(() =>
			renderTemplate("{{property:tags[2]}}", {
				title: "Note",
				filename: "note.md",
				page: 1,
				pages: 1,
				frontmatter: tags,
			}),
		).toThrow(/out of range/);
	});

	it("formats timestamps", () => {
		expect(formatTimestamp("YYYY-MM-DD", now)).toBe("2026-01-02");
		expect(formatTimestamp("HH:MM:SS", now)).toBe("15:04:05");
		expect(formatTimestamp("none", now)).toBe("");
	});
});

describe("ordered lists", () => {
	const note = [
		"1. one",
		"$$math$$",
		"2. two",
		"$$math$$",
		"3. three",
		"$$math$$",
		"Mutual authentication:",
		"1. picks",
		"$$A$$",
		"2. receives",
		"$$B$$",
		"3. finish",
		"",
		"**FLAW**",
		"4. explicit",
		"5. next",
		"Next:",
		"0. zero",
		"1. after",
	].join("\n");

	it("keeps math inside a list and restarts after a plain line", () => {
		expect(orderedListStarts(note)).toEqual([
			{ start: 1, itemCount: 3 },
			{ start: 1, itemCount: 3 },
			{ start: 4, itemCount: 2 },
			{ start: 0, itemCount: 2 },
		]);
	});

	it("splits a merged list and stamps the written start", () => {
		const root = document.createElement("div");
		root.innerHTML = [
			"<ol>",
			"<li>one</li><li>two</li><li>three</li>",
			"<p>Mutual authentication:</p>",
			"<li>picks</li><li>receives</li><li>finish</li>",
			"<li>explicit</li><li>next</li>",
			"<li>zero</li><li>after</li>",
			"</ol>",
		].join("");
		applyOrderedListStarts(root, note);
		expect(markersFor(root, ["one", "two", "three", "picks", "receives", "finish", "explicit", "next", "zero", "after"])).toEqual([
			"1",
			"2",
			"3",
			"1",
			"2",
			"3",
			"4",
			"5",
			"0",
			"1",
		]);
		expect(root.querySelector(".pagina-ol-marker")).toBeNull();
		const paragraph = [...root.querySelectorAll("p")].find((el) => el.textContent === "Mutual authentication:");
		expect(paragraph?.parentElement).toBe(root);
	});

	it("numbers items when each one is already its own list", () => {
		const labels = ["one", "two", "three", "picks", "receives", "finish", "explicit", "next", "zero", "after"];
		const root = document.createElement("div");
		root.innerHTML = labels.map((label) => `<ol><li>${label}</li></ol>`).join("");
		applyOrderedListStarts(root, note);
		const lists = [...root.querySelectorAll("ol")];
		expect(lists).toHaveLength(10);
		expect(markersFor(root, labels)).toEqual(["1", "2", "3", "1", "2", "3", "4", "5", "0", "1"]);
		expect(lists.map((ol) => ol.getAttribute("start"))).toEqual(["1", "2", "3", "1", "2", "3", "4", "5", "0", "1"]);
	});

	it("sets the value on a paragraph item", () => {
		const root = document.createElement("div");
		root.innerHTML = "<ol><li><p>one</p></li><li><p>two</p></li></ol>";
		applyOrderedListStarts(root, "1. one\n2. two\n");
		const items = [...root.querySelectorAll("li")];
		expect(items.map((li) => li.getAttribute("value"))).toEqual(["1", "2"]);
		expect(root.querySelector(".pagina-ol-marker")).toBeNull();
	});

	it("sets the value when a math block precedes the paragraph", () => {
		const root = document.createElement("div");
		root.innerHTML = '<ol><li><div class="math"></div><p>picks</p></li></ol>';
		applyOrderedListStarts(root, "1. picks\n");
		expect(root.querySelector("li")?.getAttribute("value")).toBe("1");
		expect(root.querySelector(".pagina-ol-marker")).toBeNull();
	});

	const flawNote = [
		"Mutual authentication:",
		"1. picks",
		"$$A$$",
		"2. receives",
		"$$B$$",
		"3. finish",
		"$$C$$",
		"",
		"**FLAW (Reflection Attack)**",
		"1. picks again",
		"$$D$$",
		"2. attacker",
		"3. responds",
		"4. intercepts",
		"5. responses",
		"6. abort",
	].join("\n");

	it("restarts at the digit written after FLAW", () => {
		expect(orderedListStarts(flawNote)).toEqual([
			{ start: 1, itemCount: 3 },
			{ start: 1, itemCount: 6 },
		]);
	});

	it("does not let leading math items consume the FLAW restart", () => {
		const root = document.createElement("div");
		const math = '<li><div class="math"></div></li>';
		root.innerHTML = [
			"<ol>",
			"<li>picks</li><li>receives</li><li>finish</li>",
			math,
			math,
			math,
			"<li>picks again</li><li>attacker</li><li>responds</li>",
			"<li>intercepts</li><li>responses</li><li>abort</li>",
			"</ol>",
		].join("");
		applyOrderedListStarts(root, flawNote);
		expect(markersFor(root, ["picks", "receives", "finish"])).toEqual(["1", "2", "3"]);
		expect(markersFor(root, ["picks again", "attacker", "responds", "intercepts", "responses", "abort"])).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
		]);
		expect(root.querySelector(".pagina-ol-marker")).toBeNull();
	});

	it("restarts FLAW when math items already lead its list", () => {
		const root = document.createElement("div");
		const math = "<li><div class=\"math\"></div></li>";
		root.innerHTML = [
			"<ol><li>picks</li><li>receives</li><li>finish</li></ol>",
			"<ol>",
			math,
			math,
			math,
			"<li>picks again</li><li>attacker</li><li>responds</li>",
			"<li>intercepts</li><li>responses</li><li>abort</li>",
			"</ol>",
		].join("");
		applyOrderedListStarts(root, flawNote);
		const steps = [...root.querySelectorAll("li")].filter((li) =>
			["picks again", "attacker", "responds", "intercepts", "responses", "abort"].includes(li.textContent ?? ""),
		);
		expect(steps.map((li) => li.getAttribute("value"))).toEqual(["1", "2", "3", "4", "5", "6"]);
		expect(steps[0]?.parentElement?.getAttribute("start")).toBe("1");
		expect(steps[0]?.parentElement?.querySelector(".math")).toBeNull();
	});

	const protocol = [
		"Unilateral authentication:",
		"1. $A$ sends a greeting to $B$.",
		"$$hello$$",
		"2. $B$ picks a random number.",
		"$$rb$$",
		"3. $A$ encrypts that random number.",
		"$$ek$$",
		"Mutual authentication:",
		"1. A picks its own random number.",
		"$$ra$$",
		"2. B receives the numbers.",
		"$$back$$",
		"3. To finish proving its identity.",
		"$$rb2$$",
		"",
		"**FLAW (Reflection Attack)**",
		"1. A picks its own random number.",
		"$$ra2$$",
		"2. Attacker intercepts.",
		"3. A responds to the second instance.",
		"4. C intercepts the response.",
		"5. A responses to the first instance.",
		"6. The second instance can be aborted.",
	].join("\n");

	it("numbers each sentence when a math item precedes it", () => {
		const root = document.createElement("div");
		const math = '<li><div class="math"></div></li>';
		const step = (text: string) => `<li>${text}</li>`;
		root.innerHTML = [
			"<ol>",
			math,
			step("$A$ sends a greeting to $B$."),
			math,
			step("$B$ picks a random number."),
			math,
			step("$A$ encrypts that random number."),
			math,
			step("A picks its own random number."),
			math,
			step("B receives the numbers."),
			math,
			step("To finish proving its identity."),
			math,
			math,
			math,
			step("A picks its own random number."),
			math,
			step("Attacker intercepts."),
			step("A responds to the second instance."),
			step("C intercepts the response."),
			step("A responses to the first instance."),
			step("The second instance can be aborted."),
			"</ol>",
		].join("");
		applyOrderedListStarts(root, protocol);
		expect(
			markersFor(root, [
				"$A$ sends a greeting to $B$.",
				"$B$ picks a random number.",
				"$A$ encrypts that random number.",
			]),
		).toEqual(["1", "2", "3"]);
		expect(
			markersFor(root, ["A picks its own random number.", "B receives the numbers.", "To finish proving its identity."]),
		).toEqual(["1", "2", "3"]);
		expect(
			markersFor(root, [
				"Attacker intercepts.",
				"A responds to the second instance.",
				"C intercepts the response.",
				"A responses to the first instance.",
				"The second instance can be aborted.",
			]),
		).toEqual(["2", "3", "4", "5", "6"]);
		const flawStart = [...root.querySelectorAll("li")].filter((li) => li.textContent === "A picks its own random number.");
		expect(flawStart.map((li) => li.getAttribute("value"))).toEqual(["1", "1"]);
		expect(root.querySelector(".pagina-ol-marker")).toBeNull();
	});
});

function markersFor(root: ParentNode, labels: string[]): string[] {
	return labels.map((label) => {
		const li = [...root.querySelectorAll("li")].find((node) => node.textContent === label);
		expect(li?.parentElement?.tagName).toBe("OL");
		expect(li?.parentElement?.getAttribute("start")).toBe(li?.getAttribute("value"));
		return li?.getAttribute("value") ?? "";
	});
}

describe("css sanitize", () => {
	it("replaces unsupported color functions", () => {
		expect(sanitizeCssText("color: oklch(0.5 0.1 20);")).toContain("#888888");
	});
});

describe("settings", () => {
	it("normalizes empty settings to defaults", () => {
		const settings = normalizeSettings({});
		expect(settings.pageSize).toBeTruthy();
		expect(typeof settings.landscape).toBe("boolean");
		expect(settings.cheatSheet).toBe(false);
		expect(settings.cheatSheetDensity).toBe("compact");
		expect(settings.bodyFontSizePx).toBe(11);
		expect(settings.applyBodyFontSize).toBe(false);
		expect(settings.cheatSheetColumns).toBe(3);
		expect(settings.cheatSheetUniformText).toBe(true);
		expect(settings.centerNoteTitle).toBe(false);
		expect(settings.noteTitleGapMm).toBe(0);
		expect(normalizeSettings({ noteTitleGapMm: -4 }).noteTitleGapMm).toBe(0);
		expect(settings.ruleGapMm).toBe(0.8);
		expect(normalizeSettings({ ruleGapMm: -2 }).ruleGapMm).toBe(0);
		expect(normalizeSettings({ ruleGapMm: 3.24 }).ruleGapMm).toBe(3.2);
		expect(bandHeightMm("none", 1, 9, 4) - bandHeightMm("none", 1, 9, 0.8)).toBeCloseTo(3.2);
		expect(normalizeSettings({ noteTitleGapMm: 6.24 }).noteTitleGapMm).toBe(6.2);
		expect(settings.showProperties).toBe(false);
		expect(normalizeSettings({ showProperties: true }).showProperties).toBe(true);
		expect(normalizeSettings({ showProperties: "yes" }).showProperties).toBe(false);
		expect(settings.header.fontSizePx).toBe(9);
		expect(settings.footer.fontSizePx).toBe(9);
	});

	it("converts a saved point size to pixels and clamps the typed range", () => {
		const missing = normalizeSettings({
			header: { left: "", center: "{{title}}", right: "" },
			footer: { left: "", center: "", right: "" },
		});
		expect(missing.header.fontSizePx).toBe(9);
		expect(missing.footer.fontSizePx).toBe(9);
		const converted = normalizeSettings({
			header: { left: "", center: "", right: "", fontSizePt: 6.75 },
			footer: { left: "", center: "", right: "", fontSizePt: 12 },
		});
		expect(converted.header.fontSizePx).toBe(9);
		expect(converted.footer.fontSizePx).toBe(16);
		const clamped = normalizeSettings({
			header: { left: "", center: "", right: "", fontSizePx: 1 },
			footer: { left: "", center: "", right: "", fontSizePx: 600 },
		});
		expect(clamped.header.fontSizePx).toBe(2);
		expect(clamped.footer.fontSizePx).toBe(512);
		expect(normalizeSettings({ cheatSheetFontSizePt: 8 }).bodyFontSizePx).toBe(11);
		expect(normalizeSettings({ cheatSheetFontSizePt: 8 }).applyBodyFontSize).toBe(false);
		expect(normalizeSettings({ bodyFontSizePx: 20, applyBodyFontSize: true }).applyBodyFontSize).toBe(true);
	});

	it("accepts header, footer, and body text sizes in pixels from the settings command", async () => {
		const plugin = {
			settings: normalizeSettings({}),
			saveSettings: async () => {},
		};
		const tab = new PaginaSettingTab({} as never, plugin as never);
		const keys = JSON.stringify(tab.getSettingDefinitions());
		expect(keys).toContain('"key":"showProperties"');
		expect(keys).toContain("Include note title");
		expect(keys).toContain('"key":"header.fontSizePx"');
		expect(keys).toContain('"key":"footer.fontSizePx"');
		expect(keys).toContain('"key":"bodyFontSizePx"');
		expect(keys).toContain("8 to 96");
		await tab.setControlValue("header.fontSizePx", 14);
		await tab.setControlValue("footer.fontSizePx", "12");
		await tab.setControlValue("bodyFontSizePx", 32);
		expect(plugin.settings.header.fontSizePx).toBe(14);
		expect(plugin.settings.footer.fontSizePx).toBe(12);
		expect(plugin.settings.bodyFontSizePx).toBe(32);
		expect(plugin.settings.applyBodyFontSize).toBe(true);
	});

	it("clamps body text size and density", () => {
		const settings = normalizeSettings({
			cheatSheet: true,
			cheatSheetDensity: "continuous",
			cheatSheetFontSizePt: 3,
			cheatSheetUniformText: false,
		});
		expect(settings.cheatSheet).toBe(true);
		expect(settings.cheatSheetDensity).toBe("continuous");
		expect(settings.bodyFontSizePx).toBe(4);
		expect(settings.applyBodyFontSize).toBe(false);
		expect(settings.cheatSheetUniformText).toBe(false);
		expect(normalizeSettings({ bodyFontSizePx: 900 }).bodyFontSizePx).toBe(512);
		expect(normalizeSettings({ cheatSheetDensity: "nope" }).cheatSheetDensity).toBe("compact");
		expect(clampCheatSheetColumns(1)).toBe(2);
		expect(clampCheatSheetColumns(2)).toBe(2);
		expect(clampCheatSheetColumns(4)).toBe(4);
		expect(clampCheatSheetColumns(5)).toBe(4);
		expect(normalizeSettings({ landscape: false, cheatSheetColumns: 4 }).cheatSheetColumns).toBe(4);
		expect(normalizeSettings({ landscape: true, cheatSheetColumns: 2 }).cheatSheetColumns).toBe(2);
	});
});

describe("isPhoneSession", () => {
	it("uses Platform flags, not window width", () => {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
		(Platform as { isDesktopApp: boolean; isMobile: boolean }).isDesktopApp = true;
		(Platform as { isDesktopApp: boolean; isMobile: boolean }).isMobile = false;
		expect(isPhoneSession()).toBe(false);

		(Platform as { isMobile: boolean }).isMobile = true;
		expect(isPhoneSession()).toBe(true);
		(Platform as { isMobile: boolean }).isMobile = false;
	});
});

describe("exam cheat sheet", () => {
	it("uses the saved orientation for a cheat sheet", () => {
		expect(effectiveLandscape({ landscape: false, cheatSheet: true })).toBe(false);
		expect(effectiveLandscape({ landscape: true, cheatSheet: true })).toBe(true);
		const portrait = computePageLayout({ ...DEFAULT_SETTINGS, landscape: false, cheatSheet: true });
		const landscape = computePageLayout({ ...DEFAULT_SETTINGS, landscape: true, cheatSheet: true });
		expect(portrait.pageWidthMm).toBeLessThan(portrait.pageHeightMm);
		expect(landscape.pageWidthMm).toBe(portrait.pageHeightMm);
		expect(landscape.pageHeightMm).toBe(portrait.pageWidthMm);
	});

	it("mirrors the three-column rules in styles.css", () => {
		const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
		for (const marker of [
			"column-count: var(--pagina-cheat-columns, 3)",
			"column-fill: auto",
			"pagina-uniform-text",
			"--pagina-cheat-font-size",
			"--table-text-size: 1em",
			"table-layout: fixed",
			"overflow-wrap: break-word",
			"word-break: normal",
			"page-break-inside: auto",
			"page-break-after: avoid",
			"padding: 0",
			"pagina-cheat-sheet hr",
			"--icon-size: 1em",
			".callout-icon .svg-icon",
			"padding: 0.2em 0.45em",
		]) {
			expect(CHEAT_SHEET_CSS).toContain(marker);
			expect(PRINT_CSS).toContain(marker);
			expect(css).toContain(marker);
		}
	});

	it("applies cheat sheet classes and skips h1 page breaks", () => {
		const el = document.createElement("div");
		applyH1StyleClasses(el, {
			pageBreakBeforeH1: true,
			cheatSheet: true,
			cheatSheetDensity: "compact",
			bodyFontSizePx: 12,
			applyBodyFontSize: true,
			cheatSheetColumns: 4,
			landscape: true,
			cheatSheetUniformText: true,
		});
		expect(el.classList.contains("pagina-break-h1")).toBe(false);
		expect(el.classList.contains("pagina-center-title")).toBe(false);
		expect(el.style.getPropertyValue("--pagina-title-gap")).toBe("0mm");
		expect(el.classList.contains("pagina-cheat-sheet")).toBe(true);
		expect(el.classList.contains("pagina-cheat-compact")).toBe(true);
		expect(el.classList.contains("pagina-uniform-text")).toBe(true);
		expect(el.style.getPropertyValue("--pagina-cheat-font-size")).toBe("12px");
		expect(el.classList.contains("pagina-body-font")).toBe(true);
		expect(el.style.getPropertyValue("--pagina-body-font-size")).toBe("12px");
		expect(el.style.getPropertyValue("--pagina-cheat-columns")).toBe("4");
		applyH1StyleClasses(el, { centerNoteTitle: true, cheatSheet: true, noteTitleGapMm: 8 });
		expect(el.classList.contains("pagina-center-title")).toBe(true);
		expect(el.style.getPropertyValue("--pagina-title-gap")).toBe("8mm");
		applyH1StyleClasses(el, { centerNoteTitle: false, cheatSheet: true });
		expect(el.classList.contains("pagina-center-title")).toBe(false);
		applyCheatSheetClasses(el, { cheatSheet: false });
		expect(el.classList.contains("pagina-cheat-sheet")).toBe(false);
		expect(el.style.getPropertyValue("--pagina-cheat-font-size")).toBe("");
		expect(el.style.getPropertyValue("--pagina-cheat-columns")).toBe("");
	});

	it("joins text and leaves code, tables, and images as blocks", () => {
		const root = document.createElement("div");
		root.innerHTML = [
			'<h1 class="__title__">Title</h1>',
			"<h2>Editor</h2>",
			"<p>Line one</p>",
			"<p>Line two</p>",
			"<ul><li>Alpha</li><li>Beta</li></ul>",
			"<p>before</p>",
			'<img alt="pic">',
			"<p>after</p>",
			"<pre>keep\nthis</pre>",
			"<table><tr><td>cell</td></tr></table>",
		].join("");
		applyContinuousText(root);
		const html = root.innerHTML;
		applyContinuousText(root);
		expect(root.innerHTML).toBe(html);
		expect(root.querySelector("h1.__title__")?.textContent).toBe("Title");
		expect(root.querySelector("pre")?.textContent).toBe("keep\nthis");
		expect(root.querySelector("table td")?.textContent).toBe("cell");
		expect(root.querySelector("img")?.getAttribute("alt")).toBe("pic");
		const runs = [...root.querySelectorAll("p")].map((p) => p.textContent ?? "");
		expect(runs[0]).toContain("Editor");
		expect(runs[0]).toContain("Line one");
		expect(runs[0]).toContain("Line two");
		expect(runs[0]).toContain("• Alpha");
		expect(runs[0]).toContain("• Beta");
		expect(runs[0]).toContain("before");
		expect(runs[0]).not.toContain("after");
		expect(runs).toContain("after");
		expect(root.querySelector(".pagina-run-heading")?.textContent).toBe("Editor");
		const img = root.querySelector("img");
		expect(img?.previousElementSibling?.textContent).toContain("before");
		expect(img?.nextElementSibling?.textContent).toBe("after");
	});

	it("keeps the properties block intact in continuous layout", () => {
		const root = document.createElement("div");
		root.innerHTML = [
			'<h1 class="__title__">Title</h1>',
			'<dl class="pagina-properties"><div><dt>tags</dt><dd>a, b</dd></div></dl>',
			"<p>Body</p>",
		].join("");
		applyContinuousText(root);
		expect(root.querySelector(".pagina-properties dt")?.textContent).toBe("tags");
		expect(root.querySelector(".pagina-properties dd")?.textContent).toBe("a, b");
		expect(root.querySelector("p")?.textContent).toContain("Body");
	});

	it("drops the empty paragraph immediately above a table", () => {
		const root = document.createElement("div");
		root.innerHTML = "<p>Intro</p><p><br></p><table><tr><td>a</td></tr></table>";
		dropBlankLineBeforeTables(root);
		expect([...root.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["Intro"]);
		expect(root.querySelector("table td")?.textContent).toBe("a");
	});

	it("strips only the trailing break on the paragraph above a table", () => {
		const root = document.createElement("div");
		root.innerHTML = "<p><br></p><p>kept</p><p>line one<br>line two<br></p><table><tr><td>a</td></tr></table>";
		dropBlankLineBeforeTables(root);
		const paragraphs = [...root.querySelectorAll("p")];
		expect(paragraphs.map((p) => p.innerHTML)).toEqual(["<br>", "kept", "line one<br>line two"]);
		expect(root.querySelector("table td")?.textContent).toBe("a");
	});

	it("drops the empty paragraph immediately under a table", () => {
		const root = document.createElement("div");
		root.innerHTML = "<table><tr><td>a</td></tr></table><p><br></p><p>After</p>";
		dropBlankLineBeforeTables(root);
		expect([...root.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["After"]);
		expect(root.querySelector("table td")?.textContent).toBe("a");
	});

	it("strips only the leading break on the paragraph under a table", () => {
		const root = document.createElement("div");
		root.innerHTML = "<table><tr><td>a</td></tr></table><p><br>line one<br>line two</p><p>kept</p><p><br></p>";
		dropBlankLineBeforeTables(root);
		const paragraphs = [...root.querySelectorAll("p")];
		expect(paragraphs.map((p) => p.innerHTML)).toEqual(["line one<br>line two", "kept", "<br>"]);
		expect(root.querySelector("table td")?.textContent).toBe("a");
	});

	it("separates a body line from the heading above it", () => {
		const source = [
			"###### Filter Cost",
			"NSM: Cost = B",
			"DSM: Cost = (Number of Filtered Attributes) × (DSM Pages per Column)",
			"###### Retrieval Cost",
			"",
			"| a | b |",
			"```",
			"###### inside",
			"keep",
			"```",
		].join("\n");
		const lines = separateHeadingBodies(source).split("\n");
		expect(lines[0]).toBe("###### Filter Cost");
		expect(lines[1]).toBe("");
		expect(lines[2]).toBe("NSM: Cost = B");
		expect(lines[4]).toBe("###### Retrieval Cost");
		expect(lines.filter((line) => line === "")).toHaveLength(2);
		const fence = lines.indexOf("```");
		expect(lines[fence + 1]).toBe("###### inside");
		expect(lines[fence + 2]).toBe("keep");
	});

	it("keeps one user break when an empty block beside a table has several", () => {
		const root = document.createElement("div");
		root.innerHTML = "<p><br><br></p><table><tr><td>a</td></tr></table><p><br><br></p>";
		dropBlankLineBeforeTables(root);
		expect([...root.querySelectorAll("p")].map((p) => p.innerHTML)).toEqual(["<br>", "<br>"]);
	});

	it("leaves a heading and its sentence beside a table", () => {
		const root = document.createElement("div");
		root.innerHTML = "<h6>Filter Cost</h6><p>NSM: Cost = B</p><h6>Retrieval Cost</h6><table><tr><td>a</td></tr></table>";
		dropBlankLineBeforeTables(root);
		expect([...root.querySelectorAll("h6")].map((heading) => heading.textContent)).toEqual([
			"Filter Cost",
			"Retrieval Cost",
		]);
		expect(root.querySelector("p")?.textContent).toBe("NSM: Cost = B");
		expect(root.querySelector("table td")?.textContent).toBe("a");
	});

	it("removes only the empty paragraph that touches the table", () => {
		const root = document.createElement("div");
		root.innerHTML = "<p><br></p><p><br></p><table><tr><td>a</td></tr></table><p><br></p><p><br></p>";
		dropBlankLineBeforeTables(root);
		expect([...root.querySelectorAll("p")].map((p) => p.innerHTML)).toEqual(["<br>", "<br>"]);
	});

	it("marks a paragraph that is only a line break", () => {
		const root = document.createElement("div");
		root.innerHTML = "<p>kept</p><p><br></p><p>also</p>";
		markCompactSpacers(root);
		expect(root.querySelector("p.pagina-spacer-line")?.innerHTML).toBe("<br>");
		expect(root.querySelectorAll("p.pagina-spacer-line")).toHaveLength(1);
	});

	it("keeps a paragraph that has text and one line break", () => {
		const root = document.createElement("div");
		root.innerHTML =
			"<p>NSM: Cost = B<br>DSM: Cost = (Number of Filtered Attributes) × (DSM Pages per Column)</p><p><br></p>";
		markCompactSpacers(root);
		const paragraphs = [...root.querySelectorAll("p")];
		expect(paragraphs[0]?.classList.contains("pagina-spacer-line")).toBe(false);
		expect(paragraphs[0]?.textContent).toContain("NSM: Cost = B");
		expect(paragraphs[1]?.classList.contains("pagina-spacer-line")).toBe(true);
	});

	it("labels a fence language at the top-right of the code block", () => {
		const root = document.createElement("div");
		root.innerHTML = [
			'<pre class="language-python"><code class="language-python is-loaded"><span class="token">print(1)</span></code></pre>',
			"<pre><code>plain</code></pre>",
			'<pre class="language-mermaid"><code class="language-mermaid">graph TD</code></pre>',
			'<div class="block-language-sql"><pre><code>select 1</code></pre></div>',
		].join("");
		labelCodeBlockLanguages(root);
		labelCodeBlockLanguages(root);
		const labels = [...root.querySelectorAll(".pagina-code-lang")].map((el) => el.textContent);
		expect(labels).toEqual(["python", "sql"]);
		const code = [...root.querySelectorAll("code")].map((el) => el.textContent);
		expect(code).toEqual(["print(1)", "plain", "graph TD", "select 1"]);
	});

	it("treats header and footer text as outside the content box", () => {
		const page = { width: 800, height: 600 };
		const margins = { top: 40, bottom: 40, left: 30, right: 30 };
		expect(
			contentBoxHasText([{ text: "Page 1 of 2", x: 200, y: 12 }], page, margins),
		).toBe(false);
		expect(
			contentBoxHasText([{ text: "Notes", x: 200, y: 300 }], page, margins),
		).toBe(true);
	});
});

describe("table header lines", () => {
	it("keeps a header row on one line when the cells fit", () => {
		expect(headerLineFits([48, 40], 88)).toBe(true);
		expect(headerLineFits([48, 40], 40)).toBe(false);
		expect(headerLineFits([], 200)).toBe(false);

		const table = document.createElement("table");
		table.innerHTML = "<thead><tr><th>Symbol</th><th>Name</th></tr></thead>";
		applyHeaderLinePreference(table, 200, [48, 40]);
		const cells = [...table.querySelectorAll("th")];
		expect(cells.map((cell) => cell.style.whiteSpace)).toEqual(["nowrap", "nowrap"]);
		expect(cells.map((cell) => cell.style.overflowWrap)).toEqual(["normal", "normal"]);
		expect(cells.map((cell) => cell.style.wordBreak)).toEqual(["normal", "normal"]);
		expect(cells.map((cell) => cell.style.minWidth)).toEqual(["48px", "40px"]);

		const bare = document.createElement("table");
		bare.innerHTML = "<tr><th>Symbol</th><th>Name</th></tr>";
		applyHeaderLinePreference(bare, 200, [48, 40]);
		expect([...bare.querySelectorAll("th")].map((cell) => cell.style.whiteSpace)).toEqual(["nowrap", "nowrap"]);
	});

	it("wraps headers at word boundaries when one line does not fit", () => {
		const table = document.createElement("table");
		table.innerHTML = "<thead><tr><th>Symbol</th><th>Description</th></tr></thead>";
		applyHeaderLinePreference(table, 400, [48, 90]);
		applyHeaderLinePreference(table, 100, [48, 90]);
		for (const cell of table.querySelectorAll("th")) {
			expect(cell.style.whiteSpace).toBe("normal");
			expect(cell.style.overflowWrap).toBe("break-word");
			expect(cell.style.wordBreak).toBe("normal");
			expect(cell.style.minWidth).toBe("");
		}
	});

	it("leaves a table with no header row unchanged", () => {
		const table = document.createElement("table");
		table.innerHTML = "<tr><td>Symbol</td><td>Name</td></tr><tr><th>Row</th><td>Value</td></tr>";
		applyHeaderLinePreference(table, 400, [48, 40, 30, 20]);
		for (const cell of table.querySelectorAll("td, th")) {
			expect(cell.getAttribute("style")).toBeNull();
		}
	});

	it("does not force a broken or spanned header onto one line", () => {
		const table = document.createElement("table");
		table.innerHTML = "<thead><tr><th>Symbol</th><th>Line<br>break</th><th colspan='2'>Wide</th></tr></thead>";
		applyHeaderLinePreference(table, 400, [48, 200, 300]);
		const cells = [...table.querySelectorAll("th")];
		expect(cells[0]?.style.whiteSpace).toBe("nowrap");
		expect(cells[0]?.style.minWidth).toBe("48px");
		expect(cells[1]?.style.whiteSpace).toBe("normal");
		expect(cells[1]?.style.overflowWrap).toBe("break-word");
		expect(cells[1]?.style.minWidth).toBe("");
		expect(cells[2]?.style.whiteSpace).toBe("normal");
		expect(cells[2]?.style.minWidth).toBe("");
	});

	it("uses the wider header when two header rows share a column", () => {
		const table = document.createElement("table");
		table.innerHTML = "<thead><tr><th>Symbol</th></tr><tr><th>Sym</th></tr></thead>";
		applyHeaderLinePreference(table, 50, [40, 30]);
		for (const cell of table.querySelectorAll("th")) {
			expect(cell.style.whiteSpace).toBe("nowrap");
		}
		applyHeaderLinePreference(table, 20, [40, 30]);
		for (const cell of table.querySelectorAll("th")) {
			expect(cell.style.whiteSpace).toBe("normal");
			expect(cell.style.minWidth).toBe("");
		}
	});
});

describe("cheat sheet table fit", () => {
	const HOST_WIDTH = 800;
	const MIN_CONTENT = 400;

	function setClientWidth(el: HTMLElement, width: number): void {
		Object.defineProperty(el, "clientWidth", { configurable: true, value: width });
	}

	function setMinContent(el: HTMLElement, width: number): void {
		Object.defineProperty(el, "scrollWidth", { configurable: true, value: width });
		Object.defineProperty(el, "offsetWidth", { configurable: true, value: width });
	}

	function captureZoom(): { value: () => number; restore: () => void } {
		const values: number[] = [];
		const original = CSSStyleDeclaration.prototype.setProperty;
		CSSStyleDeclaration.prototype.setProperty = function (
			property: string,
			value: string | null,
			priority?: string,
		) {
			if (property === "zoom" && value != null) values.push(Number(value));
			return original.call(this, property, value, priority);
		};
		return {
			value: () => values[values.length - 1] ?? Number.NaN,
			restore: () => {
				CSSStyleDeclaration.prototype.setProperty = original;
			},
		};
	}

	/** Single-line header probes are spans; give them a stable width in jsdom. */
	function mockHeaderTextWidth(pxPerChar: number): () => void {
		const original = Element.prototype.getBoundingClientRect;
		Element.prototype.getBoundingClientRect = function (this: Element) {
			if (this.tagName === "SPAN") {
				const text = (this.textContent ?? "").trim();
				return {
					x: 0,
					y: 0,
					width: text.length * pxPerChar,
					height: 10,
					top: 0,
					left: 0,
					right: text.length * pxPerChar,
					bottom: 10,
					toJSON() {
						return {};
					},
				} as DOMRect;
			}
			return original.call(this);
		};
		return () => {
			Element.prototype.getBoundingClientRect = original;
		};
	}

	function mountTable(cheatColumns: number | null): { root: HTMLElement; table: HTMLTableElement } {
		const sheet = document.createElement("div");
		if (cheatColumns != null) {
			sheet.className = "pagina-cheat-sheet";
			if (cheatColumns > 0) sheet.style.setProperty("--pagina-cheat-columns", String(cheatColumns));
		}
		const root = document.createElement("div");
		sheet.appendChild(root);
		document.body.appendChild(sheet);
		setClientWidth(root, HOST_WIDTH);
		const table = document.createElement("table");
		table.innerHTML = "<thead><tr><th>Storage Tier</th><th>Architectural Unit</th></tr></thead>";
		root.appendChild(table);
		setMinContent(table, MIN_CONTENT);
		return { root, table };
	}

	function columnWidths(table: HTMLTableElement): string[] {
		return [...table.querySelectorAll("col")].map((col) => col.style.width);
	}

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it.each([2, 3, 4])("pins a table inside a %i-column cheat sheet", (count) => {
		const restore = mockHeaderTextWidth(20);
		const zoom = captureZoom();
		try {
			const { root, table } = mountTable(count);
			fitWideTables(root);
			expect(root.querySelector(".pagina-table-fit")).toBeNull();
			expect(Number.isNaN(zoom.value())).toBe(true);
			expect(table.classList.contains("pagina-table-fixed")).toBe(true);
			expect(table.classList.contains("pagina-table-natural")).toBe(false);
			expect(table.classList.contains("pagina-table-full")).toBe(true);
			expect(table.style.width).toBe("");
			// Longest words are "Storage" (7) and "Architectural" (13), not the full headings.
			expect(columnWidths(table)).toEqual(["35%", "65%"]);
			for (const cell of table.querySelectorAll("th")) {
				expect(cell.style.whiteSpace).toBe("normal");
				expect(cell.style.overflowWrap).toBe("break-word");
				expect(cell.style.wordBreak).toBe("normal");
				expect(cell.style.minWidth).toBe("");
			}
		} finally {
			zoom.restore();
			restore();
		}
	});

	it("keeps a table that fits the page at full width outside a cheat sheet", () => {
		const restore = mockHeaderTextWidth(20);
		try {
			const { root, table } = mountTable(null);
			fitWideTables(root);
			expect(root.querySelector(".pagina-table-fit")).toBeNull();
			expect(table.classList.contains("pagina-table-fixed")).toBe(true);
			expect(table.classList.contains("pagina-table-full")).toBe(true);
			// "Storage Tier" is 12 characters and "Architectural Unit" is 18.
			expect(columnWidths(table)).toEqual(["40%", "60%"]);
			for (const cell of table.querySelectorAll("th")) {
				expect(cell.style.whiteSpace).toBe("nowrap");
			}
		} finally {
			restore();
		}
	});

	it("gives a short first column less than half of a normal table", () => {
		const restore = mockHeaderTextWidth(10);
		try {
			const { root, table } = mountTable(null);
			table.innerHTML = [
				"<tr><th>API</th><th>Description</th></tr>",
				"<tr><td>API</td>",
				"<td>A long sentence that explains the term in detail and should take the rest of the row.</td></tr>",
			].join("");
			fitWideTables(root);
			expect(table.classList.contains("pagina-table-fixed")).toBe(true);
			const first = Number.parseFloat(columnWidths(table)[0] ?? "");
			expect(first).toBeLessThan(25);
		} finally {
			restore();
		}
	});

	it("moves one letter of width onto a short column from a neighbor above its floor", () => {
		const letter = 7;
		expect(shiftWordDeficits([120, 680], [letter, 0], [120, 80])).toEqual([120 + letter, 680 - letter]);
		expect(shiftWordDeficits([120, 80], [letter, 0], [120, 80])).toEqual([120, 80]);
	});

	it("gives a longer description more width than a multi-word role", () => {
		const restore = mockHeaderTextWidth(10);
		try {
			const { root, table } = mountTable(null);
			const role = "Owners / Controllers / Functional Leaders";
			table.innerHTML = [
				"<tr><th>Role</th><th>Accountability</th></tr>",
				`<tr><td>${role}</td>`,
				"<td>Accountable for ensuring that appropriate security controls are implemented to protect the organization assets and for determining classification levels.</td></tr>",
			].join("");
			fitWideTables(root);
			const widths = columnWidths(table).map((width) => Number.parseFloat(width));
			const oneLine = ((role.length * 10) / HOST_WIDTH) * 100;
			expect(widths[0]).toBeLessThan(oneLine);
			expect(widths[1]).toBeGreaterThan(widths[0] ?? 0);
		} finally {
			restore();
		}
	});

	it("keeps a normal column at least as wide as its longest word", () => {
		const restore = mockHeaderTextWidth(10);
		try {
			const { root, table } = mountTable(null);
			table.innerHTML = [
				"<tr><th>Authenticity</th><th>Meaning</th></tr>",
				"<tr><td>Authenticity</td>",
				"<td>Proves assets are legitimate and bona fide, and verifies that they are trusted and verified.</td></tr>",
			].join("");
			fitWideTables(root);
			const first = Number.parseFloat(columnWidths(table)[0] ?? "");
			expect(first).toBeGreaterThanOrEqual((("Authenticity".length * 10) / HOST_WIDTH) * 100);
		} finally {
			restore();
		}
	});

	it("pins a narrow cheat-sheet table instead of leaving it to auto layout", () => {
		const { root, table } = mountTable(3);
		setMinContent(table, 40);
		fitWideTables(root);
		expect(root.querySelector(".pagina-table-fit")).toBeNull();
		expect(table.classList.contains("pagina-table-fixed")).toBe(true);
		expect(columnWidths(table)).toEqual(["50%", "50%"]);
	});

	it("pins when the cheat sheet does not set a column count", () => {
		const { root, table } = mountTable(0);
		fitWideTables(root);
		expect(root.querySelector(".pagina-table-fit")).toBeNull();
		expect(table.classList.contains("pagina-table-fixed")).toBe(true);
	});

	it("gives a short label its longest word when the other columns are sentences", () => {
		const restore = mockHeaderTextWidth(10);
		try {
			const { root, table } = mountTable(3);
			table.innerHTML = [
				"<tr><th>Operator</th><th>Description</th><th>Purpose / Impact</th></tr>",
				"<tr><td>Shuffle / Exchange</td>",
				"<td>Redistributes data across cluster worker nodes so rows with the same key reside on the same node.</td>",
				"<td>Essential for distributed joins and aggregations, but introduces high network I/O cost.</td></tr>",
				"<tr><td>Broadcast Join</td><td>Replicates a small dataset.</td><td>Eliminates expensive network shuffles.</td></tr>",
				"<tr><td>Window Functions</td><td>Computes rolling metrics.</td><td>Analytical processing.</td></tr>",
			].join("");
			fitWideTables(root);
			expect(root.querySelector(".pagina-table-fit")).toBeNull();
			expect(table.classList.contains("pagina-table-fixed")).toBe(true);
			expect(table.classList.contains("pagina-table-full")).toBe(true);
			// Longest tokens: Broadcast (9), Redistributes (13), "aggregations," (13).
			expect(columnWidths(table)).toEqual(["25.714%", "37.143%", "37.143%"]);
		} finally {
			restore();
		}
	});

	it("splits a spanning cell across the columns it covers", () => {
		const restore = mockHeaderTextWidth(10);
		try {
			const { root, table } = mountTable(2);
			table.innerHTML =
				"<tr><th colspan='2'>abcdefghij</th></tr><tr><td>xxxx</td><td>yyyyyyyyyyyyyyyyyyyy</td></tr>";
			fitWideTables(root);
			expect(columnWidths(table)).toEqual(["20%", "80%"]);
		} finally {
			restore();
		}
	});

	it("skips a column already occupied by a rowspan", () => {
		const restore = mockHeaderTextWidth(10);
		try {
			const { root, table } = mountTable(3);
			table.innerHTML = "<tr><td rowspan='2'>aa</td><td>bbbb</td></tr><tr><td>cccc</td></tr>";
			fitWideTables(root);
			expect(columnWidths(table)).toEqual(["33.333%", "66.667%"]);
		} finally {
			restore();
		}
	});

	it("keeps a narrow column from collapsing", () => {
		const restore = mockHeaderTextWidth(10);
		try {
			const { root, table } = mountTable(4);
			const longCell = "y".repeat(100);
			table.innerHTML = `<tr><td>a</td><td>${longCell}</td></tr>`;
			fitWideTables(root);
			const widths = columnWidths(table).map((width) => Number.parseFloat(width));
			expect(widths[0]).toBeGreaterThan(7);
			expect(widths[0]).toBeLessThan(9);
			expect((widths[0] ?? 0) + (widths[1] ?? 0)).toBeCloseTo(100, 2);
		} finally {
			restore();
		}
	});
});
