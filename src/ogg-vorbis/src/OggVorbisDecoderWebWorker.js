import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import OggVorbisDecoder, {
  Decoder,
  setDecoderClass,
} from "./OggVorbisDecoder.js";

class DecoderWorker extends WASMAudioDecoderWorker {
  constructor(options) {
    super(options, "vorbis-decoder", Decoder, EmscriptenWASM);
  }

  async decodeFrames(frames) {
    return this._postToDecoder("decodeFrames", frames);
  }
}

export default class OggVorbisDecoderWebWorker extends OggVorbisDecoder {
  constructor() {
    super();

    super[setDecoderClass](DecoderWorker);
  }

  async free() {
    super.free();
  }
}
