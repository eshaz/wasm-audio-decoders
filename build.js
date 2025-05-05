import fs from "fs";
import * as yenc from "simple-yenc";
import Zopfli from "node-zopfli";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { minify } from "terser";

const getDynEncodeWasm = (wasmBuffer, numiterations) => {
  let wasmBufferCompressed = wasmBuffer;

  if (numiterations > 0) {
    wasmBufferCompressed = Zopfli.deflateSync(wasmBuffer, {
      numiterations,
      blocksplitting: true,
      blocksplittingmax: 0,
    });
  }

  return {
    wasm: yenc.dynamicEncode(wasmBufferCompressed, "`"),
    quote: "`",
  };
};

const buildWasm = async (
  sourcePath,
  outputName,
  rollupOutput,
  terserOutput,
  compressionIterations,
  startIteration,
  endIteration,
) => {
  const emscriptenInputPath = sourcePath + `src/${outputName}.tmp.js`;
  const emscriptenOutputPath = sourcePath + `src/${outputName}.js`;
  const rollupConfigPath = sourcePath + "rollup.json";
  const rollupInput = sourcePath + "index.js";
  const terserConfigPath = sourcePath + "terser.json";

  if (outputName !== "none") {
    let decoder = fs.readFileSync(emscriptenInputPath, { encoding: "ascii" });

    // quote wasm import properties to avoid minification
    decoder = decoder.replace(
      /(var|let|const)\s+wasmImports\s*=\s*\{\n([\s\S]*?)\n\};/,
      (match, declarationKeyword, body) => {
        const quotedBody = body.replace(/([a-zA-Z0-9_$]+):/gm, '"$1":');
        return `${declarationKeyword} wasmImports = {\n${quotedBody}\n};`;
      },
    );

    // only compile wasm once
    const wasmInstantiateMatcher = /WebAssembly\.instantiate\(.*?exports;/s;
    decoder = decoder.replace(
      decoder.match(wasmInstantiateMatcher)[0],
      `
this.setModule = (data) => {
  WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
};

this.getModule = () =>
  WASMAudioDecoderCommon.getModule(EmscriptenWASM);

this.instantiate = () => {
  this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then(instance => {
    const wasmExports = instance.exports;`,
    );

    const wasmBase64ContentMatcher =
      /Module\["wasm"\] = base64Decode\("(?<wasm>(.+))"\)/;
    const wasmBase64DeclarationMatcher = 'Module["wasm"] = base64Decode("';

    // original wasm
    const wasmContent = decoder.match(wasmBase64ContentMatcher).groups.wasm;
    // compressed buffer
    const wasmBuffer = Uint8Array.from(Buffer.from(wasmContent, "base64"));
    let dynEncodedWasm;

    if (startIteration !== undefined) {
      let bestLength = Infinity;
      let bestIteration = Infinity;

      const sizes = [];

      for (
        let iteration = startIteration;
        iteration <= endIteration;
        iteration++
      ) {
        try {
          dynEncodedWasm = getDynEncodeWasm(wasmBuffer, iteration);
          const code = dynEncodedWasm.wasm;

          sizes.push({
            iteration,
            size: code.length,
          });

          if (code.length <= bestLength) {
            if (code.length < bestLength || bestIteration > iteration) {
              bestIteration = iteration;
              console.log(
                "new best iteration",
                iteration,
                sourcePath,
                code.length,
              );
            }
            bestLength = code.length;
          }

          console.log(iteration, sourcePath, code.length);
        } catch (e) {
          console.error("failed on iteration:", iteration);
          console.error(e);
        }
      }

      sizes.sort((a, b) => a.size - b.size || a.iteration - b.iteration);
      fs.writeFileSync(
        moduleMin + ".sizes.json",
        JSON.stringify(sizes, null, 2),
      );

      console.log(moduleMin, "best iteration", bestIteration);
    } else {
      dynEncodedWasm = getDynEncodeWasm(wasmBuffer, compressionIterations);
    }

    // code before the wasm
    const wasmStartIdx = decoder.indexOf(wasmBase64DeclarationMatcher);

    // code after the wasm
    const wasmEndIdx =
      wasmStartIdx +
      wasmBase64DeclarationMatcher.length +
      wasmContent.length +
      2;

    decoder = Buffer.concat(
      [
        decoder.substring(0, wasmStartIdx),
        'if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw',
        dynEncodedWasm.quote,
        dynEncodedWasm.wasm,
        dynEncodedWasm.quote,
        "})",
        decoder.substring(wasmEndIdx),
      ].map((string) => Buffer.from(string, { encoding: "binary" })),
    );

    const banner =
      "/* **************************************************\n" +
      " * This file is auto-generated during the build process.\n" +
      " * Any edits to this file will be overwritten.\n" +
      " ****************************************************/" +
      "\n\n";

    // Concatenate the strings as buffers to preserve extended ascii
    const finalString = Buffer.concat(
      [
        banner,
        "export default function EmscriptenWASM(WASMAudioDecoderCommon) {\n",
        decoder,
        "return this;\n",
        "}}",
      ].map((string) => Buffer.from(string, { encoding: "binary" })),
    );

    fs.writeFileSync(emscriptenOutputPath, finalString, { encoding: "binary" });
  }

  if (module && moduleMin) {
    // rollup
    const rollupConfig = fs.readFileSync(rollupConfigPath).toString();

    const rollupInputConfig = JSON.parse(rollupConfig);
    rollupInputConfig.input = rollupInput;
    rollupInputConfig.plugins = [nodeResolve()];

    const rollupOutputConfig = JSON.parse(rollupConfig).output;
    rollupOutputConfig.file = rollupOutput;

    const bundle = await rollup(rollupInputConfig);
    const output = (await bundle.generate(rollupOutputConfig)).output[0];

    // terser
    const terserConfig = JSON.parse(
      fs.readFileSync(terserConfigPath).toString(),
    );
    const minified = await minify(
      { [output.fileName]: output.code },
      terserConfig,
    );

    // write output files
    await Promise.all([
      bundle.write(rollupOutputConfig),
      fs.promises.writeFile(terserOutput, minified.code),
      fs.promises.writeFile(terserOutput + ".map", minified.map),
    ]);

    return fs.readFileSync(terserOutput);
  }
};

const sourcePath = process.argv[2];
const outputName = process.argv[3];
const compressionIterations = parseInt(process.argv[4]);
const module = process.argv[5];
const moduleMin = process.argv[6];

await buildWasm(
  sourcePath,
  outputName,
  module,
  moduleMin,
  compressionIterations,
  //1, // start iteration
  //500, // stop iteration
);
