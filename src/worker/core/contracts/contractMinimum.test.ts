import { assert, beforeEach, test } from "vitest";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import { player } from "../index.ts";
import {
	getContractCapHit,
	getMinContractForPlayer,
	getMinimumSalaryCapHitForPlayer,
	getMinimumSalaryForYearsExperience,
	getYearsOfExperience,
	withContractCapHitForPlayer,
} from "./contractMinimum.ts";

const makePlayer = ({
	age = 22,
	yearsOfExperience = 0,
}: {
	age?: number;
	yearsOfExperience?: number;
} = {}) => {
	const p = player.generate(
		PLAYER.FREE_AGENT,
		age,
		g.get("season") - yearsOfExperience,
		true,
		0,
	);
	p.draft.year = g.get("season") - yearsOfExperience;
	return p;
};

beforeEach(() => {
	resetG();
});

test("0-year basketball player minimum equals base min contract", () => {
	const p = makePlayer();

	assert.strictEqual(getYearsOfExperience(p), 0);
	assert.strictEqual(getMinContractForPlayer(p), g.get("minContract"));
});

test("10+ year veteran minimum uses the Exhibit C ratio", () => {
	const p = makePlayer({ age: 34, yearsOfExperience: 12 });
	const expected = getMinimumSalaryForYearsExperience(10);

	assert.strictEqual(getYearsOfExperience(p), 10);
	assert.strictEqual(getMinContractForPlayer(p), expected);
	assert(expected > g.get("minContract"));
	assert(Math.abs(expected / g.get("minContract") - 2.855) < 0.01);
});

test("one-year veteran minimum salary has lower cap hit", () => {
	const p = makePlayer({ age: 34, yearsOfExperience: 10 });
	const amount = getMinContractForPlayer(p);
	const contract = withContractCapHitForPlayer(p, {
		amount,
		exp: g.get("season"),
	});

	assert(amount > getContractCapHit(contract));
	assert.strictEqual(
		getContractCapHit(contract),
		getMinimumSalaryForYearsExperience(2),
	);
	assert.strictEqual(
		getMinimumSalaryCapHitForPlayer(p, contract),
		getContractCapHit(contract),
	);
});

test("current-season phases treat current-season expiration as one-year minimum", () => {
	for (const phase of [
		PHASE.REGULAR_SEASON,
		PHASE.AFTER_TRADE_DEADLINE,
		PHASE.PLAYOFFS,
	]) {
		g.setWithoutSavingToDB("phase", phase);
		const p = makePlayer({ age: 34, yearsOfExperience: 10 });
		const amount = getMinContractForPlayer(p);
		const contract = withContractCapHitForPlayer(p, {
			amount,
			exp: g.get("season"),
		});

		assert.strictEqual(
			getContractCapHit(contract),
			getMinimumSalaryForYearsExperience(2),
		);
	}
});

test("offseason free agency treats next-season expiration as one-year minimum", () => {
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	const p = makePlayer({ age: 34, yearsOfExperience: 10 });
	const amount = getMinContractForPlayer(p);
	const oneYearContract = withContractCapHitForPlayer(p, {
		amount,
		exp: g.get("season") + 1,
	});
	const currentSeasonExpContract = withContractCapHitForPlayer(p, {
		amount,
		exp: g.get("season"),
	});

	assert.strictEqual(
		getContractCapHit(oneYearContract),
		getMinimumSalaryForYearsExperience(2),
	);
	assert.strictEqual(getContractCapHit(currentSeasonExpContract), amount);
});

test("0/1/2 year minimum cap hit equals actual minimum", () => {
	for (const yearsOfExperience of [0, 1, 2]) {
		const p = makePlayer({ yearsOfExperience });
		const amount = getMinContractForPlayer(p);
		const contract = withContractCapHitForPlayer(p, {
			amount,
			exp: g.get("season"),
		});

		assert.strictEqual(getContractCapHit(contract), amount);
	}
});

test("old contracts without capHit use actual amount safely", () => {
	const amount = getMinimumSalaryForYearsExperience(10);

	assert.strictEqual(
		getContractCapHit({
			amount,
			exp: g.get("season"),
		}),
		amount,
	);
});
