import clsx from "clsx";

const RatingWithChange = ({
	change,
	children,
	colorize = true,
}: {
	change: number;
	children: number;
	colorize?: boolean;
}) => {
	return (
		<>
			{children}
			{change !== 0 ? (
				<span
					className={clsx({
						"text-success": colorize && change > 0,
						"text-danger": colorize && change < 0,
					})}
				>
					{" "}
					({change > 0 ? "+" : null}
					{change})
				</span>
			) : null}
		</>
	);
};

export const wrappedRatingWithChange = (rating: number, change: number) => {
	const formatted =
		change === 0
			? String(rating)
			: `${rating} (${change > 0 ? "+" : ""}${change})`;

	return {
		value: <RatingWithChange change={change}>{rating}</RatingWithChange>,
		exportValue: rating,
		sortValue: rating + (change + 500) / 1000,
		searchValue: formatted,
	};
};

export default RatingWithChange;
