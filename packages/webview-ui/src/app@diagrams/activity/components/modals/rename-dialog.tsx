import { useEffect, useRef } from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

export type NodeEditDraft = {
	nodeId: string;
	nodeType: string;
	label: string;
	sourceText: string;
	deps?: string;
	construct?: string;
};

const DECISION_CONSTRUCT_OPTIONS = ['if', 'switch', 'try', 'unknown'] as const;
const LOOP_CONSTRUCT_OPTIONS = ['while', 'do-while', 'for', 'for-of', 'for-in', 'foreach', 'unknown'] as const;
const EXPANDABLE_CONSTRUCT_OPTIONS = ['function', 'hook', 'unknown'] as const;
const ACTION_CONSTRUCT_OPTIONS = ['return', 'throw', 'break', 'continue', 'unknown'] as const;
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
};

// ─── Node edit dialog ───────────────────────────────────────────────────────

type NodeDialogProps = {
	draft: NodeEditDraft;
	onChange: (next: NodeEditDraft) => void;
	onSave: () => void;
	onCancel: () => void;
};

export function NodeEditDialog({ draft, onChange, onSave, onCancel }: NodeDialogProps) {
	const labelRef = useRef<HTMLInputElement | null>(null);
	const constructOptions = getConstructOptions(draft.nodeType);

	useEffect(() => {
		labelRef.current?.focus();
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

				<input
					ref={labelRef}
					className="mb-3 w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
					value={draft.label}
					placeholder="Node label"
					onChange={(event) => onChange({ ...draft, label: event.target.value })}
					onKeyDown={(event) => {
						if (event.key === 'Escape') onCancel();
					}}
				/>

				
				<textarea
					className="h-64 w-full resize-y rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
					value={draft.sourceText}
					placeholder="Node sourceText"
					onChange={(event) => onChange({ ...draft, sourceText: event.target.value })}
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
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-black/20 pt-20">
			<div className="w-[560px] max-w-[calc(100vw-48px)] rounded border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] p-4 shadow-xl">
				<div className="mb-3 text-sm font-semibold text-[var(--vscode-editor-foreground)]">
					Edit Edge Label
				</div>

				<input
					ref={inputRef}
					className="w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
					value={draft.label}
					placeholder="Edge label"
					onChange={(event) => onChange({ ...draft, label: event.target.value })}
					onKeyDown={(event) => {
						if (event.key === 'Enter') onSave();
						if (event.key === 'Escape') onCancel();
					}}
				/>

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