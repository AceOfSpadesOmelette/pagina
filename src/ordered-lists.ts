export interface ParsedOrderedList {
	start: number;
	itemCount: number;
}

interface NumberedItem {
	number: number;
	listIndex: number;
	text: string;
}

const ITEM_RE = /^(\s*)(\d+)\.[ \t]+(.*)$/;
const sources = new WeakMap<Node, string>();

/**
 * Ordered lists in source order.
 * A non-empty line that is not a list item ends the current list.
 * The next item starts a new list at the number written on that line.
 * Blank lines, indented item bodies, and display math stay inside the open list.
 */
export function orderedListStarts(markdown: string): ParsedOrderedList[] {
	return parseOrderedLists(markdown).lists;
}

/** Display number of each ordered item, in source order. */
function orderedListNumbers(markdown: string): NumberedItem[] {
	return parseOrderedLists(markdown).items;
}

function parseOrderedLists(markdown: string): { lists: ParsedOrderedList[]; items: NumberedItem[] } {
	const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
	const lists: ParsedOrderedList[] = [];
	const items: NumberedItem[] = [];
	const stack: { indent: number; list: ParsedOrderedList; listIndex: number }[] = [];

	const closeAll = () => {
		stack.length = 0;
	};

	const closeDeeperThan = (indent: number) => {
		while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) > indent) stack.pop();
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? "";
		if (isFence(line)) {
			closeAll();
			i = skipFence(lines, i);
			continue;
		}
		const item = ITEM_RE.exec(line);
		if (item) {
			const indent = item[1]?.length ?? 0;
			const number = Number(item[2]);
			closeDeeperThan(indent);
			const open = stack[stack.length - 1];
			const text = item[3] ?? "";
			if (open && open.indent === indent) {
				open.list.itemCount++;
				items.push({
					number: open.list.start + open.list.itemCount - 1,
					listIndex: open.listIndex,
					text,
				});
			} else {
				const list: ParsedOrderedList = { start: number, itemCount: 1 };
				const listIndex = lists.length;
				lists.push(list);
				stack.push({ indent, list, listIndex });
				items.push({ number, listIndex, text });
			}
			i++;
			continue;
		}
		if (stack.length === 0) {
			i++;
			continue;
		}
		if (line.trim() === "") {
			i++;
			continue;
		}
		if (isDisplayMath(line)) {
			i = skipMath(lines, i);
			continue;
		}
		const indent = line.match(/^\s*/)?.[0].length ?? 0;
		const top = stack[stack.length - 1];
		if (top && indent > top.indent) {
			i++;
			continue;
		}
		closeAll();
		i++;
	}
	return { lists, items };
}

/** Write the parsed start onto each rendered ordered list. Splits a list Obsidian merged across a plain line. */
export function applyOrderedListStarts(root: ParentNode, markdown: string): void {
	sources.set(root, markdown);
	writeOrderedListStarts(root, markdown);
}

/** Re-apply numbering on the final DOM, after math and layout have finished changing it. */
export function restampOrderedLists(root: ParentNode): void {
	const direct = sources.get(root);
	if (direct != null) {
		writeOrderedListStarts(root, direct);
		return;
	}
	if (!(root instanceof Element)) return;
	root.querySelectorAll(".markdown-preview-view").forEach((node) => {
		const markdown = sources.get(node);
		if (markdown != null) writeOrderedListStarts(node, markdown);
	});
}

const NON_CONTENT = ".math, .math-block, mjx-container, mjx-assistive-mml, svg, math";

function writeOrderedListStarts(root: ParentNode, markdown: string): void {
	const numbers = orderedListNumbers(markdown);
	const items = renderedItems(root);
	let cursor = 0;
	for (const li of items) {
		if (cursor >= numbers.length) return;
		if (li.parentElement?.closest(NON_CONTENT)) continue;
		const prose = itemProse(li);
		const spec = numbers[cursor];
		if (!spec || !stepMatches(prose, spec.text)) continue;
		cursor++;
		placeAlone(li, spec.number);
	}
}

function stepMatches(liText: string, sourceText: string): boolean {
	const li = normalizeStep(liText);
	const source = normalizeStep(sourceText);
	if (!li || !source) return false;
	return li.includes(source) || source.includes(li);
}

function normalizeStep(text: string): string {
	return text
		.replace(/\$\$[\s\S]*?\$\$/g, " ")
		.replace(/\$[^$\n]+\$/g, " ")
		.replace(/^\d+\.\s+/, "")
		.replace(/[*_~`]/g, "")
		.replace(/[^A-Za-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function itemProse(li: HTMLElement): string {
	const clone = li.cloneNode(true) as HTMLElement;
	clone.querySelectorAll(`ol, ul, ${NON_CONTENT}`).forEach((node) => node.remove());
	return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Give one sentence its own list so a math item beside it cannot take the marker. */
function placeAlone(li: HTMLElement, number: number): void {
	const ol = li.parentElement;
	if (!(ol instanceof HTMLElement) || ol.tagName !== "OL") {
		stampValue(li, number);
		return;
	}
	const siblings = directItems(ol);
	if (siblings.length === 1 && siblings[0] === li) {
		ol.setAttribute("start", String(number));
		stampValue(li, number);
		return;
	}
	const next = ol.ownerDocument.createElement("ol");
	next.setAttribute("start", String(number));
	const rest = ol.ownerDocument.createElement("ol");
	const following: ChildNode[] = [];
	let seen = false;
	for (const node of [...ol.childNodes]) {
		if (node === li) {
			seen = true;
			continue;
		}
		if (seen) following.push(node);
	}
	for (const node of following) rest.appendChild(node);
	next.appendChild(li);
	ol.after(next);
	if (rest.childNodes.length > 0) next.after(rest);
	releaseEmptyList(ol);
	if (rest.isConnected) releaseEmptyList(rest);
	stampValue(li, number);
}

function releaseEmptyList(ol: HTMLElement): void {
	if (directItems(ol).length > 0) return;
	const parent = ol.parentElement;
	if (!parent) return;
	const nodes = [...ol.childNodes];
	const onlySpace = nodes.every(
		(node) => node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim(),
	);
	if (onlySpace) {
		ol.remove();
		return;
	}
	for (const node of nodes) parent.insertBefore(node, ol);
	ol.remove();
}

function stampValue(li: HTMLElement, number: number): void {
	li.setAttribute("value", String(number));
	(li as HTMLLIElement).value = number;
}

function renderedItems(root: ParentNode): HTMLElement[] {
	return [...root.querySelectorAll("ol > li")].filter((node): node is HTMLElement => isItem(node));
}

function directItems(ol: HTMLElement): HTMLElement[] {
	return [...ol.children].filter((node): node is HTMLElement => isItem(node));
}

function isItem(node: ChildNode | undefined): node is HTMLElement {
	return node instanceof HTMLElement && node.tagName === "LI";
}

function isFence(line: string): boolean {
	return /^\s*(```+|~~~+)/.test(line);
}

function skipFence(lines: string[], index: number): number {
	const open = /^\s*(```+|~~~+)/.exec(lines[index] ?? "");
	const mark = open?.[1]?.[0] === "~" ? "~" : "`";
	let i = index + 1;
	while (i < lines.length && !new RegExp(`^\\s*${mark}{3,}`).test(lines[i] ?? "")) i++;
	return Math.min(lines.length, i + 1);
}

function isDisplayMath(line: string): boolean {
	return line.trim().startsWith("$$");
}

function skipMath(lines: string[], index: number): number {
	const text = (lines[index] ?? "").trim();
	if (text.length > 4 && text.endsWith("$$")) return index + 1;
	let i = index + 1;
	while (i < lines.length && !(lines[i] ?? "").trim().endsWith("$$")) i++;
	return Math.min(lines.length, i + 1);
}
