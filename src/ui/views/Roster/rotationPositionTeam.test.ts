import { describe, expect, test } from "vitest";
import {
	buildEstimatedPositionMinutes as build,
	getPositionMinutesDisplay,
	POSITION_RATING_KEYS,
	type PositionRatings,
	ROTATION_POSITIONS,
} from "./rotationPositions.ts";
const r = (patch: Partial<PositionRatings> = {}): PositionRatings =>
	({
		...Object.fromEntries(POSITION_RATING_KEYS.map((k) => [k, 50])),
		...patch,
	}) as PositionRatings;
const plan = (positions: string[], ratings: PositionRatings[]) => ({
	players: positions.map((pos, pid) => ({
		pid,
		pos,
		visibleRatings: ratings[pid],
	})),
	minutesByPid: Object.fromEntries(positions.map((_, pid) => [pid, 48])),
	numPlayersOnCourt: 5,
	gameMinutes: 48,
	ratingsVisible: true,
});
const valid = (p: Parameters<typeof build>[0]) => {
	const a = build(p);
	if (!a.valid) {
		throw Error(a.message);
	}
	expect(a.ratingsInformed).toBe(true);
	return a;
};
const opportunity = () =>
	plan(
		["G", "GF", "SF", "PF", "C"],
		[
			r({ pss: 90, drb: 90, oiq: 90, spd: 80, tp: 100, diq: 85 }),
			r({ pss: 85, drb: 80, oiq: 80, spd: 65, tp: 10, diq: 65 }),
			r({ hgt: 60, diq: 80, spd: 70 }),
			r({ hgt: 65, reb: 70 }),
			r({ hgt: 85, reb: 85 }),
		],
	);
describe("team-wide comparative position fit", () => {
	test("uses a cross-label handler to free the stronger all-round guard for scoring", () => {
		const p = opportunity(),
			a = valid(p);
		// Player 0 has higher passing, handling and speed, but is also the team's
		// outstanding shooter. Greedy best-PG-first and frozen pools both miss this.
		expect(a.rows[0]!.seconds.SG).toBeGreaterThan(10 * 60);
		expect(a.rows[1]!.seconds.PG).toBeGreaterThan(10 * 60);
		const changed = structuredClone(p);
		changed.players[1]!.visibleRatings = r({
			pss: 20,
			drb: 40,
			tp: 90,
			spd: 65,
		});
		const b = valid(changed);
		expect(b.rows[0]!.seconds.PG).toBeGreaterThan(
			a.rows[0]!.seconds.PG + 5 * 60,
		);
	});
	test("reconsiders unique F/PF and FC/C responsibilities using size, mobility and defense", () => {
		const forward = valid(
			plan(
				["PG", "SG", "F", "PF", "C"],
				[
					r(),
					r(),
					r({
						hgt: 85,
						reb: 90,
						stre: 85,
						ins: 85,
						dnk: 80,
						diq: 80,
						spd: 35,
						tp: 20,
					}),
					r({
						hgt: 50,
						reb: 35,
						stre: 40,
						spd: 90,
						tp: 90,
						drb: 80,
						pss: 60,
						diq: 75,
					}),
					r({ hgt: 85, reb: 85 }),
				],
			),
		);
		expect(forward.rows[2]!.seconds.PF).toBeGreaterThan(10 * 60);
		expect(forward.rows[3]!.seconds.SF).toBeGreaterThan(10 * 60);
		const big = valid(
			plan(
				["PG", "SG", "SF", "FC", "C"],
				[
					r(),
					r(),
					r(),
					r({ hgt: 95, reb: 90, diq: 85, jmp: 80, stre: 80, tp: 20, spd: 30 }),
					r({ hgt: 65, reb: 50, diq: 50, jmp: 40, tp: 90, spd: 75, drb: 70 }),
				],
			),
		);
		expect(big.rows[3]!.seconds.C).toBeGreaterThan(15 * 60);
		expect(big.rows[4]!.seconds.PF).toBeGreaterThan(15 * 60);
	});
	test("values rim protection independently of passing and shooting", () => {
		const p = plan(
			["PG", "SG", "SF", "FC", "FC"],
			[r(), r(), r(), r({ diq: 90, jmp: 90 }), r({ diq: 20, jmp: 20 })],
		);
		const a = valid(p);
		expect(a.rows[3]!.seconds.C).toBeGreaterThan(a.rows[4]!.seconds.C + 60);
	});
	test("respects clear specialist roles and does not depend on roster array order", () => {
		const p = plan(
				["PG", "SG", "SF", "PF", "C"],
				Array.from({ length: 5 }, () => r()),
			),
			a = valid(p);
		for (let i = 0; i < 5; i++) {
			expect(a.rows[i]!.seconds[ROTATION_POSITIONS[i]!]).toBeGreaterThan(
				45 * 60,
			);
		}
		const q = opportunity(),
			b = valid(q),
			c = valid({ ...q, players: [...q.players].reverse() });
		expect([...c.rows].sort((a, b) => a.pid - b.pid)).toEqual(b.rows);
	});
	test("jointly rounds cells and fractional player totals to balanced whole minutes", () => {
		const p = opportunity();
		p.minutesByPid = { 0: 47.3, 1: 47.8, 2: 47.7, 3: 47.6, 4: 47.5, 5: 2.1 };
		p.players.push({ pid: 5, pos: "FC", visibleRatings: r() });
		const a = valid(p),
			display = getPositionMinutesDisplay(a);
		expect(display.wholeMinutes).toBe(true);
		for (const row of display.rows) {
			const exact = a.rows.find((r) => r.pid === row.pid)!;
			expect(Object.values(row.values).reduce((s, x) => s + x, 0)).toBe(
				row.total,
			);
			expect(Math.abs(row.total - exact.plannedSeconds / 60)).toBeLessThan(1);
			for (const pos of ROTATION_POSITIONS) {
				expect(
					Math.abs(row.values[pos] - exact.seconds[pos] / 60),
				).toBeLessThan(1);
			}
		}
		for (const pos of ROTATION_POSITIONS) {
			expect(display.rows.reduce((s, r) => s + r.values[pos], 0)).toBe(48);
		}
		expect(display.rows.reduce((s, r) => s + r.total, 0)).toBe(240);
		expect(getPositionMinutesDisplay(a)).toEqual(display);
	});
});
