import type {
	RealPlayerPhotos,
	RealTeamInfo,
} from "../../../../common/types.ts";
import { idb } from "../../../db/index.ts";
import toUI from "../../../util/toUI.ts";
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
					await toUI("showEvent", [
						{
							type: "error",
							text: "Invalid stored real player photos were ignored.",
							persistent: false,
						},
					]);
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
					await toUI("showEvent", [
						{
							type: "error",
							text: "Invalid stored real team information was ignored.",
							persistent: false,
						},
					]);
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
