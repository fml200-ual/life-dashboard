import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dashboard personal dinámico: se desactiva el modelo de Cache Components
  // (prerender + streaming) porque todas las rutas privadas dependen de la
  // sesión y de datos por usuario. Se puede reactivar más adelante adoptando
  // `use cache` y límites <Suspense>.
  cacheComponents: false,
  // Tailwind CSS v4 se procesa mediante su loader de Turbopack. Sin esta regla
  // Turbopack no compila `@import "tailwindcss"` ni las directivas `@theme`/
  // `@custom-variant` de globals.css, por lo que los estilos no se aplican.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
