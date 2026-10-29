/** How far below the content top a heading can sit and still be the first line. */
export const SECTION_TOP_SLACK_PT = 48;

/** Same slack in CSS pixels (96dpi). */
export const SECTION_TOP_SLACK_PX = (SECTION_TOP_SLACK_PT * 96) / 72;

export interface SectionHeading {
	level: number;
	title: string;
	pageIndex: number;
	/** Larger y is higher on the page. */
	y: number;
}

export interface SectionHeadingSource {
	level: number;
	title: string;
	key: string;
}

/**
 * Heading in effect at the top of `pageIndex`.
 * When `level` appears in the note, only that level matches.
 * When it does not, every heading at or above `level` can match. A later heading
 * replaces one of the same or deeper level, and the deepest one still in effect is used.
 * A heading on this page counts only when it sits within `topSlack` of the content top.
 */
export function sectionTitleForPage(
	headings: readonly SectionHeading[],
	pageIndex: number,
	level: number,
	contentTopY: number,
	topSlack = SECTION_TOP_SLACK_PT,
): string {
	const exact = headings.some((heading) => heading.level === level);
	const started = headings.filter(
		(heading) =>
			heading.title &&
			(exact ? heading.level === level : heading.level <= level) &&
			ownsPageTop(heading, pageIndex, contentTopY, topSlack),
	);
	if (exact) {
		let best: SectionHeading | null = null;
		for (const heading of started) {
			if (!best || isLater(heading, best)) best = heading;
		}
		return best?.title ?? "";
	}
	const stack: SectionHeading[] = [];
	for (const heading of started.slice().sort(documentOrder)) {
		while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
		stack.push(heading);
	}
	return stack[stack.length - 1]?.title ?? "";
}

export function sectionTitlesForDocument(
	headings: readonly SectionHeading[],
	pageCount: number,
	level: number,
	contentTopY: number,
	topSlack = SECTION_TOP_SLACK_PT,
): string[] {
	const titles: string[] = [];
	for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
		titles.push(sectionTitleForPage(headings, pageIndex, level, contentTopY, topSlack));
	}
	return titles;
}

/** PDF user-space y of the top of the note body. */
export function contentTopY(pageHeightPt: number, marginTopMm: number): number {
	return pageHeightPt - (marginTopMm * 72) / 25.4;
}

export function templateUsesSection(template: string): boolean {
	return /\{\{\s*section\s*\}\}/i.test(template);
}

export function slotsUseSection(slots: { left: string; center: string; right: string }): boolean {
	return [slots.left, slots.center, slots.right].some((slot) => templateUsesSection(slot));
}

/** Headings that can appear as {{section}}. Matches the level rule used on each page. */
export function sectionTitleCandidates(
	headings: readonly { level: number; title: string }[],
	level: number,
): string[] {
	const exact = headings.some((heading) => heading.level === level);
	return headings
		.filter((heading) => heading.title && (exact ? heading.level === level : heading.level <= level))
		.map((heading) => heading.title);
}

/** Document headings only. Skips the file-name title and Conspectus. */
export function readSectionHeadings(root: ParentNode): SectionHeadingSource[] {
	const out: SectionHeadingSource[] = [];
	root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((node) => {
		if (!node.instanceOf(HTMLElement)) return;
		if (node.classList.contains("__title__") || node.classList.contains("conspectus-toc-title")) return;
		if (node.closest(".conspectus-toc")) return;
		const level = Number(node.tagName.slice(1));
		if (!level) return;
		const anchor = node.querySelector("a.md-print-anchor");
		const fromHref = /^af:\/\/(.+)$/.exec(anchor?.getAttribute("href") ?? "");
		const key = anchor?.getAttribute("data-flag") || fromHref?.[1] || "";
		if (!key) return;
		const title = visibleHeadingText(node);
		if (!title) return;
		out.push({ level, title, key });
	});
	return out;
}

export function placeSectionHeadings(
	headings: readonly SectionHeadingSource[],
	positions: Record<string, [number, number]>,
): SectionHeading[] {
	const placed: SectionHeading[] = [];
	for (const heading of headings) {
		const found = positions[heading.key];
		if (!found) continue;
		placed.push({
			level: heading.level,
			title: heading.title,
			pageIndex: found[0],
			y: found[1],
		});
	}
	return placed;
}

/** Raster pages: convert a content-box offset into the same y-up page coordinates. */
export function sectionHeadingsFromOffsets(
	items: readonly { level: number; title: string; offsetTop: number }[],
	pageHeightPx: number,
): SectionHeading[] {
	const pageHeight = Math.max(1, pageHeightPx);
	return items.map((item) => {
		const pageIndex = Math.max(0, Math.floor(item.offsetTop / pageHeight));
		const intoPage = item.offsetTop - pageIndex * pageHeight;
		return {
			level: item.level,
			title: item.title,
			pageIndex,
			y: pageHeight - intoPage,
		};
	});
}

export function sectionHeadingsInContentBox(
	root: HTMLElement,
): Array<{ level: number; title: string; offsetTop: number }> {
	const rootTop = root.getBoundingClientRect().top;
	const out: Array<{ level: number; title: string; offsetTop: number }> = [];
	root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((node) => {
		if (!node.instanceOf(HTMLElement)) return;
		if (node.classList.contains("__title__") || node.classList.contains("conspectus-toc-title")) return;
		if (node.closest(".conspectus-toc")) return;
		const level = Number(node.tagName.slice(1));
		const title = visibleHeadingText(node);
		if (!level || !title) return;
		out.push({
			level,
			title,
			offsetTop: node.getBoundingClientRect().top - rootTop + root.scrollTop,
		});
	});
	return out;
}

function visibleHeadingText(el: HTMLElement): string {
	const clone = el.cloneNode(true) as HTMLElement;
	clone.querySelectorAll("a.md-print-anchor").forEach((node) => node.remove());
	return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function ownsPageTop(
	heading: SectionHeading,
	pageIndex: number,
	contentTopY: number,
	topSlack: number,
): boolean {
	if (heading.pageIndex < pageIndex) return true;
	return heading.pageIndex === pageIndex && heading.y >= contentTopY - topSlack;
}

function documentOrder(a: SectionHeading, b: SectionHeading): number {
	if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
	return b.y - a.y;
}

function isLater(a: SectionHeading, b: SectionHeading): boolean {
	return documentOrder(a, b) > 0;
}
