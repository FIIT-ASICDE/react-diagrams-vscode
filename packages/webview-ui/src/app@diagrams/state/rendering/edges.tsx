import CustomFloatingEdge from '@/app@components/xyflow-react/components/CustomFloatingEdge';
import type { EdgeTypes } from '@xyflow/react';

export const edgeTypes: EdgeTypes = {
	floating: CustomFloatingEdge as EdgeTypes['floating'],
};