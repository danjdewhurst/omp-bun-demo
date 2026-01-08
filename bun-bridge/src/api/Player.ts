import type { BridgeServer } from "../server/BridgeServer";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export enum DialogStyle {
  MessageBox = 0,
  Input = 1,
  List = 2,
  Password = 3,
  Tablist = 4,
  TablistHeaders = 5,
}

export interface DialogOptions {
  style: DialogStyle;
  title: string;
  body: string;
  button1: string;
  button2?: string;
}

export class PlayerAPI {
  constructor(private server: BridgeServer) {}

  async sendMessage(playerid: number, color: number, message: string): Promise<number> {
    return this.server.sendCommand("SendClientMessage", [playerid, color, message]);
  }

  sendMessageSync(playerid: number, color: number, message: string): void {
    this.server.sendCommandNoWait("SendClientMessage", [playerid, color, message]);
  }

  async sendMessageToAll(color: number, message: string): Promise<number> {
    return this.server.sendCommand("SendClientMessageToAll", [color, message]);
  }

  async gameText(playerid: number, text: string, time: number, style: number): Promise<number> {
    return this.server.sendCommand("GameTextForPlayer", [playerid, text, time, style]);
  }

  async setPosition(playerid: number, pos: Vector3): Promise<number> {
    return this.server.sendCommand("SetPlayerPos", [playerid, pos.x, pos.y, pos.z]);
  }

  async setHealth(playerid: number, health: number): Promise<number> {
    return this.server.sendCommand("SetPlayerHealth", [playerid, health]);
  }

  async setArmour(playerid: number, armour: number): Promise<number> {
    return this.server.sendCommand("SetPlayerArmour", [playerid, armour]);
  }

  async giveWeapon(playerid: number, weaponid: number, ammo: number): Promise<number> {
    return this.server.sendCommand("GivePlayerWeapon", [playerid, weaponid, ammo]);
  }

  async giveMoney(playerid: number, amount: number): Promise<number> {
    return this.server.sendCommand("GivePlayerMoney", [playerid, amount]);
  }

  async setScore(playerid: number, score: number): Promise<number> {
    return this.server.sendCommand("SetPlayerScore", [playerid, score]);
  }

  async setSkin(playerid: number, skinid: number): Promise<number> {
    return this.server.sendCommand("SetPlayerSkin", [playerid, skinid]);
  }

  async setInterior(playerid: number, interiorid: number): Promise<number> {
    return this.server.sendCommand("SetPlayerInterior", [playerid, interiorid]);
  }

  async setVirtualWorld(playerid: number, worldid: number): Promise<number> {
    return this.server.sendCommand("SetPlayerVirtualWorld", [playerid, worldid]);
  }

  async spawn(playerid: number): Promise<number> {
    return this.server.sendCommand("SpawnPlayer", [playerid]);
  }

  async kick(playerid: number): Promise<number> {
    return this.server.sendCommand("Kick", [playerid]);
  }

  async ban(playerid: number): Promise<number> {
    return this.server.sendCommand("Ban", [playerid]);
  }

  async showDialog(playerid: number, dialogid: number, options: DialogOptions): Promise<number> {
    return this.server.sendCommand("ShowPlayerDialog", [
      playerid,
      dialogid,
      options.style,
      options.title,
      options.body,
      options.button1,
      options.button2 ?? "",
    ]);
  }
}
