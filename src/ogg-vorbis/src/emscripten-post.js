this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = buffer;
  this._malloc = _malloc;
  this._free = _free;
  this._create_decoder = _create_decoder;
  this._send_setup = _send_setup;
  this._init_dsp = _init_dsp;
  this._decode_packets = _decode_packets;
  this._destroy_decoder = _destroy_decoder;
});
