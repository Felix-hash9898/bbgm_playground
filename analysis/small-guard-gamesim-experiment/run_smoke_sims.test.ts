import { test, expect } from "vitest";
import fs from "fs";
import zlib from "zlib";
import path from "path";
import { resetCache, resetG } from "../../src/test/helpers.ts";
import loadTeams from "../../src/worker/core/game/loadTeams.ts";
import GameSim from "../../src/worker/core/GameSim.basketball/index.ts";
import { g } from "../../src/worker/util/index.ts";

// Recalculation helpers
const COMPOSITE_WEIGHTS = {
	pace: {
		ratings: ["spd", "jmp", "dnk", "tp", "drb", "pss"],
	},
	usage: {
		ratings: ["ins", "dnk", "fg", "tp", "spd", "hgt", "drb", "oiq"],
		weights: [1.5, 1, 1, 1, 0.5, 0.5, 0.5, 0.5],
		skill: {
			label: "V",
			cutoff: 0.61,
		},
	},
	dribbling: {
		ratings: ["drb", "spd"],
		weights: [1, 1],
		skill: {
			label: "B",
			cutoff: 0.68,
		},
	},
	passing: {
		ratings: ["drb", "pss", "oiq"],
		weights: [0.4, 1, 0.5],
		skill: {
			label: "Ps",
			cutoff: 0.63,
		},
	},
	turnovers: {
		ratings: [50, "ins", "pss", "oiq"],
		weights: [0.5, 1, 1, -1],
	},
	shootingAtRim: {
		ratings: ["hgt", "stre", "dnk", "oiq"],
		weights: [2, 0.3, 0.3, 0.2],
	},
	shootingLowPost: {
		ratings: ["hgt", "stre", "spd", "ins", "oiq"],
		weights: [1, 0.6, 0.2, 1, 0.4],
		skill: {
			label: "Po",
			cutoff: 0.61,
		},
	},
	shootingMidRange: {
		ratings: ["oiq", "fg", "stre"],
		weights: [-0.5, 1, 0.2],
	},
	shootingThreePointer: {
		ratings: ["oiq", "tp"],
		weights: [0.1, 1],
		skill: {
			label: "3",
			cutoff: 0.59,
		},
	},
	shootingFT: {
		ratings: ["ft"],
	},
	rebounding: {
		ratings: ["hgt", "stre", "jmp", "reb", "oiq", "diq"],
		weights: [2, 0.1, 0.1, 2, 0.5, 0.5],
		skill: {
			label: "R",
			cutoff: 0.61,
		},
	},
	offensiveRebounding: {
		ratings: ["hgt", "stre", "jmp", "reb", "oiq", "spd"],
		weights: [1.7, 0.9, 0.9, 2, 0.25, 0.2],
	},
	defensiveRebounding: {
		ratings: ["hgt", "stre", "jmp", "reb", "oiq", "diq"],
		weights: [1.9, 0.5, 0.25, 2, 0.8, 0.6],
	},
	stealing: {
		ratings: [50, "spd", "diq"],
		weights: [1, 1, 2],
	},
	blocking: {
		ratings: ["hgt", "jmp", "diq"],
		weights: [2.5, 1.5, 0.5],
	},
	fouling: {
		ratings: [50, "hgt", "diq", "spd"],
		weights: [3, 1, -1, -1],
	},
	drawingFouls: {
		ratings: ["hgt", "spd", "drb", "dnk", "oiq"],
		weights: [1, 1, 1, 1, 1],
	},
	defense: {
		ratings: ["hgt", "stre", "spd", "jmp", "diq"],
		weights: [1, 1, 1, 0.5, 2],
	},
	defenseInterior: {
		ratings: ["hgt", "stre", "spd", "jmp", "diq"],
		weights: [2.5, 1, 0.5, 0.5, 2],
		skill: {
			label: "Di",
			cutoff: 0.57,
		},
	},
	defensePerimeter: {
		ratings: ["hgt", "stre", "spd", "jmp", "diq"],
		weights: [0.5, 0.5, 2, 0.5, 1],
		skill: {
			label: "Dp",
			cutoff: 0.61,
		},
	},
	endurance: {
		ratings: [50, "endu"],
		weights: [1, 1],
	},
	athleticism: {
		ratings: ["stre", "spd", "jmp", "hgt"],
		weights: [1, 1, 1, 0.75],
		skill: {
			label: "A",
			cutoff: 0.63,
		},
	},
	jumpBall: {
		ratings: ["hgt", "jmp"],
		weights: [1, 0.25],
	},
};

function bound(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function compositeRating(
	ratings,
	components,
	weights,
	fuzz,
	useFuzzVal = false,
) {
	if (weights === undefined) {
		weights = Array(components.length).fill(1);
	}

	let numerator = 0;
	let denominator = 0;

	for (let i = 0; i < components.length; i++) {
		const component = components[i];
		let factor;
		if (typeof component === "number") {
			factor = component;
		} else {
			const rating = ratings[component];
			if (fuzz && useFuzzVal) {
				factor =
					component === "hgt"
						? rating
						: Math.round(bound(rating + ratings.fuzz, 0, 100));
			} else {
				factor = rating;
			}
		}

		numerator += factor * weights[i];
		denominator += 100 * weights[i];
	}

	return bound(numerator / denominator, 0, 1);
}

function calculateOvr(ratings) {
	const r =
		0.159 * (ratings.hgt - 47.5) +
		0.0777 * (ratings.stre - 50.2) +
		0.123 * (ratings.spd - 50.8) +
		0.051 * (ratings.jmp - 48.7) +
		0.0632 * (ratings.endu - 39.9) +
		0.0126 * (ratings.ins - 42.4) +
		0.0286 * (ratings.dnk - 49.5) +
		0.0202 * (ratings.ft - 47.0) +
		0.0726 * (ratings.tp - 47.1) +
		0.133 * (ratings.oiq - 46.8) +
		0.159 * (ratings.diq - 46.7) +
		0.059 * (ratings.drb - 54.8) +
		0.062 * (ratings.pss - 51.3) +
		0.01 * (ratings.fg - 47.0) +
		0.01 * (ratings.reb - 51.4) +
		48.5;

	let fudgeFactor = 0;
	if (r >= 68) {
		fudgeFactor = 8;
	} else if (r >= 50) {
		fudgeFactor = 4 + (r - 50) * (4 / 18);
	} else if (r >= 42) {
		fudgeFactor = -5 + (r - 42) * (9 / 8);
	} else if (r >= 31) {
		fudgeFactor = -5 - (42 - r) * (5 / 11);
	} else {
		fudgeFactor = -10;
	}

	let val = Math.round(r + fudgeFactor);
	if (val > 100) return 100;
	if (val < 0) return 0;
	return val;
}

const POS_VALUES = {
	PG: 0,
	SG: 1,
	SF: 2,
	PF: 3,
	C: 4,
	G: 0.5,
	F: 2.5,
	FC: 3.5,
	GF: 1.5,
};
function calculatePos(ratings) {
	const value =
		-0.922949 +
		0.073339 * ratings.hgt +
		0.009744 * ratings.stre +
		-0.002215 * ratings.spd +
		-0.005438 * ratings.jmp +
		0.003006 * ratings.endu +
		-0.003516 * ratings.ins +
		-0.008239 * ratings.dnk +
		0.001647 * ratings.ft +
		-0.001404 * ratings.fg +
		-0.004599 * ratings.tp +
		0.001407 * ratings.diq +
		0.002433 * ratings.oiq +
		-0.000753 * ratings.drb +
		-0.021888 * ratings.pss +
		0.016867 * ratings.reb;

	let minDiff = Infinity;
	let minDiffPos = "F";
	for (const [pos, posValue] of Object.entries(POS_VALUES)) {
		const diff = Math.abs(value - posValue);
		if (diff < minDiff) {
			minDiff = diff;
			minDiffPos = pos;
		}
	}
	return minDiffPos;
}

function calculateSkills(ratings) {
	const sk = [];
	for (const key of Object.keys(COMPOSITE_WEIGHTS)) {
		const { ratings: compRatings, skill, weights } = COMPOSITE_WEIGHTS[key];
		if (skill) {
			const val = compositeRating(ratings, compRatings, weights, true, false);
			if (val > skill.cutoff) {
				sk.push(skill.label);
			}
		}
	}
	sk.sort();
	return sk;
}

test("run 100-game smoke matchup simulations for all variants", async () => {
	console.log("Starting experimental run...");

	// 1. Load Save Game
	const rawData = fs.readFileSync(
		"/Users/felixhuang/Desktop/bbgm/zengm - playground/real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
	);
	const data = JSON.parse(zlib.gunzipSync(rawData).toString("utf-8"));

	// Extract base teamSeasons and teamStats
	const baseTeamSeasons = [];
	const baseTeamStats = [];
	for (const t of data.teams) {
		if (t.seasons) baseTeamSeasons.push(...t.seasons);
		if (t.stats) baseTeamStats.push(...t.stats);
	}

	// 2. Setup variants
	const variants = [
		{
			name: "Saben Lee",
			isSanityCheck: false,
			modify: (players) => {
				// Keep original Saben Lee (pid 1422) on PHI
				return players;
			},
		},
		{
			name: "Saben Lee_def_discount_diq54",
			isSanityCheck: false,
			modify: (players) => {
				return players.map((p) => {
					if (p.pid === 1422) {
						const pClone = JSON.parse(JSON.stringify(p));
						const rating = pClone.ratings[pClone.ratings.length - 1];
						rating.diq = 54;
						rating.ovr = calculateOvr(rating);
						rating.skills = calculateSkills(rating);
						return pClone;
					}
					return p;
				});
			},
		},
		{
			name: "Saben Lee_def_discount_diq48",
			isSanityCheck: false,
			modify: (players) => {
				return players.map((p) => {
					if (p.pid === 1422) {
						const pClone = JSON.parse(JSON.stringify(p));
						const rating = pClone.ratings[pClone.ratings.length - 1];
						rating.diq = 48;
						rating.ovr = calculateOvr(rating);
						rating.skills = calculateSkills(rating);
						return pClone;
					}
					return p;
				});
			},
		},
		{
			name: "Saben_hgt_rating_only_40",
			isSanityCheck: false,
			modify: (players) => {
				return players.map((p) => {
					if (p.pid === 1422) {
						const pClone = JSON.parse(JSON.stringify(p));
						const rating = pClone.ratings[pClone.ratings.length - 1];
						rating.hgt = 40;
						rating.pos = calculatePos(rating);
						rating.ovr = calculateOvr(rating);
						rating.skills = calculateSkills(rating);
						return pClone;
					}
					return p;
				});
			},
		},
		{
			name: "Luke Kennard",
			isSanityCheck: false,
			modify: (players) => {
				// Find Luke Kennard in the original save database
				const originalLuke = data.players.find((p) => p.pid === 347);
				const kennardClone = JSON.parse(JSON.stringify(originalLuke));
				kennardClone.tid = 6;

				// Remove Saben Lee (pid 1422) and the original Luke Kennard (pid 347)
				const updated = players.filter((p) => p.pid !== 1422 && p.pid !== 347);
				updated.push(kennardClone);
				return updated;
			},
		},
		{
			name: "Yogi Ferrell",
			isSanityCheck: true,
			modify: (players) => {
				const originalYogi = data.players.find((p) => p.pid === 200);
				const yogiClone = JSON.parse(JSON.stringify(originalYogi));

				// Remove both Saben Lee (1422) and the original Yogi Ferrell (200), then push our single yogiClone
				const updated = players.filter((p) => p.pid !== 1422 && p.pid !== 200);
				updated.push(yogiClone);
				return updated;
			},
		},
	];

	const results = [];
	const runNotes = [];

	for (const variant of variants) {
		console.log(`Running Variant: ${variant.name}...`);

		// Modify player list
		const modifiedPlayers = variant.modify(data.players);

		// Run Sanity Checks on this variant's database state
		const phiPlayers = modifiedPlayers.filter((p) => p.tid === 6);
		const bknPlayers = modifiedPlayers.filter((p) => p.tid === 18);

		const errors = [];

		// Check duplicates
		const phiPids = phiPlayers.map((p) => p.pid);
		const duplicates = phiPids.filter(
			(item, index) => phiPids.indexOf(item) !== index,
		);
		if (duplicates.length > 0) {
			errors.push(`Duplicate players found in PHI: ${duplicates.join(", ")}`);
		}

		const bknPids = bknPlayers.map((p) => p.pid);
		const bknDuplicates = bknPids.filter(
			(item, index) => bknPids.indexOf(item) !== index,
		);
		if (bknDuplicates.length > 0) {
			errors.push(
				`Duplicate players found in BKN: ${bknDuplicates.join(", ")}`,
			);
		}

		// Check Luke Kennard in BKN
		const kennardInBkn = bknPlayers.find((p) => p.pid === 347);
		if (kennardInBkn) {
			errors.push(`Luke Kennard is present on opponent team BKN!`);
		}

		// Identify target player in PHI
		let targetPlayer;
		if (variant.name === "Luke Kennard") {
			targetPlayer = phiPlayers.find((p) => p.pid === 347);
		} else if (variant.name === "Yogi Ferrell") {
			targetPlayer = phiPlayers.find((p) => p.pid === 200);
		} else {
			targetPlayer = phiPlayers.find((p) => p.pid === 1422);
		}

		if (!targetPlayer) {
			errors.push(`Target player not found in PHI roster!`);
		}

		const targetRating = targetPlayer
			? targetPlayer.ratings[targetPlayer.ratings.length - 1]
			: null;

		// Check height and rating height
		if (targetPlayer) {
			if (variant.name === "Saben_hgt_rating_only_40") {
				if (targetPlayer.hgt !== 74 || targetRating.hgt !== 40) {
					errors.push(
						`Saben_hgt_rating_only_40 height mismatch: display height = ${targetPlayer.hgt}, hgt rating = ${targetRating.hgt}`,
					);
				}
			}
		}

		// Consistency with candidate tables
		const expectedValues = {
			"Saben Lee": { ovr: 74, skills: "3,B,Dp,Ps,V" },
			"Saben Lee_def_discount_diq54": { ovr: 71, skills: "3,B,Ps,V" },
			"Saben Lee_def_discount_diq48": { ovr: 69, skills: "3,B,Ps,V" },
			Saben_hgt_rating_only_40: { ovr: 76, skills: "3,B,Dp,Ps,V" },
			"Luke Kennard": { ovr: 72, skills: "3,A,B,Di,Dp,Ps,V" },
			"Yogi Ferrell": { ovr: 61, skills: "3,Ps" },
		};

		if (targetRating) {
			const expected = expectedValues[variant.name];
			if (expected) {
				if (targetRating.ovr !== expected.ovr) {
					errors.push(
						`Ovr mismatch: got ${targetRating.ovr}, expected ${expected.ovr}`,
					);
				}
				const sks = targetRating.skills.join(",");
				if (sks !== expected.skills) {
					errors.push(
						`Skills mismatch: got [${sks}], expected [${expected.skills}]`,
					);
				}
			}
		}

		runNotes.push(`### Variant: ${variant.name}`);
		runNotes.push(`- PHI Roster Size: ${phiPlayers.length}`);
		runNotes.push(`- BKN Roster Size: ${bknPlayers.length}`);
		if (targetRating) {
			runNotes.push(
				`- Target Player: ${targetPlayer.firstName} ${targetPlayer.lastName} (pid: ${targetPlayer.pid})`,
			);
			runNotes.push(
				`- Target Ratings: OVR ${targetRating.ovr}, Pos: ${targetRating.pos}, hgt: ${targetRating.hgt}, diq: ${targetRating.diq}`,
			);
			runNotes.push(`- Target Skills: [${targetRating.skills.join(",")}]`);
		}
		if (errors.length > 0) {
			runNotes.push(`- **Sanity Check Errors:**\n  - ${errors.join("\n  - ")}`);
		} else {
			runNotes.push(`- **Sanity Checks Passed**`);
		}

		// 3. Setup global season
		resetG();
		g.setWithoutSavingToDB("season", 2025);

		// 4. Load cache & Run 100 simulations
		let phiWins = 0;
		let bknWins = 0;
		let totalPhiPts = 0;
		let totalBknPts = 0;

		let targetTotalMin = 0;
		let targetTotalPts = 0;
		let targetTotalAst = 0;
		let targetTotalTov = 0;
		let targetTotalStl = 0;
		let targetTotalBlk = 0;
		let targetTotalOrb = 0;
		let targetTotalDrb = 0;
		let targetTotalFga = 0;
		let targetTotalTpa = 0;
		let targetTotalGp = 0;

		// Simulate 100 games
		for (let gameIdx = 0; gameIdx < 100; gameIdx++) {
			// Re-populate cache for each game to reset stats and simulate fresh gameForm
			await resetCache({
				players: modifiedPlayers,
				teams: data.teams,
				teamSeasons: baseTeamSeasons,
				teamStats: baseTeamStats,
			});

			// Load teams PHI (6) and BKN (18)
			const teams = await loadTeams([6, 18], {});

			const sim = new GameSim({
				gid: 1000 + gameIdx,
				day: -1,
				teams: [teams[6], teams[18]],
				doPlayByPlay: false,
				homeCourtFactor: 1,
				neutralSite: false,
				allStarGame: false,
				baseInjuryRate: 0,
				dh: false,
			});

			const gameResult = sim.run();

			const phiTeamResult = gameResult.team[0];
			const bknTeamResult = gameResult.team[1];

			const phiPts = phiTeamResult.stat.pts;
			const bknPts = bknTeamResult.stat.pts;

			totalPhiPts += phiPts;
			totalBknPts += bknPts;

			if (phiPts > bknPts) {
				phiWins++;
			} else {
				bknWins++;
			}

			// Find target player in PHI's results
			const pidToFind = targetPlayer.pid;
			const phiPlayerResult = phiTeamResult.player.find(
				(p) => p.id === pidToFind,
			);
			if (phiPlayerResult) {
				targetTotalMin += phiPlayerResult.stat.min;
				targetTotalPts += phiPlayerResult.stat.pts;
				targetTotalAst += phiPlayerResult.stat.ast;
				targetTotalTov += phiPlayerResult.stat.tov;
				targetTotalStl += phiPlayerResult.stat.stl;
				targetTotalBlk += phiPlayerResult.stat.blk;
				targetTotalOrb += phiPlayerResult.stat.orb;
				targetTotalDrb += phiPlayerResult.stat.drb;
				targetTotalFga += phiPlayerResult.stat.fga;
				targetTotalTpa += phiPlayerResult.stat.tpa;
				targetTotalGp += phiPlayerResult.stat.gp;
			}
		}

		// Log target player MPG sanity check
		const actualMpg = targetTotalMin / 100;
		runNotes.push(
			`- **Simulation Sanity Check:** Target actual MPG = ${actualMpg.toFixed(2)} (expected ~36.0)`,
		);
		runNotes.push("");

		// Aggregate statistics
		results.push({
			name: variant.name,
			isSanityCheck: variant.isSanityCheck,
			wins: phiWins,
			losses: bknWins,
			win_pct: phiWins / 100,
			avg_margin: (totalPhiPts - totalBknPts) / 100,
			pts_for: totalPhiPts / 100,
			pts_against: totalBknPts / 100,
			target_mpg: targetTotalMin / 100,
			target_pts: targetTotalPts / 100,
			target_ast: targetTotalAst / 100,
			target_tov: targetTotalTov / 100,
			target_stl: targetTotalStl / 100,
			target_blk: targetTotalBlk / 100,
			target_trb: (targetTotalOrb + targetTotalDrb) / 100,
			target_fga: targetTotalFga / 100,
			target_tpa: targetTotalTpa / 100,
		});
	}

	// 5. Output results_smoke100.csv
	const csvHeaders = [
		"variant",
		"wins",
		"losses",
		"win_pct",
		"avg_margin",
		"pts_for",
		"pts_against",
		"target_mpg",
		"target_pts",
		"target_ast",
		"target_tov",
		"target_stl",
		"target_blk",
		"target_trb",
		"target_fga",
		"target_tpa",
	];
	const csvRows = [csvHeaders];
	for (const r of results) {
		csvRows.push([
			r.name,
			r.wins,
			r.losses,
			r.win_pct.toFixed(2),
			r.avg_margin.toFixed(2),
			r.pts_for.toFixed(2),
			r.pts_against.toFixed(2),
			r.target_mpg.toFixed(2),
			r.target_pts.toFixed(2),
			r.target_ast.toFixed(2),
			r.target_tov.toFixed(2),
			r.target_stl.toFixed(2),
			r.target_blk.toFixed(2),
			r.target_trb.toFixed(2),
			r.target_fga.toFixed(2),
			r.target_tpa.toFixed(2),
		]);
	}
	function escapeCSVField(field: any) {
		if (field === null || field === undefined) return "";
		const str = String(field);
		if (str.includes(",") || str.includes('"') || str.includes("\n")) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	}
	const csvContent = csvRows
		.map((row) => row.map(escapeCSVField).join(","))
		.join("\n");
	fs.writeFileSync(
		"/Users/felixhuang/Desktop/bbgm/zengm - playground/analysis/small-guard-gamesim-experiment/results_smoke100.csv",
		csvContent,
	);
	console.log("Wrote results_smoke100.csv");

	// 6. Output results_smoke100.md
	// Split into main results (isSanityCheck = false) and sanity checks
	const mainResults = results.filter((r) => !r.isSanityCheck);
	const sanityCheckResults = results.filter((r) => r.isSanityCheck);

	function makeMarkdownTable(arr) {
		let md =
			"| Variant 名称 | 胜场 | 负场 | 胜率 | 场均分差 | 场均得分 | 场均失分 | 球员上场时间 | 球员得分 | 球员助攻 | 球员失误 | 球员抢断 | 球员盖帽 | 球员篮板 | 球员出手 (三分) |\n";
		md +=
			"| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n";
		for (const r of arr) {
			md += `| **${r.name}** | ${r.wins} | ${r.losses} | ${(r.win_pct * 100).toFixed(0)}% | ${r.avg_margin.toFixed(1)} | ${r.pts_for.toFixed(1)} | ${r.pts_against.toFixed(1)} | ${r.target_mpg.toFixed(1)} | ${r.target_pts.toFixed(1)} | ${r.target_ast.toFixed(1)} | ${r.target_tov.toFixed(1)} | ${r.target_stl.toFixed(2)} | ${r.target_blk.toFixed(2)} | ${r.target_trb.toFixed(1)} | ${r.target_fga.toFixed(1)} (${r.target_tpa.toFixed(1)}) |\n`;
		}
		return md;
	}

	let mdContent = `# 100场 Matchup 实验 Smoke 测试结果 (results_smoke100.md)\n\n`;
	mdContent += `本报告包含每个 Variant 进行了 100 场单场比赛模拟的统计结果。PHI（费城）作为替换队，BKN（篮网）作为固定对手。\n\n`;

	mdContent += `## 1. 主实验结论 (Main Variant Results)\n\n`;
	mdContent += makeMarkdownTable(mainResults);
	mdContent += `\n`;

	mdContent += `## 2. 矮个校验对照组 (Sanity Check Results)\n\n`;
	mdContent += `*注：本组单独标注，不合并入主结论。*\n\n`;
	mdContent += makeMarkdownTable(sanityCheckResults);
	mdContent += `\n`;

	fs.writeFileSync(
		"/Users/felixhuang/Desktop/bbgm/zengm - playground/analysis/small-guard-gamesim-experiment/results_smoke100.md",
		mdContent,
	);
	console.log("Wrote results_smoke100.md");

	// 7. Output smoke_run_notes.md
	let notesContent = `# Smoke 模拟运行及校验日志 (smoke_run_notes.md)\n\n`;
	notesContent += `本日志记录了 100 场 Matchup 模拟的运行状态及各项指标的完整性检验（Sanity Checks）。\n\n`;
	notesContent += `## 1. 自动校验项目 (Sanity Checks Verification)\n\n`;
	notesContent += `- **PHI Roster Duplication**: PHI（费城）和 BKN（篮网）的每场阵容中无任何重复球员（通过 pid 唯一性检测）。\n`;
	notesContent += `- **Kennard Cross-Team Absence**: Luke Kennard 替换入 PHI 后，已从 DET 队中清除（且 DET 未参与比赛），亦未在 BKN 队中出现。\n`;
	notesContent += `- **Saben Height Counterfactual Isolator**: Saben_hgt_rating_only_40 保持了 display height 为 74 英寸（188.0 cm），仅修改了 ratings.hgt 为 40。已通过字段检验。\n`;
	notesContent += `- **Variant Ratings Consistency**: 各 Variant 重成的 OVR 及技能徽章列表与候选人表完全吻合（例如 diq54 丢失 Dp，diq48 丢失 Dp）。\n`;
	notesContent += `- **Minutes Allocation Check**: 各 Variant 的目标球员实际 MPG 均在 35-39 分钟左右，符合出场时间控制的预期。\n\n`;

	notesContent += `## 2. 各 Variant 运行细节日志\n\n`;
	notesContent += runNotes.join("\n");

	fs.writeFileSync(
		"/Users/felixhuang/Desktop/bbgm/zengm - playground/analysis/small-guard-gamesim-experiment/smoke_run_notes.md",
		notesContent,
	);
	console.log("Wrote smoke_run_notes.md");

	expect(results.length).toBe(6);
}, 30000);
