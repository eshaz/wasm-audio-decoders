(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["flac-decoder"] = {}, global.Worker));
})(this, (function (exports, NodeWorker) { 'use strict';

  const t=(t,n=4294967295,e=79764919)=>{const r=new Int32Array(256);let o,s,i,c=n;for(o=0;o<256;o++){for(i=o<<24,s=8;s>0;--s)i=2147483648&i?i<<1^e:i<<1;r[o]=i;}for(o=0;o<t.length;o++)c=c<<8^r[255&(c>>24^t[o])];return c},e=(n,e=t)=>{const r=t=>new Uint8Array(t.length/2).map(((n,e)=>parseInt(t.substring(2*e,2*(e+1)),16))),o=t=>r(t)[0],s=new Map;[,8364,,8218,402,8222,8230,8224,8225,710,8240,352,8249,338,,381,,,8216,8217,8220,8221,8226,8211,8212,732,8482,353,8250,339,,382,376].forEach(((t,n)=>s.set(t,n)));const i=new Uint8Array(n.length);let c,a,l,f=false,g=0,h=42,p=n.length>13&&"dynEncode"===n.substring(0,9),u=0;p&&(u=11,a=o(n.substring(9,u)),a<=1&&(u+=2,h=o(n.substring(11,u))),1===a&&(u+=8,l=(t=>new DataView(r(t).buffer).getInt32(0,true))(n.substring(13,u))));const d=256-h;for(let t=u;t<n.length;t++)if(c=n.charCodeAt(t),61!==c||f){if(92===c&&t<n.length-5&&p){const e=n.charCodeAt(t+1);117!==e&&85!==e||(c=parseInt(n.substring(t+2,t+6),16),t+=5);}if(c>255){const t=s.get(c);t&&(c=t+127);}f&&(f=false,c-=64),i[g++]=c<h&&c>0?c+d:c-h;}else f=true;const m=i.subarray(0,g);if(p&&1===a){const t=e(m);if(t!==l){const n="Decode failed crc32 validation";throw console.error("`simple-yenc`\n",n+"\n","Expected: "+l+"; Got: "+t+"\n","Visit https://github.com/eshaz/simple-yenc for more information"),Error(n)}}return m};

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
              const puffString = String.raw`dynEncode0128e975dc2c()((()>+*§§)§,§§§§)§+§§§)§+.-()(*)-+)(8.7*§)i¸¸,3§(i¸¸,3/G+.¡*(,(,3+)2å:-),§H(P*DI*H(P*@I++hH)H*r,hH(H(P*<J,i)^*<H,H(P*4U((I-H(H*i0J,^*DH+H-H*I+H,I*4)33H(H*H)^*DH(H+H)^*@H+i§H)i§3æ*).§K(iHI/+§H,iHn,§H+i(H+i(rCJ0I,H*I-+hH,,hH(H-V)(i)J.H.W)(i)c)(H,i)I,H-i*I-4)33i(I.*hH(V)(H+n5(H(i*I-i(I,i)I.+hH,i*J+iHn,hi(I-i*I,+hH,H/H-c)(H,iFn,hi(I,+hH,H0n5-H*V)(J(,hH/H(i)J(H(V)(J(i)c)(H)H(i)H,c)(3H*i*I*H,i)I,4(3(-H(H,W)(H-I-H,i*I,4)3(3(3H,H-I1H+I,H.i)H1V)(J.i(v5(33H.-H(H,i(c)(H,i*I,4)333)-§i*I*+§H*iHn,hi73H,H(i)8(H+J+H)P*(H*V)(J-r,§H)P*,H.i)H+H,i)V)(-H*i*I*H+i)I+H-H.I.H,H-i)I,4)333Ã+)-§iø7i(^*(iü7I,*h+hH+iDn,h*hilI+i)I,+hH+,hH+iô7H,c)(i)H+i´8W)(H,I,H+i*I+4)-+hH(H)8*J-i(p5.*h*h*hH-i')u,hH(P*(J+,hH(P*0J,H(P*,n50H+H,H-b((3H(P*0i)I.4)3H-i¨*n5*H-iÅ*s,hi73H-i)J+V)&+I,H(H+V)æ,8(I.H(H*8*J-i(p51H-i)J+i¸7V)(H(H+iø7V)(8(J/H(P*0J+s,hi73H+H,H.J,I.H(P*(m5(H.H(P*,s5.+hH,m5*H(P*(J.H+H.H+H/U((b((H(H(P*0i)J+^*0H,i)I,4(3(3H(H.^*03H-i¨*o5)33i(73(3(3-H,H+i)c)(H,i*I,H+i)I+4)33i)I-3H-3!2)0§K(i2J,L(H,H(^*(H,H*^*4H,i(^*0H,i(^*DH,j(_*<H,H)P*(^*,H,H+P*(^*8*h*h+hH,i)8(I3i§I**h*h*h*h*h*h*hH,i*8(6+(),03H,j(_*@i*I-H,P*<J.i,J(H,P*8J/s50H,H.i+J0^*<i¦I*H.H,P*4J1J.U(*H.U((J2i')o5/H.U()I.H,H(^*<H0H1U((H.i0J.i§i0i')o5/H/H.H2J*H(J.q50H,P*0J/H*I-H,P*(J0,hH,P*,H-q,hi)I-423+hH*m5+H/H0H(H1U((b((H/i)I/H(i)I(H*i)I*4(3(3H,H.^*<H,H-^*04*3iØ1U((5+i(I(i¨7i1^*(i$6iè1^*(i°7iè6^*(i¬7iÈ6^*(+hH(iÈ*n,hiÈ*I(+hH(i¨,n,hi¨,I(+hH(iØ,n,hiØ,I(+hH(iè,o,hH,i-H(i0c)(H(i*I(4)33iè1i1H,i-iÈ*8)Bi(I(+hH(ido,hH,i-H(i-c)(H(i*I(4)33iÈ6iè6H,i-iF8)BiØ1i)b((41-H,i-H(i/c)(H(i*I(4)3(3(-H,i-H(i1c)(H(i*I(4)3(3(-H,i-H(i0c)(H(i*I(4)3(3(3H,H/^*0H,H(^*<3i(I*4*3H,H,i¸)^*TH,H,iø-^*PH,H,iX^*LH,H,i(^*HH,i-8(I(H,i-8(I-i¥I*H,i,8(I.H(iErH-iEr5)H(i©*I1H-i)I0i(i;H.i,J(i(H(i(rCJ(J*H*i;sCI*i¨1I-H(I/+hH/,hH,i-H-V)(i)H,i+8(c)(H/i)I/H-i*I-H*i)I*4)-H(i)i¨1I/+hH(H*o,hH,i-H/V)(i)i(c)(H/i*I/H(i)I(4)33i¤I*H,iø-H,i¸)H,i-i;8)5+H0H1I2i(I-+hH-H2p,hH,H,iP8*J*i(p5-H*i7u,hH,i-H-i)H*c)(H-i)I-4*3i(I/i+I.i+I(*h*h*hH*i86*(*)3H-m,hi£I*403H-i)H,W)-I/i*I(4)3i3I.i/I(3H2H,H(8(H.J(H-J.p,hi¢I*4.3H,i-H-i)I*+hH(,hH*H/c)(H*i*I*H(i)I(4)-H.I-4+3(3(33H,W)1m,hiI*4,3H,iø-H,i¸)H,i-H18)J(,hi¡I*H(i(p5,H1H,V)ú-H,V)ø-o5,3H,i(H,iXH,i-H1i)H08)J(,hi I*H(i(p5,H0H,V)H,V)o5,3H,H,iPH,iH8+I*4+3(3(3H,i$6i¬78+I*3H*H3m5(3i)I-H*i(r5)3H)H,P*0^*(H+H,P*<^*(H*I-3H,i2L(H-33Á)+(i¨03b+(,(-(.(/(0(1(2(3(5(7(9(;(?(C(G(K(S([(c(k({(((«(Ë(ë((*)(iø03O)()()()(*(*(*(*(+(+(+(+(,(,(,(,(-(-(-(-(i¨13M8(9(:(((0(/(1(.(2(-(3(,(4(+(5(*(6()(7(T7*S7US0U `;

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
  const samples = sample + "s";

  const stream = "stream";
  const streamCount = stream + "Count";
  const streamInfo = stream + "Info";
  const streamSerialNumber = stream + "Serial" + Number$1;
  const streamStructureVersion = stream + "StructureVersion";

  const total = "total";
  const totalBytesOut = total + "BytesOut";
  const totalDuration = total + "Duration";
  const totalSamples$1 = total + "Samples";

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

  /**
   * @todo Old versions of Safari do not support BigInt
   */
  const readInt64le = (view, offset) => {
    try {
      return view.getBigInt64(offset, true);
    } catch {
      const sign = view.getUint8(offset + 7) & 0x80 ? -1 : 1;
      let firstPart = view.getUint32(offset, true);
      let secondPart = view.getUint32(offset + 4, true);

      if (sign === -1) {
        firstPart = ~firstPart + 1;
        secondPart = ~secondPart + 1;
      }

      if (secondPart > 0x000fffff) {
        console.warn("This platform does not support BigInt");
      }

      return sign * (firstPart + secondPart * 2 ** 32);
    }
  };

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
        const samplesValue = headerStore.get(headerValue)[samples];

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
      this[samples] = samplesValue;
      this[duration] = (samplesValue / headerValue[sampleRate]) * 1000;
      this[frameNumber] = null;
      this[totalBytesOut] = null;
      this[totalSamples$1] = null;
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
              let frameData =
                yield* this._codecParser[readRawData](nextHeaderOffset);

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
      header[absoluteGranulePosition] = readInt64le(view, 6);

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

      this[absoluteGranulePosition] = header[absoluteGranulePosition];
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
      this[absoluteGranulePosition] = header[absoluteGranulePosition];
      this[crc32] = header[pageChecksum];
      this[duration] = 0;
      this[isContinuedPacket] = header[isContinuedPacket];
      this[isFirstPage] = header[isFirstPage];
      this[isLastPage$1] = header[isLastPage$1];
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
      this._preSkipRemaining = null;
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

            if (header) {
              if (this._preSkipRemaining === null)
                this._preSkipRemaining = header[preSkip];

              let samples =
                ((header[frameSize] * header[frameCount]) / 1000) *
                header[sampleRate];

              if (this._preSkipRemaining > 0) {
                this._preSkipRemaining -= samples;
                samples =
                  this._preSkipRemaining < 0 ? -this._preSkipRemaining : 0;
              }

              return new OpusFrame(segment, header, samples);
            }

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
      this._previousAbsoluteGranulePosition = null;
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

      // set total samples in this ogg page
      if (this._previousAbsoluteGranulePosition !== null) {
        oggPage[samples] = Number(
          oggPage[absoluteGranulePosition] -
            this._previousAbsoluteGranulePosition,
        );
      }

      this._previousAbsoluteGranulePosition = oggPage[absoluteGranulePosition];

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
      frame[totalSamples$1] = this._totalSamples;
      frame[totalDuration] = (this._totalSamples / this._sampleRate) * 1000;
      frame[crc32] = this._crc32(frame[data$1]);

      this._headerCache[checkCodecUpdate](
        frame[header][bitrate],
        frame[totalDuration],
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
        if (frame[isLastPage$1]) {
          // cut any excess samples that fall outside of the absolute granule position
          // some streams put invalid data in absolute granule position, so only do this
          // for the end of the stream
          let absoluteGranulePositionSamples = frame[samples];

          frame[codecFrames$1].forEach((codecFrame) => {
            const untrimmedCodecSamples = codecFrame[samples];

            if (absoluteGranulePositionSamples < untrimmedCodecSamples) {
              codecFrame[samples] =
                absoluteGranulePositionSamples > 0
                  ? absoluteGranulePositionSamples
                  : 0;
              codecFrame[duration] =
                (codecFrame[samples] / codecFrame[header][sampleRate]) * 1000;
            }

            absoluteGranulePositionSamples -= untrimmedCodecSamples;

            this[mapCodecFrameStats](codecFrame);
          });
        } else {
          frame[samples] = 0;
          frame[codecFrames$1].forEach((codecFrame) => {
            frame[samples] += codecFrame[samples];
            this[mapCodecFrameStats](codecFrame);
          });
        }

        frame[duration] = (frame[samples] / this._sampleRate) * 1000 || 0;
        frame[totalSamples$1] = this._totalSamples;
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

  const codecFrames = codecFrames$1;
  const data = data$1;
  const isLastPage = isLastPage$1;
  const totalSamples = totalSamples$1;

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  // Redefine these in a --pre-js to override behavior. If you would like to
  // remove out() or err() altogether, you can no-op it out to function() {},
  // and build with --closure 1 to get Closure optimize out all the uses
  // altogether.
  var out = text => console.log(text);

  var err = text => console.error(text);

  // Override this function in a --pre-js file to get a signal for when
  // compilation is ready. In that callback, call the function run() to start
  // the program.
  function ready() {}

  // end include: src/flac/src/emscripten-pre.js
  // end include: shell_minimal.js
  // include: preamble_minimal.js
  /** @param {string|number=} what */ function abort(what) {
    throw what;
  }

  var HEAPU8, HEAPU32, wasmMemory;

  // include: runtime_shared.js
  // include: runtime_stack_check.js
  // end include: runtime_stack_check.js
  // include: runtime_exceptions.js
  // end include: runtime_exceptions.js
  // include: runtime_debug.js
  // end include: runtime_debug.js
  // include: memoryprofiler.js
  // end include: memoryprofiler.js
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    HEAPU8 = new Uint8Array(b);
    HEAPU32 = new Uint32Array(b);
    new BigInt64Array(b);
    new BigUint64Array(b);
  }

  var __abort_js = () => abort("");

  var __emscripten_runtime_keepalive_clear = () => {};

  var timers = {};

  var callUserCallback = func => func();

  var _emscripten_get_now = () => performance.now();

  var __setitimer_js = (which, timeout_ms) => {
    // First, clear any existing timer.
    if (timers[which]) {
      clearTimeout(timers[which].id);
      delete timers[which];
    }
    // A timeout of zero simply cancels the current timeout so we have nothing
    // more to do.
    if (!timeout_ms) return 0;
    var id = setTimeout(() => {
      delete timers[which];
      callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
    }, timeout_ms);
    timers[which] = {
      id,
      timeout_ms
    };
    return 0;
  };

  var _emscripten_resize_heap = requestedSize => {
    HEAPU8.length;
    return false;
  };

  var _fd_close = fd => 52;

  var _fd_read = (fd, iov, iovcnt, pnum) => 52;

  function _fd_seek(fd, offset, whence, newOffset) {
    return 70;
  }

  var printCharBuffers = [ null, [], [] ];

  var UTF8Decoder = new TextDecoder;

  /**
       * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
       * array that contains uint8 values, returns a copy of that string as a
       * Javascript String object.
       * heapOrArray is either a regular array, or a JavaScript typed array view.
       * @param {number=} idx
       * @param {number=} maxBytesToRead
       * @return {string}
       */ var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    // TextDecoder needs to know the byte length in advance, it doesn't stop on
    // null terminator by itself.  Also, use the length info to avoid running tiny
    // strings through TextDecoder, since .subarray() allocates garbage.
    // (As a tiny code save trick, compare endPtr against endIdx using a negation,
    // so that undefined/NaN means Infinity)
    while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
    return UTF8Decoder.decode(heapOrArray.buffer ? heapOrArray.subarray(idx, endPtr) : new Uint8Array(heapOrArray.slice(idx, endPtr)));
  };

  var printChar = (stream, curr) => {
    var buffer = printCharBuffers[stream];
    if (curr === 0 || curr === 10) {
      (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
      buffer.length = 0;
    } else {
      buffer.push(curr);
    }
  };

  var _fd_write = (fd, iov, iovcnt, pnum) => {
    // hack to support printf in SYSCALLS_REQUIRE_FILESYSTEM=0
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

  var _proc_exit = code => {
    throw `exit(${code})`;
  };

  // Precreate a reverse lookup table from chars
  // "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/" back to
  // bytes to make decoding fast.
  for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
    base64ReverseLookup[48 + i] = 52 + i;
    // '0-9'
    base64ReverseLookup[65 + i] = i;
    // 'A-Z'
    base64ReverseLookup[97 + i] = 26 + i;
  }

  base64ReverseLookup[43] = 62;

  // '+'
  base64ReverseLookup[47] = 63;

  var wasmImports = {
    /** @export */ "c": __abort_js,
    /** @export */ "b": __emscripten_runtime_keepalive_clear,
    /** @export */ "d": __setitimer_js,
    /** @export */ "e": _emscripten_resize_heap,
    /** @export */ "g": _fd_close,
    /** @export */ "i": _fd_read,
    /** @export */ "f": _fd_seek,
    /** @export */ "h": _fd_write,
    /** @export */ "a": _proc_exit
  };

  function assignWasmExports(wasmExports) {
    _free = wasmExports["l"];
    _malloc = wasmExports["m"];
    _create_decoder = wasmExports["n"];
    _destroy_decoder = wasmExports["o"];
    _decode_frame = wasmExports["p"];
    __emscripten_timeout = wasmExports["r"];
  }

  var _free, _malloc, _create_decoder, _destroy_decoder, _decode_frame, __emscripten_timeout;

  // include: postamble_minimal.js
  // === Auto-generated postamble setup entry stuff ===
  function initRuntime(wasmExports) {
    // No ATINITS hooks
    wasmExports["k"]();
  }

  // Initialize wasm (asynchronous)
  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0179c5946f1d­Ä>º}ÊÄ%®z¦IGUn5Or/ñ)÷6yú=}{ üÎwûø@¸îqÐdµ»ôæ¾Xf+gúÕe2ëþÞ5=}\Î>ä=Muj ðÎX¼¬·¹nuí¸3_«ßLÏýU¯= C?hXi°$²OÆ¬´KeSäÔkf®RJþÊo<Ì¤@8@uw÷©«ýºGßßµm¨7¬¬¬¬¬¬qNÐ®´S.^GïPíðNpÎ®æîTVþ§¨Qísüee+.ÜèFfÖZç_¿og_soß06 RÞÑÜfÌÔ%Â/eVéw= ¨Éî6ê@U/'fÈ8vpçPûl¤g:çUf;RÝbS¤Eû8ÖHÕ·&UÞÀ÷ØY-+aRÑÈçAØ%[¾"÷<=MÿQÆwéÚs28aÒ«vF¶Ìþ¹RQÄD¤]È&§,Bm¿ì 2£ 	5Ñ©ªM= ôÌîAêrÚmI*=MÌ= !©oMc¾B	Îïû$VÅPÆ= ¸À5JvÝ2¼V7= A3=}»KGvûÚuZa­­Æ	ÇgdRlÃÏÛü"+ÝÃÄ^[ªÒ}O»LÖíb{þB\ÑÀ¡|æ -ÊªÇo£fñ®ªµ£/APãç«/åJ'2Å/õ(,rb9
	z!¥rCêÆª=}ðõCg¨¬ç:þ
<AÖº²Þ§)êÔÐb¢M%¤ñMåÒ{|3ºàú§4ÖÿÖÀ<¶iy­Ò)C&y%ÂàE÷fhe-E8À´5ð ÑBh1dGv¶ì×3ù>ýï ïDfh©E$¨q2«s,Z§OY|pø2!ç¡ÆÅjËÁ8uìw<|+åòÇT\ÆÒ·1(*ÍÍ:¦B£Xz%üí¸uÒYh7Q$ûÓþÔÂ~õ"RàýöxUx óaÇ&?"ÞlPzEácw*Ñ&UüBÊêp¼yµ5?!Ôk¾=MÚ0lvaô²ÒÀJ7PEq~ð¹¾¿~s¼£ÿ&¤ÀÌDïvÒ±nIº­¨þoâ&¤gðJ)CUø"¥{'¥DÀq8i0¶7Ûá]»G@7P,Ü}iÏÇ¶*=MXúªÄ;Ë4Òç¿23¸Y£+Q&² _O¥.Ùó7Ø·O´@ÀGnÅcÜ°çb%6¨c89 e+éôì+àRÄ= 'Ù®³tú#sJ¡)¬kF?ßÊ ÈV¢Û/5p}ÞDÀ÷h§¨±jAè´ÀÕÁvë\J^[=}ª­$Æ~DüÎf sþÎÊ ¯.óeQ*¶?©»û3+´M-Í$3dV%}rö\£q_Z[U&ÌJûDaÃ=}=M
¸¯KÌaQy¯BnãgSMÃÏbPlÿõräv<ù%ôo	!ÂoêÛµeÒ\???|
3?V'@J*ÆíåHíü¿?Õe°<áZ6¨ eÑæ²sîàV¯]4¿P¨NÂ²Òëî­å¹¸Ökð®³¦¥oæßB.´æÀHn&ãcæs|J<5JJóM²J¹.ÐbÍáÝïºÀT= /ÓEáJP8Ô.Ï-K/¿?KYÙm¼»Û ºUF¸I(¾~9"'Ù0|ÏÝD(è-ü¥ø~÷»Ú[­= Oó[^ó[îÉíÜòay c-s6|T2^ë+ágOMJ¦ÐÌ"gÿ0ðÑ,<·oÄ([±ðhüÚmá[ÿ·l µPNâLöQ$òçéUi1¨(wÀÚdöé±ì®~çiUi¨·sÙ£||çä=MüQ KÅU=}¢ zjePÿ«
®ÑXtBdØþýÛ\ÿ¬tS%éé¦²ZiB¤§õè×ü¼Ùù4ÒU¥)°Ô¡­[MF@Rê£Çµ_4¨eÔ£º:j|híÚA¸qî¿JA?j5= 6j,C,ÂquâUÓÌù-°Ì í$±y,®)h¶\ÒÔýý3PvqÈô¨[áïoìl:pþ­¥L¹/jéÔ_¼ZyÒgp%uyÊ÷YéÐ+èõch÷@Ü³NyÓSËêkÆÍ×s$¤Ö¯¡gëÃl\¸õ:ïßOÉàîLcl8ip4n!2qªdªI&à'u^$ÒÄºösCNLèËÉV2@!À}Ü/¾lØøsBÀ4!ÏÉ62m Hxs(É¢­q3®nÐØ6eÌß½9ÿ_è×c?àq³mn° ÷ñ³Ôhdc¤X­á¹¤¹æÏÅÄ wMjP7(Ô Ü!¸xs@MÒìSÜù{¶±ßAdòG©~ ·gèÞ6Ë= &m?UõlH7DöùÍ5GE¿©z·s´5Lgzã(6eQ ¬ÑÐU|ÆN+w=}rÄvH éïg²XóU4F)þ,@Í*1@õA<;³50xgôèîn×ñLÜñ Çx_Ë´µh°HóD V±W¥isÜñ@Øvrså1ðõZk¤Uôöì1Æd_ªI 8p*hãºVm8óah¥Û#LÃÜ:OÌ\¢{f5xL×ÕNÏ=MÿP7_¬= ¡^Rù:ôkDCºçQÓ­aÕò^H\*Ê0Oe9NÛ»ý?1 èè1ÛçßÉXû7^X4­(({mtØøhBGi£¹·rß{$Ïà[ÿÂE8ntb¹Va÷tUX!S&f= ÕrW9ýfêÄXvN(8ìBd5L>PÓ÷gll<É|k¥ð÷øZè¼é+OØ~%êhWlm µ¢-1ØGÉcÆso÷Z\'Ï¿JOQÒC:âïL·rN= ÔýzbÙr+¢Ô%	
÷BÂ2þásL1QéÕeGÁàµGÃ°8VÔJ4üÍ~Å¿³u¶òäí¤ Ïuåvw¥X¿Ê½G×lf9<ÎÿÞ¸Ãö©?Æ;°bÝW¥ç uXPíK0bÝW¥g-´-°baã³"bP¡ÚzEÜÅK½;â;;ÆÄ¡Z+Üj­! Ï%aË§PÊót ë.ùj×8®õa°dgáiÝÆñ+.iÝeXÜIiý¯µRÓñ«ÈIiý¯µúûýÒ|òý¡­û¬Iý¡­ÝôNðBëí>¢*0ÈÂ÷efè+@TÍ8z¸l|Õ^vÇ\@kT°ö³µ6Áë]ø´æM'U;]Ç#øÂïÑûÆHxñâ4*JvIÔ§ï{LuÇí^EÉßó3þ×#X°+Ú©£ÚÎ£
3Ñ@nû­,aßÍâTT¦³Ëâ÷JF$-9rÃ°Óí°Ëbßgß£VãJVÃ6ç(Ãø3aw=MöÔµå6tZÕY´Fo§~úåJõPN=}à¼qµ²
¥¥
+§
µK#Â¦ïGr^N@829¡*¤Ê!ÕÂ'u¯kÖ]!ÁÈX4
öäÌÞDí]û*+ÊðÅdSõp§= ÂOø/VÚ5 ão¿gÃHÝg1
?f®èÄ¿+YÆO!.àP'^&ßÁ×¹©  "ÔQMªqNåèTñÿÿ=M*àtÆHrÈ°Rö²è¿"ò:7f£ÌÂeèT)$wþ¯ãF£XÔ³]º=M ñH<fV6â+J®ØWÄr"áXÄ*QÔ0u¿l0ì ñÌÁeP°.ïð±jæCú¼Ûåd£N%Ø7ÖÎ8bÎ$¨ÕÀndØ.³ÖÀnÐ&·1Çcï¦hrt$-I8}¯û9Á"ùèu³õÁU}M»= W$=M0vC£Éÿnb-6"Ym
û+Ú¿¬CÞÍ@JÜÛ©Ec¾ #RÛUÓ¿=M.1¬Fp?_ôIõLõè<°Ûw"ãc?c_'L÷¨aðìõKx#ûì9Ë9n©HjYÛ4Ié«¼öRªð!RJ~2´{×ÌÀÀô¬K	ZíâÌ·ýÛßÛ¯ÕýªU	Q«-éeÚª_.½(+}¥çªfS¦Ö4>-0ïeLVÛSoL¯0W©.M&zô¤uì¬WÖ»ÖX¥ðM+ôâzFî]Që½g ¡i&´Àºu¬2zdC~ÞgÞ#è¶î%px\Má3_Õ=}3ëL\4°×§Íz²v3cËúIäB>É@â°vx½¨ÉhùJv|Ù]îwXÿËgíÞá+ë51&»ÂWpÿk¢W~÷äIÄ²si5²ó!"u]¾nØmIè±v¥ß'<b K]÷?È«án§ð*Õh(ôÚzº)¢Åà&V?Å#6ä-8¢va
²³å:µÐ GÀP¡´+û¥-d>o6.øç3]p4¡ÓbÜá®Ì		äèõ&u7.0å×ÑcæÑ¦"à6Õ9Þ$¡Óu=MXÏÀnêÆ(H(ô¬áâ+A¨,¼Â cCÌîGcO_»Ô
ú«ÒÛ:{L dØÙ¶äóßB'ÞÅ¬ôÖDeÎÞÅeÑ»â®Ôc8åÜ¸xì*9ë÷N5zð$÷|EÛÖ/B?\z£8ê|PØjñÚUµèsbAçÉ·¶ Æ@< O´y63Ü4Qtùý= OGÍÔAhNÂXÛbõxGàx4EKòY¸,]ò,£PEµ¡ç2¡_3urÚh¡Ä´*E¿dãÓ¨*:´Ä vÖÇîy3ñ°þmKV®%£Òµ0WVãÑ6ÇPn]æRÆréþP e¦Dàq8À1Øl¿{+lqà)B£f3W0n/]JêÂ§xï¦÷ú~BLïNÎØ°þ¯ êa°Àã÷ÃÁ@[Müj< ®³ ¡ ['ê3&b¨1ø=M:aImÖ\õx¤ßô! ïÆv÷mÕN@ÃqÀZ?2ÊdDk)|÷xSµ
8Ñv3xÈòs#2¤DVÖ{#»sç¡Cb&ÌÔ&ÌëF4¥PÝÚOH3Ò´´³nKÜX_/ÒJ²^ÿÕFM2ÖèÇVx[>µKUÿÚ¡e*ª¾ºÞóÂ_BÃD%_£b$Õ¶~>H»·0mvÅ»uz{¸0ÜKZëÝs*Nú@Ã ­³IîÑ2f:+$Oe+»k)ùÁ£Ê&W}41
)eOß³È^ñâÁÁ8ËØÛe§Uxí{-gí{-GÍ¬íI¢¹È0Ôápÿï= ©BÚQÚÓ "ÿë³
%<T=M/4_$(y.
:ÙRW:)ÿJi¯ÿA§ØûÓH­ÉÁ»7¬XènÓj 9gí$WCÆo*2[äÔïüÞ¯X&= Ø°¼ PbªB	mçRÂ Îìvm
 óåGqUéæºìÉôÛµ]Ä@"xXºmÐØK¦àÔ¾kÞ½RæN"vKÎs3¤/Mò(/¦h!SÍ
ÙÚ}íy vÍ'äÑdçéÚÚßQÿõ7«UD8ÏX(ÇÉXí=d{ûM¶{n&Ùn&ûÊX£Ój0Xq2éj4náM°»ö|³¾a W»4©-l¸#èiÅ:@Y)¾!è¹<²ÿA?s7n¶ÉÁ»îV'h,¦dpMðò%7È2)í-s@cK5"$}6íFI¤P¶­27ý·îöÖ1÷ÖcÏ\Ñ.»æâIÛtX Û®ý_(Å-.¾ÜÔiZGðÝÐKMê/WçòÆvÌ´©Üu¬EH¡²,HToäýº þ!SËtúÝÔT¯ßV|ÈÏ³%OzîÌ\µ¦¸BØLÐ2fÿ¿Ò$2$ÉñÈlcmÆlÿ¢_áAJ)tÝür|½|0F;÷ÈR,&çcº·ö YOáííN«­R;û=Mã¶½Ò4­'¥>|> Lß³>b5_F­Ü³ïÉl= j=}­ðéæ¾Õ,ðË96¤yçÖÎ1î:b&t¢Ëyÿö­5ÿ0Jib{<Zq$Y{¶ËÙõ=}<_æ9ãà9©±¾~|y[l$z*4Cîø#×N$óVNê­Lë$«|4	þrÚêg	u	{AdgÅº=}ÀÉÒJ~ÏÖ¾Ã9e»]ðN¡ÑÞ>~Q9Ý$aYrGÐ03WdPRÁsN&tø÷g²= ôç>àOÑùÁÃ>­°+ùZ5¯ÙàPÖòû~Å¶RiBÏG´ä«Ø Ê¬u¯~Ðkií0{kéPYî¿~p=}%Dü«ß>²B~OíÈéOãÏ9Ï,ËëülÕ ßMé»[POº¬ÁÊ¾Ê8:óa¦Y~míÆ~¹>	É¡*¨Î&á£9òû-è¡bJ±ç¿õÇoö9yÐþsÇÂïá0õìÕ³ëÑ{$ÏÎÙù®¸ËÌÆÂmAãØ®Þß¥X"Jç»ãtÜÁæsIà¸aº®aÂtã®D'¼mv´þ÷,GX¶U»cÙó+¨M¤vÝióÓ]÷×ö7(bë¾E9µjKnó!ïYlÜêOã$)a1| ÿÁ§« F¼Tç\lS¸Ö8(WÚÁpÁØÌ¨ÝS8	f¬niþeÚ;þ¥©.ôTÞ#6	.Å+«ìÏòÂÙ?Â°×ùQ¦L¿ 5	°¯²°4{di'é³
PXj?RZkP\r@
ÏP0NÎÔÊH{¦Goè>Ùb®]tÿhX=Mõý}pÂm7@Ì%ÍLÌv~æIæ=}­#:!K8ºwvö"éÞÚaÝíù«4«Eø Eº{ Å¢aÝ®ñULXëfÕäÂ5é¦xú=M·ÙùêP9D"YôÂ9SÔÝU²¨5
²¿Ð{²K@jÀj»i²;]iNYX#¬ñUØ¶8ÏAà´¨Od>e4@	RH¬\gòòÓh4ÇvÐGÈ³ªjt= ®qsrkMòônµQÆS7Úï'qð¬á¹Í3© YN(¦Hv^8xV8wghxÊô:7pXutàxcwlX7p$e$ulÄMÆWßíé ÿ]_l.A	i÷dTY3N´æ²_óí;ÂµkÐ}Lú?
J ñá1q¨¹²7=}LyçµuÚ<¯¿Sá%×ç´Q¿OBeÊõs<CæühsP'nßñÛ±ncc*=}ôó9u,ÒåIä
×?ð¸pê=MïQ{¼c×qÒmÞ3Z£~5Ââ½?ô9I+/=M
l	©öe]õAªV^YBõÉñqýzÕm®±>ÚÖ<$ökø©YÒÁÜm"ß8Ïd«,
Bb²5§d÷Kún,Iôt,%1råâ%1÷/]@,û¬¶Ô£óÔ´Ôk<f7yMØ¦¹nîP6VCNbqUb»wGËJ
@ð>Ù=MÃØ83=Mímú|S³ËØÐa/³¿·
ÜÙËÒ÷ï¢^jI¿³\ùt\y#ü¼'êÐ²alOvêF#²å@Ãsy³áw­Æ<ÂK÷ôù@Èêïµ>µ,­ª¶ÆÕÿRIl³èÔ¨F8Yuló«ùÖäá ÿâÜn,§ª|mëo~R°áËæt
º)µK)óD¤*z¬½Ú¢Ì^ÃÒr¯ÞFnÆöSazXåUÞè¸å±VjNnX_»g_<zc<oF+$ûLé%Ñ!¹£3¿ï":¡«Ù­¹­ú×¿c<÷J/V°jö!¯¼NçÖW=}ß,Zo¡sæòU/½tMO,Ö¢¢+ÖµÎÎ3É¬!9ç¾%*qw1k6'òmÁ¥»e'à=}Ê>«¥Kæ=}{;ê~ e· &â=M?óE¯Eà/öþµæM¡øh¹s!üVÛÈv$ÝQ+tMàìLá"yf"ª)q´RþÛÙ¯ò&aµ+»lÜáõßÄ¹£-_mÝ§!È¯'r°	ùÔ+Á[Å
 ß¢>nºsÉá¸µ<ôVå~ Ë8Ã,9ÍÌ¾Y;ÄéÜ9«Në/ý×ô#«õ²¢c¾O»FX­D¯DcµäæÏ¨ÖmBåqäVÒZZ= xÂ4Qà\Ïùú1 8o§ã<±1zn¢.×DiQ¼á¯Ö_è÷Á°º´D@Ö¸ª$p=MÁè·lÀÛ}^pÌqH¡~ðÇ^¶Æoô"l"|]bsHNZÑùS,ó|N|/e¶Àj\¡këÉ4böE·4©ª=}¯q6ïIÙÊñõ(doÅH9°1H"Ñì6=Mù$³´þí[4wë?¨P:û§\&ÆZÝ')=}=M|ßûßamBÞ¡ZäÊýKV?²zvõ;·´4©ÓûöDØÝkH¦%W­8)îûJÙm¥Ù½µ;_ C<Yò×Q=M¤wN¡ÌòÀçd2#<Ö½ö¹þq!¼Üü¼îùI!'P<BEZ³PÛÕÁÏ$<íO~|ëÃ= ewCÞpá)rn¤ºéÖIÝ(wÜ´õ¥|é
g+'KÿHh]×~>]ùÓWZ lÁ)6¤fPÛõ°].½³mcUê¨bðo©ä N)Eâ[¨e¹Þ ©ÌäÆ¢0¡ßàõÇfh±Àì_-Þ²¤|!³jK¯Éi	j@96y¼/w(PömájÞsdó¸Ãn= ¨â«ªYì)2¤zÿ(f :&µÉZRõÛ¦6L¨Áfà~ïò kÂsúì¬g!0õß%lNÑÅJ9ZÑi·ðÇ_h<[¦û¶}{÷ÔkBÆô)1#h§(kÙ\Xå¦Þ¦ØÒGµw¼»qx®Aå}(K^D1HhÚ° ìqBóØ"Ôí¬¿PBãà%SYD§£ªP).«ÝLrÌkÌklr¢|^+H2ÿÉéÊÁsgLtn1îñvó¤Çu­v|:tÎý2Bú·} ArÑït°
²) ¬Ù×Ç/w§ ¦Þ5¸oY.T¥³Sö;¸_iRA6 ½	pYlÞÿ£Óá7½¥ñéÆIáènûÆ÷²0V§5­oøFùxB;F«z
»aÞL¦þ0éþEèÂ_§¬æ´³1ÞsË.?O|÷	v¦|kUMô¶[|«Lö¬UOÌÀ²6tm-@VÍuâjg[àW7qRâj>HÆVÓ*Ã¸OA°NqämþMÂ{Ay[&ÀF0×ê°)ÔYÔúÉC¸F^ù¶pl»ã¥Ñ¼_â)WéuèSÙ!º/V¼¢Cõe)éUýØhBÔfôNzÀmÈ=}l¯±¹)ÁFY¡©Äc}¤5Q	?¨Êóq/±&wûµ:rH$¸g¹m'¨m¯÷Z£yY¿ÕFc¨Ì.é¤cþÊãÅ¢ÉJ?èõ= X
ÈÉÒh×æÔG&|â®±YÝÝä	è²äðw0©íëùpÐZ£Á2.ÁÌÅçUÀf$8b¼Ð¾ô¢»ã¸ú£ÆDÙ2×ª ©â,}÷Øú6¯|Ï7|úÎs²µXi#<º¸]ÃH4ð¼m|;T2º0&[ÿü
1·=MIDY '4-qÇÈ.+Ôç¢ÄF½Äô»Èaï:kJb=}.®ëþ]ÚnÚñ Co.× G»&P=MÝÞ =}Nî/TN°z¤ßNÙ0Ï¹Ê>H¾JM »OMüÁ9ÑÒ¨öÑ¥ÅF_fÛZm?âðÃv¢Ô,D®¯û¾TGÉ=}D·~1Ý ³ÁKvPÊÎÒ5º|bV¹î*º_¼£ÙGõ\)Ê^Zîåe]®[gZn´Çzúl×8¸øl§vz×©OO6g£e\¤ýjn¡ÇåÉc²ùçñ¸»ÌåÛ¿)}ÏªzÄÂ)cm'ÙÎ{_­L÷F%Ùn>ûøsN»©DâÚi9æ6+Îv0#Z²Ý:VÝgì;«m9°BDzäÚÛC¢N+®#Þ}èùâ=Mªà ^ +ª9{3,»¸V:ÚØê¸ÉD¹Q¼¤RµFÊ¢s£Æî¸(Ií«uõµ¢"+½h»qBS¿gµ3j½?û/ìGA$@Èé_ªÄ¨Î1RIöúlËAP¤(SÚëÐ$Ðz,nýA ~Ï# .¿þâÞ¶óFøH®ÒÁ·]Ê¨rjä	ÝL!ÀöÝãU£òl^ö*~TIQ>!*¯@±û¬OÌêt¢ªÉÍ.ÓI]QÚ¨Ïâ)á|pôf«øQÛÔÐð|ÖKs!;B~$eO£$ì¡ ì9wÒâ¢a»4þ= ­@Z L,³{9þÇ)<"Ú÷O
ÀèK6+?*Üò$ÞåÍ=}ÅE¤#4]¶jÀ¿¯ß×ÆPDW,"6?¸ÅÎP	ÖzRý%È|þÆ´ýÞ§ £®5XÇËS]Ë»ðndÁÇnÛt8PÃ|ñó>÷é ô£-Ý¶Íiì\1ÕýdýN=MN³ñ[þN {= ¢ùü1ç#ý2[ùÏ2§ïÉVFÎ¬2Iyß_Ó4Çpjþh>ã= >Lü<®AÖþT%&\É¨ÚÐlOû'[B+^.#påÝ= 4rþMÍ¬ÎÛãý×©w©ÕL2·ý³Bñu= Ù¨òj÷~}­Z7*»fµQÉú"îDü¨Ü®LUø[Âd£XZCF«\òfÿ5¬kï°]¶­_êèê³	Y¶¨ªÈeÉkW%áªÍ+á{*!ù<uA¬7L¾$ER@gÓªÜRÙÃ<I§©OS·-"&/®SÏã;ç­iòúÈ(Êïõ^»ºIªñ3ÚÁÝ± @ªÿôÙ¹¸7bmI[Xì)¾/zKùiB§Ùfk¿¤æ¾_âE³­ýKâ= sé~·c£}JÚ$YÌ¦&M^îKs²Î·cÃ çÉrX­inûbìÎåk<÷Ò§fìí5³ß^nÌàn?ÈX§«=MºL4#ÁCµËÉ*ÿð¯üòõbTÃ¥kð¼5 nKô
ùQÀ&ºu-súá·f½ÿ7qW(²Ü´1å´êU¨D­0ÀÔÊÕ\¿!eû?<ÒGEN½)3EÅéBÆQ}°3E®³³ÑâÆ,HE,ÁaÐS,Sð!½eYóIQÅÄ":[×)]~P[¿+5ÜUR}E3lhúÙøï/±wòÅØI#dè»¯¥8= Úû÷~Ý;Ñ¯&NÔY­ÈifAâÇÃR±& rY:âu©ì[­±&ÑZ­@Y+³Ý¨*xËÑfg÷´õyAåZWÀ~#GBÌÉÿ¦JyI/6ùVÜi¨iDè	Å·x{âÕ,@+ùógÞóAcñà¨Õu}>6WüãEjK(´VÉäGÓÙ=}2Ý rºgQöM±A16ôÝf_"803Ûé´¬k= 6wëË®WK8Ò¯ïñö?}ì!²ßAÂ9 	VÒR06µdªé|¼q_>%%_î¤÷6%þI¶,áí4->5§Èx¾W­\T¬x«ècjf_3è0·JÍ@¾¸Eëõt,Å¬´'qP¢äwâkjf^Tãg +xÏÂWw¶Àm_:$QIòá1îü§DPOÑ>6]hî³=Mo°³(ÁXR ö;	pÉÃ¾ ß0D(f¹a]ÚC-»­Ä­M¨O%üÙÆÝç¹ó«>¶!EÑû¯¢>ÒÚß¼b§Ø,í= °3&>¬>Åï2>IÏWéüÐçyÌ[¡§nß	ñS[p¤ÏõÑ.cêÁô½[PjoWË§ï"Ã®öð»²Ã#¥=M	æÏ¼³I©#)àu>Ò¬ªÑR[×lñW®Pý (ásvPý­[¶B8´]èX«x7]XkàAðEøD¹uªXXä·¯åË?õüuµ^3öööÊ32HÜ¥Ú:Ùb¢	Çúeæ5VWýï4	QJ<w^[ð÷Ä3|~­àÏ(nÚ½^|ký)W6¶&tå-¦bïdÉKkU>'!?0¶o¨vµoQ	Á»9À,pðïfe¡Ñá	:rgÈØ©·²(ªWF]ÔÞ¬+~ß0ö£DQúÞeýÞ%#<ÌÒ Dýe;Hù^ÜÄJaRçÄÞ_A¤êÙ"¿(]Y´âÁ.'k;'Â5©6LRpdæÏA¾|×d%©f;zÞ{÷èy÷o}¤%pç°pÇQÿ¤õY}´ëû-
^ÿfúÒ:G§ÒÈ£;u-½BÕ® F¹T¢%= I6ÎÒlCz^ÙÃ´!¾÷OÖîÈ¬ê63C.Y-Ppó³*Äíãó*=}¼¼/%d¡I«b°nTùªûè Ü¡´zø3¾ã¥hJ2nï¹¬{±W×ãÙåùçeªá¯®º,ÌIIF:F%+j,$;ÄcçNè eÁª½\ÐZÔ°Iü«ºûD-qËµ÷¼ÜÒZÌêq*qªqBÙß6Ú ¶ò®½?'N°»r1O/©á*kæ>É¸]µkM+YH° òè|VþpÎ &g=}N|t¨l[= íõ!Áé¶=M=}&ÍÅÀGþ¦*_Vâ~Ú8Íºsq!5Çc© ×ëüI-"°æSV£Ç´»] µ¡:#ûQ\üFtÞ= +l Ìèi5æ-b
5Â hläJÌÜt¶1²S²ôÎhPSaÄ ¾Âµ"Î·+2vÀã:ÿoBoP£°08!þèåá¨åxÓ^\Tø5Ïµåá¨åxÓ^K_o-itSÄTxÏr]_o æá¨åxDÓ^LTøÓø)6Ý+v(áHæçx²¦586Ý+vNÓrÙ¼ ã«çK¹õß(¬©	o8ÝfmIÕKÑtP3ë±(Y·Í># ÚõI²%ú á¥5ÃMÎ©gAJRSÏ=}{§=M²(µÁÞW\nVÞÇUc½ªñ;ý¤WÃ6GZU+bMÍZÝ¥2´=M·d/gK+ÇCûÔvÜÈ£Ä9iÛ?æO×ö5rÃ¶±Í?|=MÃ©;^ ÃÙV±½NcI°Ð·ån^êFüMÎI¡MÇmK£×òRlL!)åø¿}ßþ(Ø¦\Äc y=}ªg²I-ºÏÞä¿TRzÏî«®Ã²hnÊ&mù±õìcyWít]}ÎG#Ë(6¼HÍÝ¢¬¦$oD;¢90%ÅO.÷{Ç°ar!0ÊÏðtÑÇ·úð²=}&Å»g¸oø´õaÄ¶îkc}m#»yÌúV/Sxl.Ä¤qxW+Ê³9ÉÄf	òIB ³´¡ì¶eÎc=}D'=M@w+D\ÚQb38J¨J(äìðÃ0¼°!3¦iÚi±íîDy1)¶ï@MGã?MÛÅF@ÍBõªé¨æÊ"<
ýQÈ¬#:}iB}é5´ ¡¶ÆõÓÇIb$ªÈÛÖk»D=} ]úªñ&× ü{ECÍ	b>¹gÙ»\7s2sû= ËÐÎ°è¢6)¯Ö®¿^f§þÆ-mÝe¤îtCÖic^ÝCmÂÀ8q£PûpZ´y]ôÇp1v=}3.Rw9Jöéâ±ÁÑqL%(À{ ËÌO£Þ-©Ísö6Ó@ifÐâõ=}0s²nL
_üzüH~ðtà3þöµÊ_*z
)ÉêtpYâa\ õ¤êU¢¸Æ¥= ±¦'À ÔC?}¾Rái­MèSíÿÑ£·yÙSÔ|¾|eµ0
ÂÊ{)8úó¾µw©öjM$¹¹ x8çW<©ºF33OÒ÷q5õ$|P¦\vå"äy£sºJ÷b&eA|99oeéYO¬·¦ôHóÉr¸_'y-Bwwõb¨bÄ\ÒJß6¨À.4?$BSRÛé¹	}±ä = ´´é:ªééëÙúy¯¼±{}Q´5)¹ùy²ÙY}©9¹Y}ï$×Ævw¦øxAô6ÊîNíîÐNmÅðFh'c:×7¡ÿE²nßíÿ;·:¾UÆL ¥> v!Èaì=}ö;cÊý,Äsý.´Y+t0YçëtýÀéý£åÁÑ	H
;/Py+AÚ.¾&?QN,b[Æ+KåY³1ï+'x8®gÝÜ±A
íôe{k´¾Ø:Àz$$%xDræ3zDhÉD~TT×¨ç¶Mhñ±4ÏÈÃÃ°*XüÜnà²CB»ÓÖÿKÞ*þm]T/¶ÉPFræÍ|ÝU¡¼)TÞ/= ¹NêâEªé¼¥ÝÌÅã8ef¦áûá>.ÛJçö,KZ[ï8@ßV«Ò)â.â¯=}Rm²ÎÈÉHÇ³ÎÿmÒì+Ê&zß«7Ìýëój±ÏA§¹4hg3Ü|a©×ØXê¢5p¬u"wD«¯XWÌy²8((ÕÑC!aÉáù4°9¨ü}J»bÝ9í|®;h&ÚgÖ¼¾*6*¿Ä^¤oaøwæj-ÿ:tN.ºcTÖ5F4·¡Å_o|èëbGbVUôó°qÖ>öW$Lu9{GÙh_ÌT¸âÚ*«Õ$î%}Ýïèÿä«0|ìôMT«0h^2Ö¯S|<Uå¨HfôVUD³0ÌòaUhÓScdÇt6õÿ%Sg W9HtQcÈVó^¡J&.AØ>v§ÓÎ÷UjdNcÁ{äð°i!-ÅöÅ;rãhã6j¹§T;*L9²ÓÃIÝ'Ôå#OÌÔv9ÕÆÖv³êÌÏ¸ÿ$ 3sÂ¾À¤éÚÄ)sâKc JNHç÷Vp&ùNH©§\ê**¹7sÊä|$¬ÝnLMNrO³®çnLÕví>«æÖveH1æ´ÈÄÖåÚÈêÍàW¯òkÚ9¸Û>$ÍÅqÔÎ½ÕÀW¥*{ËOHaÃ§>dÍeÁjì£ïq£}©ðÕ°áñË5¾>¢W[:ÐÔ¦@î ¶¢7Ðñ$Ë5Å>ÎÇÕ2\s	ä.ëÍõ7Ï@ä^!ñ[îÔà¹¨%n[¤.×ÍµÎd¾>Ð$§t³|ój.Ó¨£7×d¾>°ã6!1Î¦P;ù×½µÖdÞÿàä6!ñ'OTFýø¬%»
dDb5ê½½Â;È%ÁX[t%¨aT,Õ_pà@Êol2=}M=Mqx¢®Æ6ÈÊ"5ÎÅidza¥²L¹= -|íÊ·nTR¬¯X]_ìàe{´ø?Í)¬àe=}äÊÀb¬ÚÓ i	È{©å»e}°y·¯½H¶2L:ç4õj´÷föÓ¤&T^kóéT(9IõþØDxAdØ6È¨ìCêÞ½ëÛ9=}
f_R¥òá¯ïÞ,Ap/Ò+<ß
,Òü@0Ò¯âo7¦_Wµ ²¹¦µ=MÊ°^¡%ýå3ê/Ù;dCù¥æÆ{À¯¯ú®äJLF q²:ÂûØq::(Ç5ºéÿYxñY:(G5¾éúY°}p5ÆiªûXµ¹iºÄi´û~:ðüFÝ°¾}Ç¬pÿ÷ê¬®2°èÈ0+_Ñ3 à$RKÛ%	/0ñÁZJGæÒòà¶kÒiA uÀWËk÷uÿµkdÃpA(¢òG8#]ÒõÃB¬rÈô]Ãgñ]ÃkA@µb
Ðëg
P=MµZ
¡2f
ÐUmA¤ÃýÕNCßö&@Páåm=MééJü§zÖËía!ÎízaûÖÖ¾´¹´_¹ì¾Ô¹Ô¹Ì¾
¦NÀ[õÄ%çRßjý»IØÑ®EÙ®(1Å¹d·'?¿áGüíñÓ-ýmGÉ(ûK¾ ú¦ÚÛß¤ßFC°@XÔïÇgÀæE¦£àÂ2)¯c­CÛJCÛG¢=M>¡ì=M>¡T¡vÍ¯¦Ã?¢FÖ_ªÑõÁ	Ø_º_>l©,{ô¡Gºñ.L®ï!­ªÓ%²ß=}¬© LH"v0ÌÎ)¶#,c¥Íîs24vg©W*5oÁAT:"V.´ÉTbZMttöL}ñ|4tn);](õ;Íé«²Ê>\=}jBÒnºï<µS.ºýÇï³Ò%"Õ@2íÜP¬Avýo¼ÞAÞ·²q®8Kÿ®ÔU¾Úi,!¾È¦bÊüÔÒmÌö"z´½¦ÈÇßZ4-1â£æ²RºÙ´ä$º¾	õ.Î/ááÊËâ	¶kR\Yt¤ìÜÞ=}*«[Ñê%±Ï}>*«[Ñ@CÜ¾É¤ºê%±Ï}>*«[Ñ@CÜ¾É¤Ì´Ï¿¤k>Þï%><ÃFSóaV  i)v*Õ0H6EfUòTTß+nAàõ9ÏkÜòÄBt¶kÃ×iA(¤òW8]²u#à¶k¢Hñ]Ð=Mµf
È£2\
È¡òCÐkÀ÷×B2À×ÌkýÀ·]/À×ÎëL(¡R2A<#(nq#àmÄ¹Ö}3!!~ãÖy3ááÐJI²IÕJI¢IÍJáá\5L@ôªnektÐYÛBR\V2Ñ?­Y  ÞíÔû©>¬*ÑúY>,É ñÃ ó*C9¸ Ø9ñ>¨¤ÝöËÂÌ}NáæOØ ußÑp= ¡æÐÊ<¿Ò%sCÛKàÊô'¥?õÞ*]¯\@ï¹eÍ75.R¼­?ÒêÝæMÍeñ}ó!B.\n©E®K«##,9XËädCa".#c?92hV*ã
ÉøpÈxÁöÍðwu	 ï¯£s·ÞÎj&ööPf7EµËÕfXnÉ±ËfQbwÆ| ç=MÑ¥:éØ¢úà:»ÁýgIÔAr¹õ4	¶Êî1Å6´ÌHbtð²ËñPÀRUJÄÌaÒH¹
VPpÖ ßÀ|?®£[.ÞÙP½ðn¾OåyÀAè7ÆR£áUO<=MìÈ­÷&ÚnÓÜÔ-)§SÑ¥ÑÊ²V>úÎo|ï´}· ¼9ºñ|Ú:Ôé|±ù}h9Yi¶¿i:|}¨-}¸ÑuÙÂi£:¾ûõYà}ñYU¸:gY2øûÈêx}ø;vµAvu¢pÈiàUø1ÒµæGZgPZfS|fØQ°¸Pc=MSE·&2jK¢FðÃø#ÝX¢¶!ÝX¢vö m¢tÇbe´ÄÃoK e´È¡RðÃÐ+h=M§£RðÃÄtÇâÝX¢.ÃoK|òF²cÃoKvÃoK~tÇb5Àg¢òGÍk%À×ËkÀ×Ík-À/Ãgñ]~Èò]' ¶ëÀB2ÀGµZ
ÔÃçô]ÍB¦¢òU°=MRcW<DtÜî;ªno=}6v¬Bÿ0 ¿üTE?3Rw:bqh=MÅ]jA=MeH?à =Mg·¡Ü5O]MÅý<xëíØõÈ\&*JiüaÌ7æ2ÀCxÊØÆh75ãgîÎìý=}óÇ¿D;áx°Ômâ3êIñ,Ïk¤.'2aóWY¯Ô=}ÙÊ"ÿ]	Ïv!ð¿ûùRª¼¶äÎjGnõÊéAÿZöeÕM\ÝS¬Bû| cÍ£¾Óä	\-¬Í5¥ PæÂ5ú
åýÝåµ>èÄOÓÌ¸-¶ßN¿PCW´^ÄÐ±OBðávó\ö|úàCÑ®mS´oÛÃDDd¶tötL<RïBw]éï4Äo|<R44Ûh&TpOx\IkÖIßz=M¢ÞÞÞ;ÇAî{mÍùSlï¾]4\|Þ¾t%¼Î²8RF%
ü.üÝÑh¿ëÄyW¤àé(Ñµ M¹PèPñ0?àäõz±£Ã/¦Iº¬öõ"?.ü
xÝPàlwR5¦mûµò§jÕMHÁ8*aºìÒfÎ$Ýä«qU;N7M,z16dG>AÜKvLºPþ=}ZÎýñ|ò¤½@][»aÚ¨|= Ö*>WþÎL<-kÌZ;Ã
MÄ[ËªÚØ¶zmÄÄ ®uÕïÉm+ªÅð\íËëZåD4§g8dc¹è*5d-«ºYfæs;a1$þÌZÄ<Â¦·3Ò9:w=}¸¡ÁÛòÏÅ¯#Y¦÷	k£¤\´qÐõ5ÉÑÞäñgX×§JOÍæX§L<K©nü7YÙaf?c¤¼%7büËz¤zs)çË£úwËeã@.«ÙKRÂ%¥gÍ!©±÷Gÿè
îÛ¶Ä¼+rýõç $	Ü0éQðê RÔ= ô~:¾sÆ ÒSàÁ@C<)j,Z4ÈI¿GÌ!ºVs<ÒÛîLùWÏm«I´ûÏh·u#],À6aA~{ahéÇD¼ F=Ml< gÚ,ã¬CûCfÐç=MH¯FÆ¢Þg= te¬Ð)
mIýæ=}ÖA]ýcÑ=Mò
µõÙÔÄ ¼öÈc2!ú¬W^@òë5¸TÎjÏ[¹S1p_>öýN&Z×[½Ö2J]lajI³ûÑWÐxR9öTKI[ü\¶&ç,jÆ×[Oæ;(Lý¸þ2r¤ÀÉXo\Ï#¥k¹½©ì¥dWÑ¼7	ëÓ ¶ Ì)ÜëÄNU8v7ZpO©äAÃÑ|@=}
1?ü[>®Ü¥¹î¶%BqÞ{ Gkbmw2IØôü©§ÄÎ¨ªÉÛ>qLm@Á#ÊÒìÉ-½·X 9quI£FB;»ãÖ_<T£]uóÎoÇÄ¿ÈûØ²OkÀ±ãGN7¿åé iáÄÊÅÕ>´ÍEq´¡[öB<¢'Ú­¿b¦·¾Úkâò
þÄõôåÜº·ûú¹+A%#¸¨Ìx}û©?*ãÜ^nº-EßñÖÍ¸sJË7å,"Á¦¾ÅÝ
HÝRx-¡¢©ÂBÔ4-Ü@ùYµ8]­8éÅèÂB¨%ræÜF¨è¦²8é¥æ)qJ¹÷ZÓFï×/D¹lürþ|F¨µIÁýu;zºØ©F¨8©¿1ØcMRD/å5åD1Ø¨Ý÷ÕÓ=MRIéZé1Ñ£ÀÄEUßÈ\hÞA5!Æ4Ä½-ù ÊÞÞ±x§W;È½Zø~ÎÏ l([[P¼q¡u É^Aéw1ñä¸þxÎÍÒG8ÿXZ i8ÿ£H= øèZ i8£@ l@>è iÊqX¹<rÈY[u½w¦Í²¶?âòlÜÄÕ¼K T){ïÛÑoK¿Óô<kËÚ.qÍýüpúUÊ5ë·Î6p¤ÇÁ&Ê:Ç»]ÆÝÁÌáïfsVj
ÝfGà= ¾Éól^¿=}ãW^]7I	Á~­í]¿=}=}@sÂH+3 ÊÌ"é¼¹ÕìÅQ/Û«µZHnd8ñÎø#Pà2e,õ)^<^+ÜrHkJÇXP¥8ì¥Ðöð+õË,Õî¥s¥fÝr¼Fk"Ü2g,uâ D= ®Dî@kþHk^Ç(ã¨ý¾gÆüzÐ»ohªëÔÐÇñ½/~£Ô£\¡å,UuÜüÁÂÁ¢
Ï	jMú	L¦ñ6
àÞ¿ÌãÔ1$º>¤4Ç²x^Æ¥Ûc=M§ y©?Ü¦>pä­C]AxÙáÐ¼=M,ØIßÊS«ÿª±AÏsùêì{5éù²9Cýäa#å©thæ|dÄü CNÐi0sÛÊ¬WÐøë>¸1[ 'q*â)»§Ëb .ç~IÊ¡Bè±Ebk­Ñg>ÀyO´0{ç±Î/¾Ââ®¢Úï~dA~-yÊEF¹Y¦ûñ\.JëbêB!s¥ÙýTª×YQ­ôç¶(ö)Ô.3E´®@aÎÂ£xé®$(ßxÿbþYò©¶
æªNÁÓ¿¯ã­¨Ü¿ìºòY·°8~ä»µ¤Ë3Zû*¡¢d$vxÍAWcæµ¯tCÑÂ'§®1=}r^ÂAãH ¯QÈi»ÄÁp"Zª2ªu#åi)8VèÐtÈTsÎ¡J%= w~¸c®Ýöu³s<[*æ<ÇÕ®t¨ÏøÝ_SniúV¡1 "¢0º
ÆÚçT¥ïæPÚ¿\j
uIÏj^ñùmÒ~HyCÈâ½¡ú±è[Ä¾
Ã®r) r#Â­ÓëÌÆU@[	Ýzm'Âÿé-Øß]ÄÉõ¶X:9V[ÇÚQ´0S)öµ
	*Í­'²Û@* ²P4ÿisMpùÃç}1äYßð/Aw¸,jò£h+áÃUÌÿO¹'õÃK Ý,ÆÈû*B§aTà]r)Ð7ÐJò4Z]Þ½ùñKòU(óýîCO.¾ÔìO*PdëpP/.UúEß²ê&QäF®E¶Ï{Î.Pxq= «8ËeF³CbDul}éXÊêüQT ^´ øâ5âT¯8ÁXD/VôÔÜli(þNÚ|¸hæ´ÂRb+	ÁèptCÌ¥òå a
SÝf=M(Ö+rôM·VÌ7Ä¦Ñ@6²tTÊ¿?ã"8i_×>aùwÍÍòpêãéï9n= ·[ÚÈÏh®+°[oK¹¥âÅde*Ås¹Ì;M; ÊÂ~
ÉáRªYäl!Sá!·¾r6ÔKû_Ø+­JV¼ücA|OõÒËá)Ïä©n[ÝÒ»¦H+ú29Ü4aR"ç¸ 8Ï÷tÕ¸T¦¯QÃåÇÌe^Vr¥th ëé,_PøÚ=Mê£ÿÚ©WG±ÿ1æm²GÉèÕúì©'û1ÀÚ<»Æbi¦oPØ'\{Ê.ÍÆ¢äÀY1cÅ%~}ÐÝý]¤×OEÉÊtO[ºS(]p*ò(s¦¬jØ<Yn!*Ùk¤jÉ¾	Åf¡â-U+Ý¡rLZh=MU'z×¨pTÛ5è? jÞõpð½\Ri&«3c[¥Tî Á3Ñvøòø?AÊäg' ·f1Å~ðh]Ñgîr³ÊîJË¸ZTq¶0Þ¸2·æ(¸yzRwa~yyyyÃyyøyy'yyWyº6}ßÅÚ¼yºJ"±¸¯ª£¦éð÷òåäÛÞÁÈ¿ºÍÌÓÖY= gbutknQXOJ=}<CF	ûþ!(-,36@9BGTUNKxqjo\]fc0)27$%úÿ=M ¢§´µ®«|}ÐÉÒ×ÄÅ¾»èáÚßìíöó ù*/81&#rwpi^[de:?HAVSLMâçàÙîëôõÊÏØÑÆÃ¼½~{¨¡¶³¬­ÇÂ¹ÀËÎÕÔïêñøãæÝÜ·²©°¥¤z'" +.54
ýüWRIP;>ED_Zahsvml}:|Ùyy{9óT/æT/æTß6æT/æT/æÜTË
jªÎR~	Ðâ	Ê"FNIÏö©É6NÎÉÌÎ^ÎÉÍÀî{= éÓ0éØ°î~iÖúsü0sùàñ%¾Ñ'Óü6³ùæQ%"úò&Ê(
û:êfÒh;ÆUgüW<.W9ÞÕeÀõg÷<8Y°÷oÎXY¶Wo¢pÂÚíÞÜö°ÛÏîðp[yoîïíä°Üë ÛîíçàÜ?íÛ@ÜñÀÛKºK|íÉ}9ô4.æT/æT/æWN/æT/æTf]H,®-±Å=}q¦&Ùª/#Ïú~&ìª4îÜèã|±Jé ÔÄä<ÇåènQQcÓ×ZÆôåpqW·j~8~ªûo oT7ê4f[zg.¬5á féæ/îè±üLæßcÛ n3¤)Íd¢Õ9ÒVüü3Ô0Z4wûwã®Ñvi}¨n,7<ööý1#®.7/¼àæ$¦©î#Ç9¹û×a'R	ÔãzÍM£¡þ[ËLKäµO1éÁ{'ùDñ½Õyõµ=}üØ=}~Y¸@¡9ÐuñÀÕy×Ü®êzQ¹W)Ô9ªÚe §yôA_ÚR@ë[{)}9ûYy»yù{aRføp8¬ýÝ»ýý¹»ýý¹ÁÅÁý{ý¹Áý{Uôø¸wøwruvjXe=}ª :PÁêÿ±;¤h!jþ¯õiùCµ@¶0AÙ<¥lQ*ý¬¥)ú WåZ?³$1©û¢_Ú>­ÑÙ9<jöírÄLXc²*ÿ±OÇâ_11$g'b^/óaYD³² 6/Gñ%kW"],£!Z Xãr3#7¡["= ò-×ñ;bDöðn¼µ¹z}¹yµ]o.R/æT/æT±ÝT/æT/æt¬{\ª*)	",*þÒ T*bjR²ZqDw%tñC_1AS%L¡Dl5cõOáATu:BÙí^ð7¾ô'½ß]]ß^êg¾÷=}^õ§¾ëÇ½½BÚÃ£s®ß(¡Ï[üòÛ'/e£@Q1«3¦ÚìC«9×*È^4Ï§=M¬%ðìN¿î;VÍÕt#K#§/Ä"1#"#\ÇcwNìuÑöÉhiu¹ÖÎ0jòî;¼dêßÓßÕV!Î?P¬cC!?¾«Å©=M|ÊyyMf[æT/æT/f&î/æT/æT/×åGñ?åjjÑ5§¬ÃÑ°¯Õ@})	¶Ûþ\;¶/×Ñ?ßªØ¦È,ÏÒ4^ÄOÚr4uGÃà^²NÔgÝ®,#D EDKìb²×+EÖ_ã".­A%ß¯kb=}®ò°7Ò¤^OO£2<UgSõæd2,.ÈgÜf3ïG¦&°k3ò<nñOìò5Hsêv0×Ø_Fkõö-«F×ÞhÏ§R hC´´ØÊ=MÍïèVE''ë§$HNøGñNëï²$NOc LÕF= Ð$MZá¡ÔÍOCL:-Ð-¡SÅæ³¨óÈ¾0L-ÕÑí;
<ÛÚïëõÈþ0BéªÇéÕ©¨@tûlqÑi¤ñÌ\»ú@vûo1ª'eÀPuÐwè­Bàá´Ó= 0ltC!Þkr:xBuëø|yuä·®yq]i1¶X´¦¨<Zi¿	$Z\àb±Õ¨ ,·Æ\üNVYk©sÇ4ü0uÁzÚ6bÜ©Ò÷MÐ´<?Y¹oxî¹x[9È*»*Ûâ@¡¢KÇÈp¯¾náÌ­áQ¯fÌ±#Ì%éÍ ÑJ!æMWo"6Ø-¢#fxvpwg6¸XhFÁµ£Ù= :ÒÎ®£³O@=}Ì=}×>¦¼ÜÌÛBê^*31àê7QÊåä{ÄDwG+RÇOyGGÜDÒQ$ÞÞÀLys§3ôâ¼âsä³Áäb6ázs3ï¬¿;5Dm@%ÚªªßÌlª?<üªrÅÏE/¥¢Ý¤+§àþ=}>áÏÃÒÕ¸t+¿4«ÝáL8àÉLL|«im5íò?í¡£<|I§A¨µ¯¹(çýFÉ¨±yFúÍiFÍÂSV­øc­®Î=MÏÇvcÂjLÑ"T1yà@Gì5UÕ|= ®]¯ëF×UyàÀ>6B=}XplP=}u7¡7§×FxAp=}È\ÜjuñøÔªúÁµÁ5ÃÑùCîHõ}§Z}ÏiÖÁ;z»Õ	 	ÚI£_ø.ªá­|f=}ÅÔ=MhÇ£­K}ÿÈ¦áÇLÉ Ö CîÀo¿D¿øÀÂ½ßIÚTYdaU¹Sâaa3î WåÜ /¤sE¯ñµ0ÖNRT2ï4
uF%°BF%ÁkNßRÏ~UQ¿¶UUf°=}~[/g@ôÙIoï>Rh@kCÎ656ãD¶7aÄA¶­ÏÚ6+CÃ¾¶*°ÃÊo<«ÞùIÏ~E-ï=}ÃËgÛ ¥Ì¦¦´<- MÖP+À<WäRd
íDUfQfbßT^Ü£;Ö,ê¹5n¥·1e\ï)¤dE~qûµð×®=}´o5ªlTvë_­¤|BñîÓ_©J wi=Mk=MùÐ´û¬UWÙÆ¨ãéÜÇû¿ÛÙKMsóô"ª=MÄ­#ÌR@¦@v"º  ¶üå õâ­Zù43«Ñâ_/T%µ£è
FÖZ]¹
±æºfbÙ!'^H'+Írr7  µöæ öjñZÚK¼»Údõ¹ÒÇ´9ñ_¡õÍA´aÑôEQxÔ7ÿUØÌD;Ð.+ãÊ¸%XãÍiI'-}}x©ð=}´)?.
¡ : YÑff£âû«:®ÿCmµÑÔ?rßfP¹%Î«*§&õã5Ñè	 û·ÛÆS·»	¯ [â¥ûzæÿVÂ)\±ÌÞò>ûÚ?ÿúÚÝ"³TÆs@1¿¿ÜÜ]ëéè»çÅÆKÆ­¤ê~Äú¡.L¬¬â¢aÝNÝh:µÙçá'çÒäÑ½&ÖÒeÕ¦l¥¹#ók¤¤{ò]Õî® dØdÓ Ó &(·üÛ.ö$Jå©/0$ðÑðÉ0tÕrõ%¹×çkæËSÄùKÉ"'=}õy¨à-=}[-¹à3Ô.T4ÀÉ|Í #î®_³udË .ÂÉ RµJ¼#¼Wü{ jZÅ9Â·(·à¶À¶h(ð®)órÂ)JP!±â8UVJV­Ø@(*'P.ÐÐÐ¤°cË25ç:\Ü<\9+ÈvIs	clXìVV>gB9ßØ,Bw?qOi¯iÿuÃf0s"(uHÕH¾H*àk¯)NP#á,x{7 7d÷8YØÒØ
¨SHÈGÈIàÈy#ûWyªxõ×z½£&Ö8BÝ¿J¡@ÏÐíDooú'£Ý9>çCÖ63g?$&dbW= fþpg ÎËòÐÁs£ä#íöv¦.¯´OHöM´µ{9×¶}BÇ£&ÈXá³üÝb ¤$^õt2ùís i°q(k_ÇßÞ2Þ4îô5<j:9½?ÖW¶á%ÂÉ¤nF@A­í\äë(vÚÙ©jp¤äÌáMãö$b¦+Öeñ\ÓQk#VÑ¹süsé²uÊÐ÷I5Pbd¦¸æ¸)®gèWÎqCÙ½ç09B¯ÞàÆVÇJß@ÅghõÜ)É;ÙjQÉ"¥ÏÊ'·¬J}.±a'V¦Eo9ÿ]ãÒ[3ÇÙ[¯îéÕ Ó[TrúüÅcâi¥ÕÉJO®³¥B/ìk9ÌùJ5ªIÕêÆöÖ¸K­2û×îì2ÓfRz°â³nq2(ÍâcxßÙt¬oðp±(è ¦7|Ø<Ä¨­ÓV\hr/²Q¸U,6f±~uÛ%\&þ7DÏ¤7#8aAàmHåBæH}y®ûÑ±~ÌÆPº?­½ßÙ{Ðì|ìÝz3ÔdÓfF:Ð}{ÃcÝé­Ó«ËÎLVª×¼Uae$Btøq~õ:ÈIìÂ$[s'!{Ê!ºK!±(ïcÃ^A:ÕþW1²É8(áè¾Ê6b[ÿ&XPÿ_Í²@@Öî£= àÑoúlªbð¢·g^%P²0l¶¾£§Pxv0bºdp;?LÍÂ?Âßv¬ øï
/Ûâv$í&øò=M¸!áé¾ßö8|s-kW þîî_ÉóÁôd¯
|Ë¦Ò/í I¹Å ÁîÙí^¾;åÒ%«¿¼LÈ¢ÌñLYª«2«Ô¬Í¸H/¥-¦ï%ìzE÷ öÞ}ñZà+¯ØlÏøLíV[+ÖîUî°mÂ)=}í9+Tßê]4°¹æÏªkåé6ek_W÷=M×>&Å?+È¸´tí'.Ùøj'C[\FTS/õ1ÎéqÛ^Øwï"r÷TL¸;8JXìxÁwÀïtq,X^G¨Î5!ëÂ<sÄ¤næD¸u²õö£ðókQeZ\Þ,x=Mº WpEg®7tåãçëºÃj	ÃÊ¼xÄ|t/ú¥Ô§.í1Ù"çò±ôr5òììny÷ß|¸øv¿u ±ûi¾óyK;Ãó­ZràVrxJx®·s8â¢½vBùx-é"½»û)øj¿{KëO	Û©þWbX
æfÆùmÅq¾¹É;³yK³;+ÖÇíÉæ= vÔÓ£	7Çíq= ¥Ê½""=Mé)= ¸z`});

  var imports = {
    "a": wasmImports
  };

  // No ATMODULES hooks
  // Begin runtime exports
  // End runtime exports
  // Begin JS library exports
  // End JS library exports

  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then(instance => {
      const wasmExports = instance.exports;
    assignWasmExports(wasmExports);
    wasmMemory = wasmExports["j"];
    updateMemoryViews();
    // No ATPRERUNS hooks
    initRuntime(wasmExports);
    ready();
  });

  // end include: postamble_minimal.js
  // include: src/flac/src/emscripten-post.js
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
  const totalSamplesDecoded = Symbol();

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
      this[totalSamplesDecoded] = 0;
      this._codecParser = null;
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
      if (oggPage && oggPage[isLastPage]) {
        // trim any extra samples that are decoded beyond the absoluteGranulePosition, relative to where we started in the stream
        const samplesToTrim = this[totalSamplesDecoded] - oggPage[totalSamples];

        if (samplesToTrim > 0) {
          for (let i = 0; i < decoded.channelData.length; i++)
            decoded.channelData[i] = decoded.channelData[i].subarray(
              0,
              decoded.samplesDecoded - samplesToTrim,
            );

          decoded.samplesDecoded -= samplesToTrim;
        }
      }

      this[totalSamplesDecoded] += decoded.samplesDecoded;

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
