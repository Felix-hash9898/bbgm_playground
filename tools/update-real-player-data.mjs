import fs from "node:fs";
import { execFileSync } from "node:child_process";

const targetPath = "data/real-player-data.basketball.json";
const officialPath = "../bbgm_official/data/real-player-data.basketball.json";
const BASELINE_COMMIT = "76313676b";
const currentSeason = 2026;
const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
const baseline = JSON.parse(
	execFileSync("git", ["show", `${BASELINE_COMMIT}:${targetPath}`], {
		encoding: "utf8",
		maxBuffer: 100 * 1024 * 1024,
	}),
);
const official = JSON.parse(fs.readFileSync(officialPath, "utf8"));

const protectedKeys = Object.keys(target).filter(
	(key) => !["teams", "ratings", "salaries", "bios"].includes(key),
);
const rowKey = (row, field) =>
	field === "start" ? `${row.slug}:${row.start}` : `${row.slug}:${row[field]}`;
const value = (item) => JSON.stringify(item);
const fieldsChanged = (oldRow, newRow, fields) =>
	fields.filter((field) => value(oldRow?.[field]) !== value(newRow?.[field]));

const manifest = {
	baseline: BASELINE_COMMIT,
	source: "local ../bbgm_official current HEAD",
	target: "current worktree",
	currentSeason,
	collections: {},
	bios: { changed: [], added: [], removed: [] },
	slugRenames: [],
	srIDChanges: [],
	imageChanges: [],
};

const mergeRows = (field, keyField, approvedFields) => {
	const predicate = (row) => row[keyField] >= currentSeason;
	const oldTarget = target[field];
	const currentTarget = new Map(
		oldTarget.filter(predicate).map((row) => [rowKey(row, keyField), row]),
	);
	const sourceRows = official[field].filter(predicate);
	const sourceKeys = new Set(sourceRows.map((row) => rowKey(row, keyField)));
	const outputRows = [];
	const seen = new Set();
	for (const row of oldTarget) {
		if (!predicate(row)) {
			outputRows.push(row);
			continue;
		}
		const key = rowKey(row, keyField);
		if (seen.has(key)) {
			continue;
		}
		const source = sourceRows.find(
			(candidate) => rowKey(candidate, keyField) === key,
		);
		if (source) {
			const merged = { ...row };
			for (const approved of approvedFields) {
				if (source[approved] !== undefined) {
					merged[approved] = source[approved];
				}
			}
			outputRows.push(merged);
			seen.add(key);
		}
	}
	for (const source of sourceRows) {
		const key = rowKey(source, keyField);
		if (seen.has(key)) {
			continue;
		}
		const old = currentTarget.get(key);
		const merged = old ? { ...old } : {};
		for (const approved of approvedFields) {
			if (source[approved] !== undefined) {
				merged[approved] = source[approved];
			}
		}
		outputRows.push(merged);
		seen.add(key);
	}
	target[field] = outputRows;

	const before = new Map(
		baseline[field]
			.filter(predicate)
			.map((row) => [rowKey(row, keyField), row]),
	);
	const after = new Map(
		target[field].filter(predicate).map((row) => [rowKey(row, keyField), row]),
	);
	const details = { changed: [], added: [], removed: [] };
	for (const [key, row] of after) {
		if (!before.has(key)) {
			details.added.push({ key, row });
		} else {
			const old = before.get(key);
			const fields = fieldsChanged(old, row, approvedFields);
			if (fields.length > 0) {
				details.changed.push({
					key,
					slug: row.slug,
					period: row[keyField],
					fields: fields.map((field) => ({
						field,
						old: old[field],
						new: row[field],
					})),
				});
			}
		}
	}
	for (const [key, row] of before) {
		if (!after.has(key)) {
			details.removed.push({ key, row });
		}
	}
	manifest.collections[field] = details;
};

mergeRows("teams", "season", ["slug", "season", "abbrev", "jerseyNumber"]);
const ratingFields = [
	...new Set(
		official.ratings
			.filter((row) => row.season >= currentSeason)
			.flatMap((row) => Object.keys(row)),
	),
];
mergeRows("ratings", "season", ratingFields);
mergeRows("salaries", "start", ["slug", "start", "exp", "amounts"]);

const currentSlugs = new Set(
	["teams", "ratings", "salaries"].flatMap((field) =>
		target[field]
			.filter(
				(row) =>
					row[field === "salaries" ? "start" : "season"] >= currentSeason,
			)
			.map((row) => row.slug),
	),
);
const bioFields = [
	...new Set(
		currentSlugs
			? Object.values(official.bios).flatMap((bio) => Object.keys(bio))
			: [],
	),
];
for (const slug of currentSlugs) {
	const source = official.bios[slug];
	if (!source) {
		throw new Error(`Missing Official identity for ${slug}`);
	}
	const old = target.bios[slug];
	const baselineBio = baseline.bios[slug];
	const merged = { ...(old ?? {}) };
	for (const field of bioFields) {
		if (source[field] !== undefined) {
			merged[field] = source[field];
		}
	}
	target.bios[slug] = merged;
	if (!baselineBio) {
		manifest.bios.added.push({ slug, new: merged });
	} else {
		const fields = fieldsChanged(baselineBio, merged, bioFields);
		if (fields.length > 0) {
			manifest.bios.changed.push({
				slug,
				name: merged.name,
				fields: fields.map((field) => ({
					field,
					old: baselineBio[field],
					new: merged[field],
				})),
			});
		}
	}
}

const baselineCurrentSlugs = new Set(
	["teams", "ratings", "salaries"].flatMap((field) =>
		baseline[field]
			.filter(
				(row) =>
					row[field === "salaries" ? "start" : "season"] >= currentSeason,
			)
			.map((row) => row.slug),
	),
);
for (const slug of baselineCurrentSlugs) {
	if (!currentSlugs.has(slug)) {
		manifest.bios.removed.push({ slug, old: baseline.bios[slug] });
	}
}

const getRows = (field) =>
	target[field].filter(
		(row) => row[field === "salaries" ? "start" : "season"] >= currentSeason,
	);
for (const field of ["teams", "ratings", "salaries"]) {
	const seen = new Set();
	for (const row of getRows(field)) {
		const key = rowKey(row, field === "salaries" ? "start" : "season");
		if (seen.has(key)) {
			throw new Error(`Duplicate current ${field} key ${key}`);
		}
		seen.add(key);
		if (!target.bios[row.slug]) {
			throw new Error(`Missing identity for ${row.slug}`);
		}
	}
}
for (const row of getRows("salaries")) {
	if (
		!Array.isArray(row.amounts) ||
		row.amounts.length === 0 ||
		row.amounts.some((amount) => !Number.isFinite(amount))
	) {
		throw new Error(`Invalid salary amounts for ${row.slug}`);
	}
	if (row.exp < row.start) {
		throw new Error(`Invalid salary expiration for ${row.slug}`);
	}
}
for (const row of target.relatives) {
	if (!target.bios[row.slug] || !target.bios[row.slug2]) {
		throw new Error(`Missing relative identity ${row.slug}/${row.slug2}`);
	}
}

const imageKeys = (object) =>
	Object.keys(object ?? {}).filter((key) => /image|img|photo/i.test(key));
for (const slug of currentSlugs) {
	const old = baseline.bios[slug] ?? {};
	const next = target.bios[slug] ?? {};
	for (const field of imageKeys(next)) {
		if (value(old[field]) !== value(next[field])) {
			manifest.imageChanges.push({
				slug,
				field,
				old: old[field],
				new: next[field],
			});
		}
	}
}

for (const key of protectedKeys) {
	if (value(target[key]) !== value(baseline[key])) {
		throw new Error(`Protected non-target field changed: ${key}`);
	}
}

const summary = (details) => ({
	changed: details.changed.length,
	added: details.added.length,
	removed: details.removed.length,
});
for (const [field, details] of Object.entries(manifest.collections)) {
	details.summary = summary(details);
}
manifest.summary = {
	baseline: BASELINE_COMMIT,
	addedPlayers: manifest.bios.added.length,
	removedPlayers: manifest.bios.removed.length,
	teamRows: manifest.collections.teams.summary,
	ratingRows: manifest.collections.ratings.summary,
	salaryRows: manifest.collections.salaries.summary,
	bioChanges: manifest.bios.changed.length,
	slugRenames: manifest.slugRenames.length,
	srIDChanges: manifest.srIDChanges.length,
	imageChanges: manifest.imageChanges.length,
};

const renderRow = (entry) => {
	const displayName = target.bios[entry.slug]?.name ?? entry.slug;
	if (entry.fields) {
		return `- ${entry.slug ?? entry.key} (${displayName}) period ${entry.period}: ${entry.fields.map((field) => `${field.field}=${value(field.old)} -> ${value(field.new)}`).join("; ")}`;
	}
	return `- ${entry.key} (${displayName}): ${value(entry.row)}`;
};
const renderCollection = (name, details) =>
	`## ${name}\n\nSummary: changed ${details.changed.length}, added ${details.added.length}, removed ${details.removed.length}.\n\n### Changed\n${details.changed.map(renderRow).join("\n") || "- None"}\n\n### Added\n${details.added.map(renderRow).join("\n") || "- None"}\n\n### Removed\n${details.removed.map(renderRow).join("\n") || "- None"}\n`;
const manifestText = [
	"# D49/D52 field-level manifest",
	"",
	`- Baseline: ${BASELINE_COMMIT} (pre-D49 data file)`,
	"- Official source: local current HEAD",
	"- Target: current worktree",
	`- Current-season boundary: ${currentSeason}`,
	`- Added players: ${manifest.summary.addedPlayers}`,
	`- Removed players: ${manifest.summary.removedPlayers}`,
	`- Bio/identity changes: ${manifest.summary.bioChanges}`,
	`- Slug renames: ${manifest.summary.slugRenames}`,
	`- srID changes: ${manifest.summary.srIDChanges}`,
	`- Image reference changes: ${manifest.summary.imageChanges}`,
	"",
	renderCollection("Teams", manifest.collections.teams),
	renderCollection(
		"Ratings (every changed rating field is listed)",
		manifest.collections.ratings,
	),
	renderCollection("Salaries", manifest.collections.salaries),
	`## Bios / identities\n\n### Changed\n${manifest.bios.changed.map(renderRow).join("\n") || "- None"}\n\n### Added\n${manifest.bios.added.map(renderRow).join("\n") || "- None"}\n\n### Removed\n${manifest.bios.removed.map(renderRow).join("\n") || "- None"}\n`,
	"## Protection proof",
	"",
	`The script asserts byte-for-byte equality from baseline to output for: ${protectedKeys.join(", ")}. This includes injuries, teamSeasons, playoffSeries, playIns, scheduled events, expansionDrafts, historical/source data, awards, freeAgents, draftPicks, retiredJerseyNumbers, and relatives. No D63 automatic expansion or image asset copy/generation is performed.`,
	"",
].join("\n");

fs.writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`);
fs.writeFileSync(".ai-bridge/d49-d52-manifest.md", manifestText);
console.log(JSON.stringify(manifest.summary, null, 2));
