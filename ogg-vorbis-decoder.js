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
  const vorbisComments = vorbis + "Comments";
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
  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode012091253f87dì%nä= 4& ¿nÝØäÂLÚªã9ÚØ[äº\ ¼¡³R=}L]Èÿ2 ÿù¶J1jj¡é,zäV|i¸Qk¹= 
¨¨%ýv²±»oúâLa:ê±ÊäÌÓ.÷Øý×>àW>z¯°8¯ñ\Ñós9\§ôÊ@Ü (tÃø4° ¢7fqÓg²Jè6x[zç®&4=} p.(°tÍÞã¾>÷CõË"*k?¿~7~H2ÛÜâ.ÏQä;6{ÜãFÑá'DD¤±°HQ>MínÎÏÎöÊµÑÓÞÌP¼P¨Þ* X²E=MÂ¦qíxMÃ±=MÌë4/<gNO/¢	¢>a~Ï®ììììì0ìaç¬¡çëOÓÇM	Q9tùµyuéµµÞÏ/±Óõò}E{òÓJ¹Û|·ôfÒ c¬WêaûÿlÊ½p¹|)ÖEL¦	}ypÕSÏ¹I]¢ºãæ°ÿo¶7ÛRq¾ÔÅEßØ]æËwÚ{óçVwó1¾E­Øpàe"Æùû¡Áª Ààð´LõÎxEÓ¢N¦9ëùi&	Ò§Ø!ÇFçS=MbäO?ß·ç¸ª7ùa}5ðûÕtsUþ£KïgN¾)ø§\V0uSIö:ÌU4Ð¶¯´Õn9ÔèE£ZÆ¼{hµmÙ¾6ÆÑ+xñ´«þ¸=Mß¤·å®«ïÆGFÝì|H?ä E"þ!9«Æïpæ'][¯ù·£W÷O§&#ax$qf=}ø ô bÏ×W÷LôoÝWQÕÓ)u÷½èV|¥Gà¨Ö¸@ê|ÇK5ò	A·Â9CS2¸¼¿,äÝÑÝy!ÑR%ÆÝÎ0Âv§ qTcó±hØÉã=}Z=}Ælü­ën¯ð(-°ÜwVÏï.th¥í­S~SÏ»ZZÔZ 
3BÌÛ¬<éæO)ÎyÚ¯O*®uìÛ$öI¥Ý9ôø³\¤ò³Ù¹ÇP¸J×y@ÔyOÇmô½ü¾|S?2àú¤F?½ûoo3ô;<àáûÜ8ì²7ïë¨RäY¹|ÓºÌF,Ð-¸*\P!FJÒ8= o6HwLrúº¶ÐÛ\Ù¬o¢9IqÝ.ôf¶ÎÈ{Äª×N|Mfs¤ÉÝàâ§*+ã§­ô¯î¬7ç×§ä)!Z¨É,Äp~ý·wsSGóäsE\ýïé§Ö:Ò'Cç(_X$\¦½eÒ8$ XF|eíÙÓ¡¤Û<ØÞÛ¸9¿ðÃÎ#b~× 4éîÿÏq
 ód|0wU&®è·vh6¨{ÚçÚ18Ó(ÓY\0¦= çèíß)Ø=}[xü-v?N(Kkg 0}âÚ´ð¬ÕQNÍ¢usÑ³=}.	ëgû= ÍMBp'²¨ x4è@9t§eÝµ¾âð½ z?Z¹FH'Ì¯¿<K,üµ<{	¶JãývåàÆeù0Ð"F¥ÃÒÞþÔÉvCzl}ðN£	Í^P%²¸FX»WÎêô¶äÉJ^g×SÃã.Ät*'ªG«ÒB<ÜÓ¿ºp­\àuV¯£ÅÝ½áÞ ùß=}ÎÚ^ÿí>¥! ¨ â=M·?*/¤"å)â·ÿîÿî*(%*2[½"üríÔ4l½»a}¯CwpCÓèìGc-ã6®=M32k?Êg­!So-x>³G+ã@ò, ÁïáåN0þÙè.~È÷¡vTr¶­Ã[üB±º»ávëw¹{pÜºû"Aæ±9Æ^¹³òïRIAy5GÂwÉf4@Tù|qý7ðªwBL|Ôqv!ª°|]KiÐJVQ5¸åõ§å"H¼0e¬<óBîÚSÏUìHPÙA+çÉ'seÌNf°@ÈM,ð½egÖ¬x©û½2~«Ò1;Ö«¯°4&90èE»Ó×ºçÊ§J<Æ¿&~Nu¼ãÙµ¢.UÇä(qQô^ö·%!É
w¬= Îôª«Ù×ªJIS;õa rx×£.6¤°>5²Åà,õ°°h6ûUp©²v#}%é= R¢hõ@ëQiJÙ\Ûp»©[vsiÙLE UG*sGÄ%V­¸§;º_]cØp#¡:oZ{ãS5I¥]ÓaÎg+n×ýÿTxy]²ö°k¦kêju¼xÐTá©#h>Ù]u\EA+§í¤u¦üØlQPdëNòzyÞ¼XÐ]ÝøÝg¸BI¿BÕð_Ël¶Cuyºr|<¾¨Támo5êÿú>Æ[ã±G¨²)ü&áòüåBFou!Íí.jÖìß½8¥YëìáÈÁi)qÀ:ÎüÐÖ¤GÍ³ô>°ú¯øâ?R£k~&ÑãÞ~A¢;Ð'àÆUÀ»L­×)-!ÿkýíÙ
§Û\{¤ólW^næzk?G~?_5uÝñ7-ß«6YPðGßÚù\Êê -ûp¥èÓtM ×hKÈ¯ÒBAê"ïx×HÍ0Ôcè+èçÛÅf (§¢õ®%K£7éÞQ'MxãxÐúÑ2!8_6Ì¶Ì6ÌrûùS¥ZóAIüå6¿jÿ_°(ÿä9©CCÄ!bq5Öô×x{ÍbÆÚmÒ@«µ××~ÒD;*ü ùeÀÞ·xv¾;¤7¾[W\ýüb@'qãµÙâÉE¾}}tq-g=}Üs¢5Ó=}$Ä§£Ó~SFÎgÑnN>1§/¥¸G5àM8#Ò;2¢/K%xVÓ(XH>µ¬ü;_j~Æw<¾ô*»ô= fAËbM¼iÀIIp'c*:oY¡VÖ3ûIdû®4ÚûýÆð}ûN¥ûI
¥ÎÛK*]Ø=M>t×ý³MwEè®"Û4­]]ÓgØ×EÈ.pN°¡»¤ç/I.ÿ+6r@«Âz@§Bz@¯ÂIê-tíÜ«°·GföjÏÕì:gÕUÖ=}÷¦|§EõÌ$a*¸s¬´«£¯JÞàãËt$ GSÚ³Ë1¯©&|±c!\åvçÏ·Ñ¸ãßÃ±]á¸?ùää%6´= #e¬Â;IÚ¡õckCÀò*\ï0À¿<>ªÈåJA'ï´¾ME.@OüÐ0ex÷#2ÒùúµÇ½>o{«ó= Ôï;Ç½¶óÐ/ÔÍÜ¤±¢Êw>ÃâÐ¡¯®Üa£¹6Vý váÂhôàÍ8D!Æ!ÆI;¢áÜ!oÑÙ OÏKôò=}w <0rT= 5J_±3×Ì;ôYÐ<aÞê¹¾7ßz\Ë¼ÛÛ@>Â{å%K¯º'ÊmÚòÁjRÒ×úw@'(	=}­QU«ÐÁÑ,/?úYEyºQì¬ {ÇLÕæõNáð#f>_ò#Îv] /øÏ¾TUà/øÀA Ô'w]Ã]Ww]Ã] X­÷Þnð·TbAåÉ	r¨4?t²>1Ç[áüx $-ÒÂMÄ§·µwsú>üÂ&³÷.dgA¦h²*G×	öcG×µF5¸Êqª$ñ?¦vÿ<ã;ÿs­ÒiÇXòku®vUòõcuæÊ¦á«þ¸Í
ÑÊuã E"þ!6Ø Êæ­}}onË:W½¶«ÊFuÃÝUS-1ÀÕHòzµö?ov»®¦
CyÈçaÆ
pÛ¢&{µ¨«±1EXÆÂu.7÷²ÛJÊÂy[å²µ»bL?·×øèìCp:æÕé§·rUèésÜ[o²ÛòDòDÞ]ªä#çN;Ïð)â´ *z80Úèóª1çE¯´Rì,D4H(øË)gp=Mý«û»=Mþt8º-HxH}Æ3Rt?ïÉ¤C
§ßìéõmõ,;æðk=M6Ð¦uSÝ^è´®Ù6=}æóO«>
yÒîÐ7a'ûLUöø>ò  -6Y(¬ÀMZ¾ZHpu°c«à±[t*Ç*jwÇÍ$Áíqx©SwÑËR¥é®[XJÓ8=}üµnt9ÚÏ3z½¼¢[Q2Þ¸/=MP§Y&y=}ÚÛwëý¡àß¥Û§ÃþòýÁÝÈìûê(±¹4'ïÌ:Ûùk=}eªãä	ÒCKA¤Æy×nvÈ§mÿ;=M]¿ÕÕjÔª	sF>úÔ©áÄ:cÀÆ<$|ê'!×Sb¢V¿oÇåGð¢UÊ	u¤ZJýæÔÿÿ	2çì¯h£f¾QZãÁ	®	ì­Ç'ÎÅ[¸¨{?¢ÉhS5oU½c¢ÈÂÜ»JZmUí\áùµV6Bète~Ãw÷0Õà®ísÆk,{ý¦ûiK+xvÅåºñ	a[Sé»Û	Nõòý¬ßà¨= 7på^ÿÃW,¿*M½áR±Ì³FcË<üiÏ2|ö^vKÏHò¹uYbk¿mZ¡O^ÿç©~ïj°È7	l©¨ç_ó¼'½ßªåÏn\ O,wòi,Åª-¿?ð­}òÁá=MÍ®ÿÂ²EÍñÂ}¨³ô-ýÆ³úù56MÃ6ÓJz=}p³ûê9õàå«TM×Ve>G~Ù»Vü²öHByf<õ©+QWF+.ßAGÔ¦ÏèÚ½3âÏYÀ¿T¢¸6ÌéÉÐ*¸ÖªÏrÍëá=}6/U´Ã×ZþðóW.½ÞQ¼¾ÆqÅ½oâäB-ÓUJ¬má8øªK.y±>.Q¡a0Þ#!,¥BÞ¼­S?Ìr^¿_Ö.¹ó{=}/äÈAt}ÆèÌ¼4¡Ôîgl]ÌUEý{}|DÏä:°-Ñÿ°=}àØ éÕ}Êñøðº~¹¯4Yqm¹]!ºÿ=Mõ« :Nl"SÇps¸GåÈ§á+'M¿ÓîÁ.î¤=}mÅ8)¶rrHá"ÈøÂìËøÍí4ô72bbßºq¿2ô=}A5.YV¬ÑÚã«Þ[F
)ºhXûÇÓ>È?p¤ðoUÊÓ(³FpÊi¡Ð}SÚ~E !|ðí,Ç9½Ãë¸Üì!¤ÓÃX%DBãu&dÔËôg¥á¾l¿AÉ)Á±ÑßÈßý¹ód;|Â¤Z»#ñscµ|¡ÝOOe^ãÂxÝÍ]¯òbÏ£÷ð4½ïÖ³;û/ºsñÆðFØIn²q¢©*× kdO+Ã·åÒiÉÝ±îBr]LÜ|8~7vts÷9l|aë»EânÓ´GGò$ÍR,<e0i¿ª
±¾àsÓZJ¨?&%Æ~-Çµªö±;ól"=MLgÿt#
ü2 <Àn¬ÉäÍôÿ®É1SÄà= ôñZ¥-@z;¯üà¹ìJÍ=}ÊSe BÞ¯´~¢smÿ-¨CozÀ/;Çël&uñZÖPV«¤¼´ÀïYÒ~=}DrâgC	§ýçrÆ7âÃ$ÿ¤Ý~ÞÝo@°³Ùs;ozûÀ~R§ú"¶ü/ôcæ<°^Ôã/éow×ër¦_UgûÀøäâkHÈ{&ÏMëqÀYÈLÁÊGbÙé:·q]ä\PÔëÒ¤a£1è]á^Y[Sw¶å²¹gÒ0ód^ÈT.WÄÜ[ÕÙ*Hi®z¹µu}ýuý}#ú=}ÇÌRSûçMø=}¹¹>±ÿì¨áØ[R?ÿ^¦ñê¾xZRS^PSSSç1ù}ÝZá4fffdf¨ÕËw&eÜ$hä'{»Moöyg8¹ê¶@ìÛª0-ó¯:¹ e{%<ÎÖ}Þ¤vª6¡Àõ÷Gh8= FºKVñ.ºHÅ)<Ñ= xs¥BE;;áF¡·!¡-ÀYÔå^Ö'lÌ¯ßûç¥køÞ?[ë>" -9±/ÊÛGÇ	6OY4VÕ»º[öBÿ:B¡WÍ&½ÇÎç»Î= 0yæ§§5àÁFiAÍ²®Ê\¿<î!xÞ³E =M¬U/Ã¾ssæ¶µ·OÌ0§Gûúñò¯{^/~ä×«ÊB= ;4¤þû^Öï÷L÷ï_ñíx<õ;ó5ËÇ~¾V+äl¼Ñ°«Ôí¾)ÂfÅ¼o¼ÖùWa1køìFvûëûRQø]q | ï0gºúîy["FÐþ7^ÒRµÚèæøÔyÚ
«ãi Þ@U¾¸»* è#ò-ì¶HÛé¢ùL;}·O77ÅsLæþý8¿Óùñ£}.= 	<¾=M£ðQKTà^O|¸üggH «0³i£im¼_2ÿöúÕ¨LaO+&]L¤Þ+,k Þ¶Ñ~T¤ÂHì ÊèèÕÀíÒ³MÜô~J<¤0Yð¢´."»âèÄxqe%oÝyåæâ¹25UÐ/Þe.×´Øì_æ¯_zRÏíÑ@ÿôLc¥Íðy@YÎ¦}µZ:ÑÂgZÒÒ(©¢9ß	Y«¦:vÙëÎZJâÀVsOtUÖ Ò¬¹1ûÚG´OÃóG©)niÇí
Ô}½3:.k]ý²ÂB=M~	ùÚYp95½qýãë ÐÞ/¡(ä'§úºE/ê«Ì9ý%Ú!<ÏJP&|[,gzÄ¹±¡\o0Ôhûóþ¶[KêÍð= TjÃVñ¸D¼Ð_Ò
î£¥0Ø_1dPðt  ýtZ¾rù àJf^;Ô2éÐ=}Ã¨¤B~Dñ7ûÓÁ9³ýbA6ZØ´èÃg½ñóø.:~ï ]bªZì¿Ö²2QÄßo¥-¼Öá5uu/u³òD;gjÀêÃÇ|eÁ9¬u$*ÐÁ'ÓDelÀëäì¥Ò¤Zí6OÂ@âF0-J÷¤=}_Õß¬ÒlÚM½Çôó~ð76DEÖ'ds´ÙïÝßøaÊbÑ «^Í}&àØå?¾ÍF\2HD5òèÁÆdËdÈ·6ÙPÑ|¬Ôq*Ê>0¸Cì(ÛXYV²ýIpÑíM	kÖÅ¯}Íóôc7ÅbrñÐeQXæ© Æ¯ü_Û»ÂÝMþ©.ckg fq ôo@qRL°ÅYÎÈ»d'<±+±î,Z­-GG»ø$âGvÇû	µA~YF5"§)ðfßÐé¸oJRRÅ¿ôXÝaú.QMw1 1þøiSo¾®È²¸hÌ/Î })fBr.G1£º×cÎð¥°¹&WÈüAno#g ÃàLi²¥8ó=}dä¥$Å(³0h¢0OjfÀr¡6*#àæ"ãûQ?ñ±«²Xóä*hïx=}ÎÞ¬výÞV÷{u²cöê¡h¯QÏY aêL$¦ûÈçIGßþEýWöºýëÛßý×Ïði G´ì=M¦ßÁý'þºeâNÖ7Ï/Ñu·6rÛF¾¾aUÌÓiÜÃºÒ]¶éUY*= g[ 2-_	c:ðY)
¼9îK¨£8oSå¶K4U>+¯Ãî[H\wâRVê/÷~Ðnm¨s8CÏö©Ø%ÀaªS]ý¼§ r_¸k
ªµfÄéÒQæ2¹Ão¹&3Ç¢ u c5ë6}Í:B£´1uièÑfa&]ävCOx·"³LTè.I.ÊÍzB!:FÏëxS´Q{ÊõZ7Uh8yÝfDÎ	dÔX3QÂ±	½=MnØnÅc"@;f?ª¬nû0Lp´h,¸#Mà->+C= Ê¡±­^Ù= ®Â ¬QôÅùî
öqòbß=}±ÕAË/8RzT³ÃÌ/_îMvÛ«;7S	ìN4
ìo7è_¤ÀÜñÜ©è^U±A{Éö ìXtnÝÇvz
 ½½Ùo¨çaúâ?EHÄ»ë"±cÀÁEB]acgdck
ËÁEvÇÚM:¸2¼"ûc³Ï1mA]ø[à= Ý|«oÒ&¡® ¡K$ÚiPÚÛaº!ÊI#?3ÄLoxJò¹<$$»¢¸h.ÕY¡g Û30× ¶~ÃtéR0 ni6ôeìaz(¸9°Ù=}ocî#üR{¶ù*×<Ç\Èsa>#¿]¤(R F×X#¢¯mVRòºÃ 0ã51ïíDÅVst°YÎ=}ø´·ÇF ØÕÓ¡ð(B
YS= '0#×KB<rÔôþMz8ï³tíY­S\¿©æ s¢3~ÏcÉÜ[öÝ-y£îu(´{©ueØÝª	g×»c*5ì£¡Ð>¢9®ïîêzr{½¢j|W¯Cú²"Æ¼¦Xçt,òYCIVµX#¥_æ)3è "9ûã)e0ß¸ÛÍ¤³.¥>å*ÁpepQkîtÎÚ Å¶ïoÔ¸>³55Î= Á¿rà3S\ÌÒªs0 iæméQúR|ë²­FAè	Áç-ÚýFå3$qÏ3+wØ<üªUþvü£b)Ný¯j;0õ}áª[6k	WÇíH®	¨{2 Jþ!y+(-òÉýÎl  SÆ_¼òu8¼z¸Rîùq_fGHî?{vTgeÒU<S^£(îl=MéáDÛ¶­ùM·Ä7^õÿ
Ø£ $\ öv=M¦px6+ã*àÀìî{ølÊEy9² hÏ³!ÕÑjú¸ò5pG£¸fëp N_::û\RQ[â£®M¿L#8¢ÑPk5]ý«¢zg»güåÐÒöí<ôâ~ÂÔîtýXÙñµE®:¼VBÍ¼çtnHç­|Ï0[óoûM>h}ìAö":Vk=M©l\äÓröQR}8qeV<J"ÈFäíûI_Óã«DûëôzïåJNHeÛpµ×8æÆPI¦û-t£sp£i¼äsç)ç%0eq#ôFør\ÃÁs×CP÷ú½ÿqH²}EéÏtjTi.Òþ¡=M%ä¸ÕÙe½_ëÝ;+ÏÁ9ó+ä·9:×´irxb@åÄä*Ý
²íC­KÝ»@;ö4Päü
cãJ1«õãLPµêYàn12È¯ÙIr+= ¶/gýZ³#³}~å0´ú¾dÈwû{èÒY­uvëNôºô[í&öõ¼[9Ø6
>ßNçRÆÛeíu?ìýhWõM^8<ã*lkê@uú.FzFë=M-ûhêlT±ÏÌÚ®Eã¾d¹P±¨à<ÛÉÊ6åÉìÎ7Qv¬ÎÊýì$ºÑzØ'¨mÐØÒº´ZM°o9=}óÃQ·»¾LW·:+¯©p §àÕ<Ïí2gþá1é9|RówàutHý8ºï@¬^¢W¶©ê	]ð½6ÏOô¼<±GãQ~V§xâ­ü1éUM&CÞÍ|A<^ES¸34
Z!¡ÚÜa7Î0¤q1çÖ'©~É ÙWüã­)¼ðÁê1¡é)&n¬'eÚ!6¹¾P;<dm-T©ÂñPÿoà¿§Úì4¢Î³¬¬iTÑ9ËÀêIqþdiÉNì=MW­H&¨rÅ«q,ì9C6/¤t«ô= ªK5Â#f¿%Î)¦k Aù4jFv7üÃ*-Ð\éÌ:Ä²21 .¨½ü,= åÔ3VI¯¾¸þ¼¥ÂÆÏç^g°(QÿiÕ¬ª|ï
Êáu¹ÎÖ¥UUÁ­YE¸ã²öÌÐm®~wø%þzêÑ5\5oFn$»9³mi6zj1séGd¯ÉØå2(0¬>nE¥âVÇú°ÜéÕî£]þ´Ýs×7ãû<Þë§¶§V"íÙC'aÓX K£¯üYü­úl^~¦¡Rû!=MÜPa´_Cë.0£\}À±QP9woÙæQù§jKõ û@É+gI4wÖü.Û_é4GÆ·#ÛxEh6;L]¥2¥á5üP4ÃµuÅ	>çò-ç»ëé;]÷ÑÑY¶	v Pö%!Ì§8÷PÛ'rö§ÙßÏËí»kæ@æ{¨ËC4¬P¶ óÚÈsåÍý£Îx)ÜØNóÐ3õÜMüB¡Åø×½»#»Ã-á;Ì'Æz{ã­MòÆ0Ð²>v©Ø¯³û#iàBé]á¹F{srPZá:óöCÜ±ÀÃÊõp ^kñþv1_Lç9Î½dØ¶+u¥æÌ·ól~«Ùîû­µÕÔebyÞ«880L²5ìæôvZÉQ¦HV/ïF{8M*Áý¶ºÂØO~ü3|Øx¨>¹çûÖú;ê$hÌz~ç1Hún41eÆOXØ&É¡:h'¢yÓSvðxåÊ:µÆ-Ð)ì_ä;k@%"w¨s
ËØJÂ­V+á~àé4È'QØÇÝøÄ|^	Ç)"¥0Ç¤Ðñ kÂe\ 0¤|>ÿI÷äÒÝýÔ]¶;L	qìÅR¥-bE]ÂrÊý#8n°»ØÑGø,RmâAê_Ãpá%/BU#tÎq>ò*öú(Â$âeò|=M)!Ð'¼¹¼RÐzsÑx
ß+.¼¢7â%²0ÿPàiÝPñ¸MÏå:Lå-ügß=MÅ#MÚ+üfmi®= µ¬³ñ} $¨9<og"Ø[x«Æ¯+_Ð N×æjV¦­¥#Dw$¢ø"ÂK**¨N]EB®°ËßSâ^í%Í(æé¸ÞögÝ¢´Q{Ý»b§Õ× ±±hÙ^6«GàýQÃe]tÉ¡Q¯¡ñâ¸¸a·12À I¼Æ÷nZQ:bùh<c£5yÞ§è~xWÀÛý$õAXÁÓ4KóÝ×¼µ@ßºøz¶Ñ1s7=MÇ5ö¹k±R%×¶Hâð/
+Å»ºDó(=Mj$×JD	ò¡Æÿ¼"@ºqJº&ÏþIÑKÍPçüzDjIö
¼ììoìì¯íì÷;#¶º8l¾k#:âõØ÷¢ ü_WNì¹tjÏuÐÆ>I¿y Hø@u¬BÄÃ5Ûy:LU&ùð£RnÌµ5ZGù<§h¿ËhÙâ²zí¾¸?JàçªIx6ìÚËìV£áø¡h²'ºéÞXQÍÐSÝdÖ8ÙßM9S}À4To0ömeÎ¦\Ü³tQÖç'Ñ"Á©là¿ö&.ÓÚçï±í¥­£ds¿ý= ìZÔOäþr;Z©êÜÔÐó>B:½î-t®«d¶L­Ó¨$QèÔDÏ:!ì Ûq*sª4xã´®X&(\À¾ÊØXA¸¨Åe2PB*S{éÔce YÆB º©¦lÍX;O²:Àd¿fQCnMË-ÂÂðÇ£ï¶¡SÚÁdC,KÂÍõÞ=}=}ß 2y3R¤Ö3=}cÐ'Z®¦}±)\(YàP8?ÈÚÂÔºÇ¶ïiXEßÊè= êèÅDÐ&sÙ¦R÷_{Ù±4Ë2 	ÆzãT!gU¯CÀ@¼û7"ÌfÆúX«à-öRÄ êP$#¹oü³ãq¿«í³= sü§{ÿ«·=}ßÍ q?¡ÏÙ¨½Ãç×å?gÆôÝi,×¾Ö³G¾»= ÙM9jA¿¬R¶Æ'sÖæe4æ+6ªÀUùxGÂ+YbçÅÉM"äéÁZ]&ý¡9å(¡nn¶1Í^¡<ÞÍeæ:WæéÓ#4ÒªzBËÿ:°5G¬ÛÂÒ(âÄGÿö*ë¶.ï\¶l^Iì°ÔüZÖKXSý¨'	M¾b]±>0lùX(^^¼òçHÂSîÃçàó +!mû¤Âp= w¢·nHµÔHÅpÈXw]©5"1ü>
±XZ^Î9â¦gþ=}oäíçY÷Wé[~ÑÍ¾=Mãª¶&$óÅßah
ÂãtÛókÿ^Û7z¶#X@ùrÏ8FG"5ÄÐÄ~áUÒ8Ì­ËÌe3ÎñA´ºÌ=M¸óÆ~2Î,ô®dmÖ=}»u¸Æw:á!@- ¾ *ïr±F¿/Í;öMÅÂ1¨:4>&YÏ= ¬]ÜèÁ/4&øö0aMÞjR»5bãXq=}A%è9= i©¸¡l¥nô@ÃOPz»wÓÝlX
:ÎÛÝ(.TÉ¬|©Î¾²ð¬ðÉçiå_*&F×[	oô8B¦Brþ=M¼-ò»ËÍF?<@üønÍ|ãxÔr6hÚpÌöç#5íl÷.à@]ð{¹ø÷ì<Î<ÂuwNLO"_u7°Ïa ÿ\ÌrîÔdðó¶§Ô67¤p£"ªCËu@ïfcOò¯x¸3	²#lf1}U¬q±ýx¾jõ×»ó±ñ	ÀR³.ÙýåÐéIcÎÿ;F? ÛÝkØýóÎóø6¸'áû=}t8Ô]&ã°¿|%BÆ<þ·ÎÜ«ëÍ>YUÐgæE¡ã(Á
8ÔXÀ­vÏÊ¨¿6bnµ¤GÔÁ¹§\)é«®~î¿w"Þñ£à/o¯ëOïr(ÿ
õOá4¥àyáz¼}·æÌ²ìB#Ùø }JÏìN\]=}Înü4VáaÉlIA	Í<â:^&q/nõ×n5;=}Ù,ìâ­|0Bõ=}l;Á¶®äÓ=}a&¼½óß@ÂU¨¯ÜüHÝØ¯Cþ6ýjÒX_16¿X]~Y~;×*½ÿÊí²2
=MQ ·ämòjyÂbá]ÜÍl#à(Kð5ÅôÄ²ßqE|sª±×ÿe¼SÐo^[ØÞôXYá4ô@1³¢[#ïQ½,CèoJ	9Û«ÐKvnC&Â0 »¼°SäcÑ07 »4NòÚhr/#ÉReÊø?°Oíÿójà!c³hziÕ§nËGY³ÿòò,8ä¹àø¸¡µ¨X[|.ôóv3<÷£Û1²a<>G¦»=Mlf*-¨>9C1TQÂñ¬ì(*ø×d²¬p	?n=}ê{ÕÊd\ø\*·×RéÕR_Y>7Û!èc.¢V;$|òè¯+/UcMX? é9ÀÌéZm&,ôvõÓé¶ZÍ<VÓü°	Ti{êC§)ÐCU·RsV$gÖ¦îÁ ÖPö4fÃÑ>×¤kc1W\åÅ$Çp,%j1âÂ>¦¹Ð¨XþùïäRÜJ¿o{FúÐ¹ÝÚ³ó£ëî¸QE@mj6¹e¢Ñír»{Sg½ÍRâl¦í"C÷Ö]§@¸±ë:Â(íQó9È«Ëîqw±º{i"ÁjêévVÏ¿KÐ÷±ñ´ìp¦o.è<wÕÊ¾­Ø/iºdr2S£ú~&Oãè.¹
x*qT·gÀúÛx¢/Ã}ÜYñ-XlEìøöt¢Ù6À ùG
;%eU	àQ-ðÁÆô+wcq÷æÍ¸S©l¹¾!Û¬O ISüu9=MÊ-	!²;ÅUº¿v¶å±ØÆá¾ @ë]Lke1³,#o¸ òÄéÎ¾$ê¯3eI Nö+ãsQøÙöá9¬Çì<= 	!#\]ôÅvÉplñEÚt^ÍUMA Ï¼ÆüÓú}Sú",Ú}Î>P=M¡nOcùÀÑþQ{¹ËÂM{ppÝ5o;Úþ¨Wå7°S'1Ê= Eºg"¦^H m?P¾ æcà à°!£!f fT(Ø#ö%P!»3àc= ic   ðü3p £"Øä¨3ðE= "(	Íè±Sàçg>W 9Î¼5'¹ñ3!©Ý¬kD«êíSãEèí«òªý+Lo~EhÿÙ%á¸ÞÓ®©ÆPq²@¨Ø@ù£u/§>®\è¹'ÙÞ'ë>Ï°cLX«züèCõ­NÃöq«OëÞk^ÁÞO}a=}¼eaþ²ï.5pf°²/²Ú±Ë=}lZOÁÐÊSy5xLQSSOwø¹¹Aìì¸;ÔZ$O0\6kÃÎrÉÅÆlØ2²_(z¤&ìL¥âð¼[¬ºIPN¬¸/3ö¸4=}s¦Sgù0ÆíÛàÆ¹(â¬Ôÿ²ÍÒÁOøVSä®PþWì»9wx^Ôx<Ô¥KL¹ihx\ÜpÿÕ;<V³¨Ðòõ«çÛ®6¥ÃXF<ÿCà)Ss¼4n9ÁÆ¤%çÊe×X&¼1öÜe¯¢«.iXÉ¾Hù;%wìØJ|ûCàS-(Wú®{®û®Zñ¢0Zå¤Â,Yðu@­lð T*¨%­ëXæ¤%tÑMÌ¾¨ÒsH*sHµ= Í¨_T5t|Ìö¯ö" XöNV£mYöÇzÿqovÕÀþ.V	*z©æJ:ó4pÝH®qû§ÃE¬\Ú®T±*W¯2¦<Û¸àÄaxâPf<§PªQçhÐù*öÑXªìX»$vÐ
X©eL	Ø¤óa³ÝÆõLÕæÔº¬ôô»ÿ4)D=}¯)3ÈÃ¸d;=}ý­ÐNÀ"=}{Ó¬IC¬¼õâh@±óRF¢òZbs9°ö§¦1­³az8ì>+âTªH[Ql|¸ç6¶¥å@i§CË¾LêËGdÔð3Ö¤]äp2ºþW¾d¿µ(H&b3Õ;ë°9Ûeôó®jdúQÂÑTÆûd7.uo{Ø<Züºæ:'!î»Ø­:iÄ4ÓÂÀ,¬ôQÁ]v=}/·tæ5&06,ø$Ê¸t¶ØMõô[ªVÓÆ=}Éæ¨@A¬K¢§«Kä>N¬È]w5øÚ®dC{¼æs	ÿÛ3_ÆOSLMÔkí¦ú¿{¦YæÕ»QÿE­L$1îì4:6Æ=MrZ¾6Ày{øA<(Ål1 dbm7ÎN !¬Ûlî1_= ©néµÂåÅd¹¬Vk.d,4Þ3~LòôÞ1ú¦·½d=}q©7vzaY6én±Æó¯Ã=Mµ\^F>ÞªëàwÞ»ÏÂËþúækéy¡½ãyÝ÷¥³jp'ò°;c9¡Zs&×]Ñ]ÝUî« ­>_<(¬Ov Q×*xuòRN*k;*0ä«¦øÄüÐ©{ÖÔYå!1è;å&ÜÃFUfmü&r3ÄèÄQñb)2ãT#À·ÿ¼%TqËZs>cU´zuÏ	¸ÚuQ=}óÐ-G»ªM(e²ZVê¬½v¸ Í¦OT·S°{@R0MðaÀfÈµÌ_Òú|â<ñ¡îÐ¹AéÜb+!¡O#*¾ï3¨0âO"ÍxÔûÝ
ÃÝ'´Güír-|zþçWæ¯$×[ÙÉJuøAD!>'o0K¸5×=}þ\e8
?»þÆüÜ=M3íúPþræ	M×Öq&@ýÑWnBÓ>7ÜÉTùÜQ¿^®ñ-,å!'9ìsùÃ4?BTu&éçãÃ,?(&ój /¤£Eà'â£= R(/Â¤¼=}Íf÷I³HZépôSGÅQ¦+^@]ñïGXg¶ò¤ssÀ	­/µ¨/6ÊbÏ´%°/³~å¨5|e¦U9¢$BFp´¢cë±²êÒý´f]ð®ÆÆÓÎa.$ªó=}´Y_óì õ Xó¢Ëï|3;-%ÏS)÷ iTlWôáµa6m u¢Þ>q9 'I ±N}ÞC>hïGÒ*Æ·¸PØ¨)Åéø¯Ë¡yèZ?1^B\püõôÞç¹Ã Ôð4ÚIsmQÚÆû¡u°|î(®±Ø¬$©+=M­°8ggÒòCÆKâåþ6Ä¬Ú \Yý°-Ð´XÇÌíÁÚË2ñ=MdÑkhhÉÃd6ñ«Qt»|Z³ÜuÖUhÏ½çØÛ}½SýË}©)Û ÑÛÇwßC ¾ã't¡a.ÍJãpa/	ÁâÿTVÚ´­ý·ñ¬?{«<
M2I©O}³&ÿ¬øu®:º}ëßGnêtF@1«=MÉØ &Õeî%~ïNõI'Oöz:?*<á°TEÅ²{Ï¡xÔ©ä¬É®ò%}Iù$§	= s~;ÀíT/¢¤öìpg ££»¬údl°yçðÖïfÊ¶úÜÃï¸F÷ÌìÊÝ}}yÑ^Ö½Ì~Hí­ÒÈÙ¥¶kmzkk£%&¡ËmsÖ>ÀA}Ô?ºRË%]\:&DÂ¾[,¦Ñ$ÃÐÎìn´cÓ5ÆÑO [}=}áÖ(N¡ñígµâ9c&=}Ä®ÒÎ¾Q,öÔ?è³K'VL¡](ÂVÚCê0ø##{ºÿ3¡6®L(¡mÕ"ÕlÆzÉØÌÝ;Aª¸_ÛÕñXã0î|ò IUÂâwÄ¼Ãú®[,ÊZH«§/nPäõ]eÿõuóuqú´Å³n=}¸@Ö,ñ«À7¸£Å½ïoàõ .® <òò£àzÏq=}þõaé¼ù^Ò\¡Êáä®ù!MGÓ& adePõUáßá=M	tï¸
¿.Ç_ò$U+å¯
w§ÆËp;t'Q$2%$}­¬ ^(f%e_0^ Ò¯°j¸kª2{m4c@U4N-LCæª!3gâùã¾Fm¬EÇtîÏ6Þ¤ äxN8a©Y(O}=}­ÔWñµÖê= W¹5(¹~o»%V´¼ÒJÓ°ú:ÎÅ³§0V÷zî!°¦¡øðÃL!¦]èd< ÛN´= C¤(Æý>ñmÇs=}ïû&NK<ë'»é_È!ôâ[õ³"¸ÐNVìºª6­°Â*v=}7%ÇHßDÌ/2Þ= 5ßK9'ën"?¿lØdmçþ¼S3µ­¡BÁÞø|4ìX6!ôE¢z@ù}ï<|à@T¢#\âCËêéÙdUè®8ÂrãÚ·AÙvq¤A4ÌÈAäv¤ Ä,½ÛVq^ºÞéçÐ3'Á69÷[ÎxÈ»áTyþÎÍe úî<=}ÕØq¿ñ²9y×m²càSÀÌëxé c¢b9¤¡1c7ÈHD À!xÚÁáò-[xÚ¡xÚÁ¥Å;úxÚÁ¥Å;zxÚ¦Â:zÚÁ¥ÇëîAÓûäd¢í"äü;ö'¦&Úlvs¥æ~cQ±¡K¤ÐáXÕnIÆÛ!£à¿N;Ý&T,){lH:_}3 Ãø½óÿ{ÎÝxöD= eËjv)j-KtÚF7ÀÍãÃòeS³1Ð{!ëwH«1¬È¸Øýi¸0mOPüéyMmOXÂh¡º<¡!øÎÀ+ÓÿÀU!4¹nð?4¬²Ôj FØ»ãw;pÃøÐ"ËT'b[[Ý¹?°#O·Õ·O%·¹¾É³ä,}èÚöÝvýÝsÁÝÑ*z¼wôõÆãúÛ³~t±üOá±Ë2¸[
ÁÔ(û6ùé2oeÅê½úLÁVqR ÔI7ÐHh=M*àCY¬Ñ­p#¸ÞYvGà¹8	<co [³KiRGj&õÕu6:ÿ¹C;´ÕÝèÂËjÒOõ*W±[Åk¤íknXâ±vRa¢¯IC¶Ñh}£]ÆãZµ*StÂmÔkøòÖ¾Ö¯w<
­¥ñÍªÊw)*èÑ;fy>6z'ÚsFaãì(¶õêÁöcÔ@ni±c'ëA>QÐ¾ñBù$JCvb9|U3q³Ø 8:Lw(ô¾îMàaSåÁ®bGÎÎ²ÖÍÞ= 
<Ò!¯É."îRUéwºÌÊaq_Ë;e]¼.ã1ØÄ~qØ´¨
©pz½¬ÓsÐü¹Ø:2R%3§ü+ f=}?@Õ,zèz%øíaj*MôÈÍ$w§îyfhEáeD¬
ÿtáÐ¾ÁÚãÃ¨V¦eÖ>I[Bë+V(mÀ®TBã:ê{AÓà½WWºÎ.®yj{µ¶y/5kÙ×¹wð ¾ÒäÄ-¦ pþ*-+i} Ë}}ÈiÅa<ûceÒ¢]ùá¾vÿ¡+øtÂçm=}qI7hyPÄH±ÒlØ¸juOÔ×ûÊ86
%W=MñàÎ{_bØÓçõÓÿ%$|Dì£ZL3F8VãWu";¼×H°×kyPøÑâëp®=M1¿ëAp:U>2{íØíwK1-<êJÜÌùksöK&êB.3_g§%ÄÅBÆ_®Õ¡o8C@Ao= #±®Pïf|§áÓñØ)¿G4¦ÎïVYÿjMa9)õç[\Ã]= QßÃ\pn,ra7©ô35 õH¬mµ[ÁÏ¿¨îÂëqç¸ñïy>°ã¨áP4ú¬Pi;Ò_çÂø^büZ°d!j©^/i¼CpÏ b0üö¬FE´ôU$­iÀâ´v+)ñ×"¢:Ë=M¦.Ur{	å=MÕ
IÝFÆFÄÄãç©Tùýl=}<Azào.ûy2£xá3yhUuj½ù¹c-¦&í-tüßùo¹ÊËElßµÕx¬îfF­eþ|)¬æ«Ô¬æ=}f[8mí ÝÁ¡Þ¼]"dÃ>PÅß?F^ßÁVä¬Õ¾F ¶»,L±>4"=}8º¦ÁØØJ:Ø¹J%ã­JÙ/WuØ©*ã¥<^|M½©­S3<sd#ÖXæ<@ÍÃNÚÿõú^úÑ]þ¦ÀÿÓ³ÜÃBåç¥ð	òS,çT à@ àÖ d"r°¦öFUlëü9Æ[,óÒ=}¦ùîùÆªÌ(@zØ[«+ì=}æýûÔQ9iÅí)X&7­Ø%µ²´Ã_	@´ê>ìÎÝc {À·ÖÇ³C /zïç %ZzßÔ,NØ/Sw,¥¬$µ²*¬^S=}ÆØ ã:iÈ#eEÈ¬Íþ	õ{É;^c÷Ô§ìgÁ°^ºø»´ömìéÆxÿ%3&.·ÉÆ±l·Ó=}-p,Cóó£l[dNÆT¥R³=M¾¹5Ùýb6Ýr¸MéWB$Á/í1ðm¿ÁOñÔXLþ4¾kK½É¢PgsáäÜðSö¤ö9ÍKzotõ= ó}O,LàænÐ6®=M^5;{°fÚ['[Ö^Äýª¯Í´M"&¸´¥øM½&}þýç;ÇÈ¬vyÀÆV= mFyÖpc½o(±Òk.Óv%ÌôpÚvÜ¢®Â5?I].íý¹2RúHåÑ':ô¦	T°éåXñë(xj¬3B¦_×'~H>¶ãðy©'+XÅÜËXùêñ·w¹Ï-	¨	rF}tÐrJlxËã¶&¹Ð?Ðî±lqýànïm.^Î\RðÐÄÉ?ÒÔ]hûîqç¯WH÷CJvÞFñîBÙ®Ô|Z@ä}#Püt'-F:¿&¨8§F"¶Q+à-æU|ÎÍ£ùu+y£¶ý.Ø¢Z\:
-ï*°s .ç$áås¦.
Á89¦cRY4Uh©Ñj|:èÑô½9®MY<¥<ÝX®W·cm#ôU	»UDaI	²ùlZùqä¨RÍ³Î 'SA¹g(ò©bÕÿKáFÒm¸\Å?Ë¼â®E7g6ö3«úå6][éæLÁóöó]ct5Ëig×nò¦Ï	¦r·îêÆr= Ö´"6s´×QÙÇøñúõ^mÄDÏ)ûÈåRªÚFÅágéôIQ¨Ã æKÄ_¥Ì®ð¾=}y4äò-I¿= 9Õß»BrºÈùÁ=}ýôQ÷ÃKì|Õ0ó+öËÔq\@ªÕ§brZ"/O­b Xð iðÝQ53ï Ú>Úm¶= Ô­pî<S  e¨ö}ªJ=MEÖü|£gUáfÙY¤"kï|¯V{ôeøÃ~gøæhKw=}®G>Öâ±þZç7ÛÐ¹_õ'@bS(õzáh)f[9ï¤ ¨mH¦a^,Çxs®35ðúÃàí%*J6ÎdÆ2í<e<KìXãX<X©ö#®
\.«Ï<ÕÅ<SZ.3ç½6.ÃV®YYrtÊtúOêóð?H}ÿ[³´u>µ8[¶iä7Åï^¸iO¯°nØ²HõÒè·KÕ8øºB2RF;*gÚ(sW+ÿÒ(×½1ú9ý4W)¯_+g(¯ZÒe]yóÔAL÷XT«eEí±>ËxqÖ5¾Ü±¼Õt£jÂ¸ö ììYÒM©õþovÐ7¹ù^«Pâ·Òé¸¬Vó±~	jî]pz0%d¯À!Hù2	½n2åÅ²hþ"Ò¬SÄ÷ð¿4sÑyo&Zñå"/ú²oÏ¤òÍ;Hû+-ÊùnÎq1D»2c½þÆÜ	H[lc»¯q¿Û²_±ù%¼²= 
ýNóÈÒÄL¹"³óÈùà#Ú3¤íÁÄ-ï	»5I{ºÙ	CEj×B+Èo)U<ÉÀÇrb-9üÀKzhÿ~-§¼ú­g(½@¢n>ýàm3îýÑâÞGæzæhÞðV§ïT FÂaÐ<^$¯U¦AÐX<)íÚØTTµñR>NsFÛé8*F>1¦ý?]3_ÁùÝv?õÅhØL£9aö"H/ï¥¦!Ì>ï§Ú¥(Ò(kÀI|L¶Á÷ÓðKÑìJLÒ&¦®ÑIí(åz ¢aÑÆù,#L0Þì2ÞÁvÐZ­5/öã Ë-DÖð/o'8¤G=M¬gMî8}
¢ï|é-Bü¡×s]1û©ìû~ÐµC¶/·!ìº§w_àV  DG%Àª"Aî,düª@¸_sQ,æÝ¬¼¼E£9dýcðE@$WcÐfHêCcHB¦ÆP8¦áÉÏ<}mP]H§{Þ
ýc!éb%æ§J= *äÜs= o})ãIj48IQXd©îg´Ø³Â¤	{EJHÑs«ãT§Ý´CE§â®¶_çí<­ÛXfå,ªÈÚîNg3.<fXpá±sÌj{îÑßºuMçî.ïf®ÚF.Ý6®ùÍ<=MúX®ÊëÌjEgÅpÅfÅeÿ¯ÀIóýÆA³¹NH¯
'µ	wÅj;íDCºCDV3EZE=}ËiÌ	O½Ë0iÕ;jÛ<±¶^ùL=MKùK9oÕ	.ÃïøOòÀOUò¬ã¨~â[ñpA^Ü¾¾PÞ°Áßf¸¹C?6lûÓïAx¬PÁaâ)áG¢ð_ªp÷Em3pÈFûnXºcÖÖjÎýHLú¾}^ó¹ÅÎ÷Ën³&ÒB:î­ÅÉ3ùÂQóyv¢¸ùÎ!ËÓ°¥~æ~vÎ_õMxÊä®­¨}º¸õ69ûÂÝ¡Uö»ªÖÓ^%1LÖZ¦-
Ú·%«.Ò+®gùÉG¸¶¡Åüoëø5Öá-vºê~TýÝO^'½R¹ÑI3îÂW
ç¯lWöppäI:CQýU}lSótC÷!=}È^s½2WÁÍð@ÿ.ýéE×Gù<cKñ¤µ#ÉdT¤#¦óG=}ûPªþ:k_G°ÂRí3±¿ölºÌS»l%)µxPÞ.¨SÀÀ+p¯ÅtØY]þÞªÎÏÅ³m¨û¹3Î{qÞÆMmÀEyîÄIG¯ã~ùõ¯Ò¡´pCÃ^*å
fÚãW³åâÍôÑçÚ'¹½-Çú hrN¨ÆÒ[åNz±Ñ§.ÃÏ'êcU	(-÷Xf»ê¯3ï]a:·oòÇ	ÒLÅX¼ÇÉKNrwÂñ©ÈEúÿ*½µÊÞG§»ô6}Ý½jÁwóò« é^ehZQ¯IZ\³Ò×s|ªü¬z+:àÅR¿fWôâÿ±	æ/TGù¥f#C°gAÉNÆ/jÉ pY?ÏDÇ³õ´7ipbrMËGfZ½öl÷Õò'x¡:¾5Ö£üH	 Å=}Æl=}Ûë[aÓÂSuáªÎèJ¦^:xÆ©#Ezrô=}Û*À{oü+f?»^ÒOÒÕá¾£nf$Æ.à#<_(n-æ­ãcpÑH"×-ãÐ>¡÷CÁTö¡ãB}2¯âËÃR,ô[¯å§ºÑèV.õÙQ
ö$¾º¨7±³PGRòLÇ &s¼(KÔÆATÌê»®÷Þ¹(-¸¥UXV*UäzDæÞð[DaÂ¯4­+%/{íU£@ú+Zìaà¬Ù¸ý>îca#Õ»¯37 %Hj~¨Ãªe½Ó8½[LaEÞIZíUdËAþDOcÜÿ,¹Ø"ÞÏà#KñØ*¹ËPòÓy£ý÷
zàù(îÝ¬QHå8÷h3Øæ¹ v¸ÕIQTù<¯ÒìQýé"CõLÑÀEÖmÕb#KVÕ¦ÙUaã&§Ð¬M¶}ÖeÆä.¯SÐ©]6]Õgö'\ï É±C<<qÓê)}½±Sÿ¦Ûø%§3}Ðf÷5ÛâÆ«;²Xv¦¾æ³®Ó3]°Ý÷#{z\âî3÷>bTñ+ÃÜps	¥YëÝQAî;÷[ »½/NÇ¬ÖO,\ñMã7äõ/ÉHóç+Ý ¯zõ C"ð²7 #£#q;¨a"ñÅ\0	³£Ðø[(ÑiaèÊ*bÄ:,ÃSáH2,¡R¼Mã=}RØKcï:9Tæ¥Àþ\$Bc°[$ªê0L92ªÞkc]H4÷o¦H¢
c^B,^«ã0=}¦´po-£·PôÖ·äY7éBç¾=}´¾³ã±<Â"YæÔsàÈ"¹%5t êV%¤x%ütÝ¿J°|À= d³
ýc©Ã´¸DvbÈädE6H±Óq©¬ýj¬_ÅdçËjÌëpb¥ruß2ÓKµøüÄ¤®Ä^<§¾èñm¯ä<®üÅ<Û­X{t[d\-ØîY,ÖèÃYô?GYäYj3Xö~°E¸ÿix¨{6gàs®OYîôÜðÈê¹
Wu%ÊB®â2u¾R®ê*®ÔJ.÷¿<ßX<üÌÈÊðÈùàñÆÚ±h3çÒ®*5«JßªwKg¾êÄV®0µûJJ38ÉètËDÉüwésÊrÆkÅnÅiÅuÅ=MýMÎ§ö =M:ÓßÆïO-gåÉÁ!õìå=MB+ßE
»¾ì÷7fÊi&ø·D=M4iD9j~ý±äþL©QþK1]X(¢' Q¢H*ÕûVËûÖÖûÖûÖ[o2ÙÄrNgWÇ[¹)ý¿ï|íNoúáöN^ê4ìïQ[÷öÞ7Cê6ÆèRIÌ~h¯E=MSWWXÐO×]ùª°@ s,{K­ÝàöuÑÛÍÌ 3»= Æ±þYÔBÚÐ%MÜÔ®d´×°Nz@½~ìqoöIZ ±Z}ð¡äôX	YÍ®"RßrìÇßäÍ2ÄÉÜÔÇT ±ÇLEÁnÕ§!*»ð´R+Zû¶Æ[rKWúY
e&nÔ(<ªÄehÛO©6ÖÇ³.ïIÂÛ§êés-ZVrï;ßÁÂ´ajÖ9'3±êÆ 	óR3e9;R?¹«âIîÙÌ ÔÌ©{§y;+êW= ôýý´û§ñ'Ñq<Ýçaâ&¸[T*~½ceüe\5fNW÷=}ß¯Ã¬ßï°5^î§þ?ñKJwdw?ÌQáËÏ"YA"õyØ\L!¥IüÌ·¡nµ<~tJàÖz)ÿ;u úÅ¦UU;W¢¯QÁAöW¦Á®I"íqq)ÙVHX§ß=}ïö)%NÐx=M®¾­3Þ°X0 ax²>¢W»ãQaX2ýÙñXD.©Ú)Ð?jbÛt¼kkçð©LÛ ø¶¹4ª2ôO£êjìQÏ¦ZhW= |SbzÑ{'|FÍyOæ(¢' Ð"  ¢ùÖûÝ|ÓûÖûÖ[ûÖ=M(
(,ì*<ßc(<ÀMj÷\QÞ©C8hRÅ4®©ò<±aYI:Ìè¤j¬ösA³J)?Âaäm~ùÄ.ªòtÍôGÄâ )fnTÆÃ×I&ìØáÝ7¶Ø{sè&W7[Ò>ùsè7n$ÛÐÓKfÝýQl=MXOÜêÜ	×ü·×]:à5+ð9dn¿0úc¹ÒB<#ÅhìfÑ\ÄWù}ý/½!<Y°^Ã&3úQ¤õ§q7R¢ËÅCYTÜæÂ·W®çFÐî2*GtÄcÆÔ&Ïîâä<ÜQþN¨Û5Oûå¬9Ó¢ÞzË8¾Øºu§÷ðÚuVT3óæâ+ÓµÖqßµMiû8[×ï=M½DïøåýÛ1ü0ÏÛ73ñ´·=MãI_uÏ/@.ñÔP'F?|ßÃ8<cõXKtnðÏ$§Jn2¶ªÉ_ns,Ewï2<Ê{ï3Ö"¹sO²Q2!±·1Ù¢Ýýu¾;|²êåØ&çKò¼«g©×.?ò>ÊÓò#Bn^¡gû¸¿ÐsÒ_ó¬Lº¢ÛÃ~\5}Ã:¦á±gÍÔ|_ÐáCvV¿pÔ¬Ûé7n8åc;*zÿQráLµ¿´KÂèÖúEÑvB:'8åñ1­Ðh\ï¥b¥$ú2iiBÍG9ÁG¥ÞbJÏ¤TÂdR6éË6åÒF¾cªdNÊrl·îGnÆ á¥´ê7hÑ¸êEÊ¶òÌvf¾fY	z5trÅw¥ÄUöæU,TÍÝ=}¯LIÑàøÎ±q.m<·k+ýÍXÖQêÛ½Þ=}¼~7ï£Ú:òãõP¡ÏB)¢'àX4$ ¢Ñ{«øÑyûÞÊÛ­ûÖû¾Á¹*3]t±ÍpEôk­Kõø ÍnóT%:ì{Ã¡§p³eUQ0ÁöÓh»/íúØ¨¨ñAyÌkt«N.]¾WÑ|ÄofÓ^w¤&ÏUÀsèõ¦¨¬hydÒ·Q¢5æÜW	r3b}myªÆ³9)íÈÓSÇÖYÑv6¸á\skFyòïàªöÌøÏíÆy·ª-ãxõ&Ó!ÖÞÓÅÊ§=}Iïð²ùÓÎ]fU.4À±CÇ<èçG¼±°+µMN8ÙR±K¯üð»
æo]ï½¼?Ì	á7><±R¦Gvå~XåÄd¦æ_à§¶µ^Ü0Ê ZbÚ­0Ý°*1×ª¸tHfÐ¸âú gß¹òP¦ßgÕQ ´+!ÄÇ&Â×E°¢@®í-°PC§%	eP^UAx½,lH>MÁDú§_V¬ÖOµ¥bXû3C¨ÀêQ2æfsD¢ÆH"ngBJººµñ¬Q­Áx,ï?å@N¨åLg]¿8gàX~õa=M1810oî®g}¾à£³)/iüd¶ÉD1OküD7°¬fRãÞFSÔF%ÝI¬hÄ2Lµ©ùlkCùD½eÝóyN½Â ,zÆð^£ªÂlz÷ÒæT«¼~yì]µåDVÂÑù¼me.ï6 S'µª|ú°k§>ÃÚ	= >î¼;´oäÙ2e%Ü!IW*¨-I
Øb7CÒ¨mNÂ=Mq1cªQÅ8µçå®Ná)&/jx;~êÑÅ¼Úyjq= 9£ç´±Á¬6ïÖ,HgØ¼-ö5L·w0ÚÙ"¥vEñEµÔOË ûj¦råÙu<Ýze£wUtówUOðNÉÿÂ:<¿õ3rëÕÜ^tëZòë°LÎãi=}C9ZÀ>»½´ÈW0¼ñ= ä&n¿¢mCOÊ;ÞØ±Ñ/:YýäúNm({»èý¤À¤¾DyOá£¤ê0I³Ý´7Ä(´øk¦»¬ïØ(8ëLzJMYë=M4øµJ(¼Â %zjrµ\:ÌdØ~©é+?&ä!ªÍM¨Â;ÕûæÎû®qûÖûÖûV®¹´Ñ;zøÔ;ÉÞ¸¯¢?¥ØågæwSwÙÚüïæûªE.ðÆ ¼JàÔ!öý,ä/Þ°{°ñ¢\Z7A¦7*Åc¨sb$§xRäìô*÷(zî/¸_âäî1Ã(eøØTbÅ+16Å®H:déý]jÂ%q6½¨c´,Bµ-V&-¶­SÈÓõ£yºôéÒÜÞé6÷ä¹·ém®qC·¥ÌñâÐ^îÂàf«·MîÑè»êÆl»_zû¨>Vøÿ³¦mçß¸êAei§!í<6Ù.æ[DxðôO^h8ãÅ6·}fÕéMNvÙÔY
 ÞkÖÿ\RÇØqðÃM¯¡½]ü¾>¹F¬|Ñ	°çÌ{>u^L¯KX»eÐÉÔÀmcá¿ Oáå)¢^ë$Ï+ò}4DFX»Äbi²ÅEUiN´=McE	h.Î²4üK	~òÁDëéú8ªrIÒväcÑ×ÖÂ;åÀÐo¥:ÉèRsQ¥åûªSw5]¿HÞrtwóJÑÆfí¯º¡õðäÆÇÓÌÁQ-õ¿ÄIWo³µvm£ºGTùj]öÇÙc³=M( b) PûìÖïÖûGûÖûÖûíU<Þëúy /¡ø'Òe-Ä®?Ræ= ü¡Îe"Kê&Öu+ìË?üB= ¡k#¬(ä¸0f ü= ¡¿ö'º+Ìþ;ØDÅ= ß»¡/"¾Yï'ÂìWîoü?ÂùBa4Ñ[Æö©åiä§ÉdâB{±Y§¨¶wüIådÒòqo5qË¦8g@V1{¨qÍd÷nw±ÒÇ¸ùgU= 49L,ýCåºQQ²[u½A~ì=}SkLxDÂL5½¶«cKådÎ£ÝiøBâVq§hÓkÕgûKz7±.ª5§¼¨øôçå3³sÂø÷f¼\KÞ_O²0eOªº·dóëÂ5qÊHíßÞÿ0þ4[ÌÿM±Ö®x5ª¯©ñ¶ÞxY?¨}¶Áx©>Yþ^LÊûF©=MÛÇÂ¨-ÓûS±ïZú2Û_]7ÉÍ²ÑÖõNû§Oä¶ðÒziËMÍ§-ÓiV÷vøfû'¸½Ñ«õø=}Û/=M±]ÑÇÏ=MÍ÷ÝD(> ã¦âP îÖûkþíÖûVúÆÖûÖûÖýÛ¸q×y+¼©*üwÙ}Ûîî ?u[÷&L,§|§èGkØótN	@þl~pýä_[á-ê¯L1¿ýtl1û]ÊñÓúÎvþCXSÛ_¹)ßÓSöÐñR;ï£g>Z¶¬ã¶´ªSÍe*Ìs£½]èÄ/{QÛîìËê§y¦Ñb"®yLI[3pïìmÚøËAi4]Û_¡®½½fsíÁ©eP%u]}(ýjFO9ùgíS¯rüS4ÓRiÝeK*?²ý·ôù¡öÀQhQr¬þÅi²o³LÝ{Àdª÷ô®©6­óÃço¬u¡Y½c.´jËqé2:ò1lBY1HA¶L²³yZ½<µkV1]~nBqUôÙÚ©ÂTúÉfOxM:¦°Ö1°l9­nï¸^19úshZ
ìâ<«ÙÝ «È9,¶Î¢ñÅÕXFß!Ê)»AV[\N¨Ðé>xhgçA(®ÁÌDê_¼¥PBbõÎà-ìëØ­ÂqÑQØx
*vÿA
G¨Ì¦Ôßç8/ÛWÂ0þ(xa"ÊÿÅ0KF£X5Y¸K½¿2DRtûÆ&ÍyºXÝ{;qoQ~u?Sã,qþ¬{í°æ"½vèÖ¡DùÃ}äÊTì=M¦ô_>X»%9î7rzX^H(qïbPV],®fBöG:ÇÖçaæQ!²»³èU5Þè= 6êNbÕR?£6¼r¬H§éÕJõÔe]²NVâvèÖÛNÌ|ÿ+ÁÆ?#$á#5  = áûÖ=M·ûÓ=}^ÒÖûÖû±ÒæÍ7zS¾vÅ!$-áÚáÄ9.ääl[¼þÝgC8åÙñ$È¬påXKnråduFÄ*¢]#Ù×SÙ^Vk­0Ù>Û¢òbìÊ72ÎïxfÓDîÍdÛ5v÷ZÅÍGáfÆLøì®¸M0ÅáÞD=MÀN¶úã
êÝõÿ¯Å£¬9¸ñgØ8K/¿@èIg½áÓ\ß¾«SOò|©;®w:?oþ )ª;Dù1J­ÄÖLgèóÄBâÅêØ/rEÀd­OÁ:LÔð	çû8þÞë»bö?0Ø^5?>@A¡/>ñw¸Ùºo¸Ï´¡*ï(·®Êô+
E~~5E~C&	×8éÝc~	]£õ_gjå¿xSÛþ¡9Ã­0ó|a¸oFdwqçj¦ézw
¯N¢+\rög
©!Ó;äPdFºÂWñ<ñz+¶¿Ôämåª	ÌÙ£z¤MwK=M¸]â!u®ÌYä¡Sú}9 ªÙ;cç«GIr~ÝÆõõ§ðbtfsÒ] J¡|7äñèæ¥×B¬ù2h« D÷ÛÂ¸ØV&¥xåÑTM¾E2[²äÏ7é,o¯TN°î&&¥N¹hÔÙQ§aNöhsÒÓ°mï«X?~ìîqÅÔ¼OcÄ}nx%¥KË(7vC.ÌÁ=}ûÎöìÌ¡eM­dë6ô«zqÿðîÆw=}¤ÆRÒ» ,ba Ó{èV¶ëÖ]ûÖ=MºûÖÍÛ§i£¸=}\(£ÙW(.ácøHÛÆ,ãI8/¿.çö(æ¯= ýhÎM9åyÃxÄT:­~Q&ãÑù[.ÉÎxØ(¢@Ï$¥/4B=MÉP+eî6ásc4¡=}d¨q?R÷æãÄ)Üª¿ Ðdf»ä¥¶i(ÛnÖì4ÔÇnr
t´õÇAÒZ=M£Ð	,R¾ïDõL¶öîÂðVmRØXN+Òÿ>ñ_!YI+ØÇÓ°Óç6IÜ8©äåõz¢öñÅ¨«LR|·ô*þl|iöj\ív1UÛÎå:ÖÛÎãÍ{oh÷%¡fî?ødÙèBRWSÙ%»{Ü;Î=}ûø:Ø½¹ê@|¼êÉ2ä¶iPük2½Wr\ýÕ#G½Ìîý©ÀóNÖ»©]8)EHOû½Qå¶=M\ Åa«.æ0e?/(S¯Rð4·àX?Çú)ô÷½¨s¾büT³_¼aøyî³cÇTÚÑÓZ¯+øßhìkHÖ}ìLÍÏPõuÊ."90k³eðZGpFa;qA»Óu×1+ÙãDÛü¯¡I| ÑÃ>ÁA{">¡	t^éÇÌæláÈô\ô+öYÞÉKZ~3J¦ÔùyV=}±¥)oÂõ'ÖhûÊo\Ôäxñïd¬së¼ß0»%Á]K]«ÐQµÎ \G_êÑi>E9%²ó4øÞw±èª\{Î¤Øµ2kä´yÇÀìÅN¼É@rÈ¢)uDBt9Ñu­:/U:ÈCÈîÑ:ôeË&q×T²Ç©M.g»VºþúNð×¹.BÚ\vôm¿Nâo8}ÅçÌë<oóç !¢-ðùèocz;1d°¸QiJæ.Va
Õ)Ö­FìÜª¡I÷ï¸ÑJá¬ìOà¼;MØ¡ûbkdÍLñ¾åKÒg{å:Å>¾ùtcø-{æ4úsú®ü[?ÔgPü¾'LZÀÜö1ug6Z±=MäôîÜVÆnø¥·ÊNl:jGwl|â­mÙ®¥[÷\x²¡ºÔGcò\ñX
åªxOª2­ÂØ/OÃOÞÞ$ÌÃÿõ¯Ã«×PæÉIÿ9½(Ñ?¸ «àoþÊdOÌ1_W"?ÑW~uç?¾Ê>ãÜ?÷&ÐÁJ IW#1L+ddF¨eaÞ<ìëÜ¼/(Òcij/àÉPrsâØ\<Äb®d@7?ác±L¯­¡HæfgAÐOº	±ñú3ãõ8å²>:ë¼½Ü-©Ã= J¾CádkFLH¡©d^&FÒ= B©ì Dä³Y?°ìR4f&ÄpcJùriF­´³nß¤äSx?°¡¬FF!¹©QKP«g2ùd$Ó= R'ÕÀ<ÚE4¼kÍt>¯bþ±¯^508v b$C*ÛÇ¨Ç±eÌøwlctQk8sâ±£Åì«KÅp9Y[r®}Y:çJ¿|áã3µèÆvt5ò	lUSËÙB}ãÍ:¾¼ÏcM
7ÐèÏã]Á¥ÀÉØ¡QÒ­ìM¤;mhwTvSúuíØÿAÚÆ¥Í,ÍãVÖVÖ[¯ºûqú¡'_¾2ÿþiëNz[Û8Æ;ñ¾Üq/K_ÒÀ·-¿xWØ¿uyT 	#¯@ #  @xçÕÍøÓûÖûÖûåûÖWJà¯ßeVì¯ÇçÈ9ï©¸gS¤_¡A!ÔJ9àù±!n%Pj0è£r¡Øf'R@¥aê$ñl0§î$1H.Æù¦®-ù^ªcèN7bÕA,ì-¥dàÉ"¾®3 ¿G@nJd}~¨Ü0¤4³ªHv~dî1Ö\1É¸è¬3Kwì©¤éDT=}Gá¸KËxêÒrÚ¯µÂ]K¶hæèRRÔ¼]MÃÉP´OÅb9RJ4áÉpf¥¤wR¬ÎCâØ\¬aLI6î¯Á´Y:îT(Î4®@$E.eð$Ó*eÒÃDÙBÙS²'H>®ÎHn­Ó]ºiýÃÕM:çç¸øÿI¦Î;h3ã)LmûæLc¾å2È¨= XþL­Ã£XÖÆåC8oÕìØ9oa"F°UC!NEpUB±Úµ2ÉSA±ªÙ©ØeiD´jD?mÀR®¼>k¾rßEÓþ¶¢Ñ*ËVÅ0F¥¾ºt*zÅ²ØBµ/s¹²¶æüº³æÛË«j¾nhGZK$9K¾¡h&Ï.P&VFGÛrFG~qQÕe6o·Ø»e»äõìïô+ÒÙB¶ÞÄ¼£cL\HÇoYN§¢/}4LøÀàba~Ö²j­µ¼¸ÇdméÈh5·JÈ¨<ÃÂ5MÉqSØ§ºþ»õTÅFgÁaòdãù:~õ°<ÁsYMÖ±zö>ö2kk;Û®Í½Ü~ÃCÑ.Ê¾âÕ4ºÊg»Çg< F&Qp»¡wÏ-w8ûèhYfN~T²MUñÒ¤©ù#mýBÝ©Õ¹cmíL¾ÆëS¹¥'EL,>A·¥)LrzÉõøêÒùv¾×B4ùèLcóçfæ6;¢7VÅûytûnµé^¾ÒS¿½.'=M[ZXÙâa=}'ÅÂ½HèpGãX	þiuÅ«ô¦NlQD÷e| »NWÒnúÏÓ¶»ï1>²kÐ,ÿaòcpÚ·UÜ¬:eäëÏ~*cPëgå\?9*'àX  ¨íÖûÖÖûÖ}íÖûÖh¦Æoy³$²úEÐ"sOG0ë±hu2ÙôM±®Ë3K±XB¥aÙ1Z\ ¡e$u)(/4ðLyà×ç"v47²È5Ð°fÉbF_5Í¤¨üZ1Õ¦¨¶JÂs1%j¨ÙÇ1S°8aÒ¸¯ä«jhujèú¢Ã¤nD,K@¸djç¾rDËÅÞAEIÇ,e¢¬3=}T}Lò97RèûpnñÈ¼2S[JþwYëÊIPZ5\?ÃÀý.%÷~HÈwriwÕ²¥´ÄÍ»j¶tñÓÅªF=Mtü»ËÂ)5?ÞËuwÓáÁHU×ÊIdm©â:¨U¼
Ê2-uîhÿÕÕ¬YSfkÚzj]ñrÁ°®B=}OZ	xß= §Ä®WÿÔÏÂÒyoµA¢;¬ÜÉzV#;;7Rð²¡Ç[-,@{CÝ¤fîP²Î±g¬^8±·Qqkg/3ikl8o»Øí¤Æ²¹µSOºIÒòlÍR³ßÊ¥f+{ÑêâÁ6ºÒPÕªµK&K9yIÖâj±ÓvÓÊ¢­:;µúxßèf¹VÐÑÃÄ½ç2[ÿZøTóîÕÝv\Óê {'#c.~­@nPÆ£U9½Ï	Déj_GÎn¾Ò£³êE|l2ÚØÿúeééN2×ÚpüñRÓ»BÕü|WÙ9ñçmÑåÆ?=Mµ;ia/Ý»¸P¤§±\ØïHõãr~tBO~jm2jR	Ê·5ßÜLMÔì§Í½¯¼³ÌiqÚ¯%ßLÇÞì¯ÃÍ¿ød_¾_MÏiãïÆò!â §B!®.ð} í"¼? jÁ@§»&¹*:0D@³/$éXh\¨­õcüv§üAäÇiAE¥xQd¨¬eã¬6ÇS¬Ù¸ãú=}ô½P§¦yyNbg¤Á(û§fÑLâ£1^_¬pWs4sÅH>i4}Djq~M«R´º/ÃÌê0C¥8¬¡8Ë'åøØPæÜýQÚüªq¬Kåd»åÙ«óÒg¼óÄFX<À ê"@Ú»;'ùöíÖ^ûÖûÖûÖQ¾.¼Zó¡óÏZÐUÆãì.JX\ðÑß¾8ýû7§S©|îù|ý¨rÈëÝ¥Ná^·[×|ª	³ä>¯#õ]>ë&»±×çÅ>M_|¬³K»o*^«zÓÊï²-^ýn] ³F nÁ 
$,-#,)Ø\O æ® ·"Ý)5]Dæ°Yåbrö/	Gcî--©^_Dû®°b7cÒß*©5eQ­aaº¢å®@_¡¸FxÛn¸ ýÝFØ>ÒJÓäKE©÷hRoir-µ½CYÓy2ÔDëCi¡¿²)5ÒHÎµt¬ÀèA4{'JÒîp,ÇXd1ÖBge¶8ºô	Tÿuñ¸vºØ}T³gÂî÷ÔùÂyr¾ûíÑ,ó9îWlÉÈôâä:ôpã£¹¦ò,C/9}SüßaëÁì¶åMµy~×Õ
Zâò®íëëc¶ä÷L¹¦å!pÈH&ãùÖûûÖ­Ë£ûÖûÖûö»è=}çZ§%=}ºwþôÁ/§/#<n¸Ùô§¯G=}bÿöH·M|¼NI+ØË rÔ±ëÊîN±ÌkÍQNãÚÌxÒßëÆ+NÓ>Ú²G¼ç>FÝgø">a¯;]R¬>Ñºç²>sÖ^qºç·Ç>Sß« ÓZÞo²^^¿]^õiðúGsO¿¬®[ç¿ÎÛ½yýGíS¿~§-H8GÀgÊ ÉY"v6+x{Y~ã =M#ÊY!q&&97pnàÕµ!õ×'^20	r= õ!ÿ$ì9«Èx3oQKÕâïÁHst×¢}e	vª³ýbÖvÌ8Ê(Uiq¾âÎrLøÆøhÑ|¨¶âSeûoªl4×ÂFðäjÃ¹´}3ÁÐÆsyí:º­Uû
òÖº>ãTFJîñÄxÎÜqS¯Æíí«Aü=}í½º*?U+þfP­´ô0ÄW¬è8yøë8zvSýòÐÉÓÁÉF¦aã,ÁG8îT|xh×æðË^ãñ¦7,Ï:~^RüøåPÏÁdk¬x¶=}©Ls{¾ÖìÙ}ärÆ¬5ëZ¶¬mM-ûzwëDçRçz,Ö¬8	RùrÖEë±u6³EáNë
£¶GMOxrýÐ,ÚÙì²½Åõwëä_¶¤q¥[bZÑAµÐCÃPU§ð^ß°Å¸ÈÔPÎ²°ËÆÄÞpÝ¹Ú­pÂÓÐÄÇ0ê7ªP°¤¼°Ê°ÖpÁpÙpÍ°Ó0Ç¿Ð ¨ð´0¢ÐÊðÖ¡¿)ß~+]_*Wß)e(âGí>"åh£@ Ï5ûÖtûÖ=MåÖûÖGïÖíÚMæÍûì¦Ïß:ÆRÔk6ã¼¦K,¯*;¾µP\LØxéÐÃÚZ,Í:8ÒTUxþîpÝÓáÁÛr?ãO#È¯q&;¹^ýÐ¯¦ÐÙ¦«,³·9®ÎRx¨ùhßýp×Ác©ã¦ç-o;Bï9þ~R<Ü8ëp¾AÁàscû·Zxá°«È£Á´«ÀÛAÛ×¾¿áKðpOôÐ^â <H8³x#âWÇ´d®Tddl²µH±£èµ»M? |¸øq¬8y²Èt¦¨Lg¼ÌhÏbÄÉn¼ÏiÔ§¾ÍkìÀØæäÆdª6äüvô×/ñÛ]×C±Ï+QÕ;Ô'±ÅWñÃOÑÕ_À¦0µ§1]g0<Å¨óô$]_©U¥Ymì@Î;6Ñ.Q>ñ!q1ã2ryi|Íü¨å¨;(×­äÂídñÍäÝd×=}
Çúmß·¸×¯ Xh¤>ò¬gtHqXÑ$1²ºX¦¨[kT]oÌÙ= ÜhÝlÜÂùÏÊªßnÞiTÞe,ßmLÛc<ÚË¨/)Ï'däcB	13÷ÇäOïôçõ± 7¤kíªXºø¦ {Â[ÂæB'âwÎtíoºSq +Cçß2Cß1E<(/ùhÔòîä9	ÂÎä)f¤é:ÂÔ'pÊ¹eFi?åjuÊôó~Ê3ÇÅx Ñsò'JnâÄo0lJ%Ë'^¤8H/ÄpHQw<Å8ÑjÜÄfXÑb¼Ä$Qc>i¦hÂÛ5?I5e¬¶ó2LÂ©1p|D¬³em¢ELñ~ê9¶´ºaê2YC¿Ei*æ3mØL·|"De"qt:j?¹N¤\4g©°´©d^ÉLíÄÇ¬±YÒnëÙOämbDqrD1yÅÀ´±:òpzkw	OC¢ì°Òlöê6ùE'¸¼±«mëBOÕÜ·om¼äeüåsäo"Dh¢EtâDbBEjÂEfEn$Bh0aD'ÍO/PÅbßeIJÛr;¿zµOfË|¦Ra HV4e!Öûÿ]ÓûÖûÖûÖûl	$Ïúgýñ|yÙC¹áÝS¢wQ¿¯ñüáï^ç©í_Ì0·^tK2MKî»7ö®Ô4®¢1y«¹¹r¶Ô3[Ô½açùÒËl3öS¸CäêÅøÌêÐ©Vç¤É~Ò>LËã¿xdÒ
éuNûÖÉ¢ÑôFÖÿÛ·M<e¬FðôoóäãYô1ÏÀ Kïùm÷d©ö¾]bí[n³Þkþmú *gÞ@ÑÔí*Og{jdÈÅh¢VêpezëtI§F­-õEçÅf´Bf?g{³Ä¢]Mxb²]èfú·N'ñê-T,)®mÄÇ³óHeVÉ¿HÀ²_Å9peS:h{K¥wñËw#hè¼?#¥UìDdömaôÅì¢f|NàÂªå}&	%Ë°Mªþ ©ñLíÿ¦KÝÈ-Ü2\$ô<eôÝ³¸²&³= hé=}WÇüæ~§¨ß(«æ]ãªà·H4«ËG^bîw\É¡Þ¸_XL ­iâ¸0Kªðüª³dªTë¢Ëµ'÷Ï¨yÓt0Õy-×î@Í6æIÍ¯>¶u:À¾Q,ï¹ÍØYD£M1\â&	ç=M0B ¹Gü *Óhäê^xÇ §Qí!Ý9¬SAÁù>¡v³Hlz0«^µ¤ooâkµ44íkçnlüýº£¡øÍ0åG}¦¸-µ8ªÏæ´?~ñ(Û<0£%Zqþù­~¯^t>äPa 8$  = PûÖÓûÖýûÖûÖûÛkö;à¢Á£ØP_r¦@Ú8¦îhöê¬ÂÄT¿çRÕ<R¯Fp·S±ýWGQ*j÷ÇÁ»Y=}ÅÛSt\+~ïÁÞNR"¹RABÚ«èß¤EakÙYO
vr5·7Ï¥zjÎgÊ#Ó,WÁ+mõ{ùÃÒ½B}Õ+%-O·ÛQé >¯/î1s®RXïî¾dïÏ.Ë7V2kOµCÎ
FCüx=M=}~%þ»#~Þä³o8Ú9V£= ñk<£SîM7þgÄfwîÂE_©º»»ã2ÿ¯=}ùöBàéfaî÷+Ân¸ÍBlÎ7ÅÄa,«ÕkPÂg2aò:I£$y¶î´c±\¥4xÓc±§µpÝÀ¬]5BþÊ2w­YÌ-T0örØ63Ô)ôh]z6Ç!-7-Ùæ(g¬mø9êÓSdìq»©KÄ>znä¦ã6Ö¬ªÕCÀé¾7Ó<9ð)É·î,s£ÏKQ5ìºáÕc¾¨âhÿ;§?<&Áßù¿o#XÏ9è¤Ø@"¦¤H­?ã5nq$§gÁSºDõ8&GçÒr\;ODÐaA±©ionAJBºìkGiFw1¸í®Î</±J»ï¸ì"VLKðÇ®$´Ðb9s·s¡ÀJn}ÉÆøÜ¦÷]Õ4~ÌÈe#:#ºèÜþì(ç6¶®ãÓv&Pa7åÚQí*X[ïÞÞ¢ !Ð-   ûÖ´ÖûVûÖû<rûÖG ÃO¶ÿíÙÑ)ã¨/ñ}ö/Ãülqïð£#E8è)¡x\:äY£i;ì#A>8êö^ãX[¬÷ãÉzQ¢§CØV²¨ÃP¿ZºñâõæP xg®ÃL<Q[T¡ÕcGÒQBnÒ³PZ\¹CÆ°³X¥µJsZ]­u³Æ³·Q½¡fSPÝ]3×åÓørS«-ÓÑT'|j'ïã[>ýúÞÙ ÒÅ+qz¨ BVèLë¹EØîzªqrOC}YoÍÀöjÆöÌDü5¥Ë-·ÍÅÝM5XØ¾åOVfVoøäÓÒmlÿìMäþùjê6XZ;ûª××½Ê[(Ø³?â}Øm1Éaè»ØýÕ0Ã]ÚØ·û1\_êµ7 Y£\ä¹§Ù×(5ó®rø´9çx¼ÚG0²ïwnÑçä¿ÿÓÄ5¿ìYV[¼g}"×ÿ}äEN*Oñ5Æ®ÜêâËx}cSZ=MWhòØéÄ× V¢óPø7çåxS^«_= Ñ
!ó?:¨¯QTânµÇ¼,ñäá3O9AåÕÏ9_-â©é;®îÜÎïÝâ/äÆäX3EA¿Qb´ãwv½¦gW~?îãaÏ ?8é[ï¿hÎe²O®ÏíÿÔO1¾ÕX+E¸Aaý\iZlEùVw*o3I>ì±´©Tè°BãíÙÒLS³Yyè±Öp¾¿öüzÊà%wJæe±)µ8ÅäÖÍê¸%HC4ÊPYb¥%'u¼ÀjùiUehvçNo½!TðÊô ækmÖÂu«áÕ´õf¬.FúZtïò¥µNkw	Qík/Ñ½¸e	Ó¤!#ó-8ë°µ¦ßQÆà8ÁÔQ7æºÁâ²eÆ4Ù¸Bú¦@ú¬ËÇíìQG±%ÁM6ÒéHKæ
{qÛøºÞ¾ö<1ÓA^ù¦ÿ÷~«úG[Ê&ûeë>b'ÖX¯C=}û©ã­n¼=M¬X7f¸Û Óþ5(wüïÙñ×ì-É¯(§Ðúà£Ë\)9O¦´Q ³W»f#99=MëäK¼ÎCrü¿s"X8àÑ= Ìó"yL¨Ôá$$³ÓJ¤õ±A)Hãp¸3nÙX¿ndÐËL"d4iîq\X8íÆ¢Ö®x<Þ_®S|<¯á¤$æXG H1­dLDqYM¹Û~é¬[½bkm*ãñd±Ý¯·ýpðoF1W«¸Zµ!ò¸´æ§Ã	ÎjçoV#ÛE¹DfÒ a6î£Òµí­Yh¶°GµëóåÌ¨éîÃ.,KàìÞ Õç*ÌMÄlÅ¨Q«BJÆc)!ój-LE9;'´3}®±*^÷uÊ~iJÓËXËº=M«Ø=}£ÿëzoÊ= = =}í×
¹\Ä¡n-Ô¼äÅË1cÓF"/USÚÁ9-½6.+{ùpþê)µV,ÖÔSÃÀ½Dù.üö2³õé8éNvÓIÝ;ù}¢Ê:¢5¢>¦á!@,%!ÀÙûÖÍ·ûÖÍùÖ=MûÖû#O%¿Iè¢X$(Æ0\7BQp8ÏùßIlrÐ(í51¼ãdyÕ= ´ÀÂÜ©42Q6¼X&åùc<ñ´1L?ái1)òÓDÖv¢­r²¬I´ÄËD=}jrìÈ´~IôÕÅ	²ëQF¹è= ¯,B7ØGëqÒ\ÚM«¼·<QóN§È\7ée¾÷©*~Îà°ØB£ªøÊè5E¼
´¸d))3Je¹ÏîJ¼¾Èâ®GJ-vöButÞÉ²¿ÊæUéÊÖ|½¾
9ÀùÍ¡ô-´}T¾ÌiõmÖ¦XÀåBA|ÕÙÓu»!=}öÁ	¬.]ÚL<ÇëåçÚ¸¥
QÞo/IA6
3Õ}?M#¾Ô9¢!¼-1¾¨cfæ:Ù1ÅòæÎPé*ìm?¢	#3L£m)SÅuø¬}%=MQÚ¡Y&ºÓ¶Y]6äNÒàuà2Ç\kâyòÀåú_Ì°ÚeÛßUÿ7{Skè¦b;ùâø¶[ú¡MR$-ûQyò¾µô<×§Í#kGY°æ!§DgTVXÂÆ¤u§3é÷¼¸¦So6Y³BâÅ7/ÙÀêíÎêÂ;ëVØÑã½}ýfÀ'£>¬·äÂæ³ËÇ]yeïO
Þñ¶íþ<Ôa¢/uØ±"E{axÿ·òø·¬8_B÷±Èo×_«PT  !Ìu,äÃM°Ó÷#[P¨ð@,¢±.fP¶AÄ.¦P{F´w­Á~)Ê8Õ£è¦ÑI¼Ël*¨ü$Cùý:é÷;±¤§dÑ4¦JñLªF
~T"qQ<z;c¿vLó®îóxöFæ<¦æÔ­«ÛÓ3Ý_¡¹Ö©äïldo@)áD^¾nbàK9ýÞr¸þ²â«»I¦ÇmJúÈ·æù·LmoßÝ	ùÿì,$SY¹©¥l:ÒØßLÒtÒù»íÔGùdGÀÙK§ï¶Ù\»¾ë;¡\ÄÊÛ¸g= ^g¶Çqàð_%XßJ lA<LDüÉ(¥ehi5SÂÕ8Ûåå¶pßÕ¤MÅÈlK¡R¤Ëë¸Ù,°þÏI·~%çuP%³jJ	_{éQßJävt±ÀuíÊqõ8ÈÆÏÐ&¯óUüÆ¶YÏÅdÓ®ÀqXÈãÍÈ¾èSôUPÜÂ¡×ú­ä­çfêºXÁ©æ ì÷UòÐ¥c³{xKðêêúvÖÿ;Òûû¨ÓÇ[²r=}õñ¡³.ò[©[ü©¬çO¦ã!Þ*f¡¿½íÕïÖùÖÖ=MûÖûÖZ^IÔjàXJãÙ;/ßsµ½¹gäÙ	Onñ)æ¿° ¤Ì$úá2´kÐÕDE96hLw²
rü_Le«¤42rì°BÙThSýdºìLæèÀ,;å¸ Gc»,5ëéÙMkÆÑLyÒt¯± À<óDø	Oç.Yìvèsw¾%"~ê3S~¡%g5p´vÀWh¡Ç]*ô«I±Bc6ª6IÒÊ2¹Ç´0wtcÄ2cjrfÅR=}´1Ër|5¦OÉðÊÉbÂ*­ßËòÝkµ_^ËBÅêÎ6u>LucÖ:éF·Ëæù)
(¯ÉóMËî¹PÜ'ô1ýÈ¡+-æZÀ~Åá,1mÏÒgg³Ò4möãM
ß=MÏåÃÎ?l»_>sÅmÉVÖSðÛÀ£Ò¦.*©ZÈÁ«á>}<Þ
2	Ëk§NÎöC]~x	xÊgëlÖ|ôgis¿ªD =M^#F©;@?àï]&hÍU¿¦8ú9BvhÂ¨1ïÏ9Q}ÿ¨Ø,Cäç:ÓÈQßè9³<¬ø¸/{mØî¤=MFLVæRsFþsÆ7»Ò¦ í7$¼ö4Ry þÿbB/(	±4B6Bå 0Ïmæ¬ÎXUºr~þUÇðì¼3ådíÐe+ÔLX³aß¶XéykâMÙQé¸=MvdÐ»·5[ûÍÕU¯ÍÑÐÕkµUwdøý¦EæVlëÓßIÖö¶ßô9·ëß=Mxð®£òü-Ócø.´ÐÒ×]G[q5@É#<<v= bgd[BNÄÆè±SS½¨Øäv}GÜS¼øTþ¹ 3î<qÆ@î¹wØPß+N²N|(Ç7ü×Ù ÃK+|ÉåÍ;ØÑÿù­9­NGÞ[^v¸uØÃVï#é>R cá¯¾©äeot\QíäÜ7éGÝrÂ7{áA¬Ýi¯ìO^¼ü=M£?ª£xY£v_Òáç7ýN&÷µ?yÎ<CÅ_û¿3ï¾Z26'~ ­¶!hv$P{T°À;¡ü0$@~Ó¢ØU¨9¦a&Á^U¸ó7¢¹Ê3lfPî3b0_=}â%0ärb8SF´öÁK¥2:?ª(/¥ÁK7¦8Êß¥ÃÞO<=}É$X4aðÎ(òßgð0<á?ã1Lþ1éñO±Ü*¨äÔ_²ÄMq¬¨£4ïÂü8móûöeÉSºÈQl=}ã8¢ú¸ÒF¶÷Oé©skLÆËy<¼È¬
ªò?çüA¾¤®Mk@=M"·=M2ÈÈm ²d°¨ÎmBË2©}´äýi½¤}u2G7FóG9KëîuF¢4"ÇúB¥u5IT¨ÆKµÉHo~:WóðSkay:ûÅSZ-âjóÑ2é= f&/¥9¼LíÓhFÂWR9GìÔD³Ùyô|ïÂx°ei6¹Óiß¾m¦@»²*p]§Fa.EYI²ë;ÙL7ÒËT·kBÜÜ±§ÒP/ò\dØ±ïxÓö·~!ÒW+SKÀÄÌ QÂ¥Úuèbë+I1Mú=MBîz4ÁvqdòÛsìiëÔJ«é}pâ¼ÛEü×JáÍÊ¤Á¥Å<Ùwª¡IõÅ{|¦úRJêøz{¦²:>´àÎ<Úf·vq%A5ìÈ= EÕ¯KYx©EÓvvAÔª6ÇJÎVw1ÛÊº-ïËÑÉrUÒUÞÈÑ{-EU¼{{kâËzôÿqëÚXÝÉÑw=}6}¨Ìç}]S
QÉæ&,_TPóÏ!³Þ&dÖVÉ±å!­X,TBÖÝ)Om/BÈ©C[»iöìµ°JfºÒË¥6äãzvÔRoÊ5ç¨vVúfôÞVnëÔq<õæÿû	]ð®¬|[3ûQÓ£u§[(t 'G}j½hGRßN¤çÛxÍúep7gç³Ò»
ýÅCYÞ§Pñyf/^3ùÎ·t=M~Îr[Ù¯W78ñ=McAÇ¯ióQÝôï£|ùR ÐK#<V:@Õ «Ó&IÚVèM³aª&\¨¶-jPdé0d¦	ÞQìÓ?}Vì{ñ1ú­ü¤æª1O8ÅîHwÍféÌ:åoÛê÷¿ K! H8ûn~¬Í=MVû{ûÖûÖûÎûÖ=MY<1b1ÕÚ«¸R}äÑ=MBD7e4HÂ»mìúüö0IÆâlQcªùiìÓoÜ.)µj8rkâÖ~2ï²ùMÁ5)}Þhx´B¿´OÕÅdhÉTgj¿$IkÏjYuê·,!9ôµñÒÏ¬Ñl´º¬/ÿø\7´sÃ¾¼l½G²¼÷\N¯g¡Ë°¢5´	ÏÀñ%]²5¬ÙÁ/%»$E*IY{é½j~íw]y©Æ2ëoE~Ïªx|e&J-pq¡ªst4ÙÉÂo5EÜjäõ4ÀÆè U%ÅÈésm¦¿b~-îØ&}#-_ã£-7øcãFaëÜbzfö÷òÉß¶zÕä³Õ¤±ðäÃa=}
	8õogÓZ*G	~÷»®C]+*	rwoÑÞÌ\hðÓÊ¾¡´9PWÕÖ¡åÝ-T¿ ßý&¾~VÐÓ¡¶.CÜfõTRËÇ±jS­è:iØÄýgC¢íä|FtW1=MT3ÝÖ¹¾WÑ½©6Sª<vvQsÜ«¹[³íýææì
÷&+ÇÓx|ñâ.6oÐÀüê)+î766Ì$SzyvöjØÍµåÌ(Ìì\eäê¥­OQ;júØúâfÉ1VÖM×A<ÐQÞ­[5bV5ÑÃÇý[§6ù)Äù	ëî¿~'=}+YhÉ= õïaÕÙ.FXØåa«£6.GëXÙsã©Ç§³ó½¬ùD¼³w½mNêñÝ²«=}}» 7ª3NÂï}4uÛÉ¿þmòæÔSÄ»KüD>Þ»ó/·¢>ÎfC/÷'ØÒàã/çÏøíãV·àÒ"s)Ið¦= Ù=M"yï+8ÿ)ÜRY¶õëÒª~rÜ·àZOÏ®iØâgÙ¸/c)?º¸Tÿ·°±ëgÇ¿^"¢¿s%ÍGüûïñ¹úÃÛ ý[_Em!-ðÍ § Sæ%(Í-Ðh ¼¯#²%é?)ÒË°¼m¢Ì;4DØPè@òaÚ-ý1Â¾0KË§p+ñj¨]»bXo¥BdºZ¬^¸ÚÅâL1	ÐP¹¶¦ßGì
{(dH¿_bz1ö¨z¤{BîdHJb´~9ÂlL=}ëH{§gùÓTêÑ]qîþªg´k8åXySæ¡Qo­Ñ¬9Ç,1ë X Ð1àpÔÓÛÖîÓûÖûÖûÖûéW­sIðtDÈ_];9Òko;*ó\«¡U>#=Mê;Ð×U´¡K,tZ@3#;29Éyàh"¬LÊdtCýV;iñè¼fLmÑ¸¨6WÑÏ©)&¹øYÿ¤Ï©×lxVS?ÜÊwPÓËÍ¹üÃí}üqS¥?»	¼ðâ¡6rçLtÈrw+7GyhÛá¢öb×w6¶ÅÐi·Å= Kr?Kz	Öíê¸ëvÐÒZ½­v;ªûøÿäæþ¡VìÓÑ×­åWlÃ[m}j¶ÑGùP[6ùùÔÿîÀ[êÔ³SÛ£[~'ë[Èõæa¶±.nLð°#'[²óiÖ ³m5½´áHG=}·[ñ=}R¡³Ô½¬éBuðåÀjNÞÕñÔ«Kë}ä¯ØxàeâßN
ÓE FEWUúÙyRêí¼§ýÔÝåWè@uðÊ­§)C\z!/Oð°^»·\>OeêQÕïÁbOÙióëO~¾æ})?Ã»Ràg®¯t[|Ý?-òIkSÁ¾?Å·¿sìø§ÓÞóS ¬%#L®%v/ÐÇs | cK#¨g#0àGàÌ<a²¢ÔN7ë@öÁa&O(0@=}_%ù±NäO¨°6Âc0k¥ØRUd¢­A¬b´>ÂP¥¹4.ÓÐ¸U=Mâ:9ë²P;§yKìüÏæ¬ðí6ÁnÑ(T¬°Ëo¤¯óB<þ8ò¹(Õ¿gH¸Xê£Üq§ÂtÊ4EiûH;¦gÉÙHê¿]q"¿Â¼j;ÃÖIæSYfûZQþ«ñ¬ÇËô\6£8¾ÿQÆ«ý5ÇrÉXK»äõOn¹æ®	¼lO´j,âÚ@üÌ ÚöpHäcÅ½ðR+]s(MDð[FðÅÊ= «"Uf*H«%ì%r~7aw±ñ±:¢h¡:B¯Zªì?MrÉhºB[¨TD²\Íär£¤Hj|ÉAñÄ³äñ2}·jûGñ¦ä«¯2Uóè<õëX$¹õþ°qgél{L¯¬ºlRsJ\KÄ°[ÆpÒªbÇÖ*ó§I»Ï§â³«*~I²ÊDé¿a5}µïíu¾,pY_sëFµÉÇuZ\qIwEg­çn­µåUzUðPôØSqJ­è­'×U&ñè·ÎH{,eIJ4?£ eu0eñûÖ}kîlÖûÖûÖûÖ­ëÃ«õTÔ÷ØU|Ãú"­Ó[Tê~ôxrC,½n9î·ðé=MÌØ×nIZî:½gþñeGc£Ù-:ð×ÊáÖ&k¦:Ì¿Ð]ÐÉáÒß&ór»,LòlSñº¬éñEF¸ÈKFIþ¸¼©Q@Ãeñ²6W«^­LRÒø\ñb e=M;6þNÑñêøòUÕ	õçú»bË>ÒYóFég;_¾ãèÌ.êXÜ¼y§h?§ú³=}ÚÌ8ð
-§=}6æ¹·ùI·®k·fNÕÚdFØÄ}ÏëÞKNC~ÛQ\2ÇX~ôÃ×±ßÎçÅî>}gÄ|ÑÛ'\n^(|lY|öÇu¿ÙÍ,XãZ¿Dg
üyñü |y"·*8'0ß{= ôÑ!96'4ù9p Tà=}E/É°WÄDAùthü¶AO¥<¹2Ruhë#ÝA_~§¯N¿v°ÓÐ bea:¢=M=d{'+¼¹¢[$í®(~ÿ4ÔO2kr]£qiAmRÞ¶i¥Á²iÓD÷kÒ?µTÜE¹~V¶eîÂ*ÍÒÂmeª1£5³HÆÏul[Ä¸}Q­çÀX (µ= qWûÖ;ÿÖûÖûÖûª®q%´t"+ÄÊLv0øûj¡Ús$Î4XÜwÀE¡Ìï%n6½xD.±ùdU0ù
ª´	NÒÔhá%B+×¨DXIòÎèµ¯±zl©áEN5´hwuâ´D×®EÂm±HØbÂù>©î7Dæ^±xc}¹¹4·ùrkµNSË£ìðARMèô|C³ ìÇëR¿ë,MsC±b´*ûjJ$42º*;[JT8Ê¦b×U*q/H,ßÌ0Ùâ *¿3ÈXytn4wé{k¸ÆÛ½jÞaJ}ÇÊ|Á×jáJCµQuVåöØ¼na­HuT2):ÉzÄ	Í±¼f¥:V\_ÆÆæÊW:£ó1²
éÁÂ´îªZZ¾Á³Ê£îÑaZ=MÇ
DyÁÓ·nÓZ÷ø¿¾fWs9üíðÈÜáþ&&ù<£A½-/UH^ãJ£S,2½WÈP²Vø2ãJ³mÒµWIÿàÄÁÂR§¸$ól5FâN³l*üSiá}4«ÃéLÆÐjyÊlÕ¸ÿæÂ_«GxLqÓå³C6]ÏyäQ	ÇeªV³óûäMóÇÂífV|»U½,ÕqÆùL{§mÁsVÍûLÏíÏ¤.9R[´KðÔª£ÿôÁ£ðÍ._ýá{ðÇc¹s.	[=M¯ã¼$Nf·Ü¥|~tyðèÅ©ÏÃë²aNõFÛüò«k´ÃNCÏÚäR{FÆgt>WtH=MQÇ¶çwùÃk¯I]]­hWëc|Q·çîs>¯ä=M±×g¹^ò(ô±{÷ÇÉsÃÕoþ^	f½µïÚ}^oôÜ3µïé¿^#$4k3_àðò!Y%<°"ºU/ôMÀÐ ×s#zM-ØEÀé± Ý·#Ò^.8I v´°"ib.YtHDå°ª-bÚ:Akû¤¼=}th²yAv¦´ÿ1rh$£  )5eñûÖ=MZûVÞ±]xûÖûÖû\~5ù°ùÕéN³ßc¢~3|dÐ)áèb¢eaAC?áúf¢=}%ù&(n®3ºKmFÛk0n*ÝAÀñ7DÍþ³üÍD±{ÌÄÄ-é¤¿EoÄDÊ¥jWé}cEGkºL´ì}OÙØwö9iÁ{5eÓ75þw¬vQC×éìvwl«ªq)e¯ª&}4°B÷$å«4çwKFtD®KØÊØÏøóº|S@«FgAí¶:KU·÷D
ÔòýcÈÆòí¢%ºö:ö\ÁºF¿ó¦þTì7¦a%,ê:NöR\Ë³´AgcÑN¦#-5æ9êîV4yèÚõAã-ÓLøò%ëïzêkëâ¶_Jxþ³¶-ßy2ëËMLóÚxj,Ô;©ÓL7¶»MÇ{¿ÑÌßé ÃS®ûÿ´ôQgçÕÜ®¼Å<-ÊYZçõß=}?V´h:¸VáÑ®ï*çM®S'Ræ¦¾uoFß	Ñß]EþMÙpéScòßhSïÀn¾r\÷flßðÓ­Ç.ï©ã¾ÿîîÿ:áà¡"þ(ìXî¡fÙ"ª&ÞÉ8H"Ë)\½(´<õNPÏ °àk3"ù'ÊN+ÓQðoÀûà k¡Ad&]<	|Ä»±Ú¿d±ÂÙB?7­üsAÒÅv¬Ë&±ÓÍBãÚfÊ,¨\TZRÄ¢èÅu±ö{C>¨¬Y5RL.p= $!0íÖûÎ¿ûíÖûÖûÖ=MÚ§p/§34«Iø¶x°Y½.aâ¢$gÊ)²W4èö¢£}%±ÝÀú@áØQ¢ó$6(ÒÌ6ôûJÕPÄáÉÛ¢{ï%o_*~6Ü.G6cG±:éî²%D#kjºv¶ÍK)ÿ|Ù£¶,Ò^²äãD·æk¦î´y<÷h³D_@ùrrÒ=}iû²wE½j¾¦vT®ÊX=}oq@¥~fe¨üªFe4»ëHâusôÎÏ¸ýbÏÃBÉrôÃ8UtÑ¼eä¥ª¬Ë4ÅWK:=Mq^Ê4ÎK&\(ÅârÍ0vsRºF}mØ4º'9T{¦5òôJÅityÛÖf3m­ÖºPýT»ÌÆmè1º3T¥NLôÔ|Å×i<.l Ïzýõ|ÊInÓ»F(cÓ(¦ÍQ,12:
ÆTìë´ó°Ê°Áiãäª¦cU-::ÕR44ÄÁOã a¦éÃ,G9¶ìRL}xÔêP³Nc¿c¦Ç,µO9ÒþRdØòÐÃÁocåp¶±LzfDÔ4o¸áR_§Å!ë;LÃëyòwÓÍÉöôÛ­Åm7ë+	ðû°ÅHë	©¶¢SM+7xâÍ(VM×y+gM{ïx}Ö´Þ9èÒÅ'kæ?¶A<#â[¶f<­´äSÕCzg²|®%=}y«[ÒµÉ
hsç±ÐÑCKç.®{ý=}Í§9È\ú±²,çÆ.Ûì±Íçª}®æ'=}±oXÖ¼TÚ
ûQ±CkçÑ®ÿ<¯XZ§Ü¯	6óRÞÇeRïÅT¾²¹]Ë5È¾+Å]¹Jõ¼ÏiúôóÆÕç ÷ý³îºl8YPâ¼GtoÞù¾Z+]ý·¦ÎìøyÖóÓßqïîó!,&è!+@&ãùÖûûÖ=M{ÖûÖûÖCàª!])Pu ?"ô6@ÿ¿ bXþ§<­¸6óñRÞCrçt®M9<ýÒYR\H¸tìa9çëª®õ=}ù
ZîUÔûöQÞÓCoç ÏñÿÑ¨ÿgYv¬D¹
¸XëÞÃrçåu®|;<³×}®ò'<Ó®Z~½Ù õ¶C#gñÇ®àKçÚ®<±YT*E/Oì­B¨I¼¯G\nLjAkK¤éLdèAdìK¤KD$OFOEÜLO|ÏB<ÌIÌÈG¬LA´KD=MDF<	Ml2Áá ApéhXÁAî,ô<áM4òN3NÌ2Ï71Ö0Ê8'%[FdYMì^OÄÚBÌÚAÞKÌ¾))Qÿ+c^+¿Þ+-(§£IbKcãK¯BK%H3"E{rerJ§óJSIÓIãI'Iÿ+I9ªIkIãëI;JI÷ÊI_I
KÙ:KµºKí{K]ûK£[KÚKóKÓ½R×¿ÿ'P^j9TîçmóþL¿_o©×hÙtÙÞrùÔv9ÙqÜuéÚsÛgY= 9dÉb©fÙ~9yI}kyoÉh)lyrÉva¹eéãv:wþ§P§QBfPÆdV2fWåR²äSGTGUæÄP¢ÅQÚÇW>RJSVTU|!CoQi9C%¾8é9:;8;;yº;=M{9«ûÜ.fÄNfÍ·QÕÏÑw¬g¬p£¬tc­ÂC¬Ã­Î¬Á3­s¬Eó­-Ó¬½­+¬c«|<x~ÙÍWv×:Ã8;M9/:ù®8Q®;?o:î8Kï;#N9ÕÎ:8ÿ9g:>×çf¢æ½7æ¼÷fÝfì¯æ	ï^»±Ç×%Q= n!= Q0ÌûÖýnûÖ=MûÖûÖûÞëçSÒSl_ a­Gá­qÁ¬,­Ó­Ö±¬pq­ñ­¼Ñ¬³¬Ú­·)­i¬é¬I­¬Ñ	¬(9CdVÃ.NÃe~ÃAC~Qp)IÃyCEÃ5wUCmÃy{}Ç¡qÅ±QÇ©ÄÔÌÜÄ	T=Mì|$­<\</ÛC¬RÃ¬ö¬Á¬%3¬=}³¼ªÿ¹º$¹d¼ä¹DyÄzÄ{
^¶{	w;I÷:©ö;QWZÿ6V.ôNë>ïÛï9/XAÃô1CQïâ¼T¿VF½Uz½W}·­[wüãUÃû-Ã MÞýÇ­*/î3ìHâòxúöÝWO¿¬ø¬c½Û1	ÇÑ·q¯Ï÷*Bn&5­£«?Aä¸pBq8ÑAÌH4~¼©@f2/B«vqåÛÂ,YÆ6{ªCZæ3Ï«Æ)åÍdÂ2XÉè±|LmAÂÅ2jM~Ç1õò©ý	e²¬hF\ÓH¹uLëF¢0-ª=MÙdÄ\Â~ÑK¿¨pà+ªÕ¥ä1QÉÈ÷JF²¶0MkªõÅäûòByñÞ¼xu~\Ë@2w2ÕK«)uäñÊU±Î¦Èws¬ÎEö6oÝBñÐ¡8úðÿWæîûäWWíeÉ6îørEÆÖ6ú¨£åõîñþ0ÁZ©8½]w7±ÁËèùm4Nª0ª*ÝdÅþÂ?ýu_qÎßS-0¥mµèRpÄ:D/|cd°ÁÃ×'ãäÙ¤=}Iæ¯2]gÛ»QÂøx±¼(_þS[WaÌ»Hæl2ÍF4±Ê=MüT_}¹ÚÃy³×cÓåäYÿ|½GÞ[P¬| ¹7ªx«ä=}+6Û§EBåréROvÙ×KJ1ÕøÍç:ÍØZ%2/PÖ½! &ûÖ×ïÖûÖûÖûÖÑÖQÕ1³éf®ßT	×i3îY»Til»÷FmÁòDS¡ÿOTwfNÒO«­cEöØôÅêRÝüøÄy|:ÍÔ:éÛúÙp­óÍ6v³Ü°¬Ú#´÷F§ðÃÙ
³ÿ½ÞðJÏBýV§ìûÕÎù_¹
ÜiÛk;ì:ÜÕçÏÑÙ¿(ÁÜÎ0¹/s}ÿ\¸{TîYm½B~XÂF¼gýW~_ÆE¬bçý¾^~ªðÃhÀøI=MPûe7ýºCÜöÞª¯ï9«sÈ³ä1þôjW'oÆËÓ¬ûOã9g0|ÆùåZ
ÒlE¤ïÎìùà=}º
¼@¯Ë«Q¼3\ÃÑNé(®¤öÚP#øãýa¿ÌDºÕ÷u9ëq/VÔ>·ZôÝÂ]«ÙêsbKºâ=MAU9îvÂIâá±è±Qí8ï.BZê}Ç:xä)¨ö¢³­zAg¨9´ÁMyçY¨î®rÔH«Y= HäGÄ,í9ä<Ö¡D>«×ÁLm	ãv° lfÜcªp³Ö,JKùë%ÂÙCñ·TÃ\-è@FÑ¸í<2±üÌA¨7¿èiQÊð°$syäZ¬«¤²àÚ'¦÷°Ïéd>ªq¾ºTÂU}ëpæQ­L=}ûøëqî¹@Bi Æ4à\êóÜèÜëgá×@KÙèo1jr¶jtÃVlzó¾îÇW8äpfP¦lJS¸í|6Ð¸ÅÌ5yïfVÓ­=}/øïa.´¼ DÇóñ¿"·Øì5Î­$0h0áßã?Ý¿»¿äDG_©­¤ÿh­Ä_h;I±v n~> á;ò­=Móýå¯7¯Éý#{}   ·Zë´ÎÆNÏRÇ½ûV«A¹³ìÖûÖyíû¼9g:&@*!e*$£vËbáª;Vpc,ÈåEUV!4yø Ô#Û%î%i [óX ¢î¾Ù@àÀG!þ¨@ÝIÐNZ= Ýóá¤àYá /Vâ ÷6XH\Øü&ð8ûwâ6õ2@ý Êù.=M+ç-n¢ò|øM/<ýNÌSY¬Ý)z¿¥CoáÎã±	ÐÁïXÙ£!õÜd?¯xðì
Ái;ªäÀ%n= =M+W= ÓÖc[aS
FÁð]NôÝ'= qr(¶ù¤nü«òÿ¿d&ÿÈõT4Þ=}z|ö ¿OW×SMtdH.ÏãRX&§o3ØÜXÍ^ÊMí£W´iâ]NüOå£S£Å·ç÷­ Ý§½GÑUy¹¦ß§/6P0(Cúýb"þ¥°VÙÄá£ÓÙ@¾YýòD{òÃv?EP©=MBé­\Ä½YäýRò	øfâëEEf¼D+gC×úÇ±GÅÿ±Ç?TzÙ¡±ÏÁÕ¯¦ðvZmT}3xËz×cºrÑM=Mc-É©Ô7½wæc§Î»cû¾yfÙWòÆÝÔc¥³ôØf«Äñ·9ø%­g:y^+{U]¤þ[&fÓÏYë«Gªõ¹¦Öðþ¬moÛø?/ÛS.[S9ÛùC/û2²Y£ÎÑ%/sy ¢×ÌùJ­W6Oí\g0^JùêßÏ0í[Ü'ÏÔ>À-¿[ÔW?Y]±ØÙÃî<~ÎëR~Ìf¾Z/×¼_á¾Þê+îoÐñ{Þ\e3K%©¹§íB¹§(c=}ËÈ·SzÔnf§èx}o\9öf|%Ýå¥~©IÇüñY8}Ffú@Rú1éþ3÷ËótQøvû|³Îaá,Óé>BG6Òê}ÃJ|¶=} °öf6õk¶ÌºHgNjÒ{æ¾M;9·é§WèO±Ä3ÒËÒyt	;ù´à©a|Ó^!ÝøûÂÄ
(VV¸ÇÙcÏ>yoçzÃvòG{3Þ£½c×ôíÅé;°OÛGØ<wÜW>	rU]q­{û'ùÝír{*øï?t-ígùWÿ&§]m}×ût¥Ë~ß&>&Õv!b#ÅÌq¢µ|jÍüùÉ^Æ&ôþ~sIµ"]d)uâ´ºvk	Å\<Íÿ­öê½Â
ïBçÏ§mÙIólÜoëVb¦¯éWÇû3`});

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
        for (let i = 0; i < this._errorsLength.buf; i += 2) {
          const errorDescription = this._common.codeToString(this._errors.buf[i]);
          const functionName = this._common.codeToString(this._errors.buf[i + 1]);

          errors.push({
            message: errorDescription + " vorbis_synthesis" + functionName,
            frameLength: packet.length,
            frameNumber: this._frameNumber,
            inputBytes: this._inputBytes,
            outputSamples: this._outputSamples,
          });
        }

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
      this._ready = this[setDecoderClass](Decoder);
    }

    _init() {
      this._vorbisSetupInProgress = true;
      this._totalSamplesDecoded = 0;
      this._codecParser = new CodecParser("audio/ogg", {
        onCodec: this._onCodec,
        enableFrameCRC32: false,
      });
    }

    async [setDecoderClass](decoderClass) {
      if (this._decoder) {
        const oldDecoder = this._decoder;
        await oldDecoder.ready.then(() => oldDecoder.free());
      }

      this._decoder = new decoderClass();
      return this._decoder.ready;
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
            // skip the vorbis comment; an empty comment packet will be used
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

      this._ready = super[setDecoderClass](DecoderWorker);
    }

    async free() {
      await this._decoder.free();
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
