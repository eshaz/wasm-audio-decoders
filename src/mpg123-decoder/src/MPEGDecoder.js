import MPEGDecodedAudio from "./MPEGDecodedAudio.js";
import EmscriptenWASM from "./emscripten-wasm.js";

let wasm;

export default class MPEGDecoder {
  constructor() {
    this._ready = new Promise((resolve) => this._init().then(resolve));
  }

  static concatFloat32(buffers, length) {
    const ret = new Float32Array(length);

    let offset = 0;
    for (const buf of buffers) {
      ret.set(buf, offset);
      offset += buf.length;
    }

    return ret;
  }

  _createOutputArray(length) {
    const pointer = this._api._malloc(Float32Array.BYTES_PER_ELEMENT * length);
    const array = new Float32Array(this._api.HEAPF32.buffer, pointer, length);
    return [pointer, array];
  }

  async _init() {
    if (!this._api) {
      let isMainThread;

      try {
        if (wasm || !wasm) isMainThread = true;
      } catch {
        isMainThread = false;
      }

      if (isMainThread) {
        // use a global scope singleton so wasm compilation happens once only if class is instantiated
        if (!wasm) wasm = new EmscriptenWASM();
        this._api = wasm;
      } else {
        // running as a webworker, use class level singleton for wasm compilation
        this._api = new EmscriptenWASM();
      }
    }

    await this._api.ready;

    this._sampleRate = 0;
    this._decoder = this._api._mpeg_frame_decoder_create();

    // max theoretical size of a MPEG frame (MPEG 2.5 Layer II, 8000 Hz @ 160 kbps, with a padding slot)
    // https://www.mars.org/pipermail/mad-dev/2002-January/000425.html
    this._framePtrSize = 2889;
    this._framePtr = this._api._malloc(this._framePtrSize);

    // min theoretical frame size
    // mpg123 works when the input data is at or smaller than the actual frame size
    this._rawDataPtrSize = 48;
    this._rawDataPtr = this._api._malloc(this._rawDataPtrSize);

    // max samples per MPEG frame
    [this._leftPtr, this._leftArr] = this._createOutputArray(4 * 1152);
    [this._rightPtr, this._rightArr] = this._createOutputArray(4 * 1152);
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this.free();
    await this._init();
  }

  free() {
    this._api._mpeg_frame_decoder_destroy(this._decoder);

    this._api._free(this._framePtr);
    this._api._free(this._leftPtr);
    this._api._free(this._rightPtr);

    this._sampleRate = 0;
  }

  _decode(data, inputPtr) {
    if (!(data instanceof Uint8Array))
      throw Error(
        `Data to decode must be Uint8Array. Instead got ${typeof data}`
      );

    this._api.HEAPU8.set(data, inputPtr);

    const samplesDecoded = this._api._mpeg_decode_float_deinterleaved(
      this._decoder,
      inputPtr,
      data.length,
      this._leftPtr,
      this._rightPtr
    );

    if (!this._sampleRate)
      this._sampleRate = this._api._mpeg_get_sample_rate(this._decoder);

    return new MPEGDecodedAudio(
      [
        this._leftArr.slice(0, samplesDecoded),
        this._rightArr.slice(0, samplesDecoded),
      ],
      samplesDecoded,
      this._sampleRate
    );
  }

  _decodeArray(dataArray, inputPtr) {
    let left = [],
      right = [],
      samples = 0;

    dataArray.forEach((data) => {
      const { channelData, samplesDecoded } = this._decode(data, inputPtr);

      left.push(channelData[0]);
      right.push(channelData[1]);
      samples += samplesDecoded;
    });

    return new MPEGDecodedAudio(
      [
        MPEGDecoder.concatFloat32(left, samples),
        MPEGDecoder.concatFloat32(right, samples),
      ],
      samples,
      this._sampleRate
    );
  }

  decode(data) {
    const input = [];

    for (let offset = 0; offset < data.length; offset += this._rawDataPtrSize)
      input.push(data.subarray(offset, offset + this._rawDataPtrSize));

    return this._decodeArray(input, this._rawDataPtr);
  }

  decodeFrame(mpegFrame) {
    return this._decode(mpegFrame, this._framePtr);
  }

  decodeFrames(mpegFrames) {
    return this._decodeArray(mpegFrames, this._framePtr);
  }
}
