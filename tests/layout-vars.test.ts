import { readFileSync } from "fs";
import { join } from "path";
import { Platform } from "obsidian";
import { applyCheatSheetClasses, applyContinuousText, markCompactSpacers } from "../src/cheat-sheet";
import { contentBoxHasText } from "../src/blank-page";
import { sanitizeCssText } from "../src/css-sanitize";
import { computePageLayout } from "../src/paginate";
import { effectiveLandscape, resolvePageSizeMm, validateLayout } from "../src/page-presets";
import {
	applyHeaderLinePreference,
	cheatSheetColumnWidth,
	CHEAT_SHEET_CSS,
	fitWideTables,
	headerLineFits,
	PRINT_CSS,
} from "../src/print-styles";
import { applyH1StyleClasses, labelCodeBlockLanguages } from "../src/render";
import { isPhoneSession } from "../src/session";
import { DEFAULT_SETTINGS, clampCheatSheetColumns, normalizeSettings } from "../src/types";
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
		expect(settings.cheatSheetColumns).toBe(3);
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
			"page-break-inside: auto",
			"page-break-after: avoid",
			"padding: 0",
			"pagina-cheat-sheet hr",
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
			cheatSheetColumns: 4,
			landscape: true,
			cheatSheetUniformText: true,
		});
		expect(el.classList.contains("pagina-break-h1")).toBe(false);
		expect(el.classList.contains("pagina-cheat-sheet")).toBe(true);
		expect(el.classList.contains("pagina-cheat-compact")).toBe(true);
		expect(el.classList.contains("pagina-uniform-text")).toBe(true);
		expect(el.style.getPropertyValue("--pagina-cheat-font-size")).toBe("9pt");
		expect(el.style.getPropertyValue("--pagina-cheat-columns")).toBe("4");
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

	it("marks a paragraph that is only a line break", () => {
		const root = document.createElement("div");
		root.innerHTML = "<p>kept</p><p><br></p><p>also</p>";
		markCompactSpacers(root);
		expect(root.querySelector("p.pagina-spacer-line")?.innerHTML).toBe("<br>");
		expect(root.querySelectorAll("p.pagina-spacer-line")).toHaveLength(1);
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

	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("scales a table that fits the page but not one cheat-sheet column", () => {
		const restore = mockHeaderTextWidth(20);
		const zoom = captureZoom();
		try {
			const { root, table } = mountTable(4);
			fitWideTables(root);
			const wrap = root.querySelector(".pagina-table-fit");
			expect(wrap).toBeInstanceOf(HTMLElement);
			const fit = wrap as HTMLElement;
			const column = cheatSheetColumnWidth(HOST_WIDTH, 4);
			expect(column).toBeLessThan(MIN_CONTENT);
			expect(MIN_CONTENT).toBeLessThan(HOST_WIDTH);
			expect(zoom.value()).toBeCloseTo(column / MIN_CONTENT, 5);
			expect(fit.style.width).toBe(`${MIN_CONTENT}px`);
			expect(fit.style.maxWidth).toBe("none");
			expect(table.classList.contains("pagina-table-natural")).toBe(true);
			for (const cell of table.querySelectorAll("th")) {
				expect(cell.style.whiteSpace).toBe("normal");
				expect(cell.style.overflowWrap).toBe("break-word");
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
			expect(table.classList.contains("pagina-table-full")).toBe(true);
			for (const cell of table.querySelectorAll("th")) {
				expect(cell.style.whiteSpace).toBe("nowrap");
			}
		} finally {
			restore();
		}
	});

	it("does not scale a cheat-sheet table that already fits one column", () => {
		const { root, table } = mountTable(4);
		setMinContent(table, 40);
		fitWideTables(root);
		expect(root.querySelector(".pagina-table-fit")).toBeNull();
		expect(table.classList.contains("pagina-table-full")).toBe(true);
	});

	it("defaults to three columns when the cheat sheet does not set a count", () => {
		const zoom = captureZoom();
		try {
			const { root } = mountTable(0);
			fitWideTables(root);
			expect(root.querySelector(".pagina-table-fit")).toBeInstanceOf(HTMLElement);
			expect(zoom.value()).toBeCloseTo(cheatSheetColumnWidth(HOST_WIDTH, 3) / MIN_CONTENT, 5);
		} finally {
			zoom.restore();
		}
	});
});
