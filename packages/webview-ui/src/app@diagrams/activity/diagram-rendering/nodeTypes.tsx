import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

type NodeProps = {
  data: {
    color: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    label?: string;
    deps?: string;
    [key: string]: any;
  };
  isConnectable: boolean;
};

const nodeStyles = {
  shell: {
    width: 200,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box' as const,
  },
  action: {
    width: 200,
    padding: '10px 14px',
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #d0d7de',
    color: '#1f2328',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    fontSize: 12,
  },
  expandable: {
    width: 200,
    padding: '10px 14px',
    background: '#eef6ee',
    borderRadius: 8,
    border: '1px solid #2da44e',
    color: '#1f2328',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    fontSize: 12,
  },
  expandableLabel: {
    display: 'block',
    fontWeight: 600,
  },
  expandableDeps: {
    display: 'block',
    marginTop: 6,
    fontSize: 11,
    color: '#57606a',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    whiteSpace: 'normal' as const,
    overflowWrap: 'anywhere' as const,
    lineHeight: 1.2,
  },
  decision: {
    width: 150,
    height: 80,
    padding: 0,
    background: '#ffffff',
    border: '1px solid #d0d7de',
    color: '#1f2328',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
  },
  merge: {
    width: 50,
    height: 50,
    padding: 0,
    background: '#ffffff',
    border: '1px solid #d0d7de',
    color: '#1f2328',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    width: 50,
    height: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  final: {
    width: 50,
    height: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textPreview: {
    width: 700,
    minHeight: 220,
    padding: '14px 16px',
    background: '#ffffff',
    borderRadius: 8,
    border: '1px solid #d0d7de',
    color: '#1f2328',
    textAlign: 'left' as const,
    boxSizing: 'border-box' as const,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
    lineHeight: 1.4,
    fontSize: 12,
  },
} as const;

function NodeShell({ children }: { children: React.ReactNode }) {
  return <div style={nodeStyles.shell}>{children}</div>;
}

function commonTargetHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle id="target-top" type="target" position={Position.Top} isConnectable={isConnectable} />
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ opacity: 0, left: sideInset }}
      />
    </>
  );
}

function commonSourceHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle id="source-bottom" type="source" position={Position.Bottom} isConnectable={isConnectable} />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ opacity: 0, left: sideInset }}
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ opacity: 0, right: sideInset }}
      />
    </>
  );
}

function decisionLoopTargetHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle id="target-top" type="target" position={Position.Top} isConnectable={isConnectable} />
      <Handle id="target-left" type="target" position={Position.Left} isConnectable={isConnectable} style={{ left: sideInset }} />
      <Handle id="target-right" type="target" position={Position.Right} isConnectable={isConnectable} style={{ right: sideInset }} />
    </>
  );
}

function decisionLoopSourceHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle id="source-bottom" type="source" position={Position.Bottom} isConnectable={isConnectable} />
      <Handle id="source-left" type="source" position={Position.Left} isConnectable={isConnectable} style={{ left: sideInset }} />
      <Handle id="source-right" type="source" position={Position.Right} isConnectable={isConnectable} style={{ right: sideInset }} />
    </>
  );
}

// Action Node
const ActionNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 0)}
    <div style={{ ...nodeStyles.action, background: data.color ?? nodeStyles.action.background }}>
      {data.label || 'Action'}
    </div>
    {commonSourceHandles(isConnectable, 0)}
  </NodeShell>
));

// Expandable Node
const ExpandableNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 0)}
    <div style={{ ...nodeStyles.expandable, background: data.color ?? nodeStyles.expandable.background }}>
      <span style={nodeStyles.expandableLabel}>{data.label || 'Expandable'}</span>
      {typeof data.deps === 'string' && data.deps.trim().length > 0 && (
        <span style={nodeStyles.expandableDeps}>deps: {data.deps}</span>
      )}
    </div>
    {commonSourceHandles(isConnectable, 0)}
  </NodeShell>
));

// Merge Node
const MergeNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 75)}
    <div style={{ ...nodeStyles.merge, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {data.label || 'Merge'}
    </div>
    {commonSourceHandles(isConnectable, 75)}
  </NodeShell>
));

// Decision Node
const DecisionNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {decisionLoopTargetHandles(isConnectable, 25)}
    <div style={{ ...nodeStyles.decision }}>
      {data.label || 'Decision'}
    </div>
    {decisionLoopSourceHandles(isConnectable, 25)}
  </NodeShell>
));

// Loop Node
const LoopNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {decisionLoopTargetHandles(isConnectable, 25)}
    <div style={{ ...nodeStyles.decision }}>
      {data.label || 'Loop'}
    </div>
    {decisionLoopSourceHandles(isConnectable, 25)}
  </NodeShell>
));

// Initial Node
const InitialNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 75)}
    <div style={{ ...nodeStyles.initial }}>
      <div style={{ width: 40, height: 40, background: '#1f2328', borderRadius: '50%', border: '1px solid #1f2328' }} />
    </div>
    {commonSourceHandles(isConnectable, 75)}
  </NodeShell>
));

// Final Node
const FinalNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 75)}
    <div style={{ ...nodeStyles.final }}>
      <div style={{ width: 40, height: 40, background: '#ffffff', borderRadius: '50%', border: '3px solid #1f2328' }} />
    </div>
    {commonSourceHandles(isConnectable, 75)}
  </NodeShell>
));

// Text Preview Node
const TextPreviewNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 0)}
    <div
      style={{
        ...nodeStyles.textPreview,
        width: typeof data.previewWidth === 'number' ? data.previewWidth : nodeStyles.textPreview.width,
        minHeight: typeof data.previewHeight === 'number' ? data.previewHeight : nodeStyles.textPreview.minHeight,
      }}
    >
      {data.label || 'Preview'}
    </div>
    {commonSourceHandles(isConnectable, 0)}
  </NodeShell>
));

// Export as nodeTypes object for use in React Flow
export const nodeTypes = {
  action: ActionNode,
  expandable: ExpandableNode,
  merge: MergeNode,
  decision: DecisionNode,
  loop: LoopNode,
  initial: InitialNode,
  end: FinalNode,
  textPreview: TextPreviewNode,
};