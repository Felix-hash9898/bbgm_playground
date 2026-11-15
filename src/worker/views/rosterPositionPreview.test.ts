import { beforeEach, expect, test } from "vitest";
import { resetG } from "../../test/helpers.ts";
import { getReadonlyRosterPositionPreview as preview } from "./rosterPositionPreview.ts";
const r = {
	pos: "G",
	ovr: 60,
	endu: 60,
	drb: 60,
	pss: 60,
	oiq: 60,
	spd: 60,
	hgt: 50,
	reb: 50,
	diq: 50,
	stre: 50,
	tp: 60,
};
const players = () =>
	Array.from({ length: 9 }, (_, pid) => ({
		pid,
		rosterOrder: pid,
		injury: { gamesRemaining: 0 },
		ratings: {
			...r,
			pos: ["PG", "SG", "SF", "PF", "C", "G", "F", "FC", "C"][pid]!,
		},
	}));
const input = () => ({
	players: players(),
	challengeNoRatings: false,
	numPlayersOnCourt: 5,
	regulationMinutes: 48,
	playoffs: false,
	playThroughInjuries: 0,
});
beforeEach(() => resetG());
test("other-team readonly auto preview conserves minutes, adapts Current length and leaves inputs unchanged", () => {
	const p = input(),
		before = JSON.stringify(p),
		a = preview(p);
	expect(
		Object.values(a.healthyMinutesByPid).reduce((s, x) => s + x, 0),
	).toBeCloseTo(240, 8);
	expect(
		Object.values(a.effectiveMinutesByPid!).reduce((s, x) => s + x, 0),
	).toBeCloseTo(240, 8);
	expect(JSON.stringify(p)).toBe(before);
	expect(
		Object.values(
			preview({ ...p, regulationMinutes: 40 }).effectiveMinutesByPid!,
		).reduce((s, x) => s + x, 0),
	).toBeCloseTo(200, 8);
});
test("already-fuzzed inputs are not fuzzed twice", () => {
	const p = input(),
		a = preview(p);
	expect(
		preview({
			...p,
			players: p.players.map((x) => ({
				...x,
				ratings: { ...x.ratings, fuzz: 99 },
			})),
		}),
	).toEqual(a);
	expect(
		preview({
			...p,
			players: p.players.map((x) => ({
				...x,
				ratings: { ...x.ratings, fuzz: -99 },
			})),
		}),
	).toEqual(a);
});
test("NoRatings preview does not access numeric attributes even if spectator data retains them", () => {
	const p = input();
	const hidden = p.players.map((x) => ({
		...x,
		ratings: new Proxy(
			{ pos: x.ratings.pos },
			{
				get(target, key) {
					if (key !== "pos") {
						throw Error("hidden numeric read");
					}
					return target.pos;
				},
			},
		),
	}));
	const a = preview({ ...p, challengeNoRatings: true, players: hidden });
	const b = preview({
		...p,
		challengeNoRatings: true,
		players: p.players.map((x) => ({ ...x, ratings: { pos: x.ratings.pos } })),
	});
	expect(a).toEqual(b);
});
test("readonly Current removes unavailable players without modifying saved minute plans", () => {
	const p = input();
	p.players[0]!.injury.gamesRemaining = 20;
	const a = preview(p);
	expect(a.effectiveMinutesByPid![0]).toBe(0);
	expect(
		Object.values(a.effectiveMinutesByPid!).reduce((s, x) => s + x, 0),
	).toBeCloseTo(240, 8);
});
