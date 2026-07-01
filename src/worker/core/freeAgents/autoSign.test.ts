import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { freeAgents, player, team } from "../index.ts";
import {
	countStandardContracts,
	countTwoWayContracts,
	isTwoWayContract,
} from "../contracts/contractTwoWay.ts";

const makePlayer = ({
	tid,
	age = 30,
	draftRound = 2,
	draftYearsAgo = 8,
	ovr = 45,
	pot = 55,
	value = 45,
	valueNoPot = 42,
	contractAmount,
	contractType,
}: {
	tid: number;
	age?: number;
	draftRound?: number;
	draftYearsAgo?: number;
	ovr?: number;
	pot?: number;
	value?: number;
	valueNoPot?: number;
	contractAmount?: number;
	contractType?: "standard" | "twoWay";
}) => {
	const p = player.generate(
		tid,
		age,
		g.get("season") - draftYearsAgo,
		true,
		DEFAULT_LEVEL,
	);
	const ratings = p.ratings.at(-1)!;
	ratings.ovr = ovr;
	ratings.pot = pot;
	p.draft.round = draftRound;
	p.draft.pick = draftRound > 0 ? 45 : 0;
	p.value = value;
	p.valueNoPot = valueNoPot;
	if (contractAmount !== undefined) {
		p.contract.amount = contractAmount;
	}
	if (contractType !== undefined) {
		p.contract.type = contractType;
	}
	return p;
};

const makeEligibleTwoWayFreeAgent = (value = 45) =>
	makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 22,
		draftRound: 0,
		draftYearsAgo: 0,
		value,
		valueNoPot: 42,
		contractAmount: g.get("minContract"),
	});

const resetCacheForAutoSign = async ({
	aiStandardPlayers,
	aiTwoWayPlayers = 0,
	freeAgentPlayers,
}: {
	aiStandardPlayers: number;
	aiTwoWayPlayers?: number;
	freeAgentPlayers: ReturnType<typeof makePlayer>[];
}) => {
	const players = [
		...Array.from({ length: g.get("minRosterSize") }, () =>
			makePlayer({ tid: g.get("userTid") }),
		),
		...Array.from({ length: aiStandardPlayers }, () => makePlayer({ tid: 1 })),
		...Array.from({ length: aiTwoWayPlayers }, () =>
			makePlayer({
				tid: 1,
				age: 22,
				draftRound: 0,
				draftYearsAgo: 0,
				contractAmount: g.get("minContract"),
				contractType: "twoWay",
			}),
		),
		...freeAgentPlayers,
	];

	const teams = helpers.getTeamsDefault().slice(0, 2).map(team.generate);

	await resetCache({
		players,
		teams,
	});
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
});

afterEach(() => {
	vi.restoreAllMocks();
});

const autoSignWithoutRandomSkip = async () => {
	vi.spyOn(Math, "random")
		.mockImplementationOnce(() => 0.99)
		.mockImplementationOnce(() => 0.99);

	await freeAgents.autoSign();
};

test("AI team with available two-way slot can sign an eligible low-end young free agent to two-way", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [makeEligibleTwoWayFreeAgent()],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(countTwoWayContracts(players, 1), 1);
	assert.strictEqual(countStandardContracts(players, 1), g.get("maxRosterSize") - 2);
	assert.strictEqual(
		players.some((p) => isTwoWayContract(p.contract)),
		true,
	);
});

test("AI team with three existing two-way contracts does not sign a fourth two-way", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		aiTwoWayPlayers: 3,
		freeAgentPlayers: [makeEligibleTwoWayFreeAgent()],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	const freeAgentPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	assert.strictEqual(countTwoWayContracts(players, 1), 3);
	assert.strictEqual(freeAgentPlayers.length, 1);
});

test("AI does not sign first-round or normal rotation young players to two-way", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				age: 22,
				draftRound: 1,
				draftYearsAgo: 0,
				contractAmount: g.get("minContract"),
			}),
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				age: 22,
				draftRound: 2,
				draftYearsAgo: 2,
				ovr: 52,
				pot: 63,
				value: 62,
				valueNoPot: 52,
				contractAmount: g.get("minContract"),
			}),
		],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	const freeAgentPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	assert.strictEqual(countTwoWayContracts(players, 1), 0);
	assert.strictEqual(freeAgentPlayers.length, 2);
});

test("AI two-way signing does not fill standard minimum roster size", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("minRosterSize") - 1,
		freeAgentPlayers: [makeEligibleTwoWayFreeAgent()],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(countTwoWayContracts(players, 1), 0);
	assert.strictEqual(countStandardContracts(players, 1), g.get("minRosterSize"));
});
