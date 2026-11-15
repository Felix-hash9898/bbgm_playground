import { describe, expect, test } from "vitest";
import {
	DYNAMIC_MINUTES_CONFIG,
	PLAN_AWARE_COURT_TIMER_BLEND,
} from "../../../worker/core/GameSim.basketball/dynamicMinutes.ts";
import {
	ROTATION_TIMELINE_GAME_SIM,
	buildRotationTimeline,
	getRotationTimelineSegment,
	lineupFailsPositionBalance,
	type RotationTimeline,
	type RotationTimelinePlayer,
} from "./rotationTimeline.ts";

type ValidTimeline = Extract<RotationTimeline, { valid: true }>;

// Planned minutes from the approved example. Positions are representative.
const representative: (RotationTimelinePlayer & { minutes: number })[] = [
	{ pid: 1, pos: "C", minutes: 32 }, // KAT
	{ pid: 2, pos: "PG", minutes: 32 }, // Maxey
	{ pid: 3, pos: "SF", minutes: 32 }, // MPJ
	{ pid: 4, pos: "GF", minutes: 30 }, // Little
	{ pid: 5, pos: "F", minutes: 28 }, // CMB
	{ pid: 6, pos: "FC", minutes: 28 }, // Chet
	{ pid: 7, pos: "PG", minutes: 28 }, // Haliburton
	{ pid: 8, pos: "FC", minutes: 18 }, // Karlo
	{ pid: 9, pos: "F", minutes: 6 }, // KJ Martin
	{ pid: 10, pos: "G", minutes: 6 }, // Demin
	{ pid: 11, pos: "SG", minutes: 0 },
	{ pid: 12, pos: "PF", minutes: 0 },
	{ pid: 13, pos: "C", minutes: 0 },
];

const toMinutesByPid = (players: { pid: number; minutes: number }[]) =>
	Object.fromEntries(players.map((p) => [p.pid, p.minutes])) as Record<
		number,
		number
	>;

const build = (
	players: (RotationTimelinePlayer & { minutes: number })[],
	overrides: Partial<Parameters<typeof buildRotationTimeline>[0]> = {},
) =>
	buildRotationTimeline({
		players,
		minutesByPid: toMinutesByPid(players),
		numPlayersOnCourt: 5,
		gameMinutes: 48,
		numPeriods: 4,
		...overrides,
	});

const expectValid = (timeline: RotationTimeline): ValidTimeline => {
	if (!timeline.valid) {
		throw new Error(`Expected a valid timeline: ${timeline.message}`);
	}
	return timeline;
};

// Checks every strict requirement from first principles, using only the rows
const expectStrict = (
	timeline: ValidTimeline,
	minutesByPid: Record<number, number>,
) => {
	const { gameMinutes, numPlayersOnCourt, rows } = timeline;

	// Each player's stints are ordered, disjoint, in range and sum to his plan
	let totalSeconds = 0;
	for (const row of rows) {
		let previousEnd = -1;
		let seconds = 0;
		for (const stint of row.stints) {
			expect(stint.start).toBeGreaterThan(previousEnd);
			expect(stint.end).toBeGreaterThan(stint.start);
			expect(stint.start).toBeGreaterThanOrEqual(0);
			expect(stint.end).toBeLessThanOrEqual(gameMinutes);
			previousEnd = stint.end;
			seconds += (stint.end - stint.start) * 60;
		}
		expect(seconds).toBeCloseTo(row.seconds, 6);
		expect(Math.abs(row.minutes - minutesByPid[row.pid]!) * 60).toBeLessThan(
			1 + 1e-6,
		);
		totalSeconds += row.seconds;
	}
	expect(totalSeconds).toBe(numPlayersOnCourt * gameMinutes * 60);

	// Exactly N players on court between every pair of consecutive changes
	const boundaries = Array.from(
		new Set([
			0,
			gameMinutes,
			...rows.flatMap((row) => row.stints.flatMap((s) => [s.start, s.end])),
		]),
	).sort((a, b) => a - b);
	for (let i = 0; i < boundaries.length - 1; i++) {
		const middle = (boundaries[i]! + boundaries[i + 1]!) / 2;
		const onCourt = rows.filter((row) =>
			row.stints.some((s) => s.start <= middle && middle < s.end),
		);
		expect(onCourt).toHaveLength(numPlayersOnCourt);
		expect(
			[...getRotationTimelineSegment(timeline, middle).pids].sort(),
		).toEqual(onCourt.map((row) => row.pid).sort());
	}

	// Segments tile the game with no gaps
	expect(timeline.segments[0]!.start).toBe(0);
	expect(timeline.segments.at(-1)!.end).toBeCloseTo(gameMinutes, 9);
	for (let i = 1; i < timeline.segments.length; i++) {
		expect(timeline.segments[i]!.start).toBe(timeline.segments[i - 1]!.end);
	}
	for (const segment of timeline.segments) {
		expect(new Set(segment.pids).size).toBe(numPlayersOnCourt);
	}
};

const secondsInRange = (timeline: ValidTimeline, start: number, end: number) =>
	timeline.rows.reduce(
		(total, row) =>
			total +
			row.stints.reduce(
				(sum, s) =>
					sum + Math.max(0, Math.min(s.end, end) - Math.max(s.start, start)),
				0,
			) *
				60,
		0,
	);

describe("rotation timeline", () => {
	test("representative roster is exact: 240 minutes, every pid, five on court at every instant", () => {
		const minutesByPid = toMinutesByPid(representative);
		const timeline = expectValid(build(representative));

		expectStrict(timeline, minutesByPid);
		expect(timeline.rows.map((row) => row.pid)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
		for (const row of timeline.rows) {
			expect(row.minutes).toBe(minutesByPid[row.pid]);
		}
		expect(timeline.rows.reduce((total, row) => total + row.minutes, 0)).toBe(
			240,
		);
	});

	test("representative roster looks like a GameSim rotation", () => {
		const timeline = expectValid(build(representative));
		const starters = [1, 2, 3, 4, 5];

		// Roster-order starters open the game, and like in GameSim nobody is
		// replaced in the first 5 minutes
		expect([...getRotationTimelineSegment(timeline, 0).pids].sort()).toEqual(
			starters,
		);
		const firstChange = timeline.segments[0]!.end;
		expect(firstChange).toBeGreaterThanOrEqual(5);
		expect(firstChange).toBeLessThanOrEqual(8);

		// Many medium stints instead of a few long ones
		const lengths = timeline.rows.flatMap((row) =>
			row.stints.map((stint) => stint.end - stint.start),
		);
		expect(lengths.length).toBeGreaterThanOrEqual(35);
		expect(lengths.length).toBeLessThanOrEqual(75);
		expect(Math.max(...lengths)).toBeLessThanOrEqual(16);
		const sorted = [...lengths].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)]!;
		expect(median).toBeGreaterThanOrEqual(2.5);
		expect(median).toBeLessThanOrEqual(7);

		// Starters are staggered: the starting five is not a fixed unit
		const startingFiveMinutes = timeline.segments
			.filter((segment) => starters.every((pid) => segment.pids.includes(pid)))
			.reduce((sum, segment) => sum + segment.end - segment.start, 0);
		expect(startingFiveMinutes).toBeGreaterThanOrEqual(5);
		expect(startingFiveMinutes).toBeLessThanOrEqual(16);
		expect(
			new Set(timeline.segments.map((s) => [...s.pids].sort().join())).size,
		).toBeGreaterThanOrEqual(12);

		// Every player's minutes are spread over the game, not packed in a half
		for (const row of timeline.rows.filter((r) => r.minutes >= 18)) {
			for (let quarter = 0; quarter < 4; quarter++) {
				const inQuarter = row.stints.reduce(
					(sum, s) =>
						sum +
						Math.max(
							0,
							Math.min(s.end, (quarter + 1) * 12) -
								Math.max(s.start, quarter * 12),
						),
					0,
				);
				expect(Math.abs(inQuarter - row.minutes / 4)).toBeLessThanOrEqual(4);
			}
		}
	});

	test("League 10 Knicks plan from the 2028 draft export", () => {
		// Saved custom plan of the user's team, all players healthy
		const knicks = [
			{ pid: 1956, pos: "C", minutes: 34 },
			{ pid: 1582, pos: "G", minutes: 34 },
			{ pid: 1529, pos: "GF", minutes: 32 },
			{ pid: 1659, pos: "PF", minutes: 30 },
			{ pid: 1761, pos: "F", minutes: 30 },
			{ pid: 1317, pos: "G", minutes: 28 },
			{ pid: 2077, pos: "C", minutes: 20 },
			{ pid: 1581, pos: "PF", minutes: 18 },
			{ pid: 903, pos: "PG", minutes: 14 },
			{ pid: 844, pos: "SF", minutes: 0 },
			{ pid: 1213, pos: "FC", minutes: 0 },
		];
		const minutesByPid = toMinutesByPid(knicks);
		const timeline = expectValid(build(knicks));
		expectStrict(timeline, minutesByPid);
		expect(timeline.rows.map((row) => [row.pid, row.minutes])).toEqual(
			knicks.filter((p) => p.minutes > 0).map((p) => [p.pid, p.minutes]),
		);
		expect([...getRotationTimelineSegment(timeline, 0).pids].sort()).toEqual([
			1529, 1582, 1659, 1761, 1956,
		]);
		expect(timeline.segments[0]!.end).toBe(6);
	});

	test("real League 10 plans have no artificial short stints or rests", () => {
		// Healthy and injury adjusted plans as GameSim received them, starters
		// first. The last two contain a player planned for a few seconds.
		const plans: Record<string, [string, number][]> = {
			knicks: [
				["C", 34],
				["G", 34],
				["GF", 32],
				["PF", 30],
				["F", 30],
				["G", 28],
				["C", 20],
				["PF", 18],
				["PG", 14],
			],
			mavericks: [
				["C", 35],
				["PG", 34],
				["PG", 32],
				["F", 31],
				["PF", 28],
				["GF", 20],
				["C", 17],
				["GF", 15],
				["PG", 12],
				["PG", 7],
				["FC", 5],
				["PF", 4],
			],
			raptors: [
				["SG", 36],
				["C", 34],
				["PF", 32],
				["G", 31],
				["PF", 28.56127532355867],
				["G", 23.8030581219648],
				["PG", 19.762820537501497],
				["GF", 13.233273900066237],
				["SF", 8.057970314561187],
				["SF", 9.328372293598317],
				["PF", 4.014267154626731],
				["GF", 0.23896235412255898],
			],
			thunder: [
				["F", 38],
				["PF", 36],
				["C", 34],
				["G", 30.214388513513512],
				["PF", 28.520288556948067],
				["FC", 22.919978752914936],
				["PF", 17.49443963223979],
				["FC", 12.558842944763263],
				["FC", 9.00956854757042],
				["SF", 6.247570533815043],
				["GF", 4.901857119442738],
				["SG", 0.13306539879222276],
			],
		};
		for (const [name, plan] of Object.entries(plans)) {
			const players = plan.map(([pos, minutes], pid) => ({
				pid,
				pos,
				minutes,
			}));
			const timeline = expectValid(build(players));
			for (const row of timeline.rows) {
				// To the second, also for plans that are not whole minutes
				const seconds = row.stints.reduce(
					(sum, stint) => sum + Math.round((stint.end - stint.start) * 60),
					0,
				);
				expect(
					Math.abs(seconds - players[row.pid]!.minutes * 60),
					name,
				).toBeLessThanOrEqual(1);

				for (const [i, stint] of row.stints.entries()) {
					// Nobody comes on for half a minute, unless that is his plan
					if (row.minutes > 0.5) {
						expect((stint.end - stint.start) * 60, name).toBeGreaterThan(30);
					}
					const next = row.stints[i + 1];
					if (next) {
						expect(
							Math.round((next.start - stint.end) * 60),
							name,
						).toBeGreaterThanOrEqual(60);
					}
				}
			}
		}

		// A player is not taken off for the last seconds of the game only
		// because his minutes ran out: the lineup that finishes has been
		// together for at least a minute
		const knicks = expectValid(
			build(
				plans.knicks!.map(([pos, minutes], pid) => ({ pid, pos, minutes })),
			),
		);
		const last = knicks.segments.at(-1)!;
		expect(last.end - last.start).toBeGreaterThanOrEqual(1);
	});

	test("uses the same constants as GameSim's planned minutes controller", () => {
		expect(ROTATION_TIMELINE_GAME_SIM.dynamicMinutes).toEqual(
			DYNAMIC_MINUTES_CONFIG,
		);
		expect(ROTATION_TIMELINE_GAME_SIM.planAwareCourtTimerBlend).toBe(
			PLAN_AWARE_COURT_TIMER_BLEND,
		);
	});

	test("quarter boundaries and per-quarter sums", () => {
		const timeline = expectValid(build(representative));
		expect(timeline.periodBoundaries).toEqual([12, 24, 36]);
		expect(timeline.periodMinutes).toBe(12);
		for (let quarter = 0; quarter < 4; quarter++) {
			expect(
				secondsInRange(timeline, quarter * 12, (quarter + 1) * 12),
			).toBeCloseTo(5 * 12 * 60, 6);
		}
	});

	test("period settings come from the league: other lengths and odd period counts", () => {
		const players = representative.map((p) => ({
			...p,
			minutes: (p.minutes * 40) / 48,
		}));
		const fourTens = expectValid(build(players, { gameMinutes: 40 }));
		expectStrict(fourTens, toMinutesByPid(players));
		expect(fourTens.periodBoundaries).toEqual([10, 20, 30]);

		const threePeriods = expectValid(build(representative, { numPeriods: 3 }));
		expectStrict(threePeriods, toMinutesByPid(representative));
		expect(threePeriods.periodBoundaries).toEqual([16, 32]);

		const onePeriod = expectValid(build(representative, { numPeriods: 1 }));
		expectStrict(onePeriod, toMinutesByPid(representative));
		expect(onePeriod.periodBoundaries).toEqual([]);
	});

	test("zero-minute players get no row and never appear on court", () => {
		const timeline = expectValid(build(representative));
		const pids = new Set(timeline.rows.map((row) => row.pid));
		for (const pid of [11, 12, 13]) {
			expect(pids.has(pid)).toBe(false);
			expect(timeline.segments.some((s) => s.pids.includes(pid))).toBe(false);
		}
	});

	test("current plan: injured starters drop out and the reallocated plan stays exact", () => {
		// KAT and Haliburton are unavailable. Their minutes went to teammates.
		const current = representative.map((p) => ({ ...p }));
		const set = (pid: number, minutes: number) => {
			current.find((p) => p.pid === pid)!.minutes = minutes;
		};
		set(1, 0);
		set(7, 0);
		set(6, 34.5);
		set(8, 29.3);
		set(10, 16.2);
		set(2, 36);
		set(3, 36);
		set(4, 34);
		set(5, 30);
		set(9, 12);
		set(11, 12);
		const minutesByPid = toMinutesByPid(current);
		const timeline = expectValid(build(current));

		expectStrict(timeline, minutesByPid);
		const pids = timeline.rows.map((row) => row.pid);
		expect(pids).not.toContain(1);
		expect(pids).not.toContain(7);
		// The next players in roster order with minutes open the game
		expect([...getRotationTimelineSegment(timeline, 0).pids].sort()).toEqual([
			2, 3, 4, 5, 6,
		]);
		for (const row of timeline.rows) {
			expect(row.minutes).toBeCloseTo(minutesByPid[row.pid]!, 9);
		}
	});

	test("fractional plans are exact to the second", () => {
		const third = 240 / 9;
		const players = Array.from({ length: 9 }, (_, i) => ({
			pid: i + 1,
			pos: ["PG", "SG", "SF", "PF", "C", "G", "F", "FC", "GF"][i]!,
			minutes: third,
		}));
		const timeline = expectValid(build(players));
		expectStrict(timeline, toMinutesByPid(players));
	});

	test("invalid plans show no schedule", () => {
		const tooFew = representative.map((p) =>
			p.pid === 1 ? { ...p, minutes: 30 } : p,
		);
		const short = build(tooFew);
		expect(short.valid).toBe(false);
		expect(short).toMatchObject({ reason: "total" });
		expect((short as { message: string }).message).toContain("238");
		expect((short as { message: string }).message).toContain("240");

		const tooMany = representative.map((p) =>
			p.pid === 1 ? { ...p, minutes: 33 } : p,
		);
		expect(build(tooMany)).toMatchObject({ valid: false, reason: "total" });

		const notANumber = representative.map((p) =>
			p.pid === 1 ? { ...p, minutes: Number.NaN } : p,
		);
		expect(build(notANumber)).toMatchObject({
			valid: false,
			reason: "minutes",
		});

		const negative = representative.map((p) =>
			p.pid === 1 ? { ...p, minutes: -2 } : p,
		);
		expect(build(negative)).toMatchObject({ valid: false, reason: "minutes" });

		const overGame = representative.map((p) =>
			p.pid === 1 ? { ...p, minutes: 50 } : p,
		);
		expect(build(overGame)).toMatchObject({
			valid: false,
			reason: "tooManyMinutes",
		});

		expect(build([])).toMatchObject({ valid: false, reason: "total" });
		expect(build(representative, { gameMinutes: 0 })).toMatchObject({
			valid: false,
			reason: "settings",
		});
		expect(build(representative, { numPlayersOnCourt: 0 })).toMatchObject({
			valid: false,
			reason: "settings",
		});
	});

	test("edge plans: iron five, full-game reserve, tiny minutes", () => {
		const ironFive = representative.map((p, i) => ({
			...p,
			minutes: i < 5 ? 48 : 0,
		}));
		const iron = expectValid(build(ironFive));
		expectStrict(iron, toMinutesByPid(ironFive));
		expect(iron.segments).toHaveLength(1);

		// A full-game player further down the roster still opens
		const fullGameReserve = [
			{ pid: 1, pos: "PG", minutes: 20 },
			{ pid: 2, pos: "SG", minutes: 40 },
			{ pid: 3, pos: "SF", minutes: 40 },
			{ pid: 4, pos: "PF", minutes: 40 },
			{ pid: 5, pos: "C", minutes: 24 },
			{ pid: 6, pos: "G", minutes: 28 },
			{ pid: 7, pos: "C", minutes: 48 },
		];
		const reserve = expectValid(build(fullGameReserve));
		expectStrict(reserve, toMinutesByPid(fullGameReserve));
		expect(reserve.rows.find((row) => row.pid === 7)!.stints).toEqual([
			{ start: 0, end: 48 },
		]);

		const tiny = [
			{ pid: 1, pos: "PG", minutes: 47 },
			{ pid: 2, pos: "SG", minutes: 47 },
			{ pid: 3, pos: "SF", minutes: 47 },
			{ pid: 4, pos: "PF", minutes: 47 },
			{ pid: 5, pos: "C", minutes: 47 },
			{ pid: 6, pos: "G", minutes: 1 },
			{ pid: 7, pos: "F", minutes: 1 },
			{ pid: 8, pos: "C", minutes: 1 },
			{ pid: 9, pos: "G", minutes: 1 },
			{ pid: 10, pos: "F", minutes: 1 },
		];
		expectStrict(expectValid(build(tiny)), toMinutesByPid(tiny));
	});

	test("many varied plans stay strict, including other court sizes", () => {
		// Deterministic pseudo-random plans
		let seed = 12345;
		const random = () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed / 2147483648;
		};
		const allPositions = ["PG", "SG", "SF", "PF", "C", "G", "F", "FC", "GF"];

		for (let trial = 0; trial < 150; trial++) {
			const numPlayersOnCourt = trial % 5 === 4 ? 3 : 5;
			const numPlayers = numPlayersOnCourt + Math.floor(random() * 9);
			const required = numPlayersOnCourt * 48;
			const minutes = Array.from({ length: numPlayers }, () => 0);
			let left = required;
			// Hand out whole minutes at random, never above 48
			while (left > 0) {
				const i = Math.floor(random() * numPlayers);
				const amount = Math.min(
					left,
					48 - minutes[i]!,
					1 + Math.floor(random() * 6),
				);
				minutes[i]! += amount;
				left -= amount;
			}
			const players = minutes.map((value, i) => ({
				pid: i + 1,
				pos: allPositions[Math.floor(random() * allPositions.length)]!,
				minutes: value,
			}));
			const timeline = expectValid(build(players, { numPlayersOnCourt }));
			expectStrict(timeline, toMinutesByPid(players));
		}
	});

	test("is deterministic and does not mutate its inputs", () => {
		const players = representative.map((p) => ({ pid: p.pid, pos: p.pos }));
		const minutesByPid = toMinutesByPid(representative);
		Object.freeze(minutesByPid);
		Object.freeze(players);
		for (const p of players) {
			Object.freeze(p);
		}
		const input = {
			players,
			minutesByPid,
			numPlayersOnCourt: 5,
			gameMinutes: 48,
			numPeriods: 4,
		};
		const before = JSON.stringify(input);
		const first = buildRotationTimeline(input);
		const second = buildRotationTimeline(input);
		expect(JSON.stringify(input)).toBe(before);
		expect(second).toEqual(first);
	});

	test("position balance rule matches GameSim and is used when a balanced schedule exists", () => {
		expect(lineupFailsPositionBalance(["PG", "SG", "SF", "PF", "C"], 5)).toBe(
			false,
		);
		// One guard who is not a PG
		expect(lineupFailsPositionBalance(["SG", "SF", "SF", "PF", "C"], 5)).toBe(
			true,
		);
		// A lone PG is enough for the guard side
		expect(lineupFailsPositionBalance(["PG", "SF", "SF", "PF", "C"], 5)).toBe(
			false,
		);
		// One forward and no C
		expect(lineupFailsPositionBalance(["PG", "SG", "G", "G", "PF"], 5)).toBe(
			true,
		);
		// FC counts as a forward but not as a C
		expect(lineupFailsPositionBalance(["PG", "SG", "G", "FC", "FC"], 5)).toBe(
			false,
		);
		expect(lineupFailsPositionBalance(["SG", "SG"], 2)).toBe(false);

		// The reported imbalance is exactly the time in failing lineups
		const timeline = expectValid(build(representative));
		const posByPid = Object.fromEntries(
			representative.map((p) => [p.pid, p.pos]),
		);
		const failing = timeline.segments
			.filter((segment) =>
				lineupFailsPositionBalance(
					segment.pids.map((pid) => posByPid[pid]!),
					5,
				),
			)
			.reduce((sum, segment) => sum + segment.end - segment.start, 0);
		expect(timeline.positionImbalanceMinutes).toBeCloseTo(failing, 9);
		// GameSim's check keeps unbalanced lineups rare for a balanced roster
		expect(timeline.positionImbalanceMinutes).toBeLessThanOrEqual(6);
	});

	test("is cheap enough to compute on demand for typical rosters", () => {
		const input = {
			players: representative,
			minutesByPid: toMinutesByPid(representative),
			numPlayersOnCourt: 5,
			gameMinutes: 48,
			numPeriods: 4,
		};
		buildRotationTimeline(input);
		const runs = 20;
		const start = performance.now();
		for (let i = 0; i < runs; i++) {
			buildRotationTimeline(input);
		}
		const perBuild = (performance.now() - start) / runs;
		// Generous bound for slow machines. Typical is a few milliseconds.
		expect(perBuild).toBeLessThan(50);
	});
});
