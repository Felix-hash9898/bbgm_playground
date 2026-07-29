type SalaryRow = {
	amount: number;
	season: number;
};

export const getLastSalary = (salaries: SalaryRow[]) => {
	const salary = salaries.findLast(
		(row) => Number.isFinite(row.amount) && Number.isFinite(row.season),
	);
	return salary ? salary.amount / 1000 : undefined;
};
