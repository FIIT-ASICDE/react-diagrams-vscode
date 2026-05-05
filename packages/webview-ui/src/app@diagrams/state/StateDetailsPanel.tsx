import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { analyzeStateDiagram, type Id, type StateDiagram, type StateDiagramAnalytics, type StateUpdate } from '@react-diagrams/core/app@state-diagram-model';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/app@shadcn/components/ui/accordion';
import { StateUpdateBadge, getNodeColor } from './rendering/nodes';
import { MutatorLabel, StateVariableLabel } from './rendering/render';
import { cn } from '@/app@shadcn/lib/utils';
import { VSCodeButton, VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';

type StateData = (event: React.MouseEvent, node: StateUpdate) => void;
type StateDetailsPanelProps = {
	model?: StateDiagram;
	title?: string;
	className?: string;
	onStateDoubleClick?: StateData;
	hiddenStateVariableIds?: ReadonlySet<Id>;
	onStateVariableHiddenChange?: (stateVariableId: Id, hidden: boolean) => void;
	onShowAllStateVariables?: () => void;
};

function StatCard({ label, value }: { label: string; value: string | number | React.JSX.Element }) {
	return (
		<div className="rounded-md border border-(--vscode-editorWidget-border) bg-(--vscode-editorWidget-background) px-2.5 py-2">
			<div className="text-[11px] leading-none text-(--vscode-descriptionForeground)">{label}</div>
			<p className="mt-1 text-[13px] font-semibold leading-none text-(--vscode-foreground)">{value}</p>
		</div>
	);
}

function StateUpdatesList({ updates, className, label = "Reached states", onStateDoubleClick }: { updates: StateUpdate[]; className?: string; label?: string; onStateDoubleClick?: StateData }) {
	return (
		<div className={cn("w-full mb-4.5", className)}>
			<div className="text-[11px] font-semibold uppercase tracking-wide text-(--vscode-descriptionForeground) mb-1">
				{label} ({updates.length}):
			</div>
			{updates.length > 0 && <div className="flex flex-wrap items-center gap-1.5 gap-y-2.5">
				{updates.map((update, idx) => {
					const displayLabel = update.label?.trim() || `${update.setterName}(${update.kind})`;
					const color = getNodeColor('stateUpdate', displayLabel);
					return (
						<div onDoubleClick={(event) => onStateDoubleClick?.(event, update)}>
							<StateUpdateBadge key={`${update.id}-${idx}`} label={displayLabel} color={color} className="text-[11px] p-1.25 min-w-8 not-hover:truncate cursor-pointer" />
						</div>
					);
				})}
			</div>}
			{!updates.length && <span className="text-xs italic text-(--vscode-descriptionForeground)">No reached states</span>}
		</div>
	)
}

function AccordionLabel({ name, labelClass, labelStyle, children }: { name: ReactNode | string; labelClass?: string; labelStyle?: CSSProperties; children?: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-1 items-center justify-between gap-1">
			<span className={cn("w-fit rounded-sm text-xs truncate not-hover:max-w-45 font-semibold text-white", labelClass)} style={labelStyle}>
				{name}
			</span>
			<p className="text-[11px] text-(--vscode-descriptionForeground) mr-1.75">
				{children}
			</p>
		</div>
	);
}

const StateMutatorAccordions = ({ analysis, expandedStateVariables, hiddenStateVariableIds, onStateVariableHiddenChange, onStateDoubleClick }: { analysis: StateDiagramAnalytics; expandedStateVariables: string[]; hiddenStateVariableIds?: ReadonlySet<Id>; onStateVariableHiddenChange?: (stateVariableId: Id, hidden: boolean) => void; onStateDoubleClick?: StateData }) => (
	<Accordion type="multiple" defaultValue={expandedStateVariables} className="space-y-2 px-2 pb-2">
		{analysis.stateVariables.map((stateVariable) => {
			const variableColor = `color-mix(in srgb, ${getNodeColor('stateVariable', stateVariable.name)} 90%, transparent)`;
			const isHidden = hiddenStateVariableIds?.has(stateVariable.id) ?? false;

			return (
				<AccordionItem key={stateVariable.id}
					value={`state-${stateVariable.id}`}
					className={cn("rounded-md border border-(--state-var-color) bg-(--vscode-editorWidget-background) px-1", isHidden && "opacity-65")}
					style={{ '--state-var-color': variableColor } as React.CSSProperties}
				>
					<AccordionTrigger className="px-2 py-2 hover:no-underline">
						<AccordionLabel name={<StateVariableLabel {...stateVariable} />} labelStyle={{ backgroundColor: variableColor }} labelClass='px-1 py-0.75'>
							{stateVariable.reachedStates.length} states | {stateVariable.mutatorCount} mutators
						</AccordionLabel>
					</AccordionTrigger>

					<AccordionContent className="space-y-2 border-t border-(--state-var-color) p-2 pb-2 mb-1">
						<VSCodeCheckbox checked={isHidden} title={`${isHidden ? 'Show' : 'Hide'} state variable in diagram view`} className='scale-90 mb-1.5'
							onChange={(ev) => onStateVariableHiddenChange?.(stateVariable.id, ev.currentTarget.checked)}
						>
							Hide
						</VSCodeCheckbox>
						<StateUpdatesList updates={stateVariable.reachedStates} onStateDoubleClick={onStateDoubleClick} label='Unique reached states' />

						<Accordion type="multiple" defaultValue={[]} className="space-y-1.5">
							{stateVariable.mutators.map((mutator) => {
								const mutatorColor = `color-mix(in srgb, ${getNodeColor('mutator', mutator.name)} 90%, transparent)`;

								return (
									<AccordionItem key={mutator.id}
										value={`mutator-${stateVariable.id}-${mutator.id}`}
										className="rounded-md border border-(--mutator-color) bg-(--vscode-editor-background)"
										style={{ '--mutator-color': mutatorColor } as React.CSSProperties}
									>
										<AccordionTrigger className="px-2 py-2 hover:no-underline">
											<AccordionLabel name={<MutatorLabel {...mutator} />} labelStyle={{ backgroundColor: mutatorColor }} labelClass='px-1 py-0.75' />
										</AccordionTrigger>

										<AccordionContent className="space-y-2 border-t border-(--mutator-color) p-2 mb-1">
											<div className="grid grid-cols-2 gap-2">
												<StatCard label="Nodes" value={mutator.nodeCount} />
												<StatCard label="Transitions" value={mutator.transitionCount} />
											</div>
											<StateUpdatesList updates={mutator.reachedStates} onStateDoubleClick={onStateDoubleClick} />
										</AccordionContent>
									</AccordionItem>
								);
							})}
						</Accordion>
					</AccordionContent>
				</AccordionItem>
			);
		})}
	</Accordion>
)

export default function StateDetailsPanel({ model, title, className, hiddenStateVariableIds, onStateVariableHiddenChange, onShowAllStateVariables, onStateDoubleClick}: StateDetailsPanelProps) {
	const analysis = useMemo(() => analyzeStateDiagram(model), [model]);
	const hiddenStateVariableCount = hiddenStateVariableIds?.size ?? 0;

	const expandedStateVariables = useMemo(() => analysis.stateVariables.map((stateVariable) => `state-${stateVariable.id}`), [analysis.stateVariables]);

	return (
		<div className={cn(`h-full overflow-y-auto [scrollbar-width:thin] border-l border-(--vscode-editorWidget-border) bg-(--vscode-editor-background)`, className)}>
			<div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-(--vscode-editorWidget-border) bg-(--vscode-editor-background) px-3 py-2">
				<h2 className="text-[16px] font-semibold text-(--vscode-foreground)">{title || `${analysis.metrics.componentName ?? 'Unknown'}`}</h2>
				{!!hiddenStateVariableCount && <VSCodeButton appearance="secondary" className='h-5.75' onClick={onShowAllStateVariables}>Show all</VSCodeButton>}
			</div>

			<div className="space-y-3 p-1">
				<div className="grid grid-cols-2 gap-2 p-2">
					{/* <StatCard label="Component" value={analysis.metrics.componentName ?? 'Unknown'} /> */}
					<StatCard label="State variables" value={analysis.metrics.stateVariableCount} />
					<StatCard label="Mutators" value={analysis.metrics.mutatorCount} />
					<StatCard label="Nodes | Unique states" value={
						<>{analysis.metrics.nodeCount} <span className="text-(--vscode-descriptionForeground)">|</span> {analysis.metrics.stateCount}</>
					}/>
					<StatCard label="Transitions" value={analysis.metrics.transitionCount} />
				</div>

				{!analysis.stateVariables.length && (
					<p className="px-2 text-xs italic text-(--vscode-descriptionForeground)">
						No state variables found for this diagram.
					</p>
				)}

				<StateMutatorAccordions analysis={analysis} expandedStateVariables={expandedStateVariables} hiddenStateVariableIds={hiddenStateVariableIds} onStateVariableHiddenChange={onStateVariableHiddenChange} onStateDoubleClick={onStateDoubleClick} />
			</div>
		</div>
	);
}
