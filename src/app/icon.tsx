import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon generado: "B" blanca sobre degradado ámbar → rojo. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          background: "linear-gradient(135deg, #ffd23f 0%, #ff7a1a 55%, #e0312b 100%)",
          color: "#0a0a0d",
          fontSize: 40,
          fontWeight: 900,
          fontFamily: "sans-serif",
          letterSpacing: -2,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
