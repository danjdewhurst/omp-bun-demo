// Event payload types for open.mp callbacks

export interface PlayerConnectEvent {
  playerid: number;
  name: string;
  ip: string;
}

export interface PlayerDisconnectEvent {
  playerid: number;
  reason: DisconnectReason;
}

export enum DisconnectReason {
  Timeout = 0,
  Quit = 1,
  Kick = 2,
}

export interface PlayerSpawnEvent {
  playerid: number;
}

export interface PlayerDeathEvent {
  playerid: number;
  killerid: number;
  reason: number;
}

export interface PlayerTextEvent {
  playerid: number;
  text: string;
}

export interface PlayerCommandTextEvent {
  playerid: number;
  cmdtext: string;
}

export interface PlayerStateChangeEvent {
  playerid: number;
  newstate: PlayerState;
  oldstate: PlayerState;
}

export enum PlayerState {
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

export interface PlayerEnterVehicleEvent {
  playerid: number;
  vehicleid: number;
  ispassenger: number;
}

export interface PlayerExitVehicleEvent {
  playerid: number;
  vehicleid: number;
}

export interface VehicleSpawnEvent {
  vehicleid: number;
}

export interface VehicleDeathEvent {
  vehicleid: number;
  killerid: number;
}

export interface DialogResponseEvent {
  playerid: number;
  dialogid: number;
  response: number;
  listitem: number;
  inputtext: string;
}

export interface PlayerTakeDamageEvent {
  playerid: number;
  issuerid: number;
  amount: number;
  weaponid: number;
  bodypart: number;
}

export interface PlayerGiveDamageEvent {
  playerid: number;
  damagedid: number;
  amount: number;
  weaponid: number;
  bodypart: number;
}

export interface PlayerClickMapEvent {
  playerid: number;
  x: number;
  y: number;
  z: number;
}

export interface PlayerEnterCheckpointEvent {
  playerid: number;
}

export interface PlayerLeaveCheckpointEvent {
  playerid: number;
}

export interface PlayerRequestClassEvent {
  playerid: number;
  classid: number;
}

export interface PlayerRequestSpawnEvent {
  playerid: number;
}

export interface BridgeInitEvent {
  // Empty - just signals the Pawn bridge is ready
}

// Event handler map type
export interface OpenMPEvents {
  OnBridgeInit: (event: BridgeInitEvent) => void | Promise<void>;
  OnPlayerConnect: (event: PlayerConnectEvent) => void | boolean | Promise<void | boolean>;
  OnPlayerDisconnect: (event: PlayerDisconnectEvent) => void | Promise<void>;
  OnPlayerSpawn: (event: PlayerSpawnEvent) => void | boolean | Promise<void | boolean>;
  OnPlayerDeath: (event: PlayerDeathEvent) => void | Promise<void>;
  OnPlayerText: (event: PlayerTextEvent) => void | boolean | Promise<void | boolean>;
  OnPlayerCommandText: (event: PlayerCommandTextEvent) => void | boolean | Promise<void | boolean>;
  OnPlayerStateChange: (event: PlayerStateChangeEvent) => void | Promise<void>;
  OnPlayerEnterVehicle: (
    event: PlayerEnterVehicleEvent,
  ) => void | boolean | Promise<void | boolean>;
  OnPlayerExitVehicle: (event: PlayerExitVehicleEvent) => void | Promise<void>;
  OnVehicleSpawn: (event: VehicleSpawnEvent) => void | Promise<void>;
  OnVehicleDeath: (event: VehicleDeathEvent) => void | Promise<void>;
  OnDialogResponse: (event: DialogResponseEvent) => void | boolean | Promise<void | boolean>;
  OnPlayerTakeDamage: (event: PlayerTakeDamageEvent) => void | Promise<void>;
  OnPlayerGiveDamage: (event: PlayerGiveDamageEvent) => void | Promise<void>;
  OnPlayerClickMap: (event: PlayerClickMapEvent) => void | Promise<void>;
  OnPlayerEnterCheckpoint: (event: PlayerEnterCheckpointEvent) => void | Promise<void>;
  OnPlayerLeaveCheckpoint: (event: PlayerLeaveCheckpointEvent) => void | Promise<void>;
  OnPlayerRequestClass: (
    event: PlayerRequestClassEvent,
  ) => void | boolean | Promise<void | boolean>;
  OnPlayerRequestSpawn: (
    event: PlayerRequestSpawnEvent,
  ) => void | boolean | Promise<void | boolean>;
  OnFilterScriptExit: (event: Record<string, never>) => void | Promise<void>;
}
