import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { hiber3DVitePlugin } from "@hiber3d/web/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths(), hiber3DVitePlugin()],
  publicDir: "assets",
  base: "./",
});