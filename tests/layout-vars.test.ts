import { sanitizeCssText } from "../src/css-sanitize";
import {
	resolvePageSizeMm,
	validateLayout,
} from "../src/page-presets";
import { normalizeSettings } from "../src/types";
import { formatTimestamp, renderTemplate } from "../src/variables";
import { isPhoneSession } from "../src/session";
import { Platform } from "obsidian";

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
