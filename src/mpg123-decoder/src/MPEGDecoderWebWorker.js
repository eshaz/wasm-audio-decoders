import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import MPEGDecodedAudio from "./MPEGDecodedAudio.js";
import MPEGDecoder from "./MPEGDecoder.js";

export default class MPEGDecoderWebWorker extends WASMAudioDecoderWorker {
  constructor() {
    super(MPEGDecoder, MPEGDecodedAudio, EmscriptenWASM);
  }

  async decode(data) {
    return this._postToDecoder("decode", data).then((out) =>
      this._getDecodedAudio(out)
    );
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
