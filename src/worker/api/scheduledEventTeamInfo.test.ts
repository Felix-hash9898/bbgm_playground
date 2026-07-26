import { describe, expect, test } from "vitest";
import { deleteScheduledTeamInfoFields } from "./scheduledEventTeamInfo.ts";

describe("scheduled team-info deletion", () => {
	test("deletes all known team-info fields including stadiumCapacity", () => {
		const info = {
			tid: 1,
			srID: "ATL",
			cid: 0,
			did: 1,
			region: "Atlanta",
			name: "Gold Club",
			stadiumCapacity: 30000,
			playgroundCustomField: "keep",
		};

		expect(deleteScheduledTeamInfoFields(info, "teamInfo")).toBe(true);
		expect(info).toEqual({
			tid: 1,
			srID: "ATL",
			cid: 0,
			did: 1,
			playgroundCustomField: "keep",
		});
	});

	test("conference deletion only removes cid/did", () => {
		const info = { tid: 1, cid: 0, did: 1, stadiumCapacity: 30000 };
		expect(deleteScheduledTeamInfoFields(info, "confs")).toBe(true);
		expect(info).toEqual({ tid: 1, stadiumCapacity: 30000 });
	});
});
