import { WASMAudioDecoderWorker } from "@wasm-audio-decoders/common";
import EmscriptenWASM from "./EmscriptenWasm.js";
import PCMDecoder from "./PCMDecoder.js";

export default class PCMDecoderWebWorker extends WASMAudioDecoderWorker {
  constructor(options) {
    super(options, "pcm-decoder", PCMDecoder, EmscriptenWASM);
  }

  async decodeFrame(data) {
    return this.postToDecoder("decodeFrame", data);
  }

  async decodeFrames(data) {
    return this.postToDecoder("decodeFrames", data);
  }
}
