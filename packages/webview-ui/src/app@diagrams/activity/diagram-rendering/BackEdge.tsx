import type { EdgeProps } from '@xyflow/react';
import { SmartStepEdge } from '@tisoap/react-flow-smart-edge';

export default function BackEdge(props: EdgeProps) {
  const { style, label } = props;

  return (
    <SmartStepEdge
      {...props}
      label={typeof label === 'string' ? label : undefined}
      style={{
        stroke: '#c7ccd6',
        strokeWidth: 1.2,
        strokeDasharray: '4 4',
        opacity: 0.9,
        ...style,
      }}
    />
  );
}

export function NormalEdge(props: EdgeProps) {
  const { style, label } = props;

  return (
    <SmartStepEdge
      {...props}
      label={typeof label === 'string' ? label : undefined}
      style={{
        ...style,
      }}
    />
  );
}