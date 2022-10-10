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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode00c9u#Î=}%Z6CùCü_6bÄ>­uÈ+7hWeùüð¸N-²±Ð×üüHhgÖ°abbbâ´Bczï=}{O2w>pC çu^ÃD¡)iÁØ·jºªÏùvÐÃ±ýiÛÞ[C N:]ûDÛFF.²¼'°Â¼°F'@xU£0}ü¢u£á^1,vÛóm&= ±P²vXb,ï¶ÙAºwý¯ÃG²ÄtÜ½Ìsèq¿±& 3¶-'ppÕÇ¸w8³ÔùDh±}äaÆ§å=}ÄW3qw÷q¶üTÐDÓ²)¬©o] §g­qò×_q/Óx¾ooÛÖzñØÒ[G9>Z¶#êüè5¶D£tÇÞõÂ­ù}7HåAß+½P@]õN1ô_d±vLÉVZu1Õá¹+&§/4ToðB²Xc½J=M<y0ÕÙÀeþ2½/þ!êísÿ½=MÎåPCCDªZíÉlðõ4ÎªÍæÚõOýÖsézþwt{û9D ÉýýX
féBôù@Ù­6î{1Ì£ ÿßàèúâA\´Q*¸Ëãs4]\A=}­Ùïô«6h:
D»î\<³¾[:îò~]ÏîÏôK*INÍNÏ<³æÏ\#ç5éÔÜÄ±.8ù]{c2nKûéÔóÇ'fD=}Ö¥®ÆLw k$ºc¡s¬À®r´gC3.?D}ã}33FëaºHÆlÑÿóh?~sÉÑåeBÍ!BgÝ¤TeT°ªÈÒæé½à²ÒÈ3¨b-)WãI=}*VaÆYcÊ	 -'»ÇÈU-Uß,Ò¢ö×õ0XÕ²å¾p°¯*[ÒdæA[z°L´.'-²/{½-îq|ù×wLCô\P:]Ì nº¢ÊÆÝû4]úK;èUjºR×q$*DY¯ûöEÓÁ-ÃQ<³YUê÷þdçH¥6CóG"Z[Ó¤_·vúòin*ì)¹ê¯6%(x³8kayCo4z»&$8n'Fªþ¶Ê]â³2Þáñ)
N@ðUì	ÞÉðsÈ]=MDaãýl¾cóµ1NjWb=}=}l¾_³qp[ >}TMùþÂå³ýÏ;~^Ú¥ò= Za%cò 674÷ûø([÷>·¯¤¥d¤ÝÎ©:ªyþ
ºõà4¨)×qH~Ô[½îîJ;Ø kêá°í´º$¬ú@<õêx²¤¶Åö.sãw$êbYe nüìBîÙÇðîÜË¨ÎÈaöÕ´2éÕíKÞx+JSÄt©Ñ^©Îjí}Q<&9\Q¥|S¥ËU¥î|;GAö÷b¶lø*Æ¬[Â&8%; #û [¥öbH\¥HöbÈë¿ yU[)q½OeEÕWWâiMÃò!×k5=}P1ïÈñ\[µâAú°õÅ?%TiÊm¬XPõ©kÁÿß>µÜK£4ðç+´µ³¤e,eÈq8B­ÒCÜ×¤Q´ÐTí0t6×Úã>ñÀûr ¬z,_r7*¾QpS~Aµ@_4Wõò"~nâ£õ~ày¬Î!E+UÊõ9?8qÓö¾÷?taÀÜ!IgW¶|Qô½äªT/â0SÒhäYG~Oß£ÿ-$YZ7üü³úzÀ4aWºuX¬¢V¹µOL{çmäc=}>f-P¿¡u1)Tzï0+SoÁU'á¹CÑe;O®¥dê²O{¸uºòÈÀ4æ|FSó¾ãv^­DjqE^DÌüãAÇ<Á&·r§jRã3Á½àèDr«µrî©q¼½]è¢7ðÞoÖ¶ç>wèo×Wôg¥ÀØGª¢èUJ¾ÒiÂâxGltib%¿eùfY$ÑF[·ö¹O¥aHÀ8G<ÌX2ºyK¨H½td©õO"8!UØ<É/áWiÈîXD#I¼°E°µuçN¼X*ÜJHèØ°Æ¸ù\%ÆJ0%ZvlbÀÆ/Õd
Ôy.åâ0%ÂbßZâ
½¦ 3üW6ý5vE$4!Iå«féÃø'¿çïÑÜoïµ½°E©wËï&ÎÖ­ËâqrÆ ÂÆýRÉ!º#­&Â¨Ç_¯|w0ÜÅï±>öÇØ'ÇÞp"øþG9nW¼õÞÝ¾éë2ªgÂÂ4§0!4#váÆª<hü RDµÚÔùAcêÄvq<ësHH²ø'83qk#ÕC¶÷sÖhg®4öÄ£hÅ5eÑvpgÈLüÏãDºåüµp!4 ø;ðÞ4þuÔa¸gÀV¼&3G¼ÅÃkè%eä}®~ öý	â}U4Æ­Ü¨ÁO}3}ïôRhF¶,ø)teÊ/ö%Ãdh~W7¢£¼'DöÖò¡óü2Ú%»³hGP=}¾N µáÀ\0H(vÙOÎK:vøÊäøApÛ0M@T*°Ã h<tÁÂuü>pF¼B¸¾º³g¼­V±ÜÀ¤k¸6Æ·~o'¨\÷Ç¾Âç PrÚFGþhùä½º¾pöì³	¦µQHÇÏ¼'Çg°<=Mf»¤Å}h¼$19×fÎ}8æÇT(¾CwJ?ß¼ªÀF{~OúÚê¾ÖhÇåZ\å!ØßÉÕíÇ|PÁÀà]ag3?ÉûåE°~x\ï/o²
m%{lWd ñ¯{¸ghl^e¿¬À~ÀtðñFÅTx\=}¯£¸Fdm½ÆÆ¬ 2èWô¶ÀÂf(Ç³´ÜÖÆG©sÒHÀ¨xMô{òã¨Æ»à~ór(= Ã.ûlÑ§9¿°/sêKsÄÝ¯YüV+ÃÇð;oÏÚÞ¤i!ñ±Gß]¥ñÃÂ?¥ý§^±E©Þ7ÕLé£Äò#OóÂ¸>D E+'^7ï§+xòèð­ý¬<Ò\©ÏgÑGNÖ¾=}éªÄÌ8­ã³é*Ò²þÐÜù ÊÜáä,iµ÷8·èÛRúí6UÕ,ÕO+Õ1þ£áÕ¦Vá¥äù§mÖ®Éx§Ùùî)ËàY<W¡M.ð¾}!wöPíù±!ØÞ"%ØðTÔé8ñ'ÑnCÐ#FHÜ<a|\b|efeÄda<Ö<íÞP5çôªÒ'Û?Qhm.ð¶±@©s'¬A4S(0e­¼¯]ÇX¶êeÆc=}= ×nfùÖnoÁ)ØWIgZf/I¯NYATDºZ©3MdÙ;41À¯§-«Ëz²#Å'WpQ²wÙ6º}r³(}5Oô.Ù.+ÈøãÌåêOaªÙ<ÅÙ|w-NVãì{~> 8£ba¢D	@@¯+;¿]N'ÆT'±øq­O8í¤=M=M4RjtÞ¿@ õeà¢BøçÚqø*-2Pªï @ùÞ*þÉå(x xvcxv3ãNi@çU·Á§uV= Ñïwî7·<éÍY®¯É¶
 Þÿ|OyùìDD/!SÓ×'2ÆpÖµW=M\Ç({Vãæ¤D&ª|18ïT	Æ= Ò;0ÄÔÃ²dÈîF<²¤ÖHÝ=}¤ÁÑa¤×røî×LÚéºð(Ucï uÕxºøÑ×íý?M¬Ï÷Ò#±^lVéZi1Ùº.ñö¨£.Ô±²¯uÏP7í¿oÅmYß
_ÙZ¼gªàßßRóºãl¶iB;JýI5«Î+5a*MIÏüjADtµLùÐ~7×Ýcþ¸ÇaWñ%cjWçJ<ù![ÖçgÝEÂÓ¹¶::Ù@¾³û´bjÓÙi<íáFïä )ÝGªÙüòÍºçFSÍIìL%mf¤Cm'§Z%KÍQý¾NZ´¿o3DìòRëú÷s«TðLA®D
¼MÚcÙtAÙ²¯­Èt+H$FM©Ôã­ö9qÖHìQÝÄ¹Ùã§ni	Êlz µ'ÂQ§l³©í(ï»ñ\PªTYd-sqÌÂ)Q£7èþeKìÅmBZùÊÒ<ìT 	áûxñV1vK-³ÔQqz ô.)QEÚ´¯éj ØÛc×ÛÃÇ
}ÐÒ1ii>üØ"²¿é
­éÊ2zôú!Æz tq®Z«Ü¸a¥kSØ(×îwKLpìÜ2R}e¹'ÚÁVøªÀ#UæbûbsÙ;ÊkmF¨\{(9ê×öP?ba\Aúè¼£z\dþL¿­¬ã¦ªWÑ@ÜÑ@¦Ñª\7Á7"O5éÚBg»¬t3Xx;_;%/ëa!õM«ÏatÔ¼Ò¶þgèñÄâ¶Ö.ú= §+$qFávm ÔWR± Æ],Z(X<.$]÷ì¶á¯q:}´VïÒCXAë?Ö»7}kmÇ¤íZÈÿë»¥ë¸é<ðQÅxëÈ4=M­N\§;à7ÙâÀbX= ~ÀA{©D·«Ò!8ûÒ´=M'"­Fí@ÂÍZ dí»/ìë("­ÌíÀ£Òëgí»­ÚZ8åSåUREY­§óûº
·âÛµàìFèyLÀ@E"ííºÀ½ke©\¼B´W{Üb!ÿÀü½U@»+ÆL1qI3¼æÕÞ¤0ìgÏÜoq7shß¬¶×´Yù)7£êoY¤ZVçç=}%N¤ìõ¾ü¢®º6yZ~/V&¶02ãJ
3¹__ueYÛþmHÍRÊãô(n°dD¥kùEì*Á da«Nëøªj»*ä3YÔòVeì¦V@h÷ü=Mï«÷åzûÃhKÚ´üÊYµÃÕøñáãCGY' UC®¤rsLä¥Ü0E{l¥ã\±Y"¹pÄuÞwñÃ¸p1ÇÆK!ÊýâPòáD®p!*ÛDÂ	¼$ØTbí~:°0Á±hÁ¢q¿<³yâþ®oj÷;tçrºdl÷£¼søRÓ;»Ü%DÃ%$ZxûÐjdÁBýbÿ¼WsæíB±¨pZeÎcØ¼t®=}z,au$£òOßQZÒQà±mÌ¦Q¢dÀ[j6G0þ.¹UhvqÙï²¯67=Mú]Ú9¼C^BÓ®¦Þhy?ÏðÂâhÛ³êá¶ÁY£>hê ÄÂÓÊçÁ§#VsD>NyÝ!I.æoæÆHwoYgC+ÂPªË³ F:Ãéhp©$¾£?x¬pF= ÿNkG#¢î-·= :;ñEØy¬D=MøIKeµY¡J-Es1{¾¦Nkyà4Dmµü«ö1âYìHüÓh\3:a3SLÅ}b|¹Íbô?Áß÷¾;F¨@MP]¶iÇ&$UB­ÝÄì÷9	¼QDÿØ±KEÚNë v#'Ê	= µÒæLüÿð¾fÖ.BíB¢pgìf:ØP<à	byÖ ·Ìc@ç?ñúÜ$8mPÆÍPµß¦G½XO%ìªÒö«óÚüüGüBïTÀ<é7dþ|õM÷èso­ûeß°o;q£¹ d²m,VýîãÄ
O¬ÂÎ§¹ËÛ®×<IìxÙ·®_]Ú4^Á·ìèÂõ¿Dõ1¢R_«O3©]þÃ(wXc½jçÉý3ÉÉ¹Y­ÁW¶1o²­ËÍ®C(Ðâ±(<]Mm./·ð?2aú$ k%ÿåÂyÃ=}uöÈÜ6¦ì\-ãTºâÖâxâ;À0IyP@uY7Í$_Ò'#Ó-kZÜ;ÉJÕnvn+1_ýâ7Nq=Mx$­!#ßVI¾Wßzw)LAãý	´Ñ}¾¢:äÅ13¦Hó×$ÄiómKùÐ7v,Êáû·NrnZËÉoÚøÌÖqæ¥ji{ó^{ÙuÛK4K8]º3lÉÎRmâ"|ÿ¿ ðô9~VmCOpd»g4$d»ß÷¤?Å?ò¬@<¢~¶
6Ä>'Z»¼d«q®+£~qÞl'æÐ!æÐ!¶<äÎ¹ç	®«¾ðabJú(PG<åT ·FÇ+Í©bl²q= Øy¼Ç²Ò¿òú5»ÃÍÙ¯7G\h¼ÃÃaoek»ú*·e:áUélMÄBþ¬ ¸Ý¨$9ºxÈâ/â\VbÁ?è:Èì¾¦Ò¾ßT{ÔOò¯¢ÚsÄ±Éi11U:!|WLVôÀÃM-G+8ÞýñG·ÉÇüXHý(fN¿©²u.Â2¾ÙHI<ùC®ë{¨ããJuS?ö=}÷ÛOTTWç¹ppdèÊ&­A£³²A§S= ùè=}»ÐN"sà>ÛEñv1@Gæõ¬iH'qþ2cã{§¿]i@8 ß1_OÈ>HR²xqÐÂkÓ=}ZþðÁ°0ê(y*@3s¥5$a°#·z¤·ÿþXï?Þ¡¤®Öæ®*jõY= Ã.àµêÕRô­DºG= AÐøbÊ(µã=M99ONeÓH©¥O*éå"iT¿'~»['W\ÈâLKGSËVèÝÑK#Øï=}Û3«1ÛR|íÜ ãdÐ~6®¸Ö=M5Õ¬·À\Ð×¥=MÍ	jÙ³ÊHDª¦Ê¸_	R	J]	á¼H^½ã¯ ,îjtµéO<=}'àùo2d5)<ÓdtÅC§Î±Vtà·ùÞÅ^ÅóxczN´)îÂgw5Þ¹ó$®ç/Î5ÌKµÛJ®[/oå*¯±ÞW:yØHÿ©ÉPËõb\ñ¨!î5] Rè¬WéHÅÒÆ²î±øÇ³kA¦¡kI	AïMTK+
ÚññC÷ÓÓ®kiØ¨tu,7eÈA»©JdÙ$ÝÉPØgÓÁ$v¹J@HíõÓNÂ²Xà­JäoðÔTë/Öd¬Û{µïìL²èqä³1Cvo$³ìF/(b'¨bL$úùXÇô¯¤>N:ÍUSºó P9<y5µ¼V#ªVÕ	Ó%õmóßPr÷\X CÉ§JRï÷Æ$-ÈUµ4£bTWb8²¼UöO&¾4ÌóÐ(ñá{¤w²YÑ¢^vêÙ5ªlÝÙZ4è7~Ü×ÞI9_·Í¡Hå[¼	D+ùÖL}î\ÿY5¬[ãæÀ)3å®±øÀ¤#÷tE+{Óôµ?èPÖ¢s"\bvMñe[Okd¥×¶wuv*]êCÓº.B&¯ÏyÀÌÏû\øßhæM:1XRT
çò£öð 2~a%[T_­k@ì³­ÓLFhBh%*%ÜqÝ«[LòNÃ­+±øhÂ­+ü´ø¨úV>;~;Z/Û+¥w?H;Z½Ý ³\T
ÃJ0G©^èA ð !î [4òÑìNd­²»Ü
þ7MH»æg	ÁUõjóHFcÓís½¯¹ìË= Ò=}%:kª9"VÆÿæà§V®&Ë»&¦B = tAòÈ=}U*¦Ã}°_¢ë±a¹Ø?å¶Û3ÇÂ!'Ó0ñâ¯$ò22O>7:´àGnÈ¯¦Ï»éJËÌh¾fxÊ^¬tÄÆssthÃ"ö0Ä¼u/°¶i&2æ|ÒÈ2µRá)IÊÏá¸zzGú
ÝºÓaíÏ}RËkÍðÿTÕ¡I\æ	TÊÌOKÊÌùT\aÊ\Qù­E°¥&&x¾õÈ/ä±Ä<Àe<È¦Àfèóüö-på»¿!#ótAÜ,4 :a £UÒw¦¶¸·dÅ¶SNWé=}½îÑöÓ8Ôö¦ßãß6O¥fD$ìöjZÇô}D-ÂÙjh:pAÀ°ãi×9óÙ5Ì·ZÙnÜ0Að0¦	®Ø^WeåthI´$låxUYLUëx\ðeº÷'é°âðLZ´¢ë¾}Q6×zñ[¡º,:R6æTíBõ£]aßRWÜR®k%+ºzñoã= 6±¾Í'*ÅmqÍ,gm»#CyA$õ>B®­þKÌ3ZT²b»Ê±VHÞJ!®Ã0])è Ô^= çMwò zL|Ü2BpÙë;W= Ú<ÇÐ³QXz.år®-D¼9j 
¾;Và°mÕc½~T­7w¥ÁI}÷U8}>Ò%ââãNì0òÌ5l5ÐÕi ¦Í+ÜûóÖ âËÚ1G§Î]^Ø##YM#\_R¢ínmÅçP÷
YL9;k;À6½¨½ ×fjHðüpÔ¥~|áåÉµ8L(ü.Ú½ÃÌý-s¬Å'º«¿aü¤;#É|´0ºC¢»1È=}Iw­ý{'BiºÏQ.ttw:~]R,8°ÑÑìúâa5 ça»ÉRònÏå¢)öÞ(±> ìï¸{H7/ñê3íêq#2V³­,Còå5Uí¡[ìp´[îQöò¹¹Ý=Mªò
¢¼¹]iç&=Mµ±ÕègÛuØÎ[àZ§éÂCd­çPpM­TéB;XñéPp£òVÀ/d¹çPpM ßºÃL­è·:AzQ­ÜÖ[8~·:A~Q­Ö[8Z¥¬¹]ðÂµå;r­ÅÝÀ'L\JEÈ¦+ÝÂÚ»MÇ.-¼«@ãxÌÚóÐzÙNxI]ìç4°¼vDSto ØÌ¥5mlLQÅñÕýGI#<g9ñÖ¥üxdõÖCÎO?ýRp¼ÅiA0fÀ¶}-ú©"ûð=MK%K!KqúÃIÔåf{¾ôíÌ#ª¹ÇÓ"¿ÍT.U5MmÀÉíPsnK4	meº8ºñEs«s¯>ùÞââðXº4ïb¸ÄÓÍ*ÜgÊ¿[Ùá);^ +£î»n½áÞ¼: tði2öUó5 å_ÐVp18<÷7?&Ûgc9Ìk= m[Ad(Àv_ßïÖ^ò+-Y!}ÅßÎ[oÚîxòÍTë117¶­yã:²­m¾w[EërEÖ.õÜ©d¾ß¼«¤åOhoQZNåéãYÏ{k2
k-= ±õj=MTB¦A87Äï(38/ÝQÂ=}â²P#à¼;3WÌÉ/!©iâ[Z¯­ºÓ¨Ó]¢nP½ÊvT*±³§Ø¬ÐïÞÙt4¨eG_%;vÃaÐÛæñcÝÎ~ÀsÑPá§ï·ÉÕËQÇ/ÉÊïqÅÀ÷ÄL¬Ë£évúßO AÍVTb¡|DÜÒJ®Û EqìºG@Ür½ïs &9mvS¼G½q¥Ë^lÝ4ïÃÃpÚ.>B8»Ò}³.í¹t[9Ï²Ç/µ)°.Xï_ab´ClT2hðêSTT'do¤5=}0¼dY£=}&éÒïÛ­ÛÛI¶1#F­ò5 ¾|&õÜ&õÀ_9çïbc©xTáHãwy¼fÛáÒÛ=}úv­úñW´	w6QJm¹]x{ÁÝ¶þ+»ÓNùywéVýÝ©ã£W»"
 7Ê>Lò¤Xaÿ5d1nåeZ=MF)¾ZÞ ý7µBÿiröH´µ³¢,Cfrü2<ÚaadMÄù^ZÄFùÝ¼óNÎä_	·öîèÂù@'6«°ÏÓr,Ã¶SKî#E®÷ØÎËo­J´éP±	³s} 'q1ê$I³	ý¯$±;SX+ÕIñÑ *zW/Bdä57(TèÑùÑô£íKmÚRÙ+¬Í@¤Å\Q_°ÄñR1ó5´ðÚ´øYâ0Æ\ëóeóÕÉ#;ºíÛº\ÑEÈQÍ= Z AÛÇ=MQ]c=}ñEÛåÌWHÛRéÍ\Q á¡KÛM\0Õo?» ÈºHÇ°ÈÇÇ©(­³³Ç»hÇ¢ÈÃèHÂÀí´(iÖ8h¹3ÀªÞÃÁhûX¡ÈçÀ»DÙ\XÛäÞ¸ýA¥Æ!­G÷-Ì¼ìÎÇg\×:ÎÅà%J3Ín/'gø;n&­.(­³uô¼w~T«Tô»ÃEZ´¶ëxÄë8SÅºEZ#Ñ÷Gô;,¤vëÍÀµu¼§4àB àÂNÝZRÙÉÎF¸¨Ç¨¡HJ ýµî$&SèË°f_5Î{v÷gÂ~ îo1aoíÎÚ´o|4¸v«õÒU¬j·WLû#>f÷è?èÙoàBèú
Ñø¯áú¿õÇ9æðe§&¾vgÂ'±«³¦¸RÒ0RÒÎLA&Rz,«ÁÛ²IA¡ ó;¸à92OÉ÷­uý
:±Þ¾ÔºE#M?üx('qLf
?Úñ­ÊN7hfÒ£Taª}s0sü0»}x{ÍÇ­É !ª	KkØxu<nm!]óJ7=M^«®:-¶w7Ç¾rÅ#bçkYR1¹@	AYy×ýþK¿nkú¾}mý´p2q.Ó%ÌïêÓ¦1c>GUøpV¤¿ò·­¤ÆD= OT¾!H,ê¼)]ÝM:Å//±~U¸júRy#\ý×IÇ)}å]¡¸C)+ePVtrÈ1è>2þ@Ù¿Eþ&×¹1qÞÆuVÅx\SOø
ºÿöþèb¿b õ.3hr³NíÄ0©Þ½þÛt;T.¼FcÂ£¡@òC2g°"­dëGÏê{J­Þ>Â¨>{õm'Ç8õÖrèm"øm7Å_	Hæ.:Æ´´ó$cêÇRüÈt{ÆµÕ¿H=}//r³yGêH&l¯¿LÝÒ;l¸îz-§
$h£ljÓS'p´JY«2Î=M¥ò0A#öfçáÜòdcæ§O-ÿ]](rÃs /bñ 7öcQn±ãQ#¢ô:j?~Ø¶{1â3Ø7Ó½ S%ÎÝ.ÝÙøÎ=MB%ñyý*øã^ôÝó^\;Z{]±jµÜQ%ÁÈb/dúáüvbkgôçUAQßj<:³ÏZ­P3@£(å=}O¡)±ãcÌsâÕ$þýÏù=}ò	8 Ôq.qÒ(Ö1PjÓSðÝÈÞ©SüÄs³«>DÃzÊñ'Øþ.A¿>=}ï2­@ê=M	ÛbÆâYVÂO¤¢F²+,¿³Q;÷Çf¯Äû}cÕÔ¦cf=}³¿³m|ß¯Ï"0Y]ì[>Ì¾cøNÏû	ÏÖMWf
àÌ¢¯ä4 brdUãÉ"ÌFTDÎ)¦)o7ù3÷Ï6½Ó3î¢ÒnöX,ZÉ
LjMà e=M2t5l5¦å±¥²*,&µgýåýÌTiàè.Q%¿Ö½²6.?^2Ùsq$ñkqAx2¬uyuezÝ¹f/HýMÎBºcV¢zwÒZóod,í¯Øg:Ô¶t¦ßç%¢wõtuàâÎ¾/Û¶dÎ8ÒñÂ¸|Nº×¯ö=MDÝtâ°¢#ßº«^= h²Û¸L]ÐèMà&ëøoÎ:¬Hô£P.ÅV¹=   ¡ÉuÔ ¿ÕZ}µÄÐ4Ð.À¬¸çÅv©8õÀ§îÁÕ§I¯2v«X,Ð¹ Â5}{ü2ZàïÛËÁ«ÊöUç.Nþ$ÙfØò·¿EØÓº>Å:PU÷Çj[ø±»¡IôðáÓÇ
éÏø,ÝrÁÛ'ëeG¬N,og7òr·{÷Võ	ýdAGaÎáó×g_ÆïFI¨wª¾8\Ón0SKþZSyÕs72ZA¡jÉ}à£GkQ?ÝUä¿§§­6Rß¨ßÕu,â-&+¬8i*	,ÌäXíVòÆÜK¦)ën*D©B°ú3=}Ú/¹ñksZX²Xt´:Þ#»¿3rzGanØEE,7#Â¿q¿ÕÛ ×´ùÌQ,äHøBcyÛ0nÇÿhÆÅëa*fóM è2,Þ,E3»½Q¶= Üj±Û1ÙY(5(oNø õÁ;\hxóöX%/[º8õOÈÅmD²¹¶Ú%«p+émÏÅSh¨ºÛÎ ë´E6Åì@±Â;l·oÎùå¢\yäß½j¦4Îã¥¹
¨BPçVÝ®X$:ØðBîW&êÃ5*­Ww­×ZbLÜG§Kàð7ßf®¨tÊ$cÅS÷öf÷¬U~ÚEú	­mb9/üzåxÜäO ìý1ÚÌóÝJÊ­-Ûz9?QÍaë¡ð´:Ý@å¢º®[kgõÂëyÅÚo0ÁW´ô>ðlcÙ9p1ÚDÚ¶¨ÜÆ§(®ÀæÒCáT[¡áûf>3³ük.èV¸ºÏ pëæôhñW£¼M®
 q]w,nØs¦¡©êmü#EeJã@Öh½TUæUZV°Î¤»#zÐOáüï¡+/Gy	bQ í>å»^üéº=}ñ ¢V=}?þ´ <ãcÂ{0Cî§jq_±´a¹¯Ã´Ä]	%gLÕ§ÐôQÛÄ+boÛDÔ]ñÑj´}^Ñ¶·ü¹:|¦ífµTÆí}]uhØªja®£©|¥¥è>Â¼¨<l³k|°²¦Ö43²{ç{küV~ð)dMþV@ß	²¦~4Ýæ¢raò'2ÊÀt¸ò	¥$ðÑn+Ý:¼¼Åçeþ0ùUGwk;Mâãüóµ uUZ¾Tê´ÝòOTèGåÿ¸)Ò]^Øã	Ãé|á­Ø++ø70¬'%Hï¤½,1®Å4j%höYçV´®íþ¾W²èÜhp×©T5%#´ÝNÄB;qWúpùºâd¦DåL×hc·nhÉgÒï¤ûó¯¡êÈ{aÑL¨lÇïÉzåñ®¯H¹Î0ôP¼7æ9=}j=Mç¡íCAËs[îâóÕ.<MÏB¹Ë×{wø{ý¬Ù>ÔAwü±ñò¬ÐyüjáÉéèoYÞsê­ÎúåÔÂVýv4)±ùD):¯Ò£]¯R\GyúmÌÏÎ>¥hï¶Uë2øoÐbß¨â-ßLß,Æ6:AFYüëÏàÂgò|4çr'©ÿ¢°¤w  á3m(å»l1Ý=MMÎöõ©*oTq0Ãæ£¥/|²¥*ûcàEäç3<4¿õ×ÐïØ a¥é¯°á²wcÿa	fNTCaÃÙý>¥ Ã§Ì¨|Dv×f¿³©&>eP@gê	2dÉ?Ò)äï	ïI2aÉFgçxÃ>hk8/{æ:°. $¿¾lóG¾/8ÆÜD1GSG#£~½$ EÔÉ¿ýãpY@¤ÖÖ0¸FKw$G:#´7Óð5ñ¼xw*(ïx»|9îo9µÄü :fsázgb«#
·/FR÷i'Ö¾ï«;zv¡®]+7s×#3qÑöm]öí´¾-KNm)|QFm#3Vq*¬Zµnh;E)ø¡@nÑ¡üPò¦¢¢+£ß3~~Fmf¢.èºé9¤¾Äc§«ûmÐürÔürOÙ\iØº Ý,iå¢ïFzV_â*±_$éF0Y"Õ»Zs5ù?µRïÜ!Òî#à
ñ¿|}Ú]=}Zü&úÛZ= .í5ù×j=}V0µ*z/¡QhìÅn^;(>ÈT:FHu¥X-O-¶©É;_ð_eL&Oî-0fbþâÆfNÍÐ²XëÄ¹ÎPº"êËr7ÎxyÕY£,,SìjaÚL+§Ô¤û=M(úºö&ÞÅ¦¶|Sº7%»3nõ½sáSóöm
Þ2ú:/i}~ó_û.$¯wé"¢Owû­	Þ
&®ÁGÓtë<Äi^r|XnÛ]{E-{Y2ÕU®ïØtË\ YòñösjÓNóñÊ-ÈêJ0SFww§÷;ÐHøFº°áD*pe®ùSÕ;§Q+RUVKµºãt¬_ìvgtHòS.åÝ/òÿ¯aj¡M,òpa¬¡Y+´åä5\,Ýzzå£ø0W×éQTLÑ{+Þ
'uêáàÀëaÝÀê!ô·©ÓP)ñÙ5{ÀyU.1µÛïe®;.>¦A0³®{<Ý×23hÌÀa_F@øNo¦ãN¡â%n= æm^£æiy óhDGNC%²h YÕG¯»;Ü6£x dÝ¤«¡= r ÛZ+&ôF¶,¾_7%?@¥S$ð~õ= , EÎ3Gt$ut¢kðÀ@;6@@~k¦!}dR?<·!}Ú¶wR?&0§s= ½|Ug»ó#¼ó#¾ó±=}t1 S jkÄS_T$G½HözähÞ¾kg\TCkgRq0h\§_,.¦f3Õ.öÄG>h £'24'2t'2Ð×An¶À$2ñBnVT®Bnâ½tWVÛ(ÃÕ¢ÖæS¯+²(bñùàÎWJ\#×{#×Yµqn¸¨¸(º«XÁ'ÅÅL'Å*È/x7±ïMV¡M¡z½_R½_~±4õÃóþÈÑkØFØ±9t) S ¡t)jKþxKú%ù|=}Ö5»!#ÜÎ­A'uÞß4bA@e:,Ç|½µÀäµxA¿EÞläãÓ´zyg¤®?¬?Äµ0
qúÃ1h£ìÑ}µÎãBJOÖJ¿DJÃ)=MgÀ/VÖÖë3QáMcSÙr8Ï¹´;:ò£çse©1Ö8IgÓó,NAö"rðß..{ãÕ»rÚgÍ¡¹2$Wö\.!Nw/"6PäÂ3~~LSQðxkF5u_ì÷.RSø]jÛ7­rüµe¹æ 0SÚåT¶±øwkKSZbSÎÞu¿UXNºªuv=  ¯Ã¥kAV7FÕ+îµ÷L¦yÔÅg=}¶ãä(j4ùs+æKêáæ¼G]Bì¾jEÂ¶?= ?jJË*ÚMúÎC'<Ï£ÊÄþOÞUg)½cÎtãuo)^rÒD= 'ýéNì·+}T}Ñei¶Ýµog&|L¿¸=}(¥ÏÇ,©²ü5Lº®å½|}= &¢,èpªót÷òQ×RøµÝ¢õÈ= fÈ¥Wo¶É ÏFÛ	
Ë1pÖÃIGÏFÝ	7LÕiè~
 Ì±P6ÐÊ½Lÿ±ÆÉÃGä½TÉCoÖCøIg3L§Öið£i@Ë±Zÿ±¶ÉÏfaC6>b¬6ºã;}O-þuãNòi£s\Bm7;;|w<;~ª­mWw\ð¼b:ût\úð¬22´-}ÌB9XýAM^PjÕ¬Ô%~ÁnÊþ4jã
^ÈBrl·ôÅF¸­R´¡[öêê~2¢ Gøiµ@º¹ÖµÐHÚO'Ûàä@KÀá¢·ÇÄ·&$A){Èg^Nl¥éejwzV¸µFªN+,_H$Â©ÿ÷ý
Ë±%ä½É¤Ï¦Õifÿ±ÆÉÃä½'ÉÆÖCðIGÏ¦Ñiè
8ÎØ£i Ì±Ä6´Ê½ä=}öIg3LwÏÜ6Ê½ä=}I}
= Ë±jÿ±?LW¸3xÉtË14 DÎZ&¶Þ	d£ôI@~ Éÿ±£Y¬>bä{6/Ö¤Ù {ÿ-«ÿíxêÖR4w= OAÅÄ¹ì¶¨õ:ÔhDT¹çc ·}Ñ©È¨lÝå)TÍ::á
EÜ
'ÅãK::ÍmÁßK~« Ú«¤ÑTöÍd8|Q8H5Þ'@" ¦89ÊÄ! ¦òä× ¦xM?åw8íöÄ ¦ÚSaû·GVëý ¦ òkD¦æoQó¾>Z'rwÝ¢ÁÆ )H>¦¨¡VøÑWÝ¨b ¾þÖj-ÓÈ×2O×jÂx°·g?Ú|vømªB.Wj5í 7ÍFBãäÈV¡Å;C­Kß5ò*W]¾½^§(=MÈÄ3ÿâl·¯ídÔ¡+Mß%èÂáFÆdVh|¨	ÎvÖ×5þA =MÐÂÆ+BX&½Mø¾Ár[ÔòûêLüÙ²·í²HnäY@¨K¼«Õê×èêQhzNOhØ" ]´O#íU¹¦£ÊõÖ¡;ã%b4·ÉcHn¸j)y§:nÊ\DóùÖ£Ë<T ´]°1 çaZù¬T{xtåß¿ý¿¿ZxO<ìä?÷×~@µ#Äæg¶½¿wàd©²¨¼£ ê3«[$ØÖ|æ§dÑr¥MáPjBKt¸íÕÃóTÒÃí[.è©§l gºdB¬Ð¶É ÏFÛ	
Ë1pÖÃIGÏFÝ	7LÕiè~
 Ì±P6ÐÊ½Lÿ±ÆÉÃGä½TÉCoÖCøIg3L§Öið£i@Ë±Zÿ±¶ÉÏfaC6>b¬6ºã;}ÎªFØ¤ËU@»EÏo%µ­Â­ïð ´­ð ´m¬mt\4e%t\Ü³­a\¬b<ûx\âð|â<ûw\_\ø	g¿gHyG¶÷»±_^©o\ma,ùº×ò/@UñÁ4¾õæ7+ªuÜ%°­³Hë^®fjð	M¨Iî×Íú%{xqä }ù¾»ÎöqxùB_0rnªý"EGôÌ3×$ØøZMiB1äsÀMcÜeh¨¡Ã;gMT»ÇG
oÀZÊÝÿa¡Asxû¦10¹¸ô÷_ïE PäQ¹üûFèc8= {¥2H~b¶¢26LWLÀZàRø«BOa?¶Bbk¾Û]ZªQnO5Úî­Å(ÍA«ñ«Æ««8èýÀîq3e¹¼ð¬92f#6þjêØWa­²cÝO¬§NÄw ô¥L|Ù¯lðN,Ý>*÷u£þøRÙª,?U¯	ÔôÇ¨eAd a:©T¥Zå®7Æ6þðZë9«Qï/ÀVkòÛo'(N.f.~3]aF0kÏ¸DoÁû=}ÎþÕ A= àÏÖó0Ó²óQ?Ó¤±íÐã l «'5oçKºK÷@,þ1'þZýÏÅ¥LâÇûKJNÔ"Ig|å5>UÇuÕÈÆ=}úØ÷Ö»C'ãF¬°"¨ <CÉ¿§£ýdt«CS¼c_Od<ÔcYÒÅ½jþ¥å?_#«êÇ´¶}.Üh­¤AúK5J	 îGX&½¹ë÷¤ç>âÐ?FÈì4j}óùçÒ¬@j­lÔ]æÜjýM	ÇîM¤wVãÉ/ BÅÂºnÚ¶aÚº»= h<¯pÎ·ÄfIKÈÇNhëC¨¶,Û¸hvXÄÒ=}5!¸oýuöÏv¿&ÓËü_"ÑFë½[$ði	=}FgÊæ@åM»¶­ýH-ËäØ]¿VÔ®jèù¤¹=}Pfò¸ÙCó¢ã¢¸?({8P5$®pùq©vÄÊA595\+FWSnådÉÀyêÿÿXâÇ=}º¨8v s¸µNI:¢òþ¼x^±Z¯ón^pX¦,Âýº©Ö[ú5ÿøi´Ïa+0z§!KWJ¦I¯Øä,\ß7ÉÜÅ%µ(l;_;ä¡(ÀgÚÈÏ§dÁoYEh)g­¥¿SdÖ6,Ûkñ×¼ÌKGÊ'0·ka¦n= ¿µé2!­ª>ÚØL»6ªhP¥a<ýT\­Ø×Û*oÙ°NÞ_Ðø®üÝ¶Y¯í>%ªvÔ§_¼-Úûø¨=MPÖ¦Î§ZÃpûmEhrÄ¡pº¹1çæ÷"-¥	^Ë]ÆÚ%BFr=MèYØ>E/óºbòK"ÒRf"gö0®k"h§5s¡½ç¸#×¸c·«§\åOv¦Ä$°ÀÆï;c9v*ªe[w²!<Gcê_Ñaë§:ÒfõþûrsZSÅ~îaXa3ö^O½M"Ê,"EäüÂ¶s½üz=Mrc 9ÎSS¹}U$ÿí#çH¥:9Ojiï%	cQU+ÝÙ÷!ËK3-/ýßí8XàUöÐÇãwóYÓ¤¹?@dýP²­Û
­ þ#°ªpÞ?¥E"<3ØUh~ùïù'ÇUôöUº÷UtöÕ)È^ß0Úþ
ó,ÈÞ¯äÚ¨è$X}¥/ÅtÑòò8å¬ø,¯>&zÀî¨. >.^zDAñuP5$Þ¨¼57°Á;,¥¸ó0t'E²o\ÁFë4û¢>¡>¢;«¾6ÞÀKûv_HÀ½$OòBØþÇ ò©CF/tÆ¥Ý¤HÑ©XÇ«XÇëCÛ¾+{\ØMÐ]í+Ï;]ØÅ<ÓÅ°ûé ð0å?K')Q°,Õz9êØlãLÿ7ùS7ð!50µ$= ãÂÇ÷±ûCguòwª®VÛï]æg§òK*R¢xs¨¦º2,Ä|¯øÁç$ÂämåG?J
ôçÆM½/-ÿTk¢|n´KÆ[êéð<Kn/4Ê¯Ô¡T¬¢¯èÓ,¾IÖT'¤>Ì:4^î¡7?áMGÇÊ5'Aô@e¹Çs¡Lø=  :}¥d=}ieao¬QÓ[óFâc¿.«
ÊÎ¶F5/'ZÏB£ ±îsaõ8·Ölàwðr+e-µÔPºè¹ÐÞµ´C}»ÎÌÙR4ÀfeÓt*Ú-£Oê| mi!÷«fLLweÇJ$Lâ~[¹,|-¹íÎúßGÐ5èà 2«2ÿÛ=M3¡Úµ$á>Ç2wà¦Ñ/«}Sç]Ý¾=}ï SEÞ{¸òýÅìÅtH¥F#ßoÿÂm¸yú[$aáëÙ+ÜéTîb°ï}p¹	}@ì£uÑ[÷«¢ 5.1Iýw»Õ°­ÚH¯©!÷²çZÐ¡ g-#2Ý§¡@V þmW¦Pn¥ôÀÓ]&XÏw\¶*ëÂqFÓv%uÖéw%.P÷ª
4{M#>ÍhO¦ø¼/Óæ´ñJÃËK§ZPAe= MÓ=}£1OqsoÕ9!~Õ"Ö9eÏtï%ee¬Ë¾nîNôc¢Ýß:mc[w[G"Î¯
l%«Nuâ¡aü§¿küµÝ¤¡!È2¶ÈÔî°ò¼éÁëúG(<b/%«Þ_]ÉÂéMî¬ÑõRN´rþ-².$ÃÑ#7|ª¡AùSÌ}i3bø*(êÅÆvÑ7á¦|á,et½2ò¾ ¼¡®yj°ªgª´øì¼(¼ù±¢½5±¢oDÑÑ[ÄºQS6BWÉb%½J[þ¥ø¿C;ÐN¤N$§Î{m9>Ó¸Á'±{P{þb 	0zÏ*ðÒ[y¸æ53#Gÿ
Às¨Om¹:È=}¨é;BM¢YaêìþòØQúZ3y{ÿÃ<ùã!o	(~=Mà«ÒÍÆ6+}õÖs?°@ºz£/5PTm3ÆÑÔÖS+,¹"'÷Ñzõh|û&Gu6«#aþÞ!4¯®Ô»Ô»ïÔ»1"Y%¢Õ¨!Z²ÂeR¬Ò4ûÿ0Ë:øØä:rü¥ZùÖA+yaÞ ÔÑzðfDä.s-FÚÚYùMaty«¨5£(â¾÷ÞCHøPÎ-¸üÞ<!äêîðûv±©¯\è¼Õ®Ã6ÿrisÀÀFµ¿@ZÞÜàæ/øTÐuõ-Á8Úë~ÒÜ=M¥·#8-Ð£!UM¯¦®"¢½Ì÷ñäo5¬öä»úHPK6Ëô;á¸íuÌ\	bÚTJÝ6ú©ó-W~=M&ø­D_[¼Jä¥ñ9QÍÄ®Ml_ Åï¶ä(ïÚ¡­<ñ¼×¾ÆDt¤t¹­Fò(@Èk1_p¢*¿½èò	¥óú 7¼pú)¢?Ñ)ºèLøÞsTNNuÉLs.®GÙßßEàÍý§$pZâ*ÚvÏZ½~)	Ðæka>¦¶òoöy+éX Ad=}æÂ¥ð²(# ºÃYïÚ|]lyÿÑh³þpx&d¯ÿ!=M¡FXÔ®0P\àfÐ(h¯kj2"ö>¶krm9eá«Çôs ëG£¥Àæu÷È?¾8,çÁHÉîÊ£ÇM
óÿËÉÔÔ¬ëÑÉ
IÑÔÌ=MüÉ
]ÑÔÍ/*É
jÑÔXëÐ×ÒåäÛÞÿúíìóö9@GB54+.
#&©°·²ÅÄ»¾¡¨Y= gbUTKNqxoj}|¤¥ÈÁº¿¬­¶³ytunkXQJO\]fcðéò÷þûèáÚßÌÍÖÓ "'81*/<=}FCRWPI^[dezvslmÂÇÀ¹®«´µ¦£270)>;DE(!=MâçàÙÎËÔÕêïøñüý	%$?:AH36-,ù ëîõôÏÊÑØãæÝÜwrip{~_ZahSVML§¢ ¯ª±¸ÃÆ½¼ÕL+YÖÝÉT¨6®#6¤6d64¢@gªÉÅ÷Ú®èQôÒéã=M_u[Ì»
7Î²îníJÕ£	²ÊFn=}KÓ³öñö®iñÝ[F;ÙWÚÕ ­[eN ¹'GàAóø©¥Zyû¡ï*Ìu^ºûÒ/âËì.yá×Úp©fu¬9Ö7&ãO>Þ÷Cäè±ÖxÃÌ¨ª4pàº'AØ²'Õ+#'zó!4 µL~Î¯£Ñ\3ÓPrþà¯ ecÎì*=}q:¹(VIêóÄèÅèÈ¶z½ñeR|D
2Ìð¬§IdCD8è@ªW'¢t:æw²îu= ¹dØÁò Åïh°üÇ¹ ÇµXÂ»¨àºÓ'³$AP8¿>OðÃ5hFÝØ)>jJÿ£O=}dÜ1uv}f£Û#2T6ç¦|P½Ug¡ðÃ7è¶ÖfoÔ?wúÄ2XÞz«O"Ös4vÛ>iw¨C44qjîk­_'ô	¢ñ|~áÝX+¤(½Æ2=MÉQÎKÉW 	ÙIéÞx«ÎYM8ÙIjÐÈ©@ÙÍ©TEæ3º*ÑË¹'×JéÉP.wéÑ¦ØEªßÙÍ©ùP9!éÑ"ÛÍÊÁà
9ÉrÏÉÉÊ½¤¨f·-ÑMÙÑÒJÙéíMÙÑÒJYùêêÙÑMMÙËêêÙÑMMyÀGHÆÄÇ¾Æ¼´ØDéKµìÒÑêÞ 9Wí«ekäè1¹V÷£E»QûslÌ@*T¡|KÔõzNàµ©ï´ûOâß)õ!+ùláüIÊÇ»PCoL³kR×n^ÿ1·m¬codç7±¶w¤C³±{tiL?BtS§t«Tór®= ³Áwo³ó¯bàAvu'Cqykçô©JÈüØÑ)4
ÉÉ,7{¨6¤/6¤ÿ+l6¤6¤§æ/åb
ÓJ7ÁÕÍæ)åGK(ÕEÖéEÊ¿*ÞuÎðyâ¥J¡ÉÈLöyÔûÅÐHKÎ¹æ÷¹Ð7LûÑ ©1Ëv¹ÏüAÑó)AÎ§Ú¹â¹Ê¥P&yàJÊ±jXã8ã(ÎVhq/&,iúRÓq³qz!Æ1ßkt6Ä1ÅET§(þ c±R¯éäfdRâ~úvdò¯¯~g+ã#^a+?tF?}æ?ãw1 +H,£¸zx££{·Å4Å·HÅx7ß¨Xh³7øÇkDQ¨x>¬Sþf¥L×F´å=}÷:7qµ³X½0RäÆ«þºuÈkÈZñRÃ¾sGÈø:jï¥¾£Ò äî]ÜcCHCnMØ= MÍ½¡±ê®þ®¤±® q.²pV«q= ;úm5¨r¬c:ô¾a¨VØ= .³§Aeý·âðsê>ÖÏ|mVë²c=}ÿAúÁ[m0LCi-¹= }ù¥íè\¸O¶-eâW[»Pª»,ûOÝcbHNÎ¼hyâÐ¯\ùÂc¸ ªX"êc§ÿà|ø|½FÃ5.haÖ²B/pf}*£¥=}fýbgg½òv*#ôoÆdLv­ß=}åaÏ,\SìÁÖï¸t\ÒÉÂ¨RæxlÑÉ¿ÝÄåÉyZ^¡+óªGÜSªMÁ­¬î*ââWHRePQ"®ëO~QX	ë³ªê+»ø»lY%VU:J­Fì;0àBÿ·o[³.ÅVÌAoÊ2$3\.nÿ¢36.¦³ÊjË:Î-³¸	×Î-ôÝYv	×ÎM«Óÿ@CÐ{f§J%ªµ=  ´= í¨¨°B§ðÚÛðrÛîêR Û,<[Q§RÅmfR1m9«Ùòîâîz	2zýé²ò*mÔnòõ¢ôº$ÔÉªïjiÜKÇËP¹NÙÛÒ%Ë1ß¥T¸RìÒAEKE=M5A= ÙÛézí*&÷oÜ´°=}·^¥a7WW¶f ¶>>ª¥ê"¿q5$= 5ùtôY¦üd#a.GaÎ0¸¿-~É¹ï¡p}oÊIê^Î@y¹ý¡u^j= â![R001üX-#û§.Mûð-Ybé¤í¼>û#§(·YY
»ó"o»$F»­Q;ûwU 3\Xí$]¸]j­Òû"bõwòs<ò³^!eÝë~@ó.0óc»ýîe=Mrr6sø3uÓqDsâ^ÆÎtÀsówÈTzñ= Ö%ËL:|ÔL%qÁk#÷Net+¯v"c  c²¬<SÆjA¸S9mrCÎ8llæ¤7¶o¶WÖkÖ´|´ý´UvÞ´6±ÿP ,Å÷Tw_}$(6!t6_1Â)V2Vsî8ìR#d²{,X1XvÔ^A?= /= úz¥b·EAðº¼ÿÄÿGtëîO¶£-pd¤Ò²Læoæóòé!%Ûö:Òã9ØÑK|º)2	ÑÔÐ= kº·#­¥Û´I?1~[é¦³§ã¢µ¨å3¸¦Ýßì+¾ï§PWv½¦:'=}§= D<at)·ÀEÊÂEG_h,ì|hhúÍ}#Dü	-6vËýTÆ²Ð0 ÏÉÕLñ6E6Nø"Þ´V¿7.Yg9hQ-±Ä­e»hÓ¾ºgÕ0ëb³\IE:B}¥î8¹CÝi+ !ßY{.ÙýgqîEY<(uô£~T  k@¢¸¨è³¯Ù[ÐAæò5£læ=M5r|ýUrS¬¯'=}xzçhØ¢ØºD!ØÃÂ*
6@{ÄLM³J­rÈúçÓcúîe:$ÔFÉ0üÿo¤rMa"«<7ÒiBrúÚÓ</Fû·©/^nÒïBs^úÞÒ<ü²¬E)¬)ûîeÊ$ô¢Ò:}þÉ´¸±×©°"»Â)'-áþ]å/ýLLÚl8ýùïÿÏæ¶ûúQÍÒÃJ¹M+uBõþÌaçdW9"átS$5¼¾<Ë<©Âjbõ¼õCo3êzQ&()ò¹ÝIÔër.£.­¬+Ú?éTF4ú= w®x5¹5É Sq6ê"-õON ê6¿¡?=}d4Ø|{Ü¨,¾·Iä$Q¯½ßê©)µéC>M÷WèzB¾=MIIjFG¼GChóIf>e.ÌÅÔ_¼g¼©NÎrvíôUpis9Þ;@ÔäT§;¦)ww¬ 5 ¾ Ë ©tjé
bòqCU;+è¼_ÐgÐ);hp§ þªãm£ÀÛD®A­=MÚ¹B­ò¾ÄUE3uP³>xÚÁÛÄKÿûhíh¹XØÃÀJÀ¹PÙ=Mc®ÃøóÝúv?ÄópÔ8
}½xn# w8¡¬^Iéí]³¤dÿ"kæyW7X@Ð¢òT·=}R·¯^LÓÑ]²b×!Àk&zç·'è¢AU·½UçÎýkÎÕäê¥³| «¢=M_	®'1³A 8i8þ±¾oqÊä«¶×ØO±Ji±)}±g«Véß\ÂÑh	¿oOäçy¬Iâk0Sp¹=}+~!µ> ÁE+WÈîþt¿BMfÄàÅÚÃ
¼8 ~
5ÄtÀ;¹üÆü¼ý¬LtjþcÃ>oÿ±Õ<BdY)K"â6×5ÜÝAêÚ¢2¢,;Ó9e9ÄN¯#:ËÎíô¹
ó;¥;g«]¬'K¹qÆ~Ö?èøÐÌf1¾àÆuF<a¨f·ì)èÃí<ë£äîãsáÏ¨þáZ´_ä¿ÇÁ«cHÉ¯þ­|
§=M¹ê½=MüÈ5æXÇJÆ³ç®ÆWÅöKob£±§¹þ½ü ÈX2OÇVÆ®Ç§VÅü^7)a±Ýi}zÝÇ+!UE{E}eT¹ØDÈó#ijI.Êiâ¡ã3Ò½Q¡ë=M*õÜ Ú¢mSn^UefW"ºbE;ò~a÷)ßzlÊÜßcÕØØ»õÌ¡>%î¸½Ì¯Ú¤ÑEÍlDÁb×B7BRçËWIÄêËw êàõÊ=}Ü¨©-Ú8)%µW&î$óe= 8u$Æ¯9¥Ê""c¸QTàEVTÒ§§nÆ^UÁ0TKNj[. óG=M ÈÀ¹qZË|5£Y
ì½öa~ÿx+nhtè¨mÞ¿ò²$_Æx³w>S ::Î6-v¯>âGSq	¬9°C|Å³)Ó ù"]4ó3p1jZãÛÒJFÕØÚVÕüáÂÇ¿âTD_@WH"Þ9*½Ô¸\QEþdë ¿$ä7DHø!Ö±¬±ÿ°çÀ/x¤(á%J#ä÷£p¹3óÕp°v0¶ïMD®®²-ÇZ°og"©ò£&r}Û{/&ÆcT7_'óÈn» ~þ BÄ(\ »HÈ8áÂÀ ÔøcE7®»¡´HAÄ&\Úº»R²¼ÐWýÆ/
\ïº;GCpÅìÎàmà¾÷¶ wvµ:0C±öÉEÐÿGÄ~z:ÙÉÉJ{tß	§· ÝlD}ÛÿÌÇHþ°'ëÀRÐ»½1Þ¨&	çn7LëÈÌ`});

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

  function Decoder(options = {}) {
    // static properties
    if (!Decoder.errors) {
      // prettier-ignore
      Object.defineProperties(Decoder, {
        errors: {
          value: new Map([
            [-1, "@wasm-audio-decoders/flac: Too many input buffers"],
            [1,  "FLAC__STREAM_DECODER_SEARCH_FOR_METADATA: The decoder is ready to search for metadata."],
            [2,  "FLAC__STREAM_DECODER_READ_METADATA: The decoder is ready to or is in the process of reading metadata."],
            [3,  "FLAC__STREAM_DECODER_SEARCH_FOR_FRAME_SYNC: The decoder is ready to or is in the process of searching for the frame sync code."],
            [4,  "FLAC__STREAM_DECODER_READ_FRAME: The decoder is ready to or is in the process of reading a frame."],
            [5,  "FLAC__STREAM_DECODER_END_OF_STREAM: The decoder has reached the end of the stream."],
            [6,  "FLAC__STREAM_DECODER_OGG_ERROR: An error occurred in the underlying Ogg layer."],
            [7,  "FLAC__STREAM_DECODER_SEEK_ERROR: An error occurred while seeking. The decoder must be flushed with FLAC__stream_decoder_flush() or reset with FLAC__stream_decoder_reset() before decoding can continue."],
            [8,  "FLAC__STREAM_DECODER_ABORTED: The decoder was aborted by the read or write callback."],
            [9,  "FLAC__STREAM_DECODER_MEMORY_ALLOCATION_ERROR: An error occurred allocating memory. The decoder is in an invalid state and can no longer be used."],
            [10, "FLAC__STREAM_DECODER_UNINITIALIZED: The decoder is in the uninitialized state; one of the FLAC__stream_decoder_init_*() functions must be called before samples can be processed."],
          ]),
        },
      });
    }

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

          this._decoder = this._common.wasm._create_decoder(
            this._channels.ptr,
            this._sampleRate.ptr,
            this._bitsPerSample.ptr,
            this._samplesDecoded.ptr,
            this._outputBufferPtr.ptr,
            this._outputBufferLen.ptr
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

      const error = this._common.wasm._decode_frame(
        this._decoder,
        input.ptr,
        input.len
      );

      if (error) {
        console.error(
          "libflac " +
            error +
            " " +
            (Decoder.errors.get(error) || "Unknown Error")
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

  class DecoderState {
    constructor(instance) {
      this._instance = instance;

      this._decoderOperations = [];
      this._decoded = [];
      this._channelsDecoded = 0;
      this._totalSamples = 0;
    }

    get decoded() {
      return this._instance.ready
        .then(() => Promise.all(this._decoderOperations))
        .then(() => [
          this._decoded,
          this._channelsDecoded,
          this._totalSamples,
          this._sampleRate,
          this._bitDepth,
        ]);
    }

    async _instantiateDecoder() {
      this._instance._decoder = new this._instance._decoderClass();
      this._instance._ready = this._instance._decoder.ready;
    }

    async _sendToDecoder(frames) {
      const { channelData, samplesDecoded, sampleRate, bitDepth } =
        await this._instance._decoder.decodeFrames(frames);

      this._decoded.push(channelData);
      this._totalSamples += samplesDecoded;
      this._sampleRate = sampleRate;
      this._channelsDecoded = channelData.length;
      this._bitDepth = bitDepth;
    }

    async _decode(frames) {
      if (frames) {
        if (!this._instance._decoder && frames.length) this._instantiateDecoder();

        await this._instance.ready;

        this._decoderOperations.push(this._sendToDecoder(frames));
      }
    }
  }

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
      this._decoderClass = Decoder;

      this._init();
    }

    _init() {
      if (this._decoder) this._decoder.free();
      this._decoder = null;
      this._ready = Promise.resolve();

      this._codecParser = new CodecParser("audio/flac", {
        onCodec: this._onCodec,
        enableFrameCRC32: false,
      });
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this._init();
    }

    free() {
      this._init();
    }

    async _decodeFrames(flacFrames, decoderState) {
      decoderState._decode(flacFrames);

      return decoderState.decoded;
    }

    async _flush(decoderState) {
      const frames = [...this._codecParser.flush()].map((f) => f.data);

      decoderState._decode(frames);

      const decoded = await decoderState.decoded;
      this._init();

      return decoded;
    }

    async _decode(flacData, decoderState) {
      return this._decodeFrames(
        [...this._codecParser.parseChunk(flacData)].map((f) => f.data),
        decoderState
      );
    }

    async decode(flacData) {
      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        ...(await this._decode(flacData, new DecoderState(this)))
      );
    }

    async flush() {
      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        ...(await this._flush(new DecoderState(this)))
      );
    }

    async decodeFile(flacData) {
      const decoderState = new DecoderState(this);

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        ...(await this._decode(flacData, decoderState).then(() =>
          this._flush(decoderState)
        ))
      );
    }

    async decodeFrames(flacFrames) {
      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        ...(await this._decodeFrames(flacFrames, new DecoderState(this)))
      );
    }
  }

  class DecoderWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "flac-decoder", Decoder, EmscriptenWASM);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  class FLACDecoderWebWorker extends FLACDecoder {
    constructor(options) {
      super(options);

      this._decoderClass = DecoderWorker;
    }

    async free() {
      super.free();
    }
  }

  exports.FLACDecoder = FLACDecoder;
  exports.FLACDecoderWebWorker = FLACDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
