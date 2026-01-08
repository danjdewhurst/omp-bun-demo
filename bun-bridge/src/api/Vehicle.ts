import type { BridgeServer } from "../server/BridgeServer";
import type { Vector3 } from "./Player";

export interface VehicleCreateOptions {
  modelid: number;
  position: Vector3;
  rotation: number;
  color1: number;
  color2: number;
  respawnDelay?: number;
}

export class VehicleAPI {
  constructor(private server: BridgeServer) {}

  async create(options: VehicleCreateOptions): Promise<number> {
    return this.server.sendCommand("CreateVehicle", [
      options.modelid,
      options.position.x,
      options.position.y,
      options.position.z,
      options.rotation,
      options.color1,
      options.color2,
      options.respawnDelay ?? -1,
    ]);
  }

  async destroy(vehicleid: number): Promise<number> {
    return this.server.sendCommand("DestroyVehicle", [vehicleid]);
  }

  async setHealth(vehicleid: number, health: number): Promise<number> {
    return this.server.sendCommand("SetVehicleHealth", [vehicleid, health]);
  }

  async repair(vehicleid: number): Promise<number> {
    return this.server.sendCommand("RepairVehicle", [vehicleid]);
  }

  async setPosition(vehicleid: number, x: number, y: number, z: number): Promise<number> {
    return this.server.sendCommand("SetVehiclePos", [vehicleid, x, y, z]);
  }

  async setZAngle(vehicleid: number, angle: number): Promise<number> {
    return this.server.sendCommand("SetVehicleZAngle", [vehicleid, angle]);
  }

  async changeColor(vehicleid: number, color1: number, color2: number): Promise<number> {
    return this.server.sendCommand("ChangeVehicleColor", [vehicleid, color1, color2]);
  }

  async setVelocity(vehicleid: number, x: number, y: number, z: number): Promise<number> {
    return this.server.sendCommand("SetVehicleVelocity", [vehicleid, x, y, z]);
  }

  async addComponent(vehicleid: number, componentid: number): Promise<number> {
    return this.server.sendCommand("AddVehicleComponent", [vehicleid, componentid]);
  }
}
