export const getMoodProbabilityClassName = (probWilling: number) => {
	if (probWilling >= 0.99) {
		return "text-success";
	}
	if (probWilling >= 0.95) {
		return "text-warning";
	}
	if (probWilling >= 0.8) {
		return "text-orange";
	}
	return "text-danger";
};
