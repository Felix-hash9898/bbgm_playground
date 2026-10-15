import type { Option } from "./types.ts";

export const assignPlayMenuKeyboardShortcuts = (options: Option[]) => {
	if (options[0]) {
		options[0].keyboardShortcut = "primary";
	}

	const usedShortcuts = new Set<Option["keyboardShortcut"]>();
	for (const option of options) {
		const shortcut = option.keyboardShortcut;
		if (shortcut === undefined) {
			continue;
		}
		if (usedShortcuts.has(shortcut)) {
			// The Play Menu dispatches to the first matching action. Remove duplicate
			// labels so every displayed key describes exactly that action.
			delete option.keyboardShortcut;
		} else {
			usedShortcuts.add(shortcut);
		}
	}

	return options;
};
