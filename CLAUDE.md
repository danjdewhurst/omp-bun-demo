# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an open.mp (Open Multiplayer) game server for San Andreas Multiplayer. The server runs as a containerized 32-bit Linux binary with a hybrid Pawn/TypeScript architecture - game events are forwarded from Pawn to a Bun TypeScript runtime via Redis pub/sub.

## Server Management

All commands run from the project root:

```bash
./server.sh start      # Start server (Redis + omp-server + Bun)
./server.sh stop       # Stop server
./server.sh restart    # Restart server
./server.sh rebuild    # Rebuild Docker image and start
./server.sh logs       # Follow server logs
./server.sh status     # Show container status
./server.sh attach     # Attach to server console (detach: Ctrl+P, Ctrl+Q)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Environment                        │
│  ┌──────────────┐    Redis    ┌──────────────────────────┐  │
│  │  omp-server  │◄───────────►│     Bun Runtime          │  │
│  │              │             │                          │  │
│  │  bridge.pwn  │  omp:events │  bun-bridge/src/         │  │
│  │  (Redis)     │────────────►│  (TypeScript gamemode)   │  │
│  │              │             │                          │  │
│  │              │◄────────────│                          │  │
│  │              │ omp:commands│                          │  │
│  └──────────────┘             └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Runtime Components
- `omp-server` - Main server binary (32-bit Linux ELF)
- `components/*.so` - Plugin modules (Pawn VM, networking, vehicles, NPCs, etc.)
- `plugins/redis.so` - pawn-redis plugin for Redis communication
- `bun-bridge/` - TypeScript gamemode running on Bun
- `config.json` - Server configuration (port 7777, max 50 players)

### Redis Channels
- `omp:events` - Game events from Pawn to TypeScript (player connect, death, commands, etc.)
- `omp:commands` - Native function calls from TypeScript to Pawn
- `omp:responses` - Command responses from Pawn to TypeScript

### Key Files
- `filterscripts/bridge.pwn` - Pawn filterscript that forwards events to Redis
- `bun-bridge/src/index.ts` - Main TypeScript entry point with event handlers
- `bun-bridge/src/api/OpenMP.ts` - TypeScript API wrapper
- `bun-bridge/src/server/BridgeServer.ts` - Redis pub/sub client

## TypeScript Gamemode Development

Game logic is written in TypeScript at `bun-bridge/src/index.ts`:

```typescript
import { OpenMP } from "./api/OpenMP";

const omp = new OpenMP();

omp.on("OnPlayerConnect", async (event) => {
  await omp.player.sendMessage(event.playerid, 0x00FF00FF, `Welcome, ${event.name}!`);
});

omp.on("OnPlayerCommandText", async ({ playerid, cmdtext }) => {
  if (cmdtext === "/heal") {
    await omp.player.setHealth(playerid, 100);
    return false; // Command handled
  }
  return true; // Let Pawn handle it
});

await omp.start();
```

### Available APIs
- `omp.player.*` - Player functions (sendMessage, setHealth, giveWeapon, etc.)
- `omp.vehicle.*` - Vehicle functions (create, destroy, setPosition, changeColor, repair, etc.)

### Hot Reloading
The `bun-bridge/src/` directory is mounted as a volume. Changes to TypeScript files take effect on container restart.

## Pawn Scripts

### Compiling
Filterscripts are auto-compiled on container start via `start.sh`. To compile manually:

```bash
# From qawno directory
./pawncc ../filterscripts/bridge.pwn -o../filterscripts/bridge.amx -i./include
```

### Pawn Scripts Structure
- `gamemodes/` - Base gamemode (currently gungame, handles spawning/classes)
- `filterscripts/bridge.pwn` - IPC bridge to TypeScript (do not modify unless extending events)
- `filterscripts/` - Other auxiliary scripts

## Configuration

Server config in `config.json`:
```json
"pawn": {
    "legacy_plugins": ["redis"],
    "main_scripts": ["gungame 1"],
    "side_scripts": ["filterscripts/bridge"]
}
```

Note: `side_scripts` requires the `filterscripts/` prefix in open.mp.

## Pawn Conventions

- Global variables prefixed with `g` (e.g., `gPlayerStatus`)
- Enums use `e_` prefix (e.g., `e_STATUS`)
- Use tagged types for type safety (`WEAPON:`, `Text:`, `bool:`)
- Include `<open.mp>` as the main header (provides full API)
- For large local arrays, use `#pragma dynamic` to increase stack size

## pawn-redis Notes

- Subscribe callbacks receive TWO parameters: `callback(channel[], data[])`
- Command IDs sent from TypeScript must be numeric (not hex strings) for Pawn parsing
