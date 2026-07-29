import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";

export const RESTRICTED_1_PICK = 1;
export const RESTRICTED_5_PICK = 5;

export const initializeNba2027 = async () => {
	const teams = await idb.cache.teams.getAll();
	const previous = await idb.getCopy.draftLotteryResults({
		season: g.get("season") - 1,
	});
	const older = await idb.getCopy.draftLotteryResults({
		season: g.get("season") - 2,
	});
	const restricted1 = new Set<number>();
	const restricted5 = new Map<number, 1 | 2>();
	for (const row of previous?.result ?? []) {
		if (row.pick === 1) {
			restricted1.add(row.originalTid);
		}
		if (row.pick !== undefined && row.pick <= 5) {
			restricted5.set(row.originalTid, 1);
		}
	}
	for (const row of older?.result ?? []) {
		if (
			row.pick !== undefined &&
			row.pick <= 5 &&
			restricted5.get(row.originalTid) === 1
		) {
			restricted5.set(row.originalTid, 2);
		}
	}
	for (const team of teams) {
		if (team.disabled) {
			continue;
		}
		if (restricted1.has(team.tid) || restricted5.has(team.tid)) {
			team.draftLottery = { type: "nba2027" };
			if (restricted1.has(team.tid)) {
				team.draftLottery.restricted1 = true;
			}
			const restriction = restricted5.get(team.tid);
			if (restriction) {
				team.draftLottery.restricted5 = restriction;
			}
		} else {
			delete team.draftLottery;
		}
		await idb.cache.teams.put(team);
	}
};

export const disableNba2027 = async () => {
	for (const team of await idb.cache.teams.getAll()) {
		if (team.draftLottery?.type === "nba2027") {
			delete team.draftLottery;
			await idb.cache.teams.put(team);
		}
	}
};

export const updateNba2027AfterLottery = async (topFiveTids: number[]) => {
	const firstTid = topFiveTids[0];
	for (const team of await idb.cache.teams.getAll()) {
		if (team.disabled) {
			continue;
		}
		if (topFiveTids.includes(team.tid) || team.tid === firstTid) {
			const previous = team.draftLottery?.restricted5;
			team.draftLottery = { type: "nba2027" };
			if (team.tid === firstTid) {
				team.draftLottery.restricted1 = true;
			}
			if (topFiveTids.includes(team.tid)) {
				team.draftLottery.restricted5 = previous === 1 ? 2 : 1;
			}
			await idb.cache.teams.put(team);
		} else {
			delete team.draftLottery;
			await idb.cache.teams.put(team);
		}
	}
};
