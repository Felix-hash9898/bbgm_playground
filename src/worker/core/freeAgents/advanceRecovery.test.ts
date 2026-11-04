import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { freeAgents, player, team } from "../index.ts";
import { getMinContractForPlayer } from "../contracts/contractMinimum.ts";

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
	await resetCache({
		teams: helpers.getTeamsDefault().slice(0, 2).map(team.generate),
	});
});
afterEach(() => vi.restoreAllMocks());

const candidate = async (years: number, option: "player" | "team") => {
	const p = player.generate(
		PLAYER.FREE_AGENT,
		30,
		g.get("season") - 8,
		true,
		DEFAULT_LEVEL,
	);
	p.value = 80;
	p.valueNoPot = 80;
	p.contract = {
		amount: getMinContractForPlayer(p) + 100,
		exp: g.get("season") + years - 1,
		option,
	};
	const pid = await idb.cache.players.add(p);
	return { ...p, pid };
};

test.each(["player", "team"] as const)(
	"daily demand shortening removes an illegal %s option before real AI signing",
	async (option) => {
		const p = await candidate(2, option);
		await freeAgents.decreaseDemands();
		expect((await idb.cache.players.get(p.pid))!.contract.exp).toBe(
			g.get("season"),
		);
		expect(
			(await idb.cache.players.get(p.pid))!.contract.option,
		).toBeUndefined();
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		await freeAgents.autoSign();
		expect((await idb.cache.players.get(p.pid))!.tid).toBe(1);
	},
);

test.each(["soft", "hard", "none"] as const)(
	"AI repairs a stale one-year option in a %s cap league",
	async (cap) => {
		g.setWithoutSavingToDB("salaryCapType", cap);
		const p = await candidate(1, "player");
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		await freeAgents.autoSign();
		const signed = (await idb.cache.players.get(p.pid))!;
		expect(signed.tid).toBe(1);
		expect(signed.contract.option).toBeUndefined();
	},
);

test.each(["player", "team"] as const)(
	"AI preserves a legal two-year %s option",
	async (option) => {
		const p = await candidate(2, option);
		vi.spyOn(Math, "random").mockReturnValue(0.99);
		await freeAgents.autoSign();
		const signed = (await idb.cache.players.get(p.pid))!;
		expect(signed.tid).toBe(1);
		expect(signed.contract.option).toBe(option);
	},
);

test("uncapped AI re-quotes a stale term before submitting it to strict validation", async () => {
	g.setWithoutSavingToDB("salaryCapType", "none");
	g.setWithoutSavingToDB("maxContractLength", 2);
	const p = await candidate(5, "player");
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	await freeAgents.autoSign();
	const signed = (await idb.cache.players.get(p.pid))!;
	expect(signed.tid).toBe(1);
	expect(signed.contract.exp - g.get("season") + 1).toBeLessThanOrEqual(2);
});
