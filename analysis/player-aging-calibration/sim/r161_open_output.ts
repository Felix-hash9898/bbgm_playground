import { appendFileSync } from "node:fs";
import path from "node:path";
import type { Player } from "../../../src/common/types.ts";
import getPayroll from "../../../src/worker/core/team/getPayroll.ts";
import { idb } from "../../../src/worker/db/index.ts";
import { g } from "../../../src/worker/util/index.ts";

const output = process.env.FULL_OUT!;
const hooks = globalThis as typeof globalThis & {
	r161OpenStyle: (season: number, factor: number, adjusted: number) => void;
	r161OpenPayroll: (season: number) => Promise<void>;
	r161OpenSigning: (p: Player, tid: number, contract: Player["contract"], before: number, after: number) => void;
};

function record(file: string, row: object) {
	appendFileSync(path.join(output, file), JSON.stringify(row) + "\n");
}

hooks.r161OpenStyle = (season, factor, adjusted) => record("style_response.jsonl", { season, factor, adjusted });
hooks.r161OpenPayroll = async season => {
	const teams = (await idb.cache.teams.getAll()).filter(t => !t.disabled);
	const payroll = await Promise.all(teams.map(async t => [t.tid, await getPayroll(t.tid, season)]));
	record("team_payroll.jsonl", { season, cap: g.get("salaryCap"), luxuryPayroll: g.get("luxuryPayroll"), payroll });
};
hooks.r161OpenSigning = (p, tid, contract, before, after) => record("incumbent_signings.jsonl", {
	season: g.get("season"), phase: g.get("phase"), pid: p.pid, id: p.srID, tid, priorTid: p.priorContractTid,
	faDays: p.numDaysFreeAgent, amount: contract.amount, exp: contract.exp, cap: g.get("salaryCap"),
	luxuryPayroll: g.get("luxuryPayroll"), before, after,
});
