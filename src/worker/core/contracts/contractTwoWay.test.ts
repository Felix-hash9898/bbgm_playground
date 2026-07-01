import { assert, beforeEach, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import { player } from "../index.ts";
import {
	canOfferTwoWay,
	canTeamAddTwoWay,
	countTwoWayContracts,
	getContractType,
	getTwoWayContractAmount,
	isStandardContract,
	isTwoWayContract,
	makeTwoWayContract,
} from "./contractTwoWay.ts";
import { getMinimumSalaryForYearsExperience } from "./contractMinimum.ts";

const makePlayer = ({
	tid = PLAYER.FREE_AGENT,
	age = 22,
	draftRound = 0,
	draftYearsAgo = 0,
	ovr = 42,
	pot = 58,
	value = 45,
	valueNoPot = 42,
}: {
	tid?: number;
	age?: number;
	draftRound?: number;
	draftYearsAgo?: number;
	ovr?: number;
	pot?: number;
	value?: number;
	valueNoPot?: number;
} = {}) => {
	const p = player.generate(tid, age, g.get("season") - draftYearsAgo, true, 0);
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

test("old contract without type defaults to standard", () => {
	const contract = {
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
	};

	assert.strictEqual(getContractType(contract), "standard");
	assert.strictEqual(isStandardContract(contract), true);
	assert.strictEqual(isTwoWayContract(contract), false);
});

test("two-way contract helper identifies two-way", () => {
	const contract = {
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		type: "twoWay" as const,
	};

	assert.strictEqual(getContractType(contract), "twoWay");
	assert.strictEqual(isTwoWayContract(contract), true);
	assert.strictEqual(isStandardContract(contract), false);
});

test("makeTwoWayContract uses minimum salary and one-year two-way type", () => {
	const contract = makeTwoWayContract();

	assert.strictEqual(contract.amount, getTwoWayContractAmount());
	assert.strictEqual(contract.exp, g.get("season"));
	assert.strictEqual(contract.type, "twoWay");
});

test("two-way amount remains independent from veteran minimum scale", () => {
	assert(getMinimumSalaryForYearsExperience(10) > g.get("minContract"));
	assert.strictEqual(makeTwoWayContract().amount, g.get("minContract"));
});

test("eligible undrafted and low-end young players can receive two-way offers", () => {
	assert.strictEqual(canOfferTwoWay(makePlayer()), true);
	assert.strictEqual(
		canOfferTwoWay(makePlayer({ draftRound: 2, draftYearsAgo: 2 })),
		true,
	);
});

test("first round and normal rotation young players cannot receive two-way offers", () => {
	assert.strictEqual(canOfferTwoWay(makePlayer({ draftRound: 1 })), false);
	assert.strictEqual(
		canOfferTwoWay(
			makePlayer({
				draftRound: 2,
				ovr: 52,
				pot: 63,
				value: 62,
				valueNoPot: 52,
			}),
		),
		false,
	);
});

test("each team can have at most three two-way contracts", () => {
	const players = [
		makePlayer({ tid: 0 }),
		makePlayer({ tid: 0 }),
		makePlayer({ tid: 0 }),
		makePlayer({ tid: 0 }),
	];
	for (const p of players.slice(0, 3)) {
		p.contract.type = "twoWay";
	}

	assert.strictEqual(countTwoWayContracts(players, 0), 3);
	assert.strictEqual(canTeamAddTwoWay(players, 0), false);
	assert.strictEqual(canTeamAddTwoWay(players, 1), true);
});
