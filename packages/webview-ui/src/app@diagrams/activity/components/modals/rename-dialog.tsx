import { useEffect, useRef } from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import {
	DECISION_CONSTRUCTS,
	EXPANDABLE_CONSTRUCTS,
	LOOP_CONSTRUCTS,
	TERMINATOR_CONSTRUCTS,
} from '@react-diagrams/core/constructs';
import { toTrimmedNodeLabel } from '../../logic/rename-utils';

export type NodeEditDraft = {
	nodeId: string;
	nodeType: string;
	label: string;
	sourceText: string;
	deps?: string;
	construct?: string;
};

const DECISION_CONSTRUCT_OPTIONS = [...DECISION_CONSTRUCTS, 'unknown'] as const;
const LOOP_CONSTRUCT_OPTIONS = [...LOOP_CONSTRUCTS, 'unknown'] as const;
const EXPANDABLE_CONSTRUCT_OPTIONS = [...EXPANDABLE_CONSTRUCTS, 'unknown'] as const;
const ACTION_CONSTRUCT_OPTIONS = [...TERMINATOR_CONSTRUCTS, 'unknown'] as const;
const UNKNOWN_CONSTRUCT_OPTIONS = ['unknown'] as const;

function getConstructOptions(nodeType: string): readonly string[] {
	switch (nodeType) {
		case 'decision':
			return DECISION_CONSTRUCT_OPTIONS;
		case 'loop':
			return LOOP_CONSTRUCT_OPTIONS;
		case 'expandable':
			return EXPANDABLE_CONSTRUCT_OPTIONS;
		case 'action':
			return ACTION_CONSTRUCT_OPTIONS;
		default:
			return UNKNOWN_CONSTRUCT_OPTIONS;
	}
}

export type EdgeEditDraft = {
	edgeId: string;
	label: string;
	edgeType: 'default' | 'back';
};

// Labels produced by the diagram builder or recognized by code generation.
const EDGE_LABEL_OPTIONS = [
	'',
  'yes',
  'no',
  'each',
  'exception',
  'finally',
  'default',
  'case',
] as const;

const EDGE_TYPE_OPTIONS = [
	{ value: 'back', label: 'back (loop/back edge)' },
	{ value: 'default', label: 'default (normal edge)' },
] as const;

// ─── Node edit dialog ───────────────────────────────────────────────────────

type NodeDialogProps = {
	draft: NodeEditDraft;
	onChange: (next: NodeEditDraft) => void;
	onSave: () => void;
	onCancel: () => void;
};

export function NodeEditDialog({ draft, onChange, onSave, onCancel }: NodeDialogProps) {
	const sourceTextRef = useRef<HTMLTextAreaElement | null>(null);
	const constructOptions = getConstructOptions(draft.nodeType);
	const derivedLabel = toTrimmedNodeLabel(draft.sourceText);

	useEffect(() => {
		sourceTextRef.current?.focus();
	}, []);

	const handleCopy = () => {
		try {
			void navigator.clipboard?.writeText(draft.sourceText);
		} catch {
			// Clipboard API unavailable in this webview host — silently degrade.
		}
	};

	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-black/20 pt-20">
			<div className="w-[760px] max-w-[calc(100vw-48px)] rounded border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] p-4 shadow-xl">
				<div className="mb-3 text-sm font-semibold text-[var(--vscode-editor-foreground)]">
					Edit Node
				</div>

				<div className="mb-2 text-xs text-[var(--vscode-descriptionForeground)]">
					Label preview: <span className="font-mono">{derivedLabel || '(empty)'}</span>
				</div>

				
				<textarea
					ref={sourceTextRef}
					className="h-64 w-full resize-y rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
					value={draft.sourceText}
					placeholder="Node sourceText"
					onChange={(event) => {
						const sourceText = event.target.value;
						onChange({ ...draft, sourceText, label: toTrimmedNodeLabel(sourceText) });
					}}
					onKeyDown={(event) => {
						if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') onSave();
						if (event.key === 'Escape') onCancel();
					}}
				/>

				{draft.deps !== undefined && (
					<input
						className="mt-3 w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
						value={draft.deps}
						placeholder="deps"
						onChange={(event) => onChange({ ...draft, deps: event.target.value })}
					/>
				)}

				
					<select
						className="mt-3 w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
						value={draft.construct ?? 'unknown'}
						onChange={(event) => onChange({ ...draft, construct: event.target.value })}
					>
						{constructOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>

				<div className="mt-4 flex items-center gap-2">
					<VSCodeButton appearance="primary" onClick={onSave}>
						Save
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={onCancel}>
						Close
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={handleCopy}>
						Copy
					</VSCodeButton>
				</div>
			</div>
		</div>
	);
}

// ─── Edge edit dialog ───────────────────────────────────────────────────────

type EdgeDialogProps = {
	draft: EdgeEditDraft;
	onChange: (next: EdgeEditDraft) => void;
	onSave: () => void;
	onCancel: () => void;
};

export function EdgeEditDialog({ draft, onChange, onSave, onCancel }: EdgeDialogProps) {
	const inputRef = useRef<HTMLSelectElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-black/20 pt-20">
			<div className="w-[560px] max-w-[calc(100vw-48px)] rounded border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] p-4 shadow-xl">
				<div className="mb-3 text-sm font-semibold text-[var(--vscode-editor-foreground)]">
					Edit Edge
				</div>

				<select
					className="mb-3 w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
					value={draft.edgeType}
					onChange={(event) =>
						onChange({
							...draft,
							edgeType: event.target.value as EdgeEditDraft['edgeType'],
						})
					}
				>
					{EDGE_TYPE_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>

				<select
					ref={inputRef}
					className="w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
					value={draft.label === 'case' || draft.label.startsWith('case ') ? 'case' : draft.label}
					onChange={(event) => onChange({ ...draft, label: event.target.value })}
					onKeyDown={(event) => {
						if (event.key === 'Enter') onSave();
						if (event.key === 'Escape') onCancel();
					}}
				>
					{EDGE_LABEL_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option === '' ? '(no label)' : option}
						</option>
					))}
				</select>

				{(draft.label === 'case' || draft.label.startsWith('case ')) && (
					<input
						className="mt-2 w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
						value={draft.label.startsWith('case ') ? draft.label.slice(5) : ''}
						placeholder="case value  (e.g. 'success', 0, null)"
						onChange={(event) =>
							onChange({ ...draft, label: `case ${event.target.value}` })
						}
						onKeyDown={(event) => {
							if (event.key === 'Enter') onSave();
							if (event.key === 'Escape') onCancel();
						}}
					/>
				)}

				<div className="mt-4 flex items-center gap-2">
					<VSCodeButton appearance="primary" onClick={onSave}>
						Save
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={onCancel}>
						Close
					</VSCodeButton>
				</div>
			</div>
		</div>
	);
}