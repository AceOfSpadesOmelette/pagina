import { readFileSync } from "fs";
import { join } from "path";
import { LIGHT_PRINT_SURFACE_VARS, PRINT_CSS } from "../src/print-styles";
import { getDerivedLightVars } from "../src/render";
import { applyImportedSettings, parseSettingsJson, settingsToJson } from "../src/settings-io";
import { DEFAULT_SETTINGS, type PaginaSettings } from "../src/types";

describe("settings import", () => {
	it("round-trips settings through JSON", () => {
		const settings: PaginaSettings = {
			...DEFAULT_SETTINGS,
			landscape: true,
			pageSize: "Letter",
			header: { ...DEFAULT_SETTINGS.header, center: "{{filename}}" },
		};
		const parsed = parseSettingsJson(settingsToJson(settings));
		expect(parsed.landscape).toBe(true);
		expect(parsed.pageSize).toBe("Letter");
		expect(parsed.header.center).toBe("{{filename}}");
		expect(parsed.footer.center).toBe(DEFAULT_SETTINGS.footer.center);
	});

	it("fills missing fields from defaults", () => {
		const parsed = parseSettingsJson('{"pageSize":"A5"}');
		expect(parsed.pageSize).toBe("A5");
		expect(parsed.landscape).toBe(false);
		expect(parsed.displayFooter).toBe(true);
	});

	it("rejects non-object payloads", () => {
		expect(() => parseSettingsJson("[]")).toThrow(/JSON object/);
		expect(() => parseSettingsJson("null")).toThrow(/JSON object/);
		expect(() => parseSettingsJson("{")).toThrow(/Invalid JSON/);
	});

	it("writes imported values onto the existing settings object", () => {
		const target = { ...DEFAULT_SETTINGS, header: { ...DEFAULT_SETTINGS.header }, footer: { ...DEFAULT_SETTINGS.footer } };
		const next = parseSettingsJson('{"landscape":true,"pageSize":"Legal"}');
		applyImportedSettings(target, next);
		expect(target.landscape).toBe(true);
		expect(target.pageSize).toBe("Legal");
	});
});

describe("light print surface", () => {
	it("forces readable interactive colors in print CSS and styles.css", () => {
		const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
		for (const [prop, value] of Object.entries(LIGHT_PRINT_SURFACE_VARS)) {
			const decl = `${prop}: ${value}`;
			expect(PRINT_CSS.split(decl).length - 1).toBeGreaterThanOrEqual(2);
			expect(css.split(decl).length - 1).toBeGreaterThanOrEqual(2);
		}
	});

	it("includes light interactive tokens in the derived light-vars patch", () => {
		const vars = getDerivedLightVars();
		expect(vars["--interactive-normal"]).toBe("#f2f3f5");
		expect(vars["--text-on-accent"]).toBe("#ffffff");
		expect(vars["--text-normal"]).toBe("#222222");
	});
});
