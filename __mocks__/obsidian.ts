/** Minimal Obsidian API stubs for unit tests. */

export class Plugin {
	async loadData(): Promise<unknown> {
		return {};
	}
	async saveData(_data: unknown): Promise<void> {}
	addCommand(_cmd: unknown): void {}
	addSettingTab(_tab: unknown): void {}
	addRibbonIcon(_icon: string, _title: string, _cb: unknown): HTMLElement {
		return document.createElement("div");
	}
	registerEvent(_ref: unknown): void {}
}

export class PluginSettingTab {
	containerEl: HTMLElement;
	constructor(_app: unknown, _plugin: unknown) {
		this.containerEl = document.createElement("div");
	}
	display(): void {}
}

export class Setting {
	constructor(_containerEl: HTMLElement) {}
	setName(_name: string): this {
		return this;
	}
	setDesc(_desc: string): this {
		return this;
	}
	addText(_cb: unknown): this {
		return this;
	}
	addToggle(_cb: unknown): this {
		return this;
	}
	addDropdown(_cb: unknown): this {
		return this;
	}
}

export class Notice {
	constructor(_message: string | DocumentFragment, _timeout?: number) {}
}

export class Modal {
	contentEl: HTMLElement;
	titleEl: HTMLElement;
	containerEl: HTMLElement;
	constructor(_app: unknown) {
		this.contentEl = document.createElement("div");
		this.titleEl = document.createElement("div");
		this.containerEl = document.createElement("div");
	}
	open(): void {}
	close(): void {}
}

export class TFile {
	path = "";
	basename = "";
	extension = "md";
	name = "";
}

export class Component {
	load(): void {}
	unload(): void {}
}

export const Platform = {
	isDesktop: true,
	isMobile: false,
	isPhone: false,
	isTablet: false,
	isDesktopApp: true,
	isMobileApp: false,
	isAndroidApp: false,
	isIosApp: false,
};

export type FrontMatterCache = Record<string, unknown>;

export async function MarkdownRenderer_render(
	_app: unknown,
	_markdown: string,
	_el: HTMLElement,
	_path: string,
	_component: unknown,
): Promise<void> {}

const nodeProto = Node.prototype as Node & {
	instanceOf?: (ctor: new (...args: never[]) => unknown) => boolean;
};
if (typeof nodeProto.instanceOf !== "function") {
	nodeProto.instanceOf = function instanceOf(ctor) {
		return this instanceof ctor;
	};
}

const htmlProto = HTMLElement.prototype as HTMLElement & {
	addClass?: (cls: string) => void;
	removeClass?: (cls: string) => void;
	toggleClass?: (cls: string, force?: boolean) => void;
	setCssProps?: (props: Record<string, string>) => void;
};
if (typeof htmlProto.addClass !== "function") {
	htmlProto.addClass = function addClass(cls: string) {
		this.classList.add(...cls.split(" "));
	};
	htmlProto.removeClass = function removeClass(cls: string) {
		this.classList.remove(...cls.split(" "));
	};
	htmlProto.toggleClass = function toggleClass(cls: string, force?: boolean) {
		this.classList.toggle(cls, force);
	};
	htmlProto.setCssProps = function setCssProps(props: Record<string, string>) {
		for (const [key, value] of Object.entries(props)) {
			const prop = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
			this.style.setProperty(prop, value);
		}
	};
}

type DomOpts = { cls?: string; attr?: Record<string, string>; text?: string };

function applyDom(el: HTMLElement, o?: DomOpts): HTMLElement {
	if (!o) return el;
	if (o.cls) el.classList.add(...o.cls.split(/\s+/).filter(Boolean));
	if (o.attr) {
		for (const [key, value] of Object.entries(o.attr)) el.setAttribute(key, value);
	}
	if (o.text) el.textContent = o.text;
	return el;
}

const testGlobals = globalThis as typeof globalThis & {
	createDiv?: (o?: DomOpts) => HTMLDivElement;
	createEl?: (tag: string, o?: DomOpts, cb?: (el: HTMLElement) => void) => HTMLElement;
};
if (typeof testGlobals.createDiv !== "function") {
	testGlobals.createDiv = (o?: DomOpts) => applyDom(document.createElement("div"), o) as HTMLDivElement;
}
if (typeof testGlobals.createEl !== "function") {
	testGlobals.createEl = (tag: string, o?: DomOpts, cb?: (el: HTMLElement) => void) => {
		const el = applyDom(document.createElement(tag), o);
		cb?.(el);
		return el;
	};
}

export function loadPdfJs(): Promise<unknown> {
	return Promise.resolve({});
}
