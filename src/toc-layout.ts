/** Turn printed Conspectus entries into a title, optional leaders, and a page-number column. */
export function layoutConspectusPageNumbers(root: ParentNode): void {
	root.querySelectorAll(".conspectus-toc").forEach((node) => {
		if (!node.instanceOf(HTMLElement)) return;
		if (node.classList.contains("conspectus-toc-hide-export")) return;
		const maxLevel = Number(node.getAttribute("data-conspectus-page-numbers") ?? "0");
		if (!(maxLevel >= 1 && maxLevel <= 6)) return;
		const leaders = node.getAttribute("data-conspectus-leaders") !== "false";
		node.querySelectorAll("a[data-heading]").forEach((linkNode) => {
			if (!linkNode.instanceOf(HTMLAnchorElement)) return;
			const li = linkNode.closest("li");
			if (!li || li.querySelector(":scope > .conspectus-toc-entry")) return;
			const level = levelFromClass(li);
			if (!level || level > maxLevel) return;
			const flag = /^an:\/\/(.+)$/.exec(linkNode.getAttribute("href") ?? "")?.[1];
			if (!flag) return;

			const row = createDiv({
				cls: leaders ? "conspectus-toc-entry conspectus-toc-leaders" : "conspectus-toc-entry",
			});
			li.insertBefore(row, linkNode);
			const text = createSpan({ cls: "conspectus-toc-text" });
			text.appendChild(linkNode);
			if (leaders) text.appendChild(createSpan({ cls: "conspectus-toc-leader" }));
			row.appendChild(text);
			const page = createSpan({ cls: "conspectus-toc-page" });
			const marker = createEl("a", {
				cls: "md-print-anchor",
				attr: { href: `af://tocpage-${flag}` },
			});
			marker.dataset.flag = `tocpage-${flag}`;
			page.appendChild(marker);
			row.appendChild(page);
		});
	});
}

/** Replace each reserved page-number marker with the heading's page, in the entry's own text. */
export function fillTocPageNumbers(
	root: ParentNode,
	positions: Record<string, [number, number]>,
): void {
	root.querySelectorAll("a.md-print-anchor").forEach((node) => {
		const flag = node.getAttribute("data-flag") ?? "";
		const target = /^tocpage-(.+)$/.exec(flag)?.[1];
		if (!target) return;
		const found = positions[target];
		if (!found) return;
		const column = node.parentElement;
		if (!column?.classList.contains("conspectus-toc-page")) return;
		column.textContent = String(found[0] + 1);
	});
}

/** Drop destination hrefs from Conspectus entries. Page-number markers are left in place. */
export function clearConspectusEntryLinks(root: ParentNode): void {
	root.querySelectorAll(".conspectus-toc a[data-heading]").forEach((node) => {
		node.removeAttribute("href");
	});
}

function levelFromClass(li: HTMLElement): number {
	const match = /\bconspectus-toc-h([1-6])\b/.exec(li.className);
	return match ? Number(match[1]) : 0;
}
