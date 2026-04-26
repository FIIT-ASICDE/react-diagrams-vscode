import { useState } from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import type { ActivityNodeType } from '../model/types';

export type ViewMode = 'viewer' | 'playground';

type Props = {
	mode: ViewMode;
	currentTitle: string;
	canGoBack: boolean;
	onBack: () => void;
	onSwitchToViewer: () => void;
	onSwitchToPlayground: () => void;
	onLoadCurrentIntoPlayground: () => void;
	onAddNode: (type: ActivityNodeType) => void;
	onClearPlayground: () => void;
	onGenerateSkeleton: () => void;
};

const ADD_BUTTONS: { type: ActivityNodeType; label: string }[] = [
	{ type: 'start', label: 'Start' },
	{ type: 'action', label: 'Action' },
	{ type: 'decision', label: 'Decision' },
	{ type: 'merge', label: 'Merge' },
	{ type: 'expandable', label: 'Expandable' },
	{ type: 'end', label: 'End' },
];

export function DiagramToolbar({
	mode,
	currentTitle,
	canGoBack,
	onBack,
	onSwitchToViewer,
	onSwitchToPlayground,
	onLoadCurrentIntoPlayground,
	onAddNode,
	onClearPlayground,
	onGenerateSkeleton,
}: Props) {
	const [addMenuOpen, setAddMenuOpen] = useState(false);

	const isViewer = mode === 'viewer';
	const isPlayground = mode === 'playground';

	return (
		<div className="absolute left-2 top-2 z-10 w-[360px] rounded-lg border border-zinc-700/70 bg-zinc-950/95 shadow-xl backdrop-blur">
			<div className="flex h-10 items-center gap-2 border-b border-zinc-800 px-2">
				<VSCodeButton
					appearance="secondary"
					disabled={isPlayground || !canGoBack}
					onClick={onBack}
				>
					←
				</VSCodeButton>

				<VSCodeButton
					appearance={isViewer ? 'primary' : 'secondary'}
					onClick={onSwitchToViewer}
				>
					Viewer
				</VSCodeButton>

				<VSCodeButton
					appearance={isPlayground ? 'primary' : 'secondary'}
					onClick={onSwitchToPlayground}
				>
					Playground
				</VSCodeButton>
			</div>

			<div className="break-words px-3 py-1.5 text-xs text-zinc-300">
				{isPlayground ? 'Playground' : currentTitle}
			</div>

			{isViewer && (
				<div className="border-t border-zinc-800 px-2 py-2">
					<VSCodeButton appearance="secondary" className="w-full" onClick={onLoadCurrentIntoPlayground}>
						Edit Copy
					</VSCodeButton>
				</div>
			)}

			{isPlayground && (
				<div className="flex items-center gap-2 border-t border-zinc-800 px-2 py-2">
					<div className="relative flex-1">
						<VSCodeButton
							appearance="secondary"
							className="w-full"
							onClick={() => setAddMenuOpen((open) => !open)}
						>
							+ Add Node
						</VSCodeButton>

						{addMenuOpen && (
							<div className="absolute left-0 top-9 z-20 w-full overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 shadow-xl">
								{ADD_BUTTONS.map(({ type, label }) => (
									<button
										key={type}
										type="button"
										className="block w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800"
										onClick={() => {
											onAddNode(type);
											setAddMenuOpen(false);
										}}
									>
										{label}
									</button>
								))}
							</div>
						)}
					</div>

					<VSCodeButton appearance="primary" onClick={onGenerateSkeleton}>
						Generate
					</VSCodeButton>

					<VSCodeButton appearance="secondary" onClick={onClearPlayground}>
						Clear
					</VSCodeButton>
				</div>
			)}
		</div>
	);
}