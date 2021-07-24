const fs = require("fs");
const path = require("path");
const yenc = require("simple-yenc");
const fflate = require("fflate");

const distPath = process.argv[2];
const tinyInflatePath = path.join(__dirname, "tiny-inflate.js");
const opusDecoder = fs.readFileSync(distPath, { encoding: "ascii" });
const tinyInflate = fs.readFileSync(tinyInflatePath, { encoding: "ascii" });

const wasmBase64ContentMatcher =
  /Module\["wasm"\] = base64Decode\("(?<wasm>(.+))"\)/;
const wasmBase64DeclarationMatcher = 'Module["wasm"] = base64Decode("';

// code before the wasm
const startIdx = opusDecoder.indexOf(wasmBase64DeclarationMatcher);
let start = opusDecoder.substring(0, startIdx);

// add the yenc decode function and inline decoding
start += 'Module["wasm"] = tinf_uncompress((' + yenc.decode.toString() + ")(`";

// original wasm
const wasmContent = opusDecoder.match(wasmBase64ContentMatcher).groups.wasm;
// compressed buffer
const wasmBuffer = Uint8Array.from(Buffer.from(wasmContent, "base64"));
const wasmBufferCompressed = fflate.deflateSync(wasmBuffer, {
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
end += opusDecoder.substring(endIdx);

// Concatenate the strings as buffers to preserve extended ascii
const finalString = Buffer.concat(
  [tinyInflate, start, yencStringifiedWasm, end].map(Buffer.from)
);

fs.writeFileSync(distPath, finalString, { encoding: "binary" });
