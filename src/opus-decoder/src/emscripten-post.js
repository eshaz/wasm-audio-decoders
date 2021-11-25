this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = buffer;
  this._malloc = _malloc;
  this._free = _free;
  this._opus_frame_decoder_create = _opus_frame_decoder_create;
  this._opus_frame_decode_float_deinterleaved =
    _opus_frame_decode_float_deinterleaved;
  this._opus_frame_decoder_destroy = _opus_frame_decoder_destroy;
});
