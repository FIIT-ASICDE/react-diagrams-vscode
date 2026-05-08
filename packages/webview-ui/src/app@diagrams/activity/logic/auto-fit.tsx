import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

type Props = {
	
	focusTrigger: string;
};



// Handles auto fit on snapshot change.
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