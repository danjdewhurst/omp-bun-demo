/**
 * Bun IPC Bridge - Example Gamemode
 *
 * This file demonstrates how to write game logic in TypeScript.
 * Replace this with your own gamemode implementation.
 */

import { OpenMP } from "./api/OpenMP";
import { DialogStyle } from "./api/Player";

// Colors (RGBA format)
const Colors = {
  White: 0xffffffff,
  Green: 0x00ff00ff,
  Red: 0xff0000ff,
  Yellow: 0xffff00ff,
  Blue: 0x0000ffff,
  Orange: 0xff8000ff,
} as const;

// Create OpenMP instance (connects to Redis)
const omp = new OpenMP();

// Track connected players
const players = new Map<
  number,
  {
    name: string;
    ip: string;
    connectedAt: number;
  }
>();

// Track demo vehicles
const demoVehicles: number[] = [];

// Vehicle models for the demo (sports cars)
const VehicleModels = {
  Infernus: 411,
  Turismo: 451,
  Cheetah: 415,
  Banshee: 429,
  SuperGT: 506,
} as const;

// Demo spawn location (Los Santos airport area)
const DemoLocation = { x: 1529.0, y: -1675.0, z: 13.5 };

/**
 * Vehicle Demo - Tests the bun-bridge by creating and manipulating vehicles
 */
async function runVehicleDemo() {
  console.log("[Demo] Starting vehicle demo in 5 seconds...");
  await sleep(5000);

  console.log("[Demo] === Vehicle Demo Started ===");

  // Step 1: Create 5 vehicles in a circle formation
  console.log("[Demo] Creating 5 vehicles in a circle...");
  const models = Object.values(VehicleModels);
  const radius = 10;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * 2 * Math.PI;
    const x = DemoLocation.x + Math.cos(angle) * radius;
    const y = DemoLocation.y + Math.sin(angle) * radius;
    const rotation = (angle * 180) / Math.PI + 90; // Face outward

    const vehicleid = await omp.vehicle.create({
      modelid: models[i],
      position: { x, y, z: DemoLocation.z },
      rotation,
      color1: i, // Different colors
      color2: 0,
    });

    demoVehicles.push(vehicleid);
    console.log(`[Demo] Created ${Object.keys(VehicleModels)[i]} (ID: ${vehicleid})`);
  }

  await sleep(2000);

  // Step 2: Change colors in a wave pattern
  console.log("[Demo] Changing vehicle colors...");
  for (let i = 0; i < demoVehicles.length; i++) {
    await omp.vehicle.changeColor(demoVehicles[i], 3 + i, 1); // Different colors
    await sleep(300);
  }

  await sleep(2000);

  // Step 3: Damage some vehicles, then repair them
  console.log("[Demo] Damaging vehicles...");
  for (const vehicleid of demoVehicles) {
    await omp.vehicle.setHealth(vehicleid, 300); // Low health (smoking)
  }

  await sleep(3000);

  console.log("[Demo] Repairing all vehicles...");
  for (const vehicleid of demoVehicles) {
    await omp.vehicle.repair(vehicleid);
    await sleep(200);
  }

  await sleep(2000);

  // Step 4: Rotate vehicles to face center
  console.log("[Demo] Rotating vehicles to face center...");
  for (let i = 0; i < demoVehicles.length; i++) {
    const angle = (i / 5) * 2 * Math.PI;
    const rotation = (angle * 180) / Math.PI - 90; // Face inward
    await omp.vehicle.setZAngle(demoVehicles[i], rotation);
  }

  await sleep(2000);

  // Step 5: Final color change to uniform color
  console.log("[Demo] Setting final uniform color...");
  for (const vehicleid of demoVehicles) {
    await omp.vehicle.changeColor(vehicleid, 6, 6); // Uniform color
  }

  console.log("[Demo] === Vehicle Demo Complete ===");
  console.log(`[Demo] Created ${demoVehicles.length} vehicles at LS Airport (${DemoLocation.x}, ${DemoLocation.y})`);
  console.log("[Demo] Connect to the server to see them!");

  // Run benchmarks after demo
  await sleep(1000);
  await omp.benchmark.runAll(100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Event handlers
omp.on("OnPlayerConnect", async (event) => {
  console.log(`[Game] Player ${event.name} (ID: ${event.playerid}) connected from ${event.ip}`);

  players.set(event.playerid, {
    name: event.name,
    ip: event.ip,
    connectedAt: Date.now(),
  });

  // Send welcome messages
  await omp.player.sendMessage(
    event.playerid,
    Colors.Green,
    "=========================================",
  );
  await omp.player.sendMessage(
    event.playerid,
    Colors.White,
    `Welcome to the server, ${event.name}!`,
  );
  await omp.player.sendMessage(
    event.playerid,
    Colors.Yellow,
    "This server uses TypeScript for game logic.",
  );
  await omp.player.sendMessage(
    event.playerid,
    Colors.Green,
    "=========================================",
  );

  // Give starting money
  await omp.player.giveMoney(event.playerid, 5000);
});

omp.on("OnPlayerDisconnect", (event) => {
  const player = players.get(event.playerid);
  if (player) {
    const duration = Math.floor((Date.now() - player.connectedAt) / 1000);
    console.log(
      `[Game] Player ${player.name} disconnected (reason: ${event.reason}, played: ${duration}s)`,
    );
    players.delete(event.playerid);
  }
});

omp.on("OnPlayerSpawn", async (event) => {
  console.log(`[Game] Player ${event.playerid} spawned`);

  // Give weapons on spawn
  await omp.player.giveWeapon(event.playerid, 24, 100); // Deagle
  await omp.player.giveWeapon(event.playerid, 31, 500); // M4
  await omp.player.setHealth(event.playerid, 100);
  await omp.player.setArmour(event.playerid, 100);

  await omp.player.gameText(event.playerid, "~g~Spawned!", 3000, 3);
});

omp.on("OnPlayerDeath", async (event) => {
  const victim = players.get(event.playerid);
  const killer = players.get(event.killerid);

  if (killer && victim) {
    console.log(`[Game] ${killer.name} killed ${victim.name} (weapon: ${event.reason})`);
    await omp.player.giveMoney(event.killerid, 1000);
    await omp.player.sendMessage(event.killerid, Colors.Green, `+$1000 for killing ${victim.name}`);
  } else if (victim) {
    console.log(`[Game] ${victim.name} died (reason: ${event.reason})`);
  }
});

omp.on("OnPlayerText", (event) => {
  const player = players.get(event.playerid);
  console.log(`[Chat] ${player?.name ?? event.playerid}: ${event.text}`);
  return true; // Allow chat
});

omp.on("OnPlayerCommandText", async (event) => {
  const player = players.get(event.playerid);
  const [cmd, ...args] = event.cmdtext.split(" ");

  console.log(`[Command] ${player?.name ?? event.playerid}: ${event.cmdtext}`);

  switch (cmd.toLowerCase()) {
    case "/help": {
      await omp.player.showDialog(event.playerid, 1, {
        style: DialogStyle.MessageBox,
        title: "Help",
        body: "Available commands:\n/help - Show this dialog\n/heal - Restore health\n/armour - Restore armour\n/car [model] - Spawn a vehicle\n/benchmark [n] - Run IPC benchmarks",
        button1: "Close",
      });
      return false;
    }

    case "/heal": {
      await omp.player.setHealth(event.playerid, 100);
      await omp.player.sendMessage(event.playerid, Colors.Green, "Health restored!");
      return false;
    }

    case "/armour": {
      await omp.player.setArmour(event.playerid, 100);
      await omp.player.sendMessage(event.playerid, Colors.Green, "Armour restored!");
      return false;
    }

    case "/car": {
      const modelid = parseInt(args[0], 10) || 411; // Infernus default
      if (modelid < 400 || modelid > 611) {
        await omp.player.sendMessage(event.playerid, Colors.Red, "Invalid vehicle model (400-611)");
        return false;
      }

      // Note: We'd need GetPlayerPos to spawn at player location
      // For now, spawn at a fixed location
      const vehicleid = await omp.vehicle.create({
        modelid,
        position: { x: 0, y: 0, z: 5 },
        rotation: 0,
        color1: -1,
        color2: -1,
      });

      await omp.player.sendMessage(
        event.playerid,
        Colors.Yellow,
        `Spawned vehicle ID: ${vehicleid}`,
      );
      return false;
    }

    case "/benchmark": {
      const iterations = parseInt(args[0], 10) || 100;
      await omp.player.sendMessage(event.playerid, Colors.Yellow, `Running benchmarks (${iterations} iterations)...`);

      const results = await omp.benchmark.runAll(iterations);

      // Send results to player
      for (const result of results) {
        await omp.player.sendMessage(
          event.playerid,
          Colors.White,
          `${result.name}: avg=${result.avgMs.toFixed(2)}ms, p95=${result.p95Ms.toFixed(2)}ms, ${result.opsPerSecond.toFixed(0)} ops/s`,
        );
      }

      await omp.player.sendMessage(event.playerid, Colors.Green, "Benchmarks complete! See console for details.");
      return false;
    }

    default:
      // Unknown command - let Pawn handle it
      return true;
  }
});

omp.on("OnDialogResponse", async (event) => {
  console.log(
    `[Dialog] Player ${event.playerid} responded to dialog ${event.dialogid}: response=${event.response}, listitem=${event.listitem}, input="${event.inputtext}"`,
  );
  return false;
});

omp.on("OnPlayerTakeDamage", (event) => {
  if (event.issuerid !== 65535) {
    // INVALID_PLAYER_ID
    const attacker = players.get(event.issuerid);
    const victim = players.get(event.playerid);
    console.log(
      `[Damage] ${attacker?.name ?? event.issuerid} hit ${victim?.name ?? event.playerid} for ${event.amount.toFixed(1)} damage (weapon: ${event.weaponid})`,
    );
  }
});

// Start the bridge
async function main() {
  console.log("[Bridge] Starting Bun IPC Bridge (Redis)...");

  await omp.start();
  console.log("[Bridge] Connected to Redis! Ready to handle events.");
}

// Wait for Pawn bridge to be ready before starting demo
omp.on("OnBridgeInit", () => {
  console.log("[Bridge] Pawn bridge is ready!");

  // Run the vehicle demo
  runVehicleDemo().catch((error) => {
    console.error("[Demo] Error:", error);
  });
});

main().catch((error) => {
  console.error("[Bridge] Fatal error:", error);
  process.exit(1);
});
