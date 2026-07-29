import { assert, beforeEach, test, vi } from "vitest";

const get = vi.fn(async (key: string) =>
	key === "realPlayerPhotos"
		? { sr1: 1 }
		: { LV: { seasons: { "2029": { seasons: {} } } } },
);
const showEvent = vi.fn();

vi.mock("../../../db/index.ts", () => ({
	idb: {
		meta: {
			transaction: vi.fn(async () => ({ store: { get } })),
		},
	},
}));
vi.mock("../../../util/toUI.ts", () => ({ default: showEvent }));

let getRealTeamPlayerData: typeof import("./getRealTeamPlayerData.ts").default;

beforeEach(async () => {
	vi.resetModules();
	getRealTeamPlayerData = (await import("./getRealTeamPlayerData.ts")).default;
});

beforeEach(() => {
	get.mockClear();
	showEvent.mockClear();
});

test("invalid stored real metadata is ignored and shown to the user", async () => {
	const result = await getRealTeamPlayerData({
		fileHasPlayers: true,
		fileHasTeams: true,
	});
	assert.strictEqual(result.realPlayerPhotos, undefined);
	assert.strictEqual(result.realTeamInfo, undefined);
	assert.strictEqual(showEvent.mock.calls.length, 2);
	assert(
		showEvent.mock.calls.every(
			([name, args]) => name === "showEvent" && args[0].type === "error",
		),
	);
});
