import getMPEGDecoderWASM from "./emscripten-build.js";

let MPEGDecoderWASM;

export default class MPEGDecoder {
  constructor() {
    if (!MPEGDecoderWASM) MPEGDecoderWASM = getMPEGDecoderWASM();
    this._decoder = new MPEGDecoderWASM();
    this._sampleRate = 0;
  }

  get ready() {
    return this._decoder.ready;
  }

  free() {
    return this._decoder.free();
  }

  reset() {
    return this._decoder.reset();
  }

  decode(data) {
    return this._decoder.decode(data);
  }

  decodeFrame(mpegFrame) {
    return this._decoder.decodeFrame(mpegFrame);
  }

  decodeFrames(mpegFrames) {
    return this._decoder.decodeFrames(mpegFrames);
  }
}
