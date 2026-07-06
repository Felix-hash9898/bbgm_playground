import { type ChangeEvent, useEffect, useState } from "react";
import { helpers, toWorker } from "../../util/index.ts";
import type { View } from "../../../common/types.ts";

type Player = View<"roster">["players"][number];

export const ptStyles = {
	0: {
		backgroundColor: "#dc3545",
		color: "#fff",
	},
	0.75: {
		backgroundColor: "#ffc107",
		color: "#000",
	},
	1: {
		backgroundColor: "rgb(204, 204, 204)",
		color: "#000",
	},
	1.25: {
		backgroundColor: "#17a2b8",
		color: "#fff",
	},
	1.5: {
		backgroundColor: "#007bff",
		color: "#fff",
	},
};

const handlePtChange = async (
	p: Player,
	userTid: number,
	event: ChangeEvent<HTMLSelectElement>,
) => {
	const ptModifier = helpers.localeParseFloat(event.currentTarget.value);

	if (Number.isNaN(ptModifier)) {
		return;
	}

	// NEVER UPDATE AI TEAMS
	if (p.tid !== userTid) {
		return;
	}

	await toWorker("main", "updatePlayingTime", { pid: p.pid, ptModifier });
};

const PlayingTime = ({
	p,
	userTid,
	godMode,
}: {
	p: Player;
	userTid: number;
	godMode?: boolean;
}) => {
	const ptModifiers = [
		{ text: "0", ptModifier: "0" },
		{ text: "-", ptModifier: "0.75" },
		{ text: " ", ptModifier: "1" },
		{ text: "+", ptModifier: "1.25" },
		{ text: "++", ptModifier: "1.5" },
	];

	const values = ptModifiers.map((x) => helpers.localeParseFloat(x.ptModifier));
	const index = values.findIndex((ptModifier) => ptModifier > p.ptModifier);
	let value;
	if (index === 0) {
		value = values[0];
	} else if (index > 0) {
		value = values[index - 1];
	} else {
		value = values.at(-1);
	}

	const [targetInput, setTargetInput] = useState<string>(
		p.targetMinutes !== undefined ? String(p.targetMinutes) : "",
	);

	useEffect(() => {
		setTargetInput(p.targetMinutes !== undefined ? String(p.targetMinutes) : "");
	}, [p.targetMinutes]);

	const saveTargetMinutes = async (valStr: string) => {
		if (p.tid !== userTid) {
			return;
		}

		const trimmed = valStr.trim();
		if (trimmed === "") {
			await toWorker("main", "updatePlayingTime", {
				pid: p.pid,
				targetMinutes: null,
			});
			return;
		}

		const parsed = Number(trimmed);
		if (!Number.isFinite(parsed) || parsed < 0 || parsed > 48) {
			// Revert to current prop on invalid input
			setTargetInput(
				p.targetMinutes !== undefined ? String(p.targetMinutes) : "",
			);
			return;
		}

		await toWorker("main", "updatePlayingTime", {
			pid: p.pid,
			targetMinutes: parsed,
		});
	};

	return (
		<div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
			<select
				className="form-select pt-modifier-select"
				value={value}
				onChange={(event) => handlePtChange(p, userTid, event)}
				style={(ptStyles as any)[String(value)]}
				disabled={p.tid !== userTid}
			>
				{ptModifiers.map(({ text, ptModifier }) => {
					return (
						<option key={ptModifier} value={ptModifier}>
							{text}
						</option>
					);
				})}
			</select>
			{godMode && (
				<input
					type="number"
					className="form-control form-control-sm"
					placeholder="Auto"
					min={0}
					max={48}
					step="any"
					value={targetInput}
					disabled={p.tid !== userTid}
					onChange={(e) => setTargetInput(e.target.value)}
					onBlur={(e) => saveTargetMinutes(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.currentTarget.blur();
						}
					}}
					style={{
						width: "58px",
						fontSize: "0.8rem",
						padding: "0.15rem 0.25rem",
						textAlign: "center",
					}}
					title="Target Minutes (soft cap, blank for Auto; use PT=0 for DNP)"
				/>
			)}
		</div>
	);
};

export default PlayingTime;
