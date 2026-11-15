import { describe, expect, test } from "vitest";
import {
	buildEstimatedPositionMinutes,
	ROTATION_POSITIONS,
	type EstimatedPositionMinutes,
} from "./rotationPositions.ts";

type Input = Parameters<typeof buildEstimatedPositionMinutes>[0];
type Valid = Extract<EstimatedPositionMinutes, { valid: true }>;
const input = (
	positions: string[],
	minutes: number[],
	gameMinutes = 48,
): Input => ({
	players: positions.map((pos, pid) => ({ pid: 100 + pid, pos })),
	minutesByPid: Object.fromEntries(minutes.map((value, i) => [100 + i, value])),
	gameMinutes,
	numPlayersOnCourt: 5,
});
const valid = (plan: Input): Valid => {
	const result = buildEstimatedPositionMinutes(plan);
	if (!result.valid) {
		throw new Error(result.message);
	}
	return result;
};
const conserved = (plan: Input, result = valid(plan)) => {
	const G = Math.round(plan.gameMinutes * 60);
	for (const row of result.rows) {
		expect(plan.players.some((p) => p.pid === row.pid)).toBe(true);
		expect(
			Math.abs(row.plannedSeconds - plan.minutesByPid[row.pid]! * 60),
		).toBeLessThanOrEqual(1 + 1e-7);
		expect(Object.values(row.seconds).reduce((a, b) => a + b, 0)).toBe(
			row.plannedSeconds,
		);
		for (const seconds of Object.values(row.seconds)) {
			expect(Number.isInteger(seconds)).toBe(true);
			expect(seconds).toBeGreaterThanOrEqual(0);
		}
	}
	for (const position of ROTATION_POSITIONS) {
		const total = result.rows.reduce(
			(sum, row) => sum + row.seconds[position],
			0,
		);
		expect(total).toBe(G);
		expect(result.totals[position]).toBe(total);
	}
	expect(result.rows.reduce((sum, row) => sum + row.plannedSeconds, 0)).toBe(
		5 * G,
	);
	for (const player of plan.players) {
		if (plan.minutesByPid[player.pid] === 0) {
			expect(result.rows.some((r) => r.pid === player.pid)).toBe(false);
		}
	}
};
const reassigned = (a: Valid, b: Valid) =>
	a.rows.reduce((sum, row) => {
		const other = b.rows.find((r) => r.pid === row.pid);
		return (
			sum +
			ROTATION_POSITIONS.reduce(
				(s, p) => s + Math.abs(row.seconds[p] - (other?.seconds[p] ?? 0)),
				0,
			)
		);
	}, 0) / 120;

const nyk: Input = {
	players: [
		{ pid: 1956, pos: "C" },
		{ pid: 1582, pos: "G" },
		{ pid: 1529, pos: "GF" },
		{ pid: 1659, pos: "PF" },
		{ pid: 1761, pos: "F" },
		{ pid: 1317, pos: "G" },
		{ pid: 2077, pos: "C" },
		{ pid: 1581, pos: "PF" },
		{ pid: 903, pos: "PG" },
		{ pid: 844, pos: "SF" },
	],
	minutesByPid: {
		1956: 34,
		1582: 34,
		1529: 32,
		1659: 30,
		1761: 30,
		1317: 28,
		2077: 20,
		1581: 18,
		903: 14,
		844: 0,
	},
	gameMinutes: 48,
	numPlayersOnCourt: 5,
};

describe("estimated position minutes", () => {
	test("five primary-position starters each cover their natural 48 minutes", () => {
		const plan = input(["PG", "SG", "SF", "PF", "C"], [48, 48, 48, 48, 48]);
		const result = valid(plan);
		conserved(plan, result);
		for (const [i, position] of ROTATION_POSITIONS.entries()) {
			expect(result.rows[i]!.seconds[position]).toBe(48 * 60);
		}
		expect(result.outsideSeconds).toBe(0);
	});

	test("roster context fills roles rather than dividing mixed labels equally", () => {
		const plan = input(
			["PG", "G", "G", "SF", "FC", "PF", "C"],
			[48, 24, 24, 48, 24, 24, 48],
		);
		const result = valid(plan);
		conserved(plan, result);
		// The PG and C demands are already covered. Flexible G/FC supplies must
		// therefore go to SG/PF in full, not half to each eligibility bucket.
		for (const i of [1, 2]) {
			expect(result.rows[i]!.seconds.SG).toBe(24 * 60);
		}
		expect(result.rows[4]!.seconds.PF).toBe(24 * 60);
		expect(result.outsideSeconds).toBe(0);
	});

	test("same-position responsibilities are proportional instead of favoring arbitrary player IDs", () => {
		const plan = input(
			["PG", "SG", "SF", "C", "C", "C"],
			[48, 48, 48, 37, 36, 23],
		);
		const a = valid(plan);
		conserved(plan, a);
		for (const row of a.rows.slice(3)) {
			// The center pool must cover 48 C and 48 PF. With identical public
			// labels, assigning one C exclusively to PF would invent a role
			// distinction. Each instead keeps half his time at his native C.
			expect(row.seconds.C).toBe(row.plannedSeconds / 2);
			expect(row.seconds.PF).toBe(row.plannedSeconds / 2);
		}
		const renamed = valid({
			...plan,
			players: plan.players.map((p, i) => ({ ...p, pid: 500 - i })),
			minutesByPid: Object.fromEntries(
				plan.players.map((p, i) => [500 - i, plan.minutesByPid[p.pid]]),
			),
		});
		expect(renamed.rows.map((r) => r.seconds)).toEqual(
			a.rows.map((r) => r.seconds),
		);
	});

	test("Knicks allocation conserves 240 and identifies unavoidable flex", () => {
		const result = valid(nyk);
		conserved(nyk, result);
		expect(result.rows.find((r) => r.pid === 1956)!.seconds.C).toBe(1813);
		expect(result.rows.find((r) => r.pid === 903)!.seconds.PG).toBe(14 * 60);
		expect(result.rows.find((r) => r.pid === 1317)!.seconds.PG).toBe(921);
		// 54 minutes of C supply cannot all fit C. The model prefers two
		// nearby C/PF and PF/SF shifts over assigning a center directly at SF;
		// its chosen 12 minutes are not a minimum count of out-of-position time.
		expect(result.outsideSeconds).toBe(12 * 60);
		expect(result.rows.find((r) => r.pid === 2077)!.fit.PF).toBe("outside");
	});

	test("duplicate centers and center shortages use nearby flex roles and mark them", () => {
		for (const positions of [
			["PG", "SG", "SF", "C", "C"],
			["PG", "SG", "SF", "PF", "PF"],
		]) {
			const plan = input(positions, [48, 48, 48, 48, 48]);
			const result = valid(plan);
			conserved(plan, result);
			expect(result.outsideSeconds).toBe(48 * 60);
			expect(
				result.rows
					.slice(0, 3)
					.map((r, i) => r.seconds[ROTATION_POSITIONS[i]!]),
			).toEqual([2880, 2880, 2880]);
			const forced = result.rows.find((r) =>
				positions[3] === "C" ? r.seconds.PF > 0 : r.seconds.C > 0,
			)!;
			expect(forced.fit[positions[3] === "C" ? "PF" : "C"]).toBe("outside");
		}
	});

	test("injury-adjusted Current supplies, zero minutes, and seconds-only players", () => {
		const plan = {
			...nyk,
			minutesByPid: {
				...nyk.minutesByPid,
				1956: 0,
				1317: 0,
				1582: 40,
				1529: 40,
				1659: 40,
				1761: 40,
				2077: 35,
				1581: 30,
				903: 14 + 52 / 60,
				844: 8 / 60,
			},
		};
		// 40+40+40+40+35+30+14:52+0:08 = 240.
		const result = valid(plan);
		conserved(plan, result);
		expect(result.rows.some((r) => r.pid === 1956 || r.pid === 1317)).toBe(
			false,
		);
		expect(result.rows.find((r) => r.pid === 844)!.plannedSeconds).toBe(8);
	});

	test("fractional, twelve-player, and 48/40/32/60 minute plans conserve seconds", () => {
		const positions = [
			"PG",
			"G",
			"SG",
			"GF",
			"SF",
			"F",
			"PF",
			"FC",
			"C",
			"G",
			"F",
			"FC",
		];
		const minutes = [36, 34, 32, 30, 28, 24, 20, 15, 10, 6, 4, 1];
		for (const gameMinutes of [48, 40, 32, 60]) {
			conserved(
				input(
					positions,
					minutes.map((m) => (m * gameMinutes) / 48),
					gameMinutes,
				),
			);
		}
		conserved(input(positions.slice(0, 9), Array(9).fill(240 / 9)));
	});

	test("allocation is deterministic, immutable, and independent of roster and period ordering", () => {
		const plan = structuredClone(nyk);
		Object.freeze(plan.minutesByPid);
		plan.players.forEach(Object.freeze);
		Object.freeze(plan.players);
		Object.freeze(plan);
		const before = JSON.stringify(plan),
			a = valid(plan);
		expect(valid(plan)).toEqual(a);
		expect(JSON.stringify(plan)).toBe(before);
		const reordered = valid({ ...plan, players: [...plan.players].reverse() });
		expect([...reordered.rows].sort((x, y) => x.pid - y.pid)).toEqual(
			[...a.rows].sort((x, y) => x.pid - y.pid),
		);
		// Seven equal shares need one additional rounded second. Reversing
		// roster order must not give that second to a different player.
		const fractional = input(
			["PG", "SG", "SF", "PF", "C", "G", "FC"],
			Array(7).fill(240 / 7),
		);
		const originalFractions = valid(fractional);
		const reverseFractions = valid({
			...fractional,
			players: [...fractional.players].reverse(),
		});
		expect([...reverseFractions.rows].sort((x, y) => x.pid - y.pid)).toEqual(
			[...originalFractions.rows].sort((x, y) => x.pid - y.pid),
		);
		const twoPeriods = { ...plan, numPeriods: 2 },
			fourPeriods = { ...plan, numPeriods: 4 };
		expect(valid(twoPeriods)).toEqual(valid(fourPeriods));
	});

	test("all one-minute Knicks transfers change at most five position minutes", () => {
		const a = valid(nyk),
			active = nyk.players.filter((p) => nyk.minutesByPid[p.pid]! > 0);
		for (const from of active) {
			for (const to of active) {
				if (from.pid === to.pid) {
					continue;
				}
				const plan = {
					...nyk,
					minutesByPid: {
						...nyk.minutesByPid,
						[from.pid]: nyk.minutesByPid[from.pid]! - 1,
						[to.pid]: nyk.minutesByPid[to.pid]! + 1,
					},
				};
				const b = valid(plan);
				conserved(plan, b);
				expect(
					reassigned(a, b),
					`${from.pid} -> ${to.pid}`,
				).toBeLessThanOrEqual(5);
			}
		}
	});

	test("unknown labels disclose uncertainty; lower-case native codes still work", () => {
		const plan = input(["pg", "sg", "sf", "pf", "?"], [48, 48, 48, 48, 48]);
		const result = valid(plan);
		conserved(plan, result);
		expect(result.unknownSeconds).toBe(48 * 60);
		expect(result.rows[4]!.seconds.C).toBe(48 * 60);
		expect(result.rows[4]!.fit.C).toBe("unknown");
		expect(result.outsideSeconds).toBe(0);
	});

	test("other court sizes are unavailable instead of inventing five slots", () => {
		const plan = input(["G", "F", "C"], [48, 48, 48]);
		expect(
			buildEstimatedPositionMinutes({ ...plan, numPlayersOnCourt: 3 }),
		).toMatchObject({ valid: false, reason: "courtSize" });
	});

	test("invalid plans never manufacture positional minutes", () => {
		for (const minutes of [
			[48, 48, 48, 48, 47],
			[49, 48, 48, 48, 47],
			[Number.NaN, 48, 48, 48, 48],
			[Infinity, 48, 48, 48, 48],
			[-1, 48, 48, 48, 48],
		]) {
			expect(
				buildEstimatedPositionMinutes(
					input(["PG", "SG", "SF", "PF", "C"], minutes),
				).valid,
			).toBe(false);
		}
		expect(
			buildEstimatedPositionMinutes({ ...nyk, gameMinutes: 0 }),
		).toMatchObject({ valid: false, reason: "settings" });
		expect(
			buildEstimatedPositionMinutes({
				...nyk,
				gameMinutes: Number.MAX_SAFE_INTEGER,
			}),
		).toMatchObject({ valid: false, reason: "settings" });
		expect(
			buildEstimatedPositionMinutes({
				...nyk,
				players: [...nyk.players, nyk.players[0]!],
			}),
		).toMatchObject({ valid: false, reason: "players" });
	});
});
