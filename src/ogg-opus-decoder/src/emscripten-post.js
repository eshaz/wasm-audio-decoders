this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = buffer;
  this._malloc = _malloc;
  this._free = _free;
  this._ogg_opus_decoder_enqueue = _ogg_opus_decoder_enqueue;
  this._ogg_opus_decode_float_stereo_deinterleaved =
    _ogg_opus_decode_float_stereo_deinterleaved;
  this._ogg_opus_decoder_create = _ogg_opus_decoder_create;
  this._ogg_opus_decoder_free = _ogg_opus_decoder_free;
});
