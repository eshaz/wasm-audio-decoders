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

    this._outputLength = 1152 * 512;
    [this._leftPtr, this._leftArr] = this._createOutputArray(
      this._outputLength
    );

    [this._rightPtr, this._rightArr] = this._createOutputArray(
      this._outputLength
    );

    this._rawDataPtrSize = 2 ** 18;
    this._rawDataPtr = this._api._malloc(this._rawDataPtrSize);

    // max theoretical size of a MPEG frame (MPEG 2.5 Layer II, 8000 Hz @ 160 kbps, with a padding slot)
    // https://www.mars.org/pipermail/mad-dev/2002-January/000425.html
    this._framePtrSize = 2889;
    this._framePtr = this._api._malloc(this._framePtrSize);

    this._decoder = this._api._mpeg_frame_decoder_create();
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

    const samplesDecoded = this._api._mpeg_decode_frame(
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

  decode(data) {
    let left = [],
      right = [],
      samples = 0;

    const decodedBytesPtr = this._api._malloc(Uint32Array.BYTES_PER_ELEMENT);
    const decodedBytes = new Uint32Array(
      this._api.HEAPU32.buffer,
      decodedBytesPtr,
      1
    );

    let offset = 0;
    let loops = 0;

    while (offset < data.length) {
      loops++
      const inputData = data.subarray(offset, offset + this._rawDataPtrSize);

      this._api.HEAPU8.set(
        inputData,
        this._rawDataPtr
      );

      decodedBytes[0] = 0;

      const samplesDecoded = this._api._mpeg_decode_frames(
        this._decoder,
        this._rawDataPtr,
        inputData.length,
        this._leftPtr,
        this._rightPtr,
        this._outputLength,
        decodedBytesPtr
      );

      offset += decodedBytes[0];

      if (!this._sampleRate)
        this._sampleRate = this._api._mpeg_get_sample_rate(this._decoder);

      left.push(this._leftArr.slice(0, samplesDecoded));
      right.push(this._rightArr.slice(0, samplesDecoded));
      samples += samplesDecoded;
    }
    
    console.log("loops", loops)

    return new MPEGDecodedAudio(
      [
        MPEGDecoder.concatFloat32(left, samples),
        MPEGDecoder.concatFloat32(right, samples),
      ],
      samples,
      this._sampleRate
    );
  }

  decodeFrame(mpegFrame) {
    return this._decode(mpegFrame, this._framePtr);
  }

  decodeFrames(mpegFrames) {
    return this._decodeArray(mpegFrames, this._framePtr);
  }
}
