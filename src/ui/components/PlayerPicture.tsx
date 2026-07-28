import type { FaceConfig } from "facesjs";
import { MyFace } from "./MyFace.tsx";

const imgStyle = {
	maxHeight: "100%",
	maxWidth: "100%",
};

const PlayerPicture = ({
	colors,
	face,
	imgURL,
	jersey,
	lazy,
	showInMinimalUI,
}: {
	colors?: [string, string, string];
	face?: FaceConfig;
	imgURL?: string;
	jersey?: string;
	lazy?: boolean;
	showInMinimalUI?: boolean;
}) => {
	const className = showInMinimalUI ? undefined : "minimal-ui-player-picture";

	if (imgURL) {
		return (
			<img alt="Player" className={className} src={imgURL} style={imgStyle} />
		);
	}

	if (face) {
		return (
			<MyFace
				className={className}
				colors={colors}
				face={face}
				jersey={jersey}
				lazy={lazy}
			/>
		);
	}

	return null;
};

export default PlayerPicture;
