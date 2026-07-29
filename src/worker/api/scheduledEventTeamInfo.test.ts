import { describe, expect, test } from "vitest";
import { deleteScheduledTeamInfoFields } from "./scheduledEventTeamInfo.ts";

describe("scheduled team-info deletion", () => {
	test("deletes every team-info field, including unknown future fields", () => {
		const info = {
			tid: 1,
			srID: "ATL",
			cid: 0,
			did: 1,
			region: "Atlanta",
			name: "Gold Club",
			abbrev: "ATL",
			colors: ["#000000", "#ffffff", "#ff0000"] as [string, string, string],
			jersey: "jersey4",
			imgURL: "https://example.com/large.png",
			imgURLSmall: "https://example.com/small.png",
			pop: 5,
			stadiumCapacity: 30000,
			futureOfficialField: "remove",
		};

		expect(deleteScheduledTeamInfoFields(info, "teamInfo")).toBe(true);
		expect(info).toEqual({
			tid: 1,
			srID: "ATL",
		});
	});

	test("conference deletion only removes cid/did", () => {
		const info = {
			tid: 1,
			cid: 0,
			did: 1,
			stadiumCapacity: 30000,
			futureOfficialField: "keep",
		};
		expect(deleteScheduledTeamInfoFields(info, "confs")).toBe(true);
		expect(info).toEqual({
			tid: 1,
			stadiumCapacity: 30000,
			futureOfficialField: "keep",
		});
	});
});
