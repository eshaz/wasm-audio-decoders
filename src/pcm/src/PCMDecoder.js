import fs from "fs/promises";

class PCMDecoder {
  constructor() {
    this._waiting = false;

    this._read = () => {
      this._await("read");
    };
    this._write = (output) => {
      this._await("write");
    };
    this._error = () => {};

    this._ready = new Promise((resolve) => {
      fs.readFile("pcm.wasm")
        .then((wasm) => WebAssembly.compile(wasm))
        .then((module) =>
          WebAssembly.instantiate(module, {
            env: {
              read: this._read,
              write: this._write,
              error: this._error,
            },
          }).then((wasm) => {
            this._wasm = wasm;

            const memory = wasm.exports.memory.buffer;
            this._stack = new Int32Array(memory);
            this._heap = new Int32Array(memory, wasm.exports.__heap_base);
            this._stackAddress = 16;

            this._resetNotify();
            this._wasm.exports.resume(this._wasm.exports.__heap_base, this._wasm.exports.__heap_base + 4, this._wasm.exports.__heap_base + 8);
            resolve();
          })
        );
    });
  }

  get ready() {
    return this._ready;
  }

  _await(command) {
    if (!this._waiting) {
      this._stack[this._stackAddress >> 2] = this._stackAddress + 8;
      this._stack[(this._stackAddress + 4) >> 2] = 1024; // size of the stack
      this._wasm.exports.asyncify_start_unwind(this._stackAddress);

      this._waiting = true;
      this._notifyPromise.then(() => {
        console.log(command, this._heap[0]);
        this._wasm.exports.asyncify_start_rewind(this._stackAddress);
        this._wasm.exports.resume();
      });
    } else {
      // wait is called again once the async operation has completed
      this._wasm.exports.asyncify_stop_rewind();
      this._notifyComplete();
      this._waiting = false;
      this._resetNotify();
    }
  }

  _resetNotify() {
    this._notifyCompletePromise = new Promise((resolve) => {
      this._notifyComplete = resolve;
    });
    this._notifyPromise = new Promise((resolve) => {
      this._notify = () => {
        resolve();
        return this._notifyCompletePromise;
      };
    });
  }

  async decode(value) {
    // read data
    this._heap[0] = value;
    this._notify();
    await this._notifyCompletePromise;

    // write data if needed
    if (this._heap[1]) {
        this._notify();
        console.log("output", this._heap[2])
    }
  }
}

const test = async () => {
  const decoder = new PCMDecoder();
  await decoder.ready;

  for (let i = 1; i < 20; i++) {
    await decoder.decode(i);

    let timeoutResolve;
    const timeout = new Promise((resolve) => {
      timeoutResolve = resolve;
    });
    setTimeout(timeoutResolve, 100);
    await timeout;
  }
};

test();
