const getBPMImpactSortValue = (p: { bpmImpact?: number }) =>
	p.bpmImpact ?? -Infinity;

export default getBPMImpactSortValue;
