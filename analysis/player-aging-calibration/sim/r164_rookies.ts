import type { Player } from "../../../src/common/types.ts";
import type { BasketballMinutesPlayer } from "../../../src/worker/core/team/basketballMinutes.ts";

// R16.3 adaptive trial without hidden state. Every decision is recomputed from the roster and the season's own
// saved box rows, so it survives reloads, trades, injuries and several young players competing on one team.
type Club = { tid: number; strategy?: string };
type Settings = { season: number; potFallback?: (ovr: number, age: number) => number };
export type YoungDecision = { tid: number; pid: number; donor: number; minutes: number; phase: "trial" | "earned" | "late look";
	kind: "rebuilding" | "contending"; observed: number; difference: number; gap: number };

const RULES = {
	// A drafted player first gets an audition (minutes), then keeps the place while the shrunk production difference per
	// 36 minutes against the veteran stays above "keep". Clubs invest more in first-round picks, and rebuilding clubs
	// more than contenders; nobody who is far behind the veteran (reach) or clearly worse on the floor keeps a place.
	// Stage 1 auditioned almost every first-round pick but at five or six minutes a night; the NBA gives 12-18.
	rebuilding: { slots: 3, distance: .44, floor: 5,
		first: { audition: 700, reach: 14, keep: -2.5, transfer: 11, cap: 18 }, second: { audition: 200, reach: 11, keep: -.6, transfer: 8, cap: 13 } },
	contending: { slots: 2, distance: .40, floor: 5,
		first: { audition: 450, reach: 11, keep: -1, transfer: 9, cap: 16 }, second: { audition: 110, reach: 7, keep: 0, transfer: 6, cap: 13 } },
} as const;

function rate(p: Player, season: number) {
	let min = 0, events = 0;
	for (const s of p.stats) {
		if (s.season !== season || s.playoffs) continue;
		min += s.min;
		events += s.pts - s.fga - .44 * s.fta + .7 * s.orb + .3 * s.drb + .7 * s.ast + s.stl + .7 * s.blk - s.tov;
	}
	return { min, events };
}

const careerMinutes = (p: Player, season: number) => p.stats.reduce((sum, s) =>
	sum + (!s.playoffs && s.season < season ? s.min : 0), 0);

export function roleDistance(a: BasketballMinutesPlayer, b: BasketballMinutesPlayer) {
	if (!a.roleScores || !b.roleScores) return Infinity;
	let distance = 0;
	for (const key of ["handler", "interior", "wing"] as const) {
		distance += Math.abs((a.roleScores[key] ?? 0) - (b.roleScores[key] ?? 0));
	}
	// Do not replace the only other true big or lead handler to create minutes.
	const family = (p: string | undefined) => p === "C" || p === "FC" ? "big" : p === "PG" || p === "G" ? "handler" : "wing";
	return distance + Number(family(a.position) !== family(b.position)) * .16;
}

/** Mutates the already legal minutes plan. The total never changes. */
export function planYoungMinutes(club: Club, players: Player[], profiles: BasketballMinutesPlayer[], playable: boolean[],
	minutes: Record<number, number>, record: { won: number; lost: number; tied?: number; otl?: number }, { season, potFallback }: Settings) {
	const kind = club.strategy === "rebuilding" ? "rebuilding" : "contending";
	const rule = RULES[kind];
	const profile = new Map(profiles.map(p => [p.pid, p]));
	const available = players.filter((p, i) => playable[i] && p.injury.gamesRemaining === 0);
	const teamGames = record.won + record.lost + (record.tied ?? 0) + (record.otl ?? 0);
	// Teams out of the race give young players another look after two thirds of the season.
	const lateLook = kind === "rebuilding" && teamGames >= 55;
	const options = [];
	for (const p of available) {
		const experience = season - p.draft.year;
		const age = season - p.born.year;
		const r = p.ratings.at(-1)!;
		const pot = potFallback ? Math.max(r.pot, potFallback(r.ovr, age)) : r.pot;
		const upside = pot - r.ovr;
		const firstRound = p.draft.round === 1;
		const terms = firstRound ? rule.first : rule.second;
		if (p.draft.round < 1 || age > 25 || (minutes[p.pid] ?? 0) >= terms.cap - 1) continue;
		// First season, or an early career that has not really started yet.
		if (experience !== 1 && !((experience === 2 || experience === 3) && age <= 24 && careerMinutes(p, season) < 700 * (experience - 1))) continue;
		if (upside < 2 && !firstRound && r.ovr < 48) continue;
		const own = rate(p, season);
		const auditioning = own.min < terms.audition;
		for (const q of available) {
			if (season - q.draft.year <= 3 || q.rosterOrder < rule.floor || q.rosterOrder > 10 || (minutes[q.pid] ?? 0) < 8) continue;
			const gap = q.valueNoPot - p.valueNoPot;
			if (gap > terms.reach || gap < -3) continue;
			const distance = roleDistance(profile.get(p.pid)!, profile.get(q.pid)!);
			if (distance > rule.distance) continue;
			const other = rate(q, season);
			const difference = own.min > 0 && other.min > 0 ?
				36 * (own.events / own.min - other.events / other.min) * own.min / (own.min + 120) : 0;
			if (!auditioning && (other.min < 50 || difference < terms.keep - (lateLook ? .6 : 0))) continue;
			const pedigree = firstRound ? 1.5 + Math.max(0, 15 - p.draft.pick) * .1 : 0;
			const score = Math.min(4, Math.max(0, upside) * .22) + pedigree - gap - distance * 5 + (auditioning ? 0 : difference);
			options.push({ p, q, terms, gap, difference, observed: own.min, score,
				phase: auditioning ? "trial" as const : difference >= terms.keep ? "earned" as const : "late look" as const });
		}
	}
	options.sort((a, b) => b.score - a.score || a.p.pid - b.p.pid || a.q.pid - b.q.pid);
	const used = new Set<number>();
	const decisions: YoungDecision[] = [];
	for (const { p, q, terms, gap, difference, observed, phase } of options) {
		if (decisions.length >= rule.slots) break;
		if (used.has(p.pid) || used.has(q.pid)) continue;
		const transfer = Math.min(terms.transfer, terms.cap - (minutes[p.pid] ?? 0), minutes[q.pid]! - 5);
		if (!(transfer >= 2)) continue;
		minutes[p.pid] = (minutes[p.pid] ?? 0) + transfer;
		minutes[q.pid]! -= transfer;
		used.add(p.pid).add(q.pid);
		decisions.push({ tid: club.tid, pid: p.pid, donor: q.pid, minutes: transfer, phase, kind, observed, difference, gap });
	}
	return decisions;
}
