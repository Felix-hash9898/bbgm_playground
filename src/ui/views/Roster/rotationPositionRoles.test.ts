import { describe, expect, test } from "vitest";
import {
	buildEstimatedPositionMinutes as build,
	getVisiblePositionRatings,
	ROTATION_POSITIONS,
	type PositionRatings,
} from "./rotationPositions.ts";
const ratings = (patch: Partial<PositionRatings> = {}): PositionRatings => ({
	drb: 50,
	pss: 50,
	oiq: 50,
	spd: 50,
	hgt: 50,
	reb: 50,
	diq: 50,
	stre: 50,
	tp: 50,
	jmp: 50,
	dnk: 50,
	ins: 50,
	...patch,
});
const plan = (positions: string[], r: PositionRatings[]) => ({
	players: positions.map((pos, pid) => ({ pid, pos, visibleRatings: r[pid] })),
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
	return a;
};
const guards = () =>
	plan(
		["G", "G", "SF", "PF", "C"],
		[
			ratings({ drb: 90, pss: 90, oiq: 90, spd: 70, tp: 20 }),
			ratings({ drb: 60, pss: 20, oiq: 60, spd: 80, tp: 90 }),
			ratings(),
			ratings(),
			ratings(),
		],
	);
const centers = () =>
	plan(
		["PG", "SG", "SF", "C", "C"],
		[
			ratings(),
			ratings(),
			ratings(),
			ratings({
				hgt: 90,
				reb: 90,
				stre: 90,
				diq: 90,
				spd: 30,
				drb: 30,
				tp: 20,
			}),
			ratings({
				hgt: 60,
				reb: 60,
				stre: 60,
				diq: 60,
				spd: 80,
				drb: 80,
				tp: 90,
			}),
		],
	);
const distance = (a: ReturnType<typeof valid>, b: ReturnType<typeof valid>) =>
	a.rows.reduce(
		(sum, r, i) =>
			sum +
			ROTATION_POSITIONS.reduce(
				(s, p) => s + Math.abs(r.seconds[p] - b.rows[i]!.seconds[p]),
				0,
			),
		0,
	) / 2;
describe("visible ratings for position estimates", () => {
	test("passing/handling vs perimeter skills concentrate distinct guard responsibilities", () => {
		const p = guards(),
			a = valid(p),
			base = valid({ ...p, ratingsVisible: false });
		expect(a.ratingsInformed).toBe(true);
		expect(a.rows[0]!.seconds.PG).toBeGreaterThan(
			base.rows[0]!.seconds.PG + 60,
		);
		expect(a.rows[1]!.seconds.SG).toBeGreaterThan(
			base.rows[1]!.seconds.SG + 60,
		);
		// Clear comparative advantages may concentrate roles completely. Requiring
		// both guards to share both slots would preserve entropy fragmentation.
		expect(a.rows[0]!.seconds.PG).toBeGreaterThan(a.rows[1]!.seconds.PG);
		expect(a.rows[1]!.seconds.SG).toBeGreaterThan(a.rows[0]!.seconds.SG);
	});
	test("interior vs mobile/stretch fit differentiates C/PF without using overall ability", () => {
		const p = centers(),
			a = valid(p),
			base = valid({ ...p, ratingsVisible: false });
		expect(a.rows[3]!.seconds.C).toBeGreaterThan(base.rows[3]!.seconds.C + 60);
		expect(a.rows[4]!.seconds.PF).toBeGreaterThan(
			base.rows[4]!.seconds.PF + 60,
		);
		const boosted = {
			...p,
			players: p.players.map((x) => ({
				...x,
				visibleRatings: ratings(
					Object.fromEntries(
						Object.entries(x.visibleRatings!).map(([k, v]) => [k, v + 5]),
					),
				),
			})),
		};
		expect(valid(boosted).rows.map((r) => r.seconds)).toEqual(
			a.rows.map((r) => r.seconds),
		);
		const oneBoosted = {
			...p,
			players: p.players.map((x, i) => (i === 3 ? boosted.players[i]! : x)),
		};
		expect(valid(oneBoosted).rows.map((r) => r.seconds)).toEqual(
			a.rows.map((r) => r.seconds),
		);
	});
	test("GF, F and FC shares respond to wing/interior context within a joint team assignment", () => {
		for (const [code, otherPositions, left, right] of [
			["GF", ["PG", "PF", "C"], "SG", "SF"],
			["F", ["PG", "SG", "C"], "SF", "PF"],
			["FC", ["PG", "SG", "SF"], "PF", "C"],
		] as const) {
			const p = plan(
				[code, code, ...otherPositions],
				[
					ratings({
						drb: 80,
						spd: 80,
						tp: 90,
						hgt: 30,
						reb: 30,
						stre: 30,
						diq: 20,
					}),
					ratings({
						drb: 30,
						spd: 40,
						tp: 30,
						hgt: 90,
						reb: 90,
						stre: 90,
						diq: 90,
					}),
					ratings(),
					ratings(),
					ratings(),
				],
			);
			const a = valid(p),
				b = valid({ ...p, ratingsVisible: false });
			expect(a.rows[0]!.seconds[left]).toBeGreaterThan(
				b.rows[0]!.seconds[left],
			);
			expect(a.rows[1]!.seconds[right]).toBeGreaterThan(
				b.rows[1]!.seconds[right],
			);
		}
	});
	test("hidden and default visibility are exact label-only fallbacks even with hostile rating getters", () => {
		const p = guards();
		const base = valid({ ...p, ratingsVisible: false });
		const hidden = {
			...p,
			ratingsVisible: false,
			players: p.players.map((x) => {
				const out = { pid: x.pid, pos: x.pos };
				Object.defineProperty(out, "visibleRatings", {
					get() {
						throw Error("hidden read");
					},
				});
				return out;
			}),
		};
		expect(valid(hidden)).toEqual(base);
		expect(valid({ ...hidden, ratingsVisible: undefined })).toEqual(base);
		expect(
			getVisiblePositionRatings(
				false,
				new Proxy(
					{},
					{
						get() {
							throw Error("hidden read");
						},
					},
				),
			),
		).toBeUndefined();
	});
	test("any missing, nonfinite or out-of-range active attribute falls back exactly for the whole team", () => {
		const p = guards(),
			base = valid({ ...p, ratingsVisible: false });
		for (const bad of [undefined, Number.NaN, Infinity, -1, 101]) {
			const players = p.players.map((x) => ({
				...x,
				visibleRatings: { ...x.visibleRatings },
			}));
			players[0]!.visibleRatings.pss = bad as number;
			expect(valid({ ...p, players })).toEqual(base);
		}
		expect(
			valid({
				...p,
				players: p.players.map((x, i) =>
					i === 0 ? { pid: x.pid, pos: x.pos } : x,
				),
			}),
		).toEqual(base);
	});
	test("one-point ability edits are continuous and no identity swap occurs", () => {
		const p = guards(),
			a = valid(p);
		for (const key of Object.keys(
			p.players[0]!.visibleRatings!,
		) as (keyof PositionRatings)[]) {
			const players = structuredClone(p.players);
			players[0]!.visibleRatings![key] += 1;
			expect(distance(a, valid({ ...p, players }))).toBeLessThanOrEqual(60);
		}
	});
	test("determinism, input immutability, native slots and exact row/column seconds survive rating use", () => {
		const p = guards(),
			before = JSON.stringify(p);
		p.players.forEach((x) => {
			Object.freeze(x.visibleRatings);
			Object.freeze(x);
		});
		Object.freeze(p.players);
		Object.freeze(p.minutesByPid);
		const a = valid(p);
		expect(valid(p)).toEqual(a);
		expect(JSON.stringify(p)).toBe(before);
		for (const row of a.rows) {
			expect(Object.values(row.seconds).reduce((x, y) => x + y, 0)).toBe(2880);
			for (const s of Object.values(row.seconds)) {
				expect(Number.isInteger(s) && s >= 0).toBe(true);
			}
		}
		expect(Object.values(a.totals)).toEqual(Array(5).fill(2880));
		expect(a.rows[4]!.seconds.C).toBeGreaterThan(45 * 60);
	});
	test("period length scaling, zero-minute missing ratings and unsupported court sizes remain honest", () => {
		const p = guards();
		for (const gameMinutes of [32, 40, 48, 60]) {
			const a = valid({
				...p,
				gameMinutes,
				minutesByPid: Object.fromEntries(
					p.players.map((x) => [x.pid, gameMinutes]),
				),
			});
			expect(Object.values(a.totals)).toEqual(Array(5).fill(gameMinutes * 60));
		}
		const a = valid({
			...p,
			players: [...p.players, { pid: 99, pos: "G" }],
			minutesByPid: { ...p.minutesByPid, 99: 0 },
		});
		expect(a.ratingsInformed).toBe(true);
		expect(a.rows.some((r) => r.pid === 99)).toBe(false);
		expect(build({ ...p, numPlayersOnCourt: 3 })).toMatchObject({
			valid: false,
			reason: "courtSize",
		});
	});
});
