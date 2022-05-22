import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import EmscriptenWASM from "./EmscriptenWasm.js";

export default function MPEGDecoder(options = {}) {
  const methods = {
    // injects dependencies when running as a web worker
    // async
    _init() {
      return new this._WASMAudioDecoderCommon(this).then((common) => {
        this._common = common;

        this._sampleRate = 0;

        this._decodedBytes = this._common.allocateTypedArray(1, Uint32Array);
        this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);

        this._decoder = this._common.wasm._mpeg_frame_decoder_create();
      });
    },

    get ready() {
      return this._ready;
    },

    // async
    reset() {
      this.free();
      return this._init();
    },

    free() {
      this._common.wasm._mpeg_frame_decoder_destroy(this._decoder);
      this._common.wasm._free(this._decoder);

      this._common.free();
    },

    _decode(data, decodeInterval) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._input.buf.set(data);
      this._decodedBytes.buf[0] = 0;

      const samplesDecoded = this._common.wasm._mpeg_decode_interleaved(
        this._decoder,
        this._input.ptr,
        data.length,
        this._decodedBytes.ptr,
        decodeInterval,
        this._output.ptr,
        this._outputChannelSize,
        this._sampleRateBytes.ptr
      );

      this._sampleRate = this._sampleRateBytes.buf[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._output.buf.slice(0, samplesDecoded),
          this._output.buf.slice(
            this._outputChannelSize,
            this._outputChannelSize + samplesDecoded
          ),
        ],
        samplesDecoded,
        this._sampleRate
      );
    },

    decode(data) {
      let output = [],
        samples = 0;

      for (
        let offset = 0;
        offset < data.length;
        offset += this._decodedBytes.buf[0]
      ) {
        const decoded = this._decode(
          data.subarray(offset, offset + this._input.len),
          48
        );

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    },

    decodeFrame(mpegFrame) {
      return this._decode(mpegFrame, mpegFrame.length);
    },

    decodeFrames(mpegFrames) {
      let output = [],
        samples = 0;

      for (let i = 0; i < mpegFrames.length; i++) {
        const decoded = this.decodeFrame(mpegFrames[i]);

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    },
  };

  // constructor
  const instance = Object.create(methods);

  // injects dependencies when running as a web worker
  instance._isWebWorker = MPEGDecoder.isWebWorker;
  instance._WASMAudioDecoderCommon =
    MPEGDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  instance._EmscriptenWASM = MPEGDecoder.EmscriptenWASM || EmscriptenWASM;

  instance._inputSize = 2 ** 18;
  instance._outputChannelSize = 1152 * 512;
  instance._outputChannels = 2;

  instance._ready = instance._init();
  return instance;
}
