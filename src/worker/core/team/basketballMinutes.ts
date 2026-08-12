import type { BasketballRotation } from "../../../common/types.ts";
import { getAutoMinutesSoftCap } from "../GameSim.basketball/getMinutesLimitFactor.ts";

const EPSILON = 1e-7;
const MINUTES_IN_STANDARD_GAME = 48;

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export type BasketballMinutesPlayer = {
	pid: number;
	rosterOrder: number;
	/** Endurance on a 0-1 scale. The caller decides whether this is fuzzed. */
	endurance: number;
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

export const generateBasketballAutoMinutes = ({
	players,
	numPlayersOnCourt,
	playoffs,
}: {
	players: BasketballMinutesPlayer[];
	numPlayersOnCourt: number;
	playoffs: boolean;
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
	// BBGM's legacy Auto behavior reliably used about 11 players in the regular
	// season and about 10 in the playoffs. Treat the soft-cap curve as an
	// allocation signal, rather than allocating its long low-minute tail. The
	// playoff curve is intentionally steeper, matching the old shorter rotation,
	// while the regular-season depth keeps one additional usable player.
	const rotationDepth = Math.min(
		ordered.length,
		Math.max(numPlayersOnCourt, playoffs ? 10 : 11),
	);
	const weightExponent = playoffs ? 1.5 : 1.25;
	const weights = new Map(
		ordered.map((p, rosterIndex) => [
			p.pid,
			rosterIndex < rotationDepth
				? getAutoMinutesSoftCap({
						availablePlayers: ordered.length,
						endurance: clamp(p.endurance, 0, 1),
						playoffs,
						ptModifier: 1,
						regulationMinutes: MINUTES_IN_STANDARD_GAME,
						rosterIndex,
					}) ** weightExponent
				: 0,
		]),
	);

	// The old values are soft caps, not allocations, and their deep-roster floor
	// sums above the team total. Converting only the established rotation depth to
	// allocation weights avoids a stream of 0.5-2 minute targets while preserving
	// the old ordering/endurance/depth signal. Any deep player can still enter via
	// the game's emergency or garbage-time rules.
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
}: {
	players: Pick<BasketballMinutesPlayer, "pid">[];
	minutesByPid: Record<number, number>;
	numPlayersOnCourt: number;
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

	const required = MINUTES_IN_STANDARD_GAME * numPlayersOnCourt;
	if (Math.abs(total - required) > EPSILON) {
		return `Planned minutes must total ${required}`;
	}
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
}: {
	players: BasketballMinutesPlayer[];
	minutesByPid: Record<number, number> | undefined;
	numPlayersOnCourt: number;
	playoffs: boolean;
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
	});
	const weights = new Map(
		ordered.map((p) => [
			p.pid,
			clamp(minutesByPid?.[p.pid] ?? 0, 0, MINUTES_IN_STANDARD_GAME),
		]),
	);
	let positive = ordered.filter((p) => (weights.get(p.pid) ?? 0) > EPSILON);

	if (positive.length === 0) {
		return auto;
	}
	if (positive.length < numPlayersOnCourt) {
		const toPromote = ordered
			.filter((p) => (weights.get(p.pid) ?? 0) <= EPSILON)
			.sort(
				(a, b) =>
					(auto[b.pid] ?? 0) - (auto[a.pid] ?? 0) ||
					a.rosterOrder - b.rosterOrder ||
					a.pid - b.pid,
			)
			.slice(0, numPlayersOnCourt - positive.length);
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
	if (rotation?.mode === "custom") {
		return {
			mode: "custom" as const,
			minutesByPid: legalizeBasketballCustomMinutes({
				players,
				minutesByPid: rotation.minutesByPid,
				numPlayersOnCourt,
				playoffs,
			}),
		};
	}

	return {
		mode: "auto" as const,
		minutesByPid: generateBasketballAutoMinutes({
			players,
			numPlayersOnCourt,
			playoffs,
		}),
	};
};

export const getGameEffectiveBasketballMinutes = ({
	players,
	minutesByPid,
	numPlayersOnCourt,
	regulationMinutes,
}: {
	players: (BasketballMinutesPlayer & {
		available: boolean;
		value: number;
	})[];
	minutesByPid: Record<number, number>;
	numPlayersOnCourt: number;
	regulationMinutes: number;
}) => {
	const ordered = getOrderedPlayers(players);
	const available = ordered.filter((p) => p.available);
	if (available.length < numPlayersOnCourt) {
		throw new Error("Not enough available players for a basketball game");
	}

	const scale = regulationMinutes / MINUTES_IN_STANDARD_GAME;
	if (available.length === ordered.length) {
		return Object.fromEntries(
			ordered.map((p) => [
				p.pid,
				Math.max(0, minutesByPid[p.pid] ?? 0) * scale,
			]),
		) as Record<number, number>;
	}
	const weights = new Map(
		available.map((p) => [
			p.pid,
			Math.max(0, minutesByPid[p.pid] ?? 0) * scale,
		]),
	);
	let positive = available.filter((p) => (weights.get(p.pid) ?? 0) > EPSILON);
	if (positive.length < numPlayersOnCourt) {
		const emergency = available
			.filter((p) => (weights.get(p.pid) ?? 0) <= EPSILON)
			.sort(
				(a, b) =>
					b.value - a.value || a.rosterOrder - b.rosterOrder || a.pid - b.pid,
			)
			.slice(0, numPlayersOnCourt - positive.length);
		for (const p of emergency) {
			weights.set(p.pid, Math.min(scale, regulationMinutes));
		}
		positive = available.filter((p) => (weights.get(p.pid) ?? 0) > EPSILON);
	}

	const effective = allocateWeighted({
		players: positive,
		weights,
		total: regulationMinutes * numPlayersOnCourt,
		cap: regulationMinutes,
	});
	return Object.fromEntries(
		ordered.map((p) => [p.pid, p.available ? (effective.get(p.pid) ?? 0) : 0]),
	) as Record<number, number>;
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
	if (input.mode === "auto") {
		return { version: 1, mode: "auto" };
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
		minutesByPid,
		numPlayersOnCourtAtSave:
			Number.isInteger(input.numPlayersOnCourtAtSave) &&
			input.numPlayersOnCourtAtSave! > 0
				? input.numPlayersOnCourtAtSave
				: undefined,
	};
};
