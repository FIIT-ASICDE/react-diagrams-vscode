import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { nodeTypes } from './rendering/nodes';
import { edgeTypes } from './rendering/edges';
import { renderXyFlow, type StateDiagramProps } from './rendering/render';
import { downloadDiagramImage, snapdomToPngDataUrl } from '@/app@utils/utils';
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { vscode } from '@/app@vscode/api';
// import { toPng } from 'html-to-image';

const fitToViewOptions = { padding: 0.025, duration: 100 };

function AutoFitView({ ready }: { ready: boolean }) {
	const { fitView } = useReactFlow();

	useEffect(() => {
		if (ready) {
			void fitView(fitToViewOptions);
		}
	}, [fitView, ready]);

	return null;
}

const minimapNodeColor = node => node.type == 'labeledGroupNode' ? 'transparent' : node.data?.color ?? 'gray';
const minimapNodeStrokeColor = node => node.type == 'labeledGroupNode' ? node.data?.color ?? 'gray' : 'transparent';

export default function StateDiagram({ model }: StateDiagramProps) {
	const [nodes, setNodes] = useNodesState<Node>([]);
	const [edges, setEdges] = useEdgesState<Edge>([]);
	const [cachedImage, setCachedImage] = useState<string | null>(null);

	const modelCacheKey = useMemo(() => JSON.stringify(model ?? null), [model]);
	const hasModel = useMemo(() => Boolean(model?.stateVariables?.length), [model]);

	const { bgColor, transitionRouting } = (window as any).CONFIG ?? {};

	useEffect(() => {
		let cancelled = false;

		renderXyFlow(model, transitionRouting).then((newState) => {
			if (!cancelled) {
				setNodes(newState.nodes);
				setEdges(newState.edges);
				// console.log(newState.nodes, newState.edges);
			}
		}).catch((error) => {
			console.error('Failed to layout state diagram with ELK', error);
			if (!cancelled) {
				setNodes([]);
				setEdges([]);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [model]);

	useEffect(() => {
		setCachedImage(null);
	}, [modelCacheKey]);

	const onDoubleClick = (event: React.MouseEvent, node: Node) => {
		vscode.postMessage("nodeDblClick", { data: { ...node.data, name: undefined, children: undefined } });
	}

	let pendingImgRequest: Promise<string | null> | null = null;
	const onDiagramImage = async () => { 
		if (cachedImage) {
			vscode.postMessage("onDiagramImage", { dataUrl: cachedImage });
			return;
		}

		try {
			const dataUrl = await (pendingImgRequest ?? (pendingImgRequest = downloadDiagramImage(nodes, snapdomToPngDataUrl)));
			setCachedImage(dataUrl);
			vscode.postMessage("onDiagramImage", { dataUrl }) 
		}
		finally {
			pendingImgRequest = null;
		}
	}

	return (
		<div className="h-full w-full">
			{!hasModel && (
				<div className="absolute z-10 rounded border border-(--vscode-editorWidget-border) bg-(--vscode-editorWidget-background) px-3 py-2 text-(--vscode-descriptionForeground)">
					No state variables found.
				</div>
			)}
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodesConnectable={false}
				elementsSelectable
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				// connectionLineComponent={FloatingConnectionLine}
				fitViewOptions={fitToViewOptions}
				defaultEdgeOptions={{
					type: 'floating',
					markerEnd: { type: MarkerType.ArrowClosed },
				}}
				className='floating-edges'
				onNodeDoubleClick={onDoubleClick}
				style={{ background: bgColor == 'light' ? '#e8eaed' : (bgColor == 'dark' ? '#1f1f1f' : undefined) }}
			>
				{hasModel && <>
					<VSCodeButton
						className={`z-10 absolute left-2.25 top-2.5 scale-[0.8]`}
						onClick={onDiagramImage}
					>
						Image
					</VSCodeButton>
					<AutoFitView ready={nodes.length > 0} />
					<Controls fitViewOptions={fitToViewOptions} />
					<MiniMap pannable zoomable style={{width: 150, height: 100 }} nodeColor={minimapNodeColor} nodeStrokeColor={minimapNodeStrokeColor} />
				</>}
				<Background gap={18} size={1} />
			</ReactFlow>
		</div>
	);
}
