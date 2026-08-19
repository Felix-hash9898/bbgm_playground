import { describe, expect, test } from "vitest";
import {
	getPlayerSectionId,
	getPlayerStatsSectionId,
} from "./SectionNavigation.tsx";

describe("player section anchors", () => {
	test("creates stable readable anchors", () => {
		expect(getPlayerSectionId("Per 36")).toBe("player-section-per-36");
		expect(getPlayerSectionId("Statistical Feats")).toBe(
			"player-section-statistical-feats",
		);
	});

	test("keeps stat-table anchors distinct even when labels collide", () => {
		expect(getPlayerStatsSectionId("Advanced", 0)).toBe(
			"player-section-stats-advanced-0",
		);
		expect(getPlayerStatsSectionId("Advanced", 1)).not.toBe(
			getPlayerStatsSectionId("Advanced", 0),
		);
	});
});
