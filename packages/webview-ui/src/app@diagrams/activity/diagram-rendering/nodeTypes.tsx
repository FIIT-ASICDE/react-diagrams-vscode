import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

type NodeProps = {
  data: {
    color: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    label?: string;
    [key: string]: any;
  };
  isConnectable: boolean;
};

// Action Node
const ActionNode = memo(({ data, isConnectable }: NodeProps) => (
  <>
    <Handle type="target" position={Position.Left} isConnectable={isConnectable}  style={{opacity: 0}} />
    <div style={{ padding: 10, background: data.color, borderRadius: 6, border: '2px solid #1976d2', color: '#fff', minWidth: 80, textAlign: 'center' }}>
      {data.label || 'Action'}
    </div>
    <Handle type="source" position={Position.Right} isConnectable={isConnectable}  style={{opacity: 0}} />
  </>
));

// Merge Node
const MergeNode = memo(({ data, isConnectable }: NodeProps) => (
  <>
    <Handle type="target" position={Position.Left} isConnectable={isConnectable}  style={{opacity: 0}} />
    <div style={{ padding: 10, background: '#333', borderRadius: '50%', border: '2px solid #ff9800', color: '#fff', minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {data.label || 'Merge'}
    </div>
    <Handle type="source" position={Position.Right} isConnectable={isConnectable}  style={{opacity: 0}} />
  </>
));

// Decision Node
const DecisionNode = memo(({ data, isConnectable }: NodeProps) => (
  <>
    <Handle type="target" position={Position.Left} isConnectable={isConnectable}  style={{opacity: 0}} />
    <div style={{ padding: 10, background: '#fffde7', borderRadius: 6, border: '2px dashed #fbc02d', color: '#333', minWidth: 80, textAlign: 'center' }}>
      {data.label || 'Decision'}
    </div>
    <Handle type="source" position={Position.Right} isConnectable={isConnectable}  style={{opacity: 0}} />
  </>
));

// Initial Node
const InitialNode = memo(({ data, isConnectable }: NodeProps) => (
  <>
    <Handle type="target" position={Position.Left} isConnectable={isConnectable}  style={{opacity: 0}} />
    <div style={{ width: 40, height: 40, background: '#388e3c', borderRadius: '50%', border: '2px solid #1b5e20', margin: '0 auto' }} />
    <Handle type="source" position={Position.Right} isConnectable={isConnectable}  style={{opacity: 0}} />
  </>
));

// Final Node
const FinalNode = memo(({ data, isConnectable }: NodeProps) => (
  <>
    <Handle type="target" position={Position.Left} isConnectable={isConnectable} style={{opacity: 0}} />
    <div style={{ width: 40, height: 40, background: '#fff', borderRadius: '50%', margin: '0 auto', position: 'relative' }}>
      <div style={{ width: 20, height: 20, background: '#d32f2f', borderRadius: '50%', position: 'absolute', top: '25%', left: '25%' }} />
    </div>
    <Handle type="source" position={Position.Right} isConnectable={isConnectable}  style={{opacity: 0}} />
  </>
));

// Export as nodeTypes object for use in React Flow
export const nodeTypes = {
  action: ActionNode,
  merge: MergeNode,
  decision: DecisionNode,
  initial: InitialNode,
  final: FinalNode,
};
