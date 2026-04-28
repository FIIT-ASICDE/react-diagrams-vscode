import { EdgeLabelRenderer } from '@xyflow/react';
import type { CSSProperties } from 'react';

type EdgeLabelVariant = 'view' | 'playground';

type EdgeLabelProps = {
	id: string | number;
	label: unknown;
	x: number;
	y: number;
	variant?: EdgeLabelVariant;
};

const VIEW_STYLE: CSSProperties = {
	position: 'absolute',
	background: 'black',
	padding: '2px 6px',
	fontSize: 11,
	pointerEvents: 'all',
	borderRadius: 4,
	color: 'white',
	whiteSpace: 'nowrap',
	zIndex: 20,
};

const PLAYGROUND_STYLE: CSSProperties = {
	position: 'absolute',
	background: '#111827',
	padding: '2px 6px',
	fontSize: 11,
	borderRadius: 4,
	color: 'white',
	whiteSpace: 'nowrap',
	pointerEvents: 'all',
	boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
};

export function EdgeLabel({ id, label, x, y, variant = 'view' }: EdgeLabelProps) {
	if (!label) return null;
	const text = typeof label === 'string' ? label : '';
	if (!text) return null;

	return (
		<EdgeLabelRenderer>
			<div
				style={{
					...(variant === 'playground' ? PLAYGROUND_STYLE : VIEW_STYLE),
					transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
				}}
				className="nodrag nopan"
				onContextMenu={(event) => {
					event.preventDefault();
					event.stopPropagation();

					window.dispatchEvent(
						new CustomEvent('activity/edgeLabelContextMenu', {
							detail: {
								edgeId: String(id),
								label: text,
							},
						}),
					);
				}}
			>
				{text}
			</div>
		</EdgeLabelRenderer>
	);
}
