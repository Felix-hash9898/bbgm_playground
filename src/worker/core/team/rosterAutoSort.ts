import { bySport } from "../../../common/index.ts";
import rosterAutoSortBaseball from "./rosterAutoSort.baseball.ts";
import rosterAutoSortBasketball from "./rosterAutoSort.basketball.ts";
import rosterAutoSortFootball from "./rosterAutoSort.football.ts";
import rosterAutoSortHockey from "./rosterAutoSort.hockey.ts";
import {
	captureLeagueContext,
	type CapturedLeagueContext,
} from "../capturedContext.ts";

const rosterAutoSort = async (
	tid: number,
	onlyNewPlayers?: boolean,
	pos?: string,
	context: CapturedLeagueContext = captureLeagueContext(),
) => {
	await bySport<any>({
		baseball: rosterAutoSortBaseball,
		basketball: rosterAutoSortBasketball,
		football: rosterAutoSortFootball,
		hockey: rosterAutoSortHockey,
	})(tid, onlyNewPlayers, pos as any, context);
};

export default rosterAutoSort;
