import FloatingEdge from '@/app@components/xyflow-react/components/FloatingEdge';
import type { EdgeTypes } from '@xyflow/react';

export const edgeTypes: EdgeTypes = {
	floating: FloatingEdge as EdgeTypes['floating'],
};