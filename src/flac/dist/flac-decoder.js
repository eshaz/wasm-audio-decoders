(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["flac-decoder"] = {}, global.Worker));
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
      outputSamples
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

        try {
          isNode = typeof process.versions.node !== "undefined";
        } catch {}

        source = isNode
          ? `data:${type};base64,${Buffer.from(webworkerSourceCode).toString(
            "base64"
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
      ].flatMap((y) => y.map((z) => x + z).join(mappingJoin))
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
  const absoluteGranulePosition = "absoluteGranulePosition";
  const bandwidth = "bandwidth";
  const bitDepth = "bitDepth";
  const bitrate = "bitrate";
  const bitrateMaximum = bitrate + "Maximum";
  const bitrateMinimum = bitrate + "Minimum";
  const bitrateNominal = bitrate + "Nominal";
  const buffer = "buffer";
  const bufferFullness = buffer + "Fullness";
  const codec = "codec";
  const codecFrames = codec + "Frames";
  const coupledStreamCount = "coupledStreamCount";
  const crc = "crc";
  const crc16 = crc + "16";
  const crc32 = crc + "32";
  const data$1 = "data";
  const description = "description";
  const duration = "duration";
  const emphasis = "emphasis";
  const hasOpusPadding = "hasOpusPadding";
  const header = "header";
  const isContinuedPacket = "isContinuedPacket";
  const isCopyrighted = "isCopyrighted";
  const isFirstPage = "isFirstPage";
  const isHome = "isHome";
  const isLastPage = "isLastPage";
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
  const vorbisComments = vorbis + "Comments";
  const vorbisSetup = vorbis + "Setup";

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
  const samples = sample + "s";

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
  const logError = symbol();
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
      buffers.reduce((acc, buf) => acc + buf[length], 0)
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
          0
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
          frameLength
        ))
      ) {
        this._headerCache[enable](); // start caching when synced

        this._codecParser[incrementRawData](frameLength); // increment to the next frame
        this._codecParser[mapFrameStats](frameData);
        return frameData;
      }

      this._codecParser[logWarning](
        `Missing ${frame} at ${frameLength} bytes from current position.`,
        `Dropping current ${frame} and trying again.`
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
      frameStore.set(this, { [header]: headerValue });

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
        readOffset
      );

      if (headerValue) {
        const frameLengthValue = headerStore.get(headerValue)[frameLength];
        const samplesValue = headerStore.get(headerValue)[samples];

        const frame = (yield* codecParser[readRawData](
          frameLengthValue,
          readOffset
        ))[subarray](0, frameLengthValue);

        return new Frame(headerValue, frame, samplesValue);
      } else {
        return null;
      }
    }

    constructor(headerValue, dataValue, samplesValue) {
      super(headerValue, dataValue);

      this[header] = headerValue;
      this[samples] = samplesValue;
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
        [samples]: 1152,
      },
      [v2]: {
        [bitrateIndex]: v2Layer23,
        [samples]: 576,
      },
    },
    0b00000100: {
      [description]: "Layer II",
      [framePadding]: 1,
      [modeExtension]: layer12ModeExtensions,
      [samples]: 1152,
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
      [samples]: 384,
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
        readOffset
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
      header[samples] = layerValues[samples];
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
        (125 * header[bitrate] * header[samples]) / header[sampleRate] +
          header[framePadding]
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
        readOffset
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
        header[samples] = 1024;

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
        readOffset
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

      super(header, data, headerStore.get(header)[samples]);
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

      header[samples] = header[blockSize];

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
          0
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
                nextHeaderOffset
              ))
            ) {
              // found a valid next frame header
              let frameData = yield* this._codecParser[readRawData](
                nextHeaderOffset
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
              nextHeaderOffset + 1
            );
          }

          this._codecParser[logWarning](
            `Unable to sync FLAC frame after searching ${nextHeaderOffset} bytes.`
          );
          this._codecParser[incrementRawData](nextHeaderOffset);
        } else {
          // not synced, increment data to continue syncing
          this._codecParser[incrementRawData](
            yield* this._getNextFrameSyncOffset(1)
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
        oggPage[codecFrames] = frameStore
          .get(oggPage)
          [segments].map((segment) => {
            const header = FLACHeader[getHeaderFromUint8Array](
              segment,
              this._headerCache
            );

            if (header) {
              return new FLACFrame(segment, header, this._streamInfo);
            } else {
              this._codecParser[logWarning](
                "Failed to parse Ogg FLAC frame",
                "Skipping invalid FLAC frame"
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

      header[isLastPage] = !!(data[5] & 0b00000100);
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
        header[absoluteGranulePosition] = view.getBigInt64(6, true);
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
        data[subarray](27, header[length])
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

      this[absoluteGranulePosition] = header[absoluteGranulePosition];
      this[isContinuedPacket] = header[isContinuedPacket];
      this[isFirstPage] = header[isFirstPage];
      this[isLastPage] = header[isLastPage];
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
        readOffset
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

      this[codecFrames] = [];
      this[rawData] = rawDataValue;
      this[absoluteGranulePosition] = header[absoluteGranulePosition];
      this[crc32] = header[pageChecksum];
      this[duration] = 0;
      this[isContinuedPacket] = header[isContinuedPacket];
      this[isFirstPage] = header[isFirstPage];
      this[isLastPage] = header[isLastPage];
      this[pageSequenceNumber] = header[pageSequenceNumber];
      this[samples] = 0;
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
        ((header[frameSize] * header[frameCount]) / 1000) * header[sampleRate]
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
        oggPage[codecFrames] = frameStore
          .get(oggPage)
          [segments].map((segment) => {
            const header = OpusHeader[getHeaderFromUint8Array](
              this._identificationHeader,
              segment,
              this._headerCache
            );

            if (header) return new OpusFrame(segment, header);

            this._codecParser[logError](
              "Failed to parse Ogg Opus Header",
              "Not a valid Ogg Opus file"
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
      vorbisSetupData
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
      header[vorbisSetup] = vorbisSetupData;
      header[vorbisComments] = vorbisCommentsData;

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
      this[vorbisComments] = header[vorbisComments];
      this[vorbisSetup] = header[vorbisSetup];
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

      this._mode = {
        count: 0,
      };
      this._prevBlockSize = 0;
      this._currBlockSize = 0;
    }

    get [codec]() {
      return vorbis;
    }

    [parseOggPage](oggPage) {
      const oggPageSegments = frameStore.get(oggPage)[segments];

      if (oggPage[pageSequenceNumber] === 0) {
        // Identification header

        this._headerCache[enable]();
        this._identificationHeader = oggPage[data$1];
      } else if (oggPage[pageSequenceNumber] === 1) {
        // gather WEBM CodecPrivate data
        if (oggPageSegments[1]) {
          this._vorbisComments = oggPageSegments[0];
          this._vorbisSetup = oggPageSegments[1];

          this._mode = this._parseSetupHeader(oggPageSegments[1]);
        }
      } else {
        oggPage[codecFrames] = oggPageSegments.map((segment) => {
          const header = VorbisHeader[getHeaderFromUint8Array](
            this._identificationHeader,
            this._headerCache,
            this._vorbisComments,
            this._vorbisSetup
          );

          if (header) {
            return new VorbisFrame(
              segment,
              header,
              this._getSamples(segment, header)
            );
          }

          this._codecParser[logError](
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
          byte & this._mode.prevMask ? header[blocksize1] : header[blocksize0];
      }

      this._currBlockSize = blockFlag ? header[blocksize1] : header[blocksize0];

      const samplesValue = (this._prevBlockSize + this._currBlockSize) >> 2;
      this._prevBlockSize = this._currBlockSize;

      return samplesValue;
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
      const failedToParseVorbisStream = "Failed to read " + vorbis + " stream";
      const failedToParseVorbisModes = ", failed to parse " + vorbis + " modes";

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
          this._codecParser[logError](
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
            this._codecParser[logError](
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


  class OggParser extends Parser {
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);

      this._onCodec = onCodec;
      this.Frame = OggPage;
      this.Header = OggPageHeader;
      this._codec = null;
      this._continuedPacket = new uint8Array();

      this._pageSequenceNumber = 0;
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
          this._onCodec
        );
        this._codec = codec;
      }
    }

    _checkForIdentifier({ data }) {
      const idString = bytesToString(data[subarray](0, 8));

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
          this._updateCodec(vorbis, VorbisParser);
          return true;
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
        }`
        );
      }

      this._pageSequenceNumber = oggPage[pageSequenceNumber];
    }

    *[parseFrame]() {
      const oggPage = yield* this[fixedLengthFrameSync](true);

      this._checkPageSequenceNumber(oggPage);

      const oggPageStore = frameStore.get(oggPage);
      const headerData = headerStore.get(oggPageStore[header]);

      let offset = 0;

      oggPageStore[segments] = headerData[pageSegmentTable].map((segmentLength) =>
        oggPage[data$1][subarray](offset, (offset += segmentLength))
      );

      // prepend any existing continued packet data
      if (this._continuedPacket[length]) {
        oggPageStore[segments][0] = concatBuffers(
          this._continuedPacket,
          oggPageStore[segments][0]
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
          oggPageStore[segments].pop()
        );
      }

      if (this._codec || this._checkForIdentifier(oggPage)) {
        const frame = this._parser[parseOggPage](oggPage);
        this._codecParser[mapFrameStats](frame);
        return frame;
      }
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
      } = {}
    ) {
      this._inputMimeType = mimeType;
      this._onCodec = onCodec || noOp;
      this._onCodecHeader = onCodecHeader || noOp;
      this._onCodecUpdate = onCodecUpdate;
      this._enableLogging = enableLogging;
      this._crc32 = enableFrameCRC32 ? crc32Function : noOp;

      this._generator = this._getGenerator();
      this._generator.next();
    }

    /**
     * @public
     * @returns The detected codec
     */
    get [codec]() {
      return this._parser[codec];
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
      this._headerCache = new HeaderCache(
        this._onCodecHeader,
        this._onCodecUpdate
      );

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
      this._sampleRate = frame[header][sampleRate];

      frame[header][bitrate] =
        Math.round(frame[data$1][length] / frame[duration]) * 8;
      frame[frameNumber] = this._frameNumber++;
      frame[totalBytesOut] = this._totalBytesOut;
      frame[totalSamples] = this._totalSamples;
      frame[totalDuration] = (this._totalSamples / this._sampleRate) * 1000;
      frame[crc32] = this._crc32(frame[data$1]);

      this._headerCache[checkCodecUpdate](
        frame[header][bitrate],
        frame[totalDuration]
      );

      this._totalBytesOut += frame[data$1][length];
      this._totalSamples += frame[samples];
    }

    /**
     * @protected
     */
    [mapFrameStats](frame) {
      if (frame[codecFrames]) {
        // Ogg container
        frame[codecFrames].forEach((codecFrame) => {
          frame[duration] += codecFrame[duration];
          frame[samples] += codecFrame[samples];
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
    [logWarning](...messages) {
      this._log(console.warn, messages);
    }

    /**
     * @protected
     */
    [logError](...messages) {
      this._log(console.error, messages);
    }
  }

  const data = data$1;

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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01d9fc6c0c93/qõ¤æo-®Çr_¾.¥ò>?= ´Z^¨E¨_lLKÓ½Lgº½ï4É
xø#~ÊQÊz~+âWÖÞ,É²^úÙ¹@¸Ëò°ÈÐúWØò­hð6þr§·Ç¼FîC"Óàr$¼Aé_µåªÝâWïä'xÜkÈÀ¼ÐäYËÖû½GÐ%¡ÜS»¢üj(µÛÚýÀyla%H;w »ë*û1¬XÑî2n¼pÒ¤ÉOÕã}Ñ.qßO9äÊëÅBN}dé¡sÐÅW´xÀªÐBoÂix>å©üÁ9úßQôÆ­ÞnH6Áøïv±véáÖ÷¿[Zö,üâJ
ìî>Æ´i³âG*>$Æ36=}Pzaò  ýÌz¨ÇKieZh&-
ä­Ôdfn@ã¥vßy§ËCñCq@aqs÷FÂ;¹ò@Ûa¦õ£Y»)B­þc=M]r,
#³òúÚy Y»«Ê[,¤=}ÙÜäo¤^¹Z¾Àæä"Y#n?õ¼ÇpKïQ¸^s®õÃ2|ûKb±kDæñB©Òl»]"xúð_nS8âack'Æ#lü9å´´¡°¡ûË÷¾*Ï¡dlHÃ¯9æ\l½³Y¬åy»C*°9ô\"LÂ·u<«)*
«#­°;c_Éûuc¶¾YÃípDEàEº"A15@'N:5mB¯2«2m²¸Zåx;ÒXE{6Éd×qîébÖ:ª< [®¯â8ªUQÑèyØ¸Ç9yÔÖÈÇN)íÏmÍÂü y@]?àgN#VÞ¶!Tú0o(%R¦y=M\¯å¶Ö:vv½ÎY?u6¬ø/ò¶?»Í',lÃ;T¡[6 ¯l~Ï¶eªïäF-çð*\Ö8¼u=}*¬®]Y&uÆ ø#4¤òìPXÍö:% 0­²W°\&0u^ö~°ÇNÛJ^HX"×Ñd6áØÜÅ¢þF¤Ò:Bc&A }ñKÖU¤[vÃ+ Â¢Ðc9­Äê2º1
c_N_Þ!äÞÔ»x]S®1ýiZì¹|ùìñµ
r}¤Æßµ»qr|8GP;øêgñ³¹¿C.ð¢j|æþ©¥§û{,G$sµÄåö _g|ÿq&Mõ_FòC|FKyÞðÀD°ãígRÎÅl²W±Ä&mÿKì3ubþ¼?'åÌ'qn¢þXhéü,Â¼ín|A4é=}Â=M_cÍuªöåÛ¼ïÐË~:6-} =}K# ]x\NÙ:yõÊYBÊ¡©Éñüur/ãbFê/&ôîs&tÅª}BµüF@hOsÏ÷¦PÎÁ6 ÈÆÓiBÔS¨hÐÁ¼«²EvbbÖ|k"ÒãÍñ
¹ôÊÜÆ5bKø4tg4BV<ÿ|_r|d|¿M¸;AmAÊS±Úc Í9ÆY)ã[vK°Øab§w*Ä¹ö,TÄø	ÃÏk²ëbSäç!0¯'÷?Qy³MA¤+8å$$¨>L;ô6u@
5ç$¸ÜîæS÷ZÎ*~»,;%ã{tv"%ã®ÅâRrAàÃÂ¼Åº#ÖoÊþ$ :Í#:^]m¦'BQóªæ¡O#Ï3Â·tê0©PC´«ÅãwJî¨Wò¨×÷¨#²¤KN=MºYÿÅ[IêK\7Îç Æànß0q>,Ê¦ eÄqcQ48¥CÔ~¥ Î·RSgÏ¼"LTgÏ"Æu@I	 üä&Ñº(ØÏDCO^¬p±	äþ¢JñåörÒ±t³»TbWöÁIrrrrrrgorrRq*k¬rÍMã_íÄÔÎ$|ó°1)enåÂ%¢aWºnQáç_¹¹gëØ$K>âåùáZ ¾kÒä4ÿÝÝÝÝ¿u«E±n»8«-±)] ¹ú¢©»ý½¤ÊHëß,¼w¨öù>ßÛåB÷ì¢/xéã¢	Sô2Qamn_Å«YåkY¼83'vF­6ÝñÌ)ü@}nju«!d¢ªÃÈÈöPU½µqÌR<¡Ï£Ò²£jõuÕI°×¼W;§6xJ	=M}ÿ¬§ãAä)1A¶h6µ|Á¤c.! ÞDnm=MBÂ3>¥<Õÿ^/­µÅóæ<w_vLÖc)b¤YÙeÙLçaÒóM¡ýÚQ¼¬Ò§ÆÄ\ _Ñ:¿i5ÖçMÆ¼ký=}¾³bfôÏ9¾
2míPÖÌ0*&{óÁ44¿=}n_g9ë òä'k=}2HÉªÜÔhJôª%|N ÅÄyÎ%@u·n6R,Ç}GD5ØoãE=M2K1ö¼0°ÄÆèÛ¾>3¥pÈâ¾+r­'%¨§6 vK½E²Zg¹ûå3Ã\b gànX]]ÃZ¼rB
Ôrþûg¦KÚgA«ª.K0Îá Ë5´@9~Ê5ÄÅ(Iâ:ÕàwáPo)¤bÆì÷s]¼³PÜhF6¶Ì-ð >7ÂÃQî¿dÚTG§½¬]p ¼0ÉÉ×ÂÔKZº"TS
´$üÃºÎXx°Êÿ÷4+RI>XxÆ±¤Ä£4WRÇØ÷5WüldIe¥ñ«$÷S@°­/p0Â¤H6VA)u=M.ØÏÎÑ|9')ÐélLÏejbÉùU	ìQ9Ô+IÃEÙ\Káuvü°<+ç+)Y:"ÐW@0ãN©ÌÔEäm7ôR]Dz8¸7wõVy¼ðxâÑ
P8ÑS½à¯ï3Aóz~3ÁsVplW¥¨6¶ÈUä6W&|)©×JÔ×Ï±¡aÁ abpo1ý5}ÔN_MXãgHUOp¿ß-üÈ¯¨ÆÈÆW¸ÍtÂrÐTÐÂ¢¯3¼y¶òí:¦öÍFýÛ$19Z^¶Íôõ¦h düÂ&É?9l¡ù ãguá=Mqê/[Ücñí4â[á;Ùä%[;m=}niúÊ(§P'¶Ã´Tw?0«³óÍG.vÓÀ­,'.ñ¥Õ§·Îçâ,ô××+9ÝåÛ²Xe.ÈûrîV³:Ý|{àlo·ÇîOÐcPÐÖrnOG;<@	|Ïy}©ßëu¥ý±Z ;*N
àY	mÖÜXvoF0b2[³Mcæÿ³ô%
+·9{f¨FåsEåÓô._±ñM<<©=}<Ù-Ü³±ñ=MÆ¡±ñS±lÄ9	*'ddýqKY3qÍ9Û+ð	ÀéJìm
-3}õZ\v.L,jê,j(©W>¿"ÎwzmG}hüu@]L?îÀÅ »uÎuÌo-áö[V«*[HóÕ×ìtã*NãÃ§×88~7l(oWH)2Æ+d2±áx?mcëj¹Ì!Ú¥¼÷²[bäó;ÅåÏÂhñ4üÅ]éÝÔVl	 Ï®Xz§®jÄTZ±/(1$Ô±1.ø.ÂDe= kyaGcÁGêH½ÛìªÐÍ®m¿ö>>(¥¥§êßP@×a&#£Á*©äÎE¨ÐBJ-Ë®jÅÉñQM(EÁª<#ÇiE^dÝu=}µ ù,øOf¢Ñ6ÂòºZõz?RT¸·F.F®êe·"vOÐ¼¨Êcmá'eë$Y"áòß0A+òÿ Vâ?Vºe¥¹õÄúZf0cPØhO¯½­VÍÿ4 f®
ÅÄÃQÌ­^#-0zkv²F½kvâË[ ªÞRh¶\R$ÑT¯òlpî= 
!Õl¾(êöÅÄ0sFÕHC>ÏÖßlW0.ïnÏÔI6Ô:Evaìí¨táÌzËd»?WqËÎïhû1}lçú$ n_¹TUqM¬u.iyÃÖ³PÊõ|­&ìoóÊ±2uWè|ïâA|xÒ\kpn«Ô¹ëa(µ^¢ó*ïãßöU£,Ræj)"B]p@çîs^=}µ7ÝøÌø !"C(ECy9ÌOÜ2mÖFùÿ6 LÍpÙ5ÔBi÷<±iñÜlù¨=M¿«ÆgTª	ü;\ ´£×d*ÊWVÌuðÑüe£t1Îüh9eRdd§yO,Ýx*ú@q;õëÌôjÃÛK£øqlÏÄôØÜj¶@<C±?d,{øªR­7>þeÌú¹¨9ú=}i¥!1¦b~[®Ï1tI¯Ð3 /U}ìpÝú×	H=}iç­)_¡¤#Æåy[>#«*{^!\é2an0ý­5j)}!H-3íâöíâ®ëcíây¤ K?~óÛqaûÚå IM3¢úòU À?Ó4ÀQ¿=}©0ïVbY¥!¡!\o<ïÖc¨Ñ;²/pBã¥£ñ_î9í= Ìb ©Ç>u/©£Æ){¡­â.hBÄ?LSA¯µ§òGbºOÞFIÉ¦7­µ¥¿?ñæ?¥ë<:Ð,«/8|yc>§e9;ù=}È3®Ì|¶{tþñÝh«1lk¤u£5´oÑà£B1¤éÚgUIÏ¥â&9/Õð­ä* ´ò^?	¤¿ÓV­_8·±½TsÚ´§eÔ*Ùú
¯ú®xU½{¸hL*ë}î_Øi¹ws6ÚÐôãS%8²ºR×zLî¼¶F=Mn¬Ê[q¿²]VN= =}2Ï=MØý¦Îâ ?½÷±DÂzä[ºÎ¶vr¬©Â«Ù©l­H,Ò£ç®EãÞùWntCÄg$é}5&%pO?Ðªb¹éËÞÌ;èuêz
:ñ©Ûìa¥%ah+´ÂØPØÌ¸ØÐXÍØëPÓÈØ·$Ö(×°ØÑ|ü"ÒÛ'wH+è´ÖÐspXu,Ø#{Óý&&  ÓKã= 2íÕKs[qò±<iÓåý_^­ËÏ3VR5!b ´k~ÞXâêvÎ×.n¶¨*¦uÄ¯Ð>çÚ£¯Ë½(£!Á£cø5.¾\ËõÛ,>Vã,</#Æ¿TLN8¼éy$ã°= 4.×¯Ã§úpUU.nhUDNn¸½éy$.£ 4.WKXz£õÛM7>Å»ecÓËlYdw3Ø {Ñ8©XßÊñÃLsyt>3l7Ã6+ÍB ­§ËYj(ÒB: <ËÔêñE5xÅ2!ñ)³Ù\¨,ÜÏrciRMáæ¼4¼ ,3'[[hd%ìqoÁ¿;ª¨#¬Ñ±ñÛ/­ ÖÞeCÏ¤[4*véfpZsQ94!9yC×6ÐÉò+7¾IÅdÞ°(ÅÅ¡;Á®¯~ðñnV±ÃnÁèbä¹aJVy0 >ÇÓ}JªCÁ/íò_û/Ï6_"­íÔºÓ§S¦t¾jÛ,p³FgfÉc¯y×P,ØÝ«Ñ=M?µ@Gfì'°P½ei"SGfkô°)î°Ðæ}m= s!_1ÃÁ¢údíw¥c[§ÄüniuLTg×7ùcj~= Ñ_¸ WùO ¡7iöj$Öwà"1gC/;´m¯Êu«=MDéûzPR­æ=}üOgxóæFGÅÓYDG|1"´?EÜß2, ö®ã;Pj×ks÷ó¨·÷6[¿Óñà-Ä<ù³ËG@¿°§&Ï#eé	= öà= p£|mµèìòßùÑü$ØX|ÃpõÄÐ)T¨êÀ!C]PÑÒK1øhÉ·KÙ²#°ª _ôuÿ^dÓp£uCÿ«:È0>Gaúqú
·>[]%"B	\Ê;0*@£TQ/>T¯L²þpxL¥úéäóß-ÄÒ\ýÜx­*ì@þT½õøm 5Råè¥ELè÷Yâ¾lÖM»ãpãøaìÉrKl!½Y¾ê,ðQÖáëÿèÎL.aKX¬á¶¼NÅ"Þª,*OíÇpOB:j Ñý> ò üºéÇeò)%Î)åAiÉ¥Ü¼ö
Û{¡Ï2*TEñà&ÏvFÏÏy§L¡J-d×cGõÚ?ëÑæk%·\JÄ=Ml!ÕéüÃ	éK/ªà;3Â>0S7Ã×LSía:Y*¸Ì×u¦Oï¨ò¼±5o)(­âS­íJFÿÔd@B¯ÞùTçÜ3?û73 _ ,¸°äÆÎÀÆê!ÝÛòùÙ§Ijt*^e°lN	nÌïNÆfFGÔ_¡§tÚRxû£¯®kuQñMÊÞ1KÙ'64Ï]¨<_]®÷a!	ö;;rf¤=}[E ÎàJN#,oCoY=M\ë:­7ò$«H4?Ôï=}v~Zn¦ô1wãR­+F·O"gßLÒrÊú!F§«5ùñÿi:ÉyJá/V§^Nb ,Ü&+ß-î)&:¾Jº~sS5ââzDÙck?ØÛg4aa6/¤qNJÂBÖïpæÍÈM	øËÊø»¼ UUl¼ÿm,»zÕ@GÜÕGbàÑ(üW×ì@Añ¼]»3bÄzÚÄa/ÃùõNé/ÚW»ÚÂômÀ¸ jøÊ@üï7öÊÍ&õÀ	hïè÷¨HÍ )0= u %Îèn½¯vÓgwÖ4íòªý'òjÑ5×Sn3íï./l
sFPÕçdã@©Öò¨¤Å
« |Lâ±ð Åü[ó«l4}À«æß:êß¥@$1^¯´ÞY^|);¥3ÛÆm_âVÎN³zýKÄzÔÖ«)ÃtæÌ]Ð¬
5iR LG]Í*!0rÉÔÚ÷b^+.Êz9Ç¨¡Ñ-~Há= wÆ7QV¼±ôN²²ç¢üH ¢²C%B0f&2~Bg½A÷c×Dm¥´}êÚÓî eÝ¢ÙicØAØa¬È @6Aüx=}ZÎXdÏ"q¬=}³ ].Øà;gÁüÃ!òmÒî<||¥ôSH}TÊör$÷ò·Ú®oõ)&¤åx"LUËKa(+ÏÊ>chtoÀ±2!¢óÑ{åÏê$jWì"EûËÿ+)=}©ÿí¢s¡íJì²¦$öU&ë7E^eøøÊfQ¯µ ëAÁêÀ!·äa°¬þÍñ&ì]ß[)áæ6[^WãË|uÖq$	þÍÒ=}[ñG¿Nq÷nÜ(5¡§RçJwÌ~¬K7¯f<¹qÿ,áüm)!&¤5_ðKõÁ	éÅnVúQ£&÷l%ñí$2
ìqOg  |QÍÜ÷Ö÷= xHéÚºùEÖ;·9=}E1)'8æ´)íÞcMy!¾ ñÔxÁyÑÄåãqÿ;>)!} \ûâ¤ohå1ÃUýàÜt¡aö@+ ÊÊßDüÇüåãù÷ßäa°ÒëSôe·½|à\ûÀÅ= ç÷íbEÄÓß¥RSu@õ!d{»ø$5"B»3»RìësnÑ}b ëxÊws$%ós(í¦]AV{A­OrG?M¬ÚF<1¡}r¥U$lÞºªwÿÆ1¸';U= ûA/©çÓ4ûÓ´CmL³=MpÑý(£¨¨ªÚÆ½¯ é/«.°Ë:ÿ!Ï«éT -ÙíVÊJÄ¼hÐÛK¢Æö¹¹j:¯CË	¬eë;Ë¥<?Ü?F(" dÐQô
èÇRIë"ôÉ¹YÌQ­©í?1Än6ñ,h4pD¹ ªã$mÝlí¤O¥¦V9VFÏÙ#á§¾7¹,	Bðõä¿Æ[ü@UÄÂäô:· 2@NaÊÚxXyIV^äJô]$»"ébÀvg1í®[ÒIàâ0)ÛÌY/é;÷uP]$­ÙwM]$m²Ù·s¬½o^¤Qµ5Úb¢{IrÜ]Äù#úüZ¡yáÀöºëû"¹6ID5G"M0­ú« ßUQïÏ!ÔÉ2wff¤ÑèSqéêô2Ërkÿ!w~¬«ËêÚÌ}èåK^ªµ¹õöÆß7Ü72!&UCis¸SÏaÄ´p_1X~ÑO²;Ð$:{¤ÑèkyÏ5ù®oVý¿ôôÑ~!0L2mËyåÀL¾´~æä»øØçvzÆéã=M;Ì*ô]f·yP­C/Z3ÎÊñ¬2d¯Æ;%I¶ÇS¸¶¾Èy/%MÝ{|(YA:QpAUrAM"pÁóKTøfMaEÅI Hæ:æ·\¢Î¨ÎÀ.ö¹-iùEßSF%,À²kzÊ= ¡èï°ªe6(+I=}]íý-ïBJjûZ4ÓÅ.kÛ d¢¬rëlBQpIÁ½bÁ}]gxag$AÐúPûKëswaë'^]ëQ1= åÇß\I]Ö©ìëOf"o÷d>võ\}Ie5"çccxq¢ ÄÁJ]cÎ%×¯°Xx«âÅÜ/Ó³¹~óOEÇ¸Ñ]mPÃ®ü;åÒdÌ*J[= \÷d °pÎÉí¦¤~IQ#òMdòCð¢&HRÛ«W¥¨áy½njz*KoëY£»¥Åx$8jj+2=}¥òKrPÚ>¿|r}O6×7Hþ¾èÉ!¾Lù'µ&pÈ×?|q¥þ¦WÞ­î»Ö~vî¸ôúÃø#ê^83Ýé@Rs¯Î½âO/¼ç
5ä¾òôõÙÁ ²W]åîùV!RÝÑRY¼ìåJ Y¸5¯ücWÏHf#±É¾,ÅUaÅÃpõÁÎ]¿ÛÏ[¿4E=M\ÞNyc²ø£éÇ$ü¢÷xå§E/o &âëa@}»ºðÁüªpA¥,mI("¿-Ê¦Gp	¯]êÔaaÃ+"@²ÜÃßñ¤î²ÊÐðèíô7G@áª5[!jÍ j2jwróÔëÊøþ5¯f¯Zé¦|FsUÌ¶r0)rhqjNwìPéïàÙé¦êõ:èãjRbïaíËã8wë ¯n= ¼ ! Z8þ·@¼È;-<ÓÓVx«*r@sþpðZ_Îâäàû
ñ&eÛ´àNÝw\å±Æe3û|0Y½¡êò	ÓeØ¾S+ å½¡sõ2 = ÀQÝg¤Õà0sê±'C%ÖÌý²ÀR1O#y7(ÓZìÉiÐ×~Y²¸e.%÷ÊÉÇlû@wõLõßÙñúº¾¸fZsaú~"âòÕ''y·j©Ðóæ¯ Ð}¾åé©ÝÇ<Å\ÀÌ¹Ì¹Ê2ÖõQ¶§Ã¤ï:C°þ¡½½n(úx]5¦A/Xé^+¸à?ciG)%q¡ó¿"Ú¡¿h;Ñl¹¨ÙX+5æ¥£äoøüx1â$oÑÊ¼©ß+Ftåò£µ#ºK^Ë¼³ªDÑ3Ë×Û}^0Á$a¼óÞVIaß^m6Âl=Mñ]Ïªë_ümàÚpä=}¾AZq iøþó25ìOºÝ¸gÔ¤>-Qö "Î_û	zæ°çCü°a®´kÑVjðA1bþÎÜØ©CI÷êN&Fîô­ì²äü® ý¹hªÑá¦	ÊÂoHJÅ=MD8	ãS¸;d"´¦ÓýÔfHJ0ÏhdH?Þ(î ÇÎ¨Å4²±S¸;¦¾4Eô¸;#ú0¬|1Éq¾éË¬O¥uë¸;«T5t 2É«Ð(©9*»)¥x¼û´ë½l!&ó×cã¼Þy/$ à³Åè¥23ÉtéÚ´2È8.²ÖÌõfILÑÜ£lËë{£à0.Ò9£Õ= ÙÆ-×¶3tÈ¦®îXfYºÓÉ5øG.Ò4Õ= Ù6ËÊ..·Ë®.WlY.Ò½xE.Ò®.w¾éy$.i«»ëPû½±nõMº
URhË£1Lñ°= ÷Í¹~·mJy«ÅÜ;"Ö30ÁµágÒ$W<öö¹D:yb<ü¼= rÜs w0»ó¦ÁPl¢cÊ
§gõ	>Ç@Û Bò?Ev_.Cd4wéTÏÜÜ<~ÂûjÕRwæ
r	þN8/úØ®Zð­;â[$jÈ§d1½~GjðVjpÀ72ËCá~¡DÌû0ïd5Æï»dË4d·ÃíúíÒ·¡ûHPd5Ì·rðRP¡TvûÝpûXù}HûUi^Û²Øw«®×ÉRðÆäÍ0ýa¦	Oî+lì¹5íç0l1O'¾»+B÷{çîÄ©í~èT$½¡Í·ÿt,ô¸·1o¹jfe/ÅÈ5­%ÎtkßÑ#ÿØ>e^Ý´¯8´_l¤t²Ößdr$ÃPÖ¬'I ~~ZB»p_±=MÜ{ãíÆ½ótÍ79x¢ß9ºÆVÉù.µ-7¥Ã°¶'D0mÃ¯ùVDi2ÞãB¡°²IR(P^ê«õ0&ÕUQ×Ujæ.wÓàÃ×Ûê0à{0µ:+û%í¾ÚH]®;$J8<Ç;2¸u0Ò¨@gY*FKüÖï·à©pª±Ë¤¦R·(©5þW©c,ÃÝä0¿3>
"N"BÇ°d'zv£)¨mÿ$mA³ÂTMJ[H¨ÄÔÒ´¯^Wp_tÓ©=Mì¿Zyùè<·¬	QÂ%a]¦ãÅJ½÷q±£¸ÌxLg§±æóléöûj/ö8T7 ¨g¯{ØfÕXJÿõ%ý«mmèk5ÔDoë(-&{R-òIÖÂðá¡Idð¼zJx}\cË6
Y´	àêÒ!«£ÖgÌ7Õ\ä¤¸¨Ëa6Ôv\×£léÔp0.·x@ÕönÐ¿Ø£¼éTÔ§ÆõÏXMG¿gr¨t1ÞÀG-]^Ô¼s¹òúp*Xmo2jjXòá\Ó=}_öãgÀXG=}%}E/DWÅo°¥.Lö¥èV\'*uô=M!%£{pÃ=}*}
Í$ÓÁòÃèÇãkÝ7®þñ-ÀÍú5ãÓ)¦l+Ú~86©Ñ&C5E#¾	i)Wá¬0éQ¼ÈP¢Û= ñ<,Ñ[_ÖÝëLc^d<°#L×Çy{ë]ßH=M©Û)¦©ÙÖZÿYó_ÏÜÍ?ÜY3_sÙÖ¬ßÚfòÙ~ÉYXç»zTJ¦·PÙâtu@8q¦fQþùi!¿Ô×$UÆuÇVÀ´¾§ÕÍY+ÏØ¿éc$A2N@Nó¬!!n ¥\p¬r´ú¶æmk	Ë²M©fUMijçÁù·xÜêÆ$¬MrBee	É_àÖîY&= rñ!úî­$ckàíml*]dÑÚáåm1»VP)mN¶Ú?z 7idÀ¤¯dhæÎ¡©Ö I¸çÈünñWV>oÔ£Tá&Ñ÷;#9×NÝ©Lä &¹FR=M¸ [S¦´o+D+"v©¾úþíÌ l2¼^[¡Å(ÙYn>= Îû Ûu{\JFYsÏ«:U©´5_÷)u@D50·+D»JÌ=}cVzÍÞÑE+ùeôP×À{Ñg<ÕÃð2Ó´íÆR«Ë<£ÆyÅêÕeôÑjàðG½
ÃÄ³øçöxÂh/0Wàf¨ÕYÙÆ»u&(qsòv8÷+ÏUîßºFÕ:°rq¸0âÜagC©¤ÜåÞ²ùCêå&)Ñ_;¬ôwvIÓfÀB¤n8©}ðM>=}Ú{ê³§À= r,YzºÉMÏF¢OÜ (*8·áGQw#ú}ýAìré¤y³,d¡dçV)Ðãö%íª«ÒÒA$ÍæÉsÃ9Ln
Ã1ßrp1Ê)õ!Á¯¦÷¡Ñõ«*fÖ= uÝ#ô¹8©éNé,[yC~Ì]¼ÃÆ?5o2Bx=M?¥ÐX+%$Þ8ù­÷Í&Lo·Ñ¥Rß¹UÕ6,mdH(³È¿Ðì lzë?qã4aI)áw/
§a1aÔ-C]</xâ½¦p¬2ÎÌýsþ¸H:ã¿Ï=}¤~ÕE¿ýsUw?
Õ'ÈUôQÔåGù,
@¡£ö11'wH·ÑçVM¶ÎÌèµ6¨.fqo¡ºI6§(ìØDë $ÆO7@= 	 !ßÂ×eãU=M+ÁeÐ:âBë®á,C;¿dÅïìù®Hº2göMu¡ÍÀMÀ^³=M6ò*ñh½U+ü¬OüÆ¡ÊO½=}ìND¸þ¤µé{Àê)za;Ý}A Ì£OJû)ê9}qÎ+c'© (-I:º5·âÖBCÐ#ü/³~Ññ4ÍZ¶ ¨ÊnÀÚ8R÷Gài|	1ù!!T>iNR_ÁGÊ÷(¶ic±È= Oµê'£ÍyÌôå®ë_û/}'¤C\y­7ÕèñyâæñÖJä§LÁqþSp°	#%©¥»Ý9j>£ÜbO*®áÔî.î£¤ì µÆQwotG÷K7$@¥ãöND×ÊÚÂÎ?öü±?{êÿ?{
rìàqA³%%%=}ÇÞ OX´¯mSûµ.¯1óªáÔ3þåèßgx2÷ &Ò$8K¼S¸²dM ×µÿø³:Y¥Á5ÌCìKOnbÎ.ïoÇ¿¢©01­Ò²#
[õ·ÛkÒÎÏå3ùÅlån»í¼W?k»áñüYsxv= ÈuEôPdê?.C=}óµÄ >  @ÖI¯7Áº¨Ê{  ÒüèóNÓ¯ùó½¶_ÉÀòKFNÔºG=}Ô¤ÕOÄõµriS5n"@ýxÁ#R;r;;¢=}Ãì!­d­æôw{É©8ös¼u¾ÓÒ.¯*¥ÜÃE5û(vT]/ªº©6·j[ßÐDrÆæôxä=}ÇÖd¨ÄEÆéT§ª3ÔÅBÖv@¤a¡	ÇÓÀBWÉþ(V\"AÉÇ©¹q^ÀÛ=MàùÈÒûÖ?k*PóxÀp8§ø§Ýj
ÅÎ¦mkî½!ëý =MÂ9fMD¾©ørõiU3GléÍ·qÞøkßßwÇh{O7|¹àrç!¸ó=}/\/«íGXî1øX£ 6Å¾RnBd¿6®PwN{ÁVp©ö_ój= À!Y¤)à$êíyYÆt¦/®wÄ4úP°ëKP§ÆkëS³ÈÔÉ_-| |coÚ¢¶ïk]ÕÛ{4CB= ¡1±-é7­kàÉÐd6Í¨'ÍþT©ÃéP0àØþ¢!°6îÙ~Û}ÛqãÖÊs8ÐÑ?ßa´3ÏT¦?ün>WL©®xÕ«xÃ(¢ Â(Ö~~¸ª<~CDÙ©ª¶^çÀò}3¦(SÛhzM¯¶í(	úd= .JíNJÚÈ ÑÓ×¡&5~ÿ¥@:qß¶ÆÏu;7	T±t£cnGÈåÃ~T_m_=}x%©imÅ|1´Åú{&U©¥~HÍÞÖÁñÚÖv¬½íb)¯h+¯hñÌÍoÓjÞ4F|øB@Gzø2øÎpÎü¦Ï*lS)l_ñf	ÂÜÓyEþÖµÅ+eZCytå3Àåü·ÚÂ4\¥)©f-F\<(ji¿Z#ªÊ×à{9êB<	ÂIÿTKýdæýqí 9S-Gó¿ô×NÌð£âg÷=M #x,ë"cm­¾Ñ&^ÕÛwar¼XÚíõ~íqÍÀÛiø\Ã´Ù®ô%Ð
ö4+<Ã-ó{Êè}LÚÇQÈ®~¸±tñÈÜ@2*äcJ= îB93'áÚá-:ø1,¾Áó{ôa¯õ99pNôÑúfæ?çL»YÞTÞÓÑnÎälÞ&ì;=MfrîC×Û°aDÝL)31ºÖ 9ñ3IÜstÒáõË#p©õ÷Òñ£¬¬Å¼t^ ËÑBß
Rref%Ò<&±ÎÖÄ"ò^ëçã¾õ«í=}=Mºiz©m^=M}i¼©a´õó,ApÄípì°Àáu»lm Ê¢¤<Ñí¾ÿlKäxBRà4¾@ÉJ¾vÑEpçx6W ïøKÝlvLÄ®2 ævvJÇÇ}ÈaÏ¨©P!¬öÍ&z´{+"8±Ûhª00¯ö~t«m¸	üÏmñãòÿæûý kx LìG³xMuôxý8$UÇÅî¿«¥·«&·2óîxþ0ìÀJHàÐ£f4!ËÙÔLð®ãPìºGµ]ìºÇ-þµN6¢\2Õ2ÄSGÅ2Â2M¥Á@ª­Áa@ª_@ªýÁg{N¤ûòÖê"ÅÞºw±läTã:¨±îÏEbÉêÆÇ=}?V_]CÛ?TF¤F¬Æq@³*¨@³ê¨fÜ¬ÿ¾Óû¬å½ox½ìxúTIêÒ£^Z^	IûåuO²Km²þ³ @ö.¿¢»¢¸É½(ÒÄwÕJùØAùX-çX+0abî;ìúð;äúOû«îB²Ãk¢}ø|Çøû7ÛgSï%ägQïEQï%ä¯ÜäÓG¬95g/¥hÍ4zj·§^Ú2ýD\¢3 µ,0|ÏÁhÓY×Á=MxÈ^'[SûÀ«P^Í¶}´ qiæÃeúÓ ÎÖ
ÊÝT[wy*gQ[_>û2xÐCfæ6¬äýÃ;¿"å¥ãêÈß¹$~²V?!ý@Åªö·OVeò»=}~vqn$¨Cù¡We<ÅÝ1Ê£;´ó%ÿÄ©e$¶¦´èÊ¥
µ´³~ZÍÒú//
p~]5ÿNr<ÊOqª§e°Õ¤Ã<ã´yö@ßÌGüRHªø(ä»ìU=MÈÄN=M¨úüâBÄt/{éPöÁçý»<G^µ]é®î*EaüùÛ{ì m«÷£¤h CÇãÍlãVgùÿî;ÍuñüÙ;]L_ Áôy¸½külõ2t.Ü®m*F[÷¼~0ç!©aý²þ= $aù3µ'6I&ÚM¦2@\é?SHV_sÖÈêd¸Ç lÄ¼;F=M¥sÍT;<x=}UVi3içcx4¿ÌÍfsÍHvNÒæòðyøß©6©= ÚMäÓÙVäÓùY·Þø8Ä[GÝ©0yÈà©0yÄÚÍ¾ÁèÛÁÂÁÙSäSY÷È[·ây= yÜÁ-ðMC¿úèOúè>'Oú ô¡ÖæýH9nÈHy 
Þ­ tÁõbÇKMbGLMbgÿªÿ¾Áb'B{Þ dÿsL=MH{â lÿCCtAMoÂÂÜtzõ¼dèÖM>WÂ+¡sPóxÄ÷CN£BOS1±Û=M¾6o÷^ëE)·ï)>NÍµ³UÜOÑÉ!Yz»KÀÏ ÉÚü´¶Òrhöv÷KmÒÚÙ@AmDqÊv8ÔU(sÍH( >F©= ÚMäÓùYwÂ[GÝ©²ÁSÙVäSY·Þì8Ä[Þ©0yÛÁ6©tÚÍ¾Á#Ù¶Þó(Oà©¼6©dÚÍIðÍÙvÃ[à©\öé7è­8ÚMØ+XÞ©Ê~×ãyTpÓYOpÓYpÓY5ðMC¿ú46¡¢¥ä·ÿ6¡GÜé°Ë=}³k}Aùä"ó!­¥«zz´JPÖ÷Å(o%qJWEìº:sG> ÝIÀ°1!ìWÍ¾¶Ñý¾RRèÒ,Ñ%£x@3·d¨/ÒU5ÒÑEpÐº4÷8µÉ\Ç	î7NÐÈÿ0¶ÊÀx^öÄÔòãiºÔõÞ_®ÁpÛBÃWsÛ#x{Y¥.PèÞM>6ã#8NP,ù­.PðÞOWÒNÁ8«_(i Ñµ4×Åûè\®	ô[¢gñ×òö[Ìx÷¨èøA]=}Ø½%bødd¥uYr	ý[0Gå¯V+õtÕî
Wë¯Ûlûñ¿¯úSxFµVj¾È¬
×a4=}ìôð9;Ýðµé%ÒÊQ
×$	×KÜïMåõ	[Q[YUY&½Ùüýº¼t÷kËû<í=MÜkG= kºEYÖ÷5ý@½qCá5cÓjSazhö>H|/ëüQPYnÚ3'äo6½E§mÓ<ÖùßÜ"0ß!ä'÷^|Æ)³1$	ü	 !µ=Muw´©Àè§ü¯°_æOuDÄ±p´e´v4S¾¶0²û·dµ-e°6­îfåæ,LäHÄàT,N¡@w0$7V;ù%Ó¶ý%ÅÙxþè4jwÅÊ´oÿÅÊ\þYOåy@yèÜÁEðÍ\ÙÓ?ðÍÙVäSY¯Þ¶áyO¸èyM°ÜÁ¤6©øÝ©¬6©TÚÍ=}ðÍGÙ·ÞìèPHà©Á­¥÷Å÷E£uÅ'iÔé¼â%OÑE¢Ìâ©í9¢Ìª6gÇªFgG* *°®õvªâ  &¹AªLg¿&=MºA« Fìfw@So²1WTÑS$·Æ"c}»
É()¥Hpzñ®¹°s0µeJ6m¤×Ü¢'Kìw¿p7Rû_$2sÆckÿù	Î3©C}Òï8á8³Ë¤Å£YÂÚà¬PÒRÙÄzOòè]s4â?¾#>à85yè¸ÿæÐäKVÖf¥î91QnÊ¥)¾®foUÉÒP÷É@<NLapÿÈ<Ñw;¦ZDXr¯rÃü.(NQi$C¤Z»Jì	¶¯d¾8¦þmD[üm3â'Y©T#Sø¹BÞ0x.¸úwª$9¾¸ì_$DÇ¥?ÄúìÕÁ=}Q£]s®-^ºQIºz¤¿^Q=}+:®í/¶´K8aá9²uãr«£ì.'7¡s;%I®Î=}çÏu(&d|¡\û¹ïh©âFEþêTãºÏ¨ooRp®Ã®ÁíI µü°xlòCI^1ä[ßf÷~:"bP»«= ÁÀC!üÇ^¥°Dkéu½½Fo-Vö°³?:Ç¹W5pà9æ	¹{¾¨J×Nw=}ñÓø6ìr<IR2wë0¨$¼*s¤7Qo= "+jÕµÝ5î,çß°£{ÃvyâÑÑô1Ãõ¦L%vn8®ÉÝÈ+kb	òZµyÄëáÍÉF¤ðT­äI±ÎÎüÂý}/ÞüÕOqUØãÿÈÞÅ]ÜûV.2fvG8©äÙÌ¶v¬×¯ßDrË¨X¤2Q~CE/= e*æ¯zVÎd,Ãh¬ éY¢ÝS9 ³+PÓL-	 rbá[$ÐË(ZZéVwÚ~WUJ¢xÔ¢B×>êÆ-Ïf@r·máÕYDÀóÃPT#
B=Mý ¢"òkF6é#zôAÉ]'
z6ãæ½mKAcÐñ¼GW²°Æ¸³MP7Ø 1»n_ÊµÄî"JÕ³ÖÿÝÛâj¸|·ùólT¥ÇA©ÛÌ0»¯ô4«Ø¤¾ãsqLuxÝoxÿf6ZsÑ¼IrhG¾ýd½ecÈ¼­Bÿm|+¾$Þ<þ¡.J Ú¥05p| Id<­= WâÇuTë.q}= ðéLãXMhÆyÕ}EZK¥s ÄÂSÒæí:iêäDE+B/YÇ
pÄCÀBãT{Ç ÅäýÎY4äÐïúÌæaEéñ5d±èVÀq!æ<ðýgIeàyÐÁù}lJà®ã±+Ëà¢¥B¨®>pÉÜÍzÆÒ#7îðÍuÚj&â¥¹Ë7Bª¥(A//%OÄ0ÇùE¤hµ^ »¤B
IÆÚN$ÕÑÈâvÿ5ø	J'bAÿ¬5sê@áþÛ¿e Qõ½P|2~j!&fî":ÌÑaU¯I ¥äñ¦ËË00 5XÁ÷Ìßß5À_ ?µ¬.+F$º}|ÈÊH= Ïè9kÀ£JÙc/©@9
JùB¼S­:5)æ «QsÛÊ°ÆGë°	r5¿òa·"*·1	Õm(syOgÈOK%pKÑj7Ã½q¾QlMK»Ø# ,¬k#tÉ²aHhºj!¨9>¿û_ "³ÿÑl¼{µâL,= <ïkx»&<f*Ãtóåôù²¯¾pí	40T¨¨UjØv,
ÄÍËrì*«Ñ7h!9$ÿqxtuøì¥+)~ÎÓ¨X>w«{ÓØV
¥ÈrÕÙÜDì-!wvX¼èX¼è| ©@dê¼þ\Wq^-·«Råôë¼LüèºrA§HS<Q^ÄQ­üwñ{o	-äÖ2À#üHR>2/È­Kæb¬Ì$Q]âþIÜh0BRë	¸Â0Î¨x¦õRöRÐpUd4J8òÇA×¨3Zºöø
>òw#©ª:@²I°òË©Éºµ2,y¨éÁþÁ¢µÍ= qIÖ=M¹I®ïU~¹xþAÎ#|=M0ï§èfðËg-òhuÿªÄPRå;] » )\k3>hl²Þ[Ûî÷íy­îÕ?ÒGçæt®zZm+§¸I­ÈJ(B<£ËrÌ´eØilÌÒoÐçY«°¢;mïx%	ý?vCÝe%½ó·ÌäÓ¤D¦m7|7KñWkí(© {È= ]NüÒª¾FsQ³vÝk3ÝdÚ¾A«ä6aêÖJS]ºà°¶Ë©Wéª´Ø·,[ù¤WÓû!m4ñûù;ðùd¾q¢À@öìÆÛ7/á"0ºÅôNë>=MYóp
|ÞSÑN<1Á·%Q¢snB~,×:] ot¼ï+@
m«0w2÷moD~±­¸¡þÁJÜÂ/z<=MÈLie¾«¥$q2ZÛ~(§¨Ì Gß÷\ÄZÏ)Û&{T\åÊîj=M/LvCCß3ßßI?kâm­çWLÛ<AhÏñ~ã$.÷ïJ³$kk×[ãÂ³ßeHoIúF¥KÍDWµ!b,8<Ø ØBjn#uîò¼ù'Òû'J×E¾]ìV¤±$;ñ«ëìâùU;"Û#Ë×·#)ö;o=}w6Ãª*d_eP¼Zâ),ðÆ¤:ÁV¼¿ÍÀû$ÓÊÒà{ÓõðDV'#Ö²;ÇC­»ÌAj¨oÑÉ êÊÒhüÉRíÑE¿U÷ÑEÜá¤j ^*(Ïéé(=}æåhé]fþòGÜþ_¶þ_´>QÅ-= ºàËy ÈlÎMjÜÊCçÍ[öâmÉ¤	B3·psiíH¶=MáU_Òi¾
rüî|\ è¥+¦0¯MCè©Ï9¦R>Cñ%§E+~ÌJ´÷N1èæÏ×29Øª@Ë?Zæd}î®z¶yad¡¶32Ò*'R®ecËMÒâzoM*$W­k®Y31j2j6jÌl£Dpâ3(FanøjK?,W Ê] ôôÚr÷áö?=Mïý¥FÞ´ûc®Ñ}.$*åÑ°:5nEýe.	j=MDð7£vlõ.LÄãa¾=Mî%¥fé¼k3n=MÄ²EÌ{ïORd(*ç:ÄÈj>îpN¥7oXÁëºIEðaXM:²ëÔFKJÿåHØ1w>\øÀ¦_DuÉo;O ZîeXû¦¬)@dAA{iÿQg-7bÐ¯ÕUæhá£= lBt}ñ1<cÃ9Ã3=Mç¶ÏÂñ= mç¶9{$ÁÀ!Ò^ä×î#Ý|;ü¤×{bvÿ%0rF7O½_Kõ	ÇÊH7rfâ9Â©c
$Îüè¹\§9DÓ½û2òýõ*ðiá²	:ø0ðð§¤ Z«÷ÖüKYÍñÌÿñ>6HH_rãÙ@ð^°ò¢wd¾ ö~öâ2ó
#Þ_ÛNÞ, Q°vÆ7Q¶Â¿áF/±;e9G(yÊ]IS¸ÕÀ¬£ÅôCt/«#®W; qÓVã=MþWé×7õ/ØXvL5:è£Ó EöÑlòõô]½À½ÿ¿.=}¿îmoýn~~ïîÚñ|ãýâ;éÑw©¼â0]LºØ®«ªKFcGç:+z?/Ôå¥ÿÑyþA5¢BH6We{ÕÜbwéGðâFx¶ìØ7¤äë¦¥Ì úk~¡¦É­øòúh¾ÎÒDò£¹Ü¿ºd[¦ !¦3Ã@"4ú+ø³\ª®%= |HF> äÙðÚÁ×&--Ù"Ù\æäÝ?%:Ùjæäjûàçâõôëî
ýüIPWRED;>!(-,36¹ÀÇÂÕÔËÎ±¸¯ª£¦ipwred[^z ¢§´µ®«ØÑÊÏ¼½ÆÃ~{haZ_lmvs ùøñêïÜÝæã0)27$%HA:?LMVSbg= Ynktu|}Ò×ÐÉ¾»ÄÅ¨¡¶³¬­BG@9NKTU*/81&#ò÷ðéÞÛäåúÿ=M'" +.54OJQXCF=}<	ûþßÚáèóöíìyojqxcf]\·²©°¥¤¿ºÁÝÜ9ùÙÙÛS´F´F´?F´F´F<´¶ ØVÞúëúß{KzÙËækz3zÜ³èßzãCÃzzÝcÃ'¹õ'ÄïÇÄ¹ì)XÉ/øÉåhá¤*D0àæt.	èã¼+	­üg|dÌ¬,b´V©T¯ôedÖa¨ÖªHÑ°ÚÕ¨Ãô ´ÌÂükÅKÈÇÇ7õGgGÆ?%Ç-¥§[§ÆEeq'ÅQåÈ!åaSYçÜã[ÙQÈF´F´¦³F´FvÕRßïàbé¸«ú~í_«/®yyî=}GÁFFÙÿ³íeIDBF©âÆ÷ó46ZBhÆ÷·´ ,Ìùù­×¬W´E6YOßðÆöë¦çÌFê?9&¬r5¥RwtM^¾Jw«äSoTÍùPLtWÀÎ©åª!ß¬(xÁ$W¿¨ SÿÄAü¨O³rF²= ÂA'¾Ýö¡ú³$t¿?*ï©c{~,f?«Íebòpûq^ÞkÙDÞõêðÙÀýøç:= ½ðJÚÉ(úãÚ»Û¹î!àµêðÙ°)&5Ù=MiÁ[/»Û9åÿ"ñÓbäY÷ÞR)!ÏzuÙZ=}»Ûù\¥ëëéÝàéáÙÙåa8!áúéëÛú]]!áúéëÛúúéëÛú]]!áúéëÛú]]!áFÅ\áJa@uùe=Mµú¤þ+!IgøUz¢SÁÉ¦Êcû(ùhäº¡G¥Ñd 4E¹§ï1
bL¥9f
üe:£ùñ	yÂi_gCb'D|v3¾]¿ÄzptÓÀg·»sÃ}\Ì·ykhÓ¿d£CÔ¼xW~_ÈcTºnk·e°÷{qãS½ZÛX[¹ÚÙ)ÝáÙ9¿¯Fô@´F´¥²F´F´sÛõa)[:ÑæWÝÜ9÷?5ÛX\	âXYL±Ý4æÅßH¹êOKIÝ':æ±_>éEYUÞPâßNyë÷T©ÞSºäA_PÉë=MJÉäÕ^ùôiÚ·úãè-9©ùa(5éªfA&­ïê÷
/ 5®'Ca[Sþò²0Xh½ÎuÓ8½Ë,­ j¡-f­=MCh³C=MG*¸*2æ²ÑcÃA=M{*>fNÍ*ÌÒc÷A3ÍS²©Åð|ÄsØªs8s¬Ï ÅHE7õ4­ÇB; $Æ©÷ ±O®«ÃUA
%¿8Ä{Îa²u¿
,j/AÕ)PcÁG»xÊP¶ø¶%XÄ¼t¶+ÕÀéPfTÄÍ¼5@~d NN#e§(µ@õMÉjÍtm îæSß}J««ùå"è\$«
BHi(óåT¢ø_eu&×ñk¢@RË­I=}ñ¢s	­tÂëçSt]@6È lùá¸SÆ]7&mªý7ì¸ÓÖ°8Â¨ëÄb6ÖkW
|ØlÑraZxX;3á:´M;áõt·Â¢Mðï%¦­¢Tx½%×+¨(lv¢N:"öbòè+D¼V£¯Ñ>U$Ò'¢ó¤Ê0# j+&ô\|ª¦Áîåe1ßL|_* ßN|Ø¹°Á¤á·
%àuãÜÚÙY -FgfBLÅ1t<F³õäú]éáú]éáú]éáú]éáú]éáú]éQÐøh~Ø X$×¥íÁÊ°8s²©tÓÊ0>'jUÑÎÁt)ýð7ªhx¡jç5= ú;ÔâÇ¤ÜÔ&ô~³bà2{ÿöjeèÁZ%Å÷È©ÓEêt2ÙÞ¢~ø½«+¿K/gm5kÏ;E#
æ}qêÈ+ câdäJõ(Ñþ Ñ0¹Õd(LôG¡¸¹µ"¡\äQã	ïç6Ñá )ì¯ÙÛ*ñÞVÛáãO}õõ[BjRiæ{=}ï¢\5\kÐW¬ÔÒ"H¹FÖeXÐ7ªR±8Ñ,hò$t¹6Ñ^¬Ï÷»mÖæ5('·(ÀgvilL0G¶Ò ¿6Ác§!<­b­aS¯ã30VBF|æ®mÏ/ôC.Wªxh:á¿Ín7= øQ­DI6]üHÛì2Eö²À/¯csF¥.T|;=Mª¨!{Ú³óò¼gAµéïíÖpMºµXõ.úIFù,éã°ßº«±=}Ä±j¿¡19LFENÅ³5ôá^D|n~°=M-Ä³e^³5ôtEö²OF)¬¸¨ÈÔÈTxÀ×¨ÔÎÒÕP8zØraÛÚ:Ü\êt[BïK>(±oº·QH¢÷GFP	ób#²Â³ÂfKÅËÐTþÇëöè½à¿õ»ß½øm÷=Mç9Ó®Ç0Ç°Ïlø©Ð@Ôpöù¶/l.ÅnÎúÔMÅ®½ý}= Ã´((ª0M³kørLsônXScò*T#R#W+uö7OkQ|ÔÂÑæ\6ÿü>öO¦â®	S1¬â8paÜ;L¯qÙBàIìÂ¢L BRiM~¦@L# Éúk|±©<<z¡¹müü·g×Áy{¿²ÕÅuµuÕBvJçÏsËsOw7pv4/(}M°sC_2½gó#sµ­¥¯¤¤crY¬îK2nZTq£:ñ'|z}nn#@k~îx66å'?}­CõpÕ¬ªÂbpY]¥)zú¹¤Òÿ= öè î©#£ ú$*Qå+]fgDôõfe&OîT §Ò z¼ë¨b§t ÊlK§LìÌ¤~¾b¥½³ä£ä³¢ËãÖíO#2Þ
z­-w9lþkbö>së®QSU,â~ANÃuã^X1]Ü¯Ap%9µ±àÂÄï±ÍãõÄÔÜîe29"I<øãçãã=}MuOÝ=M«	Äe ë¥/Æ|JúH3zvå&ËärMãU]:5Bv&pâåñ@ú¶Û7ZÖO;Ú
¸x8ù/<Ï-)ö5-}ðB)sæ®pÛ¤¤É~/ö= £)+@5^O_0R0)¤Î¤²îcÎÉUî¼åÜbòùt¶tº·æ­ÖO\;¦f¸§«ÆÂ9I\·¦]¥WsÂ¥ú?xüYöøÝèÝr.ïv¶âÆÊÈPhÜ  É¼¯µ"²"ËejEGô%Sh+ Í ±|c+yý5[p3¤ã2Þ2GMùmt[ö·û18¥ïµoPdÄTö1ø=}-.M~ßÏ0|§´vÉöÕÎïP,Ol>gµI¸YTí|@1h»ÚJ¸UxXùÏ<Ï/©ø µ.¶~ÈBtzïXä³ÅU%
ºødyáOÝøh-hÁ= ³O¦¸_TY0º0QhÎÞÐ+ÏkU:UgL\xTR}è©XBoôïBO{AÆ1¢-80ç¬¨PùIiø£Þ!¥ßÄçôgºaEO ¥Lcö§fãvïî[Ká+ïù<NÀå@Ê
Ý4r"hÐ59IìÀÚ~#7âsó-ñVC$dsÂKÌUÎZWÁ4É&Á¾Pá{D	=M»ó»6´ÐgøÁÐ7ÏFÇv)ì-S0Wè7B*%@Cµ 0*6èq¾Xyn8Úpk]°B³*Ü_r³(¡­?°<?|üé½a×ÞY0% gì¸±7×|ÏM8J8_û
ð³mùÔNÖæÜÉÝ:dI«ï(íd´öÃæõp£½JÉâ¦áÍýO=M«ëkm¦î¤õÊæãå¾hÛ~«Ûª%K¬ý$ÛÂy0,Åôðñ¦ðb+©>~ãtDq\8þ5=} ë&T?pdzFÂÒûÑgd·Gr«Ì¢Ä­æ°Û_ÊÜ ÍúÑÍtËü½@v·ëØ^ÑªÏ¼ÜÓ ¨;o¾Uzþ{¨XynxûXÂòeÑxø(õø¬T¯ÚgäÚS}½´º0s%ÍþÏ=}Eüx,¨54riüi§ÌÙéæÏ\Ó=}ýád:;tsq¢ÅAZ8 ñ¡æ­ïSl¢L´Ñ~Yç5ç_ðûBó4Y¸úGk÷ÃVhB?4ÔUèÉÛå¨¹ !ô³Z$ZKñ{¹}ó µÑâ»ýRmûÂE? TiËÒ2Khî½/3óOøC´´2ïJ¿5Uk$VJÊp¬8 ]<»xÿÖz¿ïØ¿ÈÍøfÞ¸/×­Ø«ÏDÀÔê$;ÍÊøþW@
¿Íh¯¿óäÕº?Æd§}òLã+ %B÷¬ÿÈeaÁö¬7kýÕQPÊ¹«M~>sFw<ª"A1U!ýÃþöÈ|e¬e©æqob)ÂãÒ¾ûf/pCqH3HEôöt6?ºÜGæëmËËÀ£= sO6©ÉM´K¤GÇS3]YáöuöJ±52wÛ)zë*^!Ç)/CCMN_3lËÅ²]=}Î«kD=}±(Àö¥ûóPÅH¸°ÎVO,7ºP.Ó3WGØÄ¡Ç±§]XlX(æÒLÆòx=}¢´-ÑB®f8q³ÈÓùKJÅ£]èl¸$VTb?Ætòjj*Üë¢+= òï¥!§ws).zJ;¤±OÄ-ÙÚY1Ix¹!=My!-(^S=MÙµíUgù3QÐyÒ[áz÷Ñ= [ÜÄ-¹N¨4nÈáTYëªà)îðyk±A¹ØùØºêÞ:"-hIÙNñoaÑJÁØÙ`});

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
   this.malloc = _malloc;
   this.free = _free;
   this.create_decoder = _create_decoder;
   this.destroy_decoder = _destroy_decoder;
   this.decode_frame = _decode_frame;
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

          this._inputBytes = 0;
          this._outputSamples = 0;
          this._frameNumber = 0;

          this._channels = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
          this._bitsPerSample = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
          this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._outputBufferLen = this._common.allocateTypedArray(1, Uint32Array);

          this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._stateStringPtr = this._common.allocateTypedArray(1, Uint32Array);

          this._decoder = this._common.wasm.create_decoder(
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
      this._common.wasm.destroy_decoder(this._decoder);

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

      this._common.wasm.decode_frame(this._decoder, input.ptr, input.len);

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

      this._common.wasm.free(this._outputBufferPtr.buf[0]);
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
            this._common.addError(
              errors,
              decoded.error,
              data.length,
              this._frameNumber,
              this._inputBytes,
              this._outputSamples
            );

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
        [...this._codecParser.parseChunk(flacData)].map((f) => f[data])
      );
    }

    async flush() {
      const decoded = this._decoder.decodeFrames(
        [...this._codecParser.flush()].map((f) => f[data])
      );

      await this.reset();
      return decoded;
    }

    async decodeFile(flacData) {
      const decoded = this._decoder.decodeFrames(
        [...this._codecParser.parseAll(flacData)].map((f) => f[data])
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
      return this.postToDecoder("decodeFrames", frames);
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

    terminate() {
      this._decoder.terminate();
    }
  }

  assignNames(FLACDecoder, "FLACDecoder");
  assignNames(FLACDecoderWebWorker, "FLACDecoderWebWorker");

  exports.FLACDecoder = FLACDecoder;
  exports.FLACDecoderWebWorker = FLACDecoderWebWorker;

}));
