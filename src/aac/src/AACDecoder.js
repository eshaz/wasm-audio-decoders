import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import CodecParser, { data } from "codec-parser";

import EmscriptenWASM from "./EmscriptenWasm.js";

// transport formats, must match aac_decoder.h
const TRANSPORT_ADTS = 0;
const TRANSPORT_ADIF = 1;
const TRANSPORT_RAW = 2;

export function _AACDecoder(options = {}) {
  // injects dependencies when running as a web worker
  // async
  this._init = () => {
    return new this._WASMAudioDecoderCommon()
      .instantiate(this._EmscriptenWASM, this._module)
      .then((common) => {
        this._common = common;

        this._inputBytes = 0;
        this._outputSamples = 0;
        this._frameNumber = 0;

        this._input = this._common.allocateTypedArray(
          this._inputSize,
          Uint8Array,
        );

        this._channels = this._common.allocateTypedArray(1, Uint32Array);
        this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
        this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
        this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
        this._outputBufferLen = this._common.allocateTypedArray(1, Uint32Array);

        this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);

        let ascPtr = 0,
          ascLen = 0;

        if (this._audioSpecificConfig) {
          const asc = this._common.allocateTypedArray(
            this._audioSpecificConfig.length,
            Uint8Array,
          );
          asc.buf.set(this._audioSpecificConfig);

          ascPtr = asc.ptr;
          ascLen = asc.len;
        }

        this._decoder = this._common.wasm.create_decoder(
          this._transportFormat,
          ascPtr,
          ascLen,
          this._channels.ptr,
          this._sampleRate.ptr,
          this._samplesDecoded.ptr,
          this._outputBufferPtr.ptr,
          this._outputBufferLen.ptr,
          this._errorStringPtr.ptr,
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
    this._common.wasm.destroy_decoder(this._decoder);

    this._common.free();
  };

  this._decode = (data) => {
    if (!(data instanceof Uint8Array))
      throw Error(
        "Data to decode must be Uint8Array. Instead got " + typeof data,
      );

    this._input.buf.set(data);

    this._common.wasm.decode_frame(this._decoder, this._input.ptr, data.length);

    let error;
    if (this._errorStringPtr.buf[0]) {
      error = this._common.codeToString(this._errorStringPtr.buf[0]);
      console.error("@wasm-audio-decoders/aac: \n\t" + error);
    }

    const output = new Float32Array(
      this._common.wasm.HEAP,
      this._outputBufferPtr.buf[0],
      this._outputBufferLen.buf[0],
    );

    const decoded = {
      error: error,
      outputBuffer: this._common.getOutputChannels(
        output,
        this._channels.buf[0],
        this._samplesDecoded.buf[0],
      ),
      samplesDecoded: this._samplesDecoded.buf[0],
    };

    this._common.wasm.free(this._outputBufferPtr.buf[0]);
    this._outputBufferPtr.buf[0] = 0;
    this._outputBufferLen.buf[0] = 0;
    this._samplesDecoded.buf[0] = 0;

    return decoded;
  };

  this.decodeFrames = (frames) => {
    let outputBuffers = [],
      errors = [],
      outputSamples = 0;

    for (let i = 0; i < frames.length; i++) {
      let offset = 0;
      const data = frames[i];

      while (offset < data.length) {
        const chunk = data.subarray(offset, offset + this._inputSize);
        offset += chunk.length;

        const decoded = this._decode(chunk);

        outputBuffers.push(decoded.outputBuffer);
        outputSamples += decoded.samplesDecoded;

        if (decoded.error)
          this._common.addError(
            errors,
            decoded.error,
            data.length,
            this._frameNumber,
            this._inputBytes,
            this._outputSamples,
          );

        this._inputBytes += chunk.length;
        this._outputSamples += decoded.samplesDecoded;
      }

      this._frameNumber++;
    }

    return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      errors,
      outputBuffers,
      this._channels.buf[0],
      outputSamples,
      this._sampleRate.buf[0],
    );
  };

  // injects dependencies when running as a web worker
  this._isWebWorker = _AACDecoder.isWebWorker;
  this._WASMAudioDecoderCommon =
    _AACDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  this._EmscriptenWASM = _AACDecoder.EmscriptenWASM || EmscriptenWASM;
  this._module = _AACDecoder.module;

  this._transportFormat = options.transportFormat || 0;
  this._audioSpecificConfig = options.audioSpecificConfig;

  this._inputSize = 2 ** 16;

  this._ready = this._init();

  return this;
}

export const setDecoderClass = Symbol();

const determineDecodeMethod = Symbol();
const decodeAdts = Symbol();
const decodeAdif = Symbol();
const decodeRaw = Symbol();
const placeholderDecodeMethod = Symbol();
const decodeMethod = Symbol();
const init = Symbol();

export default class AACDecoder {
  constructor(options = {}) {
    this._onCodec = (codec) => {
      if (codec !== "aac")
        throw new Error(
          "@wasm-audio-decoders/aac does not support this codec " + codec,
        );
    };

    // instantiate to create static properties
    new WASMAudioDecoderCommon();

    this._audioSpecificConfig = options.audioSpecificConfig;
    this._transportFormat = this._audioSpecificConfig
      ? TRANSPORT_RAW
      : TRANSPORT_ADTS;

    this[init]();
    this[setDecoderClass](_AACDecoder);
  }

  [init]() {
    this[decodeMethod] = this._audioSpecificConfig
      ? decodeRaw
      : placeholderDecodeMethod;
    this._codecParser = null;
  }

  async [determineDecodeMethod](data) {
    let transportFormat = TRANSPORT_ADTS;

    if (
      data.length >= 4 &&
      data[0] === 0x41 && // A
      data[1] === 0x44 && // D
      data[2] === 0x49 && // I
      data[3] === 0x46 //    F
    ) {
      transportFormat = TRANSPORT_ADIF;
      this[decodeMethod] = decodeAdif;
    } else {
      this[decodeMethod] = decodeAdts;
      this._codecParser = new CodecParser("audio/aac", {
        onCodec: this._onCodec,
        enableFrameCRC32: false,
      });
    }

    if (transportFormat !== this._transportFormat) {
      this._transportFormat = transportFormat;
      this[setDecoderClass](this._decoderClass);
    }

    await this._ready;
  }

  [setDecoderClass](decoderClass) {
    if (this._decoder) {
      const oldDecoder = this._decoder;
      oldDecoder.ready.then(() => oldDecoder.free());
    }

    this._decoderClass = decoderClass;
    this._decoder = new decoderClass({
      transportFormat: this._transportFormat,
      audioSpecificConfig: this._audioSpecificConfig,
    });
    this._ready = this._decoder.ready;
  }

  [decodeAdts](aacFrames) {
    return this._decoder.decodeFrames(aacFrames.map((f) => f[data] || f));
  }

  [decodeAdif](aacChunks) {
    return this._decoder.decodeFrames(aacChunks);
  }

  [decodeRaw]() {
    throw Error(
      "@wasm-audio-decoders/aac: decode() and decodeFile() are not supported when audioSpecificConfig is set. Use decodeFrames() with raw AAC frames.",
    );
  }

  [placeholderDecodeMethod]() {
    return WASMAudioDecoderCommon.getDecodedAudio([], [], 0, 0, 0);
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this[init]();
    return this._decoder.reset();
  }

  free() {
    this._decoder.free();
  }

  async decode(aacData) {
    if (this[decodeMethod] === decodeRaw) return this[decodeRaw]();

    if (this[decodeMethod] === placeholderDecodeMethod)
      await this[determineDecodeMethod](aacData);

    if (this[decodeMethod] === decodeAdif) return this[decodeAdif]([aacData]);

    return this[decodeAdts]([...this._codecParser.parseChunk(aacData)]);
  }

  async flush() {
    const decoded =
      this[decodeMethod] === decodeAdts
        ? this[decodeAdts]([...this._codecParser.flush()])
        : this[decodeMethod] === decodeAdif
          ? this[decodeAdif]([])
          : this[placeholderDecodeMethod]();

    await this.reset();
    return decoded;
  }

  async decodeFile(aacData) {
    if (this[decodeMethod] === decodeRaw) return this[decodeRaw]();

    if (this[decodeMethod] === placeholderDecodeMethod)
      await this[determineDecodeMethod](aacData);

    const decoded =
      this[decodeMethod] === decodeAdif
        ? await this[decodeAdif]([aacData])
        : this[decodeAdts]([...this._codecParser.parseAll(aacData)]);

    await this.reset();
    return decoded;
  }

  async decodeFrames(aacFrames) {
    return this._decoder.decodeFrames(aacFrames);
  }
}
