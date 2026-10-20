import "./style.css";
import {
  Simulation,
  createNode,
  cloneDesign,
  validateDesign,
  DEFAULTS,
  type Design,
  type FlowNode,
  type NodeKind,
  type Settings,
} from "./simulation.ts";
import { SCENARIOS } from "./presets.ts";

const ICONS: Record<string, string> = {
  source:
    '<path d="M9 20v-2a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v2M14.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M4 20v-2a5 5 0 0 1 3-4.6M6 4a3 3 0 0 0 0 6"/>',
  lb: '<path d="M4 12h5m0 0 5-7h6M9 12l5 7h6M18 3l2 2-2 2m0 10 2 2-2 2"/>',
  service:
    '<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M13 6.5h4m-4 11h4"/>',
  queue:
    '<rect x="3" y="5" width="5" height="14" rx="1"/><rect x="10" y="5" width="5" height="14" rx="1"/><path d="M18 5h3v14h-3M5.5 9v6m7-6v6"/>',
  cache: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  sink: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-5-10 3 3 6-6"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  burst: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/>',
  import: '<path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2.5M12 17h.01"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
};
function icon(name: string, cls = ""): string {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.service}</svg>`;
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fmt = (n: number, decimals = 0) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: decimals }).format(n);
const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const STORAGE = "system-design-flow-v1";
let scenarioId = "pressure";
let design = cloneDesign(SCENARIOS[0].design);
try {
  const saved = localStorage.getItem(STORAGE);
  if (saved) {
    const parsed = parseDesign(JSON.parse(saved));
    design = parsed;
    const savedScenario = JSON.parse(saved).scenarioId;
    scenarioId = SCENARIOS.some((s) => s.id === savedScenario) ? savedScenario : "free";
  }
} catch {
  /* A malformed save never prevents opening the lab. */
}
let sim = new Simulation(design);
let running = false;
let speed = 1;
let selected: string | null =
  design.nodes.find((n) => n.kind === "queue")?.id ??
  design.nodes[0]?.id ??
  null;
let connecting: string | null = null;
let selectedEdge: string | null = null;
let scale = 0.8;
let pan = { x: 20, y: 30 };
let lastFrame = 0;
let accumulator = 0;
let lastRender = 0;
let goalStreak = 0;
let goalSample = 0;
let goalWon = false;
let toastTimer: ReturnType<typeof setTimeout>;

$("#app").innerHTML = `
  <header class="app-header">
    <a class="brand" href="#" aria-label="FlowLab inicio"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>Flow<span class="brand-lab">Lab</span><small>SYSTEM DESIGN PLAYGROUND</small></span></a>
    <div class="header-center"><span class="live-dot"></span> Tu arquitectura. Tus experimentos.</div>
    <div class="header-actions"><span id="save-status" class="save-status">Guardado en este navegador</span><button class="icon-button" id="export" title="Exportar arquitectura JSON" aria-label="Exportar arquitectura">${icon("export")}</button><button class="icon-button" id="import" title="Importar arquitectura JSON" aria-label="Importar arquitectura">${icon("import")}</button><button class="help-button" id="help">${icon("help")} Cómo jugar</button></div>
  </header>
  <section class="experiment-bar">
    <div class="experiment-picker"><span class="eyebrow">EXPERIMENTO</span><select id="scenario" aria-label="Elegir experimento">${SCENARIOS.map((s) => `<option value="${s.id}">${s.title}</option>`).join("")}</select></div>
    <div class="transport"><button id="play" class="play-button">${icon("play")}<span>Iniciar</span></button><button id="step" class="plain-button" title="Avanzar un segundo simulado">+1 s</button><button id="reset" class="icon-button" title="Reiniciar simulación" aria-label="Reiniciar simulación">${icon("reset")}</button><span class="separator"></span><select id="speed" aria-label="Velocidad de simulación"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="5">5×</option></select><span class="sim-clock">${icon("clock")}<b id="clock">00:00</b></span></div>
    <button class="burst-button" id="burst">${icon("burst")} Ráfaga ×3 <span>5 s</span></button>
  </section>
  <section class="metrics" aria-label="Métricas de simulación">
    <div class="metric"><span>DEMANDA</span><strong id="m-demand">0<small>req/s</small></strong><em>Intentos del generador</em></div>
    <div class="metric"><span>ADMITIDAS</span><strong id="m-admitted">0<small>req/s</small></strong><em>Entraron al sistema</em></div>
    <div class="metric"><span>COMPLETADAS</span><strong class="mint" id="m-completed">0<small>req/s</small></strong><em>Throughput de salida</em></div>
    <div class="metric"><span>LATENCIA P95</span><strong id="m-p95">—<small>ms</small></strong><em>Muestra reciente · ≤15 s</em></div>
    <div class="metric"><span>EN ESPERA</span><strong id="m-backlog">0<small>req</small></strong><em id="m-age">Más antigua: 0 s</em></div>
    <div class="metric"><span>RECHAZOS / DESCARTES</span><strong id="m-rejected">0 <small>/</small> 0</strong><em id="m-throttled">0 frenadas por backpressure</em></div>
  </section>
  <main class="workspace">
    <aside class="library"><div class="panel-heading"><span class="eyebrow">COMPONENTES</span><span class="tiny">${icon("plus")}</span></div><p class="panel-intro">Añade al lienzo.<br>Conecta sus puertos.</p>
      <div class="component-list">${(
        [
          ["source", "Clientes", "Generador de requests"],
          ["lb", "Load balancer", "Round robin · least loaded"],
          ["service", "API / Worker", "Concurrencia y réplicas"],
          ["queue", "Message queue", "Buffer · créditos · shaping"],
          ["cache", "Redis / Cache", "Lecturas desde memoria"],
          ["db", "Relational DB", "Lecturas, writes y réplicas"],
          ["sink", "Respuesta", "Fin de la solicitud"],
        ] as [NodeKind, string, string][]
      )
        .map(
          ([kind, title, desc]) =>
            `<button class="library-item type-${kind}" data-add="${kind}"><span class="library-icon">${icon(kind)}</span><span><b>${title}</b><small>${desc}</small></span></button>`,
        )
        .join("")}</div>
      <div class="library-footer"><span class="live-dot"></span><b>Motor local</b><p>Sin servicios reales.<br>Sin costes de infraestructura.</p><a href="https://github.com/MiguelChan/system-design-flow" target="_blank" rel="noopener">Código en GitHub ↗</a></div>
    </aside>
    <section class="canvas-panel">
      <div class="canvas-heading"><div><b>Arquitectura</b><span id="canvas-subtitle">Selecciona un componente para experimentar</span></div><div class="canvas-controls"><button class="icon-button" id="zoom-out" aria-label="Alejar">−</button><span id="zoom-label">80%</span><button class="icon-button" id="zoom-in" aria-label="Acercar">+</button><button class="icon-button" id="fit" title="Ajustar al lienzo" aria-label="Ajustar arquitectura al lienzo">${icon("fit")}</button></div></div>
      <div class="board" id="board" tabindex="0" aria-label="Lienzo de arquitectura. Arrastra componentes. Conecta un puerto de salida con uno de entrada."><div class="world" id="world"><svg id="edges" class="edges" width="4000" height="2400" aria-label="Conexiones entre componentes"></svg><div id="nodes"></div></div><div id="connect-hint" class="connect-hint" hidden></div><div class="board-legend"><span><i class="read-dot"></i> Read</span><span><i class="write-dot"></i> Write</span><span class="drag-tip">Arrastra el fondo para moverte · Ctrl + scroll para zoom</span></div><div id="empty-hint" class="empty-hint" hidden>Conecta la salida de Clientes con la entrada de otro componente.</div></div>
      <div class="mission"><span id="mission-badge" class="mission-badge">MISIÓN 01</span><div><b id="mission-title"></b><p id="mission-text"></p></div><button id="hint" class="plain-button">Una pista ${icon("help")}</button><div id="goal" class="goal"><span></span><small id="goal-progress">0 / 5 s</small></div></div>
    </section>
    <aside class="inspector" id="inspector"></aside>
  </main>
  <section class="observatory"><div class="chart-panel"><div class="chart-heading"><b>Tráfico en vivo</b><div class="chart-legend"><span><i class="demand-line"></i> Demanda</span><span><i class="admit-line"></i> Admitidas</span><span><i class="complete-line"></i> Completadas</span></div><small>Últimos 90 s simulados</small></div><div class="chart-wrap"><canvas id="chart" aria-label="Gráfica de demanda, admisiones y respuestas por segundo"></canvas><span class="chart-unit">req/s</span></div></div><div class="events-panel"><div class="chart-heading"><b>Qué está pasando</b><span class="live-dot"></span></div><div id="events" class="events"></div></div></section>
  <footer class="footer"><span>Modelo educativo determinista · resolución de 10 ms · valores configurables, no benchmarks reales</span><button id="assumptions">Supuestos y límites del modelo ↗</button><span>Hecho para aprender haciendo.</span></footer>
  <div id="toast" class="toast" role="status"></div><div id="modal-root"></div><input id="import-file" type="file" accept="application/json,.json" hidden />
`;

function save(): void {
  try {
    localStorage.setItem(
      STORAGE,
      JSON.stringify({ ...design, version: 1, scenarioId }),
    );
    $("#save-status").textContent = "Guardado en este navegador";
  } catch {
    $("#save-status").textContent = "Almacenamiento local no disponible";
  }
}
function toast(message: string): void {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
function reset(): void {
  sim = new Simulation(design);
  goalStreak = 0;
  goalSample = 0;
  goalWon = false;
  accumulator = 0;
  renderStats();
}
function setRunning(value: boolean): void {
  if (value) {
    const errors = validateDesign(design);
    if (errors.length) {
      toast(errors[0]);
      return;
    }
  }
  running = value;
  lastFrame = performance.now();
  $("#play").innerHTML =
    `${icon(running ? "pause" : "play")}<span>${running ? "Pausar" : "Iniciar"}</span>`;
  $("#play").classList.toggle("running", running);
  $("#step").toggleAttribute("disabled", running);
}
function scenario(): (typeof SCENARIOS)[number] {
  return SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[3];
}
function loadScenario(id: string): void {
  const next = SCENARIOS.find((s) => s.id === id);
  if (!next) return;
  setRunning(false);
  scenarioId = id;
  design = cloneDesign(next.design);
  selected =
    design.nodes.find((n) => n.kind === "queue")?.id ??
    design.nodes[0]?.id ??
    null;
  selectedEdge = null;
  connecting = null;
  reset();
  renderAll();
  fit();
  save();
}
function topologyChanged(): void {
  setRunning(false);
  reset();
  renderAll();
  save();
  toast("Topología actualizada. Simulación reiniciada.");
}
function renderAll(): void {
  $("#scenario").setAttribute("value", scenarioId);
  $<HTMLSelectElement>("#scenario").value = scenarioId;
  $("#mission-title").textContent = scenario().title;
  $("#mission-text").textContent = scenario().mission;
  $("#mission-badge").textContent =
    scenarioId === "free"
      ? "SANDBOX"
      : `MISIÓN 0${SCENARIOS.findIndex((s) => s.id === scenarioId) + 1}`;
  $("#empty-hint").toggleAttribute("hidden", design.edges.length > 0);
  renderNodes();
  renderEdges();
  renderInspector();
  renderStats();
}
function nodeStatus(node: FlowNode): {
  label: string;
  tone: string;
  load: number;
} {
  const s = sim.states.get(node.id)!;
  const c = node.config;
  if (!c.online) return { label: "Fuera de línea", tone: "offline", load: 0 };
  const cap = node.kind === "queue" ? c.capacity : c.buffer;
  const load = Math.min(1, s.ready.length / Math.max(1, cap));
  if (s.pressure || s.blocked)
    return { label: "Backpressure", tone: "pressure", load };
  if (load >= 0.7) return { label: "Acumulando", tone: "pressure", load };
  if (s.active.length || s.sent || s.ready.length)
    return { label: "Procesando", tone: "healthy", load };
  return { label: "En espera", tone: "idle", load };
}
function subtitle(node: FlowNode): string {
  const c = node.config;
  return {
    source: `${c.rps} req/s · ${c.readPercent}% reads`,
    lb: c.algorithm === "round-robin" ? "Round robin" : "Least loaded",
    service: `${c.replicas} réplica${c.replicas > 1 ? "s" : ""} · ${c.concurrency} slots/réplica`,
    queue: `${c.overflow === "wait" ? "Esperar" : c.overflow === "reject" ? "Rechazar" : "Descartar antiguas"} · ${c.shaper === "none" ? "sin shaping" : c.shaper === "token" ? "token bucket" : "leaky bucket"}`,
    cache: `${c.hitRate}% hit rate · writes pasan a DB`,
    db: `Primario + ${c.readReplicas} réplicas de lectura`,
    sink: "Completa la solicitud",
  }[node.kind];
}
function renderNodes(): void {
  $("#nodes").innerHTML = design.nodes
    .map(
      (
        n,
      ) => `<article class="flow-node type-${n.kind} ${selected === n.id ? "selected" : ""}" data-node="${n.id}" style="left:${n.x}px;top:${n.y}px" tabindex="0" role="button" aria-label="Configurar ${escape(n.label)}">
    ${n.kind !== "source" ? `<button class="port port-in" data-in="${n.id}" aria-label="Conectar entrada de ${escape(n.label)}" title="Entrada"></button>` : ""}
    <div class="node-heading"><span class="node-icon">${icon(n.kind)}</span><b>${escape(n.label)}</b><span class="node-type">${n.kind === "db" ? "SQL" : n.kind === "service" ? "APP" : n.kind.toUpperCase()}</span></div>
    <p class="node-subtitle">${subtitle(n)}</p>
    <div class="node-numbers"><span><strong data-stat="rate">0</strong><small>${n.kind === "source" ? "envíos/s" : "salidas/s"}</small></span><span><strong data-stat="waiting">0</strong><small>${n.kind === "queue" ? "en cola" : "esperando"}</small></span></div>
    <div class="node-track"><i></i></div><div class="node-bottom"><span class="node-status"><i></i><span>En espera</span></span><small data-stat="detail">0 activas</small></div>
    ${n.kind !== "sink" ? `<button class="port port-out" data-out="${n.id}" aria-label="Conectar salida de ${escape(n.label)}" title="Salida: haz clic y elige una entrada"></button>` : ""}
  </article>`,
    )
    .join("");
}
function edgePath(from: FlowNode, to: FlowNode): string {
  const x1 = from.x + 210,
    y1 = from.y + 79,
    x2 = to.x,
    y2 = to.y + 79;
  const dx = Math.max(65, Math.abs(x2 - x1) * 0.45);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}
function renderEdges(): void {
  $("#edges").innerHTML =
    `<defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L6,3 z" fill="#66768d"/></marker></defs>` +
    design.edges
      .map((e) => {
        const from = design.nodes.find((n) => n.id === e.from),
          to = design.nodes.find((n) => n.id === e.to);
        if (!from || !to) return "";
        return `<g class="edge ${selectedEdge === e.id ? "selected" : ""}" data-edge="${e.id}"><path class="edge-hit" d="${edgePath(from, to)}"/><path id="edge-${e.id}" class="edge-line" d="${edgePath(from, to)}" marker-end="url(#arrowhead)"/></g>`;
      })
      .join("") +
    '<g id="particles"></g>';
}
function updateTransform(): void {
  $("#world").style.transform =
    `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
  $("#zoom-label").textContent = `${Math.round(scale * 100)}%`;
}
function fit(): void {
  const board = $("#board").getBoundingClientRect();
  if (!design.nodes.length) return;
  const minX = Math.min(...design.nodes.map((n) => n.x)),
    minY = Math.min(...design.nodes.map((n) => n.y));
  const width = Math.max(...design.nodes.map((n) => n.x)) + 235 - minX;
  const height = Math.max(...design.nodes.map((n) => n.y)) + 170 - minY;
  scale = Math.min(
    1.1,
    Math.max(
      0.38,
      Math.min((board.width - 60) / width, (board.height - 95) / height),
    ),
  );
  pan = {
    x: (board.width - width * scale) / 2 - minX * scale,
    y: (board.height - height * scale) / 2 - minY * scale - 15,
  };
  updateTransform();
}
function field(
  label: string,
  key: keyof Settings,
  min: number,
  max: number,
  step: number,
  unit = "",
  description = "",
): string {
  const node = design.nodes.find((n) => n.id === selected)!;
  const value = Number(node.config[key]);
  return `<div class="field"><div class="field-top"><label for="range-${key}">${label}</label><span class="number-wrap"><input type="number" data-config="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"/><small>${unit}</small></span></div><input id="range-${key}" type="range" data-config="${key}" min="${min}" max="${max}" step="${step}" value="${value}"/>${description ? `<p>${description}</p>` : ""}</div>`;
}
function selectField(
  label: string,
  key: keyof Settings,
  options: [string, string][],
  description = "",
): string {
  const value = design.nodes.find((n) => n.id === selected)!.config[key];
  return `<div class="field"><label class="select-label">${label}<select data-config="${key}">${options.map(([v, l]) => `<option value="${v}" ${value === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>${description ? `<p>${description}</p>` : ""}</div>`;
}
function toggle(label: string, key: keyof Settings, description = ""): string {
  const checked = design.nodes.find((n) => n.id === selected)!.config[key];
  return `<div class="field toggle-field"><label><span>${label}</span><input type="checkbox" data-config="${key}" ${checked ? "checked" : ""}/><i></i></label>${description ? `<p>${description}</p>` : ""}</div>`;
}
function renderInspector(): void {
  const panel = $("#inspector");
  if (selectedEdge) {
    const e = design.edges.find((e) => e.id === selectedEdge)!;
    panel.innerHTML = `<div class="inspector-title"><span class="eyebrow">CONEXIÓN</span>${icon("arrow")}</div><div class="inspector-body"><h2>Ruta del tráfico</h2><p class="inspector-description">${escape(design.nodes.find((n) => n.id === e.from)!.label)} → ${escape(design.nodes.find((n) => n.id === e.to)!.label)}</p><button class="danger-button" id="delete-edge">${icon("trash")} Eliminar conexión</button><p class="field-note">Los cambios de topología reinician la simulación para mantener consistentes las métricas.</p></div>`;
    $("#delete-edge").addEventListener("click", () => {
      design.edges = design.edges.filter((edge) => edge.id !== selectedEdge);
      selectedEdge = null;
      topologyChanged();
    });
    return;
  }
  const n = design.nodes.find((n) => n.id === selected);
  if (!n) {
    panel.innerHTML = `<div class="inspector-title"><span class="eyebrow">INSPECTOR</span>${icon("service")}</div><div class="inspector-body empty-inspector"><h2>Hazlo tuyo.</h2><p>Selecciona un componente para cambiar su capacidad y ver qué pasa.</p></div>`;
    return;
  }
  let controls = "";
  let explanation = "";
  if (n.kind === "source") {
    controls =
      field("Tráfico objetivo", "rps", 0, 2000, 10, "req/s") +
      field(
        "Proporción de lecturas",
        "readPercent",
        0,
        100,
        5,
        "%",
        "El resto son escrituras.",
      ) +
      toggle(
        "Respetar backpressure",
        "respectBackpressure",
        "Si no entra, el productor cuenta la solicitud como frenada. Desactivado: cuenta como rechazo.",
      );
    explanation =
      "El generador representa demanda externa. “Frenadas” son intentos que todavía no entraron al sistema; no son votos confirmados.";
  } else if (n.kind === "service" || n.kind === "sink") {
    controls =
      field("Réplicas", "replicas", 1, 12, 1) +
      field("Concurrencia por réplica", "concurrency", 1, 60, 1, "slots") +
      field("Tiempo de proceso", "latencyMs", 10, 1000, 10, "ms") +
      field("Buffer local", "buffer", 1, 500, 1, "req");
    explanation =
      "Capacidad teórica ≈ réplicas × concurrencia / tiempo. Si la salida está bloqueada, una solicitud retiene su slot: la presión viaja hacia atrás.";
  } else if (n.kind === "queue") {
    controls =
      field("Capacidad de la cola", "capacity", 10, 1500, 10, "msg") +
      field(
        "Prefetch máximo",
        "prefetch",
        1,
        100,
        1,
        "msg",
        "Mensajes en vuelo hasta completar el recorrido; el ACK libera un crédito.",
      ) +
      selectField("Si no hay espacio", "overflow", [
        ["wait", "Esperar · propagar presión"],
        ["reject", "Rechazar el nuevo mensaje"],
        ["drop-oldest", "Descartar el más antiguo"],
      ]) +
      selectField("Algoritmo de salida", "shaper", [
        ["none", "Sin shaping"],
        ["token", "Token bucket · permite ráfagas"],
        ["leaky", "Leaky bucket · ritmo uniforme"],
      ]) +
      field(
        "Tasa de salida",
        "rate",
        1,
        1500,
        1,
        "msg/s",
        "Se aplica al activar token bucket o leaky bucket.",
      ) +
      field(
        "Capacidad de tokens",
        "burst",
        1,
        500,
        1,
        "tokens",
        "Solo token bucket: permite acumular crédito para una ráfaga.",
      ) +
      toggle(
        "Prefetch adaptativo · AIMD",
        "adaptive",
        "Simplificado: ante bloqueo reduce créditos ×0.7; sin bloqueo sube +1 por segundo hasta el máximo.",
      ) +
      '<details class="advanced"><summary>Umbrales de backpressure</summary>' +
      field("Pausar al llegar a", "highWater", 50, 100, 5, "%") +
      field("Reanudar al bajar a", "lowWater", 5, 45, 5, "%") +
      "</details>";
    explanation =
      "La cola almacena trabajo y absorbe ráfagas; no crea capacidad de proceso. Los umbrales se aplican en modo Esperar.";
  } else if (n.kind === "lb") {
    controls =
      selectField("Distribución de requests", "algorithm", [
        ["round-robin", "Round robin"],
        ["least-loaded", "Least loaded"],
      ]) +
      field("Capacidad del ALB", "maxRps", 20, 5000, 20, "req/s") +
      field("Buffer de admisión", "buffer", 5, 500, 5, "req");
    explanation =
      "Round robin alterna destinos. Least loaded elige el de menor trabajo activo + esperando. Es una aproximación educativa; no replica un algoritmo específico de AWS. Los destinos offline quedan fuera del reparto.";
  } else if (n.kind === "cache") {
    controls =
      field("Cache hit rate", "hitRate", 0, 100, 5, "%") +
      field("Latencia del cache", "latencyMs", 10, 200, 10, "ms") +
      field("Concurrencia", "concurrency", 10, 300, 10, "slots") +
      field("Buffer local", "buffer", 10, 500, 10, "req");
    explanation =
      "Un read con hit termina aquí. Los misses y todas las escrituras siguen a la DB. El hit rate es un parámetro probabilístico; este modelo no simula claves, TTL ni invalidación.";
  } else if (n.kind === "db") {
    controls =
      field("Lecturas por instancia", "readRps", 10, 1500, 10, "read/s") +
      field("Escrituras del primario", "writeRps", 5, 1000, 5, "write/s") +
      field("Réplicas de lectura", "readReplicas", 0, 8, 1) +
      toggle(
        "Enviar reads a las réplicas",
        "replicaReads",
        "Desactívalo para modelar todas las lecturas en el primario.",
      ) +
      field("Latencia de operación", "latencyMs", 10, 500, 10, "ms") +
      field("Conexiones activas", "concurrency", 1, 150, 1) +
      field("Buffer de la DB", "buffer", 10, 1000, 10, "req");
    explanation =
      "Las réplicas aumentan la capacidad de lectura. Las escrituras permanecen en un solo primario. Lecturas y escrituras tienen presupuestos independientes; no se modelan replication lag, bloqueos ni transacciones.";
  }
  panel.innerHTML = `<div class="inspector-title"><span class="eyebrow">CONFIGURACIÓN</span><span class="edit-live">EN VIVO</span></div><div class="inspector-body"><div class="inspector-node type-${n.kind}"><span class="library-icon">${icon(n.kind)}</span><div><input class="node-name-input" id="node-name" value="${escape(n.label)}" maxlength="40" aria-label="Nombre del componente"/><small>${n.kind === "queue" ? "MESSAGE BROKER" : n.kind === "db" ? "DATA STORE" : n.kind.toUpperCase()}</small></div></div><div class="selected-metrics" id="selected-metrics"></div><div class="inspector-controls">${controls}</div><div class="explanation">${icon("help")}<p>${explanation}</p></div><div class="node-actions"><button id="toggle-online" class="plain-button ${!n.config.online ? "offline-button" : ""}">${n.config.online ? "Simular caída" : "Recuperar componente"}</button><button id="delete-node" class="icon-button danger" aria-label="Eliminar componente" title="Eliminar componente">${icon("trash")}</button></div></div>`;
  panel
    .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-config]")
    .forEach((input) =>
      input.addEventListener("input", () => {
        const key = input.dataset.config as keyof Settings;
        let value: string | number | boolean;
        if (input instanceof HTMLInputElement && input.type === "checkbox")
          value = input.checked;
        else if (input instanceof HTMLInputElement) {
          if (!input.value) return;
          value = Math.max(
            Number(input.min),
            Math.min(Number(input.max), Number(input.value)),
          );
        } else value = input.value;
        const patch = { [key]: value } as Partial<Settings>;
        Object.assign(n.config, patch);
        sim.update(n.id, patch);
        panel
          .querySelectorAll<HTMLInputElement>(`input[data-config="${key}"]`)
          .forEach((peer) => {
            if (peer !== input && peer.type !== "checkbox")
              peer.value = String(value);
          });
        const node = $(`[data-node="${n.id}"]`);
        node.querySelector(".node-subtitle")!.textContent = subtitle(n);
        save();
        renderStats();
      }),
    );
  $("#node-name").addEventListener("input", (event) => {
    n.label = (event.target as HTMLInputElement).value;
    sim.design.nodes.find((node) => node.id === n.id)!.label = n.label;
    $(`[data-node="${n.id}"] .node-heading b`).textContent = n.label;
    save();
  });
  $("#toggle-online").addEventListener("click", () => {
    n.config.online = !n.config.online;
    sim.update(n.id, { online: n.config.online });
    sim.log(
      n.config.online ? "good" : "error",
      `${n.label}: ${n.config.online ? "recuperado" : "fuera de línea"}.`,
    );
    renderInspector();
    renderStats();
    save();
  });
  $("#delete-node").addEventListener("click", () => {
    design.nodes = design.nodes.filter((node) => node.id !== n.id);
    design.edges = design.edges.filter((e) => e.from !== n.id && e.to !== n.id);
    selected = null;
    topologyChanged();
  });
}
function renderStats(): void {
  const sample = sim.latest;
  for (const key of ["demand", "admitted", "completed"] as const)
    $(`#m-${key}`).innerHTML = `${fmt(sample[key])}<small>req/s</small>`;
  $("#m-p95").innerHTML = `${sim.p95 ? fmt(sim.p95) : "—"}<small>ms</small>`;
  $("#m-p95").classList.toggle("warning", sim.p95 > 2000);
  $("#m-backlog").innerHTML = `${fmt(sim.backlog)}<small>req</small>`;
  $("#m-age").textContent = `Más antigua: ${fmt(sim.oldestAge, 1)} s`;
  $("#m-rejected").innerHTML =
    `${fmt(sim.totals.rejected)} <small>/</small> ${fmt(sim.totals.dropped)}`;
  $("#m-rejected").classList.toggle(
    "warning",
    !!(sim.totals.rejected + sim.totals.dropped),
  );
  $("#m-throttled").textContent =
    `${fmt(sim.totals.throttled)} frenadas por backpressure`;
  const wholeSeconds = Math.floor(sim.time + 1e-7),
    minutes = Math.floor(wholeSeconds / 60),
    seconds = wholeSeconds % 60;
  $("#clock").textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  $("#burst").classList.toggle("active", sim.bursting);
  for (const n of design.nodes) {
    const el = document.querySelector<HTMLElement>(`[data-node="${n.id}"]`);
    if (!el) continue;
    const s = sim.states.get(n.id)!;
    const status = nodeStatus(n);
    el.classList.toggle("under-pressure", status.tone === "pressure");
    el.classList.toggle("is-offline", !n.config.online);
    el.querySelector('[data-stat="rate"]')!.textContent = fmt(s.rate);
    el.querySelector('[data-stat="waiting"]')!.textContent = fmt(
      s.ready.length,
    );
    el.querySelector<HTMLElement>(".node-track i")!.style.width =
      `${status.load * 100}%`;
    el.querySelector(".node-status")!.className = `node-status ${status.tone}`;
    el.querySelector(".node-status span")!.textContent = status.label;
    el.querySelector('[data-stat="detail"]')!.textContent =
      n.kind === "queue"
        ? `${s.unacked.size}/${n.config.adaptive ? s.credits : n.config.prefetch} en vuelo`
        : n.kind === "db"
          ? `${s.writes} writes`
          : `${s.active.length} activas`;
  }
  const n = design.nodes.find((node) => node.id === selected),
    selectedMetrics = document.querySelector("#selected-metrics");
  if (n && selectedMetrics) {
    const s = sim.states.get(n.id)!;
    selectedMetrics.innerHTML =
      n.kind === "db"
        ? `<span><b>${s.reads}</b> reads</span><span><b>${s.writes}</b> writes</span><span><b>${s.active.length}</b> activas</span>`
        : n.kind === "cache"
          ? `<span><b>${s.hits}</b> hits</span><span><b>${s.misses}</b> misses</span><span><b>${s.ready.length}</b> en espera</span>`
          : `<span><b>${s.received}</b> recibidas</span><span><b>${s.ready.length}</b> en espera</span><span><b>${n.kind === "queue" ? s.unacked.size : s.active.length}</b> en vuelo</span>`;
  }
  $("#events").innerHTML = sim.logs
    .slice(0, 7)
    .map(
      (l) =>
        `<div class="event ${l.tone}"><time>${fmt(l.time, 1)}s</time><i></i><span>${escape(l.message)}</span></div>`,
    )
    .join("");
  if (sim.samples.length && sample.time !== goalSample) {
    goalSample = sample.time;
    const threshold =
      scenarioId === "pressure" ? 150 : scenarioId === "reads" ? 250 : 210;
    if (scenarioId !== "free") {
      const reached =
        sample.completed >= threshold &&
        sample.p95 < (scenarioId === "balance" ? 1000 : 2000) &&
        sim.totals.dropped === 0;
      goalStreak = reached ? goalStreak + 1 : 0;
      if (goalStreak >= 5 && !goalWon) {
        goalWon = true;
        sim.log(
          "good",
          "¡Misión conseguida! Ahora prueba una ráfaga y observa qué cambia.",
        );
        toast(
          "¡Misión conseguida! Tu arquitectura sostuvo el objetivo durante 5 s.",
        );
      }
    }
  }
  $("#goal-progress").textContent =
    scenarioId === "free"
      ? "Explora"
      : goalWon
        ? "¡Conseguido!"
        : `${Math.min(5, goalStreak)} / 5 s`;
  $("#goal span").style.width = `${goalWon ? 100 : goalStreak * 20}%`;
  $("#goal").classList.toggle("won", goalWon);
  drawChart();
}
function drawChart(): void {
  const canvas = $<HTMLCanvasElement>("#chart"),
    bounds = canvas.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  if (
    canvas.width !== Math.round(bounds.width * dpr) ||
    canvas.height !== Math.round(bounds.height * dpr)
  ) {
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = bounds.width,
    h = bounds.height;
  ctx.clearRect(0, 0, w, h);
  const samples = sim.samples.slice(-90);
  const max = Math.max(200, ...samples.map((s) => s.demand)) * 1.12;
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  for (let i = 0; i < 4; i++) {
    const y = 12 + (i * (h - 32)) / 3;
    ctx.strokeStyle = "#26303d";
    ctx.beginPath();
    ctx.moveTo(38, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
    ctx.fillStyle = "#69778b";
    ctx.fillText(fmt(max * (1 - i / 3)), 31, y + 3);
  }
  if (!samples.length) {
    ctx.fillStyle = "#65748b";
    ctx.textAlign = "center";
    ctx.fillText("Inicia la simulación para ver el tráfico", w / 2, h / 2);
    return;
  }
  for (const [key, color] of [
    ["demand", "#8796ad"],
    ["admitted", "#a28afa"],
    ["completed", "#5ce7bd"],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = key === "completed" ? 2.4 : 1.6;
    ctx.setLineDash(key === "demand" ? [4, 4] : []);
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = 40 + (i * (w - 54)) / Math.max(30, samples.length - 1),
        y = 12 + (1 - s[key] / max) * (h - 32);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
}
function drawParticles(): void {
  const group = document.querySelector("#particles");
  if (!group) return;
  group.innerHTML = sim.transfers
    .slice(-65)
    .map((p) => {
      const path = document.getElementById(
        `edge-${p.edge}`,
      ) as SVGPathElement | null;
      if (!path) return "";
      const progress = Math.min(1, (sim.time - p.at) / 0.8),
        point = path.getPointAtLength(path.getTotalLength() * progress);
      return `<circle cx="${point.x}" cy="${point.y}" r="3.4" fill="${p.kind === "read" ? "#65e9c5" : "#ba9cff"}" opacity="${1 - progress * 0.35}"/>`;
    })
    .join("");
}
function modal(title: string, content: string): void {
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button id="modal-close" class="icon-button" aria-label="Cerrar">${icon("close")}</button><span class="eyebrow">FLOWLAB / GUÍA</span><h2 id="modal-title">${title}</h2>${content}<button id="modal-done" class="play-button">Entendido ${icon("arrow")}</button></section></div>`;
  const close = () => {
    $("#modal-root").innerHTML = "";
  };
  $("#modal-close").addEventListener("click", close);
  $("#modal-done").addEventListener("click", close);
  $("#modal-root .modal-backdrop").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) close();
  });
  $("#modal-close").focus();
}
function help(): void {
  modal(
    "Aprende rompiendo cosas.",
    `<p>Empieza con <b>Domar la cola</b>. Inicia el reloj, deja que la cola crezca y cambia una sola variable a la vez.</p><ol><li><b>Selecciona un componente.</b> Ajusta capacidad, concurrencia o réplicas en el inspector.</li><li><b>Observa el efecto.</b> Compara demanda y throughput; revisa la latencia p95 y la edad de las solicitudes.</li><li><b>Provoca una ráfaga.</b> ¿La cola absorbe el pico? ¿Se recupera o sigue creciendo?</li><li><b>Construye otra arquitectura.</b> Añade componentes; haz clic en un puerto de salida y después en uno de entrada.</li></ol><div class="modal-callout">Verde = lectura · violeta = escritura · ámbar = backpressure. Los puntos son una muestra visual, no una cuenta exacta de requests.</div><p>Arrastra componentes o el fondo. Usa <b>Espacio</b> para iniciar/pausar cuando el lienzo tenga el foco; <b>Delete</b> elimina la conexión seleccionada.</p>`,
  );
}
function assumptions(): void {
  modal(
    "Un modelo para razonar.",
    `<p>Las cifras son parámetros de tu experimento, <b>no mediciones reales de AWS, Redis o PostgreSQL</b>.</p><ul><li>Motor determinista, pasos de 10 ms. La latencia mínima efectiva por etapa de proceso es 10 ms.</li><li>Cada request sigue una ruta; un hit de cache termina una lectura. Los writes siempre pasan al siguiente componente.</li><li>Un ALB distribuye trabajo; no añade capacidad a los destinos. “Least loaded” aproxima la carga con requests activas + esperando.</li><li>El prefetch limita trabajo en vuelo de cada nodo de cola; se libera al finalizar la solicitud. No replica todas las semánticas de un broker real.</li><li>Las réplicas de lectura añaden capacidad lineal idealizada. No se simulan replication lag, claves, locks, transacciones, costes ni fallos de red.</li><li>Lecturas y escrituras usan presupuestos independientes; la concurrencia limita las operaciones activas.</li><li>Los fallos simulados pausan un componente y preservan sus buffers. No simulan caídas de proceso ni pérdida de disco.</li><li>El p95 usa una muestra de hasta 4,000 solicitudes completadas en los últimos 15 s; combínalo con la edad del trabajo pendiente. Puede parecer bajo mientras otras solicitudes siguen atascadas.</li><li>Límite de seguridad: 15,000 solicitudes en vuelo; se frena nueva generación al alcanzarlo.</li><li>El tamaño de los mensajes, los recursos y la duración de operación son constantes. No es un capacity planner de producción.</li></ul><p>Referencias: <a href="https://www.rabbitmq.com/docs/flow-control" target="_blank" rel="noopener">RabbitMQ flow control</a> · <a href="https://www.rabbitmq.com/docs/confirms" target="_blank" rel="noopener">Prefetch y ACKs</a> · <a href="https://datatracker.ietf.org/doc/rfc3290/" target="_blank" rel="noopener">Token / leaky bucket</a> · <a href="https://github.com/Netflix/concurrency-limits" target="_blank" rel="noopener">Concurrencia adaptativa</a></p>`,
  );
}

function parseDesign(raw: unknown): Design {
  if (!raw || typeof raw !== "object") throw new Error("Archivo inválido.");
  const data = raw as Record<string, unknown>;
  if (
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges) ||
    data.nodes.length > 30 ||
    data.edges.length > 60
  )
    throw new Error(
      "Se esperaba una arquitectura de hasta 30 componentes y 60 conexiones.",
    );
  const allowed: NodeKind[] = [
    "source",
    "lb",
    "service",
    "queue",
    "cache",
    "db",
    "sink",
  ];
  const nodes: FlowNode[] = data.nodes.map((item: Record<string, unknown>) => {
    if (
      !item ||
      !allowed.includes(item.kind as NodeKind) ||
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)
    )
      throw new Error("Componente no reconocido.");
    const cfg = { ...DEFAULTS };
    const incoming = item.config as Record<string, unknown> | undefined;
    if (incoming)
      for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        const value = incoming[key];
        if (
          typeof DEFAULTS[key] === "number" &&
          typeof value === "number" &&
          Number.isFinite(value)
        )
          (cfg as unknown as Record<string, unknown>)[key] = Math.max(
            0,
            Math.min(10000, value),
          );
        if (typeof DEFAULTS[key] === "boolean" && typeof value === "boolean")
          (cfg as unknown as Record<string, unknown>)[key] = value;
      }
    if (
      incoming &&
      ["wait", "reject", "drop-oldest"].includes(String(incoming.overflow))
    )
      cfg.overflow = incoming.overflow as Settings["overflow"];
    if (
      incoming &&
      ["none", "token", "leaky"].includes(String(incoming.shaper))
    )
      cfg.shaper = incoming.shaper as Settings["shaper"];
    if (
      incoming &&
      ["round-robin", "least-loaded"].includes(String(incoming.algorithm))
    )
      cfg.algorithm = incoming.algorithm as Settings["algorithm"];
    for (const key of [
      "replicas",
      "concurrency",
      "capacity",
      "prefetch",
      "buffer",
      "burst",
    ] as const)
      cfg[key] = Math.max(1, Math.round(cfg[key]));
    cfg.rps = Math.min(2000, cfg.rps);
    cfg.readPercent = Math.min(100, cfg.readPercent);
    cfg.hitRate = Math.min(100, cfg.hitRate);
    cfg.highWater = Math.max(50, Math.min(100, cfg.highWater));
    cfg.lowWater = Math.max(5, Math.min(45, cfg.lowWater));
    return createNode(
      item.kind as NodeKind,
      item.id,
      Math.max(0, Math.min(3500, Number(item.x) || 0)),
      Math.max(0, Math.min(2000, Number(item.y) || 0)),
      String(item.label ?? item.kind).slice(0, 40),
      cfg,
    );
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new Error("Hay IDs duplicados.");
  const edges = data.edges.map((item: Record<string, unknown>, i: number) => {
    if (
      !item ||
      typeof item.from !== "string" ||
      typeof item.to !== "string" ||
      !ids.has(item.from) ||
      !ids.has(item.to)
    )
      throw new Error("Conexión inválida.");
    return { id: `imported-${i}`, from: item.from, to: item.to };
  });
  const result = {
    name: String(data.name ?? "Mi arquitectura").slice(0, 60),
    nodes,
    edges,
  };
  const errors = validateDesign(result).filter(
    (e) => !e.includes("falta conectar") && !e.includes("generador"),
  );
  if (errors.length) throw new Error(errors[0]);
  return result;
}

$("#play").addEventListener("click", () => setRunning(!running));
$("#reset").addEventListener("click", () => {
  setRunning(false);
  reset();
});
$("#step").addEventListener("click", () => {
  if (validateDesign(design).length) {
    toast(validateDesign(design)[0]);
    return;
  }
  sim.run(1);
  renderStats();
  drawParticles();
});
$("#speed").addEventListener("change", (e) => {
  speed = Number((e.target as HTMLSelectElement).value);
});
$("#scenario").addEventListener("change", (e) =>
  loadScenario((e.target as HTMLSelectElement).value),
);
$("#burst").addEventListener("click", () => {
  sim.burst();
  if (!running) setRunning(true);
});
$("#hint").addEventListener("click", () =>
  modal(
    "Una pista, no la solución.",
    `<p>${scenario().hint}</p><div class="modal-callout">Cambia una variable. Observa. Formula una hipótesis. Repite.</div>`,
  ),
);
$("#help").addEventListener("click", help);
$("#assumptions").addEventListener("click", assumptions);
$("#fit").addEventListener("click", fit);
$("#zoom-in").addEventListener("click", () => {
  scale = Math.min(1.8, scale + 0.1);
  updateTransform();
});
$("#zoom-out").addEventListener("click", () => {
  scale = Math.max(0.3, scale - 0.1);
  updateTransform();
});
document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((button) =>
  button.addEventListener("click", () => {
    if (design.nodes.length >= 30) {
      toast("Máximo 30 componentes en este laboratorio.");
      return;
    }
    const kind = button.dataset.add as NodeKind,
      id = `${kind}-${Date.now().toString(36)}`;
    const board = $("#board").getBoundingClientRect();
    const n = createNode(
      kind,
      id,
      Math.max(0, (board.width / 2 - pan.x) / scale - 105),
      Math.max(0, (board.height / 2 - pan.y) / scale - 75),
    );
    design.nodes.push(n);
    selected = id;
    selectedEdge = null;
    scenarioId = "free";
    topologyChanged();
  }),
);
$("#export").addEventListener("click", () => {
  const blob = new Blob(
    [JSON.stringify({ ...design, version: 1, scenarioId }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mi-arquitectura.flowlab.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Arquitectura exportada. Puedes volver a importarla.");
});
$("#import").addEventListener("click", () =>
  $<HTMLInputElement>("#import-file").click(),
);
$("#import-file").addEventListener("change", async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1000000)
      throw new Error("El archivo debe pesar menos de 1 MB.");
    design = parseDesign(JSON.parse(await file.text()));
    scenarioId = "free";
    selected = design.nodes[0]?.id ?? null;
    selectedEdge = null;
    topologyChanged();
    fit();
    toast("Arquitectura importada.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "No se pudo importar.");
  }
  input.value = "";
});

let drag: {
  id: string | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
} | null = null;
$("#board").addEventListener("pointerdown", (event) => {
  const e = event as PointerEvent,
    target = e.target as Element;
  if (target.closest(".port") || target.closest(".edge")) return;
  const el = target.closest<HTMLElement>("[data-node]");
  const n = design.nodes.find((node) => node.id === el?.dataset.node);
  if (n) {
    selected = n.id;
    selectedEdge = null;
    document
      .querySelectorAll(".flow-node")
      .forEach((node) =>
        node.classList.toggle(
          "selected",
          (node as HTMLElement).dataset.node === selected,
        ),
      );
    renderInspector();
    renderStats();
  }
  drag = {
    id: n?.id ?? null,
    startX: e.clientX,
    startY: e.clientY,
    x: n?.x ?? pan.x,
    y: n?.y ?? pan.y,
    moved: false,
  };
  $("#board").classList.add("dragging");
  $("#board").setPointerCapture(e.pointerId);
});
$("#board").addEventListener("pointermove", (event) => {
  if (!drag) return;
  const e = event as PointerEvent,
    dx = e.clientX - drag.startX,
    dy = e.clientY - drag.startY;
  drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
  if (drag.id) {
    const n = design.nodes.find((node) => node.id === drag!.id)!;
    n.x = Math.max(0, Math.min(3500, drag.x + dx / scale));
    n.y = Math.max(0, Math.min(2000, drag.y + dy / scale));
    const el = $(`[data-node="${n.id}"]`);
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    renderEdges();
  } else {
    pan = { x: drag.x + dx, y: drag.y + dy };
    updateTransform();
  }
});
const endDrag = () => {
  if (drag?.id) save();
  drag = null;
  $("#board").classList.remove("dragging");
};
$("#board").addEventListener("pointerup", endDrag);
$("#board").addEventListener("pointercancel", endDrag);
$("#board").addEventListener("click", (event) => {
  const target = event.target as Element;
  const out = target.closest<HTMLElement>("[data-out]"),
    input = target.closest<HTMLElement>("[data-in]"),
    edge = target.closest<HTMLElement>("[data-edge]");
  if (out) {
    connecting = out.dataset.out!;
    $("#connect-hint").hidden = false;
    $("#connect-hint").textContent =
      "Ahora elige un puerto de entrada · Esc para cancelar";
    return;
  }
  if (input && connecting) {
    const to = input.dataset.in!,
      from = connecting;
    connecting = null;
    $("#connect-hint").hidden = true;
    if (
      from === to ||
      design.edges.some((e) => e.from === from && e.to === to)
    ) {
      toast("Elige otro componente.");
      return;
    }
    const candidate = {
      ...design,
      edges: [
        ...design.edges,
        { id: `edge-${Date.now().toString(36)}`, from, to },
      ],
    };
    const errors = validateDesign(candidate).filter(
      (e) => !e.includes("falta conectar"),
    );
    if (errors.length) {
      toast(errors[0]);
      return;
    }
    design = candidate;
    topologyChanged();
    return;
  }
  if (edge) {
    selectedEdge = edge.dataset.edge!;
    selected = null;
    renderNodes();
    renderEdges();
    renderInspector();
  }
});
$("#board").addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = $("#board").getBoundingClientRect(),
        x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      const old = scale;
      scale = Math.max(
        0.3,
        Math.min(1.8, scale * Math.exp(-event.deltaY * 0.005)),
      );
      pan = {
        x: x - ((x - pan.x) * scale) / old,
        y: y - ((y - pan.y) * scale) / old,
      };
    } else {
      pan.x -= event.deltaX;
      pan.y -= event.deltaY;
    }
    updateTransform();
  },
  { passive: false },
);
document.addEventListener("keydown", (event) => {
  if ((event.target as HTMLElement).matches("input,select,textarea")) return;
  if (event.key === "Escape") {
    connecting = null;
    $("#connect-hint").hidden = true;
    $("#modal-root").innerHTML = "";
  }
  if (event.code === "Space" && $("#board").contains(event.target as Node)) {
    event.preventDefault();
    setRunning(!running);
  }
  if ((event.key === "Delete" || event.key === "Backspace") && selectedEdge) {
    design.edges = design.edges.filter((e) => e.id !== selectedEdge);
    selectedEdge = null;
    topologyChanged();
  }
  if (event.key === "Enter") {
    const n = (event.target as Element).closest<HTMLElement>("[data-node]");
    if (n) {
      selected = n.dataset.node!;
      selectedEdge = null;
      renderNodes();
      renderInspector();
      renderStats();
    }
  }
});
new ResizeObserver(() => drawChart()).observe($("#chart"));
function frame(now: number): void {
  if (!lastFrame) lastFrame = now;
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running) {
    accumulator += elapsed * speed;
    let count = 0;
    while (accumulator >= 0.01 && count++ < 70) {
      sim.step(0.01);
      accumulator -= 0.01;
    }
  }
  if (now - lastRender > 180) {
    renderStats();
    lastRender = now;
  }
  if (running) drawParticles();
  requestAnimationFrame(frame);
}
renderAll();
requestAnimationFrame(() => {
  fit();
  requestAnimationFrame(frame);
});
// Read-only diagnostics for deterministic QA and inspecting the educational model.
Object.defineProperty(window, "flowLab", {
  value: {
    get simulation() {
      return sim;
    },
    get design() {
      return cloneDesign(design);
    },
    get running() {
      return running;
    },
  },
});
