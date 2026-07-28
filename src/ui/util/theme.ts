import type { Theme } from "../../common/types.ts";

export type ThemeSetting = Theme | "default";

export const parseThemeSetting = (value: string | null): ThemeSetting => {
	if (value === "dark" || value === "light" || value === "minimal") {
		return value;
	}

	return "default";
};
