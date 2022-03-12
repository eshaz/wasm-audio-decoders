import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import EmscriptenWASM from "./EmscriptenWasm.js";

export default class OpusDecoder {
  constructor(options = {}) {
    // injects dependencies when running as a web worker
    this._isWebWorker = this.constructor.isWebWorker;
    this._WASMAudioDecoderCommon =
      this.constructor.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = this.constructor.EmscriptenWASM || EmscriptenWASM;

    this._channels = options.channels || 2;
    this._streamCount = options.streamCount || 1;
    this._coupledStreamCount = options.coupledStreamCount || 1;
    this._channelMappingTable = options.channelMappingTable || [0, 1];
    this._preSkip = options.preSkip || 0;

    this._inputPtrSize = 32000 * 0.12 * this._channels; // 256kbs per channel
    this._outputPtrSize = 120 * 48;
    this._outputChannels = this._channels;

    this._ready = this._init();

    // prettier-ignore
    this._errors = {
      [-1]: "OPUS_BAD_ARG: One or more invalid/out of range arguments",
      [-2]: "OPUS_BUFFER_TOO_SMALL: Not enough bytes allocated in the buffer",
      [-3]: "OPUS_INTERNAL_ERROR: An internal error was detected",
      [-4]: "OPUS_INVALID_PACKET: The compressed data passed is corrupted",
      [-5]: "OPUS_UNIMPLEMENTED: Invalid/unsupported request number",
      [-6]: "OPUS_INVALID_STATE: An encoder or decoder structure is invalid or already freed",
      [-7]: "OPUS_ALLOC_FAIL: Memory allocation has failed"
    }
  }

  // injects dependencies when running as a web worker
  async _init() {
    this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
      this
    )();

    const [mappingPtr, mappingArr] = this._common.allocateTypedArray(
      this._channels,
      Uint8Array
    );
    mappingArr.set(this._channelMappingTable);

    this._decoder = this._common.wasm._opus_frame_decoder_create(
      this._channels,
      this._streamCount,
      this._coupledStreamCount,
      mappingPtr,
      this._preSkip
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
    this._common.wasm._opus_frame_decoder_destroy(this._decoder);

    this._common.free();
  }

  _decode(opusFrame) {
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
        this._outputPtr
      );

    if (samplesDecoded < 0) {
      console.error(
        `libopus ${samplesDecoded} ${this._errors[samplesDecoded]}`
      );
      return 0;
    }
    return samplesDecoded;
  }

  decodeFrame(opusFrame) {
    const samplesDecoded = this._decode(opusFrame);

    return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      this._output,
      this._channels,
      samplesDecoded,
      48000
    );
  }

  decodeFrames(opusFrames) {
    let outputBuffers = [],
      outputSamples = 0;

    opusFrames.forEach((frame) => {
      const samplesDecoded = this._decode(frame);

      outputBuffers.push(
        this._common.getOutputChannels(
          this._output,
          this._channels,
          samplesDecoded
        )
      );
      outputSamples += samplesDecoded;
    });

    const data = this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      outputBuffers,
      this._channels,
      outputSamples,
      48000
    );

    return data;
  }
}
