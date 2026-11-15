/**
 * Estimated position minutes, independent of the optional court-time chart.
 * With complete visible, already-fuzzed attributes every player gets a place on
 * the PG–C scale from his listed position and ratings, and the team's minutes
 * are filled in that order with a smooth hand-over between neighbours. Player
 * and position totals hold by construction, so who slides to another position
 * is decided across the whole team.
 * Hidden or incomplete attributes take the unchanged Stage 6 label-only path.
 */
export const ROTATION_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type RotationPosition = (typeof ROTATION_POSITIONS)[number];
// Visible attributes used by BBGM offense, defense and physical composites.
export const POSITION_RATING_KEYS = [
	"drb",
	"pss",
	"oiq",
	"spd",
	"hgt",
	"reb",
	"diq",
	"stre",
	"tp",
	"jmp",
	"dnk",
	"ins",
] as const;
export type PositionRatings = Record<
	(typeof POSITION_RATING_KEYS)[number],
	number
>;
export const getVisiblePositionRatings = (
	ratingsVisible: boolean,
	ratings: Partial<PositionRatings> | undefined,
): PositionRatings | undefined => {
	if (!ratingsVisible || !ratings) {
		return undefined;
	}
	if (
		!POSITION_RATING_KEYS.every(
			(key) =>
				typeof ratings[key] === "number" &&
				Number.isFinite(ratings[key]) &&
				ratings[key]! >= 0 &&
				ratings[key]! <= 100,
		)
	) {
		return undefined;
	}
	return Object.fromEntries(
		POSITION_RATING_KEYS.map((key) => [key, ratings[key]!]),
	) as PositionRatings;
};
// Listed positions on BBGM's own position scale.
const LABEL_VALUE: Record<string, number> = {
	PG: 0,
	G: 0.5,
	SG: 1,
	GF: 1.5,
	SF: 2,
	F: 2.5,
	PF: 3,
	FC: 3.5,
	C: 4,
};
// What separates the two positions on either side of each boundary. Weights
// start from DEV-only listed-position discriminants, with offense/interior
// terms for the visible BBGM composites. `centre` is the
// reference value on the boundary and `perPosition` converts
// log-odds to the position scale. `height` is that typical player's hgt.
const BOUNDARIES: {
	weights: Partial<PositionRatings>;
	centre: number;
	perPosition: number;
	height: number;
}[] = [
	// PG | SG: playmaking/IQ against size and off-ball shooting value
	{
		weights: {
			hgt: 0.23,
			pss: -0.14,
			drb: -0.045,
			tp: 0.15,
			stre: 0.075,
			oiq: -0.04,
		},
		centre: 5.71,
		perPosition: 3.7,
		height: 37,
	},
	// SG | SF: size first, then strength and rebounding against ball skills
	{
		weights: { hgt: 0.43, stre: 0.07, reb: 0.06, pss: -0.08, drb: -0.08 },
		centre: 18.89,
		perPosition: 4.4,
		height: 47,
	},
	// SF | PF: size, interior finishing and strength against speed
	{
		weights: {
			hgt: 0.23,
			stre: 0.03,
			reb: 0.03,
			spd: -0.11,
			tp: -0.03,
			ins: 0.06,
			dnk: 0.05,
		},
		centre: 8.01,
		perPosition: 2.9,
		height: 52,
	},
	// PF | C: rim protection, rebounding and interior play against mobility/range
	{
		weights: {
			hgt: 0.2,
			stre: 0.02,
			spd: -0.08,
			tp: -0.06,
			reb: 0.06,
			diq: 0.06,
			jmp: 0.05,
			ins: 0.05,
			dnk: 0.04,
		},
		centre: 7.52,
		perPosition: 3,
		height: 61,
	},
];
// The listed position stays the main evidence. Height is never fuzzed, so it
// counts for more than the noisier skills. Who runs the offense is mostly a
// question of playmaking, so passing and dribbling count extra at PG | SG.
const RATING_WEIGHT = 0.19;
const HEIGHT_EMPHASIS = 1.4;
const PLAYMAKING_EMPHASIS = 2.3;
// A player on the court all game is spread over this many positions either
// side of his place on the scale; others in proportion to their share of the
// game. Small differences are shared, clear ones are not, and one rating point
// can only move a little time.
const FULL_GAME_HALF_WIDTH = 0.4;
// A player who is partly above a boundary also plays the position just below
// it before reaching further down. Below 4/3, so every boundary stays solvable.
const CONTIGUITY = 1.25;

/** Where a player sits relative to each of the four boundaries between
 * adjacent positions, on the PG 0 … C 4 scale. Unknown labels use ratings. */
export const getPositionBoundaryCoordinates = (
	pos: string,
	r: PositionRatings,
): number[] => {
	const label = LABEL_VALUE[typeof pos === "string" ? pos.toUpperCase() : ""];
	// Role shape, rather than overall ability: adding the same amount to every
	// attribute of any player must leave his role coordinates unchanged.
	const mean =
		POSITION_RATING_KEYS.reduce((sum, key) => sum + r[key], 0) /
		POSITION_RATING_KEYS.length;
	const shape = Object.fromEntries(
		POSITION_RATING_KEYS.map((key) => [key, r[key] - mean + 50]),
	) as PositionRatings;
	return BOUNDARIES.map(({ weights, centre, perPosition, height }, k) => {
		let odds = 0;
		for (const key of Object.keys(weights) as (keyof PositionRatings)[]) {
			odds += weights[key]! * shape[key];
		}
		odds += (HEIGHT_EMPHASIS - 1) * weights.hgt! * (shape.hgt - height);
		if (k === 0) {
			odds +=
				(PLAYMAKING_EMPHASIS - 1) *
				(weights.pss! * (shape.pss - 53) + weights.drb! * (shape.drb - 55));
		}
		// Do not clip strong handlers to the same coordinate: their relative
		// shooting/playmaking advantages still determine who runs the offense.
		const rating = k + 0.5 + (odds - centre) / perPosition;
		return label === undefined
			? rating
			: (1 - RATING_WEIGHT) * label + RATING_WEIGHT * rating;
	});
};

export type PositionFit = "listed" | "outside" | "unknown";
export type PositionMinutesRow = {
	pid: number;
	pos: string;
	plannedSeconds: number;
	seconds: Record<RotationPosition, number>;
	fit: Record<RotationPosition, PositionFit>;
};
export type EstimatedPositionMinutes =
	| {
			valid: false;
			reason: "settings" | "courtSize" | "minutes" | "total" | "players";
			message: string;
	  }
	| {
			valid: true;
			gameMinutes: number;
			ratingsInformed?: true;
			rows: PositionMinutesRow[];
			totals: Record<RotationPosition, number>;
			outsideSeconds: number;
			unknownSeconds: number;
	  };
type AllocationInputRow = {
	pid: number;
	pos: string;
	seconds: number;
	visibleRatings?: PositionRatings;
};
const LISTED: Record<string, readonly number[]> = {
	PG: [0],
	G: [0, 1],
	SG: [1],
	GF: [1, 2],
	SF: [2],
	F: [2, 3],
	PF: [3],
	FC: [3, 4],
	C: [4],
};
const listedSlots = (code: string) =>
	LISTED[typeof code === "string" ? code.toUpperCase() : ""];
const cost = (code: string, slot: number) => {
	const listed = listedSlots(code);
	// Unknown codes carry no information about relative fit.
	if (!listed) {
		return 0;
	}
	const distance = Math.min(...listed.map((p) => Math.abs(p - slot)));
	return distance === 0
		? 0
		: 4 * distance * distance + Number(listed.length === 1);
};
const fit = (code: string, slot: number): PositionFit =>
	!listedSlots(code)
		? "unknown"
		: listedSlots(code)!.includes(slot)
			? "listed"
			: "outside";
const zero = () => ({ PG: 0, SG: 0, SF: 0, PF: 0, C: 0 });

// Same conservation-preserving second rounding as the reference court-time
// view, implemented independently so its scheduler cannot influence allocation.
const roundPlan = (
	minutes: number[],
	G: number,
	pids: number[],
): number[] | undefined => {
	const raw = minutes.map((value) => value * 60);
	const seconds = raw.map((value) => Math.min(G, Math.round(value)));
	let left = 5 * G - seconds.reduce((a, b) => a + b, 0);
	if (left === 0) {
		return seconds;
	}
	const direction = left > 0 ? 1 : -1;
	const candidates = seconds
		.map((value, i) => ({ i, residual: (raw[i]! - value) * direction }))
		.filter(({ i }) => (direction > 0 ? seconds[i]! < G : seconds[i]! > 0))
		.sort((a, b) => b.residual - a.residual || pids[a.i]! - pids[b.i]!);
	for (const { i } of candidates) {
		if (left === 0) {
			break;
		}
		seconds[i]! += direction;
		left -= direction;
	}
	return left === 0 ? seconds : undefined;
};

// Small successive-shortest-path transport. Supplies, demands and capacities
// are integer seconds; prices may be negative only for rounding remainders.
const transport = (
	supplies: number[],
	demands: number[],
	prices: number[][],
	capacities: number[][],
): number[][] | undefined => {
	type Edge = { to: number; reverse: number; capacity: number; cost: number };
	const n = supplies.length,
		width = demands.length,
		source = n + width,
		sink = source + 1,
		count = sink + 1;
	const graph: Edge[][] = Array.from({ length: count }, () => []);
	const add = (from: number, to: number, capacity: number, cost: number) => {
		const edge = { to, reverse: graph[to]!.length, capacity, cost };
		graph[from]!.push(edge);
		graph[to]!.push({
			to: from,
			reverse: graph[from]!.length - 1,
			capacity: 0,
			cost: -cost,
		});
		return edge;
	};
	const cells: Edge[][] = supplies.map(() => []);
	for (let i = 0; i < n; i++) {
		add(source, i, supplies[i]!, 0);
		for (let slot = 0; slot < width; slot++) {
			cells[i]!.push(
				add(i, n + slot, capacities[i]![slot]!, prices[i]![slot]!),
			);
		}
	}
	for (let slot = 0; slot < width; slot++) {
		add(n + slot, sink, demands[slot]!, 0);
	}
	let left = demands.reduce((a, b) => a + b, 0);
	for (let step = 0; left > 0 && step < 25 * (n + 1); step++) {
		const distance = Array<number>(count).fill(Infinity),
			via: ({ from: number; edge: number } | undefined)[] = Array(count);
		distance[source] = 0;
		for (let pass = 0; pass < count - 1; pass++) {
			let changed = false;
			for (let from = 0; from < count; from++) {
				for (const [k, e] of graph[from]!.entries()) {
					const candidate = distance[from]! + e.cost;
					if (e.capacity > 0 && candidate < distance[e.to]!) {
						distance[e.to] = candidate;
						via[e.to] = { from, edge: k };
						changed = true;
					}
				}
			}
			if (!changed) {
				break;
			}
		}
		if (!via[sink]) {
			return undefined;
		}
		let amount = left;
		for (let at = sink; at !== source; ) {
			const prev = via[at]!;
			amount = Math.min(amount, graph[prev.from]![prev.edge]!.capacity);
			at = prev.from;
		}
		for (let at = sink; at !== source; ) {
			const prev = via[at]!,
				edge = graph[prev.from]![prev.edge]!;
			edge.capacity -= amount;
			graph[at]![edge.reverse]!.capacity += amount;
			at = prev.from;
		}
		left -= amount;
	}
	return left === 0
		? cells.map((row, i) =>
				row.map((edge, slot) => capacities[i]![slot]! - edge.capacity),
			)
		: undefined;
};

// Label-only fallback: players with the same public position label provide no evidence that one
// deserves a different role mix. Pool their supply before optimizing native
// fit, then share the context-dependent result proportionally. This avoids
// identity-based outcomes such as a starting C playing only PF while a reserve
// with the identical label takes all the C minutes.
const allocateSeconds = (
	rows: AllocationInputRow[],
	G: number,
): number[][] | undefined => {
	const codes = Object.keys(LISTED);
	if (rows.some((row) => !listedSlots(row.pos))) {
		codes.push("?");
	}
	const groups = codes
		.map((code) => ({
			code,
			indexes: rows
				.map((_, i) => i)
				.filter((i) =>
					listedSlots(rows[i]!.pos)
						? rows[i]!.pos.toUpperCase() === code
						: code === "?",
				),
		}))
		.filter((g) => g.indexes.length > 0);
	const supplies = groups.map((g) =>
		g.indexes.reduce((sum, i) => sum + rows[i]!.seconds, 0),
	);
	const pooled = transport(
		supplies,
		Array(5).fill(G),
		groups.map((g) => ROTATION_POSITIONS.map((_, slot) => cost(g.code, slot))),
		supplies.map((s) => Array(5).fill(s)),
	);
	if (!pooled) {
		return undefined;
	}
	const result = rows.map(() => Array<number>(5).fill(0));
	for (const [g, group] of groups.entries()) {
		const indexes = [...group.indexes].sort(
			(a, b) => rows[a]!.pid - rows[b]!.pid,
		);
		const total = BigInt(supplies[g]!);
		const remainder: number[][] = [];
		for (const [k, i] of indexes.entries()) {
			remainder[k] = [];
			for (let slot = 0; slot < 5; slot++) {
				// BigInt keeps floor/remainder exact, even for fractional-minute plans
				// after their integer-second normalization. No floating rounding drift.
				const product = BigInt(rows[i]!.seconds) * BigInt(pooled[g]![slot]!);
				result[i]![slot] = Number(product / total);
				remainder[k]!.push(Number(product % total));
			}
		}
		const rowNeed = indexes.map(
			(i) => rows[i]!.seconds - result[i]!.reduce((a, b) => a + b, 0),
		);
		const columnNeed = ROTATION_POSITIONS.map(
			(_, slot) =>
				pooled[g]![slot]! -
				indexes.reduce((sum, i) => sum + result[i]![slot]!, 0),
		);
		// Matrix rounding: add at most one second to a fractional cell, choosing
		// the largest remainders subject to BOTH player and position totals.
		const extra = transport(
			rowNeed,
			columnNeed,
			remainder.map((row) => row.map((r) => -r)),
			remainder.map((row) => row.map((r) => Number(r > 0))),
		);
		if (!extra) {
			return undefined;
		}
		for (const [k, i] of indexes.entries()) {
			for (let slot = 0; slot < 5; slot++) {
				result[i]![slot]! += extra[k]![slot]!;
			}
		}
	}
	return result;
};

// Team-wide fill in position order. Each player's time is spread evenly over
// a short interval around his coordinate; boundary k is placed where exactly
// (4 - k) game lengths lie above it. Boundaries are solved from C down, so
// size outranks ball skills when a player's four coordinates disagree.
const allocateRoleSeconds = (
	rows: AllocationInputRow[],
	G: number,
): number[][] | undefined => {
	const order = rows
		.map((_, i) => i)
		.sort((a, b) => rows[a]!.pid - rows[b]!.pid);
	const sorted = order.map((i) => rows[i]!);
	const n = sorted.length;
	const supplies = sorted.map((r) => r.seconds);
	const coordinates = sorted.map((r) =>
		getPositionBoundaryCoordinates(r.pos, r.visibleRatings!),
	);
	const halfWidths = supplies.map((s) =>
		Math.max(1e-9, (s / G) * FULL_GAME_HALF_WIDTH),
	);
	// above[k][i]: share of player i's time above boundary k
	const above: number[][] = [];
	let floor = Array<number>(n).fill(0);
	for (let k = 3; k >= 0; k--) {
		const share = (i: number, boundary: number) =>
			Math.max(
				floor[i]!,
				Math.min(
					1,
					Math.max(
						0,
						(coordinates[i]![k]! - boundary + halfWidths[i]!) /
							(2 * halfWidths[i]!),
					),
				),
			);
		const total = (boundary: number) => {
			let sum = 0;
			for (let i = 0; i < n; i++) {
				sum += supplies[i]! * share(i, boundary);
			}
			return sum;
		};
		let low = Infinity,
			high = -Infinity;
		for (let i = 0; i < n; i++) {
			low = Math.min(low, coordinates[i]![k]! - halfWidths[i]!);
			high = Math.max(high, coordinates[i]![k]! + halfWidths[i]!);
		}
		low -= 1;
		high += 1;
		// total() is continuous and never increases: bisect to machine precision.
		const target = (4 - k) * G;
		for (let step = 0; step < 100; step++) {
			const middle = (low + high) / 2;
			if (total(middle) > target) {
				low = middle;
			} else {
				high = middle;
			}
		}
		const boundary = (low + high) / 2;
		above[k] = Array.from({ length: n }, (_, i) => share(i, boundary));
		floor = above[k]!.map((x) => Math.min(1, CONTIGUITY * x));
	}
	const work = supplies.map((s, i) => {
		const steps = [
			1,
			above[0]![i]!,
			above[1]![i]!,
			above[2]![i]!,
			above[3]![i]!,
			0,
		];
		return Array.from(
			{ length: 5 },
			(_, slot) => s * (steps[slot]! - steps[slot + 1]!),
		);
	});

	// Exact integer seconds: floor, then hand out the remaining seconds to the
	// largest remainders subject to both player and position totals.
	const rounded = work.map((row) =>
		row.map((x) => Math.max(0, Math.floor(x + 1e-9))),
	);
	const fractions = work.map((row, i) =>
		row.map((x, j) => Math.max(0, Math.round((x - rounded[i]![j]!) * 1e9))),
	);
	const rowNeed = supplies.map(
		(s, i) => s - rounded[i]!.reduce((a, b) => a + b, 0),
	);
	const columnNeed = Array.from(
		{ length: 5 },
		(_, j) => G - rounded.reduce((s, row) => s + row[j]!, 0),
	);
	if (rowNeed.some((x) => x < 0) || columnNeed.some((x) => x < 0)) {
		return undefined;
	}
	let extra: number[][] | undefined;
	// The second pass also admits cells whose fraction vanished in rounding.
	for (const loose of [false, true]) {
		extra = transport(
			rowNeed,
			columnNeed,
			fractions.map((row) => row.map((x) => -x)),
			fractions.map((row, i) =>
				row.map((x, j) => Number(x > 0 || (loose && work[i]![j]! > 1e-6))),
			),
		);
		if (extra) {
			break;
		}
	}
	if (!extra) {
		return undefined;
	}
	const result = rows.map(() => Array<number>(5).fill(0));
	for (let i = 0; i < order.length; i++) {
		for (let j = 0; j < 5; j++) {
			result[order[i]!]![j] = rounded[i]![j]! + extra[i]![j]!;
		}
	}
	return result;
};

export const buildEstimatedPositionMinutes = ({
	players,
	minutesByPid,
	numPlayersOnCourt,
	gameMinutes,
	ratingsVisible = false,
}: {
	players: {
		pid: number;
		pos: string;
		visibleRatings?: Partial<PositionRatings>;
	}[];
	minutesByPid: Record<number, number | undefined>;
	numPlayersOnCourt: number;
	gameMinutes: number;
	ratingsVisible?: boolean;
}): EstimatedPositionMinutes => {
	const G = Math.round(gameMinutes * 60);
	if (
		!Number.isInteger(numPlayersOnCourt) ||
		numPlayersOnCourt < 1 ||
		!Number.isFinite(gameMinutes) ||
		!Number.isSafeInteger(5 * G) ||
		G < 1
	) {
		return {
			valid: false,
			reason: "settings",
			message: "Position estimates are not available for these game settings.",
		};
	}
	if (numPlayersOnCourt !== 5) {
		return {
			valid: false,
			reason: "courtSize",
			message: "PG/SG/SF/PF/C estimates are available for five-player lineups.",
		};
	}
	if (
		new Set(players.map((p) => p.pid)).size !== players.length ||
		players.some((p) => !Number.isFinite(p.pid))
	) {
		return {
			valid: false,
			reason: "players",
			message: "Position estimates require distinct players.",
		};
	}
	const minutes = players.map((p) => minutesByPid[p.pid] ?? 0);
	if (
		minutes.some(
			(value) => !Number.isFinite(value) || value < 0 || value * 60 > G + 0.5,
		)
	) {
		return {
			valid: false,
			reason: "minutes",
			message:
				"Enter valid planned minutes for every player to see position estimates.",
		};
	}
	if (Math.abs(minutes.reduce((a, b) => a + b, 0) - 5 * gameMinutes) * 60 > 1) {
		return {
			valid: false,
			reason: "total",
			message:
				"Position estimates require a complete five-player minutes plan.",
		};
	}
	const seconds = roundPlan(
		minutes,
		G,
		players.map((p) => p.pid),
	);
	if (!seconds) {
		return {
			valid: false,
			reason: "total",
			message:
				"Position estimates could not preserve the planned minute totals.",
		};
	}
	const visible = ratingsVisible
		? players.map((p, i) =>
				seconds[i]! > 0
					? getVisiblePositionRatings(true, p.visibleRatings)
					: undefined,
			)
		: players.map(() => undefined);
	let informed =
		ratingsVisible &&
		players.every((_, i) => seconds[i] === 0 || visible[i] !== undefined);
	const active = players
		.map((p, i) => ({
			pid: p.pid,
			pos: p.pos,
			seconds: seconds[i]!,
			...(informed ? { visibleRatings: visible[i] } : {}),
		}))
		.filter((p) => p.seconds > 0);
	let allocated = informed
		? allocateRoleSeconds(active, G)
		: allocateSeconds(active, G);
	if (!allocated && informed) {
		informed = false;
		allocated = allocateSeconds(active, G);
	}
	if (!allocated) {
		return {
			valid: false,
			reason: "total",
			message: "Position estimates could not be allocated for this plan.",
		};
	}
	const totals = zero();
	let outsideSeconds = 0,
		unknownSeconds = 0;
	const rows = active.map((player, i) => {
		const seconds = zero(),
			fits = {} as Record<RotationPosition, PositionFit>;
		for (let slot = 0; slot < 5; slot++) {
			const pos = ROTATION_POSITIONS[slot]!,
				amount = allocated[i]![slot]!,
				kind = fit(player.pos, slot);
			seconds[pos] = amount;
			totals[pos] += amount;
			fits[pos] = kind;
			if (kind === "outside") {
				outsideSeconds += amount;
			}
			if (kind === "unknown") {
				unknownSeconds += amount;
			}
		}
		return {
			pid: player.pid,
			pos: player.pos,
			plannedSeconds: player.seconds,
			seconds,
			fit: fits,
		};
	});
	if (
		ROTATION_POSITIONS.some((p) => totals[p] !== G) ||
		rows.some(
			(r) =>
				Object.values(r.seconds).some((s) => !Number.isInteger(s) || s < 0) ||
				Object.values(r.seconds).reduce((a, b) => a + b, 0) !==
					r.plannedSeconds,
		)
	) {
		return {
			valid: false,
			reason: "total",
			message:
				"Position estimates could not preserve the planned minute totals.",
		};
	}
	return {
		valid: true,
		...(informed ? { ratingsInformed: true as const } : {}),
		gameMinutes: G / 60,
		rows,
		totals,
		outsideSeconds,
		unknownSeconds,
	};
};

/** Balanced whole-minute display: round cells and player totals jointly, keeping
 * every position total exact. A sixth, temporary rounding column chooses which
 * fractional player totals round down; it is never a basketball role. */
export const getPositionMinutesDisplay = (
	allocation: Extract<EstimatedPositionMinutes, { valid: true }>,
) => {
	const G = allocation.gameMinutes;
	const exact = () => ({
		wholeMinutes: false,
		rows: allocation.rows.map((r) => ({
			pid: r.pid,
			values: r.seconds,
			total: r.plannedSeconds,
		})),
		totals: allocation.totals,
	});
	if (!Number.isInteger(G)) {
		return exact();
	}
	const rows = [...allocation.rows].sort((a, b) => a.pid - b.pid);
	const floors = rows.map((r) =>
		ROTATION_POSITIONS.map((p) => Math.floor(r.seconds[p] / 60)),
	);
	const fractions = rows.map((r) =>
		ROTATION_POSITIONS.map((p) => r.seconds[p] % 60),
	);
	const supplies = rows.map(
		(r, i) =>
			Math.ceil(r.plannedSeconds / 60) - floors[i]!.reduce((s, x) => s + x, 0),
	);
	const needs = ROTATION_POSITIONS.map(
		(_, j) => G - floors.reduce((s, row) => s + row[j]!, 0),
	);
	const dummy =
		supplies.reduce((s, x) => s + x, 0) - needs.reduce((s, x) => s + x, 0);
	const extra = transport(
		supplies,
		[...needs, dummy],
		fractions.map((row, i) => [
			...row.map((x) => -x),
			10 * (rows[i]!.plannedSeconds % 60),
		]),
		fractions.map((row, i) => [
			...row.map((x) => Number(x > 0)),
			Number(rows[i]!.plannedSeconds % 60 > 0),
		]),
	);
	if (!extra) {
		return exact();
	}
	const rounded = new Map(
		rows.map((r, i) => {
			const values = Object.fromEntries(
				ROTATION_POSITIONS.map((p, j) => [p, floors[i]![j]! + extra[i]![j]!]),
			) as Record<RotationPosition, number>;
			return [
				r.pid,
				{
					pid: r.pid,
					values,
					total: Object.values(values).reduce((s, x) => s + x, 0),
				},
			];
		}),
	);
	return {
		wholeMinutes: true,
		rows: allocation.rows.map((r) => rounded.get(r.pid)!),
		totals: Object.fromEntries(ROTATION_POSITIONS.map((p) => [p, G])) as Record<
			RotationPosition,
			number
		>,
	};
};
