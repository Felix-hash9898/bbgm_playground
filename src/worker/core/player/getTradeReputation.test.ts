import { assert, test } from "vitest";
import { getTradeReputation } from "./getTradeReputation.ts";

test("trade reputation uses the three-season weighted snapshot", () => {
	assert.strictEqual(
		getTradeReputation(
			[
				{ season: 2024, numPlayersTradedAway: 4 } as any,
				{ season: 2025, numPlayersTradedAway: 2 } as any,
				{ season: 2026, numPlayersTradedAway: 8 } as any,
			],
			2026,
		),
		8,
	);
});
