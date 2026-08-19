export type RosterBalancePlayer = {
	pid: number;
	firstName: string;
	lastName: string;
	ratings: {
		pos: string;
		skills: string[];
	};
};

export const BROAD_POSITION_BUCKETS = ["G", "F", "C"] as const;
export const DETAILED_POSITION_BUCKETS = ["PG", "SG", "SF", "PF", "C"] as const;

export const ROSTER_BALANCE_CATEGORIES = [
	{
		key: "ballHandler",
		label: "Ball Handler",
		skills: ["B"],
	},
	{
		key: "shooting",
		label: "Shooting",
		skills: ["3"],
	},
	{
		key: "perimeterDefense",
		label: "Perimeter Defense",
		skills: ["Dp"],
	},
	{
		key: "interiorDefense",
		label: "Interior Defense",
		skills: ["Di"],
	},
	{
		key: "rebounding",
		label: "Rebounding",
		skills: ["R"],
	},
] as const;

type CategoryKey = (typeof ROSTER_BALANCE_CATEGORIES)[number]["key"];

export type RosterBalanceCategory = {
	key: CategoryKey;
	label: string;
	totalMinutes: number;
	players: {
		player: RosterBalancePlayer;
		minutes: number;
		skills: string[];
	}[];
};

export type RosterBalanceSummary = {
	broadPositions: Record<(typeof BROAD_POSITION_BUCKETS)[number], number>;
	detailedPositions: Record<(typeof DETAILED_POSITION_BUCKETS)[number], number>;
	detailedPositionMinutes: Record<
		(typeof DETAILED_POSITION_BUCKETS)[number],
		number
	>;
	categories: RosterBalanceCategory[];
};

const detailedPositionCoverage: Record<
	(typeof DETAILED_POSITION_BUCKETS)[number],
	readonly string[]
> = {
	PG: ["PG", "G"],
	SG: ["SG", "G", "GF"],
	SF: ["SF", "GF", "F"],
	PF: ["PF", "F", "FC"],
	C: ["C", "FC"],
};

const getPosition = (player: RosterBalancePlayer) =>
	typeof player.ratings.pos === "string"
		? player.ratings.pos.toUpperCase()
		: "";

const getMinutes = (
	player: RosterBalancePlayer,
	minutesByPid: Record<number, number>,
) => {
	const minutes = minutesByPid[player.pid];
	return typeof minutes === "number" && Number.isFinite(minutes)
		? Math.max(0, minutes)
		: 0;
};

export const getRosterBalance = ({
	players,
	minutesByPid,
}: {
	players: RosterBalancePlayer[];
	minutesByPid: Record<number, number>;
}): RosterBalanceSummary => {
	const broadPositions = {
		G: 0,
		F: 0,
		C: 0,
	};
	const detailedPositions = {
		PG: 0,
		SG: 0,
		SF: 0,
		PF: 0,
		C: 0,
	};
	const detailedPositionMinutes = {
		PG: 0,
		SG: 0,
		SF: 0,
		PF: 0,
		C: 0,
	};
	const categories: RosterBalanceCategory[] = ROSTER_BALANCE_CATEGORIES.map(
		(category) => ({
			key: category.key,
			label: category.label,
			totalMinutes: 0,
			players: [],
		}),
	);

	for (const player of players) {
		const position = getPosition(player);
		if (position.includes("G")) {
			broadPositions.G += 1;
		}
		if (position.includes("F")) {
			broadPositions.F += 1;
		}
		if (position.includes("C")) {
			broadPositions.C += 1;
		}

		const minutes = getMinutes(player, minutesByPid);
		for (const bucket of DETAILED_POSITION_BUCKETS) {
			if (detailedPositionCoverage[bucket].includes(position)) {
				detailedPositions[bucket] += 1;
				detailedPositionMinutes[bucket] += minutes;
			}
		}

		const skills = new Set(player.ratings.skills);
		for (const [i, category] of ROSTER_BALANCE_CATEGORIES.entries()) {
			const matchingSkills = category.skills.filter((skill) =>
				skills.has(skill),
			);
			if (matchingSkills.length === 0) {
				continue;
			}

			const categorySummary = categories[i]!;
			categorySummary.totalMinutes += minutes;
			categorySummary.players.push({
				player,
				minutes,
				skills: matchingSkills,
			});
		}
	}

	return {
		broadPositions,
		detailedPositions,
		detailedPositionMinutes,
		categories,
	};
};
