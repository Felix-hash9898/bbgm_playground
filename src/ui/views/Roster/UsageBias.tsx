import type { ChangeEvent } from "react";
import { helpers, toWorker } from "../../util/index.ts";
import type { View } from "../../../common/types.ts";

type Player = View<"roster">["players"][number];

export const usageBiasStyles = {
	0.85: {
		backgroundColor: "#ffc107",
		color: "#000",
	},
	1: {
		backgroundColor: "rgb(204, 204, 204)",
		color: "#000",
	},
	1.1: {
		backgroundColor: "#17a2b8",
		color: "#fff",
	},
	1.25: {
		backgroundColor: "#007bff",
		color: "#fff",
	},
};

const handleUsageBiasChange = async (
	p: Player,
	userTid: number,
	event: ChangeEvent<HTMLSelectElement>,
) => {
	const usageBias = helpers.localeParseFloat(event.currentTarget.value);

	if (Number.isNaN(usageBias)) {
		return;
	}

	if (p.tid !== userTid) {
		return;
	}

	await toWorker("main", "updateUsageBias", { pid: p.pid, usageBias });
};

const UsageBias = ({ p, userTid }: { p: Player; userTid: number }) => {
	const usageBiases = [
		{ text: "Low", usageBias: "0.85" },
		{ text: "Normal", usageBias: "1" },
		{ text: "High", usageBias: "1.1" },
		{ text: "Featured", usageBias: "1.25" },
	];

	const values = usageBiases.map((x) => helpers.localeParseFloat(x.usageBias));
	const pUsageBias = helpers.localeParseFloat(String(p.usageBias ?? 1));
	const index = values.findIndex((usageBias) => usageBias > pUsageBias);
	let value;
	if (index === 0) {
		value = values[0];
	} else if (index > 0) {
		value = values[index - 1];
	} else {
		value = values.at(-1);
	}

	return (
		<select
			className="form-select pt-modifier-select"
			value={value}
			onChange={(event) => handleUsageBiasChange(p, userTid, event)}
			style={(usageBiasStyles as any)[String(value)]}
		>
			{usageBiases.map(({ text, usageBias }) => {
				return (
					<option key={usageBias} value={usageBias}>
						{text}
					</option>
				);
			})}
		</select>
	);
};

export default UsageBias;
