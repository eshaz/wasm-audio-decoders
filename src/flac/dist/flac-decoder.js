(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["flac-decoder"] = {}, global.Worker));
})(this, (function (exports, NodeWorker) { 'use strict';

  const t=(t,n=4294967295,e=79764919)=>{const r=new Int32Array(256);let o,s,i,c=n;for(o=0;o<256;o++){for(i=o<<24,s=8;s>0;--s)i=2147483648&i?i<<1^e:i<<1;r[o]=i;}for(o=0;o<t.length;o++)c=c<<8^r[255&(c>>24^t[o])];return c},e=(n,e=t)=>{const r=t=>new Uint8Array(t.length/2).map(((n,e)=>parseInt(t.substring(2*e,2*(e+1)),16))),o=t=>r(t)[0],s=new Map;[,8364,,8218,402,8222,8230,8224,8225,710,8240,352,8249,338,,381,,,8216,8217,8220,8221,8226,8211,8212,732,8482,353,8250,339,,382,376].forEach(((t,n)=>s.set(t,n)));const i=new Uint8Array(n.length);let c,a,l,f=!1,g=0,h=42,p=n.length>13&&"dynEncode"===n.substring(0,9),u=0;p&&(u=11,a=o(n.substring(9,u)),a<=1&&(u+=2,h=o(n.substring(11,u))),1===a&&(u+=8,l=(t=>new DataView(r(t).buffer).getInt32(0,!0))(n.substring(13,u))));const d=256-h;for(let t=u;t<n.length;t++)if(c=n.charCodeAt(t),61!==c||f){if(92===c&&t<n.length-5&&p){const e=n.charCodeAt(t+1);117!==e&&85!==e||(c=parseInt(n.substring(t+2,t+6),16),t+=5);}if(c>255){const t=s.get(c);t&&(c=t+127);}f&&(f=!1,c-=64),i[g++]=c<h&&c>0?c+d:c-h;}else f=!0;const m=i.subarray(0,g);if(p&&1===a){const t=e(m);if(t!==l){const n="Decode failed crc32 validation";throw console.error("`simple-yenc`\n",n+"\n","Expected: "+l+"; Got: "+t+"\n","Visit https://github.com/eshaz/simple-yenc for more information"),Error(n)}}return m};

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
                module = WebAssembly.compile(e(wasmString));
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

        inflateDynEncodeString: {
          value(source) {
            source = e(source);

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
  const header = "header";
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

      this[header] = headerValue;
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
      const headerData = headerStore.get(oggPageStore[header]);

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
      this._sampleRate = frame[header][sampleRate];

      frame[header][bitrate] =
        frame[duration] > 0
          ? Math.round(frame[data$1][length] / frame[duration]) * 8
          : 0;
      frame[frameNumber] = this._frameNumber++;
      frame[totalBytesOut] = this._totalBytesOut;
      frame[totalSamples] = this._totalSamples;
      frame[totalDuration] = (this._totalSamples / this._sampleRate) * 1000;
      frame[crc32] = this._crc32(frame[data$1]);

      this._headerCache[checkCodecUpdate](
        frame[header][bitrate],
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
  const isLastPage = isLastPage$1;
  const samples = samples$1;

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  var out = text => console.log(text);

  var err = text => console.error(text);

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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0146c05a3732ò{ÚbWt.á#û=}EfÎÄV	Ðë³w¹´ì_Y¹¬¹°[oc×ßow¬¼´ô0ÀýM¬~ÞD þðñ 'óù5Fý's"üsêuüµAÊ}*ê
Ã (¡ÒØûYG+»;Øï3ãJ¡>Âñ?ýG1=}3/ATfCyÃ%KøSyPNçaHof¤ÇfªÌÄLcèfª>grÐý9zã¢©Ôå?nìb%Æ5Ç3>¤Þ= |¦Iá6Ãö_%U¡6IN#g
èý0üü3;$ÝÄ!D^ = QãS©NiÈ\Æ®9G@÷íÞÊuñ^
¼õ¾©gfr.~o+¬öP,R<iL¤îþW Ç'¶FøVjî|Ò©qÂ}ðn]ÜPcO×,°Ë«VÐh"²P®àÃËìÌìì'Qj¥;Î¤.¹gtß~WÚ,H	ÎpvúâSvk_hÚÐ)ñ,cQÛª¬³Þ{©û·qdâÊÊ®i¦;YPªPr*¼ø5 ~î,	Z§ÆÅ=MV<HêÐÁ2û ×ì*#¬W÷>§í[= z¿q¾nþjë*Ó3ù>º HñÚáÐ¤çæ­¼ãW+ Î²ötiîq6²)ïÎ¬F}¾áÆ/ÈJ'êÈ\ít77ú¯pè¢ [
Zú<Q|Ül
;H5ôöÿa	òæðÏË º)GòÏm[´V)Ù7?¥KÓmõõspÔ§SÅ9³7@'¯êvC2s­gD6q¦Eõxâ'-å>Ìè>¢æëíwuß¯fiâüÜÕ-u1wýE Ø#J£°ÛR×±!pÅ»3EyZ:j/?íð$oþ[rúä:d#ÛÀpj#­»É¦Ï!éJq5CpvÂÛSÈ$F®ÍÞ¡»¸µFÚTì=}£Q°
úR+aËê½PëssëL8Be= 9)Ð4O­Ý#y2¾Úc= =}^np= ¿Ï{õ'F(u²à]¸OÀÑ÷£¼I¢ØöÖàØkÛõkÈ¶"£=M#xûüdô{x ëÎ©x´¸ 
RßßPÐeX©ÍNF,!ý^?(HÙÂçYïÏfq.£í1ÅY¿ ¨yUn°.·èç°~ß£iO+J{Ù¡ÅhþÀhþÝ]Â_@''3ËO {1bÐ¾ôàïþjûQÆ2®¤+Ý"]¹t~ð¨Àau¡¿KÐå«}ÇÀõ¬æ7Ð=Mp~½£}D²©]÷ªâÊ¥HÓ-Î[@Yü*< GBéu)Ð)ð#Eßí©}évá¼èâyyiÆºo6ÝndbÐÍí¾Dnöø÷BÊÚª×¸Ð2we¼rGÙR/Ì}<NjáÀ9§×= ö+µ.¥ï[ðxò}É¶7°ÛyeôíîåÄðìà¬9XÈiÇØÑ^BÆK½Æ½1
­£×ïSºiÂ"ñkü¬Ë>«6DÆ~?àþÓºÿÆiÁb»*îõc/®îí,.K3ñúÏcóaxh·ú¿ácè)®AÎü è#Ô<Õ®éi*.ÎÔO·©ß/×Êñ$îMþrÀ:Ìf£Tr¹qZ=M¶·²%®0EöØÔ6NæiH*ÎÕFõ6(ç=MU'ºÁ[ªeôÐÂþÔ]ôbuµn«ùËq¬qrßóöv¡à.eÖùÉòwåSb>¢ÉUà^óÜ¢r©'¥vÑs·^ÆÐ?'æ­Äjé²àÁÉÒÜbòðû¨#q¡PëÈ´lté|jÃÿUº{ýÓô'¹û<úÈ<3©µ£µü ôÁî1ÔDöó­Uõ0Sd°Ï&Çæ¶ÛÃbzfm­iÈz7pùøò¢wD,¼W>;è¼nªHäO¢Åë}~î[cÞOYÞ¶±qm6Ñ7ÇxG=MJ$^ÁlXÚö»Y¸1¬©æ¡¶8Xé,4XôÛ¶Á<þGvÑIôOÂÁýTx×iÍQ1Mb7ÖbÚ·&¿óYê!Ûiàtêj[w4(ðfj=M)EëTâ^ûÿÐ^Þ2ÈKAôYÝä= {Qtîthnä £¶¾Ø»ßX¹ Ü]¤ÃÞ·Ê<É¯hëÅ"ÏéP^³Hz´OÓN>Æ0P¢}­9),Ò¢ôÉ$ò2/¥àyóOÇH ÖÙÉY4ìÕaj@ÓÜ!cê=}¨L?ÊàýÜr»';É=Mª0/«) wKs¬ç%}ÂgÉV0
³	3­núÉçÜNmçÖoCß=Mjð¦ð©«¾uïÛÜyÎiê};)ãÛ]¹×ÆÎÔ¬?É[P	àï¸üñ¥ò¹²!D¸NCÉóÜoæo¡:¼À^]ó£Ã½5"Úðê®ÍT×~é3Ì¹Í2_£PÂ«+®Um²ª+ñï}UÃ¨fJçÕ!kÓª= µ´TBÂú²Ý¢XØ"[fe]Â4-±POmþ¿UmBåQ¨âÆx×®Ji"þçCîTjwñm¤³Ð}ª#-[h®A-&Kß,[Îâ(S$w5²ÕA-@ð;xoõ_8xwdZº,×7E_ÂbDfÿó24NîkºI=}½ú@:÷TÝ°5!aM¼3Â2Ø]ìZ¦$5qíq:±¡G4Û³±]à9®øÍÑüÇkÿP°N[l½îü1ÅTBN»¨.Ó¾O:iñÈæIí4«Þû"ÏÓ, ßÈdExEq³´[-äý'iwo½ÙÕå4!3ar'ù	Ýªä¶$QËÊ²ýGaDKWX3%Îz/0TâzPµ·ÀÌüüãÑõåÙ®ÓúA×tií/?ËQËÌeÃUcÛ%"yµ$á¿5áØóØ4ªpýa8ë»h×LihEg|·gnGHrª¿å Ø	¨A¹¯°RÑQ$Q´1\Ösoþ£u®ÑaNzt^vÚº·!ëþz¬ä%?ãß=}Ð¨­A_ßÁ5-äÁ4ÿ-äÁ4)o~×F6©ð.ÙB=MU3§&ù÷Ì6äÙüÑÐ_ò(Y£ôá´ÿ´ºÿ¯¹×ÒUÂþ±y£E|ãÝ&wW/{ªRÐ¦«ãKINmÄNB1ZtÈiµúpÆ¶gÂK]d÷£¾
ôQÕt¸¦ÍÇÛÇCÙw¸Ö;×ITòT´diMiMo\|ÌFiÜ'WÒ«H'WýWd_d§fFda= ÉÎüöóTºbf@Úñ®ígPíéÆÄìocn¶iÆsHxãÆffiHx%°rKªÁGßJªof_ 7VÖ_JªìYÖÿéÆK= ×qZ»ç¶ø®£µ³±PLJjÏ_Öx1= ÞÁDïðÆ0L-Ñ(¬´ÐÛåä4B;%Î4~ÜÌ¾±Ö õ·= É0èÔRüvË®æwå±ª3üA2gÐ=}æ _òrÔ»Òý±õræp ÁóC,/|O\·"qh'<8yl¯lÚ·ëyëi	,ôÖ½Æb¸æþÎ("O×ñ 6m lji¢¡ÝI©ËÁKÒý ãôOT8_ùãFF'5Q=}GfÄ_ÉÒßmÕrkùöpj÷þ7èÞhsþMH~ôVÏ]gûËÝg¼RÁ í½Ç®czÀ§Ùhê§ Ü$É>%{ísªß½"NvxOh-aQÖkRìlrt,Øº	¶êj³Ç(rZgIÙªyßlÈqöÓOy£èdO¿ÉWFW dÀlU×ÚÚy¶ÞMÉß/qyÃ«|Zx2Ø^<ôvX¯[h;²*¤¡×jRÊZÑÞÖÚôNb?¤$à= #=M;öoDZQÅM
ÒôE«§Ê«ûq¦3Á¢,Ä/E>´~ØxLÿl'¢g!* xþVwd¬nùÖs°¹w¢ÖÏèshÏh Ïµüà½¬}¦±YÍ¡hdÎ= ÓZu¦aò!EHU<V~¸A®kóiTQÛPÞÙÒTmzÉµb\|4Q§ âAH§òL¾Ô%Ñ°r¿¥Gó²0¨Kg3¯Èf.×cO¤"Ë1¼Ú8på3ç´ó£ÃàR!Ô%ÖtÍCò¨³­PÕ®ÿwsë¸´ÿç®¢^vðW¥ù =MÛZ#Ô5¯æÀ¬ý&¾ÖsZJznÛ¦x
\"¾Ï¡"¸"ô'wëèkM0Üsä¤s\d#2ºÈöIÞ/Z<Xü#MjÎËu*cú?=M;}CSÅÅI+\+aD@wBÓ.ÖçA9káÖöOâ=MøüñÈó(ä³GÀ;æÍ%*vÔ¡U/ihªqõ5à¦+û{»\â¼¸åØwÍ-ÄÙèÙ
eïlÐS$ý q
ñíOxpÅx'^:³
dbf }.Ã%Ðxl¿´a¹iØ}üÙB%´²g?³j~h¿¹µ63,LÏvYÄ[ÿ1¶µ²mBçºÙuµ);iØ8}7ÌØÕ´i?.Î*á!D\$ 87³jee×Â±¾/lí= UÕ§JBç= ´´EU¬ò¥RÂM2Ù¿±È=MvÃ(³±Wã¿)u³6Þ°X8ÖGoF*-	lîa®Ààq=MU÷OÞã'7j¢J2'¼KP@3ôS·í¹+§v¶)Øü$î¹\!ÍÏZ·Bpu°]ðÙHryþPÇAô'X2cå®¹®Wø(UcEDÈc 0ºP´#U<LÜiÒæý(INz©Åº 9G=}¨q'§9Æ!±ÔÂÁzbO,¹|¿,õhYdKVß|*"køºÏ4¯1»?rò¼hCÐrÔ-Ã|ÞÄõP1uy*×a¬ÃÄÄáB¸¯_ç=MÛ0ÔñvzFa(|Ïôqi´L" *Må=Mi±%ÿeÚf~¸G %ÄÌ|¡«ÞîqjR43 êtÿ­æ^¨ðGØeWn¡ík±Ô*C>:ø$ç¹vç¾ñ¼øÚoñ¥5<v¤Å4¾7ÁH¿ê§Äïß;­2'm§[Àï@a0¾ÔûAö¡3zø¼æ¥3^©Øå}OTº"»áÚnÚÚæ%Å.DålÝÂÎóúÕñà><mMÑÞcádÕXÊÅµjm;#Áb£mUâÅ&Z(ê¯= ¿#dr²Üän*(Bö(æQ<0XÕ©;bÕðt6n1bÕ76;RÕê<ÀjLÚiÉ¤ÃÒO;£Ø±ïÏÈÏY¹lÔ¯èª¨YQl4É{ÆùyOî!ZøOÁeÓ/¸¦À\w+ºJßtÞf+Î/¼µÉû«3~ßoâZªlUÙÎÇ	)¯'¶h£=M§TÇ	zZ©T-IÍ/Þ	b)¸òÎ=MÎÁW·r¡p2½Í¬h¨&U>wuÄÑ5¿oÕ±A5SYwk÷],²þÚ]¼¥ãeËÿsÕo.JãSgëvP¹ëÄZm
]X3
ü Ì3¨+8ìL\ZLxîZµPKõ!.øººëÍ<²qU¿Ád8wU6s½LAÆDÖÙÑHX<j¿ÿ8±aÅºiàOWÊ-Î¬h)Î¬h-Î¬¨WW
HWõSel2ÄÒWìèiw'èMìQlº¨ s}éPeÅÙT§ò Õià²ÔW­©
ØÎ©´_1ià>wuÄÑ5¿oq³Eãºôé»ðæÑ!Ò.§xËßñº\ñéO@dC~© x£ú© Ð¯:÷Þß$Ñ/Ò/A¨ÀÈ¶gÁÂÇd¥®ÕÛ8EaÑ³üïrZ|\ ç4 ³õ]L´Kæ·+!r¢"c+?â{Hñ¶×C)²YOy§òiwª+£ÜcøaÂ@Ä2ZðJ#fùxÏÀ= bdôÙtw^nyLàw&n­ ¼/At£¼/r0°LLyèéÁxèd¯­&Nn¼¦Òøumc©ùä÷ÈÒ+©,×qZ- i9VÑùô~5Ñ9·7òqtA(Ø±<ÐhÅðb¯*±	¨Ì\@Q³§Àáç.ß<iiãÕÕºOýÐ$Óî ¡_é.#ce_áU¢ÓÂrt=Mèí%}t|\ã\Õã³è}×õS=}u8{úv%Vo_ê¾­(Ñv=MÿüOÄ,pF¿.ºxC^ÌùÌãr5ÚÇXrÍþIuÝ¢ÛìÞáõ*,£´«½ÔÌ!ti  óhÛéô+¶%ì¹÷#ÈÞcósü§Èå²°tU³-ä8×·¡Ãöz;ùìæqÀÕõ^$#ãåQ¦|Õ,Z"{°,ã#g*Ê ó|æç,©¼s>¬¨îµ¼s¬T84Ü¾éôûê±Óü~ÑÙÕ¨ÀùÖ;¬Ñ])\µ¡½%(3¹<\±VI'ÖmÄ¨5<¾+¯Mÿ¥cÖõ[RæþöÉy	ùÖü-uu{äø!$j?k r:"´K0± [§\¼ð$t¼txØÿ$çX=}ØâXãáâ)!Dªåµ­l­>\lÇµÁ­Ù­ÙÐµ?jÕ»OÝ°CuëôuÃë±í*hI½©¥ !dápL²ÜQËÿýæö!KU=}¹
iöÒ³lz²áçáéÖ tûÍX·×'wÍéáûé­ÕüåFÞI®{§ÚoÇÜÛ_5G'ëþF"¸sÇe·7¿Ù p&ÙØ»Ú¡ïvíhÈügå°)+®VDõ=M 44÷×g#âu	'Ê6d42é+öñG~4	o®HRÔ71íKÁHCÛÅ=})Ú-*o¹¥+~Ú½0æÇâÀU¥=}ÌY³8þ©»Êr#QÜPâÇYm>FÅ3P°u U Á#O<<võÏ2T±Z¶ÔÆ/ÂÂ¿Hï©7ñ&\®ì$ÇpÒVÔeÇì-M;móm/¿ðË£Âñß[uºvpdÔÂ»4	Ê{¬Q¢ûZ.ri/L2
¤Ê0°±f:Ù0n	µÚiªåÂ ²	b$ùQ¹§}þPß}çË/°I«¶JÇoì+F®Þ¤Q+ M³ËÿZXóî¤\¦N{!lh*p¾òWP]åTÕ-	{/ïI· Å¶¹´O-'¶ÚlþíJMã=}ñ¶4
F ÿ(æ@MWï¢Ð0U¾dr_OÚì72JÈkþ0AÔ¤eÇìÔÚ
µðNúéüSºôÕªÀÈ¥dÇs"!Óä´áÄ ÏõíRß¡²|NÆ¤ÕØ
¯BÊ#ê!°ãWñMò¾ImSmÜ»PÒ=M®áÔu%
w'G|S½+ÞvbÍ¤Vý8¤¦oðÃ= Z°« |×­Öóê²²ffD¿ ðîRÛÖco¬êÚcuºç_§.d*"i-h/¾EL\Á}¤Ë>´¬	Óæþ£ê0ÔÐÄ_ÞÎr~´ñ9r-öÖ]ÜKÆ¯Å-$qe¿%Ñ=MØ¼¾è¤×<»êîi^ôüSÂÏÄgaiY7TÍÓÖ©Û~4YÂÙMÉï»Ý ;¸«fDF*i!JGpËÀÆ6¤øh¯ÿseqø÷hyègZ¼ |?´a³Í|«q³à,:rÆnÁ"Ò	Ó Öu|s{!çÔa ÆÐV:Tzæ&ËèBâßæÞíóaR²ÒcöÌx|hÕ«t*q«?c¡®aÙ´ÑD
áï¯Ë(å(Àg Íþ~·6õNxQÔXTmN-JÕ¼/ãtÃe5íz3ÀBx#)ÅuEQ=}+ÅO/qB)ë³äÈù~»¨.Ý_%¹ãnlj±Rm±RáâRáÌûxâp÷(Õff$I
×sé©FEYdÚÃh¤aÊ
!È6ÎémG-&£õF8ÀtÀ¯9¤ GàÎG²¢uñ-kÉ#És/tx¼M»Ücgòè-ïÆdÆP«p¶æ«O°© ¡lûÄñuivÖÒêYs´"rºvÍ3Må=MºøC<Ó/äfô¡ÛÏ$rëy!ÝêÉõçe6¹É¹3äWOë<[gµ»¡ ðGõ0Sú'¿);¤¢Ubò ªmðÀYs:(<à\¶¬£÷zü{	¯ûi%ÖUÌi%¯:ïbÙôkò¬Ü&µ+iràWKnÇòJ­ØÅ/Çr=MI4¼Mø´DTÆmaMøèÝä)³AG6hæ¥ÐE&Ì7ZÜý'ûfë2eÜÔ+Ó.-!¦ÿÛ:Al"ùH(6ãûò­É\zKããÓ{^þ¶?ð'ôtÏØQnY´½h£Ï&@®RîB¾Âæîµÿ'NÓj ÐÖ>ßÚ½S }¦E	©M²õ¯¥ÿeiþÊ)Oæ!-ÓÔ«ôÁ9Ä7¼ ¹»ìÉ'bÜN­ÉM	u¥ H½ú%ÛIYüàM¡ZªCÔ*ãõ"uÚ#ü&*ûõøÀÍ9åþLch×oßu%»toíµÆ¿W;îÉFØ¿u«Z^ÈVêßKaÏ3uD;ÅA½E+5E45­©»]DU¥D}E6ÅB?aÀÓN7bNJ=}çºèÐÁ9?FÎ±"§¡| "°M/¡²x}½v¡ö ou)^l[UEvã\iàÜñècÌó8(=}ÓXºkéÈ=Mî¢|¾ðÜÖz¢â9>ïO7¢½®äuû3÷õ.¶&ï¥ëhvTYúÃ©H²'"Æf,'ºR.?0ÇGÖuÎÔwò7MT@@¿.ìkÍ¬À	±tß[=MÁ¥T#/ó¢/'*DZÎÕã°ØðMÿÖçåKg·W&-+*h¶ù®Y¾v3ÙÖoÉï*:³¦L¾m2Îÿ×FtÓ®)v(j¾f°V³1^ç[û|l"H&Ù«e°ëYl?
úHaÄkÖjTicv¬Î¯V=M÷¡#yT?_}Uz£CÄ¢Åié(UÞX7û?ç¿|~cx°êFXO%k8Ìðkqjðt7¿no­ú*?°Ûù¤[/z åþ= vR¹þéN3åDÊø&ÿÆeÔ[[Ï}XÈo 4¾Ñ5*¾ÔZ 4X©(¯¶:¶çàFAÝçB#¹Ó=M$r¶Ö1ü]ã:ÂÇÇF>óÊæd¹Tµr­§öÅ=M±-[õÃï!9a4¯RëeÃo5»à|õ\{Û=}f5yf Ò1ÅÞÔ?{Ýò¢øÇïóR/ó=}¸¿$ðo+æ¨d.¢[À]vÄ¬>ßUHeô~Ó×³beoecâÑÛ~|ÊPÔßb5Ý39dìeÆá]3«t]ÃÇ¸..±¾ÀÒ­@¿n¡TiEx	v¶Ã¿îed®Ü	Qg=MGÙ[Ø ¤jñÒH®FjeÊl/÷ S&Æ¾éx Ä ÆKdóöd@A[óöþ=MwpØk/9?/ÆÍ{Ö¹,/èAVKqD-bì~/­>Þ6ÓÙÒ|>×I×{ºc(ê+» ¹À"wÓôÀ¾Ñg3¢M¸cú¦¢þT¤£MÿT¤£M¸c-Ö©Ú\B&.a¦¦°cT®-ÿç¸qT[@"F!¨ÌHü\ÿøAÂj8~±vÛ9okf5I5A@ì=M×ÂÈÒåÒµ~LÃ¶a÷MMÎ¾jÅã$>\Õ*Õä!8"Î*Ó3jýa¡Ä·auÔ$"8aÂÿØ8ï4"a!OÅÙµµ²';!¾C8Î*UüÙBC¦Qý×Âº83jÅÑµµ´g?>|ØÕÕûã*kûË*qÓ'çÂta$w °GJtH¦¢YÚ£?è"ûÏ¸kÀ×F-ö*Ìè@¾ÿ>b	kl¾Ò$¯YÐ}jK~hÙ_«<\/¤*8ê@
Ü)R_¬Køe>)é(i-i_{=}£)zÌx>aCNÄmeÑPò³ûR ÒµUØÀ¬ÚÈ³>|±¾$:6%wqNuàRom½MÚÝ¤¤×¸è¢e¤¿»SÏ8 Æ¸©[+,ÓT+ÓG+Mñnµôç$= ´óèÌh+£¥Un¤?= ÐÚY+ÕÎ6FÎZBýÄ@¶D¢&¢;Ä}>PU¤\=MU#@âÿáê¶Ø_yÉ$) ÝbfNÍ	dÏÝ"²m´YÖ·£>
-;¼kG ÁÈWzÄ·c)gAmíaeym&SGQ!åmyÎFëÀ[hÜEE°ÔárGÔ6m(¸¥Ï_pwk¬¡kÙXjË*!>dÉEÉÍÕÊ¿\ÈÚ¶²+?ÊkXe!Iö/¹s÷Sö #l%%lÅ ßeyt7ôí	úã³»¿Þ"tô¤¢ÛX£á#£û_Ç[üÿg
óÜ);Qqí;Ã¡½ª2T
,RºÞc!= ^RöËUÓ[°A'=}eå¤LoÚåiRÆ²á¦%ä²O&Çê·MìÑ]¶YöñMÕ.c8qQì;ÂKíC¹uNè?w>èHû×Óáüµá«±f= ;¬%|;¨¾Pmrbx%Ø¬t *× <)³ð­h) ©Qê%x×´¸>6-9ÜåïCÿê{Í%¡Çr'Çr¤AÑüõ¿¡7½=MÁau#ÿ>+·7÷Ó(1)¨ýò,.Ûw S(zÆï eimÇº t¡õP \Þ8þÜ)íVV¼§¡ÉFì§õ IO¸d]OÖ3 @OÜè¤|M1|ç|õ~ì®ËU½B"«Îu_ËøOºWz$·3×%DÃ÷%¶24á%.~÷H1°!Jç9E=M%E)*qî¢XÁÝðcxFrgj£¾ø ïS¹S¸ÉWnÓº²Çêº--ÈÐÜ@=Mþ5cy(,¦´_ìå	mgO+çíØÍÎeqKm¼Y{ÕDiÉô Ìgø}Î@Ü%ïèvþTÃý|"Xhsñïy2L3Í-<ç'Ã..­«CÈSÃû<£Ví#Ì>ð«Á	®.fn)dßèÝ§tL|rçéF<æ:y3HÌâÌPmB¨zÊ5,Ä÷7@éjß5*ûQu¤ù"9:ªØÊ_EÚh=})ãÑNÕ¸ifÁ@û7_ã-ìfíìp-ô:öò/¼>·Y]Ùry;{ÈM´ãí±eì®¬D¦±]³ÑÝ~¡ÛÃ0Âc5òÛg¹üÜÏãÃ:Ø¶Ù1-~¬³kÆ³=}ô0^bï( ;áQ>¿ÁVHÕR(´öÄB+(m«*bw:ªPP ß®= ÄêÑ÷·Î·ë5E-"ûx©D%ª­âJ/äçy·å^x¸©}ÛòlqªyÍèéèPºA yi)üÚ±ßbIÎÍaôzÐ$z^R?øAfÉÕ×&Ñyø¬a®ÈyQ.SYÌ/!°õûÔp&naýêEÕè4®å¥ïÛ×æNGÑ4&HöBÐô/ÖÆ \{t=MÞ¦~ÛjÀÇ#zPÖWF5ìÜ0Ûçy:ð^õeÿÿ%ð+¯Ò¼))Ò:v-¨äüCC(<:ôNíL<W·å44úÙíaßìa³ôå=}MÔ¯EkÏd0*õkÎ¨âU*sVó~eÒ0ì¦âý\nÿ´ t¶~l :R|ÅL!î,¯>wî»wjV>PÓÏ3Ûëuj¿¥4!/øs/RtÛÏ&D3u68
tÅgÿ½abÑõü<¯èB_}Ê£îö­h2(æßG!tÀÞcê8n0ß\tÆwaÊ>³Ôs±
TÏ(¾Ð2§{yº³·5ïåX¬ðv~,öäÈhuoªePÐ¦b*ùS×µ§oSù»§}ù×Z¬çêZP­3äí3¤]°¿nÉzZÊe¬ÚGçÿP¯RÊÃB÷¾ÆuT5bWZ*Ü¼*òÃMùTã.A.i+n>þM¡|ôfþM­Ù³¶Ê©Wâÿy>v»dD"#£©hC¯ñ¹|6@Ï[HZôI1OX.òW¹ëÿA;vÛõyÛEÐ+!ßøIé°$÷s¿Á¡84aÀNôì1aß¼Ó©iK=}×7WX¯ÚË?ü)ÏÏK];ºtÒt³Aµ½ì%.­©µÛâlvfKª|àr<ùÌÁ%|¢câ^ÃæÃ m0·qÛý|¢ö¹ªC¥S= 6Jµµ@Ãq[åP¯ú-máM¦y¸,Wç-º]Ü¾ÀëfhdÖ84&®pËæ(
T]]YÃRIp3Íõ¤§Ëîqa\ZV:¦XYQ/øbÑ«V$ÑÊOXÙ"ÿs#Ô=Mï¹Ê´L¯Iû§ß	aT!"íiÈC6ÜÄ±é½Ä~gVC¦ aªe¶"ä=M»fO¿KÍ:å1ÕUºÜÛRâX¡:GGÁòT_ ­¼RX*e.rÅØî§RÅßg*Ô¥ÈSÈcÇ[²+ý<ªZEø£6ñÑóè ÙÐFé%^%&Öj¢|ÈvØYüÐ¦Í÷ÀìÒ$»¡"ÎÓF$£úG)¶úw¾Z>ôÊ5,È)E©O©ECªoÀ­qpà	O~nàÑ#'JÈêæ®äÐÜÌZÐé¹B(hJs³Í>5Zî ¶ÙÁÎ!Î8è¿ÓÙ»ÓúÎõ_xÇô!0r²ªee]vÀ«O¿E×)o¦F6ÏRJÈÞoJÜ/å'Õ{T{_4óÐ³MûfZ{b×BöSÿo<=}%Ëï¨Lãç3õ{y	ã
å=}üATk 6Ä¤ t?ØOùñà© âÞG¿P#ª= T5>ïe4Î-ê[	LíjåÐððÊºw"v9XÂÝQ,¯A(ø:å¬«íäÅýn­Ã0+ºn@ùêA¯F>AìLE³úCÔsC<²/ÌÅÍ%vØ0=MtaMïÒ­¡.w;ÿãIq\]#ÿ0ó|¿zT
úCf¥s§·]k]óùAóéë_v
= ³þpÜÝ1pRL¯U[B9è³¤aða£ÛéÝlßßæåê w#ìñÜ÷@dë3÷ ÆëtÌ æ8Uwgé¸â&Ò= ®þáa¯= ®7A£ñm«
Xv;ÀÔ~m±éÔÈJOiMl&fjfDâ¸×a4|6©&)ù=}¡ÎTåflì{^.¸µòzÊÂuÜnû  ÝÄV¹Úsã:ëeÕõëôuC¿rûnûæ:§ÕAjnýàý³ÌaÈ1x+; ·ðüëÃdùW®ÅÓâè¿2¥¤>ÔæèáÂÔV­ò¶ã:è*¼	Tk]!×uéZ¤ÑvUA@àg:V6Ã#2¥~B±= $Vykcj.öþ¼³Uo'tàuh@9ëT-bë÷,ú ;T[Qóþ_à/÷÷8Öé|!Ï=M´n\zlµé¦Ù<Ùýto ÿÓ°Ðî(M¿¶ð ¶¨Ð<öüíR»úïF-J°þtê± Ip÷¡·=}0«âæm¹þ­÷¼ØÏqÏSëg»ã5g½ìô2ý0¶¯¦_>±[]cz[ nÛ¤éÿ=Mw= ðe¤kq~©Ló3:NÚíÐ.µºÕµ¹q(áíàzh ëèëhÞ-Ô*ßëýç>Îb»¼®~R¡>ÄK,¦§Yñ4'AÙ¿*sx»aR!~ãlbÃÞ]= \º¬Y7¯¢Nïm4¦ÍeÑeÉåj* ¡À&¼³oÕìÒÝ¦Îû= VdhÌG"¹R,bäÄôZ Û´t¡6*/S)^roÍtËGÚØÚ-¹¿zÜ±CÌm2úz#"ÑÂÙ}xýqÆ#¦NLËî^ÞíQ= A¿J@h6jø.t=M^ãT§à5à%W	?ÄîðH7ÜG½¢W6fåú;ÝúsvÞp£^Ãï4§VÎ%k®JØÄ-±ar~Tm«PÁ96XV¢
ñ_+]I<àÜmiµ¤¨åå= !I¢+ÔLng=}!}cÄÏ0¤½Eñ ä½Ô}&éû¸:°(¤mÜÜ© Ó#¶>]ÓÝ\isÒ:ÊÝìêÏ= 3QKí - rÏ	ý·óSà
\5ó>VÎKcGÖXæVÝ£v@â¥þÖóT7öE½­å³v½3bð´Ù¥½½´42Åõ©&~^*ÍbS¦6Êw40æÁßNosÄÐ7÷ÔøS3!µ2f$3:HI>'Í§tÕX~÷}Ê·(~÷âÑÏ_<(­+= 7VLÁdh^òr|Ô¥#xaÎÒ|Ø¤v(ùlytVýSKÈf^_~2ÜñÀå«Çn­îp²­ULÇÕN{K*dPÇ¾«~ÝR&?¼màÙ¥yvÔ827ª0Ã ô3®rÜ	@îÙ,R%ó/l³egÉ$_A¢Ë#¿¨«²ÿ÷+Gøí4ÜY= õ</Î*¬¾ýù~ãö8ûÔ*øsðAÙÀ]0{ßémZÕ*Õ@= wÅD<8^ÕQ.<ýlpàR9Ë ÷Þ)ËkÎö1¤QÄ~
K· ¢/ðúý|&õ«>\o22¿fñ6ÿÃ&/ßW¥I"òRDðÂEI1í¨ÿj¡lÝþÓf.Ót¬Y*|&ß]ä¡Ý³ üelHå9>5òûÕÇ 6UÏøSPx0ªú>'0¾].oÏKs½bQ}¹ée_)]nÀ.¤jN6ÈÉ¯giHÌhÿ(ªò¤âmM{¬Þs¯_}IÙ'	XÔeÜ?POA³èü9ÖÉðîX!ì[tB¹qI$åÛÝÊC­t]äWãæ{Ù& µöàºû= 6ñ)£BT	0ÕÛ Å\Arò±
!y§¥ìáQ4ÿ­~+F¢\jæÜ'ùH0ækÏSNfJ|]7é²È å_Wx3= -5ô·´þA]Q:»t h=M^ý®ûÍp¬²¹¢²´¬óct ' ¦®¶7ÁYÙ¼\os\DÂé%ÛÓ ¼+ ×Ã×! jK5}6
!!xñâÜq³wö4æW<DNåðrüèòmÖWÊCëV4TV²^*3ÿ ²^+ç·Æ&d¶|'!$9sª¹ã¿ÜóBýÒk
ÕýêpÞgeûOÑ,¯Ë:,¯câ|Oì+ÖnVÇ Éå0TCk#(f<>:º#èÇ{ÏE,Z4}í¶¥º1Yâ]·= ½·= }ÓãéMqò:~äzQÖ!"ù¦~	¹Hû$ä-Z´ì¶%'Kí6Å	¯P~Q'ÑZ¨'\k	ZÄädÒ¹~qj%cÅ,6ãÄm/tí$YãeîSêW¬Á¨êôLW8ÕGô6t56 £ôtÞpáaÔ°äã
ÈÚ%¼Ø­ÖÏ¤ôJ">$tS*8W¢= æÃrÝ,
=Mº¯BÿÿzmnÏ¿º¬,	¸´íî"ö¨C½Õ­6µcCc3_V=}úvOrR¸ôøî¢qøýu¸!Ñì§|ÂW_0xð%@õaQÅEÕñÎØ!Nè$!i5¾^Ü-ßß?V¬¬¬äOy3{,Þ©§,\¬¬¬¬¬òðôEÚ|ÒÏ3%;ÃBÜx|h£·¯ò;¶ £ÅeZßÛ	m-Ð:¿ÝóÔ	]h×ÊTb(WA{¬
äïyØó¤®3ù²tú+|í¢n ËüÜÊ»®2Å»(tÜ
xi¡*kæÝ«Ä_d$ï¹Ã¿²5.>]0ésC#ñåìë7IdÄêæ7¼pfLq÷é+,Ù9,·4 ÈäV©Å¶ín°ª+Ôú*³Ým$¼KÈc¸ÈÍû£Ï6wx'Ê[-NñÊuWN¥iòYfÂÕö>W§e'­ÊCÊ¥WTVÄ~>Y'V'µÊ	ÊÅW ÿsú3bí¼)+õ*<ÅÄ¢ût[Q)8ÿ²~y¡Ï°±«?©ÍµøG½Í	GÃW.çÆU:¦½UJ:_æAI@ZÃGÃH.¬eI WÆôM:gæ±GÃF.°5I XÁÆtM:tæGI.¨uM£N.æ9Geº2¯ÀÛ8BüÄ|á©Ùa
:TÍWÜ¶x7XÔ®kúNMjbÚöÏöp§[§hâÊÊ÷Êwiç~ðÉÀBf_¤ðÓ²Â£QíAòT ©C'p1gý¼Ä¨éOxR+_¨Ö*¢×ç.Îq¿ôhpÉ»{W|Î¼Äü©!:1ò½î/«´·£p°Ó!ð®Û!p­Ë!ð«ß!pªÏ!ð¨×!p§Ç!ð¥ä ×jq dÚ.$v½ÖuåPH[î¡àú'j³§· ¿!/øW{*îÁ0pM0Q$ë(Jü·ýÉêÌuûçëè¶³µ{Òé	®Å¾Î}go0ô°îirµ1"éÙh°Îà\Ç	;ûo=}w1ÿ]lkÚÃO«sGkï´Ïmõ(ñ®Ào»i²3¾Ó±;2åÚçg¡­è©±ØÂb¶¬C*Jp¿ÇpVÀQ±g:=Mãñ¶2\ªXdY.ô"Û++.U'ô*÷ejø?Èúo®OVËjqé¨Ú0°:x¤õ èËªÑ²áØ²ÐpfruÂïGKºÍKæ¬Ùà-ðâ%Ä:qaµ\±:¡Ì&ü ó7´¾ý«!x0üÒ sé´î!x0üÒ sé´î!x0üÒ sé´î!x0üÒ sé´î!0ÿ	§íküÑ=Mà½è÷;»ö£ßZ!Ë±bü±Ä=}iÂ9äSþ.@R	GÃW.çÆU:¦½UJ:_æAI@ZÃGÃH.¬eI WÆôM:gæ±GÃF.°5I XÁÆtM:tæGI.¨uM£N.æ9Geú7ºql!ëå,®µäS¨@NÍWÜ¶x7XÔ®kúNMjbÚöÏöp§[§hâÊÊ÷Êwiç~°J;>½'ëËÂ4àá¾m7·â7£= ÞýÜT"bL),x
´äê.,yZ#Ho=MsÚh#ho#s¬ö´Ï*ÜÐ¾´_5ÀTz	Mn
tÛ»/N{&îtÛ½Oý!"§]·¡£³ÛºGý?"w-·¡Ûâx$´-Vlã 7_áZÌ/´¿ð|V^}Ý¹cÖ²Ñ1ZÓ³XÿÛïçHáï°â1|× {üÇsø$à[§ë¡;$å UÐN(ì#©=M²dá SQø$Á°ìuÀ)2_6¹1l¹¶mlíag£0HCY¯óÚP²#LNÞp_T« ]¯&5 «X5ÙÞ¸ØTë¿úÑA¹¸q»= >êd$Ìx¶¾\9ju	{+²Ö¹ØÜ|ÉB¸@ö\<ÂÿÇ+Q¬ ç-á¥\;£Ë¸	aÁ9*÷$7¬·=M¡ò­+¨W¡*\þ\ÏüÝçï¥ÝinÀ:ÜüX<Ô¶|a·Ó[µ]ñ°Y±°U1¨Q>_§å ÄûÃI°=}LOõkbhÔ¶Þ6À¾Içiß¶'#ÊYN5gâ¾e'j4å¶x=}~ËAmâCY)DOí¹EÊyþÅß"Å½!È#Úaõ#´ìz~%!²±ñúê|±Eé dØ^FèvNªã«²!¡²=}Ó-õ03½ÉÄîDt¼es=M	ÂáúH^¡«>¤Èµ*>¤Æ*¿>¸TòÈÛ_öXShí*~ÏbIq×é¦k¸JòTÉÛgöXNhMªeÏ2Kq×¦køa"òÉ¡Ð»¶÷Tto~ëM=MZ1&Ö«míÌE÷ã¯ûDAè2pürýçæëm´M^±ãy1¾,ª[¼ÍÂ:k'BÞ½'òùQ	ejðði!u	Ç_¾»s0ß¡NO£JWí¶ýoÈL'´§d4LPï)·g
´qÌ=  Óa¥m@mèQêu_êÚöHkÀ,ò·X¤¦²ðÑèáÀúvæÆ5v¼»Y¡.åÖ áùØYÞà6âsupû0>ÅÖÃÍÄê&Z³ÛwØ(7ÖÖénõÍ*;)IN®sêÑýÔX=MqðøX½ò)oö7nG¸®Ä®Üª9f>Hånbºl©fTy»_ÜÿR¤Wµlò¯5Ô[òkº}xr¿¸Üç_Q)å7äÎQ)'aÞVÖÀNë¤K»sR·7V+¶%ø1=}þZ¨» ôð;ôÂ%â)9«Íàò
-lDEBzÎ= }=}¯6(sÓ;yÐÃózvO¨·òV_¸ _ßª´ö8HýíÑ°¸ö ch÷ç­ã?¡ÛtlÖý0´áÂ,LÄÞßAÄÂÜ*Ø{×¬Ü,,LÔ_´=}ÙÏùs­Q	orò=MWT^,-tóà. MÊÓå7Íê´>­¢HÏQ!Ûühî®ÒXÅóPÂf6ý"üô4­QlçP¹wÇÓe;vªüRÃvè ÷æUlÈMÓrö6®ú)Æ³kéóáûÝ.= ÙÉ§á¶lÖB*RÿõëlàGÚDfËþp>æ?®Øv¨ý+ä]'sÝ<)Ê¾¨Þ;µÒtø~³}= L#_¾ad-3§øÔÙØDØ8Õe|áÜd§Ý^P_Øy@]§:Ì!m1U÷ÂnNíòÂöór=Mì²=}¶Al3Ý¬BSª<ñõ½ ôÛè.¯)T1ÁüÒD-P|üí4wÀ?¶ÈjX#
éýùíVP(U¼Ãsyìì1á1<û*aÛ³&ÄUØZÍUcÈSïÖh¦ðG$Ðï[n¼ßp(wâ±aÃ·÷ÁÃª³9H?8 :ÌCG÷=M¤1Õ#×å!Æ©õg!ÒJºB÷IÃ	ämvèý¶iï	ÊÕÚÇ.µ^= x>Þ;óÁH¸w&CgezÄ¯XÝîÖØGÉGð¿2Ò¥ujïßÚ= ¥Ä5cØv5Òyõ9I$ôO<"½!t.0Òô6ð­ßFÄå^Íf&¨(ØZj
ÎÎEV(7ö¾F76Á4×,.xs)G(×Ô]8e!f#«øøð.÷ª«ãJöª¢2#JH©G
c"AÙ( û¶ (ÝL ~vV ½7a*¡¸ïB?ÿD]ý·øp¡,mÝªàÏïÇ9¥ÕpUjB Õr¨@!¾ÊË©èþ(ØsÈ*Rffºû¹)'Ø¼gâG|m¹õëg2ÛÒôÚ³¬M*8íc "À= 4 ¥-£KçÀa(È3çJ°ÊLïcZîKEcÀÌ\¥æ³M{}!A¼J£1B¢ÇÌßyÚâù#>¬M=}ÄxP
¥"hüÖ\ÿÖýÈä	®\»¶2NÈ¦«­P£Îña)LGëVôÈ´~5ªI7Í Ãß)Wn´ö°]vjù¤06Ï kxjÿ*Ï¦uÏó%íóR»Q[¤E.¢¹åð8zÈÀvy@øÚu8+*m¾õ=}¸Û±¼ÊíÁq+ð]}â1À	Ë´Å#L'	Â8
ëÏUrÁ¬]Ü3ÊVº^Ææ{"XÐ½) k7¶s1õ«ø¬MîË*ß@XýFÀwðÉØ¥+A
¬Ûkùö3ÍKû¬E DÕ(|ðnÌßâ¡¬Æw:²åb~*æw®Hæë¬J(FR6òÊ5AÀ"¸¶û 7|%6hÛOg¥HØJ8/QÌFRzll¼òäfç)2aÒ²,fëE× l«vVjp:¥w~¯/çq
^²«.f(Çkýh3-d7N(.)ºÃ)¼Äÿ£CEëD±C½@¥;1%¤¸1ý(Ãíg6ÄÛpá¹z²Nx?R%a8*kÓ°H<	_â<9dÖôÿÑÓ%'Âa3C¤EEMFYG2DlLFF¡LFûSQûh¬§FFFFFFFFMTObaX[~|wjips¶½Ä¿²±¨« £&-4/BA8;%
	ÖÝäßÒÑÈËîõìçúù =M!"E>7<)*30ýöÿñòëèÕÎÇÌÙÚãàmfot{xe^W\IJSP¤µ®§¬¹ºÃÀÏÔÍÆÛØáâ÷üþóðéê?D=}6+(12# ¯´­¦»¸ÁÂ¥_d]VKHQRglunyz¢¡¼·¾Å°³ª©v}hkrqLGNU= cZYôïæíøûÜ×ÞåÐÓÊÉ$,'.RÉèQRFö(§ü³!ü³!üü³á½ü³!ü·8S¿9C=MUFEOI·kGÉØ¸sïfêÚj ®sæ:ÚtOðïI«ëHJS+ÆbÌÙ¶ôsÿh-'sÂØ8c¤±¾N=}ªdrÜûøH¼´J1«èÇv£Ì®_pLô¶ZT¯~¡í0J¢Íá»ÕÌ&£ÉÑ¶$@å)UCÓe7ã¤¾Yõ/ëº\( ¦£³Æöø¼dUÁ±q²õsûOlZÞT±tõ{Q.à)¦ÓÆEfpAÅbÔÁrÔ5wP­(2¤9¶ ~÷}(,$!¶¥e#þù;= ¢Õ±Áot5kN5+ÄÕ9S]?âÅ6BÙ?Ä+Bu:kÐÝA|$+¡ÃIÕ)­6e	É£®öÓûWz,j= µa³Q3ê3üÒ!¡U2wê­<ÛÄ]Á­/Ø#÷1º ­óJÛéÑ0¡ñãîSúy°²Ïnÿ«úzÚP|²sLé\Ð!EJ¾ZÊ'¯VJ&OTÈFbHï¾SuÈjÂ]ÈFBbÀ7µDNF}çTeËfF5-VJ&x¶Ûa¶{NH¶U4M%ÿ[JGþO)ZâT¶tNH¶\ÔJFDVbðGFFC<½í_xgJfÊÖVNOgJfjyNÊVXHggÊNÊVXHgg2%¥EÅÃEB@	dÎfAÎ¶W·SxâiÏ~íî7M= ÂéÑ|åèÒpn6c¸xh<ò&ÈY²'ËUþùôÒ§ÌKYyzÜ^xnR¦ÆBçä/æ@Ô®è×¯ëÓyà/þìô/ìÍaÀ1üä 2ðt.æã¹$põè=}ð>(Ù°?+Õñï õÐ¿,ËX¤qñúÝdpòî=MP¾&EJIFæNVFóÃ!|ü³!üßÓù³!ü³!ü{©ÏZX&ÊXR	µ6i^F9vQ,È[>aÇ>Iâ	lP´¦}¾IÕöIÜÉi¶P±|rÉË¦I*	sþQ&wîIÛ6F$ÉtQ¥yÉÝæGÔÉ¥&uâG¶StÈR6dT6KÀæHÉLÂðCï+hp°ËÎ´¡³èüÎ6Î÷ (ð¼!Zq×@Ájõ-Eh×;ã@o¸çÏbì ¯Rèì±ÓÃ)ë·Ñ@Ô°éWÓp±òéÕà}:èÝ¹Ì¬m ^£BÕDBJàü¨Å©9 +è¼[Ô£°Í<n<çÃÏ4û9wóÜu,Ñ§øwE ]ó|,ò{Õß°Óúh)Í y#B½YEÒ1D.¬(KD¡ýc%ó/Ü(}Íþ±"¡íe-qã¢ôñï«ºÄ()çÉÕê%êï®y®kÓÙÜL§vÀ^¢ØÔÁÉÂ¸ö«Dvª*²8'6×aÙíÌi	Êç$µÛ¶!jY4ÀÀßJ>±mz;°ÀëÊÓDg7à>5m DÅÜ20Ý:±Ï_Cå
:OBzCyË[S!ìY.':d¤ìö¦³ì<$?j­8ÝÀÃà2ïQÙ0v{¾Öxa5üu)¡½ÔÓÚ°¾cbÓ´õ¦¦ªxÞa{ÒwîaCM¥F5°úUÆêXLT&	øPû=MnoäèÌÏ£úoðéc3íAoúå¨Ao~ðíìîÔ£~4èÓ)t ZD$ý&3DýOE+jQg$KVGffÇFWFr'¾|O"PÙÊüXÜW´ç»Ê=M½§fdi´Ïè_WÿX[Î¤*ssÐjRÔ4jxØ6w¢ÎæÚVLX	WËÊãMÊùð¶bXÎ-=MãÑÝ=M£ÏQ
uÒ=M((7A(&>¾½"Üãäï§Ã§kray×/§[øªMrÎz÷èîFóâ¬çÐ¯t0VðÔ<ÈLaïL ráµ^óRµpL= YXi¨ww5¨âÒïw~É=M¦²
Rw-âä¹kmf¤n¸¸(Ãöþ2_ß¯= åëBØrú«k¬¿xQy«Uxçòðr¬ÚVÆgÑRÿÊÊ.KJPaËLn.É¬'óº±Ì}ÃLàdØtîë½¬=My¾_:sbÆ£ü¶
²]­N=MÄLÓbIÜ)©¬qý¾ØÊJuµHQ'ÏX0X½­dä¦8üjiÒjÄ8ÿj¿8Û*jrsßâúu_0¸mÕ*!K)K= D]GË¥ýOXKdÄg¥l¾ÍJHYåEqW¨FÐ
ÿ·×É~êWÀv¾·Q·\µNºÇ´Ë÷aÁ	jgkX­Î¿ãdp ôÑ<µ$4/ü½aÃáìá02\'\Z½ñøññ±3ÊBæ{Ö0Ó¶zB?/¬jd¿¹y\·ÅÙ¨YÈº]5Ñ%ÂÁ5@µÁ"CCø~4«òqü¼e99´3´¸ûÏßè¤¾õáÁvCÐÂ\£0u{YËÆ²zÎ|èRêwü^sºCUþ*R±Ý·Ý}ÁÍ»Íùÿ"ÖyJ+ê¹÷?â­$9:9à<âù]Ë]«"Qôû]Ö2­û­0yrz1?_ïj}³,CÐBþ0ý= ÊcSì0ÈLM´Éf®JTìïµïýê.aI¯¶ ªépã»¾át_ÞÃÀÂãgVâJ~qqCÛLÍ
ë¶]Þc[||
dGÈö\H0UK@ÃhUï¾òp©ÛÝm/áÃÀÂ
ãfVbgck?Ø|e;j4óé¯X3­ÕOÕØÿ=MÛI¢I°ÕiC®±CûGp¾¤qó\;	A#ò>=}sPQå>UÖ¦V,O«X{'ØNa§~ÿè?zÊðir×O}ì^P	¾Zw·ÜrTÒ½Y¬s²Êéiøl¸¯(X$HâuLÙ"lsÊÕFJQS/äRl§ÙkúW¼âÊy«ÔeÐRS7Sk-ð8¿Ú¢5®AnnÂúLÔ¶ÕÖrYÆÏÇÏ6JÉi­Ë¬ðªÌ³Lz_áêâ*àåQOÇ-= d{ÓðzjQ³Qçk¿Â+ÂÄgøýt+á8oK$<{è{>°- |iLãýßûúÓø¡²uX['øX¶ÉÁÉ
øaYI5|b:2©4U°Ï¬Ê-²Í¸Í±mLîT	{Ì·,·ú©Ü¦|RxU§ÍÛÍ£Í>|*ò4òæµÿ&óý}Î= 6Àoö#n«ÿK"T"Ìµ_´¾ôyõé}zk²æñM¬ £TDi*ç4ç5Wó µ ·Á5¡ó>cY2´Ü}¤hõºõÂu¤ÙÝ8"!¯ÅhÀÈ½ |½á#8c>X>HÅ}Â:Â¨Ä°$!$eâõ:Â
Dí]·ÑgØúb ûa:LzbÑö´üû²3,ÑlÛnf£l/ôn5ÈÁfÓl9¤Ý©q!ÅÆ'Èæö·£K=}@a±\å)Þ±ÆmÅZVaþ;VjkmTÃ CzQú 2s]A
êqÚeeËjÐ0öZ_¯BB'ºS9R=}%Jl¡ÿ½æÏlÿ¢ë|1eè÷_<s4ÔA¢@Y´mz tñ |CqºOü@+¿Í}Õ:U+]¶ï6ãñ¾ñÄI	 )}9ÂÛ)ù±Ë­ÿh|ÈáÊ×ØsÐô0´6¼JwLßÉ·i
ûù$%K­¸d¯âÂå0æ|¤®ë½úv¨ÂÇ=  ÆÍðë8)ð³ØäÉàwüe´.&?T×øo­×*è¨öÀVÂT÷= o~4^./'I´·ýëx?»S3NCV:p¼´µ39nU=M/ØPëÀPÂU?	~$BYDí©ò+¯7ÕisìL¥N]äo\î{6*µ),>¥ÔôTÕ=MY>¥	£SÃ×ôÚÅÃ0:UÁ±ç#%×59G^kPÒÆÞØ¾ÉgjI[©~%ä2(¿~Î= ãÍs! 8ÂYFK«X~I= k_gSËµiM¼[©µ¸#=}:ÃMB&Á.ÏêD¢;XôG0nÍR°Özuî²6dªe Y7¨ÁÏ±á=M&!¡úº¯D ì3³a%Lcëd§ê¹Ò~9ºDýæF;sA£%ÿä÷¬EÀÿ(CåÝ¢=} d_ezÔðª_ßÂòª,Õ?ùÑ¬Û°p\õ úèO´A+[;CtS®0ÃYZË Ûcßyý=}4y/?Ã w=Mâ¯[~ØÎc<Ùç:®´þÖkÓ
îï ÏjÃx½ð¶úìUñÒ9Qó±b¨I\@ÖÃ"U¯ñÄëë§úáõ¡ce?½1U= ½ÞÓh=MLH¬Å{/~CVròÝäâå ÈÕð~Ûï¾$·-¬ãov[enqõr±tõµ$/3µ}tD 6=M+Ü,3Õ%ÄSDÁ	?m;õÔ·­t>ÿ¾¬ÈS±uuµüuÃA6 Zúw¿	­CVbb1gí<Ñc©\ëfû~ó²¶ëîçE+
,3&!7ÜÆÑ¬t¤T¡RusJ­sã½Ç\fÄ%8Æµ%ÅjÌaúÒO
FÿG×'îfN>=}ubsÇhÉÇ¢YZQAE	Zè·ÏNÖÁKÐR?BÆ¢ÅLrm°ªfýtkø¡~wJ= XD}rqN³ÏRC=}nW
iÉSÅG`});

  var HEAPU8, HEAPU32, wasmMemory;

  function updateMemoryViews() {
   var b = wasmMemory.buffer;
   HEAPU8 = new Uint8Array(b);
   HEAPU32 = new Uint32Array(b);
  }

  var _emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);

  var abortOnCannotGrowMemory = requestedSize => {
   abort("OOM");
  };

  var _emscripten_resize_heap = requestedSize => {
   HEAPU8.length;
   abortOnCannotGrowMemory();
  };

  var UTF8Decoder = new TextDecoder("utf8");

  var _fd_close = fd => 52;

  var _fd_read = (fd, iov, iovcnt, pnum) => 52;

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
   return 70;
  }

  var printCharBuffers = [ null, [], [] ];

  /**
       * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
       * array that contains uint8 values, returns a copy of that string as a
       * Javascript String object.
       * heapOrArray is either a regular array, or a JavaScript typed array view.
       * @param {number} idx
       * @param {number=} maxBytesToRead
       * @return {string}
       */ var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
   var endIdx = idx + maxBytesToRead;
   var endPtr = idx;
   while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
   return UTF8Decoder.decode(heapOrArray.buffer ? heapOrArray.subarray(idx, endPtr) : new Uint8Array(heapOrArray.slice(idx, endPtr)));
  };

  var printChar = (stream, curr) => {
   var buffer = printCharBuffers[stream];
   if (curr === 0 || curr === 10) {
    (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
    buffer.length = 0;
   } else {
    buffer.push(curr);
   }
  };

  var _fd_write = (fd, iov, iovcnt, pnum) => {
   var num = 0;
   for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAPU32[((iov) >> 2)];
    var len = HEAPU32[(((iov) + (4)) >> 2)];
    iov += 8;
    for (var j = 0; j < len; j++) {
     printChar(fd, HEAPU8[ptr + j]);
    }
    num += len;
   }
   HEAPU32[((pnum) >> 2)] = num;
   return 0;
  };

  var wasmImports = {
   /** @export */ a: _emscripten_memcpy_js,
   /** @export */ e: _emscripten_resize_heap,
   /** @export */ d: _fd_close,
   /** @export */ b: _fd_read,
   /** @export */ f: _fd_seek,
   /** @export */ c: _fd_write
  };

  function initRuntime(wasmExports) {
   wasmExports["h"]();
  }

  var imports = {
   "a": wasmImports
  };

  var _free, _malloc, _create_decoder, _destroy_decoder, _decode_frame;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      const wasmExports = instance.exports;
   _free = wasmExports["i"];
   _malloc = wasmExports["j"];
   _create_decoder = wasmExports["k"];
   _destroy_decoder = wasmExports["l"];
   _decode_frame = wasmExports["m"];
   wasmMemory = wasmExports["g"];
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
            this._stateStringPtr.ptr,
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
          "Data to decode must be Uint8Array. Instead got " + typeof data,
        );

      const input = this._common.allocateTypedArray(
        data.length,
        Uint8Array,
        false,
      );
      input.buf.set(data);

      this._common.wasm.decode_frame(this._decoder, input.ptr, input.len);

      let errorMessage = [],
        error;
      if (this._errorStringPtr.buf[0])
        errorMessage.push(
          "Error: " + this._common.codeToString(this._errorStringPtr.buf[0]),
        );

      if (this._stateStringPtr.buf[0])
        errorMessage.push(
          "State: " + this._common.codeToString(this._stateStringPtr.buf[0]),
        );

      if (errorMessage.length) {
        error = errorMessage.join("; ");
        console.error(
          "@wasm-audio-decoders/flac: \n\t" + errorMessage.join("\n\t"),
        );
      }

      const output = new Float32Array(
        this._common.wasm.HEAP,
        this._outputBufferPtr.buf[0],
        this._outputBufferLen.buf[0],
      );

      const decoded = {
        error: error,
        outputBuffer: this._common.getOutputChannels(
          output,
          this._channels.buf[0],
          this._samplesDecoded.buf[0],
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
              this._outputSamples,
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
        this._bitsPerSample.buf[0],
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

  const determineDecodeMethod = Symbol();
  const decodeFlac = Symbol();
  const decodeOggFlac = Symbol();
  const placeholderDecodeMethod = Symbol();
  const decodeMethod = Symbol();
  const init = Symbol();

  class FLACDecoder {
    constructor() {
      this._onCodec = (codec) => {
        if (codec !== "flac")
          throw new Error(
            "@wasm-audio-decoders/flac does not support this codec " + codec,
          );
      };

      // instantiate to create static properties
      new WASMAudioDecoderCommon();

      this[init]();
      this[setDecoderClass](Decoder);
    }

    [init]() {
      this[decodeMethod] = placeholderDecodeMethod;
      this._codecParser = null;
      this._beginningSampleOffset = undefined;
    }

    [determineDecodeMethod](data) {
      if (!this._codecParser && data.length >= 4) {
        let codec = "audio/";

        if (
          data[0] !== 0x4f || // O
          data[1] !== 0x67 || // g
          data[2] !== 0x67 || // g
          data[3] !== 0x53 //    S
        ) {
          codec += "flac";
          this[decodeMethod] = decodeFlac;
        } else {
          codec += "ogg";
          this[decodeMethod] = decodeOggFlac;
        }

        this._codecParser = new CodecParser(codec, {
          onCodec: this._onCodec,
          enableFrameCRC32: false,
        });
      }
    }

    [setDecoderClass](decoderClass) {
      if (this._decoder) {
        const oldDecoder = this._decoder;
        oldDecoder.ready.then(() => oldDecoder.free());
      }

      this._decoder = new decoderClass();
      this._ready = this._decoder.ready;
    }

    [decodeFlac](flacFrames) {
      return this._decoder.decodeFrames(flacFrames.map((f) => f[data] || f));
    }

    [decodeOggFlac](oggPages) {
      const frames = oggPages
        .map((page) => page[codecFrames].map((f) => f[data]))
        .flat();

      const decoded = this._decoder.decodeFrames(frames);

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

    [placeholderDecodeMethod]() {
      return WASMAudioDecoderCommon.getDecodedAudio([], [], 0, 0, 0);
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this[init]();
      return this._decoder.reset();
    }

    free() {
      this._decoder.free();
    }

    async decode(flacData) {
      if (this[decodeMethod] === placeholderDecodeMethod)
        this[determineDecodeMethod](flacData);

      return this[this[decodeMethod]]([
        ...this._codecParser.parseChunk(flacData),
      ]);
    }

    async flush() {
      const decoded = this[this[decodeMethod]]([...this._codecParser.flush()]);

      await this.reset();
      return decoded;
    }

    async decodeFile(flacData) {
      this[determineDecodeMethod](flacData);

      const decoded = this[this[decodeMethod]]([
        ...this._codecParser.parseAll(flacData),
      ]);

      await this.reset();
      return decoded;
    }

    async decodeFrames(flacFrames) {
      return this[decodeFlac](flacFrames);
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
