import { useCallback, type MouseEvent } from "react";
import { Dropdown, Nav } from "react-bootstrap";
import {
	confirm,
	local,
	realtimeUpdate,
	toWorker,
	useLocal,
} from "../util/index.ts";
import type { Option } from "../../common/types.ts";
import clsx from "clsx";
import {
	formatKeyboardShortcut,
	getKeyboardShortcut,
	keyboardShortcuts,
	useKeyboardShortcuts,
	type KeyboardShortcutsLocal,
} from "../util/keyboardShortcuts.ts";

type PlayMenuShortcutAction = NonNullable<Option["keyboardShortcut"]>;

const getPlayMenuShortcutActions = (options: Option[]) => {
	const activeActions = new Set<PlayMenuShortcutAction>(
		options.flatMap((option) =>
			option.keyboardShortcut === undefined ? [] : [option.keyboardShortcut],
		),
	);
	return (
		Object.keys(keyboardShortcuts.playMenu) as PlayMenuShortcutAction[]
	).filter((action) => activeActions.has(action));
};

const getShortcutIdentity = (
	shortcut: NonNullable<ReturnType<typeof getKeyboardShortcut>>,
) =>
	JSON.stringify([
		shortcut.altKey,
		shortcut.ctrlKey,
		shortcut.metaKey,
		shortcut.shiftKey,
		shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key,
	]);

const removeDuplicateShortcutLabels = (
	options: Option[],
	keyboardShortcutsLocal: KeyboardShortcutsLocal,
	activeActions: PlayMenuShortcutAction[],
) => {
	const actionForShortcut = new Map<
		string,
		NonNullable<Option["keyboardShortcut"]>
	>();
	for (const action of activeActions) {
		const shortcut = getKeyboardShortcut(
			"playMenu",
			action,
			keyboardShortcutsLocal,
		);
		if (shortcut !== undefined) {
			const identity = getShortcutIdentity(shortcut);
			if (!actionForShortcut.has(identity)) {
				actionForShortcut.set(identity, action);
			}
		}
	}

	const displayedActions = new Set<NonNullable<Option["keyboardShortcut"]>>();
	return options.map((option) => {
		const action = option.keyboardShortcut;
		if (action === undefined) {
			return option;
		}
		const shortcut = getKeyboardShortcut(
			"playMenu",
			action,
			keyboardShortcutsLocal,
		);
		if (shortcut === undefined) {
			return { ...option, keyboardShortcut: undefined };
		}
		const identity = getShortcutIdentity(shortcut);
		if (
			actionForShortcut.get(identity) !== action ||
			displayedActions.has(action)
		) {
			return { ...option, keyboardShortcut: undefined };
		}
		displayedActions.add(action);
		return option;
	});
};

const handleOptionClick = (option: Option, event: MouseEvent) => {
	if (!option.url) {
		event.preventDefault();
		toWorker("playMenu", option.id as any, undefined);
	}
};

const PlayMenu = ({
	lid,
	spectator,
	options,
}: {
	lid: number | undefined;
	spectator: boolean;
	options: Option[];
}) => {
	const shortcutActions = getPlayMenuShortcutActions(options);

	useKeyboardShortcuts(
		"playMenu",
		shortcutActions,
		useCallback(
			async (action) => {
				const option = options.find(
					(option2) => option2.keyboardShortcut === action,
				);

				if (!option) {
					return;
				}

				if (window.location.pathname.includes("/live_game")) {
					const liveGameInProgress = local.getState().liveGameInProgress;
					if (liveGameInProgress) {
						const proceed = await confirm(
							"Are you sure you meant to press a Play Menu keyboard shortcut while watching a live sim?",
							{
								okText: "Yes",
								cancelText: "Cancel",
							},
						);
						if (!proceed) {
							return;
						}
					}
				}

				if (option.url) {
					realtimeUpdate([], option.url);
				} else {
					toWorker("playMenu", option.id as any, undefined);
				}
			},
			[options],
		),
	);

	const keyboardShortcutsLocal = useLocal((state) => state.keyboardShortcuts);
	const displayedOptions = removeDuplicateShortcutLabels(
		options,
		keyboardShortcutsLocal,
		shortcutActions,
	);

	if (lid === undefined) {
		return null;
	}

	return (
		<Dropdown
			className={`play-button-wrapper${
				window.mobile ? " dropdown-mobile" : ""
			}`}
			as={Nav.Item}
		>
			<Dropdown.Toggle
				className={clsx(
					"play-button",
					spectator ? "play-button-danger" : "play-button-success",
				)}
				id="play-button"
				as={Nav.Link}
			>
				Play
			</Dropdown.Toggle>
			<Dropdown.Menu>
				{displayedOptions.map((option, i) => {
					return (
						<Dropdown.Item
							key={i}
							href={option.url}
							onClick={(event: MouseEvent<any>) =>
								handleOptionClick(option, event)
							}
							className="kbd-parent"
						>
							{option.label}
							{option.keyboardShortcut ? (
								<span className="text-body-secondary kbd">
									{formatKeyboardShortcut(
										"playMenu",
										option.keyboardShortcut,
										keyboardShortcutsLocal,
									)}
								</span>
							) : null}
						</Dropdown.Item>
					);
				})}
			</Dropdown.Menu>
		</Dropdown>
	);
};

export default PlayMenu;
