import { assert, describe, test } from "vitest";
import {
	generateBasketballAutoMinutes,
	getBasketballGameAvailability,
	getBasketballMinutesOverrideContext,
	getBasketballRosterMinutesPlan,
	getBasketballRotationMinutes,
	getGameEffectiveBasketballMinutes,
	getGameEffectiveBasketballMinutesWithStatus,
	fillBasketballRosterVacancy,
	getBasketballRotationPlayerInput,
	legalizeBasketballCustomMinutes,
	sanitizeBasketballRotation,
	validateBasketballMinutes,
	validateBasketballMinutesForGame,
	type BasketballMinutesPlayer,
} from "./basketballMinutes.ts";
import fuzzRating from "../player/fuzzRating.ts";

const makePlayers = (count: number): BasketballMinutesPlayer[] =>
	Array.from({ length: count }, (_, i) => ({
		pid: 100 + i,
		rosterOrder: i,
		endurance: 0.65 - i * 0.015,
	}));

const sum = (minutes: Record<number, number>) =>
	Object.values(minutes).reduce((total, value) => total + value, 0);

describe("basketball Dynamic minute plans", () => {
	test.each([
		[5, 12, 240],
		[3, 8, 144],
		[1, 4, 48],
	])(
		"Auto is deterministic, legal, and exact for %i-on-%i",
		(numPlayersOnCourt, rosterSize, required) => {
			const players = makePlayers(rosterSize);
			const first = generateBasketballAutoMinutes({
				players,
				numPlayersOnCourt,
				playoffs: false,
			});
			const second = generateBasketballAutoMinutes({
				players: structuredClone(players),
				numPlayersOnCourt,
				playoffs: false,
			});

			assert.deepEqual(first, second);
			assert.strictEqual(sum(first), required);
			assert(Object.values(first).every((value) => value >= 0 && value <= 48));
			assert(Object.values(first).every((value) => Number.isInteger(value)));
			assert.strictEqual(
				validateBasketballMinutes({
					players,
					minutesByPid: first,
					numPlayersOnCourt,
				}),
				undefined,
			);
		},
	);

	test("Auto follows roster depth and the supplied endurance projection", () => {
		const players = makePlayers(10);
		const baseline = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		const visibleEnduranceChange = generateBasketballAutoMinutes({
			players: players.map((p) => (p.pid === 100 ? { ...p, endurance: 0 } : p)),
			numPlayersOnCourt: 5,
			playoffs: false,
		});

		assert(baseline[100]! > baseline[108]!);
		assert(visibleEnduranceChange[100]! < baseline[100]!);
	});

	test("representative 12-player Auto plan preserves the intended core/depth hierarchy", () => {
		const players = makePlayers(12);
		const regular = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.deepEqual(
			Object.values(regular),
			[36, 35, 33, 32, 29, 21, 19, 15, 9, 6, 5, 0],
		);
		const playoffs = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 5,
			playoffs: true,
		});
		assert(
			players.slice(0, 5).reduce((total, p) => total + playoffs[p.pid]!, 0) >
				players.slice(0, 5).reduce((total, p) => total + regular[p.pid]!, 0),
		);
		assert.strictEqual(sum(playoffs), 240);
		assert(Object.values(playoffs).every((value) => Number.isInteger(value)));
		assert.strictEqual(playoffs[110], 0);
		assert.strictEqual(playoffs[111], 0);
	});

	test("Auto uses a finite rotation depth and remains exact for custom court sizes", () => {
		const players = makePlayers(14);
		const regular = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 7,
			playoffs: false,
		});
		assert.strictEqual(sum(regular), 336);
		assert(Object.values(regular).filter((value) => value > 0).length >= 7);
		assert.strictEqual(regular[113], 0);
	});

	test("finite Auto depth never receives a rounding tail", () => {
		const players = makePlayers(20);
		const regular = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		const playoffs = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 5,
			playoffs: true,
		});
		assert(
			Object.values(regular)
				.slice(11)
				.every((value) => value === 0),
		);
		assert(
			Object.values(playoffs)
				.slice(10)
				.every((value) => value === 0),
		);
		assert.strictEqual(sum(regular), 240);
		assert.strictEqual(sum(playoffs), 240);
	});

	test("legacy decimal custom plans normalize to integer minutes and preserve the total", () => {
		const players = makePlayers(8);
		const normalized = legalizeBasketballCustomMinutes({
			players,
			minutesByPid: Object.fromEntries(
				players.map((p, i) => [
					p.pid,
					[40.4, 35.6, 34.2, 31.8, 30.1, 26.4, 24.3, 17.2][i]!,
				]),
			),
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.strictEqual(sum(normalized), 240);
		assert(Object.values(normalized).every((value) => Number.isInteger(value)));
	});

	test("custom legalization drops outgoing players, leaves an incoming player at zero, and preserves the remaining proportions", () => {
		const beforePlayers = makePlayers(9);
		const before = Object.fromEntries(
			beforePlayers.map((p, i) => [
				p.pid,
				[38, 36, 34, 32, 30, 26, 22, 14, 8][i]!,
			]),
		);
		assert.strictEqual(sum(before), 240);

		const afterPlayers = [
			...beforePlayers.filter((p) => p.pid !== 102),
			{ pid: 999, rosterOrder: 8, endurance: 0.9 },
		];
		const legalized = legalizeBasketballCustomMinutes({
			players: afterPlayers,
			minutesByPid: before,
			numPlayersOnCourt: 5,
			playoffs: false,
		});

		assert.closeTo(sum(legalized), 240, 8);
		assert.strictEqual(legalized[999], 0);
		assert.strictEqual(legalized[102], undefined);
		assert(legalized[100]! > legalized[108]!);
	});

	test("reordering does not alter an already legal custom plan", () => {
		const players = makePlayers(8);
		const custom = Object.fromEntries(
			players.map((p, i) => [p.pid, [40, 36, 34, 32, 30, 26, 24, 18][i]!]),
		);
		const reordered = players.map((p, i) => ({
			...p,
			rosterOrder: players.length - i - 1,
		}));
		const legalized = legalizeBasketballCustomMinutes({
			players: reordered,
			minutesByPid: custom,
			numPlayersOnCourt: 5,
			playoffs: false,
		});

		assert.deepEqual(legalized, custom);
	});

	test("temporary injury redistribution is game-only and scales custom game length", () => {
		const players = makePlayers(8);
		const saved = Object.fromEntries(
			players.map((p, i) => [p.pid, [40, 36, 34, 32, 30, 26, 24, 18][i]!]),
		);
		const effective = getGameEffectiveBasketballMinutes({
			players: players.map((p) => ({
				...p,
				available: p.pid !== 100,
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 40,
			noInjuryMinutesIncreasePids: [101],
		});

		assert.closeTo(sum(effective), 200, 8);
		assert.strictEqual(effective[100], 0);
		assert.strictEqual(saved[100], 40);
		assert.isAtMost(effective[101]!, 30);
		assert(
			Object.values(effective).every((value) => value >= 0 && value <= 40),
		);
	});

	test("current override context invalidates on injury availability or roster changes", () => {
		const players = makePlayers(8);
		const minutesByPid = Object.fromEntries(
			players.map((p, i) => [p.pid, [40, 33, 37, 32, 30, 26, 24, 18][i]!]),
		);
		const originalAvailable = new Set(
			players.filter((p) => p.pid !== 100).map((p) => p.pid),
		);
		const originalContext = getBasketballMinutesOverrideContext({
			players,
			available: originalAvailable,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const injuredElsewhere = new Set(
			players.filter((p) => p.pid !== 101).map((p) => p.pid),
		);
		const availabilityChanged = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({
				...p,
				available: injuredElsewhere.has(p.pid),
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			currentMinutesOverrideByPid: { 101: 36 },
			currentMinutesOverrideContext: originalContext,
		});
		assert.isUndefined(availabilityChanged.activeCurrentMinutesOverrideByPid);
		assert.isUndefined(availabilityChanged.currentMinutesOverrideError);

		const rosterChanged = [
			...players,
			{ pid: 999, rosterOrder: 8, endurance: 0.7 },
		];
		const rosterChangedResult = getGameEffectiveBasketballMinutesWithStatus({
			players: rosterChanged.map((p) => ({
				...p,
				available: p.pid !== 100,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			currentMinutesOverrideByPid: { 101: 36 },
			currentMinutesOverrideContext: originalContext,
		});
		assert.isUndefined(rosterChangedResult.activeCurrentMinutesOverrideByPid);
		assert.isUndefined(rosterChangedResult.currentMinutesOverrideError);
	});

	test("game availability matches the play-through injury fallback", () => {
		const players = [
			{ injury: { gamesRemaining: 0 } },
			{ injury: { gamesRemaining: 2 } },
			{ injury: { gamesRemaining: 5 } },
		];
		assert.deepEqual(
			getBasketballGameAvailability({
				players,
				playThroughInjuries: 2,
				numPlayersOnCourt: 2,
			}),
			[true, true, false],
		);
		assert.deepEqual(
			getBasketballGameAvailability({
				players,
				playThroughInjuries: 2,
				numPlayersOnCourt: 3,
			}),
			[true, true, true],
		);
	});

	test("current override pins adjusted minutes without changing the healthy baseline", () => {
		const players = makePlayers(8);
		const saved = Object.fromEntries(
			players.map((p, i) => [p.pid, [40, 33, 37, 32, 30, 26, 24, 18][i]!]),
		);
		const available = new Set(
			players.filter((p) => p.pid !== 100).map((p) => p.pid),
		);
		const context = getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const automatic = getGameEffectiveBasketballMinutes({
			players: players.map((p) => ({ ...p, available: available.has(p.pid) })),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		assert.isAbove(automatic[101]!, saved[101]!);

		const overridden = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({ ...p, available: available.has(p.pid) })),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			currentMinutesOverrideByPid: { 101: 36 },
			currentMinutesOverrideContext: context,
		});
		assert.closeTo(overridden.minutesByPid[101]!, 36, 1e-7);
		assert.strictEqual(saved[101], 33);
		assert.closeTo(sum(overridden.minutesByPid), 240, 1e-7);
		assert.deepEqual(overridden.activeCurrentMinutesOverrideByPid, { 101: 36 });

		const cleared = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({ ...p, available: available.has(p.pid) })),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			currentMinutesOverrideContext: context,
		});
		assert.deepEqual(cleared.minutesByPid, automatic);
	});

	test("current overrides support multiple feasible pins and reject impossible totals", () => {
		const players = makePlayers(8);
		const minutesByPid = Object.fromEntries(
			players.map((p, i) => [p.pid, [40, 33, 37, 32, 30, 26, 24, 18][i]!]),
		);
		const available = new Set(
			players.filter((p) => p.pid !== 100).map((p) => p.pid),
		);
		const context = getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const feasible = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({ ...p, available: available.has(p.pid) })),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			currentMinutesOverrideByPid: { 101: 36, 102: 34 },
			currentMinutesOverrideContext: context,
		});
		assert.closeTo(feasible.minutesByPid[101]!, 36, 1e-7);
		assert.closeTo(feasible.minutesByPid[102]!, 34, 1e-7);
		assert.closeTo(sum(feasible.minutesByPid), 240, 1e-7);

		const impossibleOverrides = Object.fromEntries(
			[...available].map((pid) => [pid, 0]),
		);
		const impossible = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({ ...p, available: available.has(p.pid) })),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			currentMinutesOverrideByPid: impossibleOverrides,
			currentMinutesOverrideContext: context,
		});
		assert.match(impossible.currentMinutesOverrideError!, /remaining minutes/);
		assert.isUndefined(impossible.activeCurrentMinutesOverrideByPid);
	});

	test("save validation keeps integer checks separate from game readiness", () => {
		const players = makePlayers(8);
		assert.match(
			validateBasketballMinutes({
				players,
				minutesByPid: { 100: 48 },
				numPlayersOnCourt: 5,
			})!,
			/every player/,
		);
		const nonTotal = Object.fromEntries(
			players.map((p, index) => [p.pid, index === 0 ? 9 : 10]),
		);
		assert.strictEqual(
			validateBasketballMinutes({
				players,
				minutesByPid: nonTotal,
				numPlayersOnCourt: 5,
			}),
			undefined,
		);
		assert.match(
			validateBasketballMinutesForGame({
				players,
				minutesByPid: nonTotal,
				numPlayersOnCourt: 5,
			})!,
			/total 240/,
		);
	});

	test("Custom preview stays raw and preserves a temporary 239/240 total", () => {
		const players = makePlayers(8);
		const raw = Object.fromEntries(
			players.map((p, index) => [
				p.pid,
				[39, 36, 34, 32, 30, 26, 24, 18][index]!,
			]),
		);
		const rotation = getBasketballRotationMinutes({
			rotation: {
				version: 1,
				mode: "custom",
				minutesByPid: raw,
				numPlayersOnCourtAtSave: 5,
			},
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});

		assert.deepEqual(rotation.minutesByPid, raw);
		assert.isTrue(rotation.previewReady);
		assert.isFalse(rotation.gameReady);

		const effective = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({
				...p,
				available: p.pid !== 100,
			})),
			minutesByPid: raw,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			targetTotalMinutes: sum(raw),
		});
		assert.closeTo(sum(effective.minutesByPid), 239, 1e-7);
	});

	test("Custom preview preserves 241/240, while 240 is game-ready", () => {
		const players = makePlayers(8);
		const raw241 = Object.fromEntries(
			players.map((p, index) => [
				p.pid,
				[41, 36, 34, 32, 30, 26, 24, 18][index]!,
			]),
		);
		const rotation241 = getBasketballRotationMinutes({
			rotation: {
				version: 1,
				mode: "custom",
				minutesByPid: raw241,
				numPlayersOnCourtAtSave: 5,
			},
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.deepEqual(rotation241.minutesByPid, raw241);
		assert.isTrue(rotation241.previewReady);
		assert.isFalse(rotation241.gameReady);

		const effective241 = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({
				...p,
				available: p.pid !== 100,
			})),
			minutesByPid: raw241,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			targetTotalMinutes: sum(raw241),
		});
		assert.closeTo(sum(effective241.minutesByPid), 241, 1e-7);

		const ready = getBasketballRotationMinutes({
			rotation: {
				version: 1,
				mode: "custom",
				minutesByPid: Object.fromEntries(
					players.map((p, index) => [
						p.pid,
						[40, 36, 34, 32, 30, 26, 24, 18][index]!,
					]),
				),
				numPlayersOnCourtAtSave: 5,
			},
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.isTrue(ready.previewReady);
		assert.isTrue(ready.gameReady);
		assert.strictEqual(sum(ready.minutesByPid), 240);
	});

	test("invalid Custom values do not fabricate a preview or legalize an override", () => {
		const players = makePlayers(8);
		const invalid = Object.fromEntries(
			players.map((p, index) => [
				p.pid,
				index === 0 ? Number.NaN : [36, 34, 32, 30, 26, 24, 18][index - 1]!,
			]),
		);
		const rotation = getBasketballRotationMinutes({
			rotation: {
				version: 1,
				mode: "custom",
				minutesByPid: invalid,
				numPlayersOnCourtAtSave: 5,
			},
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.isFalse(rotation.previewReady);
		assert.isFalse(rotation.gameReady);

		const available = new Set(players.slice(1).map((p) => p.pid));
		const context = getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const overridden = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({ ...p, available: available.has(p.pid) })),
			minutesByPid: invalid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			targetTotalMinutes: 241,
			currentMinutesOverrideByPid: { 101: 36 },
			currentMinutesOverrideContext: context,
		});
		assert.closeTo(sum(overridden.minutesByPid), 241, 1e-7);
		assert.deepEqual(overridden.activeCurrentMinutesOverrideByPid, { 101: 36 });
		assert.isFalse(rotation.gameReady);
	});

	test("legacy reserve priority is ignored by rotation sanitization", () => {
		const players = makePlayers(8);
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [
				p.pid,
				[48, 44, 40, 38, 36, 34, 0, 0][index]!,
			]),
		);
		const clean = sanitizeBasketballRotation({
			version: 1,
			mode: "custom",
			minutesByPid,
			numPlayersOnCourtAtSave: 5,
		});
		const legacy = sanitizeBasketballRotation({
			version: 1,
			mode: "custom",
			minutesByPid,
			numPlayersOnCourtAtSave: 5,
			reservePriorityPids: [107, 106],
		} as unknown);
		assert.deepEqual(legacy, clean);
		assert.isUndefined(
			(legacy as unknown as Record<string, unknown>).reservePriorityPids,
		);
	});

	test("OVR-sensitive Auto supports the full 3x3 profile without changing totals", () => {
		const players = makePlayers(13).map((p, index) => ({
			...p,
			ovr: 82 - index * 3,
		}));
		const plans = [
			["short", "high"],
			["normal", "balanced"],
			["long", "low"],
		] as const;
		const results = plans.map(([rotationDepth, coreReliance]) =>
			generateBasketballAutoMinutes({
				players,
				numPlayersOnCourt: 5,
				playoffs: false,
				rotationDepth,
				coreReliance,
			}),
		);
		for (const result of results) {
			assert.strictEqual(sum(result), 240);
			assert(Object.values(result).every((value) => Number.isInteger(value)));
		}
		assert(
			Object.values(results[0]!).filter((value) => value > 0).length <=
				Object.values(results[1]!).filter((value) => value > 0).length,
		);
		assert(
			Object.values(results[1]!).filter((value) => value > 0).length <=
				Object.values(results[2]!).filter((value) => value > 0).length,
		);
		const fullGrid = ["short", "normal", "long"].flatMap((rotationDepth) =>
			["high", "balanced", "low"].map((coreReliance) =>
				generateBasketballAutoMinutes({
					players,
					numPlayersOnCourt: 5,
					playoffs: false,
					rotationDepth: rotationDepth as "short" | "normal" | "long",
					coreReliance: coreReliance as "high" | "balanced" | "low",
				}),
			),
		);
		assert.strictEqual(fullGrid.length, 9);
		assert.isAbove(sum(fullGrid[0]!), 0);
		assert.isAbove(
			Object.values(fullGrid[0]!)
				.slice(0, 5)
				.reduce((a, b) => a + b, 0),
			Object.values(fullGrid[2]!)
				.slice(0, 5)
				.reduce((a, b) => a + b, 0),
		);
		const playoffs = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 5,
			playoffs: true,
			rotationDepth: "normal",
			coreReliance: "balanced",
		});
		assert.isAtMost(
			Object.values(playoffs).filter((value) => value > 0).length,
			Object.values(results[1]!).filter((value) => value > 0).length,
		);
		assert.isAtLeast(
			Object.values(playoffs)
				.slice(0, 5)
				.reduce((a, b) => a + b, 0),
			Object.values(results[1]!)
				.slice(0, 5)
				.reduce((a, b) => a + b, 0),
		);
		const perturbed = generateBasketballAutoMinutes({
			players: players.map((p) =>
				p.pid === 111 ? { ...p, ovr: p.ovr! + 0.5 } : p,
			),
			numPlayersOnCourt: 5,
			playoffs: false,
			rotationDepth: "normal",
			coreReliance: "balanced",
		});
		assert(
			Math.max(
				...players.map((p) =>
					Math.abs(perturbed[p.pid]! - results[1]![p.pid]!),
				),
			) <= 2,
		);
	});

	test("Auto honors a supplied league-relative OVR percentile over team rank", () => {
		const players = makePlayers(13).map((p) => ({ ...p, ovr: 70 }));
		const weakContext = players.map((p) => ({
			...p,
			ovrPercentile: p.pid === 111 ? 0.02 : 0.5,
		}));
		const strongContext = players.map((p) => ({
			...p,
			ovrPercentile: p.pid === 111 ? 0.98 : 0.5,
		}));
		const weak = generateBasketballAutoMinutes({
			players: weakContext,
			numPlayersOnCourt: 5,
			playoffs: false,
			rotationDepth: "long",
			coreReliance: "low",
		});
		const strong = generateBasketballAutoMinutes({
			players: strongContext,
			numPlayersOnCourt: 5,
			playoffs: false,
			rotationDepth: "long",
			coreReliance: "low",
		});
		assert.isAbove(strong[111]!, weak[111]!);
		assert.strictEqual(sum(weak), 240);
		assert.strictEqual(sum(strong), 240);
	});

	test("injury redistribution uses automatic reserve signals and profile share", () => {
		const players = makePlayers(8).map((p, index) => ({
			...p,
			position: index === 0 || index === 7 ? "G" : index === 6 ? "C" : "F",
			value: 1,
		}));
		const saved = Object.fromEntries(
			players.map((p, index) => [
				p.pid,
				[48, 44, 40, 38, 36, 34, 0, 0][index]!,
			]),
		);
		const makeEffective = (coreReliance: "high" | "low") =>
			getGameEffectiveBasketballMinutesWithStatus({
				players: players.map((p) => ({
					...p,
					available: p.pid !== 100,
					value: p.pid === 106 ? 1 : 1,
				})),
				minutesByPid: saved,
				numPlayersOnCourt: 5,
				regulationMinutes: 48,
				coreReliance,
				rotationDepth: "normal",
			});
		const high = makeEffective("high");
		const low = makeEffective("low");
		assert.isAbove(high.minutesByPid[107]!, high.minutesByPid[106]!);
		assert.isAbove(low.minutesByPid[107]!, high.minutesByPid[107]!);
		assert.strictEqual(high.minutesByPid[100], 0);
		assert.closeTo(sum(high.minutesByPid), 240, 1e-7);
		const qualityPlayers = players.map((p, index) => ({
			...p,
			ovr: p.pid === 106 ? 45 : p.pid === 107 ? 82 : 70 - index,
		}));
		const qualityEffective = getGameEffectiveBasketballMinutesWithStatus({
			players: qualityPlayers.map((p) => ({
				...p,
				available: p.pid !== 100,
				value: 1,
			})),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			coreReliance: "low",
		});
		assert.isAbove(
			qualityEffective.minutesByPid[107]!,
			qualityEffective.minutesByPid[106]!,
		);

		const roleFit = makeEffective("low");
		assert.isAbove(roleFit.minutesByPid[107]!, roleFit.minutesByPid[106]!);

		const absoluteRolePlayers = players.map((p) =>
			p.pid === 106
				? {
						...p,
						position: "G",
						roleScores: { handler: 0.05, wing: 0.05 },
					}
				: p.pid === 107
					? {
							...p,
							position: "GF",
							roleScores: { handler: 0.9, wing: 0.9 },
						}
					: p,
		);
		const absoluteRole = getGameEffectiveBasketballMinutesWithStatus({
			players: absoluteRolePlayers.map((p) => ({
				...p,
				available: p.pid !== 100,
				value: 1,
			})),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			coreReliance: "low",
		});
		assert.isAbove(
			absoluteRole.minutesByPid[107]!,
			absoluteRole.minutesByPid[106]!,
		);
		assert.strictEqual(saved[106], 0);
		assert.strictEqual(saved[107], 0);
	});

	test("an all-zero Custom draft is not silently rebuilt from Auto", () => {
		const players = makePlayers(8);
		const legalized = legalizeBasketballCustomMinutes({
			players: players.map((p) => ({ ...p, rosterOrder: p.rosterOrder + 1 })),
			minutesByPid: Object.fromEntries(players.map((p) => [p.pid, 0])),
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.deepEqual(
			legalized,
			Object.fromEntries(players.map((p) => [p.pid, 0])),
		);
	});

	test("injury protection caps healthy players and reports impossible hard-lock conflicts", () => {
		const players = makePlayers(8);
		const saved = Object.fromEntries(
			players.map((p, i) => [p.pid, [40, 36, 34, 32, 30, 26, 24, 18][i]!]),
		);
		const effective = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({
				...p,
				available: p.pid !== 100,
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			noInjuryMinutesIncreasePids: [101],
		});

		assert.strictEqual(effective.minutesByPid[100], 0);
		assert.isAtMost(effective.minutesByPid[101]!, saved[101]!);
		assert.closeTo(sum(effective.minutesByPid), 240, 1e-7);
		assert.deepEqual(effective.protectionOverridePids, []);

		const protectedUnavailable = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({
				...p,
				available: p.pid !== 101,
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid: saved,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			noInjuryMinutesIncreasePids: [101],
		});
		assert.strictEqual(protectedUnavailable.minutesByPid[101], 0);
		assert.closeTo(sum(protectedUnavailable.minutesByPid), 240, 1e-7);

		const conflict = getGameEffectiveBasketballMinutesWithStatus({
			players: players.slice(0, 6).map((p, index) => ({
				...p,
				available: index !== 0,
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid: {
				100: 48,
				101: 48,
				102: 48,
				103: 48,
				104: 24,
				105: 24,
			},
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			noInjuryMinutesIncreasePids: [101, 102, 103, 104, 105],
		});
		assert.match(
			conflict.allocationError!,
			/without exceeding Prevent injury increase limits/,
		);
		assert.deepEqual(
			[101, 102, 103, 104, 105].map((pid) => conflict.minutesByPid[pid]),
			[48, 48, 48, 24, 24],
		);
	});

	test("a single reserve's absolute temporary role is quality-sensitive", () => {
		const players = makePlayers(7).map((p, index) => ({
			...p,
			ovr: index === 6 ? 20 : 70,
		}));
		const saved = Object.fromEntries(
			players.map((p, index) => [p.pid, [48, 44, 40, 38, 36, 34, 0][index]!]),
		);
		const makeEffective = (reserveOvr: number) =>
			getGameEffectiveBasketballMinutesWithStatus({
				players: players.map((p) => ({
					...p,
					ovr: p.pid === 106 ? reserveOvr : p.ovr,
					available: p.pid !== 100,
					value: 1,
				})),
				minutesByPid: saved,
				numPlayersOnCourt: 5,
				regulationMinutes: 48,
				coreReliance: "low",
			});
		const weak = makeEffective(20);
		const strong = makeEffective(82);

		assert.isAtMost(weak.minutesByPid[106]!, 10);
		assert.isAbove(strong.minutesByPid[106]!, weak.minutesByPid[106]! + 15);
		assert.strictEqual(weak.minutesByPid[100], 0);
		assert.strictEqual(strong.minutesByPid[100], 0);
		assert.closeTo(sum(weak.minutesByPid), 240, 1e-7);
		assert.closeTo(sum(strong.minutesByPid), 240, 1e-7);
	});

	test("preview and GameSim share the same allowed rotation input policy", () => {
		const rawRatings = {
			ovr: 80,
			endu: 70,
			fuzz: -10,
			drb: 75,
			pss: 72,
			oiq: 68,
			hgt: 78,
			reb: 74,
			diq: 70,
			stre: 66,
			spd: 80,
			jmp: 77,
			tp: 60,
			pos: "G",
		};
		const loadInput = getBasketballRotationPlayerInput({
			pid: 1,
			rosterOrder: 0,
			ratings: rawRatings,
			useFuzzedRatings: true,
			ovrPercentile: 0.7,
		});
		const previewRatings = Object.fromEntries(
			Object.entries(rawRatings).map(([key, value]) => [
				key,
				typeof value === "number" && !["hgt", "fuzz"].includes(key)
					? fuzzRating(value, rawRatings.fuzz)
					: value,
			]),
		);
		const previewInput = getBasketballRotationPlayerInput({
			pid: 1,
			rosterOrder: 0,
			ratings: previewRatings,
			useFuzzedRatings: false,
			ovrPercentile: 0.7,
		});
		assert.deepEqual(previewInput, loadInput);

		const noRatings = getBasketballRotationPlayerInput({
			pid: 1,
			rosterOrder: 0,
			ratings: rawRatings,
			challengeNoRatings: true,
			ovrPercentile: 0.7,
		});
		assert.strictEqual(noRatings.endurance, 0.5);
		assert.strictEqual(noRatings.ovr, undefined);
		assert.strictEqual(noRatings.ovrPercentile, undefined);
		assert.strictEqual(noRatings.roleScores, undefined);
	});

	test("roster Auto overlay preserves baseline and shares an outgoing vacancy", () => {
		const players = [
			...makePlayers(7).slice(1),
			{ pid: 999, rosterOrder: 7, endurance: 0.7 },
		];
		const saved = Object.fromEntries(
			makePlayers(7).map((p, index) => [
				p.pid,
				[40, 36, 34, 32, 30, 26, 42][index]!,
			]),
		);
		const result = fillBasketballRosterVacancy({
			players,
			minutesByPid: saved,
			ownedPids: players.slice(0, 6).map((p) => p.pid),
			numPlayersOnCourt: 5,
			playoffs: false,
		});

		assert.deepEqual(
			players.slice(0, 6).map((p) => result.baselineMinutesByPid[p.pid]),
			[36, 34, 32, 30, 26, 42],
		);
		assert.strictEqual(result.baselineMinutesByPid[999], 0);
		assert.deepEqual(result.autoFilledPids, [999]);
		assert.isAbove(result.minutesByPid[999]!, 0);
		assert.isBelow(result.minutesByPid[999]!, 40);
		assert.isTrue(
			players
				.slice(0, 6)
				.some(
					(p) =>
						result.minutesByPid[p.pid]! > result.baselineMinutesByPid[p.pid]!,
				),
		);
		assert.strictEqual(sum(result.baselineMinutesByPid), 200);
		assert.strictEqual(sum(result.minutesByPid), 240);
		assert.isTrue(result.rosterAutoFillActive);

		const inactive = getBasketballRosterMinutesPlan({
			players,
			minutesByPid: result.baselineMinutesByPid,
			rosterAutoFillActive: false,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.strictEqual(sum(inactive.minutesByPid), 200);
	});

	test("zero-minute healthy players enter before protected caps are breached", () => {
		const players = makePlayers(8);
		const effective = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({
				...p,
				available: p.pid !== 100,
				value: p.pid === 106 ? 1000 : 1,
			})),
			minutesByPid: {
				100: 48,
				101: 34,
				102: 34,
				103: 34,
				104: 34,
				105: 28,
				106: 0,
				107: 28,
			},
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			noInjuryMinutesIncreasePids: [101, 102, 103, 104],
		});

		assert.isAbove(effective.minutesByPid[106]!, 0);
		for (const pid of [101, 102, 103, 104]) {
			assert.isAtMost(effective.minutesByPid[pid]!, 34);
		}
		assert.deepEqual(effective.protectionOverridePids, []);
	});

	test("temporarily underfilled rosters remain safe to display", () => {
		const players = makePlayers(4);
		const auto = generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.deepEqual(Object.values(auto), [48, 48, 48, 48]);

		const custom = legalizeBasketballCustomMinutes({
			players,
			minutesByPid: { 100: 40, 101: 35, 102: 30, 103: 25, 999: 48 },
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.deepEqual(custom, { 100: 40, 101: 35, 102: 30, 103: 25 });

		const decimalCustom = legalizeBasketballCustomMinutes({
			players,
			minutesByPid: { 100: 40.4, 101: 35.6, 102: 30.2, 103: 25.8 },
			numPlayersOnCourt: 5,
			playoffs: false,
		});
		assert.deepEqual(decimalCustom, { 100: 40, 101: 36, 102: 30, 103: 26 });
	});
	test("injury promotion follows healthy minute slots instead of unbounded proportional fill", () => {
		const players = makePlayers(15);
		const values = [34, 32, 32, 30, 28, 19, 19, 16, 11, 9, 7, 3, 0, 0, 0];
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, values[index]!] as const),
		);
		const unavailable = new Set([101, 105, 106]);
		const effective = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({
				...p,
				available: !unavailable.has(p.pid),
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			rotationDepth: "long",
			coreReliance: "low",
			noInjuryMinutesIncreasePids: [100, 102, 113],
		});
		assert.isAbove(effective.minutesByPid[104]!, 28);
		assert.isAtMost(effective.minutesByPid[104]!, 33);
		assert.isAtMost(effective.minutesByPid[103]!, 35);
		assert.strictEqual(effective.minutesByPid[100], 34);
		assert.strictEqual(effective.minutesByPid[102], 32);
		assert.strictEqual(effective.minutesByPid[113], 0);
		assert.closeTo(sum(effective.minutesByPid), 240, 1e-7);
		assert.deepEqual(effective.protectionOverridePids, []);
	});

	test("a first-option injury promotion is bounded even when the first four slots are unavailable", () => {
		const players = makePlayers(15);
		const values = [34, 32, 32, 30, 28, 19, 19, 16, 11, 9, 7, 3, 0, 0, 0];
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, values[index]!] as const),
		);
		const effective = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p, index) => ({
				...p,
				available: index >= 4,
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			rotationDepth: "long",
			coreReliance: "low",
		});
		assert.isAbove(effective.minutesByPid[104]!, 28);
		assert.isAtMost(effective.minutesByPid[104]!, 36);
		assert.closeTo(sum(effective.minutesByPid), 240, 1e-7);
	});

	test("Current Override changes only the current delta and keeps injury protection active", () => {
		const players = makePlayers(15);
		const values = [34, 32, 32, 30, 28, 19, 19, 16, 11, 9, 7, 3, 0, 0, 0];
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, values[index]!] as const),
		);
		const unavailable = new Set([101, 105, 106]);
		const available = new Set(
			players.filter((p) => !unavailable.has(p.pid)).map((p) => p.pid),
		);
		const context = getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const common = {
			players: players.map((p) => ({
				...p,
				available: available.has(p.pid),
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			rotationDepth: "long" as const,
			coreReliance: "low" as const,
			noInjuryMinutesIncreasePids: [100, 102, 113],
		};
		const automatic = getGameEffectiveBasketballMinutesWithStatus(common);
		const overridden = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			currentMinutesOverrideByPid: { 103: 34 },
			currentMinutesOverrideContext: context,
		});
		assert.strictEqual(overridden.minutesByPid[103], 34);
		assert.isAtMost(overridden.minutesByPid[100]!, 34);
		assert.isAtMost(overridden.minutesByPid[102]!, 32);
		assert.isAtMost(overridden.minutesByPid[113]!, 0);
		assert.closeTo(sum(overridden.minutesByPid), 240, 1e-7);
		assert.deepEqual(overridden.protectionOverridePids, []);
		const redistributedDelta = players
			.filter((p) => p.pid !== 103)
			.reduce(
				(total, p) =>
					total +
					(overridden.minutesByPid[p.pid]! - automatic.minutesByPid[p.pid]!),
				0,
			);
		assert.closeTo(redistributedDelta, automatic.minutesByPid[103]! - 34, 1e-7);
	});

	test("Current Override preserves active Short depth until an explicit reserve promotion is required", () => {
		const players = makePlayers(14);
		const values = [38, 35, 33, 30, 27, 24, 20, 18, 15, 0, 0, 0, 0, 0];
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, values[index]!] as const),
		);
		const available = new Set(
			players.filter((_, index) => index !== 0).map((p) => p.pid),
		);
		const context = getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const common = {
			players: players.map((p, index) => ({
				...p,
				available: index !== 0,
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			coreReliance: "high" as const,
			rotationDepth: "short" as const,
		};
		const deepPids = [109, 110, 111, 112, 113];
		const deepUsed = (
			result: ReturnType<typeof getGameEffectiveBasketballMinutesWithStatus>,
		) => deepPids.filter((pid) => result.minutesByPid[pid]! > 1e-7).length;
		const automatic = getGameEffectiveBasketballMinutesWithStatus(common);
		assert.strictEqual(deepUsed(automatic), 2);

		const downward = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			currentMinutesOverrideByPid: { 101: 10 },
			currentMinutesOverrideContext: context,
		});
		assert.strictEqual(deepUsed(downward), 2);
		for (const pid of deepPids.slice(2)) {
			assert.strictEqual(downward.minutesByPid[pid], 0);
		}

		const stillFits = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			currentMinutesOverrideByPid: { 101: 0, 102: 0 },
			currentMinutesOverrideContext: context,
		});
		assert.strictEqual(deepUsed(stillFits), 2);
		for (const pid of deepPids.slice(2)) {
			assert.strictEqual(stillFits.minutesByPid[pid], 0);
		}

		const expanded = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			currentMinutesOverrideByPid: { 101: 0, 102: 0, 103: 30 },
			currentMinutesOverrideContext: context,
		});
		assert.strictEqual(deepUsed(expanded), 3);
		assert.isAbove(expanded.minutesByPid[111]!, 0);
		assert.strictEqual(expanded.minutesByPid[112], 0);
		assert.strictEqual(expanded.minutesByPid[113], 0);
		assert.closeTo(sum(expanded.minutesByPid), 240, 1e-7);

		const lowLong = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			coreReliance: "low",
			rotationDepth: "long",
		});
		assert.strictEqual(deepUsed(lowLong), 5);
	});

	test("protected capacity is used only after every unprotected emergency minute is exhausted", () => {
		const players = makePlayers(7);
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, [48, 48, 48, 48, 24, 24, 0][index]!]),
		);
		const effective = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p, index) => ({
				...p,
				available: index !== 0,
				value: 1000 - p.rosterOrder,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			noInjuryMinutesIncreasePids: [101, 102, 103, 104],
			rotationDepth: "long",
			coreReliance: "low",
		});
		assert.isAbove(effective.minutesByPid[105]!, 24);
		assert.isAbove(effective.minutesByPid[106]!, 0);
		assert.deepEqual(effective.protectionOverridePids, []);
		assert.closeTo(sum(effective.minutesByPid), 240, 1e-7);
	});

	test("a protected player's own Current Override cannot silently supersede its lock", () => {
		const players = makePlayers(8);
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [
				p.pid,
				[40, 33, 37, 32, 30, 26, 24, 18][index]!,
			]),
		);
		const available = new Set(players.map((p) => p.pid));
		const context = getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const result = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({ ...p, available: true })),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			noInjuryMinutesIncreasePids: [101],
			currentMinutesOverrideByPid: { 101: 36 },
			currentMinutesOverrideContext: context,
		});
		assert.match(
			result.currentMinutesOverrideError!,
			/Disable Prevent injury increase/,
		);
		assert.strictEqual(result.minutesByPid[101], 33);
		assert.isUndefined(result.activeCurrentMinutesOverrideByPid);
	});

	test("injury allocation preserves strict zeroes and profile shape across adversarial roster sizes", () => {
		const players = makePlayers(14);
		const values = [38, 35, 33, 30, 27, 24, 20, 18, 15, 0, 0, 0, 0, 0];
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, values[index]!] as const),
		);
		const deepPids = [109, 110, 111, 112, 113];
		const profiles = [
			["high", "short"],
			["high", "normal"],
			["high", "long"],
			["balanced", "short"],
			["balanced", "normal"],
			["balanced", "long"],
			["low", "short"],
			["low", "normal"],
			["low", "long"],
		] as const;
		const results = new Map<string, Record<number, number>>();

		for (const [coreReliance, rotationDepth] of profiles) {
			const result = getGameEffectiveBasketballMinutesWithStatus({
				players: players.map((p, index) => ({
					...p,
					available: index !== 0,
					value: 1000 - index,
				})),
				minutesByPid,
				numPlayersOnCourt: 5,
				regulationMinutes: 48,
				coreReliance,
				rotationDepth,
			});
			results.set(`${coreReliance}/${rotationDepth}`, result.minutesByPid);
			assert.closeTo(sum(result.minutesByPid), 240, 1e-7);
			for (const [index, p] of players.entries()) {
				assert.isAtLeast(result.minutesByPid[p.pid]!, 0);
				assert.isAtMost(result.minutesByPid[p.pid]!, 48);
				if (index === 0) {
					assert.strictEqual(result.minutesByPid[p.pid], 0);
				}
			}
			const expectedDeep = { short: 2, normal: 3, long: 5 }[rotationDepth];
			const activeDeep = deepPids.filter(
				(pid) => result.minutesByPid[pid]! > 1e-7,
			);
			assert.strictEqual(activeDeep.length, expectedDeep);
			for (const pid of deepPids.slice(expectedDeep)) {
				assert.strictEqual(result.minutesByPid[pid], 0);
			}
		}

		const coreMinutes = (coreReliance: "high" | "balanced" | "low") =>
			[101, 102, 103, 104].reduce(
				(total, pid) => total + results.get(`${coreReliance}/normal`)![pid]!,
				0,
			);
		assert.isAbove(coreMinutes("high"), coreMinutes("balanced"));
		assert.isAbove(coreMinutes("balanced"), coreMinutes("low"));

		const healthy = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p) => ({ ...p, available: true })),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		assert.deepEqual(healthy.minutesByPid, minutesByPid);
		assert.deepEqual(healthy.protectionOverridePids, []);

		for (const availableCount of [7, 6, 5]) {
			const available = new Set(
				players.slice(-availableCount).map((p) => p.pid),
			);
			const emergency = getGameEffectiveBasketballMinutesWithStatus({
				players: players.map((p) => ({
					...p,
					available: available.has(p.pid),
				})),
				minutesByPid,
				numPlayersOnCourt: 5,
				regulationMinutes: 48,
				coreReliance: "balanced",
				rotationDepth: "normal",
			});
			assert.closeTo(sum(emergency.minutesByPid), 240, 1e-7);
			for (const p of players) {
				assert.isAtMost(emergency.minutesByPid[p.pid]!, 48);
				if (!available.has(p.pid)) {
					assert.strictEqual(emergency.minutesByPid[p.pid], 0);
				}
			}
		}
	});

	test("protected emergency capacity is a hard conflict, regardless of protected order", () => {
		const players = makePlayers(7);
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, [48, 40, 24, 24, 24, 30, 16][index]!]),
		);
		const conflict = getGameEffectiveBasketballMinutesWithStatus({
			players: players.map((p, index) => ({
				...p,
				available: index !== 0,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			noInjuryMinutesIncreasePids: [101, 102, 103, 104],
			rotationDepth: "short",
			coreReliance: "high",
		});
		assert.match(
			conflict.allocationError!,
			/without exceeding Prevent injury increase limits/,
		);
		for (const pid of [101, 102, 103, 104]) {
			assert.strictEqual(conflict.minutesByPid[pid], minutesByPid[pid]);
		}
		assert.throws(
			() =>
				getGameEffectiveBasketballMinutes({
					players: players.map((p, index) => ({
						...p,
						available: index !== 0,
					})),
					minutesByPid,
					numPlayersOnCourt: 5,
					regulationMinutes: 48,
					noInjuryMinutesIncreasePids: [101, 102, 103, 104],
					rotationDepth: "short",
					coreReliance: "high",
				}),
			/without exceeding Prevent injury increase limits/,
		);
	});

	test("Current Override combinations preserve pins, strict zeroes, and stale-context fallback", () => {
		const players = makePlayers(14);
		const values = [38, 35, 33, 30, 27, 24, 20, 18, 15, 0, 0, 0, 0, 0];
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid, values[index]!] as const),
		);
		const available = new Set(
			players.filter((_, index) => index !== 0).map((p) => p.pid),
		);
		const context = getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		});
		const common = {
			players: players.map((p, index) => ({
				...p,
				available: index !== 0,
				value: 1000 - index,
			})),
			minutesByPid,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
			rotationDepth: "short" as const,
			coreReliance: "high" as const,
			noInjuryMinutesIncreasePids: [100, 102],
		};
		const tiny = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			currentMinutesOverrideByPid: { 111: 0.001 },
			currentMinutesOverrideContext: context,
		});
		assert.strictEqual(tiny.minutesByPid[111], 0.001);
		assert.deepEqual(tiny.activeCurrentMinutesOverrideByPid, { 111: 0.001 });
		assert.closeTo(sum(tiny.minutesByPid), 240, 1e-7);
		assert.strictEqual(tiny.minutesByPid[112], 0);
		assert.strictEqual(tiny.minutesByPid[113], 0);

		const mixed = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			currentMinutesOverrideByPid: { 101: 48, 103: 0, 111: 0 },
			currentMinutesOverrideContext: context,
		});
		assert.strictEqual(mixed.minutesByPid[101], 48);
		assert.strictEqual(mixed.minutesByPid[103], 0);
		assert.strictEqual(mixed.minutesByPid[111], 0);
		assert.closeTo(sum(mixed.minutesByPid), 240, 1e-7);
		assert.strictEqual(mixed.minutesByPid[112], 0);
		assert.strictEqual(mixed.minutesByPid[113], 0);

		const stale = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			players: common.players.map((p) => ({
				...p,
				available: p.pid !== 100 && p.pid !== 101,
			})),
			currentMinutesOverrideByPid: { 101: 48 },
			currentMinutesOverrideContext: context,
		});
		assert.isUndefined(stale.activeCurrentMinutesOverrideByPid);
		assert.isUndefined(stale.currentMinutesOverrideError);
		assert.strictEqual(stale.minutesByPid[100], 0);
		assert.strictEqual(stale.minutesByPid[101], 0);

		const protectedAbovePlan = getGameEffectiveBasketballMinutesWithStatus({
			...common,
			currentMinutesOverrideByPid: { 102: 34 },
			currentMinutesOverrideContext: context,
		});
		assert.match(
			protectedAbovePlan.currentMinutesOverrideError!,
			/Disable Prevent injury increase/,
		);
		assert.strictEqual(protectedAbovePlan.minutesByPid[102], 33);
		assert.isUndefined(protectedAbovePlan.activeCurrentMinutesOverrideByPid);
	});

	test.each([24, 36, 48, 60])(
		"injury caps and totals scale with a %i-minute regulation game",
		(regulationMinutes) => {
			const players = makePlayers(14);
			const values = [38, 35, 33, 30, 27, 24, 20, 18, 15, 0, 0, 0, 0, 0];
			const minutesByPid = Object.fromEntries(
				players.map((p, index) => [p.pid, values[index]!] as const),
			);
			const injured = getGameEffectiveBasketballMinutesWithStatus({
				players: players.map((p, index) => ({
					...p,
					available: index !== 0,
				})),
				minutesByPid,
				numPlayersOnCourt: 5,
				regulationMinutes,
				rotationDepth: "normal",
				coreReliance: "balanced",
			});
			assert.closeTo(sum(injured.minutesByPid), regulationMinutes * 5, 1e-7);
			for (const p of players) {
				assert.isAtLeast(injured.minutesByPid[p.pid]!, 0);
				assert.isAtMost(injured.minutesByPid[p.pid]!, regulationMinutes);
				if (p.pid === 100) {
					assert.strictEqual(injured.minutesByPid[p.pid], 0);
				}
			}

			const healthy = getGameEffectiveBasketballMinutesWithStatus({
				players: players.map((p) => ({ ...p, available: true })),
				minutesByPid,
				numPlayersOnCourt: 5,
				regulationMinutes,
			});
			assert.closeTo(sum(healthy.minutesByPid), regulationMinutes * 5, 1e-7);
			assert.closeTo(
				healthy.minutesByPid[101]!,
				values[1]! * (regulationMinutes / 48),
				1e-7,
			);
		},
	);

	test.each(
		([24, 36, 48] as const).flatMap((regulationMinutes) =>
			(["high", "balanced", "low"] as const).flatMap((coreReliance) =>
				(["short", "normal", "long"] as const).map((rotationDepth) => ({
					regulationMinutes,
					coreReliance,
					rotationDepth,
				})),
			),
		),
	)(
		"hard caps survive the $regulationMinutes-minute $coreReliance/$rotationDepth fallback matrix",
		({ regulationMinutes, coreReliance, rotationDepth }) => {
			const players = makePlayers(15);
			const values = [34, 32, 32, 30, 28, 19, 19, 16, 11, 9, 7, 3, 0, 0, 0];
			const minutesByPid = Object.fromEntries(
				players.map((p, index) => [p.pid, values[index]!] as const),
			);
			const protectedPids = [100, 102, 113];
			const unavailable = new Set([101, 105, 106]);
			const result = getGameEffectiveBasketballMinutesWithStatus({
				players: players.map((p, index) => ({
					...p,
					available: !unavailable.has(p.pid),
					value: 1000 - index,
				})),
				minutesByPid,
				numPlayersOnCourt: 5,
				regulationMinutes,
				noInjuryMinutesIncreasePids: protectedPids,
				coreReliance,
				rotationDepth,
			});
			const scale = regulationMinutes / 48;
			for (const pid of protectedPids) {
				assert.isAtMost(
					result.minutesByPid[pid]!,
					minutesByPid[pid]! * scale + 1e-7,
				);
			}
			assert.strictEqual(result.minutesByPid[113], 0);
			assert.closeTo(sum(result.minutesByPid), regulationMinutes * 5, 1e-7);
			assert.deepEqual(result.protectionOverridePids, []);
		},
	);
});
