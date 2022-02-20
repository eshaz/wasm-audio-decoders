import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import OpusDecodedAudio from "./OpusDecodedAudio.js";
import OggOpusDecoder from "./OggOpusDecoder.js";

export default class OggOpusDecoderWebWorker extends WASMAudioDecoderWorker {
  constructor() {
    super(OggOpusDecoder, OpusDecodedAudio, EmscriptenWASM);
  }

  async decode(data) {
    return this._postToDecoder("decode", data).then((out) =>
      this._getDecodedAudio(out)
    );
  }
}
