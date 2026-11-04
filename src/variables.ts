import type { FrontMatterCache } from "obsidian";

export interface VariableContext {
	title: string;
	filename: string;
	page: number;
	pages: number;
	frontmatter: FrontMatterCache | Record<string, unknown>;
	now?: Date;
	/** Format used for a plain {{datetime}}. */
	datetimeFormat?: string;
	/** Heading in effect at the top of the page. Empty when that level has not started. */
	section?: string;
}

type DateTokenKind = "date" | "time" | "datetime";

export function renderTemplate(template: string, ctx: VariableContext): string {
	const now = ctx.now ?? new Date();

	let out = template;
	out = out.replace(/\{\{\s*title\s*\}\}/gi, ctx.title);
	out = out.replace(/\{\{\s*filename\s*\}\}/gi, ctx.filename);
	out = out.replace(/\{\{\s*page\s*\}\}/gi, String(ctx.page));
	out = out.replace(/\{\{\s*pages\s*\}\}/gi, String(ctx.pages));
	out = out.replace(/\{\{\s*datetime(?::([^}]+))?\s*\}\}/gi, (_m, format: string | undefined) => {
		const chosen = format?.trim() ? format : ctx.datetimeFormat;
		return formatDateToken(chosen, now, "datetime");
	});
	out = out.replace(/\{\{\s*time(?::([^}]+))?\s*\}\}/gi, (_m, format: string | undefined) =>
		formatDateToken(format, now, "time"),
	);
	out = out.replace(/\{\{\s*date(?::([^}]+))?\s*\}\}/gi, (_m, format: string | undefined) =>
		formatDateToken(format, now, "date"),
	);
	out = out.replace(/\{\{\s*property:([^}]+)\s*\}\}/gi, (_m, key: string) => {
		const fm = ctx.frontmatter as Record<string, unknown>;
		return resolvePropertyToken(key, fm);
	});
	out = out.replace(/\{\{\s*section\s*\}\}/gi, ctx.section ?? "");
	return out;
}

function formatDateToken(format: string | undefined, now: Date, kind: DateTokenKind): string {
	const key = (format ?? "").trim().toUpperCase();
	if (!key || key === "LOCALE") {
		if (kind === "date") return now.toLocaleDateString();
		if (kind === "time") return now.toLocaleTimeString();
		return now.toLocaleString();
	}
	const p = (n: number) => String(n).padStart(2, "0");
	const y = now.getFullYear();
	const mo = p(now.getMonth() + 1);
	const d = p(now.getDate());
	const hh = p(now.getHours());
	const mm = p(now.getMinutes());
	const ss = p(now.getSeconds());
	switch (key) {
		case "EPOCH":
			return String(Math.floor(now.getTime() / 1000));
		case "YYYYMMDD":
			return `${y}${mo}${d}`;
		case "YYYY-MM-DD":
			return `${y}-${mo}-${d}`;
		case "YYYYMMDD-HHMMSS":
			return `${y}${mo}${d}-${hh}${mm}${ss}`;
		case "YYYY-MM-DD HH:MM":
			return `${y}-${mo}-${d} ${hh}:${mm}`;
		case "YYYY-MM-DD HH:MM:SS":
			return `${y}-${mo}-${d} ${hh}:${mm}:${ss}`;
		case "HH:MM:SS":
			return `${hh}:${mm}:${ss}`;
		case "HH:MM":
			return `${hh}:${mm}`;
		case "HHMMSS":
			return `${hh}${mm}${ss}`;
		default:
			if (kind === "date") return now.toLocaleDateString();
			if (kind === "time") return now.toLocaleTimeString();
			return now.toLocaleString();
	}
}

const INDEXED_PROPERTY = /^([^[\]]+)\[(\s*\d+\s*)\]$/;

function hasOwnKey(frontmatter: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(frontmatter, key);
}

/**
 * Resolve one {{property:...}} key.
 * `tags` prints the whole value. `tags[0]` prints one list item, starting at 0.
 * A property whose name is literally `tags[0]` wins over indexing.
 * Indexed access throws when the index is invalid, the value is not a list, or the index is out of range.
 */
export function resolvePropertyToken(rawKey: string, frontmatter: Record<string, unknown> | null | undefined): string {
	const key = rawKey.trim();
	const fm = frontmatter ?? {};
	if (hasOwnKey(fm, key)) return formatPropertyValue(fm[key]);
	if (!key.includes("[")) return formatPropertyValue(fm[key]);

	const indexed = INDEXED_PROPERTY.exec(key);
	if (!indexed) throw new Error(`invalid property index in {{property:${key}}}`);
	const name = (indexed[1] ?? "").trim();
	const index = Number(indexed[2]);
	if (!name || !Number.isInteger(index)) throw new Error(`invalid property index in {{property:${key}}}`);
	const value = fm[name];
	if (!Array.isArray(value)) throw new Error(`${name} is not a list`);
	if (index >= value.length) throw new Error(`${name}[${index}] is out of range (${value.length} items)`);
	return formatPropertyValue(value[index]);
}

/** Problems in indexed {{property:...}} tokens. Whole-list tokens that are missing stay blank and are not errors. */
export function propertyTokenErrors(templates: string[], frontmatter: object | null | undefined): string[] {
	const fm = (frontmatter ?? {}) as Record<string, unknown>;
	const errors: string[] = [];
	for (const template of templates) {
		if (!template) continue;
		for (const match of template.matchAll(/\{\{\s*property:([^}]+)\s*\}\}/gi)) {
			try {
				resolvePropertyToken(match[1] ?? "", fm);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (!errors.includes(message)) errors.push(message);
			}
		}
	}
	return errors;
}

/** Text for a frontmatter value. Lists join with commas. Objects are blank. */
export function formatPropertyValue(value: unknown): string {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		return value
			.map((item) => formatPropertyValue(item))
			.filter((item) => item !== "")
			.join(", ");
	}
	return "";
}

export interface PropertyRow {
	key: string;
	value: string;
}

const HIDDEN_PROPERTY_KEYS = new Set(["position"]);

/** Printable properties, in frontmatter order. Skips Obsidian's internal position and blank values. */
export function propertyRows(frontmatter: object | null | undefined): PropertyRow[] {
	if (!frontmatter) return [];
	const rows: PropertyRow[] = [];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (HIDDEN_PROPERTY_KEYS.has(key)) continue;
		const text = formatPropertyValue(value);
		if (!text) continue;
		rows.push({ key, value: text });
	}
	return rows;
}

/**
 * Printed note title.
 * A typed override wins. A blank override falls back to the file name.
 * With no override, a non-empty string `title` property wins, then the file name.
 */
export function resolveNoteTitle(
	frontmatter: object | null | undefined,
	basename: string,
	override?: string | null,
): string {
	if (override != null) {
		const typed = override.trim();
		return typed || basename;
	}
	const title = frontmatter ? (frontmatter as Record<string, unknown>).title : undefined;
	if (typeof title === "string" && title) return title;
	return basename;
}

export function formatTimestamp(format: string, date: Date = new Date()): string {
	if (!format || format === "none" || format === "locale") return "";
	return formatDateToken(format, date, "datetime");
}

export const VARIABLE_HINT =
	"Variables: {{title}}, {{filename}}, {{section}}, {{page}}, {{pages}}, {{date}}, {{date:YYYYMMDD}}, {{date:YYYY-MM-DD}}, {{time}}, {{time:HH:MM}}, {{time:HH:MM:SS}}, {{time:HHMMSS}}, {{datetime}}, {{datetime:EPOCH}}, {{datetime:YYYYMMDD}}, {{datetime:YYYY-MM-DD}}, {{datetime:YYYYMMDD-HHMMSS}}, {{property:key}}, {{property:key[0]}}";
