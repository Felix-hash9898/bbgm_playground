import { assert, test } from "vitest";
import {
	getGameEffectiveBasketballMinutesWithStatus as allocate,
	getBasketballRotationPlayerInput as project,
} from "./basketballMinutes.ts";
type Args = Parameters<typeof allocate>[0];
// Frozen permitted planner inputs from copied real-roster cases. No hidden value signal.
const lal = {
	players: [
		{
			pid: 382,
			rosterOrder: 0,
			endurance: 0.66,
			ovr: 72,
			ovrPercentile: 0.9912109375,
			position: "GF",
			roleScores: {
				handler: 0.7,
				interior: 0.5975,
				wing: 0.5525,
			},
			available: true,
		},
		{
			pid: 176,
			rosterOrder: 1,
			endurance: 0.59,
			ovr: 63,
			ovrPercentile: 0.9130859375,
			position: "FC",
			roleScores: {
				handler: 0.5575,
				interior: 0.645,
				wing: 0.44,
			},
			available: false,
		},
		{
			pid: 803,
			rosterOrder: 2,
			endurance: 0.48,
			ovr: 58,
			ovrPercentile: 0.7958984375,
			position: "PG",
			roleScores: {
				handler: 0.6275,
				interior: 0.56,
				wing: 0.4925,
			},
			available: false,
		},
		{
			pid: 537,
			rosterOrder: 3,
			endurance: 0.59,
			ovr: 59,
			ovrPercentile: 0.82421875,
			position: "SG",
			roleScores: {
				handler: 0.58,
				interior: 0.4525,
				wing: 0.535,
			},
			available: false,
		},
		{
			pid: 19,
			rosterOrder: 4,
			endurance: 0.29,
			ovr: 52,
			ovrPercentile: 0.53515625,
			position: "F",
			roleScores: {
				handler: 0.4475,
				interior: 0.525,
				wing: 0.48,
			},
			available: true,
		},
		{
			pid: 351,
			rosterOrder: 5,
			endurance: 0.45,
			ovr: 47,
			ovrPercentile: 0.3603515625,
			position: "G",
			roleScores: {
				handler: 0.5025,
				interior: 0.42,
				wing: 0.44000000000000006,
			},
			available: true,
		},
		{
			pid: 652,
			rosterOrder: 6,
			endurance: 0.49,
			ovr: 52,
			ovrPercentile: 0.53515625,
			position: "SG",
			roleScores: {
				handler: 0.5575,
				interior: 0.4125,
				wing: 0.5225,
			},
			available: true,
		},
		{
			pid: 354,
			rosterOrder: 7,
			endurance: 0.3,
			ovr: 50,
			ovrPercentile: 0.451171875,
			position: "FC",
			roleScores: {
				handler: 0.37749999999999995,
				interior: 0.7275,
				wing: 0.35750000000000004,
			},
			available: true,
		},
		{
			pid: 502,
			rosterOrder: 8,
			endurance: 0.43,
			ovr: 49,
			ovrPercentile: 0.4228515625,
			position: "G",
			roleScores: {
				handler: 0.515,
				interior: 0.43,
				wing: 0.51,
			},
			available: true,
		},
		{
			pid: 578,
			rosterOrder: 9,
			endurance: 0.34,
			ovr: 44,
			ovrPercentile: 0.2705078125,
			position: "G",
			roleScores: {
				handler: 0.47000000000000003,
				interior: 0.3575,
				wing: 0.46749999999999997,
			},
			available: true,
		},
		{
			pid: 401,
			rosterOrder: 10,
			endurance: 0.35,
			ovr: 42,
			ovrPercentile: 0.1748046875,
			position: "F",
			roleScores: {
				handler: 0.39499999999999996,
				interior: 0.46249999999999997,
				wing: 0.37749999999999995,
			},
			available: true,
		},
		{
			pid: 87,
			rosterOrder: 11,
			endurance: 0.42,
			ovr: 46,
			ovrPercentile: 0.3359375,
			position: "G",
			roleScores: {
				handler: 0.46499999999999997,
				interior: 0.4875,
				wing: 0.48,
			},
			available: true,
		},
		{
			pid: 26,
			rosterOrder: 12,
			endurance: 0.45,
			ovr: 48,
			ovrPercentile: 0.3916015625,
			position: "PG",
			roleScores: {
				handler: 0.645,
				interior: 0.40249999999999997,
				wing: 0.5375000000000001,
			},
			available: true,
		},
		{
			pid: 52,
			rosterOrder: 13,
			endurance: 0.4,
			ovr: 43,
			ovrPercentile: 0.22265625,
			position: "GF",
			roleScores: {
				handler: 0.4625,
				interior: 0.365,
				wing: 0.4850000000000001,
			},
			available: true,
		},
		{
			pid: 228,
			rosterOrder: 14,
			endurance: 0.41,
			ovr: 42,
			ovrPercentile: 0.1748046875,
			position: "SG",
			roleScores: {
				handler: 0.425,
				interior: 0.3475,
				wing: 0.4525,
			},
			available: true,
		},
		{
			pid: 413,
			rosterOrder: 15,
			endurance: 0.26,
			ovr: 36,
			ovrPercentile: 0.0166015625,
			position: "SG",
			roleScores: {
				handler: 0.39499999999999996,
				interior: 0.35,
				wing: 0.39999999999999997,
			},
			available: true,
		},
		{
			pid: 254,
			rosterOrder: 16,
			endurance: 0.32,
			ovr: 40,
			ovrPercentile: 0.099609375,
			position: "FC",
			roleScores: {
				handler: 0.365,
				interior: 0.525,
				wing: 0.3775,
			},
			available: true,
		},
	],
	minutesByPid: {
		"19": 33,
		"26": 0,
		"52": 0,
		"87": 5,
		"176": 41,
		"228": 0,
		"254": 0,
		"351": 26,
		"354": 19,
		"382": 0,
		"401": 0,
		"413": 0,
		"502": 14,
		"537": 37,
		"578": 4,
		"652": 23,
		"803": 38,
	},
	numPlayersOnCourt: 5,
	regulationMinutes: 48,
	coreReliance: "low",
	rotationDepth: "short",
	noInjuryMinutesIncreasePids: [],
} satisfies Args;
const ind = {
	players: [
		{
			pid: 96,
			rosterOrder: 0,
			endurance: 0.69,
			ovr: 64,
			ovrPercentile: 0.9267578125,
			position: "G",
			roleScores: {
				handler: 0.635,
				interior: 0.5175,
				wing: 0.5775,
			},
			available: false,
		},
		{
			pid: 765,
			rosterOrder: 1,
			endurance: 0.63,
			ovr: 63,
			ovrPercentile: 0.9130859375,
			position: "C",
			roleScores: {
				handler: 0.4149999999999999,
				interior: 0.6224999999999999,
				wing: 0.4425,
			},
			available: false,
		},
		{
			pid: 215,
			rosterOrder: 2,
			endurance: 0.59,
			ovr: 64,
			ovrPercentile: 0.9267578125,
			position: "GF",
			roleScores: {
				handler: 0.59,
				interior: 0.5075000000000001,
				wing: 0.5974999999999999,
			},
			available: false,
		},
		{
			pid: 303,
			rosterOrder: 3,
			endurance: 0.6,
			ovr: 60,
			ovrPercentile: 0.849609375,
			position: "G",
			roleScores: {
				handler: 0.62,
				interior: 0.4575,
				wing: 0.5900000000000001,
			},
			available: true,
		},
		{
			pid: 793,
			rosterOrder: 4,
			endurance: 0.6,
			ovr: 61,
			ovrPercentile: 0.87109375,
			position: "F",
			roleScores: {
				handler: 0.5599999999999999,
				interior: 0.4875,
				wing: 0.515,
			},
			available: true,
		},
		{
			pid: 679,
			rosterOrder: 5,
			endurance: 0.58,
			ovr: 55,
			ovrPercentile: 0.681640625,
			position: "PG",
			roleScores: {
				handler: 0.5625,
				interior: 0.43,
				wing: 0.5249999999999999,
			},
			available: true,
		},
		{
			pid: 504,
			rosterOrder: 6,
			endurance: 0.62,
			ovr: 62,
			ovrPercentile: 0.8955078125,
			position: "PG",
			roleScores: {
				handler: 0.7025,
				interior: 0.44,
				wing: 0.6924999999999999,
			},
			available: true,
		},
		{
			pid: 335,
			rosterOrder: 7,
			endurance: 0.61,
			ovr: 55,
			ovrPercentile: 0.681640625,
			position: "GF",
			roleScores: {
				handler: 0.515,
				interior: 0.43500000000000005,
				wing: 0.56,
			},
			available: true,
		},
		{
			pid: 376,
			rosterOrder: 8,
			endurance: 0.37,
			ovr: 51,
			ovrPercentile: 0.4912109375,
			position: "C",
			roleScores: {
				handler: 0.3825,
				interior: 0.5475,
				wing: 0.40249999999999997,
			},
			available: true,
		},
		{
			pid: 737,
			rosterOrder: 9,
			endurance: 0.57,
			ovr: 54,
			ovrPercentile: 0.6318359375,
			position: "PF",
			roleScores: {
				handler: 0.47250000000000003,
				interior: 0.615,
				wing: 0.445,
			},
			available: true,
		},
		{
			pid: 794,
			rosterOrder: 10,
			endurance: 0.44,
			ovr: 48,
			ovrPercentile: 0.3916015625,
			position: "G",
			roleScores: {
				handler: 0.525,
				interior: 0.3775,
				wing: 0.52,
			},
			available: true,
		},
		{
			pid: 95,
			rosterOrder: 11,
			endurance: 0.5,
			ovr: 50,
			ovrPercentile: 0.451171875,
			position: "F",
			roleScores: {
				handler: 0.42000000000000004,
				interior: 0.5825,
				wing: 0.455,
			},
			available: true,
		},
		{
			pid: 725,
			rosterOrder: 12,
			endurance: 0.29,
			ovr: 39,
			ovrPercentile: 0.0693359375,
			position: "GF",
			roleScores: {
				handler: 0.4025,
				interior: 0.49,
				wing: 0.4075,
			},
			available: true,
		},
		{
			pid: 69,
			rosterOrder: 13,
			endurance: 0.32,
			ovr: 38,
			ovrPercentile: 0.0419921875,
			position: "C",
			roleScores: {
				handler: 0.34,
				interior: 0.5375000000000001,
				wing: 0.3375,
			},
			available: true,
		},
		{
			pid: 341,
			rosterOrder: 14,
			endurance: 0.42,
			ovr: 43,
			ovrPercentile: 0.22265625,
			position: "GF",
			roleScores: {
				handler: 0.4675,
				interior: 0.4475,
				wing: 0.4875,
			},
			available: true,
		},
		{
			pid: 718,
			rosterOrder: 15,
			endurance: 0.31,
			ovr: 38,
			ovrPercentile: 0.0419921875,
			position: "FC",
			roleScores: {
				handler: 0.295,
				interior: 0.515,
				wing: 0.34,
			},
			available: true,
		},
		{
			pid: 837,
			rosterOrder: 16,
			endurance: 0.54,
			ovr: 48,
			ovrPercentile: 0.3916015625,
			position: "SG",
			roleScores: {
				handler: 0.5625,
				interior: 0.35750000000000004,
				wing: 0.595,
			},
			available: true,
		},
	],
	minutesByPid: {
		"69": 0,
		"95": 3,
		"96": 36,
		"215": 32,
		"303": 31,
		"335": 15,
		"341": 0,
		"376": 10,
		"504": 18,
		"679": 21,
		"718": 0,
		"725": 0,
		"737": 7,
		"765": 34,
		"793": 29,
		"794": 4,
		"837": 0,
	},
	numPlayersOnCourt: 5,
	regulationMinutes: 48,
	coreReliance: "low",
	rotationDepth: "short",
	noInjuryMinutesIncreasePids: [303, 793, 679, 504, 335, 376, 737, 794, 95],
} satisfies Args;

const maximumDifference = (
	a: Record<number, number>,
	b: Record<number, number>,
) =>
	Math.max(
		...Object.keys(a).map((k) => Math.abs(a[Number(k)]! - b[Number(k)]!)),
	);
test("a zero-to-one healthy edit cannot demote the strong replacement by tens of minutes", () => {
	const a = allocate(lal);
	const changed = structuredClone(lal);
	changed.minutesByPid[382] = 1;
	changed.minutesByPid[19]--;
	const b = allocate(changed);
	assert.isBelow(maximumDifference(a.minutesByPid, b.minutesByPid), 3);
	assert.isAbove(b.minutesByPid[382]!, 25);
});
test("positive-minute ties do not assign unrelated inherited capacity slots", () => {
	const positions = [
		"GF",
		"FC",
		"PG",
		"SG",
		"F",
		"G",
		"SG",
		"FC",
		"G",
		"G",
		"F",
		"G",
		"PG",
		"GF",
		"SG",
		"SG",
		"FC",
	];
	const healthy = [48, 44, 42, 40, 37, 20, 4, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0];
	const a: Args = {
		players: positions.map((position, pid) => ({
			pid,
			position,
			rosterOrder: pid,
			endurance: 0.5,
			available: pid >= 4,
		})),
		minutesByPid: Object.fromEntries(healthy.map((v, pid) => [pid, v])),
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
		coreReliance: "high",
		rotationDepth: "short",
		noInjuryMinutesIncreasePids: [4, 5, 6, 7],
	};
	const before = allocate(a);
	a.minutesByPid[0]!--;
	a.minutesByPid[9]!++;
	const after = allocate(a);
	assert.isBelow(maximumDifference(before.minutesByPid, after.minutesByPid), 3);
});
test("locked incumbents remain capped while several feasible reserves share missing minutes", () => {
	const o = allocate(ind);
	assert.isUndefined(o.allocationError);
	for (const pid of ind.noInjuryMinutesIncreasePids) {
		assert.isAtMost(
			o.minutesByPid[pid]!,
			ind.minutesByPid[String(pid) as keyof typeof ind.minutesByPid],
		);
	}
	assert.isBelow(o.minutesByPid[837]!, 35);
	assert.isAbove(o.minutesByPid[69]!, 15);
	assert.closeTo(
		Object.values(o.minutesByPid).reduce((a, b) => a + b, 0),
		240,
		1e-6,
	);
});
test("hard protection cannot be relaxed to complete an infeasible plan", () => {
	const a: Args = {
		players: Array.from({ length: 6 }, (_, pid) => ({
			pid,
			rosterOrder: pid,
			endurance: 0.5,
			available: pid !== 0,
		})),
		minutesByPid: { 0: 48, 1: 48, 2: 48, 3: 48, 4: 24, 5: 24 },
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
		noInjuryMinutesIncreasePids: [1, 2, 3, 4, 5],
	};
	const o = allocate(a);
	assert.match(o.allocationError!, /Prevent injury increase/);
	assert.deepEqual(o.protectionOverridePids, []);
	for (const pid of [1, 2, 3, 4, 5]) {
		assert.isAtMost(o.minutesByPid[pid]!, a.minutesByPid[pid]!);
	}
});
test("five eligible players may need 48 minutes each", () => {
	const a = structuredClone(lal);
	a.noInjuryMinutesIncreasePids = [];
	a.players.forEach((p, i) => (p.available = i >= 4 && i < 9));
	const o = allocate(a);
	assert.isUndefined(o.allocationError);
	for (const p of a.players) {
		assert.closeTo(o.minutesByPid[p.pid]!, p.available ? 48 : 0, 1e-6);
	}
});
test("No Ratings projection excludes hidden capability changes", () => {
	const base = { pid: 1, rosterOrder: 2, challengeNoRatings: true };
	assert.deepEqual(
		project({
			...base,
			ratings: { pos: "G", ovr: 20, endu: 10, drb: 5, pss: 8 },
		}),
		project({
			...base,
			ratings: { pos: "G", ovr: 90, endu: 95, drb: 90, pss: 88 },
		}),
	);
});
test("healthy plans and input array order remain stable", () => {
	const a = structuredClone(lal);
	a.players.forEach((p) => (p.available = true));
	assert.deepEqual(allocate(a).minutesByPid, a.minutesByPid);
	const b = structuredClone(ind);
	b.players.reverse();
	assert.deepEqual(allocate(ind), allocate(b));
});

test("playoff allowance follows public Auto phase preferences and keeps hard protection", () => {
	const a: Args = { ...structuredClone(lal), playoffs: true };
	const regular = allocate({ ...a, playoffs: false });
	const postseason = allocate(a);
	assert.isAbove(postseason.minutesByPid[382]!, regular.minutesByPid[382]!);
	const capped = allocate({ ...structuredClone(ind), playoffs: true });
	for (const pid of ind.noInjuryMinutesIncreasePids) {
		assert.isAtMost(
			capped.minutesByPid[pid]!,
			ind.minutesByPid[String(pid) as keyof typeof ind.minutesByPid],
		);
	}
});
