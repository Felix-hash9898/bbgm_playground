import { assert, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import {
	isActiveRealRosterTeam,
	resolveRealRosterTid,
} from "./retirementMarker.ts";

test("passes the retired marker through without treating it as an abbreviation", () => {
	let calls = 0;
	const tid = resolveRealRosterTid(PLAYER.RETIRED, () => {
		calls += 1;
		return 7;
	});

	assert.equal(tid, PLAYER.RETIRED);
	assert.equal(calls, 0);
	assert.isFalse(isActiveRealRosterTeam(PLAYER.RETIRED));
});

test("resolves ordinary team abbreviations", () => {
	assert.equal(
		resolveRealRosterTid("BOS", (abbrev) => abbrev.length),
		3,
	);
	assert.isTrue(isActiveRealRosterTeam("BOS"));
});

test("leaves a missing team unresolved", () => {
	assert.isUndefined(resolveRealRosterTid(undefined, () => 7));
});
