(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-vorbis-decoder"] = {}, global.Worker));
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

      this[header$1] = headerValue;
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
      this._sampleRate = frame[header$1][sampleRate];

      frame[header$1][bitrate] =
        frame[duration] > 0
          ? Math.round(frame[data$1][length] / frame[duration]) * 8
          : 0;
      frame[frameNumber] = this._frameNumber++;
      frame[totalBytesOut] = this._totalBytesOut;
      frame[totalSamples$1] = this._totalSamples;
      frame[totalDuration] = (this._totalSamples / this._sampleRate) * 1000;
      frame[crc32] = this._crc32(frame[data$1]);

      this._headerCache[checkCodecUpdate](
        frame[header$1][bitrate],
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
                (codecFrame[samples] / codecFrame[header$1][sampleRate]) * 1000;
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
  const header = header$1;
  const isLastPage = isLastPage$1;
  const vorbisComments = vorbisComments$1;
  const vorbisSetup = vorbisSetup$1;
  const totalSamples = totalSamples$1;

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  // Override this function in a --pre-js file to get a signal for when
  // compilation is ready. In that callback, call the function run() to start
  // the program.
  function ready() {}

  // end include: src/ogg-vorbis/src/emscripten-pre.js
  // end include: shell_minimal.js
  // include: preamble_minimal.js
  /** @param {string|number=} what */ function abort(what) {
    throw what;
  }

  var HEAPU8, wasmMemory;

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

  var _emscripten_math_atan = Math.atan;

  var _emscripten_math_cos = Math.cos;

  var _emscripten_math_exp = Math.exp;

  var _emscripten_math_log = Math.log;

  var _emscripten_math_pow = Math.pow;

  var _emscripten_math_sin = Math.sin;

  var _emscripten_resize_heap = requestedSize => {
    HEAPU8.length;
    return false;
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
    /** @export */ "e": __abort_js,
    /** @export */ "d": __emscripten_runtime_keepalive_clear,
    /** @export */ "f": __setitimer_js,
    /** @export */ "b": _emscripten_math_atan,
    /** @export */ "a": _emscripten_math_cos,
    /** @export */ "i": _emscripten_math_exp,
    /** @export */ "h": _emscripten_math_log,
    /** @export */ "g": _emscripten_math_pow,
    /** @export */ "c": _emscripten_math_sin,
    /** @export */ "k": _emscripten_resize_heap,
    /** @export */ "j": _proc_exit
  };

  function assignWasmExports(wasmExports) {
    _create_decoder = wasmExports["n"];
    _malloc = wasmExports["o"];
    _send_setup = wasmExports["p"];
    _init_dsp = wasmExports["q"];
    _decode_packets = wasmExports["r"];
    _destroy_decoder = wasmExports["s"];
    _free = wasmExports["t"];
    __emscripten_timeout = wasmExports["v"];
  }

  var _create_decoder, _malloc, _send_setup, _init_dsp, _decode_packets, _destroy_decoder, _free, __emscripten_timeout;

  // include: postamble_minimal.js
  // === Auto-generated postamble setup entry stuff ===
  function initRuntime(wasmExports) {
    // No ATINITS hooks
    wasmExports["m"]();
  }

  // Initialize wasm (asynchronous)
  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01e047b99803,l%ó1ð%ÏÍ,ÉîÎÎvg;(ÐÏÞ¨£6= o9é{B.½(«	5ø­ðàPÃ BDü"emQ¼P+ØrUùº3ÞHy
;OüÑÅH	Éº½1HJ;õìØO)ôüRè\Æÿ1ùÓ	*Å4ªÇÃÉ¤xsRê¾<â¢ 
Kd¹ºtää«ÓU~ÚhRLAmeáøðøéûòË¯VsWÂ3&f\qü=MÀìÎQöWg]|§ýÀ÷Qk+©Et<jc¹î¸Z_Ê¸mË;=}R<ºÅÂeG|]Î¤©Ã'oü¾_¯_]wd*FHþ¸^m½A©Æ¹hîE)WëúÉ¼C3yìFEV
ä=M&2¹ç= º´Eé9ËKsÝ-{5 §q¹d6U;Ì$µåÍOZ¨TÐxÎ±"æÑÊØº§¬¬¬¬ìonyÏ±Ã£ÃÓÝÿ1=}vìC0&E$FæGD(ÂÂÚN«µû76³/o³MÃxìýQ9rág©ª®6¨àÅ= G°Oå'dD= 83ÌpÄm¬À²ÞÍÀkÊã²UqÂFíxö
^Úd}îÛî
¬ UÅbÊj0)ÙY/nÎü5ø÷ÛtQÿi¼ 5í2U<ËÃ:üKcÈ³§Í(À*= ^w3YÊ<É~4Ã>Òë8ñÀQOÉÜBEý÷É?< ÐÄ¬})OäX>hï¤[À_©a/,ÑÉY½¥t=}§¦¿Ðu#tßà ¦H ûtz0vÃûãß¿ó½PßÖ	jßØ
°üÉ\ÖZâmÈs[m£ ¼ô<»G(ÑªêùLÐt«°= ¢(8ndqÆúÇ£@¯³%NÏ6>= m.Çâ7ÈTõ*4¹p±YìíHò~þéMN#ðh{Q¹ÑñºüãüÏ­½ jÈkÃ×I#C#EãïwÅ.¢U÷­Ã:\Ý9wÁó2µFá
¦ùT
¹®lÊ[Üúf5Ü_ÇMx¢1È¸#ÔÑÇÿ,Wêò¬}¢×^&ÄKóy\,7]&é µ³áâ=Mg¦$Õ.ìkK.UQ6h·¼¤AìHásÃkãèqkÇ Z"õøÑ,Is+Þ ±^WÝäé¿Ûy,ÍâÙÒéîÈ=}Õ±¿HSØNÕ,ÖÄ5ÆçN4wNÀ/ÖÁ(a_ÉP¸'Ñ¸¬%U\/|l,=M('Qôo³|²«ÚÔ	ÇÂÚ&>ã&¯ÝbÎOQo[= £8+ßdÁ'g§ 9qc¢-wî~brq8ã.ÙOv7G~(«m°Ç ÝsZU$¿»6è ,VÑákÊ;7çÂ­ò}kðåúÔ5wçn*)ö[lWz­hé LÎ£LnxèlÌ£hýøÀo.¢ÜÃÍÀ§»¡ÓNÐªÛP!X=}ªb·cÊr· f¾ÊvHÌËo+òBÊ\bWagÔÉV¿?:Á=M5SÅa¯ÀhGè\Xë]3îãÅÞï7&ÿ."âKæ}ö
Ý³8?_*ÆEÀÎ ¢«ùNO®¢ýMjqè#°ê|4n²Ú>Y³ÏeùÊ·BúJ= ^±u|»¿Ïü(2ó~mmÓTA²=MµR|×QØCÀîQj jK%Á{ì| ÏÀ3ó	x§â­³ÆUÜÑ_Q5·Wá6[Ú%¬¾Î=}U]Þ·Ý¬_ý©æàñ!$¸+ÜÞuqèã20d¿+_Ð=}_Ð=}ñæXA¾V­ SåHË= çU=}Ap2½G±a/ À3nÝ5íÓoô¦= {$:[>£í£(SòéøøëVÐ¾ªõ§	Õ"î±¬Jô?;£g_#ùW{+-¿nwNëføÄÈª'G|Úô?ÀEr¶Ã_~bj~åÃwl"kÏR	ÚäæZó¯Â%;Ë=MîõèÉÒéÆ©¢~î|ñkAbØø}p%lþ³L®ÛôzóD§ú*ì\®³Qj!Ùrk;H9
úìJ/ã§È v7Òü½º§t÷Ýrâ?FÝ¦=MÄÁñz¢î<µ>¥P>®£LßÃ¤ËªSp; *	
Çø®ÇºÆ"w3 ©ÛõtÂ\1ÏÄ!EFI¨ôÈV°¡"b²ï²"Òrab2Îó©Sr
²\«	ïH}º\pÅp>ñ´¿ÎÊ«¾2)àÏêtåý­î·=M_& D8ã ­ÊêGÞû3êDÛ/.¢¿QT<yºwìwt·e@Ídî$ÆÖ§tfýöºqñlQ£ÄHhêDv\% P[²?vÉNÒob2Þ=}®4ÅE
ÕBß$=Móþ6Örs¿Ý}ÏIú¸ynAt,ÈìvÒNhè­ÄMåøBVa*ÖÀ¿/C=}Sþ¬±[b)S~G)å=}dHdKb¾@,ÍçLñ×y1Oæ£~=}FbËçÍà³[°ÀÚL)Bëa¸K½íÚ}ÏgÓìÑ!.¦:«þ±þP3÷í¾%kã°QU%6uùO¸Ït9°Oy68ÿ×Â5"våñ¸= e¬=M^ÔåTÀÝórÎd#¡Ê§bõÀÑOÉ8@ÕC¡êÐðÿ= ÿë6¾ê6ÍÜÐÞy2}ÖÞÑÚÞIØp4p¹éýZßÄÖÞ$Äß¶®IüÁ5úHk¡2¿Ê]êyÜV­b OOD¥IÆVr±S®jîú[meRÅy2m^üJÇ@Çò³Å=Mô¾ã=}&êR7 ]ÇÃç&êÊÀ}zY»ml	Ð ºÌ_¶|·µûÁá!G?,qñ§ïc _°êÀö¬aØç|é©ç¤°å{YæüUþµ^¡A*?O"Ö$Uxa|!Ô7c
s"3º3ff4ÈRêMÒM°¹P¶ ¹êB°Í;ÁVcÎ¾êWûTß6¿wMewùTQ<ÈÐp!»êcLO²°¥°å©ÀjJÌ©y /yÊàãÈüE»/QÜ> ÔW+ekJeâkHekÆcø4®X·öq/lÚ¾KÄPìíºÙ+?mK¨0'!ÁìbÃ¼;èÖ?È?a7ÑùìË»°Z°m>m\,tÄ*âëÀ	gÐ^cn©ÿÑß3½sl¥q-.|±O%	0gzqù>6:ùÆQçñ*¿0ÔMÀ#î8ÄÄ9bÑn¹ÔË?úèBÁfWcïB½îHy­f³þÍØXººÍÂÁ³^Á=}|V=Uº¥Ý´eã}Í~wüm2(~NË^4øè¸Ö ·ÆØeí*®4TaËr<7<3jcæ´ éEº0ìÇMS/Xª­õX[%;Av6Ï(Çpá©)wÛ|E£v·UùÄ¨ÔÝËØEÊ9ÉX¿¼c!´Aõ÷0þÀâcôÚ=}É°'ù¹;ÍTQ0UtTn¥xz¥¸8Y³¨øþÐUY¿w¦E¢Ã V=}ßO}ú·ä#ïxYÜ ï?Õ= k£ÀZ²ôÌá§Ý@§f þP<Õ= }Õ= £°µ=}Õ= }Õ= §É³Ã?Û£TÀ+B½.{µrµ_xKrY4}ÎèÑäÁäDm=MÆßÅgÞw·Þ7i{¼æ³·î%G¦(²êçnz.N-
ÂÔ5ô©4_ü
[SìOÜå«Ë}Ò¨5-8µH7ì5-øú= Ç	¦l5í Ó"\ ÞýºPùzVUäJ¢°µí6¹Ãýz¬úËI63üM=M2:O²&Îó)qa¨0ÞÚõ/ÕäªtÏËKÇ´= ]{òYÑÖµ,Ñ}õ^Î
Ü¢Þ¢<Ø¡7¾jbYHA/¹¯´)Ï£Ò?cYæ*©¾ÙØ2ªçÙn­{³}´Óq%Âmà÷ý[¢õbµnD­IÆI£Ã*D*ùFæò©3ó¸Õ®ÚºoÌÁ¾zà­ë^X\¹µÉvùÞ¿h4bhÚ#P9£fËV«æyC´= {¹AL¶F.?ÐuÈ~T¦¤êºFIæ[H«âûè2x!{ÁûÕTU8Øp ö!pÏòíNS
½|7d'IDÄW6Eê¨îóÜ?lîþ2CQJlå»-.©}úi¿]½Í»AÐïW ½ý°[T×HÎþ¿uóÿh_çW¯î['WÒÍRÏ
´"«´/W Ö¼»%Í(1>V¶¸K¶gÎËÐMÉÛÏJ_ÝÜ÷
ËÿXº3¶æÚóì5©¡åg,*,ÚÄÐsR"¥"Mo/ÁSõzfG[{nJOçÍï Ó'¬¼ÞFòaÉÎpóÈïÍWW%Â
ó$](JyyX¶ûÄôcs$T»ÐÃ2¨Ï¦"-RtØ«K¨:ÀÚ\a	·ÚìaNGÖ²å0Ü5IQ!FRÜ	]ð½áÑ½¾M:çØ DRf7½W×ºmÃÇ]ª\,¡LªDHuÓ|Ä¥U¶¾G¾Ôõ¥/ÈJGn8É	'Ø¯V×cµË)íòó=}Î¼£Mb]à)çoæ>§ <LoRÿÊ³/ÀZY°^V¾fr£W4^#¥*ÎÍÍz|ö¹M¿#ÉU{
¢¬E41_¾$¶¿0Õ8Ù v)ï<ÎHiÎ6¦)4;NûèµyKþµXËëså¢Oh»iÑfN<]U~|,Ðú«æÛ)cI©z~«O§nÍ¹½ÓÕÀfkgº}³¯ÖRÔ¹N£.¿¸WÚ¦PZuSEËx-ó@Kî@l-©ø¹©6Å5Z¤dæAØVûì@
tq×õ®\*Úâ\|½G¯L&­SÆ«æ'5ÀÍ=}§ñ³(K-¥Ö÷7©S}¥÷>CÌ7E=Måûû6³ûÓ´¨82(Ý´îX]0Æ×$Ó t×= +s¢À4ýJ*ÓUMg±ëÏî
|n0Gªî1ì_K	tDa4X5ÕëyrúV1	ÕKù5Ýs!½è3ÁÀC£xûÈ{#þqiFns][2.óU:Î*øÚM¡Ù@^äêµH0ëk5âpG§ù»\æøiÒt<ÀÄåæðr¯E£ù	wùwóA=}ò}õ¦GÞø]')/ÈïÞëÞ¾1ÝµÅ,¡*øã¸|h;_=M·×Éå<Ä3<û±ò]éÕÖÓ+%î>3V&OÌH®${¢®{Ð
®Ô+ºCå«|=}ö§²«âr*U©(m¤#X¦Æ¬È¹ÈFQ.=MOnwè|FÙøºD,|´²uôE 3( ÜoQ£â³fÃ¦WnyUÆ¦VaVò±= ~$@gCÊRÕ7CÊ¤,b¸þs¡uZIð¾¹&TôïI¼±y¼
ÛÿïV­yJÂJ^ÿÒ	äµÀ-¿ÁýÝèq=M°'|ÞÙÅn5±ÛGø«%«|_p ÝëÑø~~ß;i¶8Ø1¸]ÝhH[Ý¤ë·T?	[(pÞÍ¼ë£sÓÔ%Ë]+âß¾+÷ÍÇÞ	Ï+¶+N?; +ØÁ^¸ûOgVÖ#?Ú³-Ñßó=M£xMp\ëÅ+×Ö´-®*ó1@=MP½¤rz¾v\Ä¯>}qìM#vL°Ø@äé71ÆÓXYGfªî<Ô =}-½·ÿÖß<å'RÍÎIzy~ßGÿÚË0U{yÍÃ»ñÌé¢ê°L¯ÞhlëÆÃó\yÁ¿	88	Â¨¬ø@à#w¹KÏÕ4#566F6Æ«/ÐOçÐa[³¸I}¾Ie¸ôÑò ñÿ@]g¹]E÷AD
Ã;oÝ
"h,·ýJDôMÃyÅPôðÛ"ù%k °ÆËóRìY÷Í-Èë<!87Så{ aÏàa=MÔV³v;C´&Û?ýÃÛÿCY³îÂèá= ùqM¡4Ï­W/N!3~Ä(¸´7ÌîÝHo\Kçéy¤W¾ÒÑÚÔ-H¼&vQ°+äx¨©§AßcrnÙÃE?~>à\~à½lïs_33
«ª«÷6h«£ÜM½Ä]ÉÜ«ýÿÔÚÍ¨°æY×cïËÃÞÝÂµ^¦Â¡¿UÒ=}ñsAù£le>ù=}RÍlúÁ¥Æ\¢S·¾hçY@»0ÒMO«²gØ}B×$©aSIq|tFöÃ²Ön®ã@âû]Åþt»®mÒ=}7¸Yöºz¯7?¹þfväÈëb66Ãi	áh£ L)n7¬FA¸ ÆNªIp!ùÛ\pÑ}²ëC¤és¾_ð:A<ãÌkïÕcTdÐAIG¢Üw	DÁ9-(Px
IÒÓ)SnbCSr¨­}9-AUMcñ[h¤gãQñ× âYËj£XóÔXÇ~àæÞv
¾À©(qY­ÂP¨^×#Î·/wì©:BÊIýoÀóõ8OÑiÔijh««·åNv#W^'Ix²Ùy¢ÙÉ^ðlÚrY4LàY;0o4zÍ"ó"+UdÖÈrÖûØÑjþïÓúu^R·?¬¿á¤·=M8mdæÜ}8$= 9ÔÐ½ú¤=M¬­)ÂK´þ~­4©
"i2Ûw0yì¢åyMY)Ô>rm×2mÝX°ø¡éYìÍèKï@R¦ØÑsy|õQ¤Xöú"õº-£9eÝ&çÐø'Tn²nÜ°R~Á@Ý^èæÄ/ WGAY¸Ó°¢«³-¢CÉ}öò£Ëï«É.£ì¯GÐ®e3Ú¦zÍ=}g¢u6­ïI	Î 2üJö9òd t[^Ho4£4¬jÂdøã³	¹~&?CH*<ïóz}Jß³SþÁr"Ê<gù¯á¶µTr([áñ]ñf,Â÷T_Ôv°û9!ÉR'Ô#)·X¾8ev¢dRÑ]%v´@,¾Åhf	å,NÆô3/~äÆ:¢ôä@±Q/B»°/°<*4a@hÌÂb>['¾³¸RE îÌ¥ª¡]Ê£2WßµÍoè±åÔðÊ=M.½yÖË^¨eE¨ÔÑ{;Ñm¤Á¶g¢äääÏeÙýÝ4ppÐ&¼gê«3¿é:%xK1AðtÈ4fmD+@ÇóhÀ¬´þülKùsÏR#ÒÏ¢Æ;3§p$U­Xaã5w½"ÃÆ"n7òE0B¸,9É'áq1CñMl!ë´©úí2ÐäZðÓ3ä¿9 ¡ÌmÂ0.YG§@¡+þR4¡©S¿´Ò»ÄÌÖ~O×>¼¸zcF7¸q{lÛ,¹7!>Wv0}Ï;ÜLÛ$<×oI4n;IOÍ»¢~³jr¬¶1ØU¨Q+N¹eMÑ¢µKâÎ.,÷4q%x#% ìµdWÅGV´Ïs¤^ùãÌ¤=}èµèÆW?*Ûlyw<É3%ÑT.1íNaú´îôJ (Üê1ã¤µÂUoK¨Ì¹PÂ=}He®!ÕØT3¨£ñEQz*Þ0BÛS PÅ²l¶»»dD*¼lû7°Õä®8ØÿH¦ÙÑEíRKt)ron(	RoF·
cy¦õØa¼ØýådG9ÂÓcoPlÎþJa|u	ÇäªÉ4\ªÊ^N*å #¥hpÊ@RA¨Ë4ìer©tD9µOLMTD»|fQ»Z/-ÃJ@?­8¯¤0kÜ¼ü«|ß÷¯4­_+GwVÕá½GúeUêivX!Ü:¸ýf;UR:·Pz¨7¶>¨{îíª~jñ"Ø&öE/Á¿-m?3ª¾ê­Zõ"Ù¹ûïgjÝ¬dìíÂÀþ#bsåmxu2ârõÇiQ}Ê1¥Í'{ËlåÜ_´E-,Z t;f>{Ãnc"ùíÊ4ÎÙ]å­7è¦ByÀ5ÒNãÂÔ¤w³"VFJµXó­Öè;q1Rµ7ë¾hO^ó9égOÉh\z:ÈDÜùÏ2o+jùhµ8i8Vív[i¢ò"£nR5_ùö#uU-/Uv×}¼nsoÀ«¾[ð¡9¶JJøt6çfÈÇÕ^ÜÇ±±yËÓòíénYtlòÅ,ttÊ¼¼^³èUq4½*½lbRÔ 4Ø'äÿ´!T!(#¢a}~àÎàmkí6#ãìMyí	jèkàPºµñ®SÐìÊgóZK|Aöü´	{|&´ÔÕxJÖ@¬HÚ­¯2¾:jô¶¬µdÆt@íë:¼*}}~Á1Sé¾FØ:D
EX
ÕS¬õØN¾0²}e~êP	Y3qµâFuC2¢ û<*êå7¢¥êâpN1©[ÓIzM5×3º½ÜöØvÉ¦BåóÕ1{Z³vSÑØ½I\çhÐË÷PÏlº,nA nÕ_Å¾Ù8mÕÛjA&výíXYÔ Áàÿ¦ó£ÐXÑËAQ,Úâ¾*ÚJÁ¯ârjjS*oftM#jÿCjó¨%ghi¼"­1ÔôêtçtP£pr
Àª+³[N¾¼F_ÎmnÛ8ßv]õ\ï#n8à[¿±0í»Tî©<P±MÖ÷øOé0Ôê5Q£ÞÁZ¸ùR¯fD3fÝ£S]þ'×ä><H¸iüøOãª¦tµN×¸ñøí)8f¤&°ï¹ók9úæ6²Ã,z¿ð×QQÛL+ò)ÒDàëÁ~f(Ta¥ç¼XC-g~4{ÝÿÔ.k7§HÏÛ¼zäwÅ#%ÔMV05¨nCì·eª­ -©ÞL®»Nk»L#¿YÐè^@Rp³Ümºw£É¢2]Î0êÍ£§þü>HÌ]>¼G÷½P¿ÁÀlþL{Å +Á´báòC, ñ}QV§d	ÑsVËÈtgö¡¹ù+KvºÄ©Oá= y6%1ÔvËK+¤ùÕ5<]uÑ0_Ã8Lþ0áüã5þkÃ©vfSÃsùÒéâåÿê6j«=MqXq>ðÍèdÂÍÀã #rª9eµý2
3óÈñõrc/ÿ¦T¼ìùKOë>v)$ÙGô
ÀÜpdu6ª#:©:}!°R ¦Í×dËàÌàG&lì[«ª8L­?ÙTî|ÈdëÈr*f"\#þ]¶IÝxX=M¥R@ùXfPd}æN¿Ö1= ¾K0	±ñ#òÁ{Èá ïcÃj"$þ¸uÜTï^´= mv9Ge&äÙú>¬Z«ý©´ýa VBäAÀå^$w~òH©ªR£·^Õ:fù(_4ÔVWËôì)\fî5ØMú)¼_ÿ+ ¤ó@íJ(H1o}^Ú¦Ê>¬c>TìcµÞ,4ÀwÝô.³KË>ì|f0st¡fçqÑ?èËæTÎeÖæÈå÷ØªÔþì\¸Z®ÒÂvúá 53ªx KçVúêq¢©F_$±f^Y(
iý3_ôaÜ2äòÂtã^æ Jf%Hú|Zgð Y5÷i¶þ«1*{Í0?{y¬¬FÆ;ãvºÀ5T´wîdKP£Ínº²±^Èéï¬yV4*Tu.\=}ÙØV¡×ÀúfÄÁx&(ç½ªÁÂ×QnXQH½Ñw-²QÿÒ·¸±09 NÓØ¢Øu;0òêJ'®@ª_pKúÒg*,¡ªM®V?M¿±âW*þH66¤Ê!ª{Ï£¬¥]pHY$u0ÒzÐ³Ê!çÏD¬û½£çä&õ-¯¡<Daó·Ô-©Æ<Ç$3L¿ ¬M?ô[TñÅÛQ²o¡*"]ú5n/@iå¶¼y+{:$bøZB:rmà ÝDì3ÒÈ°¨'3Âøb	µ·­é¡$r= ±óÑ¦}wF¿ÇHn5ñ°F1®®ÓÀOc8³æN$£Mm!4áöLÐÙÍQ&tHdN#ÕÆË6Ñ|Òg!1wý#H$î¢D»û*"§×%Ï2¦¥Ùa{+úSúOÙ|Ô6CÒììl<EäKtSÓ%6<x(ªzà/µhúüµn= bS®Â/ä8=MC¿e9H¼@=M¶!úç>,#p&ß¤ýÿÐw"×"HázÚÊÃ¡¿Ùv_:ÌØM=}êÀÖ¬g_ØÛ}bÚÑÃßÄ×Ý£¦ÛÁKÞSÅØO]ÁÇ?RÜs·¾¶"gØY¯%ù+³cØ¹ßQ¿AQåÅMxAÛÇP+¥ú!án$÷4ãt»+»Hä¨Ùr#­ØøxWg[^Àýø°©&Ú@àRØîù{I8d¥©=Mô¾¤ýQq-ªáÄ=}fzQ71P@[Ö¬»ÚA9TXÆN©DÎ¢ì)fÝsK]®uÉZÁá\ÞdZ¸x"qIõöbo·<3ÚøT.¿YÒøXúüM »-èKeâÚâ,e2	·dZþÒÃÍ£ùúP+ðhpÇÖp¢ÄØAèËooX»W<í[OÅ:ÞrWÚ*7>ûÜÑfSíø¾6(zfô+Ï._ÛµU Zu®ÉL=MÊ-£¤?­<=M0¡øïö´aÇ£z¡@MÚ*+SJÎM¡
RH#Y#ÜrÐV¨H3kæÊ t!;{ÞU]®bã ªú°¡áõn¿ï)%AÚí8õm ´PuÓÒ¤¸í>oÀ3ó\N Î;õý¹6r9ð¦ïµñéÄwtÈhé¨4È$íÂúCIÀS~;= üîí·½>)éîÃ¸xò=}Ke°Õ¹"ÝlÂÿãs3WÝ!µXKÍ@}.Ã¦{ÀÌ²ôðNÈ6A_>4Oö(0¶§áõG}0ÓÇ	= !ZÙÊòi<ù¾%37®§fÇjÜâÒèÀ{g5°Á:2&s/X¸>|ó"Õê.6!Y¹Ö­ßèqÉÈàs1$7õCDôG3Õ¹½ÆTT,_3ÎîÍ?*õWÙT(Ú5Ùÿ= #ÂV¯Î£Éð¯tÝÖô_b(øÜ|Î}öN]Ùâßn<ú¾wÔÚBúB¡7&íºt+'a£ìEÔX·KQx'ÿ}ª= ã¦¨rÐñ<­µ_üeÄÌÜbä\ãaÏ{Í[,ß(ïeÐÉT¸|ç­Í·ÇÈa®üYe?ßõa9åy%æfLk=}¥íÌ
N®Vº_Nê[¬! $	u	åskûßh)ãÿcÝçh¬"\]96HµÇdðÎ@¿è,)ÛñD µ¿ÊTho¼
o¾¦QÑ"9\)Õ××ªÏÏ©^°Ùº=M	¾þÃæ®j{äf[%Ûdb@S°íã°£Køj2J2©sÊ¢õàïÿÿÛk/hóMå¶D¶ó~u¨§óDvái8ô<ùXnÅ´º(XÒz_2)/<:Z6#ÅÙkÒx­m.\Â[ßÎ qG|jÕõk1ÚmXRZëg[ï´í2CÖVð/ø®ìh/ÐsÿÙè=M=Ui¤]­¸]I[´k-0ØÞ¢5$ÒkPÙ4ÃIÙY¸(V(0tâxû#ÄwôÓ¡ü÷ùê=}_= y9ø 6$?UCî·*ñ¯;²¤³«S¯òëÙ©ÒMeíP= AW¹hé¡¼BH2cÞ0	ca9x&FÍËNQ$+ü]®]jdNöÝ~âd%lí-À=MÅ£NF¿È9nÇ#<T¸W¦þ°8·ÂfúÂ³ë¼öúâú+9%öóÇÛ²xÆ(ó]uüùråó-¬óèî2tf¥Î¸A'¶ø~ah°t2:£ÛèÄ¿øBÅAø
*fµá²Ep}#fþº_°ÿ¨zÞ%¸ÿ<àD¹Wi)b¤c §(ÄaØýÔÖÄX§ÝÑ%V4>ÑtHÛ {Um­ío.l'2zµýweU;ì}?³ÑËÁ±|õTßzÝ¢IkÙÊ§¹z)ªxÍ©ÕÚê¾]?àêå?g¥^gZó?°4À¯B,cï­;{ýRGÂ}i4gR=}®çg',/kºÅéÅä¥Âä_eþÅ{%QQ$<«Pò'ùÄRjËiXUÐPÐ&²æ.¿Ýr½¿aAÜ:#t4!ú4é=},küßO0§DïCçG-êJ¥³hBg#¯m-=M[-\=}·_Øë×þÜþ
Aä¶ì´Í«dÔ|QoÆ»_x,ë}lð!ú
¯§N§ÌY_ÌZf<Käsûìä°¯á]äÇ= µå@åÔàÔã ê= õfwâ8¯ákè8­á«ë 	 Ë´ø ûÀs,êfsàÒüi= íF<à}â²åÀ«ôÐÛ	ª1 ÷ÅñïðQ¶«Åª×¢dÝ¸ fÿ<Uòu»YÇÏRÖaÇ_¯Am|E[ !Ió  8³5úÏö@
¾
[Phhvù$ùÄìR3æIm±Cð=MhN¨ÁPÐ
júI$«%ú½&=M&±wè<%Ã²ß71)&(¼òíd ëpÂOÚrªÜ	?mMÞ£Éh]lÂÜCÂúbHL»±¸»&Lg¹¡[}XÁæÞ;[ÐÊ5½RÓ©K#9kÜì%~2g¥ô'¬,úÍyÎFl|Ë9T¬¹Â=}m$¸Ñ¬û×&òYö\ßß»jÍ[k]küXloEüZ6<èý6ý÷,Ñ	K&<Ô×¯_ÚÕw<2ÀGßØ¿_ÞV¼±C<«5¯y¡#<©í¯-H©@¿I²+Nùá;a²¶OÒ ¨Ô¼7ªÆèêþûùÐ¤ÓTB@C²ÁÇ%ð»Ñ²ÑªQ7óë¸µôÁ©iJlÎÅÒ,úp'å)Ãên	ç-<YÅËü>½g¡ûsH5e­)¦U§æV"IKâ<£I ÂB²-§v
5^ñ8dý¥bKL²ítiDí©tnPh+Íxü5*ìEìý³ÈÄ¸Õ´¿J8TüBýûnõ¯úvÌhõY/jMÀìÇ.¼¢ùÃønû ¦ÅIrÔ=MESè«LêÂªHi»ì¯Èø!æ9§GæMTüÈCJ»~ýq×ÅE5ötßúv**C]rº ³¢p¶gnäjF3 ¾Á8¤þÖÓWÌi¯QÄ9}IÒØpÜô1=}"ÄgqG¯SdôJ~öÏ8ÄdÂ­ÿéµ<}äª;0»ì9è¯ Gn$¾	'Í²r©M{(A[¨Pìâ¼DýÔý,QQ¸q%.P{Ýðõ9@õnùÕ8¿úî99\
nxw¥v óûÒ¼IAW¥%ðyUq¶¬¬alG:ïígPO®PesÖ§ ÍwýËNKP7¸®DOÙ
e]¨hxEtºÂãû~T¹ëÛ' ÁÞÍÁYGB¤er1¸Ð))ü"H£§=}&t0úúwø£2rv¢oðé5=MyÀD·jÐ37I$­v}Ù¸ùäÑð\cr° øfaÐß7,ðä¥à³·»ì,ÿXÎúmùL ÔS<â$ÖÓÐEÿ\É½w-?ñMÅ#.GËÚ¸ÂP¾{KegW];ÑüWÝVFZîôtqÑ«DD²¯Þï´
û vº¡y1h´þY%Éý¬s5JÕÎâÄ¦uM+vÍG©îÍÌ§¬ÌEfç?ïr'«¬ÐxùÏ¯EFFFFFFØlUM×¬ÄÌ2)öt.Q7ÌpfÄ=M]Cë¡>ÎMª¡äïîYÔfIê8_s|§ü¾®´$tÿÊ©ö_Éú¶tkÔ©¦Íß*°5iïÕDæPíOîÍwrIòX®#D¾ÕÕ0ê*îARó¢|äÀ ï =MB[q.f#Ä5= 'ÀET'âE[Ä Kíë4%wrBî@#ªÞÉD<s8Ì6E\K0_»ì¶o ­}àÒ´^ä	¸= r'¼hÞðÍðÞ6]Äíú^pn&¢ùoªq³¼MÕq+(Í®?,^)¦X¼ÅÄHU©q?Äµ§ï¥íì0=  mâvHÌ1+ÿÚDXÄXä*ÎÑ¯Ù÷»^ñ<bdwÁòÜò>ed¿E¢ÿ ÁU(ØãJ¨Éa>;Ô3¿ds¬æî5t·¬P÷¤·Sd®ñ I4a/mÊXéXAÙòåZÙä©ÇÃB°=}=}ýt¹Å$yÅÜãÓ'Ñ|i&üÇ7¤Î0\n3IùÉ¹l1îä³ýv}Iv H*XÊÚ¬ ­*jEù= Ñ.Ó¡l!64a5<àïÎ2 Ûî Fóúx\£l®T'4	-.4qÍ)G"ç³Èè(×Û²ñð= ÁîkÐ·Ú|·ªæOM ¨j{õÙ6ÝÙ HÑ¿ÿ<¡òÖnñÅ°þN4ùýCÈyl+ÕnlÌ,Â7 ª²´¾6D=MòJêÐT+ïL2(*>£= CÝ,Ä¸¨(À¸êfFs*r2¥17}lö[UDf¥®©öGWn(Ã¬âmújýnwîxâ¹-v>nÜNHy-z)FÇ%ýôâ-RQ0ó?&\Õwç§Êr|ùTÏ{Áv/Äe"xxÍw8NF7á{ÃÒ3¬Á+,¼mºkgk­= £9û\73yÖúò«^B?BY-[gâI©bó\O¨ãÐ\aùñ»tja,áfí)Q*°¦h
r=}gº=M¥ÕLê´Öþ]v<Cù'´B¥Ã!?×=MÈARÔjÕv+ÕÕvÊ[m,ü7Á?rRÔ×Bº.û>?!]ïwfîyHÇî¸ â+ðê{q¸}(âç¥?kûèÁÐ><ý!Nèá'Nuèð¦Æ-æÜOÐlc¸ï©lã;r(>Z.¯VòäÒ  ±8^¡lZ!.ñÈ×,ðãy¼K9¼Kù>9Óù½K¤­ðÓJfM4uBèI Ý´ØöÑ?/Ió?±ýæ-S­ãñGhö#©Uh§gÍ	ôûaA»4ÕÇ= *-¢Uj¸9(¯nq>Bîv¥Röá­Á|©g¢:¾ynV×JkV058MÇÓ,íV4ÇxSÀ|léGµHKF?¡º²^Ýc·ÛÝHÞU¸ãÖ/DÕòhnuÂÚÈÑ©xm¿F.UêéyoÐ0ÜÍ:gH/smVý\Tó=M¼LâËÐxØ'ð1¼©Þy¢ò[:t¸B.&7°&ò¥Âoq5Ü]¥èb>ÉñWÝÌ'Dip*rË&OÄFQ{¡ò#i«{àõéf¤0mì{?jÅ§Q¼î5;Æ t´oÌ8=MCªf¶6Â¤¼J¯Lþ;eó¢9ááfrÉEâÊ&ØmFvtÃó8±G¥àôInGÖMó³õîÛõ±Ö£L:¡\°Üuãñº¥*_¡IH±yï%¿m¹)/ªÞf­iwùw8ýÛªI3Q\ÆÁáÔç~âæ*/[L¼UaUøMqÍQí3Ðì+'úpDÞ5E (Wc?uã²9gDP§0}¡ jö"ÄBÃÔ.mä¸ú÷@];î,|QÆR6²º¬ÓæwKly9ñ¶®øý1!H)µÝ4J%×a3©4_= åxIUjåý\-0	cà°Åy=M¡ÖE»T=}ÉÀ1«Uþ<Ë1«±vËY´R]o:Ç1«ÕJ·ÓÅZ>ØFükðóþ{åW/Ð¨
=}|Ö8ÅfR'Fð"fQJ½ExNàænL¿=}ZíðzdXcfôm/w¿ÿá= ¦û<ÝZÝþî:­Ë³ÆJX#ó·ÌâBÜÂ-äÂOñ¸Ïfs= ;ál¦ÏhéÚ%·Þ,hë´c
GñëV|ò9[J§ºàVåÑôÂ5§ìE!_0©hÏA* - {£;;ÖºPd7ÎîdZVZ¬5ÎË×jÕ½ë4Ñ,KÄõÈ"6C»OÜ¹|¦Bnq1Çu¹©5ÈF ¶Dë)nµzÝ?ÕçÐpÊ0ñxÆ#Iå¸öÉÅò$Ì°¾&µMKî!2 Ï¿3yòpÁ¦föÔíÇ¸ù®ÜlÃø»jÐV²/MétSÒ'[#»:uÏÙDlr!=}»C6¥ª¥·%ºrE;âP¢ñnzù¾Ý@ùë4·5>´²a.¡ìmHÿÌáÍUi·ÍÎÈmNÖkôAlz©û!åùvOÕ4p?¯ÒÂ-@ÂB|åá9~II*n Árâgîv#<BF õ_þÈqTçºÊ5âz^O¨Ú8sC5Rì-LvåF/·xõÀ{Â°&ÑFrÔ1?Uî½= z£PZåÊøH7zÒÚ[Ã+ÑÆU]?jÎJà' (JPé»ðB  HUª@×­.¡RÊJÆu]¡ì¶÷Cÿ°ÃåÄv)/ýÁÜ©)@eê5|oÐl#GÉ-(¤ÃÞÕzæþ:O
Ùìz}"ã8D{_cÜqÄEýämïI5fñ«ZÜ¬}zFÔîè¿J=M'c¥1W~xYÍë}×¶È÷ 1]ÿ¯òµr.ºâHËÆu6ú´Õÿ4Øåá?ð­?É/Ão©OzEü2v;ßÏSRgGc§l!U¿GA©dù¼¶sQÀ5Èn
 Z9= c AéºÃ8ùß;a¯%a=}Bõ	ÃVài³þÕìê!|!Ï."oYC²ú¡@·¶5:=}ÃOGÍ7·¯Ík°¹TbÅÍÐÿHâô¤ô-»Qlí¢8cýø¨ ¬Ë±¥ÈÕ@ÇÕ$!EÈÙyð*'ç]Æ%ã~±¾Ä@xÙ/Êþ>Úe·/½'®æ8m<¼~ÚV¢ûËðý«±ØTâ&¬xg| O¾Øå£l?µÍ×#Ö#8ôSµ»g
Ø¯Uì#@iÊ]ãö'\5¢7¥Ö_¸ÃßÔ=}«n>rÇ= æ-¬H1åøaÝ«Ðà¦,ßu!xV¡A÷üU¡ëÆVüÇßWï­¿ìU6oÅzoÆÏXÑ_¢Ì¸÷í\!Æ	*_|KÿþÑ=MG®-,!iNýóïWji}¿ÅÂ~þ¤É U/uÉß÷§C ¿òÙµ´M{ª(DHK¤l;z¼é_Ûu!!ËbE÷|U¡5Èú0ñ½uj§éODú°¨â#!í,rÁ{Èèwb= Ka¨jÁÌgz¾áÌ Ó,Ðó= M³p¶rôB²Ã´"yRÃØ½tBàD%µ§DBÐÔêS:øÞÁ§îódÌÒMìh§¯aq´éÇ!´J¡ êÛEÛwÔt²@7÷vÞ(ïXÛF:"£äD¶H§H·TÀ«QaFNæô¤Þ´á£º"Ï¥!¾º©¦D	öÈÇËöùËûÖð:ºýÍ¹±ì }Ïè ÑüÉ[Át31§:¿Ç-âbw¦d¾Ç·SÞÆ­1 RF¸?ÜZ dä"åFNæYvØVæEÍ÷^ÀrbÁj®ã©°ÏÃd0,.³w±;ûñèU®¤1:+zÿôÝ#¤Ðf=}Gþ\¥øxTÓ= ­ëM.t?F7Ð]ú*(_J¡Ü®@1CôÅï
{gxbbC>Q²ÍõT{qûúWòÅI%?:= 0Epf±z$¢	jFvdyNÐÜe;÷<}¯§¼;üäîý@Ý|ðìÍé7,y}ì1ùót«°=M§øà	¾8K[þ }ðYBÚc¸£ÛQ(uè(M^êÌ)C @i-È"'ªÛ°b®NiÓf-êbUxïvSº$Úì7+£V:å=MØ6&c÷;¤ôf=MO?ä÷GüQÍwxA2ªIY±AÃo9|¹Ï¡kx¤LìQFÏaÁ½Iwû¢¥Ê7W5?:ÕÃ;¿;ÝAÕÛ4?6ïæ3myv87/Vóà2pÂã<ôÈ¶/¬[5I£@ïÔÂU
2ñ°ã¹Ñ3l| *Ø?Åà0ÂgéES(WfÚ¹°jlHÈ£þK-¿Ðzæ/«ÜõùÑb¡4Âå.<æëBàs±p#b«Ô,ê&90sfæãð¿çÌtÞÐ*l¨ño¦xlJ*¹es@c?Óù$g"z= EÂµ4@!D°fôLÔD{é¶KÄ6ùgÖr©>8Åë] 7ø.T çÂÛmRAlQ«U.¸Èã³¦­l»ð&~[í¯t¹"*¸srév²Î¡u±ÇQ#tIhc|$²8¹ÛR»N& ãXtmV770&çtV»³´pÓ)3l9ý>ý£é¡If5[1ú v¿]1ÊÍÎMóÑMÌ¾tNäÎn~Ä:çnuÐäÑgÄ3ÖÜp¿åJ^{øêZCÔ¬¸¸h\©¡yÄÊ%«+î k¦ßîÑÞ>eGU\ù~èFc.Ñì±õ¯ú~ÂÉÝ~¦ó GMeÝ­(n« ~	Î÷ã¨+¿aì î¯28ÏÆF1ô¯Ø÷ü¤Q>Ûû\mAá èáàÖ÷æ& åI(Ç»¿÷EÇ£L§ÕGxvÍ~×ì³ý·Û¹ «çBøèô5pþ¢¬Ð/Õê(K¬ë¦yÙ,ú6üwÑ?²zÂI¤¢©\¡ôa"°@ÆõÝõGÙÄz°1@©}ºMqñ.hùvÕ¡Pø.
Í	|ü¨°N	á'ð-= PP½ÀÆvÎ<Y>KïkáÜVOÙ*
7Õ¹ùèäø/¡ËÝ= Å^Æ;ÕR	®ê9¤Òu»c%W1ý9UTj§ÓîÖçWÌ ,ä)á¡ÅyÂõOtÇ¹Uç¡½U£rÊüëãc
ã£> CC@hå²àÊ =MÌ÷hTk=M(cSàiy~h@ñ*»(*×»¶ã¸}8(¸j½½Vh²òWNÕÁCU²5²=M%		õ	í		3	ùùãyw
×ÛÎ%+¤ÛLA-ñ9[© ÖMN? Ã?÷±ªÓÄÈ=M5<Î³±äcJM°Ñ*ä{Â¸ýè3­(¸l"²Úä4ºHI¼RPÕøSz'³Iþ^ÐÎÆ±¾«CRvkVHI¡±¸D¦Ó¿¦%
µRvá£¹¸l	ß³,lí¿Òp¥½îÝH6råÉsgJmT®K÷ÞÐÉ{HI²ÊÛÚä}=}]})~r@µ7ÚTu´Åpýjùÿ= _Ïï§>ï+Ü£ßã);áÁ'cÒ¥~	sð]L"nf!	@ú¶¬¢Á´HÄ¦ÁÚ$c²EEæó ãÐ<L®òCÅHû)@6¡#þCÃXXÎÁÈo¼{YÌØ«Ã5ïowDDÆ!>=M«¹NÃÔÁ§,DÚ@{@H}ªx£ðjÀ$Úu<CªóN:AïGC§2^¸ï[ÝN«Í= õUF¾ïjy	_l5¼@:>ß©z©²}JÏ}pø³¾qtV'$£³¦°Ò¤ jcâ±adÆ:ÐÅ<nÒçL9tÄ1&yý'¨ÑªIj¸Qy¶-ùÜCºÏØ×¸8']*_3¡É.Ú+öCÅÁölpøU-³&Ä$=}\S¤½!ð¶î¥#(kçù8£Ø¤(8YºÁr4LdðAËêÍþï¤íÐ¦êÃØîz@±)_®îb<×ô¬÷gbÛüî=}gÈi{n¶by°8ûö­¡høþügz{Ñxó÷;?ÂKª·@Ác4 =MãmÊy´uiÒ÷9xû;Å 3=M÷ÂÝQô£Ûøö6Y0?{gsmYØÂ!(ä×N)Ð7f§æáoÑÎÅÒi§#&=}Å±8­Ìov:þÖ-Ø6þ.þÇXäÖÐPÍÅQ:Ê4¯ß{ß2§·$^D¢ÿ»d!Ëd®çl%ï>eh*öho4j´£J$W?Õj¢ìÕ.;áW¹¦w»¶z->¨]vgsí©¬­=}Z«M=Mß£½Î«J8Çã9ÅJSJô;^°}õ¦/Dw%¥(@öaB¶µxù]?®´çL@S÷Ï@/,×§ç9kº	VSÂEÖÈ¶ýfõdCÖi/µÿöC¿£BsÚ²³Wª4'sÊ²ë&tBý/DKú¸n¶7³qÿ$Î	¬wæ;Ø³³¡tM
yû&±a¯ÑÈR
Yþ©3Æ±}ùk¨Y	¥»uÐLí5¹ »¸öúÔWÉ<¸%ßÎÏp2Ê Yu£D2Wl´ÿ41Zµ9Ê×M¾Xu®÷¾g¥WÉÀgÔ!ÒdÒØÇÄÀ5=MY/ê3ÍºÏ´aÌÞ%Éõ­ÄQ}n|Ïwy¸üµçÞ]¡¥	 ðäeXõLl5£¹úø3ëFñÝT]ÕÐvì%@dÐãQ#U²;f ÝÕ=}¦}#¯ôë$»:¡,¶æcþº¢JàÖÌ¢áGm"¿ý.XúÀâ]Yñ
îSx÷"¨Êâ;¼ × ¤í/-Ö"ÆOÄ¯ÔaÃ§hîÓcÖcQFóZ¯$Ø	Ù£WVàö|í¤Õ©(éyâ@\ûbRcÄÛeâñ¥qø_U
¾/cUüõF¢9KöÚ¯&X6ycË=}SúÛÿ¤ Ä0<ëÂð=Mþ¯'á®­¥TQ&!ésCtKê~\*á;pjeã²0Uí	ý®²1ãï\QÑRj'E!WWöäú¹0*«¦izL,¯!]AîjÆ ÷÷öÄÈ>Úkü&ÐBKO­èÒ@qsç
«£ª÷YPtw ·6b¯aòì¨v QäÇ/+ðÜ<bfò2Çñb§,ñoóXÄ­ÀQ
u§²e6Ó	ÂA4¦ÃÇQþ'Ð¨©Èo GvÁÓi§½O²ÕÒÜ;ú¿¢C5ûodîþ}üXUÓpÍÁ-?o22W(+U)ÕÞå.=M«[i®+®Í¿x«vMùU/ûës"d#ßöèôî?7t³wñÒ·÷Åé$û\%*»%÷jÚë·i>Îº²rò=Më²
ZªX·|¯­û­ðìÂª¯8PRþ~¼E÷_®BúwqëvÅ)+³»7Rvj{£j}<²ª2.Òè·TvÛ3TmK)Y ]xßb»V×óòÐs³°ÍÀtÛ£[ô¹yÊLrsîkD?IèWäC¥-Í¸ÍêG½ÿ-§kEßÖCo_ä?ÒAÌlPæû:ø£ts8¤(WþËH=}¨ö\=}ªT÷¦u¬(Yý«ôLBrÝ9P§NVZ*	]bÙLÊµóÌKÐùÖÓâËWÀ
»ôUkåéÎG¥J_¦&^­fÜ º_EÊyÊFÌ¿ª>Ü«´óD¦ nºN©3Å\:ì5*v³È[:Mî-(µ«éfÔ=}p¤æ#ÈmÜPÊMG-FôÚ«rÒzM¨' 	ÊîD¼ib]ïCÔP~©uY0¦+²ü+?¦lû+²Ñá4¼_êÑ"é§&M¹¥¬»S(-ð'Ñ;Æ2Rê½ñ3%Söi	igÓÉp¢ö3?­TÈ¥ê¹{/=MIeùbÊÔ7q=}£Jú_Y=MN9/Ï3r·d­ôAufNåÕhs4ï÷³píÉX}~&n ªÅ$
ÉZ#!ÖèÍK*þ9ÇÆ	ZÎìÅü'Cï< £Â+ÔF«õ:Îúí?Yc6Ä¿+Î°e×PÞãÊÆÿqá?-ol_&=}Üëê~ßjLö¥Ï(_¹çØ$ÑpÜzOÔJ]=M]¾</^04Q½¹»$4QeTo1<5çÍÛwn?Ìí7[IÐGùØkÀO]PÂü¶Ö¥Y7= :c¼ût@³l»Õ
°7%¿LÜn{?ÚúHÁÕ;MäÊg)¯TÐÐQ_¼ëV3ï£ËÝláÌnù¼è¯*æÀ¤vaH8èÉ+æC<Îð¬-üjf!òüm ¹ä/¬'@ja	Äõ­Ð¹ìÿ¬±X¯âq<Be'e¶P-¡¹P; CNxë>Ýÿ4ßÚçóÍPÅx¬¶ MôÜýÑZóÃÞ7GÈâ§­"4i°Á¥!W #O£±«ä¡ Yv²Ì½ÀËnó×¼±©ãÏGXBiµHÝú?=M¯û½CÇc°8öêNÊÖ¥
tl£ ÑÝþ. Ï$¼Êyè#s­ÿûâÛ,àðSc@Tès/¦ ¥	h	{âúÿl-m¡¨:ùb^ôV1Aøón{¢DDäÞ>m ÏÀ(¤´'BfX
>.#­ÆIxHý^gÃvPæN<~áyÐó­¢£Ê9èî|m9µ±êª×0Âç7®!|S4&£¿æK¤@z2BÝ;bÂS	î[ÂQG=}öU¥Ã±läüqàaµ<XkÆÿSÁñvEixdïrPØLò,UsÁñìu«©¨µ+¡¶xô¤~)!}J
fd"õÅ=M²;úlë²°5}fmã²±ý&Û²4n+ùøsxacùÝãóa[ÑÙ=}bì_2ö«b¼eHG!µûM¹X6xmjS¹¨ÛqíaÈçÿRPçÎÅ =MçQ#Sq÷Ùi÷ÒGRqÐ÷=M]¤¸"lDOÂ¥8,lº]B<÷#Ð9ì3¹dìª£=MÇhãÒpzpg+Ò õÅ!ÇÔ]ï5Ó0°	]K*ÀNaä9ò8%*Àu¡½Ùò<>a%iä]o*Ùä¦o²ÚPÚ¡¢.ébôYü´ÁNèï%þ
nVÒv§z þX&Ñ8~¨Ã^oÃïo¤X¬8¯Mï6¬£Yoºêþá'YD5Ñè§Ëòo·Y­Íïk§Ö·ÐH^®#ÝÏ;þ'ÐÐØíßªÃ«WI~þúX|Ý©Æ÷o¶þßÐ¹¬ÃGëïµþ:ÍZ~VÐ¸º©£Ïoæ	Qw´¼Nþµ2¶®))9ÖÒètªrº U0Êj4´[6.N~ßQÏß_Ez9ìv]U©	v¯K»Æ\®¹Àb+m,kL«wïu¡¥¼ù¡T]Á¡5âÁc¢Çe%O÷ê7æóêÎñF:6é#w½ñ¾]Ó.X¡%Î(ü=M²*üÒÉK	úËª¿Å	z?ÊÊ~J*òåÏÅ%×wj*õ6iJ¥{$Wå$ófÿð¥.
_6Ú¨HÂ#±´Ôw¯kâú%­!})5ÿÎÐNÕ(í®°Ç¬h³ùtsÅÆ9SfIÖ|{pK]Âª¹ýÕÆÞüü¯¹½éÂÊÛ&P&ñ³µQ¼ÕÈ4.w3¬|¯í+<¬%EÜ«	<®¥ü9­íÛ~ÛKeÛsc3X?¬¹-º§
ÃN,¤9ÕþÃtÂTB®SKüPÝORË»ÏR-o_»R=Múàgï¼®È¼ZÛ÷·ñ¹ªßw7fM.pCï$ê!;yÜ4EÿK]Ç9ÕÁÞ<Y6ú¥ç¡g×¦L\	Û¢r=}íA_vé8¢[2¹iåê¹blIªw³¹§{¾¬¸¹wMü¯\ÝyÙÁ Æ¤"8Ê£PÖVú{kùþ£^®jCæÆ÷	LP1æ{öw£.pd4{¯\÷Ü%L"ÍòÁÓöÙ	ÍÛ2¨òÊ7c­8bÌ:;[ëøqEQ{yÖtLPÚVU#ñ;VF÷ÛØduJÎEI++ ²ÖuwÏ9Ñ£Ì>¤1E·Q&¿/åV¹°YGy¾ÓL¦h+/¾õ¶ÒÌúSQ©ÎL­*ÎÊ9ïxÇ£'k~n#/yÉë6Ãõ+Z«òGãm=}?¸!kÏL±ÑvÏÙc=}Xº¨f¥ßFu];¸¬}Ml°©¸göwm·wØÄ\5nZçª³,å6µâEª;"û5ÉÓUj!&:ÔT~Þ¾o¦Ù×±ÇTª"ÖN U%J¨ü NUã)RÙ4ï.AÐÒPðy0ÙiñD@O&îys} r>ÿVÛd=MjäÔïíÖ!oý¼qüq?ë}qó±¢üõ{ðÉ}äýË&ÍÏ¼I&fí´ÐÃ]¾tÎÆ#Ý¾lLø/Ë/.¡s¨³ç²©4ÒMê9ñ"ý£¨È]ý®oÃªÙ}*7¯%¹	j\+©ZR¤3´eäs~(Ö©T×+ê=M
*°°ìÒµ«ÊLª:}+gÆ1ö/ÓHÖ¸ÙDB= Bör#³":ÐDñå6=M²M+htJv1y¿´Kw/oìëHLµ^»'«Á´êú>rþöÆlµBÚúºÆvæMsÕtaÜ°mÄÑ\ó­yúoM;©[Í²>}2W°y%ÔPQ>(®x+ÈØ ½3SïµÖ¹+;×²Ú]´ÒVýKïp½ÙJ:.ºç
HÞ®*úÑ e$7÷ÿÝ.&Ón3²´ó4ö\r&Ú71wÏ	²Ö-ÑG(5Tvú'}_®s¤Úâyz?Us+DÔMøXeüìrz¾úS}N0Ú-
2%Ùª4ÑîU¨¿¼×¨:ÎÖY æïIr¬¾Ûh¼[ÿ3[/µÔÇ´»Ót\[15ÏSÒvY)=MÈjÌKÈÓfn©]¿q¢[zØaþ
])
È{ÊG:ÞeÜrÖJÉ×}¾×÷ZUÔ¦~úlú(^°ïûÒsìKÃ?TH$ó]Û-#ß0UM{b6ÊK{1ÍôÌ´!Bw.ºÚ+Åkn{nÕ0i'=}ùcjòùq%´þ9lÍc®]P¬,î×«!¾vÖeijî¨#­*áEêIhÆ%ì6b<é~¶ªðvCêÊ«4»*õEXNfiç´P¸"ý_×£º<ã×I ³4óö[Ñ§8ë¥¥:ø,ûÅ%ºpÿ¼ïN»ÚAqîÉ= ÉÕ'·ºÞ¸ëcu(3³#¥ZoóëÕ8¦àYæºA= ^ùføÛ»ðASm®èê1ã0ÔAàæÐÙ æì¢´Ûc@ÂøGìfí!4µðDºí%HÙ0Hxî£zAØJü
Kf;¥øÇ÷úC<w*³,0½@b{& ßÕèÈåzBÎý3T#®	lôx\zæ:Gmåþ9>Bi[_ÑºêÏ¾8AÄN8#aÃ!ûï%ºæ;|0þi3Âq¨Küé¹ùâl^ ø_2ÕïêÌP[kýºc÷»¡þÆñî°Ç= ë¼xtobÛà'ì¨W$E|°Ó¤éG¼}Òp¢æàÙX±Êâky"èþè± ôBèë$h´_Å@iA¸ùf;äÃõä!ûÁÇ4 Ò ñBÂ7ÊUe¼ü\ÇfTçWü¿Ânòùï&YÀnçöêA¾óÂî/Ä&lf¹±À-H÷ÌË¢¯ûË
Áæ%©CÛÑøä¸Û\ï
ßØ @
nl%¦ÙB«]?Öc5ÿÆ^Ó#hÇ´ÍügÁ½Ã óþkom§­éx÷á7¿piX|ñ®o¢½Jò^|d±aØÃ%aìÙ«àë7åÒKàR îd¬ |ôå!K5ð´çÁ= ³D´Ç/¦Ýsñ xbÌå3ÀÞDêª'ä
øOäÃx^èV¯é¡sh6èeôç+"Q	ôè£Ã¢ß¥ õå1TµM»ÎMÃÕT3»M»M»¦S ÑË])ù£ì?ìÞ.ó+Îüxû+a÷Äþ§&=Mn'Ây	~6Â¬k¨X$ät0âW°9µ:^,Gn7>®³ÂqnóÔÉ	:/»Z4ÀÖùÐMpÃsaµmðRXq7ÿlLB= §$1ly,S÷x_§¬öÒÖ0Eew=M,IY/E:©ÜªªÔÂî§¸x©&3êSn}Êþv¸Q³.ÑîP(VPKmcMïü´©ÉsÒs¹K|LÇ¤µ¥uÎç<,8ÌÂÙE÷¯2ù3£­-c{Óó½î¹Ø®­bþJÓðt¤ÑÐÖbg_DÇE6ïwÛ[¹ª+k>)\È«ÙØ¸­'%Á§2ÿ«¯ÚXÞµ§u"^=MÝLSÙ9¹/=}^öÐU= .õãÉú@G XV= 'ÛãYòÀ,z Í
ä1åiÑçY(M!ª¾èRÑGpªå"Jø9\èúB©¼ð#Öf¨WdÑ¯ßð?Ý#Ûd9þéP*xL{¢Ôß¿d©~¢2ñ¶m"%Åß¢ÄÕñò.%XÚ"yòÓ)¼±c¤$$iÉòÃ¶+Lß$ÏòK«<
,"WyVyÝE-uù:ÆÝáy·Dvq$9.eáEõæ4H¿%Á1|Ôÿÿ0T¢Õêµï	8È	tÚ	}*zâ
D!Å0'u¦é
£
ÚÃ4*­3y6Å¡þu/5¾2É×2ÅÇWuÆÂRJÑj¦Î³(·'u9Ãr?£¿/ÃÑm³z¶>Ã­má§>>´S7¡ëmr~Üµ0³ê>D÷4
H;&°z #ã¡öbJ}äZëÖÊäÍb­á!$óÄúx&Ð\j ß<!ÙbKåoè¦ÌñÄ0/ëî<ò	XÙ PÎ@Ò!bcß[r'émStm®ÿ%	úZÉ÷ÞÑ=}¯à  áðfM»¸»MÞL»M»M»UCþÅ¹(k¯	óêzã¯cjô$åk4±ËÒ®7åEi¶%éúö­°6H_Tóº³í­ÌiúÖ%çU#0ÖñH¥HôNéíÊG½±nYHÑ"´Gé
ü]?É¶ÎÕHÝ&tBëúí=}¼aBÍ&%×®Ý·!´ßÊ^ôµnR}$Á.G0oS¹åÝ³?&'Þú:Týei¼Rý±mÒtÕÜà_h"=}ÿ/0½Îß×ÝêØâý1¹7¬K¥Ê!¡¿9vÑýºG¥¿s6ÌãºCù¾"^"-ÍÚlº»kÔå5VµB]%EL= M'öÍûªIíL=MÖ¨b^'ÑõÊ¶²Z¸P{JëMmMãV¢®»5MïÌi·Ö¶¸'ÛL?^ÝÇ{yßØßÕãà?ß¬èXfë/ª¡ÉÎ×| [Ê â:âl,ÄÃµ§àD÷fuH+ §HçÄcI<t¬æ!u«IÍ¿XÕ¢åBñf^ý1ö
é
$¥2,AÚ/P¯_Ågz pßyx01k&YÊä¡ã@=}éàä CM»ÑVK»M»M»M»}ùm0Ág>ðüeÄ©¢ß¡¬3X2Ôï¾í¢c{PÀØlåAÂPIáªü"¶¢Ø= ¬°QÊþ#Ô¶pÜ^åëêN£ÀÚCTÔ¢RÏ/xþÝãêñ_Ð5â¾mX#ñê÷4¥8ó£ZUQ×~ñöÅ{ÁØ]KÄÖ¹¡´åkXXnÿÞIï¢ÌP¼ioaY2îvÁÐü8O¤coEØõ9mn¥mh4O#«dþÐÄ¿|Õÿc;ç0YfQ¹(KmÁþÕÑi3¬Òg·ìª®Æ~nY´hfGvÒ= ¼ê¤Æ©ËÅÁ~èäw­¹&Si}ìK¿#±ã¬7§	ÚÛ#4¯±PÍ.+ªUO\Ã=}NJZ /HÙÝå/ÁEÿxÜë_Ú.c7IÛÌ%¯$<Ô*|
ÿùÓ'zª4sÇ?%j³5uzsXTöÏÉPjþfú³h?¶zÃyÌy·D-é¸-Ä %.|¸u	¿¼Y³s²{\É§c_åÒ!geR¸Þè¦X'Ñ¨Ú8*¤3BUò×°gÉLê«DÉ¹ü4ÄÑÏe<dc¼«H\r}µüL>§¤³mÕ_ëEº¸/ðà6áààô¬M»Ü»G¬M»¨FÅ¹]°8;@8µ(¼-æOð¶&cû¢eË£ÈÞüÍ=MÙÿjQ³§»BãçnÇcÊä-Äk¼D&4/AÔF4/(NÚ-È4}£ÁaÓpx¯}Éë9ýhÄ=M+¸ß]	ö·wó6âW5¼yfwKñþÏÆí$L¢ZËöÖß¿ªÍÍ¬:sIâÏG¹þÌ_Ï£HKWüDC­æÛÿÐÚ-¡y´s<­ÚóG©üU~ã	÷°d±µ<{_mjË¼]Zó[»¸|«ue"të>ôAOQ.tßI´6«ÒZd?ªõo7BYdêæïè\ÐèÓ»JL!À=Mq¶Ác5Õ8¯2ãf+ùrFdh-"<ñ¥#¨lï¢Æ\ö (¢ò)ù&
:CÖ fêí;vù¸¿¢þüýxÄÍ¨o0NUÁë³2=}¹wÃ¦qJW6T[0ºëÝ¾T×Á¤!?4ÚËoh^àë½âYýû¤ºd@´k"ÐÍé¥OZÊ{8[r7R1¬lÆ&$ìê)¼iCÁ¿Ðt-w~ÚüO÷\YiXµ&/ZcÀ=M_%¾±KÕ~nwÿhÙh¼¤¯tÏÙ¢6<ÕÜ¦ÄÏ,ÍÝ!¼äöêÂx¤ØDÎÔ]SúÞ2ÉÔÓ«@Õß,6-Ú%Ç©¿úßA¤ÇüË×D-=M{r÷èÇòÏå$$hÒ]Ì
Å*BùÛ4°^òUÏ
òª	9?+:ýú?ËIÿ¿¨Î;-|îKF%[ë©g»ð8ºaÂVxVóµ£ØIÝV­ß¸oRììâáPÖ|M»ÜfL»M¹G»<M»U×Ðßá[ãAðÖ!c¸Ñ@ï¡Lèïî¥PÆÆ¤í#Ä½P=Mþ¡¸¬ñ4üi¹f1ÿe{¡HVÏùc4Çø¬}å_!p7b"åèqÚ4øåXEiÀj Vº¥WýkÔQQÂ¦aÁ;RY¢sxù	3tåhÌ~&»= ÉLÜ}ÔÇ(>s	Px%ÔL®|£Ü¼Ì~+´ÉY¸m{/VÒ\ÎIÀ¬±e8è"Añ;÷YDéÂ+¹sôG}E¼|ó60qâï³u¤=}>¥®ù7zMKØÛP=MK·ñ¼nÞËyaÓÛ2iÐl-Ô;L&ÍÆöþ¸j+Û6äLCfò|.¥ôéB*øÊ	iÖû	~Î¼nÐî6ÅÌ °Q»%p¤NìåÖðxgMn[ùÓBÿ+WÌ§"ÔàeçXÃYp¢og\ø»ù'ÈbS 1Ìn±TÍJK/ÐZ¸)\.ÎRj)ÿ.YÔìÇ~Å#§9TB®±JYþÇ÷¹Wqùw0H¤ÝÈ«88=}AÚ4þ¦ Ù²¨Ô*v
c»U.¨½ÔÂ-â·¿<ÈG
Oö\giFWÙÒþÝ'Ï3Ôá'Ä#Ñ#Ûâs§\¢ló/É>Ùlùb¯1^®v¨÷UX©37T($Êí¾TÀê¾Ý¿Çévÿ¸ÒÙÑ°Êó%óÙÅn­QrÙ",Ê÷dV_ÅÙoTr¥º$vâR|Ø§¥&ôÅ)*uG»þå^	ÐLyÂvjö3BòwuPl(a&§5pè7A¸ö5½5fhaú§&ÃÕ1}Å=MÊ$¾²À+¦ßJR<s;°Ð²G,iõ±Ábî[Uð^«¨*=}F>¶Ã8þ6ÛÕùóoÖ&ã¶Yø°¯pø3#â¥l(4G2mIF¦=MóÜÒ-^ºtuÑl»M¦8_vMÇjgëð Kk©úIe½÷ôp]FmALø5@£­Ä¹RÛ= ýbAV$i»CÞ³þî@ q4',UÂó¢®4QFÂ÷Â@²Í¢Û÷OTÅ«Ìª½¨Æ®ÂW4¯ZµãÕ~oÑH÷®¡>h[ÓÒÏØËÃcßê?Ú<\°ï;v­Ú¦ïO||Ü}æ¿é÷ÛaÆïèÜÄÒ/Äfß¢*Ö÷Qã_ÐÑ÷[^ÓÏÕÿ6ß¡Û¹?VÝÒÁ¬JßQÍËÝy\à¡²à$ãy;ø¨«!¬íÂ§Ù@fGåSd¤ðÖìt§¢ð.ìØPQÁüø¡xè¦ÍoDT4â[xöñ¥¦½±<ík&OGìI¬¾ñ«»À8ÒÂüô'tD'ãÃ	r(ÀC âÓò©Ð/$7iÓÞ)õ/F_µpÕe2)Þw*þIÝ+#(}UÞÉ(kG@Ì!XãYq%X öÓ1í¬+g'!´(ÅÒwÍYdÄ[GáÙ¨Ì
 = ëYú1¨Ò%´'öÁxo±¥ü0¢¼¸òZïvrý7ª£E¸t^|×)Å>a,*å÷/6RÍ_Â\&õ7®6SzÇKØp3cº¥:¬ÓJÑ<'(!ý97ËIGt,ãS*ûÀ&G«ûYVéª¼Îó5½,¹öæ·ÃA;ú:Õm'-MM§}ÿ¯hKËÈE=Mý}ìY³eHW÷³¿U{õÿZ8»¿£Ú/ý¸§ª]ü¼¯¹^ôæíðÏsúÐÿ#Äà6gâ= ±Ì6»·~»VþM­ÍM»¶¯¯ìLPÂÒFÌN®Lu3¸Ä¬O;}QÕP¼e¶F÷°ÂÉªeõÃ=}y£u³>NÄ¼ø¡mÕ½PÕQ'V^K:½ÏÃ!j¦ã«ï¦Yµ·sÍú//Ò¤¹Á)÷y:ª[a£ëiòs	QXsÊÇ#p¶gGs\±Æ£ê??¶Ø²ArÙMÖÑCeºo!óÝ¨NÕÃd­
_Ø³£î>ÍXH'=}+¥àYàãzâài; ß(âY6ÿhJ3 ¿ëô ø > = ·â^éBÉ º6çQÜYðÇ
cx«c¹Ñxå\dk#ÿ¢b0¶ÔíE 0òNelî¢XlAe3Þí§Z|%ÑñX^úaÅ×è^þ¡Îh(>¹)Þòî$Bö$Ñjï$Ok²z(%Wû9	z.tµ¦PADì­Ch[ò£|r8Òç¤]^Bùrõ§ÎQ$-mÃÓQ\óÿ¯zoÃÑ+Wî§Óag¦ä/)a~iìt2:w¨miÜØqrÒí," isª,Æ»®©<Þy³©To*Á[ê-A·ÎôîÙ7~ªÚ4Þ<wª= Ç4tQ_ú_¬-Ú:úntTìÕTRo³òt¡á=}æ!óðO©Ó{ìf7ENP£öD²Á&I9Ø^q%ËO9l|%l {ÙzL*zy{ ÷¹T­A1¿üN®¬ÜBî¥Qè¿¯Æ»<ýØXÄQ|^ý~gZQþNÆ
=M·Å³Ïw\ÖÏ¯¥= â^þ3 ÅåÎöpÕýêÙÛ"Úÿ°hS¦m	@Yñ3ÎôÑx×ÆkøÏòr$DíQAé~·*q0ª?ÏwBÚtÛ»+[3ª{ZÕ	C»´â/uè	|ÚRú6vÈNÆÔêÂÀ¸×õ´5ðÎ2©OõuØ×·´*6~ÄjøEõ%C=}2%ºÕ
¼ò¹CE2û¹ÐúA.[Æ^±þ¯ºW¾fßªJ8¸f¹_·ÐÍúØ´r.=Mçç¶²G&=Mï/¶²5à»D øáY°Ûléó"=MÃøõkdDJh:}h­Ã$tñÑÕõñ'¤ØË¥Ä´i8ßjxéGò^ý!(¢¾kòTÁ2vXnr{Ï9	í!úÚìq}£ÝleRtR:Û¨	ß;®7ÛÄÌW1Ð8!XGå1
ÐºÀÌóåßE]Äºä7	Z=})!jáúõ_n4TÖ~0ÑozµJªZÛz!JÎ3ÓAfÏK¶Y§:#¢Eí1:>+æHIÜ'+º>=Më?Û<ý-ÿÉ¸!g³êýwUeÈñhÕ<ÏG®ÿZ¾O³SÛ~>Iæî9ìµùØB~aÆóæÓ´(¯î&*REqf&"-ìõy¸½»$ 
y°¾hsÓ\yeßxÍSÜùMjeIæë·'8è{FGewöäÉ6®zÜª*µT;Ö9	[IÅ»ûgm<&ºhxJLomw/MrÌHÍìÇQÍìO_«æ q ØM»Ö7»:»ø/MOM»M»MS?rA'.ãoûúØøØ¥ æö@.OÄ;U]½&>m²@qam/HB[)óËxø¿«dYit-Ú@PîCËyÿsS|y;­CFBë9*9¾¾¢pþö­ÉheO¬H[Usý6ïTõ«Y¹:¹}«&ÓÚÖæLÄúM£¡¦¸öß }8C}V2n\s}·Í¬ÞMÇC^çÅûfýØ§NP0Ójcß_8{»)ÃZ.îY}tlÉ²©.®WRsk£5=}¬×QÑß÷Ãî(Ö¸% {¥½¼NÁÆÀÆ³8¶9Y±mÇ{d9lÆÁ©#g>þ®ÒKg3WüÞËA)BÙ¼>ïÔ2Cw%ç\^ÈLÿÍëÙÔ±ºËØ@ÿöÚxZ°'©gvÐs= ÿ#}^vÕÓFnyÝÜtÝÉÇ*ÖàJáNUî0+= ¡óãL:ÿÀÔ¹àG>ç¸v¨hÂ!úéÒ¼û$ÿø¿SÃßÎ Oä¹Þ¨¹,®vïUhAqðUCÎêñ½ÿÂÎÍð_dÈw¬êAîîüFÙ°öd¬ÅËA|£<*÷<è=}{$8Ìn/d½³½ø§yèu'q*/tµ°*,hS8tÓ¼¼ùÅØÅÓ¿&Q÷(90@N=Ma|}åæ(âÇCâ©÷ètº	0Ír É·ârh<ª(Þ+byçhh³%¶÷U<ÄÝÝX_÷q>BUQiPiTiÙ$x$ßòG(1Âô×s$ÉlI*¨<¦ 3&t¹8Ä,yñËEüu)\'Àyò	ôRÇ3Ø>9A_ëåµp{¢t1ê)÷X
PË^<Ó%Á4
ÿÒ|*gª3-%n|2_ª£
Û¼_ÒÊ_mgyî÷·x0;Ym>m½m´¯µ8!ÃµAm¬·jj×¿Ø}!Ç5}5UÌ­U9UÚ)ÏçÈ}Ci®Mÿ.ÈÜ_Ûÿ#Åà 'îä°ºM»M»Ø«3»M»M»Æø^éÑÀk­Q"É2ö¸:¡Hku}=MIk:=Mf®8¶B»kmÇ=MFÈÙ±/{[ÑL4Z{åL¼Ò·Ë»DÊ@³¶ù´F¡4{¥+MOÉ]´Ø5{¯/LF\©ö¡A5\gÉý\î«\Íp#>îùÛ¤ýËÐF£v5î=}W¤ÁÀz#zîÃêË2n+o43RÆûÄLwÍ=}e<ìP¹¶¦Lw<OS¹T¸²%w×<Ä«|ÿ¡hþÃY¬,ÍÁÄÐ3´Ã/åoEU*Ò±=Mx]ÐåoßZtË7Z¬¿ÊÙ§n¡ß{þÃZÝÈqÉ§­r 6úi¹]ôÖÉ4¶G7ím]Ò×¿«ÖÉ´­äj]2ÓY¡ï\¿Ôû÷b»Ú4ØÀÀw¯{èjõmr
¼ÔjÁõêTù%«JjÜíô:
V6í	ú¥ jß§Z®0|?(:±QkB®>¥qCj[ÇõN>4¼X¸Õ9Îo^$-l8zÍiÕ3K~D¶T¬5$3lF6õ­zl-í»JT7­¤pF¶,ÿù*³Er´-Ä%z£mzäîHÒ}°)U=}Ð~ÆÚ3-ºz6?ó^Kf|kJýÈiíÇ3ùGa®íÍÓûôMø;©pÁP]#ÕFf3Mìûö×ÜÇøJú£af³£í§úr/Ä{E 0JyÀú#z-fì7×úÆÿIh_¾Çj¹=M£gÛæÝØßª°ÓcÁ¦7#q¿fAd{ñeD±eºQdéeÙ©dýeCùd39edÙe%äe0prPz0aPi@ôë®é1ë²;XNë5tÐQ0XxÀlò6nó,ò/óÂ¬ö²®÷=Mö÷²öB÷LòNóvÎòÚÌóêþê@üõv|ôJ}í¶÷d7d4âXeÌ×cod¯d!eOd²ÿd©e[¿dTdv_e)AÞqF¯= b|AôfC»MM»VR¶M»ÖÎM»¿ÌX¦yÙ}ç:eg8çüA}^U¹Q¶UÂôËÒ³¯î·
¿ê¨zVÕ¥õ¶m7;m·:«O¾¹ÚKÍý¶SÂ¹[ÎÎKÈ¶Áo;¿¶;¯9?®]¹ÚÅ5ÌUËÄ·¿G\ ¼§¶-:O\NÙ+_MÜv>ÇÙÿÈ?ÉÇWKË¶Âþ¶x>¶¯]÷Û97ïÖûD¥ìî¾øN}²*øEíüC½®ªûOíxH=}¹º¥ZUú]/y¶SÝÇ§\VáÆBËÆ¶E6«RËÙu¶56»JËq¶U6²ZËtm¶ë{x]O^U¶VËý¶Gå§*ìjâf ¸´¬|cj(j¹¶t8«Q¶;Ñ¶Íé¶éi6	1y92Ó3ò-(¯ê³Zk¹5XgZ¶{GµA4U5aõdëÉÿ]jÃkùd8¼2JM¦ýEÌQSòw68³Q<Q£»56NçÌ;C]=  <8KÕ&N&è·;£peú¿ñlÃû·û©Úê1m{¯ÿe¹à;0mÓ:Ç°ûpmºxáÏ@ð6å=}½ZøAvâõ£äïÀMÜf8f Dá'T:ÇÂjÐZAìÆB=Mâðo´ógW9Àâ<m»Ñà~¢XïÃ[Ünøb±xdùxg8eÕ¸b}è ñcäý9¨!ê1b4êµ%ýú°håHã´îã0Ç¿TÝï¶Ð×*^Þ½ág¿{ Xàèê£àxËL»º]ßWM»M»¹M»MC$OS­â]ßÚÊ×KÕßä«PÍ"[>Ø76Î¨8FPÇEåØÑÙi¾ËØ=MÙcõ¯ØçÓõiöõÇ­Þý§ÏH	ÂEwVÐï$9ÃiéÌ¸³I;¡ÅLNÜ6ÖAÛñ¶ÛxÓhuµBóõ¥¹yÌË;ÆÑ¬mEUØîk(Ö[sî®EÊªõlÙ¾L6ð-rw¦r ¡©´TNÅÞvÀRY¹&×STH»3+9SYÊOËÛVrz±á
ô!}E¹Ëô>Vo4+~0+±ë²J\#mrüÛ*9^rHÈ?R|C$	­ÈÜ@/³õ<(¹cL>Ûr­Æ r2ì)ÃBÈHýýu&!r¹Ô]%áu¼	«= 

û¿ 2X%÷} +ÎëÂ­Zñ\põ§Zqqhûm¼Q+yhÿ©3°wýFW>/w&¶âô}5diqêÆÄC{v~·#MðoÕÆÃ´£% ­2$Í;i±yKR×ædtLfÆÍ¸ZÔüÖ^§¬ôæ© s\Pö;7<¤©7QÎæÚBÎ@Óãf$Ì3d&§wh,YméÙO¡µç·ßñó^!tªÌ:ÓãG_!ÌÓÿ¨ÙÜ£¼*ã,fÁ3¨§«@+äë¸ ]ý"¾À-ótô=}AV¯ýý~p2×aÜçhç WG¶dd¢%â1øö]?ÂñéHJl7=MçÛâÓðEU¥×ìjuøj¦ÈûUHvLd=}RöOcå1¾¹m>o4¼þ$q \)1Ù®ë¯s,ðàæáààð¬M»ÜL»M»M»M»ÖÎð½l£GKE&1²úÑ¯Cy:îy'ó«y¨Î{sÙxåË³°­|n²½y\
~åÇ0¿÷ùaÙ,ùðñ½%Ä?¢r<|÷UX	j«k·¢_=MW·µa9f{0eÊÌ1¹®Û]qºebæÜw«=}ÛxDWào§gÇèÞ	'yP|GG/ÖVG7gÚµë{[iÙwÑªq·QUsqSNSÖîâÏÑ-Ýá¿ÂÐ©ì=}Öì{¡Èn¡ùGÞvëÏÙÕÙ2WXÜ×^G±r$-Ù­­Á_iÏÚ§nßLKñÀD ÇËe1¬¶ñ·k2² f%×ºø±iÑ Imt¡Qb+Gª(~¢ê¹¨Ó£*>0¦Õ~êñO5iÙ&|¶æúhKR	<kiºäÊÐPþ=MëÔÙ³= fkf¼XCd¦ÌìÅ9ù]Æ­$]õ2ïYB£Aë;&¥ºñ°D¯k9nìÈd´+Gf	Ð¡·uxêF-ÓÀº/$XAÏm#ïîãÝ°¿Ì¯ßá|·ìD"<ðá#"Xt¦oA\êb#Ó0ù-rJìcsC9	~m÷ò¸p¨¤ðQõñ­ÆóshW¬F'7îÒgÓ(u­G,FáûvõQÈ3'â*¸l×«	 _0õ43L>£Ë~:ê¶S´ámá-D>OFdCë+§Á9cøkÂ½xF×Pe^|ýG?¿= ÌçÎ9×P°~Ë3æÏÉèþààààj»MÓK¹M»­M»PMûÏ&ÔC´ÞÈø= Q¾àIìDØÁ!ñù¬	o¡8ù¢«Y#Q-ÿªuAHýú®Ö^Ïbr>j§ÅFz¨ûCxvîÁ8´§ÈÔXâ&/AâÒÒóiÕ£N®R3uaq{mµ³Ic3Frs¡¦û×S¸6g-þSÚïå¡\ªf EáëÑhÒÅk1L>l5°ò©E»E­9nQµRÚÛ #Bë¯D®J·@í%ÒKÙPUý¿7KuéûIqÑAÏF.º¢kÒ=M,ë¸ª6uM¤½».ÊFç*V@ÌsïJè]{?b/óP1 ØÔôEÀ¯]\ûïðÆ 
5çÙ÷]èYk£XÝ¢{'YÓøun3´Y|óy8ÉWrÿZðÝZz·®X·9$Ç~Ã?ßÓw|ÇDÌå>$#ÕòW<¦ÒÊõëÒK©o®ÂvË8F¿ Âýî(¶­tWØÓÈGÏAÓ.+ÿNÂ#vÔ]d2ÕþF¦=MÊé~BDÖl½¯ÓËå¢w)Ùjm>*ÐfkË¿QÁäs¿sÔãí=}ÿX;×qç%h+Ûl)¢÷*#BÄÝmH§ÏÝã¯dÿÔs§ñ±¹ÓkaºÖ{ï>qº &kø7k´!|nEòq B=M? %yôÆ+ÃE
­Y|uÁ½9r-E?nõÆR<¯ã+Y²÷Ð»&a«õÙÊ(¢J®
Iu¹=}åÓ õäâ5&Èú/óµna0ýyú¸ÇKÈaº5z¼Z¥Í=MTKTî.Rl³¥4'wzZ¶CÙú]FXË»àÓHã}DPfÎøQªèW¦¼ö! C¢Ñ8úxLiù¥FèWxòC®ÕöÅ:ðÜ¤r6+¥X¦zÑæ¶´=Mwí§$M)(%ÜfýÍ0ßB/Õ0çI 8Ì¨./'>ÍSÝóÿÎS©yëÂH-PEteû½hT£ÃbÝ«½qÞÌa@dKí¦ë·0Ö~ÓF8ycØEt&±o±^,Æ¯¹Z_âX=MpC.a¼ôí¢h%b)ÿð"hNèK"9ûõj¯¾eÑ ü¥Yñ4Ø$ÐÅ4[ªÁ7ô/&sÌò­£L	lA»·8>/l·nçÃ7ð¯­éø.*D|+'r°)¢Ê752Ï}¢d¶2Þï÷wÜ%øÞ÷;ßX½Óï%ßÄLñRÛpIO³ø}e®É\~!¿ÊìÜÅ?v%2,ökþEÃg÷¶¼xk49Ù²Y?z¯¸\Æ	À°h"¬ýê9_hª5kùdG¢òuòìNwY0åqõ(ýÄK]Fú5ÔL&zBÌ<2«½d:Ü?·QP*câËI³ ´AmPNÕ\ó½-øyóTem=MHÊR4°¦j.Cc9eý«UÂk¸Ì¦)Ug=Mù¨ÍñÉEøüàÂàààØ¹M»wÑ¹M¯M»­M»]@Òá{?éXó"Ðñ¶ò¡$t³$ùÜ:tt0ÜFÜßøÁÂì}®Ù×Â')^äAØð©¶er,Ý©x$	FsÂ°ÿ	²©?­9QùREØ1fRlq]½JR,qÃÄ!ÕÅÉ³
¯o3Òl0= êh?5Às·gÒÌ*^*¤/6B©K´uy?ù¿ÿª/1Aßúõv+(u5Yf;úó/C®^Êä¼0ÇæÇ§IÇeæç£?óm?zôEHQ'k %M6I³×!ÈÖ±!ÎîÊþ/°ÖeZxµCþåÚ¸¯2Mãæù°Z¡= .f¬ûM¨µÇf8%úFñR¦¬VªZÈÁÆõóþ{©ô¿×ì+ÃÅú
Ä­Ù>M®¢ÃÆô;;À¬â«ö¸f;ò¸rîÖõ;AT j	¶xìÆÐKÚæ¹p¿æ/a=MNe$Í¹¸nmÝÍpO'7÷¸=}´áAiãªgüXCÎ¨cn^Âh"tóA|x Ë¬ÇúGÊ/Ó§±e%Ã=}ØÀb+;<±²V£»m;N,¦}÷Ó½)÷ÓÀ:yçí§°ÓÄÎø/ÓD9j÷XQ8§{¯ÑÇ­´0ÿvÙ&¶÷{Z?N~×Egÿ]GØ±Ø»o®_üÖÇ-à*CãÝð }T¿éB¦aLþü(ÇaD§çñhôÍ@úÚäß!/#è9ó¢&µ0\#Xt!A$è£$	üP4OfCûü!¦èF$Òr|ûq¼ìjA9ôj"ê9Q3¨ØpH&hFnRìÛBØYæA$¶¤Bñ§z¾Q¤j#ðû¯mÑ¶+@ªäF,@C*×WBJ~$ÇÈÎ_* y×gsyÆx"²ôläh4ÒÕ\
âì÷qp®tÖT¾¼-'x¡­~ìúÕ±þz©¥yªªBÈ¡ZDT:k%R<scÎuüzcRw<m¾Ö«CÒkÂ²Ò±½w¯W»â>-	Àcðº"ö²ñ2¤i%Éô\PÎÏjp3¢Àè½*~7j|<ù²ýEH£|}ÅÌ CRåcäuhµ5ÍZÞñ5\ÎB1S&7Æ[Ã«K8Rf3!(9nÕ£ËÙ2§ÂrZ\®·SæFN<qÁm_I¤ixë-åBMÿÕ;(üµ¢~Ï=Mä4RÖ*=MÁM8OJÃI§1°¡fn_ìz3Xþlesº²´Ò×ÔÝJ»X.M»M|M»½¸}Ñ¼ì¶Õ¢ßãY¡ß·\¢<×óC¦^&ÊÓG¦4_¦Ìª÷.'_A¸7RÂËûA¿Ùmg¿	­Ü®|Â¼ÔöWzäs.(P"6â5_éjº¸.òmÛrÔù(Ò#ri2¼%dôò¾2¬Nv¢Wu×Ï(+/z´I¦«PÛì;¥ExÌ#;ì¥EÙW;v4=}9³D	û'×!F*¨«;n§­RøÞ!¾½ÿØ¡«lÿ$,Ú©ÂÙÝsîMß)µÚ?XÔk>s?ÇÞB½l¿~ÚmØ¿LéÝ-CÏO¼Ý!ÂÅÿ®»ÜA]ÉÿØ+¿ß
Ö£ÅIó¨ÂNÒèÊÅY"ám»ê¤Ë	#asõ({GbôQÏ6$Tòtx@dBò%t¬þEêótqû¢vÝ
4]7¡¼;e'cÝZ5&6 ,u â5ÇQ!m*JÜl5ÃÏèUÖCÓ5}0/U*zµù.ã'ú³  cÚzÌ©OE-jÃ¹*ë«]:,õ·Âgoö¢Í:(M´F¬Mç_¶6$gÇ·Tx#4jîÂóT¹U4wR¤çËB°«ç³Cþ«ËÔx2	×æ½89YÚyM Öëæ|6ÀEáúíé@(ËãìY±Mhñ¢OlÇHd=}mñC7øÓÒ&¦|¨Lé[zðB¢y$ój¦zÒÁ	³D-ÑèÅ&	ÃWzñÒ¡lONFÌJC¸Srþ{CBI®w2Sh:Ëå«U=MxyI¡ÉvlK©%+¦9OõËî:Q0ºj!6ÜÌ¢ÙKê8­½zs­¶¨ÕíÓMLX6A#Èò;$N»NH+Y=MGÆ¸ñR©îU¼3Ì¸©þßóÖüÙC/Vt&^ãîrî<èT ¯APgï¸£qrö'ÑÖeóÛÍ}x=}Ã$«êG2ÎÃAÆl1êë=}pÎ¢÷DïÆ9(<TÅzÚ	,RÞû_½xôËf¸HWþüR''¶}Ä0W¦ïÑÀÄNï4[pÇÇ¡zþï¤¥©ØÀ©öï/´;É¹Ä¥7>ZQ¾k ¾Ì\Âm[
i9Æ£Å[´xÚ 9Ì£1?ÜNØR£ wqY­ÕÃÎ5FKÛqrÁgÂì_.?ÐGfzå	Þ¸/î ÜTà÷ôã8ð ØÑaüëÝW a±a¸oê¢Ð0ðÊR!fçø¥]¡)åCðül0è^bðrg0Íÿ¢hðvÝ?'dÒªôÝ0ÂVd±ßl=M~AOï£VKO£¹Èö®vP¢%ÕUä×}ÐKl@Úf(>h¥rMÕqÈmBÄ¾¹%1>ó¥µµ±nÆ-5±ü;ù#²£ø;¥0<ñ£«Åèh%½vÅ$mÃÎfy§A5ú§©ÑT¾i§¬~SÑì?|= ¯Íä>{aJ±$LOÒ¼q=M%iÔ=M,ÊFòú&),BÇ¢D¿,ºyhbD¬$2pq¢#£ô.ö=}õ±û,,E uåIt?/¯ mlÜ2÷s\}ôcT²Ó³©9ÐoÂËßØ'GÞ&jDË&æìðôDP)swÙCxiU!194¿¨Bb1ö{ëû¹{¹ùEs?x­X±üäRXM|cE1îÙ¬}«9s<ôjSi;t§Y|­#ol¥Ù¬{¯]\|*ÓÉ=}2 q[åHy÷096 _«ê1?(i%BõeÚ!ñçjB@%·ÿõó@=}¬¢ÊB7u0ÑdÃ¶tW-	/+ÅJ=}	qK«¸Òì3gt|n÷ÅV
|SûhY5¡þwê{¸òuS¤òq5ÈBn'õºÍ5¬¾>mÖgJÆX5·9mh8íJ8Æ3c-WíËW¶ÂÞv}^dÔ¶RD7ý©¿Êò0'Q_ý/äÕi·þ4¯øÁæ´×0á»pæïML?Eú©ëKÄÑÐî·¤t¨l&ÖP{ú½,ÆÈöÎÿMÕWë²=M,þ·jÁÑ6¶©Â÷¿ª±éMD~LÃBûiM(.JGÂyVÔt»9y²n§tîÖ}Ë 1cKIý4,ËÄ­e.ÚµÙÙs°´¥ü¸{½ü¶É{kS[¨¶£=MþªS[XwÚßÏÅu!=MÙóÉÍ&ÿÏmæSAÿO%ÛIµ¯Ss^JjÛX= ¢ã<û TàÓ	"b-"bÇæY¨Odä*"bH7¡p¡_"b·³då¶;dåeÇeå¾éënëë½eåÎÉ¢bß(îZèð_»5KÏ]M»´M»M»û/®d%w$yü)Ôr¤Ú)¼|dJ+òÙ±Î+òÔ©|¨y¬w©3FJ½ÏJ§Ó¾pbWê4/Q×ôf-+Aµô®>+Á£ô4Å)2m4Ö(E¼Ô46M/ÅØÕ4þ]/Åo	í#¾ò³¶m²Èm²xÑmµÆTÖÄ-ÇL­TÎÔ,ÇµlTÏ(ÝFÉ8âùâäDÍ ×,áß¿	 ¿-áå_êDñ2#(a:"ÒÕòr3(®}"¿ôòÜ	¤Iñ¯ðÂ//ñÏGhX#¤eûÖÝðÝ³÷x¡¥É	ªìù¤Oh)ÝÆi)¢±òv¶pgdæ³Ü=}bÞd¿ü*yy;*Ê2êTw~Å¡6	K*ÉÝ5*cìEù7ªx³5&£	\;DC©GùmUR<Ä¼GRGE©)¹GË%=MªKôü¯;%å~nê.o7°Eâ«YåÛ¾	H4rv9©R*ê3RGlrÎKt¯9Ò:)f,¥Éj5NÇ(õÉ5l"ß"¥qú'(­ÜÂJ<­µ¬ù¦4­J/´ì,³Ð¥9Aí7ûI(£Úåú¬çìÁ9=M|:6Ç³%?=MgFKÏ¶²ÙvvÃ8=M:Çµfî!ïýõÉx5§}<?T²Éy=}¯}*Z,}Ô4xGÈZ®ÉYÕ6o%AX¼ §æFOagì}ÀYN °(­= qn%mìMBD¦@öú¹V ¨Û&.GQ©AÂúN´Qi-|¿AÚ×3ó[y8Oy5¬ÔÌL±$xi}_GÆu¼¢xeÙ=MTOEÔèëÖÅö>ýÍiÅ?/6*X¨ê9³ ªÈÞßÐ<©[LE­/Vm3MTF£µµ¦±):N@CÙûeõVN¥ÌTMu}i£Íw¹9Q¤.v§V¨ÅVcÕüÏÃ «¡dýîrH×µ¡U}sÜ¹}Ècs&C}Ì9Í$_ª)÷.Vë=}(ã÷Qqkã<dÇH§¥r;ÎÝPA	y«-¯
NvVRSA{OK½8¯ÙÏu{zBï=}bþ&õÕgUãÌyÇÁ¸þïGOYØ££wÓ|ÌÅ ';¦Y9¦«¤3>ÚÐ²8Èx¿'otfNÕÓAo]4Î£Ùµ§µ9ÝÏ¶¶¯q^Æ×3Ét§^¶çÉìpiàëKå¸ }	áMêÜË Ìá¢ {£!jç¹»ècbÌx÷»~ «Næ]ï4ÿÂ]ðµd¸¹dE4h«#|ò¢Ó$ÇÛÍAßï3&xi=}£<xø&,ÁAì4øÁ¢¯bñ|ÕôÈóÎlè½&ø]	¢|×ñ6©Lm$¹=}ª1Öìl]NtUþEÂwÝzFn1,lP«øÉ#C¼=}øCÃøcN§ßf©ðÇVSª§µnV$|Ã+ÂÔøP®?QxòÈS¸8!ÉVéÎo,°Q9bßý.Ì^â¹äß2Pîè@ã0ì}M»VÍBM»M»M»M;ÿ±r:  ·â­&é<>Àþöx_? ²ÿa%K
j4OX¨åîiÜw¨tòi5i$«¶òÃg+L<QN¤Ó»òñ^((s6r©:&Gk_Ä> sFo,Üû«-P¢ºÂêúÎ@­6h=}ÁªeÏôÊ§5©x3ÅF!uÑU5êÖ4Y%EÚæõ®¼Y²z&,úküíz¦ÎnúÁ8mcÜú»ÎKÄÝ.T%59}=MTÒì±ù?Çº}ü·T\´¹þ¿ÀGã!ÛZæk[ú<~BðQc!n³æ¥ùiB²©$³D!ß=}û'xL>LA©j{Sxl.D±%Íö(½»Â£4k#û~Õ¬3ô{ÛÉLFùõº$MC^x-meWß«¹HÿM.¦Su³ÁIÈ°£î9Å0Ã£Ûî²g©=}éõ+HÌÒ+ùÃ<ÃrØ+©°ýµÁ&Yh°êîáGþ4¼ám!g°'¬þüo®5zÓ¢Ào<[B=}ÓXÔ¾CGü1¹\[ùÛÌÀOt/Q×ÙÌÎ³Ð/lXá+çØ^ ÅÊámæûõ°E) ·áýçßð0N¨qLÙpQµ">ï	DÊp§#Ò=}íI×Ü«ð= »ñåM»VÛM»MË¶M»­ý/roA=}iÇ¹4t)TISd¤Öeò÷W*ÑÕ$t8ç=}&jÓ¬³!÷F«L½Ýl,ºyIô~ô18Ip¢½©êÃ#êÅoØ"Æ¤
;SA
wJ´ÊR[*m%
ÇVd=}2é2)þ#+æmëR»ú{JüÉñ_zf6CÄ1m]W¾_µ¨p8.CTÚ7·yº>G¹P}íÓUMëÚ|®¦GÞÉa¯æcëû0íÚæ¹û\ûGPLy¡¤æ5úXKP©l%+z¼,Ú©°§D«DóM©ucUOz¼ßðÌö78EöÉz;ÔÉGQ]%öÝï;|EqÄse÷¯FT6{ÝEL¾V´¯Î4{N{qgL¿9Ð¡FQügåyýwRøITKÂ0#)îI7»Çß£îNìw¤É=}.ôUÉÄÏR+×	÷dVP¾Å´3÷Ñ§Å2Rï§qorµÆÕh¤ÑoËrüÓW§CÙo÷Q]REÑ;ªGÅq¯cþ1§ÛD8Ê3Dw/¸åÿÝyoÝ§§,h¬i ;5!¼¶bwãä'éFgäïæ¼U¡¯ÂcÂà $à$±L»ÍZ¹>{¹M»M»M{ÜB'4aîå÷ô85gp âÕFé¼=}°Ü {;âèmó68 íqé¨{î5fi,~=MROc(¶C¡Mq¹ÿ$®¥pØs6[Aiúµâ#'[iq#¬tx.BÚAiifuÈø5&/3,ªOEyDf×w%Î*y£[E>r©Ú<Æ´Oy¶iõBÆ0x=}&?ãea"yÎê»&ô<Pk"bsê}Ï
<Ùø¥4ù|6Å2!uT55ü5EVËè¾?ºôub4
}l]ÐgªØú»KÌv¦
+C6çm#:®°&Óám/wÖ·øÖ;&}¹Tu´I:'.c/GÈT;óÕ= ®Ð«ËìØÓaa¥À$Qcìfyæ»ùÄûD°U¡®õæ¿WûôOÀøÓµ@3Ls«É,¾öi2¥qLre)z¾	§y¤?HÒG©ÓCOzZCre|´+îk÷6´èMk4ýníHµ©êkUV¿¢ÛDÑ-s4WÓ¸
Oa-¿F(G{Û#Mj¯ùªÆ¬þ{$ÇMÊlÀM¤PªZ>gLÅýªPHÈ8}üzìQH­¡;Á ÏRV¦ gÿü¾%Qz¬E:î÷t+º¯ìwÙM<¤^q?È2K«s¤YÁÉ+jXþs³[¤=MÈ±§Ó&þÕâo}BìÕ°Y;ÎÑNg'3þO[\ÃQÁ§dùÛtÂ6ÑIÚTHÂ³K¤îÓI½<Á³X/y3ÉNÛ\[ÍSÆo¯|äá­æÄ=MôÐB b&ábÿÐC r!áµç¼?ü°Y+ táæ¤_öÂ;$F(Û4Se4ý6¨7=MF«p	#Nmì)$9õZ7¨®3oNe¤XýrÕW(yX-séRøÅNó$©_f«áºN èM»»;»C;ÃM»M»­¾¡¡XE*tÌqA¤¿9ò6)½*ì1Ûv$b7ò_*$¦s	q.Æ^>yEERµq°:e
Ówl,ÆÍ4ùC¬£=M­n¨ÌsÝ,Äy;±ôê3È5Á0ñexuõ
2È¹1AP¢Ç1ê©F	Ä;0Qg"}ÃêmeÖ3eZ?"Ô4ê7)s-Å7ñuûOò¹!rªÅñ
C4=}Ò^kªl£
õeHÿÏ5Þ3ù}0IæméÙÂwµèÑe&kÎú»\môñúÚm=}SB¶3C´Qm£7¶¨Õ)A4ý®xlkÒËLv®Áö½-Go,G¾ø}ATÔõÉDÓÖ®®ÛAOUØÓ¡z´æÍRú¤N!Õfæºù8z¡o~æAcíÞ-È¯ÀÍJcníný¨W¥@Ø#cÛÏìjßèoGR)||µjyÔ¡D%]s+M,«e)qèsÊC-z®I¼Ýösç-úR»ÀësÄ?-%{¸B1æë%e2ö19¿Èµ¾FQg%8%¶Qö[F9?NÑDeW Â»yð½-ko/=Mt/ö7ß94.@m-Ô|ÍjºHÓn-mv£ºüM^×	¬Í{ÐYë6¹Ì¹FSÉp­SOO¹\ZöºL¾ÜYø¿Á"Jg}¹ýÆöVø0¾%=Mg­üUT¸$ÖT ÔÿÃBf#«î_¶¬»Í0Þ£¥+î½Î[É°Ã£·^"wGI<:ÇP4¸/Ywñ=}þQ	³¡EÊRP)ýÆ²J«d	'Æ\>ÅrI{+µc=}®ÔÎÎq«|«^jÁ§¢Tþ3SZìÂAu×H2³PóoÍN©þï'AþXyÍ±Yy÷Ê»ÍÖHW¬Ã§åoiRÓ¸Ô¡¢OoÝ\
Õ¹v¾_y%\w×1JØüIÄs/°½ÇÍóo/!Ã¦ØüÆÓGa/aµÚÔ»ÏË¯¶«ÎÚ¼ZÎÓÔ¯¿Cå+òP=} ¹üáëå¬óð9CÝ= r=MãBWîå¬ê"ááÉgå<úÿTF i¥¾áÁ»âÿè¸^¡Å= »WâÄGá¾çøã~&÷/}*0k@>>!tÂbîõä{KèBòO=Mx½%P/÷Dôb6ãäfêVnó~h0pWuÚF!âÓ×!¸U!¤c°Ý2°Ës ß=MHÓ¡R= â
fâHM»V½L»»M»M»ß¡ØÌbr±äÉÂë¢ð¨ ¸z3p6	!ªb»åzèJõdÉ¸ämÛë"nð¬ 3PAÅ
¡-â;ÐÃPéÎ7äÎêõô]8Ø-ðd9ä©¶ørèéU3ª /©|r4em+*6tü	Y·0òu@àwsìþy*WrD©©²%r%)¦ÎrÔIW*2ÙrË=M)¤'rÛû*Úßt4ìhö)QB$"%ÑtjoùôÓSª÷0!|]¥¾jJ-õ»ºT1ÈÈÀõoç	ún2|~3Pa¼jàFBß%Ü]á¼1¥¶j_wõOæ2Ì[ØÚ!qÑg>è­= Ðz±'ÃJþ±Ü,iv9sw]!-¶Âx9J²´±Li¸*ÓcÆ6W­>y½7gH
o¶}Y#I&=M³Ä?Ù9BwÑ!-Äóz=MÇmJ^¿¶¬\©Ý2SÌÞ­Ãz®AìÏù¥lOHq¬P	mDF£Ê|f8åìkùtDDÈ7£P~I3#{¶fuýãÎfTª°oA¢ £añf·ÃìúÒ­´9HÈ¼TA¦F£}fmÛí»oúV~îÖk¡ÝAÙ=}£¬§fAí¾ûÊ]ôØMh÷ªÒÅ(4«´¸v¶é=M9s;L®DÉq£rÅ^A«¤òöª9>4lI©1¿Ri=}«ÖvQ=}Mp'vE±¯NPoÿG)¥AÅ¿+§vë=MY¶;MéØÏt½OyY¤ÒÒ¿Y+¿vc=MÏ;jxwvÏ×;ÞÄßGIò¦±C.§Ö¸nSéüorRÜ-Ïèwµñ	wR^'dnpü¿ª>4T<Æ0»aC43'6nRÍý©ÕPüvni®±Åð§Ãñn%Cý-Â-W||ÍëüÉw®T¨Unä{ý»JÎéXüPÔÊhVªË|­E§ªËnWüÿäX/ýÓ>BSìÞÄØØ­±ØÃ0è/~ñïZê¥Òlo÷|óYR×´~#ÉÁXªÇÐì­Ã¹? Óh3é/£~AõËX¶ÐÜÃ)°°s*+/«~¾ýcZ¦ÖÔ,u~9¶OïìÎ#c×q~aCãiáÜ´àOF= ¤SMeGÃú¯hí~;¹WXÞÌÖü»ÏùW¸3Ë®I¯S~wEY^¾ÔÜG= |âÈàB 8»M}ºM{)M»M»M»M®©ÎËÞþæèÙ z÷áéÐÙ]= )ãDÚÎÚ?áúÜëÐx@dÐÁd©ñeØ1ed$Qd9Ñexie±©d dIeÛùdR9d-¹eeÙdûåe<%dQ¥edÅdñõ¥yè)KèKëKÊéÏúêyzêM;èk:}ðs0¿ÕðÔöÖÔóþðBpBh0X0Wt°YDbUXz^CnOPPqo¢Þõ¢µÎM}\Û¿lºÔ¾»t D$\|=MÔ´\	ülÏWodX/e»¯e¹dOeÈÿd3<Ó5¨Þ#XÔ+øß7¨ÿ4Yô<ùñ*©ð6ý>Iû)éõ5yû=}©ù+þ'û?Y~0É~$Ù{,ùr2éw&ù}.ip±Õyuð¹t îÅC%>ÅJ^XE]A>E éÅI	T9EYYDQõE'R-9ME+=}³ ²(yµ¤3²4º6¶5>7²T2zV1FV3®×0b×6×Õ= 6uÍÝuÛãÞðß,	"I*ù&y.¹¡S.Ò3tï³t uhuSuÓu4ëuTk}§2ÿ«ß*ÅJ±:ÆZ¯1Ù)Y%-#¹«ÝÎÑlÛÛá´Õñ×P¬Ûü7V~4|6:}5Ò}WF÷u;w|£õ»Àí¯]«K½VWuê×Ý¯#ÅÄGÝ$	Ô,ÙÒ<9Ù2IØºY5ÖSÿt¸tãÃ7²WEÃïÚÅ³OÏÙ7©ô¤þ´Hü¼Øö¢øõª(ô¦8÷¶ô¾õ¡ù©÷¹HõµXó­Èü£Øø³Èö»Øð§Èø¯Xñ¿Hz°q¨x¤x´¨q¼8|¢hvª´¦«&T¦®Ô&rl¦,¦³¬&©¦rL&ü&c|¦¶<&&Ó¦n\&dâ^?°8=}¨ØißB,Êjù)+ø=M+ú+ù+ûù«úÍ«ùªû/
øiùûÃøgú¿ùÉJøÕJúKù»KûoËXZ&ÎÚ&£æ¦ÀfOÄ¹û[¾¾yKzû:X¦v&umQ}ÇHÏÜøù&f&®N&¡Î&Ñþ&y~&e>&¾&ÅÚ^&= GòúY­¨²¿( h°]íbì¾Û¤´yìS£ml~}­¸H­øÜ8×ÌÃ¬C­XC´äµ$_D|L\ÕQFjËú]É®HfÑ¡§ay¦Ø9>OÇ}C\ÑO\~[~O¤:@¼ÒOS8D8ÌÌÞLïaUáàæ·M»M»M»M»½¦|£¯ÿë÷[¤ÏÕswÙÜRvXï}7Ú5]Ó¾F| ú×gåKÍ¡m«·Ki¦q½ÈÛ{¬u9{Í«öÃ$S|L{Û*³ÍÖZg©³T¾E¨+¨§°\¿G¼=MYóeT©÷I-^+/]ÒÚÄÑ¤Â)Y4*ÒNÒÿW_R"Ë*±sÞ38\p\¡D±enYá®ù{OÔ¬Y+cëº3j<´r4¿e®ý#é}ÓFÂ=}µRÓaÊzÇ]YÅu¯»hY³ÄU°éÚMCÐÇýÍ(kÎ£5²JgP{l×m¥M²ËçSuÄ:Éþ|Få»Ù6=}iÙ{^Z Ù7'=}oEk~çÙ.3=}jQ<Â?MUUFPs8úË:¬ÄæßIqÜªàVñ(:ÍUÆQm?¸eÉ©Z~ðÓ}[¥àÐløÌ2ÔFíWØ%}{6¬ÀøáØÈÛÔDéÇé©×xÎÀÿiÁ S¦y{\öåù¯ò*MWþÊ²oYÌÇÉÃrgºÔDú;¨^²]ðUÉ¡D¶Rbg$Ðoö=M%'¦d<ÂË¢ßõå*ÚiEÌÂüïéÄX,2swÒcx¬BPd«Æó?J¨ß I©#	³t.ì@9¦FÖSzËÂýA\ß}8	,9³= 6Tï#ù§Æ|ÕLG§§ÎÒd·\lT½¿Ñë_ósØù¨&Nê2l²4
'Cz³fîTç]ø ð&fÑ,Fúy«âöluAýû¹¢V{]üÀð'.TQ×à½¶úçàÜýru)ÇJ*ÆÒÚÛ{ÍL»9ìÅ»+»RFû¡Û¿Yï¿ß|¿nGcÀøá.b³Àï= +ÀÚ5ZàûéNa»ÀîëÎaÛÀáXØ5û[Û'îpã~\ÔôÛÈÙ'ZÙ±Þª{Ý®?Xßw
Üßçq÷ÄãÙaâ!áÀì<= PãÎ ã§ÃÅ®kõ²Kh²póò%&ÃòåÈ²¥ÉnÉuÇT}m!T#$Èa3¢È²kz³l=}ÉFÝf°±ëÈ®	oiÎE|'çATòºÄw,;[E²Ë£¯²Ì gnnwI¯u,'JFØøOMevÁ¦ä÷}è³NøcGVÈª±ìAB'%s=M¬¸ë&F2·Y,Ã_6}z»)¬Eß,ÆHµ,5_³"~£,ÍCûü3/×¹9Õ¹»£LhýZøÍ5AL2­¹=}¹=}7ç{$¾iÌÀí&VomHbE
OF³¶|ì6ÆTvÍX¯¢Ú¸5D¼õ*®+­EÚYSüÑìÂ\CN ¹0Niù×ë÷SRäwBlÁf&ù{jY<*õ|ÞÅN´Î½ì._ÀìG<EÁ>ìQPI¥EIr_¹/­ÇSXÑ}ëJÙÆ·âÙÓÍO|ûªvÃ#TÁÛü¬ªÿ¡×Éý£'Òõ­ÅuOvÓïNÂ1ÜØì^±ÜeNöÞVç_Çé´Jô¼e&çdÍömAM$kecý#e½{é1èucåy<3=M&x?¹l97Èr<xM¸é½Gè®Ú"PIkÐ F÷\n1B>_ø84=M~ÁöºñWnèô§"BáMx>yX3¶%üOphr¢¥¥B¤#RXI¢<[®RÑ\-Â3iÂ6%føNöÓkM73ÈX>Jß e¼[YiqúÔZ Êë.×Ô¾}=}JGO¬ A&ºCo&¯ùpÑ<4×R4¢D~wh´'³1q³¤âB:º±jê ÖPÒ¢¦ú¼´ðWj Csþ»¶¥§V¦É!Ø¸ PúkËí¬<\08n»hM½òQ	ýÏnmÃ1
^½n»õÄº,õqYqdrúÛRàÉ7ûq
£Õ¤°	yVþîõÊdsék)Tad#:
wó§mÄe_QJu.Úµ-ºösó9o)û~r&p^
É¿Ë¥Örä{ÂiwÊÙu÷}iç*3Á²p1±re!|'ZY^y´OÊ&©Ë¥þIOôÂ^:
RÎf$Ïû¼-53É
N=Mzæõ­fåÈ<öU½DZ}¯Ã·» Ã ß>þx2ôµü4áÿ"í!!0hÚFz¼YA8ÒÝ0ôôã¥_¿ëXãÿ°öÎåöáo©ô5I5µ=}ÎØ¢®ïÜ^ÁËÝ¿z#ÎÌÓÝQ´7S§,3õc÷`});

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
    wasmMemory = wasmExports["l"];
    updateMemoryViews();
    // No ATPRERUNS hooks
    initRuntime(wasmExports);
    ready();
  });

  // end include: postamble_minimal.js
  // include: src/ogg-vorbis/src/emscripten-post.js
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
      this._totalSamplesDecoded = 0;
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

      this._totalSamplesDecoded += decoded.samplesDecoded;

      // in cases where BigInt isn't supported, don't do any absoluteGranulePosition logic (i.e. old iOS versions)
      const oggPage = oggPages[oggPages.length - 1];
      if (oggPage && oggPage[isLastPage]) {
        // trim any extra samples that are decoded beyond the absoluteGranulePosition, relative to where we started in the stream
        const samplesToTrim = this._totalSamplesDecoded - oggPage[totalSamples];

        if (samplesToTrim > 0) {
          for (let i = 0; i < decoded.channelData.length; i++)
            decoded.channelData[i] = decoded.channelData[i].subarray(
              0,
              decoded.samplesDecoded - samplesToTrim,
            );

          decoded.samplesDecoded -= samplesToTrim;
          this._totalSamplesDecoded -= samplesToTrim;
        }
      }

      return decoded;
    }

    async decode(vorbisData) {
      return this.decodeOggPages([...this._codecParser.parseChunk(vorbisData)]);
    }

    async flush() {
      const decoded = await this.decodeOggPages([...this._codecParser.flush()]);

      await this.reset();
      return decoded;
    }

    async decodeFile(vorbisData) {
      const decoded = await this.decodeOggPages([
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
