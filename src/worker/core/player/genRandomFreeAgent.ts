import type { Player } from "../../../common/types.ts";
import { random, g } from "../../util/index.ts";
import develop from "./develop.ts";
import generate from "./generate.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { idb } from "../../db/index.ts";
import name from "./name.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import {
	isCapturedContextActive,
	type CapturedSigningContext,
} from "../capturedContext.ts";

const genRandomFreeAgent = async (
	context?: CapturedSigningContext,
): Promise<Player> => {
	let minAge = 25;
	let maxAge = 31;
	const cache = context?.cache ?? idb.cache;
	const forceRetireAge = context?.forceRetireAge ?? g.get("forceRetireAge");
	const draftAges = context?.draftAges ?? g.get("draftAges");
	const phase = context?.phase ?? g.get("phase");
	const season = context?.season ?? g.get("season");

	// Adjust for age limits
	const offset = phase > PHASE.REGULAR_SEASON ? 0 : 1;

	if (
		forceRetireAge > minAge ||
		forceRetireAge > maxAge ||
		(forceRetireAge < maxAge && forceRetireAge >= draftAges[1])
	) {
		minAge = draftAges[1] + offset;
		maxAge = forceRetireAge - 1 + offset;
	} else if (draftAges[0] > minAge) {
		minAge = draftAges[0] + offset;
		if (maxAge > forceRetireAge) {
			maxAge = forceRetireAge - 1 + offset;
		}
		if (minAge > maxAge) {
			maxAge = draftAges[1] + offset;
		}
	}

	for (let i = 0; i < 1000; i++) {
		const age = random.randInt(minAge, maxAge);
		const draftYear = season - (age - 22);
		const generatedName = await name();
		if (context && !isCapturedContextActive(context)) {
			throw new Error(
				"Random free-agent generation aborted after league context changed",
			);
		}
		const p = generate(
			PLAYER.FREE_AGENT,
			age,
			draftYear,
			false,
			DEFAULT_LEVEL,
			generatedName,
		);
		p.ratings[0].season = season; // HACK!!!
		await develop(p, 0);
		if (p.ratings[0].ovr <= 40) {
			if (context && !isCapturedContextActive(context)) {
				throw new Error(
					"Random free-agent generation aborted after league context changed",
				);
			}
			await cache.players.add(p); // Create pid in the captured cache
			return p as Player;
		}
	}

	throw new Error("genRandomFreeAgent failed");
};

export default genRandomFreeAgent;
