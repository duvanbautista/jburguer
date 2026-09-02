import type { NextConfig } from "next";

interface StoragePattern {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname: string;
}

/**
 * Patrón de imágenes remotas derivado de NEXT_PUBLIC_SUPABASE_URL, para que
 * next/image optimice también las fotos de un Supabase local (`supabase start`,
 * http://127.0.0.1:54321) o self-hosted. Debe coincidir con src/lib/images.ts.
 */
function supabaseStoragePattern(): StoragePattern[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const u = new URL(raw);
    return [
      {
        protocol: u.protocol === "http:" ? "http" : "https",
        hostname: u.hostname,
        ...(u.port ? { port: u.port } : {}),
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage (bucket público dish-images) de cualquier proyecto *.supabase.co.
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      ...supabaseStoragePattern(),
    ],
  },
  experimental: {
    serverActions: {
      // Las imágenes de platos/logos (hasta 5 MB) se suben vía server actions del panel admin.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
