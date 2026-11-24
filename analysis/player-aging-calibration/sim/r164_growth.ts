import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeV9 } from "./formulas/v9.ts";

// V9 with the same total growth spread more evenly over 19-25. In three eras ordinary 19-22 year olds (outside the top
// 150) reached the top 150 within three years far more often than in the NBA, while 23-25 rises were too rare. The tilt
// only moves the expected yearly change; V9's independence of skills, spread, limits and every other age are untouched.
export const TILT = .6;
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "formulas/v9_specs.json");
const spec = structuredClone(JSON.parse(readFileSync(file, "utf8")).v9s_l4);
for (const ages of Object.values(spec.off) as Record<string, number>[]) {
	for (const age of [18, 19, 20, 21, 22]) ages[String(age)]! -= TILT;
	for (const age of [23, 24, 25]) ages[String(age)]! += TILT;
}
export const tilted = makeV9(spec);
