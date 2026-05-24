import type { Node } from '@xyflow/react';
import type { ViewMode } from './Toolbar';
import { SourcePreviewPanel } from '../modals/SourcePreviewPanel';
import {
	EdgeEditDialog,
	NodeEditDialog,
	type EdgeEditDraft,
	type NodeEditDraft,
} from '../modals/rename-dialog';



export type ModalState =
	| { type: 'preview'; node: Node }
	| { type: 'nodeEdit'; draft: NodeEditDraft }
	| { type: 'edgeEdit'; draft: EdgeEditDraft }
	| null;

type DiagramModalsProps = {
	modalState: ModalState;
	viewMode: ViewMode;

	onClose: () => void;

	onNodeEditChange: (draft: NodeEditDraft) => void;
	onNodeEditSave: () => void;

	onEdgeEditChange: (draft: EdgeEditDraft) => void;
	onEdgeEditSave: () => void;
};




// Returns node full text.
function getNodeFullText(node: Node | null): string {
	if (!node) return '';
	const data = (node.data ?? {}) as Record<string, unknown>;
	return String(data.sourceText ?? data.label ?? '').trim();
}




// Handles diagram modals.
export function DiagramModals({
	modalState,
	viewMode,
	onClose,
	onNodeEditChange,
	onNodeEditSave,
	onEdgeEditChange,
	onEdgeEditSave,
}: DiagramModalsProps) {
	const isPlayground = viewMode === 'playground';
	const previewNode = modalState?.type === 'preview' ? modalState.node : null;
	const nodeEditDraft = modalState?.type === 'nodeEdit' ? modalState.draft : null;
	const edgeEditDraft = modalState?.type === 'edgeEdit' ? modalState.draft : null;

	return (
		<>
			{viewMode === 'viewer' && previewNode && (
				<SourcePreviewPanel
					node={previewNode}
					sourceText={getNodeFullText(previewNode)}
					onClose={onClose}
				/>
			)}

			{isPlayground && nodeEditDraft && (
				<NodeEditDialog
					draft={nodeEditDraft}
					onChange={onNodeEditChange}
					onSave={onNodeEditSave}
					onCancel={onClose}
				/>
			)}

			{isPlayground && edgeEditDraft && (
				<EdgeEditDialog
					draft={edgeEditDraft}
					onChange={onEdgeEditChange}
					onSave={onEdgeEditSave}
					onCancel={onClose}
				/>
			)}
		</>
	);
}
