import { assert, beforeEach, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER, helpers } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { player, team } from "../index.ts";
import reconcileBasketballRotation from "./reconcileBasketballRotation.ts";

const VALUES = [40, 36, 34, 32, 30, 26, 24, 18];

const setup = async () => {
	const players = Array.from({ length: 8 }, (_, i) => {
		const p = player.generate(0, 25, 2024, true, DEFAULT_LEVEL);
		p.pid = 100 + i;
		p.rosterOrder = i;
		return p;
	});
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	t.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid: Object.fromEntries(
			players.map((p, i) => [p.pid!, VALUES[i]!]),
		),
		numPlayersOnCourtAtSave: 5,
	};
	await resetCache({ players, teams: [t] });
	return players;
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("season", 2024);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
});

test("final roster reconciliation covers outgoing and incoming transaction players once", async () => {
	const players = await setup();
	const outgoing = players[0]!;
	outgoing.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(outgoing);

	const incoming = player.generate(0, 24, 2024, true, DEFAULT_LEVEL);
	incoming.pid = 999;
	incoming.rosterOrder = 7;
	await idb.cache.players.put(incoming);

	await reconcileBasketballRotation([0]);
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.mode, "custom");
	assert.strictEqual(rotation.minutesByPid![outgoing.pid!], undefined);
	assert.strictEqual(rotation.minutesByPid![incoming.pid!], 0);
	assert.closeTo(
		Object.values(rotation.minutesByPid!).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		240,
		8,
	);
});

test("a court-size change relegalizes the saved custom plan and fingerprint", async () => {
	await setup();
	await reconcileBasketballRotation([0], { numPlayersOnCourt: 3 });
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.numPlayersOnCourtAtSave, 3);
	assert.closeTo(
		Object.values(rotation.minutesByPid!).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		144,
		8,
	);
});
