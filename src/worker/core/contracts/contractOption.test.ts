import { assert, beforeEach, test } from "vitest";
import { PLAYER, PHASE } from "../../../common/index.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import { player } from "../index.ts";
import {
	canContractHaveOption,
	getAIContractWithOption,
	getEffectiveOfferAmount,
	getContractOptionDisplayText,
	getRealAmountForEffectiveOffer,
	shouldExercisePlayerOption,
	shouldExerciseTeamOption,
} from "./contractOption.ts";

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
});

const makePlayer = ({
	age,
	draftRound,
	draftYearsAgo,
	ovr,
	pot,
	value,
	valueNoPot,
}: {
	age: number;
	draftRound: number;
	draftYearsAgo: number;
	ovr: number;
	pot: number;
	value: number;
	valueNoPot: number;
}) => {
	const p = player.generate(
		PLAYER.FREE_AGENT,
		age,
		g.get("season") - draftYearsAgo,
		true,
		DEFAULT_LEVEL,
	);
	p.draft.round = draftRound;
	p.draft.pick = draftRound > 0 ? 30 : 0;
	p.value = value;
	p.valueNoPot = valueNoPot;
	p.ratings.at(-1)!.ovr = ovr;
	p.ratings.at(-1)!.pot = pot;
	return p;
};

test("options are not allowed on two-way contracts or one-year contracts", () => {
	assert.strictEqual(
		canContractHaveOption({
			exp: g.get("season") + 2,
			type: "twoWay",
		}),
		false,
	);
	assert.strictEqual(
		canContractHaveOption({
			exp: g.get("season") + 1,
		}),
		false,
	);
	assert.strictEqual(
		canContractHaveOption({
			exp: g.get("season") + 2,
			rookie: true,
		}),
		false,
	);
});

test("option effective offer values use the centralized 10 percent value", () => {
	assert.strictEqual(getEffectiveOfferAmount(10000, "player"), 11000);
	assert.strictEqual(getEffectiveOfferAmount(10000, "team"), 9000);
});

test("player and team option decisions use effective offer value", () => {
	assert.strictEqual(
		shouldExercisePlayerOption({
			optionSalary: 10000,
			marketDemand: 11000,
		}),
		true,
	);
	assert.strictEqual(
		shouldExercisePlayerOption({
			optionSalary: 10000,
			marketDemand: 11010,
		}),
		false,
	);
	assert.strictEqual(
		shouldExerciseTeamOption({
			optionSalary: 10000,
			marketDemand: 9000,
		}),
		true,
	);
	assert.strictEqual(
		shouldExerciseTeamOption({
			optionSalary: 10000,
			marketDemand: 8990,
		}),
		false,
	);
});

test("AI option helper chooses a player option for a high-value veteran", () => {
	const p = makePlayer({
		age: 30,
		draftRound: 2,
		draftYearsAgo: 9,
		ovr: 78,
		pot: 80,
		value: 82,
		valueNoPot: 80,
	});

	const contract = {
		amount: 20000,
		exp: g.get("season") + 2,
	};

	const aiContract = getAIContractWithOption(p, contract);
	assert.strictEqual(aiContract.option, "player");
	assert.strictEqual(
		aiContract.amount,
		getRealAmountForEffectiveOffer(contract.amount, "player"),
	);
	assert.strictEqual(
		getContractOptionDisplayText(aiContract),
		` (${aiContract.exp} PO)`,
	);
});

test("AI option helper chooses a team option for a low-end young free agent", () => {
	const p = makePlayer({
		age: 22,
		draftRound: 2,
		draftYearsAgo: 1,
		ovr: 45,
		pot: 48,
		value: 47,
		valueNoPot: 44,
	});

	const contract = {
		amount: 3000,
		exp: g.get("season") + 2,
	};

	const aiContract = getAIContractWithOption(p, contract);
	assert.strictEqual(aiContract.option, "team");
	assert.strictEqual(
		aiContract.amount,
		getRealAmountForEffectiveOffer(contract.amount, "team"),
	);
});

test("AI option helper does not attach options to one-year or two-way contracts", () => {
	const p = makePlayer({
		age: 30,
		draftRound: 2,
		draftYearsAgo: 9,
		ovr: 78,
		pot: 80,
		value: 82,
		valueNoPot: 80,
	});

	assert.strictEqual(
		getAIContractWithOption(p, {
			amount: 20000,
			exp: g.get("season") + 1,
		}).option,
		undefined,
	);
	assert.strictEqual(
		getAIContractWithOption(p, {
			amount: g.get("minContract"),
			exp: g.get("season") + 2,
			type: "twoWay",
		}).option,
		undefined,
	);
});

test("AI option helper leaves ordinary players on no-option contracts", () => {
	const p = makePlayer({
		age: 26,
		draftRound: 2,
		draftYearsAgo: 4,
		ovr: 55,
		pot: 58,
		value: 55,
		valueNoPot: 54,
	});

	const contract = {
		amount: 10000,
		exp: g.get("season") + 2,
	};

	const aiContract = getAIContractWithOption(p, contract);
	assert.strictEqual(aiContract.option, undefined);
	assert.strictEqual(aiContract.amount, contract.amount);
});
