import { BridgeServer } from "../server/BridgeServer";
import type { OpenMPEvents } from "../types/events";
import { Benchmark } from "../utils/Benchmark";
import { PlayerAPI } from "./Player";
import { VehicleAPI } from "./Vehicle";

type EventHandler<T> = (event: T, timestamp: number) => void | boolean | Promise<void | boolean>;

export interface OpenMPOptions {
  redisHost?: string;
  redisPort?: number;
}

export class OpenMP {
  private server: BridgeServer;
  private handlers: Map<string, Set<EventHandler<unknown>>> = new Map();

  public readonly player: PlayerAPI;
  public readonly vehicle: VehicleAPI;
  public readonly benchmark: Benchmark;

  constructor(options: OpenMPOptions = {}) {
    this.server = new BridgeServer({
      host: options.redisHost ?? "redis",
      port: options.redisPort ?? 6379,
    });

    this.player = new PlayerAPI(this.server);
    this.vehicle = new VehicleAPI(this.server);
    this.benchmark = new Benchmark(this.server);

    this.server.on("event", this.dispatchEvent.bind(this));
    this.server.on("connected", () => this.emit("connected"));
    this.server.on("disconnected", () => this.emit("disconnected"));
  }

  async start(): Promise<void> {
    await this.server.start();
  }

  async waitForConnection(): Promise<void> {
    if (this.server.isConnected) {
      return;
    }

    return new Promise((resolve) => {
      this.server.once("connected", resolve);
    });
  }

  on<K extends keyof OpenMPEvents>(event: K, handler: OpenMPEvents[K]): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    this.handlers.get(event)!.add(handler as EventHandler<unknown>);

    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler<unknown>);
    };
  }

  once<K extends keyof OpenMPEvents>(event: K, handler: OpenMPEvents[K]): () => void {
    const wrappedHandler = ((eventData: unknown, timestamp: number) => {
      this.handlers.get(event)?.delete(wrappedHandler as EventHandler<unknown>);
      return (handler as EventHandler<unknown>)(eventData, timestamp);
    }) as OpenMPEvents[K];

    return this.on(event, wrappedHandler);
  }

  off<K extends keyof OpenMPEvents>(event: K, handler?: OpenMPEvents[K]): void {
    if (handler) {
      this.handlers.get(event)?.delete(handler as EventHandler<unknown>);
    } else {
      this.handlers.delete(event);
    }
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(args[0], args[1] as number);
      }
    }
  }

  private async dispatchEvent(eventName: string, data: unknown, timestamp: number): Promise<void> {
    const handlers = this.handlers.get(eventName);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        const result = await handler(data, timestamp);
        if (result === false) break;
      } catch (error) {
        console.error(`[OpenMP] Error in ${eventName} handler:`, error);
      }
    }
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }

  get isConnected(): boolean {
    return this.server.isConnected;
  }
}
