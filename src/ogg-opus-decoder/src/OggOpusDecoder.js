import { WASMAudioDecoderCommon } from "@wasm-audio-decoders/common";

import OpusDecodedAudio from "./OpusDecodedAudio.js";
import EmscriptenWASM from "./EmscriptenWasm.js";

let wasm;

export default class OggOpusDecoder {
  constructor(_WASMAudioDecoderCommon, _OpusDecodedAudio, _EmscriptenWASM) {
    // 120ms buffer recommended per http://opus-codec.org/docs/opusfile_api-0.7/group__stream__decoding.html
    this._outSize = 120 * 48; // 120ms @ 48 khz.

    //  Max data to send per iteration. 64k is the max for enqueueing in libopusfile.
    this._inputArrSize = 64 * 1024;

    this._ready = new Promise((resolve) =>
      this._init(
        _WASMAudioDecoderCommon,
        _OpusDecodedAudio,
        _EmscriptenWASM
      ).then(resolve)
    );
  }

  // injects dependencies when running as a web worker
  async _init(_WASMAudioDecoderCommon, _OpusDecodedAudio, _EmscriptenWASM) {
    if (!this._api) {
      const isWebWorker =
        _WASMAudioDecoderCommon && _OpusDecodedAudio && _EmscriptenWASM;

      if (isWebWorker) {
        // use classes injected into constructor parameters
        this._WASMAudioDecoderCommon = _WASMAudioDecoderCommon;
        this._OpusDecodedAudio = _OpusDecodedAudio;
        this._EmscriptenWASM = _EmscriptenWASM;

        // running as a webworker, use class level singleton for wasm compilation
        this._api = new this._EmscriptenWASM(this._WASMAudioDecoderCommon);
      } else {
        // use classes from es6 imports
        this._WASMAudioDecoderCommon = WASMAudioDecoderCommon;
        this._OpusDecodedAudio = OpusDecodedAudio;
        this._EmscriptenWASM = EmscriptenWASM;

        // use a global scope singleton so wasm compilation happens once only if class is instantiated
        if (!wasm) wasm = new this._EmscriptenWASM(this._WASMAudioDecoderCommon);
        this._api = wasm;
      }

      this._common = new this._WASMAudioDecoderCommon(this._api);
    }

    await this._api.ready;

    this._decoder = this._api._ogg_opus_decoder_create();

    // input data
    [this._inputPtr, this._input] = this._common.allocateTypedArray(
      this._inputArrSize,
      Uint8Array
    );

    // output data
    [this._leftPtr, this._leftArr] = this._common.allocateTypedArray(
      this._outSize,
      Float32Array
    );
    [this._rightPtr, this._rightArr] = this._common.allocateTypedArray(
      this._outSize,
      Float32Array
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
    this._api._ogg_opus_decoder_free(this._decoder);

    this._common.free();
  }

  /*  WARNING: When decoding chained Ogg files (i.e. streaming) the first two Ogg packets
               of the next chain must be present when decoding. Errors will be returned by
               libopusfile if these initial Ogg packets are incomplete. 
  */
  decode(data) {
    if (!(data instanceof Uint8Array))
      throw Error(
        `Data to decode must be Uint8Array. Instead got ${typeof data}`
      );

    let decodedLeft = [],
      decodedRight = [],
      decodedSamples = 0,
      offset = 0;

    while (offset < data.length) {
      const dataToSend = data.subarray(
        offset,
        offset + Math.min(this._inputArrSize, data.length - offset)
      );

      offset += dataToSend.length;

      this._input.set(dataToSend);

      // enqueue bytes to decode. Fail on error
      if (
        !this._api._ogg_opus_decoder_enqueue(
          this._decoder,
          this._inputPtr,
          dataToSend.length
        )
      )
        throw Error(
          "Could not enqueue bytes for decoding. You may also have invalid Ogg Opus file."
        );

      // continue to decode until no more bytes are left to decode
      let samplesDecoded;
      while (
        (samplesDecoded = this._api._ogg_opus_decode_float_stereo_deinterleaved(
          this._decoder,
          this._leftPtr, // left channel
          this._rightPtr // right channel
        )) > 0
      ) {
        decodedLeft.push(this._leftArr.slice(0, samplesDecoded));
        decodedRight.push(this._rightArr.slice(0, samplesDecoded));
        decodedSamples += samplesDecoded;
      }

      // prettier-ignore
      if (samplesDecoded < 0) {
        const errors = {
          [-1]: "A request did not succeed.",
          [-3]: "There was a hole in the page sequence numbers (e.g., a page was corrupt or missing).",
          [-128]: "An underlying read, seek, or tell operation failed when it should have succeeded.",
          [-129]: "A NULL pointer was passed where one was unexpected, or an internal memory allocation failed, or an internal library error was encountered.",
          [-130]: "The stream used a feature that is not implemented, such as an unsupported channel family.",
          [-131]: "One or more parameters to a function were invalid.",
          [-132]: "A purported Ogg Opus stream did not begin with an Ogg page, a purported header packet did not start with one of the required strings, \"OpusHead\" or \"OpusTags\", or a link in a chained file was encountered that did not contain any logical Opus streams.",
          [-133]: "A required header packet was not properly formatted, contained illegal values, or was missing altogether.",
          [-134]: "The ID header contained an unrecognized version number.",
          [-136]: "An audio packet failed to decode properly. This is usually caused by a multistream Ogg packet where the durations of the individual Opus packets contained in it are not all the same.",
          [-137]: "We failed to find data we had seen before, or the bitstream structure was sufficiently malformed that seeking to the target destination was impossible.",
          [-138]: "An operation that requires seeking was requested on an unseekable stream.",
          [-139]: "The first or last granule position of a link failed basic validity checks.",
        }
  
        throw new Error(
          `libopusfile ${samplesDecoded}: ${
            errors[samplesDecoded] || "Unknown Error"
          }`
        );
      }
    }

    return new this._OpusDecodedAudio(
      [
        this._WASMAudioDecoderCommon.concatFloat32(decodedLeft, decodedSamples),
        this._WASMAudioDecoderCommon.concatFloat32(
          decodedRight,
          decodedSamples
        ),
      ],
      decodedSamples
    );
  }
}
