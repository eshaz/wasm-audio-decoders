(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["flac-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function WASMAudioDecoderCommon(decoderInstance) {
    // setup static methods
    const uint8Array = Uint8Array;
    const float32Array = Float32Array;

    if (!WASMAudioDecoderCommon.modules) {
      Object.defineProperties(WASMAudioDecoderCommon, {
        modules: {
          value: new WeakMap(),
        },

        setModule: {
          value(Ref, module) {
            WASMAudioDecoderCommon.modules.set(Ref, Promise.resolve(module));
          },
        },

        getModule: {
          value(Ref, wasmString) {
            let module = WASMAudioDecoderCommon.modules.get(Ref);

            if (!module) {
              if (!wasmString) {
                wasmString = Ref.wasm;
                module = WASMAudioDecoderCommon.inflateDynEncodeString(
                  wasmString
                ).then((data) => WebAssembly.compile(data));
              } else {
                module = WebAssembly.compile(
                  WASMAudioDecoderCommon.decodeDynString(wasmString)
                );
              }

              WASMAudioDecoderCommon.modules.set(Ref, module);
            }

            return module;
          },
        },

        concatFloat32: {
          value(buffers, length) {
            let ret = new float32Array(length),
              i = 0,
              offset = 0;

            while (i < buffers.length) {
              ret.set(buffers[i], offset);
              offset += buffers[i++].length;
            }

            return ret;
          },
        },

        getDecodedAudio: {
          value: (errors, channelData, samplesDecoded, sampleRate, bitDepth) => ({
            errors,
            channelData,
            samplesDecoded,
            sampleRate,
            bitDepth,
          }),
        },

        getDecodedAudioMultiChannel: {
          value(
            errors,
            input,
            channelsDecoded,
            samplesDecoded,
            sampleRate,
            bitDepth
          ) {
            let channelData = [],
              i,
              j;

            for (i = 0; i < channelsDecoded; i++) {
              const channel = [];
              for (j = 0; j < input.length; ) channel.push(input[j++][i] || []);
              channelData.push(
                WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded)
              );
            }

            return WASMAudioDecoderCommon.getDecodedAudio(
              errors,
              channelData,
              samplesDecoded,
              sampleRate,
              bitDepth
            );
          },
        },

        /*
         ******************
         * Compression Code
         ******************
         */

        decodeDynString: {
          value(source) {
            const output = new uint8Array(source.length);
            const offset = parseInt(source.substring(11, 13), 16);
            const offsetReverse = 256 - offset;

            let escaped = false,
              byteIndex = 0,
              byte,
              i = 13;

            while (i < source.length) {
              byte = source.charCodeAt(i++);

              if (byte === 61 && !escaped) {
                escaped = true;
                continue;
              }

              if (escaped) {
                escaped = false;
                byte -= 64;
              }

              output[byteIndex++] =
                byte < offset && byte > 0 ? byte + offsetReverse : byte - offset;
            }

            return output.subarray(0, byteIndex);
          },
        },

        inflateDynEncodeString: {
          value(source) {
            source = WASMAudioDecoderCommon.decodeDynString(source);

            return new Promise((resolve) => {
              // prettier-ignore
              const puffString = String.raw`dynEncode0014u*ttt$#U¤¤U¤¤3yzzss|yusvuyÚ&4<054<,5T44^T44<(6U~J(44< ~A544U~6J0444545 444J0444J,4U4UÒ7U454U4Z4U4U^/6545T4T44BU~64CU~O4U54U~5 U5T4B4Z!4U~5U5U5T4U~6U4ZTU5U5T44~4O4U2ZTU5T44Z!4B6T44U~64B6U~O44U~4O4U~54U~5 44~C4~54U~5 44~5454U4B6Ub!444~UO4U~5 U54U4ZTU#44U$464<4~B6^4<444~U~B4U~54U544~544~U5 µUä#UJUè#5TT4U0ZTTUX5U5T4T4Uà#~4OU4U $~C4~54U~5 T44$6U\!TTT4UaT4<6T4<64<Z!44~4N4<U~5 4UZ!4U±_TU#44UU6UÔ~B$544$6U\!4U6U¤#~B44Uä#~B$~64<6_TU#444U~B~6~54<Y!44<_!T4Y!4<64~444~AN44<U~6J4U5 44J4U[!U#44UO4U~54U~5 U54 7U6844J44J 4UJ4UJ04VK(44<J44<J$4U´~54U~5 4U¤~5!TTT4U$5"U5TTTTTTT4U$"4VK,U54<(6U~64<$6_!4< 64~6A54A544U~6#J(U54A4U[!44J(44#~A4U6UUU[!4464~64_!4<64~54<6T4<4]TU5 T4Y!44~44~AN4U~54U~54U5 44J(44J UÄA!U5U#UôJU"UÔJU#UÔ"JU#U´"JT4U´ZTU5T4UôZTU5T4UDZTU5T4U$[T44~UO4U~5 UÔUô4U~U´$.U5T4UP[T4U~4~UO4U~5 U#<U#<4U~U2$.UÄUN 44 ~UO4U~5 44!~UO4U~5 4U~4~UO4U~5 44J44J(U5 44U¤~J@44Uä~J<44UD~J844U~J44U$54U$5U54U$54U1^4U1^!4U~54U~5U54U~6U4U^/65T4T4U$54U~4BU~4O4U54U~5 UU'464U'_/54UU~5T4T4U~4BU~UO4U54U~5 U54Uä~4U¤~4U~U'$!44~5U5T44\T44U<~$6U\!4U#aT4U~4U~4O4U~5 U5U5U5TTT4U$"4YTU5 4U4~C5U5 U5U5444$4~64~\TU5 4U~4U~5T4Y!44O4U~54U~54U5 4CYTU5 4Uä~4U¤~4U~4$6TU54U\!44Bæ4Bä~[!4U~4UD~4U~4U~4$6TU54U\!44B4B~[!44U<~4U4~$5 4U"U#$544"Y!454U^!44<J44<(J454U~84­UN!#%'+/37?GOWgw·×÷Uä;U9$%& !"#`;

              WASMAudioDecoderCommon.getModule(WASMAudioDecoderCommon, puffString)
                .then((wasm) => WebAssembly.instantiate(wasm, {}))
                .then(({ exports }) => {
                  // required for minifiers that mangle the __heap_base property
                  const instanceExports = new Map(Object.entries(exports));

                  const puff = instanceExports.get("puff");
                  const memory = instanceExports.get("memory")["buffer"];
                  const dataArray = new uint8Array(memory);
                  const heapView = new DataView(memory);

                  let heapPos = instanceExports.get("__heap_base");

                  // source length
                  const sourceLength = source.length;
                  const sourceLengthPtr = heapPos;
                  heapPos += 4;
                  heapView.setInt32(sourceLengthPtr, sourceLength, true);

                  // source data
                  const sourcePtr = heapPos;
                  heapPos += sourceLength;
                  dataArray.set(source, sourcePtr);

                  // destination length
                  const destLengthPtr = heapPos;
                  heapPos += 4;
                  heapView.setInt32(
                    destLengthPtr,
                    dataArray.byteLength - heapPos,
                    true
                  );

                  // destination data fills in the rest of the heap
                  puff(heapPos, destLengthPtr, sourcePtr, sourceLengthPtr);

                  resolve(
                    dataArray.slice(
                      heapPos,
                      heapPos + heapView.getInt32(destLengthPtr, true)
                    )
                  );
                });
            });
          },
        },
      });
    }

    Object.defineProperty(this, "wasm", {
      enumerable: true,
      get: () => this._wasm,
    });

    this.getOutputChannels = (outputData, channelsDecoded, samplesDecoded) => {
      let output = [],
        i = 0;

      while (i < channelsDecoded)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i++ * samplesDecoded + samplesDecoded
          )
        );

      return output;
    };

    this.allocateTypedArray = (len, TypedArray, setPointer = true) => {
      const ptr = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * len);
      if (setPointer) this._pointers.add(ptr);

      return {
        ptr: ptr,
        len: len,
        buf: new TypedArray(this._wasm.HEAP, ptr, len),
      };
    };

    this.free = () => {
      this._pointers.forEach((ptr) => {
        this._wasm._free(ptr);
      });
      this._pointers.clear();
    };

    this.codeToString = (ptr) => {
      const characters = [],
        heap = new Uint8Array(this._wasm.HEAP);
      for (let character = heap[ptr]; character !== 0; character = heap[++ptr])
        characters.push(character);

      return String.fromCharCode.apply(null, characters);
    };

    this.addError = (errors, message, frameLength) => {
      errors.push({
        message: message,
        frameLength: frameLength,
        frameNumber: decoderInstance._frameNumber,
        inputBytes: decoderInstance._inputBytes,
        outputSamples: decoderInstance._outputSamples,
      });
    };

    this.instantiate = () => {
      const _module = decoderInstance._module;
      const _EmscriptenWASM = decoderInstance._EmscriptenWASM;
      const _inputSize = decoderInstance._inputSize;
      const _outputChannels = decoderInstance._outputChannels;
      const _outputChannelSize = decoderInstance._outputChannelSize;

      if (_module) WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);

      this._wasm = new _EmscriptenWASM(WASMAudioDecoderCommon).instantiate();
      this._pointers = new Set();

      return this._wasm.ready.then(() => {
        if (_inputSize)
          decoderInstance._input = this.allocateTypedArray(
            _inputSize,
            uint8Array
          );

        // output buffer
        if (_outputChannelSize)
          decoderInstance._output = this.allocateTypedArray(
            _outputChannels * _outputChannelSize,
            float32Array
          );

        decoderInstance._inputBytes = 0;
        decoderInstance._outputSamples = 0;
        decoderInstance._frameNumber = 0;

        return this;
      });
    };
  }

  class WASMAudioDecoderWorker extends Worker {
    constructor(options, name, Decoder, EmscriptenWASM) {
      if (!WASMAudioDecoderCommon.modules) new WASMAudioDecoderCommon();

      let source = WASMAudioDecoderCommon.modules.get(Decoder);

      if (!source) {
        const webworkerSourceCode =
          "'use strict';" +
          // dependencies need to be manually resolved when stringifying this function
          `(${((_Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
          // We're in a Web Worker

          // setup Promise that will be resolved once the WebAssembly Module is received
          let decoder,
            moduleResolve,
            modulePromise = new Promise((resolve) => {
              moduleResolve = resolve;
            });

          self.onmessage = ({ data: { id, command, data } }) => {
            let messagePromise = modulePromise,
              messagePayload = { id },
              transferList;

            if (command === "init") {
              Object.defineProperties(_Decoder, {
                WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
                EmscriptenWASM: { value: _EmscriptenWASM },
                module: { value: data.module },
                isWebWorker: { value: true },
              });

              decoder = new _Decoder(data.options);
              moduleResolve();
            } else if (command === "free") {
              decoder.free();
            } else if (command === "ready") {
              messagePromise = messagePromise.then(() => decoder.ready);
            } else if (command === "reset") {
              messagePromise = messagePromise.then(() => decoder.reset());
            } else {
              // "decode":
              // "decodeFrame":
              // "decodeFrames":
              Object.assign(
                messagePayload,
                decoder[command](
                  // detach buffers
                  Array.isArray(data)
                    ? data.map((data) => new Uint8Array(data))
                    : new Uint8Array(data)
                )
              );
              // The "transferList" parameter transfers ownership of channel data to main thread,
              // which avoids copying memory.
              transferList = messagePayload.channelData.map(
                (channel) => channel.buffer
              );
            }

            messagePromise.then(() =>
              self.postMessage(messagePayload, transferList)
            );
          };
        }).toString()})(${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

        const type = "text/javascript";

        try {
          // browser
          source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
        } catch {
          // nodejs
          source = `data:${type};base64,${Buffer.from(
          webworkerSourceCode
        ).toString("base64")}`;
        }

        WASMAudioDecoderCommon.modules.set(Decoder, source);
      }

      super(source, { name });

      this._id = Number.MIN_SAFE_INTEGER;
      this._enqueuedOperations = new Map();

      this.onmessage = ({ data }) => {
        const { id, ...rest } = data;
        this._enqueuedOperations.get(id)(rest);
        this._enqueuedOperations.delete(id);
      };

      new EmscriptenWASM(WASMAudioDecoderCommon).getModule().then((module) => {
        this._postToDecoder("init", { module, options });
      });
    }

    async _postToDecoder(command, data) {
      return new Promise((resolve) => {
        this.postMessage({
          command,
          id: this._id,
          data,
        });

        this._enqueuedOperations.set(this._id++, resolve);
      });
    }

    get ready() {
      return this._postToDecoder("ready");
    }

    async free() {
      await this._postToDecoder("free").finally(() => {
        this.terminate();
      });
    }

    async reset() {
      await this._postToDecoder("reset");
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  const getCrcTable = (crcTable, crcInitialValueFunction, crcFunction) => {
    for (let byte = 0; byte < crcTable.length; byte++) {
      let crc = crcInitialValueFunction(byte);

      for (let bit = 8; bit > 0; bit--) crc = crcFunction(crc);

      crcTable[byte] = crc;
    }
    return crcTable;
  };

  const crc8Table = getCrcTable(
    new Uint8Array(256),
    (b) => b,
    (crc) => (crc & 0x80 ? 0x07 ^ (crc << 1) : crc << 1)
  );

  const flacCrc16Table = [
    getCrcTable(
      new Uint16Array(256),
      (b) => b << 8,
      (crc) => (crc << 1) ^ (crc & (1 << 15) ? 0x8005 : 0)
    ),
  ];

  const crc32Table = [
    getCrcTable(
      new Uint32Array(256),
      (b) => b,
      (crc) => (crc >>> 1) ^ ((crc & 1) * 0xedb88320)
    ),
  ];

  // build crc tables
  for (let i = 0; i < 15; i++) {
    flacCrc16Table.push(new Uint16Array(256));
    crc32Table.push(new Uint32Array(256));

    for (let j = 0; j <= 0xff; j++) {
      flacCrc16Table[i + 1][j] =
        flacCrc16Table[0][flacCrc16Table[i][j] >>> 8] ^
        (flacCrc16Table[i][j] << 8);

      crc32Table[i + 1][j] =
        (crc32Table[i][j] >>> 8) ^ crc32Table[0][crc32Table[i][j] & 0xff];
    }
  }

  const crc8 = (data) => {
    let crc = 0;
    const dataLength = data.length;

    for (let i = 0; i !== dataLength; i++) crc = crc8Table[crc ^ data[i]];

    return crc;
  };

  const flacCrc16 = (data) => {
    const dataLength = data.length;
    const crcChunkSize = dataLength - 16;
    let crc = 0;
    let i = 0;

    while (i <= crcChunkSize) {
      crc ^= (data[i++] << 8) | data[i++];
      crc =
        flacCrc16Table[15][crc >> 8] ^
        flacCrc16Table[14][crc & 0xff] ^
        flacCrc16Table[13][data[i++]] ^
        flacCrc16Table[12][data[i++]] ^
        flacCrc16Table[11][data[i++]] ^
        flacCrc16Table[10][data[i++]] ^
        flacCrc16Table[9][data[i++]] ^
        flacCrc16Table[8][data[i++]] ^
        flacCrc16Table[7][data[i++]] ^
        flacCrc16Table[6][data[i++]] ^
        flacCrc16Table[5][data[i++]] ^
        flacCrc16Table[4][data[i++]] ^
        flacCrc16Table[3][data[i++]] ^
        flacCrc16Table[2][data[i++]] ^
        flacCrc16Table[1][data[i++]] ^
        flacCrc16Table[0][data[i++]];
    }

    while (i !== dataLength)
      crc = ((crc & 0xff) << 8) ^ flacCrc16Table[0][(crc >> 8) ^ data[i++]];

    return crc;
  };

  const crc32 = (data) => {
    const dataLength = data.length;
    const crcChunkSize = dataLength - 16;
    let crc = 0;
    let i = 0;

    while (i <= crcChunkSize)
      crc =
        crc32Table[15][(data[i++] ^ crc) & 0xff] ^
        crc32Table[14][(data[i++] ^ (crc >>> 8)) & 0xff] ^
        crc32Table[13][(data[i++] ^ (crc >>> 16)) & 0xff] ^
        crc32Table[12][data[i++] ^ (crc >>> 24)] ^
        crc32Table[11][data[i++]] ^
        crc32Table[10][data[i++]] ^
        crc32Table[9][data[i++]] ^
        crc32Table[8][data[i++]] ^
        crc32Table[7][data[i++]] ^
        crc32Table[6][data[i++]] ^
        crc32Table[5][data[i++]] ^
        crc32Table[4][data[i++]] ^
        crc32Table[3][data[i++]] ^
        crc32Table[2][data[i++]] ^
        crc32Table[1][data[i++]] ^
        crc32Table[0][data[i++]];

    while (i !== dataLength)
      crc = crc32Table[0][(crc ^ data[i++]) & 0xff] ^ (crc >>> 8);

    return crc ^ -1;
  };

  const concatBuffers = (...buffers) => {
    const buffer = new Uint8Array(
      buffers.reduce((acc, buf) => acc + buf.length, 0)
    );

    buffers.reduce((offset, buf) => {
      buffer.set(buf, offset);
      return offset + buf.length;
    }, 0);

    return buffer;
  };

  const bytesToString = (bytes) => String.fromCharCode(...bytes);

  // prettier-ignore
  const reverseTable = [0x0,0x8,0x4,0xc,0x2,0xa,0x6,0xe,0x1,0x9,0x5,0xd,0x3,0xb,0x7,0xf];
  const reverse = (val) =>
    (reverseTable[val & 0b1111] << 4) | reverseTable[val >> 4];

  class BitReader {
    constructor(data) {
      this._data = data;
      this._pos = data.length * 8;
    }

    set position(position) {
      this._pos = position;
    }

    get position() {
      return this._pos;
    }

    read(bits) {
      const byte = Math.floor(this._pos / 8);
      const bit = this._pos % 8;
      this._pos -= bits;

      const window =
        (reverse(this._data[byte - 1]) << 8) + reverse(this._data[byte]);

      return (window >> (7 - bit)) & 0xff;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class HeaderCache {
    constructor(onCodecUpdate) {
      this._onCodecUpdate = onCodecUpdate;
      this.reset();
    }

    enable() {
      this._isEnabled = true;
    }

    reset() {
      this._headerCache = new Map();
      this._codecUpdateData = new WeakMap();
      this._codecShouldUpdate = false;
      this._bitrate = null;
      this._isEnabled = false;
    }

    checkCodecUpdate(bitrate, totalDuration) {
      if (this._onCodecUpdate) {
        if (this._bitrate !== bitrate) {
          this._bitrate = bitrate;
          this._codecShouldUpdate = true;
        }

        // only update if codec data is available
        const codecData = this._codecUpdateData.get(
          this._headerCache.get(this._currentHeader)
        );

        if (this._codecShouldUpdate && codecData) {
          this._onCodecUpdate(
            {
              bitrate,
              ...codecData,
            },
            totalDuration
          );
        }

        this._codecShouldUpdate = false;
      }
    }

    updateCurrentHeader(key) {
      if (this._onCodecUpdate && key !== this._currentHeader) {
        this._codecShouldUpdate = true;
        this._currentHeader = key;
      }
    }

    getHeader(key) {
      const header = this._headerCache.get(key);

      if (header) {
        this.updateCurrentHeader(key);
      }

      return header;
    }

    setHeader(key, header, codecUpdateFields) {
      if (this._isEnabled) {
        this.updateCurrentHeader(key);

        this._headerCache.set(key, header);
        this._codecUpdateData.set(header, codecUpdateFields);
      }
    }
  }

  const headerStore = new WeakMap();
  const frameStore = new WeakMap();

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  /**
   * @abstract
   * @description Abstract class containing methods for parsing codec frames
   */
  class Parser {
    constructor(codecParser, headerCache) {
      this._codecParser = codecParser;
      this._headerCache = headerCache;
    }

    *syncFrame() {
      let frame;

      do {
        frame = yield* this.Frame.getFrame(
          this._codecParser,
          this._headerCache,
          0
        );
        if (frame) return frame;
        this._codecParser.incrementRawData(1); // increment to continue syncing
      } while (true);
    }

    /**
     * @description Searches for Frames within bytes containing a sequence of known codec frames.
     * @param {boolean} ignoreNextFrame Set to true to return frames even if the next frame may not exist at the expected location
     * @returns {Frame}
     */
    *fixedLengthFrameSync(ignoreNextFrame) {
      let frame = yield* this.syncFrame();
      const frameLength = frameStore.get(frame).length;

      if (
        ignoreNextFrame ||
        this._codecParser._flushing ||
        // check if there is a frame right after this one
        (yield* this.Header.getHeader(
          this._codecParser,
          this._headerCache,
          frameLength
        ))
      ) {
        this._headerCache.enable(); // start caching when synced

        this._codecParser.incrementRawData(frameLength); // increment to the next frame
        this._codecParser.mapFrameStats(frame);
        return frame;
      }

      this._codecParser.logWarning(
        `Missing frame frame at ${frameLength} bytes from current position.`,
        "Dropping current frame and trying again."
      );
      this._headerCache.reset(); // frame is invalid and must re-sync and clear cache
      this._codecParser.incrementRawData(1); // increment to invalidate the current frame
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  /**
   * @abstract
   */
  class Frame {
    constructor(header, data) {
      frameStore.set(this, { header });

      this.data = data;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class CodecFrame extends Frame {
    static *getFrame(Header, Frame, codecParser, headerCache, readOffset) {
      const header = yield* Header.getHeader(
        codecParser,
        headerCache,
        readOffset
      );

      if (header) {
        const frameLength = headerStore.get(header).frameLength;
        const samples = headerStore.get(header).samples;

        const frame = (yield* codecParser.readRawData(
          frameLength,
          readOffset
        )).subarray(0, frameLength);

        return new Frame(header, frame, samples);
      } else {
        return null;
      }
    }

    constructor(header, data, samples) {
      super(header, data);

      this.header = header;
      this.samples = samples;
      this.duration = (samples / header.sampleRate) * 1000;
      this.frameNumber = null;
      this.totalBytesOut = null;
      this.totalSamples = null;
      this.totalDuration = null;

      frameStore.get(this).length = data.length;
    }
  }

  const reserved = "reserved";
  const bad = "bad";
  const free = "free";
  const none = "none";
  const sixteenBitCRC = "16bit CRC";

  // channel mappings
  const mappingJoin = ", ";

  const front = "front";
  const side = "side";
  const rear = "rear";
  const left = "left";
  const center = "center";
  const right = "right";

  // prettier-ignore
  /*
  [
    [
      "left, right",
      "left, right, center",
      "left, center, right",
      "center, left, right",
      "center"
    ],
    [
      "front left, front right",
      "front left, front right, front center",
      "front left, front center, front right",
      "front center, front left, front right",
      "front center"
    ],
    [
      "side left, side right",
      "side left, side right, side center",
      "side left, side center, side right",
      "side center, side left, side right",
      "side center"
    ],
    [
      "rear left, rear right",
      "rear left, rear right, rear center",
      "rear left, rear center, rear right",
      "rear center, rear left, rear right",
      "rear center"
    ]
  ]
  */
  const channelMappings = 
    [
      "", 
      front + " ",
      side + " ",
      rear + " "
    ].map((x) =>
    [
      [left, right],
      [left, right, center],
      [left, center, right],
      [center, left, right],
      [center],
    ].flatMap((y) => y.map((z) => x + z).join(mappingJoin))
  );

  const lfe = "LFE";
  const monophonic = "monophonic (mono)";
  const stereo = "stereo";
  const surround = "surround";

  const channels = [
    monophonic,
    stereo,
    `linear ${surround}`,
    "quadraphonic",
    `5.0 ${surround}`,
    `5.1 ${surround}`,
    `6.1 ${surround}`,
    `7.1 ${surround}`,
  ];

  const getChannelMapping = (channelCount, ...mappings) =>
    `${channels[channelCount - 1]} (${mappings.join(mappingJoin)})`;

  // prettier-ignore
  const vorbisOpusChannelMapping = [
    monophonic,
    getChannelMapping(2,channelMappings[0][0]),
    getChannelMapping(3,channelMappings[0][2]),
    getChannelMapping(4,channelMappings[1][0],channelMappings[3][0]),
    getChannelMapping(5,channelMappings[1][2],channelMappings[3][0]),
    getChannelMapping(6,channelMappings[1][2],channelMappings[3][0],lfe),
    getChannelMapping(7,channelMappings[1][2],channelMappings[2][0],channelMappings[3][4],lfe),
    getChannelMapping(8,channelMappings[1][2],channelMappings[2][0],channelMappings[3][0],lfe),
  ];

  // sampleRates
  const rate192000 = 192000;
  const rate176400 = 176400;
  const rate96000 = 96000;
  const rate88200 = 88200;
  const rate64000 = 64000;
  const rate48000 = 48000;
  const rate44100 = 44100;
  const rate32000 = 32000;
  const rate24000 = 24000;
  const rate22050 = 22050;
  const rate16000 = 16000;
  const rate12000 = 12000;
  const rate11025 = 11025;
  const rate8000 = 8000;
  const rate7350 = 7350;

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  // https://id3.org/Developer%20Information

  class ID3v2 {
    static *getID3v2Header(codecParser, headerCache, readOffset) {
      const header = { headerLength: 10 };

      let data = yield* codecParser.readRawData(3, readOffset);
      // Byte (0-2 of 9)
      // ID3
      if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return null;

      data = yield* codecParser.readRawData(header.headerLength, readOffset);

      // Byte (3-4 of 9)
      // * `BBBBBBBB|........`: Major version
      // * `........|BBBBBBBB`: Minor version
      header.version = `id3v2.${data[3]}.${data[4]}`;

      // Byte (5 of 9)
      // * `....0000.: Zeros (flags not implemented yet)
      if (data[5] & 0b00001111) return null;

      // Byte (5 of 9)
      // * `CDEF0000`: Flags
      // * `C.......`: Unsynchronisation (indicates whether or not unsynchronisation is used)
      // * `.D......`: Extended header (indicates whether or not the header is followed by an extended header)
      // * `..E.....`: Experimental indicator (indicates whether or not the tag is in an experimental stage)
      // * `...F....`: Footer present (indicates that a footer is present at the very end of the tag)
      header.unsynchronizationFlag = Boolean(data[5] & 0b10000000);
      header.extendedHeaderFlag = Boolean(data[5] & 0b01000000);
      header.experimentalFlag = Boolean(data[5] & 0b00100000);
      header.footerPresent = Boolean(data[5] & 0b00010000);

      // Byte (6-9 of 9)
      // * `0.......|0.......|0.......|0.......`: Zeros
      if (
        data[6] & 0b10000000 ||
        data[7] & 0b10000000 ||
        data[8] & 0b10000000 ||
        data[9] & 0b10000000
      )
        return null;

      // Byte (6-9 of 9)
      // * `.FFFFFFF|.FFFFFFF|.FFFFFFF|.FFFFFFF`: Tag Length
      // The ID3v2 tag size is encoded with four bytes where the most significant bit (bit 7)
      // is set to zero in every byte, making a total of 28 bits. The zeroed bits are ignored,
      // so a 257 bytes long tag is represented as $00 00 02 01.
      header.dataLength =
        (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9];

      header.length = header.headerLength + header.dataLength;

      return new ID3v2(header);
    }

    constructor(header) {
      this.version = header.version;
      this.unsynchronizationFlag = header.unsynchronizationFlag;
      this.extendedHeaderFlag = header.extendedHeaderFlag;
      this.experimentalFlag = header.experimentalFlag;
      this.footerPresent = header.footerPresent;
      this.length = header.length;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class CodecHeader {
    /**
     * @private
     */
    constructor(header) {
      headerStore.set(this, header);

      this.bitDepth = header.bitDepth;
      this.bitrate = null; // set during frame mapping
      this.channels = header.channels;
      this.channelMode = header.channelMode;
      this.sampleRate = header.sampleRate;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  // http://www.mp3-tech.org/programmer/frame_header.html

  const bitrateMatrix = {
    // bits | V1,L1 | V1,L2 | V1,L3 | V2,L1 | V2,L2 & L3
    0b00000000: [free, free, free, free, free],
    0b00010000: [32, 32, 32, 32, 8],
    // 0b00100000: [64,   48,  40,  48,  16,],
    // 0b00110000: [96,   56,  48,  56,  24,],
    // 0b01000000: [128,  64,  56,  64,  32,],
    // 0b01010000: [160,  80,  64,  80,  40,],
    // 0b01100000: [192,  96,  80,  96,  48,],
    // 0b01110000: [224, 112,  96, 112,  56,],
    // 0b10000000: [256, 128, 112, 128,  64,],
    // 0b10010000: [288, 160, 128, 144,  80,],
    // 0b10100000: [320, 192, 160, 160,  96,],
    // 0b10110000: [352, 224, 192, 176, 112,],
    // 0b11000000: [384, 256, 224, 192, 128,],
    // 0b11010000: [416, 320, 256, 224, 144,],
    // 0b11100000: [448, 384, 320, 256, 160,],
    0b11110000: [bad, bad, bad, bad, bad],
  };

  const calcBitrate = (idx, interval, intervalOffset) =>
    8 *
      (((idx + intervalOffset) % interval) + interval) *
      (1 << ((idx + intervalOffset) / interval)) -
    8 * interval * ((interval / 8) | 0);

  // generate bitrate matrix
  for (let i = 2; i < 15; i++)
    bitrateMatrix[i << 4] = [
      i * 32, //                V1,L1
      calcBitrate(i, 4, 0), //  V1,L2
      calcBitrate(i, 4, -1), // V1,L3
      calcBitrate(i, 8, 4), //  V2,L1
      calcBitrate(i, 8, 0), //  V2,L2 & L3
    ];

  const v1Layer1 = 0;
  const v1Layer2 = 1;
  const v1Layer3 = 2;
  const v2Layer1 = 3;
  const v2Layer23 = 4;

  const bands = "bands ";
  const to31 = " to 31";
  const layer12ModeExtensions = {
    0b00000000: bands + 4 + to31,
    0b00010000: bands + 8 + to31,
    0b00100000: bands + 12 + to31,
    0b00110000: bands + 16 + to31,
  };

  const intensityStereo = "Intensity stereo ";
  const msStereo = ", MS stereo ";
  const on = "on";
  const off = "off";
  const layer3ModeExtensions = {
    0b00000000: intensityStereo + off + msStereo + off,
    0b00010000: intensityStereo + on + msStereo + off,
    0b00100000: intensityStereo + off + msStereo + on,
    0b00110000: intensityStereo + on + msStereo + on,
  };
  const layers = {
    0b00000000: { description: reserved },
    0b00000010: {
      description: "Layer III",
      framePadding: 1,
      modeExtensions: layer3ModeExtensions,
      v1: {
        bitrateIndex: v1Layer3,
        samples: 1152,
      },
      v2: {
        bitrateIndex: v2Layer23,
        samples: 576,
      },
    },
    0b00000100: {
      description: "Layer II",
      framePadding: 1,
      modeExtensions: layer12ModeExtensions,
      samples: 1152,
      v1: {
        bitrateIndex: v1Layer2,
      },
      v2: {
        bitrateIndex: v2Layer23,
      },
    },
    0b00000110: {
      description: "Layer I",
      framePadding: 4,
      modeExtensions: layer12ModeExtensions,
      samples: 384,
      v1: {
        bitrateIndex: v1Layer1,
      },
      v2: {
        bitrateIndex: v2Layer1,
      },
    },
  };

  const mpegVersion$1 = "MPEG Version ";
  const isoIec = "ISO/IEC ";
  const v2 = "v2";
  const v1 = "v1";
  const mpegVersions = {
    0b00000000: {
      description: `${mpegVersion$1}2.5 (later extension of MPEG 2)`,
      layers: v2,
      sampleRates: {
        0b00000000: rate11025,
        0b00000100: rate12000,
        0b00001000: rate8000,
        0b00001100: reserved,
      },
    },
    0b00001000: { description: reserved },
    0b00010000: {
      description: `${mpegVersion$1}2 (${isoIec}13818-3)`,
      layers: v2,
      sampleRates: {
        0b00000000: rate22050,
        0b00000100: rate24000,
        0b00001000: rate16000,
        0b00001100: reserved,
      },
    },
    0b00011000: {
      description: `${mpegVersion$1}1 (${isoIec}11172-3)`,
      layers: v1,
      sampleRates: {
        0b00000000: rate44100,
        0b00000100: rate48000,
        0b00001000: rate32000,
        0b00001100: reserved,
      },
    },
  };

  const protection$1 = {
    0b00000000: sixteenBitCRC,
    0b00000001: none,
  };

  const emphasis = {
    0b00000000: none,
    0b00000001: "50/15 ms",
    0b00000010: reserved,
    0b00000011: "CCIT J.17",
  };

  const channelModes = {
    0b00000000: { channels: 2, description: stereo },
    0b01000000: { channels: 2, description: "joint " + stereo },
    0b10000000: { channels: 2, description: "dual channel" },
    0b11000000: { channels: 1, description: monophonic },
  };

  class MPEGHeader extends CodecHeader {
    static *getHeader(codecParser, headerCache, readOffset) {
      const header = {};

      // check for id3 header
      const id3v2Header = yield* ID3v2.getID3v2Header(
        codecParser,
        headerCache,
        readOffset
      );

      if (id3v2Header) {
        // throw away the data. id3 parsing is not implemented yet.
        yield* codecParser.readRawData(id3v2Header.length, readOffset);
        codecParser.incrementRawData(id3v2Header.length);
      }

      // Must be at least four bytes.
      const data = yield* codecParser.readRawData(4, readOffset);

      // Check header cache
      const key = bytesToString(data.subarray(0, 4));
      const cachedHeader = headerCache.getHeader(key);
      if (cachedHeader) return new MPEGHeader(cachedHeader);

      // Frame sync (all bits must be set): `11111111|111`:
      if (data[0] !== 0xff || data[1] < 0xe0) return null;

      // Byte (2 of 4)
      // * `111BBCCD`
      // * `...BB...`: MPEG Audio version ID
      // * `.....CC.`: Layer description
      // * `.......D`: Protection bit (0 - Protected by CRC (16bit CRC follows header), 1 = Not protected)

      // Mpeg version (1, 2, 2.5)
      const mpegVersion = mpegVersions[data[1] & 0b00011000];
      if (mpegVersion.description === reserved) return null;

      // Layer (I, II, III)
      const layerBits = data[1] & 0b00000110;
      if (layers[layerBits].description === reserved) return null;
      const layer = {
        ...layers[layerBits],
        ...layers[layerBits][mpegVersion.layers],
      };

      header.mpegVersion = mpegVersion.description;
      header.layer = layer.description;
      header.samples = layer.samples;
      header.protection = protection$1[data[1] & 0b00000001];

      header.length = 4;

      // Byte (3 of 4)
      // * `EEEEFFGH`
      // * `EEEE....`: Bitrate index. 1111 is invalid, everything else is accepted
      // * `....FF..`: Sample rate
      // * `......G.`: Padding bit, 0=frame not padded, 1=frame padded
      // * `.......H`: Private bit.
      header.bitrate = bitrateMatrix[data[2] & 0b11110000][layer.bitrateIndex];
      if (header.bitrate === bad) return null;

      header.sampleRate = mpegVersion.sampleRates[data[2] & 0b00001100];
      if (header.sampleRate === reserved) return null;

      header.framePadding = data[2] & 0b00000010 && layer.framePadding;
      header.isPrivate = Boolean(data[2] & 0b00000001);

      header.frameLength = Math.floor(
        (125 * header.bitrate * header.samples) / header.sampleRate +
          header.framePadding
      );
      if (!header.frameLength) return null;

      // Byte (4 of 4)
      // * `IIJJKLMM`
      // * `II......`: Channel mode
      // * `..JJ....`: Mode extension (only if joint stereo)
      // * `....K...`: Copyright
      // * `.....L..`: Original
      // * `......MM`: Emphasis
      const channelModeBits = data[3] & 0b11000000;
      header.channelMode = channelModes[channelModeBits].description;
      header.channels = channelModes[channelModeBits].channels;

      header.modeExtension = layer.modeExtensions[data[3] & 0b00110000];
      header.isCopyrighted = Boolean(data[3] & 0b00001000);
      header.isOriginal = Boolean(data[3] & 0b00000100);

      header.emphasis = emphasis[data[3] & 0b00000011];
      if (header.emphasis === reserved) return null;

      header.bitDepth = 16;

      // set header cache
      const { length, frameLength, samples, ...codecUpdateFields } = header;

      headerCache.setHeader(key, header, codecUpdateFields);
      return new MPEGHeader(header);
    }

    /**
     * @private
     * Call MPEGHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.bitrate = header.bitrate;
      this.emphasis = header.emphasis;
      this.framePadding = header.framePadding;
      this.isCopyrighted = header.isCopyrighted;
      this.isOriginal = header.isOriginal;
      this.isPrivate = header.isPrivate;
      this.layer = header.layer;
      this.modeExtension = header.modeExtension;
      this.mpegVersion = header.mpegVersion;
      this.protection = header.protection;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class MPEGFrame extends CodecFrame {
    static *getFrame(codecParser, headerCache, readOffset) {
      return yield* super.getFrame(
        MPEGHeader,
        MPEGFrame,
        codecParser,
        headerCache,
        readOffset
      );
    }

    constructor(header, frame, samples) {
      super(header, frame, samples);
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class MPEGParser extends Parser {
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);
      this.Frame = MPEGFrame;
      this.Header = MPEGHeader;

      onCodec(this.codec);
    }

    get codec() {
      return "mpeg";
    }

    *parseFrame() {
      return yield* this.fixedLengthFrameSync();
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  const mpegVersion = {
    0b00000000: "MPEG-4",
    0b00001000: "MPEG-2",
  };

  const layer = {
    0b00000000: "valid",
    0b00000010: bad,
    0b00000100: bad,
    0b00000110: bad,
  };

  const protection = {
    0b00000000: sixteenBitCRC,
    0b00000001: none,
  };

  const profile = {
    0b00000000: "AAC Main",
    0b01000000: "AAC LC (Low Complexity)",
    0b10000000: "AAC SSR (Scalable Sample Rate)",
    0b11000000: "AAC LTP (Long Term Prediction)",
  };

  const sampleRates = {
    0b00000000: rate96000,
    0b00000100: rate88200,
    0b00001000: rate64000,
    0b00001100: rate48000,
    0b00010000: rate44100,
    0b00010100: rate32000,
    0b00011000: rate24000,
    0b00011100: rate22050,
    0b00100000: rate16000,
    0b00100100: rate12000,
    0b00101000: rate11025,
    0b00101100: rate8000,
    0b00110000: rate7350,
    0b00110100: reserved,
    0b00111000: reserved,
    0b00111100: "frequency is written explicitly",
  };

  // prettier-ignore
  const channelMode = {
    0b000000000: { channels: 0, description: "Defined in AOT Specific Config" },
    /*
    'monophonic (mono)'
    'stereo (left, right)'
    'linear surround (front center, front left, front right)'
    'quadraphonic (front center, front left, front right, rear center)'
    '5.0 surround (front center, front left, front right, rear left, rear right)'
    '5.1 surround (front center, front left, front right, rear left, rear right, LFE)'
    '7.1 surround (front center, front left, front right, side left, side right, rear left, rear right, LFE)'
    */
    0b001000000: { channels: 1, description: monophonic },
    0b010000000: { channels: 2, description: getChannelMapping(2,channelMappings[0][0]) },
    0b011000000: { channels: 3, description: getChannelMapping(3,channelMappings[1][3]), },
    0b100000000: { channels: 4, description: getChannelMapping(4,channelMappings[1][3],channelMappings[3][4]), },
    0b101000000: { channels: 5, description: getChannelMapping(5,channelMappings[1][3],channelMappings[3][0]), },
    0b110000000: { channels: 6, description: getChannelMapping(6,channelMappings[1][3],channelMappings[3][0],lfe), },
    0b111000000: { channels: 8, description: getChannelMapping(8,channelMappings[1][3],channelMappings[2][0],channelMappings[3][0],lfe), },
  };

  class AACHeader extends CodecHeader {
    static *getHeader(codecParser, headerCache, readOffset) {
      const header = {};

      // Must be at least seven bytes. Out of data
      const data = yield* codecParser.readRawData(7, readOffset);

      // Check header cache
      const key = bytesToString([
        data[0],
        data[1],
        data[2],
        (data[3] & 0b11111100) | (data[6] & 0b00000011), // frame length, buffer fullness varies so don't cache it
      ]);
      const cachedHeader = headerCache.getHeader(key);

      if (!cachedHeader) {
        // Frame sync (all bits must be set): `11111111|1111`:
        if (data[0] !== 0xff || data[1] < 0xf0) return null;

        // Byte (2 of 7)
        // * `1111BCCD`
        // * `....B...`: MPEG Version: 0 for MPEG-4, 1 for MPEG-2
        // * `.....CC.`: Layer: always 0
        // * `.......D`: protection absent, Warning, set to 1 if there is no CRC and 0 if there is CRC
        header.mpegVersion = mpegVersion[data[1] & 0b00001000];

        header.layer = layer[data[1] & 0b00000110];
        if (header.layer === bad) return null;

        const protectionBit = data[1] & 0b00000001;
        header.protection = protection[protectionBit];
        header.length = protectionBit ? 7 : 9;

        // Byte (3 of 7)
        // * `EEFFFFGH`
        // * `EE......`: profile, the MPEG-4 Audio Object Type minus 1
        // * `..FFFF..`: MPEG-4 Sampling Frequency Index (15 is forbidden)
        // * `......G.`: private bit, guaranteed never to be used by MPEG, set to 0 when encoding, ignore when decoding
        header.profileBits = data[2] & 0b11000000;
        header.sampleRateBits = data[2] & 0b00111100;
        const privateBit = data[2] & 0b00000010;

        header.profile = profile[header.profileBits];

        header.sampleRate = sampleRates[header.sampleRateBits];
        if (header.sampleRate === reserved) return null;

        header.isPrivate = Boolean(privateBit);

        // Byte (3,4 of 7)
        // * `.......H|HH......`: MPEG-4 Channel Configuration (in the case of 0, the channel configuration is sent via an inband PCE)
        header.channelModeBits = ((data[2] << 8) | data[3]) & 0b111000000;
        header.channelMode = channelMode[header.channelModeBits].description;
        header.channels = channelMode[header.channelModeBits].channels;

        // Byte (4 of 7)
        // * `HHIJKLMM`
        // * `..I.....`: originality, set to 0 when encoding, ignore when decoding
        // * `...J....`: home, set to 0 when encoding, ignore when decoding
        // * `....K...`: copyrighted id bit, the next bit of a centrally registered copyright identifier, set to 0 when encoding, ignore when decoding
        // * `.....L..`: copyright id start, signals that this frame's copyright id bit is the first bit of the copyright id, set to 0 when encoding, ignore when decoding
        header.isOriginal = Boolean(data[3] & 0b00100000);
        header.isHome = Boolean(data[3] & 0b00001000);
        header.copyrightId = Boolean(data[3] & 0b00001000);
        header.copyrightIdStart = Boolean(data[3] & 0b00000100);
        header.bitDepth = 16;
        header.samples = 1024;

        // Byte (7 of 7)
        // * `......PP` Number of AAC frames (RDBs) in ADTS frame minus 1, for maximum compatibility always use 1 AAC frame per ADTS frame
        header.numberAACFrames = data[6] & 0b00000011;

        const {
          length,
          channelModeBits,
          profileBits,
          sampleRateBits,
          frameLength,
          samples,
          numberAACFrames,
          ...codecUpdateFields
        } = header;
        headerCache.setHeader(key, header, codecUpdateFields);
      } else {
        Object.assign(header, cachedHeader);
      }

      // Byte (4,5,6 of 7)
      // * `.......MM|MMMMMMMM|MMM.....`: frame length, this value must include 7 or 9 bytes of header length: FrameLength = (ProtectionAbsent == 1 ? 7 : 9) + size(AACFrame)
      header.frameLength =
        ((data[3] << 11) | (data[4] << 3) | (data[5] >> 5)) & 0x1fff;
      if (!header.frameLength) return null;

      // Byte (6,7 of 7)
      // * `...OOOOO|OOOOOO..`: Buffer fullness
      const bufferFullnessBits = ((data[5] << 6) | (data[6] >> 2)) & 0x7ff;
      header.bufferFullness =
        bufferFullnessBits === 0x7ff ? "VBR" : bufferFullnessBits;

      return new AACHeader(header);
    }

    /**
     * @private
     * Call AACHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.copyrightId = header.copyrightId;
      this.copyrightIdStart = header.copyrightIdStart;
      this.bufferFullness = header.bufferFullness;
      this.isHome = header.isHome;
      this.isOriginal = header.isOriginal;
      this.isPrivate = header.isPrivate;
      this.layer = header.layer;
      this.length = header.length;
      this.mpegVersion = header.mpegVersion;
      this.numberAACFrames = header.numberAACFrames;
      this.profile = header.profile;
      this.protection = header.protection;
    }

    get audioSpecificConfig() {
      // Audio Specific Configuration
      // * `000EEFFF|F0HHH000`:
      // * `000EE...|........`: Object Type (profileBit + 1)
      // * `.....FFF|F.......`: Sample Rate
      // * `........|.0HHH...`: Channel Configuration
      // * `........|.....0..`: Frame Length (1024)
      // * `........|......0.`: does not depend on core coder
      // * `........|.......0`: Not Extension
      const header = headerStore.get(this);

      const audioSpecificConfig =
        ((header.profileBits + 0x40) << 5) |
        (header.sampleRateBits << 5) |
        (header.channelModeBits >> 3);

      const bytes = new Uint8Array(2);
      new DataView(bytes.buffer).setUint16(0, audioSpecificConfig, false);
      return bytes;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class AACFrame extends CodecFrame {
    static *getFrame(codecParser, headerCache, readOffset) {
      return yield* super.getFrame(
        AACHeader,
        AACFrame,
        codecParser,
        headerCache,
        readOffset
      );
    }

    constructor(header, frame, samples) {
      super(header, frame, samples);
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class AACParser extends Parser {
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);
      this.Frame = AACFrame;
      this.Header = AACHeader;

      onCodec(this.codec);
    }

    get codec() {
      return "aac";
    }

    *parseFrame() {
      return yield* this.fixedLengthFrameSync();
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class FLACFrame extends CodecFrame {
    static getFrameFooterCrc16(data) {
      return (data[data.length - 2] << 8) + data[data.length - 1];
    }

    // check frame footer crc
    // https://xiph.org/flac/format.html#frame_footer
    static checkFrameFooterCrc16(data) {
      const expectedCrc16 = FLACFrame.getFrameFooterCrc16(data);
      const actualCrc16 = flacCrc16(data.subarray(0, -2));

      return expectedCrc16 === actualCrc16;
    }

    constructor(data, header, streamInfo) {
      header.streamInfo = streamInfo;
      header.crc16 = FLACFrame.getFrameFooterCrc16(data);

      super(header, data, headerStore.get(header).samples);
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  const getFromStreamInfo = "get from STREAMINFO metadata block";

  const blockingStrategy = {
    0b00000000: "Fixed",
    0b00000001: "Variable",
  };

  const blockSize = {
    0b00000000: reserved,
    0b00010000: 192,
    // 0b00100000: 576,
    // 0b00110000: 1152,
    // 0b01000000: 2304,
    // 0b01010000: 4608,
    // 0b01100000: "8-bit (blocksize-1) from end of header",
    // 0b01110000: "16-bit (blocksize-1) from end of header",
    // 0b10000000: 256,
    // 0b10010000: 512,
    // 0b10100000: 1024,
    // 0b10110000: 2048,
    // 0b11000000: 4096,
    // 0b11010000: 8192,
    // 0b11100000: 16384,
    // 0b11110000: 32768,
  };
  for (let i = 2; i < 16; i++)
    blockSize[i << 4] = i < 6 ? 576 * 2 ** (i - 2) : 2 ** i;

  const sampleRate = {
    0b00000000: getFromStreamInfo,
    0b00000001: rate88200,
    0b00000010: rate176400,
    0b00000011: rate192000,
    0b00000100: rate8000,
    0b00000101: rate16000,
    0b00000110: rate22050,
    0b00000111: rate24000,
    0b00001000: rate32000,
    0b00001001: rate44100,
    0b00001010: rate48000,
    0b00001011: rate96000,
    // 0b00001100: "8-bit sample rate (in kHz) from end of header",
    // 0b00001101: "16-bit sample rate (in Hz) from end of header",
    // 0b00001110: "16-bit sample rate (in tens of Hz) from end of header",
    0b00001111: bad,
  };

  /* prettier-ignore */
  const channelAssignments = {
    /*'
    'monophonic (mono)'
    'stereo (left, right)'
    'linear surround (left, right, center)'
    'quadraphonic (front left, front right, rear left, rear right)'
    '5.0 surround (front left, front right, front center, rear left, rear right)'
    '5.1 surround (front left, front right, front center, LFE, rear left, rear right)'
    '6.1 surround (front left, front right, front center, LFE, rear center, side left, side right)'
    '7.1 surround (front left, front right, front center, LFE, rear left, rear right, side left, side right)'
    */
    0b00000000: {channels: 1, description: monophonic},
    0b00010000: {channels: 2, description: getChannelMapping(2,channelMappings[0][0])},
    0b00100000: {channels: 3, description: getChannelMapping(3,channelMappings[0][1])},
    0b00110000: {channels: 4, description: getChannelMapping(4,channelMappings[1][0],channelMappings[3][0])},
    0b01000000: {channels: 5, description: getChannelMapping(5,channelMappings[1][1],channelMappings[3][0])},
    0b01010000: {channels: 6, description: getChannelMapping(6,channelMappings[1][1],lfe,channelMappings[3][0])},
    0b01100000: {channels: 7, description: getChannelMapping(7,channelMappings[1][1],lfe,channelMappings[3][4],channelMappings[2][0])},
    0b01110000: {channels: 8, description: getChannelMapping(8,channelMappings[1][1],lfe,channelMappings[3][0],channelMappings[2][0])},
    0b10000000: {channels: 2, description: `${stereo} (left, diff)`},
    0b10010000: {channels: 2, description: `${stereo} (diff, right)`},
    0b10100000: {channels: 2, description: `${stereo} (avg, diff)`},
    0b10110000: reserved,
    0b11000000: reserved,
    0b11010000: reserved,
    0b11100000: reserved,
    0b11110000: reserved,
  };

  const bitDepth = {
    0b00000000: getFromStreamInfo,
    0b00000010: 8,
    0b00000100: 12,
    0b00000110: reserved,
    0b00001000: 16,
    0b00001010: 20,
    0b00001100: 24,
    0b00001110: reserved,
  };

  class FLACHeader extends CodecHeader {
    // https://datatracker.ietf.org/doc/html/rfc3629#section-3
    //    Char. number range  |        UTF-8 octet sequence
    //    (hexadecimal)    |              (binary)
    // --------------------+---------------------------------------------
    // 0000 0000-0000 007F | 0xxxxxxx
    // 0000 0080-0000 07FF | 110xxxxx 10xxxxxx
    // 0000 0800-0000 FFFF | 1110xxxx 10xxxxxx 10xxxxxx
    // 0001 0000-0010 FFFF | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
    static decodeUTF8Int(data) {
      if (data[0] > 0xfe) {
        return null; // length byte must have at least one zero as the lsb
      }

      if (data[0] < 0x80) return { value: data[0], length: 1 };

      // get length by counting the number of msb that are set to 1
      let length = 1;
      for (let zeroMask = 0x40; zeroMask & data[0]; zeroMask >>= 1) length++;

      let idx = length - 1,
        value = 0,
        shift = 0;

      // sum together the encoded bits in bytes 2 to length
      // 1110xxxx 10[cccccc] 10[bbbbbb] 10[aaaaaa]
      //
      //    value = [cccccc] | [bbbbbb] | [aaaaaa]
      for (; idx > 0; shift += 6, idx--) {
        if ((data[idx] & 0xc0) !== 0x80) {
          return null; // each byte should have leading 10xxxxxx
        }
        value |= (data[idx] & 0x3f) << shift; // add the encoded bits
      }

      // read the final encoded bits in byte 1
      //     1110[dddd] 10[cccccc] 10[bbbbbb] 10[aaaaaa]
      //
      // value = [dddd] | [cccccc] | [bbbbbb] | [aaaaaa]
      value |= (data[idx] & (0x7f >> length)) << shift;

      return { value, length };
    }

    static getHeaderFromUint8Array(data, headerCache) {
      const codecParserStub = {
        readRawData: function* () {
          return data;
        },
      };

      return FLACHeader.getHeader(codecParserStub, headerCache, 0).next().value;
    }

    static *getHeader(codecParser, headerCache, readOffset) {
      // Must be at least 6 bytes.
      let data = yield* codecParser.readRawData(6, readOffset);

      // Bytes (1-2 of 6)
      // * `11111111|111110..`: Frame sync
      // * `........|......0.`: Reserved 0 - mandatory, 1 - reserved
      if (data[0] !== 0xff || !(data[1] === 0xf8 || data[1] === 0xf9)) {
        return null;
      }

      const header = {};

      // Check header cache
      const key = bytesToString(data.subarray(0, 4));
      const cachedHeader = headerCache.getHeader(key);

      if (!cachedHeader) {
        // Byte (2 of 6)
        // * `.......C`: Blocking strategy, 0 - fixed, 1 - variable
        header.blockingStrategyBits = data[1] & 0b00000001;
        header.blockingStrategy = blockingStrategy[header.blockingStrategyBits];

        // Byte (3 of 6)
        // * `DDDD....`: Block size in inter-channel samples
        // * `....EEEE`: Sample rate
        header.blockSizeBits = data[2] & 0b11110000;
        header.sampleRateBits = data[2] & 0b00001111;

        header.blockSize = blockSize[header.blockSizeBits];
        if (header.blockSize === reserved) {
          return null;
        }

        header.sampleRate = sampleRate[header.sampleRateBits];
        if (header.sampleRate === bad) {
          return null;
        }

        // Byte (4 of 6)
        // * `FFFF....`: Channel assignment
        // * `....GGG.`: Sample size in bits
        // * `.......H`: Reserved 0 - mandatory, 1 - reserved
        if (data[3] & 0b00000001) {
          return null;
        }

        const channelAssignment = channelAssignments[data[3] & 0b11110000];
        if (channelAssignment === reserved) {
          return null;
        }

        header.channels = channelAssignment.channels;
        header.channelMode = channelAssignment.description;

        header.bitDepth = bitDepth[data[3] & 0b00001110];
        if (header.bitDepth === reserved) {
          return null;
        }
      } else {
        Object.assign(header, cachedHeader);
      }

      // Byte (5...)
      // * `IIIIIIII|...`: VBR block size ? sample number : frame number
      header.length = 5;

      // check if there is enough data to parse UTF8
      data = yield* codecParser.readRawData(header.length + 8, readOffset);

      const decodedUtf8 = FLACHeader.decodeUTF8Int(data.subarray(4));
      if (!decodedUtf8) {
        return null;
      }

      if (header.blockingStrategyBits) {
        header.sampleNumber = decodedUtf8.value;
      } else {
        header.frameNumber = decodedUtf8.value;
      }

      header.length += decodedUtf8.length;

      // Byte (...)
      // * `JJJJJJJJ|(JJJJJJJJ)`: Blocksize (8/16bit custom value)
      if (header.blockSizeBits === 0b01100000) {
        // 8 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.blockSize = data[header.length - 1] + 1;
        header.length += 1;
      } else if (header.blockSizeBits === 0b01110000) {
        // 16 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.blockSize =
          (data[header.length - 1] << 8) + data[header.length] + 1;
        header.length += 2;
      }

      header.samples = header.blockSize;

      // Byte (...)
      // * `KKKKKKKK|(KKKKKKKK)`: Sample rate (8/16bit custom value)
      if (header.sampleRateBits === 0b00001100) {
        // 8 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.sampleRate = data[header.length - 1] * 1000;
        header.length += 1;
      } else if (header.sampleRateBits === 0b00001101) {
        // 16 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.sampleRate = (data[header.length - 1] << 8) + data[header.length];
        header.length += 2;
      } else if (header.sampleRateBits === 0b00001110) {
        // 16 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.sampleRate =
          ((data[header.length - 1] << 8) + data[header.length]) * 10;
        header.length += 2;
      }

      // Byte (...)
      // * `LLLLLLLL`: CRC-8
      if (data.length < header.length)
        data = yield* codecParser.readRawData(header.length, readOffset);

      header.crc = data[header.length - 1];
      if (header.crc !== crc8(data.subarray(0, header.length - 1))) {
        return null;
      }

      if (!cachedHeader) {
        const {
          blockingStrategyBits,
          frameNumber,
          sampleNumber,
          samples,
          sampleRateBits,
          blockSizeBits,
          crc,
          length,
          ...codecUpdateFields
        } = header;
        headerCache.setHeader(key, header, codecUpdateFields);
      }
      return new FLACHeader(header);
    }

    /**
     * @private
     * Call FLACHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.crc16 = null; // set in FLACFrame
      this.blockingStrategy = header.blockingStrategy;
      this.blockSize = header.blockSize;
      this.frameNumber = header.frameNumber;
      this.sampleNumber = header.sampleNumber;
      this.streamInfo = null; // set during ogg parsing
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  const MIN_FLAC_FRAME_SIZE = 2;
  const MAX_FLAC_FRAME_SIZE = 512 * 1024;

  class FLACParser extends Parser {
    constructor(codecParser, onCodecUpdate) {
      super(codecParser, onCodecUpdate);
      this.Frame = FLACFrame;
      this.Header = FLACHeader;
    }

    get codec() {
      return "flac";
    }

    *_getNextFrameSyncOffset(offset) {
      const data = yield* this._codecParser.readRawData(2, 0);
      const dataLength = data.length - 2;

      while (offset < dataLength) {
        // * `11111111|111110..`: Frame sync
        // * `........|......0.`: Reserved 0 - mandatory, 1 - reserved
        const firstByte = data[offset];
        if (firstByte === 0xff) {
          const secondByte = data[offset + 1];
          if (secondByte === 0xf8 || secondByte === 0xf9) break;
          if (secondByte !== 0xff) offset++; // might as well check for the next sync byte
        }
        offset++;
      }

      return offset;
    }

    *parseFrame() {
      // find the first valid frame header
      do {
        const header = yield* FLACHeader.getHeader(
          this._codecParser,
          this._headerCache,
          0
        );

        if (header) {
          // found a valid frame header
          // find the next valid frame header
          let nextHeaderOffset =
            headerStore.get(header).length + MIN_FLAC_FRAME_SIZE;

          while (nextHeaderOffset <= MAX_FLAC_FRAME_SIZE) {
            if (
              this._codecParser._flushing ||
              (yield* FLACHeader.getHeader(
                this._codecParser,
                this._headerCache,
                nextHeaderOffset
              ))
            ) {
              // found a valid next frame header
              let frameData = yield* this._codecParser.readRawData(
                nextHeaderOffset
              );

              if (!this._codecParser._flushing)
                frameData = frameData.subarray(0, nextHeaderOffset);

              // check that this is actually the next header by validating the frame footer crc16
              if (FLACFrame.checkFrameFooterCrc16(frameData)) {
                // both frame headers, and frame footer crc16 are valid, we are synced (odds are pretty low of a false positive)
                const frame = new FLACFrame(frameData, header);

                this._headerCache.enable(); // start caching when synced
                this._codecParser.incrementRawData(nextHeaderOffset); // increment to the next frame
                this._codecParser.mapFrameStats(frame);

                return frame;
              }
            }

            nextHeaderOffset = yield* this._getNextFrameSyncOffset(
              nextHeaderOffset + 1
            );
          }

          this._codecParser.logWarning(
            `Unable to sync FLAC frame after searching ${nextHeaderOffset} bytes.`
          );
          this._codecParser.incrementRawData(nextHeaderOffset);
        } else {
          // not synced, increment data to continue syncing
          this._codecParser.incrementRawData(
            yield* this._getNextFrameSyncOffset(1)
          );
        }
      } while (true);
    }

    parseOggPage(oggPage) {
      if (oggPage.pageSequenceNumber === 0) {
        // Identification header

        this._headerCache.enable();
        this._streamInfo = oggPage.data.subarray(13);
      } else if (oggPage.pageSequenceNumber === 1) ; else {
        oggPage.codecFrames = frameStore
          .get(oggPage)
          .segments.map((segment) => {
            const header = FLACHeader.getHeaderFromUint8Array(
              segment,
              this._headerCache
            );

            if (header) {
              return new FLACFrame(segment, header, this._streamInfo);
            } else {
              this._codecParser.logWarning(
                "Failed to parse Ogg FLAC frame",
                "Skipping invalid FLAC frame"
              );
            }
          })
          .filter((frame) => Boolean(frame));
      }

      return oggPage;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class OggPageHeader {
    static *getHeader(codecParser, headerCache, readOffset) {
      const header = {};

      // Must be at least 28 bytes.
      let data = yield* codecParser.readRawData(28, readOffset);

      // Bytes (1-4 of 28)
      // Frame sync (must equal OggS): `AAAAAAAA|AAAAAAAA|AAAAAAAA|AAAAAAAA`:
      if (
        data[0] !== 0x4f || // O
        data[1] !== 0x67 || // g
        data[2] !== 0x67 || // g
        data[3] !== 0x53 //    S
      ) {
        return null;
      }

      // Byte (5 of 28)
      // * `BBBBBBBB`: stream_structure_version
      header.streamStructureVersion = data[4];

      // Byte (6 of 28)
      // * `00000CDE`
      // * `00000...`: All zeros
      // * `.....C..`: (0 no, 1 yes) last page of logical bitstream (eos)
      // * `......D.`: (0 no, 1 yes) first page of logical bitstream (bos)
      // * `.......E`: (0 no, 1 yes) continued packet
      const zeros = data[5] & 0b11111000;
      if (zeros) return null;

      header.isLastPage = Boolean(data[5] & 0b00000100);
      header.isFirstPage = Boolean(data[5] & 0b00000010);
      header.isContinuedPacket = Boolean(data[5] & 0b00000001);

      const view = new DataView(Uint8Array.from(data.subarray(0, 28)).buffer);

      // Byte (7-14 of 28)
      // * `FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF`
      // * Absolute Granule Position

      /**
       * @todo Safari does not support getBigInt64, but it also doesn't support Ogg
       */
      try {
        header.absoluteGranulePosition = view.getBigInt64(6, true);
      } catch {}

      // Byte (15-18 of 28)
      // * `GGGGGGGG|GGGGGGGG|GGGGGGGG|GGGGGGGG`
      // * Stream Serial Number
      header.streamSerialNumber = view.getInt32(14, true);

      // Byte (19-22 of 28)
      // * `HHHHHHHH|HHHHHHHH|HHHHHHHH|HHHHHHHH`
      // * Page Sequence Number
      header.pageSequenceNumber = view.getInt32(18, true);

      // Byte (23-26 of 28)
      // * `IIIIIIII|IIIIIIII|IIIIIIII|IIIIIIII`
      // * Page Checksum
      header.pageChecksum = view.getInt32(22, true);

      // Byte (27 of 28)
      // * `JJJJJJJJ`: Number of page segments in the segment table
      const pageSegmentTableLength = data[26];
      header.length = pageSegmentTableLength + 27;

      data = yield* codecParser.readRawData(header.length, readOffset); // read in the page segment table

      header.frameLength = 0;
      header.pageSegmentTable = [];
      header.pageSegmentBytes = Uint8Array.from(data.subarray(27, header.length));

      for (let i = 0, segmentLength = 0; i < pageSegmentTableLength; i++) {
        const segmentByte = header.pageSegmentBytes[i];

        header.frameLength += segmentByte;
        segmentLength += segmentByte;

        if (segmentByte !== 0xff || i === pageSegmentTableLength - 1) {
          header.pageSegmentTable.push(segmentLength);
          segmentLength = 0;
        }
      }

      return new OggPageHeader(header);
    }

    /**
     * @private
     * Call OggPageHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      headerStore.set(this, header);

      this.absoluteGranulePosition = header.absoluteGranulePosition;
      this.isContinuedPacket = header.isContinuedPacket;
      this.isFirstPage = header.isFirstPage;
      this.isLastPage = header.isLastPage;
      this.pageSegmentTable = header.pageSegmentTable;
      this.pageSequenceNumber = header.pageSequenceNumber;
      this.pageChecksum = header.pageChecksum;
      this.streamSerialNumber = header.streamSerialNumber;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class OggPage extends Frame {
    static *getFrame(codecParser, headerCache, readOffset) {
      const header = yield* OggPageHeader.getHeader(
        codecParser,
        headerCache,
        readOffset
      );

      if (header) {
        const frameLength = headerStore.get(header).frameLength;
        const headerLength = headerStore.get(header).length;
        const totalLength = headerLength + frameLength;

        const rawData = (yield* codecParser.readRawData(totalLength, 0)).subarray(
          0,
          totalLength
        );

        const frame = rawData.subarray(headerLength, totalLength);

        return new OggPage(header, frame, rawData);
      } else {
        return null;
      }
    }

    constructor(header, frame, rawData) {
      super(header, frame);

      frameStore.get(this).length = rawData.length;

      this.codecFrames = [];
      this.rawData = rawData;
      this.absoluteGranulePosition = header.absoluteGranulePosition;
      this.crc32 = header.pageChecksum;
      this.duration = 0;
      this.isContinuedPacket = header.isContinuedPacket;
      this.isFirstPage = header.isFirstPage;
      this.isLastPage = header.isLastPage;
      this.pageSequenceNumber = header.pageSequenceNumber;
      this.samples = 0;
      this.streamSerialNumber = header.streamSerialNumber;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class OpusFrame extends CodecFrame {
    constructor(data, header) {
      super(
        header,
        data,
        ((header.frameSize * header.frameCount) / 1000) * header.sampleRate
      );
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  /* prettier-ignore */
  const channelMappingFamilies = {
    0b00000000: vorbisOpusChannelMapping.slice(0,2),
      /*
      0: "monophonic (mono)"
      1: "stereo (left, right)"
      */
    0b00000001: vorbisOpusChannelMapping
      /*
      0: "monophonic (mono)"
      1: "stereo (left, right)"
      2: "linear surround (left, center, right)"
      3: "quadraphonic (front left, front right, rear left, rear right)"
      4: "5.0 surround (front left, front center, front right, rear left, rear right)"
      5: "5.1 surround (front left, front center, front right, rear left, rear right, LFE)"
      6: "6.1 surround (front left, front center, front right, side left, side right, rear center, LFE)"
      7: "7.1 surround (front left, front center, front right, side left, side right, rear left, rear right, LFE)"
      */
    // additional channel mappings are user defined
  };

  const silkOnly = "SILK-only";
  const celtOnly = "CELT-only";
  const hybrid = "Hybrid";

  const narrowBand = "narrowband";
  const mediumBand = "medium-band";
  const wideBand = "wideband";
  const superWideBand = "super-wideband";
  const fullBand = "fullband";

  //  0 1 2 3 4 5 6 7
  // +-+-+-+-+-+-+-+-+
  // | config  |s| c |
  // +-+-+-+-+-+-+-+-+
  const configTable = {
    0b00000000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 10 },
    0b00001000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 20 },
    0b00010000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 40 },
    0b00011000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 60 },
    0b00100000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 10 },
    0b00101000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 20 },
    0b00110000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 40 },
    0b00111000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 60 },
    0b01000000: { mode: silkOnly, bandwidth: wideBand, frameSize: 10 },
    0b01001000: { mode: silkOnly, bandwidth: wideBand, frameSize: 20 },
    0b01010000: { mode: silkOnly, bandwidth: wideBand, frameSize: 40 },
    0b01011000: { mode: silkOnly, bandwidth: wideBand, frameSize: 60 },
    0b01100000: { mode: hybrid, bandwidth: superWideBand, frameSize: 10 },
    0b01101000: { mode: hybrid, bandwidth: superWideBand, frameSize: 20 },
    0b01110000: { mode: hybrid, bandwidth: fullBand, frameSize: 10 },
    0b01111000: { mode: hybrid, bandwidth: fullBand, frameSize: 20 },
    0b10000000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 2.5 },
    0b10001000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 5 },
    0b10010000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 10 },
    0b10011000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 20 },
    0b10100000: { mode: celtOnly, bandwidth: wideBand, frameSize: 2.5 },
    0b10101000: { mode: celtOnly, bandwidth: wideBand, frameSize: 5 },
    0b10110000: { mode: celtOnly, bandwidth: wideBand, frameSize: 10 },
    0b10111000: { mode: celtOnly, bandwidth: wideBand, frameSize: 20 },
    0b11000000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 2.5 },
    0b11001000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 5 },
    0b11010000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 10 },
    0b11011000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 20 },
    0b11100000: { mode: celtOnly, bandwidth: fullBand, frameSize: 2.5 },
    0b11101000: { mode: celtOnly, bandwidth: fullBand, frameSize: 5 },
    0b11110000: { mode: celtOnly, bandwidth: fullBand, frameSize: 10 },
    0b11111000: { mode: celtOnly, bandwidth: fullBand, frameSize: 20 },
  };

  class OpusHeader extends CodecHeader {
    static getHeaderFromUint8Array(data, packetData, headerCache) {
      const header = {};

      // get length of header
      // Byte (10 of 19)
      // * `CCCCCCCC`: Channel Count
      header.channels = data[9];
      // Byte (19 of 19)
      // * `GGGGGGGG`: Channel Mapping Family
      header.channelMappingFamily = data[18];

      header.length =
        header.channelMappingFamily !== 0 ? 21 + header.channels : 19;

      if (data.length < header.length)
        throw new Error("Out of data while inside an Ogg Page");

      // Page Segment Bytes (1-2)
      // * `AAAAA...`: Packet config
      // * `.....B..`:
      // * `......CC`: Packet code
      const packetMode = packetData[0] & 0b00000011;
      const packetLength = packetMode === 3 ? 2 : 1;

      // Check header cache
      const key =
        bytesToString(data.subarray(0, header.length)) +
        bytesToString(packetData.subarray(0, packetLength));
      const cachedHeader = headerCache.getHeader(key);

      if (cachedHeader) return new OpusHeader(cachedHeader);

      // Bytes (1-8 of 19): OpusHead - Magic Signature
      if (key.substr(0, 8) !== "OpusHead") {
        return null;
      }

      // Byte (9 of 19)
      // * `00000001`: Version number
      if (data[8] !== 1) return null;

      header.data = Uint8Array.from(data.subarray(0, header.length));

      const view = new DataView(header.data.buffer);

      header.bitDepth = 16;

      // Byte (10 of 19)
      // * `CCCCCCCC`: Channel Count
      // set earlier to determine length

      // Byte (11-12 of 19)
      // * `DDDDDDDD|DDDDDDDD`: Pre skip
      header.preSkip = view.getUint16(10, true);

      // Byte (13-16 of 19)
      // * `EEEEEEEE|EEEEEEEE|EEEEEEEE|EEEEEEEE`: Sample Rate
      header.inputSampleRate = view.getUint32(12, true);
      // Opus is always decoded at 48kHz
      header.sampleRate = rate48000;

      // Byte (17-18 of 19)
      // * `FFFFFFFF|FFFFFFFF`: Output Gain
      header.outputGain = view.getInt16(16, true);

      // Byte (19 of 19)
      // * `GGGGGGGG`: Channel Mapping Family
      // set earlier to determine length
      if (header.channelMappingFamily in channelMappingFamilies) {
        header.channelMode =
          channelMappingFamilies[header.channelMappingFamily][
            header.channels - 1
          ];
        if (!header.channelMode) return null;
      }

      if (header.channelMappingFamily !== 0) {
        // * `HHHHHHHH`: Stream count
        header.streamCount = data[19];

        // * `IIIIIIII`: Coupled Stream count
        header.coupledStreamCount = data[20];

        // * `JJJJJJJJ|...` Channel Mapping table
        header.channelMappingTable = [...data.subarray(21, header.channels + 21)];
      }

      const packetConfig = configTable[0b11111000 & packetData[0]];
      header.mode = packetConfig.mode;
      header.bandwidth = packetConfig.bandwidth;
      header.frameSize = packetConfig.frameSize;

      // https://tools.ietf.org/html/rfc6716#appendix-B
      switch (packetMode) {
        case 0:
          // 0: 1 frame in the packet
          header.frameCount = 1;
          break;
        case 1:
        // 1: 2 frames in the packet, each with equal compressed size
        case 2:
          // 2: 2 frames in the packet, with different compressed sizes
          header.frameCount = 2;
          break;
        case 3:
          // 3: an arbitrary number of frames in the packet
          header.isVbr = Boolean(0b10000000 & packetData[1]);
          header.hasOpusPadding = Boolean(0b01000000 & packetData[1]);
          header.frameCount = 0b00111111 & packetData[1];
          break;
        default:
          return null;
      }

      // set header cache
      const {
        length,
        data: headerData,
        channelMappingFamily,
        ...codecUpdateFields
      } = header;

      headerCache.setHeader(key, header, codecUpdateFields);

      return new OpusHeader(header);
    }

    /**
     * @private
     * Call OpusHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.data = header.data;
      this.bandwidth = header.bandwidth;
      this.channelMappingFamily = header.channelMappingFamily;
      this.channelMappingTable = header.channelMappingTable;
      this.coupledStreamCount = header.coupledStreamCount;
      this.frameCount = header.frameCount;
      this.frameSize = header.frameSize;
      this.hasOpusPadding = header.hasOpusPadding;
      this.inputSampleRate = header.inputSampleRate;
      this.isVbr = header.isVbr;
      this.mode = header.mode;
      this.outputGain = header.outputGain;
      this.preSkip = header.preSkip;
      this.streamCount = header.streamCount;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class OpusParser extends Parser {
    constructor(codecParser, headerCache) {
      super(codecParser, headerCache);
      this.Frame = OpusFrame;
      this.Header = OpusHeader;

      this._identificationHeader = null;
    }

    get codec() {
      return "opus";
    }

    /**
     * @todo implement continued page support
     */
    parseOggPage(oggPage) {
      if (oggPage.pageSequenceNumber === 0) {
        // Identification header

        this._headerCache.enable();
        this._identificationHeader = oggPage.data;
      } else if (oggPage.pageSequenceNumber === 1) ; else {
        oggPage.codecFrames = frameStore.get(oggPage).segments.map((segment) => {
          const header = OpusHeader.getHeaderFromUint8Array(
            this._identificationHeader,
            segment,
            this._headerCache
          );

          if (header) return new OpusFrame(segment, header);

          this._codecParser.logError(
            "Failed to parse Ogg Opus Header",
            "Not a valid Ogg Opus file"
          );
        });
      }

      return oggPage;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class VorbisFrame extends CodecFrame {
    constructor(data, header, samples) {
      super(header, data, samples);
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  const blockSizes = {
    // 0b0110: 64,
    // 0b0111: 128,
    // 0b1000: 256,
    // 0b1001: 512,
    // 0b1010: 1024,
    // 0b1011: 2048,
    // 0b1100: 4096,
    // 0b1101: 8192
  };
  for (let i = 0; i < 8; i++) blockSizes[i + 6] = 2 ** (6 + i);

  class VorbisHeader extends CodecHeader {
    static getHeaderFromUint8Array(data, headerCache) {
      // Must be at least 30 bytes.
      if (data.length < 30)
        throw new Error("Out of data while inside an Ogg Page");

      // Check header cache
      const key = bytesToString(data.subarray(0, 30));
      const cachedHeader = headerCache.getHeader(key);
      if (cachedHeader) return new VorbisHeader(cachedHeader);

      const header = { length: 30 };

      // Bytes (1-7 of 30): /01vorbis - Magic Signature
      if (key.substr(0, 7) !== "\x01vorbis") {
        return null;
      }

      header.data = Uint8Array.from(data.subarray(0, 30));
      const view = new DataView(header.data.buffer);

      // Byte (8-11 of 30)
      // * `CCCCCCCC|CCCCCCCC|CCCCCCCC|CCCCCCCC`: Version number
      header.version = view.getUint32(7, true);
      if (header.version !== 0) return null;

      // Byte (12 of 30)
      // * `DDDDDDDD`: Channel Count
      header.channels = data[11];
      header.channelMode =
        vorbisOpusChannelMapping[header.channels - 1] || "application defined";

      // Byte (13-16 of 30)
      // * `EEEEEEEE|EEEEEEEE|EEEEEEEE|EEEEEEEE`: Sample Rate
      header.sampleRate = view.getUint32(12, true);

      // Byte (17-20 of 30)
      // * `FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF`: Bitrate Maximum
      header.bitrateMaximum = view.getInt32(16, true);

      // Byte (21-24 of 30)
      // * `GGGGGGGG|GGGGGGGG|GGGGGGGG|GGGGGGGG`: Bitrate Nominal
      header.bitrateNominal = view.getInt32(20, true);

      // Byte (25-28 of 30)
      // * `HHHHHHHH|HHHHHHHH|HHHHHHHH|HHHHHHHH`: Bitrate Minimum
      header.bitrateMinimum = view.getInt32(24, true);

      // Byte (29 of 30)
      // * `IIII....` Blocksize 1
      // * `....JJJJ` Blocksize 0
      header.blocksize1 = blockSizes[(data[28] & 0b11110000) >> 4];
      header.blocksize0 = blockSizes[data[28] & 0b00001111];
      if (header.blocksize0 > header.blocksize1) return null;

      // Byte (29 of 30)
      // * `00000001` Framing bit
      if (data[29] !== 0x01) return null;

      header.bitDepth = 32;

      {
        // set header cache
        const { length, data, version, ...codecUpdateFields } = header;
        headerCache.setHeader(key, header, codecUpdateFields);
      }

      return new VorbisHeader(header);
    }

    /**
     * @private
     * Call VorbisHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.bitrateMaximum = header.bitrateMaximum;
      this.bitrateMinimum = header.bitrateMinimum;
      this.bitrateNominal = header.bitrateNominal;
      this.blocksize0 = header.blocksize0;
      this.blocksize1 = header.blocksize1;
      this.data = header.data;
      this.vorbisComments = null; // set during ogg parsing
      this.vorbisSetup = null; // set during ogg parsing
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class VorbisParser extends Parser {
    constructor(codecParser, headerCache) {
      super(codecParser, headerCache);
      this.Frame = VorbisFrame;

      this._identificationHeader = null;

      this._mode = {
        count: 0,
      };
      this._prevBlockSize = 0;
      this._currBlockSize = 0;
    }

    get codec() {
      return "vorbis";
    }

    parseOggPage(oggPage) {
      const oggPageSegments = frameStore.get(oggPage).segments;

      if (oggPage.pageSequenceNumber === 0) {
        // Identification header

        this._headerCache.enable();
        this._identificationHeader = oggPage.data;
      } else if (oggPage.pageSequenceNumber === 1) {
        // gather WEBM CodecPrivate data
        if (oggPageSegments[1]) {
          this._vorbisComments = oggPageSegments[0];
          this._vorbisSetup = oggPageSegments[1];

          this._mode = this._parseSetupHeader(oggPageSegments[1]);
        }
      } else {
        oggPage.codecFrames = oggPageSegments.map((segment) => {
          const header = VorbisHeader.getHeaderFromUint8Array(
            this._identificationHeader,
            this._headerCache
          );

          if (header) {
            header.vorbisComments = this._vorbisComments;
            header.vorbisSetup = this._vorbisSetup;

            return new VorbisFrame(
              segment,
              header,
              this._getSamples(segment, header)
            );
          }

          this._codecParser.logError(
            "Failed to parse Ogg Vorbis Header",
            "Not a valid Ogg Vorbis file"
          );
        });
      }

      return oggPage;
    }

    _getSamples(segment, header) {
      const byte = segment[0] >> 1;

      const blockFlag = this._mode[byte & this._mode.mask];

      // is this a large window
      if (blockFlag) {
        this._prevBlockSize =
          byte & this._mode.prevMask ? header.blocksize1 : header.blocksize0;
      }

      this._currBlockSize = blockFlag ? header.blocksize1 : header.blocksize0;

      const samples = (this._prevBlockSize + this._currBlockSize) >> 2;
      this._prevBlockSize = this._currBlockSize;

      return samples;
    }

    // https://gitlab.xiph.org/xiph/liboggz/-/blob/master/src/liboggz/oggz_auto.c
    // https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/vorbis_parser.c
    /*
     * This is the format of the mode data at the end of the packet for all
     * Vorbis Version 1 :
     *
     * [ 6:number_of_modes ]
     * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
     * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
     * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
     * [ 1:framing(1) ]
     *
     * e.g.:
     *
     * MsB         LsB
     *              <-
     * 0 0 0 0 0 1 0 0
     * 0 0 1 0 0 0 0 0
     * 0 0 1 0 0 0 0 0
     * 0 0 1|0 0 0 0 0
     * 0 0 0 0|0|0 0 0
     * 0 0 0 0 0 0 0 0
     * 0 0 0 0|0 0 0 0
     * 0 0 0 0 0 0 0 0
     * 0 0 0 0|0 0 0 0
     * 0 0 0|1|0 0 0 0 |
     * 0 0 0 0 0 0 0 0 V
     * 0 0 0|0 0 0 0 0
     * 0 0 0 0 0 0 0 0
     * 0 0 1|0 0 0 0 0
     *
     * The simplest way to approach this is to start at the end
     * and read backwards to determine the mode configuration.
     *
     * liboggz and ffmpeg both use this method.
     */
    _parseSetupHeader(setup) {
      const bitReader = new BitReader(setup);
      const failedToParseVorbisStream = "Failed to read Vorbis stream";
      const failedToParseVorbisModes = ", failed to parse vorbis modes";

      let mode = {
        count: 0,
      };

      // sync with the framing bit
      while ((bitReader.read(1) & 0x01) !== 1) {}

      let modeBits;
      // search in reverse to parse out the mode entries
      // limit mode count to 63 so previous block flag will be in first packet byte
      while (mode.count < 64 && bitReader.position > 0) {
        const mapping = reverse(bitReader.read(8));
        if (
          mapping in mode &&
          !(mode.count === 1 && mapping === 0) // allows for the possibility of only one mode
        ) {
          this._codecParser.logError(
            "received duplicate mode mapping" + failedToParseVorbisModes
          );
          throw new Error(failedToParseVorbisStream);
        }

        // 16 bits transform type, 16 bits window type, all values must be zero
        let i = 0;
        while (bitReader.read(8) === 0x00 && i++ < 3) {} // a non-zero value may indicate the end of the mode entries, or invalid data

        if (i === 4) {
          // transform type and window type were all zeros
          modeBits = bitReader.read(7); // modeBits may need to be used in the next iteration if this is the last mode entry
          mode[mapping] = modeBits & 0x01; // read and store mode -> block flag mapping
          bitReader.position += 6; // go back 6 bits so next iteration starts right after the block flag
          mode.count++;
        } else {
          // transform type and window type were not all zeros
          // check for mode count using previous iteration modeBits
          if (((reverse(modeBits) & 0b01111110) >> 1) + 1 !== mode.count) {
            this._codecParser.logError(
              "mode count did not match actual modes" + failedToParseVorbisModes
            );
            throw new Error(failedToParseVorbisStream);
          }

          break;
        }
      }

      // mode mask to read the mode from the first byte in the vorbis frame
      mode.mask = (1 << Math.log2(mode.count)) - 1;
      // previous window flag is the next bit after the mode mask
      mode.prevMask = (mode.mask | 0x1) + 1;

      return mode;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  class OggParser extends Parser {
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);

      this._onCodec = onCodec;
      this.Frame = OggPage;
      this.Header = OggPageHeader;
      this._codec = null;
      this._continuedPacket = new Uint8Array();

      this._pageSequenceNumber = 0;
    }

    get codec() {
      return this._codec || "";
    }

    _updateCodec(codec, Parser) {
      if (this._codec !== codec) {
        this._parser = new Parser(this._codecParser, this._headerCache);
        this._codec = codec;
        this._onCodec(codec);
      }
    }

    _checkForIdentifier({ data }) {
      const idString = bytesToString(data.subarray(0, 8));

      switch (idString) {
        case "fishead\0":
        case "fisbone\0":
        case "index\0\0\0":
          return false; // ignore ogg skeleton packets
        case "OpusHead":
          this._updateCodec("opus", OpusParser);
          return true;
        case /^\x7fFLAC/.test(idString) && idString:
          this._updateCodec("flac", FLACParser);
          return true;
        case /^\x01vorbis/.test(idString) && idString:
          this._updateCodec("vorbis", VorbisParser);
          return true;
      }
    }

    _checkPageSequenceNumber(oggPage) {
      if (
        oggPage.pageSequenceNumber !== this._pageSequenceNumber + 1 &&
        this._pageSequenceNumber > 1 &&
        oggPage.pageSequenceNumber > 1
      ) {
        this._codecParser.logWarning(
          "Unexpected gap in Ogg Page Sequence Number.",
          `Expected: ${this._pageSequenceNumber + 1}, Got: ${
          oggPage.pageSequenceNumber
        }`
        );
      }

      this._pageSequenceNumber = oggPage.pageSequenceNumber;
    }

    *parseFrame() {
      const oggPage = yield* this.fixedLengthFrameSync(true);

      this._checkPageSequenceNumber(oggPage);

      const oggPageStore = frameStore.get(oggPage);
      const { pageSegmentBytes, pageSegmentTable } = headerStore.get(
        oggPageStore.header
      );

      let offset = 0;

      oggPageStore.segments = pageSegmentTable.map((segmentLength) =>
        oggPage.data.subarray(offset, (offset += segmentLength))
      );

      if (pageSegmentBytes[pageSegmentBytes.length - 1] === 0xff) {
        // continued packet
        this._continuedPacket = concatBuffers(
          this._continuedPacket,
          oggPageStore.segments.pop()
        );
      } else if (this._continuedPacket.length) {
        oggPageStore.segments[0] = concatBuffers(
          this._continuedPacket,
          oggPageStore.segments[0]
        );

        this._continuedPacket = new Uint8Array();
      }

      if (this._codec || this._checkForIdentifier(oggPage)) {
        const frame = this._parser.parseOggPage(oggPage);
        this._codecParser.mapFrameStats(frame);
        return frame;
      }
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
      This file is part of codec-parser.
      
      codec-parser is free software: you can redistribute it and/or modify
      it under the terms of the GNU Lesser General Public License as published by
      the Free Software Foundation, either version 3 of the License, or
      (at your option) any later version.

      codec-parser is distributed in the hope that it will be useful,
      but WITHOUT ANY WARRANTY; without even the implied warranty of
      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
      GNU Lesser General Public License for more details.

      You should have received a copy of the GNU Lesser General Public License
      along with this program.  If not, see <https://www.gnu.org/licenses/>
  */

  const noOp = () => {};

  class CodecParser {
    constructor(
      mimeType,
      {
        onCodecUpdate,
        onCodec,
        enableLogging = false,
        enableFrameCRC32 = true,
      } = {}
    ) {
      this._inputMimeType = mimeType;
      this._onCodec = onCodec || noOp;
      this._onCodecUpdate = onCodecUpdate;
      this._enableLogging = enableLogging;
      this._crc32 = enableFrameCRC32 ? crc32 : noOp;

      this._generator = this._getGenerator();
      this._generator.next();
    }

    /**
     * @public
     * @returns The detected codec
     */
    get codec() {
      return this._parser.codec;
    }

    /**
     * @public
     * @description Generator function that yields any buffered CodecFrames and resets the CodecParser
     * @returns {Iterable<CodecFrame|OggPage>} Iterator that operates over the codec data.
     * @yields {CodecFrame|OggPage} Parsed codec or ogg page data
     */
    *flush() {
      this._flushing = true;

      for (let i = this._generator.next(); i.value; i = this._generator.next()) {
        yield i.value;
      }

      this._flushing = false;

      this._generator = this._getGenerator();
      this._generator.next();
    }

    /**
     * @public
     * @description Generator function takes in a Uint8Array of data and returns a CodecFrame from the data for each iteration
     * @param {Uint8Array} chunk Next chunk of codec data to read
     * @returns {Iterable<CodecFrame|OggPage>} Iterator that operates over the codec data.
     * @yields {CodecFrame|OggPage} Parsed codec or ogg page data
     */
    *parseChunk(chunk) {
      for (
        let i = this._generator.next(chunk);
        i.value;
        i = this._generator.next()
      ) {
        yield i.value;
      }
    }

    /**
     * @public
     * @description Parses an entire file and returns all of the contained frames.
     * @param {Uint8Array} fileData Coded data to read
     * @returns {Array<CodecFrame|OggPage>} CodecFrames
     */
    parseAll(fileData) {
      return [...this.parseChunk(fileData), ...this.flush()];
    }

    /**
     * @private
     */
    *_getGenerator() {
      this._headerCache = new HeaderCache(this._onCodecUpdate);

      if (this._inputMimeType.match(/aac/)) {
        this._parser = new AACParser(this, this._headerCache, this._onCodec);
      } else if (this._inputMimeType.match(/mpeg/)) {
        this._parser = new MPEGParser(this, this._headerCache, this._onCodec);
      } else if (this._inputMimeType.match(/flac/)) {
        this._parser = new FLACParser(this, this._headerCache, this._onCodec);
      } else if (this._inputMimeType.match(/ogg/)) {
        this._parser = new OggParser(this, this._headerCache, this._onCodec);
      } else {
        throw new Error(`Unsupported Codec ${mimeType}`);
      }

      this._frameNumber = 0;
      this._currentReadPosition = 0;
      this._totalBytesIn = 0;
      this._totalBytesOut = 0;
      this._totalSamples = 0;
      this._sampleRate = undefined;

      this._rawData = new Uint8Array(0);

      // start parsing out frames
      while (true) {
        const frame = yield* this._parser.parseFrame();
        if (frame) yield frame;
      }
    }

    /**
     * @protected
     * @param {number} minSize Minimum bytes to have present in buffer
     * @returns {Uint8Array} rawData
     */
    *readRawData(minSize = 0, readOffset = 0) {
      let rawData;

      while (this._rawData.length <= minSize + readOffset) {
        rawData = yield;

        if (this._flushing) return this._rawData.subarray(readOffset);

        if (rawData) {
          this._totalBytesIn += rawData.length;
          this._rawData = concatBuffers(this._rawData, rawData);
        }
      }

      return this._rawData.subarray(readOffset);
    }

    /**
     * @protected
     * @param {number} increment Bytes to increment codec data
     */
    incrementRawData(increment) {
      this._currentReadPosition += increment;
      this._rawData = this._rawData.subarray(increment);
    }

    /**
     * @protected
     */
    mapCodecFrameStats(frame) {
      this._sampleRate = frame.header.sampleRate;

      frame.header.bitrate = Math.round(frame.data.length / frame.duration) * 8;
      frame.frameNumber = this._frameNumber++;
      frame.totalBytesOut = this._totalBytesOut;
      frame.totalSamples = this._totalSamples;
      frame.totalDuration = (this._totalSamples / this._sampleRate) * 1000;
      frame.crc32 = this._crc32(frame.data);

      this._headerCache.checkCodecUpdate(
        frame.header.bitrate,
        frame.totalDuration
      );

      this._totalBytesOut += frame.data.length;
      this._totalSamples += frame.samples;
    }

    /**
     * @protected
     */
    mapFrameStats(frame) {
      if (frame.codecFrames) {
        // Ogg container
        frame.codecFrames.forEach((codecFrame) => {
          frame.duration += codecFrame.duration;
          frame.samples += codecFrame.samples;
          this.mapCodecFrameStats(codecFrame);
        });

        frame.totalSamples = this._totalSamples;
        frame.totalDuration = (this._totalSamples / this._sampleRate) * 1000 || 0;
        frame.totalBytesOut = this._totalBytesOut;
      } else {
        this.mapCodecFrameStats(frame);
      }
    }

    /**
     * @private
     */
    _log(logger, messages) {
      if (this._enableLogging) {
        const stats = [
          `codec:         ${this.codec}`,
          `inputMimeType: ${this._inputMimeType}`,
          `readPosition:  ${this._currentReadPosition}`,
          `totalBytesIn:  ${this._totalBytesIn}`,
          `totalBytesOut: ${this._totalBytesOut}`,
        ];

        const width = Math.max(...stats.map((s) => s.length));

        messages.push(
          `--stats--${"-".repeat(width - 9)}`,
          ...stats,
          "-".repeat(width)
        );

        logger(
          "codec-parser",
          messages.reduce((acc, message) => acc + "\n  " + message, "")
        );
      }
    }

    /**
     * @protected
     */
    logWarning(...messages) {
      this._log(console.warn, messages);
    }

    /**
     * @protected
     */
    logError(...messages) {
      this._log(console.error, messages);
    }
  }

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  function out(text) {
   console.log(text);
  }

  function err(text) {
   console.error(text);
  }

  function ready() {}

  function abort(what) {
   throw what;
  }

  for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
   base64ReverseLookup[48 + i] = 52 + i;
   base64ReverseLookup[65 + i] = i;
   base64ReverseLookup[97 + i] = 26 + i;
  }

  base64ReverseLookup[43] = 62;

  base64ReverseLookup[47] = 63;

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode00d8.=Mp¼êF¥@'{OËUÇð3R§dG÷¿>òqî=M³Ë¬Ä¤qq
KDÔSNF©TxÐÃFeÀ¢sq= Ð¢×49r~yÈ¼¾â®_]*zÄ¶·ÈÕ¬jÛßÄ÷^,·üCëjü[¿-üP6õv¯è»Q}>«&ê³ùC]= %¤Zd1\êî;kè#á·Arpÿ<2ØÃW½\<Åú½Ã\ÐR]Gxî· fSvC²©k¿4/ÔG«×ïÓ[DTE<°¡æÄ°+ý¬¹äÞÒw·ik¢×mycÓ¸¼Wvî>ftI*;]èëZª
)©EÅkI-¶dÏ,1,r²¡ytõMï¾l]ä®ýSh«°9·KÇÎî3¦RñÇëÇt#{ÙiûyT¡òòÞÐfÿ"îM$®Ïäv8cæ5§HÀ©dûïáÐßJÿ»}a\P$wö'b;/¦
¯bqúÇX½ÎäñÄ@úÀ1ªd[>¤¡*þÞvLÇ ~>=M$]îÃ$|úHzatÁù¯$ò¨xÓ§±s!» ä¯Z9}¶îØ)àAÃ·*@@#ß¾àÕ'D¡æúüåªIýî&/xY$X^¼²X©ä|He óZKÁ8ÇõIzy(¨ª@	.j×mæÜ¸4{-õ57JU;f.Å}v[Ã²ÛXÁÀ;ÏýÚ$Wq×ªPfÍÓø½¸KÀyë8eKz°ÃW]Ì××åEÝÒï÷UPySª"ª Õz¸NÅ£!Ç= äÏõ£nâ_ÎTÇ3ÑÇ=M@^;Êº»=}ÓÈæïÅ²Ooc´g2'Ï"©.%@'_äÌyÅ
ä1GÂzª¾EI0´÷î'ñ.zÞeÓ0»ÌÀµ¹Aô½áðm÷3+ñÛlïwPàdÁ¾û1±¶"ÍÍècîÆqv£<òºZGCÃÜÖ°»ÑgàÞ5ð¨ÆçrAlh¨\ãHªÛ¯?Í×]æÄõ{·æÄþ²ñÎ¤ö±t0$uÙ©Úù)¾DÎB:|#]»Á
âÎ>ç£,8~òÜfÅÀ@²åÄÃ¢)Å¥ AâÁÚ=M¦t²ðY©D:H"{ kE@uY»ÊY» î©ezÛ¿ÆøD©3¨.%~*¸ûV±@ABIù¶U©iE}¥>1ìµ ª «{\èe3'ÁMlÕDÿÄù@,>Ðmj69ü°ßækZÞ1= ¶qz+\¸ÐLbÛ©ÔÃ?ãûk)¡wx°ÙÑ¹6AY¾àïZzîdä)¨¸B5hð8=MB£K¬.-BêïÍmg²×Ñ7¬&¼u-¡1)jËz}j)jc©±HulºÄY }ëôÊÀ¹?ÛÛèÈûÅ4a
¶ÆqsCk;ô¾á&I¬dv³Á-úòýò=M¾w1Îm6M¼öÇ²:»_¬²×f¤¼ÔßV¡âYÌ«M#{úå5«×= 8Á
Ö{,ÆÿþVBgDT¬HwÐ\ÍÅ{{í33 ¿,NéOÒ)}*p<bçëpìá(uÍuv'aNxvÔ²»<YÍsï~{kDfÑ{äùµ¶RrU§DÒ<óýSµ
Ñ¥ «À®OC³@Nò§[?]?¡*Î4Å ëÏAºt*<ÒÂt÷.ò$EcD]G::jUho=M¹lAÔ5Öóó>yüæ[¹»|qÉ°o²ºSaf+,¤¤¤¤¤$_£¤¤¤djt¦+|0·7òmÒ¶ó£sÄ®-þGÀnßÇS!ßomûñ+"ÍÃ2¡|V1¥ aÉôd½»FD;oÁýJÝ^ø¸¸ªeVËÊbÈ*=}X8Ô¥y9¯R!39³Èu]_üûKhßµüdwX'4÷K¢Ü0èÂEügt+ ü Âu»¾¹ù²FÙ#ã
 æ;ägQSÅ{ööÂùOJ¡eL# dkôÖÔÖ_õíù¿°cº¿ç$JHu½ôÓoa±WT¼~P_rbÜ©zþµ2zÑËÏ6æíI©kq£9?hfC¬A«BMópÂþ].ÌÊÕÌ@è=MdñåsÎÐéy(ë+ÝÙðÙîô<èwA 	Àh%ÚÈ6ËÅuÎ½ãÌ±'(ád4éÂÉRôIù¯&tUHä.]z1]]Jï4Hlë­þ}cLD!éìoÙÆ= Þîtû¡f·¸93{WuÓ= >òã²LÅØ?ðÌÄÆdù;uâÿMÑËÝO8¤+4ú_=}xÞVUºdt$cQÄÖJyk­®aÑÂÑ2³G{æµéW¿ùäÑ.Â]Ox²µ4yGÇvuô2ÍI¬¤¯pUÏÇá;°©É3çi%"æosö¹ ÆWËð0ÝÅÆAÏR¤ûB­	ñÖ[8'#=}¿bYïEÝ;£¾T,= »zLMasÓ8Ô×	FÄhV]¡{Éò -?¶¸wn·¸ílÆ9 ÓÓQ¶óUFï=}¸B= òW4³¢sIP´WÞþWh1j=Mt>òÁM[ÖÖAGª?tR©zBAÊÒLÓ+s»ª-©\<°4f;<úàG×A~T3	åt&ÝózôÚ??ÃrÝ¨pTXìì80ªvMÑ6åR8k½f
yñ}¨!ëÒÌÆ¹ùIÚ8¢¶0ìK¥º)¨;w¿UA].é2@íOÕ¹4ìËÉ_gÏúãu8ÆKyúx7Ó×£/W4i¬3&è+ëç¥p1\ ]ÀpdÃÖrâNNn~ÚíWoænÛ<BRNÖÎÚ^T?ÆCËVÒ¶Æ³UÇÃÓ¾qË¶ ­ÇevD=Mæ0«[Ö>}e08áãsÓöf¾kñAþPî!<hëÝìæâò¤àÙ68äbÜÜ9XÝlxðý1ôý¡hÐÿ¿F·VOv±À­§M¦+-&/­d^­F}bVí¡fz f8ÉÇ;m¨¾õÞÚ8àP©[##+þGÏuâSÓVu¤"Ohk£8År 9ÿü,Ma!Û']zÂ:^%%çÎÚ©ÓßæunE=M+a3Z²Lbõþ²$	*¶9zg§UärTäÒó-^ÐðL»;¨¼;Ø,Û²ÐðÅ ÐðR°kÃ¸)&ccüJ²»ÁaÜJ(¦	jþSJ\K Zu-K/ié/i'¨V=}¹áR(¢66ª¶jté¡q½jú$JÎ+!¦R¡Q'læ©AÿP p^V®WJ y&­±×Ã¬3Ê¡~ª÷àÃ=M¥¢Z-1ä}z$<¢²¢XÈ¸ºZÅ b&ÓL û®àùÙbºV·|Ã´#ÍwKM¼RÈÁ6ø­¤ö,é.±('zÂÛmcLÐáÀ~bÆ.©ËëU§×*%Qp«y(.Î¥Äô)SOngÐ|<döÝ´N4Ìxrî_}4õ¡æ7c[¯SO_ö{¤ºì4ü8©¹üKÿ&Ç(±= è ©|= 5»FQ/RBè|1¶6§bD3mD3MÜO*¿$µáÔ.i¯êyaA/ºOá a]ø¸â/B¼jiU.Î:<Ë"ÉÆ¿¡&stg·<ÃÉ^U5õGv6Üy\"ÎDO(®"±¼&¢þ ãñµï¼Vçn©Ç§F$6.ôø¡'î~N6AÉû= CÄíæ4ê:yôYtîmO¬éG¾ªÈ5~XyÊC8òðµà¤;ÔM!áúý= ¬f= qO3û¢zÄ
/Ôÿï8Ûi¶7ø¤îmFÜ´$cëb¢àN+G( =MËë­×ÐýZ§?Â(íLÆÑh,Aä!'çObAT-¨ÅÂKN¿ºþGUëà'uOqÎ?Þ²¼?Öë¦·'bXPfÖjXCþJkÞÁé^åQ=}mÙáâY*Ç4íÓ,À piúÉú¨f×<,T}M4ïÐ'ðmOÂ÷(RrÁ¹ÛÄ~Xã{"¦ÑºôêÏiÂÚR¢Ù´!/ÂÏ×\ÞúS]d90gtêÓ= Å,.ºÐ6ÀìÔ1\äjñáÁ8¸ª>t®ÿÖ|ëo~~\øæ0
 ¹ïßAÄ=}}NÞ¨1íýÑqðú© [é1= mü¬´h(< G,2äáõäá­ðêbäá=MxSË ­ðêxäáÀ%xµò©Å1­"*Ôr)üOLFMb?zÄ)=}¬oà ZcZ@¾zºGT	Wµ.o9¥qm	4x æ·ÏüõÆo©(ëaé+ÿ\öQMªQ¥Z½>Ìm8Ñ0HïýY³ýÚeÅ
YP©JS<8ÎàîYKýEË=Mâ¾°*n«àîÞÎ-²òTS1ZHÒðe=MÑ0Jn
ýÕyJòVüûWSÎ|þóV4â¾]p;hE«dp#¹KÕÈBGÄÊX%?Õ.ØzjC¹ í
úq©º·g#)îý|í^×h¸vså~5YÎÏíÄp^1-Á¿sA+7}§ãºr?ïÎÍªÒ,±«ÀÖ+ó­ÿõiSèy_ìá^¯O>&ï«}Ùxÿ·~4BËmDâßøVms$BÃÀýtøä{aÍª®ÄÖ ñýðàôq¯:=}P6Ä
Ç@$ÜÞøÜ:ëþ©ûi8Ë?×¾×³×ÒçVÍwìt]¾¦Ôµ·SÁ×©×ÔGWÌüÃ=M7¡KÏÂîç7ÒéâºÍü'²¬LLGÈ	cz·/&+ìÛ÷¥ð¼ãåc¹bu.7öï.:ÉÂ~ìAwA:ÜDïä±aQaÒ%n4ï·oÞ *)ó½=} '(63fÊêÜ½£(¬QU¢Jä¨æ¢Ò~.¢ÅnSKºIä¨d®2 WC¢Kä¨ w0^Êaî¢n{ÔþØµ[Ê=} wByÔ6[Ê¢Ú¢5fÙñûÍ:§>¸:å®W¿!G±ªÖ¿Ì§øõT&PO.ëL$C À$bÅ\_²1öêü4jî>xVîÇ*,YÍ¡+k÷Â[]Ù½åÀÓºIÀùPÞ#ù¤ Ðù$º$Î²~N¥qªJîTéÔqÀ£Y±3;1äDbÅ:îÕ¥ñóØ?@ bg)¥¿
FH&= x¾leYrP8+ü$¸xBÖKÆ¹WJD}¢¹î4ÊÉ= s:î«0=}Ä§-÷]¶÷jìøé»Ò&¢´Í¡4»­¨
ä-ìÅäkIÎÍÍbc¯£M43~I³ôóiíYFÕÇ~ÊÕëë»ÀªpAwÙ&Qf¸æµyþ9ÍB?µâS9Ç,C çEi2å@­©+.Bqí;Ò6!5÷y\Ìu³IÌÏªÝ	dhö¸gÅ	N UÄãêOZºÝfª)J·1ø=Mþï£)¥Ds«vKr>åßüÄ'Y:ü¦É«¹¥e5÷vÝ Pe?l/= þ>³]Gx­¬øCH¬)x¾ïÁûÁyÉÔZÃÅX³í°gI0÷ß«no¯öÈ±	øô,ö~Ä¹&Qh@¡ØQ÷1Ò×ó-¤½Vç°Sfü2ûÃ=M¦ÿoÓRlOHÛÀ.}æ$µ ½4ü©÷,¾\q0_zÏ4mù^8Â^üPoYâ*Î
}þ}ìåc5uÅÄ1mÅx2§=}o4V¤©
f\2¨ø¿Ï«äV*%t}tÄ©KÔy9¼	&8>ÃÙp(±þH YüYkFÝeô:ÂZä÷¹¼YX7(ù¡ÕL±fT3ß=}'è¼')§ÄÌ4²½]-tø ¢Z"f2fKy´ñãxdqÃyZò¨(ø5¹q_­æÜhÅyÎÐænÄsT²[¤y)ÎÖIìÝp¡ ¹¯ ñ3]¸.AþYjÐù´9ø¼Dzçª£Í)­Õ§Á)tòúÂê]ÑØ&¡Tw¿Dtt	fµ=}¡ä÷çðª{~ B©µ7´}0ïXÄä@qaPAùL¥ññö%U·6¯wøÍÐèÜÐ>öÓIxâÝMUùÃ¸F¿=}HÇeUFÓ^ ¦ÙQ ?=}lýÉ°ºã<÷0VVñ&53Sà¿-wäµoh¸d-
óYoK \{ÕøÚÁv¸ÁèÀ(m~&3¬^ÙAÞýúu
nN}·BÎ¤ÎC#Ûsß-2É|}²OÄöò¤Í?÷B#KY(pX^¹lÞe;ùÂKL#qò<B©
hBâge$­­;üðýÙÜ"rÕô´Ô2c#ï"ÃÄxçVQ[ÛÖX'ÐÌùw¼«ÃtyÖjæÍAó¸Ï!WòÁãÊ'æSô¯"föófpB½zæ)_8í¸_üõ¸Ã±kARÓÅÓÍâuûÖ$\Ûg]ÂóãUk¿{29c_-g¿âÇ¬­ÙÆ«BÍ£½æ-{£W[êûrø
w.7*c¢J@-¤<Û=}Çd·ÙM)¹ä»Qq§jÌ©£À4ÚÎ§	Ó= z^Ô¼ÑÑjT[C0ÝÙ£±ê-yÍNÝ(¹Ã ¬ðnÃdøeó3}9!LÝiFÍäD×m7ä{±4ãüPGõ»à
§Ì@¦ehâÑëQW7XºBy4Fí_¹P­(HëÏ?¼Tª±ó§wI,Ö ±óM±Fí_ÄiÏëlnåu<ò+¶=M¼a¥ÿI	är_y×²î=}ËAXV1¦äûyÆ².F
Xè}ÂwÄjÌß©£>íE<Í+Ö©¦ ¡Þ«Lr$ÓpÂW ÿ_¤ùU õÂ[:¾öUgºGÀuiÆoâ­^TxrnñZ!(lZôú ¢Ú3~à<µpÇ#.ø.åê'0"Ìsa9k iaZê[þ	y®ü~pesÞB6ÃHâý¹.°°Ð©á§²\?EUú9b^vH&¼EPµ¶ÞkÜ=}¨à¢]xy#¨'/Vpc÷Iá~\Vt$è=MæJ©*L¸qã=}.¤ÙTL2£I¤öï«<bÛ= ýì+¦H«¦Jcû¸ã}:ìDpöðÎ½þçy!>ä^}pá.$ûv«©ïÒYfVsæ§ÜsHôà¥:Æ07 q¥ôYûõ*Ñù~Ö¸5õìW-]YÜ¯üäâ!Ì<( úiùaYäâ!¼è8kðÉ±®aFUéà§²\Ó\å[Ú\_éà§Ú¹M_=MþGÊÉ[ú»iKÉÛÓçb´4LÍ[ú¾
æ³=}<­èÍgýüuAÁ!ó!ï%²"Rª|;!'sL'ªó%rå´òq'l¤_dZ¡0<¬N'´¤Àë%ó£³4( OâqÑ<9Ï$îSrÄ;UÑ= Áõbz1ù°Ga°G£!Æ¦Aã«4ºÌÿ³ÞÎ²h3ãt,4y"¯4£_qè±ç#ÄæÛ÷+Ù ¼ÎÁ'¿µãþOX[_1Ý·z$ã"p¡'qålå]ý½vÞ´»E¿!ØÿEÈ[ËØ¦³¸)+p9N¹à%E5±³tú)úê$*³ÀÒRDN÷&	pñ~½6h+	A/ô¾Åbû?ùTÃÑãó9¶ÿ1x?O ÁYvJU6mãAól#ª!(!¿uf0,­Z·iÔ4ºÕlðYQø /sç¦¢ý¾8Ø'¢ýDØG¤QJSm£P²*Yc¡zJqUlC&yûY¡8à¿õ½êþ!º5I;4FgJÁJMz%gåÌ¼CÅi@Ï;¹¹óóoÉ÷Ìéúd?½ý%h#}½'Ük  uîK[KJóPíåLÑ´<ùÉÑFVÓ±ûG7ò¾BÕ}Â³±<Sq^q®»"Z³KY-3ÎiÉGD¸ozxÉ¶Ð¦=})¢[	t§eGoú= aÕõRK³9ì<T¤¾{*½¸O´B¾.Y3Mïð«1c=}6ÃN$HµÆRO¶µ½G.¤LÜ~{à£LMoAL!oÁñJ$Ç;eLpBÄf)1¶òóBÕáþ¯£¶w/ÙMX+ZóÀ
ý$§ÿ?4·»ç«0&f>TÌüM»Úwdh[d¢ú*<ÈÁnw!»°Lªq(a£÷&oHÄ¬¡Àlfwdf#DÓ<	O
Jêsvd~ê&]êt.æEñ´å^4'»ëÎ'b Ð@$r¡?Á©J0¾b²¡?hìõûï«Ù'$x¾+MÌÜ:Â"þWÃs'ÑÜÎi:{,1U»9 rJe,
·Ð|¬OÂ÷Q)g= ¼¯rg¡ùPô¨-O¡Í}HËJôï}æäc¼~÷8ÙÁ6¾?Ü¨¯í¢¢ ¨ô#ñøóM;èØú¼x<|.îñKcZ4$¾51Ð}}h8C»ÊÏR³l¬·¿à("¹tt§µSÏÓïÛK;Wf6óæ<ÑÝnÄ«ô
ÖønJ÷[0äÀ!æ:1= }Ô£ßDÃønÊßÜ!}ÔHè#Iä=}ÔÝ¯NÏø®EfAvþ_ÀìBC)3uJ*G+X«/êôok4sjü  »*QÁ¹f+*<·+*Ì
<ÿ¾ýÔ¹Ç¹XÊ¬
l2 M(ÆOP"(ä½l¯ Ï]âJPcmJ½¶Äø¶ÇÈl¨Ò 
2÷AyÔæ¢Õæ'á¢ÿnyTz]Êæ¢Õæ'á¢nyT]ÊSõlÓôvÊ w5 4ý_Gl°n«cLäÌI\y×=Mñ±Ðu¿' ÉÊégË\wºÑåßb¥~f[Ñ0èÑ2ð@Tq¦&ÊáãTaç¬³¤åÒÜ^V¯Ý2ïIoP?ksN.7ðÈ¤qk8ùú¬òÕ·' ²=}s'VAP4Bû£V_,ÐÕ<Aj²1úCûüÕS*JÆoî,ÛúÍd×b¹cMQj§ÌÊ=}ðãmñóTÿ­gÉ?þqÇ_âà9£®ø*vØVKûèÀøRøTìÕÄ7ómÈ¹Áo'ª2à-H­ç~v¤¨·¾4ÛÆ¡oî÷3
Óª ÷vß?¯ãk^Âlá
= ?|2B'Yü7ú«= jì¸ì7büm:ÀFÅê~r º{LJFW'%é¹,Iì
ànéÈ¯¥¾2l Õ57Éµøjñ:uù©Gn»à ûïª @] ñÓòÉ÷=M2¤Ã®OKd²Ñ¾-Q~X¤3 ¨zvk+KæØøqû9ýY[> 1ø)ÐT,¦ÒÇ.ªöªáÔ¡þÃÃ{Wóç$ìGÓõmQþKÙ³¢eÀë.æü:àrÜÝçÂà
ßó¶þ_OØ^?aZVw ÿ(ØþÐ4ÖLüÌ®l ýû 4¤Yµ÷Aðn#*Ëyf¬ºlUf_­C½xÀcç"H¾=MöÊ¶ÚÌ¥ÞrÕ>:A]HM*ä1þx¯{¬Øàé
6Öµ= êÄÃëÉ¯ ûÉÔd¶' [¢A"4¦Ø	&êìE)Ì¥QÌ²ÒÂRT.¥>'
wéÝ­#( !mxhøøàFÒ¸¿§gÛqòßJg áòvìDæswÜWÞÐkºÞM.þ
q|«êðá:áê®ÆZó Eh<rÒ#};UÀì7@¡jðWö²wSáA´ÁzØO H|TK^Z|yøgn8ëçÞî ¢¡Ú!¦l64ò±[üDFÕõ4ï¥?ü¹×Ób²´¦e´ý)G"¾£ìz $]4h´çU0x­HÚ-¬!Õ-)'<×³ û¾VIçß¼+Ð½>êÄÜëd_>ßûÓ3ùóý*è«|(Ö³ByãBÞ}¢O¿-64Ê*¢c¢£Ë.Q+]¸*½QmCc-O4Ë-¶t/ÑGMè4TG6½:m-àÆqQmOï¯HÊß*ÒþXúì¡VÕÏläwOéþGó:Bã/	^ºv%Ú¿*ìçÏmPòÄÜ¾¼tÑnãè:dA"* ;µÌ¶Æx+óÛäied.Tà-qÂÄ7òøl*8w÷ãS±7³¡oO¯UGG¾65*Æ·Sñ+*òÐVA= u8âO©&Ixköé$ Ð÷Q Øëè"í c1=}´ÅNSFçªßq=}xh_úLåbÓLYð	¥A­|§¯{c¿§ï±(½WÆ§íAdZz7= 6±¼P aà*,Þé)¯bñíWe}ã»=MÑ'?fX½ÒJÂ)  ä4&§¿~«JÐîC"u8I.q $Æ.ê¥ÕR©+ñÂqêoeaa
mA U&ÊmÒM¥W³½ÇªHU÷ËBú@èíìÝºBÌ]@¤¾¡e(d¯¦\00ø0ia{Ûô= Ê7
ËýÜ³(uÄã©Ù*A­ø=}­¿ÐE ©b.Ì§² ×ciÈ-:i$J^Tp¼²?¶lU~B
íj¥k>}¢Èwÿ¼NÖ¿pæ}eeSÕüõ<)¼iÇbÙ¦åKigügïÖ=}t¿ùÍºWö¼1 5ÕVnçÂ§½ÁôÌ)v\¬ÊÖ¸ÇÑW-ö_¬³MF¿×{K'ÕI¤Êá_Ñ®]2Éå, £»'K >TWë
ûº
Âgªìì¦=MÛ9(Wl¤öËcQÃÒ¿¢>¾?ÍB?Í2=M0ÐBl;nÑyG¨"ëù,[¬\-î,ÿcúey7Ò­§(WH/· ÊùxX@ ø¤k*Y|·5¨ÐB4N(½Û:@ fÁé6¨ÐÓ5²GzêpÁ¤ìVx9¾"üÝ½º¬å¡sO¦7 ,LWZ 8ÀÓåØ,LýBxáx^yÕØ­xnyþ×|YB;^xÐwÙKÂö>Gl3Xºst?7p¥ePýØú Ëá¼ÝUEuÁU¿³½®ÔkÚ½4ÑÃy­<}¬uÑ¬A$Fý-vç6%?Fc$IH"¢ <«{ÉÕ¨ x[°òMÞÞÅq~Á
«LñMpìÙ¨ÏpARdÒØsæ%_)O	hJFoì=}ç EüO^Jc¼Ùàät¿UOHlMµÙ>}=}7hc¿£®håÏ ¨g»êö7áÔ&Ò¢ÄÅ«Æù¹S= åYÑÿëp£ÁôÕ[ÇÍå«T÷ãÊÊ=MóD3#ájyó"¾g¹v&QÈkïâÎoÈù»,±Ýcï®ýå¾ôÅ'sÝEÛ8²ñÁ ]É9Wùx0§®"4_£/¶*CjIËªLbç Áì¹çnÚ9²Ëóõw-Ôñ»') îº]½9+¿á}½ïn±²µÐKèW®È?úÏé´ù¼á¾I»çæ»§Ìk¹¢§?½x ø¶ìã{~>#Éo_ì^²ûaÎkå×ßb=M9Øm_;ê(Èó)ä~!(ÑU$¹Ìó§«\nx!KÀ¢ Úû5¦çØ¹?ÇåHªÅÞ&,Wfjöì´ÈB)I@!þ
9n±£ê®ðìØÏêó$ì©vaZ£û¯³óÛÉzC= î<$nný.fìßÁ£üDÃ>ç<TáÁ8ûà;C"×ù?FiªÞÌï¼Ý}&ï>bé-Tv¨=}4µd ®j¯eÍkÑ*ý]A¸3]²ë  ·Ìü@fñv§ÉïÞ'+*õA3¶'t¤^Îp9qDùZ3ô
E:46é2éWåúÓ,º.wñ¼çv*Ã¿!=M#Ìº¿²Å n#Ñ±¤!
Ñô¥:Ð3tI·ÑÀÎÝ´X:hm3P2»dºÑ¾eÇ(Hûz´®·Kvò=M)u¢5¦Çí×ëë#Å6¿+:^õ~ÞÑ¶ûãòL®÷9å QÐØxÑ»&Ñ·FÀ1qØQnQãG	»ly{
ÕK¶+CÉiÉ>ßÈý¿3azupëu°Fÿfër\mïë[{Kvÿ]èazup¦i16Ä*j¸úP!%	Ã}è73-ìbÐÆ¨'.¯}Ô¡Ì?ÐÖµe2Aoú8=MÀÛSÝ/@4?Qæx9GhiÒÆ%°Wu.§i.Lô'µh°WÅ4p¢ÔxËóâ­öâ1@u²½îçZ*SÍ8þ?À'2vÄ¹ï´bÝZ):ZÍ=}îÿØcú+Q=}!5°éÉLïÇuºFË´LËh1»KRëÁÒõbBa6;Å ÅÁ³£gç ÿ
Ãð©èeà	ëc¡]0úè, tDÏ7
²nêÏ-'l¢ò{ò97¸yr½®¸®ÉK=MÃ»WÁ#F47IÎú5lfÇT9íÅà5.îL²\jµFí>%Cu¯Ý(QÌ-bîM3þH^'íX<Vcî= RÃl7>à}wÑBIàfèø¥§¦4Zó;&¥é>-><ò¦´gB£ÿ÷uÍ1£PyÓ__'3e@¬ÙÁ³[¤JhÖùwyt_ú²n÷$·Jsê'U¥iºd«ð2gÓÁdÌë5Á'+$q$õPOÝ±prMi9û+,ö½©y[)w7¾EòTVNues½«ÍL_ 2ÿô¾óê:¨S£DG°Ñ4x M·q7TÖÂCÅ½Òo£;¼	dcÓà÷Î¥¼Gáå¶ïò´^È^XÞR¨ÚâÊvªw+þÝMxÉÝSVÑ½ÊÙÄ$(ñQ]*p~Ú?K$kç© ¯.áÕý¤ý¼¸0Ãýì÷=}¹/0![X:§ÏI ?+~Ûªßq½x}£³7æ®ß8Èé5Ä½v¢-Ë°ñÍu£F#ä~ÇÞ(ûÒÈôhNñHnÚahx]ÜD·DäSG´µ¯Æ%ÀñËÇ;5âáh_)Ý£Å¼Nc úVY(uÅAAcé<D óÂ92¡rçµêBÀ·zPÐ#N­ùÆæÖ©^#P=}\iþXµCÚ°náhá8þØÏCVµÀsøÆ@±Ç=Mse,nÕÒ¥¯VÊ#W@ý÷?ÍÏÕ®eö-³ÚXe¦Á¼IÐv~­Ô#'hM¿]l¦sÌá|@É;-ô	54{*âßXIë¯a	£±ã«ÈÑ%ÈµF§iÝù¶,ö÷*DLVT 	=M:-ßàî*¢îjÍJ
*g:Cû®\pòÉ
o¦ä´ïÄ{êÜÄ{N!(*µ¶"±:¢«³²î:eU|ueU<U¬·C÷AÎaq¬[q<@\!÷¨_<Á¿>o:ä,{Ý³< ©ïð­æ ·ö<nYZE|BódõS%\ç*e¦mØèâçî^hænÊÐZ#IÜyCÄ½òs9;¾º,ßÂSWytÂº¼ùüKüs½+¼Ìÿit !5fw8 ¸µp¦oÍX[Ì_úëOXÖ4ØÉ;HNC¸ReQ0Íÿ¥mo8$µðáûRâVÒ/ó¸ºÏ&5Ëeu2fÉH¾cÃê¨c:üzðOiÞ)|½\à($=}ó)Ì=}3&ø^<E3¢iÛ)ÜI1^·µ0;)¼8ÿá0= *|g÷81ø1ÈY þJ[y¾§Jeðû\[²úâWÒHä)d)ýÛxqWxØÙGCRö¥¹½gyÒ¤ÿ²ÈFöïÚ{ øýç9+mi!h¶lb5·l¾õ t;r:ÝþôìsJ}°Þ^ìKôó)Dk;;bEKDm:çHDºRàæù½ì*öhoèì½Z!Y82ö)¶[mÏú°õZEVÿé÷H\huK­²{^N?F4Sô©¬Vç]rÞf*p.y*&ùTY ¬mM_,mN+â"ìöÔ]ña( aéûnÔ´ns «Ö<}!»ô3sJé(V}T0}s,5òíwù.ë¿Æp[pS½²zpQØµÕ#ï¬­bLëiFªëiÆ,|ùªM5¥¢z³øÑÆvóSéSéõÉúÄÍú¼¾áúò"|Nü{×ÿzaxT.k= PJé'ùºq= P~úvå)ÿ¢±í®S þè®¯{6@ó6@Ã6@¨æSy%¨æQyÝyµó\/ï]>x/$eUájÎZ:1i4úÒmcØãé¸ÜÅb½c=}"gNõùËÄ÷ÊÄQÎÿvÕ-§ÖW_±ï¬âasã]éEqbDL17?®g(ÏgyéûÙ_à~6Ü_à®àþ6ÜÜUÆ#>n¶r1RysHv G¿úXztDêÅ®»¡÷SÊvÔ9øWÌ82r÷Ç]&Rú|¿ªO]Ìµ|³_pi=MÂdùÒÿÍÕ	ÉäR^vy)æQ^^=}<vÏ>eå5«ãÂ:¾1ä¤âëÇÞ¨#ÑÐ¤h0¦Ð¤OP³ýÐ,èñã#¡"aàov­øh§	fë8ã¿ DHq
Mû£:[´ãHGCoÞé±¨¿ß°04£xnêéKu¬=}æAèÂ0¬¡¹¹³f¦èÛî[³©f[S©ù¯@1'¹ëùTÇÃ-§ùëa@Ãs.:èùOí¼æ|º;F]ªà­íID ûèÚyëÎ¬ªöÂ£¢BÑdµ-TÁÿíÒô$¤ÀRØ¤= ¼d f¡ø9}þýDÞkâD$v¨}oæ ~¨= þ±\æÏèrbìB!MÕøÅÈ8Ý =M¦Þ]ø¢F'Ì(öØåpÕgì[~'ÈLwö%æfcm©§ÞAªÇagUjÉ=}ñB3¾ËÔarÔGÅT®Þµâxc5¨çÛÀ±À{Ø²ÅZVè·ÄZäxO÷Ü¨¯xÏÛÀ5¨ÏÛÀ5¨¥ØÒJïÌßÙÌ$ïÌ6Ø­Ýó'LÇÜ¨û5¨³ÙLãËh_h_rh+å¼Û¡ó0}ÂëåÌ~XÒPkTXkç¡E&F¡%&F!!¯ü©ütt¡áÿÿ%¸<©üK&¾%
¹<ªüÿEkdNqw£³xñ¢	Ð{÷n¤5âË&)»c>µg2ÄuJrçÄÑÝ@¢+â=M°Gxx¢ÂÀc{ÌÞÔÈ¹½Ø÷a£÷ÓdDOÇ®gôvöLlÑ-Ø?@lCÉuy7F¥ËGþ×3§«oÀ{Ø°ÝUð§NÇß¨FïLX±Ýï7ÇZ¶áxMÚÀ5¨3ÙÌmÀ¥ØÒJïLXvÁZ6åxxoÛÀaÀØR|ãRùX&O/ÛÀyæà+ßu²«7ÙL:'WÝ¨ÉÕíçÄÁØ²¶«7ÙÚ M?ö©]tBÂ$h»å<ª]DhzãIåüÇ~åüÁbÞ:h|YåÄÑ@À´7¾ï]Õo½äëæ>t÷±Ph¾e³ÑáÙ´ÒcMîvx¸ðÚ3¶_øé¼½ÕàbÊè$¢w÷)VîYWÞ>ÑøZÅÊÐºv]7Q_ÈSÈQÆfWñVÃÆ? æ_ÃÆìùgMÏØªBPµÕ$m6Oé3qÃÆVbÀ¢6O³ì)mÆÆ{ .ÃÆðVÑM°7¬f ;Üçl Â[è=M´^èûY×!^4_hÔg'¾ßÏÍúWJ'ý¹9&ø$êù^ÀÆnþWAtbOûoÐ2¸*\´,ÇC´²ÿÈbÖµUÿ»ÿnµzp°Øïû|¸^è¢gþcÉ7XÉ­ó= x»¸Xé¤éì¼«ÁÝTúÓPõyáw²ÍÐÉt
6ñ3}¸ñLÿtäWÄæ ÅN8ßÆº*L­ÿÂùr^®ç±Ll«f2¢d¨µÉØ.Þ<,NaY+Â'ÌÕÜäªöÿ5ñè½ügØ«îei´J?uÊìÅÉYñÉY±rºN}1½Ì´×]vWñÉU¶H°!ÁÊ0¯;¯ÉÝÏÌ>¯£ÓSï}p;¬íeä
å+çÇÔ/T(M÷°W6.#1U>x¤ÒU$ÔØO³k_ 'ÎÐE'6k÷ÎÐkïïx÷Þ¨5¨Ù³ÝÕøX±ÝUð7ÇZàxMÇß¨/xÇß¨/xsÙÌ½ÀçÚÀqÀØRãRXvÀZ¶áxxÛÀLïLR¾ùçMùç=MM&Mùò aæ\ÕPÚkõSÊTÞÝPÊTJsk³%Jkks%ªIª=M¡å&F¡ÿ%J¡!k1¡tkQk$q!£!³ü{¿qwÿ'®·qç?}D®!b|º	È'(¤Goyò9È¯r/´dI5l£ÖÛ,Ãë¶	¾¿7Qúâ^#1rÕbjÿÍ2¨BçÐî7à¹½¿NÑ ÇØßô4ç·i§ÛtsöBÏÍ(K 4¡T/ïÀÕ@á/»ÕÕZ4ÇKWûKÝÜ.6=},FM{}ÐqWñjæÐNæOæÉ ÜÏUÈÂv"-Å«eÒE¹áæÏj2ÃJ¸PrÉÜ$Íz"©Sómôá=}¤ H*.èR!7ÙP2¹ º'ºÇè§l@®ý= ,2tÊgz7º÷ç}=MONÍháVa
=}~'ôÏL±Jm/pf$ÿr¢31M3Æãë¹?¥p+y(.2Q¯£eQ+d¡ìß&HÈ
ß&~9lí cÀ\÷ÊëjbePÓú#£
m£BÍl	Ñ¦è²iÎÉÍ¿<ÞDð(Cù¨xI~{!®Év<4²nÒè÷À4åEhÑR%òZQ(óÃ}mF7=Mi1pSèYÃêPÎØZà7#Ú@¦1 ]ä×#DzKäFþcÔDÑv|ÆÃ]?Qp-Q<+ÛáFôR2_åme¬+ãt¸áÌÐó0Âô¥K$umoæ­ÈÜÇ*ª!óY´xÃê¼ªÃLÁ¹³£ûïS¬ãÃÉûÃ<½.ÝûþÔ&\T:ahO\lÙë 7¼&0@{ÝXQzº÷zÆ¯¦AWCó[m ûH·Jî*óüÛ[M@ÒºM{ÿ èÚxF
YÆ³¬uÖ¥´èà¾üëIÁ6ÖAàè§x¸= #Ö´'&Ë§Åñ"ØR;G4fU]ãe¯oéÑÙ;?äÍ,mÄg2±Ç)Î(G]D3ïj#ÈFËîòAf+¢HDs:fb}ôszÄÕ^ g·	Á¡Ó®µU¯WÝ¸ëòÉF}9AÏR]iF¦+òYæ]$ÚM'¼Bc= ¼VUñå2/8Ö"tR;#Òw.N14à#f£kÊTXAbæoÑÓÀ.¦@$ÆÛÓ£pÒ¶&u9 ß6pÑq>ÁUõßÊN7á*¬{÷cû¬_VáÆuSj ¿Ï¿}_=MïèKÊ .UÝ³Ñu±27Ú¿ pcg®«KÌÊó4ùG8ûí®°|ªDØµG®­®ìe!Îb-K´gÐh¨®ÛEÕÀ¶ßÔ0\¤¤Ç=}[¸u|VÀ+CpxIó*Øíß­ýsd.xn$>&SQö¸çE§7E,Êf{8¿ä= Ej!èÞ¯Ïc>QR;:³Jß=}³Ó 5Pú¦¢ÃIîÛ¯ÆÏº3gÖ¶sÈAÊÙ¿l~;¥}ñ!^ ú8£PdVr-òq¬¬0iîgg ¤?elJX©Ç´
Òu>Ô°z¬¤óÜÝ÷¤Ø{¾BuóvpI'/á²n_¶»÷jÎUôö(è+ü§7l»ØìxQ>&»ÊMÌP:CxòfD|ÉÝªQA3³µú9
¢èkz23:Ð]÷ÈUKBwê·ÅlpÆÉºnP+:£uê~+Zå×/]º=}]6m-"¼µY§TSägT^Hãï$&*V¾wôï½&rCrôhÔAò»Adwá_Þ MÑýçÝ¤®­&i¥£Ë§Ä7½W½,8s6VÓ=MKz"ò¹%Ó<zcÑ1¡Ë	öµ0ã6ÕÑ§Ãä}+R¬ ×7èÛÃ²´*ÓvK»D%(ý×øÔGÔ¹GÔ9Ìü²Lðáå! ~äºðÑ9¾ìJQ#¿
ü¿öJe§ùx\8c¹í»É(_"°HW©ÿ)*îÑ¦m¶\Ê¢Xzq¯OB^ÁÑýz-\òY_a«a80F:ÌÒ¿O_#6¥CßB¶Õ(ù+Æõ¥¹ßDíð¶Éùî+yCs¹ÜõõNneáOkH¡h_ý
aëVpÝâ^ø'%¾,\ÃÙ_Ó¸}]ÇmVQNZvW÷î¶xNt
"ö9%PLaY{=}¯ÇXØúû([k2=}gk±]y¤   >!æ	ås­ yYn*·¾H¬ÇIç'%*M¬½1¿7Mð×yT)ÿ?¿ËEA<øþæi|Qk+Q 9 Z$<>u$BÜZ$¼ò¶ËãÒcÍl6{6JðVDjì'*h8©OhiÔêËþ%Å&Ú#óZ2­X"Ñ]«´éÖ1õUlÙos±tG,ÑIÈ«³³×Õ¶«è¥¿ÌQY<h[î£	§5@§:Wÿ²Ýj{±KÂ<¢@Ø;VãÔ Ãx0ÀÐR]«emýA}+VÞÔ©»¥Iãð¢y+l?nß}=}¤ìsÒó±Öü÷§m#À°â¥Ó´ØÚ¹¢N ê>¥C.èfÁ«Ñ=}Ö°¦ø; õ=M¨öBx!¸SøÀèg+)!;=M¯133Þ9%­
(=}=M9þñr!ÅHF ¸äàÅ©¶.9Êb¾&
]ôÎj|Ã|xÚþ53	£|ô½ê<¥n3¦PÓ2±¦ a+D7;=M×_×Iim"æM5
~tÎ-tºÊ±:£á?ÒnoPa:ðªjèáø§Ô3
fjlC4_lM1õ»^ÏÀ \ä@ ÐlÜ«1ucM«íq¬Ìù¶IKÒiýÓÐÔïz[£cÒêïCU&BÕÁ:ÁB¬jË@)¦n¼Èé¡Ñgû Qì¼D¾Jö¼DUð£i_]+'Îè+= tèÞ]_à¦j½ÚúÈhÈJk­uâNûÈU=}¨»Ï¡ºR YPÜRgÜ&Ð½õÇ#x6¥hìGµ= TYÑh½	qûí{[ç¤*¥/®L2ðxÅp
=M=Mô~C?¯áÁªJ4¢µ®[ÈWngàÊ0;3Q^ªbÁ¨vF(nlFoDÔ A-Q#|ý5ªj÷a<Ah®¦n¼%n¼%o¼E¨©¼Ê²=}Ú®Có>½ÿ+t1ow}H9¦ÉÞ-A¾ß"_ñeíáK3= :îpìl'Só½[<Kñêì!\p¸úAR¯l97J,q¦ÏJ,wy¸¢9A\ì¯¬
|¹1§>sï=M£3TbJà7WfpÅS1DÊhù!EpøÖ©\M#Ô§]Õ;Q.ôV ã¤^	ó¦P#7¹·{8sâ÷éîÛË8¾Z=}©,å%ì´\¤nÃ}L§+ÊEx	=Mb#v} bY=M~|æ¿¨óö¿hÊ¦y3ï4LáÕôÝPþH%a@,=}±W,«\ÁN¡£fÔØa»í~¯õÖ¥ãðHºD(è«,7iO¼ÙT ñdO%z:uezé àY ^áÓÐH6ÞþâtÎÀ_ö)Úpù ÃR¤,øÝpU¦¥ Ï4ÌpõÂP! ª= !í\~+Æ¬ñÏÃ&w¨>]®£àÆÎÜë'à?]·ÒTq^²~m*ÍÓ÷ÉpÒÛbýVðºÖßG6ô*ËKÍ_á.×WõM¬Ú§º'®¸<HD¸¸Öêjwhsp/hq/(2zh,rnn2,¤Ø8däJû^9ðÐ:EhmÎz××zÝ*8&¸>@¨¸6ùqût@ì+RËOz.ëvLw£[ÔRºÎR¸ãÕõé¿ årßyk~Å×¯]Ï¦Öå÷.ö²õe±¢@à¾ùÿÌj¿ÔÄ}o ½_/qßMy,é¶5ÆX£iÑ­@%Eä ÚÏ×sÏ»UÌzØéÙÆÖØ[åãÜ>$9Øiåãiúßæáôóêí	üûHOVQDC:=} ',+25¸¿ÆÁÔÓÊÍ°·®©¢¥hovqdcZ]~y¡¦³´­ª×ÐÉÎ»¼ÅÂ}zg= Y^klurÿø=M
÷ðéîÛÜåâ/(16#$G@9>KLURaf_Xmjst{|ÑÖÏÈ½ºÃÄ§ µ²«¬AF?8MJST).70%"ñöïèÝÚãäùþ &!*-43NIPWBE<;úýÞÙàçòõìëxnipwbe\[¶±¨¯¤£¾¹ÀÇÒÕÌËÜÛ8øØØÚR³E³E³>E³E³E;³õè*iíæÉmà	è-±mãÝh/Ah)mä¥­âõ¨.U(­å-(+e-ç½-áý(,MÚ¿H2H7MÝwÈ5YÒ[ÒX?P0e2[XE°rYQp)ðiòZyöIôÅ1tÇqv%´Æ[¶¶=}4ÄTÆgVæ¸VÎ-·¸¶ÎvÏ!÷9énL=}o;U:å.MOÏºØÎMóNLC;J:Þ~MöîLF?;ìL:;P:àªäªÛLð(èÜSE³E³E¶­E³E³eÅ¼§=M$Ðnfq}8	n.YÝàK	M;GóBÛ©~Hì_3#C&DGÍ°°Â2å6¹%SDÏÐ¶ÉÝwrÝ	ZyÎ_vÎ³IÅºÙÆ@ÅðoH}EMtGc[«Eò>Â:u_Íá,gÃ41µ[[3¹ÖZßÖBàú=M0ÕÈÜÍUU\ó=Mæòy?Eä{M&õZ6À±h3cBÙ,¬ ]ºr*«øëªCü®â= Hîï ÚéïX£P4ØvkTõj[7Ý¸ñ Þ= ã/ÔøõP4Ø6;=MIÙ°¶ã3aã	tü9ÄÿØS î¾9ù±JºÚÜkaãðZ¸Ø*åØØÚÀµ¡èjáùèêÚù\\ àùèêÚùq9ø\hèàáùÜø\hèàá9ÇÕÖÒÏÕÃÓ¿¯÷ÎÜ±\ëfèbFh¹ô!e¨¸ó5Ñ¼é=},QYßÆhnQî?Ýït0:ãT°u%®I=}äpr1~h9	>ØÛÔ½çÍ$ß­OëeôJ"Et©´!=MM%´¨³5Í¬©=}/MNßÅtË.Qí/ïw,*£W¬É5%­U-¤lÈ21}Ì(9.Û×?ö8Ø/[Øà¯´NwE³¥E³eE³E³Í¾T¡
[ìPhxÚµÈñTàÔÜZñÐòdYÐÚÄ0ã&8ÛoÙÖß38ïnX=}ÐçÖÜã¸4Z¸ç´Þ=}xèFK¨Ü2¹å^?Èè,VÈâ]û¸t[k¸Ûç8PÚÛ¨Yczö=M¶zâò)¥;êí(UeK¬);bÒ©/{³rÏ©zÑ}ÑîgBO©ë¥LEëdqC;n2+¼¬,Ã~y-aÔC¥;²ÿÅ3D³9;ÅbNûÎÕöÓÕ|åÃWÃÖ×ÂLCÉÕÐFÄÎº_ÐEÔ2Ï+«AÀH´?´¦¿êd³Ãd»^u\Ö Wn©7ü6ë§ÒÒ÷ajÐ7'ÂoÌ×êïRs\;5u¸S)yÏ/"Ð¨S!P$geö*6+eÖ+Ve2lV¢¬ fRï{¢=}EÌu2ñ*÷dÍÍµÐ8T!5~Æe»vIzò*¯8<#²ðj!?[ï[gü!Rÿ-å"ÞW!ã%Ê	ÑF°&Îq¹ t´ÔýWðüþ; ¹{ÑsÑ/0×ás9µT8áÛÄsw{Ñ¦TíÖpíªÁEÓL	Ó
S#·7¥.>Ìa±øsv?N²!ó~¥%¯A#«sÁÅÅ«,%wªò~m:²Á°rt$FYApZ·xDÊörqØè×u°9ÔÂÿ:ÔìÓô=Ma°Tbî{.á·És= }.åÿTgúöá£= IÔ#DÚÞ2u4Ü¯îÁÅûh 9ÍÈèAÊº{h4e= 'I= Y¼U"û:?ïI Æ~Z¸Ø*9øØØ@à¹{¥;E²ô®¾0OK4àù\èàù\èàù\èàù\èàù\èàù\èW§Â³®¦3ßÃCÄmêÎ¤B³çÓBm¤~Ñ[!K8F9Þ¶¥f1\kÝtrW2$wÀ#%Â?xMÍov®²('AGy/kißïÈR8Deô0YÉ	fx>ÙÚ¨ðÜêu[Ò¢nt" qB£_ê·cb@Êw ÊÙ·bdËæbóÿ:ù~Ôbiá1jt{¬ýjf©h|zAhBLzQN9'²;;ò:MÒy.{C^ð|û¾$t}u3H¦£!óOÀ|´«HÆá½cÏGdº ¿Òx{/CçQèeVØÚôÆZJPàp_±é¤NÈà9áÇÕb·aßPÃ?ÔÆ¸zW7Ð+Ô7ªñ_H×IÔ²,]Y$¹² 4óà]#;k;Úsû;Y¥¡®CÛyHEøìe.²n6sª(CîBKEDMÄ²°<Ã°%WÏÇËÇÕTvÓÇÇ¯¿Ë·U]Ö?êùâÜ\åäD¢Êàsâî}1x m±9ã1Î\S»ýSÀµµ@ü=}C¢£·ãÅm#L h÷pK= óhW(R¨XÁ/77³'V·wÅ7NXèO3%.°/®_Ä«/k{j¨j~ôGÃµ7©AË V<¦AF,ÖñÁñ» >Å½ÅàÑ!ÕHNP±!ºeÆ»~»ºäNqdlM°=Mÿ,À9%ÿ®T5úæ= ¡¤å½2;Ú|õÜ%|ÿ§õã~½ªmw¥ôåç_ f:»f±fÝ_ú[+ffPßæÓßy[êçcr?ËKJKÊÃ|M¤²C¢C²QÊRÕ4NF1iª5Cíð >i@´íBJ+3Ã>Ú¢$/ =}-ÞÄ¡8Ê~çÅ^9e^j..Òu!nÂÈ,T|òsîO©N	åqi*»É¦H4Ê'ÿ6Úê
ã]®\Xß½sôvÚOôw.Ø÷½\¹	Ðð!éÆÅDH
}°-ÄõÃ¿÷_f#ÿGv'¢§%¤onóÿ
kC @ÿ£Ì+°=}í\Æ*+PZy$n þNlA",»ÁÉ%ýlz­KìÚ×9éæ0{6
YI;÷|38«HÇæ,ê	>YýeU   Èj©I²é¨ v ã1íãgÞÝ]êA]N
¡<ªÈé^I}Mò5þ8t]¤LãÄPÝ¦ÌË°±bÝTËTVY0e}²+MHé(h6|­AÖ,Ã4âão2Mô!uIí²ò6½5¯?/ ®ÛÃÃÈÍ.d äü>´ZDNG^P(óÍó±åbËVÛ#[ñÅ¤æ­æRë
Ó¥@~_rTfÐØN¨Vèè¤>,1LNÿßµÁætàwg3§Hÿ=}ÿ¡êEÁ"õ©÷9g"YjHá6B¿<í<©Y(FâNPc:U	3|Hë¾2¶ÂÄM8Uj*-©m²ò²7e®GÛOOÈ³®3´%±%ÊnÉJUÛÆÍ(dv9bßUËUÖY°g²3WÈöK/MoE^2Ô@Ë	ÉÔ\WÆZÎø°éT *z÷B³yWó²ÆÄÙ6]7¹®ï´#±#Ê]ÉÊ¤ÕäVÆ½hÊ×}1ÊD0|±aâ{µ:ýÓ(U5$·YVx ïÜù
çñD^çù¶±õÑÌ§NL2,à¢ù 1Xd­utèëD=}æÿ¶KYu%äußlªQýäCB(9Ìq¼B~£¥¤Ë­ßÂÐ±zGyl·ù= ¨= C= OE·Vx·ËP±O%*Á5ÑPq~ñ	uJw4N8nÓÔY.VÝ6Ò Öè6Aåð>Bù(s5gqefh·øÒïÔÚÒ4Ñì	Áäu&T;SÅÐgÖ²«¥VUñâc¸6@w*ZÄ¯Íäçé\é!3)ÄFOH4kÿû¨k°ñ« #ä!*/K lâl"ë½âñ¢%ká|[z4É$G487ü"Ùom¼rF9æVmH±jõ!Åq6º^~Ú}ã½c¸òRë=}"¤ÿ+4ãðæ|Êö©_¸¨G¢ghwMR"Ôïº³ÓfçÀwc1nË]n= Û×YÖ.VbÔ}³<ºWêW°IT$×Æ1£ÞÞÀiÆhG_7A
©o°ãk±eT&KE=}d§Û°çÂã£hiÀøî_aÁ¼DBî8þ{ÜVõ9ø(3ÀÅ$þs¦E»oÚHò6= |yBDÙV_!RÃÌ~qE½ÆËãÜ[÷ùE@ßÎðÝ¢:= ZhBöK»ÿ= k¼)b|quÄ¦¢¿?u¢.h3AA°­TEG?1ÑpKÉÝ!Í¯®4&WõéfÁbWrÌ_r3Ô¯r«W Ê¾îT3Ñ+Û³Ô#³uÇa©WlÌÒu rª¦2sCÐÊÃ^rÉk>¼¦ ô·}Q$súzO$×P!jÈ»µ[¯ «mnAQfq§üy9ÉùioLxg
&¬è;2þ}¼lc259AÝELDNÅÈp]ç=MÌ"Ì*¢£w÷B²Më«E£ó»¹ÃAéÚÒøL´JN9K=}QÎà½\"íªú1©­ñB%¦ ã?ëâkÁ¬##j9§uOb@´µU7¯Ï±%Qå]·-Õ°ÀCÑÕ×ú;ëÖ%Ö=M¼§×<TjþG+¹-·V±:B×Ã[ ë$VÍÅýrG>æ èÿç#õ< 2ûSB¶´-­\a;³y+ØêÝØ:UZû©Xrvú)íÂé©ØH+ÈZ@¹µZ¾ãú\R¸÷âæØ+Y¯Gá/âûìÇÙÂ¸ì!÷Õ,6X²â#:{Y×w¶ZÔ{\ìx^ý)Ù¬90úºy×Û`});

  var UTF8Decoder = new TextDecoder("utf8");

  function UTF8ArrayToString(heap, idx, maxBytesToRead) {
   var endIdx = idx + maxBytesToRead;
   var endPtr = idx;
   while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
   return UTF8Decoder.decode(heap.subarray ? heap.subarray(idx, endPtr) : new Uint8Array(heap.slice(idx, endPtr)));
  }

  function UTF8ToString(ptr, maxBytesToRead) {
   if (!ptr) return "";
   var maxPtr = ptr + maxBytesToRead;
   for (var end = ptr; !(end >= maxPtr) && HEAPU8[end]; ) ++end;
   return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
  }

  var HEAP32, HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAP32 = new Int32Array(b);
   HEAPU8 = new Uint8Array(b);
  }

  function _emscripten_memcpy_big(dest, src, num) {
   HEAPU8.copyWithin(dest, src, src + num);
  }

  function abortOnCannotGrowMemory(requestedSize) {
   abort("OOM");
  }

  function _emscripten_resize_heap(requestedSize) {
   HEAPU8.length;
   abortOnCannotGrowMemory();
  }

  var SYSCALLS = {
   mappings: {},
   buffers: [ null, [], [] ],
   printChar: function(stream, curr) {
    var buffer = SYSCALLS.buffers[stream];
    if (curr === 0 || curr === 10) {
     (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
     buffer.length = 0;
    } else {
     buffer.push(curr);
    }
   },
   varargs: undefined,
   get: function() {
    SYSCALLS.varargs += 4;
    var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
    return ret;
   },
   getStr: function(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
   },
   get64: function(low, high) {
    return low;
   }
  };

  function _fd_close(fd) {
   return 0;
  }

  function _fd_read(fd, iov, iovcnt, pnum) {
   var stream = SYSCALLS.getStreamFromFD(fd);
   var num = SYSCALLS.doReadv(stream, iov, iovcnt);
   HEAP32[pnum >> 2] = num;
   return 0;
  }

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {}

  var asmLibraryArg = {
   "d": _emscripten_memcpy_big,
   "c": _emscripten_resize_heap,
   "b": _fd_close,
   "a": _fd_read,
   "e": _fd_seek
  };

  function initRuntime(asm) {
   asm["g"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _free, _malloc, _create_decoder, _destroy_decoder, _decode_frame;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      var asm = instance.exports;
   _free = asm["h"];
   _malloc = asm["i"];
   _create_decoder = asm["j"];
   _destroy_decoder = asm["k"];
   _decode_frame = asm["l"];
   asm["m"];
   wasmMemory = asm["f"];
   updateGlobalBufferAndViews(wasmMemory.buffer);
   initRuntime(asm);
   ready();
  });

  this.ready = new Promise(resolve => {
   ready = resolve;
  }).then(() => {
   this.HEAP = buffer;
   this._malloc = _malloc;
   this._free = _free;
   this._create_decoder = _create_decoder;
   this._destroy_decoder = _destroy_decoder;
   this._decode_frame = _decode_frame;
  });
  return this;
  };}

  function Decoder() {
    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon(this)
        .instantiate()
        .then((common) => {
          this._common = common;

          this._channels = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
          this._bitsPerSample = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
          this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._outputBufferLen = this._common.allocateTypedArray(1, Uint32Array);

          this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._stateStringPtr = this._common.allocateTypedArray(1, Uint32Array);

          this._decoder = this._common.wasm._create_decoder(
            this._channels.ptr,
            this._sampleRate.ptr,
            this._bitsPerSample.ptr,
            this._samplesDecoded.ptr,
            this._outputBufferPtr.ptr,
            this._outputBufferLen.ptr,
            this._errorStringPtr.ptr,
            this._stateStringPtr.ptr
          );
        });
    };

    Object.defineProperty(this, "ready", {
      enumerable: true,
      get: () => this._ready,
    });

    // async
    this.reset = () => {
      this.free();
      return this._init();
    };

    this.free = () => {
      this._common.wasm._destroy_decoder(this._decoder);

      this._common.free();
    };

    this._decode = (data) => {
      if (!(data instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof data
        );

      const input = this._common.allocateTypedArray(
        data.length,
        Uint8Array,
        false
      );
      input.buf.set(data);

      this._common.wasm._decode_frame(this._decoder, input.ptr, input.len);

      let errorMessage = [],
        error;
      if (this._errorStringPtr.buf[0])
        errorMessage.push(
          "Error: " + this._common.codeToString(this._errorStringPtr.buf[0])
        );

      if (this._stateStringPtr.buf[0])
        errorMessage.push(
          "State: " + this._common.codeToString(this._stateStringPtr.buf[0])
        );

      if (errorMessage.length) {
        error = errorMessage.join("; ");
        console.error(
          "@wasm-audio-decoders/flac: \n\t" + errorMessage.join("\n\t")
        );
      }

      const output = new Float32Array(
        this._common.wasm.HEAP,
        this._outputBufferPtr.buf[0],
        this._outputBufferLen.buf[0]
      );

      const decoded = {
        error: error,
        outputBuffer: this._common.getOutputChannels(
          output,
          this._channels.buf[0],
          this._samplesDecoded.buf[0]
        ),
        samplesDecoded: this._samplesDecoded.buf[0],
      };

      this._common.wasm._free(this._outputBufferPtr.buf[0]);
      this._outputBufferLen.buf[0] = 0;
      this._samplesDecoded.buf[0] = 0;

      return decoded;
    };

    this.decodeFrames = (frames) => {
      let outputBuffers = [],
        errors = [],
        outputSamples = 0;

      for (let i = 0; i < frames.length; i++) {
        let offset = 0;
        const data = frames[i];

        while (offset < data.length) {
          const chunk = data.subarray(offset, offset + this._MAX_INPUT_SIZE);
          offset += chunk.length;

          const decoded = this._decode(chunk);

          outputBuffers.push(decoded.outputBuffer);
          outputSamples += decoded.samplesDecoded;

          if (decoded.error)
            this._common.addError(errors, decoded.error, data.length);

          this._inputBytes += data.length;
          this._outputSamples += decoded.samplesDecoded;
        }

        this._frameNumber++;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        outputBuffers,
        this._channels.buf[0],
        outputSamples,
        this._sampleRate.buf[0],
        this._bitsPerSample.buf[0]
      );
    };

    // injects dependencies when running as a web worker
    this._isWebWorker = Decoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      Decoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = Decoder.EmscriptenWASM || EmscriptenWASM;
    this._module = Decoder.module;

    this._MAX_INPUT_SIZE = 65535 * 8;

    this._ready = this._init();

    return this;
  }

  const setDecoderClass = Symbol();

  class FLACDecoder {
    constructor() {
      this._onCodec = (codec) => {
        if (codec !== "flac")
          throw new Error(
            "@wasm-audio-decoders/flac does not support this codec " + codec
          );
      };

      // instantiate to create static properties
      new WASMAudioDecoderCommon();

      this._init();
      this[setDecoderClass](Decoder);
    }

    _init() {
      this._codecParser = new CodecParser("audio/flac", {
        onCodec: this._onCodec,
        enableFrameCRC32: false,
      });
    }

    [setDecoderClass](decoderClass) {
      if (this._decoder) {
        const oldDecoder = this._decoder;
        oldDecoder.ready.then(() => oldDecoder.free());
      }

      this._decoder = new decoderClass();
      this._ready = this._decoder.ready;
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this._init();
      this._decoder.reset();
    }

    free() {
      this._decoder.free();
    }

    async decode(flacData) {
      return this._decoder.decodeFrames(
        [...this._codecParser.parseChunk(flacData)].map((f) => f.data)
      );
    }

    async flush() {
      const decoded = this._decoder.decodeFrames(
        [...this._codecParser.flush()].map((f) => f.data)
      );

      this.reset();
      return decoded;
    }

    async decodeFile(flacData) {
      const decoded = this._decoder.decodeFrames(
        [...this._codecParser.parseAll(flacData)].map((f) => f.data)
      );

      this.reset();
      return decoded;
    }

    async decodeFrames(flacFrames) {
      return this._decoder.decodeFrames(flacFrames);
    }
  }

  class DecoderWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "flac-decoder", Decoder, EmscriptenWASM);
    }

    async decodeFrames(frames) {
      return this._postToDecoder("decodeFrames", frames);
    }
  }

  class FLACDecoderWebWorker extends FLACDecoder {
    constructor() {
      super();

      super[setDecoderClass](DecoderWorker);
    }

    async free() {
      super.free();
    }
  }

  exports.FLACDecoder = FLACDecoder;
  exports.FLACDecoderWebWorker = FLACDecoderWebWorker;

}));
