this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = wasmMemory.buffer;
  this.malloc = _malloc;
  this.free = _free;
  this.mpeg_decoder_feed = _mpeg_decoder_feed;
  this.mpeg_decoder_read = _mpeg_decoder_read;
  this.mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
  this.mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
});
