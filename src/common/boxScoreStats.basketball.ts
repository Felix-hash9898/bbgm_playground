const BOX_SCORE_STATS = [
	"min",
	"fg",
	"fgAtRim",
	"fgLowPost",
	"fgMidRange",
	"tp",
	"ft",
	"orb",
	"trb",
	"ast",
	"tov",
	"stl",
	"blk",
	"ba",
	"pf",
	"pts",
	"gmsc",
	"bpmImpact",
	"form",
	"gameForm",
	"formTot",
] as const;

export type BasketballBoxScoreStat = (typeof BOX_SCORE_STATS)[number];

export default BOX_SCORE_STATS;
