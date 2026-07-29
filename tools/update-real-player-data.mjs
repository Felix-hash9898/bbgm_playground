import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// D49 is deliberately reproducible. Do not replace either of these with HEAD
// or with the worktree file; the current worktree is the output, never input.
const BASELINE_COMMIT = "76313676b";
const OFFICIAL_COMMIT = "c127a384b2d110aab7e42f4ac2a84f4ebb8251ec";
const OFFICIAL_REPO = "../bbgm_official";
const TARGET_PATH = "data/real-player-data.basketball.json";
const MANIFEST_PATH = ".ai-bridge/d49-d52-manifest.md";
const CURRENT_SEASON = 2026;

const COLLECTIONS = [
	{
		name: "teams",
		period: "season",
		fields: ["slug", "season", "abbrev", "jerseyNumber"],
	},
	{
		name: "ratings",
		period: "season",
		fields: [
			"slug",
			"season",
			"diq",
			"dnk",
			"drb",
			"endu",
			"fg",
			"ft",
			"fuzz",
			"hgt",
			"ins",
			"jmp",
			"oiq",
			"pss",
			"reb",
			"spd",
			"stre",
			"tp",
		],
	},
	{
		name: "salaries",
		period: "start",
		fields: ["slug", "start", "exp", "amounts"],
	},
];
const BIO_FIELDS = [
	"bornYear",
	"college",
	"country",
	"diedYear",
	"draftAbbrev",
	"draftPick",
	"draftRound",
	"draftYear",
	"height",
	"name",
	"pos",
	"weight",
];
const PROTECTED_TOP_LEVEL = [
	"awards",
	"draftPicks",
	"expansionDrafts",
	"freeAgents",
	"injuries",
	"playIns",
	"playoffSeries",
	"relatives",
	"retiredJerseyNumbers",
	"scheduledEventsGameAttributes",
	"scheduledEventsTeams",
	"teamSeasons",
];

const json = (value) => JSON.stringify(value);
const clone = (value) => structuredClone(value);
const rowKey = (row, period) => `${row.slug}:${row[period]}`;
const isCurrent = (row, period) => row[period] >= CURRENT_SEASON;
const gitJSON = (cwd, revision) =>
	JSON.parse(
		execFileSync("git", ["show", `${revision}:${TARGET_PATH}`], {
			cwd,
			encoding: "utf8",
			maxBuffer: 100 * 1024 * 1024,
		}),
	);

const baseline = gitJSON(process.cwd(), BASELINE_COMMIT);
const official = gitJSON(OFFICIAL_REPO, OFFICIAL_COMMIT);
const target = clone(baseline);

const assertNoUnknownFields = (row, fields, label) => {
	for (const field of Object.keys(row)) {
		if (!fields.includes(field)) {
			throw new Error(`${label} has unapproved source field ${field}`);
		}
	}
};

// Official has a few repeated salary records. Its fixed-source record order is
// authoritative: later rows supersede earlier rows with the same slug/period.
const canonicalCurrentRows = (rows, period, fields, label) => {
	const output = new Map();
	for (const row of rows) {
		if (!isCurrent(row, period)) {
			continue;
		}
		assertNoUnknownFields(row, fields, label);
		output.set(rowKey(row, period), clone(row));
	}
	return output;
};

const changedFields = (before, after, fields) =>
	fields.filter((field) => json(before?.[field]) !== json(after?.[field]));
const copyApprovedFields = (previous, source, fields) => {
	const output = clone(previous ?? {});
	for (const field of fields) {
		if (Object.hasOwn(source, field)) {
			output[field] = clone(source[field]);
		} else {
			// An Official omission is intentional. Do not leave stale target data.
			delete output[field];
		}
	}
	return output;
};

const manifest = {
	baseline: BASELINE_COMMIT,
	official: OFFICIAL_COMMIT,
	currentSeason: CURRENT_SEASON,
	collections: {},
	bios: { changed: [], added: [], removed: [] },
	slugRenames: [],
	srIDChanges: [],
	imageChanges: [],
};

for (const { name, period, fields } of COLLECTIONS) {
	const baselineCurrent = new Map(
		baseline[name]
			.filter((row) => isCurrent(row, period))
			.map((row) => [rowKey(row, period), row]),
	);
	const sourceCurrent = canonicalCurrentRows(
		official[name],
		period,
		fields,
		name,
	);
	const outputCurrent = new Map();
	for (const [key, source] of sourceCurrent) {
		outputCurrent.set(
			key,
			copyApprovedFields(baselineCurrent.get(key), source, fields),
		);
	}

	// Historical records are copied byte-for-byte from the fixed baseline. Keep
	// their surrounding source order too, so the generated diff is field-level.
	const emitted = new Set();
	target[name] = [];
	for (const baselineRow of baseline[name]) {
		if (!isCurrent(baselineRow, period)) {
			target[name].push(clone(baselineRow));
			continue;
		}
		const key = rowKey(baselineRow, period);
		const outputRow = outputCurrent.get(key);
		if (outputRow && !emitted.has(key)) {
			target[name].push(outputRow);
			emitted.add(key);
		}
	}
	for (const [key, outputRow] of outputCurrent) {
		if (!emitted.has(key)) {
			target[name].push(outputRow);
		}
	}

	const details = { changed: [], added: [], removed: [] };
	for (const [key, after] of outputCurrent) {
		const before = baselineCurrent.get(key);
		if (!before) {
			details.added.push({
				key,
				slug: after.slug,
				period: after[period],
				row: after,
			});
			continue;
		}
		const fieldsChanged = changedFields(before, after, fields);
		if (fieldsChanged.length > 0) {
			details.changed.push({
				key,
				slug: after.slug,
				period: after[period],
				fields: fieldsChanged.map((field) => ({
					field,
					old: before[field],
					new: after[field],
				})),
			});
		}
	}
	for (const [key, before] of baselineCurrent) {
		if (!outputCurrent.has(key)) {
			details.removed.push({
				key,
				slug: before.slug,
				period: before[period],
				row: before,
			});
		}
	}
	manifest.collections[name] = details;
}

const currentSlugs = new Set(
	COLLECTIONS.flatMap(({ name, period }) =>
		target[name].filter((row) => isCurrent(row, period)).map((row) => row.slug),
	),
);
const baselineCurrentSlugs = new Set(
	COLLECTIONS.flatMap(({ name, period }) =>
		baseline[name]
			.filter((row) => isCurrent(row, period))
			.map((row) => row.slug),
	),
);
for (const slug of currentSlugs) {
	const source = official.bios[slug];
	if (!source) {
		throw new Error(`Missing fixed Official bio for current player ${slug}`);
	}
	assertNoUnknownFields(source, BIO_FIELDS, `bio ${slug}`);
	const before = baseline.bios[slug];
	const after = copyApprovedFields(before, source, BIO_FIELDS);
	target.bios[slug] = after;
	if (!before) {
		manifest.bios.added.push({ slug, name: after.name, row: after });
	} else {
		const fields = changedFields(before, after, BIO_FIELDS);
		if (fields.length > 0) {
			manifest.bios.changed.push({
				slug,
				name: after.name,
				fields: fields.map((field) => ({
					field,
					old: before[field],
					new: after[field],
				})),
			});
		}
	}
}
for (const slug of baselineCurrentSlugs) {
	if (!currentSlugs.has(slug)) {
		manifest.bios.removed.push({
			slug,
			name: baseline.bios[slug]?.name,
			row: baseline.bios[slug],
		});
	}
}

const assertEqual = (actual, expected, message) => {
	if (json(actual) !== json(expected)) {
		throw new Error(message);
	}
};
for (const { name, period, fields } of COLLECTIONS) {
	const source = canonicalCurrentRows(official[name], period, fields, name);
	const output = new Map(
		target[name]
			.filter((row) => isCurrent(row, period))
			.map((row) => [rowKey(row, period), row]),
	);
	if (
		output.size !== target[name].filter((row) => isCurrent(row, period)).length
	) {
		throw new Error(`Duplicate current ${name} key`);
	}
	if (output.size !== source.size) {
		throw new Error(`${name} source/output row count mismatch`);
	}
	let mismatchCount = 0;
	for (const [key, sourceRow] of source) {
		const outputRow = output.get(key);
		if (!outputRow) {
			throw new Error(`Missing ${name} row ${key}`);
		}
		for (const field of fields) {
			if (json(outputRow[field]) !== json(sourceRow[field])) {
				mismatchCount += 1;
			}
		}
	}
	if (mismatchCount !== 0) {
		throw new Error(
			`${name} has ${mismatchCount} fixed-source field mismatches`,
		);
	}
}
for (const slug of currentSlugs) {
	if (!target.bios[slug]) {
		throw new Error(`Missing output bio for ${slug}`);
	}
	for (const field of BIO_FIELDS) {
		assertEqual(
			target.bios[slug][field],
			official.bios[slug][field],
			`Bio mismatch for ${slug}.${field}`,
		);
	}
}
for (const row of target.salaries.filter((row) => isCurrent(row, "start"))) {
	if (
		!Array.isArray(row.amounts) ||
		row.amounts.length !== row.exp - row.start + 1
	) {
		throw new Error(`Invalid salary duration for ${row.slug}:${row.start}`);
	}
}
for (const row of target.relatives) {
	if (!target.bios[row.slug] || !target.bios[row.slug2]) {
		throw new Error(`Relative has missing bio ${row.slug}/${row.slug2}`);
	}
}
for (const key of PROTECTED_TOP_LEVEL) {
	assertEqual(
		target[key],
		baseline[key],
		`Protected top-level field changed: ${key}`,
	);
}

const summary = (details) => ({
	changed: details.changed.length,
	added: details.added.length,
	removed: details.removed.length,
});
for (const details of Object.values(manifest.collections)) {
	details.summary = summary(details);
}
manifest.summary = {
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

const nameFor = (slug) => target.bios[slug]?.name ?? slug;
const renderValue = (value) =>
	value === undefined ? "<deleted>" : json(value);
const renderEntry = (entry) => {
	if (entry.fields) {
		return `- ${entry.key} (${nameFor(entry.slug)}) period ${entry.period}: ${entry.fields.map((field) => `${field.field}=${renderValue(field.old)} -> ${renderValue(field.new)}`).join("; ")}`;
	}
	return `- ${entry.key ?? entry.slug} (${entry.name ?? nameFor(entry.slug)}): ${json(entry.row)}`;
};
const renderSection = (title, details) =>
	[
		`## ${title}`,
		"",
		`Summary: changed ${details.changed.length}, added ${details.added.length}, removed ${details.removed.length}.`,
		"",
		"### Changed",
		details.changed.map(renderEntry).join("\n") || "- None",
		"",
		"### Added",
		details.added.map(renderEntry).join("\n") || "- None",
		"",
		"### Removed",
		details.removed.map(renderEntry).join("\n") || "- None",
		"",
	].join("\n");
const manifestText = [
	"# D49/D52 field-level manifest",
	"",
	`- Baseline commit: ${BASELINE_COMMIT}`,
	`- Fixed Official commit: ${OFFICIAL_COMMIT}`,
	`- Official repository: ${OFFICIAL_REPO}`,
	`- Current-season boundary: ${CURRENT_SEASON}`,
	"- Source duplicate policy: the last fixed-Official row for a slug/period wins.",
	"- The target is rebuilt from the fixed baseline; the worktree data file is never read as input.",
	"",
	renderSection("Teams", manifest.collections.teams),
	renderSection("Ratings", manifest.collections.ratings),
	renderSection("Salaries", manifest.collections.salaries),
	renderSection("Bios / identities", manifest.bios),
	"## Identity reference changes",
	"",
	`- Slug renames: ${manifest.slugRenames.length}`,
	`- srID changes: ${manifest.srIDChanges.length}`,
	`- Image reference changes: ${manifest.imageChanges.length}`,
	"",
	"## Protection proof",
	"",
	`The script asserts exact fixed-baseline equality for: ${PROTECTED_TOP_LEVEL.join(", ")}. It also asserts unique current keys, complete current bios, valid relatives, valid salary durations, and zero fixed-Official mismatches for all approved fields.`,
	"",
].join("\n");

fs.writeFileSync(TARGET_PATH, `${JSON.stringify(target, null, 2)}\n`);
fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
fs.writeFileSync(MANIFEST_PATH, manifestText);
console.log(
	JSON.stringify(
		{
			baseline: BASELINE_COMMIT,
			official: OFFICIAL_COMMIT,
			...manifest.summary,
		},
		null,
		2,
	),
);
