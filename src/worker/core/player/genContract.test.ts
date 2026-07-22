import { assert, beforeEach, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { g } from "../../util/index.ts";
import { resetG } from "../../../test/helpers.ts";
import { player } from "../index.ts";
import genContract from "./genContract.ts";
import { getMinContractForPlayer } from "../contracts/contractMinimum.ts";

const makePlayer = ({
	age = 26,
	draftYearsAgo = 10,
	value = 100,
}: {
	age?: number;
	draftYearsAgo?: number;
	value?: number;
} = {}) => {
	const p = player.generate(
		PLAYER.FREE_AGENT,
		age,
		g.get("season") - draftYearsAgo,
		true,
		0,
	);
	p.value = value;
	p.valueNoPot = value;
	return p;
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("salaryCap", 150000);
});

test("basketball genContract clamps to the player's dynamic max", () => {
	const p = makePlayer();
	const contract = genContract(p, false, false);
	assert(contract.amount <= g.get("salaryCap") * 0.25);
	assert(contract.amount >= getMinContractForPlayer(p));
});

test("basketball genContract keeps veteran standard contracts at veteran minimum or higher", () => {
	const p = makePlayer({
		age: 34,
		draftYearsAgo: 10,
		value: 10,
	});
	const contract = genContract(p, false, false);

	assert(contract.amount >= getMinContractForPlayer(p));
	assert(contract.amount > g.get("minContract"));
});
