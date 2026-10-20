import { createNode, type Design } from "./simulation.ts";
const edges = (pairs: [string, string][]) =>
  pairs.map(([from, to]) => ({ id: `${from}-${to}`, from, to }));
export interface Scenario {
  id: string;
  title: string;
  badge: string;
  description: string;
  mission: string;
  hint: string;
  design: Design;
}
export const SCENARIOS: Scenario[] = [
  {
    id: "pressure",
    title: "Domar la cola",
    badge: "01 · Backpressure",
    description:
      "Llegan 160 requests/s. Un worker procesa alrededor de 50/s. El exceso empieza a viajar hacia atrás.",
    mission:
      "Consigue ≥150 respuestas/s, sin descartes y con p95 <2 s, durante 5 segundos seguidos.",
    hint: "Selecciona Worker y compara su capacidad con la demanda. Prueba más réplicas. Si el throughput deja de subir, revisa el prefetch de la cola: también limita el trabajo en vuelo. Después observa si el cuello se mueve a la DB.",
    design: {
      name: "Domar la cola",
      nodes: [
        createNode("source", "source", 40, 110, "Clientes", {
          rps: 160,
          readPercent: 65,
        }),
        createNode("lb", "lb", 300, 110),
        createNode("service", "api", 560, 110, "Poll API", {
          concurrency: 10,
          latencyMs: 20,
          buffer: 60,
        }),
        createNode("queue", "queue", 560, 350, "Votos pendientes", {
          capacity: 160,
          prefetch: 12,
        }),
        createNode("service", "worker", 820, 350, "Worker", {
          concurrency: 4,
          latencyMs: 80,
          buffer: 12,
        }),
        createNode("db", "db", 1080, 350, "Votes DB", {
          readRps: 240,
          writeRps: 100,
        }),
      ],
      edges: edges([
        ["source", "lb"],
        ["lb", "api"],
        ["api", "queue"],
        ["queue", "worker"],
        ["worker", "db"],
      ]),
    },
  },
  {
    id: "reads",
    title: "Lecturas bajo presión",
    badge: "02 · Cache + réplicas",
    description:
      "El 90% del tráfico son lecturas. La DB empieza con 70 lecturas/s; las escrituras solo llegan al primario.",
    mission:
      "Consigue ≥250 respuestas/s y p95 <2 s durante 5 segundos seguidos.",
    hint: "Sube el hit rate de Redis o añade réplicas de lectura a la DB. Después cambia a 80% de escrituras: ¿qué deja de ayudar?",
    design: {
      name: "Lecturas bajo presión",
      nodes: [
        createNode("source", "source", 40, 200, "Clientes", {
          rps: 280,
          readPercent: 90,
        }),
        createNode("lb", "lb", 300, 200),
        createNode("service", "api", 560, 200, "Results API", {
          replicas: 2,
          concurrency: 10,
          latencyMs: 20,
        }),
        createNode("cache", "cache", 820, 200, "Redis Cache", { hitRate: 10 }),
        createNode("db", "db", 1080, 200, "Polls DB", {
          readRps: 70,
          writeRps: 40,
        }),
      ],
      edges: edges([
        ["source", "lb"],
        ["lb", "api"],
        ["api", "cache"],
        ["cache", "db"],
      ]),
    },
  },
  {
    id: "balance",
    title: "Repartir el trabajo",
    badge: "03 · Load balancing",
    description:
      "Dos APIs tienen velocidades diferentes. Round robin reparte turnos, aunque uno de los destinos vaya más lento.",
    mission:
      "Consigue ≥210 respuestas/s, sin descartes y con p95 <1 s, durante 5 segundos seguidos.",
    hint: "Compara round robin con least loaded. También puedes escalar la API lenta, o simular su caída y recuperación.",
    design: {
      name: "Repartir el trabajo",
      nodes: [
        createNode("source", "source", 40, 250, "Clientes", {
          rps: 240,
          readPercent: 60,
        }),
        createNode("lb", "lb", 300, 250),
        createNode("service", "fast", 600, 90, "API rápida", {
          concurrency: 6,
          latencyMs: 20,
          buffer: 40,
        }),
        createNode("service", "slow", 600, 410, "API lenta", {
          concurrency: 4,
          latencyMs: 100,
          buffer: 80,
        }),
        createNode("db", "db", 1000, 250, "Shared DB", {
          readRps: 600,
          writeRps: 300,
          concurrency: 100,
        }),
      ],
      edges: edges([
        ["source", "lb"],
        ["lb", "fast"],
        ["lb", "slow"],
        ["fast", "db"],
        ["slow", "db"],
      ]),
    },
  },
  {
    id: "free",
    title: "Lienzo libre",
    badge: "Sandbox",
    description:
      "Construye tu propio sistema: añade componentes y conecta los puertos de salida y entrada.",
    mission:
      "Experimenta libremente. Cambiar la topología reinicia el reloj; los controles de capacidad se aplican en vivo.",
    hint: "Empieza con Clientes → ALB → API → DB. Luego intercala una cola o un cache y compara el comportamiento.",
    design: {
      name: "Mi arquitectura",
      nodes: [
        createNode("source", "source", 80, 240),
        createNode("db", "db", 880, 240),
      ],
      edges: [],
    },
  },
];
