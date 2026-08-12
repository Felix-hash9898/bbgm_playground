import { assert, test } from "vitest";
import {
	getRosterContractSearchValue,
	getRosterContractTerms,
} from "./rosterContractTerms.ts";

const player = {
	draft: { year: 2020 },
	contract: {
		amount: 17_500_000,
		exp: 2028,
		option: "player" as const,
		type: "twoWay" as const,
		exception: "midLevel" as const,
	},
};

test("Roster contract terms use a stable compact order", () => {
	assert.deepEqual(getRosterContractTerms(player.contract), [
		"PO",
		"2W",
		"MLE",
	]);
	assert.deepEqual(
		getRosterContractTerms({ amount: 1, exp: 2028, option: "team" }),
		["TO"],
	);
	assert.deepEqual(getRosterContractTerms({ amount: 1, exp: 2028 }), []);
});

test("Roster contract search values keep normal text and terms separate", () => {
	assert.strictEqual(
		getRosterContractSearchValue({
			amount: "$17.5M",
			exp: 2028,
			terms: [],
		}),
		"$17.5M thru 2028",
	);
	assert.strictEqual(
		getRosterContractTerms(player.contract).join(" "),
		"PO 2W MLE",
	);
});
