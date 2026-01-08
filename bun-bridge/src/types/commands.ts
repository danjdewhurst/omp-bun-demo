/**
 * Type-safe command definitions for Pawn native functions.
 * Each command defines its argument types and return type.
 */

export interface CommandDefinitions {
  // Player commands
  SendClientMessage: {
    args: [playerid: number, color: number, message: string];
    returns: number;
  };
  SendClientMessageToAll: {
    args: [color: number, message: string];
    returns: number;
  };
  GameTextForPlayer: {
    args: [playerid: number, text: string, time: number, style: number];
    returns: number;
  };
  SetPlayerPos: {
    args: [playerid: number, x: number, y: number, z: number];
    returns: number;
  };
  SetPlayerHealth: {
    args: [playerid: number, health: number];
    returns: number;
  };
  SetPlayerArmour: {
    args: [playerid: number, armour: number];
    returns: number;
  };
  GivePlayerWeapon: {
    args: [playerid: number, weaponid: number, ammo: number];
    returns: number;
  };
  GivePlayerMoney: {
    args: [playerid: number, amount: number];
    returns: number;
  };
  SetPlayerScore: {
    args: [playerid: number, score: number];
    returns: number;
  };
  SetPlayerSkin: {
    args: [playerid: number, skinid: number];
    returns: number;
  };
  SetPlayerInterior: {
    args: [playerid: number, interiorid: number];
    returns: number;
  };
  SetPlayerVirtualWorld: {
    args: [playerid: number, worldid: number];
    returns: number;
  };
  SpawnPlayer: {
    args: [playerid: number];
    returns: number;
  };
  Kick: {
    args: [playerid: number];
    returns: number;
  };
  Ban: {
    args: [playerid: number];
    returns: number;
  };
  ShowPlayerDialog: {
    args: [
      playerid: number,
      dialogid: number,
      style: number,
      title: string,
      body: string,
      button1: string,
      button2: string,
    ];
    returns: number;
  };

  // Vehicle commands
  CreateVehicle: {
    args: [
      modelid: number,
      x: number,
      y: number,
      z: number,
      rotation: number,
      color1: number,
      color2: number,
      respawnDelay: number,
    ];
    returns: number;
  };
  DestroyVehicle: {
    args: [vehicleid: number];
    returns: number;
  };
  SetVehicleHealth: {
    args: [vehicleid: number, health: number];
    returns: number;
  };
  RepairVehicle: {
    args: [vehicleid: number];
    returns: number;
  };
  SetVehiclePos: {
    args: [vehicleid: number, x: number, y: number, z: number];
    returns: number;
  };
  SetVehicleZAngle: {
    args: [vehicleid: number, angle: number];
    returns: number;
  };
  ChangeVehicleColor: {
    args: [vehicleid: number, color1: number, color2: number];
    returns: number;
  };
  SetVehicleVelocity: {
    args: [vehicleid: number, x: number, y: number, z: number];
    returns: number;
  };
  AddVehicleComponent: {
    args: [vehicleid: number, componentid: number];
    returns: number;
  };

  // Benchmark commands
  Ping: {
    args: [];
    returns: number;
  };
  PingWithPayload: {
    args: [value: number];
    returns: number;
  };
}

export type CommandName = keyof CommandDefinitions;
export type CommandArgs<K extends CommandName> = CommandDefinitions[K]["args"];
export type CommandReturn<K extends CommandName> = CommandDefinitions[K]["returns"];
