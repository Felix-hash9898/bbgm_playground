import type api from "../../worker/api/index.ts";
import logEvent from "./logEvent.ts";
import toWorker from "./toWorker.ts";

export const reportPlayError = async (error: unknown) => {
	console.error("Play request failed", error);
	try {
		await logEvent({
			type: "error",
			text: error instanceof Error ? error.message : String(error),
			saveToDb: false,
			persistent: true,
		});
	} catch (notificationError) {
		console.error("Failed to display play error", notificationError);
	}
};

let advancing = false;

// React handlers and keyboard shortcuts cannot leave rejected Worker requests
// unobserved. Share the guard with Sim Next to cover rapid clicks across controls.
const runPlayMenuAction = async (name: keyof typeof api.playMenu) => {
	const stopping = name === "stop" || name === "stopAuto";
	if (!stopping && advancing) {
		return false;
	}
	if (!stopping) {
		advancing = true;
	}
	try {
		await toWorker("playMenu", name, undefined);
		return true;
	} catch (error) {
		await reportPlayError(error);
		return false;
	} finally {
		if (!stopping) {
			advancing = false;
		}
	}
};

export default runPlayMenuAction;
