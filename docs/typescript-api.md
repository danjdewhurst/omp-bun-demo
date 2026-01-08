# TypeScript API Reference

This document covers the TypeScript API for interacting with the open.mp game server through the Bun bridge.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [OpenMP Class](#openmp-class)
- [Event System](#event-system)
- [PlayerAPI](#playerapi)
- [VehicleAPI](#vehicleapi)
- [BridgeServer](#bridgeserver)
- [Type Definitions](#type-definitions)
- [Best Practices](#best-practices)

## Architecture Overview

The TypeScript gamemode communicates with the Pawn server through Redis pub/sub:

```
TypeScript (Bun) <---> Redis <---> Pawn (omp-server)
```

**Channels:**
- `omp:events` - Game events from Pawn to TypeScript
- `omp:commands` - Native function calls from TypeScript to Pawn
- `omp:responses` - Command responses from Pawn to TypeScript

## OpenMP Class

The `OpenMP` class is the main entry point for interacting with the game server.

### Import and Initialization

```typescript
import { OpenMP } from "./api/OpenMP";

const omp = new OpenMP();

// Or with custom Redis configuration
const omp = new OpenMP({
  redisHost: "localhost",
  redisPort: 6379,
});
```

### Configuration Options

```typescript
interface OpenMPOptions {
  redisHost?: string;  // Default: "redis"
  redisPort?: number;  // Default: 6379
}
```

### Starting the Server

```typescript
async function main() {
  await omp.start();
  console.log("Connected to Redis!");
}

main();
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `player` | `PlayerAPI` | Player manipulation functions |
| `vehicle` | `VehicleAPI` | Vehicle manipulation functions |
| `benchmark` | `Benchmark` | IPC latency benchmarking utilities |
| `isConnected` | `boolean` | Current connection status |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Connect to Redis and start listening |
| `stop()` | `Promise<void>` | Disconnect and clean up resources |
| `waitForConnection()` | `Promise<void>` | Wait until connected to Redis |

## Event System

The API provides a typed event system for handling game callbacks.

### Subscribing to Events

**`on(event, handler)`** - Subscribe to an event

```typescript
// Returns an unsubscribe function
const unsubscribe = omp.on("OnPlayerConnect", async (event) => {
  console.log(`${event.name} connected from ${event.ip}`);
  await omp.player.sendMessage(event.playerid, 0x00FF00FF, "Welcome!");
});

// Later, to unsubscribe:
unsubscribe();
```

**`once(event, handler)`** - Subscribe to an event once

```typescript
omp.once("OnBridgeInit", () => {
  console.log("Bridge initialized - this only fires once!");
});
```

**`off(event, handler?)`** - Unsubscribe from an event

```typescript
// Remove specific handler
omp.off("OnPlayerConnect", myHandler);

// Remove all handlers for an event
omp.off("OnPlayerConnect");
```

### Handler Return Values

Some events support return values to control Pawn callback flow:

- Return `false` to stop event propagation (handled)
- Return `true` or `void` to continue (let Pawn handle it)

```typescript
omp.on("OnPlayerCommandText", async ({ playerid, cmdtext }) => {
  if (cmdtext === "/heal") {
    await omp.player.setHealth(playerid, 100);
    return false; // Command handled, don't pass to Pawn
  }
  return true; // Unknown command, let Pawn handle
});
```

### Available Events

| Event | Payload | Returnable |
|-------|---------|------------|
| `OnBridgeInit` | `{}` | No |
| `OnPlayerConnect` | `{ playerid, name, ip }` | Yes |
| `OnPlayerDisconnect` | `{ playerid, reason }` | No |
| `OnPlayerSpawn` | `{ playerid }` | Yes |
| `OnPlayerDeath` | `{ playerid, killerid, reason }` | No |
| `OnPlayerText` | `{ playerid, text }` | Yes |
| `OnPlayerCommandText` | `{ playerid, cmdtext }` | Yes |
| `OnPlayerStateChange` | `{ playerid, newstate, oldstate }` | No |
| `OnPlayerEnterVehicle` | `{ playerid, vehicleid, ispassenger }` | Yes |
| `OnPlayerExitVehicle` | `{ playerid, vehicleid }` | No |
| `OnVehicleSpawn` | `{ vehicleid }` | No |
| `OnVehicleDeath` | `{ vehicleid, killerid }` | No |
| `OnDialogResponse` | `{ playerid, dialogid, response, listitem, inputtext }` | Yes |
| `OnPlayerTakeDamage` | `{ playerid, issuerid, amount, weaponid, bodypart }` | No |
| `OnPlayerGiveDamage` | `{ playerid, damagedid, amount, weaponid, bodypart }` | No |
| `OnPlayerClickMap` | `{ playerid, x, y, z }` | No |
| `OnPlayerEnterCheckpoint` | `{ playerid }` | No |
| `OnPlayerLeaveCheckpoint` | `{ playerid }` | No |
| `OnPlayerRequestClass` | `{ playerid, classid }` | Yes |
| `OnPlayerRequestSpawn` | `{ playerid }` | Yes |
| `OnFilterScriptExit` | `{}` | No |

### Event Type Definitions

```typescript
interface PlayerConnectEvent {
  playerid: number;
  name: string;
  ip: string;
}

interface PlayerDeathEvent {
  playerid: number;
  killerid: number;
  reason: number;
}

enum DisconnectReason {
  Timeout = 0,
  Quit = 1,
  Kick = 2,
}

enum PlayerState {
  None = 0,
  OnFoot = 1,
  Driver = 2,
  Passenger = 3,
  ExitVehicle = 4,
  EnterVehicleDriver = 5,
  EnterVehiclePassenger = 6,
  Wasted = 7,
  Spawned = 8,
  Spectating = 9,
}
```

## PlayerAPI

Access via `omp.player`.

### Methods

#### Messages

```typescript
// Send message to a player (async with response)
await omp.player.sendMessage(playerid, 0xFF0000FF, "Hello!");

// Send message without waiting for response (fire-and-forget)
omp.player.sendMessageSync(playerid, 0xFF0000FF, "Hello!");

// Send message to all players
await omp.player.sendMessageToAll(0xFFFFFFFF, "Server announcement!");

// Display game text
await omp.player.gameText(playerid, "~r~Warning!", 5000, 3);
```

#### Health and Armour

```typescript
await omp.player.setHealth(playerid, 100);
await omp.player.setArmour(playerid, 100);
```

#### Position and World

```typescript
await omp.player.setPosition(playerid, { x: 0, y: 0, z: 5 });
await omp.player.setInterior(playerid, 0);
await omp.player.setVirtualWorld(playerid, 0);
```

#### Weapons and Money

```typescript
await omp.player.giveWeapon(playerid, 24, 100); // Deagle with 100 ammo
await omp.player.giveMoney(playerid, 5000);
```

#### Appearance

```typescript
await omp.player.setSkin(playerid, 0);
await omp.player.setScore(playerid, 10);
```

#### Spawning and Administration

```typescript
await omp.player.spawn(playerid);
await omp.player.kick(playerid);
await omp.player.ban(playerid);
```

#### Dialogs

```typescript
import { DialogStyle } from "./api/Player";

await omp.player.showDialog(playerid, 1, {
  style: DialogStyle.MessageBox,
  title: "Welcome",
  body: "Hello and welcome to the server!",
  button1: "OK",
  button2: "Cancel", // Optional
});
```

**Dialog Styles:**

```typescript
enum DialogStyle {
  MessageBox = 0,
  Input = 1,
  List = 2,
  Password = 3,
  Tablist = 4,
  TablistHeaders = 5,
}
```

### Complete Method Reference

| Method | Parameters | Returns |
|--------|------------|---------|
| `sendMessage` | `playerid, color, message` | `Promise<number>` |
| `sendMessageSync` | `playerid, color, message` | `void` |
| `sendMessageToAll` | `color, message` | `Promise<number>` |
| `gameText` | `playerid, text, time, style` | `Promise<number>` |
| `setPosition` | `playerid, { x, y, z }` | `Promise<number>` |
| `setHealth` | `playerid, health` | `Promise<number>` |
| `setArmour` | `playerid, armour` | `Promise<number>` |
| `giveWeapon` | `playerid, weaponid, ammo` | `Promise<number>` |
| `giveMoney` | `playerid, amount` | `Promise<number>` |
| `setScore` | `playerid, score` | `Promise<number>` |
| `setSkin` | `playerid, skinid` | `Promise<number>` |
| `setInterior` | `playerid, interiorid` | `Promise<number>` |
| `setVirtualWorld` | `playerid, worldid` | `Promise<number>` |
| `spawn` | `playerid` | `Promise<number>` |
| `kick` | `playerid` | `Promise<number>` |
| `ban` | `playerid` | `Promise<number>` |
| `showDialog` | `playerid, dialogid, options` | `Promise<number>` |

## VehicleAPI

Access via `omp.vehicle`.

### Creating Vehicles

```typescript
const vehicleid = await omp.vehicle.create({
  modelid: 411,                      // Infernus
  position: { x: 0, y: 0, z: 5 },
  rotation: 90,
  color1: 1,
  color2: 0,
  respawnDelay: 300,                 // Optional, defaults to -1 (no respawn)
});
```

### Manipulating Vehicles

```typescript
// Health and repair
await omp.vehicle.setHealth(vehicleid, 1000);
await omp.vehicle.repair(vehicleid);

// Position and rotation
await omp.vehicle.setPosition(vehicleid, 100, 200, 10);
await omp.vehicle.setZAngle(vehicleid, 180);

// Appearance
await omp.vehicle.changeColor(vehicleid, 3, 1);
await omp.vehicle.addComponent(vehicleid, 1010); // Nitro

// Physics
await omp.vehicle.setVelocity(vehicleid, 0.5, 0, 0);

// Destruction
await omp.vehicle.destroy(vehicleid);
```

### Vehicle Create Options

```typescript
interface VehicleCreateOptions {
  modelid: number;
  position: Vector3;
  rotation: number;
  color1: number;
  color2: number;
  respawnDelay?: number; // Optional, -1 = no respawn
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}
```

### Complete Method Reference

| Method | Parameters | Returns |
|--------|------------|---------|
| `create` | `VehicleCreateOptions` | `Promise<number>` (vehicleid) |
| `destroy` | `vehicleid` | `Promise<number>` |
| `setHealth` | `vehicleid, health` | `Promise<number>` |
| `repair` | `vehicleid` | `Promise<number>` |
| `setPosition` | `vehicleid, x, y, z` | `Promise<number>` |
| `setZAngle` | `vehicleid, angle` | `Promise<number>` |
| `changeColor` | `vehicleid, color1, color2` | `Promise<number>` |
| `setVelocity` | `vehicleid, x, y, z` | `Promise<number>` |
| `addComponent` | `vehicleid, componentid` | `Promise<number>` |

## BridgeServer

The `BridgeServer` class handles Redis communication. It is used internally by `OpenMP` but can be extended for custom implementations.

### How Commands Work

1. TypeScript calls an API method (e.g., `omp.player.setHealth(0, 100)`)
2. The API wrapper calls `server.sendCommand("SetPlayerHealth", [0, 100])`
3. `BridgeServer` publishes to `omp:commands` with a unique message ID
4. Pawn receives the command, executes the native function
5. Pawn publishes the result to `omp:responses`
6. `BridgeServer` resolves the promise with the result

### Command Format

Commands are sent as JSON:

```json
{"c":"SetPlayerHealth","a":[0,100],"id":1}
```

Responses are received as:

```json
{"id":1,"ok":true,"r":1}
```

### Event Format

Events are received as JSON:

```json
{"e":"OnPlayerConnect","d":{"playerid":0,"name":"Player","ip":"127.0.0.1"},"t":1234567890}
```

### Sending Commands

```typescript
// With response (waits for Pawn to respond)
const result = await server.sendCommand("SetPlayerHealth", [playerid, 100]);

// Fire-and-forget (no response, faster)
server.sendCommandNoWait("SendClientMessage", [playerid, color, message]);
```

### Command Timeout

Commands timeout after 5 seconds by default. You can specify a custom timeout:

```typescript
const result = await server.sendCommand("SomeSlowCommand", [args], 10000); // 10 second timeout
```

## Type Definitions

### Command Types

All commands are strongly typed through `CommandDefinitions`:

```typescript
interface CommandDefinitions {
  SendClientMessage: {
    args: [playerid: number, color: number, message: string];
    returns: number;
  };
  SetPlayerHealth: {
    args: [playerid: number, health: number];
    returns: number;
  };
  CreateVehicle: {
    args: [modelid: number, x: number, y: number, z: number,
           rotation: number, color1: number, color2: number, respawnDelay: number];
    returns: number;
  };
  // ... more commands
}

// Type helpers
type CommandName = keyof CommandDefinitions;
type CommandArgs<K extends CommandName> = CommandDefinitions[K]["args"];
type CommandReturn<K extends CommandName> = CommandDefinitions[K]["returns"];
```

### Event Types

Events are strongly typed through `OpenMPEvents`:

```typescript
interface OpenMPEvents {
  OnPlayerConnect: (event: PlayerConnectEvent) => void | boolean | Promise<void | boolean>;
  OnPlayerDeath: (event: PlayerDeathEvent) => void | Promise<void>;
  // ... more events
}
```

## Best Practices

### Use Constants for Colors

```typescript
const Colors = {
  White: 0xFFFFFFFF,
  Green: 0x00FF00FF,
  Red: 0xFF0000FF,
  Yellow: 0xFFFF00FF,
} as const;

await omp.player.sendMessage(playerid, Colors.Green, "Success!");
```

### Track Players with a Map

```typescript
const players = new Map<number, { name: string; connectedAt: number }>();

omp.on("OnPlayerConnect", (event) => {
  players.set(event.playerid, {
    name: event.name,
    connectedAt: Date.now(),
  });
});

omp.on("OnPlayerDisconnect", (event) => {
  players.delete(event.playerid);
});
```

### Handle Commands with a Switch Statement

```typescript
omp.on("OnPlayerCommandText", async ({ playerid, cmdtext }) => {
  const [cmd, ...args] = cmdtext.split(" ");

  switch (cmd.toLowerCase()) {
    case "/heal":
      await omp.player.setHealth(playerid, 100);
      return false;

    case "/car":
      const modelid = parseInt(args[0], 10) || 411;
      await omp.vehicle.create({
        modelid,
        position: { x: 0, y: 0, z: 5 },
        rotation: 0,
        color1: -1,
        color2: -1,
      });
      return false;

    default:
      return true; // Unknown command
  }
});
```

### Use Fire-and-Forget for Non-Critical Messages

```typescript
// Don't wait for response on simple messages
omp.player.sendMessageSync(playerid, Colors.White, "Hello!");

// Wait for response when you need confirmation
const result = await omp.player.setHealth(playerid, 100);
```

### Wait for Bridge Initialization

```typescript
omp.on("OnBridgeInit", async () => {
  console.log("Pawn bridge ready!");
  // Safe to interact with server now
});

await omp.start();
```

### Error Handling

```typescript
omp.on("OnPlayerCommandText", async ({ playerid, cmdtext }) => {
  try {
    // Your command handling code
  } catch (error) {
    console.error("Command error:", error);
    await omp.player.sendMessage(playerid, Colors.Red, "An error occurred.");
  }
  return false;
});
```

## Benchmarking

The API includes built-in benchmarking tools:

```typescript
// Run all benchmarks
const results = await omp.benchmark.runAll(100);

// Individual benchmarks
const ping = await omp.benchmark.pingRoundTrip(100);
const sequential = await omp.benchmark.sequentialThroughput(100);
const parallel = await omp.benchmark.parallelThroughput(100, 10);
```

Benchmark results include:

```typescript
interface BenchmarkResult {
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
```

## Complete Example

```typescript
import { OpenMP } from "./api/OpenMP";
import { DialogStyle } from "./api/Player";

const Colors = {
  White: 0xFFFFFFFF,
  Green: 0x00FF00FF,
  Red: 0xFF0000FF,
} as const;

const omp = new OpenMP();
const players = new Map<number, { name: string }>();

omp.on("OnPlayerConnect", async ({ playerid, name }) => {
  players.set(playerid, { name });
  await omp.player.sendMessage(playerid, Colors.Green, `Welcome, ${name}!`);
  await omp.player.giveMoney(playerid, 5000);
});

omp.on("OnPlayerDisconnect", ({ playerid }) => {
  players.delete(playerid);
});

omp.on("OnPlayerSpawn", async ({ playerid }) => {
  await omp.player.setHealth(playerid, 100);
  await omp.player.setArmour(playerid, 100);
  await omp.player.giveWeapon(playerid, 24, 100);
});

omp.on("OnPlayerCommandText", async ({ playerid, cmdtext }) => {
  const [cmd, ...args] = cmdtext.split(" ");

  if (cmd === "/help") {
    await omp.player.showDialog(playerid, 1, {
      style: DialogStyle.MessageBox,
      title: "Help",
      body: "Commands: /help, /heal, /car",
      button1: "OK",
    });
    return false;
  }

  if (cmd === "/heal") {
    await omp.player.setHealth(playerid, 100);
    await omp.player.sendMessage(playerid, Colors.Green, "Healed!");
    return false;
  }

  if (cmd === "/car") {
    const vehicleid = await omp.vehicle.create({
      modelid: parseInt(args[0], 10) || 411,
      position: { x: 0, y: 0, z: 5 },
      rotation: 0,
      color1: -1,
      color2: -1,
    });
    await omp.player.sendMessage(playerid, Colors.White, `Vehicle ID: ${vehicleid}`);
    return false;
  }

  return true;
});

async function main() {
  await omp.start();
  console.log("Server started!");
}

main();
```
