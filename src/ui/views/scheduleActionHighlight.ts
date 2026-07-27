const shouldHighlightScheduleAction = (
	viewedTid: number,
	gameTids: [number, number],
	userTids: number[],
) =>
	!userTids.includes(viewedTid) &&
	gameTids.some((gameTid) => userTids.includes(gameTid));

export default shouldHighlightScheduleAction;
