import { useEffect, useState } from "react";
import ResponsivePopover from "../../components/ResponsivePopover.tsx";

const formatMinutes = (minutes: number) =>
	Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);

type Props = {
	pid: number;
	playerName: string;
	baseLabel: string;
	rosterDelta?: number;
	injuryDelta?: number;
	currentMinutes?: number;
	currentOverride?: number;
	unavailable?: boolean;
	error?: string;
	onCurrentOverrideChange: (minutes: number | null) => Promise<unknown>;
};

const BasketballMinutesPopover = ({
	pid,
	playerName,
	baseLabel,
	rosterDelta,
	injuryDelta,
	currentMinutes,
	currentOverride,
	unavailable = false,
	error,
	onCurrentOverrideChange,
}: Props) => {
	const [draft, setDraft] = useState(
		currentOverride === undefined ? "" : String(currentOverride),
	);
	const [saving, setSaving] = useState(false);
	const [localError, setLocalError] = useState<string | undefined>(undefined);

	useEffect(() => {
		setDraft(currentOverride === undefined ? "" : String(currentOverride));
	}, [currentOverride]);

	const formatDelta = (value: number) =>
		`${value >= 0 ? "+" : "−"}${formatMinutes(Math.abs(value))}`;
	const saveDraft = async () => {
		const value = draft.trim();
		if (value === "") {
			if (currentOverride === undefined) {
				return;
			}
			setSaving(true);
			setLocalError(undefined);
			try {
				await onCurrentOverrideChange(null);
			} catch (error_) {
				setLocalError(String(error_));
			} finally {
				setSaving(false);
			}
			return;
		}
		const parsed = Number(value);
		if (!Number.isInteger(parsed) || parsed < 0 || parsed > 48) {
			setLocalError("Enter a whole number from 0 to 48");
			return;
		}
		if (parsed === currentOverride) {
			return;
		}
		setSaving(true);
		setLocalError(undefined);
		try {
			await onCurrentOverrideChange(parsed);
		} catch (error_) {
			setLocalError(String(error_));
		} finally {
			setSaving(false);
		}
	};

	const content = (
		<div className="small" style={{ minWidth: "220px" }}>
			<div className="d-flex justify-content-between gap-3">
				<span className="text-body-secondary">Base</span>
				<span>{baseLabel}</span>
			</div>
			{rosterDelta !== undefined && Math.abs(rosterDelta) > 1e-7 ? (
				<div className="d-flex justify-content-between gap-3">
					<span className="text-body-secondary">Roster</span>
					<span>{formatDelta(rosterDelta)}</span>
				</div>
			) : null}
			{injuryDelta !== undefined && Math.abs(injuryDelta) > 1e-7 ? (
				<div className="d-flex justify-content-between gap-3">
					<span className="text-body-secondary">Injury</span>
					<span>{formatDelta(injuryDelta)}</span>
				</div>
			) : null}
			{currentMinutes !== undefined ? (
				<div className="d-flex justify-content-between gap-3">
					<span className="text-body-secondary">Current</span>
					<span>{formatMinutes(currentMinutes)}</span>
				</div>
			) : null}
			<div className="d-flex align-items-center justify-content-between gap-2 mt-2">
				<label
					htmlFor={`current-minutes-${pid}`}
					className="text-body-secondary"
				>
					Override
				</label>
				<input
					id={`current-minutes-${pid}`}
					className="form-control form-control-sm"
					type="number"
					min={0}
					max={48}
					step={1}
					placeholder="Auto"
					value={draft}
					disabled={unavailable || saving}
					onChange={(event) => {
						setLocalError(undefined);
						setDraft(event.target.value);
					}}
					onBlur={() => {
						void saveDraft();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.currentTarget.blur();
						}
					}}
					aria-label={`Current minutes override for ${playerName}`}
					style={{ width: "64px", textAlign: "center" }}
				/>
			</div>
			{unavailable ? (
				<div className="text-body-secondary mt-1">Out (injury)</div>
			) : null}
			{localError || error ? (
				<div className="text-danger mt-1">{localError ?? error}</div>
			) : null}
		</div>
	);

	return (
		<ResponsivePopover
			id={`basketball-minutes-${pid}`}
			modalHeader={`${playerName} minutes`}
			modalBody={content}
			popoverContent={content}
			renderTarget={({ onClick }) => (
				<button
					className="btn btn-link btn-sm p-0 help-icon d-inline-flex align-items-center"
					type="button"
					onClick={onClick}
					aria-label={`Explain minutes for ${playerName}`}
				>
					<span
						className="glyphicon glyphicon-question-sign"
						style={{ top: 0 }}
						aria-hidden="true"
					/>
				</button>
			)}
		/>
	);
};

export default BasketballMinutesPopover;
