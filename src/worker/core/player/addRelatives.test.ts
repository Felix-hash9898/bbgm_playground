import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	describe,
	test,
	vi,
} from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { mockIDBLeague, resetCache, resetG } from "../../../test/helpers.ts";
import { player } from "../index.ts";
import { makeBrother, makeSon } from "./addRelatives.ts";
import { idb } from "../../db/index.ts";
import type { Relative } from "../../../common/types.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { range } from "../../../common/utils.ts";
import { captureSigningContext } from "../capturedContext.ts";
import { g } from "../../util/index.ts";

const season = 2017;

const genFathers = () => {
	return range(season - 40, season - 20).map((season2) =>
		player.generate(PLAYER.RETIRED, 50, season2, true, DEFAULT_LEVEL),
	);
};

const genBrothers = () => {
	return range(season - 5, season + 1).map((season2) =>
		player.generate(0, 50, season2, true, DEFAULT_LEVEL),
	);
};

const getPlayer = async (pid: number) => {
	const p = await idb.cache.players.get(pid);
	if (p === undefined) {
		throw new Error("Invalid pid");
	}
	return p;
};

beforeAll(() => {
	resetG();
	idb.league = mockIDBLeague();
});
afterAll(() => {
	// @ts-expect-error
	idb.league = undefined;
});
afterEach(() => {
	vi.restoreAllMocks();
});
describe("makeBrother", () => {
	test("rollback restores touched relatives but preserves an unrelated concurrent player mutation", async () => {
		const target = player.generate(
			PLAYER.UNDRAFTED,
			20,
			season,
			true,
			DEFAULT_LEVEL,
		);
		const unrelated = player.generate(0, 25, 1900, true, DEFAULT_LEVEL);
		await resetCache({ players: [target, ...genBrothers(), unrelated] });
		const context = captureSigningContext();
		const before = new Map(
			(await context.cache.players.getAll()).map((p) => [
				p.pid,
				structuredClone(p),
			]),
		);
		const originalPut = context.cache.players.put.bind(context.cache.players);
		let injected = false;
		vi.spyOn(context.cache.players, "put").mockImplementation(async (row) => {
			const result = await originalPut(row);
			if (!injected) {
				injected = true;
				const concurrent = structuredClone(
					(await context.cache.players.get(unrelated.pid!))!,
				);
				concurrent.firstName = "Concurrent";
				await originalPut(concurrent);
				g.setWithoutSavingToDB("lid", context.lid + 1);
			}
			return result;
		});

		let rejected = false;
		try {
			await makeBrother(
				(await context.cache.players.get(target.pid!))!,
				context,
			);
		} catch {
			rejected = true;
		}
		assert.equal(rejected, true);
		g.setWithoutSavingToDB("lid", context.lid);
		for (const current of await context.cache.players.getAll()) {
			if (current.pid === unrelated.pid) {
				assert.strictEqual(current.firstName, "Concurrent");
			} else {
				assert.deepStrictEqual(current, before.get(current.pid));
			}
		}
	});

	test("rollback does not overwrite a newer mutation of the same relative pid", async () => {
		await resetCache({
			players: [
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
				...genBrothers(),
			],
		});
		const context = captureSigningContext();
		const originalPut = context.cache.players.put.bind(context.cache.players);
		let concurrentlyUpdatedPid: number | undefined;
		vi.spyOn(context.cache.players, "put").mockImplementation(async (row) => {
			const result = await originalPut(row);
			if (concurrentlyUpdatedPid === undefined) {
				concurrentlyUpdatedPid = row.pid;
				const concurrent = structuredClone(row);
				concurrent.college = "Concurrent University";
				await originalPut(concurrent);
				g.setWithoutSavingToDB("lid", context.lid + 1);
			}
			return result;
		});

		let rejected = false;
		try {
			await makeBrother((await context.cache.players.get(0))!, context);
		} catch {
			rejected = true;
		}
		assert.equal(rejected, true);
		g.setWithoutSavingToDB("lid", context.lid);
		assert.strictEqual(
			(await context.cache.players.get(concurrentlyUpdatedPid!))?.college,
			"Concurrent University",
		);
	});

	test("captured relative lookup aborts without one-way writes after a league switch", async () => {
		await resetCache({
			players: [
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
				...genBrothers(),
			],
		});
		const context = captureSigningContext();
		const before = structuredClone(await context.cache.players.getAll());
		const originalGetAll = context.cache.players.getAll.bind(
			context.cache.players,
		);
		let calls = 0;
		vi.spyOn(context.cache.players, "getAll").mockImplementation(async () => {
			const result = await originalGetAll();
			calls += 1;
			if (calls === 1) {
				g.setWithoutSavingToDB("lid", context.lid + 1);
			}
			return result;
		});

		let rejected = false;
		try {
			await makeBrother(await getPlayer(0), context);
		} catch {
			rejected = true;
		}
		assert.equal(rejected, true);
		g.setWithoutSavingToDB("lid", context.lid);
		assert.deepStrictEqual(await context.cache.players.getAll(), before);
	});

	test("captured relative put rollback preserves symmetric relationship state", async () => {
		await resetCache({
			players: [
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
				...genBrothers(),
			],
		});
		const context = captureSigningContext();
		const before = structuredClone(await context.cache.players.getAll());
		const originalPut = context.cache.players.put.bind(context.cache.players);
		let switched = false;
		vi.spyOn(context.cache.players, "put").mockImplementation(async (p) => {
			const result = await originalPut(p);
			if (!switched) {
				switched = true;
				g.setWithoutSavingToDB("lid", context.lid + 1);
			}
			return result;
		});

		let rejected = false;
		try {
			await makeBrother(await getPlayer(0), context);
		} catch {
			rejected = true;
		}
		assert.equal(rejected, true);
		g.setWithoutSavingToDB("lid", context.lid);
		assert.deepStrictEqual(await context.cache.players.getAll(), before);
	});

	test("captured jersey lookup cannot continue after switching leagues", async () => {
		const target = player.generate(0, 20, season, true, DEFAULT_LEVEL);
		const brother = player.generate(0, 25, season, true, DEFAULT_LEVEL);
		target.ratings.at(-1)!.pos = "PG";
		brother.ratings.at(-1)!.pos = "PG";
		brother.jerseyNumber = "7";
		await resetCache({ players: [target, brother] });
		const context = captureSigningContext();
		const before = structuredClone(await context.cache.players.getAll());
		vi.spyOn(Math, "random").mockReturnValue(0);
		const originalIndexGetAll = context.cache.players.indexGetAll.bind(
			context.cache.players,
		);
		vi.spyOn(context.cache.players, "indexGetAll").mockImplementation(
			async (...args) => {
				const result = await originalIndexGetAll(...args);
				g.setWithoutSavingToDB("lid", context.lid + 1);
				return result;
			},
		);

		let rejected = false;
		try {
			await makeBrother(await getPlayer(0), context);
		} catch {
			rejected = true;
		}
		assert.equal(rejected, true);
		g.setWithoutSavingToDB("lid", context.lid);
		assert.deepStrictEqual(await context.cache.players.getAll(), before);
	});

	test("make player the brother of another player", async () => {
		await resetCache({
			players: [
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
				...genBrothers(),
			],
		});
		const p = await getPlayer(0);
		p.born.loc = "Fake Country";
		await makeBrother(p);
		const brothers = await idb.cache.players.indexGetAll("playersByTid", 0);
		const brother = brothers.find((b) => b.relatives.length > 0);

		if (!brother) {
			throw new Error("No brother found");
		}

		assert.strictEqual(p.relatives.length, 1);
		assert.strictEqual(p.relatives[0]!.type, "brother");
		assert.strictEqual(p.relatives[0]!.pid, brother.pid);
		assert.strictEqual(brother.relatives.length, 1);
		assert.strictEqual(brother.relatives[0]!.type, "brother");
		assert.strictEqual(brother.relatives[0]!.pid, p.pid);
		assert.strictEqual(p.lastName, brother.lastName);
		assert.strictEqual(p.born.loc, brother.born.loc);
	});

	test("skip player if no possible brother exists", async () => {
		await resetCache({
			players: [
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
			],
		});
		const p = await getPlayer(0);
		await makeBrother(p);
		assert.strictEqual(p.relatives.length, 0);
	});

	test("handle case where target has a father", async () => {
		const initialBrothers = genBrothers();

		for (const p of initialBrothers) {
			p.relatives.push({
				type: "father",
				pid: 1,
				name: "Foo Bar",
			});
		}

		await resetCache({
			players: [
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
				player.generate(PLAYER.RETIRED, 50, season - 30, true, DEFAULT_LEVEL), // Father
				...initialBrothers,
			],
		});
		const p = await getPlayer(0);
		await makeBrother(p);
		const brothers = await idb.cache.players.indexGetAll("playersByTid", 0);
		const brother = brothers.find((b) => b.relatives.length > 1);

		if (!brother) {
			throw new Error("No brother found");
		}

		assert.strictEqual(p.relatives.length, 2);
		assert.strictEqual(p.relatives[0]!.type, "father");
		assert.strictEqual(p.relatives[0]!.pid, 1);
		assert.strictEqual(p.relatives[1]!.type, "brother");
		assert.strictEqual(p.relatives[1]!.pid, brother.pid);
		assert.strictEqual(brother.relatives.length, 2);
		assert.strictEqual(brother.relatives[0]!.type, "father");
		assert.strictEqual(brother.relatives[0]!.pid, 1);
		assert.strictEqual(brother.relatives[1]!.type, "brother");
		assert.strictEqual(brother.relatives[1]!.pid, p.pid);
	});

	test("handle case where source has a father", async () => {
		const initialPlayer = player.generate(
			PLAYER.UNDRAFTED,
			20,
			season,
			true,
			DEFAULT_LEVEL,
		);
		initialPlayer.firstName = "Foo";
		initialPlayer.lastName = "HasFather Jr.";
		initialPlayer.relatives.push({
			type: "father",
			pid: 1,
			name: "Foo HasFather",
		});
		await resetCache({
			players: [
				initialPlayer,
				player.generate(PLAYER.RETIRED, 50, season - 30, true, DEFAULT_LEVEL), // Father
				...genBrothers(),
			],
		});

		const father = await idb.cache.players.get(1);
		if (!father) {
			throw new Error("Missing father");
		}
		father.firstName = "Foo";
		father.lastName = "HasFather";

		const p = await getPlayer(0);
		await makeBrother(p);
		const brothers = await idb.cache.players.indexGetAll("playersByTid", 0);
		const brother = brothers.find((b) => b.relatives.length > 1);
		assert.strictEqual(brother, undefined);
	});

	test("handle case where both have fathers", async () => {
		const players = [
			player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
			...genBrothers(),
		];

		for (const p of players) {
			p.relatives.push({
				type: "father",
				pid: 666,
				name: "Foo Bar",
			});
		}

		await resetCache({
			players,
		});
		const p = await getPlayer(0);
		await makeBrother(p);
		const brothers = await idb.cache.players.indexGetAll("playersByTid", 0);
		const brother = brothers.find((b) => b.relatives.length > 1);
		assert.strictEqual(brother, undefined);
	});

	test("handle case where target has a brother", async () => {
		const initialP = player.generate(
			PLAYER.UNDRAFTED,
			20,
			season,
			true,
			DEFAULT_LEVEL,
		);
		const initialBrothers = genBrothers();

		for (const p of initialBrothers) {
			p.relatives.push({
				type: "brother",
				pid: 1,
				name: "Foo Bar",
			});
		}

		await resetCache({
			players: [
				initialP,
				player.generate(PLAYER.RETIRED, 25, season - 6, true, DEFAULT_LEVEL), // Extra brother - 6 years ago means never picked by makeBrother
				...initialBrothers,
			],
		});
		const p = await getPlayer(0);
		await makeBrother(p);
		const brothers = await idb.cache.players.indexGetAll("playersByTid", 0);
		const brother = brothers.find((b) => b.relatives.length > 1);

		if (!brother) {
			throw new Error("No brother found");
		}

		assert.strictEqual(p.relatives.length, 2);
		assert.strictEqual(p.relatives[0]!.type, "brother");
		assert.strictEqual(p.relatives[0]!.pid, 1);
		assert.strictEqual(p.relatives[1]!.type, "brother");
		assert.strictEqual(p.relatives[1]!.pid, brother.pid);

		assert.strictEqual(brother.relatives.length, 2);
		assert.strictEqual(brother.relatives[0]!.type, "brother");
		assert.strictEqual(brother.relatives[0]!.pid, 1);
		assert.strictEqual(brother.relatives[1]!.type, "brother");
		assert.strictEqual(brother.relatives[1]!.pid, p.pid);
	});

	test("handle case where source has a brother", async () => {
		const initialPlayer = player.generate(
			PLAYER.UNDRAFTED,
			20,
			season,
			true,
			DEFAULT_LEVEL,
		);
		initialPlayer.relatives.push({
			type: "brother",
			pid: 1,
			name: "Foo Bar",
		});
		await resetCache({
			players: [
				initialPlayer,
				player.generate(PLAYER.RETIRED, 25, season - 5, true, DEFAULT_LEVEL), // Extra brother
				...genBrothers(),
			],
		});
		const p = await getPlayer(0);
		await makeBrother(p);
		const brothers = await idb.cache.players.indexGetAll("playersByTid", 0);
		const brother = brothers.find((b) => b.relatives.length > 1);
		assert.strictEqual(brother, undefined);
		assert.strictEqual(p.relatives.length, 1);
	});
});

describe("makeSon", () => {
	test("make player the son of another player", async () => {
		await resetCache({
			players: [
				// Son
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL), // Fathers
				...genFathers(),
			],
		});
		const son = await getPlayer(0);
		son.born.loc = "Fake Country";
		await makeSon(son);
		const fathers = await idb.cache.players.indexGetAll(
			"playersByTid",
			PLAYER.RETIRED,
		);
		const father = fathers.find((p) => p.relatives.length > 0);

		if (!father) {
			throw new Error("No father found");
		}

		assert.strictEqual(son.relatives.length, 1);
		assert.strictEqual(son.relatives[0]!.type, "father");
		assert.strictEqual(son.relatives[0]!.pid, father.pid);
		assert.strictEqual(father.relatives.length, 1);
		assert.strictEqual(father.relatives[0]!.type, "son");
		assert.strictEqual(father.relatives[0]!.pid, son.pid);
		assert.strictEqual(son.born.loc, father.born.loc);
	});

	test("skip player if no possible father exists", async () => {
		await resetCache({
			players: [
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL),
			],
		});
		const son = await getPlayer(0);
		await makeSon(son);
		assert.strictEqual(son.relatives.length, 0);
	});

	test("skip player if he already has a father", async () => {
		await resetCache({
			players: [
				// Son
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL), // Fathers
				...genFathers(),
			],
		});
		const relFather: Relative = {
			type: "father",
			pid: 1,
			name: "Foo Bar",
		};
		const son = await getPlayer(0);
		son.relatives = [relFather];
		await makeSon(son);
		const fathers = await idb.cache.players.indexGetAll(
			"playersByTid",
			PLAYER.RETIRED,
		);
		const father = fathers.find((p) => p.relatives.length > 0);
		assert(!father);
		assert.strictEqual(son.relatives.length, 1);
		assert.deepStrictEqual(son.relatives[0], relFather);
	});

	test("handle case where player already has a brother", async () => {
		await resetCache({
			players: [
				// Son
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL), // Brother
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL), // Fathers
				...genFathers(),
			],
		});
		const son = await getPlayer(0);
		son.relatives = [
			{
				type: "brother",
				pid: 1,
				name: "Foo Bar",
			},
		];
		await idb.cache.players.put(son);
		const brother = await getPlayer(1);
		brother.born.loc = "Fake Country";
		brother.relatives = [
			{
				type: "brother",
				pid: 0,
				name: "Foo Bar",
			},
		];
		await idb.cache.players.put(brother);
		await makeSon(son);
		const fathers = await idb.cache.players.indexGetAll(
			"playersByTid",
			PLAYER.RETIRED,
		);
		const father = fathers.find((p) => p.relatives.length > 0);

		if (!father) {
			throw new Error("No father found");
		}

		const son2 = await getPlayer(0);
		const brother2 = await getPlayer(1);
		assert.strictEqual(son2.relatives.length, 2);
		assert.strictEqual(son2.relatives[0]!.type, "father");
		assert.strictEqual(son2.relatives[0]!.pid, father.pid);
		assert.strictEqual(son2.relatives[1]!.type, "brother");
		assert.strictEqual(son2.relatives[1]!.pid, brother2.pid);
		assert.strictEqual(brother2.relatives.length, 2);
		assert.strictEqual(brother2.relatives[0]!.type, "father");
		assert.strictEqual(brother2.relatives[0]!.pid, father.pid);
		assert.strictEqual(brother2.relatives[1]!.type, "brother");
		assert.strictEqual(brother2.relatives[1]!.pid, son2.pid);
		assert.strictEqual(father.relatives.length, 2);
		assert.strictEqual(father.relatives[0]!.type, "son");
		assert.strictEqual(father.relatives[1]!.type, "son");
		assert.deepStrictEqual(
			father.relatives.map((relative) => relative.pid).sort(),
			[0, 1],
		);
		assert.strictEqual(brother2.born.loc, father.born.loc);
	});

	test("handle case where father already has a son", async () => {
		const initialFathers = genFathers();
		const initialOtherSons = initialFathers.map(() =>
			player.generate(0, 25, season, true, DEFAULT_LEVEL),
		);
		await resetCache({
			players: [
				// Son
				player.generate(PLAYER.UNDRAFTED, 20, season, true, DEFAULT_LEVEL), // Other sons (one for each potential father)
				...initialOtherSons, // Fathers
				...initialFathers,
			],
		});
		const fathers = await idb.cache.players.indexGetAll(
			"playersByTid",
			PLAYER.RETIRED,
		);
		const otherSons = await idb.cache.players.indexGetAll("playersByTid", 0);
		assert.strictEqual(fathers.length, otherSons.length);

		for (const [i, father] of fathers.entries()) {
			const otherSon = otherSons[i]!;
			father.relatives.push({
				type: "son",
				pid: otherSon.pid,
				name: `${otherSon.firstName} ${otherSon.lastName}`,
			});
			otherSon.relatives.push({
				type: "father",
				pid: father.pid,
				name: `${father.firstName} ${father.lastName}`,
			});
			await idb.cache.players.put(father);
			await idb.cache.players.put(otherSon);
		}

		const son = await getPlayer(0);
		await makeSon(son);
		const fathers2 = await idb.cache.players.indexGetAll(
			"playersByTid",
			PLAYER.RETIRED,
		);
		const father = fathers2.find((p) => p.relatives.length > 1);

		if (!father) {
			throw new Error("No father found");
		}

		const otherSons2 = await idb.cache.players.indexGetAll("playersByTid", 0);
		const otherSon = otherSons2.find((p) => p.relatives.length > 1);

		if (!otherSon) {
			throw new Error("No other son found");
		}

		const son2 = await getPlayer(0);
		assert.strictEqual(son2.relatives.length, 2);
		assert.strictEqual(son2.relatives[0]!.type, "father");
		assert.strictEqual(son2.relatives[0]!.pid, father.pid);
		assert.strictEqual(son2.relatives[1]!.type, "brother");
		assert.strictEqual(son2.relatives[1]!.pid, otherSon.pid);
		assert.strictEqual(otherSon.relatives.length, 2);
		assert.strictEqual(otherSon.relatives[0]!.type, "father");
		assert.strictEqual(otherSon.relatives[0]!.pid, father.pid);
		assert.strictEqual(otherSon.relatives[1]!.type, "brother");
		assert.strictEqual(otherSon.relatives[1]!.pid, son2.pid);
		assert.strictEqual(father.relatives.length, 2);
		assert.strictEqual(father.relatives[0]!.type, "son");
		assert.strictEqual(father.relatives[1]!.type, "son");
		assert.deepStrictEqual(
			father.relatives.map((relative) => relative.pid).sort(),
			[son2.pid, otherSon.pid],
		);
	});
});
