# Events Reference

This document provides a comprehensive reference for all events available in the bun-bridge TypeScript gamemode system.

## Table of Contents

- [Overview](#overview)
- [Event Registration](#event-registration)
- [Async Event Handling](#async-event-handling)
- [Return Values](#return-values)
- [Events Reference](#events-reference-1)
  - [Bridge Events](#bridge-events)
  - [Player Events](#player-events)
  - [Vehicle Events](#vehicle-events)
  - [Dialog Events](#dialog-events)
  - [Checkpoint Events](#checkpoint-events)

---

## Overview

Events are forwarded from the Pawn filterscript (`bridge.pwn`) to TypeScript via Redis pub/sub. The `OpenMP` class provides a typed event emitter interface for handling these events.

```typescript
import { OpenMP } from "./api/OpenMP";

const omp = new OpenMP();

omp.on("OnPlayerConnect", (event) => {
  console.log(`Player ${event.name} connected`);
});

await omp.start();
```

---

## Event Registration

### `omp.on(event, handler)`

Registers a handler for an event. Returns an unsubscribe function.

```typescript
const unsubscribe = omp.on("OnPlayerConnect", (event) => {
  console.log(`Player connected: ${event.name}`);
});

// Later, to remove the handler:
unsubscribe();
```

### `omp.once(event, handler)`

Registers a one-time handler that automatically removes itself after the first invocation.

```typescript
omp.once("OnBridgeInit", () => {
  console.log("Bridge initialized - this only runs once");
});
```

### `omp.off(event, handler?)`

Removes event handlers. If no handler is specified, removes all handlers for the event.

```typescript
// Remove specific handler
omp.off("OnPlayerConnect", myHandler);

// Remove all handlers for an event
omp.off("OnPlayerConnect");
```

---

## Async Event Handling

All event handlers can be synchronous or asynchronous. The bridge awaits async handlers before processing the next handler.

```typescript
// Synchronous handler
omp.on("OnPlayerSpawn", (event) => {
  console.log(`Player ${event.playerid} spawned`);
});

// Asynchronous handler
omp.on("OnPlayerSpawn", async (event) => {
  await omp.player.setHealth(event.playerid, 100);
  await omp.player.giveWeapon(event.playerid, 24, 100);
  await omp.player.gameText(event.playerid, "~g~Welcome!", 3000, 3);
});
```

**Handler Execution**: Multiple handlers for the same event execute sequentially in registration order. Each handler is awaited before the next one runs.

---

## Return Values

Some events support return values to control behavior:

| Return Value | Meaning |
|--------------|---------|
| `void` / `undefined` | Continue processing, allow default behavior |
| `true` | Continue processing, allow default behavior |
| `false` | Stop propagation, prevent default behavior |

### Events Supporting Return Values

| Event | `false` Behavior |
|-------|------------------|
| `OnPlayerConnect` | Prevent connection (kick player) |
| `OnPlayerSpawn` | Prevent spawn |
| `OnPlayerText` | Block chat message |
| `OnPlayerCommandText` | Mark command as handled (prevent "Unknown command") |
| `OnPlayerEnterVehicle` | Prevent vehicle entry |
| `OnDialogResponse` | Mark dialog as handled |
| `OnPlayerRequestClass` | Deny class selection |
| `OnPlayerRequestSpawn` | Deny spawn request |

### Example: Command Handling

```typescript
omp.on("OnPlayerCommandText", async (event) => {
  const [cmd, ...args] = event.cmdtext.split(" ");

  if (cmd === "/heal") {
    await omp.player.setHealth(event.playerid, 100);
    await omp.player.sendMessage(event.playerid, 0x00FF00FF, "Healed!");
    return false; // Command handled - don't show "Unknown command"
  }

  return true; // Let Pawn handle unknown commands
});
```

### Handler Chain Behavior

When returning `false`, subsequent handlers for that event will not be called:

```typescript
// Handler 1 - runs first
omp.on("OnPlayerCommandText", (event) => {
  if (event.cmdtext === "/admin") {
    return false; // Stops here, Handler 2 won't run
  }
});

// Handler 2 - only runs if Handler 1 didn't return false
omp.on("OnPlayerCommandText", (event) => {
  console.log("Processing command...");
});
```

---

## Events Reference

### Bridge Events

#### OnBridgeInit

Fired when the Pawn bridge filterscript has initialized and is ready to communicate.

| Property | Type | Description |
|----------|------|-------------|
| *(none)* | - | Empty event payload |

**Returns**: `void`

```typescript
omp.on("OnBridgeInit", () => {
  console.log("Bridge is ready!");
  // Safe to start game logic here
});
```

#### OnFilterScriptExit

Fired when the filterscript is unloading (server shutdown or script reload).

| Property | Type | Description |
|----------|------|-------------|
| *(none)* | - | Empty event payload |

**Returns**: `void`

```typescript
omp.on("OnFilterScriptExit", () => {
  console.log("Server shutting down, cleaning up...");
});
```

---

### Player Events

#### OnPlayerConnect

Fired when a player connects to the server.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID assigned to the player |
| `name` | `string` | The player's nickname |
| `ip` | `string` | The player's IP address |

**Returns**: `void | boolean` - Return `false` to kick the player

```typescript
omp.on("OnPlayerConnect", async (event) => {
  console.log(`${event.name} connected from ${event.ip}`);

  await omp.player.sendMessage(
    event.playerid,
    0xFFFFFFFF,
    `Welcome, ${event.name}!`
  );

  await omp.player.giveMoney(event.playerid, 5000);
});
```

#### OnPlayerDisconnect

Fired when a player disconnects from the server.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the disconnecting player |
| `reason` | `DisconnectReason` | The reason for disconnection |

**DisconnectReason Enum**:
| Value | Name | Description |
|-------|------|-------------|
| `0` | `Timeout` | Connection timed out |
| `1` | `Quit` | Player quit normally (ESC) |
| `2` | `Kick` | Player was kicked/banned |

**Returns**: `void`

```typescript
import { DisconnectReason } from "./types/events";

omp.on("OnPlayerDisconnect", (event) => {
  const reasons = ["timed out", "quit", "was kicked"];
  console.log(`Player ${event.playerid} ${reasons[event.reason]}`);
});
```

#### OnPlayerSpawn

Fired when a player spawns into the game world.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the spawning player |

**Returns**: `void | boolean` - Return `false` to prevent spawn

```typescript
omp.on("OnPlayerSpawn", async (event) => {
  // Give starter kit
  await omp.player.setHealth(event.playerid, 100);
  await omp.player.setArmour(event.playerid, 50);
  await omp.player.giveWeapon(event.playerid, 24, 100); // Deagle
});
```

#### OnPlayerDeath

Fired when a player dies.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player who died |
| `killerid` | `number` | The ID of the killer (65535 if none) |
| `reason` | `number` | Weapon ID or death reason |

**Returns**: `void`

```typescript
const INVALID_PLAYER_ID = 65535;

omp.on("OnPlayerDeath", async (event) => {
  if (event.killerid !== INVALID_PLAYER_ID) {
    // Player was killed by another player
    await omp.player.giveMoney(event.killerid, 1000);
    await omp.player.sendMessage(
      event.killerid,
      0x00FF00FF,
      "+$1000 for the kill!"
    );
  } else {
    // Player died (suicide, fall, drown, etc.)
    console.log(`Player ${event.playerid} died (reason: ${event.reason})`);
  }
});
```

#### OnPlayerText

Fired when a player sends a chat message.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `text` | `string` | The chat message content |

**Returns**: `void | boolean` - Return `false` to block the message

```typescript
omp.on("OnPlayerText", (event) => {
  // Block messages containing profanity
  if (containsProfanity(event.text)) {
    omp.player.sendMessage(
      event.playerid,
      0xFF0000FF,
      "Please keep chat clean!"
    );
    return false; // Block the message
  }

  return true; // Allow the message
});
```

#### OnPlayerCommandText

Fired when a player enters a command (text starting with `/`).

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `cmdtext` | `string` | The full command text including `/` |

**Returns**: `void | boolean` - Return `false` if command was handled

```typescript
omp.on("OnPlayerCommandText", async (event) => {
  const [cmd, ...args] = event.cmdtext.split(" ");

  switch (cmd.toLowerCase()) {
    case "/help":
      await omp.player.sendMessage(
        event.playerid,
        0xFFFF00FF,
        "Commands: /help, /heal, /pos"
      );
      return false;

    case "/heal":
      await omp.player.setHealth(event.playerid, 100);
      return false;

    case "/pos":
      const x = parseFloat(args[0]);
      const y = parseFloat(args[1]);
      const z = parseFloat(args[2]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        await omp.player.setPosition(event.playerid, x, y, z);
        return false;
      }
      await omp.player.sendMessage(
        event.playerid,
        0xFF0000FF,
        "Usage: /pos <x> <y> <z>"
      );
      return false;

    default:
      return true; // Unknown command - let Pawn handle it
  }
});
```

#### OnPlayerStateChange

Fired when a player's state changes.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `newstate` | `PlayerState` | The new state |
| `oldstate` | `PlayerState` | The previous state |

**PlayerState Enum**:
| Value | Name | Description |
|-------|------|-------------|
| `0` | `None` | Empty (not used) |
| `1` | `OnFoot` | Walking/running |
| `2` | `Driver` | Driving a vehicle |
| `3` | `Passenger` | Passenger in vehicle |
| `4` | `ExitVehicle` | Exiting a vehicle |
| `5` | `EnterVehicleDriver` | Entering as driver |
| `6` | `EnterVehiclePassenger` | Entering as passenger |
| `7` | `Wasted` | Dead/wasted |
| `8` | `Spawned` | Spawned |
| `9` | `Spectating` | In spectator mode |

**Returns**: `void`

```typescript
import { PlayerState } from "./types/events";

omp.on("OnPlayerStateChange", (event) => {
  if (event.newstate === PlayerState.Driver) {
    console.log(`Player ${event.playerid} is now driving`);
  } else if (event.newstate === PlayerState.OnFoot && event.oldstate === PlayerState.Driver) {
    console.log(`Player ${event.playerid} exited their vehicle`);
  }
});
```

#### OnPlayerEnterVehicle

Fired when a player starts entering a vehicle (animation begins).

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `vehicleid` | `number` | The ID of the vehicle |
| `ispassenger` | `number` | 1 if entering as passenger, 0 if as driver |

**Returns**: `void | boolean` - Return `false` to prevent entry

```typescript
omp.on("OnPlayerEnterVehicle", async (event) => {
  if (event.ispassenger === 0) {
    // Entering as driver
    console.log(`Player ${event.playerid} entering vehicle ${event.vehicleid} as driver`);
  }
});
```

#### OnPlayerExitVehicle

Fired when a player starts exiting a vehicle (animation begins).

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `vehicleid` | `number` | The ID of the vehicle |

**Returns**: `void`

```typescript
omp.on("OnPlayerExitVehicle", (event) => {
  console.log(`Player ${event.playerid} exiting vehicle ${event.vehicleid}`);
});
```

#### OnPlayerTakeDamage

Fired when a player takes damage.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the damaged player |
| `issuerid` | `number` | The ID of the attacker (65535 if none) |
| `amount` | `number` | The amount of damage taken |
| `weaponid` | `number` | The weapon/reason for damage |
| `bodypart` | `number` | The body part hit |

**Body Parts**:
| Value | Part |
|-------|------|
| `3` | Torso |
| `4` | Groin |
| `5` | Left arm |
| `6` | Right arm |
| `7` | Left leg |
| `8` | Right leg |
| `9` | Head |

**Returns**: `void`

```typescript
const INVALID_PLAYER_ID = 65535;

omp.on("OnPlayerTakeDamage", (event) => {
  if (event.issuerid !== INVALID_PLAYER_ID) {
    console.log(
      `Player ${event.playerid} took ${event.amount.toFixed(1)} damage ` +
      `from player ${event.issuerid} (weapon: ${event.weaponid})`
    );
  }
});
```

#### OnPlayerGiveDamage

Fired when a player deals damage to another player.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the attacking player |
| `damagedid` | `number` | The ID of the damaged player |
| `amount` | `number` | The amount of damage dealt |
| `weaponid` | `number` | The weapon used |
| `bodypart` | `number` | The body part hit |

**Returns**: `void`

```typescript
omp.on("OnPlayerGiveDamage", (event) => {
  if (event.bodypart === 9) { // Head
    console.log(`Player ${event.playerid} got a headshot!`);
  }
});
```

#### OnPlayerClickMap

Fired when a player clicks on the map (via pause menu).

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `x` | `number` | X coordinate of click |
| `y` | `number` | Y coordinate of click |
| `z` | `number` | Z coordinate of click |

**Returns**: `void`

```typescript
omp.on("OnPlayerClickMap", async (event) => {
  // Teleport player to clicked location (admin feature)
  await omp.player.setPosition(event.playerid, event.x, event.y, event.z);
});
```

#### OnPlayerRequestClass

Fired when a player browses classes in class selection.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `classid` | `number` | The ID of the current class |

**Returns**: `void | boolean` - Return `false` to deny the class

```typescript
omp.on("OnPlayerRequestClass", async (event) => {
  // Show class info
  await omp.player.gameText(
    event.playerid,
    `~y~Class ${event.classid}`,
    1000,
    3
  );
});
```

#### OnPlayerRequestSpawn

Fired when a player presses spawn button in class selection.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |

**Returns**: `void | boolean` - Return `false` to deny spawn

```typescript
omp.on("OnPlayerRequestSpawn", async (event) => {
  // Check if player is logged in before allowing spawn
  if (!isPlayerLoggedIn(event.playerid)) {
    await omp.player.sendMessage(
      event.playerid,
      0xFF0000FF,
      "Please login first!"
    );
    return false; // Deny spawn
  }
  return true; // Allow spawn
});
```

---

### Vehicle Events

#### OnVehicleSpawn

Fired when a vehicle spawns or respawns.

| Property | Type | Description |
|----------|------|-------------|
| `vehicleid` | `number` | The ID of the vehicle |

**Returns**: `void`

```typescript
omp.on("OnVehicleSpawn", (event) => {
  console.log(`Vehicle ${event.vehicleid} spawned`);
});
```

#### OnVehicleDeath

Fired when a vehicle is destroyed.

| Property | Type | Description |
|----------|------|-------------|
| `vehicleid` | `number` | The ID of the destroyed vehicle |
| `killerid` | `number` | The ID of the player who destroyed it (if any) |

**Returns**: `void`

```typescript
omp.on("OnVehicleDeath", (event) => {
  console.log(`Vehicle ${event.vehicleid} destroyed`);
});
```

---

### Dialog Events

#### OnDialogResponse

Fired when a player responds to a dialog.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |
| `dialogid` | `number` | The ID of the dialog |
| `response` | `number` | 1 for primary button, 0 for secondary/cancel |
| `listitem` | `number` | Index of selected list item (-1 if not a list) |
| `inputtext` | `string` | Text entered (input dialogs) or selected item text |

**Returns**: `void | boolean` - Return `false` to mark as handled

```typescript
const DIALOG_LOGIN = 1;
const DIALOG_REGISTER = 2;

omp.on("OnDialogResponse", async (event) => {
  if (event.dialogid === DIALOG_LOGIN) {
    if (event.response === 1) {
      // Player clicked "Login"
      const password = event.inputtext;
      if (await verifyPassword(event.playerid, password)) {
        await omp.player.sendMessage(
          event.playerid,
          0x00FF00FF,
          "Login successful!"
        );
      } else {
        await omp.player.showDialog(event.playerid, DIALOG_LOGIN, {
          style: DialogStyle.Password,
          title: "Login",
          body: "Incorrect password. Try again:",
          button1: "Login",
          button2: "Cancel",
        });
      }
    } else {
      // Player clicked "Cancel" or pressed ESC
      await omp.player.kick(event.playerid);
    }
    return false;
  }
});
```

---

### Checkpoint Events

#### OnPlayerEnterCheckpoint

Fired when a player enters their active checkpoint.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |

**Returns**: `void`

```typescript
omp.on("OnPlayerEnterCheckpoint", async (event) => {
  await omp.player.disableCheckpoint(event.playerid);
  await omp.player.sendMessage(
    event.playerid,
    0x00FF00FF,
    "Checkpoint reached!"
  );
});
```

#### OnPlayerLeaveCheckpoint

Fired when a player leaves their active checkpoint.

| Property | Type | Description |
|----------|------|-------------|
| `playerid` | `number` | The ID of the player |

**Returns**: `void`

```typescript
omp.on("OnPlayerLeaveCheckpoint", (event) => {
  console.log(`Player ${event.playerid} left the checkpoint`);
});
```

---

## Type Imports

Import event types for type-safe handlers:

```typescript
import {
  PlayerConnectEvent,
  PlayerDisconnectEvent,
  PlayerSpawnEvent,
  PlayerDeathEvent,
  PlayerTextEvent,
  PlayerCommandTextEvent,
  PlayerStateChangeEvent,
  PlayerEnterVehicleEvent,
  PlayerExitVehicleEvent,
  PlayerTakeDamageEvent,
  PlayerGiveDamageEvent,
  PlayerClickMapEvent,
  PlayerEnterCheckpointEvent,
  PlayerLeaveCheckpointEvent,
  PlayerRequestClassEvent,
  PlayerRequestSpawnEvent,
  VehicleSpawnEvent,
  VehicleDeathEvent,
  DialogResponseEvent,
  BridgeInitEvent,
  DisconnectReason,
  PlayerState,
} from "./types/events";
```
