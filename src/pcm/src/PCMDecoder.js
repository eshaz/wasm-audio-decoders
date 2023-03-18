import fs from "fs/promises";

class PCMDecoder {
  constructor() {
    this._waiting = false;

    this._error = (errorCode) => {
      throw new Error(errorCode);
    };

    this._info = (numMessages, ptrs) => {
      const messages = new Uint32Array(this._memory, ptrs, numMessages);

      for (let i = 0; i < numMessages; i++) {
        console.log(this._charactersToString(messages[i]));
      }
    };

    this._infoInt = (value) => {
      console.log(value);
    };

    this._ready = new Promise((resolve) => {
      fs.readFile("pcm.wasm")
        .then((wasm) => WebAssembly.compile(wasm))
        .then((module) =>
          WebAssembly.instantiate(module, {
            env: {
              read_write: this._readWrite.bind(this),
              error: this._error,
              info: this._info,
              info_int: this._infoInt,
            },
          }).then((wasm) => {
            this._wasm = wasm;

            this._memory = wasm.exports.memory.buffer;
            this._memoryUint8 = new Uint8Array(wasm.exports.memory.buffer);

            this._stack = new Int32Array(this._memory);
            this._stackAddress = 16;

            this._heapAddress = wasm.exports.__heap_base;

            this._sampleRate = this._allocateTypedArray(1, Uint32Array);
            this._channels = this._allocateTypedArray(1, Uint16Array);
            this._bitDepth = this._allocateTypedArray(1, Uint16Array);
            this._samplesDecoded = this._allocateTypedArray(1, Uint32Array);

            this._inLen = this._allocateTypedArray(1, Uint32Array);
            this._inSize = 1024 * 32;
            this._inData = this._allocateTypedArray(this._inSize, Uint8Array);

            this._outLen = this._allocateTypedArray(1, Uint32Array);
            this._outSize = 1024 * 32;
            this._outData = this._allocateTypedArray(
              this._outSize,
              Float32Array
            );

            this._decoderSize = this._allocateTypedArray(1, Uint32Array);

            this._wasm.exports.init_decoder(
              this._heapAddress, // save address to decoder at end of heap
              this._decoderSize.ptr,
              this._sampleRate.ptr,
              this._channels.ptr,
              this._bitDepth.ptr,
              this._samplesDecoded.ptr,
              this._inLen.ptr,
              this._inSize,
              this._inData.ptr,
              this._outLen.ptr,
              this._outSize,
              this._outData.ptr
            );

            this._decoder = this._allocateTypedArray(
              this._decoderSize.buf[0],
              Uint8Array
            );

            this._resetNotify();
            this._wasm.exports.decode(this._decoder.ptr);
            resolve();
          })
        );
    });
  }

  _charactersToString(ptr) {
    const characters = [];

    for (
      let character = this._memoryUint8[ptr];
      character !== 0;
      character = this._memoryUint8[++ptr]
    )
      characters.push(character);

    return String.fromCharCode.apply(null, characters);
  }

  _allocateTypedArray(size, TypedArray) {
    const data = {
      ptr: this._heapAddress,
      buf: new TypedArray(this._memory, this._heapAddress, size),
      len: size,
    };
    this._heapAddress += size * TypedArray.BYTES_PER_ELEMENT;
    return data;
  }

  get ready() {
    return this._ready;
  }

  _readWrite(in_offset, max_in_bytes, out_offset, max_out_bytes) {
    if (!this._waiting) {
      this._stack[this._stackAddress >> 2] = this._stackAddress + 8;
      this._stack[(this._stackAddress + 4) >> 2] = 2048; // size of the stack
      this._wasm.exports.asyncify_start_unwind(this._stackAddress);

      this._waiting = true;
      this._notifyPromise.then(() => {
        const input = this._input.subarray(0, max_in_bytes);

        this._inData.buf.set(input, in_offset);
        this._inLen.buf[0] = input.length;

        this._wasm.exports.asyncify_start_rewind(this._stackAddress);
        this._wasm.exports.decode(this._decoder.ptr);
      });
    } else {
      // wait is called again once the async operation has completed
      this._wasm.exports.asyncify_stop_rewind();
      this._notifyComplete([max_in_bytes, max_out_bytes]);
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

  async decode(data) {
    // read data
    let offset = 0;
    do {
      this._input = data.subarray(offset);

      this._notify();
      const [inBytes, outBytes] = await this._notifyCompletePromise;

      offset += inBytes;
    } while (offset < data.length);
  }
}

const test = async () => {
  const decoder = new PCMDecoder();
  await decoder.ready;

  const testData = await fs.readFile("sound_bytes.wav");
  console.log(testData);

  const size = 1000;
  for (let i = 0; i < testData.length; i += size) {
    await decoder.decode(testData.subarray(i, i + size));

    /*let timeoutResolve;
    const timeout = new Promise((resolve) => {
      timeoutResolve = resolve;
    });
    setTimeout(timeoutResolve, 100);
    await timeout;*/
  }
};

test();
