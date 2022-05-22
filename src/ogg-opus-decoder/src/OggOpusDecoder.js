import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import EmscriptenWASM from "./EmscriptenWasm.js";

export default function OggOpusDecoder(options = {}) {
  // static properties
  if (!OggOpusDecoder.errors) {
    const errors = new Map();
    // prettier-ignore
    errors.set(-1, "OP_FALSE: A request did not succeed."),
    errors.set(-3, "OP_HOLE: There was a hole in the page sequence numbers (e.g., a page was corrupt or missing)."),
    errors.set(-128, "OP_EREAD: An underlying read, seek, or tell operation failed when it should have succeeded."),
    errors.set(-129, "OP_EFAULT: A NULL pointer was passed where one was unexpected, or an internal memory allocation failed, or an internal library error was encountered."),
    errors.set(-130, "OP_EIMPL: The stream used a feature that is not implemented, such as an unsupported channel family."),
    errors.set(-131, "OP_EINVAL: One or more parameters to a function were invalid."),
    errors.set(-132, "OP_ENOTFORMAT: A purported Ogg Opus stream did not begin with an Ogg page, a purported header packet did not start with one of the required strings, \"OpusHead\" or \"OpusTags\", or a link in a chained file was encountered that did not contain any logical Opus streams."),
    errors.set(-133, "OP_EBADHEADER: A required header packet was not properly formatted, contained illegal values, or was missing altogether."),
    errors.set(-134, "OP_EVERSION: The ID header contained an unrecognized version number."),
    errors.set(-136, "OP_EBADPACKET: An audio packet failed to decode properly. This is usually caused by a multistream Ogg packet where the durations of the individual Opus packets contained in it are not all the same."),
    errors.set(-137, "OP_EBADLINK: We failed to find data we had seen before, or the bitstream structure was sufficiently malformed that seeking to the target destination was impossible."),
    errors.set(-138, "OP_ENOSEEK: An operation that requires seeking was requested on an unseekable stream."),
    errors.set(-139, "OP_EBADTIMESTAMP: The first or last granule position of a link failed basic validity checks."),
    errors.set(-140, "Input buffer overflow");

    Object.defineProperties(OggOpusDecoder, {
      errors: {
        value: errors,
      },
    });
  }

  const methods = {
    _init() {
      return new this._WASMAudioDecoderCommon(this).then((common) => {
        this._common = common;

        const channelsDecoded = this._common.allocateTypedArray(1, Uint32Array);
        this._channelsDecodedPtr = channelsDecoded[0];
        this._channelsDecoded = channelsDecoded[1];

        this._decoder = this._common.wasm._ogg_opus_decoder_create(
          this._forceStereo
        );
      });
    },

    get ready() {
      return this._ready;
    },

    reset() {
      this.free();
      return this._init();
    },

    free() {
      this._common.wasm._ogg_opus_decoder_free(this._decoder);
      this._common.free();
    },

    decode(data) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      let output = [],
        decodedSamples = 0,
        offset = 0;

      try {
        while (offset < data.length) {
          const dataToSend = data.subarray(
            offset,
            offset +
              (this._inputPtrSize > data.length - offset
                ? data.length - offset
                : this._inputPtrSize)
          );

          offset += dataToSend.length;

          this._input.set(dataToSend);

          const samplesDecoded = this._common.wasm._ogg_opus_decoder_decode(
            this._decoder,
            this._inputPtr,
            dataToSend.length,
            this._channelsDecodedPtr,
            this._outputPtr
          );

          if (samplesDecoded < 0) throw { code: samplesDecoded };

          decodedSamples += samplesDecoded;
          output.push(
            this._common.getOutputChannels(
              this._output,
              this._channelsDecoded[0],
              samplesDecoded
            )
          );
        }
      } catch (e) {
        if (e.code)
          throw new Error(
            "libopusfile " +
              e.code +
              " " +
              (OggOpusDecoder.errors.get(e.code) || "Unknown Error")
          );
        throw e;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        this._channelsDecoded[0],
        decodedSamples,
        48000
      );
    },
  };

  const instance = Object.create(methods);

  // injects dependencies when running as a web worker
  instance._isWebWorker = OggOpusDecoder.isWebWorker;
  instance._WASMAudioDecoderCommon =
    OggOpusDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  instance._EmscriptenWASM = OggOpusDecoder.EmscriptenWASM || EmscriptenWASM;

  instance._forceStereo = options.forceStereo || false;

  instance._inputPtrSize = 32 * 1024;
  // 120ms buffer recommended per http://opus-codec.org/docs/opusfile_api-0.7/group__stream__decoding.html
  // per channel
  instance._outputPtrSize = 120 * 48 * 32; // 120ms @ 48 khz.
  instance._outputChannels = 8; // max opus output channels

  instance._ready = instance._init();

  return instance;
}
