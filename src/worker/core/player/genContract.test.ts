import { assert, beforeEach, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { g } from "../../util/index.ts";
import { resetG } from "../../../test/helpers.ts";
import { player } from "../index.ts";
import genContract from "./genContract.ts";

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
	assert.strictEqual(contract.amount, 52500);
});
