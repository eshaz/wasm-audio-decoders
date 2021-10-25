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
  this._ogg_opus_decoder_enqueue = _ogg_opus_decoder_enqueue;
  this._ogg_opus_decode_float_stereo_deinterleaved =
    _ogg_opus_decode_float_stereo_deinterleaved;
  this._ogg_opus_decoder_create = _ogg_opus_decoder_create;
  this._ogg_opus_decoder_free = _ogg_opus_decoder_free;
});
