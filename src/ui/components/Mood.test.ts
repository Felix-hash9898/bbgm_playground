import { assert, test } from "vitest";
import { getMoodProbabilityClassName } from "./moodProbability.ts";

test.each([
	[0.79, "text-danger"],
	[0.8, "text-orange"],
	[0.94, "text-orange"],
	[0.95, "text-warning"],
	[0.98, "text-warning"],
	[0.99, "text-success"],
	[1, "text-success"],
])(
	"Mood probability %s uses the agreed risk color",
	(probability, expected) => {
		assert.strictEqual(getMoodProbabilityClassName(probability), expected);
	},
);
