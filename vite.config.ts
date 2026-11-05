import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: "/",
    plugins: [react(), tailwindcss()],
    server: {
      allowedHosts: (env.VITE_DEV_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim()).filter(Boolean),
      proxy: {
        "/parties": { target: "http://127.0.0.1:1999", ws: true, changeOrigin: true },
      },
    },
  };
});
