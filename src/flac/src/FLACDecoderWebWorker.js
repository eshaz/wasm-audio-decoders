import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import FLACDecoder, { Decoder } from "./FLACDecoder.js";

class DecoderWorker extends WASMAudioDecoderWorker {
  constructor(options) {
    super(options, "flac-decoder", Decoder, EmscriptenWASM);
  }

  async decodeFrames(data) {
    return this._postToDecoder("decodeFrames", data);
  }
}

export default class FLACDecoderWebWorker extends FLACDecoder {
  constructor(options) {
    super(options);

    this._decoderClass = DecoderWorker;
  }

  async free() {
    super.free();
  }
}
