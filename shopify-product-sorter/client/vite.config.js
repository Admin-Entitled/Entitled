import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "log-vite-url",
      configureServer(server) {
        server.httpServer?.once("listening", () => {
          console.log("Vite running on http://localhost:5173");
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
