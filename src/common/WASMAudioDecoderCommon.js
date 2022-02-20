export default class WASMAudioDecoderCommon {
  constructor(wasm) {
    this._wasm = wasm;

    this._pointers = [];
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

  allocateTypedArray(length, TypedArray) {
    const pointer = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * length);
    const array = new TypedArray(this._wasm.HEAP, pointer, length);

    this._pointers.push(pointer);
    return [pointer, array];
  }

  free() {
    this._pointers.forEach((ptr) => this._wasm._free(ptr));
    this._pointers = [];
  }
}
