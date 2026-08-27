import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import AACDecoder, { _AACDecoder, setDecoderClass } from "./AACDecoder.js";

class DecoderWorker extends WASMAudioDecoderWorker {
  constructor(options) {
    super(options, "aac-decoder", _AACDecoder, EmscriptenWASM);
  }

  async decodeFrames(frames) {
    return this.postToDecoder("decodeFrames", frames);
  }
}

export default class AACDecoderWebWorker extends AACDecoder {
  constructor(options) {
    super(options);

    super[setDecoderClass](DecoderWorker);
  }

  async free() {
    await this._decoder.free();
  }

  terminate() {
    this._decoder.terminate();
  }
}
