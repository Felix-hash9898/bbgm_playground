import type {
	BasketballMinutesOverrideContext,
	BasketballRotation,
	Player,
	Team,
} from "../../../common/types.ts";
import { getAutoMinutesSoftCap } from "../GameSim.basketball/getMinutesLimitFactor.ts";
import fuzzRating from "../player/fuzzRating.ts";

const EPSILON = 1e-7;
const MINUTES_IN_STANDARD_GAME = 48;

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export type BasketballRotationDepth = "short" | "normal" | "long";
export type BasketballCoreReliance = "high" | "balanced" | "low";
export type BasketballRotationRole = "handler" | "interior" | "wing";

const DEFAULT_ROTATION_DEPTH: BasketballRotationDepth = "normal";
const DEFAULT_CORE_RELIANCE: BasketballCoreReliance = "balanced";

const DEPTH_REACH: Record<
	BasketballRotationDepth,
	{ regularPreferred: number; playoffPreferred: number; maxReach: number }
> = {
	short: { regularPreferred: 9, playoffPreferred: 8, maxReach: 10 },
	normal: { regularPreferred: 11, playoffPreferred: 10, maxReach: 12 },
	long: { regularPreferred: 12, playoffPreferred: 11, maxReach: 13 },
};

const RELIANCE_PARAMETERS: Record<
	BasketballCoreReliance,
	{ regularExponent: number; playoffExponent: number; reserveShare: number }
> = {
	high: { regularExponent: 1.55, playoffExponent: 1.8, reserveShare: 0.2 },
	balanced: {
		regularExponent: 1.25,
		playoffExponent: 1.5,
		reserveShare: 0.4,
	},
	low: { regularExponent: 1, playoffExponent: 1.2, reserveShare: 0.67 },
};

const COVERAGE_REACH: Record<BasketballRotationDepth, number> = {
	short: 2,
	normal: 3,
	long: 5,
};

const INCUMBENT_PROMOTION_EXTRA: Record<BasketballCoreReliance, number> = {
	high: 3,
	balanced: 2,
	low: 1,
};

const EXTENDED_INCUMBENT_EXTRA: Record<BasketballCoreReliance, number> = {
	high: 4,
	balanced: 3,
	low: 2,
};

const EXTENDED_RESERVE_EXTRA: Record<BasketballCoreReliance, number> = {
	high: 2,
	balanced: 3,
	low: 4,
};

export type BasketballMinutesPlayer = {
	pid: number;
	rosterOrder: number;
	/** Endurance on a 0-1 scale. The caller decides whether this is fuzzed. */
	endurance: number;
	/** Current OVR, used only as a transient current-roster quality signal. */
	ovr?: number;
	/** League-relative current-OVR percentile supplied by the caller's context. */
	ovrPercentile?: number;
	position?: string;
	/** Transient role scores derived from existing BBGM ratings; never persisted. */
	roleScores?: Partial<Record<BasketballRotationRole, number>>;
	/** Existing value signal fallback for callers without current OVR. */
	value?: number;
};

/**
 * Derive a small, transient role signal from the existing BBGM ratings. This
 * is intentionally not a persisted player role model and is only used while
 * covering a current injury vacancy.
 */
export const getBasketballRoleScores = (
	ratings: Record<string, number | undefined>,
) => {
	const rating = (key: string) => {
		const value = ratings[key];
		return typeof value === "number" && Number.isFinite(value)
			? clamp(value / 100, 0, 1)
			: undefined;
	};
	const keys = [
		"drb",
		"pss",
		"oiq",
		"hgt",
		"reb",
		"diq",
		"stre",
		"spd",
		"jmp",
		"tp",
	];
	if (!keys.some((key) => rating(key) !== undefined)) {
		return;
	}
	const average = (names: string[]) => {
		const values = names
			.map((name) => rating(name))
			.filter((value): value is number => value !== undefined);
		return values.length > 0
			? values.reduce((total, value) => total + value, 0) / values.length
			: undefined;
	};
	return {
		handler: average(["drb", "pss", "oiq", "spd"]),
		interior: average(["hgt", "reb", "diq", "stre"]),
		wing: average(["spd", "tp", "drb", "diq"]),
	};
};

/**
 * Build the exact transient inputs shared by the Roster preview and GameSim.
 * Callers pass either raw ratings (useFuzzedRatings=true for a user team) or
 * the already fuzzed ratings returned by playersPlus. No ratings means no
 * hidden OVR/ability signal is made available to the allocator.
 */
export const getBasketballRotationPlayerInput = ({
	pid,
	rosterOrder,
	ratings,
	challengeNoRatings = false,
	useFuzzedRatings = false,
	ovrPercentile,
}: {
	pid: number;
	rosterOrder: number;
	ratings: Record<string, unknown>;
	challengeNoRatings?: boolean;
	useFuzzedRatings?: boolean;
	ovrPercentile?: number;
}): BasketballMinutesPlayer => {
	const position = typeof ratings.pos === "string" ? ratings.pos : undefined;
	if (challengeNoRatings) {
		return {
			pid,
			rosterOrder,
			endurance: 0.5,
			position,
		};
	}

	const fuzz =
		typeof ratings.fuzz === "number" && Number.isFinite(ratings.fuzz)
			? ratings.fuzz
			: 0;
	const getRating = (key: string) => {
		const value = ratings[key];
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return undefined;
		}
		return useFuzzedRatings && key !== "hgt" ? fuzzRating(value, fuzz) : value;
	};
	const allowedRatings = Object.fromEntries(
		["drb", "pss", "oiq", "hgt", "reb", "diq", "stre", "spd", "jmp", "tp"].map(
			(key) => [key, getRating(key)],
		),
	) as Record<string, number | undefined>;
	const ovr = getRating("ovr");
	const endurance = getRating("endu");
	return {
		pid,
		rosterOrder,
		endurance: endurance === undefined ? 0.5 : clamp(endurance / 100, 0, 1),
		...(ovr === undefined ? {} : { ovr }),
		...(ovrPercentile === undefined ? {} : { ovrPercentile }),
		position,
		roleScores: getBasketballRoleScores(allowedRatings),
	};
};

type OrderedPlayer = BasketballMinutesPlayer & {
	index: number;
};

const getOrderedPlayers = <T extends BasketballMinutesPlayer>(players: T[]) =>
	players
		.map((player, index) => ({ ...player, index }))
		.sort(
			(a, b) =>
				a.rosterOrder - b.rosterOrder || a.pid - b.pid || a.index - b.index,
		);

const smoothstep = (edge0: number, edge1: number, value: number) => {
	if (edge1 <= edge0) {
		return value >= edge1 ? 1 : 0;
	}
	const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
	return x * x * (3 - 2 * x);
};

const getRotationProfile = (
	rotation?:
		| Pick<BasketballRotation, "rotationDepth" | "coreReliance">
		| undefined,
) => ({
	rotationDepth: rotation?.rotationDepth ?? DEFAULT_ROTATION_DEPTH,
	coreReliance: rotation?.coreReliance ?? DEFAULT_CORE_RELIANCE,
});

export const getBasketballOvrPercentiles = (
	players: Pick<BasketballMinutesPlayer, "pid" | "ovr">[],
) => {
	const values = players.map((player) => ({
		pid: player.pid,
		ovr: player.ovr,
	}));
	if (
		values.some(({ ovr }) => typeof ovr !== "number" || !Number.isFinite(ovr))
	) {
		return;
	}
	const sorted = [...values].sort((a, b) => a.ovr! - b.ovr! || a.pid - b.pid);
	return new Map(
		sorted.map((player, index) => [
			player.pid,
			sorted.length > 1 ? index / (sorted.length - 1) : 0.5,
		]),
	);
};

/**
 * League-relative fuzzed current-OVR percentiles, the single user-visible
 * quality context shared by API validation, the Roster preview, reconcile, and
 * GameSim/loadTeams. Callers must not use this in challenge-no-ratings mode.
 */
export const getLeagueRotationOvrPercentiles = (
	players: {
		pid: number;
		tid: number;
		ratings: { ovr: number; fuzz: number }[];
	}[],
) =>
	getBasketballOvrPercentiles(
		players
			.filter((p) => p.tid >= 0)
			.map((p) => {
				const ratings = p.ratings.at(-1)!;
				return {
					pid: p.pid,
					ovr: fuzzRating(ratings.ovr, ratings.fuzz),
				};
			}),
	);

const getOvrPercentiles = (players: BasketballMinutesPlayer[]) => {
	const supplied = players.map((player) => ({
		pid: player.pid,
		ovr: player.ovrPercentile,
	}));
	if (
		supplied.every(({ ovr }) => typeof ovr === "number" && Number.isFinite(ovr))
	) {
		return new Map(supplied.map(({ pid, ovr }) => [pid, clamp(ovr!, 0, 1)]));
	}
	return getBasketballOvrPercentiles(players);
};

const getQualityFactor = ({
	quality,
	rosterIndex,
	preferredDepth,
	hasOvr,
}: {
	quality: number;
	rosterIndex: number;
	preferredDepth: number;
	hasOvr: boolean;
}) => {
	if (!hasOvr) {
		return 1;
	}
	const gate = smoothstep(0.2, 0.5, clamp(quality, 0, 1));
	const tailStart = Math.max(0, preferredDepth - 3);
	if (rosterIndex >= tailStart) {
		const factor = 0.035 + 1.2 * gate;
		return rosterIndex >= preferredDepth ? factor * 0.8 : factor;
	}
	return 1;
};

const ROLE_NAMES: BasketballRotationRole[] = ["handler", "interior", "wing"];

const getPositionRoleAffinities = (position = "") => {
	const normalized = position.toUpperCase();
	return {
		handler: normalized.includes("G") ? 1 : 0.25,
		interior: normalized.includes("C")
			? 1
			: normalized.includes("F")
				? 0.65
				: 0.2,
		wing: normalized.includes("F") ? 1 : normalized.includes("G") ? 0.65 : 0.25,
	};
};

const getRoleDemand = (
	players: OrderedPlayer[],
	baseMinutes: Map<number, number>,
	available: Set<number>,
) => {
	const demand = Object.fromEntries(
		ROLE_NAMES.map((role) => [role, 0]),
	) as Record<BasketballRotationRole, number>;
	let total = 0;
	for (const player of players) {
		if (available.has(player.pid)) {
			continue;
		}
		const minutes = baseMinutes.get(player.pid) ?? 0;
		if (minutes <= EPSILON || !player.position) {
			continue;
		}
		const affinities = getPositionRoleAffinities(player.position);
		for (const role of ROLE_NAMES) {
			demand[role] += minutes * affinities[role];
		}
		total += minutes;
	}
	if (total <= EPSILON) {
		return;
	}
	return Object.fromEntries(
		ROLE_NAMES.map((role) => [role, demand[role] / total]),
	) as Record<BasketballRotationRole, number>;
};

const getRoleFit = (
	player: BasketballMinutesPlayer,
	demand: Record<BasketballRotationRole, number> | undefined,
) => {
	if (!demand || !player.position) {
		return 1;
	}
	const affinities = getPositionRoleAffinities(player.position);
	return ROLE_NAMES.reduce((total, role) => {
		const rating = player.roleScores?.[role];
		const abilityFactor =
			rating === undefined
				? 1
				: 0.25 + 0.75 * smoothstep(0.18, 0.38, clamp(rating, 0, 1));
		return total + demand[role]! * affinities[role] * abilityFactor;
	}, 0);
};

const getAutomaticReserveOrder = ({
	players,
	minutesByPid,
	automaticMinutesByPid,
}: {
	players: OrderedPlayer[];
	minutesByPid: Map<number, number>;
	automaticMinutesByPid: Record<number, number>;
}) => {
	return players
		.filter((player) => (minutesByPid.get(player.pid) ?? 0) <= EPSILON)
		.sort(
			(a, b) =>
				(automaticMinutesByPid[b.pid] ?? 0) -
					(automaticMinutesByPid[a.pid] ?? 0) ||
				a.rosterOrder - b.rosterOrder ||
				a.pid - b.pid,
		);
};

const allocateWeighted = ({
	players,
	weights,
	total,
	cap,
}: {
	players: OrderedPlayer[];
	weights: Map<number, number>;
	total: number;
	cap: number;
}) => {
	if (players.length * cap < total - EPSILON) {
		throw new Error("Not enough players to allocate basketball minutes");
	}

	const values = new Map(players.map((p) => [p.pid, 0]));
	let remaining = total;
	let adjustable = [...players];

	while (remaining > EPSILON && adjustable.length > 0) {
		let weightTotal = adjustable.reduce(
			(sum, p) => sum + Math.max(0, weights.get(p.pid) ?? 0),
			0,
		);
		const useEqualWeights = weightTotal <= EPSILON;
		if (useEqualWeights) {
			weightTotal = adjustable.length;
		}

		const newlyCapped = new Set<number>();
		for (const p of adjustable) {
			const weight = Math.max(0, weights.get(p.pid) ?? 0);
			const share =
				remaining *
				(useEqualWeights ? 1 / adjustable.length : weight / weightTotal);
			if (share >= cap - EPSILON) {
				values.set(p.pid, cap);
				newlyCapped.add(p.pid);
			}
		}

		if (newlyCapped.size === 0) {
			for (const p of adjustable) {
				const weight = Math.max(0, weights.get(p.pid) ?? 0);
				values.set(
					p.pid,
					remaining *
						(useEqualWeights ? 1 / adjustable.length : weight / weightTotal),
				);
			}
			remaining = 0;
			break;
		}

		remaining -= newlyCapped.size * cap;
		adjustable = adjustable.filter((p) => !newlyCapped.has(p.pid));
	}

	return values;
};

const allocateWeightedWithCaps = ({
	players,
	weights,
	total,
	caps,
}: {
	players: OrderedPlayer[];
	weights: Map<number, number>;
	total: number;
	caps: Map<number, number>;
}) => {
	const values = new Map(players.map((p) => [p.pid, 0]));
	let remaining = total;
	let adjustable = players.filter((p) => (caps.get(p.pid) ?? 0) > EPSILON);

	while (remaining > EPSILON && adjustable.length > 0) {
		let weightTotal = adjustable.reduce(
			(sum, p) => sum + Math.max(0, weights.get(p.pid) ?? 0),
			0,
		);
		const useEqualWeights = weightTotal <= EPSILON;
		if (useEqualWeights) {
			weightTotal = adjustable.length;
		}

		const newlyCapped = new Set<number>();
		let cappedTotal = 0;
		for (const p of adjustable) {
			const capacity = Math.max(0, caps.get(p.pid) ?? 0);
			const weight = Math.max(0, weights.get(p.pid) ?? 0);
			const share =
				remaining *
				(useEqualWeights ? 1 / adjustable.length : weight / weightTotal);
			if (share >= capacity - EPSILON) {
				values.set(p.pid, capacity);
				newlyCapped.add(p.pid);
				cappedTotal += capacity;
			}
		}

		if (newlyCapped.size === 0) {
			for (const p of adjustable) {
				const capacity = Math.max(0, caps.get(p.pid) ?? 0);
				const weight = Math.max(0, weights.get(p.pid) ?? 0);
				values.set(
					p.pid,
					Math.min(
						capacity,
						remaining *
							(useEqualWeights ? 1 / adjustable.length : weight / weightTotal),
					),
				);
			}
			remaining = 0;
			break;
		}

		remaining -= cappedTotal;
		adjustable = adjustable.filter((p) => !newlyCapped.has(p.pid));
	}

	if (remaining > EPSILON) {
		throw new Error("Not enough players to allocate basketball minutes");
	}

	return values;
};

const roundAllocation = ({
	players,
	values,
	total,
	cap,
	increment,
}: {
	players: OrderedPlayer[];
	values: Map<number, number>;
	total: number;
	cap: number;
	increment: number;
}) => {
	const totalUnits = Math.round(total / increment);
	const capUnits = Math.round(cap / increment);
	const units = new Map<number, number>();
	let allocatedUnits = 0;

	for (const p of players) {
		const valueUnits = clamp((values.get(p.pid) ?? 0) / increment, 0, capUnits);
		const floor = Math.floor(valueUnits + EPSILON);
		units.set(p.pid, floor);
		allocatedUnits += floor;
	}

	// Do not let a zero-weight deep player receive a rounding unit. Otherwise a
	// perfectly intentional finite rotation can grow a meaningless 0.5-minute
	// tail merely because the positive weights' fractional remainders sum below
	// the exact team total.
	const remainderPlayers = players.filter(
		(p) => (values.get(p.pid) ?? 0) > EPSILON,
	);
	const byRemainder = [
		...(remainderPlayers.length > 0 ? remainderPlayers : players),
	].sort((a, b) => {
		const aUnits = clamp((values.get(a.pid) ?? 0) / increment, 0, capUnits);
		const bUnits = clamp((values.get(b.pid) ?? 0) / increment, 0, capUnits);
		return (
			bUnits - Math.floor(bUnits) - (aUnits - Math.floor(aUnits)) ||
			a.rosterOrder - b.rosterOrder ||
			a.pid - b.pid
		);
	});

	let cursor = 0;
	while (allocatedUnits < totalUnits) {
		const p = byRemainder[cursor % byRemainder.length]!;
		const current = units.get(p.pid) ?? 0;
		if (current < capUnits) {
			units.set(p.pid, current + 1);
			allocatedUnits += 1;
		}
		cursor += 1;
		if (cursor > totalUnits * players.length * 2) {
			throw new Error("Unable to round basketball minutes allocation");
		}
	}

	return Object.fromEntries(
		players.map((p) => [p.pid, (units.get(p.pid) ?? 0) * increment]),
	) as Record<number, number>;
};

const allocateAndRound = ({
	players,
	weights,
	total,
	cap,
	increment,
}: {
	players: OrderedPlayer[];
	weights: Map<number, number>;
	total: number;
	cap: number;
	increment: number;
}) =>
	roundAllocation({
		players,
		values: allocateWeighted({ players, weights, total, cap }),
		total,
		cap,
		increment,
	});

const allocateAndRoundWithCaps = ({
	players,
	weights,
	total,
	caps,
}: {
	players: OrderedPlayer[];
	weights: Map<number, number>;
	total: number;
	caps: Map<number, number>;
}) =>
	roundAllocation({
		players,
		values: allocateWeightedWithCaps({ players, weights, total, caps }),
		total,
		cap: MINUTES_IN_STANDARD_GAME,
		increment: 1,
	});

export const generateBasketballAutoMinutes = ({
	players,
	numPlayersOnCourt,
	playoffs,
	rotationDepth = DEFAULT_ROTATION_DEPTH,
	coreReliance = DEFAULT_CORE_RELIANCE,
}: {
	players: BasketballMinutesPlayer[];
	numPlayersOnCourt: number;
	playoffs: boolean;
	rotationDepth?: BasketballRotationDepth;
	coreReliance?: BasketballCoreReliance;
}) => {
	if (!Number.isInteger(numPlayersOnCourt) || numPlayersOnCourt < 1) {
		throw new Error("numPlayersOnCourt must be a positive integer");
	}
	if (new Set(players.map((p) => p.pid)).size !== players.length) {
		throw new Error("Basketball minute player IDs must be unique");
	}

	const ordered = getOrderedPlayers(players);
	const required = MINUTES_IN_STANDARD_GAME * numPlayersOnCourt;
	if (ordered.length < numPlayersOnCourt) {
		// This can temporarily happen after the user releases players. An exact
		// plan is mathematically impossible until the roster is repaired, but the
		// roster view still needs a safe derived Auto plan instead of crashing.
		return Object.fromEntries(
			ordered.map((p) => [p.pid, MINUTES_IN_STANDARD_GAME]),
		) as Record<number, number>;
	}
	const reach = DEPTH_REACH[rotationDepth];
	const preferredDepth = Math.min(
		ordered.length,
		Math.max(
			numPlayersOnCourt,
			playoffs ? reach.playoffPreferred : reach.regularPreferred,
		),
	);
	const ovrPercentiles = getOvrPercentiles(ordered);
	const hasOvr = ovrPercentiles !== undefined;
	// Without OVR (for example, a low-information test or a legacy caller),
	// retain the established BBGM finite-depth allocator exactly. Current OVR is
	// an additional signal only when the current roster supplies it completely.
	const maxReach = Math.min(
		ordered.length,
		Math.max(numPlayersOnCourt, hasOvr ? reach.maxReach : preferredDepth),
	);
	const reliance = RELIANCE_PARAMETERS[coreReliance];
	const weightExponent = playoffs
		? reliance.playoffExponent
		: reliance.regularExponent;
	const weights = new Map(
		ordered.map((p, rosterIndex) => [
			p.pid,
			rosterIndex < maxReach
				? getAutoMinutesSoftCap({
						availablePlayers: ordered.length,
						endurance: clamp(p.endurance, 0, 1),
						playoffs,
						ptModifier: 1,
						regulationMinutes: MINUTES_IN_STANDARD_GAME,
						rosterIndex,
					}) **
						weightExponent *
					getQualityFactor({
						quality: ovrPercentiles?.get(p.pid) ?? 0.5,
						rosterIndex,
						preferredDepth,
						hasOvr,
					})
				: 0,
		]),
	);

	// The BBGM soft caps remain the allocator's main signal. The profile only
	// changes the finite reach/exponent and adds a small current-OVR-sensitive tail;
	// Dynamic still consumes the resulting planned minutes unchanged.
	return allocateAndRound({
		players: ordered,
		weights,
		total: required,
		cap: MINUTES_IN_STANDARD_GAME,
		increment: 1,
	});
};

export const validateBasketballMinutes = ({
	players,
	minutesByPid,
	numPlayersOnCourt,
	requireExactTotal = false,
}: {
	players: Pick<BasketballMinutesPlayer, "pid">[];
	minutesByPid: Record<number, number>;
	numPlayersOnCourt: number;
	requireExactTotal?: boolean;
}) => {
	const expectedPids = new Set(players.map((p) => String(p.pid)));
	const actualPids = Object.keys(minutesByPid);
	if (
		actualPids.length !== expectedPids.size ||
		actualPids.some((pid) => !expectedPids.has(pid))
	) {
		return "Minutes must be provided for every player on the current roster";
	}

	let total = 0;
	for (const p of players) {
		const value = minutesByPid[p.pid];
		if (
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			!Number.isInteger(value) ||
			value < 0 ||
			value > 48
		) {
			return "Each player's planned minutes must be an integer between 0 and 48";
		}
		total += value;
	}

	if (requireExactTotal) {
		const required = MINUTES_IN_STANDARD_GAME * numPlayersOnCourt;
		if (Math.abs(total - required) > EPSILON) {
			return `Planned minutes must total ${required}`;
		}
	}
};

export const validateBasketballMinutesForGame = ({
	players,
	minutesByPid,
	numPlayersOnCourt,
}: {
	players: Pick<BasketballMinutesPlayer, "pid">[];
	minutesByPid: Record<number, number>;
	numPlayersOnCourt: number;
}) =>
	validateBasketballMinutes({
		players,
		minutesByPid,
		numPlayersOnCourt,
		requireExactTotal: true,
	});

export const getBasketballGameAvailability = ({
	players,
	playThroughInjuries,
	numPlayersOnCourt,
}: {
	players: { injury: { gamesRemaining: number } }[];
	playThroughInjuries: number;
	numPlayersOnCourt: number;
}) => {
	const unavailable = players.map(
		(p) => p.injury.gamesRemaining > playThroughInjuries,
	);
	const numAvailable = unavailable.filter((value) => !value).length;

	// Match loadTeams: when there are not enough genuinely healthy players to
	// field a lineup, the game allows everyone to play through an injury.
	return unavailable.map((value) => numAvailable < numPlayersOnCourt || !value);
};

export const getBasketballMinutesOverrideContext = ({
	players,
	available,
	numPlayersOnCourt,
	regulationMinutes,
}: {
	players: Pick<BasketballMinutesPlayer, "pid">[];
	available: ReadonlySet<number>;
	numPlayersOnCourt: number;
	regulationMinutes: number;
}): BasketballMinutesOverrideContext => ({
	rosterPids: players.map((p) => p.pid).sort((a, b) => a - b),
	unavailablePids: players
		.filter((p) => !available.has(p.pid))
		.map((p) => p.pid)
		.sort((a, b) => a - b),
	numPlayersOnCourt,
	regulationMinutes,
});

export const currentMinutesOverrideContextMatches = (
	a: BasketballMinutesOverrideContext | undefined,
	b: BasketballMinutesOverrideContext,
) =>
	a !== undefined &&
	a.numPlayersOnCourt === b.numPlayersOnCourt &&
	a.regulationMinutes === b.regulationMinutes &&
	a.rosterPids.length === b.rosterPids.length &&
	a.unavailablePids.length === b.unavailablePids.length &&
	a.rosterPids.every((pid, index) => pid === b.rosterPids[index]) &&
	a.unavailablePids.every((pid, index) => pid === b.unavailablePids[index]);

type ApplyCurrentMinutesOverridesResult = {
	minutesByPid: Record<number, number>;
	activeCurrentMinutesOverrideByPid?: Record<number, number>;
	currentMinutesOverrideError?: string;
	protectionOverridePids?: number[];
};

const applyCurrentMinutesOverrides = ({
	players,
	available,
	automaticMinutesByPid,
	baseMinutes,
	protectedPids,
	ordinaryMaximumByPid,
	extendedMaximumByPid,
	reservePromotionOrderPids,
	numPlayersOnCourt,
	regulationMinutes,
	targetTotalMinutes,
	currentMinutesOverrideByPid,
	currentMinutesOverrideContext,
}: {
	players: OrderedPlayer[];
	available: ReadonlySet<number>;
	automaticMinutesByPid: Record<number, number>;
	baseMinutes: ReadonlyMap<number, number>;
	protectedPids: ReadonlySet<number>;
	ordinaryMaximumByPid?: ReadonlyMap<number, number>;
	extendedMaximumByPid?: ReadonlyMap<number, number>;
	reservePromotionOrderPids?: readonly number[];
	numPlayersOnCourt: number;
	regulationMinutes: number;
	targetTotalMinutes: number;
	currentMinutesOverrideByPid?: Record<number, number>;
	currentMinutesOverrideContext?: BasketballMinutesOverrideContext;
}): ApplyCurrentMinutesOverridesResult => {
	const hasOverrides =
		currentMinutesOverrideByPid !== undefined &&
		Object.keys(currentMinutesOverrideByPid).length > 0;
	if (!hasOverrides) {
		return { minutesByPid: automaticMinutesByPid };
	}

	const context = getBasketballMinutesOverrideContext({
		players,
		available,
		numPlayersOnCourt,
		regulationMinutes,
	});
	if (
		!currentMinutesOverrideContextMatches(
			currentMinutesOverrideContext,
			context,
		)
	) {
		return { minutesByPid: automaticMinutesByPid };
	}

	const playerByPid = new Map(players.map((p) => [p.pid, p]));
	const pinned = new Map<number, number>();
	for (const [pidString, value] of Object.entries(
		currentMinutesOverrideByPid!,
	)) {
		const pid = Number(pidString);
		if (!playerByPid.has(pid)) {
			return {
				minutesByPid: automaticMinutesByPid,
				currentMinutesOverrideError:
					"Current minutes include a player who is no longer on the roster",
			};
		}
		if (
			!available.has(pid) ||
			typeof value !== "number" ||
			!Number.isFinite(value) ||
			value < 0 ||
			value > regulationMinutes
		) {
			return {
				minutesByPid: automaticMinutesByPid,
				currentMinutesOverrideError:
					"Current minutes must target available players between 0 and the game length",
			};
		}
		if (
			protectedPids.has(pid) &&
			value > (baseMinutes.get(pid) ?? 0) + EPSILON
		) {
			return {
				minutesByPid: automaticMinutesByPid,
				currentMinutesOverrideError:
					"Disable Prevent injury increase before setting this player's current minutes above the healthy plan",
			};
		}
		pinned.set(pid, value);
	}

	const required = targetTotalMinutes;
	const pinnedTotal = Array.from(pinned.values()).reduce(
		(total, value) => total + value,
		0,
	);
	if (pinnedTotal > required + EPSILON) {
		return {
			minutesByPid: automaticMinutesByPid,
			currentMinutesOverrideError:
				"Current minute overrides exceed the team's regulation total",
		};
	}

	const candidates = players.filter(
		(p) => available.has(p.pid) && !pinned.has(p.pid),
	);
	const activeCandidates = candidates.filter(
		(p) => (automaticMinutesByPid[p.pid] ?? 0) > EPSILON,
	);
	const inactiveCandidates = candidates.filter(
		(p) => (automaticMinutesByPid[p.pid] ?? 0) <= EPSILON,
	);
	const inactiveByPid = new Map(inactiveCandidates.map((p) => [p.pid, p]));
	const promotionOrder =
		reservePromotionOrderPids ??
		inactiveCandidates
			.slice()
			.sort(
				(a, b) =>
					a.rosterOrder - b.rosterOrder || a.pid - b.pid || a.index - b.index,
			)
			.map((p) => p.pid);
	const promotionCandidates = promotionOrder
		.map((pid) => inactiveByPid.get(pid))
		.filter(
			(p): p is OrderedPlayer => p !== undefined && !protectedPids.has(p.pid),
		);
	const adjusted = new Map(
		players.map((p) => [
			p.pid,
			available.has(p.pid) ? (automaticMinutesByPid[p.pid] ?? 0) : 0,
		]),
	);
	for (const [pid, value] of pinned) {
		adjusted.set(pid, value);
	}
	let delta =
		required -
		Array.from(adjusted.values()).reduce((total, value) => total + value, 0);
	if (Math.abs(delta) > EPSILON && candidates.length === 0) {
		return {
			minutesByPid: automaticMinutesByPid,
			currentMinutesOverrideError:
				"Leave at least one available player for the remaining minutes",
		};
	}

	const weights = new Map(
		candidates.map((p) => [
			p.pid,
			Math.max(
				automaticMinutesByPid[p.pid] ?? 0,
				baseMinutes.get(p.pid) ?? 0,
				0.001,
			),
		]),
	);
	const addToMaximum = (
		maximumFor: (p: OrderedPlayer) => number,
		allowed: (p: OrderedPlayer) => boolean = () => true,
		pool: OrderedPlayer[] = candidates,
	) => {
		if (delta <= EPSILON) {
			return;
		}
		const adjustable = pool.filter(
			(p) => allowed(p) && maximumFor(p) - (adjusted.get(p.pid) ?? 0) > EPSILON,
		);
		if (adjustable.length === 0) {
			return;
		}
		const caps = new Map(
			adjustable.map((p) => [
				p.pid,
				Math.max(0, maximumFor(p) - (adjusted.get(p.pid) ?? 0)),
			]),
		);
		const totalCapacity = Array.from(caps.values()).reduce(
			(total, value) => total + value,
			0,
		);
		const total = Math.min(delta, totalCapacity);
		if (total <= EPSILON) {
			return;
		}
		const additions = allocateWeightedWithCaps({
			players: adjustable,
			weights,
			total,
			caps,
		});
		for (const p of adjustable) {
			adjusted.set(
				p.pid,
				(adjusted.get(p.pid) ?? 0) + (additions.get(p.pid) ?? 0),
			);
		}
		delta -= total;
	};

	if (delta > EPSILON) {
		const ordinaryMaximum = (p: OrderedPlayer) =>
			ordinaryMaximumByPid?.get(p.pid) ??
			(protectedPids.has(p.pid)
				? (baseMinutes.get(p.pid) ?? 0)
				: regulationMinutes);
		const extendedMaximum = (p: OrderedPlayer) =>
			extendedMaximumByPid?.get(p.pid) ?? ordinaryMaximum(p);
		addToMaximum(ordinaryMaximum, () => true, activeCandidates);
		addToMaximum(extendedMaximum, () => true, activeCandidates);
		for (const p of promotionCandidates) {
			addToMaximum(ordinaryMaximum, () => true, [p]);
			if ((adjusted.get(p.pid) ?? 0) > EPSILON) {
				addToMaximum(extendedMaximum, () => true, [p]);
			}
		}
		addToMaximum(
			() => regulationMinutes,
			(p) => !protectedPids.has(p.pid),
			activeCandidates,
		);
		for (const p of promotionCandidates) {
			addToMaximum(
				() => regulationMinutes,
				() => true,
				[p],
			);
			if (delta <= EPSILON) {
				break;
			}
		}
	} else if (delta < -EPSILON) {
		let excess = -delta;
		const reduceToFloor = (floorFor: (p: OrderedPlayer) => number) => {
			if (excess <= EPSILON) {
				return;
			}
			const adjustable = candidates.filter(
				(p) => (adjusted.get(p.pid) ?? 0) - floorFor(p) > EPSILON,
			);
			if (adjustable.length === 0) {
				return;
			}
			const caps = new Map(
				adjustable.map((p) => [
					p.pid,
					Math.max(0, (adjusted.get(p.pid) ?? 0) - floorFor(p)),
				]),
			);
			const totalCapacity = Array.from(caps.values()).reduce(
				(total, value) => total + value,
				0,
			);
			const total = Math.min(excess, totalCapacity);
			if (total <= EPSILON) {
				return;
			}
			const reductions = allocateWeightedWithCaps({
				players: adjustable,
				weights: caps,
				total,
				caps,
			});
			for (const p of adjustable) {
				adjusted.set(
					p.pid,
					(adjusted.get(p.pid) ?? 0) - (reductions.get(p.pid) ?? 0),
				);
			}
			excess -= total;
		};
		reduceToFloor((p) =>
			Math.min(adjusted.get(p.pid) ?? 0, baseMinutes.get(p.pid) ?? 0),
		);
		reduceToFloor(() => 0);
		delta = -excess;
	}

	if (Math.abs(delta) > EPSILON) {
		return {
			minutesByPid: automaticMinutesByPid,
			currentMinutesOverrideError:
				"Current minute overrides leave no legal way to reach the team's regulation total",
		};
	}

	const protectionOverridePids = candidates
		.filter(
			(p) =>
				protectedPids.has(p.pid) &&
				(adjusted.get(p.pid) ?? 0) > (baseMinutes.get(p.pid) ?? 0) + EPSILON,
		)
		.map((p) => p.pid);

	return {
		minutesByPid: Object.fromEntries(adjusted) as Record<number, number>,
		activeCurrentMinutesOverrideByPid: Object.fromEntries(pinned),
		protectionOverridePids,
	};
};

/**
 * Preserve a custom plan's relative intent after a roster or court-size change.
 * New players remain at zero unless fewer than N players have positive minutes.
 */
export const legalizeBasketballCustomMinutes = ({
	players,
	minutesByPid,
	numPlayersOnCourt,
	playoffs,
	rotationDepth = DEFAULT_ROTATION_DEPTH,
	coreReliance = DEFAULT_CORE_RELIANCE,
}: {
	players: BasketballMinutesPlayer[];
	minutesByPid: Record<number, number> | undefined;
	numPlayersOnCourt: number;
	playoffs: boolean;
	rotationDepth?: BasketballRotationDepth;
	coreReliance?: BasketballCoreReliance;
}) => {
	const ordered = getOrderedPlayers(players);
	const required = MINUTES_IN_STANDARD_GAME * numPlayersOnCourt;
	if (ordered.length < numPlayersOnCourt) {
		// Preserve the surviving portion of the custom intent while the roster is
		// temporarily too small. Saving remains disabled because the total cannot
		// reach the required value; reconciliation resumes after the roster grows.
		return Object.fromEntries(
			ordered.map((p) => [
				p.pid,
				Math.round(
					clamp(minutesByPid?.[p.pid] ?? 0, 0, MINUTES_IN_STANDARD_GAME),
				),
			]),
		) as Record<number, number>;
	}

	const auto = generateBasketballAutoMinutes({
		players: ordered,
		numPlayersOnCourt,
		playoffs,
		rotationDepth,
		coreReliance,
	});
	const weights = new Map(
		ordered.map((p) => [
			p.pid,
			clamp(minutesByPid?.[p.pid] ?? 0, 0, MINUTES_IN_STANDARD_GAME),
		]),
	);
	let positive = ordered.filter((p) => (weights.get(p.pid) ?? 0) > EPSILON);

	if (positive.length === 0) {
		return Object.fromEntries(
			ordered.map((p) => [
				p.pid,
				Math.round(
					clamp(minutesByPid?.[p.pid] ?? 0, 0, MINUTES_IN_STANDARD_GAME),
				),
			]),
		) as Record<number, number>;
	}
	if (positive.length < numPlayersOnCourt) {
		const reserveOrder = getAutomaticReserveOrder({
			players: ordered,
			minutesByPid: weights,
			automaticMinutesByPid: auto,
		});
		const toPromote = reserveOrder.slice(
			0,
			numPlayersOnCourt - positive.length,
		);
		for (const p of toPromote) {
			weights.set(p.pid, Math.max(0.5, auto[p.pid] ?? 0));
		}
		positive = ordered.filter((p) => (weights.get(p.pid) ?? 0) > EPSILON);
	}

	return allocateAndRound({
		players: ordered,
		weights: new Map(positive.map((p) => [p.pid, weights.get(p.pid)!])),
		total: required,
		cap: MINUTES_IN_STANDARD_GAME,
		increment: 1,
	});
};

export type BasketballRosterMinutesPlan = {
	/** Durable Custom values, before any roster-change overlay. */
	baselineMinutesByPid: Record<number, number>;
	/** Current healthy plan consumed by injury allocation/GameSim. */
	minutesByPid: Record<number, number>;
	/** Temporary healthy-roster additions by pid. */
	rosterOverlayByPid: Record<number, number>;
	rosterAutoFillActive: boolean;
};

/**
 * Derive a temporary healthy-roster overlay without mutating the Custom
 * baseline. The overlay can use every current player, including incumbents and
 * explicit Plan=0 reserves; an incoming/unowned pid is only an ownership/UI
 * marker, not the sole recipient of the departed player's vacancy.
 */
export const getBasketballRosterMinutesPlan = ({
	players,
	minutesByPid,
	rosterAutoFillActive = false,
	numPlayersOnCourt,
	playoffs,
	rotationDepth = DEFAULT_ROTATION_DEPTH,
	coreReliance = DEFAULT_CORE_RELIANCE,
}: {
	players: BasketballMinutesPlayer[];
	minutesByPid: Record<number, number> | undefined;
	rosterAutoFillActive?: boolean;
	numPlayersOnCourt: number;
	playoffs: boolean;
	rotationDepth?: BasketballRotationDepth;
	coreReliance?: BasketballCoreReliance;
}): BasketballRosterMinutesPlan => {
	const ordered = getOrderedPlayers(players);
	const required = MINUTES_IN_STANDARD_GAME * numPlayersOnCourt;
	const baseline = new Map(
		ordered.map((p) => [
			p.pid,
			Math.round(
				clamp(minutesByPid?.[p.pid] ?? 0, 0, MINUTES_IN_STANDARD_GAME),
			),
		]),
	);
	const baselineTotal = Array.from(baseline.values()).reduce(
		(total, value) => total + value,
		0,
	);
	const active =
		rosterAutoFillActive &&
		ordered.length >= numPlayersOnCourt &&
		baselineTotal < required - EPSILON;
	const overlay = new Map(ordered.map((p) => [p.pid, 0]));
	if (active) {
		const auto = generateBasketballAutoMinutes({
			players: ordered,
			numPlayersOnCourt,
			playoffs,
			rotationDepth,
			coreReliance,
		});
		const candidates = ordered.filter(
			(p) => MINUTES_IN_STANDARD_GAME - (baseline.get(p.pid) ?? 0) > EPSILON,
		);
		const weights = new Map(
			candidates.map((p) => {
				return [p.pid, Math.max(0.5, auto[p.pid] ?? 0)];
			}),
		);
		const caps = new Map(
			candidates.map((p) => [
				p.pid,
				Math.max(0, MINUTES_IN_STANDARD_GAME - (baseline.get(p.pid) ?? 0)),
			]),
		);
		const additions = allocateAndRoundWithCaps({
			players: candidates,
			weights,
			total: required - baselineTotal,
			caps,
		});
		for (const p of candidates) {
			overlay.set(p.pid, additions[p.pid] ?? 0);
		}
	}
	const baselineMinutesByPid = Object.fromEntries(baseline) as Record<
		number,
		number
	>;
	const rosterOverlayByPid = Object.fromEntries(overlay) as Record<
		number,
		number
	>;
	return {
		baselineMinutesByPid,
		minutesByPid: Object.fromEntries(
			ordered.map((p) => [
				p.pid,
				(baseline.get(p.pid) ?? 0) + (overlay.get(p.pid) ?? 0),
			]),
		) as Record<number, number>,
		rosterOverlayByPid,
		rosterAutoFillActive: active,
	};
};

/**
 * Build a current-roster baseline after membership changes. Unowned players
 * receive a neutral zero placeholder and are tracked separately; the returned
 * healthy minutes are derived from the temporary overlay above.
 */
export const fillBasketballRosterVacancy = ({
	players,
	minutesByPid,
	ownedPids,
	numPlayersOnCourt,
	playoffs,
	rotationDepth = DEFAULT_ROTATION_DEPTH,
	coreReliance = DEFAULT_CORE_RELIANCE,
}: {
	players: BasketballMinutesPlayer[];
	minutesByPid: Record<number, number> | undefined;
	ownedPids: readonly number[];
	numPlayersOnCourt: number;
	playoffs: boolean;
	rotationDepth?: BasketballRotationDepth;
	coreReliance?: BasketballCoreReliance;
}) => {
	const owned = new Set(ownedPids);
	const baselineMinutesByPid = Object.fromEntries(
		players.map((p) => [
			p.pid,
			owned.has(p.pid)
				? Math.round(
						clamp(minutesByPid?.[p.pid] ?? 0, 0, MINUTES_IN_STANDARD_GAME),
					)
				: 0,
		]),
	) as Record<number, number>;
	const autoFilledPids = players
		.filter((p) => !owned.has(p.pid))
		.map((p) => p.pid);
	const plan = getBasketballRosterMinutesPlan({
		players,
		minutesByPid: baselineMinutesByPid,
		rosterAutoFillActive: true,
		numPlayersOnCourt,
		playoffs,
		rotationDepth,
		coreReliance,
	});
	return { ...plan, autoFilledPids };
};

export const getBasketballRotationMinutes = ({
	rotation,
	players,
	numPlayersOnCourt,
	playoffs,
}: {
	rotation: BasketballRotation | undefined;
	players: BasketballMinutesPlayer[];
	numPlayersOnCourt: number;
	playoffs: boolean;
}) => {
	const { rotationDepth, coreReliance } = getRotationProfile(rotation);
	if (rotation?.mode === "custom") {
		const rawMinutesByPid = rotation.minutesByPid;
		const rawDraftMatchesRoster =
			rawMinutesByPid !== undefined &&
			validateBasketballMinutes({
				players,
				minutesByPid: rawMinutesByPid,
				numPlayersOnCourt,
			}) === undefined;
		const legalizedMinutesByPid = rawDraftMatchesRoster
			? (Object.fromEntries(
					players.map((p) => [p.pid, rawMinutesByPid[p.pid]!]),
				) as Record<number, number>)
			: legalizeBasketballCustomMinutes({
					players,
					minutesByPid: rawMinutesByPid,
					numPlayersOnCourt,
					playoffs,
					rotationDepth,
					coreReliance,
				});
		const autoFilledPids = rotation.autoFilledPids ?? [];
		const rawDraftHasFiniteLegalValues =
			rawMinutesByPid !== undefined &&
			Object.keys(rawMinutesByPid).length > 0 &&
			Object.values(rawMinutesByPid).every(
				(value) =>
					typeof value === "number" &&
					Number.isFinite(value) &&
					Number.isInteger(value) &&
					value >= 0 &&
					value <= MINUTES_IN_STANDARD_GAME,
			);
		const baselineMinutesByPid = Object.fromEntries(
			players.map((p) => [
				p.pid,
				autoFilledPids.includes(p.pid)
					? 0
					: (legalizedMinutesByPid[p.pid] ?? 0),
			]),
		) as Record<number, number>;
		const baselineTotal = Object.values(baselineMinutesByPid).reduce(
			(total, value) => total + value,
			0,
		);
		const rosterAutoFillActive =
			rotation.rosterAutoFillActive === true ||
			(rotation.rosterAutoFillActive === undefined &&
				autoFilledPids.length > 0 &&
				baselineTotal < MINUTES_IN_STANDARD_GAME * numPlayersOnCourt);
		const rosterPlan = getBasketballRosterMinutesPlan({
			players,
			minutesByPid: baselineMinutesByPid,
			rosterAutoFillActive,
			numPlayersOnCourt,
			playoffs,
			rotationDepth,
			coreReliance,
		});
		const minutesByPid = rosterPlan.minutesByPid;
		return {
			mode: "custom" as const,
			minutesByPid,
			baselineMinutesByPid: rosterPlan.baselineMinutesByPid,
			rosterOverlayByPid: rosterPlan.rosterOverlayByPid,
			rosterAutoFillActive: rosterPlan.rosterAutoFillActive,
			previewReady:
				players.length >= numPlayersOnCourt &&
				rawDraftHasFiniteLegalValues &&
				(rawDraftMatchesRoster ||
					(autoFilledPids.length > 0 &&
						players.every(
							(p) =>
								rawMinutesByPid?.[p.pid] !== undefined ||
								autoFilledPids.includes(p.pid),
						))),
			gameReady:
				players.length >= numPlayersOnCourt &&
				rawDraftHasFiniteLegalValues &&
				validateBasketballMinutesForGame({
					players,
					minutesByPid,
					numPlayersOnCourt,
				}) === undefined,
			noInjuryMinutesIncreasePids: rotation.noInjuryMinutesIncreasePids ?? [],
			rotationDepth,
			coreReliance,
			autoFilledPids,
		};
	}

	const minutesByPid = generateBasketballAutoMinutes({
		players,
		numPlayersOnCourt,
		playoffs,
		rotationDepth,
		coreReliance,
	});
	return {
		mode: "auto" as const,
		minutesByPid,
		gameReady:
			players.length >= numPlayersOnCourt &&
			validateBasketballMinutesForGame({
				players,
				minutesByPid,
				numPlayersOnCourt,
			}) === undefined,
		noInjuryMinutesIncreasePids: rotation?.noInjuryMinutesIncreasePids ?? [],
		rotationDepth,
		coreReliance,
		autoFilledPids: [],
		previewReady: players.length >= numPlayersOnCourt,
		baselineMinutesByPid: minutesByPid,
		rosterOverlayByPid: Object.fromEntries(
			players.map((p) => [p.pid, 0]),
		) as Record<number, number>,
		rosterAutoFillActive: false,
	};
};

export type GameEffectiveBasketballMinutesResult = {
	minutesByPid: Record<number, number>;
	protectionOverridePids: number[];
	allocationError?: string;
	activeCurrentMinutesOverrideByPid?: Record<number, number>;
	currentMinutesOverrideError?: string;
};

export const getGameEffectiveBasketballMinutesWithStatus = ({
	players,
	minutesByPid,
	numPlayersOnCourt,
	regulationMinutes,
	targetTotalMinutes = regulationMinutes * numPlayersOnCourt,
	noInjuryMinutesIncreasePids = [],
	rotationDepth = DEFAULT_ROTATION_DEPTH,
	coreReliance = DEFAULT_CORE_RELIANCE,
	currentMinutesOverrideByPid,
	currentMinutesOverrideContext,
}: {
	players: (BasketballMinutesPlayer & {
		available: boolean;
		value?: number;
	})[];
	minutesByPid: Record<number, number>;
	numPlayersOnCourt: number;
	regulationMinutes: number;
	/** Preview-only target; production callers use the regulation total. */
	targetTotalMinutes?: number;
	noInjuryMinutesIncreasePids?: ReadonlySet<number> | readonly number[];
	rotationDepth?: BasketballRotationDepth;
	coreReliance?: BasketballCoreReliance;
	currentMinutesOverrideByPid?: Record<number, number>;
	currentMinutesOverrideContext?: BasketballMinutesOverrideContext;
}): GameEffectiveBasketballMinutesResult => {
	const ordered = getOrderedPlayers(players);
	const available = ordered.filter((p) => p.available);
	if (available.length < numPlayersOnCourt) {
		throw new Error("Not enough available players for a basketball game");
	}
	const totalTarget = targetTotalMinutes;
	const scale = regulationMinutes / MINUTES_IN_STANDARD_GAME;
	const baseMinutes = new Map(
		ordered.map((p) => [
			p.pid,
			Math.min(
				regulationMinutes,
				Math.max(0, minutesByPid[p.pid] ?? 0) * scale,
			),
		]),
	);
	const availablePids = new Set(available.map((p) => p.pid));
	const protectedPids =
		noInjuryMinutesIncreasePids instanceof Set
			? noInjuryMinutesIncreasePids
			: new Set(noInjuryMinutesIncreasePids);
	const assertHardProtectionCaps = (result: Record<number, number>) => {
		for (const pid of protectedPids) {
			if ((result[pid] ?? 0) > (baseMinutes.get(pid) ?? 0) + EPSILON) {
				throw new Error(
					"Injury minutes cannot exceed Prevent injury increase limits",
				);
			}
		}
	};
	const applyCurrentOverrides = (
		automaticMinutesByPid: Record<number, number>,
		protectionOverridePids: number[],
		ordinaryMaximumByPid?: ReadonlyMap<number, number>,
		extendedMaximumByPid?: ReadonlyMap<number, number>,
		reservePromotionOrderPids?: readonly number[],
	): GameEffectiveBasketballMinutesResult => {
		const current = applyCurrentMinutesOverrides({
			players: ordered,
			available: availablePids,
			automaticMinutesByPid,
			baseMinutes,
			protectedPids,
			ordinaryMaximumByPid,
			extendedMaximumByPid,
			reservePromotionOrderPids,
			numPlayersOnCourt,
			regulationMinutes,
			targetTotalMinutes: totalTarget,
			currentMinutesOverrideByPid,
			currentMinutesOverrideContext,
		});
		assertHardProtectionCaps(current.minutesByPid);
		const combinedProtectionOverrides = new Set([
			...protectionOverridePids,
			...(current.protectionOverridePids ?? []),
		]);
		for (const pid of combinedProtectionOverrides) {
			if (
				(current.minutesByPid[pid] ?? 0) <=
				(baseMinutes.get(pid) ?? 0) + EPSILON
			) {
				combinedProtectionOverrides.delete(pid);
			}
		}
		return {
			minutesByPid: current.minutesByPid,
			protectionOverridePids: [...combinedProtectionOverrides].sort(
				(a, b) => a - b,
			),
			...(current.activeCurrentMinutesOverrideByPid
				? {
						activeCurrentMinutesOverrideByPid:
							current.activeCurrentMinutesOverrideByPid,
					}
				: {}),
			...(current.currentMinutesOverrideError
				? { currentMinutesOverrideError: current.currentMinutesOverrideError }
				: {}),
		};
	};
	if (available.length === ordered.length) {
		return applyCurrentOverrides(
			Object.fromEntries(
				ordered.map((p) => [p.pid, baseMinutes.get(p.pid) ?? 0]),
			) as Record<number, number>,
			[],
		);
	}

	const effective = new Map(
		available.map((p) => [p.pid, baseMinutes.get(p.pid) ?? 0]),
	);
	let remaining =
		totalTarget -
		Array.from(effective.values()).reduce((sum, value) => sum + value, 0);
	const roleDemand = getRoleDemand(ordered, baseMinutes, availablePids);
	const ovrPercentiles = getOvrPercentiles(ordered);
	const maxValue = Math.max(
		...ordered.map((p) => Math.max(0, p.value ?? 0)),
		0,
	);
	const reserveWeight = (p: OrderedPlayer) => {
		const quality =
			ovrPercentiles?.get(p.pid) !== undefined
				? 0.25 + ovrPercentiles.get(p.pid)!
				: maxValue > EPSILON
					? Math.max(0, p.value ?? 0) / maxValue
					: 1;
		const endurance = 0.5 + 0.5 * clamp(p.endurance, 0, 1);
		const roleFit = 0.5 + 0.5 * getRoleFit(p, roleDemand);
		return Math.max(0.001, quality * endurance * roleFit);
	};
	const reserveCapacity = (p: OrderedPlayer) => {
		const quality =
			ovrPercentiles?.get(p.pid) !== undefined
				? ovrPercentiles.get(p.pid)!
				: maxValue > EPSILON
					? Math.max(0, p.value ?? 0) / maxValue
					: 0.5;
		const absoluteQuality = smoothstep(0.15, 0.55, clamp(quality, 0, 1));
		const endurance = 0.7 + 0.3 * clamp(p.endurance, 0, 1);
		const roleFit = 0.65 + 0.35 * getRoleFit(p, roleDemand);
		const relianceFactor =
			coreReliance === "high" ? 0.75 : coreReliance === "low" ? 1.25 : 1;
		const standardGameCapacity = clamp(
			6 + 30 * absoluteQuality * endurance * roleFit * relianceFactor,
			4,
			40,
		);
		return Math.min(regulationMinutes, standardGameCapacity * scale);
	};

	const healthyPositive = ordered
		.filter((p) => (baseMinutes.get(p.pid) ?? 0) > EPSILON)
		.sort(
			(a, b) =>
				(baseMinutes.get(b.pid) ?? 0) - (baseMinutes.get(a.pid) ?? 0) ||
				a.rosterOrder - b.rosterOrder ||
				a.pid - b.pid,
		);
	const availablePositive = healthyPositive.filter((p) =>
		availablePids.has(p.pid),
	);
	const availablePositiveRank = new Map(
		availablePositive.map((p, index) => [p.pid, index]),
	);
	const ordinaryMaximumByPid = new Map<number, number>();
	const extendedMaximumByPid = new Map<number, number>();
	for (const p of available) {
		const base = baseMinutes.get(p.pid) ?? 0;
		if (protectedPids.has(p.pid)) {
			ordinaryMaximumByPid.set(p.pid, base);
			extendedMaximumByPid.set(p.pid, base);
			continue;
		}
		if (base > EPSILON) {
			const rank = availablePositiveRank.get(p.pid) ?? 0;
			const promotedSlot = Math.max(
				base,
				baseMinutes.get(healthyPositive[rank]?.pid ?? p.pid) ?? base,
			);
			const ordinaryMaximum = Math.min(
				regulationMinutes,
				promotedSlot + INCUMBENT_PROMOTION_EXTRA[coreReliance] * scale,
			);
			ordinaryMaximumByPid.set(p.pid, ordinaryMaximum);
			extendedMaximumByPid.set(
				p.pid,
				Math.min(
					regulationMinutes,
					ordinaryMaximum + EXTENDED_INCUMBENT_EXTRA[coreReliance] * scale,
				),
			);
		} else {
			const ordinaryMaximum = reserveCapacity(p);
			ordinaryMaximumByPid.set(p.pid, ordinaryMaximum);
			extendedMaximumByPid.set(
				p.pid,
				Math.min(
					regulationMinutes,
					ordinaryMaximum + EXTENDED_RESERVE_EXTRA[coreReliance] * scale,
				),
			);
		}
	}

	const addMinutes = ({
		candidates,
		weights,
		requestedTotal,
		maximumByPid,
	}: {
		candidates: OrderedPlayer[];
		weights: Map<number, number>;
		requestedTotal?: number;
		maximumByPid?: ReadonlyMap<number, number>;
	}) => {
		if (remaining <= EPSILON || candidates.length === 0) {
			return;
		}
		const caps = new Map(
			candidates.map((p) => {
				const current = effective.get(p.pid) ?? 0;
				return [
					p.pid,
					Math.min(
						Math.max(0, regulationMinutes - current),
						maximumByPid === undefined
							? Infinity
							: Math.max(0, (maximumByPid.get(p.pid) ?? current) - current),
					),
				] as const;
			}),
		);
		const totalCapacity = Array.from(caps.values()).reduce(
			(sum, value) => sum + value,
			0,
		);
		const total = Math.min(
			remaining,
			requestedTotal === undefined ? remaining : requestedTotal,
			totalCapacity,
		);
		if (total <= EPSILON) {
			return;
		}
		const additions = allocateWeightedWithCaps({
			players: candidates,
			weights,
			total,
			caps,
		});
		for (const p of candidates) {
			effective.set(
				p.pid,
				(effective.get(p.pid) ?? 0) + (additions.get(p.pid) ?? 0),
			);
		}
		remaining -= total;
	};

	const protectedHealthy = (p: OrderedPlayer) => protectedPids.has(p.pid);
	const unprotectedPositive = availablePositive.filter(
		(p) =>
			!protectedHealthy(p) &&
			regulationMinutes - (effective.get(p.pid) ?? 0) > EPSILON,
	);
	const unprotectedDeep = available.filter(
		(p) =>
			!protectedHealthy(p) &&
			(baseMinutes.get(p.pid) ?? 0) <= EPSILON &&
			regulationMinutes - (effective.get(p.pid) ?? 0) > EPSILON,
	);
	const orderedDeep = [...unprotectedDeep].sort(
		(a, b) =>
			reserveWeight(b) - reserveWeight(a) ||
			a.rosterOrder - b.rosterOrder ||
			a.pid - b.pid,
	);
	const primaryDeep = orderedDeep.slice(0, COVERAGE_REACH[rotationDepth]);
	const fallbackDeep = orderedDeep.slice(COVERAGE_REACH[rotationDepth]);
	const positiveWeights = new Map(
		unprotectedPositive.map((p) => [
			p.pid,
			Math.max(baseMinutes.get(p.pid) ?? 0, 0.001),
		]),
	);
	const deepWeights = (candidates: OrderedPlayer[]) =>
		new Map(candidates.map((p) => [p.pid, reserveWeight(p)]));
	const redistributionTotal = Math.max(0, remaining);
	const reserveShare =
		orderedDeep.length > 0 ? RELIANCE_PARAMETERS[coreReliance].reserveShare : 0;
	addMinutes({
		candidates: unprotectedPositive,
		weights: positiveWeights,
		requestedTotal: redistributionTotal * (1 - reserveShare),
		maximumByPid: ordinaryMaximumByPid,
	});
	addMinutes({
		candidates: primaryDeep,
		weights: deepWeights(primaryDeep),
		requestedTotal: redistributionTotal * reserveShare,
		maximumByPid: ordinaryMaximumByPid,
	});

	if (coreReliance === "low") {
		addMinutes({
			candidates: primaryDeep,
			weights: deepWeights(primaryDeep),
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: fallbackDeep,
			weights: deepWeights(fallbackDeep),
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: unprotectedPositive,
			weights: positiveWeights,
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: orderedDeep,
			weights: deepWeights(orderedDeep),
			maximumByPid: extendedMaximumByPid,
		});
		addMinutes({
			candidates: unprotectedPositive,
			weights: positiveWeights,
			maximumByPid: extendedMaximumByPid,
		});
	} else if (coreReliance === "balanced") {
		addMinutes({
			candidates: unprotectedPositive,
			weights: positiveWeights,
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: primaryDeep,
			weights: deepWeights(primaryDeep),
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: fallbackDeep,
			weights: deepWeights(fallbackDeep),
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: unprotectedPositive,
			weights: positiveWeights,
			maximumByPid: extendedMaximumByPid,
		});
		addMinutes({
			candidates: orderedDeep,
			weights: deepWeights(orderedDeep),
			maximumByPid: extendedMaximumByPid,
		});
	} else {
		addMinutes({
			candidates: unprotectedPositive,
			weights: positiveWeights,
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: primaryDeep,
			weights: deepWeights(primaryDeep),
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: unprotectedPositive,
			weights: positiveWeights,
			maximumByPid: extendedMaximumByPid,
		});
		addMinutes({
			candidates: fallbackDeep,
			weights: deepWeights(fallbackDeep),
			maximumByPid: ordinaryMaximumByPid,
		});
		addMinutes({
			candidates: orderedDeep,
			weights: deepWeights(orderedDeep),
			maximumByPid: extendedMaximumByPid,
		});
	}

	const unprotectedEmergencyPositive = unprotectedPositive.filter(
		(p) => regulationMinutes - (effective.get(p.pid) ?? 0) > EPSILON,
	);
	addMinutes({
		candidates: unprotectedEmergencyPositive,
		weights: new Map(
			unprotectedEmergencyPositive.map((p) => [
				p.pid,
				Math.max(baseMinutes.get(p.pid) ?? 0, reserveWeight(p)),
			]),
		),
	});
	const unprotectedEmergencyDeep = unprotectedDeep.filter(
		(p) => regulationMinutes - (effective.get(p.pid) ?? 0) > EPSILON,
	);
	addMinutes({
		candidates: unprotectedEmergencyDeep,
		weights: new Map(
			unprotectedEmergencyDeep.map((p) => [
				p.pid,
				Math.max(baseMinutes.get(p.pid) ?? 0, reserveWeight(p)),
			]),
		),
	});
	if (remaining > EPSILON) {
		const partialMinutesByPid = Object.fromEntries(
			ordered.map((p) => [
				p.pid,
				p.available ? (effective.get(p.pid) ?? 0) : 0,
			]),
		) as Record<number, number>;
		assertHardProtectionCaps(partialMinutesByPid);
		return {
			minutesByPid: partialMinutesByPid,
			protectionOverridePids: [],
			allocationError:
				"Injury minutes cannot reach the team's regulation total without exceeding Prevent injury increase limits",
		};
	}

	const protectionOverridePids = ordered
		.filter(
			(p) =>
				protectedHealthy(p) &&
				(effective.get(p.pid) ?? 0) > (baseMinutes.get(p.pid) ?? 0) + EPSILON,
		)
		.map((p) => p.pid);

	return applyCurrentOverrides(
		Object.fromEntries(
			ordered.map((p) => [
				p.pid,
				p.available ? (effective.get(p.pid) ?? 0) : 0,
			]),
		) as Record<number, number>,
		protectionOverridePids,
		ordinaryMaximumByPid,
		extendedMaximumByPid,
		orderedDeep.map((p) => p.pid),
	);
};

export const getGameEffectiveBasketballMinutes = (
	args: Parameters<typeof getGameEffectiveBasketballMinutesWithStatus>[0],
) => {
	const result = getGameEffectiveBasketballMinutesWithStatus(args);
	if (result.allocationError) {
		throw new Error(result.allocationError);
	}
	return result.minutesByPid;
};

export type BasketballCurrentMinutesValidation = {
	context: BasketballMinutesOverrideContext;
	healthyMinutesByPid: Record<number, number>;
	gameReady: boolean;
	regulationMinutes: number;
	error?: string;
};

/**
 * Shared validation context for Current Overrides. API, Roster preview,
 * reconcile, and GameSim/loadTeams all derive the healthy plan from the same
 * user-visible league-relative fuzzed OVR percentiles whenever ratings are
 * available and challenge-no-ratings is off.
 */
export const validateBasketballCurrentMinutesState = ({
	t,
	players,
	rotation,
	numPlayersOnCourt,
	regulationMinutes,
	playoffs,
	challengeNoRatings,
	rotationOvrPercentiles,
}: {
	t: Pick<Team, "playThroughInjuries">;
	players: Player[];
	rotation: BasketballRotation;
	numPlayersOnCourt: number;
	regulationMinutes: number;
	playoffs: boolean;
	challengeNoRatings: boolean;
	rotationOvrPercentiles?: ReadonlyMap<number, number>;
}): BasketballCurrentMinutesValidation => {
	const availableValues = getBasketballGameAvailability({
		players,
		playThroughInjuries: t.playThroughInjuries[playoffs ? 1 : 0],
		numPlayersOnCourt,
	});
	const available = new Set(
		players.filter((_, index) => availableValues[index]).map((p) => p.pid),
	);
	const context = getBasketballMinutesOverrideContext({
		players,
		available,
		numPlayersOnCourt,
		regulationMinutes,
	});
	const minutesPlayers = players.map((p) =>
		getBasketballRotationPlayerInput({
			pid: p.pid,
			rosterOrder: p.rosterOrder,
			ratings: p.ratings.at(-1)! as unknown as Record<string, unknown>,
			challengeNoRatings,
			useFuzzedRatings: true,
			ovrPercentile: rotationOvrPercentiles?.get(p.pid),
		}),
	);
	const planned = getBasketballRotationMinutes({
		rotation,
		players: minutesPlayers,
		numPlayersOnCourt,
		playoffs,
	});
	if (!planned.gameReady) {
		return {
			context,
			healthyMinutesByPid: planned.minutesByPid,
			gameReady: false,
			regulationMinutes,
			error:
				"Fix the healthy minutes plan before setting Current minute overrides",
		};
	}
	const effective = getGameEffectiveBasketballMinutesWithStatus({
		players: minutesPlayers.map((p, index) => ({
			...p,
			available: availableValues[index]!,
			value: challengeNoRatings ? undefined : players[index]!.valueNoPot,
		})),
		minutesByPid: planned.minutesByPid,
		numPlayersOnCourt,
		regulationMinutes,
		noInjuryMinutesIncreasePids: rotation.noInjuryMinutesIncreasePids ?? [],
		rotationDepth: planned.rotationDepth,
		coreReliance: planned.coreReliance,
		currentMinutesOverrideByPid: rotation.currentMinutesOverrideByPid,
		currentMinutesOverrideContext: rotation.currentMinutesOverrideContext,
	});
	return {
		context,
		healthyMinutesByPid: planned.minutesByPid,
		gameReady: true,
		regulationMinutes,
		error: effective.currentMinutesOverrideError ?? effective.allocationError,
	};
};

/**
 * Keep a persisted Current Override pair valid under the current derived
 * healthy plan. Empty or one-sided records are cleared. A stale context clears
 * the pair as a whole. A matching context revalidates every pin and removes
 * only individually invalid pins (missing/unavailable player, malformed or
 * out-of-range value, or a protected value above its healthy hard cap); if the
 * remaining set is collectively impossible the pair is cleared atomically. A
 * plan that is not game-ready is left untouched: it is a transient roster/plan
 * problem, not a pin problem, and the game cannot run until it is repaired.
 *
 * Returns true when the persisted rotation needs a write.
 */
export const cleanupBasketballCurrentMinutesOverrideState = ({
	t,
	players,
	rotation,
	numPlayersOnCourt,
	regulationMinutes,
	playoffs,
	challengeNoRatings,
	rotationOvrPercentiles,
}: {
	t: Pick<Team, "playThroughInjuries">;
	players: Player[];
	rotation: BasketballRotation;
	numPlayersOnCourt: number;
	regulationMinutes: number;
	playoffs: boolean;
	challengeNoRatings: boolean;
	rotationOvrPercentiles?: ReadonlyMap<number, number>;
}): boolean => {
	const initialHadOverrides =
		rotation.currentMinutesOverrideByPid !== undefined;
	const initialHadContext =
		rotation.currentMinutesOverrideContext !== undefined;
	const normalizePair = () => {
		const overrides = rotation.currentMinutesOverrideByPid;
		const context = rotation.currentMinutesOverrideContext;
		if (
			overrides === undefined ||
			context === undefined ||
			Object.keys(overrides).length === 0
		) {
			delete rotation.currentMinutesOverrideByPid;
			delete rotation.currentMinutesOverrideContext;
			return false;
		}
		return true;
	};
	if (!normalizePair()) {
		return initialHadOverrides || initialHadContext;
	}
	const validate = (currentRotation: BasketballRotation) =>
		validateBasketballCurrentMinutesState({
			t,
			players,
			rotation: currentRotation,
			numPlayersOnCourt,
			regulationMinutes,
			playoffs,
			challengeNoRatings,
			rotationOvrPercentiles,
		});
	let validation = validate(rotation);
	if (
		!currentMinutesOverrideContextMatches(
			rotation.currentMinutesOverrideContext,
			validation.context,
		)
	) {
		delete rotation.currentMinutesOverrideByPid;
		delete rotation.currentMinutesOverrideContext;
		return true;
	}
	if (!validation.gameReady) {
		return false;
	}

	const rosterPids = new Set(validation.context.rosterPids);
	const unavailablePids = new Set(validation.context.unavailablePids);
	const protectedPids = new Set(rotation.noInjuryMinutesIncreasePids ?? []);
	const remainingOverrides: Record<number, number> = {};
	let removedIndividuallyInvalidOverride = false;
	for (const [pidString, value] of Object.entries(
		rotation.currentMinutesOverrideByPid!,
	)) {
		const pid = Number(pidString);
		const healthyHardCap = Math.min(
			validation.regulationMinutes,
			Math.max(0, validation.healthyMinutesByPid[pid] ?? 0) *
				(validation.regulationMinutes / MINUTES_IN_STANDARD_GAME),
		);
		if (
			!Number.isInteger(pid) ||
			!rosterPids.has(pid) ||
			unavailablePids.has(pid) ||
			!Number.isInteger(value) ||
			value < 0 ||
			value > validation.regulationMinutes ||
			(protectedPids.has(pid) && value > healthyHardCap + EPSILON)
		) {
			removedIndividuallyInvalidOverride = true;
		} else {
			remainingOverrides[pid] = value;
		}
	}
	if (removedIndividuallyInvalidOverride) {
		rotation.currentMinutesOverrideByPid = remainingOverrides;
		if (!normalizePair()) {
			return true;
		}
		validation = validate(rotation);
	}

	// A remaining allocator error is collective rather than attributable to one
	// pin. Clear the pair atomically instead of guessing which otherwise valid
	// pin to discard.
	if (validation.error) {
		delete rotation.currentMinutesOverrideByPid;
		delete rotation.currentMinutesOverrideContext;
		return true;
	}
	return removedIndividuallyInvalidOverride;
};

export const sanitizeBasketballRotation = (
	value: unknown,
): BasketballRotation | undefined => {
	if (!value || typeof value !== "object") {
		return;
	}
	const input = value as Partial<BasketballRotation>;
	if (input.mode !== "auto" && input.mode !== "custom") {
		return;
	}
	const noInjuryMinutesIncreasePids = Array.isArray(
		input.noInjuryMinutesIncreasePids,
	)
		? Array.from(
				new Set(
					input.noInjuryMinutesIncreasePids.filter(
						(pid) => Number.isInteger(pid) && pid >= 0,
					),
				),
			).sort((a, b) => a - b)
		: [];
	const rotationDepth = ["short", "normal", "long"].includes(
		input.rotationDepth ?? "",
	)
		? input.rotationDepth
		: undefined;
	const coreReliance = ["high", "balanced", "low"].includes(
		input.coreReliance ?? "",
	)
		? input.coreReliance
		: undefined;
	const autoFilledPids = Array.isArray(input.autoFilledPids)
		? Array.from(
				new Set(
					input.autoFilledPids.filter(
						(pid) => Number.isInteger(pid) && pid >= 0,
					),
				),
			)
		: [];
	const profileFields = {
		...(rotationDepth !== undefined ? { rotationDepth } : {}),
		...(coreReliance !== undefined ? { coreReliance } : {}),
	};
	const autoFields =
		input.mode === "custom" && autoFilledPids.length > 0
			? { autoFilledPids }
			: {};
	const currentMinutesOverrideByPid: Record<number, number> = {};
	if (
		input.currentMinutesOverrideByPid &&
		typeof input.currentMinutesOverrideByPid === "object"
	) {
		for (const [pidString, value2] of Object.entries(
			input.currentMinutesOverrideByPid,
		)) {
			const pid = Number(pidString);
			if (
				Number.isInteger(pid) &&
				pid >= 0 &&
				typeof value2 === "number" &&
				Number.isFinite(value2)
			) {
				currentMinutesOverrideByPid[pid] = clamp(
					value2,
					0,
					MINUTES_IN_STANDARD_GAME,
				);
			}
		}
	}
	const currentOverrideContext = input.currentMinutesOverrideContext;
	const currentOverrideFields =
		Object.keys(currentMinutesOverrideByPid).length > 0 &&
		currentOverrideContext &&
		Array.isArray(currentOverrideContext.rosterPids) &&
		Array.isArray(currentOverrideContext.unavailablePids) &&
		Number.isInteger(currentOverrideContext.numPlayersOnCourt) &&
		currentOverrideContext.numPlayersOnCourt > 0 &&
		typeof currentOverrideContext.regulationMinutes === "number" &&
		Number.isFinite(currentOverrideContext.regulationMinutes) &&
		currentOverrideContext.regulationMinutes > 0
			? {
					currentMinutesOverrideByPid,
					currentMinutesOverrideContext: {
						rosterPids: Array.from(
							new Set(
								currentOverrideContext.rosterPids.filter(
									(pid) => Number.isInteger(pid) && pid >= 0,
								),
							),
						).sort((a, b) => a - b),
						unavailablePids: Array.from(
							new Set(
								currentOverrideContext.unavailablePids.filter(
									(pid) => Number.isInteger(pid) && pid >= 0,
								),
							),
						).sort((a, b) => a - b),
						numPlayersOnCourt: currentOverrideContext.numPlayersOnCourt,
						regulationMinutes: currentOverrideContext.regulationMinutes,
					},
				}
			: {};
	if (input.mode === "auto") {
		return {
			version: 1,
			mode: "auto",
			...profileFields,
			...currentOverrideFields,
			...(noInjuryMinutesIncreasePids.length > 0
				? { noInjuryMinutesIncreasePids }
				: {}),
		};
	}

	const minutesByPid: Record<number, number> = {};
	if (input.minutesByPid && typeof input.minutesByPid === "object") {
		for (const [pidString, value2] of Object.entries(input.minutesByPid)) {
			const pid = Number(pidString);
			if (
				Number.isInteger(pid) &&
				typeof value2 === "number" &&
				Number.isFinite(value2)
			) {
				minutesByPid[pid] = clamp(value2, 0, MINUTES_IN_STANDARD_GAME);
			}
		}
	}

	return {
		version: 1,
		mode: "custom",
		...profileFields,
		...autoFields,
		...(input.rosterAutoFillActive === true
			? { rosterAutoFillActive: true }
			: {}),
		minutesByPid,
		numPlayersOnCourtAtSave:
			Number.isInteger(input.numPlayersOnCourtAtSave) &&
			input.numPlayersOnCourtAtSave! > 0
				? input.numPlayersOnCourtAtSave
				: undefined,
		...(noInjuryMinutesIncreasePids.length > 0
			? { noInjuryMinutesIncreasePids }
			: {}),
		...currentOverrideFields,
	};
};
