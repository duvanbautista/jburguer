/**
 * Clave de localStorage donde se guarda el tema elegido ("light" | "dark";
 * ausente = automático, manda el sistema).
 *
 * Vive en un módulo SIN "use client" a propósito: el layout raíz (componente de
 * servidor) la interpola en el script inline que aplica el tema antes del primer
 * pintado. Importada desde un módulo cliente, en el servidor llegaría como
 * referencia de cliente y el script quedaría como localStorage.getItem(undefined).
 */
export const THEME_STORAGE_KEY = "bl-theme";
