import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import OggOpusDecoder from "./OggOpusDecoder.js";

export default class OggOpusDecoderWebWorker extends WASMAudioDecoderWorker {
  constructor(options) {
    super(options, OggOpusDecoder, EmscriptenWASM);
  }

  async decode(data) {
    return this._postToDecoder("decode", data);
  }
}
