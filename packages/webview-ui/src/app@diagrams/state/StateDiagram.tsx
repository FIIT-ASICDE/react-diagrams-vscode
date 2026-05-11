import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { nodeTypes } from './rendering/nodes';
import { edgeTypes } from './rendering/edges';
import { renderXyFlow, type StateDiagramProps } from './rendering/render';
import StateDetailsPanel from './StateDetailsPanel';
import { downloadDiagramImage, htmlToImageToPng, snapdomToPngDataUrl } from '@/app@utils/utils';
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { cn } from '@/app@shadcn/lib/utils';
import { vscode } from '@/app@vscode/api';
import type { Message } from '@react-diagrams/core/app@vscode';
import { Camera, PanelRightClose, PanelRightOpen } from "lucide-react"
import type { Id, StateUpdate } from '@react-diagrams/core/app@state-diagram-model';

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
	const [isDetailsOpen, setIsDetailsOpen] = useState(false);
	const [hiddenStateVariableIds, setHiddenStateVariableIds] = useState<Set<Id>>(() => new Set());

	const modelCacheKey = useMemo(() => JSON.stringify(model ?? null), [model]);
	const stateVariableIds = useMemo(() => model?.stateVariables?.map(stVar => stVar.id) ?? [], [model?.stateVariables]);
	const hiddenStateVariableKey = useMemo(() => [...hiddenStateVariableIds].join('|'), [hiddenStateVariableIds]);
	const hasModel = useMemo(() => Boolean(model?.stateVariables?.length), [model]);

	const { bgColor, transitionRouting } = (window as any).CONFIG ?? {};

	useEffect(() => {
		let cancelled = false;

		renderXyFlow(model, transitionRouting, hiddenStateVariableIds).then((newState) => {
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
	}, [hiddenStateVariableIds, model, setEdges, setNodes, transitionRouting]);

	useEffect(() => {
		setCachedImage(null);
	}, [hiddenStateVariableKey, modelCacheKey]);

	useEffect(() => {
		setHiddenStateVariableIds((old) => {
			if (!old.size)
				return old;

			const availableStateVariableIds = new Set(model?.stateVariables?.map(stateVariable => stateVariable.id) ?? []);
			const next = new Set([...old].filter(stateVariableId => availableStateVariableIds.has(stateVariableId)));
			return next.size == old.size ? old : next;
		});
	}, [modelCacheKey, model?.stateVariables]);

	const onStateVariableHiddenChange = useCallback((stateVariableId: Id, hidden: boolean) => {
		setHiddenStateVariableIds(previous => {
			const next = new Set(previous);
			if (hidden) {
				next.add(stateVariableId);
				vscode.postMessage("onHideStateVariable", { stateVariableId });
			}
			else {
				next.delete(stateVariableId);
				vscode.postMessage("onShowStateVariable", { stateVariableId });
			}
			return next;
		});
	}, []);

	const onToggleAllStateVariables = useCallback(() => {
		setHiddenStateVariableIds(prev => { 
			// vscode.postMessage("onToggleAllStateVariables", { hide: !prev.size });
			return prev.size ? new Set() : new Set(stateVariableIds) 
		});
	}, [stateVariableIds]);

	const onDoubleClick = (event: React.MouseEvent, node: Node | StateUpdate) => {
		vscode.postMessage("nodeDblClick", { data: { ...((node as any)?.data ?? node), name: undefined, children: undefined } });
	}

	let pendingImgRequest = useRef<Promise<string | null> | null>(null);
	const onDiagramImage = useCallback(async (saveToDisk = true, useSnapdom = true) => { 
		console.debug("Image creation requested", saveToDisk);
		if (cachedImage) {
			vscode.postMessage("onDiagramImage", { dataUrl: cachedImage, saveToDisk });
			return;
		}

		try {
			const imageGenFn = useSnapdom ? snapdomToPngDataUrl : htmlToImageToPng;
			const dataUrl = await (pendingImgRequest.current ?? (pendingImgRequest.current = downloadDiagramImage(nodes, imageGenFn)));
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
				void onDiagramImage(event.data.data?.saveToDisk, event.data.data?.useSnapdom);
		};

		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [onDiagramImage]);

	return (
		<div className="flex h-full w-full">
			<div className="relative min-w-0 flex-1">
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
					fitViewOptions={fitToViewOptions}
					defaultEdgeOptions={{
						type: 'floating',
						markerEnd: { type: MarkerType.ArrowClosed },
					}}
					className='floating-edges'
					onNodeDoubleClick={onDoubleClick}
					style={{ background: bgColor == 'light' ? '#e8eaed' : (bgColor == 'dark' ? '#1f1f1f' : undefined) }}
					minZoom={0.25}
					maxZoom={2.25}
				>
					{hasModel && <>
						<VSCodeButton className={`z-10 absolute left-1.5 top-2 scale-[0.64] not-hover:opacity-85`} onClick={() => onDiagramImage(true)}>
							<Camera className="w-full h-full" />
						</VSCodeButton>
						<VSCodeButton className={`z-10 absolute right-1.5 top-2 scale-[0.64] not-hover:opacity-85`}
							onClick={() => setIsDetailsOpen(open => !open)}
							title={isDetailsOpen ? 'Collapse details panel' : 'Expand details panel'}
						>
							{isDetailsOpen ? <PanelRightClose className="w-full h-full" /> : <PanelRightOpen className="w-full h-full" />}
						</VSCodeButton>
						<AutoFitView ready={nodes.length > 0} />
						<Controls fitViewOptions={fitToViewOptions} className='not-hover:opacity-85 text-gray-400' />
						<MiniMap pannable zoomable style={{width: 150, height: 100 }} className='not-hover:opacity-85' nodeColor={minimapNodeColor} nodeStrokeColor={minimapNodeStrokeColor} />
					</>}
					<Background gap={18} size={1} />
				</ReactFlow>
			</div>

			<div className={cn(`h-full transition-[width] duration-200`, isDetailsOpen ? 'w-[clamp(340px,32vw,395px)]' : 'w-0 overflow-hidden')} onClick={(ev) => {
				if (ev.ctrlKey && ev.shiftKey) {
					console.debug(model);
					console.debug(JSON.stringify(model, (key, value) => value === "" ? undefined : value));
				}
			}}>
				<StateDetailsPanel model={model} hiddenStateVariableIds={hiddenStateVariableIds} onStateVariableHiddenChange={onStateVariableHiddenChange} onToggleAllStateVariables={onToggleAllStateVariables} onStateDoubleClick={onDoubleClick} />
			</div>
		</div>
	);
}
