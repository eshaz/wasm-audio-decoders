import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import fs from "fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json"));

const license = ``;

export default {
  mode: "production",
  devtool: "source-map",
  entry: "/index.js",
  output: {
    path: new URL("dist", import.meta.url).pathname,
    filename: `${packageJson.name}.[name].min.js`,
    library: "OggOpusDecoder",
    libraryExport: "default",
    libraryTarget: "var",
  },
  plugins: [new webpack.ProgressPlugin()],
  resolve: {
    fallback: { util: false },
  },
  module: {
    rules: [],
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        common: {
          filename: `${packageJson.name}.common.min.js`,
          test: /@wasm-audio-decoders\/common/,
          minSize: 1024,
        },
      },
    },
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          output: {
            preamble: license,
          },
          mangle: {
            properties: {
              regex: /^_/,
            },
          },
        },
      }),
    ],
  },
};
