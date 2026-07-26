import { describe, expect, test } from "vitest";
import { getNextRequestedPidIndex } from "./players.ts";

describe("getCopies.players pid cursor", () => {
	test("advances after a missing requested pid", () => {
		expect(getNextRequestedPidIndex([1, 2], 2, 0)).toBe(2);
		expect(getNextRequestedPidIndex([1, 3], 2, 0)).toBe(1);
		expect(getNextRequestedPidIndex([1, 2, 3, 10], 4, 0)).toBe(3);
	});
});
