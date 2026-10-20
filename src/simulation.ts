export type NodeKind =
  | "source"
  | "lb"
  | "service"
  | "queue"
  | "cache"
  | "db"
  | "sink";
export type RequestKind = "read" | "write";
export type Overflow = "wait" | "reject" | "drop-oldest";
export interface Settings {
  rps: number;
  readPercent: number;
  respectBackpressure: boolean;
  replicas: number;
  concurrency: number;
  latencyMs: number;
  buffer: number;
  capacity: number;
  prefetch: number;
  overflow: Overflow;
  highWater: number;
  lowWater: number;
  shaper: "none" | "token" | "leaky";
  rate: number;
  burst: number;
  adaptive: boolean;
  algorithm: "round-robin" | "least-loaded";
  maxRps: number;
  hitRate: number;
  readRps: number;
  writeRps: number;
  readReplicas: number;
  replicaReads: boolean;
  online: boolean;
}
export interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  config: Settings;
}
export interface Edge {
  id: string;
  from: string;
  to: string;
}
export interface Design {
  name: string;
  nodes: FlowNode[];
  edges: Edge[];
}
export interface Request {
  id: number;
  kind: RequestKind;
  born: number;
  owners: string[];
  admitted: boolean;
  committed: boolean;
  path: string[];
}
interface Task {
  request: Request;
  remaining: number;
  resolved: boolean;
  cacheHit: boolean;
}
export interface NodeState {
  ready: Request[];
  active: Task[];
  unacked: Set<number>;
  received: number;
  sent: number;
  rejected: number;
  dropped: number;
  completed: number;
  blocked: boolean;
  pressure: boolean;
  hits: number;
  misses: number;
  reads: number;
  writes: number;
  tokens: number;
  readTokens: number;
  writeTokens: number;
  rr: number;
  credits: number;
  feedbackBlocked: boolean;
  feedbackAt: number;
  rate: number;
  lastSent: number;
}
export interface Sample {
  time: number;
  demand: number;
  admitted: number;
  completed: number;
  rejected: number;
  throttled: number;
  backlog: number;
  p95: number;
}
export interface LogEntry {
  time: number;
  tone: "info" | "warn" | "error" | "good";
  message: string;
}
export interface Transfer {
  edge: string;
  at: number;
  kind: RequestKind;
}
export const DEFAULTS: Settings = {
  rps: 160,
  readPercent: 65,
  respectBackpressure: true,
  replicas: 1,
  concurrency: 6,
  latencyMs: 80,
  buffer: 80,
  capacity: 160,
  prefetch: 12,
  overflow: "wait",
  highWater: 80,
  lowWater: 40,
  shaper: "none",
  rate: 100,
  burst: 50,
  adaptive: false,
  algorithm: "round-robin",
  maxRps: 2000,
  hitRate: 80,
  readRps: 200,
  writeRps: 80,
  readReplicas: 0,
  replicaReads: true,
  online: true,
};
export function createNode(
  kind: NodeKind,
  id: string,
  x: number,
  y: number,
  label?: string,
  config: Partial<Settings> = {},
): FlowNode {
  const names: Record<NodeKind, string> = {
    source: "Clientes",
    lb: "Application LB",
    service: "API / Worker",
    queue: "Message Queue",
    cache: "Redis Cache",
    db: "Relational DB",
    sink: "Respuesta",
  };
  return {
    id,
    kind,
    x,
    y,
    label: label ?? names[kind],
    config: {
      ...DEFAULTS,
      ...(kind === "lb"
        ? { latencyMs: 0, buffer: 40, overflow: "wait" as Overflow }
        : {}),
      ...(kind === "cache" ? { latencyMs: 10, concurrency: 100 } : {}),
      ...(kind === "db" ? { latencyMs: 20, concurrency: 40, buffer: 100 } : {}),
      ...(kind === "sink" ? { latencyMs: 10, concurrency: 100 } : {}),
      ...config,
    },
  };
}
export function cloneDesign(design: Design): Design {
  return JSON.parse(JSON.stringify(design)) as Design;
}
export function validateDesign(design: Design): string[] {
  const problems: string[] = [];
  const ids = new Set(design.nodes.map((n) => n.id));
  if (!design.nodes.some((n) => n.kind === "source"))
    problems.push("Añade al menos un generador de tráfico.");
  if (ids.size !== design.nodes.length)
    problems.push("Los identificadores de componentes deben ser únicos.");
  if (design.nodes.length > 30 || design.edges.length > 60)
    problems.push(
      "El laboratorio admite hasta 30 componentes y 60 conexiones.",
    );
  for (const n of design.nodes) {
    const outgoing = design.edges.filter((e) => e.from === n.id);
    if (n.kind !== "db" && n.kind !== "sink" && !outgoing.length)
      problems.push(`${n.label}: falta conectar su salida.`);
    if (n.kind !== "lb" && outgoing.length > 1)
      problems.push(`${n.label}: usa un ALB para repartir a varias salidas.`);
    if (n.kind === "source" && design.edges.some((e) => e.to === n.id))
      problems.push("Un generador solo tiene salida.");
  }
  for (const e of design.edges)
    if (!ids.has(e.from) || !ids.has(e.to))
      problems.push("Una conexión apunta a un componente inexistente.");
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (design.edges.filter((e) => e.from === id).some((e) => visit(e.to)))
      return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (design.nodes.some((n) => visit(n.id)))
    problems.push(
      "El flujo debe ir hacia delante: elimina el ciclo entre componentes.",
    );
  return [...new Set(problems)];
}
export class Simulation {
  design: Design;
  time = 0;
  states = new Map<string, NodeState>();
  pending = new Map<number, Request>();
  logs: LogEntry[] = [];
  transfers: Transfer[] = [];
  edgeCounts = new Map<string, number>();
  samples: Sample[] = [];
  totals = {
    demand: 0,
    admitted: 0,
    completed: 0,
    rejected: 0,
    dropped: 0,
    throttled: 0,
    reads: 0,
    writes: 0,
    committedWrites: 0,
  };
  private seed = 731;
  private nextId = 1;
  private sourceFractions = new Map<string, number>();
  private latencies: { time: number; value: number }[] = [];
  private nextSample = 1;
  private previous = {
    demand: 0,
    admitted: 0,
    completed: 0,
    rejected: 0,
    throttled: 0,
  };
  private burstUntil = 0;
  private burstMultiplier = 1;
  constructor(design: Design) {
    this.design = cloneDesign(design);
    for (const n of this.design.nodes)
      this.states.set(n.id, {
        ready: [],
        active: [],
        unacked: new Set(),
        received: 0,
        sent: 0,
        rejected: 0,
        dropped: 0,
        completed: 0,
        blocked: false,
        pressure: false,
        hits: 0,
        misses: 0,
        reads: 0,
        writes: 0,
        tokens:
          n.kind === "queue" && n.config.shaper === "token"
            ? n.config.burst
            : 0,
        readTokens: 0,
        writeTokens: 0,
        rr: 0,
        credits: Math.min(4, n.config.prefetch),
        feedbackBlocked: false,
        feedbackAt: 0,
        rate: 0,
        lastSent: 0,
      });
    this.log(
      "info",
      "Laboratorio listo. Cada punto representa una muestra del tráfico.",
    );
  }
  random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  update(id: string, patch: Partial<Settings>): void {
    const node = this.design.nodes.find((n) => n.id === id);
    if (!node) return;
    Object.assign(node.config, patch);
    const state = this.states.get(id)!;
    if (patch.prefetch !== undefined)
      state.credits = Math.min(state.credits, patch.prefetch);
    this.log("info", `${node.label}: configuración actualizada en vivo.`);
  }
  burst(multiplier = 3, seconds = 5): void {
    this.burstUntil = this.time + seconds;
    this.burstMultiplier = multiplier;
    this.log("warn", `Ráfaga ×${multiplier} durante ${seconds} s simulados.`);
  }
  get bursting(): boolean {
    return this.time < this.burstUntil;
  }
  log(tone: LogEntry["tone"], message: string): void {
    this.logs.unshift({ time: this.time, tone, message });
    if (this.logs.length > 60) this.logs.length = 60;
  }
  private finish(
    req: Request,
    outcome: "completed" | "rejected" | "dropped",
    node?: FlowNode,
  ): void {
    if (!this.pending.has(req.id)) return;
    this.pending.delete(req.id);
    for (const owner of req.owners)
      this.states.get(owner)?.unacked.delete(req.id);
    this.totals[outcome]++;
    if (outcome === "completed") {
      this.totals[req.kind === "read" ? "reads" : "writes"]++;
      this.latencies.push({
        time: this.time,
        value: (this.time - req.born) * 1000,
      });
      if (this.latencies.length > 4000) this.latencies.splice(0, 1000);
      if (node) this.states.get(node.id)!.completed++;
    } else if (node) {
      this.states.get(node.id)![outcome]++;
    }
  }
  private offer(node: FlowNode, req: Request): boolean {
    const s = this.states.get(node.id)!;
    const c = node.config;
    const limit = node.kind === "queue" ? c.capacity : c.buffer;
    // A waiting buffer and execution slots are separate resources.
    const occupied = s.ready.length;
    if (node.kind === "queue" && c.overflow === "wait" && s.pressure) {
      s.blocked = true;
      return false;
    }
    if (occupied >= limit) {
      if (c.overflow === "reject") {
        this.finish(req, "rejected", node);
        return true;
      }
      if (c.overflow === "drop-oldest" && s.ready.length)
        this.finish(s.ready.shift()!, "dropped", node);
      else {
        s.blocked = true;
        return false;
      }
    }
    s.ready.push(req);
    s.received++;
    req.path.push(node.id);
    if (
      node.kind === "queue" &&
      c.overflow === "wait" &&
      s.ready.length >= (c.capacity * c.highWater) / 100
    )
      s.pressure = true;
    return true;
  }
  private forward(node: FlowNode, req: Request): boolean {
    let edges = this.design.edges.filter((e) => e.from === node.id);
    if (!edges.length) {
      this.states.get(node.id)!.sent++;
      if (node.kind === "db" || node.kind === "sink")
        this.finish(req, "completed", node);
      else this.finish(req, "rejected", node);
      return true;
    }
    const state = this.states.get(node.id)!;
    if (node.kind === "lb") {
      edges = edges.filter(
        (e) => this.design.nodes.find((n) => n.id === e.to)?.config.online,
      );
      if (!edges.length) {
        state.blocked = true;
        return false;
      }
      if (node.config.algorithm === "least-loaded")
        edges.sort((a, b) => {
          const sa = this.states.get(a.to)!;
          const sb = this.states.get(b.to)!;
          return (
            sa.ready.length +
            sa.active.length -
            sb.ready.length -
            sb.active.length
          );
        });
      else {
        const offset = state.rr % edges.length;
        edges = [...edges.slice(offset), ...edges.slice(0, offset)];
      }
    }
    for (const edge of edges) {
      const next = this.design.nodes.find((n) => n.id === edge.to)!;
      if (this.offer(next, req)) {
        state.sent++;
        state.rr++;
        this.edgeCounts.set(edge.id, (this.edgeCounts.get(edge.id) ?? 0) + 1);
        if (this.random() < 0.16 && this.transfers.length < 130)
          this.transfers.push({ edge: edge.id, at: this.time, kind: req.kind });
        return true;
      }
    }
    state.blocked = true;
    state.feedbackBlocked = true;
    return false;
  }
  step(dt = 0.01): void {
    this.time += dt;
    for (const n of this.design.nodes) {
      const s = this.states.get(n.id)!;
      const c = n.config;
      s.blocked = false;
      if (n.kind === "queue") {
        if (s.pressure && s.ready.length <= (c.capacity * c.lowWater) / 100)
          s.pressure = false;
        if (c.shaper === "token")
          s.tokens = Math.min(c.burst, s.tokens + c.rate * dt);
        if (c.shaper === "leaky")
          s.tokens = Math.min(Math.max(1, c.rate * dt), s.tokens + c.rate * dt);
        if (c.adaptive && this.time - s.feedbackAt >= 1) {
          s.credits = s.feedbackBlocked
            ? Math.max(1, Math.floor(s.credits * 0.7))
            : Math.min(c.prefetch, s.credits + 1);
          s.feedbackBlocked = false;
          s.feedbackAt = this.time;
        }
      }
      if (n.kind === "lb")
        s.tokens = Math.min(c.maxRps, s.tokens + c.maxRps * dt);
      if (n.kind === "db") {
        const readRate =
          c.readRps * (1 + (c.replicaReads ? c.readReplicas : 0));
        s.readTokens = Math.min(
          Math.max(1, readRate * 0.1),
          s.readTokens + readRate * dt,
        );
        s.writeTokens = Math.min(
          Math.max(1, c.writeRps * 0.1),
          s.writeTokens + c.writeRps * dt,
        );
      }
      if (!c.online) {
        s.blocked = s.ready.length + s.active.length > 0;
        continue;
      }
      const stillActive: Task[] = [];
      for (const task of s.active) {
        task.remaining -= dt;
        if (task.remaining > 1e-8) {
          stillActive.push(task);
          continue;
        }
        const req = task.request;
        if (!task.resolved) {
          task.resolved = true;
          if (n.kind === "cache" && req.kind === "read") {
            task.cacheHit = this.random() * 100 < c.hitRate;
            task.cacheHit ? s.hits++ : s.misses++;
          }
          if (n.kind === "db") {
            req.kind === "read" ? s.reads++ : s.writes++;
            if (req.kind === "write" && !req.committed) {
              req.committed = true;
              this.totals.committedWrites++;
            }
          }
        }
        if (task.cacheHit) {
          s.sent++;
          this.finish(req, "completed", n);
        } else if (!this.forward(n, req)) stillActive.push(task);
      }
      s.active = stillActive;
      if (n.kind === "source") continue;
      if (n.kind === "queue") {
        let attempts = 0;
        const credits = c.adaptive ? s.credits : c.prefetch;
        while (
          s.ready.length &&
          s.unacked.size < credits &&
          attempts++ < 1000
        ) {
          if (c.shaper !== "none" && s.tokens < 1 - 1e-8) break;
          const req = s.ready[0];
          s.unacked.add(req.id);
          req.owners.push(n.id);
          if (!this.forward(n, req)) {
            s.unacked.delete(req.id);
            req.owners.pop();
            break;
          }
          s.ready.shift();
          if (c.shaper !== "none") s.tokens = Math.max(0, s.tokens - 1);
        }
        if (s.ready.length && (s.unacked.size >= credits || s.pressure))
          s.blocked = true;
        continue;
      }
      if (n.kind === "lb") {
        let attempts = 0;
        while (s.ready.length && s.tokens >= 1 - 1e-8 && attempts++ < 1000) {
          if (!this.forward(n, s.ready[0])) break;
          s.ready.shift();
          s.tokens = Math.max(0, s.tokens - 1);
        }
        continue;
      }
      const max = n.kind === "db" ? c.concurrency : c.replicas * c.concurrency;
      while (s.active.length < max && s.ready.length) {
        let index = 0;
        if (n.kind === "db") {
          index = s.ready.findIndex(
            (r) =>
              (r.kind === "read" ? s.readTokens : s.writeTokens) >= 1 - 1e-8,
          );
          if (index < 0) {
            s.blocked = true;
            break;
          }
        }
        const req = s.ready.splice(index, 1)[0];
        if (n.kind === "db")
          req.kind === "read"
            ? (s.readTokens = Math.max(0, s.readTokens - 1))
            : (s.writeTokens = Math.max(0, s.writeTokens - 1));
        s.active.push({
          request: req,
          remaining: Math.max(0.01, c.latencyMs / 1000),
          resolved: false,
          cacheHit: false,
        });
      }
    }
    for (const source of this.design.nodes.filter(
      (n) => n.kind === "source" && n.config.online,
    )) {
      const s = this.states.get(source.id)!;
      const factor = this.bursting ? this.burstMultiplier : 1;
      let fraction =
        (this.sourceFractions.get(source.id) ?? 0) +
        source.config.rps * factor * dt;
      let attempts = Math.min(1000, Math.floor(fraction + 1e-8));
      fraction -= attempts;
      this.sourceFractions.set(source.id, fraction);
      while (attempts-- > 0) {
        this.totals.demand++;
        s.received++;
        const req: Request = {
          id: this.nextId++,
          kind:
            this.random() * 100 < source.config.readPercent ? "read" : "write",
          born: this.time,
          owners: [],
          admitted: false,
          committed: false,
          path: [source.id],
        };
        if (this.pending.size >= 15000) {
          this.totals.throttled++;
          s.blocked = true;
          continue;
        }
        this.pending.set(req.id, req);
        if (!this.forward(source, req)) {
          this.pending.delete(req.id);
          source.config.respectBackpressure
            ? this.totals.throttled++
            : this.totals.rejected++;
          s.blocked = true;
        } else if (this.pending.has(req.id)) {
          req.admitted = true;
          this.totals.admitted++;
        }
      }
    }
    this.transfers = this.transfers.filter((t) => this.time - t.at < 0.8);
    if (this.time >= this.nextSample - 1e-8) {
      const sample: Sample = {
        time: this.time,
        demand: 0,
        admitted: 0,
        completed: 0,
        rejected: 0,
        throttled: 0,
        backlog: this.backlog,
        p95: this.p95,
      };
      for (const key of [
        "demand",
        "admitted",
        "completed",
        "rejected",
        "throttled",
      ] as const) {
        sample[key] = this.totals[key] - this.previous[key];
        this.previous[key] = this.totals[key];
      }
      this.samples.push(sample);
      if (this.samples.length > 120) this.samples.shift();
      for (const n of this.design.nodes) {
        const s = this.states.get(n.id)!;
        s.rate = s.sent - s.lastSent;
        s.lastSent = s.sent;
      }
      if (sample.rejected || this.totals.dropped) {
        if (Math.round(this.time) % 5 === 0)
          this.log(
            "error",
            `${sample.rejected} rechazos/s · ${this.totals.dropped} descartes acumulados.`,
          );
      } else if (sample.throttled && Math.round(this.time) % 5 === 0)
        this.log(
          "warn",
          `Backpressure: ${sample.throttled} solicitudes/s esperan en el productor.`,
        );
      this.nextSample += 1;
    }
  }
  run(seconds: number): void {
    const ticks = Math.round(seconds / 0.01);
    for (let i = 0; i < ticks; i++) this.step();
  }
  get backlog(): number {
    return [...this.states.values()].reduce(
      (sum, s) => sum + s.ready.length,
      0,
    );
  }
  get p95(): number {
    const values = this.latencies
      .filter((l) => this.time - l.time <= 15)
      .map((l) => l.value)
      .sort((a, b) => a - b);
    return values.length
      ? values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)]
      : 0;
  }
  get oldestAge(): number {
    let oldest = this.time;
    for (const req of this.pending.values())
      oldest = Math.min(oldest, req.born);
    return this.pending.size ? this.time - oldest : 0;
  }
  get latest(): Sample {
    return (
      this.samples.at(-1) ?? {
        time: 0,
        demand: 0,
        admitted: 0,
        completed: 0,
        rejected: 0,
        throttled: 0,
        backlog: 0,
        p95: 0,
      }
    );
  }
}
