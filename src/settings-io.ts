import { normalizeSettings, type PaginaSettings } from "./types";

const EXPORT_FILENAME = "pagina-settings.json";

export function settingsToJson(settings: PaginaSettings): string {
	return JSON.stringify(settings, null, 2);
}

/** Parse a settings file. Throws if the payload is not a JSON object. */
export function parseSettingsJson(text: string): PaginaSettings {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("Invalid JSON");
	}
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Settings file must be a JSON object");
	}
	return normalizeSettings(raw);
}

/** Copy a normalized settings object onto the live settings reference. */
export function applyImportedSettings(target: PaginaSettings, next: PaginaSettings): void {
	Object.assign(target, next);
}

export function downloadSettingsJson(settings: PaginaSettings): void {
	const blob = new Blob([settingsToJson(settings)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = createEl("a");
	link.href = url;
	link.download = EXPORT_FILENAME;
	link.click();
	URL.revokeObjectURL(url);
}
