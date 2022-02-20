import fs from "fs";
import yenc from "simple-yenc";
import { deflateSync } from "fflate";

const distPath = process.argv[2];
const decoder = fs.readFileSync(distPath, { encoding: "ascii" });

const wasmBase64ContentMatcher =
  /Module\["wasm"\] = base64Decode\("(?<wasm>(.+))"\)/;
const wasmBase64DeclarationMatcher = 'Module["wasm"] = base64Decode("';

// code before the wasm
const startIdx = decoder.indexOf(wasmBase64DeclarationMatcher);
let start = decoder.substring(0, startIdx);

// add the yenc decode function and inline decoding
start += 'Module["wasm"] = WASMAudioDecoderCommon.inflate((' + yenc.decode.toString() + ")(`";

// original wasm
const wasmContent = decoder.match(wasmBase64ContentMatcher).groups.wasm;
// compressed buffer
const wasmBuffer = Uint8Array.from(Buffer.from(wasmContent, "base64"));
const wasmBufferCompressed = deflateSync(wasmBuffer, {
  level: 9,
  mem: 12,
});
// yEnc encoded wasm
const yencEncodedWasm = yenc.encode(wasmBufferCompressed);
const yencStringifiedWasm = yenc.stringify(yencEncodedWasm);

// code after the wasm
const endIdx =
  startIdx + wasmBase64DeclarationMatcher.length + wasmContent.length + 2;
let end = `\`), new Uint8Array(${wasmBuffer.length}))`;
end += decoder.substring(endIdx);

const banner =
  "/* **************************************************\n" +
  " * This file is auto-generated during the build process.\n" +
  " * Any edits to this file will be overwritten.\n" +
  " ****************************************************/" +
  "\n\n";

// Concatenate the strings as buffers to preserve extended ascii
let finalString = Buffer.concat(
  [
    banner,
    "export default class EmscriptenWASM {\n",
    "constructor(WASMAudioDecoderCommon) {\n",
    start,
    yencStringifiedWasm,
    end,
    "}",
    "}",
  ].map(Buffer.from)
);

fs.writeFileSync(distPath, finalString, { encoding: "binary" });
