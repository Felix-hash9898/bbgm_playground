import type { CSSProperties, SyntheticEvent } from "react";

const NextPrevButtons = <T extends unknown>({
	currentItem,
	items,
	reverse,
	disabled,
	onChange,
	style,
	getItemTitle,
}: {
	currentItem?: T;
	items: T[];
	reverse?: boolean;
	disabled?: boolean;
	onChange: (newItem: T) => void;
	style?: CSSProperties;
	getItemTitle?: (item: T) => string;
}) => {
	const index = items.indexOf(currentItem as any);
	const currentItemMissing = index < 0;

	type ButtonInfo = {
		disabled: boolean;
		onClick: (event: SyntheticEvent) => void;
	};

	const buttonInfo: [ButtonInfo, ButtonInfo] = [
		{
			disabled: disabled || currentItemMissing || index <= 0,
			onClick: (event) => {
				event.preventDefault();
				const newItem = items[index - 1];
				if (newItem !== undefined) {
					onChange(newItem);
				}
			},
		},
		{
			disabled: disabled || currentItemMissing || index >= items.length - 1,
			onClick: (event) => {
				event.preventDefault();
				const newItem = items[index + 1];
				if (newItem !== undefined) {
					onChange(newItem);
				}
			},
		},
	];

	// Seasons are displayed in reverse order in the dropdown, and "prev" should be "back in time"
	if (reverse) {
		buttonInfo.reverse();
	}
	const previousTitle =
		getItemTitle && index > 0
			? `Previous: ${getItemTitle(items[index - 1]!)}`
			: "Previous";
	const nextTitle =
		getItemTitle && index < items.length - 1
			? `Next: ${getItemTitle(items[index + 1]!)}`
			: "Next";

	return (
		<div className="btn-group" style={style}>
			<button
				className="btn btn-light-bordered btn-xs"
				disabled={buttonInfo[0].disabled}
				onClick={buttonInfo[0].onClick}
				aria-label={previousTitle}
				title={previousTitle}
				type="button"
			>
				<span className="glyphicon glyphicon-menu-left" />
			</button>
			<button
				className="btn btn-light-bordered btn-xs"
				disabled={buttonInfo[1].disabled}
				onClick={buttonInfo[1].onClick}
				aria-label={nextTitle}
				title={nextTitle}
				type="button"
			>
				<span className="glyphicon glyphicon-menu-right" />
			</button>
		</div>
	);
};

export default NextPrevButtons;
