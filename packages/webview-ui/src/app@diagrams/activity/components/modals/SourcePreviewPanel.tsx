import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { Node } from '@xyflow/react';

type Props = {
	node: Node;
	sourceText: string;
	onClose: () => void;
};

/**
 * Read-only side panel shown in viewer mode when the user right-clicks a
 * node. Displays the node's full sourceText with a Copy button.
 */
export function SourcePreviewPanel({ node, sourceText, onClose }: Props) {
	const label = String((node.data as { label?: unknown } | undefined)?.label ?? node.id);
	const construct = String((node.data as { construct?: unknown } | undefined)?.construct ?? 'unknown');
	const handleCopy = () => {
		try {
			void navigator.clipboard?.writeText(sourceText);
		} catch {
			// Clipboard API unavailable in this webview host.
		}
	};

	return (
		<div className="absolute right-3 top-3 z-20 w-[520px] max-w-[calc(100vw-24px)] rounded border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] p-4 shadow-xl">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p>{construct}</p>
					<div className="truncate text-sm font-semibold text-[var(--vscode-editor-foreground)]">
						Node Source
					</div>
					<div className="truncate text-xs text-[var(--vscode-descriptionForeground)]">
						{label}
					</div>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					<VSCodeButton appearance="secondary" onClick={handleCopy}>
						Copy
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={onClose}>
						Close
					</VSCodeButton>
				</div>
			</div>

			<pre className="max-h-[72vh] overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] p-3 text-xs leading-relaxed text-[var(--vscode-input-foreground)]">
				{sourceText || 'No sourceText available for this node.'}
			</pre>
		</div>
	);
}