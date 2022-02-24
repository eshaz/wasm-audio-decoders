import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import MPEGDecoder from "./MPEGDecoder.js";

export default class MPEGDecoderWebWorker extends WASMAudioDecoderWorker {
  constructor() {
    super(MPEGDecoder, EmscriptenWASM);
  }

  async decode(data) {
    return this._postToDecoder("decode", data);
  }

  async decodeFrame(data) {
    return this._postToDecoder("decodeFrame", data);
  }

  async decodeFrames(data) {
    return this._postToDecoder("decodeFrames", data);
  }
}
