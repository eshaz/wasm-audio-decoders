this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = buffer;
  this._malloc = _malloc;
  this._free = _free;
  this._mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
  this._mpeg_decode_interleaved = _mpeg_decode_interleaved;
  this._mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
});
