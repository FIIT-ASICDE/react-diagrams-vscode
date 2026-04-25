import RoutableEdge from '@/app@components/xyflow-react/components/RoutableEdge';
import type { EdgeTypes } from '@xyflow/react';

export const edgeTypes: EdgeTypes = {
	routable: RoutableEdge as EdgeTypes['routable'],
};