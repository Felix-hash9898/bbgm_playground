import type { ChangeEvent } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import gameSimPresets from "./gameSimPresets.ts";
import useSettingsFormState from "./useSettingsFormState.ts";

const basketballGameSimPresets = gameSimPresets!;

const presetKeys = vi.hoisted(() => [
	"pace",
	"threePointTendencyFactor",
	"threePointAccuracyFactor",
	"twoPointAccuracyFactor",
	"ftAccuracyFactor",
	"blockFactor",
	"stealFactor",
	"turnoverFactor",
	"orbFactor",
]);

const hookState = vi.hoisted(() => ({
	cursor: 0,
	slots: [] as { value: unknown }[],
}));

vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();

	return {
		...actual,
		useState: (initialValue: unknown) => {
			const index = hookState.cursor;
			hookState.cursor += 1;

			if (!hookState.slots[index]) {
				hookState.slots[index] = {
					value:
						typeof initialValue === "function" ? initialValue() : initialValue,
				};
			}

			const setValue = (newValue: unknown) => {
				const slot = hookState.slots[index];
				if (!slot) {
					throw new Error("Missing hook state");
				}
				slot.value =
					typeof newValue === "function" ? newValue(slot.value) : newValue;
			};

			return [hookState.slots[index]?.value, setValue];
		},
	};
});

vi.mock("./settings.tsx", () => ({
	settings: presetKeys.map((key) => ({
		key,
		type: "float",
	})),
}));

vi.mock("./SettingsForm.tsx", () => ({
	encodeDecodeFunctions: {
		float: {
			stringify: String,
		},
	},
	SPECIAL_STATE_ALL: [
		"godMode",
		"godModeInPast",
		"injuries",
		"tragicDeaths",
		"playerBioInfo",
	],
	SPECIAL_STATE_BOOLEANS: ["godMode", "godModeInPast"],
	SPECIAL_STATE_OTHERS: ["injuries", "tragicDeaths", "playerBioInfo"],
}));

const makeInitialSettings = (preset: Record<string, number>) => ({
	...preset,
	godMode: true,
	godModeInPast: true,
	injuries: [],
	playerBioInfo: undefined,
	tragicDeaths: [],
});

const useRenderHook = (
	initialSettings: ReturnType<typeof makeInitialSettings>,
	gameSimPresetSeason = 2023,
) => {
	hookState.cursor = 0;
	return useSettingsFormState({
		// @ts-expect-error Only the settings read by this focused test are needed.
		initialSettings,
		gameSimPresetSeason,
	});
};

beforeEach(() => {
	hookState.cursor = 0;
	hookState.slots = [];
});

test("restores canonical settings when initial settings contain a wrong preset", () => {
	const initialSettings = makeInitialSettings(basketballGameSimPresets[2015]);
	let form = useRenderHook(initialSettings);

	expect(form.gameSimPreset).toBe("default");
	expect(form.state.pace).toBe("93.9");
	expect(form.state.threePointTendencyFactor).toBe("0.705");

	form.setGameSimPreset("default");
	form = useRenderHook(initialSettings);
	expect(form.gameSimPreset).toBe("default");
	expect(form.state.pace).toBe("100.2");
	expect(form.state.threePointTendencyFactor).toBe("1");

	const savedCanonicalSettings = makeInitialSettings(
		Object.fromEntries(
			presetKeys.map((key) => [
				key,
				Number(form.state[key as keyof typeof form.state]),
			]),
		),
	);
	hookState.slots = [];
	form = useRenderHook(savedCanonicalSettings);
	expect(form.state.pace).toBe("100.2");
	expect(form.state.threePointTendencyFactor).toBe("1");

	form.setGameSimPreset("2014");
	form = useRenderHook(savedCanonicalSettings);
	expect(form.gameSimPreset).toBe("2014");
	expect(form.state.threePointTendencyFactor).toBe("0.676");

	form.setGameSimPreset("default");
	form = useRenderHook(savedCanonicalSettings);
	form.handleChange(
		"threePointTendencyFactor",
		"float",
	)({
		target: {
			value: "1.234",
		},
	} as ChangeEvent<HTMLInputElement>);
	form = useRenderHook(savedCanonicalSettings);
	expect(form.gameSimPreset).toBe("default");
	expect(form.state.threePointTendencyFactor).toBe("1.234");

	const savedSettings = makeInitialSettings(
		Object.fromEntries(
			presetKeys.map((key) => [
				key,
				Number(form.state[key as keyof typeof form.state]),
			]),
		),
	);
	hookState.slots = [];
	form = useRenderHook(savedSettings);
	expect(form.gameSimPreset).toBe("default");
	expect(form.state.pace).toBe("100.2");
	expect(form.state.threePointTendencyFactor).toBe("1.234");
});
