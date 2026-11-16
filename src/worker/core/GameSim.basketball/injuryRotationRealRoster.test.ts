import { appendFileSync } from "node:fs";
import { assert, test } from "vitest";
import fixture from "../../../test/fixtures/basketballMilPinnedInjury.json";
import { resetG } from "../../../test/helpers.ts";
import { PHASE } from "../../../common/index.ts";
import { g, helpers } from "../../util/index.ts";
import { getGameEffectiveBasketballMinutesWithStatus as allocate } from "../team/basketballMinutes.ts";
import GameSim from "./index.ts";

type Args = Parameters<typeof allocate>[0];

// Fixture normalization only: the removed Form system multiplied these composites by
// 1 + 0.08 * formFactor (FULL) or 1 + 0.04 * formFactor (WEAK), with
// formFactor = clamp(crossGameForm + gameForm, -15, 15) / 15.
const LEGACY_FORM_FULL = [
	"usage",
	"passing",
	"shootingMidRange",
	"shootingThreePointer",
	"shootingFT",
	"shootingLowPost",
	"drawingFouls",
];
const LEGACY_FORM_WEAK = [
	"shootingAtRim",
	"rebounding",
	"stealing",
	"defense",
	"defenseInterior",
	"defensePerimeter",
];
const stripLegacyFormMultiplier = (p: {
	compositeRating: Record<string, number>;
	gameForm?: number;
	researchCrossGameForm?: number;
}) => {
	const formFactor =
		helpers.bound(
			(p.researchCrossGameForm ?? 0) + (p.gameForm ?? 0),
			-15,
			15,
		) / 15;
	for (const k of LEGACY_FORM_FULL) {
		if (p.compositeRating[k] !== undefined) {
			p.compositeRating[k] /= 1 + formFactor * 0.08;
		}
	}
	for (const k of LEGACY_FORM_WEAK) {
		if (p.compositeRating[k] !== undefined) {
			p.compositeRating[k] /= 1 + formFactor * 0.04;
		}
	}
	delete p.gameForm;
	delete p.researchCrossGameForm;
};
const seed = (input: number) => {
	let state = input >>> 0;
	Math.random = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
};

// Frozen production loadTeams inputs from copied real rosters, not a League Save.
// True composites below are GameSim-only. The planner sees only fixture.planning.
test("real MIL roster: protected pins survive 0→1 and complete regulation/OT games", () => {
	const originalRandom = Math.random;
	try {
		resetG();
		g.setWithoutSavingToDB("season", fixture.season);
		g.setWithoutSavingToDB("startingSeason", fixture.season);
		g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
		g.setWithoutSavingToDB("challengeNoRatings", true);
		g.setWithoutSavingToDB("userTid", 12);
		g.setWithoutSavingToDB("userTids", [12]);
		const before = fixture.planning as Args;
		const after = {
			...before,
			minutesByPid: { ...before.minutesByPid, 18: 1, 523: 34 },
		};
		const results = [allocate(before), allocate(after)];
		for (const result of results) {
			assert.isUndefined(result.allocationError);
			assert.isUndefined(result.currentMinutesOverrideError);
			assert.equal(result.minutesByPid[16], 20);
			assert.equal(result.minutesByPid[18], 0);
		}
		assert.isBelow(
			Math.max(
				...before.players.map((p) =>
					Math.abs(
						results[0]!.minutesByPid[p.pid]! - results[1]!.minutesByPid[p.pid]!,
					),
				),
			),
			3,
		);
		for (const p of before.players) {
			assert.notProperty(p, "ovr");
			assert.notProperty(p, "ovrPercentile");
			assert.notProperty(p, "roleScores");
			assert.notProperty(p, "value");
		}
		const games = Number(process.env.BBGM_ROTATION_REVIEW_GAMES ?? 4);
		assert.isTrue(Number.isInteger(games) && games > 0 && games <= 100);
		for (const [state, targets] of results.entries()) {
			for (let i = 0; i < games; i++) {
				const gameSeed = 99101100 + i;
				const teams = structuredClone(
					fixture.teams,
				) as unknown as ConstructorParameters<typeof GameSim>[0]["teams"];
				for (const p of teams[0].player) {
					p.plannedMinutes = targets.minutesByPid[p.id]!;
				}
				seed(gameSeed);
				// The frozen fixture was captured while the (now removed) Form system was
				// active, so its composites include that game's Form multiplier. Strip it so
				// GameSim receives the Form-free composites production loadTeams now builds.
				for (const t of teams) {
					for (const p of t.player) {
						stripLegacyFormMultiplier(
							p as typeof p & {
								gameForm?: number;
								researchCrossGameForm?: number;
							},
						);
					}
				}
				const result = new GameSim({
					gid: gameSeed,
					teams,
					baseInjuryRate: g.get("injuryRate"),
					doPlayByPlay: false,
					homeCourtFactor: 1,
					allStarGame: false,
					neutralSite: true,
				}).run();
				for (const team of result.team) {
					assert.isAbove(team.stat.pts, 0);
					assert.equal(
						team.player.reduce((a, p) => a + p.stat.pts, 0),
						team.stat.pts,
					);
					assert.closeTo(team.stat.min, 240 + 25 * result.overtimes, 1e-5);
				}
				if (process.env.BBGM_ROTATION_REVIEW_OUTPUT) {
					appendFileSync(
						process.env.BBGM_ROTATION_REVIEW_OUTPUT,
						JSON.stringify({
							state,
							seed: gameSeed,
							score: result.team.map((t) => t.stat.pts),
							overtimes: result.overtimes,
							players: result.team[0].player.map((p) => ({
								pid: p.id,
								target: targets.minutesByPid[p.id],
								minutes: p.stat.min,
							})),
						}) + "\n",
					);
				}
			}
		}
	} finally {
		Math.random = originalRandom;
	}
}, 60000);
