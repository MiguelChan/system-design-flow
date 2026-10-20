import {createNode, DEFAULTS, validateDesign} from './simulation.ts';
import type {Design, FlowNode, NodeKind, Settings} from './simulation.ts';
import {DesignError} from './messages.ts';
import type {ScenarioId} from './presets.ts';

export const DESIGN_STORAGE = 'system-design-flow-v1';
export type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface SavedDesign extends Design {
  version: 1;
  scenarioId: ScenarioId;
}
export const NODE_KINDS: readonly NodeKind[] = [
  'source',
  'lb',
  'service',
  'queue',
  'cache',
  'db',
  'sink',
];
export type NumericSetting = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];
export type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];
const NUMERIC_SETTINGS: readonly NumericSetting[] = [
  'rps',
  'readPercent',
  'replicas',
  'concurrency',
  'latencyMs',
  'buffer',
  'capacity',
  'prefetch',
  'highWater',
  'lowWater',
  'rate',
  'burst',
  'maxRps',
  'hitRate',
  'readRps',
  'writeRps',
  'readReplicas',
];
const BOOLEAN_SETTINGS: readonly BooleanSetting[] = [
  'respectBackpressure',
  'adaptive',
  'replicaReads',
  'online',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isScenarioId(value: unknown): value is ScenarioId {
  return value === 'pressure' || value === 'reads' || value === 'balance' || value === 'free';
}
function coordinate(value: unknown, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(max, value))
    : 0;
}
export function parseDesign(raw: unknown): Design {
  if (!isRecord(raw)) throw new DesignError({code: 'invalidFile'});
  if (
    !Array.isArray(raw.nodes) ||
    !Array.isArray(raw.edges) ||
    raw.nodes.length > 30 ||
    raw.edges.length > 60
  ) {
    throw new DesignError({code: 'invalidShape'});
  }
  const items: unknown[] = raw.nodes;
  const nodes: FlowNode[] = items.map((item) => {
    if (
      !isRecord(item) ||
      !NODE_KINDS.some((kind) => kind === item.kind) ||
      typeof item.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)
    ) {
      throw new DesignError({code: 'invalidNode'});
    }
    const kind = NODE_KINDS.find((kind) => kind === item.kind)!;
    const config = {...DEFAULTS};
    if (isRecord(item.config)) {
      const incoming = item.config;
      for (const key of NUMERIC_SETTINGS) {
        const value = incoming[key];
        if (typeof value === 'number' && Number.isFinite(value))
          config[key] = Math.max(0, Math.min(10000, value));
      }
      for (const key of BOOLEAN_SETTINGS) {
        const value = incoming[key];
        if (typeof value === 'boolean') config[key] = value;
      }
      if (
        incoming.overflow === 'wait' ||
        incoming.overflow === 'reject' ||
        incoming.overflow === 'drop-oldest'
      )
        config.overflow = incoming.overflow;
      if (incoming.shaper === 'none' || incoming.shaper === 'token' || incoming.shaper === 'leaky')
        config.shaper = incoming.shaper;
      if (incoming.algorithm === 'round-robin' || incoming.algorithm === 'least-loaded')
        config.algorithm = incoming.algorithm;
    }
    for (const key of [
      'replicas',
      'concurrency',
      'capacity',
      'prefetch',
      'buffer',
      'burst',
    ] as const)
      config[key] = Math.max(1, Math.round(config[key]));
    config.rps = Math.min(2000, config.rps);
    config.readPercent = Math.min(100, config.readPercent);
    config.hitRate = Math.min(100, config.hitRate);
    config.highWater = Math.max(50, Math.min(100, config.highWater));
    config.lowWater = Math.max(5, Math.min(45, config.lowWater));
    return createNode(
      kind,
      item.id,
      coordinate(item.x, 3500),
      coordinate(item.y, 2000),
      typeof item.label === 'string' ? item.label.slice(0, 40) : kind,
      config,
    );
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new DesignError({code: 'duplicateIds'});
  const edgeItems: unknown[] = raw.edges;
  const edges = edgeItems.map((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.from !== 'string' ||
      typeof item.to !== 'string' ||
      !ids.has(item.from) ||
      !ids.has(item.to)
    ) {
      throw new DesignError({code: 'invalidEdge'});
    }
    return {id: `imported-${index}`, from: item.from, to: item.to};
  });
  const result: Design = {
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : '',
    nodes,
    edges,
  };
  const issues = validateDesign(result).filter(
    (issue) => issue.code !== 'missingOutput' && issue.code !== 'missingSource',
  );
  if (issues.length) throw new DesignError(issues[0]);
  return result;
}
export function serializeDesign(design: Design, scenarioId: ScenarioId): string {
  const saved: SavedDesign = {...design, version: 1, scenarioId};
  return JSON.stringify(saved, null, 2);
}
export function restoreDesign(
  storage: BrowserStorage | undefined,
): {design: Design; scenarioId: ScenarioId} | null {
  try {
    const saved = storage?.getItem(DESIGN_STORAGE);
    if (!saved) return null;
    const raw: unknown = JSON.parse(saved);
    return {
      design: parseDesign(raw),
      scenarioId: isRecord(raw) && isScenarioId(raw.scenarioId) ? raw.scenarioId : 'free',
    };
  } catch {
    return null;
  }
}
