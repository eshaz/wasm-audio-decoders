this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = buffer;
  this.malloc = _malloc;
  this.free = _free;
  this.create_decoder = _create_decoder;
  this.destroy_decoder = _destroy_decoder;
  this.decode_frame = _decode_frame;
});
