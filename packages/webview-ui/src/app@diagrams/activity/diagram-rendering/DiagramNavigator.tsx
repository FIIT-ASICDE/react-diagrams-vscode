import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

type DiagramNavigatorProps = {
	stackTitles: string[];
	onNavigateTo: (stackIndex: number) => void;
};

export default function DiagramNavigator({ stackTitles, onNavigateTo }: DiagramNavigatorProps) {
	const inPreview = stackTitles.length > 0;

	return (
		<div className="rounded border border-[var(--vscode-widget-border)] bg-[var(--vscode-editor-background)] p-2 text-xs text-[var(--vscode-foreground)]">
			<div className="mb-2 flex items-center justify-between">
				<span className="font-medium">Navigation</span>
				<div className="flex items-center gap-1">
					<VSCodeButton appearance="secondary" disabled={!inPreview} onClick={() => onNavigateTo(stackTitles.length - 2)}>
						Back
					</VSCodeButton>
					<VSCodeButton appearance="secondary" disabled={!inPreview} onClick={() => onNavigateTo(-1)}>
						Root
					</VSCodeButton>
				</div>
			</div>
			<div className="flex flex-col gap-1">
				<VSCodeButton appearance={inPreview ? 'secondary' : 'primary'} onClick={() => onNavigateTo(-1)}>
					root.tsx
				</VSCodeButton>
				{stackTitles.map((title, index) => (
					<div key={`${title}-${index}`} className="pl-3">
						<VSCodeButton
							appearance={index === stackTitles.length - 1 ? 'primary' : 'secondary'}
							onClick={() => onNavigateTo(index)}
						>
							{`└─ ${title}`}
						</VSCodeButton>
					</div>
				))}
			</div>
		</div>
	);
}
