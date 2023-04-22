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
  const pageSequenceNumber$1 = page + "Sequence" + Number$1;

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

      this[header$1] = headerValue;
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
      if (oggPage[pageSequenceNumber$1] === 0) {
        // Identification header

        this._headerCache[enable]();
        this._streamInfo = oggPage[data$1][subarray](13);
      } else if (oggPage[pageSequenceNumber$1] === 1) ; else {
        oggPage[codecFrames$1] = frameStore
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
      header[pageSequenceNumber$1] = view.getInt32(18, true);

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
      this[pageSequenceNumber$1] = header[pageSequenceNumber$1];
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

      this[codecFrames$1] = [];
      this[rawData] = rawDataValue;
      this[absoluteGranulePosition] = header[absoluteGranulePosition];
      this[crc32] = header[pageChecksum];
      this[duration] = 0;
      this[isContinuedPacket] = header[isContinuedPacket];
      this[isFirstPage] = header[isFirstPage];
      this[isLastPage] = header[isLastPage];
      this[pageSequenceNumber$1] = header[pageSequenceNumber$1];
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
      if (oggPage[pageSequenceNumber$1] === 0) {
        // Identification header

        this._headerCache[enable]();
        this._identificationHeader = oggPage[data$1];
      } else if (oggPage[pageSequenceNumber$1] === 1) ; else {
        oggPage[codecFrames$1] = frameStore
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

      if (oggPage[pageSequenceNumber$1] === 0) {
        // Identification header

        this._headerCache[enable]();
        this._identificationHeader = oggPage[data$1];
      } else if (oggPage[pageSequenceNumber$1] === 1) {
        // gather WEBM CodecPrivate data
        if (oggPageSegments[1]) {
          this._vorbisComments = oggPageSegments[0];
          this._vorbisSetup = oggPageSegments[1];

          this._mode = this._parseSetupHeader(oggPageSegments[1]);
        }
      } else {
        oggPage[codecFrames$1] = oggPageSegments.map((segment) => {
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
        oggPage[pageSequenceNumber$1] !== this._pageSequenceNumber + 1 &&
        this._pageSequenceNumber > 1 &&
        oggPage[pageSequenceNumber$1] > 1
      ) {
        this._codecParser[logWarning](
          "Unexpected gap in Ogg Page Sequence Number.",
          `Expected: ${this._pageSequenceNumber + 1}, Got: ${
          oggPage[pageSequenceNumber$1]
        }`
        );
      }

      this._pageSequenceNumber = oggPage[pageSequenceNumber$1];
    }

    *[parseFrame]() {
      const oggPage = yield* this[fixedLengthFrameSync](true);

      this._checkPageSequenceNumber(oggPage);

      const oggPageStore = frameStore.get(oggPage);
      const headerData = headerStore.get(oggPageStore[header$1]);

      let offset = 0;

      oggPageStore[segments] = headerData[pageSegmentTable].map((segmentLength) =>
        oggPage[data$1][subarray](offset, (offset += segmentLength))
      );

      if (
        headerData[pageSegmentBytes][headerData[pageSegmentBytes][length] - 1] ===
        0xff
      ) {
        // continued packet
        this._continuedPacket = concatBuffers(
          this._continuedPacket,
          oggPageStore[segments].pop()
        );
      } else if (this._continuedPacket[length]) {
        oggPageStore[segments][0] = concatBuffers(
          this._continuedPacket,
          oggPageStore[segments][0]
        );

        this._continuedPacket = new uint8Array();
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
      this._sampleRate = frame[header$1][sampleRate];

      frame[header$1][bitrate] =
        Math.round(frame[data$1][length] / frame[duration]) * 8;
      frame[frameNumber] = this._frameNumber++;
      frame[totalBytesOut] = this._totalBytesOut;
      frame[totalSamples] = this._totalSamples;
      frame[totalDuration] = (this._totalSamples / this._sampleRate) * 1000;
      frame[crc32] = this._crc32(frame[data$1]);

      this._headerCache[checkCodecUpdate](
        frame[header$1][bitrate],
        frame[totalDuration]
      );

      this._totalBytesOut += frame[data$1][length];
      this._totalSamples += frame[samples];
    }

    /**
     * @protected
     */
    [mapFrameStats](frame) {
      if (frame[codecFrames$1]) {
        // Ogg container
        frame[codecFrames$1].forEach((codecFrame) => {
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

  const codecFrames = codecFrames$1;
  const data = data$1;
  const header = header$1;
  const vorbisComments = vorbisComments$1;
  const vorbisSetup = vorbisSetup$1;
  const pageSequenceNumber = pageSequenceNumber$1;

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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01df9b7dd5a5+nd ã ë$Þ.¥ÐåæÙ_ýÅOV;ÈCæ<XP¢ÛÕ{ß×°¤kµHÏ¾ô¶a¸Ï%Ú5×¥BÏc=}{8ÑÄ@Ýø\¾Z^h_Kõ­&QÍëÍíÍìÍîý?¨XçPýÇÕõç¨ïg=M
ä
M,=}§EÙâÞï"j£õ~l<îp6{¬Aöo38i(Qosx´z<NRX¯³RÎePØ]34N«²LEEEerxxØIEEùÞþ©­»ÜQóigþþ©axHÌLþTTÍPÑïKV§£¨<¨¼E»BU§E»FU¨³§wd²äbÔµzí<T¼Í¬½\ÚîûHMÔi
zº%>RÔ¶¾OÂPÎ\y×[
¤<éq¹:Û1Æ·Tj1æËþµIhdí&vÛCÎ¯ãöK¥¨Sñi"èUGqý
r<(Jbuv%V ®9 5OãS)ùã88Mä¼Ë:Î¹ÎUH¢Y¾d-z¹]«¯l´= ´SCáÑ¿ÍG¦Jïû$ôÿÄH-fr 79-/a ýÏÎ´õbhapí.:"ìZ®ähu_(÷¸= º¾nHw"úìPP³-ý: ¿íøL;LÏ;ë·Q¢Y©ïC8Ë	t°G±ðR'ìVò#ñÁµ?ýóD*Ý]l­Ü±kâMzÿÿO³Q3Ùâ²,à®¬âaÖ>uÙëÝë80:bøÓvq.^]ÄR"UåÖ­À	FÉY°qT3Kb¢,]'¡¢uEÎU¨¸Mj7¹4eºHÛîKÝÞO2zÕ|.h´sf	3nkÄ2¹©ýíÄzâ{ã ÂëÛ1e>aH%aÃ)ö%xêB íÚ¶·Îmñï+aöÌÑónÄÀ?¾Ø³¦â*ím´URÚ¯³¼O:µØÏ[£z¥AZÄÕÛÒVÁ]®(ÎdºOºÍù)Î+(24ÇÏýê4ø:øàj-Ô\ªÜaÝç®ãyrt84µÊÈô7	¯lÉ¿ÊÎ7?Dk_/HüútzÇPçMÅÀºd[Ñn&Ü( .JU»;ùY°v¶P?CzÛeðWnB®²$­ÈèKù<x[ AQw8·º8ããæDµ'o³Ë±ÓõúÅ%Óí@MCdõxIa¼[ÐCÈø,§FVs%)2xr¬á½zµx¨NbÝUe5¢Ô«Mxâîb¨l&zß¤[PÒüueÄh]~-2è®ß(_<ý\¡d¹ÌÑé|§lX÷±APBP"M-­,rz$e>UQLÇ|ÃG×L7mMñ7ñÄHß;M"My»ëQ"Äàr÷ºeÛ¨CFê¨)#WmXÃJ¸«9²X1i:DUÅc§ÞÕ%$R{ýl½ª£¥@ýî5{Q
a[
d¶d¥UECÎ³3øPy¤c|¨5â²]6¶vÃ'ÜünIV(>õs_¨U= U(5§ðSàÐ@Áo[
W[LàpÂÂ/?Á'0¾ñ){9 Þj/ÃÅ',GÏ6W$nÊånYq:tC§WÇ¿j:¡Ûáxr»My©0T¬EbP¬Pk#ñ[H¬ikx»±aÂÐai¦7T«}ö2pÍ¬HIkdñN1w©<å¯ÿª0È»¯<GZàCÕ4sâT:UÜ{Aä5T£âWe¹X2þªÅ;åÈ=}ýSRÓ0^::õ= [R9F5Íf(£ükA	B$wmÁè5ÆVgÏÃ¬;¸NµZÇZÏÉEuá3°yTFi»W,OfCù~@ÉøG}~²9jWqøÔk#?áÙÅ:ç±ø¶TUpÃ·uÐä¥oÊ×8Q#Lp=}Ól¤>¾Êõ=Mäjl\¹"%µînvÌDÀÀÍ=MÜ«¢Q¥= U 'J¢áÛ¿¥u}5" -%àÎA9FÖ¨LdÜ)D©¹çôÜ·f7häXñëqdm= Ë¶1fãFDË¼kåøYoÚJÊçiD²oÔÄzEë jaµâ¦sÍÉà=}+=MûÏd ñlíDÜ7.HlF$2À£Iá±G|´½ÚPõP¿j)G:÷¬¨Fïs15bmäyGë/¡ú}öá\·CÁÔHèß= +ÒýY$8±*sÌ5	±îtùÄ])÷= ´ *@C"u­÷¸S­§}rê%Õa<vCÈip*6nË´8]CfF*òYeåÐí°Oª/m=}q6ã¯#zxþ>Ní¿Óý×¾' 	8õ>t{uºB:ÂÂ^¦"S9Í+ »YµÝ=}, M78E¦Ü²ÈÚKXyÃFÈ¸YÞ~ì_*üæËÚf~^ÆU!ÿÓl\ÂLäæoOtÖ)bÌ/(}qM£9V>)^¥ÏJ¸ì8èíÛÕ¾@¤WÜùæ!Ð7ó^=MGôÛi¤Ð¦AvÑþÜ½ïb¿¹äÉÊ£¿e"ýW= ÕWq*ªGxÜ÷rënºßrKôDt/ÉiPù+°âeç5öq<cxÎ¢!j?´³ÓB ÑbØüa¢öï9¥á¿rHüæípKä;ÌM¸âüp¡!R}µ/*:ä[¦Þè5Æp~f\¾üíZ¡ÍÊê#5t¥Ý}PýZÞÃäÂ²>¹Wê3åHt4 6ß9Án$áSvÊì\8¿ô¥µNóµb<ÿ·dåèX=}È<BÇüÈ©ÊXAÇvû«Iß=}FÔÀ_aq²i¿ÒWÙ7Lm}sk&Ý	!eV|¦@'èjíÄÎwxÞ!ÔKÜºU+IVÌ"¾ÄÉryôýY¶sèO4Ox5Vþ|rÇ1¬¥w>4÷÷õ¨³ !?¢2_oD5,E¹ÿ¼æ¾éü©@À\ëÓocËÃÎ|B^h§BÃ~7#õ3Db°pNXLH;âÎÉõíÄÈÜº^Þü¢7q^¦oÛ= þÃ>\æoü&QD6TTÞÝÚÞÈxØßåw x<£ÍáëTaÐ(IäùXÎ£×â£­pûMg¹oöb%§êÁÉF»Pô (Z½ZÎÖ½Æªö4°^EÐûï<IÑà>bÖgÚÕÇXÖØ_Î±à¾Èàþýî×³B¦ßå³B1F»êUzýBÄWÜ¨±¼Ì·tN§Å2~ª è»Cè§ôÖl¯Úw3 Ä ¢¾Ï(!ûâ@-3ìLþÖµñëÕe7×ï£ÓÈ¢%av)Ïqãn= ãvoè=M èý- W'ãîð»
 èMùç~çíë'O.aê8<ø ÏiãÆpvfi¶ÿ­7»ç@c¤#GÞ££}(è&ïvæ§ú±}mE1f]BR]þ­LiZ_]éµãê,+ÔðL|ÁÒ¢m¾Õ<Ü-]©BßÿñÍD8g[^#~*Ó5! c|k|W¬{##ÎAÝ±L2ÏGÍ
7éÚ²ñ\Ñ©Ïµ÷)·5è!dG*ãå+AÂþäzÄKEGÖÆYëzÄ(Ký©·Í«ïE¤²ð9EcýùSDcïiü÷
òÞÙúÊÐ"¶¤ò|Ú7@Uhúl7âK»AJî{ú*äQÈQ	?7ùBl;ãQÉ´Äÿ¼ùå6³ ke½KéÑ©ì7´´"/smGQßÌßgsCO#{®g=}ê
¸0+äÛb¥Ä^~]#Æ©ú)¶|ÒÙòLÞè¢®q]IdßÌ~çKHçeêbi1Ø®ð«gÔ4A&;ÜBúJ÷]ÈA>ÒÌ¦È ßc>+¼Ôö{¸çïr³± X²0² súµlÑóÊ%ÿWË¤Yææù9óáúýh!)Mÿxµl{["§CÏÑe{æÊåÒ+½¼Ãñ¯;?Ò?²"
1ÒcZ¾KMÖîÈ}¹æe)Áª:Íãº7îi/¬TPÄ}¢5yJÚ4tÄ n3§GÁÁ%c)Ä/¹ú¢óÛîÁáÐÔÉb¹TöÌ/é¡mW²ÛÇµÜõv­qLEwïÚ¢õUÍµ­©(ÜË¤ÄÁm³vXE·´FË1´îSDï·Pø©+}±ïPßLìüDqôò²¹£,(´ø0Ûz®ÂËmüqDP\71ãGLx(F?Áxëå= ëã8RìË¼ã*«,S8= @Feö7ú:oüéÓHsá{_opõæó¤tuænó!îôerqlZ½=}VþM¼s"SÅAýÙ@~»QõËjÙæ×ÐÐèâyYÔæaÎOn!wý© lÀûæVe £÷|*ÖËÿ)&Toú´Gs§ð<ExôJxò£KÄedË´GÖ<þEQ-H7¦(²t¶¢täT'øvp9Ðf×T1J1°²èJ4_£*38%·.k3Æ§çbH¯bÊÊÀ]¬}Hïlö§ë= ÈâG¯gfU&æ/í!ýV]QµÑA|øu«Zh0YCWx9ÉÜ'ü½Î´õí£ËM£*U¥´Ãd©Q[óZÄ<¶àÙ|J+þz4:w%±Bn¯ÁâûZ¯FÏXÖ¯.râ<Øô®bÛ;Á&0ØSUk¢"Xbf8û£ffb­»@ªS |Ë©õã¸õZ½T 9±@ÏxûÉýs:6x'f7+Ã¶Qà²pÌÊ
äUCAqJf¬ÜÔLþ1BÇ¯aàî»}2÷bÈ¬G+= ¥óG;Q=}7ªxúPfWËkÏ·pk¦D ý'R\= ¬ØÂ·KàzA²a¿Yº(ÐSd5 IÍÐ²Ò²Ï2Wgö§a&¢3 ~M²ÌGz|¨-·9q7Ù²'|=}ìY¸9:¸ÄøtÕ+µbìú¿(PÓ/[½,?´ÄQ®¥þý?å;? Bc-ø_*
=Mý{ììs2¦tß3s7ô¹õ£rU\gÑü©VQ ¬£L2	oêVDvÚ0xóÂjtCVRßvLzÈjÔoZpT;AuÅWîcy;sT°Oµt_pEBÌÌ;Cþ17ääá8Û­ÿ^Õ/K®£/$2}BÞûV/ñz©ú°Dµ/»?Ú-7uP¹;TÃ&ÍXMh±-ïé¶¾[=}Y72YÜNÕ´n¦Å&ý
Ë¾¾9\óBðâåÅ>°!ÒÙÒ£Vpi?VEåkM÷²´0Ú6ùQ)=M $MG*= óX )ï@zÓ³¬3?xä¨º^¿{Z=}é5»ÛWSÁ]3¹¸f4;"F³'Þ¸9ÏÊÐÜÉ©)ÏÊ¨Ü´ÌÙAp¢#ÉÒ°Jb"r:¥´Ùfâ´¦éÛÖRÕÊÐÜ´Þ·!ð{[×6?Ñ\ ¾Ø Þ8¿ÐáþX¹])ÞL*jGàbÝnÓp¾Ú¹úI]S3GÎ~míååÑH¤=}µ£Íº¥ÜÿtX¼ôA¸ âKä´pÁ¸-ÇVC¡÷«AíÁv+(D'èvª=}@_*Þ"8&ÄÒÍäûN#ûäÚUwyPj@¯D:"*Ã^înÜª.ÜÞÂpÖÝbfÕrP¨YÊ´(ø0¹MóÊ«ÃÖÕÞTwIÑ¦)F,ÈË2!*üYÝ9{Ô¤ú6éò
´x$«YÞ¥Ö1§7(l´Ñ9
GµÄXý;,g5"¦ÓOå£?Ä~@R¡ÀsÕ±ç²2mí~üyt{eÔÃïÊNJH:îêý®©4iá Þk¸ü¸»R'$îïFé<§jñX¥CJêØ= :ÿSÒ°
NÎo<y= YÌÎÏX Ôàû¥Ï÷ª6×j+
A&AHa?E<i,{»A+Âï\VKÃähe=M8%$ù^¼ií©®:°¾YÓ¾e.]×çiÝ´óëß³×Ó°JîÌ7Ák ²ýA7)¯õRê*ÅCç	Ììµ½t ®?:æµµF/º
1¤×_Hù¹r^?éÖÎL^¥ø'e(%(uoì:ÜpKîgGNìä!Q|Å¥è±o×²6ÂË5!xÉ:ðg_o²/éeEv§ÈpÈ7EñB×iÕÜ²Y'ÆÒQ-H9ô)³Þ](Ãµz}àþÇ'P¢yc2wîä6³º&¼ü²cD@ñul´Ð*×µÝ°©3c~L×ºO¯fãFP¸Ö«xÎ¸#p"oËù·àOü©Bæýùteé<æå+|]ìSÈýÏ= A·ÁÈôV1>êáÉJ5[µ¶IÏýÐ¾ý
ÉJÔ(>Ê4>j;n»2ÓÔµ|³¶>$Òcõ|1(ê"YÕÃ»ÆM»RãéyWÀ0^ÃDÜè³ºtU.qIYWÞs
(ÑS©t;XùÄ¡ÞôÄa0müìáÚÚ»p­RAe¬cWxn$öò¢°Õb ,KÙû/bex%é\tÿÉ<÷dtú©5ÇuÑùîû{V<«»èVHaVLþ0Jò×J72x$?R·e]*9Ì¡7m?«µc°ü÷(Ä{@ÎéB"¯xç0móZ ®Ió6
xÙÖÆÅ¯å9+óÍylÞ«8LûÿßÓÜpâÁ¦áó~]µÒêôÓÜeÓ<M£ÕAæúø¤56aÜ8Ò»Éf®Õ :lóRKËúOVíeó3 Üg´\òðn·Ã8)>vÓ¯°Mx²ÔËúÙöH è)ãx÷Ls/è-eôÒJwÍA½î(;ÂãÚ=  Zô|èyåð·] ?EÚ@ÌÏ´Ý'èilïOÁvO}±Ùôæì;!¥ÙK,Ã¿ø{ï¯mcÅ·ÆgôñùÊn@øe±¿-&lã÷;úë£¤â2Sd»ázÓÜR:û°MÔÍWàÂvòE¿¿¥$U8a|4Á<ì¿[ª$j»³Ã?Díý9%íüÇ+übw#æA(bU#
sÇàU¯
¸DóþÅ~	N	wdÒ/*+K,Ê
3/xE>m³!.{©
3ðýÝ0gõ·[âÂ)K¿1£J,ü¯µ2¯ÅPûz+Kçxû"ÉüuñÚ´úðmGVÜOòÑ»7Ò.¤wN)îP{3Hs³áyÚxAtbö*¨=Mxt*$?F\
Új«&zÒþeøÖCìZù_{h1}Àqåç­ø69 [òJÇ|ªê1pókct¯÷c2,vf!«ÅÅäÊ¹/úêX4@¶"ZkýD=}ï%µ_uÔö1hËk<ËÃDÕB_= uxÕM¨o)¹æô%¶¥ùo$áIñHW= ­{y
}Ü'I#³ÜßÊfb>ûØöåq..ëÃÓÃµ²ikèuTyÉÏsÈl$úõì#¿»Nì|íLP:ÀzKXèÜ5ë{,~s\më·9}"j³ìÎ¦Õ¥ê|XdAÇ?o¸¡}YAâR´Õ3VBf{S¬ìíCÀh2IxâÒo*%Í´ÙÚ}b,FþiÏ©³þtúlÍ"'+¤àtäCMpË)WÜU;]¾iÐÆ^ÁÛÔ8N¯ù)ÐNÚãu»þ½à3$5å7¿È,ßêúçLe\Ðgç)1Öv(8ïikxÂÌ:±Ü^x¾= ÒÚ&@ðÔ&ú­6\%Ò¡ÛÔöÿæs¿»DH+E¬B²³(É0k/DÒ¨Ò/¡äh+KýfíÙÒf)Z êÄì12îvÓµ9Øje8úõ}¦Óòåýeø¥Ô

WDUbecRó¿Ñb+uéèwU³ºpø÷Z¶ÖÍí&A+üY·¬·Ê!P=Mò+¨fAVLQyóqHÉk+Ñ#lîËu{Ú/{ªó2È¹Ý¼wÞÓ.Qõäþ@ûSµ£½'Ê*ÃeÑµy½µÏqñó½O(Eq©ôµ±L3¹8²*I*0?J Îyyè9¶.¶¬·Ãê¬aøª±"öÏmñ^ºko|÷P¼7§AËTã:/ñ¢u+e(m¢V
.åHìÌgÆë	Û¸3}<TÊôäeÚÔ$äºÝÒ¿Um«¾?÷¢á= :ÊÃ¦wK¿êHâÎN£h¸öWÒ³½?Ñº?NÄ£ÀèW¡»¢Üt+qPWuD¹U·ßµÌñ¯<A¹0{±<
 üS¶)eà/*¶½3@"æB®Ãkµ©´ÎId¥ÅIõÙÔ¬pµ°*%{(Ô]lïëÇuÅ¹p|¬AõC¸ÍÅìB2¸7lBìIÒS¼-Dê(F,,r[éPAÚà«=}0ý·þKªmå¨¯=MdußäsÉ5^rS= 	4ñPüÑó.Ôª1*Ö/«*÷Qe»rp¦îº¾Ä{¢kÙ:}2Ii½Qd!Ê®×^QÛÝ
´~ÕÙDEÙÎÕÛ>°¼Ý~¢6¤¾þ¢6^ç>Da¾fÉ4]í>¼ÞM[ô§®Áz¾cYÛîÝ¢åÖØý²8Qi­ ¹9^ÔLÚ²ÆÓ÷a}ÏO¤ÄÑÚ.>Ð¼6í¤áb GÄöê¯aúÜ^\p]­ái½Kd×ôÙVj¦ Mw@BÑÈ=M¿Bæúì³\;ÜÇn5H³¹SLÙ«.;OÎ^×ú^×õõ,{(OïÖ©},
oiº= ¾¢&¤h*Ý85BB¦*ÿtÍ|öe|®Dõ40±vMOPP>Úöë$Õ;(¾·¡7ÞvöaùIù}ðóãú¨ -Q® û° L¬²''l[9QÓµYykçäe?¾ <ì
Ë·F¡}_·åøO¿Þ_M»ÙÌX:ÝÆjØªª£Ê¯)¬ÖrOóY4Ph[«ë­e­3cnQesÜØ¢t^=M6â075ÈSøc ø¨êN»s®,øWýÓAì[â,AøüD1*µ	Ý÷es¾'c%ü§.ðÉøG|n_4õ6¨ø-á¤$ñ´5Áddµa){~9YõÊ%	kË²÷ oå±×ùu¾SÛe7PfeØí?Üh^®¥t"rõÅøsø¯å´ëí¼öXª3#ÏpËÌáx¥Z£¤ºnbo>6_àá¡=M[À!ªÏ¿°l=}á%5)wÜÊÓÄ¬6L@¿N>%?_eh
XìvÁL±$N»Cr:D:áë{J	ÝÐ®¿ëéàáñkKfP½ñ1
X!«Ì¢LË·ybZÊÍ¨X¸pÙ¦cªScjHëg F.=M£¯¢÷P&\Mðübedñb:\0*.Aæv¡±(ÈFPæW¯|÷¯¡ã$ÏÕ|_w4Þ#hM*ÇF©U)GªE-Nõ?ðñ²ú¬R+ðo³"xÁ(dá4R*"ê­É'¯¸b·zÆäw­£IV:zü s|Hõofù"â·ZO}þ~wÎXE»àÁíusñYS2FÚìTX·=Mé­ h>^ÌÄ<ß!n}m÷(w<e(ÔØ:¢;}áüÅµr=}­óÙÍÒ	K
+Òë0ìR1Å"£DÍÐ¥$­"9jh}¼y
!gë v}Uq
,	²Ø:\Ö3hBr>éHÉ10DS# õvmþì?óãciüKóÏDÐ=  ¬c±p	¾µ¹mr¡tø¨²ï?hyI=M÷¢+@f¢nI,IUooÚ<»pwx_# õúwBVØÚÍ5A¨ñc}|É?=MÁó¹¡óòm®Íó]H²x>)Ñê6µRðiÜéfNÀ³ã
l2¡hsåWÆsÇpµ û«êðei|áU1ldBüc2b¦4µ·mÞJ.ªötV	?}fá^ÀæÂµ±ÛÙ6E\(Ä³ÉX#Ýó}®¿nXG+YøÐ,=}ÜA«Ö¹"1c9÷ÓEÞ2¡³GN»bÑX;Âu¼°ÚN=My¤ì*¤ìþD½µ3OV'"Îò+Ý"ò°n^·¡¥õvXÊ&nz¡« »]Ä«ß¶pû®ð§dQ·FjÿGÿj®Ô#Y}ìè@iÄÕj´Ãïù÷ÔìÙàá¯$GNT¤ßGq$þûjABf:º´È-Ñ|@.­ +Áµvìò·¬t <6NZN'Qal|4XP×Ëy½|º¹±ðV9[©"ÊwbÍË]Ë¸$&
Y¸5R@pc¯A¹ÁÓ!=}íä.2ñöCÏüÚR'{Qàr¼H±7·Ë=MqG{iP:éR ^í= ðyH= öy1l5>cée:1Ö ªÀé¯ìl,VGùvÏQ±ÛRâ1Iä3ãc<×W1øJ$Ò ã¬=MpLc­¾	0:Õ©³»ðW7ì(,ÚT_VûL®Vda}£cËo%ÿëÂuØDröÃëðòióO[~æ9õzÊÂ£"Ö>÷aSUq}Qì©¿;Lz]HÌ)&çqÃ{Ð<F5·Lèqº»ªµÒú=MÑÐÒÃY#~®°Ìh"¸²Ã,°{äG0s½ä1q!¦
§sÝíø÷÷2e²j·BF3ÿ¹ÖveÒçO= å¬-"këÇøû­®±¶ÛÛz¢;WR£OeÖO©Èµ"ÍÆ©ø´¥bÔräÔAGlx£Ðð"Qå""{ÀA2AÃb¼Ê¾ÖÅJ^& ½X=}oÒ1ÍîÆÜp {¨³%ÃÙ¹KPL5vê6è ºçjKûz¼¶TÎ»fFnÔOÆM»([ªÌJÆT½«Z ôÉ±Ý´¢¼PîÀ/^f±ÁI¥=MZvmQA/ÿÕC#ËÕùËU¤H6×Rsv7ÛBæäÍ$X;×]*i>yr¤h]C¹­©a{He"jÅh½üà;*÷¾¾å
sZåÌü¨Í/	«k1¢¼}èPCUìU×Q_|¡ÔÂ²
ÁýØù¡YT#! (Þ]»®¿á§>#¦Ú¹²JÚ°° -<:Ä\}ÕÅGogz,QRË¯ê¹í}Ìäæß>	8:»A.Ú?Ô_A~à<·ÏÀ»È5Lr<8OfÂkÙÚÓâ)ó /Búº]9+êáúVÅA.boÆÏh¢¯BÿHh
ïÜ!~áÀ
A½×?+¢<"xz±xt#öiHà.W¦¾ÉÔ[*T+\e¥*Zé(e¸s½©½$}OlÀ?=M µ81©Ìl{"¬Re{@çzzg·ËMnå&VYNÂys1XfÒ1áçã¸î¢RGÙZtuFj= ÐõÕx^®xJ= òGy°ÿôí{
B¯]|ü'ñkÏàÉÀð½aÊ H²Í*lÉÆ MäZpB*¥ýáûÅ±õhõëDeÒÖÈÖzÌá{;¹äp¯gKØtè
ÔÇCÚüºÌmÓ÷£"ìcm»8t³+OòÞNÂ±
ö &,>QQ×O¢Ý§ðÍÍÑ¢»Ótú¯:¶jì¡Rð3CÓo´·*·åccÒf­]YPÁ²U,g´ª{=}ó&òzdÜYÔébs>Ìkðü[i·¤÷Òé-}ùMÔféIs~uIÔ±^Ù6ÜXöµ{¸ÖJÒ9ûÃÈ|-¤NwÝô.L	ÍOú³ÏoâÅÃ=}L¸£ã	F<Ú&m\Ô.ób·û¦]ËrªÚmyöÛjÙ¬£>Ä¸Ó(j·BÉ¹MÇIýÉýw]wIÀÈaGn¬M"f\ôì5¿6d>K^/ù·)bÚPåk>NÚÝ¼I×®!õÔì+õÊ½¼°ý= b¨)Y!Eç¯ëOè5,ÊA^¥5sÞ1ÁÙ.G½k_Ìí±Ze´ü´bëÝYî]M_ÅnZ{zccÌIàÿ[WÄ÷pJßÍDR(.-GBÈÂä<²|HaP·°ìöà¢P-ù	ËVKý9^qå1-k{A]Ç§åEoÒ/·ë·,fÌl
x ª­81ÂEÁÞlz"J9¯­ÀßPºh ­Ð¸ç9~ïQ*'ÿ-TÑ|@Ðk¨ÿ±¡¡pëºÅúUÐ|y0xwv°X*ÃËÃa¬Ä+!S%F!²Âg@â>)'
Í·ÔPIo	ýY@n¶¡ÈYo7koõA@)èüS³¤q¸BÝµ®¼%ñc>»Ë]"ãÖÇ¬fßA3,ÓþK6¤ä9¸è·açéÿ±ïÏSÓipoyewL´<ÓSõ)0U2f@X.kH,+ù¬(rÖà,õ7ÑJIõæö[|
óCï°ê·6 HpåÁ[r¦$88f§ÛkýÜUqi×øºF¥ÅÄRvÑÎLæ= rtüªÿTÄ»yÎ/ºÀ³=MË073HE.Â«Í¤Lý ÂÍÉßÝ}ý;¼¸Ìfg2m¯¬ÿÕcÆòW²³Áý_ 3ÎÝ[ÞL[é °üÅ­zlËÅï°_k5Îp/ÛOw²aDÎlPhäBI ª$²®¦uT6IQF¥å¹3ÓIG0»ð¦ç1uá}?[?ýû 0êl+¯Úè:¯G	têÃõcÇ÷(W?Ï
×?'WT0ÈðÊ(Xôìýë0;¡Yï$ë²WZ_í9µ8b´k1Ð5û£úì$Íôäð"[îØkhçÍZÙ±ßÕ¦àÕø?Vû¿ÑãÄ÷?î_Ñøß=M0_Z¦àø¿ÑÍãjB_A"b[¥#7ãbaÉ ß©P_$á áSã÷-ß[GëÏ º~ðõ¡ÊkÌwU4õ¯\]É¢@QûNC©MCT±é®%I?= Y5Ø8òtB¿ÞUµ¶zÛÃ*rØûXÜqrÅ¥(2'+Qq¾Ã-Ñ¦HyHyÌ¥{Ãñ ~3Qñì?^û?~àU¦à=Mnà3+ôI^	³¹ÇëÉ½P,eíZ/z2UG÷3í'/ 2}/eêôIlæ_tõÜéXå®É¸D¹T+CÌÃú\]¯u¸ÙF£ = íp>ð6ú¡iëéÛóÄ]ì<@îñ¾æÍæxÕÊcégTÙT¾XÜÀº5<vÉÞÑò~dÍg[¥C?ð;OD*.Ô*µÙ²+­µ¾L>®êº¬ö@¾«(Ð*bÖì¢dL<$²â×åe-¦ø6c.¿k}7²ZcÏôè¡à [l ×yëÀ
÷¡c(óÄ1Öä¾Ù*µÞñÞÝöçJ¤'¥Ç¹c÷@÷ò4=}c ÇçÀbÏ3eO"?ºq¸øDB6×K'åÙwÙ7MÔIMt'LAywò|ó¬ÜZË°:Ü+5á=M¾Å FàÞÉèlO²Bqs8ÓÁì¶ÅÝä9Ã\»á& zwy©·î[:°NLõR>[b*¤Ne
ÛÌ6Âg0½¤|k»öNÄ½ âÒµ²¡ 5Nïpd,¢XáÍ^âEò=MÂ´O(N¾E|ÒøèòÐ¤ð2b°Â¨X±[zÃuïõ{p­Çûw 'SÌ×±MqÒéÅ·¾½µìªÆER3@!­ÊM¿Íòr¦Õ§Æþ´ÌxoÒu5ÀQÄLåº5é¹ú´½B!­Lÿñ!v²÷'DîÎ~àïH#ýÜdàóÍþC³Ø4RTL´LÅkð¦¦LÅALËAHâõÇI@lMø¯Ç¨'Bp''p£á=MåÈ¯·×#¡xW ;µÌ®e·%w¹¶jélVT2ÁóGyhÜíKT[í¿= /É~<4ÙÐÏ·!Jr@üÑ»P4}¼×U=M<ð=}ÜÇÒ8SñêÚKLP:?ÄÚÎÅ
ÕWtH+9É*õ¯v++6¸ÿDµW[·²m1PòÄðó&Èí/F:Ró*Óþ;=}lvýÙ¡/=Mv6eª¹@ê¤ªQÈðÖ[Ód¯	ãÉ":ÄÑO(²Ã±w©¯[Ü®¸<Ï»§¦\Ò±p§ÀâLß¯J±ÃÁØ.°_¤ßÐ°×öÝôg^b¥aÐNÛ:ÝìåÐ\m¢ðñù½ W6U5%æ¹º{eV#âWSÇ¤ú¢|_qBö?H¯üNûÏaª½)Rî´&Å×»z¬d2G;ÿUy¢]¯|?Ñ5¥!{oQ¿W	.À Rj¤2ñ®©¸æK±ü\'Uµ»ñx+Cm_SÛAä©¿|Sp5°çNælrZòõÅ£Ý¤ox<CEP@Ð±2%©rqÖ÷1cCu;Å£ÊË½Ö|m¶1­ñ].Á²=}:¢ZÂ5vN¸º:ÄÖÓ½Y_Jø M|©n)ÒÔ"ì³øU³SÃfäfõl)¬qÖûZ[ýÒÊã@YçÝ§c,ZCöYâpjOø|?ñ¡ì¸ÅCK¬RÊõU_D
ÙÞ­ÉWøQ¿¤&i	,¿2JÝEÛ[ú"í/_;øèoæVóí6Ãq;Ý)lXÀ¶ p'ÓæA¸"XeRÞÐý¦Ôáú¸ÁUg0>5@¡^f¯ï´òÚ¹ÕÏpÓ[ãå#ézö%Ý	á>­¯aSä×}i/cP;0àIß^8:NÄ¯)ÀÌÕ|åtSÅÊÅs;3ÉÞr$ÄÛ>	Ý¹¼%ïºª=}[û@åLçuFª+zmJª <ó>­Kðn³Þ¸7(9D¤´_Þ=}¤¬ø[Ò*ÞHÕ¯®o0z¡,¼Þ^Ge÷Ò¼Õÿä¼è9þTÕ½'^¬,×3wIù±¿BØÔçÙ¡ZûBLYæqîRkÎÏÜ=}£KÒ= =}å¤0eclNãZð§Ý¸©¡ÉNô\úêÏzLgÓ¨2$IwËïXh¥Iÿ·:GpiÍ±÷Ó= ÆÅùéöJ ?ë>Ql¤-d}boýYÏUÒ¡èñ/)T» âúxêwÜ­ÀíÈFÇì+¿¤î£ô>nìL¹l8µØÂnyÿ4ØôhÀCAÝíÞÓüÎº:ÕòL{0ïú[Ù@=MòãuSxÒÁÁ0±·Ï	þ_à¨2¬øÒX¤¡!ÏOpVw9©¿ î~\0= 5sK ©®òëÕ7òú?À¬ôCö5ëÖÑ@âï¨ðOÅG±)t½ÄSX~Nu¾öda¥=}mZ5¶¼¶	Ò¶Nîê±y÷ññ§iåLý1Cðéò£ä~qúé«
££WK¨cöú²B÷¸<&¸®¢õ¿ø±hÓ´±ýÝL^W15¿äíÒ;H¡ý[@ÿBÌQÁÌ|I=}Æe&^ÇÌÕzú¿&÷MÙÝÐ.]q¤Vã%}8Eßzï:O³wQÚu1ïááÜ¯ISê%d^Sw'ÖP¸¥rã6¾ÞÝæçªVÜ2VÔñýÖÐ\ÄÕzVÕ¥z¢fmÕJnV¤ÊBó&,KYIRÜ¹n¦|¬æèV¥îñ¹Ä®"È¤¹<ýx]-søÍDC"Qc1êé=}x±¶ªa½Uphw9ByKi­áACbXËMnì-Dè¸ö-DÚí}ò+nÀ­=}Y§NõWÈp¨z÷¨T×J
ìêãî6½;tÊ à+BÈäwúÄXd÷VDÖ­úÅU/÷në= ~h^ Er[µB÷¾LÎó5±
/¥Jó§R.ásß¹õæ©=M?£gùv¿Ã0¼³&=}\4Éº«Ö5?)¸±E ©ér,UÿC»]Ô¬~ÙwKÞª ÛîµvN£OrOYã!'C= 9óu|þÜà
\d»5
Dù]mäz«Î
<ZCjVl¦×IF´VÂfeM= ®¶²þÃãjû¢¬4äésÊµ¡¦yÿÈ]­B®Úò£'BßIÒ ÏªZµ'|#qÎÀÚë°jGthS$«\¾NH+;4·÷¹KPL¤Æþ©²È.¿!9GÓ:±ÆÆI¿Ãì­û£hp= ºù©Î×â¼XÊíß'¥#(Xlº#Hñy m:EÌîôNÅ¶[ëÌÕn3WOæÖ{¬búw%öÖ´Ó7Ñ¬
½åÅyîàO#£Å=}ìÎúô mÈè¶JíC0ÅÙÁ:¶0üæ}Ú~²õôM= \Ö®&I0y³§ìUÜÒÃÈu6¯ ¡Oç.ï= 4Jc6- éûAÐ÷ÁÃáäf|áRë+AGñ®Áè÷ÂÓ°)z½tÛá"'= v« Þ@»¤3éQWªcOBÆÞ7¬|<¤Ú5tïBßESýË&½þÛò[µÕs^å*8´j.¿¼èÓºÈÉý
ÑÌ§È²
ïe9µÕ÷wV³×SZã¬èðÛ÷ND§{Eæa[}yèÍLÓ®ÛÁK9¡ÏÔi¼Õ²~ÚüúfÌ~éM}×lFjü·>xh]4_HÎZíºIDm{A÷2Éî|ªÛqè\±ôLý0áB=}}(B#õëûGËß¤;;R	ðNs(8D
xk©(|ù!@Ïüh]ü?éYÓ¿Y~w_4äÆój sç@âá°'$önÁXOmclß=d{­{±Ýr´<QºÛÖJú-àNÊÒcî³¿±ë|c*íÕivø?AéôXazÇf¾Ô° ¿«0ºjôÈ¼c±ºùwÄìïæ&õg¤êsÝÍeÝSÈÉQSTA¶IQxcÕÖ4¢z}©bUYÄSÀ¤Z´6}ç	ÔE[Xu1)î½·KßÕC9"8¹Ä!Ë÷kà¡aFãèï3ä´  P K2ïLÖþÄn¤ðá>¨:4[/ÅcÛ{n2fGÅI²0z2óù}/s)é	\M§æsefPÃmPvÀfog¢ö¥´äf = ûö#zSééëB®puÓvÆóøáùÞÛAtÜ5d<Æ'{IDeãLúm_³×"r?1\'x²M#,Ö1ÑîWk=MËQ$QÛ0ù ùIËXA>n[§.1p1Èó¤Ìó³ôÊïàùG¥9üæ¢ðÓÌÑ)þ¸Q­ÛM÷ëRÞ\¨²~ÑQôóYÚÀ¿m»êÝ$_!¾_tÜ¦äl¹ÔÏ{¿v	Çéo¯3j|-» @HÄ¼,Y¸æò4vxM¥¬ïgà\_³ÇËâVö'rÙåZ3(t:Tc¬ÿ­Më:1@ÐÄZ5Ø;9zÙ]­:B¶
rÊP­fa]7<Ê¨ûNEüío7ÍxÄÃ¨®õÔqÂXC¥Ï#»¸>¦ìRâ)òÍ6ÌÊà¢!Éì~Q*%pµH=}à%²â(èç;cÑ@» ¨àÏ*rP¹]£QÓ5U±2kÞQ"5Î2Ö¥íª?»cÅqôªÔí/îé|^ã¬8ËÔüb äX¦[f7|A*K§XµÇ±ò4ZÊÓUÆçÎf3ÜAô|3öÓb[\©àöoøä!¾u½¾Nî>kí¼nò#9ÃòmóÈØ¡"Úñ»%Þ§à^= SrÁO¹aÝ;@*ÐbÜ dÜR¿ª!º^ÝÜ½È¸Û>ë¢æìßçß\Ñp_ó |(ì²ü¶ì²ü¶ì²ü¶ì²üÖFbûg@ÿË13 Yç¢¾b½$àHì&´fP¨~È&amÞ{÷®A)	½ä4yåë a9ÑmÄvXxôrú³íâP°Z{ð=}zÐA}´RoH¢ãó= = e´tbºåVÑ¿ª%V;eÇN&Ñp4úrI¾;;__ÏÂWþï>³[²yÑ[¡oä+£>ä94æ6´tª=}U¯[M^Ó}û£ò!ñ¯µAu¿Ù+Ðeª ÁâÊÜL¢i@¶P0SÐ0 áKËãòk?¸|ÒÜwcqiSV¦µæ:[KKðêGGàÎ»>ÞÐ],®È[+*"Â§eejW»ò|ö~LðÎTHIÉÉÉù=M¯¯Ço¬¯õ]Ä¼ñyÃKÀ«\Ëª65^Sß<y*¥æ6¯»èsxQbY.¨8sÍ¸øÔùbCëù½§Å§ëûÍIjÀ|öBËEcËë#©£Ol¥³7»ØctùVRÛ+ÆW4 PxÝ¦íé²°¹ÑÊÄ!x¢Ù_\h?G®E$AÐ>Ý@ÌÜ\n84úXckY2¨;ºx¥(ÈÍ¬^§XÈý9úQq¾=}J:Î0pÙ([ÆI(¶ìAÛÀÅ¯üeÚÀ~fÙ@MgÐ[³1Ëá{.æ.¡Ð$ê¿RP û=Ml
yX¿;îÁJÜPNáª" =}ð·é= é°i$>ÆË4¸4d\´÷p¥¸ûÛüÆ7t¦ðÖlJ¦ûN9=}ÞÄïro-7j)®s\­DÑÀní§¶î=Mt¶WøçÏOï±×Y ½
$éZMGð¥kÌ¨¡	¥Ü[ZÚ r¤H?èl:xÄK§qº½F<»=}KC´xÇÉ@ü9Õö<5ú¯è¤i§tr]£ë¹÷K&ÝÈMCÿc=M)³óCey{1fsüó¾ÎßXû) Åhó¼O}kNrª¹=Mf×2¹ËLÙÆ¹<).ÞÔÈlÓ¦ô»Üâû[TðÀ¹ôjÆÊ§îiÓå5÷V®í$cÞ'/Î°í%²²÷ü¦§ÿ8¢¯®ë<:«À¾®ñzëE1NíÞyf460ÄHf¬j;ÈçÀÓ jÞ1³V&ü}O:Äl =M7¯þdîá¿ÌûcÜaÐ°ó(º¡Ñ0]µ$?-óSp¸ól6éþn ]¶7SµhbÑ3ûmù
@X$h0%	ÇM6À)té¾Àï%]ù^U(ÅOÃ¦P;½¢PÑ¦Ãû4äû-þI)ÝÃ¿ûÑ%mú,ûûE^±$tuÞ	Þ²éòÂ¹¢ÎDy=MÝ«CôæCU}ÈøâØíÑ²~¶ªì®§T|éÄXNÝ©|ÙÓñù¦)c5¡= ý¡·¯t¡{Ì¡´}¦d56cyÄ¡cÖ¡Ý¾¡Üá,5G¸dmÎ®1mC}=}r¸¥³K"[uX?:l©5¨y©6¤úxM<GÔ ÕK×(Õt´Ç;DîÅF¸K:S :ÎÏ= ,ë=M@²]¾h«#r}^Çh½|HNyR$Kù+ve29ÇG±>= U'È[äp½³ÈÃ{G$â&8²ÎSZéP<!ÚW°xà	
{|nu0º	É:u[¤·¬³Õ¤	7jí\¿® É]Ò>ÜÆ8{e¨´Ðûì'n±ÌùTPjÕÍ"(ÒT¸BÙ]%	ÝqW*HJ±´ì>CZ´Î<¦]/CQx>Òy§³<âZ9¢¹6òa^:'á¹L&ËÕ² Î-wÊ½ä;@g<îÇ8Ô£ZÉl$qOý³þÖæEïüá|:åZW÷S³¯Gó[¥ù@#÷ÏWkÕ*°LáYìzcJ>"Òoè}ºwvuû¨ÆãRÿyßÔ/-fªÜH¯8G= ÇîugV~èÂ®¿Âú<þ¬= àzf¦ÆBUZJ7X¹?¤:óÈ=M#w¢Ó,¦ÊÖí'ÉÌc×¸­çlT= ªp¤wZFè«!5ó¥L¼ ÌÁàÒý}OÍÅd´üP¨ú¢)[OÉpû­Ù K;âÏQ;ÿñùáp\ç*t gyûa=} 7ór¬¡ÏË*÷·iOËö= ³ç31¸p'{úä¦&G»©i¥p¨éÇü2±åÌAOåÒ¥K"m[m¤Ù(PíUØPÏÉ#æZËÖÀ6ýÿ/@3és¡Å6	÷J@5lIÓj0¼]M@Þ1lÑ¾IK°ÄOù¥À=MÆn"Ä¥P{BÌ)meû"òÙQ3=}ÁOrÕàf¼BíºöûÊ½PG[À§
ñ¾Â·4¤PÍv×eB*ü&?â&LfPòf(&õmâM^$&$XNI0rÇÎ^\ðãüdPÒùLHÖË+H\ð¼0R³¼õ¹¿ÿúÛF«ÔDi+^&,ìØòÊ=}Ñ	h;NvtÜ þX¨btÑýüÑ¶ÞývV°'r¬tV(×ÿnÙ/®i¶ñuìÍ	qëïq%èNMøêÅE²c2J@1ï7N¤dÖ JdÓbzä¢UZc¨fdo¬d=}Æd¹Õ¶c¾èVdy&¡ÄcâX>cmt!å "JUÍWu#vÈ­%Ö@¾HïüktC÷ªÀò7-såÊM A]¬E.
K·îu RBb×Õl «Dta±:¥ùI6ô¾¶Í>¶c¬Nfü9f|Õm}«ËúmÓ$8ÙÌCz|F*Í;E¾Ì·r¥zºxKn6rC±Uä+1ÕalZÚuÈÝ£É]FÞtÌ x= TZØî²ì³ÿ¾½L=M:j1u´¯¯|§êýË-Ò¡ZqÀ3È.©½bÇ|uÜþ)]mÿ¦þeý"ò:óh¥ÇzoÿA%nvx0z#RiYL \®NÅ¯ÜÒÈ1ìüÈgzÀqêôÉèý¦zSÝóg{c0qqôÓ#(Ð,©7-×)Q7,y|¶±¸6Ê§À#´#KÿÔÓ,3¹Jê,¾)RrÐ|Ó[8«º*=MÖ²ÿÌbËïÐÛ¢\Íçì¹Tk­./¦ùÖëT,ùu!Ö|<­²¨~öÑÒÑ!î±dÊøóZÀ¬RrÙû¨VÚM²üV(^Ò\¹ó~,JQ^DL7ÝgyØòÉ¬êÇoeÏö³£>pÜÑEÄé8Ü= YÚ#\µ^_,¾'J:ð¸8!>Öup½éÑ1$]qÐµo½¤Ñ.JB¶Ý¯:¬Ê­>ù×4âna\0J;=MMb®yW0dLDL2½í2ªºB+XæÃsT#ÖLGuÉ?V=Mý[Îc>É2ö\¾ôN@ jÍWÛæQÑÔýÓc]5#EÓ¥cj\?v³ömÕ¢Ä\Ü0Dß¶ë£{ çéýkÆM"²ffà5'fÁ¸§@7³Z¹lzÉðÛñ4ØÓ !nùÀ¨e°jûbJ­BàÒP1aÂ0ÏBÅö+ÌjòAÆ£%+%y½m Lý]vAÆ2÷Ît #måêàYÜøÝ5;§'UßýEgwäÁQÝ33Ì¦&H7BüÎ^,¦Öêû/8¸Kå¹xhº°HÄ|AdcE
'zlÇNö¢®¤Ü¼Ò¯Kþ¸ÒÁËáÓS¥-u@âWº¡üÙº@À±dÇ¾Mð[òö= Å¹B.tózüÏMkÍÄAavòeGBÚýFøÆaV;Ïª][ªõ¢,ãN<0¶ôÒf¤ËR*pR¢Ü7«SfÄ"VÃÏÂáî·ºY¡ò´Ò¯ ¾ê&PÚuÛ·vÁâJâ>K¾Äê¶Õ]'2×À?pþ·ØZ-÷äÿV&ß5ä¿h:ÿ=M½îc£ç²åçERa@w÷k*Ì!Ï¨ãÆd?=}«â!°
óP¢¾ë]ø@´í¦ÿOSümùÐáåÊ¯3ï= ¼Ü0ñ\.%\8¦#@%Oóñ1o2ødË°°×¶ù¦ÐÔ"ËÙOI= á~¶¯Åá<ô¯ýøb¦÷·ïbÃÊ/4£?EÞ7Ówôj®0Sõ:ÑBð4öêÞ Pçxðf×¿Îkb5%ûá£ñffðI#_nñº¶0Q1hZ)'	téíâ3§u0 /dÒJ3ïñ3Ç]$3 ÌéÊú¤BFí4B3ìdtù%j´ç0Nù8º³÷T3ì¬êI«1¢¿h9ë>ìré5@¶m¦m ûÌkùRûÂ§~¤¬uÂvê&tö¦¥?mf°ûvfØ9íÄí|ûTÚ·ðíÈmqCízêûií¦Êû,xû*ÍP¨ÀgW§É¦!mÉvûN¤N¾R;×£@Ý4Þ|Â:×,&$¦)í¾þû^R;ÅÀ¯ÂÇ1®°Y½pBÕþmQp(Û=}ó³«0ÿù¼¡ð=MòøÝÄô##ºá°&0Ç5³IõÛ¾PÞÞ'Ëw»Z¨Ë+òÞñ<5Vyð:	Ì\²/¢°3¹IbÈ.Õ&é,d ù½*Z¨1'C2C®M×§ñ½sLº r»=Mj+rªtÄÚÿH7ºP$*Ê	Îñ2²/'®#ýÞÎØÑ²µÑÞ&ïßeà#0ßzLºTÞ¬LLºLºLº,í[A<Ú¸*Zè<= ¬±C,eÔgôZ¬xÜ]Ã¢µdfÆÂ¸fxËâ>º;7ª}çU½F¢+OùX\|"9fö°¹
ÇÙµTÛÅõñ6º$1<æGÎPÑûÔÆ=}B¦Âü*X%½°V>Æî¤ÞÃRú#G_óLÄoÎÛ)s%GJbýlËýRy4H,¦ýï.uê[ÓÜòCËù#ª^drÕh÷9pÓå2HX6õìÅ2¾1YQi^µ2= *êÔnT±¯Ú]	,þÚÙüøKõÝ|êÍÕØ¬=}ãfÏ§Ð9= ÖP´\üÃáA2Áõ»mÚò/RþA~û#nÁðÛjm¢R.ÂÓ²Roæõ.cÁn60|Wâº®»= Ú\»Ï÷Z}À=}= Òi]^£nä>µÎæ¹Ý ¬YíÓõPBräÝðeÞXPGo¡HV¨Á rÓJôÐ%øíT×¶ín=},ÛzâºYW²ßaCc+h®ëÙõ/ë!Tlì{õº×W{ Ê¿iÁ)V7NÓ!¹þÑ¢Ø¥ß'þê¥õ¨/©é¦Æ|0wõba{tgóbClÆJåEE@Ó[=MeÒPE6ðá¬*ûû%t8>b$5TÏ·ºç8E>L"#]æÝÌeÚk[ûØê¢´½¨.ñãîßtßßåLÚÚRLºLºLº¼ø°q4Ü£È  Ûÿ(#b8Z8eh|=M®¬¶é³³	15x<­	Kü%©üTñ©7Y½\Oz¯îr®Ü0uü'´Ä G4ë%P¶/uíBÈçåæk£Y°G;¥¯^µÉË¥RÙ#Ë0Réæ<GÛFSÈe«ÅÙm«z¦ijêÏs;£ÜÖjØùÙéÃ²6z\vSø®2â=MI$Zø66Þ	E¸uGVÂÉ®ì³HL¡SÎ=}L¤BÍUåÅÌÝ¸=MM«¼¢¡w¼nµ ½¶þAÀðN¥;dòûÑhÆ¤²«yQuÁR×\= Lº=MÎô=}Ä©ºÊ·(¹Lý¢ DVøØý&4ÍÝÖqý Ì ÅýPÚÍBqî Q¤2#~ð¿¢¤>/=}ÕaÐQ^¤'¢¶£W"²¹Úmþ
½CÝæ³&^Ãq¹5S^Á,¤FS±Ã
-¾Ûm Úþ¾Þh­Ø>CÍÞ,¥eµÞjÃÛ^+yGgÒ?Ýù2=M@¡ºõò5w±{Be< @õ«Ó¤°éTêJÍÝ Îº>¸ðÓ¯}züWW°pr-»Ã«x¼=M7MPD¹uÎ è,.óöX0¦z[¸vÂÜ/ýÌ®Àà[ùû§Ëà ÔìEGïmd1û¥N¤O}¨&?=Mú(Só¶xøb#Ü¤Â7
õnýL0áLhÖpµrkdÄ3»#H÷gD¯u(Wõµñ¸(Åotj+ýæDÒhr
?! i$0=MEdIèâ³*HµVÈ\
§Í>(´	f3M7ì&³QR3üUBÉø¶hlKx»£º¬c,NZE
2ÅD=}õSÏT05*OõP³É /&#¿' ¹/+W9;C=M«ø
 Sw'ç-ÂdÜEqaÓãÀsYÏº!9/yûsð;¨é,u¡Ï¨Q¡
Þèaæßßßa|l¹E/z>º¬OLº+ºLºÍçöV.´àòP&=}Ì§0AµUÁ¨J ¯d>ÿUÇ)£©cºT"ú~C(V0³lxõ Ò±Ou= YÛ}¢;,<ëÉÇ&ÒGí´FÊ/\eJ÷¿³¾_,ë¯É@'Ë&"ÑùlgWH#º)BõJ= èÈ¶,G)ÇEËCe"otº¬ÈÈE ©aUu+8G¨2â
-Á.&JÕíÀô;YL¢ÐQ:¥»$¼m¥2U+ë®íZ{<û/O¿bh_2ã;K]_o~c[õPÎmghA9üòÂÎÎg¶&:wÀ£µí­ËÇÆ+ÞV­T Áê°pS»Í©7= úÆPrâÚÒÔíäýÇ|Ð?>_	.!lýÂdÙö	ØZ¸z<Ö ®³ö¥×QÂa;­ØÐ¹®~aôÝë°ë>ß}åÿ-è£Q6ÿKa}ïcªÿ½õ ÀP÷¿ñ+Ñ?=MÛê44çn®cÓçDª{/uIcð;ø¥·2@ëTè&{]¡È:ï= Ü= çå¹#KCÍxïþ¤TóÀ¼8lE¸¤G±»B/,l Üe{7y¥9mã(ûR­¥0ûnG+l®Á¨è.¿ÄãÝpr§Ï¬hÎu£¹ý-!ªxjqÐw+dn"2g|!&	¥AÏt¾Hë|seÙHù\â±XülFÈKÒ®Úë­?lV¥CQÕ-H=M8Óýq$ÇÄ3¸KÎp,¤KÊÆ	æ®L3¬¤vT*RÑ vÃPP;ýMÃ0Av®û8ÑØÈ/káí=MÓDàåýdKÉ>§d{É5#SUðÄji[=}£ßÆAÙÕ¥?.ø)On@¢cñ­<	@ Ò*Xsn*H>¥y¹c¬D£
jJ,QCz©°Ü;-&ä	a¶þ
·Ë9hñZTv=}4A :Dôêv3PÀMôªk©¥TQ-4ò´eg¿ù}Õ eÍJwL2ªpÛ9,¼È9+:´P´íî(ü}
ÉXíú¬YÊ8µ}ºÉY¦6= Áwå£ÜùwM?ªÜåÃ9l;ìJÃ= pªúXPpÆLyw¿¸£Ñ=M+LÐ?òz½§+a6ãDNèä
 Ï.!6psXx1ëu<Ñys= CshC[)vÀeÍ)ø®¨WÐ,¥4R±ºúÄ.vr:­qfQõ6oË|?6äÆ
W[ jé­U/ñÎNq[q²tN6Ã±=MÞøïæÇÿi]³·8UIºfjLºLºL:¦¸üÁiÛ¾£ ÔU7º@¯Mfü9ÜÙªË=M8êëÎ³RÈ¨ÌåvåFÞÑt*ýâá5tÏ÷º£;ÞÌrÔGY¡ÂÐn^\éCÔüÊ2®o=}þ~Û2\¥Ô¸Y³FÍ<~>\51;ç/KG9*PbÁ4>¤t¨iÝ
ôNÖQ>0ZÕCå,?¬y)´6:H!ÛÚç,}¸yJæLH9°ã[²K'I'{¼ï÷M'lÀô"e<ìÙ÷«÷"û¢´eZëþ-ù­¾ÓXM×Ý´/	pPå*x[u¾0u 7Í5N(·¥Qf&þª¢ðu¿uÁêÀJU7ÙüNèLÑ«1¿Ä°Nj(*#Ãó	ãèP!Ñ¡e±!+4@#@VRÀCæ@B. !¥ ¡0¡²(!¸!ÇA ªIÀÀ@³=M ¢  {óÕ<ïý>ö}¾ò­ôðé\õÝ<®ß"eàódLºwNLºU¼KºLºLºT¥Ïî®ÑQÙOÕÜ?.2÷J=}yeÿ}´httTX¶8:9 R:xÑ:¤j7$)±cÄVt·6¼©=}¦¹±)³³I¼±9·µ³°¼´¹¾²y²¦Ii£¹{ÍüLýF$wC4|Ily ¼H©XµÍdµ5ÞÄ54ÃùÍ7N½8Ëõ
´UJ§-Ê©M
­ùÕßVýÙýåüY|ù|Ñ}ÀÛRÓ×XÖ$
äÌÊéÊ8¦."Dd¾ÄmZüt}­Ðgí:n~°ÀTbö5PÙ¬

l\éò½¯¥NOÎGN"±ºRpÄTïGÎ(ZÎ&Å«ì½á&ocíÎcbg!j6¤ë»ûyåBú}å<}ælë
Oû.ð{Í-_+e9Gb½÷dø7aÔ·d¢l*= ZWkÆWdV×_®×aN×Ý6Æ½îÐ/<=Mú÷ÕßSßjÞ.© ÈÍÖ{ZÉ
á9ák+ÃÂ´¦ßCöetG*¦GæÃbH;s«å tªHÌ¾WÔ¡äAðe]ü0õ	è	#¤1+@ã â_÷'óä¹LúÒ¾¸LLºLºLºtxæ!ËI°¨Kmø$J
ÕÏp²Ü¼fä'fw}ÅJ| si÷ê@DÚº¸b ÅÈ¢×:6oÈÁÝdÝYjUx9¦ÇJÈøÉ¡DYq]r»×÷´»×h%ÖÝ(bæþ/½Ö®(&Èü|HÝ)­þØGY s=M¦¨±ÀD­5ÀéLiú°ÀCÛ©aí¸¯äæÁ¿SR,}Óoªnùõb·{­jòhA	t3ÊÇ:0Xtu¯¾ütÓÎYÑ¾!»|y²&²Æ&¦Iq¥Ö«òýf®4'z7âÌÔwm½c|}:0Dâ8Ì¥:\¿Tï©&?7Pû,~a²¨ROXUð^ø=}= X°TÎlâÖÏdOÈ£îÏ±Ýøx2 "ÏSÓÞj-°f¯7ÝóÈõ¿QÒìí4¦®Çª= Z»ø îþ@ÃõfÉH3Ku¦&8jÿ/ìùaùäRøüÃÊ«ß5}%s?á	×.7E~ÝÞ½õ{Õ·KÍgø­Ç{PdÛ,î3êY@¯æl]¯+IãÂ;$í~nAóýµ£Î=}SKñÐÖóÃO@BDåÜxlÛ;ÛVßY $¯=}i¾¡ªðn	kEµÂX«ú+äFîB<3»=}Ô?EîÊå0ÑSã.5n"Yñé¡ZXýù\j7çýßßßßéEºLKº}ÌÏpLúLºLºj¶rM¯y°fî®ÚÑþìGÿîµì¬OçíBÉºÀÓÍñþ ­´nDb	¥>Pár	qxÔ2Gò+B>Îø§|¨Ôh8If§TÒ·ô~võA5g®vO\¥y<vPM¹ìÙeîÊ¶
L îD EU£K@bG
|êÒHæ®V[²ý56ÍÝ]ëüC«·¢ûn¡¤¦7X×ãÐ"-Éî~ÄØdÒ;{XpÅ±*»O¡v¦¶×WÑåÆF*/»ÿ¨m/HDY&}}ôð=M4¥\o	àI[è´?dõ.½¥ÏÕ<½;òÝ_÷¢Ö×Ïßöîè[Ïga¦«´[¡[të3W%«R3=}/ÐqÒñ×
Ðùþ¨×*¤'ÍüÑ)ÎøÝ= ¶1	Ý£a~¸ÔÕê[Ú©÷ÌNcw]ÆÂî¡[^ Ùö^ÁîjÝ1Ó.J²1f¢ZSð;¯Âp1.ëwÜºïV:ufø© ²óhÅgµ9ÛM	5+^F¬Dêú³K9H¦ËðíWQC¬8Íê{°ÝÎ¡®ß6Cª¼÷¥bö:(pÑÊcõÙ¹~qÌà6èÃ¡ÿm%å
ãô@«uç&É:ãV"½ô¤£Ç
£±"mHÐør'ºp]'Eo^éæZP= SçS¨#êªlãêQU®"
~q|dKY=}£ØÏAUm	Ä[øÌQ¡i
;8$ùP?ìÊ·U}BEìIHQ>:=}³iÙeUÉÿrp¼ëp2ýéßdJEL:¾¾Kº¸EºlXªLºµ¼ Ú 7 äéZ&wBÙ@ö·nLÖÙ\Ûßû!æO>Uÿå2æUïÁæRDÝïÝª÷¡;dwøe[¸;ÔfR¶çSk«HF®hÏ3#s5^01C¤o{mFÍIñk»	(CzD=MÞ \Dókü¬²·°g\ù¢¿lB¶õÆP+rýnÅcè;'}_É#£V-4GJ^,,]é(*Y	ØÕ²Go}­Øw|b%hêº0¨)y¬ü{öRX'¤®Bb¥[íÿo<hêP±=}£ÂjXEèÄø*O8)Ë¤DK~{0Dª¸ÃaÖ6Qô ü·Ìy¸~µOUÎ9)¤¶ðumÒÔ=}¾¢úPMº§åÞ,+0c²&ãs.o#i= ýz°Yä¸Ì:Pïº¥ËLgKæüã)Ì£?Ã=MáV¨@ýÎ@Àw*Ë"?þ®Õ2ÏÅß%æîAÄï\TfOÑk|Åðùû$TÄ}ìm.ÙPã­÷ÖÙzî~Á¦«²MlUÓø9­A
^íÊÆ|Q= öúTðRª*+]Yxiâ6ï}l+nqg=}Ä·Js{-Éúsh½Ã3¤,bMµÓ¶~»ÎÏ<Ñö½B×oÚ=M®Yæ?ÛïÄnwQ+uQ+ðp&)}ìðn8HÞã¸..Hv]%ÏuÆ+Z !ÀvcÆÛ¶ÆôÐõ¸ÏÍì*¾Q¾Ñ¢½ðÐÝüí,ÎOsX.S©Z#V]ÝÚæÅ\£©×&]Á·z.{N×caÓFñ2H¶ö¡^] MpááêäÅ*	ÑöóPcWñe&tpé2E¯åô»3zi	&eÀØ%l¤¬I#»/Æ\mÙþï lyZIq:jü9£gJÒÏjªZðr´@Gdí2ÉQ$öªYkç³"J»ÔHyDhààqeø±K£uF%7¶úÄeX¥;H¡±ò%ÌÄ2õÂqø=MR«p&RäÒ§ûIhÌZ*óØFd lô ¶øuN¬Ô²C¹OR~#éËÚ@fÁéZs<ÌxÂiâòÑ+®pù}UoN|ÍQÅ´BöÃú;W^¦ôº6Q¶ìt²ÍÓ*P&Ìoæj»Èh2o>ã=}ØÄ¤ª½ÇWZÂ£f=}Fþí¬Ô¤¶¥v$²Ñ¼Ó
¦¦^BÝ¡BÐ|Ö^Ï!Èæ~åÞ£ÑÂ.Ad^Ñ¬­VÞÁÎ¾LÚlv»þUÝÁÝ>+JÝQÄþ
Û÷^¼þpñ^£âw8ïmj= ¨èÃÚ¸ÿåFå R	wc³?Õýî cº&!ð*çÇ?÷þB¢{$°Àk¹ú Ï§ç%ÍmC1WJV%Pé¼Ì°å&\:ëaA§ºñª 7¦Pÿm!W½×¦:	= SãSãh{Ô*Cÿh ](3p+Å¾Cñ( ÈNé±×ô0 ùÛ±oõBÃv-eÿbÝøo©«r¸z/è§RRîá½q¢bûÅû{ªÓÌX×fÃ þp[ÝË_¤êj£V.ðNiwx¤ÓË 
cæ*h$ÌOøñª^ûxÃQ­þ¿SÉ~ÃKYv-6Pi&FX|<lÉØù«QJÏ7*O]xvÊGBw+)ÉÀ9âªùo°gE$ygIÓ-ÜJzxQdìÔ{W·©b¥5óDºKMÂ[ÌóÈbà®pÇÉCÑª=MÅÕSÃT
Ú8Üft¡\¾ª»Ý\+Ù·¦v]!a½!á¸î!a±ÿ  hàÞòãî_Lßßßã6¥Ì·Å®LºLºLöLº½|þiÚ@ûÀ¦ò]ããÚ²F&ÙÄ® ßî)ä¿÷üc²à»ôåò'= ûò'_gÁDb÷gÜFb×í;´¥äwôñà©èW-_>}_7ïDX Ð!§ò1+	7XðÐXA©jØ-«;ñvr¯S{ã\cAª)È5iÙs:øª§/npPÕk¡ïsé@§ïã!÷ôû)qSüð©¼ÂóêëB(]ëì«°ØdROÀb¢P{^¢xÄl?&ÞçQÖ$OÒFãî{pÇü¨Ô<p{Ýù¨EJór&°I:ón0Û#2<%rÕyòÉ÷ylÀÊÉ÷ej ÿuà¬BXuÉîA¸yùf@û´Å¦ÂEûäPÐÛø.ÅkWó.´ÏãÉ5)­cã	Å¿óñ>	pÖ¢ò¸^p= dqØqW³hpZq'Øu£Y*Ù¨¹s+³zCY1Gt!¡ióÉ+@)I	ÚÊQJ-	ÎÑl®t²W l»Hï²Wµ Èo­«~È7Ëø{Ëu ¬ø{W|= (x¨³õx<qhÍMLñw4j2§§ÁizÒzdæÈÙúffî<Q7 æÖjûÑÃ3IÆ£¹JQ%$3  £÷ä$n
GÐ. þvq sÓ½È
ûôq	­­2°ÖiOz©k3Õy>I¹7KÌÀÔùìnw2ó¤4j.j7¦,S«ÌËü=}ÊÇ~ÆN|ÆÇW0.u³ªñåEîVv= ÖåÑt%íW}p=Mvl÷DýsWh¯<Ð*M5BªEzZ½k/C gä4þêÈ:ç=}7tED0L
4:ØW©©o^5Ý¸KÎGÂÃéú@VKsi²{| "ÌëºBÚZ4Äí1ù¼ o;æÝ-Å{§H¡¨}:-f'	Ì¡¯dTj{v=Má²»{ÀE³¹Mí^T27Â@"òîa8ý	ÅX÷ÉÆDx¬ªuU=}µÕÔivuAþQ[;ÍÅÂIþ~NÚGôÝ~ QéáßaGLºU|JºLºLºLºµ¢ÍÏZ¿cóÑÕàÄåGÞãåóñ¯&ÿrá]öo59 &æèH,§v!Môòp2¥?ð,hÜ1#AAýH£«ø%$«FAdK2)§».aSbcmnë¬D#)fý1CDRUøiu­So°WpkhvD;({¡0¤E§¨Q1­~Qu50?S	W9 ºéM0/q=MIêÙ	¸tVt­&Rôl¹W&$	Û5ÀE"¬ÊpÉ³´sX7 ì(AìÆG÷7"*ùY,¢¼9=MkµqEvuñs
'¦zmµ¬¶ÀÂ¢üÌ	ÈMµ2H}¿åÍÉxy¤weå¹eëwG¿Ä=}â">ø§1¯'.pêÌlÃ}BÈèy%Ã+³/x×²¼£Å¤kÆ,»ØD!2 «éx\«ó9@¥D´Ýx¨:¸¡d¸Ü:HÀ·DêlÝ8w1¨©ìbtS\ó8M¯$
Þ]86­¥/lléK:G³Hú··2»­Rh|>ÌÌ[z@Æµ ª>¸PÄTÏbà æÎ¥ïNTÃb´È|ËÍC¸¨Ã-;*|CÊC¸öôjwSÐÀ×öU/O°z!»»ø½º,p$M|OÒÊ|ú(]îyYwÍÖZfðJZÑ²¢Ýñ=}3æÂ=})kÖñ¹ÁDÁ,ªÞX81µ¦xî::þ¸Ø7¬&ÌºÅÞÖÐ~m]AòÛW×H]¢.¹]uëÿòåõè/\3_JâKï¿ÁÆßéã½§;6ï6ÞÿHöäxS'uÆ Áx"KùÁ£ÖÕ ,ëPNRg6"cf'>«·@Ý¢wÚex«Ü@­çR«iðçsè$·!ðuülÏÜHc¹øw	#Ð'Ç0íjÑMHsx&3^ùDD÷¸ª¤êBkì£7¥eäÅÍn°Ø=}k¹^B»ù¹­:{Å¼ÂëzùFºÅÆ¥Ï­Ëè¥3,ÿtWü(¯L'+ÌÚòkr?Ö®ãöêÅA¼µË¯ECºµç%-@wûÌ¹÷9ºL|¾LýRLºLºLÖ¼D¢À«×ÞµÛ®òÞ²ÏÈÞ©Be .ëµ÷å2ùÇå6ùûAÏºâbÜ¸+4ðÎy+×¢CXêrôb,¬°,I>y±ÁõÉ8Ï$FºA8jbBm·QA«j¾²ºCHp, NK¹ZºþJ2Hx,ÜtN·C)Âg"¦í¤Rw×~"Íí­ïf¸RûmNPRp.ûmEVx0½¤W¼ºÖ=MBv!|<9nQ¸¯Ì-véö»c};	ÆÓ§1 Â§JýÔÁWMÎ0Pw&¶ýZXÈ0Ñ&dëdjØÌÅ"~¿V~±F?V~B\Ý;ÃT®Ðè«"~CxáÍõê·4?¯æàÎÞùOëÏæ{úýÏ¥{_ÍúáµûèR¿YÑoR"sîÈºÃb®"MÝô±!dÍõÑªo8R"Nç¨\ÛÔ#)«viw4ÁvîýÞó°©l²ÁÝð"%Ë=}ûPVJ#Ñòð®M%{,õÿ&+3	G|w$Î¥ÛEyðrX«ÆAlkx
EÐÉwXZAe|lÐÍ¤³'|*¯ÿDü= Y&OÃú ^ä^( Ö-abãòèåñãzãlîèý;óë\s%H(;*Á,¨XÝosÒD:*QÕq»û 8<ArCº	øZ71ÁqÖâ¨ÔsióM¤	iló/kÙ-°Éþ¤¦p":¤a=}i.&í,4[7^b¼¤&ôN%,Ï±IEÃ±ë
p4N³[6Ø
¬úJ¹h½38¬¬H¥±78*Âw®¬>ÖÄ=}HmDG)ªe¤à'çßé¸LºÔLºå¸LºLºÕX7ðÁDïEÃõóö4óíµð!yêäêlÚè¼,Ç%Ç<''5W<7O'^5^ZY3Ø=Mîó&0Q¥6y3eE5¥Ä4¥ö6a±u1hñ·5¸°<H/ØÂ©g)×H)¾Ø©ô),)¶¼©Á©È©²J©¦Ú©Úö©Ün© >©³?P3-B>PYÂTUJàÂ@è!äB@ìÂLâJ*H&¢Yùåùj«w±÷°Ç²¯g± ÷¢'Q·W»S½·Y¬'V®÷Ð³Ö¥§×¤GÖºwýCËhÃ;lÈ)ïÅÃ­S­­Ë-Æ¡-m1­jÑ­sI-­¥-Ì5­¤í-xÍ­- -<VEmO=MlRáFdõDvÄµ$øUðÕVmª-LhfNý¾~ÕËÞ°ÈÚ¼Þ¦è¬ýá¤'bÿßôºL3KºÌS¤LºL®¬NZ×¥º«Û´ò3Úæ¢¶>ì2ø¹j@V-¢t[e&dì®)÷ýu;C·0¼üe5ìë8yùNF½¸¿¯¼nÀv= ³Ï¦bl×+~M·&"·;"$e¨ªë&6ø£K¾Mº/Q£@"ÝÂeìpÆëNøí=}kDQ.ýùí\ÂeôþëX~bsj}TCÖ«ÒWäùÉdùµ&÷{ìäÂì\qëÊ]ÿMÞ+WÝ%Ûsq§pe}}~(ñQïQòÄÛêïnêòið*ñt©ïpÄgrôhÝ4g´hÒhÕ¯Thxìó¶w7½s'°awºiÙÕ YÍUÑT U}ÕÿÓYÓÕ½î3»ïÑÆçaS\ëPY{Y|Æðï~ø£Tm­µ¬ «ÿ©]7!=})K=}
h{hÖJg¤ÊgIúçl£¬#°£L#üÉZY¹,[vwn×Ð_Å'cý±k&3Ò0ÄÄãðRqÇOyQeg*.['C+S¸ÆJi-Ã($ë,"ûZÖgîÖèæ#£"ÈðÐÒòÁ¶£®³¦R´p_öcÂ*¬ÝiÞy·Õe¿:Ö¥ZÂæ¡6^3¬.yÄ0¿êÀ¦ñðûçî¸Å'T±K­£øÈÄY£èHÆ%c¨ùVæÐ/YX^xÆ$CÏU(Pþ¤)4>Á³Ó²=}×ò7ß2±æ	-¡.ïÐ+	äæØc÷î/6ûI÷)%!{Sã"ý(e'Ëôþô$ku²ñDhðQ/;ZkEr$Q,a^°=}Å©øPusPy Ù©ñ~(é¥ò,CvÂÑ;á$á03ù)þx=MÊÄcó&hosh#¬kp-ÕªXÎ£,!01ð8spù±/9*6ÈCa«oX+µ©õ¸æÃw{pjQ,Mª\XÃv.Ñ,{£$»¤2[£.á'a3¡!ÉÊÖñaWðgÿÐqÝbµÏÞvæw1¾ót<l.©ö4=M¢Q Ïßó$àKLºM¾LºÔLºLºLº+Sa6RÌÍQÛGX»pR«¿½ø w®¦GÍ¿FX~Â£Åþ5gÐ*þÒôhõôÆ¬êJ¦Ð9i×&W gÐ¤+Õ+S*9hü¹­ÂK8Û4OÜèJÜx«ðAD1KµYDU·#zB¡3¸îu´À®¸ÔC	vLº3 7IòºÎ¼ªõmX%òGÉHÁÀûIYgQ6/OØtÝÆËJ#J®ýÅü¨R¾Ù]ÎLYd>o·Z¹ÅdvÜ³1 úDPDsÔ"r¥eÉqÂ1)pn(1 }õV¨ýCÌ*vbGÄeOyeã¦±²¨Hóz³.ó/¨~1ëøìÜt¡
Ç´àÑ^C­n= ¡yÐEñÊVÉ1E X=MÙö?0¤AÖ=MbÓa4§õ$N£GuÅN¢ôOÓÜ=}³åÐW=}èýáImÉ½(+¨b(ÿÃU[mz2MB¢£¾Wc$Â}@$¿*óé¤´òþ Æ
}³Ü>«þ{Võ¥@+gô$GM¤($ùÒD ´©bÊ6£8	g¹e:FïÙ5êÂsTµ&îª	ì¯®÷eÆ+5»ûq uçý@bÓÂUçpV_+òMOd¸VSYAÄþ2Ï¢wÅß×½ë¥xo/Kn(óg$~)¡À)éiÅBPÍM¬ Ë5gAr=M"«e)ë¤6B©nGc<Qíg á|ÎË%&þ	]îAwÿWßëáßßÿwLºØ¸LºMLºLºÌ¼Êì? ¯ ;Zwþ"ï¼k¢FJD%0±ùÐ®Bx9íx&òªx§ÍzrØwäÊ²¯¬{m±¼x[	}äÆ/¾öø= Ø+øïð¼$Ã>¡q;{öT
Wiªj¶¡^V¶´= 8ez/dÉË0¸­Ú\p¹daåÛvª<ÚwCVßn¦fÆçÝ&xO{FF.ÕUF6fÙ´êzZhØvÐ©p¶PTrpRMRÕíáÎÐ,Üà¾ÁÏ¨ë<Õëz Çm øFÝuêÎØÔØ1VWÛ
Ö]F°q~#,Ø¬¬À^hÎÙ¦mÞKJð¿CÿÆÊd0«µð¶j1±ÿe$Ö¹÷°hÐÿHls Pa*F© '}¡é¸§Ò¢)=}/¥Ô}éðN4hØ%{µåùgJQ;jh¹ãÉÏOýêÓØ²_eje»WBc¥ËëÄ8ø\Å¬#\ô1îXA¢@ê:%¤¹ð¯C®j8mëÇc³*FeÏ ¶twéE,Ò¿¹ .#W@Îl"îíâÜ¯¾Ë®Þà{¶ëC!;ïà"!Ws¥n@[éa"Ò/ø,qIëbrB8}löñ·o§£ïPôð¬ÅòrgV«E&6íÑfÒ't¬F+EàúuôPÇ2&á)·kÖª^/ô32K=}¢Ê}9éµR³àlà,C=}NEcBê*¦À8
b÷jÁ¼wEÖOd]{ü¯.ïß%àßßó¬LºÝÈ9LºÕKºLº:¸lÖ·´²f-\8TþöÓîNÄkÒå<BïmëÅL~ {Õ÷aÄ²yë¶Ó@5ømµÀðËÇqê]XiÉ´X1yÊÅBgõjøÂÇïm!\b®+ÿ?«#©òèÒr¸Aé:Á¿ôÂB²÷Y(²8bÅR8TõØx÷AúZRO>vÌR¸ËîÒ0ïK·![1õ±ç~j>ã¤Å7äDË~>mº»ô÷6?_®)5ÇËI)Å@%Ìùáµ1mn¶µÒBÄå/xp2%z7ÕYþÖL@ºÃ¾©Ó_LK2¸-»ÜüMfòBVC¥Ý×z¯Z×·jÚSà6úän¾¦ß*ðåÜ¹®¶
æÈÿ Bî1Tg^°fpavÇ0­¾¥¢<¦{Xa­ò{«¨	2Û³l§[]u® ÎÞå;ÿÃáA¬ÐñùvÖÐéu¶Q$Ol¾*B«ìu»Ú9ðÇO,ÅüÝª~¦ÖÇRÍeý¿Ë ÊAH¦4Å0¥ò»}Ñ©Âø%E®¸Ùa>[Ôic:¸SÙìäNÀürõ&ÄâØ¢±¯ÔpVT~W7Óxw[Óú%½¾hUÛ ¹Ð+×¨¢WñÐê|Èú×úÌ[Óñ$I÷¨=MA{9­æPu*¯%áhq«s]ó|E1Ë;ÿlvnÆªOµ3eÖÒD(tÄ­á5yªIpîÄ(>_láV6Ñ¬ pc){V4AÑD%X
RféÅ= 	çã+j3DÐð}0]%üâ¶®¶?Ï",Ü%jL9ÇÝ¯E·ÿü{ÃS/÷jm=MRÔWL¦iÙ«Óµ&CnàÅ°åKL§oë"%½Á?tðÎl²¦ã= kèvwAH?©ÑEóy »H-~÷RM{¶a¿uc9±E¤Òµ+MxìâK=MA*!iÁÌW4LfÙ6ZfÏ<ºà ñ&UXÑYòÈ^|×W®xB,­;óV J
;Ð¼Ãe úýö¼ø/ÍmÓöîã8FÇ¨¤=}eYÎ¢ªøÛ´f\Ðd,]khÐB©T^­´ÚòðªÈ= ûVéÃu'ïÈ ]ø+Ùï!S"§<ú©/[fÐkfQÀ­n¡a¸:ýèWyCvGýþh@J@ëº¤ÑE1ûmPÛó®ØaWM\*OQÂ<ñÐycE(ñ5ryx¡âÎó}*t0Ñ^Ó¡Ï§¼Ý¦z}^ÉÜFoÞd+^v¥¿ÐÈQ-ÆÒhëÙ4F¿vhÜÑqA7Ûúv­ÀÕ;©Q¨v­Â¤[5¦ÅÞHàf&õAÍ/§er$´ô09«×,öu¯ÔsxDätpT{b
gÉW¾É
²F:Q´ûô@¶±9Í³ÁÞm"2Êøû7.ª¼åìNÃRöyOÌM¡§xkJK 2tBa6P9ü¢Ìü«=MËÿ8òÖl<£EV=}úØK¬Çv@Oßk£ßß·´Lº-LºLìNºLºLºë%ãèw8¥öá=}äéð8gtcOéñÅ³C@åó7ã~^^!)bjQÕðAx%§&½$jX}ri aøjÏ*á(Ñ5)Q93i«û]vAk¢iHº=M,viërD>å,<8Y:CØU!uEQ¯fÇDÍ§RTg.Í©¿»ãäõ3;pÈRóÐÝ§ºCÕ3Ahcjêt¸<xvI	Íwé1E+Í6¤Îy	¾<´9l<®³·þ­|ÉÜ/<bbÊço¶Ã[\æè±!6êx9HÂ5zyv¹Kn³ WpíRcTPª¶Ä½U<õHÉÐNýÆÓÇR¯FÕç\=M´¦»_pêëoðC- ì0³Á8fð¶øÐ´÷pÐ¥WEOè®6y/=MJ©¶	2Åü§±ë® Ew¢³{¯äÅj7§áb\õ+£Ç>*í½i×5êPAn,eÞ¦åxSå¹ÑR2cÌg"Ð_ü+Ì¯}vnËpjOÿCâBüØ7Ì'¼(&]¸^kòØÎ{O)P%Jrùy=M·SoY¢dèÑKm
HM;TÝgúÍ»ýÈ­uÍ-Õ?ØîíIXÑ¦ò~}+éÕ!AöÒÅÙ8NÅØ¯´fe~SóÙÐfÛ/÷Ä&¬M ¸UïÓFÂß^Y~ÙrôöÓÙßqâÎìC­ýfæðgÔ© WTãRÝEÞæfïãd/ó9"0ýiT?÷Èj¢w	ö­zÅOdRÿaÙ¤ðG¨&Qq¶øòó¤g0«3kENZ¾N$òøõ¢Ñt÷¤uwæçAÁmäÐ+Û}H®Â8~{¼Ìè÷z±pþñ¨®,ÁÌ ºrøâ é!t[zaôÜä£ªl6²§m+ÆÙSùS¯ûs Ø¶ø«®«C¯Ý+YË÷jä!¸;­%Ú1,à»;u"m9=MÚRxÏv·³ÖÃÐ´~öòÒXßnªäæôQKD í9$ø/cÊz­Dö¿Op=M÷­=M %ó¨Õ1ÎvÁò>%ÂÕ8s{Þäôg³5ØIä@t[;6¨ýb	EmAÃ¶	¥s4Ï[áIï>4"q-Je³AÓuä¤TW|Â=MÔ+:0.xUâ "ùOÜ³_&(°ÆùHëGAÈ½Êrx<>zÐGÀÓõy":»¯©JÂmkLB|´ÔÌË´­¬·íÃVUo?º¨¡È|'ªSÐ>6ö±®7o¸,¡°MÃÝûí¿Pçï]ULLÂLÊyÌ¥úºLº¬ÊW1GÖt_È¾O3×eR¾¡ý\	ÎniRª>{¨ñk (8èbÎu?ªI(Óý'oÃ8´ÂWO#iõèÛw° $¿QHý»tEhx8±ÇlpÀ­ øhª .eÍø	u¨qR&u+B8ÑCý¦ (§ª>íí«5§2[.}äáX=}Å©ò=}= ä¦ó/s5'= é³0Ã¤B$eó°1CÔ3.
 £¥'¹esÏ¹k£*D=M)xhR4÷!éÔh	Ý)ÖM4Ý×igv	:3X3ìIzÐ>ùÆ-F¢³Ðý/&Srå¹÷Ê= Ytå#¨=}ü,©1pÚ:jlæÞdõn]Û¹Û ,t¹·­³ Îí©ùÉÑf=MåZTP×*=MtüÛ9nLnÔW@fBýÔ¸Y(þ,\	qÓ¸ÚvàÚìwM_[_àÖ÷ÿ­o^}øAGF§y	"ñ$kW]¼gÈÙ%£D÷ µw<¦kØ$­wÃOBã¢¥[·E¡¤VËO@(èuxÐÝîzz·sdãK¿k_v¨áÓÝõñX/'no !=}ëçÐ¹K¥®N«ÎIe2øÞ=MÆÄRé¬«8K-³ëêÕ<ÿ%ªaõsÞJ¨fu+u£»qzuk¸@$£æ
X8¼i¾5:rEld>	I¢ú@9}ìÞ,Ä®RÛMª:EÞL¦É"UûqÂ=}wüé¢UNÓbrÌ´@nÉùæ~¦ = Fí#=MS#ÃmÁ!&Iiû²hgª-K²T¡¢h¬Â|èÈ«0DFéÁ{XÔfêBí¿È¡¤/ö]ùU \
î¦t©-6Ë¶ÐÕdúæ{¼w°Ç%Æ1VýÂBÄm8dIÒoÀ òîóÛÇÈ}';Ñ#$¦ò²ë.¥Zp[©jô¥YÌNNýýÕ¥'µzÓ'N¥ÛÁ¢G^Ö§ftbgNÒÖbú\[°ÌÑDOþÖ>ØpÄÉ¦Àõ!6ÙÂh ÕÝËÒ@Pß6Íæ¯Gø_C$ß$âèø§, ÿ^õæÁ
gZ¶aw@÷#%MïÉ2bRw sEãÂ ãÐ ;3î@,)çB¥c±YsK/!Â"PÝ
ëÀÀSÄ¡/ní"ÔO³Öfômÿû¦~ç¹ü ÙÖçùa×Ba¤Õq6àpwÕ&qipî0KÓlÁX.ómzHYú¬GT%òe(BW¿ý"/:ë2µ¥ÑÙ$ø=MKMh¤S4û^jÂ|2ûlP;:ð.7ûÁ(nÆ×ã±ýO¤=M= i¹ã=}=M(ÃÆfhÇ¹p·$(»~£Nµ(·4PI@\Vr+Å[D' ¿-é174p!bG	m2XM}©¥Ñ3eÆðV
ìýuB=}òM²ÿ+ü
pëCNEÏ'w ±ëgCYrP¡+%*H~z$¬liä8ÃuCpzÓú¸Cç¨=M¨OMíôQGñÃ¯6q¢~+xªQ@=M*Rq¦ªzXêÒ¬-~ezØkªF"8¶ÆôÿZßá)©é÷9§Íºd£oñ°¼Á{$ðIô$¬Å¤{%w»ä«6¡âñ»)÷97©°Ú÷7v16<©Õ¤D±kLDG=MÀ@æÌ©
FSHäý6ïA> eév61
5¨è¦)ú
xéx44Pi·4´K[=}l*r9p<2"Îjù£»IHÀÛ9ñ=}´¶õÞm9µN¢È,üjÉÇ"C2ÎÉxÈ2n@.?×= x]ìwÓÿðj.líG£@pyÏÝ±£meyxÓN¬;ìHAx:ÇõN d^]M$VN
Ò9PkGDªL#ÌNÂk+ú¤0LgÜ½-Î UCÃ¹x÷ºm¸~ü± !æ¦Á§Úræ¦È1É#rèÞT °¤I´=Maqz2¼/Î
ú¨ÐkºbhEîªYÏx·ªÝÒIÖQv¹¨\·¦gMþé\+yµnÈÄ]õúÓÂy¶®µøâc<ü¿g°ßäâ;y'°Ô Mzë12g·{ 9Ý£
 ï|"òøÚÅÎ¬]S¸N$&G¡Rjðù
%W?s;ùIóÊhÜ~X_âßßÕLº¥KÊ¬LºLºLºÆ¸ø	ÖRçO¶ï/f_ã{º S2= .á:cªÃ=}, =}!	­ñKvo<cÞ£Bò0ng$KÎÁ KðigÇÙ4£wêX¤[»6+ÄAÙÍô0«ØNAÒ*}c5Ükz@²è6r[Û=M Áqq_syÔÓÇD¹[zÕ*~ÄÐî^<ûäDCJÿËßølö§ÇX¥·óøê]©·ËuR{ìÃ»üÿÆÔáí§p©ÜqÂÐgõ1oa{âôÃ>Ï ä$2ôs×&(¨!)i31Sq!êtÃZqÓsã	Ëd3Gù×¤fä	ýý/P$¤~ÞyØä´kIÒßöS,$lÓy=MìFêG7:>¢ÇÝùy®¶/CåZeV¾{PI8w>*¶Y9iÖ²A}ÄÀ=}:òëÙ"f~m£uÓ°°Amm·ýü®MÊ7Ò$&
z}/ýHÓ«ÍÑq<YÕ½³²Ýrý¤Ø{åÙµïÈ@¿ÑSâúÏ;OË= u%Ë%541p2kÓºA£W¤§y%éÈ+;­K(òNy÷°c[hö+·>y7ò§?EXUEukÂ=}JEµø¹E%§[l9G:©!A*ê&9·¡aÚcdðîö9÷ôL2
Ìf7·iÞt=}H5­ÞÁÔ·Ç3¯¥ ÙóÜL3~FB½=}úVòKc¹GH|ÌY¹¢­·ÌUí;ÒÙ|ün  íY3UrbBòü¹¿U  ÃdbA)ì±È0¥¨·µ-õkQ@r\{{Y¿Ã¯¤_j;Up§$¡!ö¶î~ËÁ§VöºüMuÆTzà»{ÈÛí8°VÒ9ÎÀ;õîª
XÇ¶°"èýÛÊÊ@¾2îC=}©&Ç)Y±»ªÃ@Þ³j×gvÜH=}ÞÑÁVÚs¾&!\[{|Ä¢-þyúµÖ0©¿j~ÍtÛ'Ùx½.O|~ìFÛÃWÁFO_¼¤áÃGù?Ü¿ß= $àEûçÿ-í¯Ô:_C:oAbð#µ'ª mKíAóÂªÿft È!³
üAXªï®ef§#f µdÞc¢ô!âIf8º«lÈ@NìÂñ§Êì³ðYn+cDKúðÀ§çÆm#yõÀÅ®ç{0ÆlQ5sòËxõD¬u$øÛ)
DkÐ÷È)¤ogp¥m¤%þk0
%Ï:kÆµzR¥È9-u=MP}.kS\{yFÂ'}£¸=M-&b?cÂþâÃïÿ%ß¹l8,LºLºLºLº]FPL= !äÍ,òÇ$g×3?ÍZà= §58.èpÜ,$÷J= g.C¤Lp$es×Ç'³|#ñ¼5){pÌh#væ©£ª
2«ÃMvª·2Ã{+Ö¶ªB
;­Ïo!ÅåéäÚ	³z¯\¡·
éÒ	(<0¸:!Ä2t\b3U­6¸&D¨,t¨¾3Ù²GEIs	 ±g;ÂÝAl¬æå¾´Ï*,	|m­éºÉþRQx-¢¡â|ê^S'ÈúKC/ ¢°å|5÷#IÁ a^åB²y£ì+å6Ø½½¤÷r
+Ñü8×¯©rYHÙõP	:³KNS¤zÄõ¥ðjUî5ÝWo¹F2,Êò&¹K=}IRÀ¬ªp]¸)Èo½U§=}­ KôÀ@ðZp"\íèNÛØÉÏhª8¬D\(v,<yíS¨¶Í-vJ6;Å\OH÷¾ÇP¦£ÙýdZZ[wÅRræÆÍÓÇô¢(õ~X\{ùZÚóùÎRWt.= BýÙ^\EígÈåþO4_?§¡_úZácúà|æË+÷Ñ:éèjeSKïV§´H pdçF¢Þëiâ_;æó$º·L¥DKºLºLºL=} -r#ÙÅ°EB ìúº¹·¡¥Å¤ËÁl>Kk­?JHP@r|î2Ìû¹?FÁH®Ëó'Ã¿]ýææhº7« Ó!æVÞ²Ù° ¨-AjXÉR±­¨-9.OÑCtrÇ-m¼V1Ðvr8<[
Î¡q;GËÁF>öpø=M¥LQPÐkjk®<'hNý7:ìM÷Ï>
§ã{Ò¹àl f¯zä¼ÓQÈ;ª,ÒUM%ÐQ2Anzó¶»YÎEF	îiWgQZ§þÄÀ@æîÒ%X£"É\ýU;Ö¯ÏfCHÉ¤ÂÐQ©*Âm=}½lÑ±DhvZSÍÄØæ°\ûÁº¦=}Öð÷ÈBÉþnVÚR´&VµÏÒ~;-A,üº×x³®µX]­NÖÒ×a~®ÜÛvÁÞ9_ÞÓß~yäW»øàNëÄ3_ÕnâcÞã§}§Q 5#aþ7nÿãøgÜ/oÚaë×ûN¹ïzjeç";ü<gz¢!³}þÁ«ÕïÍê 5çp0wm¡{óû:fYd(k«¢@Õ»íÒÕRw;HWj%Gc+Iò@ÐoçÊÅ#·Ä¾}hÝ(c^+¬	²o=}ö= ämõ÷:¥D= +ä-õÈ~:[DpÊq'ÎeYiKyÿñ=} QH'ËTpÎÝÜÃñvÑ(c(K/QpÇ¸:ÁÉhÙûs]"¼æèd«gÛZ¨4Ä^8ø6Nx·(|6©ëÿÄ«»Vêq«¬i¡8R"d·ýéÐé¸v¸Ö¡Ï6éIt4mt6Èô5øQr)vp	xö»¡8tòn4k>	öIí	¶±w²)°lå²U´'V#Íu¥qîù®qÊó¨ò:$Fk­Þn°¨'»íüÖ|§òüØvmw°6»åäI÷N@Ï À¨å5ù·Þ®IÏÜt cÌzó=MJQ½N±©F:rb+Ãø¶yKÑÉe(ªVnr7³¨DP$xo¤÷j6Ì["­­Ùªß'ô0ºL-zN
ºLºLºLý§X	cV£Û =M¤ðçªo|¹á}¯·ðáÅé«¸Ú³áéSlò37<Tpn§ Uæj{ qO§ÐbhÃ[QÍ'ÚÃñPÒ'«ÿ0h£-.!Nh<Âi=Mp7"¨8hÍîM[l±Á©ë®R+yu\óþòJe+°¡àxÍ6Co8Ù&E2Ad<¸ôÕs5·0.@|j¡§ðéLÆ³¼oÜg¡Êéf>
kÙ/x)k;	©Kq³1¸¹4¨'tvR3YL/hX#DÓTt4eÛ2Ø}#¢¬P% YùSlÚ|éì²Ç2BÎùl¾Úi=}µO}H+×­Ô+þjÉ£r+³(¶%"^|rSñ´èºÒÙs­ØÊÇëjEÿ§p¦¿,bìë[²ÿ<öb2¢ë®'¥?²b¹öìMOøkLñX78Drb,+QzýH1Ym¨ÏTöíwK±ÇHóÞMm¤ÂSõê9ÃK0h$2¦¡ÇEðkGª¡8B ÍT §jó>¤x©E5ýú{,Ùz¤üK!bK.8³½UzöKÙ½(Ï¥E¹>zhûFU'7³@4f¶¬ûùXíú£øÈ­Q7¹À²ýfAÆû¹¾V7Ù À)¢=M83	ÀñÀñc;ã=MY%Ìv­<Û=M¬Ö3ÆqÈªÖ=Mö¡;õÐGt´?n4uÒGÀY#SÔ7«µSn¦ªÎÏgP±BË,n£¥Ûi©£ÔÈ{­ÆM~	Ä\õ³ÒØ×³LÊ®xÅØ'Ê[¥ÎÒ¸Z­Æ¸~Î\QÝÖo ß/_5IúåcÓ_Ìâ)Öî§ÿ[=}|TàzÕäëö/Ö=}VàFÞåpërâü(ócVBºLÞLBU.kf·LºLºÎöpPói0v:@'HdûóÕ3GË?ì4W$ ;Ï?!r¢éZ=MC\ïØ0ÀEótá(3ÙD57'Y$tiì3Y68A{ÊÑH)qx	X5s¾1Êw)¢[1ÆRçþ,?1l38]õ±m¥ÙùpÌÉ:ù¨ÙI;ùEy%ÄùÎJ+0ÍAçZ>¢ZÐÞ>l0ÐTñ²ø~&MH|ùzÈÊ4Çj¯¥ÉË{òBt-|ünÈûÒÌp-mnÔÞÏñùk-N ±åZJ÷ûIõ©=Må\bÔ@åR&úë|H?´ÿÜ@böëU»çZBbÎ,5Hr¼90rô,µ¸¥£µ,ÖèúCÑV(~N5x¾@QÓ(}ª¢ýw»ZJ1Ó(WûjAD1£õªÊ9;KDÐ,'ø7ói¥Ð+jµª¹MGTÀ8j)Ñ'Ù¤ÁBózèLõðL©tØiü±,®XSz¼L¡Ln¸²Èz¦zKÛÜ>.fOK0¹;ØJ2}¢3í0Ë¢Î9í´yëÌËO§P×´¦ Þ/fµòü¡Æ«>ÈZ¢¤bíî®ÈÏÐHÝÊÏÿªØs=M«Ç±*ù=Mz[LÎ¶OhËÀ!CGþÌ[*Ò¤=M¶«¼Ä1Õwªdj=M<Í\À±ÜjªvÞ#[n9EÒ7¯68nÀ´ýÑ´­BwÅP YëÒG¡BÛCn¢ÒÓ§´Ñàn-Ù=}Ò÷Ú¯BÕún¾5%Ò8}¯F ù~¸\åôÑªÙÍ2p.ô~ônÇÆ2A®ÐFØS;Ér?b®µ<LmÙ[ÎÀu.Õú¾ÚsÚÄe!A µaãéèuô´ãfúçõ§aâmÿMN b= aä¦é]®öÃ:G$¯V~?Åè u*arVã~è}[ïÛWô"ÑpÃUù¨xKqüäÒ)(
*¹¶tóN=Mh¸0Q(v«s:^(¹qjÂ"E'iéP6*¡)ÍvK V(QÊ#X	XØ-AÝohù¯]óàä«¬üÏ>°_UÄá4êg°ÿHª_8|áÍùàÈb_õÜâ%íè·¿°_·êáQë¬ÍßÊþ¢Âßädá#°®Kº<ºLËÿºLºLºæÂXó.æÇ\¾ Û_î¯Ù&_9ÞêdçAé ñèV2èzêbÒç4içP©éé2ÊètyêÞTïµz/nÏÖ/@­7 ÎÀËÐQÀÔY Vç>îãÒ¨?^0GQ*Ö'§Þ9wÖ8×Ö D23KYAìÙ3ÍF5qÃ0Éõ5¥t5Õ65=}¶5A0Qè½T0U6åÓ6ë6El6õ-6õ¬6Å66%L6YÍ69û6©}6±>6!¾6Í2µ2Ù[2)ÞB#çB{iKëlLó+K*D«¨Cs«D£÷0¡'8 ·4¼/¾°«Gµ­Wù9ÔýÓIî-kQ.Å¬!ì½ÕKAÍí½ü|]>i½å»U1^IÛÄÓìÈi¿ûiÍ»nÆ[*É#'Ê£ªÁ«ÌÇCÀ
ÎÅ£ÊcMÁ[GÄ;ÎÇËF%&æD&Ð¦®ÊÆ·¨©X 8¼®èZ³¸W¹R¨ØP¢xU¾¨Ù«Û¥Ø¸XÏ²Þ+íßÍß]«LºÔDºÌ¹Í=MºLºLºÝXF±Õ¦zmípü®AùO{.Å{µ)=M&¶ám$üH©Y6Q{Àg>¾°B8Ê_$î&RkÌÎ·³ÐAÉ&mømIÒûüvåQ+¼¿7¬MnBª ¦ò \=M×>PÄwÕ×x²ú&l.m;ûÝÐíÈ÷½HK.Ùc}Ö¨ú±WDÑ¬Àr¶ofñ}D	Z´Ó{ÆH°£ÒFSZþÓpFêCÓÕýï»¢*%Zñ+Ók|ÅØº²YÆË.}ÐúXiÎÐ+ÇXU«rÂk¶$®J}^ÎWéÓF}4W¡^ÒÃÛÌÖ~¯aOuOÏ=MhÏ
ïïjïï	~ÏV ÀRÀHHÀQä@N4@(@W\,ò#* @À\ÀV@{çTÙçhæéîeéÒ&èÔ¦êç¦Eç]oQpOEx¯\ïJbXj/XÏS?fcç¦dÈdCöcD6cÓdôVâ&¡ËF!³¶¡_Ö¡®!¼þ¡ÝsóÞ
â"
Ö¡
XBAãÎ)ci4Õ3!2)E1åD2ÕÃ1Æ2±ó1Iö2åv1µs2=M4152A´5´6©5ù65Ù6%T5T6ZDE¿ÍöÛæäÏ@)0à¼_]1¿~ô§xö§:;=}:ë<³¾C»Û»û½k3#{kó[³ÛÞ'8Ø3Û1ØÏ%øÞ ¨Ï¿Þ³ÚÝ¦Çü¡çú¥wï½gú¸wô¬'ïªwý¶g}¯÷p£×
d°P|0rð
ÀÒ÷6Òúéøjùî*÷©÷"ª:ïòPD,BDüÂT\"BTB]ª_lðbpRßÊE+ËHËóÂ=}Â]%= %  %ÌÀ%¦0¥¥è¥a¨¥yH¥µx¥Í¥Ø =}CË8IK>@>L8F+¾Gë¾AÓ»M¸Ds½JC?#KI{@LÓF3GA[EûHkòÍúPýø}÷}ú=}ø0¾¹þeÅg OLºÌÕLºLºLºL|fÎÑÀ³®[ìÚnýÜéCÛ¾Ñæýä%cc-f¹%!$Å%Q¥m¦É¥}Ýe¡%CÓ[E#ÿfÐv°P0oðwcÐs0ðq°iyð°ÖEý±¹µ=}±SyUEU­ÖaÖÖÔNà¥7ÖÍîÓÝ %y@%xð%Ê0¥¿¥P¥è¥È(¥Ü¥fH%ox%£¸%{%qØ%d%¤%eMÎ1ñA¡LÝK½MMN-ËÌEÌåË9û)ü1þ!ýÒ|Â¥­r¥c²%%Ò%cj¥*¥Ñ
%J% ú%g:½Tº÷\¶O¾gÏ¯Ø§÷Ñ£Ó«×Ñ»7Ø±G×¹gÛµ·Ú­GÞ gÜ¨Ï¸GÜ´gÓ¼·×¢Ýª×ÓºÞùxagÂ $Â¿Á:ç	s'ó%ê
édögyp£§43ÐyÇû"[k¤õþÁgmÐ£j×H!Ppw#û+	Qöj2gGc1jvH#SAFYp÷s(¬)Eô*h?#b{AJ=MðnG}6Ë§óÏÎä¤É!ÁCðNôò(*gu¤©1ÁTHpG>-}3ïh
h¹t¤	ÁO4Ðy'6"³%µñºJj¦T[}§<>KÿåÓ[PW²£ÖzX´!Lá9h¨¤A^:P|W¹=}[Êÿ!Tñj<#eF0½"sÈ	ÓñtYj©\;>0~öÿ)åi¡Ñ)CÈ1ìïÐæi'b#o Á#{ø	Uëòjfj#®p 0K'%cþ
½Â£yÐA³ã°IÞ~ñ-õ>¼x}~	Ù+òôj££æV?÷ªÚEjSR£öN÷.3yAï»dÈpAWËõÐÖ½«Þª$ôÓ)¶Ô7Ä\¤ü]l5[Sê¶h©Ê¤þAb0ÛTªX]×ÉENðdÙmú,¸=Mm5#|Ì·Ä¦MðHn7ÉéÍôv<z\½Î¥Îö¨íg¬× P¨½]f$ÇAaj^³<ÙBAªR;ËP$-g¢Ã(P«tÄV6ÁÃé~ð;Ab*V-SÐ­ÚêT V»¶ÓÁ)=}ñº;ÉªAêP$STV<¸Aj*Q,ÛF¹}à¹aßé]£LºLºLºLºLº}¤SnZ"X&´
Õl£ÆðÁ+ÓÊÕqzÃ³ ®Ã4NYæÀÔ¯%á<S=MrÙmQrÓVjz´(îÃ(±¼-S¬Sñ×{j]h¢ñ=}rÈh¥{Üã°3v?ëögÛ«VlÊ£¯7¶?¶g£W-òÛØ²nü[ÕèR!Ç¶­eÍÄð°¾·
Ùh#ZÊ:Ç¨	MðÉ|ø±aHûÀÐ½~ÍÁ'Ó ý²tXûÆ°¹Tyyl;Æ~.9Oi±qK¿¾gÌ­$LÙf»Äþ|VKQ0rÍ+@òÆX"ç¼Vñé/zM+C¦®.\é2f=MkEðRÝ´d&äØ+êÙ= Ë¿ëÖØ#oþÝ~sÃÔG®ßo,ûÁîØÞùÑO£ 4ù²= ]kE*·§=}-QtæÀ= SÄ@h ±q|as	ÔG &Yw+@=M*8ª5ÕQs;ÀnW¨æÒ¾Nÿóðh-;ñrqSC Ø!(©0xù³ ,H$°l=}ÓBï¢÷¤7dÈ«Eýê8¡Q5eÔKAêº¸¨ýÕP_"ûÄ¬8­P= *;À	¶ ÙZ»Æ nW«ò}ÑkÆ¿ÝïN÷ß_ßóäÎ^»G¾¢jJwBkûZb\Ì»Áðïpo$ð4"÷îÚ¾,a¿à­¨ßßÇõv¬B·ÑÐN[ªªLzFL¸ÔJÐkSkKB§¹=MÚ¢ý7¨7ù÷~å¡Gµí÷R£üûâ¼rÜ þ=M {Ç?¯KÎÿO±àë{þ£Ëèä£àRwI¹èáÑíáÜ3?Õ©àÕ$ÿÃíRÌ¿?Og8eØ¾	 éþJ¢$ª¼@Ý ü£ªÜÀbñmÉðëØ· Ï3ÎèÏUk:ùéKO¤\òk{òÕ:Vïåm,d¹6¸Ïp.ð±ÀíË¿Bfbªs¡Ôr³Ö´)Çª¹GJ.VÓIíä÷Û°a*álôküc3|_-xfÓî$Í8G=}qè|SÃ ãºasKC#ÉV¯wÃxÄ!ÚºÐºbtRJL;ÃÄmÇÂnèÚ-ï½Núgôl¦:ÅÀÃU¶ójöczÏê¬-{ºÕÿÛ' *vEÂêÀÛLKK¢¾ÆO]B#]«,	»§Çþ1ï²mÿÁoã%nÙ«
eqÈ²A(·ïòHÜOæÓº!;' BHoËl,Í.p6L<ÃÔFôÌñ½ÌZ½lE¹SÔ>Çd Þ= ÒW±e¯ÅüBÈUPæü>Aºk9tK2 A,ây¸ÇZfrY;4Ñtw>¢¹Ë§E5<ª-ÕB
Q58ö£é9ëC³Â¸qRø®í@ú¤jD+ËÀÉüCd¼úx¡½«AÈy!õ¬ÕiZ{K£ðô5ñþÔõ´l&cHØ~-][Ñ(­¦Ï}æÏpXÂ×­ÄRØÉ¬ ÛeÞJÃe]WfHõ½TéÍ«ÁóÏå¤ÖM
f"{Û?)ûYð:®µñ@»,ÚH¤_y]AKödåÀ9-»áR¤´ AR0k?h%p¾[fÑJO+«ñ@ÅáP	Ýu§÷Mô*J¤p	øzp.³qD¨,Ñ³>úvÌöøP¥ßø¨¥¨þÅ§µ¼"ÃÉ\«bLv"	8ÊKÛÍrªíoZ½qù8ÄÔÁ.Q0j¶Isxsì®ù
{¬ô~)SüóRb±²F_an4í¬0µJ"sØ*BóÊ?ÑGÑÂ½àDÅÙC¤ÌÚHDrF= ñ7Âu±¿ÍR$%[1=Mµ5ÈÆ,³Ç¬üJÈºµ>¨N.<Ç.Z£Óò´å¦ÝÞÊJ
cAë¢þÍÍ­ý×ß'$|ð÷= È8a7ç^oÚ~Ò;hTÐ¸Ô£|¸Øÿ£2±õRØg mãq' lë§ nái@G½0%ä4³ü¡x4|Î¥VýyGüo¾ ö÷¹¾ÂGOË`});

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
            Uint8Array
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
            maxErrors
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
        16
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

    async decodeOggPages(oggPages) {
      const packets = [];

      for (let i = 0; i < oggPages.length; i++) {
        const oggPage = oggPages[i];

        if (this._vorbisSetupInProgress) {
          if (oggPage[pageSequenceNumber] === 0) {
            this._decoder.sendSetupHeader(oggPage[data]);
          } else if (oggPage[pageSequenceNumber] > 1) {
            if (this._vorbisSetupInProgress) {
              const headerData = oggPage[codecFrames][0][header];

              this._decoder.sendSetupHeader(headerData[vorbisComments]);
              this._decoder.sendSetupHeader(headerData[vorbisSetup]);
              this._decoder.initDsp();

              this._vorbisSetupInProgress = false;
            }
          }
        }

        packets.push(...oggPage[codecFrames].map((f) => f[data]));
      }

      return this._decoder.decodePackets(packets);
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
