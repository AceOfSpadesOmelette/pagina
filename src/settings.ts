import { App, PluginSettingTab } from "obsidian";
import type PaginaPlugin from "./main";
import { renderPaginaSettings } from "./settings-ui";

export class PaginaSettingTab extends PluginSettingTab {
	plugin: PaginaPlugin;

	constructor(app: App, plugin: PaginaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Pagina" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Default options for Export to PDF. The export dialog starts from these values.",
		});

		renderPaginaSettings(containerEl, this.plugin.settings, {
			onRebuild: () => this.display(),
			onChange: async () => {
				await this.plugin.saveSettings();
			},
		});
	}
}
