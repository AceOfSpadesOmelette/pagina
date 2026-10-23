import { loadPdfJs } from "obsidian";
import { PDFDocument } from "pdf-lib";
import { resolvePrintMarginsMm } from "./page-presets";
import type { PaginaSettings } from "./types";

const PT_PER_MM = 72 / 25.4;

export interface TextMark {
	text: string;
	x: number;
	y: number;
}

export interface PageBox {
	width: number;
	height: number;
}

/** True when any mark sits in the note body, not the header or footer band. */
export function contentBoxHasText(
	marks: TextMark[],
	page: PageBox,
	margins: { top: number; bottom: number; left: number; right: number },
): boolean {
	const left = margins.left * PT_PER_MM;
	const right = page.width - margins.right * PT_PER_MM;
	const bottom = margins.bottom * PT_PER_MM;
	const top = page.height - margins.top * PT_PER_MM;
	return marks.some((mark) => {
		if (!mark.text.trim()) return false;
		return mark.x >= left - 1 && mark.x <= right + 1 && mark.y > bottom + 2 && mark.y < top - 2;
	});
}

/**
 * Remove the last page when its content box has no text.
 * Returns the original bytes when the page has body text or the check cannot run.
 */
export async function dropTrailingBlankPage(
	bytes: Uint8Array,
	settings: PaginaSettings,
): Promise<{ bytes: Uint8Array; removed: boolean }> {
	try {
		const doc = await PDFDocument.load(bytes.slice());
		const pages = doc.getPages();
		if (pages.length < 2) return { bytes, removed: false };
		const last = pages[pages.length - 1];
		if (!last) return { bytes, removed: false };
		const marks = await textMarks(bytes.slice(), pages.length);
		if (!marks) return { bytes, removed: false };
		const { width, height } = last.getSize();
		if (contentBoxHasText(marks, { width, height }, resolvePrintMarginsMm(settings))) {
			return { bytes, removed: false };
		}
		doc.removePage(pages.length - 1);
		const saved = await doc.save();
		return { bytes: new Uint8Array(saved), removed: true };
	} catch (error) {
		console.error("Pagina: could not drop a blank last page", error);
		return { bytes, removed: false };
	}
}

async function textMarks(bytes: Uint8Array, pageNumber: number): Promise<TextMark[] | null> {
	try {
		const loaded: unknown = await (loadPdfJs() as Promise<unknown>);
		if (!loaded || typeof loaded !== "object" || !("getDocument" in loaded)) return null;
		const getDocument = (loaded as { getDocument: (params: { data: Uint8Array }) => unknown }).getDocument;
		const task = getDocument({ data: bytes });
		const doc = await pdfDocument(task);
		const page = await doc.getPage(pageNumber);
		const content = await page.getTextContent();
		const marks: TextMark[] = [];
		for (const item of content.items) {
			if (!item || typeof item !== "object" || !("str" in item)) continue;
			const text = typeof item.str === "string" ? item.str : "";
			const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : [];
			const x = typeof transform[4] === "number" ? transform[4] : 0;
			const y = typeof transform[5] === "number" ? transform[5] : 0;
			marks.push({ text, x, y });
		}
		return marks;
	} catch (error) {
		console.error("Pagina: could not read the last page", error);
		return null;
	}
}

interface PdfTextPage {
	getTextContent(): Promise<{ items: unknown[] }>;
}

interface PdfTextDoc {
	getPage(pageNumber: number): Promise<PdfTextPage>;
}

async function pdfDocument(task: unknown): Promise<PdfTextDoc> {
	if (task && typeof task === "object" && "promise" in task && task.promise instanceof Promise) {
		return task.promise as Promise<PdfTextDoc>;
	}
	return task as PdfTextDoc;
}
