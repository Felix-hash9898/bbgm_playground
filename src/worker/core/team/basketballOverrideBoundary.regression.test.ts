import { assert, test } from "vitest";
import {
	getBasketballMinutesOverrideContext,
	getGameEffectiveBasketballMinutesWithStatus as allocate,
} from "./basketballMinutes.ts";
test("valid locked Current Override stays continuous at an injured zero-minute reserve", () => {
	const positions = ["PG", "SG", "SF", "PF", "C", "G", "FC", "PG", "GF", "C"];
	const players = positions.map((position, pid) => ({
		pid,
		position,
		rosterOrder: pid,
		endurance: 0.5,
		available: pid !== 6,
	}));
	const available = new Set(
		players.filter((p) => p.available).map((p) => p.pid),
	);
	const plan: Record<number, number> = {
		0: 48,
		1: 48,
		2: 48,
		3: 48,
		4: 24,
		5: 24,
		6: 0,
		7: 0,
		8: 0,
		9: 0,
	};
	const common = {
		players,
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
		coreReliance: "high" as const,
		rotationDepth: "short" as const,
		noInjuryMinutesIncreasePids: [1, 2, 3, 4, 5],
		currentMinutesOverrideByPid: { 0: 28 },
		currentMinutesOverrideContext: getBasketballMinutesOverrideContext({
			players,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		}),
	};
	const a = allocate({ ...common, minutesByPid: plan });
	const b = allocate({ ...common, minutesByPid: { ...plan, 1: 47, 6: 1 } });
	assert.isUndefined(a.allocationError);
	assert.isUndefined(b.allocationError);
	assert.equal(a.minutesByPid[0], 28);
	assert.equal(b.minutesByPid[0], 28);
	const maximum = Math.max(
		...positions.map((_, pid) =>
			Math.abs(a.minutesByPid[pid]! - b.minutesByPid[pid]!),
		),
	);
	assert.isBelow(
		maximum,
		3,
		"one minute assigned to an unavailable reserve must not rearrange current override by double digits",
	);
});
