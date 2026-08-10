export const saveScheduleEditor = async ({
	save,
	setDirty,
	setSaving,
	onSuccess,
	onError,
}: {
	save: () => Promise<unknown>;
	setDirty: (dirty: boolean) => void;
	setSaving: (saving: boolean) => void;
	onSuccess?: () => void;
	onError?: (error: unknown) => void;
}) => {
	setSaving(true);
	try {
		await save();
		onSuccess?.();
		setDirty(false);
	} catch (error) {
		onError?.(error);
		throw error;
	} finally {
		setSaving(false);
	}
};
