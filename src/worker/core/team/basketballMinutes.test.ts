import { assert, describe, test } from "vitest";
import {
	generateBasketballAutoMinutes,
	getGameEffectiveBasketballMinutes,
	legalizeBasketballCustomMinutes,
	validateBasketballMinutes,
	type BasketballMinutesPlayer,
} from "./basketballMinutes.ts";

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
		});

		assert.closeTo(sum(effective), 200, 8);
		assert.strictEqual(effective[100], 0);
		assert.strictEqual(saved[100], 40);
		assert(
			Object.values(effective).every((value) => value >= 0 && value <= 40),
		);
	});

	test("invalid partial and non-total plans are rejected by the save validator", () => {
		const players = makePlayers(8);
		assert.match(
			validateBasketballMinutes({
				players,
				minutesByPid: { 100: 48 },
				numPlayersOnCourt: 5,
			})!,
			/every player/,
		);
		assert.match(
			validateBasketballMinutes({
				players,
				minutesByPid: Object.fromEntries(players.map((p) => [p.pid, 10])),
				numPlayersOnCourt: 5,
			})!,
			/total 240/,
		);
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
});
