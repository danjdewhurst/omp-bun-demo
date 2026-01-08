# open.mp + Bun TypeScript Bridge

A hybrid game server architecture for [open.mp](https://open.mp) (Open Multiplayer) that enables writing game logic in TypeScript while leveraging the stability of Pawn for core server functionality.

## Overview

This project demonstrates a novel approach to SA-MP/open.mp server development: game events are captured in Pawn and forwarded to a Bun TypeScript runtime via Redis pub/sub, allowing you to write modern, type-safe game logic while maintaining full compatibility with existing Pawn scripts.

```
┌──────────────────────────────────────────────────────────────────┐
│                      Docker Environment                          │
│                                                                  │
│  ┌──────────────────┐              ┌──────────────────────────┐  │
│  │                  │    Redis     │                          │  │
│  │    omp-server    │◄────────────►│      Bun Runtime         │  │
│  │                  │              │                          │  │
│  │  ┌────────────┐  │  omp:events  │  ┌────────────────────┐  │  │
│  │  │ bridge.pwn │  │─────────────►│  │  TypeScript Logic  │  │  │
│  │  │            │  │              │  │                    │  │  │
│  │  │   Pawn     │  │◄─────────────│  │  • Event handlers  │  │  │
│  │  │  Scripts   │  │ omp:commands │  │  • Game logic      │  │  │
│  │  └────────────┘  │              │  │  • Async/await     │  │  │
│  │                  │              │  └────────────────────┘  │  │
│  └──────────────────┘              └──────────────────────────┘  │
│           ▲                                                      │
│           │ UDP :7777                                            │
└───────────┼──────────────────────────────────────────────────────┘
            │
        Players
```

## Features

- **TypeScript Game Logic** — Write your gamemode in modern TypeScript with full async/await support
- **Type-Safe API** — Strongly typed player and vehicle APIs with IntelliSense support
- **Event-Driven** — Subscribe to game events like `OnPlayerConnect`, `OnPlayerDeath`, etc.
- **Hot Reload Ready** — TypeScript changes take effect on container restart
- **Pawn Compatibility** — Existing Pawn scripts continue to work alongside TypeScript
- **Dockerized** — One command to build and run everything

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd omp-bun-demo

# Start the server
./server.sh start

# View logs
./server.sh logs

# Stop the server
./server.sh stop
```

The server will be available on `localhost:7777`.

## Server Commands

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `./server.sh start`   | Start the server (Redis + omp-server + Bun) |
| `./server.sh stop`    | Stop all containers                         |
| `./server.sh restart` | Restart the server                          |
| `./server.sh rebuild` | Rebuild Docker image and start              |
| `./server.sh logs`    | Follow server logs                          |
| `./server.sh status`  | Show container status                       |
| `./server.sh attach`  | Attach to server console                    |

## Writing Game Logic

Game logic lives in `bun-bridge/src/index.ts`:

```typescript
import { OpenMP } from "./api/OpenMP";

const omp = new OpenMP();

// Handle player connections
omp.on("OnPlayerConnect", async (event) => {
  await omp.player.sendMessage(
    event.playerid,
    0x00ff00ff,
    `Welcome, ${event.name}!`
  );
  await omp.player.giveMoney(event.playerid, 5000);
});

// Handle commands
omp.on("OnPlayerCommandText", async ({ playerid, cmdtext }) => {
  if (cmdtext === "/heal") {
    await omp.player.setHealth(playerid, 100);
    return false; // Command handled
  }
  return true; // Let Pawn handle it
});

// Handle deaths
omp.on("OnPlayerDeath", async (event) => {
  if (event.killerid !== 65535) {
    await omp.player.giveMoney(event.killerid, 1000);
  }
});

await omp.start();
```

## Available APIs

### Player API (`omp.player.*`)

| Method                                    | Description         |
| ----------------------------------------- | ------------------- |
| `sendMessage(playerid, color, message)`   | Send a chat message |
| `setHealth(playerid, health)`             | Set player health   |
| `setArmour(playerid, armour)`             | Set player armour   |
| `giveWeapon(playerid, weaponid, ammo)`    | Give a weapon       |
| `giveMoney(playerid, amount)`             | Give money          |
| `setPosition(playerid, x, y, z)`          | Teleport player     |
| `showDialog(playerid, dialogid, options)` | Show a dialog       |
| `gameText(playerid, text, time, style)`   | Show game text      |

### Vehicle API (`omp.vehicle.*`)

| Method                                   | Description        |
| ---------------------------------------- | ------------------ |
| `create(options)`                        | Create a vehicle   |
| `destroy(vehicleid)`                     | Destroy a vehicle  |
| `setHealth(vehicleid, health)`           | Set vehicle health |
| `repair(vehicleid)`                      | Repair a vehicle   |
| `setPosition(vehicleid, x, y, z)`        | Move a vehicle     |
| `changeColor(vehicleid, color1, color2)` | Change colors      |

### Benchmark API (`omp.benchmark.*`)

| Method                      | Description                |
| --------------------------- | -------------------------- |
| `runAll(iterations)`        | Run all benchmarks         |
| `pingRoundTrip(iterations)` | Measure round-trip latency |

## In-Game Commands

| Command          | Description             |
| ---------------- | ----------------------- |
| `/help`          | Show available commands |
| `/heal`          | Restore health to 100   |
| `/armour`        | Restore armour to 100   |
| `/car [model]`   | Spawn a vehicle         |
| `/benchmark [n]` | Run IPC benchmarks      |

## Project Structure

```
omp-bun-demo/
├── bun-bridge/              # TypeScript gamemode
│   └── src/
│       ├── index.ts         # Main entry point
│       ├── api/             # Player, Vehicle APIs
│       ├── server/          # Redis bridge client
│       ├── types/           # TypeScript definitions
│       └── utils/           # Utilities (benchmarks)
├── filterscripts/
│   └── bridge.pwn           # Pawn IPC bridge
├── gamemodes/               # Base Pawn gamemode
├── components/              # open.mp components
├── plugins/                 # Pawn plugins (redis.so)
├── config.json              # Server configuration
├── docker-compose.yml       # Container orchestration
├── Dockerfile               # Server image
└── server.sh                # Management script
```

## Performance

See [benchmarks.md](benchmarks.md) for detailed performance measurements.

**Summary (Docker/emulated):**

- Round-trip latency: ~5ms
- Throughput: ~200 ops/sec

Native Linux deployment would yield better performance.

## Requirements

- Docker & Docker Compose
- SA-MP or open.mp client to connect

## Configuration

Server settings are in `config.json`:

```json
{
  "name": "open.mp server",
  "port": 7777,
  "max_players": 50,
  "pawn": {
    "legacy_plugins": ["redis"],
    "main_scripts": ["gungame 1"],
    "side_scripts": ["filterscripts/bridge"]
  }
}
```

## Development

### Adding New Commands

1. Add the command handler in `bridge.pwn`:

```pawn
else if (!strcmp(command, "MyCommand"))
{
    new arg = Bridge_ParseIntArg(args, 0);
    return MyNativeFunction(arg);
}
```

2. Add the type definition in `bun-bridge/src/types/commands.ts`:

```typescript
MyCommand: {
  args: [arg: number];
  returns: number;
};
```

3. Add the API method in the appropriate API class.

### Adding New Events

1. Forward the event in `bridge.pwn`:

```pawn
public OnMyEvent(playerid)
{
    new payload[64];
    format(payload, sizeof(payload), "{\"playerid\":%d}", playerid);
    Bridge_SendEvent("OnMyEvent", payload);
    return 1;
}
```

2. Add the type in `bun-bridge/src/types/events.ts`.

## License

MIT

## Acknowledgments

- [open.mp](https://open.mp) — The open multiplayer mod
- [pawn-redis](https://github.com/Southclaws/pawn-redis) — Redis plugin for Pawn
- [Bun](https://bun.sh) — Fast JavaScript runtime
