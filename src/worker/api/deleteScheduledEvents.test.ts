import { PHASE } from "../../common/index.ts";
import { mockIDBLeague, resetCache } from "../../test/helpers.ts";
import { idb } from "../db/index.ts";
import { deleteScheduledEvents } from "./index.ts";
import { expect, test } from "vitest";

test("deletes a team-info event without touching other event types", async () => {
	await resetCache();
	idb.league = mockIDBLeague();

	const teamInfoID = await idb.cache.scheduledEvents.add({
		type: "teamInfo",
		season: 2027,
		phase: PHASE.PRESEASON,
		info: {
			tid: 0,
			srID: "ATL",
			region: "Atlanta",
			name: "Gold Club",
			stadiumCapacity: 30000,
			futureOfficialField: "remove",
		} as any,
	});
	const gameAttributesID = await idb.cache.scheduledEvents.add({
		type: "gameAttributes",
		season: 2027,
		phase: PHASE.PRESEASON,
		info: {
			salaryCap: 150000,
		},
	});

	await deleteScheduledEvents("teamInfo");

	expect(await idb.cache.scheduledEvents.get(teamInfoID)).toBeUndefined();
	expect(await idb.cache.scheduledEvents.get(gameAttributesID)).toEqual({
		id: gameAttributesID,
		type: "gameAttributes",
		season: 2027,
		phase: PHASE.PRESEASON,
		info: {
			salaryCap: 150000,
		},
	});
});
