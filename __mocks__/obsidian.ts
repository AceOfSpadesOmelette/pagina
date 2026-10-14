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
