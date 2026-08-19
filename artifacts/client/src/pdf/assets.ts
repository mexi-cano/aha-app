import energyWheelUrl from "../../../../assets/aha-energy-wheel-recolored.png?url";
import logoUrl from "../../../../assets/its-logo.png?url";

import type { AhaPdfAssets } from "./aha-pdf";

async function loadAsset(url: string, label: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`The bundled ${label} image could not be loaded.`);
  return new Uint8Array(await response.arrayBuffer());
}

let assetsPromise: Promise<AhaPdfAssets> | null = null;

export function loadAhaPdfAssets(): Promise<AhaPdfAssets> {
  assetsPromise ??= Promise.all([
    loadAsset(logoUrl, "ITS logo"),
    loadAsset(energyWheelUrl, "energy wheel"),
  ]).then(([logoPng, energyWheelPng]) => ({ logoPng, energyWheelPng }));
  return assetsPromise;
}
