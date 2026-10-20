import type {TFunction} from 'i18next';
import type {TranslationKey} from './i18n/es.ts';
import {createNode, type Design, type NodeKind} from './simulation.ts';
const edges = (pairs: [string, string][]): Design['edges'] =>
  pairs.map(([from, to]) => ({id: `${from}-${to}`, from, to}));
export type ScenarioId = 'pressure' | 'reads' | 'balance' | 'free';
export interface Scenario {
  id: ScenarioId;
  title: TranslationKey;
  description: TranslationKey;
  mission: TranslationKey;
  hint: TranslationKey;
  design: Design;
}
export const SCENARIOS: Scenario[] = [
  {
    id: 'pressure',
    title: 'pressureTitle',
    description: 'pressureDescription',
    mission: 'pressureMission',
    hint: 'pressureHint',
    design: {
      name: 'Domar la cola',
      nodes: [
        createNode('source', 'source', 40, 110, 'Clientes', {
          rps: 160,
          readPercent: 65,
        }),
        createNode('lb', 'lb', 300, 110),
        createNode('service', 'api', 560, 110, 'Poll API', {
          concurrency: 10,
          latencyMs: 20,
          buffer: 60,
        }),
        createNode('queue', 'queue', 560, 350, 'Votos pendientes', {
          capacity: 160,
          prefetch: 12,
        }),
        createNode('service', 'worker', 820, 350, 'Worker', {
          concurrency: 4,
          latencyMs: 80,
          buffer: 12,
        }),
        createNode('db', 'db', 1080, 350, 'Votes DB', {
          readRps: 240,
          writeRps: 100,
        }),
      ],
      edges: edges([
        ['source', 'lb'],
        ['lb', 'api'],
        ['api', 'queue'],
        ['queue', 'worker'],
        ['worker', 'db'],
      ]),
    },
  },
  {
    id: 'reads',
    title: 'readsTitle',
    description: 'readsDescription',
    mission: 'readsMission',
    hint: 'readsHint',
    design: {
      name: 'Lecturas bajo presión',
      nodes: [
        createNode('source', 'source', 40, 200, 'Clientes', {
          rps: 280,
          readPercent: 90,
        }),
        createNode('lb', 'lb', 300, 200),
        createNode('service', 'api', 560, 200, 'Results API', {
          replicas: 2,
          concurrency: 10,
          latencyMs: 20,
        }),
        createNode('cache', 'cache', 820, 200, 'Redis Cache', {hitRate: 10}),
        createNode('db', 'db', 1080, 200, 'Polls DB', {
          readRps: 70,
          writeRps: 40,
        }),
      ],
      edges: edges([
        ['source', 'lb'],
        ['lb', 'api'],
        ['api', 'cache'],
        ['cache', 'db'],
      ]),
    },
  },
  {
    id: 'balance',
    title: 'balanceTitle',
    description: 'balanceDescription',
    mission: 'balanceMission',
    hint: 'balanceHint',
    design: {
      name: 'Repartir el trabajo',
      nodes: [
        createNode('source', 'source', 40, 250, 'Clientes', {
          rps: 240,
          readPercent: 60,
        }),
        createNode('lb', 'lb', 300, 250),
        createNode('service', 'fast', 600, 90, 'API rápida', {
          concurrency: 6,
          latencyMs: 20,
          buffer: 40,
        }),
        createNode('service', 'slow', 600, 410, 'API lenta', {
          concurrency: 4,
          latencyMs: 100,
          buffer: 80,
        }),
        createNode('db', 'db', 1000, 250, 'Shared DB', {
          readRps: 600,
          writeRps: 300,
          concurrency: 100,
        }),
      ],
      edges: edges([
        ['source', 'lb'],
        ['lb', 'fast'],
        ['lb', 'slow'],
        ['fast', 'db'],
        ['slow', 'db'],
      ]),
    },
  },
  {
    id: 'free',
    title: 'freeTitle',
    description: 'freeDescription',
    mission: 'freeMission',
    hint: 'freeHint',
    design: {
      name: 'Mi arquitectura',
      nodes: [createNode('source', 'source', 80, 240), createNode('db', 'db', 880, 240)],
      edges: [],
    },
  },
];

export const NODE_NAMES: Record<NodeKind, TranslationKey> = {
  source: 'sourceName',
  lb: 'lbName',
  service: 'serviceName',
  queue: 'queueName',
  cache: 'cacheName',
  db: 'dbName',
  sink: 'sinkName',
};
export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS.find((scenario) => scenario.id === id)!;
}
export function scenarioDesign(id: ScenarioId, t: TFunction): Design {
  const scenario = getScenario(id);
  const design = structuredClone(scenario.design);
  design.name = t(id === 'free' ? 'designName' : scenario.title);
  for (const node of design.nodes) {
    if (node.id === 'source') node.label = t('sourceName');
    if (node.id === 'queue') node.label = t('pendingVotes');
    if (node.id === 'fast') node.label = t('fastApi');
    if (node.id === 'slow') node.label = t('slowApi');
  }
  return design;
}
