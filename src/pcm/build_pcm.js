import fs from "fs";
import { dynamicEncode } from "simple-yenc";

const pcmWasmPath = "src/pcm/src/pcm.wasm";
const wasmCommonPath = "src/pcm/src/coroutine.js";

const pcmWasm = fs.readFileSync(pcmWasmPath);

const puffEncoded = dynamicEncode(pcmWasm, "`");

const wasmCommon = fs.readFileSync(wasmCommonPath).toString();

const pcmString = wasmCommon.match(/const pcmString = String.raw`.*`;/s)[0];

const wasmStartIdx = wasmCommon.indexOf(pcmString);
const wasmEndIdx = wasmStartIdx + pcmString.length;

// Concatenate the strings as buffers to preserve extended ascii
const wasmCommonWithPuff = Buffer.concat(
  [
    wasmCommon.substring(0, wasmStartIdx),
    "const puffString = String.raw`",
    puffEncoded,
    "`;",
    wasmCommon.substring(wasmEndIdx),
  ].map(Buffer.from)
);

fs.writeFileSync(wasmCommonPath, wasmCommonWithPuff, { encoding: "binary" });

console.log(pcmWasm.length);
