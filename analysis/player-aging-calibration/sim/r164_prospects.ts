import limitRating from "../../../src/worker/core/player/limitRating.ts";

// Generated draft classes only (classes with real prospects are untouched). Two parameters:
// DECLARE: share of the remaining prospects that declares each year from the first to the last draft age. The product
//   value .5 gives a mean draft age of 19.75; NBA draftees 2008-22 are 21.2 (best 15) to 22.0 (all).
// READY: points added to the trainable skills of a class once, when it is created. Height and body are untouched.
export const DECLARE = .2;
export const READY = 1;
const TRAINED = ["ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb", "stre", "endu"] as const;

export const readyClass = async (players: any[], refresh: (p: any) => Promise<unknown>, points = READY) => {
	if (!points) return;
	for (const p of players) {
		const r = p.ratings.at(-1);
		for (const key of TRAINED) r[key] = limitRating(r[key] + points);
		await refresh(p);
	}
};
