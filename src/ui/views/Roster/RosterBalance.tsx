import { Overlay, Popover } from "react-bootstrap";
import { useEffect, useRef, useState } from "react";
import { helpers } from "../../util/index.ts";
import HideableSection from "../../components/HideableSection.tsx";
import SkillsBlock from "../../components/SkillsBlock.tsx";
import type { View } from "../../../common/types.ts";
import {
	DETAILED_POSITION_BUCKETS,
	getRosterBalance,
	type RosterBalanceCategory,
	type RosterBalancePlayer,
} from "./rosterBalance.ts";

const formatMinutes = (minutes: number) =>
	Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);

const RoleCoveragePopover = ({
	category,
	target,
	onHide,
}: {
	category: RosterBalanceCategory;
	target: HTMLElement;
	onHide: () => void;
}) => (
	<Overlay
		key={category.key}
		show
		target={target}
		placement="top"
		flip
		offset={[0, 8]}
		containerPadding={8}
		rootClose
		onHide={onHide}
		container={document.body}
	>
		{({
			arrowProps,
			hasDoneInitialMeasure,
			placement,
			popper,
			...overlayProps
		}) => (
			<Popover
				{...overlayProps}
				arrowProps={arrowProps}
				hasDoneInitialMeasure={hasDoneInitialMeasure}
				placement={placement}
				popper={popper}
				id={`roster-balance-${category.key}`}
				role="dialog"
				aria-label={`${category.label} coverage`}
				style={{
					...overlayProps.style,
					width: "min(340px, calc(100vw - 1rem))",
					maxWidth: "calc(100vw - 1rem)",
				}}
			>
				<Popover.Header as="h3" className="py-1 px-2 text-nowrap">
					{category.label} — {formatMinutes(category.totalMinutes)} min
				</Popover.Header>
				<Popover.Body className="p-2">
					{category.players.length > 0 ? (
						<div className="d-flex flex-column gap-1">
							{category.players.map(({ player, minutes, skills }) => (
								<div
									className={`d-flex align-items-baseline justify-content-between gap-2${minutes === 0 ? " opacity-75" : ""}`}
									key={player.pid}
								>
									<a href={helpers.leagueUrl(["player", player.pid])}>
										{player.firstName} {player.lastName}
									</a>
									<span className="text-nowrap">
										{formatMinutes(minutes)} min
										<SkillsBlock className="ms-1" skills={skills} />
									</span>
								</div>
							))}
						</div>
					) : (
						<span className="text-body-secondary">
							No players with this coverage.
						</span>
					)}
				</Popover.Body>
			</Popover>
		)}
	</Overlay>
);

const CategoryCoverage = ({
	category,
	onToggle,
	show,
}: {
	category: RosterBalanceCategory;
	onToggle: (
		key: RosterBalanceCategory["key"] | undefined,
		target?: HTMLElement,
	) => void;
	show: boolean;
}) => {
	return (
		<button
			className="btn btn-link p-0 border-0 text-start text-nowrap"
			type="button"
			onClick={(event) => {
				event.stopPropagation();
				onToggle(show ? undefined : category.key, event.currentTarget);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onToggle(show ? undefined : category.key, event.currentTarget);
				}
			}}
			aria-label={`${category.label}: ${formatMinutes(category.totalMinutes)} planned minutes`}
			aria-haspopup="dialog"
			aria-expanded={show}
			aria-controls={`roster-balance-${category.key}`}
		>
			{category.label} {formatMinutes(category.totalMinutes)} min
		</button>
	);
};

const PositionCounts = ({
	label,
	values,
}: {
	label: string;
	values: Record<string, number>;
}) => (
	<div className="text-nowrap">
		<span className="text-body-secondary">{label}:</span>{" "}
		{Object.entries(values).map(([position, count], i) => (
			<span key={position}>
				{i > 0 ? " · " : null}
				{position} {count}
			</span>
		))}
	</div>
);

const RosterBalance = ({
	players,
	minutesByPid,
}: {
	players: View<"roster">["players"];
	minutesByPid: Record<number, number>;
}) => {
	const [openCategoryKey, setOpenCategoryKey] = useState<
		RosterBalanceCategory["key"] | undefined
	>();
	const [activeTriggerElement, setActiveTriggerElement] =
		useState<HTMLElement | null>(null);
	const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 576);
	const roleRowRef = useRef<HTMLDivElement>(null);
	const summary = getRosterBalance({
		players: players as RosterBalancePlayer[],
		minutesByPid,
	});
	const openCategory = summary.categories.find(
		(category) => category.key === openCategoryKey,
	);
	const handleCategoryToggle = (
		key: RosterBalanceCategory["key"] | undefined,
		target?: HTMLElement,
	) => {
		if (key === undefined || key === openCategoryKey) {
			setOpenCategoryKey(undefined);
			setActiveTriggerElement(null);
			return;
		}

		setOpenCategoryKey(key);
		setActiveTriggerElement(target ?? null);
	};

	useEffect(() => {
		const handleResize = () => {
			setIsNarrow(window.innerWidth < 576);
		};
		window.addEventListener("resize", handleResize);
		return () => {
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	useEffect(() => {
		if (openCategoryKey === undefined) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpenCategoryKey(undefined);
				setActiveTriggerElement(null);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [openCategoryKey]);
	const popupTarget = isNarrow ? roleRowRef.current : activeTriggerElement;

	return (
		<HideableSection
			defaultShow={false}
			pageName="roster"
			title="Roster Balance"
		>
			<div className="small">
				<div className="d-flex flex-wrap gap-2">
					<PositionCounts label="Positions" values={summary.broadPositions} />
					<PositionCounts label="Coverage" values={summary.detailedPositions} />
				</div>
				<div className="text-body-secondary mt-1">
					Healthy position minutes:{" "}
					{DETAILED_POSITION_BUCKETS.map((position, i) => (
						<span key={position} className="text-nowrap">
							{i > 0 ? " · " : null}
							{position}{" "}
							{formatMinutes(summary.detailedPositionMinutes[position])} min
						</span>
					))}
				</div>
				<div
					ref={roleRowRef}
					className="d-flex flex-wrap align-items-baseline gap-2 mt-1"
				>
					<span className="text-body-secondary text-nowrap">
						Healthy plan minutes:
					</span>
					{summary.categories.map((category) => (
						<CategoryCoverage
							key={category.key}
							category={category}
							onToggle={handleCategoryToggle}
							show={openCategoryKey === category.key}
						/>
					))}
				</div>
			</div>
			{openCategory && popupTarget ? (
				<RoleCoveragePopover
					category={openCategory}
					target={popupTarget}
					onHide={() => {
						handleCategoryToggle(undefined);
					}}
				/>
			) : null}
		</HideableSection>
	);
};

export default RosterBalance;
