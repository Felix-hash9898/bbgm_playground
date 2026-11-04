import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { PHASE } from "../../common/index.ts";
import helpers from "../util/helpers.ts";
import realtimeUpdate from "../util/realtimeUpdate.ts";
import runPlayMenuAction, {
	reportPlayError,
} from "../util/runPlayMenuAction.ts";
import { useLocalPartial } from "../util/local.ts";

const NextButton = ({
	abbrev,
	boxScore,
	currentGidInList,
	nextGid,
	tid,
}: {
	abbrev?: string;
	boxScore: any;
	currentGidInList?: boolean;
	nextGid?: number;
	tid?: number;
}) => {
	const [autoGoToNext, setAutoGoToNext] = useState(false);
	const [clickedGoToNext, setClickedGoToNext] = useState(false);

	const simNext = useCallback(async () => {
		setClickedGoToNext(true);
		const succeeded = await runPlayMenuAction("day");
		if (succeeded) {
			setAutoGoToNext(true);
		} else {
			setAutoGoToNext(false);
			setClickedGoToNext(false);
		}
	}, []);

	useEffect(() => {
		if (autoGoToNext && nextGid !== undefined) {
			setAutoGoToNext(false);
			// The play request has finished its gameSim refresh before navigating.
			void realtimeUpdate(
				[],
				helpers.leagueUrl([
					"game_log",
					`${abbrev}_${tid}`,
					boxScore.season,
					nextGid,
				]),
			)
				.catch(reportPlayError)
				.finally(() => setClickedGoToNext(false));
		} else if (autoGoToNext) {
			// No next game (for example the season ended). Do not leave Sim Next busy.
			setAutoGoToNext(false);
			setClickedGoToNext(false);
		}
	}, [abbrev, autoGoToNext, boxScore.season, nextGid, tid]);

	const { phase, playMenuOptions, season } = useLocalPartial([
		"phase",
		"playMenuOptions",
		"season",
	]);

	const canPlay = playMenuOptions.some(
		(option) => option.id === "day" || option.id === "week",
	);

	return (
		<div className="ms-4">
			{boxScore.season === season &&
			currentGidInList &&
			(nextGid === undefined || clickedGoToNext || autoGoToNext) &&
			phase >= PHASE.REGULAR_SEASON &&
			phase <= PHASE.PLAYOFFS ? (
				<button
					className="btn btn-light-bordered"
					disabled={!canPlay || clickedGoToNext}
					onClick={simNext}
				>
					Sim
					<br />
					Next
				</button>
			) : (
				<a
					className={clsx("btn", "btn-light-bordered", {
						disabled: nextGid === undefined,
					})}
					href={helpers.leagueUrl([
						"game_log",
						abbrev === "special" ? abbrev : `${abbrev}_${tid}`,
						boxScore.season,
						nextGid,
					])}
				>
					Next
				</a>
			)}
		</div>
	);
};

export default NextButton;
