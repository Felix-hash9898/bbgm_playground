import { beforeEach, assert, test } from "vitest";
import defaultGameAttributes from "../../../common/defaultGameAttributes.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import { player, team } from "../index.ts";
import {
	canUseMidLevelException,
	getContractExceptionResult,
	getMidLevelExceptionAmount,
	getMidLevelExceptionMaxContractLength,
	getMidLevelExceptionSeason,
	getMidLevelFailureReason,
	isMidLevelExceptionAvailable,
} from "./contractMidLevel.ts";

const makePlayer = ({
	draftYear = g.get("season") - 5,
}: {
	draftYear?: number;
} = {}) => {
	const p = player.generate(PLAYER.FREE_AGENT, 28, draftYear, true, 0);
	p.draft.year = draftYear;
	return p;
};

const makeTeam = (overrides: Record<string, unknown> = {}) =>
	team.generate({
		...helpersTeamBase,
		...overrides,
	});

const helpersTeamBase = {
	tid: 0,
	cid: 0,
	did: 0,
	region: "Region",
	name: "Name",
	abbrev: "TST",
	popRank: 0,
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("salaryCap", 150000);
	g.setWithoutSavingToDB("salaryCapType", "soft");
});

test("getMidLevelExceptionAmount is 9.12% of the salary cap", () => {
	assert.strictEqual(
		getMidLevelExceptionAmount(),
		Math.round((g.get("salaryCap") * 0.0912) / 10) * 10,
	);
});

test("MLE is basketball-only and soft-cap-only", () => {
	const p = makePlayer();
	const t = makeTeam();
	const contract = {
		amount: getMidLevelExceptionAmount(),
		exp: g.get("season") + 1,
	};

	assert.strictEqual(canUseMidLevelException({ contract, p, team: t }), true);
	g.setWithoutSavingToDB("salaryCapType", "hard");
	assert.strictEqual(canUseMidLevelException({ contract, p, team: t }), false);
});

test("MLE is unavailable without a team and fails safe as ineligible", () => {
	const p = makePlayer();
	const contract = {
		amount: getMidLevelExceptionAmount(),
		exp: g.get("season") + 1,
	};

	assert.strictEqual(isMidLevelExceptionAvailable(undefined), false);
	assert.strictEqual(
		canUseMidLevelException({ contract, p, team: undefined }),
		false,
	);
	assert.strictEqual(
		getMidLevelFailureReason({ contract, p, team: undefined }),
		"ineligible",
	);
});

test("MLE is unavailable when the team already used it this season and available next season", () => {
	const t = makeTeam({ midLevelExceptionUsedSeason: g.get("season") });

	assert.strictEqual(isMidLevelExceptionAvailable(t), false);
	t.midLevelExceptionUsedSeason = g.get("season") - 1;
	assert.strictEqual(isMidLevelExceptionAvailable(t), true);
});

test("MLE availability uses signing season in free agency", () => {
	const t = makeTeam({ midLevelExceptionUsedSeason: g.get("season") });

	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);

	assert.strictEqual(getMidLevelExceptionSeason(), g.get("season") + 1);
	assert.strictEqual(isMidLevelExceptionAvailable(t), true);

	t.midLevelExceptionUsedSeason = getMidLevelExceptionSeason();
	assert.strictEqual(isMidLevelExceptionAvailable(t), false);
});

test("MLE max contract length is capped at 4 years", () => {
	g.setWithoutSavingToDB("maxContractLength", 6);
	assert.strictEqual(getMidLevelExceptionMaxContractLength(), 4);
	g.setWithoutSavingToDB("maxContractLength", 3);
	assert.strictEqual(getMidLevelExceptionMaxContractLength(), 3);
});

test("over-cap above-minimum signing within MLE resolves to midLevel", () => {
	const p = makePlayer();
	const t = makeTeam();
	const contract = {
		amount: getMidLevelExceptionAmount() - 100,
		exp: g.get("season") + 1,
	};

	assert.strictEqual(
		getContractExceptionResult({
			birdException: false,
			contract,
			p,
			payroll: g.get("salaryCap") + 1000,
			team: t,
		}).type,
		"midLevel",
	);
});

test("bird exception remains higher priority than MLE", () => {
	const p = makePlayer();
	const t = makeTeam();
	const contract = {
		amount: getMidLevelExceptionAmount() + 1000,
		exp: g.get("season") + 1,
	};

	assert.strictEqual(
		getContractExceptionResult({
			birdException: true,
			contract,
			p,
			payroll: g.get("salaryCap") + 1000,
			team: t,
		}).type,
		"bird",
	);
});

test("default basketball luxury tax line is 182250", () => {
	assert.strictEqual(defaultGameAttributes.luxuryPayroll, 182250);
});
