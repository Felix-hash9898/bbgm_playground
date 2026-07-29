import type {
	IndividualRealTeamInfo,
	RealPlayerPhotos,
	RealTeamInfo,
} from "./types.ts";

const TEAM_KEYS = new Set([
	"abbrev",
	"region",
	"name",
	"pop",
	"colors",
	"imgURL",
	"imgURLSmall",
	"jersey",
]);

export const validateRealPlayerPhotos = (
	value: unknown,
): value is RealPlayerPhotos => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(
			"Invalid data format in real player photos - input is not an object",
		);
	}
	for (const [key, photo] of Object.entries(value)) {
		if (typeof photo !== "string") {
			throw new Error(
				`Invalid data format in real player photos - value for "${key}" is not a string`,
			);
		}
	}
	return true;
};

const validateTeamInfo = (
	path: string,
	value: unknown,
	allowSeasons = true,
): value is IndividualRealTeamInfo => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(
			`Invalid data format in real team info - "${path}" is not an object`,
		);
	}
	for (const [key, item] of Object.entries(value)) {
		if (key === "seasons" || !TEAM_KEYS.has(key)) {
			if (key !== "seasons") {
				throw new Error(
					`Invalid data format in real team info - unknown property "${path}.${key}"`,
				);
			}
			if (!allowSeasons) {
				throw new Error(
					`Invalid data format in real team info - nested seasons are not allowed at "${path}"`,
				);
			}
			if (item === null || typeof item !== "object" || Array.isArray(item)) {
				throw new Error(
					`Invalid data format in real team info - "${path}.seasons" is not an object`,
				);
			}
			for (const [season, seasonInfo] of Object.entries(item)) {
				if (!/^[+-]?\d+$/.test(season)) {
					throw new Error(
						`Invalid data format in real team info - season "${path}.seasons.${season}" is not an integer`,
					);
				}
				validateTeamInfo(`${path}.seasons.${season}`, seasonInfo, false);
			}
		} else if (
			["abbrev", "region", "name", "imgURL", "imgURLSmall", "jersey"].includes(
				key,
			)
		) {
			if (typeof item !== "string") {
				throw new Error(
					`Invalid data format in real team info - value for "${path}.${key}" is not a string`,
				);
			}
		} else if (key === "pop") {
			if (typeof item !== "number" || !Number.isFinite(item)) {
				throw new Error(
					`Invalid data format in real team info - value for "${path}.${key}" is not a number`,
				);
			}
		} else if (key === "colors") {
			if (
				!Array.isArray(item) ||
				item.length !== 3 ||
				item.some((color) => typeof color !== "string")
			) {
				throw new Error(
					`Invalid data format in real team info - value for "${path}.colors" should be a 3-color tuple`,
				);
			}
		}
	}
	return true;
};

export const validateRealTeamInfo = (value: unknown): value is RealTeamInfo => {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(
			"Invalid data format in real team info - input is not an object",
		);
	}
	for (const [abbrev, teamInfo] of Object.entries(value)) {
		validateTeamInfo(abbrev, teamInfo);
	}
	return true;
};
