import { describe, expect, test } from "vitest";
import { movePlayerPids, swapPlayerPids } from "./reorderPlayers.ts";

const players = (pids: number[]) => pids.map((pid) => ({ pid }));

describe("roster edit ordering", () => {
	test("moves the player shown at the selected visual index", () => {
		const visuallySortedPlayers = players([2, 1, 3]);

		expect(movePlayerPids(visuallySortedPlayers, 1, 2)).toEqual([2, 3, 1]);
	});

	test("swaps the players shown at the two selected visual indexes", () => {
		const visuallySortedPlayers = players([2, 1, 3]);

		expect(swapPlayerPids(visuallySortedPlayers, 0, 2)).toEqual([3, 1, 2]);
	});

	test("bases a second optimistic move on the first move's visual order", () => {
		const firstOrder = movePlayerPids(players([1, 2, 3, 4]), 0, 2);
		const secondOrder = movePlayerPids(players(firstOrder), 1, 3);

		expect(firstOrder).toEqual([2, 3, 1, 4]);
		expect(secondOrder).toEqual([2, 1, 4, 3]);
		expect(secondOrder).not.toEqual(
			movePlayerPids(players([1, 2, 3, 4]), 1, 3),
		);
	});
});
