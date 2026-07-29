import { assert, test } from "vitest";
import gradientStyleFactory from "./gradientStyleFactory.ts";

const style = gradientStyleFactory(25, 45, 55, 75);

test("gradient style has stable endpoints and bounded alpha", () => {
	assert.deepStrictEqual(style(0), {
		backgroundColor: "rgb(var(--gradient-base-danger))",
	});
	assert.isDefined(style(25));
	assert.isDefined(style(75));
	assert.deepStrictEqual(style(100), {
		backgroundColor: "rgb(var(--gradient-base-success))",
	});

	for (const value of [-100, 10, 35, 65, 90, 200]) {
		const backgroundColor = style(value)?.backgroundColor;
		if (backgroundColor?.startsWith("rgba")) {
			const alpha = Number(backgroundColor.match(/, ([\d.]+)\)$/)?.[1]);
			assert.isAtLeast(alpha, 0);
			assert.isAtMost(alpha, 1);
		}
	}
});
