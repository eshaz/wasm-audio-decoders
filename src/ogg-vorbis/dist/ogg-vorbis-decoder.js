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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode005eª¬³ #n©ÄI£(,uÝ¼þmÕÕ9Õ|ì'ö§®^2BÀË¬i[£è:4³ÛY{Nã/v,\î¥ÈÝBvii=}lUíK8ô¶ þÔ)7ËÅÕú;ÓÔm8Ûæ8a¢Ä×gâân¢ ®®·¯óì¨êgUp=}UZ"¥ö Iüß|íQÚ¼<m&òæ³DÖW[¡0?ÿ |¿ñ%vAg$×ègü¿ðEö@c×çöµ¢: ËÓ)á7:Z @0¨ôÓÓÅIy[Ûa¡!ý
µ£Ò'o«î©[ôúóÃ<<EÆ6Îxªï9ð÷÷÷7v¬$ñ÷7µñZÝÂÓ«í?Dû5ù¯ïrO@¥H<ÕV.+OõvûËùÃ=MÁÑ(ÙÓy=M>8$v/	î'Ò/ÓICÆÛ²ESïTÄ 8áû/Ê#û#ôEô#¾=M¯(ÇÏòçi:òô<Ó¹ùëäXàë÷8"XúØMþÏÇÔ®ø6jÑXÜPúÁA~Ãî)åc1ìë@âîtý²Þòô·÷ìhÑÏXOèÖ5¾G!.òûÞo-¬x#y4,Ø3c¡%®ì«M-ÕkváôÕ/?fÿ+ÑRìùÏÊ©Ïæ­öÎb+)Æ·®Ïµûn!KHlïâÖ.	ec;«/G@³IRNçï8e?îE
?
$Jr*êUOVËJ=MvNÚ]X«¢/×ÀNÅ&@ç6Hk+þòºZQjÝµ¶ÂMÙX±ÍTp[.þIf¼5Û=MØç¦ äÄ=M{yÊõ+ÐÝ¢&+;Ç?Ôç][]:2'«QÅä@Rè!CN#A \*ÅÛ\lmÅk@!mbî~?5¼3eáys¼HêØêws:UÙLÁ°¯Í±¶ípnêxEéX÷ÎÉ|)<M·­_ôúÚ¸sèHÜ³S1«¼WúD!ZMF Ôü#°ÙWï{ZE|Þ¨[ü áuÔÓ>·wG÷úÒëoFNx¡kf45S_Ä¬ê*  È:þ§=Mÿ=M¼ïGõkUjuv¼~e³<³=}8Þ÷âð öz¢á¡oúÂO>juÕ]¹z«= Ø:ËÛ¡ô= åKA"62GiN|Ã-Hrøà{EfÊpÊª×Õã"BºM= àGÕµ^4yEÄH¿äÃ*¶*Vwý&²C+\¥¤1aÇP÷Ø°1ó¤¨q÷ñS= ì¹Å*´=MûþÃÂÂ¹Õ¯¡=M0þ«ÞÀ¼­ÊJ ..+IG2àsOI cî£SrDÏ(q¢¯2Kî£Ãxz«1îtåãÙåã©ÇkÓxtwä¿9#á¦eÄ¥/N§º8jiÛzjg5x^õ»¨¡ûäk:Áo¡%Ûåïýs÷J8¦A¾Øì·~X¶ÁªyÊñÓ84ÔùÿRÏ\ÍføËÚ*FÔûçëÀIèãCkõú¤î­±Ö^ìÒ0ö%ê+a³$-ñÄ>Ô2ñoÅ8=MéÙ³°Ù¡ì²=}ÏFÔÕ²O)xL¬Bæää|ö®~¥þØÖAq"¤AE ÇÖçzÍÛäã5¥Ýél»w[-Ú<îYösÿà+¶H¯w$= ìhê¥cJ4Å&úÆµÇ1¤	UD8ÆH©ÆÀé¢¥Vî1ø)cw3ûHÄ<Î£A°JM*èù×ïúI)"vWPÒ#e^­Ïá<j EèL@bu3¸±Ö´×Ýù¶Þ3þýAeÖÓcµ£×BSsÞkÎ0£×&?.O\ù·tÞÚÛ·Í´,@ì»¨ô¡ö,?0×IÙ¢¶Wf®ÛÕlåk|_^éXó×È= É2*÷k¬p:÷8H´õðEõ$~üæ¬êØ8e¾= XDõUÌªïB:ßTÈ.¦þ8ëØ0Âç@Ú§QEÕ3ò
ÅzJ@?È'Ýz÷ÊûëåéÖ|´säìi¼t>emRvÇâ@ÀâqNÔ_)ØÌhúõ)±­áÇ?ãF%dÀD;\¾yakÐÞlg,,wr¦¾L/ü:½_¼×ÚxlÓþt= ±Ý×©$îyç0°&u¶$½ñF±'òÛýµ­ÐÂqÕ¶ñçH= M°ËÁëÆ-þtO>å¦vyv+'552¥pixjÎyþâ
u¸Ô_uÿpOjÞGj×'(jmïtGå¦Îéw®¸ðLG6z¦ð}yýë+ûðÒW6ºü	%DH»5GD§ë+Ë§E6:qüÕRja@ñûþ¥Ò?2¦ýÅì>ÞÀè²ÌÁlÍ¾í[Í£00áw½ï
9QÍ÷·ÁÏ%]ìeýÒÍ ãNH7WÙß§#LZ1(UÒÑFOc=M]&ýs³§æÌéqÄxN!-¨4x÷.1VëÕÝA;wðnOò4ÓáÖV¢%|§ÓRâó"¸ò"S!Ë5IÌ)¹ÆV­S¼ù5=M¯.cøµVÑë¯6zÝ
+ÐX¥5b@HÄßUS 3mÙ
BºFvÄ]c¨£#Ð&²Ð¸¤ q´OJÆÁ7©äQ¤ð»¶Dùµ²Ü/ãÀÈZ¤PáWõ4õ¾¸êk£3>®ºÏz7ÈæÎÝÃõÉü¹VãX¨GËþÊ= VÞí]qÔÖ®-mY´Ø¿¸¦Tâ;³µÉ<QU:éÑ\[÷|vu?/L&¹C!8HÄzn7sÂeþ«­/X ÔÞ\Ïc¿ªS·bñ~¥«ü­R,v©Ð°­2àÜç«Ä_ÎÈfe&É_ý!Íöh#\>æ¡,Öèî.,ÖzäB^I¯\üã÷OQ0-ÄÝäü§+(hwX2âMY¶ÍFËûQ»<86¼U=M¾Á«ñ÷$½©Ì®¬ ¯Ä¯³¼üøÒ¢êÅ^'Jø*pÃó  UvFHÝ/T{Ôz'ó»33[Y]L]Ý-*eNé6;_Ík iû~©R¸.&ÙM$ý:àiHz'?äk×æ7f×ºûUê°oéñ5×MU<YÚ÷³[ÅdÉA&ö½³»hî,9?ç®äæô fÞ=M+_KkÓÕÓ%{0±±J=}ÉâSv÷£¥²í¿ _=}a¥}~QK<H_=}açeÚ!eÚB¸Bü>	|!¢d®dÓ 1lÅU1ÁR¤í÷y¤ô{QëÕF2EHþý=MqeB Uë.Yæ²Ú¨¡äÏ»¿¡Çîæ âò»®±í)sîjá¿lt<eËH"¤Ê~Ö,b-a»~ÁàfL;·bªÎ	bukâëbed¨Îyf
|f¼S&	åè5~©ñn féç®]÷ïÊÄËBlÕï5·ÚÙ(EúRyùQåÎÌÁ§<aÁ¶ÆmåËIvmykM¨6].r"{ ¤~Ç'ð¶/ü/pËÏc
FÂâG&Ðü(§²¡P´]5ì¢!y1°6ýDFñÃäõ$® Ä?7zX~¶æ4èå§uØdéq6ª.L-ÛFbé16º«6RÕæÉ#o¸âlof#Ôc÷¼"]ÀØ^?wF:X= k©º©5°s#ÐéÎ´|î1ñl³_jép4¦£î±Je=}¡!ë»Êvk¯<ò&aòI¨ÄÊ³Y	®òlÆiK^æ.wò2FÞýCu¾´ðviV þ[À3ëa@þl=MåûAÐ,}çFµ¨ä[NÒ	©8r= éÚ:Ç©ûqº¸]Óâb#XÀuÎÛ5¸H$~ã}¼JÒ\jÁÒ=MÍ^?\ècylÀ°ÓçÈ;.×;¯dI¤§WøÓ!?= Ök	ÕÎþ¯Id¡®Iäã«= Ù¶N·yGQ#Rw[jü¤¼õPº­­B;»àÄúiÊ\»aÊHÎ£3¿I<´I9[ÛXïÁks´ÚXf¨,ÊNÔ)õ»É³´Wgò2ùÅÎH$l«ÂÉ³×. £qj4Jå¨ÃýHù;vZm@= OWÝ}=MÔ+òàíL(x
Ã5C©Å§2oõªæ[Ììû1yÍÕyºª¸Ü0Í°'Ø÷\47«¹HeÍ[f¤wG/ñz±z¹É¥§x£«#æ/ 4ÏÁ°3Ïdëv]HQBåÂø{Òis_ºÌá2fvÝß_4ò)¹¾çæ®¤ø¿§¹¶&¶
b;+&Ëj[HÓaÅ^îßà$_ãÏ³·	eíöt Õcä±ùL×¹<GÜþÍ¾l?W(ø©ÇF{CôQîÃm/×2=}£"¥>Sà¹O}b±¿U^¡vM1L+LàlLbáçn¥Ó×=}²¥êõo»î5o»z)
ðObG«ûx«FÿáÌ uöÔó}ÑQZÇúPù2¡Õì°Ê )¦'V¡ZxW±4¯g´Þ"i²·¢¤6çê¾uòo¤°ÆýÔm´;!ú?M2½¥q¢$]dþÿ¤2H&OB_|8= ×¿E¥Ò¼PÚ÷vÄòÃÂòtwô$PS¿ÚK<&þ}BtÔ§JùÌXAPEw)Ðbê6áRaÞÜAh1¥Ä3z1fóÒ= >6Àßå>+»#_«lÒC5¦àxJÇ²ZFx¤ý1¡×'á*å·z"áY{-:Ì>äÆl¥Å¨D{d=Mÿ/M!4Ó¢k°-é*T¸/É£ye2= ùp'@!D,9nüUÁÒÆÞ½bÌ-êì÷y$ÁjiµÒL=}²eÖÊ|AÏ>ßíEl´É6ºç+z6*sùxbå^Ëy*éé.sà¸÷°Ñ	ä@,Íi|ÔÁäÚ¬#ª'Ëáx04 "@è(O~</)¸Ø·1ôüÿÉmÆHvÇ>·_­óyåMãP?QÌ_E©wÝ"¸¿_"?= "âoxLLy5^¬caÒO62×¸ÿ¤Cò|.Ûs©^¨RwÕdO¼KÚáPkË%÷¨cC* 80[zúj±¢Ì¿7¸}^ÈÇ¡ÄXÊ#BÂ¦ÙøÃ¢&.^ÿ¤õ¬»J©_h¾þgH­TrðÔxdKhþ®ê¦pq&ýè£Z= ²cÃ!ñò[ßð¶²<¦ðt£!s$Ë ·«	+óÕ¨ÔÒÆü3¯:g ¿RHÕÄ7iíäû0	}5tL	}×µ][\ùÿvYûîw]äxø@%ÕÒuGÑÒ2fô1aÒÅ ÀF»¸y=}¸4Hu2aÐÏñ¹pk"õãìÞßË0ñ´ Ð»·kð5]"vQÃÆSÂÜòþ87ß³úÁE6#¦]#ðNQ6ìÅÓÃV×ÀUtª"}0wu5=}Mþt³>Ý½îý%ÔX]¥oúÚ>¾P$ Ë£QÛ­¦¹]Å0àiÚNW¿ò\5úéþMÞXMXX(ÉSùà¸A<C+!GU$ü´"LÒÆÜý«½"dkgÃ{Ç{5ÌË!Â ·<ç#z"m½ÀwÐBà+¢+Ãv>0]ðE3¿\
×l%Iù|¥L$À:0²~ÁFñð<þC5Õ[9­]}]E{Í[íÜV[ÂûS¡4·ñ~õ;4÷/ôÍ×5õZ-Ì*ý½]ÎµmðûW©¥ûz¸ C.QXÜ0Ä=M»aê¾oiè¢øTM¥´À®WàxôC¸®PjHé°¼-á[¦/òMêÞ¦kcjØYu(úxì=}|#b Rr[%\KHzEñáÛ½J
ÊóÖØ´$ðvöj8û#L+áñasàÔl@êÿi×üz³­é
H8 Zþ÷ÖQÿÉ}*Ò~ùÒaÕX]Þ3Ñ"½}¿jýÚ+¼0Í÷Õf&uZënË·Ù¢®W/ûÉ d'Yè©÷axÏÊ­°Q5{ÍþZAKûÕ\¥Uí|ßþÁ½ìGª^[àþSô9 =}Xz \Ô³Iÿ#úzö¸¶Æ¬à. 0ñTÓ´9XËÉµ8X3ÑJxÃÆì<3Íz¹°4óã94Á*îÊ	öÂo·Â½tðßfU´®nÆ¸?º0²¨ZO)ÜÐ ¼÷(|æÞqî±®ÐàÄq'Ç O{ýpÁVXKá19Ü¸=MÈt¨][p=M%¶Ødb.ï¶ÆARjün0ªrð'<JL~÷û	@·b1FñÜZpkÌ2Ýns?cýxÅÙ¢wvlX>ê¤WüwOyÑ%ßûz^µ|	Ôî	l,qÁ²ÿ	Lßl±»¯c{Éeb®j©¦´û"v¦.5ø1X¸n&bÛkX¸ùRzÛÞJY S£058=M
=M££LwX8Ð»½É¬GÉñ=Mx×¨½¹tûó°¯i¡ØT"2Æ-+E8p@£íX¡=M4}»þ!8Ú~5ÐþµàU§¯µ(CÅ±µ(CÅ¯,Û°òÑ¨G6-ËKáQúv\:8Fç{öv¤ËÁF*¦-È.1² ¨nS{ê ±(Ó×{r;ò=}.aå,DãL«°N«á¨Ì= ¿°sD©³Îo6:ýÌ ´Ytavñ^Wv¾óÑàêÃàÅÞp}¤õ-Ñp5löªK9±ÑÆa$°§hL¸y]÷Q:_Æ9ÿïÿ^£2~ÇÊc9G¶©5°ÉxXÉ®\ú×Ø1]NWÔ0·/CìëËcL¬¯uêÓ>\Êí}ek¿¸ålÕ©ò_óöÄ]×¹Ýouzÿâï.æ}hªêµ#IJh
öm¡põ©<Æw­êÇgûß¦ÿKÅ8d*Ê*»bº²òáÀÊìb:V|uT#ñº.aõÁùH>Çþ{Ð­¬¿­gÏÚ)&þEØj¡§5C= ÕÚ>+8p¾ÎqnY|Ì}HheùÛ´]:*l3=MÝÑzåO©ð'daãl¼øUøc6÷|8£»z3ñ.q?jhaÀD	tÁÂ5Þ,%~p rJQ¨gÉ¸gp{ÝÐ.))<«ó:.Ü#¾ÄZ·mèl¹1Xø´²wÄ½ìò+qmd
´Ôòe*ÎV¥oCB ìà©ïü¿£·èËåüâ­%¸/ö)4êî&ï= a:CgøÅ#øÐJµÍXJÍÞð+õ±BÓÁû*£\"G:¯ó¤¸ÏÁ
@Ò½ì»W÷è>bÛ)9©*ewQMçL'KaÐ¨SjuV3ÎðEhÂ9«½ MúÍ±ÿn¿rÈÿØo½îéøiãö*+ËG¸µhi·(·ÿ5 Ùê|É)°±v§å\f¸D}Ê¤íq7Ð¯Ìv6~£'ç=M[î¾~Ç IÍd Ô*§ã/óU= .¯+ÞÓÓáD¨-Ü¨ÈÓæ9^4m-kîA1a÷¸maÇ²Âê
	l7ëÍÔ «ÌaEÔ<ÂÒÆÉ¬)h½)éÉEnÎbÛ²TwÃ¸HãÑFµPäUSm4ËÅ¼ÿvvÂD6±íÂ¾Æ(ø%´3;6¥»Ñãa·ç@²*BG <îÿÈ[\ÿÅ¾1·/DYWíC¤éÙE±ã×áê"ðÐ=M|W#Uñ\Z=MÃt[¶Í~>h$©×	°í¾'[?«ÃÂçAi#^IãclHfñß>ÄÈ°qbg³Uõ¦&·nèð°%9·UÈÈ\*ÍQY¥¿oåÉ,µbáW¹¾\8Ëi&lÒLÈÇªÄ*Á/ò¯H¤v D¿óD¿n¿öàè~ëÒ| Jåµ]:Ê{ð© Ëá62©Øz½G¼'Zä·wtíÏ>þ$t+= ?X|jkGh¼ø:²¡ Ô*CwÚîóíêzD¬ìÇ= $<phJ¹çá%Ðîÿc°?ÉiÙr3'"EyÄ»,Çâ§ØÍÌÒEÙ!ýº«û¯øfÈAaÈ£u<M$²1ë5DÝk[qû%e®vüs0¸GðÐ°PBøa<DV ? *²u¶©®ÇÑ¼°Ñ8ßëc­ÈÆ»Ý/öhÈ$ôËõ·Æt"¶D÷|6ßÕöV±<ÄjãJ¦æÉä tÁ-¶iã öKDH~záÎüaõHäèEbZ'²ü¢Lù³=Mà÷AKHpá]ùåÉDÍ~j>eÞíþÇ¨tNªìÂaý¯NT}çkÚÔ±cM¤ø8ÉªÉJkü@_­÷ÓÝsT.=}´98Ô²_¢Æñ9Ä±IÔìÈ@²ë8×p¡tM¸ó¿^k2à²F,x/àÒìÉHU ÄÉDÈnip[¾Ñt§«ð@g°»dÒæÕÂ1íñ¶@ÉèÔ0äË¶-ëÁkÓ}1zý,éÚx¥WBÂ@VXö"1'ôÏCcðç¤ÿo¸^}ìæ®I~ÝÒä£rÏkPxåS)À©mö£õBx­Þ|9=M]îdHM7Î4YÅä$®Æ¾[=}êä]l=}«]EÔÜÂÜÕf½@îÖ]õnVY±zÀéY%nqZpå.§[z <]¿âjBÅoPDU=MÂmæÅÝ6>\9À8²"¤ì/ºð·»P­¹5ÛßíFç|ú]ÜYÇW©´U(öÂ.LKYX°døõÓá]ý-	ýÑ+Þs¹ÜºYÄ&ÓqÊª1bÐ?¦7X\ÝÏ£Ù6]ÏµTÆFÈýÑPGu­ºÎMÝWÝZlt«ú§În*üí2îaÿ=}¡@"¢Ý>zô³½'Opfì7=M÷~zú-ºÀ´Â'Ë¼aIhuu¥z¨^»rÍ×­ËiqÁ[ü= Èoa	Râë¸{¥ùAÆù ¾¡:ø³ÿÈZCÙ%'æö1vJÐµaãgØsT"&Þa]ÙÖAl33Î-I ]-5@­G+²Ëôýgcèé
>ÄfÌÓ=  ±ÍLUT÷²k¢/8.1åÅ±>SþE©>I2ô.Sÿ$è¤ #öB®Câ{&­poÈ°×«|= 	 zsu¯r Ë÷j¢÷ÓôiS3j°ðþ Æ~l¬ohD=}ÖZFÓ¨QÞ¬R´4\ê	l«ºö®Äy¾Xjl;õR¼ôæÜ?áÝ;(c¬Æ§tÍ+²Ûâz7wóKÊ3!= ìdonÔÄAÈëAÄ¤0¿©ä(â7®½y1ºÚSÉ)jZËQ.t­ekñö+#ÉñÔ£ÚA÷:h7p:f{·Áí«Ë= ®^nî"&MK= (·¼0AzBóÿÁÑlLùlÅ¥3¤º$aº¢)vÓ×Ð·°j«ûê_xÔ2t/?¶Á¶²ÀFô+,ÐùÃ¤eñ é¶[ôðÞe;ç^+¢ÞIfÛª%½* Û±õ"°5R×v¼¸z·sic= ØwÄìB÷XÐÁ4%®~¨;0bõZ¡ôTÅgßÛüu®úç!ç,= ÃÉÈÿç*¤µ_jTüú­éHí-íÅ$»~Ì¾§'ÿ¥uÓ»±õë1Â5OÉÍúdmF/e1o~= *²SW¥äaÄÑ*Wþñô-r1ÝU£tc×¸ä²Ó1¨8jE¡"LbZ°O$£	$ ¸ðæü
¼	ø æ+bu%¡üoþÐð)á²ä÷=MGÙ*"ï§çG	{E=MyVè¤¶ºxkàä°nnÔ¯î1Jûkùg.¯³ÜÝzÛÞ¨ã¤HÖ¸cöÁ(¸uj±¶ã{ á4øò8ÔHEÝ¸?ÁÀ= h6z)½½çãô®F'lDû ÑªÿLBzÈ,>õ¨ûVµÜÄ=}À~Tiz§¶ÇV#ûX°_MR#¹ÚÉnÕ@ãæ¶ cJvÒh%ûPB,6XX4ß{\-Wøs4åà×Hø= ZçÉÚKâ¹ÑOIMSøS|Í(³	ÅïVÑÖaïÃÿónG"uËÐ]$¦Ç{2L ²Óéÿ<JÝgÅD\ûÚgËB¾¹PÖ¥MÝwt1Þye¾)­3°ÿ¡Rý]v*¢H%=}+	ãÈÇÍlVX6±2È±öâ9Ðvu>ðp@= .zR·pæh¦L@K=Mÿ´­=}à¢VK
}Ka»¦´Fe*fuÃÝ«^N§Ø»j#Äð!JÈtH¬!P+Ì§u¾ö)oÊ·öDÓ}÷L3É;µ¨Ð óú³S@NW>;§!ùnµÅ ­×Î{Ï.ûN/Gñ2/(Tx$Èª¶-Î¯ÆÌOÙ®-õ¡1²OÃU{±©¹Vl9¿å'q5L¹È0ö'J®»Â6£ADzãÓÿ©\r= !§/= -V©¶ÛCpvÌ$¦R¼lÅ6¬D¿Æ1âmãóÿ@ýxþú§ª¹NO²Ã¦+o¹_Î-¹¹P(22Î5Õ¯ë9Ï._Hì¡¨9Ñ¯-»þþ³pÀ V¼¶v$O)ÖÔ,/£VzÁrÞ1¥à0×þ4À±|Õú3H«u¥ëú%äBzzÃÎô«¶îÔgn úqÉ"hì°ùyÐ7Ø84À!£\ü6í2EÑÎÙÀýòÇ0p+äày°2E<còã¬´þXb9j±¤·A¯$,¡ËUéæd+*ím~¤RjlE-	=MW#Ù;lË=}IÔ#/û1YwÃ'RºOÿ}UÑGzòÈÁºA6"|>þÉÆtRÀc¨
¡àBbää
ö!#Ü "¦eµM<Ñõ<Û+Í1£(ÕéT®~¬ÆÐpùfÉºÉ³	1TÂ ¦k we-UÓ<58!Ñ­RÎQÜ:ªZ¦»9h»A×ïL´±[I|ÌkÙfåXqxµ.YÒ²äh"´woY¶¡»âÇ%@-R;1@ú8ÃÎÁáF+æ§ZDÜ3ú{¬()Âåq
úñã¬Î2 |è¼ÊÉe^µBäU_=MsÐò;QìÙeÉ¼Õ&wÄ 0;üf(Jz£åQNÐÞú Ï÷MV^y ¸Ô¢ ¯YÔ:-õÆ½^Â3,/Y8Ay<¡z¨58òÿXK«/ü±¬"Ìp/*+ÉRÒ^ÆïR'Kà'¸AtQ¡:eÍçcÂ®Vu%= = .§y<{l	-»÷ÎåAzY4[¡MFªÞðè~ÍY»jtq*= ëyÏ=}¯áîk!ÅR¶èþî²* ýý= /µ¬f<V°öÊ±ÕdÃÌ¯[¢8²v³ªiÖ y[ÃMOWËNËB	/=M­	O°ü æð?Ú5zÊÁÒu~Iðt{3Kk»+iäº®!n|£7Hê1¹w5ÿõ°M®¼LÖ^^rNuòl+Ûî÷É_ÚDHqöÁx--Z¥¤ºiB÷ÆPV¥³?þÑÃf8ða§â?<a³ú³âE®Õ»hî¾×¶D"s;hÆtøhø	¦~®Cú-å»ËÂ>Bº¦kâä54 ½7 ¿|ûÈ/T-bÏSræãÞ>äñxåg;"Ï3uøF¼ÂnFä[{å!(mÏ@µÌNÖIp#k |²2B~	£uksp,}´ABG#î«9#Xu-ì¼5i9³]háòØ¶'w!y¾VDþuÁ2ÖÈö\íÃ¯Üèè\ã]TMÜ]X,ú¹G*$½÷5Â~%ë¬MÎ4QäFÈ«#{e;d/«&?k+_½IBLEß(-§5\÷gÛ[ü°xãû£D^TÁýøÒ¶Åýe/­8ªJS=uù0 öyüäX
e }´ùÃ4Hàí«¡åÛóx¤!­ß}Ë sq
EFìý^AõbM9÷+s][×& à'À= Ó;ù9()áä´Âd_'^õ¾3âTÅ8hV¢,Y[Ý¡QÀbòËçÊÕâ¶h\²ß´Õ÷´µX9V= øÌÏ$
= p1"GhòÞN/%¦jÃ»cÎõ¹õRFâòÇ¸.<÷¤vÕûúq«Á@zu°ã[*¡G­óô(nEßó­m{÷¾a¢Â= mã«å;¹'<þgPøBú£Ì\}:330÷8j~lÕ</cÛ »­gcnûù³Rtû¿T¼«²/~°! ojØß+ Á4Ëzé¯·ÓìçPÔ©ïññµeg3¹,ck)ÒÇßûèøÜkÑ@XÈ³R¶;°=Mã	I"¾ÞÈæã¨Æ%¬PR6?ÇHÿ1û©Y#SLµè>Ðë<X$fâHÅç\;ë9´©Ô= ~cc¹î0nNÖVèoc7yÍ3·²³èsòf	U;î4Hå¤0D'YfÝ¶PÉCuÚ{©D@i6µOk´Õ$WÂ¯[3ñù³NÕ§-F=}4Ä²oÝÂ$çã×ª:È+I)k%µ>((Yig¬»0U¼²9¿67Zx|@%Î_áU&¤àÍSNU>H¤ÌÖúÐBã¼Ì= ¥Øß«§Dov¢WL-U}&Nÿ= ï¢ýð»ÃµY¦ÂØém·*ÕYGùñJC~yõ¶ º\ÚÊ·_	L*ßoC¨úvÕ ²×ºd¬Q>f8j¸Æâ<í i³óhtøæFn§Ö¾N¤ÚL
 ïG,gG§Ü{kLÔüª"çb±]TþÕ	A
¬È¦¤,gÝ%ÕÂãä¢m=}Oââ~¢æfLÙÿX ^_g¾Ñp>@r#n¾iÞP^u^S¤^­= 
p#§Þ+Þõä^§å^Âÿæjh_¦_Äg>}Ïrþ¯ÞLr	¡ÞµìÀæfV¦¼ÅâQöqx¿µÄ_<åÐ®LÕé<FÖ)ñÖ))oµK³	cg2*-Zïd\ÝÅÛ'=MzB×Çpý)ÿÐ0²ÇjçúÂ­Î0VöñJg¬ k'v%Ìù÷&§&5r'µC²½fT_Ê¬= ºú^&ÈwÝ2Tªi/f2C§³àgW¶ÿ´Å Ë.äqÒpÈtÿà
 h3Û
®ÿ2æÐÎj&ÁøhÁ½ÿüñØÔÎnË"û#¦Wd®ýKÃË[Ú%ýá"ÍN|G$Íî{a]ì×$põ£:Yr=}°UÛXK4ÓÍåü<WÓ=}×NFï²EX:[#-Õ~½±2ÇoºÎ3ôü04USR9ß\ÄÇ[~|8«u¿=}zÐÀØmóñTÿIÍ/§¹=} J^ÁÅAê Î¤­G Vèf¿µÚëVøb?ägq©;uÆ[4½Æ[ïX½ðHÝC ä"^¡}IHkã®£fë Ö°~÷~:¦n 9çðë®4¨µÜ»¹+À	¬¹ÛõX2HS2Ëïq/S	èDTPFeüCyØ.÷Øâþ ­X:ÑOôê¨!óÓ]= ¶Rß?éi½{ÚRæ/=MÃtIÂRÝásÍèjõ©Wõ[ùr£ÊÌ§ÕR»ñøØaÓT$%ãû
<~ ttkEøía=MÈ{=M?³Gð¼Ýêö**¤6&ê¥î±ë¥#ñQ¨QëÌEuúû/áîFJV0ÌòP+1ÀÝ]Îé¶§½ùáóÜ¦×ë2ÓY"BïgPÓý/lHXCÌ)óów¹ò.Ë/Ð®Ù}°<Èaçüâ!î¨|Ä½¤ý_nÇ|\^ðL}Æ.Wïñ4I¡"oöq«Ö¿<E¾¬».k»6µø??ïo¶Ö¥kxyü¦ÒÌé)Z-5|T3
ºÃ«·Cc-È]ó¶eD«gýánÐlº;lPNö¯=MåÑ°ó³ufUØämÀú=M5i9s+5{o>«P[ÍÏý×¨ÏdÛ'¦ÒósÏ;JæöCA®|'_¨)CÏãQ+ú!K]>CZ=}Ù%?uäÐ4»Dl©*½ÕöÅ[<u 	>²}¸	ØñÕÙZëT¥æÐ|GàE¤Ø77Mæû÷æ^¸¹eþÈ@7­Aæ^G=M?RuÆXî\d¬Ýã_GÍ?RxMÑVgìVcw@V@¹7iÿÖwìÍp¥NF.QÇ_£%ÜÊÀ¿Ç>{=M<Ö73i)üÑU3ÛÞf|ªD n3Ü9Ï=}(wtS´$êVâDªã¢&´#ýQí&ÚËÒ©þ2Ææs7à!£¸þ?tô±¡m¤"ç¿S/î÷Ú
&ª2@XoïO_ìõüp°´WÞþ¡£¢æ/ÉÖû½WåFÿO¸.×#©!1Ö/¢50NÐ6H@TÔÿÈÖÔÍËA¸¤È·#Pá09Ù®E>5mb2¤+Øy/.ÙïÔÿf»8£I(¿ØÎT®â£ÙuØaïéÖLk¿pTLËF22èÅ´J^ivMH)	[Ã&ßE=}ïsÏ= ý·QÕ1CÅÉÝwÐc&ß^O¯?ÎëTFPµÐèÃ'Ñkì¢"ÝÖs©|(qúi\}èAÏº©ïKÌYêöH)hªVMþ¾æ|=}?ÜÇmðÙ-Ø¾þ¦ÿÅ1j6Î¾=MPCød¸îe?÷f×æpa*wsþdNõÓC²u8´5;ñ5þ:D¤Ú;4ôºuóPq·²\)þV-ÐHà2×ßHAfqöÇûñ·ÄHÖº±zõ2÷Ì"aSÝJH¸Ã'Le½0)TwßHdäzÙNð&7#ýî¿«!ù+­)}øz10jÈÕjÐ;±.ú Ã[Mëmgsýàhñ«¡zÛµØ }[KO|%Ìù<)ßæ2åäUqB[¼«¿Qà¼d#¯¤g$(O#HyâJÝßùXãI]¼441u|RÄyp)6¢gñ{p¼ gÞ=  ìérHë¯èÍq¶k¨kh?ÿ	ÎhÞÚ/tsÓëfOÿeª¨þ¬#§å>dÊ¾DX5xáUûâÀÀ&r!nÅÚã×Òn3»oùÃëWðPNgà½W[[l]ë<¹õJ¥XÎ¼W¸çà²5~Æën·)]«tãk=MIrN®PBÏ$®¼oê®ºBK$Pþ%´hìsDj·0Qbûl4ÌXh¶¶Ï#Ï'ãsI=M$¹¶{S¿cn/oÎè-kF¨ó<C$ÛÎýÍð<u®iãìöTÜD=M=MÜæ=M|ÓÀî´Ï½£ô@µ¾Åà1ÌFä= QèÀôÁDèuyß²õ¢òi0®eÞ²+C?=}Xå¥×Oz¼N1¿üK÷²6á-"tÊ%{mt9<ÕI3Î*ÓMZÿ]3Ý$/4ÒNÒ¥MZ]Z£0ùb-Þªæz$¿Éóøw~.ÔEÀ{ÀÚS¡;æø5Ça­pºÝY9}\hË¬=}S+SµLðÙEã5]ZÙÕZ8Ìaò¡¥9ó#ûJ3èá4®8ÖC%[DXáâù!egCPE²ÁK,íê=}ùäÌw'îz 2f<XxÎ·.y2,poo´ª¸ù0·@!©hv·|Y=M(ÁáÁ¨­íâúµMwmèÿk8éEbAÁñõ|0ùçw¼ØÆÒm×íåm´ÃÌäFÜ]Z½Ód~¿xé*ÃBöEw =} =Mç90óxk¤Tø&FD©(= $ÁÚE¦<Ãþø¯~+Ð®= ÎA*¶ö|ñà|¼Þñ¥ÏÒåíÚÞ\ó¥øùÏLûøBEÄ(= ñëÆ"zÚMªyJYy]&=MWÉ<{{ñÎNf"Ùì'üa«¦¸ÔØRÙR»3µ&*»!NIÖ	¾ÁäW:2åÖõ»Ö1Ié/@q;Eÿy­>IÉñOümÐzõ£"m=}=}/+²chòÉ´Ø±¢}ÉàYé+<5{+£_®°üükä½Ì<= èÈL7t-n¦²wïôò×æUYxqY= yd¹¹ºÿ¶PZñPGmÒá³øèÜRWp·ïeÜÂ.5Ëã´ºCõ¨sZläó;= ç}tLQy« 'qblÍDÃ?,|DÆ5Ý áE
<{6Î1]ûVº=}09=M4å^Ò¢ñ"4èÊaÍòo¥Óª­¼IÄ%SÛÿíÌ'¼åÓz¦¸;}[zí¨Á&ÎibL¶Ût#ß)ýHf ¬eÝÛË©{_^»Ù £jeáh Ç3póò¿Îê vÀéìNòGa³#z!içt9Ö= ¤Û0$®í½¾ÎPàVèöª{<@«¿ÁU¨;7sØ=}fvIxEìAÔ>[ÿ]b=}ó:|1Tíó¾3]<x_ªo\³;ñÙ¹mjñ= WÀí¯à×e©ëë¥.Êö¦>mø0øzf0×°Æ¤=}4OéñKÆl!5©Ð9í]:õL6:=M]ú1&=}CÌâ¹öC\0âz¨\L;Õ­&^Õ·â5ïq¥jÁXaªEZVñ,$zoüI{Õ²ß¼¬hqdl®ÞÀ¦óîs(DßÃ Ê³Ó°åä= sçù»ß2e51[&b¸Ê>»#·xêç>4~þC²r6 Öxúñf¿þìÅ¬]ñ2K½¸\Yùó¬_éSwuf-~ä:|íá*R(H«2jöà£|¶K$Ìèîx¢êÈ¹ð+ë¹®¤ v«æñ_há¡ ¼þRÕµH­u=Mµ3§´dÑSsùü*ûÏØC	ÖguMØÍs<¢½ü?#§¥gBdoî<Ð/ÕntØ¤~eCÉ®{ppu ¤9ËÝõÝ¦ì^@³CRó.UiÇØ©õîýÜêEnã´8.Ö.D¶fãä¥öê%XþNþX÷{®ÿê±¢ÍÏyôÖªauç²ÝÝç	id¡= Ý»nÃ0ê¥ø	¬osÖþ¿N-©´'3()òNÁê5îþË!oÆ²ÎyñK[:+RKEMôÐO} õ£õQ*|$ß
ÿ Ü%Õ6X­d§So²ò;÷à vóû= ÀK ¤a,CrUÔàÿÕ^ðCªMõánU=}u
DIf×!:¡=M>JZ.>½¢iXs¶w9ÝCÓ!Bô¯Nj-nÜ¶õßâ ¸ÊÖ@ìsrô´Ùt\#uKq¯Ù÷OøÁ:boM.e¦ë¤¼8pÎUßByUñ¥ó¶³Ø6jZBÄ= !ç=} ¦E0°Â/U9³Ð;xT§?g+mZ²}(ÐzÖÔ@<*8M~*1»ñð6©´ìñ@ïG;AÜÑÅC5Þ¬sF÷ÎÈåm6g,oÿ|ìr»ÏZÈBAÏ+GsÉRîòÞ£{$kúsÆð3¿ìImxñm<(ìØè?:î³ê*GYr	÷)ÿ!¶W¸§èØeã,áD|~ôË¯uØU3~³$2= yÐÉOçC;vDæñKÓI{ÿ -c]K,ýGcÂ¤_5ÚÍ}ôådeñD¤:%Do|}+ì­·®
N®(bõ/§]zÂåû.Ý@¦§O=}°ÊÝñV¨»5ÝGeÊüÓ[=M=}ø)P]¥z¶^^!^^¡_ÿRü<ÃäÇ7ìY}=M¿¸A\%ÉöôK]OxÃLÁá=Mzæ¿~Já ²Øf!=}#4~=M?'r$A*Ú}IuzD?½@ð Ï" ¯3	þÐ1<¹=MtY®+'ÿ-ðÓty	5×äùµÙ['
%ÎÒ~fzÊbâ7÷á)dµÎAè1¨ýåg>¿YðsáÀ»ûú^­Né?v:m¶¬È=}t3¯Üð­£ô=Mj7J+èûÈ¦¹¡%ÖKÞÐÊÝÎ!d "¦nþ4ò¢±>@J~Ê¶®­l²6Óºr9=}eÎj$Txö¾
c),úMe£#tò²u6;ÁI#Lt¹bjyù>­]ÜÝ½1ÑeÉÉÇ»óv00ÐðìIðÑ0«0ìËKK;¡t¸¸òèwt@-yÀÖátª9!ú8ÛG U·ÂÝw+Øq­÷'5Æ@èÕòò3¢Ç|{®	3mÛi¥ LÞïå@¾ÉjGfØÖÙ^ð%ãÜÓr$>4­s
ãëAÃ%?¤ì8z9«£Gf	5Äh1¡öË<Ï¯ù /Î\ÐéYZÉßk:QîWõ5AñÙNÎøç*ÓzÇèÌ½]ùz»Ô/H>q2P+(6ÚåÉüïÊ1XÚøR¹~8­eÔ»¾
\n%+käíß¸ì;¤ÞA$>O´ÎÞ;×e÷MêäLyDëÈ:GyâÞðnîÅTÊêâÕÞpÁ.)tóÊÒ´±käÆÎ%Òì'%´BÏ"ÜCF²'Ï>%IìµÝKÆICÁõI1sýÐ÷B¿Ë]ÿ(1âûö(5è UÂRF§zyi{#TPÇJ+Ùmt9Ðwé=M=}*}zÄ¡Vcô2HIFXè¿Ûw	*Ê¤µlH0ðm;Gð$Þì¥±Öa!0X~yP©ÑWÑáGàª¡ßä	Ï«<¤ÏUïYïrÊü¯ÓE&VÄx{& ÉÐð©¼/ä/)û£2Z2­¸ù´­;ù+µyq[9 ,¥m?,ûÆìùR"Õ[®rT%KánLj2Ábjëä/BÏf&¤ïh&´R(¡ÑVS"dáG1ýçlÅÁ#C×Ué$ã¶åV#oXAu'-c3É;.ÜùeºµÖ¿Þñm´\CåàÙ\NÐj"<õV¾tà"ÿ¶\~js?¶	yçÐÂ¢OpÌ% 5d{ÒÁÿwé$¶¼´¿ïxØ¹3º$5çx6#ÇîýÍì{ì·ÔzWzõÔÏú!?t¥Wqlåmz³ãzAÖå®-Ïß!ç!Jm¥øª0RCÝ¨µÇÀ¨%Ò&ûª1£ýö Òý $¦Ë~ÖËúX´õFrf×=M]fléSÂÀ4¦Ï½µÍÏ²&ÐOÁ,´O¨ÁÀI)À30zO¬ZÏÍ@OLñô
	}1åÍ|$Sñ6]Ñ=}p_Êèò
ÂÜ
ÅØÕóe616Ar´Ùã;ùñ#|ÃE¯cÊ;Ùî­[#Ú$=}>ôRJÛ¹¨NH¹I1*IÚ¡Ývâ°¡¤.óÁÇÙú,ópG­ø ìg´R5N×R+ôàûu1üüÒXé&h'EÀF()òIàØ³ýSÉ§ÈØãü
8Y6|HYÙÓÜæª]¤ôÔÌ²pÇ©áèî<á²è¦+þ,%Í.LûF8ÙÜÃ|×¦}­§+½.VÃÍÓ3eLisÌ[Ù©Æ%/Ýð*30ÉkÂHã;ü+-¢´îW]Ô6G	éj=MTöC4o¡ûÁÞ«µF¹Ó!Hßã¼ÎJ5eÕÓ\ ¢³ªØ^jÎD>¾FÈä Ç?ÎÖí .Ä/U?vKó¿úI¶Ò}|wýþC_qùÍèL8= ð,è¶À¥®^øqÿxÅlñÿ= ¯MoEk$ý!9¿dögayùí+êQ¾C})
O»Í_ Kt µ¼¡Àme"+Î¢¦êqúl 
¹é¿\wèÈuvÐá*Ø´Q ûdjR$'eAiÜNÒT%é/_æ=MiT3ànv;iáÕÅföã@GE®Ã¿¶<z?f&îpTm´¯ïsã!qò.â
Û8â¥A°ÄíéOvz\ráAÁÏÛ·ÊPÁ?7³ã6L°Ô®¡¿ÿ$Nvëë344Èòd½
F{Ixº©1Tãd6%?ö!«>&ö+ÿÔCp$Ø¥;ÄìOzp(Ðú,oÑí!DåSÑìÍÑBÛõ<D6¯,ÏTRèÁ±k¥{¥ÓåÏaå§¥ìÛð,Ý¥×ð=Mð¨§áB-]Ûg¢»ÏA{×õJª×KÕÄÈýÇ¶ÂïÇ·øß,¬/]U¸ãQéÂ#Ëcèt;â¥Qiq3Ýåó.Ä®ÖÍ.³«ÖÓFö.¯³¶ÁûÒêÝ¢=Mr@#[çÃÛ#"R?@Iy$ 7Â)Òü'·j9q8A@>3À8\ë ¿I»À-áÀN$±ÀUBÑÀÓùjOµZËRßVÏG©Ï½<Å;ZÜûÆ/Ù
©½
%DøÒ¿üØÍ2í;jz*h1ëöCî§,ºDß3Ò¾/Å%Q78l»?(X=MQ¿ËHá÷1h¹ÿâ3³Å)Ä»
ÃOCy·=M9¶òÊuCí{×î74{ÃÇi­ù§Êd%t=}"7¥S5·E16-ÊÄ-Bý·OÑX+yN3¥´YCy2®*Òd²á×3JC$=}ªéÚØþøÊË¨¼8ä´ å ¸MZìBi+lI¤äÙ0m·}°SF¥Íe0ý8RÀ7]Á¦H(ï§¤ÿØAÇBqssR!ß/!Ä2ú½·®=Ml1GI2÷ÒÕSzöýlÕ»¦:3üÎ/çhÒ»Æ
í«)O»÷}WMg%ÿò	èþ¨³b	à1VRÒëeéó2!ÈQÐk7{íNÓ÷ßèÍ ùÇ´4´<ûâKé7'Ç"¼Hýôs}~üÝîÒ,|Üì0·3Ï¨Ñ§Åûç¢áñG¬E7¯Ïü(»Uà)2ÒMhûø¬E=M0R15E?ªØEË6ÔùdÌ©y@Õ³C-Ó©}®Ý¢VqØ
þ_ZNõÂRëº\ôàµLÉ°-ý'Ý!µ0<Pû¼Íé§]×|:AsZ ò0®¡ÜÓÒA»/¦Ì[ÿÆ?5Ä[<zõÜ ôÖ¼ë#þ¹0xñ¨8¾Â§¹Br¡õÀ{0#,}ØUÝGÞPí{OD»¶Lê->?A&'5e5kae$¼Fgù"¼ÖÜKGáð«ÛoH*êKåþ\ÖD^xùßÎW~{viÙjßÔIÿÖ»rc}åÿÝd»¢&o¸= Äoï?h}ë!Âöd­\wá­$@DãÏvÛÀ ~Óü<êµ{LÝñÁYk±vM´~¶ûãf[jÝ(w,ÅoÂ9ÞnÕâíùfñÄñÎÝp(Õ÷AáIÂ
øàÕ>¹cT/Æs¹ª¡H+ÇÆÚ¸« Úsü,ÀFªRøãýÄ?L,7ÆøáJvØÄ-!ìTQÏÛ>Ãk=M¬FóÄáci.S Vb+#Ð¹8?K¦Ù:'%¶­ej.Ð"4»ì¶8gÍ?KVrà	È¼I¾DjÏê&´@ÌôPyÐDA?qÕ6¸Ù[çeEÖ Ëì¶Ø?DkV'7yQjÚÓåmú9V³Gé[=}Û//$m»[Î:&}9Z }íºaÎ?Ì^Â¤ßönóßùwb!â~ºÊ{êíùoêXUm
n"Ôi#¼ý®Vå ¦j[z .T²vp	A"Îv
k¥!ñÎJJ{ßõfRoß#o&zwçïæ­ç¢¬·¥¢?î­r
í£?)Y6R²@Bº¯ #Ó´ÿxT/Öx§µÿë$FdýÁÎOÎjC%~dÜ[ÁotÏ¦9|iKR¶bí£³Ñsll´"°cÝÍs¯ÿNâhÿÕ²îÛ¯¿¦JXïµ¡½ë^,°¡êµ)ÃGÖ½ë2È
õì{ö¦áoÐkò´xv0¶áxÂË/¾Vok¸ü5¾ôddí°VxöòÈ¼aù4z»SAÆË"/,öAþw¥\Òì4zû(4eÏ:í@&*µÑÎÌE7)lÑ&­ÐrÏ*-ÿªC(/î'Vl%zìNYz!}Ñú>ÚÿU¤XT{%WízD½Y=}\î@?&ANWåà!Au%C¨ìlûxììz«ðÅÓzÙIÄZDïxMßëz­ø µp!z4pÂå£Ð±P¢P°î²©HëðÝ}U]­ eCâ|	ÓªÄÅøVsWðøÛPRö×íIdc¸TPÄIªÜªº¾l.°RÎG¦7±Z¨°DæÝº/Äù ÔIö(³¿µïUT@¿óÀ9ÃËÃ1§Fv2µö40®FÍ"{ø­Æv?²vci%.C\È?²	« ÿÈõî*|Ö¸NûÙ¼FÓ¡¶>Û¥FEÿ@ó.M#u¿ºu+#]~f|^!^Þ~Þ+Ë9ZùËyË9Ë9Ë9ób
!éyÆULËRJN|8X@n'Gü~#Ñ¹B:Üå$¨|.ó>EJ]ìÂÝLÃÝÇ-½tèDl¿­ø´è0¿Ü³Àq1p{»@j!KÛ$èäÃKÆ£áq»WF¬ ã<ò,nÅE¡&(ðÐ$ï/Â8áªÐÆI¾Ç¬ò/FäxXÚïz8:ù$ÄeÆP=}v3B«±9¶P£\;s>;x ÛÉ¯±_LÏù¯zk]ÚÔ@ç=}|äM%ßê¡¶5ÎrMD­þOVwÚí¿ë©>«èé	Í@Dõ®ÐaØæäÆ(Öì¼!$M{¼üYâ±ß½ÏqºNeóºj¾½%à;ÿJFÁ?¤Q¼Üê²h?ÞvvnÔ­lXIrOÐ´g¸áÖ=}dtkZÉ4àÙ	lÖS>À^<#$Î7Êè-%+ô6Z;xe¢Ë¿ËÄmëÆ¥!ÑyL×¢.iLÈNá1\B\k$Õ%®:Ifå0óz°æì {­"p7Âêô@TëjÂùÅÑe#WÖ°®æ÷Ùöj!qóæ	äFüN¹×Í ]Òe² þSuOÃ[*bÃ¾Ôv%Y±Aj\+Áß~Ö^êai^v9Ë9M58Ë9+6Ë9KJ+
H«9gwY'G-8)hêç³BKÖÃÌ´ÿ °óHJ5¾É­pLÆq±!(Óû·B<co;V:{Ó#üò»L#ð<LH)06Ü{Íýßö-xê÷!n­x¤ó3Îì}§ø3ì?þ!¶D,x-MgR»çñÁ±é@@jºÃÅÏ][Ê\käìàêÃQÆ(ú-©iGöä©ÍG)Æà;µO/Ï)
ÃÜ)\:3«FtÌD;	ª;¬-
{¶9#ëÙôuAY¯úÕîU3å¶Ùâ/ùì³Cbå­@ØOñ$ú]zmÜ½¾9©MØãëµPT´ÉÌ0Óù¥MÎÎ7»dí%¯ëYª-eÊÎØæOí¥:YöV¡­»Or'"Å¢UÖ¬ÝGuru¾ÊR©(ú½®U¯<®ÕG=MTA%èUR÷\_K}SçsKýÖ±P÷c§½6}Nó¨ÍrFÜÅ'Y}Æ=}]'àQ¦;]ùòkÝöV1]ÈTSV­ê_ÍyjV¶À¦Ûäo´$Ve÷/!òd¹«*Y%à£ý7\(hå4:Ç!!éûA,Ù,JÔÒéA4/:wK#úöIèH1Óàe¤ÙÒuHá÷2=}å­Û÷:!m\RKroè3áVx*Cnês¡ÇômAºÃ®óçÒrÉ õ¢½p¡±¥O{ÏÓ"G¦¾o§p©°õ¨#µkÑ÷ÒJÂ¦î)¢¹éáè7¢C´õ 3<E Þ|8ã2Irï3öBÕ
ÅwPÛ(w4=Mà3ah	3rj	ÿ=}&¸êAK6Øà$.ï±ø6÷y¸V	sË6éÔÊEÓþàM¿¼kôtåR#òÿ #¤6kñsYëÂãZfO;¶¬j|Üù&i¯h@àÎzHªs£]/¨Àô÷ð¶¸·*±t¥	æ°±sÿ¨³³[ý¿Î^æa^^¾ï9Ê9<9ËB7Ë9Õ>øÓÕp4Õ3e5T4ÿÉØpÀ<i	³VÆ0ùC)ÙAÄª!pÃF	n®ãÚË³PD@ÿ$=MwÈ®´¥£{·Õkx%ÇÎ¹¤Æ¨§Þ[~_yi®¯ÆoSéJË ½Æ1ªåUÓF÷	©(»â'ØBý/!°ý»eSRþÊù_Ûúk'Èo1õvO¢¾ª5G$ZLÈ üo"\¿û*òé=Mª´À$V¹ÄÆö±Õ0útR=}Ìßák	×=MÉ#ýG´ºFÊ«+¾É¬ÝDÁãkÕÍ9'ôÔ¥ËOO!7ì­$T&Ä9éa9eFaËèzgB¦¢öq»(÷qQû0+ãa»VP(c)ºµ¬55k1dàÒ:/wM¬1Õõ×NEðeáÏÆO¹-i$ÙÏ[éu´#<üSDóm	ÛvJ©L½¼O#/mûÜzS%Âì½[×ñm×%¾Á^gÑa]ÞÔCß{æ:æ+Qá¶ÿrª·q¬d b	·jZ| Þ:®Tå"êïÁ Î×o$BöÎÄãq0à@f´¼æ~7ðäwïÛêè$k¯
±ì´r+Z/ªëÄÚjÓ­Á&jçC#0¶êÝ% òw%«ÏRèÅÆ³½l#ÀîãgÖ¼¦~&ïmpgóæýÉp5Öö"=MÂ¤ª«G§aÚ±ÖcÊS§U2²¨Ã¥x%ÏDÔx'ìGRyü¬.Òx*6&þRÆdù··üç94ªÄ?ñø£Qèl-À^7ºöö+OI7røE½ðáÒ­l=MB0õa©Ð/ÙïéíëáPÖÙíñPç&&ÂÇ¤-PwJ®^£_à;c"î4'ãú¶&o=MÐèÖæOíè¿¯*XÀ
yéçÜ¹ªmpâðpy©®]² ôÉ&¨òµ}¨7B²äüjé!.ú¼ÃC·¼,WC
2= Çs·Ö%¨ a×0=MpIëóRÜ³'1lE²ÑÄsû¬³ÿ5ø¼3èÏ¹»+ëù3ö5þp´!(\:È¿9áxÈæ
#Ô¾éøÈ7Ú=Mt¨{µàI	ÁXü½A·eñ;â:oÐÜäîa q²½âÙêf×o	£~ H=MæüÀtçª*d¿µ#jÇÿ6¤ %rgTá=MïL
âE½ºîlõ¬¨AgÝ~Ã·ÅwgTøðÃJJ-wíT)ÆQ¢$÷ÐÀJBj¦îñóQÄôzõËÐ
Í&V±ìüà^ÝcKPsR} ¾SpcU.	þR-]SXþA9å·Û¶UíMØfvQf= ºË9ÖÁ9KÚ8û6Ë9Ë9Q-Ìm-x#»Gï´ÓDÏSï¡R¨Dþ!NlÇÛíÏv:ÿ<åÕz°ÚIðô)3*ó)RÉH@ÒÑ§<Ã6ÐõSY»½ÕT<Ã§Öí±'4ESµ7Á­©í;,ëSF6AWlíbETN­ÿ°XR,I±à-W$ºË}BñÎ-C÷ÕWA1Nü­m	 cZx~×8ÞfbJyî¼]Ô_ñcb!= ð«iö>$ôÞµåa¬¼hFT>AYÞ vH¢r«ÊVø.m!S°ä®júHÆF6+ÎÙîCÖ¡ß7ä)k­wØJÇ¦Ï3îEßGÉ!û=Mä>)á&ôÒO±¶PÃâ'Á·³"ðúÃ®Ó)4dô!	·zÁç4%ÀæC\v©Jô2Ñõ¸Ì=Mj7Àç%pzJÃÙ/PNäC6Û)FÅôºÍIú}âg!ihÁiÜ ÑÐ?¢x/¬6î»V=Mîþ®ö®
îàNèîüïn.Î*sÔw¿ØÕÿ·Í¤Ý¿+~-¿7¦J¶ÿXb¿FÂ;ÙøÑËìÎ.Éï®ÀNÓÑóL´¶¼¦§F£«æ±¹U:R6R6! ñ \A 6ñ ?±  0Ñ 4Q é ÿ© \ à	 5ãøâ÷ãÉâ¦ÕâºÕãxUâUcMßnrpxt¨o°sÛz³ýió¼fÿ½hù²Aµ -=Mãw9y¿íQ´¨qÔ
M½[XÆT	â}ãÈíèV§	)DÅÿ HeHuýÈd#HîØþÜZ"³·²g³¥±;2®·+µ	2´­{±Å3ÃÓ±;±í2±S°´M2ÙS¯ÛX©ú]eëO]5ÿ½ú*iYâh_´^]­(GLUúÙHÿ= ¸= êªBA3%^ÂuäóÆ©%ÆeBáÇºò*dó)ÇK=}ÖSbaÞv¦rc8ËyQ=}7
ËË9Ë9Ë9ó
Ä|ýkã!J/üiÊ[ã*XµÔ[Ñ]Uqù×~"tqKø*Döo¹Àm};=}Û¶ÞÒéGçÁ4wª·æ>x´û¦xÂüÌêÓcçùL-¹F=MåÆEaòÓêôüÿºG'ëí¯+ëýÆÒMýÖN_CÛ]úÒò</÷D=MBZïíu¢GÐú{,±AÊÓp.oÛpÀ $=MFÞùkË¸Î~l¬µ5B§mZ¿æè G:vÈï¦°§ésCñµÇg[;¯§]	Y"1§ÛÛÜâÐ
ÇÚ-?OÐVz¹ãç.¹íGF«6Gs³Nù3Ì9åa¼eÿzÙbäs%O9RûeõÅuOõ?söu»åX\9Ñmí°fõ¬Z^KýïSyb] ¥]FrÛfëC­ïÌO= =}>®3Ù:°Yêz(ëñoZN¯p¤,ÁÏ¼ð¤#Ä×Úò³àh= b3þßÑ ¸õ/|h*j¾CÇâ©g.á]âcÊT·A]MËï!Çí+Dì6ù?ê,wµ&=}RþuaÛ.HeËh"¤,³â@NWfò¤?¿«jRL#¡%oÝ©lÕx´Ä¾1ý7&í)#ÝiþuºbKIVzO ÆÄkü5!o)ò¸ÎT4£Ó K³mÄtX<Én­¥NÂSRÿ~áõEÿ/æà>_h^^þ¾Ë9T)K7l}79Ë9K&Ñ·A4iwÛVN­	YÏX0^àdP¾;¾0jåÀ@{¬M<Ooê@º[Æ= ²$ÀzQsÀWñ×°ãTSüß:9÷ºýù¤Ñæºí»Q×ÙÇÄ3éVQÚg5Å7ÓpE´ ;h	=MÉVÜ{04qR¾±tÊÄ¥*tæ0¾½ðÔ.XÚu)K¿ÓC¼XHM%N0$ê*OFºÚÙêóå­nBr¬Q>Q·ü½-#÷uÇ"k%Ú×ÚëíÍÎÜb#kðJfó¤°¹ôÕBG×°o?°Ã:ep® $õ®kt¸ÆORAËjÍ=}C+ImæºÑýèmmîÙOîeíFÖ*º+*µ×(ãÅâ)¥³HcSpOèp=MOïÚáR¹êB<=MRüH}ÖÛY@­ÖX÷»Í=Mê/\¤æGÕ\~*Uq ÝQY\A¡]QÂÓ¥uc|IS"Þ7kÏÀ×ö ÚqÒ«/ùÆìÆc)­¸@À#RÕ4º ô	óÔ*|?ÞU¥4úÓ@wK]ZjÎ£:ëÿÁÖ#ñr<Ù1HH¡Æÿ[7|ØóZi@ÆÂA ¹o$ÊçÎ£ÎðI»¯ªºyá R@¶øt-ðç{§@5éÂdWÎ¥xu¦Åáá õª¸:ö¡~uÉUP7·&E£úmÄE°¸,õ0
à ó³âi	oe4.ìËµIÄ4 ô¤UCÙiH£ÍÆÅ1	l 1wÿùÐjj= _þÎTúË9ZäÊ9Ë7Å9ºË9ÓUN]¿^àdþÕÍ~Uj Æn|jÄEBäk??1ÿv,z$ú¿æy,#vùàãè9èECÎv+LÁîHzá^EfP¨®æ^°ýhb=Mo2£o6¤²vCÁïlìE³:ÖâCÚI¢­¢6ÃpÃhõ°þsï;1Æyûëñ\Úd'ÅÄclÆòü+#÷ÑöýåÛ$ÑçmÏQ'¬ü-Kcúni?£¦ÀéDÀíºÂÙðô@
êyõQÄ hµ>¿ð)	6ÅA(µ+ÃkÝ}£ÕKà55ÝQCÎÜ]¤(¢oüçÜé+;: As¹ÏÇ=}(ôÞË*®à%"öªb¡/Ü#1û9Ïr<ú{fLâÅfð6ëÿ|= T+ÏÁ¼JÁGì[¶æ|N^Ím°VOn$åmÁAf[S¥Îlè4ø{¥ËKg¼mçÍ$§"»¬G!Çíü?E:ÚFé¬*¸-ÁUZ= Y°Aphõ}Ûwi	ªÝÓó(¡5v½x÷¼Ç"°ÃnÒ,gyò¼§>X¹òi;DªCË"àM/J½<]FÛhô¾RæåÚÜ&Ä]¥¾Pvóõ­öÏ@;ý¡N(3-7pWàl×UèlG5â¦Ó4¹ôlÚ¥¢]YPa¹ÝÓC|¸ÛÀFÅÚ$W¬½æ§[à.L=M]OóL£¶ù&Ðµìq}C6å §PÊ9"cü±¢:°ï#À¨
óµ@°pìUòo®$Fhp?j9 ¨S3n®A6ÆÓ£û&¹xÚ'3V]¥«lãÉÐÃ	tx¼¸B*5Äõ´.¿Ó=Ml ­Ów·)*)Øz©3!ÈÁàR/<ÆmaøEwpÁÈ¦þöoç(¤Rj¤Hk$*Ãà½g5­ù<òÏ+vIÍ$kDºO%Óßc ôtÆ«Âïô·YÀãÀs-

RäkhÊ×4ôú¹Ì}¡*ìÏÙ*Ý8$_seÊuðÈC&ò¬4Õ ´6÷õ,ªzD :uª»Ö] óEëÚEä»y5:·úEìH·mdØþÜ"ñCürKT 6icÏÍ¼\TD;d}ÒÛÚN½?©ýé¥tX?ÅI%·=}V¿Tëññ2>?À3Zußý³\ç:N½¶'\Ì>Íb\DÀ-Í\\!(TÖY)²Zå·K;SÅÛñÍd~¶xÞæÒ~Ñia7ÓæõZ}*N
¾Â,âîöt \ñÿåÐU¶v ç¿b}l¥úÁe¶tq[ïêìè¢¾Ír1 6ø	¿/FKêä7À×yz©²zåá@æðêEÆ¾£pgÚj¦¾¢w\çFèÏ<ç@'jU­ør\î¢']°'ëÝÇfç,{ÇOjê[&r-ÂÄífm&ÀÂß7Ò§DNåxº|cE0móîÄM*~}÷»cfäuNÕÕ­h·æX&ZTsQö!e¨öy¹ M°A¨WÕj9â2íôQúå%î§>@'¨,[M1³ú-@(7ÈÌÃ³QBÚk}ÐÈ®¶é×¼üõIfIÈë£SêðÇ¾¬Ça:ÆBÊ×-Ìÿ³7â9ûÄ ù5 >tÄÊÃ©¡|OkK¶QA×eÏË{rJñÍnKLÀXÌtTÔ@¡mÉYÙ¶]õaY¶WíãáY÷9-Ýba¾y^^^Ë#5ýË9Ë9Ë9Ä9¯_ÜZH¥¿ÜD¥+~Ý¬rU% ý×Zgjgþ³'^,ìjÑÞ¯à|òh"îgaj µæ¼ÁàÒæÏ#)dÒÊY-dQ¯z Ônëi¿¾Ìf= ¬óqNÒú^]_Ï°HP zAãîö²¢PÐ$éCçî©#¢ôuQÁúö¹ÀÔ©ªÿGg$ºg½#°Ôõó0Û
rK·¢¤ôïÿ{AJÇw«ãÿÚs(î¯ÿf¬ãjð¿Ò{o$;A¿rihÅ§ÎÜjk*/ÎW¥ÎÎboáÏàÝö³ð{[';u'+ýïÎ¥OþÕr5Õ£ÏXÉrùK/ªH|«	Ë/¤Q%r!\¬Ò;v¡Xùv¬ÆÁÇ8ô=M	ÁwPô£zaø%OÄÇz3}"|!Ö+íÅ$+Öh@qV±ß
wgÎßoç2ò¦ûgç²*«"¨ÿ²pMå]Æpa[ðÏBQ½UñX÷Srê»±¶ãFR2°.ó"s2Ùö(òT5­A4ú<»«A¹²ýQÒ Å1·&þ¹OjJ¡ÖÓ~á÷7ñÐùOqééÖi!;8Ä	ÄÙÄñ½î+súQCzzÅ?»Ý(ÏrÚF ¾dc<uhPó²È
B"XÉ¨¤£²£Bvs£í	ÆO­£}íø2R<
Ghkðx,,1.UäBfù(Çë2TôN½¸86ÓÊKASx{ÏíÓ¶±Sr.²8@naíß9jØËþ &=}¤¤-ÐO ïÊçôª*|ÆÀMq×M«B	+zÈÈÄO»ù)¿¿Ni¿ªÖÅ?õ0¨$´ô+ÐUsÿ&¤Äoyø6nÏ;, 8ÔªQOòû]JZÑÆ=}/'sl MsK¡¡äw%§UU¬»ÒÏÁé@= :*ÑïÓÐ1Üãù:ÚìNîº8áÃþeYÔmèõ|à0ú	?Ã2X¼lÝS°¶EÁ¡q}à·DWvH]ýÐÞìa^þ6Ê9KÅ9Ä9Ë93Ê9Ëyý-¨= )øî2ßÓéqöØß¶ì¢ð&ÌçÒºû&¹ç"Q!oBMi(ë.?_jþ=M¨ÖþÞÄ'= t î¢îááã¨sWîÉ¢B4ç¢¢²oÓýè® *ëöá"fð#úÙ¤¹² ° 4\pyÒ¿¶_!°Tò·Qk§ÃpÂúFGÀwñ,)î,=}äÐè¤Còö9¯U(·´«ß/>WvcKÔT ð¨óJË;]<²èü³Ç@<ºs;­VN»ã	økl-¥]´±LçøpãZoÉ3³!Nxú1îRE]54 C*vGÇS¢©ã PéÒFÁ[= {ìñ<Ú1/èü)Ä³äFgÌ2PüÇ7jêËÊþ»&§düLJ÷ßÊãëRpx1¦<¤ø} W¾¢¼$¢óç}ª¿Ë@$qø¨Ä´H+FÉ&¨,ùO)ª\tLw*GÍÿ#iå,¹ÆP) 2´v
ÂFÅ6h£,¸WS+(häÇÊ²HÇÁ[yÃì9F[$ìðÔ|©JÚI¾E1ª5T8·O*ìáÍ+{jjÖ4ß#.ùl4ÂÒññ[úô'×0'Pm¬õÎ§F@ÜÉu¦:H Ï%£)*Ìè2ÐÑ;BÄ¢}#t÷Ü"+µÌcRÌL¿ä=}!úo|¤Q>Mÿ6µm©×¯çJëÙ©7)	¼´ZPí/}ÔÐ¬T3¥;ItZTOýXìÜÀq[Öð[@[mù¨eîgazèb=}Ó_ýgÎTÛÞãàzÌxÂüæÉîRéáªn9A~O
´mÏ¹{@ÑånýãórÀ;#n?-tk·öý,DÜ¿+mÉÕö±Õ z\yÄÃf{ão(ãÊ}xÿ#f)m¤VZ ;ª¯ªó Ö¯Òï3å¥×(
á¯Èê¡êúsÀ6ã$cÀ
|rÁA vQÔ%FÐ¤;ýríqËtEô¬)|Ïä­éñørER7Å¼%7ôQ}¡C^#¤= b.8Ë9Ë'8Ë9Ë9Ë9;}e¤Bl¯¤æE»¡öa= NÕåv×"T=M,iÑÎöS!js ²ztD\ @\ÕÍåYª=}ro´sçÎÜâ[ïf)å¢Nt¢ CIoÜìÎïÿÚ= Ôkß#ûcÔSt6«¾G¤_MêOE=  èâæ: qï¿ð&,ÿµDé::ÐZ&ZûÀ©"+ú¢8Dp[sçQ!Àî&± 2çZ=M@#îòÄ¦§÷*kÃôâÂðUõï)
¹ÑI*YY_Ýõï¶¿ÓÌã¦ã¢rD	hGäRù	ÎÔé *h×|B­ð~í(SèÁ¸rî³k°'±Ã"Øói¥³ =}¯'X§­zëR÷u56½¥¡Mï./ö¨D= ë¹´ú0ÓW O½ûm÷Ò,t5÷¸¹´eûäìªE?û(IÓ¤{47Ý»E\Éûµ]yªÌÎâPdywGÈ.9V0þ[ºáyj¼{¦Ü;~U	Þ]dÔpñµ7ª4ôÇ½9B¹¹ñè'Y\k÷*¶ÀÐÌù'åq]=}WW$BÝtùñ¶ö7ô6¸! Êéóoé¶xëv%ÀW¸éËYüöW [Æ¯ø+Â9¢¿A´<:µmùì+ÿi8¼È×	ëÜ2Z³ù-­ÊÄÚ'u!¿³Ðå7{
Àl	ÚÊJî ¡+ÅåÁ{<*Ô6(:GîFâ!àÉl·üêYJN©'¨õcº´òÑ·±9kÜ©=}LSªõaºíÓÇ9CHhõX9º{ÔçÓ/Lõ=M»DZfXÀØ
¬Då±¨·íôS:'AârÆ=}iÔAç|3EØR¸GÝ	%Dá|,d[$SFX/5½íùÏÚXN§ò#ÅÀÜývÛ ³ÛÔNW98ÆÕýDø­õí2)býøÛQ×mÔ=}Pýyuà:Ëý9­ÛÈÚN·N)]%n^ÞÏ#^Ò¼Ë9[È9ËcË9Ë9ËAÀåõ]ghÀi;ñh¡0i¡Ñh¸¦½¤&¸«V¼½¶5°;·VÂ  ýÁâT±ãQââDyã÷âáåã9ÅâEµãUâ	-ãK}â/ã]?¹À³qm±+5Ñãh1©í'É3y8¸w5·÷ÿ(ò\(î?¨	O¨ßG¨&W(ßÃ¨EÓ¨Ë(P¨ô(H¨à¨9(ó¥¨@µ¨áí(6}(Ýê1ÿëyïà}1ñ6ð:àûy«xPvUhx¨vw(yexÃIv%ywW¸xi8yÝÒ(ùýÏÀæOËòoÕ ïÃïÝ¯¾ïÛïÆO5´A0Á,_\HwÁE£,ÓAK{¡}c\-ëTÍë	ýêºê¯Ý5\Õ@âÓ¤ÐØ£ÕD"ÏÒlÑìÔlÃÎÃÓÄDÐbÊ¿ØgE°wÅ¢£µE¤ÉÛEß
ãqA{û»û°@*MCIEBzJÒyLyKºzMÚ÷J¢ø?üA·>¼@¸?¢¶AÚºMú9J8LÒ8KÂ=}}"BD²s.ÅûïuûbµáÖúÕ= 9Y¬
%¬]Å,õ¬,âm,K-¬ðM¬[½,V=}7þ~Åvã?6Ëëq9ËÉ9Ë9Ë9Ö9@wÝHÄD,8× ó×èÓ w4CÅ¹ûÅnõ¶½Ì»×óÓ(´\S4ù
Ç¸½:¿É¿³ô<I¾û;7¸93Ø¬ÙíS%["ÂkÛ"[Ï	UñD9%ØIÉUi4¹È{Ü;VISÕ
'M·o}nU3\±Ië-Ý'S=Mó=}0IU]sZsR[ZÌË[1¸:!x1)XíSÀ	#^I´&¾É@®Ië?4sæ¯4´Ï´8ÖÉ¢Iô'4ü4	1FÙ+ìûËS÷Á{íD¹iöÏou¹{ô¸ñô·)Eµ¸é´·Ó	¥4¸4·¯I©¸ÊÀT+RãV4³9åÔ¶ýKäJtJD<|Ð=Mó-6Í{¬ÂûÚ6GfÛb®ecß´Àne¹É¡
ÿô!
 o4cï´¤¯ø·À
IÁzëæÌ­/Øç7ð³ÖãØ4ùÄó¿²Óµä}ÍÄ0XÂ·EÅ¹Î¹lFöÉË¤5TFîÍ"c4Òúµ¦z(NÔïÓbKèG_%ô¶}¾}ÌØo{)
o& õÐÉvðÎµãSl>Z¨I*¤lL
 ¨r£SDcõ3yd¾ièÏ»SzØÁsðÏ¤{>{j "þg2¹mAj#°bþ^¶>_ë=}t)}çwë4Æí¥Od¤êº
#¼âkÆ"G«4_.cm>àUN%MFávë§öß×¶à³¶í6çââ~= /æ¥p°îìªB~mc ¨¯äh² h3H^3aÈ^2V«]áZ­Çd¾^ý]Àæiõ&®GUúÚH÷R= ¸aêAB3Ê^ðÃu'ôp©¯'Æ¼Cá{¼òC,Þö)³O=} SÜ#cLÃobaÞnrcÊ9»Y½Ë9ÓË9Ë9Ë9Q£Ø)¶í»ÚøW¢ºÃù°}ý¶-©¬T¦à3Ã7£¡TIós1Ü>*ZÂÚ¶½IéÅéÒ7&ÀÔÆ½{Á7{JÊ>¹=}ë´·*ÿãzéÆ(Ys2OÅ{syÌÿ&8»ÂS>~çt{0¢Í½ ,']2a@ÛQúl¸P=}¦¯DK9©Òþ¨èBFÆp-µûªùhVRÇÄÍþ£yX;ïB3ºÇ+Ì8ïG¥¬èBRàLçCéñ¦ÚÄÛüý¡o¹h§U¸w³g³ñÛ¶a3Ç¡üÌèyþ}$FðF²;û_{ÏÕ$"¦OÀÂá¼D¨êB=MSF{<b#9®ÎÌÜMßó#ÜÊâ¹ì?P=}ñÆìáI-@åVcþGp<º%àZ¹öUP| |@f-±½Np;<~S7e
ùSc¹ ºJ|½Ymçs:V2 åï:Sr!<j§*§ô¤Ò ¼&©o©©óÏ·s¥3Ê÷tpTI>#¢]«JjØÒâW{ÉJòãÚUi ²;þ²FßÙ¿@éÊÝÊrâ»Èö/wä>Eïssk=M!ÏF¨'v/¨£J@jÚ5( #ºz*%Iá£Öq¼àA­(¯1°çè¦8±íç2¤>ÉEôÔÂÔ@úÊmJ.í8\jYëþ¬Îzñba¾n^^^Ê9+-Ë9ÔË9Ë9ËM·Í^iäl@8IZ¦wàF\¿Zw,[·èð/æÝ|)2Ï&ø»,¢Ô=}ú*%R»ýäÌDÒòL,B±OÖåXô&f*Å(VãæFÝ[pôbC@SC¹©O³º¼äs\É|k*:â@/³ÍÃí(Ô<M9çÒ3r>MçºL8%aÖ"O¥N­(ÚãAÙpéá 2=M¼>7:©*ê=M[³ìZì1ùêúÑùÁÕÖsÖíÍHmÖW\oå­¿FÅ6jÜ_£ÏjÜ+Qºî×-=M-}ïQwA½SéôZÈ(ÍÌl]©Ú5ÓZÅ¹é^yc½"ç¿4ç¼òðdø#5æ|§êe§ÇjìqÂ·±l£Pr¯¾+l£ü}´ SàU²æÖ	¨*½àC2.*·ñ©?¸ª*/þ¯ååSÆ·þ--ûdºB$yz#ëG¿Åþ-P+nK¥ËHYîØÆ+oyl¹64ìÞÙ¼*ÐÂ.¼ª7ãm"²Éøe5l×PiÛÍz@ÛÎvFå\ÄÝ\k>Ä~q@àfvp á;ÿÜjA³£#ozø}ã0+Æð²Ávúz) §OÊîdã¢D/ãæ	æÆûF÷ºÛó£ÁÐîú¥ÊÁi6
æ¡ýèp® gÃª½¬ïÛcXáÓøÀQx¼U2°ÖütkÆjÆQØz¹¶ëk-8·w2Vc»r]G$åR/­n^¤_^^r»Ë9D­5Ë9ùË9ËÙ?Ä9<YÖªâûÚÔH!(¹Û}o[vSØd¾úÞÇxawÜÖnÍ¢dÑ(Áô­äNÐ<®º1åP¦Ãv¸åä=}f,YëþBK¦µë@ÏW÷íP$ví¡ôfSÏjüÞ/q­öÞZ¢*íªÀ[N'Êìùê:rêí¬Ã>ÇB«ÁHÒø-,¾+ò÷BÅ,ÂO*L,$ÛGz3,¿ñ%º
*¡ýÿiN§·í, ÚÌ ÚWÀrùuÁsâ«©7ÔÌwÌÑôÁºú\&î¶' 	÷øG	çf¶¡ïZ¸º»%UsIGF¸­Ã d¬xËÂG	«Ú6÷ñN Úi1= ³ÃyÏUñkìí7ìð{vYMBá8 }MDõ¾mL1bºÇrNÜ[£wVÑ}½MEL$aâêæ¨3\£} <@¼íÎLD¯|J¤CêArÓ|E¢Dg´XûBå<¢üDI<Ót/EV5]GEwÙßìu/®";mõØã)à	Z¸ÐëG=MCô7.è§å!ðÍCE{\é&7ÙvLí10e
ùVîÛ}ÿ²[æåwíÏéØ ©ív÷ÁHÑ,ZØßNC©pÌÀA5êp?@XªºVlBUBm[¡5e<4ÛB/@0ÁðNã0.=Mv×Ý8OÉ¬]?eÍm[BÏ"­ÒTZ ­>ê[Dá5ÍæïJ$'3@jÓnÁ÷biÊî¶'Ê©§Hu¦/Ç#ìW0Ö÷¨QÆüjÅªÃÖ­ôÂ±·Ì-õÁãzu(Q°üR#hZ¯>,Ð£ð¸çÑ¨ª8*¦ÍÃÔÊµ®cßóï
$1¢(­	Á~²¥DdTWxjØþçÔó¼ÉÏ«i;M8j{áñúlhAÒ3/Äì|=M
S¶¤ýw<XæL8ÞËjwú¿&æ¤z Eû£ªn&öÎÇôd¹À¤	w {Dæ"öÑ[
c«tb
3ðÌüëÄßÓ©ËFMÃ!¯¹p°Êo¿%)È26±2ßÍ8lft11ïµYú¦]I"å,zËÐDài¸qºwÃ?èM¤j;N>¬]ÐÕÙ~v?'¸¡­
O 2éEw´D+þÊwCéïçÊRÁÒê}ñ=MWÑ<ýç^¼ªiBö±~£á§mÀ/é¾0eân y Lø®4¤ã@ÑêU«¿îi¥Ï¼bsoÚs'üP¦Vs#ñ/¢QFÎj¹hÁ6Tô5qA&ÓêAEÖ,s"ÑQÉ= äñpwEðæMï©ðXóª3êrLÙ?Êêò]!#Ýoä]£L4¼UZ¡¯M¹â:\Â89dë©ÅÿÑýìÅ.aÝªJõÃïrñ# ¥7j'?ãÓllD³ô©Ò|-õDý×­h nÑå 4ý æÐ3À$Ë?÷â­b,!ê
9CÊ|²«c°%W¸½ç÷¤s¹	ï)Dæ¶kõ2Ðÿt]5Ózú°-þØ¸LÓ¶úyÇ=}âÉÕq¤D+b{Ç¿ÊÁiøzs ë±KvÌI¾´¿e'ÐûÍFéÏ°;&=MG¿©¤!>^ne^^-Ë9ê-ËÙË9+Ë9K!=}Þ/= ­qWóÞb­q¿Soº ¢«ò=M£§gs!Í$]=}èïx,.·@úÝìÙòbID¨nT·àmðÊ»'2Mðê§òÀTl[ï »øZ30úsõµä½yÃ6)&p·8Õ(0%2x¬|ò¡¹½üPZ-ÖicF	ÞV³c|ÐÛ-L B¢ZÂô´ °÷·QóO[ÿ*YrsT=M´¿ò)è²7±ó5xÈOâxtHªI¬kÓÜÉÎÜúdÙ¼ÆÎºñÙQ/V§¯ätåÆo+#ËX|4&¢e;&»5;¡uUg24Ã®m1Ø*u3%ýeS·ËÞa¸v.5'î×kX:n	¦$ ¬2öWc$"L¤·-âuû:À Õ±"÷@Y<ò¿gÄºË¤ã=}	+·Ö:úÀÉiå·¾W"= 9Î© u¹0Ä#Àêl¶#"xñ_4zÅ«=}~ypD9>#.ôÛy9{ÐUKFhEU= Ùé~ÏWîaÍ*{×"ï5­z¯æÐÊãqqÂûWºAª[ÇÅ\Æic}ºÎ§Ó£Åé¸8Ì6ÓïÔ)ë'QÀGÀ|ºQþ?öeXÔü:{A'Õü©OÀ3tlIÖQÜU÷xHá2}$&XÀ±M)+QRNMjxÝY/·B-ò!\zgÇÊ^}= ñlC*î+áaGQîJV~Àdï {ª¡ý¾DfDÇÂf	¡6xè­ÅuÍåê&s¿öã2tìH+ÎÊá&¶tjã¦<¢ðÑðù¯é ¥¯&3´Ìhw}p+Fs/*¯ì¿Ý¥jM"~êæÃ3H¶ª@¶;ì6¥ÏfÀAü#Øgªwò*õgÊª§B\,¢ª+ñFzû"[­§rBQ\Î1z±¦øôàï~sï²ü­£>õä?@pr0÷0ü,ùGBfá¤[ªåÄÐOËévØé<l7jûô+Àïz5BþÙåDþºÌ=M*µí[PöZíÚÒUCQ;Þµ±hV~¢n=M	ãÒârÏÀÓo¬#}ºêYÀBòVÆg °êEóµäÒ¥w8m)N©ÇÅ
.öº~ÀÓóª¼çÝ¢sý²-ø	wQøOC¶!þ¸52ð
µ%?ÓöÚÁÏ§EI­aÙx5ËÊÖL½xOËD q«+
¶1*¥[tp¥EÙi_óú0¨©Öy4ù8ÖÉ8\í_ÐÞ,¡¯àÎË9ÇÈ9VÈ9=M×I$ÀÝÊ9Ë9½4Ù¢[åQþ-6WêÍ<ÅÐ-Ú¿àMu,=MWè,µ$ê[äVÍêXä'ëMúíZ,Vû&Vß5
ý¶]WçË%­= ü\ AuÑ¬æÎ5±âúÇ ª(w¯²Ú£ÊsÃY2}é/	$	Ò¨èQVÓ @æØè§zM³pÜ~»gð±®}'[ðÊsïÂåkðròKr'°Â¦¯¼ø0*róÄ=M-ù¶[ù:å·
]ùGgùRå#]Nµ@mKÝÖ7Tå(SÝ×QJ¤Ý¯(W)w]¦Umï]6pZíäüÝÊñRjõÂ¶½!òcR¼ñ¼§ô(Æ·å)/­ìo=}BnÐïÁ½ûz­´&Ü½ü¶»×$)ÑÏ= à±h¨Î_5câ P¤ïg´èò¹¦g)y¨z®³ ~¬gG/(Ê
ªCÃªó×4=Mµ¿"ÑsP«²N-µÚìHµ²ï¯²C­2.þä3mà;3Ì°ÁJÓÔ±Eëç4WH2+/¾%³k\Ç®rß¯øö}0Âæw:çV¤$0 ) ÉÞt/ 8+kËðo÷þ!<ñjï4®e[¼{M2C(»ÔH´õ7SöPÆ~kSöó	%ð7XÊ -×Û<$H¸No_ËÀ= 4YgÖ1v.8Þ}jÂÍÞ«_ÁµvPTÿ7däú'Âoe=MxoÊ"ãÖh%xQW1êÏiD¬ýAÕùnR7âýJË¿6±püùÀÂÌ(Up±ÌfùUw)Ó*ö÷¿$GDêÆ,cÑ$öÍcIì¸Î² àå_tZGÏõWý÷DÈ'7©B4¹ïZ0èW´´Öç Uoo¶±ôÁ+ãb»¿øk§ÊùÂéMw¹¬&6ðs¿)oÔêÊåûö{µZKv2ÉN!ü½J·JÄ­Ïôy{VV$ß!l*Ôþ×ã§í{ÏÏ"þ&oWã¬æ;Ô@	qýdXÅ¢=M	Hê¼ð¬ñºæI ë
iñ »68ó%º/ôÐ6óO¡:=}kó½ÌBX9kïûLÝÔÅéùÈLÒÍP>/m°J´Eß]x­ÔN"%0ñasü¢Q@XënPÀüÕM+&ºÍºDXNNmÚ¦¨U¿äE=MV¡3õZ½ÊYÐ<íhÜ
íQÁZÖÝH­WñX-}]¦ÝÊ¥c~tÞøÒ^hÿ_&ki¢?®~@ßFedÀfýÛ\h (æo9q*'MQh¤=Möö{RÛl¿éÙf=M9 <x¨+%®âPòî«¿ªÛ}$Á%Úx öúUÍ §iÅ¹»ØÉvWà­oò³¥ÎÑÓç-Ës§²Ã´¤ïNèIt¯ró¥OÔ×áý¢Ät+8Æ õ$NN¯j!ªÁç?Jð¶|"ÀÀz)@¶äì!IÜzMë@¶¹r¥óÎ4U@×Ëv-ô ÖØunÏ_ÓábürÙ¿ñM°¦oqÿLO²î"7ZiÚ÷çàÂXQðÇºî 7KrÐS±¦-©×ç±§0­óJcÇr;¬¤ëì¤hI¬	bGJ)­Eø®dÍMÂ~&áfÿªLÂ~ñ+c÷:¸öã2;zj&&ÀÎYLÃQ<yQ ÊPâÑö×åé¤&uCnõÏmÐÉúéÐÏGéQö]í%×òB/ýqíP/+ ý»)hîÝº·_)i®¸¼¦3ñ ì¶rÀ¶¯¦]èÌ -æã³£¦
Z×éÏÄLøp½ô®Å± +8p 5ôCÓ$Ôª£ÈÛwKÍ(ÖL®¤¼¡wõôqSúa¬CÖóÇÑc}¶D°ß¯©c ¹/[²'z¨8÷h-³*O hÿû3vÛÄ÷µ´»3
=}»áIUxÔY2n2±!ç\
Cä½£Û6µ¥	¦{_Óêwºí8ßØtè5Á{²-TÿkâzÈ>Âak}<¦Yï¤y÷p<æ&4|Í Y­qù&v;*Añ+ZÉ¤÷'A¸núÌ¿ûºiúú.¨$7´|0p=}è6¼Æ¡µëó§Ë«ÇE.Ô@³8ó0¬WlºGþ­áÇ{ªû7ç<¬ôÇÔÀý/'ì7»b:F@ÔuO·»ºû9«,ÌLGÔ±ô1+QW2[=MåÕXESN§õ4ZÅ.iØW:¥A¼yS¯»2%A#[rFE§]ÅîzÞ6f^~v9Öd½9D4Ë9Ë9Ë9ËAyúXùÕÏ%[ê2èÒ2Ì ìAyÓvG&W§¥åîüC÷S:	¥F
2Â[I7Ú·-Q-Øàß·kR	À¾¡uamvfÊî]ßÔ½k*tëú*ÄBÉ³çw+¦Ë¤D½Ð@ùïmðgågùÆ:;"NG´ÍÏLçí=}«âr÷Ñø²!ª%|Ä$-Øå÷q*\¿D=MÀ(ÃÛ«i#Ø¸1 ûtä;Qãó
ú	ÇCÌ­=MÅ¸W1èSôóïæëËÃ±yÄ7&)¤¹h\¯À®ÌcÈ7'5)¬L·ÔKñ?ôûrJænÑÎ3ÐNám{:G>@«eYÝ\I÷ï)'>ø¬8RÒ°Ãñ:ûG"Z1'±##úô3ÎåédºB;? ?@;Õu¥ÃÐÇµ;«ßLÌà1;:DÄ;×NÅUÎå»úHG´m-Ö¶X#¡Á© 
¼ÌµTõñöÙ7Ô'©é­¼2îíq÷ÚÒ	FÏ¥}ÅVF¥Bàí[MÛPYÂNúýàKZ:{IY¸\ÜôOñ9q>ªø^Ó©eÖ1-¯_
	= êwÚw¾æô&à@pmÕ¶nÓ·î'¥áýdwÆgO§æÄã¡ºÉr &þnytä®mävV~"ÑÛö°g 
'u$»ªé¿l-gq=}qQKÜãç¤b¸Ep6³¡4¡þ ÒßG9bL¼s¦V³þï~~é&;¨¨ïhq£äËn7×¼BSïæ­ ÖçìÃÄô6¨@/¨g)§ç"P9ÃÈõG¶²Ä¶q÷÷áÃ´ð7Ü®DNa÷Øã)ø ÓrÌ4¯/¹?Hãió]³6Y»¿á~ù(	ø°À¨8i<U=MoìëþÒâLò|w IÁoëZM¨ç¯ã úËnÃª]]Ö¼rA<Ì¥ÇQ¨ºëÏ¥êL3ÀJxA6Bv#Î»ê@Ûê 1$G®ì³ú§@¶|ÅC/wý"7À0&ü¦Á©ÜëêS´R/.ÄÉª:¿ÿ/LùTíÑ^ñaå= N<3+Ý*8Ë9Ë9¼ú·9K¬úÚ*²°Þ=}¾ËË_ÙgÆ¡X_\q.CÞÁ×ârîiÇvoëîeâ´hGúÂ[³i»´¢0ÀÎoyXæ©"%{zu?Û Ï[rÀ¤#
ÊÄEÆG#ZóD"³Åé¹¤ ùâÝI¨Vâ[
=}¿,Ýpäô.íòöªèÙÉµ¥¦7ª(°H¼ðV~C¿gw9ªØ2òÿKA?rw'QêJUÂJ(,­&·1¢¬ÎîúIQCj6­²,uÐ²csJ±Î%sÂ±vcåµ6Ö£7­hò°P(
¿¥³§]«¨¬Zÿ¢Úµ§=}ý³Â³°ï=} ´sÑX	¥£» %³jÖ À¡|ÅÈb3f¸gj±1Ú©3ª	ÄW¹iÇþ4ÎûäR/xl.Qäõ*×=M¿¢ÏKk¸ð3É')ë¸TÂÈwÑ«©+-¸(ô4Ï+
Á×«{«G·%=}IÓj\³åZìñ½ÓR	ò«-ü8ØT.ÑÉèü<yS[Å@cI÷´,ßÓjÚF¿þA²aExN\Ì¾3aÝ.úïÛ×IvÇ2!&¤üÌ ]+¦Uù¤ÛÐêçÀ´qß¸²ç·ñªJ·Å@Âôç¥5ªÛ¯ò÷hðHÄrû±ÑÚH8ªWÒãùWX,*á t\5¸6ïûãÔô·&Õ& Wtô.Þsß (óîó·
âä¶×=}( ;´ÌCXáÑ84Á!:.$àÊZ7ä]myeÍ7.Úêûºt»É6<7ìØû	JºÈ¥Ü/¬MÔlsÐN£GoÏ.	áÓ¡zúùM>;lB]¦Ò.ñoóú*Ï·»5'|¬TªÔÍûñ;÷¬½ÏZñÇ£»j.ÆtÑÉuCäÖ#Í»*W=}£1åâ7;:FÄ!«ûÌÐÒÕÉ ù$É:ÚôØF$T$+c³ÖÖnR.÷åõaÒùK?\´më]RN5m=M|tòPP/>¬sù9×W ©Úõ÷ÙúL6³!æè!lõÉ¸µnêe-¨Ñv8ûã<-¿Î|}!£äØÚR	M±­}ëYfSÿªUïU í=MÚz'MÅ2­ý}ÕØY·3­!SÜhÂXÚ'­ùÜÐuj¼tMmÎ¯ÞÔÛ= úxþ]X^}= Rr>/I^ëibW¡x¢Ei¿îÅàâb·&ÁuàRÚwÂÙ<nm¢(Ù IãF1" gl
jÏH®æÙ¡ÙpÅözó°1|Äö{!:ysDB@YTâ÷]½ö¼U "å± »Ûâ+Of»¸£îmìÎËÔâG¹ÜéÎIÈâ/M²rÃý¨2uCÒáëØ¤¨á³¯ì}è@{Ã)A#%F±$§Ñj·3va9$VËÆêÚQÀ²;tÁ@M0=M#ÖO¤W Ï= çÜú;A
y}ÅEPYUDOL%7N,à°g¤IpÒææ­~Jý>[bÝ
©Q¶àEprÝô>]z§¤³¦À²'§(m§ÕÔð6DÅðòB$)2ü¨¨Í´È=M LH³9hvre^_j-ËIQù72Ìú*Ë9T¬Ë9Ë	ídjÎÛãhgtd}ÎPôãªý61fêøÙùn,h2w~+rFsTîJù= ©f­ÃÃ§	¶w¶GÃ¸ïX¹+¨LvMT·7Ý3(´Ê'ÊÂ*ÉA¢òëß«Ëò³ÊºLÇUby7õ9æ=}¿áQ¬?ZÁA°´Ôì2±7ÅÅÏ¥'¤6D77<¬ÁÔBÔ´ÝQápãz¦³zª6Ö.%@'lPÒn);iløÑ~ZÏ.	ñdû²$§oíñ2Kûz@BFQAûvTWW$'ìDÔ¯ ##äXd»BK@À9¦u ÚuÕ5ÆÑ2#ù¹ÚÎOãù% :²Æ@ÄFD«µk¤÷+kÌè|ÑÁ:Ô>áùÑZ'IÿÖòåëvmÛÖv0!*×|DQEåÇêÚIÿ¹°º¼ÈóUð	õ¼Ù9Ùw"éÃõ¼lMS0Iðõ -úXK¡Ä}©V¶®!¥ùíäíxÛÚÊù>ÀíÃ¹ÚÂG%»}µäòÜ¤BSÑ ­äÜrýc{ ÚæýÂ[¢"VOJO1Aàý§­ZY?Å»X^9he6¯ôÄ_@^Qdv_øbÚ~)_TmXÕÞ÷àtÂ¹3~¸b'b76æË²îÑáR¬fðRîõáÚ|ÂF=M~ýâ.éâ¯¢7Ä¤éÌÕl¯ÌÖæ¼ JêgOÛÕææQ¥Ük&CÚÍ¢ðn'Bs'3´-^ïúñ£0qW·BWï1£@<æj­?+¯â"éÈpª·µµçÁ!*ð&pÌõ¢Ap5L©ÆýüõÇ÷©DÌww¥Ë÷÷À*&|U¥'²ü¬D*|÷ªEÃâå¿\·Ä©hãYrðõ³´¹ÿ«¦;s¸ì²Æ¹é¯NL°ÆÒ¤ÿ ã}r<¯ø«ÃÔgsø¨D- ©e	üÄ÷¨+­ìRðDã(Rý0Ç*&=Mï Á¾»ëElk.¦FÿïÀò¤Î$HxMÔÆ¢ü0FÎ¹Á7yëiÝÜÃ2®¶´ìß¬©¬5ôÙãÕ¬õÄêìÑ¬ë±WÌIÚÙÑDí, jdixòëÖ¯5¾!yZIÄÐwdUµvR6ÀîB	dGýwê[t,Gð)BÄñ3«tWxÇ8,ÂÄñ¹AªP+O#÷ª6ÃQò'¹¼ùr[Ë°»©¸BÉçº©  ÉÇç¹Ê'Ýä)_8Ì~fþË99¹9Á¹AË9Ë9+<ÖÈ÷pY©ÂvOÕô"ë³°¦pa­§2ï>ó"'ýpïOÂ¨ñýµÄÆ·÷ºÓÂlôÇÿ(HÁlñ×³$¶QÎéªÙ)ÂÝqW§D´ã 'rXÅ³²¢ÄÃã(ërØÔ²¶ÈúM=MN×ò ·hW´²:ÿ®E AÉÿ[²ÿ<õnÛjó '³0Â±W³¢CdIy¢Ô®ÇÆFÐ×â(6G³õ=} A¨ã©8eLÙó]²¤2¦øÁ ëVÃ ÈÇÇÿ/ $½£âä¬Á5zë¶	HK2vÓºAN³ëMíÐÛ0Æv³%«
, Zù)HJ	Ñ£ÆÕ17AGÊf1÷¤Å6{Ûã¬+ËwíFQ¬6¹{ÜIZæÉúdèy	Ê®ÿÔdôÄN6¾áÝqjX,Ö8þA¬áÁ%jP»v\.>\á@Ýj A÷z«Ëp§ÀÛ·¯=}B°yñM§È¿° X¶ñª8Ç#+ñ$Eª:V Wµñ­/,¶ò -É¯ÿò£òÈ´&Ø&·ºI¿otÇïÓú#ü·t+õ¹7Ê?{VÔ¢Õ1@A±iCñ#3Ýtóq6¬Áq« I8ZÁ±+åËù=}ÛËhlÇ'Úü+à³Ù7ºÂQFú+9¹ýüãTù]Ê|$Õî8¿ÅÔåã{dòÕÆ¯)ÍåÍ{{TGlï{æj[%
ö?.Ðç!ýSlQÔòLÎOð¡ÙlM¼RVHNéý.C·xõ4ºlsÔ'±<Ã¢«õ¥«º(ÒÎwºjº°åxG¿è)ïWýµÂ8D°Sþ©õ[êÙBE)}	ÀÖ
¦Jû%2ú|áéÖ¶Cø2R:"¬Ùí¹%¨-!MM¯Èö%Eg|ÉÄÙÒ¼DãXíË8{QVÏÁ@Ëíú-ÛNN9ÁÝý¨§ÛU'ý)ÅÄoýFCÛòx¥xWÂÌIqÒUÆY"MA1Æî-%WZ·>±¾­	[TY*GS-üY[FQH-I¶_-ðb:§uÎ¥, _Q)b¢´kF¶þÂ)Þ6ûaÉ_ànÊX¿_õ$ejûw®ÀÏæÕ«VÞ*e= ýjÆÎ>Tû^W·	U_$-Þ/cKqh¬pò'öõµnþ¡cDxà¶ëb+¹iÄÕo:1cwãþ3^ÿàûAbíi@rB»·.ÌíFÛ¬nÔ»nO~ÒrRX.Ýé]jíars^j£Ë9IÄ99Ë9Ë9OmD®®ðînçN~ë	ý®ön=MÎß®n ñ'âX[ãþâWqâZãiiã	âÕùb;Zz&Å= [sÿ7»?@±ÿ>¿?Ön¯vÃÉrªºÄ°kV²|Ã³ðC±Hu³ô³l³³<3³À±Pi:Ó±U°dm°í°D¬°ô*°ô°t°ÄË°$L°Xz°¸û°(½°<° °L²Ü²X]²(dã,¤¤"hDÅ¨E<¾êÃÂJÇ²ÈÆ:Ì¿F¾FÌGË|Â2{ÃúüÆBûÇº¾â¸o·ÍJ=}Ä"<uÈÊÁZÊrËjÜÂJÙÇÚ[¾[¿2h@jfKëBzëG¨>ZªL¢¨M&D,IÂJÂCÂF?"MâËDÚÌA:HJJÅÔ½¥åC¥gÅùD*'4W7·)Ý.gÝ 7Ð,Õ3WÛ9÷W&'\0T<[+×Z%Ç} eM!Sþ±2|ê;áç\¶l^¡$v,Ë99Ë5Ê9Ë9ËùTÏØ-ÎûÿÒ´!ä:äãjÛ©vôÂÀvº)Îß×Ñ¡äÓû!^¡ª{Ì4N¿L¡ßcäØ)j5v¤Ë*;¿¶-Kæ¿-!i\Ý+%Mv4*Ù¿v[,.Iéÿ¡ÿ^¡àô-o¹Ä#«Ê'ü0PûÃ¥t©=Mºô
c­è¸ó®PÃ°Ë©äô©+{8¶= ¸ÕÜ|·´y-6×â]í
÷Ê§1ÓüÖQ¨)3ÓôÚ¹1ÕØ[ÛôP¥Q¬¸<ûrÀwÒ1ÐJüJq©'õtQ,GCOm©RÝôàôÄ?záÝÐJçIú&OA¹x¥®¤¥âJì×z¯isÑâCV»,OAÔk%/ìëzAùÏ²FF¦7+OõA¢Ý%EÆ"ïØA#¶%P§ìD1{gD,Î6ìê	zµ4XÍÔ8?6%¯Yþ5H.±ìvE{Q0;Î
A&\.?%ÐÜEæY7@UZ9/ÏòîN®ìßmoÐrº¸?Ö¤ÀÿÀ¿²?¦?Õ©ÿÏ¿Ò¿©?´?Í¯Á½Ñÿ¸ÉÿÓÙÿÍÅ¿ÖÕ¿°Í¿´Ý¿stlP]¿(íqä«PCWPÌü%P)=}¨?T¸¿9¤¿J´ÿW¬E¼NÞÎXæWâ®EênMàÎ[O®LNMü\ïUUªf]¨6V´[¯VO£ö\¡&O%A]i+àã-¿òoò¯òw/óó£OòrçòW§óVógÇò®w2ýò7òòK×ó¢cs¹¢¹º®¨÷º´×·²£w¹»ÛùI{yyùýù¸û9)Øºu¸mÖÍý4­÷®FòÅáòÎ!òÒóðÁ2=M·¨-§(&(
w(è7(ô×(<ã(?(C\»z·	J=}>Ë´4ÊQ\ÕAUaUËlóí¬Ï¬½-õÉ¡SÌwMM|ñüVE¨ðµ(á(àU¨­¨:=M(WM|Q©'Yµ×\½÷prkæE¿¡vþÞö~d!Ë97TË9;§Ë9Ë9Ë9ËümEJLªpØV?7¾KQ7õà¼kX|ZW´Pû~MY'máHýbUiøÛwU«.T>ã}Û]E>ç=}àXÝbõ]h¨ZyÊ]¦üööÖ·.£Î³îËÛNÂþÎô¾´>Cú:Üî®.æÕtÚ¹½vµ¹V°®¨.¸¤NÖK>U\
Ü.à÷kááë[ÜýËoÇsòÌqËujFn*FBú»Ú¹Î¥N¦M>#[á­dd½klyHä9¦-}{ÚVÆÚND¢Eüz:ùpúýtJûo
øsª÷AÛEA= Å½r¸pÚ*
NúóJ3SÝy;7D¾-tU¦)UVLÒÝî?þ-zl´}Ï5%à¢àÉá/áàÅ;5W¾\cUÐÖY¨F¼m¼wªsÂqºI÷Uáý|o}sã}uünËüp}p4~Ðl¨,¬èÜÔÛÜtÝ\Vºj[ Tó.5@R9ÕÀTU@ñ}£ñý"Oý£(½#=}"ÁÝæ= ÝèGÝçõ\o#]s\qNEg#6¢@ý¢Ò¨H·'"¢'òÀÒÏVý¬ê¨ìÃn}Åpél·"0
@ÄO»lïÆû©**ìDOÚ@MZ ¾_/þMuÐT ,¹"QéW¬ÏïâôrS©ç#öÀ¿·úÑòÕÝs"±ó"yóµsO¡³OÅï¦¼¡2p÷Èé*Ó
03ÕdÏæÝÜÇÈ<ÍJøæ¥øèéÔþ÷¶5:ûÎ=M£Y´ ÄÉÕ1¤ÉÇüÍMûË»eÆ1§òHJMæmèIùMÕuÓØÖýüLõÂéØéìÛZ¼½EK7à\ C^M®¦J_á;!nO#®ÕÅ¡äW]?ÜÅâÌÛÜòÖØöÍ$VÀýÓzðìuõËNbÕ¯:¯ñ¢ì'@ëö@Y±	SûD¼Ùìý?ê#¨)»-TÊÁìE¸ëLÉüvÌgEé´Äß=}ìi#Åé"²©¶Ê ©"c	2qûJ[CÜ1½9#©¨ò	#h©$#¸"p=MqÑJ=MSÀðÛWJëüË­ËPz¾£éËôÐéö¿½Ís;KçË K9#YÂåÆÃõK1Tjt^®ÎËA9Ë9Ë9Ë9Ë9KüèGðITòAoY
Dóò2=MZ×MðéÂ2­BÃøáÝÇå7¥j»Ò¬ñ¶y;ééÈð²;ñ1"3¨Á?1S¶)íGpªCÇR1;¦Æ{ÓsDNö²ØHìÊE«Ó_äÎà.8HêAo4sv- Æ©ú!Z,«Nè"8Iª?jÝÈÑ0ü:ZqMèÌ
@l?Ò7cF&Oåkv%|¼pK]Ç-ìPß¶Á8ë[äyÓw*¨,Q3×Ç&®´ÎøÕ¢.ÔÅ »ö ´Pó,÷¦Ù$èA?;ÕzÐ®÷ÔêÂY,¥ Çqñù¿6"gLQg&¤Çx.ão*¿a¥,Ü0éå÷¨ø1áï*Âs'«¼NäZ} ðöªrþÇdü
Âe)küNü}ÒCÝqß¶ª·/ÞôÒ ¡v!²DòÊÃ¥!ÃÌOîuEy»U­Z]â§¦0îïJBÿ~#«c®ñ wÆ¥/éÜjÀw!Öë÷*¿é¶ Ð´äSÊÂi96TýázD%,ÎôQº>°æì\x5'ÌÑå:AmÖ&në[1^ß[é^×s>ÓÞ_<dÖu YnrÍm.ÏÛ^M8Ë;2¿¹åUìEÌ§Ë9w8«Ë9Ì!Ëb=}UJÕV\EZMzìÅ](õ=}WXu[iL;]-Ù[Ò4ö;x÷×rôóÕðÙÊÐïº'ëÕV&õ¥¢b&ó´ñm8X&Ëåìôµb'ý{C6ZP9°7ÇÊü©ìÓ­îe'9= =M&¾Â~­ìúÿ¯ð=}Gòàk('¨PØñ= YPÏ¹ñ^ãTÊzÈ<¥WÊz¢­j°  ò5Ë¨¶ý¨	·IsürAÖCôÅøÐ,sìÅ0<­÷;­aøý3ß%j¾¿±uNÆ
gV¸Úö±jÒ1eÞs9ß£XÞáÕ¤ßcáÞ©ºrv;dÔÞ~IØþ28c°Ô$áJ²þ'ÕcRÖøc:@ÐH8xVÒl8ux¾øiÒÉ¾à:'e+ÁÎVsÝ	Úõ4y¤vcÕ2hàç"d}Æõ "øIÿC!¬ÏÀZØs¸ì½äë·N[Fºöº¼áÀG.åÿd²5wSÇ KLØÉ»wO¥É9æ<Æ¶é¯FÀÿ~Ö®rhL¾¡3Í-I.Þqoyí«©£!IÛ.øFOÉgÊ!#HwÎ)A,Ö½ôo­=}@ëµùv/!}L5tå2MëeF¤¿«Ä~ºh	Ã!ñ4?£4ûÁLµs¸Á=}¨·V×ì{üó¦_­{OÉ~ùDñ°ÙêBÖÍCã«\¨¹P1ùªð.VPºrG¾wé5ïÉ»ÕðõuA&|Ëç2¼LÃð J)çüþ;üIÇOß,6¦2Q[m°8QãÛ:äÔ«H£õ¬|§-måKïR!³¸ Ij¸¥	²=}§õ$¯!÷r¸[pS¶ü§ólÔ¢ÀyÌÉ7 Øtªû÷óï?+Ød¯ô1 Ð¿íRÀõBïJJæðïË´ôº×gß5¶¬=}tzù l#ºÀÙÅçØY2³@¯YZL= ÕD*Å´P¡V.¤ò5|Å?4ËÖvG#v	lB1µ£P&¾UÝöÕ.A¥ÕNUüÏ½%rG<ºý\èÕ¤ðÜ´SyµE:=M´µ´×o¬²«tÅysMäÌvÿ,d¤÷KH#HåÉÉ3ÿÕ,Mm	Q:°²@õ2µM	RóØ0~÷¥S3øÁIH+Tòý§tÉ#$Ø÷Õ=}Dxé7S³ÉQÛÀ¬%æ}(^ë¨ð2¬[ncâà Fâ à®¢rqèib>o§ªV½vbÿ®¨Q×áÁ0@*M=}gÃãÐ WÖMf mïÜþ¸ÑØüá!t=}_`});

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

          this._framesDecoded = 0;
          this._inputBytes = 0;
          this._outputSamples = 0;

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

        this._framesDecoded++;
        this._inputBytes += packet.length;
        this._outputSamples += samplesDecoded;

        // handle any errors that may have occurred
        for (let i = 0; i < this._errorsLength.buf; i += 2)
          errors.push({
            message:
              this._common.codeToString(this._errors.buf[i]) +
              " " +
              this._common.codeToString(this._errors.buf[i + 1]),
            frameLength: packet.length,
            frameNumber: this._framesDecoded,
            inputBytes: this._inputBytes,
            outputSamples: this._outputSamples,
          });

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
      this._decoder.reset();
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

      this.reset();
      return decoded;
    }

    async decodeFile(vorbisData) {
      const decoded = this._decode([...this._codecParser.parseAll(vorbisData)]);

      this.reset();
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

  exports.OggVorbisDecoder = OggVorbisDecoder;
  exports.OggVorbisDecoderWebWorker = OggVorbisDecoderWebWorker;

}));
