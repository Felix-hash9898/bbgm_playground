import gameSimPresets from "./gameSimPresets.ts";

export const getCanonicalGameSimPresetYear = (season: number) => {
	if (!gameSimPresets) {
		return;
	}

	const seasons = Object.keys(gameSimPresets)
		.map(Number)
		.sort((a, b) => a - b);
	const canonicalSeason =
		seasons.findLast((presetSeason) => presetSeason <= season) ?? seasons[0];

	return canonicalSeason === undefined ? undefined : String(canonicalSeason);
};

const getGameSimPresetUpdate = (newPreset: string, defaultSeason?: number) => {
	let presetName = newPreset;
	if (newPreset === "default") {
		if (defaultSeason === undefined) {
			return;
		}
		presetName = getCanonicalGameSimPresetYear(defaultSeason) ?? "";
	}

	if (!gameSimPresets) {
		return;
	}
	const preset =
		gameSimPresets[Number(presetName) as keyof typeof gameSimPresets];
	if (!preset) {
		return;
	}

	const settings: Record<string, string> = {};
	for (const [key, value] of Object.entries(preset)) {
		settings[key] = String(value);
	}

	return {
		gameSimPreset: newPreset,
		settings,
	};
};

export default getGameSimPresetUpdate;
