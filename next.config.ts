import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dashboard personal dinámico: se desactiva el modelo de Cache Components
  // (prerender + streaming) porque todas las rutas privadas dependen de la
  // sesión y de datos por usuario. Se puede reactivar más adelante adoptando
  // `use cache` y límites <Suspense>.
  cacheComponents: false,
};

export default nextConfig;
