import value from "./value.ts";
import type {
	GameAttributesLeague,
	MinimalPlayerRatings,
	Player,
	PlayerWithoutKey,
} from "../../../common/types.ts";
import { g, local } from "../../util/index.ts";
import updateOvrMeanStd from "./updateOvrMeanStd.ts";
import type Cache from "../../db/Cache.ts";
import { idb } from "../../db/index.ts";

type UpdateValuesOptions = {
	captured?: boolean;
	ovrMeanStd?: Parameters<typeof updateOvrMeanStd>[1];
	repeatSeason?: GameAttributesLeague["repeatSeason"];
	season?: number;
};

const updateValues = async (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
	cache: Cache = idb.cache,
	options?: UpdateValuesOptions,
) => {
	const ovrMeanStd = options?.ovrMeanStd ?? local;
	await updateOvrMeanStd(cache, ovrMeanStd);
	const repeatSeason = options?.captured
		? options.repeatSeason
		: Object.hasOwn(g, "repeatSeason")
			? g.get("repeatSeason")
			: undefined;

	p.valueNoPot = value(p, {
		ovrMean: ovrMeanStd.playerOvrMean,
		ovrStd: ovrMeanStd.playerOvrStd,
		noPot: true,
		season: options?.captured ? options.season : undefined,
	});
	p.valueNoPotFuzz = value(p, {
		ovrMean: ovrMeanStd.playerOvrMean,
		ovrStd: ovrMeanStd.playerOvrStd,
		noPot: true,
		fuzz: true,
		season: options?.captured ? options.season : undefined,
	});

	// If we're repeating the season, potential and age don't matter. But for the one that resets rosters every year, pretend they do, cause it's fun to consider what trades might be possible and then have them reset. Eventually this should be an option.
	if (repeatSeason?.type === "players") {
		p.value = p.valueNoPot;
		p.valueFuzz = p.valueNoPotFuzz;
	} else {
		p.value = value(p, {
			ovrMean: ovrMeanStd.playerOvrMean,
			ovrStd: ovrMeanStd.playerOvrStd,
			season: options?.captured ? options.season : undefined,
		});
		p.valueFuzz = value(p, {
			ovrMean: ovrMeanStd.playerOvrMean,
			ovrStd: ovrMeanStd.playerOvrStd,
			fuzz: true,
			season: options?.captured ? options.season : undefined,
		});
	}
};

export default updateValues;
