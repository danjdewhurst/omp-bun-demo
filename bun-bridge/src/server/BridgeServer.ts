import { EventEmitter } from "events";
import Redis from "ioredis";
import type { CommandArgs, CommandName, CommandReturn } from "../types/commands";

interface PendingResponse {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: Timer;
}

export interface BridgeServerOptions {
  host: string;
  port: number;
}

const CHANNEL_EVENTS = "omp:events";
const CHANNEL_COMMANDS = "omp:commands";
const CHANNEL_RESPONSES = "omp:responses";

export class BridgeServer extends EventEmitter {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private pendingResponses = new Map<string, PendingResponse>();
  private messageId = 0;
  private connected = false;
  private readonly options: BridgeServerOptions;

  constructor(options: BridgeServerOptions) {
    super();
    this.options = options;
  }

  async start(): Promise<void> {
    const redisConfig = {
      host: this.options.host,
      port: this.options.port,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        console.log(`[Bridge] Redis reconnecting in ${delay}ms...`);
        return delay;
      },
    };

    this.publisher = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);

    this.publisher.on("connect", () => {
      console.log("[Bridge] Redis publisher connected");
    });

    this.publisher.on("error", (err) => {
      console.error("[Bridge] Redis publisher error:", err.message);
    });

    this.subscriber.on("connect", () => {
      console.log("[Bridge] Redis subscriber connected");
      this.connected = true;
      this.emit("connected");
    });

    this.subscriber.on("error", (err) => {
      console.error("[Bridge] Redis subscriber error:", err.message);
    });

    this.subscriber.on("close", () => {
      console.log("[Bridge] Redis subscriber disconnected");
      this.connected = false;
      this.clearPendingResponses("Connection closed");
      this.emit("disconnected");
    });

    this.subscriber.on("message", (channel, message) => {
      this.handleMessage(channel, message);
    });

    await this.subscriber.subscribe(CHANNEL_EVENTS, CHANNEL_RESPONSES);
    console.log(`[Bridge] Subscribed to ${CHANNEL_EVENTS} and ${CHANNEL_RESPONSES}`);
  }

  private handleMessage(channel: string, raw: string): void {
    try {
      const data = JSON.parse(raw);

      if (channel === CHANNEL_EVENTS) {
        this.handleEvent(data);
      } else if (channel === CHANNEL_RESPONSES) {
        this.handleResponse(data);
      }
    } catch (error) {
      console.error("[Bridge] Failed to process message:", error);
    }
  }

  private handleEvent(data: { e: string; d: Record<string, unknown>; t: number }): void {
    const { e: eventName, d: eventData, t: timestamp } = data;

    this.emit("event", eventName, eventData, timestamp);
    this.emit(eventName, eventData, timestamp);
  }

  private handleResponse(data: { id: string | number; ok: boolean; r?: unknown; e?: string }): void {
    // Convert ID to string for map lookup (Pawn sends numeric IDs)
    const id = String(data.id);
    const pending = this.pendingResponses.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingResponses.delete(id);

    if (data.ok) {
      pending.resolve(data.r);
    } else {
      pending.reject(new Error(data.e ?? "Command failed"));
    }
  }

  private clearPendingResponses(reason: string): void {
    for (const [, pending] of this.pendingResponses) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingResponses.clear();
  }

  async sendCommand<K extends CommandName>(
    command: K,
    args: CommandArgs<K>,
    timeout = 5000,
  ): Promise<CommandReturn<K>> {
    if (!this.publisher || !this.connected) {
      throw new Error("Not connected to Redis");
    }

    const id = this.generateMessageId();
    // Note: id must be a number for Pawn parser compatibility
    const payload = `{"c":"${command}","a":${JSON.stringify(args)},"id":${id}}`;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingResponses.delete(id);
        reject(new Error(`Command timeout: ${command}`));
      }, timeout);

      this.pendingResponses.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
      });

      this.publisher!.publish(CHANNEL_COMMANDS, payload);
    });
  }

  sendCommandNoWait<K extends CommandName>(command: K, args: CommandArgs<K>): void {
    if (!this.publisher || !this.connected) {
      return;
    }

    const id = this.generateMessageId();
    const payload = JSON.stringify({ id, c: command, a: args });
    this.publisher.publish(CHANNEL_COMMANDS, payload);
  }

  private generateMessageId(): string {
    return (++this.messageId).toString();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async stop(): Promise<void> {
    this.clearPendingResponses("Server stopped");
    await this.subscriber?.unsubscribe();
    await this.subscriber?.quit();
    await this.publisher?.quit();
    this.subscriber = null;
    this.publisher = null;
    this.connected = false;
  }
}
