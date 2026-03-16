// Main entry point for @react-state-map/core

// Types
export type {
  StateNode,
  ComponentNode,
  PropDefinition,
  ContextInfo,
  StateFlowEdge,
  ContextBoundary,
  PropDrillingPath,
  StateFlowGraph,
  SerializedStateFlowGraph,
  ParseOptions,
  ParseResult,
  ParseError,
  ParseWarning,
} from './types.js';

// Parser
export { ReactParser } from './parser/react-parser';
export { parseFile } from './parser/file-parser';

// Graph utilities
export { serializeGraph, deserializeGraph } from './graph/serializer';
export { GraphAnalyzer } from './graph/analyzer';
export type { ComponentStats, StateStats, FlowStats, GraphSummary } from './graph/analyzer';
