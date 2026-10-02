import { jsPDF } from "jspdf";

/** Word-style header and footer rules. Each id is one row of the border gallery. */
export type HeaderBorderStyle =
	| "none"
	| "hairline"
	| "single"
	| "dotted"
	| "dashed-small"
	| "dashed-large"
	| "dash-dot"
	| "dash-dot-dot"
	| "double"
	| "thin-thick-small"
	| "thick-thin-small"
	| "thin-thick-thin-small"
	| "thin-thick-medium"
	| "thick-thin-medium"
	| "thin-thick-thin-medium"
	| "thin-thick-large"
	| "thick-thin-large"
	| "thin-thick-thin-large"
	| "wavy"
	| "double-wavy"
	| "dash-dot-stroked"
	| "emboss"
	| "engrave"
	| "outset"
	| "inset";

export interface HeaderBorderOption {
	id: HeaderBorderStyle;
	label: string;
	/** Vertical space the rule needs, added to the header or footer margin. */
	extentMm: number;
}

export const HEADER_BORDERS: HeaderBorderOption[] = [
	{ id: "none", label: "No border", extentMm: 0 },
	{ id: "hairline", label: "Hairline", extentMm: 0.35 },
	{ id: "single", label: "Single", extentMm: 0.5 },
	{ id: "dotted", label: "Dotted", extentMm: 0.55 },
	{ id: "dashed-small", label: "Dashed (small gap)", extentMm: 0.55 },
	{ id: "dashed-large", label: "Dashed (large gap)", extentMm: 0.6 },
	{ id: "dash-dot", label: "Dash-dot", extentMm: 0.55 },
	{ id: "dash-dot-dot", label: "Dash-dot-dot", extentMm: 0.55 },
	{ id: "double", label: "Double", extentMm: 1.3 },
	{ id: "thin-thick-small", label: "Thin-thick (small gap)", extentMm: 1.6 },
	{ id: "thick-thin-small", label: "Thick-thin (small gap)", extentMm: 1.6 },
	{ id: "thin-thick-thin-small", label: "Thin-thick-thin (small gap)", extentMm: 2.1 },
	{ id: "thin-thick-medium", label: "Thin-thick (medium gap)", extentMm: 2.2 },
	{ id: "thick-thin-medium", label: "Thick-thin (medium gap)", extentMm: 2.2 },
	{ id: "thin-thick-thin-medium", label: "Thin-thick-thin (medium gap)", extentMm: 2.9 },
	{ id: "thin-thick-large", label: "Thin-thick (large gap)", extentMm: 3.0 },
	{ id: "thick-thin-large", label: "Thick-thin (large gap)", extentMm: 3.0 },
	{ id: "thin-thick-thin-large", label: "Thin-thick-thin (large gap)", extentMm: 3.8 },
	{ id: "wavy", label: "Wavy", extentMm: 2.0 },
	{ id: "double-wavy", label: "Double wavy", extentMm: 3.2 },
	{ id: "dash-dot-stroked", label: "Dash-dot stroked", extentMm: 1.5 },
	{ id: "emboss", label: "Emboss", extentMm: 1.6 },
	{ id: "engrave", label: "Engrave", extentMm: 1.6 },
	{ id: "outset", label: "Outset", extentMm: 1.2 },
	{ id: "inset", label: "Inset", extentMm: 1.2 },
];

const BORDER_BY_ID = new Map(HEADER_BORDERS.map((entry) => [entry.id, entry]));

const LEGACY_STYLES: Record<string, HeaderBorderStyle> = {
	none: "none",
	solid: "single",
	dashed: "dashed-small",
	dotted: "dotted",
	double: "double",
};

const MM_TO_PX = 96 / 25.4;

interface Stroke {
	/** Distance from the top of the band to the stroke center, mm. */
	yMm: number;
	widthMm: number;
	dashMm?: number[];
	color: string;
	kind: "line" | "wave" | "hatch";
	/** Wave or hatch amplitude uses the full band when set. */
	bandMm?: number;
}

export function normalizeBorderStyle(value: unknown): HeaderBorderStyle {
	const raw = String(value ?? "none");
	if (BORDER_BY_ID.has(raw as HeaderBorderStyle)) return raw as HeaderBorderStyle;
	return LEGACY_STYLES[raw] ?? "none";
}

export function borderExtentMm(style: unknown): number {
	return BORDER_BY_ID.get(normalizeBorderStyle(style))?.extentMm ?? 0;
}

export function borderSvg(style: unknown, color: unknown): string {
	const id = normalizeBorderStyle(style);
	const extent = borderExtentMm(id);
	if (extent <= 0) return "";
	const strokes = strokesFor(id, sanitizeColor(color));
	const heightPx = roundPx(extent * MM_TO_PX);
	const body = strokes.map((stroke) => strokeSvg(stroke, heightPx, extent)).join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${heightPx}" style="display:block">${body}</svg>`;
}

/** Draw the rule across the content width. `yMm` is the top of the border band. */
export function drawBorderBand(
	pdf: jsPDF,
	style: unknown,
	color: unknown,
	xMm: number,
	yMm: number,
	widthMm: number,
): void {
	const id = normalizeBorderStyle(style);
	const extent = borderExtentMm(id);
	if (extent <= 0 || widthMm <= 0) return;
	const strokes = strokesFor(id, sanitizeColor(color));
	for (const stroke of strokes) {
		const [r, g, b] = hexRgb(stroke.color);
		pdf.setDrawColor(r, g, b);
		pdf.setLineWidth(Math.max(0.05, stroke.widthMm));
		pdf.setLineDashPattern(stroke.dashMm ?? [], 0);
		pdf.setLineCap(stroke.kind === "line" && stroke.dashMm ? "round" : "butt");
		if (stroke.kind === "wave") {
			drawWave(pdf, xMm, yMm + stroke.yMm, widthMm, stroke.bandMm ?? extent * 0.7);
		} else if (stroke.kind === "hatch") {
			drawHatch(pdf, xMm, yMm, widthMm, extent);
		} else {
			const y = yMm + stroke.yMm;
			pdf.line(xMm, y, xMm + widthMm, y);
		}
	}
	pdf.setLineDashPattern([], 0);
	pdf.setLineCap("butt");
}

function strokesFor(style: HeaderBorderStyle, color: string): Stroke[] {
	const line = (yMm: number, widthMm: number, dashMm?: number[]): Stroke => ({
		yMm,
		widthMm,
		dashMm,
		color,
		kind: "line",
	});
	switch (style) {
		case "none":
			return [];
		case "hairline":
			return [line(0.18, 0.09)];
		case "single":
			return [line(0.25, 0.3)];
		case "dotted":
			return [line(0.28, 0.35, [0.15, 1.1])];
		case "dashed-small":
			return [line(0.28, 0.35, [1.6, 0.9])];
		case "dashed-large":
			return [line(0.3, 0.35, [3.2, 2.0])];
		case "dash-dot":
			return [line(0.28, 0.35, [2.8, 0.9, 0.2, 0.9])];
		case "dash-dot-dot":
			return [line(0.28, 0.35, [2.8, 0.8, 0.2, 0.8, 0.2, 0.8])];
		case "double":
			return [line(0.2, 0.25), line(1.05, 0.25)];
		case "thin-thick-small":
			return [line(0.15, 0.2), line(1.15, 0.7)];
		case "thick-thin-small":
			return [line(0.45, 0.7), line(1.4, 0.2)];
		case "thin-thick-thin-small":
			return [line(0.15, 0.2), line(0.95, 0.65), line(1.9, 0.2)];
		case "thin-thick-medium":
			return [line(0.15, 0.2), line(1.7, 0.7)];
		case "thick-thin-medium":
			return [line(0.45, 0.7), line(2.0, 0.2)];
		case "thin-thick-thin-medium":
			return [line(0.15, 0.2), line(1.3, 0.65), line(2.7, 0.2)];
		case "thin-thick-large":
			return [line(0.15, 0.2), line(2.45, 0.7)];
		case "thick-thin-large":
			return [line(0.45, 0.7), line(2.8, 0.2)];
		case "thin-thick-thin-large":
			return [line(0.15, 0.2), line(1.7, 0.7), line(3.55, 0.2)];
		case "wavy":
			return [{ yMm: 1.0, widthMm: 0.3, color, kind: "wave", bandMm: 1.4 }];
		case "double-wavy":
			return [
				{ yMm: 0.8, widthMm: 0.28, color, kind: "wave", bandMm: 1.2 },
				{ yMm: 2.3, widthMm: 0.28, color, kind: "wave", bandMm: 1.2 },
			];
		case "dash-dot-stroked":
			return [{ yMm: 0, widthMm: 0.35, color, kind: "hatch", bandMm: 1.5 }];
		case "emboss":
			return [lineShade(0.25, 0.35, color, 0.55), lineShade(1.2, 0.45, color, -0.45)];
		case "engrave":
			return [lineShade(0.25, 0.45, color, -0.45), lineShade(1.2, 0.35, color, 0.55)];
		case "outset":
			return [lineShade(0.2, 0.25, color, 0.6), lineShade(0.9, 0.3, color, -0.35)];
		case "inset":
			return [lineShade(0.2, 0.3, color, -0.35), lineShade(0.9, 0.25, color, 0.6)];
		default:
			return [];
	}
}

function lineShade(yMm: number, widthMm: number, color: string, amount: number): Stroke {
	return { yMm, widthMm, color: shadeHex(color, amount), kind: "line" };
}

function strokeSvg(stroke: Stroke, heightPx: number, extentMm: number): string {
	const y = roundPx(stroke.yMm * MM_TO_PX);
	const width = roundPx(Math.max(0.4, stroke.widthMm * MM_TO_PX));
	if (stroke.kind === "hatch") {
		const tile = 5;
		return `<defs><pattern id="pagina-hatch" patternUnits="userSpaceOnUse" width="${tile}" height="${heightPx}"><line x1="0" y1="${heightPx}" x2="${tile}" y2="0" stroke="${stroke.color}" stroke-width="${width}"/></pattern></defs><rect width="100%" height="100%" fill="url(#pagina-hatch)"/>`;
	}
	if (stroke.kind === "wave") {
		const ampPx = roundPx(((stroke.bandMm ?? extentMm) / 2) * MM_TO_PX);
		const tile = 14;
		const mid = y;
		const top = Math.max(0, mid - ampPx);
		const pid = stroke.yMm > extentMm / 2 ? "pagina-wave-b" : "pagina-wave-a";
		return `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="${tile}" height="${heightPx}"><path d="M0 ${mid} Q ${tile / 4} ${top} ${tile / 2} ${mid} T ${tile} ${mid}" fill="none" stroke="${stroke.color}" stroke-width="${width}"/></pattern></defs><rect width="100%" height="100%" fill="url(#${pid})"/>`;
	}
	const dash = stroke.dashMm?.length ? ` stroke-dasharray="${stroke.dashMm.map((n) => roundPx(n * MM_TO_PX)).join(" ")}"` : "";
	const cap = stroke.dashMm?.length ? ` stroke-linecap="round"` : "";
	return `<line x1="0" y1="${y}" x2="100%" y2="${y}" stroke="${stroke.color}" stroke-width="${width}"${dash}${cap}/>`;
}

function drawWave(pdf: jsPDF, x: number, midY: number, width: number, amp: number): void {
	const step = 0.6;
	const period = 3.2;
	for (let i = 0; i < width; i += step) {
		const x0 = x + i;
		const x1 = x + Math.min(width, i + step);
		const y0 = midY + Math.sin((i / period) * Math.PI * 2) * (amp / 2);
		const y1 = midY + Math.sin(((i + step) / period) * Math.PI * 2) * (amp / 2);
		pdf.line(x0, y0, x1, y1);
	}
}

function drawHatch(pdf: jsPDF, x: number, y: number, width: number, height: number): void {
	const step = 1.3;
	for (let i = 0; i < width; i += step) {
		const x0 = x + i;
		const x1 = x + Math.min(width, i + step);
		pdf.line(x0, y + height, x1, y);
	}
}

function sanitizeColor(value: unknown): string {
	const raw = String(value ?? "").trim();
	return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : "#000000";
}

function shadeHex(hex: string, amount: number): string {
	const [r, g, b] = hexRgb(hex);
	const mix = (channel: number) => {
		const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
		return Math.round(Math.min(255, Math.max(0, next)));
	};
	return `#${[mix(r), mix(g), mix(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function hexRgb(hex: string): [number, number, number] {
	const raw = sanitizeColor(hex).slice(1);
	return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function roundPx(n: number): number {
	return Math.round(n * 100) / 100;
}
