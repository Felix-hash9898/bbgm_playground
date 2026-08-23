import clsx from "clsx";
import { type Ref, useCallback, useEffect, useRef, useState } from "react";
import RatingsStats from "./RatingsStats.tsx";
import WatchBlock from "../WatchBlock.tsx";
import { helpers } from "../../util/index.ts";
import toWorker from "../../util/toWorker.ts";
import ResponsivePopover from "../ResponsivePopover.tsx";
import { PLAYER } from "../../../common/index.ts";
import { crossTabEmitter } from "../../util/crossTabEmitter.ts";

const PlayerNote = ({
	className,
	note,
}: {
	className?: string;
	note: string;
}) => {
	return (
		<>
			<div
				className={clsx("text-wrap", className)}
				style={{
					maxHeight: "7em",
					overflowY: "auto",
				}}
			>
				{note}
			</div>
		</>
	);
};

const Icon = ({
	onClick,
	ref,
	watch,
}: {
	onClick?: () => void;
	ref?: Ref<HTMLSpanElement>;
	watch: number;
}) => {
	return (
		<span
			ref={ref}
			className={clsx(
				"glyphicon glyphicon-stats watch",
				watch === 0 ? undefined : `watch-active-${watch}`,
			)}
			data-no-row-highlight="true"
			title="View ratings and stats"
			onClick={onClick}
		/>
	);
};

type Props = {
	// "default" means this is the default of an uncontrolled value, similar to defaultValue in React
	// undefined means "we don't know the watch value, so get it on initial load"
	defaultWatch?: number;
	disableNameLink?: boolean;
	pid: number;
	playoffsCombined?: "regularSeason" | "playoffs" | "combined";
	season?: number;
	allowPlayoffsToggle?: boolean;
};

const RatingsStatsPopover = ({
	defaultWatch,
	disableNameLink,
	pid,
	playoffsCombined,
	season,
	allowPlayoffsToggle,
}: Props) => {
	const defaultPlayoffs =
		playoffsCombined === "playoffs" ? "playoffs" : "regularSeason";
	const [selectedPlayoffs, setSelectedPlayoffs] = useState<
		"regularSeason" | "playoffs"
	>(defaultPlayoffs);
	const selectedPlayoffsRef = useRef<"regularSeason" | "playoffs">(
		defaultPlayoffs,
	);
	const [prevProps, setPrevProps] = useState({
		pid,
		season,
		playoffsCombined,
	});

	const requestIdRef = useRef<number>(0);

	if (
		prevProps.pid !== pid ||
		prevProps.season !== season ||
		prevProps.playoffsCombined !== playoffsCombined
	) {
		setPrevProps({ pid, season, playoffsCombined });
		selectedPlayoffsRef.current = defaultPlayoffs;
		setSelectedPlayoffs(defaultPlayoffs);
		requestIdRef.current++;
	}

	const activePlayoffsCombined = allowPlayoffsToggle
		? selectedPlayoffs
		: playoffsCombined;

	const [loadingData, setLoadingData] = useState<boolean>(false);
	const [player, setPlayer] = useState<{
		abbrev?: string;
		tid?: number;
		age?: number;
		jerseyNumber?: string;
		name?: string;
		ratings?: {
			pos: string;
			ovr: number;
			pot: number;
			hgt: number;
			stre: number;
			spd: number;
			endu: number;
			season: number;
		};
		stats?: {
			[key: string]: number;
		};
		pid: number;
		playoffsCombined?: "regularSeason" | "playoffs" | "combined";
		season?: number;
		type?: "career" | "current" | "draft" | number;
		note?: string;
	}>({
		pid,
		playoffsCombined: activePlayoffsCombined,
		season,
	});

	const [watch, setWatch] = useState(defaultWatch ?? 0);
	useEffect(() => {
		if (defaultWatch === undefined) {
			// Need to fetch initial value
			(async () => {
				const newLocalWatch = await toWorker("main", "getPlayerWatch", pid);
				setWatch(newLocalWatch);
			})();
		} else {
			// This happens when switching to a new pid but defaultWatch is supplied
			setWatch(defaultWatch);
		}

		// Need to listen for bulk action updates
		const unbind = crossTabEmitter.on("updateWatch", async (watchByPid) => {
			const newWatch = watchByPid[pid];
			if (newWatch !== undefined) {
				setWatch(newWatch);
			}
		});
		return unbind;
	}, [defaultWatch, pid]);

	useEffect(() => {
		const reqRef = requestIdRef;
		return () => {
			reqRef.current++;
		};
	}, []);

	// Object.is to handle NaN
	if (
		!Object.is(player.pid, pid) ||
		player.season !== season ||
		player.playoffsCombined !== activePlayoffsCombined
	) {
		setLoadingData(false);
		setPlayer({
			pid,
			playoffsCombined: activePlayoffsCombined,
			season,
		});
	}

	const loadData = useCallback(
		async (
			targetPlayoffsCombined?: "regularSeason" | "playoffs" | "combined",
		) => {
			const currentType = targetPlayoffsCombined ?? activePlayoffsCombined;
			const requestId = ++requestIdRef.current;
			setLoadingData(true);
			try {
				const p = await toWorker("main", "ratingsStatsPopoverInfo", {
					pid,
					playoffsCombined: currentType,
					season,
				});
				if (requestId !== requestIdRef.current) {
					return;
				}
				setPlayer({
					abbrev: p.abbrev,
					tid: p.tid,
					age: p.age,
					jerseyNumber: p.jerseyNumber,
					name: p.name,
					ratings: p.ratings,
					stats: p.stats,
					pid,
					playoffsCombined: currentType,
					season,
					type: p.type,
					note: p.note,
				});
			} finally {
				if (requestId === requestIdRef.current) {
					setLoadingData(false);
				}
			}
		},
		[activePlayoffsCombined, pid, season],
	);

	const handlePlayoffsToggle = async (
		newType: "regularSeason" | "playoffs",
	) => {
		if (newType === selectedPlayoffsRef.current) {
			return;
		}
		selectedPlayoffsRef.current = newType;
		setSelectedPlayoffs(newType);
		await loadData(newType);
	};

	const toggle = useCallback(() => {
		if (!loadingData) {
			loadData();
		}
	}, [loadData, loadingData]);

	const { abbrev, tid, age, jerseyNumber, name, ratings, stats, type, note } =
		player;

	// JTODO: this probably makes a bit more sense as a component instead of a pure jsx function?
	let nameBlock = null;
	if (name) {
		nameBlock = (
			<div className="d-flex">
				{jerseyNumber ? (
					<div className="text-body-secondary jersey-number-popover align-self-end me-1">
						{jerseyNumber}
					</div>
				) : null}
				{disableNameLink ? (
					<b>{name}</b>
				) : (
					<a
						href={helpers.leagueUrl(["player", pid])}
						className="fw-bold text-truncate"
					>
						{name}
					</a>
				)}
				{ratings !== undefined ? (
					<div className="ms-1">{ratings.pos}</div>
				) : null}
				{abbrev !== undefined && tid !== undefined && tid !== PLAYER.RETIRED ? (
					<a
						href={helpers.leagueUrl([
							"roster",
							`${abbrev}_${tid}`,
							ratings ? ratings.season : undefined,
						])}
						className="ms-1"
					>
						{abbrev}
					</a>
				) : null}
				{age !== undefined ? (
					<div className="ms-1 flex-shrink-0">{age} yo</div>
				) : null}
				<WatchBlock
					pid={pid}
					watch={watch}
					onChange={(newWatch) => {
						// Update locally even though we'll get a crossTabEmitter event too, both for responsiveness and so it works in exhibition games
						setWatch(newWatch);
					}}
				/>
			</div>
		);
	}

	const id = `ratings-stats-popover-${player.pid}`;

	const playoffsToggle = allowPlayoffsToggle ? (
		<div
			className="btn-group btn-group-sm mb-2"
			role="group"
			aria-label="Season type"
		>
			<button
				type="button"
				className={clsx(
					"btn",
					activePlayoffsCombined === "regularSeason"
						? "btn-primary"
						: "btn-light-bordered",
				)}
				onClick={() => {
					void handlePlayoffsToggle("regularSeason");
				}}
			>
				Regular
			</button>
			<button
				type="button"
				className={clsx(
					"btn",
					activePlayoffsCombined === "playoffs"
						? "btn-primary"
						: "btn-light-bordered",
				)}
				onClick={() => {
					void handlePlayoffsToggle("playoffs");
				}}
			>
				Playoffs
			</button>
		</div>
	) : null;

	const modalHeader = nameBlock;
	const modalBody = (
		<>
			{playoffsToggle}
			<RatingsStats ratings={ratings} stats={stats} type={type} />
			{note ? <PlayerNote className="mt-2" note={note} /> : null}
		</>
	);

	const popoverContent = (
		<div
			className="text-nowrap"
			style={{
				minWidth: 250,
			}}
		>
			<div className="mb-2">{nameBlock}</div>
			{playoffsToggle}
			<RatingsStats ratings={ratings} stats={stats} type={type} />
			{note ? <PlayerNote className="mt-2" note={note} /> : null}
		</div>
	);

	const renderTarget = ({
		forwardedRef,
		onClick,
	}: {
		forwardedRef?: Ref<HTMLSpanElement>;
		onClick?: () => void;
	}) => <Icon ref={forwardedRef} onClick={onClick} watch={watch} />;

	return (
		<ResponsivePopover
			id={id}
			modalHeader={modalHeader}
			modalBody={modalBody}
			popoverContent={popoverContent}
			renderTarget={renderTarget}
			toggle={toggle}
		/>
	);
};

export default RatingsStatsPopover;
