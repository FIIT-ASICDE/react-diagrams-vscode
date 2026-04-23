import CustomFloatingEdge from '@/app@components/xyflow-react/components/CustomFloatingEdge';
import PathableEdge from '@/app@components/xyflow-react/components/PathableEdge';
import type { EdgeTypes } from '@xyflow/react';

export const edgeTypes: EdgeTypes = {
	floating: CustomFloatingEdge as EdgeTypes['floating'],
	pathable: PathableEdge as EdgeTypes['pathable'],
};