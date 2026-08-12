import { useEffect, useRef, useState } from "react";
import {
	serializeMinutesByPid,
	shouldPreserveLocalMinutesDraft,
} from "./minutesAutosaveSync.ts";

export type BasketballMinutesView = {
	mode: "auto" | "custom";
	minutesByPid: Record<number, number>;
	autoMinutesByPid?: Record<number, number>;
	required: number;
};

type PlayerWithPid = {
	pid: number;
};

type Props = {
	basketballMinutes: BasketballMinutesView | undefined;
	players: PlayerWithPid[];
	editable: boolean;
	tid: number;
	saveCustomPlan: (
		tid: number,
		minutesByPid: Record<number, number>,
	) => Promise<unknown>;
	resetToAuto: (tid: number) => Promise<unknown>;
	onError: (error: unknown) => void;
};

export const useBasketballMinutesAutosave = ({
	basketballMinutes,
	players,
	editable,
	tid,
	saveCustomPlan,
	resetToAuto,
	onError,
}: Props) => {
	const [minutesDraft, setMinutesDraft] = useState<Record<number, string>>({});
	const [minutesSaveStatus, setMinutesSaveStatus] = useState<
		"idle" | "saving" | "saved"
	>("idle");
	const minutesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const minutesSaveVersionRef = useRef(0);
	const minutesSaveQueueRef = useRef(Promise.resolve());
	const autoResetVersionRef = useRef<number | undefined>(undefined);
	const ownWriteKeysRef = useRef(new Set<string>());
	const previousTidRef = useRef(tid);
	const previousRosterPidsKeyRef = useRef<string | undefined>(undefined);
	const skipAutosaveVersionRef = useRef<number | undefined>(undefined);
	const basketballMinutesKey = JSON.stringify(basketballMinutes ?? null);
	const playerPids = players.map((p) => p.pid);
	const playerPidsKey = JSON.stringify(playerPids);
	const rosterPidsKey = JSON.stringify([...playerPids].sort((a, b) => a - b));
	const minutesDraftKey = serializeMinutesByPid(minutesDraft);
	const minutesDraftKeyRef = useRef(minutesDraftKey);
	minutesDraftKeyRef.current = minutesDraftKey;

	useEffect(() => {
		const source = JSON.parse(
			basketballMinutesKey,
		) as BasketballMinutesView | null;
		const incomingMinutesKey = serializeMinutesByPid(source?.minutesByPid);
		const tidChanged = previousTidRef.current !== tid;
		const rosterChanged =
			previousRosterPidsKeyRef.current !== undefined &&
			previousRosterPidsKeyRef.current !== rosterPidsKey;
		const autoResetPending =
			autoResetVersionRef.current === minutesSaveVersionRef.current;
		if (
			shouldPreserveLocalMinutesDraft({
				tidChanged,
				rosterChanged,
				incomingMode: source?.mode,
				incomingMinutesKey,
				localMinutesKey: minutesDraftKeyRef.current,
				ownWriteKeys: ownWriteKeysRef.current,
				autoResetPending,
			})
		) {
			return;
		}

		previousTidRef.current = tid;
		previousRosterPidsKeyRef.current = rosterPidsKey;
		minutesSaveVersionRef.current += 1;
		skipAutosaveVersionRef.current = minutesSaveVersionRef.current;
		if (minutesSaveTimerRef.current !== undefined) {
			clearTimeout(minutesSaveTimerRef.current);
			minutesSaveTimerRef.current = undefined;
		}
		setMinutesDraft(
			Object.fromEntries(
				Object.entries(source?.minutesByPid ?? {}).map(([pid, value]) => [
					Number(pid),
					String(value),
				]),
			),
		);
		setMinutesSaveStatus("idle");
		ownWriteKeysRef.current.clear();
		if (source?.mode === "auto") {
			autoResetVersionRef.current = undefined;
		}
	}, [basketballMinutesKey, playerPidsKey, rosterPidsKey, tid]);

	const parsedMinutes = Object.fromEntries(
		playerPids.map((pid) => {
			const raw = minutesDraft[pid];
			return [
				pid,
				raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw),
			];
		}),
	) as Record<number, number>;
	const plannedMinutesTotal = Object.values(parsedMinutes).reduce(
		(total, value) => total + (Number.isFinite(value) ? value : 0),
		0,
	);
	const plannedMinutesValid =
		basketballMinutes !== undefined &&
		playerPids.every((pid) => {
			const value = parsedMinutes[pid];
			return (
				typeof value === "number" &&
				Number.isFinite(value) &&
				Number.isInteger(value) &&
				value >= 0 &&
				value <= 48
			);
		}) &&
		plannedMinutesTotal === basketballMinutes.required;
	const plannedMinutesChanged =
		basketballMinutes !== undefined &&
		playerPids.some(
			(pid) => parsedMinutes[pid] !== basketballMinutes.minutesByPid[pid],
		);
	const parsedMinutesKey = JSON.stringify(parsedMinutes);

	useEffect(() => {
		const source = JSON.parse(
			basketballMinutesKey,
		) as BasketballMinutesView | null;
		if (
			!editable ||
			!source ||
			!plannedMinutesValid ||
			!plannedMinutesChanged
		) {
			return;
		}

		const version = minutesSaveVersionRef.current;
		if (skipAutosaveVersionRef.current === version) {
			skipAutosaveVersionRef.current = undefined;
			return;
		}
		if (autoResetVersionRef.current === version) {
			if (source.mode === "auto") {
				autoResetVersionRef.current = undefined;
			}
			return;
		}

		if (minutesSaveTimerRef.current !== undefined) {
			clearTimeout(minutesSaveTimerRef.current);
		}

		const payload = JSON.parse(parsedMinutesKey) as Record<number, number>;
		const payloadKey = serializeMinutesByPid(payload);
		minutesSaveTimerRef.current = setTimeout(() => {
			minutesSaveTimerRef.current = undefined;
			minutesSaveQueueRef.current = minutesSaveQueueRef.current.then(
				async () => {
					if (version !== minutesSaveVersionRef.current) {
						return;
					}
					ownWriteKeysRef.current.add(payloadKey);
					setMinutesSaveStatus("saving");
					try {
						await saveCustomPlan(tid, payload);
						if (version === minutesSaveVersionRef.current) {
							setMinutesSaveStatus("saved");
						}
					} catch (error) {
						ownWriteKeysRef.current.delete(payloadKey);
						if (version === minutesSaveVersionRef.current) {
							setMinutesSaveStatus("idle");
							onError(error);
						}
					}
				},
			);
		}, 300);

		return () => {
			if (minutesSaveTimerRef.current !== undefined) {
				clearTimeout(minutesSaveTimerRef.current);
				minutesSaveTimerRef.current = undefined;
			}
		};
	}, [
		basketballMinutesKey,
		editable,
		parsedMinutesKey,
		plannedMinutesChanged,
		plannedMinutesValid,
		playerPidsKey,
		saveCustomPlan,
		tid,
		onError,
	]);

	const handleMinutesChange = (pid: number, value: string) => {
		minutesSaveVersionRef.current += 1;
		skipAutosaveVersionRef.current = undefined;
		setMinutesSaveStatus("idle");
		setMinutesDraft((current) => ({
			...current,
			[pid]: value,
		}));
	};

	const handleAutoMinutes = () => {
		if (!basketballMinutes) {
			return;
		}
		const version = ++minutesSaveVersionRef.current;
		autoResetVersionRef.current = version;
		skipAutosaveVersionRef.current = undefined;
		if (minutesSaveTimerRef.current !== undefined) {
			clearTimeout(minutesSaveTimerRef.current);
			minutesSaveTimerRef.current = undefined;
		}

		const autoMinutes =
			basketballMinutes.autoMinutesByPid ?? basketballMinutes.minutesByPid;
		setMinutesDraft(
			Object.fromEntries(
				playerPids.map((pid) => [pid, String(autoMinutes[pid] ?? 0)]),
			),
		);
		setMinutesSaveStatus("saving");
		minutesSaveQueueRef.current = minutesSaveQueueRef.current.then(async () => {
			if (version !== minutesSaveVersionRef.current) {
				return;
			}
			try {
				await resetToAuto(tid);
				if (version === minutesSaveVersionRef.current) {
					setMinutesSaveStatus("saved");
				}
			} catch (error) {
				if (version === minutesSaveVersionRef.current) {
					autoResetVersionRef.current = undefined;
					setMinutesSaveStatus("idle");
					onError(error);
				}
			}
		});
	};

	return {
		minutesDraft,
		plannedMinutesTotal,
		plannedMinutesValid,
		plannedMinutesChanged,
		minutesSaveStatus,
		autoResetPending:
			autoResetVersionRef.current === minutesSaveVersionRef.current,
		handleMinutesChange,
		handleAutoMinutes,
	};
};
