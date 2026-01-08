# Command Reference

This document provides a comprehensive reference for all commands that can be sent from TypeScript to Pawn via the Redis bridge.

## Table of Contents

- [Overview](#overview)
- [Command Architecture](#command-architecture)
- [Player Commands](#player-commands)
- [Vehicle Commands](#vehicle-commands)
- [Dialog Commands](#dialog-commands)
- [Benchmark Commands](#benchmark-commands)
- [Adding New Commands](#adding-new-commands)

---

## Overview

Commands are type-safe function calls that execute Pawn native functions from TypeScript. The system uses Redis pub/sub for inter-process communication between the Bun runtime and the open.mp server.

### Key Concepts

- **Synchronous API**: All commands return `Promise<number>` and wait for Pawn's response
- **Fire-and-forget**: Some commands offer a sync variant that does not wait for response
- **Type Safety**: Command definitions in `commands.ts` ensure compile-time type checking
- **Default Timeout**: Commands timeout after 5 seconds if no response is received

---

## Command Architecture

### Redis Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `omp:commands` | TypeScript -> Pawn | Command requests |
| `omp:responses` | Pawn -> TypeScript | Command responses |
| `omp:events` | Pawn -> TypeScript | Game events (not covered here) |

### Message Format

**Command Request** (TypeScript to Pawn):
```json
{
  "c": "CommandName",
  "a": [arg1, arg2, ...],
  "id": 123
}
```

**Command Response** (Pawn to TypeScript):
```json
{
  "ok": true,
  "r": 1,
  "id": 123
}
```

### Serialization

Commands are serialized as JSON with the following structure:

| Field | Type | Description |
|-------|------|-------------|
| `c` | string | Command name (matches Pawn native function) |
| `a` | array | Arguments in order defined by command |
| `id` | number | Unique message ID for response correlation |

---

## Player Commands

### Message Commands

#### SendClientMessage

Send a colored message to a specific player.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `color` | number | RGBA color (e.g., `0xFF0000FF` for red) |
| `message` | string | Message text (max 144 characters) |

**Returns**: `1` on success, `0` on failure

**TypeScript API**:
```typescript
// Async (waits for response)
await omp.player.sendMessage(playerid, 0x00FF00FF, "Hello, player!");

// Fire-and-forget (no response)
omp.player.sendMessageSync(playerid, 0x00FF00FF, "Hello, player!");
```

**Raw Command**:
```typescript
await server.sendCommand("SendClientMessage", [playerid, 0x00FF00FF, "Hello!"]);
```

---

#### SendClientMessageToAll

Send a colored message to all connected players.

| Argument | Type | Description |
|----------|------|-------------|
| `color` | number | RGBA color |
| `message` | string | Message text |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.sendMessageToAll(0xFFFFFFFF, "Server announcement!");
```

---

#### GameTextForPlayer

Display large styled text on a player's screen.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `text` | string | Text to display |
| `time` | number | Duration in milliseconds |
| `style` | number | Text style (0-6) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.gameText(playerid, "~r~WASTED", 5000, 2);
```

---

### Position & State Commands

#### SetPlayerPos

Teleport a player to specified coordinates.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `x` | number | X coordinate |
| `y` | number | Y coordinate |
| `z` | number | Z coordinate |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.setPosition(playerid, { x: 0.0, y: 0.0, z: 10.0 });
```

---

#### SetPlayerHealth

Set a player's health value.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `health` | number | Health value (0.0 - 100.0, can exceed) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.setHealth(playerid, 100.0);
```

---

#### SetPlayerArmour

Set a player's armour value.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `armour` | number | Armour value (0.0 - 100.0) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.setArmour(playerid, 100.0);
```

---

#### GivePlayerWeapon

Give a weapon to a player.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `weaponid` | number | Weapon ID (0-46) |
| `ammo` | number | Ammunition count |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.giveWeapon(playerid, 24, 100); // Desert Eagle with 100 ammo
```

---

#### GivePlayerMoney

Add or subtract money from a player's balance.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `amount` | number | Amount (negative to subtract) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.giveMoney(playerid, 1000);
await omp.player.giveMoney(playerid, -500); // Take money
```

---

#### SetPlayerScore

Set a player's score.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `score` | number | Score value |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.setScore(playerid, 10);
```

---

#### SetPlayerSkin

Change a player's skin/model.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `skinid` | number | Skin ID (0-311) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.setSkin(playerid, 0); // CJ skin
```

---

#### SetPlayerInterior

Set a player's interior ID.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `interiorid` | number | Interior ID |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.setInterior(playerid, 1);
```

---

#### SetPlayerVirtualWorld

Set a player's virtual world.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `worldid` | number | Virtual world ID |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.setVirtualWorld(playerid, 1);
```

---

### Player Lifecycle Commands

#### SpawnPlayer

Force spawn a player.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.spawn(playerid);
```

---

#### Kick

Kick a player from the server.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.kick(playerid);
```

---

#### Ban

Ban a player from the server.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.player.ban(playerid);
```

---

## Vehicle Commands

#### CreateVehicle

Create a new vehicle in the world.

| Argument | Type | Description |
|----------|------|-------------|
| `modelid` | number | Vehicle model ID (400-611) |
| `x` | number | X spawn coordinate |
| `y` | number | Y spawn coordinate |
| `z` | number | Z spawn coordinate |
| `rotation` | number | Spawn rotation (0.0 - 360.0) |
| `color1` | number | Primary color ID |
| `color2` | number | Secondary color ID |
| `respawnDelay` | number | Respawn delay in seconds (-1 = never) |

**Returns**: Vehicle ID on success, `INVALID_VEHICLE_ID` on failure

**TypeScript API**:
```typescript
const vehicleid = await omp.vehicle.create({
  modelid: 411, // Infernus
  position: { x: 0.0, y: 0.0, z: 5.0 },
  rotation: 90.0,
  color1: 1,
  color2: 1,
  respawnDelay: 300,
});
```

---

#### DestroyVehicle

Remove a vehicle from the world.

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Vehicle ID to destroy |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.destroy(vehicleid);
```

---

#### SetVehicleHealth

Set a vehicle's health.

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Target vehicle ID |
| `health` | number | Health value (0.0 - 1000.0) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.setHealth(vehicleid, 1000.0);
```

---

#### RepairVehicle

Fully repair a vehicle (health and visual damage).

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Target vehicle ID |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.repair(vehicleid);
```

---

#### SetVehiclePos

Teleport a vehicle to specified coordinates.

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Target vehicle ID |
| `x` | number | X coordinate |
| `y` | number | Y coordinate |
| `z` | number | Z coordinate |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.setPosition(vehicleid, 0.0, 0.0, 10.0);
```

---

#### SetVehicleZAngle

Set a vehicle's Z rotation (heading).

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Target vehicle ID |
| `angle` | number | Z angle (0.0 - 360.0) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.setZAngle(vehicleid, 180.0);
```

---

#### ChangeVehicleColor

Change a vehicle's colors.

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Target vehicle ID |
| `color1` | number | Primary color ID |
| `color2` | number | Secondary color ID |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.changeColor(vehicleid, 1, 0);
```

---

#### SetVehicleVelocity

Set a vehicle's velocity vector.

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Target vehicle ID |
| `x` | number | X velocity |
| `y` | number | Y velocity |
| `z` | number | Z velocity |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.setVelocity(vehicleid, 0.5, 0.0, 0.1);
```

---

#### AddVehicleComponent

Add a mod/component to a vehicle.

| Argument | Type | Description |
|----------|------|-------------|
| `vehicleid` | number | Target vehicle ID |
| `componentid` | number | Component ID (1000-1193) |

**Returns**: `1` on success

**TypeScript API**:
```typescript
await omp.vehicle.addComponent(vehicleid, 1010); // Nitro
```

---

## Dialog Commands

#### ShowPlayerDialog

Display a dialog box to a player.

| Argument | Type | Description |
|----------|------|-------------|
| `playerid` | number | Target player ID |
| `dialogid` | number | Dialog ID for response handling |
| `style` | number | Dialog style (see table below) |
| `title` | string | Dialog title (max 64 characters) |
| `body` | string | Dialog body text (max 512 characters) |
| `button1` | string | Left button text (max 32 characters) |
| `button2` | string | Right button text (max 32 characters) |

**Dialog Styles**:

| Style | Value | Description |
|-------|-------|-------------|
| `MessageBox` | 0 | Simple message with buttons |
| `Input` | 1 | Text input field |
| `List` | 2 | Selectable list items |
| `Password` | 3 | Masked password input |
| `Tablist` | 4 | Tabbed list |
| `TablistHeaders` | 5 | Tabbed list with headers |

**Returns**: `1` on success

**TypeScript API**:
```typescript
import { DialogStyle } from "./api/Player";

await omp.player.showDialog(playerid, 1, {
  style: DialogStyle.MessageBox,
  title: "Welcome",
  body: "Welcome to the server!\n\nEnjoy your stay.",
  button1: "OK",
  button2: "Cancel",
});

// List dialog example
await omp.player.showDialog(playerid, 2, {
  style: DialogStyle.List,
  title: "Select Option",
  body: "Option 1\nOption 2\nOption 3",
  button1: "Select",
  button2: "Cancel",
});
```

---

## Benchmark Commands

These commands are used for measuring bridge performance and latency.

#### Ping

Simple round-trip latency test.

| Argument | Type | Description |
|----------|------|-------------|
| (none) | - | - |

**Returns**: Current `GetTickCount()` value from Pawn

**Usage**:
```typescript
const result = await omp.benchmark.pingRoundTrip(100);
console.log(`Average latency: ${result.avgMs}ms`);
```

---

#### PingWithPayload

Round-trip test that echoes a value.

| Argument | Type | Description |
|----------|------|-------------|
| `value` | number | Value to echo back |

**Returns**: The same `value` that was sent

**Usage**:
```typescript
const result = await omp.benchmark.pingWithPayload(100);
console.log(`Throughput: ${result.opsPerSecond} ops/sec`);
```

---

## Adding New Commands

To add a new command, you must update both the TypeScript and Pawn sides.

### Step 1: Define the Command Type

Add the command definition to `bun-bridge/src/types/commands.ts`:

```typescript
export interface CommandDefinitions {
  // ... existing commands ...

  // Add your new command
  SetPlayerColor: {
    args: [playerid: number, color: number];
    returns: number;
  };
}
```

### Step 2: Implement in Pawn

Add command handling to `filterscripts/bridge.pwn` in `Bridge_ExecuteCommand`:

```pawn
stock Bridge_ExecuteCommand(const command[], const args[])
{
    // ... existing commands ...

    else if (!strcmp(command, "SetPlayerColor"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new colour = Bridge_ParseIntArg(args, 1);
        return _:SetPlayerColor(playerid, colour);
    }

    // ... rest of function ...
}
```

### Step 3: Add API Wrapper (Optional)

Add a wrapper method to the appropriate API class in `bun-bridge/src/api/`:

```typescript
// In Player.ts
async setColor(playerid: number, color: number): Promise<number> {
  return this.server.sendCommand("SetPlayerColor", [playerid, color]);
}
```

### Step 4: Recompile and Restart

```bash
# Recompile Pawn script (done automatically on container start)
./server.sh rebuild

# Or just restart if only TypeScript changed
./server.sh restart
```

### Argument Type Mapping

| TypeScript Type | Pawn Parser Function |
|-----------------|---------------------|
| `number` (int) | `Bridge_ParseIntArg(args, index)` |
| `number` (float) | `Bridge_ParseFloatArg(args, index)` |
| `string` | `Bridge_ParseStringArg(args, index, buffer, maxlen)` |

### Best Practices

1. **Command Naming**: Use the exact Pawn native function name (e.g., `SetPlayerHealth`, not `setPlayerHealth`)
2. **Return Values**: Return the native's return value for consistency
3. **Error Handling**: Return `0` for failure, non-zero for success
4. **Type Casting**: Use `_:` prefix in Pawn when returning `bool:` or tagged types as integers
5. **String Limits**: Respect Pawn string buffer sizes (typically 144 for messages, 256 for text)

---

## Error Handling

### Timeout Errors

Commands timeout after 5 seconds by default:

```typescript
try {
  await omp.player.sendMessage(playerid, 0xFFFFFFFF, "Hello");
} catch (error) {
  if (error.message.includes("timeout")) {
    console.error("Command timed out - Pawn bridge may be unresponsive");
  }
}
```

### Connection Errors

Check connection status before sending commands:

```typescript
if (!omp.isConnected) {
  await omp.waitForConnection();
}
```

### Custom Timeout

Override the default timeout for specific commands:

```typescript
// Using raw command with 10 second timeout
await server.sendCommand("CreateVehicle", [...args], 10000);
```
