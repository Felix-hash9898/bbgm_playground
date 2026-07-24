const clearLiveGameBPMI = (p: Record<string, any>) => {
	delete p.bpmImpact;
	delete p.singleGameBpm;
	p.offPossOn = 0;
	p.defPossOn = 0;
};

export default clearLiveGameBPMI;
