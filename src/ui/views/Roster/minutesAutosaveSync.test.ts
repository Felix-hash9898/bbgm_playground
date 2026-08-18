import { describe, expect, test } from "vitest";
import {
	serializeMinutesByPid,
	shouldPreserveLocalMinutesDraft,
} from "./minutesAutosaveSync.ts";

const planA = { 1: 40, 2: 36, 3: 34 };
const planB = { 1: 41, 2: 35, 3: 34 };

describe("basketball minutes autosave source synchronization", () => {
	test("serializes pid maps independently of insertion order and value type", () => {
		expect(serializeMinutesByPid({ 2: "36", 1: 40 })).toBe(
			serializeMinutesByPid({ 1: 40, 2: 36 }),
		);
	});

	test("preserves a newer local draft when an older own write echoes", () => {
		const incomingKey = serializeMinutesByPid(planA);
		const localKey = serializeMinutesByPid(planB);

		expect(
			shouldPreserveLocalMinutesDraft({
				tidChanged: false,
				incomingMode: "custom",
				incomingMinutesKey: incomingKey,
				localMinutesKey: localKey,
				ownWriteKeys: new Set([incomingKey]),
				autoResetPending: false,
			}),
		).toBe(true);
	});

	test("preserves a complete local draft before its debounce write starts", () => {
		const incomingKey = serializeMinutesByPid(planA);
		const localKey = serializeMinutesByPid(planB);

		expect(
			shouldPreserveLocalMinutesDraft({
				tidChanged: false,
				incomingMode: "custom",
				incomingMinutesKey: incomingKey,
				localMinutesKey: localKey,
				ownWriteKeys: new Set(),
				autoResetPending: false,
				localDraftPending: true,
			}),
		).toBe(true);
	});

	test("accepts the server echo once it matches the local draft", () => {
		const localKey = serializeMinutesByPid(planB);

		expect(
			shouldPreserveLocalMinutesDraft({
				tidChanged: false,
				incomingMode: "custom",
				incomingMinutesKey: localKey,
				localMinutesKey: localKey,
				ownWriteKeys: new Set([serializeMinutesByPid(planA)]),
				autoResetPending: false,
			}),
		).toBe(false);
	});

	test("keeps Auto authoritative over stale custom responses", () => {
		const incomingKey = serializeMinutesByPid(planA);
		const localKey = serializeMinutesByPid(planB);

		expect(
			shouldPreserveLocalMinutesDraft({
				tidChanged: false,
				incomingMode: "custom",
				incomingMinutesKey: incomingKey,
				localMinutesKey: localKey,
				ownWriteKeys: new Set([incomingKey]),
				autoResetPending: true,
			}),
		).toBe(true);
		expect(
			shouldPreserveLocalMinutesDraft({
				tidChanged: false,
				incomingMode: "auto",
				incomingMinutesKey: incomingKey,
				localMinutesKey: localKey,
				ownWriteKeys: new Set([incomingKey]),
				autoResetPending: true,
			}),
		).toBe(false);
	});

	test("refreshes when the active team changes", () => {
		const key = serializeMinutesByPid(planA);

		expect(
			shouldPreserveLocalMinutesDraft({
				tidChanged: true,
				incomingMode: "custom",
				incomingMinutesKey: key,
				localMinutesKey: serializeMinutesByPid(planB),
				ownWriteKeys: new Set([key]),
				autoResetPending: false,
			}),
		).toBe(false);
	});

	test("refreshes when the active roster membership changes", () => {
		const key = serializeMinutesByPid(planA);

		expect(
			shouldPreserveLocalMinutesDraft({
				tidChanged: false,
				rosterChanged: true,
				incomingMode: "custom",
				incomingMinutesKey: key,
				localMinutesKey: serializeMinutesByPid(planB),
				ownWriteKeys: new Set([key]),
				autoResetPending: false,
			}),
		).toBe(false);
	});
});
