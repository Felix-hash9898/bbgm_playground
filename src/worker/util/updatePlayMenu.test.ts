import { assert, test } from "vitest";
import type { Option } from "../../common/types.ts";
import { assignPlayMenuKeyboardShortcuts } from "../../common/playMenu.ts";

const makeOptions = (rows: [string, Option["keyboardShortcut"]?][]): Option[] =>
	rows.map(([id, keyboardShortcut]) => ({
		id,
		label: id,
		...(keyboardShortcut === undefined ? {} : { keyboardShortcut }),
	}));

const actionForShortcut = (options: Option[], shortcut: string) =>
	options.find((option) => option.keyboardShortcut === shortcut)?.id;

const assertUniqueShortcuts = (options: Option[]) => {
	const shortcuts = options.flatMap((option) =>
		option.keyboardShortcut === undefined ? [] : [option.keyboardShortcut],
	);
	assert.strictEqual(new Set(shortcuts).size, shortcuts.length);
};

test("All-Star event day keeps Alt+Y on One day and removes the colliding label", () => {
	const options = assignPlayMenuKeyboardShortcuts(
		makeOptions([
			["viewAllStar"],
			["day", "secondary"],
			["dayLive", "live"],
			["week", "week"],
			["month", "month"],
			["untilPlayoffs", "secondary"],
		]),
	);

	assertUniqueShortcuts(options);
	assert.strictEqual(actionForShortcut(options, "primary"), "viewAllStar");
	assert.strictEqual(actionForShortcut(options, "secondary"), "day");
	assert.strictEqual(
		options.find((option) => option.id === "untilPlayoffs")?.keyboardShortcut,
		undefined,
	);
});

test("regular season keeps Alt+P primary, Alt+W week, and Alt+Y on playoffs", () => {
	const options = assignPlayMenuKeyboardShortcuts(
		makeOptions([
			["day", "secondary"],
			["dayLive", "live"],
			["week", "week"],
			["month", "month"],
			["untilPlayoffs", "secondary"],
		]),
	);

	assertUniqueShortcuts(options);
	assert.strictEqual(actionForShortcut(options, "primary"), "day");
	assert.strictEqual(actionForShortcut(options, "week"), "week");
	assert.strictEqual(actionForShortcut(options, "secondary"), "untilPlayoffs");
});

test("phase switch and simulation Stop have unique labels and matching actions", () => {
	const afterAllStar = assignPlayMenuKeyboardShortcuts(
		makeOptions([
			["viewAllStar"],
			["day", "secondary"],
			["untilPlayoffs", "secondary"],
		]),
	);
	assertUniqueShortcuts(afterAllStar);
	assert.strictEqual(actionForShortcut(afterAllStar, "primary"), "viewAllStar");
	assert.strictEqual(actionForShortcut(afterAllStar, "secondary"), "day");

	const stop = assignPlayMenuKeyboardShortcuts(makeOptions([["stop"]]));
	assertUniqueShortcuts(stop);
	assert.strictEqual(actionForShortcut(stop, "primary"), "stop");
});

test("shared-menu non-basketball options also have unique shortcuts", () => {
	const footballRegularSeason = assignPlayMenuKeyboardShortcuts(
		makeOptions([
			["week", "week"],
			["dayLive", "live"],
			["month", "month"],
			["untilTradeDeadline", "tradeDeadline"],
			["untilPlayoffs", "secondary"],
		]),
	);

	assertUniqueShortcuts(footballRegularSeason);
	assert.strictEqual(
		actionForShortcut(footballRegularSeason, "primary"),
		"week",
	);
	assert.strictEqual(
		actionForShortcut(footballRegularSeason, "tradeDeadline"),
		"untilTradeDeadline",
	);
	assert.strictEqual(
		actionForShortcut(footballRegularSeason, "secondary"),
		"untilPlayoffs",
	);
});
