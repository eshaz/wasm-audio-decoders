this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = buffer;
  this._malloc = _malloc;
  this._free = _free;
  this._ogg_opus_decoder_decode = _ogg_opus_decoder_decode;
  this._ogg_opus_decoder_create = _ogg_opus_decoder_create;
  this._ogg_opus_decoder_free = _ogg_opus_decoder_free;
});
