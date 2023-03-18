(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-opus-decoder"] = {}, global.Worker));
})(this, (function (exports, NodeWorker) { 'use strict';

  function WASMAudioDecoderCommon(decoderInstance) {
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
                  wasmString
                ).then((data) => WebAssembly.compile(data));
              } else {
                module = WebAssembly.compile(
                  WASMAudioDecoderCommon.decodeDynString(wasmString)
                );
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
            bitDepth
          ) {
            let channelData = [],
              i,
              j;

            for (i = 0; i < channelsDecoded; i++) {
              const channel = [];
              for (j = 0; j < input.length; ) channel.push(input[j++][i] || []);
              channelData.push(
                WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded)
              );
            }

            return WASMAudioDecoderCommon.getDecodedAudio(
              errors,
              channelData,
              samplesDecoded,
              sampleRate,
              bitDepth
            );
          },
        },

        /*
         ******************
         * Compression Code
         ******************
         */

        decodeDynString: {
          value(source) {
            const output = new uint8Array(source.length);
            const offset = parseInt(source.substring(11, 13), 16);
            const offsetReverse = 256 - offset;

            let escaped = false,
              byteIndex = 0,
              byte,
              i = 13;

            while (i < source.length) {
              byte = source.charCodeAt(i++);

              if (byte === 61 && !escaped) {
                escaped = true;
                continue;
              }

              if (escaped) {
                escaped = false;
                byte -= 64;
              }

              output[byteIndex++] =
                byte < offset && byte > 0 ? byte + offsetReverse : byte - offset;
            }

            return output.subarray(0, byteIndex);
          },
        },

        inflateDynEncodeString: {
          value(source) {
            source = WASMAudioDecoderCommon.decodeDynString(source);

            return new Promise((resolve) => {
              // prettier-ignore
              const puffString = String.raw`dynEncode0014u*ttt$#U¤¤U¤¤3yzzss|yusvuyÚ&4<054<,5T44^T44<(6U~J(44< ~A544U~6J0444545 444J0444J,4U4UÒ7U454U4Z4U4U^/6545T4T44BU~64CU~O4U54U~5 U5T4B4Z!4U~5U5U5T4U~6U4ZTU5U5T44~4O4U2ZTU5T44Z!4B6T44U~64B6U~O44U~4O4U~54U~5 44~C4~54U~5 44~5454U4B6Ub!444~UO4U~5 U54U4ZTU#44U$464<4~B6^4<444~U~B4U~54U544~544~U5 µUä#UJUè#5TT4U0ZTTUX5U5T4T4Uà#~4OU4U $~C4~54U~5 T44$6U\!TTT4UaT4<6T4<64<Z!44~4N4<U~5 4UZ!4U±_TU#44UU6UÔ~B$544$6U\!4U6U¤#~B44Uä#~B$~64<6_TU#444U~B~6~54<Y!44<_!T4Y!4<64~444~AN44<U~6J4U5 44J4U[!U#44UO4U~54U~5 U54 7U6844J44J 4UJ4UJ04VK(44<J44<J$4U´~54U~5 4U¤~5!TTT4U$5"U5TTTTTTT4U$"4VK,U54<(6U~64<$6_!4< 64~6A54A544U~6#J(U54A4U[!44J(44#~A4U6UUU[!4464~64_!4<64~54<6T4<4]TU5 T4Y!44~44~AN4U~54U~54U5 44J(44J UÄA!U5U#UôJU"UÔJU#UÔ"JU#U´"JT4U´ZTU5T4UôZTU5T4UDZTU5T4U$[T44~UO4U~5 UÔUô4U~U´$.U5T4UP[T4U~4~UO4U~5 U#<U#<4U~U2$.UÄUN 44 ~UO4U~5 44!~UO4U~5 4U~4~UO4U~5 44J44J(U5 44U¤~J@44Uä~J<44UD~J844U~J44U$54U$5U54U$54U1^4U1^!4U~54U~5U54U~6U4U^/65T4T4U$54U~4BU~4O4U54U~5 UU'464U'_/54UU~5T4T4U~4BU~UO4U54U~5 U54Uä~4U¤~4U~U'$!44~5U5T44\T44U<~$6U\!4U#aT4U~4U~4O4U~5 U5U5U5TTT4U$"4YTU5 4U4~C5U5 U5U5444$4~64~\TU5 4U~4U~5T4Y!44O4U~54U~54U5 4CYTU5 4Uä~4U¤~4U~4$6TU54U\!44Bæ4Bä~[!4U~4UD~4U~4U~4$6TU54U\!44B4B~[!44U<~4U4~$5 4U"U#$544"Y!454U^!44<J44<(J454U~84­UN!#%'+/37?GOWgw·×÷Uä;U9$%& !"#`;

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
                    true
                  );

                  // destination data fills in the rest of the heap
                  puff(heapPos, destLengthPtr, sourcePtr, sourceLengthPtr);

                  resolve(
                    dataArray.slice(
                      heapPos,
                      heapPos + heapView.getInt32(destLengthPtr, true)
                    )
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
            i++ * samplesDecoded + samplesDecoded
          )
        );

      return output;
    };

    this.allocateTypedArray = (len, TypedArray, setPointer = true) => {
      const ptr = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * len);
      if (setPointer) this._pointers.add(ptr);

      return {
        ptr: ptr,
        len: len,
        buf: new TypedArray(this._wasm.HEAP, ptr, len),
      };
    };

    this.free = () => {
      this._pointers.forEach((ptr) => {
        this._wasm._free(ptr);
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

    this.addError = (errors, message, frameLength) => {
      errors.push({
        message: message,
        frameLength: frameLength,
        frameNumber: decoderInstance._frameNumber,
        inputBytes: decoderInstance._inputBytes,
        outputSamples: decoderInstance._outputSamples,
      });
    };

    this.instantiate = () => {
      const _module = decoderInstance._module;
      const _EmscriptenWASM = decoderInstance._EmscriptenWASM;
      const _inputSize = decoderInstance._inputSize;
      const _outputChannels = decoderInstance._outputChannels;
      const _outputChannelSize = decoderInstance._outputChannelSize;

      if (_module) WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);

      this._wasm = new _EmscriptenWASM(WASMAudioDecoderCommon).instantiate();
      this._pointers = new Set();

      return this._wasm.ready.then(() => {
        if (_inputSize)
          decoderInstance._input = this.allocateTypedArray(
            _inputSize,
            uint8Array
          );

        // output buffer
        if (_outputChannelSize)
          decoderInstance._output = this.allocateTypedArray(
            _outputChannels * _outputChannelSize,
            float32Array
          );

        decoderInstance._inputBytes = 0;
        decoderInstance._outputSamples = 0;
        decoderInstance._frameNumber = 0;

        return this;
      });
    };
  }

  const getWorker = () => globalThis.Worker || NodeWorker;

  class WASMAudioDecoderWorker extends getWorker() {
    constructor(options, name, Decoder, EmscriptenWASM) {
      if (!WASMAudioDecoderCommon.modules) new WASMAudioDecoderCommon();

      let source = WASMAudioDecoderCommon.modules.get(Decoder);

      if (!source) {
        const webworkerSourceCode =
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
                    : new Uint8Array(data)
                )
              );
              // The "transferList" parameter transfers ownership of channel data to main thread,
              // which avoids copying memory.
              transferList = messagePayload.channelData
                ? messagePayload.channelData.map((channel) => channel.buffer)
                : [];
            }

            messagePromise.then(() =>
              self.postMessage(messagePayload, transferList)
            );
          };
        }).toString()})(${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

        const type = "text/javascript";

        try {
          // browser
          source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
        } catch {
          // nodejs
          source = `data:${type};base64,${Buffer.from(
          webworkerSourceCode
        ).toString("base64")}`;
        }

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
        this._postToDecoder("init", { module, options });
      });
    }

    async _postToDecoder(command, data) {
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
      return this._postToDecoder("ready");
    }

    async free() {
      await this._postToDecoder("free").finally(() => {
        this.terminate();
      });
    }

    async reset() {
      await this._postToDecoder("reset");
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

  function abort(what) {
   throw what;
  }

  for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
   base64ReverseLookup[48 + i] = 52 + i;
   base64ReverseLookup[65 + i] = i;
   base64ReverseLookup[97 + i] = 26 + i;
  }

  base64ReverseLookup[43] = 62;

  base64ReverseLookup[47] = 63;

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode006aÞú?ë?ª~ðiýUì¥6wX¨"%X(e"|Rñ:owZô¶Üú?26áÆ:!¯jRWYO=MÁb
Ü ©ò²ï;ÏÐ/=}ÃwP.¯:|X55RODÔP×ïÂcgzI= *@´³|{ Îßá ¿êa_»Ô[V8kÚ¦qKÎâ2£kBÒ¥kÙmÿTnÁ´tHHB7òÍàXÜ¿ÚÃ~ÿ$µûz/Ër¾¿"Ä·|WH¡{V¿7|ûµò$<ÿ¬§ddguA´wÒ­ìË/-r÷ÍþÚîs?9©ÏRýüÎç>yd:-ýQ VaÒ?*MK¬%Z²PS-Æ\RÚÔÁÛ&NÑ¹QëEò»ùÒ&­MÿÜ@
ÒÿÁw>Ôý¦Äµ_»»{_dRKâTHÊ£¸l-²m»£ÚC"Ø>xF Dâ;H*å÷xp¨ÒNmå=MÍëùtæ4RÆJÝ°lÉ$b;7*¡÷Xp(US;-óæâVG%æÒ@ywÄ=}§§¼Eêø;¹´S¿Õ5Oó¾IÖ#³$wLEÊ#wÃÉO¡MÈ!¯GüäN^.Ý9úWFb¤x¤OÆEýÛÊÁG01)/1JQÏP16R©ýaeT²d­%©´¿x?¡m:â5g*^y~é öyêVªmýàñóë³ûØ¿m¾Ý*/BÜ4Êpo=Me²ºI»[ç»Ìù-¿ê³ÙjK6ã l×¬±µjHÒÛîpõm{joö1= zMâ,Ùp]m¼SpV:(ÌxyÞïq4óëAÓ^4Zâyâ¶×Ô×´jAgÿ(áYá2b¥à-xÐÊ¯>Bq÷XZOJ[+×Ô×Ü×²ÆjÂ,ßAEGäðh4mG²ÚÊ-äRïFñ,eÜöqóFGl+0ª(Êñ:Ã¦fBMFA0OßÌí¬sÐHx[*IZ¥cy¾Î(iÌî@wÒ$b¶xYy
¥B^Ü­·Xí·~§aàiJ)c Ê /íÛ¢ø0Myt©fÏÛö1-Û~âh¦±-»¿jajk*<X³M:1ËB¾vh5É0mB.Pÿ=M!Ç_ú= àZJÁñÙ!t= È°tÅ cUËxúØ®|U[+ð2®qsí&kEÔngÂP 9"ÃúE#.Gká;aÍ+&µWCÛ©~08÷³R_åN ³«÷«.¬s
ÙH&cÛlHU	ÄBº< ¶"zZ×î¶ÿA¶H|Ó?¶bwºTQ@5+ÅÌðÌòHàåm@Y÷þKÅujÇKd|sÍÞG*ö=ML¥ÚR§XÃ\&Ø½ù6«[·²À©X¬N7Öû'×yh|f«	-â%ÚatWLà;àoXðü|X?[s1O>¾èyOÒo~eB8ÌÈ0¬vwY#ÇaÃS<R1e×BÙû~F@¬G@ÂçýâÈ1¼WC<ïÊõ~ÉÐÍø^¾µ³ääG-îsÏÂyÏm\üV3rWÀûÛñEÐwêù²Ë|¼ EÆÂÜt9­K«ðÄkî1Ê»tÏçªZÔ
]nÀsOùzEZÈZvÂk8RáÁRh*pÐróÉÐM#§lÇ#0'ÙáÐ=}·ØÈsyÖí¯s½xÞìH¢¡Pq«´îÅ´:â9v[¾eXí»Úûcêd²<#êÿ¹JÉ;MvæG/0þ>ÔØo+¹òy ²5Ù³àciùÉ±>bÎ"êù¡=}Å ¶¹& üëI0WÔI_*.xÞi}¼³ÎLz(!Îù§3åÆLXâ}WAÞP3w>é°±ô¾£;h£Zm¶²+ª Z½Â3Ù½HÞ/ÜZJ§ábTKâ F^ã)!ç»ÃÜI
"IuF<P­rwp6·½fñ´}¿ÅE+µBk­r=}"ó×\l+E|ôq-r§è°%r¡å|I¶0± ·ìq+ðûé_Ó'°ùcÈí²B óÊRoªì-²? Bëyæ¸kóré r¥©{:ò9êDgÈ¢èáyyïÌÎÐ1ÞõÃz7jÃðåâdÅÐ.PY,Á6®­Oûï¾é¥Î"n%­ÄôYwTµà¾©»E­íP¼ P¶  tèB04G³å,~ûÌÐ+'N«Ï4jXë©¬5Dm;»6\ûQ¢RùÍ!HÚ[P[ÊZÂ½ÙûÉÒr{ýé= Øº¿aÞ2¬uujx¥ cQ¿ [Q Î½ÆâI'J>.HñGsÝú´W9¶¸d#I¼ÜEBÞANï¨ùb/E§Ø<¸O6 ¾öpÆ¶ iñü¢ä!7CED~ýbW
q$æ#y+~ªú3Øý,À|ºu³{ØæÛ=Mh
)ÿ&íÍWAð2Ë_{Täé¹üÐ2l«NÆ¹ÍRë·¶^Î\í¬&@=}lmõæx«¼¼ÊîÊÖI<p= ?,°¥'£­°)ØÔÌ½U îù6·ýxÔ¤®ýW$fpD+kV®ÞûêZOÉO:{d¢ÃXâì7ªWý°ýdswvFêy·÷#ÆÝþ7ERþgfËoMäÔ°×?ÔGq§w{Ë£¶÷bUdðd»ö	ò=Móï¤:±¼,Û¿n7³÷
ÒÁ9 !)"°ü9ãh)S/µ!6Þ]\É±eaçf)K|¼ éjÞMðÄZX§ÏöôÃ^Ü;Ä2Y3T)$×øì\Ï1YDºO¬þ£´m= bWùÕ¯Áh¤ç|= ñ>ØèªË­|®Ì­Lb%Õ!_£Õ!ÙÍürì®Ú©­ô¾ûº:Ylë~ÎuDHz[ äe ªÔZÏÈ¬¹v?RO%Ï¹âÂnð!2FknÆx¢öU¨*sÓù4;E= R×z-ÄÃ[íziÙê'=MJW¢anËEÏ´«{³BjþË]@>% JÎà/mû¿OØ·ß4;¦{ísÌ(ÎóNÒÒÐ ¡¡«³ÊfÂ¬º®ü¡ü)ôpx62IÖnî·Jvö&¨_ãW³ýàVoøÛj<+µÃ$Sò"þìº(t^*w= ##3­B(Ó+I8§²u\Íðüªº Ö¬?±ÍXÛÊ,ù×a¢j3Ilè>>¹µOUK¾p,d£= FË6âÛJM29°ò}®uÖ8BÊ2Çn p@	û¤Ã7Ñhä<FµhXo<ohøìÚØ°úp6aë³s^c ó¥Þ¾Ê´%ÂÔ[B¡Â¿¶·S[l%§¬'1tÄ%RÃÂ\rð¼ÇØºjkîáF¬:¬ªs#A+vEWT§ÁYÕ~êÙ<Óìÿvãg %\ÎcëÑS¢Ó7EI°3Z÷êkACX8¶o÷G¾ìï¶[k	§Öêq-iIµ,v,}}¹í4daak&ËýÁÖ¤~×Ô°ë@}YýôÞ^&ª/zpvWìl_\,~#Ñ0ClÕ9B=}
ÏQ>ØÒ"üaàÅUKíÓ»9Å-0lÅYDUË¥¹=Max1Ð§¬ éºòòÑ5»eÊû2òE¡Jú¿÷!¹[94
è©¥ªÜòà¨RcFHB»á¸·+½¾Fõ¤^/4hQ&è§ÁËw5R_=}¨y+Z¾è¸ÙµSÁ__Ë!Ð_Á][¼;Ç1]ÔÈAZãªzÊ=M¡^dÖ¾>aìÑw¾m½Ã
M~m^¦Ï®÷j²¸»%ôd*Zk·*ê¶Yä¢¨rÆûl ¯Æ{3±up)²ë¯þÚ9½²È°|ÔÙ¹i¹ñ;ñ´AÒ>ÈûW­èJY2"¦D C*¢¢éÔvÌh5*	×v½äh¡MáÈ$×Ü7qÝ³^ªà²-\ê-¹ÎYH Øf½»îBL}ÍÜgáEÇí:{-UÝXUèæÊzBþûÀËÇøÈèçôÒÜ¡ZÀ=M¯HOH+©î!"b¿=}ÐXÁì°j$kß	ªQÚ LÖòCwssè¶uçdñEV¹3¨2ØRkh¹Íå:KAgüÐ×T\xd Kãtì>QÖÆÏ|<1g ,A¥¾q"X"ØJáHEwêUB5L ,íñxîÀ{+4é.©/G£iãË5+	ëEÓý
ýç²þèJiËÅNBîºÙä?ËfQ*gÎj'~mbä¬BuýàX­á_ë[$¨A>ÑsöwåôJ =M"Râò[¬Iûî¬àþÂ.¤¤§ëòn¦®þLPíx[ØþQ_¥Ûç£,]Kò9Ð,Í©E5XY QFÊI¨7v¯ËSCÝD¡y
+ÈìG[á%+Fø;Ù¹óqSZ×XYQ}fî	¾9ÎqUÒÜË;fÓå	y²FV3Fpv9ºs$Ul59Wzõóç1©61Üø)WÓ'Ð­6¬Êª5ô^AIðú:ªVÙÂõG5B&	K,.¬XÝ©Ç?ÝuäP¨ÊZj NW®BÌ¢_6	¡]õêîPf[ËM-[Énï]Ë¶Ì?sf¬ð7üW¿?c%Êw9kZUk<VñtÿRë#ã©çqòÍFöÙ»ãÅ_ãÆHva¼îOò\G= V|ÁoQãsé-#ºnÐ}?ÙpÛØ
_Dóå»ö%H¥ÄÖ¤&³#uÅfgüø§4+ÿË+Aà<aòümh¦î-Æ¹XéÙ´ZqÀ½e'
¬MßgQ¢æ~e¦aZØÖ<²ZE\réHÑ?*)ZÇÛ¡iè/m¢!X£a7£Í®ÞyóeÝáQCðÊ=MßßÍøk©Ü2 &BÆn5}ã ÌXB&ý¿lèxèd[36¨rO¦Ò¹:½©¤û}æCáûÍÞ1~^à{öFã­JY²$º½Z&HôèVYÚ·gÒõÚ®|lxÞ~6¯æLæ3ëùºÁu]lw Io4ÎøçµGQ)Ð014Âð%2Îæ+ò$ôR§÷ùÐµÿÕ,3åÖnGk"UOóÎE=M^¬^ç}a¯|GÒIÐ÷ýøMz£V7
JÖXêµ³zÔÏ#©6®iÛMÁSÀPMá5tê÷][}3p55÷e¸aËepÖì'}WfByqAt#%e±( 6§¾òýR:à]Øo¤)ÓQ8ðÆHVì.å®i,ª<yBv¬ÚÝ=M£¶¯Ñ5m²£Ä/æçbX@ã¢êf9òÏN.F,¼ÜiÐp<<úT·¬¨ÌÑrèGmv¢ãeÜzªAç@R¬^³{\MN1Ýù±!å£¯ªLA«Ï{~®äiÄºiº_'ºïìFSªhQ« @ÅìNµì:¬ÄO¬ïo6ÑäOÃûÆW2z1<ë)c§µßMåü)$ó©Õ<Xvk"~Ý3ÎÓHJóÅòÑö ¡B7ùaÎgãpy}¦ÎÔò&økùÝNI¸ÄåfóÝXa9ËnLL $¥QF	ýÎ5)ô= ×}ÉlÑOÀPs ç<çX!k.q=M.êçDð±¨f9óeU|¢jµ"ÂzðË~^ÌôcÛÜ7¬h)Óìxÿ_¿¬Ö¹p¸Ì©ïëéðx·UUBh»MØP²UÆàfl«%vu0\¼ÆÍy¼ uÐä ÷6²'¨Ê6_».ö^v8*/j_­gO¦í³<>÷Ô\^çg  	Þ(û$]Pb®~C(Ëkìw =MïlíxS)áQõ\'Ð¬çÚ.úð°°3©öêÌFpî§¾Xe÷3dÑMèÔ<2g.
ÿÄ­EêGßÝ) S6ÿPíñ{g@nhÒa^c
ÊSªÜ?]Åjsk¬ßHÍm	ß ©bÍÏ9§¹GQI;ìvªìç+à2_VÖÕ8fð´Wã0Dg1]÷¿ÛüªÐ0!.%Fô,Ìèã«¸|ÙFò8fX}XÐ<>éÃ6 m÷ë)L´N²úÍ5rîw¹ª¯gÁ#né]-¤I<àRê_ÉUô¼cáòuå>ÓÚëÄw1ýhR]·¹WcN»'lDÊ¶Õpµ_ZEÉòØDix^iÃìóª\Ç'Ôå$²ê(­¼©¯ñZ4hñÄ¾	bñhdÃù)è¥vXÿÜ.ÌÌ.è£aÈL'ËhG1YÍêiE³½å>ùõ@ËÍ]
JÿlÞkwZÍufè=M= r8ß;ËUÉJnm!±,ÆY4êBÅõÄ°°ÁNdwVô­JaÅv$ê®ù?(öÊéÏþêõtýkOÓ@Î¢£]ðÜûÏ§­ßVõº0É%åaØ 5Ín0¨xó	ß¡­üçû VöÓ0n9àôï5jæ@lWñ¹ï®Áw§-'ÇSHþBÆôN^= ó© UçiÁüxY­©Í½(£È,ÄF§ÃÛMb>~¬Í^B¥ yl½¦ÉÌ,táã.!Ù¹	g,þ½ªãIGÉ)òþð¤M½T0ÌLZù(FÐã,J	&ø±8p%p
B½åàÍµ/ñãþÖ áI[=}Âý½åE¹HÖÐ5Q¯½*ø^Ì¨w¥½÷G¤!úLæ«"ìI>g×+6ì(¹£kØè#:eÖ»t§?ÁÏÅf¶ü·ÎýìïeÂ¸8zñE,÷= V³a+¶baðZl¼'ÁÏ«àK©ó[¬µÀø%æ)k2	j<£Ouþq¹ïkÆ¡ïÚìÜ\¼tCU5ý&oE¼åÓÃô¤[Ç#Y³V(/~ÛCÈÍe!"oª?Ú¡XðdaïS¨(º\ªÖ}§#ý¼¡m¨MD Õ{Wl§uCC6>e+ÇÕÁ>øx£ºÎNßÓòY3pÅ¥jDlB0>Nlï½Â´GaaÜür ÎwÐ¥Þ¶æµi*ý·R¤ÿÁßé³v¶NàÁð{âÂÉý÷JZ²hz'õÃk	Î¬W©ó\íÃGêÿ0ÄØ«"ycöÑ=}~´yI½[{b¸4<õo6#ÛÀ}µª#Kã¾ ±3êoÇ¼kçxÅ¾«ö(·ÂÞðkhGsg©=}Û"z0ÝN»³"KXÙ
Ù9l§tÃî8åacÏé2#=}ü!f,úÜÐPÞv_à8Bnx\Ãô@&à³&=}àõî$á!7ÿ¡Ù¼_ôtÙÚè­#§N¯÷ñßµ´JH1 ºYm ÙNhÌ¿XaBiGà²YßÙ»'ï7Týtÿ¾f=}ë¿mïoäüãd{À;½å#´|ùh~¬½M}+ÝFQ·.¾N_-ú°©/-z´Ó7Û­©æéå¦æÅb!£$4PÇØ¶qjÿþÿ÷eóI¢¶æþüÍ¼7âóx"3îLÜ¦ûN_-ä6þlzêp×L¾¦ÏK=}«I[ÕídûØ¨ÔÐÎô¾ÙÂ_fORèý9ývK¦s·ét= Í#e¦­åbcb%­i öQÞôZq×rÐ£ø°cvåëGÃD1Xî°Võ6e¹0¸3t'Øøz²DwâÃt7ãö¶Ù«¡ïj,¾)í[s}Ê,j=}T= þe¼²/:æ¬ó)7õ34e)dþ»).ãôzÖEQzpàµ³"éú6Êh¾b!D7Ýó¤
í "eà¯ïdVe8¼AÎçÃ\ábÈ"Ó±Ý~ô4i&U,ªË17¤è~ vÏN KÓ¹¾êÅIüýÄ\ÂÚ_½DJ.éßßMÑg@ª	µ¦-À>Þ)¿%ïåÑ1Õø((\O!ãsÛåXUY:'­W·p' O2ùºE7;¶bað®(§_¼««èifyi xPX)P©Õê«,
Ø¢}´ ¼Ì¸\ö¥NB(NXnßÖvfÃ7ýzg_ÉKL×]þµâ~ÅÝf%)EbôÐ+a6|³²!¹= PÜH1·ck­LUÖÞ= N?é²IWcä.(E;jjÒßïÈ»(Ûm>²=}Zg6× {pj¥)A- ªkqm"é³Ð ©Wüí·tÒI=}¼V¥¤ôJßü¢Iª¶×JI}«ªµ·¾ µxL'b!jÊ§*j&%'j¶ÂíS7W©Ñc£]ÓÇ(Y-iùejÂÄL3Ô­2¯kÏ·QYÍ= ÅTÞ´¸Bµ#P#Ç]¼= ¼üà?º:¿áxìÄÊ@î®÷×µ =M0Ó9ºb1þßÚä°À/ìÃ]f2Íg ²¨ÙÑ>\ÆG$$¶ÒÉ;VZ¿q®Xg7MÓ>Ò@Ûáêb8i!MTû,)gó7^
ÅñÇ»121hT=MõÖASÞ¹ÿ¶A*Dz(tYj}ñ,~usÐ°|£MÔëñ-×l¤\AØ¡î8âb(×Ç=M ×7~å<H=}X 8(»ãwêóHNdp$Ï§WÜÇ×Ðo¼)?¼Ïì2ÓÄ=}õ!ªý?d£WyøÑ,yy×L§sêÒåõn¾&
ñÖÕGÈÅ*¹WSÝml^ì>
#1ìÈãÂèï@æE¬íS³3ÐÂ÷5síQö7©£)Ñ¼ é1ÖcÅÐÑÉföÅgnÉ=M¥9Ï7õì#jWâ@9Ø8Øä8eÓ³eÓÞES	ðÆgÞH·AgÎg$ØJÞÌ±÷*¼&@3Ñ÷NYH 6$ä$û¡·^ÀÅ]§sfÒ@÷ÏÝ,ËÝ6¦0Ð7¦+Ð/¦3ÐÌ87½Ö0PÓ ãð72¦5¡BPã ã2ÆË}h|i=}Ì^½ÈÑ]ÃÌÝHÎÖ ³%Ás?Ýßé½oÇ¿gG.µhT\|Xt>¢¿tÿÛbÇg $èµ8Ã©aæ©ñ	ÅLZï£¤¤æÉÏgFg$èQZ]¨©=}{÷>¹aÝRd#þ-¹Ë¢?Kd1	¥E95£ýäU^hþgµnÃ;¹= Õ:WZ?¤a®©ñØ¡ÁTFÍg$GÆÝÑd£Þ%#ÂQÖ© 	­NFD&I i¬)ÿç×ÚQJýi;Ðå4yJ1ÜiÔf¼|³á,¬ 7G¢àíÍï·R~<ád=M¼(uÁ2:m­ðç©¬øXHgJW/+·1ø)¸2\LË½ý'8/vhd÷þ¸2Ó8@Ôóñ1®0Ìt.E±ìÙÈÃ~«óÓA§Dè±5ÜFo_\tYøÒeß}6ZÀøãu@AD¢IÀCv¾"7×#5üÜÆ+DÍ9®6ÜÉE%®âòkð}Xê9_	øÉò(¶t¶èÙh\ßÇÚa$Ý 
²¿éA°Íãð³E¢S*g:GÊHüYÍvèCÈT^i¸ÁúDÆ¢
îÄBRíS¼õ})ÖÍunÍ?þã¼àåà;d¿~z UaEü6U3s¦yU
PØ²ïTÆJ±¿ZãÌüh¾µÑØ9*xÂvhåDÎÿôö´v}0¼
oõîeÉâ7mOd±DX !°o¡³ÛY»"¬ÈWíâé¬ mÁeíU)TÎ×;#,IÑ­Y(¦MÖb)<ï(ZÊB¡ ÷³#X]»!i>§Eü;¡íágO¢Û¾½P/ÎÙ!£³µ az7Dû¾dÄmg ^k=}»rÀj§Ù
-|©¡£>¾¢nK'Z [ØB'cn¤­ÍÂ= ¯À*©ù;Gßnë®×òÙ¢µm%ÔËÚ5H°%Uþíµ?aéuÈZþ&×<SÚ_³dÓ·<³ÕüÈ?ç¼ý;çÄý^ðS·<ùÔüHÎ<¾	Õ¹?1T·_k¼'$YhòÓËüC¦Ö Q·8PÓ½c2«aSñ_*[Á$Ü¹4%vþIýëRÆº©áÐE¨ÝõWÖÓÀÉUQ$Ý²ãê·kg|èX;èxG¨¯5À	L:?çôHRQ:?~±ÝØ6ÃQÑ§Á¶83Ô¥×Nìñ1íLT=}SÛÝçä¨C9ÝçäÈWQ:?#¨§aÝRàÝë8TQ:ç^Ôä@°=}ÝÑç¢%ªÆ¿Í9Ôø¨£ë= ß£d1±´²¯Q¢Hð%Ã·Q¼ÊT¶ÓDU@hÕYkÑ±ûNsÁÏÏaTÔÙÈÃîn¬rzvnr³Ò1)H>Õ= À+£
ßI8OE{7!IãH	£YÐPÂY'aH9,iòäY³^vÑzg<±®È§ÃSOÁXqØ(¢ãyAp"Û$Vô¨e¤gÆ8BÕÙ?Üè£wÏÀ75ô7c,mÁ9£¶u/¨hh¢a@êîèý3p+-Ü0¼7ª9LÎ­Ú¡è¼Ý-aUûwü3¶ùÙÓ¤Nü4ænÓA9}£ÒR[C-Æó§6ÜÕþö¨
è|ÅÇ4«f®[äÓU¦Kö½2q}aS4¬ÝÆòÊtv}b1ø©
 ÷OåôPä«ÙÐÎÛ]Ûü#ª©7[OX&®íöÝ¶£<¾*èP þ £$t;¬üÃX¡Z-ø)YAQrJ}q$~]y¾á¼"ã§Û¥MÉQTäînEs~ÈbíÈïYk&äSIq¢=}t|h4ZÿÚØ4ÂrËoÜÂ§ªy42YçÅêåPøüTVúx½Ùx·ùÎ%= FDj½áTMôÿ%fÛ9ÛÂsük#Õb,{<Çòél²µÆøòêJ^¡¤#±Ô.Ì(A:õõå]õ?IÕ%Fþ7FHÏ³ûþyVÞVMv@?HG×åá#ÇÃè9i_¢Ñª7Ãéyµñè3OpëÞBáÛ>ÇL¦ß3Ä+!ØÔJ¾21Bú½!=}ÄÅ¾UþÁöùCÕpÚA´ZìMß+RM=}^LÍïå0cT,#õø9f½Ð<ß£27vì´L"<l¾T¼ëüIÃæ§ÊxíuDðfð´Ä¨ëSÝnÌQî¥i·1j#ºpó^¯lÏ<ôÆþ'plUÜU-(÷äïO·	"rñ·uô£3És:§Ô"és¡þ²ñ2þ´5>Þ"âÓzçB5ð8ÛQwg¬}Hpû¾
Do *
4êúÉÈ¤êâ1md¤~#VUê4ýJÐ¶ÿ=MVº4XT ê¼<¯0÷4øtì/Z_[£·_%×êüØ¤½2µK¾RT³%MOÑh³pN*KSàõúaúDnKÐÒ¿;#¿s	EÃ®4w^h" ÃÜj¸ºV%v'W®Ç¨Î<¦MP¿@å¯Ö¯Lãù¿>k:¼¶ ÏÚÉëNüí<ÉßÓ(ú÷5B:^\ê1þJÓQøÛ74iqè)¤õòÂæ_US3»Ç7?óèÀîFGj½= xW­_,:¿²5Q7ëvzOÆÄr)«a
$Îôÿ4jF¦jUÔ	,6,ÿ]¿Ä-B%k7ÐÃ-4:¯@pWV÷Ù®öa5ëâ&-ý{àÕ#·GÔÃÓ=Mæ ÄeÂ.ù´AEÃSäU¼²ø©ÆÍ9¡cÌPmîó\9×38¥ö/l¥ÆW¡¹a5ÐÞøPÃ®ýÝ!c$ù«KM¼Â§÷¾»= Z;þRIuzªò²aý+-XÃ*O'qV?ÔlòÂKªØs)pMl{O¼Æ>ÍTF*5!xÁÉìÏ-b­eCaü,«ø=  àéAgÍJ2ôqkæÓ¾LL:õ¾ûìî÷­¿kôÜ¯ê¤N¨ÜÐ¦¼¢«ÕJAïYuôEôý&_õ¼r/ùó¦1³·÷ùÂ«öB´ã]4&»Ôf<ïXêÊOVÕ°[N³Õ»Üò'äòiÔ«-UTò£ñÌª¯Ìn(»zÓ´_e¬Öa;lïÊBîÇ²	ÿlI´lSRëËN0[ JÖ£·²¡ôñG2çêTÏN<~¬ÀríÌQ¡qS®_hRþÓÃµ]öÔT+¾7«.\î/2ÇÐÔaBqK¥²dp÷0{ÝÁÊî@þrÆòhñ7|d5bQ,é_<ôtµ¶á|{¯ÁzÊ âÂÀéçJZ<+%ài?í)åQÉ&æLÉ#YYëåÃ´&gPYÛÙ+¸KJ!V¸Ë>jæ³RfJQ"GÒã¡¥±v@Ø¡yÌìxEåõUU!¼À
v7Î,ÍB¥6Q	°ú2î¿+psÇ4¿ô¨ÑÆð¹³S/ÀÓ®mùÖkÕË­ÖfîíÃÓ¾¥ËñìLEnf#ýËeßKø¡«ì	|èÐ&Çä]ën=}¤ø!ÍªÖº8'o%f¹SV9£xV
L3ÛÓðÍ= Æ= Å°+<bªW¼t}8v§ý¯:JR¼ÄFÝÈ¶u¨Á}$¹Pxs¢´©ÚCÇUâçÖc3ËêØ/Ëój~]~,ÃBvØôAß}§!­ÒèBÔ0põíÜ{g=Mk4.üñPü~åtÞk§×\÷ûSÓì0Ô}n°»(QÙBy+al $q÷Ls°þ,Ç&l=}0ÞÓ³ñdj_Õu¾\ýöûkd7 ªpB;Ï_NêÃÿÍ;ÚkÞÑ=M¡®ñ~">u{°Óô®Þqø¼¥Üñ»QÒ~y¶ÄWÌ¢«zn\¡ìí×Ø¹²ð?B÷Ëiô)'7h0Ø[ñ©>Â	Ý*gØ¢Ðz:B*@¼9âzÿé´Ò&?7uOºxr Ûâ÷³
S|¤ÉMe/§c±¿=M¦AE¡í¼4.>BæSÛ«o8Ò$~ÓOÛm+Ùÿ¢äDF¾óû¬ÅovíY:ÌìA¼¶p|þq%wëºeí¶à¬¶D9mºöBöB!°8JÚñØ^Ý« =}õ¶¦ÖýÎö²W2k°.ÐvÆM&úÕqX¹ûOuüe£z¹HJLu¡ærÂ¯ª5n B>þ\x¢¬ÙLwWpPl®×:gÆÙ4±h­öó:vÊ[²¶²¬·Èö¶TWäöÄ{nÖ.ÑÓqu3x "Àl>ÞÏ!þÿK<=}hªxk|ðEÚ±üBâï×2Ó/Þk«0V
Ê= é¹«§Ês= ª>$o­wîªmáµ·nÁªm_/@ÑV)cõH1$Mã(7þ»õtWHw¹"³ÏZlçB¡ÏÇSR}­©Á-4Ö 9iGQ¯ÙB3	s	= UAÖc-çÞwJåTov2Ãÿº,õ>§{øt¬ü{Ç!£}NwÔõ×·7×jôFßä}ûòv¼¬;£Þ À|¬\A<Iimû²7bH±y-TÒC;/Jç¤@°5­&TõÊÇío'n'ÿ­ÅïÆöå}r[1½<ÃrOË~ó6n#ß·BïÓküÏÛ¶»M^ILÒ]<gMw_ïy§p&Kõ·ÎôhMÓ&ÌöÂ ÐF»I÷z8Z,=}¸,ªÏ¢znrN5SÝö=}ü<sàÊßøä3?"ÎvÓôËÍÏ[NîÐÅ®3õ>×¦14Åu;HRÉÎoWÓîJÏÕèßiæb¨$ÏN83Ô£>Õyêy#¡òÛ¡'E!ñ¹G×åÝeßã¬¶T1ÏsªQ±S[á÷ø¹¡~°ØµÖ²¡Jù2êAkäõìõ¢~Ô,oO3buNüÇ7òrNG.,Â7tMAc= ëÍÉÖê¿mäD9óBø»ÝáG2W_Ë§êbÏº ù+.z nxrs9 á	õ¾0R»òÐjoÒoNâq= Ó¢ãðØk)K?aýr*T¢jçvx1º0 = ³¢3òU|5ñl§= /áªqæ³u5vbv¦ÎcÊ'îàò«|¦/JÄTsyÛÑµð]Ô¯©´ËÅ¢¨íÊ.&1ÚæÌõ¹ARûqø±~kÎ6âöläöüYâJ7±áYtå¨ µõÓkÓ¸±PÙõ9ºíÜùîë°ßæ^ë9hV9p£ =}ny\»ÓñÒs£¾¨ðzÊÄÚò°5,ãæ~bC*m|ÛJÍ·eåÔ9X»ßmÊKHkQHsÝYìÍG%KnX§ÔÖw 2E
á:EàS^R'õ3«Y1áS§ÞØHèikW±GER1u¤Q!%ÝH·=}ÈA¾R¿Lb	GQàk4î3ûÕ0O1-ê+aÇíxÆÇÄ}T=}ÍýY±ù'ªiÆëX'^°ê@Æ$vÓ( ¸:ï\÷Y%mPÉÉíÿë5?açTµ'?ÕvÔÀrðw.Ëf=}º±¶Ö¯Bfðþ¡»·nÖ«ÊÜ1°uey0/íÊyçb!+eåöL·§pÊÉí	CÓÚ¼íÉd¸m¯#ÔñË¿'=M¦1Èmv&9UàûEScqØ'_@eàI7³RÛôS»h[Ë#XÒÛ{ú4û8!ù	ýÍñbAÌkÍ¨BüÈ*-zð 6G=M$þwur©æMÛÅ¸ÙîÁ¥=MÖØsZ×Í¡þ®ÍàEªS=}ÍöêXÀG)W­Þ¦à5 @îeºß3[¿p¦]³Å;H-j@Øëd¢X$ý±¥rQèz@³­øO9Äö;xzÛ¾~8 ÜùCÄGà+bH7¢	8ÉAÝÐBKÞ¤ZU
eN1Nâfëéå1çI¶ÛYä"Ñw/:~»´´$ÝivîÓ°1ø.R¬rï^¥.t¶\å.Y¨s}¡L3yxÙúOþâ-d¾s557ÑdúV¬Ô2QdúHï:zòx&2½Éxâ
öé:æZH]ìþaæ>Eå ß*Bà^§ïóíÁË³?|G£I9c4úÚÂSçÖFXFvkÝW26cåßfüÉ±uU7ð¨p= :91q¯ù;l ²·FS8Û«ù;M|è­h¢ }dç¯µT¼A9e]/&	= ]ì)6Vg¤Þ©xL5/Ú Y;Íæ
¦!U];ª3¹¨xX¢p§ñ+¤N¶ø´
"¶óRÖî&@ºröà|>ïtÿ&ZÁ-ä))0PÎÃ5à<8à}¹Q|µ	ÕDÜ?¡Ò=}+c@^EKO£)º£0&¶×¯ò½I§ÒJ%tÄ-Ó-|"üõ>ýepxªáêGka4ÎñÕWv|Ü×¤íðÎ×abÆ<Õ%1 ñK "¹Ý(¡Záï\×99ßø=M!k¿nÝ Ù=MÍÒQ51­sÝ=M [Æ*Í¨ÈkmåxojÕk!Sq>~ ³ûÓtprçôeDèWÕ(hàSÊÔ{}k¤4Mð¥BÓ³Üi> ú#Ó¤9¸½.ÉtWaL£WèÇ6>±É>¸Ú¿ÉPÈ^¶ºa\fñ}0ñøûÖI÷G|äénríÇ¸Xuúë'fûª¦GMvÏÿÂù9<Åt³ñÙ£¥Q!cýÖüÚ=Mú õc= Ø~°A«y¨ñhô*r.d!"?	ÞÔ@Ò³%´Þ¡ÍîÖz'ØÅã¬ÑÒ}X^î®eÐ= ¤±'8V1±A]¸²aC{£$¹= ®Z¿©.6iØÜ|= îÅ0R°¢»*ò:?]4ÍæOê¡üÌÛk ÂKD= v¡bðHPIBúVzßT£lC¢òØÖCjµcÝBÓ Åg'GÿB9JÖ~øBÀÝ>Ñ£z­²Ë.¬¬*SÇm:¶ÖSÐºvÍ;.zªí-B1"á Æ¦é/ô&¼vìâÍô=M4¹KZòm,d¥)ÑñJ-¼_Uû(äIÇÿÌÆM9GGl¨B_AÜ@IâÎ$ÞÀ*ó(ù@Æx*2êüÛ²<ôû¥Sùvï= qìyGýÎDT/	rÕGºCTE^õ+ÆáT­BKòÂ-|Wò©Èq<¦Ýpy°?«¯ú.7¯fì¾uïYi»Vès§Ý÷¥¤N"2©oaw&a>¾k~!ZÿÆ~G¬Úxo¹<Û âûíÊecsÃ7_5oÏOÁaQ:zWéx¨M×Tî-D=}lð÷Ø+
Ú¶ûíBàS;ÊÁPúWSÛQ|ÿã¼¥u«BOMÀtÕ.JrJþÌDÎö%pBÙÎ5X2ïd0òMO 1Ö:ÔK!Â¯Ñ=}+êË3©{ìßÚ%ÝèðµIU¬ççvÚJ>¸Íy;¨áà _ÂqMaj,ý[ÂÙë@ëbáÉ äIP·ÿ=M!ÇPèb G»Ù(;ö¡RÂz.4"ES$Çxþçð;ª¸i]ÉÙ$_G+Ú¼-ÌÂµ¾ <\R¶ÓP¼HÚ1ÏV&(~£ðú1F·×/¸
ÏõoàÙÀôþ ÃËx9Ô6þ1BTT®_,¬ ½Å±ÝþËõ;gPÛS]LÇJq&ú0§xÐúïyPGþL¢VVOÌñ2F¼vÞ1òÇE$°º¶Ó1nx¹6=Mv!¨Z/á¿Û{%EÝ»É= ÇB{³mÇ']CJlgÒ>­.Q$nxÿúûÜÃ\ú8¬ØõäÊt¾ªÉE¾v_2=}zãÜ¶]Lqýz=M_/¼= %|9
1sNx$oì­>=M6Ï»~8òOV
úyÆÇæôÌè!>e£.d941²0Wßnéú°©L;RD>Å+¨xÁ­Ì¹°ùÏÙ x"]2NþAWóÒªv¢Å0¬üÅÀwMËànÍÁÍ¹=Mè x@:fËb_&çÿß Æ:8:&¥ÿðÀ¾#öîà.!YI¿oºÞñÃ"ÖÚ½X¤çÓõ$H¾oRm&Xá¦~G+N)íbMèáöX¿hþðX u	"EN P¸÷²bRqPí=}¢Í4b¯gdNù&L6í\ÁdrÂYØ÷GkËqçXï ¾èmg<ènñ{yÊx¥ª£Ü³9W|¶îÝÄÅ ÝýÛÃ<C½á[1p<H­á+éâçÃÜ·êÜÐ©ÌÚöÅºX.dªù¼ãäñèúG¡=}§<äDå¢è#È¯J§º-¨váyîÚaçÝ7Ö: ä@!ó·52ÞÄ±üZNÒv²Å9{ªR²ãäÒ+¦ ìëÒ&­=M>Îø@úY2IõúÍ,A1_"AuXÄ¯>odj ½QoGuìb¨Îj	¾À~y2ðh9ø7S
|[ûØi.ÔAèÌDfþ¦WbhÓÀ¯Ï<Xq3Z<lðs\LÀÓì§Ð÷<öâ¹»3ã'«¤EzîyÕ@ÓzÝ@ïüÐø<<2êÅ
ë»ý»u»k4öPÄlë¥ö>ß
4Ðµö»t#H¬kÝ%Æ]\¬ñÒ¢]ñz\â3z'ÓòÈµTg¬*üÍÀ0Lö®7%Ë|çÊé·>x0½S{ÍòsoyàôC¼äÆ8:U=}üE/À ÛÇÀÜ>ßú¿¡l|5³ïÚNòc­}GÅÀþwgÍLÜ}¿s¶|ë·ÞÆ¥Ë}[_Åës#~ íãZ~lØó¡ÞJ}Ï0Ñÿ *àNZÇzé~,¨F¥côq-Laòn2ÈëMü1»GLÒ£)¥Ô¼¯;/ìC4Ö¾¬CçÍ'ùÁÝã§Ï^£+\jÉ5XïøK9xÚÎOCz'ÚE«²*ZzÖ&j¨¹Dã:ÇñcØ<3#®Mõ¬âÕåÓÓÆÞ5î-À1EÞ±.ÿõ²»Ýíný¦g-½+ª^¶³ºz80­µªZÚd{7k%£¿cÒó][¹XN2¶÷dzÉÂ~të,´%£6Ñ_ØÞ«®}aÂ¤ Ö{:ÌÌìs.´)xa·¯êw_OcE<j7o¦Adàãõ~@/t¦&ÃÂ´o¹¯²"](<jtÙ±pêmÚ²¤·F|tÄìîkDlµfÆ×©WîÍý³]^"ãN;uVªÃÌk{ ÏÊ»¸Å¸áR2.1ê¥ÏÌªlSÕ{NT]ýÐ!Á°j
£æWÐ1öÿ9 ¿Naë¶vª0Ø;õ= ì¼H7Ö;0¹íËÌ4Þ	íëÓµv'^³Vþô+ÙÐÙóÙpÎX/^¹ÀD¢#ðVbRÜUÂ§AOR%Øô8§Ì1W´ýöÔÄ¯Í	áMcî
*­Å8Æs +òn@·rÈG0\{+{ìÛ56ÿ3ðýìK.£RµMbòª{8$æüý¼)/új£ÊÙeÕkQVºWrG<
¯wxþÔq1ÔQ;=}uJªtV=Ms}Ùàñ Ò]Ü¾ÏôäÂÛÜ´#¬9ÅÖZ?·¬p!Íx£"ÇÄ«mè£ÓÊvÿm¼Æ¼«¡Þ@B6úÍ/»Ê¨)öôÇø¬|ã´\Ác7Ð %×õÕl÷=M1|ý-òòÍÑ¥Å>ÎÚu/úÕÝr·¼¤ß=}qxû-(YÜÀm<MõIõ=M*Mbw¨îµ=}Öæ+1YË(L|êß¤rºaÔÓë~<l\1Òm4ÙØ t"¢Ö°ÞMÃ-Y}áa,S#!:j Óò(3AÿØÃ®ÕÇL	\À]=M¢gvµyúÒÖÿRëävý[/wçGægæm*pqÄÍÞ@þë^/Àá4­û{/¤^eHl{Þ[ø&
BkÑBÑÛJ¢*XSz¥p<lã®×²Åx&1ÚVí1ÛàØÿ­ØO<Lî{ÍSéñXÎÖÉ©Ü'k5S%R= ä9ÒHôt@&U#kKa¾¥îBuR¸´ã
;ÿu§ìQå0O³6¼Í§Ò/HòXG3<­¦s;ÆLfº \ ÆîÊ@mÎ&sÎ¾Y>X«T¤±!Ê9©¯»ÀÍ79:a0XàRÚ¼¯õù!sXÐTØá/âÀWÌ%íM7ò¬ùòibßö91ÐRtZöDÑ¾d^äÓéTøoæ1¸ Sòõ(ÇàbJsàþÜy%½Âð= ³·¥UøHe[MEÏynU@v>MâîÅ´ÄàÔí2Ñtyaôò_3¤b«zöãÔ»>HE|É
ë>!&øÜ>ÐÎÛ/r}°= Ü|CõÞ9³!/ÑÉoÞ?®= V4»d«!4è«9
¿I¢Æ2T¥º&Q~R#v¸nÏ¤¶¿¼ÍÛ «©:]>rH¶W}M¤r;Îô1m¤¶ÞÜTËö¼±Y4CRÝì­I*½zÀºâ°!-Âýäy%¶ð°v:ä*>E£BI%ýîµ¾LMD3EÞ¸S&zLÊÆä®2C5I- 
¸§Øàë3&-Hy³Øad¸ÆùJ¾hG£ó_Y ²4<¦KZ¤áD·£,=M1{ÆA;.±Ö*$Ây¹ÛåRÈáê\òSWÚBÚl®:{¦>¤x*BíaÀSrHÃ_9	¨t	×æÙñÙ;×+F·ÚBÐ
~ssb¡
öÜdÆ"Í§å(Nø=}KmyòÎ=MÊx(^KJva8UÄxKùÑéÒºn(.ãH¸¡ë
Å";-O¹ÆSM³ÛmÔâ¥évÇñ4#´¿ê'¤ªU¯I+Ú ;{>[á²]ìxæb­ýå¥_ÕYêÊÕ{½L¹'·ÆÉ<þúÓM*vsdc±MRÇóBë=}Ý=}Vìâ$tÑ\ÿQÐ¥ÊvÕeyürV_Æª'.>RÚâ?$ÍÖ½çr= {Ü-6Ü&/¹8±-õ¨]Qvp«X$7¥NG¦oÚÁÍ¯N(Êa _kA¥¦43­6IüíÕ5,¤+ÍÃR2T2kÌËÜÝÄ
ñ÷Óðöû¥Ü'æ§2h!YgÏ â¥é%ÆiFmÙ¨'YáËÏÃ¤ b^èVá*KuýÑT?ë)¸g*uª	ù\Q£û´;s¬y"z£UJ´ë$Þl»o'ÅWÚH0B*=}×:ï ÿä;yÿAdÈ$÷:ê3±ÊØl¡èW¾= ÞÆØ[bad±:D{1(7¡ÛùjðÒõ81å¬9xßS C»ö+¢Gp$½^ë¡pÀ7E:Z4ÿPÉçÖ×\*ô¬/¨Ðû¯6G¼ ]4HT*ÝGÐÓß©¸¥¼«6Î&ã¤-ÄÇTìÿy.ÎÜÇ$+´1´Áªîo{G©åk¤ ôaºêKÖ¢i¼ëß#Aô7ÆøÒô¸$ãà= 	Þ-²ZßÕ®F d@ñõO¨âB ©ÇP¡MÉÊ= %=M{H¯tÄ$\þ6siàÀYåÞ$í= §é^Ï®³XÉD´ÂªRÇ¹7=}*Ý2£pÑÎn6¶ÉÓµùªÀ£VR_¬úrl2%±¤æ¿õCñhÈÈnX½D­XuÙMøeI=Mb»èÌZ%YEO&P±üOEI§DÏË{= Âº!{Oî¶}î"¯ÃÅ^Ô®?Ç6ã¢'
dR±Ó%É ;Ý8û'¨ñòO¥dðPÎ!»ÅAy?ZL3ö-¿²+HÄ= DãÍæ>2 -/EÏz'Aõ[ Ïàj¯æ$¿ÊRì¢.£Éy½äÞþÀ*o¨7w²zÚ¡ÝGúbùQz|äi¾ÒjÑN CmïìëµA½bãzsIò	ÌôÐkúPªóÖû) ÌËbø,æÆ½GG5ÑaÿôZj¢Ýmuö±ë.\Hnåò«8}ò< çtmnzëz¤{aQwé­Q­ncb*ÄDZ:k@m"½ÿf»WdEUÒos&Z¢N=}®äWº=}yq(Ã«wÀ2DyÜ´»«f/Ó£k'sIÉâAxss®»B nQèlÆDÅÑº*F:#8Ç÷m¡>
'c;84îÿÄÓåHêÖÃv(A(³8ô×8[>iè ¡ rz®l¾þl×å^ov<½Ì§³@ýânÏÍ=Mk5=}rüaMeº]ØBd¬kþM¾-]w·böG+eÐþ¦ëã,BÝeÊ
z{'Æ¿)÷Ò¸»ÀeWËöõR°ýtu*Çhs¿U.!Òd¦oJ_2d+«æcIØÿ­º4¬-¶yfýNC¯;®JÌL¨Z~ù=Mq:ÚÌ
T<5âXo!V%*5nÂ­(*©Y/DÞoe¸µCñ¾K~G<Z»²£ücæjõ±°cé¾iY±è®é= Áh?°ßh÷0Bz>ÛlÔx²Ky»µç²VóxË¿²¬F¡¹¿ÿe¦GÒ|DþÌ/¦«Tz%÷«íÚ/÷ÒR= Ý©| %*}iIV¾Spts'zä§÷j²y~û9Ê!{ÃÞl=}¦ìÕ¡}Sú³£ß1ÈD]Pz 'ªfÍ/ûÌO{ÒZäÇã	Áh­=}G9RB¦ÖX®fÃ¦w­¦cò)¤­Õê=MËç°ßÓù¶þ$ m»s(
ä¢íûkýìðfÅæ{Z®ú[7KQ~(5ê¹È}È$½IÖ«¹÷Ëfòoòæ£mðÔ=}=M*G~Äi®Y 4ëï»ùÆaµUb6(aÉQ /è°MÅ<ÿÏNçïÕlq<yÁ¹ddæe*b:TOÜ C%VE(ùwAµòQWK.ùüyÚ(%Q^ëÜÿÀá5O5yfXOQG%V8óó=MH7	h!yKQ¨Ä;'[òÀ£òiVXG'IXEyHöæèÀQEXKJùÉ_t´ÅKS[S[C)f3	9]q(b95ý%ä°fO<MUwYìª\©SïHXçXTËjW3Óaô1ZòPÃ4ªöÖNE¢p¹Üµò!zºÜzÞØ¯exÎKypã§¥õÆ<8ã4ãÞs^D)Âñòr"oMòôL¸gPÐÉ{Ý¥ÐÉÈÜBÎ±,ÌÍ³Èõ®Ói.j/ÁÈ+b= ¯Ü0fs*­ðm5lÙ¶VKªqgRÍÍ6®?
óÎµ»·Ã¯Ì2¸ÿ{z¢ÏºÌé*Ê/òZ°mÔSÊ_Ô®?U½Vr»VEÒ°8ºrt ÇstaNÎºä0#-p|S÷
ÑFJÐ8Øð¡+}Ã&´¼	OjãúõÜ#Ä¾üÍâ ¾äqÑÒôqäE¸wâ&"õ31½õVÈÆpÖ£Oü=MÌ(·t*Ýà°ñõ¤{ûa¢±ë
µwÜbîðGTÊy^éq¶¼%ç¡'XU #EÔU°³~Øì/UÎ*Þ­'p9ºÐ£-ÀÝ\ þ°T§#ðPÑî<Ô®pÑîjôÚ<p	+.GX¶Ì½#¾k&uèO<çmZ¶ÅPXÈlÌ kePjÙ¥«ÇE=}Í8¶~¦ë§~^ë·Í%=M×;ë¦«ïÆd¨Íð	ç^ÐÕöµíå¤øØO>ß'î_ÿ= ãç9lÝMAð 5÷òKVc.?©Ë*=MVÙë¬´8i»ìU}&eò+ß&L¯öKrïMIpÏ+Á2~øDÛµb{+~ÿýu{¨3Rïë n©0ø¢u	¹2á>kÄ]éô÷n«0°r Í;'FSÀ¶@.ÝÀw¤e±ÚÀU±QJÑ¦'5|´±M&-0¸Ü¯6Ú!Á¶&Þ{¥6Ãâîü¼ìûléÈV¯ô£Ç9¸3ÊÛÍrû;téè¨¿Ú}¸FØÆzÚÊh&¾¹Ía8;~ô½ãÐh¥ÎÇÁg<¹îPì(MorWä¯J®Ð)Gé¿îQa¾9!«Ôiò8=M|n	ò«Ohä¶¯¢O²wÉ®zÑ
º¾¬ßìáUç¹¦q}I½9Kóo¤úuÜÅÎ¯%ãë«½Ï²OÑýÌ	n¿îÉô÷ÈBp 0qáôw$[³÷f¤¿¥1ÁË mÀÀGÇ_µÃ_è:#JÕö¾úôÄÛxè?¹·øæÅkÌ)XQ,m§«Z4Yú²ô1düL ìyÙN¼/þ¥¡ð¬zM½&{kÒÊÀÊâ÷+ÓfÊnÑ(ÚßkËü²Yß® ÈÄø²î¢9Xd|¤|þ¼öy£$ó|ì5ÒÌ¾¨^Öûü+¹øÏQ1çeó£mSªÕÂ
N'ÏQþM¹nöÕb²Ek4
òÉJ&yÿð
:)çlfMmÏ2ùà²è¹ùB¡*
+=M9ãv 	Ùp7he"ZËGý÷#xZ~ ×Ó£÷{p÷ ëC+ÒA}&\%FñÂç±ë[i:x©h(gã0À)»]0Þj¯·3MxÇ&y
ÖÜêz9¼ò$DÄó= w¼°? )$ñówXMê= ÑC,1ÒxOíÌ08l³'5Ù/¾ÇêB9ÏHÛ CÂl"ã(2Ág¾moýÂÐN)ïf¶õï¾7ÐÐÚÑËÖÑÆ.8aíe¨rmæ¾¯´NØ×¾ktHoVâKJÏØ6yiûþzÂ£²"úãïÌ¤unç_E/ÔÄ(ª= 7òüªpO]ö,$¸KW&=MU#ºj~¬ÚêNÝoÔ²-_5Þ¬=}ÛV¢Ä,Ý&}6ÂH+dóÙãÖY/¨t©Ôã1 á¬Ùãñ© sp÷O$ù,5¥ËÍãqOº/§:tqåÃH¬2Efê­UP©@ïñ(ú~|~Hù¬°îöºÜ6ÂÅv®F ²¥?Îð©ÔÖuöLóÿb;zÒ¬¼uÔ$¾n½Ï§,0~¬ûÎÌ¦+V+§+"zF+WzF n!°Ú-n¡´Zn¡+´Ú=Mn±îÁ{¦ÀìUóPbßL¬rË;{\lchë--ëë&¬~Êêz|dJíL»h¥AÜõmZ&^mÔ®Që2ð# £9éÏ3n¤ôú	ðU}ÊÑã¼ÌYHÐµl«+¯jOi  Ðaö¨[%aá¬;=MgtrUÅ¢ÔgÝè½Ñ¿Ù%6É%½øûüÇñ1é_YQî?ô^3{%».Î= 2Z!ûÙ÷õã1^s­£0<~¯·»[Å¾ô¼ItÞYÅIxe*Vá:øÑÙ=MWpò.ØGeñiV¾æ¡$èUºÁ¡{ÔlBQ1ntÍöäñ=M;/RJwÒâO},Ú­üBW¼ðÞi«)5QVòã|(ñ=}¬£Æ;*ömwÖúvÇ¶ç0æ*-8HÉÆ­B5ç5'­å ;]ÛnÊèM mTÓµõTËÞ	ëÖ¬=}wÓ¬Cv7eèX-4®ûªô½oOúóqÜ¶£\WÌ½ùÉOîuëûY¨¨ÞgCÃ9I*±R*)"ýYþ(Ü±Óâë6©9 ÷ûWûøý·	æPÙLãï=M+ßHôÜLTMP1BÛ|S¦Ê¸ÕÔ²Û7»0¯É+&O)ÑÀà »C#0ÀÃñP:Sìy~¼e¡ñz¹=}oñ@qÂÚ©â¡
t«¢fóß{ê»*uQN Ú\¨Q.8%o¬Þï8j4öÖøMäÃ7ï«ÝV.ÌN¤AâQ¶ °UÒ÷G<ÂÅÛ?ÂðE<BFqQª#kQzmcgbòËx¶ùÝÂ=M÷Q°´+Ï9¨+tºÅÈy±Fð4{Ít¥,Ë¼*ÊÛ¶<ÖÚ.^¼	¬ý¨á¨1#æø6pM«ôSñ~	%Å Ä6À3ªÃ¼a{¤­7ÏáÅ?5Íô_àÚÃØk'ÿu§´¡K~Ïã5ùª$ÕJ euxo-ªã·Ën{T&è#æ_´qÑíóºXýD±L@J4È­e	±ìé®¾¨9Ï¢ÄåÈÜÈOwloä×é{Wý ÷Z= ÜÝ®5èçßjùÝ»©ãvìºÁZïLyÊ«ªnJ¦çqÃ>kÌÔ2@÷51'¤Í¿ÍåSÞ§_>V$èäbDñjÅØVÈy½ì9ÅÎ{ñ±ËÌNÇ= {Ûy¥´ËÎMÜ= þªâ+eáóG
OÑð5}KÒúV=M­%"_Ð¥}e·¡SPÇ$ °VÑ=}%	@BWïõ=MÊlè^ÜË¡;Ëò6²YÝ²³.Ú]Ò{³õ¡´æè2:ÌÍ_üøL¬®¥eT$	ZÔQ±êñ(O*7Í»¢r´=MêRAÔ<Ó#Ú<Ò ìßËÂ!HD¾o1¡7´bBzÖ©Ã&^»þgGA]íf´Ð§á«gÁµ²'³Ò/{£ÄIRH¬MæÏ­Z$DÕüÂÄ:¬hÇ×t+ûÍ= ÝÅÒÑü´¦íÔ[ÕZÔ×Ë¬®âÁÇòüã-è: *¬øGj­ªwjSãÔm^Ì%ÿ/{Kêº1G*»pÏÒR«w'»%G¬=}º·YÅLÂ±¬bêP!#; ÜçO58üÜ¿8bå{xí6´¹"ï5Xl«ùÓÁ$ØÁ¥F_~[úÅGÀ* ÙX¼lY l[Ø(ÆB3^ÄF^Gß),µáoÊFjüÚ|Â=}ÔäV5ÅeRra@Í%ÞÞCwD-Ãg/è$æø5à3iÌ^F&V¥UkþØÂ|KR$ëøX<÷ÞA´^Ö^L$ï:·îø¢[$#óÓ#GÐÒ2¢ÉÃPû\*Xq$Æ0÷Mp­1l5Gkù^{pClò~m±¬dÞ:ÃA<*Ãèâ@Wmêe¤²¸]Z½,Â
ÍspÕrQév=}4¼4~óÈÚlÈÓO
°Kæ¼LeÞæZ'ÛDôêÆ!üpM+gpæÅ®U'ÜãN_¶ úÝ±æhè-¢´!ÿûüG¥½Dd4 =MÖ¸2ø¨_ç1Ø%>	0Üîà22J^@¸E_s9øÐD»©3ÈS?é§]?<¼»±qst!ÇáBXi¸£ó:íé²MÀeæ{lëË½7÷ägÒN+Ñ;¾zÑôw®8õ2T1}­H)ñûÒ'ïÁ/ðá)}±¼Ë	u5ãW¯Çm±rØ{H¤WN?÷(véÛÿ¦"zË¾=M1ØÈ}Bfu-äðLS¡ª|§gê4«>=}©
» 'j]Ú|Òe<.àúÆå¸ÎÖþB<Ák«7V5jé*§Ów:|Ñâ/ò4JÔf¦LpCïÆñO)6ÿ¼ÓlCvài¹Û5'\p(z1ïTLÈ#×+Çµøøm[Nö¦J~~åk_ê¼N#qÏ[ï6zm*²Ðæ _ÔÌ­¬¢tr$§v_t©ëýc%¯zÓû\rûp.ÎÞ±qè'T=M-ë#Ù­= ëH= )/.x=}Kæ0ò¹sÛäõó*Ê¶ä= :×g0ÜÜVá=M&y%lxJ0¼ê=Mvº×n'_^Åß1È'*m§ÏF=}Yàvìö5ÕoÙ°¥Ë(JLÐUÍã@p¡Ò;ïÁûhcº,<©GÑDÁq£¤5@Å²TÚå´c´±/ÐÿrZçôËñßrÝ]ÚÅêmsgn8|UKÎØÃ{¿8K[æV\#´£.°Ï¦æé#1Ø¯âuEÌÄì!"ÆÔËæ5ößK¶¸£#¾wáÆÊzHìK×Ü}Núu/SÆ ÐÝÃ7¯Ç4Á>ï6{-¯ÝÃ|PlâëõD?,þwqÑÎïeÔñd£$¨»= /Ê¤àKfY»{Ï´Ú¼òÃuÜ}?A¼I¾Ú õÂÌã ò/S4òþ~{»ÿaN÷ûúÅ®(2ïÁNóûk
Â|U¶ryÉmôI h¶gÃMY)qéqîW:ªrÕ=}åÞ^²º$¥»[J?ìÈfÿòHïÿDYª©ÚöºÊcnx "vø/DrÇ§ ]ñ¿ú5ëýYü'ÆÄú+2Uz~ÉÍ§wS*Æ}ÇNÐZ5¾Ñûù¯¨ÚG çÄ7ûÖEÆ¼3à v#*S¶Qü7Pü9P<'Üë=}8µ µHPlÏãºêíãßXxp+¨_;v±¯Z[µ¦Ì2eÍ|3ålÓ/ÒÃNd$\]152lyÈÚ ¯¬ £ûxódSe'rwbëùfUQØF¯Ðfõ´Yô£µL¹Cù8ê2V;½£§rî~Ö .ªìM(\äÇxT!Qµ/(tãtc)ûÿðëD´ ¦ý?Û=M×O¸(?=};ZòÒà ÛZós{³²'Ûfã¶3ãX@.>k ¹}	´Õ	¬\ ²¶2ÏÀÇj}Óóf	g¥K~2\«_ß8©ùõtfà]ß¸áoûÛWÖË~Jëå'ÜfJæ§C[À¶×2&àú+õ"rÒÈ¤ÉMRÒ= úCéq|?º7ÝÑòMQIæh,N]^}×ÂÀáõË äOÀB£1_J·êÊ}1åz¡dVkç&Içæì ÿUÒMàºà #iÎ}ÿõ:= &SdÍê²	çÖÉºÈê.Àýâj+Rh·'\k»7C½6GUS½óaYý ·­_;,²¢	T÷¬y'îk!B±BúbMzY¯¦Hòzpfé|)±®M3½è/$éJë;Ä	ûÙÀ¬&Æí«°Iá\f"=}éÔÅ3YihÉ®/Ë3q«{Å2uøBÉ= Ù2)»rkrÎÖÙ§¢?/n=Mýê¬eµnÖ0æê¡@9ù¢?N< Mòù{è8ö +½Ø?µGfæÂ ½/ô7Ì»vrÜt¬ÖJ9:5ñ<ÔzÔ·ÆBòöN=}¨aÇrÉ3µû¦0än\Zäsf%¼æ6ïéôÈé:3bºX0
4Th'	½Ð\æ¯×2ôÐÄ ¾º	¼+ ¿
Ùð7}e£~é kÚKÌÉ®&g=MKr Ê9ô±¶®£Ñ°Ñ=MõdþþÀ.a4ÓVgèäÞ®ªøOé÷ÊS
ïØmô(ù¹÷ ºQ\n=}{Â'&Æ;X¡ââ*Àh¶Ë] o\X?2õf":Qô5dl¬FÇPD~-BÝp zéöÆXùúñe­NJhj#kF²öB³ÏÌö²ìrO!³U6Éø4ìbÂvt·^
ó8;uýRï$¡ó	®9¡;/$¥óXÔÞ´eYhüùg¾fPéhOÙõTÜÙè¶#Ø½?^hªç¿w¡Uö4üÁ*=}È¤G±ZôX­¸q­FÖÙ?xVÆçÏ´ZKÝT&ïÐtEèO mÄ­X8h*H;ÀMÓvÀ»ýÁOÇ]Â³4eû5teÀáÀþF~ î­Øx8Åð-SÚ@Ç8ñVJ$kã!pq9Î¢VÚ ÆvQúÚø#r8GÎ\½"ÎêÈërm"<:ê§<È­>zûMÏyºÕF¤§ïÃ½K=MÒ ù
¢:Ù©-® Ë¥5¦¢wQB8ó{FKJÂí¥×|=Mð×Ó ;ëÑØ,·Ý×ü¿Ø5W (x´pG PHnÛ¹?h<{ÞÙä@dÔ©ÅöP¡ãc»Í)!j÷þä+²°#e'mç¶v¼aû¤°-S_j>{¥õ]àtß:v{àkËÌ¤ÃE
K6|«TU ×¾DsÖSOBê5f×Ð7>=}O{Àzåz]{Ü0]ú?,Èr?|ØÉêÀcSÄ1X¨è= Acè£\íVPÎ_Ù=}õ·ë8)¢ËÌÑaIr¨$nÕRòiû^ÇP×ö&ROZü?­= ¿øªU-î11¼ðÎpÏûGwv5h:üç:ð©d>D¬!¤ØÊ»À¶]dæ/6Äð¡ñ	e$MZZðZ½Ïz4:J-¢lÎÆùs¸SjFi= ]2ß,L=}
T©°ß/åM]ñòÅ·qùfâÚà°ø  5WTÍéX±þ´|Ø^ùh£­é¨Á^»Û¥Lv£~s0k°0§6Î77/ÏP~ÞS]	Ée²¶[Q3¨s¼Gú4ßÁe¤CU$¸ÇÎZ<bð)+ÎXÇº4Ð¶¡rÞw¾ÿx5Keé¶§»òCCfEõUó94ð/r¹¿eEesîIÊRxýSA\øâÞûJg0×Ãü/K8Ë4Ôø9TÛxÞ1:ù¿yýy]Ïný©:½»Ö,m´ÿ aÃEFÓÈ<uìóÄÖU!Liû@	ÖA¿¸gÜx9²ñÁµ¾éyhÜé?
ÃÊ2Y{pUà*ªi.fË£ »¹·6÷Â}/¢Ä¼½Ð¡ª±fÿë°×D£=MÞñm)·{´tã0Á¼zßbQî­'º3PÅH¬Èä/e]¹ÑÇêi.þ§¿X>P-&Bqnê§h"sq?jÊêû./Ú>ªÓô³­×Ô-»¦pòÄ¼¡ÉÌÒd"²»/ÀDG×¤óÆ= ïî@JzÜoï= yv¤Jp
¡<:1XEÀTÖO;þÎÂmà>NÍ	¼®Åqùaõ+¯^®6Üè= ·ny,eKAädÔ¢ÚY}"ÖÙ"®KsÆÙÙ"¶K0¹¡ÂÁ+hpèapUB¯fXw º*90HÊïì×Mñ= pÁ9/9@HÊõt= b£¡BìçèxWw ÊY.9û'+@VÛfEÖ­+Hô	Måí×B[ÝaHÊÊÑ[ÝiHÊÏmL~èÎ¿¥b¬ÊFv¾m?9,@F^¢ÿ<zsM~ÜÇf.ÇMÑ¦hD¤0ÅÉÅ)âMÕUÑÉÅ!¢_D$/íÅFiD$/GÅé×GLBW$àõi56ìýÊ²f,¶íµë¬â	IPîJÂLùbC«Ît	e¢P;bdÔjjCjól^= n2~
B}
jõål^~Êß¹êëlÖVsºþjRtê>!ß¯§z¶ãoâá¬ o"é¹jjáYsú*[§ko¢ ªÁkøVs:½ê­ålv~J*jÖÅÁZÞä¹,=}SH¦íMàpE²Y$ej¨×|ÌÒ
õÇ£#ÉÂ	·O=}ZKçhM»¢BÇ¨²¼¥¢Æ:Ò ú|¢Ô-ÃêØ TÈn½÷T?é(£æ.øØÚwHçª.i=}i -(Ìj«ü~<té=}ÓRK7	æe¸pI
Þ^¥w»z?äk=})æÏrTÃ¸±XqdwÜbþ#µæfgÛ:jJÅPNÃ¦Y²ifE	×Ë[²}¤ì¾1ÿ²3T#'4nÆ4*+z7Ë×ÂÊÜm=}ÌÅk |0¿ÇIø¨¶bOVÈî² £ÒÄÅÚ×àÊ.òÜöûøF3=}cB&*1£L0¡!Hî'C.!¥[àCE½µnAÚh:°ÁHzXúV7|à.b*þ±Ë®ÇßFÐSµy\/Ê!H¯¸ÉO¤³y·)^&ÎD$ùô¾óvÃ¯o¤öÆÿnÑ?zûN«Ä½LWý:X©|ä?¹Ç*1I
z°"ZK¹Ú4å"¸bÉ¡Î4­ÑÙ®kM2= zîbü3zé~>#MÚ#G]Àbí'GéÐ¶ñW¢ëßàÄ*ó((Ô¯<saæzòë¼òHª´ß}ß ÐÍGÙ,ýI^VóKr	¨{è3©åÚÆ²Ñþ ùi5=MSI®'=}®ÌïÜÆ8Âîù¾,¹ÅØ#Á7¤í¥¥3óÀHÖBýUpv_>uæXÞ¢VA÷ÈPÈúÝüÙ¹·(Í	/ÅW+ úÒà]ó@¶û>­­5îL¯íH62oÀ4	WbQ;ÉÿuÚuÕ¢r,º¦ÿþé-9(,eDégÙÉËDr Þ³C1I¾xÒZVsLäðó)ciLTáhÝÜÙ@Üªqa¨Ï¾½.á§ûUÀeé6¸å~·ØêÌ àô¶²8
ôEÕ#= «ÔñÊõúkZ[Ñ}Â8LHTÈzDõ½8NòYÿ¥#sô3
®¸L¨²ÙìêFª3·:¡«v|óÌÒ¬ÇÏËÒp©$årv)sÞDÖ"ö/vgU¯tÏTÒcYþ÷¢ÚJ£îg¨5^OÚC©{èè(bS×§çl_UÍÚSIôÁ~sgç~ó£8¸s°ó2zï¸ôOênç(]ÌY¿0iµ×µ30¼¹õ@#*õé}xÂÊR|-ðéãðÿËß¯)ájn2î=M{hå b,Ñ¸:½)O×ö¿JXû¨×üÍµ"íTÂa-H­§¦ØXøK=}= ï+rtáT°ç,NJ×WH[A±s´òÎæmÉ¬½¬ÞÏsc©ËVz%íKÜâîuC8_ôÆ®Õ¬q¡w©~ã22pýáúL^§o2Û=Mõ!ã§§lÛnÐÜe
ÄL¼Ùüz-cäOà|Ü+ó¾ÚÑÿ©-¥>°r´êímÐ~#fÌ
ý5)HÉo¯Ù¼éý{æEñQ}+¬rqå[ÍkÃð=M&mÊò§îm8ÖÛèz= [ØKfió/géI.#^µ²i}c=M¿¥räñöpå¿Ì¾'ª£hgFÜì|D¸é?ô=}e)k+cäPö*as!±9hb÷b_Ð´Oàég2Nq¤<Ú{dS9wª¬Õ2ù£p=M³Û÷¡\AÈÚVÓûPwã­ÿ=MO4æ÷ôPÁ>¼HéÝÿ ~
õ{evéV"rHz= Ì	»ò+i5¨Z.%ÙR.´¬Ìä¹ÐT×Ë°°µ ¯Û}P¼÷é+¡hªì
= Êçf!Üyühí¹#-æ:øZlNúÅLwpÌ]+£e1÷D>¡ñP+ùµ÷¾rZéTU|Ni¢;G{ÃoÚ>1 BðT@ÉÉ1¢pÌ-T©³L4>§[h¡[Pkàh*ÉâóÂçÓBù­éE/*(s*áoI î.4ïÛéfL·âh¯jiN¶+Ëx{TÙÔ^#ûø4%.bþQYYmvì(ÓsTdïDí­+±5µKìÈtR¨Ã^³£ÿUfÖ®õ¾Wä3QÀÏ¶ù¥¥ò/²ß0ÔÑ[ôü¶¸w8JÓâÑ_1iNâì§Ófy3Ö>M-Æj7§©¤£Vºg>¦¨ë5õ±ú²7C3[¹ÆgáÎ¶¤fÝ@K(-=Mnÿ|ó³ôh07ìàøêù6Õ½G6ßþøBg#ã¸i{úº7Õu"7(Íòúð»Ì>µZ»T,ÈºÇçð*¯2Yw+÷÷ÓÉIyóUi<üÂQlcYQ>ÀáË_YÿÁom&}¦m7dàybk«VQo¼CKrä8i¶O°÷wb2v$pp(/iZ»ÓØ¯Î	5!Î¹?ÈCÝÑ³ÅÔVÛõ´ý Ç:¥S´ò=M¼=Mºá¼qÙéµ,Ü)oÓlÌÙ5Øù:ÿDÆOHÞülÜÈ¶ÉÆem«O¬DzXF³vÑHÈÊ!$ù¼ÒÊ6P?õ!Í6owÌmó1¢ïL÷/»n¿áÚóy46äkÎ	æC*à§×ÜRÞJ­}w7úÙ@P%SÛNE_c c2ËH-Ð·(õrÇ= GpÜb@Àk%XËå·xrG^íqvR¢ó´Íô¸¸ eÀ×uý±-§GÞ]îþwBa0:eþ3§TjlïÓ=M»çÂqµ'ä¶gGS2ê¼^?¶á#ïî^jT$nãkV-±¸5;Ï²"Àª¥á&*,nÝ¥õPòÃNÀ®.êº]=}ÛkB&Ñé¬fáäÌ#í?¾lo°­Ën>ý=M<wv²M*¤¯Àm}ÇÅß"u=M­é'[TºÉ<á¶0ÂÞ³¤ÿðç¿%¨ÕY_µº¦òì:®#xë»Û¨ûI·L÷åÁê	cîJÑäÐfû¹rhro[ì'Ê¿= ª0Òî³Wí*o¨XU9ÞÚUed6ÖjJ2+8ôî¾Ï~x]UöGJÀðHß»w»97¯nÁ¬b>}é9T¨mg¡1·â@î5E%Æ°pÕ¶I6þüÔ0úÔe²N¶P«ïÆy¡ß=MH1BRóçòúÇÏN^7¯TþuêµÿÑÔ
P×òsµ×h¾5ÉÇ¿=}·»kÏy¹	¬9£¬+36Lî£_#ö³¸²£ýÅ¸u|9Pv#T·9ç'Á®bÓ°÷ÃRkæmÁø+ÉtCÞp~fK¢°
IñNÛÑA«}¬ã
 (Þ£Cw	{þ*êÇºt+ª¶ß%Ê CqMtì°©ß)­Éï,¹2Ó\ÆF¿y/»ì1(|ú¯ÿÕ"÷ê<U'æbúd,çTNq}I¯êD(æO$Ô *È¢4:&ºOVªý®"¾82¢vÏë	à­>\&ÂÑ¦èk|ºvàøÖÛuoL¹_Íx±3þSá ð0yß/ ão«u.-ÁGá(ÎJy	«v9=}²÷=}Vz[bõ)1©ÝÇÐÕÌé¹¤Fô¦u³g{þ¡µåj~¿Ý8ÇBÿnc­«­×¹35#¨hìèFÊ3ÁT>=}±9ªl' XèqIÄÙ4.Ò§rùA/wK<QÒorÄkP{õ\­4	ï9,ñ«:7ÀÚ¤|ÓPÇ®Në&Ü|­ácxêö'«ÅÒúô]ÿxîÌÚ;öÛ¾Ù2ÒßäMá óm^ã	ï»÷®ÊölN/,9=}±8äúSNl02)VJ»ÁÊ³â´'¾Ì#PáÖÝÓxEtij'DñyÛ±lÉFÊßKð£w]Y÷¿vyÛÙF= Ý;w
çyb
Óâõx³íCË{PIËRÈPN9ÈWêþTÖþÊØ|ÚL6­8,*ð%Á4õU¯-¿þã¬q§ìÿd©±¿3Ê$:*?iúP@ðý¥ü Çéü8(ðÞH +³f¸Y+ñ©O¸õ$¢ÖÕp¡á.ã_¶AÕÈn¸zO ¦àõàµÀW´ÏØýPÝ§G¿'¾BõDënè/àD}ÉQ®¢ä3uÀ»]ºÉ{ß@ñ[(«áRy×9*!QÖ&@ÄZf= ÿ0¥þ{a;à¦.+*Dóz½BíC+ERÆjµ?ê.µ#¨"¿'lt¯ã}õ"ÃM">ÿ=}­ÇiÛ;½:TùVwÏv7ÿ,kD¢Z°D&ÌX]PÔÒ= £±G~Ôvÿ?l¸èp.%ç¥rÌ	ºÙä¾ÔHv÷\4fN·º¥NrcmuåCr~lã¯'m|4ð1ü[¢ÛÑX¤V÷óÈé?Ó	lyåc£T(ºàîì+ä'c±âþºÿ³=}£ôÙV:!»Ï¹1QT[òOxè%>Ï8E¶SN³a¦n*¦ÿ=}û\!Z¨m§"@1Tiû©ÚÀ¥ÙÇ5\¾M4ûLP_T)hÐÂgýI|­Ùi[¡,TpE	÷ÚÁMcÉ/| j"½ßÆ_ÇK q«´¥ÿO­Ìê¬h·Q¶+×8ép\V6âÅö¶µÏ.z¥ÆO= =Mä£î;ÅçäoúÌ½|ø?®v÷TîTÈðþTè±÷"¦ÔÎà:ÃK1ÜnQuãÚ':vÉ«V*oÐ/ ²Ë±¢4;SÏGö¾ö½#º´ß¥(#­CjÁ jBÅ49#ër3s^&wüÓî­yI#Hl£Ñ£ÏÌhà)È~{=}~ÚÛ·§H¿USÄ¹9ÐÐC,{cÉ*L	(ë(J$×Z9÷§A
eåÝþ<ÕÙS«õßúl"NnÐ±Ó?ëHjÛLÂÝÂz«^U¢ÓJ­ÏÓBF7åxö4joð@*xðî»¼õßÈ¢!WWpM&z,ÜE/r%fcõÛÍ×5FÙZ%Âîâ®1¼ ÅZ{¬zÎé=M­(D 7®CòÒ:<-:HsÔhÔFMS½5õÑ¨NxðÌWzÆ©~¸«Êf4¨Ë¸P/'Xc$öÉ#öÌHrúDFh#¥»³²u/»4 µ¼ýt-ÝbtÅöñÊHÂö0v3ûÿ MÞQ?/^#@
'Ìá3FÅ	Ï"îÁ
^½ÕºbË!ªìKo¦xÇJÀÓw=}¢ç¾NdHiÃÄ*´CÑÚÁ 
[-z1ë_=}iaì pß
s²ËöÎ]Ü]}Ðiøe-ÇRÌ¢¹îcÍÆ5ì"ÂpÃOúVòõ|§Íüø²d/#Ø®eVróµMWEÍµü??±t¯7ReTéèâuxaZvÃÍVì¡Y\ðÿ8= f2½%N«_§4XÙ%6vÎoìt¡­2º-×"mÖ¸!¿B|*RN1p)ûÀ)gFs|N±ddM¤IãTrÅ;ª\ ?wßæ¯ZÍ5¡ï»-ðòÜ£ÑzíM?úúêÔ°§-@ô3Ñ#ß+ÑËq{ØÎ+õcÞ1ÃºÉ£÷Ã­p±-4\§tþ£º*ËBçKªvS*ä¼Qn9C2ñ¸XµPïâ9	¶«"9\ÂþÊnî·sÅ,ÊÎç£tk¦­ð· °(zµõÄr 	~ØgDµsÊULµkÔx0ý¹æ!_5è[/1,·ô/Èî¬)®!¬@ê>Î/@s6Úz$öC2qNP¤P_n{&òs]±;Op-öÄ½´î'{ÆaØ§Eólãçâ²áuo_&DEjñÈ4Uõ
KT<¹,È>ÕÏE/$¤ë7_Ý-ù¿ÿSÒw»Vmý5[Ëq¹É0²°A5ÈumA*^n0÷Ò­	­E1säbBN:÷°îëãìÙ.$½P>ÿF,Tçöñc­ïNõV:$t²Ô¬×_Oª)qÿ¬ªz.TD¢ÍÎ³´8Ac|äìâ
¬AA£p.°@$´mÙ}ë´oTdP¿BPÆÿåSÎôûn¾»yçCmÏ¼Ç¡ (³»¹wøB= N4I)]rmLÊ½Nçÿl= ½ºV9]YcÂâçºgéÖ Y¯I÷ý8v¤³ÎMSa§eé]ÕhPÑé= a§åUåíËHfëó¬iòQÿZ]ã£dxM¹= ®±«_]Ãh	­mNr·_Éz;k*¡fi´2(Öh4®é_[RM@hÏféfã|ÑéD6Omo¸Ì¢ëq:|­ªÊo.6;5Øòjb'6Ë@h¿fiyJ÷×«jêQÔ¼.GYáU×E ×E ×E 4Â'3&¯iMr -þZf¨¨wNYxæµmNÜd«2ôZþ=MY©/Ôzk§¥{FsóE&±xÞî âk~÷'æA"z©ËBõ©»	OsLÝK#áÝXÁíÓqM
këäÎï"Dï)é.l=Mòï"ÿ?î¹¶ñ¼g²;§¡¬&*­¢x8+W
£ªÄf= §a8ql²«wv[Â¤jäyÉËÝvJz´ÃD!ÍkDún.iÈÀ¦ù[¢ ñ¢ÌcðLQÔÊIÅ{nzJ0¦Ka¸«^ìçJêÌÛ"µª5:	V¥àÞ1&»KVÝù,ÌnÑi@Q$3¯@GùKæÔÞOÐæ®7X½áHÄ}@M%g2é%û¤%.1Nà9¤cuF¹Öa	tëÊ¥\ÇN÷2çû]å®Ð°tIS!SåRÍ^	Þ5ÞÞ¯DD¶W¥7r÷ª³¨4¾Ç¼Ð9h½Öýñ52è´²ù³,­.a^{=M,Yî3-äï{ãï?î¬Xsnìpfo&¥Æü51
]m#ìâjjÿÛ²Ú¹JuÑþ6]IZo'HØ!G3ã7+ÝÙOÃõô·¯S¯to7t¸N]ÑNÃéße_LÑí	!è>dÛQå=MYÙ(_dP ÃXq/PË¢=}MÍ¡Íü;×"ÍBÌÑÒÑ2NpëëêKÎ¹s£ZEGG5wX@Ø¸ïþ¯yÖ0áGè3ódáÕAÈö\Ós;¤Æ2Ñ²¢7o"= å§M,É±3Ïj²j Ã.ä,¼¾®¡CMø8¼è$pAzòð¼ã¬òÛ?è	
´Ôn«ZrìMÔº3M<23uº¤õ\ü:¢îYÿc#³æ/a³åeÒ4pÅÞ¼{\Éö¬ÃâÉýý2"¼D;®%¤ñ/üdSî±<¯QkË¹x7V]	í¯~39Ù¿2_É)¦¢lßÄPñ;ÜÉD³»HÄD@¢Eð^ü|Äéú~»ö·iy ­LH8Í<75:údåkîhYoaÆbkg¯dÉ^o­zfkjdâ¡F]änR»oumqljstÂjrjjrjjêrjjjjjjv¦½Öî8Ny¡·Ïç3K}¬ÃÜó";Pv²Ëâý2I¯ÄÜñ	7KwºÔì7NyªÄÝø.H}¨¼Îâû(@¹Ñâ5M«Ôæ .JµËãø$;O}°ÇÞù*E¨µËàû,C¢°ÅÛù.I²Ëßû.H~­Äßú/G¬Éßü.H·Þð2J°ÁÔæÿ,Cª½ß6K«ÉÖë<K~²ÍÛí2E§¸ÇÜ7O Ëæô=M;O¢Ãàë2Q©¿Ùø=M+H·Ñï.AR´Íæ0FW§¶Çã9KÁÚò&:M¾í $5Oª¾Òà3P»uÖÄqÆý³=}Iz¹ünl Êí¾¯V'ÕÂYúâäÁOþàÊY»VôBjÁ¢þ|Éû}ncÐý&gGc¥98V6éÐCúÆ¶Ç®«ÜesJìmÜkAÐÅrWÚ¯ªÔÇJªPX	ú1äò=M®ROÛµª ª·*ïíý»¼½« ïg>|9Sjå#Ä#y2ùªlh,í^[&Dîò¹<HF½®¡«O³xdÝöa{J·vÄ±s¬6÷PË9Ì4mh ÙëEr= EyèzÛ8³uÔ¡Òa}g©ÿ=Mé=M2Ü¡JX-ö}tz|ZíñçáZÏ=}ÅRz<êÖüs*wZß<k ¿k^m¤ù5*AZçoú}Q3G«8¿cëÂ|µ6¥´³_}±¢CsÏ°ó×îìò*Ôs!å áö£,ûü=}°¿À\jQuTkbwüû.¾ZÞwzMïZD¢QªÝq
&=M4±§{­íÊ´nÂX}Üìn¾§Ó.÷.k­ª £ÞÙØr#mÌ¹ê6Ak[eø¤³aêI|sAÎ~Þp×Cp%ÑjãÅ.õQÇ0ÛüótúFª¨íÇÔQ;ïÊAìäpÃjUüóQy.È å0>X|Áñs= Í×±ù îì´ÃÒZÝáåÅ]ÅÑ9fÞ×5aï=}í¦WÖ6vîdíÎV¢úã¥]®^.Xõì]I}ÿª:Àdó®@ÕÒm®ø@;ªéiééÕICh®;¥ Ç)d¤§!Â§¬_a©iÀSèçgä³a_UßK#ÁS;ÁÜ<üHÆ'Äüiáåa9ÁcIÐ&FçM×Ûa8FüLöd$WcßùÈÉU»ÖùÀ><~6DIÉTÉÆ?Z ")çåäXE$WíIp¤ãÖòZÅiÅ=}ÁMÌäí²6^!É«yRËPµ½SÜu×=}èÔSÚxuc »v¦S|ßaxL@()¶/¾8xÔ*6[zÕ)M¨IÌ£o6-«= Øs*~wûâ¯¦fUUL®@ñB²¤×7Â7¬2tû2ÊþÏ9¯Ò§óúü°2«Òm¦Þ¬å
Ýö°¢q6 °X©è(õW|Ý/d×%xÈÙQ­^vÅ~#²»Gw¯ÌYµAØGãb>7Tðx§íKxXË]=MÌ½xOÉØ¼üæñó=}ùIßN>71_WîKÚqI Ö72(ºhV7!à[x%¤[ªûÇ|#¸Ç"¤^DMdx468×<f¿¼yÆ&]µ5±Ç+Ûý¯/Qg"i|Äöûê,ùÃ©Éå^= §sGþÞ
J\gA×ä° MÆôö·k&ùIßZ^0¤ã¹_­¼ÐS÷w´*æþÕ:&Úãä¸S7Tál2È|¤á¿¶</=M!W#Ý:^{Å=}xPÉèB:+¡Yßcy[%ÜõÀ@à|¦õÈËµ@×Eç^¶c=}0§õsÈ½¯3ý= ¥çUÛgqº@ÞKTÜ¸ìg¸ÄIÜ±R,Bö<UùD§µ¥*KIîbU¥^ðBB$ïÈ%ÏåØ3÷·´ìÙ¢ÝOyóeÊ©ßì;èÝ õµ©ÞL4ýPùä0-'ü3ý= ¥½= ¿Ò£+áÞÍ\h	¸ÉéºeUI^gQïÙFÛZ.£ö¹Ê¨HÞ«~8ì§I:°VÑcÄãf8aHàîZ@ºiõ= m§­Q»´
´¶âèP«ûj[¹]u¾¤ÿøþðÕj]ê\»¹ØÅR´4üìE*g2Å,Å,TëñÛKqhÚKÓQÀªct?Ý|V2¦ZôWº¿imh¯&´÷¹¬_ú´*Et¤ßÞÇªß<Ñí­,à3FÍêÎr×9~º""ÙílÒ«×Irw¢däãFS¾.H°ÈÛÞq·v{iÕÀgýù~ìµòÂËJúl°öáu8\8\¸< 
í+m ×ãú)¾ÑpfÍõv÷ç3ê>KcP6wÐrÆÿÀ¶í:7ïÌ½muË -I*½ÂpÉpú¬H«xÜ$°íwTxrªMwN)ÿä-ÛhMµÜû.î»âúìÄ+"8¼Ý= vÐ-.h+µBÁ¬b#rx-ê= ªÿbêûæmñ%Ô7ä êüljv½6½;Ú|Þ<¬pQ¥ÂñÛËÞª*é¢e}dûkäü=MI!H*JÇ¸'míýJ~ÎîÁ²@ý= ÷ÊwÖ«ÒË2éiÑmó òÊãöúê3î«x]Jtê]5æ1}-Ý.+u=M*)»¦-ÇjEh(bÝrn»ëøüê°Á³¯ÙÝP!Tf¿ë0ÞbpF*ÅìvÂ«¤÷)÷É³ËiåR¤
¶Ð}Ùm¦4üK³Ðªø©&äO6ûV¾cy@Ã#ÌS¾é±gÂ¥µ½çü÷p)èbM/-¥õt¹ÎÐÖÈª@ä=M7°Ñx¥åh>SfÝYÆ(ÁèCI59âMVoÓ%øW4¯(ÁÖÜ ¾pá#2äÃè>{/¯/àùF_òÏ¿çÑÃ ¡ÌÃÓ®¶µÌÒlk ´§f%¥!	4øw¿ÍC±i>Â#¦¦ÊïébÃ:ôþ-ÁÑÙ¹hcPX=MÂíç§Q 1<Á²÷"'¼w^y^]¸^þcõJ ¸ë;DDS¯9ûW»»ÝÏ<$i}^çÔd<²ßh5%©ðÅgAÞ§aÒ$Ö×¸6FYNI|ccE5³¯²ÕÂ»0ÓÞ   ÔýÆÞáì!­¡ã¥÷ºÉ	³¿¶aWj]_9¢O£¦=}ßèïxÉè§,öÙFÂTtuHkãD£í"gM¼ñp!ÍPºRYHdÛôõl9S«àXE;¹V¿sùòRºíí²=}ò÷°«1íâªêzÛÊÆä±rúÖ®ðñº÷j$kÖú¬= "y«xäwÞF@ùKM)ßþoÓ-ÍAý<ì9¢?acç¿úBàî7µÝ½}M°­vK×J]#nqÂÓõGäç#Yù·WiAg"Iû¬s0]³Àè]äiTcFghc=MñyXKXTL¦Ør -«¨Tzäß%Ú5DrÄ{¬Ù¬Û¨R9dmçÔ)n;ûf= ª= 2Þ qãßø6k? 07 ­·O1L cê0kñwpd$EÈÆ¨þ"ÓWôC+}°Ãucv_¹B9Õ¾G"¼&ÌüMÚ½m÷­!¨È44B&Ø/&ëÈL×·ñTuâ³RI¢É¨;8î®o\ÓM×*jÁ×Z°"×Û;QiÅøX¥NIÑÔù±9Þ!tôÆÍÕU;XÐìé?Seg°Tqu­|Hyô&"Zè¸ -¶v_|çUgZ©Ð4¢½k3»Uvx^à?O3Ñµð[Û¾]=MT¬@PýÇ°\[«ihâN®Åçõ­ì2/þH1ÅQýP¸7­÷ñá®´°TMiï¹ÏL:µÅ^8zßÉw:Û ^#ÎxdDèÙ¨_ßhÜÞðwÉq_À17Ý@¯gqÀq÷<A°m	Y0úÂÖ^W/ÿgÕ¬0ûj¹CâyØ-n$bá%_cçÕùßÚÉ¤XN1\;B2h= å7/çÕ­W·ãâýKéAm$â^¾öDMw:Ñ¯óäÕM×ß»É59Ý·;A 4nm×>Ah^B4[äºÿÙ¸·KID ñ±=M¦wÚ0äEþ.7{ÛêYUæÝW*T*ûd¹i qê8?ì;0É	Å	ËYM÷×$ø$4}Ûõ'ðu¿R(_çÖ¨!áG¾qu(l1¾R;eâ^cÔródÈ/ù@«géþ÷pþyLÇcÄÒ
e·hü{uwæØ#~Î4kTRÁvL5ñDu31ußù¹wÿ±¡px¿ßQ5e¢e= ­r?Á	hP+óë$Úçd_ÊáÑÞ>Qç8%Gz¼=MápÞsRëÔ·ëw»Y5n¥ÇöØ°a;ÿoe?º.ðÊ+»e+Ar-bD_5[ÿÍcDg>âÛ<ô´:ùøüv¿KbU-5u³0r£Þ÷áøyz[?RpÑ=}%¼Ö_áéÁ­Oû÷ d­VEL¬[Þ"¦m½8(½®2½Ë%Ç%Ù}¸âO§´éÒVJ¢)#µÔâðÀ xèíµ@iPõ½*ãµÏ²GÂ 7hå±ÖÙYJKÇèe[½Oh« °÷
M£øPÅÅ=}?6UÒÞb£;äþÐw¹=M9?ÏU²ÿwIÑ|4IQ»êÓRJöîoÀùÄ {-È2ÑóA= ¬Û*åF4­¾åÌÜÍÖï Ø ¥Ä2/U¡ÔCd¥ç-éEù(k72ð8÷iiCq×«v
ÑÖE& ×Eà×E ×E ×E Wà©°#@(dÛüS2ÙöA¯bA= Rz0ïÚÉ¬r[³æ®)IL¬ôUb9ªX%¶ãÛ÷ð,iha¹ðÛ¶Ê|½0vÐñãÊ{µÂ0tÀðròønü²÷v2ùlôötøpÒ÷x$RùkðËÇ@Ñ­ Ð½ Ñµ ÐÅ Ñ±àÐÁàÑ¹= ÐÉ= QªxPºxQ²øPÂøQ®¸P¾¸Q¶8PÆ8Q¬P¼Q´PÄQ°ØPÀØQ¸XPÈXQ«P»Q³PÃQ¯ÈP¿ÈQ·HPÇHQ­¨P½¨Qµ(PÅ(Q±èPÁèQ¹°÷é0ë³¶Ë/Pê¯ËÂ/òð¢|²ï2ñ¦tîð¤Òï ¤Rñ¨pÌÄº}~:+@7_2³¹8ÏÝ8Q×À÷ Æ89>ö½(Ï#Ù§KÍä0s}6öüóÐ°-ËM3ObäÔØÖ©·¸=}7þÑ2Î£Û= å¥ÅÐÝ6óQD%ãäoÉÒØ¦EE= ØÆÐ¹EC^_©ÅWDaßÙîÑ§Ol3ò_8¢Yøá°ì|VV~··Ô5¾Í ÄÝ>= ¦§r]b¬§S®ùäAÝïHÎºõÄ>3«°÷Ô ÃVDÎB5¸à5 Á0çúcúV±6ÊÂ9¶ ÷6Ò}D>6 ¡%7:z¥ =}W7à±HCá%EC§CEAedChRíGåÑxaVûHËk©@¥ùaXýÛô¸ÝP8¨µwQOæÇ õ?âÄº]¿Ô)ÀyAUO§G!E^âÈY@]çäéªpy5L»¦Î^Cµå¿ð5\(EaÏfû©ÿcQi4XqN­àOå¥ÂÌaxå= QnI¹àçdV8ÝFÙ¡ßGFYQ»sK8ã(aõRG_]¯V#YátK­cfñ©9sËþ(é;ÉÄoâ}Ã=M§áàý>ßDØí?÷ p!$åeMXþÌËÚÅ$/ìqÃ+'vXXX+_åE¯]Å8c%Uªilz)måìt5
?un¬¨+KnFÙnP·]Ól=}µì9pðv.Þp4»v"p_1úùv¶¤ÇÂ>ùÐ×ÎWu8«p­»p=}È¨¡2Êøüíöþ­#µxXd@tòÇ»
,±sgÊn³óÓøÚç¿µr~»~	½L>zÁþÓ*w:
hðpíÄ¾¬ç¡Õ¶ÅÒw8Ü×Ë/QàYmSÎyOåÚ­
A¢¬ÆQr½å¾&Úì(<¬u§Ûk¡IP= îY¶¥FZã¥vûzi[ê\
xF¹>Qãë]ðób
L yTác¬v.ÓMg+_têz¼Ìì[£îñ#Ó}õiºð mEd Ðð*>¥~Ì^?KzTS±ìøð£¨p,*ÂÀ1K]g âªV rOÉ*ç@=M(j¼A×º»:x__Woáþ)}¢DoðsÇçµìÓÆt¨Ó9³q[4îÜÅ"NRIN¬4ñÏf¯:ëúÇÐiØJØÞñ# î«'ËÔG	Ge-ZÏjnlê4k³or@jßpöHÝuêrj	u:{ê"BxmkJs2ÂlS¦ëþkÏâúhÊ«ÎOzØ2XÁêIn'l¼íÞ=}êH<ìØw,ì§ö·«å£­$RtËê¥Òìöæ÷]qc¥rf
¬H÷êÂu4ìÙ?ÎÇq²³x8.q ~<È
ÓíÊÖÇx0jYÞZUªuë6Æm|gÒa'JÇù­6(v+Ykö}IêÀæïÀ}ë>0ILò5ts¤òºÛ{QÌ	÷îÔ,ù'¸2!®äÊöy&äø{Ó­7Mðwöúçü{ÿhrÏSF¹Ð³/º ÀÌcAeÃ9½ÀZ ?I·×þsÍ= 5RLA=M¸'´ ý:óÜh3x£ãád.¯t$Ììéè¯«8D^ÞÛ,¦(~¨$ ÏÄÎ¾Åé¼sIéLfCþ!'­SPÔÜÏì%=}Õba½Ìi±«H´Õ¦¾=MóÿÞñÿ:Nö§Ó×¦ÂÍÖ2=  fó! B_ â¨-øH©Ù1¹¸ 8EµÅö!RdØø,Káø<0[¸>\@ÈM6¹Ú{W%Zñ%¼Õø>WL²´ó_X&ixáñÚù=}¡Æ:;]§øÈ¬T·!_ @Zû"É<>ù)-b=}bhÌD@êãiA@ê÷qÊk~NjÀÝê\%ªÆ|«!Ñnu ZüÂbRNBâÇë%vïÜpéÂ,ÖùQÇz¼­Â©(  -Pm»Â¾Atã³Êiª¾h:qù¡Ë9snæð8þÆr½HNûþ*1è6$ë7ôÐàà5¾V©+[ÊhÈ8 îFÐ5dßú'd"¹¶úáÒÝ¶¸%~ðãæ½n^q§V<÷Ï?Ù¨'ºÉ)dªNhÝ×ùö_ò)­ÖvápEô5ùC7ôxáB)ÏÍ	~ÑèMTÆJøVà¦âªÁæNß¥5IaAéd¡=}nWÈïéFåæ!+7ÑîA[=MÀ1.oÆ²@×Ë¸4C×!F<1ª×<ñgå6%,ìPµP$¿_&CI-ñÖQAe÷Ack­üêO*aªìÄp4ÃÃ±þÏ¦¡Öïñ¹JÝBmÙàpÍ.FÂNß¶lilhë.MEúb|é£á÷½¨H=}G·¸øC¿¶u~Ñ7Á·ÓÆcß_Äcq@¯xçW,ìüØQ©=Meí&öuìgÙ*iIX^úk¯?÷µ}tE×·Hh ½Bù1b«¹ÇÕHyú_nÿgÂæÀªYïþRî4èbZxPlúÊLð>ñ}g<Ç®$ê£É,x½ù³¾ú4OI>4Ü_UÐEµk±Çå®äèzm7ÉAïúOM×hQEÓ2>íãd}q²#ù}ÕæV£ªâjmD¶êÇ-Çú= -r9BûÇÖ¿>¨#º#¸8ÓW ÃT°F°pú42Txà ÿtÕ®)Ñ%eË3I¡:Ù°¤\í[Ü	¤;©>PT4?UäìbYM|0Ö¡R4ßh×èÜ][öÛuõ®QWG4S-JÍà¨Öaòø}Í1ONþ@f+ò¡ì~wýõÈfBVØ_ÄFc!u%ÆüÐU"(½æ#!¿Ç.»·<6oê/êãwEx^¤t%x²)æ¸BuölJ^½ÊÓiËìhÉ[¨[æ¬=M©÷¯âñm {ªõ
ÖÞaøejíel+gê¼õã¤"Ã^S*evfnkm2ê|ïÖKrÁâ*+r¯lü;,= :ÆcÇDSÍ-ìçßø= Ôf.*Xc3î {7í&G÷ q= 4¸W<Èòùts= Üû+ì[OíåNÏáÖz|N7CÓs?ÔÒì°ÅH¹QÌ)7¢à²)#SÇE!ô.VMÐ­Á7¦Ð.
¨i6¸WF)Ã#ÖhðôËgå PÑßA,ýÖÄ½'"Ü0ÛqaWÈý= Ù¥bóÍ<(Å É¿'Î(B¬WÒÔÎ<= ©¤ÃRtæKù°^_b çÑµ¿	¥(3ó	;×µ¦E®zäËEOsijÏi¦;\/¦hð[¦z§o§î,°§½PÎ§{óì§ñ	ý§5§;("§¤)6§¾K§~ôa§xq¨C^|¨É¨ÒA¨ôM¢¨¼°¨þ¾¨)±Ì¨ø0Ú¨é¨¼Åñ¨Êyù¨O ¨ãE¨ÚX¨B¨eÊ!¨{%)¨°2¨!:¨âC¨þ%K¨v½T¨HW\¨póe¨(vmÊÆµ~ª½ð×÷çÌE #½0dÐ×E ××&§ÇEQÓKç!}äa*0y=M¼qú¥ÝrÑU°:Âð¦/nr¬);dGL	ÐRaL²wïV{Ð8ö3ÚMÖw¨&´a@òþ z®¢	©¯ü|-$£Û¢*#5³Þ¥,/cÓÎ°ÏJG¨õ!ßEPu\Bá	
1oÙNõ¯¦Ä¿¶Ø¸sÍ02Ó¤Ñ¸l-±thy»Q
ü<X4¾DLFÅ=M1s´mnåµnéh¢'»:]ÊJ+ö±ì¥¹oÅIr©tøé{ÆgºiÂcÐ3éý&^"'.Üw]üS
çõ<1:ú¨²å3´v*SÀWø]g~Ó§6sý¼IÄ3èf= ¿
hÃM'1ÕëXÝØ \y\E¼gÏ«DÓ«GëD¸+ßìÍõoíYìCìì¢ë)=}ÈÚÁÉZYÚ+ì9I¾6Ó¿»Ý¿/mlÁft©LÒüô¼)âº/I×¿>#Þ´³L¤ø)35½\ª3ØÁäâJ_ÏoY¡ÚÁZÇ+Ñom°Â[Ç¸Cß£¡2;þ]°¸½£$2Ö+ãÑsuÕµZòÿ<ðfÈìX÷ÌpÌøaP½Í{\7¯â¸A=Mò@(¯Öæ¾2ï\ó¬t3¦Á*©u|Èª_l]È9ÉcBTPÍ]¤ùI¡OËñ«ÏÙÜ";ÆtO<)ñµÝòù3«ÕÊxÐ}¾÷Ý ©è2rB=M×öøÏ.H2Á×­×_} ÑL3èW¶´áÑ§í«mâÛk/S8µÓV|Óâ¹²-dÔ?=}¼;	ôK~èýJïbý3Æ&áÁà{îÝeT Yò;=}nh³ÒÜlïÑMã{9Ïâ$ôÍíÝ^hÍS¤ uíÌã§ð¬),	¯"9;î×õLþÑ~Ý#ù®@ü6{ÆõJIK÷sN×¨ËW}°8\ºPîcârÍì¬Õr0¡¶	d= uÌ0Lªln\Eøj6VlÚ¥W9éé@H= =M·&eÄçÓûcHe­X-UHS·éßÙÀâ[ÃEõd¹èYVóÐq9¤åÊ½U¸ñ¸XÁ#[ª-÷¹ÇC@ÜKcÑ8O£\ï}9üa:ûøÇÜJ©ÁqÀ±9.ÕWÂ¢,ø)×ãÍ5[Ó ^éÕ·­ÍÙªívB×/SóÀæbIü£¤ VÿÅzHÔ¸è£Ä±7Ù0ãV< /:n	ñ0FÞ¡P;À<ðûÁË2!ÁpñZEkçPù?±!¸yEá½#¤ÿÁeÞ5$\n¦6Þ3R×®´9³ö²Ds¶
TY[ç1S
ÛVF¤'ÈÍ;9-(]=M#¤Ó/ÿ=MÂ@¢üEûlO1KF]8#?-ZR¢öæF î»ÇñZÓ$ep;ayÎ@+k^Y¥j%öhVñ¹Yè= Ï-¨RDñ"HD<õl_È¦rX3M§z	%3¥=}hW°½µÁ·$u%Þà®Ñ(5¤Áñ·Ä¤æx>PH¬LÕ¼Ôó5wÀ	¿ÑÇÉßfÍ¥\Ix6æE WGøÑD¼Du,Dzº÷	n+mÊk~o*D ×eÉ×E GB ×E0cÌE ×8R÷*OCÐ?wìiÑj;­çÂ<uHVîÞË<T¸"¤-äåçÅ
á$Ë÷ÏÊ8íEÄ~¾=MN¶r
áüf¼.ë%r1u?e]5qÅ;QúsÿbØð.Ã»¸°dºh*¨xÉ0ÌµÀÖ¯«ªM¨"Â$òíÔà= ¯
W½¢= OñW¼ràñoãÝàe=Mç&øh\+îÌF)VóG+X:ÇUpÛ·Þ¥OMWËIx×¨+Ñ)Ä,-ä1628nå=MV UÍdË§ÂR*ä®u!HÒ,¨ÄäÅ?°½o¡ÿX¶fNK¥¹x/?<ÚÝûêJíàÙhñPÉJbéÈçkTÈQ)¯;FæøÏ=}	»bj?¼á[O:¦Õ(pø=}ÏR©'êfãÑË|å|3¼nCç1JÇçr96a­UD}¼hÅÛdWRÆùY;»Zéo\¡/!Vï¿ñqÐ&æ¤¬ÞJ,ËÄav;_Ød¿H¬eù?;w'Ü´
4[p3.ó= M¦>s«ãjç§R¯8Þ9ðÖ ûî¨ßÒ:^´ü³Qii
ÑuÈ½ IÇt%èëPOÞÜGÔD+µhyºº¯}]ÜÛp]iÜÇ4ôCQ9^]Ø- EÐ1¡Ý£èæ¾àÂdcÉ{/{8O ¨õåÓ%1Ûòz	ÃÔF#AÙ5Ê;¬ .¤@f<G¿ÑóONÜÏWÕbU¥¥c¡è[«ZjBr~jºVÖE ×E ×E E _IÖE W×\°vyb´i~5ó]Û_í I²ÐÂò()V¯:¡3]|il¯*4rÛ
¸Öe^ Qòý£¯LHù´û¤)«³.¨ùà^U.PõÇQBmç²§Dý«~wÌE² öËÁKâ¹7Ó®9ä6ÆHIÆê']ÌàÆ8i§Â$ Í#ï01EãJõýÇ= Ë%eaø
 ÜÓM¸f\£ØÈÎÞcÐ6%ëFíEÚ"1dñ®è491ºÚâ7-ÑÙC¢^§8øò¢bó?	3f]ÿI#}^m'µ)â:XySTé3Ã\	!;Ü¢F¾J×ÑþóÉ4SÈ=}Êæ¥¸ÕÓøg^¢Ý,ê´­f¨ã"å72ÂÑ«×)ÂÍHÎ-8àFSªu±PÜ¦>ï}Ø&2§ßÑÞÑ¹05ã£0ñ)Ð(= DêÛ¥í2ôuiºVu,Z'}+$ð²Ð(øPç1Â@éùMÐ	nÜóx³PÄt±³¥RÛâTÐ;Ñ¬xRP|	DoÇ.nÌÞðþ\¶v=}H6iÀ³)x?ÖäÃ­â×¡U³6ÓJ2[® ã½= |«ZjÂqìjº ×E ×E ! ×+Û(D ×7öq´\©Øg7@V©4z$· ¡ÜND2ýåÈAý~r´º.fýµ!Û«)·¿â= ÉÈh4ªhiª÷_u>5<²°ýåE[A,2ªÃ±C¦
­í¹UOÑ§>ç_&9ópïÜc³ö²ô P<ÍNÐ0~71¦Ó°×þ£·a7c/lezµÇ!.= y¨âÄ½ã0ûw×#ã. YÄWÂÓ¹C å~¢:^HkP£¢Fs?¸æg8ÿu©WÝ«%41ÄJ0'ºááQJêq-$ÖIN³Ù%Xâ[GyHf=}>ñ£¥æâúK5BÇÉÞ(aM©ûf²r
M¼j[§ë6Ávåèzñ'ìã¥ïÖçz,»q,úÇ0èÚ¨VuÑ­Àn°Z½±¨¯|_Ñ~#ð;ÆÅ79°Ì2·òÏféóM77¢x/i¤»»laÎ}cM9®ÒË©s=}Î´=} ïg½b?£ÿ;ß>$BðöÑ¤ ½Mû«Zðvb3Iõ¥µ"Ïû·@FÖ^ÝÒ	þíïÜ©PÜZ­%ä\âú1?æÞ8P£êÇeuÚv®Ô×P¯¦¾.SÌðäõ(¿6<&|yÿ:JÅ4÷>­¯Æ0eÏ5Ìé£°Ø~8JgAt( ¿<^i´æíÃÆ/µïÔØ!¿}ÜÑk7Ke~ÁA_ÊØ= ßBiÄñN¸ës_ÎQÖmÝbaâm÷y a®ÛX·h@.0Õ·Þp¡]AþÐNX¡Ý¨oO¶éBìÿ;S~IÕ÷/}D²'D°Á¥(ÙhéW^ÅàÚ'íößLûI3%/¨TÎ°ª÷Iácâ¤GFX°á³¡Xà=}WH-Là_gq	òÈàéI5^m'üW£y	e2¤B1sSèÀ±= Ý¬>¹@èÉa}Y*Â5j)ÊOOkvvp£	¨2=}	q®ecPx­r´ðÚ¢îUh.ñ 0
ÊÉñãÍu!ð;;¡´ªÙ%êoÝnÚ_êá0¬Íïs®.Tðz­{ÏXÏõ¢C¬èøòÉ±®NÉ;e¯.¿uÝ.]«Ð;½áô£ã¬¶7}û4|×ÆyýÉ,Hàs)²¢¨¹,|>ù´Âä»,¹VúcxgYbNZG¡ðWTt*¢´õ²DÞCt2CõXØSxK<ãÕõÍ¡àxàÚ= Sp%Å*ÑHè¹IéZ £/¦Ñôd+~ß|O¼þiñLe_~±Y"þÌN£ô£~YG"ëÌ;Çô¿¹ð)2ç"Z/ÁIg·&LR¨ô!diaj/Xktg~øhJ@¯Ë,åt½»ÂºµKdtñ
	«.l8
z¦öìXåR~, ³¸t3ÊksÖÇk×És>Ô´
³vYÀõ+-ÈvÉiô
hîr¨îó*ØòrÆz,y|ìÃ³B,#QoZÂÂjXoÁyÜci¡]JéFãu)LÝaÍxBPªæ± ¦¶6ð­J°ÚÂ>ÑìÎ,V½º¨m= ³ñAÓ4¥w }*·kì°ßtÆþl?#u+°-b²©ýrÏé|ª¶|J´»¦Iòí|¢rôïLFÚ©{wU±+l7¢Ï}s/Ó{%þñ+h!:tE÷¬
1ãk^/o-¨Óz&C|r·1l añm_èPûR)]ëFÙHºbEuÐaä,[èyâ@Yx×'ØPùvSÜkIy8zi>sQ$m£ÍyÙàE+O ÊØmm«5lJhl$ªYhæ"ÚH|Pê=}ÛP/ÜÖ¼u\9Ðíb>bsõÐ*Ò÷SÚM(:'zÍl8¤0z\Dz êørç2q$¤
&Ü¶½!Ý|2r(}J6âJ¸øï«Í
¿Ðö¨|âöêÍD:!³u87@î$ÀßZ8¾mÅ?Ëº¼¤~.@ºé¹àtþJ-¯J¡5-Ò§£ú'= íÊFküÀ@µ$hüQ)2UIó¹Y¡°KuÛ¼W9Hý9ÄÙ²(@µÆg;»ã¶ìÏz=M)WN½ué<²¸A?{I?nyGgÙü»ÃA2òª2ûQ}hQãÜ
cvCÜf£b9<"
þRÿúÝq²Ë]Þi¸\¶÷!B¶= 5ýßÕóf¿â£s!î>©Ç®ëòÍx		°|y=}ÒJÊr:= ¨µ§²Vá±LÓ·¾²7^ÃÎ-À}ü?µñ·=M²HÂ·¬u¾2
 £¨5¼g4À&J|üD¢¹7´¸Vá\n!®à![ÚR"î=}{Ú¬ã©Ý#M#HÍí#(;ÚT¸RËÀ!µ5QÝ,*Ï18Ü7H´ÖÞ¾&tÁPRZÅ){(U<lh=Mñá£ÙE!t£2%Þy¼Qc{³fhé½gw	G/1	JÇtÓU(/¨1÷ËÐÜýCómd6ùÍTaÐ cÖ'Gä7ÁlÂ
­¥?-Àp%ù=}C2¦ÀZ¶6f¹ø6Æéo5ôÈ7ÞàÍx7/ÈËu¥Ù#ç³G/Ü= VÏÆGkÐg!îÏUË÷1µX= ÚQÃÀ*9ëP ´]U¶Aau·Î;< '"¿ÒÌÑÄÃÑcÇ f= m= i0ô	@@VÒU@G^[VM7JÔõ¤[íWFg÷Å?7O^ëv4îb ²x·(3Íá$ÁKî­ßt8ôs-ÚÎ÷ÒJó"­uEñÍÈ3r6VóAl±Í63Râtù4}= A®	ö4/½ºfÒTRRÌI¬§æ°é¡*÷¥EA	«bÖôôd=}Z¿.ÞÖD¦mÕÐÌ­aæÒqIq9/IµPKJ=}Pâ9lÏeÝü DÜ"ð
A*y%SwH/«WÚN¹åþ¿Ú.ÅD¸¢C%JõÃBÐKðÕ£á¾py27a,ÙÝ&.6qußæ;ßþ@eMY©hBZj§lM´z8Eö%õJhz ¥¨v×èñK+ðÚFæl]ÛôÍ~ Ó¯Mí;²µÍZgÑ.x_80=MõkIRL	ó"ÒÍ|ôVý[gaÎ&#éxßµ+ÕÇbÞÅ0Ãt:ejaQ	Ð¤µ1qúë±Å§}­)ÏuÏÙ¯ ¨¿3«÷£"¿£½ NLdHÆþ34­hßH[91»¡\[³kØDÆêOéu:zþÌgx8ÌË÷z·~¸ríóä]l/#±öõÉò[c~sP±µ:Óùn'X´ÚGº4Ãµ[¶ð~¡XÿL;ÔhVþÌX²ôð ~?­Q½bQr/Í¦/_÷~y©bc/î~ähá©/ùm~HfZYÅt?~.eÖ³ºÒ´+Nÿ~8ÿìô~J$næÇJÆpícÌbçºnfêzcr+ãå¶ÒjÏcl:8q±1¦¢{uË£Êþwã¸Ã
ÏsMþÊYg¢&Áj@¿³ëþÝ3Ds (²êNâYÍËßÂvæ&}olg²:ýðí«×lè8+ÚzÀY]ñ³&Nå-1*©ßñ±aÆ«4.+Ö§B.C¬-vÕb^õíuQQí×üo>qTÁÑ-êÊbÛv9¡ïbÈêmIÞK¸N¾"À£s¸¶ê=Mõ1¬ÅeÚlöüÊ½¤þ¦Áoû tÂÂ«Éì¦&Å¨¶q²ÒPÉb¥;g¶8'ÀQÉzaÍù²C à¼Ô¦"³$2O]²¹T¼KCÂßòÎVôE2WG²[Ü_,©Ç²rò°Â~]çý3ÉP®YÃë¤Óú
kÃüe%+!ÚyñÇKpWKäàP¸âÛ[M0Ú¥ð¾Åÿ8!$ÈÚ!6>¨RHtaçèÄ¢©Fßº,u4©SkY\íéO=M2×AÐ)Y·Ðñ?é×ÂF¬Pú?YùÏH-Ós½_Å4= ÀÐPPëW«à-ò-Vh#MãJ ),XÌ6RL= Rãw¥E60IÍ#¹ÂQÁÙdqà×4Á à2¹ UÇ¡Õwý«ÝÕÃæÈkág¾,ú´f'ÛdqÕ
a²×Ùëô°Íý3¢=}¦koÓý["xÈHñ£ÍwÜØ< -\=}»YU¶&V§qmø7-Á§RTÊïÓ5r8­ÕÆg?g°¤ÊXÆæRXìØSëQ­&úâbJ8#èâè®jÐçx.EÏ+"¯ì·PË]7¡®ÓÈõ+GÛBºùÆ(¤üî4u»©og¹L.l~TÍÙp93..Ã²áÎM%Ç£"Ï½´OK@æÖ*Ótï"!z±´ï"Cºî~°ôgí±µú¦û
=M~1ÿ²X~§r/G¬ôø½F;¶;X}/u§~i
cïG¥>SºÉï(Ý|ê5ÌÄìY ¬ÒjwæbDQÎíüÜÞ·í)=}½Ë-Îà¨kf1,ü·»JSxxáêsnM¯(z)1} $¬ÇôÊué¹ÛÊ§+l¾oËPXÓfî{ÞV?o2nl=}zÇ¥¾'>STz²»ûqgN³ÅSVäµReñNI5wÎ¯6wLCÛûc¨eàý(ð_®ZÐÓ¸eæ2ÞYã_c¢<.ÜÌ¸ù¡ FTåèÊãAÃ»è ¹vOc1&Öù|5½CVáwÐäÃ¶Ý4 ¼è}G"ùõ¹Ã­E?éã,&)èÊÿáèwÁÏººkßy/Ñ«Ù ÷-WAMZ¡äRDËöë=}Þaf1+|eTs= 8 -ô¬þVÜ-¥&ÚÌ :y,BµâÑ¬n¸ùô°ËH¹³®/£uÛÌåßµ1ãE9PLrÓ¨hºòý¡uJórÞõe=Mnñ Ìø¯~(ºfùåjàÖugÖEA ×E ×E ×E ×E ì7aåÿ7èæmvì.ì4 pUì*Õ¼+»jsÖ¤ìçlèoZÁøçl¨k.êkÚkjÇÈÃÊpRº³l¯
k^jÞãÏë·|ý}ÊoêdC´bT§.ñÙs[Où)gc9é9J²Æ¦æl¬¬Ì|¼Üt´´ÔÄ¤äp°°ÐÀ àx¸¸.áéó2SÂB£#ãcnî®.ÏO~þ¾>ß_vö¶6×Wz©,³SÂ#o¯Ïþ?ßw·WÇ§çmì-Í}½]tôµig÷ÃªÄ¿A.4+75©¢¦¤§!$(éÞÔØãçUZf= e)Ónÿ÷V'-LtTÅ%qÁá¹Ù)h»¬1@¡'" çÊÌËÍiPQ©ãÏ7æ¬Ìüt4$ð@áù8)dùÃD*)$×ÚäÏQNP½ù½ÎÈMZ\[M1"ìp¨í	+£¿×í<¤@øY©0} x2ÔBçfúÂ0ÛX\m¼¯ùHys×Í0= ©½= ¤ä	ÄÓ]çÄ-î=}a­ÕH¸"äùCÚS§À1ôÎsüî¼ÇÇÇ¼üO«ii|NrÏÚÚ=M=Mòoûn°ÓØØ6]Ëäàn®SUUÕØuÎ«¾­»
æz<ñ<GGÇÁÁN9ìÒè¯µµµ¿¿(&y<g®§ðËjjz'×E ×E ×E ×E÷> QWWç1e±ÆÆÆÚZS_ôºáI»ýqW­nãÍPZxßFÍ= êçös­"´{Âîæ¬}ùBîÛòÁ·-X¼0 ËwÉ=}0 KvÓMÇï¾Ûõ¿B,9Þ*nú/¨kmòêu*l¨
ëqÖ*k|¢*½ìþÚïÂ+QZî¢«t±â=}v¶JFÊo Z§&Êqú+s¨qâ³wáÂíf¸y­V«r£KµûNßã5%>ßßCõ= <vO¯ÇÔ» \ ±³Tº F=MÕ5Ä(Ñ×5Ã<¤@åÐÏ9TÀÿÉRÔ
Çs½çÐ¬p|µ«Äúïæ²­yDúíÞ
Î!S´µüÒS³ÅÜüþø^ 2$;ôÖNq¤ä;øÆ=M}çÎ¸Ð\ôX¥cíðDýºÜ¤=}Á0=M»NÝc1å>Ý	_B±¦eÏðÛÌ5bþÐ1²PøÛFU1¤(QÖ1£<£8eÐÍ9P ÷ÉSÐúGr=}æØp{±Ãò¯æ®yCò­ÜúÛÌ~!OµôÓOÅÛô¾ø\ .Í#3´ÖL±¤ã3¸ÆýýæÖÐ[ÄX%býÈðCõÜ£5A0©;Ná(c9e>á)_C¹æe×ÜðÝíL!¢5cöP!£1³XÚÙ[¦
&U9ä(=M'Q×9ã<¥HqÐÑ¤XàIRØGs%=}çËÌpÝï, õc0 ñ³VÊ;F7Ô(×7Ó¼¥D¥ÐÐ¹VÐ	RVÏ¥Ý6¸= ó#7Ô%EDVPäØÙ,3WÖIbi­Í¸iéµb.¸5I8ÖVI~úmúÇkznÍÑE £ÑE ×è. ×Eè%×E ãíÌd4H@=}¼¦§=MB,§³Bºï,ñË,á6¡~NÉµJº"±b§½ìØtÁî'Ø|>YâÍO4XÞ¿ö§ÙO3R$r $¾,Q¼#'Q"} M*KÊäºFð=}¹|a0ÀvhýµÅzCðTÊöòÈnM7ú>InY=M3#{÷Ïý2À>êòµ ×]ÕÃà¶Ã´	ÌÔaCÔô ë]<eÅï8>Þ|Åásþl´Ùy<½ÜF;¢«Dá´ÛQ²È¾ì3ÓÁRü¶¨ IðÃïÂÇiê¤
 = ÷	ñïÙ2^±x¶¨;ý^Ö¶f«Á!ÎàbÍ:â>ïpcªá©oÉÐaÌ³ÒV5à¡}Ú-×j)ga	MtÂÊoD6IÛD¬÷?,ÛLpùV}ôa×X]rðäæh¬jì ZA¿èÚaP¨ââ,þoÙÙ¯ÂZîÉââBô_¡%¹6à«KÌåhB7siiùk¤jjrËRö´ùP:e#5Ef3I³W^²SHÐÐÐ¹ðÎ¶3 ýßeîÏ, öËPùí"ÛøLÔ/G¢ö5MØùM"¨8MhmljªrË/f¸ëw<Ì7´Ó à=}ÓD¸MPÓ©pÌË¶.0óÿ}¥Í 0¾Ö÷ÂÝ¡pÍÛ¶0P÷?%Í¢ 1ÞÖù[Â]©yNïãÙ6ãO¦ýá8­ãS¦ÿ!8ÍãW¦a8íã[¦¡	±]T]Ö	ÌdjtËjr*pAG©H#^>]Çàg9QC_äà'	ÇUÕçàW1gCßàùÇQÏAcCßàGùÇaÏAgCyà7ñÇ]ÌAfB¹à7Ç]ÐAfCÿq%\ËÁÈV4ùÇãÉàO7fC?qà_íÇçËÁéB?à_õÇçÍÁiB?±à_ýÇçÏÁéC?Ñà_ÇçÑÁiCOëÇ¨BOïÇèBOóÇ(BO÷ÇhBOûÇ¨COÿÇIh= Q&0Õ'1åËÕÄE= '+Ã3C;ÃCCG+ÇF3GF;ÇGCG7*6.Ö6266V6:7>Ö7B7FVÏu2°°üVÎµ4À0 #VßªÞ¬¡Þ®ÁÞ°áÞ²Þ´!Þ¶AÞ¸aÞºß¼¡ß¾ÁßÀáßÂßÄ!ßÆAßÈaÊës ËïàÌó Í÷£= Îû³ ÏÿÃàÝ<«êªz-ºoâ«*Ø[3Oã*Ø^ç¨9Qgcèh	]Pf#ÙX	¦ýãý©ç<ç=}©¦,&,¦-¡&-©¨L(L¨M¡(M©å2¨Vå4(!èTÂjjjjªÄhÀ§ÝS§9^è=}Ýd¸YS©©Nùfüé\½h4Ùc©P9fé]Ýh8Yc©.ñâ{©L³æó¡[/â)LÃæõá[01â©MÓæ÷![¡1Qâ)Mãæùa[é UêpëjôÌ,X)óªÈú¯²ÌÇäú¨S±äü(¡S¹äþ¨ÁSÁä (áSÉä¨SÑä(!'(Y9I:ä¨ASáä(aSé¦z.u[­¦{É.[±¦|	.[µ¦}I.¥[¹¦~/µ[½¦É/Å[Á¦	/Õ[Å¦I/å[É¦0õ[Í¦É0[Ñ¦	0[Õ¦I0%[Ù¦15[Ý¦É1E[á¦	1U[å¦I1e[éèéúÉ2©N\c÷f±èÎhÎèÏhÏèÐhÐèÑhÑèÒhÒèÓhÓèÔhÔèÕhÕèÖhÖè×h×èØhØèÙhÙèÚhÚèÛhÛèÜhÜè]fQc;]QÁ9)	§éebGQ1§mòËjºh8°8 ×1 ×EÍDØ½EÐÂEX(>I^i>O¹óA5Áåµ» "EìQl9³<9¤A¥2¢¥FQuKDÜóÎý'=M6å¦N;$Ý2ÕvÝ$Eç
4q¦PqkT7àß=}EÔA¢IÒÅGM½7áQUÙ'ºÖ&XarW%>5<wàôÅ&FÎå§VÅ$ÅXt5 FXZÔ=}^"oÔ1ãû
ùß¾ë £VÄÚûÊí¾ÌìÇZÿ² "6vÛÅ',~e¦L¥äÂK´Ù2,X^ûOs©s<Ò]§»ÉÕÇQ¬Í×á9ïÓ:/ÈþÔ
÷Ø\ ¼}W= 
¯S>OÈÿÓ=}FPçÿDY»Iõ=}=}´Áã½û %51Ô7Þ gVVGjTnófyh]-;ê:Ãui,é uòD8î5=}Ðþ¯LÿSÏü¿ìÏÓ6¦;ôÞÑ¿dÐjSTw ÅîæW°ÅÜ'· ÄòÖ7ð°X0ÅÃhÅºðp­6{ªñ ²ºù@rÿ=M/ru.;-n*vn3>Ò#~T@¼ó_?ÄËÜÓ¢äÒ¾pÓ=M·B&z<ngø¤ÞLaß hÕ-)õík;<~}È ·,3½·êSô?u;· Ü75ÁÇ
Â´rÿ±ïû¼~;²¶ï³þ¼t?T>_AñÇ«r{R	î1¹hÀ0§*2îkj×E QxUG×E àÕE ÷
 à¿])$NµèwÌù°G@tdï©@ãp¬ó'.äÌ£	´2òï.ÖÌ¤c±¨ýbÍp\#©dßiÍÈ&[À=}5VÑ_eçÊ^Ïó.ÃvÛýÅ=MÕíUúcúc'ÏÅ?!ÓXZrwtsxtôÔò7M[=}¼ãS¶à»®ÿéÕñ½(ñ2©»þ~	0¹K0ÏÚãC&ÔAp1ÐeÐeä=}^AÆ(ÇOú\Ë?×ÔEí|À«¶§ý´¹ûÎ{ûÏû7ë}x- c8¬öV2Üa´!QäQ¤Q]õmKlW$õ_AÕ×½©
ä¾ãõD|ß=MW{ÛfN.¶À¡ÿý/JþñÁp¡p î>ï= qv#8 ýÃ¢rGGE]Â¿7 ×øà'à= ¼=MÝw7¡É×³á@È_CÄ¼MW¾m~QÛ\B/F´¸ç²µÊáÊµÊÝ2I"5EÓÀcà¬Áî´înîë¼³­Ùt?,Rj-qÛØ5ÓBÔSÅÂÄÃEBDDCE¥¢¤¤£SfhÐYøðSQù°Úx¼@)ôk.Þ÷ãþ×¿ÜÙ<ÂzÑ~*"§÷P=d{ý½X4Ó"(ÈM¶	ÌfvmòÐ,;8É÷kóK¾X¼1?øÊj>fP§/<».©dÚ5§£÷¨£^9'ÿªv×ù¸ËÉaÜ.yy¹g£qÕP1MÞ¦å%ví	U[6ùjLi\É]6(eÜtüx3¡`});

  var HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAPU8 = new Uint8Array(b);
  }

  function JS_cos(x) {
   return Math.cos(x);
  }

  function JS_exp(x) {
   return Math.exp(x);
  }

  function _emscripten_memcpy_big(dest, src, num) {
   HEAPU8.copyWithin(dest, src, src + num);
  }

  function abortOnCannotGrowMemory(requestedSize) {
   abort("OOM");
  }

  function _emscripten_resize_heap(requestedSize) {
   HEAPU8.length;
   abortOnCannotGrowMemory();
  }

  var asmLibraryArg = {
   "b": JS_cos,
   "a": JS_exp,
   "d": _emscripten_memcpy_big,
   "c": _emscripten_resize_heap
  };

  function initRuntime(asm) {
   asm["f"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _opus_frame_decoder_create, _malloc, _opus_frame_decode_float_deinterleaved, _opus_frame_decoder_destroy, _free;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      var asm = instance.exports;
   _opus_frame_decoder_create = asm["g"];
   _malloc = asm["h"];
   _opus_frame_decode_float_deinterleaved = asm["i"];
   _opus_frame_decoder_destroy = asm["j"];
   _free = asm["k"];
   asm["l"];
   wasmMemory = asm["e"];
   updateGlobalBufferAndViews(wasmMemory.buffer);
   initRuntime(asm);
   ready();
  });

  this.ready = new Promise(resolve => {
   ready = resolve;
  }).then(() => {
   this.HEAP = buffer;
   this._malloc = _malloc;
   this._free = _free;
   this._opus_frame_decoder_create = _opus_frame_decoder_create;
   this._opus_frame_decode_float_deinterleaved = _opus_frame_decode_float_deinterleaved;
   this._opus_frame_decoder_destroy = _opus_frame_decoder_destroy;
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
      new this._WASMAudioDecoderCommon(this).instantiate().then((common) => {
        this._common = common;

        const mapping = this._common.allocateTypedArray(
          this._channels,
          Uint8Array
        );

        mapping.buf.set(this._channelMappingTable);

        this._decoder = this._common.wasm._opus_frame_decoder_create(
          this._channels,
          this._streamCount,
          this._coupledStreamCount,
          mapping.ptr,
          this._preSkip,
          this._forceStereo
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
      this._common.wasm._opus_frame_decoder_destroy(this._decoder);

      this._common.free();
    };

    this._decode = (opusFrame) => {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof opusFrame
        );

      this._input.buf.set(opusFrame);

      let samplesDecoded =
        this._common.wasm._opus_frame_decode_float_deinterleaved(
          this._decoder,
          this._input.ptr,
          opusFrame.length,
          this._output.ptr
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
          samplesDecoded
        ),
        samplesDecoded: samplesDecoded,
        error: error,
      };
    };

    this.decodeFrame = (opusFrame) => {
      let errors = [];

      const decoded = this._decode(opusFrame);

      if (decoded.error)
        this._common.addError(errors, decoded.error, opusFrame.length);

      this._frameNumber++;
      this._inputBytes += opusFrame.length;
      this._outputSamples += decoded.samplesDecoded;

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        [decoded.outputBuffer],
        this._outputChannels,
        decoded.samplesDecoded,
        48000
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
          this._common.addError(errors, decoded.error, opusFrame.length);

        this._frameNumber++;
        this._inputBytes += opusFrame.length;
        this._outputSamples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        outputBuffers,
        this._outputChannels,
        samplesDecoded,
        48000
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
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  assignNames(OpusDecoder, "OpusDecoder");
  assignNames(OpusDecoderWebWorker, "OpusDecoderWebWorker");

  /* Copyright 2020-2022 Ethan Halsall
      
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
    for (let byte = 0; byte < crcTable.length; byte++) {
      let crc = crcInitialValueFunction(byte);

      for (let bit = 8; bit > 0; bit--) crc = crcFunction(crc);

      crcTable[byte] = crc;
    }
    return crcTable;
  };

  const crc8Table = getCrcTable(
    new Uint8Array(256),
    (b) => b,
    (crc) => (crc & 0x80 ? 0x07 ^ (crc << 1) : crc << 1)
  );

  const flacCrc16Table = [
    getCrcTable(
      new Uint16Array(256),
      (b) => b << 8,
      (crc) => (crc << 1) ^ (crc & (1 << 15) ? 0x8005 : 0)
    ),
  ];

  const crc32Table = [
    getCrcTable(
      new Uint32Array(256),
      (b) => b,
      (crc) => (crc >>> 1) ^ ((crc & 1) * 0xedb88320)
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
    const dataLength = data.length;

    for (let i = 0; i !== dataLength; i++) crc = crc8Table[crc ^ data[i]];

    return crc;
  };

  const flacCrc16 = (data) => {
    const dataLength = data.length;
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

  const crc32 = (data) => {
    const dataLength = data.length;
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
    const buffer = new Uint8Array(
      buffers.reduce((acc, buf) => acc + buf.length, 0)
    );

    buffers.reduce((offset, buf) => {
      buffer.set(buf, offset);
      return offset + buf.length;
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
      this._pos = data.length * 8;
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

  /* Copyright 2020-2022 Ethan Halsall
      
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
    constructor(onCodecUpdate) {
      this._onCodecUpdate = onCodecUpdate;
      this.reset();
    }

    enable() {
      this._isEnabled = true;
    }

    reset() {
      this._headerCache = new Map();
      this._codecUpdateData = new WeakMap();
      this._codecShouldUpdate = false;
      this._bitrate = null;
      this._isEnabled = false;
    }

    checkCodecUpdate(bitrate, totalDuration) {
      if (this._onCodecUpdate) {
        if (this._bitrate !== bitrate) {
          this._bitrate = bitrate;
          this._codecShouldUpdate = true;
        }

        // only update if codec data is available
        const codecData = this._codecUpdateData.get(
          this._headerCache.get(this._currentHeader)
        );

        if (this._codecShouldUpdate && codecData) {
          this._onCodecUpdate(
            {
              bitrate,
              ...codecData,
            },
            totalDuration
          );
        }

        this._codecShouldUpdate = false;
      }
    }

    updateCurrentHeader(key) {
      if (this._onCodecUpdate && key !== this._currentHeader) {
        this._codecShouldUpdate = true;
        this._currentHeader = key;
      }
    }

    getHeader(key) {
      const header = this._headerCache.get(key);

      if (header) {
        this.updateCurrentHeader(key);
      }

      return header;
    }

    setHeader(key, header, codecUpdateFields) {
      if (this._isEnabled) {
        this.updateCurrentHeader(key);

        this._headerCache.set(key, header);
        this._codecUpdateData.set(header, codecUpdateFields);
      }
    }
  }

  const headerStore = new WeakMap();
  const frameStore = new WeakMap();

  /* Copyright 2020-2022 Ethan Halsall
      
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

    *syncFrame() {
      let frame;

      do {
        frame = yield* this.Frame.getFrame(
          this._codecParser,
          this._headerCache,
          0
        );
        if (frame) return frame;
        this._codecParser.incrementRawData(1); // increment to continue syncing
      } while (true);
    }

    /**
     * @description Searches for Frames within bytes containing a sequence of known codec frames.
     * @param {boolean} ignoreNextFrame Set to true to return frames even if the next frame may not exist at the expected location
     * @returns {Frame}
     */
    *fixedLengthFrameSync(ignoreNextFrame) {
      let frame = yield* this.syncFrame();
      const frameLength = frameStore.get(frame).length;

      if (
        ignoreNextFrame ||
        this._codecParser._flushing ||
        // check if there is a frame right after this one
        (yield* this.Header.getHeader(
          this._codecParser,
          this._headerCache,
          frameLength
        ))
      ) {
        this._headerCache.enable(); // start caching when synced

        this._codecParser.incrementRawData(frameLength); // increment to the next frame
        this._codecParser.mapFrameStats(frame);
        return frame;
      }

      this._codecParser.logWarning(
        `Missing frame frame at ${frameLength} bytes from current position.`,
        "Dropping current frame and trying again."
      );
      this._headerCache.reset(); // frame is invalid and must re-sync and clear cache
      this._codecParser.incrementRawData(1); // increment to invalidate the current frame
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    constructor(header, data) {
      frameStore.set(this, { header });

      this.data = data;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    static *getFrame(Header, Frame, codecParser, headerCache, readOffset) {
      const header = yield* Header.getHeader(
        codecParser,
        headerCache,
        readOffset
      );

      if (header) {
        const frameLength = headerStore.get(header).frameLength;
        const samples = headerStore.get(header).samples;

        const frame = (yield* codecParser.readRawData(
          frameLength,
          readOffset
        )).subarray(0, frameLength);

        return new Frame(header, frame, samples);
      } else {
        return null;
      }
    }

    constructor(header, data, samples) {
      super(header, data);

      this.header = header;
      this.samples = samples;
      this.duration = (samples / header.sampleRate) * 1000;
      this.frameNumber = null;
      this.totalBytesOut = null;
      this.totalSamples = null;
      this.totalDuration = null;

      frameStore.get(this).length = data.length;
    }
  }

  const reserved = "reserved";
  const bad = "bad";
  const free = "free";
  const none = "none";
  const sixteenBitCRC = "16bit CRC";

  // channel mappings
  const mappingJoin = ", ";

  const front = "front";
  const side = "side";
  const rear = "rear";
  const left = "left";
  const center = "center";
  const right = "right";

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
  const channelMappings = 
    [
      "", 
      front + " ",
      side + " ",
      rear + " "
    ].map((x) =>
    [
      [left, right],
      [left, right, center],
      [left, center, right],
      [center, left, right],
      [center],
    ].flatMap((y) => y.map((z) => x + z).join(mappingJoin))
  );

  const lfe = "LFE";
  const monophonic = "monophonic (mono)";
  const stereo = "stereo";
  const surround = "surround";

  const channels = [
    monophonic,
    stereo,
    `linear ${surround}`,
    "quadraphonic",
    `5.0 ${surround}`,
    `5.1 ${surround}`,
    `6.1 ${surround}`,
    `7.1 ${surround}`,
  ];

  const getChannelMapping = (channelCount, ...mappings) =>
    `${channels[channelCount - 1]} (${mappings.join(mappingJoin)})`;

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

  /* Copyright 2020-2022 Ethan Halsall
      
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

  // https://id3.org/Developer%20Information

  class ID3v2 {
    static *getID3v2Header(codecParser, headerCache, readOffset) {
      const header = { headerLength: 10 };

      let data = yield* codecParser.readRawData(3, readOffset);
      // Byte (0-2 of 9)
      // ID3
      if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return null;

      data = yield* codecParser.readRawData(header.headerLength, readOffset);

      // Byte (3-4 of 9)
      // * `BBBBBBBB|........`: Major version
      // * `........|BBBBBBBB`: Minor version
      header.version = `id3v2.${data[3]}.${data[4]}`;

      // Byte (5 of 9)
      // * `....0000.: Zeros (flags not implemented yet)
      if (data[5] & 0b00001111) return null;

      // Byte (5 of 9)
      // * `CDEF0000`: Flags
      // * `C.......`: Unsynchronisation (indicates whether or not unsynchronisation is used)
      // * `.D......`: Extended header (indicates whether or not the header is followed by an extended header)
      // * `..E.....`: Experimental indicator (indicates whether or not the tag is in an experimental stage)
      // * `...F....`: Footer present (indicates that a footer is present at the very end of the tag)
      header.unsynchronizationFlag = Boolean(data[5] & 0b10000000);
      header.extendedHeaderFlag = Boolean(data[5] & 0b01000000);
      header.experimentalFlag = Boolean(data[5] & 0b00100000);
      header.footerPresent = Boolean(data[5] & 0b00010000);

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
      header.dataLength =
        (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9];

      header.length = header.headerLength + header.dataLength;

      return new ID3v2(header);
    }

    constructor(header) {
      this.version = header.version;
      this.unsynchronizationFlag = header.unsynchronizationFlag;
      this.extendedHeaderFlag = header.extendedHeaderFlag;
      this.experimentalFlag = header.experimentalFlag;
      this.footerPresent = header.footerPresent;
      this.length = header.length;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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

      this.bitDepth = header.bitDepth;
      this.bitrate = null; // set during frame mapping
      this.channels = header.channels;
      this.channelMode = header.channelMode;
      this.sampleRate = header.sampleRate;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
  const layers = {
    0b00000000: { description: reserved },
    0b00000010: {
      description: "Layer III",
      framePadding: 1,
      modeExtensions: layer3ModeExtensions,
      v1: {
        bitrateIndex: v1Layer3,
        samples: 1152,
      },
      v2: {
        bitrateIndex: v2Layer23,
        samples: 576,
      },
    },
    0b00000100: {
      description: "Layer II",
      framePadding: 1,
      modeExtensions: layer12ModeExtensions,
      samples: 1152,
      v1: {
        bitrateIndex: v1Layer2,
      },
      v2: {
        bitrateIndex: v2Layer23,
      },
    },
    0b00000110: {
      description: "Layer I",
      framePadding: 4,
      modeExtensions: layer12ModeExtensions,
      samples: 384,
      v1: {
        bitrateIndex: v1Layer1,
      },
      v2: {
        bitrateIndex: v2Layer1,
      },
    },
  };

  const mpegVersion$1 = "MPEG Version ";
  const isoIec = "ISO/IEC ";
  const v2 = "v2";
  const v1 = "v1";
  const mpegVersions = {
    0b00000000: {
      description: `${mpegVersion$1}2.5 (later extension of MPEG 2)`,
      layers: v2,
      sampleRates: {
        0b00000000: rate11025,
        0b00000100: rate12000,
        0b00001000: rate8000,
        0b00001100: reserved,
      },
    },
    0b00001000: { description: reserved },
    0b00010000: {
      description: `${mpegVersion$1}2 (${isoIec}13818-3)`,
      layers: v2,
      sampleRates: {
        0b00000000: rate22050,
        0b00000100: rate24000,
        0b00001000: rate16000,
        0b00001100: reserved,
      },
    },
    0b00011000: {
      description: `${mpegVersion$1}1 (${isoIec}11172-3)`,
      layers: v1,
      sampleRates: {
        0b00000000: rate44100,
        0b00000100: rate48000,
        0b00001000: rate32000,
        0b00001100: reserved,
      },
    },
  };

  const protection$1 = {
    0b00000000: sixteenBitCRC,
    0b00000001: none,
  };

  const emphasis = {
    0b00000000: none,
    0b00000001: "50/15 ms",
    0b00000010: reserved,
    0b00000011: "CCIT J.17",
  };

  const channelModes = {
    0b00000000: { channels: 2, description: stereo },
    0b01000000: { channels: 2, description: "joint " + stereo },
    0b10000000: { channels: 2, description: "dual channel" },
    0b11000000: { channels: 1, description: monophonic },
  };

  class MPEGHeader extends CodecHeader {
    static *getHeader(codecParser, headerCache, readOffset) {
      const header = {};

      // check for id3 header
      const id3v2Header = yield* ID3v2.getID3v2Header(
        codecParser,
        headerCache,
        readOffset
      );

      if (id3v2Header) {
        // throw away the data. id3 parsing is not implemented yet.
        yield* codecParser.readRawData(id3v2Header.length, readOffset);
        codecParser.incrementRawData(id3v2Header.length);
      }

      // Must be at least four bytes.
      const data = yield* codecParser.readRawData(4, readOffset);

      // Check header cache
      const key = bytesToString(data.subarray(0, 4));
      const cachedHeader = headerCache.getHeader(key);
      if (cachedHeader) return new MPEGHeader(cachedHeader);

      // Frame sync (all bits must be set): `11111111|111`:
      if (data[0] !== 0xff || data[1] < 0xe0) return null;

      // Byte (2 of 4)
      // * `111BBCCD`
      // * `...BB...`: MPEG Audio version ID
      // * `.....CC.`: Layer description
      // * `.......D`: Protection bit (0 - Protected by CRC (16bit CRC follows header), 1 = Not protected)

      // Mpeg version (1, 2, 2.5)
      const mpegVersion = mpegVersions[data[1] & 0b00011000];
      if (mpegVersion.description === reserved) return null;

      // Layer (I, II, III)
      const layerBits = data[1] & 0b00000110;
      if (layers[layerBits].description === reserved) return null;
      const layer = {
        ...layers[layerBits],
        ...layers[layerBits][mpegVersion.layers],
      };

      header.mpegVersion = mpegVersion.description;
      header.layer = layer.description;
      header.samples = layer.samples;
      header.protection = protection$1[data[1] & 0b00000001];

      header.length = 4;

      // Byte (3 of 4)
      // * `EEEEFFGH`
      // * `EEEE....`: Bitrate index. 1111 is invalid, everything else is accepted
      // * `....FF..`: Sample rate
      // * `......G.`: Padding bit, 0=frame not padded, 1=frame padded
      // * `.......H`: Private bit.
      header.bitrate = bitrateMatrix[data[2] & 0b11110000][layer.bitrateIndex];
      if (header.bitrate === bad) return null;

      header.sampleRate = mpegVersion.sampleRates[data[2] & 0b00001100];
      if (header.sampleRate === reserved) return null;

      header.framePadding = data[2] & 0b00000010 && layer.framePadding;
      header.isPrivate = Boolean(data[2] & 0b00000001);

      header.frameLength = Math.floor(
        (125 * header.bitrate * header.samples) / header.sampleRate +
          header.framePadding
      );
      if (!header.frameLength) return null;

      // Byte (4 of 4)
      // * `IIJJKLMM`
      // * `II......`: Channel mode
      // * `..JJ....`: Mode extension (only if joint stereo)
      // * `....K...`: Copyright
      // * `.....L..`: Original
      // * `......MM`: Emphasis
      const channelModeBits = data[3] & 0b11000000;
      header.channelMode = channelModes[channelModeBits].description;
      header.channels = channelModes[channelModeBits].channels;

      header.modeExtension = layer.modeExtensions[data[3] & 0b00110000];
      header.isCopyrighted = Boolean(data[3] & 0b00001000);
      header.isOriginal = Boolean(data[3] & 0b00000100);

      header.emphasis = emphasis[data[3] & 0b00000011];
      if (header.emphasis === reserved) return null;

      header.bitDepth = 16;

      // set header cache
      const { length, frameLength, samples, ...codecUpdateFields } = header;

      headerCache.setHeader(key, header, codecUpdateFields);
      return new MPEGHeader(header);
    }

    /**
     * @private
     * Call MPEGHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.bitrate = header.bitrate;
      this.emphasis = header.emphasis;
      this.framePadding = header.framePadding;
      this.isCopyrighted = header.isCopyrighted;
      this.isOriginal = header.isOriginal;
      this.isPrivate = header.isPrivate;
      this.layer = header.layer;
      this.modeExtension = header.modeExtension;
      this.mpegVersion = header.mpegVersion;
      this.protection = header.protection;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    static *getFrame(codecParser, headerCache, readOffset) {
      return yield* super.getFrame(
        MPEGHeader,
        MPEGFrame,
        codecParser,
        headerCache,
        readOffset
      );
    }

    constructor(header, frame, samples) {
      super(header, frame, samples);
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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

      onCodec(this.codec);
    }

    get codec() {
      return "mpeg";
    }

    *parseFrame() {
      return yield* this.fixedLengthFrameSync();
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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

  const mpegVersion = {
    0b00000000: "MPEG-4",
    0b00001000: "MPEG-2",
  };

  const layer = {
    0b00000000: "valid",
    0b00000010: bad,
    0b00000100: bad,
    0b00000110: bad,
  };

  const protection = {
    0b00000000: sixteenBitCRC,
    0b00000001: none,
  };

  const profile = {
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
  const channelMode = {
    0b000000000: { channels: 0, description: "Defined in AOT Specific Config" },
    /*
    'monophonic (mono)'
    'stereo (left, right)'
    'linear surround (front center, front left, front right)'
    'quadraphonic (front center, front left, front right, rear center)'
    '5.0 surround (front center, front left, front right, rear left, rear right)'
    '5.1 surround (front center, front left, front right, rear left, rear right, LFE)'
    '7.1 surround (front center, front left, front right, side left, side right, rear left, rear right, LFE)'
    */
    0b001000000: { channels: 1, description: monophonic },
    0b010000000: { channels: 2, description: getChannelMapping(2,channelMappings[0][0]) },
    0b011000000: { channels: 3, description: getChannelMapping(3,channelMappings[1][3]), },
    0b100000000: { channels: 4, description: getChannelMapping(4,channelMappings[1][3],channelMappings[3][4]), },
    0b101000000: { channels: 5, description: getChannelMapping(5,channelMappings[1][3],channelMappings[3][0]), },
    0b110000000: { channels: 6, description: getChannelMapping(6,channelMappings[1][3],channelMappings[3][0],lfe), },
    0b111000000: { channels: 8, description: getChannelMapping(8,channelMappings[1][3],channelMappings[2][0],channelMappings[3][0],lfe), },
  };

  class AACHeader extends CodecHeader {
    static *getHeader(codecParser, headerCache, readOffset) {
      const header = {};

      // Must be at least seven bytes. Out of data
      const data = yield* codecParser.readRawData(7, readOffset);

      // Check header cache
      const key = bytesToString([
        data[0],
        data[1],
        data[2],
        (data[3] & 0b11111100) | (data[6] & 0b00000011), // frame length, buffer fullness varies so don't cache it
      ]);
      const cachedHeader = headerCache.getHeader(key);

      if (!cachedHeader) {
        // Frame sync (all bits must be set): `11111111|1111`:
        if (data[0] !== 0xff || data[1] < 0xf0) return null;

        // Byte (2 of 7)
        // * `1111BCCD`
        // * `....B...`: MPEG Version: 0 for MPEG-4, 1 for MPEG-2
        // * `.....CC.`: Layer: always 0
        // * `.......D`: protection absent, Warning, set to 1 if there is no CRC and 0 if there is CRC
        header.mpegVersion = mpegVersion[data[1] & 0b00001000];

        header.layer = layer[data[1] & 0b00000110];
        if (header.layer === bad) return null;

        const protectionBit = data[1] & 0b00000001;
        header.protection = protection[protectionBit];
        header.length = protectionBit ? 7 : 9;

        // Byte (3 of 7)
        // * `EEFFFFGH`
        // * `EE......`: profile, the MPEG-4 Audio Object Type minus 1
        // * `..FFFF..`: MPEG-4 Sampling Frequency Index (15 is forbidden)
        // * `......G.`: private bit, guaranteed never to be used by MPEG, set to 0 when encoding, ignore when decoding
        header.profileBits = data[2] & 0b11000000;
        header.sampleRateBits = data[2] & 0b00111100;
        const privateBit = data[2] & 0b00000010;

        header.profile = profile[header.profileBits];

        header.sampleRate = sampleRates[header.sampleRateBits];
        if (header.sampleRate === reserved) return null;

        header.isPrivate = Boolean(privateBit);

        // Byte (3,4 of 7)
        // * `.......H|HH......`: MPEG-4 Channel Configuration (in the case of 0, the channel configuration is sent via an inband PCE)
        header.channelModeBits = ((data[2] << 8) | data[3]) & 0b111000000;
        header.channelMode = channelMode[header.channelModeBits].description;
        header.channels = channelMode[header.channelModeBits].channels;

        // Byte (4 of 7)
        // * `HHIJKLMM`
        // * `..I.....`: originality, set to 0 when encoding, ignore when decoding
        // * `...J....`: home, set to 0 when encoding, ignore when decoding
        // * `....K...`: copyrighted id bit, the next bit of a centrally registered copyright identifier, set to 0 when encoding, ignore when decoding
        // * `.....L..`: copyright id start, signals that this frame's copyright id bit is the first bit of the copyright id, set to 0 when encoding, ignore when decoding
        header.isOriginal = Boolean(data[3] & 0b00100000);
        header.isHome = Boolean(data[3] & 0b00001000);
        header.copyrightId = Boolean(data[3] & 0b00001000);
        header.copyrightIdStart = Boolean(data[3] & 0b00000100);
        header.bitDepth = 16;
        header.samples = 1024;

        // Byte (7 of 7)
        // * `......PP` Number of AAC frames (RDBs) in ADTS frame minus 1, for maximum compatibility always use 1 AAC frame per ADTS frame
        header.numberAACFrames = data[6] & 0b00000011;

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
        headerCache.setHeader(key, header, codecUpdateFields);
      } else {
        Object.assign(header, cachedHeader);
      }

      // Byte (4,5,6 of 7)
      // * `.......MM|MMMMMMMM|MMM.....`: frame length, this value must include 7 or 9 bytes of header length: FrameLength = (ProtectionAbsent == 1 ? 7 : 9) + size(AACFrame)
      header.frameLength =
        ((data[3] << 11) | (data[4] << 3) | (data[5] >> 5)) & 0x1fff;
      if (!header.frameLength) return null;

      // Byte (6,7 of 7)
      // * `...OOOOO|OOOOOO..`: Buffer fullness
      const bufferFullnessBits = ((data[5] << 6) | (data[6] >> 2)) & 0x7ff;
      header.bufferFullness =
        bufferFullnessBits === 0x7ff ? "VBR" : bufferFullnessBits;

      return new AACHeader(header);
    }

    /**
     * @private
     * Call AACHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.copyrightId = header.copyrightId;
      this.copyrightIdStart = header.copyrightIdStart;
      this.bufferFullness = header.bufferFullness;
      this.isHome = header.isHome;
      this.isOriginal = header.isOriginal;
      this.isPrivate = header.isPrivate;
      this.layer = header.layer;
      this.length = header.length;
      this.mpegVersion = header.mpegVersion;
      this.numberAACFrames = header.numberAACFrames;
      this.profile = header.profile;
      this.protection = header.protection;
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
        ((header.profileBits + 0x40) << 5) |
        (header.sampleRateBits << 5) |
        (header.channelModeBits >> 3);

      const bytes = new Uint8Array(2);
      new DataView(bytes.buffer).setUint16(0, audioSpecificConfig, false);
      return bytes;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    static *getFrame(codecParser, headerCache, readOffset) {
      return yield* super.getFrame(
        AACHeader,
        AACFrame,
        codecParser,
        headerCache,
        readOffset
      );
    }

    constructor(header, frame, samples) {
      super(header, frame, samples);
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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

      onCodec(this.codec);
    }

    get codec() {
      return "aac";
    }

    *parseFrame() {
      return yield* this.fixedLengthFrameSync();
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    static getFrameFooterCrc16(data) {
      return (data[data.length - 2] << 8) + data[data.length - 1];
    }

    // check frame footer crc
    // https://xiph.org/flac/format.html#frame_footer
    static checkFrameFooterCrc16(data) {
      const expectedCrc16 = FLACFrame.getFrameFooterCrc16(data);
      const actualCrc16 = flacCrc16(data.subarray(0, -2));

      return expectedCrc16 === actualCrc16;
    }

    constructor(data, header, streamInfo) {
      header.streamInfo = streamInfo;
      header.crc16 = FLACFrame.getFrameFooterCrc16(data);

      super(header, data, headerStore.get(header).samples);
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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

  const blockingStrategy = {
    0b00000000: "Fixed",
    0b00000001: "Variable",
  };

  const blockSize = {
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
    blockSize[i << 4] = i < 6 ? 576 * 2 ** (i - 2) : 2 ** i;

  const sampleRate = {
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
    0b00000000: {channels: 1, description: monophonic},
    0b00010000: {channels: 2, description: getChannelMapping(2,channelMappings[0][0])},
    0b00100000: {channels: 3, description: getChannelMapping(3,channelMappings[0][1])},
    0b00110000: {channels: 4, description: getChannelMapping(4,channelMappings[1][0],channelMappings[3][0])},
    0b01000000: {channels: 5, description: getChannelMapping(5,channelMappings[1][1],channelMappings[3][0])},
    0b01010000: {channels: 6, description: getChannelMapping(6,channelMappings[1][1],lfe,channelMappings[3][0])},
    0b01100000: {channels: 7, description: getChannelMapping(7,channelMappings[1][1],lfe,channelMappings[3][4],channelMappings[2][0])},
    0b01110000: {channels: 8, description: getChannelMapping(8,channelMappings[1][1],lfe,channelMappings[3][0],channelMappings[2][0])},
    0b10000000: {channels: 2, description: `${stereo} (left, diff)`},
    0b10010000: {channels: 2, description: `${stereo} (diff, right)`},
    0b10100000: {channels: 2, description: `${stereo} (avg, diff)`},
    0b10110000: reserved,
    0b11000000: reserved,
    0b11010000: reserved,
    0b11100000: reserved,
    0b11110000: reserved,
  };

  const bitDepth = {
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
    static decodeUTF8Int(data) {
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

    static getHeaderFromUint8Array(data, headerCache) {
      const codecParserStub = {
        readRawData: function* () {
          return data;
        },
      };

      return FLACHeader.getHeader(codecParserStub, headerCache, 0).next().value;
    }

    static *getHeader(codecParser, headerCache, readOffset) {
      // Must be at least 6 bytes.
      let data = yield* codecParser.readRawData(6, readOffset);

      // Bytes (1-2 of 6)
      // * `11111111|111110..`: Frame sync
      // * `........|......0.`: Reserved 0 - mandatory, 1 - reserved
      if (data[0] !== 0xff || !(data[1] === 0xf8 || data[1] === 0xf9)) {
        return null;
      }

      const header = {};

      // Check header cache
      const key = bytesToString(data.subarray(0, 4));
      const cachedHeader = headerCache.getHeader(key);

      if (!cachedHeader) {
        // Byte (2 of 6)
        // * `.......C`: Blocking strategy, 0 - fixed, 1 - variable
        header.blockingStrategyBits = data[1] & 0b00000001;
        header.blockingStrategy = blockingStrategy[header.blockingStrategyBits];

        // Byte (3 of 6)
        // * `DDDD....`: Block size in inter-channel samples
        // * `....EEEE`: Sample rate
        header.blockSizeBits = data[2] & 0b11110000;
        header.sampleRateBits = data[2] & 0b00001111;

        header.blockSize = blockSize[header.blockSizeBits];
        if (header.blockSize === reserved) {
          return null;
        }

        header.sampleRate = sampleRate[header.sampleRateBits];
        if (header.sampleRate === bad) {
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

        header.channels = channelAssignment.channels;
        header.channelMode = channelAssignment.description;

        header.bitDepth = bitDepth[data[3] & 0b00001110];
        if (header.bitDepth === reserved) {
          return null;
        }
      } else {
        Object.assign(header, cachedHeader);
      }

      // Byte (5...)
      // * `IIIIIIII|...`: VBR block size ? sample number : frame number
      header.length = 5;

      // check if there is enough data to parse UTF8
      data = yield* codecParser.readRawData(header.length + 8, readOffset);

      const decodedUtf8 = FLACHeader.decodeUTF8Int(data.subarray(4));
      if (!decodedUtf8) {
        return null;
      }

      if (header.blockingStrategyBits) {
        header.sampleNumber = decodedUtf8.value;
      } else {
        header.frameNumber = decodedUtf8.value;
      }

      header.length += decodedUtf8.length;

      // Byte (...)
      // * `JJJJJJJJ|(JJJJJJJJ)`: Blocksize (8/16bit custom value)
      if (header.blockSizeBits === 0b01100000) {
        // 8 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.blockSize = data[header.length - 1] + 1;
        header.length += 1;
      } else if (header.blockSizeBits === 0b01110000) {
        // 16 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.blockSize =
          (data[header.length - 1] << 8) + data[header.length] + 1;
        header.length += 2;
      }

      header.samples = header.blockSize;

      // Byte (...)
      // * `KKKKKKKK|(KKKKKKKK)`: Sample rate (8/16bit custom value)
      if (header.sampleRateBits === 0b00001100) {
        // 8 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.sampleRate = data[header.length - 1] * 1000;
        header.length += 1;
      } else if (header.sampleRateBits === 0b00001101) {
        // 16 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.sampleRate = (data[header.length - 1] << 8) + data[header.length];
        header.length += 2;
      } else if (header.sampleRateBits === 0b00001110) {
        // 16 bit
        if (data.length < header.length)
          data = yield* codecParser.readRawData(header.length, readOffset);

        header.sampleRate =
          ((data[header.length - 1] << 8) + data[header.length]) * 10;
        header.length += 2;
      }

      // Byte (...)
      // * `LLLLLLLL`: CRC-8
      if (data.length < header.length)
        data = yield* codecParser.readRawData(header.length, readOffset);

      header.crc = data[header.length - 1];
      if (header.crc !== crc8(data.subarray(0, header.length - 1))) {
        return null;
      }

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
        headerCache.setHeader(key, header, codecUpdateFields);
      }
      return new FLACHeader(header);
    }

    /**
     * @private
     * Call FLACHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.crc16 = null; // set in FLACFrame
      this.blockingStrategy = header.blockingStrategy;
      this.blockSize = header.blockSize;
      this.frameNumber = header.frameNumber;
      this.sampleNumber = header.sampleNumber;
      this.streamInfo = null; // set during ogg parsing
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    constructor(codecParser, onCodecUpdate) {
      super(codecParser, onCodecUpdate);
      this.Frame = FLACFrame;
      this.Header = FLACHeader;
    }

    get codec() {
      return "flac";
    }

    *_getNextFrameSyncOffset(offset) {
      const data = yield* this._codecParser.readRawData(2, 0);
      const dataLength = data.length - 2;

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

    *parseFrame() {
      // find the first valid frame header
      do {
        const header = yield* FLACHeader.getHeader(
          this._codecParser,
          this._headerCache,
          0
        );

        if (header) {
          // found a valid frame header
          // find the next valid frame header
          let nextHeaderOffset =
            headerStore.get(header).length + MIN_FLAC_FRAME_SIZE;

          while (nextHeaderOffset <= MAX_FLAC_FRAME_SIZE) {
            if (
              this._codecParser._flushing ||
              (yield* FLACHeader.getHeader(
                this._codecParser,
                this._headerCache,
                nextHeaderOffset
              ))
            ) {
              // found a valid next frame header
              let frameData = yield* this._codecParser.readRawData(
                nextHeaderOffset
              );

              if (!this._codecParser._flushing)
                frameData = frameData.subarray(0, nextHeaderOffset);

              // check that this is actually the next header by validating the frame footer crc16
              if (FLACFrame.checkFrameFooterCrc16(frameData)) {
                // both frame headers, and frame footer crc16 are valid, we are synced (odds are pretty low of a false positive)
                const frame = new FLACFrame(frameData, header);

                this._headerCache.enable(); // start caching when synced
                this._codecParser.incrementRawData(nextHeaderOffset); // increment to the next frame
                this._codecParser.mapFrameStats(frame);

                return frame;
              }
            }

            nextHeaderOffset = yield* this._getNextFrameSyncOffset(
              nextHeaderOffset + 1
            );
          }

          this._codecParser.logWarning(
            `Unable to sync FLAC frame after searching ${nextHeaderOffset} bytes.`
          );
          this._codecParser.incrementRawData(nextHeaderOffset);
        } else {
          // not synced, increment data to continue syncing
          this._codecParser.incrementRawData(
            yield* this._getNextFrameSyncOffset(1)
          );
        }
      } while (true);
    }

    parseOggPage(oggPage) {
      if (oggPage.pageSequenceNumber === 0) {
        // Identification header

        this._headerCache.enable();
        this._streamInfo = oggPage.data.subarray(13);
      } else if (oggPage.pageSequenceNumber === 1) ; else {
        oggPage.codecFrames = frameStore
          .get(oggPage)
          .segments.map((segment) => {
            const header = FLACHeader.getHeaderFromUint8Array(
              segment,
              this._headerCache
            );

            if (header) {
              return new FLACFrame(segment, header, this._streamInfo);
            } else {
              this._codecParser.logWarning(
                "Failed to parse Ogg FLAC frame",
                "Skipping invalid FLAC frame"
              );
            }
          })
          .filter((frame) => Boolean(frame));
      }

      return oggPage;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    static *getHeader(codecParser, headerCache, readOffset) {
      const header = {};

      // Must be at least 28 bytes.
      let data = yield* codecParser.readRawData(28, readOffset);

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
      header.streamStructureVersion = data[4];

      // Byte (6 of 28)
      // * `00000CDE`
      // * `00000...`: All zeros
      // * `.....C..`: (0 no, 1 yes) last page of logical bitstream (eos)
      // * `......D.`: (0 no, 1 yes) first page of logical bitstream (bos)
      // * `.......E`: (0 no, 1 yes) continued packet
      const zeros = data[5] & 0b11111000;
      if (zeros) return null;

      header.isLastPage = Boolean(data[5] & 0b00000100);
      header.isFirstPage = Boolean(data[5] & 0b00000010);
      header.isContinuedPacket = Boolean(data[5] & 0b00000001);

      const view = new DataView(Uint8Array.from(data.subarray(0, 28)).buffer);

      // Byte (7-14 of 28)
      // * `FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF`
      // * Absolute Granule Position

      /**
       * @todo Safari does not support getBigInt64, but it also doesn't support Ogg
       */
      try {
        header.absoluteGranulePosition = view.getBigInt64(6, true);
      } catch {}

      // Byte (15-18 of 28)
      // * `GGGGGGGG|GGGGGGGG|GGGGGGGG|GGGGGGGG`
      // * Stream Serial Number
      header.streamSerialNumber = view.getInt32(14, true);

      // Byte (19-22 of 28)
      // * `HHHHHHHH|HHHHHHHH|HHHHHHHH|HHHHHHHH`
      // * Page Sequence Number
      header.pageSequenceNumber = view.getInt32(18, true);

      // Byte (23-26 of 28)
      // * `IIIIIIII|IIIIIIII|IIIIIIII|IIIIIIII`
      // * Page Checksum
      header.pageChecksum = view.getInt32(22, true);

      // Byte (27 of 28)
      // * `JJJJJJJJ`: Number of page segments in the segment table
      const pageSegmentTableLength = data[26];
      header.length = pageSegmentTableLength + 27;

      data = yield* codecParser.readRawData(header.length, readOffset); // read in the page segment table

      header.frameLength = 0;
      header.pageSegmentTable = [];
      header.pageSegmentBytes = Uint8Array.from(data.subarray(27, header.length));

      for (let i = 0, segmentLength = 0; i < pageSegmentTableLength; i++) {
        const segmentByte = header.pageSegmentBytes[i];

        header.frameLength += segmentByte;
        segmentLength += segmentByte;

        if (segmentByte !== 0xff || i === pageSegmentTableLength - 1) {
          header.pageSegmentTable.push(segmentLength);
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

      this.absoluteGranulePosition = header.absoluteGranulePosition;
      this.isContinuedPacket = header.isContinuedPacket;
      this.isFirstPage = header.isFirstPage;
      this.isLastPage = header.isLastPage;
      this.pageSegmentTable = header.pageSegmentTable;
      this.pageSequenceNumber = header.pageSequenceNumber;
      this.pageChecksum = header.pageChecksum;
      this.streamSerialNumber = header.streamSerialNumber;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    static *getFrame(codecParser, headerCache, readOffset) {
      const header = yield* OggPageHeader.getHeader(
        codecParser,
        headerCache,
        readOffset
      );

      if (header) {
        const frameLength = headerStore.get(header).frameLength;
        const headerLength = headerStore.get(header).length;
        const totalLength = headerLength + frameLength;

        const rawData = (yield* codecParser.readRawData(totalLength, 0)).subarray(
          0,
          totalLength
        );

        const frame = rawData.subarray(headerLength, totalLength);

        return new OggPage(header, frame, rawData);
      } else {
        return null;
      }
    }

    constructor(header, frame, rawData) {
      super(header, frame);

      frameStore.get(this).length = rawData.length;

      this.codecFrames = [];
      this.rawData = rawData;
      this.absoluteGranulePosition = header.absoluteGranulePosition;
      this.crc32 = header.pageChecksum;
      this.duration = 0;
      this.isContinuedPacket = header.isContinuedPacket;
      this.isFirstPage = header.isFirstPage;
      this.isLastPage = header.isLastPage;
      this.pageSequenceNumber = header.pageSequenceNumber;
      this.samples = 0;
      this.streamSerialNumber = header.streamSerialNumber;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
        ((header.frameSize * header.frameCount) / 1000) * header.sampleRate
      );
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
  const configTable = {
    0b00000000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 10 },
    0b00001000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 20 },
    0b00010000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 40 },
    0b00011000: { mode: silkOnly, bandwidth: narrowBand, frameSize: 60 },
    0b00100000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 10 },
    0b00101000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 20 },
    0b00110000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 40 },
    0b00111000: { mode: silkOnly, bandwidth: mediumBand, frameSize: 60 },
    0b01000000: { mode: silkOnly, bandwidth: wideBand, frameSize: 10 },
    0b01001000: { mode: silkOnly, bandwidth: wideBand, frameSize: 20 },
    0b01010000: { mode: silkOnly, bandwidth: wideBand, frameSize: 40 },
    0b01011000: { mode: silkOnly, bandwidth: wideBand, frameSize: 60 },
    0b01100000: { mode: hybrid, bandwidth: superWideBand, frameSize: 10 },
    0b01101000: { mode: hybrid, bandwidth: superWideBand, frameSize: 20 },
    0b01110000: { mode: hybrid, bandwidth: fullBand, frameSize: 10 },
    0b01111000: { mode: hybrid, bandwidth: fullBand, frameSize: 20 },
    0b10000000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 2.5 },
    0b10001000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 5 },
    0b10010000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 10 },
    0b10011000: { mode: celtOnly, bandwidth: narrowBand, frameSize: 20 },
    0b10100000: { mode: celtOnly, bandwidth: wideBand, frameSize: 2.5 },
    0b10101000: { mode: celtOnly, bandwidth: wideBand, frameSize: 5 },
    0b10110000: { mode: celtOnly, bandwidth: wideBand, frameSize: 10 },
    0b10111000: { mode: celtOnly, bandwidth: wideBand, frameSize: 20 },
    0b11000000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 2.5 },
    0b11001000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 5 },
    0b11010000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 10 },
    0b11011000: { mode: celtOnly, bandwidth: superWideBand, frameSize: 20 },
    0b11100000: { mode: celtOnly, bandwidth: fullBand, frameSize: 2.5 },
    0b11101000: { mode: celtOnly, bandwidth: fullBand, frameSize: 5 },
    0b11110000: { mode: celtOnly, bandwidth: fullBand, frameSize: 10 },
    0b11111000: { mode: celtOnly, bandwidth: fullBand, frameSize: 20 },
  };

  class OpusHeader extends CodecHeader {
    static getHeaderFromUint8Array(data, packetData, headerCache) {
      const header = {};

      // get length of header
      // Byte (10 of 19)
      // * `CCCCCCCC`: Channel Count
      header.channels = data[9];
      // Byte (19 of 19)
      // * `GGGGGGGG`: Channel Mapping Family
      header.channelMappingFamily = data[18];

      header.length =
        header.channelMappingFamily !== 0 ? 21 + header.channels : 19;

      if (data.length < header.length)
        throw new Error("Out of data while inside an Ogg Page");

      // Page Segment Bytes (1-2)
      // * `AAAAA...`: Packet config
      // * `.....B..`:
      // * `......CC`: Packet code
      const packetMode = packetData[0] & 0b00000011;
      const packetLength = packetMode === 3 ? 2 : 1;

      // Check header cache
      const key =
        bytesToString(data.subarray(0, header.length)) +
        bytesToString(packetData.subarray(0, packetLength));
      const cachedHeader = headerCache.getHeader(key);

      if (cachedHeader) return new OpusHeader(cachedHeader);

      // Bytes (1-8 of 19): OpusHead - Magic Signature
      if (key.substr(0, 8) !== "OpusHead") {
        return null;
      }

      // Byte (9 of 19)
      // * `00000001`: Version number
      if (data[8] !== 1) return null;

      header.data = Uint8Array.from(data.subarray(0, header.length));

      const view = new DataView(header.data.buffer);

      header.bitDepth = 16;

      // Byte (10 of 19)
      // * `CCCCCCCC`: Channel Count
      // set earlier to determine length

      // Byte (11-12 of 19)
      // * `DDDDDDDD|DDDDDDDD`: Pre skip
      header.preSkip = view.getUint16(10, true);

      // Byte (13-16 of 19)
      // * `EEEEEEEE|EEEEEEEE|EEEEEEEE|EEEEEEEE`: Sample Rate
      header.inputSampleRate = view.getUint32(12, true);
      // Opus is always decoded at 48kHz
      header.sampleRate = rate48000;

      // Byte (17-18 of 19)
      // * `FFFFFFFF|FFFFFFFF`: Output Gain
      header.outputGain = view.getInt16(16, true);

      // Byte (19 of 19)
      // * `GGGGGGGG`: Channel Mapping Family
      // set earlier to determine length
      if (header.channelMappingFamily in channelMappingFamilies) {
        header.channelMode =
          channelMappingFamilies[header.channelMappingFamily][
            header.channels - 1
          ];
        if (!header.channelMode) return null;
      }

      if (header.channelMappingFamily !== 0) {
        // * `HHHHHHHH`: Stream count
        header.streamCount = data[19];

        // * `IIIIIIII`: Coupled Stream count
        header.coupledStreamCount = data[20];

        // * `JJJJJJJJ|...` Channel Mapping table
        header.channelMappingTable = [...data.subarray(21, header.channels + 21)];
      }

      const packetConfig = configTable[0b11111000 & packetData[0]];
      header.mode = packetConfig.mode;
      header.bandwidth = packetConfig.bandwidth;
      header.frameSize = packetConfig.frameSize;

      // https://tools.ietf.org/html/rfc6716#appendix-B
      switch (packetMode) {
        case 0:
          // 0: 1 frame in the packet
          header.frameCount = 1;
          break;
        case 1:
        // 1: 2 frames in the packet, each with equal compressed size
        case 2:
          // 2: 2 frames in the packet, with different compressed sizes
          header.frameCount = 2;
          break;
        case 3:
          // 3: an arbitrary number of frames in the packet
          header.isVbr = Boolean(0b10000000 & packetData[1]);
          header.hasOpusPadding = Boolean(0b01000000 & packetData[1]);
          header.frameCount = 0b00111111 & packetData[1];
          break;
        default:
          return null;
      }

      // set header cache
      const {
        length,
        data: headerData,
        channelMappingFamily,
        ...codecUpdateFields
      } = header;

      headerCache.setHeader(key, header, codecUpdateFields);

      return new OpusHeader(header);
    }

    /**
     * @private
     * Call OpusHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.data = header.data;
      this.bandwidth = header.bandwidth;
      this.channelMappingFamily = header.channelMappingFamily;
      this.channelMappingTable = header.channelMappingTable;
      this.coupledStreamCount = header.coupledStreamCount;
      this.frameCount = header.frameCount;
      this.frameSize = header.frameSize;
      this.hasOpusPadding = header.hasOpusPadding;
      this.inputSampleRate = header.inputSampleRate;
      this.isVbr = header.isVbr;
      this.mode = header.mode;
      this.outputGain = header.outputGain;
      this.preSkip = header.preSkip;
      this.streamCount = header.streamCount;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    constructor(codecParser, headerCache) {
      super(codecParser, headerCache);
      this.Frame = OpusFrame;
      this.Header = OpusHeader;

      this._identificationHeader = null;
    }

    get codec() {
      return "opus";
    }

    /**
     * @todo implement continued page support
     */
    parseOggPage(oggPage) {
      if (oggPage.pageSequenceNumber === 0) {
        // Identification header

        this._headerCache.enable();
        this._identificationHeader = oggPage.data;
      } else if (oggPage.pageSequenceNumber === 1) ; else {
        oggPage.codecFrames = frameStore.get(oggPage).segments.map((segment) => {
          const header = OpusHeader.getHeaderFromUint8Array(
            this._identificationHeader,
            segment,
            this._headerCache
          );

          if (header) return new OpusFrame(segment, header);

          this._codecParser.logError(
            "Failed to parse Ogg Opus Header",
            "Not a valid Ogg Opus file"
          );
        });
      }

      return oggPage;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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

  /* Copyright 2020-2022 Ethan Halsall
      
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
    static getHeaderFromUint8Array(data, headerCache) {
      // Must be at least 30 bytes.
      if (data.length < 30)
        throw new Error("Out of data while inside an Ogg Page");

      // Check header cache
      const key = bytesToString(data.subarray(0, 30));
      const cachedHeader = headerCache.getHeader(key);
      if (cachedHeader) return new VorbisHeader(cachedHeader);

      const header = { length: 30 };

      // Bytes (1-7 of 30): /01vorbis - Magic Signature
      if (key.substr(0, 7) !== "\x01vorbis") {
        return null;
      }

      header.data = Uint8Array.from(data.subarray(0, 30));
      const view = new DataView(header.data.buffer);

      // Byte (8-11 of 30)
      // * `CCCCCCCC|CCCCCCCC|CCCCCCCC|CCCCCCCC`: Version number
      header.version = view.getUint32(7, true);
      if (header.version !== 0) return null;

      // Byte (12 of 30)
      // * `DDDDDDDD`: Channel Count
      header.channels = data[11];
      header.channelMode =
        vorbisOpusChannelMapping[header.channels - 1] || "application defined";

      // Byte (13-16 of 30)
      // * `EEEEEEEE|EEEEEEEE|EEEEEEEE|EEEEEEEE`: Sample Rate
      header.sampleRate = view.getUint32(12, true);

      // Byte (17-20 of 30)
      // * `FFFFFFFF|FFFFFFFF|FFFFFFFF|FFFFFFFF`: Bitrate Maximum
      header.bitrateMaximum = view.getInt32(16, true);

      // Byte (21-24 of 30)
      // * `GGGGGGGG|GGGGGGGG|GGGGGGGG|GGGGGGGG`: Bitrate Nominal
      header.bitrateNominal = view.getInt32(20, true);

      // Byte (25-28 of 30)
      // * `HHHHHHHH|HHHHHHHH|HHHHHHHH|HHHHHHHH`: Bitrate Minimum
      header.bitrateMinimum = view.getInt32(24, true);

      // Byte (29 of 30)
      // * `IIII....` Blocksize 1
      // * `....JJJJ` Blocksize 0
      header.blocksize1 = blockSizes[(data[28] & 0b11110000) >> 4];
      header.blocksize0 = blockSizes[data[28] & 0b00001111];
      if (header.blocksize0 > header.blocksize1) return null;

      // Byte (29 of 30)
      // * `00000001` Framing bit
      if (data[29] !== 0x01) return null;

      header.bitDepth = 32;

      {
        // set header cache
        const { length, data, version, ...codecUpdateFields } = header;
        headerCache.setHeader(key, header, codecUpdateFields);
      }

      return new VorbisHeader(header);
    }

    /**
     * @private
     * Call VorbisHeader.getHeader(Array<Uint8>) to get instance
     */
    constructor(header) {
      super(header);

      this.bitrateMaximum = header.bitrateMaximum;
      this.bitrateMinimum = header.bitrateMinimum;
      this.bitrateNominal = header.bitrateNominal;
      this.blocksize0 = header.blocksize0;
      this.blocksize1 = header.blocksize1;
      this.data = header.data;
      this.vorbisComments = null; // set during ogg parsing
      this.vorbisSetup = null; // set during ogg parsing
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
    constructor(codecParser, headerCache) {
      super(codecParser, headerCache);
      this.Frame = VorbisFrame;

      this._identificationHeader = null;

      this._mode = {
        count: 0,
      };
      this._prevBlockSize = 0;
      this._currBlockSize = 0;
    }

    get codec() {
      return "vorbis";
    }

    parseOggPage(oggPage) {
      const oggPageSegments = frameStore.get(oggPage).segments;

      if (oggPage.pageSequenceNumber === 0) {
        // Identification header

        this._headerCache.enable();
        this._identificationHeader = oggPage.data;
      } else if (oggPage.pageSequenceNumber === 1) {
        // gather WEBM CodecPrivate data
        if (oggPageSegments[1]) {
          this._vorbisComments = oggPageSegments[0];
          this._vorbisSetup = oggPageSegments[1];

          this._mode = this._parseSetupHeader(oggPageSegments[1]);
        }
      } else {
        oggPage.codecFrames = oggPageSegments.map((segment) => {
          const header = VorbisHeader.getHeaderFromUint8Array(
            this._identificationHeader,
            this._headerCache
          );

          if (header) {
            header.vorbisComments = this._vorbisComments;
            header.vorbisSetup = this._vorbisSetup;

            return new VorbisFrame(
              segment,
              header,
              this._getSamples(segment, header)
            );
          }

          this._codecParser.logError(
            "Failed to parse Ogg Vorbis Header",
            "Not a valid Ogg Vorbis file"
          );
        });
      }

      return oggPage;
    }

    _getSamples(segment, header) {
      const byte = segment[0] >> 1;

      const blockFlag = this._mode[byte & this._mode.mask];

      // is this a large window
      if (blockFlag) {
        this._prevBlockSize =
          byte & this._mode.prevMask ? header.blocksize1 : header.blocksize0;
      }

      this._currBlockSize = blockFlag ? header.blocksize1 : header.blocksize0;

      const samples = (this._prevBlockSize + this._currBlockSize) >> 2;
      this._prevBlockSize = this._currBlockSize;

      return samples;
    }

    // https://gitlab.xiph.org/xiph/liboggz/-/blob/master/src/liboggz/oggz_auto.c
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
     * 0 0 1|0 0 0 0 0
     *
     * The simplest way to approach this is to start at the end
     * and read backwards to determine the mode configuration.
     *
     * liboggz and ffmpeg both use this method.
     */
    _parseSetupHeader(setup) {
      const bitReader = new BitReader(setup);
      const failedToParseVorbisStream = "Failed to read Vorbis stream";
      const failedToParseVorbisModes = ", failed to parse vorbis modes";

      let mode = {
        count: 0,
      };

      // sync with the framing bit
      while ((bitReader.read(1) & 0x01) !== 1) {}

      let modeBits;
      // search in reverse to parse out the mode entries
      // limit mode count to 63 so previous block flag will be in first packet byte
      while (mode.count < 64 && bitReader.position > 0) {
        const mapping = reverse(bitReader.read(8));
        if (
          mapping in mode &&
          !(mode.count === 1 && mapping === 0) // allows for the possibility of only one mode
        ) {
          this._codecParser.logError(
            "received duplicate mode mapping" + failedToParseVorbisModes
          );
          throw new Error(failedToParseVorbisStream);
        }

        // 16 bits transform type, 16 bits window type, all values must be zero
        let i = 0;
        while (bitReader.read(8) === 0x00 && i++ < 3) {} // a non-zero value may indicate the end of the mode entries, or invalid data

        if (i === 4) {
          // transform type and window type were all zeros
          modeBits = bitReader.read(7); // modeBits may need to be used in the next iteration if this is the last mode entry
          mode[mapping] = modeBits & 0x01; // read and store mode -> block flag mapping
          bitReader.position += 6; // go back 6 bits so next iteration starts right after the block flag
          mode.count++;
        } else {
          // transform type and window type were not all zeros
          // check for mode count using previous iteration modeBits
          if (((reverse(modeBits) & 0b01111110) >> 1) + 1 !== mode.count) {
            this._codecParser.logError(
              "mode count did not match actual modes" + failedToParseVorbisModes
            );
            throw new Error(failedToParseVorbisStream);
          }

          break;
        }
      }

      // mode mask to read the mode from the first byte in the vorbis frame
      mode.mask = (1 << Math.log2(mode.count)) - 1;
      // previous window flag is the next bit after the mode mask
      mode.prevMask = (mode.mask | 0x1) + 1;

      return mode;
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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

  class OggParser extends Parser {
    constructor(codecParser, headerCache, onCodec) {
      super(codecParser, headerCache);

      this._onCodec = onCodec;
      this.Frame = OggPage;
      this.Header = OggPageHeader;
      this._codec = null;
      this._continuedPacket = new Uint8Array();

      this._pageSequenceNumber = 0;
    }

    get codec() {
      return this._codec || "";
    }

    _updateCodec(codec, Parser) {
      if (this._codec !== codec) {
        this._parser = new Parser(this._codecParser, this._headerCache);
        this._codec = codec;
        this._onCodec(codec);
      }
    }

    _checkForIdentifier({ data }) {
      const idString = bytesToString(data.subarray(0, 8));

      switch (idString) {
        case "fishead\0":
        case "fisbone\0":
        case "index\0\0\0":
          return false; // ignore ogg skeleton packets
        case "OpusHead":
          this._updateCodec("opus", OpusParser);
          return true;
        case /^\x7fFLAC/.test(idString) && idString:
          this._updateCodec("flac", FLACParser);
          return true;
        case /^\x01vorbis/.test(idString) && idString:
          this._updateCodec("vorbis", VorbisParser);
          return true;
      }
    }

    _checkPageSequenceNumber(oggPage) {
      if (
        oggPage.pageSequenceNumber !== this._pageSequenceNumber + 1 &&
        this._pageSequenceNumber > 1 &&
        oggPage.pageSequenceNumber > 1
      ) {
        this._codecParser.logWarning(
          "Unexpected gap in Ogg Page Sequence Number.",
          `Expected: ${this._pageSequenceNumber + 1}, Got: ${
          oggPage.pageSequenceNumber
        }`
        );
      }

      this._pageSequenceNumber = oggPage.pageSequenceNumber;
    }

    *parseFrame() {
      const oggPage = yield* this.fixedLengthFrameSync(true);

      this._checkPageSequenceNumber(oggPage);

      const oggPageStore = frameStore.get(oggPage);
      const { pageSegmentBytes, pageSegmentTable } = headerStore.get(
        oggPageStore.header
      );

      let offset = 0;

      oggPageStore.segments = pageSegmentTable.map((segmentLength) =>
        oggPage.data.subarray(offset, (offset += segmentLength))
      );

      if (pageSegmentBytes[pageSegmentBytes.length - 1] === 0xff) {
        // continued packet
        this._continuedPacket = concatBuffers(
          this._continuedPacket,
          oggPageStore.segments.pop()
        );
      } else if (this._continuedPacket.length) {
        oggPageStore.segments[0] = concatBuffers(
          this._continuedPacket,
          oggPageStore.segments[0]
        );

        this._continuedPacket = new Uint8Array();
      }

      if (this._codec || this._checkForIdentifier(oggPage)) {
        const frame = this._parser.parseOggPage(oggPage);
        this._codecParser.mapFrameStats(frame);
        return frame;
      }
    }
  }

  /* Copyright 2020-2022 Ethan Halsall
      
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
        onCodecUpdate,
        onCodec,
        enableLogging = false,
        enableFrameCRC32 = true,
      } = {}
    ) {
      this._inputMimeType = mimeType;
      this._onCodec = onCodec || noOp;
      this._onCodecUpdate = onCodecUpdate;
      this._enableLogging = enableLogging;
      this._crc32 = enableFrameCRC32 ? crc32 : noOp;

      this._generator = this._getGenerator();
      this._generator.next();
    }

    /**
     * @public
     * @returns The detected codec
     */
    get codec() {
      return this._parser.codec;
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

      this._generator = this._getGenerator();
      this._generator.next();
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
      this._headerCache = new HeaderCache(this._onCodecUpdate);

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
        const frame = yield* this._parser.parseFrame();
        if (frame) yield frame;
      }
    }

    /**
     * @protected
     * @param {number} minSize Minimum bytes to have present in buffer
     * @returns {Uint8Array} rawData
     */
    *readRawData(minSize = 0, readOffset = 0) {
      let rawData;

      while (this._rawData.length <= minSize + readOffset) {
        rawData = yield;

        if (this._flushing) return this._rawData.subarray(readOffset);

        if (rawData) {
          this._totalBytesIn += rawData.length;
          this._rawData = concatBuffers(this._rawData, rawData);
        }
      }

      return this._rawData.subarray(readOffset);
    }

    /**
     * @protected
     * @param {number} increment Bytes to increment codec data
     */
    incrementRawData(increment) {
      this._currentReadPosition += increment;
      this._rawData = this._rawData.subarray(increment);
    }

    /**
     * @protected
     */
    mapCodecFrameStats(frame) {
      this._sampleRate = frame.header.sampleRate;

      frame.header.bitrate = Math.round(frame.data.length / frame.duration) * 8;
      frame.frameNumber = this._frameNumber++;
      frame.totalBytesOut = this._totalBytesOut;
      frame.totalSamples = this._totalSamples;
      frame.totalDuration = (this._totalSamples / this._sampleRate) * 1000;
      frame.crc32 = this._crc32(frame.data);

      this._headerCache.checkCodecUpdate(
        frame.header.bitrate,
        frame.totalDuration
      );

      this._totalBytesOut += frame.data.length;
      this._totalSamples += frame.samples;
    }

    /**
     * @protected
     */
    mapFrameStats(frame) {
      if (frame.codecFrames) {
        // Ogg container
        frame.codecFrames.forEach((codecFrame) => {
          frame.duration += codecFrame.duration;
          frame.samples += codecFrame.samples;
          this.mapCodecFrameStats(codecFrame);
        });

        frame.totalSamples = this._totalSamples;
        frame.totalDuration = (this._totalSamples / this._sampleRate) * 1000 || 0;
        frame.totalBytesOut = this._totalBytesOut;
      } else {
        this.mapCodecFrameStats(frame);
      }
    }

    /**
     * @private
     */
    _log(logger, messages) {
      if (this._enableLogging) {
        const stats = [
          `codec:         ${this.codec}`,
          `inputMimeType: ${this._inputMimeType}`,
          `readPosition:  ${this._currentReadPosition}`,
          `totalBytesIn:  ${this._totalBytesIn}`,
          `totalBytesOut: ${this._totalBytesOut}`,
        ];

        const width = Math.max(...stats.map((s) => s.length));

        messages.push(
          `--stats--${"-".repeat(width - 9)}`,
          ...stats,
          "-".repeat(width)
        );

        logger(
          "codec-parser",
          messages.reduce((acc, message) => acc + "\n  " + message, "")
        );
      }
    }

    /**
     * @protected
     */
    logWarning(...messages) {
      this._log(console.warn, messages);
    }

    /**
     * @protected
     */
    logError(...messages) {
      this._log(console.error, messages);
    }
  }

  class DecoderState {
    constructor(instance) {
      this._instance = instance;

      this._decoderOperations = [];
      this._errors = [];
      this._decoded = [];
      this._channelsDecoded = 0;
      this._totalSamples = 0;
    }

    get decoded() {
      return this._instance.ready
        .then(() => Promise.all(this._decoderOperations))
        .then(() => [
          this._errors,
          this._decoded,
          this._channelsDecoded,
          this._totalSamples,
          48000,
        ]);
    }

    async _instantiateDecoder(header) {
      this._instance._decoder = new this._instance._decoderClass({
        ...header,
        forceStereo: this._instance._forceStereo,
      });
      this._instance._ready = this._instance._decoder.ready;
    }

    async _sendToDecoder(frames) {
      const { channelData, samplesDecoded, errors } =
        await this._instance._decoder.decodeFrames(frames);

      this._decoded.push(channelData);
      this._errors = this._errors.concat(errors);
      this._totalSamples += samplesDecoded;
      this._channelsDecoded = channelData.length;
    }

    async _decode(codecFrames) {
      if (codecFrames.length) {
        if (!this._instance._decoder && codecFrames[0].header)
          this._instantiateDecoder(codecFrames[0].header);

        await this._instance.ready;

        this._decoderOperations.push(
          this._sendToDecoder(codecFrames.map((f) => f.data))
        );
      }
    }
  }

  class OggOpusDecoder {
    constructor(options = {}) {
      this._forceStereo =
        options.forceStereo !== undefined ? options.forceStereo : false;

      this._onCodec = (codec) => {
        if (codec !== "opus")
          throw new Error(
            "ogg-opus-decoder does not support this codec " + codec
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

    get ready() {
      return this._ready;
    }

    async reset() {
      this._init();
    }

    free() {
      this._init();
    }

    async _flush(decoderState) {
      for (const { codecFrames } of this._codecParser.flush()) {
        decoderState._decode(codecFrames);
      }

      const decoded = await decoderState.decoded;
      this._init();

      return decoded;
    }

    async _decode(oggOpusData, decoderState) {
      for (const { codecFrames } of this._codecParser.parseChunk(oggOpusData)) {
        decoderState._decode(codecFrames);
      }

      return decoderState.decoded;
    }

    async decode(oggOpusData) {
      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        ...(await this._decode(oggOpusData, new DecoderState(this)))
      );
    }

    async decodeFile(oggOpusData) {
      const decoderState = new DecoderState(this);

      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        ...(await this._decode(oggOpusData, decoderState).then(() =>
          this._flush(decoderState)
        ))
      );
    }

    async flush() {
      return WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        ...(await this._flush(new DecoderState(this)))
      );
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
