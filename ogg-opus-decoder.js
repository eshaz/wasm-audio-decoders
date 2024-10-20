(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-opus-decoder"] = {}, global.Worker));
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01a36c6f98c83ø%yã¯#6ïIØh¼ÿ-^º*:8ÖJÒ#Á(¶3ùsÕÿ§£/.*[v²¯\õzºÜá»(oBM×å ÊvmË1±Iü(&Øb?0=MáPðxA%TÔÎ=} c×0ÓPùN:Ê£ÌÓ±æQñÒ¥M_ªqA1kð¹¥ÊÇ@6u§­k¿Ä9Ó²FÒà(A£c£  )ìTÃ=M]+àaåÅBÃ±cÈ¼{±!ÕÕ_ò#²ßá'Ö«ñÛ.ò¿á(h¯Äò´ýÏ ÆB\0¬E¸?s*iê9)~QÄõÿ6+º·=Ml½UÀ<i½í¤ìgà°Wå,µ$Ü®(m¬ézq§6¥Ô"±¬o1ÜGw¾Yüá¼¸Æ$)ÍÏ(!jÃä »ãóªI,XÍÑãÈ_Ø±ã°=M6ØJX½>«¥$´ªFÏó	÷¨M/§=}WÃs¥FÈ$9»PsH0Ç3»P®WqöCðé~¥Ö}¸:taã/±©Ý×sôdv[<áëx[ôÿ0bñRºÊ½jËzhq¹J"Ò'*¤0Ó34Þ¯rÑöv[B/¨¿ê9!ïr÷²Çn5ÉMEk5Ú?7Úk,*dÔörÏk4VáÔÕÖÝjooooaú¼l^Û=}MQï]½ßQ²lÂù[g=M9	~êÃ3¨¨Ó 9ñgGze	¹©ulfÙ	|¯Sà¦oÌt= ¶zÈ<Ã·ÿñºßÏÃh]9Í©:#Dãø»­3LeÙ	¯©[¿)hÓ¯fó¦Ûæþ?p9
VïÈnÊ á$Ëµ¥Ö%Ú1Érn:fÓ¯æ¸©Õº£¬ó+ |;ýoô:*W(©Jÿ+vOÄb7<×­ßëÙ	[)oU89~ÚÇ3Í¿V¡N¢&¿vlGÐäÝk©&M6» ¡6!^°©äÞÔûÏ vÚÃBÆL¿,Y+ÏÇjàìL£¡Rñ¤ekX\ÍyF= 1X1ªhýQ^údç@!G
¥ Ñ)°+w±yÅIOiÇµ;gR#ó¨'%âfº£P¾ SÃã[¥Eýc&0v¢\G-ÌÏùÙ¡ÜpSX-UQÏ <ÄJ#i"Ú<Ùo;ðúÙ¡Ú6i¹|#òm·ÝßÝYÐÓ	= ë$}¥Ö
q_.Ä¾³}ÊðÿXi·xKQQK=MÎKÚ8ÏR«øé³M[§ÍôÛ§@4åÁË¿Ç(=Mð2¦ù ÍèÃÊÃ
Ë'ÇeÜ3£<ü¨Ü&lw"j5i,¤{öÞØ~OcÒWØ®æÏ¦ëJòªéøX¦±n«rüÆ»g/Ò	ðlzd²IªÎ~¨Ö j=Mv0ª¬¢©Aí~DøÝõU±nø+møFÛæiáFU'ª³'ø^%npÂû d)"~ßVÔÒY¿gò}Q7"Ìæ]Âº¯eFZ0í îv ídc§ª^i\Ò	qÖáÏ¿û·Ãdý©Äî-|7Ñ{à~UrÂVÆ¯£ª/wYÒF',nÃæV¶ócyçiØç7µe$ É~)&òûô$d1G5Sê=M@= ÓçÓ^=}Q²U¾µ:ã7ç4ÿît3?Âvsºïÿ
ðëA¨ 4e\WÓXÉ2¾Àl<U£{>f«#¬pªÔHê5_Ìîr³éÄ¼áõ,=}ËÖõ7Â= = T	qãMaÑ¤Ö)_;©T$¢¡k"×b¢"lë­}åëí"ÐDã:Ôo5{Ïªæ6Nnû?=M)~9Î* ä@­Äk¨c$ne&^3ÕÔ/Vì§"ñ1Ô¯»3Hæ}oTÏ{ËZ= jùÔòó¡6_DÒKM÷ÞwÙ.tRc£I!fuWw¶YYT»° I ·®D=M5ß®ÆhÙðí=M¨þ­¹§«ùïËÔtëYÌìnÉÔ~eóóÌ
íef»1öýÆìôu)Àê±tõ¸pK*ÄÕ;ñßé;{OtÑü;åpñÞSØo¬9<{	ÛS¼Súë!<qV»¶ã®Ôlù>Ä,(s³UÊ­Õ£õ5Éµ-û©^Üëã¶SÃC%(%^}3ùIã4}ý¼|
^ëºhÜ*ßÓ{ðÕ¥rí¬Øz´cTd<xOZ¡5¾µÙà?´àLsk|êLà; -«)rSXY»ûWf³Ü{JAÀÀÐ.pD× LØIÞoÉHö¤ÍI§{®/¥õ= 'ç+éy¹¦3ÁMjÌ:mÕP@²û×,Ö½0ù	:ÒÁ>!\¼á0%ãôw¡AGi´à/X®¤k¯þK²Ï:ÛÑýPHõ·_rÊ¾²îrÈO¸û8u=}ðè¡¸8ÐÑØQR5y)P/¿!5ÇZ#lõ;4°0­ÅÉ±RµòòÁ{±«W¯üý²!¥ú¯×U1¼{gÏTïìÑîu´&iFÀ7zÅÐ÷îHÁªT÷°s©ãÞCu½Pðìô»Y$íÌ?ËÜ*=Mq¤àþ?ðN\ëÝ§Ñdñ+´ä°iyßÌzp´(õ¦Lvç»P~áÆínÄÇ:Ñ= ×k¤Oæ~Ù¶Ï¦?¨¾Uh,a[SäÅP,æu«NèÆÝýI<Ç}:«3;·Õ = ·@kj;@#G:ÓWÚµ!­[>YÂyX×vF?êÀædø!¿ñ°×_o3¥)fÇ(LÝÙª±~O÷M{^=MuØ]§6áÊc$ÅT@{õI=M{÷¼d	Û³=}8>³LlÊUÕmí(kx¾ý;çZÇâùÂÀ+·@Xª¥¡ò F@¨¾	h<FB+îQ BG¨= h©¢âcWIå
21ä²¸´R»ç]rÁÓ·³ÖÜ}À^o³ô¤ðÚË'±<<äìqNun¬Ê%vu³0îlS%Ç *þ5HV÷ø9O tõn#he¤M·ÅÏKg³æÚ=M¥L&¬67°¬Òäªw+²¥Äq¼í°EW+ð/¦MüÚù=}]Åz?HËÂ+'·¸SÁ [ð9jÐ6ÂÈÏå ò%n38áü-1t±)	Å,W¬­GÏ¸£Qå¤^P5«4w¥Ýx¾vÉ7ì¸0FI,´4§ó7-+¬öXdo6ÊHî=M¤Ä.pU´ü$¶7÷þÔ±Bãÿ)(ö=MO/k4,NHEÊzØqìß,j[I®iÈªÇë[Ò¸îl¶uB×C°sÍ×Xµ{îw+\;K½@
M(¨Ll£v¬i?æÆQPê½²óÿ>¤ØfüÐ¬v;­RÐíMj\Èìë¦æz-K{|xÐJt<aóñ/·}µ½þæF®|´h_Å ÂQ%<ÊÙg2(e3ß/¡òm6Y/= s72õr7 x¡IuhzY_1nf>©Uc|zõ¥g¸¢}ÛOÕUéñ!%@Âíç¥ßm¹v9ôÈÚ+QÒcÏ?'À4c£%%àAÛ'.¯«¸Q¸¶0dÜS³îC£÷Ý%$ô¼pÄ:¹(hLd¯<#hö1X3³¢ÏÅØèÐøå§²Íú¡.¨KqÏ¸eÿ¾H¯æîÎÜ7³u= q/<ý\ióLñ$w£GÑ¹zÿôí©¶¦EØØ²HY7RöÇNðBAÆ§8ÿ&.ði? °v°¶ìcøø¤ähá= DW×mclÜê<ô|­p7<#lïsVÊ°ä3*5ÞHñ]Þû5Gòqw,uhõÁuJ¸vJ?HËL*Ç,wðB56T=}óíB×WîyM
ÒÂÌ±[¿m)i°­M
¡Íãe§(¤78m}ô= Þw^kF#].âÂ'à6"7ï ª¢Ã*¾	¾à·UóÝ71\gÒ«k®ÿunÑH[[1Î3.'5à·ËßuCLBÔgî­ïÖaäèûV3_×ÏævOqaçUZ<-KsZù~©\!¼¾^Íô2^?*\ÓRG+lÑ)ÀØËDÝf|]\xÂý$4ðÛþw¸9GÐ ýA·¶¶vpZºüX@@øp	4z&²Âj3É·=Må¯= v¾gUR¨Wdª­/x·+,ae*1ù¦vÎl
^mºò¦Ó"@×¥sô#ù  ;Êr[B¢êµ- [a|>]ê6¢JHXÎÒ@:{=}qá!ÍÌ³K¡ "A=Mä= °zÞÆç*1z^5ºbÏÈ*mZUíí ÅÐá´ çÏã){ÜÄ½
8ApG× ¬·F¼EÌ1å9ÚbnX&>÷ÿÉ~1$5@Òa,à¢'¹<i´Å?2U¸Ðá©´¡ª¬;pwÌ µÑËu ý¸Æ¸fæ­¾â@À2>Ðÿy2ûL¯×VãñéÊ^sY8éíÍ,FìQÖ§<uDR.´Oôùï lh%øiîcÜUª4Jsá±|"VèhejÙSqúcá5T©¶Ê¨^'Þl ±ÞSÄ¬#ÂÀÃ"¼ôÖ£;R"¡sÙáY¿±Y k Ç5wBY®z®³
V9Ý-[°,ÒÀ\l
þyãÈËh8ºÇ@´i1üÂ&qÙÖ-b:ê|Ï3 ¯üÃ¹¦Ædù"YèIÁ«_è;÷UÓ¬pÛCôÂ»s]@ÇD ëT®\,"jif¨ 	hg£> )[Ç9)Æ,3Ó©Î¼= ¸k@ÄÊÖH7¨Å9ywÐ¢WBÄ¨)*Ó/Û#:÷¤%ÛKu3f@¿Z(M=M°/ }àPC¡OCÿîòE?¥Æ±G(´MùcpÁ0¶YE$$IH®ô¼ÚXr§pþkÞå%>ÖÚn  ºóØ@ýµÐú-²ø\ø?L©}]NõqlÅiÑ3Ï³ì¥Ú½vëýô3?r+¬Áõ¥â4Û¥ )H¤ë}ºæQ´*Ã8¡x(ðª=M=}¶wªf4¯FR!"µö·\VêT)jâßm8¨ÛM¬¥úãcFÁÏrHÖ¢8[á¦c@¡JÍûv
Tb!r~{%u·Ûû3pC0¦wnP/{³¹½ Þs³¡å5!Üf^¦³Ó"ì¼QÌ¦kú5µ-ðøD¿h6õÈ þ©ªVàÍà©×ãGß¬H#þhïdiÊàÕ\-´°3Tê¼Eû¤ .[fL¡Jü,ÉKÃ®ëBF³.Z*ÌE¨V^
¯ªf#ºuºY)êÜ£Pñf×Z	Iºæ2ÞÆÔUÇx4"BU®¯RÐúÖ:ô·eAAlD,[Oò0bÁ¡){Ãuánò\ a?ÁlaÇPæÌ+ê° ?ywíÑî.Ùãë3;+@ü>Õ= î}1võQ%n<_¸FÆï!ZµÑã}¡"ÉS°É'íÔ¶¶)ÞÒü;?í÷LäIá¨H0Ô#ÁB§#J½¢=}î¥"ÉØ\?rÚÃp®2q(=MY¯hµ ¥x4ôË_·2ögÉXP/_ÇF|Ë¾ÿfêÛ*Ó2 q¸Ó®»cþëÝSÛ¹
rÞ¤®Qb.©6®8W
³Ågz¦Û**ºYbY,ÒZð$æÍ¸oíÁhóÃdrö #°ñ0Ì^kØâ\Ìºå umónÏxÂA5ÁkmW,iÖL4aavw¹Ç°=M3ªë09WTÓ­¤Énýö§:Îâ-* bÀi­%º²ÜÖ±bÝÏ	Ïna«è
êÕw®ç§·ÁÂz ~	ûµ/<4Ç¬Õf¢P{½}Ù®ÏI ä1Áb= ÐgçM$7G=}sd¹P»ì2U©B¿eM&%T
5´iâgeúeù'ú¾"Ie$ðW´K*¼ÚE=M T	 àýoC½7Äf*±²ýÔLBÞûGW ô õ¥sÏÄûnüvw¢]×0LþQiÅK¿¬ÇÀ¤¬/´õ	4tµbU,¢2¬ ÄtppåkJÌD·É7æýD8ªüMÀLbÝå?;¤$Â1½\iJfÙèôA»ýMÝCuü)ÏUx}êßj¡4x¢âêä¯±%§^¸©ïÂõ¡´ÃÌãq§è&¾Þ°®÷á]9´Fñ Ý3+c¾ë60\¹þ7ú=MÑyÿ-)F¿ÑF¤2Ù­ÂgÍ=}2ÈHéº?é.½=MORèàl;U¸/wØs¯£à±:7p©:®¡ZLá*wE#vShdäª¥JNóq¯BîÅó¡JVAve7¿Á,´¦@0PôRC5aÚç¸\·}x¡r6Ïpoÿ÷ÁÕ«G_Ü7dqé³wJÏ¯3Ë |FKcÈ¡´+/ÍN4Jðø VnÛ·ø= ¸«A,¬*=}óo@Ú¿ö»b=MAöf_ú³ï¢ÓÑ¢ÐÌJtSò²LI>Ix'áÎº°»â=MC¼Vé^>Ý¹V9§ãÉ-Ð|£CÖËÜ­ùCt[
Fg7WÚlÂ³ä¯Õsü÷±,d%¤ÊÒzjªGI®®&)AeQÞÈÇ.ú:VÂ$Éíøßó¦²°Po{±]Êv,NXå¸P8Ý_#12·u",Æ4bà"¡&ÚªGÊz§§\üÝ½gò6Ñ&{àciÓÉ¯f»5[ =}#ÿ¼\ëe}²¾~ªi~ÆÓa§N@væ4L­lì=}Y°EQÆÈ©8÷_d*8M×ÿÐÉøa=M­³«5nm'±öq\±/+â!4g,TN»ø P©0}[zñZÿèr)¦EÏ;N¡ß$= ¢aÛÁÔdº®Ñ;Xò\tIþ}T¾grGu<ï rB¯Õ}PÞîãB=}iÓ5ÀÁ)Y.½Ãqó ÓS«N¡µaÜT,BÊõd'~²h%tüõÀíÖzô{DW Àþ=M «.v·õâñÉe6eR¾fµh¾ñ¼¶zõñèLLRYË"&ÅÃ£z{èý4LÄ.H¬41~ÈdPîÏÀ¼ð lröø*¿pÇÃiz.aá^¹î/u ?a£e±lzZÚ>\¦ê= ²HõsßÔ1/ô= F¨e´B{¸Û­ºÇûf©U8grÉ4â	²À ¾Ï+Â§¹ò@YÆª´+±õ1½Ê'·³ó¯¼ô{	1ç£Ü½~ííÍñFû{M\ÎîÖ5h¼L+;Âf4Rs³++ôp¥\±(KR{0ãÏýñÍ;&e¤»ïí9øl-Eî¦§âz{´ÈDÔ¬Ì@ìCÖt Hv¹é³ûé#= 1H/10ûÍX¬!L&Ì[(Ì£¸©äh´|®gû4×½Y~#¹øÿ'÷J×dF4¸T÷ ¥£bÏçÜþMªúSOÅúr0pÛG¯µ]LU³ÍÝH<äO³Åúª"Nðå+/±#Ñ¸£¼Ä/]»ÀÎ0¾ôËÍDÍ½IæÇÀöàHÂ=Mæké+êévË|àÅ.UK
ôF1c§Ô+ÎÜ¤¦$îP7ä¼ÕJ>ëC¸¬KX»N8üÐÀ­G2¥g>}r°ùÊæ.¨ä¸´&ÈWûq
6¹ïÿâî¨Ïº%Ú!ÜMÞÀU=}ð"ÛZ­ÃjÇ=}âY<úÍìuõ÷p¿pÕ6âqäÔfÔÜá;ÀÛ	)Û)%			^e	I!=MüíY¡NÈîRþ@/·°ÍmOÀÇ(óuWu!¸õVgÆ½ó5hí²¾8,ÚAÌr4AöäfgeÕ"Zz
i,òk¬SÎ%>6û¼u
ªùâ{rþJªÆ0³îêqvHÕS8í´öhm±hÜè¿ô<ÏjÛ
Ëä\rçÓ'ñmúÉgðB;9i¨ÜÌ{îRxø+Tz®
åÞë¥vì[JþæZmË[µ÷ª4}qRÒÜ4Ýf~ |1¬ 9¹5lK/=M0JÓNuÏMüæ­Þû¸Y4 #x|= >ÍÆZ¯:nR{ª$* ¶¶2èÌ>%m ÿQd±P-
ÁoJäcNôK)÷è63W+¨¥nÆ¡A§áÆ§ßWqsÝ#ºF
6]äc&õîáÊæ:=}Â|<f¥¢e£Àà^	Ì4Öçã#s^MY=M:­uygmqEÊÑr«¢H·ÀY>?ÕAëéXjÖb&ù ¡6âyÚÑÌúxô¬¼H'¬+5pP*þüGzñè7A)-	Ê0BDmHÐ Þ+ª0®G±uRMGm/Y<¥go³§Â4Hð=}óç6À-	éàsó9uÉ+,â¥Ò.ØöÑü0k5­Ñ¦.&ëüýpz|Ú¦ZdhæÀùèíü<= é!gaô·îØµÈIC;­|°Ëo~)ñ{Pö<FÑ{D¸ðÓe9?hBêÀ-
²×öÞ1ûWDPzö¡j÷ßøÆZ
aDM¹}éO70ÈÓÔ2?A,Æ¨d«OãÚ÷YTKmæ:¸ÆÜÆhàèdUo·æ}ÆmßwMå¾!UìxøCGHFGfnØk:e±Æ)ùTÂÊ¬o¥ü·Hp×ÛcI#º|&ûß4qYêæwA¼íE£0Ôx²'Õ'=}æ»DÄêóÈâ6jÅ^p·~Païw
¸°N¼í7­×~j:ÎG H smâmá«7-°í =}mÙi'pë*K2¡ÞâV^É%gg~lç½Ò
°oã)kË*c¦ÿJø_µ ³ÜéßÒïÔ=M°I°j,KCÌ}}P¥Øs._ÆõZ¬´äêN­»ö²¸Ã#ÊG?­UÙ­JejzûË(}®¨gñ¬Ïº<õ6ë8eK>$Öæ3ù³²sæ+¿á]#[:ÜJ6ì@¡÷!U£ i{ê= =}iU,m0Ü±ôú°ÿ×µßc¦¥ß¯S$V£N£Î®^7#Áv#I/ÙGu;ä©0xNðqßÜJd-cÅ;¿±n	ÌÇÕ"àÖQRs½BÜ|ÇI }¶à'ÛCÊ³@æ/¤Ôw+aAå©çI2äÄ+1á±TOòãÇÇçOòäÏ³z®³Ð ´ß£VTIn¸èÕ²º=}ga;v8\GTÑwax¨h{Ôdqª_j±¬ÍJßÊdñ©Gjy¨Þ´S¶ÁÞË{#À»¬Ë*ßãS¤ÞT4¾¤~©nvZmo	åt]ÒPJDwâÌ¶¿STjÝ%¸¤Îß9«9ªÏ{56#ðßyµ»SDv¨aÅ°w1¨jÉ[§2¿8¸´ÌÝÐx8Ü EýÜKv»|U¼øhÌeñë(Ã£UYçúçDSLîù_õúÇÿ(4¿º¤Ot=}w|é8HÛísfmc[DÒoêûtPW½]=}ÇsKê¼LV²6kòfÄx(&«ÁAzq1Q+j'ÕA\BZd ;W¼Ñèü*Å[À×$ì|µ±uûÈe«&G{¬öoa³F°ôî³=}C"|pzJ8ÀD,eO2f:·®¨À¯8ÂOÏÛÈ5\TöFsP¼+½#5[k0E¼ù{! ¢W=MéØ=Mx¢+áGê,?	æåh¯tgÁw´%uu¦ÅnëåÐ/Þê%Åï=}PJKqÝCG=}¹ØæS·í£ 7{ï¿8ïã¶<·<ûk e&f0½Ñ&Þ´=}ÄéN¢ØhaÄáTü%5íÀÛìl¿dU|ïp &4^Æv2{h÷ Å7+x®îß¸Hdjô@m«hÑß,Ìf9øâP^ú¦"e¥wkWxWÞ6¦¾?i²þéC»TNô&¾pHß´Â5=M:d´R, N»¸½:zÃÊú4ËB¡ÖþZ@  Ã2iÒtÅ/© FÆÉXÕÓO³¾Ûs0æ³(é»RÅ¢:zuwçÕ?½d÷8¿òÃ\¡°Q/Ý¿¡9/p_2WÚGy3f8øIëV9I.\êÿöG =M9Uý+ ÷Ü}J~@»o¨q§_>Ëd1ÕüIÃ=}=}µ¶I^pãÕñó+k#càñõ­´ö¥t(ÛC³= ­Ôuà+DÁå½çòòÃÕ= ±tx§tt>³nÝ*ë¤´TÇPJ³z°+9áÉÄ¹"ïÊ¢§2?]°¼&KiÖNrï/À¶½SLj±¬Ù±{{µO«ûTd#ÁÞË{	cÙàé%ôckª§þ²{]jé%ð¥ÙäÊ61ïë*åfa×ÿ®°zæÕd)¤¾OÆûÒà2È%P©xî%¦yûîSc]ñuD»G¦:$3ß&m¿=}JÀ*¥¹* ñ*1·Môþy61ÇoÕ*ø±úx£~ìdScäçZj.=MeäML\òc>@Òf7ý~¬ñ¥ãÜ{ 
YåQdÙ°ï0·uØÛ&qa¡Ê¦Wg
1.µ{]1nnÃeþï¤;ÖDÉYR¦Yjòæv§é²µ-õaRÛÈ\²ò¤¥Êè¦ð=MVÂ¬×MANdYËÑúa¶mà+ÂßgH»hI.Ú@ÚbLÚb%ðPðPðºoýÄlIs,w/æÃ²Ù*Ø%~@n4Î½nN"-3Õ5<i©túQmø­ÊJà³q'ØÙ¬î÷µ-¡:]R­2ÆîyOïøøIG÷îYíÑ|1Ç~Õn9\dQ©~àÖ5¯°fÖøK\baozÕfnaZB:ÑvnÕÖÖ"glíoÕrùÁ1¶ÊÅ±èçM%m_ÛKæØÈJ±A¼kâbÎû)3ÍL= õ§q Î°dËøÂ½]:}x-Ü¸£-Ì(= ð*f¢×Q ]µÈsFØdþmZ·,À^þdH!7d=}¨õè6ÁèEÁ
-ÚØÛ/o= ãÕ-  P=MQÿ°ÑÕDºYÈäÃ\ÇªÚ¸ç=}ì.s[ërGJÊDàoâ«»bÙÔÊ«!S_pðùôG¥	ÛH¿×TùË3®³ddú vêKÎ®[ïºYMÃrcÃuÔOñw¾²PYãM_ón,%Ùré¹\,Öãrz%ám:±haMUNyºã=}òævS®bÃúaËPÀSºõ»NÊc­Ü¬¡ËiôFnÎ;?]	ØsþiÄß=}KS=}íÅahGØ|ú,éfõÐ"Ý'd­NÍÍÉ
3"A}Çó©ÍøU/¾äÊºå.mÌIÛÜÎbÐ5
ëËm§ãOÑô  [wmó 3IL#Wõ¥Õ)_·¿Ðk4Eö±Kd§%#Í4wÆ:ì¡ :;ÇÐ7­ýw§æùùY|Ìq7-
\Ôo­¿+V~QÀwD}ÉÒK¹hÓ¹ÅD¡)òÅÅ£à¬üÆÏdjc¤±0ùÙª,ØÔ·}çÿÙôý½;)¾jÈÅw3x·þÇ|¬= Iï$xiÌKSÍÉL<mó<Åoª7q]o2
hþð= üIÕ®)õMÑ÷v×¨Â*ñ;©v/oæ¨K®»ÌEþÑ
¡FÔÆVíV=}% Erð¥YSHyG9ÿ*Ðäyï9)!,ä5d/î×ÑfVÛ>6t
FtCÜ5¿½= x¡K±û	p=MÌìóÁèÞ÷(+~Èðð=M\¹ÐÑ»É:(ù5XàV=MÏ¬á²Ü uSÓ%$ik<d-oÓ¿¬å5®5ÇÔàÎ³oþ!LtÜ	+4LJfI×:ïæ=}ëâÉîÒhÒ\$8%?å}¸ÿé¦ÝÅ¬ºÙÔ^¤Ö(;°¦®ë½¨ßõÚ¢Ó¨LG´èçÙ;ü1j¯Á#yï¤Æ:ÎàæpQRE1 îWøMûG9­çuwG"}õ¦îNÈfÔëI%uåzÜzoüj)²9ÁíC>ìojóy-¢Mù¯»w8,Ë1B¹³&¢­Õ¢!'!}uå³17¬HMm+Óíé	É¦]Ý·oÿQÕp§/<bC2êÌØ|~dr´<ø.:a4ëTCãðEmóiï3âTÀÑì7p#¿Ì1Äð¾Ì_ýä\mñguiz$§|äÔLèPÀñz¯u]Áç[dÍàæ­=}+A­qS¼ô£cÂó£'£¨uÇ	Ù81Ï=}Yü,2k#ÑÍC.¢ËØeËa¬¶¸7¼ªêGªå7Dä°ëî±Å3ÕúôÕ»l@ë÷¾ÃæÃ¬xÍnN¼)]è¦ì§µDÃÃË!UgÆsèMpÑ9'ë±BËÏ×Ä\¤þ·ÿ#5LkÏ¬Âjyû4[/ÿëî¯¨ôR#»¯Iün¦^ÀPZmýÿó70ø]ºD\àYÇR¸B÷×ÈAº1ÝFÒ¡6.¢¡ââ"¡fèf7É¬J7!ªPÝÙ= ¤×\ØQäz¯w%ÈÉï±uUí±t¢IÍ>_ÈîkÑ!ô½OÐR·iX]GF²	ìâhØbo	"_	Ï'²ëç9ÊMê,ÎZÈ¥*IO³I¸&+ì1aã¶vÐ»]8uÁ9ëÛÑË1âFc=MÆ\#PüóCÄj&Y7T´Eøè:v&¬5I}ÑÄÌ©Ý)S/cëtÁvy×.iu8¯Iî«³ú°ü	>4¿vyÆ%âKiÝVÅ@ñ1¶¶ ñÚX3ª£wØÃÀÞ,EÜ
~ðF¼ÜÃjW²C«¸GüPcA,"s(\«[1²I¥8@n°øBK	«Ùtj5·eÕÖ¥t~ÿú;ïd=M,ë¿ðÇü?JuùJîÏó(¹è'>i7åkõ:Ø8Åg4HÅUHIáhÛ)ïH<ÕOûAJßJ!Ì}mÔëöW=MÒ
øzxåß=M/
N+v©·-ÖýI.'Ü_Hýòh©rÖ©r¨×ù&%ü§ß Ôë"uI%T%OÊ°Á vïÿæGÞmF7Æ%2c=M ;öæx/äÛ#Ígã/}óTáI²WÄÑútB(# éIÁñ#Z3l*Æ:æP\J2M°ýÕ¾æ\ø Ý½jGø= ÊÛ/qYßÇTÉê~¡³FqnÄéÐDRnd ±n,ÐÕEÑÛÌÐò?9Þ+ßg)Æ{P :OmÑÜcÑ¼|cSPÕ{ÀvD0Å¦aAÅÒÍBA= 3¬Vá,ö-×·åsB/×¼àØ6W éLº\IÂÄ´£hªWB0¨zÇ*á£/8ÏVuä[fØlûIG0ã=MFhÔmÌfB5²ñlEÜÁÝÏÀP·ÍrÛÁsA"Ð¼1ªnÐ8óÃxô3·Ýî«'À7æ-g&5Fõ9ð¿	»N[ñ&¡WLÉ{Ó=}n=}fWI$1^ü¾ì1züFØôÂÒ%²Cd1
(æ¿Jå±ì»B¿~«okÄá+Î]7ß²ã<ßæ<2öÜ;Ú¯,|§Ry=}Cy<ÔSg¤k×ôA®j,ËR¾]¬è7Y¹ùA7üh»ÀÍ?÷3Õ(ÓñsÅvÈ°pZ¼WÝeÓWíR¼¡ÌêÁÉG¸ò* úÀ
!ÙNÏ¾æ)¦SMk§8AoôµUëàD
¬®U­^â?ÕAþfF,¤NÖ{¬Üè+IÝLªkþ§=}±­Ð|Ìþ~£T§ÃßÛ;VÉ6iu=}UGÁ¾aá=Mh3Ì	Ó~c.}ÏUÂ7Z«Ê0Æö@4f/<u/pÕk;Öø8·Á§~Ê0ñ<XÎóU¼nEÍgO#Ñ®ìlO»3×Ü:õ5ø3j.6(To./ÂßãåsÎ@LK§t%ç¸#ÉÐöoï3$'ÐÁ|.	iHóÛ/©^í*\;sy±üSy]ÕðºÇàl¬Ô~ã9wMn«×¾W}C,/&­ºÖÂwP4ù²näá±m¤á±ë62	ìjYùÌhiÌ)ñl¼®ÀÖÝjo/q9Ê(ä"õÑ{Ê3²-HD¿ºj¯ùÛëÞºýÎIÞyþÔ¥ïùØ¡2ÇêiVUçSé8¾¥ÃææÑOèÈ¦òøÇ;QíOPîz÷ñàYÇdÏ?ãºµù{Ö(ZÎ\ñ´fç0'fm9^©ì!62[§Ãõ£UB+EñP¤Ç_¸ãóÿv9pdp0üÌ]ÙÂ,ÍaV·ÍVT$#Ê6×@ÚòÂLÝa:Ë[T¿%Ö±ñà¹xÌqý¢ÖA´DÚr#Î~Ò= ,BZö °1ß¡£@w;ãì·¡BHÆ>,ÈÙ±\gÆÙu+ø²óíØ©ãzÄÐ#ãËïW»£æ´Úá¼:x«¶úHtL®³²wNÓñÒeG&ðõwüÖ0¢A	ýÚNhég[JK(Ô ¿¬ûñÚM/o·=}¬Há>{øN-pÆ¯ÁLúÂÓÐ«æG¶~ã»¥%S|¬ûä&48¾Ï~3'tG90x¯Â«DÇjð0-6'"Jb¿SBn¤%Âwf®¤¢éÞ#i§&= þõ¦¢wÚ¬C2êt'!ã@m'qa$äUjKÇ¡k¶D2áò Yç$nNÓlã búB´ôï¶2èé:Pbìb!Â÷Êæ4!ÝÎê0Pi[O4*K¶1)Ek=MgÓâh,~p_¾ yÉnà³Tr¿ÆÀ_ºÕ	0Züoì&aÄÈ©%{g"+ñ jÂ¦ýòÕÌjvwÁ]ÍrdGÕÆqnxp<^L*Î OãÈá1LjK= ßÎ">g'èø:¬S>·BqA¢sDý§ÐÖÆãÚs~K²æ³Z\âIÿÔ´{¹$êþ¿ÈS6K¾eó ±am+TÏfcoÒ~§×¡øÚn¹Î_?zyúGÃYÿîÄNõK]Ì¹¶ì§gÀÆvH¶¢çªb)'Å5Idj>µç¢W¾í¥­:øiµe=}Æk¸ÖJ¥=}(+%°9g¯?d(xÄo7¨¯s&K±øÇÒl¾ä"zÉÜøYÜíÀÚkv±#mO*süÂGçìR@¼3'Mý3.BB]Ï= a~SÀQ9,xìÄêð!Ç@¶Úu50*! y!p°ûó¿VäWvËLý4rIP2Î6jèßë!o-ÿ<ØoÉuá¼¤É@¤;|Y1H\êÏt3î÷âÿÍç«8n¬~;:qB@uJ>ð²ÚlÅQñø5 
*j$^örÁ\Ì \\Ml@1kë+Ì°¯îÐ÷ó2(Þgã+Y:ÉXÚ5Î%jÔi^ußò| Q¬Ñ¤bO¹È^[)t+J
÷%j­fÜM@V2ñ¹Mîx9V¨ø­Ú8­Na)ÝÁðà¹4ÝÊ·øf#çTÆps!K þôP Ê¥Sü¦ôM»Wïæq¯¨5#ÀAJ'gdk®zÉaÕ)IÓK×6ò¯×þí'MÚ¨j=M<T¿n°¥Vi=M&6hß¢À×O]M6o
á&ÆC^é¯X,¸ìnI]ÀÁ^z»d®¯I¡QHm¦©5Õb áÍ9þ6âi0}AàÙ+
îÇRliû3^äÈ»]ÊR6i¦v)^æ\^UlÝóPc"¾Z´nGQm*Lô\@¯a	wÞ×@@ðªZr&b}ô5êl½r,uàþºÙTfÐ¡G?"
Å«>ë]ËÙàôû]µ|ÞCë*hôóÀ&ÙõaX_[jz|#(Bä£NÁ \}ÓBa&¬þWnGÕ$GEÏC=}¶ÀG9$p1øA.\öj=MV' ©Náõsò5è¨ùÅª·¶ÿÅÞåDê¦h{ª+2®¿-'«ËºU,sØK-*uÓY(XXXnÚó¶Õ yF/EîOmõ­ýEÇÖè@vð¿×éÿqRÍ(ûQLW;\Ë½bnl=M<Ç©a°Þ·½ñ¡MçUÓVÉU?ä{2âÆÔö^Ü>°þÄÅSe[cãqØP*_ÏkaUpvÇÙ|fN^Øý:7.6x7\ûñ<Üß$s=M;Û­ãêtçÚ@íd¦û<ìç·ÿæRz[¯Ølß%Ëûm½/HpyS;;g"Ús;= d Ç2ý®ÝÒÞî¥STåiÃcQ.½þb·Íá/3ð´i3oÇ8uCj]$§ÃßÉé¢¼»xèO¼Çµ×hÙë£.s~·xÅ¶Uw3ÔÂZí×IFÔBs;ëý½ì÷!eÆ-dòìej ¸L"ðµáÓRîejj×{ëejêjíÎWÌäyz§¼ºçbä¬ð§uáiW2Õ0õ2U6=}ìGÄ½e3>ë«_MR¥ò¨^Á´ljs-g"Ýëlb]ÔD_MÎ¬a õè¶ádZa ?¹%ÄñÀJSy'÷tUDdÓMùì /Wï/ßãæ<UL°-t$t¼MßÐ-	ó"*R¾X_èþéhJé2R»"XÁ°¾ ÅLWofEå4aë	K)@Êúe-¿òÙ±¢n@;öôr¬\cÜ$øY¯NxúóßHL´¡)¥pÌIé"¯T©ÎØ"H®	Þô7÷IËoÌ#á¶ÌÊ'çÅ+¿ª¾5òèÒ|ic@¬;MVï7¾m¦­ûxy±t¢FÜ¦È[Ê8Y@(KlXSü©éälã+7¼¼Õ :=}r´Öú=}Ú2/ÆÆ	¿"éuÀ¿r;¿r;ÊzÇj¾©1Bµíøo¶Îi¡4õx	?PÅ´6,>9¬|¯,9ÎäQíHfÿ9UÁüGoA)\ïú|ð±ìZWôBÔ4i)VÀçíþÆUJÓn÷Ìï{¿ÛCQ¿Íp{è\3´
Î´WÊôJ1¹"\K"5liýI³õÜÏ Åb¹ÅD¹\FÒ)¾Ä_×»jÒùk)à"~çp3Ì²]¤ö5À¹(°n5k½¥çY%½zaTìd= ]­Vµ,XAG?
Ô/ùÌ$äÑìdX-ØIÙq.iÖ9²ýÿhÄx;sÄa÷eú¤ÙÎ´tlã÷Wê¶µüs+}]å¾g.¯Ðm-(-däþJÚ±ké¼I%i¼-Äj¨ü<3= ÕsðKß¨ÙäDB*xgÕI&¡·òÖATfÕ+kÁ6¦Ñs×Ò^÷^H!ÜÆxÕ@¯m²ãRÊ0ýþYÄÌk©Êí¥4°Q9îÅ6}¸vOÜê(ÞGô~qWrd½S«½1Þ]þÒ('+µÀ§øKÔ<ÿ·;É-!ÝÅ5Fo@ä²øe+'.ßÔdë.ô+Ç£¥lPrÆÑnëÕì7kÐ§*E(fë*sÍIHLê¨¨y}µJµ4Di.}®P{ÊBÀ±0ã§ë ]î&[ëêå6<ùàßÙxÂxÕØÎrEÕaÓ¤µøÊ=Må¬¢§bKÐN|®ºÔvÐ+<Wugã¸b:Ças@®r<äï "úøkDlBX/néÞ<§¤7ÆsÚ -æÂlÑ|'Ãd#ô[O">~ÃÔ»Ú\ÿ¯'K>^á­	0ÿKDõæùVæQJ,Qü'ý¦^xâøöà,YÌhuÈU=M"RÄ÷ÞÞië@= Y8uL DÊEì¡è¡ynV¹´ã	(u¥ÈêMDpªÈ®hKÑS~GúÞe§ÖÅÐ4Ùpê¬rðÖ#V.¾¦³bIç×}CÎ)Kú6VO¾*iÂ@ád7QHæ³¿AgL¨®¦Òþïô¼-Çöb½4IóH´Ì@Zo=}àyK?Ý«GáE:uÿ²D&&Â¨Ð¸[h¥¡w:z|êÖ>GmzÂë ^ä4°Áè]XFª	ÞÎÎèyW¬L Y¶¸Üùþü ³Ô63ÖÈtÃ@-(¦¼²µ\*ÃäÒv¿IH«y%ÏÓB±=}kÅÌ÷GÍ=M[íNî9rÆ.ÞÊÍá= 6ï2- N(¤ÁYÀÕÇ²d¹äã?%B=MÌëãÆà(°#>ïOí]9¤ûÙÆ¥Íß¾=}Ji1z6.~C¯õ¾Ò°=}3ÅàC)÷!jSnS\©uÑxù<ÝÒ= ]ïQf*÷²x´ýÅ ý&LJÎc2¿Yf÷E7#øÑµ?§:ÉÏhÞ­^.å.ÝÈ¶£=M\/@ ¹ØõóYêbÊ\ïu¦²a´7vÒf op´bÈ_&¹rzl¡jÔ¿öß$YÜNafä.p,¿±&1I¿Y= }·Ïx{Òì¿]%zÀTÚ6CæµÆ1l÷ùPõòÖZ[1ìû +WzÁzÁNp!n!bK Y= ´Ñe+wçvæ°\Jª>÷¢0?cc6­ÚA_d´­«vr¹ÞN2¤k<6ã7z,	µYô¶¶¨×åþÍ­HxDôxZ½WäøÀ>>Õ(æ8ÿ),Ü/>2¤üÿµ:GËj*&"fDÃøTÈ5Îõ0é¡üóiV%:õs88^V_|§Põ³~)ÕÛZ
ÐÒÕhþÿø¯KBàÆÂÖ9ûcþÉµ¥Ð/ôÈíZ¡g&= »ìJ"øÒhLeLKï0û©nõ ¥mý~öÿýÒâ%àY D6Û[sn¬o|¼Üd½eÐ<aúÌ±£3§çIðõ=}n0 Ëlp	'å&ÀÞqDÑ,@Ýùq }µbâV&¬5Íô3_FzêÖOÎm>q¹W%ÚaÄ±ÕnÅtx¡+Ü~Ñ@ã¿'¸xÎÃ÷ï0^ªw)WS®oiFq»Ä© ´<ÑDöÛNO%9÷Sr¼Ío÷!U6ÝØç¦^äw»ð^ñ=}57= iæÌÞÈÍùî§Õfdµé:òÓA¥×Ówp¾ ¾kÜhf/axr®·º]àßãþ¸«s¥âòFä½WÁCêèc¹}h~¤ÉÑÎ½1÷jlyú	iO1ý­SZáÑÂP¹oV#¡²ú Ê¾Öýqo¤;j3wÁ}ê4wéLjgfêO­0n-? gi¾þ÷§@Ï²HP-iUÕ7 ¢Kù_<UòÎnÈH¶L5)[gÅæRâ´.ßÉ^sIþ¾7\}~J1paõÏËQ,wJªÁýÞSÓ.¸áäÃÀ·t/ÅÝ$ÅÃÛbµègÙ¤9üÆ*[A­ujr$µcñ£ñ¸wÄo·UÏã{ù«à-¾ûZçn<ßÞ77£nÒäyZîr>çM®jµß&aæË°©íñÂÒj3ê÷¢Èh¤<U²"p)Ü%;Ùªe;^þð0!8áÑ&VÆÝèÁe'=MüSß_òZÃv¿= 2= k)U>'(åó¿ì]øu½ñ÷ÂÏøÞ?ÜåJîMl«ûìêkh]¿hmVï¶zg[]UÒ/¿Py04Û5Ù;þ:-6ce0CÆÔH=MT²aÃê*;Öãë6;ïmÂm7dî®,Wrû!'CçfEÊÐÓ¯UÖ6±¹Õ$¸ºÛ?Òy^	+=MÈ<7¯>9eXe"i¥|±£~±úi
ù£Â= (­´ÇzuRh|ã½L
â÷êÍfcaræ@âóÍÙPNÒælõÃÀ½Ô@0¦ÏlÿíTùV.ÓPÜ;²e3 OòT]w<Qõÿ06lÂN­Ý¬5fÝ|}IàælNÉû¬KLâ¼P6ä0®gÂ5®&t¹ÊåLáK9Då¡³Â· õ¬@ÞV¨Ëí³ëçÔG³üö»~%cv¬é
­ûå GDKfêá¦sö«Ù å/CXóùIí ØÀ@Ó= 0ÊÝ!K<ô>WÓÈ-è4	G{)öL8«?BP»«·lrõn·Éy¼a8_jÌ¾Gy./êÝ¥öAÝû¯Î;Ýû@F~ÏR½\gÑö= ÐÞV0ö×¬:î»hëFæùãí=M]¼Ùûü£{3 ¤ùp<ût? ÅJÆ(2X}}äèqÉïëXåew}56Ãæv«ÄúºÃvn	çvø±úÎ_n²©tíO-t~Öd(Ô6!õZhÞr/í³â'u=}m³çRÍìUæÔ+¥9r NtDþ¡\Gb0Áé]utÆZkêë?ý<Ð>ùLëé{Rôãhr®dg½ºÒî_Á'gf«UÉS ë1ÆjúSJÊQ$×=M_ÑT_³íD+¬®'JÁ¸Ææ8î6¯òÖ¢ÐAÕ²~³¡)BeêéÕv>0´ïOÆj¶%Nô¡ÑVhd4Q+õBÙüÚßU"þX ÀB´a.'}_AÜ£¶ã¾1¯7HñDò²íJvwSÂ£¹ñ2%ÉM×3qC2°	9=}Ç] gs sl{ ½_ÊK[®e«ØäÜ$ xïScBÛzÃ,C6!r]?;¥f&	^a¿?]²0B_b1oÁäïîXh&ý"GísÚ³ÿúR
H QÏú¶}i»7¢æatæ ÖÉÔîe o°= ¡8®À	g(N Z\"íòéÇË7lÎëÕÜKorÐvíGõ7aÕ÷*ê&¸®<GÖá4ûö4kDÿFØ.?6þ4â/¦Í{rÍzL0sæìðÏZþáëÏóJÂNë-6-½_pr´/[F÷]·ÏË(èLJÚ|®5(´èæÒ²¬°0ê×ØkÖ= Æýñ/h]0h?ØÆø¼=M
SHn];9ÐXTêðpßq=}gsK9XÔíÍÊ§+¹ânßª÷@ì5)'q@ ¤/î©¸#(aÞÇVUo:ÈÑå°r<Zr H»}:_%Ö¦·í&÷õØo©¨rªIÆù^smî¦¾ùj¦ñ7à=M¾çß^öM²!ád~°Á~&h/ y3#ñàÙ'nE¦»ÑÐÜ£h¤¸¾sÝÈã³
)ù(øqùå;LbaHóÛê	|ÿd8Ú¤õÌ¯ DÖ3MoXaþF¯%E	#^èÖÈà[ã¥)ð²ÒOà_#øcÃõñ	[ÂSÒlï,@|r6@V [Â¨;«£r7³$S#¶G SØ¯Èáæ92eDüù?ðM¥Äf.¿YÆ&«S3¥s>tÌm+i»t DþOü'±¬GJ9êlôü¼Rù.3×3= Þ.:oÐE>K<?Ï£ÖÈm·ÿ1q=MäÌUû×UÔÏØ80ë«ÞK¤x XªQÕ3ÓªÃ:ÈI°Iü38°<J%ùÐð0qÏÐ9PÉØÕê·$ðáºªß¥ÿ¬»_I¡Fã?-uÙd.hÚÆvþ$¥_GÞT4¦¾3]Ý¡TØt½ìís¾oýþ²^×ÜÚsvüúõâñtÚI\ÌÎß®ZIn]êÍýx£ý ¿ÝÅ®¦tÓ¥Rªðì)xI(zî?*³'l5Í}¦³ÁUîyª±få%²= ¥ë_åd£R2 Ý^brÿÁ$0ºá$= :Jc@ªæ»õìz>ÎðgNÛV1ãhQ= Qfß²4-ÇÒ8X¬¸£,¤wàm5è*íT8£*$cmChýSMrÝ¶öpÅªp] U3Þè1lÜ¶Ü;ós·ï)è,YW£È~åð>¼GhcÏÌ¼¸ÿþhk)d´QÞGb%è¼MlKìjý·=}k:#ÌÏðH3ÜÌú\N>Ì= ¾ ÒÚí¨	üU:.cÜá9ëFS¬=}r×½\¶ûN­1k."T½¹W¿|;ZäÐúüßV]:0Ó| Cþ;\YëæßÙ ÁBöÌ¶~ Û#ð1bB|jèj¤#þ_ñ5Ä ÍnZûse²¡$Â£D¨_ºxxi¹£Õ±S¾»T® ÙØ4íA½kTÄ=Mf××íRëG²3\ï£NQÇô½FÙN¶ ý}§?¶ÔìvâX±>boÎgV ¾÷³Ùøl2NæäÑÞÇªýÇ9Á¬òo§/gK~Xh#¼|ã~ðª¦+Cät~Ikbi3gK(5D¹ÎV¥îÿtÑ÷Wo­¹X]m|FÖë+.\Oÿs¿ëwéR]ÜÈ6¡³	º 3Á_õ¯ú@bXT;xUq=Mq&O¼¡ &¶©üÉlÖ(e&­äJ¦ú/éü
=}Z¶µR÷TÎOjÉYÄ4ýÏìë@âÒU{Î\h'
æhÄ!ðLyOgæyM0mØ|Îtk­ýL2÷U~Q¹Ä¿oy´T$°õ¢]¹KùáÑéÂ¨³¦±\i³£ÉÓ)(Qþe8O»v°ñàý\GKÍ¯Ú)ÚI-6ÛÛªq×ÎE]¡Sç5tÙÃø91^ ÅíM@»~ds½=M_3 uun¼\-=}X:i÷}}Ct:Yäå¸ÐUÀ70jäl©ôãÒ#nØOý%È6æNz1ÅÔ³A(ARO ¨;Àê5	¹a:N!0¹çx*lÑêÎðjZ Ij59ÏX)<Ôßo			Øÿ´üø ý9á®øéééçyÑW¾1´Êý×¢j+)õ*p¹+&æ¦é®9·8M­xøDM­HÐÂBÐ6|äù¶ñ«°TÔ/FR-öÿ«ºçÈHi=}VtÙ½IÇqXaåÔwB?lÞàoSÛ)Kùÿ&öàïÞKÊ¿.qÐÌÎT²=Mÿîý:4Bêp= ñ¯üæ´­Nõ¦ýsô¬Ù¶²tVM²ó"aÂ%*ú¼W¥qïíöh¡oÏOÂ3Î¶n;f·FK-«lg&ÙJE+vÜ·= QË(á6ÿ°òOÆÈ+XTÝjëì8·pÀ¥_C;7¯ÈûîÑî/Ò,üõÏ|pÉ8&ÅQZ»*.XYÜÎ(.7±ÄMÙØáË8Þ×ÄàÌõ²òª¬Êíæ|éZ}²C´ZÔvÒ«ËÐC;õÕTK#»ìCw¿­Â/e¼ørB4³³¯¨oÕ±3©^ÃÕ¨Ð!ÍËô ïï²x?¬.óK@¾÷Å·ã½ÜÈº³§Mt¼úíF2/T=MY1-aÀÁF×ù= ç_o% AÑÖçæóÿ_	¾ðuxÖ¨O4ªÐã8ò%ç@òz$0k-ÒH¢bt)tüVÑ2mÃ¦ü/x_ ;<þÓûAsvü¤kx7¬N5aÛ¢ØÞ¢FÓHz6^]òÊ(l	¼ù_MÐÝÁ½Õ/#¡çy4äÄ<¡BN¸é"Quú)K>èZ~í|¤è8ëÍzÙýÛÍùÿL¹èEÈÚjmr= èÀ®ýB×æus~òåà¥£ F­dcæz]¨äüC)q©y[VÖüoxà÷6ÑW-4íü0ªßª«$Dot;VÀ¶= $ü3dCç2eióW[)°ÂªÄaðïË_wÉáÄ§/Z,Ú@ð_L<,[P-wÉá=Mð
¶f'.iÉ3ô>»ÙIT,ª¨=M¶_ð_4#'¯D ÙT}gFßË1t5îÄWogD×+39c,^»Q=M:Dçã
0£è®ZñxR¬ò1w1.¢.Â= Ý~5eâ±Ô)R³ivÊKÿBal!§%%ö£Â|~?uèÎDýx­{N!ðiÒh°Ø¬CSxKVv¿QÀïMÁ"3©®-üL¿èg#5-b,ìÀMÂà{¤åØSâJI¯Ü£o¬^³z7RùÚ³	EÍôwàû¯HüHN¤44¬¶D 4¬÷MÛÙqp÷Ü­Â&jéÒÜ	ß	= ^= HæONó]º(­åý:ì &µÔh½/7µÌ£<ÍõþIâ-¤þ)Ä!õÌP[Ãä¾«È6~°ÒÐÝögGÎh¤fùßIÝ¨ ÖRq-Òâý)ýN¼&±Gx!5­NGÄ(ÖÛµWÜÔ'¶³,ó&U¶Ã$ò³=}ùæÀ5ó{Õ®Áðw#dJÌ¼÷Røwüé=}mç}^¦
Â= ¶Èªæº¨§eüÆ¦»¿BtþÞÍÏKýbÂ§zu©rþÙÛ-Äû"MF¥m6vt0©ÉÒsMUcä4fðÆá²÷éT*Ýf®6ÞMW3ñôY=MöÎ)Íø¿¸«hèIWÞ;gÈt·Íúèk£ ÖiÖüìÐî	kkm/ß#1Ù%­÷¨çdFì XtýC	Þ|ùÈVA4ÿ'9Õ%ÜËèþ	mÜ¶&9Ì}ç¸«ÏUÞþÍÉàâV¼ql¯i:Ïwßô«ÇªSâ\aØYífF¯­¯\ÃaUU-S'õ-§
Æ³¤§êÌZ þ×¶:rg¸KÕ»2ô<¶.}3hêõÝC7.ä"ôv?â¾PûU2ÙKë,FÏ9ÎúÉü\Â¥ä·£©±K÷éº«ô¹ 	çöÄç0.D¼ÒEÿÓq°µß-Õù:Émî7àßÅà4ùÌùÏ¿Fç*^^Àèoï#Oß¤	«Ã®ä3ø_¶§|Ô¢!vg'Så¯hÎ÷-úPy² ç5²YIæ»QÊxKá#P4êKÙèyËw só*C@d*ªä¦#SåGÖðàïKÀø®Ç~\¹ÁHMzõ¨øL5óÞÛ0Sô-÷ãæL#UB¶N3àÌt®ETp¶Vt­!CfFJ!"õ7$ôüT OÙë~Ã¾ñSw&Æ|=M_¤´	ÏúLÌª\§½&=MD|Å>wkÈJ
zµJ(ZÄ¢A·øF¥J¿·l-'gÖálÈ¡jAEúN¦<ÌÍ-ütµæù±J=Mæ³ãÏ[ä±Éº3ß«*÷¯zî±n#ý´8Î	]þqP?CÚþnn=M0åus x¤Û2þaóÑv½PÛ^c«= MëÊ|¯¤1ÂW¼«õ9
-å÷?¬e±¿Ü­¤ÖGü-)ÄüdãnRP{õ!J[zí¤M8®z y(^mbpî%7¸úÜjÉ[~ÆRä;&âx^¼^+tÀñk9¨¿w?#Æoä¨ä"¤b¢js\Êxf øX'~S ÀÍíqóiX[P¿Ã½TagÅÈ­çSUíÏõÔNÎôKÐe«¦ZXh¸ãø3Éw¡X½ª[²¶*åmä	!¯(M+©Åú¨Zú¨lçed½}±¯¶±÷¦!"xB9ºBo§pJÒ©¶"¢:d­UÕö©Hä®åø¬É*ÞK{HhSÎAUîô@Õ7<Ùt/gÃÈ²¦*öy«wô£îjÆ
WÓbà:ÚÎbß§òñ[=}wÖ:¿©Ehã¤ºÉQ·9¶W6z×vuX/¹RÙ®D¹SÙçØÃÉ-rà©È!Z¯ù¿KÌCb= WÃîÝæ!þÌR®U¼¹s¼å¯ùÝf¥(V@Äz¼Ã«<ÂõöÄHô@('>ã(ì[ZÍ# )0ÍÃ­z¥|ÌFØ ËG®{+ÝÉÜ7eñ	®=}úó!ò.ôkg>X<¾ã}Ã£ÄÃWõj%Gó@G|ð1ôEeî,¥*ü¾°É$x0Ëg±¼ò,Å·tÀÄÔ$à4s¦;GL¥È³.@®};FéÛÑ*=}oè/jlð£Ìú¯Ëø=MÑy[Ú@'n?¬íHðQ9O(nÄk%ò9OU)k½%Oÿ¸,åH°(¶D×Ú38Ù9}r¿åb±SOãÓô¿gdU³{Sà<0²Æé\oÈë·c0d´·r3ÈW¿Ò¿µXz= £i_9ëmwvGàöýÔ{ËÈ(Hèòn~æ*Ú4^|ùç*ëÏØ+ô´ÀµK+Ñ§Ë¾´À	èùÿìÅÝ5
.wìhµ/nã';¥Å¥
ÀYË³ncõÚK4ßuß}rtèó:-/Õ»Øsn½K¼E´iÇ	ÑÞ4¹0Ô³5I¨´¹*?³EV*p+pÌNíxH]µVênão×TM8¡­ÐóxÐ<ú¶ê­ù­ÔÎüªÝÜ¨n|llµI- ¼{¹ «Dê:ÇÌ]5\¹ÀI3(Ï¦®0"i4µÕÌÌßU/èÓZÄºc¥¹EÓËÇ:KüXÆUû¶×«ÓVÉEQ°®ý³­½©4^·z&*²EÍ|=M¢ÙA:ÄÚ»S°(ÍçLªóª©iKoØjÁñò%/YÑèFu{ç³2Xl2Ã$Ã÷¢R³/ïË	P¯¿XÞo´áªÖÝf?ôàõdñy«ÛöSã¬¦3n×ñ8¦(Q5ÿ½{
¶ m¡¹WÍ~óãÓ°Ík©'>ÒýÁCØµøqó²ªòÐ_HÕ¢öóÇ|Ì®ñP°z}ZÔñÿSÄÀ9á±y¡ÉA?4ÈÎ¼OIOÅðÍioBÅ&WlÃÌ:Ëx¯<ayaP3D°rá:o&p®½= ¼còù¥þ!KQÎCÌKéü°e¬ïäæ9²äfÊ	!¤´1©¿¿Æ;fjØeÙ¯<¬hqNÕýY×C´pÅ¡¹Î¡þ#'åc(yCÿG?l{F8q«è)&!^¡ðQZYÔPA*f'C~×ÐYvíòÞÛøíÎ3ø'ÚtøúwyÀúNãxyQ¸Ì%¤p\ÃwíG]mHQñ´o:Ö9ÕÌðÜøEXÙ|1qM¦@aÒ4+È[ÛàÞ7Ëõà d×rXuX·mË0}¹é\ù5EÑÓ3_7£·Ùç×ïÂ£0[cf¨QÎ¹°Ô´	ÎVJxÝn!\ÿul¡N-âJÊmVg3¸7D#\FÁxHµ÷áî=MnT~FV·L*E«Á-ÉáàÀ·n#Ât¬±½¦zÍQÜl(E¥2K¿´7ý&.·+%òMRîûyj-áùè:(Xò#µß±«=M@µß±l÷ó%j%´ 3Gíù{Ç9ª+äz,¤{e£®à´Ze®+þèÿ$[ÔYT+þ[ø1f
Ý2@5gÐiøÌÌÁÔÐ7;îK¿Úái©Ê_t8¶ÊïÈèÿMçÑç%e¨Ä¬Ï«¤k äUæ0²ßµ÷ßà8¬¹àËößyý7NÐmEèÜù7åÇFôo±FòHéì.ÏßUÎi»¦Ð3Kó9÷VTr¾¶ýÕ!ü!üWIMÁ×výH­¿åDÎ8](IºÅ	_¸òCYç±êG å$$
ØËÏJEµ~ ½9¿µ-©#då¼pïÛRñ_jE]¥.]bÁðsPbYü"ÐyÊ5Hmído·êÃ¼äÀÙKx¢*½1ëÍtuÔS<RTeÆÂ´wÅ½h|P;´3íÓÁ¢e}Ï6Âlhh6O=Mj¬,AW¼x^yÑíÑÃytØ5.Õ³;MæGdï²¤§ð8ÎEi¤·YÂBR$À ¼4¤Þ+U~ûrAÞÀo°Ã{§2ÞÃTA3gØ¦6ÜÑ$Á1ö	mBé¤g}<ðQ®«c;|þ×"kÅ níáÔM¹wG¡\PmÊ7ÎÏm1ø2 s#s=}#¼ûõ'Sëaúð°Nh>ìªÑ­ã_¸rvupC¡)Æ]ã'[,³	?= bÎ\FÃfìÔ,ày%àwS«_¦à+Èå²1VüVx[EÚA6÷ûF5¡R
{ùd»ÎÚ·-¸R¸û ;&Ý±2,NÝ¯3Ð2)°QÂT Û{Á¹:¿~êVjdÈjýËÜå1ÆmAsÕÊÛÁ&æéj=}²biß¬_Ô÷õzáÂL¦´»¯ú/´ù]±Ó¹(F¡ßu(±4&| ÔØ>j¢«Ï*9*±ê ÊÒ­é&&1üä³mc±a´FCU"ü£òº¨±¢»©iÝ³ùþ ©óÁ*©Èþ?		Î'Ã³+ðÀÏ:<õk#ÏPÖZî â+»ÑêÉ»öïã5xÖd/É)äÉñÂÅ+?¬ó¾~ªLÅÁwzøüêcä©;9©¾XroÄ3
$âQºhÛ
Ç;=}cÕ¤æ ÔÓÂOÉe?ÃÎÍÜõÉkÃÂFÝPotÅªT1Lå¬ôN{[Ý³Tc :RÑmÄkº±V ´/R>¯hí=MNK'»54¦üw+wð2»çv(ÒêÐ°{½¡),÷EÓTeÖÓsuf;åÕ)ûó=Mûå¤ê¥>[Ç8%¯HßÑ«ÌKÊWU9ÓÅR÷çc§/E¶ÀÄÆvÇ¤¹JYýN%½Ð{9:~®Øêù2öÖÕõoëËÈ6ù]ìÔD÷w¶ô4IÙãR¸_.WÉsßøBTFÖn¼]@ÆQ= ÒîBRê#L"úÛLµêÔù»ÿ­T*NÞÊìiB÷$à°¹,{9?%n)ç·äJ%:
ûÝÆ0,?ìjV·Nç÷ÛÅ«IÁ²MÃ¥J±Jx%õ¶ÃÚãÁ9KocÆ²	3*4^OìÄÈ.òòø"cÄplh(SZ+ovß±h¹ó²d¬e´jÇv¸y= 	}=}<w¬]bU¬Ý1ÐLèì¬wê-02Ù»³C@DÚ=}M.Í»qÚJPà!­T­ÚF*x8|¶kºISÀBV~ü^;)í83=Mù-Ãy&a§÷_;à;A{D®Â\z0,m4q¤ÁÏÿRVöYBFFdýbVR*Gü$¨=MÉ	¢ºqÀÆùLeÚôj±bGý_Ùúü >ìñ¯ë¯¹%+ÅÓ@cK%%ë+bO°ö=}JZøíqNÇ81Ì|ç2Ý¸?çøAQXl%'öE>Äj¯ïùc÷1û \Ú Ü9öàHû]Ñ7 >ð³>óGf0Iõ8ïÎï73ÓD¡ªìû]°ñmr'æþ[h7ØdQÏÜ.àh´T5 Ö"Ý	AòhÔÞNå=}ÄÞÎ2
¢°ºõsh5.h¢H¤gNhÖøPÂs4§ÀÿÒKÕÄp%ÛÈ°'X\XsùYÌAè±ËE^G¯))=}<ÚT»¬À+D.¬ðÜ¸ê.jSÂàb¿,´ïªHA¬Jc°Ú~öt|rè#H£ÝÏa¢ÙVjh×åHz­ñ>Ú?^+*±=MüÿFRÍ·ÛTTÊ[¤ôFfæ´9Õë÷Cäs~wÉ?ÃµAãJMTÔßÐäR4
ð¢¿1jô<Ùì1Ûh&g©,ôRM©2V«ãlÙz  pÁèï­Æ(} JÈÍ®>¦tkJÈ"~ÌÊÿÈÒ3* ª"ÁP_ö#¢7Ê<²4OêßÔT¦2·Ô³r[­¸Ujf¥êÒCû:TÉã14×Û
*DÝgBMfo ¦|ie¡Ñð;ÆÙÃú^Ú]º³î ÊÅ	 Ý/ìè\m²m^I­9l0¸øûíÉÞO×æµ¢[½Dâ-N<+©}¨yL*ö?$=}GÜ"x&ópêBýÊT?aÎ§?,S	åù^p'®èy(h\5Q¾«)­¹»,ô»7Nô«àè)J%KèíJ%óWiD¡ç= >æ=MÀ
»Ä2jr6òÔ¶0Ç¤;¢i¦«bC·&i°÷èõRÃEÕuYL_¢> Þ"½¹8[ÉÇ¢LÝ#¨2:+"Ax¢Í¶ÀÂ[vkwN¶­·,-%Ô /Éä©j<ý
=}È^äC|,p[?g=Miz]÷>YÚdÐsBÎ$G¡¤-TÓi0pIjèY9c+±·2¨«D½w'Ð7Zd¼ÍÙèöùº?å½³+­D¦\@z]Ýåâù»ÌåÂE=MLñ¾Á$!ýý4Ùzò=}­nJïl38øi&b ç\Äìg®xxóùs¯ÎU^;Ý-Êm}½Îçr­¨0Û9³±_³>£¤NÈ~7)3ÉrcÀ<Q´wºhÙËþóÉb ö\Û?AihÜÀ#e¬,¶«ØÎ·9 Äå»e(y;ÝbDåzÁ*à=M)Cæ]½ø&öðÀéé+¢ãÂçnO« nú/êBömd%aKõ/ w¬§Þ½Z¿ÃK¿¼Íº·8n!%m¸ßâéÅÿ6'õÁlHMú¾8ß±Dç3Zñ~{¸×'éR×tüº= èÒÚtº= {èÒÙtèºàEj½pa¿¢52<²Ç"àaÚ?÷ê3AuI½L©5­¶IÝõxüÒÔIØWn=}Z¨õÔ=MÖËtðcúRæt¸¶}GÈKÎaÝGH¬*4ºçbÔ5pö2¼2ÈÏéw°C5[èk¤Èòè¨Ó¹02G¨ØàQ­XÓD0ÔËä:P=Mì
¦ã'ÎÐ9¾OæÝ_n¶òËö8àßK¿[¿Sÿg= ß'jý»28¼2H¨2\-êôQÔå]û{)=M ûtJQõy=}Y­já\Ï=M¾Ü ¨2<vò³«0ÞhÀaú±*}[FÝºr%Ò{Ü ª½zµúiMÿõsÝÇÙ Å@³^|£_[¢òyvuo4êwo¶ª½âcüëuj¯°ÉÔÏ¿T§÷ØúÅ{tÇÑ¹Å4wlÑsáûO»ÝÈZÓw)¶H{k>FoO¡õu&;f) ²óíÂõä[Ü2JÈ­º(ËZgãÒË' ø8dFUÄ¢o¦Ä(AÂÍnRâ_¯u3 b._rmµ:ÿkU
ÿUE¼´º£î´ÍùÀÅ¦hç¸rÍúj>3jW?Výß¶tÂøé¹äGùD3_\]blÔ2Ùâ×Æ­Þ
!÷[ãçÙm <L§µé]ïî!;ÏÐ½A{¥¿Ey£Y:c¹wBÅ0Eÿ"³ïÆ"µÿâ£ºâZô¼mû*;q	kræJøÉ×ä!CÜ}he¦
Vï^2Ý"æsä4 ¸Ëå,ö!/¯Ú^m Ìâ'Æ#:»GP ÙÎîCïµË~ñ^æóvz^ÐÙìÃ­õþèöi®á7Â¯ÝIã±QÈ#UúKoöÖ'ã¼8ÈÙ)ì÷å;Ï-JÊDÅ;¹êàCòësÊY¦ æ%á¼-£íxo&vYKawd÷¥Â_g{= .Ô´Æn¶ô°Bx¼y½Ff-ºöbþ¯Ô=MÞl -V¿V(àA/ì\ÃW­ t'SMÀÒõ.2åÅÃS»øºhFÉkäÇÖ®U_?[J©ÑÚÃïIt?W{3í4¥A bÕÜõ8ý)DëÄÀ²ù)Â©æÌ<ÍL,o{°Ë6øß±c»K= {m¸Rµ­;§Íµþ
ôãrÌc÷¸±>zÝ¶¼æ§lÔ93éI°ÂÐÿ1	âËÝõ= øëÑì¸C=MXJé¯·x:i½×à2´­ÕJíÍ ¤ÃIt_¾ðÎk=}äLg÷ëµô/ ÜZIq©©Âá×9Ktÿìl+B¾õå0¦»ÔOá=Mbë<]=}hG¡2=}´dj9dS «Ài ijÜäÇÙ/ À}º¤ÎXõ­üdè7«]áÄÇ #W= àGfa»¦»yæjÃ³n=}:.26)8NµEv·>E¶6ÑzGÁ4pÚÏ­$ö/[|w;í= Êeø­Ûrù¢ÎdQ4àý¦ÛüCAñÿ\=  øÐIêª!$~þ°
4×8-¦JOôÕG{ëÊ}¡¬D5{NEJ§þZí¼éôCæ£×ãå®=}¥×*½ÑS¬Cì3Ú¬qâað3ö/ÇU|¹Kô¦Øº<Ûñ(4ôï¼ñÐ»v8¬pt¡Çm¬f¦ð%Eõ-÷Ë(õ9ÌÌ³oõ)ßH-õÌ¨¥¼mSâNwöªð^ãíQFq 1]§w°ôJ<¿\×·å-Wu6ë]R-äú%I¦øØºý»3	®¦µn¯wÄ,·Ç¨w!MaÃ« A	­tØ*á= W©Ûx-¹"¬SË­½XZJUz]s>H²ÜNU­Õ 1igv[Ñ8ªGCUÎÞ¦nõûLÞË<­TI2åÂüFz/Ï¸A£q_ N=Mðõ/Ù2¶@õ=}æAwsGÎùÂb¡Íà÷åacp£7+RYÊ(5#>¼±ÑÆ;K·nê'(§YMÍø÷Í®(öóPDwÉè1¶5yê4É,<óÓ^êYçLÑ\æ_æ'TqìÄæ×èëk!Ëpô3)ÿ¦ûº½yøî)1ÌÀjûRi¼ïnòævZ-ÔÞ,zmÀ,´kØHW¡ 9CÃDØãö4ØYÝL­*¶â\vKlHÿ²øMWþ¾xÜY8PT¿éEÝCr>g¦-ß°«ëf¬e¬Ö³ÿGÌS_£Ïà~¦zSèÛzS¿}¸Yõ©í£é\MOô®®3ÁÙp»3²§"B°G!+æ¼o=MâÐPyQË<9=Mõ»ìT)è õ³[ ¡lEüã^Èÿdjùù¯£ÿÆ\Ç».[¿£YmÃ ¼éýó|zçp­Ýóå½m·J5ïÉÁM -÷Æ8-ñSµ¾¦Rl%¨½MEa²5\÷­«ºÄGw®ÅõÀs%~ÃH¿¸l&k÷<n=MLHÁxÓF0Ø÷Òç¿EºÓ~\[tN§Èp¬Î'À­ÉÅâ{g¬Êéê-çÒ%,#è­y]6¹Ñö[º«ÿÙÂQR¨ÑB²:Î@Ì&°¸V×ÂOóSöÅÍ<²ÙùS
.Wá{5%*&PË{r+o
á{=}% G+0&PÎ{2-á{ä¨þÅ_=}²ûd¡=}kb&4% È´DpªN·ùß á{ô¨^´âzqªÍ¥g¬³õ¨.íF­-¤!í$j4ññÅ´³-ëÏ89¨©oÃ¼¦î³ô<49¬ÚK¿y	GU¯&ÕÜ-)¯	©ëÊá=}ÿ®³ÌãÙºÃô#ÑãI£hÿ#a¥Ïp¨k¸Ñcó¤±q¨ËM«£W²Ãõ#ÔßLäÿxøÂâW²_ø>¥ÿÞºÃõ#Jr¨ë·l¤Õ¨ÿ#a¥ß	ÑãQ£2;®Ó÷#@®N8Íã!@õM ½Dî/!À!ÿÚªúA¢yøð"bv PúÚ~V ,N>"	RY"xpòa]|¡ú?Æ<dY"{ãÓæÓEÙ#YYÓÓÆ=}¯ín7úÍÖm)ðþ]ÇÅÖ
JgÆÀ¨ZøoòòLí¾×)pþÛë×bÖ	 àE¨®=}ÿ¬	Ñ7DI¾û·b¬Áª8÷ðð¬øsï§Ã3ê	ÿÐÃ¸þ¬Yß=M9J~ÛPÞ¹$B¸= "JÔßÝU[ÜÖ~5Þ.FäN«®Àã\"ð©YØMç\ïÀ¶yFÚt+ØÆ
Ó±mÐä'bÿç¤©À£Ò<:ò¡ó×h¿\¼Úà@ÄXþ ÂÑðTÒPåqï·;µy
×"á¢úbRê²\ÈÖ¬ÒÑð¨>.laé¸pá6ÿc¤Ïßnrq«=}{½[âØÔíºñOlÇ!1èõ(ó«"¯l&N{hÜ7façz4Î£ï¾âºï-ÔñaÎ qcÞæ°U]Ëg¢_QáÎ¾.¿	ï]÷ðr:z÷ÀÃcÒa. '¬-3Ë/yçBw¿ºò0jí¿'áÞã9ßÕK¸Í|6 vùâ2wä4PFay»¨ô¼Dy½·;=}ý®>ýE¨E± Pzö#èå<¿,Î©ªÔ@yçù´!ô ]  ðÞ¡íß Â2cµËt q¾¶AHûýM&¹Peãª¬1ÃÌã»Ä!XOu^åãJ8è2¥K8Ke]ëFw}ü.Z]µ?Sùà¬>ùyÎþñsºëí¿ùÓ[ûí>ÐUhnÔBäpR*Å¾@hÓÒ@7Àc¦)-ªI«8Ów|íà&M¢ì·Mú7NFúÛ$7ÓÇ2Áú&®ÿ´¸§ÑÒ³Ôàa.1ên3B6Kå= âk4NèD÷¸Ò[AgØÉ^\M¿«DÍ_8ýÂMfT>¸bÓÃ'ê[ÔõLu^[3©N]vòý(7UHe3¤Ö(sQf+s÷²ÅR×ßÝïë\Rµiµ²Ú¯ÝñrípuÜCë&ctJ+=}.H)¾¡âïþXTGíä¿wc´MÌK;ÎÍFÂ+YHÏQÁ¢²ø¿QR¶JNøäÆX;¬sqK^ ø>ãcy -(DsbÜx:ÊÚ($EêÅ3Vz0¾õQYÁwj:^vf9:î5\Kàã\û[¬È¼ÚÎÿ!÷P~_Þ~üw©ó®KÀÿþÙG´¥æàªsä6³eÃnÌçn(QÛ+Ñû {6ËÖj1.[mtp@ÿ=}'D2Le¿G_×w¹°cw°KCThBÍµ8×Ü#u_UnIôðÒ¦â±çj±Æñôõ÷½ZI3K4Åçtµý7:<Õ¼Rø\·»Z'ÐFÓúÉoØEqWÄ¶XóÉ:Pû¾¬aGP­Z[Bá3fCÍd÷=}8\úà-IÀòÌW-÷aJh	¡=M®[gf1XÄÞ3¹D©!;÷ï¾-ÃÕÓ½DµOx}{¡ðÛ7úcùH;|ç¤Lz£ÿÞiË 8¶ã4ó%¹ª,ØL}.9é'Ëë= 	ò¸©#¼d 	kêDØÎpmU>NÑï	æ¦à¹c/È7èa¹Tß>µÛè¢þ·ÈÚïi8æsÂp	Äñ½kçßú;Jó°A¨ùf-ÜoÛË=}¾û£K2¶ñ$ed¹*÷¬>yIeÕúûTôî.E¥^,¤~Ãè«q¢$ÇçGdÆøb·ï@Q³¼I
¬ó)êç"ºrþÓÙAèÒû§àüZm??(£ÓæIá¸ÚKÚ^ÌË	JñKõÌ)å: ,Ô'LÿúÜHhÊ8R»kXä?W<NäÂYåÆ±Pý¾¯áX<:Ýå=Ms©ññQi²w·÷Ïù(æN,>%x|ë ²±wëEaé)"óPõx@áÝYnzÃþÓ= Ô\¥LuM"·*Ä x)ÜõÈ éP]Á&Fu
yô¬©kwë¯Á_%ÂÔ+'ãOúùç¶¡ãÑú?¿ã{*ßXÞÜ+ò@©k7ÌØl7°À4
ùÂÛ¬)¯"x}W±~°~EuûÑîVQB*éL=}Æ¿_V/3÷Üà2eégÝ<&ÛÌi&Òª©òµiÄËÁÒ ó¿iÜÝvüªkÊhFM«FÃW~óSRZ$ªq¾tò>0ã)¦k»|ÃÓ$NÍìsÒcÙÓã_ÆòÆ*f>äÚÝÍ+5ð$²u+)°Ó«æÑæßè±.¤÷fÖ¹Ó+¬[ÂÎ/uk<A¶~\·gCïÎ©(/Ç¿XOk«¡ö9'«³w´MüßjcüóÁK÷@7ÿôiI;ªôöi Z¦Ô<)ÔaõC»2Á]Êÿ Ó8Øêdõ¾£8a£½xï.èÌ¼ióêè4;ÂmïÓ×ñ£ ãÊMÿô¹_ÿ&À}hMswI1«?áeNo*Ü²ô(ù"/fTXä?¯Z­Ï&ï÷¬¿º÷Ý= m1iR¢»z<k×*O×ÃçÑ\þ1?A{EÔS{Ûwg\[b=}yb5UÒp¹Ýc¤QJh= ^YÙ½sZÐ
ð(tÍß= ×:ä8)¶Å¤6{§:ÞPðíSatt;>÷©8m¤ºoÖcàA{v)4c±^´?Úûâ×gC&®7Ù= ³}Rh;«Y¬To^Ôr6=}ó3ÍVÞbs,3ªJ[·òóµh³t5UøXÿÏÏ×¦Å$.ð?¯õì\áÂÍSl~WpÁ Ô¯Pè¢½d]ï*OÂÚ8Ç©ÖöS§Òérï<ÿî)ÃC7â§BjD^C¥HÆJîêÍ*?{¢Æ>Eû{FëWÁZÖ?¥±º\K+¯0âHdzÿØr§#*À¥YùàÑöD)¥eE'ÚÇ¿u®ïM¸|~¨×_%Ó¥Ô¦;ÐØd÷öëÍ×þJ£÷w4¯Z(ýÉÛz±ÄÁô,é|É=M&À|Ù ³£Rª¤cäè hMbÿ.)¶£Ýý|.¬+©¤Jª²ã|j+¤o¤DKËF¸8ÌÂî¬>póUØ´I÷µàW§´HÀ%ßåÁ´£wßR$íÑªHÈ=MYv[±×ÿ¬ófÓÓ¡ø5öñRj{O¥bt³ ó«
ø&®%M«« ðãvMU@¿¶m1ò³Y¬ÆÇ¯AË;ð»¬¨¥BòÓÚÂ÷¢2dãÌùÌËùØÉiñDDÄ©¢4¦x:é¶ùÜºNW.s-êOÞBáaÊKB>\ÂÁs±u¾=}C:'ô?¼>¡z¢¢r¢ò¢zâê%ã¡CsáÂ«Ò¿:$Óm }ûÁÏ¯e´­ s&yÃÝ£;fbª°Æcf®.Eâ.¢r5âì2}¼iæÆ"3cìÏÊåc£m%Í³	Â¯Â#æ§ëh¤¡¹èj::g"9 B ìÒ¬eÃ[!6â2¥n«ô½¨AIO»º-¢nåÜ#ÚUè¤/Ei!w~Y~Y~YÎM¸ñuÇz¢}ÛëÝ|¾÷ºÇÓ£fgd¦³BNÚg%Ás¼ ª¸oMbYÍäâtÛ%ôöO¼fh	f¢Ï5OÑo(hË©=M³-ú2w+Â4e·$Pã»@éÍ÷Ó·ºßHôßGfµð(NË°3·LK¾ ßÚæú¾C¨­o¶óà±s ÛÆ=M*ú	xàæ¨YÑwÆ¥?K»Ü³±½+°ÈÞ])ÙDK½gr§*]íä¨¾ê¯Ë¤áåBêFåäIóñã­¯'F%Ï¹­%ä¨Z»ámÇ*¢ïO¤bËà×&ÇDÖ
þçÎ*@èn+ìO±^sî!|É>s¶(àá¾=}îAQ«ôg¾K£ar^øÁÀfÒ)äçÓ?±Ò¯¢½!âu¡_Ri= i¡iËòfýæ æL!Vá ¢øÚjvwÉÒ=MuØÚx<nMíM= íTYÅý!ùÉ909á8»È¶h2èítã$2:bÓÌ2jq qoi||OLwU3+Å]T£ó®0±Á±	7ïbî n&a=}G	]]ÛQq@1å] <H×X ,= [Åtåä%pÂØo?~Õqc¿}Y}9À8ýþiýÏbp^p p¬	}{W~×xwx7íÓÌðß¶¥v(¤sÇØ|KVÃg6æ
1~TìùG«8+¦±*ÊÚq¿Y/f~WýX7[ë&ýÑÌ¿ÑT¤)u~óªlõVÌJ E#-5×åÏ;@HÔ'BOr,($ëKãC/úôï @b?úÞü%¿¯=}z]Z¥çÒÀF0rÃÛW­7Ì!¥úîn&mìe:G¨êæÿ¸O ÌËÅ3å?zhöAGQÇ¹oOjs	L;úy~¨¡£¹lÌ¼ÿl¸î§qÐ{WwöÄê½úè¨iÀ-eËrÇHrR=}É«Âàì.ýÝ³Ü¶
+[1ßÿ3Ç«úÓL8³-58zmløPä7ô7AáÏC·6I¾+¼¯ö¢HïÊ~ô§¾ª"þªÿ6ìv³m6JÇ$s4Ågéô¯uÏ×L- g¤dcÑ= |ÎxÍÃªõ÷ÏT¥*¸ôg6É­E7Êõp)_ °Þrqo"	zX4.´$3Ð§ÓWhw¨¾q¸b0
Û* l(r>¨9ÁîYÈ]²}ã^	zLNr½°P= 9.bóÿ|o}r°,mËQ0
Yt?2¥ : ÊÁazØ¸p¬}8?þN1T0kaVðÉ¶
Q| ×>¨©6_úÛ9 õ
Õð{,ÎØ©Æ@_:à9øK^	,_2}iEîÁrC=MT=Mì+Dâuy1[hr=}éª)Þ6þùÛudq7:péNÙçIº_yÙ ZØÝPü@\xW|ÎYHN r{paGnÚÕ}ìûrý/Ê]©á\F4OC{Úm"ßi] lèòÞéýñTÞ= VT 9'Wøb>ïý» ÙhF¹©*ÿ¡jß-Å]«5Öã$î6îÜQÓ}å¯vìÙê«×®µè?Îµn{ÑB[ã÷& ©Êºî*¬GÃsÉÖÕ=M±* Ûxgþ}.iôAÍ	A§Ã³0:òïÈJ5¹Aë'súúñátn,õç­ª5\k6Ê,=M+É¥N®'àÄksm£ÊQ°Ú-v«µ1Þ£³.ñHöì¶»û²³¦Óá*ç¢é:5àÔcøðß(´e<mEëc²´ñe{öc:íJ ëU(+È£Ús­czìº¦-ß_
©*$R+ ¾3jµÚ;Z×lÜï©5-ãÑ+øoÆÈF©+½mÖF<Ôgäu<%/cÑJ@ög= k?z³6KéèøÕ£Þ¼gH-l³±ç]®+Ù [½zcÓCÏúwÆA±çóêm:µ¥9JçÛäå¯¶MAw'o#;ÄC½3øÛSÎj2ß¯w®\êäN¸<­¤p§» ë HÃÑ'·M²Ù»¦qY0&xv)]ÐéµØ,õÕ>ía$ø=MÆºv|z'¦¸ü­,zòêûÀÓ"qOö?@É}}û1¾Þý­ªÍl	ÄZY=}-*è("Þ6S">|ßBL6OÏé®Wí°ëÝÝï=MÀvòüÎU¿\ú¼õPÏá%YqæË×º=}æþÈ?aæüÇ×²ÿËÇóo= ÞÂµG*%ÈòrXõ*^Nî­íbÆðÞàÈÄIq@o=}_æâ4	!Oð"!ñ4'?G]æ<ÒáÇ4Á}ÄP6É,h,\JJ{ÖJEDÙíýåS	òDg}]æDdñÑþ¨Õ¿½KX»¹MIKÍ'AÕÂµ®¦Z¶­îõðÏmþE-}ú0ud¶§xlk¶}úùÎ'U¨©á°û[
¬ZªO?äaj·«|>? %m ÀàhG +0w$ÔLÍí¹å	+ç}hÏþ±åþë'×åY¯å$cÿ'1¦0­³+áøºÓqtd}Ðª2An^úôq&V}ÄªµõQëÎ>G1óÝ
xI¦êqâKswÁÚ5s= 
Ö÷ÙlëA<NZçÁàB¢ ÞDÖmq q}Pª5u7_LH1QV¦Ú'èBaÅPK®o'ñ9«îën^Ua&½Øi5^r	¸:¢JÝ"LÖ:*ðoô ÖÈÓT©&Ìâ ô<¹»2üÏ¸Ýyv²=}¹@	Ð²|¾ª!=M}{^qÿµ]àÉÜ¡N©¼*ßyl
óý&m2À$sy|â ûo|ÎuºXWIT&r_8dªµqsd¾Ôdq=}4êv-nM½Þ¬Q,0n8>²Á^óû]TîvEn?DÔÊÑ¹ßü¢(Î³}ïYõ}øì<}ï¹]ÚÌÐn)évwmäsYÖ3" *IQ(|ÎÙâ7A¢ø6/<.IÒûZàÇOj>IÑ)âqftMp´,
Ò!xJIdKìQÖ:îe1ÏQøÝt $
Lb¸ù ¢<ñÿ¿Wãu<nzÓáa'¡îæedC«lÝ¹E!.y­2ßõGYf2^4­ÆåÀJ¼Ý&5¤8eÖ¦±Ì¶CÑR#:èhv»È&´´ÿ¦÷Ûál0w 	â é<u¸Óæ¾GböÌóó³é ?Ï)7eRrâï95¼³¸pEÍ¡ª®\¸wÓá
M*7¤ùSLFÏM6ÑGåXr­}ÜÇ'©Ç]WÐ6èf Ã¿#ÉwùUéCPDR<d<êXåÁ&Ô,V¦àû-kN¥Ò«âÁÅ<å1a-¯Ö£*»Ó_
M+þg= í>%°ye»iaT= ;å ÿXÓ+2àÕ×1àï}G½òiÖ	Ö],7dÿ´°ãº«Ü;ãié}É%÷ý0Z8üærF¥;= ¯aõYå±C(]ÔíÀwFµ¾#*´#è°wb8MQu[¡´3lß[MÓ·öl=M!Ø½QVK?ÐfI|sn+5°¡3²aCECóè¼ÎJJl&{ÃùP½ÁpEgãüãÕkÛoiÖÖ·W´_i@W#dø{ÿ»À³ëÕKÂQaêË!Í#MAws=MwÿæÍpFáå¯/·¶QduAB²¸	6Çé)²{¥«ZÓHâ4¢ÖmÓÅª
äØ´o÷6¼¤¥Ñ<<°Øo#Î_·¢ªQ«AÆi¯ »¨¡¸¨VÄåÞÿ~ü³TÎ%°$ÃÎsèóq,t8ôdï°/ú­zùüb­S;ª#¾ös$¹7ë±mË¿¢Û ª7o(êüÏßlWl¬nºAòî0²aviúp?ÇUXTÕÖØuÅ|ë¢2rn la??Wöu|¡qÙÝ7]=}Í¾¸AaûàbÃýäPÊÈZß ßI¯û½93t!~5Íô,È:®pú
)A:¹î²ìßQêÏVMæêÁHëv&ú¨
îÇ5»¹%iF\¾
*í²¨ ókDw= äåGÏ~oÖ!3zýrC µBX¬íà·ú8 &^æpÉ=}&"ð8Z±8ÉQ2þ¾ÂîÞÒñÁ9Ð·eÐÀª= \\êo^A*åæ¦È] µf%YhÊQr®´<
aâï=}_ÞKgÛ!xi¼ÒÇíÙH(¨¡³¡¦õäåD*Jhï,û+÷éìÍ3+ºMK+æ(®ÂÆÞvmZævD¢0VMå¡lîÄ"]VóæÔÅ^^+N³]QÒÖô¦Rzg¥»$bØFV)=M=}¿ZÈ_­D$aÞ¹q2 ² fVO¿HÃîT=}«NEàçÁD+{bÑêmÉé×¹»6½¥4+¥<ã¿G¤ ÕhÞ%2ÇFûøÿ'Mc}«³UhO.ó§¸ÓðþOÛjD15»àøÇÂìBéLÃ2~÷ÚN~­Â4.4IiÆ/¯°Kl¼=}ÅÜ'©Ëß |9bùýîiÂ^}b¿;g1Fµ§¦,¯Ö2Ô<= "¡h
2®ò»R.ÃÚ÷¹ ö¡ð´Wßà'­#D«Úß,¡ã¾íåÕ©âÎJÅþ9º#íã<ÉTæx´¤ùKLg=MÚS»nz¦MdaYZqé}WÙcgT	©¥Áæ ¶~Mú¸òî¿°AÔ74Ù:÷úhL~õü0rìì}ZÜÑñÅÔ¹IéÝýÑðµ-l.u6ezïZÕÇôù¶Ïc¤ê¸è[ZÖw þ0AOZt 4îÞ¹ïTÕvªæ±/Tøóz= Àöé¢xI.ï§¯ìËêb÷îÖÅ%¹{þ1×wtë×wø	{Oéõ{éá{~ø¢ËÆßc7Á²
¨Æ àÀ0¸ÚõP@Ûyû**Ú:åIþ1sEÜÛÈkÿç¡ï/ÿwû+»Ð"ÛLù§,açCÞa·¡áeõ¦ q@C)~B¿sFaqBÒoZLDay-?+h©C&©BTýMv+HqI¯¾°W= ^ =MFBXÁ¬s0òãÖÇÀCZa= vo©W½q
æ	gL¹ý§þ4|¢ ø6bP´ºÒÕøãº,.óGÙÉÈôGHÝÔsë¸Z8è\NEazºzðsÆ\Où_·®íså×ÿTYú\´.ç½Ãyà= d/¹iÖX¼CÕ÷zZyÚÛ§¦íø$QFQg­:ô¥¨]DaâþÍR@{ßjq'J±"¯ÎsøÛCr4~Àâµ µÜñ°°mGré&U
4ñß¸×{ 6\×lå&ýÁg»#wvý= 6Á© î0{#¬¥Ø¿æ|(@F¸ ¸ þ åè´ù¢ïÄ coK°BàBNPìø/Qg¤sèD
6ô7ÄOOâ0êüL$»B¸tñÿ¸ûR)ÎÎÐ«¹XòHô»é"zr:y|÷TX/4·þôCâ?ORcÖz:Ú¹ý®×7½nÒµ)t°åÐ.µùÛ½ô$Q)UÞ ÐX÷|» .ÆhöôX0ÏOÀ
Ð°±2*EÁV)ÉñBØ"h]Ê79aLséámÍQ1<H@*iÐ~fa~p _í%)¾.hõV|"
gIYö î!ýãqõ=}T8= ­ÓÁvó!NÍmØH°òLÊ7YWu1õqÍÜm\/ÁL¡i<ÒBÂXi}îDNÅq¨\PäÈMÑËE¦çº'þ,bÎå8vS«XÔsöäª(¯¿ÊÖ6Lx½Ä9¿°Dä¸r)áe»ÄÛ¾t£ÿ/hFò~jÅG(ó\°åy¶³§_¿?¢
BÁWWÜ&Ó£qYO~Y= T~Y~Y~Y6]/rLx!]âÅë@«¥© dwºz=MËJ¢iÕA,ï	Ív<lÕB(Ï	Ìnül=Myµì×Tg6ëÕLG6ìÙ\öëÔH7öìØXwvëÖPWvìÚ= ÖkÓFOnkimlynkqmln¡¿kd¿m¿lt¿n?kl?m?l|?nÿkhÿmÿlxÿnkpmln ßkfßmßlvßn_kn_m_l~_nkjmlznkrmì»=}â<kIÕ@<o	Ñük9U?8O	Ð4ç¶îß,Ç6íÝ<6îá(·öíÜ8÷öîà0×víÞ@vîâ&¯Öàó¶T·uly¿pkìòqqù2TÖÿqrw1ØöaJ?\Ô"_àÊ;¬8¶p/uì	éÖÌÕLA	â ñÖo7@
m9ÜÞê	p,>|^ýÃJ(ÕßRT~:{LH<@ÿòú{|8O=M¢þ}ýç[ÚuÖôA0±$i
_ÊÛÆtüìqïM½uw5QIïXLÔþP\=MqöaÁ'4A-ùMjÕ= ù\õxÕK4è@ïvËFÉüXkOðÕ7:ï~Ê!ü²mûF	S1üO
É¾;pé	W,ü=M	>>9	+@~=}	^F¼y^}vA  "z±rdàwÖ*ëÛ}^1q= Ç
?Ov?)Vrõf\=MÜðºMØIyÎw8}Rxf\ìòZÙàLz^BÂ3dfU÷ÉòkÌ¼àÎN58UîIm ¼"Çò¡\bU$¼ÄÞ*¡Y&HãZ{A ÜtöÿZêâ~@à]ïÿ]\qEAr\]½ßÒhÖ"]!9fB[¶ ¨  b^áÊ¯DÐäÏ®&¦Z®&hê(dB:tbûW­SÙUéç¥´ßã¾H'ðJ[Þõ=MYLÎõòHA]!^øÍoÿÚ¥Ö%2í©øD¯¯©U¯¯½2ÓÃ»;Å÷·D'«eÝ´É¹ä
ÎéøÔ§¯ÑÔá!SFÇÃfÇ3:ãè¥®Ìõ;ÒíôÌ&#¯?ÃfÞÜ= µÿÌofÌáDKíó#M#ïO'QRµ0ú8ÃP	(mÃ×Ùûæùß¸9pÿxßXèR$\ä&2äý×z%WZ$I°&÷}$ª¾÷áX*T}¤ÿ_ÆÉâ'1¶=}}c xd_x¼Âª^CÍ}¸"Q3væÚ°0ÃdÁÓ¶ò÷çÒ«91Û/² ô8ªDHâo¤»iEÌËsá«Uæ¸­áÎ¯ÁKÆO0§z»,â½ÝøÏ=}µc.*è¥á)Í¦qì3P¢°]2é×ã½ýc\ÈÍ®þFTT°'#9Z*1çx{ñ³aÇfßÝ¸Âè=}<¤A¨|õ<ªaI£	è9ºf[W·ÿñ\HÞæX®=}^$¦¹= tH²Má¨ê£¶¦ó¬Ãk¤ñ¨óªc¤«D££Ù²Cæ¤!$â£s²£¾ðãé´«
«ï¯à¦q §Ò´I»É(§ø¬àõS^C:Ãy­3qísù*KcêcÜ~c·ª}¤eÜÊ  ã°ÓØ'Ó}ª"S&ã:*$b¸¨aÇÁ7ð¥~_¨kY³m5½3¬ÖÂÿ ¼'fävfwE¥ÿ ¸öcQL¤Ðý¯ÕÈëC $Ý¥á¥Û^Ó0¬ý¼%åäÛ&1ó¾9;¡ëÃe±'ÏÑÅ"å'BØ2àz´M·«Þ­Ä´A7Ô
d§)Nl'¤¯=}d;yQ[?¯ÒmSªL+q­µ4-·´L¿ÇEXè.àÅaÆ´Mµ>·=}{üÏM¹Æ+%º6éÒ´AJëëÛ¬N'Míáõ¡T7Ñ ÃBÿ75öÙÕÄÆæ	½ÞþéîÑn[qDø\?¹>I¹zËâ
©ØÚÌÀÁEÃºjÍë¨@µEïõ ÎÜìÎv¡ÝÎ]$û®Ê^ý$ÊP8@íóûNl9ô=MÎØðOÞ z
ÕXq¼ÐÞÄh)¿àÆmWØH ZHÝ~ª~¬i{v½ª6H¦ÚjkRÛUÖ)Ûô8= 1×z4wõ
è ûBPÑÚúYñýùòrï¶U~\Lªmf÷âzös84cÉæ¶R>
î$yÍã­F#eÿcÉó®ëëÉ;É©%«A¬y 4¹æÄ~GgTÍçØ|t¼ê'ø´ô&rd{SÚ©¾=}ÆâÑ¼E"­´vU²/!øpäj®Ô}Ë2àiöªíÑ·)4,ÒìM÷5²üOã5JjÕ~}2Í¿9:]-Ñ üÄÍ°^ÄÍùTakÃ~S'Ï7± Å5bzüáS ÓðÏ¶Ìa"M[Q@ÊùÐÔMD¢)LN±sî±Jjé}|[|Q^
M¦^;Uq±¼[÷~NR4b4"6áWùû]4 sïS= #S]3L4°,;C}['V)l@ØÒ>t=MvT0]Ví¡cE"98/ ÷»Uñ<ÅZÂÁ"fcÐ]ª¸0hccC	¬x2CN¸&J¸ÅÏÿÉäoÜå©ûæþÁhn¤»ÝÎÁ5d!±¢IÅk	GàfâYdyô^~ûéÙVÆ¤Úæ7Ïrµ®¦0µÑ×ö=M¡¿|¼7É÷úWr ÈÜ!úø~î¾Bjà!ÿù¾=}¾ì¢'àÛIøåõÜúwæ üm9ú]<è@]1¢Hôð£U)C]Z«HÓþäëUêù_ 5#Iå3òvDÁ±¦¾Æ,tÅnKr7-©qO¸Ú0ï55P<È·n÷ixÖ§æ1x F!ðBú*4Èpµx¢=MâuaW (_ª¶+í/½ò­SÐ[úaõ~EIûâ¥Ö;3ü¨/9ºxg9xN?W8>½Å
ßo:5èzwYxÑ iPM= vÀkÕ:Û0(¢èLgÚi@GìßR÷BHÎ?ù:Vê¾éÔºÎö¢M²ÜYëï OÆ¬í;Ç*NÐ@Î= #fýòôWjsê9Ø¹¡hú HÂÉ7ûâ YdH=Mû!~FÁ1EÈ%xGíØtîMIÆâßKÙÁp=}ÞÀ+þ£×P§gþ#*#yú£|rºC¤f¤{¢TË+Â»¡b,£ç£ñ¬cÆµsç¤pÐ¢û|ò2».aÊÓCº³s¾ËVJ³. Ýó9¤_lgÒ³Ó³ä¯¬G3ä±¨OC%©%Î_³#»3%ÑYß'ßÌë{}»Â´HZVôºÌkínØ.­YVÛO?W1[g;S£êX»£i÷¯ô=}B<uQ(ÄÙoæJXÅcGM&]:º	¢×= 1½¨[ô¦ÐpnwI%Èò
ØüóÖekD ¡RËÊPænG[+ÃÂÞU?<¶NÍªùù38yµK¾übUäwF*°xHÇÚ Eæ1¡eY0¾yÏR Û*¤Q¡Ô7Ü!õ&¹Ýä²ÒÊ\¡ÁBTnP<_p	Éñ_Ôô·ËÔ'ïÓ¡Pe]_yÄfZì°.z5Ç¾¥6É67[î5¢¦(£¢%à*B6ànUHàta[àÝboà÷Rà·-à±Èªá|µáÔÂázÎá-ÛáÓõéá7Â÷ábêá1iáS:"áõþ*á²2á;9á~AáIá{¾RáZá´^báéÊkáZEsáÍ|á7^á¯öáá©,áa³¥âÂý©¯>¦ã@ »#
þÙVlYÚ/übÜ~Y~/V0{®éq)rï»wÂþêØéH4Þ«
ésûÖ)ßh§«>%i¦=}½rï¯þG}9eº±«ºi]Yw.)õ§ó½ï=MîË1Å%rBEk°0?±¿ðÁòUEÖÓ8ZÕ½~SÊÕ:Ä®{ÉBj¨OËR.èßýøïñ¬ikÝÌ
ñ7¥Fê­¡²øUC5uÄÍm÷O}Iþ¸Fj¬í¦¨î§"¡ÆÛ= ôÓ;ã=}iÆd@J%P§8Â¨jb«Q!¶¡ÄûÅ	ì"6WWØ[ÒPgUÑ¹âÇtTð/WÐ)í¾F.WäÝëõ£?8ÛéªëþËçeëA¶IâG_X5ñÑN÷
L1õÀR¨]rÈ^üâ7eî:¨J¨*G­O¶¿þÏsêSbýS«A	®­¨¤%Ïªd ¦dbf¨.«á"öÔJøèpø¸J±K«ýPBÍ(-FlÍí= øO(Y-b~LKõ75Gí?!ø5:JøC5iíQ¯õdn­÷ýRì)%þÑ­WéÍû ñ|Ü>ÚktP7Øù1=}<?¼= ûØ7UV'(XÈiìFµ!ÿ%0ù¹¶ùõï.Ôjx.wû'´v.kÏEø= +02­ÜVI³eåáôëZÑ(@ÎwB¨ï,ËCû¤90{OoRoT @j>SknfgÓ2UÚ\ï;nüÑ¨6tpcu¿µI@æjN|§zviÈ>Ââ§6tÑîéJ4Õï÷)}ðy^ÏûA("û¹^
ô]Þ6È¼<
©ýh¼Ï»@dWîµïëj=M½xvusÂB)tH÷!6JÜÅ8'6Ìÿ:HSó­úÈ¶¶6/î*9È9'vç¡MìÇÅ(
¶:<cÁ¬þ¸r©:yÚgt
é¿ºVà9å¢ûÅAhS[×©RÄÔ'.7ú×¾E[Å2åyÚ-OH4ÿ×2V´¿00ÃÛaHOø®Ê
»ïf;ß7ÔdD7Ø'@¾%¶%ýðÓ½doû¿çs7Ã!~´+\ ÃJ¦Û¹³c}~¡Wð
NÂÐÕâg	k  f*Ö sfh­áIai.tXq6
= ßTPCò²ÏMsh@òV;|q°DÊºq\Ó(Örõ?¼s,>ñW\k"1Oá#aL¦öy}V'àØ"~E*ÀjJ|Ey))Ç¾i#©Ús}p,y-ÜàO{ÎZÇEx%³®]ÀØêjc?Øo{x¯åöÂ=}vf'êþ0ìÂ=Mï(´¼uÜo3±»Ó"O¤]{= v;ÁRõÞõ:ö«Ý<6tÛ,w¤6»öÓ4¶ÓÔ@ãxì¡Û1vd{\Ï¦j3Þ) êu-ÎêTOÇTÆüÔ
§m2f\Ú?N*|»tæ[«F¯s
3±vÖW<ó®ðÐÖØó¦ä½»JLV2½ªK4¿â+èþ©õsÃ²å©è"g!jW"uwu*	váoÍpQÎ= KÀt.UA~~&ðÜKÞ¹Æ¡úíp]ÝN®Nr	@
¥ÝM1o~$ùÀS=}A
}ôÝCÀâ¬%ª£ÄC£#|Y~¢~Y~QV~Y~YXA_¡EùJ¢Æ~tâ~i#e¹_ÁÚz}k{°±Ojìa9Á¶ÓsPåÈÈ¹ëÑÒæeT'%hË\º[T#GqH:òÙ5>V8äc)[H
­à¿5kþ=}k¥u
jtKÀf~t6.Çã§e+=M°6·.¥<Ä#üT!K:NÚÈ._v«a^Õbt<m>ñÏìCJà®ÀÌ>fåÜÎM]ýUDÜuïÜYn'(éëïÙxÂ mÌbCf>ÃÐ:=MUäè@úw{ê¨pÈÇzËÕåöAèàk_ÆfËÌQ7^"w}¢ÂW!ÄÜÊ6¡ã|úI¿%_ÊÏ)ÇÐÀ)Ra¡%(ÖBõ93ÝÙÉõu¸­Òµ!¿AÉgÛ2häq9h ºõ
Y6×®¤¾«ÎS°	ÎÛNW7bºTLvýp	v8¼ë±Bmàb,Çâ¾êu/t0¾1ezÄ?Ù³JOa{î«4ÌïhEùtú@;øÑ9QÌ·ÈVç!US¸À§d¦ãÉä£©sV~Ù¢Ü~Y0~Y~|V~á<;ìE¾6ërh»H¾ä=M¥¬zLå¹~µ~¦çéu#¯G5(>7,=MD·\ÈeîáQé­3êZlUyG³=UÎÜç:6#zVëÞný9ÆÒ/Vó}=}eú$Öµ;ÖT¦cu7.QºÒÁ4Ñ«r= hÂüô¾EX:4¢4L¡Iq{À}id§I¹ÖøÉ o¢\wp=MMÈ\&QOÝíZÃw|ÁX)ñ Gk·CÐi¸}ÑMðâØE®Ï[5àu0¹úsÝd×¥æÊ½L*ä­ðÉ|èö¤= 
óñ@Ñyt2Ð÷ãN>9B¿E¹È¶ü¯/P;&~âçÅçoþ)ZÎT©ÐÆ4 ÖþfF@Ká^ºv÷±c(à¯~ËBåü? ´)òÑ%ø_Nb$QÆÓÏÂåt2Ö§á!¬ä6ÚSÍ2¦Þá,P@"§º/'Åç£¢©(dA¸*YK·ïåÄÏÄ2>¸´ÁM':ÍóøèXAÝí±%Òø®ñbÃ×æ²8yKÞ
«y«ÄÉ3B)½Þ·AZgÿÎ+¢Vdq¼2àj¿Ä@'ÒÂÿ3|-ç¸,ÊaK]&¡¡*ë£Á=M¨$
«9'{HçC¦¦(ù­ÆË@¾&@éTS¹² R§¯@ð¥¾>/À²öôö3)8Õ³7,§aÿ¾mdü¹-V V£n-Ó÷/Hø)pþÎnaµ1=MgÛy|QÝcTÁÞ½qa¬vYY:øÎ¿yXæeK¦Aî^õF¾Î	9ÂUdà+]Ä_â% ÜF;Å«Á£ã³£­iY~Y~Y<}Yz}Øqú~YP<GrZUÚgû) ¢6y×üÙilô1ð_öÃñ4-_AFçë5Õ9B7&­ê>÷<QiV¢M%Ý®%Ø¢¦°¡ýH,æ1¹Ä}~G0F±Éé]ÏÜEnÄà@üýB¶°sÚg]Äj	¾DµoiGÏÕÄÈy7î2ïôû=MiaÛWÂ>T¨Ô9WZnßÎ¿fO\½ÙYH/ÐÅÞñ|}+àuª!xG6ÆN-?§Î?Ñu¨NÑ8]ÅYeáÚ¡qDøÁ®¡ò±±ÔMpJS1²uav2þ3rA^¡0¨rÛ3$»È¨tÌ+gaùÍ*s^Õ'fáDÏá·m@ÓÙá«6Ë?¦ý´k"ºd!Bëá.?ËÑ0åú×â"-É	¯iTÿÔ9þw-ÆâÌA= ¢.
ü¥ÉCÆ´hz,¹Èòá<v6üH6%·oö<= É8×¢5iz¢<ñ= 
©%X¼k
Éü'¡@(gà¾¢VÌmq²ÜUmÈ
ÑÑ)qlfíØB¿3rYa¥/Á·XI³= V(OrË~¡Å?&-4F;ÛnµÁpÌ.ÌÆ H7Í*%Õ²8tq0nÜK $=}[%ÎÛùûìw¡íïßMËÿhRøLI¢x*yó °Ò8=M\ôî{,ýA¨xDUE1TÒ7yyÖ¢àÁ1°ÛñãJ$GéU!S¶n>ÉMo>l¿	,	µßþëBue}Ð*YÕÎ­þÜÂ)Ù¹áæ»vq(7ÊÞ_&	3!X&Bñ¡ÁG"@¯ýXV.TîH¾Re z0F¹¨sßyfàJWº üZ:ráafþÂUÂ.
ûâ®²ë!#w'¤É±3#¶U&¹àk¬tÃÜÞ©T àëEr³});v³bÿÁek;<fß@ÛïQB²×%C§Z|Æ[Âä§þjô/-éL;ßm.ÐFÿ[Ø-Aa#Ô¥Þ¨OýÉcS#Nò¨_Ö¸õ¾ÒgOæ+åÄ% å«Ôù´ôÌüQ+6&Å·:,;_îç´ çÿXµVßío28á«hOüÉ	¡ùÔÊò+LÅÉýøåN= '´µ!Ð7SVö%Ç¬júëÛWä%ô¬âÿ7ÓL'Ðõ¯H5EÂÅËè-,·*	Ì &õ·Êë\Úê-íÌ.aÔ÷¤øWî7¹4W63©þ¤|ÛZfL¸R{@¥0ðÚ{7Pû6zJ?Aµ¹fÒV; qªÏQM
T´.8Ï)a	4kURÏaqLÏ9¢V¾¡â'h¡´¹o)üÛ:¨:á¹	_
äÜ®$ØÏ\lå¹ÙSC>qå3Ú®Û2(#Ïo!Ò©À·ækÔ÷i+Ä$»OéçôÌ% >èCÐ%½ø´7Ú­©Ä[|­¤w@¸c*³¤{/´ãøáÿ²ævËá;·ºã= ð¤ÿm*ºøpªL5ß3ÕnÖºef1¿¸>¦ÜÂVdÙÜ¾Uü¹¿q'^¤<ù:¤3¤®rJæ|7ÛUÕ°Ger÷{!Ü¨éLIãþ=MÕK÷Èd0üìó8V¯?Í¶dõÅ2ð#W.óÊ±'Ç±¹iå}»Ë9+$Ã.Ëm,¥zV4S\Î¥¥øÆ_øÛ·H)$ó3^¶¥ê©æ&ÓÔ«%¤jã»-¬#f"V6ª0J Ã=}(FáS\Úa%?Aó~¦¹±]f<Ú¿(yäº{j¼iÜ$ªê+£*É»[ªÎÒ}e>¦ÙÓ0Ø;JüdåâîóÖ¦Õ(c}!®sU·QÔ*h>oå/Ì=}Ò$-.ä]Ä«rÒ#b%SeÁïù<®B;£k»ôéK«äRÔà¬v(/lÝÓ^ü¾z$¹t'?üÃÉ×r#zµv$ÜÚ¸] Jã.g;Åÿ>£Jx^½ÿK­XÐm<D§y-C[Ï«Ð¸CTßî4&²F$~Ä°6Gã³~1%jêë=MÃR¢îM^!4zb¶Rd-oºC{æ]÷6r=MëA}îUé\6Î_Ã¤5ò,dÙõL<wXÚ3®XXgù¸d²l)õÕ$j´¬võuØ©!Äê>Ñ5@
q4¢Þð½¥î+QìÔ\Ï7·×ÀÇN1Æ@Ì^l¹VÀ+´<õ^,ëò5¥y³W8GQÜ\±¥E/|GÍL]¹ò/ÆìTÃÕEî_ù\4gá5Ëù<4\®ky éÇV"Ùü´Õ6×:òÅ\öø¬>RãéXí4Ä&ïIúéb_>,îøÎ»=uþopVoílfoY¶è/O íéXÝ(îÓèg7Ìq<q¯AÁp÷°¹ßP ¹4?ÏÁ77Ð_õÕxrÈù}RåÜÐàzÚe ²áV\Ì*yyæÞ[mCºÛ"1>3ópÁ7,4 ÿ(´qüÇæ¶×·¢àØÜ	­Ø4uC
2õÂi'Íâë>ö:uxõyÁêýCäFß^³aÄ-QòG2Gt\×böë rºueA8w÷Ðp/ãXIðèWñ	Ê= a*!ìòV²ÁEïô=MZ;	BG°
KöqÈ=}òRuL ÚëÌ<ñ(ÀÝ~á°ñOC4=MÝZK19ÂGµºþ|Æ]dö0¹Ù N¸þuöÐ"mxs2asþ= ×²]cÝ âoÁEÌÉµË·½Ní~åÌ×É0 ÄUýÌ*Ö2d ­Û"7ÅÉj0f,xíG%
ÚMyÁØ¿2\h¶ÓÅðiKös×ÿÚÀî	pR<ûN$è=}ËQ(}}V<±1aK.bm(©{B+þÑ¼ÄÙéüÜÍÑÙ;*x8Ta"¤áÖû'¦¹8î¨ö7 )5æ{Þn¥¾O¼ºèsÜ* 9;p­ÂyýK:ÙÛJÐím{ ªÛæÊ/P	Ñ[,èæþ1oõ²Yk¶&ï_Sã~¾@ÊX_Ò¡¡.sP4*Ú lD£ßó»+êE%3û¨q³WÀ%jæjÓ÷r°êð«Ïø.gJÀ4k9çL7@º&a»w\·.ñÌéÊÁ¢Wj¬ËSðg¶4ÛyÈ¬Èj/Ôòär
ÌÇÒ¸ ÷vÓ½á(ßx?1ô¼»Ð¦p¨<;Ä<(æVSæÄ¾øÙ	Ñ¿ïý<&þ©óÅÖº\z\sÚ²Êpfné[ êá9 pê= 3¥ýù#6ÛÝ.2¨x?Öö#}¼¥¯[ÐcMTåo¬ÔC³ú®Tîö'4ÅÛËå2êÅßù/õ9_;Ñi*gMí/âh;Ö4è ¹8&û×oÔb+hâÊüßpT[H$h¶ÀÏ!¡k²¹ø©¡fÏ!¿pÂ¹¡n%¸®eÆÏï	Dc;¨Fú[Wì¯­i#ÞÅ¹$H³9­Ô¤Æûhªjà¨ÓFØÂHäpÓ²ÏÒªæUdwâ®ÀÕäpÛ¦IlHfDÊLó­û©È&ûÄ¬5ÑÊe2§{xÀª ,Tãêf)3ËÓ¥õfäê¿­ØdS=Mÿ³Û©cÁÛ®VÛk'Ò$(2@äPu´'ºdVÐûhûæ ßî.::9%%¼?ö¥mZ¹e=MbC¢±/rÖ){ä¦ûgz&F	ffÐ[ Ô®qp#öÎIå~Çy?£©¬=MS= ç¼-^·äCI£	9Ó·Ê°y/©´µ?:ÑñWîá¶^n+h8ÜÌéM§°'MëJà5úñÿ\ñ©5Ò5e¼JlYmÇÎÃì9ðÁ¿{íÍ¯z6þú¢êÍuçÆÌ(K'ç³ ¾ÂÕ×nAoí¼5XÖ+T&­Â4ÇLtB<^ÿÖðIf¢ÃÖS¨ö!y&,@Ù(|ÞImeCLh@êHiY¼¡28^¹Þ7å\q[Ã<ÑH/=}¬òÜ(ÂÎÒüÝ
2Ý  û&AóAæ¢VUCÔn?K~ÁPÞµðàrHö^®ÅMV-ÁMã¸ðZôxF?-Ê6n
kÈ=M6áüñLdXúØàÄ|çIâIÜiWdÎ=}Þ¦= P8½6"zòþåÇswõµBò:d âÓKå¤"¾*a¤ÍÜôÀ½É|el{×°J×pc7÷°ßÆH0ÚY÷ O{+~xðSxÿwÝÂÑåbvîx#¼Ý~ü=M%îsµÚXéB,;V{¤B\Ýõ3®Í*^8Ã²Ç[T²<*<BC×£-&St×§Fá'EyW×1g~ôcÌ©ÎT*,júÊ¶Sç!¼éÇD|?È¨VvÓcÞÀr
iï	^ |[±-:QKßØnjÜÕ¨KE£Ê-[æ#-x¥*®T&³ÊÈ-3W.su/v-hûî/'h¦¹RB¶.ÙBû_Ýc"ÆÏhe$ Ïw=MV]å¯æ:è£Ú'Sè£psý=}²Ííì±WÐm¥Ü¯= 7­"Éfyx,Óí¿+)8~ÆcÔ·Á¨%Ç$+à±^?DÙlÁ9pS)b¼S?©-Ì®¡$ÜSO¤¿=}°3à®õ/Jåpóó)'þÃìä½ïÙ±6yáu~9SB4¢w6Xô,rØ-Àáã)Z37ÚÎë øµ,ÝèÑÄÐ vëRµ8sc«ÈÔ}¦1owÕ._U»IZ_×ºÂýeLÒÛl¤Ü=}h=Mt(»ý¿ãÖLM=M]ñÞ {;Y¬ru¨tÌ%ª×[E,y JAâs-*âyþµKöÃ&}½vè¸/v<+H(vrÀ°¿¢éª@¯4zÕº&²Ïe¢|<óÀdd(Ùû#E Ñ[RªqodF]¡» à«Âq«f\´4Kg2dÊìË^¼qîiöÑ[ò©é8	xH¿?ÃqfÖ­óªÂ }¨»{Òg¡2Å¿ä/|ÏÍ T¡®.¢
÷Á#ì¥Ã¯@~ÖSY~Y~Y~Y~YÚ»]²
¢ª¥AµåVéõ3±±Oí©é£¿?OBíäÞã¤¥¯ÿ¡q½#ª³¥Ýc¤§£ÿ¡!c«dãÁK¤À£:"âsgB5êÖ¥¹c±Û¦'Ä¨_þ½p¢¬: n"rAb,*2òëçïåíéññìèðæîêòrkgoemiq1 
¿¤ÌÈÐ¦¶ÎÞÊÚ²B#3K[GW/?%5M]IY1A$4L\HX0@¦î¯Ô°ÖÊbS[W?E-=}IYaT<H0@FV^Zëûý	ñR´ÕìÍ¾ü{\©)éiJ	º7÷yÙW±òoÏQB"¡Ö¸bE$P
ëýü
¢jbu.üêG¹ùZ0pP  ÆÜZWIL&úó÷éì jcd êbÔíÜ§gùYòÑÀ = .õ«rLÂÿß_"ÜbAúø¢|»#7UYT8f~Z«½×/bìËBóâ¡©T_þùy>yt¸Æ^3Ë°¿_ñL¸S¡ÝX!ÿzdx®Rv»É _i8b½V |¹¥Ðã¬KmmmEE¯Ú}ºC¦÷"""þþ£¶Ù¤MçØÙÙ9:Ô£F½¾î<S8óÆ­á¼Ô ó²MVVVIIc:¬~²ððð¸¸\/;ÁK¶xyyù  ã³ß£©$££· âzU|mY~yU~Ð~|YR1é)ªµYb¤ôäà[í!Æoò§Â³Ùæ|©MÌ»c ¥@Ã%©V¤ë£=}A´ßHOnÏnÕ!C(jdÔuÞeJ	
¥LÝNU1âÜÞ1ñPìfð­Þ~eo¶[nÝÅ, _=M)35éý5ëaD,*eÄõÞg*		¯ÒLÍÎU-Ì~-o1H\<åÏØðÙ² _ºÑ5~ÌiÍà\é¤
û#¼ë;~°Þ}vIÃ«$äÏî½])ÊH¦= 
©é/ÑZ¿n49ÁZÈjlëB<&,_F=}Pi¡GFôÇ-¿ñ@ìnÐ-ÛjÅoö]~]ÉL = ½)+õÑY·.9IÁYÌ*ìóÂ<(T_E5NPg=M!HPJnUÛyúÍwVX{ob5 \çÁJ½
Å@%qWÃÖ+»q±µ|nI³Ìå.V3R¤¾#÷±a¼¼hm^eOÊýeù?ÃFFñÉ´ðÚû@°èÊr~,5tÉFÂZÌÿ.Õ:rKÁT*Y¼ií^guÏÞ=}g	¿ÄPfùi=}mQTÕ0ATÀ
kÛ>:g¶¹&|e"U[ïJ¼&åqU³V;}WÙÞì»cÁóeè9´v{&ÙÃ¤±$<»p®Í[u­O
ýuy?Ç6F ÑÉ¶æ°Úý&0ð
Ò{<®UÔÉJâËß.Ô2rLV:1»q¶m[wÕÏ=}w¿È@f Ùi)ÍQX­@AXà
l;2Ç³ùæ{m¢-\åáJ>Ãç'_Js=}¥/{~YÐXZpY><~Yaw5å(­ÜV¢lÿ[Ññ»o$ÕMn%7¦òñÚÀ:ÞsÊÐ1sÛó= 2 ã>°®ü8úpf!pWFûxnï*	jþ¹i)8Î.v,ç¾_LåpRü4uL´*ýìwA	Zf?áçxÏ{"kB>¯8%ÉçÜ¨¾½ÔZE8A¼}ÈæYÁ¦a2IÁÝÀìwlMèkh¼GÕ=MÜB--x{ÔÌ /óä]=}e~ÎÔKjÉ=Mê1eyÀGâÏfb(äÁÌMbÜãò]î^=Mþ'ÛîøO¨;?<Ñùojªlðuqmh=Mp ÍÿÞªÍxö½Úá®ÈöN¼¼4ÁÊJ^î¢-èõó´asÒ¬) hú¥árÑh,&äù9a´&= ÎÚE¡|úu-4ÛqNùÚ¿XïØz©DÛxYÙùÞ»jRwÆn§@X¤Òd²pÙq²(bõ¢ È[rì¢­ªjJ×XVVút©PÂÂxRWluAte¢'wèéâV;¥»C²¥#$»)$oE9²²p@¼nOl}|6= F´Pt/gßà¼5ÕÈ~ïyl?vÄ Iö]ðj@qá¯e;'pÓ­N¹fÓÏ²vSà/fÓ²
;±«££$Ã'¸RÝxÿ©i×ë.5ÙvËPIü}ðfW?IÞ0v=}J »+(Ô´¾Çùiï/Dû½öTØioh»/hÔ¼>×ùj1ûÁvTài oj¡ß3º,_Ô28ïÜ²H÷Ý2XÿÞ²hÁpNrV -&S¥Ë'¤Ã³#ô×0ÿ¢&=MYf{â^A
z|!PjQ|XÂ^
z{á@: 
z {â: 
zß{ØÂp. zß|Øp> 
úÁm* TÎâlQ|8Ú^
úÂ{x²(  úB{xÒ0  úÂ|xò8  úB|x@  
:ª:º:Ê:Ú:ê:ú ~A½RÁX)XO{nA©
É
é
	
ªÊê
Ú¦VÓ¶VÔÆVÕÖVÖæV×öVØVÙV:$ÏÅ¾¼lí	U6DÏÍþ¼nýUz¤ s¬s´ t¼tÄ uÌuÔ vÜvä wìwô xüx yy z
#¨É{'¸	{+ÈI{/Ø{3èÉ|7ø	Ú)BèÝY¥³)$»Ý¤¾WÐIÈ²ëì_âr¢?âp Öro:Ö"l!|Ú*ê'ú(
)jêgúh
iJ*4uòíÐ à¹#©£³©ÃqÍ¥0äyUßRnàáR\ÞArÁU2ÈlAURÐnÁVrØpAVà2ªÄg2µð,êÌhR¹ .*Ôir½0jÜjÁ ò²u*Å ëòu:É ì2uJÍ íruZÑ î²vjÕ ïòvzY~Âý2vÝ ñrvá Â9C££³«%óÔJ"ÎâW#Ãá+º*Åa+Ú2Çá,ú:Éa,BËá-:JÍa-ZRÏá.zZÑa.bÓá/ºjÕa/Úr×á0úzÙa0Ûá1:Ýa1Zßá2záa2¢Ãâkº*ÅbkÚ2!Õ<bo
Ú@r!×=}âpJúPz!Ù>bp= !Û?âqÊ:prtvxz|~^¶§²«$£££cY~Y~Y~Y~Y'ÙmP^uMO= mNP\qÎD-©}D/½=}C2­D.¥Èøxóþà8øööÀøô ÐøK7=M½J:=MI6!ÍLJ8-·òÜ OòÝ/VrÞWÖrÜ¢ÇõlÃ>ß5ìÆ6¿ìÄ@Ïì3M¼	>
U	=}aÌI>Q¬6íÐFíÑPomÒHUmÐôÎRbîRaÒbÞbgÍ¾VjÕUfáÎOVhÑ®9ÿfÿpðhZõNWnPX|ñPWù^Ðý¥¸¯Sd¦¼×Ód¤Â·sd¥º§ëE-ÄYÅ.ÉIÛ.Å]û-³ÌwÓe±Òse¯Êóå²Î³Ä0Ýi{0ß};/âm0ÞgÅ1ëûÓ­cË~Y~Y¾fÓlÞ¸ÇQEè6/àrW}l ÏytÛj§2¢[ÕÜ"ê:l]K¥t$¨Y¸>$§MÂÅ©lÁÏSPäª¿ï
ó ­Ô çØ´läÏÂTç³û×[hJ¹D /<èº8Åÿ93ìå«2Ê=}³ÝeËñ7U)ï½½_v)s¼ét÷InXëIÓðBïÝjöHBÑMJwáPÖòD",æPÙÇmúJãçêÁ1ÕÞLFzTgÇöï°(Kõå:ÁáBæL¹ýì9¸UP6mÆ¶|ûlmä!Ø00O/ü¼~{=}j}Ùé.ùwVÆAÒü6rA¹0°êE ú<ÅE&úìò¼£j¶©£²
~Y\ÝàbV~Y¢K~	ó~ùû^0MYÊÈB©T*þ^\? Z9eSkÐU·<.2ïÅ4<k÷:¼k
"z¡0á"°aù³s ïÒîµ«x>Ìn7
mu0q°ññ&É&ÉöW:ÙY0Y0ª/§¯²ª°¨±©±)zê-õhLÌE×ÉÆEÓWuJxLárø6Ãî/î¸Ê.õu(üEÏô8ö=  6ð6p"}öIÑPøàCó.]y#©U;l2Í³Hh«ÖlT<ï¹ø¿ýµù½yzÙÞ<Ã²òr­ÎLQKK×¼×Àx@w>JTëDqý¡¹qáXfÍ>wºZ)ùjÇ.6µ¶Õ;÷-Ãö?ÒË®L«N²O°À=}àAÎnÍ ?=}ÝOýýOO*ÉJ¼qyþßzH¡©P?<¬ð&P= ËáÔÄÖa'k¸é·¬Î§$p! !p!ð$Æ1®OI;üî@ÓO;gÓ¬#ÇÙÿäETìO£$@:³ä(>Ûzí0RHN=M	

R>XþÛz Ûªöt\ï£+|½ »XP÷QVÈû³JºÆ+Y÷9Z}¥@¾Ý= ÿcAÜ'£³æpóCèA^5£Ë)öt[zçHÍÞQá!+£³æpqE'¨Záª2{ürÞn¬£ÔwYßÛä\7TÃa"yRSIbâmiÖZñµ=M£2]ÑqøG}Ò`});

  var HEAPU8, wasmMemory;

  function updateMemoryViews() {
   var b = wasmMemory.buffer;
   HEAPU8 = new Uint8Array(b);
  }

  function JS_cos(x) {
   return Math.cos(x);
  }

  function JS_exp(x) {
   return Math.exp(x);
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
   /** @export */ b: JS_cos,
   /** @export */ a: JS_exp,
   /** @export */ c: _emscripten_memcpy_js,
   /** @export */ d: _emscripten_resize_heap
  };

  function initRuntime(wasmExports) {
   wasmExports["f"]();
  }

  var imports = {
   "a": wasmImports
  };

  var _opus_frame_decoder_create, _malloc, _opus_frame_decode_float_deinterleaved, _opus_frame_decoder_destroy, _free;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      const wasmExports = instance.exports;
   _opus_frame_decoder_create = wasmExports["g"];
   _malloc = wasmExports["h"];
   _opus_frame_decode_float_deinterleaved = wasmExports["i"];
   _opus_frame_decoder_destroy = wasmExports["j"];
   _free = wasmExports["k"];
   wasmMemory = wasmExports["e"];
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

      this._init();
    }

    _init() {
      if (this._decoder) this._decoder.free();
      this._decoder = null;
      this._ready = Promise.resolve();

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
      this._init();
    }

    free() {
      this._init();
    }

    async _decode(oggPages) {
      let allErrors = [],
        allChannelData = [],
        samplesThisDecode = 0;

      for await (const oggPage of oggPages) {
        // only decode Ogg pages that have codec frames
        const frames = oggPage[codecFrames].map((f) => f[data]);

        if (frames.length) {
          // wait until there is an Opus header before instantiating
          if (!this._decoder)
            await this._instantiateDecoder(oggPage[codecFrames][0][header]);

          const { channelData, samplesDecoded, errors } =
            await this._decoder.decodeFrames(frames);

          this._totalSamplesDecoded += samplesDecoded;

          if (oggPage[isLastPage]) {
            // in cases where BigInt isn't supported, don't do any absoluteGranulePosition logic (i.e. old iOS versions)
            if (oggPage[absoluteGranulePosition] !== undefined) {
              const totalDecodedSamples_48000 =
                (this._totalSamplesDecoded / this._sampleRate) * 48000;

              // trim any extra samples that are decoded beyond the absoluteGranulePosition, relative to where we started in the stream
              const samplesToTrim = Math.round(
                ((totalDecodedSamples_48000 - oggPage[totalSamples]) / 48000) *
                  this._sampleRate,
              );

              if (samplesToTrim > 0) {
                for (let i = 0; i < channelData.length; i++) {
                  channelData[i] = channelData[i].subarray(
                    0,
                    samplesDecoded - samplesToTrim,
                  );
                }
              }

              samplesThisDecode -= samplesToTrim;
            }
            // reached the end of an ogg stream, reset the decoder
            this._init();
          }

          allErrors.push(...errors);
          allChannelData.push(channelData);
          samplesThisDecode += samplesDecoded;
        }
      }

      return [
        allErrors,
        allChannelData,
        this._channels,
        samplesThisDecode,
        this._sampleRate,
        16,
      ];
    }

    _parse(oggOpusData) {
      return [...this._codecParser.parseChunk(oggOpusData)];
    }

    _flush() {
      return [...this._codecParser.flush()];
    }

    async decode(oggOpusData) {
      const decoded = await this._decode(this._parse(oggOpusData));

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(...decoded);
    }

    async decodeFile(oggOpusData) {
      const decoded = await this._decode([
        ...this._parse(oggOpusData),
        ...this._flush(),
      ]);
      this._init();

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(...decoded);
    }

    async flush() {
      const decoded = await this._decode(this._flush());
      this._init();

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(...decoded);
    }
  }

  class OggOpusDecoderWebWorker extends OggOpusDecoder {
    constructor(options) {
      super(options);

      this._decoderClass = OpusDecoderWebWorker;
    }

    async free() {
      super.free();
    }
  }

  assignNames(OggOpusDecoder, "OggOpusDecoder");
  assignNames(OggOpusDecoderWebWorker, "OggOpusDecoderWebWorker");

  exports.OggOpusDecoder = OggOpusDecoder;
  exports.OggOpusDecoderWebWorker = OggOpusDecoderWebWorker;

}));
