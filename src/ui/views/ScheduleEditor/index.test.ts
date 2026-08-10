import { assert, describe, test, vi } from "vitest";
import { saveScheduleEditor } from "./saveScheduleEditor.ts";

const runSave = async ({ save }: { save: () => Promise<unknown> }) => {
	const savingStates: boolean[] = [];
	const dirtyStates: boolean[] = [];

	await saveScheduleEditor({
		save,
		setDirty: (dirty) => {
			dirtyStates.push(dirty);
		},
		setSaving: (saving) => {
			savingStates.push(saving);
		},
	});

	return { dirtyStates, savingStates };
};

const assertPromiseRejects = async (promise: Promise<unknown>) => {
	let rejected = false;
	try {
		await promise;
	} catch {
		rejected = true;
	}
	assert.equal(rejected, true);
};

describe("ScheduleEditor saving finally", () => {
	test("clears saving after a successful save", async () => {
		const result = await runSave({ save: async () => {} });

		assert.deepStrictEqual(result.savingStates, [true, false]);
		assert.deepStrictEqual(result.dirtyStates, [false]);
	});

	test.each([
		["validation reject", "invalid schedule"],
		["worker reject", "cache write failed"],
		["rollback reject", "rollback failed"],
	])("clears saving when %s", async (_label, message) => {
		const save = vi.fn(async () => {
			throw new Error(message);
		});
		const savingStates: boolean[] = [];
		const dirtyStates: boolean[] = [];

		await assertPromiseRejects(
			saveScheduleEditor({
				save,
				setDirty: (dirty) => dirtyStates.push(dirty),
				setSaving: (saving) => savingStates.push(saving),
			}),
		);

		assert.deepStrictEqual(savingStates, [true, false]);
		assert.deepStrictEqual(dirtyStates, []);
	});
});
