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

class OpusDecoder {
  constructor() {
    this.ready.then(() => this._createDecoder());
  }

  get ready() {
    return decoderReady;
  }

  _createOutputArray(length) {
    const pointer = _malloc(Float32Array.BYTES_PER_ELEMENT * length);
    const array = new Float32Array(HEAPF32.buffer, pointer, length);
    return [pointer, array];
  }

  _createDecoder() {
    this._decoder = _opus_frame_decoder_create();

    // max size of stereo Opus packet 120ms @ 510kbs
    this._dataPtr = _malloc((0.12 * 510000) / 8);
    // max audio output of Opus packet 120ms @ 48000Hz
    [this._leftPtr, this._leftArr] = this._createOutputArray(120 * 48);
    [this._rightPtr, this._rightArr] = this._createOutputArray(120 * 48);
  }

  free() {
    _opus_frame_decoder_destroy(this._decoder);

    _free(this._dataPtr);
    _free(this._leftPtr);
    _free(this._rightPtr);
  }

  decodeFrame(opusFrame) {
    HEAPU8.set(opusFrame, this._dataPtr);

    const samplesDecoded = _opus_frame_decode_float_deinterleaved(
      this._decoder,
      this._dataPtr,
      opusFrame.length,
      this._leftPtr,
      this._rightPtr
    );

    return new OpusDecodedAudio(
      [
        this._leftArr.slice(0, samplesDecoded),
        this._rightArr.slice(0, samplesDecoded),
      ],
      samplesDecoded
    );
  }

  decodeFrames(opusFrames) {
    let left = [],
      right = [],
      samples = 0;

    opusFrames.forEach((frame) => {
      const { channelData, samplesDecoded } = this.decodeFrame(frame);

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;
    });

    return new OpusDecodedAudio(
      [concatFloat32(left, samples), concatFloat32(right, samples)],
      samples
    );
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
