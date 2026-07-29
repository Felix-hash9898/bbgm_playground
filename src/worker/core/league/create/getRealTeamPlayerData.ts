import type {
	RealPlayerPhotos,
	RealTeamInfo,
} from "../../../../common/types.ts";
import { idb } from "../../../db/index.ts";
import {
	validateRealPlayerPhotos,
	validateRealTeamInfo,
} from "../../../../common/validateRealTeamInfo.ts";

const getRealTeamPlayerData = async ({
	fileHasPlayers,
	fileHasTeams,
}: {
	fileHasPlayers: boolean;
	fileHasTeams: boolean;
}) => {
	let realPlayerPhotos;
	let realTeamInfo;
	if (fileHasPlayers || fileHasTeams) {
		const attributesStore = (await idb.meta.transaction("attributes")).store;
		if (fileHasPlayers) {
			const value = await attributesStore.get("realPlayerPhotos");
			if (value !== undefined) {
				try {
					validateRealPlayerPhotos(value);
					realPlayerPhotos = value as RealPlayerPhotos;
				} catch (error) {
					console.error("Ignoring invalid stored real player photos", error);
				}
			}
		}
		if (fileHasTeams) {
			const value = await attributesStore.get("realTeamInfo");
			if (value !== undefined) {
				try {
					validateRealTeamInfo(value);
					realTeamInfo = value as RealTeamInfo;
				} catch (error) {
					console.error("Ignoring invalid stored real team info", error);
				}
			}
		}
	}

	return {
		realPlayerPhotos,
		realTeamInfo,
	};
};

export default getRealTeamPlayerData;
