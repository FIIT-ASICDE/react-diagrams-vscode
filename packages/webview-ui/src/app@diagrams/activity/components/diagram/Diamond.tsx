import { tokens } from '../../styles/design-tokens';

type Props = {
	width: number;
	height: number;
	fill?: string;
	stroke?: string;
	strokeWidth?: number;
};

/**
 * SVG-drawn diamond. Crisper than CSS clip-path borders, and its bounding
 * box is exactly width × height so the layouter can size it predictably.
 */
export function Diamond({
	width,
	height,
	fill = tokens.paper,
	stroke = tokens.border,
	strokeWidth = 1.5,
}: Props) {
	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			style={{ display: 'block', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.05))' }}
		>
			<polygon
				points={`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`}
				fill={fill}
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinejoin="miter"
			/>
		</svg>
	);
}