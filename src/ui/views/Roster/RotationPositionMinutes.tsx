import {
	ROTATION_POSITIONS,
	getPositionMinutesDisplay,
	type EstimatedPositionMinutes,
} from "./rotationPositions.ts";

const formatSeconds = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const RotationPositionMinutes = ({
	allocation,
	players,
}: {
	allocation: Extract<EstimatedPositionMinutes, { valid: true }>;
	players: {
		pid: number;
		firstName: string;
		lastName: string;
	}[];
}) => {
	const display = getPositionMinutesDisplay(allocation);
	const displayedByPid = new Map(display.rows.map((r) => [r.pid, r]));
	const format = (value: number) =>
		display.wholeMinutes ? String(value) : formatSeconds(value);
	// Displayed minutes at each position from players not listed there. G, GF,
	// F and FC are listed at both of their positions. Each cell counts once.
	const markedByPosition = (kind: "outside" | "unknown") =>
		Object.fromEntries(
			ROTATION_POSITIONS.map((p) => [
				p,
				allocation.rows.reduce(
					(sum, row) =>
						sum +
						(row.fit[p] === kind ? displayedByPid.get(row.pid)!.values[p] : 0),
					0,
				),
			]),
		) as Record<(typeof ROTATION_POSITIONS)[number], number>;
	const outsideByPosition = markedByPosition("outside");
	const sumOf = (values: Record<string, number>) =>
		Object.values(values).reduce((a, b) => a + b, 0);
	const outside = sumOf(outsideByPosition),
		unknown = sumOf(markedByPosition("unknown"));
	const playersByPid = new Map(players.map((p) => [p.pid, p]));
	return (
		<div data-testid="rotation-position-minutes" className="mb-3">
			<div className="small fw-bold">
				Estimated position minutes (
				{display.wholeMinutes ? "approx. min" : "m:ss"})
			</div>
			<div className="small text-body-secondary mb-1">
				{allocation.ratingsInformed
					? "Allocated from planned minutes, listed positions and visible ratings. Team-wide role estimates; totals use balanced rounding."
					: "Allocated from planned minutes and listed positions. Listed-position estimates; totals use balanced rounding."}
			</div>
			{outside > 0 || unknown > 0 ? (
				<div
					className="small text-body-secondary mb-1"
					data-testid="rotation-position-uncertainty"
				>
					{outside > 0 ? (
						<>* {format(outside)} min outside listed positions</>
					) : null}
					{outside > 0 && unknown > 0 ? "; " : null}
					{unknown > 0 ? (
						<>? {format(unknown)} min with an unknown position label</>
					) : null}
				</div>
			) : null}
			<table
				className="table table-sm table-borderless mb-0"
				aria-label="Estimated position minutes"
				style={{
					width: "100%",
					tableLayout: "fixed",
					fontSize: "0.75rem",
					fontVariantNumeric: "tabular-nums",
				}}
			>
				<colgroup>
					<col style={{ width: "27%" }} />
					{ROTATION_POSITIONS.map((position) => (
						<col key={position} style={{ width: "11.5%" }} />
					))}
					<col style={{ width: "15.5%" }} />
				</colgroup>
				<thead>
					<tr>
						<th scope="col" style={{ padding: "2px" }}>
							Player
						</th>
						{ROTATION_POSITIONS.map((position) => (
							<th
								key={position}
								scope="col"
								className="text-end"
								style={{ padding: "2px" }}
							>
								{position}
							</th>
						))}
						<th scope="col" className="text-end" style={{ padding: "2px" }}>
							Total
						</th>
					</tr>
				</thead>
				<tbody>
					{allocation.rows.map((row) => {
						const player = playersByPid.get(row.pid);
						const name = player
							? `${player.firstName.slice(0, 1)}. ${player.lastName}`
							: String(row.pid);
						const fullName = player
							? `${player.firstName} ${player.lastName}`
							: String(row.pid);
						return (
							<tr
								key={row.pid}
								data-pid={row.pid}
								data-testid="rotation-position-row"
							>
								<th
									scope="row"
									className="fw-normal text-truncate"
									style={{ padding: "2px" }}
									title={`${fullName} (${row.pos})`}
								>
									{name} <span className="text-body-secondary">{row.pos}</span>
								</th>
								{ROTATION_POSITIONS.map((position) => {
									const seconds = row.seconds[position];
									const kind = row.fit[position];
									const shown = displayedByPid.get(row.pid)!.values[position];
									const marker =
										kind === "outside" ? "*" : kind === "unknown" ? "?" : "";
									return (
										<td
											key={position}
											className="text-end"
											style={{ padding: "2px", whiteSpace: "nowrap" }}
											data-position={position}
											data-seconds={seconds}
											data-minutes={display.wholeMinutes ? shown : undefined}
											title={
												seconds > 0
													? `${fullName}: ${position} ${format(shown)} approx. min${kind === "outside" ? ", outside listed position" : kind === "unknown" ? ", unknown listed position" : ""}`
													: undefined
											}
										>
											{shown > 0 ? (
												<>
													{format(shown)}
													<sup>{marker}</sup>
												</>
											) : (
												<span className="text-body-secondary">—</span>
											)}
										</td>
									);
								})}
								<td
									className="text-end"
									style={{ padding: "2px", whiteSpace: "nowrap" }}
									data-testid="rotation-position-player-total"
									data-seconds={row.plannedSeconds}
									data-minutes={
										display.wholeMinutes
											? displayedByPid.get(row.pid)!.total
											: undefined
									}
								>
									{format(displayedByPid.get(row.pid)!.total)}
								</td>
							</tr>
						);
					})}
				</tbody>
				<tfoot className="border-top">
					<tr>
						<th scope="row" style={{ padding: "2px" }}>
							Total
						</th>
						{ROTATION_POSITIONS.map((position) => (
							<td
								key={position}
								className="text-end fw-bold"
								style={{ padding: "2px" }}
								data-testid="rotation-position-total"
								data-position={position}
								data-seconds={allocation.totals[position]}
							>
								{format(display.totals[position])}
							</td>
						))}
						<td
							className="text-end fw-bold"
							style={{ padding: "2px" }}
							data-testid="rotation-position-team-total"
						>
							{format(Object.values(display.totals).reduce((a, b) => a + b, 0))}
						</td>
					</tr>
					{outside > 0 ? (
						<tr
							className="text-body-secondary"
							data-testid="rotation-position-outside-row"
							title="Minutes at each position played by players who are not listed there (G, GF, F and FC are listed at both of their positions). Where the roster needs someone to flex."
						>
							<th
								scope="row"
								className="fw-normal text-truncate"
								style={{ padding: "2px" }}
							>
								Off-label*
							</th>
							{ROTATION_POSITIONS.map((position) => (
								<td
									key={position}
									className="text-end"
									style={{ padding: "2px" }}
									data-testid="rotation-position-outside"
									data-position={position}
								>
									{outsideByPosition[position] > 0 ? (
										format(outsideByPosition[position])
									) : (
										<span>—</span>
									)}
								</td>
							))}
							<td
								className="text-end"
								style={{ padding: "2px" }}
								data-testid="rotation-position-outside-total"
							>
								{format(outside)}
							</td>
						</tr>
					) : null}
				</tfoot>
			</table>
		</div>
	);
};
export default RotationPositionMinutes;
