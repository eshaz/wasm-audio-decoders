(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["flac-decoder"] = {}, global.Worker));
})(this, (function (exports, NodeWorker) { 'use strict';

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

  const getWorker = () => globalThis.Worker || NodeWorker;

  class WASMAudioDecoderWorker extends getWorker() {
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
              transferList = messagePayload.channelData
                ? messagePayload.channelData.map((channel) => channel.buffer)
                : [];
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

  const assignNames = (Class, name) => {
    Object.defineProperty(Class, "name", { value: name });
  };

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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0092>èWQ¶Û£ [$ÉgOeê«1:¬U/pWñ@Mq=}T0>àÏUÀÊévU		½¬ñøáÅÚ×ö
#+/n)Å£a=M  uÚ{]uª1rÎ:öãd°±Ê¶WJÆï+èÑü"Ú ¨îÀ;1Ùtqy9Ô<z£À¶¢B¤¶BÚºÙU= ¢¼ß9wÆ¦¼@}4öp$¿»é
vaÞ,<?×ÔôÊQÜ»¯v0 Ò÷Og'»åv8Ìb~zUN!vUº=}¸éçuÚ3ÉÀ2[s½8Bàu
7ôïç®yBÚÍ­µå%Sé4[;"ë©êþ/Öo~S.q{òe&øÍ9f6SýÎ8gÊ,p«[ÆlÇ=Mm¦LdÔ&_pkÈ*ÖÅ¯ÌU¿7ª ÉÁqºwÄ{yÖ-÷dÖëÈ*×+´\§å#ÕÎ
Õ= 0cöEeÚ6è©ÖÔ¯éßáõ÷ &øÄnk
/þüóÏi´0ÃÄ2ÔV÷ÅLÞ÷,¯ûÐ#ôàÀ¾ãû´óIÒ8Ïô/¹ª2ÑåkÖ P´îØûJS£3÷eèîä¡ê©ìit¼^Z=M* _ÛÏ)ÌãuKµ];e Uv7Wâ8Ò ²àf.kÆËôóBA+RgëàBÚ\Ì9­äsùv?änt ÍõjÂFÍ|_ß¡pÂ7Ï= ®Âúìù[]aÄ_p8eªÈ©5²òyå¹;è^äQrÔWy±@»-rAMê;ûp¨6ªwJ2J=}@-¤= >ÀMäØ¦o=M=MC\i,óÅ@Lìëé I'®ÉCï¹úçå=MªÄ-8HMÆö.fMÂ?BÊ¡Ë>|ã²iÎÎ=}ß´?ê»=Mí¹µx7rßAV2eç)d?J°DL¿­½ãP	æp@3½à;J÷IN]m9¦Þ0ökG7Jo8Nþ8Ö»Õ½;Æ'¹Åÿ¥h!}ù¡C¡~;Þ¦¹Ñ¾w,w~Xªiµ­\[[¶·íxë¸¢¶Ú¬_Égö	ÄX
æ÷¸®¬éÜ&%w~Ïë²XC\söKLWwê«ãiÌ×¨TÒ¤ÊÕNÑ[ÊËÔ>kµ«g+uêùG%7s7s@Þ= aö([VÊ= ( yÁKïÝ qå¦P¨	?	Ì®¿WWk©~äLê	÷Ä]6= [_^ïr	ÌRýfçëØé -ßøL)8Ûq<¶kUs-^«G¸¹&ÝÂÆwòÞ åØ7i²CÙäRÛõ&Í2Jl	S=}\Ãd2^7µµ]õ&JÂÝn²¸2,JïËxDÁÈ©]nsK®= nUxB^ÏüÀ!\nuxJ^ÏûÀá\n·K¶á1]eu|= .ôs7å<yªÄ3	ÍÔyÜõJx¶jB°Nµ+Êà-«.ò©¹àCá_$=}b0unZJût^½Ê~	k±Ãûi{xß"ÀpÃ?0*vVy)^û-Rl}b×Jë9²|lòZB^Q]0<píí;hîHýoîùn-8/}}\9H'¥ÏyäkCc:Ôë{;&ü¾¬f_ t´&<;ædYè2êýÍ]CoÛ
&ÃÌû= t¸= ?)ëj­ÿR>B§ò1I.
Å»uùF_0Å1ÊyùÒÁCLô|Â¸0$õ#²d×AJU«Âòbx¦§16ÜÐÙÖYd~àI]Ì0ç¯w÷èSO/NýÞ¹7=}=}	1ñÉ÷£é{«n?þ>k\Ø±IÑgá[¢=}M>VÇè¬ÕM5I¼ôÆO?v±nÛbéêKu=MqU!¢¹	+ï\§7½PUéQÕ"Mn¼î£î³@
}!HvI	ëcõ2
áoZª¢1yÊpBBó¨}?vÒ¦=}góx|}Ày·Ì|oö+++«U^Æªøøøøæ'~ ®¸ºg|f«ÖÂ;ÊpÆ
=}g\z^¢²ñçÞË"×êwÈÄµW³nâø&:= ã££ 7FfBÒ¡C²r2ÿ¾pÙ= Å,£¾U^ª¢Øâ æq+HÈÍZûLÏ³bäwóX4®ÚðnË¤¹Ã'i!fVCºaDÆuS¨ê2øA4I]=Mÿ×ÖãÆ÷>Ï«2UÇ¥ËÅ{,ÛâÙáóæ¼ìpìSRÆ÷ò Éhã ,Æ |t±´,y4¸Äyä*"r§1>éöá^Ë±¿Bêräíåè¸sv|ú¢ÊcPÐå½ =}×s®EwP­:<¹ÚÇ"<]8íÐq sÇmµ¬ Ò[¾£PUÖ±ö ¨¤b,Ö]Á9éjúZÆ= = þk7íÔC³/D%oÊÈgÂWÃzÂÓ<ihzIÀ©ääÇ»ø]vé\ÿ<Xt¥EõÃoB:)½$¶¦ôÙëR¬{ÝLâî¦RÏæµW6$LÐpÂ¢'µ2ë%ðÕd­(-¼óixé½3*§¯ #>î-§>º{½þJIýØNÝô+âÍÝ27m Ö@UGÁA»IWk¯tðáoq÷¯YoPx¼çªQ
pîÇsY©e	Pü(TtÈy÷ç¹uïº½JR×½JPù¢Q0gpáSKêÄòÃ¾Óî øºb¥§xh'Ï_ýÀd1Gf	}j¿Óßå»ÜåË4ª)R^ÆÆã®¦±òT°¯=M´. þ¯ýâZàlÍÃ*Ú¡$tÑÆú;¾uù]¯?\,¬Rçúª)%eRÛ§ÌÑð=M»b0=Mæô8çaIÌÓ­q~Ôu¬bÖñz}^l¹x~hõ5pOð6nLÈÁWðÓØBn¦+$ê~ÕüµËNPCÒËñçÓcTOJy/ÏÖ*æß/5FÕxPæDµÍhaPIIq-{+¶gO0öý?bBx -'È¤ó·¾BRT Ï®_!¹µû¦Nëj¶ÄZµÅTÜÒC©ªô½Ó¢ÓþªòÛâ$¾ ¤¨Ä¶HÉyÍ9 mÏá5'FHVNíç9|fË9àç/Ìe¢®kçÔ	+§ìóº54)(8ÖðÍ§èéÌ+'ô³¹)Sl_"T¬Ú:|¤%ò0×gW,°>4âh¡ì(sæ[ð· <e»*úÂSTÚÐÏÃúÃzèCªtrõb!Ó%!âúuõbF´itõzóß@UÖË¿ ¥¿ %r\Oü[ód¥êwî2.Õ¶ßâyü#òïÌ=}x@´µ@´ñ02\Tz×2& ³Aâq¹$.£[+g$Å´ËEÜ¥Û= [á¼& SÐk:t0òWÉ?ø#Ôç/=}Eié;Iv%ÿ7q¥hý<-é&ü£m<Æ3æ&é+í¢°IZ¨îîB¢Ûcû/ Vê¬ó·b×Ò#oA-ÏÍH	CCÌíÙ@1¤ítl~ð§óÀõv´<Ðâ{LJ7TýÞÁ$2 z £ÏAvÎÅcÞÁh&xEË¯Ä÷÷án^= £FùáÜ(\úãþa×<ûæg#>GÊ
OÙázc5ÅÜ¾ %þ¾Ì.öÀÓnÌOÙKöKÓ²×Õ±(M[Hvï{«c<Ó®#Ø&@BþçNþçók<ök<µÊO%Ìù|U1uõ§¿£,*·)$êÄ@â=M7øÅ ´n´««Sù÷ñ¶hÕÍA¦A=M0~æN[;z×H ¬Aõêi÷fx[Ü¢<íÕ:ö÷?vß ·N"c¿ÆÓ°µ~òk¤ð~XvûW3¡$öå¶ý<}ü'ø«mì+Ýõ°0ÛQ¼©&×7-ÊÁ_7­Áíùú%cDV
:v>ªg^¡¥YðPptHØa¦ùd3º&ûM8dâá¡E ,7¬FÚç;fÏÀ.÷L;Tä·0Ìo!øf´ÿÅQãDä¤6x= #sD"ã&HÕ±æpÕ>¼²»Z$Y^3ÔgÒÚ= ¿>×Ã!.¤ÖÜ¢;Ï°+G´ôDºm²Þ, YzÁJøÿå¹ÏXB³Àã+à7ÕÔòèï;Ëÿ	n £»¤±¾Ðlhã1ÁgÉ ]qT:NçÑÂLd%¶*5LJrB-ÀËU§y"JQkæ©båR/;P±µæ¢kÝÞ÷Þ§ÍWôÜ~µl!l=}>CñzÆ¦ûÞ$£EËFèl°ýÅ= ðý]IF
rdæ'¢V±(äWÓ¬\¢=M«¿bë§SÅ·{+ª´cT0ç6SÞV\­¤ü ÚºÄ¶fÉ½¿ ü×2¬bwÿ°kEä³ÜV"ìlµóÊLk0ç?ö%tÉ´K5EëEçÎ% Ú8PÞÒ¨6ë¦6Ó_Ã=}W=MÃi4þ=}[Æø·nÃºU0Vµêdá½ê÷ôºÃtê÷|bµÿAàlÈAëBnP¦¾±} yI¶MÔrH£Jï·(w¨Áì økÅÞøÛrC.m»û-AãÂñW(D®ùÓBòc£D	?|p ãsmm_¦eÙ:A[ø[G~\îo(\û
]¢NßòÈÊ©^ÃY²m8¬üÂ=UySOæ1pjw=M,m= ã?Ö³hT#¼öâ¸Ðv4qÉ×!ã¤×6¨r0-¿8ï}ÞU><ñksSE§fuoÿ*Æ';19_E\ {ìD~ûÆÛ¬|¥ nZÏiâdyo}=MÍÅ93e72¹;q3æ<'¯TþÀÁ²?'=}9Ö<}HâËÓä«Ø¥å~7/koã´Üb£ÊÎAS\Jjö@Ù:ÞD²ôÅ¥¸c´#òÍ©M!1§$ÏÜd%qvÚdýP%Y­f¾C8Q±³µ;¿ãd883uïßË_¾ÒËßÓÆõ:"ÆÆ¾fI¼ìÿîêËY=}m$7<£B/PçZ-y:ñmø[Õ´¨Gã0îöwwgºQ¼3]½âÐBw¿&éè5¬2>áóú~ô7f PÉéµLpîÓ}Õ=}ú:	è5ïÔj¼&!GâPG¬wIÊz¤\¹è34\ÝºËz®÷~tfEÃFÐ/C/ìOYO3Ø5!{Ñ
Ësgëßb_Ä?[@²À»F¤°üùKUZ¹s'fÂE2)4W´5á/,N'ç±¾ºÿàqy³/r¨}Þ×VÎÄ)ì­O?Ë¹åìàÁI»P¥ªOÇ8WR8jÀxÔcaÜe.CÃL>*!zgÀu,Y|üà»î¯:H×DM <x9}°#õ½wë Hb=M¢É¾ðÿï3\ãk1=}PÝÐ}Ó´Xð/&K}%KX×=}3íãöªê[l	«ãuä>}Í|Ç©(Ù|JHÞïtúGËÈ´½,olqß÷¥Ö¥u}úd*û1KéàÆQþð¡o#ÅT¸óüùo¬Á¶õÉ@ó¼@ç­Ú»¡Ç#ìÃûÿfc¥Õè»<Ï+§éäeÙ:½³Ïãù®O
ðµ6
EÏSqYL²¹ZðbãÌ´)Ç¡ô%ü3®gþVHË?uË9ûh²ÞT6å¯ZØt®ÑË­pnjsëiZÉÜCú$þH¿æìçDÙ¯güP	Ìd,°¼aaMp°JïUOxzãÂÿGfÅ/}A%O¤ÏTsUwãÜ°'(¯"¹#7q>÷ÀmÏòË$®ûZ@iÊ1ºñ Uzóðí 2íwÌÂµ)e2Öô+¥øô¯p Eçxz;­$rï¼Úk]&<&åæªÁÈ§ÇH5NùçHôÏ)ïKÄÙ_Ê¤TüÓoB0ÍÚÅrÛ¯çäDaØTZõ.R^ÈÂ3D0àîsä#Õ!Üÿänö¬ËòVb«âÍTSQ2Ô&m-z0~?nD¹t94~ºnùÀT¼íàÛ\ ìÌ çÙU3n«2+}3¬âé²ïs#g ½ôV"E3zÂ (~Íml¬Q^3Yã¿½J¦*[ÚsÉÚÅ«Oírhû¶$ÀØn3µvþ4¡VGd]ÀNãgq{ã.¬?´ü¤à[a1yþ(EG..Ã o÷GÖ/Â6Ùç#fø4MQNáCÀkzbÄ¤fÔz,ÅÄn-PPð:AÑA!Ò|c³gÚVo¼öfK+>M;.yGRSPÉK8~­´ÍvG2.&«ã(@(6«ií·R=}|lkÕônùÚëi³Ø>¼(cN.×¸®£ÚÕ¡= ÊØ4Æüë4ÈþÚÅº£Ó'Cf½èEùHñý³hë|êkN·æú_%(ûhCÝÆ*}¡çz¾G_ÐÔó«Eªf!R<aKbFÀöü";×]Ò<;»NÎ= ÆÄw<æåç!#2)¢K¢^ºûÁ£]ü{E8ÀÀ0Á?ñtDÐw/  ÕÐPxuÙ!n	ÚÎ&®Yÿq·ëVa]ª¬= ÊsJèâkÒVæ½© Ì=}Ñ´q§\,+ÞeEkp?iz®y´®
¾NËèñwçz-N/«ü·°øÏ°qz=MI38Ã| Å?hQÄæ"í	|ÌxãöÖÊ÷ÖtEg}çüãê ?+þ2~/Í2¸¼.ÓùÎÀ#Ðì«ÝRPzËØ±ãf"0n¶Ïñ# bû=}òÇòËí4¼fpÀ¼«Ä¨h+£6Y7fßzÅ<AcïÓ¶#íÑmé0ãq¾*ë@´NÈ/ +ÙæyØÚ±'NÑv¯r#Jìº'ýWóÊ0Ç¦®j«Ë1<#X9oA¡'ÑÊÝïHñW³v7÷Õ¹kAX&«ût\¼ßE·ÉÀØ'ÓÂñm3öð¸bAÊ[+ó¶fïp[ß¢æuá$Ñl	k>4>§XhÇl­·kò,à%û±è§7VË4!:µoüâxiyJon@éîxOÉdOH^·¡¡-üÝÈ:8÷a6®rå&ËÐËV¹»jÄWÙxß Õ­Föôg²7ÚQ¶¦«È#.´¥»ºÄú´¥ößöcJþó3xG ùß¤0þ?1.>ß
h¸ÎUjþÙ¶¥0T}{¤íÞp8¢&Ó³º©ÀSÖÑïã= ^·ª¤oÄÒÉjÌ^ë!ÜhùÀvëyÎÊa¦sfûËÁmXÃ=MîÞ» µ&âÚËUçÍ]K¾ Áv£tîBóòêa&=}Î¼+Ãª(Äõ¸*Ã. 
àÙñzzÌÿÌj Ñi¢þS²jÈ%K9ZôlB4.ø¬æm¦ rÚwÙ*U1ü9}¼Ö*O¸ô7åÚ6¹/Ô´=}2ß¶-Z¡= Gàõu%Ò
h¸nÙþz¦²ÎÒ
¨A·È*N[Ù	Í×= k¡¯n»¤ëh-*ÊaÊBþ©'#çÕfÑ(J$
dVGV¸ ¶ðÆ½Û¥!·ÐÿtÏÇÈ)ÆøÄ1¼+[êæ[:äÇýî_zõ­=}}XêC"Û	Ä+òó)45ÍÞH}CP0V ×c>"¯~IÖ~Ig¶	YFóÀÛ0&1-%ÿkï=MÿZGãà²>â6ý@wUÞ~;³î !3¶P!
tuhY±tê%m½RSUU>çvã8«·^v+9^\Ôël°$¾å Èó°nr¶%È
rSyÿºfBh­M80H@fþ2ÿ= 4§#º£¡äbê­ÿòÏÈ=Mà£«^+UÁZ2»*F lS#E¢Pÿó¾l%¾bE,ÍÖljÒápÑâKP:m\J\·¶º)Vz¼énãÀrÝP?îÓ\§RÎ"gè@Ò*y¯w¤Â¹¯w¤õÈIxÎK÷wÄ0H@fþ2ÿ= ôD:îx²wÌåzÚòÄªTÙK[âdÀÊÿ©n,½)íäÀoç@À	F{C0î÷?Ç¤?¾Î(ÙõuÄ¨¸ÔVÙ(:86$Ù{FFN×RÄ{nû£ÆéÊ¹ÙMécÈïÚß¨ä¥1,Á6xÉ±Ït\7ôÀhñ;P/×H	l]&û*ûÄUE¶JÏ­êG÷±!\¼¬î¸7ÎªUnûµujq3GÅÉF¯ØÓXÙ¾ÐüÕÚj{^?ø §Jç1NÃ.-Êýo¸Xiÿt6Ã,JÅ¯fV+ R»Â¿Ä¿ßo÷¬ßd÷Lý®8MhZü8ËÈµ®Y:¾ÁsG%}1óa=}ÌR;²Ór´Ý+¤8åyj%Å@A4{®æ¾9ðÙÅÐ$L¿µ6²3DÚ¦L7a9ÜäbÊÃ/¸ætÄe·®Ì´Ì»3u¹4u¤lÏ£ÜZ/.8¹4;¥ã³39ç>Õï	³iåjT£±ÛÅk(°?÷@:/þ6Ê«Kú% º¼ô·1:5Y¢¼hiÄíñÕÜ¹B¡¦í7\|=}¡Ôh&ü6jCXY7Nåyºµäàè£åZAëÆÙÆ±#ÕÊ2=}$}]s
|wäÊàÁÜ«Æ«ü©[ßÑRdO^a2?½v'03ãÊ(¤ÒÈ\X²ì×æZûÓ!ZÚ;¾îÄx¨«Ë-MDÝÝ¸ShX·©â»»Ræ2&^ËË LÉÏWäWNzÒÑ*Z{Á>.D£43¦ËGâÝÜ#XM9{ôïá°yUün²Câ0CS9TZâ³Ì»7´w<Ò5u¯Ëàë!ª½kQÃ¼såÁ1tUIÔ:T|<[åáú¾R»úKWh¥©I';auç«T;¶ku¯'S+_\ñ7³ÉÓCwæ×Ä´¶¤dYåäË'þEm·ÞÇãVùÖvÒ|äÛù	­^(£BmPËÁüêÓ%=MtÍ9T¦4C#5ù*ß{áµE´ÍãÄãÆ·tÐÜJ^­?³¬ÙmÎ|çMÅÙ8>a#OAÛÏ½YÓê¯ÒÆÙVÜ¹ºÖy·ì²äZ½Ü Céä±H12/'öm¦%Å5ÿ©O¬õÄhi/ \®¯®Ò¬c¹VV¢Æô±f£ö ÈöE©µüp$¿ÙöRj|Åý)Û¯¢ÿ"ÇËDà Á¤)ò¡Ø,£¾Øqàüp?Þ¶k©JíOØLñNél¥Á)yÝEøQ¯=}*àVuÙ/¦Ë]vªL¦­ºÔT]Q±ãäÇ£ÙÜ$¤Ä.Í_Êì}Ôq=}fë=}. ¹·Àù®ßaòã_Î|Î
èQ'¦Nøù(UÒG}¤ö+\9"¡çq²J£_|¡4â|2Þ£ãh|&«%»HâCc5ª¶ÅR1¦éEÄãÊ]$'!#á¾1ÇÝ= Ôîäÿ-Ö+8>PTdÜðwÄwYG5iGP¤qb&JdÁ³ ý¦³àª>¦äÐ¤à163²f!,ôÊÔÂ>®¿¢wl§Â5¶5#[Çsµ."mK\åYÛÊ6ï£*Ú-ýG#ýæ¶|ÿÛ+PZÄ¾å³9·¿âýÊÎ´|-|¼È:·D©Ø<áÚÊÍØuµÎUW9íùõSåb1¿HªF?eHJé1vEûHÊp½ôYWþCøá§Õ¹Y}ïñäHêkô}a¨ýÐí>íùÿHêãZú¦ù»øËÎNùª ñøà[kôxd1JÈ¥iøsVÇìë¿(Ð{¨Wwî	íô¤S6°êãóNf<{Ê
Õ­y·Ýæ¥´òÍ}=}"oÉac.tTrÈ\%=}â0þ3NN¬wé·\è32\ü&ñu¢2¯&°J'äMpî}¤?¡?43¨\që­®wõ=}âÐhÔhü&qt¢2Ýº1ê¨\AØKa³Ò)âÐO"Kd¶êÖîåZC½ËzøU5¬w&CxÂ@¡çÏjås&*äXÜ«¢Ý{é¿àcNÜÓ9wØâC^ñ­}zªñ¡¯¡ÈªËòÛö¿ÃõÃ©é[þØM}+Ðã!³®vbÔÊÐ5§¶+ß+_Bò}Æ^äíîGV»ÂÌí¬À¦[q0¹å~+¢%um§Ù¿¦
Ó¿(²J¦pNZ×ð|¦³J¦ðv'W´A¢îNÈÁCZ' #]PZ-´QEêv?à£Ý#aîï¾IZçñv/#	©Ni»Ô»ÙäÖl¸Tëº"x±ºïï¬Ðy´*s÷ôÃç@f¶BÊ©Ug¶È¾½'¥ýK®»1Æ¡õãëBÌÆ×{U9·õÌZp¸@-å¯?EOCÞSµ­«?Nã=}Äg)j'ÆR)Á5Á¶êHXÈ KNM{í­Y
ÄÛ8lYÛ»Ýûr,'³¨_= ;º×ÏKXkßÁÂ3a^ÕâsÊÓ<JÓð^|»u 9G}½Ü"PËZ>Æö3}þJÎn9MTû =}¸@°ïÊ	@Z¼áÑXúVºº
\ÈÍÔÜÖÚ'4Î"Lèþ
»¦¶ëÕLêàhÉxº^£Â<ß 6o´Y}Ä¤·Qn.yç= ¨èÜò&Kè+ÚÞ@ã¤À»_S»få«ü+¤iöÄ§=}×ÍIÀàFÑW·mLbdå±(ø´ú!ÇLÑ¬/ØºXýùÔ¾þè¢±hg5E¬}¿³Ï1ÅËÙb«=}ÓÕ÷D5Õ6d<¨\ð>i= Å"5Ç?zÑýµñ.1¹¨ûãÜØtÛ@tçÝl¹<¸ã³lNðè<F×´ÝÀÄ®V{âljJiádÓè¦×°8ªr:mÂ¥Úd\ÓTQÎVðÁÎCy"w¢MÌ&¹³ÁA:NÑa=M¼_ñ'Y³Ç/mË~zn^õ¬ETËPò3¨ 	§ÃD= 
©[AüÔøÖîØãì¨×Øk8µ|¡%«èºÊ0Lk#Ã#Dë?OlCNè¨?,íª÷v½tþg²Ç³þ'×½g[4 Ú÷ú)ácÄf°n¦6N<Ý:= {ÕF¦³^%ä6»ñ¼>ï;â<îÜwÂôúº°Tþ¢¼ðbÏR3¢*{¦_êÆ¶$ôwÔ~¼3ö%Í} ¼L¼ÓöÂ¿gïb¡­ú:óúÑÒÆâ:÷:bÑý2¬b*3â¡º©½à®<L¯i~â~¢F^W¥Üeù²VÄq9çt­ yMq»	xM&{ Ã=}Jø%Gä	Xå9Ã.L&ædTÊÌÍBoåäØ°·-¬GÄdÒV}ù2ôÒmpFÆß%+8[:S¶iÏBûÃüAþ¬^ÆØ_WÒÜK?2èä&Î2J7.nª\«û¾$²úÂtr_CRãhû mü mÆF*'°ÃÕÀ.½íÁÐÈnµ©ÓÁÏR;¶íû½Enè8oÔ:4û3AµÂ(e+Êÿqû}­Ð¸vgÈÜkH(ôð¥¶Ô)&^p0àm%¹²tSæk<¾Ï^©ËxK§FÙ±Ó-ÿòl­{ÚEÓQKÏ2âÕÊ!h7üèaN7h¶uxãåz¦1d)ºR=M%ólJÑ±¯T1«uáãQZ¨tgq8ÿa£Ü]!»EGDÙyÂþraÖ@°.Q×[Ë¤VulV± ¯W1{YU'1]\ÓøÒ8
Z¨!ëó= (àuÁ	»è=MGÙ
­ê¸Àb§ýT¼!?¬FïÓ¨ì¦¢/{a¤¦P@jù¹.uË¬bw¹Æ;ï«+:H x¦ò:ÊÎoÇá­àLoR|Áâf5ZÆ­05äZ ¿hÖ¸^Ä:È]n´ôPÕ±rðóµ´ì¬ºÊÑÿOëEÙ¯ô «% û"÷«!Wólÿo>a³þ¶­óþ{Ñt¶j¸äl:c+tóç½/{éÉ¼$Kv_Üõ6ÐÝóPÝ#üóê¼3¤dÉ_ÐO+õ"Éï?S%&æá|x¹E3O£øê8ÝBã+HøÃ= Aë?Q±#ô¼ªÂ=}apx]{>fËä_$IÂ¦=MDväÆ¤ßPÒ5ª¨9o	QL·§s3êÄöw Î¾9§!É)ÐéµL9m= ù=}/ØßÝvjòt¸y9/Çu7ÍAÂUíÚ{!ÆäzÑU¬
ÓdB·<£LfNW^©k¿ìèÒ0=}÷nTEâ ¡zÊ÷#{ÁzèÞñGýLÄôÂ¯[Kè6úÙ8ýÙm#uZ[¸ôê7)¾Õ:0¹Ò´¼¢R#4¯+= #ë0~ä$Ör´R
ÜßÃ|7¢ñíç¦=}~ø2°AK,ÕzáçMé¬GdÀWgj4~·Fî¯g4©n%wË°= OÓÔ\_½/V;à_mKF¬4Kw
|æ¶XëúY¯cæ6^¡¬Q3â¿ãº\ô×}fD@(ÍnÜga+¢uäc16I2é~Îët©nBðô÷¨¾åÚF<ØêÙ£?Òöº©Á¡®Isê ,Z_G¿/Cº GÁE6f_wY6g¥«zôíØ*WölÔ®>¢4ö<e§´6© C]p7Vÿg¥w@DX=}c:Øêi¼£
ºøKÈJê_Ê \ñD­i).OÒ	ta tvÕ*×ÍÔ)«"/ý^È³ùIëëe,y÷¦ 0'×/é.ó¨"^aIùâã/ö:¦ù3ªIÅ1½» rC6c õ[HË ÃT:<jÞUãÿ"5EPÍý{Ág©Â{[àZØ¯"PËZ>% Õ.y«\c¹4ÿs ö»Ö½©¹Ém®» Å3J¼%= ÚÑc&àRÄWR$[b¹è"3ë©;­ÈÄ×s3å°¯<u.ÅªwKçp8ã^Ù÷fjJÖ0Ìïáö^4T3ÍÓÔeÄl­Ð©Zäo)1=MXkl³>5K+eMa&	¤%	4ñn×Bxû·áÛ:@âsÀyÆb¨â"#.Ä[:Í«ajeZaòù\ªÐ_Å&$«<WvÅô¼¤ÆYÆ{¢Æ?ýwb±+U®"Õ= G ßÔc=Mã¨= +Æº¦IÒ9­ÈöÌ²"ëì[åNLç~ò"åYdWè0u;ÞíÇÎ?Pm£ÕAûM>ÂfÐÎÝ6ï®>7Ò´¶ú³]É-?T0}-£	y¤	G-= $£lÎym= ÀîZÕAtw ²I×v £QÒ:= (üló«½-\X%ªèDøuyôéE¥¡k°ÆÍVokSQa£áDbeiB]¸ÿ+»-8ý=MNxyP+t(8ðEjÚ÷lAq®¹Ñ¹åãåû|I ú;l¨~ûÆà	´!U+è/0²}= õº/É{¥îÚctøç®ÎÃ×ï.YãùÑ§é:Ã]kåÈ8S	MÐ9Ö¨¢A
åùÚCc?/³Wfç¯6f¨¡µ~ìÚ»íÚh][Û[Ì?_ ê¥ôüfìV\îÎuÄØñB! Û¢B!lË_Ôàcº÷»áü±ëgÈ#x¸#ãkÐd~ñ¥Å;ÅûZcÐ2¡Zäd!_À×±:ØH[âþ5= Â}¯"PËZ>ÿ«²ªÍæ-;°6¤/e²¦°¾ôÿ³¯Àiößé w)tÔiêç!\ÈUX5Wqæ: g	äËgWcµxÈIZ9Ú{Ü´»Ù#$L®Q;"1Y¥Ãå.J1Ù{¡¸¢Ë¡tYr~ÈRB @3_(CòÞo*Üµì>ÕVÌ©­r ðïÌ_OìÍEÐxÝ-G¤Ebô¶4ª	Ö#ã6wâÞÒ÷­ãÓWÌ·í @³LúÿíD\#ãëI±djòãvòÎ¹êYä2!ñæëÑÁÎëÆº¸×3xÁªµd´°=Mãã>·É2C+ET³Æý_s#!3ÎÏ_ùEÖ°ÑH5Z²¸áÊåº'P#[¹F[§MPÏ»5âT³×3.Õ,Ô¾¸®Ä¦,º7b¨¦®¬ãú-Õõú/Ôút®SY(å$ºÐ14nVùä sÅ¿Uù=}N¯±épa{kw¹5¤³)5CÝkËIðÿ~Í<úxXgLMPµ¬l9"mz-èÕI×ñå7 %P°5A@>ÍÜñçûÉ7è»	PûØt»c§Äô­VÚ »Ñ	ý!w¸dFÑïûäzÊÈÐßK(nåàV½T7é=MêN7-æO|§1µC>é¥yÐÃÃAÃíúL+ÝM©fg¥# Àd¿ÖL¥#æ6M·dï_N×I×ëq	ÏÉ´l´Ìx×fú|×VúUú¤Öí¢cÌ#l§#1¸ë£á´t[×Îù´t+
HÖ.ºqéê	BB ¹7,Òê}ðA ÔmÔmÔÍxfÿ|Vÿµ ²FãP²ÆO÷ú~]¹fÙZðâ¾½$ÝÖQ£ò³.9ïC®÷CÞcPµö0µ0aVEQk±!Ùw9Ç,êóÈ£øóH¢ø¹4¿åc(?À}-^ÃüÃÆôvÇr:©Sfr©S©SVòÏ2ÈOXwúWZdÖµÝÁÆE§= ¥ûîâ&%×HÈ*?4ÏW÷ÎõáZ%Ñv¨ÞÝëðúÆ½6¹ÔÀÿéÚmßL«k2Xª4äq°¥abLùú~«¬Gluùúê8]Ï¤õhjbÆOR4 ¾øòCo_>Â#øOæ,!awaþMIïáÇ´Ò&>f%Bûë®uª½ÈN"(VH)[Ì¾uäÉôE¾ÈZUßNIHû¢#ÿgü^7Ü»£Ã)Ûïx]"3×+®0%nû÷Ãð­¨mÿbÅ=MIcN³)I:ëH9+¢Ð,IÌ<yln"hÖFç½Ã'"M 0îäÃé3Ô ´®|¨3ÊÈ¶m£¯b5¦\­;¡wwYõGþõ	§ñlÛÈÙ¨Â%Å= #¨Å´ËU$¥Zê[#Û >¿í"<Óü\6-"Y{'¯$»Æ4Ûbs¤3;Ú£<(Fû^d åîEþâ4~xÖ¡w?ak°ÃúªA{cvbJê­þ"¸0j¹«ñ±6lûÝ¯>uù]0ùã%)al2­3ãÏoªÒïb¡zíïbÀz©ÏPh²Plï2AÓ¦ÒáÓb¥ïbMê©àÏfO¯Ò9L2åÅ¡22»DËkÒý²=}æñÏ ³2ÐpÖszÏß)5Mß-5mßffÇc¿  Çc»Ù9ßTcÛ¥¿ÊìÆc.5¥ßÊ,Æã]ãmÖ5x9D:¾ÁpUf';Ý³ýp[üh>M;Wp»9bUdX¨2»¡{Äº&òQP¼=}5Áshx­UÙÿ¤)ÍIp¡zk mmlÎvX\ðv.3ð@sX	Ð^w= ÎüdQ®&GÓ±bÀzLL°ÒïbGè©ð5¹Ppï2AÓbéM2Éz½ïbw<Ç0zð 2YL2©z3ÀzÌgÏ±Ò¡ÓÉ4;OzP72uÝ§Ò¾GéÀGéÿÁGéKÀzf^ÕHL"%ß+û©NÞL"oä³@vïZF¶ïÚcÒþ©$Æ":*7ßÕIuçÎ°n~¾ùªÂtVÀTUÆ n^ár= ñ@E"*¸zõ]MÛ\ï ù+&ÑaFN1?JykÀWùIÎPJøsos¼Nt= ß@JuaÏÑh§¦²U§"YsMûÇNt(8ÜAJ13?^§	É÷AJï:Üñ	ã²=}f§	¹jñOQT UáçXnå4:¡Õf­ÔZ ¶«¯Ô1/^¡±z×øFî1âTT.Ò*¶Ôè cì¤-'¼¬¬KTi)´xh31LXÿ´EÄþk¿/ÃÔ 3öDª7Ê­ÄOÌ  J¬SN­ÓÓÐ+ðR¹i£,[ï!±[´%t'Cç°.£(Ð,%sùNg¨îöùrµÀ×å>¨4ózµ"ßÕkí :ç^o¯¡ò÷Ò(eÔ÷)Ê­Å7ÔÑÚR²?}d'ã= Ô$ÂÿcúM¦[?h»ác$¡^¡^= »dÞ£i½g¼9yÁF^K=}^GUà)	ÎïíMá7NFy¼í6=Mã,{L%,J4(Ó8Óüsÿò¡÷<­	aü[=}X'ëQ÷·'±revó»d%Çm%i6ÇvbÀzÙ©ó	ÓÑ2Ó±bÉL2z}ïbì©ü©¿PdãÏgO©ÒáÓbõïbÍâ©/|à_ÎvÀv8^[ÀvöH±áòDT¹á¤B@Ù0¸L]co¸L_c¸|Ê|,z¨ÙI,z&5e¸Ìsz6¨®¿,ú= cN¸®ß,:w:ÿ4c^ái%¹}i_'Ep$Éý1¶Wâä±®¹ºxI]âÂeý_o½¯ðçX«°JÀZ÷ö4ÕÕ¥0¾x)ðÕÀ´ÖÄÝë,$¸Ñ²<ÂìPÎb<A6\H¨ñFsNFw)º@f®î¡q'Ua.-E°ü)3Ò:K«&òè@vìÐr½)ÓF=}Ó@¡JQ#K½¨AÄ0«<îI,cd«®ÆÖî@$ > 	 DZ ;ÎeéÊÁeÌEÉÑBÿsI ¡Ì$ìýôÙ
,ÞIæ³H¼Ë¤\*#r6èå>²0$PFTãVÍ°Yçq³0»c>Ý¢;fÊwqÑQZQ¥Ýý^ø}³¥zö
\ãß1þâ3Í°î
zDsAÃ¯+¦àâêÇçIB|hn©¸TÁ*È9Ô8>FÖ'%©D8z%» .üsr!ö .Péß5Z´"¨bÑÿ¼ô·§=M¤saÔ((÷¼)g|»óô/³ ìFµt}a[jbï3hÔ2s\ÓÙûê%@ t/?JF¿³ÐbJ¬l=M³,ÆÍâK=}-@7À' ñYÇ#Hëª=M¢J¡i·~£ÕÝ½Jò./"Ù{ÙiÖyªnð¨{k|ûúÎÛoiaÂ=}·³§_aß2çÏwbeÌþú?¾Ü60ìrá2YqRäùû0÷|>N<
)$PÛkNsï)§ìÓb7Zï°î~ãÁrR@Y!6ù#F$í§!*í£½N¹f8*ÒÜ³ùÇèTLÓ­Ç^§xQàímz>Ö¬0WHEÊ'<oB+¯Ä¸«ª>Õï_gÁ£á;­ÏØ±³|¸zýÝoûq^òàÄÅ£¦)w13Î[1m[û÷ÏÕ£ÒAæù<ÍQ\+pX=}&"CÅ¯\0äÞ¼[ãâ$öí©Ö$Ýº ¼Îó å^ú)ÔÕ Ë7®,´oZJñ?{IÈoïAiÙr¥^¬7óûÎ0 = þä®QQRÚávúÉYv E¼F@R'ÊX(!ø+JîÓµÝ %Te6C½ûÑ )úèàD:Þ]:ªpÅà/øØËL½ºð½*¼×øûÓWÂðä&5YõfÕ/=M¤»çªP6ÇÑ©¢;¾ÞZè]ÓÛkìñy*Æ heE­ÊTê³´¨xj6dþoÿ0A=}/9ºª%~§=}xJ±ë²3?lëbOC«+AÕ÷TrwìVvõËYÖý*L2Ö­ôn§,Ùg·-­:è2($ÑÚøà=M;@JÖ°r¡aqCçD?ÂPòyÿ$Û¢)ØÎ­õ×]áºùÉw \HZï
´= \}¨¯i°tí9Váp-ûTWÅy&:8õÈ_W«ÛÚ´òÀe
YÓÑ,ç¬ægê#¨È!!ºù&¼ÕTJp¾ÁÅOÌøKj4=Mæ_­J±^¬F¾ÉÎÂu0@¤F¿¡# OYQ«mÊÎ3²8Ú0QºYºèÓñV.6}zcäWhÒÇ®kÚuûVdHðIMÓäUòÎ!ÒàüG Ss¦d_CA%õL&uW!^ä¹Yö»Y]/®8%éÌ+tç+ð'ÞçÜkvoa×=M!ÖT¿©ÃËàô»cÈS1®©wà*],¬®5"¦Iû¼uóäqf¢j[HÀQ~3kLl½D×ïw.Ük8)1_.:$X,êíÄbWæk>«sv*
sO÷h¼?i¿Õ&ð£Çdéz  ;q&sªj,2Ô~þíí®Ï »ÄoÁØÔÜ¤Ä¼»/Ê¼ØP-Ëæ¾{¬<bÛK#îuÞÆZ-pzðsÌ°:ÆºÉÿqñÖf¤·'ü#Ñ}îûv×ºbzÆ£_NNå]ª¤9y)è¥Ür°ad¶óKcA|ñna®ÀÇA¯:ÕÞ?J?ÉÆqù=}R¡3*Äï¸p¡·úzBDþÞJýÝLÎ¾#»à.­þ»bù¤FföÕóJªJ1ü3GÏéZa¤^í71ã,o½2yÑWé¯Ù<4Yêá¥ïôrúëÍò°«##.õ:SÛ?D/3S~ÎÓÓ	¼À"ë$ÕÞUøÈ¼þú2·<f=}IË®=MãnUå%æ®÷f^õº+ ÑvÁ|v^N¿VV³"Æa¾¡Ã^ª7W¹ÁeÀë¹#¼²¥K	s.]|´Ï7©]:'®L±-¶WuÛÂ{ÍZ³ómÚ-0µ7(ÓG|ôÒË,Tû@©üÖn> ©÷ÜRwÈy­×Ðp¡ö)
_j=Mäº¨4.Ðá"þ¤y¨ø¢L*jZôÌøK«¾  ÖMÒ)§ØdçÆ=MØ/Ö{rX÷^aú±oª¦]§o=Mús¤ðD8Ø÷Ûìû\&ªss7xJfëwb:'ù(7÷^J¦-­kÒô065«êI¯Ý3-­Ò²îKZ ëtW>[ôg£Ê¤ÈQ±M«ö;5|Õæ¯t¼¼ûJAxÌýÇýçgòÊ^;ìÌ<^Ê^¶/ç¥º;¯= _§.3Ðìm¼ðcn¸¶*V£ýá{¬åL å¼òdG§EÞã¼cÔhüKwjiöK#¤9jPXþ!ëîe´½'®|LêöÞ¦ËwÊWEW,¥Ó´Çõ¿¤óÖÉè7·³¤ÒV$$vO'î}RGV¾{üÞ¿ýLn53~Ä27²uºâå%ù·©}8½Ä»ózÔNuxyµÝK5U=}E®©üèÜôüf$úã= (v¹£[áµZ¦vþx°GvþEªV]#ÙBÎåáh¢Òå.9¢DÙT= $gIÓr¤Uül$Rg?Î<µ÷bytLº
GS!àw¯JÆ¿AÝ2ð_ðÚI1®¬ðèÐUN]4áôv"0pSO.Íø;xÅýL¯GÍúMÅð+¬ eÅ-÷Ð= ÷mO ©3Sì
iÑ]Ùî6C+?NëòU¶ûWú¡Éº´e´I8ÝªÑzPpÆ54ÎîÜ6·ïd$1FöÇû¼"hà½è6ßè6ßé6ÿcÊc6n÷EhÅý­øwÙ6.k&±|Îò¿ XçÒ xÜ£§õíSPôÇ¨Ñ+FB¦WÒ&á=M­Xw<ö=M§¤O¤ÛÂ*<r´ûìiÀN&óÍÍË<Þyp=MË¼²0aâçwBÆÔÝü«èd>ùE^¬©íêw¿Ð×ËAQ©ÙèÞîjªO¾b¶ñUsjÀÞ¢áxµùmvtÞzpCÎ½ ÑvøU*¹N7jA/ãBßò¡u1¬ÂXDú¼@ÔXêÝjÜLyCxyýbµÒt® ÿ[$4õ»<=}ýcËu|ùu®äpËufÀ315²§av©Àéº£¾á¬Âoð÷Hl#q¬hZNTLYQõÈ¸7ß½VÆÁg)v¯±ïe¹1§ãC[X²c¦ñÒ´öUþï.Ñ¹¯¥à=M- Zhõ-¢&OO«Ø¼",ï^P¦0yø6=MÀ(±^.(Î·öûV¶§ztn§^/b;ð¹É8=Ms9-¿Fëó_ÄMÏ_VT{ÝàsùÏ1äx$3Lû¸?æ¡µÐªåQáx7V¡Ôjèxg©*YÕY|A¥ ½~Óë?5¨
¨D¹õ¹("nVNÜ^Nd¤6dFFf4ôõæó÷Óý-D­w°sîzQÆä×ÞÉÓ¡¨ä¨ÀïÈb,¤Î}Ãåm0´*@}Ö"ðÛw®-w"úöazM®©B»ê,.±ÜÀÓØc~lÞR±xwZµ=MØ]	T¿êfÙÎ;8eõp Ìªÿ#fÐ0GsÊÄq!w.ujÅQ£ÅÓøÞóÕÓ##´ ®­¤§ÊÑÈÃ¶µ¼¿	þýô÷ÚáØÓæåìïry{jqhcVU\_")0+:A83FELOYR[= mngduv|IBKP=}>74!%&/,¹²»ÀÍÎÇÄ±ª£¨éâëðÝÞ×Ôúóø '$-.CHQJ?<56wt}~SXaZolefû ùò=MãèñêßÜÕÖ«°©¢³¸ÁºÏÌÅÆàÛÒÙäçîí
üÿöõÐËÂÉ´·¾½¡¬¯¦¥@;29DGNM(#*1pkbiTW^]xszSò²RmHÿmHÿmøOÿmHÿmHÿõm¯¢ä#§ 'Ã¢çk'"éû"ã;'_g¯bèÂâOgçâåç¡wç·âæÙyìIñÉ1ïIù
>×ê@ìOÌÿj>;,*?ãªA#¬3°S®ë.+0TßnpUGpR÷î~Ù!UQ rÉçqrÏp»0Û±ó£(÷)õÉôè	t­ýÉõ9ô8°¨ ùõ¦XôYõ
ÙôdÓdªâ¢R=MMGÿmHÿmHÿpgHÿmHÿmvaEÇFÊÞV( +¿?7òÃ(H<è?ÃMõ­üÊc8¦íÝýUàþjj|ìðsß=MþpÐ1,QÃ30mPMtGÅNú9ª)7ÿH.Êeÿ¬ø|ô/L½Bæ!}»îRëoLíIsMü´ÇêÁEPU­J<ÇG ¬3PHÕùÿ=}¿Â5<àRÒ¯ðz@k"íüæf¼ºt,äe²¥dýÎ¶hJ¨©Ú@£©]
Öî0%ÎV¯$ñVrÑ«YºRé²¯
ÙîðõÇjÒpBíRÃ.¶ó~¹À=MZ¨xó³kYtB%R¤Õ¢®Ò2Ò.G]¢¤ÔÒ³³¢¤ÔÒÚø*"¢³¶ÔÔ"¢³¶ÔÔjoQRRA±j£tãàËØªû@K×(6"rpÖ%±bs¹æâu×°KÙ°Í¨êTçîø+ÿN÷©¡HjR^Cö¤­x*SµØªUÓ)ÑgÉ¯dRãßÇjû?Gè9.b^oå±ncÝ¹éîeW×¯G	pÍ§æÓçñèëÿQçi¡GfßaOæd­w&\µ×¦ÖÓ¡1óÒíª%HÿmÈýmH£­GÿmHÿmHÂuZärÓUù³zu¥ørýÂsB¡=}ò¿Ê_r îT±þïê(sÑ¥¾@Ñ­&ÔJaÓ¥úÉ2¬0SÕâS½¨ a à¡rÐ~OrÒ ¿f
e¼úÖÇ5|¬ÛæÒÇ= ãÙ/X¼|ÙE¢ï ýpÙx)xíÐ<Kdn×áÆcoznF?à^Âø@G ëüoFàÃaÃ1ì<¦eb<V¦õGxCí%¿H5BejC×M£­íh!gd(±tñuQuíLGæÉ=M©oÕÈ?¯éf;{Ft°ÊÅïy2íXXÕ/0àT«ôé6ÑÝnzÁ¤Aù©!ÖÛhA¹èÝOßTÃs@iàO+pº3.bfe½·zO¶Î¸2YØ¡»A»qØ»QØ¿5ìÜÑ÷ü¦ÙO&c³÷-DÈà¿¬ií;¡X.+ ÂP6ÀåXuf3aÊã;ýÂÄ*·ÿ¨Ûi6ESSÙ$¶Ï­f%<·Q6s¸*Éþ¹s^&îà ¬«($Ññ$±%Ã6c_½¾*_B ÐÂ1_ascùP^{gHkL*+O7eAø½EïVþ"pßaÅÍ6ex8}F7{_&.û<8áûeÜìÃq°þßà¸I2õtRÆª-æÞ¬SâÈ¡ðß0ÞZà~ÂÄ¯¥Ë ,Ö Ð×°éôã=}ßvä½¥ÐuÙ#!)÷örÊ·È±´èù£)r¬h´pÐ=}[QZ!ÔÇÄtÐW³p$»Z/ïvk²KmÏrô²!"¹FË>ß-õYl®}à	 ³¢Ô³¢Ô³¢Ô³¢Ô³¢Ô³¢Ô
qÁóÿòõýù)?Gín\ì=MøGGÜx°èòeS6ËÂIÂøY¾T-Ûrà_9á7¸EèbLÝáý­ÿ:9FIpb=}l[Z
¬ÏÂÈôØ >ÒoªÙâÅhúæñgà(gÓ÷Ý= çèWwÞGwÕðç××Æá¶×Øn©W¥C¢å0Z¾µÛ= ã³|$©ÛÙ-úÚäc-ÆÚÇÌcÎMB¹CÃc®íCÌbµ=}cÇÕd#yÞ.7½/EíM= ]ÛM­	z6nIe<wOÖÏôºy?NÌ25éÕý¡¢T®
QÓ½*kÂ°^T@óqVÑÑ
}ùÍr4UVñåQ6Ä sUGû½@TGâJÈ¢)X¸íY ÈÙBRxljö}jGâJÈ¢idHl&üï-Câ-ýõ%?õiX¸íY@¨üMy1yOÐqqaOTE"bX3Sk°3;òãLî0u¥ìZDÍn³kWVDX²ã;ÍîÍNã /úÆÌû9z2K±qÁ²iIrCÁeMø11HIQP¡m9Ñ³D,>ôCó!>¹kE!¸é·3·KæA(OLOð4åxsnånedeX£^B,%\%ló¥3~bd¥Vr@õ8õtSMÞØ\l,u<³"XuæÝ@Ò£¡Vøw>Cd rØd% ud³{-ax&ì t·ÙBÓÙÿÙ";ïO®cÛÖi^Å+KiJëGdìu¾øà_w®/ÈÍMF Ú<Ãgåé÷ÅZ«éÇ 'èÇL;{¿éé¦e÷(½vD¼'¦Â÷õ7UÂ.àÕ[]½§= öÝç
ÄÐëäßQöM¦.ÞÝ?ç=M9ËÀ94å%Àë×3´ýôRó) á3ÍàÚÁ2w&!Ô(Esãº[ëþö«m+rÚö|ËiËúYªÞdcÔ Ó+F^Ê0+êããÍãð@1Và¼¿¹X'*ÜVu7D¶Ä;Oæå>¬Ý!ÿ¾8¦¿à/å3¢¡R¬U×]XÏ#ð ßARCPÉmá£ÙV,(VÉÓò2R5ÜØYýÓUE= ´c¾öç¾vdÐ¤®¥¦8Ü4§lbQ"Û9RÙªX'h»næ+RÄo¿Bu§Êeaóù¼x£_ôÇ(øágS^gè7eã?ÃB¶Nñþg:·X§ZÜÜ
	«GæQ&ï8ê>AWiëÃ= ²Å"*ÅD[Op~ïáÿbòi½H¢í_í¿tÞ¾U0øIÃmçm{ÿl¾Z~É5ë= îTüHKtjÂ[è÷eËl¯b  ªÎ®ÑøÏ_/"/²á­ÛVxHS6ê*Ï4ºUW
G½)'%÷ØÔK»jsÏÝ/e1õa¼nÖK	}Bì=M¿ê©>ò¼ç'H¬<é3g= ÍRoï È	ÝNÿNnq
Ï¦5ùê!t³Rºõ¿¨b±Nanåo5ý-2øÅlvÔÎÇÑw1mC2ÏH±Ã!ç!{ÙlÈ:gqHËMisi
I·ÜûÎ	Ññ
¼6¡CNûHÎ¨û2cêûIWÜ6K+pPÑã°Ôä÷ÐÄÒ	Z¦±ÚHk¯¢aÛºÉ´Üæ\³Úëh/É.SÙ£uþ7 ¹Ïh#/V¡ï&dÜý<ãsiù<Df"Å:{ÀÉÅYé©:wùPqpè²LÕ@³pEqu÷qspÇ7vs·,¸¦W8ø]Gd"ë|ì÷RÌ{õµ
?8Çò*;g&nÞÿÏóÈlÓOzñzwÅV6}ÆrÊuÑýá©§÷º¾¤=M2OÜDáiYb©ÑÚ¢HÙ¶ÿÖCÍKï3°RÃ;Þ°¡±iÕáò9ßU¿C¶Ûkî^óñR²â´ß$½rô_ÖF®½ÅßB¶$ ·ÂyõµE4æ¼×;Ô@}ø­øsi)¿W#Þe0û~÷äúÄÙÌñPP=}c4IBm8]îeÇ!ó|Ò¬£8ªë9É¾Y³Fr"[E"÷Ëñú#zÅ±zw9ZñLµ¹¥Y¬	aüÈR3çÒIM­ì%PTð,^(?v|Ký¥÷Ä
°ôRpâÁêÙõÊÞÞ·ùäÅúÅ#¯[·ýK0lÞõDj ½QªbÝ3'¶¯çõMV¿dÕo2Åßþð³zËªû×mC¹
â0ºJ¤;Ô}ÂÉ.ÊÓ°3ÚÌkS°r>Ó[N5§(/ßí&ØîÏ1â*~äñì
g'É£sj= ù[:K?ÍuþðÕsI§ÑgEßQFlÓV4êTY[;qï>Íõß|Îõsù§ñigIc#.Ï¿èóüWjÛß5ìw¯££Ïô¶Ú$=}Ù¾®BÜ,3FÞC_Þ	·¸ÝÖcd0\
_Âo²Õ>û'À%AâÀbúûK8¨^HSC[Goõ¨Ðr(býc½»Á36ûeáß	¾Iÿu8}09ëzUbÃ]ûmó_'k¿'­¼¨'Ýa\¯\ßG@hâõØðÍ%ê&Ô9ïðÿgÞ=M= ;Õ×'ÖU@xÿ=MÍQaû^AÁ@YñaÿQ©k§i#\û×@¹%.ç­Ð?8s]øåmy/±ØÀí0ã\û¾d>½ÅÄÄ¼@4Ê÷Úlb×é+»Ë%ù©;¼YÇ°o0Ý¦ Vü$ÖÞjWR¿Sù4	ý_§Ö²SÑ¤®p6Lqeo@BN¡:%¶£ÏÅS4G§(VW1°µÙ¦2@·ãoT|Â¾£õb`});

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
      return this._decoder.reset();
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

      await this.reset();
      return decoded;
    }

    async decodeFile(flacData) {
      const decoded = this._decoder.decodeFrames(
        [...this._codecParser.parseAll(flacData)].map((f) => f.data)
      );

      await this.reset();
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

  assignNames(FLACDecoder, "FLACDecoder");
  assignNames(FLACDecoderWebWorker, "FLACDecoderWebWorker");

  exports.FLACDecoder = FLACDecoder;
  exports.FLACDecoderWebWorker = FLACDecoderWebWorker;

}));
