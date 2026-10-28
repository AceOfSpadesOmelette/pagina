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
		const k = key.trim();
		const fm = ctx.frontmatter as Record<string, unknown>;
		const val = fm?.[k];
		if (val == null) return "";
		if (Array.isArray(val)) return val.filter((item) => typeof item === "string").join(", ");
		if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
		return "";
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

export function formatTimestamp(format: string, date: Date = new Date()): string {
	if (!format || format === "none" || format === "locale") return "";
	return formatDateToken(format, date, "datetime");
}

export const VARIABLE_HINT =
	"Variables: {{title}}, {{filename}}, {{section}}, {{page}}, {{pages}}, {{date}}, {{date:YYYYMMDD}}, {{date:YYYY-MM-DD}}, {{time}}, {{time:HH:MM}}, {{time:HH:MM:SS}}, {{time:HHMMSS}}, {{datetime}}, {{datetime:EPOCH}}, {{datetime:YYYYMMDD}}, {{datetime:YYYY-MM-DD}}, {{datetime:YYYYMMDD-HHMMSS}}, {{property:key}}";
