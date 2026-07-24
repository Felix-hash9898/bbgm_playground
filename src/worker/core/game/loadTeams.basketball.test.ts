import { describe, expect, test } from "vitest";
import {
	applyBasketballForm,
	getBasketballCompositeInjuryFactor,
} from "./loadTeams.ts";

describe("basketball loadTeams composite modifiers", () => {
	test("form changes usage and passing but not turnovers", () => {
		for (const formFactor of [-1, -0.5, 0, 0.5, 1]) {
			const composites = {
				usage: 0.6,
				passing: 0.7,
				turnovers: 0.4,
			};
			applyBasketballForm(composites, formFactor);

			expect(composites.turnovers).toBe(0.4);
			expect(composites.usage).toBeCloseTo(0.6 * (1 + formFactor * 0.08));
			expect(composites.passing).toBeCloseTo(0.7 * (1 + formFactor * 0.08));
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
});
