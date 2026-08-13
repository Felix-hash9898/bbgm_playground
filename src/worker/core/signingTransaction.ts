import type {
	Negotiation,
	Phase,
	Player,
	PlayerContract,
	Team,
} from "../../common/types.ts";
import type { ContractExceptionType } from "./contracts/contractMidLevel.ts";
import { helpers } from "../util/index.ts";
import sign from "./player/sign.ts";
import {
	isCapturedContextActive,
	type CapturedSigningContext,
} from "./capturedContext.ts";
import type { FlushRecordScope, Store } from "../db/Cache.ts";

export type SigningDurability = "immediate" | "deferred";

type SigningValidationState = {
	player: Player;
	team?: Team;
	negotiation?: Negotiation;
};

type CommitTimeExceptionValidator = {
	expected: ContractExceptionType;
	validate: (
		state: SigningValidationState,
	) => Promise<ContractExceptionType | undefined>;
};

type SigningTransactionInput = {
	context: CapturedSigningContext;
	player: Player;
	tid: number;
	contract: PlayerContract;
	phase: Phase;
	team?: Team;
	negotiation?: Negotiation;
	durability?: SigningDurability;
	revalidate?: (state: SigningValidationState) => Promise<void>;
	/** Runs inside the team queue before any event/player/team mutation. */
	exceptionValidator?: CommitTimeExceptionValidator;
};

const getStores = ({ team, negotiation }: SigningTransactionInput) => {
	const stores: Store[] = ["players", "events"];
	if (team) {
		stores.push("teams");
	}
	if (negotiation) {
		stores.push("negotiations");
	}
	return stores;
};

const signingQueues = new WeakMap<object, Map<number, Promise<void>>>();

const enqueueTeamSigning = async <T>(
	cache: object,
	tid: number,
	operation: () => Promise<T>,
) => {
	let queues = signingQueues.get(cache);
	if (!queues) {
		queues = new Map();
		signingQueues.set(cache, queues);
	}

	const previous = queues.get(tid) ?? Promise.resolve();
	const current = previous.catch(() => {}).then(operation);
	const settled = current.then(
		() => {},
		() => {},
	);
	queues.set(tid, settled);

	try {
		return await current;
	} finally {
		if (queues.get(tid) === settled) {
			queues.delete(tid);
		}
		if (queues.size === 0) {
			signingQueues.delete(cache);
		}
	}
};

const applySigningTransactionInQueue = async (
	input: SigningTransactionInput,
) => {
	const { context } = input;
	// The complete signing mutation, including rollback, must be protected from
	// background persistence. Otherwise an auto-flush can persist only the first
	// half of the player/event/team/negotiation transaction.
	const releaseAutoFlush = context.cache.pauseAutoFlush();
	const stores = getStores(input);
	let oldPlayer: Player | undefined;
	let oldNegotiation: Negotiation | undefined;
	let playerToSign: Player | undefined;
	let teamWasPresent = false;
	let oldTeamMarker:
		| {
				present: boolean;
				value: Team["midLevelExceptionUsedSeason"];
		  }
		| undefined;
	let eventId: number | undefined;
	let staged = false;

	try {
		if (!isCapturedContextActive(context)) {
			throw new Error("Signing league context changed before mutation");
		}

		// Re-read all mutable entities after entering the team queue. This is the
		// commit-time validation boundary for concurrent accepts.
		const currentPlayer = await context.cache.players.get(input.player.pid);
		if (!currentPlayer || currentPlayer.tid !== input.player.tid) {
			throw new Error("Player is no longer available for this signing");
		}
		playerToSign = helpers.deepCopy(currentPlayer);
		oldPlayer = helpers.deepCopy(currentPlayer);

		if (input.negotiation) {
			const currentNegotiation = await context.cache.negotiations.get(
				input.negotiation.pid,
			);
			if (!currentNegotiation) {
				throw new Error("Contract negotiation is no longer available");
			}
			oldNegotiation = helpers.deepCopy(currentNegotiation);
		}

		let currentTeam: Team | undefined;
		if (input.team) {
			currentTeam = await context.cache.teams.get(input.team.tid);
			if (!isCapturedContextActive(context)) {
				throw new Error("Signing league context changed before team mutation");
			}
			teamWasPresent = currentTeam !== undefined;
			if (!currentTeam) {
				throw new Error("Team is no longer available for this signing");
			}
			oldTeamMarker = {
				present: Object.hasOwn(currentTeam, "midLevelExceptionUsedSeason"),
				value: currentTeam.midLevelExceptionUsedSeason,
			};
			if (currentTeam.midLevelExceptionUsedSeason === context.mleSeason) {
				throw new Error("Mid-Level Exception is already used");
			}
		}

		const validationState = {
			player: currentPlayer,
			team: currentTeam,
			negotiation: oldNegotiation,
		};
		if (input.revalidate) {
			await input.revalidate(validationState);
		}
		if (input.exceptionValidator) {
			const actual = await input.exceptionValidator.validate(validationState);
			if (actual !== input.exceptionValidator.expected) {
				throw new Error(
					`Contract exception changed before commit (expected ${input.exceptionValidator.expected}, got ${actual ?? "none"})`,
				);
			}
			if (actual === "midLevel" && !input.team) {
				throw new Error(
					"Mid-Level Exception signing requires an atomic team marker",
				);
			}
		}
		if (!isCapturedContextActive(context)) {
			throw new Error("Signing league context changed after validation");
		}

		// A player on the same roster (for example an AI in-place re-sign) keeps
		// their current tendency. Any team-changing signing normalizes it, except
		// when the current formal re-sign negotiation contains the snapshot taken
		// immediately before that player entered free agency.
		if (playerToSign.tid !== input.tid) {
			const snapshot = oldNegotiation?.usageBiasBeforeFreeAgency;
			const restoreFormalSameTeamResign =
				oldNegotiation?.resigning === true &&
				oldNegotiation.tid === input.tid &&
				typeof snapshot === "number" &&
				Number.isFinite(snapshot) &&
				snapshot > 0;
			playerToSign.usageBias = restoreFormalSameTeamResign ? snapshot : 1;
		}

		eventId = await sign(
			playerToSign,
			input.tid,
			input.contract,
			input.phase,
			context,
		);
		staged = true;
		await context.cache.players.put(playerToSign);
		if (input.team) {
			// Re-read immediately before the marker write. The transaction owns only
			// this marker; unrelated team fields changed while signing must survive.
			const latestTeam = await context.cache.teams.get(input.team.tid);
			if (
				!latestTeam ||
				latestTeam.midLevelExceptionUsedSeason === context.mleSeason
			) {
				throw new Error("Mid-Level Exception became unavailable");
			}
			const teamToWrite = helpers.deepCopy(latestTeam);
			teamToWrite.midLevelExceptionUsedSeason = context.mleSeason;
			await context.cache.teams.put(teamToWrite);
		}
		if (input.negotiation) {
			await context.cache.negotiations.delete(input.negotiation.pid);
		}

		if ((input.durability ?? "immediate") === "immediate") {
			const records: FlushRecordScope = {
				players: [playerToSign.pid],
				events: eventId === undefined ? [] : [eventId],
			};
			if (input.team) {
				records.teams = [input.team.tid];
			}
			if (input.negotiation) {
				records.negotiations = [input.negotiation.pid];
			}
			await context.cache.flush(stores, {
				league: context.leagueDB,
				updateLastPlayed: false,
				records,
			});
		}

		return {
			coreSigningSucceeded: true as const,
			eventId,
			player: playerToSign,
		};
	} catch (error) {
		if (!staged) {
			throw error;
		}

		let rollbackError: unknown;
		try {
			if (eventId !== undefined) {
				await context.cache.events.delete(eventId);
			}
			await context.cache.players.put(oldPlayer!);
			if (input.team) {
				const latestTeam = await context.cache.teams.get(input.team.tid);
				if (teamWasPresent && latestTeam && oldTeamMarker) {
					const restoredTeam = helpers.deepCopy(latestTeam);
					if (oldTeamMarker.present) {
						restoredTeam.midLevelExceptionUsedSeason = oldTeamMarker.value;
					} else {
						delete restoredTeam.midLevelExceptionUsedSeason;
					}
					await context.cache.teams.put(restoredTeam);
				} else if (!teamWasPresent && latestTeam) {
					await context.cache.teams.delete(input.team.tid);
				}
			}
			if (oldNegotiation) {
				await context.cache.negotiations.put(oldNegotiation);
			}
			if ((input.durability ?? "immediate") === "immediate") {
				const records: FlushRecordScope = {
					players: [input.player.pid],
					events: eventId === undefined ? [] : [eventId],
				};
				if (input.team) {
					records.teams = [input.team.tid];
				}
				if (input.negotiation) {
					records.negotiations = [input.negotiation.pid];
				}
				await context.cache.flush(stores, {
					league: context.leagueDB,
					updateLastPlayed: false,
					records,
				});
			}
		} catch (error_) {
			rollbackError = error_;
		}

		if (rollbackError !== undefined) {
			const combined = new Error(
				"Signing transaction failed and rollback failed",
				{ cause: error },
			);
			(combined as any).originalError = error;
			(combined as any).rollbackError = rollbackError;
			throw combined;
		}
		throw error;
	} finally {
		releaseAutoFlush();
	}
};

export const applySigningTransaction = async (input: SigningTransactionInput) =>
	enqueueTeamSigning(contextCache(input), input.tid, () =>
		applySigningTransactionInQueue(input),
	);

const contextCache = (input: SigningTransactionInput) => input.context.cache;
