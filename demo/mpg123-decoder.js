(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01d9cc1a928bfïÛúí8ñõp;ºñnnÆ\E²þqõqû LiøÝWfý±¹_³qI£B1åøavÍ^±[g·OKr.å"u0õ!þbM&²EéV×$:_Ü®ÿBåÁßvISòþ«}§¾fSÔoÍ=}wJ¹áHºWh6Ò	¬öPØåcÜ:íß¸XV÷µÖ!#ùI¶Ö_IP°ó]s¡ LóøZN<WµPj]-= ¢=}&ldj!Î=MúJ)^"d¸ê3U®F:Ù s+= Æ Æí{â,Zþ7ù÷;­ë²4îþ!iê ÉE[c};2züo¦ßuÆ2¤ÃQm¡Ø7Ôz´¼y{EýÞoþ9Þ:.c"bN_Å¼ÐüR·v¶,ß= ºo§±·@KCSÓ[rr$ÿÀZ ¿wQ¿^0·QÀ\(Ñ¿= <'¹iü[ ÔfL.,«{ÏÖ;î¹Fý2ÞGÇÇQ»²¦Ä7ó¿¨¢{6%ñghr~þ@QvÅÊ÷\H¡ ?#grrprrLØ8þN=}ø\(6÷îÐ0bIÎ»!ùÃC¼ã»ÓPW}4(4¦$Ò,Á@mô£>PnªWÆ²>+7øfÀÿ8¯Wë¼®çóÌ)O¯«WÔ#ÐmÒKí'ñ±´HøÉ$¼oÇ¿4ï5èÖ&?:þêP!ù>Ëò4"´'Â­>õÞ{7ÚN³¦aÎü¿Þ#~;«¸ó¢«geÈ®,ýÉ°^¸Í#çßJ¾ºHBþøì,Ïð¦oÀ¦erZ­¦Ät×«þ)-2MÕÒ¾¼9tÄÒj¾¬äu~²+ìWC~AåÅ5F'DP';Þå3}ph	\O/µïÞ?dÛ6ZêÞ;L&þSdz®·æb>AX³ÌoÛ&>E]ðt\;zÃ7G¡ú?X ®ôcç«jªC<ÊxçÆbØ,®_Õt>ËÑ£ÖÇ?*Ê¼vÂMËcý°±(øîÂ2GkKêÀnÕ%à!vC).ôÞ.+j3à´Ck?Käj¯Ñ31(7ó ëa_v¿}úso±ð> ñH¢3w¢çòxÈ\í­°T;}=}Dï(ì fG$}­çÐ_ÓÏM:ûÜ\#°ðõÑºS§»Â«iÿS¹)	ê¿¯ªo.ÅVM°+nS4FhuròQ@hÈîÌÖåÆwZàòsí·öu(ÞßP<îUà´P¢¬$Ï)¯zöBY4KÉÆï¦GªYÍj·o7\ßèA [3·^ÀÓHsÇ»0º+a<±óî)æ¦r7¨2ìÜpmÁ)
;*¢Ãóhô|,Sã3×v,áçN¦Qf¦|'_¶QL4yææÆ{kªýF_èbnÏ0Vkríª¦ÕõÁÌº ÄÎK$»CWÿ¹ð$nôïõ^bñâ.+ÂG7Äº-^dÚ¨éë;å9Ñ«¶¨ÏÒ1q{%^ÿåoµ½8ZYqc]É¸í<ÔF&ë]&ÝÒÍê=d{ñJØÏ4Á':ÛÁÈo±×h¸äL\ñóãvï(jÖXb×#ô,36q;ÞÆ··´w{NOèËw@~Kh äWÛÇ$#¬àÄíÏC|ãp	AN1(Õ»zýå&¿)­c£mâ'ÑmJMc²]/´^[i±P©Ü[ãí>#22þg	ò=}æj;ºämÝz¨_ÿlÍ)\}èrâÌçËò{ô¿wgX ö1ÐvEWó½^Ö_ÖóÖ|¹ s((^ÎÇ÷×Ó®}&= ×HàößëöM\|ÿ¾ÕX&O2ä·Ð°S1¼=MVg¯$
Ì4ý$¯ß=}? _Ýx7Ú1"ÝãÅín¶&@ÿ×{39àrOX¿]ÐÇAàqõgý±iÔº5CJD÷²EßtV) d;= *	õ3dR.ÁkN©{2¯Ý¥.)¶{¹Äçt4}®|N"Y|¹@4ub^ê¤ÿÝìK½âÈÕËé Z"Û*w+åßò81ðrÆ·ß,<kyD]áYÆQìì¦ç2üæÖu­¸ôÁAÍ¶±~<þ|¢(ÛÃ©VôeeLó T'úÝ1{=}mgÉ¦$2ä*|,¤/AÓ¨bìv´Ú"aþØòýJíª4-G\ú;b/\îÎ¢õï¶ù{J"CCCCÏ
§\nµ+º#IyÅ[|
!K;Ù+rÀÀ§¢{
âl®qCpê<aÆEo(~[Ûí?­=}}âØ]ÇÎÚ» 
OfÖË:ÊÒR@+È½ÎmG57þæ#baÁØµòmÜ~Âéê~öÑí=}2U(2«DqÑð¼Á.½¿§¹yz	I´§AñqB"èúïÅØþNõd~Ì}~Ãù;½4_T:%j)¤ÏªË¦Õ¥ÉLý=}7õÅZm9½ú÷E±èiÝU0Y\ïX ²4î	LJæ@Ë5g]úÓ51×{
O÷%¡Õ¬¼ôñÚU½)Ë¶PýõåÍêýLV³ôõ¤nIðg]P¬òS á/ ádPµÚ|pá%·é?Á	JIÁ.wsòI<çw¦Ù³u+¯mN»mWWÿß,C1ªÚÂ\¼VÎ;SC°T^úQ=M]27ìBì{T¶µÞµúw/%Ym«ÝÝºU­ÈAÃéEå¯g:MåZdZÅïþ?ì7öZoi4ù¬ÖQUHº%æ,8¤=u¾Z¾vFZ!XÑãÄDÕøä\.­¦ësnF}4mllØx¢.\ç¢®Í°dYlX>Åz{whòÿnÓ?	¥½4ûç½º{Kÿ*²Æ«aç©\
°ûÍ©+:f[¸%àEPÚ'ixíåÐñoñTåÜô¦ºÉ~Øîß0¬¹Ë¥yôZÝ\òjWö
ªè+K>dÌµ:XËüÛ= ¼IÑ
W\øòn|,öËJ-9å»;áÚ×?'p2ØÄ9Ã=MÀa+hz÷÷dýnýVÚYã¹)Þm	Æ[ôþ/f = vÿïµO\þ<=}½'L>TTÕ·íçÃ<CÐÀøÂ®73]ÎáÂ|¼z¸)=MF+[l,d¶yóþ¼nþ¼ÏûdÜ¥2}ÿ#ÃzSè!UIöû­ÔÌ1E
(Ûq¦Nqº=}vaïd3ù¹Þ%ÛJÃ± Â;£üó=M¨ç¬Þõ~È··&Õ¼¿«Wd¬Ô@úòxË[ÃP2\lª~ä"Ôõ|1î ó[!M¢]Å6>²vÜaïw_@q9¼¶·ëZëm
UtêóÞPøíð2Töd{	íD{ûµüæÄãAcßçæá!	þ* q+×j»2g-\dðeò5·&IÜN®m+>ý+¨w¨g­®,¿Ã!6>h­¦,¿¿!¶>Gh­ZLù+sëfå¥jz9Ç¢êJátS­TÉ	ÜãML½ÚÍQPM=}³1 ãøØh@)=}jNZ/´åÊøà2\¶00{W~NÔÓ?Óÿf±þ¿u8«
LúBØÐ¸Ð ;×ö²ø;Î7*m&©LÆØEÌöçù8ØFØé®bôç§Vp
!1li³¡ÿó¹é-ÇüLºYÆü¬ô²nÁ»øæ£8GÖªZn0Ø^®ê0oï=MÑ×FÔP{\Ó[Îjÿ{HcÜÕQÎ=Mzq;+E@,Í7 ¨Õòã±³«»9aPg|¬%L­:£È­$ìhîÕ½óW%­qVÀ4¸ÍjpOÉR¨õXÌ|ðÀEÿÓ9ÄÞ¢DÇÌ½=M2§XG¼ìpÖ¤^ çÉTÐÍ¨ òA­Õñª©!²¦ÕÃ ØÁzËwÖ×D{~#\gxÕ±¤8nÆÖ±ÔX½è¿§uÒOÃÓé_A»Æ=Mµ¢édW~ØÇ\ÁKÆµÖ6p­= Ä£d¯K= pÅ6§Ìº$ÃBüÞÀ+Ü[ur¾ ;!HW2ÙqGW²&2-Õe\úÈï|ºÉ}«b(b©ý|Yðw3;%=M~ °LIÌ¼ãKÌfmtIåêä¦{¿p&y^MÉ½wGAÆoA£lépËc¾'·ÛñÌ$ê³üUÞY-ivªy´zþÏC)FAÂá1ºÃgØSBô¶fpÌñÆzçªÓßN.Uþy¿~?z=}Ù?±Äs#ÖÚ§6ê7SÎ«<;ï÷ Á92Æ] å×ì0IPzÂ'oIý¨I#¯¨*°¨ËQ©ÎT®O9µ£¹¸Ö¾­^»}ØJYú1GÐ46QÖàF=MêçA2Ê[ÅªÁÕT	pbëÏ{6Û7$SÙ·¬Int85Ï¨ÂWùz²£#Q»ô(= 5ÌE¹+4QHI´xJ%U2¨NdbyUò¸*8µþ¦SG¼=}yõ·Ê¢ªÂðñÖÈäÁ[¢ æA¶ÈÌÈâöºGÚáÛùq´éM× ÄByFPñi>ÑâÖD½sÕäÉ^a'·ØÏhÐÀ¤òç×ÊF8ÖÎÈTPyÒlxÏe¸tÔºÂæ4ÍuÖÈÉb6_wÈÔb´(wÒÂñ§ãÎVqÕ²MeLLL hö&0N5:9ëKH[ [=Moðº÷TÌ²Ù]'Ó¨5bâ"=M²etCÕ±¤Úp8c,"¢áRh³©Þúv×wªoß=M1e.Ý=MÃó,üWåmM\«Y?ÙãK*¡Ñ_êHû«Ïÿ5Ã¥âwÑ#A&ûÌn©,2z6Ü&¿ô»ñ,'&ïgë	+zo,ñ®ç|n&¿T}Ì[ú=M36AEã°¬¤§fýØF ýqÐ½ä9$Ç+ìÔ&ïERv¿íkq*:eÇ³ÏLU ýMÁ;#ÁûÝ0¿ª-â4©ñ	«Äa61êmÁë^é£p´yæ&ÿÚ§iáËÿHU@BÝùØ^¹~=M4³óyjòÃf#YÌ~FQ oQîêåmëª])òüg)p)eòöMia<Ü*çàø+JLÜ	¹®:+äÕõ7éþ1'Û¶Ñø7!XzHÓ0¢;$üß{w??ÁA«ÅP§Å¦¥¥¥¥ÅnËVd=Møqr£õC-z4Üs<}¾á~É­+'¤¾r¯±°>rã%òD¯ÜvcoB~rèí-®}ú,¦óÝ³~oÿfq¯M.ÅwE^:n³3c­:Ã3,æ=M$ì3k­<Ã4l.J¡=}_þñN½q½=}¦G:=MqÃ¯ý~¨úh,7¿¯õúùhÛ÷²Ïyal2yeús%Þ:¯%ä9]àD_÷M	-ê?&,ÞNj¯í|Èw'CbÁ©%x^?Ó=MªTzrf·ã¦5Í3A¿|ÔwÊ&S=MÁ~	3YÜrÁðìlõz_ XÝ¯gBj^}5Í(ùvqoqo
gWáyñ¬ñBÍS¡Ôì;3êiNª<Ú%£%D%\ÁØým*9aÒÃAq³$çK9ª\1Pi ^úwÂKç;ßò(K%^{¯Ð­d¤Ù"ågß#é<pÐ>>¹²@¬£K×6AÒüRifªN
®õ*ïB8Íê:ÜÒ|Åo)?í=}oO-*òecÁÕ@qcSÄ"=MèÜë
mí]e|ekzh­òòQÈ²å1Mû^ mK­ç=}ªðkN­@
t ôÄ1I¢*Ú ÏKá¡ü7"dÌMÖÖ»·96ø{ú«Ô[T¹\}q+1ª2ßrlùþEëSKü6Çy¢ÎV= ¨ëªµJÂh=MÎ!C¸ºN¨¯nî:)l¸ß®	dÕ¯2Å¬%æ¶$õ:¹Bû»+³*3"®4.®Ü¨´//[ã2 ¥y]udÎÒÔObrn0 bûH2!ªí®þúÜ¨@/2òß6ÍNRóÞ-çKW!vh±ÀUua¥Öäqö0N g¯·.N'v,ÀM0ý­ÅÝ¡S9õ´ñà]¢ßÌ_R¾v:'òéÓÌÖüÞr¨r%õ&óºTÆÀ;E¼ÿ	¥eËÊ9÷§´Ì^¢.ÿ%¹¸HÆ,®ëR#8x³¨°7ÔÏ3D üiì"Ù/i;±.áôP¯¦Â´ýÊÌæúøÞ½öî½0c óZõê#Ý[\:éoÄ$iÑÇþH¹Uù86·üw9ÝKFó§yòMÙ(}øY,ÁHHxmzõ¹×½<)ÉTØsÛ°çYSFgüÇª å Xªù³²E®xþ5 jS¹¥õÐ'ÌÔý5VZuò«µ¨ôÒÍ¾ND	|ôSH:jÆ5ñ ÑB ï±)Xßõ0")ÓRF ÇU U)ß-T¢¥¤¸@DÐ´+8å%^öEå[5½ØYÂímÔ³W4¯¹=}ØJÿàÁ¥ZVÔ«¸A¤ÒýòÈÓÚx³ë®á&çvûâÑ7üI\Éaj]¡º1c6?×§)ñÇUµ?eÇT÷]Z}(¸:ÿ%gÙj(öXÕq"®NÅJ,÷¹¶:@\ûèÉ1%zéðÊÑîÜÅht[Á2­ÌL?YÔòüpgjKºUÅð&Xö¯§Ùi/ôÐ/Ï'ë!:= D_îôØo %êÊ¹ï¶Ô'µÜ]k!¼Él©÷Vuòw¥7÷w_0<wé [wéä¯³úl=}­×Êö¿}ªÌ°¬hÌMÁ_-õñ²öé0W.ûEÍ9Ú¡Ðÿ*7Ù®QÁ$Å:·ÙË^':kÛWáÅò*»Åz¤,î;ð|a«½ ÖQv= é{m2j'"a´eZá¼ûõ¾«¼?Y¹yr.´NCj°ä¨î?ÚÅ²Eo*²õS/ôN¶bÛhV·å¾ÆëáÄexHc!?u2ß´ù1Õ@Þ¡.@Ï&«õßO"êÄqÊ¼B<¹Á+lg'D~êoUÆÞBioäÂÈg´õ2= <lbwXr6ÕùØ«T&òÆå8Qýà{= %Z «ÑçÒ§K!Ô©öqÀ@¾í¥Ëe}èaµmR³ëÐe¨¸SÝÊI»ÄmÉÝ¬àIË!¿d=}aJÔ«XvÑ{ë~5üP_Ìá"ðËb|cv èo¥ÌøÍâ6t@HPö= ÷bf]Ý°B=}B ;	ÓëQu»#5¤ÙÓÚ<+=M]
ï	:ÕU¤¼}Üù¢ø=}5ä¬lh z/Óhò:±z »'+ËlFa9xõPmÚsÁ
J´Å&áoj*EÐý=M3]¢f|J¡ÿw\¾ýß¥Ýs6î®¸ÞÓyæç¹ú6?¼«Sx^(K!ºZÑô@þ©L¹Ôò*üåU¥úÒ8/¨$
ÂT{è¤ R¶ÅñíquRÔû¼RÑ¾Ï¯ ²£Nà®ÚBC+?c² Þä©&¢|Zpümª:áÈt÷
v	ÚÀÓ~KÐ{qúÇ	£4ÂÜg¤ÉìÇóàD/lµè½¤AÐ¡IÎu)µØç<ð£xKÍèÑ£Qiø·Hy²w7¦_»ß?(:ûÇ¸¼Ñÿ|Ùz¦ÿÞ,bP5º±iß®B÷+çkí|õïò$U¤Tøæß±>ÎtaT­X=}ÔÈËÊñ.óËWæRÀ,µâhJdê»íÀ= CupÏá±ú«»*øó;F}^Ï	Ã"§Å(Ó?W½PÜÿ á¬K¿úîÛµkß¾@w=Mdí »UíjÉ±ZíÍý[ Þ<ä#5ê	Üã	ä(t1÷0¾8£û1Äy~jS±4£<ûµi ñ!ÓùÔÍT¾óýf¡øm@]9k2XIbjg X!I4°ÚËF°Ú'cQkÄ?ê½Æìj
20ÅÚÒ·Øúi
òòX8IÛQ0'×=}êÜU4%ZÝÈÈåÚ·^I_I]Å[R°lÙ]¥·K!;-rÑ¥a$}É4eGjÖd1ß5Tr^úmÖ=}'vÂÄ/øü³^g§ú2¬]uìÖÏÀsÙörªÀÊe¤!¸D×æHâÙéè¸jåÙöJÕÙ9V§÷=}|å+GÝW#Ã®>¢±XtÿëÕ)VùÖ}
úo5ÉXä'ÍT2¸©x= YYTa¿ ý#_bù×/·ìGË	=} ñybÀ	N²,]V%dµöú"Þ"y.GèP´'ÈÛÏ¹	¾Â¥¹=}òÄ¥¹Õ#òSt¿Øä27ãàºõ»åI\ë+÷ÜÍIGaªPÛìQHiM&8¥´Ø)¾c<¡¡~ûK ú÷Âr»#ahpâø¤ÅyÙ	#CðQ3sò4­ç,áê0ÿs^@äï= kr!¼>x%Ôý§dItëÅ,-¤rzÅlê² 4xþÔí¡­[Y[äïô/àýIìg.ñÎNåDnÉ¤·ùÞA©ëmÄGÀSN*,Û=M¤õcíß {Kß>7]ýºBè@»QÈÉ·ØdÉÃtøÖÍ(GÔ·7¶98Êc£ÎbµC@ ¡f¹x1í¨h×¡øT¦ 'ïª$~¹áªÍÒØS½ ÌñëI-6)ocÊÊú#})jyóvïdLïÙÉ¡2	¹Ä[Øñïsê´íªóKºæÒÉè#UòA½,±ç0Ï¨V%{ìz¿¢A!Ù)0§9ß¢J´lnH¶Ä3ûÝ2÷Ti5YGò)[h>É ¾kö£XØÙ²ÏO¼±±/¡RÊZíÁ¡ô$S\N~«ú¼«pËâ°êZÞ'#K6ùjEê¼ó/ÉY*¹¿	É¾äÒÀU¡â@ªálë#Ù´má3+¥P¾ udjÝ¾þi§66G@+é2 x@ðw0 éïj´Ù]&6k{º"Ò-9vàOÚÖüV¬¤¾·JÈ]fÌê/âç½dÌÍåÝ­\¿caÃU^")mÆ«Å{¯FÊWÈM$ §4ç¯¹±ÜøK¡ØäGãdäJû¦ÿ5gÁ¢|ú6¨GK¹LrÝdTEùÙ³GÎ´ªÆ«Ëú0¿ÆBªìkÎ£RÉÆª HÆúð\tåVg½¬þøËB°Î?uQ¿Õ~#ö¢®èÙúÍÑDIÆA,ÝòuwsÏ6Xüh~G=M5Û÷y§ã1pÈªÄá=MZÒnÇeèiðK6zcA1¯ìôbÏõ4ÇN[9$t¿ö"¤J«Ê23¡«Ë2©püVò6yÃ4¾(.
@´dÑZ@®Ä"Â¥s
CmK
¯§úâ²Á¶ÊMJOW@V§×Ü 	
Ë2!n\_¥ÿNÑ*µ]	0MI8ûl7£{}ñ¥	¾r¬@ò 6VE_JÂÇ?%ã&ï¦Níÿ';Zìóìbóá;.5çu.ñÎÝ kMoMÏV-0Ùµ¿F5cg¢¢mmæa«éø~%0¯ÁôÃÙ&eã§CëlæsíËÐÈÇ:(ßè@+£¸$Æ1ÿ.®:"°MN¹[D-1ËÇ±Þñ¸äÂ8*9Ô6Ñ/¿zû£O®pwÀ= ¨ªP9RV3uÛ=}q ',bil¾ñHUÍ,ánù}¾+vFµ8U¬o%Ûÿi@g,cÏFk¥O
(IuÞ¢ç;á^h	t KHbf$Ç¡û¸ðËL QÎËôø!¦áåª¥îû=M÷ Ú9MÖÊò©Ò	 ^0JX¿tiÏî1R¥ÀµfúR²ïál<±}f%¤'½FÉv'XÃ³(ÉÓÎÏXÏLhwúJ8Õ¨PÈÆ×ÏpýÇªXE¨Ç.X_EÂ PÓ_!ð³Ëm[Pjàè£@÷*øGAã¶åÞ=}]×$ZaÏ®ÌhÖg­½àPÕñÁr	µþ%pø2ÓJÂµëÑOÂñ(ø
Ù¶x{ÉG;ÊZèíì¾òß­¿ÒeF~õ6Ôº{LPÒµRåØöiÄ¸jfÈvpÀ¹ü [#«"zò[Ä½&X%[uø= -·ÝÈâP\Éj©2µ{EÔ¡bTÖí0À¶êûË9öYíÄù¥Ìï7£ùU(Úïl:h·ál®$Võô¼£jð=Mùµ|UhÂã²FKç¡£ùvb¿®¡ïy±+ÓofïáQö
7ZçØbpÛÀ!>Å,Ê$H=M® g/>½3ÒFò#¿Ç§;Ø$0c^³û$j=MÆ¼¤¾
y=}qhz@41U?ã]t] ¢òïÁ«,ÄûÔ!! Tg7Öñ= !Ê£=}
-9Ù\%ÙÐöã×ÿ[H-êäÂ<®Þ=M¢½Þ¶÷5Ë¸3Mr¼rÄØ)s 0ÓÉ9^EHN.¹
iå©æ4qµN1CÅ:aaõÛöy;®z¡úg{G¾-d$¯ô¯'Cö|9ªgyZ&³p#
jÑ)þ
?UÅ"d¾¶ÈÙ65e3×î3×)*Ê|×.ú9a¾ÿÄN^¿ÞÙ3$4vÜ{ß6$¡i¦ð^S= fÊbÆc£÷> ìî¦0¾*Z¢A	âv)\Å¸_ÿoF0ÒÔ8©4. ×´ùÍ¸Aiàí¤>¯ô?ÆHè=}OÚE{ÇôV¾gHÙu
}^ðQÙóÉ£åêOÌ¾xd*p÷'IPïmNÉáÂïbÞý¹g	¹3Yº<¿C|ånzô÷£Å¹cqÍå1º3®÷ü|å×3=MùY@Ê$¡ÔÕk)ÒþºÑþaad8ëfË$[ÒþùDç°W"½îö3ÿÖ|±MïYÈ"ûáø1â_W5¼îºåîº³ýô=MyC Pd!2íµ²{öðè-ú¥Ê©ô3§ù1?=}Ad(+Ú¢æ')äEÄ{´îÑ+¯¬²çÂE^§Ï¸ï~Lö«²ãvêHê8ª2©HÉ~E\>n§¯¬²7é8cSNNy@¡³Ë³
üÁÓæ_ö¬ò(÷^YhÙÖw]!ÐP>¶2þj00#ûT×ÑÅ2Po,ËÖßµèo
7Çâ"»³9/ÔT=}°O68µ¢9®;è=}M<mR*Ó^52móêeh§ë~pµV,Âö2z(:wá.êS7dx°*Àí(e¹XÜW);üs´¼ÍZJô%<L³w>*ÄÅR¦äÎoôì#<ÖêÔ×ÒÍÎTX0<z
z×KÆÖnÜÕ¬ó)è°!þù¨<1a*3³KÔÙò=M¤Õ&ìÀÛ¸ø]JØ«È;+Á*/YoÅãÏ]'3ÅÕÄ·1Þ)´ÜCìéh«>¿:vRð¸l/é
ÒèÄDZÄçÐ9]1Û+^Ý.{Kª¸áÖ¡X¥ç IÇ= _¹vUÜ 
sý³2x½eòù¿cµåW£	ÀÀ<§£RrÌB,¾5«u(-(xvÌ=}À|N§#j.Çl¥¬õE..yÂ~?öÛ?­dÁ«ß£ÓâZMÉùä¬Vî¿qoÄ=}ç¤¹ÛÐÂqy)%l1¾ÊU¬§Ôcq¨YZ~ª1jFvÞòQÔÉOúåj½ð ÛõÜ#W{êÃ_l= v±?3þ·§¢q$þ,õm4N	x_ñ?î=MNYB0¦íRÀU	= Y>O1]|G#i÷ì¢Êí,Llkà[U\N=M¨]ÕF2³W[Äñs*;çï9yp­¼GßÝkQ¶3Pj3H3d¥;åÄf!=}j¢fï_;Ý½ñX.GæX®{í£ûÝ¯þ	Õo¸T$³øf¦ð%=}yºd²cH):9ºé%LàØÏ´¸âQú1ú½4åúFü}ë«èîÖú}ùrèd)Û­­ûH1c¯÷Qù#By£uFºÈÊÎ¿Àð72¨= cQ\éñ]¹
È/ï__!ÞR×©|Èw{tfºã\è($®?ç_GÓKËëmÓ7+§òÆåN	ªö¬¶.^³gð"7£ám?åM¬ÿ7§)ómÍm=}|$ç(Á)(ê6«g³UvÀÅ­Z(víïd­ák:k°© ÄÂÊÃ=M&ÇU÷~µ|8?ÃÍù²éßÞ½/ø~M~Xkç|ÛF%LÈÀfpÛÍúºÂ íç]À­ÊWÊÝ|wÑu#é+M µaZTê×AVj¿wÐ#Ñ[_xõÊÌðÛ ÷)3mé¢Ôdqéï«¸2,ÙÂD~± ý½å
«¡Qº/:.(ûÛ
 naÒ3	Ê­¼'RÞEþê0Ù\g#µ,TíìicZ9¨ÀU¬B{LQ$	qÙÚ+
(s¤rg$l¸cöÁEOI2 ÙùÔç:ÐÍ¾ü£Zk¾G@y¨ÄÆ*n6çBIceäã3]u'Úx°"ÜÉWlD¬6¹¡gqàÙ^TÔD: º¿Sþ4"BÔnð¥ü­mï!¥¨Âh¡JåÌÕ¹µSôàIó  = 0FñðºÛ1 ¹{µælô5fð?þ~Í#¥8xXVx0ÍFu_ga â%¢^îõ[jd#a ¢B+Ã^Ýh;ÐEq6û÷Z3UÒ£9En%Ýùf= 0¢à<ßEÅÎ³Òïó|KÁVUpº5ûb^¦òìCÙs¥áí¤IYÌúOSv	.ýÿ³]%Ù'§¤°ÿÆ=M--Zµ.ãN³Á+ëâ´Aî»z5ÚORÒù8üxßR/6üÉç^£T¾Ó£-X´NVä¸ùÈTkÍcï3$ôÛ³:QV3B	8³2U¶){ßÉ »»ë¹§éG:\¡[ªxdµoÄ¦îÝcrÄÓb{vùoÎý..¦éqõ0±ëq{lxÀÚ8G±æ0ò{gA¿¼~¢ +IÇý8­³[Ã)0åbyï=}±º\ýÔ¨×'Ý2IàK+ee>Mø/;mÃÌ0$RrênûrâØbö½	c@»rË?¶¤Á6fÉWäÐ¯ö- mýÍøÎ»@7ë^Îsi
Í4Æ®íø]ãmÛA{{¹ñ¸oZôtìÁBîy¤¨¡kUV
_z«JFòÈ]Ì^ÚPÅ[Ö&6=M^F=M¡SÔósO§B÷aZÃ»3å~ÑÓMUVý#+®þjéLÏä]Ñùâª zXô(nÄ~Ôr;s.×&	0Ç¸NDnw.7P)×ÃÈ*qÙÀ%9Pð_wzA¹ßh°1ýñ~hT]Gõîm:ßÚC¬OFE_3§?Ý«Y©È[e&T^[ìÆXSé= ©Õ>!¤èµH=}(v¾ö<²Ø^*Ì®U¶^=}ÀúZh#§#¹ìµ1÷&ÔX<¬¼Âïç¬?Sã+/Ò¼kv'$sÙ|ÒÐ[6Ö'H#âgÊ¹­d²&oz	^b;Z+EG$~&ýèFS?¨)/1,Ò7?[·Ã£üc¹.¦%¬¦%['rÒè{=MÑ},p¨á+i¤é°;6>c®¦Àz§ÒxlÐºS­8LÕfR0;9vÄ;%<{ýuôÔúãiòûÝ(ËÙ	¡$thÐcô RÑÆ¿Ò]Y¸º5.¢	{4âUh-ã¶¡¾TY-l÷/óÆôçl¦ óM[¾àÈanr @,ÂÄ5oÙ§"å{ÌÖJ¸ÂuÝ¦KwÄ©èói¾é=MS­ûHý[n°Á~³ù[Ìè#ÁEª¬òv¦°@äl]3ÐßmÔ)÷(á£
8ßÖ70ãnÝY/rN±mç¬r$Jëà=Mê
X&¹[x¥)Y#q½ë_~= ìdÄ>í%S¼g= ¤¿¹c"éíe>ÿYIÇèá}ÅBº^6d0Ñ»p( |òçäûª»=}&zû\¬/MçØ"êÉµq)®$_¦¯ú#+h¦+³qÙSó(%¢± Í«ßºmù0ÞppùÁsà»[xµïÄðA¤¯·âÂY~º·ùKnñ'ZîÍèÚ¿	"«}×$*èÄxe½Çt£ùnó9t	S0õé."µQêâ*/CuÖåpiÖÓuúÎÜÆ¡_í Û¦éù9¤Yb}³%e:'³¸ä²£fÚÂJAÚÎª'KyÄ¤NCÙS:M¥:ÏUîaöãAX¿pW¼(Üê¥ð9;Gg³TäDq.ö@¼Kú®«v"È M~ØkzòývG«M³ÆMî³ÎcHö£]¯Ñ#*
éñÎVÀg³ïuÃ|*Î®8»ìñº~!é}¿­wìÍÐ´ÈÛsDi7ízº/]°íµUõ2éòj ²?ËWJFNÁFÌnÎÞDôß&p[h81Ò~?.Æäó+G-½7JrÅ.k5Å¨}%RÏ¾´LÉ¯ßMWÂ®bÎ¥Ï4÷¢
³«,­ª>tÛv¹¨öPÞ1êMê:÷sã&@QM+øÄ,Ä§Ä3¦§$2sßu|×qiÈq= gûÿöÞ½ihÃjAùÃ,ø«a[³%Û»)å_ûþÈ×-øÚBS©±L¡M%¼@ÖÇgÂ²= O= óßJR¤ªêmÿÏdºjXÛþ]åfÊ<à<1ô^êù±ÛHÈàePµSà%XûjÍå¶4Ç[¸#¥ÖW»_qD[Æ¿ñÚâQÿ³è¨x
DÇ"u¸WV½¨¨4å	J1v#Ï9I-i¹»ÅiãNêÿ¿Ù©^¢,ÑëÓÙ3ÚökØÍÌÈ×µHØ¯xX©'dÉíy³ì;hÌòSî	¥{íL1¦æ@B7Jün ¥|C¯¦f=M«m
ß¨.D5Jfµ·µeÄ´{í^cû­ü/S5 è¡f_ýZmþ{-âí5àßà½­ð8?>ØÏ=M]e\V !SÙs*Qr'åuÞ5#eYRo ¬È9Ò8näoØL¸âZ]Ëæ§£1Ö§ö8ÍHtZoW^´oü?¬³åe¾?Ü6=}-£õéèÈ$à£¿­Óó¯Ðf3¸CV¸QÄÔnÆV´	HJ´ÔOÎ+IwÓòHk¢9«pêÛ®?pv0]ÿþµúµA1QûÎz¶¢²ÏinW=}¥ÿäºú³6@Y1ý},¤þã½"çböCê5ýe7ê:+L¸qO<ñDËLD¸ï æQ¢xe©íïøÃ¾~(/~2s$<ûö!ËÏ¸$R÷£øù2'ì=MÙSÑÝvrU0©/mó.Â[A~^=M#ÅyuíóÓt>)¤ôÉk¡@ðb@x¦ÀD¸.²Ôã ñù»îIEZµû×T}jÆ2ú« Ô+»4ÿUÃâjíz³÷æcýÊêèþ«KkY*éj.êéwÛ¢5O1Î(xaX3ÖÉ òæ6h©y_·¬dP¬8ÀËM.ÝvaÌ)5Æjãï/!VæTäa=M&{BS!s~2zª<Â
ÓÇ¸2,/h<ë¶ÐB"ÿ-è®Åò2T	üVñ6}ýÙ=}Z}?U.6á9úY²Z¢îð'æ²¹VAÑÈ©í	Ñ+	»c£TôÈïSÎ7s²TæAöO}A«b§öÑÒú¿6CDil1,QG­o>ë®{G«1|"-5Æª!|ëbcC-*ôþ{·*/|?ý£/*È©|*0!m{~öe= z·Ìx÷ÛX!rZRf¿Và*¬ª ÆÐ¡A­~¬ «0|Svh³Ä*4!ìøÎ=MCÂ|çïëòÇËíQ|é¯ÕöÕðh'¥Àx|§r5Ó¸RÓ¡àÆ:ää´DßnÇ¦Â 'í*sÀ= ö46qÈüì_Ñõ¾±óã]Áå_ßm|= RËûNIVXQA,~-§RfqJ:Þ=}ÚH)d¨ &2Ú7nÆ÷¶ÊÓú%ûBðÚI= k¾Ð§^¨«xEz|H61§ceL_]sPúÏRm82÷ÊZ¨	Äû«vzÌ]-A¸æ,Í@]ûôÐkTod»^XTÀ/³»±÷íXÞÛ¥§zº ùÅ þÛ|7Råè}àañ8ìÓ 0ÏÃÆ{GÏ²¢[ì²´_­GRgÉàïôz×Y9¸­ Fj¦§±çúÖ!ö-®¶hRëHäRÊ9J«õp¥Y0	\s Ë^©Q» :,= ÿPQÓxhVGP)CN^òÁR4H4QD©Å²ÊÁQê¼/ÉÂðê{H¸fÔ±Wò\mÅ½·2,o¶ÒõÅsÃèf<9Vcp¦íjf£íCÐÏ4>2­sÐqÂÇÊxw![û²Ö@5KÌ¶ý= Y	Q>_ï%FÊ£©»®>Úããß¶¤[á$[pÞIäN5=MvµQ²Ì÷@]Cbj½Ihüñ/àôNî¹=M-iþ"#¶jÊ£w{¶þæ¹1AS«_¿9ýP{= wÂ{Ç4o'¨ÚU~Ð¡bµYl ¥H¤@0ÝèÔ0¬Ùoxh­ßï¥D]­´}Idó'Î+fLÑá_	ÞflãHwD/¿V·8Gð&¼xÉ?¢a6Áµ¾¤£@p@ £¿¾HY[²iÎ2®ô;=}Rvé#/áºÓí¸ô"k_Þ©ÝX:¹_mv>WÿPz£qüz Ê(jÂÌ-ï#*zs¹¹ôÞ4y_ÕÍíwÌËìWpÖô±=}è þñehAÞ5îýèM)\|8þÍÎ ?ñnRáÕ6¤¬éù*»ýhjÖý$+J» kF~pã;2éæÞ§sÛý9¶WäÑ]²$¬4es$æX	@:H¹VÕ	®*ß.FîEÛþsm×·!éWr}mK!#?áÜlË¼fOu°ÐØ#%-4ååQHìà]úÀ^bÅÛ¸ÙÉhE®í¥/î:òÇîXðBà»ò£85^nº{AocÕõA¬Mñ"úPmô4û+ûËù#êëXÐ_ÃÃªÚ¿T4É+êøiAËHÒk0IQJTà­í¶(_Qëzqï1\	®ü|âÝZã.S]içÇ\±·³©ûá9)³cSæªô­Ì9H]ñk/TcK°N¤p	¿I£Ãåõq#5Ó¿(ìOðeÕo2ý?÷©<F%e=}A¡×ªÏ!)ã± ;@ã°²eüG µd)ÊT½rxsK*wH¾çáªo.«DÆ£túPeêr®G-éº³aW©èû}½2T2éòmÔ­ð\@2@Ô¢ÚµjXh¢¯ÞMãÀ9"äË ¢#ÞáÍmN­e~!cÊéäÄä¾]	0s6^r 9ùE¯2±B[:&bèÍ5/¨à<Û-Mü)9Î;c ·wq§ÊOO*èÿ~ÄÓ²¨ËvTËBö(;#Ü= ªv®:¸z°õVlÖ4HïÊqÅAøê*Q?Ûd]j¨4?ÈT7+Æ	ê¸´daà~Î¾,»ú/ü·WÔ-WÖ7£¬²»Êb¤¨CÚ5ÂG ÁÓ&)lqï¼é~@4ã¸t¬-?ºn¢Ô@fBB?¸"É¬3L5·¢ åZôð.\^y¡>¦¸¦ hå²¦$ª~?²Z£ÍNÊ>QçG¢ÝÙAh=}èÙaJÿ±(ð0J^Ú§cët= 3Mu×TB5zõ4´@mÜþbôçÀùei¬ó3Èy	=}ò[ÄâVlnMU{$S©L5¸B{dðkQå÷;4ÄR.²Ð»Òíí¾a±l8=}²ý(åf26Ý¹·G5QeÜG+Ä&-RÞÌñåö4úï/oøOà²ô>:)r[= "~õï%ºÀL¼fcÍ±}ö·tµ,?øAKí=M³e¾ÊmM U7Ù®¨d¼^kÅùÕ½shæi¢,ûF~FAV3­¥?IGFÌHP3u¢sX¥Íþ<OJ¸{.ú¬ïG¨:AÕ¬<ØÛjÍ8ÊeöfnúAåÚA2õÝM¥ËÌ,æÞkne÷ÉGÖX¸ïä©äY-Ló;í²]w¨YÃBEò>æü¯(iØ¹ÂPXéH»®b.þÐô)2°=}0ûl¥X/swèÁ^9Q;uþ_ÎZåë$«ã®ú¨üGxi\YÐ_2s¹oH|d8×íÀ tQB.äl6Å¸ld½øÀ¿köuÀÍÿßïµåmÄÖ÷i<,	Æé¬*B
?Fí}.Pj)MìÆÜ+§Ô2g¿Y³Uv§°²fÃg-1Æ#AðJ× PxaVQÙÀµËÐ¾R5kúI>ÉêÈ§ÖtMÕ/IÏ#«ÈZµg
 ~3º¤É®Y<AâiH|ú|úÖÕ±MïÆ JsËÐØ ØÜU¶q)³oÄ ¤ÿÚ¯H5[[ãdÕÑX¼9¨u§[Ç¾ÂJÊ= ÏÓ6A.ó­@7qz®+¯5*<HãÖWC)yç¦Ë¾tm× }UrKûê^cZÑíVÝÜªºfó¼¸öïuX:ng:MÜZ=M!Ú&		*Ì;Sò+¾= 0nÄJD½ªäm§0Q¨{°ñ}â[:R«C@(}À/Å¨Éãé<è´ëäÇ@0n¯{!²øl*f÷= Ó¦j,òrÓféÁÝnßnÄÚÇS­
´z
ìoú©ØWThöºHµfêç7· ï<¶]âØ²}sèÄ²C7òßKõ2¨¨S=M'í@Û£E²%*Ë¹ÈÉs2/ÎHåZ°5@î´ýÐÑ«ôÎñy3*Gú%ôBÐ§F®/#}ÜC!8¶= }Ç4#¸NôÍ7ÙjªÙbyóöýOû= ï10ý
÷Ó>MÝ=M,h¿ï $:ÁwÌª0²êà n=MM\-ÖïE'²&óìÁ4÷÷éÃ<Ý¨è*æ¤ibö¼¢Ò84qi¾E;SêñPcÞ[e­Ë¬;i,×¾¾x/§ÕØÖ4¬ÕÊ^%½zÒ\«)¼áþ@j¾Í¤À<=}SK¿mÌgB}Ôä¤¸×[%#3W<¾4à¿µIÐYÜ@vSíoì 0gz}²ðZ@m32¸øÖ¾îÐît->¢/hí&]ü'Uæ·=}1¾ðûÍÝsGPtçdÐ9Sæ¯ø^\ó1»¡º!Íì}c-©£((:sR¨ñÙJsª¾Ï5ÿ¦w6®X>%.0Ö;Í\ ¾xX9dÅ"»GÌ{ú
ZúEd´U±ÕsÓ½µohW©Foâ¹| cp¨=}¡iv¦8+üÉ§¨RÀCN(|8N($Nx0&ßúuZ>¢ðbÈö\ºÓ=}¨&¢þYì©$}}ø »äR= ñíJ\w)î9°Ì[HïÉþîRÉáJë»2Äá7gvï4:¤²ÌsÀ"-¼Ø'{óÑ×¨@ß!Çº@)IÙÙÅU1½þý= §dÜâ'÷µÒØà·ê¹ãùÄãiÑ=}ßB"t:ÒÐ"/¶«U¿6Òú	X¤À@iÌqzÔ*hÔ¹¬8¢(§Q¨Ï8¶NÃßRÿ¼ÄëÒkí %>nøÇEá¤ÞY])· vÓ7(îo?^B)0Í~é¸NA#Ñaq?ö1Óþ¿wt?ÁÛ-¿Ín±{·¯ùäà¶¬2c^ãðS*É*	D¥}â^ºAÝfðmgÑLÐû×öÇk\àÌ$ý yX^& ÿµÛV|2¯|;òð	®^|.ÍísQ×ER¨@]/ÚcLýC¯ õãÐ÷ï¼4®ÈÐSãÒÅó$å©H~ ¨h7j£/c-·ã JËJí.-/=M ÑÒ2u¹AÉLÄ­';ÌNDs4H]t$8²GþÛ6Û¥³3ÐCpmØ©¥&Ptû(©ÈU'(õGN÷h!P Á)-Ã¢ØÃ¢ XM ×d1Õä{@=M:=}òBTB½SÉöÅÅí/$uA=M0Ý:BqÙm5:¾üAð&ùdÇf¬þ©ý»²uMÔFs¤ \6Uf;õäV]Èø¢HÕwR¾CÜ'2P"Ï3pæì´Á1¯PÔPøÿÓÂÿå\Lï½¤¹0x>ß2*X53vgÆ¹xÂ±¡ñ¬bÂäò÷NñWm?Àíânß¤",´ÿEøy»FÚýEÕFêÐÕ&cÔËvkÈÒTÍWÂÆ¬C§¦oïp¥ËZ»fu ò¥°dâAféQ5ÙË¾/±R	Ã>uBÂÎ'*p³ë%Ky IºY5= #r>4ÆDh§1=}	ðÌ;jomü÷êÒ1ÜêrbaÒwéâ®;º(½uwëZcôký©gó¢«z]1Tz&j})°es>q¨öÊUa§¤+å<uÔìc?[+Çï:,¿4= "ÚÜK3ä>H¨4XÒcg| mð@^cmFÿ]Ø\9eà0ÿnÊþtË§À[sZSÂNùfõª³±óÁ4ÆøIolÎUVt[ª²=M^ËµRAÿÈH@ÓA÷Ì¶_xÉ¼ãïtêæ@_xò®|¢8]hå:í´"G2(à¦ûùÝÅqÓôÊÌ¿úq½&âÀgU	ï·ÑÿëF2|L#²)u@.¿mÅeýè­4Îì²í×Ò/U·c£þ^«)Ü>±Qâ¤ùR0ZÁ¢ªlÞh°"¥)ØV\r&äµbôð%WÎQæoº®Þ«û33ÈÙ34½í¬ § ¶z;,òÎLÐâtvx-[­¤(©¯±7ûÌ{ÈK6¼®Ý÷*bWãPüÃñìµROÛñ·*ÝgK;18×zjÞAì¬Îi*;\ç®P÷2¡Ýç"xô9~b2$Íâ2´YUì
ãhöäÞbGBÏE\gÎÐ÷³Â}6ÇÿqÛGfu¢¯µÐÅc×ë{wú"c]Òï/ó| ÅyPâªuêµùË¸!£omScºB×wwoÅÎI<Ìð¼T«·o¯dÌ(Ù¼~
Ð¥¤T8oSYú/$]Õ>Äõ¬(ÅmnC¤G&ùÊ½þB@""du9»Çom)a¸(e&r¹
qï;tcktªàÈ§·+ÑwÊ=MS!à6PþÈúv¥\AÐª$_n÷f?¦Vê%ö;³F^Ç­=Mñì¡ö»«K3ÿþf=}q6Àó?q¹ìÇëõ~sõ r¤Ñ¾þopÑ²ÀwATÆv;*53¨8É«ë°$d3{oì@¤µ¼¿X­;ð¨ËíuQYèêE®é8ã±¥âPãDUKæ8¼¼M V4WDõÅ¾"ÒGíùT{"É1$çúN mÍÉ#6§¿ë+6vÕÄ§Iê
$º·8zC½½¡1?ÀäDSºÍ9¦Óî1GCo5w]
DØð2T¤¡öÏ;þY¬Ò§¶pyiahôü¥È9è¢Þ2BbQâ|R]L¡;^ÅHÁl¶ÝÍ¾L7"ÄDç¥cp%¼²° £Kcù):b£$ÑJ-£+¶òÞvÂ¦õ¨FS¶¡éJºü¹ûD÷W·U¯= ý÷ûG¨t¨ckf{AÔz7êïúÍé¼¤»óì:fÈv¤ßR]>èê ñVMRU3±&å6ìM¡ø}&VAS9·ª÷poösÁhyM,rAÙ9Å¡Û\ÙÓã·NÕMOêÏ+fô9*Ä=}ø¾È"×wcÆª6]Óß_F¼B<"ô$1ëÛ÷¿µ+©lÙ®ú ´(Ìv:²¨ÉÐ×Fë¸ ÷b ó½ie¦2zîTrÈ¯ò¸°wê½Öi¼ÃÞoY2Û K5+9OÃXç
4#ú$ã2+¡k¯,¡Sã2BªG¡[à¶G¼ÆÜõá³ÌÈdÑsº\ÚàS@¹; ÷1@)²¹35Ò¡ÊØN%s=}r(ÊÅ6þ¯[dò´+sÀÇ(î-°2Ä»ÃaÈËóM~6Ì9èñ9À+ Ç­&¢Àµ·kªÃ"Ô7%7gPÜÛòÿÄåËM!ÛÒMH±lÎ= ]ÖÙÚñråTÓXVk"µiÌ?ÞÂ®×ïª;^{É1Ã¿ëZtOìRN>ªúg9ÌÓn¼øôr=}= îóü®Ö<×x>dJ,?âpS§¿¯&bÈûo®w9«¾C)>Y5í¡ "0i´çã¡ÏIïF)ökdCë£þëÀGÄ´hVóÄ¤ü&Â,{ª£*$[¿¥eg^_Z ø=M¤|}æJ(DP¯Ë¿¯7¸óeOÌ?NøÙCÏápg_áðoýy:44-!më ¤®rû÷&ÎzÃ(·ÐXÍÌÀ,'Þ
Û×÷BJãB>ò GÜÇ¸­,FF®8+Ñõ½ÝË¼Î*¢gcI- ø4¼ÿ>8ì'ÊN¸¯)"5à´Çi·Ý<àäC°&çI¤æù=}Îü­Nè½¾[ÄÇp4Uá¿ëÿ#ÙògâÜoÍ»5@²¡Å9=}ÿfjÇ-ÊÌGß$[m5*:¶Sô¤À¼±ß¨öé	SFywQÔU<Àdô ]gâqâ<v<'¼Q¨WLÏS'SJf,9uáF´Ùù=MõÛ1eà¡d²QJÏÜAÎç8eäuøæJKÝXÿ;¼ ü¸¹ju0pj¯$?LÊÝB>ÑÍH×^ZÒDwl?KeA,yêç_tr¬´rL±ÏÕi¾= Uu)WqH»TÜ¾jØ¹^«ÁJ*Ü­¬÷­+-\öÌÒó~ayý5²ó6h"ÇÃ·ÅèÊ¡é»a»ú÷Îéh=M÷hû¥W;ÓÅÐÑÅdêOT].:Öë|JÛ·gßmÓ](= 6FÁD]ü?ú4øbjY E9íë|éhwY8,¾u¦zÝÕrGL¬­±síé&öäíu8£zù"4^xk@ j¹õtm)i3Ïê£îÁCF>^?¿½yq]ºMõõLÈH÷]¶ùG÷ø²¶¯TTÜÔn®ë§9NqqmQnÌíðº5À(^ôÎ-Á½-ñ8É"{µÑºû0÷uÚÌ5§àÑÖÜømHHkad! 2A>TO=MTVü²ýr·ï2#þ ø´ä ø;¸ìÝ2Zê¦Ôff¶¸LF¿Öù¨<áDó¥N,ÿÄù9ÄiYRU,×çF¶kî!&+È¹¸6×ÅP	¤ªÅÝ1ûEÙf¿;V,E÷ß^:k[!F4'³ñ«ßÚßø¦u¡@ì2Ù¾ýæ:¤A·öSFÇÎÑÝ®Ë¡uÄpG)mÈ	~² L¼ë¸+HxðºLr²Ýê½ºn©Ç$Knme?ÈÊÝpOS(b«!YÐC¾¯¶u!ñ¹ë)O¤A¹£«0HªkÏÖs×}Ä^Ý²ÝN&XµÜðzµs ÷÷DòêéÅ?¹qGÄ;újül¸îoîõ
_nÁR\ä'züL^°¬ ¿lõÏ4ÄÝBj-´CÆW6ÂW!8Ð=}m×EÈ?/pâÕ%À²µ¤ÁX»íÅ´fôX¾Ã8#ÎÞH£´ IMOFDó¨Ïf =Mmézä:6æÜÀ^	ýPÕ+7!£gePXÌÄÈRÞ
ÌòLF÷8É¾fà¾;sZÑ%ÃýÙ¹&;L QK8¾2§x,9»]ËãaV>ñU(f)Ý±mÐâ¸?º¶HïíUHMoôWÉó½;í< PùqØá6t ¨ÎãZJd1Ä]ï}½çÞ´TÅuèð4
PW µ%Å·ý²»»>pËGiÕ6£+DóÑoBÊw°Å¼Ü	ÑÊØ¢4óQ{î(I£¶a$§°¿ÂÐY"[sRÅDwµ©à3ä{Z4E3Ejðñ)óè+ÀoÈ¯Û±9ÔY&tÚþ5¡YBEOIÃuL¶n{Kr×GjÁ>Og.¿ÖH¨ijJæWµpÌBóãÚE{éÙ;eÄ\âxÝPXSnf¦1öVIV°µ{®u¢~~Æ= 5ÆR=}ÍÓáB°÷púL|?ôÐòk°ÖÃlúJâniAyìãÚVG( --=MÌâÜy4%VÝ¾ÌÒ®RÙÖOTøÃ¹HQ_[Íg9ñwcd¤8ÑOyt}EYÆãhxî4YÒÜ³:YDÒ'²	H9DWDHºâÉlº@ß.(Ë·ÁTkEÏýª
HáÕEQ&\YåJ@þkÐAÒâ	9fµH.Qïå¨¬A4õÃi¸Ò®AªT}¥½rZfæêº8Ëýº/SnñàÌAÛ¼ö= Kh?ÌFjQLkCÌFFøV¦¿D;+:êÒªW¾üy³ÛÅ*YH*fÁ'_FÒä¸YïîV¸AÁÊZçó)ÃE2¯ü>m3n°sh+þ¦Gdæôí°0¦°XÉëàpëhÆþ0¨¾{K}ÐÄµ«bJ¾äÏeaÿ=MHµ= ²ÔTS!¤'úeï±(0Ê¡Î^Ä¤MnLIÊn½ÅpÄàRûxTóÈÒñ{!öÉ_Õ©b:ÈsÔ£Eª6£Þ¨-¾xÄ»=}^y¶ÓqmùF°Ì!¨tóY¡£@=}= àc%K[ÃEE¢±üß:2)ÅçxA[úN­Vñ>n£íð= PJ¸¹^¤DHÊÊ$Ï78°tå¬®óGPTbã½jØ°EgÆ«=M&#AÚÉÇk¾Ïòæ¡"¢Aäª= ÿüõü>µL¯ÙæQ<È/ºcéná=}|IX þì¨#]ªãkKçuÊ^ ;*Ù	×ÖÚ1¾!ËB¢¡³rY@xIÂ}%3»ð!iêÈË;ÉsV«9ÿA Ü_jQòAð.[?¤­mßn§ cKb=U.Ãó(kD¨­6_­P£<Ø"¶Ks×ñü	¤nNjBÚZV5M9øY¡ÆK4ù¾ÈÚ­úg2Y uÂ=}4årº~öÒÐ}çM°|4pÒáýgØý\ëÝÞ= L"pP(mt´¬iYoSíM^Zp!í×HkWHÒ3fÞØëÏ@áTã:n«@Z æ|Þ§R¾6m*jº>ëÔZQ=}k_~#T'g+Ìm1M©¤!pú¥*SM¢9VBnïT7H´sð.k{>Eqi Ð%ÔaÄ;Ôr¨exøyìu¢×ëcJõOv-MmÛ´«MÑÿT³Ñ+±}=M"Ð²Ì=MÕÐê&dÉFXa{Óðú»dÓÙý.;
xMºl»Ï.æ×Wa­HT´¯þË=M®¿¸ajï=}ôEVÕ+ý§â¿8Ü¿çÖº­"ð/ý{CÖò4«rÏ¾_³ÿFxè»}ð=}Êq
4ÿ¾ö\óE¯(5!ÌÞ3Û[3©#ºëùàu5·®³70ÞCªºv-(J4çëH~Ï¬þn£_£,&nyUÓJØ'3î|ã'H~s)Îd©^ªvùÙ^/¼íí"1Ï,Bu¦cµüîGCÜCÌ3ÙêìðEÌ VI,©ödÎn[£&øÖ¹$jNn_Û^$ë¡YñDä¸Y|°4IÁãRû´Óz*@ít,-æS{b;$é@>.r$?ñr*íÚ*7 Dçî[_Â1Ä}/ªLä-ìä­ëK?ëÂ¡·-bH3l³çáV©	°êæÍsdêw°0X>Ûø-À<qÛþÉ#}¾¦Rû­,]£!ævyzÌðuè%)×7Ò	lò² ÿ?~£ñÞÒµölímA}@´pl¥äðÞÚÐUfZ>Ã´×xèf$6V¤}5= o§àý>eiäÔÈ¥±=M§Jv¡äö¶=MÅÎ bÂ-¸ãSì·îÎAU¢Ç\XÏ¬Ù[«ëÐØo¿"z7þàéþÈ!²RëQn\$«·©B_£Ñfô%-¤ÒE*)·$<°'¤.fåâ)¾'¤À.Q"Ü*>«±¤;øóCÁ6óóúíóSè(M·D,}éXÒñÊÿU0©°eÿ¿#µÍ­[=MnUgdYöJdç¿^X´ñ|¨³eèÔ&=M³Hýyóä@p¯ûÒõª2¬C¸»²©cØÑCj¼,Døj§5pí³ÃTM±nÚÀZTà= #êð'ðÉïÃ$¹ÓA8,×G%oS]så&i°ºF§ÖÒSæà4Ëå÷ÇT« TqÕ@Íl®LEG5(=M¨ËWF¾:´×4·!P¹1üÁåk°}Ì-n'Ûã¦ÂrçTºíd¯ÓàÌ) hæoÓ£IÏ~ùW(¯$ÊÏ5Ñ+|®fÍ¬ÄE\å°´õ?kscø6ÆS±cú±°¼«öø}ã2æøå'»³»ºàì´nk £hþL^@JÑS#s¡Ê6µ³
5jJüg= ßÁÿüÕ&Ø{ó<ßé´C5SöFZÆëâ·[EÖxOØØV¤ÏÅÔ	ÈÛòMÅ_j/µî%9VKq¤Å7OJÀI5hfhÖMF©
K?¬0ð:Ë}Ðz¢gì¾BÛ1kõàTñ8')ÂÙÜNU ynd¤zrv:#"«ï(çKü]Kä céÏ*ì]ú¾ËQ[÷Î$ó,Å=}î1]dúìÌZp_biïtø;@÷µªâ%r;µ« 5Xý³Cj©´ÆFuü'¬Å¹¬M6ãä&¬¶ÄLöû«%ÎÕªCøÿTA!­^+ãïÓY£ëÜ1HÈã^M/ó¥rì¤bñþFl#¹BøÑß«%ÂF=M¥mÜ~~z«âó¦50æn'=Mån?.86n3)IÛL¯	03=}saaÊo¯ÏÈDóN2lÎaNFEèôÃ¢ÿ%3÷ä®OÍ)Bí|~26= =Mè»bJhr>øM?AoË]Ùz_Ì]¤ø/tP¢çH=M8c9]vëFØ3NÁ'ÁÅÀ)³¬6)ìLû:jÀtªUçËHî§7;ÛbòplF(úB/;è= 3Ñ¾ÿêÕr_bÎÌ\Ë½ØáÉ1*¥,41åY<Áq=}Ð«Qíç<ºÚsÝÜH4³«­üb?(q= ¥íÇk;Y{â6ä_û[ÃY!«.¨Ü}Ôd´ìÎQú^¹ÖzYFo£÷WÙ:fpÝÍ"Û@ÒùÚÛÓÌÚÀ¸êû^AuÛhT>!/2cðfNuQ%¯·*¿ïî%Üû½]­äöì£#ïD<ÛØ}HSäÃ_¾·LMß¨}a¡¢g·RE"Ê¾O3À±»jüÈåQ¸N¤ªþS~"kÅã\¥¦?ÄÞcT.­¤½z)ªK
wÝx¼àÅç^vv+Åù(Ã´ýh£"Öbg]ý²;z1«Açk©Õ8ªdî*®?ñD.f­öù?S1¨EC	JÝ·yC& Å½¯Ò)­}þ3®Ç7¹ã¯N"ØR®~TWM»ßb{ÜKv¾ÁôÁMóÁý÷vQxD8Ù¾·ÉØK»59^~IæÈfc§Ü°·Ä9Ùé¥ëõä4ùïS¬'8:>5EÆþÒATñÿß/ÍÄÅsÔBy.&ÜFa
¯.(Ýg0®U*ÌRÈuæÚï1LaôÅLæxÔ5ê°ÑuOôÏ_Ï¨= DZD¨¼³Vï'T5lß?R5ÆTmSm®÷~öµçJFIÆ7Qh+G¶IÆÕÖ¹³øvè5ç%fï×R%ílØuÿãµÉ­ä"A!Û¨%ø8H0±©fFá_ÈsÃ~%ëªJN·l¥õãöÈrÅ,yaó*/3}(cQxwÛcçñ£<Nf¾93F4¹ÞâÁ!Yý&r#õv"±a#®\±ÆÈ+?5°ÎÐ<vP²uå¾b«8þ´5~cý5¬Ù?#SË¾[$@äª+üÖ©CÈ7ñPS[>4É"@ü·óÓ®:Á3ðc­®ù8¦¤t)¨àË°Ðè,mXn²ôY;µ©9m¾PÜuÖ76·mnb¸âÊ*&â¹ü'õt%9Õ/|Qio8Sàx$"÷oï8=}[û¬æbT-Ut|ÚGò³µz÷2ú0y&¢°Ýeë/²¾<¡eÆ¼ÌûìîµB¹Ï²^£TÚzu¨¥WØ³'4smUëÝÀâ5dhé©NYO <jÉÂ°ú))¿iAÍeÜ9w_~ËMÝZp4¶N¿?J*[G ÚÝÛýGë9ËÝ,åÈSL=MáÉ°*«(+Q5~]»lTMþeÇ6 T®f³7;9Æ?·×ôôó·ÙÈUÂ¶·}Á©mºÌi´ÆÏçIûx±^+Õ6d-SvRõüqËäZý®¯Ü×v~±$TêÉ¡ý{A$¨uj'3%muç9>{Û óÿÌDÀ'á6ÿ×ªLæoÊ¾\>U²9òà¤ÑÞæoÊº9òØÇ\ÐbÏ¨*ëö¢¤LD©,TÄ¿_?p°<S2ÄS%x÷¦§Èµ­µÚ5h·ÓÄï=M¯¸Ã¯HCXjJ=MµmÉrx£7ÙKs tá@ú¯¯ú¿ /
C&¢áún]V
÷j9æ3¨&ØPb.T30}.´¬£üQë¯Ñú+»b½ÀgâUÿµmtgòÿ¥¨ê×Ç¡Gvq#"y¨¤nN SHR%opUu4RÍ¢aÜOkD¯Û&·}üD/ÑP8¤t}"NlMAñO= ÔÐ?z÷H¿%7
A§ G+zàlhÍøiHël¨½o}= U_Ì!ýR³b® pÌ%=}ýªÞe§3f5KwÌNÿÎ%ÇJTÏ=M·®BU³N¨fØV*AÓøT%æ ­ÞMèlPVsÎí?Ãf²à;6%v¾ÁPoz¸ªÈ5±½Sâ@Îcì§C'NHr»Ý&!DM:·¿5×æAëY,§B´ùaÐOEë{ûúMó]ã{T'ãÀzU«&£=}~"Dæ¯®"!­U®°·²sâ£rù¾âêJü%¬ **^ú ï Ý³*ÁíAFí)?f·FÚöL8ÜÀ*ÁPy[ç#QÚ¥ì'e
ECRy!bÞóÂN¹qãO¬ ?ÕéÇH-#!6êxÐ|ê.@(uzJÃuï@5wÒ!]2:Ú3\¨;åø1ðFQS^Md´cåÇµ±F^D!GlÀÔc×Æ¾¬]-} d´cJð£Ì_ *§g´}y%¹E1øåäOT
_aaêÄêªoá_>å´aGÒ cÂqÌÑ35ÀyÁÉ©WÄ¼ÔO+ 6O4j!I¨>ëµÕcÿ¨gðVh¶ïÛó Å?ñæ:;ðÜÓqY"Ù69ûn<iã±	EÜ±]âï[ãûÛ¥ù{^á]&Eä+âdv¹öüû:][á]ÎñÚ:ö@"0);Un+Ûâ;µ7Í2;õºOá>5Û°Ó{Nô«&µWqq§p²ç÷MetÝíFéú²jW®-å¥=M	ùËsâ3G5a­é{â=M[é¨B\S+C+¬7xåÎ ØÞo+ÂH,Ûb'ýswæ»¤!\­Íþ2\áu9¼	;±QæëüIu \>£¬Ñ5zxFæ³ #Ôm4!/-txÓy¶0$&õô¡+VzF}­<<TQ¯ÌÚ®â*³4ÒîUû_lË¦°0<p­MHOÖÁç¤Æ+bÁ#bòÉÊM¸[D}cÇ]®Íql!h¥wÇç´cÇ)ÂnûG°ÁYÑÁÔqª=M\þAs>MHw¿SB¯ßÎñ]Ä~OÃÛ= '¬Þ¹ÈCPÿÇØ?Éy´Î= 5iqøûÜª¡7Å{ÄÔ%÷[«3 1ÓnÎ¡Z	®Z-!¸Ô0X»à>êoYü¹Ç= h¹ãñ°½UsG@©3ËÇ~*w:áÈ¼(¡ÔoÍÈJ¸ÕIê¸f°Ã=}Ø­Ü7ì R¨ 'Uý&ÌNá|y¾P £®ç#bÔ§³ö9cpTÒMªqQ¯ö«5	Dãd&úpáoóê·½5iim
·:ÿ3·=M«á1]R$1Gõ0¤y/ÈyÒY*p2ÙÈâRXBÅ^Áäf[ÜðSÊ9è{B5¼0A¡Ê(ODi××Czõ®ü!~ÞxÐ$pP wågþRJ5õQçf#õI¸ûGø.ÁáI pÍNÃ/1&&q~¶è­(Mb¦îíÞ£ñkÜÔbM;éÆÓÕjD|Î_R6kU6[Îwð.¸É3*«'¨âqw5oåA.ECJÝ>(IF¦{"|>pS_äß§=}²h©Ï°£ åîêÔñ]©-M<æo£ÆÃÑ);G:|G¯¦¼ìSÙoÃ3ùõ¯Ë¾cYÂ÷Y©­ÃïÙ²Þí0ð¿ßTù¾P¢ÊhÈª9ÝbÜaì<kº2JD^ÿGvbA;bVTûÓ {%_6&J|Tuì~­§¸3·{TQ KÀ(}kàB5+¤èÜüü@¾4N¤TáËÝK<&òäÎU®_1(aµ­ðYöçvÙÖþyBÏÆ¿Æø¡ÕÏ(xG7Bîv:Ød	Y03±½$ï¸WN0ä|ïöð¢]:	ÂbåðÈ´m'/5ùo¶:ïv3ô¶	27d/|ï"¶ë<ÅôVJÝ×>ÇSeSVçëX5ç×Ïq9ÆwnH=M@äBAr°ÿÖùÁSÓmÄ¸ð²ÆÕmÇ10"1(¢ »ï©ª8sD·û,Yj«¿«ø[Ýæ¿#ÛfëýbÿIVvW6´~sá#g}QêC¢º®1î©M%©Öï#*Y3ò90pÃ³÷^®ËW
9¾qO¼kx$ôÇßÞÞVî:+~EÉî=Mþ\F¸ÞÜk_4ØùñÉBNÝwÝr= hÀ,w+ ZAÃã¢aÉ÷«^sÍù2âS!èð".TY¤-u«"û21o/M«tÞÐ9G¿Ü ý*n=}ëÁÁ=M¹{?wI¸ RÕµºF¹0Cz¹Êô@²
±æ9}J¼£qíïI}Wär¬	Äí¡{ë62NTý©T²Bh­Íùls¾nÍó_åLe'x>)Î°{6frû£'$X ¬2atïO¯SbO®:+Ð©"7gÔWîÈ0FF·ÉW®u?©G¤~+§¸9:®9³5¦?ãZ;åß
sVYÆI±°}Ê=MYäÑ¶­-R²=}¬Íãg\óM+[ÛjZÁ¢³#¦oÇ±ØÄé:0V{êë_fÅxÔ®Ï³/4Ä
6ÎJÿg~øÝåP×ËÍd>BP|#o méýUÀ*]ôÞ¨*Ã»Êè# ]æ6rl$adÊyÒoÄÂðÏ:mcáÎ[za<¢ªh^¼*AÉ9. ÎäÎ·80®qTVðäúÖ¤¦ÌêC=M=}Õ#ØÒ¾dCFôßUxçÝ¤?÷Tû~jÃ °ÎÃStÐá  /v#
'c"4q3ìÿ{¶ßv^ÎòòÉ:¯kþ3]ÒzçÐë'ÝgC½Ôö?èðËïzS(½ÞíÙOÝMæêQºúáÑû°î±©}ÓöÃGÜ)'= \«plÑK©²jÁ¾~ÙÄQbW4Ouó8ðDr»LÎ«î.Ôé/?m5FiÃÂqÛ~³¤OºJ<Èªòj*kñlgmÍ\·Ü_þ'¬vç+ 9ç9´eÿêN!ÖµßÏWfÄ9½ô5DôCöt>± ÀôÔÁ2<ødaxªÃþñ± ®Õ©ð®Þ8þë¡¹dÕå#w±E%íbZ×M?ð¤ äº= Òtºs?ékn´³«4P
¿vLK-Ùõ²@'Á®NoÔ¥mÔ%4ÆÑ	ß¦ GA¨þ%p¢{²nôgaÑ_ºînô'ê"a!,Ok±?¦ü§CwÙüípÈ¾lfWkguZüï@¨K ©ýÞ{>Îe ãgç¸ÂËç³@Êä¹}¸¹ªA§¹aÔ *ÃjPè¶ Ç¶À7RëÄÊ×Æd|Ü¼×Úu
%l;a gÝò®Us¤áð¹ay®É½CâÖûma-æóóVs2ép»(K?)^p¼&ae?ø
ûx¿IËCVzC"ôp¦/;:dÈURÁ¤µÚ GèËÃSoañðá!wN5Ñ	ü·üÂ¯"áQØlÜou+fQ°öÀb:e=}¯üùoÙù©ôyÉÂ|Î¯¬N8v_OÅÖbD: N+)Ä ¥ö)Í
dÑwúÈÐúPÓ k¦Ì.|1½¼îâû¯FN0kÑm\ZÓ'öÐu#*1·MÕ 1 Ûõ¡Vî´®	\	¦\Ófß [Æ!C´áG}G.íù~{¾e.9æ;á1ÖA°ì§= ñØîÁMÞïc@ep©° r³ø= 0pÔ½1hÁVðÛÚò&£+]4êÅÙ= ìZ ïpþc5"àióî/§aü[4\æ±e¹â¸ÐñQ;YhEÄ&ÝßàÒñdÍ5dbgiU ¸?NõeSoÄK	/î¦©am½ýµSJöµæÚE9PJMÑ
°nåªmôâÚ¶sÚXx¼~ í	?BïÒÚ«öçéÂCOMYMà_¸&ZçÁ.h¨sÜÚöç%ÎÇÅ®v2å²Î6>%LAÍl0Î&',Ë×Ã¨Nö$*|§+<Â89]$vbÎ6XP¾ëûHIú*aH8\{èç4jø¾Öì±ÈUpõgò
ÅécÀ³ìÇ4­VåÇPdTtu_üz5ôïYúÂ0!@ÊY»¥ÅÙ6Å¯è/vÚ.cõªyû»T¾KýÙ¸$«ïi%Æu¤QGâ682ê"þÖÑ¼øu(LÆÆ0µ»'­/D
ØXpÝ2ÃÚÀúëðøâÀc½EÊêöÞQYêâ$ä±±f£ÌÃs+f!òÑå	rùZÜBÅõ-©V®ÄcÜöþq¦° qa5ÖöQÙéMÒgìSU?dZA­z ¹çÙÐ¡êÂ¡ Dyë6ø1%+r,_ß	ðY([ô Ñß¼ú%s88skh5]FnùbÞâiwå=}ëO6£4?vÏÊúÅßdµ¦}GUð
!÷mèã= Ïr¥9^ÁãO²lWÚÏ¸eéX 0%Ê3C³±´R¡IJy\&^!Lo=}!^|Y²(üÔy±*TµÝ"dàsÅö}]«U¦æ/¸Ï|=MÒÑY(g-õw= R=Msøw(1fA%xèÄï/ÿ÷í½½t'¯²×^~ý¤e8I²¸6f9:¢îwétýÝç&ûïÁ·½b¿b,j*õò$®z/*ê#f9= qé¾].5í\ß5Ï9÷ÿy»Äþëù,DR¢GgÙÞÏyN1:ø[[}¯#Cz}¢¾þÎô¦²Am®«óÆc7{U3= ccæµÈVó¾(Ó·÷w.,z	£8lÙ®¹£RÈ|Vÿëò-MÖÜ
ÅPDÇrÑ%tÀç3£ºkOðp±¼2uØJÂï°jæûÜ¶_ï=M
Þ}ÂTG;¥5@Oùùr9l}/ëZê¡uÍË÷@±¤_ð/úm5eÏ(ÄÔsóÁÔÚÞ !v©¸ÖrêãôíõDùE°j[v4énûgÖ"n.SëFÃßi »¶}æaë>AÛé bÉ&xahBÎ©FFêtë» =MàhA|Ø÷7Æú¯Ò%´=}æ@´-¥ë&&ÞF(,h^~Bê¢.G¦= FÕg_7ßÒL.é>°zû^n¡ÕãõWègÊgð¸èw¿o©Ë1×UEOO¾I)_º3Pê¯§1c
ÐU3Dñj°$å§(;=M»égo6É¡ª¤öî/¢Å¸$_Ú²&Bì= «= ®§=}ÌÖ¿bÝjð;ß~ó^ç2]wóÞ-êWöí5´YDNçÛ¶Eí¼;U5?8£ÉÎcfÄã!°3>ðmµe þIAlr6Õï£X^ÅS5fV^m#EÅ3¤<$j±ncºÓqwÄúJÖ
6Øò÷Úxg= z¨#°\»ÓV¬Ivþ¨	å òÏY¢	o¹ôò-üjòêÓSOèª-½OßÂ;ö7÷ w_ìMbÖßwßTKC¶aw4à6æ×N|÷É*=}ys@F±Õ"5¶lõcûvb||=}' °/5b£Ò= ×.3wL~¦^¿= B<X«´%gYCEpº5c¼aªÀd Ê¤>/#ç¬ãÑ]c([(Q÷Uy×¾ûÅôLÑV°û06à´Ñçô]»¬îªÛX\v9îCÁ ]å5d®D £;NméÓ£].>3±ä^2'.Ê")&6]é=Mjß®ýíñfùFw«³7á«tícFOâ%8bã|ÖyKípFÃ¯aH^[Ò·*iàL'°lhBy><+u=M~I=M=}½	èÿ=M¿3}Jµ<4co,®G¸SU¿!I}Þ¼åúË6çáXâ(ÄB_CâTÙÃI·¡AE)ÍIwÆÇ;ö%¹ó Ú¬ûC?¹=}¿+Do1Ó)}ÒÄ*G£<Ë¤]qêª*N,¹¢î_ç¥Dø°¢³FÊ*tò"|×3.,´÷¶aakNòÛe¬õ@µÃºn= r¤#FWÛ;{ôÏ[ÚlôÊ^ÿüñÞäÓ#)RÓ°üð>t§ÉHRÅ¼êÈoý+þ§ýÕqÚéBÃrO'«³]ÍY}=}mL¿)§ßsVó·Æ½ UBÔoðmPîð¡&"mÍ¹áÒëdCY)z ?èc£&íu¨^YÄÓ£7Ê~L=}{·	tPãb´¬LfþH¬=MÆ£/VR-Mß¦£tVB<[ïvMy;ñùï&¥	[2§§97ñî!éh2Û8dÅD2ò1ÿg#t&4kt%H¶ñÏ÷}ãÖo tÓ#¾ÉË8Ç8ó7kÆñíß.s.ÌvÄå}&¹RËê'úøÌ¼éÑ¹^±R wÎ§üx®7G7}¿Ër±x8Ä¡v¿¹;JO½±ÿ¢Ho¬¤ÂÙocÛ>u?Iµ:nNÏAë²º8ÛòBÞZ¬ÁQò¿j@ó¾O¥öºÒöÇ¡çÊ¼fÊÀ_1iX­	äEu 4µ!ëdéñ92B¥oFâ MÓIF}ëÇ9<üt'¼r"n$u]Îa;o)z	 ©ªÂÁ[M²úÓº2vBM¦m_t´YÇ3
Bä>ykC%|¯æ£x8ã/d-íz%¤q"J-Rò©åkMUåt÷XçðsºAÙJzÆ»~^àw²SÎÄØÿÈÅ=}ÖÇÑ¹ P5*ô^Sëx´ÅàþËLXÏÎÀòÊUÑ0XÄHÁÒoQ÷ÔHØ¾(L½ZÕ´hõÔDSGê¨ð'vª=} ÌbØÕ©°ñLQ÷Õ¾´"èD_V¯r.®MEô	mìð	UÈüeyoÄ!¹=}&Þ#4B	_ïO!ªüV-~cå²Z= mYîº=}O'.4j6úç?(úg¬]äÝ±¤Å(¢§7µrPeÉà×Å¤ïW»0ï!ÒÉ i?RQ[,Vp«S±{æLæ(M'hXêËMpöfQÝ»ìÇ¨4qè~Û«@Äúôúïü¯ìlÈ¯=}=}[NÐ.Â©´ÏÏ@Ð¥=Mføù¦ºÙ'§IwZÂI9
sCMAßc¯K53æ5YRÝ5£üÇõÑI%OM±4pg£îozkI]Ûa£^ëÝò@Òéª{:âëJ$Ië­ýA>î·h"Lm·ð1H¹êL÷cR·:ÉÆN:­oN;(Þð5CäßK=MiüÇlOHRÓ/	£l^Ö3r
¡æ lj½ï.'proíøcc¥-O~cw	{YjoÆðÐ# O:øÕZ&J­I¡ñÉ¼·erT¹GÞùÑ3Sï;uní õu z ©=MíBo´EÕ#áà î6éÝ+aÔï~©z©,8Éí«nZñæåüh:Tå¼êå´cz¹Oçå¾ò®	Â¢<Ñ®ß_ î ÛÉØ­ñ
1~ñ]³b{âÝÃ;üO¤@ÙNM¢°ªÌ/añ;K6µPRçH#Ã¾KA]k8^÷@hTý
P×î´m4Nß¤f¨r<ý·&0Ô~9§¹SÃh-	ÎC±{U		OqòO3ï(Ò	í,t;G¦fZcn±àû%þÍw,«~XÏÐØowþÿy¼mSkÕRôêÐÀù¶_Ç«f/|âx]ã/·øí¼èî*ÎëØPÖNa¯YÌré{Z¼èo°&4×§¶ØÔ¿!+!Iþ×Ó hÈzXLT¾Q)P,d~:Ot¯ñ-g~&a ×ÁÁ¨=MdÑËlhtÕG×VäàØÀ=}Æ1@êDP-gnd©*]ô6Ü Öx6_À:%ñßíjúnIñkîEcÂzï~9¯Å¬GÃ\øòOmö[ôV>S A=}iqµàÎ¥÷£âg]Üemcæ¸hFÄîÖÑkÅfèç#"æ§GÇöUi¹pÄÚÓ«P¸*ÇT ²ÈqÙÇ@×Ä?·Íy?~ÿ®ó.Ò­= Ûãu3ÚÀ°äÅÒU WÌ²¾t²(µÙÍàÀú¸ÒzÞVÄìrÃÓHQSÜ2ðZsXÀËsÝ@Â:|#ÅêwÍØxdÕ;uÆ«ª¦/ãÄÓGðwiÉãi­²ÒØÖøÑÎ8ÒÁ\ä;»7Õ8ÑnØÉðX×0XLÔ»¨ØbØ¹°×´ÊÕ£ ïs¹&§@÷ÎÉhaxðiJVÕºAÖ®h½òyí¦¤Ç)=}'ëòS C#ó*êðUÑîÏzèF¨Ô~Úw×ë7h[Ù èN^üI»ÌJI:¼'¥5Iùh£~è9<5ð¼C.O=}Öó,$Ñ:rjµÍ»s»+vÊ¤U¿òb«)Mý¤xSëHi²AÚ¹ÇÎ$×Á¼÷S«ÒZ= ÏÉôwµ|êh»;(Î×ew?Ëüåæð÷Ã1ÜÙÐn_Ô¯¨rS-öRUñ×WâµPµÐ«Ä4øÎZ´·¡»CìVàdn?Ê+÷3YÖpaeq(oÂÞÑe~9,d-åa½UÂÃ¾Óº4 ½CêÐ+Í¹S&25qQ+lÁ@D¼ÞÜwÒå¯ôq&¢ïZi¥É¶M¤Èà2ºQÛ]x/]uióÇ~_Ôª_ÔM\MUTgºElÆà7rïMÈö_4ä³òRÈéI @ý¥êz2h¬º%n~%niñ@Ár_å®v¹8Ë°¶^çlhn5,ÅðýÂ=Mÿ«Kx7}	÷á!1|
¾h3ù#wpX´&«HÃ+aëåü&î7Ý	>mÆÞ/w=}ÁB|üMÛ¦âìaÅàçJæ«øâÍÚó^PAýCÚðéð#ÑÜâøÄÒ°½ÔÀG]N7ÑÁþ6c+¸(z%²×Q1ôZ[m]oâ¯ò11	ÒàûÒJ¤~Ñ¸fÎZpâÅ#£Q£,êöê¡énHÀd)áÎJ\¨¬hÊü\OÇSZ/|Fi´@:¡ÃüG¹[ú×â£
ýýè ®þÖ ­¶^KäëÏ:§T~7_8à>Ç·¥¹&í#C³³æ:gDT:4qgÙ= Ó×Ï¢N­°fÑªÝ§¦Ú¬Å5Kò»,8óRCw!¢=MYã
Q¥=}Hcäú½¯Bç÷Vi8ÚpML<Fí:m[*½«0Ð<ÒÉ;Ûª,ÒüT7.'ò\·¿âQiÀ£Ùb¾bÒéäDºçÁ´ºý¨1ÛV';çÅ´àARWdÕQóNCÀîÈJ,þ ¦Àï>@VÌ§ò];ÓöR@Ëw4éjõÎÚ»wÂéÊÚNÍo4ÉÏé¿J÷¼msAº_Ð0<××C)e¼H«f 5Py:+P5¸¹{ðR±»ÂÁyF,=Mñv54÷!hrv{%/øh  Ú8òÑ¯¯¡¾
qtWd¥û/óÒÿ=}£&Æ/AJIé5Cr;â~p8VeÚ= èÀ,B|xPÇL,&¶6Mðw|¨LF«Gv Z<23ÛyOvÙ±ÿx¤fË2NRÁ]ÈSwÄËZíB(âÏ,¯¼LÀ¼w&sñð,¦ZR¸ÄaGdá¬qR»ï½ªP¹¬'­÷Ù%No%U¹>Ôg¦nÚ^n¿I%é"<Öu°ZÝøæ«ìâßöÞÛ8ê;UX)ªPHåg¶{3Vµû.a|¿frù÷ÁÎÑ¯ß¸Ú 	ª]!ßÁ±â %½z:)ö[Û¡8ÄMR4D3ì}(åNH¯ÙÁ­ô<ôykÀÇÌ¸â9+ÅEf6íÔ'1à¶ß\áR	=}J$+¦äÕÝQ}n~³ìt,úÔÄ@dý4n$u(Ãk¸*½¢¹W­ñ,ß¿ÿ]ªä~iÅk{ÞQ:YÂt÷¸Óãpu£Sï/[H:Ñ=M7¬ÃÂ£²§LQbè§¼3	3¨¿
¥Z)´áË9ªNW¥H ËnYù<Q·ej{õ 4Ë28gÞÍæMmèÓ	GeE0ÓÔÅrÞ½À¬È4F4)äîý¾Ý÷Ô= ¥Daê£= mä|ª÷z=MÑõc?£ºÚU#1b}+þügh¿~ËÙh¢»o	íãáÙ&ó[e¦æûyfYgá½¬$¦&Ð~Y ¸d^]· íz¸|ãfóz¯BlVåü<D¶k²ÄÏ*'G',Zz¶Èà]f5·ýÏ|¤'¨ánsìà²Oó÷^A	Äå?vµü7|ÀÑøÕ»{Ø"\YÅQWØ"ÜöRÇsá.þãøÐwÞw÷Ù!=}Nj@õ= E|ì« ½Ã.2qE&Sø CëûU:RÞ;©ò=M!ÈCñ¸39²4)mz´]WôÉkÙ
ï>p|äã	e¹à	­F½jAP+±+yfëÉ¹ÚÉ:;¢ïökÄdçíàcñôñ¦sîï¦å!À0ë-Ôr,k7j qGn9SCýûëEsÅÅÑäïòM@@]ëktØD«è¦]ìä¿ùÍ |gWä}Òø?·#l@¾¶h¢²	èÀC¼!ÈüØìû
â×ÓÖÐW¼û!@küÿ8^Ê¬QØ¿_Ô=}W@:]ß=}9ãØÍUkµ2(;ÿ)ØÅÚ¡êxX$Õ¸þ×2á(Õ¡EòòY]DQt½èvY%=Mö¹dèOÚNìÈoÏ©SñÈÎüU = ?ÿ]zÔcËè[¶Æ°W5û>wo!rY´¤[}Ús+=}ùx(½?qå[$K´yonwþ¦·C´­§mÃ_Ö®Z¥3]N¥øM×²¨o sÎÂàµ5-z°o7­ÀgíøÝ¢çÐûûOª?û­ÏÔâ*P8/Lú3éµS²8c7Ôw\v gØÒðüÒeÍ¨NA»õØ9ÈÉuQ&¢ÞÜLPNú9{Èw|!Ùÿ/>OÍGFÚ ÚWÒËWiWê'Dà>À#ÜRÀË(\6i >Ei>i³MPÃµª	ßa u6À6á´ÑuÁëFÙðÇú«9=}cXÎt·dä+A<ô½úÃÅÉ+0y9Þà´_pbôx³Ä3Ù0³âjBGýÊqÐÜ½s\´°­°K0?æQTÞI K¹3å!p¶LQ±Þ¶Ì?1:ÎÙ¤§õa¢ñn°"ªà±BdynmªÒ¢;uQ(m µ5wÕÊËØ³ÄaGë´.oºönÖ(òéLµXé»z{ã^V1ÒÀ§îP:ägRF5»®+È7¢Aî÷-"QÕku·ã;lv7FÃB¦ç'¾Q?%1ÈsöSÞþ³î¬? Dùß¡%ÚÍ/³yWøç¸ W5 ÐèDïvÒ:b®±Áóc»"_mäÿIP'ªõij«­RL½¾oÓTC½mV*TªÎ«XQ!oY½_[Ân­êÖþkÒutÌé5°vT}exGHzÈ¹2ÈÞ¿¶Kz·<úD!ÒXj°©ÂàÝge$N×oí­"hÿÞ¸é»Llýì¥~ÙKÃw!æøuîÉâ	çþ§I1¬ùs.y6òéÍb"½3À#= FR ÃÑ@f8¢lÇ@U3u¼ÂÛí }y1~F2 ¸O6M¤Ü©FëìÉ¹c¯´5DÇryA¦n_¼øY£Fó&#
:Äº;]ü&µä[ui5f+FÃd
%§>±"üÄýeÊ{j]$äy¸±ÑÓIÖì}kVímÁÅ¤²Âynzg£¿;;(ð½­kªeÍ¦SBÎÂú'Ï5µ³üéõw³	m[©F¶ðÕPA#lÎ+= ÇcoyMÜ= ðÙ[w|9o*}HðV¯pDÅÿÝ6= óòi
ø~Ê¥¢mÑ¡ÉÂu&zWýÙI{.Þñ8zhST2ÞÏòê&[ù øÏ¶êXT1
âÙp+ UàL:0hw³6l\Kå±öÿ±n÷øÊ¦4s{.;	úÃ)5HnBê)Fn55´¶Å¥¶ßÌ(TíÓÓrM´gUf­N&ÆjòwÖ6pl¡^r­Ò»ÔR¾%7¥µA~ùú/3Í"ÅÊ¡HDot¢xJúvø&VðdP=}ÖY»E¾t.taÓ~CXíôèJ(ùØ·j#lv-×]$ÏÚ[Jà©xºý:©ßY \xáN= «UH)vð»óíCÇ¥Â­½	~Í^KÀõñûNü^k®BR^½Y^ýaìßÐ¥APMSóáÄBzx ûj)òAÔÔ?Ås(M«°rià°$R/¦>9¿ã ²û;!kNß].¿ÛÙï»ÄÎamQ2û·"ÈFÜ.wæøÀE ËÙéRCèsOU7eÖaôû(Ë²%²ÕTýû>ºÙ{= ©áÇ¨ðÉf0½çÜåd*·Ó÷òÉêìÉãhQ3Ø½÷vì,÷mr(~²L3çÀªê§fMövI§©rrªrr©òò©òòöÖQSÉÍ@ówBÈ2è¨SÈ²Ù¨ßÈ²Û¨ïÈíw$®\<yÕõöæ0Ñ ë)=MyN©y»/ó-qà¨X·Ø_Ýí	öáÿùÏQl±>àâÄgÜ®ladàp6*= =}½«=}³= E?U¡o=}è²1= øzçZäúç²Á¯°ú4U¡%ö¦= %°úpÓiç= ÍÃiU!+^!Æ°¶ìê\f½ô«H½ôqåeAJUúá"RQ·ä¼½Ù(¿¼	=}iKssÊ°\&¸§¾ DðÅ:âìtb²íUI§J2Our®ÔCgÃC­§ÞC¿Þ¾° ²§}@÷àÀCÑ¡ÔètE×ÞÃÌ¡ÛêCõzX7+$v®5k&Ýùï8H=}§=}à_Â§ÞâÚ½Yé?
òÝ'=}â~!é«ß¨ò¡i»HJev"Äí¢\ÖQK§sé¥Ï¹W³ lI"4supë æ	À:u]¯näû¾Â¨ôXbÔ-VFåÍí² _¡o©é+Tê×A6¸ªpâdßBZ{BÓÿ<ï=MkíÏmlåeoäµPµ£ùØEY)uZ = ZvÓý3¹ÃNÓë/¤!áôð_ør¦¨þÝSáÚl,!ûñ¨6¯WµÕ)Ñ¬áèàÉ¦z«~­Û;TqíYìiú\YêïBNð¶PÉKIeóx}x=MkõN°¾+-°ä¯z=Mb§fWFu:#= ÃêÛY1´ý.WirÅ= uªo»@b4úGlT}Át\¢8èÂ´C³4·«'cüÜá£Ü,ÌyâJæSYô·9Qô­N4óá	±#Yº8)¿³Q¾¦Ar4\J«ä^væÔ^Áé}·A,ËÞôVb
$®B%kÂé?o°B/êcvá¦W²°§xcT	m²&JhÎ´Ya¸ÁfRÜÐ^EÓ3jB{,Kæ¯ÏBá=MjN_a<;!G/¸øß<TÕ|ÙhÓ¶¾4åÒA:1]|t¶²f9va ¾¡Ûº®»Qy_É@(í§×ã=} þRÕi{Þi¸Ó=}>íÞÐ­= ÀðÏê),÷&´(Qã2ÿ	Úv6æ= d+&4ÈlXå%¨6Ååi'YS»VMJòÍz´ÿÃ=}ÞÃ¥QóP³(jÚt½d}!·¨bñÕJÏ&(ýëÖ39Âkv¿©¾Ù|;2*¶¿HMçZ¾ó?;bdÂ±ÎÃ7¼@ô	ð= uÂ¿=M§ùJV¿LÞ1ñ'ÜÂQæ?=}Ïb©ià2eÖ´ûà PL©"ay¿O/kún¢mlLÕÝÀ8 	Bð¦¿»ÝmÖ³+ÿWF¢ n·39íL¡Çoúd\÷¨þ¹Á<&D2@ÇÏ\Í®y·r «z¹nÝ!*ZqØ¶§ÆL­Fó"
Â= fbÄóÕç9= CíëtÄïDAis=M÷Lýhïc[Áçú@Èn^ÜæCIírv(WgÒ÷RÝõúKËá>j]¸!Ó\ÏS¼ØSÛ ¦îj¥re[¾HõOhß^ÄLçã-/n¾[0¶Ýÿ&PÂûBIëº8Ðü Wp¸RÇÎ9;¶mö*¬grcbµ5í:Í.Ë}n¯J/ >=MßÑtEQFM·»|TÓ²Ø:W¦¡&Kk7¿çoøküËX$qà	òñuÁþ·!jQüÊ»þÈ V·F±TñSvÜï¹õö¦Ê²¿ vÈ7Ç
xÐ=}£Æ¸xalòÒéõá$cÆ¸ÃVHRÎ¸®Ð#±\»ýVºØ¨2.IG©wöõH9ó½Êeò£Æ<¿Ðo,xýO¿~8ÍÊµÃÃ3Ð##øL6ÑÔ¯ 0ÀX«CÌÝ/ÕêSBKÆ¡kY1ÛZçÚþØÛ oõú!Iïpê5kïì[ùg. 5G±{g!@gm×ÍvüÍVîK^ýMÄÇAÛDrÓóüTæÙr]¢HÀÉ!Dëi£?ÇØ)·gW]%³¢æáÞ2é½AÂ!­2f>=}Ú= Nßä3;wj¼¯¶"È¤·¥ÿÈµøRÉÉ×Áh4  è ¨Òjv£ÅrðÐXa*iî@áþþTUé¡ùvË{E{=Mb'¯}²qcõG-¼ÈüþÌmüº±QÁÞiÒW\eËÑÝP5i@ÎÅº0)ÖÂ# X× 1öÕ»ÚN¡Ðu)ÇçK'i\¡gÚÇÛG×JD­ÍÈó½rÈ~ëì-ó+Î·ßëVÕaZxMPA."0¦®â~Ý #5ôùÁ-ùþeÿâp?
Ó{¼«zUõRø^¹DÎÑÇ0ÆwíÖ¼iK_}G¸¹ÓÐdö9,(Æûá;$UÖÝãºVË¸Cuùf&©n4h0\qÀÛM[Ôz«³L5ÃG\ÇÐÊjN¬q\1ÝáÐ@¼J>fvèûnýgòtæ3Ð:Q±]é¼«eÄWØ(d5ãÙMWQKî"õqïW5êÓÇÛdÚÚòmÆÍ¶G,¾Ã$¹þ5|cJê¬¾Ë+K¡N§"ÚÅ4·#Ìü¦ÖR¾ÆØ0JÓ²#û:c"WÕàEm4Áôø!¨Êº8M®Ü3Ù^º²F´F´F´F´F´¿SØW¶¼FeqØ|eÄÔÇUÄ6¸VÀøyz§¢ÝÖIî¸$ðT§T¬k» LÖ-~=}Ä×¾]ñBm¶³	a9H|ù{zV´GFTNEFvpkPýaÃñÇdZb1Y~1^Î±fÖcL_4QaQ^hÑC°îì"ªHxÇÇt:}³Ï+ µÞË<÷°K83ZKp¯X¡ÅY²~( SF4OÆó)ù8¯UR-/..4³x°JÔ¿ÖOümFþïáÀÔ¶ÁVD®2·R¢!K!mìßÌtþÑ8[EZÙtÕEÉZ¹Z8ÑZÈÑc¨ÑYPQfpQc h´g¤= l[Ö±b¦1d¾1Yrqeªñ[ÁcOAgÓZc^û¡= õ¡eM!^½!cý}!Z­¡aõY«gÁ_jq= h°ù#\ãÁg^ä(}üf
ìpêwt¤;§üKAß¿¼iÈw]©:~q\ !÷'C^.Qg]º~Cñg&bøa¡TkñBj÷éö75ZîAd=}%69Xõ]§­Vbý,³dOø½kD7égÀÝ¼ïz!ù¿éa]úì:Q éïë]wUýá¼Xólk	ÅØ?%n ñSXÿ» </@Eâ ù¯W>%ûÊÖ
PxòLniSßøèq'9¥S!Ò!a1¡bZÑ]âh= TËµÙwF7ñlZ,*(Ã!ñô©gÅÝÆt!4üÔkÓK¡n,Ó5bSTMwÍ­ý~½l'w³l$,Y
fU°;gô#Ö3!³$ü
§Vò¸úkòîqÎuþF11úÞp»GpëÇlön÷wo7kk¶mÿ¶pnwogVmWpwQ#Ö~!_Lz>f9'í$²<1ï´+9$øì3óv«Ò=}oÏ}-
n~JN!<Âàk~ÅhøÅ2ÞIÄéVP=}²+ë x2:'²ì=MmrR¹Ý¶)òmL)ºBÜ×¥ÁvRoO¸|4Ò?M<àËÄoC2ÌOÁ\ÕÖ¸&xçx¶vs¶,Æ~PWí¿üPiÄwVGAÒÅó¡ÈS,= {O¡ì,= åþ@$LÁÁør$,D¶1RnQ¢çÀ'2hÂÞ ðÁùÔtÓö=M²â*ªü'\©ªYY,èbSá§ÚÃwV?ÀÔxV¿rÔÁP×¥rÐ°xÒÊV]GbªÈñ:UÈGÓYr·Ä@Íjl@© ¦Â¶= ©¬DÏeÂ=MÆöÇ¢uU~ñþÚ1kXmñÒäw°¢Ì$ænüã±Áó~d­e|<mÛ9Z4Q$£ænü×6K,UäÙ)b~¹¸MÙX.Õq¯É:aà¬Ó¬úaMñ»Ü»øì»hõaøKú¡\QùÛºÕù-g	1³S¯VWo_xÎSõ¿8wÀÅ×Ñ2WOØ¢Ç¤8Ê>rÏeî¾$¹Æ×ÅÑ´×¾·Rç¯N×ÓKXÏRÊ¨Ù%	ë<
ò¿a: õa'uaDÊá\Ïî°c]åQB÷üü 'µ=MÌnù×1;GebN <Ñà
J
=Mc§(4a3þì ×A^¥ÔÉòcö^%¦¾ ªìä¤D|ªà_ÆfG5aàÉÜºÜCóg¸KzVdëD(¥ª}ÎéÊ£Qm£úDl$DÄ·T§ÑeêÄ/U^J~q¡å&"«Ýy]nzzð¼SZÈ	*Å'ða	J¨µZJ ª¶BÄ_êPT;÷&Ð)&õpf¤´n¯û®J~wVZª;@J&¥-h AE´vd= ­O§6ÑÚN»;Çô(´1S>ÐF³ñµ3¨®QÊH Êóè¹äeþnûÄ=}\Ek
»swR#¾ô°þO)ßeþ×ÏõHï»ÜÊrÑÕýë+°Nq»Ìö·nK¢zÄòÇ¸ÅÇ\,¶ÇÖ²©øÇ.°Ì	¬-.®­y;]Z9	áÃ{Äwrs>Ú­qzio@_yª4f·À2ÙY?_=M¦ãúRÕä	'n&îÉ|¡Wµ§ÑÜ¼nTnhøå9<æ<F?VøEãáð|Y=}-ñÜeó|§ñ?¥ò÷°Ùeó<i*@å
óeeI
¿|ö Ëgp9Ýrmc{!ÙXT<ÒéaøÂ×ÄÐØéëïÁ¿ÜËâ¶}ÌeûJ¢´ÃØò
àA¢kÿáX<¨fXFg°F´F´ F´ÏvVÔ×ìË­Â7ø.¾6²r2îòJD_¿AwoB&Õú´TºÒ-³lç4ú.ÓüY3}î¤æ«·Åb° ÂÈLÙniÅúÈyÃ|Jszþ3~Ï{¬õÂ=M'C¥:Ñ²OuÓm$òófi'm_*{F]Îiç¿ùl=M.K=MxN£dpAsÌ£.v¬u,ÊµêF= @)õ#^õ.fqõª}!çKF¤û ü.Ê}+f°ÏÈL¶=M<=Md Kfj'_xû¢îNf5ò0¡0 Ca|I%¢p¼2ðûº¨ þç8· Î}7¯ÐÃ"3yîj¤v5bMà@;ÄO¹!fi>V éÎ½+}ö^¡$p*\tiK_DNÀ¢:E¡ë²òâ´§Uÿ#Úðü6]-flI®#ÌcíT{\ËÂaÖa¬XX·x­dÓ+=M#}=MTG oLP¿«ru÷jwZDùÀxÐØI'ÌÒ¿-O^-Z¡+ôKìîKp·¼Uû¼Å6[À´,væÉ#ÀÇ¶Ð©£V2]hÌ½vP×jVÂRU7ÈfT|ÀX= ÌÙplKH#³Ô¬²úCTä 8¥ÒSÈ,Çÿ*ø@f(u¾þ æQÂõ7AV»=MýýçNI½°ËùuP¯ZÍ.Y{ì)~)6º³d2zz­ÌÓ7ÜÛä>²<Z¸9ê3íÕE
iÿ¬þ)§9}b!èBúlacÃßªòBÚø;TæÌj
Zþ*vðÒîBù«èUYÄËÛ«\òüV( ¯Ù/Lü¤{LéÂV:DîLi|NûÊ±x²éÂRÂÖ÷ ¼æ \J¹4x
uiê¶pªõY­çÂ6³k>¥¬ã~!Ær¾Ns¢L!°ÜrgÎj93gTÀüf»EÎºQ}@B$SkPi¿}·Å¨Ý¡ÀLÝÐô«I ×´ùv ÕÇFÇz ·ÆRl<ò_ÀÎñcÍå8>gw!°«óBO¨L÷4Ê=Mt
#Ì½Å~G!H*ð+$b3V¶Åd­ÛÂ§úÖSð}¨óÂ}QëVæ<ÄçW:nO,W<öWS\<ûÐVÑíÂE7 ³r(ñR4tÉ
÷DLîøÝ(I=M»2L§Su<ÈP»îó ¦IÝhûÖp¸óªE¥¤Q$! Êñ;Ã=} Iòûeª¥6&²Zæ"avóêØ&=MmNó´tÞ[Ú÷¢ðjî= 'þhCýÍ xf!Õb= ô÷b~ÁX=}ß×Æm£ä= ï·õÀ®i)¡x[.	ý;Òv¢!dÁ[*æ?:rhñÆvYüUq¨UqØù/¨¼} ¯Qû¶aÜuD9øh	ðÂ·è­Y=M= È,Tàg¼R'nñÒñ¤í¨ªEÏ3gªmãþ$ÈªûKøá- i'9?§ÀÓûöÎ±ó¦åµò³Ã¶Òß|Xä$¬iÃîÂU
LK~È|è«ÊdJ¾vÉiÊh*Ð¬¶ ¿!Ð«ßÔ÷_YÊ¶d@PUJ!ïØXôüQSvÇº$e:|çÀ«(íîtú¦4±ÃþÑ¸pBZ@HËí«àÕ[T!üÖ®jlJÇIðwAhad	8cÏhcòÆÇý¦vl7ö~ï«2§Ù¦¡¶=M¥!<Mí÷eÅ¥ÆCÍ]QühùF:¸&}= Ü42Î½aÑëÌ öQ÷¦×&\ÔÃÛ:ÜóÎfr{,Ù<±qøh¯Vf°zÖæ"8hm>¾ôµxÊHÅp­¿Ø_^'^ËwzY=M^ãEæºP}m¼!ì\ ÒnðüàQ6fËi.uaª[ÚjàüXd!\%Ñp¿Ó¦ûï9øvò] b%¹= 4¯â¸÷XYÈÁxrÔWyì¤Ò=Mû±\ßEbeúsì%ÖÚ+ ßíÎjÐrì2M¹R}µYÔTR« sîöù
U«Ýà9Ó¸þX®ö¸	¼ÒD£>s= \½PÜ#fÃÈ½÷9¤8¯t¤fÂ¼®sT±DnL¦¸¯HJz±ûÐêzú_*GõléRÑO°iSÉþÇáÇåqp<Ã_Ô¡¯Ud±ZLÑu6	Óþ.Ô@ëÔÆ®ZMåxåþJ×²Å¥= Ã|£.­Ä5 ýµ¸¢DÃA§½#·úÎ= Ø ¾ØmN[pãVe´"Ñ8iØÈãeX¨g½= \D;¾x©SÇÞ iÉø¸T1ÚEqÎ¹¦ýþÉ°ãÇèhJéÑ(¸YÄ,f°ÙÕxôÊØ×^@#L×ìËXÁØéòÐò¼kj(9w}´^¨Ü2+³ÏåÌÅ+¿%+\Ño!c;	7j[jxùÿûÒ{[á¾iMÐýi·ç¹Þ}zæ>Fù¯°¦CzêjH^Ñû¨q ÅG3yVÅ¬µäÇ ó%Ü¹ÊÝOÀYõºÎesáþi·'ÔôÆ nÎÚ4øw²¸¯	§ÔìÌ&«ÐÉç~Ô^= ÷µ\Í>jÃ(%¸ lqÌì¼ó"üÅd@*t&I3kÉÈPÌÿ÷ó:Þ(ºª¹ðÅÛÃÀËpgöúVÚmÁZ1Ò
0jSÃÜj)¸&KbØF2ÚýFØ(Å<uîWX3(÷býÊÔðÙ½6ÐPYU°ºÈ×Í¯8Õ"ÎpDY¹Ös¹T¤}%|à(;ØkôzUÌ7u¡ÖI}òØJÐ.cWºXª0öóù®|WAqC­û26o}ôÝ#&YuRÜÃTFÕçjC*NÀ.+-nØ(¬.à-nMJRMX	IÅçIRï¶±#Æ"â8ômM6\m¶F©<Ì2P×tÀµ×ÆxpE´#%
è'Ò¨~	´Ø\z´íÍå}#ýíµÍ©ìíkÈ´ÓÂ,©	Æ½ºF¬ºÉníïµ.uÏNë^0"sÃâÖÝ¯!ÆgHûùÄX­M#êZ~®ÄâQÇä¹HÖÆfl,áÑØfþÉÌ¨&Ý'rÍMugù¹ ²VKWíZR\Ö¼á­ #HE&þ©Ó}	,ÖÚW8e¹
Ú|¸NGeýi/Wý{\¼(Ü@á]ÆÐBå6o(ô/,ÉdÖ­ÑéÞl)¾ÇíÃÑªòí¯HJ,» Ä±7 ±Î·îßøX­£[Ö£ÖcDEÓÃ¢µ9´ÓxR1À@wµ¤ÉGw¢piÑÑN|µrE&D=}M/¯hÌ°YÍ²¸³ìéïî²Jý¯SÇµÌ¿ÌUüÖ¸ÐÑÆÀ1¯¾=M|ScVíÁG$ºÞ·sT¸-;½ÍV¹mV:Â)}Õ"T][*&±¬¼ÑÀ'!è^+UÅÌx, [?ãÌ.ÐpÞú?hX½W1 ã&üfX´p)ÓÆÁ·*,ÍÍÍ»¨ÝpôÉj°¹¬phRò= 5¥jËrWê¦|´']¸¿ðÿX%Ôjçc0Ãbz	¶bÈ·çØs:î#:/oÍ×Üp	L]Ïß*g)M¡¢ãyIË×ðÛÕlß´u\ÍJ¨+±cÄ3e\rü,4b¶c= ßBU|iÖ¨áËè8Pôq,Ñ|TÇr³¤I[ÐôÜãËs|úa{U8RÌÉc³¨DNÐ)qøR\LÙãyn[ ]o¥bõMÜaììtIüßâ÷´(æÏéX<8jû^ZÏ.02´ªÖv¾ïïÞ¼ Æ·>U·UÑÆÄ¸%NUÃbñÝV¥O7óôÌDÄ#×4%º¯ò ®ÜªÍÊÊ+íQcÕ^Ìv©ÚRv}eòíÇ}=}Ç ä
¡´VÎv½8}1ÔÌ
"ã¸pôÖj= ï3µqËrÝÜï ðÐ á&weéª¶.©,aòK>ÎoxõeCÿÐé,ìÄMm÷ |êÎÆÝï=}"	G&up´%JMÏáøùÏ0,ê7§"v~gYZØ{Æ]13GM¦Û¤O1= £¼b~Ý¿¿rÏsHå)d"3,|\ëSý¹ÇFZì|xë)isæµ
êCÇl§ irºÓaXß
¥KÏfWP¯ãês²ÑþÑßÿfzû¿ºÝrÉÇì±êüCAËôc|ÄÇé	ªqvÎÂõ?ñB©@mw=MSòTvÙÓ¤»bû-ÐÀFFòÝÿ_ß¡¸Ã_+ún9×ËPH¦Òa:$MVwy4èàÕj [®ý´°}I'ùéJÿÑÁ§oùº¥ÖJÝëÐ) £q:Í'oØXÊÃÕÛn
ÝçöI!]X8¤Ï­aÿ9½8'Ëu\Á=}«ÇãOíZ¯ó@¬tû¥	ÀVî=Mu6Ö­"K ¦Õ+$Mü[Y·^Ó³æõÅ¯Ô¹Ê8L½8d.À	r÷ZbNGT¡WôT~«ë8ÕS¼ZÇHÖËcÑáesÏ²ë1êÀW\kô?q³ 3Ø$hñ¾!ÏWÄö+·O4ûC\ªÝï¸mXëNÚ$®ªØoYc/Øö4ê?ñW¾±ë&H<ç'TGÄ«ÝÛ'à(­Á/aJILAFûÚbY2ß¯BUíEî)Ôr5Òðê|å<Æ(%È1»y¦ð>é±EQ±Dæv6éuWvYpÏ£].,ÑÂq9PÞ3ÂéQ¢ácKÑ¸ÖàTØÌ0tøé!×	O¬ÿú¯¶´íºr9ð°³º~èW	Ò¾×õÛXïâ1xgüb÷wuÏ/¥ê4°ÕÚÌ?D ÊoG/ÞÝî¸Ôè£T$áQa¤$øã	|9>cý%Yhç¶-qPo¦ü vF*ÏððVìZ4ºµ^Ä9RVÚ¾0$\é|UøD$PËµÑ±Ã§ ìÛè«ôç­¿ÊÞÔÇèë1ëohè7ÊZYc&<£ßcóI¡×öê¹vl{í +E=Mr/Oãn¾Ç»Õ0^ø>âÉ­n®ßR+íG§¡)!Pbñ~îXb	-C¿û°k
lm®¸Ëè(¾Ê#è£ÎØ"SÂ7feLMVk±*w[¦ëz\e;íÅOZ°»Ùç×qHwçíugZ*óèÔ(·fg}¬óÂÒQX¿íVíëÿD Ôue¨7WÎZ ÃÎ;:ÂÒäLNhIjh+ÖÑ4ãÅþ,èDSü¬4k\D'+1~LDËs#(¥[ðB¶pÏ X æ¨¸Ã$zÕ[Â]©áÝ¤Êõê°ÌäRÆWÏ"]xyu £elÉÇ¶®Íd¸s\m®¢ôIðÖR½2ÏY[+P+q¾f0@zU#îlÛé¼St3÷LÊÕ :B8Ã]ðãÏAÒxÕDÀL´ÑðqG¡vÑèÃ§<¾æ+i©ÑÂéíxbçç£BØ¼xF£×·3 ÖÅ7Ïº¹¹¹'IfÖÔ QÀoÆzßßÌºho¸ØÂäÑZ¼ ¡´úìL vÇw»ÇT:WdHí°ß°ªº'õ¯vGe«-IâÇòÇØx7¤ iHl8§ì½@Ã(¡ö%þ¨[L~ä<¾o× ¢arN[<öD«¨µ&pNMîy3©Á'w¬2É±T_Ñ²-ç£[Wb1OoÞ4C«wWo"-#yHÑ¤e¯þ°_M°älCò87µDt®üâKøzäS9Â«¾¦&~^H¸üà>ÿØX¨Vÿ1¸HBw/ó"-æ£\H°]°rTÝ±-â£Eé-ÓÉÕ|ðUÅ¥oSÜFù6©¾Ð 	;}O*¦K«ÞvJÆTéüwOTX= gmMãTLÚd¤ (£7x'\Mèõõk¯Üät¿®(ÊÚy6hV6.Zü;Õ¥éüà¾.løÒÈ¹¾¥T&®y¥ÿæ °à¡æQW= rç®ckM¾b<§6¤=}4ç= çyc 0ØÊ~´¨Ý_ªBiÇ?z¼u\;¢Hí®z vßÂ[ÃÔeÏb[D î69§Ô©vM®4Ì7¦ïÈ%ÃÁ£dÐ÷49óê,o¿í¼­óDST´-èÞ®Tðü-0©©·À>®y¿*Ö%ûÕÌ¶:ÜMç¾-"4ÞÆÔ:TEØÕ±u6×ïôC,ÞÂ[ó}®ÌäÄÌ§«Þ¾ý>0õ§ ª¶à%+¶ÒË;þ¶F@ÈÀØPèhQmT­ìâ!ð-X|¸pIÄkvö«ÃÖ2
¾#zä"XÕ=MÉë'fL/÷m²Q%15tªUIO>¨!= C-æ£[Ã"X%a´ÞÎ3\(ý«Þ¯Ø«XçO¢vÁ²x'kMPáAAâlfÇOÐ³|EÉð®cuM._ÌGÁÊ= ð¤ÿmð,Ââ£¶B¥ÂÇÑÚMkyò[S]âðTïo2t^©[õè.±
ì0¥ÓS)¾M£y¥'OHOÆR5IÇÌ¯Újç®cómÞ.·Â»2u=M:i®Ø{q"0æLU«AfH(G3±K,ùvÂ[#ûÀ³ÉyJ>Ä mî,Â[K·APÛ×ÎËÆÉl{+«Þ.ÇW°;ïÇ'voßöÂëN°Kgrï~ÕR
¾©¶ÞÃÊ7ÔÀ]Ä(@Ìð®c÷mÞ®Òí>Wp7³ÌhIvR
.lÇG©8Ào~Æ= WÞW,Ï|¥z3
.[óÞÎq*N´vÑbÄZ£évÜ$)T9ïÀ³Àº¯Ôd#âõ=M)høsÜÓ-VxÂ¬uSèöAíbÛ#= KÌÊìÒÆÁj§ZDÐ×Ú¿â1ï×Ë-Ñ$VâÅåW;C&bëá´>M]èi²à1ð)¨h¶XpY?áÃ*ñõ©FC/¢RN&ÚÕÒc]OC=M¹ßøP(¿æ¥ ÅN, T]¬ùø§ §ó= ¯øLÜ<æô?S¬oÁldhùÀ¹t6#lCª¾\Ãô_?ÅÌ= T.tKHÞ¾îv²tA43nZâ&ÅH÷)¿YyõØ|ÇÝªÔ§·ÛS0yÃ&;8wÎÃÿ¡ÿ¬<o\yÓ0Gÿ¢´öà,ÃjêNû6)R%;¬LÁOð6tQPe©á N=M~9­ÞÍ=MÂLq+.v÷îï-w2ÿSRÿöb¦<´}2)´{¯Ò2aÄÍÅQk[÷îè£¶B¦Á4SxÄ¦Å(,«ÝóIf@Ng|]WöIzäCÎtðOô´«¼sÖMóC)ï-Ë9à~x5)? tR).&¦hºðªc"Õç=M¥lên\= Þ®=M6í¢½{òX¦5x+«þs×½B©þmÒÂdMµÁ[#/@Î÷m= ?=Mi^?ØÇÙ¾ %6.¦s= ÷ÓEXs»Gy¥êÔO5kûø.Á%ieX\\?áÃªÓÎÊÛ_íîÂ%àâAÝÕUéfØgçN¨+^ÖK>H°îz=}xZV%{ÐÐë Þæ²ñöSQ}P#Ì£®\CoòcªÂC*
ÁÒ,\yëD·ÐÊpj
E¼~"HÑ%{ã)÷->¯Cy¿ssxX= «ÿ¶<ÆÌ¸.à5f,Ý.¤jên[?áÃJÈ¢ªh0jÔsäDÓí>³ï¿q4zèð&= ÕÛyªíÿóé¬Ô vÆ8Áím;É¡a5ÜSÒ#¿£a7ñy3©ðI¢gNÈ©ºÍíYy8gí h?ªÛhxEXyjA+Å©q@M6Ó¶@XBj©. O:§PXXrt&À©Þ.¶v<¦{è¾ÔOØmámÞ.q÷Ë%Á¥ =MÄêZC)÷-kF½Aìq§DeLÛ>[CXgâÄwgCÄ>,ÞÂ[ÑvÍ|öuÃ&d M}ä3	
 >{ò&«ÎC)Óü6©wB5zòÆÂ/T^Z&v!)NÀ<ïílE]ßM¨yäCñÉRÞn¡ì·3xðmîM<¥Üv[Çç¸¼ë3¢&ÀöÀ½ºXåcZßÛíøù(¡yñ÷Ù)Ù>}~
	{	ùÙÞÛaÙÛøiÍä® ÝÔÜà À Ëqbå¿ûàÑ[ëSµË×¼H\¢ãHPÊïV&H«$ÓjÔvuwÖhx¡ÞP>¹8è·ú= EìA¼0Õ%Ç9ubÊ[4çáJî;±ï»
ÿJÃS¬=}òeô@µ	åÛªÕ+v5fëÿá=Më#s7ÑØÁ}ÆJx2¥ÈW&wW×N¿U÷+­"Õ=Mb·ÿ¯ [¨|Oä½iÐý/qYO$3¬Þã<DZþóä¥³wÞà3= T*ërÆ¼c=}.:0]àñÉ¸HAàDH²"üÝduÝ½Y³¦RÕÝ¡Ê0È@ýyÜfäù[õ´íjâ"cI á±©r3üQ7Â¡ñ<twæoRÇJ2
w29¯a(.|E¬pÞò3­u]eYÂìà¿¶å\ö~#t;·1åäYùåÞãw¶< þfkl@ä1aM<ÿZ!óM±«Bù¶¾ýFBÅukÑL(èR}5g"Ü9ÍöäÑWeºð_}^Dû"À(1pÌ$EýSæµËl{MË¥D©M2¥æÓöÔ]âÈ½röOpÐLWûVFHlÒÕ(åd½Ô¯hõbÜÁRrÊÁeß´Urø+¸#Ñ(dX?åíSqñÀR§=MTz7k.tËH|\µãþhËËÖ/ÐÊ<õ:4\ÑºÑgR°¥ñHóc»<µ= /ªtÇ¡Õ»?-à¼Qw= ¿@ñÄî <=}öØËÉßg.{§1q´= JXè iK0¬A4]öÅÍnú±s}²*ñ?PûGKpÆ
eòÐ-M-W¥cnj1*5 ÷U¶¤ËRsQÐ°ªP;ç÷ð¹±\= ¸*mL1¤Yt-bxüë²æS%íX¨. UFõïiL¨=u½A­e÷Ë1Ô0dNáLõQug~ 0g6-Ñ¾DfªS­#xdð®Ì¡f6´ðÛÓÿ§tä#Ø?Üÿ¿=}Õ1fpPääÌ)Wì¡VÍ-»}Ú,vàaM?= /ð6Ê:µ4^mØôwÆ±Fv¼xdÉ÷ªË¦å¥"Å¢G½Þpº9ZÈsêUt¥·¥V´¨sNß%(3@ä2?Óq
*ZÔe&Ã@ht0V
ØþYyjödÖh$i$=}w©SiGþN!~µ|«íZ´Geoé9.®Òiæ°¨YÁÙèåj7Ôkº= ¬zMaêæõAÓayÏ ×ÇÌºÄGVnûU%ÝîàjxI\"àáé$ÓUP½H79N1þÇ£ã%K¿)ËBõ8¨c¸¯zÐÔßÜRìê¦0WìÉê.c_ÿà´Ý ç÷« ­-räÒíu«ëõªJ¥E%÷ÓÊO¡WµÃ¬õRkk dÒ»r]¤s5éÂº=}ë@LP´ïs Ï^(ÄGB ò|÷Áfª/B­£JGrgËó>OØSmfàøKälÿ-ùÌ¢÷út= !g= ÂÁ¦½AÌ§_ì¸2ÄÁ¢õ¢{Å~F¡ù,Axé©óaÅz¦e'F5ÝÜcà9!kPà,5d®lîPÓK ó\a:Ñ= y}°qè]ùsÐsÊ¶3á>h¨OÒ]Vñ¬·¹½l&Ô¯|WSó5!ía4ZÞ%°º7ØA¯÷n½VÇ@³ðï
*fâÞU6ry~­arEª%<§n#=} ÙÀ£æ¡ö$J=M|MUr©Ôr~ú{jg¢Ì^B³¦CC°j=}7~k÷ïö»o6_Í9ðnzO~¬XY¢³³9= 
R!4;;5ÃXB»ÉY|~Ü!^PlÇ|a&¡@°äÌVº138¥:fÝ%?vJÛôÎ¸û1sY£{tÍ¦=}lNãÐër}f¶ÁtÇ|âíF«Ï|À´N4÷B^LP½õÎ¢êë4.ô×D³Ñ;Sj3xSîÁÕçvµÂK¿ÍR¡ÀK>bÿ=} ju5lª!¤¾· dJ¢&VÀþÝ=}Á¡l¼Ô¤:Û´Xë1¥ä0 çzÆLY¼åxÑð+³¼	.¥xæþÈÊt,§³Cy-ô D)ÅïºouÚ$¥pLÔìcÎÒmæl>90ÀïÅ8f^ãÏÑJUg(a¶[¦C¥Vq= #8[?q¹UL0J"2nÊRâÏÙjä>ØÛ¢X
RmèzKEC¡Õ1G5h[ÂKÂ|÷¨«0i3¶¾ñÈàRü*ý
4p¼Õês=}m7 #AôoJ"ÇZ¤ñÉl[Ì±E;v%ãtPúÐq ;ñî¢mæz¥°%ûåúvDÑ «	XÝàÖ¶n$²(EwaJg]5¦¹SÒöñ:Çh÷»£1£Npv ô±Öv NXÊ?èè»3A.ûúãöèX7Htù^s#Eî ¦0Ëâp3½&rCÑZ²³Óq0xSÑøæ©|gÖ@o×"æØSõcdç°ëÛè¬ü?7ª¾õ³= µvºp¿-}èPLÌOúREº²Îõ5¥$¨VõBâ;cXa&¤ÿ[ê«û5¿£ÉITAÎ+¾È/[ääg÷kpûC-B"
ÿ ¾ÿ¦æ,êám<¢=}fÜbFS§|ÒÞÇ&4¿¥óñwg\¾¥X2·É< nwhPj8WôÞæL­ðñÎ×ñs¡hNç¥G:4gøô<±Úò|ç£Dø
"cràËh;°MWT=MßH§9×ì¤c¾×¬h
FyLÈE(ì«FªU¥PÌ­}qA(Ì¹ó½?PkObÞ±Éq¯<
u¸7§ÿØÈñhö»¾È2Ý-Lúºöñ"¼(âNÃ7 >#Û°!VîÔ
D·dPÚÌÆäG¹×À;sðyTz\g®{bÆTVWwÄ?ÈÜµFì¥_ªÀ¤æ1]7zê6øf®ÝX¤Ìè1ÔpXò>ÏCOßêÊVÐCq/¬%Ô/°ÑLµ[Þ×3¡×÷MÌì¡ÕÃghÅ%å£Ýái¦HÝk+Ö[pÆÇ-D/û
Ñg%âÓ£+/]8|<ëâ4iÅ×B Jê»}! ;°ý]èñ7q¨qçÕBbp ûîlÕÂýÒPJÀÙý°ïßºÄÊ
gF @HE´F´F4FtD6ÉÕ«NØL¨±MS:¬-A¬íïÞpîÁXÔëÿ¸= YEÇÀõåqèÆ8§*¶ªXÄ¡-ì^l°ÙMq#invOVú xj=M®ºHöbÛ-³[öÌÎv3ÑÌ¤õN¤vÁsôõèáf¡¢÷G(³àOÏxæmþ2¯¶ªâ¶7­dìòÿ°ÍºokPÁs»´c^È=}C½uíüSEÒei\­4°'óSuGîËM¯R>*z³96¡S_¾eP= OmaÁw­«Ìû]íü+¥¢?ÖV£Ï= üû¦*6n¼N$	&ïlû¨C5ÒÏãÉðÖÖ¡·±ýLg¾±ù¿0²Uúh¤*J2ÀÜ»ª¿.Ê®Lèçí°åþ«x°¹Åûªza÷ð$Óª¹ û:'Asr|aÓ·AË1uÁÍ]N|Úv¨bÇ= ¦FïU2V"$xj¶dÑ/+H&¨ÒdÊ2ÉII	PRìA¡ð¸½8Æ¼ââ·sùÓ÷ó©Ð¹ó©ZÇ[}JÁV²özÜ-É¿=MPi.èÒLkïKï³3Y;~ÁûÇÿÚYôäY;~Ptw=}¿Ç4&y1q
Üíéiié¡Ì"óÖpª°¼ xÀ}½ 6;ÐèÝ èy1Âf¥%Ù½BÅø.×y1ñãÙ/GòÑý$¯E²L½mÌð1É !t= pÐpâøf/ñ&?8ØYy¹i©	d®?P6XØÖ»ÊJÌ-T\{§OufO~Ã´Z8K$ÇÜyúR{ße¢Z\þ]ÀyÈ½¶1ÐùS2"«[Pcx'÷I@>×,l?t£Ùüÿ;ÿhÑlÙë![!	Úîb_]êäëôìàJë°RÕ¢UkÒ}½lV¢  W¡Õ:Ð,Öb¶ØÒa¯_2+p=MþDä¹çÒæ7w¬W "àù231[Êÿöî½^Å7øÁì`});

  var HEAPU8, HEAPU32, wasmMemory;

  function updateMemoryViews() {
   var b = wasmMemory.buffer;
   HEAPU8 = new Uint8Array(b);
   HEAPU32 = new Uint32Array(b);
  }

  /** @type {function(...*):?} */ function _INT123_compat_close() {
   abort("missing function: INT123_compat_close");
  }

  _INT123_compat_close.stub = true;

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
   /** @export */ a: _INT123_compat_close,
   /** @export */ b: _emscripten_memcpy_js,
   /** @export */ f: _emscripten_resize_heap,
   /** @export */ d: _fd_close,
   /** @export */ c: _fd_read,
   /** @export */ g: _fd_seek,
   /** @export */ e: _fd_write
  };

  function initRuntime(wasmExports) {
   wasmExports["i"]();
  }

  var imports = {
   "a": wasmImports
  };

  var _malloc, _free, _mpeg_frame_decoder_create, _mpeg_decoder_feed, _mpeg_decoder_read, _mpeg_frame_decoder_destroy;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      const wasmExports = instance.exports;
   _malloc = wasmExports["j"];
   _free = wasmExports["k"];
   _mpeg_frame_decoder_create = wasmExports["m"];
   _mpeg_decoder_feed = wasmExports["n"];
   _mpeg_decoder_read = wasmExports["o"];
   _mpeg_frame_decoder_destroy = wasmExports["p"];
   wasmMemory = wasmExports["h"];
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
   this.mpeg_decoder_feed = _mpeg_decoder_feed;
   this.mpeg_decoder_read = _mpeg_decoder_read;
   this.mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
   this.mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
  });
  return this;
  };}

  function MPEGDecoder(options = {}) {
    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon()
        .instantiate(this._EmscriptenWASM, this._module)
        .then((common) => {
          this._common = common;

          this._sampleRate = 0;
          this._inputBytes = 0;
          this._outputSamples = 0;
          this._frameNumber = 0;

          this._input = this._common.allocateTypedArray(
            this._inputSize,
            Uint8Array,
          );

          this._output = this._common.allocateTypedArray(
            this._outputSize,
            Float32Array,
          );

          const decoderPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecodedPtr = this._common.allocateTypedArray(
            1,
            Uint32Array,
          );
          this._sampleRatePtr = this._common.allocateTypedArray(1, Uint32Array);
          this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);

          const error = this._common.wasm.mpeg_frame_decoder_create(
            decoderPtr.ptr,
            options.enableGapless === false ? 0 : 1, // default to enabled
          );

          if (error) {
            throw Error(this._getErrorMessage(error));
          }

          this._decoder = decoderPtr.buf[0];
        });
    };

    Object.defineProperty(this, "ready", {
      enumerable: true,
      get: () => this._ready,
    });

    this._getErrorMessage = (error) =>
      error + " " + this._common.codeToString(this._errorStringPtr.buf[0]);

    // async
    this.reset = () => {
      this.free();
      return this._init();
    };

    this.free = () => {
      this._common.wasm.mpeg_frame_decoder_destroy(this._decoder);
      this._common.wasm.free(this._decoder);

      this._common.free();
    };

    this.decode = (data) => {
      let output = [],
        errors = [],
        samples = 0;

      if (!(data instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof data,
        );

      feed: for (
        let dataOffset = 0, dataChunkLength = 0;
        dataOffset < data.length;
        dataOffset += dataChunkLength
      ) {
        const dataChunk = data.subarray(dataOffset, this._input.len + dataOffset);
        dataChunkLength = dataChunk.length;
        this._inputBytes += dataChunkLength;

        this._input.buf.set(dataChunk);

        // feed data in chunks as large as the input buffer
        let error = this._common.wasm.mpeg_decoder_feed(
          this._decoder,
          this._input.ptr,
          dataChunkLength,
        );

        if (error === -10) {
          continue feed; // MPG123_NEED_MORE
        }

        // decode data in chunks as large as the input buffer
        read: while (true) {
          this._samplesDecodedPtr.buf[0] = 0;

          error = this._common.wasm.mpeg_decoder_read(
            this._decoder,
            this._output.ptr,
            this._output.len,
            this._samplesDecodedPtr.ptr,
            this._sampleRatePtr.ptr,
            this._errorStringPtr.ptr,
          );

          const samplesDecoded = this._samplesDecodedPtr.buf[0];
          this._outputSamples += samplesDecoded;

          if (samplesDecoded) {
            samples += samplesDecoded;
            output.push([
              this._output.buf.slice(0, samplesDecoded),
              this._output.buf.slice(samplesDecoded, samplesDecoded * 2),
            ]);
          }

          if (error == -11) {
            continue read; // MPG123_NEW_FORMAT, usually the start of a new stream
          } else if (error === -10) {
            continue feed; // MPG123_NEED_MORE
          } else if (error) {
            const message = this._getErrorMessage(error);
            console.error("mpg123-decoder: " + message);

            this._common.addError(
              errors,
              message,
              0,
              this._frameNumber,
              this._inputBytes,
              this._outputSamples,
            );
          }
        }
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        output,
        2,
        samples,
        this._sampleRatePtr.buf[0],
      );
    };

    this.decodeFrame = (mpegFrame) => {
      const decoded = this.decode(mpegFrame);
      this._frameNumber++;
      return decoded;
    };

    this.decodeFrames = (mpegFrames) => {
      let output = [],
        errors = [],
        samples = 0,
        i = 0;

      while (i < mpegFrames.length) {
        const decoded = this.decodeFrame(mpegFrames[i++]);

        output.push(decoded.channelData);
        errors = errors.concat(decoded.errors);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        output,
        2,
        samples,
        this._sampleRatePtr.buf[0],
      );
    };

    // constructor

    // injects dependencies when running as a web worker
    this._isWebWorker = MPEGDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      MPEGDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = MPEGDecoder.EmscriptenWASM || EmscriptenWASM;
    this._module = MPEGDecoder.module;

    this._inputSize = 2 ** 16;
    this._outputSize = 2889 * 16 * 2;

    this._ready = this._init();

    return this;
  }

  class MPEGDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "mpg123-decoder", MPEGDecoder, EmscriptenWASM);
    }

    async decode(data) {
      return this.postToDecoder("decode", data);
    }

    async decodeFrame(data) {
      return this.postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this.postToDecoder("decodeFrames", data);
    }
  }

  assignNames(MPEGDecoder, "MPEGDecoder");
  assignNames(MPEGDecoderWebWorker, "MPEGDecoderWebWorker");

  exports.MPEGDecoder = MPEGDecoder;
  exports.MPEGDecoderWebWorker = MPEGDecoderWebWorker;

}));
