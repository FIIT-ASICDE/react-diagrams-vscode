import { VSCodeAPIWrapper } from '@react-diagrams/core/app@vscode';
import type { StateDiagram as StateDiagramModel } from '@react-diagrams/core/app@state-diagram-model';

export type UpdatePayload = {
	model?: StateDiagramModel
};

export const vscode = new VSCodeAPIWrapper<UpdatePayload>("webviewStateDiagram");