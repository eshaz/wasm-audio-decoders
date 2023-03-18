(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-vorbis-decoder"] = {}, global.Worker));
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode000cXXN=}UËç)¯¼øÜ÷úe©@t1[;tÃwL³s[	06¡Q.òÒ=M9ÊÝÙG¥R2?©«"ëN9AioûJ£Ë.Ìéfvô(ä(æ(å(ç¨¬àE÷¨-	*¨M5>¡/R¹6Ä¨ó%CøhVD6îD$[â·.V'60qrÁ¿÷EÙùM±ØØqÂgÏtÊ+#¶Xáßg×ß×ØØØ|eD9??k£¥¥rqóà8èâÿÖ]Ð+öï¹¯çÉçÒw-×¢9Q5þ$$g:ÌØ ¤ÃàâáÓÕ}øäè5¿8§0¤y~»å:¥)~Ëå5_¿,7n"ÚXâ§{JÇCúçì¢²ÅÂ7»vz+é}ùAãé|ïYÓÉuÌÿ¹ wETv{×Í¨w§â9V)¾èf·©:Õª­:ä= Ô0 øÜ0H2Ç¦*?$oWg~×n#%¸!(qßW^Þ,ÕöV7\«¼iy_= »uuiùNu_çÛ ÆÅF|²¦¸= L*èùp3ÀIñ ²°ÈØõ>¤WwãV<ÐÊRSóIz¹r<]<ÞíuwÏz¸ÍX®1l<R¬oôÚo&ò<ROh(û(3¯,üBzâ=}zÒÁÆåþ8Ï-IvÖ¹pQa£Ý¾tÞ\¿0Pîòl*$q>W
RsuÒ=MWÃ*(¦ÂÚfÚrKqlrÆEìÃoÙ»îã»1JKOb[àâlu	±ðß«ëvGÛ-Góª|Á?FÝÇ¯@= x@Ï¼»ÊÃTÎÏ¢rûêK@å9çñúdæAÆ?çuL{Å5|_¾§©[áyGI:a´*×³À¡I(ÖCDw_Ó%±PËßxdÕm :>#ÒúI=}µ´&béS2MÙv§HzÙoDäJýÌ[¸oÁÙè=}@Cé¢4uJH6+
òU8½dw»è$óûN±ÛìêÃwtìÂéE ê¥²Xf·ZÜíéÄA¬dkFzB}=}|t#i©X÷É×ÊÎf¡Lþqb;÷ûõ;¼ÈL¶»ËoÑ¥ =}N¥°(= z®SèÎîç?Fþ/S¶ÀUM[½ïò¾UÝ:ûïÐÔB?ü*qÛö= ¦.ó B:c²¸ºhs¤¨râ"=MÍ:¥Øº?0AÚ@	ÑØÞèØ^Kï<òrNÊÜ._Y¼'»?ª2I¯XààPÃãTu1¾eÌãBF¿Aw\ãëÚÜ>>Æ«å9pìm<ðt¬¤ã'C»¼@8; ÿFÁ¬Z12Õ=MTênFDñ]¶z= Á×GÝ,ªêòuT	ÎßWDEY*"%çÕÉÀàW§FÕÝüuffzÇDdºqA:Ã 2HüþQ)yQâp¾p± .¸o"ø{9eyÆZöA}wá¨ÜËI]Ý(³Y¯<½]Ø²rm×1Ã-ÔÃ]ÄSùf$xãoR:Y¡Û°e8ä¾¶XIöji§èê/HÆé%2eÜöÚ2çæqñÜd-S¬ïÏÐ-büÿÕÂgrOï,½PWt}Öt	;Nå¤/A­ÍËÙ7HCdöUæo]=Mï]ÍÃ>3Åi@¡u¯ãA'=}ÒÕB³ÜÐ=}äÚUü­°Aó6>r~wÃÁñ7þ%³nã=}sâèØ xuZ_o 7 ÆÑ^ª>Ì¾¡ÚéÑY[{5¥éy!¼pé¢ééúnbL­ÐüVca¬ÇJ¢Ù|ÞQHôíÜý
ÂdÃ8òÀÚ¸= )UÐ)Çn¸cÒ<)Ñq¸ºûmñ/LÙµèå+âôü.8öb¢xÈ®A÷Ú ü¦ìÕ@Jßà{|>ÜHKÃÁ"ýPP1?ö¥YÌ Ù»°?º_ðè²ýÒ¬L8)E.ßÂÔ ;Ñò»ë£ÑÍJy©-¯âæ^Ó¥×¼ý|[£qjmÅnÇ°Ám=MülW[·­, 3/¨½¸¿ðÂÎ±Ê>q"ù$jøQ¸ ÐëDäÕN*SILu·O¿?zRä0wÌ÷ñÜ5<ñÆ£ÃrÅM§Ó ú=MJXz( ?¥JZõçÃq	d[B¾õ=}¸ÕØ YÇT¯bÁ\jüO1¹aòp¥?f5ÇMÓ"OÀè4í÷Q·¢iÌ³§XÈJ9,uJO«T2W¾	ÏV±Q­^¯è[õpB¡¢ä)= æ@¾§¾ RBpõØI?WóøÅeÆ|p;ØÞ±/u¢º(å7¿ÙÔj±'RÂH­s$®ÑMP#z)Ö=}âWþt?_ðþólïCR^1mbÕ¾¶ðÀé*×ÆAûôZâ5cÛo
jY-:¹º\=}W³ßûåÖV@ÕÛÞ¿k
K'¶¾S)3ø8É«5ãN¾F-¿ Ãïy3¾ü ¶T2Àlº0Û*UÃå]g]n¹ÿkVöíãÂ'p¾&(@7LÃ!Óòw òa½5
h<6!§ïÑ:ó ÃNw#k3C@)þÌÀÓV:¡:¯q«lX>8Ã=M"åf[7TÖ6­à)oÈb¾ÝÀ¬'Õ:N"©Ø7ö¼õ.dAA	dlÓ±ìüÒ¢½=Mpf(·ÚO0gcÇcLyUð·¼Ü¨»É Ùâb=M+üýÎ!öðómkÙ;XµÏª¼NA±ýËój¨ÓÊKÌDÕ êa÷7}LfocÜ)¢oßøéïµ{Îä.Ñ¼ÇÜ,3-Û7ÉwÉ/i¹3vMËÐåñlb÷=MüÆ¶:4Å¸$JkK!·Ýý4Á,O¬ió}$^ü®Or²ÛËÜvKgçAXvú0OëFñÇör¦a"ÉwVÊÄ7ÄX'wÇÊÚ§Uµ-éõläXß»ë¶C$Ë²$®ÑàM«<NFl.²Ï_qYræ,éëÝ)L~(å¡ieeéáiáéA?¬%ËäiÃ­Z1émUÔû1RÛ,zÍÛ(zæ#ÌRÔîöÈsè}!ÇD¥ÿêûÉ
Ë¿~¶swï¤µ óÛ«K?¥Ï8'"øÓ= H¸>TóýÈßãP0Aá(dPv³¬KÌ£y÷ç¬FæÇ¶áåµuLnû}IÒ'Ð´ÓÔî=MKWJ0ås£eÌÛ hè_àopU=M´Ó°ZÄ¸Ïõ=}b¥)[6Û ú$éGñ'oÿìÝµÛãX>ë0pÔù'µ= L-0±-ÏÄº=}ë­@$ìßÝ¶ÇZ= ¬2Ã×Á8Ém"ê=}iàÄTühªST|P|»³è³è5Í©¨&£T|#z¸*C¯3j$ÍùÔwJã,zW³s¨,m=}¶K?îâ¿ß¸-Ðñ*þfÀ³OÓOË½EóBQf§àIL?wR= xgÓTrëº; ex¶%Óo1,*m¨eÑÙ½Y6ÝÐc\Î]3O²³ ¸ôIT¸ákÇWòzqXzÄKÙÝ3³ÛÒ\¿ü f*	@6P7O¬Ñ°ähI§Ñ=}x2tóK§ÑUxº2xb2gÑßf0ºÆâOÑØîkoIÊí%õè¿Á½Wè9Cn1¼Ñ~¹I|:¥V¨ÞÁ­6m½6Õ&µ~Ô%ºÂ¤ ä|)JBØpÄå ð=M×ÁOqx·Î¶··\ t¾ùÜr4Õl«D«¨"\bî]X!>ôv½zê²+Ý[!cêaÆÚ+] '1ï
¦1Ù¤8ú.« â^÷7"±þëR¤%â[$ãyÐºn±	©»JGvoÇ]8ãkÕ¾§[=}Ui®eCÄ0+¿z¯o4/KÑÆí/´©¶¬­O-¤ÏÍ2=}¨â2ßÆÛ³pô9%HÈBñ¡ÐHÖÇgÂÙ@#äÇ&ä= {Ü²ÎâÉ5CÃÆ³ö½/!b4V¶JçÞùb$Â?e!2¬&5}¡I¹ ãqÎ¹aðM¾¡ Ô4ÏørVqk¶§ù$îýJiùöH ¼/zé´½²§E#DWF)ý?7Î°ä{óäÅ¿©a2Ïçù¢"o×CÎÂa;ÿXÇ¯Uo§é¾OaKÝ¡-¼ï.ÖztDÂÐwÙ¯°FYÑTÝÎÀ5B}_^aé&5
ñ#üDÇÙO¾Øæ9Ã1µ2¨UlTLAáÌþ"dnVÝÑÏµqD½""(AÝ©×X¢+¬kqÁ±Ì%U/µ|L]hYâÒSÜyí@ÕrêRÆ+´¾C4ô\qÙÑ@ ùº}×eÔ¾Sð8öûí¯ÐÓÓÃtöQËâ+²-ËùOmÈ;CçBÄ2ÒôhC¶×ç¹4²B¶¹8E¶/Æl/ÆDeO¥3Õ6ws¾ç¹Rð¬©ÔE±éx)ÒæÈ2= jÃVrôºâ=}Yx%%6
ËÖn¦@têTyÎfá,ýa")/ø¼\<ófQÀÜ°É´r[@)îqÌ)ê@ØÆP)*[*Þ=M I5#.s¥#]S¾ø$±­$¢=}_+QvR	¼Â¼3¨¼{Æ%:ý·Õ?¡ñ4n×§wZ+Ø¶E²6iu7oJ{zWñt~¬7Ë2h½Û1 6Kæ¦Óô?H o¶²ÒMp×\pËá¥çÚµºqSòpHGM6IÞmüv%ù÷*@ziS^/bõH»x;÷ÁhÌ9q÷lÁÌÂ4ÅRäèiÃgð<¢-9ì¸Ît¡Uç}No@ÒLï>Õm9szyÏoÇÓ*£/*TH¼êÌò}xòÌrzä= ,D±QÏ©p%ÚOcv¦W@5ù?L}+:$*Âoé^²çâBwÖ¬fäfd_Ö<ZH ¾n;7å½?1áâ¹.HWîUÅ}7¬gÌX×ï\O"L´0#,PR´ÁÇ¯h]h"È¼ÑoçòuUOY _Lqc\]nAÜºa,ª= ÷ »]Ê¢éXè®^¨ÑeÄ/GÂ«¡}¼îb©Ù=MRÂDßsw!-/÷mÅpe%á¦ÙîOv~]ÆµÏ\&p$p·I°©Rµ-Ç6-44%Tî¿P½1Ñ;L¡\Bè²H÷krG4µþRÀ4²%:=}êY)×ÒD Æ_~¯ÏøEzÞZ¯ãúË<ýýÄ_ùO§î3N¯û&üëëg7 oË!>òk_Mÿ3ÿðºù.OZ·Âlª*¬G/=M¯§pÆ-ÁBvË¶ácO:= µîÇÔYy&"®zxzè¦F­×uÆº!Tj	8×ª=M&'èTÔ0=}vsÃÙ´ÚJ¯Ý9Q;ËêÇ'= ieIÁÇÆGèdðt¤ôv§­ÕEáÄfË±fðËêÇÇK ­ñðËRS=}!yb Çê çK¯Aª4üÍ³W]k9®	Gê}üáã·CQÁèLÔê)[Ë[7¾1£'ö²@Ýõº×B#Q¾®FÞeGÊåÅL?+¿³Ñ(Ð5i%ýî%²l×FÙ¾_$ìÞóñm
hHãCYáuèn¤Ó=} UÕbÛË}k¤ê{Ç
ùs
ÿÃ
ÓK_m¾ÕJ÷aÌ%Cr ºñgêq¿)wþSJèbÉ´VsYµàÕ­1 ªÈ&2Ùìw,¢8n]4ÒÉ
Ô6= ff4°¢Á¨âþ¦á·[±È©c/O·0ëp&$¸è?âhãa)íà|£DÞö5b¤*Ãç~1·XÏ~Ïûè³©AóbÕÍssq¨6Q}ÜzùJOÇ¯A8Z^ù(Ð%O#þ5«­¸ØôæÍ7O^ôòOãh_IH¼¸ßÝèádne	*£¡Û²JÏ$J#O
ÖAuDî/­Ü@M¼z?×Æ  mó&¥2O Ù­à{"øR&ÆÐ^ ò3p\êúÚG¯ Óû¬4ïjõî«2Dyó±iEJìAù¶áOÅy=}Á¼EiÈM±q×ºÁÚæ(wwy½×@fb»$ûe¦¢>tê6¤ÎÙg·«Ù¾U0åÞTb6ÕFpÉyUÂ.æg®Ltbºâè<¾º Rý7m~³OÉ<>û,YLZ®ðréßU5ïG-[0Òü¶ÃZ÷ßD|uÉ¸= 4¥
×)o)LSî 3¿?8I-äØJ Âé\{+l2ñÊØ¤R{= ¢qÅj	Õ6Î«s!$,R8ªq I'µB¾Sº9Æ(u$GÔgvñ½ ²ÜALµß¸±TéJ\ÿ7Ú¨Ð Tàãr3Á,\"Á:öwiÞãvü-}ë%ßã"Uk÷F¹_9~)~[ÝãCÁåyþa_@[ôw²»Qse¤?PÁ [Y?÷ÂåÀ^È¬Êµðq	àçF(§Cv91«ñ~¯hFñ~¯h&ñ³PE{ oSÉÌ
yz¶©ótäøüãâR[ùnÝÑÐÔØBOJ'}ø¥?Ù 6 a®´ÛÞÍÄ_¾h§c]Ý9ììÈ·fÄó+ÜPÏx®õA=}à2ü9ã²qomtÖ 9§'o'õÆßvKÒ®omà+°~Z<"½X ÔÝqQ1ePAæµvy¼Ñd6UMöºoïKb'ÔYßwp;BÞ#¬8ùÀªk(ÃÙ ixÐ¢'½É¤ n·w\Í
(¨båöSÚBâ½R§)'§è©Ê6âcÏ²zþ^vÚãôtÃ´4u¦qÿ²@.9DN;/ÞÂôÍÕ<³nààzß)bØS-DÍÊ³Yêt©Z$ß0©Tmù¸¤åPÇÁ´e0Ñà= è|oýWfD CÀm:=}ÒÃ2æìQá·ä'_$ø_{ý'|Ó<  yZÄï¬}á¢÷9MøSÃÄ¤7ð(xÞ¸ákÖ¿å­á¹êèªÓ1Õð®Î»0Ùø¸ùÞyó?i:¦U¤ôR4ÄgÝ$åâ¬à=}\c®= ¤©s-CµB9S7]®ïÉèÆîù@6¥Ö÷gr²Õ´AXyä6Z÷w= ¹Pr¨õD>vªú|aRSÖíþÔ4*
]Ô8¼WÉ}~ÍïV\:ësd6wµät÷Á(Ó~9o9g5N /ÄÙqAÛÁðä»ê§­âây*Ã> öw ÓÅa&Åu=Mõ²dßÍ_h>Á±êeôØÊñÙÑV%ò:'MÿûçùÕV÷µ~ ±HÏ1¨wphu}Ù$Nû¨kÎTMm w7­=})Z­ëuÆ( n¨§#äÁT"~·N?ãMØ*¿qb+$°O9÷;xR1û2¾ß®æ<½]³»«9l,*ÖP@¸Ê1×Lî.vÓr&mEòá´°#±zàhååÛTyÏò/êÙéÿ§ÕâÓ3~~,_÷},?%/8÷r¶JÓCçÍÆ©B?{wÕxt7;ñÑCÿ\¨\Y+¡¥=}lÑý(áÆí	Ôk{¬?³c´¥Eà/Xaÿä¤Æ'GðZãhö) 3©DA9¿ÃÈÄCH+{¥fÔ¿¼õ¸q	=Mj¥¯~¯ðîêµîH«MRî"ÕãúÑË_=}
Î»cÈ"ËT{L|îqÈa&éS¼ð
ÔB¬6¾®ímÎ=Mª¶ì­Ù¬;ÕP²W0à8QÝý£ØW¡àkòÃÃ	o¼ÆÏó·¨«ê9<éÓ9CVäèq=}Zr<Có=}AÏZö¥R$­ÿ¼Xÿ<<XMO\R¨ }úa8ÛÑ3­¨ÂMvö½1É'k{´qe©Ó ï­Ò²ò +~	õ;j¥è@OÎì×ìþE-'+¿1©¤GHöy×ÉO9øÉGÓHT¬Ü½¤æÌ*1a>ýfe#%mê+ö÷ùåa²UÊ?Y©]¦rïÇ·±v9óê+²>Ò= ÆÊçCò	¨Ñ8´Ì\$©A­-u)Çp¨= ¦È(vÙ*{.{×¤ê|]r&¡¸±g´ÀÉ"þæh¯fl7uÍû^Ù¹÷;qeAo¯Âæ8@@¢±: Mm¶çÊ)Äe¾}ø7^´¿ùhRy%1"íG[MWÁqÃâÝ!
p_6[FµHjá÷¡rC÷ÂãJçJè<=MmKY_¾ïðTBü¥Ùêè/æÌsCYüz±µÉÍðßxÉ¡³3ìÂù»î
çrgBçZ= xlªz·GÓxréÚ½a¹5Z¯]Gû¸ò±Çb>­f<2Ðù%_/F<PÚt¹= 	bÔMëhYnM®+¸ES6V®uP±ZDVrô W_ùÔ$3½°Qã ùú°o/oå­dÞAì&= ±õPÅGë(Us5«Ò©þ¨D­r»4øÂè>º-q©]tNìï½VÏ6ÖëZ+FO¡®}Aþö$[B@×Æ¢*>=}:}Ô%ÖªWÉËe¢mR	I#³ Ú8=} f;FÃØÊõåöÛùm	^ØªeË®Ç	Ë»ËK±kx}$ÊÖTËÜU	HÊÆY
	6«ÏcCËkúk²YÅRt³að ÙÁ.E´·µ¶«E³Ó Ðc>Ä¨z%×ßi¡Í°DÕ¬æWåáÑ=M@;o÷UKk<KóV=MSg-òÙÄôçLè7%KGÿül¯mbW7¶Ûø{'ÃÏá&Æ6ð&r¡ß#èk
Ú+ËQs(Ð©¾óûÞ!:°þ, ´DÕFì(«¨¢á\þÓ^ûcß=MÚó9=}7¢ÇÈâ1:: ×Íü^ÀÊñ7uV:XM´­R¸ð§MM¼HâSÍ2}ÌRÀAÓoàw×³1Óâßpàs)êáLm3ª«¡ên'pÌIÆ}öößÀóa½Ë;=  ££Ç§­¡V§qösNú¶îStÜb3,OY!­w¨´-ñªYáîÉ1V]Gi.EA/í¦~µ5Ãj$k{2½>5ßw%i= ­Õ{°¥DR)Ô[¢ "4[Ì6·Ú%Z #]À ãoyZM1Zá%½ªÑöjØ R !RÐÍ%¼@ÊpÒhó§k§à 7'õÂÀ¬³
Ð}ùk~hytÆNqRg·4Æ­Ð­.ó³ô#Kã);uÈMWhÈ9ß HT¾Æ¦B¿"|@l¼?CÔqmèÐTð\­6mØ£û@³»Ñ¿È¾¯åÎÌë:yõ  à<}Ñ@uZ»íh(3ùf ÒY>Å!èh¶)·Õ¸½ÄZiS4T@¾ùu?÷ñ6;ñU	ð>ñ·Fùä¦÷å__¿/£}#vEÐ^÷3£Ï<·^=}L	Æà.Fv71yåè8Mrõ]ø°ì.¢ú WÒ?ÌúL5Ç9Îzkõ@Ð8¦CÁEV8y©OKcÉía®±áÂD&f1<Ý'Ù4¬àó­Xýæ°j±$LÀç¢2Æð+¶ÀFWø¿ùÈýXHæiÚ[qs¦pw9ö¬Øe¯9=M[ Zß³mïß3ðS?ï*y¿¼°ðÜ¯_©ùBàñj;¹ä(~§Aã[hH, ôÉõr©lN
½l:Ze«ê÷°³?1gÛ!Â³f4æup1wRÿ-îþxUÝ¶Ü¹®s\y= Y!-ÐrPü±½Ø£4[~ Ö<ÿá·û%7}D5Eå}YéN6ý%A>îî^çS¤v4=M­n'~¥É³}?=MF¦ÖÛA1CðÝ´0^pST)YW{Xá= ÓD¯¼ÏCÏvY½°ÍàÛýö±~)ï^[>z½E£ôM1"8­3³F¤xÙ=}úï´JkVFýWzØah®ä;|"ZY¾^KÑ«T5VuAÎªj¡"6ä5n3Q»_ÄÆ»úðâÞÃfÕ&'ä
ùÕs÷eí>kð\<[iK?H®íf~wZË
¡i¿Ê°§~ßöEP
(ªÛLì[Et14Éà2»
"q¦ñÇjùâ ­8¨ø( rH?cáûòWt/«Ï?zÕßK7àÁpùN}Ïx¥Às}tê39ÍXpù(¿&g´Rò@÷S»I9§îØÍ1èr¡ÝÄã ­óðÎEø?/°ýåò£Uo³{._¤çØb¯qàÓtÌfºº2=}&(Ç$ÙNÕÏ9A³]aÇ <pw¤×æxe¤òá6vcÂc»xj&Õ¡ ¢H·æÑí¿ÝÇ_C7:ù/ÕZwÐªþÜFÜ©ôÝõñ8¥¯¡gÉ 5b_oNnIÏÐ¬zËÞE HY±V¤%ïkÁG¾Ð}èXªzùÊq2%sõ.ï:&Ayñ4xÇgþ³$ªá´ªuVÝgÁ®Âjãc²¡ ÂóHYãt&£ü­¼Ö°úü[Tº© ´¢)¦>"°qÿªr3.zà¥ò6âw»X5·Âxïr(Âï¬âàt²ß#4ô¤AÞØÏÄQËsÆÚEo«]nQÄT\F= bx¶ïÂeÉ³õQ÷±òUxwTº-VÞACmÙùV)-~cßÇ1j^§gÈxIy6æ|«³å/z[ø×bû!®_e8ÄÑ®-S]ÿ:è4ÈÙë-ær¤>BÙö>RP§ò^*:lóQë¨"I¯ÏE³óeÿAKËé¡çI¦1æ?K³8ZÛÁ*}KcÚLµBÒAyø=Mæfr];b¬°ÖFTZlt$ÀóÄä[ $õlæëaû5ä»~jþéÈG0ÐE.wæP= ïf¥fi:hW2pç/Ø}üx~kãÉqIHÏÅÈçöíøíSûæZø¦Ú§Çóa­:á»ÄÄßû-(ö\6hÙäM£Zùt¦$ =}.gW¼ÇßZÑkrÞ!ëßäªvw#Q{RXîCÓ°òøp}B=}ãCù)oñh¾>DïÓ8¦ï0ïÂÂ|9Ê·Ìéè±ìÁ¼2çhm2 Ü÷]´UrØºM*Ð£ã÷¢eø)+\Od¯Tàã@{Ó	cAÙ8pkc_cõÖ¦Ö°Æ)Ú¾É5ÃqRÐù2é2fÅEàô¢by©ºç9JÅe4e7ènPÌZ= LR}0,i¸í	çý¼fÈ¿7ú|¨]ëávÔ{©\>Aù\Aêneì¹ý:òÇr~}>Ib.60¸Ýã³Lø¡CJÕÂy#§­Ø9µªV§VO#¯u=M[Ø·ÂiÚ¤¦eö?rÈð_$©pD§Xõ¡8;þÏyòpiÖæÝÄÉ´úÒ -&¼Å4&´Àï´ÙØ©ê}hjV½ÈSêý= J,ì/;4'¦ÿ¼>ãØÙ3<Ó@ªo«>Æ"ü¥Lvþò®M_Dähõ÷ðLÞÍüû¶*Ú%Î´Ç:RT¼H5Ç;@¶«7Â!xÜP98!|¤'yt\¢%Úë³ëÏ:Ãìð¨#°N/dw©kå¼^ZÂkg³éúÄÐ,¸íÚ¶°Úø8jÓÕ-+iYßãÅ#qä	)ÄÇ¯ÖÆ_õ7CTêÆ.éíåL6>8Ôö\øQx6NîÏ?«j>}uÇ$3Ðö±_Z;/Ñ÷rmÃjÉÎ5ª;âHo$ê¼ã(=}2§³RÂoß4K9ÑöÑûÚ¨kÓ¥©»R¨ãMsBÉïµD*J(+à²þyöÚYÔÿ5Hò»ïE32\ù«q½»T³ msí(LÓßÿS×óé,}§î rß39Nµ×éÜu´«ÒL	¼µå¨¾?#PJÆBÝD6&ReáïcÍò·Å.±x±Íé<=MÒ;ûÇº¿¦7
QYÑöÆCCqì2¥ ¸°3qIrW¼vÎe#?w#=Mó	áOÿ@~gÎù}1KWî;1t[uÑËå«W¬sØ>.mGÙ&;µÜPjEr°;÷VÇÔx:õÕ¹;hÞÀ¬wÆ?ùlèÿH3rù'íD3±5øÃEå«Ú= F^¥tûEg Ü]"yX,ó­¼uÃ ÒXc3ó8%îrîÍ¶gyÑ*ÙØÚÍ±´ËçjÚÑs/ôvNÔ9,Èpä"Q»÷à\ÛÕÏæ!¨6¸Ý<n#ä(@rùÊo?6_#ÿÞDp©Èé=}ðþv-Í²×E¶²}¥º8$B¼_¶Æà´ÿ×i+3ßÓyª*·iæÁ|Iô<¤<VÑÔYþô´oI*~¦²z/©zæ;zË@£Ó=}RN¶«2ÂÍtµr3l>\À³ï±cÐ´UÐÄaÛ¯¿t= 5ÖZø\.8 9E¿¥@R¿½Ý°ÞÕ¤28äAa&9Ûë¬ùVuQ ¡tT6°ÍöºD+7¦_ÝdIÅe2u%	ÂÂG!ýSsx£$§ØwëÐ¹ZþÈÊèþVþ¨¸¨Qq-eu_cÚu)v/r²ßw= 6Ë}¤üjfäSü©á*I)ÄÆòù_kôárVP%Ð³¬I´ê	Ç\êÀPÉ«Þvr£'åñJ®*%W·ê,mÜñ	 ò¥Éøqï¶vÍ×Qï;Ð¢S/¼væÚØ&$u_Í­6gÝµÄ/úVÄÒg*(M÷j±Ü]x­X±^àN)ù/U"ÊÀ= ¹?£²&Ã= @6éAÎªt;ÀÍÉBTâméQuà¼þ=}·á¸¢A¤w0è¹DÞ\ðÝGM-îWò?2nQ|ëá#ä(ä0}#B)Ì2hìáwh*d2ï÷;=MY4ìQ¶ ïìª*}lr	c»èY¼»?þÂoî¦ø¶8¬\	çÑ6¿ýò-_Â/·×bÄ)´á®öeñsY= «ü¸»C:Y E~AZ¦Ò¤ÒUú$3DÕy~w<oèG÷^¢D_\MÙ}Yd+ÄD\á>í= ´Ùµ\#t¯2àñ}´qÆDÁ
­¢³N¹Ý3= E¬6[Eö¶­Zöe/ÖÍ=},qvQËNG3ø=}|xG\«wÁqw	N·L«kJãäkÏ.¹(Ñ£Qeúû!â«±éÂÆce¸'ð©ëüiëqi¶ÛçkHóþ92¹!ícÂ ÀÁ¹Kyuâ§åMvIÂ§:ÎÊEòýW´09ç²ÂÁÂÊÙæÆÔÂÊY¾Ä2©?»+Ó%ImßWüa)IüüÎce2] Wé#e	²·Ë¼kÒk¢ö]¸!­ÝS£®mT= ñÆé, )æ,è,'Î-Â©4e¾-]¦7âö¬wág·ûn·ûV¹Jf1^{n&¥Gé^Y@C{í¯Ã%¹hÊq©%·S n§*VÎh2Ý¨Þ|)è&\Íã+cÌ]îo²2$TÃëa 7Ún§Ø#k{¼±îG×e
ú7íY.BCMêpG%= :êUYÉMf= ïi¹³Ic{Ý_Ï»Ì·èÐ·Z¡Â°c+3rA£å'¥ðð^íµÍìüðÈÝ7ç³3RsØLéGÊÀ'±ÈMØo½c¬ËQ8åòçr¿cÃÀ c¿ºóÆÎÕÏÉÿ#BÉÆ1°È÷¢ÂhEÚlz±dç®q»Þ^ê*wãdëMTºXo,!+rkJ,^H4ÂjóãrZö¦
öóx,[8Ã;Ø¨òÙá1UC  }×jf°pÐgÐ?>L0¾L"Èàt¸.½¥:÷¿-;= =M²¸8õ¾m¥ï H7×S¼Ø÷-òüLÔï·¡ã[j¹	D,ØÝæ´©cajh¡Ó'«]G#»»ø°6Vª»CÇÁØC)ìÄ9¼þ	{ÆÛ+»®Ò0FDÚ¬;%]ce.q%ÔÿuS%JñÉ Â¬SuÀHÁ\sÊe ÃWòKE.hÓí#~EËâjâ? :×±pÛWk¹CtqöYÅèjÞ@Å %= %Þã(+õóRåEøÞÚ'«XÐfg¬ã±ÅöÊöÅÛÜïkãu8
aÒËÖîëÃu§l¾EÎSN>ÝüBÎG¾É.­ºÁÃq&ê"ìÝ­#zÂßú (=M¢éýæ£IÇì¾huúJÂÆÕ «Å|¸K!ÐZÅëÀæÃÿHÏ²éÖ¤ª¼%^Ú(sÖ_WP×N¨uaÎeE$3éíá>pg.Ö°N²TÙ;ÃnÕ"È);Þý¬½¨rþ|©$â+¥ÕÓØÔp+!¥</|È  ~RÕ )N>õhÇ²ãåP*E)»¨AÈüI;¥\Ù£	b#+ÁÃäöîÍÉ~=Mã>^Æ7ë7-;|Û·+ &m"l¢æ4°JâR@ ª£ItÛO£êØFj~¤*ÈG°<ÁSÈÜ%hÿ2íÖë 9§ "gWøÆ)l]
Ë¸¿Fh(í)®§Ì³âù~Å6h(<=M~¹3Lº<HÙXDhW~·A²¾ðëS.Ý+ÈÑþ­ý®D*Ó'åºîÂ»¥Ê¸ÌaÑÇæ;üo,õÅ B)'	4â&V9Tcìûµ¤76Lì;w÷Ògµ:À¹^yÇ£ºMÅ×?ÆE¸9Å96Ï[r];«Î®îK³Ù¦çn×ðv/Xl²ªhr¶hrE°7£þ'¹¤ãI Ðý8U¬}Ýûåq:z%íßÇ:	³åO£H.¯p³K­Î<§RÔÀØJf
üð¢e»·,CI¿À¸J ýÉòítz~d¨}v&ÞìÇj¬MDç jP°IØÝË«Ì%ïòÉ¯æu/Ñå'Íø§¹Bk	ÉM_Mí-ûjÒJQ<å->ÀW@½\LÜwÎè±ÕÞýys«­þ]ëa¼=}ÝA¢G!( ÜïÙ8f1\,£îÄO<ë¯9¤ÅñeD°¥ÐÇn@pÞüÐ!k>®åÀW]¿xòË°èËv= ü·2õF·èáÈÃz{åøayÊ|jÖdgïßÀ_%-¼<£uF?:1Õ[ä¯ üA<þðwFo*$»/8= #ç=}_f(®o¯ì¤¹4s|ÍVÛÀ)¸å1¼|ÑýÕ¡÷;Ï¸¼c9 Íï°4ïV¡êñÒË«{ê#¬.¤Æy4yikXkÇçÚ.¹­MeÝ,sîÊ8Ï»ÌÚl[èFC ¦ceý¤×4jx0^y]Jö²dys¬uwNrHüíëöSRýHjü¿mª6ù¡= äÛt.çuÓ¯Q:¿yûdÇfHò
üfâéYâÎÜëóËóKu{HÐ¨DvïtÓ#@\d¬u7ÚmÐFÐfææà+9HUüÐçë
ä»ÖBÎþé>îáîëú/
æéJ	 OS§ÁÏ©ÇÍw Yx¬v¾ö[ùÙÃþþóÊà^mù*P*]ÓÂP5&úÒÄqÐ-EPµe ÈoÿAÜ¾¬C{¸3.À bwX¿Ö¦¾eîW$e[	ãäìdÞÖo7Íÿö	r¬Õ¢xéïý=}èÕÒWõÙÐ=Mj4q+/Ëéé6¾^GO|kÑ6kÃ%LÞ&#k¥ð ó!nä©»ßùlL*uý%ÅóqÎÝÙy£@$Cý©Ç³¼RfuúL'cÒÎ Lå%4mÉ3îú)±Jþ=Mcpã~¦³^<ÅØÁe¾Ìpy%u7kÅß+¢¹«-Çø	æKü·Y
üTäîISpÛ2f 7GIjI°d6ÿ!Öò¤º}yÈY¼5Ï­H·Åç²÷la@Áé«LPOCP«»YÒJÔýf"ÜÓBë¸ |5#iùò.£>Y³e)-ºQV$VªªkzêÁ^6ù0hësjPI¶ÐV£f q*Ý	ÑâþaÝÂ"ã4¢HdJF	ÍºÃv~ÝXôcR««+3S¨vjE/ÍjÃ1¹ÀÖ+&¦ìLAºøUôÁükÓü¾Y©,Ó?{kxéÝwJPÇ*èÍIsÿúì²àÑ	û¡ÆÆóýÙ7G~¯¤jWì2y!zët,&À=}IíyED¶+)á},öx ÿF²x]Mï"èk°¢ÑVÎá°¶hn³ßËÉÂQç&M!qw[¸í\ÚL·FP^5DQ-½Ï:ü>¼m3¶Ð(Ï6'=}V@"Öç¨êguÇC\jlüiìQFKÇ¤VM'êÈÏgîÒú[yscä·.nxw8Ú¹iÛÏ
ë+&vVçKBW½âö3ýúÝl¦¹c£jÅ¶s¤é7P9 wJRòù9AºÇIrïRKìv²ø6owH°ÿ0u2ÄëÀÝKÑ}G¦Ïü>{óé«¾)'Ëá«ÿåÀïûíQyPIg ½l.a=M²ÉªpÌ©·!iÞmXµKìÚßW2òÏ¡êÜÜuÇå};1¸ïÞPVe<|¬½·bÅ6SÖò¾ÏPåNR¶æ°Qz6CÃ_¤Sº³w)dáÄ¡reTVË=M=M9³®¤ÍÑßì(S´8D©EE°÷ºjÊ÷¸tCW§÷ÿÔ*´ÍU°xwý£(Ä<s½c:
ÆÓ 6þÌvã{Á_qÆ×=}O,¯¯Â"µ»ë>Þý%eXÞ4ÚXý±Ë³
ýö~%i©¸wÏÔqÊOQbïY[q«â)GIìþa<#ûÁÖ%VÉÉH¯_V¯Vol[²ð6ê´þ­Âlü"RM!6\)#ÎRF1§Ç«44! ¶þVê¶Lî ¢9-KûÎ$Û-±âÂæÔÄãò¤NÏ/v^µa= Tx§41utï ©ÃÄWH²ûo;= Ìc#>ñxMð°_\l$JS¦ßkJZÖÞ<ó±#·Ãf!<QÎd7ïA0tç|&¡V<5ê»éXuC²GÕýÒÈÇè,Æ¨ÿ©üD|A øC~c¹p·¬^hõº °n GÑæSL¦·½VÓDÊ½SÕ¢~²ÖÍlÜ	Qsº}TêºÜ·CKØªûý»4@1e%çþ¤m~àÎ×Ë= MCµf¸î ¢bÇ"nëWzé^= };?ê|§,Hµ]ÿ±9°\×|KJ¶°Ö¹mÙ,XzÂÍP7ý¯ñ'D4"õhF°8=MÃZºgãJ"ªÔ,Xù­8»«âºâFt>Ñ§e90bXgåðU¹[q4ö1×ï0I>>xûºÏÜu·©ìç(-|°t¯c/«øâH5j=MÀRKïUhÞmH±=MY¾FZÒ}Í8×{q
kzTã6Ò8þJÖfò¾û¼bVYtÊan½= {¬Üsà¨ÑÐ¾µ9ô_ÃnAnÏ:ÂÌènéI]Áh{CÒEîÅÉzr75¥Umó¡
sGÔã³(|=M¥]ÌCÑ ò]JÝG¤àãÇx*-þýÝÍÝs ';H= 7ÍEFõÛMÂä	3C5
gÓ9ôÛÄ ku:= ákM£àçÆã=}L¼><.=M5TÏL¹bÙKÛ	°tñÄS Ù¼(®%¢ï*M^@Ï~B´þÆ$ Y)ÎØüCÛ¬ã4,©­ÀÖJ<,l4ªïG³ÒþPXU	QgLqá-T\SÊ½È>·çñÁÏL«=}½Ã(Vf«ÚÏá|fûßI  æê<=MQlU¬í= ¬UÜ¾©[kD¤ºB	øTõéÍ²ç«¡-,Èöd§
ÄNö3ÏúlÄ×÷.l.ó¨ºZéQFÀ^áiâarÜhº;ZnÞ-tw½T\5B]ÄD@%dë§)ÍiÓQ¡ÑÓ¬xøGÓN¤Ûo9´ä@ÞIÌØ(gc¼Ç"ãbÖ"=MXf#½Çõ±_úÿ÷Kê»çòÁãÜ$¶µ­}Wn®±­í4)ÃUö1£±sG±©Á1F*mj&HI½6óº$Þ.¼q¿VÓ»¸ípÆo=M¥(gSêÒ^îy¦ÊíI1pÀ^g3@tP®½t/løåDêÑÏF¹ÌÄ)úäóÐUÍé(%ÕÄk±±&ì´XíaÒ}î#SÏ{Æ¿:íÎòômz,:E6ºÜ5S9AnÏ¢¿¹k
pæ=}}Øôüò_ÝÌZYúVº=M/uÆí¦µóLïYÏõÍ©KÕmáMæ(|¢æËÉZuÇ*ÞùZk:ásGP÷ÍåÂ'RôKÿ|rò4Xì¬<Ñ­ÝÏKÌo9}njiç7Üeö¢éºÄ ø¹êäë+Ê±,(ê[kæuR®O 5 äí°N£Jv_ïn{Åê(¿ZxÔíÒÝ±ï»rC¹(»TçUÜàc¤Zh»3WU£ÚrÎ¼¯N ¬n­âéd·¹¤Ø¯Q­s®d Xu!Ó÷ÍÖÒ½/ÍQÁkÓn§=}x$ËÖÀ*½ÚÚ»%Â¡¿¦ BÿÄJ¹äº·õnHpp >§Âg?9i(Lcqvþ'Áf(Âzîjææ4ÅªHU=M?ï4Èý>¥èW-ÓË>tÛ¢8ïÜíA»u««õánvÊ®_¦´åÁhbwnÆ:xÉîà7"%îÓàêmä+þ®M|}NÈSýý$IwßYÜm¸(¾Y~²­W÷XÁÌïÅ4C¨Za½íÒ= Äe¯é»ñd·Àá=Mc®á!ö®iÜ}»'¨Cl¼¯#BüRío+DíÔ7¨"éMd«+ÖP÷­Î,(õ9í±×õ(}P3	44ÛQí°"C $EfI6è´\íçAxÃ¶§µR¿Ó%Ógè4÷EÚjð¤~«¯®Ï
/SyÓ°VjÓ-@}èzí¼vñ¤§/Q^:u	»þK»»¤v¾UÛxäÏ¿!«¥ÈÄø´èæ¹dzÍdÔo7¨(9Æ¨4$ä#E{ÉYïpnÒdWýt[}hìý_â*ýrßn'·'nùæ8ýmøýTÁ´¬I7ÀôØ¦2 oÇR<C5xgÞ"ï¿±+iÍBÎ£À^¾¢Þ¸ÛÛyØ¬ûòÃý;xäe[w·áËÕ*;Öl[?¿åúüN"yYþ;ny·¥ã°bÂF¬II¬W}*©ôÂ-ÙËßNÂ®w-Ï4E|%y¨TYõ~%íKÔ-ÚhNá5B ìÀR ³ktOR<ÙÆ(UCk¹­xóà³r?y2ÑÄ)°nC!xæ[SåmöëÆé§Ø
HY"Âóµ}huÄPO»M>2³]ã?õÜGò=}Yê¤OUwªÜ3?^ý£@égVê zÒ±®IKµíT5ùK;2àÜØ÷¥Åtìg8ývÝg>+)tÌáTÿô:©=}è½7g­qÈ³jd:÷	üT{NwnÒçÍÜËwÓNkI(¹×SÎèt{?"	«Ïô/>X~ªªO3/ù× Àw6ª;AO[Y=M£P¸½14fíõ\Z¦ÓS¿¬ËØ(í+8¼áqXJÛ³	HÕ«oÂÇZ;ÎH©1¼gubm¼MÂ×Ý3â»ëç.Ê£IÂÚLl°/([¸Ì7=}ÿ¯ð·l®ñßÚº¤åéié½½*Âlt3ÚñÍîvXÇjQx¯;>{m¡Þ+m_Ü¿4nÖÀ,HÂ:$÷,E5ñ ßØ\Ð9iÊÐ>(?Î}n³ ZTº#Rlí°T ÐPîÐóTP[Î©]¼Ú1y ¼E´ÐöNõäUÅÅ//a¬D!È^ÍP_×}vÁ^¯{&æSàÄ©®ÙWAV·áäuÌmK ÏQìTgÔ­~òÄ%Ø½ISï:-½(îDÖ»}hÅÏ¤Ïá9ûD@Ê|ðê9íäkÍ}µVj×½¿ªÏÃ¯ºÏ°oö;B¹(S1iTZV~0ë0A"Õûvk§ XÇq²§Blrw¦!§¡³$×'yñ¦¯ñZ;ñRñùv[£  ²·píWMó¤³\ ÉÜiÊc	u­¿R¾¼Ñ6gô(M\/pxá ãö.Ê#ï_S{ú¦?³Ù?Ø¢¨ÐìÏ
®Y':Êä8²(ç-ÞJ4ZD:øD;XÈ8âõ°á½Ðæ¬ýßæcîÝ¨;n±ñnSÏRÝhÃ9Çf§±º@l³oúo¿û@éÿ'Ö^S?meb5gÁ¸Ê§E´¦Ó
5gÖ
áÀsµ~sB4Òõ@<ÓÂÍ|w¸gÛâëØÆr½!Gd+éÉ8h©GÖZªGÚx&[½ ñóeÖÉBir7ûksëy^åß²G¸÷ø¬2¿¢ñ=}_ù27ÍÒË×jnkË¿ËgV¤êìVrÈ°ÉæÝØAÔ·cG¶Ûà°ÐÁFÀ äº/ò2³oétm|&Á¼C	 /q» ZßC­#¡ÏÕúë]°¶%Wfq p<¥Ò&Y1']ZKù%Ie?æÑÙ°¼ãòà³ßhBJIæÈºq;±é£Â/h°N	a@Ý×¡òpÊØ§zq7O5­RM¡=MVæfÕu~öfÆÙãÉRvëu?iÁxÛx±æ$^½©ú°±ÇtMÒ*>EÈJ+,ÿÔ}Ø&´â¡QHDõiFM«®WÖ? îÒ;ÄLÆrýPOõmãÀËÙqFgÖKk/ãÎ'à2iÅ¡VczÝè´*yëH®ùg?5_BñºÛ±¤Á K±jÈ
]#Þl
f7¾eÒºS=M'K\Û9«´ #þå
@¬Cô÷­>·è[= \¥Vî¶5-µ¢»â~/©Vw²wÝ
ËuÌcðw§+y}	sG:v#Ñ¦äi®	^yØ4áÍä^ip¡LÃIÀ;âÓ«É/ù[©ý#dÉõÑ;ÆíÕKé¡wÄ>.@Á#2jù÷J}¾;º+úÞ©	ÆuòS«,H*ÁÁh9½Úª$ñÉM_DêàSí³´Ô)-CS-üðtH%u­oò<¤E*RÔ¼Ìl
©Q}ûö0ëC%-_ÈÐ{Ó[ÑCI_ðCÑÊÇr<E0SnR	$c<hÕ,Ôºß>uF²Â¥÷Å?\}|2JFÛÎ²Ýìá+ªx¯6¦B'æùò,ê(hK#fß9×;ó-JtJjm«#ìÝqÅ¥¹<în |f	)£î= ö^ÌÏ*i¸Ý3Ñ&×b9OKùñügfl!B\ø¼ÑÇ½¤qú$¸íI)¼uÈ/¦ûG®ÖrÈVbÌeÅ{ ¨\Ô¹ÎÈW·5Ò¯s¤Û}Qª¾"ÇîU7x¸èìfì¦QúÜÙÓUèÇ÷=M{_[(Z Ðo;øåû3©áTb¸Ò½+·Ýåæ'éÞÉ}rÀ¾lOªFîö/kÔRmâBKà mæÿÓAù~Ì±À?ÐX«LÔP= ,(ýÎöà, ÷o¬<Û/ÊbFZ}fN|¬{4vc®Ûå\ô .x$r-B5eñmÔ(ËÉÎmF(kKÏÆÃó"7üùú4ÜÅR=MÉ´ÃÌ¤0è¶8Q®èTÐÁä¥'¼TNÌø4xNÖÊ4t²RÍO vç6}´"V6½sQs¡´ø·Ïæ´lçkX_! Waaíþ2!Ðd!Æé60a-ÆUF^oÒAÒ¤¶­¼= o AØàÔe·RÒzARª= ¯	!A¢q´m= 9»Òà>AâCµm¹ÙàoûLùÝ()XD[ïÔ©×½ç¯Ö¯Î©o§KSjDÓAÚ=}?~GÿJ/(øõE®±cD Õ(ÃDfÞEbJðä ÑÓ=}þ+(A;EêVëÊóÄþoòcõ
{K±{EÖVEÞÖEÈ
ñ´·ð|·òÄ]Ï]j×­cÛÝÅ¯aþÈïTÓÈr^¾Qjî¯L>²¡/N~W^;%§ÏV®ø£0UúU0+1ÑVU©°UþWÞÓ	/ºnV»Ù_Kq²[:n²wö¦²R"§Æoxb´msræ2Òøç³P?§rîl»aIñUGqþö0W¿çªþä÷ñG¸Öq[×ÏS1×ùÂp×êë%a7ëO_\fF#òÀ+1@¨6x	¢¼­qØ6­~léþBóÁQÖNø{m­Ýmî7N«çuÎ>ÛN«Q[¡­»;ËW!!N¬Zz7j~áû4úéi@+èSøB´êBXhgERø)>U¨z4#÷ªY3j½·"¿¹Ñn+Sc=}±Ìgô%8ÖQæíwÑÍ
'Q¼KÑs=}çP»×ÇÐÍKÙ¯á,4¢yçÂkÂyçÂyç©yçÂyç«ÀT\5'áñ~¬ÂÄ+<½2þWÓ^ÆªÀ[ß¨±gSfí/iñqQ¤ ÙßQíP¦wsWey= ú7$ËvýawÐÛ¿Yý«ç¿©g5»9=}M)\Ã÷X¼mCõ pj+ª¦sÓ,æ1qi	ÍqÿkXî¸÷= 2ÂªÕØ9°)'90öÌH¢?âv
ô¹oñÄY>èÖX~El³|Èé§*3ûÔuª³0þ
kïÌõg¤ÙÇÓeec[d«{5;ä£àC¨ÙÕÚB
Vó»x*
©'þÚç?ìökÛwQ¡Ýø´RàHºhàîÆ]4CÐ»=}ç!Y¥£mÚ¯5blOLG°ÕisVÏi¥IÏûûjtâÐ«1=MàØ­Þ,e/.½#ÙáJ}¨¥~ëpF4²®KF3²eÈfdJÛ ­ã¸ ÏñØ§kAøb[Mü$RL¸Âyç{ÂyçÂyçÂyãÂyç1/ÁQõf:[D0oBUí¤4Ù%#e¨¯²bª®=}Ø¬Ð I!^·\²Ò½&­Õsgy*jÞM]f¶Y µ<L²Oõ$nÍk?jgü¯1FúâàÉÂÍÙÑ¸ãàÄE¾ì¯É	iäÓ!¯-ú$2¼yÆ#jqêëì×C}©ìºtöQÚÜJÀñqúÒ
$4ÐÝ,B %f\fÃÓhs0#Jnôð=} ù$×¢'ïµ÷?±D~kÉ²­£C©CSs¾éwBgóüðØH°8ìh	NégÏÐ±Õ9sí»!ç¼ÓAP!»q¹X©Æmf§¥ÄÙsÂý ÆaíÀpCúÍÎm;W í]ËÉU%[º+pãªO0;HØ¿íSè»Ýï £)Ó5
akZnû }Ó[ßÀý3ó¨ñü$¨Sáî'a:>È.³7:Ý;ù>ÿNº\
61º=}ôè= é¬ëÆ§pÚÇQÒçÈÄÛiøùúýÍìJÃ¡+\:?9Å\ýò¨ÓÈZN|ä_èJ¯ñé= «ÊlÛù£Ä u3kìGÈñÌp¹Ûú+dI÷/Û2ÎøsÆMìc¢
ÈvI¬ñ©Ë¼¾®Ñ+èY
~Ýì+*ÆM4to°*În¡\Ö!ÏÄ1+Ú]åªTSÞ:%ÑBt(Ðo#QS@=}.ýîõ70ÜâT~[uIÕI5^8°=}T0rX
rýN8§îE°Tð®6¡Óõîp$/cTµ³!%ºhºv5Ùvqðu ºaMÂZ1aaT&boyhÏ4ßf¤ãýæ¾ª÷ù&¥øÜÐ%³rÎhfôwÑÝ¿Õêùxùì3ÛÇÜ·§Äã[ìëìæ¬­<Ììã&WèJhFrÌe=M|î¾VT¥@ýèWËVhÖ¨Ë×Ø7àK ~63k6 ÒùÃÒôÀÚïCo|w\¨=}µ
¦¡K)m¿sß7(ÖË{?:Ë:±u¯+  [ï×SXøøXÉ= R.jj.òn
*ï:ÏìÌr7ÂyåÂùCsçÂyçÂyçÂÀ<ß2n¢BqRF Zß-= k£k¥åQÍdI= ùeIh«9ä>ÜÍfèäiÂÒÐ UmP×foòêC²oåãXr¥^Ò §?)@Ï-Ø¨æyò¾¬|¡)ù8¥<ã37æZ¼îgwÀ2ñ£A×aBhqÏ½vgRè¾QKçÕUGÒRæßoÇIú*¸fîÌS
X|ðNw3P¨D	ÝÚèÉùØäX#¦)-Dä!ËÁº¾~OAÑ9yèåê×©ê{éu^õMØ1îoIuÇÙj¨¤íÑê ùñÙ£cêD ¬æÉ-Êä¸þ1Þäï¸òÓf
hþsspú÷4>hoa*s! XÕl­°c;«ìñÚ\çmI2»mÈ5ÞoÜÓ/¨ uí¨'Z¿Æ*©LùÕò%8à.ÈB3¯$ôïðt²sUoôw×¬­½ËqX~(âÐéEªÅþ"i3×Gadÿ=}¸Pb{Tp£0^pUØDÐd£p¨S0/¦XM;ò±lG¹= {Vqi³@A²ýñ\&æòõhô¢ZÌ.©?<<¤g%p~p2¥ØnìÄ8âHÕ®sTB»Òs¯@§¹ÍE*£OSE¸üÛññhÚèÚ1×/úþÈ Ó6çÂuþµE¦Û2"á!ìÇÁ¢ó ¾m-ë#Þ.:6î.6ø¥­4RÅ³¤ãyVt¡_ÎÅ1¤Ê4Mì_ÖÒê±ÈI^ÖÕZqÐó£]I»×sq };³³²(Íú~~¦aì©\Í=}!¨ÉdÍtM1»7E»6EmkÑÒ6¨bc ÂªáT!á4Bb¯µ¦N«&\á|o»Jà¼Õ¿"_e9wvÅ¾"ÓFFáâ=}M)óûà½Ô´*¯èHÓãÿþpI}9'{ìU¨BBÜaßy&EhèÔ°UÀFáu?-cÔ:~ï²§:.ÀoQ8ö-îâ&ç*à#_ª,Ò±£¤åwÐxÊ3Rµ9íV 6"WeÎ¿"^ÒVÅe9ñP5^BÊ>ÛXk¾%1WpÈÉ,Ïý»Ú~rñÖÅèkÚÂa~n»ÖõçPM¡¿åè4Üg¶leÛË6ÄnºP*³p§PÕöÕVÞ5eüLÕâ6Þé= ¸Õ^½¿§º¿aHæ»®Õ!sæ´Uaß?iY½^Ù§ÕvÈÃµ}Æ­òî[A*²&ÎÏ@@7ßÜ¯»1Aå·Íº¦KCù}Tã¸$mÿæÂyQácçÂyë	ä¹yçÂyçÂygïmtñmÌÌ5=MýC@Hë{P% EpYÕýYO~ÅVÔð-ÙZHAÎ5Åíz=MOù6mymKOÒõ}÷ç'òëC zdÓ~5¿q]W¿æ¢/)9{gºYÁhyÌ¦1Íw×SµP=Må(F6ã|h{ùÔz(±REÞÙ(gû4|ÔÝú¯ñ?Sò+YÝI]_¾ðþÐÑ´¶³?Ûüzªe	H¨3ÿHÛ¨ÁªH«Z:êþ õé_FÜ0\BüC»<í1--~gí^[­sKíý4-ç­Ðn-ãíÙ:mÌ=}íñQ-÷i­Ô-ßsíÕkÍS_j0\~³b6rañcn"]B¡]þc_RácÂ\Z= B^N]]2]ª[]^Øa~8a¹a*{]Òø])]uñÌ1ñõYñññèqþG±Üc	ÓI%\ ÚÂyoÖÈåÂyç¿yçÂyçÂyã%ÏKH××õÏÝÊ+øroÙP_Ò¼"Ð¿Æ3½>²¾Ú²CûFwwb7z7_··TU¦¼¨º¶gå÷dg&d¦f¹gfçfFf³ÇffdYd½d'ßÉ¯¹áï¸¸¶_¹]?ÄBYEÛæÉÜfÂÐöËè6ÂhÏ)÷ÙG¢én±æzåuiåyÑåSÏ*ìÚObë/â¬ob»b¯_bê?¨*K{Êt±¬©im	A÷òuô±Ã¸\Çè}¢±³¯ÞßE*Ýí@·3bÃ³ ý?F¨ÂzüÎ6Zk³q²½[mÎ'æ¹!ú)ù T:¾À® ù1uû	Ô²ÍgìÜí©|]tý¶¤'O£ÓlxÏ_Ð¬×ÿ¬=}mï5ßéÑ\yÜ'¯<W¼*Ç|$³}C|ý(»ü+ü%küëöà=MD*öCªm@·B[ÖÍBÊõICú¨CÌöC7Ì/D­fDÉDXðºDï±áDÓ/E´p#E¡<EtÂWELÓtEðEuh EËØ±EAÄEM¡×EuùëEIEÄÎF²nF)F]"6F6CF¸ÅPFBÑ^F±XmF[|F;ÛF.ñF¦,F¥¤F\]­FR¶Fº¿FÆöÈFÍliÌoyçÂýwçÂyçKÂyçÂyçÂ©%7\í4j(>ðÕ1Î=}FÍØÄ_^ ê4Î§/|ìDÉ>mî¿|Gu=MÖÅ(³NâÎ½ØAGÜ@}Kö²*O â¿zÏìo ÊÎ~û[¤*	ü.aê>=}O#= =}ÑdÏ}ª"ñ§íwðå/Íàº®+
uÎ»ø|è^.¢²íü¬(d{:Ðq!eÑ= {O×*üðëÀ¨+g\.<GH}¸åT²wí*ýÈ¸I_Ø³þãÖ±Úòªà«Çs¢þè¶Ð»ò«Õ÷Eñí2ª£ÙåR©wëOÝ¿8¹EØ¾cÓ5@O= ÛÝ|ù1ZWËÖË{¾ïizvÌÅº[t	/[Êí»q+¤F»ZcKuøCQÛPh V¨6+1%ÿS¦½Ö¾= Có>kQ³7ß²a¡¦@·"/ûõ|Ä*3&¼¸ßkâ¦>ï¥EGø8¥ãpYä½YðÌQµZ¨Êä¡5ëèHßÞ§4µõÓ>þM<²~ä
ÒSýÔdVGÐ_nÄ°Üõx×põå(¶= ðý»ûhD±è×t­©Éá(xjÓÐßHqHæä[Hb=M ØÂyç;çÂsGØÂyçÔBrñåÂ³µÜ-dÆÆgldá7TÊè«Y»¬>{âR=}´'Î÷Ïô
B(ù9/+D}ßÓ<çn8óö:CYðèpR= [mµ @r= [³Tz2Y¿ô= ©Ïíÿ¼¤Û©õe)Àð9Wä5"ã£bÃ¯aè¥ÃÂ£wÆÈ*ûòPExÎ÷"ëÖCùùØfÂÉuÂµû®så*øû±ÏtKw(poÙ-+-ü=}2YJÍ¥àh¿DÙsÕ(ª5#ÜÂÇÝá7h§Â÷èÉçä¨Ç×¡N A¿Cj m{}ZI °Euàb×þHkÖ!¼cnBüÿçvxI¶Mì29¶¹Á<âí·Â:ad¸¸Û^EW%4rÈ=}YN2h>ÑOÔÎò"Á,TÎU%7R6foÌg¢%ä½ëÎ*()¤ðùÔ\3zH2í¯ß^iå£ïÒvb\Jæ	Åê¸íÐMk= »­7÷é)'ÐælàNüùÑ{Dö§/d:c~]ØÁòRPU½è¶oíÄ3Èëü Y£ª­±({»#Äá7R[½ì9QêÝwª£+;èÐÛ ûÎbÅ»hÒµðûXù	MèÆ"1.î¤Ð¯pú ²<&
^õ ÿ×lXbYQóÕëÄ&mÐóË(÷«·p½Y9§#EÁóÅI«û¶PË:PÀÃþ1ø<6ñVn%2= Ü±û6Ö¶5ekW®f)&k÷u+ëÔúgY¨wrQÕçDÁ¯dæîÂ:¤«áÏu	Ùä»m|=Ml¨yçÈ-çdº9ç¿yçÚAçÂyg úðúMänÓ	Íø¨HÓ¼-H> Ï¥Ï¤CÃÏÅÆo?S¼\}0r'Rý¸ z¯åÉs^©o<"ìèMjÝ",PömÐ"ì¡1Æ4çÑv#¯è8>cÓÍÐýÈ'¼è{©ÔòÇXn¢ØpÀ²XínÖ  à².¾&y²¿ýÞ«Ù,ñX¢àØ°Ìm">¿Å<ÿó¼Û:]³ómCzJåÕÿÅ·É?S#n-ÈQxÝhò18q[Þ^¨¢}	ð~j[dMQòHXcu!Gó¸rhvÂÅ¸íûÁôºiS|óF»sÊèÚùëT¥Ô2Î?BÝ{½%Á'gÀn7:ùgå¼%V,X¨5Ð V<à_ùã^HåÅ)Sí)¸Öå¬ïZÆ,é$ø-<wç(>òJ¢úäô=Mpüæÿ,+m<Â?Ükó¯äw)¯õö}àâªìá¼r¨Pèñ ê«Rþô%Ú¡ò@F=}suÁHé¿ÿäøÇLé4Àjðj 18¸:?	ñ!6iqì%pqW¡QÜù&3ðº_í÷{^:?¡ÃÊÙP¿Gè}£
¯4d«Ý/*üÊ=M§	+Õ/= jHrÒ3»ÖÍs4cKoWðâFÈìèWFpj.¦àe{dFü9{}SñÂL÷ÖH¼ÔtÝ[P
oÿ3¨pK%­ékïéÊnyþ¡G~¨,ÓRE qðUV¡sç*.5ü¥.î¢8"_n¹È#G¡|È·T>RÓacmä"a¶éaµ«¹&ÓR·ïM©ñ9öPêàìºÞÓ@E ºÕñ¹ftu?k§i²æÐôüTMáÉFKÝqp±:?;õ}8a·	ÞS¯=M÷HtªsTµ-nR06'Ý?Ü$µcÒä@$?ï²2hGyÖÖ_ÒùBo¸Ë%×B¤åÏ(ã"ff¬AÝQf¢pÀÎú¿!ébvm¹A­ãy$alÏug~xÅÌÍ<G®Ðù=}uÞ&= è(¼iìT¶¡/_²FýVëfmsj´D?}¤}+i<õíécªAÆþº'ñzðjs}ªG¶Þ*VL	3×oH5æù¼#îêÈùÙçJôìËÎ£J#k8 ÏÛâq¿ÊýÏø'33s´ÍÎÑl¶ÛK¯ÅíË¼ÄËü§IËö7çì	 ;Ç¦
^ì+rÁÄÓ«¡
XÊlu.>Ø9pã±,jðýïh<Ï¿INnf[(Ö©om3D¨»}í(G$Í¾¤Òùp= 0¯¤"ÑÒéÝhR{su-=}Øê×§ìdþ±îD( S pHSï5TìOLÿ1Õü[PcH
U8![rÄ>á°;0^U
£V*u@	WOTH©
õÔslø«M²2?>4QL"ÿ1¿]Ø²W>MEàTñþ<D£ºù´ð=}sJ=M­Ôú6L<ÈËÇ]ÔþÉQàS"íÃ»¤ÝÑ(J\Îèä¢)cÖËÏqä2 ­À¨UñHDjxV#Zb.©³·D£]Ñqõvzraÿhûv\Ç\j9ª£ö5´/÷VIQylZuh{PÆÈ³C§Ü¶xÎù?]áÙ éym|i?*À¾±­¡_æäàÞ¸fæý¸ÄÂjÞÞÝÕãi=}	yCÇeýÊÁ	I¸ä×æ¸èÓÎÍ	XæÎ¬=Mî^Ðo4(îl<¦é¾yçÁúq÷¸«¿ypØÂyçr¿yçâãõüü¬>ióôß¬×ØÏÆô'õÝJ[òRINöÝp¸Û©õ?¤JCY;@¬|*CLëØ¨.OvS$¾·åÃrR#'-*uP±ÒÑòÒ(9BòíToÁÒDe¤^nNî4Ü¦ymV5]²ÐwY¼<ÏÂÐ;/ÙÄ²=}o§ÅEïÙuAÞ¨4E+Ù8äbpM«"Ag|ÙàÒNWÎgÞØb29ë¦²"$+yM!Fb v¼îò-7¾¸¥«yÙ£fwd?]ã%Bä= çÇãjKy¤¦z×ò-Âtæ~·9^øÄ?Ì×gùDÝùo[0ÊÁóSÀÇÆGÜwê;(D(òT·ZhòTÙ/S ©$æÒ#¨è}n£?ÒD/ªñØð·Ú¨íØËÕ:|Ú7¶~c ¯i5ßÄnöWÊ'»÷éäÌV)úè'øZïHKÅ¿6ê´j*8i÷	~¾É3ºI]ëpÈ£#Ç
þîæ;ji î©Cû7ÈDæ'Y¿Cô©ïONÛ<ñ·ýUÊ(õùWýFkK1BÐy	DëÔ§s¶Ø«ùE}Þ«r=M¨Úl[yÜ÷wÕÈõ%Ôøá°IP÷+PM(ª%PÐ±,¦xEc&ùül¾ßc<_O´ú'Î-À",< ÿOuª%Ö¬­Äç½ÂDÒ<bøÏg$)ÎåÜI¨ó×Ï}Æ+Z¨s%Þ3P²ÌØ4·P>ol0Q'/H-]C*ß¯DBtæñR?¹>¦)g¯ÝÊòPTgÑ<{rIÛÓo%×©èd¶7o½æ&×ôc½O
k(³Ñ}ÿ(2²ýrÒF<*«ý$Kó¦!Ó1ütAË¡¤T£z(e¨Pþùôf¨PYyçôÿF]\>ª0q^>A¦p¨ ^¤¥¨q Æ8ZmÁ êç°îjVxq6§^¦&³°u@X/n&J²êáÃÐvWÖÀ9µáYsmnF÷G³¿~jF:°ßÚXLÚ"Üy¥ãÀÃ/Ål?ãLãÇ\õ¤Í¬®fcrÈ-Û>dø¬@á¥Ð{Öpè¯X:Çrme¢QY"Õ§¾ ¹wBÃW¾¥]¡YÒxZëÛ²à5YE$Õ-Yé{ó\s§WiZ:éñ¿8#Ï·Å¸CÛ¯,Iòz0Ù×oø¥HÚöñÿ7:+³ÂÄZÕÓðtJÃKñ¿<Ä­¾3ÏôÈ¯×[7°c}-#¾ñ«k7pÊ	ÞTøhÐù%Q u:îù£.= -Ñ¸b ÿ°µ$·¹ÑK8Òá­«å1t¡\KËÌß1¸Ó±@´WEEÈ ©y±ÄK8ÑãÊ§¸>ª;oáø> ¦>j:¯WlE#Ðñâ ÿ¦~&»¡?Ý°!zaMä*ù¸¬ú}2NsEåaá-5S È!û5.ÈTÐãÊ.âÛ#-H-îös1
n¢ FTï=}ísÐ#o0íÂ\Î -^£VDRNî±h¸®Cdÿn5³°8Q÷7¯ºPK%·òÖüH:oÌg%GèðHÔÿÅ·¨_ðhê7sýoE6'«_ = Â^üøv»5dº»p¤n1ï7]9= nº]¾ô¹c!o?aèõ¬Îy¨Íb!Ca°%¶}cQ°²m¬&óv2)]ÿÅ¦(ÇË?(x1IØÂyç¿yàzËEçÂyçÂyçÂ):!)XG¤FÜÍ¬ñF©í¿©e¨@¸õpäU¢Z÷¨Êøpí3ÿ~Æ$^ãQgÍQî=}:¢z|]¶¥KiÈÛõ²piCùozN¯èDâÅµÕÙËëè¸Úö­z*ýÜyÅA³H¨÷í^&;×¥êÝWÓªj
©ïqØJ;*Ó½¶¬§ $ùïÒf+×Ûü ýKÏ7êÍ[·úÒÛü¿o³«Ã(ùs]~E=MÂ=uÈ+¬¨,9ÿ}àÞ@°ì,;ò¥ÈKTíM"#.}ºùv$ú½°a¿NXë%NÇ®£>b¯y¤Öb¤=MïÏxd'òðõ<³jåDÎ¼öàü@ÍøÃs	G/Ë"m÷ó³ßPEi>Ö²²]]¶~M }{ çC¯= 
"±Æ$7VÑäë@Òêd±n©#¯ º$#»Òü}-L.IJ)IZdÈj¬÷5¾[º	;Õ2~Ç¹PT.çh¦7~ÇÔÝ.kV0Ú9=}ÇPòÂ!¿O0Ú4¾i®Î®;1ÐÅYr\¥¨Ùq"QpÞ¡³Ö¸e7ï´ØçÇ	aòfV¡!nA ^\¤·6p%®ÜsÂÎõYý[5 ´\úNÝà6Õµh¹º>¶©V=}eq×¡Îßa¹aEd1ú9¡è+= 1ÞÔ¦OïweÉ@»RþÚ&RtÐ«³íë¸½øÒÇ&kKuPói©ßq2Càuìâxô´OúÛÜµÅbsÐM©ÉcúÊàý»Í	À&·vÜ¼Í·MÛ:k'Är'¸jsüî¬Mæ·kûËG¡ÕH2·×§Ä&¦}¤ bXêAuJÍpæ.?gXê)?²Õc2
½ä¤ÖÎØoÉ¨Ñò"¡Gd8e0ômÝn°Ñìe"Wcgxåo½
¸Ñ "ö^}xú°½õªãò~Biöæhyw_,xôx?n¼ÙÈÕB#çXèx¯+Âµåòï/§u«xÐÏÜDM@çÂyÇjÂyçÊæxçÂyçÂyçÄAsHbÓT â¯[*I±HJá ãÞ/O 	InÿGÓo÷vÚÇHn¨ dé/á?ýkHjÕ+×³g«µåb"ýegÝsj«y¶ @Üs×D«vº¹ µÆésÿ«£6ëCJí!wî4r±= å ±7
¢_8»¹4åN}¾WÁnÑ\QU¾ÿ ¡nÍBÑ¢O©ó wz52H_À
°Ôü[}7Rîun°ÞXÖ¶c\ß­ÀrAÙË¦èyAtFfYÃm¦bAñót9ãHê´¥ÁS_þÄòòÑlSó¥²èSÙÎë¦Ãí¥o&&0Bu/¾'R"@ä^òa÷%CCxöttèçüÙ%?¨lôJß|m-Ù&O¹ÅS'úk<ÈÊuÔ|ÿÁm#ÏËÆí9Ýnd0¼àYu¦ÝÞJ£ñ-Wµ^¢å¡8ÛweÞCÂà{y½©9gòd×Í¢¯9©2gVØÂPhxE¾ÖÞ1ê:×ö¢H39÷;d^è¼Æ{ÅýØ©±Ñc×ÐK¢ym(ó/GúÐH­ïNÓ µå(yÿF>!}H6õ$cÍ¯ÆïTiSá2ß¹(ÑFF¢ü(á©oþ,Ó¥kï(U³FþØ kô4½è¹/árS´©w(D¦«~ÐÉìäáÝðÂïï"ËôÄÙ]ô[Ì)VÄ!jTa´%Wô#kdPä¥^DªZD©eD¢Oä¢c¤gT<aWý7ã¶ovö&§íæ¿N°º  j !6%m}Kíß,­ì|Í'9¸&;h©8¤:Ð¦/°j,pe.pj-°f/Ðä,é8hæ:8ç9 æ;ðK(l(¢ªv¨öÎä·N§=Mê)-÷ì½ôÅ<¡üø¹\þ¯<ñ|ÇòÃÜ«3áª=MEÌ,ÓÂyçZ2Âyç>sçÂyçÂyùs	µguè=Mâú¹®Ï¸¾ÚHâÆî÷}¦ñ¥âåód©{ahtjnÙÄèö6÷òw¹²÷¹¡Ce+èv)Á
:÷}ùâkA=}÷Ô3¹Ê[§s+÷©#¸É;eóËv	Æ!
²öGâ§ûe_K¼K.ú_÷¢Û¹ÃÊÀAÓËÁb[»K~	ÛbØ»b û ÿ³Á	{wu;wh+÷ãâ×¸we½nfs°ât7}A¨7®At¾å= 7l¦ªU[¿¹	óf	òe:lbé.rhNÙ±â¹×Ùþb÷V÷ÑáâAbf÷½â¤bþR÷ÀÙâWg¤7I{/ÇÚZ÷iâ#Ç¹m¸QE#l1fÑMbo¼á)n)(r)&z)M+àMq ¡!Ùø=}âdwf¨ñ÷©÷ÚP÷°0·çµ¥Î8µâub5¢³gkqdcrf¤¢qI£ÙxEâ&È©WÉHwªÛÃö=}²ÌÆ²ÜÒçQ Ñâ1â8h]V8z7¿Âîº~âÄÁÎf×7¹¥D­Dàïév7CãÜ»ÁJN:º¿.Ãág¯\G'¸ÔÒAâ«ÍYâ'¤^héxá´ÍÁ9â£dh¨ÝÖx$y´ÍyâôAÔÍ]ùØ<wzhàmI;<(×V(åuiü:
Ì¸L<¾Ü¯Æ¸ÿ}*Óg"<ÿ½*TLJvÝ/Ç¹ß|ºÑ©ÛìA;ý/
PKÏdXÍ88Ì>¸ÍRxÏz.]Q.^xð®Q4QE6]&à­*tN?fÜBÀöà´÷kÆÏë3Mö=M¡v?nA£ÔÍA\õIBÃ¨B:öB¥Ì/C fCDCïðºC½²áCx0Dq#DÕ¢<DÄWD]ÕtDjñD)j DñÚ±D³CÄD¤×DaýëD0NDÑEúqEo)EÛ&6EK;CE¿ËPE*Ø^E= mEÿd|EjåEïöE3EL­¤Eue­E[¶ÍLt ÌxçÂiûªÁyçÂxçÂyçÂyÕ¨Í x!>g]ás7¯bæÛ$õY=}XÿNúJ/ËØR^-H0jd¬¡ñ´ëcV3Á4øoOÆßsZ«K.ÞûafA¾¹J²7ëQ-KÞ<÷«põuh­Öçp<âRªõ¾)9ÿG2ïZIcÉ¿è«!O´ÙBÚ½ÓÞ?³PÝZ/â8¿Ù³Ä[VTa³Ð÷ô*s?	ÒëM16Éðòé(³ô®%¦e.ë×÷= EÁOP»êmé(|ÞìÒ(´jÌMË<"æÐìá6z%ÔYÕokÂ>vô]/õ,8P+RhÑ»©½ÐJ=Më%¤AëËúÍÙ4'2£ËÌcëÌ>õ@?ðÄVýk$Ê+Jÿ(úWhÎ»c}\+°êz×üàKNùéüáyÂ)ÀÈ/¸©-2ò&	º#Öÿ=M£·+@ÿ¬@)Aµ\Ë+Ù3b&^¢DÊ>Ó0ä²Lc3)Ã?½áªa¯HtE!oÁk¡îé¾~°%cmI¸>D|wP±|
~wÏ= 3XOÇý©m+Ê;*óÏ¤d$ÑÂ´ß¥ÒUï8º:laq%¹·ýÕ®¼Õùiøs)löÒ=}FOdZÌ,åÂy§«yçÂùrçÂyçÂyçê)îæ÷ÍT%ô
mÁ%Ú	E/e7?ÊÝ*×à¶}ÔH¦LiÚPë¨ØÓ 54i«zò úÚð_ý8I¢ÅÔØsÖô:.	¢9ñîñÈ´gÍWýahjÈ!
w5ÅÇ*µÊØ>èîÝ9@a{qÖêûçá: @ìûÉhúæÓ0ÇHJÐýESü[EÖïHGÁ½³½IÉÎEà»jìåèWØ;É»	aÅßµ§¨§oÁ!{ö
[Jmô¾sä=MQ;}ÙDÿÃhÛ»Û+Æÿ%ÍïkÅÃG¢0vÖ{zWãK²sg3'Ek;ÐFmÂâ<Åj =}8¦ÑÅã:Í*UU¿u°peF_µQþ º]lÙQª+bN>º= ·VØkAñà½BÜLØeWífXØÝ2¬]/te¬ÛÛ©@h@ðÒ'/(Ñõ=}Bms¬5ÛþÙù?SyÊ1ö¹tÙG'gä>6â2jØ~pÜM3°jF?XåÊºÐ= Ä=}w¦ã.þÍ/{(î|$ô
r
KìÈr,î$Îé­@ï¯aDQÑ(¦+ÞÙt= o$¨(×®UýxÈÌPò12ÝIE·µt²½=};©ô1¥h¡QÈoBGÆ~K¨S¶xJo>ä¼¸O«E\ÎÂqXÉkZ¶D±¦nÿ&jà^½ª¯"tt.ÿ?/(gdF²Ûæe%àÍi õÒ@Ç7 ý¯«,4ÆxçÂÙ«ºqçÂyCçÂyçÎÙÂyÈX©I.öÏÖgÅ<Ê+¹	$µK7l¨Cu&%{PÖo<¢[ü~ê\hßþTq$f¿ÉëÚ¬ðùT¶cî}4º¥2þÒ$8²±OD¢}FIªÝ4[¤ÈPØXn	üÕx§¿è Zqì´uð2YoÁö¦ÛÚlÙ ¥ðsÚp¼ý8ØúÚÒõ(ÂáÚmÓh¸ÊØOM<«¾­üUeLÚNz;®n §#o!ÀY¾Wåz%z¢ohÁ¨
J7ÔdÕÎ?·4¥¿¦õÁ·dOfJhiÓ!÷õôf[qÎZ&ypõ·YäÇ¥¹Âü®ßÂ¾aq'}ÂÆåÍ)$ûðæ:N+ûò£lúßhu ü:;	9Q%+k:ûóúÒEVáM
Q+Nêî<jË|úò]*øHRñï *óPòb©ðê5PËªò÷Á?8ê"ÝÅóãHõ1óE%¹#Ý\ÉÐé£½È×·f~õ¯»¿ÄñF¢åCÜÄUÏ9A{?ñó)
HÆÔå$úÈßÞ¸§1+­= 	%}ÎW³$¥IoÃöÚüñWzÊnïµãÈíîÃXhÍðð	LOãêâðMÝ3îÞJoüÞÜ»$/æýGwZÌ?í{	ð}Ð[®[ì;Â	òã{°Bø.ÒÕáî³o¥x0d8ÕxWUö#TÝu2ÑÞ¥VÿtªsXqC[¢p_ezÛ£oÅ(7#ÖÿÌ^ª ÑÂ]ìÚ~QÊF4¼fºVXæ´ØT{qxcÍH\L¡µ¶8F¸ÒßPAÖ[·o,= Sò¶&¬¡2Ãjw}ÇYéûæ)´¨ï=}áÝ±r*»¸dÊR«%êúBÌHæy³%¨mÔGR(´>Îó©=}ÃQXÔ¤|uÈ5¢²8gnR½·%Î)òÐ¤	¸YÅ"K½0¸áz=}7ª½rÈAWyôûqÏ=}]g^xËmÓ×vGàËä_Ià{æ"G¾ßßc¨T÷ÐÇÚ(y~òÄfh%qíûRC.éüÄìZ~°K,$íÕfO[:¸ýÎAàÉóÈ%bòÙ¬;Jx%ñ;x o+»Âê«4jXð¤_,CQ¼UnÝlÞ®'Nú¦\âRî9YmHS}j!JE!ÕªþT!ÑµÝ0ÇPÿô|goäA¢ãïÔïóÍÚ!Ðÿw%óû0@W¼¡Xá ú³<íx6¹Áµ ÏÑ1QúâKjO]ûKEgè
;pæç@Ws­F«sÜÃFÅXø£q Ñ®SåÄÕíÃò.a¢WÊ*Û£ò¿6B«[D@®Nâ«4®µº~ánÒy8í¥¼º[±Ú4Ï9´¸çñx*= M°Y^Ó6fk¥R!Ig·×µòdG£à~C­"ã(¨^Û¬Ìfú@<d/;¨'uIëwRòÙ)umxo¦Æ¹(!À½µ®_¶ù$z÷lbmÕ~©Ä{ô.BÇ}^éÔ»õq$(îåÂyç£ýåÂyÛÂyçÙÂyçÂ'ìÿ{Ìô=M³äVÌ§l³¼ò¡:-®¨¥2Öìã®°íCï{ÑT#sô8}ÚË#ÓIV18Í$UÂ: pöUÒ0V=}¥ 
T-:Y
&uÚ×¡7Ï»>x¡qp8ùGqõbov(3Ö­¹;[«b¨sÈ aL¶© ÅJhs!]þ_.¾Wj7­*µØ¸Ö
\òã´¼hV¡qQ¶øåµÖwAè&á¤N%²_3ìFKéADKZI;@D$ºÕÉ¦tÞ°4OÏIf5v½V§ÊÁ>ÝMÃ~ã\ÜÑ:Á»å5àÏµ*ÿQý4ÜóÍZ¢v'<¬Ùâ >pêtOºJCÐ6Þ=}Ar=}½Ç]â?íQ³C»¤üÔé ½U²ÊCqd%;ã¤]-{Úv"*C³äæûm"dJ½ÌBèüÑ¢e½»ä¯bX=}½ÒpAûeßCÔBx}7À1v«9ÙÒxø{èGÆùÉÌªõ®W(\JðÌ'S*}ðS ®¨gíÐesJãD_æ¥K:8&ûNÍ#h^iÝåî¢Â'éz°é~o>úÈ¤ûZÆ¤ãÖHtDòÊ©3Ó¾ù©3×^ÈdÁÑÏFêúùëI{²,ÁØ=}¾Êäà~ÿÈ;IôGÏÒë"?ñ¼KSy\&'Lùú°OZ?pÿìLH0GJ¤M°tßÜ3¤&%NÔ¦B¶îß%ÖÑç­/~Q$2Ví4Á¯?(çì>¢Q<O-9ðèðr\ ×®Ü] ~ÁaÔ§NÒP?Q@ oäëÏÛG=}/neÁ2"_Dâ /](äys½j_1<ÿq'_ÅË?_ÿ0FS3}_ÕÈK¨Ø@Ó ²±l0TQ°6¡»ó_±mÄD²À³ÿòzFEÎzpÜ´«ÜX:ÊÙp]b"OrÝç-§­ß¾e8Ïñ¦(»ðÜ( ×ù¡ÅðvðýÂk*kð£¢úÊÊç"üvV=M+Ôá"îÁ.Z¸5ÎU³¤ñ}cØ¨+9MôbýÈ^ððÖú4Om%ñ@ù8sa&7$0´P¸ºuã7ý´î[!¶¥?Æ¦=}ë·%kjÏA¨¶Q~y9Õ¸+jÕ£F"£àïÊª@<ñÆ{Ð	W/j±YÐht®5´¥!w§´ëNî´"{-¬¾¡¿cfu{Ï_'{YçEB­©âAoD(ì·|(9
¿¿Å¢y¹jëxg«£ÅxCçÉ¿yçÂyç5	LÕÕÔ¥á«¼=}ÐKRÿs
uá;¨UÎD½» å1|òC¨ ËíÞüSëµÚÚø¯è¬¶0[V~^Z©U60åÂb	^°¢3QÙu*(²a^&ÕurVÀ^q¤u6ObÂïpÅT¢9¾Xþ£±³i¢Ö!~ðê/×PxEvÒÕ?Tª%þøSÈ_*ÿa è_lL£ÐZ= pÝ=}Q p õbðu».÷ ýdmW1À¡dGi¥¸ßÖT45¿EV¥mqÈÃ¶,^6¸·bmþaR:·Þ²±VO6YË·Ý¿gKJ·-î¹ÒúbA*:cSF5²ö£³ÚÅU&wÜ/³Íå|Aé®ÚYÒGv®]¹Õ89(ºv½ccþ= 9ðârÿ=My&Êwo¬Ùïú+©÷\r¹Od¥¿ÝË´²:UÆ´
­íjI(Ëöñ³Sa³*ºáSø½J;¸}6ß³Â=Mç;%¬¸qLq¾=M>ÐzË-_0]@ðójO°C$ýÛ?/ødcyP=}Û»'?ßÌ¤Xo0Ò§¼÷¤ËÔ§mlÐn²hsÖZ_¢Á¤>w%û¼%?WØdHWÌÂÚt¥.L{-] Ve#6ðÑ¬û¹òÒ¨ÿzòDC¥ÿû~jê¿¬Ôè1"PÛ¾pë1WnÁ9E§rUÑËbDnÑ= E7/¸ÄEvÑÄ©âP¼ò§ÃAÇF¸y¹õîBdæåü±æ·®ÂøÆm×>grðçþë@G
HsÓk&XTÂoúë¸IpÛ-%úç¯DnÓÖJD<áÓ_©´¹0÷µ/ÿ()bóTàn3PúD--®Âä¿¿©Èø¤ª?J¥Úx©ôNÔU#¶Ä\$ûÎ·Kh%Ì!c5c:Åþß7*GèÝQÊz= Åí¼Í©Ã;èEìîÚ¸2Æ¢ÌkwØ7I\kìà[J¥þ­üSÛ Nþ#¶Æj¤qíEÝ§ _ê@·?=}Õ'½ËäoE+>®$;³®ÿé£lkb.-òSêKB­ãùÓÜRúËþ3çÙ«Ï¹
¹ló)äg+LîÞLºè°Õ6µÖLò?§,
8ÎZ<º?×4¤ØÈl@²|ònßO4×Íq^4sNÅ´ÖÆà\Ò¯ù$EÖm1íþcDÎÏíôÕ¯æ{tøLcFMPZKQÈGû@PþÓT0W;ok®!$åL Õç¯%	ÙrËtªRïÀ1òÃ=}xüí_cÝ'o¥þF¢*½ÃÓ>y(»kÐõ&ÓââDØâÐÿó¿êEÓ_ç ÛÁap3|Î=}Ð»T0	].cøµ¸Wðñ¾0¤ªywvgØÉÕr>³"³ÜCw· Úc±ü®= û°þæ>¡A¡µ@²íGó"uxºTopMFýÃÞÝC[ómFG#p<õbÎn×>¼"ÕPúr2¥¨6×p§T"®C¿¤,Øn¸@åàêÔ²PYjuBeÿÔÄO²,¨Þ(òó^/£rM:	±Å5ÓØ§¸ ò½Ç8×.ÈÈ¥<+¾îQtÈeÌÿB¡#|M-~Ã}C;°ÀÈ}®QøÊiÐw.ø64!9rÒ©nÚe"¯jeXþÎ
ÇgÎ5·À·VÔg= ÖÈ±H¼:ÑÉÆ íÑq(Ék­Y%Aqødf~¶x×·7Swe7DtkQo×7ÅýÄ\V"@b.¿¾Fý6ZDaíá= Ñ¨ááÔJ¹²áÅ¦w9áÐ¹µmÿÿ&¸hw¤ÞbèÆfjà.újWu9óCà¶Éªâ½}_IÚ{öeöiqI.g&<ãÌxë'¤Á¹¯Ø{ÐÀË½28KA½@¼ÓÍ2âùxÒóW?G§(zòôº">ÊÁ|AÀÖÝ"ªøz±S®!üb
ÅÉÉy8zÏ5¾yËÂÉË©?¾ù PÃ/
G¡ûl~hò¾òT3M©(Wô0û:*(÷®gÅ¥°:2	ãüPCwáÆZõòä*þ[üL¯úÀ*°2>íx;²fÉ¸ÔøÑ~+Û²ßÓøJö²ÿònK¯	4ò?qÒr£dvDg
çs/Ò°!~uÚÑãÄyFPyýîÿu	mjõ6)ò©ÔICS{
¯×S7FVÓù]ªgÞ= EÖQo ë)ï¦$eáoä,Ä4Áº*|ó%õphPúê|*|gP[Þù*/-ÎvM£lQ¬:Ë6kÕ=  ð-kîk7UûÀ¸Uâ:1«\Qr®Å\½h³öa{4^»!!ÑTrKbï4ÞAt>A§¦'Ùª_ÿ)tC\n4w@À$òÂ3Ã+£ÍCä¡lÕ;Á= CeF9ç¢ÉG×·ç$¦lÇn×sÿ&Áy©æÂyçÂùÛæÂyçÂy?Ë0Nj¥öd4åÓN	$iÃe$ÙNØC7q7ÇþfEiÓÖ¹JbjÐdÆÙÆ¡Ì7n/J'õöæÔæãRúd'Ãç4éRûB6ò¿_Äº©ùðÁÇ©Øãù°
zÓ= (PÿE|áü·Ã=}úy|ú¦Ië(3¿ÿF%bÓUJZ¶ÓDÕÃÙÙÕë¨Hh(Úïn}y#ÏÇtHçQ¹:®ciÈ
îîô2BÃ§Áè úñ2D×ÙÉÙzbkßû¿§:£wTôí­Õ5BÝÏ®*¦QÈ0ÕíñRA;ßÇ5KÙ×'ÈxJû±;~ÔÓÝ¸Jbý¸k÷OE÷oÛ'+Y	8¥	8´ô³TSKÃ2õÁÖ «Q;	ðÿD¥JL~=MjÂÜsx÷þJón°>Ã= 0¹0.;>ù\¯,O8-J1Ý¾d×YO +&nùÈþÊOúþ¤¾r¤¡ÏÄ'uI,Ø<Ú<ézEI¶Pt£CÎæxÉ/= ª!mâòÃ:QTþ5NßT Åå¯è¶&Qö&±þ 4/ãRå2Öã] «LµiÖÐÀä?bì
>=M×=}p[åQö°õ^Npp¤m.×òxå3~ìºÔÕË1:$cÄbkîvKW½sÃU(É6½÷ÐfMrzZ¥áquFa² F¥sqÈ{pj!p\¤gZ­cg~o  ±;7x°<Ð®^FÅ³´ÖµÒ6ï	}®ÖËÇ= Âê=uiQ£AZðâôa_/UÏß@æ¸ã|©ßdR¯¤[óR©Úñ
{·?ÀÅPså-©8B
s7µÍÒNe&&8ù{lÐ%Xårüûa«ºRXqCe\ÑÐÞå°õPi7Y®3XæJ??,< ©y'ëÒ¿Æ?çÂyçÂyçÂyçÂù2ãøYv/±ÓR®B"BÂý¬'¹ådÓÒkB¾p¿_V¿ß·¶©ñ©ùh¦tóÓGEÛåÕÒZ¹ðÆ)5òlM'EäÃÌÍÚë}|£7e©h= ©¨ºîð\33ç2DeÂÚÕð?ZÊ~Þ0µîz#ª.:@~}³ËYiéù®ÖY#ËÇÝÙfÝYzNùèÈ$ùr
VC¡ÇUüàÙÒ*vñ#w4àßÏÉu*Æ{ýîÅûI_åön¡ü¾Ëµ#åÁÌÀÛ×çj¾	 >H¿&!øzó/Ó$+ébDØï:ý(Øù3Q«A	XúòóÞpKµB5~Ú[ã¢3|å!ì­'4äCLÉe=MÆ{<V+¸U)p,ÔêM@¾{\©ÿxäpÕÙ,Ëõ«-P¿t^qOgTHHÐ	Ñ-B+=}zËNp×òº rj<ÁçÕD6ØÕqm)ïòÎ«<i¿QÔ¸Räh5N¥*ÜuQDS/$-áËo¿SUºQ%hEÖ]f~Q S¯8$1êË4¾xaa"´åjlõtC×.SæIdSìMb TÍ.¹çX(5¾µÔ.;ûÐ12¿PZ]ÎeZÎç6¢Ïnÿ.(0^ëÿaîF¥¿-¥1qÒ@¡uF\Ò¨7³ØÁ7>ÿJÔ@Xµã·|Ç¼ÎÐ7¤²<ó úÉ= ô¡T1©YqU= Oq{s¡Nïa»^5|XqÓO¡ìk¡åeA×&yÖw¨w±$²=}p­ÒI&ª'&©JwøX¹ÿç³¯#áõäLsu{©·ßîzÞý¨á5N³e
Å2'¶$¸y{¼ Íâ±§$¸Æy<û§Íä2é2§ÜÔ0k[ßYx>¥â°ÚgÅ8òô"¡7g0xs½}Q¹Ñ"ÒúC8àÛ"³_Ñ\Ó'ÿ«M}'®ôxçÂù= ½åÂyçÂyçÂyçÂ
ï!ÛÏJæáý­ÇÂHgï¯â}+3*4ÓÓ À _e¿¶µ«ë		4¿XäîóþEK5kÝoM8¼Ê(è~-f'ÔJ¬þ:tFÉjý ×%¬;Lãv=Mf\= ÔT|/Ì=M3>2[¦,åwè5Ô=}Mv8LiC@
(0j×þOh¹%®uó+ÒôÂ8Ð	-Féýþ_fÏ(×²t,Ø&mê/?U¤³Ï Å*²Ï<÷Pª?N2k¹vÚù.Ø$*m#R5Îãã®Ñ©Av×PÊÀF\ìÎ8¹§²©ô= L
3J©Ôn.· âQþÅGUpèvSP*ê% a0w^¹1°Ð±öAGTè*-]­ÐÅ©W·kU°1ßEØ^>¥*Yp UDaÒd7?î´ØÊÇ>ûËÖpV¶Ö·Üá ²À_dFXmÏHyç®¨ÎÒs×5X[·>´´VUQº³¯§ÖÃ½6Ó¢¶Xä·^ñ¶V¶Ã6sowØ¸]ÈÀÒYi¯{oXÉAÂXÞcuhE´]ó²Ò	]KÊÚ¡xF^E©Y¢ZrFÉöh«®_pZËÏF3{õ0°o3<$¡élE¢¡AüA´?Ñ¬÷v²é@¤Íl]HeY²¡=}%m¤yx^³£®U!2û¥øËv>þ!×.uRÑ9Ô"÷ehúnÝyÀQöQ"·d|êîà_Ñ± Bb=M§/=M§ÞáxòÁ½Aä²ÝX§I÷y)¿µÓrå3§#ý)þp´_Òm¨ú¼·­ÏúÝÓEpfî\x£OìþØÍï¬±ó5W6:ýgÅÈøû~¶×¸á:¹RãiÊ}åß¯OèQI:RHà Ôäêoço¢Óé*ÙÈÅñÝ«M}.®tÂi£yg;ç¹ÙxçÂyçÂyçÂÙí#[n´u"ÔkilÈ-üÆÉLñ­rèi;ñ´Wlâ¿=}PSp70^É¦»{3>n¼Ôð%.ßãXG0>íÆÔìC.)®Vtµ0ÖòTaUî0½³±Ð¼2WÐi-}tP£eªU¨1Ý6½XØø>¿V×ð¹;¿Ñ£5éYr÷4¥ÿq"x¢U|N²ß)¥×+
w=}!Q4h8¬Â¹4Øv«_Be­Ì~}ÃN³ÿo*78º¼BÊÖâX6çµxºµ¾Þ= ¥åjqÔl¡"ßav¸bÕÀkñï1¡Û= 
^µªT/Vb¹1@¦àâTtwxô¬]Òõ&icwPé»=}øRØs&	vV¬ïqâEjX3[Y©­Ú¹ÂFö¥®¿oÅÚÃiFÚõÄRÝå$çì^fC®= BT0%°vz²£MÖ½ý#$êpüø´Íµ'7k'p.1AÕ¨éðUñÁY×0a¯YæY=}U¾èpùZvsXºê?}K¦Hz²¾Äç®mEI9¾"Geè'n]xÆÑ¬¡"³g0Fs]Í
Õn§µx®ó½ÕfÚ²h§ºåÝ2(xßp¶ÇèRæu_ÀY
ÇBUêçÈî|0¥ÏàøjU¨Á(ªöÿfG).dÂÌ­ò2Ó)hÿèmî ýh2±gÌ±£siö:·GÅÐ$î®YeÆØñù£3ifé~eüæñ+£«IÞsþ4gäO´ø*ùOºi
û\ßHñ* Jõ¢Óãc*³ØZìß@[ªJÛ7Ø{ôßäÿçÍsýL«¶ú9þõÀå3Ö«cîK%
2rLÇ= =MC~ ;!<ÇrÌ#A¬RÕIzTG?Lj%<vsÌ=M{Ð!ñcLõ-ÁßTO ¾ÃZl= {!^¸cTæ]-rhk%¾sT«-AzÐ%~îSÔDY4¦ò+î4= íxçÂù¾yÇwy×ÂyçÂyçÂyI)
Þ¨gopu(Á@ÀàtrtH÷±íÞD_ÏjµýR&»wpº=} §ÒÉ4Fô Û¸¸Z F!'ô x»¿ÞáÅèkóD©0ÿþ¸á5ËS³âu©Ã.±Z©+t&°Önü»Í)BãC$æÚ¬Êo¸«Í=}s'= jqüÍ¨ïñºQp«$«.%{D©Õ H2}W§¶mþ­¥U¿º2Ç°U¾-2â0Xn¸Cµ¿ãpèuïCYKCÕýÙ°p,­Ñ "×þfx;y}´ÑýrçÑî¼ä>ÔnÝ]ÿ8¸A"áe°Kmýý¶ÑêÓ"Jfüëî[x§5yæpÃbàraQ§¶yúÁ½}Y§KIyÃ§nßÙÓBùæ¨FqóÙô³BKå ½%(ÓípVdå)¶ }ôÏ¦ÆãfEâ(^4@Ð­öPÒÿ(f»tÇÏ­á]£(6éÔÒ-õ[{]h:2e¢ÚQò5cÎ1^!£hÁÕoÆèöí>t´WòU:òÅ@iùþnÇDîþ÷W»Ç:kkÆôëhzÅ= ó½H¡Sàø*yx6û^×¯f]©I*ð+ñÝ¦ÓìQ*Wâ(äñ}ù¤Ó¿W*+û!½ëHJH÷1±Ûê¸J4÷ß¸[ú2JËæ(¾ mt«ì¿r[ÿ!J-§"ù5æóöA«:JÉõýßósð%Kìa¶¢å!ÔaBlXsVÁ$yha=M5À$'<qRÌÑ=Mëãpä!\tL³=M	zX"¼ìoÌ¶K=M÷®â0 8Y/¤¥i<ÈÌ97t= i\¼,bgÍIY¼bpM]û_'òFº0ä6äÁkÜò ìÛ!Íàø»çÊÖ	#(-µd¾7¹0{ÕèN´q1AÕ¹1¶·ð´3çSÞl¤pÞÕõe1÷19V)¢ØG7åi~ú­ðêwÕ×»1ûo4j1^HT¯Ä¤Y½Ãn}5ÑÜÖ!Ñ§7n= hC!ÿ ®	Qæ]w!/ó69cHä¬$ÈWýneQÉ÷ æ7ÑÇÛ»îqà|Ó=M¸0®×æÂyÇÉÁyçÒXæÂyçÂyçÂóÍ]CÈïPSºPåµ)qà×óä\Ø®¯vYÓRç¹)ý©¯R[ÓüMy¯)²DNÛ°jú4ÆÍ]s³¯ù-© ÊîôCÔÛ(êÝ¯âªÎH5nN0þèYñå å?D³V[¨¾ª'aI_÷6AãÍ¿jI
*ö¥?â¦óøH[ïñªã÷I¾ÏÿL[	Q[gªHkò£Ü, ¼56Â\I½J¥0Æ}±	¡ãÁ$YèyÇ:NÓúÎ
ÎíÎ¸ýÎÎõÎ®ÎñÎ Î´ùNÛ	NïNåÿN÷NôÎ©sÎÆN«{Nõ m _¡­½¡¡µ E¥ Å £4/V4574Ç¶7!ö7C¦5Ùæ5[©Þ¶þ¬Ë^Ä~n¨¦>{ºnu|¿Rå¿eÅGÄG°xFµÊ¬ É­Ä»ø²·°
¶à×ô'Þd ÍD éÄ+Û¢àâ£ÑT¥çTkÜÔ\ÎTcêTbÙiãéÐÜÖÄêÝä±Òj@Ö<îCªYAâÛ=}½¡ýz½Ç]«´½ýÀ]óýï=}ùÊ¥}]ÿ¿ýì³ÝËºÈß¡Çþ8ò+Ô=MÔ1ÌåÂyÇÊxçÂiç¾yçÂyçÂy÷Ë§ÉE&1|¨[ò4¨â½.¿/V:Sã¿Q)uÖDc~¨µíkëÝ¸µoe÷,»¯/QSIùûäGàýnÀ/ö0S%vÿ()£D¹~XéìdÈÙ½zo×-ÓÂ=MK#ôc(WzE²I|òô Ò]ï/ãSH»OXöu&çJ­ó>Û@ªZ¥Huúð7ð­óueÛ´ÖªXAI³öf@ýxõ%éêË·s½ÿ°ûùeI,ìÏHWRX ©òIçß­óø>[ÂAªý'I»ÃûýXGôØï³ãQÛÊwªûJ Äsªa»IÃKÎÿðùµ«ÜGÀ<?¼1¶|F¢|KÊü:ü7±.É2B³6«ü-í=}íuuí~m{amU9m­Y­PW-mGí3íLm¨ÿSÓ=}²Órº~|r¥ÜÁw¼\³ü»lÓõ³p#qc C!ÈSÎøsNàãÎÎÇÛNé+Î
Ë  7O7Î7®4on~(1_NQ6_6-ß51?5¾5~5«ÿ5u5Á5W5wÖ5£65k·5½v7åö7ñ&7§7ig7	ç7¯F7Æ7ßÉ>¿cÌ¬ÌJXõC6'#Ð[þ²¿ dÿ »¡×W¡7¡­w¡'¡g¡«G Ï Ý 6S t3 ÿ³¡ó¡n£¡{ã ñÃ æ +57«6¡k6+ê4ïK4%Êë¡Ë¡ã$ÉO$mÏ$Î'}/'¿®%n%ßï&Ý&/$±<F³Bú°?Öp>âsAnñ@*ïv/S-o]ïm/c%otzn0ºrÀ¸u¸¸oÈº{ptxÀzrØ{%ðÁ=}Î<þxéI©nè÷qãÛTBÜ4DÐ´IèôDÖ$Dâ¤@Íd<åd?ÙäFßäIÓäCKÌQÒª±Ò!ÒáÒÒ Òü9RÛùRiRõÉR²R ÏÒç¯ÒµÒÞßR«RÁRÖ7ÒówÒ§Ò´GùÊó}ï=}ïÅ]÷¡¹}ÿÕÔáÄé$ÿ×Ô+ó5ÌºÎ|yçÂù»yçÂÅ§µyçÂyçÂyÇÙÏ¥pÚ$'/N%%Î&³Ï'y/%­®&¯'Eo%Óï$ï'Û&é$%O^&íÞ$¯ß%>r/PB/,ý=}£Ý.»}AË]È½Ê¼»¤=}¬ýÀ ]Æ¸½ÈÈ¾ÝÄ½¯¦Å²Ý¸Â½±ºëul= upØvnHvr°yuÀ{y¸uwÈz{°õp@ùnØør¨ûmûypû÷Ë$oÙäêëÄKÜûýåmR¥R÷]Òì=}ÒÈ}ÒÂêÛX=}JX?Ø@.ÚBîØAØC^9@Þ9B>8×I±~Át¹ÉêtåpÈénèêr¨ämxæqØæï)RµORö/
ÓHóÄ½ÿ°=}íÀÝö¸ûÈí®}÷½Ýù¦]üÊñÃz'¯û&!úØOïð/oÔ¯Ü?ï×oñW¯íw/þgoûG¯	/3ïÌsûá éäÏ´
× ç?&¥ïMQïìîg=}6 T R¸7#³.¦ÐÉÔ®a= ý2¦ô(O5ÆÑ"+îýÐ®uN}/´¤P(X6~0#_tµ^£uPÁns0¯$ UHÙ8Vr!W¾lEP¨nw:5tªcøÔ3. üëáÐ[Ê¤\à¿°1P×nq5ýÆÀÔdbÀ;3b #[6Ð¡PùÖnh!}Ä¶jY°·-öá /wùÁÑïFªc[ðº;&B'/ûêäBýrÊßh ví)gbn~w½¶äëbhzóIæ{)P´Z.RsÀÔÜaðø2#Ñ>IQj®^{]Å÷76ñÈ_¬4x.»P¢
.á¬@T%8êÇOÐ¥­nÓ<½Ä$GN (5&ÑR@oP½îG?Z¸%;RY¹2PÎÕî·G?Ñ³JßPõ.ýýÍ)¤5ÒÛþ¿Éû(ýÑù§7Û¡òdÐ9C{­tÆT°d8*ÇQW^Ë¿Ø_¢±ä÷¸þ·Ñ)C4ÆbãÖ÷Ñ+Ãn´½]×B
rýáÙê.{(C§è:ÇbGP´©ªùäñÅºÓzudöú!£i§ëë;)§iýîwTÈ	ÜSÐ#´ëõ:Û}½Ó!E-Ç3Ñ=}cö ËÇ³Ñ-cäñ~©!'hÆêÛÑGûå:àÛ}ûhßî7Uxµ;µ:Ð!Ýáéq»9:ÕA=}îKÏb&lü:ÂyçÂyçÂyçÂyçÂyç>Ñ{ýöãø'UÛ¯[ñ'¤¤Cù1ÃÕ¹ªÙ[¶ë.ö­ç~PÆôJh1ùIñB%û#ÃU»*Øaw±|¤¦õ"x3ôoyDÿYB	 LZaSiqÈ1×?E²µ:ÑD:ûpC±½ºÑXzYwi¨1ðwÿsÇNfù?ò}¼{©IeÛnÊ¿clÛýêÃÜ§Aè-Ø?°!?DÒsKIeÎðI²GDÕSnÂ÷@s8§ÅÕkÀì ³AïåÐaWç©Æ o*ÅÛFûÄð­BI¥Ò":þ\Æûp ®:I¤ØfZüëPmz ±*é$×|£ß%= ±!	¤Ð>}-ä;[vþ^ªpeØ"|¥Ó.¬HýUW*V]©²no¥Õ>B¿«ßhóûUin ð°<qµZfÝ¥Jq(ß¤Û~â¿©	(ó(ãÄ×jÿ«w->=}[^^xð²,Ñ4Y¶^@²EyôL#Ü=Mmo$Ûp²=}Å8l=}×dÕ&â½9xo3ÇåÓ=M}ï¨ð@Ãs=M;yç¹cÐú^è$ãÓ/X<ÏW¸½Í:ô[Dï'úì#êìköä­ôæ7-!fT%-?p±ä5Z§ïaügîë:=Mû
JÀð?ÿ?¾=M@H,@/&@lµ(@³ã2@W»=}@\GI@|U@/¬b@Äp@ay@«@@@u¨@>Ë²@K¡½@+É@ðuÕ@¹â@B}ð@²Uÿ@=MAÌAûA(AÌ²2AC=}AæIAjXUAGmbAÅ[pA1AAïAåAp¨A^²A?m½A1ôÈAè:ÕAÚMâAM:ðAcÿAr=MB[ÛBÏB¤Y(Bô2B>S=}BØHBjUBq.bBÚpBÄê~B£_B(ÇB~ºB»B¨Bi²BA9½BÓ¼ÈBðÿÔB=MâBl÷ïB*ÇþBå)U$ìeÛ¸y?Þúó©!çÂ©ÓñuyÒÂyçZêy·»^F	aë¬axcAÁr7ìU;ä#!.g1òc+Pò^<À= åæcÀ]lUyä¨¡Ò¤¾ÌYÅxºA't{¢Cwyó5AãjÂæÍøu?à#FKÉmÇ7ìåº r!÷ìß¥ymÏ ê|ä¯ì#(H4&GpÍ&#­þ"(¼w50ÙCÎößÎ×5º»êº ê:­âù ðåÎ#	À?¹¾1¬õö­¶PÜ­kÁQ²¢ÉÝq ¾¿ö]ÿ@= fGYj= +¤?£.Ã´kÉÔYG&ÐåÜ'[\ÐGá]|ÉlkH;;¸TÌwÒãÏ_*ø¦´Ïæî§Éýù/=}å´ÓNÞüz8m=}J\@«ùÆ KF½=M»î=  :ËvÑ:ñ[|£Eö°zãÌ<nB29ö
wõ[/ëéuOÆzõQV20ßÿ p	= þòX2Ý:2ÙÙ.UA¢wÕîæP£eUï[ÔxPóhuÍ+v0màúóæÒÇ*ùu,û^ê¤ëêªÞªx@*%­³^5j UÃÒ#ßit"ÁÈhN{ éLåôÆqs7©ôÿÊ÷6½Àa>ÇûÏøIÏä{=}xéÑÆxôãA)³½Ø-y¤n½S¼&ëôå Ö= ¢vØpÆcQ¸>IéÊÉº¿EèÏ½¾o+¿Ú\îïÏ­JÛ·­HõUH»?»:[ý/KÝæ|üÆ3CÛ%ÍTÜÿÝ_ÅÁ2ËÄ»ËEG	oÉªóRúíÉZþ¬?ãD?KòÇ1= keÙzú¯âh¶*ê&»:'gci·ù@Aîý;öÇaîZ¼Ó;o©VàZt63Íe|pMhCÍiüH;Ígü®ß1»ì3=M^¿Ezëû¬òÍNKmNÄ- ù÷µå­hCè+K`});

  var HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAPU8 = new Uint8Array(b);
  }

  function JS_atan(x) {
   return Math.atan(x);
  }

  function JS_cos(x) {
   return Math.cos(x);
  }

  function JS_exp(x) {
   return Math.exp(x);
  }

  function JS_log(x) {
   return Math.log(x);
  }

  function JS_pow(x, y) {
   return Math.pow(x, y);
  }

  function JS_sin(x) {
   return Math.sin(x);
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

  var asmLibraryArg = {
   "b": JS_atan,
   "a": JS_cos,
   "d": JS_exp,
   "e": JS_log,
   "f": JS_pow,
   "c": JS_sin,
   "h": _emscripten_memcpy_big,
   "g": _emscripten_resize_heap
  };

  function initRuntime(asm) {
   asm["j"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _create_decoder, _malloc, _send_setup, _init_dsp, _decode_packets, _destroy_decoder, _free;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      var asm = instance.exports;
   _create_decoder = asm["k"];
   _malloc = asm["l"];
   _send_setup = asm["m"];
   _init_dsp = asm["n"];
   _decode_packets = asm["o"];
   _destroy_decoder = asm["p"];
   _free = asm["q"];
   asm["r"];
   wasmMemory = asm["i"];
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
   this._send_setup = _send_setup;
   this._init_dsp = _init_dsp;
   this._decode_packets = _decode_packets;
   this._destroy_decoder = _destroy_decoder;
  });
  return this;
  };}

  function Decoder() {
    // injects dependencies when running as a web worker
    // async
    this._inputSize = 128 * 1024;

    this._init = () => {
      return new this._WASMAudioDecoderCommon(this)
        .instantiate()
        .then((common) => {
          this._common = common;

          this._firstPage = true;
          this._inputLen = this._common.allocateTypedArray(1, Uint32Array);

          this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._channels = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);

          const maxErrors = 128 * 2;
          this._errors = this._common.allocateTypedArray(maxErrors, Uint32Array);
          this._errorsLength = this._common.allocateTypedArray(1, Int32Array);

          this._decoder = this._common.wasm._create_decoder(
            this._input.ptr,
            this._inputLen.ptr,
            this._outputBufferPtr.ptr,
            this._channels.ptr,
            this._sampleRate.ptr,
            this._samplesDecoded.ptr,
            this._errors.ptr,
            this._errorsLength.ptr,
            maxErrors
          );

          this._vorbisSetupInProgress = true;
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

    this.sendSetupHeader = (data) => {
      this._input.buf.set(data);
      this._inputLen.buf[0] = data.length;

      this._common.wasm._send_setup(this._decoder, this._firstPage);
      this._firstPage = false;
    };

    this.initDsp = () => {
      this._common.wasm._init_dsp(this._decoder);
    };

    this.decodePackets = (packets) => {
      let outputBuffers = [],
        outputSamples = 0,
        errors = [];

      for (let packetIdx = 0; packetIdx < packets.length; packetIdx++) {
        const packet = packets[packetIdx];
        this._input.buf.set(packet);
        this._inputLen.buf[0] = packet.length;

        this._common.wasm._decode_packets(this._decoder);

        const samplesDecoded = this._samplesDecoded.buf[0];
        const channels = [];

        const outputBufferChannels = new Uint32Array(
          this._common.wasm.HEAP,
          this._outputBufferPtr.buf[0],
          this._channels.buf[0]
        );
        for (let channel = 0; channel < this._channels.buf[0]; channel++) {
          const output = new Float32Array(samplesDecoded);
          output.set(
            new Float32Array(
              this._common.wasm.HEAP,
              outputBufferChannels[channel],
              samplesDecoded
            )
          );

          channels.push(output);
        }

        outputBuffers.push(channels);
        outputSamples += samplesDecoded;

        this._frameNumber++;
        this._inputBytes += packet.length;
        this._outputSamples += samplesDecoded;

        // handle any errors that may have occurred
        for (let i = 0; i < this._errorsLength.buf; i += 2)
          this._common.addError(
            errors,
            this._common.codeToString(this._errors.buf[i]) +
              " " +
              this._common.codeToString(this._errors.buf[i + 1]),
            packet.length
          );

        // clear the error buffer
        this._errorsLength.buf[0] = 0;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        outputBuffers,
        this._channels.buf[0],
        outputSamples,
        this._sampleRate.buf[0],
        16
      );
    };

    // injects dependencies when running as a web worker
    this._isWebWorker = Decoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      Decoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = Decoder.EmscriptenWASM || EmscriptenWASM;
    this._module = Decoder.module;

    this._ready = this._init();

    return this;
  }

  const setDecoderClass = Symbol();

  class OggVorbisDecoder {
    constructor() {
      this._onCodec = (codec) => {
        if (codec !== "vorbis")
          throw new Error(
            "@wasm-audio-decoders/ogg-vorbis does not support this codec " + codec
          );
      };

      // instantiate to create static properties
      new WASMAudioDecoderCommon();

      this._init();
      this[setDecoderClass](Decoder);
    }

    _init() {
      this._vorbisSetupInProgress = true;
      this._codecParser = new CodecParser("audio/ogg", {
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

    async _decode(oggPages) {
      let i = 0;

      if (this._vorbisSetupInProgress) {
        for (; i < oggPages.length; i++) {
          const oggPage = oggPages[i];

          if (oggPage.pageSequenceNumber === 0) {
            this._decoder.sendSetupHeader(oggPage.data);
          } else if (oggPage.codecFrames.length) {
            const header = oggPage.codecFrames[0].header;

            this._decoder.sendSetupHeader(header.vorbisComments);
            this._decoder.sendSetupHeader(header.vorbisSetup);
            this._decoder.initDsp();

            this._vorbisSetupInProgress = false;
            break;
          }
        }
      }

      return this._decoder.decodePackets(
        oggPages
          .slice(i)
          .map((f) => f.codecFrames.map((c) => c.data))
          .flat(1)
      );
    }

    async decode(vorbisData) {
      return this._decode([...this._codecParser.parseChunk(vorbisData)]);
    }

    async flush() {
      const decoded = this._decode([...this._codecParser.flush()]);

      await this.reset();
      return decoded;
    }

    async decodeFile(vorbisData) {
      const decoded = this._decode([...this._codecParser.parseAll(vorbisData)]);

      await this.reset();
      return decoded;
    }
  }

  class DecoderWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "ogg-vorbis-decoder", Decoder, EmscriptenWASM);
    }

    async sendSetupHeader(data) {
      return this._postToDecoder("sendSetupHeader", data);
    }

    async initDsp() {
      return this._postToDecoder("initDsp");
    }

    async decodePackets(packets) {
      return this._postToDecoder("decodePackets", packets);
    }
  }

  class OggVorbisDecoderWebWorker extends OggVorbisDecoder {
    constructor() {
      super();

      super[setDecoderClass](DecoderWorker);
    }

    async free() {
      super.free();
    }
  }

  assignNames(OggVorbisDecoder, "OggVorbisDecoder");
  assignNames(OggVorbisDecoderWebWorker, "OggVorbisDecoderWebWorker");

  exports.OggVorbisDecoder = OggVorbisDecoder;
  exports.OggVorbisDecoderWebWorker = OggVorbisDecoderWebWorker;

}));
