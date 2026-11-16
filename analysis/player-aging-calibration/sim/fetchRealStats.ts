/**
 * Research-harness shim (not product code). src/test/setup.ts maps fetch("/gen/...") to data/ files but only
 * adds the sport suffix for real-player-data.json. Real leagues created with realStats != "none" also fetch
 * /gen/real-player-stats.json, which lives at data/real-player-stats.basketball.json.
 */
export const installRealStatsFetch = () => {
	const orig = (globalThis as any).fetch;
	if (orig.__agingShim) {
		return;
	}
	const shim = async (url: string, ...rest: unknown[]) => {
		if (typeof url === "string" && url.endsWith("real-player-stats.json")) {
			return orig(url.replace("real-player-stats.json", "real-player-stats.basketball.json"), ...rest);
		}
		return orig(url, ...rest);
	};
	(shim as any).__agingShim = true;
	(globalThis as any).fetch = shim;
};
