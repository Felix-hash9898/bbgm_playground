import { PHASE } from "../../../common/constants.ts";
import { idb } from "../../db/index.ts";
import { actualPhase } from "../../util/actualPhase.ts";
import { g } from "../../util/index.ts";

export const RESTRICTED_1_PICK = 1;
export const RESTRICTED_5_PICK = 5;

export const updateNba2027AfterLottery = async (tidsTop5: number[]) => {
	const firstTid = tidsTop5[0];
	for (const t of await idb.cache.teams.getAll()) {
		if (t.disabled) {
			continue;
		}
		let restricted1: true | undefined;
		let restricted5: true | undefined;
		if (t.tid === firstTid) {
			restricted1 = true;
		}
		if (tidsTop5.includes(t.tid)) {
			restricted5 = true;
		}
		if (restricted1 || restricted5) {
			const prev =
				t.draftLottery?.type === "nba2027"
					? t.draftLottery.restricted5
					: undefined;
			t.draftLottery = { type: "nba2027" };
			if (restricted1) {
				t.draftLottery.restricted1 = true;
			}
			if (restricted5) {
				t.draftLottery.restricted5 = prev === 1 || prev === 2 ? 2 : 1;
			}
		} else {
			delete t.draftLottery;
		}
		await idb.cache.teams.put(t);
	}
};

export const initializeNba2027 = async () => {
	const teams = await idb.cache.teams.getAll();
	let lastSeason = g.get("season");
	let results = await idb.getCopy.draftLotteryResults({ season: lastSeason });
	if (!results && actualPhase() <= PHASE.DRAFT_LOTTERY) {
		lastSeason -= 1;
		results = await idb.getCopy.draftLotteryResults({ season: lastSeason });
	}

	const restricted1ByTid: Record<number, true> = {};
	const restricted5ByTid: Record<number, 1 | 2> = {};
	const applyRows = (
		rows: { pick?: number; originalTid: number }[],
		older: boolean,
	) => {
		for (const row of rows) {
			if (row.pick === RESTRICTED_1_PICK && !older) {
				restricted1ByTid[row.originalTid] = true;
			}
			if (row.pick !== undefined && row.pick <= RESTRICTED_5_PICK) {
				if (older && restricted5ByTid[row.originalTid] === 1) {
					restricted5ByTid[row.originalTid] = 2;
				} else if (!older) {
					restricted5ByTid[row.originalTid] = 1;
				}
			}
		}
	};
	const loadRows = async (season: number) => {
		const lottery = await idb.getCopy.draftLotteryResults({ season });
		if (lottery && lottery.result.length > RESTRICTED_5_PICK) {
			return lottery.result;
		}
		const players = await idb.getCopies.players(
			{ draftYear: season },
			"noCopyCache",
		);
		return players
			.filter((p) => p.draft.round === 1 && p.draft.pick > 0)
			.map((p) => ({ pick: p.draft.pick, originalTid: p.draft.originalTid }));
	};
	applyRows(
		results && results.result.length > RESTRICTED_5_PICK
			? results.result
			: await loadRows(lastSeason),
		false,
	);
	applyRows(await loadRows(lastSeason - 1), true);

	for (const t of teams) {
		if (t.disabled || t.draftLottery?.type === "nba2027") {
			continue;
		}
		const restricted1 = restricted1ByTid[t.tid];
		const restricted5 = restricted5ByTid[t.tid];
		if (restricted1 || restricted5) {
			t.draftLottery = { type: "nba2027" };
			if (restricted1) {
				t.draftLottery.restricted1 = true;
			}
			if (restricted5) {
				t.draftLottery.restricted5 = restricted5;
			}
		} else {
			delete t.draftLottery;
		}
		await idb.cache.teams.put(t);
	}
};

export const disableNba2027 = async () => {
	for (const t of await idb.cache.teams.getAll()) {
		if (t.draftLottery?.type === "nba2027") {
			delete t.draftLottery;
			await idb.cache.teams.put(t);
		}
	}
};
