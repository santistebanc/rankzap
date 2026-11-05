import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: /^(\.\.\/)+lib\/roomClient$/, replacement: fileURLToPath(new URL("./fakeHomeRoomClient.ts", import.meta.url)) }, { find: /^(\.\.\/)+lib\/room$/, replacement: fileURLToPath(new URL("./fakeRoom.tsx", import.meta.url)) }] },
  server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
});

