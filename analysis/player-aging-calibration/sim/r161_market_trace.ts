import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { PHASE, PLAYER } from "../../../src/common/index.ts";
import type { Player } from "../../../src/common/types.ts";
import type { CapturedSigningContext } from "../../../src/worker/core/capturedContext.ts";
import { g } from "../../../src/worker/util/index.ts";

const ids = new Set((process.env.R161_TRACE_IDS ?? "hardeja01,lavinza01").split(","));
const from = Number(process.env.R161_TRACE_FROM ?? 2022);
const to = Number(process.env.R161_TRACE_TO ?? 2025);
const output = process.env.FULL_OUT;
if (output) mkdirSync(output, { recursive: true });
const trace = (globalThis as typeof globalThis & {
	r161Trace?: (event: string, p: Player, extra?: Record<string, unknown>) => boolean | void;
	r161CaptureMarket?: (context: CapturedSigningContext) => Promise<void>;
	r161ReadRng?: () => number;
});
if (output) trace.r161Trace = (event, p, extra) => {
	if (!p.srID || !ids.has(p.srID)) return false;
	const season = g.get("season");
	if (season < from || season > to) return false;
	if (event === "watches") return true;
	appendFileSync(path.join(output, "market_trace.jsonl"), JSON.stringify({
		event, season, phase: g.get("phase"), days: g.get("daysLeft"),
		id: p.srID, tid: p.tid, priorTid: p.priorContractTid, pid: p.pid,
		ovr: p.ratings.at(-1)?.ovr, value: p.value, injury: p.injury.gamesRemaining,
		contract: p.contract, faDays: p.numDaysFreeAgent, faYears: p.yearsFreeAgent, ...extra,
	}) + "\n");
};
const captured = new Set<number>();
if (output && process.env.R161_CAPTURE === "1") trace.r161CaptureMarket = async context => {
	if (context.phase !== PHASE.FREE_AGENCY || context.season < from || context.season > to || captured.has(context.season)) return;
	captured.add(context.season);
	const { cache } = context;
	const state = {
		season: context.season,
		phase: context.phase,
		daysLeft: g.get("daysLeft"),
		rng: trace.r161ReadRng?.(),
		attributes: await cache.gameAttributes.getAll(),
		players: await cache.players.indexGetAll("playersByTid", [PLAYER.FREE_AGENT, Infinity]),
		teams: await cache.teams.getAll(),
		teamSeasons: await cache.teamSeasons.getAll(),
		releasedPlayers: await cache.releasedPlayers.getAll(),
	};
	writeFileSync(path.join(output, `market_${context.season}.json.gz`), gzipSync(JSON.stringify(state)), { flag: "wx" });
};
