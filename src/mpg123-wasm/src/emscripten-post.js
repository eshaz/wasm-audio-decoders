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

    // max theoretical size of a MPEG frame (MPEG 2.5 Layer II, 8000 Hz @ 160 kbps, with a padding slot)
    // https://www.mars.org/pipermail/mad-dev/2002-January/000425.html
    this._framePtrSize = 2889;
    this._framePtr = _malloc(this._framePtrSize);

    const maxSafeBuffer = _mpg123_safe_buffer();
    [this._leftPtr, this._leftArr] = this._createOutputArray(maxSafeBuffer);
    [this._rightPtr, this._rightArr] = this._createOutputArray(maxSafeBuffer);
  }

  free() {
    _mpeg_decoder_destroy(this._decoder);

    _free(this._framePtr);
    _free(this._leftPtr);
    _free(this._rightPtr);
  }

  decode(data) {
    let left = [],
      right = [],
      samples = 0,
      offset = 0;

    while (offset < data.length) {
      const { channelData, samplesDecoded } = this.decodeFrame(
        data.subarray(offset, offset + this._framePtrSize)
      );

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;

      offset += this._framePtrSize;
    }

    return new MPEGDecodedAudio(
      [concatFloat32(left, samples), concatFloat32(right, samples)],
      samples,
      this._sampleRate
    );
  }

  decodeFrame(mpegFrame) {
    HEAPU8.set(mpegFrame, this._framePtr);

    const samplesDecoded = _mpeg_decode_float_deinterleaved(
      this._decoder,
      this._framePtr,
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

  decodeFrames(mpegFrames) {
    let left = [],
      right = [],
      samples = 0;

    mpegFrames.forEach((frame) => {
      const { channelData, samplesDecoded } = this.decodeFrame(frame);

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
