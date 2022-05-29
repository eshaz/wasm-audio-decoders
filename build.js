import fs from "fs";
import yenc from "simple-yenc";
import Zopfli from "node-zopfli";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import { rollup } from "rollup";
import { minify } from "terser";

const searchFileSize = async (
  sourcePath,
  rollupOutput,
  terserOutput
) => {
  const startIteration = 50;
  const stopIteration = 600;

  let bestLength = Infinity;
  let bestIteration = Infinity;

  const sizes = [];

  for (
    let iteration = startIteration;
    iteration <= stopIteration;
    iteration++
  ) {
    await buildWasm(sourcePath, iteration, rollupOutput, terserOutput).then((code) => {
      sizes.push({
        iteration,
        size: code.length,
      });

      if (code.length <= bestLength) {
        if (code.length < bestLength || bestIteration > iteration) {
          bestIteration = iteration;
          console.log("new best iteration", iteration, sourcePath, code.length);
        }
        bestLength = code.length;
      }

      console.log(iteration, sourcePath, code.length);
    });
  }

  sizes.sort((a, b) => a.size - b.size || a.iteration - b.iteration);
  fs.writeFileSync(moduleMin + ".sizes.json", JSON.stringify(sizes, null, 2));

  console.log(moduleMin, "best iteration", bestIteration);
};

const buildWasm = async (
  sourcePath,
  compressionIterations,
  rollupOutput,
  terserOutput
) => {
  const emscriptenInputPath = sourcePath + "src/EmscriptenWasm.tmp.js";
  const emscriptenOutputPath = sourcePath + "src/EmscriptenWasm.js";
  const rollupConfigPath = sourcePath + "rollup.json";
  const rollupInput = sourcePath + "index.js";
  const terserConfigPath = sourcePath + "terser.json";

  let decoder = fs.readFileSync(emscriptenInputPath, { encoding: "ascii" });

  // only compile wasm once
  const wasmInstantiateMatcher = /WebAssembly\.instantiate\(.*?exports;/s;
  decoder = decoder.replace(
    decoder.match(wasmInstantiateMatcher)[0],
    "EmscriptenWASM.compiled.then((wasm) => WebAssembly.instantiate(wasm, imports)).then(function(instance) {\n var asm = instance.exports;"
  );

  const wasmBase64ContentMatcher =
    /Module\["wasm"\] = base64Decode\("(?<wasm>(.+))"\)/;
  const wasmBase64DeclarationMatcher = 'Module["wasm"] = base64Decode("';

  // original wasm
  const wasmContent = decoder.match(wasmBase64ContentMatcher).groups.wasm;
  // compressed buffer
  const wasmBuffer = Uint8Array.from(Buffer.from(wasmContent, "base64"));
  const wasmBufferCompressed = Zopfli.deflateSync(wasmBuffer, {
    numiterations: compressionIterations,
    blocksplitting: true,
    blocksplittingmax: 0,
  });

  // yEnc encoded wasm
  const dynEncodedSingleWasm = {
    wasm: yenc.dynamicEncode(wasmBufferCompressed, "'"),
    quote: "'",
  };
  const dynEncodedDoubleWasm = {
    wasm: yenc.dynamicEncode(wasmBufferCompressed, '"'),
    quote: '"',
  };
  const dynEncodedWasm =
    dynEncodedDoubleWasm.wasm.length > dynEncodedSingleWasm.wasm.length
      ? dynEncodedSingleWasm
      : dynEncodedDoubleWasm;

  // code before the wasm
  const wasmStartIdx = decoder.indexOf(wasmBase64DeclarationMatcher);

  // code after the wasm
  const wasmEndIdx =
    wasmStartIdx + wasmBase64DeclarationMatcher.length + wasmContent.length + 2;

  decoder = Buffer.concat(
    [
      decoder.substring(0, wasmStartIdx),
      'if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: ',
      "WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString(",
      dynEncodedWasm.quote,
      dynEncodedWasm.wasm,
      dynEncodedWasm.quote,
      `, new Uint8Array(${wasmBuffer.length})))})`,
      decoder.substring(wasmEndIdx),
    ].map(Buffer.from)
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
      "}",
    ].map(Buffer.from)
  );

  fs.writeFileSync(emscriptenOutputPath, finalString, { encoding: "binary" });

  // rollup
  const rollupConfig = fs.readFileSync(rollupConfigPath).toString()
  const rollupInputConfig = JSON.parse(rollupConfig);
  rollupInputConfig.input = rollupInput;
  rollupInputConfig.plugins = [nodeResolve()];

  const rollupOutputConfig = JSON.parse(rollupConfig);
  rollupOutputConfig.output.file = rollupOutput;

  const bundle = await rollup(rollupInputConfig);
  const output = (await bundle.generate(rollupOutputConfig)).output[0];

  // terser
  const terserConfig = JSON.parse(fs.readFileSync(terserConfigPath).toString());
  const minified = await minify(
    { [output.fileName]: output.code },
    terserConfig
  );

  // write output files
  await Promise.all([
    bundle.write(rollupOutputConfig),
    fs.promises.writeFile(terserOutput, minified.code),
    fs.promises.writeFile(terserOutput + ".map", minified.map),
  ]);

  return fs.readFileSync(terserOutput);
};

const sourcePath = process.argv[2];
const compressionIterations = parseInt(process.argv[3]);
const module = process.argv[4];
const moduleMin = process.argv[5];

await buildWasm(sourcePath, compressionIterations, module, moduleMin);

/*
await searchFileSize(
  sourcePath,
  module,
  moduleMin
);
*/
