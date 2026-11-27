import { readFileSync } from "node:fs";
import { makeV9 } from "./formulas/v9.ts";
import { COMPOSITION, CORRECTION } from "./r164_growth.ts";

type Profile = "young" | "veteran";
const specFile = new URL("./formulas/v9_specs.json", import.meta.url);

/** Split N by its disjoint age bands and keep K's draws, limits and coaching. */
function makeComposition(profile: Profile) {
	const spec = JSON.parse(readFileSync(specFile, "utf8")).v9s_l4;
	const shifts = COMPOSITION.filter(([firstAge]) => (firstAge >= 29) === (profile === "veteran"));

	for (const [firstAge, lastAge, ratings] of [...CORRECTION, ...shifts]) {
		for (const [key, delta] of Object.entries(ratings)) {
			for (let age = firstAge; age <= lastAge; age += 1) {
				spec.off[key][age] += delta;
			}
		}
	}
	return makeV9(spec);
}

export const youngComposition = makeComposition("young");
export const veteranComposition = makeComposition("veteran");
