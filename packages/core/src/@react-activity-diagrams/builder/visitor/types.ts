export type BuildResult = {
  entry?: string;
  exits: string[];
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
