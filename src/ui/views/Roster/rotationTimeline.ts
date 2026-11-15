/**
 * Reference rotation timeline for the basketball Roster page.
 *
 * This turns a minutes plan (minutes per player) into a deterministic schedule
 * where, at every instant of regulation, exactly `numPlayersOnCourt` players
 * are on the court and every player's on-court time equals his planned minutes
 * (to the second). It is a read-only visualization of the plan. It is NOT a
 * record or prediction of GameSim substitutions: real games substitute at dead
 * balls with random noise, fouls, blowouts and overtime, so every real game is
 * different. The chart is one typical game, not the game.
 *
 * Method: a deterministic walk through the same substitution rule that
 * GameSim.basketball uses for planned minutes, with no game being simulated.
 *
 * - The first players with planned minutes in roster order start, like in
 *   GameSim. Nobody is substituted in the first 5 minutes.
 * - Every 90 seconds (GameSim only substitutes at dead balls) each player gets
 *   a value: a stand-in for his rating that rises with planned minutes, times
 *   fatigue, times a small fixed pseudo-random factor, times GameSim's
 *   dynamic minutes multiplier, which grows when he is behind the pace of his
 *   plan and shrinks when he is ahead. A reserve replaces a player on the
 *   court when his value is higher, both have been on the court/bench for more
 *   than their timers, and GameSim's position balance check allows it.
 * - Totals are made exact in two steps. During the walk, at those same
 *   decision times only, a player leaves when staying on until the next
 *   decision would miss his total by more than leaving now, and a player
 *   enters by the same reasoning, always one for one. That keeps everybody
 *   within about 45 seconds of his plan. Afterwards the remaining seconds are
 *   moved between players by shifting existing substitutions a little (never
 *   by adding one, and never squeezing a stint or a rest below a minute).
 *   GameSim itself only gets within about a minute of the plan.
 * - For the rare plan where that shifting is not possible, the walk falls
 *   back to two hard rules that are exact by construction but can leave very
 *   short stints: a player with no planned time left leaves at that second,
 *   and a player who needs every remaining second enters at that second.
 * - The walk is repeated for a few fixed seeds and the most typical result is
 *   kept: the one closest to the average pair overlaps and per-period minutes
 *   of all results.
 *
 * Measured against real GameSim games of all 30 teams of a real league (see
 * the audit notes in the project's research folder), this chart agrees with a
 * real game about as well as two real games agree with each other. No fixed
 * chart can do better than that by much, because after the first period
 * GameSim has little repeatable structure.
 *
 * The chart shows a game in which the plan is followed to the end. In GameSim
 * that is the minority: once a game is decided (down to a lead of 10 in the
 * last minute) it drops the plan and empties the bench, which no chart that
 * does not know the score can show. The end of the chart is therefore how a
 * close game ends, with exact minutes. In real close games the best players
 * usually finish and end up a minute or so over their plan.
 *
 * Limits: real ratings and endurance are not used (planned minutes stand in
 * for value, so nothing is leaked when ratings are hidden); fouls, blowouts,
 * injuries during the game and overtime are not modeled; a small change of the
 * plan can move many substitutions, like a different game would; no individual
 * PG/SG/SF/PF/C assignment is made and position balance is only as strict as
 * GameSim's own check; a player planned for a few seconds is shown for
 * exactly those seconds.
 */

export type RotationTimelinePlayer = {
	pid: number;
	pos: string;
};

export type RotationTimelineStint = {
	// Minutes from the start of the game
	start: number;
	end: number;
};

export type RotationTimelineRow = {
	pid: number;
	pos: string;
	// Planned minutes as displayed on-court time, exact to the second
	minutes: number;
	seconds: number;
	stints: RotationTimelineStint[];
};

export type RotationTimelineSegment = {
	start: number;
	end: number;
	pids: number[];
};

export type RotationTimelineInvalidReason =
	| "settings"
	| "minutes"
	| "tooManyMinutes"
	| "total";

export type RotationTimeline =
	| {
			valid: true;
			gameMinutes: number;
			numPlayersOnCourt: number;
			// Start of each period after the first, in minutes
			periodBoundaries: number[];
			periodMinutes: number;
			// Players with positive minutes, in roster order
			rows: RotationTimelineRow[];
			// Consecutive intervals covering the whole game, each with a fixed lineup
			segments: RotationTimelineSegment[];
			// Time in lineups that fail GameSim's position balance check
			positionImbalanceMinutes: number;
	  }
	| {
			valid: false;
			reason: RotationTimelineInvalidReason;
			message: string;
	  };

// Total rounding slack allowed between the plan and an exact schedule
const TOTAL_TOLERANCE_SECONDS = 1;

// Copies of the constants GameSim.basketball uses for planned minutes. A test
// compares them with the originals, so that a change there is noticed here.
export const ROTATION_TIMELINE_GAME_SIM = {
	dynamicMinutes: {
		gain: 4,
		stabilityFloorMinutes: 4,
		minMultiplier: 0.35,
		maxMultiplier: 2.4,
		fatigueEnergySoft: 0.68,
		fatigueEnergyHard: 0.5,
		continuousStintSoft: 10,
		continuousStintHard: 14,
		fatiguePositiveCapSoft: 1.75,
		fatiguePositiveCapHard: 1.1,
		tinyTargetMaxMinutes: 6,
		tinyCompletionToleranceMinutes: 0.75,
		tinyReentryMaxMultiplier: 0.2,
	},
	planAwareCourtTimerBlend: 0.75,
	// Energy lost per minute on the court is fatigueFactor * (1 - endurance)
	fatigueFactor: 0.055,
	benchRecoveryPerMinute: 0.094,
	// Timers must be above this for a substitution
	minTimerMinutes: 2,
	// Everybody starts with this court timer, so nobody is replaced before
	// minTimerMinutes - initialCourtTimer = 5 minutes
	initialCourtTimer: -3,
	// A substitution resets both timers to a random value within +/- this
	timerResetRange: 2,
	// Random factor on a player's value is within 1 +/- this
	valueNoise: 0.1,
	// A tired player can be replaced even if that breaks position balance
	positionCheckFatigue: 0.728,
} as const;

// Choices of this preview, calibrated against real GameSim games
const DECISION_SECONDS = 90;
const TYPICAL_ENDURANCE = 0.55;
const VALUE_BASE = 40;
const VALUE_PER_PLANNED_MINUTE = 0.6;
const NUM_WALKS = 8;
// Making the totals exact may move a substitution by at most this long, and
// may not squeeze a stint or a rest below the minimum gap
const REPAIR_MAX_SECONDS = 90;
const REPAIR_MIN_GAP_SECONDS = 60;
const REPAIR_STEP_SECONDS = 15;

const formatNumber = (value: number) =>
	Number.isInteger(value) ? String(value) : value.toFixed(1);

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

// Small seeded generator, so that the same plan always gives the same chart
const getRandom = (seed: number) => {
	let state = seed | 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

// Same rule as the substitution position check in GameSim.basketball
export const lineupFailsPositionBalance = (
	positions: string[],
	numPlayersOnCourt: number,
) => {
	let numG = 0;
	let numPG = 0;
	let numF = 0;
	let numC = 0;
	for (const pos of positions) {
		if (pos.includes("G")) {
			numG += 1;
		}
		if (pos === "PG") {
			numPG += 1;
		}
		if (pos.includes("F")) {
			numF += 1;
		}
		if (pos === "C") {
			numC += 1;
		}
	}
	const cutoff = numPlayersOnCourt >= 5 ? 2 : numPlayersOnCourt >= 3 ? 1 : 0;
	return (numG < cutoff && numPG === 0) || (numF < cutoff && numC === 0);
};

const getPlanSeconds = ({
	minutes,
	gameSeconds,
	numPlayersOnCourt,
}: {
	minutes: number[];
	gameSeconds: number;
	numPlayersOnCourt: number;
}): number[] | undefined => {
	const raw = minutes.map((value) => value * 60);
	const seconds = raw.map((value) => Math.min(gameSeconds, Math.round(value)));
	const target = numPlayersOnCourt * gameSeconds;
	let diff = target - seconds.reduce((total, value) => total + value, 0);
	if (diff === 0) {
		return seconds;
	}

	// Give or take single seconds where rounding moved a player the most
	const direction = diff > 0 ? 1 : -1;
	const candidates = seconds
		.map((value, index) => ({
			index,
			residual: (raw[index]! - value) * direction,
		}))
		.filter(({ index }) =>
			direction > 0 ? seconds[index]! < gameSeconds : seconds[index]! > 0,
		)
		.sort((a, b) => b.residual - a.residual || a.index - b.index);
	for (const { index } of candidates) {
		if (diff === 0) {
			break;
		}
		seconds[index]! += direction;
		diff -= direction;
	}

	return diff === 0 ? seconds : undefined;
};

type Walk = {
	// [start, end] in seconds, per player
	stints: [number, number][][];
	// Changes made only to keep the totals exact
	forcedChanges: number;
};

type Swap = { time: number; off: number; on: number };

type FreeWalk = {
	starters: number[];
	swaps: Swap[];
	forcedChanges: number;
	// Seconds on the court, per player
	played: number[];
};

// One deterministic walk through GameSim's substitution rule
const walkRotation = ({
	seconds,
	positions,
	numPlayersOnCourt,
	gameSeconds,
	numPeriods,
	seed,
	strict,
}: {
	// Players with positive planned seconds, in roster order
	seconds: number[];
	positions: string[];
	numPlayersOnCourt: number;
	gameSeconds: number;
	numPeriods: number;
	seed: number;
	// true: totals are forced to be exact during the walk, to the second.
	// false: totals are kept within about half a decision step of the plan, by
	// forcing changes at decision times only, and the result is made exact
	// afterwards by repairWalk.
	strict: boolean;
}): { walk?: Walk; free?: FreeWalk } | undefined => {
	const sim = ROTATION_TIMELINE_GAME_SIM;
	const config = sim.dynamicMinutes;
	const random = getRandom(seed * 7919 + 13);
	const uniform = (min: number, max: number) => min + (max - min) * random();
	const indexes = seconds.map((_, i) => i);
	const regulation = gameSeconds / 60;
	const target = seconds.map((value) => value / 60);
	// Stand-in for a player's rating: more planned minutes, better player
	const value = target.map(
		(minutes) =>
			VALUE_BASE + VALUE_PER_PLANNED_MINUTE * minutes * (48 / regulation),
	);

	const remaining = [...seconds];
	const energy = seconds.map(() => 1);
	const courtTimer = seconds.map<number>(() => sim.initialCourtTimer);
	const benchTimer = seconds.map(() => 0);
	const lastChange = seconds.map(() => 0);
	const completedStint = seconds.map(() => false);
	const stintStart = seconds.map(() => 0);
	const onCourt = seconds.map(() => false);
	const stints: [number, number][][] = seconds.map(() => []);
	const swaps: Swap[] = [];
	let forcedChanges = 0;

	// GameSim looks for a replacement in this order
	const benchOrder = [...indexes].sort(
		(a, b) => target[b]! - target[a]! || a - b,
	);

	// Starters: anyone who never leaves the court, then roster order
	const starters = indexes.filter((i) => seconds[i]! >= gameSeconds);
	for (const i of indexes) {
		if (starters.length >= numPlayersOnCourt) {
			break;
		}
		if (!starters.includes(i)) {
			starters.push(i);
		}
	}
	for (const i of starters) {
		onCourt[i] = true;
	}

	const enter = (i: number, now: number) => {
		onCourt[i] = true;
		// Coming back at the second he left is one stint, not two
		const previous = stints[i]!.at(-1);
		if (previous && previous[1] === now) {
			stints[i]!.pop();
			stintStart[i] = previous[0];
		} else {
			stintStart[i] = now;
		}
	};
	const exit = (i: number, now: number) => {
		onCourt[i] = false;
		completedStint[i] = true;
		lastChange[i] = now / 60;
		if (now > stintStart[i]!) {
			stints[i]!.push([stintStart[i]!, now]);
		}
	};
	const getFatigue = (i: number) => Math.min(1, energy[i]! + 0.016);

	// getDynamicMinutesMultiplier in GameSim.basketball/dynamicMinutes.ts
	const getMultiplier = (i: number, elapsed: number) => {
		const played = (seconds[i]! - remaining[i]!) / 60;
		const deficit = target[i]! * (elapsed / regulation) - played;
		const denominator = Math.max(
			config.stabilityFloorMinutes * (regulation / 48),
			regulation - elapsed,
		);
		const raw = clamp(
			Math.exp(config.gain * (deficit / denominator)),
			config.minMultiplier,
			config.maxMultiplier,
		);
		let multiplier = raw;
		if (onCourt[i] && raw > 1) {
			const fatigueSeverity = clamp(
				(config.fatigueEnergySoft - energy[i]!) /
					(config.fatigueEnergySoft - config.fatigueEnergyHard),
				0,
				1,
			);
			const stintSeverity = clamp(
				(Math.max(0, courtTimer[i]!) - config.continuousStintSoft) /
					(config.continuousStintHard - config.continuousStintSoft),
				0,
				1,
			);
			const severity = Math.max(fatigueSeverity, stintSeverity);
			if (severity > 0) {
				multiplier = Math.min(
					multiplier,
					config.fatiguePositiveCapSoft +
						severity *
							(config.fatiguePositiveCapHard - config.fatiguePositiveCapSoft),
				);
			}
		}
		const tinyTargetServed =
			target[i]! < config.tinyTargetMaxMinutes &&
			completedStint[i] &&
			played >= Math.max(0, target[i]! - config.tinyCompletionToleranceMinutes);
		if (tinyTargetServed && !onCourt[i]) {
			multiplier = Math.min(multiplier, config.tinyReentryMaxMultiplier);
		}
		return multiplier;
	};

	const substitute = (off: number, on: number, now: number) => {
		const elapsed = now / 60;
		const benchMinutes = Math.max(0, elapsed - lastChange[on]!);
		exit(off, now);
		enter(on, now);
		swaps.push({ time: now, off, on });
		const range = sim.timerResetRange;
		courtTimer[on] = uniform(-range, range);
		benchTimer[on] = uniform(-range, range);
		courtTimer[off] = uniform(-range, range);
		benchTimer[off] = uniform(-range, range);

		// getPlanAwareCourtTimer: a player who rested longer stays on longer
		const legacyWait = Math.max(0, sim.minTimerMinutes - courtTimer[on]!);
		const restShare = Math.max(0, regulation - target[on]!);
		const remainingNeed = remaining[on]! / 60;
		const pairedWait =
			restShare <= 1e-7
				? remainingNeed
				: benchMinutes * (target[on]! / restShare);
		const desiredWait = Math.min(
			Math.max(0, regulation - elapsed),
			remainingNeed,
			pairedWait,
		);
		courtTimer[on] =
			sim.minTimerMinutes -
			(legacyWait + sim.planAwareCourtTimerBlend * (desiredWait - legacyWait));
		lastChange[on] = elapsed;
	};

	// One substitution opportunity, like a dead ball in GameSim
	const decide = (now: number, step: number) => {
		const elapsed = now / 60;
		const left = gameSeconds - now;
		for (const i of indexes) {
			// A player planned for the whole game is never rested
			if (onCourt[i] && seconds[i]! >= gameSeconds) {
				courtTimer[i] = Math.min(courtTimer[i]!, sim.minTimerMinutes);
			}
		}
		const slack = strict ? 0 : Math.floor(step / 2);
		const pass = (relaxPositions: boolean) => {
			let substitutions = false;
			const values = indexes.map(
				(i) =>
					value[i]! *
					getFatigue(i) *
					uniform(1 - sim.valueNoise, 1 + sim.valueNoise) *
					getMultiplier(i, elapsed),
			);
			const worstFirst = indexes
				.filter((i) => onCourt[i])
				.sort((a, b) => values[a]! - values[b]! || a - b);
			for (const off of worstFirst) {
				// Someone who needs every remaining second has to stay
				if (remaining[off]! >= left - slack) {
					continue;
				}
				for (const on of benchOrder) {
					if (onCourt[on] || remaining[on]! <= slack) {
						continue;
					}
					if (
						!(
							courtTimer[off]! > sim.minTimerMinutes &&
							benchTimer[on]! > sim.minTimerMinutes &&
							values[on]! > values[off]!
						)
					) {
						continue;
					}
					if (!relaxPositions) {
						const lineup = indexes
							.filter((i) => (onCourt[i] && i !== off) || i === on)
							.map((i) => positions[i]!);
						if (
							lineupFailsPositionBalance(lineup, numPlayersOnCourt) &&
							getFatigue(off) > sim.positionCheckFatigue
						) {
							continue;
						}
					}
					substitute(off, on, now);
					substitutions = true;
					break;
				}
			}
			return substitutions;
		};
		if (!pass(false)) {
			pass(true);
		}
	};

	// Exact totals: a player with no time left leaves, a player who needs all
	// of the remaining time enters. Returns false if that is impossible, which
	// cannot happen for a plan that adds up.
	const enforce = (now: number) => {
		const left = gameSeconds - now;
		const mustLeave = indexes.filter((i) => onCourt[i] && remaining[i]! <= 0);
		const mustEnter = indexes.filter(
			(i) => !onCourt[i] && remaining[i]! >= left,
		);
		if (mustLeave.length === 0 && mustEnter.length === 0) {
			return true;
		}
		const reset = (i: number) => {
			courtTimer[i] = 0;
			benchTimer[i] = 0;
			forcedChanges += 1;
		};
		for (const i of mustLeave) {
			exit(i, now);
			reset(i);
		}
		for (const i of mustEnter) {
			enter(i, now);
			reset(i);
		}
		let count = onCourt.filter(Boolean).length;
		while (count > numPlayersOnCourt) {
			// Take off whoever can best afford to sit
			let off = -1;
			for (const i of indexes) {
				if (
					onCourt[i] &&
					remaining[i]! < left &&
					(off < 0 || remaining[i]! < remaining[off]!)
				) {
					off = i;
				}
			}
			if (off < 0) {
				return false;
			}
			exit(off, now);
			reset(off);
			count -= 1;
		}
		while (count < numPlayersOnCourt) {
			// Bring on whoever has the most left to play
			let on = -1;
			for (const i of indexes) {
				if (
					!onCourt[i] &&
					remaining[i]! > 0 &&
					(on < 0 || remaining[i]! > remaining[on]!)
				) {
					on = i;
				}
			}
			if (on < 0) {
				return false;
			}
			enter(on, now);
			reset(on);
			count += 1;
		}
		return true;
	};

	// Like enforce, but only at decision times and only to the nearest half
	// step: a player leaves when staying until the next decision would miss his
	// total by more than leaving now, and enters by the same reasoning. Every
	// change is a one for one substitution.
	const enforceSoft = (now: number, step: number) => {
		const left = gameSeconds - now;
		const slack = Math.floor(step / 2);
		const leaving = indexes.filter(
			(i) => onCourt[i] && remaining[i]! <= slack && seconds[i]! < gameSeconds,
		);
		const entering = indexes.filter(
			(i) =>
				!onCourt[i] &&
				((remaining[i]! > slack && remaining[i]! >= left - slack) ||
					// Last chance for somebody planned for less than the slack
					(left <= step && remaining[i]! > 0 && stints[i]!.length === 0)),
		);
		while (entering.length > leaving.length) {
			// Take off whoever can best afford to sit
			let off = -1;
			for (const i of indexes) {
				if (
					onCourt[i] &&
					!leaving.includes(i) &&
					remaining[i]! < left - slack &&
					(off < 0 || remaining[i]! < remaining[off]!)
				) {
					off = i;
				}
			}
			if (off < 0 && left <= step) {
				// Nobody can afford it, but there will be no other chance
				for (const i of indexes) {
					if (
						onCourt[i] &&
						!leaving.includes(i) &&
						remaining[i]! < left &&
						(off < 0 || remaining[i]! < remaining[off]!)
					) {
						off = i;
					}
				}
			}
			if (off < 0) {
				entering.pop();
			} else {
				leaving.push(off);
			}
		}
		while (leaving.length > entering.length) {
			// Bring on whoever has the most left to play
			let on = -1;
			for (const i of indexes) {
				if (
					!onCourt[i] &&
					!entering.includes(i) &&
					remaining[i]! > slack &&
					(on < 0 || remaining[i]! > remaining[on]!)
				) {
					on = i;
				}
			}
			if (on < 0) {
				leaving.pop();
			} else {
				entering.push(on);
			}
		}
		for (const [k, off] of leaving.entries()) {
			const on = entering[k]!;
			exit(off, now);
			enter(on, now);
			swaps.push({ time: now, off, on });
			for (const i of [off, on]) {
				courtTimer[i] = 0;
				benchTimer[i] = 0;
			}
			lastChange[on] = now / 60;
			forcedChanges += 1;
		}
	};

	// Whole seconds at which a period starts, after the first
	const periodStarts = new Set<number>();
	for (let period = 1; period < numPeriods; period++) {
		periodStarts.add(Math.round((period * gameSeconds) / numPeriods));
	}

	let now = 0;
	while (now < gameSeconds) {
		// Next second at which anything can change
		let next = Math.min(
			gameSeconds,
			(Math.floor(now / DECISION_SECONDS) + 1) * DECISION_SECONDS,
		);
		for (const start of periodStarts) {
			if (start > now && start < next) {
				next = start;
			}
		}
		if (strict) {
			for (const i of indexes) {
				if (onCourt[i]) {
					next = Math.min(next, now + remaining[i]!);
				} else if (remaining[i]! > 0) {
					next = Math.min(next, gameSeconds - remaining[i]!);
				}
			}
		}
		if (next <= now) {
			// Exact totals are no longer reachable. Cannot happen, see enforce.
			return undefined;
		}

		const minutes = (next - now) / 60;
		for (const i of indexes) {
			if (onCourt[i]) {
				remaining[i]! -= next - now;
				courtTimer[i]! += minutes;
				energy[i] = Math.max(
					0,
					energy[i]! - minutes * sim.fatigueFactor * (1 - TYPICAL_ENDURANCE),
				);
			} else {
				benchTimer[i]! += minutes;
				energy[i] = Math.min(
					1,
					energy[i]! + minutes * sim.benchRecoveryPerMinute,
				);
			}
		}
		now = next;
		if (now >= gameSeconds) {
			break;
		}

		if (strict && !enforce(now)) {
			return undefined;
		}
		if (now % DECISION_SECONDS === 0 || periodStarts.has(now)) {
			// Time until the next decision
			let step = Math.min(
				gameSeconds - now,
				DECISION_SECONDS - (now % DECISION_SECONDS),
			);
			for (const start of periodStarts) {
				if (start > now && start - now < step) {
					step = start - now;
				}
			}
			if (!strict) {
				enforceSoft(now, step);
			}
			decide(now, step);
			if (strict && !enforce(now)) {
				return undefined;
			}
		}
	}

	if (!strict) {
		return {
			free: {
				starters,
				swaps,
				forcedChanges,
				played: indexes.map((i) => seconds[i]! - remaining[i]!),
			},
		};
	}

	for (const i of indexes) {
		if (onCourt[i]) {
			exit(i, gameSeconds);
		}
		if (remaining[i] !== 0) {
			return undefined;
		}
	}

	return { walk: { stints, forcedChanges } };
};

// Make the totals of a free walk exact by moving its substitutions a little.
// Moving a substitution later gives that time to the player leaving and takes
// it from the player entering, so this is a flow of seconds between players
// along substitutions. No substitution is added or removed, and no stint or
// rest is squeezed below REPAIR_MIN_GAP_SECONDS.
const repairWalk = ({
	free,
	seconds,
	gameSeconds,
}: {
	free: FreeWalk;
	seconds: number[];
	gameSeconds: number;
}): Walk | undefined => {
	const { starters, swaps } = free;
	const numPlayers = seconds.length;
	const events: number[][] = seconds.map(() => []);
	for (const [k, swap] of swaps.entries()) {
		events[swap.off]!.push(k);
		events[swap.on]!.push(k);
	}

	// For each substitution, the changes before and after it that it must keep
	// a distance from: [other substitution or -1 for the start/end, distance]
	const before: [number, number][][] = swaps.map(() => []);
	const after: [number, number][][] = swaps.map(() => []);
	for (const [k, swap] of swaps.entries()) {
		for (const i of [swap.off, swap.on]) {
			const position = events[i]!.indexOf(k);
			const previous = events[i]![position - 1] ?? -1;
			const next = events[i]![position + 1] ?? -1;
			const enters = swap.on === i;
			const gapBefore = swap.time - (previous < 0 ? 0 : swaps[previous]!.time);
			const gapAfter = (next < 0 ? gameSeconds : swaps[next]!.time) - swap.time;
			// He is on the court before leaving and after entering. Sitting from
			// the start or until the end can be any length.
			before[k]!.push([
				previous,
				enters
					? previous < 0
						? 0
						: Math.min(gapBefore, REPAIR_MIN_GAP_SECONDS)
					: Math.min(gapBefore, REPAIR_MIN_GAP_SECONDS, seconds[i]!),
			]);
			after[k]!.push([
				next,
				enters
					? Math.min(gapAfter, REPAIR_MIN_GAP_SECONDS, seconds[i]!)
					: next < 0
						? 0
						: Math.min(gapAfter, REPAIR_MIN_GAP_SECONDS),
			]);
		}
	}

	const shift = swaps.map(() => 0);
	const timeOf = (k: number, edge: number) =>
		k < 0 ? edge : swaps[k]!.time + shift[k]!;
	// How far a substitution can still move earlier and later
	const roomDown = (k: number) => {
		let room = REPAIR_MAX_SECONDS + shift[k]!;
		for (const [other, gap] of before[k]!) {
			room = Math.min(room, timeOf(k, 0) - timeOf(other, 0) - gap);
		}
		return room;
	};
	const roomUp = (k: number) => {
		let room = REPAIR_MAX_SECONDS - shift[k]!;
		for (const [other, gap] of after[k]!) {
			room = Math.min(room, timeOf(other, gameSeconds) - timeOf(k, 0) - gap);
		}
		return room;
	};

	const need = seconds.map((value, i) => value - free.played[i]!);
	for (;;) {
		// Player with the most time to give away
		let source = -1;
		for (let i = 0; i < numPlayers; i++) {
			if (need[i]! < 0 && (source < 0 || need[i]! < need[source]!)) {
				source = i;
			}
		}
		if (source < 0) {
			break;
		}

		// Widest path from him to anybody who needs time
		const width = seconds.map(() => 0);
		const via = seconds.map(() => -1);
		const done = seconds.map(() => false);
		width[source] = Infinity;
		for (;;) {
			let u = -1;
			for (let i = 0; i < numPlayers; i++) {
				if (!done[i] && width[i]! > 0 && (u < 0 || width[i]! > width[u]!)) {
					u = i;
				}
			}
			if (u < 0) {
				break;
			}
			done[u] = true;
			for (const k of events[u]!) {
				const swap = swaps[k]!;
				// Time goes from the entering to the leaving player when the
				// substitution moves later
				const capacity = swap.on === u ? roomUp(k) : roomDown(k);
				const v = swap.on === u ? swap.off : swap.on;
				const candidate = Math.min(width[u]!, capacity);
				if (!done[v] && candidate > width[v]!) {
					width[v] = candidate;
					via[v] = k;
				}
			}
		}
		let destination = -1;
		for (let i = 0; i < numPlayers; i++) {
			if (
				need[i]! > 0 &&
				width[i]! > 0 &&
				(destination < 0 || width[i]! > width[destination]!)
			) {
				destination = i;
			}
		}
		if (destination < 0) {
			return undefined;
		}
		const path: [number, number][] = [];
		for (let v = destination; v !== source; ) {
			const k = via[v]!;
			const swap = swaps[k]!;
			if (swap.off === v) {
				path.push([k, 1]);
				v = swap.on;
			} else {
				path.push([k, -1]);
				v = swap.off;
			}
		}
		let amount = Math.min(
			width[destination]!,
			-need[source]!,
			need[destination]!,
			REPAIR_STEP_SECONDS,
		);
		// Two substitutions on the path can share a gap, so check the result
		for (; amount > 0; amount = Math.floor(amount / 2)) {
			for (const [k, direction] of path) {
				shift[k]! += direction * amount;
			}
			if (path.every(([k]) => roomDown(k) >= 0 && roomUp(k) >= 0)) {
				break;
			}
			for (const [k, direction] of path) {
				shift[k]! -= direction * amount;
			}
		}
		if (amount <= 0) {
			return undefined;
		}
		need[source]! += amount;
		need[destination]! -= amount;
	}

	const stints: [number, number][][] = seconds.map(() => []);
	const stintStart = seconds.map<number>((_, i) =>
		starters.includes(i) ? 0 : -1,
	);
	const moved = swaps
		.map((swap, k) => ({ ...swap, time: swap.time + shift[k]!, k }))
		.sort((a, b) => a.time - b.time || a.k - b.k);
	for (const swap of moved) {
		if (stintStart[swap.off]! < 0 || stintStart[swap.on]! >= 0) {
			return undefined;
		}
		if (swap.time > stintStart[swap.off]!) {
			stints[swap.off]!.push([stintStart[swap.off]!, swap.time]);
		}
		stintStart[swap.off] = -1;
		stintStart[swap.on] = swap.time;
	}
	for (let i = 0; i < numPlayers; i++) {
		if (stintStart[i]! >= 0 && stintStart[i]! < gameSeconds) {
			stints[i]!.push([stintStart[i]!, gameSeconds]);
		}
		const total = stints[i]!.reduce((sum, [a, b]) => sum + b - a, 0);
		if (total !== seconds[i]) {
			return undefined;
		}
	}
	return { stints, forcedChanges: free.forcedChanges };
};

type WalkSummary = {
	walk: Walk;
	// Consecutive [start, end, player indexes] in seconds
	segments: [number, number, number[]][];
	// Pair overlaps and per-period minutes, used to find the most typical walk
	features: number[];
};

const summarizeWalk = ({
	walk,
	numPlayersOnCourt,
	gameSeconds,
	numPeriods,
}: {
	walk: Walk;
	numPlayersOnCourt: number;
	gameSeconds: number;
	numPeriods: number;
}): WalkSummary | undefined => {
	const numPlayers = walk.stints.length;
	const boundaries = new Set<number>([0, gameSeconds]);
	for (const stints of walk.stints) {
		for (const [start, end] of stints) {
			boundaries.add(start);
			boundaries.add(end);
		}
	}
	const sorted = Array.from(boundaries).sort((a, b) => a - b);
	const segments: [number, number, number[]][] = [];
	const together = Array.from({ length: numPlayers * numPlayers }, () => 0);
	const byPeriod = Array.from({ length: numPlayers * numPeriods }, () => 0);
	for (let s = 0; s < sorted.length - 1; s++) {
		const start = sorted[s]!;
		const end = sorted[s + 1]!;
		const lineup: number[] = [];
		for (const [i, stints] of walk.stints.entries()) {
			if (stints.some(([a, b]) => a <= start && end <= b)) {
				lineup.push(i);
			}
		}
		if (lineup.length !== numPlayersOnCourt) {
			return undefined;
		}
		segments.push([start, end, lineup]);
		for (const a of lineup) {
			for (const b of lineup) {
				if (a < b) {
					together[a * numPlayers + b]! += (end - start) / 60;
				}
			}
			for (let period = 0; period < numPeriods; period++) {
				const from = (period * gameSeconds) / numPeriods;
				const to = ((period + 1) * gameSeconds) / numPeriods;
				const overlap = Math.min(end, to) - Math.max(start, from);
				if (overlap > 0) {
					byPeriod[a * numPeriods + period]! += overlap / 60;
				}
			}
		}
	}
	return { walk, segments, features: [...together, ...byPeriod] };
};

export const buildRotationTimeline = ({
	players,
	minutesByPid,
	numPlayersOnCourt,
	gameMinutes,
	numPeriods,
}: {
	// Roster order
	players: RotationTimelinePlayer[];
	minutesByPid: Record<number, number | undefined>;
	numPlayersOnCourt: number;
	// Length of regulation in the same units as minutesByPid
	gameMinutes: number;
	numPeriods: number;
}): RotationTimeline => {
	const gameSeconds = Math.round(gameMinutes * 60);
	if (
		!Number.isInteger(numPlayersOnCourt) ||
		numPlayersOnCourt < 1 ||
		!Number.isInteger(numPeriods) ||
		numPeriods < 1 ||
		!Number.isFinite(gameMinutes) ||
		gameSeconds < 1
	) {
		return {
			valid: false,
			reason: "settings",
			message: "Rotation timeline is not available for these game settings.",
		};
	}

	const minutes = players.map((p) => minutesByPid[p.pid] ?? 0);
	if (minutes.some((value) => !Number.isFinite(value) || value < 0)) {
		return {
			valid: false,
			reason: "minutes",
			message: "Enter valid minutes for every player to see the timeline.",
		};
	}
	if (minutes.some((value) => value * 60 > gameSeconds + 0.5)) {
		return {
			valid: false,
			reason: "tooManyMinutes",
			message: `No player can be planned for more than ${formatNumber(gameMinutes)} minutes.`,
		};
	}

	const required = numPlayersOnCourt * gameMinutes;
	const total = minutes.reduce((sum, value) => sum + value, 0);
	const planSeconds =
		Math.abs(total - required) * 60 <= TOTAL_TOLERANCE_SECONDS
			? getPlanSeconds({ minutes, gameSeconds, numPlayersOnCourt })
			: undefined;
	if (!planSeconds) {
		return {
			valid: false,
			reason: "total",
			message: `Planned minutes total ${formatNumber(Number(total.toFixed(1)))}, but the timeline needs exactly ${formatNumber(required)}.`,
		};
	}

	const active = players
		.map((p, i) => ({ pid: p.pid, pos: p.pos, seconds: planSeconds[i]! }))
		.filter((p) => p.seconds > 0);
	const positions = active.map((p) =>
		typeof p.pos === "string" ? p.pos.toUpperCase() : "",
	);

	// Several walks, keep the most typical one
	const walkInput = {
		seconds: active.map((p) => p.seconds),
		positions,
		numPlayersOnCourt,
		gameSeconds,
		numPeriods,
	};
	const summaries: WalkSummary[] = [];
	for (let seed = 1; seed <= NUM_WALKS; seed++) {
		const free = walkRotation({ ...walkInput, seed, strict: false })?.free;
		const walk =
			(free
				? repairWalk({ free, seconds: walkInput.seconds, gameSeconds })
				: undefined) ??
			// Exact by construction, for the rare plan that cannot be repaired
			walkRotation({ ...walkInput, seed, strict: true })?.walk;
		const summary = walk
			? summarizeWalk({ walk, numPlayersOnCourt, gameSeconds, numPeriods })
			: undefined;
		if (summary) {
			summaries.push(summary);
		}
	}
	let best: WalkSummary | undefined;
	let bestCost = Infinity;
	for (const summary of summaries) {
		let cost = summary.walk.forcedChanges;
		for (const [j, feature] of summary.features.entries()) {
			const center =
				summaries.reduce((sum, other) => sum + other.features[j]!, 0) /
				summaries.length;
			cost += (feature - center) ** 2;
		}
		if (cost < bestCost) {
			best = summary;
			bestCost = cost;
		}
	}
	if (!best) {
		// Never show a chart that is not exact
		return {
			valid: false,
			reason: "total",
			message: "Rotation timeline could not be built for this plan.",
		};
	}

	const toMinutes = (seconds: number) => seconds / 60;
	const periodMinutes = gameMinutes / numPeriods;
	let positionImbalanceSeconds = 0;
	for (const [start, end, lineup] of best.segments) {
		if (
			lineupFailsPositionBalance(
				lineup.map((i) => positions[i]!),
				numPlayersOnCourt,
			)
		) {
			positionImbalanceSeconds += end - start;
		}
	}

	return {
		valid: true,
		gameMinutes,
		numPlayersOnCourt,
		periodBoundaries: Array.from(
			{ length: numPeriods - 1 },
			(_, i) => (i + 1) * periodMinutes,
		),
		periodMinutes,
		rows: active.map((p, index) => ({
			pid: p.pid,
			pos: p.pos,
			minutes: p.seconds / 60,
			seconds: p.seconds,
			stints: best.walk.stints[index]!.map(([start, end]) => ({
				start: toMinutes(start),
				end: toMinutes(end),
			})),
		})),
		segments: best.segments.map(([start, end, lineup]) => ({
			start: toMinutes(start),
			end: toMinutes(end),
			pids: lineup.map((i) => active[i]!.pid),
		})),
		positionImbalanceMinutes: toMinutes(positionImbalanceSeconds),
	};
};

export const getRotationTimelineSegment = (
	timeline: Extract<RotationTimeline, { valid: true }>,
	minute: number,
): RotationTimelineSegment => {
	const clamped = Math.min(Math.max(minute, 0), timeline.gameMinutes);
	return (
		timeline.segments.find(
			(segment) => segment.start <= clamped && clamped < segment.end,
		) ?? timeline.segments.at(-1)!
	);
};
