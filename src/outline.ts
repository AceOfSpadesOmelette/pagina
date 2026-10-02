import {
	PDFArray,
	PDFDocument,
	PDFHexString,
	PDFDict,
	PDFName,
	PDFRef,
} from "pdf-lib";

export interface HeadingInfo {
	level: number;
	title: string;
	/** Offset from content root top, in layout CSS pixels */
	offsetTop: number;
}

export interface OutlineItem {
	title: string;
	pageIndex: number;
	/** PDF user-space Y of the heading, when known from a print annotation. */
	y?: number;
	children: OutlineItem[];
}

export interface HeadingNode {
	key: string;
	title: string;
	level: number;
	children: HeadingNode[];
}

export type DestPositions = Record<string, [pageIndex: number, y: number]>;

export function collectHeadings(root: HTMLElement, maxLevel: number): HeadingInfo[] {
	const selector = Array.from({ length: maxLevel }, (_, i) => `h${i + 1}`).join(",");
	if (!selector) return [];
	const rootTop = root.getBoundingClientRect().top;
	const out: HeadingInfo[] = [];
	root.querySelectorAll(selector).forEach((el) => {
		const tag = el.tagName.toLowerCase();
		const level = Number(tag.slice(1));
		if (!level || level > maxLevel) return;
		const title = (el.textContent ?? "").trim();
		if (!title) return;
		out.push({
			level,
			title,
			offsetTop: el.getBoundingClientRect().top - rootTop + root.scrollTop,
		});
	});
	return out;
}

export function buildOutlineTree(
	headings: HeadingInfo[],
	contentHeightPx: number,
): OutlineItem[] {
	const pageHeight = Math.max(1, contentHeightPx);
	const roots: OutlineItem[] = [];
	const stack: Array<OutlineItem & { level: number }> = [];

	for (const h of headings) {
		const pageIndex = Math.max(0, Math.floor(h.offsetTop / pageHeight));
		const item: OutlineItem & { level: number } = {
			title: h.title,
			pageIndex,
			children: [],
			level: h.level,
		};

		while (stack.length > 0 && stack[stack.length - 1]!.level >= h.level) {
			stack.pop();
		}

		if (stack.length === 0) {
			roots.push(item);
		} else {
			stack[stack.length - 1]!.children.push(item);
		}
		stack.push(item);
	}

	return roots;
}

/** Read `af://` link annotations Chromium emitted for heading anchors. */
export async function getDestPosition(pdfDoc: PDFDocument): Promise<DestPositions> {
	const pages = pdfDoc.getPages();
	const links: DestPositions = {};

	pages.forEach((page, pageIndex) => {
		const annotations = page.node.Annots();
		if (!annotations) return;
		const count = annotations.size() ?? 0;
		for (let i = 0; i < count; i++) {
			try {
				const annotation = annotations.lookup(i, PDFDict);
				if (annotation.get(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
				const action = annotation.get(PDFName.of("A")) as PDFDict | undefined;
				const uri = action?.get(PDFName.of("URI"))?.toString() ?? "";
				const match = /^\(af:\/\/(.+)\)$/.exec(uri);
				if (!match?.[1]) continue;
				const rect = (annotation.get(PDFName.of("Rect")) as PDFArray | undefined)?.asRectangle();
				if (!rect) continue;
				links[match[1]] = [pageIndex, rect.y];
			} catch (err) {
				console.error(err);
			}
		}
	});

	return links;
}

/** Turn `an://` links into in-document GoTo destinations. */
export function setAnchors(pdfDoc: PDFDocument, links: DestPositions): void {
	const pages = pdfDoc.getPages();
	pages.forEach((page) => {
		const annots = page.node.Annots();
		if (!annots) return;
		const count = annots.size() ?? 0;
		for (let i = 0; i < count; i++) {
			try {
				const linkAnnotRef = annots.get(i);
				const linkAnnot = annots.lookup(i, PDFDict);
				if (linkAnnot.get(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
				const action = linkAnnot.get(PDFName.of("A")) as PDFDict | undefined;
				const uri = action?.get(PDFName.of("URI"))?.toString() ?? "";
				const match = /^\(an:\/\/(.+)\)$/.exec(uri);
				const key = match?.[1];
				const dest = key ? links[key] : undefined;
				if (!key || !dest) continue;
				const [pageIdx, yPos] = dest;
				const pageRef = pages[pageIdx]?.ref;
				if (!pageRef) continue;
				const newAnnot = pdfDoc.context.obj({
					Type: "Annot",
					Subtype: "Link",
					Rect: linkAnnot.lookup(PDFName.of("Rect")),
					Border: linkAnnot.lookup(PDFName.of("Border")),
					C: linkAnnot.lookup(PDFName.of("C")),
					Dest: [pageRef, "XYZ", null, yPos, null],
				});
				pdfDoc.context.assign(linkAnnotRef as PDFRef, newAnnot);
			} catch (err) {
				console.error(err);
			}
		}
	});
}

export function getHeadingTree(root: ParentNode): HeadingNode {
	const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
	const tree: HeadingNode = { key: "", title: "Root", level: 0, children: [] };
	const stack: HeadingNode[] = [tree];

	headings.forEach((heading) => {
		const el = heading as HTMLElement;
		if (el.style.display === "none") return;
		const level = Number.parseInt(el.tagName.slice(1), 10);
		const link = el.querySelector("a.md-print-anchor") as HTMLAnchorElement | null;
		const fromHref = /^af:\/\/(.+)$/.exec(link?.getAttribute("href") ?? "");
		const key = fromHref?.[1] ?? link?.dataset.flag ?? "";
		if (!key) return;
		const node: HeadingNode = { key, title: el.innerText.trim(), level, children: [] };
		while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
			stack.pop();
		}
		const parent = stack[stack.length - 1];
		if (!parent) return;
		parent.children.push(node);
		stack.push(node);
	});

	return tree;
}

export function generateOutlines(
	root: HeadingNode,
	positions: DestPositions,
	maxLevel = 6,
): OutlineItem[] {
	const walk = (node: HeadingNode): OutlineItem | undefined => {
		if (node.level > maxLevel) return undefined;
		const found = positions[node.key];
		const pageIndex = found?.[0] ?? 0;
		const y = found?.[1];
		const item: OutlineItem = {
			title: node.title,
			pageIndex,
			...(y != null ? { y } : {}),
			children: [],
		};
		for (const child of node.children) {
			const next = walk(child);
			if (next) item.children.push(next);
		}
		return item;
	};

	const outlines: OutlineItem[] = [];
	for (const child of root.children) {
		const item = walk(child);
		if (item) outlines.push(item);
	}
	return outlines;
}

export async function applyPdfPostProcess(
	bytes: ArrayBuffer,
	opts: {
		outlines?: OutlineItem[];
		headingRoot?: ParentNode;
		maxLevel?: number;
		metadata?: {
			title?: string;
			author?: string;
			subject?: string;
			keywords?: string;
			creator?: string;
			producer?: string;
		};
		tagged: boolean;
	},
): Promise<Uint8Array> {
	const doc = await PDFDocument.load(bytes);

	if (opts.metadata) {
		const m = opts.metadata;
		if (m.title) doc.setTitle(m.title);
		if (m.author) doc.setAuthor(m.author);
		if (m.subject) doc.setSubject(m.subject);
		if (m.keywords) doc.setKeywords(m.keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean));
		if (m.creator) doc.setCreator(m.creator);
		if (m.producer) doc.setProducer(m.producer);
	}

	if (opts.tagged) {
		try {
			const markInfo = doc.context.obj({ Marked: true });
			doc.catalog.set(PDFName.of("MarkInfo"), markInfo);
		} catch {
			/* best-effort */
		}
	}

	let outlines = opts.outlines ?? [];
	if (opts.headingRoot) {
		const positions = await getDestPosition(doc);
		setAnchors(doc, positions);
		outlines = generateOutlines(getHeadingTree(opts.headingRoot), positions, opts.maxLevel ?? 6);
	}

	if (outlines.length > 0) {
		await setOutline(doc, outlines);
	}

	return doc.save();
}

async function setOutline(doc: PDFDocument, outlines: OutlineItem[]): Promise<void> {
	const rootRef = doc.context.nextRef();
	const refMap = new WeakMap<OutlineItem, PDFRef>();

	const flatten = (items: OutlineItem[], acc: OutlineItem[] = []): OutlineItem[] => {
		for (const item of items) {
			acc.push(item);
			if (item.children.length) flatten(item.children, acc);
		}
		return acc;
	};

	for (const item of flatten(outlines)) {
		refMap.set(item, doc.context.nextRef());
	}

	const pageRefs: PDFRef[] = [];
	doc.catalog.Pages().traverse((kid, ref) => {
		const dict = kid as PDFDict;
		if (dict.get(PDFName.of("Type"))?.toString() === "/Page") {
			pageRefs.push(ref);
		}
	});

	const countOpen = (items: OutlineItem[]): number => {
		let n = 0;
		for (const item of items) {
			n += 1 + countOpen(item.children);
		}
		return n;
	};

	const create = (items: OutlineItem[], parent: PDFRef) => {
		for (let i = 0; i < items.length; i++) {
			const outline = items[i]!;
			const outlineRef = refMap.get(outline)!;
			const pageIndex = Math.min(Math.max(0, outline.pageIndex), Math.max(0, pageRefs.length - 1));
			const pageRef = pageRefs[pageIndex];
			const dest = pageRef
				? outline.y != null
					? { Dest: [pageRef, "XYZ", 0, outline.y, null] }
					: { Dest: [pageRef, "Fit"] }
				: {};

			const childrenDict =
				outline.children.length > 0
					? (() => {
							create(outline.children, outlineRef);
							return {
								First: refMap.get(outline.children[0]!)!,
								Last: refMap.get(outline.children[outline.children.length - 1]!)!,
								Count: -countOpen(outline.children),
							};
						})()
					: {};

			doc.context.assign(
				outlineRef,
				doc.context.obj({
					Title: PDFHexString.fromText(outline.title),
					Parent: parent,
					...(i > 0 ? { Prev: refMap.get(items[i - 1]!)! } : {}),
					...(i < items.length - 1 ? { Next: refMap.get(items[i + 1]!)! } : {}),
					...childrenDict,
					...dest,
				}),
			);
		}
	};

	create(outlines, rootRef);
	const rootCount = countOpen(outlines);
	doc.context.assign(
		rootRef,
		doc.context.obj({
			Type: "Outlines",
			...(rootCount > 0
				? {
						First: refMap.get(outlines[0]!)!,
						Last: refMap.get(outlines[outlines.length - 1]!)!,
					}
				: {}),
			Count: rootCount,
		}),
	);
	doc.catalog.set(PDFName.of("Outlines"), rootRef);
}
