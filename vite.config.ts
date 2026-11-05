import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: "/",
    // cloudflare() runs worker/ (the poll server) inside the dev server and builds it with the app.
    plugins: [react(), tailwindcss(), cloudflare()],
    server: {
      // IPv4 loopback, so a local proxy such as Tailscale Serve can reach it at 127.0.0.1.
      host: "127.0.0.1",
      // Extra hostnames the dev server answers to, e.g. a Tailscale Serve name for testing on a phone.
      allowedHosts: (env.VITE_DEV_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim()).filter(Boolean),
    },
  };
});
