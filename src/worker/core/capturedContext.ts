import { PHASE } from "../../common/index.ts";
import type { GameAttributesLeague, Phase } from "../../common/types.ts";
import { idb } from "../db/index.ts";
import { g, local } from "../util/index.ts";

export type CapturedOvrMeanStd = {
	playerOvrMean: number;
	playerOvrStd: number;
	playerOvrMeanStdStale: boolean;
};

export type CapturedLeagueContext = {
	cache: typeof idb.cache;
	leagueDB: typeof idb.league;
	lid: number;
	season: number;
	userTid: number;
	repeatSeason: GameAttributesLeague["repeatSeason"];
	ovrMeanStd: CapturedOvrMeanStd;
	teamInfoCache: GameAttributesLeague["teamInfoCache"];
};

export type CapturedSigningContext = CapturedLeagueContext & {
	phase: Phase;
	budget: boolean;
	numGames: number;
	numPlayersOnCourt: number;
	numActiveTeams: number;
	numDraftRounds: number;
	numTeams: number;
	userTids: number[];
	salaryCapType: GameAttributesLeague["salaryCapType"];
	salaryCap: number;
	minContractLength: number;
	maxContractLength: number;
	minRosterSize: number;
	maxRosterSize: number;
	minContract: number;
	forceHistoricalRosters: boolean;
	draftPickAutoContract: boolean;
	spectator: boolean;
	challengeNoRatings: boolean;
	forceRetireAge: number;
	forceRetireSeasons: number;
	draftAges: GameAttributesLeague["draftAges"];
	/** The MLE season for this captured phase, not necessarily g.season. */
	mleSeason: number;
	sonRate: number;
	brotherRate: number;
	startingSeason: number;
	randomDebutsForever: number | undefined;
	realDraftRatings: GameAttributesLeague["realDraftRatings"];
};

export const captureLeagueContext = (): CapturedLeagueContext => ({
	cache: idb.cache,
	leagueDB: idb.league,
	lid: g.get("lid"),
	season: g.get("season"),
	userTid: g.get("userTid"),
	repeatSeason: g.get("repeatSeason"),
	ovrMeanStd: {
		playerOvrMean: local.playerOvrMean,
		playerOvrStd: local.playerOvrStd,
		playerOvrMeanStdStale: local.playerOvrMeanStdStale,
	},
	teamInfoCache: structuredClone(g.get("teamInfoCache")),
});

export const captureSigningContext = (): CapturedSigningContext => ({
	...captureLeagueContext(),
	phase: g.get("phase"),
	budget: g.get("budget"),
	numGames: g.get("numGames"),
	numPlayersOnCourt: g.get("numPlayersOnCourt"),
	numActiveTeams: g.get("numActiveTeams"),
	numDraftRounds: g.get("numDraftRounds"),
	numTeams: g.get("numTeams"),
	userTids: [...g.get("userTids")],
	salaryCapType: g.get("salaryCapType"),
	salaryCap: g.get("salaryCap"),
	minRosterSize: g.get("minRosterSize"),
	maxRosterSize: g.get("maxRosterSize"),
	minContract: g.get("minContract"),
	minContractLength: g.get("minContractLength"),
	maxContractLength: g.get("maxContractLength"),
	forceHistoricalRosters: g.get("forceHistoricalRosters"),
	draftPickAutoContract: g.get("draftPickAutoContract"),
	spectator: g.get("spectator"),
	challengeNoRatings: g.get("challengeNoRatings"),
	forceRetireAge: g.get("forceRetireAge"),
	forceRetireSeasons: g.get("forceRetireSeasons"),
	draftAges: [...g.get("draftAges")] as GameAttributesLeague["draftAges"],
	mleSeason:
		g.get("phase") >= PHASE.RESIGN_PLAYERS
			? g.get("season") + 1
			: g.get("season"),
	sonRate: g.get("sonRate"),
	brotherRate: g.get("brotherRate"),
	startingSeason: g.get("startingSeason"),
	randomDebutsForever: g.get("randomDebutsForever"),
	realDraftRatings: g.get("realDraftRatings"),
});

export const isCapturedContextActive = (context: CapturedLeagueContext) =>
	idb.cache === context.cache &&
	idb.league === context.leagueDB &&
	g.get("lid") === context.lid;

export const isCapturedSigningContextCurrent = (
	context: CapturedSigningContext,
) => {
	const userTids = g.get("userTids");
	return (
		isCapturedContextActive(context) &&
		g.get("season") === context.season &&
		g.get("phase") === context.phase &&
		g.get("numGames") === context.numGames &&
		g.get("numActiveTeams") === context.numActiveTeams &&
		g.get("salaryCapType") === context.salaryCapType &&
		g.get("salaryCap") === context.salaryCap &&
		g.get("minContract") === context.minContract &&
		g.get("minContractLength") === context.minContractLength &&
		g.get("maxContractLength") === context.maxContractLength &&
		g.get("minRosterSize") === context.minRosterSize &&
		g.get("maxRosterSize") === context.maxRosterSize &&
		userTids.length === context.userTids.length &&
		userTids.every((tid, index) => tid === context.userTids[index])
	);
};
