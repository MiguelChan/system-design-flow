# FlowLab · System Design Playground

An interactive TypeScript learning game for understanding queues, application load balancers, backpressure, read/write capacity, caches, and replicas. Build a directed architecture, generate requests, change parameters while it runs, and watch the bottleneck move.

The interface is in Spanish, with common infrastructure terms in English. All traffic is simulated locally in the browser. No real infrastructure is provisioned or load-tested.

## Run locally

Requires Node.js 22.19+ or Node.js 24+.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (default `http://127.0.0.1:5173`).

```sh
npm test       # deterministic simulation invariants
npm run build # strict TypeScript check + production build
```

The production output in `dist/` is a static website. Serve it with any static HTTP server. The optional Sites deployment identity lives in `.openai/hosting.json`; it contains no credentials.

## Experiments

1. **Domar la cola:** increase worker capacity, discover the prefetch limit, and keep throughput above 150 requests/s with p95 below two seconds.
2. **Lecturas bajo presión:** use cache hits or read replicas to reduce a read bottleneck. Switch the traffic mix to writes to see what those changes stop helping.
3. **Repartir el trabajo:** compare round robin with least loaded across uneven application instances; take one destination offline and recover it.
4. **Lienzo libre:** add, connect, move, configure, and remove components. Export/import architectures as JSON. Your current architecture is saved to browser local storage.

Click an output port and then an input port to connect nodes. Click a connection to remove it. Drag the background to pan; Ctrl/Command + scroll zooms. Capacity changes apply live. Structural changes reset the simulation to preserve metric accounting.

## Components and controls

- **Traffic generator:** requests/second, read/write mix, and whether upstream refusal is counted as throttling or rejection.
- **Application load balancer:** request capacity, admission buffer, round robin or least loaded, and offline destination exclusion.
- **API / worker:** replicas, concurrent slots per replica, processing time, and a separate bounded waiting buffer.
- **Queue:** capacity, high/low watermarks, maximum unfinished deliveries, wait/reject/drop-oldest overflow policies, token bucket, leaky bucket, and simplified AIMD prefetch control.
- **Cache:** configurable read-hit probability; misses and writes continue downstream.
- **Relational database:** independent read/write budgets, primary-only writes, optional idealized read replicas, latency, connections, and waiting buffer.
- **Response sink:** completes a request without requiring a database.

## Simulation contract

`src/simulation.ts` is independent of the DOM and advances with deterministic 10 ms ticks. Every generated request is accounted for as completed, rejected, discarded, throttled before entry, or currently pending. These dispositions are tested for conservation.

Admission is not completion. A database write is counted as committed when its database processing finishes. Consumer credits are released when the request reaches a terminal outcome. In a consumer that commits to a database before acknowledging, this models the unfinished delivery across the worker and its downstream dependency.

Backpressure propagates through bounded buffers: a finished task retains its execution slot while its destination cannot admit it. Queue watermarks add hysteresis. The source records refused attempts as throttled when it respects the signal; those attempts were not accepted and are not automatically retried as durable jobs.

Token bucket permits accumulated bursts; leaky bucket paces output. Both shape queue dispatch independently of consumer credits. The optional AIMD controller starts with up to four credits, reduces its limit by a factor of 0.7 after downstream blocking, and otherwise increases by one each simulated second up to the configured maximum. This is an educational controller, not a reproduction of TCP or Netflix's implementation.

## Important model limits

- Capacity numbers are user-specified model inputs, **not vendor benchmarks or production sizing advice**.
- Processing times and request sizes are constant. Effective per-stage processing latency is at least one 10 ms tick.
- Read replicas scale read capacity linearly in this simplified model. There is no replication lag, shared read/write I/O contention, SQL query plan, locking, or transaction simulation.
- Least loaded approximates workload using active plus waiting requests; it is not an implementation of a specific AWS ALB routing policy.
- A cache hit is a seeded probability. Keys, TTLs, invalidation, and cache consistency are not modeled.
- Taking a component offline pauses it and preserves its buffers. This does not model process crashes, broker persistence guarantees, retry delivery, failover, or disk loss.
- p95 is calculated from a bounded recent sample of up to 4,000 completed requests within the last 15 simulated seconds. Always compare it with the oldest outstanding request: slow work that has not finished is absent from completed-request percentiles.
- Queue depth counts ready work; unfinished deliveries and active execution are shown separately.
- The source has a 15,000 outstanding-request safety ceiling and throttles new demand at that ceiling.
- A moving point is a sample of traffic. The chart and counters, rather than particle count, describe rates.
- The topology is acyclic. Only load balancers may branch; other components have at most one outgoing route.
- This version deliberately excludes monetary pricing, autoscaling, sagas, replication consistency, and network-level protocol simulation.

## Source layout

```text
src/simulation.ts           Typed, deterministic simulation engine
src/presets.ts              Scenarios and learning objectives
src/main.ts                 Architecture editor, controls, metrics, chart, persistence
src/style.css              Responsive application UI
tests/simulation.test.ts   Behavioral and conservation tests
```

## References

- [RabbitMQ flow control](https://www.rabbitmq.com/docs/flow-control)
- [RabbitMQ acknowledgements, confirms, and prefetch](https://www.rabbitmq.com/docs/confirms)
- [RFC 3290, token and leaky buckets](https://datatracker.ietf.org/doc/rfc3290/)
- [Netflix concurrency limits](https://github.com/Netflix/concurrency-limits)

Repository: [MiguelChan/system-design-flow](https://github.com/MiguelChan/system-design-flow).
