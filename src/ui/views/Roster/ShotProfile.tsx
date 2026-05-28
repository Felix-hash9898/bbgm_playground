import type { ChangeEvent } from "react";
import {
	getShotTendenciesForProfile,
	getShotTendencyProfileId,
	SHOT_TENDENCY_PRESETS,
	type ShotTendencyProfileID,
} from "../../../common/shotTendencies.basketball.ts";
import { toWorker } from "../../util/index.ts";
import type { View } from "../../../common/types.ts";

type Player = View<"roster">["players"][number];

const handleShotProfileChange = async (
	p: Player,
	userTid: number,
	event: ChangeEvent<HTMLSelectElement>,
) => {
	const profile = event.currentTarget.value as ShotTendencyProfileID | "custom";

	if (profile === "custom" || p.tid !== userTid) {
		return;
	}

	await toWorker("main", "updateShotTendencies", {
		pid: p.pid,
		shotTendencies: getShotTendenciesForProfile(profile),
	});
};

const ShotProfile = ({ p, userTid }: { p: Player; userTid: number }) => {
	const profile = getShotTendencyProfileId(p);

	return (
		<select
			className="form-select pt-modifier-select"
			value={profile}
			onChange={(event) => handleShotProfileChange(p, userTid, event)}
		>
			{SHOT_TENDENCY_PRESETS.map(({ id, label }) => (
				<option key={id} value={id}>
					{label}
				</option>
			))}
			{profile === "custom" ? <option value="custom">Custom</option> : null}
		</select>
	);
};

export default ShotProfile;
