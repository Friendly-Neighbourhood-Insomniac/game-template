import { createHiber3DApp } from "@hiber3d/web";
import { moduleFactory as webGPU } from "GameTemplate_webgpu";
import { moduleFactory as webGL } from "GameTemplate_webgl";

// Use a more flexible type import that works with stubs
export interface GunStateChangedEvent {
  ammo: number;
  hits: number;
}

export const { Hiber3D, useHiber3D } = createHiber3DApp({ webGPU, webGL });