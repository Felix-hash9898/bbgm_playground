import { createLogger } from "../../common/index.ts";
import { idb } from "../db/index.ts";
import g from "./g.ts";
import toUI from "./toUI.ts";
import type {
	Conditions,
	LogEventSaveOptions,
	LogEventShowOptions,
} from "../../common/types.ts";
import type { CapturedLeagueContext } from "../core/capturedContext.ts";

const saveEvent = (event: LogEventSaveOptions) => {
	return idb.cache.events.add({ ...event, season: g.get("season") });
};

// conditions only needed when showNotification is true, otherwise this is never called
const logEvent = createLogger(
	saveEvent,
	(options: LogEventShowOptions, conditions?: Conditions) => {
		toUI("showEvent", [options], conditions);
	},
);

export const logEventInContext = async (
	event: Parameters<typeof logEvent>[0],
	conditions: Conditions | undefined,
	context: CapturedLeagueContext,
) => {
	const saveEventInContext = (eventToSave: LogEventSaveOptions) =>
		context.cache.events.add({ ...eventToSave, season: context.season });
	const logEventForContext = createLogger(
		saveEventInContext,
		(options, conditions2) => toUI("showEvent", [options], conditions2),
	);

	return logEventForContext(event, conditions);
};

export default logEvent;
