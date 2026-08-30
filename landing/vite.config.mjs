import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    {
      name: "pulseclip-landing-content-security-policy",
      transformIndexHtml(html) {
        const connections = command === "serve"
          ? "'self' ws: http://localhost:5173"
          : "'none'";
        return html.replace("__PULSECLIP_LANDING_CONNECT_SRC__", connections);
      },
    },
    react(),
  ],
}));
