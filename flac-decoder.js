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
              const puffString = String.raw`dynEncode012804c7886d()((()>+*§§)§,§§§§)§+§§§)§+.-()(*)-+)(.7*§)i¸¸,3§(i¸¸,3/G+.¡*(,(,3+)2å:-),§H(P*DI*H(P*@I++hH)H*r,hH(H(P*<J,i)^*<H,H(P*4U((I-H(H*i0J,^*DH+H-H*I+H,I*4)33H(H*H)^*DH(H+H)^*@H+i§H)i§3æ*).§K(iHI/+§H,iHn,§H+i(H+i(rCJ0I,H*I-+hH,,hH(H-V)(i)J.H.W)(i)c)(H,i)I,H-i*I-4)33i(I.*hH(V)(H+n5(H(i*I-i(I,i)I.+hH,i*J+iHn,hi(I-i*I,+hH,H/H-c)(H,iFn,hi(I,+hH,H0n5-H*V)(J(,hH/H(i)J(H(V)(J(i)c)(H)H(i)H,c)(3H*i*I*H,i)I,4(3(-H(H,W)(H-I-H,i*I,4)3(3(3H,H-I1H+I,H.i)H1V)(J.i(v5(33H.-H(H,i(c)(H,i*I,4)333)-§i*I*+§H*iHn,hi73H,H(i)8(H+J+H)P*(H*V)(J-r,§H)P*,H.i)H+H,i)V)(-H*i*I*H+i)I+H-H.I.H,H-i)I,4)333Ã+)-§iø7i(^*(iü7I,*h+hH+iDn,h*hilI+i)I,+hH+,hH+iô7H,c)(i)H+i´8W)(H,I,H+i*I+4)-+hH(H)8*J-i(p5.*h*h*hH-i')u,hH(P*(J+,hH(P*0J,H(P*,n50H+H,H-b((3H(P*0i)I.4)3H-i¨*n5*H-iÅ*s,hi73H-i)J+V)&+I,H(H+V)æ,8(I.H(H*8*J-i(p51H-i)J+i¸7V)(H(H+iø7V)(8(J/H(P*0J+s,hi73H+H,H.J,I.H(P*(m5(H.H(P*,s5.+hH,m5*H(P*(J.H+H.H+H/U((b((H(H(P*0i)J+^*0H,i)I,4(3(3H(H.^*03H-i¨*o5)33i(73(3(3-H,H+i)c)(H,i*I,H+i)I+4)33i)I-3H-3!2)0§K(i2J,L(H,H(^*(H,H*^*4H,i(^*0H,i(^*DH,j(_*<H,H)P*(^*,H,H+P*(^*8*h*h+hH,i)8(I3i§I**h*h*h*h*h*h*hH,i*8(6+(),03H,j(_*@i*I-H,P*<J.i,J(H,P*8J/s50H,H.i+J0^*<i¦I*H.H,P*4J1J.U(*H.U((J2i')o5/H.U()I.H,H(^*<H0H1U((H.i0J.i§i0i')o5/H/H.H2J*H(J.q50H,P*0J/H*I-H,P*(J0,hH,P*,H-q,hi)I-423+hH*m5+H/H0H(H1U((b((H/i)I/H(i)I(H*i)I*4(3(3H,H.^*<H,H-^*04*3iØ1U((5+i(I(i¨7i1^*(i$6iè1^*(i°7iè6^*(i¬7iÈ6^*(+hH(iÈ*n,hiÈ*I(+hH(i¨,n,hi¨,I(+hH(iØ,n,hiØ,I(+hH(iè,o,hH,i-H(i0c)(H(i*I(4)33iè1i1H,i-iÈ*8)Bi(I(+hH(ido,hH,i-H(i-c)(H(i*I(4)33iÈ6iè6H,i-iF8)BiØ1i)b((41-H,i-H(i/c)(H(i*I(4)3(3(-H,i-H(i1c)(H(i*I(4)3(3(-H,i-H(i0c)(H(i*I(4)3(3(3H,H/^*0H,H(^*<3i(I*4*3H,H,i¸)^*TH,H,iø-^*PH,H,iX^*LH,H,i(^*HH,i-8(I(H,i-8(I-i¥I*H,i,8(I.H(iErH-iEr5)H(i©*I1H-i)I0i(i;H.i,J(i(H(i(rCJ(J*H*i;sCI*i¨1I-H(I/+hH/,hH,i-H-V)(i)H,i+8(c)(H/i)I/H-i*I-H*i)I*4)-H(i)i¨1I/+hH(H*o,hH,i-H/V)(i)i(c)(H/i*I/H(i)I(4)33i¤I*H,iø-H,i¸)H,i-i;8)5+H0H1I2i(I-+hH-H2p,hH,H,iP8*J*i(p5-H*i7u,hH,i-H-i)H*c)(H-i)I-4*3i(I/i+I.i+I(*h*h*hH*i86*(*)3H-m,hi£I*403H-i)H,W)-I/i*I(4)3i3I.i/I(3H2H,H(8(H.J(H-J.p,hi¢I*4.3H,i-H-i)I*+hH(,hH*H/c)(H*i*I*H(i)I(4)-H.I-4+3(3(33H,W)1m,hiI*4,3H,iø-H,i¸)H,i-H18)J(,hi¡I*H(i(p5,H1H,V)ú-H,V)ø-o5,3H,i(H,iXH,i-H1i)H08)J(,hi I*H(i(p5,H0H,V)H,V)o5,3H,H,iPH,iH8+I*4+3(3(3H,i$6i¬78+I*3H*H3m5(3i)I-H*i(r5)3H)H,P*0^*(H+H,P*<^*(H*I-3H,i2L(H-33Á)+(i¨03b+(,(-(.(/(0(1(2(3(5(7(9(;(?(C(G(K(S([(c(k({(((«(Ë(ë((*)(iø03O)()()()(*(*(*(*(+(+(+(+(,(,(,(,(-(-(-(-(i¨13M8(9(:(((0(/(1(.(2(-(3(,(4(+(5(*(6()(7(T7*S7US0U `;

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
  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01561175c7ec¥fÓÅ¬Ñ£kÁ@2ºÙì:rÛyë½ÙR9ßVNdü~= 
xW±b\°Û¼¥õä= ãjð$k¾¥OøÃ3tÚÇA0$|"ïô´
Îß|Ø~´¹ Î)@±nné|
=}¼¤ç,Ò·CÈzä^(ËÒ;È?¯¡Ô+ºÕÌ |mlýÒ*môÆ½BI[µçFã6L|x9ÂÇrustRI¼ë7Çzÿ ¡ ÄÃ¡Ì%=Mä$+N!.L÷«´ÕÒe äºÏo0|d@1»¼¼¼¼¼LáþË±Ýúâ "ÞMxh xéP4qÅ
.3/=MRóMÚ6Ræ©®w±î×ÃñÉÛ¯Ì¡Í@nê!'mù	Bu= 2ªâ\Ä1É:«R´êîö>¦k?§ÞCuw"µçQùä{)3/®^ê2ãÃPrç5®u8Ë<ÄaSêXÁ'¦ôE£äñ­'¨ 9v0ãKa= ¬ª/_Ør%A$ÕÞlÎýsÛ;d³ÎÌ=}äyAÞÛvjÑeaÜ»ÒHù)&*¢ÊJ¦ôñ	 fÉ¢n¢ë{©èm%ÞÛ¶*3.­rªîjäËç{&Ìqkéº'ä­yp9¸áÒÿ<ü¹·I\CpðI<EÈsçççdr_oÖ{5Í²é«Î¤à]³m-¬'EY(×!2[Ä!¹Ð= »ZA ×ÛWY3ö	í³Ùày!·§¶kð.y¨;ÖZ¾à<æLMÂäN±ºT0@´®¹{Í
¹ 8ÑeÍ"lÅ¾Í¾=M2T¬P6u:'m7~qT4öZuU	×÷½÷N/uHee&Hò5ñÕÆ´¹,eÄ¬öR¬dàFR7bÝ¸Á÷u*"2þ6¡yBÝmTÊ:*=Mt½Ü<¥Yî#&"S¸4õÇe¸½	auX67ó3øbòEHøDúºØtP´im2Wk_¯j>e¹pr#bCQ	o|G&9ró"ÛyLb¿C½ì3MØ õFØ#TjüÅgæºèÆ5¨UõÍ¢G¹m¨4&LäóFzÖ¥ÛÄF¨Ðm"_¡C¬»ÇÀê3t­ç4¾[£"=M¿ÿ7Z)IOR4Ô;2.j3Ü{9¬$0ÁGøTyaímE¯L(Ïä®#k«a3>§º.ocOÐ¹	þùDjotF.ÅRG7HÿifåS ËÒ.9°@½1åe	©}&æ-kM,u@í-ó.*Pßi}Lq¢_°çëÓ±¹s¬ KÍÓZøó:vÕ^×Ê²[5Òò1»çË½6ÐÜr;íEp?Ýbbb©ÊÂVñ:¬ÍÓÀÊ!{ä¢T«ÁS]·dßÑ*zQtLG^i9g9×³½ÞD*7>.¹0y9ÌnpÄ®ÎEIÿ|'ºA=}äÔ¯8DLµøA<'@zèß²ndj¯È»Âu³7EÄÊ°®B0"èÁðäôA©©-i1J''­øyJVÿÉ&æÀp()xBØzäs%¿L
î)øqÔÀÉã*Áú°hEJk©wáå2Ý¼E¿'+x)X6óÞ«ö=MmYì=}ºIÂ=Mgìb$öÇìbàÉ Ó9ûPÁ÷¾ÒÃëH®Õ?Ý5×Ã3ñ¨ä¢¯=M¡À?ì(-cÍ±ä1±/¸#áuQOíÉò1MÐÇ cõRRÙõA ¸/nfÏÄÆ2FUÖ·MGÈ<À= 267SõÑJÝbªV²â1¡ê.ûv(²2|w}ðWztGB­Ûhzh{ç*®5T7Á´éª &æÆïeÕÏ´ÜòÆN.;eÏ­°Ø¶dÖ«2á~*úì9ò*Od¤<±Â«cë#GÅÉ¹x·Øq4MÞ±9¾zi'Î4I´M»èà¼NRÔ2³¨ÖÊvD³B×/|.=MõG³3Á&ÔF	ý¡8WQåÏ5_pì¿Yöa1äÎI÷ ìQA@)E; e2ëBAôPAµIî$*ÖìÌë¸òÒsëÔÔÛáÃà¤¿Ô:ÑØ}%2|@òøDîÓT½5Nt=MkKÙm¼½WÑpJ"kÑ[ÁþÅµÔ/Ak*¹ÍDgîÅ¦R­ôÔP'Z kªºT4I?ªc}´éSOíOÿpA÷>ÁmÝLoLüÓS;M¡PT-MÀ&öÌüûC)¤ÕR:´ïìã)§*õÒ;y¥ÀÃC×p°Y:å2©kwÜåÑ/ñ®-Ï5F9ÅmvÓ´½_¼yîÖåtS£4^MÖ0GßZ,ëÚYMûÇTø½UH÷ZòóÖÑ$-uMd©ÆlwIîÌbMî)eÔ®.ØMìµÕQ£òÁYÅÌXE*».¬½9SH¯ÅRîññ]´ÍXE:ô	ªôcM,%´Ð1Ê¡É
Ý1ºDòVÓPtQL\*ãÕLIÝT0xülÂËvôx&T6Ñ7«³¾CÞ@ëõRb#\¿V4é%²Hªd@Â#,ø=} !´RÒtåCû¤¶]lix*ÒÑC;a«µÙP\Jã­ÔQ8
\&EÒ;³ý±+ÖtÕHA"j|¬$Ã)îÔ)Í.pÙ_&MT@¬¦sp1%8³1Ö_1éìKIµÒ«scno=}æ-ÏýáR2=}=}Ñr ODR<w­¯Ùa¨|È= ®é4I?¥Î¨¾~ÆMÁ½0=M­F	uÇûà*$¨= ¤I)òQ5xb]I½Âxy}}3òéÈa'Ê½Ç7h/óç$,ÏòëÄé3àq¿Ü3 Ø|÷¬oÔ8¦ÐtÞîÀðâÊ{á¬ÒTg¼èÅùø]½OÌ6ä÷ë·/åi¼µ}"×óýËïÄüéýé??úÅ(Êó¢óÑó¤ØüéðÔ+_	fBo§\wúw£{"ß|"nwò
Úrvl¥ÙÐÀ·à6Èoû=M%Gùl¦*4A	ÜeS§ø;Wßd¥¨Ý}/b¥7T\c¥¾éÂÜ}7FZc¥¾i®ÎææÞsxyw= ËÞ£lw-Òü¦®ä¤·¯â)ýL%L=Még1¢åWõOWaErhS¬CûH
¹ÌvÎÐæ:UÀ,þ³ÛóªkÔ¤Ì®Ø£%Õ
32>|Jìáþóñz³êïô8ö¤÷­ >eãnâ n¼ëÚú,³ýv#79µútWçl]Ä§{p¨¿¿6ìª°<Ò¡ûñc2#ª+3 û1c2CªÆ]ªPS×QÓLÃH²KtÜ¥Æ×%ý.x¾bºá¤6vþ6IÊ:ÈHüÃ.=}í-tUPVyEÈÈOæExÒ/C1n/=MÌJÃ´r§L^@¤¾³éE49²ÐG½Gé§ÉvpË­Ðl<îÆb-¾2¯Ilp,7BÅ;ÈÐÐoèmf¢@(@ìÍ
b|Ô5À=Mï÷w»B®Ô/ÇT	ËÌõïÇÀôE¸õ= ©zL)B Õú#üÙ¼ë¦¦¢EÚsÈ\tÙà=}8JD´Nîee¦gCYù9É?ÌëË-ïµ®9£÷Îµ=Mû[ù[õüßS¸ª	ÔÎ Ô!Á¬µ×@Ó#@ÊY+M´	ÐE\ÿ1wónDU!Á
&×Za×°ÙèÅêRlûÊi_2 _A´[­-ÃP;S_,­ø)äJúÝ=MårJºêª2ýô_Sª<GÎýînb	Ô°LØî^=MÜg{cD²SÔD+%Ñ@=}y¼@õ.öÄÏøÄ@°#IIðTA}ÆjòYäæXäõÖÏ<âµÛá#ñJ¼2ûº¹h:BîÎ£ßð)îÜrb=}ú¡ñ(= àïîßÖòæyè.wh
ÆB·ü{øÝ+ô>íf¤C<ü3
©ýîÌ8j)¤ò¸0<j),ýî4ø³XLÌNÉ4ï@³³f5Í*aòßaÑ¿âW#»:.ÈDk½~FdRjiWÁ!W»@» ÞÅsËIÕ9*Îü²ê0Hü½Å²ÎÐ:²Ê!ÔñaôVóÜ²b»ò«Ð	UJXËTu0Uen¿oÙ¸ÚU	÷êÉÿos¯Ë¬©äm­·QW	®$ÑTjEX5>ãûPÆþóAQ?Ù@@öeDGL	îäýÐ£58©üè·½Þ;ÎÕ!cÁb.^pj{ñ¸Ã¿B,·¨C³ýSüJ9¡<>[¥Grä@á$©Ø
!É5ð¥4¡-³(Q´fJh
è¦£
£a¬ÅCJAq,ýÐq:öÛK­wOd±'8©TMÁñ!£Ö´|B¢öûx5"¬è¤êj×ºØ y®}ða;ÄzEX»z	«º(w¹Óúù±Å¶ÁÐ¼|sAâÄ¼¢ì|Ñcoé3"îB»¢ìB¿±À¡ÔåÂ_¹ùõUÿæ®¼<Úh4Ö«W¼\"ñ:f9æFV;µßAä>þàíâeê±ñ£mÍ¯W>KIF8ØÊ8Lv7¥B³º%MTr5ek(OTÃòU¡D¥¾DWÕ!è=}$ ²MAØî@H!:4§¨Bq¯Q	ÐÞa4ÇïUí>Û©oYÖ2ÇÀµ_ l-CíCÁtýAPçdÈ_]äCù
pöF6PêÓ
ÁÎÜUÃTÖSÎ óhæóÎ®õ4d%a°1ËÅ@Ã$pøE7æ³T+h=MÆsaèlåBÍË©¾·yÇhÝÄS £ÚÊ"tÚeu,¾Ã¦ //üüBT°\ù	UhÍ6OEy/ÓÁ]0'C%«³ÚlÄòqËåþwe6MMK«xpOß+ÅNÕt ïÕ÷b¹Èÿ«~Â Ã¯Ñ¼Í»ÈÏ;ðz"QÏÅ=}ýwª=}´ÐP=M¾½«1²ð:*)ÕH¼\¡Ãn¤8çCÃÞ÷×ÈæInCÝtÐ8>_dòPBó U¼»r0b»ÐhÕû³UþIoU/sBõÜ·:J¹ñ\t!N'û×cçø=Mà8aãj vX=}á©7ù~«ÆjË¾Jf¸ÞA¼gM÷ìkÀÃPf¹7DÓ&Q¦¯¾õ÷Ó~
=M&4¥Q[0s&Ä[aba¢».¤AÊV7Â9Ñ:Û%»m°! ½¶o×Äø½cBÃ6¶YM&ªÌéF7ø,ïÚ_¯hzéFÈ5ýÁéWìú1êÃ-ÒÙ»õÊo<9RM¼mßuu]UÈr>g7J9¦£J&²HktÆÙø_~tèd+íkBKGÑfR;9µG
Z¥vøJ#ºRºÝ«?9$´ÿF´µ±ËèöjØÈ|~= ZÊ\W4 {Å{xÌ)j¬^)Ã7Á6du,5µ-05f¿ýØ¨ÐòJ=M^ex?ÅgSøãOLáàe·MTT\P1QbãT¬¾Å÷×ôÎ×Y0+LN
£ëåë%15X¿Yq&ª,LM$LÍ|w¡ìÚ¼è¹5³T¡Õù=MÕAEaÌÎÝø+aüóMë­g# a'Àhþf­C54Üx×l·q@ºÚp>Ö.Tf°vuÜ'¸á\±Fï}5?³¯-0.KHÁ@	Ì¶\¹TY<¥
ò­!Nkd\X·,tÆ¯	ÛáÙÌ§cÁu~Äá³"âJ!éxcöh ðGõüµGØ«(ß"¯<ì¢Ø5JI×4\¬æÃ¶qpÒ»y½ZRùÞVúý¼{¦E}¸f7/>ñÅã@ð¿<æË~è;{à#0iû7¢'Ühl	~~C=}¿Åý9%)ÂýKZÝâßÊòÈ ù²læB2olæ±­¿Å³èJHÔ l&4\dÆÅYE	[ïlUî&[= éùm¿·×8
[z&|,X\Ûk°A¥evðý;èÒ(XÁ7§óïAµYÀ/Ë+ÕLM2Ñ$ÓÉµU¿Q¡ýæYJ¹Ü¦PõéüUÕÚXXXXXÈµþï?¹fÓyª_&ÀÖþ§Z jb{× ½*©Þh6Vâ»Öo^]£áAM±QBÍDÓM{é uÑL/5Á--´Qº>@¹z¶ðç}üòÍ,j_ø}NÂ|= ô )3 kçÝ{þ}l³o®òk=}ªeVÀ°¹ñØo÷t©, ¬c¬	°º¼Ù	w_Ãp*¼dØ¸»ÛÁQö£²ê¡*%k7Ú4XÐaÎWÓc¯[öøf .8û'àZ¨WqvC±;JÃ¬ä1Ù%êÒE'f&³5ÿøs¨Ý±4éäfÀÂ×«(h®Y¶#%X+ºþ¤Èº!ùð,Eq+nù0] c÷VÓG	Öôþ®Û´Ç³#A&}ÏU÷5Ie=Mfs¢¥Kk(¥[%)NDí>IS¨ùmlÞoîÛôúÝÀqô¿l½±ÃÙÚÖÃoovþJ£òªá©Î¥-%+­E>"Ð~fà%*	£CóLK&/8w£Û	&*$/¸©á	©K/øtèé½ômîÇ(cþ=}LX9
ø÷I¦~&[þd#|Òv\ò¤ê#eGÝ³T8ÐIn(ÊÓkÏl¾ÇÕ\´ÓÃF¤uÇõÚMôÁûp¥KYal×s1Þqþ\ù$aÜgÑ¨782þé'W 8X UCÞ\ÛZäåØ'j@ºÎ2·)Eâz¡´Êvì;_]^ÜWn=Mâ"Üi·roÒö#qxçfï¹îßxÓMÚâ½Ù5g¬zÝ-@¦cTóüÖSK!¶[ÓÉG²	´ÓMgH¿Q@o#Ë´û,Þ©Uù¤¢ÒAâcÇ¼pÙ®emõW1ûbîÇ8\ a²îiFp!I}ÕTÕI%SÕÁ5QÅRCIÕGÑUTPë	LËbT<ï{@d4¼ÊÆÜ'%A§´QEm¾ÖA¬µDÜîé¶}êú´òÄGÆrPfeÜAvØ5?Ûj^]*íÎpãÝ2nÃ¹
ãçâ«7;S©ÞÐ1ïH&t½Àa[Ò-Ðÿ?ß7>+;é¶T²rÁç´ä=MsMÆêÌ~}[cÀÐ÷½®Åû¡laj>£xüg§nEÒl!4xwígv·P.'Oæ)Ê­Ø|©NvaJF_XÁ¿hàùËã´CéUSrÖÝQl7éi,Ô,»¼é9ëñÔ*W/P/¨= 
4SÂ¿^¬2Ò
w®õOÒú6â%ìÀ³îj¦óOÊV}#¶Ó3ËÅ=M  ÙiÄ×$ö	Ù*ç9xçJÁ¥{ÐµhC@¨õÜ"k è~In{ èº¶Fñ ÿåÜ(ïdÞå6Ër[»Æ~oýG
d_­CTþèu|«¡[u+]¦Öì!õÝ¼*Ù
ë6GÁoôÀ[ôô|zK\7AûO­Uoc¶-p0*ÆÃâõ¯ôÓÆßoV!¿BapÅæúÂQäZXø¢H­\"æ»Úû,j¬ @ÍÁÅ@)eN|/4¹hpÂ¸G#µí¼ðD¼?VKwÑDür\y¬ºëoâHnY¬V}bËJ÷>=}á£R^ £¦«ú¡Ü%ÛÐù Z¾±u'Ô¾A³«º=}t¬ß³¾þøØx0®Òô= ;Ä­Ðz<·pBëãp$öæÔbk!uÄy¬¶ä±®ÆzMo¿ÜcÍD*¹·	Cý>äpºZZ;ED¡u£æøq§Jÿ*ÏúÜ=}»,þdëX~pú}¹¶GiájÛ= ìb1·^t/ä÷ß;go¼Ö¢'°ý}ÉÎÇ#[MV2èëvçàiÄo0ûjÉ~,]@ª®Q:oô2C|ÁKýÏlî Ì¯
ÈW¢[\çþæ	{NÐ¢Ãíz°ê¾>!·2¢+"á[R«	²j©la±¡¹lÓÕaÍ&FáUÌ9SÇ2ëµÑgm÷r²×Nê°-aRùü_LVèãù!29+å)>
pÊCÓ>Hiá¼íP"ø@aÕ~Àvu¤7):Á@gâ³Aû$9Qbòç9T?[·xvÑüv°tæ@4A~åxE÷Z148aÉi²Z1e p+VåEÅEAFãYMû= ,èíhÆØ	y
©àEN¡~Ô_lÆ~T4ð= ò¦õ^Þ¢ÊQ¾óûbvrÌ3ë§ª=MÝÝóÑZ_ëd>×<OU#ÅpÞ"õ1¼Ö'¶Jx¶^wEPß¾´Â kU?^©ÏDªLÉsn ù¬qÓÛjÒªa·ÙöÊµV§û¯eÑ¬¸dºò°d½I[¦v­D²òüp×F¦?´ 4@.bÞRÐ.+M[\= CÕ¾)Ví8sroÒÔFÀ(»±¢ä¡!ñÀGjt_Ã¥¼û¢QÐâuÒ¸ô0Öû´¨<¼±(Å.Þ¦Á+#«õ1Ú»]ýrê)üê±»~åjMNrKEÉå]³ìöÈÊ8{æ¦îF~7=}oVOåâÓ:ÆTK=M%MÉKm%f6a=}·2+VAÑY¹^¤¶7OfÒx)ãj1%aBHeHßøJùýa¬}À§ÅO®=}!à.¢'g7
ðQ¿ïaãôuô<ß¤×ÖuÙ¿¥hÝND Ü:¦\qUÀÁÑO8²795kÚU­Ù¢HvÎëµnOlÕZÁ¤<F)KÜÄ'ë"n³Õ|!$
Àá±þÂÈ',zI}:­}:íI©\!$Ú¦Ægd«ÒMQ;ËÆOHò;QÑØoMj<HwnÓÖ²èål¤_sëøYïWG@øÞKeË¾932ÅæØÕº=MÊ É¶ÊJ_UÚþM/ÑÆZÏeÿi*vÁ§K{¸ÙPª[ã\OìmÂpJùþ¿?ª1í\T-c?uaîwÒ+ùgfë_ÀOþFðj¤® RôºD¾<²úÃ½Ý£Ýdïì£½£°uºÕ%V­ÏÒGÊ-ºz×0l>*?à4ÓÐ,<ÇkÕ¹²ÉNÍÔÔ²Ò58mÄîr?å £ûP @bb^Y(±ålèÅo-hÅv=MöÅkÁR
mXÂDmÃ.Ç°dÙKU³ = LÑëø"Ôuqã>Kä£´0°ÒîdË U ÖÎ4V»@]f¨i= "¨»Øk°Âß9B=}!î¤5ìgýë©Úz¥¦TáJC!êF;4cÄ\VJYy'@úÿ°kÏ·ª{üj¦»
GN$e:iª¬ÙÍõ´ÊÜ²ÓaU¹Èßgº-vm5o<"DRÏ·*ëÀêhx÷= ÎÕóØê§ ®:ìÓ ÄF±ôZË> = íbC¦[É¿sDÜ-bÆÿ©n¯¸Óµùñb¥Öó¥Ìj®8%7Oüýb]Tb'ë´Ê¡ÜbFÝ[µ"ÚÃÀrº:P¦Ùt §2ë áØÅ6Júì¦é¬
h¾e¬îNd+;ÊÆÃsc7ÍâöKc"F¼îCq´}Á éi:(Ì@£ý¯>©'ªjaÔüÏªxûtð×êÏ?yg¶[QñmI9ã)DÚP¹f=M|«§¬ªØ1$~á%1Ô¦aÎÃ¤ÜQ¯ª¯X­×>hº¿ZïeÖ	ÇäÙ÷rAÙ!B:m8$;±{ÅO\%E%5ÕV+	¾Ð°kLkN|	iqÞ]&ce6Æ= y|Ù«c¶«yºè= ¬é4k?VkÈWÉ0Çdd¼Z[®ÓëWÚGå¯ @
Î¦	ô:º5Î wãé2£¬+sÉ°F ñ !Mê¹kÁ®j/V¢§÷1¤ê+oY"&h&CkR'zØÔ LyYÜ|p$Ç©J«{ò °6ÊúÝ¤ï¥ ü²âE ôNl]DG¾â[³"èGäuïöýøD±_º³òm«x5­´/763X¼ñgèå÷tÁ»×¿»Ð¼-¯N§OG±6ºy+þß­c^iÄkY;vùGÔz»wõÁn»Ã¢ÌQ~~jÃÕÂ.øu´]Ðã	®ìGMm¡G@Ît¿¯u«ÊÈèòþ@¹ËdKÎd6õíì2®ü.$a"Ç>}?'JVfoL·,;×%Pj<'ñ7á´¨ïÇÂË9Êo±îçÐ»¨Ë¡jÕ¸ÎúF'²R¾G÷£K
Nv0¡0:°K.¸¥.Úl¥Ùñÿ®^!¨d«pÆ}Ï+KÌè¸éIÈ¥¯¯WÄk
´ÊUeFÝ=M÷=}@í^Í(4_ïìâgíäÛäæsy·äZeGØÚ?Ñy=}é¯W\ÁéïdÁ90ªæíeÀo¢õpÚoÁ?ÆF·DÌ0~tïtjLD2¼ÃuÝ@¾aÅîë³Ò
C¾áHôÃZERvæðÁ< #&!àZ-Ê'©þéöBæÝ÷/ÕdH¨4ØÖ|À¤§b¢*ÏFXº £$SýôªÿPÓ¤ 4é}$±ÂÅ4$Ü]Èô0l}Y_@7ÏßÏÈ­Ö6M¼à÷èiØX= Iï¼Ò£«¨ì0$°u¦ëì~³þnÓ¶©±ÄÁ¨1]ö¼]cCaF9¹jé>­ä~^X0û)cqJxÅãrDuÊÔ9J&²/¥Lç#ÖxvÒº[³¸
(¬«k´ë¯ÝÜÆwêÃïâÅW­6Ý©³ÖaþV+¸{.@íºXózHÁ6@{)íjÂHùSÀ
'G¤Dîë-Ñté²N$ÎRÌ¤oî4÷vëì~I¼_c@ÂÝk95 ø§PD MJ´ÎxÑQ©ÃfaÔv0buÞLQµT 4eûÌúÃÁéq=}g°ì¿tïhÝ}ýºûBp}Ë Úè·­ 2ù&{íï_ÄÆi»íï
ÝÿÙë, ¹Hï:á= SÀ©Ñ1JdëÛ*}\½ùÌ_ÆkÞ:ÉÙÂ>dÇyîÐ)dH4Åî2SY$ÑÛ{TÂðsThæÐäö«-5^Ã®SÈE ^gOlö_¹/·´YûO
û+Ä¿ë¨ðetêüu¼t~#dê¬¦ð)6|ðô}óÇUæ0³Ô|Òjá/äå^ªóéýo¢øZ&ÌÇl,¹Fùä>í5voÓT[2'ÄtXè>õ°ÊJæG<Ä¬moKijÍÑeº¦ïk;ûµÍªÁìÀ#ùº}OD.ÓaÓºC<ÿh¥³@c.6ÿõMSëà+Î£¦ÕÄÃÐÓ$ZÉréÈÜb}l	 ¼e5KHk]\IóaGAk£¼Í"û
ûÏ³oõS	ÃI1ÉUÁñRÌK¼)$H1%)ùøumÃó5T:{)¤äTû¿ùðU»0ÐY@ÔQ¥Æ0RLÅ;ç±æýb|E¸ù$ùî\Âµ1v¶kMè5 ñ7¦0µ?m»Ìlõu³_ôÎ]_ªÊV;²·ÒiÃ]-gk0Úkø¯øw®yä°zbØèXD¯!jÍw¹cà.zj}ëïVØb8W@z»+ó5(= àaôdQnGhÍ*haóû{¤E°þépêà¡ozôNSÜku¬¯xäX¿åR|4.³@¸{£+Í*ï©k÷\Å	b?¾!þ¨´>r$ðëfÙã­o>¼9É¾Px)e´h jETêÕ= O¬IE Tóê)RÍbÏIsHI·ï<q:íÖÏ719A!HúÇµàzwo·ä¶?«vs×BÃ|3´ÛÊ³B>!·EK±µíü8¹d¯ÁÓ.
¦xë¿ç ·çÐMLúDqæ't¦-C÷¬#É]¬§ÙÅÑB³R..6Øà]ÌÌjzÈQéâuò-nE@ªÍ@éà"D*ßz¹i.g®àiüªè_{Y¬t§¢Ò¦ø7bä{ôè¢ïï¬8ó¼¼¬ã´{®EÎæÀDH¨ïªù
Ñ/MËlqIÜv¡d¡!«¨®C@X*YF_NÏ.³Üpú432~7j²7ßhÂüZõúçûÌEú6¤|[í×4w[S
ªý£Cê~j®Mìj¢IW»¨ûsøÔ,óÝ#
¿ÄÜ ÌgrÏ¹=M}Ìßù´G&ì6ïÊ! C°|ÓKcîëÿ¶^£¦ÌZT.ÀE_ò^ô72Ð\öV<1¡
Ùc&£ØX#d#¾Ìbp/5Û{o5ô:¢¨Æ©sñ©ân= 5×rê_2ü)«¤9ìkkÝuáuÙõXÀ,ËÜwòJ¢­¨sÇ«þ«¯ó8þLúb°Ò±åjXYã2aÎ»6#'·4ËúFÔË0+ÙÐT!RF°OæçÝÞZ+ ( 7/öf÷{Ì2Ü®Ætuõè-÷é|"víÙ2v_#|ù3>.gXÏ:÷rÂøv?>¶IÄ3ªÍÔ®i"ÿ=}p2^0J4º(7QRÐ¼á]ÑeÄäSÊØ-ÉÛMpû9xªzõ22TécÇÿS*T¡ÈÄÉQÉÒÉ©Q©Qõ½ë%ÂÄUol44*TÌÀUaÈÔÉQIÒÁ©Q=M¨Qµºë%ÃÄUû
£CEúLõ52TIÒÑ©Q=M©Qµ¼ëÄÄUl43*TÄÀUÊ.¦9ïß]¿vô.CbjºcQÅ_Ì½xYýT¤7©e®KzâeËdFj¢YãÛ,ãZ9üró#v÷"7ï?ë]ÿÍJ"Px"ç±è$pÙ¢Êÿ=Mè-xò±Ì{òp¡Ddú%¼W[w®}»##GT·é lÐ9ÜoL´ÉºÒcäªHW ª¬=MÁïÁX^rø!pJ#Úe±Üúo;¹æ9= hûé×@YÊ©[B|Æ£®TejëZ<jµ°­° ýÖÛ£D;U5B¶,râ	_¬ï0°å E9ùÐåNÖ= îoÇV¶ÅÂ¯½w-ô@ É©Zª²ïd'l¢íLÁ÷âs¦oÅ×ô°/Ò lN_3¦%=M#ü1¶ÈH_aÛzkhÈUGMñ79µC÷ó÷¤[XìÎÞyÑ¬ÑÕÌ¿»jU5±Ãêdª©&¨Ù:ó£òÝ¤Ý%Ý.Ý¥ð/NfJÊa/5H¡ÊøÉÅD>ó(©÷èqª3l>æ5MA3h0=M=}*¤¤Ã=}ªñ©Iòð;ªó¨,ÆÃÿ¦Ýy_õ|eªÙ= 6]k?.gûÖNG?È
çpIjâB°
âÒ {WGË&þvÈ|Ô¶lo8Ö=  ÆQyºrK+%>aô³àÄ·°Wý@Û«©ëþÐaf:hÇòê(»ÚfÎ¸Ëe NüýÔG« [DqÍrVËèE$cóDG*é¹sAºSY¹²J:(¶Û1zÃC¥4[óËÚ¯¡"¬ÎàNQLÊoòÜÅ|mÖÒ!%ÿõ¾vyfN¢,¼Õøñ1«
=}9vo»ÞcÚ/oCM6ÿ>IãýõÒÇ2Cf
®ôÄ~oyþp$\±(æ5j
o¸#KVÖÙÃÛdjbIÀd¸ÖI­¦àÝu²èÐ#Ñ>BUý/Ft4Ù= À,«&KÔH?IH)N"ÓeÞsçMñ?ï//ÅÍÅUÀÃK¢,$§8=MH00z/¯ò®ä[gu<ÖWY\"DXÈzQÊ°ò§ZròÖrn^fvvWlîyÖ2÷VY\Èfs^^vvÖÖ_: Ô+KPK@?Ïs¡§Â+«)+³«)3 	A3ÌÉã½ÖýÚ'Ù&]«Â2uYÂ×uì¡D]=Mä®|'B¦?´ÃÇRÜKøw¼{òâixÓØßñü¥®ß¥Põ&oíQÚãé^½íK_ñ}¹Ì»¡LÅ3:~Lo}«.îþ²zÑÚÃ{WºçÀá°Ý½)ñf»û/ÍjÇCÂ±³FÕÁRnzÇlæy?Lðl4×ß$elºvÑ{­/Pý¡ÑÊYí5ýXmÂÅÅ­KÂ<4GÆÌôêêÄ(qx%È,éÛÃ@³âû!Àca?¡½Ñ÷Äï¡Ñîªk'ì¤.=}+_¿"Æº±e¢ÀBùcCp¾Øp>ú¤:và÷¯¿ãÆ»5¹1¢lÂ1Ã0øcÇ¤«}¦{,	é´ëwÓ¤,vÇp¶ìv9ÑÂý}£}Ì¸ÆW0ÓTsq>ÂÝ_Í¿¸5ûN7í"F¡üPÍÖ.ÒQ¦W:RÈ·s~ùø÷WD4VbhwaûéÃx(c*ÞÜo§lá¸ÃÐ¹ãìª¢B'UR17?cÙMuÁÙ*=M]Îñ}eÒ¦Û"C47IS)ÏNJÄFàUbÒýO×[òu#=}=MÕ(¸º¬qA¯_B4ä»Äå\<Lú=M=M»ÄÉÂ
]Üs.wô1eOsíËÄýH&s5
*-óLÝNb2¢OyrÐxÅ6¹Áãëù¡Ã?>Ï§?ø)ê=}/(¥ÓäzLtëäÇ=}zòL,ñÞ:?srãçùûZÏ\ø? ü@b«óO+e"+,+eøi=M»K¹Ðüõ²ÊXmbõÔ³Sr:-S&= ®Sb9Wmqaê7u¼P¬Ã³Svï)_«GõL6@½ûuÚSï©4é¨m±.Ér+¯Ã´ûÒjG¸^µ¦ç8c<¨RÚàó|wiE*®WA? ±ªB G©GMª²Äf2É3|øë8sGk­ûÎåàñdÇË-ÓxLúNÒ´í8«ÄGpk¥{ÇëôAyxÄ;þN©äàýòÈª3Fömg%þN)áà½ó´ªÒù¯¶µ½x?Jø8±¤CJø8Ä	¢²!YÐgGò)!òâþÎ'?l«äo,\÷K;éJ®4«ü¥iøz7}¬ú= ÛÅéFSe,íKC¯GQ¥7~ÑäO²8{h©ÀRUêðû4½þaã¦%4|OKVÊô'è&¯öáâ¤i0[~õPCRÏ±DÆfIIÌð= ç³Åy¢0IÌÈÝþùÚÊçïÍ_:éÖ\bñ*|yß\îåcç>)½©.Ã-Å}ÄTê, ±'´kóÌûA^
*6-H5HP>Qûí;à x¶<ãÌaÂìñ{]¯¸	Ý11½	1'i0gñQû<5½èòe§=M;~eoÂ_¶A ÞyCªÃX}Ì Xñr-÷ý«F©Ø)ZyFMZZUÆì6ÃØÉZUñ6Zm_Tç6hZí_Tß6©ZEgÒð6õ_twÎõö{Nà6]'¤«	Þ+àÐAgÜÔ»Óþòðò>jCGÒi½±.0¸qæLÌÏmk&D°_Ï½YH[{u_=}êRÊ4«H©WOÃ{]:=Mêjæ5ªH¸ÔIWOè=}XHA ôc½ê2cýëiæ¥Ïv:vÅÏvõ¦Hª4¦ÈvgÈóAD°å'.>7>ùk³[ >= &k¦>&»mÖ~0[0«
Z°0W0§]ððV£jÃC h=}±¸Ë!áÍ{jØT ·\ñÇÏkX>9ÀÂØÜ7b]xà=}+jÚéæ4»«çÀp@«¦@+bª#Â+/ªOlOñº SÆò1ûøîÏôêáó§½§láÌ§lÉ$öò¯b¯ø¬ò¯¢Û.£»¹/øºò0¶t©Þ{8º_O«¸'qºbZÙÎ¦Ý8xÚ­¯9¶Ý qù;'0ñ¹¤"]ÉÎS0Õ«»XÑ*9 $«õ1¥6d9Cæ Á·¢T4d´C*ì;&Öt´5}0a{ºßvµåQ"T ý&¢[émK´ogÅ\8Ïï«u+¾"éYq*! >º5ÿí;'ð Í² {LÏÙÒ¯y&Ôþ'y"]z]<Íð¢¼íô
"Sâ-èä§þ[è+Û n*_N:ºìÞ/pÄÝáñü(,éðsZÜép
§Xe®±îhøWÀc}w¹rÒçÉ»tÆâ¬ryäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëÇäëgàÒGÀãsÁGÈ	+ Ðµ Î®ßT.gÑí ´·ÖÌGèCC/\:a hæ%O?Ö:ýXH1 ´dÅÏvÿ:ÖRÜè=}YH¯{%[:-ëqæ%~qæ¥Ï|võ¨HÊÔ¯»4ªHº÷:ÿÖ÷:Ì´­gÈsçÝ;KNðãðôhä´¸Jþø­k³Wøþ[Àk³\>X&[àì¡à<Éiößø¡´õ6*	Ádm¡$tu"(ügÊ¦÷1@nÚÿ´ÖÞ+Z´Ú+¡¦d+c\Pd"ªÓm-vAé ðy¾ó¯Ñßà¸FEçðEÍ¦l1ÄöÜä®K{êúøL²¯âOX ¸¹ÂåCp×t/ÿäX¡[Á	¿jâ	@1þþ.GZJ¦é·ÏAîÁú»ª«Å×û,-ì'¨Á«+å×}È5¹µ+yöÏ£UDõTçPþhTT}Q¥BÃªKiÒ   8Ï±hQÜ1íIÇÕ,¹6o
9&¢]ãÊy¸_ÜQ o^lxÊÝ4 $81:wãþ¶83oÃîË$&q¿"çQ@L´0ÀÐ\àrÔþªªbÊ¾L¶ÒY xÄ&êBW"Iðêî8³ÓßYqViEg¼HñÅ±= pK=}2iu{ñ®¬i®8¬sÙìþh!DÀð\ÑÚgâ³Xõwâ6v$gcÝhÝæ6³Úgr»ØM7fÆNô|Îë6gØ-^°Øug^TØ¶£F\kØõfÒÜ6_¡FlÉUZ­ÕØ56T_SiR|M¥F~M¥F±2ÅÉUG¤KÃÑÝÞÏÆ*tÏPÿ;¡áaIÉ	ó¨±.=}TÖ©PÃûÛ¤?=Mêrûërû5ªÈ>êý:&SÜèýÊ«÷©PË{Ý¤?	 dó(½êrû dó(°÷©°Ê èýJ4JäèYýJ{Ý¤?èýÊvMênæåÏvÏv~Ïv±{ÍYHè½XHØèýYÈ­»ëoæ ô= èW§HÄh#*mÝíM@Ú¹2LSÜ=M}|Ù1iéüû/uT?NC6ê¢hòè_e*hB%ümÜtêt~¹Ø,:*¢ØUD>¢Â/@çG¬å*¾NÃJÿ= µ×2y;UÆ­I]yðÝ³+rwÿôéç9¼Úð{zRã¹lS¤ªNY¾/!6F°ÑÖ°©­N>üÐ46tâ1nø¨scwÜ§EâZW	[¸~Ð, 7óA;ør7æcÙE²J
½è[\¤+ÿªlà
z,ö¿½ÿQò²=MËxG\¸Ô_èGjí}¯ÁãÑr¾Ñ"Ü£Ä,MA¹­ÉèE.,,AÝ]X%*À>o
ÍrCû êì-ÐLáphL=}Ý	tæSA/CW/åb½µfÑÅ!ÔËRUeÃ÷öV©Ö;"
ü¢.%êNäÖô= f¹EÔ¦§%®ëIñaÛèÊ9	l¶æbAaëçò;hÖùÍKPÏr=}yl%a&Ë-7©dµÆNí×é/öø
·sÃËÖXð?9d-ÔäÔ´Tæ³õ»¤ÚØÂ"QmId
Ú(!HºÊ;É·Â:ôç¬Õ¸+Ù<0ÁºFuiÚÓÿ½XÆÑ$9(SI'Øeqß^£FH¬´ç­àewîzøÝä¶òÍlÑu¬£e)ð¬"æ¢ÜaA«<|í"ý¸ÐwW>wìí$¿Nì~D|l¢Mg9Ê¨H7áÂzs!CA²ö=Mª4Ë°ïãÖÚXHLÓ7yÊ²ã7«N0<ýözaî	yGåxàè¯ôk	C|Ðí5ý^úyÞ>û  NäT/¼uÅjì¼#pôQMø}9ìÅ->7Z¿îP§µÆJd¸KKw¬5G(ÿÞëVÓ®=MhíÕÌ9°s?BzìMÉ¤ªoòY¾9Íÿ¢%4 "ô¡¹(Tg=M¥g&«è=MÆ.s¤eÆÝ/±=}Ñ[]gPéÜ£í¢ª¿õwÃtÑbÐ,üu¡q%ø\Ëq æcéº{´à¿æüXý>öM[ÃÎ¬O{½aäÐvöjæaöÁås¨åñôêläñc±¦lªÂÈÔ7ÂÄÉÂµäãúyÂyDwMvB¸§ìÛH¢ ÔØÂsdDôg­Nqþ×ta4ãkÏrÈv1?Äs90ËM<+Ú#3p7f´9³[':ìI>|G&\ÎU= ]Ó10&8Ù9ÃBGâ#´9,Ã)âáºëgOk\¦5LÞ9ÄjHzÉA4ªæhÈ°Ý\ý©9È¡o+2ÞOøpGm,yÁ ®YúãçÙ8ûäköt¬åºrR×)h§$¤m;BeJTx&µÑÙÞî h+v¦s¹ãNcþ&ÞóJ §¯É¦
5y}NR&\#3äÇo³¡<1<]R¬©M$v¡¥ùØ<Üµø¢ >ZOr=}ÀÕâöÀßÆ}xs:'ìbøîpxàMÿ® G¥ªBøÞM{eýª´ß'ÚnûÍOâjÛo~½;l¡GU.ÎØÒY×ºç®«kÔnµüF_Z·rã¹+ptAÙ¾Û~FzþÔJ+nÓ/¼{©ç°àîòàU@¦x¨¶èè-
9^è*ß!ò¾Ô7ê4èèµ®I1üðµ3w±ÈÔ7ª1j·Gé×R§	§BÃ-ç<m\HaðµÎöçZOÛyØ·ðµÔ·âFv*Ç/ìã%ÂØÂ!÷ðµ¼Ô²°çñ/i&xÆOÎ®ö¡"2i¼_¥9ñEkùø£Q¡êÄ$ö PÆTË²ÚõÞU Âb=}5d7}øFõëiO¥683wRjT¦»ÉU|T¿^gÛU£ªÏÏU!ÎÅ^gÛUªòUjTÏ^gÛUÃªòU4u¥75ëÉÀòéõã zÓã³j)¡ÈÞT(j=Mþ~OêÕvk Ø¥{Îusç6©#Ý5=}Ú:|kH®7z/Üë¼-´Ûþõf(o,DÈÔZûe§Ä}òþ<Y¤Äw8±WaX WÖ,6ÖÌÄ}¢ÂgÇõJÒÆkoãð ÛqPZ8Æ²JºLj)ê7ç^ÕµU~¶ þÈRáÆ¦!æ;½Q¯È-!%ìµB½Oû¹O½gÒõ;iÈ	RºOKÔì5ìµÏì±w!EL	Ò@®ÄÏì%ì5E½OÙ¹O¢®:4
nÆkjUðx=MË7Ú}Áº±öûäs7$Å±è¢ ß
ÚØý$XÚè4Â±þðÈ1[o¯Ãb´ÿj2Ë$Õ0R½Â¹g9¨´PòèXâÖªårÉ4e'Ü~éé¶RÙÖ÷3Òb×È$tÒÙÂÍî·¿!nüê6âv±?½â)b³h6ÛaW"çR6Z«\ëv4­Ëá/Õ¸±®­®pªÄTø_Õñ%¬9ÓIµRãT m,øcYS:ì*V°= {yîå59ÙÏY°M8ùVAóìµWhòi1àú 
ðÛjmZA= ~[ÊVvè§ß"ó634áò'ìPâºªSò£l§½BÆÂ´=Mô-.0²9ó"ð¹JÜúYëÕ°UÇÔÐµtbß¥ºâzdAÚ'ì!»
jêW?ÉI|Ú~áý!nnáèÏ@u@^/é*C=}8¬+·µo¡ëûlíÕ+ªÛIÒ¨Ù÷ÞS
oÊÚÊõptéq N¢·P1S01$Ãæï¼eÚ§wA9-·*u,fåëº(nÌ8æÕî~âPñî6zÍ«¦e	1kM*{k¸g=},i~èø¶â7L/Ç qÄÂñ,Z8½Þ¥:Ý<ÚÀòQZú%|0ÏßV¦Ô i_ú»qµ ² ÝÇíÝ,l*àú= ÄC=}jµÚJzaö5ÎioûsOyµØxF'âJÊ]yÕyÞÚ¶B2À!LG¢Ðú¨ß&*Çúô¹âj-lKÿÅ(^Fsq5¢#~DÃ§RÅpmí)¡qªz4»+ìfýhbÛ²;âú¥zr¼iñwôZo¸ÝùM$!Iç¶ad-&vÏðÞ7úêËÖÎH­iÏzRÐÚËA$#+ê<¹-t:DÅÂ½]ozYwîóÐH¼Ëðñïç¬¹¬X«£ÃTµ6uAHÐ£ð£ËêIuI%ÕfÕ¡Ã¸õy5BÁiÃ»!JÓôÝÈ¡9ÂtTæøÂ÷8=}Ó ¤é:Üz(±û÷Kb¡ô0ÐúÌ®»¹)ñ­ÃOw%MêD¨]l<ÇÅRºêçGÞ°@<«øúÎ½q¸ÊÕp Ò.üÝ6P¡\ÞßIG}Mp/qÇÑ¿v,§<)Ø&êËFªè:ì\Ìr_N\ë¸ñb+ýàzÍÝ´'R¡ÌGÙ|ÏÆ¶
j¦sÏ0ìþjðW)°âmSúç'á8ºI.ÄhÐÌðÑëÕÔÿu$Cl±Â{}(L ÛûøN%=} ôÆáU¹êb×Ü·2]îý±m¯ñÃ;cí8·8FdßùuÝMlÅFdto}ìÒ!S!H
qiÎç0nw¡¥W¯XQ¯¸.vY½àPfÂðºêÐÔ»0ºMZ÷Çÿ0= £évGµ·F,Ý×·ñoG§v{H&xëh±ÚjEÔ¤à;66ÏÕ3óÍz;Ï§4ë¥;±Í$MàGêá&Ðëo!3WØ"^°Uµ´Ôù½,b#%q´@;lxb_mÅ¹Q¢óÐÊö´36ÁRp!
òòÉu-;Hq;§Ï©ÔVcWHT4\VdaZ¼¢·V'daÿx]d_rqhkzyÆÍÔÏÂÁ¸»¥ª©°³6=}D?RQHK.5,' #æíôïâáØÛþü÷
	$12+(UNGL9:C@=MûøåÞ×Üéêóð}vunglYZc= ­¦¯´¡¢Å¾·¼ÉÊÓÐßäÝÖëèñò ùúOTMF;8AB%30)*¿Ä½¶ËÈÑÒ§¬µ®£ otmf[Xabw|~¤¨«²±ÌÇÎÕÀÃº¹x{\W^epsjiÿöýìçîõàãÚÙ4/&-"!<7>ZY¶vVVXÐ1Ã1Ã1¼Ã1Ã1Ã¹13UÓ[whw\øÈ÷VHcè÷°÷Y0 e\ =M÷= À @÷÷Zà@þ¤6r¤AlDAü6i¦ÕF¬uFbå^!§Á­]cñ«e	= 9¨*yäùáI)©ß1Ó&Ñ,qâáSÞ%S'ÅN-WR%@q1I?yèBÈE DD´rÄäÄC¼¢Dª"
$Ø$CÂâî¤BÎbEbÞÐÖdY= ØVÎÅ=MÃ1Ã1#0Ã1ÃóRÏÜlÝßn5(	ûj(¬+ök·¼=MÄBÃÃV}0jä8ÆÁ¿Ã.ßCtq±³¿åCt51}6©I=Mv*T&)Ô1Ä=M³ÌÜmC
s9h
#äIÃg½Æ£¢³I´·[ì@ÇÛaÑÆ¦ÍAÒ-µFµcú\uô6ûÔ,ÍåÆY­ü,y*-Ì>Ã[Ü·
¤+_nþ&a3qÈÁ§Öà°[û¦²©ÀpºÐãÝp­Wg$8X8XÆoåÞaÉèåÝÈFáVR}9nVÇWNàuúYEÞaÁ|VqqÌ·ÇWÜézâS[¶e/zQ®¤²Vì¶ÇWî¸nþYäVV^öÂDÊ}^wfhXwÚÚ^wfhXwïwwf^ÚÚfXwwf^ÚÚESÞMEMõõ{U]xWxòÈâf¨²Éábmx$oÀIß\>ø#m¥~ù a= ÈårÌ"	ÞY8"h±Î9!dtÂäq¹î¹Z"ãkbà_Ynø%µ@ïdÀ6Þüp:ê,0ùÛéäÁ<ðDÐ÷åÄAûé!@8Øä0=}óHPöàúì5T 9Ýð Qüî=}´7ã Ñ;çàÐøÖÝDAJÖVlZV<|QÃ1Ã,ÃyÀ1Ã1ÃA3·Ü= ¦×ÄNbZs¶rÔØµbÒcvÒWL·k[}o2×¡.VUÙa¡R]ÕØ[Fs«F]ÄÙ¦^6¾XF\ªÎ^¶Î[4gFo$FW2Ý³m×W>÷§åpÅpµ§[ãõþ¼ª³¹öß= þ@þ)®S¾lø'Ã#Q¾'R(Òá4µ­ð>ß<vqóñ+ßo",¡ñ,<<©¡ô¸p°ëî¸",ÌÓ(Ì
sÌp,¾¸Õ¹!0E0¥0DRÁR=MDÕRÄ¡=Ml5åõ@ÄTøÑÞ5Ë9àó¬2ÙdÓArÊÇ!$Äþ))B@åJ½ßqS8GUøUç~ß%PK ÔUÇ÷=M|2K0_)q{êiðÐÕÐûÚeíÚZJ.>w;;1>;-þ»ª¡?ý¢ã8þíÈúÂ©,5ÿ9ðÇKî©©5ãeí*»@4ÎòDo} wËc\	úãx?ðÊÎNèú½ÙÐ¨+öºFí
2zuéEÜCºòoäè!£¨HÝ7¡H¹ÜjðïÕÛ[Iõo,#]<éOðE"­7å¯wð4¥m		=MJÓP+Â»¡õîc(?Ï¼ýó
·02Êóïô(ô)£+J·°üSñ$Ù:lÊ¢rî\¹éàyNc |Eé_VO5ßsù^VLjQrV¥çë.¸*7Ôi*à7Ú%N§:9{·ooäÕßò£ÝÞ+¯;xÜÞ=Måx@7w¸HHùæ²ãâ¥Ç×=M:Ó yÈ½mÏ>tÆVfVVÚ4i0r,ü#¹Ãä)ó9^wÚf^wÚf^wÚwÚf^wÚf^wÚf^wR5MPõ\|NðÃÉÄ:âÚ<p»ÓeûU¶ u@±îÛÍí6£}ÆWyÿ*ÿªÚÐ¬à ¥Óÿo»ùâ*
H¬ñÀ£¿[ÆW¥e|°²!Ùk¾¾uC^@0pvVr^v2ßà¾á"ÚîäÎÞ	HlQGjq%HAhm¸vüºo^Èdàå|.Zyèd4úÀ&aÓÜÓ_9·ô¾yRÚ°e-j§näCîì$Ì'D¯¹ÅBçë5¬) /}ªÆ$iKó_àù	Èp>Ùä¤ss:L]tFITUÐÃÅD=}RÚI4P»ÍÄaU2jt8ñËEá¡DciÍ7Nå÷ÆÂ÷9Ô
¿àù*¿à¦@^±r,1lÀÉ±Ãä.ºA.¿ å¾sýëû¿ûÃ?øË±Ãä.ºA.gñÂo¹÷M%I«Eµ |*p+XÙõërd ûÄÎ®Ç¯®æxànë°×å" rããÝmêQ!yçg.Þ2yðéÇ %ÏÂÓë ¬¢aòôú?Ã¹úÃëúÌæÈ¨°Snðts¼Lî¨O*ÔeñÆ2Ð2æøE ¨=};?KãÊÇ°6òGò»ð«ð0,¤tË,À}1fÇ$Ûõ(µ¼d*±AcïN(©ß©*N~C[Údôl(çJø)î_ó|çîî°Ù¥ !òã£}jªQiçbyMâ<ì¦J2è­*M@Ðs«×11ì«P1 ¿»±u¯nÆ\
[Lñ¦óu¿l¢|4*!]Ä®ÅnìY¨Õ¥où³46øèvv^¨aáóÛDD:¸¸ÇÀzIpÉZ³¬&9E_9ì¸¡ÉY/ûmimÿB~=}+ÙPhÎî×"~VÂîKDü:¢¸¼ÀiôéÏßj!½kQñ	!ç/.B2!ðO Ò%kÏ´Ó3¥"a²´:?Âaú[Ãs:2¬½Ìc ûÉ9Ã<l)rÔ¤ÕaÁnF¯Ó\Ù@ÿwVÀúX¨ãùØÀúû9b?:ÎíÀG¤X¸ i½°ü¯g+Å\ïC¨=M «Í?#W½*ïÈÏÙ{eôu§?©Ózgçí W²¦CÚª½«¨÷·s,¬¯ý³ãGW­ÞA£AOcla²jãü:|¸y»ë^ùä>·q
Û3Â1ÃBV}=Mi~²ÌpÍBÍaç÷óB1¿ý·ÏË/3ÝEKD[MdàÝ¢ÝNÙì¨.kÇ·ûe~ù«¶»¢Â"í¯ 7à[¬D[@èË+~cÊùÙo×>¦c±ÃìÀb¡Û¾û0;dþÙÄÍÆ~^mÀ¸ñÃ#¨évYÖx¾QF´Å.mAj¢³Òýû]DäÊ¹]:8WËµ]3ùEDöÍÛó¦ækÃøj}õô%gÒV¸¥}ü}R©!yNÇ:LMÜÒAÐ'Gî\¹-ü-R!¡N:[L(ZÒ ÔxÜþeH>ySGtÓ}4Ýj·¡àÐÕ3·Óoøí¹@ÁÍ¬Ðñ8MÞ¿7 ¾ë¤É= Z·óGÐÔìî¤¼²{Î¤ð¥¥ò-²ZKÂÖ$´µx¼èÉï$%_´ëlIh­Vù¡5ßv<t¢ÓÓ$ÄÍÖ$½íQ[Ç«0jÀÔ[ÔWTøG-~ÀSÛSíÚïR= IqD=MR­Ùw?¡HíiS3iS©ºéOgÜ7¬=}¹MÐ#U²2rä]êd3ÁSºO{¼Ç=}aM±Ðe1U2kä¹ ¤#ÕuT]Ë°UÃUmæ½T%SåU¯Æ¦PÿRé¨ù[åãÿ>_AnQ®8zõÇÎÍÆÊðn[*@vÓ|¨½ôÜ6ã$MÎð¼oÕ®s$Þ¤¨ÀÖ¬³4Ö
îId35ó£ÉAõwÝ½Éê|£WÎi·÷=MCÞ±úõ¯:O6?ÒnÎö±5Ö±ÑNÓ½çÑÓÝAµ}à7+' ¦IF¥Fõã5U¶/áßè¹ÓéUÓFÁèzÝiµ-RfR}Re9e&±¡Bd8Å:µïEÉ59UhRjë;ÍÖw3wS:éjQÞÕÆ2]>MBUÔg4m3~Vh¢Ù©f^#FÊXwí(ÛÂÅfIúr±/¤0?óBtTö®Cëe~qWo4Üá+N8wÏådÍNý8y¿ÔübWuZRdÏã8Nqøk¾]ñ·l?²v@\ÜûO² è;ÉVW¨Tñ×óçí÷çÙÛ'å7ßGWgýw÷	§·ÇTWNgHwJ<6§@·BÇ$×ç÷,&'072GªW¨g®w´¢ §·Çº×¸ç¾÷ÄÒÐ'Æ7ÌG×ç÷'{7yGWW]gcwaou§k·iÇÙéù	)}9wIYY[iey_qs©m¹gÉ¬Y¦i°y²¤©¹É¼Ù¶éÀùÂ	ÔÎ)È9ÊIRYPiFyL:8©>¹DÉ"Ù éù	*().94IïÙõéëùé	×Ý)ã9áIÿYiûyù=M©¹ÉþXhúxø¨¸ÈîØôèêøèÖÜ(â8àH#Ø!èø+)(/85HSXQhGxM;9¨?¸EÈ½Ø·èÁøÃÕÏ(É8ËH­X§h±x³¥¨¸ÈXXZhdx^pr¨l¸fÈØèø(|8vHªÅÅvÃ·ÄÏv¿ÄÆËÊv¸Ë¼¼»ÈÉVVVVTVTUTUU VVV¥æoVÚ::WÈîm]ì=}äeb»'ë¾¹Ýý×\yî!6îñg¸	î±Þs ÞYÞ½Y_l\2U×ÖÇ×_yÆÈhWs7<9X7\8k ¦\|2v²©£ïjúV`});

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
      await this._decoder.free();
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
