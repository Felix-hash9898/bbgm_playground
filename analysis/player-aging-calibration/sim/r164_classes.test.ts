// Draft classes as a league makes them: created three years early (the product does not develop prospects before the draft), then 16 seasons.
import "fake-indexeddb/auto";
import { writeFileSync } from "node:fs";
import { describe, it, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../src/common/budgetLevels.ts";
import { PHASE } from "../../../src/common/index.ts";

const DEV_PATH = "../../../src/worker/core/player/developSeason.basketball.ts";
const CLASSES = Number(process.env.R164_CLASSES ?? 24);
const SKILLS = ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"];
let state = 1;
const seed = (n: number) => {
	state = n | 0;
	Math.random = () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

describe.skipIf(!process.env.R164_CLASSES_TEST)("draft classes", () => {
	it("follows classes from creation", async () => {
		const rows: unknown[] = [];
		for (const [item, rule] of JSON.parse(process.env.R164_CLASSES_ARMS!)) {
			const arm = item.split("|")[0]!;
			vi.resetModules();
			vi.doMock(DEV_PATH, async () => {
				if (arm === "playground") return vi.importActual(DEV_PATH);
				if (arm === "official") return import("./formulas/official.developSeason.basketball.ts");
				if (arm === "v9s_l4j") return { default: (await import("./r164_growth.ts")).corrected };
				return { default: (await import("./formulas/v9.ts")).V9[arm!] };
			});
			(globalThis as any).r164Classes = rule;
			await import("../../../src/worker/index.ts");
			const { resetG, resetCache } = await import("../../../src/test/helpers.ts");
			const { g } = await import("../../../src/worker/util/index.ts");
			const gen = (await import("../../../src/worker/core/draft/genPlayersWithoutSaving.ts")).default;
			const develop = (await import("../../../src/worker/core/player/developSeason.ts")).default;
			const ovr = (await import("../../../src/worker/core/player/ovr.ts")).default;
			resetG();
			await resetCache({ players: [], teams: [], teamSeasons: [] } as any);
			const year = 2040;
			g.setWithoutSavingToDB("season", year);
			g.setWithoutSavingToDB("phase", PHASE.DRAFT);
			for (let c = 0; c < CLASSES; c++) {
				seed(9100 + c);
				const players: any[] = await gen(year + 3, DEFAULT_LEVEL, []);
				for (const [i, p] of players.entries()) {
					seed(50_000 + c * 200 + i);
					const r = p.ratings.at(-1);
					let age = year + 3 - p.born.year;
					const path: number[] = [], skills: Record<number, unknown> = {};
					for (let k = 0; k <= 16; k++) {
						if (k) { age++; await develop(r, age, undefined, DEFAULT_LEVEL, false); r.ovr = ovr(r); }
						path.push(r.ovr);
						if (k === 1 || k === 4 || k === 7) skills[k] = Object.fromEntries(SKILLS.map(s => [s, r[s]]));
					}
					rows.push({ arm: item, c, age: year + 3 - p.born.year, path, skills });
				}
			}
		}
		writeFileSync(process.env.R164_CLASSES_TEST!, JSON.stringify(rows), { flag: "wx" });
	}, 900_000);
});
