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
class MPEGDecodedAudio {
  constructor(channelData, samplesDecoded, sampleRate) {
    this.channelData = channelData;
    this.samplesDecoded = samplesDecoded;
    this.sampleRate = sampleRate;
  }
}

class MPEGDecoder {
  constructor() {
    this.ready.then(() => this._createDecoder());
    this._sampleRate = 0;
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
    this._decoder = _mpeg_decoder_create();

    // max size of stereo Opus packet 120ms @ 510kbs
    this._dataPtr = _malloc((0.12 * 510000) / 8);
    // max audio output of Opus packet 120ms @ 48000Hz
    [this._leftPtr, this._leftArr] = this._createOutputArray(120 * 48);
    [this._rightPtr, this._rightArr] = this._createOutputArray(120 * 48);
  }

  free() {
    _mpeg_decoder_destroy(this._decoder);

    _free(this._dataPtr);
    _free(this._leftPtr);
    _free(this._rightPtr);
  }

  decode(mpegFrame) {
    HEAPU8.set(mpegFrame, this._dataPtr);

    const samplesDecoded = _mpeg_decode_float_deinterleaved(
      this._decoder,
      this._dataPtr,
      mpegFrame.length,
      this._leftPtr,
      this._rightPtr
    );

    if (!this._sampleRate)
      this._sampleRate = _mpeg_get_sample_rate(this._decoder);

    return new MPEGDecodedAudio(
      [
        this._leftArr.slice(0, samplesDecoded),
        this._rightArr.slice(0, samplesDecoded),
      ],
      samplesDecoded,
      this._sampleRate
    );
  }

  decodeAll(mpegFrames) {
    let left = [],
      right = [],
      samples = 0;

    mpegFrames.forEach((frame) => {
      const { channelData, samplesDecoded } = this.decode(frame);

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;
    });

    return new MPEGDecodedAudio(
      [concatFloat32(left, samples), concatFloat32(right, samples)],
      samples,
      this._sampleRate
    );
  }
}

Module["MPEGDecoder"] = MPEGDecoder;

// nodeJS only
if ("undefined" !== typeof global && exports) {
  module.exports.MPEGDecoder = MPEGDecoder;
  // uncomment this for performance testing
  // var {performance} = require('perf_hooks');
  // global.performance = performance;
}
