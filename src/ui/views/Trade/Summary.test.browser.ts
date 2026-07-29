import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { SummaryTeam } from "./Summary.tsx";

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

const player = (pid: number) =>
	({
		contract: { amount: 1, exp: 2027 },
		name: `Player ${pid}`,
		pid,
		ratings: { pos: "G" },
	}) as any;

const summary = {
	teams: [
		{
			name: "User",
			other: 1,
			ovrAfter: 50,
			ovrBefore: 50,
			payrollAfterTrade: 0,
			picks: [],
			total: 0,
			trade: [],
		},
		{
			name: "Other",
			other: 0,
			ovrAfter: 50,
			ovrBefore: 50,
			payrollAfterTrade: 0,
			picks: [
				{ desc: "Existing pick", dpid: 10, round: 1, season: 2027 },
				{ desc: "New pick", dpid: 11, round: 2, season: 2028 },
			],
			total: 2,
			trade: [player(1), player(2)],
		},
	],
} as any;

const render = (prevTeam?: { dpids: number[]; pids: number[] }) => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(SummaryTeam, {
				challengeNoRatings: false,
				hideFinanceInfo: true,
				hideTeamOvr: true,
				luxuryPayroll: 0,
				luxuryTax: 0,
				prevTeam: prevTeam as any,
				salaryCap: 0,
				salaryCapType: "soft",
				summary,
				t: summary.teams[0],
			}),
		);
	});
	return container;
};

test("marks only players and picks added since the previous counter-offer", () => {
	const view = render({ dpids: [10], pids: [1] });
	expect(
		view.querySelectorAll('[aria-label="New asset in counter-offer"]'),
	).toHaveLength(2);
	expect(view.textContent).toContain("Player 2");
	expect(view.textContent).toContain("New pick");
});

test("does not mark the initial/remounted trade or assets already in the snapshot", () => {
	const initial = render();
	expect(
		initial.querySelectorAll('[aria-label="New asset in counter-offer"]'),
	).toHaveLength(0);
	root!.unmount();
	initial.remove();
	root = undefined;
	container = undefined;

	const unchanged = render({ dpids: [10, 11], pids: [1, 2] });
	expect(
		unchanged.querySelectorAll('[aria-label="New asset in counter-offer"]'),
	).toHaveLength(0);
});
