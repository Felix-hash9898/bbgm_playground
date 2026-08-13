import { assert, beforeEach, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { resetG } from "../../../test/helpers.ts";
import { player } from "../index.ts";
import { local } from "../../util/index.ts";
import value from "./value.ts";

beforeEach(resetG);

test("value uses captured season for all derived value variants", () => {
	const p = player.generate(PLAYER.FREE_AGENT, 30, 2018, true, DEFAULT_LEVEL);
	const capturedRatings = structuredClone(p.ratings.at(-1)!);
	capturedRatings.season = 2032;
	capturedRatings.ovr = 45;
	capturedRatings.pot = 50;
	const laterRatings = structuredClone(capturedRatings);
	laterRatings.season = 2040;
	laterRatings.ovr = 90;
	laterRatings.pot = 95;
	p.ratings = [capturedRatings, laterRatings];

	const options = {
		ovrMean: local.playerOvrMean,
		ovrStd: local.playerOvrStd,
		season: 2032,
	};
	const captured = [
		value(p, { ...options, noPot: true }),
		value(p, { ...options, noPot: true, fuzz: true }),
		value(p, options),
		value(p, { ...options, fuzz: true }),
	];
	const current = [
		value(p, { ...options, noPot: true, season: 2040 }),
		value(p, { ...options, noPot: true, fuzz: true, season: 2040 }),
		value(p, { ...options, season: 2040 }),
		value(p, { ...options, fuzz: true, season: 2040 }),
	];

	assert.isTrue(captured.some((item, index) => item !== current[index]));
	assert.strictEqual(captured[0], value(p, { ...options, noPot: true }));
	assert.strictEqual(
		captured[1],
		value(p, { ...options, noPot: true, fuzz: true }),
	);
	assert.strictEqual(captured[2], value(p, options));
	assert.strictEqual(captured[3], value(p, { ...options, fuzz: true }));
});
