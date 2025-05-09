this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = wasmMemory.buffer;
  this.malloc = _malloc;
  this.free = _free;
  this.opus_ml_frame_decoder_create = _opus_ml_frame_decoder_create;
  this.opus_ml_frame_decode_float_deinterleaved =
    _opus_ml_frame_decode_float_deinterleaved;
  this.opus_ml_frame_decoder_destroy = _opus_ml_frame_decoder_destroy;
});
