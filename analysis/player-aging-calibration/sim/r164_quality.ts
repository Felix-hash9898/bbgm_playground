type Ratings = {
	hgt: number;
	spd: number;
	diq: number;
	oiq: number;
	pss: number;
	drb: number;
};

type Prospect = {
	born: { year: number };
	draft: { year: number };
	ratings: Ratings[];
};

type Peer = {
	rating: Ratings;
	creation: number;
	defense: number;
};

/** Re-pair two existing defensive ratings within draft age and body type. No random draws. */
export function alignGeneratedDefense(players: Prospect[]) {
	const groups = new Map<string, Peer[]>();
	for (const player of players) {
		const rating = player.ratings.at(-1)!;
		const age = player.draft.year - player.born.year;
		const heightBand = rating.hgt <= 33 ? 0 : rating.hgt <= 58 ? 1 : 2;
		const key = `${age}/${heightBand}`;
		const peers = groups.get(key) ?? [];
		peers.push({
			rating,
			creation: 10 * rating.oiq + 7 * rating.pss + 3 * rating.drb,
			defense: 2 * rating.diq + rating.spd,
		});
		groups.set(key, peers);
	}

	let pairs = 0;
	let alignmentGain = 0;
	for (const peers of groups.values()) {
		const limit = Math.floor(peers.length / 4);
		if (limit === 0) {
			continue;
		}
		const options: { first: Peer; second: Peer; gain: number }[] = [];
		for (const [index, first] of peers.entries()) {
			for (const second of peers.slice(index + 1)) {
				const speed = first.rating.spd - second.rating.spd;
				const iq = first.rating.diq - second.rating.diq;
				const gain = (second.creation - first.creation) * (first.defense - second.defense);
				if (gain > 0 && Math.abs(speed) <= 12 && Math.abs(iq) <= 12 && Math.abs(.123 * speed + .159 * iq) <= 2.25) {
					options.push({ first, second, gain });
				}
			}
		}
		options.sort((a, b) => b.gain - a.gain);
		const used = new Set<Peer>();
		for (const { first, second, gain } of options) {
			if (used.has(first) || used.has(second)) {
				continue;
			}
			[first.rating.spd, second.rating.spd] = [second.rating.spd, first.rating.spd];
			[first.rating.diq, second.rating.diq] = [second.rating.diq, first.rating.diq];
			used.add(first);
			used.add(second);
			alignmentGain += gain;
			pairs += 1;
			if (used.size === limit * 2) {
				break;
			}
		}
	}
	return { pairs, alignmentGain };
}
