/**
 * Nombres de los componentes de la huella. Compartidos entre el recolector del
 * navegador (client.ts) y la derivación de señales en servidor (antifraud/signals.ts)
 * para que ambos lados hablen de las mismas claves. Sin dependencias de Node ni DOM.
 */

/** Versión actual del recolector; el servidor penaliza versiones distintas. */
export const FP_VERSION = 1;

/**
 * Componentes de HARDWARE / entorno estable: son la base de `device_fp`.
 * No incluyen user-agent ni idiomas (cambian al cambiar de navegador).
 */
export const DEVICE_COMPONENT_KEYS = [
  "canvas",
  "webglVendor",
  "webglRenderer",
  "screenWidth",
  "screenHeight",
  "colorDepth",
  "dpr",
  "cores",
  "memory",
  "platform",
  "touch",
  "timezone",
  "fonts",
  "audio",
] as const;

/** Componentes de navegador que se suman a los de hardware para `client_fp`. */
export const CLIENT_EXTRA_COMPONENT_KEYS = ["ua", "languages", "reducedMotion", "colorGamut"] as const;

export type DeviceComponentKey = (typeof DEVICE_COMPONENT_KEYS)[number];
export type ClientExtraComponentKey = (typeof CLIENT_EXTRA_COMPONENT_KEYS)[number];
export type ComponentKey = DeviceComponentKey | ClientExtraComponentKey;
