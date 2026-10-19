import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // The repo may live on a Windows mount (WSL /mnt/c) where inotify does not
  // work; polling keeps HMR reliable there.
  server: {
    watch: {
      usePolling: true,
    },
  },
  build: {
    target: "es2022",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "eval/*.run.ts"],
    testTimeout: 120_000,
  },
});
