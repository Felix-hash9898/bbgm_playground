import { expect, test } from "vitest";
import {
	buildEstimatedPositionMinutes as build,
	POSITION_RATING_KEYS,
	type PositionRatings,
} from "./rotationPositions.ts";

const ratings = (patch: Partial<PositionRatings> = {}) =>
	({
		...Object.fromEntries(POSITION_RATING_KEYS.map((key) => [key, 50])),
		...patch,
	}) as PositionRatings;

test("offense, interior finishing and rim protection each affect contested roles", () => {
	for (const [code, others, slot, key] of [
		["G", ["SF", "PF", "C"], "PG", "oiq"],
		["F", ["PG", "SG", "C"], "PF", "ins"],
		["F", ["PG", "SG", "C"], "PF", "dnk"],
		["FC", ["PG", "SG", "SF"], "C", "diq"],
		["FC", ["PG", "SG", "SF"], "C", "jmp"],
		["FC", ["PG", "SG", "SF"], "C", "reb"],
	] as const) {
		const allocation = build({
			players: [code, code, ...others].map((pos, pid) => ({
				pid,
				pos,
				visibleRatings: ratings(pid === 0 ? { [key]: 80 } : {}),
			})),
			minutesByPid: { 0: 48, 1: 48, 2: 48, 3: 48, 4: 48 },
			numPlayersOnCourt: 5,
			gameMinutes: 48,
			ratingsVisible: true,
		});
		if (!allocation.valid) {
			throw Error(allocation.message);
		}
		expect(allocation.ratingsInformed).toBe(true);
		expect(allocation.rows[0]!.seconds[slot], key).toBeGreaterThan(
			allocation.rows[1]!.seconds[slot] + 60,
		);
	}
});

test("balanced specialists keep native responsibilities at all supported lengths", () => {
	for (const gameMinutes of [32, 40, 48, 60]) {
		const positions = ["PG", "SG", "SF", "PF", "C"] as const;
		const input = {
			players: positions.map((pos, pid) => ({
				pid,
				pos,
				visibleRatings: ratings(),
			})),
			minutesByPid: Object.fromEntries(
				positions.map((_, pid) => [pid, gameMinutes]),
			),
			numPlayersOnCourt: 5,
			gameMinutes,
			ratingsVisible: true,
		};
		const a = build(input);
		if (!a.valid) {
			throw Error(a.message);
		}
		for (const [i, pos] of positions.entries()) {
			expect(a.rows[i]!.seconds[pos]).toBeGreaterThan(
				(gameMinutes * 60 * 45) / 48,
			);
		}
		// An overall ability change for one player must not create a new role.
		for (const pid of [0, 2, 4]) {
			const players = input.players.map((p) =>
				p.pid === pid
					? {
							...p,
							visibleRatings: ratings(
								Object.fromEntries(
									POSITION_RATING_KEYS.map((key) => [key, 60]),
								),
							),
						}
					: p,
			);
			expect(build({ ...input, players })).toEqual(a);
		}
	}
});
