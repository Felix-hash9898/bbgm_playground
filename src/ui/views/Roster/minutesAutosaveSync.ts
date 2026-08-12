export const serializeMinutesByPid = (
	minutesByPid: Record<number, unknown> | undefined,
) =>
	JSON.stringify(
		Object.fromEntries(
			Object.entries(minutesByPid ?? {})
				.sort(([pidA], [pidB]) => Number(pidA) - Number(pidB))
				.map(([pid, value]) => [pid, String(value)]),
		),
	);

export const shouldPreserveLocalMinutesDraft = ({
	tidChanged,
	rosterChanged = false,
	incomingMode,
	incomingMinutesKey,
	localMinutesKey,
	ownWriteKeys,
	autoResetPending,
}: {
	tidChanged: boolean;
	rosterChanged?: boolean;
	incomingMode: "auto" | "custom" | undefined;
	incomingMinutesKey: string;
	localMinutesKey: string;
	ownWriteKeys: ReadonlySet<string>;
	autoResetPending: boolean;
}) => {
	if (tidChanged || rosterChanged) {
		return false;
	}

	// The user's Auto request is authoritative while its server refresh is in
	// flight. A stale custom response must not restore an older draft.
	if (autoResetPending) {
		return incomingMode !== "auto";
	}

	// A server echo for a write that is already in flight is safe only when it
	// matches the current local draft. Otherwise it is an older response.
	return (
		incomingMinutesKey !== localMinutesKey &&
		ownWriteKeys.has(incomingMinutesKey)
	);
};
