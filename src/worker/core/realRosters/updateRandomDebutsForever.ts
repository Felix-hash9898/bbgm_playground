import { finances, league, player } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g, random } from "../../util/index.ts";
import getDraftProspects from "./getDraftProspects.ts";
import loadDataBasketball from "./loadData.basketball.ts";
import addRelatives from "./addRelatives.ts";
import { LEAGUE_DATABASE_VERSION, PHASE } from "../../../common/index.ts";
import {
	isCapturedContextActive,
	type CapturedSigningContext,
} from "../capturedContext.ts";

const updateRandomDebutsForever = async (
	draftYear: number,
	numPlayersDraftYear: number,
	context?: CapturedSigningContext,
) => {
	const cache = context?.cache ?? idb.cache;
	const iteration =
		(context?.randomDebutsForever ?? g.get("randomDebutsForever") ?? 1) + 1;
	const assertActive = () => {
		if (context && !isCapturedContextActive(context)) {
			throw new Error("Random Debuts Forever league context changed");
		}
	};
	assertActive();

	const basketball = await loadDataBasketball();
	assertActive();

	const currentTeams = (await cache.teams.getAll()).filter((t) => !t.disabled);

	const scheduledEvents = await cache.scheduledEvents.getAll();

	const lastPID = cache._maxIds.players;

	const draftProspects = await getDraftProspects(
		basketball,
		[],
		currentTeams,
		scheduledEvents,
		lastPID,
		numPlayersDraftYear,
		{
			type: "real",
			season: draftYear,
			phase: PHASE.DRAFT, // Faked, so initialDraftYear is correct in getDraftProspects
			randomDebuts: true,
			randomDebutsKeepCurrent: false,
			realDraftRatings:
				context?.realDraftRatings ?? g.get("realDraftRatings") ?? "draft",
			realStats: "none",
			includePlayers: true,
		},
	);
	assertActive();

	for (const p of draftProspects) {
		p.name += ` v${iteration}`;
	}

	addRelatives(draftProspects, basketball.relatives);

	// Randomize draft classes
	const draftYears = draftProspects.map((p) => p.draft.year);
	random.shuffle(draftYears);
	for (const [i, p] of draftProspects.entries()) {
		const draftYear = draftYears[i]!;
		const diff = draftYear - p.draft.year;
		p.draft.year = draftYear;
		p.born.year += diff;
	}

	const scoutingLevel = await finances.getLevelLastThree(
		"scouting",
		{ tid: context?.userTid ?? g.get("userTid") },
		context,
	);
	assertActive();

	for (const p of draftProspects) {
		assertActive();
		const p2 = await player.augmentPartialPlayer(
			p,
			scoutingLevel,
			LEAGUE_DATABASE_VERSION,
		);
		assertActive();
		await player.updateValues(
			p2,
			cache,
			context
				? {
						captured: true,
						ovrMeanStd: context.ovrMeanStd,
						repeatSeason: context.repeatSeason,
						season: context.season,
					}
				: undefined,
		);
		assertActive();
		await cache.players.put(p2);
	}

	if (context) {
		assertActive();
		await cache.gameAttributes.put({
			key: "randomDebutsForever",
			value: iteration,
		});
		// setGameAttributes keeps g and its normal UI/game-attribute side effects
		// in sync. It is only safe while the captured league is still active.
		assertActive();
		await league.setGameAttributes({
			randomDebutsForever: iteration,
		});
	} else {
		await league.setGameAttributes({
			randomDebutsForever: iteration,
		});
	}
};

export default updateRandomDebutsForever;
