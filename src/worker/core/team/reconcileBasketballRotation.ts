import { PHASE, isSport } from "../../../common/index.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	fillBasketballRosterVacancy,
	cleanupBasketballCurrentMinutesOverrideState,
	getBasketballRotationPlayerInput,
	getLeagueRotationOvrPercentiles,
	legalizeBasketballCustomMinutes,
	validateBasketballMinutes,
} from "./basketballMinutes.ts";

/**
 * Reconcile persisted Custom intent once, after a roster transaction is fully
 * complete. Auto plans are derived on demand and never need a database write.
 */
const reconcileBasketballRotation = async (
	tids: Iterable<number>,
	options: {
		cache?: typeof idb.cache;
		numPlayersOnCourt?: number;
		playoffs?: boolean;
		challengeNoRatings?: boolean;
		regulationMinutes?: number;
		rotationOvrPercentiles?: ReadonlyMap<number, number>;
	} = {},
) => {
	if (!isSport("basketball")) {
		return;
	}

	const cache = options.cache ?? idb.cache;
	const numPlayersOnCourt =
		options.numPlayersOnCourt ?? g.get("numPlayersOnCourt");
	const playoffs = options.playoffs ?? g.get("phase") === PHASE.PLAYOFFS;
	const challengeNoRatings =
		options.challengeNoRatings ?? g.get("challengeNoRatings");
	const regulationMinutes =
		options.regulationMinutes ?? g.get("quarterLength") * g.get("numPeriods");
	const rotationOvrPercentiles =
		options.rotationOvrPercentiles ??
		(!challengeNoRatings
			? getLeagueRotationOvrPercentiles(
					await cache.players.indexGetAll("playersByTid", [0, Infinity]),
				)
			: undefined);
	for (const tid of new Set(tids)) {
		if (tid < 0) {
			continue;
		}
		const t = await cache.teams.get(tid);
		if (!t?.basketballRotation) {
			continue;
		}
		const players = await cache.players.indexGetAll("playersByTid", tid);
		const rotation = t.basketballRotation;
		if (
			rotation.currentMinutesOverrideByPid !== undefined ||
			rotation.currentMinutesOverrideContext !== undefined
		) {
			// Revalidate the pair even when the roster/availability fingerprint
			// still matches: ratings or derived-plan drift can make a protected
			// pin invalid without changing the stored context.
			const changed = cleanupBasketballCurrentMinutesOverrideState({
				t,
				players,
				rotation,
				numPlayersOnCourt,
				regulationMinutes,
				playoffs,
				challengeNoRatings,
				rotationOvrPercentiles,
			});
			if (changed) {
				await cache.teams.put(t);
			}
		}
		if (rotation.mode !== "custom") {
			continue;
		}
		const {
			reservePriorityPids: legacyReservePriorityPids,
			...rotationWithoutLegacyReserve
		} = rotation as typeof rotation & { reservePriorityPids?: unknown };
		const hasLegacyReservePriority = legacyReservePriorityPids !== undefined;
		if (players.length < numPlayersOnCourt) {
			// The game cannot run with this roster either. Leave the saved intent
			// alone until the roster-size repair adds enough players.
			continue;
		}

		const playerIds = players.map((p) => p.pid);
		const currentMinutes = rotation.minutesByPid;
		const autoFilledPids = new Set(rotation.autoFilledPids ?? []);
		const hasCurrentRosterAndValidEntries =
			currentMinutes !== undefined &&
			validateBasketballMinutes({
				players: playerIds.map((pid) => ({ pid })),
				minutesByPid: currentMinutes,
				numPlayersOnCourt,
			}) === undefined;
		const hasCurrentRosterAndCompleteEntries =
			currentMinutes !== undefined &&
			playerIds.length === Object.keys(currentMinutes).length &&
			playerIds.every((pid) => {
				const value = currentMinutes[pid];
				return (
					typeof value === "number" &&
					Number.isInteger(value) &&
					value >= 0 &&
					value <= 48
				);
			});
		const currentProtected = [...(rotation.noInjuryMinutesIncreasePids ?? [])]
			.filter((pid) => playerIds.includes(pid))
			.toSorted((a, b) => a - b);
		const protectionChanged =
			currentProtected.length !==
				(rotation.noInjuryMinutesIncreasePids ?? []).length ||
			currentProtected.some(
				(pid, index) => pid !== rotation.noInjuryMinutesIncreasePids?.[index],
			);
		const buildRotationPlayers = () =>
			players.map((p) => {
				const ratings = p.ratings.at(-1)!;
				return getBasketballRotationPlayerInput({
					pid: p.pid,
					rosterOrder: p.rosterOrder,
					ratings: ratings as unknown as Record<string, unknown>,
					challengeNoRatings,
					useFuzzedRatings: true,
					ovrPercentile: rotationOvrPercentiles?.get(p.pid),
				});
			});
		const ownedPids = players
			.filter((p) => {
				const value = currentMinutes?.[p.pid];
				return (
					!autoFilledPids.has(p.pid) &&
					Number.isInteger(value) &&
					value! >= 0 &&
					value! <= 48
				);
			})
			.map((p) => p.pid);
		const saveHybridOwnership = (preserveCurrentOverride = false) => {
			const hybrid = fillBasketballRosterVacancy({
				players: buildRotationPlayers(),
				minutesByPid: currentMinutes,
				ownedPids,
				numPlayersOnCourt,
				playoffs,
				rotationDepth: rotation.rotationDepth,
				coreReliance: rotation.coreReliance,
			});
			t.basketballRotation = {
				version: 1,
				mode: "custom",
				...(rotation.rotationDepth
					? { rotationDepth: rotation.rotationDepth }
					: {}),
				...(rotation.coreReliance
					? { coreReliance: rotation.coreReliance }
					: {}),
				minutesByPid: hybrid.baselineMinutesByPid,
				numPlayersOnCourtAtSave: numPlayersOnCourt,
				...(currentProtected.length > 0
					? { noInjuryMinutesIncreasePids: currentProtected }
					: {}),
				...(hybrid.autoFilledPids.length > 0
					? { autoFilledPids: hybrid.autoFilledPids }
					: {}),
				...(hybrid.rosterAutoFillActive ? { rosterAutoFillActive: true } : {}),
				...(preserveCurrentOverride &&
				rotation.currentMinutesOverrideByPid &&
				rotation.currentMinutesOverrideContext
					? {
							currentMinutesOverrideByPid: rotation.currentMinutesOverrideByPid,
							currentMinutesOverrideContext:
								rotation.currentMinutesOverrideContext,
						}
					: {}),
			};
			return hybrid;
		};

		// A complete integer mapping is the raw user draft, even when its total is
		// temporarily invalid. Only roster membership, court size, or invalid
		// legacy entries justify legalization; roster-order changes alone do not.
		if (
			hasCurrentRosterAndCompleteEntries &&
			rotation.numPlayersOnCourtAtSave === numPlayersOnCourt &&
			(autoFilledPids.size > 0 || rotation.rosterAutoFillActive === true)
		) {
			saveHybridOwnership(true);
			await cache.teams.put(t);
			continue;
		}
		if (
			hasCurrentRosterAndValidEntries &&
			rotation.numPlayersOnCourtAtSave === numPlayersOnCourt &&
			!protectionChanged &&
			!hasLegacyReservePriority
		) {
			continue;
		}

		if (
			hasCurrentRosterAndValidEntries &&
			rotation.numPlayersOnCourtAtSave === numPlayersOnCourt
		) {
			t.basketballRotation = {
				...rotationWithoutLegacyReserve,
				version: 1,
				mode: "custom",
				noInjuryMinutesIncreasePids:
					currentProtected.length > 0 ? currentProtected : undefined,
				autoFilledPids: rotation.autoFilledPids?.filter((pid) =>
					playerIds.includes(pid),
				).length
					? rotation.autoFilledPids.filter((pid) => playerIds.includes(pid))
					: undefined,
			};
			if (currentProtected.length === 0) {
				delete t.basketballRotation!.noInjuryMinutesIncreasePids;
			}
			if (t.basketballRotation!.autoFilledPids?.length === 0) {
				delete t.basketballRotation!.autoFilledPids;
			}
			await cache.teams.put(t);
			continue;
		}

		const currentRosterChanged =
			currentMinutes !== undefined &&
			(playerIds.length !== Object.keys(currentMinutes).length ||
				playerIds.some((pid) => currentMinutes[pid] === undefined));
		if (currentRosterChanged && players.length >= numPlayersOnCourt) {
			saveHybridOwnership();
			await cache.teams.put(t);
			continue;
		}

		const minutesByPid = legalizeBasketballCustomMinutes({
			players: players.map((p) => {
				const ratings = p.ratings.at(-1)!;
				return {
					...getBasketballRotationPlayerInput({
						pid: p.pid,
						rosterOrder: p.rosterOrder,
						ratings: ratings as unknown as Record<string, unknown>,
						challengeNoRatings,
						useFuzzedRatings: true,
						ovrPercentile: rotationOvrPercentiles?.get(p.pid),
					}),
				};
			}),
			minutesByPid: rotation.minutesByPid,
			numPlayersOnCourt,
			playoffs,
			rotationDepth: rotation.rotationDepth,
			coreReliance: rotation.coreReliance,
		});
		t.basketballRotation = {
			version: 1,
			mode: "custom",
			...(rotation.rotationDepth
				? { rotationDepth: rotation.rotationDepth }
				: {}),
			...(rotation.coreReliance ? { coreReliance: rotation.coreReliance } : {}),
			minutesByPid,
			numPlayersOnCourtAtSave: numPlayersOnCourt,
			...(currentProtected.length > 0
				? { noInjuryMinutesIncreasePids: currentProtected }
				: {}),
			...(rotation.autoFilledPids?.length
				? { autoFilledPids: rotation.autoFilledPids }
				: {}),
		};
		await cache.teams.put(t);
	}
};

export default reconcileBasketballRotation;
