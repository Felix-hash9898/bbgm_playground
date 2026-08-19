export const getPlayerSectionId = (label: string) => {
	const slug = label
		.trim()
		.toLowerCase()
		.replace(/[^\da-z]+/g, "-")
		.replace(/^-|-$/g, "");

	return `player-section-${slug || "section"}`;
};

export const getPlayerStatsSectionId = (label: string, index: number) =>
	`${getPlayerSectionId(`stats-${label}`)}-${index}`;

const SectionNavigation = ({
	sections,
}: {
	sections: { id: string; label: string }[];
}) => {
	if (sections.length === 0) {
		return null;
	}

	return (
		<nav
			aria-label="Player sections"
			className="d-flex flex-wrap align-items-center gap-2 mb-3 small"
		>
			<span className="text-body-secondary">Jump to:</span>
			{sections.map(({ id, label }) => (
				<a className="btn btn-light-bordered btn-xs" href={`#${id}`} key={id}>
					{label}
				</a>
			))}
		</nav>
	);
};

export default SectionNavigation;
