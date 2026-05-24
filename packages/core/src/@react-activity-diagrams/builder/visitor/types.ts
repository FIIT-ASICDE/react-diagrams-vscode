
export type BuildResult = {
  entry?: string;
  entryEdgeLabel?: string;
  exits: string[];
  exitLabels?: Record<string, string>;
  returnExits: string[];
  throwExits: string[];
};

export type HookMeta = {
  label: string;
  sourceText: string;
  dependencyText: string;
};

export type ExpandableMeta = {
  label: string;
  nodeKind: 'function' | 'class' | 'interface' | 'type';
  sourceText?: string;
};