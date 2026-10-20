import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  Simulation,
  createNode,
  validateDesign,
  type Design,
  type Settings,
} from '../src/simulation.ts';
import {SCENARIOS} from '../src/presets.ts';

function pipeline(queue: Partial<Settings> = {}, worker: Partial<Settings> = {}): Design {
  return {
    name: 'test',
    nodes: [
      createNode('source', 'source', 0, 0, 'source', {
        rps: 200,
        readPercent: 50,
      }),
      createNode('queue', 'queue', 250, 0, 'queue', {
        capacity: 40,
        prefetch: 4,
        ...queue,
      }),
      createNode('service', 'worker', 500, 0, 'worker', {
        concurrency: 2,
        latencyMs: 100,
        buffer: 6,
        ...worker,
      }),
      createNode('db', 'db', 750, 0, 'db', {
        readRps: 5000,
        writeRps: 5000,
        concurrency: 100,
        latencyMs: 10,
      }),
    ],
    edges: [
      ['source', 'queue'],
      ['queue', 'worker'],
      ['worker', 'db'],
    ].map(([from, to]) => ({id: `${from}-${to}`, from, to})),
  };
}
function conserved(sim: Simulation): void {
  const t = sim.totals;
  assert.equal(
    t.demand,
    t.completed + t.rejected + t.dropped + t.throttled + sim.pending.size,
    'Every generated request has exactly one disposition',
  );
}
void test('bounded queue propagates pressure without silently losing admitted work', () => {
  const sim = new Simulation(pipeline());
  sim.run(12);
  assert.ok(sim.totals.throttled > 0);
  assert.equal(sim.totals.rejected, 0);
  assert.equal(sim.totals.dropped, 0);
  assert.ok(sim.states.get('queue')!.ready.length <= 40);
  conserved(sim);
});
void test('rejection policy bounds the queue and distinguishes rejected requests', () => {
  const sim = new Simulation(pipeline({overflow: 'reject'}));
  sim.run(8);
  assert.ok(sim.totals.rejected > 500);
  assert.equal(sim.totals.dropped, 0);
  assert.ok(sim.states.get('queue')!.ready.length <= 40);
  conserved(sim);
});
void test('drop-oldest explicitly accounts for discarded accepted requests', () => {
  const sim = new Simulation(pipeline({overflow: 'drop-oldest'}));
  sim.run(8);
  assert.ok(sim.totals.dropped > 500);
  assert.ok(sim.states.get('queue')!.ready.length <= 40);
  conserved(sim);
});
void test('worker replicas increase throughput when the database has headroom', () => {
  const one = new Simulation(pipeline({prefetch: 50}, {replicas: 1, buffer: 100}));
  const three = new Simulation(pipeline({prefetch: 50}, {replicas: 3, buffer: 100}));
  one.run(10);
  three.run(10);
  assert.ok(three.totals.completed > one.totals.completed * 2.6);
  conserved(one);
  conserved(three);
});
void test('a small waiting buffer does not reduce the number of execution slots', () => {
  const sim = new Simulation(
    pipeline({prefetch: 100}, {concurrency: 20, latencyMs: 100, buffer: 2}),
  );
  sim.run(10);
  assert.ok(sim.totals.completed > 1700);
  conserved(sim);
});
void test('prefetch is a bound on unfinished deliveries and all credits are released', () => {
  const sim = new Simulation(pipeline({prefetch: 2}));
  for (let i = 0; i < 800; i++) {
    sim.step();
    assert.ok(sim.states.get('queue')!.unacked.size <= 2);
  }
  sim.update('source', {rps: 0});
  sim.run(20);
  assert.equal(sim.pending.size, 0);
  assert.equal(sim.states.get('queue')!.unacked.size, 0);
  conserved(sim);
});
void test('read replicas add read capacity but do not add write capacity', () => {
  const make = (replicas: number, readPercent: number): Simulation =>
    new Simulation({
      name: 'db',
      nodes: [
        createNode('source', 'source', 0, 0, 'source', {
          rps: 200,
          readPercent,
        }),
        createNode('db', 'db', 300, 0, 'db', {
          readRps: 20,
          writeRps: 20,
          readReplicas: replicas,
          buffer: 200,
          concurrency: 100,
          latencyMs: 10,
        }),
      ],
      edges: [{id: 's-db', from: 'source', to: 'db'}],
    });
  const reads1 = make(0, 100),
    reads4 = make(3, 100),
    writes1 = make(0, 0),
    writes4 = make(3, 0);
  for (const sim of [reads1, reads4, writes1, writes4]) sim.run(10);
  assert.ok(reads4.totals.completed > reads1.totals.completed * 3.8);
  assert.equal(writes1.totals.completed, writes4.totals.completed);
});
void test('token bucket enforces rate plus accumulated burst budget', () => {
  const sim = new Simulation(
    pipeline(
      {capacity: 1000, prefetch: 200, shaper: 'token', rate: 20, burst: 10},
      {concurrency: 50, latencyMs: 10, buffer: 500},
    ),
  );
  sim.run(2);
  const sent = sim.states.get('queue')!.sent;
  assert.ok(sent <= 50);
  assert.ok(sent >= 45);
  conserved(sim);
});
void test('leaky bucket paces output without an initial token burst', () => {
  const sim = new Simulation(
    pipeline(
      {capacity: 1000, prefetch: 100, shaper: 'leaky', rate: 20, burst: 100},
      {concurrency: 50, latencyMs: 10, buffer: 500},
    ),
  );
  sim.run(0.2);
  assert.ok(sim.states.get('queue')!.sent <= 4);
  sim.run(1.8);
  assert.ok(sim.states.get('queue')!.sent <= 40);
  conserved(sim);
});
void test('cache hits terminate reads and writes still reach the database', () => {
  const design: Design = {
    name: 'cache',
    nodes: [
      createNode('source', 's', 0, 0, 's', {rps: 100, readPercent: 100}),
      createNode('cache', 'cache', 250, 0, 'cache', {hitRate: 100}),
      createNode('db', 'db', 500, 0),
    ],
    edges: [
      {id: 'sc', from: 's', to: 'cache'},
      {id: 'cd', from: 'cache', to: 'db'},
    ],
  };
  const sim = new Simulation(design);
  sim.run(3);
  assert.ok(sim.totals.completed > 200);
  assert.equal(sim.states.get('db')!.reads, 0);
  sim.update('s', {readPercent: 0});
  sim.run(3);
  assert.ok(sim.states.get('db')!.writes > 150);
  conserved(sim);
});
void test('ALB skips offline destinations and keeps the remaining destination usable', () => {
  const sim = new Simulation(SCENARIOS[2].design);
  sim.update('slow', {online: false});
  sim.run(5);
  assert.equal(sim.states.get('slow')!.received, 0);
  assert.ok(sim.states.get('fast')!.received > 1000);
  conserved(sim);
});
void test('cycles are rejected and supplied scenarios have valid topologies', () => {
  for (const scenario of SCENARIOS.slice(0, 3))
    assert.deepEqual(validateDesign(scenario.design), []);
  const design = pipeline();
  design.edges.push({id: 'cycle', from: 'db', to: 'queue'});
  assert.ok(validateDesign(design).some((s) => s.code === 'cycle'));
});
void test('identical inputs produce identical simulation results', () => {
  const a = new Simulation(SCENARIOS[0].design),
    b = new Simulation(SCENARIOS[0].design);
  a.run(8);
  b.run(8);
  assert.deepEqual(a.totals, b.totals);
  assert.deepEqual(a.samples, b.samples);
});
