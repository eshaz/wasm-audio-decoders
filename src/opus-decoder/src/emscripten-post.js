const decoderReady = new Promise((resolve) => {
  ready = resolve;
});

const concatFloat32 = (buffers, length) => {
  const ret = new Float32Array(length);

  let offset = 0;
  for (const buf of buffers) {
    ret.set(buf, offset);
    offset += buf.length;
  }

  return ret;
};

// Decoder will pass decoded PCM data to onDecode
class OpusDecodedAudio {
  constructor(channelData, samplesDecoded) {
    this.channelData = channelData;
    this.samplesDecoded = samplesDecoded;
    this.sampleRate = 48000;
  }
}

// Pass options to create new decoder. Only currently supports options.onDecode
// onDecode will receive OpusDecodedAudio object
// onDecodeAll is called when all data that is passed in has been decoded.
class OpusDecoder {
  constructor(options) {
    this.ready = decoderReady;
    this.onDecode = options.onDecode;
    this.onDecodeAll = options.onDecodeAll;
  }

  // creates Float32Array on Wasm heap and returns it and its pointer
  // returns [pointer, array]
  // free(pointer) must be done after using it.
  // array values cannot be guaranteed since memory space may be reused
  // call array.fill(0) if instantiation is required
  // set as read-only
  createOutputArray(length) {
    const pointer = _malloc(Float32Array.BYTES_PER_ELEMENT * length);
    const array = new Float32Array(HEAPF32.buffer, pointer, length);
    return [pointer, array];
  }

  /*
    Decodes audio and calls onDecode with OpusDecodedAudio object. Interleaved
    buffer is reused over multiple Wasm decode() calls because internal C Opus
    decoding library requires it, and a custom C function then deinterleaves
    it.  We're only concerned with returning left/right channels, but the
    interleaved buffer is reused for performance hopes.

    WARNING: When decoding chained Ogg files (i.e. streaming) the first two Ogg packets
             of the next chain must be present when decoding. Errors will be returned by
             libopusfile if these initial Ogg packets are incomplete. 
  */
  decode(uint8array) {
    if (!(uint8array instanceof Uint8Array))
      throw Error("Data to decode must be Uint8Array");

    if (!this._decoderPointer) {
      this._decoderPointer = _opus_chunkdecoder_create();
    }

    let srcPointer,
      decodedInterleavedPtr,
      decodedInterleavedArry,
      decodedLeftPtr,
      decodedLeftArry,
      decodedRightPtr,
      decodedRightArry,
      allDecodedLeft = [],
      allDecodedRight = [],
      allDecodedSamples = 0;

    try {
      // 120ms buffer recommended per http://opus-codec.org/docs/opusfile_api-0.7/group__stream__decoding.html
      const decodedPcmSize = 120 * 48 * 2; // 120ms @ 48 khz * 2 channels.

      // All decoded PCM data will go into these arrays.  Pass pointers to Wasm
      [decodedInterleavedPtr, decodedInterleavedArry] =
        this.createOutputArray(decodedPcmSize);
      [decodedLeftPtr, decodedLeftArry] = this.createOutputArray(
        decodedPcmSize / 2
      );
      [decodedRightPtr, decodedRightArry] = this.createOutputArray(
        decodedPcmSize / 2
      );

      // 64k is the max for enqueueing in libopusfile
      let sendMax = 64 * 1024,
        sendStart = 0,
        sendSize;
      const srcLen = uint8array.byteLength;

      // put uint8array 64k sends on Wasm HEAP and get pointer to it
      srcPointer = _malloc(uint8array.BYTES_PER_ELEMENT * sendMax);

      while (sendStart < srcLen) {
        sendSize = Math.min(sendMax, srcLen - sendStart); // upper boundary for last iteration
        HEAPU8.set(
          uint8array.subarray(sendStart, sendStart + sendSize),
          srcPointer
        );
        sendStart += sendSize;

        // enqueue bytes to decode. Fail on error
        if (
          !_opus_chunkdecoder_enqueue(
            this._decoderPointer,
            srcPointer,
            sendSize
          )
        )
          throw Error(
            "Could not enqueue bytes for decoding.  You may also have invalid Ogg Opus file."
          );

        // // continue to decode until no more bytes are left to decode
        let samplesDecoded;
        // var decodeStart = performance.now();
        while (
          (samplesDecoded =
            _opus_chunkdecoder_decode_float_stereo_deinterleaved(
              this._decoderPointer,
              decodedInterleavedPtr,
              decodedPcmSize,
              decodedLeftPtr,
              decodedRightPtr
            )) > 0
        ) {
          // performance audits show 960 samples (20ms) of data being decoded per call
          // console.log('decoded',(samplesDecoded/48000*1000).toFixed(2)+'ms in', (performance.now()-decodeStart).toFixed(2)+'ms');
          // return copies of decoded bytes because underlying buffers will be re-used
          const decodedLeft = decodedLeftArry.slice(0, samplesDecoded);
          const decodedRight = decodedRightArry.slice(0, samplesDecoded);

          if (this.onDecode) {
            this.onDecode(
              new OpusDecodedAudio([decodedLeft, decodedRight], samplesDecoded)
            );
          }

          if (this.onDecodeAll) {
            allDecodedLeft.push(decodedLeft);
            allDecodedRight.push(decodedRight);
            allDecodedSamples += samplesDecoded;
          }

          // decodeStart = performance.now();
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

      // send all decoded samples if something was decoded
      if (this.onDecodeAll && allDecodedSamples) {
        this.onDecodeAll(
          new OpusDecodedAudio(
            [
              concatFloat32(allDecodedLeft, allDecodedSamples),
              concatFloat32(allDecodedRight, allDecodedSamples),
            ],
            allDecodedSamples
          )
        );
      }
    } catch (e) {
      throw e;
    } finally {
      // free wasm memory
      _free(srcPointer);
      _free(decodedInterleavedPtr);
      _free(decodedLeftPtr);
      _free(decodedRightPtr);
    }
  }

  free() {
    if (this._decoderPointer) _opus_chunkdecoder_free(this._decoderPointer);
  }
}

Module["OpusDecoder"] = OpusDecoder;

// nodeJS only
if ("undefined" !== typeof global && exports) {
  module.exports.OpusDecoder = OpusDecoder;
  // uncomment this for performance testing
  // var {performance} = require('perf_hooks');
  // global.performance = performance;
}
