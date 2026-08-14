import { expect, test } from "vitest";
import realPlayerData from "../../../../data/real-player-data.basketball.json";
import getGameSimPresetUpdate, {
	getCanonicalGameSimPresetYear,
} from "./getGameSimPresetUpdate.ts";

test.each([
	[2023, "2020"],
	[2020, "2020"],
	[2025, "2025"],
	[2015, "2015"],
	[9999, "2025"],
	[1900, "1947"],
])("resolves season %s to canonical preset %s", (season, expected) => {
	expect(getCanonicalGameSimPresetYear(season)).toBe(expected);
});

test("restores the canonical preset for the current league season", () => {
	const update = getGameSimPresetUpdate("default", 2023);

	expect(update?.gameSimPreset).toBe("default");
	expect(update?.settings.pace).toBe("100.2");
	expect(update?.settings.threePointTendencyFactor).toBe("1");
});

test("applies an explicitly selected historical preset", () => {
	const update = getGameSimPresetUpdate("2015", 2023);

	expect(update?.gameSimPreset).toBe("2015");
	expect(update?.settings.pace).toBe("93.9");
	expect(update?.settings.threePointTendencyFactor).toBe("0.705");
});

test("keeps historical turnover and steal schedules synchronized", () => {
	const expectedFactors = [
		[1978, 1.29, 0.96],
		[1979, 1.35, 0.98],
		[1980, 1.33, 1.06],
		[1981, 1.33, 1.03],
		[1982, 1.3, 0.98],
		[1983, 1.33, 0.99],
		[1984, 1.3, 1.01],
		[1985, 1.3, 1.01],
		[1986, 1.3, 1.11],
		[1987, 1.26, 1.13],
		[1988, 1.26, 1.18],
		[1989, 1.29, 1.26],
		[1990, 1.25, 1.22],
		[1991, 1.25, 1.26],
		[1992, 1.25, 1.27],
		[1993, 1.25, 1.29],
		[1994, 1.26, 1.31],
		[1995, 1.29, 1.24],
		[1996, 1.29, 1.21],
		[1997, 1.29, 1.27],
		[1998, 1.29, 1.29],
		[1999, 1.29, 1.23],
		[2000, 1.24, 1.22],
		[2001, 1.23, 1.2],
		[2002, 1.21, 1.22],
		[2003, 1.23, 1.21],
		[2004, 1.24, 1.21],
		[2005, 1.21, 1.19],
		[2006, 1.21, 1.13],
		[2007, 1.23, 1.06],
		[2008, 1.1, 1.14],
		[2009, 1.1, 1.14],
		[2010, 1.1, 1.13],
		[2011, 1.11, 1.12],
		[2012, 1.12, 1.19],
		[2013, 1.12, 1.2],
		[2014, 1.11, 1.18],
		[2015, 1.1, 1.2],
		[2016, 1.07, 1.21],
		[2017, 1.06, 1.21],
		[2018, 1.06, 1.19],
		[2019, 1, 1.22],
		[2020, 1, 1.09],
		[2025, 1, 1.22],
	] as const;

	const phase0Events = realPlayerData.scheduledEventsGameAttributes
		.filter(
			(event) =>
				event.phase === 0 &&
				event.type === "gameAttributes" &&
				event.season >= 1978 &&
				event.season <= 2025,
		)
		.sort((a, b) => a.season - b.season);
	const effectiveFactors = {
		turnoverFactor: 1,
		stealFactor: 1,
	};

	for (const [season, turnoverFactor, stealFactor] of expectedFactors) {
		for (const event of phase0Events) {
			if (event.season === season) {
				if (event.info.turnoverFactor !== undefined) {
					effectiveFactors.turnoverFactor = event.info.turnoverFactor;
				}
				if (event.info.stealFactor !== undefined) {
					effectiveFactors.stealFactor = event.info.stealFactor;
				}
			}
		}

		expect(effectiveFactors).toEqual({
			turnoverFactor,
			stealFactor,
		});

		const preset = getGameSimPresetUpdate(String(season), season);
		expect(preset?.settings.turnoverFactor).toBe(String(turnoverFactor));
		expect(preset?.settings.stealFactor).toBe(String(stealFactor));
	}

	const event2020 = phase0Events.find((event) => event.season === 2020);
	expect(event2020?.info).toMatchObject({
		pace: 100.2,
		stealFactor: 1.09,
		threePointTendencyFactor: 1,
	});
	expect(event2020?.info).not.toHaveProperty("turnoverFactor");

	const events2025 = phase0Events.filter((event) => event.season === 2025);
	expect(events2025).toHaveLength(1);
	expect(events2025[0]?.info).toEqual({ stealFactor: 1.22 });

	const preset2020 = getGameSimPresetUpdate("2020", 2020);
	const preset2025 = getGameSimPresetUpdate("2025", 2025);
	expect(preset2020).toBeDefined();
	expect(preset2025).toBeDefined();
	if (preset2020 && preset2025) {
		expect(preset2025.settings).toEqual({
			...preset2020.settings,
			stealFactor: "1.22",
		});
	}
});

test("ignores default without a league season and invalid presets", () => {
	expect(getGameSimPresetUpdate("default")).toBeUndefined();
	expect(getGameSimPresetUpdate("invalid", 2023)).toBeUndefined();
});
