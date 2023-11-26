(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-vorbis-decoder"] = {}, global.Worker));
})(this, (function (exports, NodeWorker) { 'use strict';

  function WASMAudioDecoderCommon() {
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
                  wasmString,
                ).then((data) => WebAssembly.compile(data));
              } else {
                module = WebAssembly.compile(
                  WASMAudioDecoderCommon.decodeDynString(wasmString),
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
            bitDepth,
          ) {
            let channelData = [],
              i,
              j;

            for (i = 0; i < channelsDecoded; i++) {
              const channel = [];
              for (j = 0; j < input.length; ) channel.push(input[j++][i] || []);
              channelData.push(
                WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded),
              );
            }

            return WASMAudioDecoderCommon.getDecodedAudio(
              errors,
              channelData,
              samplesDecoded,
              sampleRate,
              bitDepth,
            );
          },
        },

        /*
         ******************
         * Compression Code
         ******************
         */

        crc32Table: {
          value: (() => {
            let crc32Table = new Int32Array(256),
              i,
              j,
              c;

            for (i = 0; i < 256; i++) {
              for (c = i << 24, j = 8; j > 0; --j)
                c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
              crc32Table[i] = c;
            }
            return crc32Table;
          })(),
        },

        decodeDynString: {
          value(source) {
            let output = new uint8Array(source.length);
            let offset = parseInt(source.substring(11, 13), 16);
            let offsetReverse = 256 - offset;

            let crcIdx,
              escaped = false,
              byteIndex = 0,
              byte,
              i = 21,
              expectedCrc,
              resultCrc = 0xffffffff;

            for (; i < source.length; i++) {
              byte = source.charCodeAt(i);

              if (byte === 61 && !escaped) {
                escaped = true;
                continue;
              }

              // work around for encoded strings that are UTF escaped
              if (
                byte === 92 && // /
                i < source.length - 5
              ) {
                const secondCharacter = source.charCodeAt(i + 1);

                if (
                  secondCharacter === 117 || // u
                  secondCharacter === 85 //     U
                ) {
                  byte = parseInt(source.substring(i + 2, i + 6), 16);
                  i += 5;
                }
              }

              if (escaped) {
                escaped = false;
                byte -= 64;
              }

              output[byteIndex] =
                byte < offset && byte > 0 ? byte + offsetReverse : byte - offset;

              resultCrc =
                (resultCrc << 8) ^
                WASMAudioDecoderCommon.crc32Table[
                  ((resultCrc >> 24) ^ output[byteIndex++]) & 255
                ];
            }

            // expected crc
            for (crcIdx = 0; crcIdx <= 8; crcIdx += 2)
              expectedCrc |=
                parseInt(source.substring(13 + crcIdx, 15 + crcIdx), 16) <<
                (crcIdx * 4);

            if (expectedCrc !== resultCrc)
              throw new Error("WASM string decode failed crc32 validation");

            return output.subarray(0, byteIndex);
          },
        },

        inflateDynEncodeString: {
          value(source) {
            source = WASMAudioDecoderCommon.decodeDynString(source);

            return new Promise((resolve) => {
              // prettier-ignore
              const puffString = String.raw`dynEncode0114db91da9bu*ttt$#U¤¤U¤¤3yzzss|yusvuyÚ&4<054<,5T44^T44<(6U~J(44< ~A544U~6J0444545 444J0444J,4U4UÒ7U454U4Z4U4U^/6545T4T44BU~64CU~O4U54U~5 U5T4B4Z!4U~5U5U5T4U~6U4ZTU5U5T44~4O4U2ZTU5T44Z!4B6T44U~64B6U~O44U~4O4U~54U~5 44~C4~54U~5 44~5454U4B6Ub!444~UO4U~5 U54U4ZTU#44U$464<4~B6^4<444~U~B4U~54U544~544~U5 µUä#UJUè#5TT4U0ZTTUX5U5T4T4Uà#~4OU4U $~C4~54U~5 T44$6U\!TTT4UaT4<6T4<64<Z!44~4N4<U~5 4UZ!4U±_TU#44UU6UÔ~B$544$6U\!4U6U¤#~B44Uä#~B$~64<6_TU#444U~B~6~54<Y!44<_!T4Y!4<64~444~AN44<U~6J4U5 44J4U[!U#44UO4U~54U~5 U54 7U6844J44J 4UJ4UJ04VK(44<J44<J$4U´~54U~5 4U¤~5!TTT4U$5"U5TTTTTTT4U$"4VK,U54<(6U~64<$6_!4< 64~6A54A544U~6#J(U54A4U[!44J(44#~A4U6UUU[!4464~64_!4<64~54<6T4<4]TU5 T4Y!44~44~AN4U~54U~54U5 44J(44J UÄA!U5U#UôJU"UÔJU#UÔ"JU#U´"JT4U´ZTU5T4UôZTU5T4UDZTU5T4U$[T44~UO4U~5 UÔUô4U~U´$.U5T4UP[T4U~4~UO4U~5 U#<U#<4U~U2$.UÄUN 44 ~UO4U~5 44!~UO4U~5 4U~4~UO4U~5 44J44J(U5 44U¤~J@44Uä~J<44UD~J844U~J44U$54U$5U54U$54U1^4U1^!4U~54U~5U54U~6U4U^/65T4T4U$54U~4BU~4O4U54U~5 UU'464U'_/54UU~5T4T4U~4BU~UO4U54U~5 U54Uä~4U¤~4U~U'$!44~5U5T44\T44U<~$6U\!4U#aT4U~4U~4O4U~5 U5U5U5TTT4U$"4YTU5 4U4~C5U5 U5U5444$4~64~\TU5 4U~4U~5T4Y!44O4U~54U~54U5 4CYTU5 4Uä~4U¤~4U~4$6TU54U\!44Bæ4Bä~[!4U~4UD~4U~4U~4$6TU54U\!44B4B~[!44U<~4U4~$5 4U"U#$544"Y!454U^!44<J44<(J454U~84­UN!#%'+/37?GOWgw·×÷Uä;U9$%& !"#`;

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
                    true,
                  );

                  // destination data fills in the rest of the heap
                  puff(heapPos, destLengthPtr, sourcePtr, sourceLengthPtr);

                  resolve(
                    dataArray.slice(
                      heapPos,
                      heapPos + heapView.getInt32(destLengthPtr, true),
                    ),
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
            i++ * samplesDecoded + samplesDecoded,
          ),
        );

      return output;
    };

    this.allocateTypedArray = (len, TypedArray, setPointer = true) => {
      const ptr = this._wasm.malloc(TypedArray.BYTES_PER_ELEMENT * len);
      if (setPointer) this._pointers.add(ptr);

      return {
        ptr: ptr,
        len: len,
        buf: new TypedArray(this._wasm.HEAP, ptr, len),
      };
    };

    this.free = () => {
      this._pointers.forEach((ptr) => {
        this._wasm.free(ptr);
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

    this.addError = (
      errors,
      message,
      frameLength,
      frameNumber,
      inputBytes,
      outputSamples,
    ) => {
      errors.push({
        message: message,
        frameLength: frameLength,
        frameNumber: frameNumber,
        inputBytes: inputBytes,
        outputSamples: outputSamples,
      });
    };

    this.instantiate = (_EmscriptenWASM, _module) => {
      if (_module) WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);
      this._wasm = new _EmscriptenWASM(WASMAudioDecoderCommon).instantiate();
      this._pointers = new Set();

      return this._wasm.ready.then(() => this);
    };
  }

  const getWorker = () => globalThis.Worker || NodeWorker;

  class WASMAudioDecoderWorker extends getWorker() {
    constructor(options, name, Decoder, EmscriptenWASM) {
      if (!WASMAudioDecoderCommon.modules) new WASMAudioDecoderCommon();

      let source = WASMAudioDecoderCommon.modules.get(Decoder);

      if (!source) {
        let type = "text/javascript",
          isNode,
          webworkerSourceCode =
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
                      : new Uint8Array(data),
                  ),
                );
                // The "transferList" parameter transfers ownership of channel data to main thread,
                // which avoids copying memory.
                transferList = messagePayload.channelData
                  ? messagePayload.channelData.map((channel) => channel.buffer)
                  : [];
              }

              messagePromise.then(() =>
                self.postMessage(messagePayload, transferList),
              );
            };
          }).toString()})(${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

        try {
          isNode = typeof process.versions.node !== "undefined";
        } catch {}

        source = isNode
          ? `data:${type};base64,${Buffer.from(webworkerSourceCode).toString(
            "base64",
          )}`
          : URL.createObjectURL(new Blob([webworkerSourceCode], { type }));

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
        this.postToDecoder("init", { module, options });
      });
    }

    async postToDecoder(command, data) {
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
      return this.postToDecoder("ready");
    }

    async free() {
      await this.postToDecoder("free").finally(() => {
        this.terminate();
      });
    }

    async reset() {
      await this.postToDecoder("reset");
    }
  }

  const assignNames = (Class, name) => {
    Object.defineProperty(Class, "name", { value: name });
  };

  const symbol = Symbol;

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

  const mappingJoin = ", ";

  const channelMappings = (() => {
    const front = "front";
    const side = "side";
    const rear = "rear";
    const left = "left";
    const center = "center";
    const right = "right";

    return ["", front + " ", side + " ", rear + " "].map((x) =>
      [
        [left, right],
        [left, right, center],
        [left, center, right],
        [center, left, right],
        [center],
      ].flatMap((y) => y.map((z) => x + z).join(mappingJoin)),
    );
  })();

  const lfe = "LFE";
  const monophonic = "monophonic (mono)";
  const stereo = "stereo";
  const surround = "surround";

  const getChannelMapping = (channelCount, ...mappings) =>
    `${
    [
      monophonic,
      stereo,
      `linear ${surround}`,
      "quadraphonic",
      `5.0 ${surround}`,
      `5.1 ${surround}`,
      `6.1 ${surround}`,
      `7.1 ${surround}`,
    ][channelCount - 1]
  } (${mappings.join(mappingJoin)})`;

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

  // header key constants
  const absoluteGranulePosition$1 = "absoluteGranulePosition";
  const bandwidth = "bandwidth";
  const bitDepth = "bitDepth";
  const bitrate = "bitrate";
  const bitrateMaximum = bitrate + "Maximum";
  const bitrateMinimum = bitrate + "Minimum";
  const bitrateNominal = bitrate + "Nominal";
  const buffer = "buffer";
  const bufferFullness = buffer + "Fullness";
  const codec = "codec";
  const codecFrames$1 = codec + "Frames";
  const coupledStreamCount = "coupledStreamCount";
  const crc = "crc";
  const crc16 = crc + "16";
  const crc32 = crc + "32";
  const data$1 = "data";
  const description = "description";
  const duration = "duration";
  const emphasis = "emphasis";
  const hasOpusPadding = "hasOpusPadding";
  const header$1 = "header";
  const isContinuedPacket = "isContinuedPacket";
  const isCopyrighted = "isCopyrighted";
  const isFirstPage = "isFirstPage";
  const isHome = "isHome";
  const isLastPage$1 = "isLastPage";
  const isOriginal = "isOriginal";
  const isPrivate = "isPrivate";
  const isVbr = "isVbr";
  const layer = "layer";
  const length = "length";
  const mode = "mode";
  const modeExtension = mode + "Extension";
  const mpeg = "mpeg";
  const mpegVersion = mpeg + "Version";
  const numberAACFrames = "numberAAC" + "Frames";
  const outputGain = "outputGain";
  const preSkip = "preSkip";
  const profile = "profile";
  const profileBits = symbol();
  const protection = "protection";
  const rawData = "rawData";
  const segments = "segments";
  const subarray = "subarray";
  const version = "version";
  const vorbis = "vorbis";
  const vorbisComments$1 = vorbis + "Comments";
  const vorbisSetup$1 = vorbis + "Setup";

  const block = "block";
  const blockingStrategy = block + "ingStrategy";
  const blockingStrategyBits = symbol();
  const blockSize = block + "Size";
  const blocksize0 = block + "size0";
  const blocksize1 = block + "size1";
  const blockSizeBits = symbol();

  const channel = "channel";
  const channelMappingFamily = channel + "MappingFamily";
  const channelMappingTable = channel + "MappingTable";
  const channelMode = channel + "Mode";
  const channelModeBits = symbol();
  const channels = channel + "s";

  const copyright = "copyright";
  const copyrightId = copyright + "Id";
  const copyrightIdStart = copyright + "IdStart";

  const frame = "frame";
  const frameCount = frame + "Count";
  const frameLength = frame + "Length";

  const Number$1 = "Number";
  const frameNumber = frame + Number$1;
  const framePadding = frame + "Padding";
  const frameSize = frame + "Size";

  const Rate = "Rate";
  const inputSampleRate = "inputSample" + Rate;

  const page = "page";
  const pageChecksum = page + "Checksum";
  const pageSegmentBytes = symbol();
  const pageSegmentTable = page + "SegmentTable";
  const pageSequenceNumber = page + "Sequence" + Number$1;

  const sample = "sample";
  const sampleNumber = sample + Number$1;
  const sampleRate = sample + Rate;
  const sampleRateBits = symbol();
  const samples$1 = sample + "s";

  const stream = "stream";
  const streamCount = stream + "Count";
  const streamInfo = stream + "Info";
  const streamSerialNumber = stream + "Serial" + Number$1;
  const streamStructureVersion = stream + "StructureVersion";

  const total = "total";
  const totalBytesOut = total + "BytesOut";
  const totalDuration = total + "Duration";
  const totalSamples = total + "Samples";

  // private methods
  const readRawData = symbol();
  const incrementRawData = symbol();
  const mapCodecFrameStats = symbol();
  const mapFrameStats = symbol();
  const logWarning = symbol();
  const logError$1 = symbol();
  const syncFrame = symbol();
  const fixedLengthFrameSync = symbol();
  const getHeader = symbol();
  const setHeader = symbol();
  const getFrame = symbol();
  const parseFrame = symbol();
  const parseOggPage = symbol();
  const checkCodecUpdate = symbol();
  const reset = symbol();
  const enable = symbol();
  const getHeaderFromUint8Array = symbol();
  const checkFrameFooterCrc16 = symbol();

  const uint8Array = Uint8Array;
  const dataView = DataView;

  const reserved = "reserved";
  const bad = "bad";
  const free = "free";
  const none = "none";
  const sixteenBitCRC = "16bit CRC";

  /* Copyright 2020-2023 Ethan Halsall
      
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
    for (let byte = 0; byte < crcTable[length]; byte++) {
      let crc = crcInitialValueFunction(byte);

      for (let bit = 8; bit > 0; bit--) crc = crcFunction(crc);

      crcTable[byte] = crc;
    }
    return crcTable;
  };

  const crc8Table = getCrcTable(
    new uint8Array(256),
    (b) => b,
    (crc) => (crc & 0x80 ? 0x07 ^ (crc << 1) : crc << 1),
  );

  const flacCrc16Table = [
    getCrcTable(
      new Uint16Array(256),
      (b) => b << 8,
      (crc) => (crc << 1) ^ (crc & (1 << 15) ? 0x8005 : 0),
    ),
  ];

  const crc32Table = [
    getCrcTable(
      new Uint32Array(256),
      (b) => b,
      (crc) => (crc >>> 1) ^ ((crc & 1) * 0xedb88320),
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
    const dataLength = data[length];

    for (let i = 0; i !== dataLength; i++) crc = crc8Table[crc ^ data[i]];

    return crc;
  };

  const flacCrc16 = (data) => {
    const dataLength = data[length];
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

  const crc32Function = (data) => {
    const dataLength = data[length];
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
    const buffer = new uint8Array(
      buffers.reduce((acc, buf) => acc + buf[length], 0),
    );

    buffers.reduce((offset, buf) => {
      buffer.set(buf, offset);
      return offset + buf[length];
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
      this._pos = data[length] * 8;
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

  /* Copyright 2020-2023 Ethan Halsall
      
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
    constructor(onCodecHeader, onCodecUpdate) {
      this._onCodecHeader = onCodecHeader;
      this._onCodecUpdate = onCodecUpdate;
      this[reset]();
    }

    [enable]() {
      this._isEnabled = true;
    }

    [reset]() {
      this._headerCache = new Map();
      this._codecUpdateData = new WeakMap();
      this._codecHeaderSent = false;
      this._codecShouldUpdate = false;
      this._bitrate = null;
      this._isEnabled = false;
    }

    [checkCodecUpdate](bitrate, totalDuration) {
      if (this._onCodecUpdate) {
        if (this._bitrate !== bitrate) {
          this._bitrate = bitrate;
          this._codecShouldUpdate = true;
        }

        // only update if codec data is available
        const codecData = this._codecUpdateData.get(
          this._headerCache.get(this._currentHeader),
        );

        if (this._codecShouldUpdate && codecData) {
          this._onCodecUpdate(
            {
              bitrate,
              ...codecData,
            },
            totalDuration,
          );
        }

        this._codecShouldUpdate = false;
      }
    }

    [getHeader](key) {
      const header = this._headerCache.get(key);

      if (header) {
        this._updateCurrentHeader(key);
      }

      return header;
    }

    [setHeader](key, header, codecUpdateFields) {
      if (this._isEnabled) {
        if (!this._codecHeaderSent) {
          this._onCodecHeader({ ...header });
          this._codecHeaderSent = true;
        }
        this._updateCurrentHeader(key);

        this._headerCache.set(key, header);
        this._codecUpdateData.set(header, codecUpdateFields);
      }
    }

    _updateCurrentHeader(key) {
      if (this._onCodecUpdate && key !== this._currentHeader) {
        this._codecShouldUpdate = true;
        this._currentHeader = key;
      }
    }
  }

  const headerStore = new WeakMap();
  const frameStore = new WeakMap();

  /* Copyright 2020-2023 Ethan Halsall
      
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

    *[syncFrame]() {
      let frameData;

      do {
        frameData = yield* this.Frame[getFrame](
          this._codecParser,
          this._headerCache,
          0,
        );
        if (frameData) return frameData;
        this._codecParser[incrementRawData](1); // increment to continue syncing
      } while (true);
    }

    /**
     * @description Searches for Frames within bytes containing a sequence of known codec frames.
     * @param {boolean} ignoreNextFrame Set to true to return frames even if the next frame may not exist at the expected location
     * @returns {Frame}
     */
    *[fixedLengthFrameSync](ignoreNextFrame) {
      let frameData = yield* this[syncFrame]();
      const frameLength = frameStore.get(frameData)[length];

      if (
        ignoreNextFrame ||
        this._codecParser._flushing ||
        // check if there is a frame right after this one
        (yield* this.Header[getHeader](
          this._codecParser,
          this._headerCache,
          frameLength,
        ))
      ) {
        this._headerCache[enable](); // start caching when synced

        this._codecParser[incrementRawData](frameLength); // increment to the next frame
        this._codecParser[mapFrameStats](frameData);
        return frameData;
      }

      this._codecParser[logWarning](
        `Missing ${frame} at ${frameLength} bytes from current position.`,
        `Dropping current ${frame} and trying again.`,
      );
      this._headerCache[reset](); // frame is invalid and must re-sync and clear cache
      this._codecParser[incrementRawData](1); // increment to invalidate the current frame
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    constructor(headerValue, dataValue) {
      frameStore.set(this, { [header$1]: headerValue });

      this[data$1] = dataValue;
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    static *[getFrame](Header, Frame, codecParser, headerCache, readOffset) {
      const headerValue = yield* Header[getHeader](
        codecParser,
        headerCache,
        readOffset,
      );

      if (headerValue) {
        const frameLengthValue = headerStore.get(headerValue)[frameLength];
        const samplesValue = headerStore.get(headerValue)[samples$1];

        const frame = (yield* codecParser[readRawData](
          frameLengthValue,
          readOffset,
        ))[subarray](0, frameLengthValue);

        return new Frame(headerValue, frame, samplesValue);
      } else {
        return null;
      }
    }

    constructor(headerValue, dataValue, samplesValue) {
      super(headerValue, dataValue);

      this[header$1] = headerValue;
      this[samples$1] = samplesValue;
      this[duration] = (samplesValue / headerValue[sampleRate]) * 1000;
      this[frameNumber] = null;
      this[totalBytesOut] = null;
      this[totalSamples] = null;
      this[totalDuration] = null;

      frameStore.get(this)[length] = dataValue[length];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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


  const unsynchronizationFlag = "unsynchronizationFlag";
  const extendedHeaderFlag = "extendedHeaderFlag";
  const experimentalFlag = "experimentalFlag";
  const footerPresent = "footerPresent";

  class ID3v2 {
    static *getID3v2Header(codecParser, headerCache, readOffset) {
      const headerLength = 10;
      const header = {};

      let data = yield* codecParser[readRawData](3, readOffset);
      // Byte (0-2 of 9)
      // ID3
      if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return null;

      data = yield* codecParser[readRawData](headerLength, readOffset);

      // Byte (3-4 of 9)
      // * `BBBBBBBB|........`: Major version
      // * `........|BBBBBBBB`: Minor version
      header[version] = `id3v2.${data[3]}.${data[4]}`;

      // Byte (5 of 9)
      // * `....0000.: Zeros (flags not implemented yet)
      if (data[5] & 0b00001111) return null;

      // Byte (5 of 9)
      // * `CDEF0000`: Flags
      // * `C.......`: Unsynchronisation (indicates whether or not unsynchronisation is used)
      // * `.D......`: Extended header (indicates whether or not the header is followed by an extended header)
      // * `..E.....`: Experimental indicator (indicates whether or not the tag is in an experimental stage)
      // * `...F....`: Footer present (indicates that a footer is present at the very end of the tag)
      header[unsynchronizationFlag] = !!(data[5] & 0b10000000);
      header[extendedHeaderFlag] = !!(data[5] & 0b01000000);
      header[experimentalFlag] = !!(data[5] & 0b00100000);
      header[footerPresent] = !!(data[5] & 0b00010000);

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
      const dataLength =
        (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9];

      header[length] = headerLength + dataLength;

      return new ID3v2(header);
    }

    constructor(header) {
      this[version] = header[version];
      this[unsynchronizationFlag] = header[unsynchronizationFlag];
      this[extendedHeaderFlag] = header[extendedHeaderFlag];
      this[experimentalFlag] = header[experimentalFlag];
      this[footerPresent] = header[footerPresent];
      this[length] = header[length];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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

      this[bitDepth] = header[bitDepth];
      this[bitrate] = null; // set during frame mapping
      this[channels] = header[channels];
      this[channelMode] = header[channelMode];
      this[sampleRate] = header[sampleRate];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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

  const bitrateIndex = "bitrateIndex";
  const v2 = "v2";
  const v1 = "v1";

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

  const layersValues = {
    0b00000000: { [description]: reserved },
    0b00000010: {
      [description]: "Layer III",
      [framePadding]: 1,
      [modeExtension]: layer3ModeExtensions,
      [v1]: {
        [bitrateIndex]: v1Layer3,
        [samples$1]: 1152,
      },
      [v2]: {
        [bitrateIndex]: v2Layer23,
        [samples$1]: 576,
      },
    },
    0b00000100: {
      [description]: "Layer II",
      [framePadding]: 1,
      [modeExtension]: layer12ModeExtensions,
      [samples$1]: 1152,
      [v1]: {
        [bitrateIndex]: v1Layer2,
      },
      [v2]: {
        [bitrateIndex]: v2Layer23,
      },
    },
    0b00000110: {
      [description]: "Layer I",
      [framePadding]: 4,
      [modeExtension]: layer12ModeExtensions,
      [samples$1]: 384,
      [v1]: {
        [bitrateIndex]: v1Layer1,
      },
      [v2]: {
        [bitrateIndex]: v2Layer1,
      },
    },
  };

  const mpegVersionDescription = "MPEG Version ";
  const isoIec = "ISO/IEC ";
  const mpegVersions = {
    0b00000000: {
      [description]: `${mpegVersionDescription}2.5 (later extension of MPEG 2)`,
      [layer]: v2,
      [sampleRate]: {
        0b00000000: rate11025,
        0b00000100: rate12000,
        0b00001000: rate8000,
        0b00001100: reserved,
      },
    },
    0b00001000: { [description]: reserved },
    0b00010000: {
      [description]: `${mpegVersionDescription}2 (${isoIec}13818-3)`,
      [layer]: v2,
      [sampleRate]: {
        0b00000000: rate22050,
        0b00000100: rate24000,
        0b00001000: rate16000,
        0b00001100: reserved,
      },
    },
    0b00011000: {
      [description]: `${mpegVersionDescription}1 (${isoIec}11172-3)`,
      [layer]: v1,
      [sampleRate]: {
        0b00000000: rate44100,
        0b00000100: rate48000,
        0b00001000: rate32000,
        0b00001100: reserved,
      },
    },
    length,
  };

  const protectionValues$1 = {
    0b00000000: sixteenBitCRC,
    0b00000001: none,
  };

  const emphasisValues = {
    0b00000000: none,
    0b00000001: "50/15 ms",
    0b00000010: reserved,
    0b00000011: "CCIT J.17",
  };

  const channelModes = {
    0b00000000: { [channels]: 2, [description]: stereo },
    0b01000000: { [channels]: 2, [description]: "joint " + stereo },
    0b10000000: { [channels]: 2, [description]: "dual channel" },
    0b11000000: { [channels]: 1, [description]: monophonic },
  };

  class MPEGHeader extends CodecHeader {
    static *[getHeader](codecParser, headerCache, readOffset) {
      const header = {};

      // check for id3 header
      const id3v2Header = yield* ID3v2.getID3v2Header(
        codecParser,
        headerCache,
        readOffset,
      );

      if (id3v2Header) {
        // throw away the data. id3 parsing is not implemented yet.
        yield* codecParser[readRawData](id3v2Header[length], readOffset);
        codecParser[incrementRawData](id3v2Header[length]);
      }

      // Must be at least four bytes.
      const data = yield* codecParser[readRawData](4, readOffset);

      // Check header cache
      const key = bytesToString(data[subarray](0, 4));
      const cachedHeader = headerCache[getHeader](key);
      if (cachedHeader) return new MPEGHeader(cachedHeader);

      // Frame sync (all bits must be set): `11111111|111`:
      if (data[0] !== 0xff || data[1] < 0xe0) return null;

      // Byte (2 of 4)
      // * `111BBCCD`
      // * `...BB...`: MPEG Audio version ID
      // * `.....CC.`: Layer description
      // * `.......D`: Protection bit (0 - Protected by CRC (16bit CRC follows header), 1 = Not protected)

      // Mpeg version (1, 2, 2.5)
      const mpegVersionValues = mpegVersions[data[1] & 0b00011000];
      if (mpegVersionValues[description] === reserved) return null;

      // Layer (I, II, III)
      const layerBits = data[1] & 0b00000110;
      if (layersValues[layerBits][description] === reserved) return null;
      const layerValues = {
        ...layersValues[layerBits],
        ...layersValues[layerBits][mpegVersionValues[layer]],
      };

      header[mpegVersion] = mpegVersionValues[description];
      header[layer] = layerValues[description];
      header[samples$1] = layerValues[samples$1];
      header[protection] = protectionValues$1[data[1] & 0b00000001];

      header[length] = 4;

      // Byte (3 of 4)
      // * `EEEEFFGH`
      // * `EEEE....`: Bitrate index. 1111 is invalid, everything else is accepted
      // * `....FF..`: Sample rate
      // * `......G.`: Padding bit, 0=frame not padded, 1=frame padded
      // * `.......H`: Private bit.
      header[bitrate] =
        bitrateMatrix[data[2] & 0b11110000][layerValues[bitrateIndex]];
      if (header[bitrate] === bad) return null;

      header[sampleRate] = mpegVersionValues[sampleRate][data[2] & 0b00001100];
      if (header[sampleRate] === reserved) return null;

      header[framePadding] = data[2] & 0b00000010 && layerValues[framePadding];
      header[isPrivate] = !!(data[2] & 0b00000001);

      header[frameLength] = Math.floor(
        (125 * header[bitrate] * header[samples$1]) / header[sampleRate] +
          header[framePadding],
      );
      if (!header[frameLength]) return null;

      // Byte (4 of 4)
      // * `IIJJKLMM`
      // * `II......`: Channel mode
      // * `..JJ....`: Mode extension (only if joint stereo)
      // * `....K...`: Copyright
      // * `.....L..`: Original
      // * `......MM`: Emphasis
      const channelModeBits = data[3] & 0b11000000;
      header[channelMode] = channelModes[channelModeBits][description];
      header[channels] = channelModes[channelModeBits][channels];

      header[modeExtension] = layerValues[modeExtension][data[3] & 0b00110000];
      header[isCopyrighted] = !!(data[3] & 0b00001000);
      header[isOriginal] = !!(data[3] & 0b00000100);

      header[emphasis] = emphasisValues[data[3] & 0b00000011];
      if (header[emphasis] === reserved) return null;

      header[bitDepth] = 16;

      // set header cache
      {
        const { length, frameLength, samples, ...codecUpdateFields } = header;

        headerCache[setHeader](key, header, codecUpdateFields);
      }
      return new MPEGHeader(header);
    }

    /**
     * @private
     * Call MPEGHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this[bitrate] = header[bitrate];
      this[emphasis] = header[emphasis];
      this[framePadding] = header[framePadding];
      this[isCopyrighted] = header[isCopyrighted];
      this[isOriginal] = header[isOriginal];
      this[isPrivate] = header[isPrivate];
      this[layer] = header[layer];
      this[modeExtension] = header[modeExtension];
      this[mpegVersion] = header[mpegVersion];
      this[protection] = header[protection];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    static *[getFrame](codecParser, headerCache, readOffset) {
      return yield* super[getFrame](
        MPEGHeader,
        MPEGFrame,
        codecParser,
        headerCache,
        readOffset,
      );
    }

    constructor(header, frame, samples) {
      super(header, frame, samples);
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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

      onCodec(this[codec]);
    }

    get [codec]() {
      return mpeg;
    }

    *[parseFrame]() {
      return yield* this[fixedLengthFrameSync]();
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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


  const mpegVersionValues = {
    0b00000000: "MPEG-4",
    0b00001000: "MPEG-2",
  };

  const layerValues = {
    0b00000000: "valid",
    0b00000010: bad,
    0b00000100: bad,
    0b00000110: bad,
  };

  const protectionValues = {
    0b00000000: sixteenBitCRC,
    0b00000001: none,
  };

  const profileValues = {
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
  const channelModeValues = {
    0b000000000: { [channels]: 0, [description]: "Defined in AOT Specific Config" },
    /*
    'monophonic (mono)'
    'stereo (left, right)'
    'linear surround (front center, front left, front right)'
    'quadraphonic (front center, front left, front right, rear center)'
    '5.0 surround (front center, front left, front right, rear left, rear right)'
    '5.1 surround (front center, front left, front right, rear left, rear right, LFE)'
    '7.1 surround (front center, front left, front right, side left, side right, rear left, rear right, LFE)'
    */
    0b001000000: { [channels]: 1, [description]: monophonic },
    0b010000000: { [channels]: 2, [description]: getChannelMapping(2,channelMappings[0][0]) },
    0b011000000: { [channels]: 3, [description]: getChannelMapping(3,channelMappings[1][3]), },
    0b100000000: { [channels]: 4, [description]: getChannelMapping(4,channelMappings[1][3],channelMappings[3][4]), },
    0b101000000: { [channels]: 5, [description]: getChannelMapping(5,channelMappings[1][3],channelMappings[3][0]), },
    0b110000000: { [channels]: 6, [description]: getChannelMapping(6,channelMappings[1][3],channelMappings[3][0],lfe), },
    0b111000000: { [channels]: 8, [description]: getChannelMapping(8,channelMappings[1][3],channelMappings[2][0],channelMappings[3][0],lfe), },
  };

  class AACHeader extends CodecHeader {
    static *[getHeader](codecParser, headerCache, readOffset) {
      const header = {};

      // Must be at least seven bytes. Out of data
      const data = yield* codecParser[readRawData](7, readOffset);

      // Check header cache
      const key = bytesToString([
        data[0],
        data[1],
        data[2],
        (data[3] & 0b11111100) | (data[6] & 0b00000011), // frame length, buffer fullness varies so don't cache it
      ]);
      const cachedHeader = headerCache[getHeader](key);

      if (!cachedHeader) {
        // Frame sync (all bits must be set): `11111111|1111`:
        if (data[0] !== 0xff || data[1] < 0xf0) return null;

        // Byte (2 of 7)
        // * `1111BCCD`
        // * `....B...`: MPEG Version: 0 for MPEG-4, 1 for MPEG-2
        // * `.....CC.`: Layer: always 0
        // * `.......D`: protection absent, Warning, set to 1 if there is no CRC and 0 if there is CRC
        header[mpegVersion] = mpegVersionValues[data[1] & 0b00001000];

        header[layer] = layerValues[data[1] & 0b00000110];
        if (header[layer] === bad) return null;

        const protectionBit = data[1] & 0b00000001;
        header[protection] = protectionValues[protectionBit];
        header[length] = protectionBit ? 7 : 9;

        // Byte (3 of 7)
        // * `EEFFFFGH`
        // * `EE......`: profile, the MPEG-4 Audio Object Type minus 1
        // * `..FFFF..`: MPEG-4 Sampling Frequency Index (15 is forbidden)
        // * `......G.`: private bit, guaranteed never to be used by MPEG, set to 0 when encoding, ignore when decoding
        header[profileBits] = data[2] & 0b11000000;
        header[sampleRateBits] = data[2] & 0b00111100;
        const privateBit = data[2] & 0b00000010;

        header[profile] = profileValues[header[profileBits]];

        header[sampleRate] = sampleRates[header[sampleRateBits]];
        if (header[sampleRate] === reserved) return null;

        header[isPrivate] = !!privateBit;

        // Byte (3,4 of 7)
        // * `.......H|HH......`: MPEG-4 Channel Configuration (in the case of 0, the channel configuration is sent via an inband PCE)
        header[channelModeBits] = ((data[2] << 8) | data[3]) & 0b111000000;
        header[channelMode] =
          channelModeValues[header[channelModeBits]][description];
        header[channels] = channelModeValues[header[channelModeBits]][channels];

        // Byte (4 of 7)
        // * `HHIJKLMM`
        // * `..I.....`: originality, set to 0 when encoding, ignore when decoding
        // * `...J....`: home, set to 0 when encoding, ignore when decoding
        // * `....K...`: copyrighted id bit, the next bit of a centrally registered copyright identifier, set to 0 when encoding, ignore when decoding
        // * `.....L..`: copyright id start, signals that this frame's copyright id bit is the first bit of the copyright id, set to 0 when encoding, ignore when decoding
        header[isOriginal] = !!(data[3] & 0b00100000);
        header[isHome] = !!(data[3] & 0b00001000);
        header[copyrightId] = !!(data[3] & 0b00001000);
        header[copyrightIdStart] = !!(data[3] & 0b00000100);
        header[bitDepth] = 16;
        header[samples$1] = 1024;

        // Byte (7 of 7)
        // * `......PP` Number of AAC frames (RDBs) in ADTS frame minus 1, for maximum compatibility always use 1 AAC frame per ADTS frame
        header[numberAACFrames] = data[6] & 0b00000011;

        {
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
          headerCache[setHeader](key, header, codecUpdateFields);
        }
      } else {
        Object.assign(header, cachedHeader);
      }

      // Byte (4,5,6 of 7)
      // * `.......MM|MMMMMMMM|MMM.....`: frame length, this value must include 7 or 9 bytes of header length: FrameLength = (ProtectionAbsent == 1 ? 7 : 9) + size(AACFrame)
      header[frameLength] =
        ((data[3] << 11) | (data[4] << 3) | (data[5] >> 5)) & 0x1fff;
      if (!header[frameLength]) return null;

      // Byte (6,7 of 7)
      // * `...OOOOO|OOOOOO..`: Buffer fullness
      const bufferFullnessBits = ((data[5] << 6) | (data[6] >> 2)) & 0x7ff;
      header[bufferFullness] =
        bufferFullnessBits === 0x7ff ? "VBR" : bufferFullnessBits;

      return new AACHeader(header);
    }

    /**
     * @private
     * Call AACHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this[copyrightId] = header[copyrightId];
      this[copyrightIdStart] = header[copyrightIdStart];
      this[bufferFullness] = header[bufferFullness];
      this[isHome] = header[isHome];
      this[isOriginal] = header[isOriginal];
      this[isPrivate] = header[isPrivate];
      this[layer] = header[layer];
      this[length] = header[length];
      this[mpegVersion] = header[mpegVersion];
      this[numberAACFrames] = header[numberAACFrames];
      this[profile] = header[profile];
      this[protection] = header[protection];
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
        ((header[profileBits] + 0x40) << 5) |
        (header[sampleRateBits] << 5) |
        (header[channelModeBits] >> 3);

      const bytes = new uint8Array(2);
      new dataView(bytes[buffer]).setUint16(0, audioSpecificConfig, false);
      return bytes;
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    static *[getFrame](codecParser, headerCache, readOffset) {
      return yield* super[getFrame](
        AACHeader,
        AACFrame,
        codecParser,
        headerCache,
        readOffset,
      );
    }

    constructor(header, frame, samples) {
      super(header, frame, samples);
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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

      onCodec(this[codec]);
    }

    get [codec]() {
      return "aac";
    }

    *[parseFrame]() {
      return yield* this[fixedLengthFrameSync]();
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    static _getFrameFooterCrc16(data) {
      return (data[data[length] - 2] << 8) + data[data[length] - 1];
    }

    // check frame footer crc
    // https://xiph.org/flac/format.html#frame_footer
    static [checkFrameFooterCrc16](data) {
      const expectedCrc16 = FLACFrame._getFrameFooterCrc16(data);
      const actualCrc16 = flacCrc16(data[subarray](0, -2));

      return expectedCrc16 === actualCrc16;
    }

    constructor(data, header, streamInfoValue) {
      header[streamInfo] = streamInfoValue;
      header[crc16] = FLACFrame._getFrameFooterCrc16(data);

      super(header, data, headerStore.get(header)[samples$1]);
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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

  const blockingStrategyValues = {
    0b00000000: "Fixed",
    0b00000001: "Variable",
  };

  const blockSizeValues = {
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
    blockSizeValues[i << 4] = i < 6 ? 576 * 2 ** (i - 2) : 2 ** i;

  const sampleRateValues = {
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
    0b00000000: {[channels]: 1, [description]: monophonic},
    0b00010000: {[channels]: 2, [description]: getChannelMapping(2,channelMappings[0][0])},
    0b00100000: {[channels]: 3, [description]: getChannelMapping(3,channelMappings[0][1])},
    0b00110000: {[channels]: 4, [description]: getChannelMapping(4,channelMappings[1][0],channelMappings[3][0])},
    0b01000000: {[channels]: 5, [description]: getChannelMapping(5,channelMappings[1][1],channelMappings[3][0])},
    0b01010000: {[channels]: 6, [description]: getChannelMapping(6,channelMappings[1][1],lfe,channelMappings[3][0])},
    0b01100000: {[channels]: 7, [description]: getChannelMapping(7,channelMappings[1][1],lfe,channelMappings[3][4],channelMappings[2][0])},
    0b01110000: {[channels]: 8, [description]: getChannelMapping(8,channelMappings[1][1],lfe,channelMappings[3][0],channelMappings[2][0])},
    0b10000000: {[channels]: 2, [description]: `${stereo} (left, diff)`},
    0b10010000: {[channels]: 2, [description]: `${stereo} (diff, right)`},
    0b10100000: {[channels]: 2, [description]: `${stereo} (avg, diff)`},
    0b10110000: reserved,
    0b11000000: reserved,
    0b11010000: reserved,
    0b11100000: reserved,
    0b11110000: reserved,
  };

  const bitDepthValues = {
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
    static _decodeUTF8Int(data) {
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

    static [getHeaderFromUint8Array](data, headerCache) {
      const codecParserStub = {
        [readRawData]: function* () {
          return data;
        },
      };

      return FLACHeader[getHeader](codecParserStub, headerCache, 0).next().value;
    }

    static *[getHeader](codecParser, headerCache, readOffset) {
      // Must be at least 6 bytes.
      let data = yield* codecParser[readRawData](6, readOffset);

      // Bytes (1-2 of 6)
      // * `11111111|111110..`: Frame sync
      // * `........|......0.`: Reserved 0 - mandatory, 1 - reserved
      if (data[0] !== 0xff || !(data[1] === 0xf8 || data[1] === 0xf9)) {
        return null;
      }

      const header = {};

      // Check header cache
      const key = bytesToString(data[subarray](0, 4));
      const cachedHeader = headerCache[getHeader](key);

      if (!cachedHeader) {
        // Byte (2 of 6)
        // * `.......C`: Blocking strategy, 0 - fixed, 1 - variable
        header[blockingStrategyBits] = data[1] & 0b00000001;
        header[blockingStrategy] =
          blockingStrategyValues[header[blockingStrategyBits]];

        // Byte (3 of 6)
        // * `DDDD....`: Block size in inter-channel samples
        // * `....EEEE`: Sample rate
        header[blockSizeBits] = data[2] & 0b11110000;
        header[sampleRateBits] = data[2] & 0b00001111;

        header[blockSize] = blockSizeValues[header[blockSizeBits]];
        if (header[blockSize] === reserved) {
          return null;
        }

        header[sampleRate] = sampleRateValues[header[sampleRateBits]];
        if (header[sampleRate] === bad) {
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

        header[channels] = channelAssignment[channels];
        header[channelMode] = channelAssignment[description];

        header[bitDepth] = bitDepthValues[data[3] & 0b00001110];
        if (header[bitDepth] === reserved) {
          return null;
        }
      } else {
        Object.assign(header, cachedHeader);
      }

      // Byte (5...)
      // * `IIIIIIII|...`: VBR block size ? sample number : frame number
      header[length] = 5;

      // check if there is enough data to parse UTF8
      data = yield* codecParser[readRawData](header[length] + 8, readOffset);

      const decodedUtf8 = FLACHeader._decodeUTF8Int(data[subarray](4));
      if (!decodedUtf8) {
        return null;
      }

      if (header[blockingStrategyBits]) {
        header[sampleNumber] = decodedUtf8.value;
      } else {
        header[frameNumber] = decodedUtf8.value;
      }

      header[length] += decodedUtf8[length];

      // Byte (...)
      // * `JJJJJJJJ|(JJJJJJJJ)`: Blocksize (8/16bit custom value)
      if (header[blockSizeBits] === 0b01100000) {
        // 8 bit
        if (data[length] < header[length])
          data = yield* codecParser[readRawData](header[length], readOffset);

        header[blockSize] = data[header[length] - 1] + 1;
        header[length] += 1;
      } else if (header[blockSizeBits] === 0b01110000) {
        // 16 bit
        if (data[length] < header[length])
          data = yield* codecParser[readRawData](header[length], readOffset);

        header[blockSize] =
          (data[header[length] - 1] << 8) + data[header[length]] + 1;
        header[length] += 2;
      }

      header[samples$1] = header[blockSize];

      // Byte (...)
      // * `KKKKKKKK|(KKKKKKKK)`: Sample rate (8/16bit custom value)
      if (header[sampleRateBits] === 0b00001100) {
        // 8 bit
        if (data[length] < header[length])
          data = yield* codecParser[readRawData](header[length], readOffset);

        header[sampleRate] = data[header[length] - 1] * 1000;
        header[length] += 1;
      } else if (header[sampleRateBits] === 0b00001101) {
        // 16 bit
        if (data[length] < header[length])
          data = yield* codecParser[readRawData](header[length], readOffset);

        header[sampleRate] =
          (data[header[length] - 1] << 8) + data[header[length]];
        header[length] += 2;
      } else if (header[sampleRateBits] === 0b00001110) {
        // 16 bit
        if (data[length] < header[length])
          data = yield* codecParser[readRawData](header[length], readOffset);

        header[sampleRate] =
          ((data[header[length] - 1] << 8) + data[header[length]]) * 10;
        header[length] += 2;
      }

      // Byte (...)
      // * `LLLLLLLL`: CRC-8
      if (data[length] < header[length])
        data = yield* codecParser[readRawData](header[length], readOffset);

      header[crc] = data[header[length] - 1];
      if (header[crc] !== crc8(data[subarray](0, header[length] - 1))) {
        return null;
      }

      {
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
          headerCache[setHeader](key, header, codecUpdateFields);
        }
      }
      return new FLACHeader(header);
    }

    /**
     * @private
     * Call FLACHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this[crc16] = null; // set in FLACFrame
      this[blockingStrategy] = header[blockingStrategy];
      this[blockSize] = header[blockSize];
      this[frameNumber] = header[frameNumber];
      this[sampleNumber] = header[sampleNumber];
      this[streamInfo] = null; // set during ogg parsing
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);
      this.Frame = FLACFrame;
      this.Header = FLACHeader;

      onCodec(this[codec]);
    }

    get [codec]() {
      return "flac";
    }

    *_getNextFrameSyncOffset(offset) {
      const data = yield* this._codecParser[readRawData](2, 0);
      const dataLength = data[length] - 2;

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

    *[parseFrame]() {
      // find the first valid frame header
      do {
        const header = yield* FLACHeader[getHeader](
          this._codecParser,
          this._headerCache,
          0,
        );

        if (header) {
          // found a valid frame header
          // find the next valid frame header
          let nextHeaderOffset =
            headerStore.get(header)[length] + MIN_FLAC_FRAME_SIZE;

          while (nextHeaderOffset <= MAX_FLAC_FRAME_SIZE) {
            if (
              this._codecParser._flushing ||
              (yield* FLACHeader[getHeader](
                this._codecParser,
                this._headerCache,
                nextHeaderOffset,
              ))
            ) {
              // found a valid next frame header
              let frameData = yield* this._codecParser[readRawData](
                nextHeaderOffset,
              );

              if (!this._codecParser._flushing)
                frameData = frameData[subarray](0, nextHeaderOffset);

              // check that this is actually the next header by validating the frame footer crc16
              if (FLACFrame[checkFrameFooterCrc16](frameData)) {
                // both frame headers, and frame footer crc16 are valid, we are synced (odds are pretty low of a false positive)
                const frame = new FLACFrame(frameData, header);

                this._headerCache[enable](); // start caching when synced
                this._codecParser[incrementRawData](nextHeaderOffset); // increment to the next frame
                this._codecParser[mapFrameStats](frame);

                return frame;
              }
            }

            nextHeaderOffset = yield* this._getNextFrameSyncOffset(
              nextHeaderOffset + 1,
            );
          }

          this._codecParser[logWarning](
            `Unable to sync FLAC frame after searching ${nextHeaderOffset} bytes.`,
          );
          this._codecParser[incrementRawData](nextHeaderOffset);
        } else {
          // not synced, increment data to continue syncing
          this._codecParser[incrementRawData](
            yield* this._getNextFrameSyncOffset(1),
          );
        }
      } while (true);
    }

    [parseOggPage](oggPage) {
      if (oggPage[pageSequenceNumber] === 0) {
        // Identification header

        this._headerCache[enable]();
        this._streamInfo = oggPage[data$1][subarray](13);
      } else if (oggPage[pageSequenceNumber] === 1) ; else {
        oggPage[codecFrames$1] = frameStore
          .get(oggPage)
          [segments].map((segment) => {
            const header = FLACHeader[getHeaderFromUint8Array](
              segment,
              this._headerCache,
            );

            if (header) {
              return new FLACFrame(segment, header, this._streamInfo);
            } else {
              this._codecParser[logWarning](
                "Failed to parse Ogg FLAC frame",
                "Skipping invalid FLAC frame",
              );
            }
          })
          .filter((frame) => !!frame);
      }

      return oggPage;
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    static *[getHeader](codecParser, headerCache, readOffset) {
      const header = {};

      // Must be at least 28 bytes.
      let data = yield* codecParser[readRawData](28, readOffset);

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
      header[streamStructureVersion] = data[4];

      // Byte (6 of 28)
      // * `00000CDE`
      // * `00000...`: All zeros
      // * `.....C..`: (0 no, 1 yes) last page of logical bitstream (eos)
      // * `......D.`: (0 no, 1 yes) first page of logical bitstream (bos)
      // * `.......E`: (0 no, 1 yes) continued packet
      const zeros = data[5] & 0b11111000;
      if (zeros) return null;

      header[isLastPage$1] = !!(data[5] & 0b00000100);
      header[isFirstPage] = !!(data[5] & 0b00000010);
      header[isContinuedPacket] = !!(data[5] & 0b00000001);

      const view = new dataView(uint8Array.from(data[subarray](0, 28))[buffer]);

      // Byte (7-14 of 28)
      // * `FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF`
      // * Absolute Granule Position

      /**
       * @todo Safari does not support getBigInt64, but it also doesn't support Ogg
       */
      try {
        header[absoluteGranulePosition$1] = view.getBigInt64(6, true);
      } catch {}

      // Byte (15-18 of 28)
      // * `GGGGGGGG|GGGGGGGG|GGGGGGGG|GGGGGGGG`
      // * Stream Serial Number
      header[streamSerialNumber] = view.getInt32(14, true);

      // Byte (19-22 of 28)
      // * `HHHHHHHH|HHHHHHHH|HHHHHHHH|HHHHHHHH`
      // * Page Sequence Number
      header[pageSequenceNumber] = view.getInt32(18, true);

      // Byte (23-26 of 28)
      // * `IIIIIIII|IIIIIIII|IIIIIIII|IIIIIIII`
      // * Page Checksum
      header[pageChecksum] = view.getInt32(22, true);

      // Byte (27 of 28)
      // * `JJJJJJJJ`: Number of page segments in the segment table
      const pageSegmentTableLength = data[26];
      header[length] = pageSegmentTableLength + 27;

      data = yield* codecParser[readRawData](header[length], readOffset); // read in the page segment table

      header[frameLength] = 0;
      header[pageSegmentTable] = [];
      header[pageSegmentBytes] = uint8Array.from(
        data[subarray](27, header[length]),
      );

      for (let i = 0, segmentLength = 0; i < pageSegmentTableLength; i++) {
        const segmentByte = header[pageSegmentBytes][i];

        header[frameLength] += segmentByte;
        segmentLength += segmentByte;

        if (segmentByte !== 0xff || i === pageSegmentTableLength - 1) {
          header[pageSegmentTable].push(segmentLength);
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

      this[absoluteGranulePosition$1] = header[absoluteGranulePosition$1];
      this[isContinuedPacket] = header[isContinuedPacket];
      this[isFirstPage] = header[isFirstPage];
      this[isLastPage$1] = header[isLastPage$1];
      this[pageSegmentTable] = header[pageSegmentTable];
      this[pageSequenceNumber] = header[pageSequenceNumber];
      this[pageChecksum] = header[pageChecksum];
      this[streamSerialNumber] = header[streamSerialNumber];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    static *[getFrame](codecParser, headerCache, readOffset) {
      const header = yield* OggPageHeader[getHeader](
        codecParser,
        headerCache,
        readOffset,
      );

      if (header) {
        const frameLengthValue = headerStore.get(header)[frameLength];
        const headerLength = headerStore.get(header)[length];
        const totalLength = headerLength + frameLengthValue;

        const rawDataValue = (yield* codecParser[readRawData](totalLength, 0))[
          subarray
        ](0, totalLength);

        const frame = rawDataValue[subarray](headerLength, totalLength);

        return new OggPage(header, frame, rawDataValue);
      } else {
        return null;
      }
    }

    constructor(header, frame, rawDataValue) {
      super(header, frame);

      frameStore.get(this)[length] = rawDataValue[length];

      this[codecFrames$1] = [];
      this[rawData] = rawDataValue;
      this[absoluteGranulePosition$1] = header[absoluteGranulePosition$1];
      this[crc32] = header[pageChecksum];
      this[duration] = 0;
      this[isContinuedPacket] = header[isContinuedPacket];
      this[isFirstPage] = header[isFirstPage];
      this[isLastPage$1] = header[isLastPage$1];
      this[pageSequenceNumber] = header[pageSequenceNumber];
      this[samples$1] = 0;
      this[streamSerialNumber] = header[streamSerialNumber];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
        ((header[frameSize] * header[frameCount]) / 1000) * header[sampleRate],
      );
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
  // prettier-ignore
  const configTable = {
    0b00000000: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 10 },
    0b00001000: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 20 },
    0b00010000: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 40 },
    0b00011000: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 60 },
    0b00100000: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 10 },
    0b00101000: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 20 },
    0b00110000: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 40 },
    0b00111000: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 60 },
    0b01000000: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 10 },
    0b01001000: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 20 },
    0b01010000: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 40 },
    0b01011000: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 60 },
    0b01100000: { [mode]: hybrid, [bandwidth]: superWideBand, [frameSize]: 10 },
    0b01101000: { [mode]: hybrid, [bandwidth]: superWideBand, [frameSize]: 20 },
    0b01110000: { [mode]: hybrid, [bandwidth]: fullBand, [frameSize]: 10 },
    0b01111000: { [mode]: hybrid, [bandwidth]: fullBand, [frameSize]: 20 },
    0b10000000: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 2.5 },
    0b10001000: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 5 },
    0b10010000: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 10 },
    0b10011000: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 20 },
    0b10100000: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 2.5 },
    0b10101000: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 5 },
    0b10110000: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 10 },
    0b10111000: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 20 },
    0b11000000: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 2.5 },
    0b11001000: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 5 },
    0b11010000: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 10 },
    0b11011000: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 20 },
    0b11100000: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 2.5 },
    0b11101000: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 5 },
    0b11110000: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 10 },
    0b11111000: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 20 },
  };

  class OpusHeader extends CodecHeader {
    static [getHeaderFromUint8Array](dataValue, packetData, headerCache) {
      const header = {};

      // get length of header
      // Byte (10 of 19)
      // * `CCCCCCCC`: Channel Count
      header[channels] = dataValue[9];
      // Byte (19 of 19)
      // * `GGGGGGGG`: Channel Mapping Family
      header[channelMappingFamily] = dataValue[18];

      header[length] =
        header[channelMappingFamily] !== 0 ? 21 + header[channels] : 19;

      if (dataValue[length] < header[length])
        throw new Error("Out of data while inside an Ogg Page");

      // Page Segment Bytes (1-2)
      // * `AAAAA...`: Packet config
      // * `.....B..`:
      // * `......CC`: Packet code
      const packetMode = packetData[0] & 0b00000011;
      const packetLength = packetMode === 3 ? 2 : 1;

      // Check header cache
      const key =
        bytesToString(dataValue[subarray](0, header[length])) +
        bytesToString(packetData[subarray](0, packetLength));
      const cachedHeader = headerCache[getHeader](key);

      if (cachedHeader) return new OpusHeader(cachedHeader);

      // Bytes (1-8 of 19): OpusHead - Magic Signature
      if (key.substr(0, 8) !== "OpusHead") {
        return null;
      }

      // Byte (9 of 19)
      // * `00000001`: Version number
      if (dataValue[8] !== 1) return null;

      header[data$1] = uint8Array.from(dataValue[subarray](0, header[length]));

      const view = new dataView(header[data$1][buffer]);

      header[bitDepth] = 16;

      // Byte (10 of 19)
      // * `CCCCCCCC`: Channel Count
      // set earlier to determine length

      // Byte (11-12 of 19)
      // * `DDDDDDDD|DDDDDDDD`: Pre skip
      header[preSkip] = view.getUint16(10, true);

      // Byte (13-16 of 19)
      // * `EEEEEEEE|EEEEEEEE|EEEEEEEE|EEEEEEEE`: Sample Rate
      header[inputSampleRate] = view.getUint32(12, true);
      // Opus is always decoded at 48kHz
      header[sampleRate] = rate48000;

      // Byte (17-18 of 19)
      // * `FFFFFFFF|FFFFFFFF`: Output Gain
      header[outputGain] = view.getInt16(16, true);

      // Byte (19 of 19)
      // * `GGGGGGGG`: Channel Mapping Family
      // set earlier to determine length
      if (header[channelMappingFamily] in channelMappingFamilies) {
        header[channelMode] =
          channelMappingFamilies[header[channelMappingFamily]][
            header[channels] - 1
          ];
        if (!header[channelMode]) return null;
      }

      if (header[channelMappingFamily] !== 0) {
        // * `HHHHHHHH`: Stream count
        header[streamCount] = dataValue[19];

        // * `IIIIIIII`: Coupled Stream count
        header[coupledStreamCount] = dataValue[20];

        // * `JJJJJJJJ|...` Channel Mapping table
        header[channelMappingTable] = [
          ...dataValue[subarray](21, header[channels] + 21),
        ];
      }

      const packetConfig = configTable[0b11111000 & packetData[0]];
      header[mode] = packetConfig[mode];
      header[bandwidth] = packetConfig[bandwidth];
      header[frameSize] = packetConfig[frameSize];

      // https://tools.ietf.org/html/rfc6716#appendix-B
      switch (packetMode) {
        case 0:
          // 0: 1 frame in the packet
          header[frameCount] = 1;
          break;
        case 1:
        // 1: 2 frames in the packet, each with equal compressed size
        case 2:
          // 2: 2 frames in the packet, with different compressed sizes
          header[frameCount] = 2;
          break;
        case 3:
          // 3: an arbitrary number of frames in the packet
          header[isVbr] = !!(0b10000000 & packetData[1]);
          header[hasOpusPadding] = !!(0b01000000 & packetData[1]);
          header[frameCount] = 0b00111111 & packetData[1];
          break;
        default:
          return null;
      }

      // set header cache
      {
        const {
          length,
          data: headerData,
          channelMappingFamily,
          ...codecUpdateFields
        } = header;

        headerCache[setHeader](key, header, codecUpdateFields);
      }

      return new OpusHeader(header);
    }

    /**
     * @private
     * Call OpusHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this[data$1] = header[data$1];
      this[bandwidth] = header[bandwidth];
      this[channelMappingFamily] = header[channelMappingFamily];
      this[channelMappingTable] = header[channelMappingTable];
      this[coupledStreamCount] = header[coupledStreamCount];
      this[frameCount] = header[frameCount];
      this[frameSize] = header[frameSize];
      this[hasOpusPadding] = header[hasOpusPadding];
      this[inputSampleRate] = header[inputSampleRate];
      this[isVbr] = header[isVbr];
      this[mode] = header[mode];
      this[outputGain] = header[outputGain];
      this[preSkip] = header[preSkip];
      this[streamCount] = header[streamCount];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);
      this.Frame = OpusFrame;
      this.Header = OpusHeader;

      onCodec(this[codec]);
      this._identificationHeader = null;
    }

    get [codec]() {
      return "opus";
    }

    /**
     * @todo implement continued page support
     */
    [parseOggPage](oggPage) {
      if (oggPage[pageSequenceNumber] === 0) {
        // Identification header

        this._headerCache[enable]();
        this._identificationHeader = oggPage[data$1];
      } else if (oggPage[pageSequenceNumber] === 1) ; else {
        oggPage[codecFrames$1] = frameStore
          .get(oggPage)
          [segments].map((segment) => {
            const header = OpusHeader[getHeaderFromUint8Array](
              this._identificationHeader,
              segment,
              this._headerCache,
            );

            if (header) return new OpusFrame(segment, header);

            this._codecParser[logError$1](
              "Failed to parse Ogg Opus Header",
              "Not a valid Ogg Opus file",
            );
          });
      }

      return oggPage;
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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

  /* Copyright 2020-2023 Ethan Halsall
      
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
    static [getHeaderFromUint8Array](
      dataValue,
      headerCache,
      vorbisCommentsData,
      vorbisSetupData,
    ) {
      // Must be at least 30 bytes.
      if (dataValue[length] < 30)
        throw new Error("Out of data while inside an Ogg Page");

      // Check header cache
      const key = bytesToString(dataValue[subarray](0, 30));
      const cachedHeader = headerCache[getHeader](key);
      if (cachedHeader) return new VorbisHeader(cachedHeader);

      const header = { [length]: 30 };

      // Bytes (1-7 of 30): /01vorbis - Magic Signature
      if (key.substr(0, 7) !== "\x01vorbis") {
        return null;
      }

      header[data$1] = uint8Array.from(dataValue[subarray](0, 30));
      const view = new dataView(header[data$1][buffer]);

      // Byte (8-11 of 30)
      // * `CCCCCCCC|CCCCCCCC|CCCCCCCC|CCCCCCCC`: Version number
      header[version] = view.getUint32(7, true);
      if (header[version] !== 0) return null;

      // Byte (12 of 30)
      // * `DDDDDDDD`: Channel Count
      header[channels] = dataValue[11];
      header[channelMode] =
        vorbisOpusChannelMapping[header[channels] - 1] || "application defined";

      // Byte (13-16 of 30)
      // * `EEEEEEEE|EEEEEEEE|EEEEEEEE|EEEEEEEE`: Sample Rate
      header[sampleRate] = view.getUint32(12, true);

      // Byte (17-20 of 30)
      // * `FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF`: Bitrate Maximum
      header[bitrateMaximum] = view.getInt32(16, true);

      // Byte (21-24 of 30)
      // * `GGGGGGGG|GGGGGGGG|GGGGGGGG|GGGGGGGG`: Bitrate Nominal
      header[bitrateNominal] = view.getInt32(20, true);

      // Byte (25-28 of 30)
      // * `HHHHHHHH|HHHHHHHH|HHHHHHHH|HHHHHHHH`: Bitrate Minimum
      header[bitrateMinimum] = view.getInt32(24, true);

      // Byte (29 of 30)
      // * `IIII....` Blocksize 1
      // * `....JJJJ` Blocksize 0
      header[blocksize1] = blockSizes[(dataValue[28] & 0b11110000) >> 4];
      header[blocksize0] = blockSizes[dataValue[28] & 0b00001111];
      if (header[blocksize0] > header[blocksize1]) return null;

      // Byte (29 of 30)
      // * `00000001` Framing bit
      if (dataValue[29] !== 0x01) return null;

      header[bitDepth] = 32;
      header[vorbisSetup$1] = vorbisSetupData;
      header[vorbisComments$1] = vorbisCommentsData;

      {
        // set header cache
        const {
          length,
          data,
          version,
          vorbisSetup,
          vorbisComments,
          ...codecUpdateFields
        } = header;
        headerCache[setHeader](key, header, codecUpdateFields);
      }

      return new VorbisHeader(header);
    }

    /**
     * @private
     * Call VorbisHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this[bitrateMaximum] = header[bitrateMaximum];
      this[bitrateMinimum] = header[bitrateMinimum];
      this[bitrateNominal] = header[bitrateNominal];
      this[blocksize0] = header[blocksize0];
      this[blocksize1] = header[blocksize1];
      this[data$1] = header[data$1];
      this[vorbisComments$1] = header[vorbisComments$1];
      this[vorbisSetup$1] = header[vorbisSetup$1];
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);
      this.Frame = VorbisFrame;

      onCodec(this[codec]);

      this._identificationHeader = null;
      this._setupComplete = false;

      this._prevBlockSize = null;
    }

    get [codec]() {
      return vorbis;
    }

    [parseOggPage](oggPage) {
      oggPage[codecFrames$1] = [];

      for (const oggPageSegment of frameStore.get(oggPage)[segments]) {
        if (oggPageSegment[0] === 1) {
          // Identification header

          this._headerCache[enable]();
          this._identificationHeader = oggPage[data$1];
          this._setupComplete = false;
        } else if (oggPageSegment[0] === 3) {
          // comment header

          this._vorbisComments = oggPageSegment;
        } else if (oggPageSegment[0] === 5) {
          // setup header

          this._vorbisSetup = oggPageSegment;
          this._mode = this._parseSetupHeader(oggPageSegment);
          this._setupComplete = true;
        } else if (this._setupComplete) {
          const header = VorbisHeader[getHeaderFromUint8Array](
            this._identificationHeader,
            this._headerCache,
            this._vorbisComments,
            this._vorbisSetup,
          );

          if (header) {
            oggPage[codecFrames$1].push(
              new VorbisFrame(
                oggPageSegment,
                header,
                this._getSamples(oggPageSegment, header),
              ),
            );
          } else {
            this._codecParser[logError](
              "Failed to parse Ogg Vorbis Header",
              "Not a valid Ogg Vorbis file",
            );
          }
        }
      }

      return oggPage;
    }

    _getSamples(segment, header) {
      const blockFlag =
        this._mode.blockFlags[(segment[0] >> 1) & this._mode.mask];

      const currentBlockSize = blockFlag
        ? header[blocksize1]
        : header[blocksize0];

      // data is not returned on the first frame, but is used to prime the decoder
      // https://xiph.org/vorbis/doc/Vorbis_I_spec.html#x1-590004
      const samplesValue =
        this._prevBlockSize === null
          ? 0
          : (this._prevBlockSize + currentBlockSize) / 4;

      this._prevBlockSize = currentBlockSize;

      return samplesValue;
    }

    // https://gitlab.xiph.org/xiph/liboggz/-/blob/master/src/liboggz/oggz_auto.c#L911
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
     * 0 0|1 0 0 0 0 0
     *
     * The simplest way to approach this is to start at the end
     * and read backwards to determine the mode configuration.
     *
     * liboggz and ffmpeg both use this method.
     */
    _parseSetupHeader(setup) {
      const bitReader = new BitReader(setup);
      const mode = {
        count: 0,
        blockFlags: [],
      };

      // sync with the framing bit
      while ((bitReader.read(1) & 0x01) !== 1) {}

      let modeBits;
      // search in reverse to parse out the mode entries
      // limit mode count to 63 so previous block flag will be in first packet byte
      while (mode.count < 64 && bitReader.position > 0) {
        reverse(bitReader.read(8)); // read mapping

        // 16 bits transform type, 16 bits window type, all values must be zero
        let currentByte = 0;
        while (bitReader.read(8) === 0x00 && currentByte++ < 3) {} // a non-zero value may indicate the end of the mode entries, or invalid data

        if (currentByte === 4) {
          // transform type and window type were all zeros
          modeBits = bitReader.read(7); // modeBits may need to be used in the next iteration if this is the last mode entry
          mode.blockFlags.unshift(modeBits & 0x01); // read and store mode number -> block flag
          bitReader.position += 6; // go back 6 bits so next iteration starts right after the block flag
          mode.count++;
        } else {
          // transform type and window type were not all zeros
          // check for mode count using previous iteration modeBits
          if (((reverse(modeBits) & 0b01111110) >> 1) + 1 !== mode.count) {
            this._codecParser[logWarning](
              "vorbis derived mode count did not match actual mode count",
            );
          }

          break;
        }
      }

      // xxxxxxxa packet type
      // xxxxxxbx mode count (number of mode count bits)
      // xxxxxcxx previous window flag
      // xxxxdxxx next window flag
      mode.mask = (1 << Math.log2(mode.count)) - 1;

      return mode;
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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


  class OggStream {
    constructor(codecParser, headerCache, onCodec) {
      this._codecParser = codecParser;
      this._headerCache = headerCache;
      this._onCodec = onCodec;

      this._continuedPacket = new uint8Array();
      this._codec = null;
      this._isSupported = null;
    }

    get [codec]() {
      return this._codec || "";
    }

    _updateCodec(codec, Parser) {
      if (this._codec !== codec) {
        this._headerCache[reset]();
        this._parser = new Parser(
          this._codecParser,
          this._headerCache,
          this._onCodec,
        );
        this._codec = codec;
      }
    }

    _checkCodecSupport({ data }) {
      const idString = bytesToString(data[subarray](0, 8));

      switch (idString) {
        case "fishead\0":
          return false; // ignore ogg skeleton packets
        case "OpusHead":
          this._updateCodec("opus", OpusParser);
          return true;
        case /^\x7fFLAC/.test(idString) && idString:
          this._updateCodec("flac", FLACParser);
          return true;
        case /^\x01vorbis/.test(idString) && idString:
          this._updateCodec(vorbis, VorbisParser);
          return true;
        default:
          return false;
      }
    }

    _checkPageSequenceNumber(oggPage) {
      if (
        oggPage[pageSequenceNumber] !== this._pageSequenceNumber + 1 &&
        this._pageSequenceNumber > 1 &&
        oggPage[pageSequenceNumber] > 1
      ) {
        this._codecParser[logWarning](
          "Unexpected gap in Ogg Page Sequence Number.",
          `Expected: ${this._pageSequenceNumber + 1}, Got: ${
          oggPage[pageSequenceNumber]
        }`,
        );
      }

      this._pageSequenceNumber = oggPage[pageSequenceNumber];
    }

    _parsePage(oggPage) {
      if (this._isSupported === null) {
        this._pageSequenceNumber = oggPage[pageSequenceNumber];
        this._isSupported = this._checkCodecSupport(oggPage);
      }

      this._checkPageSequenceNumber(oggPage);

      const oggPageStore = frameStore.get(oggPage);
      const headerData = headerStore.get(oggPageStore[header$1]);

      let offset = 0;
      oggPageStore[segments] = headerData[pageSegmentTable].map((segmentLength) =>
        oggPage[data$1][subarray](offset, (offset += segmentLength)),
      );

      // prepend any existing continued packet data
      if (this._continuedPacket[length]) {
        oggPageStore[segments][0] = concatBuffers(
          this._continuedPacket,
          oggPageStore[segments][0],
        );

        this._continuedPacket = new uint8Array();
      }

      // save any new continued packet data
      if (
        headerData[pageSegmentBytes][headerData[pageSegmentBytes][length] - 1] ===
        0xff
      ) {
        this._continuedPacket = concatBuffers(
          this._continuedPacket,
          oggPageStore[segments].pop(),
        );
      }

      if (this._isSupported) {
        const frame = this._parser[parseOggPage](oggPage);
        this._codecParser[mapFrameStats](frame);

        return frame;
      } else {
        return oggPage;
      }
    }
  }

  class OggParser extends Parser {
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);

      this._onCodec = onCodec;
      this.Frame = OggPage;
      this.Header = OggPageHeader;

      this._streams = new Map();
      this._currentSerialNumber = null;
    }

    get [codec]() {
      const oggStream = this._streams.get(this._currentSerialNumber);

      return oggStream ? oggStream.codec : "";
    }

    *[parseFrame]() {
      const oggPage = yield* this[fixedLengthFrameSync](true);
      this._currentSerialNumber = oggPage[streamSerialNumber];

      let oggStream = this._streams.get(this._currentSerialNumber);
      if (!oggStream) {
        oggStream = new OggStream(
          this._codecParser,
          this._headerCache,
          this._onCodec,
        );
        this._streams.set(this._currentSerialNumber, oggStream);
      }

      if (oggPage[isLastPage$1]) this._streams.delete(this._currentSerialNumber);

      return oggStream._parsePage(oggPage);
    }
  }

  /* Copyright 2020-2023 Ethan Halsall
      
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
        onCodec,
        onCodecHeader,
        onCodecUpdate,
        enableLogging = false,
        enableFrameCRC32 = true,
      } = {},
    ) {
      this._inputMimeType = mimeType;
      this._onCodec = onCodec || noOp;
      this._onCodecHeader = onCodecHeader || noOp;
      this._onCodecUpdate = onCodecUpdate;
      this._enableLogging = enableLogging;
      this._crc32 = enableFrameCRC32 ? crc32Function : noOp;

      this[reset]();
    }

    /**
     * @public
     * @returns The detected codec
     */
    get [codec]() {
      return this._parser ? this._parser[codec] : "";
    }

    [reset]() {
      this._headerCache = new HeaderCache(
        this._onCodecHeader,
        this._onCodecUpdate,
      );

      this._generator = this._getGenerator();
      this._generator.next();
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

      this[reset]();
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
        const frame = yield* this._parser[parseFrame]();
        if (frame) yield frame;
      }
    }

    /**
     * @protected
     * @param {number} minSize Minimum bytes to have present in buffer
     * @returns {Uint8Array} rawData
     */
    *[readRawData](minSize = 0, readOffset = 0) {
      let rawData;

      while (this._rawData[length] <= minSize + readOffset) {
        rawData = yield;

        if (this._flushing) return this._rawData[subarray](readOffset);

        if (rawData) {
          this._totalBytesIn += rawData[length];
          this._rawData = concatBuffers(this._rawData, rawData);
        }
      }

      return this._rawData[subarray](readOffset);
    }

    /**
     * @protected
     * @param {number} increment Bytes to increment codec data
     */
    [incrementRawData](increment) {
      this._currentReadPosition += increment;
      this._rawData = this._rawData[subarray](increment);
    }

    /**
     * @protected
     */
    [mapCodecFrameStats](frame) {
      this._sampleRate = frame[header$1][sampleRate];

      frame[header$1][bitrate] =
        frame[duration] > 0
          ? Math.round(frame[data$1][length] / frame[duration]) * 8
          : 0;
      frame[frameNumber] = this._frameNumber++;
      frame[totalBytesOut] = this._totalBytesOut;
      frame[totalSamples] = this._totalSamples;
      frame[totalDuration] = (this._totalSamples / this._sampleRate) * 1000;
      frame[crc32] = this._crc32(frame[data$1]);

      this._headerCache[checkCodecUpdate](
        frame[header$1][bitrate],
        frame[totalDuration],
      );

      this._totalBytesOut += frame[data$1][length];
      this._totalSamples += frame[samples$1];
    }

    /**
     * @protected
     */
    [mapFrameStats](frame) {
      if (frame[codecFrames$1]) {
        // Ogg container
        frame[codecFrames$1].forEach((codecFrame) => {
          frame[duration] += codecFrame[duration];
          frame[samples$1] += codecFrame[samples$1];
          this[mapCodecFrameStats](codecFrame);
        });

        frame[totalSamples] = this._totalSamples;
        frame[totalDuration] =
          (this._totalSamples / this._sampleRate) * 1000 || 0;
        frame[totalBytesOut] = this._totalBytesOut;
      } else {
        this[mapCodecFrameStats](frame);
      }
    }

    /**
     * @private
     */
    _log(logger, messages) {
      if (this._enableLogging) {
        const stats = [
          `${codec}:         ${this[codec]}`,
          `inputMimeType: ${this._inputMimeType}`,
          `readPosition:  ${this._currentReadPosition}`,
          `totalBytesIn:  ${this._totalBytesIn}`,
          `${totalBytesOut}: ${this._totalBytesOut}`,
        ];

        const width = Math.max(...stats.map((s) => s[length]));

        messages.push(
          `--stats--${"-".repeat(width - 9)}`,
          ...stats,
          "-".repeat(width),
        );

        logger(
          "codec-parser",
          messages.reduce((acc, message) => acc + "\n  " + message, ""),
        );
      }
    }

    /**
     * @protected
     */
    [logWarning](...messages) {
      this._log(console.warn, messages);
    }

    /**
     * @protected
     */
    [logError$1](...messages) {
      this._log(console.error, messages);
    }
  }

  const absoluteGranulePosition = absoluteGranulePosition$1;
  const codecFrames = codecFrames$1;
  const data = data$1;
  const header = header$1;
  const isLastPage = isLastPage$1;
  const vorbisComments = vorbisComments$1;
  const vorbisSetup = vorbisSetup$1;
  const samples = samples$1;

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  function ready() {}

  /** @param {string|number=} what */ function abort(what) {
   throw what;
  }

  for (var base64ReverseLookup = new Uint8Array(123), /*'z'+1*/ i = 25; i >= 0; --i) {
   base64ReverseLookup[48 + i] = 52 + i;
   base64ReverseLookup[65 + i] = i;
   base64ReverseLookup[97 + i] = 26 + i;
  }

  base64ReverseLookup[43] = 62;

  base64ReverseLookup[47] = 63;

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01e0dccfa5ba,*!å!ô|9¥)Qò¼½=}{£=}ó\_é´!u[±?ù'ÙZ/à\O=M,èìåã$éRä-]¥:_ÑiÙý(xäº¤õKÊtDúDzfí@óvñé~~
~	~> õ$XåKWW ¸ø r¤¡¸äú{2ós9v 8«F#éEÊìÄêYw[Ï\Î±Â¸µÅFJ*øÙÛ÷ÅÑ@¦Kã¾ÀxøÅýfYo@|oxÀóÙlñðI©ÓHQKOJ]FVN^A]YE]]USMG[WßÀÛ¶
Ã(rT2!WV;L©Ã¨ú[ë^:\Ot&íÝJ(±Ò*§¬¬W«[¬¬¬lnùßüchÊ2«þ»2&F&FPDDvÈë½¯Q¸SûDSZLp«©.Lë+n½.¾|)ó³öb¼ºüF{3£Ø7=}Ö/®¸|ROJ9j zÁ^C¨Ï«k=}þ	ïº<sÍL>^PÌRS\ZøÖYEÌÓ«IxëyÚé6¶=}@@^UËUG!aé	 <jFEû~«[Ñwô°ç+·Zhûro´ñMÅÝöo®:ëUõ¤-ÎJI°½ýrGº=M4woÙçL$þhù5÷++ákyö#@ñêY«öv@E¨ÍaøØJ-NþõÝN¸±ÄDU½ü~ §v|ÅýÊ'Æ,^= ¡;èÓîÓvÇ_¢Ü ÃÕÌÐ¦ÛOgîãD­¨(â>5Y
yÑý^ÎÖÆbßUÿßÐ¦³æx·:»¤6+y~AÞÂ7ç7ÎÅåÁ Üµg¦OD6áe<z"A;<#nµ æs¯ 5Í³éM5HèM©°ÎËx7dí!µOJ/,[û5Ïv½!>Ôà?@%M¾ fL.¥Sê æÒCòfQHàAñd@]¡^+¼qÛ/Úø6ê3óÛÉ4%¶Eµû¿K«#LèÛÜjÕ×í³ù$Ñ7@ãRwV1Ð+.a¼7yÂâ_.·àÛÒôÒaxNÅ,c?´+xW8éÓ¥wFsêê,d¢¶´¢ù¸@2¤3ÑüXi«¤>ÉYâMÀ¸XL #¾ÇÚ>>dmÒËz=M/:¤ ôËÎúÍ;~| HR÷ÂN¨a;·= »æ¹ó.AS¹S$·b»]a3ïþ¬£ìËª¢¬ªÃYföF(Fjíµ÷ûÈlÌpÆr|õ¾Û,GE	r}Aû¹lW¡@~ÎúÍµÞöÆsvì»T=M=}{Ðd~³æjÑíõíhµ= ÈYìÃ^|¬[6À8<O¦1mÌUe µºä(³ì-æ¤³ãÂj§Iy ì£Ãã KüOÅuÍ¶¯:#gñð--íhsþwdUÇþö§Q¯ÚxÀrÊØ¹âÊÒû:»M¢A.Ë= Ò¾«àj×ìP6£mócÃPX5´¼Ûèz¢AEs|ìó¼Y3¸nÿ÷L=Mì¼uü§®þîìTOK®ûnöÔhÜûc¢1>º­·»4JØXÉ­HGMeÁÎCätx&­û÷Ù¼NÓ><ëÆQ{¨ ¢î^ 4ìçlgó+ëyqüLw\zV$ÅEäP<ÄuýÞßO^·»ì¶²£¬ÎÖò¡NÞlß¾_;ôZ= 3ò¼NÞvÚ¹Òx0 yÙ·Ú· dâyC)ÿ/!®brüÃ5§K ?ï§5òyvyDBKe=}ÛðÜ ÏÑ*/Åv] j¬úsÿÅ-K¨ãè=}ô56ìã©væ#òÀ2-ZT³¦&HÀ³qøm¦Q =}¾ï2Õi­xµjWØägÈÅG Nsók &£bÇ)mQ»ÇEæéiÂ$ÒèÑp_°H4e±e|×ê5(ËÁÌôHâQåJð¸âý'ëb°÷HM½	$ËnôM½½°=}ËÎeÎ;W×	Ô|U×üe®ÓêP½0wwDû(¦-ËpSégæ@êpüjÒÔGMXØÉ	puüë¨ÉêÄq5OÇ¦mgþ¸(*ù¦-¥ßÑÆÈbÅLÆBJ««3ì]·çhDw#Ü£Sòéö{{nâ²æêèj$5"\ÖËbê
h<«E£Û¸ô=M¹â= n¿@Ü sÝõ$Â#(P3W¹¨D·ÑúFöÛÕ	l*
FoËBÄ.|/~Ä%gl8éM.é²j[dw;.óÐ¦ârö
ý4ÜP
eêx5Aµó	AD9ß4Ò/¥Qñ	æÿÉ©C%S7;\¸9Z7(@­~<áV8O= Z
dfîôØ
P;
{s8L(Gç¡Få%= $
ÆbäMØtGÊNC¨Èµi+mX¬ì9 ?½¥gqÆp|ºôÏZ²Ì%òE©×gù\Y(E»¯Ü¤ÏQ¼CïÞû¸~¢Ù÷¬®©!¾8<.Cü#:³òTOúaDïrú$äï)gC3	ºKëD{L@zQxQ¾[¥Lp	NGY´°Bj4£ó
ç®+óje^ñ5ýõ@ª_Bxlá¾"m@õ$5U÷«xõFxÅLýìA9àÑêcvùdoî&­½ %a*Ø[¥Êb=MJa#ö 5÷åxf1ÌHIÉùÊ-ádØï~S)Þ¹¯SXkÉOTû©s3Ó= ©­î)ìm¤à¶|qìÐ?ÅÒSø®[«[B	4·P¼hS£>yßµ"·gQÂû>i= VÄÔn­7U®êxÃnâÉtróÇ,8PJ¯Ýu¼Ô×]ì¡©$ûhiA&åKÄ .§fj>éËºÙe¾Ö÷ZÁ÷Z¿¿MÝPEÐÙ»Úc_¦M =M°î÷ZP ÷Z÷ÚB0a­-÷Ú÷Z.\wâKpð]Wåµö=}_yJ=M¤[Ì*ôÄ²¬½øÈr= ]Íû
ö	´1\ÛHÏ(yÜ9õgÜ­:×.¼§è.U[U«:ÿ¾æµZøNïN9Ë!þN¶ZQ8ËÞFkzO²Z:gðç"üRýíÿìíÝ!¤¿=MLm((-ið£¨±ùëñÒÊ¯_>Ò2¡DñIÚú6 hâþ"= vJú¡röS2ýt03£¾ÐN¡ÐLÎ$Ô¥{mÂZãjÛÐ4tc1¼a1üûåÓnÇçRëÀölÂ´j[&d¾eÊ$hÓÐ´Ööäêê2ÓQ~Åód²=M°z7bß§Uß=M§UL9y×DQ¦ÑmÒFûÕMôÙJBOñvP÷h£Õc­ÒùX¹4'CÜ«2ÎÓ´r-©·à¾UÊhíìätDKþêZm[îV#qLS:áÄñzº^Ù;ÑRi0Â}È»êæ¶3âÕø­íø­= ±Ôø¯áfsW1*íËÛZèz4>Þ*X\Þ­¯UøÃõ«¶Ôò¨æ\±¶}ó¼SÞæ§z¬Ùa,Þª@0Ú¡¯[J*§!)6=M2ZA;ü¶:¥TDö6ÒÙK,ícfÐvgZgZ<ÿê±S=}= Ë:FdK(áÀ ~¸S ¡,ayC&¦Û­¿6/w·õI#ï?= X5 PÃ÷	3ñÈõÒ²¶Ãw>Þ%³ÅÇhûÅÃ=}S¤-TÂ£RåÅíY±. ù8{Ï
X·û= 5äj^j1Sèóúïûã;È=}´»<ÈÁ÷÷ºæÖÑ¥¶Jý^9äeG[GÜUkBQ/nðo6cöïïgõÓO-Åm¿zÜÜ9¼$¹Ø©À¶Éß¶DÔ;sËþÉùVøìÃÿV|fp)Ç¤Â¥6êq"\ÄÊ¥M¨Å&2z\³WRSôÄÊo1.HÛ¾ÞðäÏ,=}ò(%'õo6£,;|YºVti'Ç.TØÏÞ×:ã^e¤_^GÏÍ©À 8ÂüM+VÂÂAdÜ¨rÅÆµÜO+ qÃÅ¾ tæ´ïÐ·WÎA¹Ë.ñ÷ñ8)ÿaYD_Ö2w=  tPÞÃ_ÀÍøHjØi¡o×Ü;Ì;q?½Âmi)n}.Á xceeï2ýÁRÓ­Í²×Á²?ÈÞÍ¢ÛÝ±ãÏØÒVÒ%SÒços¦¥ã?!¾ðÑV^ù¤O]õw6ÎÔ_.þÞnW©°uºz'>jò|qÏä¿ÑÖÖ(CÝeï.;ÂB=}E'ú×Íj	gÈøÛ×t
9ÅX5rö¶ï¯XÆ [
÷9¿¨×üD­»-û÷Õç¾û[zc5ÿ ¸ äé]ù$¬#éW_sLvGj¹.ú9·q-&ó	1üNNbNû~,,= 	2Àñt5W=M·×4°X[¶·Ñ2>@u7Fmú!+×"·¤;lzVö¼úýÃÓ÷22ør°³_Ú Z¶ ü¢^RV'ëÜ"D¦ÿïÖGa(«Ðn¡/ïÎÌ/: L²(ûväIl»>ZY¸R«Ãk°äTLõ|{ÎðËÃ7Ó\çó,d#S$%Æ4yöÛÊ7c´ðÆÅ'«¹$þIoñO[Uý¯vÊ}TbG¸Ãlè¯c¾*¾ô;3³³L±A±T^"uYÏêï@íu 5.'ñ(ÒD+Å= ¯¬ÃÌî+ êý¯o¡ò%ÁC2-üs{ì=M=}+35äÃÑké-páð¡´ñæ6p¾o¨# ´SnÈd½A
öËd½fvçãÊXc~í£)Râ[l§þÆU3ÆÆB¿7s(i K­¹«|_ºPzÜ wÅMçîR*]Êø>ç;Â.H,°dF¢ÛÃÿ4÷Vùýÿ¼à^TüÖui_C½;8wï,µçNóÂãG+V²ýBßjN7Û×éíÌlç;âþ}roÐ)J¡Eh3<·n °	(¿KÊtøüLª-Ä³¼iÁ»^£g¬z[¥7|Cý7í>Q,íR+WÒÔùþïTæÿWÍ=}ÂJ¢Y[W
a58­¼²jº_6cn©<;í^3ýØ­i%AÌõbþg¹óª»3©É.À$¤MwG/ã£O@¹S²òúÆè­ÙTô­]éNÒ}¬¸]ÚÑöMJÏÝªzê|:q.ó=}c iã_Ùõû_
çDÿ«^E½Ñb[h¨·Ì+ói*ÒÞ¨kÑQJ»(C~O§ ±h +Íùÿ)ÝÝS$ñ¸* ²ÈµLH¤¥«
=MÃ)¸òéµ5ÚÏx¶¥4
]¼@ñgå,Q6(UTÔµÍ2?þ¼3/óBV¤'¡íª $ø{= æ;Ã~=Mû!ýbhE\£cqpmº;_W¶ö,ÓiÛögÖZËþ«$'%@Ö¯q¼¹[¨TrSAí(ý&my-µÃ¡Xm*´azmtYY*($;¬Ë]Z7ÏþBÞÎF¥iàÂ(óxm[BÐ¼^­Tv¡yc
7Z;¢Åu(¡â¸¬¸VRÂ/= ­VñÔkÃ£?jû"¶ËýÈ,6ZbýöÕèm5|Ì²)m³Tïè¡~*´Ëñ¤ÆPýxKrÈ÷+~Ç/~®@oÙtÁ3TîcÇPpMã|°/àÉdÔz³ªÏ'ÚßA"ºÞ"¦¦ÔøU¿^Àé­§ÍÛZ¿(&*Æ~6ÕàDÊï4RÑU¶Ãè¹W¶Áèq|ä¨T}ZgFù±ËtJ¶o¬Q0ðøÚágù§ ¿xI_dð+Þ½$M&Ñ;ÍáCFEìÙç+C¤¥¿ÔÍÔÍÏ¸LÓÃéêw¿TíÜØ?L¼nvüò«Û÷+²ß$ÔÙòÐkH\Ø9µÛ)<8ÞºÎ^ð?W¿«=MÐ}HÍÛ6,Êûým5øú¥¯G¿¢\sþ¢X¯Ftv÷^³Óë}lÒæ=MOÛnªÉ:YÉO:ÌïH>BKQ+ý_9àkãàãà'Xl¥/Þz1Rt¯ÕEî,w'';¸ÉÏÞ}àsÃ6¶ý³Ëi©Ú¾4ÄÄ0°Ñ¡XÂCGÃÐARþsWÝ£orÃ¼Ï=}¦\ÛØbÿ=}×ÀCFFFFfÚËwZ[¡çû¸654
*5zÛVu.g¥+üÝ>3Yhò|ð§X*üÿ?~ø³¥°áÆaÈ8ªª:«¿Y~Fßzè{ïç¡åÿ6÷òß¼¹3§	ö¸¯-ó]v²t
d¹(MYÌ¼9ßo}åÉ_¾+ßË>Ú¿×²ß¹Sºz§Ò :în«¦¨åÂåéãÎ7= ,öÔ\Ùbõ·7[ÕÈÛÒ¬(²tCÓÕBã÷9ÝÝì§xÈvUÀÄfÑ1­u2Àes){x¢jÛ}º°EC"ÕjÒ¶»O5\®+ÞóÂ¸¼OÕ1³ÞõDÔ
Öà·qÔL®ISÌM ²â)U²{ÑNÀc,¡aþÄüÚò^ùÝé ðÄ7dþrwFÃj­!By(Mg&^Ì¤­d»[aÀLmDo5mV0$³XJ;+?ïV¬ääCwÝtt=}wÀ£ßd#eéÆ¯ cd{Ñ}Y·_Ð{ßæ\ÿ­!EÎ&Ìy´# ÚÿÇÆðº÷ÐÐØ,ùü9dn÷§öéP°8ìÄÐO'Ýÿ;al¶qêf·.ì¥ML³Äæ&1=d{ªLßüýÑeêd´-C#Ôhê¼¬Hf,"ÆsHÚ-Îâ×ûUiQ×{	ÊHÎØö<µ5~£ØEA @»c¯Xü!µÑiy^sn;EX,= çÆk ,ç5iÊ/Jë¢àôHâÎnþ nV­VC¤BÃa=MTì¯ýa[QÝ÷¿__0ÌvHðç'ÊDïT¹ç)(*=}KÃkÑPca¯ÿCrmÄ¢r1÷<oWGlìqâÚðúÍ-(Â»únM¤¬+eØÿÜìÊÜcÂ³m\O<H;Í{Êü A¶'O+v[+ô·¬0ûéGÉ³6;´%lÊùáú (sKJÒê¸·LÍ/Ó¶²iFYML^D|è«¸æüÏjZ0¡¼Oý»ö·¡Éx&&$óò)ÄrQ
3bÒB/aw8¾ú±©øppÌs ­Õæw±ð.å&Ý*
«ûÓÄ422E²KóÚÿ¹Â.Ä]3v1Ïí_ZM¹nl
1òØ¬îÒ
3 yÃ´f¬ÃÁoAê¶Y¹8=}M'+ñcmµmñ&îG¡4a	æ× É70&tü= úó¬Ç@Øþ´¥-ÂËðÄáÀ Uâ¬£åXQìÀÚX ý¹ÞOXÑa+M5·¿°­bÉe´ÉæAá°Ï8øcFfäna{ÐÜÖ¢rþâh¥LF¸^Ã$F¼	àH+ád°nú®-«#B®¥#BZy³^{¬²ÓÅ.T'u=}áý¿¢ð=Mì¹"s;HåjzðßDB ÏÉõ6ä÷4/Kº«ðï%Ý2¬n3#þÚË¡wou8Ö=M~èÒy%ZèC   Ë@Xsé4rZ}¿µÒûu9)2Ê;Gí+§:ÞÁ{u8$?£e³àöÝ»,à4$
£äÄ×¾Ì/ÄSÍëÂ×åRÿûLõVCÓ@.Á$pónÄ= ­«Äµ(ç»55à1t"~e¨Yp|Wd#ªø¯w\öq{éïÔ{iõH]õÄsb5ýDË·O:2zü If§Ñî©1×nMÎZ¼É[NXQAÄ××¬L¶¤VG¤×5X[O­dM½I5¼Ò¼H¼¬}ý $vªkå¯ÙÝQÜ×©]ÚøÜ±¦´®HØ8ÇÁ´Eè#gÅ:3 ÞG= ~£«×I&Â/Ûv
nê.¨Å¿~Àm¿=}}âç¨mMtç¹ßmgFCßRÜQ	.>×Ûwq,µ@LæA~g8ê(yÐÑúÛoæL*OÇðÐ0´¤+­úKKGÝ¯GC.þ9e;uWÖ#(©Aº¹©£Hê}¯"wwVNeÐ¥Ôì 9øzÂ±¦æ£tØv= ³ ÀãWän ã©!19ºÄgVXèIËÙlµEìzYùÜS.³7e1BN­n¡¬ÍJÉA=}ù
k>§-F/}ÉÆ5¿)||Á\} ÜöKÀx\Ylz(ã¢/ X³æç©a®«iDÍ]=Mâí$Í-'ûÈ©¥n/±Åäß²o%kð*¨eÅÑ¨G²ðºí³lR;
û¡¶cî¸xàòÖÜ06,S/¨ùSµxUòDzWkÆ¶«p¿åGà=}N=}÷ËëîÖíî=}ãS-ÔÂ¢ð´ÁeêíÕÐàéº©[ÉùH@¥¨hÆ±Bë·iÌ°Kg>÷-Y	{é×%W(i/Jó&Yãk+ÇÕò1
)øNIWé§2ºRS{3ÅóJîÞ)ÿ¯EÒ5Ö®]6ìÍdºïÉ<©WÁ*~Á*÷ÄÛÁ*÷Ä[Á*øáÑp¿ë9YõÁ§½KÚÌ0O@Ît;ø#(çiÏXíLgüæ@G/øerÚLlô®S'J»Þynl·%T0¢æÿÙXËu;MsÜ£Å?b¹Óöm#û_ä
ad^3¿q±6SÛoL'Õ{±M#L
r^ÎÔµ)S¼±Aõ¡$É0¨Ú»;Å´»»¼¡0¥dú5uc¨]Ù	v½Q¹VK­}N+ár?= »~âÅUÐ¨ÙzìvaJØýv»^c¼Z#A¾Ø±îçnUÅ&[ÊðçCZ½ÑÊl³¿éJ½UU¿Z0ËU[ÑUwOþZr:âF	I¢\%=M1«8"^ªÍ¼N]²0SçÌ±?t/måu»O4ª;M5¢.Pã1ÐXê
§qqÈí¡êgÀäg@±ûâT«fAíã°Å¤»Âkm¤él$ _îkôZIEé¢áÁP3´½<?Òe9¶¤Q£k³ÚV:%2>KÍâ³ Ü.«½ÜÄ6>iî(ÎÖáØî$üQz[p4oÎ'ùfqõêtó'8^'FÁ¬yîw7Æ+ÀXJ)tÔí°¬ïO{ü]ñQo_cIÓ­ó#TÑ}8¦
älâu­{Ýrª TB+ß4/Mfû!y4ì>-Ei+keØ að8ð+Ô{v?iöeõÇF)h;îºy,-úÌ]í_u]nê1¿ÚX±Ð\,Ë¥NÙÅÍè¦"äôÂ§,¬
¨À,s;±46T;bfÝfa]U^?=}¿7g3Þ¬Ë³= !M;8ÌC=Mìk½"&ö Ôc;}¥ÝÚPX8m±S¸ÙX3ö?42VVáÆ=MbzTþ¡1ñç®×X<ÙòålxÛ1ê6ëF+dv9'J½@Èæöq°£01s³gÄ³ðþ ×¾ÐGu'ÔýS¢ú{Rø¹ Z{¬Î¹±$ë ¨é?¬Ê/ù=M¯Ó&%Ù¹(:x£YÊHø~î'-Òû[|ÏËPÎp¢g¸ÿ$ASUaxUêö±§ü'_±­å/ÆBi:râ+ê»îô?ú²j]©öÛÔ³ENPvÞú²b ÎwÄ±:Ê¾÷QuÏïãpDê óæº\q!ÜñÓ"èÍ^*Ô®4tm~= ²6¶ÞÊ-º¹ÞQffhgo= Çã¨ÒÓ- õ2¤æàõ0É5
=}_ÓÅU|ù¬púù:õü/ãØi8= ,ÖÚé°±¸¦t´|²ñ=}æVHOL£ËZ¼ÒoïÇÞUªÄßÛ¿×r}ÙßÓÀ
5±º÷OQÀlu¬¼%YHw_ìÈÓ²o ú#J[¾GaÀôûBàDÀYbxÕï'ÄGXÈlµïHÙEß	²wÀ¾Â×Ù'k7ïÙ­Ã %¸Y<òå/pê qÿ@üï(Öþö= XgÈ¼üTÚÄÀDH8öÅ>= ¶å&zòm Ú?áÑÙÃndm¶¨¶ÅT)3"â{·ÇK{Ò,-Ãüdçfýp»è qÍÈá«Il¬jí/âQËJBe\1ú1#òÓfòÓfCÚIÚ]î¼×:¤äõ²~9ºÙå©±)àÙA±.Á£-ìÆr»1Ñ
éhQ¡ÉglùÈÒíþz?ááðö/~äA(LGÿ}lyï+jåSYJ<¬¶aÎõv@e>Åw¦h÷Æ(5eÕ®T÷£·dd Å+tñºiÙ($+Ç3VN·mSTiÓ6Ilí¸pò¦W±±O±¤,ó©÷(H¢_IÌõÞôno-ºãACÇÂú= º$·vÛæçóXãen&;=M ü-] q<ÝEÙâò9ÍæR
ÍKÇÙ¸àÂûÛÖ¿bÐC Q'{)?éýl]({ú§WÁ= GýÌØDqaíòû²DØsTøé2¨è²1I)[rXâ+ë4)S×peÒ	ÿð*¬#ÍMßP';¯õå´yâð´Cã­.îçEåöàÑ(L±Õ·º$=MîIÂoØ$<wh»Ù=MÈH¼¯KøÁ rDÕÎ³ÌH» <OÑî3ó?´¦CwRRg¤½S½ kDdýÄÊP1F×kZ .³±]jÅ1äÆÙÌÁ8Åaûþ«£Nggr~ýCÃ¸Z]¥iàYdQDlûà(4=}­óSrÉ[mÙ²Aæü.8~¦¦[P×ëBÙñzyïÄílC!4_	¥]Ü.Ñ×ÙZï_=MCç¸=}/ÖZÈSywÖY½çÛ &sçÛ¾üÚ®¯^¹¸KFÅt=M¯¹þ*?@N¬ú@ØvãB¶= äë,¥¦wìQ]a¿@õ[=Mtò°Ûp:2Ýö¸¯Zð©1Ë³©Pwè=MmXì%W/ÉÈ©hÚo÷NÏÆeÑôòqþÏ$sÜTg^£JÌD&K¾®ÈøÅ®½øÑB¨Ã¿= $]úµ÷æìÉà¶gánà<Ôáà¸À¿àá0= Ëgávý ¥A= Õñ= WÖáêgç¿Í­êð@mÊ¡àªA= cîÀIûEàìäønà\ïÐÞÜ}O6= à#o= ¯õ= nDL¼0ÒÅdV]ÉeË«ÍJ$9kÆÉ\GN=}æ]MKøÌñ÷èü=M¹7D-þj¨"38½O#®=Mýe]&RG×ù	Ôù	ÔùiOònr©(!÷i
­oå½üå½G	WSvR?rb¼ìJYôJ¼­ÙªaüÃØj0o}cÓu¬ÌþwyËö7uK3	Ëw:'O	ÎBWËLci4¼%·§+j¶»ÐX?[X^QçoSÑ¾½X2Ã]X\FAöñoÑ-ÑU(M§ÃÑºXßN\ÝÎeßôþYLå9E\þ{ÑMÑì2U\àoÃCÑ¡}4ÔÜ.\HÑÁ£ÑAÎooÏ¦'Ø«ÿ£LRáogÃ»WÃ¹ëÜÔ}ØüöÑþÏjwVÃóÛõzi§ÓÑ©½Xùõ¾õ~¿io×§ÐpØÔN§oXß¹ÑåÎlÏ¸m¯¯K}W¤WÁÑÖØÎ½Ø~ÝêcØ>®§×Í¦×óÖ.Ü .ÜÀ.\6'õ·v=MÅ9ý©Û¥»¦"ÛXÒb^mÿr·©Ëóátjïªy,·Ï¤*üY4ûÿµVtÈÒ:YH7ß(â^#[(~(9w¦oÌ¤Ò,ªwëÏA2¾ÉWY~³~
^Gì¢ê+ÕcqÇôó­³qô%'«a+Îq[WÂÈ§.´¼	ï¨CÑ>Y¼ó¿ûÕÏãÒóÿs-YRCZ!¾óÿwkRI>¸µADGõ³×ªÛVTìrWf{ÒY×.\2>pWÈPÍ¦qÔÛ¥Æ]fËù¥&%a³´ÓÏ.lRF¾LÛ&Y³.\m5¾¹mO¼mO²Ép5;Y:VÁ^Àßv ¼HL´ = I!çLÎv®ËÅU!VÂûÄYþÀY§ÛGÄTØ= S7YEcë©ÆÅíÒhi7RhÓöû¿û¯«ùYX·È>ûÄá§W«ãªëyQàt{õ%
M\}õÅUj¤wÓ& ö-nZ1ò¼Ý ðª](Ó¾OµOÏª«&ü#=Mq·JQlÝCÒ¶p+RQ¾¶¸ª&K\83W!½o«åàXô<P¯uÛÉØJÅ^¼a[8Êî´;Î»m×JMWvÛ¹=}%Éþ=M??B~^Ý$l«T´	}Q;b§= VÄ +í+úB°%À¶)>ÓÉÿ	÷&Ädtµüåìµ!i^7òÛ¥Ãþ_a´½[ft6=MÜþc¡æ/[Sÿ È¦N·´R§~¼íaÿlä»Ò)t8ø8t'ÐâªcXµùÁý]yxµ¸ûVxU@êQÞOô£s©	Äîãe:;YÿÖrîa÷Òa¨F}Ï¬:%I´IÎqD½~öB¹faêëöäDÖÅC±»0#Lö#½r»ûGË/-£?[}zeEøJ»e¡ "àeâ&òlÊâ]F9ùæqZÄ±øhëi®«£?R·vÕ¤ÑÐg¶¢1keýV¨êû*îsv7Òw w ÝïYÐAk¦ÀHô7[ööUÚaK xãÓ£ÑBÞh¸Æ|Ð|üGpÁ?á,:ÉzÈóH­­ä~X9oíåHUyW¢
Þ:pGÂê,>ã:Ã,íµÔÿ^Ýe@É¿Æº<Y¼ô?D.Ò¢ìÖzºë:®Å*ÛÆ©koö©AÍ£Qá^sÆúÊhÞå¦þ/Ðè¹n	cgÝÿWjô~'¦&¦Ó¬XÿÞ¾§lnlùzúÒL?âK+ËµÝQ±:<HBD¡ËÑíK 	ó±Âó+óæî?¾hC¼ým3VôH4?í¶1ÀI5KÀbÊw>²èuX=}^Êú¥xZSzªÔF¸IX´¿v¶åiu2ÉÅÍ³xÇÁ ¥u·2#~à>ªÍ©v2(¨x/ÎsãÄ:j_ÎaUÆ$Ä1ãÎàüäþòÐ	aoïâøÐ ÀC	q= ùÚèÐ)VínBaû~m:?/D+ ë¤LFÂÈ©LÍÜòQ2Â´§ÃgÅeý= ÙÄ«YÎ~sº8.eÓ]T66GÀ®wõ¼.'Ê,ÞìÇüémè|^¬o«þ~¢WN©WüÐI(Áv'qJÿ8çúfìU®ÓÆ&
£'Cm¬9þw9_Ô0U&q?Ãô=MËÔÕ9p|¶9Öá;GeíM¨IíDdéÒ¯q ê=M£94Â»5a¦&Í}X(NÔK´DÜ´ÃcAöH§ÔÄª+5â(qZ¸i´û®>Fn²Ò|<q÷¿SXÜ;A÷ïù¤õÁ[=}»têçâ]#q½2ìËTaMÕ)8ÐgÂ0.ø°SaÈk% Ah[á0±go¤ÛGj<áJî¤©òÂth~¿¼¸¸'ñâZ Àj?ý¸¾p¦!bÀíHRÑSÆî\XÉS¬GI«ßZ¤­zë\_ïö¶Ð²ß6¢ËJH/= Áù°r¢Âe¨Ã®§)= ÐQÐ6êÆ±§'º"ÐËÆn7óäÑ6þ×¦ÌdüQ¡¨%î_%ãÀ2ÿ,leýÔ{Îµ#@BÿqÄ!NZ(E ³úÙ"G
oºÏÇ4i7n*¾|Ø¿½Þ7û×RýÔQÿÂ7d²}2û>x8ßåWzEmÎºPÔt¹×/y/y³Dq.{°¥Q[W²ük¾9R¶ÌY¶lQR¾¼=}(÷h#jàoA¿å'¥fO¸~n!ô'yÞ¡cÿæÚÇ?»Píì«HH[Áüðfwôõ÷Së «ÁEDá°ô}ãm<RÒÖ\lØ l1»©wù :Çt !²Ð\ÔÌ]÷¿hL]KD£+©5û÷ÂÑ¾7>òQ¶Ë+dU.±)ÞêíÐÛ2¶sEø1n^6÷}\á@
?èözyÉ<ÝÇ¢7·½«p¢<3üÆí.ù+òea<w[[ÌªQU¡Ë§òR {à¡òK7TL=MRåøhaç»ÜA#üûé%y£Ä¨r= :(cÈ3þÓbåéow©âÜN6Bà¡[qä:Ç9	Ê[»V<ÝõiýîvÑÌ6GþmNQý1Ë±,(XÂBðtÝÐêÄ_È%54è¤?ÊÝ#Qvy¹WÚ|
ù2¤1KLGùÚ/d«ÿ<>w©§U'Öc"-ÄÿÑ¹ù÷£w§ZíWË8>Mrj3~V3çyiéõÌzZH,= b-#åI&ÎÖO¶XµøHj¾Üx3#Ðß[Ù/î¯ÇÿZÈÓ!bdëßÖ?\ßc?É?ÓÁfdë^Ì|»ÛÔm¿ØNU?ýªª  1ùPôgqì^Ðf­OØÂ!°,<!°Ù,61}RooE:ãð­&Ë/Î¢½æu\ÖQªnpÂ¸üÆðdHuØpJB³FWt¼KO¡{arHjû\NÀz¡lµd®mO¿_}BÕCÑ'»2;Sÿe×¨@ÌÎç½*0Úv+±Ñªÿ¼3XQ-¶NÜHM§\À÷
'VIDT1MÜ«àÑLî©Bê
§·½$sª]kÏCô= WÚ¤8°Æ
±Õ=}GîÏ	üªPO5<:ñ9äÔ[ÚHO¾»c[Í(¹@OÇ³ÐûEÕ·ûW|Þ]Ì¥o¦/ÝûÓÆwB×£Ó£-ÖlÎ´¸sáô;+=MÒojÄÝÑñÈ¤Kaf-}N@-76±¨¬ta7ür±CWJ]V  5ãìé¤µmRGß7ülÌn= Ý ²ã
³áe1è¡Ó¬Ùø=MözÂo÷ÉWh	,ôv5ãº'õv§]¨èHðrè	nÕ?LÅá^ áªÎw0®ÃÑ) Ã{cO1ªzI= EW	Ä¤p{øY |ÛuY²÷µ:ærM1EW-îµÿùÑU¤¤YÛìÎP*=}Ýß^é)%g9Ó:ÿBWý««DºªìLË£0E- M,§å= ¨I°jÜÈw¸ãIGäþÛ»Ùm	°¾TðlXëAM¥*ã95æ9Bçd·ä·¨®í´ðÌ2%ìbÐäñ8Ud4z	j*o!ïOçy!æ<²= 
ç kõ*ÃH>pP²%ÌÛÑ=}°á§¨Ã9Ñì«§¯êþ Æ¢=Mÿf·Ó"-¥ß9]ðGé4!ØkýÄ;=MeÍyÍÇ®Êd¦Æ¡J=MU¹N6çxF¨rg*]WfÐÿþf"«zÐi«K[KíOîí+à®zôgìM8T¶rÉe´Ð+´²PðÍ×°Ö35=MQE;X¢÷É'E-ÃSÚó¡­Z]CM>m.%ðMÊûêSé¹»Íoõ6ô³ãn1;þÌB=MðCÓm3-bºMoN¹CvÖòçºa'-õçÉ"§â Rcicfýç%¼$j©èW 	|Ð%{^B*Àòûî  úÄk;u÷îC])2,a?øè6YÙ
Ý¦´G÷·äF7þJ%îjSó4=MÄ²¿NèÕO3¦hQ¯°Cé¥EÓÍì/yA%±á ¢K®4ßqÜq8L3¡Æ%ó5_sazÃ¥VÜJIêy¥îWÓD©îFÖêµ¿ø	£.»Òpà½KUó¬" lÔ%ÉA¤Ê§.ïø T-¡XHic£uhÙ<©WuD²L [C:çÿ£,mÚ}×R-'yzÎLv¥oax=M°"i;MX=}c6<øDhÝ]g_ÂRèxÞ(>oÙóc´YéOæXH!FæÀ UoN4Ërv\ÁêÐù·çÓ÷ù^ÍtvQúC=MµV×puIS¢9{æp^µxÃeù®¨òË8Z@fh<<^ù©ÉR°]jå^UÈÖ/ \Bæ_ìÖcyðr;»zG¾¶]waé0;x·	ÀÇ+æ>©.FñØ5¡½ökþ=M»¯J,°ïUTõ»[xx0ç=MÔb ÝOõç õÄ$ï(¤(é»]y¿§^ñÂù£$js|	= ¬<U-ÓÛeO4¿Ï-
s{ôÞ:D2)ôhÃlð«¦VìòÔ³û= °GE»	¦5]HàÎ9ovIòôTqçüõÚÒìp
InKJïÐ$0åýÑläxÏ´\ÌÏ©< ý³yÈÿ
 )åEn(EýXQg §Ì¶ú"w= Í*Yé$XåöÝXâ¹çv êX´4ÞJûS4Íh[gôV_·=}ì±¹Dw8ÔakQêp!âªê|EIÊíOVÈ=}°~÷>=MnÞxåªüÿäEÑÑ°ÀµA¥Z1ï¿É=}YKËÙNµpsRCß¦»=MvE¶iÊÎêD÷ú¦âÍøTj=}ì©Ø¦ûÅrÎåjËâä×,cdÔz@
-IàÛvÌA¶È'¦#NP»jhlA>Æ= Q?õ[Ú
f±ãØÚe{ Ø/æ®ÈxÎ59Çµ<¾DOYèÏQâkHqVÄ#aU°7ºêáT ._5= F¢ì»ê °ó.:©= Ñ²>XÊód©kÎ³§§ìÇ4w=}Ø= MóùkÝ°I4~)êø¿YVv×W÷ç9·Õp¶ì·ìï_±îbõ[éhË ÓàÊÅ.Ê[íÁ[YFøLæBëñ½C¨;¥*º77_P·Ù{«·³Tàc1~k³ÝöK­¬­JÈ^fUa]Põ-Yª°bV1@Ðä±½ÝÉ*}¶#6EþrÁ	¬¢åí¯c$¾*æcãÎ/hù¯'ý¹ÙüÙN°ZcE^MÇSÓe¬Ðÿì];Ó}¦îWJÈ¼aÿ¶ê!9´X® ÒÚêy9Ã"«ìöõÉ*a*«ØêOº¡$¦÷ßÃÖ-êLET;P=M¶i·Zûñé],ùòÒµç4¸¢jrv¯t7syÖiü¹iµpæ9B,kÆÂ¿èáÁ;a¶Nçé ¦ÌÝN¥äá96dKÑ2i·]¿¸s)ê<!Å Cc×ð :RZRS#J¢¸û%laÝ-rí¸åû-_±}ÀðfTp40ÙB,|ÿn^gbÅÚy®a Ûpl £¹M"WÝõ0#.ß¾eAÏ7ì¤q°>êH-­½= ÷Üü÷-ÕgqZÀÎfQ¤¶£2"i¶-Btm/$ÿ¼àO©Ä:;9Ët'U³AJ-T×ÆÁ¨ïldF~Àb¿yTí[EUsµÚÝª«Ì~p$1ûÓøB|N(ÀM}½ýêPü¹k!ø.­VõYÜ&=M6zÔe ç·gú©º§KûÑGgIrd´îHhÀ¿ó2]^Ñý©W%ñ:Ü]ÛõVÙW«g²J_B~= HZA°I§â]4ç­Iµ¹QGH]ó>ÿG\=MÐù­ëÊryý÷Ç~¼½Ä£" G=M_¬¥YÃ%ôékEqYÍÜD1 ½ÊBêvYêöiYZ7áÒ§2ÐåSQyßeQiµ¼JqóñÊ¬ÓÀuÃ[ ÀÛVj'y^äVþ«àve=MyÎüçÛNÆÓbkÄ»Pí¥x2
ÕzrjüöpzDÞÕTâO¬éPbAyU	ªäìëu ¾¹~<­êÙ§4ö@ESêUPbP
[e[Q= öuÝþ®©mV´¶âF8±nae¶	R³ÃÏAogiQÂÈ#ç,@Ëfóp¼wæåzÃØW<ÝG«geÛÁªQ´GÏlõ.ÒÊMs PYÛÒ;=}úTõ8uq¦®UX !©kÌÌ
÷²õ\Îe	SÉtz.EîßãâYzåRiN	s½m(Gªìu÷íQLiIñÙ´¶°A©] ¶Ud¬·By_´®ºÙ½ª¾µ¾ÌÎQÙ¬Õ§ôjú¾Q]Äg}¶ä³·´åFaÖwÀduiÆúÔxF×z¹B»O×é ñ-£Í,c¯¥ @Ìãj~í2"M,õtçÍÝ"³8.ºQö³V²ÝnÕj©Í7Ø0Õ8$Û­i8½S¸*= ´ªè9Ôªæé)ES×a|¬uöu{HÓëÅ	ó>Uö>¶Ùò´Tx®Õfb¦ UÆÌótHz©$Ú¡y¬Ñ]ÞpÁ	-Ñ^È%¨w³.ÄËXäxR/aR/N5oÉ
aQß§;=MÞÀûqO_Ú¶-Õ*í¿¿¿65_Å\°8ÂÊ¿\WöÚßßGøHàæ à= Ísoä íÉ-úE[ZûE[ZûE[ZûEÎ¯æ5üð¤ íü¬¬ÐUí®HVÀ ±{¹ÛrúdHnksX¬8EÏÌu¨ê½ð<¨Fö×}°S)ª2@Ù4Ô¦yUqðn¹@Õç³Ù@<N-P4pänðw·ÁÀ^½Ê*JK040v½k<î+u.MZ
èdõÄRÿ8.Ì95KÃB_pç*¿ÿuÞ´vlÍ­ñJv?Akx4çEìÅéÇ¥+YË.ó$Mãï,µ5<4?øÚ!!M!úüáiy~ÿh@ñêê(*×»î1põßVVh²òG®»÷¿¯3WÍåïõäbjâ¡%ùGa "ö7©ªüw­¶ªZª
J:æÆâaq 3ôÀ®Ý_e+Íôi^»9C¤7¶6´.Þø+®ö²¸åTÜòY^/E·É¼üMéæ_ýº¿hA7ê[TcAõÖKq	þÅn	8vá¯jL¼Øaß<	NlÄ±Xn§?êXÕÐzÉ{>v_5iQûãWR35ËLTÚv×Eå3>9¢fL_¬Âúº¸¾±jÔ©+|fF°_w70ØlÑ 	-÷¶½ÿ²Ç<Û}üK­YD¥CFxþ=MÛB¥£ÀEmÁÜP(<­æè?ò\aÖ/z= sóñVBê4bSÝLü+i">+NÖ/ \=}òõ»·
óÒj¹é¯¡,é¶,¯eiôö2üÆvg×^þkÏÓ¨Ù¦#i§Î_¾TÓX½£# xï%m,7g%ÊÔS7%ÏÙ}ÂÜ!ÂÆ(3î£êóûvSí©¯É[ãvÜ«~ÍÀÝ¸»ïS8n¢"6°nÙ
DÆÜ)6TkÉ¬\­~=}u[HÞ'#=Mãy£Õ~xfn5éô[Nå-(s"	­>*}Á(\ÅÕ½)kj±dºosÓÕSôÛúM8^w²Ù]ÞK:Âº2#jß0ÞîÚ;îBôÁñjH-.·¥´ÑÚØÁBlÿÚÝþdßnz¶òDDë³³£@ÃÍhØ®0ó!t¡ÄTð»·÷-'>_ìßl£ÂaHxóâÙ)8 yìÎKÔ}Væ:ÒG!KÃü¬<÷cD N§ANØÌXu= oÎ)=}l%o2°¸zj\mTHFÀJGæ*?EB¶ÞÌx~íMmü(îÅ¨9â¿ò8¹Ä"S#®ÄÂ{gôAY2¥áo­"þC£X¨ÁQZoc'Yl¡r§tozYÒÀ;XhX<ÊÄñ¼­£g§yZyÎßß¥úy®+µ½¬O>U{ÚyiJ^Íôe¬ñþõZóÞ|>¶|2ß'¥¸pË÷R·ÌÜ}]Û%¼ûæÛÀ<Ób¼­b×¼n²¼*å6Å£f×CÅË¹|¨ñLµñ/NS
;bXFõA}U+x©¯5,ÏFO©NÖ¬Ü [º]dK|E§?C/Î¼CË8^¸çÆx0­Z5ÜE±n½1a~_0rº-9¦<´µcÈ45¹²pî¼unß²×ü)ÁÞ 
pÞ~ë¤É³¨²rî_m¥·2¨ÛX}]Î­<,-«Z5Eº÷ËRÉFº©3ß_(ÏÒ>R;\£j½lôµnq9­)²\4!Iõ÷×aM«íÒ=M/'Æ/²Gt«eOBÉ'Ò5OØ)MÊHÓ¿t6¶$>»ÈØ.R{ ¨>èl6à÷äA|êtÂ´&ã÷ÆJAÌý8$Ô¦Àp°× [¢é¢çÖ£=MÕá(Kþè¯cQ¥ô'×ìef´â½sðEOãëÔ_Lï{ý"®T= Á0<Øâê=}Ð¨ífjBtýÃlp¹é([ ÂÈeh;¾°xÈclï¨{ÅçÇ¯ñào¦ tm£ÝÃñòèß!8XøLò,ê"ÑÚ]ø*m  ü)¹ñh|j¡ËÃTh:F 9Iö<UF£¯üd×n¤ò¹÷#PÈ1¢n¦ öq³ÃÐR8êºÃQÇÂ¬p ]$ìóA+ò&Ã¹wDe	8´õõ'21/IPsfrÉxÜ(¦ã7EP$Ô×E"uåu´|ª¢§L´¬&ÁÇLÄÅÀÒ¢üd¨!Dÿé4#è½
!,uJÇ"ÄsëÌ<0)¶ªeôÞÖ2\ívOvôªT.j°w2´ÝuBo	#Y¬òÓn'Î,þG3X;¤]ýïâþÊ/ÑQy'ÖMþoYäÀÜýï¡÷þ×_ÐHÅa§YoÂ»YTÐPÎÄÁ²¥#{§.y¾Æªô©¼wÙ³³	³ÓÎÞßo³¨TÎ:ÎWÇK»ïÆY;*Zm;Ý312[xH°\±ÔwÅû$ÒfâÑs #'0¹?*<][qoHØÕ¾ÝBý!eXYÐ.¡çQÚgÑ%NÞ =}Îu7Z¾j[S¥yÓR×ÆåR.E³tÍé<ü¯/<¦}»f6¾ªùwÍÁò·ôSfÅ§öuë¼¿bßÆÄ'¼å}×PJ!Õ|v^Çºký»¬®/³Dó<Ô8Û.ã¹ÕY#9ÕYûÆKÎ Îvùa@ZË/à[ÚhÝ6|¢®kF!y*'k8|©öË¯GÍ=Mk¸¢Ï«x¾·\6°fyNDù¢X®.6THïëM¿§®-
FÇwàV|-Qz]ï¯~T<Fï¿@;ÏðÁ#Æ<©d¸O¹p·8»·ÏLOG=M3ÿ¼¨,ã;¸ßxF= mÄÕnu00Y=MjZ#³WÉ±ôãþG,eÝ(Bp¾	î~Z±H!s_;3NsýVë	9³iÌf03ø~Ï.Ò>tÞºg,'³1CÈ¶ÑTÊ>ðõÖy$Ü¬©d3ñ4cüGs¿½lÍÓ<yÎ)²	súót·¨s³ÙåTi?$3\vpbÖÚJeý¨Æ´uýzJì·r#½ú[MãO¿$ÿ3p¯MôAcæÏei_g´oõ² ­ÛÈxÄà}{]hfm,N$#«ÉFÏ9ÎýL!Õ/±Ì´]Û}X~/<±gsQÁ5ZÝ¾Øÿí9Sk6Ç½[+Ï±c%ïHÅb'´¥r~*HßbÙ7ôÀí¹=MZ'i+pÁÒ/D|ßeÂ6_¥ÕÈ­JÚvÔWß¨¢æWq¤_Ì(ÉL¸jVºWÁÿ}²%{OÔ°= âÚg°ÿPÚ7À%m¶·
!.ù~U
3¥½:Èµ#&ã;^JÂÖW=MÛmf/XÛ>÷¡OZC¢ë^ºçWÿÈc½ pKf(Oägs¦è	¡kÿÊ¶Ö'º²áøsðÓòæÁÙ¬¡pfì¡L?3T£«xDDî%EëI µ+b¹9Kõ¹À©*;¹Á"ÀìeøüugC\ãTd¥Dn %¾îS¡U7ÜÎj-7¼À-dÒ$º]È×CÈI@Qm ¼è­V'ç<ÄQÚaúZÁÃ,Oùi×_&Â[eïVÆÚ«]ôtÅÝ0Q½ï:k&#©£ÿå=}ÞX1ñ= ²ÄÈGöÆ§Â¶vQÈÒÿo½ÃAQTâìçB6ðÖ}ïâÆæCNè,®e@ÂliÈé±s C#ôyK¢Ð®NN¾}ìg¨	øè§fÁ8âßN$À/È4$·.¥,©1nM³¾\æân­ ý±,¼ó^ÀÛPöÎ.xm§uñúçÇI\4ÿ$¨W?yk8·Lo"ILn¦Tuø4D¦@·oøÈd¤"ÏJî¸¤Á¾¦Îl£syÑYþ"{YÐ>ï-Æ¡],â+òP*ñFÂ¸e$xË¡éJ·rpCplý±©hlúÕôì|râµÂôt«'
,Ó3±9yj=M]³°íç³2{fVÉøupnbÉ;nù¸û}aÀÝùØÚã¦yówG"ÞRTzNye¶©9XëE÷pÛë^Ý±GTGÃ4A¶¨&ZKBçÅ Q4îÒòRPN3îô¯Ç Þ#îz[)Gä)ò¤%)Aäµç(	aÐäÆRèËkpäÅ÷§wÆb¨e¾ù9\xkj¨Ïp%M	­Uu³?ê{2Ø*Q_aô·¶+A5e¢é	>s¢ÔiôÑÿPÙ¥î	"tYü±ÃQ ïEûþJ®ÖÓXz§Ú@þ_X$Ò8u ÃAæo3ïEY¬¼¤Uçï6¨£ÕðoÊþ!XD6Ðx\q'Ç5þ³NÒ8Zw'Ê#þ6/YüÂ±ÔrgÆ;þÏY|Ø¤£Ëß}§KXÜÃQ~'ÔOþ=MmÆÜÅQi']ïÕ6þME~Ó¸±¡Àÿoù)o.yY=}
ELYD©<tIuÎÁñs	9Æh¬Uy*yom=Mý=}½ß¯ßß
±®üA,½Å³}µ¬U^Ë.·Ó¹&w-½äs½<Å6]Û4Îö:8Å¦íöhlFøjnõjÞþÑ÷ô
X(D(XC£"YÙ±ÝWÿ$w{%û¯jB}dÞBåKÑ ]÷Q¾>OÑbÂ QÍìQ-Ôà¶[,<6<=M¹
¼þÄF¢é©ëÂi1¥Ãÿköï\Ù5üt¹ NêÉð+ZQ§FPËfIQ¦¦]¡|¾!|Tu±v.UÄÔ%<«W®Ád××¨8®Á>è7ð¡y$¬Æ®5¦R21ü.CáAé÷yb[Rõ÷]\ýØ§ÎÕVÎOÎN.ÉCÇÁ wÒdÝG³Sr»>Zv³k¤W®Õ±­MJ¯ÉÁ6Çz¾R!.1¿÷<+·O]Jë×ÖÁÎ¡áá»ö¯þiu8
+7GOJcwT9ÅLJÓA+®ÔGãNïBúÿ-¹¸þSÖIñD§Þ÷Øßü¹5÷ÆòBëï=MÐ@[¯]y»9vÙ¹æ«C¬eet§ÁÌ5¬T7Cwµ¯nE?Ú7©L !{þ{­.st±8 Üö¦¥L<Õ2ÙËRÕ+þØMk=}­nEÑRû¸½-HÈöv©MCsVáI¸n­åLÙÙÌÓw6]= #É+8ª>_GeÝoçñ¸øÝ£ö|CcÆ?@æ/y#>·9Ókßx{ÓMVO«=}6¼Y5®^¤ÿA}Ôlÿ]®<­?j½O8z©[vÍÊÛeIÍÝ¦n8ÝDk/µÏ?ÌÒÓæÎï7HFÖ"çC9¤²þ¶0nÃZqËíYÊÉ(ót¨2y¶é5	Wmúµ³·ézÕtöeyÈ°ÓÙÔÔGOúó¸g&>´ê#¥hu-Y´ÔÕã¨R UØí^·f0y¸l*/ï'ëÚ]´rüd¶ÔÖíµ¸±|³ÖÄörÔÊPúÀÇ(Ý1.ßT= %û
ãZºcºX²¬TOÊÅ#ç]	­£oZû-9áDJv}ù'#pG' EÍê¿þóÈ§:l®/soÁTO
)|3Öwù4Nö	[¬ímqÄ?ô%óC¨9=Mn§³ÙäR+Û¿rIQ!
-~|.Þæyô2y%yËRÈÈØ<Ê²Á©Z­ù= ¬L÷2¶RJ<$ë=MÀj4S	Ñëv15ÄR
é8!îYÔ¤æ©Ê©Þ©
zfô§·23Ú:CÍì¸ Ý=}r¹*·¹,á=}{IM­öÒZuF½¼&í³×ýÄAÉº%>	É­âZýgÏ:(¶%T¿º[ýU=MçH3­!J^_hn6ö³_ïs£òJ1*g«H¡~RúÅè-9]tN&§I)ºéZû_rÆ'~¤IÔìíë.ßËSnÂ¼¯sØâl(æ£q´Öy;>-ÄÈúMÎW}|lOpf¡_ Ï%É¼J­»4^gÒ4Ï2ÒJ7/êï¨6Þ×Z$&RoIbÀé}ÊY"~/r±«Î
ÊÉ^.ÞÇÙê>3Àí=}w[+E¾±)Ù×Ô<ÁãÉ
]ªÈªGzÖe^_z¿ ÛùËÞÆ¾ÉCJZE0#ÏlJ®nôÛßkaÕNPãÅzÞ#ûÉ¥ÿúHÝw"M{H}]½ö0w#¹mH0wVrU°Ñ
E}Tê=}T¢{jZÈÚðáªjä8Mg¨ÝRøA¾ëýçZÁeFýrguâVô ¬:ñågõAdÈò|1&3iæ¹ <âO;5h*5±¯6íJ¸GîòU¶ Ø£úFi_gAKeqçÀMíÝºØKc¢"ýløk²â=}îÈío}­$ï3ÊaùÔ!Çf¸ïÚ(µ ¹êã<7¤É%f8b]ñ.ûW&ß¦tYø9Câ¨Ø´÷:ñÝðÜÿòbÚCº£ÞÓû= ë·ç ræB üæARÉ Hyï¦Úb¡ØNäJËg+­ôwöyB,	j3­09Gf»gÏÍ0øä{C¾SÑ Ö9ëìó:Ô= úÛ9[õ~8.Jmç_Ñªæÿ¾¹@-=MÄO¹"cÓñí'ÊF[|6ýfrA¨Møæy"l\¤Á0øn\ç¼½Î= {ÊnÀnHSdEdóìþÁâFÀ¹·ù]Ó|1¾ÆlÖ(÷TS¡Y/7ìÊj	Ý½= JQcµñdo$óiñQ leüüJS} Ø£ýbÉJbu0íxZûpê½^~Ô#^çÐ zs.M×$q ëÎq>¨Çe%"O8MÒf½ûñAQUXÿ>Æã§úÿîÐ¥¦R?XËl"!²Ì[ê!n^½ÀgÒ^èëúmÃ1ËoiÞ¸Þ°ÿKLã@s÷= YâðÆæ[¦@(·øè¢¦B©©îÓC¦Å¦Ôþþ/§£ÕÉXXº, %óÒÍä ªïd±w TåA±º t_ï"î÷lU¡ðÜè¦ùQèT¶f ÃKèî,$M¾$\ñ!¢)¨:é~¯ÔßC8ü ÃjbÜµM»Î?»N|M½M»M»MûÃµgM¡ønÖA3~Õ¶¶x3'±GôK÷&QØ]ôê±<øõ­ÑË±vnAfæ¿~ø>k-¯8î¬m°k8Ò¶lCö§»Q|¬ò/{ÑÈÇ¥3Ì9*â*aóÈyqúMó9q÷óù}i7)|w¤h')|Ce5'Ùµºµqzþw7oW~<Ô$µ= ¿ Ámæ>]zq"NE¶øØ²(±Rø-¬=}@ÂÜýókÒ{©¿«,ÑF>~³ev-qt¿HËë³+:üCE²I.9	t¢¦uZJM´:BÃ¦-û¹©¾ª®¹®V3cdî
îFQÙ~ã?V7zÏWAsÇw}+ÅB,=M÷Õ®/TÁÀBÃ÷Óê½¡- Ró¤­»ëNªÝUsbg9<ÎÏA»
ïZhÓÀÅCïuew<+ËÅÙ77jØÐÖ­ÉCÕDÿ=}VÙ8Ð §Ü^4Ö}A¹^þÍ×sÌiÉâTô Éò ¦÷À­Äàå_ ¥áöê²QpôÑ!Ä(pScì¹û ½ fß0hâí#ìmêüBÀtðehß¿d¨y¬A¶ï,EÅß¬ÄÕAò.eYÚ,Dòë(¼	±s¤s$$ÉòÃ¶+Lß=d{ÏòKª<
,"/yyÝE-uù:ÆÝáyB·DRvq,%NeáÅõæ6È¸-Á!bÔÿÿ0\¢Õêï	xÈ~	tÙ	c*"
ED#Å0Gué
£½
ÚÃ4ª¬3y6Å¡þu/5¾2É×2ÅÇWuvIÂRKÑz¦ÎW°¨ðq¦Q©ÁËÑXt&ÙÉú­öK4>ÑFw¦= CúJt±Èe&É¯ú/ÞJÉåRêôñH2#pq@3!mb1]å[säMb­^!8óÄùx&Ð\jÀ<!¥bÜKåoè¦ÌñÄ0/ëî<ò	XÙ PÎ@Ò!cbcß[2&èoKdmø!	þF¹è÷ÞÑ=}¯à eáôeM»¸NM»V½L»M»M»U¦\«¯ÉÁÏK3Hî]þ(!@zÕÛ89J:ûË:éú9=Mz9Ó:9Û»99[9[:íÛ:ç:Ëf°õPÃ*sÁ3[æ-»º¯:°Ê¤
|f<©ýK¬kv½H¸Bí¼F=}¼A¥º-£ÎÅ®Ý6c6ß£6×6ÝÃ6s|_zþCÕG}?DÝEË¨õÆIÈ%·ðTTu;¼Q{v³³9Ï³ÁïÈÁg6Ç'ÔÑC|Û´
"?ZNåoC}=}Öuõf¶¾bZÔVPZ[öÖÍ]ò¥HÏ¨ÐqYd¡{Â ò±ÁÍïqHÑ*xjh%sw¡àL¦$«SáæC	nÀñb²½Ñpþe1ý=M±ã£õëæ»QàPþ7QûïÐä¯ÑúOÑáÿÑù?^Í\àÞ_ÝàzàEß¬èXfë/ª¡ÉÎ×| [Ê â:âl,ÄÃµ§àD÷fuH+ §HçÄcI<t¬æ!u«IÍ¿XÕ¢åBñf^ý1ö
é
$¥2,AÚ/P¯_Ågz pßyx01k&Yä¡ã@=}éàä CM»ÑVK»M»M»M»}ù¡²;²èõ^hÂå¡3(~<üÓó¬le%ßÀm² âçno£¸3ðësö|«Q
D=Mlÿë¨<ã-ó×NÊ$Oë©Ï7Àì&'Ï×ÞdÉ±ðÑç2À½c÷ôP!õ3l7÷WÏùA1ùn¿&Nò,=}ÈjjÇØÁÖ Üªî§}ØøxÂ@IúîïªaÕÆ"Ø8f?qµÈ8¼h(Õ,Èá/Þ-«9ßUàrç£Cø§zmD¶øÎ1ÿ¯«ºs¥\
_X­<ÊLÎÉx'ÝkHXF	ï¨*ÜJÞy~3þNÂi P¹|Mw¸©Öô ²z£[U|/$Õüí·>ÂÔ<×Û«¾Åç|ËÚdv¿?ÒÄûÞ:Öa£ÐÚÏXÕs¯^3Ô,¤%¤Ò1r_ù+UYÓ5XM:5)c'JÒ~îgÈQBá«mØE	~y£®rY-¶t= ý»$î<tÊ¤Ék=}yÒ­}§	©grz^Ø7 ÿäSH:gÍo@lWôoo#6Qo+ê]x®,v~­*%þßÚ>¨e3*¨l¦÷
¹¹;­¡ÆU,½¨3ß0¦mÝä¡ã@õàà ¡L»­ßM[£L»mLC6~M»Wzêýbåf5bÄ«Ý¹ÔJà
ÓæAMøc<lÎO£±¾rßaø]ì=M¦PÀX.ÀR³$¨-F$Õôv*/C&ÕTjÄF¿k.µüþïékÙ¼ypµ!k(¾dÝ¿wBQ]AUP:¥}YKH[ö«ËÑN¾ t£NAßß\³¾®E¹{@{ÚZvÍ¡Þ×>lÖV§!¶üBßñâÿC²Äó|)©k³Qv¬1ÇpRáM+ø=}¢Ù·H®½·m­<9$9[Ã%ñÖöÇ´#)Ús&M'¨Ó<áÛXv'@@Ó=  ço¦¶úäN²º:ûéCýJË85o¥ªÚu@tiB&¨kø³D¢õ3d¬Ø L®G1ëbqtBFïL°EyaýÛ=MÌ¡±a)¾nÜèUÂ¦3Gò=Mµu]NüVG%çÅ°Ë-§Zÿ.üÔ%ÕÿÞhÈç°=Mp·!-è&ä¿~0ÜgbÇY÷¥<«HN$¤pô«zön[¢Ûí/¹TÉù:¯ÑÖZa«wwh7BÔøë¾Ò7Äý6ÏÉXÙaØro¨-Ü,Ù~LuÛª5¯O|*Þ®´¾ÿ¤+@0n)j/Æ.Oê³Áu.ì6ß¯Dµ?T~ÜmÑÿ&\Þ«^ß*ö»´	Yqc0[q»ÓÙ: ÔË"$[k¿7¢î2vO"åÍ7
1×zrÕµÑ~ÖÑmÌµ¤ÉF6p\ía3jýNËBgIÑ9Ôìî= 9èà­þÖG»¾pM·vM¹MÇzM»ç¡¤á¬êú= ¾½a¼}èÛ!Ìx}sgÀødç/fBSøSÂfX|k'Ð?Æèö
n¤L£~uo¢­@×l!SìÆ®"|¬+Añºâ$(]j¸âá>9â´§=}lVª=}ß#ÆÊx~wQÃñu{ Ðó¿ñ1w)¬ryl¶t	<,ybrº4ä±@û_/Ý¹ìr7®D)­,êüF±{ëÇWîÛlÇòUZþVÃÆs}ºëSTökp(8¤ö­¥Hþ9b@	[rvÂlËwÓZ¢ê
7ÀAr+¸GÃª7­Eí_ÿ%WÍb··_ÓÅPNß&ªä{è¯¸$¥F´NLÁ±jOE+ FaÔQ
(ð3
¡0/)?+ÑDÇVü%W
Gç¢nÁÉbVCg LS¼«xÇÛ8CöCï ;X= ·~ç	ÜPèÃ£g}QdÞÚçü¥>Ëø-7oÖäf}¤ÃÂxÔÞr'¯ÐSÏ±i+ÅÌ~}§F¿åÊF<$Õ×AAUyÉ0YÈ
ãÇ« »c8¢N·W}²ëè<_sRq;|e8ÐMz½Á¦kÔÿ'¡²ÛlþÑ= ×¥ï¸Ìßð,þÒÂ.[Å3Fè#Úù;¶Áå/Ä>²Ójð·®Z£²aOiXkS ò¿Å³ç:7^Äaµ'&oÝ$ÄÇ/_¢)Öñ¹ÝeG°È¶?§iïR<Ht#1&~4YÍ1 Âwâ/w	N¨B¶ªQ3é§ªèêtb$ê£2Í*ÝLäæJüûn·çUvóY3c¯ú(ÿ³Ä0wJÁ%®\MVyJó°Áqbî[Uð]«¨*=}F>²Ã8þ6ÛÕùóoÖ&ã¶Yø°¯pø3#â¥l(4G2lIF¦-óÜÒ-VºtuÑl»M¦_ÞF»@®EïS<÷8¶²âiv²KõV0ÌÂË3KìKéN£âûN(»rsD«ãVèg¹ñNoÙ/[t¶ÂÆ= Íâ'2üyµi7Ú.´jÓ"¥yi£<hÛÈb)ëÏ~Ò±u¯W½W×kÓ¼1uÖ@0çÊ'9þÃ)±N|c0ð×Æ¥OO¾NÐ!·§çßõÔØRDÿ^^{ÕmÿF¿Ù#íóÖã3­ÿ\öÚ©ûÅ¨íßeµ·?¤íÜm°g¿<ÈÙ­7_8¹ÞçÏ_¹µÔwªçßÝ§µÞÔGÒmàd+ãð¨äp=}wbXqû¤oS¡ì¯ê&Ö,èiIÌù**RWnezø&ÐÁP¦eSÌ@ä«Bør±1qèÍmB:$ôûW'Sú}e¤['ObC©wjÃP0ü1rÑüíl(aïáé¬w(£ñ=}Ñ®Ù4yÁÞ©4s"¶ôr(Ù?
Y±ÔíñÑT¶Ù~a_æyÂy¬ì¨Ä$öÁá9¬w¬&{©üþæÅ0u«£À<Çòr§Ì}ÙädÆàÁÐâÞÎÄ)$«×ö1ÿ9d¿B$÷SØ éSC+È8*V<	ßîwA{0fÚ±R¾uÓÀXå	õ<9iTºß=}¥l
+7Sz§ÇJX3cºe:¬ÓJÑ4'(!ý97ÊIGtLãS*ûÀZ²Åm¹d6EóN{iNÌNëcË:xÑu=Mí|Z´¦£t~Cµ²®oGý¤U0Ôsvn.fÎBLW÷³¿V{õÏ[8»¿£Úoý¸§ª¯]ü¼¯ÝÜoAPà,$áàÈ|G»ÖRw\»¦¹M»M®M;ï^Û°{ï·ÙÐU= tÕÐE¼î?ÜcÜØ§ÎgÿÙÜÈÐÇ£ÿUO_æÌÖÇ|= "7àÚäI/àÞÂ Î ÖíDp'Â bØ?ðýËbxñ* ^â\âB"ÒeÛë¡¤õAöAÈ"Îõqõó>=MÆEË¤v(ø<Á×^ò*Êó+9Ív²tâot³ù=}êÚ¨ÐÌvÑxn@Ôê&x>!Ø¸#HºdS»#äd¥òª«f¬l¦¢gA»ô&³WAl²g]UË¢Õ
|kzènÀ¤èVk@r!­ÙG9ª'q=MmB]zlÕNôêÙÝßH~­n«ÕHÜCÈÐGìW¦ÐÅ¥øv¤Øv¦§Â4ÛBÃXÛUüùÂÀPüg¥ÓÝÑ\ ~ºXäÂüéÈ~ ÚéTÔ)$I(ÄR$Z)ÙYÓÅ)t-B¶Ï±y]ßóyÿeÕPZ,ê×oÐuRM 
U~4Fè²HF-#±m»û²øÙ
í
}}­²:|®nÉtÇEÔì-©Ø<æß¥GÊË,¶ì­DÏ,nj@¯BC·N¬É´ªLþ©F¢bLTÑFÆÐ©Ìøw#±ÑüZeÇRwÐxÇÒ·Û<ºHÓÈ¼o¶kÓØÝVþfÌ\ÅÃùw/»CÙfõàY¯âÆN ÔUáß	ê9ºpSêi2(%Rñ¦Ok°ï=M ;dx3ô-ÎE¥¼3,ÛÌò¾Ý2"Ãü4"tMlÎ8ªº5Xÿtl-wY<ù-nt1Ç|®ý«é95®= ÛÅ®À{?xbSç
ðjÄ{ÄÄqs$nÀ|³ê]À¡êþÍ2°Åb×*Õû
¹#)È9n(õí4TÉ»úõ­ÿØ'-Ò¯J.î7³.-lfQJí&úÊ¯°ÆfA:ò}:ªJ1·r]++ nÝ?ÉÈµ/'±öý{Éö6À*ä
Õ6²µ7¯~ÕÔ¬{GÈ1_kíÄ@À(ãíGûXR¦ A³æAM¡ðú<bn±&ºmÜ±±hZq÷7m¬hAéÙRóc{ñO&6KkùÕR·­d§;0MALë¦öî<0óCE«jõ»"m8ÉöN{µ&£vMä~$B§ÃIH'¹®cVîÙX?Á ÆçÑýèWÐ¼¡<]ÇÄFÿÕ¶Q«)Ibk5SB¾§/xQ³2Ç&9¯­eNz[¼ZÉÆÛ
ö\;¥­>5dÕ:õÑ1µ4ÃM:ÝaÁP= B
àà@M»V=}VÍÏE»M»M»=}ïçæ­O-S9ßÇ«AíGf¡ÄY²f"9TDLÃ%;ýFËP|´ÑÆ{îx~«F¥ÚËé±Ä~i	ìlJ éù¶ ³}ææpqíl|±lAÆñøIv¯$yv^T^éÃIóyH=}¤¬òy÷¬D;B¬Y^y©8¼¢eÉ´:JÁ°Yëµ^9x0¬ªõcu$Ä8L»995¨¦ ¶jTJm\§MTÛ@C'Noû»Ù¹Ù¥®VöÃªÈÀ;-ç]"î>mP°Hcáý/ÌD[IË­.¦×TÂ:ÈÕ)k	z«¥¸æÎkRoS1OkÆW<´.Ê;ù·-NæWWsC~{)'¼\[ÅQFï½JZxÌ×]g¯[¨Ñµ£Î>:Ô7ÐrGw°æCZ9Ü««bbfÕA3\þÇCÙÿÅÛxÝ»§§b^
ÕÃpÝ¤¦ØÑLÐ3ÛjdÜ­ûIcàgá*ïë°CE= UGâ|]ÿÀ*v gçyÉêÂÊýÁ Ãîä)Ñhp¤zrNêÑ9ëÑILh;Ë#øÜ$ÂÌA&¶èÓ³ù¦¼¬¤9AVÍîSÊ.x£_£	ð¾ "a0dÍã´:øA±¡èÿ&j(ô/Ã(trc:øEÊ¡ÿ&9z&Ê"ÌíBlì¤8¶¦zFÎn±Þ6lÒC<©	ðP«0 iâ{¶ë|PÆ ´*jIÒ²I _¯Ýß%&¾ð¹Þ5ÄLöiõÈf
òÕg)¼?Îw[;Öïi¹D65rs¹«ÿ³]a,Åw«ä«<ª0l"wFêk#êZÌ~T"×ê5¼(Æ3;#åª-EÇ0uÓ5NÎ4^9EÞ;u@*m´eÆ¶±¨M³È¿6ÃÜmtëªÌ´Q)ÌKm©Â<ª÷G(ÕåíQvhQÞ,î0V1à¼mM»=}M»XVWL»M»ÍDð;ßz§u\b;A³Fe[õ¾îÙWei5¶Ç6É=})1u¥z*1
cö<¼òÓb*~ÇJhuÜ)òÄ±=}1C"ëmâj¦AúYÇJl¹QÅ&Ôçú9IÄiss®×ÂgËÈø}Tò¦É¤<³E®zS×þgNÈÜ÷¯À#ck¥íF¶µ¡ÀImX¯ÒFcQ§íî¿XüNðÖ©³Ä§S{,	O2q)$7sÞ~©Í÷zL¼BòV¼ÙMs¼Aßûs8dE¸8²]MkOM=MæöÏç;|FGe¥=}öÿ®8Ü_¿ÂGd¥sßL¹DAf-¹6K[»¤rm¦»l<@Z­#;»¬]B]	ò­Á1çq½Jéç£ÍÆîZTUý¦mT8³AÙ*gÉýlsîÅO\^ÁÇk#øËr©ÎB÷S¹?¥ÅCCwô}=}RÉç}Èò¿E§w[=}ò}Q9R««+w)=}¢Zt,ÂFÒx1 C-oíöÔø¸½~ÅñGh§ÖiþíÆ[¼<Ã1_w§ÃþZ´]Ä ¼C¡o°?,Õ©\ÆFÖQëØ4	ËÓf¯uÙ|É÷ªaÿB¡Çµ÷Ú¨kWÚLÊÇBÈß¯Äw=}ÚÄÚËS. = ôáiä,­ÿðT áÛúäÜMý0[ Sì0'æTyò0S^ f5á¯äÖã
êSÿPßE mïá+^å$¤ðÄ-Hu6ÀE÷lø3: è¶óôOØµ1Øº?TÀß©âMnÀÒ2!Õb~äëîê.|òèXÓ4P,Ï@²ÿ!Óxräi3)zGv¨=MÉ9$Rl*õ©r7-»*:Vu¨rvDt¬þù.²Gz²)ÌErÃK¶6)jrU'¥®(=}vD=MùÚ(RÛK³÷©t¿ßøçl h¶û»_L»Í½iM»M»MSÔîÝH|ßÔßm£±lµQ=MÜ1q sQq1rfqÑ9ûù£úÛ[ûOçúq'ø¦ù9ø¹FùI÷øvù?.NOÎÞLLA4GLTùÐ×l/lmìÏcÖ÷®¹O}(¥ßPÔrnyc³áP.Ç¿\®©".ßÂ.f®Ùê.Ë®¢9Çg¦nWNVêTP©Yºµ)¿«I³¯y¨¬YªÙCóSsHsPóCÓ»BÇ¥ÇÈ
GÆ¥Í ³y·	Voã.±®äÓ.Â«ÁÍ¢=M»=}ÇÆãÛóGØSÇ²¶Ê'G¸÷BÓ·Â¦WÂ$¤?%b$j#ß/l'ñ¿%÷×Bj½Q¤dØ1qXq<,JõFð«iòd¹dÅì_ÑC!±X644	vò±«jVÅ¥¾jÂ¿
Bf>ÀÊjÕ%f"m£Y3YÐºO=Mîõç»çý¥Z÷SiA=}$»NTïqwØo¼7lÎÿXæj(cã×ð±[x("<ý	ZmöÑ¦jMÃ$Ùé¡×¤ÀIØ\È-\#¸,ÑD6¨H®õIÇkë¤ËeÄBGiX4Ä;fð7jß6k2K"Ö¡Ó= ?LôYiæ{%=MB¶¶P-|¸NÎð¯Wj/»ã81à= Á¹A&zm¬&xùG¬M»Mû¯ÑEÓ5?þÆß¼§ZÊ3-7;Ð¼>xgèÏ_×·®8K¾Þ¶SvZSëO+I®¼ØD®¯Ö7ÙÊÏÎ²6áL·[Ýß2~EÐÿÓI²É+§6{ÿ°Úyÿ7Ë´5I&,«?zdJI·?¯n1zma¼ÚïI¯Ã-UÍµä±"¿>©ÊHÃ®= ]d0/Ïþ§ùI[oÆð_pBOÆ±4¶¡ÛoÜ8zl|Åë94µ¦jõ|Àåñôµ¨K²n¬BãY¤/òw7}ù¤XÆ~ã<ÀáÏÙ'ìyôµ«1uæýÈ§è&y¹¬GË¸ªNîR|<ÂWX 3>Òfï\ÆØ£_âélèhvò(iD2(íT\¨àÿ°Óá £¯qgMGãsàLßBhëw¨¡0É×|\Êy Ôâ:ãlÃÄµLàrE÷©vò+1©H>Åcý>tÅ®= x«5Ñ¿"Õ^¥åÎEñCbý¯ú
$þ¬2m4AÓ8P>¹_ÃÊgòp xI9r/ä¡ã Héôå L»=}Ï~M»ÜmL»M»M[~©Z|¡ÔLõ;1µlpG6º¯øÉ-,ÛêÓ"Î¬&2X>h8^rußÅ¿7e*ÌC#³G.²\Ï5:Yg¿_%f²ËDÛØìÉI<ªi»DÖp¶&~rÉý=MÓsÃ.7i¼rõ#­b®§²$r±.m¶j­/*(5r¤eËÈþGÝ¦¿!
ÄÙÆðm½üÈùzð9¿«Ë4#_ß]$¾Ae½çüP²À¦çü\>ð !öº¤Àµ
icNù¨-©CS?éJÈY1óßÉ $ÿjc&Ø<¥ì}¤\iíp_á_¿[ùx[í¿åaÎW¡×­gûÛäw 7â¿ É[^ÙÄ^g*Ñ?øÛÿ[ÓüÎ+<¢ë7Q0Wóÿ¾eN«ãÐ´"YÍó\½ÐìµMðýgÕï}Æfú]ï\Ý÷ªßÓáwÿÓâýd0äÿî­qX6úm2vTq= §¸Õ 7ýñµ~í5Hõ= CèÙ?uÂ½Rù7Aæ\ÕPK$PëÞRK£h4,#Ñ}Aÿþ= ÙÇ£x8ø¥ßó³y¦)Ãä@5EùéXÑ©æm©Í=}ÌGý@Ê¦#8.ébç  àààb¹M{M»ÍF»M»M»¾ýëfîÂºË¡Ü(ùbÈÞAÜù®Ý9jr±h_þ«´Q¨z =}®$V¿|¬§Ô	=}fNÆTtÎ®Ä3ÑXgÚv¨è¬GªØehÈ_Ýòvä=MÅÂÕÅ;¡+Ñ5<>fõÞK	þí¬¼dÂ±=M5OEoªV¾Ï»iTµôÀÏi<Îº§ãX¤Ñ'Ð/ª\eÃ[òkc¢´>À¹¼+¬lÝ5nÜn³{l|S{CWXõXoOÊïXÙÞñg/AÈG¸ì^á%Qì^­Ó<pY¯¯ÿqÓù¡Ã?ÕkvÜJªONîß+\·UÜG;kàûå?¤iA¶i>træz¥·¡hþ)lç)IìnóD93î%Òô1@­î%~ÿ6"Õb×4hX*¬?bÅ´° ¬9s+Á:,¬±1ggÕH9¯¯}æ<Ä¦ûü¥mÉAG	¯Ò­ðÍ'MÊÛpZH­ñûî;¸
¶n= [>¬RD°!>,¹eï¤4Kzç·îYÒ¡ë]OüÂ]PøÈgÞF_ÞíÀF óÂbèøò¢c½^ìÃ5%¥ñüzÿe²­Hr4Cø|ü«)ÑLp æe$Æ±ehhH}Èy<]u%CRp|'LCë¸h#jò0¢éE,?.q]åÚcUzBÓú>×´2X~öíHìHÓZü;8mí¯º9ù´¡Øå=}ôßÉ¦gÔ±/ðà&áààô=}M»Æ/·M»{M»M[ÁF»¾ÛX,d}\VÊ£ª;]ÿñÝøÕZæ@|= Iúãù^XðO$æSªCv/fÐR¾0<³gÒ(Eø:gf¿è®ÛmÄÍ(7mÂQÙyoÒ¦øo#vèÕQì~= ±ó/x= Ü$¬o,BÝÐ©Ln{l¼ôlo.EÀIÄ-CÊTz¯®@­tyÄG®DÑ¬Î®¦]Éüµ®As§<¬#!ëÐ)9 o®"\N\ÙBô{÷Cõd-+¹VNùNSvC<|Þ¨p8©¢yzÉiè8#qÜ:<=}§×õËÉÈ:/E¢æ.úMDÉ-\¸ysÐ\ë³â5EûQ×síno¹¡nrýøÛÏÄcº"ÿÏÆw@ïÎ³ä<IôÐ^Ý=M%ùØSÿ?ÏÇÎ¦ãdlh*µ!Þ%ÿ"¾Â>oPÎÆ1þÌ&ÅlÃôUþÇ$Æé6Ú}Äg¾	$~ÆË¾Uö±ÇØ·ßÉÇù[an÷±0¤½ïwZe«bÜ:RmÉÅv¹°j)g£=MrOÅÇýÞk¨¹[øÎo³²ç{Øp]ÿ4ÝhgùoQkZ¢+oøyCÊS®ÜZaÐÅ+òNBÃ·lòÁÂÚ,<Øî¡Ä×ÄïÝ #·ç¾¶]Ä!±Â²CrÐe²°øY_ºÑK.ß ÁçOïÝÄQ¤/TÖÜ/ÀlÝÆc·OhqÌ¦©µÂìUðCyäëLp8©L+)Ê÷(±I¥nÙ²Xy*ÓH~ìG,EX/vD39N¯wCeü÷ªÓ 2~Ô¥êÜ1À®R%r:iS*,º¬(OEVL7¡0åa uq¦³$ª/C 4'ÆæÖÙúìZiVu>KQ-ë½Ïºìýcs|îêÃTµ±FnþÕ8&ù¾ÚhÎ º= Mìù|A¨h&ü¢Ç}%,ð¨xPI	væ;B&ù¢ýÆh¤xSÝå-öäµrN~mFaU+MÈÏE£1;ò2LñA§«J´¸3´aOºîèö³³q7Û|(ßË¤g®üMRÆbë:ó<ùEÁjÏ&ì½ÐÀ.ßRW[ øÁ©:#/Ñ¢´kÇù6Æ­LùÅkqiLÔCTlÿsÙS¾ià>,ëÄx3 %c)ïB±k@²çdðû"Îz0¶&eÂS=Ml×-Apë'Q>äõñ\õ©~Ò(Øõ¥s±$ÓÈPì;êC¸Öv·óÃ¨UlÃÇ¡X®õ¤SÓKâfsòùÇrhÏq+rÚu,µlôÎ[ÁL
ltß£¥_ñfß%Î¶>×Ü#1Ï;d¼ÞDº»æm+GSnG°ã_,ÌwEqôs¥'¹ì©ÁeUîîÆ5v+Tþ¯wÆ
Y/êðSg"¶hRµB¦MÁyd/ä®£=Ml»ÅLþ4!-å2§
Ù:?iy&õ;q«Æh8íw´Röß·Uü|2¯ Z:ÎU8|ûI¿dKWó&Æ­äýIALCëzüõm3ÍøNË@6Aç©R}OÈkQ2½¨ÉA+&ïìcã üààà»MÛ»Í¹M¹M»ï#ä,~@ÓáOb%è~¢z7dhRFzc?krò
f¿lßõ<|¤ß>ü×é¶¯u ÌäÿB¹0r¿ùs¥ÌE2üÚe$ÙK#6ìª5.vqÏt;-nR|g]:ÅÙQ*~Ñöê°7áÑêT2ÄÚP%~½7$©/iØ©*YdZÆÃÛ#y×	
Ì?¢R	5võG
´PK4CÂéD´y¶/}= ûÊÜT·ÀÜíÖ°À@×ÆKÑ+sì=Mî×Hñ­¥
MÚþ¶¨$ç½¨=}·!½#÷×é´¶E0ï³Z¬÷µ§ çÕ9M = ã:ø°·©pYíÚ¼ð(¦".´xÙå¦¤Î&9¯d÷}¼B¢W3¤yÂÛ¾tAéF<C&e¿­9X¼|BKëg9@Ù¤â»P+¢÷;²F¥Blî8¥¤úsá¶üG-¿ ûòÆ»À	¥°v]û»ýR×ÍÈêÇ×â[k Q ÙpãO¬ýY¤q·/ü1hRLeóóD}Ù<Ã,ÝIGÞHëåÿ<P)U%Gk:ºN¸UqV«m©ÓBÉBþ<ÓÁxçÚV~¼ýÃ©W~+ÑBµöîËXÓ^×yúÊc´ÿ¦¨ÚB3Ï«­ÓÔÐÏìú_Û±9Ä¯t£Þüé ILàÿâsîÅ!¬p­cãÉÓpÌØ Bæqý,#@ÆèÆIDèK"¸új/G÷Ogl¨õAxe´önÊ­PLc¨8ö¡ìe(¾$rSr{!1k"'1¨µ6Nêùÿò­Èõ±¬1nA_'ìÏ¤ lhEµz8,Â8³n¸'QèBÃ~¥Zé,ùt ¬wéL,)ÄÞ®$,­sÈü}¤Ý/)ôÄÓÞP³ü3(zvbq õq4~/%ÀwfÁÂòô²y²~®{ÉÄè¹s!^º#Øs%99ìx%OgLf.«F(îwKR°r#S07Ærq§»^Y,^q'<:ÛÒÙN; 	å\ðô7;h·µ""jè}Bvï¦Ý=}÷R*ø\ä;	¦Ó*qs#ìÍgEØt³|ý6õH,@pò*=}¤j¯5ÌF®ÈJ¦\F\Yí+¶P
ö©Ëµ^Xý?Ê8<2o¯ÙZÎ³ ¬µítËòñ×mXuñSiF6MÆ^ëi:¸Óe= ª6®>IíË-MMÇ¸dVê8·°¡f£áê§±Â{K¹¶ÊÕ­ÕYy«VM¿»M»­_§ÔãÄG6_¢¦ÄóßÜÛùÉ¯ÙÑ¶7PÁëÃ¤2Dßu y¿P2Üf+ß¢ÿ]ßo*P bÂr,	©))T"ÈqD»:	Ôÿ(pÂ9~ôóYP$z6)Iãyµ	-°*ùþ¼uAì9¹ÈosÅ®9(¨©?v~V9
7¨q['nóÒÅù¯ÀYF(ª þÑ.Y¬7	0R/a%âå>Æ	ð1q%§ô1r18qj3Â¥Cf=Mu°
6BÍTE.¬ÆEºguÑ¾bÄ+õ:e©Ó5ù*{v
í)Ý&¯NÞØfhú;µX<ýÝÊxÓ?~ÇI !o|æG£Ðù´ TkùÏi&$P¥>=}=Mª3pß;{­çIØm-= o_ÜUÜ#yîAE¸­¶%ß
zÉÚgþf[ÕPÜ'tþ5}ZÜ6ÿ§Ú¶§,¶¹æLD= váu©æÌÝ«ðÝf,q$°p[íq¾@¤¯lB=}ñ)¦N¬,ãCÂmqøO¢CÜO"*débñóhyRÑ}	,9¶BªõF,ß£öF¬CÑá»êÀEjàÝe$ýô²D=}p÷c"zÓÓûS®yÃ¼D®«=MXY¯bSë.v8ð«r]wiµÄLzõß:ÑÁhõ3ÅÐmÂÆõÃV:óÙ¡zO¾¶ÌÊÆk»@IG£wJûjºËf=M«,LyqO«_³ÌØÓ|ý_I¸¹n_»ÖpgDÌ÷NoÂhþüÛÀ 4ÿç.U®qn¬STÄ9}1k}ðÃdd°iºB®®VÒBZ®ØDUë=}Â"AëÞPE¼á7<<øÆª/XÌPÃÁ'öÙ1µÅf£æW¾PÇ= kz¼É:Î!Æãï\Ô ]a2ÙDÊ©g¢ÿ³ë©+>ÊZAvÉeÇ$O2.Y³Ê­¤O¤ÞÖÁÁAÿlÅ\¨hÒA¼|ºÃk®W?*b]9ÄkdxÿYÿÜ¸ÌËg>ÿ#ûÝßªL_îÚó= }/âèVè@O]ài+ãRp 
ãyú$Ð­ NêbØèÏ¡¼ö¬@Ób±xþ¢yk,·íäw)(|éÅ&Ë2#ùlÃAÄgñvðf«?Áèïgÿn&,J%â=}ÉèäññÝô)ÐÎ('²øò©ÿqÝn]iÂ5@ôFã1OoFÔ#{ÝY¾ûm³vøz¿¦¡f/=}$OlEªË8þX¤ò¼þ«ÕQ^ñ'Kü;;Ã;ó¯¯ÂYÇü/M3·6p~ é§äòûòqÔ'i</qw«rØÙAòZ)-N)×ÎÓ{-Öµ©|:|"ß½ô2?u¢Ïk2ésªK«4¶4²zf³Í~;mqåÉ¤¿*'¿}gÅÉÌ<p¡;ùêh=M« :ó{yòFRsM9h¾¬Bbk²ÆG3[{ò!Y¹D­¯Ã&îybüR*Sz+Åm<zåÔwÆÒ(þOÆ2x§ÎkÄÓÒF
¢\üªÒi÷	ÑFáÃ­ë¸4> Õåe¨½
¤½p²Ò"¦iöÛVñ=Mj4xùWjG9lZE©ë+ØÏNé*°
O1	ÓÎuÒ ô×Ê2f÷wQÔ^ùfE´·tCIÊïª=M'üEõÀ]åöÕõl=MÄ¦Ã*"ý
9°8i¬ª
Ê¤Á4e73õS67Ûz6ÇJ4óf­¯KRA*;íRËJÉ[1k[=MÍ|¿0'ÂÖZ¶ñ°9§¦-ÕGWv½ÕhLI Ô=}ã]ûÊM@¶&l»ñ³Þ&$¤zÜ´¤² üç{8ù­ÌìNRy:¨Ø¶¢µ°ö
';Xuþi6¢;ÙÇÇÔÖ í¨Ýº.ÔÞV®¨3ò½nØÏýÔýÌ 6c©Qýxß¹©z}ä	VRsÜXPkNÅDrxÔ?¢ó½5Ë{CÃ[¨µ£ãmþ³Zpz¸«dxJÕ÷¿©]Ì¿'z.ÿ·Û{º¯{kÝlÊÕx»¯tùãx=}þ@ÁàNÙãL(Øµ!nøïr6¨#ô?ÿÂÉð¥#h¯ûÕßgYøTxWÔ¼üÁÙoÿÁÈý'YN*3Åïöm1^WlK¶CD5oÑæ©áªqä= b}[M»M»M»M»M»~G^¶ÂpaÛíHµì´ÌF@Òã§ú=}0Ðsañ«Sû7½h¸£(Ùù&fLÙqÇmÈijY-ìIB#/óïFzèM1Äi®?-¤)F.ÆÓvy4­4|M×ÓyÑ­¬ç¹b2 âUÈCA¬üë;W½¢§Ïöu¼å4K;?3Æ:9£ªiû6þßÒ7÷q~m²ÝLl±]m±M¤Ü&p}SÕÌ¼ÍGÇUl}ÿÍ¸O¹éÝËî²$ýDÏ 7_çåBýÜ«!Á;îjÝR0<W2ÊH]eÛi¦©«)n;.ÜRr"W%=}XÊØ»¯¥gø÷ïWX³¥Þ$_Sëù1¯-§^NJ¦iÎTsÂûË//5ï§êZ86·£¨þz®ÕÐßîï²íïÏ[Xi=MÀSý%ÛXé¯ÑÒP{wU·ìØÆÌx¿§:òZÙH«'º~=}ÑÔkoötYÝ¼ÁGFïõGØLÖÍrÜHqàRåÈ=}=M ÊNá®,í°S#àÝ"= ÝÏãïæÅèRpB}c¼}ô¯º ¡!véòÕes$ê¾ï±O\èÛðs/fp>fhSe)~¬bA2ésl¬lA/£ì%Øz"Ëòño0RXdíëHçì[ðÁ1\êaeåmåºîòüpLo o»â^é±%ôò¹57¤±7Êüq»$Î>õ)Ù5 o¤½ÊòJWi³&Op¸Y>ÂÕé 3{,jýDÖowY2¦V2Õëy.eZÉõu2ø½2Fd¢ª%ê»ï
ü^P¦RªU4N4 ÅJªe}J
[LpöÄ³x<3?ïmÆ³ªN´¨Z!£ß>Ã?ÇX6}åõTÚ·.¹ê}·ßøGàâà= BM]{ÑJ»M»M»M»]C¶ü/§nGÉ~ä*úâéêë|KV dÇë$½Ón »¿â2:q%Z4÷1iü²J(+hô)QtÈ8&ZKi©tõòn)DZ
z,î-FKáy,ÕE6ÖuqÇ¨,ºóÕ,ÛÏ3ô¨r"lnêm§Ì;pÒl"Ë7ê[C¤5Jô59¸8ÅÙ õOa*]
«ÎØr
m&üúJÏQI¦oÕú¢m\OJ¥µÉÊÈl	i®f!ÛöÈ|¸SÞn®Å?72û<¬NPj¡.æ»ø;GÙl!¿7æ-B{ô,Ì±úy¼ÉOI©°½5Nz¿->8{¹]åk}¥k±öÓ7:4NñÍ¥¦ô{¨¸M3­I½¸ñS¿»XéüZîY*ÌOÊ @g=}ëüÌS8Q»­/gÁ	=}FQ1±EWwTC<T_¬%_Â²j§!©>>ojWÓ¹¡&oÇÖ8þ»ÇÉÓpo² @?Z\O×ù[¥G¾'éãÛá[+äüHúO0 ®ÙáûÖäùÙ; ßD­ft
ûÂêiÄÞÂp­ç"æ¿íÐ­_æ¤á LàfM»m·®M»M»M»MËrÏ4âW5aYõäJõ(*ÀÄa>gåRðÐ'Kúqtf¨Æ*Eºkü=M²Ie(þjØ$<3BPEiÏÍ:lq"¢
Ð$t_òÕ²ªLDÂ4v¹>FÉHy«E¤Íþ¨ÜÓ "2=}@%e¶Mõn4¸4Á¢!ewWõÝ2(t2r|*Î6ñüöq÷»rÐvª
¯sH|=M¦xú-çJSÂÎ´V%C¾çmfÑUÇ¶=}8GB]}¢U,³y)gS×>ÊÔjApk¡ò¯ A!Ñæg7ùd§ìV¨ß·@VJsxz){ÒÇ:yÄûFD©mNxTÚL¥Ïö61knívÖ­Òk<G=M*Hö­_&{©­
K»»LþEU­ãN»¬ÛFi#×ÜîUk°¨M?g/³ýnLRx\¶®ëg±<þFPyC4Ìò}«¦ñöÜ½û¿P|.À1§Ó"þÍÊZ\ÈÎ±Vr§þn[|XÈÜÑx~²ÇgÄ3¯ÛÛtxÅAk¯ÅS)?ÚtnæÝ ZóN5d(M ÓÐö Å=}°ÔêTZçBçÔ«ú°§ëÈ:=MEg= zâêé¨ ®m= ÿãV§ëùsFðrF¨Ã.ë¦d´8öòß#Âà85àeÁL»ÍÚgK»M»M»M»ýÜð©{qÞü)ávÅíðùùÀJ­à-çØ EáÏï°ÉF= wâ´*üÄ8~ %b,ñÄM§ Á±!éÒTOp·cTØðD=}bð¯Sf¨4d:$ÇVFìï]!hk#ôÂËËð±Âdi}Ê«eiFgÙ²¬³aA¬êUSxIG¢T\ú&Ú÷]a¥ä6©âûêÄËPWr µâõoèÈ ¶;Ójhñwk´Ì R[d(ÕeÇVj$<ò9Ý*Ei®ytr¨+ÔHQo$¢òÚ:iñ'Ö½uXß532y >y&¨Ô}¬²AûÆ©L»öÕÇDs9Þ/FZ:e!%õzkê2eü½ôm54A¢>åß"êGCì¬2ª--OCu,5,2q6<2ÇªÝï1ü?Ã*í|¦3#m¾]/±&¿Amsr]²òÈlª|®[3#}
]UÊ,±É:G¤}IUÆ_°9ô¯@^6cIEì&Èæ=}ûû´ÉE0E!ÚõæÏÖùÌJÒmaù«I&só¥-Ú(åËy<ÎB²M)Ê%WxP¾Ä´3óÇo©töFákñö9¬KCñK%yö[¶;F1×n¥/öÂ»Ä©F3l­­F7#{ç½Mo©¤¸{hëÒûÝomz²x¿î\gØü>ÖWµA¶Jg6çËî¿ÌhÉ²+Î÷#JDLÏMhk«ÅÎZwÆ'=}¾¼RIÝ¡ÅIüoúynõ×Z,ÍÑc'Px§Ä¹þ×XÄÆ±È§ÌïþÇÂØÜ©ÈsoØÅ³¯¨3FÚ¬8ÇßG0üà£µM»ÃÄ»M»M»M»ÕX¥´clö£·o=MDð24 #-a·b Îöâ#Ûê~pX ¡½â}èÄ^
PÂ «tÑÓi¬2,D2¨vq¥Çi¬¿rÌ(§»w¾ß³Â+ì¬Q$vºòÅ¾7®iÂ«BV)TÚq¤ÜOòKrªL©	¬æTyùÍDæïrI-Þ
y|ÛD<t¹Û4F¨/yZ	ôBÅ1¸2>Hp¼48¿>L¢ÃIê=}6	¤¾Ô"ÜêÝ^\,ÂÄ266Pãuzª­
%æT~]yª·}
¥¯¸ï4&]6¹p0ÃBöm·¥Bµ²(HDHq&Úú)ÇKÜºÑÔh¦©Ëú>IìØ/'(s®ê«úÉXf.fV'æÈ}sJy®zýU/Ë<C_°Yü· ¯@Pp!$5c½AæYüc!ýíÎî­@Àêc3ì2|èßo_¸ô¯ÄNæse-Ò4úFòN{Èý,Ü!¡ôó[yi£®	sBW,2Yó«ÂPúk	Ù|êöåú:1=MÆhÎCÑßkÓ=MúLXT¨Ûõk$¯\(w¤FB6{¤¥MZ5YúAóÂºÊHóOm¥F©2{»L*|IY³FÞ{SM^W¨v³*	gÈ:î^#¿+Ç_¤Í4çOy#ÄVg*ü¼TØÒ²Á´g9©<zDW	<¢Å9UwYñ1n«Ökæ´yÈRW+§-îìÌrÔi«ßÑºFÐ> :%o9í«þÕ{[,ÊÎQC'vùþÂêoqÐXP£¾+o¼
ÑIt¥'Â6Ùm]Z=M]ªÖÔ©²Ç×ìK\¶ÌÐÉ]¢Þí\n_×É,= åãæ7ì¨· @ôð³À!w= v#â>/îHÀÞ= #áæÄ^ø°ß# m8-véSÁ iìjã5+ôfM»Ë«Íº¶¬D<D»M»M»}¥?úK4N±¦B'ÃÌ mor­°¨<Âm'ú?éÍCmZ"ÙøesË©Óh®T¶´iÌ³°¶) ÇÂ}±3U±Y)Gº!}ê÷"¹[Þ;}_T&(z¡@<cØEí¢JùJA°¡öAp¢ üCCv!uæÕûlJPÐ¡·gæølJÂùu±D!^smE-Ö´¸½,VåË¢,Ælù£¤<F2Sk)¦#¯{LKòÖºd¿Â:*M±%lÂö+
;4OHQ}eC8\ËMñÖ¥QöÝÇ8>I±Q¥qöÙ9ìOQ×m%Ñ?öÁÑLîis³:{^¸OSm­·~u-qè{ÊMz®I´Ý{ÛMúR³À{ÄM$S}¸A!æçq·"	gµüVRÈ³¾ÁPw#8#¶îF?ÊÐH#¯Á«0Î£Û§îºçg«_ü
P9x¦Z.wV%=}¶4TÙ5§&+w=}=}îÛôüÂ²Vb+ØüwY<VMQP Å¡ùw·<éÍçw7_<Î§×wºC[Vo¹eæu×H1«OoýÖxþqhìÑ1þ«Y<ÄÑK§|}þÅoZ|À±Ín§{Çþ[\nÊòÚ)Ã³g¯a¢YªÛìÉÓi/yî#UÓ²Ux/ÁÃÙüzËÓQe/=M5×ÛTÅÀ¯xç>ÛÙÆ& ¤áÓ³å,®ùÐOqà\ száe{ä¤IÿPG Ò  ììÀÃ= 5ãé(@«®= V'â}ëø_ Çs= íÏâ
Üì¸û+0	@+Z!Þ<bÉ%ä±«ëúb#mäy»êDW¡^7ð±bä'è^­óô8	H9@@¦Q¡Ækbóå~êþ÷Ø	Xù+ÒiÄ6©ÉürÍeS«(*¶wtL	i½9R±p¬pMpÝð©erß+*t¼:é¿©/Õ¡%©­;r~/¾*Ïr§±õÍó
.2t©xs7ñ#å¥¦új8mô­;FV1¼õùuµ ¥hßõ»§þ.5¤}¨"1]½e]8±×lÌÂ>È7ÔÙ_ìoãôõàì%M»ËF»»M»M»ÑïÆ00rp
ð
iÐ m0xðPa0ðs©dÚÝedÙódÜeëëedW{ä½=MÜü¨GâÝõ¹=}ÁÂ3ÀAÁXð1øEKô,<F2íØ4þE5rÅ3Ê÷5v5î55¾µ5B3Òë¼U3×2æï2o2Æ.2v¬2v2ö2FM2¦Î2Úü2:}2ª?2¾2¢2Î4^4Úß4ªæe®&&¤êÆG*Ç¾@lEDÌI4JH¼NAÈ@ÈNÉMþD´ýE|~HÄ}I<@d:ñ9OÌ¿F¤¾÷JLCÜLôMì^DÌ[I\Ý@ÝA´êÂìèÍmÄümÉ*ÀÜ,Î$*Ï¨Æ®ËDÌD
ÅDÈÁ¤ÏdMÆ\NÃ¼ÊÌÌGV?'gÅ'éG{Æ¬©¶Ù¹9«_°é_¢¹R®WµÙ]»yÙ¨©Þ²Ö¾Ý­YÜ§IÿÂ£ÄààÄîäÀ§L»=}?M»ÍÎM»M»MËWÃ-ø'g¨nGýmò®Sô.Ë8q¹ñwKá§¹nEü®´P¤ÏH¶´U ·±qg~¦ÖWÌýÊXºñUr§ì'Ynn+üc6NP¾Æ8§ÅpC»iÀ÷Üv¼R,[ÀøÜ¬±Ém¦'ÿnøßX>gÔüìÏyôµ³]"¯ÛD~íI}Y²ÆÐ¼©Ëù7¨#é¯³~1uyJZ.µÓHÂÙ¹²ïÚ¨¸åZ[6ïèÎA~éZ¦.ÓÜ~ÍI°SVy»ú¯Øm~·»¥×XýÔÆ©Q¦³ËG¿¯WåÿZ¼¯·~»ÿÁYRÞÖ´Û/Èý:xù!¸ò5ý+ÿ?Xw$Øu2èq>ès%è{3èu/ØpÐxÐPbv°i0p}ÐsP.d]d¤ãeç#eÙdÚÃeø3dCä7((,È:h!¸%3X7#"dÃ¢Ô³"ë¢"Ú{¢já¿AÖÊKA [Á½GÎïAß?*jßuau[Áu1tbWü3"%r
Û3
³		c	[R	Ó	Iê	k	c+	Kª	w
	?	J¹ÊÅúm{=};Ý»s³7P×ëÞcâØ¿= N< 	À{öÐ¯êÄ¬ëÄ=M45¶4f5ÊO4N5^Î0îÏ1&ÿ0ü1}0®6&~7j=}6=}3v¿2J¿3Þ_\4^\XlßDØòÐ_7ÊÝ6>ßCÔîAdíC,èO¤mL¬jFhE,oK$/Hl(BÜu¢È|ºs®s©8µhu³ÐYlÙmüel±%mgl<ElÅ=Mhiqz±nÑq±yE ·¦è·¡¨¿= UÖVjQwÑ?¹ ÀðÖPÃCÀ8C²äC¡DC­CË,C×üC¿Ü@Ö¶vOfOZNzÌ*Ïýü¾þ.}v~Ú|=}2>?î¼&½é@×molû/lù¯m:lOmÃÏã~/&¶¦ÝÏ¦x?ÖgÁYê= a<»MÝK»MÎFJ»M»M»NÓÐ=}yÄïJêNlèEDèK|îOmDdjJ¬mNÄlEüoC´mO/HT/BÜ-Fì)Id+Cl.G$¨ÈÛymð¹l= ü¦§<&k¦µÜ&Ñ"¦Ú¢&B¦= ò¦³2&É¦ÒÒ&¨*&Ã
¦nJ&Äz&º¦v^a1qiÑyq±Ñqs±k{Qgñqßö@lC[_ÃÞ ¤GgùE&ø'ùc§øÓ¦ù»X¯)¥Ø­è³h»h·(¿(°(¸¨´=M×Üu&ªµ&&¬Õ¾[ÑGsÑVkQ[{QBgIwKoW¼Ç½ïøîùoØüÓ|Ã¦®s¦d³&&Ó&dk¦+¦Ò&K&¡û¾Ûv¿MlK4Ïïmsol/l"¯l¯mumfm¨OmÏlÖÿl¸lãÃ7²WCÃïÚÃ³O¯ÜKDênçõmckO¤01øô>|j J&ò×k61¥{HSìÑÈö;\h¦óÂké¥m$BòQ¨q<.ò*=M>ñµ²i}É%rlB0Ñy5©bÅðíRj$Y>h0 _6÷òÑÙB"1¯
rvð=M+ju¤Ë²C9±|81> ò7òkQ5¤ÁÂ[qf73l·öoËX>qH¸ ìNÈÛm[CÏ»¤Ó{Ù.S1eHº2äòs;k5M¤ÞÂRÏ±>\Ë "Uòk=}$fG1¾#tÉ	
ÔòuZkª]<?1÷ *æj¢Ò*DÉ2íðÑçj(c$p¡Â$|ù
Vìókgk$¯q¡1L(&dÿ¾Ã¤zÑB´ä±Jß)|3\_È-4xò¯ðÿ¼ayBÜ;{]S¥ÐY²\ñKaÅÆ=Mô-÷iôk¥CHi_?ÊWvÙßNªR?"ô[=}o5^OÃ¦ñ%·joNÁ1YØÃ6LðjN¹¿¿¹;$Á~ÃfNóIkÃµîñJGVYË;$ºvb[¥E·F¿WÃ×kDç¤F7ÜÄzþòÏ<£Ôñ¡¥Ê=}ÚCB«S<ÌQ%.h£Ä)Q¬uÅÏ¤IQ¨õV<G¥æwÎ|×SÑ®[ëU¡S¼·ÔÂ*>ò»<Ê«BëQ%TUW=}¹Bk+R-lØ¯ã= uæáøkM»M»M»M»M»},½ÃÞ»^\ÚÛ&2½Ó¾3ÙfýÆ-[©MRËGÓsÊchZÈ| qï7)[¯<-¦Û¾¥M²ËçSuÄ:Éþ|Få»éÚ8û®\>s-p³$µ1·CùO©Ò,C®!bI+n+$]Áy¡-BIKsû$³:7AGéÙºÜù p6[½lY<Ì;G#/¶ÓdxÏÌõã¸¢B×=MÔFíWèÓ¡ìI¥ìnÑyäÿ½//vP~?ÙDoÉ®â.ÒqxÍ­ù«FNÒ¿÷=M¥I­XQuÿ¤²VÇÝx§^ÎÓ®Y-/ektÎùe+ïvóÄ1^xû%'¦d<ÂßßT&à5I%l=}|Ã?èÖ«ßsztáýù¤Döe<Æèo \²rg24	}ø 8Fl­ÌÇ·Y¤^ò$7þ~8	,9³= 6Tï#ù§Æ|ÕLG§§ÎÒd·\ÂáÞzáAh,,Âst´D û	(*3a´þmI.û°eþÔAà#ø¡ø¦yI¬Dë8¬6fULDë»¸©NÖQ= #üÁ­ÂÍ¹= BààÀÞ«]»BËõô¦Õ¤èó¬ òKL+Úó®ÂfþXÂeØÂwÖBÖ*(eö²#&¨ì9	VjsÂÆXõÜvØ×}ëàÂàýßÄéqÓká êúó@ü·+0Pg)6rD5MShaÜëjsäsIr|usÿÄI©= ¶QÄ)Óhlá ×éæÏòV[ü [ºã>,)A6/DÜSjYafÃi\¹reD|2nAÈ¼©®!¶!Ä7âÓoFá/¯éÕ£òx-üÈU'T¬>ñ)E6®ìD¾U´ãp<)øçÐû­!º½^S6L»V¶­LL»M{økx]u²É?ÕK×7Þæa©à³ÖüHuýæ *»% 	J=MFç
âTuaîoêaE[ùx77çÿ=M ²	~ÐHUóêf¼î:¸ßrõ®Lê?ýÍìSïb2À[îürFgÚùP7Ä9ã'n¼áNâã÷])\ìÎé´ÜQæÔ:F$}c1»È*;fÌ³L!3tpµùÕÛQð?=MåÕÎuc2;¸1ØÕÉ¨Ð^ÊQPíÕWQ'°|lkÈJ·"Tì0PÃFæÌº óßT höæÁÑ«CÑ@fïVÂ?¥IíÃþf!87plË´¯¡ÌXÔªÉÓÑeXMíVQºab}kV^2<j­õ2º BÝ©²)&ÂhLþþ+¦¤¸*îg®D¤adÎ(ïâR¨ç^M²VíYV^9"Õ÷©ÌåºÌ2²F"¯4°V/;/-/íÿú¤²Î;ÍØ(¿H"»ÎÎ$Glþ(§/*»*É{«Ý}¶Ëpfdå3¯3g¿ë¦âz´t*3¸Â{ZEç+&ÛhQoEý3&C¥«zÛCëiã¹Éá©L²±L&6º¸~³¹!pE<­jNGÙg¹¶ëL#Ëâ²tKÐ|mZ^[çWPÒ¿JæÑBX¿	,Ã-XæÉ¤Ký £)ÆÃÇFÓÌ4ûz¦;øöÒ]ÙËÈÍ2«£ÏW÷X{= â^Ö¸S¾ú	BØOZq°·#ÜY0dt¶ñ±+C$v÷õ§kNÀËn]ÑàÑ'0ø;ôiû'i7öh_ö¦·»¤$«AqÀV!Ø=}XÚSQ¨31çUµÙÕ´hÕaÊU´#C´Uhº5ÆÇÏV4¿UøÐçÈÄ*Ò52)ù'©)Rv<7©-Rwúj¢Â	Y)¾ro2ÏÝäçÏ]ÅºÏWrô åÞ¯1)Fc­©5Ê}xÈÀ4©]Î`});

  var HEAPU8, wasmMemory;

  function updateMemoryViews() {
   var b = wasmMemory.buffer;
   HEAPU8 = new Uint8Array(b);
  }

  function JS_cos(x) {
   return Math.cos(x);
  }

  function JS_sin(x) {
   return Math.sin(x);
  }

  function JS_atan(x) {
   return Math.atan(x);
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

  var _emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);

  var abortOnCannotGrowMemory = requestedSize => {
   abort("OOM");
  };

  var _emscripten_resize_heap = requestedSize => {
   HEAPU8.length;
   abortOnCannotGrowMemory();
  };

  var wasmImports = {
   /** @export */ b: JS_atan,
   /** @export */ a: JS_cos,
   /** @export */ d: JS_exp,
   /** @export */ e: JS_log,
   /** @export */ f: JS_pow,
   /** @export */ c: JS_sin,
   /** @export */ g: _emscripten_memcpy_js,
   /** @export */ h: _emscripten_resize_heap
  };

  function initRuntime(wasmExports) {
   wasmExports["j"]();
  }

  var imports = {
   "a": wasmImports
  };

  var _create_decoder, _malloc, _send_setup, _init_dsp, _decode_packets, _destroy_decoder, _free;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      const wasmExports = instance.exports;
   _create_decoder = wasmExports["k"];
   _malloc = wasmExports["l"];
   _send_setup = wasmExports["m"];
   _init_dsp = wasmExports["n"];
   _decode_packets = wasmExports["o"];
   _destroy_decoder = wasmExports["p"];
   _free = wasmExports["q"];
   wasmMemory = wasmExports["i"];
   updateMemoryViews();
   initRuntime(wasmExports);
   ready();
  });

  this.ready = new Promise(resolve => {
   ready = resolve;
  }).then(() => {
   this.HEAP = wasmMemory.buffer;
   this.malloc = _malloc;
   this.free = _free;
   this.create_decoder = _create_decoder;
   this.send_setup = _send_setup;
   this.init_dsp = _init_dsp;
   this.decode_packets = _decode_packets;
   this.destroy_decoder = _destroy_decoder;
  });
  return this;
  };}

  function Decoder() {
    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon()
        .instantiate(this._EmscriptenWASM, this._module)
        .then((common) => {
          this._common = common;

          this._input = this._common.allocateTypedArray(
            this._inputSize,
            Uint8Array,
          );

          this._firstPage = true;
          this._inputLen = this._common.allocateTypedArray(1, Uint32Array);

          this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._channels = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);

          const maxErrors = 128 * 2;
          this._errors = this._common.allocateTypedArray(maxErrors, Uint32Array);
          this._errorsLength = this._common.allocateTypedArray(1, Int32Array);

          this._frameNumber = 0;
          this._inputBytes = 0;
          this._outputSamples = 0;

          this._decoder = this._common.wasm.create_decoder(
            this._input.ptr,
            this._inputLen.ptr,
            this._outputBufferPtr.ptr,
            this._channels.ptr,
            this._sampleRate.ptr,
            this._samplesDecoded.ptr,
            this._errors.ptr,
            this._errorsLength.ptr,
            maxErrors,
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
      this._common.wasm.destroy_decoder(this._decoder);
      this._common.free();
    };

    this.sendSetupHeader = (data) => {
      this._input.buf.set(data);
      this._inputLen.buf[0] = data.length;

      this._common.wasm.send_setup(this._decoder, this._firstPage);
      this._firstPage = false;
    };

    this.initDsp = () => {
      this._common.wasm.init_dsp(this._decoder);
    };

    this.decodePackets = (packets) => {
      let outputBuffers = [],
        outputSamples = 0,
        errors = [];

      for (let packetIdx = 0; packetIdx < packets.length; packetIdx++) {
        const packet = packets[packetIdx];
        this._input.buf.set(packet);
        this._inputLen.buf[0] = packet.length;

        this._common.wasm.decode_packets(this._decoder);

        const samplesDecoded = this._samplesDecoded.buf[0];
        const channels = [];

        const outputBufferChannels = new Uint32Array(
          this._common.wasm.HEAP,
          this._outputBufferPtr.buf[0],
          this._channels.buf[0],
        );
        for (let channel = 0; channel < this._channels.buf[0]; channel++) {
          const output = new Float32Array(samplesDecoded);

          if (samplesDecoded) {
            output.set(
              new Float32Array(
                this._common.wasm.HEAP,
                outputBufferChannels[channel],
                samplesDecoded,
              ),
            );
          }

          channels.push(output);
        }

        outputBuffers.push(channels);
        outputSamples += samplesDecoded;

        this._frameNumber++;
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
            frameNumber: this._frameNumber,
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
        16,
      );
    };

    // injects dependencies when running as a web worker
    this._isWebWorker = Decoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      Decoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = Decoder.EmscriptenWASM || EmscriptenWASM;
    this._module = Decoder.module;

    this._inputSize = 128 * 1024;

    this._ready = this._init();

    return this;
  }

  const setDecoderClass = Symbol();

  class OggVorbisDecoder {
    constructor() {
      this._onCodec = (codec) => {
        if (codec !== "vorbis")
          throw new Error(
            "@wasm-audio-decoders/ogg-vorbis does not support this codec " +
              codec,
          );
      };

      // instantiate to create static properties
      new WASMAudioDecoderCommon();

      this._init();
      this[setDecoderClass](Decoder);
    }

    _init() {
      this._vorbisSetupInProgress = true;
      this._beginningSampleOffset = undefined;
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

    async decodeOggPages(oggPages) {
      const packets = [];

      for (let i = 0; i < oggPages.length; i++) {
        const oggPage = oggPages[i];

        if (this._vorbisSetupInProgress) {
          if (oggPage[data][0] === 1) {
            this._decoder.sendSetupHeader(oggPage[data]);
          }

          if (oggPage[codecFrames].length) {
            const headerData = oggPage[codecFrames][0][header];

            this._decoder.sendSetupHeader(headerData[vorbisComments]);
            this._decoder.sendSetupHeader(headerData[vorbisSetup]);
            this._decoder.initDsp();

            this._vorbisSetupInProgress = false;
          }
        }

        packets.push(...oggPage[codecFrames].map((f) => f[data]));
      }

      const decoded = await this._decoder.decodePackets(packets);

      // in cases where BigInt isn't supported, don't do any absoluteGranulePosition logic (i.e. old iOS versions)
      const oggPage = oggPages[oggPages.length - 1];
      if (oggPages.length && Number(oggPage[absoluteGranulePosition]) > -1) {
        if (this._beginningSampleOffset === undefined) {
          this._beginningSampleOffset =
            oggPage[absoluteGranulePosition] - BigInt(oggPage[samples]);
        }

        if (oggPage[isLastPage]) {
          // trim any extra samples that are decoded beyond the absoluteGranulePosition, relative to where we started in the stream
          const samplesToTrim =
            decoded.samplesDecoded - Number(oggPage[absoluteGranulePosition]);

          if (samplesToTrim > 0) {
            for (let i = 0; i < decoded.channelData.length; i++)
              decoded.channelData[i] = decoded.channelData[i].subarray(
                0,
                decoded.samplesDecoded - samplesToTrim,
              );

            decoded.samplesDecoded -= samplesToTrim;
          }
        }
      }

      return decoded;
    }

    async decode(vorbisData) {
      return this.decodeOggPages([...this._codecParser.parseChunk(vorbisData)]);
    }

    async flush() {
      const decoded = this.decodeOggPages([...this._codecParser.flush()]);

      await this.reset();
      return decoded;
    }

    async decodeFile(vorbisData) {
      const decoded = this.decodeOggPages([
        ...this._codecParser.parseAll(vorbisData),
      ]);

      await this.reset();
      return decoded;
    }
  }

  class DecoderWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "ogg-vorbis-decoder", Decoder, EmscriptenWASM);
    }

    async sendSetupHeader(data) {
      return this.postToDecoder("sendSetupHeader", data);
    }

    async initDsp() {
      return this.postToDecoder("initDsp");
    }

    async decodePackets(packets) {
      return this.postToDecoder("decodePackets", packets);
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

    terminate() {
      this._decoder.terminate();
    }
  }

  assignNames(OggVorbisDecoder, "OggVorbisDecoder");
  assignNames(OggVorbisDecoderWebWorker, "OggVorbisDecoderWebWorker");

  exports.OggVorbisDecoder = OggVorbisDecoder;
  exports.OggVorbisDecoderWebWorker = OggVorbisDecoderWebWorker;

}));
