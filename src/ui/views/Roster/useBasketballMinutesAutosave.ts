import { useCallback, useEffect, useRef, useState } from "react";
import {
	serializeMinutesByPid,
	shouldPreserveLocalMinutesDraft,
} from "./minutesAutosaveSync.ts";

export type BasketballMinutesView = {
	mode: "auto" | "custom";
	minutesByPid: Record<number, number>;
	healthyMinutesByPid?: Record<number, number>;
	autoMinutesByPid?: Record<number, number>;
	previewReady?: boolean;
	gameReady?: boolean;
	rotationDepth?: "short" | "normal" | "long";
	coreReliance?: "high" | "balanced" | "low";
	autoFilledPids?: number[];
	rosterAutoFillActive?: boolean;
	rosterOverlayByPid?: Record<number, number>;
	noInjuryMinutesIncreasePids?: number[];
	effectiveMinutesByPid?: Record<number, number>;
	protectionOverridePids?: number[];
	currentMinutesOverrideByPid?: Record<number, number>;
	currentMinutesOverrideError?: string;
	unavailablePids?: number[];
	required: number;
};

type PlayerWithPid = {
	pid: number;
};

type PendingMinutesSave = {
	version: number;
	payload: Record<number, number>;
	payloadKey: string;
	explicitPids: number[];
};

type Props = {
	basketballMinutes: BasketballMinutesView | undefined;
	players: PlayerWithPid[];
	editable: boolean;
	tid: number;
	saveCustomPlan: (
		tid: number,
		minutesByPid: Record<number, number>,
		explicitPids?: number[],
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
	const pendingMinutesSaveRef = useRef<PendingMinutesSave | undefined>(
		undefined,
	);
	const pendingLocalDraftKeyRef = useRef<string | undefined>(undefined);
	const explicitDraftPidsRef = useRef(new Set<number>());
	const pendingAutoEditPidsRef = useRef(new Set<number>());
	const minutesDraftRef = useRef(minutesDraft);
	minutesDraftRef.current = minutesDraft;
	const saveCustomPlanRef = useRef(saveCustomPlan);
	saveCustomPlanRef.current = saveCustomPlan;
	const tidRef = useRef(tid);
	tidRef.current = tid;
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;
	// Derived injury-preview fields change frequently. They must not look like a
	// new server draft and erase an unrelated local edit while the preview is
	// refreshing.
	const basketballMinutesKey = JSON.stringify(
		basketballMinutes
			? {
					mode: basketballMinutes.mode,
					minutesByPid: basketballMinutes.minutesByPid,
					autoFilledPids: basketballMinutes.autoFilledPids,
					rosterAutoFillActive: basketballMinutes.rosterAutoFillActive,
				}
			: null,
	);
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
				localDraftPending: pendingLocalDraftKeyRef.current !== undefined,
			})
		) {
			return;
		}

		previousTidRef.current = tid;
		previousRosterPidsKeyRef.current = rosterPidsKey;
		explicitDraftPidsRef.current.clear();
		pendingAutoEditPidsRef.current.clear();
		pendingMinutesSaveRef.current = undefined;
		pendingLocalDraftKeyRef.current = undefined;
		minutesSaveVersionRef.current += 1;
		skipAutosaveVersionRef.current = minutesSaveVersionRef.current;
		if (minutesSaveTimerRef.current !== undefined) {
			clearTimeout(minutesSaveTimerRef.current);
			minutesSaveTimerRef.current = undefined;
		}
		const nextMinutesDraft = Object.fromEntries(
			Object.entries(source?.minutesByPid ?? {}).map(([pid, value]) => [
				Number(pid),
				String(value),
			]),
		);
		minutesDraftRef.current = nextMinutesDraft;
		setMinutesDraft(nextMinutesDraft);
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
	const parsedMinutesTotal = Object.values(parsedMinutes).reduce(
		(total, value) => total + (Number.isFinite(value) ? value : 0),
		0,
	);
	const plannedMinutesTotal = basketballMinutes?.healthyMinutesByPid
		? Object.values(basketballMinutes.healthyMinutesByPid).reduce(
				(total, value) => total + value,
				0,
			)
		: parsedMinutesTotal;
	const plannedMinutesInputsValid =
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
		});
	const sourceAutoFilledPids = new Set(basketballMinutes?.autoFilledPids ?? []);
	const ownershipChanged = [...explicitDraftPidsRef.current].some((pid) =>
		sourceAutoFilledPids.has(pid),
	);
	const plannedMinutesValid =
		plannedMinutesInputsValid &&
		plannedMinutesTotal === basketballMinutes?.required;
	const plannedMinutesChanged =
		basketballMinutes !== undefined &&
		(ownershipChanged ||
			playerPids.some(
				(pid) => parsedMinutes[pid] !== basketballMinutes.minutesByPid[pid],
			));
	const parsedMinutesKey = JSON.stringify(parsedMinutes);

	const enqueueMinutesSave = useCallback((pending: PendingMinutesSave) => {
		if (pending.version !== minutesSaveVersionRef.current) {
			return;
		}
		ownWriteKeysRef.current.add(pending.payloadKey);
		setMinutesSaveStatus("saving");
		minutesSaveQueueRef.current = minutesSaveQueueRef.current.then(async () => {
			if (pending.version !== minutesSaveVersionRef.current) {
				return;
			}
			try {
				await saveCustomPlanRef.current(
					tidRef.current,
					pending.payload,
					pending.explicitPids,
				);
				if (pending.version === minutesSaveVersionRef.current) {
					setMinutesSaveStatus("saved");
				}
			} catch (error) {
				ownWriteKeysRef.current.delete(pending.payloadKey);
				if (pendingLocalDraftKeyRef.current === pending.payloadKey) {
					pendingLocalDraftKeyRef.current = undefined;
				}
				if (pending.version === minutesSaveVersionRef.current) {
					setMinutesSaveStatus("idle");
					onErrorRef.current(error);
				}
			}
		});
	}, []);

	useEffect(() => {
		const source = JSON.parse(
			basketballMinutesKey,
		) as BasketballMinutesView | null;
		if (
			!editable ||
			!source ||
			!plannedMinutesInputsValid ||
			!plannedMinutesChanged
		) {
			pendingMinutesSaveRef.current = undefined;
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
			minutesSaveTimerRef.current = undefined;
		}

		const payload = JSON.parse(parsedMinutesKey) as Record<number, number>;
		const payloadKey = serializeMinutesByPid(payload);
		const pending = {
			version,
			payload,
			payloadKey,
			explicitPids: [...explicitDraftPidsRef.current],
		};
		pendingMinutesSaveRef.current = pending;
		minutesSaveTimerRef.current = setTimeout(() => {
			minutesSaveTimerRef.current = undefined;
			const currentPending = pendingMinutesSaveRef.current;
			if (currentPending?.version !== version) {
				return;
			}
			pendingMinutesSaveRef.current = undefined;
			enqueueMinutesSave(currentPending);
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
		plannedMinutesInputsValid,
		rosterPidsKey,
		enqueueMinutesSave,
	]);

	useEffect(() => {
		return () => {
			if (minutesSaveTimerRef.current !== undefined) {
				clearTimeout(minutesSaveTimerRef.current);
				minutesSaveTimerRef.current = undefined;
			}
			const pending = pendingMinutesSaveRef.current;
			pendingMinutesSaveRef.current = undefined;
			if (pending) {
				enqueueMinutesSave(pending);
			}
		};
	}, [enqueueMinutesSave]);

	const handleMinutesChange = (pid: number, value: string) => {
		const version = ++minutesSaveVersionRef.current;
		skipAutosaveVersionRef.current = undefined;
		pendingAutoEditPidsRef.current.delete(pid);
		setMinutesSaveStatus("idle");
		const nextMinutesDraft = {
			...minutesDraftRef.current,
			[pid]: value,
		};
		explicitDraftPidsRef.current.add(pid);
		minutesDraftRef.current = nextMinutesDraft;
		const completeDraft =
			basketballMinutes !== undefined &&
			playerPids.every((draftPid) => {
				const raw = nextMinutesDraft[draftPid];
				if (raw === undefined || raw.trim() === "") {
					return false;
				}
				const parsed = Number(raw);
				return (
					Number.isFinite(parsed) &&
					Number.isInteger(parsed) &&
					parsed >= 0 &&
					parsed <= 48
				);
			});
		if (completeDraft) {
			const payload = Object.fromEntries(
				playerPids.map((draftPid) => [
					draftPid,
					Number(nextMinutesDraft[draftPid]),
				]),
			) as Record<number, number>;
			const payloadKey = serializeMinutesByPid(payload);
			pendingLocalDraftKeyRef.current = payloadKey;
			pendingMinutesSaveRef.current = {
				version,
				payload,
				payloadKey,
				explicitPids: [...explicitDraftPidsRef.current],
			};
		} else {
			pendingLocalDraftKeyRef.current = undefined;
			pendingMinutesSaveRef.current = undefined;
			if (minutesSaveTimerRef.current !== undefined) {
				clearTimeout(minutesSaveTimerRef.current);
				minutesSaveTimerRef.current = undefined;
			}
		}
		setMinutesDraft(nextMinutesDraft);
	};

	const handleAutoMinutesFocus = (pid: number) => {
		pendingAutoEditPidsRef.current.add(pid);
		const nextMinutesDraft = {
			...minutesDraftRef.current,
			[pid]: "",
		};
		minutesDraftRef.current = nextMinutesDraft;
		setMinutesDraft(nextMinutesDraft);
	};

	const handleAutoMinutesBlur = (pid: number) => {
		pendingAutoEditPidsRef.current.delete(pid);
		if (explicitDraftPidsRef.current.has(pid)) {
			return;
		}
		const sourceValue = basketballMinutes?.minutesByPid[pid];
		if (sourceValue === undefined) {
			return;
		}
		const nextMinutesDraft = {
			...minutesDraftRef.current,
			[pid]: String(sourceValue),
		};
		minutesDraftRef.current = nextMinutesDraft;
		setMinutesDraft(nextMinutesDraft);
	};

	const handleAutoMinutes = () => {
		if (!basketballMinutes) {
			return;
		}
		const version = ++minutesSaveVersionRef.current;
		autoResetVersionRef.current = version;
		skipAutosaveVersionRef.current = undefined;
		pendingLocalDraftKeyRef.current = undefined;
		explicitDraftPidsRef.current.clear();
		pendingAutoEditPidsRef.current.clear();
		pendingMinutesSaveRef.current = undefined;
		if (minutesSaveTimerRef.current !== undefined) {
			clearTimeout(minutesSaveTimerRef.current);
			minutesSaveTimerRef.current = undefined;
		}

		const autoMinutes =
			basketballMinutes.autoMinutesByPid ?? basketballMinutes.minutesByPid;
		const nextMinutesDraft = Object.fromEntries(
			playerPids.map((pid) => [pid, String(autoMinutes[pid] ?? 0)]),
		);
		minutesDraftRef.current = nextMinutesDraft;
		setMinutesDraft(nextMinutesDraft);
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
		autoFilledPids: new Set(
			playerPids.filter(
				(pid) =>
					sourceAutoFilledPids.has(pid) &&
					!explicitDraftPidsRef.current.has(pid),
			),
		),
		autoResetPending:
			autoResetVersionRef.current === minutesSaveVersionRef.current,
		handleMinutesChange,
		handleAutoMinutesFocus,
		handleAutoMinutesBlur,
		handleAutoMinutes,
	};
};
