import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";
import CodecParser from "codec-parser";

import EmscriptenWASM from "./EmscriptenWasm.js";

export function Decoder() {
  // injects dependencies when running as a web worker
  // async
  this._inputSize = 128 * 1024;

  this._init = () => {
    return new this._WASMAudioDecoderCommon(this)
      .instantiate()
      .then((common) => {
        this._common = common;

        this._firstPage = true;
        this._inputLen = this._common.allocateTypedArray(1, Uint32Array);

        this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
        this._channels = this._common.allocateTypedArray(1, Uint32Array);
        this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
        this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);

        const maxErrors = 128 * 2;
        this._errors = this._common.allocateTypedArray(maxErrors, Uint32Array);
        this._errorsLength = this._common.allocateTypedArray(1, Int32Array);

        this._decoder = this._common.wasm._create_decoder(
          this._input.ptr,
          this._inputLen.ptr,
          this._outputBufferPtr.ptr,
          this._channels.ptr,
          this._sampleRate.ptr,
          this._samplesDecoded.ptr,
          this._errors.ptr,
          this._errorsLength.ptr,
          maxErrors
        );

        this._vorbisSetupInProgress = true;
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

  this.sendSetupHeader = (data) => {
    this._input.buf.set(data);
    this._inputLen.buf[0] = data.length;

    this._common.wasm._send_setup(this._decoder, this._firstPage);
    this._firstPage = false;
  };

  this.initDsp = () => {
    this._common.wasm._init_dsp(this._decoder);
  };

  this.decodePackets = (packets) => {
    let outputBuffers = [],
      outputSamples = 0,
      errors = [];

    for (let packetIdx = 0; packetIdx < packets.length; packetIdx++) {
      const packet = packets[packetIdx];
      this._input.buf.set(packet);
      this._inputLen.buf[0] = packet.length;

      this._common.wasm._decode_packets(this._decoder);

      const samplesDecoded = this._samplesDecoded.buf[0];
      const channels = [];

      const outputBufferChannels = new Uint32Array(
        this._common.wasm.HEAP,
        this._outputBufferPtr.buf[0],
        this._channels.buf[0]
      );
      for (let channel = 0; channel < this._channels.buf[0]; channel++) {
        const output = new Float32Array(samplesDecoded);
        output.set(
          new Float32Array(
            this._common.wasm.HEAP,
            outputBufferChannels[channel],
            samplesDecoded
          )
        );

        channels.push(output);
      }

      outputBuffers.push(channels);
      outputSamples += samplesDecoded;

      this._frameNumber++;
      this._inputBytes += packet.length;
      this._outputSamples += samplesDecoded;

      // handle any errors that may have occurred
      for (let i = 0; i < this._errorsLength.buf; i += 2)
        this._common.addError(
          errors,
          this._common.codeToString(this._errors.buf[i]) +
            " " +
            this._common.codeToString(this._errors.buf[i + 1]),
          packet.length
        );

      // clear the error buffer
      this._errorsLength.buf[0] = 0;
    }

    return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      errors,
      outputBuffers,
      this._channels.buf[0],
      outputSamples,
      this._sampleRate.buf[0],
      16
    );
  };

  // injects dependencies when running as a web worker
  this._isWebWorker = Decoder.isWebWorker;
  this._WASMAudioDecoderCommon =
    Decoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  this._EmscriptenWASM = Decoder.EmscriptenWASM || EmscriptenWASM;
  this._module = Decoder.module;

  this._ready = this._init();

  return this;
}

export const setDecoderClass = Symbol();

export default class OggVorbisDecoder {
  constructor() {
    this._onCodec = (codec) => {
      if (codec !== "vorbis")
        throw new Error(
          "@wasm-audio-decoders/ogg-vorbis does not support this codec " + codec
        );
    };

    // instantiate to create static properties
    new WASMAudioDecoderCommon();

    this._init();
    this[setDecoderClass](Decoder);
  }

  _init() {
    this._vorbisSetupInProgress = true;
    this._codecParser = new CodecParser("audio/ogg", {
      onCodec: this._onCodec,
      enableFrameCRC32: false,
    });
  }

  [setDecoderClass](decoderClass) {
    if (this._decoder) {
      const oldDecoder = this._decoder;
      oldDecoder.ready.then(() => oldDecoder.free());
    }

    this._decoder = new decoderClass();
    this._ready = this._decoder.ready;
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this._init();
    return this._decoder.reset();
  }

  free() {
    this._decoder.free();
  }

  async _decode(oggPages) {
    let i = 0;

    if (this._vorbisSetupInProgress) {
      for (; i < oggPages.length; i++) {
        const oggPage = oggPages[i];

        if (oggPage.pageSequenceNumber === 0) {
          this._decoder.sendSetupHeader(oggPage.data);
        } else if (oggPage.codecFrames.length) {
          const header = oggPage.codecFrames[0].header;

          this._decoder.sendSetupHeader(header.vorbisComments);
          this._decoder.sendSetupHeader(header.vorbisSetup);
          this._decoder.initDsp();

          this._vorbisSetupInProgress = false;
          break;
        }
      }
    }

    return this._decoder.decodePackets(
      oggPages
        .slice(i)
        .map((f) => f.codecFrames.map((c) => c.data))
        .flat(1)
    );
  }

  async decode(vorbisData) {
    return this._decode([...this._codecParser.parseChunk(vorbisData)]);
  }

  async flush() {
    const decoded = this._decode([...this._codecParser.flush()]);

    await this.reset();
    return decoded;
  }

  async decodeFile(vorbisData) {
    const decoded = this._decode([...this._codecParser.parseAll(vorbisData)]);

    await this.reset();
    return decoded;
  }
}
