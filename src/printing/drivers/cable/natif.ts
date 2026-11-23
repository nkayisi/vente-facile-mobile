/**
 * Le module natif des imprimantes câblées (`modules/imprimante-cablee`),
 * Android seulement.
 *
 * Le seul fichier qui le charge. Absent (iOS, binaire antérieur), les deux
 * transports se disent simplement indisponibles, et la cascade sort le PDF.
 */
import { Platform } from "react-native";

import type { ImprimanteUsb } from "./regles";

interface ModuleImprimanteCablee {
  listerUsb(): Promise<ImprimanteUsb[]>;
  demanderPermissionUsb(cle: string): Promise<boolean>;
  envoyerUsb(cle: string, base64: string): Promise<void>;
  envoyerTcp(hote: string, port: number, base64: string): Promise<void>;
}

/** `undefined` : jamais cherché. `null` : cherché, absent. */
let module: ModuleImprimanteCablee | null | undefined;

export function moduleCable(): ModuleImprimanteCablee | null {
  if (module !== undefined) return module;
  if (Platform.OS !== "android") {
    module = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expo = require("expo") as {
      requireOptionalNativeModule<T>(name: string): T | null;
    };
    module = expo.requireOptionalNativeModule<ModuleImprimanteCablee>("ImprimanteCablee");
  } catch {
    module = null;
  }
  return module;
}
