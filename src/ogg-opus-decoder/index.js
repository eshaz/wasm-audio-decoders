import OggOpusDecoder from "./src/OggOpusDecoder.js";
import OggOpusDecoderWebWorker from "./src/OggOpusDecoderWebWorker.js";

const decoder = "OggOpusDecoder";
const decoderWebWorker = "OggOpusDecoderWebWorker";
const name = "name"

Object.defineProperty(OggOpusDecoder, name, { value: decoder });
Object.defineProperty(OggOpusDecoder.constructor, name, {
  value: decoder,
});
Object.defineProperty(OggOpusDecoderWebWorker, name, {
  value: decoderWebWorker,
});
Object.defineProperty(OggOpusDecoderWebWorker.constructor, name, {
  value: decoderWebWorker,
});

export { OggOpusDecoder, OggOpusDecoderWebWorker };
