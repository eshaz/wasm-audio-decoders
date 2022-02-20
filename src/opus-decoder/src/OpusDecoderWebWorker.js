import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import OpusDecodedAudio from "./OpusDecodedAudio.js";
import OpusDecoder from "./OpusDecoder.js";

let sourceURL;

export default class OpusDecoderWebWorker extends WASMAudioDecoderWorker {
  constructor() {
    super(OpusDecoder, OpusDecodedAudio, EmscriptenWASM);
  }

  async decodeFrame(data) {
    return this._postToDecoder("decodeFrame", data).then((out) =>
      this._getDecodedAudio(out)
    );
  }

  async decodeFrames(data) {
    return this._postToDecoder("decodeFrames", data).then((out) =>
      this._getDecodedAudio(out)
    );
  }
}
