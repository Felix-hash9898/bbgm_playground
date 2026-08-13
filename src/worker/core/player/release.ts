import addToFreeAgents from "./addToFreeAgents.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, logEvent, logEventInContext } from "../../util/index.ts";
import type { Player } from "../../../common/types.ts";
import { PHASE } from "../../../common/index.ts";
import {
	isCapturedContextActive,
	type CapturedSigningContext,
} from "../capturedContext.ts";

/**
 * Release player.
 *
 * The released-player ledger, release event, and player transition are one
 * logical mutation. A captured context is used for every write so a league
 * switch cannot redirect a later await to the new league.
 */
const release = async (
	p: Player,
	justDrafted: boolean,
	context?: CapturedSigningContext,
) => {
	const cache = context?.cache ?? idb.cache;
	const season = context?.season ?? g.get("season");
	const phase = context?.phase ?? g.get("phase");
	if (context && !isCapturedContextActive(context)) {
		throw new Error("Player release league context changed before mutation");
	}
	const releaseAutoFlush = cache.pauseAutoFlush();

	const oldPlayer = helpers.deepCopy(p);
	let releasedPlayerRid: number | undefined;
	let releaseEventId: number | undefined;
	let mutated = false;
	try {
		// Keep track of player salary even when he's off the team, but make an
		// exception for players who were just drafted.
		if (
			!justDrafted &&
			(p.contract.exp > season ||
				(p.contract.exp === season && phase < PHASE.PLAYOFFS))
		) {
			releasedPlayerRid = await cache.releasedPlayers.add({
				pid: p.pid,
				tid: p.tid,
				contract: helpers.deepCopy(p.contract),
			});
			mutated = true;
		}

		if (context && !isCapturedContextActive(context)) {
			throw new Error(
				"Player release league context changed after released-player mutation",
			);
		}

		if (justDrafted) {
			p.salaries = [];
		}

		const teamInfo = context?.teamInfoCache ?? g.get("teamInfoCache");
		const leagueUrl = (components: (number | string | undefined)[]) =>
			context
				? helpers.leagueUrlBase(context.lid, components)
				: helpers.leagueUrl(components);
		const event = {
			type: "release" as const,
			text: `The <a href="${leagueUrl([
				"roster",
				teamInfo[p.tid]?.abbrev,
				season,
			])}">${teamInfo[p.tid]?.name}</a> released <a href="${leagueUrl([
				"player",
				p.pid,
			])}">${p.firstName} ${p.lastName}</a>.`,
			showNotification: false,
			pids: [p.pid],
			tids: [p.tid],
		};
		if (context) {
			releaseEventId = await logEventInContext(event, undefined, context);
		} else {
			releaseEventId = await logEvent(event);
		}
		mutated = true;

		if (context && !isCapturedContextActive(context)) {
			throw new Error(
				"Player release league context changed before player mutation",
			);
		}
		await addToFreeAgents(p, undefined, context);
		await cache.players.put(p);

		// A direct user release is an independent durable operation. Releases made
		// from checkRosterSizes/game-day carry a captured context and remain staged
		// for the outer day transaction.
		if (!context) {
			await cache.flush(["releasedPlayers", "events", "players"], {
				records: {
					releasedPlayers:
						releasedPlayerRid === undefined ? [] : [releasedPlayerRid],
					events: releaseEventId === undefined ? [] : [releaseEventId],
					players: [p.pid],
				},
			});
		}
	} catch (error) {
		// Restore only records touched by this release. Do not overwrite an entire
		// store, which could erase unrelated mutations made concurrently.
		const rollbackErrors: unknown[] = [];
		if (releaseEventId !== undefined) {
			try {
				await cache.events.delete(releaseEventId);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		if (releasedPlayerRid !== undefined) {
			try {
				await cache.releasedPlayers.delete(releasedPlayerRid);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		Object.assign(p, oldPlayer);
		if (mutated) {
			try {
				await cache.players.put(oldPlayer);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		if (rollbackErrors.length > 0) {
			const rollbackError =
				rollbackErrors.length === 1
					? rollbackErrors[0]
					: new AggregateError(
							rollbackErrors,
							"Player release rollback failed",
						);
			const combined = new Error("Player release failed and rollback failed", {
				cause: error,
			});
			(combined as any).originalError = error;
			(combined as any).rollbackError = rollbackError;
			throw combined;
		}
		throw error;
	} finally {
		releaseAutoFlush();
	}
};

export default release;
