import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json"));

const license =
  "/* Copyright 2021-2025 Ethan Halsall. This file is part of wasm-audio-decoders. https://github.com/eshaz/wasm-audio-decoders */";

export default {
  mode: "production",
  devtool: "source-map",
  entry: "/index.js",
  output: {
    path: new URL("dist", import.meta.url).pathname,
    filename: `${packageJson.name}.min.js`,
    chunkFilename: `${packageJson.name}.[name].min.js`,
    library: "ogg-opus-decoder",
    libraryTarget: "umd",
    globalObject: "this",
  },
  plugins: [new webpack.ProgressPlugin()],
  resolve: {
    fallback: { util: false },
  },
  module: {
    rules: [],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          module: true,
          ecma: 2021,
          safari10: true,
          output: {
            preamble: license,
          },
          compress: {
            ecma: 2021,
            passes: 5,
            toplevel: true,
            unsafe: true,
            unsafe_methods: true,
            unsafe_arrows: true,
          },
          mangle: {
            module: true,
            properties: {
              keep_quoted: "strict",
              debug: false,
              regex: /^_/,
            },
          },
        },
      }),
    ],
  },
};
