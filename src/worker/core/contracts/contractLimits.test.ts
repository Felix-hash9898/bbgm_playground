import { beforeEach, assert, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { player } from "../index.ts";
import { g } from "../../util/index.ts";
import { resetG } from "../../../test/helpers.ts";
import {
	getDynamicMaxContractAmount,
	getMaxContractForPlayer,
	getMaxSalaryTier,
} from "./contractLimits.ts";

const makePlayer = ({
	awards = [],
	draftYear,
	yearsOfService,
}: {
	awards?: { season: number; type: string }[];
	draftYear?: number;
	yearsOfService?: number;
}) => {
	const p = player.generate(PLAYER.FREE_AGENT, 25, draftYear ?? g.get("season"), true, 0);
	p.awards = awards;
	p.draft.year = draftYear ?? g.get("season") - (yearsOfService ?? 0);
	return p;
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("salaryCap", 100000);
});

test("0-6 years of service without awards gets 25% max tier", () => {
	const p = makePlayer({ yearsOfService: 3 });
	assert.strictEqual(getMaxSalaryTier(p), 25);
	assert.strictEqual(getDynamicMaxContractAmount(p), 25000);
});

test("0-6 years of service with a qualifying award gets 30% max tier", () => {
	const p = makePlayer({
		awards: [{ season: g.get("season"), type: "Most Valuable Player" }],
		yearsOfService: 2,
	});
	assert.strictEqual(getMaxSalaryTier(p), 30);
	assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
});

test("0-6 years of service with recent All-League gets 30% max tier", () => {
	const p = makePlayer({
		awards: [{ season: g.get("season"), type: "First Team All-League" }],
		yearsOfService: 2,
	});
	assert.strictEqual(getMaxSalaryTier(p), 30);
	assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
});

test("All-Defensive alone does not qualify for Rose/Higher Max", () => {
	const p = makePlayer({
		awards: [{ season: g.get("season"), type: "First Team All-Defensive" }],
		yearsOfService: 2,
	});
	assert.strictEqual(getMaxSalaryTier(p), 25);
	assert.strictEqual(getDynamicMaxContractAmount(p), 25000);
});

test("7-9 years of service gets 30% max tier", () => {
	const p = makePlayer({ yearsOfService: 8 });
	assert.strictEqual(getMaxSalaryTier(p), 30);
	assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
});

test("10+ years of service gets 35% max tier", () => {
	const p = makePlayer({ yearsOfService: 10 });
	assert.strictEqual(getMaxSalaryTier(p), 35);
	assert.strictEqual(getDynamicMaxContractAmount(p), 35000);
});

test("10+ years of service can exceed the old global maxContract when salary cap is higher", () => {
	const p = makePlayer({ yearsOfService: 10 });
	g.setWithoutSavingToDB("salaryCap", 150000);
	g.setWithoutSavingToDB("maxContract", 50000);
	assert.strictEqual(getDynamicMaxContractAmount(p), 52500);
	assert.strictEqual(getMaxContractForPlayer(p), 52500);
});

test("dynamic max contract amount tracks salary cap changes", () => {
	const p = makePlayer({ yearsOfService: 3 });
	g.setWithoutSavingToDB("salaryCap", 120000);
	assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
	g.setWithoutSavingToDB("salaryCap", 90000);
	assert.strictEqual(getDynamicMaxContractAmount(p), 22500);
});
