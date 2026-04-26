import type { EdgeProps } from '@xyflow/react';
import {
	BaseEdge,
	EdgeLabelRenderer,
	getSmoothStepPath,
} from '@xyflow/react';

const LABEL_OFFSET_FROM_END = 28;

function getPointNearEnd(path: string, offset: number) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');

	pathEl.setAttribute('d', path);
	svg.appendChild(pathEl);

	const totalLength = pathEl.getTotalLength();

	const point = pathEl.getPointAtLength(Math.max(totalLength - offset, 0));

	return { x: point.x, y: point.y };
}

export default function DynamicPathEdge(props: EdgeProps) {
	const {
		id,
		style,
		label,
		markerEnd,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	} = props;

	const [path] = getSmoothStepPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		borderRadius: 8,
		offset: 24,
	});

	const labelPos = getPointNearEnd(path, LABEL_OFFSET_FROM_END);

	return (
		<>
			<BaseEdge
				path={path}
				markerEnd={markerEnd}
				style={{ fill: 'none', ...style }}
			/>

			{label && (
				<EdgeLabelRenderer>
					<div
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
							background: 'black',
							padding: '2px 6px',
							fontSize: 11,
							borderRadius: 4,
							color: 'white',
							whiteSpace: 'nowrap',
							pointerEvents: 'all',
						}}
						className="nodrag nopan"
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();

							window.dispatchEvent(
								new CustomEvent('activity/edgeLabelContextMenu', {
									detail: {
										edgeId: String(id),
										label: typeof label === 'string' ? label : '',
									},
								}),
							);
						}}
					>
						{typeof label === 'string' ? label : null}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}