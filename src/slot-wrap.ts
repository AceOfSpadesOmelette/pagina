import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** 9px at 96dpi, matching the stamped header and footer line. */
export const STAMP_SLOT_FONT_PT = 6.75;
/** Raster header and footer size. Its 1.2 leading matches one header line. */
export const RASTER_SLOT_FONT_PT = 9;

/** Width of one header or footer slot. Left, center, and right share the content width equally. */
export function slotColumnWidth(contentWidth: number): number {
	return Math.max(0, contentWidth) / 3;
}

/** Left edge of each slot, in the same units as the content box. */
export function slotLeftEdges(contentLeft: number, contentWidth: number): [number, number, number] {
	const column = slotColumnWidth(contentWidth);
	return [contentLeft, contentLeft + column, contentLeft + column * 2];
}

/**
 * Break text into lines that fit `maxWidth`. Breaks at spaces, then inside a word
 * that is wider than the column. Every measurable character is kept.
 */
export function wrapSlotText(
	text: string,
	widthOf: (sample: string) => number | null,
	maxWidth: number,
): string[] {
	if (!text || maxWidth <= 0) return [];
	const kept = keepMeasurable(text, widthOf);
	if (!kept) return [];
	const words = kept.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";
	const take = (piece: string) => {
		if (!current) {
			current = piece;
			return;
		}
		const candidate = `${current} ${piece}`;
		const width = widthOf(candidate);
		if (width == null || width > maxWidth) {
			lines.push(current);
			current = piece;
			return;
		}
		current = candidate;
	};
	for (const word of words) {
		for (const piece of breakWord(word, widthOf, maxWidth)) take(piece);
	}
	if (current) lines.push(current);
	return lines;
}

/** How many lines the widest slot needs. A displayed edge always keeps at least one. */
export function slotLineCount(
	texts: readonly string[],
	widthOf: (sample: string) => number | null,
	columnWidth: number,
): number {
	let count = 1;
	for (const text of texts) count = Math.max(count, wrapSlotText(text, widthOf, columnWidth).length);
	return count;
}

/** The string that takes the most width. */
export function widestText(texts: readonly string[], widthOf: (sample: string) => number | null): string {
	let best = "";
	let bestWidth = -1;
	for (const text of texts) {
		const width = widthOf(text);
		const score = width ?? text.length;
		if (score > bestWidth) {
			best = text;
			bestWidth = score;
		}
	}
	return best;
}

/** Measure with the embedded face, or Helvetica when that face is missing. */
export async function widthOfFont(
	bytes: Uint8Array | null,
	size: number,
): Promise<(text: string) => number | null> {
	const doc = await PDFDocument.create();
	let font;
	try {
		if (bytes) {
			doc.registerFontkit(fontkit);
			font = await doc.embedFont(bytes);
		} else {
			font = await doc.embedFont(StandardFonts.Helvetica);
		}
	} catch {
		font = await doc.embedFont(StandardFonts.Helvetica);
	}
	return (text: string) => {
		try {
			return font.widthOfTextAtSize(text, size);
		} catch {
			return null;
		}
	};
}

function keepMeasurable(text: string, widthOf: (sample: string) => number | null): string {
	let kept = "";
	for (const ch of Array.from(text)) {
		if (/\s/.test(ch)) {
			kept += " ";
			continue;
		}
		if (widthOf(ch) == null) continue;
		kept += ch;
	}
	return kept;
}

function breakWord(
	word: string,
	widthOf: (sample: string) => number | null,
	maxWidth: number,
): string[] {
	const whole = widthOf(word);
	if (whole != null && whole <= maxWidth) return [word];
	const parts: string[] = [];
	let chunk = "";
	for (const ch of Array.from(word)) {
		const next = chunk + ch;
		const width = widthOf(next);
		if (chunk && (width == null || width > maxWidth)) {
			parts.push(chunk);
			chunk = ch;
			continue;
		}
		chunk = next;
	}
	if (chunk) parts.push(chunk);
	return parts;
}
