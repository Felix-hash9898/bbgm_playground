import clsx from "clsx";
import { useMemo } from "react";
import useLocalStorageState from "use-local-storage-state";
import HideableSection from "../../components/HideableSection.tsx";
import RotationPositionMinutes from "./RotationPositionMinutes.tsx";
import {
	buildEstimatedPositionMinutes,
	getVisiblePositionRatings,
	type PositionRatings,
} from "./rotationPositions.ts";
import { useLocalPartial } from "../../util/index.ts";

type PositionMinutesPlayer = {
	pid: number;
	firstName: string;
	lastName: string;
	ratings: {
		pos: string;
	} & Partial<PositionRatings>;
};

export type PositionMinutesPlan = "healthy" | "current";

// Section title. HideableSection derives its persisted key from it
// ("show-roster-Position Minutes"), which is deliberately not the key of the
// retired Rotation Timeline section: hiding that old chart must not hide
// this table.
export const POSITION_MINUTES_SECTION_TITLE = "Position Minutes";

const formatTotal = (minutes: number) =>
	Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);

const RosterPositionMinutes = ({
	players,
	healthyMinutesByPid,
	currentMinutesByPid,
	currentPending,
	ratingsVisible = false,
	readonlyPreview = false,
	numPlayersOnCourt,
}: {
	// Roster order
	players: PositionMinutesPlayer[];
	// Live Roster draft. NaN marks an input that is not a valid number.
	// Undefined while the saved plan is being replaced.
	healthyMinutesByPid: Record<number, number> | undefined;
	// Injury/availability/override adjusted minutes for the next game, on the
	// scale of the league's regulation length. Undefined when there is none.
	currentMinutesByPid: Record<number, number> | undefined;
	// True while an edit is not saved yet, so the current plan is out of date
	currentPending: boolean;
	// Explicit viewer permission; spectator/god mode never overrides this.
	ratingsVisible?: boolean;
	readonlyPreview?: boolean;
	numPlayersOnCourt: number;
}) => {
	const local = useLocalPartial(["numPeriods", "quarterLength"]);
	const numPeriods = local.numPeriods ?? 4;
	const quarterLength = local.quarterLength ?? 12;
	// Which plan is shown is a preference, not visibility, so the existing key
	// is kept and a remembered Healthy/Current choice survives.
	const [plan, setPlan] = useLocalStorageState<PositionMinutesPlan>(
		"roster-rotation-timeline-plan",
		{ defaultValue: "healthy" },
	);

	const selectedPlan: PositionMinutesPlan =
		plan === "current" ? "current" : "healthy";
	const minutesByPid =
		selectedPlan === "healthy"
			? healthyMinutesByPid
			: currentPending
				? undefined
				: currentMinutesByPid;
	// The healthy plan is always entered on a 48 minute scale. The current plan
	// is scaled to the league's regulation length, like it is in games.
	const gameMinutes =
		selectedPlan === "healthy" ? 48 : quarterLength * numPeriods;

	// A string key makes the memo depend on values, not on object identity
	const inputKey = minutesByPid
		? JSON.stringify(
				players.map((p) => [p.pid, p.ratings.pos, minutesByPid[p.pid] ?? 0]),
			)
		: undefined;
	// Never serialize hidden numeric ratings into a memo key or allocation.
	const ratingsKey = ratingsVisible
		? JSON.stringify(
				players.map((p) => [p.pid, getVisiblePositionRatings(true, p.ratings)]),
			)
		: undefined;
	const result = useMemo(() => {
		if (inputKey === undefined) {
			return undefined;
		}
		// JSON turns NaN into null. Restore it to reject incomplete edits.
		const input = JSON.parse(inputKey) as [number, string, number | null][];
		const visible = new Map<number, PositionRatings | undefined>(
			ratingsKey ? JSON.parse(ratingsKey) : [],
		);
		const minutes = input.map(([, , value]) => value ?? Number.NaN);
		return {
			plannedTotal: minutes.reduce((sum, value) => sum + value, 0),
			allocation: buildEstimatedPositionMinutes({
				players: input.map(([pid, pos]) => ({
					pid,
					pos,
					visibleRatings: visible.get(pid),
				})),
				minutesByPid: Object.fromEntries(
					input.map(([pid], i) => [pid, minutes[i]!]),
				),
				numPlayersOnCourt,
				gameMinutes,
				ratingsVisible,
			}),
		};
	}, [inputKey, ratingsKey, ratingsVisible, numPlayersOnCourt, gameMinutes]);
	const allocation = result?.allocation;

	let body;
	if (allocation === undefined) {
		body = (
			<div
				className="text-body-secondary small"
				role="status"
				data-testid="rotation-position-pending"
			>
				{selectedPlan === "healthy"
					? "Updating the plan…"
					: currentPending
						? "Current plan updates when the minutes plan is saved."
						: "No current plan is available for the next game."}
			</div>
		);
	} else if (!allocation.valid) {
		// An incomplete or mistyped plan is the user's to fix; game settings
		// without five positions are not an error.
		const planError =
			allocation.reason === "minutes" || allocation.reason === "total";
		const requiredTotal = numPlayersOnCourt * gameMinutes;
		body = (
			<div
				className={clsx(
					"small",
					planError ? "text-danger" : "text-body-secondary",
				)}
				role="status"
				data-testid="rotation-position-unavailable"
			>
				{allocation.reason === "total" &&
				Math.abs(result!.plannedTotal - requiredTotal) * 60 > 1
					? `Planned minutes total ${formatTotal(result!.plannedTotal)}, but position estimates need exactly ${formatTotal(requiredTotal)}.`
					: allocation.message}
			</div>
		);
	} else {
		body = (
			<RotationPositionMinutes allocation={allocation} players={players} />
		);
	}

	return (
		<HideableSection pageName="roster" title={POSITION_MINUTES_SECTION_TITLE}>
			<div
				className="mb-3"
				style={{ maxWidth: 760 }}
				data-testid="roster-position-minutes-section"
			>
				<div
					className="btn-group mb-1"
					role="group"
					aria-label="Plan shown in the position minutes table"
				>
					{(
						[
							["healthy", "Healthy plan"],
							["current", "Current plan"],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							type="button"
							className={clsx(
								"btn btn-xs",
								selectedPlan === key ? "btn-primary" : "btn-light-bordered",
							)}
							aria-pressed={selectedPlan === key}
							onClick={() => {
								setPlan(key);
							}}
						>
							{label}
						</button>
					))}
				</div>
				{readonlyPreview ? (
					<div
						className="small text-body-secondary mb-1"
						data-testid="rotation-position-preview"
					>
						Read-only plan preview from visible information.
					</div>
				) : null}
				{body}
			</div>
		</HideableSection>
	);
};

export default RosterPositionMinutes;
