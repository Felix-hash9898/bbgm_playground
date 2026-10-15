import { assert, test } from "vitest";
import { isSport } from "../../common/index.ts";
import {
	getContractStructureFilters,
	getNegotiationRosterFullReason,
	getStandardRosterFullReason,
} from "../util/rosterFullMessage.ts";

test("full-roster guidance only recommends Two-Way contracts for basketball", () => {
	const currentSportReason = getStandardRosterFullReason(isSport("basketball"));
	if (isSport("basketball")) {
		assert.match(currentSportReason, /Two-Way/);
	} else {
		assert.match(currentSportReason, /maximum roster size/);
		assert(!/Two-Way/.test(currentSportReason));
	}

	const basketballReason = getStandardRosterFullReason(true);
	assert.match(basketballReason, /Two-Way/);
	assert.match(getNegotiationRosterFullReason(true), /MLE/);
	assert.match(getNegotiationRosterFullReason(true), /Two-Way/);

	const otherSportReason = getStandardRosterFullReason(false);
	assert.match(otherSportReason, /maximum roster size/);
	assert(!/Two-Way/.test(otherSportReason));
	assert(
		!/MLE|Two-Way|player\/team/.test(getNegotiationRosterFullReason(false)),
	);
	assert.deepStrictEqual(
		getContractStructureFilters(false).map(({ key }) => key),
		["all", "standard"],
	);
	assert.deepStrictEqual(
		getContractStructureFilters(true).map(({ key }) => key),
		["all", "standard", "player", "team", "twoWay"],
	);
});
