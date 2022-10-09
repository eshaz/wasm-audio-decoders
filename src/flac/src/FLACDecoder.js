import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import CodecParser from "codec-parser";

import EmscriptenWASM from "./EmscriptenWasm.js";

export function Decoder(options = {}) {
  // static properties
  if (!Decoder.errors) {
    // prettier-ignore
    Object.defineProperties(Decoder, {
      errors: {
        value: new Map([
          [-1, "@wasm-audio-decoders/flac: Too many input buffers"],
          [1,  "FLAC__STREAM_DECODER_SEARCH_FOR_METADATA: The decoder is ready to search for metadata."],
          [2,  "FLAC__STREAM_DECODER_READ_METADATA: The decoder is ready to or is in the process of reading metadata."],
          [3,  "FLAC__STREAM_DECODER_SEARCH_FOR_FRAME_SYNC: The decoder is ready to or is in the process of searching for the frame sync code."],
          [4,  "FLAC__STREAM_DECODER_READ_FRAME: The decoder is ready to or is in the process of reading a frame."],
          [5,  "FLAC__STREAM_DECODER_END_OF_STREAM: The decoder has reached the end of the stream."],
          [6,  "FLAC__STREAM_DECODER_OGG_ERROR: An error occurred in the underlying Ogg layer."],
          [7,  "FLAC__STREAM_DECODER_SEEK_ERROR: An error occurred while seeking. The decoder must be flushed with FLAC__stream_decoder_flush() or reset with FLAC__stream_decoder_reset() before decoding can continue."],
          [8,  "FLAC__STREAM_DECODER_ABORTED: The decoder was aborted by the read or write callback."],
          [9,  "FLAC__STREAM_DECODER_MEMORY_ALLOCATION_ERROR: An error occurred allocating memory. The decoder is in an invalid state and can no longer be used."],
          [10, "FLAC__STREAM_DECODER_UNINITIALIZED: The decoder is in the uninitialized state; one of the FLAC__stream_decoder_init_*() functions must be called before samples can be processed."],
        ]),
      },
    });
  }

  // injects dependencies when running as a web worker
  // async
  this._init = () => {
    return new this._WASMAudioDecoderCommon(this)
      .instantiate()
      .then((common) => {
        this._common = common;

        this._channels = this._common.allocateTypedArray(1, Uint32Array);
        this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
        this._bitsPerSample = this._common.allocateTypedArray(1, Uint32Array);
        this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
        this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
        this._outputBufferLen = this._common.allocateTypedArray(1, Uint32Array);

        this._decoder = this._common.wasm._create_decoder(
          this._channels.ptr,
          this._sampleRate.ptr,
          this._bitsPerSample.ptr,
          this._samplesDecoded.ptr,
          this._outputBufferPtr.ptr,
          this._outputBufferLen.ptr
        );
      });
  };

  Object.defineProperty(this, "ready", {
    enumerable: true,
    get: () => this._ready,
  });

  // async
  this.reset = () => {
    this.free();
    return this._init();
  };

  this.free = () => {
    this._common.wasm._destroy_decoder(this._decoder);

    this._common.free();
  };

  this._decode = (data) => {
    if (!(data instanceof Uint8Array))
      throw Error(
        "Data to decode must be Uint8Array. Instead got " + typeof data
      );

    const input = this._common.allocateTypedArray(
      data.length,
      Uint8Array,
      false
    );
    input.buf.set(data);

    const error = this._common.wasm._decode_frame(
      this._decoder,
      input.ptr,
      input.len
    );

    if (error) {
      console.error(
        "libflac " +
          error +
          " " +
          (Decoder.errors.get(error) || "Unknown Error")
      );
      return 0;
    }

    const output = new Float32Array(
      this._common.wasm.HEAP,
      this._outputBufferPtr.buf[0],
      this._outputBufferLen.buf[0]
    );

    const decoded = {
      outputBuffer: this._common.getOutputChannels(
        output,
        this._channels.buf[0],
        this._samplesDecoded.buf[0]
      ),
      samplesDecoded: this._samplesDecoded.buf[0],
    };

    this._common.wasm._free(this._outputBufferPtr.buf[0]);
    this._outputBufferLen.buf[0] = 0;
    this._samplesDecoded.buf[0] = 0;

    return decoded;
  };

  this.decodeFrames = (frames) => {
    let outputBuffers = [],
      outputSamples = 0;

    for (let i = 0; i < frames.length; i++) {
      let offset = 0;
      const data = frames[i];

      while (offset < data.length) {
        const chunk = data.subarray(offset, offset + this._MAX_INPUT_SIZE);
        offset += chunk.length;

        const decoded = this._decode(chunk);
        outputBuffers.push(decoded.outputBuffer);
        outputSamples += decoded.samplesDecoded;
      }
    }

    return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      outputBuffers,
      this._channels.buf[0],
      outputSamples,
      this._sampleRate.buf[0],
      this._bitsPerSample.buf[0]
    );
  };

  // injects dependencies when running as a web worker
  this._isWebWorker = Decoder.isWebWorker;
  this._WASMAudioDecoderCommon =
    Decoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  this._EmscriptenWASM = Decoder.EmscriptenWASM || EmscriptenWASM;
  this._module = Decoder.module;

  this._MAX_INPUT_SIZE = 65535 * 8;

  this._ready = this._init();

  return this;
}

class DecoderState {
  constructor(instance) {
    this._instance = instance;

    this._decoderOperations = [];
    this._decoded = [];
    this._channelsDecoded = 0;
    this._totalSamples = 0;
  }

  get decoded() {
    return this._instance.ready
      .then(() => Promise.all(this._decoderOperations))
      .then(() => [
        this._decoded,
        this._channelsDecoded,
        this._totalSamples,
        this._sampleRate,
        this._bitDepth
      ]);
  }

  async _instantiateDecoder() {
    this._instance._decoder = new this._instance._decoderClass();
    this._instance._ready = this._instance._decoder.ready;
  }

  async _sendToDecoder(frames) {
    const { channelData, samplesDecoded, sampleRate, bitDepth } =
      await this._instance._decoder.decodeFrames(frames);

    this._decoded.push(channelData);
    this._totalSamples += samplesDecoded;
    this._sampleRate = sampleRate;
    this._channelsDecoded = channelData.length;
    this._bitDepth = bitDepth;
  }

  async _decode(frames) {
    if (frames) {
      if (!this._instance._decoder && frames.length) this._instantiateDecoder();

      await this._instance.ready;

      this._decoderOperations.push(this._sendToDecoder(frames));
    }
  }
}

export default class FLACDecoder {
  constructor() {
    this._onCodec = (codec) => {
      if (codec !== "flac")
        throw new Error("@wasm-audio-decoders/flac does not support this codec " + codec);
    };

    // instantiate to create static properties
    new WASMAudioDecoderCommon();
    this._decoderClass = Decoder;

    this._init();
  }

  _init() {
    if (this._decoder) this._decoder.free();
    this._decoder = null;
    this._ready = Promise.resolve();

    this._codecParser = new CodecParser("audio/flac", {
      onCodec: this._onCodec,
      enableFrameCRC32: false,
    });
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this._init();
  }

  free() {
    this._init();
  }

  async _decodeFrames(flacFrames, decoderState) {
    decoderState._decode(flacFrames);

    return decoderState.decoded;
  }

  async _flush(decoderState) {
    const frames = [...this._codecParser.flush()].map((f) => f.data);

    decoderState._decode(frames);

    const decoded = await decoderState.decoded;
    this._init();

    return decoded;
  }

  async _decode(flacData, decoderState) {
    return this._decodeFrames(
      [...this._codecParser.parseChunk(flacData)].map((f) => f.data),
      decoderState
    );
  }

  async decode(flacData) {
    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._decode(flacData, new DecoderState(this)))
    );
  }

  async flush() {
    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._flush(new DecoderState(this)))
    );
  }

  async decodeFile(flacData) {
    const decoderState = new DecoderState(this);

    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._decode(flacData, decoderState).then(() =>
        this._flush(decoderState)
      ))
    );
  }

  async decodeFrames(flacFrames) {
    return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      ...(await this._decodeFrames(flacFrames, new DecoderState(this)))
    );
  }
}
