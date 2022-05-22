import fs from "fs";
import yenc from "simple-yenc";
import { deflateSync } from "fflate";

const shouldCompress = true;
const distPath = process.argv[2];
let decoder = fs.readFileSync(distPath, { encoding: "ascii" });

if (shouldCompress) {
  const wasmBase64ContentMatcher =
    /Module\["wasm"\] = base64Decode\("(?<wasm>(.+))"\)/;
  const wasmBase64DeclarationMatcher = 'Module["wasm"] = base64Decode("';

  // original wasm
  const wasmContent = decoder.match(wasmBase64ContentMatcher).groups.wasm;
  // compressed buffer
  const wasmBuffer = Uint8Array.from(Buffer.from(wasmContent, "base64"));
  const wasmBufferCompressed = deflateSync(wasmBuffer, {
    level: 9,
    mem: 12,
  });
  // yEnc encoded wasm
  const dynEncodedWasm = yenc.dynamicEncode(wasmBufferCompressed, "'");

  // code before the wasm
  const startIdx = decoder.indexOf(wasmBase64DeclarationMatcher);

  // code after the wasm
  const endIdx =
    startIdx + wasmBase64DeclarationMatcher.length + wasmContent.length + 2;

  decoder = Buffer.concat(
    [
      decoder.substring(0, startIdx),
      'Module["wasm"] = WASMAudioDecoderCommon.inflateDynEncodeString(\'',
      dynEncodedWasm,
      `', new Uint8Array(${wasmBuffer.length}))`,
      decoder.substring(endIdx),
    ].map(Buffer.from)
  );
}

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
    "return this;",
    "}",
  ].map(Buffer.from)
);

fs.writeFileSync(distPath, finalString, { encoding: "binary" });
