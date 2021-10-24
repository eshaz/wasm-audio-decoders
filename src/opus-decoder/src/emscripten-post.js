this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP8 = HEAP8;
  this.HEAP16 = HEAP16;
  this.HEAP32 = HEAP32;
  this.HEAPU8 = HEAPU8;
  this.HEAPU16 = HEAPU16;
  this.HEAPU32 = HEAPU32;
  this.HEAPF32 = HEAPF32;
  this.HEAPF64 = HEAPF64;
  this._malloc = _malloc;
  this._free = _free;
  this._opus_frame_decoder_create = _opus_frame_decoder_create;
  this._opus_frame_decode_float_deinterleaved =
    _opus_frame_decode_float_deinterleaved;
  this._opus_frame_decoder_destroy = _opus_frame_decoder_destroy;
});
