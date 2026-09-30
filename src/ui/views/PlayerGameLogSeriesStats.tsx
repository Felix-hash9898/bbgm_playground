import { useState } from "react";
import { PLAYER_STATS_TABLES } from "../../common/index.ts";
import type { View } from "../../common/types.ts";
import getCols from "../../common/getCols.ts";
import DataTable from "../components/DataTable/index.tsx";
import type { DataTableRow } from "../components/DataTable/index.tsx";
import helpers from "../util/helpers.ts";
import { formatStatGameHigh } from "./formatStatGameHigh.tsx";

const seriesStatTypes = [
	["regular", "Per Game"],
	["per36", "Per 36 Minutes"],
	["totals", "Totals"],
	[
		"shotLocations",
		PLAYER_STATS_TABLES.shotLocations?.name ?? "Shot Locations and Feats",
	],
	["advanced", PLAYER_STATS_TABLES.advanced?.name ?? "Advanced"],
	["gameHighs", PLAYER_STATS_TABLES.gameHighs?.name ?? "Game Highs"],
] as const;

const SeriesStats = ({
	seriesStats,
}: {
	seriesStats: NonNullable<View<"playerGameLog">["seriesStats"]>;
}) => {
	const [statType, setStatType] =
		useState<(typeof seriesStatTypes)[number][0]>("regular");
	const table =
		PLAYER_STATS_TABLES[
			statType === "per36" || statType === "totals" ? "regular" : statType
		]!;
	const cols = getCols([
		"Team",
		"Result",
		...table.stats.map(
			(stat) => `stat:${stat.endsWith("Max") ? stat.slice(0, -3) : stat}`,
		),
	]);
	cols[0]!.title = "Series";
	const superCols = table.superCols
		? helpers.deepCopy(table.superCols)
		: undefined;
	if (superCols?.[0]) {
		superCols[0].colspan -= 2;
	}
	const rows: DataTableRow[] = seriesStats.map((summary) => ({
		key: summary.key,
		data: [
			summary.label,
			summary.record ?? "",
			...table.stats.map((stat) =>
				formatStatGameHigh(summary.stats[statType] ?? {}, stat, statType),
			),
		],
	}));
	return (
		<section className="mb-4">
			<div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
				<h3 className="h5 mb-0">Series Stats</h3>
				<select
					className="form-select form-select-sm w-auto"
					aria-label="Series stat type"
					value={statType}
					onChange={(event) =>
						setStatType(
							event.target.value as (typeof seriesStatTypes)[number][0],
						)
					}
				>
					{seriesStatTypes.map(([key, name]) => (
						<option key={key} value={key}>
							{name}
						</option>
					))}
				</select>
			</div>
			<DataTable
				cols={cols}
				name={`PlayerSeriesStats${statType}`}
				rows={rows}
				superCols={superCols}
				defaultSort="disableSort"
				hideAllControls
				hideMenuToo
				small
			/>
		</section>
	);
};

export default SeriesStats;
