import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { LinePath } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import { Fragment, type MouseEvent } from "react";
import Select from "react-select";
import getCols from "../../../common/getCols.ts";
import type { View } from "../../../common/types.ts";
import type { Col, DataTableRow } from "../../components/DataTable/index.tsx";
import { DataTable } from "../../components/index.tsx";
import useDropdownOptions from "../../hooks/useDropdownOptions.tsx";
import useTitleBar from "../../hooks/useTitleBar.tsx";
import { helpers } from "../../util/index.ts";
import realtimeUpdate from "../../util/realtimeUpdate.ts";
import { ReferenceLine } from "../Message/OwnerMoodsChart.tsx";

const CHART_HEIGHT = 360;
const WINDOW_SIZE_OPTIONS = [1, 3, 5, 7, 10, 14, 20];
const MIN_MINUTES_OPTIONS = [0, 5, 10, 15, 20, 25, 30];
const METRIC_LABEL_OVERRIDES: Record<string, string> = {
	fgAtRim: "At Rim FG",
	fgaAtRim: "At Rim FGA",
	fgpAtRim: "At Rim FG%",
	fgLowPost: "Low Post FG",
	fgaLowPost: "Low Post FGA",
	fgpLowPost: "Low Post FG%",
	fgMidRange: "Mid-Range FG",
	fgaMidRange: "Mid-Range FGA",
	fgpMidRange: "Mid-Range FG%",
	gmsc: "GmSc",
	tsp: "TS%",
};

const roundMetric = (value: number | undefined) =>
	value === undefined ? null : Math.round(value * 100) / 100;

const getMetricLabel = (metric: string) => {
	if (METRIC_LABEL_OVERRIDES[metric]) {
		return METRIC_LABEL_OVERRIDES[metric];
	}

	return String(getCols([`stat:${metric}`])[0]?.title ?? metric);
};

const getDomain = (games: View<"statsVisualization">["games"]) => {
	const values = games
		.map((game) => game.displayValue)
		.filter((value): value is number => Number.isFinite(value));

	if (values.length === 0) {
		return [-1, 1] as const;
	}

	let min = Math.min(...values);
	let max = Math.max(...values);

	min = Math.min(min, 0);
	max = Math.max(max, 0);

	if (min === max) {
		min -= 1;
		max += 1;
	}

	const padding = (max - min) * 0.1;
	return [min - padding, max + padding] as const;
};

const Chart = ({
	games,
	metricLabel,
}: {
	games: View<"statsVisualization">["games"];
	metricLabel: string;
}) => {
	const margin = {
		bottom: 35,
		left: 50,
		right: 20,
		top: 15,
	};

	const {
		hideTooltip,
		showTooltip,
		tooltipData,
		tooltipLeft,
		tooltipOpen,
		tooltipTop,
	} = useTooltip<(typeof games)[number]>();

	const handleMouseOver = (
		event: MouseEvent,
		datum: (typeof games)[number],
	) => {
		const coords = localPoint((event.target as any).ownerSVGElement, event);
		if (coords) {
			showTooltip({
				tooltipData: datum,
				tooltipLeft: coords.x,
				tooltipTop: coords.y,
			});
		}
	};

	const color = "var(--bs-blue)";
	const [domainMin, domainMax] = getDomain(games);

	return (
		<div className="position-relative">
			<ParentSize parentSizeStyles={{ minHeight: CHART_HEIGHT + 70 }}>
				{(parent) => {
					const width = parent.width - margin.left - margin.right;
					const xScale = scaleLinear({
						domain: [1, Math.max(games.length, 1)],
						range: [0, width],
					});
					const yScale = scaleLinear({
						domain: [domainMin, domainMax],
						range: [CHART_HEIGHT, 0],
					});

					return (
						<svg
							width={parent.width}
							height={CHART_HEIGHT + margin.top + margin.bottom}
						>
							<Group transform={`translate(${margin.left},${margin.top})`}>
								{domainMin <= 0 && domainMax >= 0 ? (
									<ReferenceLine
										x={xScale.range() as [number, number]}
										y={[yScale(0), yScale(0)]}
										color="var(--bs-secondary)"
									/>
								) : null}
								<AxisLeft
									axisClassName="chart-axis"
									label={metricLabel}
									labelOffset={36}
									labelProps={{ textAnchor: "middle" }}
									numTicks={7}
									scale={yScale}
									tickLength={5}
								/>
								<AxisBottom
									axisClassName="chart-axis"
									label="Eligible Game Number"
									labelProps={{ textAnchor: "middle" }}
									numTicks={Math.min(10, games.length || 1)}
									scale={xScale}
									tickLength={5}
									top={CHART_HEIGHT}
								/>
								<Fragment>
									<LinePath<(typeof games)[number]>
										className="chart-line"
										data={games}
										stroke={color}
										strokeWidth={3}
										x={(d) => xScale(d.num)}
										y={(d) => yScale(d.displayValue ?? 0)}
									/>
									{games.map((game) => (
										<circle
											key={game.gid}
											cx={xScale(game.num)}
											cy={yScale(game.displayValue ?? 0)}
											fill="var(--bs-body-bg)"
											r={4}
											stroke={color}
											strokeWidth={2}
											onMouseOut={hideTooltip}
											onMouseOver={(event) => handleMouseOver(event, game)}
										/>
									))}
								</Fragment>
							</Group>
						</svg>
					);
				}}
			</ParentSize>

			{tooltipOpen && tooltipData ? (
				<TooltipWithBounds left={tooltipLeft} top={tooltipTop}>
					Game {tooltipData.num}
					<br />
					{tooltipData.away ? "@" : "vs "} {tooltipData.oppAbbrev}
					{tooltipData.playoffs ? " (Playoffs)" : null}
					<br />
					{tooltipData.result}
					<br />
					{metricLabel}: {roundMetric(tooltipData.displayValue)}
					{tooltipData.windowSize > 1
						? ` (${tooltipData.windowSize}-game)`
						: ""}
					<br />
					Raw: {roundMetric(tooltipData.rawValue)}
				</TooltipWithBounds>
			) : null}
		</div>
	);
};

const StatsVisualization = ({
	games,
	infoMessage,
	metric,
	metricOptions,
	minMinutes,
	pid,
	player,
	playerOptions,
	season,
	windowSize,
}: View<"statsVisualization">) => {
	useTitleBar({
		title: "Stats Visualization",
		dropdownView: "stats_visualization",
	});

	const seasons = useDropdownOptions("seasons");
	const selectedPlayerOption =
		playerOptions.find((option) => option.pid === pid) ?? null;
	const metricLabel = getMetricLabel(metric);
	const rollingLabel =
		windowSize > 1 ? `${windowSize}-Game ${metricLabel}` : metricLabel;

	const updateUrl = async (
		toUpdate: {
			metric?: string;
			minMinutes?: number;
			pid?: number;
			season?: number;
			windowSize?: number;
		} = {},
	) => {
		const nextMetric = toUpdate.metric ?? metric;
		const nextMinMinutes = toUpdate.minMinutes ?? minMinutes;
		const nextPid = toUpdate.pid ?? pid;
		const nextSeason = toUpdate.season ?? season;
		const nextWindowSize = toUpdate.windowSize ?? windowSize;
		const parts: (number | string)[] = [
			"stats_visualization",
			nextSeason,
			nextPid ?? "0",
			nextMetric,
			nextWindowSize,
			nextMinMinutes,
		];
		const url = helpers.leagueUrl(parts);

		await realtimeUpdate([], url, undefined, true);
	};

	const expectedSuffix = `/stats_visualization/${season}/${pid ?? 0}/${metric}/${windowSize}/${minMinutes}`;
	if (
		location.pathname.includes("/stats_visualization") &&
		!location.pathname.endsWith(expectedSuffix)
	) {
		updateUrl();
	}

	const rows: DataTableRow[] = games.map((game) => ({
		key: game.gid,
		data: [
			game.num,
			`${game.away ? "@" : "vs "} ${game.oppAbbrev}${game.playoffs ? " (P)" : ""}`,
			game.result,
			helpers.roundStat(game.min, "min"),
			roundMetric(game.rawValue),
			roundMetric(game.displayValue),
		],
	}));

	const tableCols: Col[] = [
		{
			desc: "Sequential eligible game number",
			sortSequence: ["asc", "desc"],
			title: "#",
		},
		{ title: "Opponent" },
		{ title: "Result" },
		{ title: "Min" },
		{ title: metricLabel },
		{ title: rollingLabel },
	];

	return (
		<>
			<div className="d-flex gap-3 align-items-end flex-wrap mb-3">
				<div>
					<label className="form-label mb-1">Season</label>
					<select
						className="form-select"
						onChange={(event) =>
							updateUrl({ season: Number.parseInt(event.target.value) })
						}
						value={season}
					>
						{seasons.map((option) => (
							<option key={option.key} value={option.key}>
								{Array.isArray(option.value)
									? option.value.at(-1)?.text
									: option.value}
							</option>
						))}
					</select>
				</div>
				<div style={{ minWidth: 320 }}>
					<label className="form-label mb-1">Player</label>
					<Select
						classNamePrefix="dark-select"
						isClearable={false}
						isDisabled={playerOptions.length === 0}
						noOptionsMessage={() => "No players"}
						onChange={(option) => {
							if (option) {
								updateUrl({ pid: option.pid });
							}
						}}
						options={playerOptions}
						placeholder="Search player..."
						value={selectedPlayerOption}
					/>
				</div>
				<div>
					<label className="form-label mb-1">Metric</label>
					<select
						className="form-select"
						onChange={(event) => updateUrl({ metric: event.target.value })}
						value={metric}
					>
						{metricOptions.map((option) => (
							<option key={option} value={option}>
								{getMetricLabel(option)}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="form-label mb-1">Rolling Window</label>
					<select
						className="form-select"
						onChange={(event) =>
							updateUrl({ windowSize: Number.parseInt(event.target.value) })
						}
						value={windowSize}
					>
						{WINDOW_SIZE_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{option} game{option === 1 ? "" : "s"}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className="form-label mb-1">Min Minutes Filter</label>
					<select
						className="form-select"
						onChange={(event) =>
							updateUrl({ minMinutes: Number.parseInt(event.target.value) })
						}
						value={minMinutes}
					>
						{MIN_MINUTES_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{option === 0 ? "Off" : `${option}+ min`}
							</option>
						))}
					</select>
				</div>
			</div>

			{infoMessage ? (
				<div className="alert alert-info d-inline-block">{infoMessage}</div>
			) : (
				<>
					<p className="mb-3">
						<b>{player?.name}</b> in {season}. Showing {games.length} games with
						at least {minMinutes} minutes. Chart metric: <b>{rollingLabel}</b>.
						Setting the rolling window to <b>1 game</b> shows the single-game
						values directly.
					</p>

					<Chart games={games} metricLabel={rollingLabel} />

					<p className="text-body-secondary mt-3">
						Rolling values are computed from the combined box scores inside each
						window. That means rolling percentages such as FG%, 3P%, FT%, eFG%,
						and TS% reflect the actual window totals rather than a simple
						average of single-game percentages.
					</p>

					<DataTable
						className="mb-3"
						cols={tableCols}
						defaultSort={[0, "asc"]}
						defaultStickyCols={1}
						hideAllControls
						name="StatsVisualization"
						rows={rows}
					/>
				</>
			)}
		</>
	);
};

export default StatsVisualization;
