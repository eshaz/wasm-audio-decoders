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
  this._mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
  this._mpeg_decode_frame = _mpeg_decode_frame;
  this._mpeg_decode_frames = _mpeg_decode_frames;
  this._mpeg_get_sample_rate = _mpeg_get_sample_rate;
  this._mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
});
