import "fake-indexeddb/auto";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { player, team } from "../index.ts";
import { captureSigningContext } from "../capturedContext.ts";
import release from "./release.ts";
import { g } from "../../util/index.ts";
import { idb } from "../../db/index.ts";

let originalLid: number;
let existingReleasedPlayers: any[];

beforeEach(async () => {
	resetG();
	originalLid = g.get("lid");
	const t = team.generate({
		tid: 0,
		cid: 0,
		did: 0,
		region: "Region",
		name: "Team",
		abbrev: "T",
		pop: 1,
	});
	const p = player.generate(
		0,
		30,
		g.get("season") - 5,
		true,
		DEFAULT_LEVEL,
	) as any;
	await resetCache({ players: [p], teams: [t] });
	await idb.cache.releasedPlayers.add({
		pid: 100,
		tid: 0,
		contract: { amount: 500, exp: g.get("season") + 1 },
	});
	await idb.cache.releasedPlayers.add({
		pid: 101,
		tid: 1,
		contract: { amount: 600, exp: g.get("season") + 2 },
	});
	existingReleasedPlayers = structuredClone(
		await idb.cache.releasedPlayers.getAll(),
	);
});

afterEach(() => {
	g.setWithoutSavingToDB("lid", originalLid);
	vi.restoreAllMocks();
});

const getPlayer = async () => (await idb.cache.players.getAll())[0]!;

const assertOnlyExistingReleasedPlayers = async () => {
	assert.deepStrictEqual(
		await idb.cache.releasedPlayers.getAll(),
		existingReleasedPlayers,
	);
};

const assertRejected = async (
	operation: () => Promise<unknown>,
	expected?: Error,
) => {
	let rejected = false;
	try {
		await operation();
	} catch (error) {
		rejected = true;
		if (expected !== undefined) {
			assert.strictEqual(error, expected);
		}
	}
	assert.equal(rejected, true);
};

test("release rolls back releasedPlayers when the league changes after its add", async () => {
	const context = captureSigningContext();
	let addedRid: number | undefined;
	const originalAdd = idb.cache.releasedPlayers.add.bind(
		idb.cache.releasedPlayers,
	);
	vi.spyOn(idb.cache.releasedPlayers, "add").mockImplementation(async (row) => {
		const result = await originalAdd(row);
		addedRid = result;
		g.setWithoutSavingToDB("lid", originalLid + 1);
		return result;
	});

	const p = await getPlayer();
	await assertRejected(() => release(p, false, context));
	assert.notEqual(addedRid, p.pid);
	await assertOnlyExistingReleasedPlayers();
	assert.equal((await idb.cache.events.getAll()).length, 0);
	assert.equal((await getPlayer()).tid, 0);
});

test("release rolls back its event when the league changes after event creation", async () => {
	const context = captureSigningContext();
	const originalAdd = idb.cache.events.add.bind(idb.cache.events);
	vi.spyOn(idb.cache.events, "add").mockImplementation(async (row) => {
		const result = await originalAdd(row);
		g.setWithoutSavingToDB("lid", originalLid + 1);
		return result;
	});

	const p = await getPlayer();
	await assertRejected(() => release(p, false, context));
	assert.equal((await idb.cache.events.getAll()).length, 0);
	await assertOnlyExistingReleasedPlayers();
	assert.equal((await getPlayer()).tid, 0);
});

test("release rolls back all memory state when the player put fails", async () => {
	const context = captureSigningContext();
	const error = new Error("player put failed");
	vi.spyOn(idb.cache.players, "put").mockRejectedValueOnce(error);

	const p = await getPlayer();
	await assertRejected(() => release(p, false, context), error);
	await assertOnlyExistingReleasedPlayers();
	assert.equal((await idb.cache.events.getAll()).length, 0);
	assert.equal((await getPlayer()).tid, 0);
});

test("release reports both the original error and rollback rid delete error", async () => {
	const context = captureSigningContext();
	const originalAdd = idb.cache.releasedPlayers.add.bind(
		idb.cache.releasedPlayers,
	);
	let addedRid: number | undefined;
	vi.spyOn(idb.cache.releasedPlayers, "add").mockImplementation(async (row) => {
		addedRid = await originalAdd(row);
		g.setWithoutSavingToDB("lid", originalLid + 1);
		return addedRid;
	});
	const rollbackError = new Error("rid delete rollback failed");
	vi.spyOn(idb.cache.releasedPlayers, "delete").mockImplementation(
		async (rid) => {
			if (rid === addedRid) {
				throw rollbackError;
			}
		},
	);

	const p = await getPlayer();
	let caught: any;
	try {
		await release(p, false, context);
	} catch (error) {
		caught = error;
	}
	assert.isDefined(caught);
	assert.match(caught.message, /release failed and rollback failed/);
	assert.match(caught.originalError.message, /context changed/);
	assert.strictEqual(caught.rollbackError, rollbackError);
	assert.equal(
		(await idb.cache.releasedPlayers.getAll()).some(
			(row) => row.rid === addedRid,
		),
		true,
	);
	assert.equal((await idb.cache.events.getAll()).length, 0);
	assert.equal((await getPlayer()).tid, 0);
});
