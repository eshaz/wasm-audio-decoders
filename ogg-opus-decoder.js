(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-opus-decoder"] = {}, global.Worker));
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

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  // Override this function in a --pre-js file to get a signal for when
  // compilation is ready. In that callback, call the function run() to start
  // the program.
  function ready() {}

  // end include: src/opus-decoder/src/emscripten-pre.js
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

  var _emscripten_math_cos = Math.cos;

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
    /** @export */ "d": __abort_js,
    /** @export */ "c": __emscripten_runtime_keepalive_clear,
    /** @export */ "e": __setitimer_js,
    /** @export */ "a": _emscripten_math_cos,
    /** @export */ "f": _emscripten_resize_heap,
    /** @export */ "b": _proc_exit
  };

  function assignWasmExports(wasmExports) {
    _opus_frame_decoder_create = wasmExports["i"];
    _malloc = wasmExports["j"];
    _opus_frame_decode_float_deinterleaved = wasmExports["k"];
    _opus_frame_decoder_destroy = wasmExports["l"];
    _free = wasmExports["m"];
    __emscripten_timeout = wasmExports["o"];
  }

  var _opus_frame_decoder_create, _malloc, _opus_frame_decode_float_deinterleaved, _opus_frame_decoder_destroy, _free, __emscripten_timeout;

  // include: postamble_minimal.js
  // === Auto-generated postamble setup entry stuff ===
  function initRuntime(wasmExports) {
    // No ATINITS hooks
    wasmExports["h"]();
  }

  // Initialize wasm (asynchronous)
  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0158c8b8d85e¼æ=M]lGu³õPo]ÐãÞ·£3² ÁÚ= Êöc/ÓZ8s³íÛî«¦³u­Ð¥t"+¦¦~dòR\(nº}÷£¢¢ë¢k}t¡) ,­äÕüP
*øüäÖeùiÝWÍ¦ÖPM¨[æu>Ü(«l'Ë$c¿9ZEúº¼ù¼=}äÍÂý²­\åôÒ'.õt­ÅXî=}~õ"uÊrÁýóòÝ	ÔúéÊ
/Îÿ4ñ3sl¬8mæÑå68à8uNÑçmhÔ¶©hwÒ½¸t¡î¾¾|®½®­ê²
#Hzò44Bv½!;1Û÷Ô±xü½#Ó7(0#,È$Ï#$$GÓé­ËEä àoç7ãoéJÉíï7±çOHAWáì@ì>j_»·ÄBg¡& ºËáPÍþÕâ|óZ5qíê£1(£=Mj»-³;Éb¸mÍIÙãË[@ºk¶äáV9t#wäÔy£óþN÷¸åKS	W£)ýÌQ<¼°ì=}=}ÊÌ@ã¼¤j­@V¸0Wïú!÷ý£¾±²BMïðô=MãÕ2Úÿ¤ÜïV&¸áÇòßBÕØ&eÞj«@ß¥¬/Ï©Ì).ø~|V}o:¶çBj '¯ÅIÝBVU0¦~VBq´µOF#ÑÈVï ó>±w5ooø«òÏ©2ú*Yó×&Øscò,óWû® =M«À3ÃUK£AhV!.ßÖª33pêPÃ¥¢;×òZ¹N´*Rwç²Ã= +2pæOôïÈ5 È5p£µ~ØÎE2¿×zÝêLÂP7]O(&³BTJn6ì¬vøzýOb_¯ëSº [Þá4'þI&xa^ík¨a¨­(bñý"w®×µØg),LèÏþ¬1×ü= àúN(5F:kTçZòË"êþÄUÏa%/Áïâ×*Ï3}~èKKnw][sÆ\3²( ¥o)1|()¥Õå¾!?= Ó¹O4xÙ¨ÌÕÆh£§×w¬¢¾9B{ÍØJÙ÷Âwf«E¢ÒpBÒ GïÎUW¾£ÓYáG»mU^ðÛ7Lôyí¾7Nì?}Ádt|Öñåu&q ýq¶
1#bh2múÕ@_¿8\WÒüáÉc«fU9nvXu¢½Ó
¼ÃÃ
­ýLÇ[Ñbå3h}§SªÙ¡óÏGvä¬á¸²Êý7dóIdÚKpsB¢¯§µ¦°ÂUÓÏl¶ª¾Oyl<»+üs´¾pOhhÑ±»rºøº¼ ¡ÛhFçó@Ñ\@Øâv ul$½q¶= ª_irI+ê%Fz2«
b¼{tFçØÐ}:­-N|Úéûçp¾¦'ØÀ©ã»)íNµ-d-2-Y5{ýö\¢cÃäL8 ÈbSwfÖ·K2 ~8¡>CW1/1jð\kª]è¹â=}S	A³IP¡NT9c*7=MÕÐ»Í~¦yV.&¤f´:C[sËº­¤ãL$%õ~Ñ=}£ºBÓ¿zIWÎÉþpÂchÎr¿Îðm§ü¹C °Ë 1®}êêùÌ+ìôÝ]}õ¨@$íxk= Ýá<û:«dno¥f.ed0´y¯Ê}-{þañ¨~Æa±Ã¡¢DüÀjüÀm.fÌýÅZ;µ*rÝÕ½VtÚi%·
#rÔàªúw«ðP¼c»Õ°´Þ¬À3ÿ; î³¯#,ò¶B®ê#Â¬¢þË*ª¥ô¼dqÝç8jJrc¤X§.ö@¢¬u@¦´'¥Æ%ó¼aâÕ=}¯IñÖíÕXÜ0,¼@ÒkðÕª½GëÇ¤|} õSk³*!eÄDËf 1ÌT!Uµ³®Ççú@QO1ÑxL Üb$}* ásÄú­9ÆP10.\2XV6#íDÅåµfpT)[Éfêùh½ó¡g&TSüÂ^L-_9ì6¸* Ç¤Üq;ÙVN
²ï¹ñ|S%Ø"3ß9¥4ÇO1¾¦ïZ"âPuÏÉ¥ørÉM¹Õùº°'~vÉå ø²ÒÅ¿³Mk¡8ÉÐsæóvºÄµ7?äµRykDÇßÀhß-\­Ù¦Îñi¡É$|¹OBÁb¡5ö[¸ëc~puÏoÇÝU)+ÂÀâµ·¶ót¸EöF%yP÷	W¸<
ÎvQ	ÆÒ= ÐÅn¦yêj,ò¡'>gÚSWè
ïZfZpÌÕ:¢ »¶c$Zöq3||r¦ÛCy
ø½Ùß@)÷¾Ýì:+ñq» ÒÐîèü§kæd{Qî¾B¬KÃrÎlxÙQê×-3·Tù£ÿÇñÃ¿W2§ÖUé#u¹ÉRSa= Ñûzð£»>*lÝò¦ÿdóðºÈMÁ³Ü®âO'ëÔk°÷á|wF SCO{c@Ï	®P2S~Ã<iReYÙg>
Ù:Æa,ð]2Åm-¥<îÀË¸Ô7Än+7Ë(Ú¤ÎjÂtIúý©ùª4ÈÈÜ¦¿s&è¨ÔAÎ2ÍC
V¦Ò°= ±W¤b]xouyKa2E¨~Øz9tR\f>Ë»¾Îÿý´èÙ i³cÒrjÅb;¯Ùàcñ3	.Y]¬Ñù3ã@È¶Ò¤ý(j]­¡·øuºÙþÛx4= e× ÝxQRW"ð£ýs4:x_²3ïLf>òðß$u ÈeCÐÆc-êCJÈ.Tyu@[Ãù2àjd ±@®>-¤q)«\=}Çé$ÔÈ¦þÅ6æØò_ÕøËM_·øE {ðâËÁ#øcªÖí.©¸~FDÅEÏáûê¬ "ÏÃþ%¾_¡þ±BÈiÖ~yôr}J.$¨Ë«¿ù¿Èdépñóu#¨àå¨¨¼¹§á4ÚQ@?¦1D¢Xmª&[oXBí= ABá[T%MG=}GÆu´(>= T$èlD\+3
øÒÞe}f£« :ø}¦gz,z£üv·©¼iç²"i"^ÛÝ=}YÚ¢!Êtë3\Æ¾~ÿ_<Ù_ø÷¥ÌW|µlgT?4yÂ{Êbmen±Ù= -½GëÞf2ââºA4æsäzuãF{®e´ÏËñ,ëb°Slö«o6êÅb87Ù¶»LÏlæn¬¼È4¤õã-¹w~X¥á­½YµÕÍo¬*óÏ¦ùÑÑ£Ò øþ>¤)ãI¬]àq§È<Ó:)ÐöJh§ÞðQüJÏß¼çõìy]¤Cñß¼yüêqNìy¼ 	÷5¢yÝ°áYý¿5ÈQb¾ª.LÈáÊ/%~Ú/ZÍàµkLgÊ/ZË">Kk®§U¢ãFe¬1óQP¾= PñLk),W'÷T>w£¨Nºû»Fj$/«-ÚB?lT{Hqæ·~+cU¯OBPñÏr.E¶Ð#ê¬wâ¥ÎÀÁ~§$Üì²3+zxe±12ÔöAbc"QÃAs¦'
> sRP"hÿZkOO÷?^%àRÀþÇ-S««tòvå{½^ùêFvéÛ~M}×85§W¤T°j*tºbÏ§À#ÏäiÜûÏ(´ùÐ¬gH}RHI['Õj¦TXL|T åFa99ÔäQGå@£÷Ö?Ê>£M&×´Ë°§ÒwG"§	Ë­"'o[÷mT§W  ßÌ"ww*©%ê¢,tÏaSð{k}7êkÜsïÇÀXYs¯Ç³°SÄTèàJÏÓ­$ïÖB7ÔáQ=}k¢EþÅ±J;wAbF´ÖRÓt
1z/nyÔNrV£W<xJnÙ0´æT.L»æ&ÜÈlF:fÒM'¢ÞkçÃèJHhØ']¬Ët¾®vI"= SwhÁ¦ìÏÒfZ}þñÞQÑJ ñ± søcûÝ,GZS¶ËÀÐ,áüDdaN òÎå?·7{!NµFa÷D«³yÆ{S©Äª|§ÐÇwÛp#}]A{GJ!,½DÇåáTëù#7TwQ9ÆÄ³æ¢·3r²vð÷À¥&Îq;û´Þæï«o©¦<Tè+(£¾Å¨Y@áÅ:¾]bhT+£ìP3r#F(³ZØ@.jj¹ø¶á&¹5=}Ù¦Ñï+;ÿãUÌÉ¹ØoS®f:%¾t_"0/»m*þ¨JMýÁòã°HÌhø¡ÿîdÚªøÝcT?^q-jþ-H(Ù\ð¶{ç\qÞoTÐ>- &0|4èo6ÇÈgAÙÊ«ä&¨®½
Ôâ×çÄé}]YøÜ~#Âi9Ãàl¼Ô´1Ú=}»¢ëi;ûL6¥!D»¢´Ê*¸A]Úwâ³vóCÙÀzSÖø î²¨ýjÀT©äSü$¬õRµ[-Výç=}§[ íTFXÐEghiÇKT7=MOí?À¶¼Kp¥%gË­°K§	syPEëêÊç?ÑØÒÛÕx©'ÕU©çHÓ^+= C1ez%4{ëý)Ë!=M4-^¦#S
±hçTï0dÜW5 Âdxâ%¾È~ÓdûÛ«>ÿ'*_ØÇó«NñfwO2Øg6#ã×à¢Ç§¯ÌäØô§@ýW2¨lïSmÜèôOÕðgÎGÈÿÒ¹ØÌÀc¬Ä9Õ±@~ 1Ë1´§â¥KéLÐ3P÷Vsì´xÐ$OOix-¼ðIÈt)CALr¸sG&íXcÍËLîÃÔ5Wp= ÷æÙÅ
M%V,Î.ûDÊìvêK=}R= XÝ*tUïp¼jÐÃ8e-<^{û¿ÀßÆlONGïàç¨,cq%ÜmDTîaõó7tËl«wØ»!)^(õ¡X0ÀUOg2{°WËälüÊ1]G6Wô[1ÔdéLG§9±cWTúÞ;Û×ª¸ÀaÑ6¿}ÑÛµPb#hÔYjæÜ£Uß	ñÞÍSó>c:DeÄù'¿6êEOo ´n=}­øØéÕdBØÂnùA_è¯¾x÷Ë uRVx'ÿo^Þ¬´	µªF1.u@;Ù>ß¯N¨#{,=}Sº,{= 6S_«.+®7ÀnR´#ÜÞ2/íº}ý=}¥ÀæY¸È%¾	PNùéÎ6PuW÷ßpÈPL#V÷gUã!Ê,{yÅò¯ªÝ§å·õVuNÅ¦'}p{âzæWô-0bùN}ÃÙç'qQ¯ö= 6	â;0ØwÐ-¬4>Æ9=M³W{Ì GjU÷S;pP³@(%çE7Bv1É9B~ÓÌkÚ«9'µÊLn&ÚæfÀøÀôê1iInj2ç÷M~X2=}wÚÂÖPÄÀWk3ÑÕãóù5çúÒb	vEÀëÀñÛP§VI7V÷Ì©ÜñQ'ìqç Ôî÷ºnãªHÂM±X¿Ý©Ê$¥òf¤x4f?!·vÍÿß¦ô^ò:&6¨$@½0$kVOù0»D÷ZâËòýÖuxV¡íRUÜ©= Kðì4@Z1ï%d,éB8ã4?ìª{ÎoP'ZG]7â]ÖøªÔßÐÕñ"Èt»åeï*Ëñ²3~>oáôºÞ´þÌªpøË\à<½ÅKàtÄHqpøR|ÒËqU|tm£ >t}×ÒÉå'ïH¼h¿¿³ ½èÞv+±0ed]¾¶­:¤zkóÂÙMuHURC!_0»O´ôøüÁ¸¡^§WADþîÝV×WÇ½ÍÊW´)ÊA´gÌ¯Èè-¸ùøý«pthRÑÞè2AöðßÅàû·NÀi=}·KäJßÖLCó¯s9ã
x3[ÀÒ1õ¿âÒå¼%Jsç|Íp¸Ð+ÝÇ¼7nÆc~û
ìtÉaÆîF=MÚ.ës _&iÇpHÉh_yXÇD8$DZ®åç59Cª÷ËQmÎ"8ÍwÖ¡Eé%ùGjØ,kÈìWxò«Km«1ÚM¶É» *ÿô.!t
n|®\= ^D'%wª1°t-J#Ç7ÎÑÂÏçjwÄ£<¡,ÝwíÈ·µw´æî!ñ.Êyk¯ÝsSÞ7¬SV.²3S$la&3íÜ±:[®@vÛ\9õû¹õ·JöÎÓtbß¶#)Ì*%{%ì³åÚ´÷ (®±º¹ÚwcÿçµQþàN.8¬uïVPlç·Ñv"øÂ²xåÀ%3,]>VHf¶)²c@m_Æ»'aî6év
àýðHÒ?7´-U°NÔ	÷ÕqJÁ-®ÌFfîöÁ£ÀKíÀ:®ø&m¤8É^JÕ7.Â=}+	ÉññUlÂ&Äfõê_ÅaUF×ò= ÷¯ü8ï;¦C¯ÿCa@Ï"=}³«·Ú+^VÈ®¹0=}ø<í®î7t´{Ý%ÍQ9éâ³Ã¸Jªî®ËqR9vnDãôêN2~]Xn®àÝ.ÓÑ¤¼:.ôñc0¡Qy_ß3= C%[p:_MZ¡ÁHÈù-ËÓJx´TåÞÊE8¯= ÑZ= 0îÙ1Î:¦Ä3ª¦(ZçÎÒ£>ê]½Û¼¢±÷$Ì¹>o6S¶ôAOí= ûO>{1º¸ìn0ØFèì|Ãè)ÿXÇ/ÈÿêôX¼+³aÐ~ÐYZ~p.Ç¤W¢ù[vàt~ÐDûcÝÙ	~3»µ¤ûmJ,À
kÉu´9"ÇÚ/1wQP­"YÏz²¾~Ë¦! %¥hxÐDÔ&÷t<S4OüW­K1v¿-íÍP|±Hãô]UÎH½HÆã)$Êà¥y,K&HÿqB@MàøQòË}0SÆn\7«íÛ3¤Zs³8¢È¢òú¦ÊÀ?²8ùÄøsh(Ì.ÈÙOé­
Ú+Þ|VÕÊlASdéùÞÇvØ9@xû¨CMÕRþ@=}:GáæÃLÃ£°ü·Ø4JBä(«KÂ)&ôÛ^\¬îÂM>¥oIóÍ$½
½Kèª}yå.ûZQ±ÚÏkyìvìÞìËØóÚq¾í×K#¡{ªÜ9úø§¹/K]ÕVÙó©"w²;Öûí%= B÷ !+¬N&/%ÉîÊ-0¢ÿq
G8'QW
XUâ?Tg{-=MmYÇQ)¦ õÓ2©''ÆÍþñ¢üH¦þ¥Þº=  ¥Ë^!Ç l>íU>Nä¶¹ïJg¹VòHÕ¼«¢h@8"dp½n5m]NFð&¿|Ô¯2Z9×ÞVsöÀ-û±«cM¤£= °¬§Î¹e<I&ìç6\°$<×¼möS¨&	ï¢íj¯ÏðoÚ§¹T!Û ¶êÙkôP"£sÇ&ÔSÊl6]GBN¤=MËí êÕ:´ñPS·×Ã"²ÇíkW^S=M£³ªúè½<©ZÛ/y¡·C§Ü§Ä9üY#ê*pÙçÉU1ÿL7ûWGQá ÌE]Ù¦EÈÂjAK,DPói[y@×³XP±,jFº?k3y[D\VKø¨ST5
ïøFÍrVn^ºR=MKH¬àí\7ØAÎFVþý¯g¢~gx1W­ÆëÙ¢­GÊ=}R5ÈâõÓh÷øÌüÈÝ7ÚÛz.²Ú
.aõ7öÙ3ÚbÌqÀbÔGBö·Z[ddTòK	ªE;ª"IEö#Ð®ÓÍü1Ä]lwü0ìLîQgÊJ]×-u¯¡¢ÊKfGºàP£¼;£öV÷GnömXï3¸Ô´ÒôÊÁ_]ätxPæ?Ê7i½vx?"ée2U¨Y;{+É=}ZÒÈêÎ{ÔH¡Á5ÉâLP3{±1ð:	Ø=}G «.R~ÜP­±éM=}¤tµKµûKµjæâG	6Ù³ßpåç6tïÀù¢¢i9³Q³{/CÆpæÈÍ¤¸¼ÅgÊáVÍ6u1u"* ±ï\î¿kª.Ü}'¡^5«tù=}<RÜ©!5¾¹	½?P#üíôÜ¶/ÿÅ_Ç¹Pëkó¥±EI+IÿËÅ!¬ßx½±Qä~þ\= ÃÍÙ<©ù[9kw?8i¥üH««§}ûül£¢
Ô¶Å¼Ëù|¨o§Î½yò	¨Î\ï¿¹éßæ4IçbVY¥	OMg±(gabÌ}gè ~Ý±®ý0<Îñ¥Âs[¾(BþWãÌ/åBb:P2JU2=M(}îxn|q9°bcÚÑä /óÄmállªÿ «¨¨(Hf¡ïo Bì <T&4ÃàÉ9ËV¿OöGQ'$1b3»= ñÔq£Ã~dÌ¬~GNe«lu ËìZgÃÜ£gß=}¹Ìg·NÈ=MÃgg$1'áé²sñjø©á¸*qìCé6ïV¦Å1ÿ´¶	¼ÒÐÁQñ*ë°TÛæJÜ¹íý9ÿ/Ìo	ýâ0,u°àåpA:{,´*&hÕìÒoéCÕò&iRX)+ßÉÆ¦<ù¬ÁÐÈ;MÖÈaÛðtcn=}.´zÎ3ç5_órÞ>	¸eK0i0e([3d%»ß¸ºpòþ¸³ÞùÑDXÄÄpòjz²ç?DÊ÷âûÈ¤ò w1^EÃ(T~¸CÞùÑÄ_d%»b¾pòÎÒÞùµÀNXûKÎ~5< g)9i8<ÂW°zþ¼æç?4ÅÇ+	¬ÊGdîZ=}£N#"ö²¯_tDE1³üÊqª1  ëÛ>¯)OèÙÑ² CÁò­:¤Ô+I÷*¶¾s¾Ue;ñhAÂgEè©ü.úl
¥Ö= Ú~±+{®Y Àæ±²  LB§¸
Ïú¹þD7 |hæXWRÊËé4394\VåïÌd~¬ ¯Z¦¾dO/Põ¯OS¦ûÿ]nàûùÈ¶³.
ÕáR¢üW8ÓVÖQÅÔR^ÔÌÂÆÇ¶\6ðw±P®ñrÇÉYÂÒq"° <P>×E¼¼A¤öáR¡>U#úÅ%³ÚÚäÔ:{sæ«ÀÄ4ÐÔP _¼XÈ/ÊÐ 6sÞ$Æï?Ð1
ü,5Äq¢ÉÃ= 4úe6ýñNÃYÃ·Óy÷AVÊ¹OÃ[®©Jl'>F°XpÀä]Ï¶àñ§"ôòVVÆ)Ì±¹l3{þQÑ¶þ
$fÂyÙFÎö*øå«Ã¶³Q©N<y*;=M*è¨»É ÖàÄ=}©Â)36ïAf×nhÔ² ãÆöP\¹:îhsÅÚ+ÇúëDÌQõÄu«2(ÉW»½YÒ¢¼V+·A"51­Vïx7öé!@heùiQC¨2ëúC¬6ÍÂÀÀ¼óEÒõ5O±PW/Ûg¼.0µ{LuUÚ­û>ÍK{ëVT÷õ&æaæ06m³M(#[éRªêÒ6DkÁÛ%Höç²%#­	³uoýcNìG'[©[Ã¸Dæ¼¶õ=MÄ Â¹^YêDus¢8°c¹{îfió¨¶ð(^:âæi{m\vÆl=MFzA6L­iýFxÊõ°Ös	Sàöv¤M fü@Ð9äE¬GNA$\ýXj	3ÞùÑÄZd%»¸eKðÚ5d%»NdK0d%»¸³ÞùÑD00ßÁy;é­|ùéT2¨çÅØsÞ>	#¸ý¹ÀvsÚqÞ>	i°'c%N´ èú;<æcýüOÕÚ«§ÜþtÎoáèí=M Ûµ¤>Æ'kBiÉËFrgÈzoÕg¨y%!y¹m Õ¡¦ÌÜF³gü3éßjÄå³f'ir¼Ã'NÒõI¦RIW'b%= MmAëÕ[ß	ÂÇHU+éÝ·-.zo <máÙÀëÑ¦÷59á¡< !\ùAãpäaÕzl0ëJÃGY~ÉüáîCFBFAò$Èxúâx= èxYéxáý@òüèÚEZüAÆåFCvÊol ?ÚSüKÏj?u'EÕ²ö³Ñû5KÒÃÑ6Ó×FW;'Â[{I8ó"" $ $  $  à§/ã¶bþÇ:Ø<½,ÔJõµÔ¬Ë9ÖKTÞJÚK±È½Qtc&ÿÚ]?&ÚË¿Ñ¸Qä]¿öÑ^¸÷²¿,^zseÕ· H'ê¬_G'ÉbÁÓ~²@ÎÍéào±îìÿõ·ÅÃÂuÃ¿Dâ)¤398T|uEAÿgìrô°'¼%éÿºvtKZovÝYµ9ñaîÒs æºÅV@×f¥Qù_-+HîK<fkg)É>_¨Ïè:,mLK­ßQÕ­ÅJQ²sI®wÅ&;üF¦G¤?5¿}ÍÄE= ¬Úaû2bë3õÂ··Ð6¤©Aâ5D3óg'®(Tðfd°[Í'ë#¦î@#Mv ,=Mâ¯Ë QùÒE7%ücÕLV=}Ò=MñPÚÓã¯fÍIwfMÝÛ+Ú³¹UÁ3´Å¶ËïïvD°¸×¿è5	ÝÇ¥Ù«(qQC
2,]Á+Øf5¨_Ö°[Ã¦4QÊ4ÑlFÔÃÈ%Oav}ÇÓ¯^±ìñwóüC0õDbv"æ¿Q'"¼îõPÔ
Èò^àçà=M'99ÒM= AËøGÍ·5§
díöSª®ùÚå,ºù~dÕñ0v|NªûºõÇ%f ¯s]l¯ÊÁ¥Í²ÿýÆ,ÀÁ¿ÄæM¾ãXIhÉ}±(ÊyqKHòe+?7=M?úúq-1ôåO¼Rí§òËue9}d9DÌØ	5±û0[°ÇìNp[ähÎeª*ÃfàZ¾WáW¥ýwgeºîhbïñâ»IDÁâÂÝú|¦ë&¶3®>Â²yææ@m=MT)V)Zy ÕhlùKaçÛG\2é	8p*YA¼g£T±¬+a*Ó¬q*ÈDýèÌgÌÚ ä¨TvSl4zíÜ^éòÆ\«íÁL¢=M>ÒQîéJò³pOùùÓ7æTRì¿lÈÏ÷³^x@ùÉA'¥5Czvì:ÔVw×xv=M?ø3V'¬uç5úYª[b<K©Dø´=}Z B­àjß­ßû1³1¯ÃÒ$\÷
&[ÌvEõ8!ü²6TcZ:¨1\.=M»_Cí!Z ­}Äg ;IÖ:µõ)u.o$[p g¨#»F¾ÍØÏs#R@õ(ªGñ_ÑGÙotÐc8	É´(Q;­Ù!ªnÉênûYÒlç½£3Û_J´tOuPêç.§Ö?çK^&ÃI$)¦aägkãwXM³uB7ØW z+}u8zGØ®[_Û¢Ü(­÷§y7FQ;QÆ[»ÅÝìS1[û·­ßXQû= ç6nxÇÌi¦¸ë!k9ü£jqtÈÁ~R=}_è@ßNçz| cíÂ·&!ÈÇ¿£ª6}¤	ºÖÇTQ1¸ÀÞZÑ¥hïý{ÜlXj÷pÞ|¶í/,P0l1»ºÖvL :gíSÕs5~OxÍ«²) aJ¢= -3ÐÐókHóG¹3Â'³±C¼]CåB0j#¸r¢W¶	ÌØ!4GnøÛÎÞáÝÊT2ÕlÝzèð^ÇöuòD\ä³ Ï [_$Ü¸Ö¾û¾ÞuG¼ÀªÀ ñÕ.DhòÛëhsññ7¶µÎC»oàé¿w(e=MÁ³tª³\°Ýªù<BÅ¹ÎÆGa=}­$9w~d2Íù¿ªl-ìö·©Ò¯°ÖÍ¹Ö4^LlzÆ)ÍG%Ç·M5RwÙÞÑâ@Ô= ÷-wT×L³VRGÑ¸O)ÛÖRãÐ,ÏÜ6WÑ9ùã¼I@ÞK»Å{'U M%ì:Ã)°#1²  F´¥:«ðe;n7<Í¹Ô§Jpv	ývõbr^wdRO±o2ÿÁgØÛè/Jð[UÉë	®T	¦£¬4¢ÁO¤¯Üè'Þ}÷ö,A#ÖÙîßf.Ûdî$È ÍS8®õy_ã#X¢#â¤' ûÝwx­ÊçÑÜn/òTé»
è»út)lTÞã@äè{G¢hoì.dñ¦PÎø-ë¤nåþsÁF *õîâ ~ü°õÅ|¿M òÅáb¥s^9Ä	Ý;Í¼Öm·)zìñ%2:¢ÊÃi|dPzÏår¶ð¹bçðn´ÝÁ©üÿ¥¤Ï<Ñ¹¢ÎãTì|o°|	R6M+AÇ¢ù<o­áhCç
àh¥à^Ã%ÄVWö·MÑ4â·sI1]¶Â
NK­¶õê¡l¼j4fã¡ÈÃè±³¤MèÒtS°&U(ÖºCs³´
Ô(ÃaCóîìÓ 0¥:TÚä]MSÝ¤Ø~³*Ã$UÚç-Ä0kD 	²°ùÕisìþÄ¡hOÏ¹v±£a¥éÎ[´P
 D+8ÖÍ,óº#}Up\yõ:øBlçôÐÌ#ýðò×
Ñ¤j£àaIøj1
!HVRÒÊ;Ó@4iµ7=}EüøÒÎoæäi5
Ä)Â·J:~"iÙ®ßóÓK<Ïrj¬7{~$ÄGaqu7ØæÀ#¹WgN¡³_]Â«áø sêön*f.º*'æpiçáÎ!Z1zß¤·Ö)vµ¨d(xefX@4ìtj;r ¢ßÁßP<­³_ÂÏçÔh6a¯ÍGÎ²ËG\yÜ5ÓdÓ]=}hÛMüs!ø"¬ÝKO3é¦!-E CÎµ©&'jûRp°-Êþ(>uÐxëûºì¤:ìãRu{²ÏËãúå ò®#9¹Í_%»RÎø&QY
òàb)à}]Éa¯2Íßç{ÍÖ		ÆX@ÚA«Íc[lèk3wQ<ö»Ù¹ç­}í;Iòv{Ûæ'Éÿßà­ãðí¢yÔF¯Bk ß'aÄ[÷æa+wmO§	0öº¹i'ú]}ÈF´¾e±©$uëµ7:b	OáKMµûåõb?YìT5¿ÅÞ6ã_OÛÒ¨@,³ÑæÏ5¢ÿÞlç3ù­unbÒWÐó4Çë±ý3ØBN¥#Ñ'ÅdnoCÒÅÈ	vª°Y¯7ð}ñi=}ö,ºp´j&"'èÞKKe¹@1©^/Y=MY£¨À dý«D2ýyÔOª5 ðG2âí= 'ïþ¨.E^\âãMêgrr^¢Z+'uÏ!¥èm ?ñ7$ùgO0^K~4©ühmv½Js=}r
7yÓ(FsûFºÕy1ææÂSÌ5jRçÛUíÕ-¸Ù°séÄ¨bò¬ÌþéhÅf©é×³°Xfùþ^ý^3>úû£ AØ{-qaM1âq®Tr¬uêÑrGèå¨ªn,Fxev}å©(&©ê6µú;z]ò[#àÃ¯ßh)h%ú=M³2.i-Ø8ÆÉþxº(W vàtßú}©Ú%&&ÙíÃi#&]ÑÍÄXJ9þbÙTº5e(ÂämzÈõûTj^ikÅæ{ºRäðôÑø³l÷ ZÙÔ ÿÌàÃ2ÀFÞÖFèÐ¾ùEçÂ!_3æ
EÇK Å+]ðZ2@àçu{}ØnM­Üñ¦]ªÇL/5ruÉ5ù¦¹6Étd<l = ÂiÉÀØ0ÇuûúyQÒÃ!f1lO\vÙìv,×@és,WÃØUþ]0MXyâ0c0%ãMD»c8ØÇ_HÕ*åXßRyp¸ç®Yn%5\0[oJX9FÐ'êCX-30]ë±¸íÛË#NE2ååHòñ-Îë­= ·£¾iÍÀµ[EE¶\ßvCÜ^íÏØ®é"´MJ²lHjÙ/Åu¬Gm¬û-FÙè²¼ÁC¶2î>#fí.hâ±
ÙïÉhQ<\Jè]bïóz¾&ÐÄ * 0%Ô4Ä_I8<yFü8eÛùD ¼¤Cðî0j1/'æ0[
¹­=MÿÃFfçtJq>Þ@èà>þ{nÝw¦%D¸°Û9ö|ÕAÃÙÖà$ç¢°ý ­,RèÛ>ÄW(­ôQo$wfã¾SÝw'[U|ð\ôN«¼"ai°ñ{²k}¹mñÂmÑð©æÓH.é°á= k²ìüýêô«ü?+|Ñý·l_D¬£ÔrÒ-°ÅG¸ÀÎòxÅÏö{ê.ÝìÊ#
ýûßy9ÃFßÂ²±þlírÜ[FNrñî}¬Ô§Yp=}rÖ-mÂ~ïTÑîÍm#Ö¶ïç]K&)oî¥ ô3Ò4Ëa¢©úd;ZW}"@à@uv Yçðç$=}F¤Ôi	ûÑ®?öåÍ;ØÀòø=M°À:#Þx~«÷7üÙLm#¶RìÝ¥r%qiáIx¡\5=Mìûk,)ÔY=M­¼+ T>ÒY2±ÂÑ1Eõ¦j)þ×Åî98Î"R[ÉtÆ¦/ HZÅ{$2_¹ã	Ä¿DÚ¨~[èÜðúæAàè©¸ì|z¢ö¶xºqWkÚB@Âì+dÌaÉû/ÖÙâ4°êÌ9°VtÏ[îAºyÅ;¸/¥ºuñá"½ïÝÎ­À_}.uòöîYTá¤"MÈp8k±ýzqÚ.}:$vò§?¶'¿Bné¦ÙÌJÜ}ü³ýæS§þIj[úlú£ù6|ý1©çÌIß\ÿ³Å60d|ûN5·Ó¯AìLR»¦ôo¼TwUI¦¨{;xîtNDÓrÅlÁÿñÑWJoþAP&Û0ÉtÍó0$õÐJã¥ ÒZÎ×Ë(¸ß¯íåÎk:×5×ærXcúûF5a2»Þ-
TwW6¯ÿHÔo®µºÍµnõ fK¼r}¿Y®Jõ_?­Ñ9e®ós×z#îÄï¿´6íÐ{q´¦yI*xOËÏp*; yàûþØå¯?ýÊê@¡ï¢BßYàF»áJxhÛ9ÞªìÀ]zq¬Ê¸Ó~¢l70Yª&ÔÂ½ñ3×cÚl«¸>ØHo'\×\×#|P#þÚÐ~PãyP»ÔPHo³÷3ãÛ8Ç¢ÚÑ9ÛPàìÔH/ê8çzVA½f>V]Ã;iDcbâo´Â#sGa_Â,
~ñ¾Òf>*?n©,TQa?íëd¦Hqj,ÐöL0SÏÈº9hnõ¨	tÖ_ÛG2¶ýýV°.®;¸ðëë/1½ÒôëõQwªÈ-¤3¼Æ½èÞëÝèt}·õÐáÁéÆüÆA,Z#äÉ	ÊñLdéTË£0ÆçaÞá¤|âôü1Hasð|8?8oAWh}(SP%79²5ÖLß×Mù5w{ù(Ux«:¶²Ò¶:$\%ÍHK³´K	=}ÎvË¢»FV¤5ÖuW¿B&C§ÂÐ"% «}¬;©°Æª«iÅr#D+ m"UÐR	¦?Æ/®a¡Ë~¥oDÉV¼cNS @öî&A³¼ú½~â æÞáyµ×s*°¬læ¨âP°ÎåVf¾#Z7gD²(\Pk4£}ºSPî³Å×ä'"ZaÒ±A¡Wr+þiì½Ì¾½ÄI3äÅ^¿½Dêåh#'ZÓÄc2*J!¨|)-=}ä&ìØC=M£-ÑM/ÎÝBÍzðãûæ= 9Í¶C3úµ8t4®=},]®ØIyeqåÇq½93ÕÔU#çVçÛ¹=M2,J² ðf_vGHÃÞþÃ.^ë6u$YÁ2ÁhAÊ}èa*1]	²c%ô]²Â5ÍcD©Û²úä0Ê¥)Cóå¯ÂÁéjßRà&Å,,ÈÙ6¥JcIGñîjå_ûûLÇLh§ÆIpD>RÞÎ³=}:J±Ò²ÊoçÛ= ¶×Þà\£p#!&ÏÔuÞCÙ",ä{©3Hõ¢Iöck½6zÏçN_Ð÷ÈEXDs«rÇPbô&¿´¿J¬ñ@bd *H-p7ë@-Þ>éPySß©Ô#°1J¬)gAÌ@U>ÔE,§j]$límÃJn/ñFDÍSlð×l[:3Ü=}ÛZ3÷°¨1úF´ûÒõÝB	º.NÍÖ-ðAúÂ¿mC/³¹Ñ6ÿv@±oö¯Ôå·k-
;_×Bß¸åöÍÝéãÌ\K¢"ÜÃW2©u¹oä@Ry{E¢#Úu§uÝÞ=}Ñäí]KGJn÷Ü³O´aÏ÷ H"g³ò3Pê+Ó* v
õ/´i-å+.çTz§L nKá[HpNXXÙ=MG|t´+¤cëJ[åý]Æ»B~!Æ¾´½lÓÆqßIcâCèÑ¾oïªÇÊ "û~úÁ(×-ªTw§öOú&°XA
3ãeèPû#¢-.êÅØ$°;Ä´Ö#[=MÑnÂê%-¼¹}çgÂ·½vËÕªé|ðoìlâp_ïäÕnü/ ÍV ÊR/âmÕ"PU¤h(,³jÃÄS4W£]¸t	lãG{4´*7»rÊ¼<rqm= m$¦iÉuBkK{ý:Ë,(ùºÊ»WF®²,)¥ò¡HW»~ÈàwåhÄÊÞVº= ½cÉUÝj6×é©:ÝW<èÓíJÈ]¡ÄóÔtÜu$;¤^%sújf´ÃzD[)ùWDI&0ü_Ó=}Î0Ê[÷ÄzK*RÊ±(Òm{é¥If%p}o¾Ã7öTö9ALY$@CÔðÔ½a¤ÑÊI £5%=}míAl@#ÙÔkÜ4CYÒRSãÊQ?Nµ§dØªäàÂ?T<£MâRàÙuLM?-ÆTMBwÎ^Ê×Kï2ÿ^AþtL =MÕé°*´¯@\óo1½Êy¢ÒÎmg£¿ ¾Ñé¢©´óo4U=}ÙjÈpý@¨¿Öé´¿îÞc!£ôJÁ6aqÖkyÄj´=Mx+ù«ý)ÖGNÔáå\ù2Ä$®éìî\ÞTîÖáej¾ärs3ô#ÌbË¸ÿJ¹,]|nj;1ó·ï³·Ò=M²¦¶ý¡ëyáNå¿#çRM
O¼VâCDØZ9=}_¡|³ðöµ°Èã?bÆóG08ìßÚ«í«rI±Äf4W- g¢Æ×¢V*+ªââÁ1¨ = 4>Á£Bó¸0ËúOI3B{ßÆvÖæu]4sêÏ0ÕÞ6±xE°@Kû>ÁSíèqÊê{Å£âLåc¤ÂV¶ùKzûª)4»üqw:B«¢<ïNº¸ôÞieX¶O% ¨Äé= ñnãÅ[ë·°D'{T®\«mÚW[!!s= °mÒ,\¾eÖÍ{1ß-K:Ë?GQ2¼àÔ½Æ]D#tºµ%ÆÇ|m(Ùù½³Çî|©ûng9R÷iÀÏãð)"§pr@0ðGÄ$×ÓU_9í?]P÷øåað¼éCÞÂ#£9¥pêP+åxÆáGyg¾ Ãý'Sü§8ùMêFýô3´pîKïÃ*#-ößÒéY¡|¸­_KÚËyDC$oFýêZJ¥ª#ÂêK[^F6½D 	¯/Å5	_Ðñõ¬ÓD8ê}×¦7»TW}bë öíØEc,ßõÚêÑ6¼îÄO;iYÍWvsWÜÙ®1û×W**L£xl
ÁBáþáw³F6çvUá6@¥OÍÊ#'´R IÅs¯´®U	ö×2 v®	ª¹-í[¶äí«îGÁ\ñ¤Ê©öLÝÂL»Ó)Ä§õ62q£GÕJüÜÇJÓÑcÙlÖ¢uXNÀØSÀÕï5$~t¾,¯í{-pÔN3"ÌÀQNmó5]½ëÿ¸¼»7ð*4Ù².Gaû}Ïn~§OdIq{ÃUÌ<ë ·g'4È,(ç ÞÆ=}Í)È¬Î=M9½òQ¿b¬*¾JAô_Å¶Æd=M©þy«r¹K7Îp­2jeI°ü¸@ä(j³ÿæÏ£Òc¯(mË_²Mç-.fãzæK'ÌÕ6IbsäG­:9FF{"ÛèiX.ÇÎ¸ÿ2®(G9=}Â¡³þ^À<y%@±ÁTÐ±OÊ¸n·=MÂÝ'Ã-vW­ÔV¥.PÔ3Í²d{ÝÞB³^øÓLCKÕ¼Ã4|¥þ	Tw"MLÔLBLvO?ûOû?û¯nú_Wâ3CSÉ4m~-¸mÑ¾&æ= sæ8áê'+P|ÿ0ÈQ<Áã{=M	!Hs³«ëdÐ/	¢¾3ÞH<|Ü@¾­xLa%úò,FÍ÷-
ÆkÆÇ7a6l!ð´}Gó5ýß=M(#-n.-w®ePi56)ÒÕÔÄ¬J	¶J	²I	ªK©®xS:la$ÓÀ0
[ÄøÂ¸Í2´?¦¿ÊùÞ*ÒY{¯tAz	ØæùQsqÏÉd%E»4yìªðâ_J²à³¹ôæùQY;ó4;l(æLé/e¶¦Céäu¡£º_8ð¥1:è©¸lþP]>áê$ë/KKF4-Î*QEc°+Ç+<ÂC,Ë\0ÇËdµÕñU×®7lµG=M¥©NììÁSMKmöSÉuú{·ýL M L8A¥²üÁíðI(íZ²:k2:ù°)¿²I=M³	±2Äa'EÈÎØ}M¿:/Æ!3>)@ÞÝÉæQõÏò³´:aõ ®¦Kóä£.°¶Å)3*<îzHã³b#bwB<ÈDãuåËr-ã/þ5ZPR-àUx¯Lý)°yË;Uõ'?Ú@«®uç<¸FÀçTö)r¹ç7ò4Ó9JdÍ1~i;GäÒ<ÏcPOkF&×T§d vN7©&cãlKµõý?²1XÕñës3LöRê«}1¤0´±dÚè6§xÑ>°Ó!ª®wj³ElÐQ­TÔâ%g¼¾×8õðlVFä¹5	æë³¬äQYòÔJúgJ(øÄIª53×vuûP]¬âÑñÆmÎ-JçîäÃvçôÞ5|>GÆ:õ×Fý«"Ýï´6¡Dó1ÌÏv
	Øô>iêVèè5AH>F¡t¼ºÚåÍ¾æõª«çY~ñ§°Q~ÚMçÕºÿCx= çãÒßzôVt¹«ÍÝ= ÕE{D¬0AMæq÷V{DÄV= s v¹?ÂsaPÎiÎnFpÓþqûMñ!hÕO!Ëá×}m¿<÷oÞt=Msº¯#æêã;Pò1\Ù­dû±Þ)­qÞv>dì;&?¿xDN_= PÛásÉÈ«l'âsÉ;þÆ4lùt,¢ù¡1µÌxÒ§áV5÷ÃOÍæ(ïª¶·"L Uä7S¥{ê2ÞvZíÿÒ]¾/Êýäìg¯q3Àì÷\K±¢g< xÒD6ÑrG\dVVçèmÍBþO?º.ñìÕ*:Ó©Â"SÒÈÌà¾~Eøì0vºt|é*úí2 /ÉUÞÞzyËe¥EF0ò¦ó.X¢<ì)=}ú¾äz®ÒÈ³ôÌ&;»4gÅ	Äúîõ· 9wBìòPæ§EâãwE]à²ÊA«g#÷î>c?PuËG¤D"s¡B&$¥(­fUz(·µª»X(ýâkÊpµ9¡ï÷,)ï
ËÛÚÖ Z7LàÝCÐLË§³LÝ*~äI;ð§ÛÁÉoÞJÓÐãlÊ·¾¾!¼: üäSûß&)µmuc0aU¡ì<£l}Ü¸å:¾$:ß¤J4%kTZRæÑm®8uÿÈ8vÂÁÒ/q¢âÁAh}+zgs¯°WObÍ7ÊñX@
P½F:PÝõj¬= §hãÃbRDt¥d¿ªÜ®A±F\®Ð¹SL2¿Oÿ ùEkøí¯6¡aãh{?gmU· ÙÔÂÍtS£À?å°±TJëÿ³Åyc¨X]DxÙ=MÏÑú"}KíLX ¼®¸YìÑÊ´#ÊGÃ~
\ õr¦¼©A»zok§äÿ^F³+%ËäâyrÌ¨$_:)WDº­¯sówjºXIÌ\õóà]/ÂcÎ2 .þÚjæ½uTÕiËîb³ÖÇFÙ/ÕÁF9{[EÑP åe=}QòÒ= Í1 ]SjúupFnÛÌnkbÃÑ!°
y·îêUìÆ0KB£,Å|üÊjl Ýá?Ê®Z¡í²ßÍU«ï*øCèã±~N¤DÖA 3=}eãåù<É vÑ7ë¿GzTDõê4ÛTí(¨Ñf¨ÏwF\DRéw%,s´Ò¡ý²càí«.6µâ]»ú!^2/Ä@ ©"Á²32üî¯;ÌXtf2R*¡Íü×AÏÔkêÊÄ$¼y>WàË÷¤:ÊÆUi®úåËÇu Êî9<Í¥®=MÌ§½î%2l+ã t±:½.fµËÅùå= øÉQ::=}Íi R¹Ó=}¥Lí½'FðB8§»8mûç³SÄÏRÍVöÒõ÷&J?_ª6Zü7ýd¼aä9Ú'è/ê{´ïÄÍò«Òñ¹6í:ã´Û/ôoµÔßëBnþH:M!¶!)-x%¼3.9Û,ËBõ¥/æö%ÜÄz ßØzÙyëfõ¬M Gs8J¢¾ÐûxÅ?%ÏÊî&«<Ô¶3æÒ âf yAlhènîÈÓZKõÍÒhò<4ôËý»ÿtú$&êfÐ½{´ßÕÝ4¼÷~¬ÀkûfC\/kòxó5ª¥®$½ÜÜ]#áÀÚm#b	ðÃ·8ñÝ/YK÷9ÿäîpå¥gUOG¤È¹Qí8íB¾ÉRÒXO¿z/{/n(ìÝ!óî¸5=M_Äí»H¡æÿiVXî6¿Ü ôÆøN¯õxs=Mk;RùÉÍ´"õÂ÷7év-­Ø½1¡Ã;^¾¸-bwÚ½6VÑ3ÉÆUë¹uJørë¸¦ýßYCÁ	_Ðè¨6AâEó\Ór9LÐ¾iÃuÂëH
yãxt3ËºOOß[°wÅG7ê)÷ðrc-ü¶oMõÎÿï¶³Ñ­3 ¸x,åb%²&Ywp)£ÄÕL-ÂDå_Qàð:Å4©Û¹v $D&è ióÂ¤Å©ÒÈÌ#ëDTIx¤®Õ1¥	IWõD3çVtç¹YÞ/´á¸÷hLÙY-ªã
Ô¬º5N$ÞWÚóÃ=}å´­Ãî¼÷þ#K'»'JöM­1*å}eQßÍlÇ¼_+ÁÐQìì¾8	Ðl:>"é§³Úßõ¬÷	NL>G¤
Ykj¶seÞ Ñå4N/'ë×8z2p¢·cúñ>k,Ãº#9¼}ÁîÏÂglWsJçÉ¬HW<_W¹¢%-ï6ôÊ¥ ÎkÑ0òÃ0îí½¹zÅþ-[ý®ìà~À{J¶jÂ¼Õîðöæ!)GUÊÅSÓº_@yQ% ­[èTôåQ	É6ÿ*ç¤ºÿ]WÄyé ï= àhþu¢­íÜnIþhÕr'/¾Q©÷yDõ«Å®}º®Ès3È®Ö¨ÖW2= ôñ)¾-x;ÑÊM_<²6ÃÅ&÷=}ûçÿ\6³bÚèZáò&ø5¡ÖI÷ÔL¯*SÏCÎOb­ÖhM1²=}aG4B$ì¦cèû7Iu7Ihª£×Ñþ<#Ö>)wS"AßÎçp-'ÐHºMÉ^KRÁgúLã-P}Ã8EAã-Ë@hU!)LÆ8qö);A±Î'úÎwçD2¨~N¡ÓÒ/Æ¿ÏE16MñB{N¤Ý°»¿ÿE1BDm7Þ²YòRwû¡ÃvE¼g
£ÏWè¢Ëå<0#Ïgeé¨Ãý>Q¢Toõx_¯V+¬sbÆgéÄL:JÆC²úÏ¸êç#;lË#W7r´ êïËt£ÀÃìÆJÀ³OÐ ¢½Çúò= b:z}ÇÒK¼$jðcyû&W.|÷w}QcvÃðÀL¿}Ø>X8= ÝriÓ1K%Ã¸¨=}õøèGò»jdÓóÇ¼÷@+£ç6Í/µgEßÜ§Û1úL%ÿb=}³z¡'/þÌ15
ÍÈèaKuÏú?vßâs­>Ü°¬wYÅÿ=}= ¦)çH(*)Â´²¾¤Àwt±Âvp­ÏºöeW¥\-ßöi  OùÀýñf)ÿp~Æç¶2¤¸³%\ÎÔLV>µ:å»ê#mÌL³õú)ü_Ûçõ¾=}ªßö/s=}Ð³*ÞßKÔÅÕéÕR{OVG3]kiSð¿·ÖfÊBðfÛ.éOá¨t¨6·q,k{ÕXÙ	+D^\ö¾äòÄKE)^«åa(£E§Â¾£ø5~<ðìI¥L÷ß¡Rz«=}úR IÃV=}«V}NÅWJ# ïæ·Æ3ÔØ!¡æçyàºEMi;ëväB§xàËN©
yìP#eøwXÔ4öcC«vOÕêÉ'Fd;ÖñUºÃà[ÛSÕpE¬
BiwéÕjm~÷k×#0ÃÖÙÑqÏ1EÄ07Öq7.PN=}ÔS7¢~Ýç*æ¸IÃÈ#q\ âjßÕ¥= N÷c»¾ºù­TqmÝ'yDîÊ ®ÔÝcQÂå(x{¶P¹åMÌá$néè½¤=}4ÜÊæÃ= åóÒë_;ïßV$9JiS§ôwÖÆ#&Tþ.¿Ï© ¥ .ã_Ôá¹rjh+äÍ´¦#8Æ	æ !P,n=M½ó:ëT	¥ÞÕÅ<ÛþTPÜK¸ãÎ~#zg¨»Ã7}X·¯täìrÃ.iÂæëRQµE¶+H¼©½ð1¢e§ÍCKCÚ¿.¥ò¯üÑU"ÖPy¾G|#ÝÓñ­Ëå¶ùÃórWótW´lG- ý	ÖÑEé¼­pBm8+Ýù&rTáÞÜwSïÇÌ¿xF^×q^×³ÛdÛ·Þ7.8PóYÖ%w^P_Wf°´ÃHdýìÃDwEÝ%É§¢Æ"¦¸Ü	6Ç=Mç2Y*8ýRÁ¾nJÁVÓb[,q=}îhBäø½¿Zì^g8*Øgà-ÊÉïÙÅâA?£óbø¡ø~&=}¯Tä2£[4Ze38¯´$:Ðü&©Ù£&+ARä¦ûÃ)Gºï	y) ç4oî)zw²p
>4_ð#¡IÎÿtúÈp×Ñ&= 9}:HãÎ'7LÌ¤ýP_ÒrÆ,f ó²ua|	åUoEåêÕ6ªá=M¾íºNL­!-Ë³dÅÁ/u4ÔÖ9ûiûÎè{ÞÁ9K\q½/Þý'vH5w«qKÿÈÆÒJ3KJÙ¢É$­¹æ^G¼íR>é!¦Äª!/»@÷s|®åí9[P7Ff#µ
o[N¸¿5îç¸+2ð_ù#ÅåbkèÔFI¢&à£=Mcãws]Ñ¾¡½ÿÖDÕyzñUv¶DC¥>ÂF°sPöùu¦!8Ñ1!¨62=}¢%QDç¢ÛnÍH§«H±ª= M~ÝjgDêzØó¢qçÆô0µÿñÖL2§úg#P¯X¿ë"§æ*	ÇcRü$FúàÞ]ÌSnOitÈqË×°xÍ¯uG{ÊÆê4	iç^¶»ú= âAàJéàjÝKë³êÿL¿èöO
°ëïæ3Î.òÆN°cM4a=}x7&:EùQv¿÷KùI½Ó®Õ\5TD}öA^0·tBk³ïLæÜ÷0&ØT= çü d¿Õö&ln{:ñ£Ëì
4 áOT ðEy[+éSQSùì>.!¶ÑRÓwü¬í*ú)3·æMèAÒô¼Z(7æÐ³?.u$6×zÞUþSÅïMe1ÚW¿·ö9@e,p²ä(B«,[ÿÞ7ê[fK§çÑÝ¼ QÍ¡ÆL7:©SÃ2Oû³,ÅÞ3iñòÇ	±¦£Äþø.Êv[àó~oô[¥G({\½Ì_LJËWÜ[Ï>ñ±76ÍDUÎ-¡5µ ÿ3<EÊHÖÇÔKcë¨
æo´TªÚ´Zi>e¹;kÍïÄf
ý2{èsÎ¶ú4:Çt+©ç}ún!ïÕØ-ÅÌSHS*¿fétõsåØö¬udï¥£ºæÞ2¦Î=}½*òØù|ôï¼3¦?o¹B Và$J0èÌXT{jÂàdÍÎÝ°É3ÅË*O9£w>s2û$FûêX
S8Â?Hµ+·	d,áY­=}t%o¾5g@Ôþþczü¶My0hGs#â¶Mn_l@ºxgxE¹iF+-»,ç"Pù2çòïJçàôP¿¡sÆ*l±ßcÙul¦_;O´òëÂÃY;E¡O_23FÕËE²g¸ö-ÝÅõ LzÆÈ&5» ÔðãÀ>ÁX.,á:±¾H\Ð´¦]î_´I½¢Ìf:­jÈ<3t:5eÐ­_ Ì«¬fÒ8ùQmdâDæyácè1ëóýÌúÑfµfäÂ62êÛ5sñ6oÐR1ù~µ=}û»&Óæn§6TKÙr#?>Ü&a*½1@y¡[_q=Mª
Ñb]{ËiäM¬vt¢Ì§Çùõ{ÓtÉ!Ä¬cÛ8@®ÖÊd­¬'VÂLÄ_ólÜs¹Q8#ñRói!UøÏ7;¡Õ2O¶#ÛÐ±û	¶,õôÛMÕ9 AÝ´w2ÁóÜiéÊaÌæùßx»x¿faÎ­AÕ´-6@tÍqÌL2O|ôÒÀ}²ÅpÊùÅ{=M"v"ç:lÏH ¥øä;½ÑµïÍ4Xü&½«Å³Öayð0SX)òD¬Ý@Ñ¸|«¶d÷Jæ=MEì×K1Ñ]LÆåª*c¢;G\ñvîQv=}[*°¶v³	[;K¾ß©m|9zº fâ#CÆ+%¬fY@=}®6	_õ4B/dNrè;/Bu&|rã48&V¾«5Æ#¶ß&=}yJô¥ò©@?3YÅ;í ¨[eRæ(Yr{ ±í2¼á©,$°Ék}³O,Ôþe¾¬Ì¡Þ1PfÐ9þ®TlÑv¿UÎµûcÍ
­ÑÈÚR³rÙÂ´ÊE.ul&Çùië}=MEú³e@Û·U?ùcq7#¸Z¦¼£Ün  J¾Ê	ú7ÄÝÈî\ ú#c%m ¶[Pµ@¶Çþr hÞduHªÑw[ã¬ZÁ0"BLäùñ2s°æÞîR!£t·;^Ý5Ø¹¾Q)gx¯aÃî=}ØòêÞ
 Ý|#¥Ê(x[B?Ù%YEØ,){2@^2°ò*jáDÛ2°òûå+Z5õ¥aÛGu,ÚM­ÛÛ= Î[ú·Ù·9ý?®$;/H¶o1¹é®= §ÈURÎÒÓP¤ÑnçEEµ*éé=MØöGj£OMäãº¶ïë{Ï3ü8ÆâÑ!?¶ÔA{2 4ÀùS%Ò×­PÏj¼¡¤Ó®ª¡ø+!p¼T,-kÒ½9Û.üüeYHÞ¨<E¨md3ùÉfîç³0èþ9>ðÇ3bÇ8 yµ¹&ÙÄöä1ÞÜëÖÀãÛÊ(Í£RñãÈzs{æ(¸³y d­?ø}+nkéá=}b§WjØkàö^èüz3´ü=}P±ífmý ©ÐúÁ,YÓÿu¨Â/v@¥¶ÈÕüY<2Iü?Áoá^ËecÕ®
_ÒÀ_¥q4¸üÝ#ço­è óbjÁµßF=MË µálLò{ù'Kº]ôR0ßú'OB1ÙÉÕHùáÜ#¿±.K}tPÉ^_-4¨¨¸E ëZ1»£Ù¾/áüó	s÷Õd|,)ÆX6NlÖ+= $5Æ= 1ouÒZ¬«gü t3 ëõ¿dé$-)÷P	»ÅQ¢MxÉ/,[@&YðôÿQ:=}þoÈùÚFñ{?ùïðe
X.SëÊù;=M¹g0Û,nHÎ0&ÁÖgtcÊyXàtóHWÐx|½z÷aàôË%AñòµÒ^®XÀÙ üR­óôhÛ0n-§I»s<»Ì¸amîs¡FØ^("?2¡J%OâÓ BûâúrÚñ}#ÚÊq.fxÇÐ¾a.Bõk[luäâÜ1=M¥§SfA
'¹5âúÖ<#ìh>ÇÔ<:vñ
ðô×+uôô8ÇLû2ÉbýÁìÞ¦(öô«(¹Ù,iþ&ë½¯9 	8úò+Û )ÅMcMë J¡Ô3>x"v?û·Õxµ fì­á¤fP¥(÷,zõúSÅå<·wyK½2U6v{ooÎâÛ¬ærÖÀO\Î&ÍÑÖfñÓèÁ¾O±0VÉ/UÜÄìa.gOPÅþP2ÐU=}°ª×+È§JçPÇbçèÝª¯qÚôNI\5{°^¿¤nkípÂ¤ÍYþ=}{S"EKÐÊøÔm-£êµp}XÖÚóàÎ ».ÍpÙ¡U= ¿ý¡Ïëàöm{~¼ÌSòVº=Mïå%é«ÍM´dÀâ´ÆhKß.sO|GØr,ÌM©>hßI£cø_Õ%ÓUÉFvy3ÐÔÃ:¯Áº;¡Z'¹yÖ'I¢qÉU¶´á×ö# .Äµ ¤áe,øXÅMP}äKg÷4zÁÆÿî{BÆüC1k^¼JkØõTZIeA¡z~.tÙ¨¾áßk=}IâÍVÉOÃDåT!ævÏ{ê<(N= »HûpGhÃÛZ
)³üEÕ|ARéÖ_tr64eeS8;MbnhÁÅÜy0¶ÐtÉ"N Ó+Öÿ©ÀuÅ=M~ âª 1Ôc;b<2Ù-Rº9T|¢Òõøn®³áY(Ô¦´}û2ìuJväí?E|ðîG¶<f-ì¹ÐPzÃYIÜ=}£ÌÎçÅÊº´ÈÑD[ýìg¤úßOvÁ
Í®
,mLZöo}Ðö+¹÷öª¦à³¤×ä?]Æ]g@tWx¬UD¬Ä¹VEÚ2úÈò¸Ý©ètæÓÆ=MüD	: TÃÿ¨e÷r=MMÔ,¥;ZðMyMn-)óJÞ}¯= JnÇñsæú-3jCp1;³-ßô
cã= Pâ÷Â£Î!6[vPv£(L¶ÙÏi(ßýEÉ{³ÌÈ¦H=}UF[ú:{N{Bä\GqÅË=M¶¨nß'6[Æwôy®¿p"ò(d)v½Íìçà]¢KG»æ	lsU *©bP¹sºíÀó^»n÷¹/O²ó= =Me­= ø{¢**Ö<¯qU80~§¤QòIm?òí N=}%³Ýï½æè¨¹wòGÛÛ@=MùÅcQóüÕ=}é´:w:ö©".¿Uðò¨¥x{\»þ#]´³3¬ò!oâ:
²(ï¾!Oaú^$Q@¯¡À³¼9C^<ÃWSÓ6ÅóO§(YWRwuW²)<ä¬iD ºv3J¬Û;xA;gß|Eï"ö=M¶l×«^/XJ¨L"-K;I±ip'¯»¿â<àÚêûßÑy«92syìdjµ¨Øw¢'>Dâ?´¨jÐ>ºM¤3k<A'J{ãMHVùÂ\&R§DGk8 SitÜ$ËÀ:}ózº¦ÕW¤ÞÿbõU:Çö)CqöeO¢ö}ÔÃi@¶ÐÂ¿T,AX§Øn[ã ûÉ¬®Çbæ!åqÖ­ZäÇ;é_S§À"M^®´!á×µ¦,ÌnQ§1BÜÆ¼*
<= ÐÃf	[=M.o­zNßÝ-ÍlY/K]a_dÎ;y ²îm,éiã«Ñ´æÍñD+íÁn.LgòCG:ßiæ5¨¶±úÂg×çHpþæZC zµ_ð3t<6R¼=MwçU£srûX³òCÆ-ÍÍÊvvÓg»Ö»Xê9oW
K%wYµ)zt¿Ñ«2F¿î»æ¼6ß¾ BÄ¹Î_ä½¢#^v[^BðÙV?'TþB{9ØWyãa³560ðÁMXu|íZx²9ü»NlúÖÞß'Å©aÛ93(/0´$AvþósÜðÞ©½ÒêTW}= æ9#iÃì/6ßmGíIì®9"¶ÂSOHOÿwU³;Öf¿4'¦m5eJ]ìÚ²K²Ë<¯×f.½ÌÁDhF,0Q:}Y=}íá¶òt?×üm:{pþ½ÙA¾Gø+;qíÏJ¾7ÚÑ8ô¤Bðó>ºÖ;¿ÿÿÐØh£+	üurJ#àÕW¦Å¹Ô¸O±÷ý®vc=MrJ+t£Â¦«j+ç¥JFJ¿6cóµEïáÄaOKPËâø¿QKy4Ç§:Ú¶wà_.Mó i+':áêg§«·	á¶J|á8øB}ÂËù°õN­ÜhÜ__Îò­{rä8o~àâÑ]sFP0	é5ÎäÚR|FÊ¯9.I©Ó,Ñ¦jrK;_æÚªÂj{gÜÌ>ÑmôÎ¤oàdË¼kÃÏ¹n¤5M:G5LøÕkÑZácg÷ÇïâSl,Õº:PZÂôùF	Ø31Éûx©OdÄ2,µáþØgÔÀlF©{®Êý¡´±3¦¥K=}WGQ5.¸2°B	 Ü»cç= ®b±£«Ý}¼9!cÒôøIäQÉõâÐÜÌa	Z±¡ã#u!êÇ£êNA]#4¾ÑÇúeãdº£ÿèú@,3Sz»¸¥â>â¹U²Ù&BLòëGS"ù©ÿËG¦çÖ=}ß¶Å/ñ=}v-gÍÎ÷ËÞ³¦ÚâMíKßÃÅ¡u/ôô¹ù(þ&+.(±]R%3ýãÔD¤?­´Æ}c¯ëÚÃ]¯®M?Ôø=M£ÖA;éõ^9ò¦²û·þ>Cèç²9[.HV©xwbC	òvCÖL(	ljOCeF3MôCªÎ5N¸®Ç Õå7wCÈíå¬l¹X5ÃX0Ô6
9Ñ4ro©ä³¿4èÉH?Éà³¿4èÉäÛ¿(½ç³Æ,³³Ôäî6Nù4åÍ §2	=}_DõÍ}ô¹,¢9Z¢íäº£íÛr/²Ô¨´ÍðoÚ$FÞÁÎC+DÞ+D®ìõJAÜ´c'ñ½]$I= qh_¾ÜÍ½ÜùéJFvÂ*ÅE:´Eî}¯ ¯¦fÿs?.Yëd¡{¥ÌxæÏmF$ØæBÙh½69"OXÒ
¦è"ÞÈ)ÿMw¤@ÈãÞõõØÿ ';Ö@«oü­røñÜ¥1@fö»¿àÁ§þNÏc>= N¾vÚÕ]©ëmµÊg¯öaâ"PØ°A·á»[äÃÁ(èé$ä!=MX[7èMçâ¸æÛ±;Puï^×ÉåVIc/ÐÜSe¡êµàÉW±pfxqzÜéá-À4ïXnmîzC ëÍª­8ZØ.ÅXp0Ïà&YïÈk¡^S"esZv$þ a õ¶ÿ¢&40¥þùµC¶\"iÌxkShÀ*YìIÐ	jÔw>Üc1ª-GÁðÝ^#0¸4kIÆ*Vë÷QMDDÇ{Än	be>rÇÞÈrhæ?h.É>má<z &ðÄb×IÍCUþH>L{ïnEX}$8[³Ë¼ìâl<,Sa.)¯úD_7H±B°¨¨ÇJwò8	5IE*sCð§çØ?:Õ]8å)Üô}iÁNòÌ)3ÞW9nj7<ùA:oM!'ÙHÀßóÛ	åuf¼6®A¸¾GÏP}R'¡OCmÑÿs Àjügo4:gZwÿàÄäîÁMñ*§H·$4Õ1>k¢X5&£ûGrÕ.è.R®:OÑîµ9	§ï(Ô;ÛT,úW5§$Æd·öÈ0q:(þXâêÚN¦Ç915:EMW3ê2P=}Ðw1ÜÂÊë;Å±ÉHôÆUJrÝÐ4 Ô>,L^GsiÐUeÈ4â¾jÀäÝHºYù¬Ô÷ÿÅ³¯ÅMr±$ÞÂX¯zXÆÚ÷/3rF¼ÓfRÒu«¬åÒ]B=MãçV3ãï§8|2µÈ1{ÅCU,Û$×oG-O6Vh7IRE58÷×+}'yy*bt0{¦8Ð/XF1·<GçÞêrUE:)·U7Cëfô¾û¢l&l= Ö®t½fç£ùþß)=MÛÙ=MH¹«Û4°æ?ÝË®,)cDx¼Ûïÿ-©/Ü£¥TVîÈTlçTÏ¸E¥ Ku(W×s§ì¢xî§ËÂQäµm¼Rå"Ô8¾ë#¥-àÜº©ßÍýJ(ÊÄæúÖ_ûÝÄW#Âu¦à7åaÏ1&K»­*çgÍöpvÿÈÂ8æÓ¦{7}(Msýïc= K²Ü'Í&§ms§øq³f¨Y¨a ýK$VÝG?º'RÚQlïQìý¶À¢;$«CÃ##«1}ãÔ¶Xñh)hñ©ßªBÍZ¢l3Â $;¡n¸]o_uåü\½ïÿàÍ0ÏcÎþª2±w£Ézy}YtªzËù&åÒØ¡8âÜ½ëßÊ4ÜÞkîØ3%ª¸20Æô~9H7êm@Y^I§n\jRàhUò]Yç¾bª«ÒóT~ÉxùååîA	¿<ðZ&S¨ô´}6 ­B~¾ªjÎ¡7ªZq'©pÊ7!,Ûû Hp{	ÕÔëó0ìødÆºq°Ìkó r:,¥m
¤÷ìõ³\kYs¡Ur³ÎmÁN[ó«ªÀvým¡óµ¸-0}uGån8ËmÄ¬s³cÿÀ)Ë"âBL?õ%òlä:=}àÝÞ¿Ã²x©ÝQÓQ'Õ]ÜÙÏøâ%ÂX|%¯ÊÄ .@Ô+e_pf>LV­Ås9>PÍIÛ{*Jº3vGK+l¼óV?\Ò¥D#Ø3nB¯:/Ùa.b#,£9y*ìcï|{Ê6ÀÙK
/=}ì)M½l}ÅG·ofÉþ/>­>.})nôó¾5êõ0¬¾ý÷ÖÃjÏ¸¨#º
ðF4õ5nÅÄÉ! ìÐ cßw8g+ðO9^ÇxCaû9r<ú&ñ]¶ßM'8þëªþ?,ký½=}=Mè÷þH6Ô9±9Q/t¿BÍ3²Z°TéÁ»Ó}%÷.ÒõÖs¡öRÞÒÌ^àM»°oÌÔ÷j&µÈFp¶ìÃ´¦§À!´@lt÷J.h{µÒY2´¤|´J²:,ógþþi»­&»¤e6
×º½ÁÃ°ù°Óî:¹Qo= G?vh5¥!À$·oÂªc{ðS	kÊP+ Óv18¨IáéÄ,ÌÃ:Ë:I&cqLüÝzQZ	Â±I5Å#=}à)((Õo!kvnUJ£¨Ýssx¦ø£.êx"ð«®k¢FÅsý=MyõdËÇ¯%,Ã¸$Åþ
ÎÉFÈú= /Ûãa=}¡¨>xY²§¡¢/ Á"(©0>\÷º×Ybç·Ï:û;ÐsUÝkÒ³ZÛ0È^áN£-fÞ²Ñ «héz«ñhWB{Ä¶À4HQ&÷ãÚV£yþÞ½s÷ÈS+5qU»»R«ËÝ1£Pqö[Ñ²»=}É½¿L=}û»æÂ)ÓûÁ $5é7¬³ÌùY80ÇLñÓàìúÐ§¾Å9À£2¥ ¹_pznç!Ñ\%æeÆ½Âþj]G®°=M2ÒRÖQA7ugðÈÚÁ·Ø©ntã\EøÇ7]EhwD9+*ÈäNÅjLó\·¡¥ëdá8]ßr¨·ÐçøÊ/CüûJî=}÷âô/;A+ÍÖ½êºZP8I¸;íØðâ=Mh¾CÛ$°~ó ï­y¸ïfãÍZÎâÜ6#¤ð¹¯´c	³º7sO±¢Ûy1w*âê¢(%{®Ôïäncíyâ­¦Dì|= ÂiÆ = .Ì¨²7AD¯XªRÜ½­056ðéÏiîD1¾«t/	uÈ4¬;y«º1eåõKÃºÏû3~bO÷ýÞvývÑiúîfÁóYô£´Õ+òåØÁÞecR+ PÚÙO/t3 C"¦Å7ÒF«3û*=}r\ÂSòÆ,ú# $gRÚQ§ü
ÝGãÞ8¡9ûú(t r¾K´å¸§OXíä0)1À«õ= ºÍæSÛ³ÖbÑ%óÁ>zXJtý åÑ³{ê³&lÛâB ±¹Ç¥k¼RpäãgÁI p!@f«y5L+ëòvdÕ-Qp>2ãZ4¯¾PJ>¹\nk*V·*]%óF¦Ùæ«¯¡¾å÷b>;Pi´S_gøÞâÆVrSòÕ>WÁT×~LW±HUõØç_ùú1ò#Å
¾Í*èÍr
&·w ¨[|/%Mê°æ}v&B¸¡ÖàíM¬ö;Ù:ÿ³Àr>k­¸c³Û"¬<²¹Ç«ó= ñTê~}EÕgV©gn4·õRI9IÊõ6_OÞ)>Ó;ÊÇ%/æaëôÁ7:®Põ3ônHâÒY>ÅeØ\ÌFã~ÿtuË!Aå%å(l8þ*dÖÁåâR}'sÚ7nRM*ßr(O±£î­öd!èzÁ´gÖ7ò¤Ìü%= £«}¤Û@<"¡aÍG¶ëá¥(õoeE	s¼u¾²2t¼ >1¡!FAÉNÚ®Q)ûÂ°Í´þãý K«Òka	#4J)PõmR2A¦àky6qhvg)Ópß×Å¥ÅOímtïñJJÚSúPbº jù6Æ8÷²ë¾"K(qØ:&;7uyáÕö$
cp VOÑcøR×»ÅBß?v,.#ÔóJPóD+»<eh
¾ã^fæ;:^BQIúkqf¶=}YY=}(µÊ|jËg2g¹¦tÀ´¶«ñôôøTº5®vàÁ¥3:&¼7|æñpÔvÓj®ó¨¶CúL^vU2ÃÇÉ³tSöÛüoøvÀî(Ü°úIÅÜý#¢õ-ÇÜO(SÜ.	c¶¥´S#»
q¶(*C4{JÔàg$÷ùp~âìè«ë¯èFÉÀDáß <:ßz7=}a"¾ZÒÖQ!ô{_.½±Bi>è§ìý"»ªÆO?ø§×@+U¼^UV_UÖaÀºuÁÑz97âR÷/$ùú>|	ëXj_EV:#Ó:½20ÿàe¶C%Õ~ò·ÎëËnïoôe(+úV ªKt±®Rè¬#îßä×ÿò_++<èØTZ1­qw0Ý­¤Ã¾&²p{êVOUjûä Ý¡R}DÈü²¡Ñ£Û¦H rCs=Mñ±÷·í!:ZãïW¨G9ÀÝ4Ì2Ø°bç[=}2éÃ:>ðï¿(±eÔè¯(Þ@Ëô9¨êÿEp]îß\Pfî]ÌºØô=}ÚS=}/ßCaFßC·w'Jÿ0êV¯V¶wl0ÑVÄ´wÄ¸7÷ECÛbÄßÎÕÍÙUbVt0Þåßg§I? M]NÉVt0åZÓîg¾Z#÷k/_]NyV4×Õ[Z%÷ßgÎ¨^³¦I?h
]ßéûÿh3pC0J¬É§v|üüÆ·¢f<Ýª&m«OxÏ¬¾³é+)Ýþy«= ×Ø~XÔþÐÂc¼bèax³XUCZ<Zc(kBÍYRZ0êXc¨.qYY nXÒÊ7ØÚ.ØO$i/] \ÈWÍY2ZÉµØ´Xc(k	CZL]È<X£ZÌµØ(Ä_BæXhnµÏ{>3­Ì5zµZµä;·÷;×TµT¿7uSF0Uß6uUFUÏEwÓÏ4V9ÏEG×Ï4V;N'ôÛã3×Ðxï¾£h[@ºV(G0PrÁ¡L¹ìîôjñîîs­#üìRíÁRàAPÌí¯|¸,-3Mä&Gßk³ÇHw¡O	o.¾Ýî$&=}7¥DJza:ãl÷ÃÕÒR_Í^1=M¹üBHý¡ÆÛ=MîÓìu6¿ÒÇKÓÛaËQäõ>Ó_7+ÓO7ö£ ,Lgx-Ô×ÊbJ±WÌ0jtÁm¢Ügéç9¿óÍòv²@éÀòz¾bQJKlþ¶CÚæªã[Ò&ÈÀAÆS=}P#Æú±Û3nÇ= S¾½>\´æ× U 4¼E¢uðñÿiJ$ûÁ>©ëÑðÑà"ÜbÜh¨©)â"~ÝÓbW"ÄÑÐLG4Õ?ÀÃ²
à®ìH#ãEÐÿãvYMºVij¨pï
ü)Ö~îP&}£!Ê">3"Ê-úÊ=MPéí¼õÂÕT<_ÇÕ°1{}[3Ì.5^î¸ÿôßôÕáìÒ_¨¼15tPùtbnn 4ÌlQÐuçY§F§8½ñèÖ
I¯HFÊÅû½®àÊ=M$^J*3KuÙFºYÖLâkfåX6&
K)6?ùszâ5(*AÂ®h±+ÏðÌÑAñDbäyßj´Và§´r´º9Yrö¡©êJ¶²ßK°ÂF("A9r;ïyH@ç#ûÍÏÁ[ä/E®r ¸5°Ïûì}©\Úq}8Èåò¥H@nã=}º£ µ^0»£Àä 1tv.úüB (äÿñÔ=MÎH
­0jöa6ÿ^"ùù,õÈ|ÒùÌ¸ÝS*Àà4@
ÍÞ¥ØnDäýÌÂHûyP
å4lÛ
rå-t
Öçfts=}K7ÈMh¶ÏÔ¯CB\*±<"p¡:¡=d{©F«F'Ð@!ÄD_J½,ïÏÏúË-rÖíþPý¯7wßÀUè=MóÎRsQ@Åç"Ë³Þ¼X;XqoÌGÀU=}KN}g¿³vU£h öWb'v ûÿÚÒ
$²÷Þ·ÍÎ3Muz0
Í>çÊ= =MWúR?õ)C L{93T©¤}TËJ£:båýý¯1sÈ!î76iC~\ªf\lsÃIÉ¤wü|¿©kLßÈ´?åå¢+ßÿ<:íaÄÐoõ\¾èë#ÏA7F8:UØF¹l­)@Ëhñí}¹{ðQ!ÆO§1ã!êQ¼Úi&¢Ì½KáN~j¤  ·¢¸	§ygæóCròtñ§ETÙ¿XÆÞbøÁüÃ'ä]º¤êàó*´Ú«Þ$JÇY¶%~±_Ã1h'r_µHp=M½æFß= â¥A¬Sñ1YëÖÞÉ3¤1èyB\_]*¿4õò½sL  =M¢9)sqKaÉþé1Á¡b35/vqgÛj"´ýÆ4?Qô!î ÑÃazÖ3ä¢¾©óåC3Ö=MX0>k·HÍãè,õ³íb"ðÖÍëÏò¼ ­ ïµ!ì3°ö!,ô£Q¦½Äÿº²gçI h£Aú³ãWw^Rë)¿5ýà÷Rp­2éÜêÆF;é©²« .MøêÏ]í äMFßKÊnÂLé=}ÂíårÌ*-jqÊêâ~t´,á4åCü#²'/ä,©Zóé±Éå7ræ,è%Ü)¹ó¬7|Ä'¼¿YyP#:¸VË^Írr Ú7SütøòHrH>§P¼I-Dçh~×Ó¦Ò±îzÜÉÇAÜâl ëÖÚüBq *»e{ÎÇè§»¦<lõÊ°Ï<¥ÞWóüöWoú»FLû+Üæ¦kFZ¾;}ººÖo¦Ñ½ò7ÝTYyeé/YÌ2yì¢­Î!ð£õHÐîS÷ú-Ès'ßó Êææ¯IýuJÇl1@<²rÓsv¼¹Ü|Ï+yR ù	Tüº	ò+µ¡uª/£ñ})[µÂ#MâÏ¬£¯ÝÞVèb	ðù­à·&"3Êµ¸ãåóUî#;ãÖ"¹IhæôR/®=}w9Ýµ,	/Ó¨àÒÊEÝ»=}óI£Ä³_´kÁ+×*³êï\yò= nØc%Î%YÚºûQ2Àn6cßöZÊxâ"ÿ¸=}Î°	úlª:a aDóÈ&K$T¿ÎÑÎG,kç°. ]{ª0nÕâf¯cÝú	­	 9m<=}ã<îJ²Kµ>>[fdÈuHÄíqÆîÅÂÅ²Â:ÂÊ-05Púé)Éá9^Û'
¸±á¬zå-/ãë4nsâ­ú¬AþkÏÉt÷x$Æc0Z§ÖjGOêk&6RkyòæE#GÕ,\OÄE@BCÌE¤PÑ	ûû5Õµ3åw0ç!×¿×WÎ­ÇÃÅÄÉÆ1+ÆbÅW%P³B¯Mï]·§P´Q!O+EçëSøR(IÖSùGÇãÖÿWFÒ;â½;3ÞôÞ]esBÇ/?,-'Ow²Ç°ç/C©J6åkÛðØ£ètÝKPicaQtg»	]½sæ
~zúÄÛ+Âðz¦=}°÷OàNÒÀè}AáÞ0´óVê>û1ÀÕqqù¼%e;o%ÌuÙ¦)÷A.ÐeÞgJ²2Ê;öo¢óÁ}r%ÙÄý÷wanÕâ¸½)¾ê=M& ÷ú0,5fÒ= Ê-LÁaíù³ÕGÒÙïm;W@ÑJ_åèdñzvÂøÃÀeEåéXH¹L«äôjúÖÒÛÏãÛVþó@GsñøxÂô6§÷ûuéê=MôUäÛI"Ð ÷N®Byj¹àÝ@Ì{µgf
¬ØÖxg.Ò®CfcM+¬(Üuñpçn*-°4 L^mÌÂÀN/þ03,ÑË£@d¦Ô×"LÕ¦ÂÃÖRf£Eõ$±POqSòÑ,'
ô¶$VE?yÂRÏ.Ç5ý\wÉèØÛ°ºKMÉêã0¨¬ mÈißl= hBEÆSJL:Ùü0+Z5d=MéâàaPß%-çw®5Ñ¸,ÜéÛ$¼zô'½{G;zúrÏA,ù$Í#o%dIOÌÎuºý(ïà t;Ão·òñÈôåæJjÞ³Zyotãpz4ÿ¥W=ML9Ó	ðø·.wÓÂEÃ­á
w¡kÝ¡Ó§7=MMc·=M=}°AÛ^"È¬ÀÌÂÎAÛOºk³H-b7¢åêÎo´×¾ Èdá¤°°M&4&Ò5Ùú"ÒQàác/D T<Û,¼üW4õQ¶ó²Ò¦´ðS¬£ëÙ&V¯F$Ìb´p J$4É´ÐTÚ³ÇdmfK;Oe;Ù¦ÉóË¢G.sdH÷iÆ×¹£+Ùûþw7¸¾A×Á")-e++æì4ÕÅÁ;iÏ-)Ëgpñç¶K<Ýw<Ûõ¿}ü<ôS!Ô0Á#ÏôQ.$yÊ«&Ý"?÷%ß§°F¸!E2>Ù.vë>Ò>©ÛQ qvRPõ	Ô<,[QïdÊHòríèÕF6Zo4â=Mº¨ÛqÙn  HÈ9°º6ÛµjÙÍ	øÙ/©ãÔàÛåæ¹hï\·æã\G¢¥ÜØ·ó£³ÿ^~U þ"uE"pêHðFæEÂ«ò¥æmn»µ¬Åýà;¬_ÙÂæhÍdsÝb;Ü2"É²&^U7z©fþ^BxDzÑðä#áõh¸gVx7ëIfÔ8FØ½l><i;ÉgmNØEf8¤;i3ÜYÆ8ØÝ]UÁSH{Gê1bùN}a­ëÈs[/&_Òa>«ç Üò(¸Ú:VA¤ú^«åcYu.¹ëÌô"i Hú¦íÄQìcÍ[áªrcÙ¢ïY)Ê)Ð)oà4^=MK0¦ût¹æÙxù\ÏdßrÊúnjðYÝøè	IP8@m~·ûE¬aÀÞÛMÉòDØÝèkÎ°ð&|àYd2Æ8·8F!¸ÆËú#ð¸kÎk'¯:§8Õ¿êQè¯¦ÙáÜ¥0+KSªîð| %1ÁÜÛõMùÛíîbYáË°àÆÇÃR*H
BÒ!17NÇµºÎ°ØS sY¡H(Ý$ÅSfFÔH¼4!ÆËZ­>xG¼{:k£ÚØnSíî¢£øÖ"éîÉiV}iî6+Ôÿ;w"¤ªNz{ø=}CÓV­ÑÑ¹3ã¯b3´ÑõqÑ{F*)³+·îím>ò-NÓ±Ñ¹Fã¯ñ'Î¶Õ­(ÕC)Ú$2/±WÔé©ÈûTÍÑþ¢=M±m¹ACJ ÒK8,é©Vuq±q·&úSÒ³$VOÁ¶±AìFÆ´*©iØâþA*¼¤Ôe/»ì&RúÝÊk+¬×èØÝ-c+Ìr×%¨+´IZª|8eûôpÇAËZ&-s3lÛÊÇÕØÛÃQ	;µûÁ¿Op·­iåRsÉhwÜ¹ÆWQYcycÜ{ñâ=MØ(ÉdaÜnØ|køë= XYzr2ÇòÅGáKw/=Mª~P¥±º;æ·ã¬-á¹L= ök¹Cù«=}gr,Ù*ÉÄ T0e3×N8¥öÄèë³Hð=Móg<î ¯;ºcÿÉ¹c®üD Îap<<u
À=}Þ$û]oÆÑâäeö	yÅ7J/¥jÝ*¼N*Üâ7Å~^0¦ð=M|Á#Ù*"rK}[E5&á±óéUÓQõ¿eÜ¬ÆCZYÃtRUJ÷êªËÓïØñüLÕÑoGPú¿¼½GtÒE¾ÓWÅ 'Æ,0áº®ÿwRHå²wBt; )=M_Çó}ªýÛ#üq£j*gôWK­k¿xÄ¶,ÞSË6Ó+v4¼9Bìuc¢v/=M¸zõ¿H=}sÏvÓ;©µöÔÜ¿ ôðL5'´·S¥|­2Ñ¤òÌ¥>é+èÝ,¯0§òuK )íSÇòÝ%Wé*NW=M%ÒÞ®.Ë»/¿uR¶åáu¥±Åg4çMì¼ð'PAKï¿tÑA¹Ïë{¦ôkéðCP1öÖêÐ§©Ç2S3ñÏÃ6UpAÖ>Vë?pÔjK9vëûkyø\J^®æv;ÿä¥¤1ÖNN>Iú½WÓÙïiÊºo¡é1Ür#¸ß»ÄªÊ8Ô¬ÔôÄyèaÜræHr¸.N©ã{ªC!b®âV4øUIC*C*\úõÊÙ¯gs'¤ Ä¥óÕ¥*s}1Þ7ùëç R¨·zÌP´àf´eÐ$ÃJñè¿áp1YÁëhÿÆ«ØèÌøJ= ¾Ë7= søô°áìæîaLA½cà§(Ê{¶â5Ùwzu!@Pþú;W*û}³øêZÒd,Îðe¬ØéöÌy¢}ú+üZºpÇx0kx<.Èi$Çc!¤YBqê»q&k>,­"h¶zm.é\øóY ù»ñ´Òð<á¯ªc!ºr=Mîº¶ù_H4![)ÃðA
ÖÔ·ûkXi¹V÷àï,Áêñ×ùØýdbÏª{	Ý/1nðô[yÈ®Mù¢<¯u$Ce~r^ÛÙÏl-$ZÉÒ.ºþ´Í¯ÃvùZ&[®kæ°³##xC~!¡cýðÑ_Â;XïnuÀÂðw¤W÷ÓDOY²´ø·ÿè´¡ÏäÐcpü2qÄ¡â¹;QÐ&xÛ22d¤\ëy©* 5WcQ×­)yrËé.¸©,[)¢¢!9ñ ]d9mÖköW=M,zÊÁ¦§oø(VÂ (\E P=}÷úÕê¹Þ²Þï¤|ÛÚàú¶ª>,Á5ÄS?¯]i¹Èe¯Øg²çfÁ ÐûÚ¸BGz·[wüêÔÔkÔê!H9ÐUÓ½ï&>t}ÉM"0½ão%gIuA@¸¿»ù+àFQNIA"ãÿJ§v$´osmv!7'&*0Ø¸VóYõ5Ï<ÔIñ4Ë¿6É)/+Ö²Ð.ÛæGâe~Æ±= Ðïo<<ìïî¿ÐQv	v¿ÅW;¨Q) ]©QiiiA\|éø(½=}±éÖPH2 }*j#ÏH5
*ÇéÇ¼ªú%³×ÐÃK;Ú&á/Îá	p¹aQM0-7
.î¿1À£,-ýú%×·×ww#T= ·}óÝ1**UÁ¦®¤$ä= -CMW" à¤·=M}»¡©û½FE#gá¹WÐ1Üóæ½v¡ðI£:àåì¢w·]i}ºgíÑ~í%®|}Çq{PÎÀ{SuB_Cìö´*NÇ*KÄÃ©·ö*?¿#ÑøÌÿêÚ¼pÉß¥+ÌO= %(= Itªá©f¤rNqôa
q«f¢ÓØå³n;¢KÉLáøAT¡»ÿÁ,§p>yiæ= (|Z'.Ö ¨8znú¸Ùpâèo Z¼= íØx[üý×¶×É	F »Nüþ×=M5/ä<Ä~¢­~i>kÔÞ<æBR1)6N=MR'ÓÏÇõñD>¾y¡8YJ­_(K×?çõäØ
x7fè|ìDÝ?8@{RI>×X¶
Ø;[Ï<Øâþùs8×È|a-l}§MæHÚàùjY_/mGÃéFÇþI _T¶³UÃ­ØûM¸ÙbKY¾þ~Þ^HiãM·W¥Ô¹bÈÙ´J¹£ô<6!3=MÆ1ÚYv¦.nºdÕÇPC&íßÏüµ=M¼$(o3[%å½jª »{³pq = ´	ØßhsyÊ¢K«ÄÅzºMÑfS1 ³A>R= }ú[©©Þä ²A½.5Ýç	)»	nã7¹,'ë2¶&´åAh¦s]i¦3Æ¨ù0}Sýã#A7_R
åR0OáÙ¼°ñh¶M¤'5óùÓÖ¢?ñW<ºoÃæW¹«tH3,îÎS ðV¸_{üN÷Jå8=MsÎÎsÉõK_ÈF7ÁFÞÐI½¥d&NÅmJ2=}K?7Æ0àÏé+"SÁÿë-Ã@ÿ@öå¼ô5¡»Â×0VãSäÈ\Ä|¿~ô¢èi**Ò«ÕIW}ï0qV§£%áÆnh\sßå²eèTOðFg¯¤Ïê£tCÌÕ'¦æô:"ÒøÙvÝûÇgËkÚD%|oOÎ=M.Véõ%½èép?Ë1¸AAÀÈÀ5úá»Þòsàñ·K÷=Mú±g(ÝÔ°Þ8÷jÒ7÷§÷¹ð= -5TÍ³#hÕ>·±i_±!@ñRîÄØ2"Za,Q1²Øsb¥Ð ÿANÞ)Rt,5J/	!®ºvBV¬­èËìawÁ²¶ìG³r¬÷ãÒ×4!§fÏ©¨t,/I=}Aý#3r9X³µÏs[}Ô¾¿ÁS¬UwÓº2óèþë&îí!Ë4Læ5k!¤|8ä{ø£çt©«âd=Mï_: ~òçs×÷¹·ª½´,5L@P:9Òt·¶¤csÓ.ïÓº¼Ä¨¤öFÀ|X=}=}=}Õ£Uß@ÐrGZ¿½2¹gy²Ì%¦~'Mt|-úCCV6P84F=}y¦Êw*A+úråþpùN
IBÖöäß÷ãÿsË¨RÆâðåÒ3¶>&sä¨ÇÓ;=MLXYÀu÷æÉºÌÖÁ2ÈçI;¥	ÐWüÎ/ETRpNi_ä¾ôª/Å365[D»$öÆGP²$5h?@,{YµCâýòõõú¿Ô^5d^5O¿isF/ó«KnÂ÷ÇþÒsÒ²W	0¦$½,wÍï+~d|2YÕT¿áã	n§G'Ç'ü§=MíbR)-­v³9ÿlC(M£&u»ÈÌ/ò.mIëMäÓ'À$>a3)69©á³8Îç~ZSäcòÏIÅ7°ùûEÕÚ¿$ãÒÎJù?³	ùËì·@$QiàÝh{òS0Õô¶Zí^=MçÛ«h0$bYdL·Öå¾Û_¬= +ÑÀ>ß¾Îó+9À4v¶Ïgã'ÖVf¤×«÷ÙX£08÷X®ÜpeØÞ+/_0þÛb$A[sï3#C-HÔ¶g.5+}<3= _|Qb¡È@oÌ¼.°üý<	äìd(¹ oØ,ÛE	Êàh@TMb¤ ¹r÷h2b 4O «ßòe)´Ô|Øôzé= ¡èdqûY jef u]{mJÆÏy±9ùkUçpÂÁ+©ÿ^_Ð1e	íé»Ä<4AùkU5ewjËi(Þm©K¿¥afLÉwÔàÝávaàÇ¤²mÈNõÍðíé\¿E" µ>ïQ§JOÊÙ$[¥+/·
À&L(a;ä©"°æF3	Á;ò-£{nÜ§ebØÒNÊ.Aô*.à®%óiØë5Eÿ3¶·´È?Hì<µGt;º jsXs{ËpØjAÒÎ?!¯<0ê²/,>qÆqã'ÉVkXW]4Ïtûö)JVÞIóh]Ü«>¼iáÚß÷ë#
ý)$¬9lâOf}_1Lj·wÀ/â;ªìw¬ºæÈï×ª³ß¸gçð=}îÑ3öÈFþ0sS¸i ú(Ð1ì9d«B6EJ^áShZw²^|÷b¨6fnkdñ[ô©tóÅ3®ÎU
Å3µ9å¾3Å3N:Ä;Ó7÷°2Î¹¨ªg~N9JìY¬így«ZÚ(Åf-çMñ)põf>ô|?õe0Ùy&´Èû
ëg¬pRë°sà= 9?çZ{1
ò»ÿ»ÊöÎ¿kq±ÐveJÑâôRAtb%ø'
¤æ´"W½³ËðËïosJ  '¿ h]-?mb«úO!mßæ@û>	´%ÞÂÔ®Ððø¯È·Óö8:ÎÚöÏ\k¶= vnDV|QS£ÈSçø!!/ Vç<ý§«AynnQñri*ÿ@Õãþ*OÀ±aÜíuíÔi ÷²ª¡ ñËÞWümê§RðI³rOÿ¯ÁæçZ%ª´{=}÷£=}gýRóÚ<ãÚüQNcfÅiô±@§È¤­= ¶ÿa
û]&Zñå8	æ¸Ö×âÚ÷×,««Ö³%Ý»ÂTq³å¨Ë¶¥ÙòñRÂ6M¬ò-Æ´¨iÝ5ÌmññP :®¿mþ·íÔ<CÎ}æ«í¢©J¡çÙ¢.U­¨Ð¯&Åb£lTæ¬( Üb$KÉ0÷'JâÔ´ûü¶ó<ûÑç¶CK= "'û.çµKP©íãº¿Æ;Ë!È%ýÃ3·<ÈÁ«fTxß>¥Ëèµ!¾(DÄÜ¼«.s+.¿c%¾Ë~~ññp@¾ªPÛé3p'xÓ¬^5C*Aõð ÌòO¤ÿ)ETÿüù9è×ÊÔO ë+Ðøô Ó»A¬î®»ñL^Ã½Ð_!2¬®ýü*¿G&ÿ({Ý½Û«pÏ{ñ[zqçi!°4¦úÄ´j2ë(é dz[já÷µÑZÃÈCiiIä¿"òÌô:(×u#ôJ°TêËÞ4ÄqSe)ÄËà¾Ã½lÅÉ¯l÷Nê;u¡ ó= ®n8.Ú89´Èc¿É½pl¹ 3Ýy³u"Í;¨>·f9Ì¼= Ù÷ÛI= ¾Ëï¸*/^	 à)¿[q:w ¹½XFqY= åXìS+=Mók®R9çqSÔNQúg¿ÔÔ0T(óÒ6tKú®FÝPB!\ÝwWÑÈ½ú_5óÐÈ0õ÷4ñ²F$.Æó:"ó.°®( íc~ý&ÃB$ç!¦¤GÜ¨JNß[¯upP&öaNdÓÆUxÆ0
!îåÄ(¹$¾ÃîgþÔmG²²ÉÎô}5³¨q¿(Ó¨A\fòËÉü7nò	 ýqßmþÜ,ñèm¸K+L*¾+j{fh'?^4Ï8ÆÕêSBë±÷ga*½uîf-Ëâ®·süß{ò¬d,¼£)pÔ·ç¾SÀçz	;Þ¼ç|Q&= dd¨ÏI7ßÉ)×pSÏg+¨ÌÞÈ<B¸Æçr¤¶!x.¬e|*ÂxCneM§RË½»´sO{7OL¹¨3çGå>é¶E4ãIñÌ_5N=Mr91sR¡µ1Î c2ÎyÎÍz¡ö]Ì<=}fà÷E19,öÉK3©µ3îr¤ÄÙ³p(òJ®4êu%³J+]§îRÅbäò9s¹£/~P¾Þ¤T4è¾eó4ØïB«(	#ÚCi´Û/Vk\gXYX
Å3W#Å3µ¿3Å3ÅÃÃWÄs[b³HÒ4ä·Ã{»8vQ²Ò¤b=Míì°ì{dajb.mû<¶à9ZÞÓ?éï¶1 Æ&:å¯^Ys*Ñ9î"÷=MLÈ zÇÁzc$;¡÷uûÎdÇË§êèYi ×c{Ü§Ú©b¼>ÝX¾Rù+ï·6ìJ§3Û){4!SF"T¿Ç	|!Ù"õNÌýÄþec=} BÂ!Bß>Ì£=}0kn2qy1è¯×L+ýTÚfÇÚè·!^mÍ¶Í«»#umûíè´û = ¥ÑnMì{Kædûü@ªêG"W©ÃW##×(JSÝ<D÷¤RKõ[½·ñÊ8cJî÷pJéÏpBSRcn&Ô¢±FA4;I3óÈÛ£¡¯è PÙËäAÓòh÷;<Em_³oÏ5µ õ1¦*è _ÄxD8êð=}8*ªVFµþ¦KÑÃó¥¯¾xÔOT~êTÄt¡ËÆb·ßÈÒ1ô
Rº)ã{Ìþmã²ç·Í:¹®°þ¨Dï$j9Q!®â*¹{7·¬MlWõÜÏî=M4¬×/kk-ÝRtIF=Mì cVX×XØWctÝß/ÔÎÇµlº.	¬¦hC=}Þzwi
¯\=M;E¸o+Î¢cÕõÚR§V|rg!ñÿÕ.*É6;þäÙµ9ºáøüDU"18îL	_ënm\[¸p^l1¶Å3Å3Å3åÅ3RÅ3G<55yJ×.qÄpri%7Î¡;mAQ R^èJóG½7 ]òø~E'Ì½¬k¡&
ê×¢ tgAHij¢m} òAº§N?í íÏ-ê=M¡,ª¼ã/ÏUOkçW"l?ÈS=}w*ÏWçâ±g¢²Òk=Mþ-^	ùÐ1J%ãpæÎ(¼öö÷ÞûC¤æWïónÕÓJï©¹m%/Ê%Ã[S×1ÚUE´­2Ý2¶d 7ëÇÖôÙíÿp=}tb/
%Ab¿rkKGÇ6!Ay/G¾ÑGÿ{ÂSc¶-|S+Ãª=}ª d¦Ô82Ï÷ ,T¤6æ­Ajç×®yí1Btä)8NqÞÖÿY­µ¤*?ÖØYßNqi©Å¤c«®N¿ë=M]±£ ç>;³³D°W&ÙcUõP"ñ¡c´ádÏû¼÷_§¢]Ý3ödT1óùbÀgJ;Ý¥[áMaº RhÊjQW¨æiP·âº¡«;wJLÐî¥8T¡Ì|+4í5rÁLwðb5¤ºß¼;÷J÷yÝ$*:óÙ}d+¯ÏlWâÇQGß²®4{
öÚ8Y\Yø¸Å3Å3³Å3®'NãÉ=M»±­ÓV¬TÈOÉ1³ÝKW7êj¦ôU = rÛT×»¿»9HÆt¹KC\JÄêOÖ·á8}6	Mà¯s­ðÇþ"#WJ¾òr#Ú,QW»ÍNÇ(³ë8É²þÝÇÛÞú9µBtMPåv£þCû9¿Ø-[4à·vréð<pkÖÖÂÜ-þôãCñq¯ò«oÅK{c	y,â÷Ç±¹ò¶¬ÕÃîÅDËfù%öµ²fìwË¸ù{%×ûÎñ§ÚcªÃ¯þõËÿ2eÿ§Æ´28&gîV8§LÖ ãÇ¦5Oð:%Ô±ËïñÖÔIg5!VbxB¨XÞáÙÌVt ÇhCíÚA±w$½Gh®¶b9Ö©wßJ¶j]%ÈÇf?Ï\Ç'Èxê÷ÆâuGûàös¥ö©dÈ/îÂÑÑáÉVo*ÐVk'ÝN\~Vö |éß;ëðáe2!¤2ÝÝóª@
£=}T&¬¾üåçÌ_+q?í3Ûq,Ò¾jÊxkñ³nÖÓ
È$>V.ÄF²>è_¿Û´n=}ºê0,%;¬ÇÞçK©µØFÏ]t¦<,QôZãpà°ãºö>;0jÞS¢³.TªÊí*@¯E½´,­²&=}´ xJÔ]Fíl<G§íÔÂúQW­PÝ¬«òëÂ/¶@ïdÑµë.ªª«*ãÍ,;v1UÒÚjs 4)=}IåÁ<7â%ò pÂºEï¥ÓëñÛóAbÁ¹6ên~Â9ß ®¬®
T¡:@ï©JåÎÀE±6utð4WpB<³<õ íH@:%µðEº¸¥ë±Ôs5vFïLøýß­gÒ@I@½ËÇæÿÒqSo7 ¦§F»QÝåG}w3AU¼·D?#	[Dær8£!X1¿^QÕØ\GÀu¼NNÎVàù9h¼dIºRhJyÌ¶e¹9ä Ìp/ÝõwR¾psßidc÷Ck{TÐÏ\µiÃûLÍà0Ü9½i¶àP#¤¥ôp+Î#à<ºÇãªî¨Fy9½æÜ^|¤´{¹þ´jR¢¹½ÅüìÅmª6âýÄ²{½A¡·ÕýNìmqÎÆÝ#0­x;ÄßdqëÉAàdåV|»cqaPr= Ïl(cnp¤nÈnÇj@thð¥89zYëMZÎa¬um@wmPF
äW= ¤Q®82ZmÏ]zvchK¸'÷ZJ'dä[Ì´Ylë2Å	Å3.rÅ3Å3Åtå?W5Ç½GùWQ·½GçbÕWW8Qù)Ý>m§D7þh¨ù% Ý.ÑbiYbÓÜ­ªÀQ$¤¾ú~òî¼~qS~ÔçñðåXkñ0Í& +éõäUÆ8L['ûdîÈÓëö©Ò&³BA qusFÁý/:­¥£áýr¢L-TW¬K %é|¨à<ïÝ4 ¼9UZfÜm(OÌ½!ÿòÎ.#»6ø´v$¹Ü·fk¼»±ó#±¬ö!.~ñt¯½8ÖõÍ*ññôF¬ÎÔ£ÄC÷¤FÙ|n±|i¹ë Ð­Z¶:qËæHÂÉ	ç½Ô¦dÿ«¾×lKöÊÄ|+2H+ô7¡¹$ßJÐÊ= ?®\ëàQÿ[qÍØ.§U©KO-ïvÔ°Qó×L#ë©7OõØ?Æ|7ÉMcOÀõkç¿*¼ [®NL= ûÒ·®§pNÞ®/1)â¶ûS
g%Ò	º¢6EÙÉ¥Ïs=MÍÎ9=M¦Ëjê(YnEáÐ,îÉc2HþQÍ³)Jc"fÇ¦ËÁÞBÕk¢Ä$ÝØ
ÀàEBR4gã,µ®ó¥6=M°I^®¿çÂô°]T"¬úým2í?L-
$ Ë#*Dö¬ê¢¨Ô£$¦î°P¯ÊÎTêw¿#áÓ·<)3ç:WCõ,M´ìÓ­÷!CBç«UÙdÊ¯²ì}¹£Gï½)cÊRN±±ÓBì\ÄÓové{g¢õÚÕª¼°L1yOÂÇí5÷"TKC¼J"-
¸8bs¬²Ï²|s>ãFTÄqÇÞ4%ö»S¦êÑ£«ûý<iêq¬rdê+ÏR!ndª½ÇéD&é;ó«»ÜàèÚ×|ÖÌiï°Ðô@*µ¥Ax]²"Ø Ê¹¯u©/~âNwÛ.X7-33ÆÎöFKõÅ3ÄÖ3ÅEg1.DgWÕÐNÉ.Væsj1z<ÍQp¬lê«G= 6]%â+ðÕíåêEã]e?Á'¤ù¤°$ÜÅÝÜîuÜA¥H Éµ5ÄFn"ÚôsÓ¥ Jõ"¦SÁ­Õìî¢·³²Iå¡åüg½]*e}S.½ª¥PnÁáÛª Ï¡Bó²íF£?î*:rýüÛÅêõÿæ@ó&O:÷k_Ê«-iÔ7¾vxðJFOI³±.ÔÞw"íïrPH½ÿÚÐ«|Èö'f¡;Oö¼K!<ô_v?=}wÿÉc±Æ/¶Ø5´$?®IqÃÑRe´
ñ3V5K=MÏIC¶Ó³9YVÀ%¹¶çI¦JâbFÜKÂã´WZç >É"ÆP2ÔÛÌó¬6;<Wf¸T>ÐS×ÔOE/AµV ôW£¦H0ÕPòÍQ8¥TÑ'Å_í%E¹*«]Ç"­¹T¥e¥érH)(ué	þkGÚä<@¯/e~Ç¶§R0cÏµSøÀ³·<V/g¿Ú_xÖWPÍpäø=MËWrÞæ{ø=MÐ|<ç³³_ëÌ)9èv$C»2=}s¹9¹»(¿kÀ@ñù2tîåµ%p´ÃrãÞ;IÌZÖ§óàf_øÉ7j®ÀpÆÛCNZ.P¤~·Ãã,;ÎÌvEW?ØÖuùúFäcµhmä4HÊF°Ò¸8aJÚ{KÞ¸EÛÇ;ÕiÆBßªÅ×Ogõ®xÖWa=M/Hiäô«yðylC"t$ZÝz¹Oj³¹1.ÀLâ ?°¬Lâ¿ÉhÏ»Ï¾ZZ1ð= 5¡È#¤Ã5lTÑòÚ!£ªyË¤GÁÁjÓü;¤»ö$ú­~Ôw½º«ÉnZÒ¾{Ñ§vªfÎ7"5P´Ô#ÝígQÀõíç¿õb(»¶Y®ÀmzÕ²ynlúµ¶iü¯l°äV?âÉ\£ïíøJÇaL{£I
l¯SïùÖq¢C"¸¤^E´q' ¨3±æú¸º.#=}ýt¨tÿØ#Ò]ÔFøj¢t"©º!^}Î/IáÖzdÌgo¹¬ú¼	àDéºSi÷à VyúKT÷àgÅzV{*æzñ,â|7|*Jdé¢¥¯*9Q¢B¼ú|x×Ï]. ¡7²¦  Âû!Ö½<ìÞ6y=MjB½¬¤&&è{c z|÷â´J ï¡e.$ùeg
ÀSÞ¤
e'x½ÿÌ¢ê[ÔªÁ#¼Â¤£zNÙ>+ß£	ìo"*t+Þ«ØÃÅaþs[Á<§ÕÁCkÇêöÑ*;SF,í<_õ!ÌÙ{1}2+=M)LAïH§ï!-êNOö 5§çûq» 8ÛqMùünr·þ§óA(ýð©ÌþÒE+w¢ÿdúÏSëS ¼ð2ãîFD¦3¶Ìy±¦¼Á¡!ÂLÎ¾_ÉÆ»i×1"7ñN&'$A ³¾ËL}K4KP·×Íï-"v´#öC÷¿å­D<)k;hwß1"J+/dåíD:2ÀfÕÄ&»{*±ç °¾8h²ß9ðFÑ{Å.¨¾:*ÛÝÜ'AîH C9± ÒùÑMlùÂ÷çèÐø»å9¦Ãó}O¤tËF/¯ÑîC¡#¡Õ4¿£9B3ü$¢å¤ÕÑÏRy-SÁÈ­QGS{PNF¾Ôßõe§ô<>\KójGVtFÌ¨\¤?sÂ>Jn£Ð'%Ð
"æ@ETéEÊw¤>4HP]VPu7Êëe'c¥öJÞ	M TJ÷7I·Sá7æÄ_c³mvúæ=Mi¶5aïÌ¸ÀgPNCå/Sº·QX4väÙßzÃ\NÂ;<ªµldM²{EÅâ"A>(U^Õ{À',³5!^±p~nË2{ø÷kb8éÿs*(cÕT¾XæNe6?¸´= Ê½Æ°zVÕln.|f¿:	&i/ÂêH© U¬D,ò\0Ì\F#ñ+! ×fNn<z½¶v-QÐX#ïn= :ãÉ
\¾Bý0¨µâÖ"èù£õd½Ê4ÕW]0«]Äõíp¥áìHºz.íá	¯Bóztá.ºó #B²ü2z±¤©ªCi])¡qì)Ï«©m+áÝÌÏÔÁÂ=}ª9RÃöã¾üé1)¼bñ+îêÃl5c{mn¤ëUÁÈÿA&Á UxèE¨£BêæûñSdA;^uúÚ9ìÁà:Où5MÌ¢GüþKV»§G
Þ¤ÔOàEÑå%âv¿ÞÙñ7ÍM2îQÒb®ó&:RË7áDNãy [ã§ 3ióµÝ3Åo_¯~be­í¿jüì õªÇAáü*!K©Ô4³ÙÇa=}6Ñ? qÔ2ªFRÖ¯ççEÔògìµ<i-Q-§G/OR*§@Ì@îÓ¿$,[!U¨©p&æ÷/ÈWÀÜ83>à°v«õ(Òíù½ô[¢µø°CÙÁÕXóMèÈztïÞf5"jIx]r;¹05dDN ­à E9L­n;/(ªä°®ÞøÿÜ!)LÙ_íÈn)EP×EOÖW×X]ò¸p\Ü-d£p¦4»ÈTM[ÐYû~¬rdïX9_^ÁÍdâÂøT_rgX d]lrÚøuhÞþ>¼hxtd;Ùà	Ú	æ	ñi9QcÐ;pã^éÛ·´¶¡¥µ«£³¯§·7( 0,$44*"2.&66)!1-%5µ©+,*.!-5+3x~yø 
þ´501+}
þ	Ç:ìÁ¿'·Ä=}òÍs#pR~¿o­,=MÌL¦ôËV*-sD4Ó8P1#FÔR:U/7úâ®Vá]=Mõ«>³ÅG9ë?ÇÖUQø
Õ°®ÍOäýsÏwÏE6|=}%û£s~%²º5îõS¦´ÖGACg·Wc >¤ðÎ?éKwRLã³+¹RòUowÖT'E÷/=MÐ/Q7Ð,5ë1ÎD2ëç×ÍZcS®tNR¹¬UÚUÏqUâµÒNæÇ1¤j/µPÂñUË®CTÑÿòÿ§6UØ-þÈ9wæ­Cw/ÇÓ]£ gø¸YhD4Ë+þmÅgÈVTQ»[ðÿ]yp]X1=M"ÎÄ3E%Å3Å;HÅ=}>RÓÚñqqT®ß¦õÍ8.!9ÙÃÍ;B-ÿ¦EõiqT®ÿ¶#àøo:=MÒA*ýûÏ¦ãdM¶ÿ§÷ÐÈ3ìàøo:=MÌVTQ{Î¤åd~:×jW¨ ¦êhaÏý9\³Ñ*Ì:z¦ðáÔ¤}²áå	ëo¥Æê7ñ>¿~·«#õ.º¡D=}¥+àßlÏù± 'Jøå r_Q(p;tÃfJ×".Ê}ÞEÃZÉí4¦«QôÂÆ=Mr³¡¸òÚÖ4ýË$´ÿöÓ¶ª0'¾¸p§Eª£ì7Á>©óÉìdfK*ò«¼Íì±q×àÈíi³Ó"Ì>jy¦Ü¡Ô½±ñ¥=Mï¤¢ÇÆ©±n¸n7¨3µ.¾o¡EE+ðìÈé}°Nèå²_S ð?tYæØÉÔÑ/±öÍ?¤ ÏéÁ>¹r·¨5Å®¿saEF«*÷ÓlÉöðg,Ï÷M1¢SÓ'äd?q½´¾qîI_%¾Ëæé)9rÅ¥óå)Tï ¯s!Âú1+ûcï!A¼Ëñ§:¾ñÐÎI
!@Åb3Ú$>³B3D~ñÕÅÞHðê|ãQí~vaß¡?hwsãfô(I^ög8Òö°ÎHá@ÍJ5¤?£Â5rÄéÆ^È÷ú&KQé^FYS¡=}XGóái,=}Þ
ôÁ9É³Èô¤æH)Á#q
Dä9×ìÍå½±Ì3ÒPÌ=}bôºþHq­5º­h7¶Õy?°àÔµO°ï|Ï¤'¨ö¨"}îºa),{=}= AuBk»+éc\x~Him5¸h3æ¶¿ðçqÔ¥Ï°ëu|ÿ¤%v¨$]n»Y)([<Xu@[ê×i>b°·LÜ¾RydàÂSC×Ûû«qqnOUû×«¬eÙÍ]Îs3%áÅ3Q©3ÅSE.Å3¾FËqöî:Aqµ¾lF±¡ÞÒldk¡¹¹ùxW²ZßGñjÌ«zDÍëøÖyIp¯ÎÿëºDÑ§/ -ý: iï²)$EEPõ 	u_f_+Û:ôÖêºH÷´JÔ5Ú Ö-¬ÿ]Ë½Lz qÇÞdý>T~ÐWp¥&ååÀóú^´ò=MMÀËñ§µ#B»"ªRl«ã'®«­eÔõé67ÌnEøþ{íP×pìüZ¢Çg*«ÿÊ4)2Ï¢Ét? ¶¬Ú!Á¯@ê¤î7úÞ±Ý°µWØmøNqås÷ßöÝÇ Lf¤ú)ëLÄ¤T¯¼Î@µøI cd¢KÙF×¨b$F²³ê(´1ïEÆ~8Þ3XÖSF¶æ¼ºÉÚm°(àÞÂ×+æÁcÎ¬cár
§6ã'xpÂ@IQcY= 2Ä·¯Q5'ðÿP89a«n¹l¹kÖÑ89¹.7DÞ&3]ÝãEWÌw\Xd[ñ(OÓvz(Ç¿ö?³V%ðäõñr)r%Àç6ëy±~«
¥¼õ$!u*½ý3Ì¤/AôFxÞ¡0dûr¾¹dJe3gK×ÞAØXXh= °W«%½¸¤Ûð~Áå*Âòý5¤#Áò+ÿÑ2çÙ°pk	º½$&pâým³».´Då°të	»Í$Fpæ=}u3».ÔD'[Ñ¹ö sK ¶'<õK¨¶§=}K°¶'=}K¸¶§>%?)R3ÿð= X¹pØXhhûÀ²SÆ7wä~ÕÏQÖÎU'?1MÒÎ÷µC	ÃÕÎEU1ÍvÎõçµ?½/Q1ÍwÎ5çµO½/U1gÎ%ßµKº/T0§Î%ïµK¾/T1í_J¹¯¶D"çµÑ
·Î=}%T1-_ÎMÛµÕ¹¯×0-ÎMãµÕ»¯W0-ÎMëµÕ½¯×1-¿ÎMóµÕ¿¯W1=}Ùµ0=}ÝµÖ0=}áµ0=}åµV0=}éµ1=}íµ7VNð?ÃÓ¹Ã²3vN
ÿõ±ô!1ô)±õ115µ4!54)µ515%$Ä$ $$D$(%,Ä%0%4D½xcñ 
êñD¼£ñ"®
îDÍoÌÌ¯ÌÏÌ ïÌ¢Ì¤/Ì¦OÌ¨oÍªÍ¬¯Í®ÏÍ°ïÍ²Í´/Í¶Oq¸Ùap¹ÝqÎpºáp»åNp¼é¡q½í±Î++mØd(rÑ²N<Jçø¥ÄAKT×W÷K&Q?ËWñ?$ïÑ×N!Ö1Sç<ëê·J¤!QÿçLë*·R¤AUßßHi¶§Ðb·9Teç?HTf'OHTçg;PVä§;/PVåç;?PVæ';OPVW.aYØXØóiäÎ	-Y£g*ßLzU §*ïL~U¡ç*ÿLU¢'*LU£g+LU¤§+/LU¥ç+?LU¦'+OLU'gJßTzW §JïT~W!çJÿTW"'JTW#gKTW$§K/T?×ÅÀ&÷KCT'7KSTvàg:ÝPyöà:åP{vá§:íP}öáÇ:õPvâç:ýPöâ:Pvã':=MPöãG:Pväg;Pöä;%Pvå§;-PöåÇ;5Pvæç;=}Pöæ;EPvç';MPöçG;UP×
´_]XØhÜâÑU³QÙn$_>_KÝQÔºÖ7ð×$JëÔ}×!¿JóÔW!ßJûÔ×"ÿJÔW"JÔ×#?JÔW#_KÔ×$K#ÔKTKÔLTLÔMTMÔNTNQFS\[xXXXõÅ3Å3Å3Å3Ås1ùå
R²CBrÃJÂÃV¢ úÙÒûÞ~@ûÚ²@ú¡­,®§½-,¬Õ­¬¯£µmýò2Aýô²òAü÷¢BÁýóz«¦C4ë¦;DK¦E$Ë&á¬ ~ç¼* |ßÔª ã´j|ñÂÞ1>ñÄòñ>ðÇâA¾ñÃüª#ê£ôJ£Ê£ìP"CÇS*ÇU6#Q&S	"^3D	$róD'bCÄ	#Ú}¯5È3ïµË+uOµÉ5Ïµ,ÂsÅ/ÊÃÅ+Ö-Æãî][ÄH^e¤È_]Ì]Yê ºàö úáæPúàîzbäcaì(b ûæNÐ{ç>;çR°;æp	ÉD4[ä|±XØ9Å²û.ÂÄ3t3¿3Å]?ð¿!AmKì"¯wÙQa½Êt¯T?V}ÃØ×¶m[KgÎëen\øyßntà§að8ÛÚdryÜ|b@Ýpf¨XjöDyí²a|ö´²É|j[ýLºâ¢Áî¨êük¯º }Û HºÁ,¹ha<)Þk©pûgT¨ékÎÜùýà4à;h­dyóÕü«ç|ê§&÷ÊRw1»§âAõµtþò¹Øã|q¸â_JãcÕÕRÚ¿?¯18= Ywz¨¸ÙcYøn§1ÛæPjáj£´a|îÐ¼09pÓaú¨¹ÝséØtÓa¿w>;§ÂÉðµ|êÌ>r~!Y«Äè÷3S}CðöhÓ= X4ø·ý=}½kÖhUK²X¶&(_!piã4~U!>ga¡QµÎo5E¨·e×6Y~§KsÈHÐ=}3ËÝ¤,3+=Mò|´D= s"19¹94¿ß?¢Þ»g¢."ªæræsçqæAçÁ]U	ââDâ
DÙ VààÍ³ÄvÒ2;	5c±-ìÊöª§}Ou¡¡¦îGÇ D0jn²sõ=Mx|PÈ±Â½²½²¿· ¸(¸(;+ÞKÏ°ÂVÚ1ãnç°B/qCf.ÿív§'"®Bójóë²ê^m;c+V=M¹ñ	!½í¡©Eéµ	[¹¹¹k¶«6Ë&£/15<Èû+ç°¿I
1î±ò0Íx4°ê²ôªé¶ï*ò(B¯LÓO¥D\Q.]¿å.pú{^»[Þ[ç^&\Æ·EÊû?=M¶Ï8HE+®ãNÆçBR*JbJJò=MSs«3«Ò-â¡èº¨¿TÞØÍ72$= À*Þh~ø»þµß£ôæöoÔôùí¡pæz±/°0ÓÐÑSPRQ_\\^]]ãTù?ëÁ¢8>Ê  Zï²Ðvòxümî2xýuöo,= {ìXx¹U!Rí¸aP7WV&ít\9ÔæØ8b[öØ8cP[ÙHoÛLlajÛYÈÅGÇ3Å33Å3Å3ÅSvÂ5!ï|ê¤A¼ê¥Qlª¤=}¬ª¥M*¤EÌ*¥Ud$;¤%só}³3{ÓSËx_ËßË|ËËzËÿË~¿Ë?ËyoËïË}¯Ë/Ë{ËËÏËOKxgKçK|§K'KzKK~ÇKGKywK÷K}·K7K{KK×KWÏQè½±%².k ùÜk¡	ë üë¡<« ýì«¡=M,+ +¡L ûä!N,¦ï¢^1ékmA!Ä#ýÔ D=MT¡CÔ=}¯ÒoðsÙcEa· ¤À´Ä¾,ïòa³ëÿ/KbË»/íÊ²½þD²~Ã$ác/23Í³Ç¦4q¸GZMl|ÿ¸ñßðsÂD6mÆGzD¼üå
)ÐuC7S¥Ú7~R§êW~xÝÁ&¤ÏÎÞ5í=}&tÏ?y§QÂ¬³érã-²>=MïCðÿ®A²Ç=MÒ+ÃÛösM6Ûn±!üµõBê­ç$R¼/±f!Ì»vïMü$ÿ½Ã^sñ~¾
ñ1Ä¹³ñ-.¾1ÅÇÞÞñFÂóIö¾5/&F'Ù¶wDÕÏ7tAS'	VÓ¦Ì.!&-1¿;Ïõ;&K4ÕÙr®#ýÂ´Å¯Ir=M¶ÿ>s,ÖvÆ-#uÒ£ÇO@IÖ ?LVðdöì+Ñ¦ @½±¼Od7í=}_U°÷"Pc±Ç¸ðtø»¡T­gÒÉª'¾ÄO¼Å3mN.2Å3Å/2rõÖËPóOV\7VZ¯WfføY[äaÈ¨ydbÙeY~]-øCö]ÊÐ£ÙAØ	YH·g¦4Z<&8F_V©¸æß4h´[:¶÷YQvØÙjäo¢øiôÐðö}= ÆCc$çÚ´*Å(ó°0± ?÷n¾Îà	ÍÐ;yT³ôP±= ±uµäð<VckÌhwâxãiôéRì>õ»KÅôÛÄìÇËº¥d§äçù¾!wE£ø§¸ßë UëÐw|iÃþgþp³ñå{áo¼è=M±4c
½ZËÍ]íí\g­z.VübÑ ¦
^Õ»e¾å²Ö f-³'á7,{'Ãx°ú¢jKdÊß&EôÝV×nNëéÿ&3ÒúÉv$¿D;QÐgkIA o;Æ\×Ìþ¿qî=}\¯ì;¯ºzÓóÈ®ÃÇ.Ú1í5ÞË"COG¾a^Ò¨_LºC{OÑF4L0e{Ëf6bÉM= þ"0;ÑÃ8³W2 Pß·´w=My(\¿ÄÚðqNÕó{0j?ï(¿ÇÛA7WNïGà2º¿¦1mQÆ\¯EÙÈ$ <¾Fßó7w}8¾c:iH»øhÛó?Ù7dJxÖ@ãeIW¸Ñÿ¤bT/]²
¨ËPÏÞàÇr>>\M=UÐì=}ç17ãy*a®-ÍnÉ»¡pFeçñlþ	=M¹3ÃþÈsæt¦ÔNñ¤bsl¾¾¾¾¾÷RBUGG³¬	¨ædH­¨íPpXÅ½\Ä_k]¾õ	X$rÈ¹fåÉ^L)e uYIX>ÞgqµX«yÝUfÀ§8
Ùup3q@Ý±uXtX07=Mp_¤I¬ø®®[¦ó[ÀRVsX?F^":ha?ØÎeÄQc{Yíz0j¹{b	×c4ö= %¡ì?XÜñÊ,xþÀf©ûyO}:Fà= NuÙO_hÌÍtÝg|È³]²(a= TÜøN»j/Ì|éÚ{^ëÐÖ{¡Çzñú_|Åûl*Ztì{8¯a@©¥ZKØ¨c¿i<±üFÇkº-cy5±4§o9Ñ,;KzÌ $à1I=MºôÉ©¤=MêÈ5
}õíë(ðìÍäWD?£©ÿãª=MäÒ±ì6í)ÏÙtbFÐöÚFÈ´Ù§R1.]¢¦¨ùû­,9ïtö»LÂôâ¦qªk{ä(9«4>°»B¶ñ»GÓ½vÃâ£d$°A0ô¼¦­d=M¢«£Àß}â$æ0òÊ6¾%¼>3(-D+ÂÔÂo7#æFåEIîkNDÒ_&3iÍHÌúk&@âk1ýîW¶Y¬XÞXáXâ¢XEeØØÈ\gi,Ç~æ{Ü-ïÈÛx6Û{í8+¾\g¦ñÛírô9³®°3D_åãxQÈxþÚ·/ª= Íu_ÌuL^t^{g9áq?ª(üo!*Írâ&ÃËì÷¨Pd×ºÓG)àþê¤sJñAÉå$AÐNÎçõnD1MøhO¥me	QÊ¸[F< ^MBÜÛ
 AãÏ§üï4î%M°6MùtN)FR[¾FqV6¥óðlò©Ë= c»R=}Ù8õ.­%BÂIµÃI&æ×U1Q«Ïñ3&Ñó ÓÝ»ñ²eL°(ÑòOzBð·Q]üôföê+h.³´)ÅKé¥JR#/GóuÉÉ¾ ¯Áõ¿-½ñ'î<·Q¼=MÛ²6+þç­Ydb_ öcHmöôØ²j¾nÚ7aÌv ØOå¹÷e0FfÂÊÈønØ#?ÁhÊÀcÝåõ(åû)ü)éðÐº¿ÓÜ¡]qákÈÛÝL·ºrCMmp_ÀÏ Óìcç6®þsosÒÝóô1¬Ã6<2#Ò±C65Q"4B&pç
gUng= !þ+µèm	M½Êê½½²¦é%0Yg~´p5.\Ø®z y9%ÔiÜ!ÙcÝÅ¦H>ÓXÿZR[¬&ønÇlÓ_:ïi«ñ<ø"QÚ©yz®ªOL¥ÎêÌÝi?Ê'/Ne»:2NÅÝ_òspüR	Oø!!ù+##üÓkéªX-fpdq[U*]@ ö¨5ÍpÖY hÜÂª= ÛN3{ü® À)¡9þ-1® ÂcBNö÷0+È6òÒÑ;lÅ^_>ÓÛQ&jðMIì¤³àlS×jÎ¢@ÈåÕ¢­on=M°©xÉûÖäav=MM©²öÖ¹?{ÃßîøyÛ= 0òûÏ4grèNÒíÏqëðð-êö¸á¥$¨Q.Ò4ä¿V$N_Ý><´æë[â²F#T1É'utÿZXÁ(oàx¡Jo"­öùSæ÷ÒUFÓs* U¡ÓºUµøGáL¨÷©ASjÕ®'!L¢ÕvC¿m·Gâ¼N¹³OÃã§1T:ê¹\Z£ËZæ.î}ª°O'ãÃ ¾I;ûÁHÃä&ÃÐÐK@3EÅÓÉ>½e@ã/òi¡|ÃE³{ñSCmÎëöÁÐÐ%Ó>d''¶9Á/T.N?äª	æÿÀÐÐ%Ó¶öÂ¾ì¦)ÃÕ÷×"e|ÃþBåýrv¶K6öuâÐÌRÎËýæ×%I­OIø¦Ä(HTJ~),ÕDCWWÃö(VwV=M§TsLP³ þV'tT#¡ZLêé;ßù[`});

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
    wasmMemory = wasmExports["g"];
    updateMemoryViews();
    // No ATPRERUNS hooks
    initRuntime(wasmExports);
    ready();
  });

  // end include: postamble_minimal.js
  // include: src/opus-decoder/src/emscripten-post.js
  this.ready = new Promise(resolve => {
    ready = resolve;
  }).then(() => {
    this.HEAP = wasmMemory.buffer;
    this.malloc = _malloc;
    this.free = _free;
    this.opus_frame_decoder_create = _opus_frame_decoder_create;
    this.opus_frame_decode_float_deinterleaved = _opus_frame_decode_float_deinterleaved;
    this.opus_frame_decoder_destroy = _opus_frame_decoder_destroy;
  });
  return this;
  };}

  function OpusDecoder(options = {}) {
    // static properties
    if (!OpusDecoder.errors) {
      // prettier-ignore
      Object.defineProperties(OpusDecoder, {
        errors: {
          value: new Map([
            [-1, "OPUS_BAD_ARG: One or more invalid/out of range arguments"],
            [-2, "OPUS_BUFFER_TOO_SMALL: Not enough bytes allocated in the buffer"],
            [-3, "OPUS_INTERNAL_ERROR: An internal error was detected"],
            [-4, "OPUS_INVALID_PACKET: The compressed data passed is corrupted"],
            [-5, "OPUS_UNIMPLEMENTED: Invalid/unsupported request number"],
            [-6, "OPUS_INVALID_STATE: An encoder or decoder structure is invalid or already freed"],
            [-7, "OPUS_ALLOC_FAIL: Memory allocation has failed"],
          ]),
        },
      });
    }

    // injects dependencies when running as a web worker
    // async
    this._init = () =>
      new this._WASMAudioDecoderCommon(this)
        .instantiate(this._EmscriptenWASM, this._module)
        .then((common) => {
          this._common = common;

          this._inputBytes = 0;
          this._outputSamples = 0;
          this._frameNumber = 0;

          this._input = this._common.allocateTypedArray(
            this._inputSize,
            Uint8Array,
          );

          this._output = this._common.allocateTypedArray(
            this._outputChannels * this._outputChannelSize,
            Float32Array,
          );

          const mapping = this._common.allocateTypedArray(
            this._channels,
            Uint8Array,
          );

          mapping.buf.set(this._channelMappingTable);

          this._decoder = this._common.wasm.opus_frame_decoder_create(
            this._sampleRate,
            this._channels,
            this._streamCount,
            this._coupledStreamCount,
            mapping.ptr,
            this._preSkip,
            this._forceStereo,
          );
        });

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
      this._common.free();
      this._common.wasm.opus_frame_decoder_destroy(this._decoder);
      this._common.wasm.free(this._decoder);
    };

    this._decode = (opusFrame) => {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof opusFrame,
        );

      this._input.buf.set(opusFrame);

      let samplesDecoded =
        this._common.wasm.opus_frame_decode_float_deinterleaved(
          this._decoder,
          this._input.ptr,
          opusFrame.length,
          this._output.ptr,
        );

      let error;

      if (samplesDecoded < 0) {
        error =
          "libopus " +
          samplesDecoded +
          " " +
          (OpusDecoder.errors.get(samplesDecoded) || "Unknown Error");

        console.error(error);
        samplesDecoded = 0;
      }

      return {
        outputBuffer: this._common.getOutputChannels(
          this._output.buf,
          this._outputChannels,
          samplesDecoded,
        ),
        samplesDecoded: samplesDecoded,
        error: error,
      };
    };

    this.decodeFrame = (opusFrame) => {
      let errors = [];

      const decoded = this._decode(opusFrame);

      if (decoded.error)
        this._common.addError(
          errors,
          decoded.error,
          opusFrame.length,
          this._frameNumber,
          this._inputBytes,
          this._outputSamples,
        );

      this._frameNumber++;
      this._inputBytes += opusFrame.length;
      this._outputSamples += decoded.samplesDecoded;

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        [decoded.outputBuffer],
        this._outputChannels,
        decoded.samplesDecoded,
        this._sampleRate,
      );
    };

    this.decodeFrames = (opusFrames) => {
      let outputBuffers = [],
        errors = [],
        samplesDecoded = 0,
        i = 0;

      while (i < opusFrames.length) {
        const opusFrame = opusFrames[i++];
        const decoded = this._decode(opusFrame);

        outputBuffers.push(decoded.outputBuffer);
        samplesDecoded += decoded.samplesDecoded;

        if (decoded.error)
          this._common.addError(
            errors,
            decoded.error,
            opusFrame.length,
            this._frameNumber,
            this._inputBytes,
            this._outputSamples,
          );

        this._frameNumber++;
        this._inputBytes += opusFrame.length;
        this._outputSamples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        outputBuffers,
        this._outputChannels,
        samplesDecoded,
        this._sampleRate,
      );
    };

    // injects dependencies when running as a web worker
    this._isWebWorker = OpusDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      OpusDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = OpusDecoder.EmscriptenWASM || EmscriptenWASM;
    this._module = OpusDecoder.module;

    const MAX_FORCE_STEREO_CHANNELS = 8;
    const isNumber = (param) => typeof param === "number";

    const sampleRate = options.sampleRate;
    const channels = options.channels;
    const streamCount = options.streamCount;
    const coupledStreamCount = options.coupledStreamCount;
    const channelMappingTable = options.channelMappingTable;
    const preSkip = options.preSkip;
    const forceStereo = options.forceStereo ? 1 : 0;

    // channel mapping family >= 1
    if (
      channels > 2 &&
      (!isNumber(streamCount) ||
        !isNumber(coupledStreamCount) ||
        !Array.isArray(channelMappingTable))
    ) {
      throw new Error("Invalid Opus Decoder Options for multichannel decoding.");
    }

    // libopus sample rate
    this._sampleRate = [8e3, 12e3, 16e3, 24e3, 48e3].includes(sampleRate)
      ? sampleRate
      : 48000;

    // channel mapping family 0
    this._channels = isNumber(channels) ? channels : 2;
    this._streamCount = isNumber(streamCount) ? streamCount : 1;
    this._coupledStreamCount = isNumber(coupledStreamCount)
      ? coupledStreamCount
      : this._channels - 1;
    this._channelMappingTable =
      channelMappingTable || (this._channels === 2 ? [0, 1] : [0]);
    this._preSkip = preSkip || 0;

    this._forceStereo =
      channels <= MAX_FORCE_STEREO_CHANNELS && channels != 2 ? forceStereo : 0;

    this._inputSize = 32000 * 0.12 * this._channels; // 256kbs per channel
    this._outputChannelSize = 120 * 48;
    this._outputChannels = this._forceStereo ? 2 : this._channels;

    this._ready = this._init();

    return this;
  }

  class OpusDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "opus-decoder", OpusDecoder, EmscriptenWASM);
    }

    async decodeFrame(data) {
      return this.postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this.postToDecoder("decodeFrames", data);
    }
  }

  assignNames(OpusDecoder, "OpusDecoder");
  assignNames(OpusDecoderWebWorker, "OpusDecoderWebWorker");

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
  const coupledStreamCount$1 = "coupledStreamCount";
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
  const preSkip$1 = "preSkip";
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
  const channelMappingTable$1 = channel + "MappingTable";
  const channelMode = channel + "Mode";
  const channelModeBits = symbol();
  const channels$1 = channel + "s";

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
  const streamCount$1 = stream + "Count";
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
      this[channels$1] = header[channels$1];
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
    0b00000000: { [channels$1]: 2, [description]: stereo },
    0b01000000: { [channels$1]: 2, [description]: "joint " + stereo },
    0b10000000: { [channels$1]: 2, [description]: "dual channel" },
    0b11000000: { [channels$1]: 1, [description]: monophonic },
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
      header[channels$1] = channelModes[channelModeBits][channels$1];

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
    0b000000000: { [channels$1]: 0, [description]: "Defined in AOT Specific Config" },
    /*
    'monophonic (mono)'
    'stereo (left, right)'
    'linear surround (front center, front left, front right)'
    'quadraphonic (front center, front left, front right, rear center)'
    '5.0 surround (front center, front left, front right, rear left, rear right)'
    '5.1 surround (front center, front left, front right, rear left, rear right, LFE)'
    '7.1 surround (front center, front left, front right, side left, side right, rear left, rear right, LFE)'
    */
    0b001000000: { [channels$1]: 1, [description]: monophonic },
    0b010000000: { [channels$1]: 2, [description]: getChannelMapping(2,channelMappings[0][0]) },
    0b011000000: { [channels$1]: 3, [description]: getChannelMapping(3,channelMappings[1][3]), },
    0b100000000: { [channels$1]: 4, [description]: getChannelMapping(4,channelMappings[1][3],channelMappings[3][4]), },
    0b101000000: { [channels$1]: 5, [description]: getChannelMapping(5,channelMappings[1][3],channelMappings[3][0]), },
    0b110000000: { [channels$1]: 6, [description]: getChannelMapping(6,channelMappings[1][3],channelMappings[3][0],lfe), },
    0b111000000: { [channels$1]: 8, [description]: getChannelMapping(8,channelMappings[1][3],channelMappings[2][0],channelMappings[3][0],lfe), },
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
        header[channels$1] = channelModeValues[header[channelModeBits]][channels$1];

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
    0b00000000: {[channels$1]: 1, [description]: monophonic},
    0b00010000: {[channels$1]: 2, [description]: getChannelMapping(2,channelMappings[0][0])},
    0b00100000: {[channels$1]: 3, [description]: getChannelMapping(3,channelMappings[0][1])},
    0b00110000: {[channels$1]: 4, [description]: getChannelMapping(4,channelMappings[1][0],channelMappings[3][0])},
    0b01000000: {[channels$1]: 5, [description]: getChannelMapping(5,channelMappings[1][1],channelMappings[3][0])},
    0b01010000: {[channels$1]: 6, [description]: getChannelMapping(6,channelMappings[1][1],lfe,channelMappings[3][0])},
    0b01100000: {[channels$1]: 7, [description]: getChannelMapping(7,channelMappings[1][1],lfe,channelMappings[3][4],channelMappings[2][0])},
    0b01110000: {[channels$1]: 8, [description]: getChannelMapping(8,channelMappings[1][1],lfe,channelMappings[3][0],channelMappings[2][0])},
    0b10000000: {[channels$1]: 2, [description]: `${stereo} (left, diff)`},
    0b10010000: {[channels$1]: 2, [description]: `${stereo} (diff, right)`},
    0b10100000: {[channels$1]: 2, [description]: `${stereo} (avg, diff)`},
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

        header[channels$1] = channelAssignment[channels$1];
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
      header[absoluteGranulePosition$1] = readInt64le(view, 6);

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
      header[channels$1] = dataValue[9];
      // Byte (19 of 19)
      // * `GGGGGGGG`: Channel Mapping Family
      header[channelMappingFamily] = dataValue[18];

      header[length] =
        header[channelMappingFamily] !== 0 ? 21 + header[channels$1] : 19;

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
      header[preSkip$1] = view.getUint16(10, true);

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
            header[channels$1] - 1
          ];
        if (!header[channelMode]) return null;
      }

      if (header[channelMappingFamily] !== 0) {
        // * `HHHHHHHH`: Stream count
        header[streamCount$1] = dataValue[19];

        // * `IIIIIIII`: Coupled Stream count
        header[coupledStreamCount$1] = dataValue[20];

        // * `JJJJJJJJ|...` Channel Mapping table
        header[channelMappingTable$1] = [
          ...dataValue[subarray](21, header[channels$1] + 21),
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
      this[channelMappingTable$1] = header[channelMappingTable$1];
      this[coupledStreamCount$1] = header[coupledStreamCount$1];
      this[frameCount] = header[frameCount];
      this[frameSize] = header[frameSize];
      this[hasOpusPadding] = header[hasOpusPadding];
      this[inputSampleRate] = header[inputSampleRate];
      this[isVbr] = header[isVbr];
      this[mode] = header[mode];
      this[outputGain] = header[outputGain];
      this[preSkip$1] = header[preSkip$1];
      this[streamCount$1] = header[streamCount$1];
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
                this._preSkipRemaining = header[preSkip$1];

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
      header[channels$1] = dataValue[11];
      header[channelMode] =
        vorbisOpusChannelMapping[header[channels$1] - 1] || "application defined";

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
          oggPage[absoluteGranulePosition$1] -
            this._previousAbsoluteGranulePosition,
        );
      }

      this._previousAbsoluteGranulePosition = oggPage[absoluteGranulePosition$1];

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

  const absoluteGranulePosition = absoluteGranulePosition$1;
  const codecFrames = codecFrames$1;
  const coupledStreamCount = coupledStreamCount$1;
  const data = data$1;
  const header = header$1;
  const isLastPage = isLastPage$1;
  const preSkip = preSkip$1;
  const channelMappingTable = channelMappingTable$1;
  const channels = channels$1;
  const streamCount = streamCount$1;
  const totalSamples = totalSamples$1;

  class OggOpusDecoder {
    constructor(options = {}) {
      this._sampleRate = options.sampleRate || 48000;
      this._forceStereo =
        options.forceStereo !== undefined ? options.forceStereo : false;

      this._onCodec = (codec) => {
        if (codec !== "opus")
          throw new Error(
            "ogg-opus-decoder does not support this codec " + codec,
          );
      };

      // instantiate to create static properties
      new WASMAudioDecoderCommon();
      this._decoderClass = OpusDecoder;

      this._ready = this._init();
    }

    async _init() {
      if (this._decoder) await this._decoder.free();
      this._decoder = null;

      this._codecParser = new CodecParser("application/ogg", {
        onCodec: this._onCodec,
        enableFrameCRC32: false,
      });
    }

    async _instantiateDecoder(header) {
      this._totalSamplesDecoded = 0;
      this._preSkip = header[preSkip];
      this._channels = this._forceStereo ? 2 : header[channels];

      this._decoder = new this._decoderClass({
        channels: header[channels],
        streamCount: header[streamCount],
        coupledStreamCount: header[coupledStreamCount],
        channelMappingTable: header[channelMappingTable],
        preSkip: Math.round((this._preSkip / 48000) * this._sampleRate),
        sampleRate: this._sampleRate,
        forceStereo: this._forceStereo,
      });
      await this._decoder.ready;
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this._ready = this._init();
      await this._ready;
    }

    free() {
      this._ready = this._init();
    }

    async _decode(oggPages) {
      let opusFrames = [],
        allErrors = [],
        allChannelData = [],
        samplesThisDecode = 0,
        decoderReady;

      const flushFrames = async () => {
        if (opusFrames.length) {
          await decoderReady;

          const { channelData, samplesDecoded, errors } =
            await this._decoder.decodeFrames(opusFrames);

          allChannelData.push(channelData);
          allErrors.push(...errors);
          samplesThisDecode += samplesDecoded;
          this._totalSamplesDecoded += samplesDecoded;

          opusFrames = [];
        }
      };

      for (let i = 0; i < oggPages.length; i++) {
        const oggPage = oggPages[i];

        // only decode Ogg pages that have codec frames
        const frames = oggPage[codecFrames].map((f) => f[data]);
        if (frames.length) {
          opusFrames.push(...frames);

          if (!this._decoder)
            // wait until there is an Opus header before instantiating
            decoderReady = this._instantiateDecoder(
              oggPage[codecFrames][0][header],
            );
        }

        if (oggPage[isLastPage]) {
          // decode anything left in the current ogg file
          await flushFrames();

          // in cases where BigInt isn't supported, don't do any absoluteGranulePosition logic (i.e. old iOS versions)
          if (
            oggPage[absoluteGranulePosition] !== undefined &&
            allChannelData.length
          ) {
            const totalDecodedSamples_48000 =
              (this._totalSamplesDecoded / this._sampleRate) * 48000;

            // trim any extra samples that are decoded beyond the absoluteGranulePosition, relative to where we started in the stream
            const samplesToTrim = Math.round(
              ((totalDecodedSamples_48000 - oggPage[totalSamples]) / 48000) *
                this._sampleRate,
            );

            const channelData = allChannelData[allChannelData.length - 1];
            if (samplesToTrim > 0) {
              for (let i = 0; i < channelData.length; i++) {
                channelData[i] = channelData[i].subarray(
                  0,
                  channelData[i].length - samplesToTrim,
                );
              }
            }

            samplesThisDecode -= samplesToTrim;
            this._totalSamplesDecoded -= samplesToTrim;
          }

          // reached the end of an ogg stream, reset the decoder
          await this.reset();
        }
      }

      await flushFrames();

      return [
        allErrors,
        allChannelData,
        this._channels,
        samplesThisDecode,
        this._sampleRate,
        16,
      ];
    }

    async decode(oggOpusData) {
      const decoded = await this._decode([
        ...this._codecParser.parseChunk(oggOpusData),
      ]);

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(...decoded);
    }

    async decodeFile(oggOpusData) {
      const decoded = await this._decode([
        ...this._codecParser.parseAll(oggOpusData),
      ]);
      await this.reset();

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(...decoded);
    }

    async flush() {
      const decoded = await this._decode([...this._codecParser.flush()]);
      await this.reset();

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(...decoded);
    }
  }

  class OggOpusDecoderWebWorker extends OggOpusDecoder {
    constructor(options) {
      super(options);

      this._decoderClass = OpusDecoderWebWorker;
    }

    async free() {
      await super.reset();
    }
  }

  assignNames(OggOpusDecoder, "OggOpusDecoder");
  assignNames(OggOpusDecoderWebWorker, "OggOpusDecoderWebWorker");

  exports.OggOpusDecoder = OggOpusDecoder;
  exports.OggOpusDecoderWebWorker = OggOpusDecoderWebWorker;

}));
