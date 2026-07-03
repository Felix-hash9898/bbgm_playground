import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

export const PHASE = {
	PLAYOFFS: 3,
};

export const OPTION_VALUE_RATE = 0.1;

const AWARD_NAMES = {
	mvp: "Most Valuable Player",
	dpoy: "Defensive Player of the Year",
};

export const COMPOSITE_KEYS = [
	"usage",
	"dribbling",
	"passing",
	"turnovers",
	"shootingThreePointer",
	"shootingAtRim",
	"shootingLowPost",
	"rebounding",
	"offensiveRebounding",
	"defensiveRebounding",
	"defense",
	"defenseInterior",
	"defensePerimeter",
	"blocking",
	"athleticism",
];

export const SKILL_KEYS = [
	"usage",
	"dribbling",
	"passing",
	"shootingLowPost",
	"shootingThreePointer",
	"rebounding",
	"defenseInterior",
	"defensePerimeter",
	"athleticism",
];

export const TARGET_TIER_SCORE = {
	MINIMUM_LEVEL: 1,
	VETERAN_MINIMUM_LEVEL: 1,
	VETERAN_MINIMUM_PLUS: 2,
	LOW_ROTATION_PLUS: 3,
	SPECIALIST_ROTATION: 4,
	YOUNG_UPSIDE_SUSPECT: 4,
	VETERAN_ROTATION_GUARD: 5,
	LOW_END_STARTER: 6,
	LOW_END_STARTER_GUARD_LENGTH_RISK: 6,
	YOUNG_PROVEN_STARTER: 7,
	STAR_NEAR_MAX: 8,
	SUPERSTAR_MAX: 9,
};

export const pct = (value) =>
	Number.isFinite(value) ? `${(100 * value).toFixed(1)}%` : "";

export const money = (amount) =>
	Number.isFinite(amount) ? `$${(amount / 1000).toFixed(2)}M` : "";

export const round = (value, digits = 2) =>
	Number.isFinite(value) ? Number(value.toFixed(digits)) : "";

export const bound = (x, min, max) => Math.max(min, Math.min(max, x));

export const readSave = (savePath) =>
	JSON.parse(zlib.gunzipSync(fs.readFileSync(savePath), "utf8"));

export const readJsonIfExists = (jsonPath, fallback) =>
	fs.existsSync(jsonPath)
		? JSON.parse(fs.readFileSync(jsonPath, "utf8"))
		: fallback;

export const targetsByPid = (targets) =>
	Object.fromEntries(targets.map((target) => [target.pid, target]));

export const roundContract = (amount, minContract) => {
	if (amount === minContract) {
		return minContract;
	}

	if (minContract >= 3) {
		const numDigits = Math.floor(Math.log10(minContract / 3));
		const roundAmount = 10 ** (numDigits - 1);
		return roundAmount * Math.round(amount / roundAmount);
	}

	return Math.round(amount);
};

export const getContractLength = (contract, attrs) => {
	const offset = attrs.phase <= PHASE.PLAYOFFS ? 1 : 0;
	return contract.exp - attrs.season + offset;
};

export const getOptionValue = (amount, attrs) =>
	roundContract(amount * OPTION_VALUE_RATE, attrs.minContract);

export const getEffectiveOfferAmount = (amount, option, attrs) => {
	if (option === "player") {
		return amount + getOptionValue(amount, attrs);
	}
	if (option === "team") {
		return amount - getOptionValue(amount, attrs);
	}
	return amount;
};

export const getRealAmountForEffectiveOffer = (effectiveAmount, option, attrs) => {
	if (option === "player") {
		return roundContract(effectiveAmount / (1 + OPTION_VALUE_RATE), attrs.minContract);
	}
	if (option === "team") {
		return roundContract(effectiveAmount / (1 - OPTION_VALUE_RATE), attrs.minContract);
	}
	return roundContract(effectiveAmount, attrs.minContract);
};

export const getNormalNoOptionContract = (contract, attrs) => {
	if (!contract) {
		return {};
	}

	return {
		amount: getEffectiveOfferAmount(contract.amount, contract.option, attrs),
		years: getContractLength(contract, attrs),
	};
};

export const loadCompositeWeights = (root) => {
	const sourcePath = path.join(root, "src/common/constants.basketball.ts");
	const source = fs.readFileSync(sourcePath, "utf8");
	const start = source.indexOf("const COMPOSITE_WEIGHTS");
	if (start < 0) {
		throw new Error(`Could not find COMPOSITE_WEIGHTS in ${sourcePath}`);
	}

	const objectStart = source.indexOf("{", start);
	let depth = 0;
	let objectEnd = -1;
	for (let i = objectStart; i < source.length; i++) {
		const char = source[i];
		if (char === "{") {
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				objectEnd = i + 1;
				break;
			}
		}
	}

	if (objectEnd < 0) {
		throw new Error(`Could not parse COMPOSITE_WEIGHTS in ${sourcePath}`);
	}

	return vm.runInNewContext(`(${source.slice(objectStart, objectEnd)})`);
};

export const fuzzRating = (rating, fuzz) => Math.round(bound(rating + fuzz, 0, 100));

export const compositeRating = (ratings, components, weights, fuzz = false) => {
	const actualWeights = weights ?? Array(components.length).fill(1);
	let numerator = 0;
	let denominator = 0;

	for (const [i, component] of components.entries()) {
		let factor;
		if (typeof component === "number") {
			factor = component;
		} else {
			const rating = ratings[component];
			if (rating === undefined) {
				throw new Error(`Undefined rating component "${component}"`);
			}
			factor = fuzz && component !== "hgt" ? fuzzRating(rating, ratings.fuzz) : rating;
		}

		numerator += factor * actualWeights[i];
		denominator += 100 * actualWeights[i];
	}

	return bound(numerator / denominator, 0, 1);
};

export const generatedSkills = (ratings, compositeWeights) => {
	const skills = [];
	for (const key of Object.keys(compositeWeights)) {
		const entry = compositeWeights[key];
		if (
			entry?.skill &&
			compositeRating(ratings, entry.ratings, entry.weights, true) >
				entry.skill.cutoff
		) {
			skills.push(entry.skill.label);
		}
	}
	return skills.sort();
};

export const valueCombineOvrPot = (current, potential, age) => {
	if (age <= 19) return 0.7 * potential + 0.3 * current;
	if (age <= 20) return 0.65 * potential + 0.35 * current;
	if (age <= 21) return 0.6 * potential + 0.4 * current;
	if (age <= 22) return 0.6 * potential + 0.4 * current;
	if (age <= 23) return 0.55 * potential + 0.45 * current;
	if (age <= 24) return 0.45 * potential + 0.55 * current;
	if (age <= 25) return 0.3 * potential + 0.7 * current;
	if (age <= 26) return 0.15 * potential + 0.85 * current;
	if (age <= 27) return 0.025 * potential + 0.95 * current;
	if (age <= 28) return 0.95 * current;
	if (age <= 29) return 0.94 * current;
	if (age <= 30) return 0.93 * current;
	if (age <= 33) return 0.92 * current;
	if (age <= 38) return 0.91 * current;
	return 0.9 * current;
};

export const playerValue = (p, { noPot = false, ovrMean, ovrStd, season }) => {
	const ratings = p.ratings.at(-1);
	let { ovr, pot } = ratings;

	if (ovrStd > 0) {
		ovr = ((ovr - ovrMean) / ovrStd) * 10 + 47;
		pot = ((pot - ovrMean) / ovrStd) * 10 + 47;
	} else {
		ovr = ovr - ovrMean + 47;
		pot = pot - ovrMean + 47;
	}

	const slope = 1.531;
	const intercept = 31.693;
	const regularStats = p.stats.filter((row) => !row.playoffs);
	let current = ovr;

	if (regularStats.length > 0) {
		const ps1 = regularStats.at(-1);
		if (Object.hasOwn(ps1, "per")) {
			if (regularStats.length === 1 || ps1.min >= 2000) {
				current = intercept + slope * ps1.per;
				if (ps1.min < 2000) {
					current = (current * ps1.min) / 2000 + ovr * (1 - ps1.min / 2000);
				}
			} else {
				const ps2 = regularStats.at(-2);
				if (Object.hasOwn(ps2, "per") && ps1.min + ps2.min > 0) {
					current =
						intercept +
						(slope * (ps1.per * ps1.min + ps2.per * ps2.min)) /
							(ps1.min + ps2.min);

					if (ps1.min + ps2.min < 2000) {
						current =
							(current * (ps1.min + ps2.min)) / 2000 +
							ovr * (1 - (ps1.min + ps2.min) / 2000);
					}
				}
			}

			current = 0.8 * ovr + 0.2 * current;
		}
	}

	if (noPot) {
		return current;
	}

	let potential = Math.max(pot, current);
	const age = p.draft.year > season ? p.draft.year - p.born.year : season - p.born.year;
	const combined = valueCombineOvrPot(current, potential, age);
	return combined < 0 ? Number.MIN_VALUE : combined;
};

export const getMostRecentRegularSeasonMinutes = (p) => {
	for (let i = p.stats.length - 1; i >= 0; i--) {
		const ps = p.stats[i];
		if (!ps.playoffs) {
			return ps.min ?? 0;
		}
	}
	return 0;
};

export const getContractValue = (p, season) => {
	const age = season - p.born.year;
	const recentMin = getMostRecentRegularSeasonMinutes(p);
	const currentValue = p.valueNoPot ?? p.value;
	const futureValue = p.value;

	if (currentValue >= 78) {
		return 0.9 * currentValue + 0.1 * futureValue;
	}
	if (currentValue >= 70) {
		return 0.82 * currentValue + 0.18 * futureValue;
	}
	if (age <= 24 && recentMin < 1500) {
		return 0.72 * currentValue + 0.28 * futureValue;
	}
	if (age <= 28) {
		return 0.8 * currentValue + 0.2 * futureValue;
	}

	return 0.88 * currentValue + 0.12 * futureValue;
};

export const getBasketballSalaryAgeFactor = (p, season) => {
	const age = season - p.born.year;
	const recentMin = getMostRecentRegularSeasonMinutes(p);

	if (age <= 20 && recentMin < 1500) return 0.8;
	if (age <= 21 && recentMin < 1500) return 0.84;
	if (age <= 22 && recentMin < 1500) return 0.88;
	if (age <= 23 && recentMin < 1500) return 0.92;
	if (age <= 24 && recentMin < 1500) return 0.96;

	if (recentMin >= 1200) {
		if (age <= 28) return 1;
		if (age === 29) return 1.03;
		if (age === 30) return 1.06;
		if (age === 31) return 1.08;
		if (age === 32) return 1.1;
		if (age === 33) return 1.1;
		if (age === 34) return 1.08;
		if (age === 35) return 1.05;
		if (age === 36) return 1.02;
	}

	return 1;
};

export const getYearsOfExperience = (p, season) => {
	let years = season - p.draft.year;
	if (!Number.isFinite(years)) {
		years = season - p.born.year - 19;
	}
	return bound(Math.floor(years), 0, 10);
};

export const getMinimumSalaryForYearsExperience = (years, minContract) => {
	const realMinimumSalaryScale = [
		1017781, 1637966, 1836090, 1902133, 1968175, 2133278, 2298385,
		2463490, 2628597, 2641682, 2905851,
	];
	const yearsBounded = bound(Math.floor(years), 0, 10);
	const ratio =
		realMinimumSalaryScale[yearsBounded] / realMinimumSalaryScale[0];
	return roundContract(minContract * ratio, minContract);
};

export const getMinContractForPlayer = (p, { season, minContract }) =>
	getMinimumSalaryForYearsExperience(
		getYearsOfExperience(p, season),
		minContract,
	);

const hasRecentAwards = (awards, season, seasonWindow) =>
	awards.some((award) => season - award.season <= seasonWindow);

const hasAtLeastNRecentAwards = (awards, season, seasonWindow, minimumCount) =>
	awards.filter((award) => season - award.season <= seasonWindow).length >=
	minimumCount;

const hasAllLeagueRecentForm = (awards, season) => {
	const allLeagueAwards = awards.filter((award) =>
		award.type.includes("All-League"),
	);
	return (
		hasRecentAwards(allLeagueAwards, season, 1) ||
		hasAtLeastNRecentAwards(allLeagueAwards, season, 3, 2)
	);
};

const hasRoseOrHigherMaxQualification = (p, season) =>
	hasRecentAwards(
		(p.awards ?? []).filter(
			(award) =>
				award.type === AWARD_NAMES.mvp || award.type === AWARD_NAMES.dpoy,
		),
		season,
		1,
	) || hasAllLeagueRecentForm(p.awards ?? [], season);

export const getMaxSalaryTier = (p, season) => {
	const yearsOfService = Math.max(0, season - p.draft.year);
	if (yearsOfService >= 10) return 35;
	if (yearsOfService >= 7) return 30;
	return hasRoseOrHigherMaxQualification(p, season) ? 30 : 25;
};

export const getMaxContractForPlayer = (p, { season, salaryCap }) =>
	Math.round((salaryCap * getMaxSalaryTier(p, season)) / 100);

const isUndrafted = (p) => p.draft.round <= 0 || p.draft.pick <= 0;

const isUndraftedRookieLike = (p, season) =>
	isUndrafted(p) && season - p.born.year <= 23 && season - p.draft.year <= 1;

export const isLowEndYoungFreeAgent = (p, season) => {
	const age = season - p.born.year;
	const yearsSinceDraft = season - p.draft.year;
	const ovr = p.ratings.at(-1).ovr;
	const currentValue = p.valueNoPot ?? p.value;
	return (
		p.draft.round !== 1 &&
		age <= 24 &&
		yearsSinceDraft <= 3 &&
		ovr <= 47 &&
		currentValue <= 47 &&
		p.value <= 52
	);
};

export const getLowEndContractTarget = (p, attrs) => {
	const playerMinimum = getMinContractForPlayer(p, attrs);
	if (isUndraftedRookieLike(p, attrs.season)) {
		return playerMinimum;
	}
	if (isLowEndYoungFreeAgent(p, attrs.season)) {
		return roundContract(playerMinimum * 1.25, attrs.minContract);
	}
};

export const getMaxContractDemandForPlayer = (p, attrs) => {
	const lowEndTarget = getLowEndContractTarget(p, attrs);
	const maxContract = getMaxContractForPlayer(p, attrs);
	return lowEndTarget === undefined
		? maxContract
		: Math.min(maxContract, lowEndTarget);
};

export const estimateContractDemandNoRandom = (p, attrs) => {
	const contractValue = getContractValue(p, attrs.season);
	let factor = attrs.salaryCapType === "hard" ? 1.6 : 2;
	factor *= 1.7;

	let amount =
		(contractValue / 100 - 0.47) *
			factor *
			(attrs.maxContract - attrs.minContract) +
		attrs.minContract;

	amount *= getBasketballSalaryAgeFactor(p, attrs.season);

	const playerMinimum = getMinContractForPlayer(p, attrs);
	if (amount < playerMinimum * 1.1) {
		amount = playerMinimum;
	} else {
		amount = bound(
			amount,
			playerMinimum,
			getMaxContractDemandForPlayer(p, attrs),
		);
	}

	return roundContract(amount, attrs.minContract);
};

export const latestRegularSeasonStats = (p) =>
	p.stats.filter((row) => !row.playoffs).at(-1) ?? {};

export const statValue = (stats, key) => {
	if (key === "trb") {
		return stats.trb ?? (stats.orb ?? 0) + (stats.drb ?? 0);
	}

	return stats[key];
};

export const perGame = (stats, key) => {
	const value = statValue(stats, key);
	return stats.gp > 0 && Number.isFinite(value) ? value / stats.gp : undefined;
};

export const trueShooting = (stats) => {
	const denom = 2 * ((stats.fga ?? 0) + 0.44 * (stats.fta ?? 0));
	return denom > 0 ? (stats.pts ?? 0) / denom : undefined;
};

export const effectiveFg = (stats) => {
	const fga = stats.fga ?? 0;
	return fga > 0 ? ((stats.fg ?? 0) + 0.5 * (stats.tp ?? 0)) / fga : undefined;
};

export const pearson = (rows, xKey, yKey) => {
	const pairs = rows
		.map((row) => [Number(row[xKey]), Number(row[yKey])])
		.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
	if (pairs.length < 3) {
		return undefined;
	}

	const xMean = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
	const yMean = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
	let numerator = 0;
	let xDenom = 0;
	let yDenom = 0;

	for (const [x, y] of pairs) {
		numerator += (x - xMean) * (y - yMean);
		xDenom += (x - xMean) ** 2;
		yDenom += (y - yMean) ** 2;
	}

	const denom = Math.sqrt(xDenom * yDenom);
	return denom > 0 ? numerator / denom : undefined;
};

export const csvEscape = (value) => {
	if (value === undefined || value === null) {
		return "";
	}
	const string = String(value);
	return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
};

export const writeCsv = (csvPath, rows, columnOrder) => {
	const csv = [
		columnOrder.join(","),
		...rows.map((row) =>
			columnOrder
				.map((column) => {
					const value = row[column];
					return csvEscape(
						typeof value === "number" ? round(value, 6) : value,
					);
				})
				.join(","),
		),
	].join("\n");
	fs.writeFileSync(csvPath, `${csv}\n`);
};

export const markdownTable = (rows, columns) => {
	const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
	const separator = `| ${columns.map(() => "---").join(" | ")} |`;
	const body = rows.map(
		(row) =>
			`| ${columns
				.map((column) => {
					const value = column.format
						? column.format(row[column.key], row)
						: row[column.key];
					return value ?? "";
				})
				.join(" | ")} |`,
	);
	return [header, separator, ...body].join("\n");
};

export const getLeagueAttrs = (save) => ({
	season: save.gameAttributes.season,
	phase: save.gameAttributes.phase,
	salaryCap: save.gameAttributes.salaryCap,
	salaryCapType: save.gameAttributes.salaryCapType,
	minContract: save.gameAttributes.minContract,
	maxContract: save.gameAttributes.maxContract,
});

export const getOvrMeanStd = (save) => {
	const activePlayers = save.players.filter((p) => p.tid >= -1);
	const ovrValues = activePlayers.map((p) => p.ratings.at(-1).ovr);
	const ovrMean =
		ovrValues.reduce((sum, value) => sum + value, 0) / ovrValues.length;
	const ovrStd = Math.sqrt(
		ovrValues.reduce((sum, value) => sum + (value - ovrMean) ** 2, 0) /
			ovrValues.length,
	);

	return { ovrMean, ovrStd };
};

export const anchorEntriesFromNotes = (notes) =>
	Object.entries(notes).map(([key, note]) => ({
		key,
		pid: Number(key.split("-").at(-1)),
		note,
	}));

export const buildProxyRows = ({
	root,
	save,
	anchorEntries,
	targetByPid = {},
}) => {
	const compositeWeights = loadCompositeWeights(root);
	const attrs = getLeagueAttrs(save);
	const { ovrMean, ovrStd } = getOvrMeanStd(save);

	const rows = anchorEntries.map(({ key, pid, note }) => {
		const p = save.players.find((player) => player.pid === pid);
		if (!p) {
			throw new Error(`Could not find anchor pid ${pid} from ${key}`);
		}

		const ratings = p.ratings.at(-1);
		const stats = latestRegularSeasonStats(p);
		const age = attrs.season - p.born.year;
		const valueComputed = playerValue(p, {
			ovrMean,
			ovrStd,
			season: attrs.season,
		});
		const valueNoPotComputed = playerValue(p, {
			ovrMean,
			ovrStd,
			season: attrs.season,
			noPot: true,
		});
		const contractValue = getContractValue(p, attrs.season);
		const estimatedDemand = estimateContractDemandNoRandom(p, attrs);
		const eligibleMax = getMaxContractForPlayer(p, attrs);
		const normalNoOptionContract = getNormalNoOptionContract(p.contract, attrs);
		const generatedSkillList = generatedSkills(ratings, compositeWeights);
		const target = targetByPid[pid];

		const row = {
			pid,
			name: `${p.firstName} ${p.lastName}`,
			tid: p.tid,
			age,
			pos: ratings.pos,
			ovr: ratings.ovr,
			pot: ratings.pot,
			value: p.value,
			valueNoPot: p.valueNoPot,
			potentialPremium: p.value - p.valueNoPot,
			valueComputed,
			valueNoPotComputed,
			valueDiff: p.value - valueComputed,
			valueNoPotDiff: p.valueNoPot - valueNoPotComputed,
			getContractValue: contractValue,
			estimatedDemandNoRandom: estimatedDemand,
			rawContractAmount: p.contract?.amount,
			rawContractYears: p.contract ? getContractLength(p.contract, attrs) : undefined,
			rawContractOption: p.contract?.option,
			normalNoOptionContractAmount: normalNoOptionContract.amount,
			normalNoOptionContractYears: normalNoOptionContract.years,
			normalNoOptionContractCapPct:
				normalNoOptionContract.amount / attrs.salaryCap,
			eligibleMax,
			eligibleMaxTier: getMaxSalaryTier(p, attrs.season),
			minContractForPlayer: getMinContractForPlayer(p, attrs),
			latestRegularSeason: stats.season,
			GP: stats.gp,
			GS: stats.gs,
			min: stats.min,
			MPG: perGame(stats, "min"),
			starterShare: stats.gp > 0 ? (stats.gs ?? 0) / stats.gp : undefined,
			PTS: perGame(stats, "pts"),
			TRB: perGame(stats, "trb"),
			AST: perGame(stats, "ast"),
			STL: perGame(stats, "stl"),
			BLK: perGame(stats, "blk"),
			TOV: perGame(stats, "tov"),
			ptsTotal: stats.pts,
			trbTotal: statValue(stats, "trb"),
			astTotal: stats.ast,
			stlTotal: stats.stl,
			blkTotal: stats.blk,
			tovTotal: stats.tov,
			TS: trueShooting(stats),
			eFG: effectiveFg(stats),
			PER: stats.per,
			EWA: stats.ewa,
			VORP: stats.vorp,
			BPM:
				Number.isFinite(stats.obpm) && Number.isFinite(stats.dbpm)
					? stats.obpm + stats.dbpm
					: undefined,
			OBPM: stats.obpm,
			DBPM: stats.dbpm,
			"On-Off": stats.onOff100,
			USG: stats.usgp,
			"AST%": stats.astp,
			"TRB%": stats.trbp,
			"DRB%": stats.drbp,
			"ORB%": stats.orbp,
			"STL%": stats.stlp,
			"BLK%": stats.blkp,
			skills: (ratings.skills ?? []).join(" "),
			generatedSkills: generatedSkillList.join(" "),
			note,
			targetTier: target?.targetTier,
			targetRangeM: Array.isArray(target?.targetRangeM)
				? target.targetRangeM.join("-")
				: "",
			targetNotes: target?.notes,
			targetTierScore: TARGET_TIER_SCORE[target?.targetTier],
		};

		for (const compositeKey of COMPOSITE_KEYS) {
			const entry = compositeWeights[compositeKey];
			row[`comp_${compositeKey}`] = compositeRating(
				ratings,
				entry.ratings,
				entry.weights,
				false,
			);
		}

		for (const compositeKey of SKILL_KEYS) {
			const entry = compositeWeights[compositeKey];
			const label = entry.skill.label;
			const skillRating = compositeRating(
				ratings,
				entry.ratings,
				entry.weights,
				true,
			);
			row[`skill_${label}_rating`] = skillRating;
			row[`skill_${label}_cutoff`] = entry.skill.cutoff;
			row[`skill_${label}_margin`] = skillRating - entry.skill.cutoff;
			row[`skill_${label}_pass`] = skillRating > entry.skill.cutoff;
		}

		return row;
	});

	return {
		attrs,
		compositeWeights,
		ovrMean,
		ovrStd,
		rows,
	};
};

