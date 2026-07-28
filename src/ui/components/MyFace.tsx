import type { FaceConfig } from "facesjs";
import { Face } from "facesjs/react";
import {
	DEFAULT_JERSEY,
	DEFAULT_TEAM_COLORS,
	isSport,
} from "../../common/index.ts";

export const MyFace = ({
	className,
	colors = DEFAULT_TEAM_COLORS,
	face,
	jersey = DEFAULT_JERSEY,
	lazy,
}: {
	className?: string;
	colors?: [string, string, string];
	face: FaceConfig;
	jersey?: string;
	lazy?: boolean;
}) => {
	let overrides;
	if (isSport("baseball")) {
		const [jerseyId, accessoryId] = jersey.split(":");
		overrides = {
			teamColors: colors,
			jersey: {
				id: jerseyId!,
			},
			accessories: {
				id: accessoryId!,
			},
		};
	} else {
		overrides = {
			teamColors: colors,
			jersey: {
				id: jersey,
			},
		};
	}

	return (
		<Face
			className={className}
			face={face}
			ignoreDisplayErrors
			lazy={lazy}
			overrides={overrides}
			style={{
				aspectRatio: "2/3",
			}}
		/>
	);
};
