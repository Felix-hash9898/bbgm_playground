import { arrayMove } from "@dnd-kit/sortable";

type PlayerWithPid = {
	pid: number;
};

export const movePlayerPids = (
	players: PlayerWithPid[],
	oldIndex: number,
	newIndex: number,
) =>
	arrayMove(
		players.map((p) => p.pid),
		oldIndex,
		newIndex,
	);

export const swapPlayerPids = (
	players: PlayerWithPid[],
	index1: number,
	index2: number,
) => {
	const pids = players.map((p) => p.pid);
	[pids[index1], pids[index2]] = [pids[index2]!, pids[index1]!];
	return pids;
};
