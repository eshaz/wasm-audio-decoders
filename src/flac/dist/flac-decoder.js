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
    new Int8Array(b);
    new Int16Array(b);
    HEAPU8 = new Uint8Array(b);
    new Uint16Array(b);
    new Int32Array(b);
    HEAPU32 = new Uint32Array(b);
    new Float32Array(b);
    new Float64Array(b);
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
    _create_decoder = wasmExports["m"];
    _malloc = wasmExports["n"];
    _destroy_decoder = wasmExports["o"];
    _decode_frame = wasmExports["p"];
    __emscripten_timeout = wasmExports["r"];
  }

  var _free, _create_decoder, _malloc, _destroy_decoder, _decode_frame, __emscripten_timeout;

  // include: postamble_minimal.js
  // === Auto-generated postamble setup entry stuff ===
  function initRuntime(wasmExports) {
    // No ATINITS hooks
    wasmExports["k"]();
  }

  // Initialize wasm (asynchronous)
  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0157f2ad514d¢­gAÈ 7Â-ÊêÓ3ÌàÓwÊzßéE	®ä9TèWÏM¢{»@pîV]µéÓîS%«ÝO÷e}i@ç*"tOÍÉç*ebm'X&·Zõ~#xX'dÏôKd«²Î+º£¦ç1Ö÷L|=M_at|­rÇíÃûh2½ É Ò.8ô×N8ZÓuöÇ#¾#PY®ÙÆ¯B#ß\ÒÚú4ÚT$ôäDLì,4ö¶ÈÖ®XÞ»"l¬NMD4MáòÃÌ¼8Ü*
9 ÍR-qºzIví2Ø0tæ
#»Ì_iÙNfmwW[_;¶ÛnwWÙ~ NôÊþþÎM|ØÍ=}ó²Ì% JÔ¬Ì¥$vúÛäé¼éÈðÓÈbÈj6¹t"(: ú%øÃÞó£ì$åâ2}îé7i+  lî:+n«~|³K«eÉ¯~ÐL Ì6ò­z«#gî¤aF=MÛÖÍ¦f>ÌáGûú"V¨ÇJ¨i£ü%Ø,ÀË p»VÅR=M;,lwé*lêKbïÛÍU¾ßIc9¸'h0>ª µ;®N&ËdæLª¹+c{lîjôQæ²dÞÛð ¼àëµí¢áêâÚpw¡Ð»"+KhO¿£²ÄeC~RÈÙ\e­a4=}Ô49S¬Ó ¥ÎÙ= 4×¦¸oÀ-S!JC©L[­o´¾íßnõ×Ñxd?mih3NÊp©C
õ^I(z	i"Wå(¥æú÷(n¢{fq!î>KÛ9¶?çÃ{
!S2ôÀ)8â9.WaLR &ÕTà8{nBIf.~ï5òæ"zÿón%Ò#Vx¦cÑÍ/=}§9\YVUû¾ÛV,àÐk¯ÑÛV/çì= ÄÖn¼Û­ñÐëü5éïyI>¦ÇÕG0G>æe>(y;üxíuï R08Îà§éoÐ$:ìRÐ»½:UÌÅ=MJY/=}CwÁE·èâ2EÐ=}³AÀôÎ§CÍ/e­Où×X^;¿¦qvé\õr]è6µÙ¥Tý,s°ËÍ5W-SADÑµ8â"9=}õÛ«R= &ÔÁ­HU¹A!6smÝ§ú÷\- 6ið&ñ½9ªT[Â	#I÷f)?F½o¡õ(BÁq¥3¤û´_(gÖ_y¿Ëü²>Ï;»Ð-}üÕf	Û1³SfÁÓ×X pôÈ¬â'<(kÝ=}¦k±Óê,BÖÜ",Hòp´½s\¨VÒÁ5³Èù0eZ'¾²
:OH­4jÄ¥ó}äé­q3.Xå¦]ÿÒ¸¬ö£í öég\¹z&ê4ïçÀp²Éá}IjþÍ³Ú2ë\X¯{ËêV>-üBæ£RÎFxvÅà|mio62fÖÂ95ÕBTwªVêù*a fCO òºx¥¸ÏùfDÒªÕÆ!fÞ¥ØÕµ#)02x)Ú³sß¡ ötY/þëGKÑ©£Ï-uòÝ}(%·EÏ#ÇõZÂàég?¢tjL7ÇfÁ£´+k?%Gúô8#Øà%ÛÎÅ^Ä=M*Edñ½Óµ½É¯zìûÈ0ÐsÐ¶ê(ð¿£ÇH[ú[nQ4>Ý8³PM¦º6×¾Ô¨ÌD´c¨Ì4tÏÏ¥¯Lô-Î+ÎLÔN^>ÆºôÎiY®ü¨örÓ<×Ëò.-°ÝB;":ScöäM¸á}^éofoÞsKÇ4'z-ãzÞª6ðqÄýÕõÚðÂL¤ò (½óv1c*º¼Ð¿û£rÀáíº+{çNqÀ¼ää/Ïr_Ü´ªèA"'ä_&Át±Ísú½ß÷ÆúæÍÂÌ¡HÚÎ]  Õ÷þq? Å? ¦Lú~E? Å? ¦Ñ9åõ_ôKñûá9hÈ÷e éyVDÆä9¥HÃ¢¾ÓìmYHm6I9¯å¨[yÖ»ñâGXëÑ'þÞë.è;0Zª©O=}å*MÞ¶9Ífgqº]SaNº¾qÞ½£Bþ±ãÂ»ÿ~=}ZÕ¿"Þ*B¡Úä2Ã±Á«òG!-ÀôüÍù÷1ã¬Òb¾±±D¿xýtúeòM DuïM@D8uñM0Z=MüM_è%ßàgG%Ò0¢à!X2Dááð!1Fþñ¾H¬¤qªbRN-(ÎUVý¼¬M¢òûTQöÄÏ©ÅýÇP¥ÉkvLë.M§v¨£ÉRIVÝ±éZ¸S[ÔÄBM1RÔVéK*QÄÃ2³ãÄ&=MÄ2L|^ÊF"¨|LR¡üÊ£+ÂUååÉÖúsj¡Ú"i]TÞHÝ¯niëoés&<ðÊ)7zbslTÝæßZs/ÎûÊú¨PÆû¬{eec1Báúñ6b®feeÃÇÒYyçWGáÞü]FÌ¸pÀR >ëkçKòrß_óßw ÇÄ0	wÍy	Ø×ZæÍóÿ=Mq»sCõ0¼ÔåØ]$q×Ò/¡) ¨Ü¬MîÁ¶áÛà>²Ê:k¤©:ýV»¡ßMÛ13ÆÅÅqØ®äýýlRôé¹ªX°¶ÜÝÔm-q©OK¨¯^¼p/ÜÈj_¾¤ÑÒ#Ñ®fKò~È'=}d1Ý·0Wëx{µÅÑJÄå¤ï2Êj¨·Ô7£9oT7XÀÕiÿ)/;ûé¬ðÊ¾í¨à:U) 3Ð¼m¦¬Ý±<ÿ<0+=}!=M+ÄÖeu}rQ¿-D"¬q÷.ãìeáJlìBß¹«¾ÿÖÉÃ&Ø)×¬êö#Ïë®Ó¶Sù5Ð¦y|ûí=}*ê ÑÝ.ÃNýµõhL1Â!{uÿak«ñÄÑ¦N|âÊ£1ËoA$ê;½£çý{1l3Í	UÈûô+ÇÙ'Ltä5³Ì:!W îû³î÷rø[f®m@Ù|êDdç4àç'6/T¾$VH5Ä×ju8#çàäjðßkÅ§&%ÔËr5fè:lØ®7HÑ# ¦IE¤¯²QÁG!µNdð~ÈVuñª½Cì¨l,É#Å.afÍT7V*§ðÙ5*RØ¤´²A_ÿ¬«ã¦ÏMCÄrNÂ,Ä8ÿ:¦1éReÉìÉéÀYíI(;(³+Ùû±Ø×Bì\*òÐ¡49q.i±\q~êÏ²Jð¥¬qÑMÜ ýt?êBÒ=}Då³èGðÅ.1¥ ½¥¶ÊÈ²Åa?ýRäf+<-@3d
-î×à3ÕýJÎEõÉ9)ªûÃ6øêÓä$dî«,ÄCCBÆ®³wä[léI4rÃÛ¥¢7È»ö° 229-üÈá¸3V¨ÙÉ÷ ²*ü4ò\!úË8°óÎÈ¸ÐJ~CPûµkd6ÑçOh6)>4FöÕ#2N×1ÌóPôPÊ%NSÐF¢	ÆKÏ%à;!½ö0{iÅGÁusÆ:1ÜÛi÷ØÉö/	gDyR Ãqc»²n3­²mÇ"Ù¹Øa\)±ÇâîqÁXÎh·áòÄ[Á5»6N$ðN4RCî»t\VðF6#N$~Böª¦ü¨ÉÕ8íRÁúµ³ëÔò&çü@$Sýoä)¿]=MÚi®GwwÀFÌ&¼¾}ps3µ ÅF«í¬lR*­òn¦¾:-{1FWýÖ¦¸NK«¾Tk,éærá~ÌÑ¯®O¶Vh·ÔÐ$¤´Ý°#EÐ®3u+bÚýK¦,¼ù­F5$TVUDÅUr}×AñÉPÐECsÎpbü²
:zXV,L7¾æ_Uî-ÚzÙuÓÍ{ÇBÒE.M'thØ¤wWìWhWlâØ[ØtW£Ðe´h2,ÌS?³+% ûÑÝ´}^Ñ¡îF¨ò÷= ÔÑ)>]²OYáK1JT .ÝsÉÐsNÏÆÝS;v_PªÚ¾vN800ûCî¤¹U;:æwVSBÊgaóm8~ãP*öñ"w¥C"0 õñjøÅÍC¡§DÉ5y¿#_Ø81 +ÍuW¢E½NÛ%gx^~;ÿXF øïÚÒïDg«âý±,©kª|¨£ì¬ã¹gpø=}òÝTYUC'!k­= xØÀª+§eÁó>!ùÑgÆàz.Ý 
jêìúËërÉå×s÷ca*-a¸D¾+ÿ\TcÜÂ{õ¤q¡ñ{pàóÕÐ6'frèrCÓÿ[A&MîJ¢oúïf­öðÐÚlpIs3Z©ñ³µLm±#Hµ²61)°Úó¯	@H=}Ï§Ò"ØA¾²ð}öÙ=}Á¯ öy;ké+¹n¿iÊÏÖ<ÛÌ¯_93láøBMrQî)6~M|zufq¢GiõR8÷J
°Þª´ÒUüÏ5±þ>)ø HNµrk¨#ø£È ¢Â^\Ól+IÄ­Þj-6!Ed+g3u^ zÁxcqkÍ&§KÏ«e.{'À;O~Ýs§ikýê0er% k-Ó\8ÓWB³¹õ5¾õ&§ñ\æòo>¢Å§i%~Ýwd¸d»«yúáyúÁ¤»«yúÁ´»«ì[åìrÈ«k	è¶óüËÇcÁ×iðW· ÐtÚçE ôU¶-4Xô2rEôNTäÞ×IôÄ¯èÞH[Îº?î%ÇxLD·Jâû/óÑ/#Q:å2:tüuÆQ8Æ©êjEïÕTÆ§!çájìsÖ¸M1§K×þ´E­¹-¡%R¡ÍÚlG%TtÊÀã*Óo?-ÖT'sa	ÅJ§Û§iîéPdOÃi[3ÏlÒ¶æXvÉÍÖ¡VÖ>Q;YHp;»¥
â
¼¿
2X!¤®|jmÔßgxP:*«¼ë7ßVEðÐ6 ùùðf´ ÄÑÆ_Þw}´8!¢l¢
Qrãàd²Öjq ká,=MÅ2sclÌï= 6·3!Ì«µfÈ]TWÆÝú«©åæUi,R0|®}B°k°V6
ä	Eö5¶5 ÁPº|¸¥?jAxWJæd¼¥@ªá¸ÅBd´;2ò0ÅÊ§6&HÊÆG*LrOÀQÕ!æ|D(·{\¾Á¿îóÜ¬»¼áª©½pðÝ2ç£ðªå$½³
ðª%7#ãAØhÂÛÛêv)<Y@)¬)øý;ñ@Y@£çM
l+¥Áöj»¡ÝÙ¸o¥ù\ok ý¼7lSá\Õ\]µ7n]ª»r]YÍ7HkÇ}×ó,6YÔ¹Á}£ñ&Dù ³u|'_(r÷Í&ò¾2j$T3CØ/cLòøU@Mï2K$@þóNdT/Ú2øIM0Íæöð}ßÉ~ºÿu&¯tÔÎd>tìë©ëY%Éâjgô²<óï¹ûÙFà¬¬Âïa]*ßwºcCh· «yl÷ÐxÝÈo~o4:Ö¸JRÿÈÕÊ"SíãìPð=}»¡%é »Õ¢ýèPðdù²8OÈ}8/\Àõ6bû¢ /Smû"k@1ÿtº+ER\>7~*ËØ¶
y²ûJ²ç£Xkhl%ýJR¯nï/kjò¹¹z}ä#¦õ6*ý9½4xJÒIÀJÆaE·êð­&¨Q£åJsJ±I$ïéFìSHö¢Õ=}b öqJjÍ¸àæjÜkø½/»kÕÀQ¹\ÜdøTb2ìx±uù9!Õ«¢¿o1usQé.-qøÀoÑ+JÑïÉY¶¾¯Ù¦JüwnJ$iÉ%ùñ¬rÎwÁu|#cõoSï§XÄ_IQqlPöçÚp4ËÇôý;¥ %Þµò®\©}\3ÇÞÃ»ä·TàYÒ$[ öºôwwâ¼5+å6¼º?ã)¡±@»èï ¼k2¯¸¤{¡ÊLë¬|«nøã,¼±´ÜA}­ÀÌ³&'á¹Ü7Ýhô¤«ÿå÷Y9Ì¤ú.|N¦úa îYu¦X¾7 Üaz(´ÜaËúaïÛ'°!ûÚ·-×Wý0\©«Ìê;¦õ»©½~ÐaÂdÎyµèÉ\«ôÃO¿¾ä­ð´ ÓÉ½OÅ}aW¦@¡lsÈ|cÂ:¡ÿ'uöL
]­ÙªÝW/*¡Nk³7!
íâ¡g=M³+ß{:¯äîêÂ.ÛÌ³Xjh~¢¸fñáâÝ­[%+Â§ÿ¸Âýwës= ýiÒHé(é\iZ¯äëeäK¤Ëåò?Ú®ù3_ç/ât­ Ýòv tþåcý	n ð¯\¹,¾xÁµå©¨	³»ª¨*îúÿXîß±ÖáÿlªöØQC
÷õ£Õ³ûf©vDT&TÑòõÑebxK3§Ç«Q¾P-ôB§QÌåPÕíçëÈtE]­Gn#h¹óvªíø=M÷ç:mÙãÓç¡¨§Ð±<mÏÄ¨óÅ¿|­ÆûÐ"Çlöª>&¼>|Ê2è+0Ê0° Êðê+C³ê«ÎB{¬õ"!Èð.#b¥Ìb¸Zæí(IáÚÞIxÆËcd\-EFÇè.!EBGOª?H#êÊ?2O@²õ&Y%MFÑþ|ÁPfë;F§E-øgF O%ÀÁþQåtÂæn:ÿaú=Mp6Jvú]n²|Z
´+XVJaì£sV»ÓÂ©Ùav?N¤®ÈùãcLýQ8}ØãNk¸ßGÔÈ^äÙÒ¾y8]Ù¹]äUS*Í6öÊÍL¸í×
v.pyEÆôð¤9*H>BÚ,)N×nx¶)ÆóèÙN%§í±T!aAÐ}@PvôèBFóð
åÿÞ
%çXMÔAcËlJî(Ø¨:Úy½ÑÀ¿QT P6VHÖUÖIÒ4TeIÖVIÆV@VT¶S>K²oSTÊtú$?7õÎðß²Õ6MÉ<:Ò6TúcWÏÅLÙRrFóÌr){I¹Ë
þwº.ÏG.ÉÈÚ6Úko^þÒ
÷rMy"= ãioÓ®ÜvDÄ9Læä!NLLÂÄCQFµu«OÇs,<ºà¾=MP×P.6´ÔÝö±q26>ÎÇë=M¦3úõó³t^)¾ÐÎýãv°Ëÿçîó"XV¶-øáóÒç[K* PçèËö~Xç~sHg8»Ø·Ñl1Ð1VDâMñgÀkV)í=M³/gÉS»e0Ð{t+²²anÄ	¦²áæi-ö¡ß¾¢õ= @0©ã= n	Z¾¢EÊç T\ûÕËÉÍ^~\-mÅ»à.¹Ú{çÎÇ¡m)Æ¶ñªÑæi$õO+õädÃ»ãåèºcÇé¬]rÕE©!'áêXÈF°p^·rCÉþÈ ÝÛ38õâÎ¿»ûüÀY-¯¡àXkL÷½M¸Kã¡ÑwO$æ¤ÏÍiêh¤ó ?|8*1SbêXKXtWja#yM¥x{ý[¥:7xrK]¢!vbê÷w§!ö>!ê¯^c¨~ëºôÈ<©´P= Ì$ìÌÔÁÆ6{Eå	¦yÎÓÌTvÉd®EÇ×Ñ­Ö§Mª¾Oc½ÞÏ?,ªä9éú æXbk·|Ëü4½ìrV¿ª		}íÓ¤¥S¨K]Ã×X±Ø|åÃÂø¶ì,É ù÷4aV÷6ËPÍ¶Q3²{±ÌQ±6Ï%wëÙúáÂ.ß\mdÇ9cÒÜìmûË5+Z² %ÃÞÑ	9úqX²Nÿæ1¨,õS 'èI ,=}(úQ³aß¿õS-\Ö3­mÅ¸Gá|p»Ð$¦$;ü>bÁÃ¹Û£X?h¿ÝõP¯l\¡ÿ8Ûðò½¥,k1KÅ¡¢R¬ö(Ò½öHë1¦zm¬»qÑ 9}ïÙÂ©Ä÷»Ú;L»/ßÀhüE$kÌòÌJ+"	&ô,ÊümÔ|bVÊéËO$V´ÃRêÕ3ýQyuÁ]J 5%Gv±þ	H?ÛÖL5ËÁË¼ÔPK¾Lb@"´»Íö3Yî²NkÕÿ"\Êñ.àß¿×Cc+=} #:PöÊkÛ¹YÉ&sdGñfÉáäú§5<çÍ¯öTJô
2S÷7¨äK7¸ç2qOZfo-óvv9åº+¥8tn³5,¥ohÖ-Áé)®Ëß<¢£sMn)ë[ÔÉq¡8÷ÂÛ+øÛë5QÙÓ<aøÔ	¡K'Ø>¦ÂI¶Â{ò6AÑû¨¸K#¸SÜS-îr¶><<jHöÅêü¡þö¢®Ì»n(ÏB'w³ø ø'ÅÛßª´vM!C³bÈê¬JÒzB6×mÚÉ°ô
*C7ÑL®%Ó']t0×ò¶fòiY>P"nÜ=MBÖît¿/G0­Ü=M%ÅòsºQCÜ_&âì1ÆÒÖ9@· Þ»òrNéÍ"·æ_ÄÝÀÕÚëdÙÉÇ«$ µ"ÙI¿Íó&VD×²Gn¶­©÷!ÇgÃZð«bùOhZÛn7-Õ÷KúRDâ·Lv³oÃ³,Æ´ß ®n 6¶{¢¥äaÑJYÖ<3*6x¯Qp®f¾lÛÿµÈ%áUÜÞV[Haß	KT;UP*ð ,àÃÃýwÊ#g)£ïÉJÈäÎÖÉq»ªÈO_MD ÊÓ#Z=MHÔµ
%;¥RÖþ= Öl¹ÊVp+'wê_	+<rp¶æJíæÇOPÑÆâ²ËoúB¶z»À17 Bcä¬¬Y$±2KMçI9çIÓüm÷õîÈ¶óEüz¬Ç5åPÕ:AìtÁI¿=MùpæÜ=}}^RÇºÔûóéæ¾Fõ=}KÈkyeÃ3+ù8lËáøVÝýÔþVMBÿ9Éð9ï?»áw]P#~síd!rÓó= ±GQzåWDj,³7.S1=MáCäïÖ4±YwLÖ²UÚØè+3y¨­«6}ìÎ Éì 8N Ç}Üð;µæêet3¬ ê¥ÂüBvkÖ¶Oè\áë@zlÜ[ÄB' håpÕ_Téå:UÅ±² ÕPê¶ æ«6£$ØÁµèÕÄèÂHoaÁámwP[ÙÝÐóÒ"eA=}{®7¼à$SíMaj­à£JÈ OÎKó+÷/QUð§âBÞ£sê?BÞ×(w¨å©Vù×OÔnñ&ä©jþ >¹@¹j¼#@GXqáÃphOBKb$@6qV¢¯$×ÓÜ+)SÒX¬ä/zÖ#¬¶ TvU7fÖ6 )ÉN© oaNÙëx¡||üaüO ßÎ¾9¡¨âgaÞS²s¦_\äýÅE#nL²aÖ¢èjàe´lM©hø! ¬')ÀðdÆ©§·=}7FòCkÞ4*×ð&"Xâ
ScÕ6Ã?x9þ#³=M£aIZáÞç/JÍg¨-ì"'ÞghN0ðügp¼®êÔ¾5ÂêoºÙ©o-æp«hÍqáÖ|¥·ç³È®é»Þñéñ6h}¼¦<4ÎB<Ä!¤p$ãñôÙªP­èÞÚ8¬Tû¿ÑõÁÛ[õìP¼§ù¬·ñÎÄÂqâ¬LçMàrêy"bÍó]Ã»àæ*ÕËbO|µïóspÝh¤ìemoJaýâÛ|.#âl³©ü|]À¶µÙ4vTbÑ¼ß2{Û=MÇ¶Û©Þ÷K£Ù]í-,ZÆKê¢ÙÌ³¥º@pç]ÄÜ{ªCËy°­èça°Ìb°*èßaÀ)iÚU£­Z	Ýyi]Ûô*U¶SÅólêê½R¦Û*©x}ü ¯¹þ ¼{£Cne¡ã°ð¡w£¹ùã0q¢ ·c´ÛÅ æN¤ßA¦¼*§*/¿âop³ÇcQÙ£¼*ñ p)þãª½°ëÎOêÌdf3²ËºÜÀÓ¸[z"uòG#Y¢¢¤»yµ×°×n=M=}©!ÉÞº£BË£ïjx¯tá]ª*Ó³V°ðê\ìºqÿ3áìÈäÁáí(ú©:jzgÆ1¿!~mòdâ´âTé±G'jÆ«Ã"Dª;÷ÀâTêûØÝ,#©þNWZrNæÐEV°Þ	=}q¨D(çÊñ,à¬P°ø£ÈVlÙ{ÍÚ¤2 ¤Ïd@[ähï³ï7Rs-P¬9&»Ïc¡åqJ¼->ÕNdàÒüÊ«EN¨Ï
käIÏÍVÍ©Ô,B"YI¾)ËÜ0ª²sxâ$ëÍ_Jó¥µÁ¥ëlÕr¡Üè4ªÅ¶éçFV×}WÛ{]=}Õå¨CpÁÏ(ù¨O;(>s¾Íàgý gý7j¢ïÕg[¦}áweiÏªhÆýzÆ=}¤XÉÜS÷Ïm%;ë¹×bX¬3ev>ØcuÃîáøÜÝù§£æ´ïýíþdô@<ê!æÈ-%jSp,/9}*ÈS9.æuEèMP]0 ·(µIBS¼iWyR±>¥ëñOha©pÇVèfy¬UãìBè©h ²ªÍÓ¤0Ã¤0 ¯}ÒâàÛMGøáÑ½òß©¯F,élzdgâ£a#ô¦óÄ»Ô#eK8¨DkÀ[Ùbsú¼/ªB·ÌaYCOäúö|Q_Ï<sº9D)]êWÇ[ùß· hFÛ·rÊãu¼P¸çÄ=}O-Ï	bGâÄk½ðW_xfÀ\»áÊeF;ú¶ýW«Ç¿äÆd­nêæ=M+ = }VåkX .,ç
¸ú)+jÓåå¾ºÅÓ÷>/pìym:ÎµEÇÑÝëw¨¾èÙàämq10ãs#TNU:¨Üâ¡K&æ=}¼}Ùmþv9d9¦¶è­:®ûDuø¶çOîbwÄÚd\Åî= $­¹¶Çù­	³:æô§°bÈu¥a½sx»ýópÛä»'?Ë[y½ ##Û×ðnAîL Ýpcqºa £c@i;ahxÙ½[äüx{¨= ìÞp¹ù¯Õ½ñ# èï<76hÀàØt'- 7gÞ$ib±eT|¹*¥">P\ó/Y¸%,'rý®+)dg¤
%*;B$úý@¨*á|¤ÉZMÁKè27¥@é«DÄUãRï0{èu)5à5'c²ù'Þ4ú
 ¾ ;J| Þ¡éÆ·üòÞ{Ñu1
õz»t4õãIôáÒ2ÚÜ/ð|>¼o³ø¬l±µ8G	þÉfHFÁóÍdÖ;J«Ò$Æ9ÕjÚòðùÖ-AGn Q{Qf!ÞC"! ³ù ¯WÕÙ0í¼Í<¥$I/o7ØO=}ûó­ÌÈåâ'ÞÄÏx¼ÔE¶Q®Ð*3"VÁAïÈÅïR´«T°-ëN¶®$»(G6 ý¯SV ºEäÎ8EVÞì=}U¦uzi¢#ôá
¯ G§ =}d¤¶´:­uVÿêÂÒ#ëA&ÁoÂ9Þ§©d#Åoê²Ò45KaX8]µ$Xöø° m]éÝ,
{k¸Ô= ä¯¾k~Üñ{cíZ?3¢¢8´çFOËvFð ¥#LñTaÑîûdíX¡ >ÌøÜ¢qÖÝ¬
øX:ÕD64õJ,ãð¯Ùé´6®ìÊ|-$Nq.,ª'õ ~*eûhôMOóMF "û*nT7¼iúUÖëÆù³¢P«U¸ö÷3Pa"öërë²ÝäAû³øv"à#4TÕÞ
@îN¯|ÿÉú|)èÚMÎ 2rb·Ñ2DCm6PØqæZæmífKø\}<Ø P{ÎÒÔ¯N+¿Þ­2&Á®á>ÿ^ÍÍNVM/¯è×æ½fMQ0è*wxOÅföÍcµºrªHwòÿ	·MòÞãeújì(Ãef¬ð³«<§nP­¯'oVw¤o+Æ©øíÿÕÜaúù·Ñ"Üù|76>Ò."Ê°s¡)ñÿb= MÝv¡h­[êdií" YµxÚçÍøÜX<SÍwÌ2Ê®leM.Ne¤/¿Ùåñ·Ú)¸ï¬[¬7¿r ÙÓÖùë©Íþ¬çDzùkìø^$qfÏ<÷)]½¨T%Þ$þ ¹Fã´<3Ü3 2Úq(ÊË8Áà¹¨Û1q¬>¨·t= @rO(ðÉá .8o¡~;þ²ûJºÙ ªã2÷fgÿyØHàªZF·dÌjþnû@héýª)'$5Ý%H^ê¢ûzó÷òD2a!{}Y8¢]¥ZCwx;GôÑÓ=MñÕJÜ®«cU¿S¨Oê$ÑòxsMr5æK[9a®á

¨upÒ¡wkwíCAù3åydTÓ#RcÉþkIýþÇPu3D+Dn%Hvi<è'Ño +ÇÉ­ÿÇ×í¯u¯ûdT]+nÍ©aÍ0(l»ª2ò¼qdÎÛ2¯?­@Ïn\nïm^òvì¸ñ!5åX¥ZJ7´Üòôm ÒóOß®Ôl½C·Þµ® #8ôñØ¥¢Ä±ÜyÛ> n-Öø½pÚÖÖôòó¶fÖõ6¶^VÕ×V]PIÑO.#ÞÌGv[OÆÉêbB8Ç<æ-ªøV¤ÅIìLG¶h¤²^V¸×V²3;B8!ìµZ¦ÜYV .-Öä±^V¨×«
uÀH±ë^&Ä· õ5Els»MþËj2Gø¶²L@y-î8ÓáGxr­= êv= eJD«qW}´Ê|1pN??ÙLÛn(yÛ© _Áf ;#QyFê{^zÈtpå½óP$ÞÇ¢æþý£þ³® &ÚÚgí¯Ì%ÁÖC ÀaÐHq>µ/ÓäØ[«9X!ëy*æx·5go3÷9å=}#êûsÚ1¯k¥afC)ë0e;aãòÎ7ÿ[þOmÔ¸R;/ÇhÖÍÔ×g·+eÉç <ÿëHµtÜG7Y\¶tWûîÅöc!µxü.Ø4ìîþ©¾Ñ3=MôBn ªÑçxóÉåz°ük	Uù%G8Ëy6Ø/Ä+,T%Ù!(ÎIÍ¡3$?µUºÅ>vµo7âõøär[Ï÷ÎÍµG	|Ð{¿Xa^o9 ´ì¯©Ü;ÑtãvM	ËSPÐ¶)&eÒýT°O@q=M8&,èj&ÊÊ}f¦´&Qd?xÖ[g6Û¾Yã2ã °£Ä«jªÄ£¬¬ÝëL|¢r8Ø[=MÝçæ½á6 ßb·;Ãy¦·ÐVIËõì²Û¦"Þ¤Íµéïé\g½Ð´Dd³g_{âÙé¼w¡æfÞòÜéÝáºl¼*&§b«ùÑÓæm¬õ×ØÙßé)á©»+FµM¿Þ<w;÷ãÊéin¶-±?9eùÈ[çÓ¬sËNò&û-8U^åï@xû¸üÏ2~ºgmé,0¹óo&SU·ÎEÏ  $ £·;t!ÿhky5ïC¦N´hÒeù¨Ø|ø<<ãNF%áúæs¥|®9êU:Ùw,ùÝBHGë+¯mÙù]ÓÐâWPÚÑðvwÇ3²øZha¶ºãâ5tWY½ø´8Nô¡¶£DAz'Uæ»*wÑÏ[n«tËfMÆ<ä+îÙ-$T0ó>W£8PújU»¿Êà*¨^Øâ4 Ç7-_¾CDdìt1= ®sv4jßgG¯Ò²'v>7Cjs)·>= 4¨ub%6¹Ü~7Éü®êÀ?SóvðæËRs­HïX·Am¿ â\BEO×´Íjè'CaâÃ<­yá½Hí©"²¡o>ÍÎÓÂ÷lC×à7Á¨Þ}T9Ìi×Q\¡#çÇ.ÎLÎ*{q&ò´nöªIPI'üþ¯%ÀÐÕ¶àÁp	Öc|z|ï´Î»§Î$â.ÿY¡´pÚ=MEGÀ1¡¾= WÌ[{OÉs®ÍìËØúãg½æïµ½P_6u&!ü+«ØqB|%i± ª©­cç÷]aã[¤\x¥æ¦¤úäs®Ìvpøød¬DØÔÏì°¶¼äip¼ÓÒ_YHètgj¨¾Ùi?ô[µëáÛaÞí~/|Kþ=MÞ=MßÛÀxùlBÇ­= jÕGÆZú¤ÁçÅV0OV!ÁÅ®Yaý½2¥xÑã°uF=}ÇJÅO³¼h]5q$Ó9pJÑ,#î¹2F¹=}fC]MjjgBµ@b¹2¬¹2ÄDì/M/Í¿æs2Í Ä=MÆ0M¿2-=MÊ³ÂsfD:¤R8'ÕÊHÛºkÜ¡/~-Ì=}Ïmí¡nÞWUæÒõZEQ]éÆ&=}¬qjuòÌs}¢^N±|
"çùÞQ!RªÚNþÚ¸+&Xñqá?T_?Tos àNº¬hqH\·FþyFþß5&h¥Nî5&
[\½È óÂ°{5æ°:T«úNÚ""}'¤nöLÕ½ð$7TØ±pÎé9AIlMéöAóËlëòa%g~¶üûì;¡íé ²ÙQÊ=}Y-È{àå* ­f4(=}FeÊ=}ïððx"ãV­wµHá¦Ë£9huDB7fù®Liõ8RÔD.f@amØ¦e×8~gMSYð$ÉõLdçívw³8gÅ9Gf_äÂ¯íLfçzeFtD9GXÛRÓg8øÈÝü	Ó Þub$xÓË¿e8:Ê_öÅ¸ -«¶wöuQOC'n>ÞgÏ3Jµ¾çfÔxÓÌ?b8B¶_q&· ð µnQ¡Üg5mQÏ./­´06sòp'o*HvHpì<¿ù ë?mïæ¤C4ÕêóÞbUSðâ÷"ø>«#j¦0VÏ9 Æ¹_ð·/p&6C©ÖÑ÷B*cÀò)¦r²ëeÓAÖqó0EäòOð%R1]ÙeÅhÙ+ÍÅ@Îiº÷o§~= ÆP7Ö= ¹ 	­"Ðx¹Gcâî6äÞñÍ8D1Î6æÂü:(´Ü:(J@ÈüÜ)Ú4V÷Ñ¥=}ÏhÍlUð6"YíÊhÅ¡
IéÀmöê½ö°
I ñ½C±
ï:
>¯Õ=}Ðöís wlUf = îåÃ®gð50Æ9×j®^sÒú¢Xv°ÈpGj]G}GbmGGreGG^G~XGnp7Æ×
W>×ÖX%ZVXVWtGõ¿9Ýà²
ðJïÕ´1ÁÕ=M­³õ³­½
,1øä¯rBVkßª3Ä®°õn&Q}ø>lÔô'Êá¡?°µ?p±?Øù¶Ë¶(m?>b4¨K
ÜÅQ@kT»øòáÕ'd±?£(Û¥lÔ?ùN= ´¨KøºýÞ Ï.{ÓIö¸6o= DöÅêËjüò{´@ ü­)p¡¾{D¨1êÀ¢)ã)£)qü j¡j º¡º .³|TG»7ø½È&îwÎ¯¼H<Óá+u~Þï#÷Þ»Á1H, î© ú³Ú1Ê¤Á1a.}Ø³Þ»Ê´Ê£ABR2ñDJM_¹ÍÎ(³ß1ýïlÄ¨#É½rk
çp¹¡¢¯þïLwmáÑÈÝ=}kÐ£ììèiÓ®ùöb·]g¨X8ßlKÛ¡\Ò"ü-îúÉËÙs)öÁÒð±üuú¢v;Í,Å¿¬Qª²Ò°ótuþÜ"oé¢ÉÍ2ÅÈ2'=MKø2²ôË5òò¿Þ}ûÉíI¶7¨ï'7mqø\  ìC¥µµê"ÂÝIû}üA|02dF=}Hbñ.ïÉäÀÿ¨]¬³ IØubZ"¿±çJhø{4ö±¢= ÓvRv¥V,ëcÂIä«úÐkÔZÂIQ©¬±ãx <Oî°³=}ñ*¢ÍýÁ¼ú¨«µx/«ýáüIÊP=MË¨>ù Ýßýnæ,9?àMÚ
ñÊáÃcr![º¼Ù¯ð·£­}ojãì= ![º¼Ù¯ð·£­}ojãì¸º\Em½ÞìïºÈ8s­©7¹0¨1¬Â(ä7kÎ2yÅ­Ð1Q}ø>lÔô'Êá¡?°µ?p±?Øù¶Ë¶(m?>b4¨K
ÜÅQ@kT»øòáÕ'd±?£(Û¥lÔ?ùN= ´¨Kød*_eÓIö8o= Ä(þ2{4@} .¨¥©¢ ìËÝ)p ÒëM{Ä¨1éúêÀ¤)Û))ï)¯)â)æPëNìmVMO3í#ÌqPú¼Z\q-´ âaÎ tÞñËÒ Ìæ[ÈR }Î×Ê^IÁøð¼<{q»ßç\ß¢5Tk
=MR½¸N©#Eøï|4¤Bâ¹mJ¡á° ãF	b×hËq¡ÌÄ=MëùÏ/=}elÁzÙws¨ÏßQg ­±~Ä³Ü!¡Ø¼A±æí»FC±±¬RIÆN¹Í	kw@¥®L(¶/æø9)u<â¹bèIË,Ëël­<µ¶Ä4%¢=}É¼Ó¬-ün]p¯"Ë)ßø"®ÇÑ«}¾ÜìÿyqåÊhVÕ¹Æ®ÙUe-yÜ	¹Ó ýî+U§#9JÝìê ßß¡zäó:NÌªÿv'óYú®Íf¢+PpÛõjÌV«¶Ã$+Z×ÈE_"Ó&æañS(»9vÐÖyRXíÈ´d'Úûâ¼î)l"Wz¯WÓºjW/YÓÙc¸]ZS]b»oèhsWVWóXUÚc¸ÝÆeOWÇuOw'YvY7òØ72×B×FZ^õWÅWÕW(æf3;^ÅM:ZOHØ²TOÄÕÓ7ÍÇÞvÈÄ|ó(Pr%yzÁ>>½¾u?NôMÀ¤ 1ôIYTªQìMÇ[¨WWËÄ2=Mb2U6;Q£ïúKd¡¶úKUf/¨ÑÞtü/¨ÑÜtün/¨ÑÝtü~/¨Ñ×tüÒ/¨Útü²/¨ØtüÂ/¨ÙtübHfõâ¶G«ÓÚ~9jmF7èÏ\fÏwuÈfEß²Ç®³Ú²9i3m>7Ó!aÐö]ÆSÝó´dÛµ®Q>õÊ6Î%2#$*Ö~Â&ô½Ô~¤$÷?tD}0Û¬mâj{òò|DÛäoÙCÙïw·(¼íù_ÍAÂ\¸ÚwrëEJSõ>5JÆÅêhÊEPOôJóFNÕó64ÇÕõÏÀ&{²U(äÖõ?÷ì'Õ)3uU@OäàªÅ9ë#;Xp"L<5ÚE@ÚÍy:ÇO¶æ%û¸×¦£Ä¢(íàa¶Ä×j$ÖÔ½T/­{Â& È°Rcº±è Îs&OÖ¿Ó×vÒÈ*	¿Èc ÿºè4ÆGoä2¯Ç¥ ëýü;ªÎ­Ù^Þ¹1õÁO"L	W"he0Fn:ÈðÄX / -×á_²i.÷À¾«0~.DÛÆw\JªÇ§Ã:)=M­þ	m3ÅQ	³Ò»6èL;T9ðºÿ©&w¬;îØéJ!QzØ(f¶5~STG¦OfR8bRÙæ-,L,öN=}§E*×o÷÷ót¿<çâ\àXz× ]kSç£RôÌá>nÓù£7
mÅÃ«Ü= yÃ[súDôb%®rq­KQ>+÷Uî,ÖßT3Ã©;hÃÐÃ= ¸=MJâ>CwVG
$å{s+1oRôæ±ù)Þ»½#"?s ¦hhÁåzú½äq½®#Ù#V¯¦¶2]Pô'üèbUd
÷clHGÁ°mº17å éiÛì»d¤M1·¨¸ÛË£oxBe*1{<t=Mo"nØÅÚÿ.ÛfM^¾[Ä.)&|ÑÚù(ôQß<Go.Ä¡=M²ìãkÂ´-Ì¡Kí ±þà0 wwDã+Oùj1	ãoÿP³[®éd#M~NÝ]ØÎº9Lk!òG÷µ	$F7%x±ñì·ÐFÅ=MP*«$';§¶L¤¾WúTQ(õ­6ã-ø©ÝØG¹Ünùs¶zeúPåÆiò¦É­u%Ø¶a@+ðÃ&ìpçíÝLC¦PÒós1sjÈu%M(Ó%Ô|Ýúe¹K¾d?ö¬èS0üfââÑEþÞM­Ñ<ÔPX©§êmcQg²fJ6½dF:-Òt5~9Äsmý{RÙ¾-â\È¡ÈÉÈ¾Lè¬.<t ,´bõû©0j T=}d33k ¶ÝÎGx@èt'ùnKü³ëün}¦®uGIa-©)Å¿ö?ßJZìþèîã<õõ:TëÁ  Ozv2D5s²Úe8{ÐÐä5ÿcæÅfi"TíFÕ8÷C§24ÑÓ¦ÂîHÃoó;3×î*Xmp«­C=}|­åcwÔoh9ø ²²»ß·}ÒüÓ8¡ÀtqKþga@©Ï¬H&¢èÜÔ½aT|°ºÜ.Ï3£ØðW8ìæC\G/°%¥RIüNÖØ?ÖDwãbõùxc«6\Ö¹ÍIvÑûIòúnPÓæóW:JÂ~&f!íãÁìI[6ÂA(pÿ»ãëlkaüZc­0w¶¨Ê¥M÷q°÷×R0Û ú/q¸sa³	kçx.©ø$»= ½nú= süfÊ½¦oÄë íaîO£óH#oèdÂ¬\æ­ZF®¨uûîÁAf/ÉÓG ÿÕKAÉa©¶Å
éøÜ;·­Wèº{<VÒV&ø =M7jh¶åà,¥là´ó(é áßòá0½m­{%Û¾»7Îºáý°J*(éÎÄ«è¯Yè/Ëáj^¹Å«{}¶C÷Ô³èo,¨Ô½rLðDÛ
åDëªoæÿ|@0è= ²@	OÉÈ¡;7è×Ü}½I§µµé/Haë¹%w (ÕS¨5F6®SR	-æ¶;ÚSZÖ×{ÆN:6;SVY 5@ÚÔOáV|é2æÖnèæRGælV{5æåÆQG6U.ÉvÖaè¦QG¦kÖm %Lû~"÷TqºÃðªß7ÏìiC+[Ö/ï}Ëa#F Ù!_jìÓzáL.= j¬Êâüö@÷}´ÇÓ9ÈùóÝ¬cª´¹Ârà%ÎPI¹S1Á$l­gJÚb9ë9;9{:Z±= Ísï§·( ûvIñçìÀ¹ªàÈg(ÙkÚ ÎÐÁñµ¹SüT¬X/ªß_Ù)ÌçBêçr*ç¦lÉÅ¥UdüçòhÉÒiÉ¾qIðÅ4 ¶þxö;ÅÛC¤ïÝÓ ç_= P;Ü3jßK¤e~øbVþcÁ/dÊbvÿx'ß·]%%ÁT~k{1këª'q\Ï5Y¡±0ÉÉNé).q¤Ðoy-f§qÏ>
Sþ÷&½«øká: Ï</QÕÙ©/ä¦Z= _ÆEó¼ÞÆjycÿú0Ì{¼Åù¾;Éº4·D1|SºÝs?ßÂÚ±WY¿6S-©G²z'oùB=}ü­+¡<¶"&:<4ÏÐÂºzyýàÃ¼«¤K_|Ò¨ µ£Ûpo.i/EúX;7§iÖl ¥à= =M{qòøêÄ¯¿ ÓJ9ë9c8{2±»FrÈvqàÔÃ(e¬q	TñÕ"¤½ß÷G§GFóçRO= gÎè¸<4BO° ÆâåÿS.¯Â*Ó"Ós¢Í©¯£öóüÛ<³çÿè²û¾«Oû"òH.=MûPËU$ófÛ-·®¢pAt	71ø¿LíÌ5	µ}{Ãs=M¿>OÄÄ÷'{¬6µ0Ï¤ø¦³3çW±~Óìö]FlËhëB¥¶ï«£Mð@ÔÜ¢B=  [Æ/Ç¦aÊ¥MîS:qAÝ»Ð¦
 ì= ÏZäKÔpÈÚä< *2ú}HÖ
}6YÌVnèÃòr¸ú9é=}O iëÊEel ç¼Dp½;°¸Y=}»4pÃ\¢,ÐðD®lsÔéçr
= H¬MIÎ;|~¾Hû!|ð«gÇ
ð!Te,Ê«9 &w¬P*vÐ1»Û|ûH^È.t?X¯#/*eSÛÊ¤>v_ÄÝãkèczvÒdkU«Í©²p/Ãc¾*Qº²OV» 6!àáªE·°øXöa8±YöIè¿HùÞ¤cÛ
ó6{ÏMWÞFHì×øÉÑx¦°ç}ø{6Ó3­$ÏÓ¾t0dO{cø© \×4fC­^Ú4@æã½äç¸$~Ê;SÎp!é¹L½$o¸ÓµàÛ@=}%
ëG n½³(#Ñs3=}óaÅuÕz #hr¦:PnUæþ·b¸ôÀå¢"}²í¾8W¤ $´]o	4D§µüS¦ îÝ¿¸uNí,;èZlÊÙ	N%ÚUzXKþøâx²»äÉ ÆÎW5ü©i½¿ÔCÂÉN)À:$¬ØxêDøc»|÷xuá§l£© ·oaßSd= ÚüL-þy»~¿=}]äÒÑ·Ï«t±º
þÜPù¬pr}¸FÛÎv{xÖ2/u2äú*³¶ìù­z¼³ÒðÇÈÊ	È«9TµÐZNV¼ëcØÝ¸ó^&d591C=M8)¥£s5xÈÏkÞNO:G5¹'ÏÞzæò¼9j¢<U¼Ð3ãhôÁ ï+êº¦ùÜ§3ûzâ}?yÒGÄüÂk£û<ï´¾1+EªM!:©Ä6àSlÝeeìÓðslº»ÞÇE¤ñÊø]ã8íÓNÊ¹^þ4E¼Ê]Ç¼:5Ï5ãf:2^Çô(õÏ!ºÊ(üî4Ç^Kh±TÖÐPä¥óý§i­ÏÀ%ÜÇßÏÂ¹ÌøJ³¦btÏ%GÕ= ÐósDL"/Y³rfHÜvWaXLUeb[½£¸W(eb y^e= sril{zÇÎÕÐÃÂ¹¼¦«ª±´7>E@SRIL/6-(!$çîõðãâÙÜÿýø
 %23,)VOHM:;DAüùæßØÝêëôñ~wvohmZ[da®§°µ¢£Æ¿¸½ÊËÔÑàåÞ×ìéòó=MúûPUNG<9BC&41*+ÀÅ¾·ÌÉÒÓ¨­¶¯¤¡pung\Ybcx}¥ ©¬³²ÍÈÏÖÁÄ»ºy|]X_fqtkj ÷þ	íèïöáäÛÚ50'.#"=}8?[Z·wWWYÑ2=MÄ2=MÄ2½Ä2=MÄ2=MÄº24VÔ\	xix]ùÉøWIdéø±øZ1f]øaÁAøø[áAÿ¥7s¥BmEBý7j§ÖG­vGcæ_"¨Â®^dò¬f
a:©+zåúâJ*ªà2Ô'Ò-rãâTß&T(ÆO.XS&Ar2J@zéCÉFEEµsÅåÅD½£E«#%Ù%DÃãï¥CÏcFcßÑ×eZaÙWÏF=M=MÄ2=MÄ2=M$1=MÄ2=MÄôSÐ=M]m^àg6)x
ükÝ)­,÷÷l»Å?ÄÄW}1kãÇÂÀÄ'= Duq²´ØÀæDu52~ªJww+U*Õ2Ã´×Í]nDti$=MeJÄh½·¤*ð³#ÐõòËÜ<Èõ)bÑíÒKwÎÊòÕ>L'c(]*¦ö?¢Õ=}&Ñ	}B¿z&Í1ðÄ0Þ@¿¥<[tx1¢ò=}½¨m'áùüªä½)KãþàpîyïÜ\éWÂ\shnW>{ve¸Þ;nÈXG¦xaX9Y7l^3hnW.§¤³Wç?Ù­9Y·c} oQàb×u	\Ð§MøóWØ»9YwÚ#iiðmgskWW</= ÛÛgYxxg_ÛÛgYxxgÉ_ÛÛ_xxgi_ÛÛ_xxgiÑfï:[h»8eèéÊO7bÕ(îÆõ¨ô®ëÏ9X\C°»p-ÇÜlÍGuõÃ
àj¯·k=M#âãåo¸TòeÂ?ï½ñ9ã1þü*¥ÁEÝuÑüREA
BAé¥7áRÿñÆÿùåe+JªÄÔ®bëI­Ð¼M¯¨¬zfKºuk¬ÚW.öÂÁåÄ2=M=MÄ2#1=MÄ2=MÄ2QE8Ðèa³ß¨ÝµOa\´·iÕÚsÓf}ÓZe¸d^¾l×Â/[be/Þ¼·lm·= SÝÇt;´§Xá8m[÷t5Ø±ÏXæls[F]\d×^MÚn'^d¯A°TT~ÿUn,áÁÿf,þ¨§ô+NABÿä¹ËúHooqv(Þ?ò±ºv,oNù<<mñòÉ$=}I8lJü³ª
±«÷ß0ÀôE´òð£±$ïVïá-¾#-âmãJkNuNªßR.ÀB+:]Èô@´ÌåÈä%ÆÃ 4åÔ)½0F/¦DúMÍlÒ'õåR1b5¸£|³K5Ki8¬è§*B<jí2OªSjFÊ4ÈÓ|üò.Ö@ú"Û¦ F ÝÜ;Ö=M¸ÐçãÕI,Gï¢5oUýëãADë~z­P¥Pq´ª­^ú !ÿÆk/*vB&jQ"²9V¤V¨k¶LràT	ÕÈÀ¤|c µo~¬é±]ÐÚÉ)î²)Êi]kòÔïTÛ
l#Ý½*'Ø0|ðD$-8öÀí-Ô£j)v*æ1$ËÄ¦òñe*ÑÀ°Á|4+¨A»êòóª¶ª¤ë;|À©¤üm£m%OÃÓf#ÙàÈ,pS^l:&74Oo×;rá{ÕjW>ï.Y×Ðà;qªá±VÄz°ÁÉI6È:uHY~ÈÆè#÷:ªA9Ép3Ñ2®wi¸äGoðæ;úïKß¸7«o_WWsø$ºÄ1s-=}¯òEsn_xÛg_xÛg_xÛg_xÛg_xÛg_xÛGMr¶sèãfZðÒj5Ü&mÖ*ÏBB1¥Â^DKí,¹Q£ÂBfTì+ýQÚ Ì÷Å¸]5,å±Ûì\ó= y¦;ü<
«çI¢¥¢rÀþû3ç)  ÚbÏ­ù¡e´P§ª-WXÿãöZååîÓÐâ&­O£PÚ¶àE°Ü@æ|@×Å°Ý4ÀÞm0äi=M·ªñGy»íu~¾7Ì âûä{F¤qûAôSÓÇ= õÕoR¨nÙVHæ$¶^×UãojºÀÉ:Ãm#H)=}sqJÄãÐÐB¹¨&qú!°å?¿,'1mzFW^þCu3*É=}Å-äDó²Ò¹H&¥9X51pRå¿6nMkÞUVc,ØºbäpHÒ6Àáú+Àá§A_²s -2mÁÊ²Äå/»B/ùÌÌ±À²Ñó­1íµò)z±¾pb¹êºÃ	ÌC=MãÜ1Rrõ6>PmêÈ¨7¾|«ßýdÖµ¯q­;¦ã}~î:ú)æºú'hÐ¼U	'_E»{Rß=}ûÂ5Ê©u®¶ ËãjªY~ã~Qa2¯ÀÃ²\ tùóë­Â]äøcuÒ£ ÓÉÞ¤qÅÅ)óÊ¼põÊIãQ´úºÝÇ-Ï-´6·ò}¤ÂÂwþc,ÂªCµ_ùø%ìö1¶ýf+²Bd@Û9Ïlx¡ÒgùÚþÛ«{7k»ã¦> £y}|.7ê*&¾¹ê(àÐ,UA'EË{d¢"@!®I<ìLµ¡ÈÌ7íHí¼&=M¡±,-=}d\óXÄõT]ë¢>e5b}jÆAn/lZ..dWºEþã(F¹ÇÈ¨®çng[78Üô8¥6yÎÎ¹= {r¶ñÕìq²á&BHNÛíÊ.y"¼0.×#9bHb«½ëJAÔhn#½móÞ8#Q·Îª¹m= &¡³ã¼ø
JñT$ø03üsÃ¥M|$¼.Y¼Ø>	´.Eï=}[o¯ÉKt=MÜ)=MeÉ5§
¬&5]¼*0ÚÄ=}m*³ÕÅÖbÂoG°Ô]ÚAøxWÁëi©ä÷ ÙÁû=Mü:d ;[îÁ H¥]*¹jþ²ýph,Æ}ð@©¬Î@$Y>+ð	ÐÚ|^µg¨@ªÔ{gìîX§DÛ«¾=M,©¸%¥°´ÚL\.ár£rOämb³g¤=}½¹j¼ì_úåÄ?Í¸	ì4¹2yÄC[Í{Íg³=MÍqÎCN_Òçø´CÅ2ÅÀî8WÐ'Ì§÷4æFJEZNeàÞ¤ÞPí¹/lÈ¸f úì·«ìGüí©åìPÁØt¨¢!d§Z4?÷¨·g«­2üq'é¿x± ÍZA÷2ts!aÜñ/½²
+»g×÷_1.2bMªn6À@Øz4¯æFXGHçÏ4îFN?Rå?´8É~k»ò\d& ¾¾!ÊÄ[vGe×è/ªHà@= V+I_ÕsÐãIx65ÆÚÏ#rZ^º.ý.S"¢O;\M)cÓ¡ÓyÝ fI?zTHuÔ~5ÞkÅâ¢áÑÖ´àk(ï"L"4kÝ¤IÒëÇ©p Y¯¾Ü¥õ=Möx}èªo®&¦dõìý 9>ncr&ú
îCnà°;ýäJHÊÚ®ûÜISO¼ÿB)Îyß^ª¶ö
2t÷Ê0lÕ³tEâMPñ¶Ù¶×¿Slá±Æ2Öï =}ÕÖoé{Ö5fÃ)(òv¸oÅÌÍú2T&8Ë0aC+-Íï¶¹ÍsÎÇüN	ÒSÆ48¿£0üPfOºOÖú¥BCV{_I>#VVIbe ìÖi¦¿7Op¸tÂvó{ =}EÊ5tsxtèæZöå+ðþºdÏúØý°ö­Þ*ùêìq÷¬îw=}sZÆÎÇ¾)s"Q¾á$8(ü ê^5×r¤?BR¡9}@¾mÊâÏ³}¶äXu??yf$mCuÕ6°7µ6¸FQ.â¹Ï¤Ëi+ÓbSzS~:(6²ÄM9f;ÆðÆÇ6;ÖnSñ{ 8O.[VXV4OZKÆ-yÚOPn=}R3NO^¼Ut·¯Î¯Ö_P»9vóNQR%ÖãÞNNaWãYª7{[ì¼Ëò"rs¢%«ÍçÍÑnî{m¢R;Ú!}aÅØzr'YÃdõÏ5úÚCtU Oqçö^eµúSd(aÚ$âËø4¯vgÌ»Z´)Ó ¯}¬!ë©¶É=MA#P¥NDVZÍXàUÜ(æ8àHXhþxø
¨¸ÈUXOhIxK=}7¨A¸CÈ%Øèø-'(183H«X©h¯xµ£¡¨¸È»Ø¹è¿øÅÓÑ(Ç8ÍHØèø(|8zHXX^hdxbpv¨l¸jÈÚêú
*~:xJZZ\jfz= rtªnºhÊ­Z§j±z³¥ªºÊ½Ú·êÁúÃ
ÕÏ*É:ËJSZQjGzM;9ª?ºEÊ#Ú!êú
+)*/:5JðÚöêìúê
ØÞ*ä:âJ ZjüzúªºÊÿYiûyù=M©¹ÉïÙõéëùé	×Ý)ã9áI$Ù"éù	,*)096ITYRiHyN<:©@¹FÉ¾Ù¸éÂùÄ	ÖÐ)Ê9ÌI®Y¨i²y´¦ ©¹ÉYY[iey_qs©m¹gÉÙéù	)}9wIa &®¤#«#¨¤¢¢½Ç¢## ¤¨ ®#  ¦¥ ¬XcøYI&à86Ö7µwÖÚ{Ú:iÅ¢uw^ÛÐÈ·»ÐukC/·âãXÚt®oÊÊ]¿Ùó¦ºÅ7ß%\ºÅxÍÿyew5xf{¯osVoÊ
S^Y7ç = zÇ9kX8=}:Y8]9j!§]uªÅ­çm÷ ýànW`});

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

  function _FLACDecoder() {
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
    this._isWebWorker = _FLACDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      _FLACDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = _FLACDecoder.EmscriptenWASM || EmscriptenWASM;
    this._module = _FLACDecoder.module;

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
      this[setDecoderClass](_FLACDecoder);
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
      super(options, "flac-decoder", _FLACDecoder, EmscriptenWASM);
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
