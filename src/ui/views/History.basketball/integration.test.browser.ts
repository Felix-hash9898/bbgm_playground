import { createElement, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
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
