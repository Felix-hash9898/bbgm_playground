import { describe, expect, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { helpers } from "../../../common/index.ts";
import type { Player } from "../../../common/types.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { player, team } from "../index.ts";
import * as util from "../../util/index.ts";
import {
	getBasketballCompositeInjuryFactor,
	processTeam,
} from "./loadTeams.ts";

describe("basketball loadTeams composite modifiers", () => {
	test("legacy Form fields from old saves do not affect composite ratings", async () => {
		resetG();
		const g = util.g;
		g.setWithoutSavingToDB("userTid", 0);
		g.setWithoutSavingToDB("userTids", [0]);
		g.setWithoutSavingToDB("spectator", false);
		g.setWithoutSavingToDB("numPlayersOnCourt", 5);

		const basePlayers = Array.from({ length: 10 }, (_, i) => {
			const p = player.generate(1, 25, 2024, true, DEFAULT_LEVEL) as Player;
			p.pid = 300 + i;
			p.rosterOrder = i;
			return p;
		});
		const t = team.generate({ ...helpers.getTeamsDefault()[1], tid: 1 });
		const teamSeason = { won: 0, lost: 0, tied: 0, otl: 0, cid: 0, did: 0 };

		const run = async (legacyForm: boolean) => {
			const players = structuredClone(basePlayers);
			if (legacyForm) {
				// Shape of player objects stored by the removed Form system
				for (const p of players) {
					Object.assign(p, { form: 10, gameForm: 5 });
				}
			}
			await resetCache({ players, teams: [t] });
			return processTeam(t, teamSeason, players);
		};

		const withoutForm = await run(false);
		const withLegacyForm = await run(true);

		expect(withLegacyForm.player.length).toBe(withoutForm.player.length);
		for (let i = 0; i < withoutForm.player.length; i++) {
			const a = withoutForm.player[i];
			const b = withLegacyForm.player[i];
			expect(b.id).toBe(a.id);
			expect(b.compositeRating).toEqual(a.compositeRating);
			expect(b).not.toHaveProperty("gameForm");
		}
	});

	test("injury does not scale turnovers but still scales positive composites", () => {
		for (const injuryFactor of [1, 0.9, 0.8, 0.7]) {
			expect(
				0.4 * getBasketballCompositeInjuryFactor("turnovers", injuryFactor),
			).toBe(0.4);
			for (const composite of ["usage", "dribbling", "passing"]) {
				expect(
					0.6 * getBasketballCompositeInjuryFactor(composite, injuryFactor),
				).toBeCloseTo(0.6 * injuryFactor);
			}
		}
	});

	test("user-controlled invalid planned minutes shows a transient danger toast before throwing", async () => {
		resetG();
		const g = util.g;
		g.setWithoutSavingToDB("userTid", 0);
		g.setWithoutSavingToDB("userTids", [0]);
		g.setWithoutSavingToDB("spectator", false);
		g.setWithoutSavingToDB("numPlayersOnCourt", 5);

		const players = Array.from({ length: 8 }, (_, i) => {
			const p = player.generate(0, 25, 2024, true, DEFAULT_LEVEL) as Player;
			p.pid = 100 + i;
			p.rosterOrder = i;
			return p;
		});
		const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
		t.basketballRotation = {
			version: 1,
			mode: "custom",
			minutesByPid: Object.fromEntries(
				players.map((p, i) => [p.pid, i === 0 ? 40 : 20]),
			),
			numPlayersOnCourtAtSave: 5,
		};
		await resetCache({ players, teams: [t] });

		const toUISpy = vi
			.spyOn(util, "toUI")
			.mockResolvedValue(undefined as never);
		let error: unknown;
		try {
			await processTeam(
				t,
				{ won: 0, lost: 0, tied: 0, otl: 0, cid: 0, did: 0 },
				players,
			);
		} catch (error_) {
			error = error_;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(
			/Cannot start a basketball game: planned minutes must total 240/,
		);
		expect(toUISpy).toHaveBeenCalledWith("showEvent", [
			{
				type: "error",
				text: "Cannot start a basketball game: planned minutes must total 240 before simulating. Fix the custom plan on the Roster page.",
				persistent: false,
				extraClass: "notification-danger",
			},
		]);
		toUISpy.mockRestore();
	});

	test("AI team invalid planned minutes throws without showing user-facing toast", async () => {
		resetG();
		const g = util.g;
		g.setWithoutSavingToDB("userTid", 0);
		g.setWithoutSavingToDB("userTids", [0]);
		g.setWithoutSavingToDB("spectator", false);
		g.setWithoutSavingToDB("numPlayersOnCourt", 5);

		const players = Array.from({ length: 8 }, (_, i) => {
			const p = player.generate(1, 25, 2024, true, DEFAULT_LEVEL) as Player;
			p.pid = 200 + i;
			p.rosterOrder = i;
			return p;
		});
		const t = team.generate({ ...helpers.getTeamsDefault()[1], tid: 1 });
		// Only 3 players on court available or fewer than numPlayersOnCourt
		const shortPlayers = players.slice(0, 3);
		await resetCache({ players: shortPlayers, teams: [t] });

		const toUISpy = vi
			.spyOn(util, "toUI")
			.mockResolvedValue(undefined as never);
		let error: unknown;
		try {
			await processTeam(
				t,
				{ won: 0, lost: 0, tied: 0, otl: 0, cid: 0, did: 0 },
				shortPlayers,
			);
		} catch (error_) {
			error = error_;
		}

		expect(error).toBeInstanceOf(Error);
		expect(toUISpy).not.toHaveBeenCalledWith("showEvent", expect.anything());
		toUISpy.mockRestore();
	});
});
