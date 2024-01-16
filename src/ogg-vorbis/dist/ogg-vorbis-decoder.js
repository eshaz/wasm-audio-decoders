(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-vorbis-decoder"] = {}, global.Worker));
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01a33fc84f8dïoØå§ä³¨s¢þéõ?§æQ¬·ñì>_åè£Mí'ËÏÊí	çåzmòeúaÝ§¢é,î= 9zó¡= $.JõT¬K'¨®ç äÓ·ßéàäà(u¾Ã÷¯ÃìÍ H¶3KQtí;Çø=}ÉóX=}Çã»°£)½SÉVy{oEqûUHhéì8÷7ó[¼iÖ¨A2º»È(ä+Ú»Ðé*7ç}ìÏÖ@ü¿À¿B;?=}A?>ýÿûüÿ~{xÎ#ë5X.]J
=Mi=M°UH 
5âÂª±ÀéOmrn¿¯2Ljª{	ÝájÔÖ			±Û©bÕé)j{èüül8üàJr/¡¨²Ýþ^UÜàÈO6ÜjÙ5èâ×að1ºHH=M2Û6íÊóIÌ§[TÜïÚÉ) ÁW|âßHeF,l	Ì¥'0Äb8ÏKßè!eJ
vÑz& WrnV"5Ê ñ ýkwP4Ãp¨¸RAx[p¼Ïó;7>ÃÑþ¨VU?°Rq9~Ã²QÚwI=}­	fòÔ·rñ¾ª¸gðx7QE5-±®MßÂãl?£ÁãÃE	óØ{ËÒÂÌ@µz5fñ}.;¾ê%Mi_³ZU@å.Éñî¾ÞmÄt×¢.,ä²BB;æ¤äûûZ_¡V)ªAUµ¾BfÈé Ò&§¦$¢»ôåÀk£z(_zÜ^r>ï ¾b>Áð/ªÄDTçQlÄIÒ°Q}:8_þ!@ßvñ!Oö
\\ebVpÈ±Ö~\¥NÐ'eBb·#ÈN¥Y	ßà#W´0a]¼!þ½\n×ØT¿¿¶çÉS­îäx7óÎ6ñI-ììùpfåh¸Çú,cµÔeiÂeicÓÂç#ê²up¹aÛÝb0¼þ7Ü>F3ÞÔTþñfkï±bxööfÙ±6HÎÊß6 Ò°ÂyV¶Á?»@?{¨Q¥+=}¥±ÿÔÌá9%û!>Âì&¸Õ@ÓUùq÷?ñqt¿çIU+÷gy+5sä
¼¬åíGÖ®S1K;B\©fhXd)ºÐ¿²Uw ûûX15°Ò1LÁ-;j= piN:}îºB¯ÅÉwXtô§¶¸3y¶¯oJáàL¸jÎn®În -¸ýûÄàsT½ÎòÓÄes	´{OsèÚÎþ´Çå9SekFTV³úK-÷WE¾OÔ
µR½ø*ÙvVèJ°§¼Å¤ªàCsr²^Õvü3ããÔ¯/´ Poü|$RÞ§KuÉ#þ [ªß{¦ÑVú>ý>Ôws~~9=Mz¶-Úhiò>ñ²1düÿ!ü>ý>í¾¿ñèµÀ	/«~yæ¨Êwórb0©ì!	~°»Ïøj§Ý#ß88÷AlÛ¦3¹ÇS8oK:xÜ×'dAkÉÜ<É;)3ÀbÐ{í«Û5?þ
ÈNøRÙá¾¹/+ß>Û¾6åô}mzQ|p÷M¼ðjÑí©;2½&Ì#g×g|/[k*Zõ8ZvãXçàFª¯a*÷«ª+V,\¨rÏâ'É:G-àëW£óÿî8rpÿ ]k=Mîéû|]´$Î"îáVìD_d%~m¢>aj%U6¨^8"b ]¥®}lì­ïèÈfõlÔÖçÝÜIÃqÜ;ñ°[ÙåTàÆä>í÷õ{¯oí½3*iúD¿gÔæÁ@sÙ ÑèÚ=MÉkáÑüçuêÕÙðw¨	À³Fô~{ï_µ9Ñ¬5,}í5×0ÿ>_6l*{îò)¯GjE7(aôrÃbôÚjÇ½	T°ÜÃÄgk;ß_ßÂÖûÄRZðùÒ¸§=MX*gê[ÉXÚ©^uN~u~®
:Õ_NøWëP\^WpÀttØ÷2ÿ2wTØï2þ2v6y6;VÌÛI÷?ªêÌ¶^&>&í£F]VBf¨Tße|þîõ¹ù±úÁ$]ö	wáyÏV.îbÁÛÆ.Þð¡ØÛ ïtnZ$þ:KÌòñÓð?«» ±lâ¶
SÓÿZ·©'7
s%»4äcL+øÈ{
^ÑKCU¨n9ðÑ~g³/rÓV$
[cÉ6 &(¿ôqðx	úÆ6 ÞYSÇO×Èò{-L;áèÚÆUhk(öyÄè7´Þ1CY¤Dèé×40,ä$Em9¦S£"¨üÇkUô¹Ë UgÎ{>%[2\ösiUîçÓ.À¨ãôÂÏûÇ~që¤
$¼À&*ãhÃ¦M#Ïî8å#ûûU@·I§aÂú[Hc°c¥öém¶«èäªª#÷ñg;ß¾óº/9í?	g~ïB9¨'Süß.),gi±Æèzåëf¹,Èâ^k¿|Ð= ÿÉUvî©ñÚÍÖÙ"&|ª[Å¢lyD¸ÖÏñI´QCÑWõÈà°zÈ2_Ç¸ß(ËÒ¹pi}çkUÌ-PV$MÍ)}éD×q¹{¤aä.|í+/ýºIë¸××I¥^bü½ö?Ñ/Æ°uCH¥g±|¹MÞ#L²ææûºÿ'îA-÷B¿7<ÞÔ­9ì&Ô¢fÓ1EãÈ/ cE%5ÙO£.uK~¨¸;Ëíô°ÿu7uRö¦×³®= °~£30ÈöpIìxû)þÏXËyeyo	I%Ùý°ðà8­Kð!9¡C£'Ý	Y0¶±Ú}îùÛÆze"ß¦[ÌM÷qA?¬;QWetbW¬ýÛ)aWet+*¾­j¥h8Î
ÉëÎ
~øqù|ô*= DÑW©â
q'$iÇùçÆ®sç4|¶¢USæK|cÅÀ(46?µ#ËM0÷rYNAP÷r¦á«Ò×{²¶ÁØäpg´eÂÝ|¸ìH=MïmÿOn@óå+(÷ÐMI3ìñÈóåÓz*^,áÿJ²Úz* [Òíxê|fpûÂûûBf4þs*þs*ö [ñÂbG²ÐnjÄ%Àßñ«Zù\è¬è K-ÚÈ®Û×ÎVyT­´1bØüJÅZÕüJÅÚ=}<ó´nul/6|@{æÔî½àb|é ª³½wTAª³uêÀ.¸NvÎæSUL-÷hrH7ÙV
VÕ-pLÂ¿ã.PÒ¿êÃÿqÎÁE­kÜ¦ÙÇéÙ²l¥(t³pOYúHpcÖ¸óæÞy5½¶ÎÕ9È³³²ô³2§'6­´É»_9É^¿Ï«;ÙËa­&rbf±_ZØÀª%#Îh?Ã;zÀVj¿2lúêGÂ^hì
ÊÀþßðTGximü1Oå®&¥ïßµecË/9/ÍNÍê¤MÎü´M
<rÿB8Vªdí$8Å9¸okj)¹&>]Fökj®òJ¤C©K'îO§GiÆb6ô¡ØfÒéþh°¶À= µfaGHßµÑ¬ÃàÖO¥*Ýh·s-#ýtúø*³D¡S6(t,ÀF0(´¡¿n,ÙádýY@²íÛâÀnhé9ÿ{~@øJèT\VåÔOó¢üdrí¦ür
¨&
ÝJB¸V%tr­QóÓOVåâ SBi¾ÿÚçÜÄ6OLi.p·Å(ÕxD¨
D¨¼¬Øª¼L9¯¨ÌÓn¤°BªbêtÓ«óÚ;[K°èî¦AÀÎ0ý'ð§|ÌÒÌ÷´rq½óÄµazûû8m´Ê/V:È&®¬ØÌZ&Uk£r¿Ãî9>ÊRrÑ¤çÅz"ÈBw&!Aúÿüd&ù¤º¤ûë©ÿ?þlâSwÉ£kl¾2Â9²bÏáz«­®k(Èª-ÐgýuäÆªa­ß÷Ðî5A3*®ÖÖ»­·GV@øb1r#éof:&z:ryG~qbf ÜV\Q°%¿¦cåþ¤6á0n"ÕaÕ:Â¬®{	$îN³ºüÜ~=}Ä6¬ÁÛÏÓ¥Y¬ÆmÝÜÀ,ØAà64æ0kÐÇiL#=MMôk%9ÿ[þ|Ä[Á< 0¯ ý¥þÖváÐ\yí¬-zÌOï1ä@¤ÙÙ®»ÏÈ ïõ¯j¢×ì=}GþÈÌûû¢r5·5¥×ZíõÅäÖþ&ÂRX*ü°Q:ýBÖ.ùkô){©ÔB­>´MLZØîRf," Êâ¢¢p¦Ò"ìÖ!¡o4ºÕz0ÂÎÆm0'$¦g,òßökbßì°qºUL?R©@c4¯Öçîì U	úÛ(ZEOÂD XzÄC=}°×D$ãÞ)é]S²Äz¿¾ßÝEL·kÍMVañ%FJ
4ôñ=MÚfÒ¶AÉÂíÁ|Ô¤joÁÏ3ÜV5íÇ-:5rKÜ[uò¦\ÀÜ]3ÞµÂ«âQÙúÑåô=}*´TLß8Åî7>Â'±:LCdhúÕe÷ÍM73ëFrÔmÝÐ ÿÀÓM|"6d@O¹csZ¡g%nB³ý£UMKÅÖ0Ý8ÒõÏu·ø¶gÍ¡ñ¾ÚÓN0þR)h= þP{nøQI3Åß314ÐT= ÌyÅy¾lÜ= ÚÃiUCg´WQ(Á$^])Ùâ¥þ 2­Û·>åms&b¼úªèôQ'Yè¨FüyIr1ýÎmaî0'ÇÈýªÿ#}^W_W}2QjAÂ*ÏO¾rûÿ
Dñöëß_\Z= Â)¡#	úâ¡]ôö¯öx1ÓÈ6Î³5_x}']Ö+ü\c°O×ì9¯g_³dóai"©[9ûÐC¹^\:R¢ìÅµýrtq×ÇÜ¹'ÆY[7lÅ4ÓtÒ¡SÛà-W~üx¯dãG@fýÉOsóÍ@O¹g.æ,HåÑ?_wXÜi~ZS(E¶²ü×¹RJ=M¹Å_=MøÑL^ålZcþëÙõðÛà¸õ/ð±Üzé/whW:<OÑH _µày®}õ «¹ôÕõCÏKG]=MÉ|c¹ä6üÀóªk¾K§Oõ-Ø-£¥QøÍÉÁ¸éT6¦¹ù7ó6H	^ðÑ	¥Fc fCÕìÐdÊDvB&ÈÛÉ 8é£M¼Ä^å1·ª7)h9=MýESÞ»SùhçIÖÁ½ÆÍkø/û.ûXÅXûºØÜpÂçÂÕpÂoG_ÆªwOæ³+>ÍÐFÔ#ÉG´ÂÈW²ÿÌM+ínríî#ÌDoñL}ª.ñ¸çpÑ}Ê	YWõ]jãN¬k¸Áç÷FLãäªÇÔ)üõ¤ùæÈð}	+æ® õ9~%ñõª÷èþæutµØî «ïhw 3ZyVÖfÛÓÖ/fOP= =M»Ô4ßýa3ø¿$±äFY\ò[¬)¢Rø¼fÙOü71w¿æZlýÖ°
ÓÚ? .)fsnW®Æù«IòÍ?Uñ¥A1¢7+_ê¼ÃÝÙâÕÐ¦]s¿îs¿ðS9Óú ÞWLs_Iu=M¨6ÛèÝë§bCgÑ {FÂ¼©¦¶ÌKÇ±üMv)Fº»ý»è eIÏÚëÆ*$&Ùè½Öe´XSX×øØê½ñ4ÍàG+ôgÒ	ÈVæT[å^~×?|#K·ÇlLÎÃi;ùV'j÷0ðÀók=MîAxyvJbÞà0VHÈA¤M¸;O¸/(SÔ«¦üÆ3ØkU´Jf³)óg»1W¾lÄë§1TõùÝd%=MaPuí(pD\ 0Þ0;7àe(ÙÐ´¬µ o6Ëª@L$ë¸Ç×cLJß¼Òó,]þ&5µÒ&ñ´tÉvâPxXÔ Ô8çÖHëKÊ0]f ê8-rüºªå±­¼(ó åÐµÒ3Ã¤óOôIøÁþìj#	= bF%4»XîÛð«!@$¹@BlýU@OEDç/ }òªT3Á$È%nJµÆ[gÊóÀ;=M5»Ã:_ÿq¿BßÀ¥1æ-e ×D¦»6*Û¿×_
ÔQ¦sá0¸êw]ÂÕÌ6Y£>3CëxâF4!y'Èw±Y¾ñÕõ0ww*·ÕX3ógg5^/SZ.´ËÆK9éÓm"}b}âV|þPê¬t¤]pb=M»tJ= ^¼-ÄÞ=}WÈ¼"¾ix=}ØW.¢µ}d=}Üôw·}S!/þ·KÂãys}Ø±Wwþ¿0&)
±}Èóðí×=M©~ÜPA9Z*SÏØñÑMN·c¶HïëB¹]h_þq^&Z=}* ! ÓÿÉÊìív×®>B²Å2!´4 p_ÊÝÕ!©ditÓ7È²¶®â.;Ù1Ðëb¡º÷ñF"in/­­¯YNÓ(ÐÿÄ<(ÓC9~õ-­"§7LQ<1¢­AäHÕ«´DîùP= ñc{?ýW:Í;Ô]cán¿¼üÍJ£)Glú!¯dØ¦:PNÂg½Í^JÑjÅ^¿6f(ÄA?anD(°Hsn
$R§Ärkx÷ò­ÅáwÛÈo]<ipÚPÁ}r-op44PñV;?ç¸½ ®ë"ÅzäqûClrt3jSm3»-se
ïòÍë0!<ª= V¬µB´R¬ÊÙ÷Vý|poÙ+ªZ#r%µØ?#Ì±3È G=}x¥jIPNÁ¸î¢¼©£_Â0ºéý[íöèù ÝxRÛ×ENÛò-<²ø|ÁÚEØZ_³1h'8ÀU?µâq"þ!@/D)FÎî=MY±¬bdÈ(ç[º°5«£¤Að¸=}PLµìN9.Q»¨#èV¨¼Cpn@H:ÖyêÊGÿèëuIGÍlõølZ Àuò	©Ð¯f UÒr<<UZJ\ÐÖÖÖfn/ ¼õ^ÚWÞÖ8G/kkkkC×ìI»
Ñ'Ã¦&5ËNÃ=Mù:Î)Ðµ½á'Ge÷ÌIrë¹=}7Ô÷í¼(µz.ØäÂþo5Î	ëÒÜvÂ^Õ/êL¿xFÝÉMgOb&-&KÕpiàpiGüÅã$H'×cW¿r.ÊNõ«p¬tcÎæIOÖgná¨Prç£{[d	d|pþÛ[þ=}ÛðU	2liè2²ïk=}®­¬ëzDßñ%Å-Pk3Áv	{ãÑóZ«<¼¨Çásúïï@Õ¸²bW%jùÕ	+2 ªtÐH%QszÈGd¸
\m&í¢hKäó"I³½$¥ß-cªÊ0L¡MÉÈøMCØ{5Rf*áo}¨ð²êß$Ã¤øh´¥
MLH9V£}}®iH:£qò£«
¥Ëfã©V-!±q2$üÀ²¹Ðõ^lÙm=}ÎZÍkîÑ]ðÄ«j^=d{ùÛs±I°ðW³q&k3Ô</:gB]¡æíwÌ´ Äö¥(ªqÅ¦ªÉºd¾D¨üvÉºö(§Î^üËÜHÕ ')û«)MBD¯}a,%/e½«@âÛ©³ó¯÷Îs¾Ö7Õ¨R||ÉR= Á/¢ªvi°§ØÒÏ³ÙHÄ	ÇHjkAüwaÜ5°9×aª¢_7V®¡ÄÀÊ_^3Ò@×Áég©²?º#<:Õfáï|Áÿ¯jt&[[oÛ±¹ã°àèµ­\m¯R4¼9Lh;hýý*Y­7ª7óÓÊÌRPÓxG¦[RdPRJ<i|ÇPÕSÕÜ}Ö	È¯M1ñøå5õqFà_äþaìÐæ»¿ÿR­wåb2a)Z7áªº ÛF6JX¶{â>?!$"A""÷ð lÄä¾qLô;±óðýó;^ð=M,±ð(&²À MªªÍü"Kb(6tÒevö&hÌD}Ôe¼<}TÑØõnzÞª 7º}óì.$¦1Vå	Ç=}5Mþü²!ìm¹¼6j¦D©èÒÂ·e	§"G ÑÜ%É¶ÒÏYa[Jðe#¥ïÔ/;}¿:óöª
¨ÓGÄ< 3mN¢¥¶«°XÙKÞ°2ÞÅ¹ð¤d|9c¹õ.J3¼«+|°*Oô æï1²/½©°¬·³'´öÛ~ö|ïõJÛOi¹Ê·û Ø<¦í>;°HÜVßÒ= &XÀî15¦ðöÊ0ÊÀùl=}¯~ñkÄÁ41qø?ùÕºÏO,K,N¥EPÕ§v4Íøþú³¥Êk+*5­çr#1DÛ<çª£´¯|{Ù1¬ÇÆIje¥YàkaÇ°ÓÊ	3$ Aß<y¨¸µ¢{rÇüÞTë®))U¶"NõìÕá_l @;´PÕÖ®ínSpâÐJSqç<¯^ËIäÝ9$Úç)k°+ÿæEÚçÑ!æEÚçÑæ'³º= ÆtÞÅµÿÉ	IôóæÉÒwÕüCá&"éñ(* 1àv¦b´¶ÝUIªÕV·¼Æ½ÒÒÀ×Ö¸fÏÐc¨UvzçÍ]è%ñÕÅ,ËmÖâ}= ðYBâq]ÂåÊßH²hirç)yää×nC¡R2×
Óè 2I#Õ»¤Å÷4öf¸¢N>zHÇ·Åö­Ë6·Ul	þq5!¢×EGm*°¥þ6¶ÔùWøJéWÅN$p	Ãµ}ÙÕ/}°,+:Ù
µ'ãã²_6UÁ|á÷*c»\ÆU,g*ðÜÆl1ud	8¯à-y÷I ÌxÉü.ùe=MÉ=Mk«?<çNd2o:Sò°ÑXtÅÝjVZTÃïÎòê;èXúQÉ6ØØ91Ï=M1èpî®Å(è(PI³p¾[y)$ì$ö®K÷¥{®!n PÚvä6ÐÈVþCr¶>èqvÉ2ÇtDd@«=M¤c¶ç¨·íi«5A,¸Ôfª/ÙX¬×ò*2®å¸oô
{ë.»Üy½Ct EâaúÅç¶GtdnòÔQº5Ñ66/Ë1=}wk*l$¡J_!JÄ©m,vÀp£re /7P$Ç.6TAE%8Å7RÓ]Vú¨µpPßGOëüâëüÂGO2GO2HO2GO2=MëeHI@Kgg,p^OSü5ÏÆyË¤&.+&Adëg=MÿO[¦çÀmØa%É­V­8=MûPNfýú0uÝ'|!·ÉñjÖañ÷eWÂÏÍø4M;È0 À'ú4¨àÂª¦~F>Dïo6¼.r]gO:¦]§½Xhgõ(ÝÛ@´¨¯ß£éDüÄF§Ã»y©õ@= ´LMô¯[yB3ìÿºwK)¢w¹ÆFY=MäÕñsÏGBG'÷@Ki=Md¥Ck¤­3v»Õ=M÷N®fºÍ;Çà³8MG>(pÅ	²fÌ	Ç$î2Ô.ÿ8doÿ£©æ.oÏóSÛpX¡ÛzÉw%Uµ¹ÍîÔ­ÛMÁ5fg
ûîBÚþdâõ´ñB­,×²cÒPþq×wÀ²©Ã= BOµ%DÙÏªðõüQqÀ5
ÀRÃgèËøÅ7IÑÜ" eø;âqæÞ±g&:ã'sÆk®¨ÏíLàôoªH'÷:'E÷df5*îx= £ñlí®F$«wmÙõîUT¬»åÕHFÔ]ò&÷*$Þ)Ê<{\ÎÍ?ÇâV¹"pAn·{²Îbu¾âaÍ«ªáéÄ9z_<AÆ¡4.´¥ë	_6¼+­<e^°Ô.¸gG=}°ÞÂTé©±/öbG*m-BrÌ¢tÈ¢¢%êàrâB¬4¹ôß:_râÏFê#2]QRHê7rKµ9ãìÕå¬?Q¿á+VJ½t]¤Ú*æ®Ýl+8~RZÁ-Íª×¼Ôu5§GDSà÷"íYÎCÔº«~5Ú:= )âÖÛñÃ$¼XbX¹Ý¹ë¨ï&ÁC.@"ÐÂ¶èqó¢í
~K{Y³øc­hßm¥Ô²8;*Ñ7vYGi= &vµ6V=M¿z¨U×áüÖä íûÕBÊû}YÂëvÉNckÐ¼}K[ò¥©ËÙ¹Ü¬kû¥¤³¹bmA3E.âû¯9ÕÔußÚÖcHZ¯Ôªîeä/z1½,z«ctð2XÚîB*ç	Äa÷ò¨96ôÓµIÎAdï2*aH|#ì²µRÕÀ»à^= M÷å¤n¸kñÅÐ°=MDyå0åQ(¿¨»-qo»­¢åQÖ/ïû ä±	­Å°-Ô¿G9FfA:²9ß«jï	äÕ%v¤=MùëÅ!à)?6êÐ;HèÞGx»ydVbtí$-\@ÌØüKFÙDÅS>KW´ûS§%í	©BÆÝ®¿µt&dùë³ïú7ô£NÎ'ð µÅ©ïz0´î¦êUtâKÎ£¤=MdTrzU8vM[§óÑ³±I[ý¢wIÃÑyn·QÔÝUæµöÛðÀ¶{}IC°¶"ë®ó ß^vèZ\y}×³BE6°ÈÊÐ²JQ$-9Çê~>tmw¿²¦¨®®(|nÈÛp».ÛTÀ^æ©É6:Ý<JÚØX~³ÃÛ»Ó	·	¹Î·®ÆÉrL= å¶V²kÝªÁ>½ç²=}÷	ÕjÛ¼!ÙñI¯.y_üØ5kuá"P/qÕ¡>FÕëfâ=Mg4_q|= lröRCDözê]ÚæKN4_©vÚè}òÍp[üÊãá®ÓÊ.ÆiñCÿêÀ}2&[»ïmá­rÍ=}Äº2x>ÄÂéèÖ{ÝÎæíÇ¶áN!|ÄÏd[?9èH^ù®µ;Z\º¬yIì²p>Ú¾PO?@ºý\zþ}53)¡ÐÁÍç6 O#¤ áÊcËc£ûÀ¨Û¥Û2¤y£ûVBØ±«£_ÅcpF£¤Ëc=M¬¢g£(þf!yÛÃ£Oí#·m£ºÞñ#Ñ£ï:£áÛ©¢næâ¿ã#/àÁyÏW²C	'ÕXØ%¦)Ü	p¹üCQõãÓÛ}~¯$OîLàHJ¸cø:«7í­döº¥ºXJæ9Ô÷ÜÀëé0þõÕÒÈkîÑÈºõK,þHí3:?77nóKÔæÈÊÖ÷*¯Õw¼=Moøllÿ8#N5£ØÔQ]Vóú1(=}®ëdÉü×üNihó.F¹Uøbg³n	ûæyª(âïþ¨5ê¯¯;Þ_ï				«Ö­&tÊB¨Å|ø ö×P= 4oQ&@²ªÞ= Ê;·iª*[/³<{O
Ó(Ó&;Õ88üÂÓoCý¢¸ëÓQ;ÖËÖÒßØÄ)¯Ï«fqF¹ÀÆ1È>'ô&9(Tj²õÚÙ¡%¸&ù(F" 0cÿ2S	s
 {¦O¦>©Y'®ë=McsÔØÞ©ú;ò}°1¯û{VH!t;¬OÃ?½Ü¶q £Î eÃpHXzÿÞ¿ýxÓê¬ P\M'È¿ë9þÿ}#Î'Í}÷»é¥¾åztåµ´ÈAú.C\}!iÔjÛAÚ¶¾;ðO ÞÉ(àpø;åòXCy¹JùÛ51J.Nòvô.=M@og1fë+³­1
kÃ;´«ô7À®E»¹éôäxT/½1¸xâ{Û¹ûÝysäzü°>;{e«j'SßMqÊØ>ÔÏzöpýP³5=MX= :¸[ð1·u1ºkÄÌï¬v+FÎoÍ0Ûçs2Eî§tävòÐÒ×8Õ/3ù»¤.\i8{Ô#¤)eÎç³^Hòtéæ»e½¶gá»¶^À¤g4x³©3èô;¸¹-KsÁ%ÌÂ>Ð= /³Åas8,}F9ÔRrsh¿Ø³ú1jé ]O+E¶ÛM94%kH4v|ßÍ±ÎØÑLN ¤0ãÀØjj®0 i[s+òwÝeDç¼¸¶ëûº?k1Zp½r¡¢ÍV=}OHV+?®r7âÔúTÃ\´æ~ÓY^É\9<¹	a§ñ$î;òîâ3öuJ?­"ã¡Ão3ÿeKJ}T^f[ÞÖQõø|R÷©ìÈÄë°Y8¦}òþr5IPò8/0x¼vSP|IëÞ(æ.ÉÕéH#2å»[_¯ÈHÇ·y-1c©ÈQËàH(DÛËvìR £Ú"/u¡D$uDTÂ%Þûµ«HÝ>f·!Ô0L3¼m!_À÷4{Çýàrá©-¯úÊðÿ(jè²ÅÎÃÌÄUÒ±T§#i(9í97­öºÛïH¥v%!ßOWª·Ä~ãÀ½<A i¶/%ÝØ²1PÂé	Ú/¨Ueiñ$ÛÚOw±·Ü9C±0o»>ôí±ã¥PuÔµ·Ü=}C±0o» ãÐ£¶åËgíéð£"}3£Éx{F"S^¼±b^Ù vwsõ×ý½cë=}P£i,Ðx'S¶¿£aDçHOó>.ü,LDºLý.6Ðm¹ÿS~©'È3>§,à:FAú4{vìÆùHèâ~ëAú$çpq¬%=}AúÐûV©¼rf9ØyÑ0\î«ï= ©HÜ±(äâ°6^ÏO Ð½Ú/}KZXÊ]wÒbþ/U}Ôn$q2èÚ3¡düzbP®µPÔ0ÕËí6¡LK¢oÐE¬= Îèt¬ZóÉk+= ¬ýÀ²­qAå¬'þä²'þì[¶'2ã[6'ã¯'Óv{Uj²^¸¹î,¹<ªJm=MÖ¸Ê5,ró±Â.Ó=}txHë2ÿë'±: ò>A6Ü3ÚÈùaÈÐ=M%mÙ$UÀ°²å4äÝÞÇ8èðSæ\ö>qâ¯}ÑxOüxÍ¼É¦;çÒgÿ;»D.úâoÆì:Ñq|¨m}'¤@nÍ
Ác[)Ôph¦ýIÁ­×Åà+(w9¥¨ìGkÁ,Íò×©%t°gXC°C	©}½g3¿´Û±F£îÔòêÖú¼ ÔlÝÂÃª±FOkéûTblSOÀ"4²äqÇ½bê¥,ß*i\ô;SFÀÿ$ªAÉÞF¸lUKÑIè$u¾Oå]É×Ê´Ì´Tö>[çû ³Ü¦dÍ O=}¿fW,u&Gâþø¦ì>N=}ù»F½.Ö]MÌÔ¡c·»vTø02ÆM1«Mø°=MöÙr	/*R
ÙÔ ä	
\.ô¦Î0Æ¾¸êÅé#îmQk;ÞbUäJrr ý¬È <y[µµVÅ¹²/¯2Ó3³É_6Ü!+zçXÐ÷àKö}ÁeÆáÆ?Wò=}í¾Ny¤TöÊ	bçÏA±=}J£í¿üSL©(^ÁÚ¾_ÉªOEYÍÈÐlT(¯æeõ\+^û	h¤á06L;óûp¬QÒÁ %]¤a]Òð2ÒA¼?p£ÿ!QòzázÒ§ù©µB9a¯u=}![r= µ	UÂ~>¯Mo,Ü²ìºBÃ«®N­äè$*{$ô²ùn]/!§¶­!ª¢OÖ³©oIz¤4Áeîô[&ãvÃÉÎ{HÍë©Ò\Îú4¥¥ß£»±WðNÕÔs{BµN +Z,ôToI5yhÐ}naO,dèDqU È0q¶ÍRÝÒ4LÜ2¾á{å¬Ï]<º
}QÅÿ«^pY½.ÓÖvUÓ\)³		I®Ö¹	qÌ¬vÔ­ "8w¾ñ
I°ÅîHõøìúÝwÜ¤ßi%a0B*;Ó´±ï5Û|K´ú¥²IéëÕ!¾úÆURDÕJ7FEz\û.*zlîAÔ¼£·Vä)«zp!V[á»DBÿx³ÃÂ%:WÄËÙ¦6ó{³Ûyµ2ã~Ó= !°'c¥þóí1ÀëÚ2ÓG«¦[ÖÞm3Má0j»)ÃæÃæMª¼Û]Â	+1½W¬µAEçRèÌµ·×GÃ;ÆK£øàÇê=}pöÄá²kéâ@§oÎDEÂÈ«F¡Uv¨bò^ÄÏ×í*Y¿KÝÛÞã=}ÆÊ<MâH¡·ÇØßÃ. JpÀ)ñ*,Ë)Ð¨ÏÝk0-<Òqÿd¤7¸¥ù¥W'B.2WKà§Ìëz_Ù
äñ!J^ÇÀfÕ£ìµÜ¡ÓÅë ÄîöÉò¥Òimu³Ô(ÌBé",ßà"]!í»1§=MèCf/WrëF,O(ÄCC1Å*U$J\ìV]AÁò¬ÑÜ'Héô2Z>,©ïï·¶ Hö¥VÚCJAuÄÿÔKG;Ë5Þ¿*ðÚûB{½ rèJK+ÿzþâÏÔx½ãõ'»ÞL+0¶Á¯²¸cG:ù= 

´æVüK¾ C0ÎSý4Å0= íâ -~¥mÒRUì8c¹s\E²¼ïûn¦¸]Í60ÐÃù/Æìâ$Å}}#üÄ°^;¥øKBÍùeæ!Ö lB9Zþ O>£ñop!= Ö)T]Ò">(¡üâ>?¾ !zöÂùÂþáTa\8 LI¾ºMÄ¼ÈÍ%IãùëÂz^Úb{½æ@å@j¯®[ÖrÅñú%®dmFvãüÓÇ},/3ÓÎr¾k:>Dx²tÁ7_Ôf²ÖJ¿=}òÞÕ|AõEÒ*ù"O&}¥H0çôWùØ!
Çs®zã4ær PÅgûlâÉøÑ@ þ~Ê°¶¨úí¾Y YÓ·¿~a²ÆÛÑS,|6ól\ÌPË_VyÎù ±J¥½ræÎùìT®G[ùBnWôËieºNúûi¨°×@S¤aýP?ÒdçùN:"°þÅÿ[òp dÄPÞ02Ùâ¾Þ×w
ðA, (<´£é8oå¥
+»«4D¬Ø¥C¹À»ÍÒ°9KÓp*ÖB´¦£¶ÑDfEt8ÔÎÍY0<nØö¶_o+6æÅûIO4z·/3Ë8m
ß~Q¡üõï$o¢mñ·î½Ë	Óÿ Î|qnºã~ïÆ©ÔBL×¥{ËNaÅÃ©
èQ¹¹&¥G JnwìÔæ]oJ´ÊÍªè
ût:ÌL¥H©92¡X.J%<M=}'Súµ,Mã¨Ï¼Âz
ÑÏ³Èb D;÷ò$ÊMdêËwÅ¦K)J×ÑÛðþÎYÌÕþÏðCDO3K¢Tÿ£8úiàÂä¨i¤ÌÖo¦ÔÙH§Rôs£K2wÕÇNüDßDm½³ùÕQ5ÊËûødÙ5|üé/Î(ûèQüîÿ|ï4I³««05¼ðòyò¶nDÉøÎ¿ìSíÂ±F=}§MS6Ë;0
a_HV/@
YÙ\úd²f>ÍEW¢?>ø¸ãè#Ûº?bÒ®íq¯~Èëî·õ;î¼P£x~v/Ç!eÌ·5î4_7ÕÊòÄÕËuPÔmN{ô~Ò:!%ªõ±Fc3ÑHüµç°ÅF)wf8('¬Dc=}ÆH'"må/Á­£7p|©Ò	=}TÍ}¨6jÐáèÔÝyh¸È¬Ôz®1ô2âô«+ùÏ$Ý 0±Á
­jP¶ \GB¬Ö¾OÂÖù¨½¨¸$%EX,=}ÉÓ(GAÓ=}8%ÅÓmÎ= Û@2=MÖõÉzr¹ý»Z+ïuûGï;ï&#ÇüüH]Xååd¨r¯*ÉÕñéx&*î¢¶¯ÕX¸ç7NO kCaàOBzrSEs®8·þ{:4G= æô«Òéå©#EÜu]õßºSÑÍ£ðÙs¨G 6ú!óñgÔ"ÎLiý¦ Qð
¤º,DÃ'óö¼Gâ{ü>Á¬¹(¯â2©ë£ÐèïDI+Àgïk7iï8¥Øí3ÿð(èsnÄ¨ÀÏêª¦ßHAu-/ë¦ÜX'mÞ=MÎçnKkfõMÓ<ù
ÍÆEÒÃ®fÌóV\È!ÓñQq¹^4SyáèÏ-=}<¹×3ýyÀ ·ðmå6·¡­MI¾<Vrº2F}Õ²jA¿«Êðåw°F+i×?_}AÒð(ûï~wÖìzW|Ô]ÇA¥³ l<@gúæ©GNà­ß·v´Ósx)<ýÞóAÐ|d4hÐ\k
'Î6­óbö¶Eaó-dcóöçë)<7*ãkcëÌ·ãkÎÛ¤	£Îq¬²þ?Á2ÿ²m	>L ú=MxoèÌìÎº?L=M¬V·Â÷¢ñ÷¢0<èäÇåÁüðxîG5,ñi¤Á××¿±\rx\.)¿À¾c{ùÀYK$öGÍmÓa°ÿ)sJÒCÓØwøè²1yÞ±µü·æ«wê /¤"+ÅLýÓª*¤.ÄxÈkâw%¦6eºå¿æÃ.|s!-07ê¿#ð¸s*IY±'UZ¬@®óõ¦L·Î¢S&k@>øþ8g{O qèª ³ÄE&õ#«CIþóöHL)Cd±äbãûÁ úb¾àÇóQòOõ	»¿Ç|c>/ãHû7».\ZiéÊÌÔÐ1syìæjÓ¼Ô¤dA·Ä;ïpÜÀã×ìW7·[~ yäÔ=}é3Õ0¡ÀX¾Óqä@>Ä{°÷¯ÕøÃ=}Cã×ÿH»B»ÕB=MåÛ¬o=}ó'Cä®ö
'=}=}¦MÞÖ0Ts*heóÁÃtÛVXÑÔSB+¹f}=}9íÍþgÒ&ucõm6 ~
	ÀH÷ý:Q¼BÍ)³#Ì'DDI,¨pDIºU=MÑ¯±w'A¾ì¤ì4K+÷ò¤¤Û·&æ{«§ô:|U®õ"ûÿ~S+YÉ¶±Z|á,NÐoGIöçJ-°º úIÉ8·Ù­®¡¹'_,È
Z±LORüVpêh«RÜIÀÑ¥oé¨yãµ¤æº±dÒ@T¨àNÛ¶fòn×ÕçYÓ} Ö¶Ûø°	]_¤¶n ¥*	°Þú¦=M/^N©òßE®ÝZÕs´
1WÞ.«:àÛ¶UMÖ'ø*TMÌ±öë¤Ïv]zt'I5=}¶þ^cì^QÔÃÏöv;ïÂ-r¯" ;»º»1è«[&@»R=M]-*àç½µ×µä7×@¼=}'ÀáæÄÃú\Näe-^öìý¨8§pöèHð£º&ËÆdt#ÀÈñ²²w5kÊ_^RÓþ%c}ç:D6N¹ø-+Nuº·cºY\kÔp]´"É»K[¬=M0ÕÿÖÖ×½¦)DÎ´{Ôºõ´Ím7º©l¸<ÞÎdú*Y@	+ÔG;Aº5*L?¬/Ðý3UïUÇkh¬è£Q1Ó~§Ïçç,i¹Åõxs£îþÀPû÷ÀoÊD6¬Ý= È¼DýMË34²C^¸¾£±¹hÁéKñóz¤/StÓ¹wePÍ±ÆBÅ¯0²Í7ñ1ôfãËßúp[^pôÜ8Ì2÷It0²>Â.Ì46bà­/YÀ=}áånÓÜûôQÉ¹c$dJ´d*+©ytç¾ìVY1´©eo?s;þÓ|iîº}kÀëöH§ZõFÜN(µâ¾Ì/C B,\¡g®E= z¦GÊ\ÙZN¡ñ{:wWQ½%zÎôÆý:XNü®l2¾þï-	¼âë*6_E.²Ö>¯§Ñ²«lÕ boÿT¼=Mô¡¥5»Dðsìz7÷,Ç?]¸vÿ±v[Òð­Òù)h?/Xði³Ù¦î7Á%Ë&ü\×/Ò6@³xÈ7=}<ÂOR'rJ!3ueh¼#H+[¶Ð!ã¢Ö¼È³¶»½±_Þ½÷ywñ&C§&Aþ¦bÞe?Ä´jãÍÿµÁÇfø¶«ÜèEÀöñ(ÀâèèéÝw¼ ¦%(Ó?{ò¥kÄ/©yxÓÂ;·æ74Ö5Ù®jëËÊÒ>#g¬ûkMJOËHIÉuTä(tZr»_§U¥_wßÚGNEm e(|¨,=MYz»¿ÙI*èf/k]ijÿ&rpP;~ß]û4Èv¹HCa,Jy1Y+LÙT((CÀVÙSý1Ð8ÞnÊÉÆ<ÌòÎ'¹&ìTÌ¸BÖarÄÿîÝÇ°¼9°¨2¬øîÛ½³q;Ô5rë\ù?ÆÍâ²x©çèv÷BA©GE)ãà×AõüPÌÂe÷jIÔé4pèUv=}þ¾¬;/ùç4ìôdzóÃÐ&³urÐÙòònUmh+ÍlÝEí¶m¥åó!ë¹gKáQ¹t­jRª÷ÃÊ2íd¿bmËrÝÎíY­_»o-o½;úÞÔ
DSfí,Lú«&ÂûöW'K¨Òâ­IÌ_BzQh^9FËµéW:=}ïì×-²ÏðÑærcüù¬Ñ/ÔÃDEù´i¼QP4%Úíöð]¡åaE×òg$ éÇbÇìUbÔ¯Â×£¦Ã£clê¥õ3)yÉØïnÿÙïnÿÙïnÿÙïnB°M]ù£)DÀñc±[^ÍÜ2ÃÌ8
v±l822)vß îóÝÏ?xÎÄwêÚËéÂx÷ù"¨xÆÑëÞ-Ï-ü^Çgæ,rx"Õ2ípÔ±­Y}QË&¶g
oñÛ²[K( ýâ8¬Z¢Ò¸Î&\ @¿®ÅúÊÜª9Æ÷.8VâöémÏ8pO{ÜT1Oâp¬Ïj=M9Â= 	*7É²ÐÖñíý}<?Ê+Bª¹wA]1.Í.¢©á©°ÙY%Ô¹¯!O¨¸þóõ¿	1P.ÐôY«»ÃÚ= ËÐB¢!ß²ým U.µî <oð]Q9wëñìyì}ìÈ)5ù515¡µ¾<OVïH?Ç¡_è/³{?ìÞû(~ºùCª@á0ÏÒE5ÌÚ µ0 1u=}ËnJØ=MàtF«®»U"ÅYXê¢yÓPÒeÚ*Ã ·5:jÿ	¥Q ÷fqò."÷_Ï{kô*K$m]?4SQÓÜ%,>	µº-VSlTüu";M·y
jÆ¹ÿn±1=Mê&OÛ½íf· âT09*ÂD9qôq¾ /at6x¥u»=M²$r&áÛß¿f¸{¤[Q ¾ß|±*q'¢<ÜÝ¥ |{06ô¡ëM±e0Á«Ì,£éj}û*KsåÊ¤  ¶T Hiý°}xã-¹Ê]ï±;+là1gR¿ÎÜg²*ïY£ÝiÍh+hém{OÿJ^ï¢:SUú4óÉe~ìoÎèDö]ûÁ÷xÇ±¼}4è9±ÞÇ= ²î\+ÈzR
Y²V¡¯îv= l}aû iÍ>t(= iWæÊÝJØFfM· úCát¶;¦¨u<éQHów]=}¯uÚôõZ  £(2òD[]öØ.ti¸Ë9âDÀ®t=}"átnPèw{òý<øòb= >dÎóª&°·%Y;Úf·P]^²Ë®,a+±½«ß»	)deë'ýe+µ¯ 0ä~I«	.Ø	6ô	Ý¸P"ñj5Vó#¹0Tó¯.Îïêpêö3ªMúDxÉÂÑæZ£Ï Î«¨Z%½-@Òfï§õÚçfË÷wçHÏmð3~³*w:ÍÀ-jñ§WÙñ'Å±ûM0ä¹½;w\©j=M7Gh ~ý94ï[Bk¾j4¶¿FR7[KÍ»üddNÜ'1î°¿ð¿¡ìmÇð¢x¡j/øù9n/OkXA,Ì.íÌÀ-7-	efzñeTòÎ¨ö%,î$ÂdHîÊT!Kÿo¾ÊÒ±0ûÏ!_Vô_s3{o¡_ûX1Æ@[Ö:ÖbÈÎSf*
ªÕÂtiÛYÍ©nØ2Ðè«¾R	°ÈîüzÂN<ìZÐÏÁW¢´GÌ&ø¼Z	TjZU°¨HvÙÕO3Ørh¥éÙTc9= ¤HXII×ú-v.qéJo+dw
«}?QCöHçI¡Éz·ÞsÏ8ëºÝ¡È;9èt'ö¬¥]\']ùÑJ#xÎìØÐáãnYsÑY&ðÒÆ"±4PvÔM¾=}éÝ)ÊLt¼Õ;ìÔ<Üw¸}a½ ý.éÐ= ê¼®Átêöuº×=Mt¾mÿ$ÑOå(¾"óqµ}-ìNG=MwH©U5^o­¬Ôëº ©¾CÔý=}ú¾¯*±À=Mz´KÖm^eX
×®ÔøàÔð»Ôf,=  OÀ#I\&âw¥¦=}°ä2êæTö14AÆsLËÁ09OYØÝ«ëÞÌ$¶äx£/([?£ÜÙ+.ÇRìS×¼¡Ñös÷;Tû"©Ir%@rÏmTj6Ü+=}.Ql1q¬L@ 3×h¸´¬~â²vQpj²óùcõz®-Ù»dªQTws²Ú½sRsÂêÂ©cçÃiO¯%RÓ¯®ä «¯(*Ý¯TFftLÓ¿ÖZé;ëß ¿¬YË­.^èÆÖÆ½·¦h»Gï.(æ, ¿Qh¢¸ï²MÃ¸² ?Î+j4¬Ë8# BµS÷ÅÑÒí'f çófcô°j=M§¹ëzy½Ë×»7C¤HSH©9Ýý{°x.= ¹Xs~LhHÏÐ¿ôî.É¿Ñ Û_§1?¿½ò1®ô¿nºwP>otØ(FÏjn¿¬ZÛ¿Á{âû9æ<1Ð¿Ê"íNÛyx'w÷zûÙûØ×{È*fòãòøõÌ3RTÒ$OUÿ	G"Þúô@üM}À¸þ 9I/Kõ= õ¡Å |
ö$UèÊ<ùÊOéÑ;T¶®(Z¹®À7>'ú±¬<e­^å>åíÄÒìêÿsNPõæïpÁÇaaÌ1ÂÖäoVAÈ1íºF',1p[Ñ\;XPQZð5Yú¯ï7!íOyr´"ÈºNÅÂ-Âºa·Ï½qÑ¶þ<y,Ù©p|læÏa¬>xA±eaôòØWÂÎoYY êSÞ­Ô®OI= °.¢Ü(àÌ@p¡x|íòyø£vR²
î÷,¥ùú= ;ÐY?X¢U5È:R °ÙTÛÙo
ºÞÒOÞkUÁüúv{·-pb1 o	2ÒVjRTaZ<&¤öÖÙp¾yxêù¾~zóo/úÓVüx}oÇçé¤@þópÀíKòîç´Ðý4¢ Ùa^àð2ëv^s²õìsB}a_£Ü¢ñ=}mÄ×Uìñ4ÉFëÂÎ·8f(tF¨Kèm- æ þòIR¶JupÖ|WbfÿAq'V÷äÆ¥_uÀâÕ9ªô1óØ+G^»íN÷ôè[=}5ÍÛ0më:TüíÐþÒJ¶Òú3vÇM-è}bzóôJ×Eàðn~ë9ÞÙv*KPÖ Þ\°ìà0vEàgÈF6L9&õ ;U_2uSjlcÝ8KÝ%Y×ÞèêÍñö|JV A=} CvºVÌè=}Õ|BîÿHØ>QöBXÚðu]^ÑBùÐë0Ôçþã= =MÒl½UÐ(Ò ò@ùGÑÎâö=}RGVÞ= ÿëYº6Aõñ²ú33.uÕMkï°¨ytd?íÆ\*¡ÅffRp= Üq $ò(Ð_ëª¾-ÿE*È»õ#Þh)'9èi{f§ZaXeÒPô¡T°_®zÓßu¤>%+á@³6¼Æq$æ=Múßâs°êl]Á+üºIÉçûÒß°PæÂ~=}4EÒA±*\@æê£ú±ãdj$Ëbâ« Ò;Æ#¨ÁR½/ÔÔæ3Ý·»â¯ÚªmÔpÛ¢À1¼Æoë¯{ß­¬tF4Ünµ)üN4¥²aÌS-ØÏZÎ4ÁÑCqé')â¯J«ðã'»ç2¿®N	¡Û7¾2²A¶So_Úa}:i¹0ÉåRhÇ@'ù.ÊæOÀ5¾ß­õÆJE^h×¢×°ÚZñêF¯=}$¤Ê	EFÏØ¾ªV
¦!#Qü±;ÔªÅÃÑ=}ÆY8ÞåXy¬*ÛiÀ
/ä<ÎÙhU p°âÀÄCÁßx}kÀ¨~ÔFbªI?cHÊe	5ºÂqïßm)F= ²_ óÜfº© cy²úRÄë2À¡;¹#0þ¥QÂ+ïøÃ"²ç¾*ÃWr°e.·/È°d¼%ÖÚæÃZ«h'xDKÏ°h;LÓò¬fü= ¯jl?Ú0c«»èÃTÇ©çÅÓÞµèéôµ¨&ôëP5QFYÕ½°t{}Ð©øÁÔÇ©hÔkÀµ.,Tëq+h@UûÁ¿* ¤Sâ·*Òsè(FÖøWåÝÖÿùDðH­é¦ô¿2N4ÔÁ=}uïA#±6¶ÌÙ¤
Ê §gyÇÃKúÅeÊÉÅÌÏ´ü>¶D6@+3,K=MQi!=Mç{M´Rii¸=M·ÁôÆ)½Ò=MI$ö²°Î×óryÃÍç&ön×³6Ø"]ásÃ.©ÎHÐixSå®8@¹¹WS¬zåÐÙÔ#¹ÐòÔÊò®VjýÌ ÐOíXûÿR(&Áêé1ðàÜÏÛ¯ÐÜ1[â<&àjòÚ11x¿²Ûq1nÜwÛßÚwÜ·êÜ­vÛ	BóÛk;"&|À1ª¿&A¿ÐKdé­1êÌaÒu¿"ë-ÛíîÛmÛ¥¡KQha5FO-fK)FðÐê6üÀjq1ÌbÜíÇ©Ì_ÇW4ÆÕ[,ÆôõÆÔ¢fÒôìYëÕÇúÈ5²5Åì(GýõÒ7× ¢¢ëP½\4xj~\ùä(ïTC	:ÅÞDëtU<$o|ýt8z2y1®OhÕ
2ñm/R¯Þvî¡m.8ÀÙÌz±ÌoÖ8qÎÍ=  R_HêóÞW¸}'³ÉX×º=}ý¬ìÉ«®2pµ½©«¸¹%ÑW"SÿÛI^ñË÷¶l¬v¿º¥
A¹]m´³]qÇo2Èè;PÍºÍÀ¨	GZa[!{¢Æ«Á£f£#Ã#pY~>¾X~Y~Y~Y8C^ZtVf.æÇJ%·ªrt4NÀ½Îãú%BvS¢Þ]5 8]: Hà"üËM;>uÛ'qáýÌQë*ø,ðï6í,Ök3±Z>u¼Î½9XF¸°ñFÞ¬ºöÝæ£@@²ÄÎBë}m¼êéz5~i¯Õ@kDP&(GÜôéF¾=MXéF½>ÀCl"÷6Úð\.l^·ú#=M«Pèðt©[jéÙ|,Ê!C½aÂªÕ± fô_>â$i
3ß)ØÑ$ÚÍÑQa,>ãl°{[ÄM»ACÌÜ1°¾b¶ñ¨!hð'dÂ÷Ô# À®*UF2(¾pÔõÌ'¦9å{àÜRögnüÈ°M J½oý×Rü®PÝy&¢+¤º¾fVÌáÂÚ*§ü¿³X(X<à×EÀtw¯r0K]¤´äÒ+[CMd²ñ¦4Ú»ÀæRÆ¿íúEëÄ©Þ­cß´î6ÔýA-~ÚÕ3A¨r<¿·VìäÄ	8ÕC¯Zñ÷ÅeQ½Ec|£= p{{­¢vÀó¬%y6g:Ór³90%|¿ò¤0ÖNÙ2¨%¤Cu§£cYzY""yY~Y	~Y~YÚVMBÛ ÊÇ;ÂÇ,S×ÒnÓÈô9Zv\ý$=}ýè-yÍVnü(P¦xë\Fñå<©Îzér^²¶\âmU¦L]ß«P-dË½mugÏÀd#4ûÒ½08n»r½ê@	ñBë9Ç=M	ñCn÷×ºð9¢¯)Ñ@h3'|ÿÔ:\û¤A5.[¢!Ô¢éæú$?ýW=MV5Ñ&ø¼=McèPHÒF­éhêzxÏ~U¹1ÿ \$ÝPð»9NPoqc_À{â~h0\[ù[ºZ4xÝkæÏÚßeðj;N%æaÊ_=}üöqµø1ªbÒS~È9= eigNÿÀ^ØÚù^pwFÛ[ÑFÊKm 	zu¦Ù[àgjÆ ïDÊûQ-Öªß
[®mnÓØ¡ÈøR»=}[º]9úh)o¢#2ÿõg-ò_L/ñ}º*Hy¾È)Ô¢¦âtÜ¢.o bl{*h"4?¢2ì¶°ÁgÂømÈï~ej­ö=}oSî×ÊÛo%<á9WÛýDpâÙ YÎÞ%Á}I¦²ÒÝ5u,Þ*?ÜV~¨nÐQïþézwàÛD,ÅÒ=Mv)²ZÉÕ_ÂmF <Øß#ò&¦<àÃ«Had¯¸e´Xóm8fP»qÖ«oÆ:1]÷×6Èó7+Hb¿h¹hFÐíCPÊ4AÇu5´GSÿ7->Ë°¦T¯=}hÕ¬·reýÅ¾Êl¿õGô:lCá¨OøËG÷T+ÚmhOóÐ#Ìp½ÑÊ= ¨| ÎL½û(3=Mi°N+ý1MfïàÈ½»ÙT4Ð6>ÞX<SÐrm?ÙYoi%±aÑg=MìºqåÚ1ýà»+«¿ÌÉû¾-¬Ré.®*/h(ÜÈ'±¶¬d?GSïõ3AÃÈÚ:µéò7¹!þë®í6'F9Õ%ÇüDlõù»áüñûÈÊñ9º¹ýl®&ÊÎ«89¢Ö¯±££££Ù
~:~QZ	~Y~Y~Ù²üw$8À[{4W¸Àüs,BnÝ<H@,U%fÑWm%¨ Tsxÿðý<=M´áî.õæíI¶EJfR,ÝowwèÓùºèêàù²z Y¯w
S)£z¥Ù!ºCHÕÃ&¤(ÅæE»u]i+\0ÿïyØg<É7AÔdÝ7 ªðT²ØF	>¼=Mò­ù<v|y%¬ÐÅSG §î!ZZrãÎ5"üTÿphúy¿NUgÐ¾U´@W'ÀàY~rMÈ_Úr§ªÑWGL2ÆJâÝTq,^Z@»>ï.Fq§¨\^y(ò9QËI[UH@¾~\tP¾pÍ,añÿ/ªZÓud6¶ÖßÜud.a= _m®ñVÚ{ªøáç»×e:ØjBî!/j@â(É¤ÓÅ#¥K¯g ÃR¥&Ëµg£p-¨ìÓqÄû¯[Ëùå¢½m>õËÜ© fë>¹ibWK°t7´A´då0ëe=MÅ¼Õ5$ôÛï1EzË¹êZâ=}ayÔ¯½½&z.»iÇhÕðÏô ;Î0t(ÛÕ= üØÔAØÂlrï)§9É5Ïìi<çiÝÊ×Å¬tvÇF5ÔÒ¼nlJÓö­]GuRÄ8Ò*õtÕîåZ×ÒG´7q*$çíÊgÞ&ÆÖ³ßoúãÉ¦jUìÉà&VØá®0Jü°mI[Ýám	(±Òê±<\Â3îgHÿù|Tð8êtßÙVKÙÂBPwXÑÃË^#X®®Ûa#A·÷ÄjRºõþg¯ü´àè_úï>±oÐièÔ¥µÙÑ4µñÌÈÑR7MHûßÎH2þ¼àø«:4E¿Ry2Ìhé®Íø÷dn¸/÷d¬^íù×÷[]5gZ8KåÏNåYT­òø·ú&E=}f¾ND=}ðÁØ;ë=MSþöfh:Ø;ÞwuHI9\®=MÜ"J9è)»wÔa1:Ê+ òûàò]z[TAQR<cE©Éð=MCpL©ïý×ÈC´ìÆáî½\V´pÉW=}ûwF,þ=}{C,£àÄå?¬<= ékåýÅQç-[R³ÔT+:èßÈ	/2;>øqò·ÆÝÃ	ÞÔïÈÉìó:ó_çe~®µ¿¡íÇù17n HþÈÈM7ap÷Ýl;ÈfX2¯HÕ9B8N/Î	GTY,OAÏÊ:?¨²oNÃpød=}ï¨Þ^Ìórùb%	ò·?JÇlèìr×ÈèÈÉÎ}Ig)5.â8[>K«®øtE÷è2aÍ9oøÔR­F^ÍM¢ç0ôS=}D¨=M9öÖ-½ð=M­r¢¢0½@±»2¤#X¦­¥Ë;ºwYÎMñ~YN}YPCY~Y¢É^üf79)ámÖ°ÖÙ»ý@Ùß=Mk¼Tî\úgõb)ê.¼lÝjÕ&j¬n5ª9íâÏ¶ÛÑ
ËøWN³jü1¿Â±ÝÕÇÛ¼7î¼=}nÖEGJÀr0AÙjÕÐ¿Ì{vMJòBApT¦Ôv©®ÇÇ[	CNc;$&¦Ãce$*¦Br§Ñ±¯!¸Æóá)sÅ<óÔ.RCÓ½äØÄ¶ÄêDlÄz¿Do­Ä©xÈÄàDgîÄ~ºâÄgõÉôJúM÷í¸ù9óÙúó­zõiÚùXôqøYö/ËlêÍöÊÍÒ	Í¹ÌùÌLyÌòYÍ¶Íl1Í/U9D¡(Õ= õ>BÐ#¼Õ¯FÓ?~i7U~YqY~Y~Y 
M¡zAKö»×Òµýº¦Ð+*]Êä¼öDV= ±p-%é<Fèó45ËðÜQ5MFs9©Ëôöw]Èý{¹À+ñèEÜ ó6¤Ë³WÛmØ½PÁ*ÅïåøJEôÖs]|ßWÄýY§1-Påbyj'ÙäLYFÄÞt8Ëqá÷#Áå 2CäjóR¶KtÌ7/BæÊqFºô-nz¸zæjRÞ"¶Ð= (åäxjàá-³'MàéPACòô2
Kfw¨Í¡µH(¥béJe¾÷Ð­±Z)ôk²Q+±ýLò/8/þÒqþRK(ÀTÇóÊÞôaFMÙfû?ÂK_°YwçOT°V¸AýË$Uùn}û¾Ö,PZ {ñ~È^TàZúqá! ha|"a" ¢= ÂCD]©ý£H¢×N)®ÙòmdÙaàÚ?ÚcÚÎcÆÛD¥ýÛ= ¥/ÛïQÛHxÛjÆ£ÜKºÜ)8ÓÜYîÜãjÜª&Üÿ7ÜboHÜ©Ø[Üä8nÜÜàÜ[§d¦#»ë·¨S}Y¾|OP~Y~Y~Y8GO	ÁBZÖ°(ftA® (^oÒúÊ Ô¢¶>ÃgQ¹ÍU¶=}o;´þWY²ÂÜÖ û#Ë.,ay¼ïüF+T½ùYb@àë½AÖ/b¨,>QÆrþR*^^¦7L/a9ADÑÿIÊÚl02ôp0BB×¤ ¢?7t<R42Iºç?ÏÀqöÉµQsI[´ µáåiRÏ#>°ýÃ±ñúÝzì²\KÔ+-àe^»=MÞ4ëÎIõìXÑ.a¸6ú¬ ôì¢QNÊbÐgÐvìMÜ × !'OÉrß¿þ(W,ØsÑþ2ð{\¸øYÞ>x_X~*¦ªD¿§)¸j~ÌÛ@ßª:
º:¸;º *¡~Ûc²2õ«:ñ£ÒB4Ü¾×§¢åê¢b· «0ò4¥ÑÚóxõ/Q^¿[Úm06´ôµéqK5éh	7ø%VK­¥§xCÄK$EýÓ:täa]Á­o¯'î¬ÉsMÕ&¢'¨ü¢4f2p1{>/q¼úkãXCºI¦ sÛª­gGéÓqø'«7Îéð¯hæjÉ´"Òîä±½Ùù	vB|k2nh"Z®Cºÿ§HÐ_¿Ke	°ÝAzf_^´n7ýãÞyèeø²	¹S³ÈòêÛFÊDÃß&V:DtZ+È%¤S­££CY~nY|±Â|YÔ~Y~Y^kàüy®P¼ _ÒòNu£Ý%©u¯*ÓÓIaÀñÆ´/ÿ ¥÷iÕK¿¸ÊÓLÅÍ6õâ(Ùd×A$~<ÿBÛ>Hé+ÿÚ2 dÄ	x.¬z
ÏF|ÜµùES­NRS!À^uy¶Æö¹	êo¹Ù+Yu\Þ5sºnÚjuäi/àoÆÿ/8*ò³â·^FñüAÛrh<ºÑ= g°jÎ02Ê!Y§h°5«8éõþ9Fõ´õªLµóEi:ó°¹ý¯pØÄ²+ÔÿB-²²33cª2ÎoÿpÊoúmã(
'nßêø¨µÒÜÒ-bµR4&bþ/ÄRAdÂ ÆHòÏ< bcZR/t¡é+ÑÞ¡ÃoÊ¶E"TÖÚÎ¡SKÒÈæ¢]ÙPÎÛ_êºd¨àÁÌÆg#|b°ZØ;ÔE¶Þðt>1P¨nòýIhyÿYSäÐe9N8oÁ#Íêy?ac¼¢Ñ¯èY0DßTh6·ÌÒ]væDÒÍF Ì|Ác8ãÑ®Ó^åSþ´i,GaèÚ×5 ôïÿ¾&aåÏàû=}¹r5Ô,WÀìz.©JSê½ºë
&Ó&å:ïÇýUS;æSÃºßG^Ì|ükIè?²Ò	Kõýq:ÄuÑÊO[%e8ø'®N´ªysÕU1úÜ	ycE9éÅØV®èPK
vN±åvÞ¼ÜD>£¯¥¤£?~_Ä~ûQÐ~V~qØ~Yþ¢*¤o­½#$@Ó«Cä[â;@6*»Ù'ªò)Û»)ÄÛúº2«¹Í1gfËA82ep×^/äM¯q¥?ÞÒkîäÄ}¥'ë Å/{¥´_Uçóºè^»ô7^1èÛ;ÛA:´9>cP¶Üß´:ìo5</y7Ìÿï<%5}÷çòFcÙ¡AñV¼ÇR?l5=}<·ÛoEô	Ùº	q!¿¼rÈßipÊÞáXºåÏ'ºÄ4S+Ð=}.tßU§4Hìý-VqÕQBÿq¬ÎKkÿ$*íÑP?x/ÎpÙ:Ø S¹X«ÿj¢o:~c\ ¾Ì¶|çiÉÐÙF®2ùhH Îþ¥YÔæ¬G2,öÔè%;õ¬)íE ý-ÊÞZË_&øÜÞ³¬ò´ÇT¾æ$à§	>ißjuÀT³à#¤ÁGfÄ/²Âii´2¿·P× à1}}¶_½µ/6+^?uvëÁàfr=u_3éÊÏP9SÁ> ºK>´(y..a'(xIb_åDN¯?Ò&R¯LU«] 'íÒÃ ðm(I¹dZ<*¾Òu"Á¨îÖg¦ºâV¢æÓ'm.joÛ'8ò<Ä¯
,qý*ºß4ì*oÎåG6Ý°îªaÈEÐq¤ëSr9òÂ 4ªùÂ¼Ð,krB¡'6
õâÆW®r!DtúOðaêã1¶Â[sË*E/ßìL~FãgÒ¨AÑöçõ4híO8úJµ18´Ìói[­µÍ¯~EíX^ÍVx³Ôó{_áKV_è@k>½qxã;É*eØ\_ø®°ÒÐVn÷>û´ÀÁÌS]úªÊ]/OwÈà1HXBÔä×@*¤p¯,ÔØÇóo+çÆ©½Æm»>©	×dÒ'Jðü¼m[	/Ú|©Ñ;]c¥ôî®WÉýUën5O4ù{ YåT~-RòPÔOXÉ]°F­[Äîñ5ÐZ±{Ä»	ê7[àâôý#->¦Y®¿ìXm÷ÊÞôÎo®¸
É±ÄF®ÉÑ_mVéúáfQ0NÏqêø}&äLÁKÂ/Êè^= ±åä>ºb= ^dª ÂÂúun4(!|TyÚ!; ¯Øñ[{²ïØ"üÊ7"ÅÚºù"´ÚÚ¥Â!DÚ¢ Â_B¡úvÍÂfOÂúVauBlÚ¥³Ï°ãçÉ3\($]·g.Ã!?®	ùÓU
åëï®¢lóõ5æ\Ï¯gÓ%²*ØÑ?ªÆû¹¶d[ 4/1-ç·vÅE{[Þ=}Ît/ÄÐÇ)|Þ¶¿îa÷¿*&+5/ßèµ¬«ëaçÅ¼¡,-Êqâ,Hl¯òI=}·U¡H3çÍl¢õlÆ0I"«,JVqâÀ¼¯/ Ök·r	ãÉ²ÈU«²kaÙM$|ìÓË*½LÿÁ©uXà²83ß	oÊÃ×Â| ¨«)ºÄòÅ­üaZ+kÅ¸Ä];fªí;¾þådõUí[¯~'Õw29ÑL?ªjÎ3ðLelíGv¡¢¸ÕM[Ï ppO=MÁBN ñ°=Mº=MÔrNhõÀÄ¨ LJTKAôU°oÌ#0ë:Ú	¶ý8ð[ÉM]<U^Ð¯Qi&ùY×Wô¾²>}óu1øîÞâA³zyät.ñýÝÝ¼]®tÑIb	ÚÎSYb*ÂüÞS28BûÛ[Bô2D£+&¤cnYz]:Ö!oY8Ô~Y>pYþÂvtú)¹ Wë®,AÙêUW,=Ms	y´°3FæF±djÕwQÑ,f¼ÿ:þé'Ô'ÁñDEòù$áXÆ|OrÞ¶¦®°³1ÕCõcµöæ1¸½7Ä}½æ¿o/«ÍÕÅ!W´/k×ÖÉVk»dØi<< ezôÉÿú>Sw7(IWÁí'}7òÉ	ÒÓFëÖå=}p[ñaÜÄÆoáñF¹oäðö®¯2XClc¥P¿®ÚûS¨<9ÏkWPÈªÐ<Ghh×ÎOMPk
èùïîX	nów^O\p=}^ìÙÀf8Ù¿¢fÛþiXHfÉþ|Öu1à= y±r:¿¬TJ
áÐZJTà]¡±¯cn(±+ÝStf´f"À´qmØêñÜÝö'r·ÊÛç(8Ö-õ
?ÌôÞ6%öQ® { s(íÐú¨QÂí±úâ^UÝy0+Ïþ)îÚª^M&Þqîô
%*ª^øÁÿBdîÁYæ<Ê2iE,Dº U_+NÁÒI!ÅÙd>F _Ìÿp4ºçªÓT@²2¹³!n*ñqaï6UEÒÊòtg2ÖÜ!Pâ"ÆÔBZ= <ViB7J¡¦Ë â#ÆV¥«^¿ã6Ã.¦TÁ´ëiã} ±ó³x %»[á+yr&³ª}Í;üd¯a·/Nø«­æ+¯¡³Ïb*sÌÑ70àåTÅ·*ªDg[*4É®Æ»Ä=}Óï¯e\éÛÖª(öSÌ?Òe¼ÂdR¢ÅÜÆ%ÅØ.G ÇvÎÆ|\Ðµp>ëñ©èTR·
ètå·ôtp1I]Õ½.t/Àp#»G¢jS¯Zqg¿.Ïd&}³.vûQiÔò¹êÛÀ.F¿b}àAFîT_¼òQ¥­¶KLðCê¥ Çó´3+b,ÿ@?ë0Ý´ª@Ç	ÈÉÆ,Qî5{à,²ùl[È¶ <ïBÈF<e­ðFõ«Þ3e¡òÌG(YðN9»ñì,IÈX}LÏ-òæ:÷ùpòh÷}>««ãc(á¥]Òº)#±ù×¾O©æ¡ý²Ív»ÿ3é>m×µÚI½î?u´·JKÝ@{p/"?q¸¯oîÕ«PlÃ©´2ÖSqñôÉÖNÕì~;l<ª<·ÞTÜâ®fDüRpEj@ÏOVLnmI¢U9
F"Ð>°IÜHsà*'Ü/Þ>fÜ@ÿ!jsÑºL\»Ànqÿ¹¨ôÑr+ß]omVßÅ  ;rÄüzüýã¢7¥^·
	¤ >®X£èóÄ(ßÍgþÄA2­YÎú	´=}èwÒËe¢ï´¾! ûÔ°mñ0ËéÔQ2-YÐdÍF'
àíûàJ§<]'úímèÌ¡ØHWýþíõÉ¼8ÔÕQ/ÑPn+Àúi wàÌfkQ?¤?ù1ho519öQ?ÿ­å®ÍyR%°®ÍËâüdXÒ¸·­üýÍ|Äî('A¸µæ+ø#+ÞÅ	¯¸4_ïgVÅ"+;Òõ<»@Ä¿:+TâÐjºÔ½¬èµîûàò%¬¬¦ì{Å97ÒG;ÍmáÌîAëôûl5ÇFUX/ºÆ5ô i­ ÜÞå³m<Óç14¿öX?hÜÎ»:Qê¨Ñ¸«YÌk^HÃè, K5N¸í½©Ì?RôÈËlUôÔÓìh7¢÷oót[í(O­jrÍ[¡;?¥­#»ý~Y^àXP pP~Y~Y~ì¾ª0Þ{º3/¦éªQÜû~deñ)zu5_6¸>@7_qÂÊB^Ë èêdèO.Q¾ ÷= ÅòºU^Lnpb>Efÿ	 üÚá[\=}qf4-Á	s\2*{à/âÄt¶²D'y¹J,:ÒU:r_xÈÒaÒ	ÔM52@WuÂ^Û zj4"á9Fw6n
jãâø¹ükr:ê!íi®sÝ#Q¦×ªËßÛcè¤IÀ­óô#%Çp¶GæPÃFä9®U3ü%Z&7¸=M³$íÄZ²ôx±Ôõ+p¾å?Üº>³~6)¼üÛï= ©fû¦_;"ò;ôÚf¹ÿ]«íê{}ßeÓÔåp´ÁÏ1ÃÀ+ñ'MâÆnÃS]/cD¥ª§$¸æ¨Ï·Ë^úm°¤º$nLçí¸¶,Ù³ü¸|êr4>ç?¸Ì¢å	ÿ,±,8ÇÆÔÿ9{Øï¥,þ^Çñÿ4ûñe6ûÉ<xUY:¼Cmÿ»Ñ6DïT Õ8Ñn·"Æ6Ï$e¿­æÎÍLS×O3!#%Õæ ©(~Ê·áß+Â­ÚöNOÌOÅwõìxì$I5[í¢ÍYMÇßNõ,½Ê8Øõ·t[ôöª0µ-id½è
/C;é^½â·ìE6à:q2Ýª=}»Á@7I1yì[ójZð
@~²×ÈÖ;nÿ&0°½\¯A<©}&êV°=MÓ» gc°&ª¯jÙ7ë6,xð½ZÕÚvË¶ß6¾ðÂÔì"fG;¡ºJT@r è®
. ÐL¹Â©ûW?ÔLh¹ÂòýgaPhfûÙþu{ûùS|ycI=MÊ>ø%ðEÙPi{¯>V@p Ù>Ñ{oF UÌ¶Òm ô2µZå7FÂHóË-bþ7tfEÏ?B#%¦.¤|YL~Ùâ6}Y~Y~YXÔBjÓ7DjÏæø)7^¯Úñ½×?^92aX×jUÃ@ýnÐâwT{Ênh¤9<Ðxüû¼]~xÌî¾9òÞ¡"nô®êr¿öÛÉ	¯Í÷t4FaHI1¼@¿\©Û0?;aeeÙêf1)º¿¦É¡Aïjvî2 p6Ñ\ÉrAWßÇ¬¹ßò¿4AÄVßÖ9íÜÌ"pfÆra:¥°®_øC~R$5©MG²or¸÷×hãdÝ$MµKxÍóQÃ#c
F¦jJ)§$WN¦ZÉª¥ªñ¨Õ °¯= Â[ÿÚÆèá1[Æ!2Wð½44uÜÅ¢¹-ÒÀ<ùØõ_!9é=}X-ß|Èõ^nSkÚ¶Å8
é©Ñ-OÿÀÜ_È!Tk4ÚÅ@Âé­áÒ_)Ó¦D:elÂ(m"¬6¬u¬ V¬J¬ºº­:ºG]sPaÓã'áp(Ù(=M(× (º*®Îi¬J¬p¶iÒ¸¡üÎïÅTêû{í5óIs$Ó¼nm$Zµ¡DU®qír7-¢ÍâHó1HøÝô¡kPOËKÏDOÒJGMM/KPß8MIFG}öJb5K5	W¢çNmö8 .7ÄÎ7u7ZË®ÍÈÎú2Ë;££å.Z~ylY~nY~Y~Y r]v0#b~$i2Þèªu= ®}B,Ö.«â-Eb¬¢ÐÉè³NF-@TgêµTÅH»BñWæ·oÑ¡qÆñ·³ --Hg\Eø0ùêzóKL[xõÊIýßÅu·P-Ü¦hDxë~Û´ 5ëÓðgBÈEp¶bÏµr:-ÆÎh/XE|é4{ÄI´è±'t¢[+Ý@¶¬Ò(}Nb>EÀakû¯ÉÑa·Ô-mÂgsroIÒpoºâ;¢"Ù!Öl¡¯Â¶¢"¶Ô5ÉM\¾-ijØ°µ;7,pG	ä­öÐXÜ@ü9d·Æw	ÔÀUªÿÑvÒ2ábõsßÐÍ¸Öþí;KHð>U	òÈöa-¼öp¿N´XðM]Iå )= Tüw×Áþ=}&Pp$YdòVñ	ñêÖWVx7µ×BÙ*;ô ¥r£¶óÁ°Ø*>ÎÆïrôÉq»VOÌÞáA³ßðÕBñÔ J=}rJ*¿Öo<I}CÜjGA
érÚR¹;.ohpµ6
<¼_?û¡üíOÙ y§r¦!@,Wd}Õ Ú><þeù>\Tß~á×ÙÔ°á¨@ÓÚÂìZª3\f£#fÐz »u~9	i|±V~Y~~
~y6pR]"¼"(WòûhapF±=Mút?¶[¢v;bOèQjþqs6¢Ün¢Vò.Á·=M¡î(ôivGÒÓû:q.ÙÛýú
7é@dUû= ýJáç P­¶×ÝÉHð5EA 3íÕÕ¼6M¼vÍp¿K3Q%ý¼ªÄWxXÚ´îª ¦D×qyiè¿À@FgvËú:Õ×t= Ê5Mþ¾N[ê½x®ø9(Ó%(ycûy(7õö¾lçyAÇ¶Ë2i»¹U@®_Ç'%ÈàPpëIT'¿ÝréÇ7³ËRKì¶Ýs0¤¯ß6;hÅ9T1P³ÊÛj¸2jß°Âo!2óe,Å)µìÉ8×ÕkÇ>¿lÆB¥­äj*s¤àÂ£×t.Õ£1£¢+®Ø:kdØóàÙZ?ÙÑÙ<cÆÚ¥ýÚÛ¦/ÚQÚTIxÚÇ£Û5ºÛl9ÓÛµ[îÛôlÛ&ÛÀ7ÛqHÛJÚ[Û#;nÛøÛÇåÛ!h¨Ü´Ü%ÀÜr½ÍÜâÒÚÜVbçÜÁoõÜ0÷ÜûÜ|"Ü*ÜµÊ3ÜãD;Üü§d¦ã¬·¨c~Y AX~Y0~Y~YÉ/¢ÛAl?d¸Õþôx/3
ÎFù}r»ðÔï­åáÆboéõÄßÇ+û!5C8¢Kú(íÊXËæ]v
ñBâÅuøýØ*UPáIÎ"è)ÄâuÓB¯ÿDm,~Ó3yéA5UÀÐÞ6Éñàú= ,VB5¸æKpÙ%qTjuÖJç5tñÆ0yÏ-VpJ[òíëøJ5g(Á
Ö iäÈÍ= ³0¿JE¼=}³üÅn÷ÜXæ"¢ çR(ª¿uiª¿K³cäbÓ¹}gxÍ,&¼kðl¬YÕ=Mô¶Æ¢ÃÏçÂ-&éÿh¯R@Tg,°á3"¤"¼;°Øb¨$dp*Ë¾§É:bcú¥cÕ×!Ö[!*í»aÂá¿îÿeR®úó¶ÂG(n¦wâå¶¯xY³ÀW*_ÆO²@ÄÉ)½ ² Qºm¢¤:NÂ×¥C×À'ØLó§bÂ±pÊ4ù½0õ9Ûa4#ÕjÇ{IãúÊÀ´ZÖTxA°øFßÜ¸#X«8UG¼úàO©ÕÛçH®¡f+÷Êïæ^@ÂaÒÁ#f;û»h¢Y¶Kv<iìÏ§QÑø¼¬PNl©ES0l 
ÀiÔÝæûñ¬%ªcÃ£££%|Y>B~Y	~Y~Y~À®)±}dë¼%¡X¼q ÜÆüÎÖ-5at+"ÁnwMkß=}ã qç?ojÌË B)7qöÏà*9\k«o
m(+ÑÅ" µ9§Ð_Kþdîøÿ_)¸¡Ì\^ÁLa°oÕ'tÐ×ø2m~,xÑ·×,= ÿ}jÇ^¦ßágÜêòÜm(ßÞµXTJT.à&= eÜwR|îoÒ= /R ø1\1vL>/?>X¸2²¡´*òáU
{¯!¤èÒ¯!pÛZÿ3rRrÂ4]¼d\ZÞ.9Ç=Mm±¢îzâI
þ.£Ê¾¨ÜÒg,ÝYy,Ó\75©ÔÏ=}h\zÑd+Áì/ªìVG¯1¶üÝö±Lè·Qôp±èAÂùå%ÕQ÷+NíoØ%wTÙsãoü6îýïotÉCô**ÆüCrr@©×ÿ×i¾Æ¿h0ÔÙ
CÌrp³ÖêaÈP3pÞ´¾±þ{ÕÍy1#ÉosäÊGÝÖï|(²aQg÷[Ô=}ªz±Åd®Æ ¿ »*¡	"¡â°_	Ã¶%«»µe&D×!¯FøÛèh´¿=}Â(up5÷»?¿nEì_3c©(çÈÉtàÜ(+NL+ITÔÒ@È<ÿ 8è_ÙÞ]3â?êMáÕ®{SO+æB-ÜµóeY¬ï= ñ4 ¨&MÛH=}½wõTAF¹°¯ÅÖÆ¿þûÝI0°r}ü¼wd¨ ·¢i×^*Îtò³ß£é¤££· Y~òzU~Y>~Y	~Ùï'@àÅfmþ \ÓaÂP´ »LâÎ©?Ú#½¦¼!³ç©mÓ9ò)óÿv*ë»ý*)V= «q0CëMú0ËQ<2Éi»ÏI2HæÛ9«¯ÝàA#t¶Ëò;#_ço2ï l1>/V·/2ñKÉðX=}rqp7<
qSÏoqi ¿Yxq6jÿOaoæäÓBUD®ìüã2qåÒE·>º¸W'ðUî|¼9ÿX?¡áÎk3ûleÖNË<V=}XN,«ûæ4ýáÿ j¸ýòe©ñ½Nð{^<P6YE®v¥YUø¾Y6]°12|d15À»&}ÑåÂ:²v§ÿ·Ñ!Ò Ðè¼ÂÑi¦'/Ü+íxä¡èÂåÓb2ôÁßé/·Áç¬ù@*ÌçbAXÖÏ¹t\z¢ßÈÜ¼$P1ºtó= g²:T_(n%Ný0FRV[Ý9|Ús-[ì*fÐ5ØÖÀ¡ß].k|»_2vuªO>3È ÂD÷ +*¼2.eî2J»<àZq$îµaLz/µ_Zïÿ±d² ãæzªy ätÊuá5(usR»"Æ}Þñ¢cÖª² gòEòÒ/Y &zGÙ+4Åilx¯³J<§®Ç3ûÏlîìºëtÉh1u<íA¯
ïÚò9öür:(\¿ÎºmcõAh­YôqèaÝË5Sý,Qíï}Koëúdßó¨$ã8L4MÏÝOivçØmòNÃ÷êM©½¯C,8ÉZ^ð®}¯ÀK&6?±­ÔxtH	1ÁROûaéB¼+Ùcß}#J¯¼?k+Þé¿KÕe@ÔZèï³k;_Ì9©IÏþéTN¼eÀ+g; O¨ð\¹§âTÇOx5ÔÎA0T	_$ØîfÔôþµõ´bjn=MÞwb{öàw$}±«¹ÞUvv4ú?ë¢g*^q¿%[®ý¶ÿ¼-éÚ¯Å[ñ¢GâÃ»lýæòÑOeØw.= _¼ùpCÒá¼.4,Ò/Â6RYBË,£ï®;öÃÚè&Sì²t.uª'³E¾å=}óyé(Ð/ðß3®ê§¸á´Ü¸lAë¸h6LtÇ^ç¯þ­{Ø9z¶k/dq¸g¥)6µ¼5+4Ç×î5S8ïx/·JÓÍPXL/7¢fhÈ"´)¢èyâæôâÜþ'¡Ò}~×©0î
DÝB1
sZÝ¦"\ï:4·6hEê|[¯l(±Z±Åø9îaÁr:VÍÙBò­Û×E³*åyBËELQ+xiÏ<S'QòH§qËfÐK/O~Á÷äGð¨õjÍý,<é¸àþN4nL+û°Þ:wÚD¹¢z¿?õrCcý×ÓûÆÒ?¾à'¶ép§À®=}]P¿¸WTLE0öM»ùªl@[ÅÙ^.õkRîé²= ¯&¦Ç©£cQY~=M~Y~Y~Y~	ÓÅëc'l¥Ùa³Íó+clåOÄ'ö3ÓJÉ®ÖHÓldÅï ´õåè¼× 7Vè0³pÏÔåá-Ñý?pg<ø?4¬µoûÏd$µ+Hì5Zõ5vEõë= ·>G¼ùÏð~]÷;÷Ðf Õmu~ÅnZ¶U/Ô6&áÜçÒnäANæúÁ¨Â¨ÉËSH¥M-ïBF+ÚèÉÎTHµîÇ7üÿKoQm_÷ödHä(j÷3ÕöbÍ!z÷Mi|t=MIi¡óoôê*Ý(½¿ÿJä#_ÉÎØÞKì#4¹}= ýkÿxåxð¾zT}w_w	G±i.;ÆO.þaÑYUëö2"þÜJêB&áVêLá¹©/ÿ#/SÄ°,|+E1´rÝ/[!l+ªQi+/ÚiPÔ&ðau'üöaù<ÕKÌè9	±Ùf4¼yD'ÑÓJ g%àè¹»VE4Èé¢ý1È ¤ùgrTe 0î$Ø´OÕW âÙkXDÖs9B<ÅêTÀ-ª=Mr= $_2ÿ'¦ÄîÀ»Îkj=MêñÝn,?k"'ö-Öý>?tsdIn(w¾Ñïc8
ÿì¶íL¾êsXëY_
UªnÚón62àAõSºµ.= »Ì0ø@ÚzrÖrp*aLá×DFs:,ª Ü*eËâ=MÎ°mY&+Dâ¾ªvwBO[£Ezª3O¼ë Ã¨Ûß+C8äOú±iNÆ;Ú&âÛ'HÄ»Ì'Es½-óO¦fë¿i÷\×*6 Ð?¤´wÒ1ãîá5nÐ4Ï= Ál;CËéÏ0I×~F!Î=}kS»9R/dûÐ98àTgß+è³¶j4Ïs,
¢ïÁr§òc{×41´, 3ë!µ²ÉÔ|á<gll»«õ³Mï|·§áLÒëÈÑ0,_]@éÝzzHvC>$C¯qbq!	É&
u:hClüÏ³mÙ}:U­kU¿wBn'
\gID= Ê2Ry_;;rÞä¤ÕØ¨ÿÑCàK3Î®sÍl#Åÿ·Ñ^;¤*.,Ìd¬ÕÕHëY:Eb·BÕ½Z:TpE¿X¬ÒKãGY%lúÎ°N]í»÷Ôç¸ÆbùÔIO=}(NÜ´ó&M½5=MüÖG¹FòXÏËQfÀL
}-mW¾«¼u#J©ßí½,ázëã¶îúØZ<'p}/è®JÒXs¿}-)ù¾Z¾¨OQ
PiÃbV&§~ñ¹ñçýI.¢]]3!yh%oµ1Æx*#åWYPX Y0rnY M|Y~Y~ibæapÚ j¡z¿a¶ª¸Üâû÷/þa·oµ
}ìñm+FÁËñJÛ~ÙìCã%äÆ¬A
îóÜø5ªêÇµ:çú55R6d Ì¼ë4AÄ(y¿5	.;×v G4IP¯üëz:ÄÊæ)mlUÀ5Q[Ï^ uÉ.lB·lFB_m¡ìwWÏâ.õb±hVQw-¡¯; éXÚ>k4!ý±T±:Fã±2P+b5%@ßE¸oûEc¨=}ø¸K0úC!WÅ@¥èiôç{æ´ä6Å²zËDê,ç¦ÈÉÎ]Õij87ô+ÕA m+ôä H­ö÷óQóaSÍYúø|NDíì5ÍUx{ã0}Â=MûM[rºø
o¶-Ðw¬Ñùj$©ýºØ3útú_©­×t|N,Úðe= ØÌvÉÐßyH(¹hý×Ðs	È÷XÌîs	ÛÀOÓöï*B!ÝxH&â]ïQ.Q0ÑE¸]g®]ÁW+ìvæ-á^2ÖåùBgó /©[f#.°{=Mcé¦RØi âÙØDÄÎ¾TE´
÷08'ye²½vÈ/3ÔÒ/{=MeðÛ%æ= ¬¶z;AÌÉI?Ï×Èa¼Ñ<´H	i|ÖíÊ=}+ÜVo­Ø3Ü6ü³t%Á¹XwÉîõAû	lz­îQ-ûT)¸NP;>hG|y/à
pÛIÉûV_°>±|ëm)ÄÙ½WdJÐhÂ<nLÙþ·èë"	jÞÞAú~´aeÁÞ+¼~öør|¨±' *I¦A±@ëìê1mÞ5ºkÔñïá'6'¶º&@³½eJÖ²âÜVn<
¢îº±Û]Ób(ØQGàhne¸6Õú79]Äf0r©ov´b1%)Þ)[ðÃ7ª°­Áï.jòÁÁçòi6wòÉ2wÁÒw"ô»h)!Òg6 t>pv¢R²3fÉÂ%ÚULÒ¤YaPÈ8Âúô*ç<Â.ç¬[rðÆ"i¹TÓ#z¥;R¾ãý£m¥ÜÔ3Ü½$·J¨Ûà«TÖäÿ÷±å×Ì+l6&áÁïIÿÓdTdÛ1®d«=}UÄËê)CÛÍ· Dë)·½-= ó»¤%Óõ"'ôº»i;dÓù Ûja)}Ò¿fµYêÓÔ%p´_-c!îÇ°ÅjÆ5r4ç¾hoÚôß0ÅCÈ-|"ê×ñt-i¯BjÄ)M»QP2ÈìÏÊ,N0}ÛõÁhhÉ1UÛP1R*ýhVTÍA8¬^BcËn§ÍµÛXÅ4A^,û;Êaß4tn6^6g¾VÇÙ9ÈôÊ5/ ;ÉV\×<dHÌgíänÇ(*ÈÌý=}mþLw¼Jµø?-(½ÕÚv?iL×Y¬JÆÖ@Li¯ºHv]Ç&M¾¼·½3 7ä5ïõ5	7ì	ôÉîUË^4è&ô¹àèü/¸q	py¼
ÆËqU±RÃ?&±Ôe\wo-ìÑ¢8 ÁÕZÔlFKÇ2lÅ«i×Âu-ç­;J#	¨Ë8¸3SO3ì®Ü+ýÄ|n.ûR+ª¹è[÷·ÔSE;F.tTÏIIU;@Níóóå\ø¬ÞMîó  ífõ±}7ýöm=}ÕßÑÆkY/HëPÎJìÜÊnRÒ
)­GBøsódXi­EÚùUèÈñ8oQçéW-:øßLEKH-¢÷¶]=}= xYø"ØÛ_P8ê°	ÀØ«Lh Ð®_=MtM¡YÝâyTcJ±&AÝ'w\Aø!{xÆ]N¤rR°­ÃC$F^¾ì kxCém)½ÍEöO¬T3ÉÉx/	9íÙÂyoY4Ðç/®(´Ðß¼ídùGþ<´-l{ÙÙÁf¢ú¾j~k¼q&kXÆ¸qìÀ»B6ª¤,À¿>uìqLñÁËu4,gWÑIAeãX.X p	¢5x^\AtðOÁëV*üào?~.ù?vn 'ÿ+Âl ÿý{òd!¾öøsr6h¦× ¢£R0©Ò½= Ã@ÚªJî©ÊÕçÄ;°ôÙg&f7À=}hÓ¸fûq³µ7¡ÎÇûëP3ãè ë³ÑÇ»4ÄÇ{|ÄÇÖÒ$b§¢Á#ï££/ñÞJYN~YÙ~Y4@}Ù¹Xéíæ´äÅ=Mñ³n©´¾q-[õ'ºö^[;B¾.üÞûoX,o>g7ÞÒIÔÖ¿µ±:3],'ó¬XÊî»]üe?®µ±= 4oÌhøí­pG½ÉBÌõù4E7HûÕ-99tS\/¤f/<Íhù¼*UÊVþ1V/?%Ð÷ ññ©I@Ð
}ÜÎà­Y:ôE(%nÌÛðd^W¥è1¥ª¨%CÇ=}DÇîÈèaúõ=M]5Õ87pôõ&5-%--¼ÍmZ÷ô¸¼vø7k÷ôËêè&-CCi4Dé~õpwß>IýpØÞNb¡½I9tê®°= bvs=})/W)Y©|°Zý±7yU[\9â*âønZþXÛUWßNbîjõÝÙvô!;±n·ÀzÚû äj²÷Ô8wD,Aüæ;GÊYìr@¹= uvlÃ÷ãÆ¦¶ª¼Kàd#&$p
¯"cØK+4D°/ç©»ÜÙykXé'öéáØutåkg%]ÉÍØ7,Nï;1>ûkç)oT	}wÕKJ<¡ÚFû	Ö1		KÐ§õ¹ùV³	y¹ß.Ðï{ä~eÎRFù]ùUDF8mbþüÞr-
Z8Qü\ÎUôÖü¾]YÙ]¢ï¾¡Ù©}Ûd)úSvN/@o7fwB
m	Þ:r~¬= YvtÔª:¾Ý²ó"?&bzÝëB,¦dGý¤Ê¦=MÞ<ynlq¢@ûç!{ìA6ÍºÐµÑ©÷
ºv¡Ta.Ð^ = ;kp|#>.[lÉªÚJ^Ü8ËnpZyÝàoÐ²°s_*ßâdwfæ&cd¥¬¯Ìóâ¤¢õ$*ª§Y¹ðHw.aE:= /N
4UØzî²ÁÂêî»ywê+2¦¶ûæ}juJáÍ¼ vb9Âüòâ¢¶ÿ
|!â(|Ë°óÕ¿\£(~©û#c/£u¤Çü¤a¬3²õQû3¨°%kªÛÝk8ä¿ê&_Â>Í'Ñ´Eü³Þ)[+ßå{Áô+NæÛ=M7¯ Ó.ª)ÜàÙo~x_jfÓï®ð'dl«ÆMç;vÌe=}ÅB¶«ÊÆ?ÂOÎmLµô1×-Uã7ðEÏý¸tËâ2uì¸F=MßéEõ¯*»\âjûÚÖiB<Ô½h«a,z¹
4Û hlÊq¢o½J$ÛuþyíµW«É³4!n§¸)Ê[ßÌds°¬WJ¶o5Ã2álißìÕMÈ|tÜ¬bÊìrìõ5ÈÜì5ëO-	öìÄ/ëÔ-¶öçI»ÇqfÑ"ÁW»³ª£C¹»-!Ö~VlY~Y~Y~Y^ÝµËøìï$v§PµkÿCf¶$¨¢-?lÇÈZë}=}Å\],÷BÏu&kSVÅv,Ï0ÐTä7{ùó
à,= ÈÙp3û\øÈ,ÔÈÇ3LRl·ÑÉÆ×9#o0ÜÕm\ÉöVïUÇ­zï(È¸M×öëÛûs(q·U÷ÛøD Õ8g1m=}uÍèþK½EuDmÒ÷©õ, û0¢ 0á×áWsÛ÷å0×	u^éÝ¿@¢m÷=MDÖ+qv¨Ý@Ú¹ x\<wÃa3N7ä6	©F©¼O<
:dF©bÙ+6{ÇH5T[ìyiâ|¢
A5^ìnÉ<ß+
ïYûôkà.= Ï%¹¢UÛ"yî.ýÔu	X\5j	÷°>ß 1Z<W})ÙzÂ|¡nÄÝ*\4&ütþ¾*Æ¿Ïk\Ðª>f7GÑ"þÑðî[¿ÅÞnù:Ïº ýb|·~îÙ²ÒBêN=}Á]?¾=M2Ïjß­àK¢*ò2wáB| 9XüÖ{
ßBxÞ ¹<¡
û_#±õãX¥¤w±ëÐ'#= N¦i¿®KÓÃÂÄZõ(ïåm7¬VkM$Ä8'~b»_¬ÜµÎE=My+ª\Æ=}ú.|ÄE|+îÆÍÂ+ÛÎe½ ó¿£{«#Ãû~Y^<wY~Y~Y~YÿÔÐ#è¦÷Õ¥Oµúb£o£Úª[Ùãº¤/»sÒ¶OÎ¦Úà+u½U±(-Duñ¼Ýa(A&pÁGhÃ M©táë04ä'hä°µ3jÂ%í³Q³Ø%ÄUy«K+Fæ÷½Å¡³Þ'Ìç?ç9±¶­(\õÆï6ñ2±v;e_´hjÓØ¶éÛ=}Îå'xÆ_³ä¿¸}«òçËÐå´yi¶9 Ãæè¤= -ãJY¥v*¬>Ò*c6.¥¬ç,ÈµÖ¢ÐÆµh¸ÿl£4ÖèYµ<ýGf¶´Rë}×µ2.ëO÷ÈýØ3kvöqç,TNÇmÂ9þº,o,Y94&ÕºNlwÒ[ïX¨Õ
k§ÒmOÌ6ß)åJ¯­îËÙ¸]ÚùÛþÄ¡·¨0eÆ­Ë_E3ÄTíÛZíæ÷ùø<ùló8øY b
øÙßøüúý=M0$(Ø=}l½í 0 Øa1tÛ]çÁ0mú×õ_tÛ¶ö
ãé@EÈ»Ý ½HVE1Uõ¤@}Ú= ¢¢½ÿqÃ:Ô{¾G=MsN2dXl©(ù¾àIä52©ñß64üð8Ô
>¢VÉ$áÉXÊ>üÕClw¾É>Ï/ÔÒVhwõ¹fð.Ñ0Ï=MW«ïSë^. úÏé_YS{Çñ_KðhÉ" >î@]1Uì\s	x¾q|? Y\;dqÛóUMfy±Ô©Ü×?S@æ5F±ÞÏ ßQîQÏÑXî\/ØÿÙ\pÈû:¯. -¬AôB];b Á4_ÁÈkù|Æî2º ß1ï;\mF$¢Ø2ÂRàYêByÊ
B®%ò½á~Àq\VqJ|´BzÚ ý= µNµxÖ÷tí·5ÎÔ¡Â&£Ãç£çt~Y|	~Y~Y~Yn³väCmÓ$lV¨³kïcbÐÓ&c\»Å"u-ÒÏõF]+R.ÒÕ+k7<ÅÖy,ïâÏÕ)k3ZÅÀFíLÇm:ëøüPÇTZ8g¡µJëg ÌRçzîµüBî?ÐtÝTïo¿ÕVnkÃVx:Ìv 	~<%®¹4ìõI <ÎÂÆW;­&vÍÿÍK3QM%PËoÀdÎç>Eó(%[êD¨(Tò·¹¡óûºþ	8ÀhøYwõüMoCÕ+ín¼ÍØzKáCUm¡Íf!NwëG´È>iY5½ðÇWØÙwÓ÷¯0×EÁs»!üÆ0¤b×áÊsU?ËQ6Z9qÓæÞ@&]ñx|\å@%êÝa-Ü@d~%©ôM»Ç5¯õXÓëv~ÃÛ&®°¡Ù!oð&ø¯©èÕ45=}lE7l-ÝÉ$5M&lTäÉJ=}ÇüU:ìVÉz>[BïAéZ«öüptK_h©¹|ß.Ä@Ð²XËáfÍ.ÖÏµ@ZKÓ%"Y{µf!Í>U8ZÌcIDU¬*{×@	QS4|÷ÞöAð5²ÙEÛ¿ðÓÐ*&úmÄú*
]fÙ±åâ*k¶¿9ÒKX|l´*Az¿_;vÄèß:l ¹ötÆ:an=}qÑÔ)]vÿ9ÐZfHsÌ:yZ ¹a\zúå2¯<àm¸³M'%ê*sFþz+Àt!]êSeFñ2ÕJßu}oÂ2Ü¬=}lþkèèB¨0=}á¢ÝÏ¼öUr há@ZçÜÖMò
áÆaè©Wò¸Öúã(u¤=M¨ø¦=MY¯;uÖyk#V¥ø¤F¨ß¸ùã/z¤ü"ª7,ºõÊ +7ÒçÒºTæ§ÆGé3= æu0±ÞÎiM3^åA­LÎÇN36âf¢¯9¦[¸ô³#V~YrYy^ª||Y~Y~ÙûBê¯-óË(d ©æ.¾L	CLäÆnô¦;d~L©õ&*þ¯½¿Ô{|Ã&äB¯èÓl6cGò6æïÅ:ØÌþjGþ6HaláÉBê<Ç;5HìÀÉx1>w= ¹JÉØa'Æüð4Ï&hR¹ÚSû~óÎ.}AèE¹:êû/@ô!<hÐ¹Ö±þ7]·M Äþ'¢
ÔÝYð÷Ù¶{gÏvb-p>éÙ0Ý}vÙ,©}ÛpT,U}Iiñ>ôj±X¡{ÉnÊ>}Àÿ*ÔLÀ¹{ÿ¸*f0åd2{s»*V¿?¸±8ZÜGáEfq± Ý~ê:Øì ý,÷süü:-X X:Âÿ*\>uAn~xÑP]¿Þ5-n*Ñ\D"lã¯2FìàEKócFÊÁÎ=Mÿ=Më}hÆã2-àraF¹2	ªàAË~Æ®2'àáèÜ¾z
ôÍÂ@J÷´B¸s6f\yxJ¢ÃBo[l	Âc~<óðB2ò oòáú¢70¸SÛüãgo¤ÐªOÎÀJýãHi¤f}ª¿±¥!­kàÏCG#¤¥¹O­{VÐuD#ê¥­ÏgB¥®»öÄL
éd_%aÈ¨0M«UÚ³Ð{«©¶ÓË2´O;Ä_ç
= äl%.:§À¬= · Í½EîAÈ6×pÇÜ7ú5PGçlF5PÇfÐlhq5G ÈðéíÉï4¿<Ò_í5	>Gäì^Ö5zÈÁì_8ÏÄü¸ìTÅQ­hwo-S­bGEè-Ð¸Z¯híHs ·è)ÌáòóO<P^ï´
F~è.-Âº·¶ÎÕâöCËþTâ-IïpY7=}?ü×ÖÅ9w;8×êuÙzKÜ»ww¼O¼Úé=}r¥ðQx=}ÉþØ= 	@w= OÜú\êpNâf£Ö£)d°|YpnY^~YÄ~Y~QÂi ×ø¥äÕ©Ñ´üDDæÄº4§+3?]ÓDóX.Ó:3+SOó]¢$s8VsRÕUußQá4õÇ0UÏNµÄbuE'U= %µP9õbTU[0KN5õ8éæ7ì8= v78;Î8O>7~8	ª7Ê8¡:7Z8´ò%!NI R×,=M70
íçîßlo/Î	wÎ
ÇNRÏwç
×Âç?ÏB·ÿüW}	!rCÒ§¢)tDHô6T:´Ü%vÍ)VÖ$¶ÆLvÓPªAqV_ñ]ñUqoMqT]qJIñEñtñæ²é2	ò9qyÏyQù¹I)¿Ý@)h¤}±Ã©EX~Y~þ~YaÇX~Y~YÂ/*-:¥a¸ÃF£©{Ôã¢B¤m*ç,Û¾ÔÅaFjj1|¿Ü» i4Y-ê8i1~P¿PÝÜWßkô"7çê¡<1(®¿ù§yÞgºWÞ{iUFjê1 ÒÀâÛu¢w¬¼³yV×-rFçABÌàôÕµGplÿw6H/ÊöòMýA°àþáZ|ßV¥æß¸êµò_?|×9QüTnvCÊ¬r9A©úàb	áÜö>Âòjóe«å:en[åVÇeH÷å/eå/årÅe(5å)­åb=MeÝåiåN9emäbQå½Ê×Æï»Ç¿»Ä_ÁÊg?Í<ÐwýË Ñ¯ Îo{ÏÏ~ÌÒâÍßÀgº& {îD~DqúÄÄñ« ûë=MïHÈõöÍ©HþÙÈÁ!äÔ(Õm.-m{íY]m|éí>¹mBYm[qíAmÕôÕöy°±4mí5Ìm'<mbíÈm(8íQmGÐm^@í moÆmn6íAíÎmd>íkítÊ-_÷yaö ùÅ¢÷¡ö½(Õ(ÚçÔYj×qhÖÁÈÙáIÓ¡IØeÙÅÓÅØe¸Õ%ºÖa8Õ7ÚQøÔ±w×9zÖéØÙÝWÓmWØ5ÕáÖ±ª/,	×ÇÂßÁÏ½×Ag<??¥ÆõíÆSq+Z|{YKajcw+m;që|ûkjû Ãw;u+q»lp~Û·OÚå	ëß/>¢¯9¦»¸ã³'V~YrY~_@~Y~YYqVò6Ò=}åÏ¢1k5{tÒ\=Mê¯1uü¿fÛ±ÎëúgôZ'¼j)­1ø¿â=MÛwKswtWHFþj11 ÀvÝ	o8bª¢Ó22¯½É 9ZB+VkLíjIX14¾À°ZÝÕ|Û!cÔ¡+F}¬ê/Ö1nÀÒÞíÿ_û rôDÆöj}º1M¿BÞÉ""Ü½AF¾ æ¼f¼öÅ½F½»,»V¾Ô¶¾5¼äõ<ºéÃ&ôÑ.TÜ^´ÊZtÚBVC4N+Ôa[G74J?ÔUEA»ì»P¾¼½½<=}½þ».þ^é'ñédQÁï
ß7´34Kô'ôWt?ÔEÔ-T]T9TQT"$Tn/¦Î0/p0¸>/|þ0tÞ/^0	/Uª0Ïê/j0²Ê0
/80¤:/½ú0wÚ/Z/Æ0¤2àÕàØßÚ_Õ_ØE"Óñ"Ù0â/êb/¬"0ähFË4ÄOÛ¶W0Çåè¸E.?Tg,ÛEßDAçðÉ)I·u+Ôç'/áV«4ð[¿ÑtÅR[9·ÒÇÙ·¹-,$ÈgvõEüTE_«üì×QÅù¶4-	Xhy]Åç¦ôH4;çß=MÉuY·þ.XhÅðÊtW.;xðÿÄ%¹|o,µÞ©+cÃ´KzÀÑm/·Pê.Ähç	U«ï¸ÂI.ÃVçgÜÅqß4$ëXëGþÅÕÏ(ë^íGÿÆµP¶ÔÚ]Ú,â>h~PqJ{_þoâËíÀ¹L2-3jè'{íïßÆý@¶Ñ+«:gnhøt]Ëö'[Ðñ´,­¤Ró?Ç)á´(A,ÒrhM:E´P{ñW¢Ã"µªâ.yèGv²ô :þïÎÕ¨r,C ¿_âå
K¡Ç­vBöâ³¨k$¨ó×ñ}Y~Y~Y~Y~Y~ ºÉ×îb=M!ªu©y=}©xj	(sf	>*ye
þ(v
>éwnét´.é9J9ÙX9 GAYþß	Ðå^2¶|?ç6;÷JRpNR@6õn=}ýÎ;iáW¯JZ¾Û&Àk~c< !¹ðù@ Ù"ÞÅJu¼T>ÛRáØBQØbéUCáS3 _(CÍê8z±ÎD"ÐLzvÉÏFNÏN ÏzÐ~ ­Qúì¶üüªýèöûxxßrþfÜIYQX1
ONÞOJwÑ=MZU!Ært{=}ü>÷>^Ò=}¶Zw$YU>ür>^0ùvþG@9ôzþ_¦ÀpM6 j@àöº^*^=M^n9ÿ¾Z*ñ\JH²wáýÂÐ	Ö
Q ØFâZÀÙÿ&X<½ãæÖê)Ú*BÆ_Z4¡7iü¶9Æ¿R°Óq /ÚÆ ®ïwGñalA-q4¡v4Øf:;Ùv¿WfT
>ÀVÿ<r¼ÖCZxµHpÅV­fhÜ:!;\o¯9ÇüSåî_õÆl_ø1<_iÿy]± ziaúÓ0QðYðQî>pHäAî9P®°YÜâfZØlNlPîáèðÖÝR´ç}?ÇuÌRÇ != ÔÜ±!kóíaæ!Ç2!º|2&ìNäeA2+j >ñ[±rKLáæö÷>j.i\ÈúÌKæýõ_0º×R_C/à4ÑÑ\å¹À·áô-³M;&gyè¿lWt \åM¾Qh¸õG1§ý1¿Å5	]Ä¾ 1Ù?¼ßÄ= !]ºê«JFQqA4ùò( DLÑoñ¶ñþ $,ÿÅUi]Õ6[ëPüé/ãòoBAÐlWz<q%àg­µ\-AOá´[º]S7N§ )×	Åæoú1J¶Üd
aÀv$<¿¸4×ÜcÓy,Â=MdÌã¶éS=}ÇUYÞÎxq&Âtkí¸ÝÔAX?Ü$lðØÝÕ)¿¹«tkê}Ö/\×26çõ1i
×|o9âá!530µwG¸= ¼f¿yU:ÖØâkæµ&HÓ¸KêÕ/ìo
°ÞÛe¨?òIÎ²ä5%ïD»¸Kì}s8!¯
ßÖûc­ÙS&¦¿ßz[n¶,Ba<¤ä¬æÇ³2ÇGÇàükè!-ó5÷IÝãöýu91HÊ ¼kóéÓ)ï½Ö<f¹T7OÐ|g¹YV6£*ÛeÔñ5v?ßº[gQ¡ðê"6þÑ[r¦Á+jß×Ò¡ÈR ÊÊ¡ B62"vÚa&R¢iZ¢4¡¡¢r"b¾bª¤«ëÃ¥¶'C§ÆÛÄ!kò$	4÷¤é_í= #F¬££_þÉ= Í\ûÇ/ð@^}YOÕì~2LYvR þrov	ä¸«µC¸s*Ê{~­ý®§\§æä@dãsw§³ZÑ¿9£ÿèÿ;Ø«í­î±£:òÕÔÏ¶¬^¨s[º³Úò(éûV¼ñA¬vYýÄA´«¸9Snók)Ê}¯'büÉc'Óß?z¬FªQ)º(d ±ãn>ÇcÒ¶=M®Ù¤^·±º±ùô>né7i/9ZçÉüô3à³ð_ÃóöË½÷PÖ]÷ÃÝ¡ßýyÄ¿ÉiF@Âý0eèS¡¤7aâ¬= A$weZór4ÚWT$-ØRnpÛvj¶ÚXÁ+= :«ßù«_¶qn¿#:0j*·
ßA»gR¯Ní= P{SÂò>9'¢ÛA$
Û"eÚ?ùèÈQ|éõÓmï- Ã nüìj¤ñÒä?NåkZp@ë£Õ]= Û¼ÔßAç5Ýú´þks¬7ç=MrqÃF5^&A6Úa4Zâ·}OV49IqsÆrÐqQ£]tÍ\aÄWfñ×Ul£ÝwÛAMre0éð Ê@T
¸À3= (QJH5i¼wp!6©ø"ñâaí= ÑÎOKB4¨÷ÕVÀîàûæ¹í£><Vµy³9V¶H±öò2ßÌ/= P¿rqºUùT8þ{@|,3Ä&h¼UòATaUAÞ·!HK4¡)K«®¢= £Â?!_x~1_ú=M"aiÛá
»âØ1ºø_Ð_	@ |ça7qÎ	aB{Î½L+²°6+Áå´Àn©+!ÿZ.:ÞÞ-ÚÖ.¾?[ßÙïÏp/¶2æGxûÈqtÐÅÝBÜËôç[uh,\ÚgÁrg×vúÒèiÂÔkjnïUó²ÜbMèAÒêØUd^/ËFü"üvûüJè;?VÄñièÛëí|x[è!Þ= òÈmeuKùÚrmrxOÒUªôWÌ°ýË6Yì¸Pz½=}Ba´Ïy@üQXK!ýwYT}åî;Ùý?O.æ3\õÎ[Vü¾XB4"õþ@Q¨:\Dø_ ÷6ôW	hÙ!3d=MUxà÷hÌP)cÇ"~dªoÙëX~_aS çBóÞ
D
= ãOCßoÝ Ü H.®\QCúÚ È  8¢DwÉymiËí= »H0È(­Ñô¢¥`});

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
