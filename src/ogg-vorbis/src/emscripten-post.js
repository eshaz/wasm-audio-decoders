this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = wasmMemory.buffer;
  this.malloc = _malloc;
  this.free = _free;
  this.create_decoder = _create_decoder;
  this.send_setup = _send_setup;
  this.init_dsp = _init_dsp;
  this.decode_packets = _decode_packets;
  this.destroy_decoder = _destroy_decoder;
});
