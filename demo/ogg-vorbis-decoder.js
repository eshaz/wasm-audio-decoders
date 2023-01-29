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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode001dIi¢r]N)ÙhÚ!$:ôesDêÈbëÍÚ-¼k¤Åo$2Æâ¥Ç«Cz Pêu5ÃÇ<¼ççs©+]ëGåsLÚ{Ú 3$s=}sîßâV%F-Í½fU)19öSnÆÒæÎ¡meÎÄ1plÅÒèa¥5}DO¹ááxç\Hs.CæÉPOÐÇ×rø¼gÙSÈáéJ³C$³" Òc SãéééAUöTPPòéê	dsô'ûPG¯?ÝÇjØ>A¨ýÐÓIë\^»¥x¤ié;ÖèÌù3;Èù¿ùçÇ6ç·µþ¶cÖ³ ôùÍÕqJÌ	øýmr:[òòò øÌØ8×¡¼Ùá;Ê²àK!¦~Ü-éÓÇú3F ­ª²·iÄ84(S3l·¡AÞ«iQDÑíhºè³ãzi=Mðw±ª= ³Ãá^=M°ÒwÝ[ãÓÎWãûóÐzùWÚ}÷u[£Ë)¹Fsäó ç],XÓ£0Þ÷ZGa"e¶ðM4Tç0±}¥$9²Õòò3¹ÞaÞ¥ìwÊ*ußW4éÁÎ!i£Þõ+)úÛÂ}+¥¨ ºU'!leíê9 yÈ¸JìO9ÿPsÖ2¡ÉFè=MOgóµñ9qÞúQç¡³QtMüå7ºfÀ ³[UOø^lýÉÉ}h#ãxHXg7:ìÌ,n5Ù&Ñ¿Ï#hNÅLF<ü$L*þ4Y7ç8î¯Ø7ÆçcÎ*oªÓ= ÛÒûß&¼Fï®Î(ÞKdQÖú½WJñ« ÿÜälj·¯ñÑ,ÜÅF«	ÕY1¾w°ÜÅK	Ð_ÞJ^ÇUê,Ú1­cêLÞqØ7\GAPgc¶Pc#Ú«qXRÈ b!À=}_Îd{!ÒÎsÍ,ÜÖÝ¯°ìL¸¬Öç×ëè­p±\ °CXkªÚìCX.Æ\PÕÁôßJ«)ñÓdïH°p±fr&GÙ¡è- §Ò0¨Í @Øâ²îñÛØá4=Mè=}ReFk×éZ"³4^=MlÉuCê5k¾¶Á9±Ë7¬=}Uáýø¨PYÌÀd¨±f^¬¸ÓÊKMF7ýýÂ¹5øGZ~#÷@	6º·Ã=}äÎ!Ó÷Õ1¶ÏÛÚ·{PuA zO¶{{És«êq)àùéóã~Céê¡¾¢Ä·}yYP·6jµìa¯·sRÃQâ¯[v*ÑäyPèr7±¬0Ñ6ÄèA75i7AWåaEáãêPI"h(Y¼g*rÆ¥üAWæxi´ßk£aT¯
ï+zQe ÄÓ7ñ³þÓþóQ¹·£G*x£øÆZÒÒÄë«¿ýÈw Cj$è¡6*èj= ²£^7Ý?·«à\hÏâþ½P«6=}ÏÜÓ9ÃRÓWFTáíqÔC¤[Ý³8bÐªlvÁzÃ@µ$ræÝ'³h«Ýådeù¦@ÚsJ)ÓÈNÄ×çµ"ÃvIÕ2²:èÇ{v·qûý@lYÇú¶CxmëC!§÷"ê¾j<å8¼C+îô¼¬Óë½BÙ*63Ó^·9Jõ±ñ\(êùd<F&*'3ÌãÀú}ÅdÆP©"c¦#6¬)[Õ"ÉìýVîJoq×ª{t
}éÒîsÄná3D¥a­p·16PVùêXlßÁPkäË ëIÖ¶4öoº¾ßpåAB8»OÝ*ÏóWTq4TnZÚ¾îIòbå~ÏëØØùâ'É=}ò¢9\ÝHBqrCÌë$°G½¤ äCv ÈPWÎ\bõ1ÚÏF%ðNyCÞ+.c[)qºëº~Ú£Û$ÌaúçY2\Æêi¶I*{:ùÞ¶÷Ði[D ~luqocZÈ'*MV±W¼-Á0ãi³ùë?meÝW7¬;²òWhF{¦â|¼èÝãÞ[»ßÀSy¤ä®F´JÐ=M.l´w~ÖZ)ý7_,;ÆN/µÿqµ0=Mk7I[ÒK{ËzÃi8ø_¨mm¬2õg°u=MXC*ÓÏ½øc,­wýýÉ©Ú·ª^/õAM´t¸lè¾óD^´W5#J'gævÑì"óÆ]4ëÁgüOÐZÐ®ª¸©æ±FÇï¦7>
ÉdI¿Úý o5È5êîCë=}4¸qdo3Ñ57è/÷M{Qv"Ñf¦ôä"¡·ëí3æAg¸EøTsg¾;gr·fºÇâñsÊ+Á«
ëa¢Î*¦Wìgñ{¿K7ø¨/öõ{³ÅÈãÇazXÓôCãÎÚ.·JiÅ6#õDXeªÅßþ®9DÚa¼-=M]=}§1Û+ÓýQ}\[¯g¦ó}o³âtFÄxïUùí³kóÚ£K¡Ë¼âGåÊi Üº[lôóý7|«¬ò­²¥ôV~Ä@Ü¸?¿ò&¶ã<Y=M $OkA?¿²G´BB Õ}à7fÒB#ßçáwÃTBrgö*Ov,+9Û±,vI{c]4E{"¨ÿ"À|ÍUw	_Àûh'=}gZiMH6ùåå LÁZcËÏÎ°©¦£þSÝ?x60»²­«3úg/]Þc4£Ö¸éPçMi?u2Rwýå«h®à¤M/B=MîñU+FËU,'Nö'eÅ÷ö R6ìJßÍ×]¸,Vhx­¬<*XQsÅ®¼¤Zµ+q¤Z~b?8·ãØZôë¼ÆÞUâjØû7ùú³tþÕÞÇ½XbÈ°v×|3õßõ?öéõ6©ºÆ®ÀMìt8äR»åbBëK6Ðµ6ÝÇû9Õ=}ÏÉ"{úqp	Yå¬s!,³ä>e+ÝÐ+¼V¥6È÷¶ñúè)²òJCs)t	!ÕHÕ±SS3¬òÁÎïÑêÞÍµãtZ½T5ÌÃ5î±^x5&¯[Jý8"]eQÈCZ- ¶kBÐÍ<= ¥ß	ÙÚüVhá	Pf½*?=}¥'±#J7yJQ¦Äù 
ç7'ÂÔCÀÂãÀÜ5È§){=MÂÞ$ÖHåTSÚýø"|L4ëwé[ó(Ûä­X#Bí5éñÚ	CF;Xc±+DÝºóJÒ¤üATY²W¥f"ï:,Á êv8údÐ4®ò¸©= c¦MéÍç×ñË°xZîÑ!8Y>ÀèÍTþ&ÞÑÐtº-øÕ:ý5ý;äùì¬"Õ"ýS».ø k&1øûÖc<"³lÌÙÂû¹gÄô"_=}±üIÑ¹vH}¬ºhû07äÕp¨nSØ:U/Z]RÁï¢'þöÓ+VÙfïK: d>¨dNú¤³Ì« uó»;û¶öú®ÑÏô¯¯q±aë&Tý¼{O¾×ééÑ¯ë&[ÉY§< <PPPPP9éém|òts<Aäøùrzzzúr¬-S®ºÁÂeª]ªSñ7Dm@3ic±«KpX¦e{£âþ¯Yy×?Ê¢NâÉ=Mï6åGYÙr§G&S¿ÒO}ÎU¡¸æGXWÝêg%ù´HáÒþþ)j= éP«>qø-WN¨«:5ì{ëÊèÍ÷í·p°¢ñ>rxÔU÷ oÞ¹ûÇOµÂÅcÅ¯9BÔABåXy»«î.¨z¦Z]Z¸Ð0÷ú½kC8]$=}!mpÀßK'Ég2 _1Ñ¸é÷øV=}+ïVK_iÜgÏ\ì3sfX­g=}l®o
æÃß¨cqr=M|eUpË
Öp{<ueº·hþ¤T% Ì¬N×¹4,5½=MýË|OCà~@¢¶qInÚ8×BLTûØ®pÏýúe+ÁZÝ£NàXÕíÅ FÅ@£l?¿aÚ8å3cå[3Ï&S7S±ÞØ¾;îJáÂý0¤ýÃÛ8GáöxK;Ôº}lê%23­³ÕøãÈy"Æ¦ÁSX!Òq»wÄg«svÍ$Jó±¾½Àz$e¸zX= Õ}Y;úËö±hF%D¸î}lêøÎ|×gYc¹èçQ~
5DÄP±\´Õ·ëJpëÕéÀ¢Ð#××b¾Íh ê2Uk4UÃY]ÓßôiË¯qÁ¿xÙÏbûuqÒ|^"|[lËÐèfÃî«ºÅ&ýhqn@ù=} e=}?é.Åámi´qåZ4= J¥fµåyé¡úNªEzg@©ÈÉ4ÖÁ%·_¹rmª('ÇÓsL;[JÓ6ÃpJ¸»x[m}*þÝ}êµØË÷!Ó	WW8%u%oÅà*P$à±hÌ~' ÷õÒdHiCÅ¼ò ³u= ºrhp¶rDPW>ÄPWöÔvV**¿©:î×üªG×äs±T·Öìv }²ÓÇ¡þ8²uÂøeëà7çVH1Q~ãaY^°¦t¡Ì%0Cq2ÞO°?(ë÷õ¶öÖÕÿMSFÂ'®ÞéúSñ¦Wb8Ö»yà0e8±¾É\.:®O´$bæ22Âb^i æÚ;ÖcCJÍ^Ï}÷xä	.ø!éõÒð+eüU° rRãO_À0Óc;xíÈ%ÎB!­9}Df07]qÏÍªyÀto»A34N¥ê½çÓ²ä"TÑ_5ÏN#i#ÒcR|M*2ø#
¬Ë"ReòÓ½ÉQ¸î7³fhX:}Gá2öy¼öBîT½9p¤;¡N=M!ðÍÉÁ-õ5ªõUKÿy¸îËxs[³uû ì$Ot(ù9Xåê5ù©²¸7¤Ò8É¨Ý'>ÊeÂVò½ò½ñ=}_ñÊÆ'öp{²~ÎïJ¼ªõ½£ÑTÎ|fÖ|6²5JÀÉbíRòXqéIP*[h0Ú[Y.cö§´u(2­u&J­µE_ààJ	½#çIÌ¸äÏËð/ÖÔp^ÂÌÇÅîbYÑ7ßÀÓª*TÑtÿ¯'íIv¢HÑ¿VXöL.ÕºÅÂBvÀ¶:îÒE×³ÓÑå%ÉåB]3ÌnÀjh4:Ø¹­_ª%C¿_gx,~¤Úò½ÓßM1¢.&Ô¶¿÷qéLe²8ëËY:¼×:]Ù®¹!1b®þ/úSzjÈì²lgÎë®å¼!5úÔü<blúð¼±Ûzüû¼çl=}¯ÄPÎL ê =}áëÉFïBÿò0IÔ$}¿ýt±K4ñ£ÔNÀ	å"±×= Æl	l]	õEa#ïpyëZO©B!!³¥×¦¥ÙZé§ívåTX= ð&íë×RÌÏ¾¡¶¹=MúNy¶.ëË´¤jk90é¼*×9(©è
ÔÊß?$GnVÚûø5rá^¤âÈÓ®s­¤ìg|séÑÿÞ'<+~³érÕm»ûTòTÍyáÀ¤P,ÔüMQ Dú¿ô~"j¼IãÓÊ+*Å&bZ96\ØÏ#´¦3ÖqY-¼ mgÆáâÍ6¬Iäi wfoBê°Õ{Wy"ø÷+áÖÂ]=} ýfÞtí°¼8¸[=M¼
Ûø»ìtJÇ{RÌV@&Ï?/Vª¼F;µûÝhö+U¸\üófÓë¹ðårDgeÒyÛyòcü/¿ýWKéá ¦qÒTI§OS ·OÅ±sNÔåPô{]Ú,¢ÏrÇû5>.WVÿdÒX\q»þíÎìØ$¡ý1ú;³ä Ó	ÅP9¸ èüÛJóa«gNYtãÊ¯µµi÷@¬§ünØß&ßþ)¢y½±çdÔ·âHÀ½á§}FUË°x|8aSþ#
RÐÉÜSS°áÖT O£}ðBl¼©TRLF6.¿ªRwÑ!ÂHK»1ÂNeûÿgË(DGUÓB"BtFôb{âWÚ»h-EálA!Ü=}zé¹íÙXy}ÿoëØ= ø¾ä¡oNMh×bÀÆ²k÷u÷ô£1õf§í:Ù¾9¸oñûcuß
45p?¸Çåg3¶SrÎl¨åÃ}¡dHI%RÊôÆHEÂ'=MÑÈKóP2pî.%Å/ÂqõÙUGîB?ïÅëùZz+9xLSg§ÛáRS3¹M¯5¹û~B¡0>Ò,\­_N³®Ù²­?yÊ¶Lîýq ¶]¡,'\R¥ONyâýN7¶=MéåøÐîe¸\*Ñ¹V	U^ëæª$qG½Èì pIºcBMóyÍ$!£Bñd9#]o¬ô·Hw%åù ÒÝV*â¶ÿÒvÝ¬ôã©ô¿Qc>Û¥ô·H=M÷=MsªöÙÌê2Ìâ}Â³$þeãåë+ª«ùI«9Z^{m\vÒXàrÁùG¢ÙÚ¯/²yÕ/²yµï¯o®¹+QBÜé
äÿõâö×u5c<¼·_³ì£?u'ÇxBµ0Kã;=M±SÆ½¸¯pþíô	V£KwÆ©zÑzù"ßÃ-Å"pÕ'¯wÝÄ8¬\@ªæ9ªÇÄîy"ªV$7°ÁN*1+­^AÝÑ3-%¯y¤âñ[D¤[íÀÌ2É½ô÷49þë^]øëÏîO].iR%Å(À}Ø}D(Æ_>bÆA=}õÞ»«d÷çãïßCA,8ø/÷:¿Æ¬OôÚxWÁ:+¯p+Ìô¦Ûíþ~&5m§sã¼ÑÂÛLÿ§"Áq¥P¼®.£¦ÀôâPÕÍ{,h¹ #­*Ìî?{kµðC%VH@¶<<ÐG,.rm¦ÎÈõì-°xyöÕÃ°#Jnâ­PÑ8ù-í,Â£õ¤¡Y¨Ez]´7£·Æj¡}ä·î/ç'¦
vY»påNñÁ
¿4/P÷ðúJoé|Íi½íæHbbÀ=MÙ«åöÙzÑ²È'Ý+òc÷#N#Þgu'= ÅåBòG½&JWæbLî>À×:ÇÕÏÚ¡æ©UxLÒçÆkxJèÁ_H'òÌ@,è¦Ç1}dÛPGè\GÆ$§Mrjë×ÿuèT:3Í¡øFW$QlÎ¹îóé­õ®)00ÇvÖCyz4
×#É@ö	Z{,óÞ°éôÌÿh¹Ë:¢Q/b6´= i¯ÐA°·Ø\pó\³ÎB
ê'þÎFÄÓïPvÆ@jÞ¹µoÚà!Üù¡Ç5X]Ø	ýëæ7G'Nc3QìOgZï2 -°ÒÖC= ÐÖÅmi& 7Ï½ä5ÎIê@Â.M¸îPýMg¦|åNt"Íåés±o\Ì3-q¥jã]á¶dä)]GéËéÖ0MòiÅ¿sä(MbËÄ¿ó$. 7¬ÿD4Co<yN® HCï;CïÅæEÍÊÈÈ+\îS*ªdá:U=Mù«= cÄÓÑ	=M=MÙÁ
õ_«ðÍìÅóïËÜ¤Û¯,Ùüüt¶èÈmi:9O¹Æ(¶57OõGùª0Ïä·hI:õßç¸pb¶ðÛiT£ïB¢Ø»lcè¬VÙçTgöù²Ç|@õebÏ_ôz°¬þ8ôO|°Löä*¡yãÆ²G»ùlzÇ}³U[n+Í|á½ä^
&cO.ùª«bºd=}®Á^¡y!ÀEFØBxsjêåkWY¿ûß ÈaÖ¸~ãNEÄÅ¾tN= Ö:(Ï­ÈÄ¥M¶ÉàOÉàû¡~&G qW¡öô{@¦vöÀQ5)t¬V´Ww[ã^'5x­p!¿:17ó2ÌÆ÷rd_ÑÌ.ÑI±r¬ÂÄ¥oÉº!zLp"â{§?û²½Þ Öe½ï!Æ[Ô¢\§ýÿ*ÈKGÍå§äyç;)ÂûRÒgbu%  ×ÐÄcd<= 7}FºwÔ ¢| ¿@u"RçÈãÒ?÷u£Á·qÇÚéÖ¹¿31ÌþÙêqFõh´íÃÌÁã¹'h",×HM0môTÃ!éõÏÌ°Ø"Ï=}ëOäýê+×àß<Nûå3?yPNY Òeå¸vXÃß³Úâ)ßu)yè³,±ì'-Ò²H²$zPñMÙºOölpÐÙÔý£ßÛ ,ÁFÝ!<¥ÔØË-<t*ou÷(g[Q(êW¢Q{;È,$ª(9ª;tüÏ1õ@Ñéû
!ÈVrÀÀqº÷¦/ I[ÒÇß7ÁâÌ}t2c©¾õ2ÊÈí6Ú­îØ7ßbü¶æ7Æâ/* BGÞ¦r¥²ìêï­$Ï	#ÞI¡?Q©ùgUMÓQ½2RhdÕ	^ukT 7@¥õÄÔlÆI9t\¡òhÉ s«©PD±©'ÊÅîÿia}ÑÝo{ô ¾@QæÙ¦mó=}Zp,Èéª·v)&pËN³UØËÀÃû@Û¯Ìñý[VÃ7=Mî?Q^u<lÛCÛXá[Bú9=M-d{Îó]ßè°á&-= i¼5Ð£^(So}Á!°ÓÔø/Xý¿·1¹ÔV¯ÔË4ålpÜÝµøDTUEÜtB«×ÜÊ<Ú¥ÚÆÑûâ)¡RTÅu\ÙÃÞà/!2{VÈqp³Ëô_}ÍÁØ;cßÍÛ3	E¨/°áf*Ëè$¤'ÓÍþ¯±>:¸eÌ¾ý¼5ø#÷°Â->a&î\÷	dø-âZ3 ÿû?âBÏAÖàÏzAÚºdIòu?èÍ;Æéf&W§êô|¤hB[<Ð'Ó¨d{úÜ|Åò±è(­¾×#àU (M'©A®AéÚs-= = #Êb(O
Î
K?Q mÑÒhK7jÇ¨~ÛÈÜH_o|"ýTòºBÍ@´ecÖeîD¼ÅÄ&_y±«_TþªÁ®ï°¢ßðilÊNñq|Ò(ä5oêyg6*ç7p¡;	ao8¾@m»]Ê~1ïªmè$W ¦ý1®	Îp¶uº¸aL½Q-íìy×JéBKÔ¸Ï=}/ÛàRã¿hVú¿DåQò_´~ßÝ$î«EdÐ+»½º]ÏÀUOÊ¨~}PÞqvåEwüîTÄ£&ÓÊÓ3l;@ÓGúþ Á¨ô}?e«vzüWth°îfjoD/ËJÂ¥&¹;ã¹mn½a6»ÉT
å0ßÄ6£ = ª!;ÖÝÀ~¥þ	m_P½+´«4VÛ(dÍhÉ.¦à£7	÷~Ýµ½ã¾d)í'óÁC= ¬cîE¦Àå_ÿÀ8klB],5¢-r(Ëëçn±«=}éÑÚæ7ñµ÷o­Ï:è~µ{½~â"A=}%Ñ£#À8s«/.PÛ3ÂD´~V,¿ÙÛä;	i~TGW§§XÒ^¬¿çe!qÈ]òwâ= sxB@­õ=}qãî§ éçÕ¹ xI)=MYuÁbuWz§?z= î?
ÆH&k»=}=MÖ%/ZêCíqµök+¾ö9kYTåµ?{FÃåpIÍ,ÆÏjÌg÷*´àá"
!iu1×!­®áa_ðí-cA)cEP;kË[Ýß®bö«Ù¡U&Öÿ(G1ØhÂtáo= Jt/é+k'%)ª$_}7ÔÂ©L°H#u&¿µvÃgMÞ¯au)Àhuª:_ ©kW]²Þw5öV= m2g òôÜ ÇNî7ZH= ø/7&zk,Ë¾-.¨n^~ô= Dºli×Q¾gV2VB+VM5]as ão:1ÕÀQ)gOgz±9¢ (DõA<ÀIS³}ì;Ãj#9ÿ¬rá9ÍÓC9ÍÊë
ÍÃH¦õ7¡\/ØuÓo<çy½ªT#ezz^×ÜHzîºæ{þÜ£ô;|þ¹·¼èìùÏ°pc¦Ä.ùâs©ìñºõ)ÈY$Ý@ý7j¹ dlÝÎZU×aé<{§øx%¬4)Cüþ¿(1)­>Çè,­7Z1¢¤H¹kÂúiÀÏ¸n,{5ú£[ñÁÞqÄ/ÿ×é¿{r£uêì>ü/-ºµjk´­aç¶÷9¦Ê!ÖjFÓéÕï¯&8¸S'K[ZQKÄóM·;öRº°5ð±gñhú%¤Ùqã æ6µ§¡ÿGý	KüÕc;n¦$yÍ>¢àq.ó9çÅL.ÒUØà×d	¯©ÅrYî\qÁ²[ÿ/WÜ5gEÚ¨¾æoÁ<¥SPgè<ä5Àîa,hÝðÁlä¿ÿNMÿ&þ]!]"Ù>Õå<ë´±Ö>Î&ýw©ãdÙ®7F9:£ÏyAÍ²¢=M³SJBa#Ãòk°>VÐr» « ß¼½Õ®p²	á"óM)8v5ÊÊÙ4çè½<Æ)kÚÙHåxÜ¦G]!Ý,OF¨ó1{í^ý¿Á\n6ËízWeMÃ«= 1ºôz«³]ï]½ÒÄòâÉ~¬+Et&ÕëC»´§bþGkV(uZ:h>3°BÿÔ^Õ¸?ÞNÇ­$Ý¢[urÐ4È¿-~,·èx=M"½ç¼w»zÎjmn{* Ó·à×±c¨W©no1eïÂÀùÃ.Q'\i&XÂþªP.U­ w{"Ô|h.Û/«u·ÆKnñÕßG_õË£/Î´-aåEL^_yÀö+ª1´(âS¯F'Ã÷Ùbcèð
­´gËUY1ûhÔ%|É+»\1iµÝBic÷^>¼{ÀÆoM´>ªÒÏ'lCòOU¸Ö;gGM¿¾)Ò_¢í=  6º/MZËÚÞÅuÃqõKÏùVÞJÍgíþ£ÝÖ±$h±/&Ä:<½ÒyÂ¢1A¹4ºÂiebd¤[bÖÃ¥Ñ'û¾a%Ó$&Ó}­ý'°J%ÓEô±/¹ý!ê8>UZeÍ)!D$&St-ù¹DeWRE´1®sÞÁ½G!=}ÞE-ùõ®/©±}"ÞX&»ÕèRbÁra¬O«©ïjbzv"Sé^ÛêuÖîËà8Z&û¨)B¬ìÚ{$¡éé¶ÉNÏã3dRåÛÁKM+r°£¿f µhòÁ	C*RFX½f>" \	{°?ÌfEô1fË/·l¡}­}8%S$&k+-©ü:gÒZ±!Q_­6Åk+oË³Eò#Á_²+oªYrqÃqPÂ·{JòmÇFwXU*rÎaÔÄ¨»=}Âub ¬2¢*Å»Ôá®Û#ÓiYbeÙ¼%kçMûlÇõ¨eõN´AI;sleø¤R¤ÑÙôåëZ´ÁVðÈ¢þ¹]ÖÃå2Yó»û¾ÚfíÙ:
3Dû8;]üï´37®B!Ís¨ÒFÚ¢ ã+v¼£<ý6@®ËÄgþ2»ß£oªmj½=M'ª~Þ¦sü0/¯í"H±ª"Î=}U{Ç×Ì»o'ÂÄíE¢_þy½Gm+¯aÏKe×aÒôå·Ì,eÌ,¡{*ÚGp÷Ô²X%Zå8=MÊ1ÎZ½%wûV"^fÿ.hµ­ÄóoZÜå8­;¥Þ@>D
ÍQ¾]n1ú¦ö¬2û÷ú½xâª´ÙßBoïðC.¤8dTf£ËÄê¨¾È8å¿öª´Õ:tó¤ø-¿s#42R|?|jýÈñJZÛgë7P¹|C%/§z!ÐË:Ès¶TÚÕH´qVm#.îBÿäÕ?±bwÃò»õ@Fà­ZëÒJR@±RïSòðD3,ODo[^ÑºøcE¸eøoÔÈisMÏTm= ¬bðÖópê%8ï7B^%ÚÕ?k^qÄ>ÂÆ<#>ê¦¤MÁ$·8YI³¡¾ìæ9 %¿âoéÃéºhßGVqop£·2£YRng?òaG¦%¦{"?tn¨ëÌ@×/ô=Mqå< A@6GÐÑ©j{'RGè_è(}} C$#S#?³­ózç 6$N-ÎNH	ÇÎllÎ?M#\Zòó^»}JèpS½A&;@FÕì*x?G3=}SÞÚ©³®ùHÝk³*2NáÙ&G«D×Ê{µO² æfØ¢3@ÕÕÊ4fM
Pg-Yè;YWkÕå:"mÆôí\2xä8NUB?2°îpÑd'£k"eÜ£ðLíH­ Ä|¾T=}3kÜ´Zþy§¥ JÿÕY§½kÕúc9¦@=Mç|õÒ= Ö6= Z¿¬Ðè7RùùË Ä*§ÖékXKúã&77?ÕsãÖíÀ¸oÖúw;øNô\d±þûÈ¼ «×QðäEFpAâ:¾@ÉðQ[óÜ§7?_ª£õßðíúRi¤£ËyåÈÂöØCÛw¢õ¼²6T/ÿÍTM2ÈAÌ.E)n	Z)= åézdô:ëô¡«E|%, (txjW»ëWóîkÑt*,<c¢0WÛyõ·s2wò_|5pM'ñ9rUc8]©¬\XC|ä£Dh;{ÿà	¼Tcg.lzau¡z×hH×ERRÀ¦¶8W®´³ärÈ:Õ|±"èÌ½ÊÒø:m ï:,#¡á¤cªàf÷¿ L1$lÎ æâ! @õ©x¡¹u?øq[áMoºøã½ E¬Æ<,éW¬hd	i;\ÝOÒ"Ã?ÍÞê®tUJut=M =Mm£9if!ë¶2Í#xùØs(¡²VÄhó%Zf¹5½­¤Þ0úh}LØß{üßêÌC=}R*[eÁCK;lÂiÙ¦Ü¹¾H´?¼²pßOY|0·(Í@R^qý\-ðu|¾\ÐÙÄ£ãÚÙð&PI,Û{¡ã¨Mo.c{¡Îgb\]Qæ¹gâõDqezz§+ÆÛë5@/WóÔB;Ï«nDè\5jb<jP8=M/h¼qÉþd¥´B»!ß	K%fMáA
X-Ï%Û">òTáK7¡âzéZ2=}+»÷·g!HS_\5ØÇæÈæGÏzrÛÈc4,,Ævvjþ¡6¤Îþ,é7)ûàéæx5Ñì[sÖ=MþûOåWº@ºÚ"Öl[I²YûTü¨ºA@äevJÛßÃ·°7+x:$I?âªù(N«qÅÇFèþ¸qF>¸p|ÛCµäB_È77dö5ä9!ßê¹/@r>F=Mî¢ÛÁÅA_¼åøï)³-GÔk¤éäºeKËTÌ0þ®ùósÏÅÞCù9	¨Ôí¹=MÍVRÈzµ"ý{ÿ×TaåfGÂ,Ì9&5ýz_#[y+¾©áÔX²ºá¶¶¼#ûYnAgbüA_M°¢£V0¶&e1}¸,¶­ÇN­Áú$gÈÖ,×%M­¸SÕ1Äý_ÊÎµVo£ D¡ÇFv~ÞIppÇzÀ$Wn8ÝR÷ªHb}ð²)Ìp¤ìeÐYþA6Úw¡a2*+Þ64¯ù5¨°Án}ñÏ/ÿ8|Ñ¬.QïH½ÞÔ¬}3JuRp0BsõE"º
GK»¯OS1·Çºýdeõæf=}{Iø:§ð=}
Õ.§¿¨= ë¯ã= yXº%Fï,²îo]ÿ_vë} méP¿Sä®=}É[o¤¿N¹4-#­;~©F/ÌLqîÕÂú&êÖþº¬åcÕé" ¥Ø¥7®köÜ³ ª£êvf.Qý£!Ê¦nmT.³í$aÙKÎJ¿,6Ðê6øÛI¼t
ÞâYy	¢_=}d$M©}D~¯ìºg÷|Òût
0ujÒ ÿ Öß:ï:Íwc½>¸¢tÀ rþDôú= ÿäh?Pö¹ÈÁ½¥ç_~áúóx\üfÜY¥ZÚôsÒä¨áé¬Ác+%È¨yÚÌ¨-µ¥ê^= µaøëeÜ1ï$w+l³à¶=MÆÐÓÆvi²fy¡ìE¤¸ú9-J¤[$ÒõCÏÑA6äýu= Ia Å9Ðúðt²þY#$"úÛb²2s¤û1*N+ÜÆ+ÜmS@gNzÓ jxçÆTlG§cn+.Àí(ò«Ý¢z^¦½$Fß[Ìµr¹9SbóâA*~= ¥c*8ÕÁ D¶ÌâØRõ·ÞÜYÖçÁdÝ^g=MhèàrÛo8*¬§e-Åc;	L¦©9(N0ù¬«Wêy¡í4×6ì .,nëÈ1+Zhö¯^ÇeHÚò».L¬Å$v{ÄJKï  d0ã©àdAV6¯á>%M©@{ëX°&cE¯Ó%Ïw#r¬¶¿dÿ=M¹F$·]l³,SF&=}ªc$# M$+´b+ÓiK2úik£ î%&¨ªYR¥ýX¾ô®^mæ&ÆÂÅNÉéV§Ô¼0]ãß´ØÍÍ¨sD±¸7^¾	5Çd²¾>Â{Xû£)l@¯$«E¢ÿòiè(ªh)ÓFº)p Fé|5ãçNt_¦Zbä¿@LgtÑzÉíGàÞº¿àvC'bvG&åF 6§+OÇBÀíØV{"VS·T]HËÇ¢¤þ¦¡¤=MÎ[2Üë½nPÓ³4~kvº9Êâ|Ml³.Ìw4¾±Ü¾Ëâ¼[=MÊ¥4>Óì±7= =M9Õ/ÙÞ,2KýBuùJ4½PûÔ'ßî7ÂåøÀEsè2\ß^×÷l¦õl£éÏ¾.»~ýx.5"eÈ>³b­Ë¨ÖÃ>ÏnÎÛ³±vú Æî«
LÔÙ47QQñó·M8±EiRVÉ9¦jP4²¼¿"ÔX¹ùáTêgR²¥ÁYIvªîÙ¦í<yûö®Î ã)Óné:ºúKèèÙ"øÁ²­»óÅÀð>?®+æõÍ«¦³kv+À]@æØÊ
¤BÍBMïÔï%>B¢¯ýUWmS@;ïMÿj<"¡¸[.]"oðÿCw°¿l¼\ßN®½ÿt©Gõ¿®wÙÄ@ÛÔmeÛ9æ=}É½cå¥aÊL*= ÂÃmáÅ±±= ½g7Ýöþèiï>&ôÙZÛLþyGéìNºvo]w.Êÿó<+= (ø¢Ý~^<óV("r¼Ï7°K{ú³Ý"ù¨­ïï°Õ_u<I:ñáýZÝ@F·7	xª¦ÅJæçûd§v@¦BQ/Î?¢^B)É;?2sñ:4´&ÏÕmßÊ¹}à¾×§WÒef½è¸®ØxºÑûsÎìwéÐ
¨@~ÎóHóHÇ¦³äF2â§%0K[V+Y¸/ª*È&/º¦.À<$©¡6+o\#ËÜÉ·_»C·n&[j¢9UÜ­û$³\s5)ß£?9¿y<Ì0rk)gc>xÔ³ÅXÐûâÂÆ}ÈÖHëð¢ùìY-¶vï>Ãµ)dwøØc^/½É½õiþ
Õ*óHþ§´üÞtÛ"l6Ë¤¼YúvØËÕÆX0¼¡78¸­Ô°õ¦ÿÑÁ[~ *	ïßv´Ñm¿h|ßÊ«hÙuoÿþV_gÇ8¾C©UÏpxúDë¬I!oÝiVÀLÆ²R!UÈ-/«sKÍ@£Åj%|¶Ýôª _VÅ¡Öv´*âÈµ*$¾C(òÃjÆ·ý6+×ÏFa§øÃÏáiÂ_¸,/]ðkV,K®So PÍ¶ñKW;Í{·ÿOÁ¨t%´~ì´^E%-»õSRÍoîZ-?ñÅåW£FÒâ4=  Zá|ÞÔfâ9RGKZYÂ5[=}áâ4Ø±üU>êüØ;æOÚÐtÉ§Í= 1K¨zDV-Zà«ô= ¼hçz¼p<PptÊóT$Óí}Û±S)ÒÁ,ß,OçUi6=MVÑ0ÎFZ9!ZF6[(¿EØ9ZQypA=}r=}¨bÎnMdïY¢fÝã ù DDål~ÉÁ_fXåA;ö/h5=MæÝPM!²M¹HÄ¦¯ò =}æ©(!¨ó²¡tà'góñfp°¼Ð;@jsïqåÏZ­=} Ë±rh+kj ±CUDÇÚ®nÙkìt¾C0h¾NªÛ¿©²zNm:cleex}q}Í°~¶òÆÞÃ©¸NµÃuÀáS%CÞ@ÿ¬×ÓÙÂéyÈ;¦ÖaôVÃ[d,8ls1Ø|uVÍaé 9Þ%|'¬g3XÔÐååb@6¿-âÖd\a}Ô?9\
 §@=}~Àrnâ
OÀlu
eGp«bFÐM£¥/N)¬C£JRðÓYÆH³#ô{9°bñÔ{EUMäjør	ÛòÄô óÂþ¤F9(~oëïzí("úL!5çÛµòÙ_@*=}Ãùí°ô= TSÌf°1éJp!(>Éa 
iRÓz¾dÑ÷ \8 Ï.­â6ò!Õuù¡OXÍvúÈÙIf&OÞ+¬!ÀãCÜèë©öÛM#e¶¾ÂK+>Ü3Îé8ÁzH¯ã¶rªîC_ò¿XÄHÓ°û­#^P]@Ï]E= Fþ%]6øÙÎï4ÊIpHB¸ææ½xÇ	ñ7®ÓÃ{jÒ=M&Ó[áüSg2aE4àH{ÞaµXjC@WõèýwV&çÚþ-=d{q«ÿ;ýJtu£q³Ôu¶¼$AÎ¶}ñÇ'5F<èmÈçV#bÄn¡>,j
 ò5ÜÙBÀÞ¢®âMBeÞW**rÅàb32=}Ê¹&ie4gà¢´20ZÅÅá:gÃÊé|¶_\\´rêÝ#tµEËMûuCM±{c·ÛlÆiîÃ-+";Þh®äçò"L¤ÞS5ÅILýÆâÃø=}æLK³Óì~%ã®fÌàó¬,'õó@mCg°wÓÀk¹@FEaY]y¢/¢ddÈ½)Â)f»ðtÉk#ËJ9ÏuÇ¬~ GÆV>gÄèf
=}M§±¯	?9=Mm£6y®ògë"*|ÙÆdþMCÞb C½ËvJ!Úà>¸öÒ²Ð-"µÏ»¦âé¾ï#4R%¢S7çZ±=}Q/»T/4$ä¡}:ê= Ze7nÛ·X¥ å3ü©¼	ª;]9)èló¨t6Ãu£×ùöÓ|ÄÿÏâ'ß*¥Ã)¼Ú»½hÊ:Å Y Ìòn2U¯¿MÒll­z=M9îcúZ¡W@þFnÀ-SK.A¯ßyçYc«Lþ¸ÖÉÐèÇÆ¾W4ß´]Ï¿z÷´Îp.~[ðn½;°iè¢¼7jX|¡g=MJH©um²ÐáõäÛÄÝÌ¯=}-çßÓÒÅl0Ws¾µ%Î¤ÒÒÉy±L¡Ât¢JOh{õë5ô2ÁÉ0¯22:>½.¨ãÕ¸ûm9ÈÒP«¬5°Ñø§+A~;ÜªÍÖØØ«Ã1À¥DûfÍú[zUè@H]	K({×F;-ÈØ+¢¹Óc¾Qs½&rd
@kñïUf@±±Ïø5­EÉ4ÂÇs» VE|pîòM>ëºÇ/¢½QvvU&*§RJYìü7'9Â0¬©t¡¨Ò·ÊGà¦iâLH
ê\÷×AÝ<W°Af\§þÝ5#µ6'&ZÂÄK(Nièù*ðÏ:\{àÑä¬ôMJø<:¶]%!þVgº}-´Ü:5ePå÷
ZUqñ 4 ë	lz_3âß>÷9a×.Xy­ÈµtÞ½÷NõÎrëTÀË&Ë]¿òQuËäòÓXö01?oôUZá!-«2§WÀn¼wÑls,eZS\­ÄÜ àÕ5Ì^o\1IY$ø¤e¥zÿÝ¯DèûíÎOWK%|]=}Fã4×Î£,1! oGë Ç|*àë~Û¤®Wdsä~ônÉ;ÝNÍ8ø}Î3IX\E'GÓ½ÁïúÖÝ[Ó;	ÎØ0 F2Îx_½Ñü ·»Ä±ÑæËÈjé³ww ÒÒÑ;gÃÑïï³«xBJÁèïÐ¨ïnówïcïkï{ïjOa¾Âò= hÆµ~¾@iÜH£T%ÞÑZÉßF´ò;ht(®Q= YÂ¹Üj0t¿Æj±îÒwíÔAû(5G+Ïã­+¨MÀDÔ$ýÕMáÌ«ßÁ¡5ùÆ²´#ÄqAÙJUùån¤ xÂÄE:~÷1~%0ÔêøDKpE7ë<åÃdKüÊôº~ YÒ	ë;Y¹Cl?:d7J¬¿$Cd´zÑW!Òº¯T\ÁêH¯çÄ´ÇfìØ"¿ýô"£à éU¥N)Qî	S9Tk¬ÔßÎ¢þ	ËU½êQäÂMárþ~ü=}!±¡YàÎAÙ ±¾: {«ÎõÊq~ÀÐ7ºM©#4i µ©bWd;dÄg« ÜVûTÙà>P^xtF<Øyd.¶µ¿³ã¡>v¡Ò¨¡Gl .|H'úì¨¾LbjÿånúuEÓ´l<[Íõ³èu¶µ*þtöÖs¬udô)èugP×m´³kôR#yV·ßð!75[²ó$ö­|¿Hê¼8it7'Qyb*«Æ
1ô<Ö<V_ÞEÇO6ühAÄ ÆÑêp§Lì¯Ñþ.R\°óCóðòãaÓÍî= ÕDI·À¬°»Eí(b~YÕU%þà]ZcÝý5j;¤1Ñ8Æ2= ÌPO¤|hMµ«O¶=MSsùµ¤,8Ñy¥ÂG¥Ö«í<Ü5jKÅ{£øYý×ß( ¹ÍL\Y¤´=}Û*ß4Ð-¹ú/§v~ÅÅ&äwúe±b>Â>'üGþI7ºí^T3Ç°ÎUÉ*2£8Æ¾Ôrª8jñÝKk ©D7óÿõ> µä®.è4ä¦¨90±UþÅG5tÞÞÈV¡«ø*9ój9U/B¯ÃGp×g0 rWÃ= ;ÃµKã1bÂ1S;b' >ÚºøwÞ=M^ì>dedözÉ<B0pdw¦×¨À_³¨|¼2XCSÐÛ>sJG[©AZh±ú¯uÍ¸¤N,ì&¢fº9³Ï.x¦Sùwâ7gsÏ{\óPÚûXuýç 	­0	bð"sÂ°Z»°ç»\fx¿õwØìym>»=M¨©ÛÞJòÓãÈ 
ÊlP¿=M*w-g%6^ t«Â
Ö±eï1Yb*¼dÜ/FõN*fÄb5jÛ9= TüK¾Qô2ñÈRÉ|hçn8ÆòJ±Ú$
Åñë>O5v÷º¿×neØúB7q²Ï/E?>¶W<ÜhØûÄø;ð²~æPÇf£ãL]&ÈÛíêÖqÕ$òJ¾:d¾¥²Ú³Kü=}pTJ	«[J>ÒéÜ*wÔàk|zAÒäIÔ«5ñ6 ×_üÇ8[n,I±Ü[Á4?Ç~ï¤íÚ¨$$= tP1j(¤à±.£S8¦ÛìcÞÌ) yä¿ýe[J,µýòpô3¯¥B! ½öP.ÇQ6×(I-ö/ð}WÙ:½pói5Íöõ+Ñ¶$H¬u³ªÚ"%Òx¥{Óæ+U=}£@_¹ý.ú|)LëmqØÝÕ²8:ú~ûò «ºZÎÏº4;S~¾TkÝ¿LéóÞðö<c$=}ÛKl"ßb2¡å&Þ{5©ÖX= MÞI1LÜ¤J(àûþeÕ-«O§f!ëé§¡³áG'pÀ/d²­Ò¬c¸=Myì¦ã	NE{4 àüÍII¨¢jcIYØÇíós"øzGeä+EIñ5;À#ºn xR©ÒRÍ7Â^ËÒ#ÚÀRÚt ø¦7õÛî½´#¸U9#Õ&9æÐVñË9TàUsLÅøéNE»Àô6«Ï9táYÍã~·êd+Ê9"ïØâ9XçVK±»tÇþ%Å ÅËMýMóáÎlï,¤´¥Az¯DÆ±Qetø´]ñr7TËï®¯?ÌJ}ÃøÇ¶£b3¶³B7E_	1ÌrUÜVÌ5ÕJdî¿Ø³=M{~¿wCÍ/÷	3'<L4×GÓ&+:0WB%Éð¡«¼¢åì²_¹ÓÕÁDÊÉÌSÕËÎSviRºD«\I£
&/¸p=MNcîÍKÎÖ =Mãp´âSæÿÌ$r³x|ÎúOÎÚºîÓVØÉRhwÉä·~»@Ïä"+¢fcéåu¹¹Öé ÈÞ¿ë}LgÐÑ:u¯ß²|à÷ñ$PÄ2gÓ_&ÈÈ{ë³ÌzôÏªÉtøIgÓ¨ºõä«¹Yå«Ïá¢ÄuÿÚ#Øé3üÜë°õXÉ´0@èóöis·ª=M*²òÐ= *âi]"PµtêûêÑåÄd(Ç¿j´Ó¾²í¾­3
æXÀ@V_Ðà×®þ	»= ó¤qZîd
Ä-ÚË5g5¯×Aª¯nÅû7Ví¡b"}¦6ÒUk®IÅt¤±TCZwZ¤ËÂêÄàz4/ÒDy¿9z47 kð»®Ëé¬!¯ømgpbíÖgBr!ÈEËðÁÂ¸LD$¨²ñÏà×*ö:¬ÀÇ=MÁ¶Ï§×¿ÎB¸ssOûÐºÛ¡
A¨öØæá{ÄÐ¼³2<=}»­K:ÃX«ïBòg\fÀºÃÓÃ¦#¼Ä¤ºLï«´aâ2Gªùmð ¸s/âyÖbðlü¾»¤p »Ñ~ø 7Õ.¥_ÈïE#Êx·bªVýö_°=  ýæ7Ö@"ÌiúôÂ»Ü°£Yïûo]Ô4oï\mg»¤èF
"&îÖ(rÁÒ£/×Ô®ù= >HÌ6(· ¬3sõ/Ì¨ÑÎÂÕ2hwof8©I¨Äâ
íÂu$J¨Î¤;;Ôäù+E÷.<[ëµ×(»Ú§Ä6}¬Ø~}aAÝõÈZ~Ó4{<ª½p|aÉ(P>MÅ\{Ö+ã=}ùJ*Íi[%L¤*ãß;= ½úEût+bëô~Eì5«^T*.á%ìôªváeAX«éd îM6ª^\MDIz:¤¾øä@C/6 à0å®¶LäØÃMûÊÝ}3?MFÕ¯g­ _ùê-[?i·jß©fEü«LË°Îç'[¹!(	px¿îGwÔµ£¡ðíÑ·¢cHÙkµÐ¾Pîä3£¸¢dXÀî+»QêÞí¨îê;Ñ¼¬ÀfLÏ^Ìa8Iv[Ê4ßé_íIx	GÔ¢À:[«ÑäàÄ5w«õ×è.ÈcXþDÑz!¼ÿbrJã:	ã¹>Kµæ"l1Ë±'¨ÍéàðÖ³
+x,Õ½«D÷ÿ¥Â4ú¼ù8ë»,Ó=M8|AEÎÜÝ4:íBâ,äª®Óê<H7ùRt<"]1¥æ nv7%Ð¶^MY0¡Ê òR5´¯ Na\!>´7õ¾õ0'üÁm1¡¾¼= 5÷»'àöGUN9#àî­:«ºÚ@m/{D?íÃUF@@NRE/4?ÑI/lcaþ­l1É¬b>1GË/üóEîÿ«/:H²í63ª7Ù{4ªÔ¿¾KªãÑ[NWZ#ü?
)Sá=}ÏC#.YR3^Îeù;(
Áu!«br2++s>áo"2ÓËn¾=M¡'¾,r­ÇMÁ¶7ò?t= R|ªÍRKÌo= ©tÀè*µÆc_Ë7Â$*C*ï}¡y Â²#c¨QÍ%ó=}Æ#ÆxQ5a ³tQu­ÇÞª1Û#CÂ7IÌôÝÃRä¢K9øÑSÿéí©@Wä3«¼k9»9 UOÀUË+ò9Ç*9ËøVÍà9°9¢U|þmCõüÿeþu­òp«=Mi«þLUkqÛþí=}¦ çt+y[dû,¸?«ï/«O+¼UÇHUYùÅEÈÿíÆþuèîAräÎÔ»ã«/¦Ç^{/õå®J6îá.JÖBÆ®5þÍ³EBXA4AAö¯L¯?f¢ÁwoL±QèÕüëmkÎwä°10Ü_C|oÐl»1pAäÝQdèûqûºûôÃÓ¤iâw§;Kú24Sæ1ÜKuF{ûsáwËõÐj>Øi.µ½Í|°ÃeväÍgÎ
£Ó½ÏA)HiEðT.ÿ+j3³»·DQ©.G©"ø y¯ÖwUò°mÅ÷BÁè+&Ð$»3{.úk33\1êCI«D°Hét³(²SC¾Ö!Þ }5-!ÍöÓ¸ÐÀÓøÓøÓøÓ¯]³r 
ûÚª»:û= x|9?Vú0ÁU«¨yÂ¤øíuæ ×/¹£üî²	ÌñÚ	L
è_nâù±ã>ifðgbWéÌg·q¿Àh¹^£Õú±ÃìuîÍÉ:Ê¿H<úfÕí¸ï6	%vaïsëUO×³iøS­a+:IAê¦O7úm= ¼ÌR¯ d8²ðõ	j8À·Ùçx!hûÂåÜØÙ¸t= ÅJ§SÝZP§ Ôþ¼ìkYø ò=MU­%7«ÿú&Q;\ ±ìNÉ&ÙÆtjù$gÝãb,nâ=M!j6ìóõÚàè¼G=MHÿD¡(½¯¨	uÍX±:Iùûè¬®g>9Í4  Ô1ßæ^º?{ëG^m"Xò}ó¿êwòÔ;d)ÝØõ5K¸jÕVAå/¸Üx ÅJÉê	¾.
¥Ã= òZ,¥%^áú$r*÷<¥ùÜÞ5§:þm×/¢= 'Nõn5$Ã ¦u?¸©îqùÛ®Ië½µB<l''NÌ!°Õ¿/.ò-úp$è#Uã#äs¼g4Ñ»?ÛÉ<¤£ýÔ1é+ Õ'¹Þ|ÒI-!,²C#ÐÚÓÔÓøÓPøÓøÓúØ¶ráW>Þ=}fa Âvv£F¦ÏÙºKìêô'ññGoÑs¶zëG:Åcç:/çQuÖËTû¸í,°ìn³:eò^r)côm³C+À%#$©áîÉyãíóU	ãPaÏ	CnP'$zÃ¿ÖWÔMI£Aé«ÖéJ¸ä§¨(=M±yá¨T7×'Ið¿Jt¸´6É¿ìEp KJb@6ÊttMÇG[×Ëö³ÒÉ ì*ñßÍP{â#
ÝöKéúàÒßÚµÜú¬Éó^ûô<Öþ.CWãy¢09Z¦âðé·³ÅÿYøKÎÙ2SC{çøõÊÖfÔ÷Ã;ÚàÞ6Z;drPØ[¯;ÍÞ
>\;¯,ZÞâpaP¼.\ýVàâ|m{ÆLÆâeàôáÚ= ðÂÔÙ÷«<HûP$ñd¯÷DsÿjâïÛÍ\HÒküEN«Þ<Åü¦ë|jã£\Ió¨i·¥}@Å7pK~ßø30[sµï¹£z¿VÞ~3éÎÁâî'(Î^ÐJø|ö.í»¸T:î®É°kùVé¶úKu÷WT×³ØÀËÞ&jl14nXä¸ÛPÕRö´Î m;
ìÉþ79å	^E*Ì-«Å¢oË9ãâ»æd}K8fØ1ôÂ¿¶I6 ¿aIâ uH3¬ÐE;nZ¦AA®ó°©ÅD¢¿qùa5¥íI³f½3ó/öUf­?²¨×i;$¦°H}Ê_>Â§bÙnK¢& ñhóE@ÌVHå|fòÝGÁ¤qPu*Èdñq:F6ôÝÍ¦ª¶ùáøÆê¡j¾HpÑÎ{XT3=MnDsh×3×ñÞmdaýeNÞ÷miRwyUIKé6H>µe%k A¢¯!FþØÖ±M¿Ñ=Mø_wm·A@9Ò±.yDæ'j³Ïß=Mæß?HV^ÏÙÍíg{5Yv^ÅÑ¼^mÅ"½uìcÛöÓúÏøÊøÓøÓøSìö}
vñ²:Õõ®Ñ2:ví¦¼èWþü¶Âº¦Ï
àÿKÑç"zÎíòyjw¶.[h¨o= gÃ0¿ÄàÌ¦WéññbMs4bdZs,ô }Ó)ñÍ£ôûS4½ÂO=}þ ¢?= ¿|5ï×ã¥ÖªyióRá¶C±»NÞWû±z$jÎ,RÀ¸6l's¶ðöó&J?ÍÁ!hÔÔì]H¯vÎy~êâtó9ÈÏ~áJ8Ï.ºÑ¡:ZÓøþìÇBÙTýì!$KÑÁÆ¬@Ä\WÎë¦ØÔº5¸þi¨Àë!"ÖýØó¢l³ËEÃÕÏÂº8øÖîÊ8êGù¦Ûky©$
ÔMïÞ°0PYVïÞ¨ÛÚÙç(kÐTõ$r[a5Qß´Rü{ ä¼h	©=Mäº\¢CM?|Å)á=}Ì E{/áê}§"fMë>u	)þÕEs_7ç¸oEV#ùàe¸3ãÜ~ÑÅ*î±û.».Þ_ªeß?6O¯nUi«¿ôE3dÔ\·ÛóN)77 ô¨5ãAâOjInz µHªî¢UOÚÿvRN»R< æìi}£!³C¯Ifã¶aãWDþQ?&îðAÀ¯NL6èüæÄMp'×ÁïÌ>²L¤oîOh _ÔQLÁ.þ±ë¤aügDáX @P-Yéýt]C äÏfCZ ÐR[(ªÄv*çÃÕW[ç¢|+Ld+¶Ö<­háÂysöÎj²dîYSÐÅS<¼ÊñÒK=}EØÒ((UÛ»1~q>äÌ4oxá)v.ZbÙti¸	+éJãbN/SKþ
®/kFBKÌ±ÇÂuYHÂ¬x6Zr%´®ú¿9Ìó¬F	âc(GrqÞè2©qÞ&ØgsQqÿÕ×¯áÔ²Å_IÈ_ÓÎ'úlr1t ¿·à8È¾·j;RµeÍxpàâ´RµXñïÂÃ³Ö(VÄ³b£5ñþNÛ«´D¥zluZl×ô ÕÎ»ËÌ¶úÝþ¿#Cj½êÆ#iwQB½.f@[h7ÖÐ.êCÑ·uñÀ¦x·õ½¦Z>_¹&¶Úcå_w?Ëa§ÕÌ-N~Î¥´bYB©¬µ¸rël1@W=} XNiBCfm´ußø(/9g	As«±èÂxBBÇ±ÛêqWæµBàÒ¬)úÂO³¼²È©HÁÎÓ¦É»ID´¹",éÈ=}êrÞ·i"XØFmìs=MÜl1¹ÄAæbfìQBbBCH÷Ãá£¯¨\²Õ¸Å%(rî¿qb¬ÛG³érNÌ'ÀØGÇôaªnÍ·¾"³pP§7
j'ìª7º+Ë¤]^E)àÒªÎxøÓú|æTÓøÓøÓ
ìÇI»5Èý!ñé8Mþ$1¦ÊûW½òÍ,3#	ö:­­Y6= Ó±'Ö­×¼¤!r= Ô(WIùÙ­ø_»U4OË¥²@ãr¦ýò¥ö|d9Ë3ÎÓjaª^.äÃd|8ü¾¥täY¯CÃµwr»FúÄN"= 5°Àhéù~NÂãÎW ÚNìä©ÙRþé&§Aùjßé0;=}¾û,&:ÈCAj0jYA~¡°¨/siÅ=}þßÖ¡dÙ´ãKdgdz9ø»ù³ ãì:HyòÎÈ¾À]Xä= Ú9b£V+lq¼UÍß®¨Àd»p«úF«3ìYbÐ»ë½Áç»®¬gÛýÃçd»b|cÿ&¹Dlã»ÊZ¶×'5ÿöR÷ðÏDêlÏåPÂì#ì
»ÂYÊ«G»éÕË0Üú?ùBcÁ.ÚO¦U¤E²lILIØáÿG¿àÿDá0ì§L¦0Ì¦;¨'<¥¼¥|§Ü2Ú12h= Nð¦òá4Òa= nÖÆ5÷_ùîcÙö{Q2P¥ÆÚâ¿]ñ-®Oi5¬.ã¦0bÚæúq®~£³
Vdq¼DI-®¦¶Õ¢uÑoqzJÉ2pó¦S¥¢8â ¸bJÿÃÿ

¿ä+ÎÄÕÔÅÕdÙÒtÔlab]meYu1U?Ë[G³µsäáHäâDáaf Fîú±ZJ¸ë¥öÐÃFëêêâT»æ^¸K§TjDÐæÕA{Sê!ÐüÁÖI;M¼¸#­v¸pa3p÷YûP\µÇÃ¦¶®§¶³·R°ö~· ¥V~k¶Ð¹Ö}KJë°ât±çÝY]¦*bnÉøÓ¸øÓøÓøÓø·j	Õ¼ØáDÖ-:ÑäÜüû+úÚÇ)yæ6ªÕêª­ë³÷Byáç~ÙðÖÙÕ÷SÂ6}áhÆ%ËG<-ã¬ö
æ<o¨þ|ò2=M\Ò»ÞÀ¶ ië#Sà{±
&Øééë[ú4[ÏÊ&b¶!ð{Ãå#ÑQöâhciÕRÐßÙÈ¶ªsU0/léF¸ÂëL48µ¢TtOÛÆ©Àt¬ÄíÆ¨ÐÚ"1>Ö©»ÃÉ¾gÃH~XæJÀ	:¤Åfu|DÞÑÃF6Zhz|Ð<w9HagnFz§¸ð/o×Âk(iÒoÜ[Z~_'Jÿhxç<ÁATwì¸gt!í¥ë-/æªÁ¦¶¯iÄèP	ÕYÏ¨ò'/¦ËÂËê1Êö^%´¤àöE¡Ó¬qjßi¨Æåñ¶·Ðt;3uK¡­ì/EÁLäÎËrMyÖ+ãôSÿ±ß3ÅB¤õúu=M·àÂ}ßÃ2$}F5.ºä=}þ1çë¿ÿèb¥,Ü§M8Mû$¨O´q+Ë2s×Ü ÒýDa|#®jÜ­[<;.¡î4~õ-:áÎ¨Añh@ki3ÇíÑmáCeÇßËz:÷ÑÜ+¿|~Ï·£8¾¿ø!·@ B×9Éní(F]¤Õ0óÂØ}Á&ÿÓTV\e$ýÍ}aÜ'âá©iW6¢Uü5¹ø:,vÄaelÞNÔQ>0J.öEÜ»$ÒÇ)0Iã÷"5vðxòÌâè#A|ã²î­Ý=}^=M5!]MøÓÐÓàøÓªsµøÕp´ùÐì;ÛZ¦ô#Ï
=}±3)Þï}EàÕ!Z\d¿ÖQvµM9êãP=Ma[HlÿwÛèiqêQ³hë}sêi§ÀøY¤K98ÙNÐ¢ù¼ÖµÒheùÓ©= Ü³B>ÈRuà"Ð;8öa¡ú3IÔ móë§ú9eöà+òÚËõ¬
Ü 79Ë@ËZçmü üWæ±ÆÄV¼£¸õKUO·StNÕº¸(ï{¨$L}È,È¨,ÕÛu3^+á'@FçöDÿ)ÙE¦çwûª¯¢9ÓÎ'É)p_ìN¬¼l¢
Dñ=Mü¿^ªÂC£wíñÅÏ+h2vKÀäe&ÿb)­2OÁvÝ¥ãÕ&µ=Mví±ß!¥¶@KÞhi;xnÆê'Z8+¶öÚ:pY
:	Ý
4«ácÏP$zU{ çÇ;TGã½Xü°ëª{¹[ÿª*<ÑÂ.ïÎ¨\¿ u<4¥-ûÚÞé)b5L£sC®ù+¨_K>·ØÒNI»=M¹l¸{ÍhQ±|þ7Ä-ÊèõFNù)¾¬v¿êhÜ=}P82ÜÐz$TùS4ð0Ð>«â%öD=MQS®féù·ÌaG ïu¸²ë·FW,à©³Þævù=}¸:GV±Ûëb½@¬=Mº"oKAz.ßâq9I´^6ô èVUÆ¯«rÅs0t{= ãWÿrnî]äáCúye(ÈWwfYóë;¤+èW®üîêK ;Ð¶UÝû¢)®}-%¢ÐøTøèÓZøÓ
·øÓÊØ¤,^ íØT­0#~<Q¥:,#Ð-9à£=M=Mm)+kùMaû*÷ÿ.©ê9Þ_â®µ5ânÕ6©»Ne«Þùv4!BEax-Æl¢.x=}t³%;¿%4@Çz©ôÎe|8$0äGYß05Û?4·D?	O¦vï°î·O¢hFpmo¸§åÑ*µëãüðf[ ²PvoP°¤vQgìÿéVéìºà[ Öaº»¤úÕDì»ë9z¥¢=M?A/3ÎbN·d³=}KÏ±Zfhóvãª°èP~"2¶H=MMzfùr	¹Ð·ÈöÏ£Ü,ô¿Ø:ÞºõÜ»8UÜ@?¸%ìõaÜâñþ§ÊÕÑhÝSEÞöÿqi®=}Ãq¾»¯Ü®ÿë
U'}rë+!:ßÐz!f	ãm},võÕ´NLÎäIa,=}pT»$F% à¤Îº¡@U$9â{5jô«ÀÓ!Ì¤ºáT AÿKÄµþQ¯dì=Mv[¹bD9Ê³Î¸4Æ¸&¢óhù¬Û©¢ò2ÃÜ×g¾)¹LªiÌQÆO%×z¡ù*gLûAJç¢ÃSÞµ´¸Lî["h<Má= [1\Ð@M©çèDéU±²ìµ>9¦Þw¤´Y²b¤_Áû­WJh$Û@¿ýúû°}J¼\ï×0,Ê[NwP®|[ õ6D¶LáÁ^t»g?vÉjÖH=}ä¦¬y±= nw»ÁqÓ
n=}ÿ´ì³F?ÆåNBóçHÆp&äç¥1Ey"¦2£nÂ÷z²ö¥5ÅÑW{<òvû¿kJ*ÛÀC¤ßRÖÏr(*LJÐèq¸u.:;HÍ×t$þÄ×©ÉñZ«Â~Ò|¼N^Q}º¤ê)¦NRAmé¥a@#7@÷5¸#ùOÞLü¡Äjv6çÕú©Tö#Ëµ ×Ýnh(ÑCwÏeè¯É®sõÎ_Îø'öó5ów0à£n"SùYhk¯JÔ,õ>5d±ÕZ\
nw §¸ Ó(9fÒçqD{XnH	éh2C+>°(CúKÙþçctÛùàËùªùIëdÉ$ oZm\ÿæ5l§þ9	¢ÕTL ,×[[Ì=MÂìâ´@(=MÐöÉMãææü6=MºÎ<µý¨ÝlûGaLÉ.T=MT<ÎT{~<Ù¼tð|G<àÉ<ôÐÛï¼æT -I*]aW­Ö¢	×9áèù=}¹,sMO_ei(~æmo¯= ÖI)þáM,¤@84ëÎ .I¨¦}ùecdb?ÍT§.nù:êòÍã­3/à	:ÎÙ*«B|G«à^afãQM»?¦![#AM|?®)aâ°U¼áo£Dpj'voe?²Æ®cðÜQ¡áðv¼«Ñ#ã6§OP=}°d/v¡$N|O8òÝ×A1±= ªqK¬÷»¤ge;Ð0-·¬éË!à(ØØ­Ä.¢Iüxa.§5zéþ BéªJ¾}FöÂXy£_6dè¼qëà 2åÁqBðGëqRÔÏÇÛ£,VRÅzÉâYÌ3ìè¡1ñ®Ò»ã¿cæQMÄÑQÓÙ®Ô·íÇß
kPnòê±ú~z(P;ÓÏÂ¾²p¬øññ£ïðÉw÷Ù ÕÓ+§{ïïîæ­Tz¥NzT(Øv¾¤ÒZÉñè÷ÉïäßÞi°
d~í[Æ%$U¿¹¹óøÓøÓøµøûÀøM\»;À­\D§6þìÙ0!£!íÇd#½Z2ÝE^=},g"ÿ;:å¡ðù2#¾L0aÌN^9W0a½Uµÿ 6WSµ E+^{K¡ _5µ8ß'¦p!Y:DÝ\l]¹q¥ÃÙ->&FC2nÉÙ¥_ bõaEÁ?è¨NkéÊyNØB/C´°í¹!pË¡ÌFØèg[s§É±x?6@èåíª®Ñ©ÃßmÛ±'åÅm!Ä_62/£|æM×«% M§"¢ÐÁuU\££pUð@ÕoU¥Þ.±U1^ôÜ.éç¦debA,YnY:âzn¹7âdQ°×dðxQë¬îNäÍÜp)zTã­C£0×u·Óªu£Y¨Bm6äÙv7d$j¨díM» ¶P»!ñi=}cyg½a?HBo_?20¥¯eE²áþf	\·á]Ü¹¢¯ñL¶®¯f³é'ÃËFÉ÷±_¸1pF²gÿ§qZigw7Äk7ËÃJGºì²ðW>ºùÐÉ-íÊ#«>6ÙW­Þé¼6õz¶¹	³fÖê¶¹º¦r°âñ3vYz¯¢3/éÇFìqV"Ë¥2¹LÆýým"(,GpøÆ= 4B(SEÚm¯DtnÆÎ§0q5ËÆ52Æo"R®ñ1ZËÃâ\RÙ7#ííÐ£ÃÌQ1o®Qî»³ÛtÒAdõqk¤Á«Ò¤¡ïîã¾DZÌô¦Éä³½ Vp*)¥= ©ùáåù[cçPÒ®g08¶Yäáâ¨CoPJhµ¶Zíéûzû¸æôuUññßÿ3×yÓ}®vmßçýsßv¶=MëçL²ªwªI¸ 8_®ºé?Ñ	Î@~s× bÒ:q¶	ý F$= VïÛÀ°°H¹¡üoG÷b¤K£)N¬¨zqrÖfãT= úá"µ=}¾',9þBÖÑ4]L«
{±LÚ!ÂUtàäÅ[)d9ÀÍ[¸*jÏ.éçÃ{S= ué~hØ¹)²= ½9)aøÓü÷ÓÊ÷ÓøÓøÓØ\ëRµ~òiÙï¹32.Ö°Óè"ÛJ=}®8«ç=}lmÊ¢S,¾>Zò_?¢Q÷E0>h'¨-a9L¿û. ¼¦Õ{aiÚµ áQ÷IÃPN§eÕÌ²MÐ¼!þc&<hí2±ÏvBBFÏÒo÷ú´OE¬©^o6Øç­K´®Ã©*vE¸èVöskàãz­Nª21©FEOr^Ã'pÍÅ¯/°hæ¨.gw
qÂ¯wbrñÅµøhâ³rFhâÉ×Srð½²·Pò[Æ ,Rç7óURÙ5ÃföÒ£olR1æÌÌaè«w#LíoþÙ³*p:= YWë«í®Ø«l±æÄDÔuìèsìî YÂ
ZÊH5ÕNm~íw = 6µ±æååcw¢ªñ8öK@ »8æ±üaT®¦Ði¹¿n0÷¬C1Béqp¸öâé£"iéùcxëßo ¢´ZJ1u¾÷"(rxåzîç°²6ÚÊQv=M"H*x¶uÞãrÀªQÚ1wÀÝV8ÜÜøUzãë=}Êºz
É»Äá&Xú\÷övñÞ0Æ 9»ý[$h»XÚÎ°Û~DÌdW®O=M³°2z	Å ââ¡{Kù¨yZd4¨Õ6D=}ÃT±úQj¾]R,Té;£=MmÛ¤ædZ
^·ôhã{Ã!Ùé5ÿGL»({'ÏÄµ,ÒõäÛ¡¬¡T5êä¯ü[3³Pyäûçlósp£¼VG:½ÓYÐõûª·{*­â åb^+d q:;ÁÇ=}ì#V>åò>«Q)Nè:ßúDa>ã<)®f¥aãMH¤ÖÀ&Âjµì ßùû-òÂM®L~ï3©MÇn¡|Ë%³{.Cê«Íl¡ð@94~ÆEbng¢À	55Âæ¿E¨,bEgêNéÂNî5²$äÚEãÑ= NÇ[§ÎIj¹ÉÿUac" I4
ùUÐáXkê|Ë3k-±ýÓZ^ðK&#lgÍ= P/¹°eþúA@HD®F¯Ù¥CYMBìhA6Pæ«fëÞÖ÷JPq+í!]ÊøÓú÷ÓÊØÒnøÓøÓøS°:Ý£>c%>G¬)%m¥$_±:]ÇM¨¢VïMé¾µràà¨à1ü<÷ÊMºÜ¢Ö·a½eØ³ÝÏË&	¸FÍ¨{½Høîb/mc¡?@B®Z@aËL/ÖÐdñR®b<a×á²¥¼z^"¦JB#F/´cgázIn}¬a¶È/"üfA¥BR°é=MïOv8èIJ°­©Yh C¶ØÄ[Z'´é
Á'G¡ÈEAÀÍeråMo~ý¢(ø2¼tåi&f¾}²aqrs6ügÂ­ÉÏÅgVGÀTÆy[¾/ÛgÌGÿé¿ÈÁã¾74ªá«ãÎ7Î4ø¾ÎÉãúd^êªE&[îÖmoczºWº{5WeºDÇï6iíJºdûcR¯ïýu{ æ2*SNüú½¼=M©^ä"#8S8ÙZ­³^ûÔd!O°ÔViS±Suô°§æÄ^CªÄ·é{ÄæðCn¶U§âÓ3+¨éÂIñÏEüãjõ?k|¨C IcéÔuÒÞ^¨J´IYÓmÜu1¨~M¢j¼¹SîhöÕRÒÑæðèÃØP¡êÿ6Sèsõiø~À¼ÍÆàø¸öü'áu¸ï>zk$È¡àÛ+|·WÁ­dåZí>!¤9ÓÌ-UAV
ÍÃ= Ó4+0ÜVÙªoW¶¨¯â>´ò2yóô ¼
O½Äh ðBû}´0y7êÖÎ÷Âþk´ÊäyÿyÆíÂX´Ü Ûõ;oéæþ1Åsû J¬²êZÇUJ"÷z=M¥OâÀ¬ÛY3
=Mõá¢½«äÁ4;úÜ¦=MÕ0ì,Ël¯[p'áG0ÇÐÔ®lax¼ÿZw[þÛ[ç%¼°ìæÑï\õ¼ÇD|+Ú=MÆö|¼Î?6?$MË5ëÈøÓ|øÓÊ½ÓøÓøÓùd	%Æ@'R(ú°'= ï(= 'weÅ|cåwj{|uôoÅúv_Ü^ß¼¡p¢P¡AH¡8¢¶Ø¡ ¤¢ø¡t¢Ä¡Èì¢
<¡î\¢ÇHþ?ExEr0G,pGêPFôF¢'FðhF¬HFæHò8H÷w6ôv¶¾ç±ç­þgÈggåçggÑçÚg³ÀçPgHgÜøç²dgÿtg ¬çõ<çÃ©ð¾ª8®<ðU°Ýõ¯ùº8jÐ7Æ5'7Àg56ç8$Ç75ä86w7(÷8Pç¸NÛ¼¥±.¿®×®Ën}Î®Â®Úôs ïKëÀN@6bÀë 
:= <"ìªªÈ¼©y\ùVôÿ¡GcbáÓC+D«Ä+S!Ä~D&o6abDtRcJÄÜCÉ¢0ÇÊ :ºDzºoÿéÙ9	8I8
y9¶	a·þA» ÁvýÁ{ÿAwþau y¹ø	I÷÷
ü<áUIYqU2íº®4º!t T¹ÑøkÉäkëÀ´kÞÔë¡,ë
ìk¯k|ëï	6m­P©ßøÓóã¦øÓº¹ÒøÓzøÓÙzõ©éóë0ÊépÉ0ëÍK\ø×
YÈ¢Õá×çÈÉpËÒÌÔ+ûjØòÿ+Èz(ÈÏ²ÒÙÊ{$	ëó÷ËóÿøÉ\ù= óídÉð<Ô\²\Ú¹Ò"÷´Ê|{Ò+Üz³XóÉ¥,5ÎòpªìJæÌÊ²üwXÜ<Êý¼Ê½|Ê ÜxxÑ3ÍãÏÚõìNÝW­2Oõ·UñÕâeH±R©ò¹²Sû7Mî×ÏÒ§QH×èiõös¼VóÉ\xÂ(É3ÎÈàoïOÈÖgîGÈÒåwñWHÚæc¢jóíêóëJ©üzÒú¤ökåKÞû
Î?wvÉ§sðá= óæ¤Ê°«Í¬ó^^½²5a	ÞUá·/V©y£xz?É(?Êyªê¦ÎË¬ÒÍQ«âpè!H p/Ê¯¥Jöw¢TpuLòw£ðÉO©gÔçÍ êi¬[vóöó)ù³àuéÒSÀ;åÄkÕÒÝ·«'6¤OÙz:^ØhÉ,Í,T³ï<eaäO!ÏíÂù7£Aùr~« UÜï*Ð® XÈÉÌÍ/ân«eÞRá£õythÌ¿Ts>6ñ. ûÞ=}É_)·= ÚM[àmIb' ¡$=MSàuIàA¿Qï¬d#ÛcL©ÞyÉâ{¡@*Báj2](Þ 'ÌýZ«X}%c/};³}2ó(L+>->¥]Qÿ®¡1Á@0Vå= §m©o±¾²Å_Rm¨W]7Rjðý<nöÄ¼øQ ³¥(R´åÞRmZSÔ¹SKS¶Ý@TwTU ©T ËTÎÃòTAU¯4Uæ³MU/ÕhUnæU{ U:{±UëÂUÄTÕUµèUrüUA_Uâ"V.V:Vì7GV\!Þ -]1"ÝøÓz|ÓøÓøÓøÓøTQ¦ÕçSÂ[l\Î»´¹	®!Ès}èÏ¨s£	ôHHÃÝ¶æÍÛmó4ì3Ï®â	íÛWãÏXõöÝ~ÓÛ7ÊÏµ= (V3î±HÅ ìWGSù_®ÒØåÞ^/JWklÁ¦ûÛaºd¯Æ$áV:ÑdpÜ®¿é|÷Ô ´a]²1råîîB¼ÌkX¶S2=Mðéü^v§S×@æÈÖï·ú{Ñ@ð¬¹1 æ~!ú0hè4D®éY\¤?Ó1¯ÒOÇ/ÇCÍ#Çvïc£Yú1xT]\©îBîÆm×X X ©¥v®ÿâæw#Úé²5æ| îXÙ&§Ó¾ýùkqû H¨õu%lÓ9àÜDî9#ô¼â,(]ðAÙÖ«"ÔMZarZá.»ÄÛýBk×Ú^Ð,uT(Ó¡dÖõYÛ</HÕÆ¢,@f_ÕF£Ú6¯µ°IªavÙe®d³?³³G ÐGk¬ÇöOJA	ôÞ¨x¥v·cõ6jw&XóõF(eak_r4aÆ×^Æí àcá4öõE%Øñ_MÀP)Þì@HG7{¤ í²¯N¿²§õâ6Ë²¢§rÖU¶¬ô$¨=MCÙ!ä¼±ÀÃÂ/1­ÑÄ;0ÆªuÝôëJ
æ	áVö;õ¾<Ò 58^ºýUC&$Ý=}öÓ¸¼øÓ
øÓøÓøûzÏû3):áÒô ®O!îàP¹cÏs1BÀ.Y³Ær ­Q×¹¦	ÛV¶¬pm×[*úéEúºæÄÿv=M+J®.µì±(.îzaBI&wçâènÔ´ÿÈÕÙ*HôoZo8µÕ&âÀxÇûç;²
ÙüÔ0ÇzEÝü0ÖùÒ¬f$=M¥ «ý¼±'äAl4#¢Å|ÚÝÐÖ´µ|6|È9:ÄpT6VSä=MG=M;üñ<=M@+¼ßíìÍ6§{ÿ5·Ö=}»|¼\?PäÜ3Jfñ±üù9´ËiìÓ3kS'Û{¥0ßÊ0~ÚEB*uQ¨Ìz.Z¯5,¯ðe69DåÏÃ9o¨FyÀÝ·:§Y\É¡"yÆ-s²µÜ!èÆ½µÐC´ßÒµµÀj]À+,dîÏ]¼¼X*ÕåªTcU§8ðßë]p»¸>÷«÷hñx>í·?S9ÓÍqÉ:jÙµå½ keÚµÏ(<z¦ÆóQ,Ë:a 4cûUáýMí,ê7Ýê]Cá".MA¡$Ø= 5ãdÈ§§@UQ\'Â¸îAÆãMUV³b°ÿö>*'¦éhi¿'.tp.îi{WîhOÖG¨ä=}U¬qöã3Í~v.¤[2A½¡0çµÜ¹?'$rgRâRÙÆÂ=MZdJ7í5íacUÓÍi88»ÒÐOÅ (×Eðª,tÀ¼=}©E×øÓê¼ËøÓTøÓøßêÓÙµ%Xa	ñ¤²Ô~\w@Nps)ÝUðQ#O=M=}û¥)±ä}I¼)þÙ¾ÕÃ,®çMÑ+*Ü.¹8^æø®qÌ7â nyP<jªNui<h¤I. 5YÀDm»M¦µ<¶áþ°ö9T6ÖF5<ºçÝnðåj·ãòQ¼ºÞ·FPæì¹æ} vµúºªïVÈºàC¬Öu¶¤}[= 4ý°Ï;º¢ù{aâESLãG&¸´Ï
ùOùIäÕVs­>Î¯¢snORðt0.Í£?ÒÕ×«HóðîÒ»ç¡*¹Q÷åït¸ÍPxDþb3Ã"ÈçSÿD89<Ð :BXMüæ$Òz¡[ûêLÞ;ùÄ&ÕïEýz{x§O=M[Ûyûìúª$%6-²Ç ¨[¡Ùâ~Ù<þùêÀYõ©ç6äFYë¦é0ÉXæ,Úp¥ZêôuÙI¿ìÌïhëOx:L¿¾¦Ø<K'´"tÒ7ðd|èIÐ½2°+¤xAûçìX4®ÐMù<ÄÂ,uT>h[_Æ.,P; 3¡´;lNOãò¹þè´AùâãpÌ6Bàâ¶Õ=M:ææ<£Ë,ÙÊå ¿láÂãAþ(Â¾|NcÑ ó¹ß,û;æ ¥¼	b¼Ý|5ê$Ìüe-@öb©°Èâ6=}käO&3õe=}Îu¯ö³¯ñL­¿ði§:ÂO²îY6ëµç=M»IæÃÏù»Lä'VsK±ÂY¨2ÀÝº§mA~Ò/y²µÑn¶®ûç	õË½'Gp@rvuªÄ¦±¼sä]Å«ér*	R5]0
GjÚóÿ¸3×üÒ6Wm$DV:1ãÇÀhê9Z{vÎª[PÙ.úÑøk6OUà­.©Um¡ìX¨µ=}­NþïpI*ivÓá©tP¡Xé.¦Nv(·J%fuÈBúsY8ê ³÷íüè£¿ÓAÁõ?à«´òÅÎÄÅ üÑ:-IÄÄ@ÌV®ô¦,ºV÷é"4ÑCÕOçß2üª5a×þÞºe]Mß°Ò£»yu ¢Å4ìPÉé¸^|õOç4@0|õä5\C|Ú\n/Ùµ3åNÄ]§#~°;á¿4ÞÁ,%>aT¡ùR¾Éª'âw5¸ß=}4«ÿÙ%G?G¯Z®=MH§DpÀf¦îþ5Ó1ãÍ
IÌDã®5äì ¹H¥ô!)DBOëB.ü@f³A~H¶Ç6Fùk~ßöqwp6F¤¨h?)¨ùÊÙ¤¿ûÓ%Ö|åÑÔ)7´ë_[:ì½#¶õLè?FC¨b¬Ï6¯à(9:ébÇI´Y»Lêr[»1a>+¢É\napz.Çâ©øußP~&z¼g&¹n£xm6vÔèöYÅe¸'Á«rÒÛ/PªGÓs@´pê.Î7KÆ_JÌUUÂ»^Ñù}Íc{UTïÛ&ôC©é¸&Wïßõã3QxVGpb8ÄqøNùóÞÉß+¯Wüíb4 Á×®|ðà³©;6SÄ=MU5R%$cXFÿò§øÓà»÷ÓøÓ¹¹Ö¹Ö< &çÈAõc¯tfÏªA)ÁUtBbxFs6gÀzðØÂvù¤é×[yõ$2ÐÛ	¨îôÛwñ¬
ÊÅö¬Æ	ì®VäÒ Uü=}S Ð=}ø" å8a^á+2mDý~ßîOA¡è=M©)âp>n³[ôÉIäêV{Y±= {x»ÂÑÜ²µÆê'oý ÇÞ9yXµË= 6ßÛú= XE(¤oE Ä)ÀG5WÔ£xU4¨£Ðò+8¬ý^%£6¨òe«7¦»¹­è[_/¬'î¸=}_N^¡ýÃ¥~Ç§Å±Eÿs®úÀµõN§ÆîÅWªîî%ä­/N£=Mheq;hpuËÜ9èQð1¥ä>­7lÐð3:¬ßÅ&Ù§»Ý
0¿O.Ï¦¹eóÏfÙ{X&L¶æºiææÕk¼có1Ã[¸ßi Æ5¨Ä/BZª Ëð5720ÃP>Wd<iDn#è·½CN°"ëPNXM°íÐõ¹Y(ÞàváìèÇÂ}S$¢@Tv¦d6gÙÃ¡É¶Ocúç±)·ètÜÖ!»ºè\ÂÑ2ìàðYÊ»¬øc'4MH33m«'Ì·rÍ±s£¤G^Dq6Zhª"	½cGópÅe Ì7\í½ïm°º·1)ïc½3ÔLîÇÇjªSÞÒ¦¬§À£+¢WãÖ&»Ø^ÙKxðfÆ¨
oZ3ó²m¼½!·<ùñ Ò#;¥Ñ>´7¯¡Ô.0ª®¬Må¸}ò_ªÉF<ßiÎØçZPWê-æ¶Zù¹ø18IAÜ>*'¨U5Ò¥ü3~ÏµR4P/óãL~°BeI{ç¦êh.¬wcb÷O|LÇYùÚ¹¦°t-ºÜ¤|sýÍ¯¬dtoÂÑ§2rÈ5DÎ7f¼òÜÕ7&(ã§JuCfbÁBxâ
js!¬ÓcµêóÑöõ­õ£VÓsö?³Ñ Ç¼:§ô	%òÐ¬Zà:¼]H$³uU¿Ý®¼PºpþáD&!ëÅ|CçÝ¢pzm3Öï²§ç$tKöÖ®ù*"©d=}=M}]±$ßä;LAÔDØÃNÙù¨Q&Á ÙÆ×êC[úàÛQo=Mð´l\÷Lcì¼vVG*öi3õJ-ê¨YA¥÷"þÆ5©nMGün,~îÂ-__{4çî~Iì(üìMÙàVJ¹M %Ã¦ýáek±aÏv?§^n	Ú4âúBîå
ª	5÷5A¥BRS³^Ì.øáÎ9Ï·ù§´MRö&É®Ýa»ùeaîY&ºfù6³©ß¯³ApÓT¶¤|°ntg¾ïP¢ÜªF!ylþÆG»ÆÙhkBG¿lÆ	»¶£Äx7ßQK|fÀoS:t°q°ï6Ù@ºÌ<ïQ@ Ë6yËèýã²)»çèA°®æ¶	éápCêÐÏÕ»âÁãIÌi>¸f(Ðæfè»ÜoV¤=}¼9ÑmD$Â.Öy{³hokKG¤=MD´JA$Î×D,D)6¸ì|Èû´[Ì3=MrÔÎ"©øoØÙÃ4owåö_Ë4Ï.j¨§·ná§ brá!òç§®FÃfN¿Bø±½|{ß B+IbâÅ±´¦ÂÑIâhLtKÀ¼6â	Ü|cÄV²32´°×¹2qtí0|Þþ
2Yq]Æ/j¼gá²ÉÖ|æXâGQIÈåJÆÿî¶G$qðuêíÁÏr@Ê·ñR)'Å¾ÃÈÃt*Ääò/t¨ÍÇ³0´f¯È= ~:o¶¹Zud üW¿QÎ¥ÅdZðûó@·îÝ-¬û]Ôæ¿cñJ7v{ïe=MöcG$SõÕ¦FjE?tpÌôêe£RÐPú©}(ÞJù~æú3«¥wNÍuHHëÔmíc±v8àO÷õÍ*Äå¨V1BC~¨5º¬EÒÞÔºóëÿ»ÑP¾ :ä+ÃòMc$OàXÜÏ°bºå¼ÝK±i×Mfß]4öØõÅòêÅ£
Ä'±Õ	üàµ»;»=M£G/"½É8÷SPóÓxÖrÓøRëÓîZÛI-wèí¹i(Ó*Òá¬B(=uÿ1æÙûsÏúPHï= ÊUðî·;HÊÎÛêK<!êó+8KøM÷ö#bÂ*÷±JHÊ6oh!Xÿ
SÐàeäh29ÓçKÂÍ ÔX=MÚ \ÿ:Í
eñd§»XïXß®¢z¹íx áô$ká"UîÀÊP¸újÏYº¶ïéÊ¢KÁy~«Ð(<Çy¹§ë6t/yvpÿ§ì1T3<à¬8èù%<ë{:'júÖ@ÕÇ$»;Å6íFè ä~»å4lÿpYRí¨ÊØÙ5û(fÙ4sÙÖÒò¸zÌÙ¶;
j¬;[±=M>Æ,[~[uâªL<;Gå´4
Òß¬M=Mà_ý¬Äå¼Õ¸1ðÎö¼huJPÅ,=}^=}J´¶ /åæ·]I#n[¥¶«^yÆ)?sMë#À4©vM ¡q%ó>éH&þäñmWº%EV¢¾	¼9cùîMS*@Y\©*0à¦ò,Öþ¹;<^8Ú%[©}k!>@îó¦ÁÚAÜ²®;0bºs1Ãn	maî~Q·î¹R¦ÇY·ò5IQU9à9v)êGÎ¡ÇäîE3ZI¨rÿÀ;d~9Þ¯Ué¡Ym¨düM»ê¯(0mrh½´~Êÿ!çdC¯U®I aoá¦A©i?/#fA¦°å5¶©Ob#æñ¦°Ai~Íw'°)p-foõ@iÑwGì)p@fBqµcw7ZªïµJj gW,ñðÎRgdIjÄ¤#?ª)ë7=Mh³uR°^·¶TæÂY°ånvôçÐ32vÁ©3P_x©Ë¶5xÂµÃN/óeK>Lxß¿o{gn±ÏMtç¸O'ÉJàUlc!V¤¬å@dÂ]ëÚf'¬Gõ¾Ý¾mÞÍFg<toÆÎ¯­ÆöéV¶ªÆSgÐMZ¤÷pV9Òê^y³à«¶Ö¡¼æ¶K2Öé·º¤ÖYãV~o²¤[üLPñV¼LR)¶|Ý´h")Jýzß¢¢µyF¹>8'¶ÛÕ%ÄbIIßÜÆ¥h¨¦Øné[Jâ90²mÈ¡xÛBpç¤ÂÅùJâßÜ±
ç%ynãó"³Ñ= VÒÈçÖÍ¹Û>5Ç}÷'Y;tÍ[ÉñK²ËÌÁB?GðÚ'àªrin¢q2s°×Ö7útòqâqÄ*ÚÓò=Mj*0 xè§:ÒáÙÈ]JÖUÔÈ«³,YkËÀü½	ÆùovMÁü*É÷]i Ø¤R¯½.ªªSa0B¤·UíaÂÕ¦(ßÇò·ÖlPrxEôþÁf(¢3dÔ?òÜvH&çsé'aÏvîÍ:îînµ ]ñSn=}wqB-º
ücë)¯ Íx(aDSÌ®ÁÓ
pøÓøÓÐÓøÓ
TûÞ÷ßê·3{3GëÏMº¢IYÞ±ÊqëHÈxÖZøg ²4É}® e{8<õeöôcÖSÑÎ	¿ªà<Ùs

mìkÈãêÐCXDLöæ«ÅXårÝ^ê+MÛ ÜTXUöÞÚì+kñkÏRo°ã(¹ùÿ	2D(ÛUäÎÀ½¨°*yù5ýÿö4¼ÔÕz.ßQúÁKCp= TV$×æÜíjþÊ§{pÿÈ¸¯Ã¤¯¢Y1¾],¢3åØò= È;ï­ù¿1ÿäLÌ4ÖÐâè¶H{Cµ|íäÅ#[W,=Mn¬_xAÜÿàâä úìÞÈ\êFÏö¬öìèl+3,íÒ{ÿ%ùö5ýÜ¨#)ms*/æ4º=}h!NDe·*^;»,=}Ê-F¡ÕsHá	{>Gì'~|4 ö-
ü£MáM¤£x@iÇ;~«l,ð5µzÌßÑ©a¬ÍÇ¡/z@ùµ/¾üÜ.?D?Y_¾}± ¶ÀQÆ1äE Cc2®Eç°E¨ÙæO%ILD­¿ºÝ¯ÎãÐ+%!;%©§eJïÓ±åâ³?Âd§É{>	.6x®b¿¦§g!·gÑ<?ÎÎaØaÌ/¤Ügái¶k"Óó´´Æ[lûc¶84o­FHIìÊÀÃûp¾)¢ÎÈ2Ó¹ooÞ)È±èÇïÀÏçkGØCÇùpâaBò²;ª#Q±î5øwÞEª\t÷ÀÎÓã¨ëÖW´íÖïu=}º((kî°ÇÐ °ëò}{ ÆÒ*#OVð½7 IÄ*_Ì)»¢i+Nv{æÁ|d°g0i/µYXÏ¶ñp©Æ!hãUîYã~f)ø«5¸ÌâRcß¥I¹ Á0ýÉU:óã¼¦äÈUÂß&ËfíÚodä!PäDO],§_"âÏ¼øÓøÓøÓøÓü[~¥HOÏucOZêåóVÊ"!Oò4uöt]µ@M´]ñ¸
Ü(ùi>o=}Èå¯g?NW§Q;LÏÊeçP?Ê|¦	ªJ.ü­Ånq~¦ B	"/ÊfIØ@ý´aÇQOÂåÇGÐÙÐéÂ¦O\óèÁ\D°ªiÊÕ'zj¢Nâ13QnõMe~ü¢01ëünÕhþg²¨örktnVñfø!²qC¼ngÂfªÿ×£na@w@ªXRSêò5×xÀçj*Øã¨WPÑÌ½ ÒðNwgºçä¿Zòö5ò½³-6 âÒ*'QÕTê½3@ÿñ} XæsøAl&°jj5Ïf³CH¸ÁOYÂâäI3RGw	®©bÔ²3¬vElI×aÎVµîC{{¸§RCÐÖQöCÞc¸?×ÜÓv;øþÏ=MØ­ õÝ¾}|¤Ð9×5â~ûd¤R&zÓXKhÕ9Ï­èëK8ÕIÖO¸h;ê_¬oZ	s;N¤ù|	ÎäýØ;2ÁfT¨ìÙ'[ÒøA<¶lÌà[ã ¼(×Ã&e¶Z}ÂO
 ;«+Ñ?=}ïî., /(5¸SA«­Þ²= ÛÔ,NC§­FU$!ÍE£ëÓÒ|RøÓøÓøÓøÓª¬-Vy­(/l^Á3õÉ'áÇEmÚÊÝÿ®Ì³'1UAí»Ý|o§Asa?Jx¨©<KÏÎåÖ?ì¨a>¯=}Öawn?6¦¹J­a·Z/eIQ®éO¨è©IðÕÜ©VxC¶H´Ù°Æ<t>k¢¸¾ß×'~l¢p1Ãmý©ßº'Z¿ÆAçÁÏås®ÇÆ	Å/©rVÕ_âX¿Ï
ÛgûüGPpa´Rw²òUð_@ì-ª^RË
ïåjÀàdª
ïî(ÑÌÄÐÕÄëFW.TUÊp¶k°E#ð8iQ)3qürÍ¡Þâ#86ÉÕM¨ÞaCz·ñK_ °ñÚj[iRVÑÞÿ°wìiObÎÕ¼ë³nÎ¿bñS3¤vñuÜ·¢îÿY¸wV»#SøÙðê°rSR«÷9Ø@Ï¶·ùþx^¤§B:sQöô¾õ)¤¸9K»eù¾1¸+óÀYa"6¤Z,Gã´½à8.ðÂl´{ÓhGKêøÖq<þ/KæÒäBóR´dzã5²êÀ×®Î×äà+;cqxÿ.¼ä«;*\á¥ÐAØ¬yËðÕÀìØn[z³úðþ×ì,[Rÿ#9æ3­ü*5tJý_@ ÃK'ÙX=}üòóá'·VAª:o¿eäS>ð££º4å (>¼|£6G$Þ²5øÓ¼ÔÐÓøÓøÓøÓªëáænåeº[á//Ü/8hY@Çá£/0¬hÑ=}¾±e¶_¶Â·iÐWOV×çù5HP¶iOËè=}°[Ûß£	'g¡ßög'rwHy8Ém«ßæJ'.2³Zre´gØQGÄ¨ÅÔqWôtöüzB!2¢çý GXÅÙ½¯CÛcqª×ÉÅNÛÂã7Èù5ÿfªR,R3ñßWêÌðeînþîU_ýºîXç|íf_áü#ï71IâQnì=}jT *ñÂ#5qÜåTàØ¿±MvµÁïÊ¤æÂC³¸ùÇfÔCI¨¾6J²Íu~ÉbÖ;3òäxuNÌâáH3Ð{xéìs¸¦â#xS:öqp©jçâSL÷	×}PÖª´= ñ+¤(Wt:ôUôû¾ M¤Á:³ý±àî$+¤Ð¦z¹yK@y§s¶öùÌKÄÕ|¯ý½hªK(ü×Yü@x#¬âYc·;xùe¬QZ'¥U
¾ZÍÛ5¦¿1âDp¼¸Y}ìñ[j¡Ûh[|»P½çÉ ëá!Ë/­×rÝãóñ8È7:%R½ö$%GÄ.9IEåÄ%ct0YJ¥;E5TjÒ=}^^úÌâL£å)è"§ÞöÓøØ[¸4öÓøÓøÓ\[ø;«PÎ!Â4åvq½sjl0ós}=}fð"ÃÊ.µm}R^Ì"÷d4nð¥qEE¯ÃÇån(®¾bl/¦Üyý®ë4aÏ\2VpÁo¦õÖA³°EíeÐDnËÈá³®/¢féüA®Õaäø/´ûdÍõO ðèyEI°¾×©Bèé6çáµAp¶©ÍhÃ V¶î¬°v°m~hs¢B2Sònu~EéÄM­ßð1Ìoå×lþàb¢Úl2£qÅ²aBw+²JÂrßG¦J²
r7*sYjÂèG²q£{q¦qÂü,²¬¦Qù7ägÌÀNaôÕöcÀÝªë°RÓLð×pÀ=Mv*ãÅì78ÿyé½×ÍkÑWfaºQÁÆ°©kßWÜSYZ¿×ë§tW ¿5¥æ*ÏOsã}vZ üQeðëýå Ó°*¯JPuÐà½ H*¹,#¬·!iPoî@°9Ëæ½«C$¸±¹O¢æÆzCfë·QÕ<\·§Tªbé3VGwqîõÎMWu! IßF3ëO(¤bªp3¢uAC·êþ1SpöÕñÒ¿öéðÙ¬jñShøñö­jHS»öi°Gàá©+(XÇ	=MÑ¦=  ì~rd¤u :ñF+h³WÙöm¡= è¸+|V¹
=M@ÎhÃÉK2§ÖQÌ/Q4Õ9>KÄ×èy·FßBàj´LLzk¶²å ¼é;¨YÈ	NÌ¦dPô l¬b YiÕØíÀ C¬¤Z£|eáõ´¥CÓløQ[ôqGPÈ«ìâÄ[°×ù5°~£¬Ñß+¼
D;ù=M¦ïDl¼&%-(!2?z\½Ö;mÈ]æ»6c#».b-S½¦÷T/Ù%UZ½Ù­/_*6ySAtº­¥=Må K>J¤¡Ù»9ïåj>ê+¢	Û5¯~e,>6K$EM=}ûòÓøÒØzXÆøÓøÓøû}Y¬à¸.1Am²{þ}[¢å2çónïw~¦ÂË´ßÄ®'&Gu¾mØ_Ò'Ì£¦_ªì¾A²Ù&r¯m¶lWGÈ)Âoøqfñpï²NðqçLrÔv>²o4= øGX²Ç©§Ê.\²ã97N¨Ê¿×®cÀ«7xªaRÎ7XavÂn¤ãå7¤ËÁ®Àc
ùÕWÀpIéÆÐÆÕëûGW¤7¢Ü ël|ºÖÀ£ëñî´qûÇ°Íë¸(WXÀàLºî*sDR®ö=}o^ Â*GóSÕößÝï)ÛNXåý ;*ûÉOÚàýn 9´*£ZMÕó½ý Ni«AR¦³öÁ_°µIÌÎ¶æÔëCf¢fÛC2äµñ¼ï¶fèêCê+µñZo³fC&Üµ©}CËâßq3¨obIÈ}¢ÖîÒÂb+êÿÇÑXÝ?u¨úPJ7KÐÙæßøàÿà0(Àâ²Ü3öIg0NÐj¨ShøËpÆÎêíS¤¸|Z,Ò[îÃüy¸HÒÖíþv¸TT[[*d¸ô;áU¼ñ~dc¤V:´qâ> ¤ÌÊ:+ ×UM=}dXI¼íÎà+V±Yþ¿= ¤Ø+|UåL+|ØYjïQ°èÞÙKög×)Ì	Í»hÎsKàq´(hïÛKjcÕ©¼	»èÄ²KÓ×±\ýïÑhìK<×é ÏØèçe;è IeþNBÐä½;sf¬²Zó¥óï ¬2»¤üèÀåm¬l ZsìØñ(S¬ÊØYw9ûßJ¬élZSÛEè|1¼OÓÃæ¶âc[¼¥B±g[¤Á0V}á	p½ìõî[äÃ»°²l°J[ZéYþÐ¯ìæX[T¼Yý´ìÈEl "ùk.CpÝ«Y§")E<í×]þãnø#yï#¾É]ç¾4ä")¶.mnØW½üóÑ Óº%ÅFýó
ël {Û(M!Y¦E6xG¦½uWÞù	''w²/ÇA¥odíÍÆ}sXÞzz­w%·3©9?õNs=M·=}^²§¸!J(é@"Ì&ü,(^ô¬´½vfU¯IfBnïf°æL6w_ï½AbjæÊ£¯ÊAWh?V¯ªzBJf<K¶T{o£f²¯Ô8BzfÛ<'­ÜIdþ¦ÁxæÌ¯¥¾jÑK¦ô¢æØíU\#è'©@%½øÓ
<øÓKDÓøÓøÓûà2Æµz®¿¿~â¡§ ò2HÿÑm-Ým§^ 2°cGiqI»ÆuÏmÎÂcâµº§û$2kGG{qÛÆ%m¢à$bÜ<§>Qn?ëaô)¬ÌF·y>º{Sjö·ôc²îÁÊ¿öpxpÂÎsHjÈk·ZR
a½ÃeêÆ&·PQ(ßI,}óòáú8Ý:îVÊfp³í= êû4·LRÜ<óÍA§þeààa£<F*nO7/MÁêåyñ­Â©>p= Çw£**þx5[ÒPù	õÀ*Ð5ñ}= ân£á0*LÃ8SëPÂ£Ù)<S6³QQY}¥ùÍÉ¾Þ2àÌx£6,*V|5«ÛPñøíN±z!h´³4Jê¯uKÃÏ1ìv²ú/@¼Â.è¯³)2IÈvëòÎAòïÏ¿ôò¯cx7Ó©<ö\ùÉB1h»v³w(Iz´v£ÉÎiüv×àÏ~¼ø.è«pÞ>Õ|ÐIØ¶åO¢ÂøXhºL³ÜI_Uû£9«	µ/ðîOÛ@oääq«j69úÏVOùHµmé^6ä§«Nò:öWëQÑþúóNÓÐ(åÎñWOÉ:1	@9èãW¯i©¼þXôîÎ 'dË«¦¸ X9ÂV9ÙUþåëîÏ Ý*då«¿¬:¢êxäúl«å\9W7¢* åÐJÃYìàá»,FYïßaåþ¦µô0Ë­»ÌÂYìèËs	ÌvsìPÏÎÄ= (l¶Ó»ÁºY<Ø+Fì!íì°ÍîìßN»ã0ZÃkéÕ»ÑhYsñwlÙj»ÊøYò$Y<aV¶ó°¯âRlø»r ÙD»ÖLYNü#è=M\>j~þ^¾])~y¹ý¹]å³q=MF¢ ¢Í¶¡Ïö¡>Ö¡¡Ì¢¡)â¡Â¡¾¡²¡Hò¡Ò¡¢yª¢gê¢Ê¢»
¢º¢Nú¢Fgµ¡ö]</Ù¬-#©&ýC!=MpÙ6¹ëûþ~à~¾>þKþ[~	>¾ãN>óFþÿv~b¾ñrþä*~º]Û$_Dß_ôßÄßál_³l¾î|&)­ 5w) øÓøÓêBÐøÓøÓÀì.*¯¦ñÆaôÑ?cî\¨å´= æJÏ4(¦!âáBâÞOÿ'g®À×Ì³õrtqq_9wñ{Ñfþ¦EÃ:Nþ@nPú´åT®nÔUpdé|9Óeïu1C;Fû@L·/úØ§¾Zááûs\Î}½uYAÎ±µPSÑj-@D¤¿êiì9ù?n~ÆåÑ_ywBóÌ2ÀS¥£¸â¸øaºÿãÎ¼Më«¥yäâû°¿6®¯uBy4²¦@aä¿_AÎ²é±fóÃSüÂPæO·¶jò+{OÌÀÖ|åQHo²Mh¶Q °Á¯Æ|âyËÛÉÓôSlñP0<NÖ;Tª»Qä¼SìYcÛ}¯Û[òéúÁè«¶{áíÙÎù±ç=Mª6ºV FÐ	tðÐl°<pÜUÈ÷øé+S«êÿ(Hj8ðÑº6íÞé1¹zÿjTÆ¤fíøÁ
T"#· jÆ¾Ãé=M@@pÉæTûº5ù°êÚFQÐ£vRèi¶0" }|»{§L(*H?ìgPÒÑóÚûñ÷5»SÓµ®øéXiúzÞÚD
*l¸4,ã¸à.ð	µÆßyXc¼S<º*Üë¸4ß´hC2ÐM{T·æÔé8é²Ø®ÛF´½H0Sý°á*Õ®Á¯R=}|§#ie­%Õ h Mù:øÓØøÓD2øÓøÓø«Ù= z	«²DÁY±rV©XÉòAÙOòS¯KÏò>ÇS·òW£QÃr\ÓR«rW»ÒLÛ²F¾Ò=}®2>¦ÁóÐs¢1óÓ±sÙñsQóÀÑsþóß)sisÊéóÃIsµsà	óó9sÅyZÔÒ?¬jY[¼RS\Ú'u(vª(xè§uL§wÆ¨xJhuhhw,hvèurèwÀèv$çx|GuFGvRGxàÇuxÇw,ÇîÌ£²ÒÃrØ³R½SÍzÊd#¹2[É»jÉ&jÊêÉZêÊ(JõÀBÒÏÑÎ?ÒËsÇs+s«sÞksÎësÆKs¶ËsöksZÉ/ZöÆ´²ÔÔ²ús×[s¯Ûsééòü#Ô$wD$®æ}:ª7;cSàÊ@É@Ê­Àµ6DdxHäuàäwjãs	&óD¹¹åfsÔæéP¢©ÃwÎ·RWÍi@ìÏ£éVs±Öóé»d+Êa(å+4?IµÕ¡äLÒKÐ¾ðÊÍégHG:ÊC RólIzrwßÿ¹üÝÉµÎ®ySî$ SÐ 3%·B£Óð4º­ôk.ÏK½öé;HÞ{ 'ÐëÀR9}ó óuáYajÁYÊ= Ó@ókX:]þó~1Vë1W~
dû°óVÊb§ð	¤5ª=} ôÅë×¥ßÊêeÞ·¡]4ÊÕ¢ÿ´Éª¥ö7§Åâ÷ ÁtÊ.¨gôÉJ¥ú¦¸åà·¦Å°;¥è eøªèe¤y06ï(T®»R-´®Ûò:ä.ò9x.¾r./ö;v/n<xÎ!Ì®¦ò(.	Ær/n¼NDÃþWZÔWË>÷(ÈOã Q_ÛAà+_÷tspéÞ2¡2_,Éâ@á²^\ß0áèI¢rÕ¢Må-JN*d=M.&û;ZÍ% f[uî*9.À²<êM78:Ï/À5w~ISýOÛ>óH,½,}LÿÌLsy^JÝ1ßÙ^ÅÌsO1a:äaÉãNùälacE×§îu¡zÕØ22Æ­<rí/MhÍ <¼-	$@R¡Å¬+5¦u¥jU¡¨¥,%ð§e¨YE¦«¤îµ«Bõ¥ÚU¦ÈT«=}ÜÉ=M¥¢Ae¬¹E¡OÅ£¦kªÞ5 Fµ¨Âu¨Êõ¨ÀU HÕªd¦,«Üæ~-6N.<f®76­*Önbn'n"Rn4ªí)Êî;ºî:Úî, M)ÀM30N"ðN8Í-hÍ9ÈÍ#Î&xÍ:XÎ$¤1ä/Ä9Ký/ËýGË #üZÕ¬¤¡äÄ£´	üø÷Fû;½ wüj§úÃ÷j:3Øó¸ñÓ¸NÈúñÓ
SIÀ÷cmHÅVü	Ë9« »À\=MÀ¬Üt[ç´ü4Ûhkú´ÈÐcîåéÚ¥yÖÀùÐÐÙ·fÏðxfÖYOù|ËÙÇÚåótT©9ÎOm	-Bä1¥®$ö³æ[¦8ú©xÙ¹RErû;r#ÀÏ*áiª¯kÄ1mãls¯Sµ1UâxÖì²j2÷ÈÚÕb|Ð©/RFm&è©qÃûÍF¾´FÊm
s©¬ ±ø;Æçö×t²×;vg$ØYk*k$û9Tbê¹Þ Cý#lPíz,r,ë3
(+ú:*3Ó&!ëÎ®}+8õ&³Ý8oTeû2$ÏoãGI0ÕãRQ=Mö#:évÆëíÒ¾&dW¼Þ.tý·é=Mz<5ÖQùvX-Cõ?þõ}8Åz#0³,ØýÁf=M¾1V"÷Sß~o"*§¶Ë= <£6m¾yDñØ±&ÒÜ¢ËåÓñ,Ë¤à½þJdÀh¢ î­Þ®EÅÀ*òÕÒ1[Ìd l_Ñ{9Ç[Z"Ê'Úèa¬¿D/ñ{¤¨ôTýsD¹=Mi@»Îò(ÌNNÏÄ<ðÜ:+í$,ñªã·©yÂ{A{{ø£Ä|§ÁÌä¨ÊØN¤UùÜ'ÍyÞ[²P¨	9	k?"ZáÈ¹{ýagR¯ 0Ùåñt±1N®Ç
å= j<OõE_ å°®±ºªù·Î±ÁLvlËøb{z§BÒFA_¢ÉÙ¼^'Ìé>zTh^:
_lh)¿>^cÂÛ4:¥ï{ìIÑö°ÓÑx×çEW^Z¯0^\yÐohÂÑýÑªzQvIR¹jÃðKp26qµ= T!h :JxiìÅ0ðÑSÏÓBÚuÌ]çovu³Ó	ñû	ÏY§º86Ý3ÁcMÏúç¯ÇID3Dè4è¯öþè|´)Sf¼à[°JÜÔmì
§Xv2ª=Ml[ÉNãxÕx;ggLd7j©ò.Y?åçûJþ:ÎºÚdIÔ±é¤RØéØ³ìý4ï{KeoDéïÇÛàù2ñÇVrq,Î´Hù®Çñ¿SÈßÚñ­ª@òVãéÁ%RÀ rÚº×aºWëkò.ÛÏxÿÏw÷ ²¤Ùsl6AwiZÚÖû'ÐfÊõUl»øáùlNØÙÑ|é&9= 6½.df¯÷(Á<¿½meEI"ºma-§'â¡ÿ_&¾Á½4afotþ~-9¢o_ÆÏ+êè¥ÏÜD±0ç(2ÿÚ°ýIÕ%?r_o±qÖeñûè`});

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

          this._inputLen = this._common.allocateTypedArray(1, Uint32Array);

          this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._channels = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);

          this._errors = this._common.allocateTypedArray(
            1024 * 1024,
            Uint32Array
          );
          this._errorsLength = this._common.allocateTypedArray(1, Int32Array);

          this._decoder = this._common.wasm._create_decoder(
            this._input.ptr,
            this._inputLen.ptr,
            this._outputBufferPtr.ptr,
            this._channels.ptr,
            this._sampleRate.ptr,
            this._samplesDecoded.ptr,
            this._errors.ptr,
            this._errorsLength.ptr
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
      //this._common.wasm._destroy_decoder(this._decoder);
      //this._common.free();
    };

    this._sendSetupHeader = (oggPage, data) => {
      this._input.buf.set(data);
      this._inputLen.buf[0] = data.length;

      this._common.wasm._send_setup(
        this._decoder,
        oggPage.isFirstPage ? 1 : 0,
        oggPage.isLastPage ? 1 : 0,
        Number(oggPage.absoluteGranulePosition)
      );
    };

    this.decodeFrames = (oggPages) => {
      let outputBuffers = [],
        outputSamples = 0,
        errors = [];

      for (let i = 0; i < oggPages.length; i++) {
        const oggPage = oggPages[i];

        if (oggPage.pageSequenceNumber === 0) {
          // id header
          this._sendSetupHeader(oggPage, oggPage.data);
        } else if (oggPage.codecFrames.length) {
          if (this._vorbisSetupInProgress) {
            const header = oggPage.codecFrames[0].header;

            this._sendSetupHeader(oggPage, header.vorbisComments);
            this._sendSetupHeader(oggPage, header.vorbisSetup);
            // init the vorbis dsp after all setup data is sent
            this._common.wasm._init_dsp(this._decoder);

            this._vorbisSetupInProgress = false;
          }

          for (const frame of oggPage.codecFrames) {
            this._input.buf.set(frame.data);
            this._inputLen.buf[0] = frame.data.length;

            this._common.wasm._decode_packets(
              this._decoder,
              oggPage.isFirstPage,
              oggPage.isLastPage,
              Number(oggPage.absoluteGranulePosition)
            );

            const samplesDecoded = this._samplesDecoded.buf[0];

            const channels = [];
            const outputBufferChannels = new Uint32Array(
              this._common.wasm.HEAP,
              this._outputBufferPtr.buf[0],
              255
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
          }
        }
      }

      if (this._errorsLength.buf > 0) {
        for (let i = 0; i < this._errorsLength.buf; i++)
          errors.push(this._common.codeToString(this._errors.buf[i]));
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

    this._MAX_INPUT_SIZE = 65535 * 8;

    this._ready = this._init();

    return this;
  }

  const setDecoderClass = Symbol();

  class OggVorbisDecoder {
    constructor() {
      this._onCodec = (codec) => {
        if (codec !== "vorbis")
          throw new Error(
            "@wasm-audio-decoders/vorbis does not support this codec " + codec
          );
      };

      // instantiate to create static properties
      new WASMAudioDecoderCommon();

      this._init();
      this[setDecoderClass](Decoder);
    }

    _init() {
      this._vorbisInit = false;
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

    async decode(vorbisData) {
      return this._decoder.decodeFrames([
        ...this._codecParser.parseChunk(vorbisData),
      ]);
    }

    async flush() {
      const decoded = this._decoder.decodeFrames([...this._codecParser.flush()]);

      this.reset();
      return decoded;
    }

    async decodeFile(vorbisData) {
      const decoded = this._decoder.decodeFrames([
        ...this._codecParser.parseAll(vorbisData),
      ]);

      this.reset();
      return decoded;
    }
  }

  class DecoderWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "vorbis-decoder", Decoder, EmscriptenWASM);
    }

    async decodeFrames(frames) {
      return this._postToDecoder("decodeFrames", frames);
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
