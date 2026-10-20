import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation} from '../src/simulation.ts';
import {SCENARIOS} from '../src/presets.ts';
import {DESIGN_STORAGE, parseDesign, restoreDesign, serializeDesign} from '../src/persistence.ts';
import type {BrowserStorage} from '../src/persistence.ts';
import {DesignError} from '../src/messages.ts';
import {Playground} from '../src/playground.ts';

// Captured from the unchanged POC at e7d1a8d, before this refactor.
void test('all three missions preserve the original deterministic POC outcomes', () => {
  const expected: unknown = JSON.parse(
    readFileSync(new URL('./fixtures/poc-outcomes.json', import.meta.url), 'utf8'),
  );
  const actual = SCENARIOS.slice(0, 3).map((scenario) => {
    const simulation = new Simulation(scenario.design);
    simulation.run(15);
    return {
      id: scenario.id,
      totals: simulation.totals,
      p95: simulation.p95,
      backlog: simulation.backlog,
      oldestAge: simulation.oldestAge,
      latest: simulation.latest,
      nodes: [...simulation.states].map(([id, state]) => ({
        id,
        ready: state.ready.length,
        active: state.active.length,
        unacked: state.unacked.size,
        received: state.received,
        sent: state.sent,
        reads: state.reads,
        writes: state.writes,
      })),
    };
  });
  assert.deepEqual(actual, expected);
});
void test('POC v1 saves restore their settings and custom names', () => {
  const design = structuredClone(SCENARIOS[0].design);
  design.nodes[0].label = 'Mis clientes <&>';
  design.nodes[0].config.rps = 420;
  const saved = serializeDesign(design, 'pressure');
  const storage: BrowserStorage = {
    getItem: (key) => (key === DESIGN_STORAGE ? saved : null),
    setItem: () => undefined,
  };
  const restored = restoreDesign(storage);
  assert.ok(restored);
  assert.equal(restored.scenarioId, 'pressure');
  assert.deepEqual(restored.design.nodes, design.nodes);
  assert.deepEqual(
    restored.design.edges.map(({from, to}) => ({from, to})),
    design.edges.map(({from, to}) => ({from, to})),
  );
});
void test('unfinished free canvas designs can be exported and imported', () => {
  const original = SCENARIOS[3].design;
  const raw: unknown = JSON.parse(serializeDesign(original, 'free'));
  assert.deepEqual(parseDesign(raw), original);
});
void test('corrupted or inaccessible local storage does not prevent startup', () => {
  assert.equal(restoreDesign({getItem: () => '{broken', setItem: () => undefined}), null);
  assert.equal(
    restoreDesign({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    }),
    null,
  );
});
void test('untrusted imports reject malformed nodes and cycles with structured errors', () => {
  for (const nodes of [[null], [4], [{id: '<script>', kind: 'source'}]]) {
    assert.throws(() => parseDesign({nodes, edges: []}), DesignError);
  }
  const design = structuredClone(SCENARIOS[0].design);
  design.edges = design.edges.filter((edge) => edge.from !== 'worker');
  design.edges.push({id: 'cycle', from: 'worker', to: 'api'});
  assert.throws(
    () => parseDesign(design),
    (error: unknown) => error instanceof DesignError && error.notice.code === 'cycle',
  );
});
void test('live capacity changes preserve the clock and simulation instance', () => {
  const store = new Playground(SCENARIOS[0].design);
  store.step();
  const simulation = store.simulation;
  const time = simulation.time;
  store.updateSetting('worker', 'replicas', 4);
  assert.equal(store.simulation, simulation);
  assert.equal(store.simulation.time, time);
  assert.equal(
    store.simulation.design.nodes.find((node) => node.id === 'worker')?.config.replicas,
    4,
  );
  store.renameNode('worker', 'My worker');
  assert.equal(
    store.simulation.design.nodes.find((node) => node.id === 'worker')?.label,
    'My worker',
  );
});
void test('topology changes reset the clock but keep custom configuration', () => {
  const store = new Playground(SCENARIOS[0].design);
  store.updateSetting('worker', 'replicas', 4);
  store.step();
  store.addNode('sink', 'Response', 100, 200);
  assert.equal(store.simulation.time, 0);
  assert.equal(store.running, false);
  assert.equal(store.scenarioId, 'free');
  assert.equal(store.design.nodes.find((node) => node.id === 'worker')?.config.replicas, 4);
});
void test('pause, failure, recovery, and reset preserve their POC contracts', () => {
  const store = new Playground(SCENARIOS[0].design);
  store.setRunning(true);
  store.tick(1000);
  store.tick(1100);
  assert.ok(store.simulation.time > 0);
  store.setRunning(false);
  const time = store.simulation.time;
  store.tick(5000);
  assert.equal(store.simulation.time, time);
  store.toggleOnline('worker');
  assert.equal(
    store.simulation.design.nodes.find((node) => node.id === 'worker')?.config.online,
    false,
  );
  store.toggleOnline('worker');
  assert.equal(
    store.simulation.design.nodes.find((node) => node.id === 'worker')?.config.online,
    true,
  );
  store.reset();
  assert.equal(store.simulation.time, 0);
  assert.equal(store.running, false);
});
