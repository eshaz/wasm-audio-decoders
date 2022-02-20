import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
  external: ["web-worker"],
  output: {
    format: "umd",
    name: "opus-decoder",
    globals: {
      "web-worker": "Worker",
    },
  },
  plugins: [nodeResolve()],
};
