import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import EmscriptenWASM from "./EmscriptenWasm.js";

export default class OpusDecoder {
  constructor(_WASMAudioDecoderCommon, _EmscriptenWASM) {
    this._isWebWorker = _WASMAudioDecoderCommon && _EmscriptenWASM;
    this._WASMAudioDecoderCommon =
      _WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = _EmscriptenWASM || EmscriptenWASM;

    this._inputPtrSize = (0.12 * 510000) / 8;
    this._outputPtrSize = 120 * 48;
    this._channelsOut = 2;

    this._ready = this._init();
  }

  // injects dependencies when running as a web worker
  async _init() {
    this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
      this
    )();

    this._decoder = this._common.wasm._opus_frame_decoder_create();
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this.free();
    await this._init();
  }

  free() {
    this._common.wasm._opus_frame_decoder_destroy(this._decoder);

    this._common.free();
  }

  decodeFrame(opusFrame) {
    if (!(opusFrame instanceof Uint8Array))
      throw Error(
        `Data to decode must be Uint8Array. Instead got ${typeof opusFrame}`
      );

    this._input.set(opusFrame);

    const samplesDecoded =
      this._common.wasm._opus_frame_decode_float_deinterleaved(
        this._decoder,
        this._inputPtr,
        opusFrame.length,
        this._leftPtr,
        this._rightPtr
      );

    return this._WASMAudioDecoderCommon.getDecodedAudio(
      [
        this._leftArr.slice(0, samplesDecoded),
        this._rightArr.slice(0, samplesDecoded),
      ],
      samplesDecoded,
      48000
    );
  }

  decodeFrames(opusFrames) {
    let left = [],
      right = [],
      samples = 0;

    opusFrames.forEach((frame) => {
      const { channelData, samplesDecoded } = this.decodeFrame(frame);

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;
    });

    return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
      [left, right],
      samples,
      48000
    );
  }
}
