import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import MPEGDecodedAudio from "./MPEGDecodedAudio.js";
import EmscriptenWASM from "./EmscriptenWasm.js";

let wasm;

export default class MPEGDecoder {
  constructor(_WASMAudioDecoderCommon, _MPEGDecodedAudio, _EmscriptenWASM) {
    this._ready = new Promise((resolve) =>
      this._init(
        _WASMAudioDecoderCommon,
        _MPEGDecodedAudio,
        _EmscriptenWASM
      ).then(resolve)
    );
  }

  // injects dependencies when running as a web worker
  async _init(_WASMAudioDecoderCommon, _MPEGDecodedAudio, _EmscriptenWASM) {
    if (!this._api) {
      const isWebWorker =
        _WASMAudioDecoderCommon && _MPEGDecodedAudio && _EmscriptenWASM;

      if (isWebWorker) {
        // use classes injected into constructor parameters
        this._WASMAudioDecoderCommon = _WASMAudioDecoderCommon;
        this._MPEGDecodedAudio = _MPEGDecodedAudio;
        this._EmscriptenWASM = _EmscriptenWASM;

        // running as a webworker, use class level singleton for wasm compilation
        this._api = new this._EmscriptenWASM(this._WASMAudioDecoderCommon);
      } else {
        // use classes from es6 imports
        this._WASMAudioDecoderCommon = WASMAudioDecoderCommon;
        this._MPEGDecodedAudio = MPEGDecodedAudio;
        this._EmscriptenWASM = EmscriptenWASM;

        // use a global scope singleton so wasm compilation happens once only if class is instantiated
        if (!wasm)
          wasm = new this._EmscriptenWASM(this._WASMAudioDecoderCommon);
        this._api = wasm;
      }

      this._common = new this._WASMAudioDecoderCommon(this._api);
    }

    await this._api.ready;

    this._sampleRate = 0;

    // input buffer
    this._inDataPtrSize = 2 ** 18;
    [this._inDataPtr, this._inData] = this._common.allocateTypedArray(
      this._inDataPtrSize,
      Uint8Array
    );

    // output buffer
    this._outputLength = 1152 * 512;
    [this._leftPtr, this._leftArr] = this._common.allocateTypedArray(
      this._outputLength,
      Float32Array
    );
    [this._rightPtr, this._rightArr] = this._common.allocateTypedArray(
      this._outputLength,
      Float32Array
    );

    // input decoded bytes pointer
    [this._decodedBytesPtr, this._decodedBytes] =
      this._common.allocateTypedArray(1, Uint32Array);

    // sample rate
    [this._sampleRateBytePtr, this._sampleRateByte] =
      this._common.allocateTypedArray(1, Uint32Array);

    this._decoder = this._api._mpeg_frame_decoder_create();
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this.free();
    await this._init();
  }

  free() {
    this._api._mpeg_frame_decoder_destroy(this._decoder);
    this._api._free(this._decoder);

    this._common.free();
  }

  _decode(data, decodeInterval) {
    if (!(data instanceof Uint8Array))
      throw Error(
        `Data to decode must be Uint8Array. Instead got ${typeof data}`
      );

    this._inData.set(data);
    this._decodedBytes[0] = 0;

    const samplesDecoded = this._api._mpeg_decode_interleaved(
      this._decoder,
      this._inDataPtr,
      data.length,
      this._decodedBytesPtr,
      decodeInterval,
      this._leftPtr,
      this._rightPtr,
      this._outputLength,
      this._sampleRateBytePtr
    );

    this._sampleRate = this._sampleRateByte[0];

    return new this._MPEGDecodedAudio(
      [
        this._leftArr.slice(0, samplesDecoded),
        this._rightArr.slice(0, samplesDecoded),
      ],
      samplesDecoded,
      this._sampleRate
    );
  }

  decode(data) {
    let left = [],
      right = [],
      samples = 0;

    for (
      let offset = 0;
      offset < data.length;
      offset += this._decodedBytes[0]
    ) {
      const { channelData, samplesDecoded } = this._decode(
        data.subarray(offset, offset + this._inDataPtrSize),
        48
      );

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;
    }

    return new this._MPEGDecodedAudio(
      [
        this._WASMAudioDecoderCommon.concatFloat32(left, samples),
        this._WASMAudioDecoderCommon.concatFloat32(right, samples),
      ],
      samples,
      this._sampleRate
    );
  }

  decodeFrame(mpegFrame) {
    return this._decode(mpegFrame, mpegFrame.length);
  }

  decodeFrames(mpegFrames) {
    let left = [],
      right = [],
      samples = 0;

    for (const frame of mpegFrames) {
      const { channelData, samplesDecoded } = this.decodeFrame(frame);

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;
    }

    return new this._MPEGDecodedAudio(
      [
        this._WASMAudioDecoderCommon.concatFloat32(left, samples),
        this._WASMAudioDecoderCommon.concatFloat32(right, samples),
      ],
      samples,
      this._sampleRate
    );
  }
}
