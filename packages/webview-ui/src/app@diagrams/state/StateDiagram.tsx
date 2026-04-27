import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { nodeTypes } from './rendering/nodes';
import { edgeTypes } from './rendering/edges';
import { renderXyFlow, type StateDiagramProps } from './rendering/render';
import { downloadDiagramImage, snapdomToPngDataUrl } from '@/app@utils/utils';
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { vscode } from '@/app@vscode/api';
import type { Message } from '@react-diagrams/core/app@vscode';
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

		return () => { cancelled = true };
	}, [model]);

	useEffect(() => {
		setCachedImage(null);
	}, [modelCacheKey]);

	const onDoubleClick = (event: React.MouseEvent, node: Node) => {
		vscode.postMessage("nodeDblClick", { data: { ...node.data, name: undefined, children: undefined } });
	}

	let pendingImgRequest = useRef<Promise<string | null> | null>(null);
	const onDiagramImage = useCallback(async (saveToDisk = true) => { 
		console.debug("Image requested", saveToDisk);
		if (cachedImage) {
			vscode.postMessage("onDiagramImage", { dataUrl: cachedImage, saveToDisk });
			return;
		}

		try {
			const dataUrl = await (pendingImgRequest.current ?? (pendingImgRequest.current = downloadDiagramImage(nodes, snapdomToPngDataUrl)));
			setCachedImage(dataUrl);
			vscode.postMessage("onDiagramImage", { dataUrl, saveToDisk });
		}
		catch (error) {
			console.error("Download failed", error);
		}
		finally {
			pendingImgRequest.current = null;
		}
	}, [nodes, cachedImage]);

	useEffect(() => {
		const onMessage = (event: MessageEvent<Message>) => {
			// console.debug("Received message", event.data.data);
			if (event.data?.type == 'requestDiagramImage')
				void onDiagramImage(event.data.data?.saveToDisk);
		};

		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [onDiagramImage]);

	return (
		<div className="h-full w-full">
			{!hasModel && (
				<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 rounded border border-(--vscode-editorWidget-border) px-3 py-2 text-gray-400 text-center">
					State diagram can't be generated from the current code. Please make sure you export default valid React components that has at least one active state variable.
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
						onClick={() => onDiagramImage(true)}
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
