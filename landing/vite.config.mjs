import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { description, structuredData } from "./src/release.js";

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
        return html
          .replace("__PULSECLIP_LANDING_CONNECT_SRC__", connections)
          .replaceAll("__PULSECLIP_DESCRIPTION__", description)
          .replace("__PULSECLIP_STRUCTURED_DATA__", JSON.stringify(structuredData).replaceAll("<", "\\u003c"));
      },
    },
    react(),
  ],
}));
