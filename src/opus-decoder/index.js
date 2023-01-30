import OpusDecoder from "./src/OpusDecoder.js";
import OpusDecoderWebWorker from "./src/OpusDecoderWebWorker.js";

const decoder = "OpusDecoder";
const decoderWebWorker = "OpusDecoderWebWorker";
const name = "name"

Object.defineProperty(OpusDecoder, name, { value: decoder });
Object.defineProperty(OpusDecoder.constructor, name, {
  value: decoder,
});
Object.defineProperty(OpusDecoderWebWorker, name, {
  value: decoderWebWorker,
});
Object.defineProperty(OpusDecoderWebWorker.constructor, name, {
  value: decoderWebWorker,
});

export { OpusDecoder, OpusDecoderWebWorker };
