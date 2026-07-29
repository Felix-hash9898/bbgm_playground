import type { View } from "../../../common/types.ts";
import { ChampionshipBanner } from "../../components/ChampionshipBanner.tsx";

export const Championships = ({
	history,
}: Pick<View<"teamHistory">, "history">) => {
	const championshipRows = history.filter(
		(row) => row.playoffRoundsWon === row.numPlayoffRounds,
	);

	if (championshipRows.length === 0) {
		return <p>None</p>;
	}

	return (
		<div className="d-flex flex-wrap gap-2 mb-3">
			{championshipRows.map((row) => (
				<ChampionshipBanner
					key={row.season}
					hideRope
					hideText
					season={row.season}
					style={{ width: 90 }}
					t={{
						colors: row.colors,
						imgURL: row.imgURL,
						imgURLSmall: row.imgURLSmall,
					}}
				/>
			))}
		</div>
	);
};
