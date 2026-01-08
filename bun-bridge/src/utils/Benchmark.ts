import type { BridgeServer } from "../server/BridgeServer";

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSecond: number;
}

export class Benchmark {
  constructor(private server: BridgeServer) {}

  /**
   * Measure Bun → Pawn → Bun round-trip latency
   * Sends a Ping command and waits for response
   */
  async pingRoundTrip(iterations = 100): Promise<BenchmarkResult> {
    const latencies: number[] = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      await this.server.sendCommand("Ping", []);
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.server.sendCommand("Ping", []);
      const end = performance.now();
      latencies.push(end - start);
    }

    return this.calculateStats("Bun → Pawn → Bun (Ping)", latencies);
  }

  /**
   * Measure Bun → Pawn → Bun with a payload
   */
  async pingWithPayload(iterations = 100): Promise<BenchmarkResult> {
    const latencies: number[] = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      await this.server.sendCommand("PingWithPayload", [12345]);
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = await this.server.sendCommand("PingWithPayload", [i]);
      const end = performance.now();

      if (result !== i) {
        console.warn(`[Benchmark] Payload mismatch: expected ${i}, got ${result}`);
      }

      latencies.push(end - start);
    }

    return this.calculateStats("Bun → Pawn → Bun (with payload)", latencies);
  }

  /**
   * Measure sequential command throughput
   */
  async sequentialThroughput(iterations = 100): Promise<BenchmarkResult> {
    const latencies: number[] = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      await this.server.sendCommand("Ping", []);
    }

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const cmdStart = performance.now();
      await this.server.sendCommand("Ping", []);
      latencies.push(performance.now() - cmdStart);
    }
    const totalMs = performance.now() - start;

    const stats = this.calculateStats("Sequential throughput", latencies);
    stats.totalMs = totalMs;
    stats.opsPerSecond = (iterations / totalMs) * 1000;
    return stats;
  }

  /**
   * Measure parallel command throughput (burst of commands)
   * Uses smaller batch size to avoid overwhelming the bridge
   */
  async parallelThroughput(iterations = 100, batchSize = 3): Promise<BenchmarkResult> {
    const latencies: number[] = [];
    const batches = Math.floor(iterations / batchSize);

    // Warmup with small batch
    try {
      await Promise.all(Array(batchSize).fill(0).map(() => this.server.sendCommand("Ping", [])));
    } catch {
      // Ignore warmup errors
    }

    const start = performance.now();
    for (let batch = 0; batch < batches; batch++) {
      const batchStart = performance.now();
      try {
        await Promise.all(
          Array(batchSize).fill(0).map(() => this.server.sendCommand("Ping", []))
        );
        const batchTime = performance.now() - batchStart;
        // Record average per-command time in this batch
        latencies.push(batchTime / batchSize);
      } catch {
        // Skip failed batches
      }
    }
    const totalMs = performance.now() - start;

    if (latencies.length === 0) {
      return {
        name: `Parallel throughput (batch=${batchSize})`,
        iterations: 0,
        totalMs,
        avgMs: 0,
        minMs: 0,
        maxMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        opsPerSecond: 0,
      };
    }

    const stats = this.calculateStats(`Parallel throughput (batch=${batchSize})`, latencies);
    stats.totalMs = totalMs;
    stats.opsPerSecond = (latencies.length * batchSize / totalMs) * 1000;
    return stats;
  }

  /**
   * Run all benchmarks and return results
   */
  async runAll(iterations = 100): Promise<BenchmarkResult[]> {
    console.log(`[Benchmark] Starting benchmarks with ${iterations} iterations each...`);
    console.log("[Benchmark] ================================================");

    const results: BenchmarkResult[] = [];

    // Ping round-trip
    const ping = await this.pingRoundTrip(iterations);
    this.printResult(ping);
    results.push(ping);

    // Ping with payload
    const pingPayload = await this.pingWithPayload(iterations);
    this.printResult(pingPayload);
    results.push(pingPayload);

    // Sequential throughput
    const sequential = await this.sequentialThroughput(iterations);
    this.printResult(sequential);
    results.push(sequential);

    // Parallel throughput
    const parallel = await this.parallelThroughput(iterations, 10);
    this.printResult(parallel);
    results.push(parallel);

    console.log("[Benchmark] ================================================");
    console.log("[Benchmark] All benchmarks complete!");

    return results;
  }

  private calculateStats(name: string, latencies: number[]): BenchmarkResult {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = latencies.reduce((a, b) => a + b, 0);

    return {
      name,
      iterations: latencies.length,
      totalMs: sum,
      avgMs: sum / latencies.length,
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
      p50Ms: sorted[Math.floor(sorted.length * 0.5)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      p99Ms: sorted[Math.floor(sorted.length * 0.99)],
      opsPerSecond: (latencies.length / sum) * 1000,
    };
  }

  private printResult(result: BenchmarkResult): void {
    console.log(`[Benchmark] ${result.name}`);
    console.log(`[Benchmark]   Iterations: ${result.iterations}`);
    console.log(`[Benchmark]   Avg: ${result.avgMs.toFixed(3)}ms | Min: ${result.minMs.toFixed(3)}ms | Max: ${result.maxMs.toFixed(3)}ms`);
    console.log(`[Benchmark]   P50: ${result.p50Ms.toFixed(3)}ms | P95: ${result.p95Ms.toFixed(3)}ms | P99: ${result.p99Ms.toFixed(3)}ms`);
    console.log(`[Benchmark]   Throughput: ${result.opsPerSecond.toFixed(1)} ops/sec`);
    console.log("[Benchmark] ------------------------------------------------");
  }
}
