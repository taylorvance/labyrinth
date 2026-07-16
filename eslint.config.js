import defineReactAppConfig from "@taylorvance/tv-shared-dev/eslint/react-app";

export default [
  ...defineReactAppConfig({
    extraIgnores: ["vite.config.d.ts", "vite.config.js", "*.tsbuildinfo"],
  }),
  {
    files: ["src/App.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
