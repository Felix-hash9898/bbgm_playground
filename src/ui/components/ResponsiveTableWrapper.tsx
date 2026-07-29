import clsx from "clsx";
import type { CSSProperties, Ref } from "react";
type Props = {
	className?: string | null;
	children: any;
	nonfluid?: boolean;
	ref?: Ref<HTMLDivElement>;
	style?: CSSProperties;
};

// This used to be needed to handle event propagation for touch events, when SideBar was swipeable
const ResponsiveTableWrapper = ({
	className,
	children,
	nonfluid,
	ref,
	style,
}: Props) => {
	return (
		<div
			className={clsx(
				"table-responsive small-scrollbar",
				{
					"table-nonfluid": nonfluid,
				},
				className,
			)}
			ref={ref}
			style={style}
		>
			{children}
		</div>
	);
};

export default ResponsiveTableWrapper;
