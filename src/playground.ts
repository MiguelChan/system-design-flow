import {Simulation, cloneDesign, createNode, validateDesign} from './simulation.ts';
import type {Design, NodeKind, Settings} from './simulation.ts';
import type {Notice} from './messages.ts';
import type {ScenarioId} from './presets.ts';
import {DESIGN_STORAGE, restoreDesign, serializeDesign} from './persistence.ts';
import type {BrowserStorage} from './persistence.ts';

// React subscribes to a snapshot revision; the deterministic engine remains outside React.
export class Playground {
  design: Design;
  simulation: Simulation;
  scenarioId: ScenarioId;
  selected: string | null;
  selectedEdge: string | null = null;
  connecting: string | null = null;
  running = false;
  speed = 1;
  goalStreak = 0;
  goalWon = false;
  fitRevision = 0;
  toast: Notice | null = null;
  storageAvailable = true;
  private storage: BrowserStorage | undefined;
  private revision = 0;
  private listeners = new Set<() => void>();
  private accumulator = 0;
  private lastFrame = 0;
  private lastRender = 0;
  private goalSample = 0;
  private toastUntil = 0;

  constructor(fallback: Design, storage?: BrowserStorage) {
    this.storage = storage;
    this.storageAvailable = storage !== undefined;
    const saved = restoreDesign(storage);
    this.design = saved?.design ?? cloneDesign(fallback);
    this.scenarioId = saved?.scenarioId ?? 'pressure';
    this.simulation = new Simulation(this.design);
    this.selected = this.defaultSelection();
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): number => this.revision;
  notify(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  private defaultSelection(): string | null {
    return (
      this.design.nodes.find((node) => node.kind === 'queue')?.id ??
      this.design.nodes[0]?.id ??
      null
    );
  }
  save(): void {
    try {
      this.storage?.setItem(DESIGN_STORAGE, serializeDesign(this.design, this.scenarioId));
      this.storageAvailable = this.storage !== undefined;
    } catch {
      this.storageAvailable = false;
    }
  }
  showToast(notice: Notice): void {
    this.toast = notice;
    this.toastUntil = Date.now() + 4000;
    this.notify();
  }
  reset(): void {
    this.running = false;
    this.simulation = new Simulation(this.design);
    this.goalStreak = 0;
    this.goalWon = false;
    this.goalSample = 0;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.notify();
  }
  setRunning(value: boolean): void {
    const issue = value ? validateDesign(this.design)[0] : undefined;
    if (issue) {
      this.showToast(issue);
      return;
    }
    this.running = value;
    this.lastFrame = 0;
    this.notify();
  }
  step(): void {
    if (this.running) return;
    const issue = validateDesign(this.design)[0];
    if (issue) return this.showToast(issue);
    this.simulation.run(1);
    this.checkGoal();
    this.notify();
  }
  burst(): void {
    const issue = validateDesign(this.design)[0];
    if (issue) return this.showToast(issue);
    this.simulation.burst();
    this.setRunning(true);
  }
  tick(now: number): void {
    if (!this.lastFrame) this.lastFrame = now;
    const elapsed = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.running) {
      this.accumulator += elapsed * this.speed;
      let count = 0;
      while (this.accumulator >= 0.01 && count++ < 70) {
        this.simulation.step(0.01);
        this.accumulator -= 0.01;
        this.checkGoal();
      }
    }
    if (this.toast && Date.now() >= this.toastUntil) this.toast = null;
    if (now - this.lastRender > 150) {
      this.lastRender = now;
      this.notify();
    }
  }
  private checkGoal(): void {
    const sample = this.simulation.latest;
    if (
      this.scenarioId === 'free' ||
      !this.simulation.samples.length ||
      sample.time === this.goalSample
    )
      return;
    this.goalSample = sample.time;
    const threshold =
      this.scenarioId === 'pressure' ? 150 : this.scenarioId === 'reads' ? 250 : 210;
    const reached =
      sample.completed >= threshold &&
      sample.p95 < (this.scenarioId === 'balance' ? 1000 : 2000) &&
      this.simulation.totals.dropped === 0;
    this.goalStreak = reached ? this.goalStreak + 1 : 0;
    if (this.goalStreak >= 5 && !this.goalWon) {
      this.goalWon = true;
      this.simulation.log('good', {code: 'missionLog'});
      this.showToast({code: 'missionToast'});
    }
  }
  loadScenario(id: ScenarioId, design: Design): void {
    this.scenarioId = id;
    this.design = cloneDesign(design);
    this.selected = this.defaultSelection();
    this.selectedEdge = null;
    this.connecting = null;
    this.fitRevision++;
    this.reset();
    this.save();
  }
  topologyChanged(): void {
    this.connecting = null;
    this.reset();
    this.save();
    this.showToast({code: 'topologyUpdated'});
  }
  selectNode(id: string): void {
    this.selected = id;
    this.selectedEdge = null;
    this.notify();
  }
  addNode(kind: NodeKind, label: string, x: number, y: number): void {
    if (this.design.nodes.length >= 30) return this.showToast({code: 'maxNodes'});
    const id = `${kind}-${crypto.randomUUID()}`;
    this.design.nodes.push(createNode(kind, id, Math.max(0, x), Math.max(0, y), label));
    this.selected = id;
    this.selectedEdge = null;
    this.scenarioId = 'free';
    this.topologyChanged();
  }
  moveNode(id: string, x: number, y: number): void {
    const node = this.design.nodes.find((node) => node.id === id);
    if (!node) return;
    node.x = Math.max(0, Math.min(3500, x));
    node.y = Math.max(0, Math.min(2000, y));
    this.notify();
  }
  updateSetting<K extends keyof Settings>(id: string, key: K, value: Settings[K]): void {
    const node = this.design.nodes.find((node) => node.id === id);
    if (!node) return;
    node.config[key] = value;
    this.simulation.update(id, {[key]: value});
    this.save();
    this.notify();
  }
  renameNode(id: string, label: string): void {
    const node = this.design.nodes.find((node) => node.id === id);
    const simulated = this.simulation.design.nodes.find((node) => node.id === id);
    if (node) node.label = label;
    if (simulated) simulated.label = label;
    this.save();
    this.notify();
  }
  toggleOnline(id: string): void {
    const node = this.design.nodes.find((node) => node.id === id);
    if (!node) return;
    this.updateSetting(id, 'online', !node.config.online);
    this.simulation.log(node.config.online ? 'good' : 'error', {
      code: node.config.online ? 'onlineLog' : 'offlineLog',
      node: node.label,
    });
    this.notify();
  }
  deleteNode(id: string): void {
    this.design.nodes = this.design.nodes.filter((node) => node.id !== id);
    this.design.edges = this.design.edges.filter((edge) => edge.from !== id && edge.to !== id);
    this.selected = null;
    this.selectedEdge = null;
    this.topologyChanged();
  }
  deleteEdge(): void {
    if (!this.selectedEdge) return;
    this.design.edges = this.design.edges.filter((edge) => edge.id !== this.selectedEdge);
    this.selectedEdge = null;
    this.topologyChanged();
  }
  connect(to: string): void {
    const from = this.connecting;
    this.connecting = null;
    if (!from) return;
    if (from === to || this.design.edges.some((edge) => edge.from === from && edge.to === to))
      return this.showToast({code: 'chooseOther'});
    const candidate: Design = {
      ...this.design,
      edges: [...this.design.edges, {id: `edge-${crypto.randomUUID()}`, from, to}],
    };
    const issue = validateDesign(candidate).find((issue) => issue.code !== 'missingOutput');
    if (issue) return this.showToast(issue);
    this.design = candidate;
    this.topologyChanged();
  }
  importDesign(design: Design): void {
    this.design = design;
    this.scenarioId = 'free';
    this.selected = this.defaultSelection();
    this.selectedEdge = null;
    this.fitRevision++;
    this.topologyChanged();
    this.showToast({code: 'imported'});
  }
}
