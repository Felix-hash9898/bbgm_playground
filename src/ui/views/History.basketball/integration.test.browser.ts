import { createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import RetiredPlayers from "../../components/RetiredPlayers.tsx";
import AwardsAndChamp from "./AwardsAndChamp.tsx";

vi.mock("@bugsnag/browser", () => {
	const getPlugin = () => ({
		createErrorBoundary:
			() =>
			({ children }: { children: unknown }) =>
				children,
	});
	return { default: { getPlugin }, getPlugin };
});

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
	root?.unmount();
	container?.remove();
	root = undefined;
	container = undefined;
});

const render = (element: ReactNode) => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(element);
	});
	return container;
};

const emptyAwards = {
	bestRecordConfs: [],
	dpoy: undefined,
	finalsMvp: undefined,
	mip: undefined,
	mvp: undefined,
	roy: undefined,
	sfmvp: undefined,
	smoy: undefined,
};

test("History renders safely with zero or one conference", () => {
	const zero = render(
		createElement(AwardsAndChamp, {
			awards: emptyAwards as any,
			champ: undefined,
			confs: [] as any,
			season: 2026,
			userTid: 0,
		}),
	);
	expect(zero.textContent).toContain("Best Record");
	root!.unmount();
	zero.remove();
	root = undefined;
	container = undefined;

	const one = render(
		createElement(AwardsAndChamp, {
			awards: {
				...emptyAwards,
				bestRecordConfs: [
					{
						abbrev: "ATL",
						lost: 20,
						name: "Gold",
						otl: 0,
						region: "Atlanta",
						tid: 0,
						tied: 0,
						won: 62,
					},
				],
			} as any,
			champ: undefined,
			confs: [{ cid: 0, name: "Eastern Conference" }],
			season: 2026,
			userTid: 0,
		}),
	);
	expect(one.textContent).toContain("Eastern Conference");
	expect(one.textContent).toContain("Atlanta Gold");
});

test("Retired Players distinguishes unknown, zero, and known career WS", () => {
	const view = render(
		createElement(RetiredPlayers, {
			retiredPlayers: [
				{
					age: 40,
					hof: false,
					name: "Unknown",
					pid: 1,
					ratings: { pos: "G" },
					stats: { abbrev: "ATL", tid: 0 },
				},
				{
					age: 39,
					hof: false,
					name: "Zero",
					pid: 2,
					ratings: { pos: "F" },
					stats: { abbrev: "BOS", tid: 1 },
					ws: 0,
				},
				{
					age: 38,
					hof: false,
					name: "Known",
					pid: 3,
					ratings: { pos: "C" },
					stats: { abbrev: "CHI", tid: 2 },
					ws: 12.34,
				},
			],
			season: 2026,
			userTid: 0,
		}),
	);
	expect(view.textContent).toContain("Unknown (ATL, age: 40; WS: —)");
	expect(view.textContent).toContain("Zero (BOS, age: 39; WS: 0.0)");
	expect(view.textContent).toContain("Known (CHI, age: 38; WS: 12.3)");
});
