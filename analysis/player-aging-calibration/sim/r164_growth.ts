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

// Arm L: what declines with age, not how much. Same-measure production of the NBA 2005-26 (both eras, every height group) and the real
// ratings of both eras agree in direction (scripts/157-159): from 29 veterans keep steals, blocks and defensive IQ and lose shot volume and
// finishing; V9 (like Playground) did the reverse. At 20-25 defensive IQ grew two to three times too fast and inside scoring, mid-range
// and passing too slowly. OVR-neutral to .02 a year in every band, spread unchanged.
export const COMPOSITION: [number, number, Shift][] = [
	[20, 22, { diq: -1.2, ins: 1.2, fg: 1, pss: .8, stre: .4, spd: .3, tp: .4, ft: .5 }],
	[23, 25, { diq: -.5, ins: .2, pss: .2, stre: .2, spd: .3 }],
	[29, 31, { diq: .5, spd: .6, jmp: .7, dnk: -.9, fg: -.4, tp: -.6, ins: -.2, endu: -.7, drb: -.2, oiq: -.3 }],
	[32, 34, { diq: .3, spd: .9, jmp: .9, dnk: -.8, fg: -.9, tp: -.6, ins: -.3, ft: -.3, endu: -.4, drb: -.3, pss: -.2, oiq: -.4, stre: -.2 }],
	[35, 38, { diq: .5, spd: .9, jmp: 1, dnk: -1, fg: -.6, tp: -.7, ins: -.9, ft: -.3, endu: -.7, drb: -.4, pss: -.5, oiq: -.3 }],
];
const mixed = structuredClone(fixed);
for (const [lo, hi, shift] of COMPOSITION) for (const [key, d] of Object.entries(shift)) for (let age = lo; age <= hi; age++) mixed.off[key][String(age)] += d;
export const composed = makeV9(mixed);
// Arm M: L with smaller permanent random steps after 29 (NBA production of 32-35 year olds five years on .74-.82, K .61). The small
// offset at 32-38 only restores the mean that the change limits add when the random terms are larger.
export const NOISE_29 = .8, NOISE_32 = .7, MEAN_32 = .15;
const calmed = structuredClone(mixed);
for (const ages of Object.values(calmed.off) as Record<string, number>[]) for (let age = 32; age <= 38; age++) ages[String(age)]! += MEAN_32;
export const composedCalm = makeV9(calmed, age => age >= 32 ? NOISE_32 : age >= 29 ? NOISE_29 : 1);
