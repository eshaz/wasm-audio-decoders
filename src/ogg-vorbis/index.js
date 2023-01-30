import OggVorbisDecoder from "./src/OggVorbisDecoder.js";
import OggVorbisDecoderWebWorker from "./src/OggVorbisDecoderWebWorker.js";

const decoder = "OggVorbisDecoder";
const decoderWebWorker = "OggVorbisDecoderWebWorker";
const name = "name"

Object.defineProperty(OggVorbisDecoder, name, { value: decoder });
Object.defineProperty(OggVorbisDecoder.constructor, name, {
  value: decoder,
});
Object.defineProperty(OggVorbisDecoderWebWorker, name, {
  value: decoderWebWorker,
});
Object.defineProperty(OggVorbisDecoderWebWorker.constructor, name, {
  value: decoderWebWorker,
});

export { OggVorbisDecoder, OggVorbisDecoderWebWorker };
