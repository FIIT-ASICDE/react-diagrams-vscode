import { useEffect, useState } from 'react';

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

type DebugProps = {
	value: unknown;
	onApply?: (value: unknown) => void;
};

type SettingsForm = {
	code: boolean;
	diagramJson: boolean;
	diagramMermaid: boolean;
	diagramImage: boolean;
	debug: boolean;
	allowToolCall: boolean;
	maxToolIterations: number;
	diagramImageTimeoutMs: number;
};

const DEFAULT_SETTINGS: SettingsForm = {
	code: true,
	diagramJson: true,
	diagramMermaid: true,
	diagramImage: true,
	debug: true,
	allowToolCall: true,
	maxToolIterations: 3,
	diagramImageTimeoutMs: 15000,
};

function toSettingsForm(value: unknown): SettingsForm {
	if (!value || typeof value != 'object') {
		return DEFAULT_SETTINGS;
	}

	const candidate = value as Partial<SettingsForm>;

	return {
		code: typeof candidate.code == 'boolean' ? candidate.code : DEFAULT_SETTINGS.code,
		diagramJson: typeof candidate.diagramJson == 'boolean' ? candidate.diagramJson : DEFAULT_SETTINGS.diagramJson,
		diagramMermaid: typeof candidate.diagramMermaid == 'boolean' ? candidate.diagramMermaid : DEFAULT_SETTINGS.diagramMermaid,
		diagramImage: typeof candidate.diagramImage == 'boolean' ? candidate.diagramImage : DEFAULT_SETTINGS.diagramImage,
		debug: typeof candidate.debug == 'boolean' ? candidate.debug : DEFAULT_SETTINGS.debug,
		allowToolCall: typeof candidate.allowToolCall == 'boolean' ? candidate.allowToolCall : DEFAULT_SETTINGS.allowToolCall,
		maxToolIterations: typeof candidate.maxToolIterations == 'number' ? candidate.maxToolIterations : DEFAULT_SETTINGS.maxToolIterations,
		diagramImageTimeoutMs: typeof candidate.diagramImageTimeoutMs == 'number' ? candidate.diagramImageTimeoutMs : DEFAULT_SETTINGS.diagramImageTimeoutMs,
	};
}

export default function Debug({ value, onApply }: DebugProps) {
	const [form, setForm] = useState<SettingsForm>(() => toSettingsForm(value));

	useEffect(() => {
		setForm(toSettingsForm(value));
	}, [value]);

	const onChangeBool = (key: keyof SettingsForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
		setForm((prev) => ({ ...prev, [key]: event.target.checked }));
	};

	const onChangeNumber = (key: 'maxToolIterations' | 'diagramImageTimeoutMs') => (event: React.ChangeEvent<HTMLInputElement>) => {
		const raw = Number(event.target.value);
		if (Number.isFinite(raw)) {
			setForm((prev) => ({ ...prev, [key]: raw }));
		}
	};

	const applyForm = () => {
		onApply?.(form);
	};

	return (
		<div className="h-full overflow-auto p-3 text-sm w-full flex flex-col gap-3">
			<div>
				<h2 className="mb-1 text-base text-(--vscode-foreground)">Settings</h2>
				<p className="text-(--vscode-descriptionForeground)">Adjust chatbot behavior with form inputs.</p>
			</div>

			<label className="flex items-center gap-2">
				<input type="checkbox" checked={form.code} onChange={onChangeBool('code')} />
				<span>Include code context</span>
			</label>

			<label className="flex items-center gap-2">
				<input type="checkbox" checked={form.diagramJson} onChange={onChangeBool('diagramJson')} />
				<span>Include diagram JSON</span>
			</label>

			<label className="flex items-center gap-2">
				<input type="checkbox" checked={form.diagramMermaid} onChange={onChangeBool('diagramMermaid')} />
				<span>Include diagram Mermaid</span>
			</label>

			<label className="flex items-center gap-2">
				<input type="checkbox" checked={form.diagramImage} onChange={onChangeBool('diagramImage')} />
				<span>Include diagram image</span>
			</label>

			<label className="flex items-center gap-2">
				<input type="checkbox" checked={form.debug} onChange={onChangeBool('debug')} />
				<span>Show agent debug output</span>
			</label>

			<label className="flex items-center gap-2">
				<input type="checkbox" checked={form.allowToolCall} onChange={onChangeBool('allowToolCall')} />
				<span>Allow tool calls</span>
			</label>

			<label className="flex flex-col gap-1">
				<span>Max tool iterations</span>
				<input
					type="number"
					min={0}
					max={10}
					value={form.maxToolIterations}
					onChange={onChangeNumber('maxToolIterations')}
					className="rounded-sm border border-(--vscode-panel-border) bg-(--vscode-input-background) p-1"
				/>
			</label>

			<label className="flex flex-col gap-1">
				<span>Diagram image timeout (ms)</span>
				<input
					type="number"
					min={1000}
					max={60000}
					value={form.diagramImageTimeoutMs}
					onChange={onChangeNumber('diagramImageTimeoutMs')}
					className="rounded-sm border border-(--vscode-panel-border) bg-(--vscode-input-background) p-1"
				/>
			</label>

			<div className="flex items-center gap-2">
				<VSCodeButton onClick={applyForm}>Apply</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => {
					setForm(toSettingsForm(value));
				}}>
					Reset
				</VSCodeButton>
			</div>
		</div>
	);
}
