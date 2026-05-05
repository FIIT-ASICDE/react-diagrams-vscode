import type { ActivityNodeType } from '../../model/types';

export type ViewMode = 'viewer' | 'playground';

type Props = {
	mode: ViewMode;
	currentTitle: string;
	nodeCount: number;
	edgeCount: number;
	canGoBack: boolean;
	onBack: () => void;
	onSwitchToViewer: () => void;
	onSwitchToPlayground: () => void;
	onAddNode: (type: ActivityNodeType) => void;
	onClearPlayground: () => void;
	onGenerateSkeleton: () => void;
	onSavePng: () => void;
};

const NODE_BUTTONS: { type: ActivityNodeType; label: string; symbol: string }[] = [
	{ type: 'start',      label: 'Start',      symbol: '◉' },
	{ type: 'action',     label: 'Action',     symbol: '▭' },
	{ type: 'decision',   label: 'Decision',   symbol: '◇' },
	{ type: 'merge',      label: 'Merge',      symbol: '⋈' },
	{ type: 'loop',       label: 'Loop',       symbol: '↺' },
	{ type: 'end',        label: 'End',        symbol: '⊛' },
];

// ─── Shared primitive styles ─────────────────────────────────────────────────

const BASE_BTN =
	'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-40 cursor-pointer';

const GHOST_BTN =
	`${BASE_BTN} text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]`;

const PRIMARY_BTN =
	`${BASE_BTN} bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]`;

const DANGER_BTN =
	`${BASE_BTN} text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-inputValidation-errorBackground,rgba(255,0,0,.12))]`;

function Separator() {
	return <div className="mx-1 h-4 w-px shrink-0 bg-[var(--vscode-panel-border)]" />;
}

export function DiagramToolbar({
	mode,
	currentTitle,
	nodeCount,
	edgeCount,
	canGoBack,
	onBack,
	onSwitchToViewer,
	onSwitchToPlayground,
	onAddNode,
	onClearPlayground,
	onGenerateSkeleton,
	onSavePng,
}: Props) {
	const isViewer = mode === 'viewer';
	const isPlayground = mode === 'playground';

	return (
		<div
			className="z-10 flex flex-col border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] select-none shrink-0"
			style={{ boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}
		>
			{/* ── Primary bar ────────────────────────────────────────── */}
			<div className="flex h-9 items-center gap-0.5 px-2">
				{/* Back */}
				<button
					type="button"
					className={GHOST_BTN}
					disabled={!canGoBack || isPlayground}
					onClick={onBack}
					title="Back"
				>
					<span>←</span>
					<span>Back</span>
				</button>

				<Separator />

				{/* Mode toggle — pill tabs */}
				<div
					className="flex overflow-hidden rounded border border-[var(--vscode-panel-border)]"
					role="tablist"
				>
					<button
						type="button"
						role="tab"
						aria-selected={isViewer}
						className={`${BASE_BTN} rounded-none px-3 ${
							isViewer
								? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
								: 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
						}`}
						onClick={onSwitchToViewer}
					>
						Viewer
					</button>
					<div className="w-px shrink-0 bg-[var(--vscode-panel-border)]" />
					<button
						type="button"
						role="tab"
						aria-selected={isPlayground}
						className={`${BASE_BTN} rounded-none px-3 ${
							isPlayground
								? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
								: 'text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]'
						}`}
						onClick={onSwitchToPlayground}
					>
						Playground
					</button>
				</div>

				<Separator />

				{/* Title */}
				<span
					className="flex-1 truncate text-xs text-[var(--vscode-descriptionForeground)]"
					title={isPlayground ? 'Playground' : currentTitle}
				>
					{isPlayground ? 'Playground' : currentTitle}
				</span>

				<span
					className="shrink-0 rounded border border-[var(--vscode-panel-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--vscode-descriptionForeground)]"
					title="Current diagram node and edge counts"
				>
					N: {nodeCount} | E: {edgeCount}
				</span>

				<Separator />

				{/* Save PNG */}
				<button
					type="button"
					className={GHOST_BTN}
					onClick={onSavePng}
					title="Save diagram as PNG"
				>
					<span aria-hidden="true">⬇</span>
					<span>PNG</span>
				</button>
			</div>

			{/* ── Playground action bar ───────────────────────────────── */}
			{isPlayground && (
				<div className="flex h-8 items-center gap-0.5 border-t border-[var(--vscode-panel-border)] px-2">
					{/* Add-node label */}
					<span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
						Add
					</span>

					{/* Node type buttons */}
					{NODE_BUTTONS.map(({ type, label, symbol }) => (
						<button
							key={type}
							type="button"
							className={GHOST_BTN}
							onClick={() => onAddNode(type)}
							title={`Add ${label} node`}
						>
							<span aria-hidden="true">{symbol}</span>
							<span>{label}</span>
						</button>
					))}

					{/* Spacer */}
					<div className="flex-1" />

					<Separator />

					{/* Generate */}
					<button
						type="button"
						className={PRIMARY_BTN}
						onClick={onGenerateSkeleton}
						title="Generate code skeleton from diagram"
					>
						<span>Generate Skeleton</span>
					</button>

					{/* Clear */}
					<button
						type="button"
						className={DANGER_BTN}
						onClick={onClearPlayground}
						title="Clear playground"
					>
						<span>Clear</span>
					</button>
				</div>
			)}
		</div>
	);
}