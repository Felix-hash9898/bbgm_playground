import RatingsStatsBaseball from "./RatingsStats.baseball.tsx";
import RatingsStatsBasketball from "./RatingsStats.basketball.tsx";
import RatingsStatsFootball from "./RatingsStats.football.tsx";
import RatingsStatsHockey from "./RatingsStats.hockey.tsx";
import { useLocal } from "../../util/index.ts";
import { bySport } from "../../../common/index.ts";

const RatingsStats = (props: {
	ratings: any;
	stats: any;
	type?: "career" | "current" | "draft" | number;
	emptyPlayoffStats?: boolean;
}) => {
	const challengeNoRatings = useLocal((state) => state.challengeNoRatings);
	const { emptyPlayoffStats, ...ratingsStatsProps } = props;

	return bySport({
		baseball: RatingsStatsBaseball({
			...ratingsStatsProps,
			challengeNoRatings,
		}),
		basketball: RatingsStatsBasketball({
			...ratingsStatsProps,
			challengeNoRatings,
			emptyPlayoffStats,
		}),
		football: RatingsStatsFootball({
			...ratingsStatsProps,
			challengeNoRatings,
		}),
		hockey: RatingsStatsHockey({
			...ratingsStatsProps,
			challengeNoRatings,
		}),
	});
};

export default RatingsStats;
