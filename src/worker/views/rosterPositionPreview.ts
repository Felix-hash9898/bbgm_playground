import type { BasketballRotation } from "../../common/types.ts";
import {
	getBasketballRotationPlayerInput,
	getBasketballRotationMinutes,
	getBasketballGameAvailability,
	getGameEffectiveBasketballMinutesWithStatus,
} from "../core/team/basketballMinutes.ts";

// Read-only view data for teams/spectators without an editable minutes plan.
// Inputs are playersPlus(fuzz:true) values, never raw cache-player ratings.
// This does not persist a rotation or change loadTeams' actual game inputs.
export const getReadonlyRosterPositionPreview = ({
	players,
	challengeNoRatings,
	numPlayersOnCourt,
	regulationMinutes,
	playoffs,
	playThroughInjuries,
	rotation,
}: {
	players: {
		pid: number;
		rosterOrder: number;
		ratings: Record<string, unknown>;
		injury: { gamesRemaining: number };
	}[];
	challengeNoRatings: boolean;
	numPlayersOnCourt: number;
	regulationMinutes: number;
	playoffs: boolean;
	playThroughInjuries: number;
	rotation?: BasketballRotation;
}) => {
	const inputs = players.map((p) =>
		getBasketballRotationPlayerInput({
			pid: p.pid,
			rosterOrder: p.rosterOrder,
			ratings: p.ratings,
			challengeNoRatings,
			useFuzzedRatings: false,
		}),
	);
	const healthy = getBasketballRotationMinutes({
		players: inputs,
		rotation,
		numPlayersOnCourt,
		playoffs,
	});
	const available = getBasketballGameAvailability({
		players,
		playThroughInjuries,
		numPlayersOnCourt,
	});
	const effective =
		healthy.previewReady &&
		available.filter(Boolean).length >= numPlayersOnCourt
			? getGameEffectiveBasketballMinutesWithStatus({
					players: inputs.map((p, i) => ({ ...p, available: available[i]! })),
					minutesByPid: healthy.minutesByPid,
					numPlayersOnCourt,
					regulationMinutes,
					playoffs,
					rotationDepth: healthy.rotationDepth,
					coreReliance: healthy.coreReliance,
					noInjuryMinutesIncreasePids: rotation?.noInjuryMinutesIncreasePids,
					currentMinutesOverrideByPid: rotation?.currentMinutesOverrideByPid,
					currentMinutesOverrideContext:
						rotation?.currentMinutesOverrideContext,
				})
			: undefined;
	return {
		healthyMinutesByPid: healthy.minutesByPid,
		effectiveMinutesByPid: effective?.minutesByPid,
	};
};
