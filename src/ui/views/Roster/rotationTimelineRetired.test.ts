import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// The Stage 5 court-time walk (rotationTimeline.ts) is kept as archived source
// with its own unit tests, but nothing that ships may import it: the Roster
// only shows the position minutes table.
const srcDir = path.resolve(import.meta.dirname, "../../..");

const sourceFiles = (dir: string): string[] =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			return sourceFiles(full);
		}
		return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
	});

describe("retired Stage 5 rotation timeline", () => {
	test("no shipped module imports the archived court-time walk", () => {
		const importers = sourceFiles(srcDir)
			.filter((file) => !/\.test(\.browser)?\.tsx?$/.test(file))
			.filter((file) =>
				/(?:from\s+|import\(\s*)["'][^"']*\/rotationTimeline(?:\.ts)?["']/.test(
					fs.readFileSync(file, "utf8"),
				),
			)
			.map((file) => path.relative(srcDir, file));
		expect(importers).toEqual([]);
	});

	test("the Roster mounts the position minutes section, not the old chart", () => {
		const rosterDir = path.join(srcDir, "ui/views/Roster");
		expect(fs.existsSync(path.join(rosterDir, "RotationTimeline.tsx"))).toBe(
			false,
		);
		const roster = fs.readFileSync(path.join(rosterDir, "index.tsx"), "utf8");
		expect(roster).toContain("<RosterPositionMinutes");
		expect(roster).not.toMatch(/RotationTimeline/);
		const section = fs.readFileSync(
			path.join(rosterDir, "RosterPositionMinutes.tsx"),
			"utf8",
		);
		// Its own persisted visibility key, not the retired section's
		expect(section).toContain('"Position Minutes"');
		expect(section).not.toContain('"Rotation Timeline"');
		expect(section).not.toMatch(/buildRotationTimeline/);
	});
});
