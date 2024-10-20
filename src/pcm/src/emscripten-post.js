this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = wasmMemory.buffer;
  this.malloc = _malloc;
  this.free = _free;
  this.pcm_decoder_create = _pcm_decoder_create;
  this.pcm_decode_float_deinterleaved =
    _pcm_decode_float_deinterleaved;
  this.pcm_decoder_destroy = _pcm_decoder_destroy;
});
