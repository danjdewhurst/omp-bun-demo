# Pawn Bridge Documentation

The Pawn bridge (`filterscripts/bridge.pwn`) provides bidirectional communication between the open.mp game server and the Bun TypeScript runtime via Redis pub/sub.

## Architecture Overview

```
┌──────────────────┐          Redis          ┌──────────────────┐
│    omp-server    │                         │   Bun Runtime    │
│                  │                         │                  │
│  ┌────────────┐  │    omp:events           │  ┌────────────┐  │
│  │ bridge.pwn │──┼─────────────────────────►  │ index.ts   │  │
│  │            │  │                         │  │            │  │
│  │            │◄─┼─────────────────────────┼──│            │  │
│  └────────────┘  │    omp:commands         │  └────────────┘  │
│                  │                         │                  │
│                  │◄────────────────────────┼──                │
│                  │    omp:responses        │                  │
└──────────────────┘                         └──────────────────┘
```

## Redis Connection

The bridge maintains two separate Redis connections:

1. **Publisher** (`gRedisPublisher`) - Sends events from Pawn to TypeScript
2. **Subscriber** (`gRedisSubscriber`) - Receives commands from TypeScript

### Configuration Constants

```pawn
#define REDIS_HOST "redis"
#define REDIS_PORT 6379
#define REDIS_AUTH ""
#define CHANNEL_EVENTS "omp:events"
#define CHANNEL_COMMANDS "omp:commands"
#define BRIDGE_MAX_MESSAGE_SIZE 2048
```

### Connection Initialization

Connection is established in `Bridge_Connect()` with a 2-second delay after filterscript load to allow Redis to start:

```pawn
public OnFilterScriptInit()
{
    // Delay connection to allow Redis to start
    SetTimer("Bridge_DelayedConnect", 2000, false);
    return 1;
}

stock Bridge_Connect()
{
    // Connect publisher for sending events
    new ret = Redis_Connect(REDIS_HOST, REDIS_PORT, REDIS_AUTH, gRedisPublisher);
    if (ret != 0)
    {
        printf("[Bridge] Failed to connect publisher to Redis: %d", ret);
        return 0;
    }

    // Subscribe to commands channel with callback
    ret = Redis_Subscribe(REDIS_HOST, REDIS_PORT, REDIS_AUTH, CHANNEL_COMMANDS, "Bridge_OnCommand", gRedisSubscriber);
    if (ret != 0)
    {
        printf("[Bridge] Failed to subscribe to commands: %d", ret);
        Redis_Disconnect(gRedisPublisher);
        return 0;
    }

    gBridgeConnected = true;
    Bridge_SendEvent("OnBridgeInit", "{}");
    return 1;
}
```

## Sending Events (Pawn to TypeScript)

### Bridge_SendEvent

Events are sent as JSON messages with a consistent structure:

```pawn
stock Bridge_SendEvent(const eventName[], const payload[])
{
    if (!gBridgeConnected) return 0;

    new message[BRIDGE_MAX_MESSAGE_SIZE];
    format(message, sizeof(message), "{\"e\":\"%s\",\"d\":%s,\"id\":%d,\"t\":%d}",
           eventName, payload, ++gMessageId, GetTickCount());

    Redis_Publish(gRedisPublisher, CHANNEL_EVENTS, message);
    return 1;
}
```

**Message Format:**
```json
{
    "e": "EventName",
    "d": { /* event data */ },
    "id": 123,
    "t": 1234567890
}
```

| Field | Description |
|-------|-------------|
| `e` | Event name (e.g., "OnPlayerConnect") |
| `d` | Event data payload as JSON object |
| `id` | Auto-incrementing message ID |
| `t` | Server tick count (timestamp) |

### Example: Forwarding OnPlayerConnect

```pawn
public OnPlayerConnect(playerid)
{
    new name[MAX_PLAYER_NAME], ip[16];
    GetPlayerName(playerid, name, sizeof(name));
    GetPlayerIp(playerid, ip, sizeof(ip));

    // Escape special characters for JSON
    new escaped_name[MAX_PLAYER_NAME * 2];
    Bridge_EscapeJSON(name, escaped_name, sizeof(escaped_name));

    new payload[256];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"name\":\"%s\",\"ip\":\"%s\"}",
           playerid, escaped_name, ip);
    Bridge_SendEvent("OnPlayerConnect", payload);

    return 1;
}
```

### JSON Escaping

Always use `Bridge_EscapeJSON` for user-provided strings to prevent JSON injection:

```pawn
stock Bridge_EscapeJSON(const input[], output[], maxlen)
```

This function escapes:
- `"` (double quote) -> `\"`
- `\` (backslash) -> `\\`
- newline -> `\n`
- carriage return -> `\r`
- tab -> `\t`

## Receiving Commands (TypeScript to Pawn)

### Bridge_OnCommand Callback

The callback signature requires exactly two parameters:

```pawn
forward Bridge_OnCommand(channel[], data[]);

public Bridge_OnCommand(channel[], data[])
{
    // Parse and execute command
    return 1;
}
```

**Important:** The pawn-redis plugin requires this exact signature (`channel[], data[]`). Using different parameter names or counts will cause the callback to fail silently.

### Command Message Format

Commands arrive as JSON:
```json
{
    "c": "CommandName",
    "a": [arg1, arg2, ...],
    "id": 123
}
```

| Field | Description |
|-------|-------------|
| `c` | Command name (e.g., "SendClientMessage") |
| `a` | Arguments array |
| `id` | Message ID for response correlation |

### Command Parsing

The `Bridge_OnCommand` function parses the JSON manually:

```pawn
public Bridge_OnCommand(channel[], data[])
{
    new command[64];
    new args[BRIDGE_MAX_MESSAGE_SIZE];
    new msgId[16];

    // Extract "c" field (command name)
    new cPos = strfind(data, "\"c\":\"");
    if (cPos != -1)
    {
        cPos += 5;
        new endPos = strfind(data, "\"", false, cPos);
        if (endPos != -1)
        {
            strmid(command, data, cPos, endPos);
        }
    }

    // Extract "id" field
    new idPos = strfind(data, "\"id\":");
    if (idPos != -1)
    {
        idPos += 5;
        new endPos = idPos;
        while (data[endPos] >= '0' && data[endPos] <= '9') endPos++;
        strmid(msgId, data, idPos, endPos);
    }

    // Extract "a" field (arguments array)
    new aPos = strfind(data, "\"a\":[");
    if (aPos != -1)
    {
        // Parse nested array with depth tracking
        aPos += 4;
        new depth = 0, endPos = aPos;
        for (new i = aPos; data[i] != 0; i++)
        {
            if (data[i] == '[') depth++;
            else if (data[i] == ']')
            {
                depth--;
                if (depth == 0)
                {
                    endPos = i + 1;
                    break;
                }
            }
        }
        strmid(args, data, aPos, endPos);
    }

    // Execute and send response
    new result = Bridge_ExecuteCommand(command, args);

    new response[256];
    format(response, sizeof(response), "{\"ok\":true,\"r\":%d,\"id\":%s}", result, msgId);
    Redis_Publish(gRedisPublisher, "omp:responses", response);

    return 1;
}
```

## Argument Parsing Functions

### Bridge_ParseIntArg

Extracts an integer argument by index from a JSON array:

```pawn
stock Bridge_ParseIntArg(const args[], index)
```

**Usage:**
```pawn
// args = "[0, 255, \"hello\"]"
new playerid = Bridge_ParseIntArg(args, 0);  // Returns 0
new colour = Bridge_ParseIntArg(args, 1);    // Returns 255
```

**Implementation Details:**
- Tracks bracket depth to handle nested arrays/objects
- Skips commas and spaces between arguments
- Converts the extracted string to integer via `strval()`

### Bridge_ParseFloatArg

Extracts a float argument by index:

```pawn
stock Float:Bridge_ParseFloatArg(const args[], index)
```

**Usage:**
```pawn
// args = "[0, 100.5, 200.75, 15.0]"
new Float:x = Bridge_ParseFloatArg(args, 1);  // Returns 100.5
new Float:y = Bridge_ParseFloatArg(args, 2);  // Returns 200.75
```

### Bridge_ParseStringArg

Extracts a string argument by index:

```pawn
stock Bridge_ParseStringArg(const args[], index, output[], maxlen)
```

**Usage:**
```pawn
// args = "[0, 255, \"Hello World\"]"
new message[144];
Bridge_ParseStringArg(args, 2, message, sizeof(message));  // message = "Hello World"
```

**Implementation Details:**
- Handles escaped quotes within strings
- Tracks whether currently inside a quoted string
- Returns the string length

## Adding New Events

To forward a new game event to TypeScript:

### Step 1: Create the callback

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

### Step 2: Handle string data safely

For events with user-provided text, always escape:

```pawn
public OnPlayerEditObject(playerid, playerobject, objectid, response,
                          Float:fX, Float:fY, Float:fZ,
                          Float:fRotX, Float:fRotY, Float:fRotZ)
{
    new payload[256];
    format(payload, sizeof(payload),
           "{\"playerid\":%d,\"objectid\":%d,\"response\":%d,\"x\":%.4f,\"y\":%.4f,\"z\":%.4f}",
           playerid, objectid, response, fX, fY, fZ);
    Bridge_SendEvent("OnPlayerEditObject", payload);
    return 1;
}
```

## Adding New Commands

To add a new command that TypeScript can call:

### Step 1: Add to Bridge_ExecuteCommand

```pawn
stock Bridge_ExecuteCommand(const command[], const args[])
{
    // ... existing commands ...

    else if (!strcmp(command, "PutPlayerInVehicle"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new vehicleid = Bridge_ParseIntArg(args, 1);
        new seatid = Bridge_ParseIntArg(args, 2);
        return _:PutPlayerInVehicle(playerid, vehicleid, seatid);
    }
    else if (!strcmp(command, "SetPlayerFacingAngle"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new Float:angle = Bridge_ParseFloatArg(args, 1);
        return _:SetPlayerFacingAngle(playerid, angle);
    }
    else if (!strcmp(command, "PlaySoundForPlayer"))
    {
        new playerid = Bridge_ParseIntArg(args, 0);
        new soundid = Bridge_ParseIntArg(args, 1);
        new Float:x = Bridge_ParseFloatArg(args, 2);
        new Float:y = Bridge_ParseFloatArg(args, 3);
        new Float:z = Bridge_ParseFloatArg(args, 4);
        return _:PlayerPlaySound(playerid, soundid, x, y, z);
    }

    printf("[Bridge] Unknown command: %s", command);
    return 0;
}
```

### Step 2: Update TypeScript API (optional)

Add the corresponding method in `bun-bridge/src/api/OpenMP.ts`:

```typescript
async putPlayerInVehicle(playerid: number, vehicleid: number, seatid: number): Promise<number> {
    return this.bridge.call("PutPlayerInVehicle", [playerid, vehicleid, seatid]);
}
```

## Currently Supported Commands

### Player Commands
| Command | Arguments |
|---------|-----------|
| `SendClientMessage` | playerid, colour, message |
| `SendClientMessageToAll` | colour, message |
| `GameTextForPlayer` | playerid, text, time, style |
| `SetPlayerPos` | playerid, x, y, z |
| `SetPlayerHealth` | playerid, health |
| `SetPlayerArmour` | playerid, armour |
| `GivePlayerWeapon` | playerid, weaponid, ammo |
| `GivePlayerMoney` | playerid, amount |
| `SetPlayerScore` | playerid, score |
| `SetPlayerSkin` | playerid, skinid |
| `SetPlayerInterior` | playerid, interiorid |
| `SetPlayerVirtualWorld` | playerid, worldid |
| `SpawnPlayer` | playerid |
| `Kick` | playerid |
| `Ban` | playerid |
| `ShowPlayerDialog` | playerid, dialogid, style, title, body, button1, button2 |

### Vehicle Commands
| Command | Arguments |
|---------|-----------|
| `CreateVehicle` | modelid, x, y, z, angle, color1, color2, respawnDelay |
| `DestroyVehicle` | vehicleid |
| `SetVehicleHealth` | vehicleid, health |
| `RepairVehicle` | vehicleid |
| `SetVehiclePos` | vehicleid, x, y, z |
| `SetVehicleZAngle` | vehicleid, angle |
| `ChangeVehicleColor` | vehicleid, color1, color2 |
| `SetVehicleVelocity` | vehicleid, x, y, z |
| `AddVehicleComponent` | vehicleid, componentid |

### Utility Commands
| Command | Arguments |
|---------|-----------|
| `Ping` | (none) |
| `PingWithPayload` | value |

## Currently Forwarded Events

| Event | Data Fields |
|-------|-------------|
| `OnBridgeInit` | (empty) |
| `OnFilterScriptExit` | (empty) |
| `OnPlayerConnect` | playerid, name, ip |
| `OnPlayerDisconnect` | playerid, reason |
| `OnPlayerSpawn` | playerid |
| `OnPlayerDeath` | playerid, killerid, reason |
| `OnPlayerText` | playerid, text |
| `OnPlayerCommandText` | playerid, cmdtext |
| `OnPlayerStateChange` | playerid, newstate, oldstate |
| `OnPlayerEnterVehicle` | playerid, vehicleid, ispassenger |
| `OnPlayerExitVehicle` | playerid, vehicleid |
| `OnVehicleSpawn` | vehicleid |
| `OnVehicleDeath` | vehicleid, killerid |
| `OnDialogResponse` | playerid, dialogid, response, listitem, inputtext |
| `OnPlayerTakeDamage` | playerid, issuerid, amount, weaponid, bodypart |
| `OnPlayerGiveDamage` | playerid, damagedid, amount, weaponid, bodypart |
| `OnPlayerClickMap` | playerid, x, y, z |
| `OnPlayerEnterCheckpoint` | playerid |
| `OnPlayerLeaveCheckpoint` | playerid |
| `OnPlayerRequestClass` | playerid, classid |
| `OnPlayerRequestSpawn` | playerid |

## Important Notes

### Callback Signature

The Redis subscription callback **must** have exactly this signature:

```pawn
forward Bridge_OnCommand(channel[], data[]);
public Bridge_OnCommand(channel[], data[])
```

Using different parameter names or adding/removing parameters will cause the pawn-redis plugin to fail silently.

### Stack Size

The bridge uses `#pragma dynamic 8192` to increase stack size for handling large JSON buffers. If you add commands with larger payloads, you may need to increase this value.

### Type Casting

When calling native functions that return `bool:` or tagged types, cast the result to `_:` for the integer return value:

```pawn
return _:SetPlayerHealth(playerid, health);  // Cast bool to int
return _:GivePlayerWeapon(playerid, WEAPON:weaponid, ammo);
```

### Connection Timing

The bridge waits 2 seconds before connecting to Redis to ensure the Redis container is ready. This is handled by `Bridge_DelayedConnect`.

### Message Size Limit

The maximum message size is defined by `BRIDGE_MAX_MESSAGE_SIZE` (2048 bytes). For commands or events with larger payloads, increase this constant.

### Return Values

- Events return `1` to allow other filterscripts to process the callback
- `OnPlayerCommandText` returns `0` to let TypeScript handle commands first
- `OnDialogResponse` returns `0` to let TypeScript handle dialogs first
