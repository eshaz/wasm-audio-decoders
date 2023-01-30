import MPEGDecoder from "./src/MPEGDecoder.js";
import MPEGDecoderWebWorker from "./src/MPEGDecoderWebWorker.js";

const decoder = "MPEGDecoder";
const decoderWebWorker = "MPEGDecoderWebWorker";
const name = "name"

Object.defineProperty(MPEGDecoder, name, { value: decoder });
Object.defineProperty(MPEGDecoder.constructor, name, {
  value: decoder,
});
Object.defineProperty(MPEGDecoderWebWorker, name, {
  value: decoderWebWorker,
});
Object.defineProperty(MPEGDecoderWebWorker.constructor, name, {
  value: decoderWebWorker,
});

export { MPEGDecoder, MPEGDecoderWebWorker };
