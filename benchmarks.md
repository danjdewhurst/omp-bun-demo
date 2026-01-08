# IPC Benchmark Results

Benchmarks measuring round-trip latency between Bun (TypeScript) and Pawn via Redis pub/sub.

> **Note:** These benchmarks were run inside Docker with x86 emulation on ARM64 (Apple Silicon). Native performance on a Linux x86 server would likely be significantly better.

## Test Environment

- **Platform:** Docker (linux/amd64 emulated on darwin/arm64)
- **Redis:** 7-alpine (container)
- **Bun:** 1.3.5
- **open.mp:** 1.5.8.3079

## Results

| Test | Avg Latency | Min | Max | P50 | P95 | P99 | Throughput |
|------|-------------|-----|-----|-----|-----|-----|------------|
| Ping round-trip | 4.98ms | 2.70ms | 7.13ms | 4.94ms | 6.50ms | 7.13ms | ~201 ops/sec |
| Ping with payload | 4.98ms | 2.54ms | 7.26ms | 5.05ms | 6.74ms | 7.26ms | ~201 ops/sec |
| Sequential throughput | 5.00ms | 1.87ms | 7.77ms | 5.01ms | 6.37ms | 7.77ms | ~200 ops/sec |

## Test Descriptions

- **Ping round-trip:** Bun sends a Ping command to Pawn, Pawn returns GetTickCount()
- **Ping with payload:** Same as above but echoes back an integer value
- **Sequential throughput:** 100 sequential Ping commands measuring total time

## Interpretation

With ~5ms average round-trip latency, the bridge can handle approximately:

- 200 vehicle operations per second
- 200 player messages per second
- 200 health/armour/weapon updates per second

This is sufficient for most gamemode logic. For high-frequency operations (like per-frame updates), consider batching commands or handling them in Pawn directly.

## Running Benchmarks

**From in-game:**
```
/benchmark [iterations]
```

**Automatic:** Benchmarks run automatically on server startup after the vehicle demo.

## Potential Optimizations

1. **Native deployment:** Run on Linux x86 without Docker emulation
2. **Unix sockets:** Replace Redis TCP with Unix domain sockets
3. **Command batching:** Group multiple commands into single Redis messages
4. **Direct memory:** Use shared memory instead of Redis for lowest latency
