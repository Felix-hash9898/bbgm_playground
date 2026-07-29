import { assert, test } from "vitest";
import {
	validateRealPlayerPhotos,
	validateRealTeamInfo,
} from "./validateRealTeamInfo.ts";

test("validates real player photos as a string map", () => {
	assert.isTrue(validateRealPlayerPhotos({ sr123: "/img/player.png" }));
	assert.throws(() => validateRealPlayerPhotos(["/img/player.png"]));
	assert.throws(() => validateRealPlayerPhotos({ sr123: 1 }));
});

test("validates real team info and season overrides", () => {
	assert.isTrue(
		validateRealTeamInfo({
			LV: {
				colors: ["#000", "#111", "#222"],
				pop: 2,
				seasons: { "2029": { name: "A" } },
			},
		}),
	);
	assert.throws(() =>
		validateRealTeamInfo({ LV: { colors: ["#000", "#111"] } }),
	);
	assert.throws(() => validateRealTeamInfo({ LV: { seasons: { nope: {} } } }));
	assert.throws(() => validateRealTeamInfo({ LV: { extra: true } }));
});
