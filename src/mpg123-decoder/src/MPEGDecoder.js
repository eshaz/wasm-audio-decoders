import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import EmscriptenWASM from "./EmscriptenWasm.js";

export default class MPEGDecoder {
  constructor(options = {}) {
    // injects dependencies when running as a web worker
    this._isWebWorker = this.constructor.isWebWorker;
    this._WASMAudioDecoderCommon =
      this.constructor.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = this.constructor.EmscriptenWASM || EmscriptenWASM;

    this._inputPtrSize = 2 ** 18;
    this._outputPtrSize = 1152 * 512;
    this._outputChannels = 2;

    this._ready = this._init();
  }

  // injects dependencies when running as a web worker
  async _init() {
    this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
      this
    )();

    this._sampleRate = 0;

    // input decoded bytes pointer
    [this._decodedBytesPtr, this._decodedBytes] =
      this._common.allocateTypedArray(1, Uint32Array);

    // sample rate
    [this._sampleRateBytePtr, this._sampleRateByte] =
      this._common.allocateTypedArray(1, Uint32Array);

    this._decoder = this._wasm._mpeg_frame_decoder_create();
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this.free();
    await this._init();
  }

  free() {
    this._wasm._mpeg_frame_decoder_destroy(this._decoder);
    this._wasm._free(this._decoder);

    this._common.free();
  }

  _decode(data, decodeInterval) {
    if (!(data instanceof Uint8Array))
      throw Error(
        `Data to decode must be Uint8Array. Instead got ${typeof data}`
      );

    this._input.set(data);
    this._decodedBytes[0] = 0;

    const samplesDecoded = this._wasm._mpeg_decode_interleaved(
      this._decoder,
      this._inputPtr,
      data.length,
      this._decodedBytesPtr,
      decodeInterval,
      this._outputPtr,
      this._outputPtrSize,
      this._sampleRateBytePtr
    );

    this._sampleRate = this._sampleRateByte[0];

    return this._WASMAudioDecoderCommon.getDecodedAudio(
      [
        this._output.slice(0, samplesDecoded),
        this._output.slice(
          this._outputPtrSize,
          this._outputPtrSize + samplesDecoded
        ),
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
        data.subarray(offset, offset + this._inputPtrSize),
        48
      );

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;
    }

    return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
      [left, right],
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

    return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
      [left, right],
      samples,
      this._sampleRate
    );
  }
}
