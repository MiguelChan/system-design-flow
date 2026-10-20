import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {CSSProperties, JSX, PointerEvent as ReactPointerEvent, Ref} from 'react';
import {useTranslation} from 'react-i18next';
import type {TFunction} from 'i18next';
import type {Playground} from '../playground.ts';
import type {FlowNode, NodeKind} from '../simulation.ts';
import {getScenario} from '../presets.ts';
import type {TranslationKey} from '../i18n/es.ts';
import {Icon} from './Icon.tsx';
import {distanceBetween, midpoint, pinchViewport, MIN_SCALE, MAX_SCALE} from '../viewport.ts';
import type {Point, Viewport, PinchGesture} from '../viewport.ts';

interface Drag extends Point {
  id: string | null;
  startX: number;
  startY: number;
  scale: number;
  moved: boolean;
}
export interface CanvasHandle {
  addNode: (kind: NodeKind, label: string) => void;
}
interface CanvasProps {
  store: Playground;
  ref: Ref<CanvasHandle>;
  onHint: () => void;
  onInspect: () => void;
}

function curve(from: FlowNode, to: FlowNode): [Point, Point, Point, Point] {
  const start = {x: from.x + 210, y: from.y + 79};
  const end = {x: to.x, y: to.y + 79};
  const distance = Math.max(65, Math.abs(end.x - start.x) * 0.45);
  return [start, {x: start.x + distance, y: start.y}, {x: end.x - distance, y: end.y}, end];
}
function edgePath(from: FlowNode, to: FlowNode): string {
  const [a, b, c, d] = curve(from, to);
  return `M${a.x},${a.y} C${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
}
function particlePoint(from: FlowNode, to: FlowNode, progress: number): Point {
  const [a, b, c, d] = curve(from, to);
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * a.x +
      3 * inverse ** 2 * progress * b.x +
      3 * inverse * progress ** 2 * c.x +
      progress ** 3 * d.x,
    y:
      inverse ** 3 * a.y +
      3 * inverse ** 2 * progress * b.y +
      3 * inverse * progress ** 2 * c.y +
      progress ** 3 * d.y,
  };
}
function subtitle(node: FlowNode, t: TFunction): string {
  const config = node.config;
  switch (node.kind) {
    case 'source':
      return t('sourceSubtitle', {rps: String(config.rps), percent: String(config.readPercent)});
    case 'lb':
      return t(config.algorithm === 'round-robin' ? 'roundRobin' : 'leastLoaded');
    case 'service':
      return t('serviceSubtitle', {
        replicas: String(config.replicas),
        slots: String(config.concurrency),
      });
    case 'queue':
      return t('queueSubtitle', {
        policy: t(
          config.overflow === 'wait'
            ? 'waitShort'
            : config.overflow === 'reject'
              ? 'rejectShort'
              : 'dropShort',
        ),
        shaper: t(
          config.shaper === 'none'
            ? 'noShaping'
            : config.shaper === 'token'
              ? 'tokenShort'
              : 'leakyShort',
        ),
      });
    case 'cache':
      return t('cacheSubtitle', {rate: String(config.hitRate)});
    case 'db':
      return t('dbSubtitle', {replicas: String(config.readReplicas)});
    case 'sink':
      return t('sinkSubtitle');
  }
}
function NodeCard({
  node,
  store,
  onInspect,
}: {
  node: FlowNode;
  store: Playground;
  onInspect: () => void;
}): JSX.Element {
  const {t, i18n} = useTranslation();
  const state = store.simulation.states.get(node.id)!;
  const format = (value: number): string => new Intl.NumberFormat(i18n.language).format(value);
  const load = Math.min(
    1,
    state.ready.length /
      Math.max(1, node.kind === 'queue' ? node.config.capacity : node.config.buffer),
  );
  const status: {label: TranslationKey; tone: string} = !node.config.online
    ? {label: 'offline', tone: 'offline'}
    : state.pressure || state.blocked
      ? {label: 'pressure', tone: 'pressure'}
      : load >= 0.7
        ? {label: 'accumulating', tone: 'pressure'}
        : state.active.length || state.sent || state.ready.length
          ? {label: 'processing', tone: 'healthy'}
          : {label: 'idle', tone: 'idle'};
  const detail =
    node.kind === 'queue'
      ? t('flightCount', {
          value: String(state.unacked.size),
          limit: String(node.config.adaptive ? state.credits : node.config.prefetch),
        })
      : node.kind === 'db'
        ? t('writesCount', {value: String(state.writes)})
        : t('activeCount', {value: String(state.active.length)});
  return (
    <article
      className={`flow-node type-${node.kind} ${store.selected === node.id ? 'selected' : ''} ${status.tone === 'pressure' ? 'under-pressure' : ''} ${node.config.online ? '' : 'is-offline'}`}
      data-node={node.id}
      style={{left: node.x, top: node.y}}
      tabIndex={0}
      role="button"
      aria-label={t('configureNode', {name: node.label})}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          store.selectNode(node.id);
          onInspect();
        }
      }}
    >
      {node.kind !== 'source' && (
        <button
          className="port port-in"
          data-in={node.id}
          aria-label={t('connectInput', {name: node.label})}
          title={t('inputPort')}
          onClick={() => store.connect(node.id)}
        />
      )}
      <div className="node-heading">
        <span className="node-icon">
          <Icon name={node.kind} />
        </span>
        <b>{node.label}</b>
        <span className="node-type">
          {node.kind === 'db' ? 'SQL' : node.kind === 'service' ? 'APP' : node.kind.toUpperCase()}
        </span>
      </div>
      <p className="node-subtitle">{subtitle(node, t)}</p>
      <div className="node-numbers">
        <span>
          <strong>{format(state.rate)}</strong>
          <small>{t(node.kind === 'source' ? 'sourceRate' : 'outputRate')}</small>
        </span>
        <span>
          <strong>{format(state.ready.length)}</strong>
          <small>{t(node.kind === 'queue' ? 'queued' : 'waiting')}</small>
        </span>
      </div>
      <div className="node-track">
        <i style={{width: `${load * 100}%`}} />
      </div>
      <div className="node-bottom">
        <span className={`node-status ${status.tone}`}>
          <i />
          <span>{t(status.label)}</span>
        </span>
        <small>{detail}</small>
      </div>
      {node.kind !== 'sink' && (
        <button
          className="port port-out"
          data-out={node.id}
          aria-label={t('connectOutput', {name: node.label})}
          title={t('outputPort')}
          onClick={() => {
            store.connecting = node.id;
            store.notify();
          }}
        />
      )}
    </article>
  );
}
export function ArchitectureCanvas({store, ref, onHint, onInspect}: CanvasProps): JSX.Element {
  const {t} = useTranslation();
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<PinchGesture | null>(null);
  const suppressClick = useRef(false);
  const [view, setView] = useState<Viewport>({x: 20, y: 30, scale: 0.8});
  const [dragging, setDragging] = useState(false);
  const nodes = store.design.nodes;
  const fit = useCallback((): void => {
    const bounds = board.current?.getBoundingClientRect();
    if (!bounds || !nodes.length) return;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const width = Math.max(...nodes.map((node) => node.x)) + 235 - minX;
    const height = Math.max(...nodes.map((node) => node.y)) + 170 - minY;
    const scale = Math.min(
      1.1,
      Math.max(MIN_SCALE, Math.min((bounds.width - 36) / width, (bounds.height - 72) / height)),
    );
    setView({
      scale,
      x: (bounds.width - width * scale) / 2 - minX * scale,
      y: (bounds.height - height * scale) / 2 - minY * scale - 15,
    });
  }, [nodes]);
  useLayoutEffect(() => {
    fit();
  }, [fit, store.fitRevision]);
  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      setView((current) => {
        if (!event.ctrlKey && !event.metaKey)
          return {...current, x: current.x - event.deltaX, y: current.y - event.deltaY};
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const scale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, current.scale * Math.exp(-event.deltaY * 0.005)),
        );
        return {
          scale,
          x: x - ((x - current.x) * scale) / current.scale,
          y: y - ((y - current.y) * scale) / current.scale,
        };
      });
    };
    element.addEventListener('wheel', wheel, {passive: false});
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
    };
  }, [fit]);
  useImperativeHandle(
    ref,
    () => ({
      addNode: (kind: NodeKind, label: string): void => {
        const bounds = board.current?.getBoundingClientRect();
        if (bounds)
          store.addNode(
            kind,
            label,
            (bounds.width / 2 - view.x) / view.scale - 105,
            (bounds.height / 2 - view.y) / view.scale - 75,
          );
      },
    }),
    [store, view],
  );
  const relativePoint = (point: Point): Point => {
    const bounds = board.current?.getBoundingClientRect();
    return {x: point.x - (bounds?.left ?? 0), y: point.y - (bounds?.top ?? 0)};
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    if (!pointers.current.size) suppressClick.current = false;
    if (event.pointerType === 'touch') {
      pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = {
          view,
          center: relativePoint(midpoint(a, b)),
          distance: distanceBetween(a, b),
        };
        drag.current = null;
        suppressClick.current = true;
        setDragging(true);
        for (const id of pointers.current.keys()) event.currentTarget.setPointerCapture(id);
        event.preventDefault();
        return;
      }
    }
    if (pinch.current || !(event.target instanceof Element) || event.target.closest('.port, .edge'))
      return;
    const id = event.target.closest<HTMLElement>('[data-node]')?.dataset.node;
    const node = nodes.find((node) => node.id === id);
    if (node) store.selectNode(node.id);
    drag.current = {
      id: node?.id ?? null,
      startX: event.clientX,
      startY: event.clientY,
      x: node?.x ?? view.x,
      y: node?.y ?? view.y,
      scale: view.scale,
      moved: false,
    };
    setDragging(true);
    event.currentTarget.focus({preventScroll: true});
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (pointers.current.has(event.pointerId))
      pointers.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pinch.current) {
      const [a, b] = [...pointers.current.values()];
      if (a && b)
        setView(pinchViewport(pinch.current, relativePoint(midpoint(a, b)), distanceBetween(a, b)));
      return;
    }
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    current.moved ||= Math.abs(dx) + Math.abs(dy) > 5;
    if (!current.moved) return;
    if (current.id)
      store.moveNode(current.id, current.x + dx / current.scale, current.y + dy / current.scale);
    else setView((view) => ({...view, x: current.x + dx, y: current.y + dy}));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false): void => {
    pointers.current.delete(event.pointerId);
    if (pinch.current) {
      if (!pointers.current.size) {
        pinch.current = null;
        setDragging(false);
      }
      return;
    }
    const current = drag.current;
    if (current?.id) {
      store.save();
      if (!cancelled && !current.moved) onInspect();
    } else if (current && !cancelled && !current.moved) store.clearSelection();
    drag.current = null;
    setDragging(false);
  };
  const worldStyle: CSSProperties & {'--canvas-scale': number} = {
    transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
    '--canvas-scale': view.scale,
  };
  const scenario = getScenario(store.scenarioId);
  return (
    <section className="canvas-panel">
      <div className="canvas-heading">
        <div>
          <b>{t('architecture')}</b>
          <span>{t('canvasSubtitle')}</span>
        </div>
        <div className="canvas-controls">
          <button
            className="icon-button"
            aria-label={t('zoomOut')}
            onClick={() =>
              setView((view) => ({...view, scale: Math.max(MIN_SCALE, view.scale - 0.1)}))
            }
          >
            −
          </button>
          <span>{Math.round(view.scale * 100)}%</span>
          <button
            className="icon-button"
            aria-label={t('zoomIn')}
            onClick={() =>
              setView((view) => ({...view, scale: Math.min(MAX_SCALE, view.scale + 0.1)}))
            }
          >
            +
          </button>
          <button className="icon-button" aria-label={t('fit')} onClick={fit}>
            <Icon name="fit" />
          </button>
        </div>
      </div>
      <div
        className={`board ${dragging ? 'dragging' : ''}`}
        ref={board}
        tabIndex={0}
        aria-label={t('canvasLabel')}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={endDrag}
        onPointerCancel={(event) => endDrag(event, true)}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDown={(event) => {
          if (event.code === 'Space' && event.target === event.currentTarget) {
            event.preventDefault();
            store.setRunning(!store.running);
          }
        }}
      >
        <div className="world" style={worldStyle}>
          <svg className="edges" width="4000" height="2400" aria-label={t('connections')}>
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L6,3 z" fill="#66768d" />
              </marker>
            </defs>
            {store.design.edges.map((edge) => {
              const from = nodes.find((node) => node.id === edge.from);
              const to = nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;
              const select = (): void => {
                store.selectedEdge = edge.id;
                store.selected = null;
                store.notify();
                onInspect();
              };
              return (
                <g
                  key={edge.id}
                  className={`edge ${store.selectedEdge === edge.id ? 'selected' : ''}`}
                  data-edge={edge.id}
                  role="button"
                  tabIndex={0}
                  aria-label={t('connectionLabel', {from: from.label, to: to.label})}
                  onClick={select}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') select();
                  }}
                >
                  <path className="edge-hit" d={edgePath(from, to)} />
                  <path className="edge-line" d={edgePath(from, to)} markerEnd="url(#arrowhead)" />
                </g>
              );
            })}
            {store.simulation.transfers.slice(-65).map((transfer, index) => {
              const edge = store.design.edges.find((edge) => edge.id === transfer.edge);
              const from = nodes.find((node) => node.id === edge?.from);
              const to = nodes.find((node) => node.id === edge?.to);
              if (!from || !to) return null;
              const progress = Math.min(1, (store.simulation.time - transfer.at) / 0.8);
              const point = particlePoint(from, to, progress);
              return (
                <circle
                  key={`${transfer.at}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="3.4"
                  fill={transfer.kind === 'read' ? '#65e9c5' : '#ba9cff'}
                  opacity={1 - progress * 0.35}
                />
              );
            })}
          </svg>
          <div>
            {nodes.map((node) => (
              <NodeCard key={node.id} node={node} store={store} onInspect={onInspect} />
            ))}
          </div>
        </div>
        {store.connecting && <div className="connect-hint">{t('connectHint')}</div>}
        <div className="board-legend">
          <span>
            <i className="read-dot" />
            {t('read')}
          </span>
          <span>
            <i className="write-dot" />
            {t('write')}
          </span>
          <span className="drag-tip">{t('dragTip')}</span>
          <span className="touch-tip">{t('touchTip')}</span>
        </div>
        {!store.design.edges.length && <div className="empty-hint">{t('emptyHint')}</div>}
      </div>
      <div className="mission">
        <span className="mission-badge">
          {store.scenarioId === 'free'
            ? t('sandbox')
            : t('missionBadge', {
                number: String(
                  ['pressure', 'reads', 'balance'].indexOf(store.scenarioId) + 1,
                ).padStart(2, '0'),
              })}
        </span>
        <div>
          <b>{t(scenario.title)}</b>
          <p>{t(scenario.mission)}</p>
        </div>
        <button className="plain-button" onClick={onHint}>
          {t('hint')}
          <Icon name="help" />
        </button>
        <div className={`goal ${store.goalWon ? 'won' : ''}`}>
          <span style={{width: `${store.goalWon ? 100 : store.goalStreak * 20}%`}} />
          <small>
            {store.scenarioId === 'free'
              ? t('explore')
              : store.goalWon
                ? t('achieved')
                : t('goalProgress', {value: String(Math.min(5, store.goalStreak))})}
          </small>
        </div>
      </div>
    </section>
  );
}
