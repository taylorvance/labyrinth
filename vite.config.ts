import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const repoName = env.GITHUB_REPOSITORY?.split("/")[1];
  const base =
    env.VITE_BASE_PATH ??
    (env.GITHUB_ACTIONS === "true" && repoName ? `/${repoName}/` : "/");

  return {
    base,
    plugins: [react()],
    server: {
      allowedHosts: ["tvmini", "tvmini.local"],
    },
  };
});
