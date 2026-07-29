import fs from "node:fs";
import { execFileSync } from "node:child_process";

const targetPath = "data/real-player-data.basketball.json";
const officialPath = "../bbgm_official/data/real-player-data.basketball.json";
const target = JSON.parse(
	execFileSync("git", ["show", `HEAD:${targetPath}`], {
		encoding: "utf8",
		maxBuffer: 100 * 1024 * 1024,
	}),
);
const official = JSON.parse(fs.readFileSync(officialPath, "utf8"));
const currentSeason = 2026;
const stable = [
	"injuries",
	"teamSeasons",
	"playoffSeries",
	"playIns",
	"scheduledEventsGameAttributes",
	"scheduledEventsTeams",
	"expansionDrafts",
];
const protectedBefore = Object.fromEntries(
	stable.map((key) => [key, JSON.stringify(target[key])]),
);
for (const key of stable) {
	if (JSON.stringify(target[key]) !== protectedBefore[key]) {
		throw new Error(`Unexpected self diff for ${key}`);
	}
}

const manifest = {
	currentSeason,
	addedPlayers: [],
	removedPlayers: [],
	teamChanges: [],
	contractChanges: [],
	ratingsChanges: [],
	slugOrSrIDChanges: [],
	imageChanges: [],
	excludedDiffs: {
		injuries: "empty",
		historicalStats: "empty (stats are not in this source file)",
		expansionScheduledEvents: "empty",
	},
};
const key = (row) => `${row.slug}:${row.season ?? row.start}`;
const mergeRows = (field, predicate, changed) => {
	const newRows = official[field].filter(predicate);
	const oldByKey = new Map(target[field].map((row) => [key(row), row]));
	const replacements = new Map(newRows.map((row) => [key(row), row]));
	for (const row of newRows) {
		const old = oldByKey.get(key(row));
		if (!old) {
			changed.added.push(row.slug);
		} else if (JSON.stringify(old) !== JSON.stringify(row)) {
			changed.changed.push({ slug: row.slug, season: row.season ?? row.start });
		}
	}
	target[field] = target[field]
		.map((row) => replacements.get(key(row)) ?? row)
		.filter((row) => !predicate(row) || replacements.has(key(row)));
	const existingKeys = new Set(target[field].map(key));
	for (const row of newRows) {
		if (!existingKeys.has(key(row))) {
			target[field].push(row);
		}
	}
};
const teamChanged = { added: [], changed: [] };
mergeRows("teams", (row) => row.season >= currentSeason, teamChanged);
manifest.teamChanges = teamChanged.changed;

const ratingChanged = { added: [], changed: [] };
mergeRows("ratings", (row) => row.season >= currentSeason, ratingChanged);
manifest.ratingsChanges = ratingChanged.changed;

const salaryChanged = { added: [], changed: [] };
mergeRows("salaries", (row) => row.start >= currentSeason, salaryChanged);
manifest.contractChanges = salaryChanged.changed;

const currentSlugs = new Set([
	...target.teams
		.filter((row) => row.season >= currentSeason)
		.map((row) => row.slug),
	...target.ratings
		.filter((row) => row.season >= currentSeason)
		.map((row) => row.slug),
	...target.salaries
		.filter((row) => row.start >= currentSeason)
		.map((row) => row.slug),
]);
for (const slug of currentSlugs) {
	const old = target.bios[slug];
	const next = official.bios[slug];
	if (!next) {
		throw new Error(`Missing official identity for ${slug}`);
	}
	if (!old) {
		manifest.addedPlayers.push(slug);
	} else if (JSON.stringify(old) !== JSON.stringify(next)) {
		manifest.slugOrSrIDChanges.push(slug);
	}
	target.bios[slug] = next;
}
const targetCurrent = new Set(
	target.teams
		.filter((row) => row.season >= currentSeason)
		.map((row) => row.slug),
);
const officialCurrent = new Set(
	official.teams
		.filter((row) => row.season >= currentSeason)
		.map((row) => row.slug),
);
for (const slug of officialCurrent) {
	if (!targetCurrent.has(slug)) {
		manifest.addedPlayers.push(slug);
	}
}
for (const slug of targetCurrent) {
	if (!officialCurrent.has(slug)) {
		manifest.removedPlayers.push(slug);
	}
}

const identitySlugs = new Set(Object.keys(target.bios));
const duplicateKeys = (rows, getKey) => {
	const seen = new Set();
	for (const row of rows) {
		const rowKey = getKey(row);
		if (seen.has(rowKey)) {
			throw new Error(`Duplicate identity key ${rowKey}`);
		}
		seen.add(rowKey);
	}
};
duplicateKeys(
	target.teams.filter((row) => row.season >= currentSeason),
	(row) => row.slug,
);
duplicateKeys(
	target.ratings.filter((row) => row.season >= currentSeason),
	(row) => row.slug,
);
for (const row of target.teams.filter((row) => row.season >= currentSeason)) {
	if (!identitySlugs.has(row.slug)) {
		throw new Error(`Missing team identity for ${row.slug}`);
	}
}
for (const row of target.ratings.filter((row) => row.season >= currentSeason)) {
	if (!identitySlugs.has(row.slug)) {
		throw new Error(`Missing ratings identity for ${row.slug}`);
	}
}
for (const row of target.relatives) {
	if (!identitySlugs.has(row.slug) || !identitySlugs.has(row.slug2)) {
		throw new Error(`Missing relative identity for ${row.slug}/${row.slug2}`);
	}
}
// Historical awards may intentionally retain rows for players no longer in the
// current bio feed; current roster/ratings references above are strict.

for (const key of stable) {
	if (JSON.stringify(target[key]) !== protectedBefore[key]) {
		throw new Error(`Protected non-target field changed: ${key}`);
	}
}
fs.writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`);
fs.writeFileSync(
	".ai-bridge/d49-d52-manifest.md",
	`# D49/D52 manifest\n\n- Source: local Official HEAD data file\n- Current season boundary: ${currentSeason}\n- Added players: ${manifest.addedPlayers.length}\n- Removed/not active players: ${manifest.removedPlayers.length}\n- Team changes: ${manifest.teamChanges.length}\n- Contract changes: ${manifest.contractChanges.length}\n- Ratings changes: ${manifest.ratingsChanges.length}\n- Slug/identity changes: ${manifest.slugOrSrIDChanges.length}\n- Image reference changes: ${manifest.imageChanges.length}\n- Injury diff: ${manifest.excludedDiffs.injuries}\n- Historical stats diff: ${manifest.excludedDiffs.historicalStats}\n- Expansion scheduled events diff: ${manifest.excludedDiffs.expansionScheduledEvents}\n\nNon-target fields were preserved from Batch1. No images were copied or generated.\n`,
);
console.log(JSON.stringify(manifest, null, 2));
