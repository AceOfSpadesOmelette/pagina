import { Platform } from "obsidian";

/**
 * True on phone / mobile app sessions.
 * Uses Obsidian Platform flags only — never window width — so a narrow
 * desktop window is not treated as a phone.
 */
export function isPhoneSession(): boolean {
	return (
		Platform.isPhone ||
		Platform.isMobile ||
		Platform.isMobileApp ||
		Platform.isAndroidApp ||
		Platform.isIosApp ||
		!Platform.isDesktopApp
	);
}
