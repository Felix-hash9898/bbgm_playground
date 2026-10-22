import { assert, test } from "vitest";
import {
	getBasketballMinutesOverrideContext,
	getGameEffectiveBasketballMinutesWithStatus as allocate,
	type BasketballCoreReliance,
	type BasketballRotationDepth,
} from "./basketballMinutes.ts";

const positions = [
	"PG",
	"SG",
	"SF",
	"PF",
	"C",
	"G",
	"FC",
	"PG",
	"GF",
	"C",
	"F",
	"SG",
];
const plan = Object.fromEntries(
	[48, 44, 40, 38, 36, 34, 0, 0, 0, 0, 0, 0].map((n, pid) => [pid, n]),
);
const cores: BasketballCoreReliance[] = ["high", "balanced", "low"];
const depths: BasketballRotationDepth[] = ["short", "normal", "long"];
for (const coreReliance of cores) {
	for (const rotationDepth of depths) {
		test(`pins, protection and unavailable plan edits are coherent: ${coreReliance}/${rotationDepth}`, () => {
			for (const rated of [false, true]) {
				for (const locks of [[], [1, 2, 3, 4, 5]]) {
					for (const pins of [
						{ 0: 28 },
						{ 0: 48 },
						{ 0: 28, 2: 44, 8: 0 },
					] as Record<number, number>[]) {
						const players = positions.map((position, pid) => ({
							pid,
							rosterOrder: pid,
							position,
							endurance: rated ? 0.4 + pid / 40 : 0.5,
							available: pid !== 6,
							...(rated
								? { ovr: 75 - pid * 3, ovrPercentile: 0.95 - pid * 0.06 }
								: {}),
						}));
						// A second upward pin may not supersede a protected player's healthy cap.
						const protectedPids = locks.filter(
							(pid) => !Object.hasOwn(pins, pid),
						);
						const common = {
							players,
							numPlayersOnCourt: 5,
							regulationMinutes: 48,
							coreReliance,
							rotationDepth,
							noInjuryMinutesIncreasePids: protectedPids,
							currentMinutesOverrideByPid: pins,
							currentMinutesOverrideContext:
								getBasketballMinutesOverrideContext({
									players,
									available: new Set(
										players.filter((p) => p.available).map((p) => p.pid),
									),
									numPlayersOnCourt: 5,
									regulationMinutes: 48,
								}),
						};
						const before = structuredClone(plan);
						const outputs = [0, 1e-6, 1, 2, 3, 4].map((edit) => {
							const minutesByPid: Record<number, number> = {
								...plan,
								1: 44 - edit,
								6: edit,
							};
							const result = allocate({ ...common, minutesByPid });
							assert.isUndefined(result.allocationError);
							assert.isUndefined(result.currentMinutesOverrideError);
							assert.closeTo(
								Object.values(result.minutesByPid).reduce((a, b) => a + b, 0),
								240,
								1e-7,
							);
							for (const [pid, value] of Object.entries(pins)) {
								assert.equal(result.minutesByPid[Number(pid)], value);
							}
							for (const pid of protectedPids) {
								assert.isAtMost(
									result.minutesByPid[pid]!,
									minutesByPid[pid]! + 1e-7,
								);
							}
							assert.equal(result.minutesByPid[6], 0);
							assert.deepEqual(
								result,
								allocate({
									...common,
									minutesByPid,
									players: [...players].reverse(),
								}),
							);
							return result.minutesByPid;
						});
						assert.deepEqual(
							plan,
							before,
							"temporary allocation must not overwrite healthy intent",
						);
						const change = (a: number, b: number) =>
							Math.max(
								...positions.map((_, pid) =>
									Math.abs(outputs[a]![pid]! - outputs[b]![pid]!),
								),
							);
						assert.isBelow(change(0, 1), 0.001);
						for (const [a, b] of [
							[0, 2],
							[2, 3],
							[3, 4],
							[4, 5],
						]) {
							assert.isBelow(change(a!, b!), 3);
						}
					}
				}
			}
		});
	}
}

test("pins and hard protection report infeasibility without a hidden cap override", () => {
	const players = positions.slice(0, 6).map((position, pid) => ({
		pid,
		rosterOrder: pid,
		position,
		endurance: 0.5,
		available: true,
	}));
	const minutesByPid = { 0: 48, 1: 48, 2: 48, 3: 48, 4: 24, 5: 24 };
	const context = getBasketballMinutesOverrideContext({
		players,
		available: new Set(players.map((p) => p.pid)),
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	const result = allocate({
		players,
		minutesByPid,
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
		noInjuryMinutesIncreasePids: [1, 2, 3, 4, 5],
		currentMinutesOverrideByPid: { 0: 0 },
		currentMinutesOverrideContext: context,
	});
	assert.match(result.currentMinutesOverrideError!, /no legal way/);
	assert.isUndefined(result.activeCurrentMinutesOverrideByPid);
	assert.deepEqual(result.minutesByPid, minutesByPid);
});

for (const coreReliance of cores) {
	for (const rotationDepth of depths) {
		test(`pinning current automatic targets is a no-op: ${coreReliance}/${rotationDepth}`, () => {
			for (const rated of [false, true]) {
				const players = Array.from({ length: 15 }, (_, pid) => ({
					pid,
					rosterOrder: pid,
					position: positions[pid % positions.length],
					endurance: 0.5,
					available: pid > 2,
					...(rated
						? { ovr: 78 - pid * 3, ovrPercentile: 0.95 - pid * 0.06 }
						: {}),
				}));
				const healthy = [38, 35, 33, 30, 27, 24, 20, 18, 15, 0, 0, 0, 0, 0, 0];
				const args = {
					players,
					minutesByPid: Object.fromEntries(healthy.map((n, pid) => [pid, n])),
					numPlayersOnCourt: 5,
					regulationMinutes: 48,
					coreReliance,
					rotationDepth,
					noInjuryMinutesIncreasePids: [4, 6],
				};
				const automatic = allocate(args);
				assert.isUndefined(automatic.allocationError);
				const context = getBasketballMinutesOverrideContext({
					players,
					available: new Set(
						players.filter((p) => p.available).map((p) => p.pid),
					),
					numPlayersOnCourt: 5,
					regulationMinutes: 48,
				});
				for (const pid of [3, 5, 7, 9, 12]) {
					const pin = automatic.minutesByPid[pid]!;
					const pinned = {
						...args,
						currentMinutesOverrideByPid: { [pid]: pin },
						currentMinutesOverrideContext: context,
					};
					assert.deepEqual(
						allocate(pinned).minutesByPid,
						automatic.minutesByPid,
					);
					for (const sign of [-1, 1]) {
						const value = pin + sign * 1e-6;
						if (value < 0 || value > 48) {
							continue;
						}
						const edited = allocate({
							...pinned,
							currentMinutesOverrideByPid: { [pid]: value },
						});
						assert.isUndefined(edited.currentMinutesOverrideError);
						assert.isBelow(
							Math.max(
								...players.map((p) =>
									Math.abs(
										edited.minutesByPid[p.pid]! -
											automatic.minutesByPid[p.pid]!,
									),
								),
							),
							0.001,
						);
					}
				}
				const pins = Object.fromEntries(
					[3, 5, 7].map((pid) => [pid, automatic.minutesByPid[pid]!]),
				);
				assert.deepEqual(
					allocate({
						...args,
						currentMinutesOverrideByPid: pins,
						currentMinutesOverrideContext: context,
					}).minutesByPid,
					automatic.minutesByPid,
				);
			}
		});
	}
}

test("an upward pin can consume many individually tiny injury extras", () => {
	const players = positions.map((position, pid) => ({
		pid,
		rosterOrder: pid,
		position,
		endurance: 0.5,
		available: pid !== 10,
	}));
	const healthy = [38, 37, 34, 33, 31, 23, 18, 15, 4, 6, 0, 1];
	const minutesByPid: Record<number, number> = Object.fromEntries(
		healthy.map((n, pid) => [pid, n]),
	);
	minutesByPid[1]! -= 1e-6;
	minutesByPid[10] = 1e-6;
	const result = allocate({
		players,
		minutesByPid,
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
		coreReliance: "high",
		rotationDepth: "short",
		currentMinutesOverrideByPid: { 0: 48 },
		currentMinutesOverrideContext: getBasketballMinutesOverrideContext({
			players,
			available: new Set(players.filter((p) => p.available).map((p) => p.pid)),
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		}),
	});
	assert.isUndefined(result.allocationError);
	assert.isUndefined(result.currentMinutesOverrideError);
	assert.equal(result.minutesByPid[0], 48);
	assert.equal(result.minutesByPid[10], 0);
	assert.closeTo(
		Object.values(result.minutesByPid).reduce((a, b) => a + b, 0),
		240,
		1e-7,
	);
});
