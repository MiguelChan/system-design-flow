import type {JSX} from 'react';
import {useTranslation} from 'react-i18next';
import type {TranslationKey} from '../i18n/es.ts';
import type {BooleanSetting, NumericSetting} from '../persistence.ts';
import type {FlowNode, NodeKind, Settings} from '../simulation.ts';
import type {Playground} from '../playground.ts';
import {Icon} from './Icon.tsx';

type ChoiceSetting = 'overflow' | 'shaper' | 'algorithm';
interface NumberField {
  type: 'number';
  key: NumericSetting;
  label: TranslationKey;
  min: number;
  max: number;
  step: number;
  unit?: string;
  help?: TranslationKey;
}
interface ToggleField {
  type: 'toggle';
  key: BooleanSetting;
  label: TranslationKey;
  help?: TranslationKey;
}
type ChoiceField = {
  [K in ChoiceSetting]: {
    type: 'choice';
    key: K;
    label: TranslationKey;
    options: readonly {value: Settings[K]; label: TranslationKey}[];
  };
}[ChoiceSetting];
type Field = NumberField | ToggleField | ChoiceField;
const buffer: NumberField = {
  type: 'number',
  key: 'buffer',
  label: 'fieldBuffer',
  min: 1,
  max: 500,
  step: 1,
  unit: 'req',
};
const concurrency: NumberField = {
  type: 'number',
  key: 'concurrency',
  label: 'fieldConcurrencyReplica',
  min: 1,
  max: 60,
  step: 1,
  unit: 'slots',
};
const latency: NumberField = {
  type: 'number',
  key: 'latencyMs',
  label: 'fieldLatency',
  min: 10,
  max: 1000,
  step: 10,
  unit: 'ms',
};
const processFields: readonly Field[] = [
  {type: 'number', key: 'replicas', label: 'fieldReplicas', min: 1, max: 12, step: 1},
  concurrency,
  latency,
  buffer,
];
const FIELDS: Record<NodeKind, readonly Field[]> = {
  source: [
    {type: 'number', key: 'rps', label: 'fieldRps', min: 0, max: 2000, step: 10, unit: 'req/s'},
    {
      type: 'number',
      key: 'readPercent',
      label: 'fieldReadPercent',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      help: 'readPercentHelp',
    },
    {
      type: 'toggle',
      key: 'respectBackpressure',
      label: 'fieldRespectBackpressure',
      help: 'respectHelp',
    },
  ],
  service: processFields,
  sink: processFields,
  queue: [
    {
      type: 'number',
      key: 'capacity',
      label: 'fieldCapacity',
      min: 10,
      max: 1500,
      step: 10,
      unit: 'msg',
    },
    {
      type: 'number',
      key: 'prefetch',
      label: 'fieldPrefetch',
      min: 1,
      max: 100,
      step: 1,
      unit: 'msg',
      help: 'prefetchHelp',
    },
    {
      type: 'choice',
      key: 'overflow',
      label: 'fieldOverflow',
      options: [
        {value: 'wait', label: 'waitOption'},
        {value: 'reject', label: 'rejectOption'},
        {value: 'drop-oldest', label: 'dropOption'},
      ],
    },
    {
      type: 'choice',
      key: 'shaper',
      label: 'fieldShaper',
      options: [
        {value: 'none', label: 'noShaping'},
        {value: 'token', label: 'tokenOption'},
        {value: 'leaky', label: 'leakyOption'},
      ],
    },
    {
      type: 'number',
      key: 'rate',
      label: 'fieldRate',
      min: 1,
      max: 1500,
      step: 1,
      unit: 'msg/s',
      help: 'rateHelp',
    },
    {
      type: 'number',
      key: 'burst',
      label: 'fieldBurst',
      min: 1,
      max: 500,
      step: 1,
      unit: 'tokens',
      help: 'burstHelp',
    },
    {type: 'toggle', key: 'adaptive', label: 'fieldAdaptive', help: 'adaptiveHelp'},
  ],
  lb: [
    {
      type: 'choice',
      key: 'algorithm',
      label: 'fieldAlgorithm',
      options: [
        {value: 'round-robin', label: 'roundRobin'},
        {value: 'least-loaded', label: 'leastLoaded'},
      ],
    },
    {
      type: 'number',
      key: 'maxRps',
      label: 'fieldMaxRps',
      min: 20,
      max: 5000,
      step: 20,
      unit: 'req/s',
    },
    {...buffer, min: 5, step: 5, label: 'fieldAdmissionBuffer'},
  ],
  cache: [
    {type: 'number', key: 'hitRate', label: 'fieldHitRate', min: 0, max: 100, step: 5, unit: '%'},
    {...latency, label: 'fieldCacheLatency', max: 200},
    {...concurrency, label: 'fieldConcurrency', min: 10, max: 300, step: 10},
    {...buffer, min: 10, step: 10},
  ],
  db: [
    {
      type: 'number',
      key: 'readRps',
      label: 'fieldReadRps',
      min: 10,
      max: 1500,
      step: 10,
      unit: 'read/s',
    },
    {
      type: 'number',
      key: 'writeRps',
      label: 'fieldWriteRps',
      min: 5,
      max: 1000,
      step: 5,
      unit: 'write/s',
    },
    {type: 'number', key: 'readReplicas', label: 'fieldReadReplicas', min: 0, max: 8, step: 1},
    {type: 'toggle', key: 'replicaReads', label: 'fieldReplicaReads', help: 'replicaReadsHelp'},
    {...latency, label: 'fieldDbLatency', max: 500},
    {...concurrency, label: 'fieldConnections', max: 150, unit: ''},
    {...buffer, label: 'fieldDbBuffer', min: 10, max: 1000, step: 10},
  ],
};
const EXPLANATIONS: Record<NodeKind, TranslationKey> = {
  source: 'sourceExplanation',
  service: 'serviceExplanation',
  sink: 'serviceExplanation',
  queue: 'queueExplanation',
  lb: 'lbExplanation',
  cache: 'cacheExplanation',
  db: 'dbExplanation',
};
const WATERMARKS: readonly Field[] = [
  {
    type: 'number',
    key: 'highWater',
    label: 'fieldHighWater',
    min: 50,
    max: 100,
    step: 5,
    unit: '%',
  },
  {type: 'number', key: 'lowWater', label: 'fieldLowWater', min: 5, max: 45, step: 5, unit: '%'},
];
function updateChoice(store: Playground, node: FlowNode, key: ChoiceSetting, value: string): void {
  if (key === 'overflow' && (value === 'wait' || value === 'reject' || value === 'drop-oldest'))
    store.updateSetting(node.id, key, value);
  if (key === 'shaper' && (value === 'none' || value === 'token' || value === 'leaky'))
    store.updateSetting(node.id, key, value);
  if (key === 'algorithm' && (value === 'round-robin' || value === 'least-loaded'))
    store.updateSetting(node.id, key, value);
}
function ConfigField({
  field,
  node,
  store,
}: {
  field: Field;
  node: FlowNode;
  store: Playground;
}): JSX.Element {
  const {t} = useTranslation();
  const label = t(field.label);
  const id = `config-${node.id}-${field.key}`;
  if (field.type === 'toggle')
    return (
      <div className="field toggle-field">
        <label>
          <span>{label}</span>
          <input
            type="checkbox"
            checked={node.config[field.key]}
            onChange={(event) =>
              store.updateSetting(node.id, field.key, event.currentTarget.checked)
            }
          />
          <i />
        </label>
        {field.help && <p>{t(field.help)}</p>}
      </div>
    );
  if (field.type === 'choice')
    return (
      <div className="field">
        <label className="select-label">
          {label}
          <select
            value={node.config[field.key]}
            onChange={(event) => updateChoice(store, node, field.key, event.currentTarget.value)}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  const update = (value: number): void => {
    if (Number.isFinite(value))
      store.updateSetting(node.id, field.key, Math.max(field.min, Math.min(field.max, value)));
  };
  return (
    <div className="field">
      <div className="field-top">
        <label htmlFor={id}>{label}</label>
        <span className="number-wrap">
          <input
            type="number"
            data-config={field.key}
            aria-label={label}
            min={field.min}
            max={field.max}
            step={field.step}
            value={node.config[field.key]}
            onChange={(event) => update(event.currentTarget.valueAsNumber)}
          />
          <small>{field.unit}</small>
        </span>
      </div>
      <input
        id={id}
        type="range"
        data-config={field.key}
        min={field.min}
        max={field.max}
        step={field.step}
        value={node.config[field.key]}
        onChange={(event) => update(event.currentTarget.valueAsNumber)}
      />
      {field.help && <p>{t(field.help)}</p>}
    </div>
  );
}
export function Inspector({store}: {store: Playground}): JSX.Element {
  const {t} = useTranslation();
  const edge = store.design.edges.find((edge) => edge.id === store.selectedEdge);
  const node = store.design.nodes.find((node) => node.id === store.selected);
  if (edge)
    return (
      <aside className="inspector">
        <div className="inspector-title">
          <span className="eyebrow">{t('connection')}</span>
          <Icon name="arrow" />
        </div>
        <div className="inspector-body">
          <h2>{t('trafficRoute')}</h2>
          <p className="inspector-description">
            {store.design.nodes.find((node) => node.id === edge.from)?.label} →{' '}
            {store.design.nodes.find((node) => node.id === edge.to)?.label}
          </p>
          <button className="danger-button" onClick={() => store.deleteEdge()}>
            <Icon name="trash" />
            {t('deleteConnection')}
          </button>
          <p className="field-note">{t('topologyNote')}</p>
        </div>
      </aside>
    );
  if (!node)
    return (
      <aside className="inspector">
        <div className="inspector-title">
          <span className="eyebrow">{t('inspector')}</span>
          <Icon name="service" />
        </div>
        <div className="inspector-body empty-inspector">
          <h2>{t('makeItYours')}</h2>
          <p>{t('selectComponent')}</p>
        </div>
      </aside>
    );
  const state = store.simulation.states.get(node.id)!;
  const metrics: [number, TranslationKey][] =
    node.kind === 'db'
      ? [
          [state.reads, 'read'],
          [state.writes, 'write'],
          [state.active.length, 'active'],
        ]
      : node.kind === 'cache'
        ? [
            [state.hits, 'hits'],
            [state.misses, 'misses'],
            [state.ready.length, 'pending'],
          ]
        : [
            [state.received, 'received'],
            [state.ready.length, 'pending'],
            [node.kind === 'queue' ? state.unacked.size : state.active.length, 'inFlight'],
          ];
  return (
    <aside className="inspector">
      <div className="inspector-title">
        <span className="eyebrow">{t('configuration')}</span>
        <span className="edit-live">{t('live')}</span>
      </div>
      <div className="inspector-body">
        <div className={`inspector-node type-${node.kind}`}>
          <span className="library-icon">
            <Icon name={node.kind} />
          </span>
          <div>
            <input
              className="node-name-input"
              aria-label={t('nodeName')}
              value={node.label}
              maxLength={40}
              onChange={(event) => store.renameNode(node.id, event.currentTarget.value)}
            />
            <small>{node.kind.toUpperCase()}</small>
          </div>
        </div>
        <div className="selected-metrics">
          {metrics.map(([value, key]) => (
            <span key={key}>
              <b>{value}</b> {t(key)}
            </span>
          ))}
        </div>
        <div className="inspector-controls">
          {FIELDS[node.kind].map((field) => (
            <ConfigField key={field.key} field={field} node={node} store={store} />
          ))}
          {node.kind === 'queue' && (
            <details className="advanced">
              <summary>{t('watermarks')}</summary>
              {WATERMARKS.map((field) => (
                <ConfigField key={field.key} field={field} node={node} store={store} />
              ))}
            </details>
          )}
        </div>
        <div className="explanation">
          <Icon name="help" />
          <p>{t(EXPLANATIONS[node.kind])}</p>
        </div>
        <div className="node-actions">
          <button
            className={`plain-button ${node.config.online ? '' : 'offline-button'}`}
            onClick={() => store.toggleOnline(node.id)}
          >
            {t(node.config.online ? 'takeOffline' : 'recover')}
          </button>
          <button
            className="icon-button danger"
            aria-label={t('deleteNode')}
            title={t('deleteNode')}
            onClick={() => store.deleteNode(node.id)}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </aside>
  );
}
