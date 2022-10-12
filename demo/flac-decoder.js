(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["flac-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  function WASMAudioDecoderCommon(caller) {
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
          value: (channelData, samplesDecoded, sampleRate, bitDepth) => ({
            channelData,
            samplesDecoded,
            sampleRate,
            bitDepth
          }),
        },

        getDecodedAudioMultiChannel: {
          value(input, channelsDecoded, samplesDecoded, sampleRate, bitDepth) {
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

    this.free = (ptr) => {
      this._pointers.forEach((ptr) => {
        this._wasm._free(ptr);
      });
      this._pointers.clear();
    };

    this.instantiate = () => {
      const _module = caller._module;
      const _EmscriptenWASM = caller._EmscriptenWASM;
      const _inputSize = caller._inputSize;
      const _outputChannels = caller._outputChannels;
      const _outputChannelSize = caller._outputChannelSize;

      if (_module) WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);

      this._wasm = new _EmscriptenWASM(WASMAudioDecoderCommon).instantiate();
      this._pointers = new Set();

      return this._wasm.ready.then(() => {
        if (_inputSize)
          caller._input = this.allocateTypedArray(_inputSize, uint8Array);

        // output buffer
        if (_outputChannelSize)
          caller._output = this.allocateTypedArray(
            _outputChannels * _outputChannelSize,
            float32Array
          );

        return this;
      });
    };
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode00bch6Á0ØM;|&2aQéî Û?öz/·-¸}÷"¢wULèù9ýk-TUUUUUU¦ñ÷qò°.BYZª¦f¹vvsw6û+Ö¨û»OÛIú©¤[èú~X§MùGÃ&N=Mã|)exq¹MÕJà²[©û×[»Ø;ºg8ºWm¸µ«â³ø&ÏÓHÉyÌXÉÁû§Xh¯°Ï:ÃÝmól5Z= Z/£h­g+5eçnîs»H¹/M¹ëO»ò()j×o&kJ2qólâÞ÷0açÚW7¥Ã×ªôuOô$X¥>çís6.¬øµôvÒSÙµ¾óV÷ÒþýBøuBtGS
5QíhþÏO	Ð·+äèzÝ³C¿"tììA$ÄPX"YúØKß®Mñö9\Ðébå s/mÈ ÞM+æKÊÒù8!^×ãßr'*e«GNÆÈ_!=}Ýõ$0ãÃÅÉ­!^n.WQþ^å9ð|-&³ÓPfâÁÔEm(ÑHîh,môrÔéd>Õ{)')­z¿$Z>öÿÜkÄ3§ zÒð]½©÷×G$G3öWHÂ"ÔCNýPJ'®Â«øw^'.Æ¿B5÷¢þ!EÛµV¡2ÁÒÆ1ùûç_Ê×B<CÂ?èfY¡½Yh02A=}y¥öõ0¡^Ñ5lÈæÏ;êÏØùr=}gâÚÞ¯[Q)rÜ(ñ­bâÒù.|¨£~þgÿg¡ÔBÕ»<´»¥¿¡ ³K.ñ¼=}?.ø½Õãßº^Ð#¬»Þ+
ì¶¯su+4Ð³ÈêÕuoÊ
îìTßª4ça*ÀñwÓ/l8=}»õ#è÷Õ3º2²ã¿â$Ig°2!¢N_°m1¡fÓ³ìHj LíSfì¦2l¨ádü{^ÛþÃ±ÃË¹tÀZ^iÅ7÷2'NíB.º²s 4§^
Tû}®\!Æ´¨=M6_òîAtp+6Ø»Å;òì­ÏBI04røs=}©X½aåYô½Cmí®a,9¡6t×~øSÉ¢Cj'y¡¶>èR<_XÔ§¨0ÂØÈD^>þ­#m$3<Ï+×:CIºðóv¤â§é´Æ>UÆB6±ùj×Uâ¶±F}<ÄõÉØ¦èöqÚÞP§ßlVWu«À³1>ç¶Û9ÒÚ2RvöôÁ§-¡¡×Bþ^Ó/
T¬ç¶Ô¦ßÃHÏþEw\MüëUZU¡/ËíAN×¶¹®é¡¦÷eöôT¬^áîaø/Ï!_Ìº_¿>Á»Ôé0×ÜùÉh?
Ï&¿ÏKfÿâ@NÕ	ßå±}UPBþÞ~æçþïÃýéVßéijuéÙëé¹[ñ³;p0¡ñ3!é9{u¢:{w¢:Sù÷|ï:J~!áõÊ®å°òÂ<Ûè#õD®íXZ\É«ÉwºoUPNQÝFa ÍsÐÉD"×û7ø0¾ÓÓìmjLÍh®÷7Ïß=M£ó»Ìq©úb°­K6êTüV-´l®4 ñµ2Ï=MC¹"µ"ø3ªCöi(ZÝjF£:¨¡9§Uñ_or0[ÑfáÁ×ÅWæ|NiNÆýlOæü±¾Qþ¨íÛâ¬¼Nýz©õnTç	¬_H]/H*ªÓ1çtl!Gk§nùs×«Õ©Ð·é"#c4rÓ¬Øâ4ÊZý¡¦ <%né	2¶ýå®ÃGeâ÷à7ú"gj´¦>Õ8d.Wªg1ËO¦zó_±òes=Mù£k0	êcÐGÒi/ñ!¶yk:	$tÙ[,³Kùòm;õuvÆ$BP×ú¬mWû-­.(fÎ*ÄtÚÛ{9Ï³
I7|þäÉg5?é¬Â-´ÁÒ;«¶
ßøÈ4¾36¤ÇÿÉØNv¢Çè@ñ © ¿õÊÒ»ó¸= ½ÚÍ¿û5c²}iÒEÖf2½Tô>ºyw×6ÂXs©GKVô»cé,ÌÓ~5'èìë;§YZQ)_^wà7üÇR&«ð^øaÛ¨ÌuÅ 6ÿ23ß¿§g¡VÎgÑ¤­×ÐÐ{·<ó>ÜÕì÷íË{Ð&n1¡u=}ÿ|rÙésû s9ÇK^¼òfzS»û-ª)ÁÉw]»r#:«¥jJ¯Sqö!9)ÏS çäÖü}9 ­"ãÏm¦¥3øª*w&ñ~Öm¾C£Áîé}~EVº{·8|p¦/+³S1bÍGî2Y#[:)«DÏ!fGã8±M[B^	^4Sì/q§7[8·H1æTëùºoÄ1#Z¥Dµ}µkúñ%2y/rÖéÙÇlvì)±9s:ÇvqV(ýi:·«zÂñØì¡Ö8£¡âBEÃ'³4ªçuÝMÊAJÌNë»Ó5öI:x§ÓB	BîÌH¤Å´yûÍ/
5³¤²´Cº]ªõf÷óò³l±bu*7¯÷@7Î:7â¨y¶6agëp3WcºÅrUló@yuÅ7û4ç§2w±¯ÛrTÇ/GÏ¢¯Mãù©,«=}+x·§âÕ¯pG².£ØòÇZlº«º2j?1=M¯Jó{Gs
ìÕá±ÁÛ´ìOO¦Ôþ¼¼ÈànÜÛ»á~ª·Oã[UZ'¼ëö¾£u5àËþ'î?Aë5=}âª°Ñ´Ï6=d{Moðó)°[:)o"B³a"Rcx®«"Õ9ËÛº_%_70Ä_Û²°ónµ«9»ïïÙ9´ßÛ²ì¶ø¹Ï°&v^cgÌW&­ÉËx9þ#N¡¶èS¥´
Þ4}_û®*KÍ©µY2Ã}ðE¥ç«¹ ßéDe¨?7YÊo¤ET«±E ,ÁXÁúM.å9n¥¥úG5B©ÐULW.u¦[L/£Ú¡Vâ}ÅøãëªIÿÉBFm§µýZ °ÔVÎ(OhàWì}}rÅÏ¢ÔSÝ.»áVvØ?×£ÔØ£Ô¦tqíôúM÷í= ôOwê%~%~= ¡¼kMìñ¾Æa(~oÂùsZÿÏÔ= )cFx4*¹ÏFLfþuú<kkX¢¸(¢xî£#íÓ:é¢þW]T-&6þb@Û#)áÃBù@æ(+­?²Y8zª»sÅSt"ap,|}ÅÉa¡¡
<øÕM?*@¢QæÝ£0¬M$@OÌ$A47*.-Á¥0çºjÿå.v×xþ¹»i}s(BßÛ
g\ë5ý,p.0-êª~ê*BôMq
 M§í.Y=MbV"âÀ82Ó:ðãa!Þ¸iÝ¯»©,¡^ÏzÀ+WÍ)ðC*
õødÿîhíXÓPùL'6 o°0Tw.ñ1¼>ØksKiJir÷rùrö?= 3Ú·>ª¦´t®^ñ)Päâ}*ñ+
õLàÆ/Á§Qi'èJ*Ç%9!²vPmÐÑNxn.¶ùâ³¤ÓÛnYÕ#Ùw/ý°;ôafþ·åp6"·á ?¢{H(jn¹¦SÔ>:SÛMxC,¶í±NPkÑ~Ø º°Gî(Ã£6ÚQ­íº:ÒMblì
öP\A+õv¸ÀÚVpdð ð.Tëëc2¾Âr¹ÊðXg}b×Ë;éunffÞ$FäL+Ò B­Ðb4Fo:uü×ürµ¾12u-Bü¾ïy\L£qýt?Qr×Æçf¦2]ÞûbÓêÂõSrg+Þ]ç,ªtfØb GÂK+zæ²ðfôF ]Ó4¿VÌÞ0=}ÓO Ê~ëçX»æýnbÅäÜ5NªSr½W7= 2þ¾Ýv¢=M¦Jéb";sÞÕ}þðx	­w·>²Æ_&hª aû ¶¿ÏCW ]ËM>ëtÏ5=}kÝ	;ÎåÊÍc®üö%Ðû¶Ò¿¿âHÀ!~BØM¹Íñ.U¤aÚ+<ëþ%Ñe"½J}$Mqû¥t¨Àãjh Gî¾Û~I
^<Bú¨=Mö®$iç?PÓvÍí3}Í¹Þr©~2×ÅêÚÞ·[QI@§òÎ2xMlxMügÿ§H'Úuon>M¤¾-ó¦lµ3¦áÿx!ítÙ+táñ¥f¾XvH×Aû	= C¡ Fª´ÎukEÝ/d5|ØáüP0³7¶*l«Áj)C	X@ù¦VTª5¹w=Ms¯ÅéW¬|@CÕ@Cí>¬÷s 6£¢3ªx|Ì2ÌZäî
µ ²0Á5ÓÞ@@ªuX'dNªyRèjÛt´ýJGÔ®è&+|¯ËçýDÔò6N!ÞÎËME²ûÖSt-°¦oP9Þú&ÑçÊ9;âápf¸æ;/þ¡"g¸çéù*BYa®3ãú%r{O2dHÍÓ&¡Ç¡Zö­û%¥eïl/Ò'
d8¢(Q»ba#5©ækù]®uoºSRZ÷ÿ¡aoö]®AQ_åQÇãâPÐØZ>±þ²ÂAÀt:;Wªfàº@»4xã¬ n[J6\¨âZKHê¿ý*È±MG8aÒ&\kwdCêô% Q}AõjW×bÁ!îÅuùúô"ÕqÂÐ6ö®Ml¦EÜôùìÚÓÊÇ£b:´PfMÔ Â®ø!1C ìg¡â¹yr·ÝÕ´µa/2eùiæo#/= Ð;Ð»õÑO1ÅÓ1òì?Q>*êÁr	%ÈhF8UÝïÍËGQ­»ÐH4ÐüÖ¯nÕ*qÖHê?jHa®¹ÅâÚEÇPØäSÎ¿ÆçPÏ[ËÒy.;V­cÑym¾$28ÓBðÍ¨ñE-= ºB$üc	B\Á¶ãpÔÉ1\e²\bùrñïpãVÃÎ(ùkCG8 ðlQ/X±B´/'ÿ{¾PªR§À7Èã\ÝYÿ8´C¿GN]wÓqp(÷bøIrcy¨=}öU<4AòÜ0êºÝ'9_Öê<ÁhµiæÒâ%*~íÍ	pÄ¯"OûE_âA­ºÂaÉx|
:=}î:h±ÐXÊ.Ü¹2apPTÝÜCðæ³-±\å³îR¾Ïlú¬»»hnnkÓmåpcÁPwp¡juúG¯ã!ùC&á?Ú[ÓA	b:«#¨öS­6¼l¿âZÆ\ë7(É²ìUÚæÚ(y1ð¤Rm¹ï!ÛR¡ÎÛ}<qZµ5M=Mb%jå
j"êÏ¸"jôóô§õßcÝ±PCP7ÙµzëbÞ.
ÍÓô-uÛGÃ(ý{f~gHó+ÿ½sý[¹eØYï-ãaÊÌn¡ÎÚ5õ µEÔS0@ßtÇÝ\§=}Ô¸Ý¿ÚÅ÷Ôå¤òÏ+ G¹= lÛ/kÉÝÛÙCÞCÏuÃéÖqíïÇpCßêÌsGÒ>= Y¨Ùâþò/6Ô
GaneµS8¯ÖÚÎG±Üa-º¾+8¼E¶ÃN'= 7aá!im7§PÝÖ~@Q$ÉIh*¸gÂU	'ë©¨!²tZÖ¼ü'Â¼|H0êÐpiÜ@çÐÄÅ>.òüÃ ×NJpx ¹ëÇó&½¦'¹ôÕs5c®[ÍóÿcÿtôL* ,lB¼ OùnEj¬!Ùþ­è÷=M\¿QfZæÃÌdÿöYÚæ*%OObE& ©¦ta!åÆømF)¿÷/cAÒ])K
Í/­ö¶§fÄ/ÜPòg¯ø<âÔTÊìYÕ\ü©ÊÆmePRìKÒRÖ²FCö§4Võ§,'_ÈöY= wæuê!vw9$S³¡²¹<x·j»Í9«¶ýÿ:á9«»óó°Kº8Ñµâ±ô¹mTÉÙ&ßdéUÇ¼WÇ¼j9u9â½GíÃ¬0y4º* ®2HV&*Kø»|?_µ$m|¶G¸©qW¨:a±#¿w%Ó'ô/{S5ÌQóg2ùr¦Á0Rà_b·íWA¯3JC$Ú¿Xnê©;B=M.b-J¿qg;9;y= ±Î>X¬ØÔ#9n¿p9è¶ÀÜ9¢}Kkúz³$$Å¨¹Ó*5ùöÇG4ÙbçGPeh°ì¯d[«¦)]8;Ñ·.!°agçÕk8'à²nö¶if3Õê[ùýs7¨|rû¾öùæjá±88bl(0®§G³ô%®]°&ù,z®ìKIº_J~øJ¯L:ÐJ²9=}âÐu·k²SUº= uÊÑ1Ã3%üD[î8i°®QÈÇ8Y¡Vàè·!s(Sc$[w7Mô¨Ëw¶X3xOÿÁ¡ãÃC-­cxRXìÈXªÒ²9AØßµZá;U·;@NèZÛÿ²Qê(æwèËñêÿ¡8$-õÚÔÓÚö~þÚÓW@4CÂSØzÖÀãüß$È@Í0Â4À(4Ài=}¯Í ¿DÂª-j³Â>àQ-»·
ø"ÉÀÕ-¼Eãº²v\3ë°ªPþiÎá±½EºÖx´v²½Ý]å·Ýü0Ó5×©â-£¶X['8ZãeIgÃI}Ð¥cì:ÖVÈO°Þ8Ïvg~ã¥AÖbBé²O'Õ®ÆÿFìÐRVí¿îâ	øfE_øÖ£ ø= Ê;ò~÷ãõÔÍÂa 5éE.2ÀÝÙK8ø­´º	­"W¾ü Õ<ö¿±Äü<sÈp,Y½ÀÖô³~1¦IGûÐ
ø"ÉL+ÆÝÊ|õ­¤.ý«þ¤Yk+FÄ¹¨¡	Í=}×Óòá9&¥/N%*ß{¾2×Â(4c´ìåúóåzòçzóèÁ*íãþ¯´{8ÓðJAa­RFJ TlmúòÅ |?ÁÑ}ä"nØCô8ä8÷ñÖå)k>+GPoTòÇ/ô·é:Z$Oê¦q
¯ä#ÝðË1=Mj-ÓQ e]f9ßÐ<^«9LìáÅ

XX[¼KºÕoiFdÔJEÕõo
U©¯LÇ7­XÔ×ç)ÊØ®¢òñoó/8¤Vè~æ2­Þ0kFß£òàYNI
Å>P4w+ózsvZRQ¾pê.Æq=}ùÔ®Ã¸ý²ÃÛ®°µýÔC²ÌY>ö<HËõÛ*Ò¡aRWÇTÎÊÅC@õÒ^ðQI»;ú¯uufS¡Ü÷i
VõóSS?8ZWG+z[ð±au2AuP×õsTW's*je5 6Ýuu ¢Ë£Ë¢¦Ç/)Ç¦¼.ú 84Ïoï4¶ÝxßEwúûMDzßGÎQ{Ê<PäyÛ: Ü/<½³Y$Õ¥H3 =M£QªBLª®¨êëK¦Ña­sª]3:rS²Vî3Þ6µnà:3eððt­õÉb JsWñåmÓøÑn°~k¶µ¶×P÷VÇÑÖçCKsw+?zåC*©Â&ó;xDÎ7¯á²wê-U°S4Ý¹éë­ Ûü°}ÌIÅëN0BhFeÆ­Ã/+¿Q¡C¹4kg7k§q±= *s&ih"iÙpßá"('¨µ¸Õ<½ÂÔ(hK=MLÆ§4ÁÎ½ ½#->?Âã(|Ê\Á#<½ÿ"ý<½mT ×Þ~¨L¯÷£9±f[®#r%¹ô³Z7uc*/¸¡öùn¸$D§«XtA8¶¯Ö\Ê,fÌØ¿¥MÌbO#µà#KQJØ(û;Ä¢_ØkHL?HÞkOãX­ÚÜ£Õ*ã?M§þ±HóòC_¤4Ð¨­¤@JÚKJ(¹4pêí3ø.ÎWØKâÎKu=Mé^é¿'
±àû²PD=M
Z= ®6ì»è15¡ ñ>Ç&MGR¥U®
½¤I;ÑùEzô¡sv­ÓPÛSÇQÛ?håq?×%9cý XäßbL¹ËsÌÛS'tÁ u7¯¹W\5í9ïe?*í9©ÞmÑG+ÇÈ{ádØõÕÜ×1÷Ü¼_(ÏDÔKiðTA.ýG>ä¢ü´|aaL'®RT	¦«-¥Îäa,
*ªr»)1¡Õ3î1v|?÷G½Ö¸NVÆG\÷ËPe
¬7Y|G()½hjKY§!oý´Á¿vN·Î¡6±]Î×|Riêßk6IWa7w,üTýFü!7¡]ÉZÜíaÐÊBÓDª"@ ²ë°¶Äá@I@Ô¢?Æqñdi
)Û§
à}=Mu.væe>ôx@øæQ£Z¾§tøá²xøáKÿ2(~ZN7ZÆäÿ5^=}®×¡ÚScÀ¡_¯úüuu¡åL)hPê³×­ÚSc@«_±÷ÉP;u¡åýµ øPòzu¡åýµ°øPóº^A.KÚ¡/ïAá³c4°ÖÈ ·3G8§ãÌ®>º»¢«ÈÃÞ:êÝÆ½åÀù²:E#g7FöwbSËö?nÃÍµ-T$(:</õ,äÉïi§Ð±GùE:îEc¯¸\ë­ªæAó¨1~ï#
>EÀuÀmÀ=M²;¼KÒtö!§:,ÃpNb;S¹W:n¨gÄVN2Ò= ÕÄ«½ê3ÇAÁ<ù=M4aff¢9ìÒæïî4fÛ£n³ÑÌþS5x= ø½¨áÝÌ|¤Ü6çsjÜp8 Ç¥;ìæ¢§jþÄô@f-Úñü;WOtF4&>AÂh^Ó= M4Oø³
ëSÒæÉå Ìp8G¾zþfÍáM8ÅòM F]wqGU&^Dk	§ñY!A8Á!ÌèßsWqÝGeµmñCcNÉ¡þ]JßÜI_l^%å JkUüILÒ±v­²_âz5(MåÜ¯¥BìËqJsÇ.'JC¿¼"^ÕNM¢ ú­æÁ©¨i6ÖY¼{nig!¤¦º;¼¡ÃæÑÆóÚ´vJFèQq<1¡°íËÊàöÌðÅÆ«Í Êòx
J½äZÁÆ¶£ uU=}¾ý9};«nûø]ß¼aËv æáÚý^â²¨>1=uÑ¦xY0ûgçË¹¬óE¦L±Çju-#jË JùDÉ)Þ¦[PÑùRÏ¡¦À!= ¬qN.Â±T~§ðÙHÒW!¼4±ß|ÇÏVk	_k	_óf3mEc'Z\3íÆõÅâÎ ÎÎ¼}Y$_v¡íÆÔ·ÑlãG(÷ÎM%Ëï$å:¸°¬O|fñéê§ñ%ÅHÀÙÅÚ÷h(úÊ}-×qÉòLÐV&CaQñæËGuÍQÌB¯æA~ýÖ2òÐ|jI¾?ßO@iÕäDäÊ¦*[Ån·ÞkS.Ð¢ Jà£Q2dTcÄN®XÍoþÂÙ±RMêÙgHY=MWWF| à(¼gN5QþPÁÕReüª)áus8T÷ë­´/ÙQ-¹
öýeÎå6SæÆ½O¯ü1ÿ Ü)öÄstLzü)ÜÖoáÑTp_ÁÎÈ<dÄÿKb5yøÊ6u+ÈeÔTÑ%Îå=}D[d%Á²+º%ÕüÐZðr±F±"»pÎ­FïcÆ¿<Røi ¸p¾»ü~}! ñZp;Íàa"ðÙñ[ðûi >[ó¸FÄÈ ýÄ"æ­/D÷±W»´»¯;¹c;´ë¯1/cº[{®[ºµ¸s{º·N±vkÔB3
6m·¬Aíº#Mhçe»!PM~¸:Ê é= @­FIô¤NâäTwÛYøÔC(Px=}z£!ü]¸&b~!ñ?¡£æ"gxj.uöi®¦(Q±[uò!c¡Vk®p[5wA¡Óæ#gxfþ,k­
gxó¡¹2Q³8QÑ¥WÄ½F¨¹[ç¹q©ºG¤¯'ãg!º½1ÛSOÐq1å¦FÃà*Ç9Nq:mÔ7ûhÄ¾ã&	ÆÞ:'
sB1õ0Å&Ë«.ùDß_s¥®qµ½Q6WàÏ@ä¥A-Ñæ2HKûe³R9k":hvt6+·0~i æ>eúd:{KoÓ#|<$÷ô=}æ.ÐÔ¬ûn¼i'>¶èÓ µñÍIx"75]ªÊî3Ã5\LCÞ 2Â3ÙÔí%c?¯#¢%!Åø½jlË¾ÁÛE¡4mÄeÂnÍ=MFóéÑ»Ä!1wvïµkóØ ¶é.ÖÐAH MD	¢½9ÿj'ÿcÅÒóçQF:N,)ª¯
]YÐìäââÆ{ä%)1:X¢B:Æ§:l 3%ìêÙÇV^X^üHGøß$iA¸ÄIEA¡üð¹ÄÛEÒ×þÈ¡wz SpQv¼)YºßúÖ&¢Ye¨A&4bØ©ç¶oò®;Yà8ÅþFó%ÿvÑ##sPe9bfïÑNÇå[=}ÞnÚ"W>V¥
3Ý
6%Z£ wÞ}I:Âân=} Ñ1µ1nè= j¸ëÿ¦Ã%Çe§Nå¤+_èÊe;o_nA%}û3®»dhÏ«UY~ºsð±gÊãTÇlYJVmÍ¼æ ffKxgsú±MþÐÐy= ÏÝe*×ÑÆ~öY%q,"= (%2YÕzdÎ:a&_-hîÛjûVLaÔÖðÄÿë-]2±Ë¹nÇ¤Õ¦ËªÆHóFxbÇÄdäÜ.ÆÄ¯tÜ%~ºôæäð:CÖS#ªÞ!êíþ¿bdÌuh­·/V!>õ"çAç$Kµ-ØNN}A1þK£ªHóý -ÿ ì°"É½ÈÙÂ¤©ÖÖ¿&ÔvÌ\3&dÁîÀ¤k'dÂpÁäÏF»Â,U91­ú9o¿ÐëVVø"x¶v % ï@ýUùßLâ¶b÷9µa)¶ÎF.r»»z"×	BA*ic
õ17É¡Ç§á^"I0ô,?Mv?6	ÓþÃÕ¥Ü?Ê#×#ì<rµª"¦ê_ÊOÞ¼h=}zd{b|ñ3Ô1Ó¿å£ÊÁ±N^¨@Ò#ä#= oÚ<\á#ÆwB_pÙrÙrªÊHÚ°¯më2[éÖjÚ'ª=MF\|(ÏTsMBúukªzîÚþÏÿ.þçìúqÖ¬øçèÇcq-èðÕ8sõlëÿZ{#_R)J¨'>= FÂ	Å89~å
ù5_dyzÞ?æ÷ÿQ!mC¹ÞúóCrP_y%o\é½âvÚ%ì*é(þpmV,iQØò5µë­52¬Qöy©Î5éÌbI÷»×ú¸è#@[xv~Öuµun#Åa!ëù$÷dwÛû³#Åûmõ3KÔo4SºtqHÛJÙ| bWàÀÄ9íû7~NÑ²(å¤ð:5­l#Gæ­c.t¯]N·ïÔ®ôëãTÆº-=MÂÜâkze´5ÏºâX:¯b*ç%ªnêI(üðÿW¡¸ð/ÆìðØ8ò-;¿:çj ±«_|Êa#=MGFPÀ)ÞÑ"ÕUÞ-a~]¼t£¦:]D2éÐZKºyzM7ÓéîÀÕònJM8E!ÿgg[=}HëÝÙ(8mÞ%è¥Û/Ò°ÂÏåÉ¿÷KcïïpØÝfÖµå¦x6cZM¨á«èSÖ·ãF¯c"RaX©qãLLz!r©#BÑü 4O{ ÕæQôwå©s·AÓk@ÕRe~ß 4M¾Uò2íêkDiD{ÖÛM9áÍHê}FÂÂµÑµ _¶ÖVÁWµ±f.W®a¸&¢àÕ»êi´uS¾z<¸H¾%mÂË¡cÐkó+z}±DhbËuq;¨ÊyjpüÅC¿4ª.²¨Â.T9p*©I¾Ù*´DÜ[ÿJæY²Ós4ÀZSxÎÓtÌ9jì.wI «´ªKsËFwA«5µó0äéz=M:ÿ"Ç#Æti),UPÌKòÎ5ïí%âïmØ)â
ÅçúÎGR±íÌù½æ=Mü  FÎn,ÇÿLÀTÞh¨ì,ÐËØõÓ¢}N^Zæ-ëFµnq¨g±Ü_RÌ¬\r¤ÍwI: ÷¶@©¤·¸¢à}dÆ=MÎö×e/
)ò69Fp¨_¯æ:¡¶a?c%áóÙ¡7ZìûÔÆñA&ÓAî0hHýq7 Ò'øáFË§cKïÌj¥O:Zu?õn²¾³W,ç¶|Ì/ÀêÃÒâäC¸¡ÈøÏ¦12ëßYÙî®XB*:Y°UZÈE3åfá6ÉÅÏ:9ûGÎl'L}W¡ÝÖÍ°ãÐ+JÌaüÔö)Ýþ6Äz´ô_ó%W4,S9[ ERV±¯]ÄøoÖx´QWdj;·*)÷7ZØéX7lcr@ê·ÝÇö7þ2sÆobm·
§¾ä_w²Ø¶ÖÃræâ,¿ë~¼¥·³ðÜ¦iO¾aÞP:¢s¬µ9tqÕ¹Éßa.@ÑÖçæ°úóhHhM±>LZ1FÐ#û:±¾¡y£?BéLz÷Ãµ§OªÍ)¯ËÂs	KD*Ò±¿¥JÄ_ª ´¨·GY
¡·ml°5¥üµ£LIa£E'U^.åKÊ-Éd¤´ÜªïJýC«³#U¼ÀO	ÞÕ7&Ñ/¨L;©Dý«í;¼wJÞ¡¶e;´#çCÇ*Ùv4{8mô Ú~xã84¾f{·Náz}ôðtÚÖøÈ}ÃAÂ6¾ÆnjknìaÆ¦ýÇ2Y}üÿ5Â÷ÏBH¾µA¨ÉâëF|ÔõbC$= '_@ºÎ"KÎ.­l5Óóa1+ zÜ0ÈÕ<ýüÙ³ã-÷Ä0o¥ýbÁ3ÃUµ=uø1¢sûKÙ¨Ë.Î öøa%ÊÿcÓV·8±&¤ÖÿIHCÓFÿ:Ò)¬äÁÎÝýÇÅ4To¥ø¨Uz×-C2Ís¨ö3T¢CCÐÎ.LãoFÇÒC¿MC× jÍ­ï@¦0'HÜ¡}b~	ùèç%¹æÄs_öª'9« m«y2C
73¬
ûê|Ìïs¼wÁlÉÑÜ!Ñ|ð<úk#¤K¹zsîõJt·rW*·¶ßQ){6gs;¦Eúð_û[= ûé¨¶i×ú=MdbÂ¼9ÖY÷©BfB³úýéË÷i9óA¦ÏÊP^Y,êOµõôátüºeW]âè#ÍbôåwZÞÇDÿxEôkh0ç2aTÖf?PÖÍ@)Éå!É6õU\Ýå¤è^ÛeR&4= ë71©ÇcË[¦Ç¶ùÅ¾¶=Mo= Uååßþûûw¦Òqq:= YaÛ­à,§±·Vû8= ÃñeÇñeFÌGú\Kù{òwÐ/\Ø¤â9IÒu|érü¶ªÜïÛ 1ß\¨O	Þ= 5LÎ&püäoDqÍ@0MïíÎRÓ¡ àØìÊÝ0I#¨m&D[ßxµuk6¬#tr ç³ßUÝwâô<XÁEá£Ü.S_Çõ#ò H:=}??°ÿM9´Ò´ØV<§M¾Þ/©v½ìb*@\V³£rÄÓ=M	xP)Aï;+oèz×Søuå=MÇyäBÞF=MÐ%ÌHE¼ÀPrÒ¾d= (ØáàçLBØDÞDvØ^=M *Û= nèån<jèZÏZè4ÖÿÐmÅ=Mí³^ÔîÄÃqÐå ý!ÝFÍfñ <Y;N[§mRgóG}/¸ø¯Iôå#;/õPÞ?P^Þ/ßQÜ7^ê-Çá:ÐîJ¥?åò¢T]@åôcTLgØ×=M(YGÐ÷~mm§ÞK|ÒÃÌýÀmHÜëÌHG·ÍFÃÌhÐËÞ,AÿlÐÄËÞ£î02ÅÝU.%14'I£äØºÜA9ÂÚ\ìé·ª:Æ	UvÑÆ-ît]êi÷]æq÷ük*ûA³¹(¿-a;êÞî(µU[Ì	= %{%¨äRzuRÄJÐgÞÍªÿ*ÛGs0nw¡RæE!mØwÌ¯ÿ%ÒßuCm·aw×BgÑ¥Þ= WG0ÞE3= §ß¯½Ò¹à[HMÓFÓnÓýë^¿ ·yDRxDÉÍùpHÞ®o»çÕEì´hDãÒ­ ÞZïÒ­ øçî´XÈzrlØÇ§ýÖÄ'KgÃxª³þ­þ²þ÷¤A2|Ç){Óÿ$Ç)èÆ1 %LÜº~*ÔàÓ´ <uÄ,è¾Xp.L.<4Ûþè9º:ºN#;¨°¨KÖ¨Û°¨ËGºq61ìm~(è"~(êJ!p phpSe·9¤|ýë>¿À·yÄRxÄÀGÉÍh4ÍHFXQa·uR*¤"çXUÄÜëo(éíG 7v¡H×7®Z¸]ã{Ü;O[Ò¢T±%KA°¶êSz×s·#ûïn Y»= Û=}]ïð(ìpïëõïÎ¶x'(¤V*=M?|(X"T9ó<SG/ú¡Â'6õ´ÌÕÇ÷mÄçOZÜL+ñJ¬à|FÓ.L.ØUèþïê0éò?øËyiÖ  ð5Í©!qØ-é? 16]Ê,ß;Y @i!Yå,éÆs_óyì&ÁÒß)ïÒÇè4©ÅÛÇ%ë.¯$±u­Ö¶bQäÀu9ÝÓ¡7îp§¤úºZ?Ø×N©Ì@Êý¤T_Ð¦×%Ë±¡×n&sÃz°OÆ9JÞâÑ"°PÕ7\s¡á#Ü)ç ×LSl^ãá6	>ÉL@øbWLþ]MM 3Í$æÀ]&%L2Æ.j~7Za3ßvëÊ ¿"»°åû¦}4äÛÊ¶AjXmKú¬ãMSÐÃÓsF(V»§d;:!×	Y¼öÂ9Øüqýs¿$gÉ¶ä<:ÂÆ\[pýÛÂK\W½°_ò¤?¼¶×0ß<:Â¹î<Z)?Ë\c\³¾¤ò¤¼¶
×°
¼Y(?
*4_)_1YÏ)EÖ.hB ñhmÖ6Ðü1p
Ú Möu±öuö¥ô¥¦ Æã¦ @OOöõ¢ t
¢X§ h
XH§= ¡= iOÒ´=}&¬éçËÿÕ¢ÓbQô9­Sþh=M5·OSùÖz.öÆë	ZtºGéõÎ®ÃþAÔu=}®#½!kFzC3B+Øú4Zì°Ntw³Õx2Ëú,»®}¿O¹³éY¡
zæÈ.I8#K¥GëÒ'¸÷f;ºs2mÅvÙü£\½°×0ï<r\×½°ò¤¹¼¶×°*¼¹tÉvÚüû&?Ê\Ûrý+ÁË\'½°(×°¼ùÂÉ\ã\ç½°Yò¤.¼Y(?êÁ_)YdÂY½0(;Á¹Ñü2±¼i«¦k¼½ \O×ÚnBXd§L_ñ BhLxÉ-ñà'ÿâñà*ÿ®ÖLtB ñ¨6%D;¼Kºns|F¯UKÄ«_1*£@¼j¹{ùèø}ÝÀrÌÓCÍ Í +ÝÔÓÌF+Üå:×=}çÚlØl¸ïG8á¼A÷JÂ§4¹GÓ-JqÚbÄÙô¨tbÄYô¨t+àé·÷ªÄUªt^DéJ·ö0%3Fd«t1F°qÊ=M ©Ë<ºKè;#ËÊ{Õßô8/³ýôò@LÙÅ¸WàÕöö@ {øUët·²ôº¦JÎûS@#AõBì-LÄuÍ ³(¸3­GÕM/,= Ä=}uÈyëé¯µÞS-´e!óßâõ|Íß= ¶Ì#Q¤çû(¸hÂÞ$Ù,dÍwÝÂ£ÚÓG7Xöà8º_ 8RõQm!ÆÚX½³»ú<xÚ(n9´ÍHtÐ±å7$´E£L17ªd5ÄiÏ|<ècý!Wt¢Å\å°£Ñ¶Ú¾Â%©ÏãÖÌ¡èàuc¼ü_)Çàó»l
5F2Y=}Õõ¿oFpÄÇ©oÍ#¸¸'î.²¬Y*,ãaGÿ©Ïwµ.,CcãyyYÙp#æYa7VF¥ö 8§ýbý2&6~´ÆÐÑæ}&åg«ÈæozÊ¸N¡ØGú_Z­Wã5úûøÃY¼öÂ9Øüqýs¿$gÉ¶ä<:ÂÆ\[pýÛÂK\W½°_ò¤?¼¶×0ß<:Â¹î<Z)?Ë\c\³¾¤ò¤¼¶
×°
¼Y(?
*4_)_1YÏ)EÖ.hÁ}õZ|¸Ïú[ µÈèuô¯1
j
jãôuããXXíã1î£ ãï
"1î¢ ãéã)YHÀû©Oø»¹ùÚ¡MQQP	WómP8I£Ù)Iì´'qáRÊRt§À¦xTºãdcy± Ø^ô×EÌåÔppXç¦BEÒRòI²Æ?î­æQtðS"3V«+áô6ü¤!u®UlëñË	3ÿ±Z/$>·E³ü×Ó¨ìP³²ÁU:ß1¿Ä(ì'4vkî¤3¬«çÈÏrQ}¾Í:l³=}-5R÷©	'YX¹j)­òD7i0M´æZ"ô@%sZSå6+aPç]|ÕJ& Í=Mþê~°ò|OÎÍÛ8ÆB{9ôéøRÜ%-~[ý{|Û[?V÷y,'þ^ÛØWìfïñæyç³+uÃ#Ýædh¦fqÌâ~#­tT]­Ö£XxÅ¢ FÇcVuR=} ä3¥Cà[\H=}÷0í÷>Ðmâ
Ígï±®æèHfÅ®YÝJÖpß©E¤4¿ìcÄðô¤|p@{!´ß©Ðrí8DË0j$@0{bÍ>µ>Ý39ñBõ$Ö£VV¿:©ý T;Uý}>ýÒ\£é¾T´)ôêºXÿ»áûÈíËêyÉ®6Öh9¥ï
6¼²úðWüg2FVpRBw}ÇXÅ°°ÝñÊ÷ù-rÌ´2_ûÑ[´WÀòø+lüÜ/Eã1SHÚ>mIÔ²dtl§­¹;½/u=}¬Ä{ÃÝÛWß üYìa}À®£ÆÕ]n	/)p¼ì÷ËUëJFEÕ9%êÐR{Íºxïûçd1ûr¹1¦ÀÔ¸Sð¸Î·ÛG4«º0³5~ë\?"6C«])í$±+¦ÜTN¤OPúÅ½¤¯Æ¤4Ü@û³O¸uÿÅükûóëRC:A=}ûø ú¨H]6SFcN9wM¹ú!³á·
r:ÖOÆ:{Ûþ?=MÕJihímPÏPù(DH1²NãÏ2§+Î?<-æñÂÇ+PÔM¢°îaQcSíJíìµ­	íú(ë^ý§Â{#m>þK=}<ËR×SâiHî2¼4â´-ì¨üc.RÉ¨	=Mm¬y+{=}³zêäÏûâTâµs°y\*¿-WiÀå¦M¸¼±\<ÓìTwNäbr°{VÃ æÉWXôfr­ìäåj°Á¬I@õg$ñõÿº|ÍÆ­\J5'8¯jùÊ	|Ñv\)ÝÉß«ÿ-Ø}§®	Èì¿ÐeK9æÿKUVvK8&HÐûAªNÙåsÖqá®¼;$7¦E#	8D©®&õi«Ò®°fF"b3³4C]24,Ó­Z ì)©ñúw«óÀo®@U/BbòAÉNÈM |ò­Jñ!eM	I R\úñgaÖNÏÁ!­N¤ógÊ Ï= "@ÅÐ
Î-FVÕRagÀ)ÿÿ^a©­#9ÛÃ#ÔÆ>½ Ð_ü°>ÁÐIH¢> If¤EþCu¶üÛÁ×ªªL lXñD¸bdË£øô¸n~ê\ë'
©=M£iÎOáj8Eáw)QìiÎh¶{æU¤ñåbH¹Tk(ûrÖ%m"xY@ÐRÙãeÐÛJ­O}ªtubç²­f Ç«b*HSî2ðË=}±L)g·ÚÆTiØ<&Cµ[ÕgÓKweO= ÍlÅFè2Ù2rõ«
l6ËtFýUG{³é¹r]0úI°»ÊATbvëÍØoQ¸ãÁº´ë»´ë_cúáâµü$ü	þñ!Þµ|ñcLË1Zæ¿09Î8"'ãôªÅ­KHåÒÈ®ìaÿY0$>=M ÷}"÷á;_!²wü_#¤ð¶
©Ì÷ùñ×ñd½×øèZå>uEkf­M ·÷ªëJ]kxÁåCÛn´UËí÷ßHh"=Mð9r09l+ÌêU®¿^0>÷ã¨ËTqÁdëÜëIcC;dHë¿ÊÒfÒ_r§Â9çÇ¨"íÄ¸¿¤x¬-ªô¹m[êk$mW0|X?UbDÆXæ¹jïpTY§FO¾X>Æö·Üb:yßÉ®p+ìíUzÝuóHötZ= ¦dG/NmëÙ¢;äûd\oqìîÍ-Çw« ÒñÆGÜçòÈUyð¾ýD3ÚÊv.¶&þÚdSØbÛgá?cäDm­÷Ý"¹z¡yÇoO|ÿKËùæ=M£ËX¢2íH\â*ßîT,uV
µQë?³ùUB;@;¹vÄþör­ËÜ-*]ÆF<E1<èr "[wZ¿Y$#¤n~öK"lQåo½tÚ¯ïXxZ?íùÞËlaQ«8ùNpQå8rcñØsLöGeØöQþ-~çè2ùVtâ;È®¶ÂsBJC]%[×üÜí!Cèý'o@1À
[=}ë§6ÆÕÿ¦d=}²¿	¾MìB4ZL@Æ0¤ÂgfÈ,qÉ,YâgâõX¾p©aáQÍV¦}tÐò-= VvRjR:Áv~ýäu Ç%ïf-ì#xJi¨rï
¨Ð§»zeºZÒj1býfX°X®¥(í#¶R­ø­FÎÛflà ¾#àèåÜ¸­¡,iÝÃê×L.WÈûýß=MØ\bòfÈ^ò)MµÖB¸Ñ~kWDÂ¨¨ß9¯G¶Î£ç9&¹©(¥.L¯,¬¡±ÍµÍ øÈ.òõË×.r¥ÚÈ~O :ø^Zß<âÓõÜ ÉÆ³GzZ2R=}èÅg|÷
qÀzcÈv¨]h	"áUë=}*ô¾ã¨7ÃCVR[	ìx¦sÝåøûóDz|0
¡LU&!bVPãâ× nÖ¨hI-XHÂVejìS
ëÏu¡= LÀ¹hûpòrÂw¯:xUé§]±â%mnû~.?æ±rT8Rs=Mþè¯£hèSÈ%-Wp´ïMÒã	ÁV5µXx­XxXxÑÒàÊ³´.6ú64}VHU<¯¦ÈËàh)¿úKÔî¾ÒæO}cyÊîþnöËEZGàäþôâ­«©HkÈ6S_Æùù{S¾.²ÕVÆõèILVÏ0,¯K5B.¹íWp"··ú
·wYFFÇÊgS¿¢ï~ÉMCÆÞ*³ kó.¾)§Äwo.¤Cn|(ÔoHsÑÛ¸qÆÅh¬xOlÊì¾"êÈ= &_E=}ð}'há¨6êP8¤Ëäb-ÅCHF$ûrD¤, ñ70£¶S.À.Îµ$hÐÈù»ºîRÅÞ¡oÕ´±»´L±C=  ß¥;=Mp²V¦lb®àud4pÆxÛ<zÝ<c>Èz.ðerV4Pca5Ý_¸ÜîÒî\´ÚO?KZÝ³ö#A,°áÀakE^Àà}Æõ|Â¨ ­-Ç+A×ðøúãH[÷ñàN.°PÊ÷Be,¦Pw¸B±7rI¢ÃGÄ#®-]¸V-&å8²!rÉq	W)efW;Í­©U¦ÿFªÐ+At»§±D[ýK¢·Ê«:wv²ÔÀº;1=MÇøû?O}m=}?·Ï:zþ*aþ"ý%Eþ%&=Mí?WË<ífljÜÄ=}¥åÑ½£w ½-]»æºZH<îùNAPn=Mw	oÎVbrø¨Þw*_¹Ëa#¿|nòõq¹hÚt3ëê$"õzÖFàÕ!ÕxÜd6	´4u;Cö<5tÏÚý_Ò~Ãü¦M:%ÀÔ±f9Üöòà|Ä(¬Úò«³´|£#4½Ê½­º?ÉÇÀ"ÿ¼ýMÉÇMÞÃÊÅØ×ÎÑôûòíàßæé,3:5('!ý£ª¥¸·®±LSZUHG>Adkb]povy|»´­² ©¦sluzgha^KD=}BOPYVãÜåê÷øñîÛÔÍÒ¿ÀÉÆþ+$"/096EJC<QNWXmr{tif_= µº³¬¡§¨}%*#1.78=M	ÿ ÕÚÓÌÁ¾ÇÈÝâëäùöïð
ü2-4;&) úõìóÞáèçÂ½ÄËÖÙÐÏje\cnqxwRMT[FI@?~¢¤«¶¹°¯È?LÉÐ¼Gr)ën)r)r)òz¯ÈÃµº>ôÎÛ^ý ÞÝë NPL
$à	]ñpLªväË= Z@ÒFüýçÃÔØR,êÕ4Å« C8Bã®Øª})UÉÇ QèAin¿ÖÕãÏöM}ìþÂE=}§üØJÿ0îöÒÂet8X_s¬zzÄ¸^­ézo6½k!ù@±\ª}èf¡ðÈ'%hHÑpO2ÿW×)bÉíEâpT/ú]UíÎÀÖ>;§;´Ç^n»»¬[ÚG5K~ÕõWÓ¬X/
 ±uEs¯R·.#ªQxæ¢Ö>4-ëw4{[°ß8+¬õú©+¸ù;¡ºD[µÿ{¯8Ýë£ázUs·â_5>®eø.;ÓÖ_(ä	oUðZö$GébÑr¢7ü¥m9= +²}åö+ó©ÆÙqÏpK2çae= cöæ7¦¹hãqnrTÖþ"Õèñ¡m¸PQîGý-år¹ý»«À|¿5ô¸OÝÄ|5ñÀ½ôØ®ZËEµÒÀ½ô¾v¯3:Çý¼z|\âÛ>Ü¼«Ä¾,ÔvÕ>¼Q7#*Êý¼*ÄoõõcAaXÏ>¼XUßýÌ<ÿãý,¼=}Â¼¼½,º±ëÿÄÝÌÎ¾Ý@@üÄÝÌÎ¾ÝUþþÜ@LÌÄÅÝÀþþÜ@LÌÄÅ3»¾{¿{:¸Û D¿ õ¡Ô= u¢ÒêLþ>ï5£Ï	:ÿCëZýIÓÐ5 Ú5¨ÅÃ-U!r­Sø¿óíN(TÂçHÔÈÏÂíº0¿ñcqéX.þï1	9/ëY-	ÓÓ15«Ã9±!q¹²ûóù³+PçKÐ=MÏÁù°;>½L¿È¿V;¶©r)r)7SX)r)rÕ¡|LÅ$ÎN+ÖÿgLÛ%ÇîÆVC0Ç©QZÜ¹\3¤IV0=}j]íÙþ1PaùÎÃ,HæÎñcvô?[BÇ1Ç_T¥åçRý¨|ö	{¾b=MÀ°×ÅlÔ¢ûßG=MPeP!ÂîùHuöâ"ÖkTCÔh2 T{onûV'¨/Ú÷EÙ%ô*ÍsöÙpztP½sN.9hrÿjBqG{$ûq{­)Ckp9µF8Ç÷ã[}
Ïw;GÕÎ*	m>÷©æÎóvm÷	8§ÏëEãNþ¿cGï´Í@>þÊ£j¯
ôà0ÅÇYe
>Ï¹aºòµh{ºà{°´5!
³P÷´	¸f®«X°¶¥IN8+gs&åÉ¬f4	aø¥;ÅÚÛ¹i! ñqÆLdgòÔð©)0w= YH¦Éê­¹kÇ¦õw­÷¹L:ïaëHcÅv]ÈRÂPo}ú¡O®îÏ Ðá¥ÌðÅfæ7/¦ß±#ô±iîqaöÜhÎò¯@%»@Èº×U! =MÕÒ¿ M§Ì¢4ô®¦ä¯9Ý8Õ8±9¾8¨99ö8Ë´z³Yªwsu+ÅÈzºz¢åxç4³³ù·w³Ék¾k5ë3kÈ+-+Æ+Àk;«½Z§ùk7º¬ª%}ozãÕ|ìÙ4dË½¼ÛgÚq5¨mò)Ú«ÌÚ'¢mÌþô@Ì{ÌþÄÝ@Ì~ÌþôØþÄÝØ~Ý@Ì~Ý@ÌþÄÝ¸z»£Ï±=MÑ¹GôMÚÝÀ»#®ÎÛá¼Ü¡xÀ¼ Øø*É¥Lä,%Ä+E8ÁÛ[EùÈåXIä?}¦ÒªçÁ+PÀyÑù=}Í°ÔÊÐS0ÛªXÞñß ¯V[4U¯äÖ¯¤U¯d¥{= 
ö¶W ±mºÿÆ ^³±æõ§XèF= aÞ_=MÂ¦ç×!^¢PC×ýçÏz%ÿøÅk,7&7T^­Í*#tÇ^çzTÐ¯;?6­ýÛ·ûýÝt´9{ÖX9Úè>uKØE´Í¸¤X½{¯xo-âø£ø4WóX?²
Ù6ó¢RxQ.[ª'v'K6I(VwËhwQsó²Ëg)ñ¨¿éoÏwÝWÔémÑ'ãoâïÄIºSé;Ø{òÝ,)ÜÐjÉØMtòÌÆSâJHÁò¾W'OibÄA'¿]q=}tòäØÕÇ(jI	râJ=}¥«Z£³5Z³y[/»9û«£_Ýl¢hÖ8cEgSe%ÄI]Ý³7ìg¶ü!AgütÔ²gBe44Á(=}ÍúQ×Ò£ü'ØÍëìTlpì¬Ìj¿XÐÎkLxùrÊ
§×	OnG9}àV,÷hY&I Gygq Ça8o8oqÇe:_2_mO.Ouïu6Ïå9¡põa6Ãfÿ§6ÿE
jSÙWòTò|Ùá7¨¹@:á7´º¡7¡7i¹z±wqwI9QÑ¢ú[¦ÆngYrYÒsþýåBv«§w¤pb.õXÂ= ÐPYåÍÉ>æ¢/ÜµØ¡Q÷r7Ìù ­Z%÷÷^ùª8>ùl*fiNo²-~tNo¸´®/®/­¨¶ÇÇE¯¢Å@¦¯ ²g6yð.íRÖ6¥Ô1ûùb¥p¥ðøÂÒ´úcò§¾oRÂÔû>ÜuÈPõcâ0Ìß 1´pÏjÏM¤¤¨z}ZO=MäÜ_\æ¡D4uÏd°cß¥uQÌðCÊmûúLÔäKË£ÓÙ<Êú÷ÌØ õÔÚHÉÙPØqgÁ1=M:µÍµÍ§ì;7d=MÚóË£BÛãCzö(÷èÙ&edä'qL*Äï ¶ÝÖ*®Vxìè®ÛSÌ<ïU+cÌÕs2ü÷¶ò?Þ¢
ôQmGè*ù}*=MMY>ï²A¶A"y¥ Bfa7¼ôôæ¢	c_ÂC6úÄ]1J å Âhí:MY\U5ÞóÊZ
nÎâ±4J÷Ãcn0TeßP×HÕ|´BÆHî£^¯¸¯Lu}°è¯è*òxÄÔè.x],§.0U;ÕnøtT~éBLç©çAÑ8øYÃ¢mg1gU¾ÚrÁÎ%3Æá	´"³",pDéÑî$4Ù¨Å¨F«Þ2ö³®ÑFÆ&kQþ:ÓþÁst©¬¸Ì-5@ûjô
Ùm6ßZ:¶<µ¼sÛ²O±²6}ëùK[/[¿'éøÁA§l×|´	B¯Ö;-Qv"yH­ýêÃ¿ð'"u¼8Kx'{çOB­â3ÏÔJ"+¥*ísIÉtÍ'¬úàÛÛÅËai4ÙÁ_³ÃvÃ9ÇØ*x)|§´'^µ>;e4ylú[µ[Ý?¾ÙïôýX{x@ÈTt)§Ø
f¿~2Æ)F(ÒvýÌN'ªbiRÙ ËnS©å#6Ã2/9´ºmùNæÅý0L¥\!ÛíLØ¦f²4UÝ=},:¨ä\Qæ'Ì,ÆÏ[i=MIa´¸¨µõX ÷¬é¤)©³ä&v$u Ô³û4: ËÀu3´3=}Õ®ÿ¿Bâ_êñSZ£wÆAß	~(M¸=}®ún>,¨4 écSµÚnþiMdl®ë´á°A²å&ïùmøâÄ®×;ó=}¸mt ÆjCò$!¤#ÓÇvÎøEHßLi¿÷¡Æ!ÖnÓg|³¶õäF2µ)]*MZ~2la@MÿÂÉ2Øû÷îäË	·¿]}M½~:ò4Âöi]ÓÏèEo= Q¡ T|$ªà;Þò¾tÝ[^XFðÔmg´ñjÎ1UzWnÝ9àÄú¾«ü{%û;íUé/D[Û4ú :ÊôúÐWêµØ¸Ã¶·Õ¶S%e¸º¶¯Å¯7½Óµ8\	zuÆ5)ä|ë(2¦õ¹s>IA®ß5>¼¼ãdß^ü·¬¾Ý=M¤mÈ&t½8BlLpG¥¡ær<Æï¼ÏôÇVCý/íùúUta¾°!¢ò|ñ­3AòÁÔ?ZÝË"hÑ;ØÂJ<ÃÜÖe§l¯t[%FåGuxäëv_np--	R¢±KgÏJbØk°¥wì»0W@4O°cU;¤µ%;»÷«~¥a«&:zñ¸8£­ÃÅ¥Û#zc;3Öö»©xÆÓPçûkµ¢É ¯SKïÇSJkjÕ.-4|"¡@@²åY!Uy°¹c1[ëövâ6´½qôl°T 
ýW"¤'¦%mP®ueÂ_åîr=}wR4RµÃ¨¿jDyRxPÇ£·BÒ®2-6j´*ÁÖ<G©0¨1)¯t8A=}1ÞámÿN®¹Kr,0+¯âÚS=MQ XX:2}U83Zni!q aqI×òøµ]¤6f«';vÐ&¸a¡sã»áz9X­+«õM¥;ê´ã»^µ!gúg¹²IrRëZ8Tôé1
«£xïli¸= êÕhõ9b³¼¢#ÑIäWagÙ6%\Ò¤ª2¼¾¼e¤Ý üÈS¥ZF9 ¼tæ¶4=MH´«Ï=MO M°K Ã<óõ|Wrspqyçò«¿¶¤,þÃü»p2<EO=}»7=MºãÅÝn= òm¼9ØM@}»¼`});

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

    this.codeToString = (ptr) => {
      const characters = [],
        heap = new Uint8Array(this._common.wasm.HEAP);
      for (let character = heap[ptr]; character !== 0; character = heap[++ptr])
        characters.push(character);

      return String.fromCharCode(...characters);
    };

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

      const success = this._common.wasm._decode_frame(
        this._decoder,
        input.ptr,
        input.len
      );

      if (!success) {
        console.error(
          "@wasm-audio-decoders/flac: \n\t" +
            "Error: " +
            this.codeToString(this._errorStringPtr.buf[0]) +
            "\n\t" +
            "State: " +
            this.codeToString(this._stateStringPtr.buf[0])
        );

        return 0;
      }

      const output = new Float32Array(
        this._common.wasm.HEAP,
        this._outputBufferPtr.buf[0],
        this._outputBufferLen.buf[0]
      );

      const decoded = {
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
        }
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
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

  Object.defineProperty(exports, '__esModule', { value: true });

}));
