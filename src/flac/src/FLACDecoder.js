import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import EmscriptenWASM from "./EmscriptenWasm.js";

export default function FLACDecoder(options = {}) {
  // static properties
  if (!FLACDecoder.errors) {
    // prettier-ignore
    Object.defineProperties(FLACDecoder, {
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

    const input = this._common.allocateTypedArray(data.length, Uint8Array);
    input.buf.set(data);

    const error = this._common.wasm._decode(
      this._decoder,
      input.ptr,
      input.len
    );

    if (error) {
      console.error(
        "libflac " +
          error +
          " " +
          (FLACDecoder.errors.get(error) || "Unknown Error")
      );
      return 0;
    }

    const output = new Float32Array(
      this._common.wasm.HEAP,
      this._outputBufferPtr.buf,
      this._outputBufferLen.buf
    );

    const decoded = {
      outputBuffer: this._common.getOutputChannels(
        output,
        this._channels.buf[0],
        this._samplesDecoded.buf[0]
      ),
      samplesDecoded: this._samplesDecoded.buf[0],
    };

    this._common.wasm._free(this._outputBufferPtr.buf);

    return decoded;
  };

  this.decodeFrame = (data) => {
    let outputBuffers = [],
      outputSamples = 0,
      i = 0;

    while (i < data.length) {
      const chunk = data.subarray(i, this._MAX_INPUT_SIZE);
      i += chunk.length;

      const decoded = this._decode(chunk);
      outputBuffers.push(decoded.outputBuffer);
      outputSamples += decoded.samplesDecoded;
    }

    return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      outputBuffers,
      this._channels.buf[0],
      outputSamples,
      this._sampleRate.buf[0]
    );
  };

  // injects dependencies when running as a web worker
  this._isWebWorker = FLACDecoder.isWebWorker;
  this._WASMAudioDecoderCommon =
    FLACDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  this._EmscriptenWASM = FLACDecoder.EmscriptenWASM || EmscriptenWASM;
  this._module = FLACDecoder.module;

  const MAX_FORCE_STEREO_CHANNELS = 8;

  const forceStereo = options.forceStereo ? 1 : 0;

  //this._forceStereo = channels <= MAX_FORCE_STEREO_CHANNELS && channels != 2 ? forceStereo : 0;

  //this._inputSize = 65535; // Max FLAC blocksize
  //this._outputChannelSize = 120 * 48;
  //this._outputChannels = this._forceStereo ? 2 : this._channels;

  this._MAX_INPUT_SIZE = 65535;

  this._ready = this._init();

  return this;
}
