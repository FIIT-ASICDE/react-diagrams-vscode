import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

type Props = {
	/** Re-frame only when this trigger changes (mode switch or navigator change). */
	focusTrigger: string;
};

/**
 * Re-frames the viewport when a new diagram becomes visible. Two-phase:
 *
 *   1. fitView to bring everything into view
 *   2. center on the start node (`initial`) at zoom 0.6, so the user
 *      always lands at the top of the flow rather than wherever fitView's
 *      bounding-box centroid happens to be
 *
 * Lives in its own file because it must be rendered INSIDE `<ReactFlow>`
 * to get access to `useReactFlow()`.
 */
export function AutoFitOnSnapshotChange({ focusTrigger }: Props) {
	const { fitView, getNodes, setCenter } = useReactFlow();

	useEffect(() => {
		

		const handle = window.requestAnimationFrame(() => {
			void fitView({ padding: 0.2 });

			const nodes = getNodes();
			const startNode = nodes.find((n) => n.type === 'initial') ?? nodes[0];
			if (!startNode) return;

			const x = startNode.position.x - (startNode.width ?? 0) / 2;
			const y = startNode.position.y;

			window.setTimeout(() => {
				setCenter(x, y, { zoom: 0.6, duration: 400 });
			}, 50);
		});

		return () => window.cancelAnimationFrame(handle);
	}, [focusTrigger, fitView, getNodes, setCenter]);

	return null;
}