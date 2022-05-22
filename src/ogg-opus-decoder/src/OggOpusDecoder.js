import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import EmscriptenWASM from "./EmscriptenWasm.js";

export default function OggOpusDecoder(options = {}) {
  // static properties
  if (!OggOpusDecoder.errors) {
    // prettier-ignore
    Object.defineProperties(OggOpusDecoder, {
      errors: {
        value: new Map([
          [-1, "OP_FALSE: A request did not succeed."],
          [-3, "OP_HOLE: There was a hole in the page sequence numbers (e.g., a page was corrupt or missing)."],
          [-128, "OP_EREAD: An underlying read, seek, or tell operation failed when it should have succeeded."],
          [-129, "OP_EFAULT: A NULL pointer was passed where one was unexpected, or an internal memory allocation failed, or an internal library error was encountered."],
          [-130, "OP_EIMPL: The stream used a feature that is not implemented, such as an unsupported channel family."],
          [-131, "OP_EINVAL: One or more parameters to a function were invalid."],
          [-132, "OP_ENOTFORMAT: A purported Ogg Opus stream did not begin with an Ogg page, a purported header packet did not start with one of the required strings, \"OpusHead\" or \"OpusTags\", or a link in a chained file was encountered that did not contain any logical Opus streams."],
          [-133, "OP_EBADHEADER: A required header packet was not properly formatted, contained illegal values, or was missing altogether."],
          [-134, "OP_EVERSION: The ID header contained an unrecognized version number."],
          [-136, "OP_EBADPACKET: An audio packet failed to decode properly. This is usually caused by a multistream Ogg packet where the durations of the individual Opus packets contained in it are not all the same."],
          [-137, "OP_EBADLINK: We failed to find data we had seen before, or the bitstream structure was sufficiently malformed that seeking to the target destination was impossible."],
          [-138, "OP_ENOSEEK: An operation that requires seeking was requested on an unseekable stream."],
          [-139, "OP_EBADTIMESTAMP: The first or last granule position of a link failed basic validity checks."],
          [-140, "Input buffer overflow"],
        ]),
      },
    });
  }

  this._init = () => {
    return new this._WASMAudioDecoderCommon(this).then((common) => {
      this._common = common;

      this._channelsDecoded = this._common.allocateTypedArray(1, Uint32Array);

      this._decoder = this._common.wasm._ogg_opus_decoder_create(
        this._forceStereo
      );
    });
  };

  Object.defineProperty(this, "ready", {
    enumerable: true,
    get: () => this._ready,
  });

  this.reset = () => {
    this.free();
    return this._init();
  };

  this.free = () => {
    this._common.wasm._ogg_opus_decoder_free(this._decoder);
    this._common.free();
  };

  this.decode = (data) => {
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
            (this._input.len > data.length - offset
              ? data.length - offset
              : this._input.len)
        );

        offset += dataToSend.length;

        this._input.buf.set(dataToSend);

        const samplesDecoded = this._common.wasm._ogg_opus_decoder_decode(
          this._decoder,
          this._input.ptr,
          dataToSend.length,
          this._channelsDecoded.ptr,
          this._output.ptr
        );

        if (samplesDecoded < 0) throw { code: samplesDecoded };

        decodedSamples += samplesDecoded;
        output.push(
          this._common.getOutputChannels(
            this._output.buf,
            this._channelsDecoded.buf[0],
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
      this._channelsDecoded.buf[0],
      decodedSamples,
      48000
    );
  };

  // injects dependencies when running as a web worker
  this._isWebWorker = OggOpusDecoder.isWebWorker;
  this._WASMAudioDecoderCommon =
    OggOpusDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  this._EmscriptenWASM = OggOpusDecoder.EmscriptenWASM || EmscriptenWASM;

  this._forceStereo = options.forceStereo || false;

  this._inputSize = 32 * 1024;
  // 120ms buffer recommended per http://opus-codec.org/docs/opusfile_api-0.7/group__stream__decoding.html
  // per channel
  this._outputChannelSize = 120 * 48 * 32; // 120ms @ 48 khz.
  this._outputChannels = 8; // max opus output channels

  this._ready = this._init();

  return this;
}
