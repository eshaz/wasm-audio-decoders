this.ready = new Promise((resolve) => {
  ready = resolve;
}).then(() => {
  this.HEAP = buffer;
  this._malloc = _malloc;
  this._free = _free;
  this._create_decoder = _create_decoder;
  this._destroy_decoder = _destroy_decoder;
  this._decode = _decode;
});
