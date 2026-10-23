import { readFileSync } from "fs";
import { join } from "path";
import { Platform } from "obsidian";
import { applyCheatSheetClasses, applyContinuousText } from "../src/cheat-sheet";
import { contentBoxHasText } from "../src/blank-page";
import { sanitizeCssText } from "../src/css-sanitize";
import { computePageLayout } from "../src/paginate";
import { effectiveLandscape, resolvePageSizeMm, validateLayout } from "../src/page-presets";
import { CHEAT_SHEET_CSS, PRINT_CSS } from "../src/print-styles";
import { applyH1StyleClasses, labelCodeBlockLanguages } from "../src/render";
import { isPhoneSession } from "../src/session";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/types";
import { formatTimestamp, renderTemplate } from "../src/variables";

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

	it("formats timestamps", () => {
		expect(formatTimestamp("YYYY-MM-DD", now)).toBe("2026-01-02");
		expect(formatTimestamp("HH:MM:SS", now)).toBe("15:04:05");
		expect(formatTimestamp("none", now)).toBe("");
	});
});

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
		expect(settings.cheatSheetFontSizePt).toBe(8);
		expect(settings.cheatSheetUniformText).toBe(true);
	});

	it("clamps cheat sheet text size and density", () => {
		const settings = normalizeSettings({
			cheatSheet: true,
			cheatSheetDensity: "continuous",
			cheatSheetFontSizePt: 3,
			cheatSheetUniformText: false,
		});
		expect(settings.cheatSheet).toBe(true);
		expect(settings.cheatSheetDensity).toBe("continuous");
		expect(settings.cheatSheetFontSizePt).toBe(6);
		expect(settings.cheatSheetUniformText).toBe(false);
		expect(normalizeSettings({ cheatSheetFontSizePt: 40 }).cheatSheetFontSizePt).toBe(14);
		expect(normalizeSettings({ cheatSheetDensity: "nope" }).cheatSheetDensity).toBe("compact");
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
	it("forces landscape without changing a portrait page setting", () => {
		expect(effectiveLandscape({ landscape: false, cheatSheet: true })).toBe(true);
		expect(effectiveLandscape({ landscape: false, cheatSheet: false })).toBe(false);
		const portrait = computePageLayout({ ...DEFAULT_SETTINGS, landscape: false, cheatSheet: false });
		const sheet = computePageLayout({ ...DEFAULT_SETTINGS, landscape: false, cheatSheet: true });
		expect(sheet.pageWidthMm).toBe(portrait.pageHeightMm);
		expect(sheet.pageHeightMm).toBe(portrait.pageWidthMm);
	});

	it("mirrors the three-column rules in styles.css", () => {
		const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
		for (const marker of [
			"column-count: 3",
			"column-fill: auto",
			"pagina-uniform-text",
			"--pagina-cheat-font-size",
			"--table-text-size: 1em",
			"page-break-inside: auto",
			"break-after: avoid-page",
			"padding: 0 !important",
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
			cheatSheetFontSizePt: 9,
			cheatSheetUniformText: true,
		});
		expect(el.classList.contains("pagina-break-h1")).toBe(false);
		expect(el.classList.contains("pagina-cheat-sheet")).toBe(true);
		expect(el.classList.contains("pagina-cheat-compact")).toBe(true);
		expect(el.classList.contains("pagina-uniform-text")).toBe(true);
		expect(el.style.getPropertyValue("--pagina-cheat-font-size")).toBe("9pt");
		applyCheatSheetClasses(el, { cheatSheet: false });
		expect(el.classList.contains("pagina-cheat-sheet")).toBe(false);
		expect(el.style.getPropertyValue("--pagina-cheat-font-size")).toBe("");
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
