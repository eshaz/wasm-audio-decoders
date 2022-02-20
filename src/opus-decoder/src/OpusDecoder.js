import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import OpusDecodedAudio from "./OpusDecodedAudio.js";
import EmscriptenWASM from "./EmscriptenWasm.js";

let wasm;

export default class OpusDecoder {
  constructor(_WASMAudioDecoderCommon, _OpusDecodedAudio, _EmscriptenWASM) {
    this._ready = new Promise((resolve) =>
      this._init(
        _WASMAudioDecoderCommon,
        _OpusDecodedAudio,
        _EmscriptenWASM
      ).then(resolve)
    );
  }

  // injects dependencies when running as a web worker
  async _init(_WASMAudioDecoderCommon, _OpusDecodedAudio, _EmscriptenWASM) {
    if (!this._api) {
      const isWebWorker =
        _WASMAudioDecoderCommon && _OpusDecodedAudio && _EmscriptenWASM;

      if (isWebWorker) {
        // use classes injected into constructor parameters
        this._WASMAudioDecoderCommon = _WASMAudioDecoderCommon;
        this._OpusDecodedAudio = _OpusDecodedAudio;
        this._EmscriptenWASM = _EmscriptenWASM;

        // running as a webworker, use class level singleton for wasm compilation
        this._api = new this._EmscriptenWASM(this._WASMAudioDecoderCommon);
      } else {
        // use classes from es6 imports
        this._WASMAudioDecoderCommon = WASMAudioDecoderCommon;
        this._OpusDecodedAudio = OpusDecodedAudio;
        this._EmscriptenWASM = EmscriptenWASM;

        // use a global scope singleton so wasm compilation happens once only if class is instantiated
        if (!wasm)
          wasm = new this._EmscriptenWASM(this._WASMAudioDecoderCommon);
        this._api = wasm;
      }

      this._common = new this._WASMAudioDecoderCommon(this._api);
    }

    await this._api.ready;

    this._decoder = this._api._opus_frame_decoder_create();

    // max size of stereo Opus packet 120ms @ 510kbs
    [this._inputPtr, this._input] = this._common.allocateTypedArray(
      (0.12 * 510000) / 8,
      Uint8Array
    );

    // max audio output of Opus packet 120ms @ 48000Hz
    [this._leftPtr, this._leftArr] = this._common.allocateTypedArray(
      120 * 48,
      Float32Array
    );
    [this._rightPtr, this._rightArr] = this._common.allocateTypedArray(
      120 * 48,
      Float32Array
    );
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this.free();
    await this._init();
  }

  free() {
    this._api._opus_frame_decoder_destroy(this._decoder);

    this._common.free();
  }

  decodeFrame(opusFrame) {
    if (!(opusFrame instanceof Uint8Array))
      throw Error(
        `Data to decode must be Uint8Array. Instead got ${typeof opusFrame}`
      );

    this._input.set(opusFrame);

    const samplesDecoded = this._api._opus_frame_decode_float_deinterleaved(
      this._decoder,
      this._inputPtr,
      opusFrame.length,
      this._leftPtr,
      this._rightPtr
    );

    return new this._OpusDecodedAudio(
      [
        this._leftArr.slice(0, samplesDecoded),
        this._rightArr.slice(0, samplesDecoded),
      ],
      samplesDecoded
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

    return new this._OpusDecodedAudio(
      [
        this._WASMAudioDecoderCommon.concatFloat32(left, samples),
        this._WASMAudioDecoderCommon.concatFloat32(right, samples),
      ],
      samples
    );
  }
}
