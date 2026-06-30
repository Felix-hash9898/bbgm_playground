import { assert, beforeEach, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import { player } from "../index.ts";
import genContract from "../player/genContract.ts";
import {
	getLowEndContractTarget,
	isLowEndYoungFreeAgent,
	isUndraftedRookieLike,
} from "./contractLowEnd.ts";

const makePlayer = ({
	age = 22,
	draftRound = 0,
	draftYearsAgo = 0,
	ovr = 42,
	pot = 58,
	value = 55,
	valueNoPot = 42,
}: {
	age?: number;
	draftRound?: number;
	draftYearsAgo?: number;
	ovr?: number;
	pot?: number;
	value?: number;
	valueNoPot?: number;
} = {}) => {
	const p = player.generate(
		PLAYER.FREE_AGENT,
		age,
		g.get("season") - draftYearsAgo,
		true,
		0,
	);
	const ratings = p.ratings.at(-1)!;
	ratings.ovr = ovr;
	ratings.pot = pot;
	p.draft.round = draftRound;
	p.draft.pick = draftRound > 0 ? 45 : 0;
	p.value = value;
	p.valueNoPot = valueNoPot;
	return p;
};

beforeEach(() => {
	resetG();
});

test("undrafted rookie-like players are pushed to minimum contract demand", () => {
	const p = makePlayer();

	assert.strictEqual(isUndraftedRookieLike(p), true);
	assert.strictEqual(getLowEndContractTarget(p), g.get("minContract"));
	assert.strictEqual(genContract(p, false).amount, g.get("minContract"));
});

test("low-end young free agents are pushed to the low-end contract range", () => {
	const p = makePlayer({
		draftRound: 2,
		draftYearsAgo: 2,
		value: 52,
		valueNoPot: 47,
	});

	assert.strictEqual(isLowEndYoungFreeAgent(p), true);
	assert.strictEqual(
		getLowEndContractTarget(p),
		g.get("minContract") * 1.25,
	);
	assert.strictEqual(genContract(p, false).amount, g.get("minContract") * 1.25);
});

test("normal rotation young players are not pushed to the low-end contract range", () => {
	const p = makePlayer({
		draftRound: 2,
		ovr: 52,
		pot: 63,
		value: 62,
		valueNoPot: 52,
	});

	assert.strictEqual(getLowEndContractTarget(p), undefined);
	assert(genContract(p, false).amount > g.get("minContract") * 1.25);
});

test("first round picks are not pushed to the low-end contract range", () => {
	const p = makePlayer({
		draftRound: 1,
		value: 45,
		valueNoPot: 42,
	});

	assert.strictEqual(isLowEndYoungFreeAgent(p), false);
	assert.strictEqual(getLowEndContractTarget(p), undefined);
});
