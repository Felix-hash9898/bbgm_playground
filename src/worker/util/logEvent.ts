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

type Notification = { options: LogEventShowOptions; conditions?: Conditions };
let gameDayNotifications: Notification[] | undefined;

export const beginGameDayNotifications = () => {
	if (gameDayNotifications) {
		throw new Error("Game day notifications cannot be nested");
	}
	const notifications: Notification[] = [];
	gameDayNotifications = notifications;
	return {
		rollback: () => {
			if (gameDayNotifications === notifications) {
				gameDayNotifications = undefined;
			}
		},
		commit: async () => {
			gameDayNotifications = undefined;
			for (const { options, conditions } of notifications) {
				await toUI("showEvent", [options], conditions);
			}
		},
	};
};

const showEvent = (options: LogEventShowOptions, conditions?: Conditions) => {
	if (gameDayNotifications) {
		gameDayNotifications.push({ options, conditions });
	} else {
		void toUI("showEvent", [options], conditions).catch((error) => {
			console.error("Failed to display event", error);
		});
	}
};

const logEvent = createLogger(saveEvent, showEvent);

export const logEventInContext = async (
	event: Parameters<typeof logEvent>[0],
	conditions: Conditions | undefined,
	context: CapturedLeagueContext,
) => {
	const saveEventInContext = (eventToSave: LogEventSaveOptions) =>
		context.cache.events.add({ ...eventToSave, season: context.season });
	const logEventForContext = createLogger(saveEventInContext, showEvent);

	return logEventForContext(event, conditions);
};

export default logEvent;
