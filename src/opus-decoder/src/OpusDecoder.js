import OpusDecodedAudio from "./OpusDecodedAudio.js";
import EmscriptenWASM from "./EmscriptenWasm.js";

let wasm;

export default class OpusDecoder {
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

    this._decoder = this._api._opus_frame_decoder_create();

    // max size of stereo Opus packet 120ms @ 510kbs
    this._dataPtr = this._api._malloc((0.12 * 510000) / 8);
    // max audio output of Opus packet 120ms @ 48000Hz
    [this._leftPtr, this._leftArr] = this._createOutputArray(120 * 48);
    [this._rightPtr, this._rightArr] = this._createOutputArray(120 * 48);
  }

  get ready() {
    return this._ready;
  }

  async reset() {
    this.free();
    await this._init();
  }

  free() {
    this._api._opus_frame_decoder_destroy(this._decoder);

    this._api._free(this._dataPtr);
    this._api._free(this._leftPtr);
    this._api._free(this._rightPtr);
  }

  decodeFrame(opusFrame) {
    if (!(opusFrame instanceof Uint8Array))
      throw Error(
        `Data to decode must be Uint8Array. Instead got ${typeof opusFrame}`
      );

    this._api.HEAPU8.set(opusFrame, this._dataPtr);

    const samplesDecoded = this._api._opus_frame_decode_float_deinterleaved(
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
      [
        OpusDecoder.concatFloat32(left, samples),
        OpusDecoder.concatFloat32(right, samples),
      ],
      samples
    );
  }
}
