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

// Correction of the expected yearly change (arm J). V9 copied Playground's mean change at every age, so it copied its errors too.
// Real opening players of 2006, 2011, 2015 and 2021, 27 archived leagues (scripts/156): OVR grows about .6 a year too fast at
// 21-25 and falls about .3-.4 a year too slowly from 29, and is right at 26-28; leaving out any one era keeps the signs at 21-25.
// By skill (the same people, three years on): strength runs 2 a year high at every age; threes, defensive IQ, passing,
// handling, inside and dunk are high when young; shooting IQ and mid-range are low at 23-25. Spread and independence unchanged.
type Shift = Record<string, number>;
export const CORRECTION: [number, number, Shift][] = [
	[20, 22, { stre: -1.5, endu: -.5, ins: -.3, dnk: -.3, ft: -.4, tp: -.9, oiq: -.6, diq: -1, drb: -.5, pss: -.7 }],
	[23, 25, { stre: -1.8, jmp: -.8, ins: -.2, dnk: -.4, fg: .3, tp: -.7, oiq: .3, diq: -.3, drb: -.5, pss: -.6 }],
	[26, 28, { stre: -1.2, jmp: -.3, ins: -.2, dnk: -.2, oiq: .3, diq: .4 }],
	[29, 37, { stre: -1, spd: -.25, jmp: -.25, endu: -.25, ins: -.25, dnk: -.25, ft: -.25, fg: -.25, tp: -.25, oiq: -.25, diq: -.25, drb: -.25, pss: -.25, reb: -.25 }],
];
const fixed = structuredClone(JSON.parse(readFileSync(file, "utf8")).v9s_l4);
for (const [lo, hi, shift] of CORRECTION) for (const [key, d] of Object.entries(shift)) for (let age = lo; age <= hi; age++) fixed.off[key][String(age)] += d;
export const corrected = makeV9(fixed);
