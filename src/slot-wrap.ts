import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** 9px at 96dpi, the default header and footer size. */
export const STAMP_SLOT_FONT_PT = 6.75;

/** Width of one header or footer slot when all three are occupied. */
export function slotColumnWidth(contentWidth: number): number {
	return Math.max(0, contentWidth) / 3;
}

/** Left edge of each equal third, in the same units as the content box. */
export function slotLeftEdges(contentLeft: number, contentWidth: number): [number, number, number] {
	const column = slotColumnWidth(contentWidth);
	return [contentLeft, contentLeft + column, contentLeft + column * 2];
}

export interface SlotSpan {
	/** Width of this slot. */
	width: number;
	/** Left edge relative to the content box. */
	left: number;
}

/**
 * Give each occupied slot its third, then let it grow into neighboring empty
 * slots by only as much as it needs to fit on one line. An empty run passes
 * through, so an empty left and center are both available to the right.
 * A filled slot never gives up its own third. Three filled slots stay equal.
 */
export function allocateSlotSpans(
	contentWidth: number,
	textWidths: readonly [number, number, number],
	occupied: readonly [boolean, boolean, boolean],
): [SlotSpan, SlotSpan, SlotSpan] {
	const width = Math.max(0, contentWidth);
	const third = width / 3;
	const widths: [number, number, number] = [third, third, third];
	const shortfall: [number, number, number] = [0, 0, 0];
	for (let i = 0; i < 3; i++) {
		if (!occupied[i]) continue;
		shortfall[i] = Math.max(0, (textWidths[i] ?? 0) - third);
	}

	let index = 0;
	while (index < 3) {
		if (occupied[index]) {
			index += 1;
			continue;
		}
		const start = index;
		while (index < 3 && !occupied[index]) index += 1;
		grantEmptyRun(widths, shortfall, occupied, start, index - 1);
	}

	const spans: SlotSpan[] = [];
	let left = 0;
	for (let i = 0; i < 3; i++) {
		const slotWidth = Math.max(0, widths[i] ?? 0);
		spans.push({ width: slotWidth, left });
		left += slotWidth;
	}
	return [spans[0]!, spans[1]!, spans[2]!];
}

/** Measure rendered slot text and allocate spans in the same units as `widthOf`. */
export function slotSpansForTexts(
	contentWidth: number,
	texts: readonly [string, string, string],
	widthOf: (sample: string) => number | null,
): [SlotSpan, SlotSpan, SlotSpan] {
	const textWidths: [number, number, number] = [0, 0, 0];
	const occupied: [boolean, boolean, boolean] = [false, false, false];
	for (let i = 0; i < 3; i++) {
		const text = (texts[i] ?? "").trim();
		if (!text) continue;
		occupied[i] = true;
		textWidths[i] = widthOf(text) ?? text.length;
	}
	return allocateSlotSpans(contentWidth, textWidths, occupied);
}

function grantEmptyRun(
	widths: [number, number, number],
	shortfall: [number, number, number],
	occupied: readonly [boolean, boolean, boolean],
	start: number,
	end: number,
): void {
	const leftNeighbor = start > 0 && occupied[start - 1] ? start - 1 : -1;
	const rightNeighbor = end < 2 && occupied[end + 1] ? end + 1 : -1;
	const claimants: number[] = [];
	if (leftNeighbor >= 0 && (shortfall[leftNeighbor] ?? 0) > 0) claimants.push(leftNeighbor);
	if (rightNeighbor >= 0 && (shortfall[rightNeighbor] ?? 0) > 0) claimants.push(rightNeighbor);
	if (claimants.length === 0) return;

	const pool = widths.slice(start, end + 1).reduce((sum, value) => sum + value, 0);
	const need = claimants.reduce((sum, i) => sum + (shortfall[i] ?? 0), 0);
	if (!(pool > 0) || !(need > 0)) return;

	const grants = new Map<number, number>();
	for (const i of claimants) {
		const share = need <= pool ? (shortfall[i] ?? 0) : (pool * (shortfall[i] ?? 0)) / need;
		grants.set(i, share);
	}

	let grantLeft = leftNeighbor >= 0 ? (grants.get(leftNeighbor) ?? 0) : 0;
	let grantRight = rightNeighbor >= 0 ? (grants.get(rightNeighbor) ?? 0) : 0;
	for (let i = start; i <= end && grantLeft > 0; i++) {
		const take = Math.min(widths[i] ?? 0, grantLeft);
		widths[i] = (widths[i] ?? 0) - take;
		grantLeft -= take;
	}
	for (let i = end; i >= start && grantRight > 0; i--) {
		const take = Math.min(widths[i] ?? 0, grantRight);
		widths[i] = (widths[i] ?? 0) - take;
		grantRight -= take;
	}
	if (leftNeighbor >= 0) {
		const grant = grants.get(leftNeighbor) ?? 0;
		widths[leftNeighbor] = (widths[leftNeighbor] ?? 0) + grant;
		shortfall[leftNeighbor] = Math.max(0, (shortfall[leftNeighbor] ?? 0) - grant);
	}
	if (rightNeighbor >= 0) {
		const grant = grants.get(rightNeighbor) ?? 0;
		widths[rightNeighbor] = (widths[rightNeighbor] ?? 0) + grant;
		shortfall[rightNeighbor] = Math.max(0, (shortfall[rightNeighbor] ?? 0) - grant);
	}
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

/**
 * How many lines the tallest slot needs. A displayed edge always keeps at least one.
 * Pass one width to measure every slot at that width, or one width per slot.
 */
export function slotLineCount(
	texts: readonly string[],
	widthOf: (sample: string) => number | null,
	columnWidth: number | readonly number[],
): number {
	let count = 1;
	for (let i = 0; i < texts.length; i++) {
		const width = typeof columnWidth === "number" ? columnWidth : (columnWidth[i] ?? 0);
		count = Math.max(count, wrapSlotText(texts[i] ?? "", widthOf, width).length);
	}
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
