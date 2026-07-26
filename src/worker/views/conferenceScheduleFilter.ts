export const isGameInConference = (
	game: {
		awayTid: number;
		homeTid: number;
	},
	tids: Set<number>,
) =>
	(game.homeTid === -1 && game.awayTid === -2) ||
	(game.homeTid === -3 && game.awayTid === -3) ||
	tids.has(game.awayTid) ||
	tids.has(game.homeTid);
