import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const server = `http://127.0.0.1:${process.env.PORT || 8790}`;

export default defineConfig({
  plugins: [react()],
  // assets/ is served at / so manifest paths like models/x.glb resolve as /models/x.glb.
  publicDir: "../../assets",
  server: {
    port: 5173,
    proxy: {
      "/api": server,
      "/ws": { target: server.replace("http", "ws"), ws: true },
    },
  },
});
