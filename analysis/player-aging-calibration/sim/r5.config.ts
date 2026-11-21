// Round 5 research config: instruments GameSim shot selection / make / foul branches IN MEMORY (src/ untouched).
// Every replacement must match exactly once, otherwise the run stops. With no hook installed each replacement
// evaluates to the original expression, so the "unchanged" arm runs the product logic.
//   r4ShotProbability(pid)        regular 3PA choice probability (round-4 hook, unchanged semantics)
//   r5ForcedThree(pid)            false -> a forced/late-clock three is NOT forced for this player (normal choice instead)
//   r5TwoType(pid)                "atRim" | "lowPost" | "midRange" replaces the r1/r2/r3 draw
//   r5MakeShift(type, pid)        additive change of the two-point base make probability (before defense)
//   r5FoulScale(type)             multiplies the shooting-foul probabilities of that shot type
//   r6AstProb(pid, base)          probability that this shooter's attempt is assisted (round 6 creation context)
//   (r5MakeShift also receives `assisted` as a third argument in round 6)
//   r6BlockWeight(type)           relative block probability of this shot type (NBA zone block rates)
//   r6ThreeShift(pid)             additive three-point make shift
import base from "../../../vitest.config.ts";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

const replacements: [string, string][] = [
	['0.67 * shootingThreePointerScaled2 * g.get("threePointTendencyFactor")',
		'(globalThis.r4ShotProbability?.(p.id, this.allStarGame) ?? (0.67 * shootingThreePointerScaled2)) * g.get("threePointTendencyFactor")'],
	["forceThreePointer ||\n\t\t\tMath.random() <",
		"(forceThreePointer && (globalThis.r5ForcedThree?.(p.id) ?? true)) ||\n\t\t\tMath.random() <"],
	["if (r1 > r2 && r1 > r3) {",
		"const r5Type = globalThis.r5TwoType?.(p.id, this.allStarGame);\n\t\t\tif (r5Type !== undefined ? r5Type === \"midRange\" : r1 > r2 && r1 > r3) {"],
	["} else if (r2 > r3) {", "} else if (r5Type !== undefined ? r5Type === \"atRim\" : r2 > r3) {"],
	['probMake *= g.get("twoPointAccuracyFactor");',
		'probMake += globalThis.r5MakeShift?.(type, p.id, passer !== undefined) ?? 0;\n\t\t\tprobMake *= g.get("twoPointAccuracyFactor");'],
	["(this.t > 1 && this.probAst() > Math.random())",
		"(this.t > 1 && (globalThis.r6AstProb?.(p.id, this.probAst()) ?? this.probAst()) > Math.random())"],
	["if (this.probBlk() > Math.random()) {", "if (this.probBlk() * (globalThis.r6BlockWeight?.(type) ?? 1) > Math.random()) {"],
	['probMake *= g.get("threePointAccuracyFactor");',
		'probMake *= g.get("threePointAccuracyFactor");\n\t\t\tprobMake += globalThis.r6ThreeShift?.(p.id) ?? 0;'],
	["probMissAndFoul *= foulFactor;", "probMissAndFoul *= foulFactor * (globalThis.r5FoulScale?.(type, p.id) ?? 1);"],
	["probAndOne *= foulFactor;", "probAndOne *= foulFactor * (globalThis.r5FoulScale?.(type, p.id) ?? 1);"],
	// R15: playground-only DRB outlet bias (commit d5e78d8e7, not upstream); hook returns the multiplier, undefined = product
	["const outletBias = 0.85 + 0.35 * passing;", "const outletBias = globalThis.r15DrbOutlet?.(passing) ?? (0.85 + 0.35 * passing);"],
];

// round 6: usage state. loadTeams computes the usage composite; multiply it by a per-player factor when installed.
const usageAnchor = "p2.compositeRating.usage = p2.compositeRating.usage ** 1.9;";
const usageResearch = {
	name: "research-round6-usage",
	enforce: "pre",
	transform(code, id) {
		if (!id.endsWith("/src/worker/core/game/loadTeams.ts")) return;
		if (code.split(usageAnchor).length !== 2) throw new Error("loadTeams usage branch changed");
		let transformed = code.replace(usageAnchor, usageAnchor + "\n\t\t\tp2.compositeRating.usage *= globalThis.r6UsageMult?.(p.pid) ?? 1;");
		if (process.env.AGING_R151_ROLE) {
			const anchor = "player.compositeRating(\n\t\t\t\t\trating,";
			if (transformed.split(anchor).length !== 2) throw new Error("loadTeams composite rating input changed");
			transformed = transformed.replace(anchor, "player.compositeRating(\n\t\t\t\t\tglobalThis.r151RatingsForComposite?.(p.pid, k) ?? rating,");
		}
		return transformed;
	},
} satisfies Plugin;

const shotResearch = {
	name: "research-round5-shots",
	enforce: "pre",
	transform(code, id) {
		if (!id.endsWith("/src/worker/core/GameSim.basketball/index.ts")) return;
		for (const [before, after] of replacements) {
			if (code.split(before).length !== 2) throw new Error(`GameSim branch changed: ${before}`);
			code = code.replace(before, after);
		}
		return code;
	},
} satisfies Plugin;
const project = base.test?.projects?.[0];
if (!project || typeof project !== "object" || !("plugins" in project)) {
	throw new Error("Expected the basketball project in the repository's Vitest config");
}
export default defineConfig({
	...project,
	plugins: [...(project.plugins ?? []), shotResearch, usageResearch, {
		name: "research-r16-trade-parity",
		enforce: "pre",
		transform(code, id) {
			if (process.env.AGING_R16_TRADE_PROBE !== "1" || !id.endsWith("/src/worker/core/team/valueChange.ts")) return;
			const anchor = 'if (includeInjuries && tid !== g.get("userTid")) {';
			if (code.split(anchor).length !== 2) throw new Error("Trade injury discount branch changed");
			return code.replace(anchor, 'if (includeInjuries && (tid !== g.get("userTid") || (globalThis.r16TradeParity && (g.get("spectator") || local.autoPlayUntil)))) {') +
				"\nexport { getAssetUtility as researchGetAssetUtility };\n";
		},
	}],
});
