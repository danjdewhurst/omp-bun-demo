# Architecture Overview

This document describes the architecture of the open.mp + Bun TypeScript bridge, which enables writing game logic in TypeScript while leveraging the open.mp server's native Pawn runtime.

## Design Goals

1. **Modern Development Experience** - Write game logic in TypeScript with full type safety, async/await, and modern tooling
2. **Performance** - Minimal IPC overhead using Redis pub/sub for high-throughput message passing
3. **Isolation** - Keep the Pawn runtime stable while allowing rapid iteration on TypeScript code
4. **Extensibility** - Easy to add new events and commands without modifying the core bridge

## System Architecture

```
+-------------------------------------------------------------------+
|                        Docker Environment                          |
|                                                                    |
|  +------------------+                  +------------------------+  |
|  |   omp-server     |                  |     Bun Runtime        |  |
|  |   (32-bit ELF)   |                  |                        |  |
|  |                  |                  |  bun-bridge/src/       |  |
|  |  +-----------+   |    omp:events    |  +------------------+  |  |
|  |  | bridge.pwn|---+------------------->| BridgeServer.ts  |  |  |
|  |  | (Redis)   |   |                  |  +------------------+  |  |
|  |  +-----------+   |   omp:commands   |           |            |  |
|  |       ^          |<-------------------+  +------v-------+    |  |
|  |       |          |                  |  |  OpenMP.ts    |    |  |
|  |       |          |   omp:responses  |  |  (API Layer)  |    |  |
|  |       +----------+------------------>  +------+-------+    |  |
|  |                  |                  |         |            |  |
|  +------------------+                  |  +------v-------+    |  |
|           ^                            |  |  index.ts    |    |  |
|           |                            |  |  (Gamemode)  |    |  |
|  +--------+--------+                   |  +--------------+    |  |
|  |     Redis       |                   +------------------------+  |
|  |   (Alpine)      |                                               |
|  +-----------------+                                               |
+-------------------------------------------------------------------+
```

## Components

### 1. open.mp Server (`omp-server`)

The core game server - a 32-bit Linux ELF binary that handles:
- Client connections and network synchronization
- Game world state (players, vehicles, objects)
- Pawn script execution via the Abstract Machine (AMX)

**Key files:**
- `omp-server` - Main executable
- `components/*.so` - Server plugins (Pawn VM, vehicles, NPCs, etc.)
- `plugins/redis.so` - pawn-redis plugin for Redis communication
- `config.json` - Server configuration

### 2. Pawn Bridge (`filterscripts/bridge.pwn`)

A filterscript that acts as the IPC layer between open.mp and TypeScript:

**Responsibilities:**
- Hooks all game events (player connect, death, commands, etc.)
- Serializes event data to JSON
- Publishes events to Redis (`omp:events` channel)
- Subscribes to commands from TypeScript (`omp:commands` channel)
- Parses command JSON and executes native functions
- Returns results via Redis (`omp:responses` channel)

**Why a filterscript?**
- Runs alongside the main gamemode without modification
- Can be reloaded independently
- Keeps bridge logic separate from game logic

### 3. Redis

Acts as the message broker between Pawn and TypeScript:

**Advantages over alternatives:**
- Low latency pub/sub messaging
- No direct process coupling
- Battle-tested reliability
- Simple protocol (strings/JSON)

**Channels:**
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `omp:events` | Pawn -> TypeScript | Game event notifications |
| `omp:commands` | TypeScript -> Pawn | Native function calls |
| `omp:responses` | Pawn -> TypeScript | Command return values |

### 4. Bun Bridge (`bun-bridge/`)

TypeScript runtime that handles game logic:

```
bun-bridge/
  src/
    server/
      BridgeServer.ts    # Redis pub/sub client
    api/
      OpenMP.ts          # Main API class
      Player.ts          # Player-related functions
      Vehicle.ts         # Vehicle-related functions
    types/
      events.ts          # Event type definitions
      commands.ts        # Command type definitions
    index.ts             # Gamemode entry point
```

**Why Bun?**
- Fast startup time
- Native TypeScript support (no compilation step)
- Excellent Redis library compatibility
- Modern JavaScript runtime features

## Data Flow

### Events (Pawn -> TypeScript)

When a game event occurs (e.g., player connects):

```
1. open.mp triggers OnPlayerConnect callback
2. bridge.pwn formats event as JSON:
   {"e":"OnPlayerConnect","d":{"playerid":0,"name":"Player","ip":"127.0.0.1"},"id":1,"t":12345}
3. bridge.pwn publishes to omp:events channel
4. BridgeServer receives message, parses JSON
5. OpenMP.ts dispatches to registered handlers
6. Gamemode handler executes async logic
```

**Event Message Format:**
```json
{
  "e": "OnPlayerConnect",     // Event name
  "d": {                      // Event data
    "playerid": 0,
    "name": "Player",
    "ip": "127.0.0.1"
  },
  "id": 1,                    // Message ID
  "t": 12345                  // Tick count (for timing)
}
```

### Commands (TypeScript -> Pawn)

When TypeScript calls a native function (e.g., send message):

```
1. Gamemode calls omp.player.sendMessage(0, 0xFF0000FF, "Hello")
2. PlayerAPI formats command via BridgeServer
3. BridgeServer publishes to omp:commands:
   {"c":"SendClientMessage","a":[0,4278190335,"Hello"],"id":"1"}
4. bridge.pwn receives via Redis subscription callback
5. bridge.pwn parses JSON, extracts command and arguments
6. bridge.pwn calls SendClientMessage(0, 0xFF0000FF, "Hello")
7. bridge.pwn publishes result to omp:responses:
   {"ok":true,"r":1,"id":"1"}
8. BridgeServer resolves pending Promise with result
```

**Command Message Format:**
```json
{
  "c": "SendClientMessage",   // Command name
  "a": [0, 4278190335, "Hello"], // Arguments array
  "id": "1"                   // Correlation ID for response
}
```

**Response Message Format:**
```json
{
  "ok": true,                 // Success flag
  "r": 1,                     // Return value
  "id": "1"                   // Correlation ID
}
```

### Sequence Diagram

```
    TypeScript                 Redis                    Pawn
        |                        |                        |
        |   SUBSCRIBE events     |                        |
        |----------------------->|                        |
        |                        |   SUBSCRIBE commands   |
        |                        |<-----------------------|
        |                        |                        |
   [Player connects to server]   |                        |
        |                        |                        |
        |                        |   PUBLISH omp:events   |
        |                        |<-----------------------|
        |   MESSAGE omp:events   |   {"e":"OnPlayerConnect"...}
        |<-----------------------|                        |
        |                        |                        |
   [Handler sends welcome msg]   |                        |
        |                        |                        |
        | PUBLISH omp:commands   |                        |
        |----------------------->|                        |
        |  {"c":"SendClientMessage"...}                   |
        |                        |   MESSAGE omp:commands |
        |                        |----------------------->|
        |                        |                        |
        |                        |   [Execute native fn]  |
        |                        |                        |
        |                        |  PUBLISH omp:responses |
        |                        |<-----------------------|
        |  MESSAGE omp:responses |                        |
        |<-----------------------|                        |
        |  {"ok":true,"r":1...}  |                        |
        |                        |                        |
   [Promise resolves]            |                        |
```

## Type System

The bridge provides full TypeScript type safety:

### Events (`types/events.ts`)

```typescript
export interface PlayerConnectEvent {
  playerid: number;
  name: string;
  ip: string;
}

export interface OpenMPEvents {
  OnPlayerConnect: (event: PlayerConnectEvent) => void | Promise<void>;
  // ... other events
}
```

### Commands (`types/commands.ts`)

```typescript
export interface CommandDefinitions {
  SendClientMessage: {
    args: [playerid: number, color: number, message: string];
    returns: number;
  };
  // ... other commands
}
```

This enables:
- Autocomplete for event names and command arguments
- Compile-time type checking
- IDE support for navigation and refactoring

## Supported Events

| Event | Payload |
|-------|---------|
| `OnBridgeInit` | `{}` |
| `OnPlayerConnect` | `{playerid, name, ip}` |
| `OnPlayerDisconnect` | `{playerid, reason}` |
| `OnPlayerSpawn` | `{playerid}` |
| `OnPlayerDeath` | `{playerid, killerid, reason}` |
| `OnPlayerText` | `{playerid, text}` |
| `OnPlayerCommandText` | `{playerid, cmdtext}` |
| `OnPlayerStateChange` | `{playerid, newstate, oldstate}` |
| `OnPlayerEnterVehicle` | `{playerid, vehicleid, ispassenger}` |
| `OnPlayerExitVehicle` | `{playerid, vehicleid}` |
| `OnVehicleSpawn` | `{vehicleid}` |
| `OnVehicleDeath` | `{vehicleid, killerid}` |
| `OnDialogResponse` | `{playerid, dialogid, response, listitem, inputtext}` |
| `OnPlayerTakeDamage` | `{playerid, issuerid, amount, weaponid, bodypart}` |
| `OnPlayerGiveDamage` | `{playerid, damagedid, amount, weaponid, bodypart}` |
| `OnPlayerClickMap` | `{playerid, x, y, z}` |
| `OnPlayerEnterCheckpoint` | `{playerid}` |
| `OnPlayerLeaveCheckpoint` | `{playerid}` |
| `OnPlayerRequestClass` | `{playerid, classid}` |
| `OnPlayerRequestSpawn` | `{playerid}` |

## Supported Commands

### Player Commands
- `SendClientMessage` - Send chat message to player
- `SendClientMessageToAll` - Broadcast chat message
- `GameTextForPlayer` - Display game text
- `SetPlayerPos` - Teleport player
- `SetPlayerHealth` / `SetPlayerArmour` - Modify stats
- `GivePlayerWeapon` - Give weapon with ammo
- `GivePlayerMoney` / `SetPlayerScore` - Economy
- `SetPlayerSkin` / `SetPlayerInterior` / `SetPlayerVirtualWorld` - Appearance/world
- `SpawnPlayer` / `Kick` / `Ban` - Player management
- `ShowPlayerDialog` - Display dialog box

### Vehicle Commands
- `CreateVehicle` / `DestroyVehicle` - Spawn/remove vehicles
- `SetVehicleHealth` / `RepairVehicle` - Vehicle damage
- `SetVehiclePos` / `SetVehicleZAngle` - Position/rotation
- `ChangeVehicleColor` / `SetVehicleVelocity` - Appearance/physics
- `AddVehicleComponent` - Modifications

## Docker Configuration

The system runs in Docker with three services:

```yaml
services:
  redis:
    image: redis:7-alpine

  omp-server:
    build: .
    depends_on:
      - redis
    ports:
      - "7777:7777/udp"
    volumes:
      - ./config.json:/opt/omp-server/config.json
      - ./bun-bridge/src:/opt/omp-server/bun-bridge/src  # Hot reload
```

**Startup sequence (`start.sh`):**
1. Compile Pawn filterscripts
2. Start Bun bridge in background
3. Wait for Bun to initialize
4. Start open.mp server in foreground
5. On shutdown, gracefully stop Bun

## Performance Considerations

### Latency

Typical round-trip latency for a command:
- Redis pub/sub: ~0.1-0.5ms
- JSON serialization: ~0.01ms
- Pawn execution: ~0.01ms
- **Total: ~0.2-1ms per command**

### Throughput

The bridge can handle thousands of messages per second. For bulk operations, consider:
- Using `sendCommandNoWait()` for fire-and-forget calls
- Batching related operations
- Avoiding unnecessary round-trips

### Memory

- Pawn buffer sizes are limited (`BRIDGE_MAX_MESSAGE_SIZE = 2048`)
- Large payloads should be chunked or avoided
- String escaping adds overhead for special characters

## Extending the Bridge

### Adding a New Event

1. Add the callback in `bridge.pwn`:
```pawn
public OnPlayerPickUpPickup(playerid, pickupid)
{
    new payload[64];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"pickupid\":%d}", playerid, pickupid);
    Bridge_SendEvent("OnPlayerPickUpPickup", payload);
    return 1;
}
```

2. Add the type in `types/events.ts`:
```typescript
export interface PlayerPickUpPickupEvent {
  playerid: number;
  pickupid: number;
}

export interface OpenMPEvents {
  // ...
  OnPlayerPickUpPickup: (event: PlayerPickUpPickupEvent) => void | Promise<void>;
}
```

### Adding a New Command

1. Add the handler in `bridge.pwn`:
```pawn
else if (!strcmp(command, "CreatePickup"))
{
    new model = Bridge_ParseIntArg(args, 0);
    new type = Bridge_ParseIntArg(args, 1);
    new Float:x = Bridge_ParseFloatArg(args, 2);
    new Float:y = Bridge_ParseFloatArg(args, 3);
    new Float:z = Bridge_ParseFloatArg(args, 4);
    return CreatePickup(model, type, x, y, z, -1);
}
```

2. Add the type in `types/commands.ts`:
```typescript
export interface CommandDefinitions {
  // ...
  CreatePickup: {
    args: [model: number, type: number, x: number, y: number, z: number];
    returns: number;
  };
}
```

3. Add the API method (optional):
```typescript
// api/World.ts
async createPickup(model: number, type: number, pos: Vector3): Promise<number> {
  return this.server.sendCommand("CreatePickup", [model, type, pos.x, pos.y, pos.z]);
}
```

## Limitations

1. **No bidirectional return values** - Pawn events cannot return values influenced by TypeScript (the bridge sends events asynchronously)
2. **String length limits** - Pawn string buffers have fixed sizes
3. **32-bit architecture** - open.mp requires a 32-bit Linux environment
4. **Single-threaded Pawn** - Commands execute sequentially in the Pawn VM
5. **No direct memory access** - Cannot read Pawn variables directly; must expose them via commands

## Future Improvements

- WebSocket bridge for browser-based admin panels
- Direct memory mapping for high-frequency data (player positions)
- Plugin system for modular gamemode components
- State synchronization layer for distributed servers
