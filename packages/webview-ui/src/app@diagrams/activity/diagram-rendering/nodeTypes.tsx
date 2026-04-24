import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

type NodeProps = {
  data: {
    color?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    label?: string;
    deps?: string;
    [key: string]: any;
  };
  isConnectable: boolean;
};

// ---------------------------------------------------------------------------
// Design tokens — UML-ish monochrome with a touch of color for expandables
// ---------------------------------------------------------------------------

const tokens = {
  ink: '#1f2328',
  inkSoft: '#57606a',
  paper: '#ffffff',
  border: '#1f2328',
  borderSoft: '#8c959f',
  expandableTint: '#eef6ee',
  expandableBorder: '#2da44e',
  shadow: '0 1px 2px rgba(0,0,0,0.06)',
  font:
    "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

// All wrappers are 200px wide to keep ELK/dagre happy with predictable sizing.
// The visible shapes inside can be smaller and centered.
const WRAPPER_WIDTH = 200;

const nodeStyles = {
  shell: {
    width: WRAPPER_WIDTH,
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box' as const,
    fontFamily: tokens.font,
  },

  // Stadium shape (rounded pill) — classic UML activity action
  action: {
    width: WRAPPER_WIDTH,
    minHeight: 44,
    padding: '10px 16px',
    background: tokens.paper,
    borderRadius: 22,
    border: `1.5px solid ${tokens.border}`,
    color: tokens.ink,
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    fontSize: 13,
    fontWeight: 500,
    boxShadow: tokens.shadow,
    lineHeight: 1.3,
  },

  // Expandable — same stadium shape but tinted to stand out
  expandable: {
    width: WRAPPER_WIDTH,
    minHeight: 44,
    padding: '10px 16px',
    background: tokens.expandableTint,
    borderRadius: 22,
    border: `1.5px solid ${tokens.expandableBorder}`,
    color: tokens.ink,
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    fontSize: 13,
    boxShadow: tokens.shadow,
    lineHeight: 1.3,
  },
  expandableLabel: {
    display: 'block',
    fontWeight: 600,
  },
  expandableDeps: {
    display: 'block',
    marginTop: 6,
    fontSize: 11,
    color: tokens.inkSoft,
    fontFamily: tokens.mono,
    whiteSpace: 'normal' as const,
    overflowWrap: 'anywhere' as const,
    lineHeight: 1.2,
  },

  // Decision diamond — drawn as an SVG so the border renders crisply
  decisionWrap: {
    width: WRAPPER_WIDTH,
    height: 90,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  decisionLabel: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: tokens.ink,
    fontWeight: 500,
    pointerEvents: 'none' as const,
    padding: '0 28px',
    textAlign: 'center' as const,
    lineHeight: 1.2,
  },

  // Merge — small empty diamond, no label
  mergeWrap: {
    width: WRAPPER_WIDTH,
    height: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Initial — solid black circle
  initialWrap: {
    width: WRAPPER_WIDTH,
    height: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialDot: {
    width: 28,
    height: 28,
    background: tokens.ink,
    borderRadius: '50%',
  },

  // Final — bull's-eye (outer ring + solid inner dot)
  finalWrap: {
    width: WRAPPER_WIDTH,
    height: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalRing: {
    width: 32,
    height: 32,
    background: tokens.paper,
    borderRadius: '50%',
    border: `2px solid ${tokens.ink}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalDot: {
    width: 18,
    height: 18,
    background: tokens.ink,
    borderRadius: '50%',
  },

  textPreview: {
    width: 700,
    minHeight: 220,
    padding: '14px 16px',
    background: tokens.paper,
    borderRadius: 8,
    border: `1px solid ${tokens.borderSoft}`,
    color: tokens.ink,
    textAlign: 'left' as const,
    boxSizing: 'border-box' as const,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
    lineHeight: 1.4,
    fontSize: 12,
    boxShadow: tokens.shadow,
  },
} as const;

// ---------------------------------------------------------------------------
// Reusable building blocks
// ---------------------------------------------------------------------------

function NodeShell({ children }: { children: React.ReactNode }) {
  return <div style={nodeStyles.shell}>{children}</div>;
}

const HANDLE_HIDDEN: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  background: 'transparent',
  border: 'none',
};

function commonTargetHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={HANDLE_HIDDEN}
      />
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ ...HANDLE_HIDDEN, left: sideInset }}
      />
    </>
  );
}

function commonSourceHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={HANDLE_HIDDEN}
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ ...HANDLE_HIDDEN, left: sideInset }}
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ ...HANDLE_HIDDEN, right: sideInset }}
      />
    </>
  );
}

function decisionLoopTargetHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={HANDLE_HIDDEN}
      />
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ ...HANDLE_HIDDEN, left: sideInset }}
      />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ ...HANDLE_HIDDEN, right: sideInset }}
      />
    </>
  );
}

function decisionLoopSourceHandles(isConnectable: boolean, sideInset = 0) {
  return (
    <>
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={HANDLE_HIDDEN}
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        style={{ ...HANDLE_HIDDEN, left: sideInset }}
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={{ ...HANDLE_HIDDEN, right: sideInset }}
      />
    </>
  );
}

// SVG-drawn diamond — sharper than CSS clip-path borders
function Diamond({
  width,
  height,
  fill = tokens.paper,
  stroke = tokens.border,
  strokeWidth = 1.5,
}: {
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const w = width;
  const h = height;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.05))' }}
    >
      <polygon
        points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Node components
// ---------------------------------------------------------------------------

const ActionNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 0)}
    <div
      style={{
        ...nodeStyles.action,
        background: data.color ?? nodeStyles.action.background,
      }}
    >
      {data.label || 'Action'}
    </div>
    {commonSourceHandles(isConnectable, 0)}
  </NodeShell>
));

const ExpandableNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 0)}
    <div
      style={{
        ...nodeStyles.expandable,
        background: data.color ?? nodeStyles.expandable.background,
      }}
    >
      <span style={nodeStyles.expandableLabel}>{data.label || 'Expandable'}</span>
      {typeof data.deps === 'string' && data.deps.trim().length > 0 && (
        <span style={nodeStyles.expandableDeps}>deps: {data.deps}</span>
      )}
    </div>
    {commonSourceHandles(isConnectable, 0)}
  </NodeShell>
));

const MergeNode = memo(({ isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 75)}
    <div style={nodeStyles.mergeWrap}>
      <Diamond width={40} height={40} />
    </div>
    {commonSourceHandles(isConnectable, 75)}
  </NodeShell>
));

const DecisionNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {decisionLoopTargetHandles(isConnectable, 25)}
    <div style={nodeStyles.decisionWrap}>
      <Diamond width={WRAPPER_WIDTH} height={90} />
      <div style={nodeStyles.decisionLabel}>{data.label || 'Decision'}</div>
    </div>
    {decisionLoopSourceHandles(isConnectable, 25)}
  </NodeShell>
));

const LoopNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {decisionLoopTargetHandles(isConnectable, 25)}
    <div style={nodeStyles.decisionWrap}>
      <Diamond width={WRAPPER_WIDTH} height={90} />
      <div style={nodeStyles.decisionLabel}>{data.label || 'Loop'}</div>
    </div>
    {decisionLoopSourceHandles(isConnectable, 25)}
  </NodeShell>
));

const InitialNode = memo(({ isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 75)}
    <div style={nodeStyles.initialWrap}>
      <div style={nodeStyles.initialDot} />
    </div>
    {commonSourceHandles(isConnectable, 75)}
  </NodeShell>
));

const FinalNode = memo(({ isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 75)}
    <div style={nodeStyles.finalWrap}>
      <div style={nodeStyles.finalRing}>
        <div style={nodeStyles.finalDot} />
      </div>
    </div>
    {commonSourceHandles(isConnectable, 75)}
  </NodeShell>
));

const TextPreviewNode = memo(({ data, isConnectable }: NodeProps) => (
  <NodeShell>
    {commonTargetHandles(isConnectable, 0)}
    <div
      style={{
        ...nodeStyles.textPreview,
        width:
          typeof data.previewWidth === 'number'
            ? data.previewWidth
            : nodeStyles.textPreview.width,
        minHeight:
          typeof data.previewHeight === 'number'
            ? data.previewHeight
            : nodeStyles.textPreview.minHeight,
      }}
    >
      {data.label || 'Preview'}
    </div>
    {commonSourceHandles(isConnectable, 0)}
  </NodeShell>
));

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