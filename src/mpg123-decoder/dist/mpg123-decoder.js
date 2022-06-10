(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  function WASMAudioDecoderCommon(caller) {
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
          value: (channelData, samplesDecoded, sampleRate) => ({
            channelData,
            samplesDecoded,
            sampleRate,
          }),
        },

        getDecodedAudioMultiChannel: {
          value(input, channelsDecoded, samplesDecoded, sampleRate) {
            let channelData = [],
              i,
              j;

            for (i = 0; i < channelsDecoded; i++) {
              const channel = [];
              for (j = 0; j < input.length; ) channel.push(input[j++][i]);
              channelData.push(
                WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded)
              );
            }

            return WASMAudioDecoderCommon.getDecodedAudio(
              channelData,
              samplesDecoded,
              sampleRate
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

    this.allocateTypedArray = (len, TypedArray) => {
      const ptr = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * len);
      this._pointers.add(ptr);

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

    this.instantiate = () => {
      const _module = caller._module;
      const _EmscriptenWASM = caller._EmscriptenWASM;
      const _inputSize = caller._inputSize;
      const _outputChannels = caller._outputChannels;
      const _outputChannelSize = caller._outputChannelSize;

      if (_module) WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);

      this._wasm = new _EmscriptenWASM(WASMAudioDecoderCommon).instantiate();
      this._pointers = new Set();

      return this._wasm.ready.then(() => {
        caller._input = this.allocateTypedArray(_inputSize, uint8Array);

        // output buffer
        caller._output = this.allocateTypedArray(
          _outputChannels * _outputChannelSize,
          float32Array
        );

        return this;
      });
    };
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
    constructor(options, name, Decoder, EmscriptenWASM) {
      if (!WASMAudioDecoderCommon.modules) new WASMAudioDecoderCommon();

      let source = WASMAudioDecoderCommon.modules.get(Decoder);

      if (!source) {
        const webworkerSourceCode =
          "'use strict';" +
          // dependencies need to be manually resolved when stringifying this function
          `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
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

            if (command === "module") {
              Object.defineProperties(_Decoder, {
                WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
                EmscriptenWASM: { value: _EmscriptenWASM },
                module: { value: data },
                isWebWorker: { value: true },
              });

              decoder = new _Decoder(_options);
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
              transferList = messagePayload.channelData.map(
                (channel) => channel.buffer
              );
            }

            messagePromise.then(() =>
              self.postMessage(messagePayload, transferList)
            );
          };
        }).toString()})(${JSON.stringify(
          options
        )}, ${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

        const type = "text/javascript";

        try {
          // browser
          source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
          WASMAudioDecoderCommon.modules.set(Decoder, source);
        } catch {
          // nodejs
          source = `data:${type};base64,${Buffer.from(
          webworkerSourceCode
        ).toString("base64")}`;
        }
      }

      super(source, { name });

      this._id = Number.MIN_SAFE_INTEGER;
      this._enqueuedOperations = new Map();

      this.onmessage = ({ data }) => {
        const { id, ...rest } = data;
        this._enqueuedOperations.get(id)(rest);
        this._enqueuedOperations.delete(id);
      };

      new EmscriptenWASM(WASMAudioDecoderCommon).getModule().then((compiled) => {
        this._postToDecoder("module", compiled);
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

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  function EmscriptenWASM(WASMAudioDecoderCommon) {

  function out(text) {
   console.log(text);
  }

  function err(text) {
   console.error(text);
  }

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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0093¿ ÄUÃ8åbózæÁ®¦þõ#Ê4»K7ÝY¦ROW4=}ëTxÌVH6ö8=}8±ÚD½fTa±ÿUé±)ãüþ­.Ê@k_±þýYþ*âGù×I8jL¡/@FL1KX®ÉÑ/Ï= ª³»©þÃqpNuã&Á Á&óTp°)ó«Éô£³ºB¸k®ò[Ó©µ7¼%qQ"ÉSûãÝû´(>ÞY´¡æ{+Ä*Øã÷ÇÒ¶YÔ!ýÃ¿*õºvQn ¢¥£¹TïvÒ ¦&µïIì»K±:Î´L@k2ë©ëÔ(è×?4_Íñ[ñ\¹q[©¤Á¦þz
Ý yõ~{w&]Yaá Në?¯10òÿññðroq"È>~[iÝEÚE¨ý/»'%ÅÐjòÊî/§åßJü),8m©¯Î<0?*
¸¨²x¨QÿT^O\ÅÆÆÆ)ÙeºúøpÌaSÌ
7bNÙb{ìPîR×RëRßqQ÷"%Äyg+¤å~(ÑpáÅÕ¼
1%	Ú=}ãA'f,nÇ¼åº=}¥ %Fg7i,8ë´×èSÚÀåý8v3ìØýç0ü^êq÷Ì\­²Çãðg!×{/å\3¼¹êøµ?Pm(SÔÍêùÁ3bé2;Æ~Ó¾ê"å÷M1Ú^bf!l&åù-TÊT)gÝÅÅkd|p'á§ððN~$ßÛ$AÍ{³¶Å.#AqÈ91¶Þ­ÍâìÝcþe|¼n=}y¾¬Ð·VÆQÇmR{<FìÒ§¹NÚ
I9úEñÅ°éÙüÁ¾æüdïI:=Má,nª¡°eöQntTÖ=MÆ·Í[±ÙÑÛòÏY4l¥(XÒÈvÀæÙ¾Á>_.©ùFq5TÛIãEÓì3S,7ÞlßÖ\ÆNÜbôÖ÷L äQ ÝiÎ=}S°	bíg+ý×/Ç¨úÆV¯÷¡êªçÔ H6(ÿ
Jk!¶3ÐªÑ@=}£îíÑ8´ÊÄÒLb:4Ré	4ßüÀÞ¼JqÑ5ÐîJ÷­=}nMI(§ g[åÜQ8ÀÑ¢è)=}O;5'È?t;,­0Hµ^S$ãÒ¹Ç?÷]Â´MkQÛM }<Ü;3Ðì²¬ ?.Þ¼4µÜæ®òõ¬ìíE±Å÷4	¥YÈ,¼}¹}nÍ¢Øø#_'Ò/;ÄãZesð·}Æ¥U?ò¥ijÒ|*âù-å½ãâH­ÃÄ²ÂÿíÇØ¡¨<÷¥6ëßÞôÄÀnÉÒ\1ÍCT%Ëû/¸}6¸nk:¶WFÑùøîÞW
fâ^Ó|:x5W[Ý_zõSÃË4SK;ß%¯.úðátbºÈ8ùuü¬Çy?;ñzÅÐ3#Ï.¸ûddeÄ÷d\¿üYLìñ¶¼mÞ3xÂÀ=M_§ËgØ\ÛcëúkÎ8\Û6wa]±Õi6=}ÑÀÆ%=}ÑâÏ¬Dîñx('¦Ó~¼gFq©ùÚhVyLÞ»baUVÏ'ÅÄfè,t9*MáÅÝzÚâlÆ ¹N9±ÜM~Ëþ2½=MeþÅ÷i¸+÷Æ2,lú[Þ=Mcúí9ß)VDFqð6Í9!Âò:ÚD¬§[³·mÍ= ]óãû)6E'ÈÅ3z£C#²®w¡óB¹æ°÷ìÝÕôdÀâ&°:o×søÐ©óÿÎ9YLb®0U%wQ7yÀ:ËaÉÉÆS§ýoâVgëYq:/¹¿¼Ë/wÈ4¼³lÜÞ-057]¾V5e¬\é4¯°E%ûë«?äëm+¿ôé ~åo\Ä©3Zø9l«y¨©= XuKp!G´üË?¹"Tw½,í8=}¥ëjñ?ó ÄhÃè´è5ôU
X®%òH7½l®®^ÛõéÊuïù»ÊâQëö6b¿ylLÀ-^¥Etp û7ÍRº1Eja¼ÔÉEHl÷-%Ð,íÅÞYÐò:æ÷nïÝM y9EO/±~ýÓô«ã±7üàI)ßÅXé:¹¼ÚÏ+åUÂ1©Òvuë­ýV6ätOÞ]ë·i+aß>+:ãçKCÊÂ­5vO+Ì2ZÁ]æÑÊ*x= §x$<=MVFùø9PýEÅñi>¹èÑ= º8Ï|Kþp|A*à[\ÁóO(»SôCÇ%1VCMº²0YWpaz¿('þ$F/6¯N"¤x1RByf±úm³ð^,%ÿÀ<Ð¶0äkÞVÉz'úÃÌ	8Yïï¤Ï«¶¾ZýçÃðïÅËý]%¡qÙOq$y;pY«~k|«ÃÿÓ§ÌÝoj=MC»¥Á£PCÓéy¡¾o=MÜmktÞÛáûF5ç8d|^ÍÈ^ÔîcZB¸n%·ªøìôËJ±¹Z¨Gqe0(SeJ}XùîÈ6î³yé(+CÛUC]#÷½
²ñ½1x¿ÞÙ¸(ûo°ñ·]'EÙE[LO;×pßùìtË³7ÀÅ&áÆáÆ¶àá±*èãHóQuÎ85gSúÍé3õ:væÍùÀUûxn*]ÜáEbÍÇâ[mX8öÊ30ð~k×O5çýçÞ&RçëÕàQ)¨7Ù+':)Kx4F3¹ÏP	)ô¨
ú¸&¦ëÂèî= z¤;(CÛð»HÛÅ½ºÅêK1bè¿)Îys'êÝH¤°ËØî½G^"ì*¬}ÄX_]­ê*^,°±æÜ\¡Å÷J= Ü>Jª×0Ð÷J(GçÕõîì÷Õ¤Vû(oDqñª°6éÕIð³µðØraU_©ñ¹»äó ¢Ö»,>7quXÂ9æ{$ìã{¸Ñ2:Äj%}à)Ái¥dër×LºXó¿t§Ò]ð­U_d»úzùP¶P¢¨¡2-ªa 7åáÓ?»]ÞÈõÒ¤â%núZj¿6Ì­3Eþ¼!ÚZÌiY¯.WEjå)Pcëo½WN§&Èe9¹ DíB\fv.²¬¬.r0m=M

?µîö2¹´\kz ¼Ñ.8_=}eäx5' .ãùnRÈYSK$v1zÒòé{F§MDÄTÁDôf jÓköÑÅ¹p¢vxA6©+z¿ÂDjVAþùb%÷HÃ¼VÝ0×ü^PÕÿ¥;¿×Å3õØ³ÉÞöæ!à$p¤îmÍc=}I½±}i2óåDñÐÒMôÀâ´5é]áÜïzÓÿ]D¼WS@WÍi5+tÈsÁgù%>.PyNQùe.0#*P{¦²Ïyà¦Ò{
äZ°oÆ¬£qrñïñGþyàjZIñX+3>Nß~)ÁS+mG~X¡°iT.Ê¼ñ;«Ð¾axêoÉñåÃQúxJÚ®SmDþ5
åûo(ûÎ 2
¹õñÅx§æR&h$ì¶k>Ã ËãL¶£m_[ìc6tÕ/§Â°G Ê¿éÕÌàé9±X¼£Sº;ô;Ø°å¶<X>Aáø¸ã¤®4Å¹ÏÕÞDµÇ¸¤4èKô£ ­cäy;@®Ç~µU3Ì´Õ:-æµY3Ì¶ÕÖù»Õ®= eË= ÷ûO4õ±¤¢te%ñsP¡× ,ÚÁ\Æ·.NU¹Î[ºªÛ·.ã³pª´	K(IÊ©ÉÛàºÚâ7\a 9lÔýRJÔ»YOò"îH»LÊ½H+2É²Z¿ý¿&
(ª^½2l,ÏÓørRþE7É /Kü~ìbNnSoÔé»lîñE5oÐ²Üt1tPxØS
M'º£õwr.¤®B°op8XNnÓÞÒIÉÎ=M¾r 3÷&-H¤Z
å7Æ¥ÒWD¾ç^:ó¤ì8 7"J«ûÔÊØ(¤Å{sµ*<h>s',!á¤{¼exòOÕoìkdY}#=M7Y w]·,~÷b &ÿ=}¶´»m[üTl0áTõwñÊ¸k=M3½Ó-n)-ibæÌx7[¶c&Á_ÏÂNîäáÅ"g¸%p§­n0f\_\+YGÆ¿ìºQñ¹qÆ&îN^ÖV+M"ÿè}lwJ[l¨ïÄNjûøÙË= ¨KÙã@&nfÊÞ¢ö4.BXþ]V¬±ëÁ"= (óÒFûAzðãå°iE?Æêñ»M±_ê¶vt1´"¾tCÔ¿êzÚbkùJê~÷í¡8¿(¦¼^¿ºÈ§ôÍiÌ= ×	ÊµèÛáh%jÑAÿæQJQîÐç¨wuF=}ìÏ¸9x/Ñä@õR\Cq0ºèv&Iq»ìcìqäq¼åUÆ°(óuèUïkÖA(cMÕÓX·*»È&L_¯( 6OW¼QKxCÑ¾ã1ßÏ=}¬íå¥Ä7µ7á.ülþqFøï_´#Q:Ï²5Á#ÛP³xÓÕÝ&$¡¬ûDãaÓeA$6D¥Té!À£¬@¿µXRuÓº?(ëãD.²¾|ó¯¥ÞÚ<9AeÒá$W3÷Ýä=M9÷NiÆ¸2xêmø¿×1É&ßÃ)²)_9K{XÔp²²¬Ëvu¾QÃ¿ÖïÜ»¬bºâl>JÙÏ;Ð>ÒEá'âçAÒ!º= \ö2ìOM÷ð>¾M4{<K/d4!ÈïÊW _òÂï¿ïÆë<ýNÝhBü{ÊæÔÞT@§#ñå9ðúnÉ}tð$ôúþ×[_åÝLì;wà«*IvÅ¾6Áz·Çö	ú¿NÉjÉYðduåLuÚäUXr½ð0¾ö70(ZQrº÷ÿÎ\+ÿº¢­ñ'\åE¥DÙÛWeâõ1h0W]«åiä
£Ë3üÎ$G=}qgD¸KniJ#'ªkýºk$;êßÇo2:!@!<+&ö=}­Ýaywÿ·@ ^;µo2ÎuS	Ñ¤¢k­«}ÏÓgöI°vZo¬rYo­¨N ÈD¼Wòê^ÿ@:«>~ÀydiAÞÜuØÐ½^eC»j6U}>;ëOtö¼<¶Ü*²A
ûD¥§òc
YHÍk6= Ôú)Ç
Ky~Hj%ûþqYþ-ømR3L-\÷]ÞéI×uPÌsy3|-¯§x¶Þß*À¤²lðC¦V®©ê8Í9Má<ßä?î QÃ¤-ÌY¦vk±	Ñû8Ropìgºó®Z,¤òuùòï|#¬k´rV= ¬QJÖù»õâo/sðpz_¼¤Na'Âi[?ëøéèRû[ãW¡8o¿>~= #¬sa9ÿì·)¤o§M²«ÅxÀHo·ØpB¯Å;ÿ¸íé:XgæÂ ,àS@3¸R[·;*}Ï1´F§M!Dÿ[/´µ(~1,_Ód½íí¡K´§£!éf¤ëÄ÷éõÌ@@;Ö4í#¼êP¿ôji*Øs[Ãª6Uÿ!¡Î¶ßK8¯®!SM-Bã¡!S=}Ûíâ)ãÑo½EÑrÈÀ5=Mk¾O9ÒA¡ßmJÙ_9ÒQâ3Èô§¾É­]d]=MK¾ãf2×4¤ñ²¤ìf2çB&~Q¥À9¤¢êº»Ò®¸ëñéÚîý£/f£;ñáPÀÔzÓÐ ÅÌ>ÊPBf\±ú1hw+­%aÆc´ÝÛ²9ÕQt¾9ù[¿_S4¤ï"×ôü±d3'©hü3d­ëçØÕæ:({ê­qf=M	KR«O¸?3x­ëUØñ¬}ÚRªrpªl_(àñO7§éªûÏx®Ñâ©CK%ª+Ö¶KñÅë½ZÈ;bÃ}Gt{·ífS%½cÝó RE¡Ð~{Í¬ÞwÁÈO¶5xs~4³=M} bÀæ, ßÇ­%a¦c¬£ûç§Z¦Ì´¬ËÇuk ÝDT|×	;à= !¯ÚÝýNéSÓÐð2î:G Ò085²ànÃóÄ%_S4¤ï¤%ìåZÓZã¡2X;bh¥ù.ÙQ©#a¶c¼ÚÀøô5Á=}×ó¡ sÝ#ßÄà|û½ô\ÈãUCæÖl£,[Q¨0õçãÿÞëS5X_®¥ï²·û¸°XºÙ*yìiO4@Í@8í{eï£ÀÙó¡ s´ìTQ¶x}ûÉ?7@µíáMÇº5Ø_S4¤¯ªMºc\_J)á6?^z*Dyà = z665h8ìD)Âãû×µJç%ù(²ê=MðvIu©¬F5½¥Qa°"÷1ð¸&.a#®#?:è{Ñj¼_wÑRâ8åDz]P{ÁiL,eÉæµWX Pr,|DÜÜÖ)ÌR)ï[
¾Éým40Yö-Ên1_WsßÑ{D-ï%N_ÓìÞO7 yTÛÜnÂªïßüÛ¼]LhõÚR?pº¸v¸ ®é#]ç¦"×op0×üèBùt*ùicë^º·<óätíÑ³å\=MõÍi["=MCÔOãkÅàczU$ác÷µß2ämÛdyùF±ú	WDo¹tâ¡pºxbY"	ëÆÑdU{= 8ùâÃÌgrúRlõGhY¾óæµ'­ùü-®Ov!F~= ÙvÖT¹¡Ç½Ã!J¢]r²	Ñôêër 5üOCL2%«+÷FÊ¨¿¶ü@ ú©gxê2ßðf÷½h_h0uJRvèÓòd² ÁÝÙ´F¹U%S\7[= ÇM]\è$ÐÅum?Û!6îu?l®÷z.Q¢¶¶8Ø;	'\>±§À.;E$þßÂH¨Ø»üÃo!=M7Ê =M!¨<úv{ÁÒNLf1ó ß¼­°-JÐþoovtÍëÿÀæ³þ	|p}þÇS¾³5.ÃQo­1|ÖåuQe4Và{s$¦ÜÓ¹ûËçóÅÉ­¨ÄAÉ­Áö¨L«®ã<.7,?s=}¯¬E¯ÛCk¤¯ÏäE 8ºÎþvÎáB&Î"V°×Ä÷ÎúWR-&»a·I1Ã&=M!4õ}Ã@ÊR³M;ÐtøEÐÏ;ýn>ÑZ³y¼Þol8\Ë²ÇÜ NÊÈÅ÷ø­¡ào{&x:ýê"°ûÛÆ ü	¼®º]<¯½/ÀÂÎ2åH%TAÆàû»²CòAæâ|ÊqåZgR|¸Öû1{r¸æ¯­B.[=M
0"¡3ZÝ-ës\x¦èøãª¸Õ0í¡ì=MM,¼Å«ùó"¹ÆØv©£²ÃsÎÖ= ÷[ó
\0´®å$ ù}Õi+éüb¡ð4¬×¿m}¹nA,³t¬æYP5ÿMqPáZ2èË=Mc¾Í[¸:H
ò:ÖÅÑ[À;RRéêÌh@[ôÍ¾WþÌ§ôÆOÞUsI>UBxÆK?A°ªñ¢±RÓ®sJÚT>xpÎw³æyÜz=}Ãy¨WR£4×ücÀÁR|>#C«&'Îµ©qø ¾Ê¬göý¡Õ^Óé6äE'Ê
êpvúFb0aP0ºÐÜ¢Ð±^i¦ã¥«¦ÞÚÔÕ1DÆr_àæ<Õ0·Pz«nÝÇéÔW·:JãÚG½´ÉAD$:­JÇèæÛ6gæ}[Rù_ðþ2bP=Må·ú1ÐAPmþ"þ@PÐô+#4aÛñkGSÍ1¿«9Àf1¨ÆJ¯ù¯g´/Òù-ÉØG@¼ÆÜr{ë*ºP¬\_q¡g¶õ/ÕèYëm|: a<îá8¶wÜ_ÀI9(|afÄlÞ Ø,§ QT×-PpÙ-çø0Ì6ÅÍ®_a¸*]Ki¯µ1î×©=}5é«÷©7¡ÁWúh¯»æ¦¶=Mðö25î}H  øb´co¤òíîÚÁJL·g%X®@5uÀFZeQxAú[¬V¡ÔVÛØ{ãÆõ¤óùÜ,M)gªBQ{ ÙsÈ3Æ¤è4pkqBLi±&}¯T= èXl°{"=M!{PÙá+Iû[ %K+ù) ¡\KBGx
FQè®¯e$4ÕúªJxÅ»Fª\ÏMþµZ§¡Ï=M} ü¦×ûú±¶å"=M	å}£ú=}-SÏ:3³ÇªåãÆ^Áº=MÞt«ruk&d­ª¶2gRË¨Àr­¡ Ìh ¼6ÒW°dK¸ZËX07"Î);­Ô¨1?#U.´A²l¼äj³ÌÆvÆ4l2@Û%Æ×eÆÌKÝ~G¿ÜjFÙ#Råä6Fz´ÙeötLì)'ð¾ åÉØíõ3}©§ò	Ëh7HIïD¹¯ßo·æaµ 5Ev3Ër¶cò	$¦¤{Ú>ß×Td2t{¾¶oÜãÈ)P»"ÌoÅ^ãÔ¹ÀØÙjä@#fâ!©U3zG#y3ëFzòÛå_0b5=MogçpÉåtìé+4@PS9K~
8ÉÁd«ädKYÑY#pÓ8qÛ'ð/%aÖb+Ã±1¡£,þiÃQÂ1ÂÚ³ãÞá9EUç×sL:Ö'!T£º~äp­OÄQìJ#Ô5V$,8ÌÓ¶ÿ§#¥J ;àÞ^o:LÆÛ0ñCÔÿrÀ¸æ¶õÂf=  =MvÒFÞ<ºpÁ(A¢Âê6=MþýO-6Þ"@dÚFjs{eÞv[B(å?íËA*{§=}}¤//D:ÙõÖÑÙÛXøÆ2Ç×Hª¦óR­¯
µ£Ú5Q+,Ïy)*N=}5|ðgÖTmñÌÊ¨¤ªÀIº×äµ¼áëÙvP¼=Mã¤¬¸½¥Ð?åi×ÌoÎôjå¢5H³_¹î¿,~u¯@³ê¶8@¹-ÌóüdDJö[ä¥Æ;O«è.ø}÷sêFkN°»Îé<(©êÔ1qòäÿyú¥ïÇ"u©z'9Lì¤r\ß0ÊÄãÜxâÃ2ÐQ-z2d= û>@êjÉÞr&êÒ|ï¼èn zÅ÷ôÐìEúþh¨ºI¯Ú¦»ö/ýøÎ[pbh=MMû ií õiÂ
ÃìgâqTÏ¶/oGAÔÃo03ËRu¡ÅðNú]_ -:kF¿gf^æîþ;]ÛÊbß}y>yw/.>rGM%·@fú8Ç
(úÑ¿$o»#ø­|KÂtì O¾¼I¼JDm;ÇiÀ0UCÓ¯½èÂR­%MËÁÂéê¤ÿ×ü°r"]q2(þ%K@n÷üýý®¾X5ÐÛz~©E&cngøce¬õùÖÊy# :ðßæHC0?8ä ÍÚq¹ õç¾µ|S{g=M*ØBô6gtC´º°Àü'hXÍ²ìJ¤XâLEvíLâhHa= í·3UadÖ¿.³@ö¸yµ|Ch®l­gÏi´¥¿©mµgÐw¿®ÐÚÜ:H¶ÇßûÆYÔîIÕ}ðÙmT5ðH?=} ~(ÐÙÇJVK^!,E©Þ+Ã®ew>þËl¿8ü@Oã´µ&î9äEyJ4X8ÃùðRê¤0a¥ù,p¡i[h(ägâ|Çå%L;lµwú¶«^92 àEã/¦I¢ý%PÛNÎEWB5ÄüO¸¬g@·yKM÷Áð9õe*à ª_kôÅ½Â]ºuÛê¯?ö$æ®ï-áFÖÇým®¼	à¦È§ý¨ÒâxúÕÉ§Ôö¹É;A;(¬HåÆ½ÈFîWuÙ¤uÿµ·¸ýMt^[ÄöÌáß£Àt¼Rv	çMwåÎ½¦ßøBzXg£DýBö¾°¦sKWÆiÅß°H6Å8°¨ÄãÎ½Iæ7¨!aùÚè«èYêD{ÿìÑ»¤áÄK«¸Lö8ñÛhç®¸÷_%LP×LàÍÜ4 ,Ji÷©¡ýQîZ¶ÝídbÈPöéÚý]ñ=M0'·¶^ãÝ7Ð·9 f¸£®±s³K
ÖÎ£oÀÖê¥oÀÚî¸Õn%sWÓT@E=M?¬º5¢ý'U	A4òÊdáÕ´ÿå·Ãù;Æ|¦h,A%à;Eµ­$¡½*(ýüÔZ÷¯ÉCbãÔð-~Û)ô´Èm·q ááñ9ï×òÙwç_[´ÓæsOX7.dF¹,Q=}±!"QÚ© n\Ç¯MøÎùæU¿ù]Í÷ nÿ¶ðØ^n,øþfu£wÂ® = ÍE¤óÓ-²õV-6Á=}J·Ûß¡Z½Ï4Î9®æ4Z<ZôóujiþYælÈ8º³¢ODs¼ì/Âe6+ÊËunwmÔfu6ÙO Ãïfïpuz±r7R:­¯Y®ç)øÃÒ58ÛÀ'd'Å¿QHÅ!¸($Cµí[L£C4'¼ZõÛIrJÌHGÍôÉs¥Üù&Ã.úUwåÇ÷Ìhác23×¿´#÷¬W­7{¸4å^	;G«d«9bk½á.1= ÃmÂ ý³º?c8"äc[61OàÔJ×ùø÷1uÙ	£lèó,â£Û,:|TÒ .´ÆãÔ°@öãW3¸º·ÿ
éiþø;ÿ7§lªÀéÁâS«À8èXïMÏ ãýWËàceð¹#Ý8Q6MV)]Goß]à¦<0éì¦4SLþÛËãÏÙ¾= 8m¬ü5´fLií;õØ¨WcÝ+SõFún?SÏÅ ,æójÜøyËèmÛ¬D±¯=}´ÌB©eNÜOê*q®sl·I«È×å,áÓê=}x;¾×1ûý#Ú¿0 =Mñ@ä  ]£h»6ñ6¥ m;7m<äá6íøgâþç?ä^;j»>äÆEøgÒe»6äj´]'äÊÝgé çu9²à¦´4úÐ)ÄJC­È= ¥^;P¬ M-)äJ½ûç*H¾6	þg¹e7tÓÁ íÚÝ)ä$|Q4rôÃ.hã ¸ßÊ/BxòÅÍ2ó>á1ÑôàQËdÆT¦¿qRt²ipEÎ©ªsÛ¾7½íã7wÙ2udÚØtL2ü¬¤97X§:·UnÔËÇ4'\+>:.A;Ñ´Tæ$?BÒõÉØ$a Ô0röpÚ ¢ôÔ¿\O½ÍEòI5°Õ_vîDý õ£C#øÇM;sòÙ£ ¹´b®.¡
í{ÇêÆh¹"ðçfoÛ}D L ùoÿÂ-b¡º±¡Äá)ÃJ j0t¸Tãí×/q?®q
z ,'ÏÒÓÉ¶Ñ+Þ
ª*+hn=}+$lðÿlÄnÊ8¼CdslExLF*zY]Fú)úÚ]¾ì=} eåîäÅ×<¶= Ì¹XFþfB®C»ÊH3ñIáP¼ËÁ°poå­Â{ã&&Ïé= ò9¶s®ÀpTfjüÃVa¹'IÜ÷Øåï*éÄª>áÒððÝbGÿ!ÈDÿî»¤	Ï[T×eø?p÷×k9åÈEj@ïúÏ
zWæ}gYó^×|IãF¡|v@õ¸²*CÞ³¿¼ó³Ú-^Xõø·fýC0ã©í'\É8|0¹~yçï¶ì¨#eo«×4eLÈ;>5$(y×ÌùØÝô6Gø,ÖÝýô/2uLXÊ<SÖÙ9E¨ËtyJË³Þô±Ö@¢£j6S¦4LÕ@¤Ä2Y$ÜÒb.c·­H´jÜÄþJ,¤ÿIÐÊn©w©/ìÉ¼°·°BêD¸ÒJbÑë CíæWòr±~M'×ìâ= ?>'~:%3c8&"öGÜÌg_½uYFíÕ¾iêç¼s!äÀ±,ÎµýÐ3ñ¿Ðác%ÃÄ1÷LÅZ!%Q.ÊÃÐ±¡VWÀi$Ë)Î&¡6\á¬iMìáÈkE0XÑLàÜ?R¥Ì¤NÝ±ù1ÚLö§Â®Qp°L÷ë}á=MÉu¢g[¡Üì	òQp?¹|r6Ã­«Ww<È+ZÍ<¿êý#ä¿×ßÖ7ñiöä£ÏZ=M£àq¼_ßÿoº±Àl ÜÒ5Ò»µñqZ ëKÄþ±=}×ïL£Ü:"ý)ÒÉë×R!ÒÛúF"gqÚCõ[~Öçi¼r;îÏÃ-^ tç_©ØPÄl"}Qq8}ü6!ZqÑµ¦¤lpÍÍc÷Öl÷jµ}JÆôD¯²Sw&¤PLí²=MÅ¥òöNÁà¶IÄ »ðçdÐbÔÈSåD6åÍ5.ÛÃÙÙ½=}#¶XoÕé°öIêlÚZb+²c3³B:.ìñÆø5H)h]½¯Y(ßü&p¡ynJ6ê<>WUdÐÚ·@
eÆ\ïOf·è¨AµÍ	æ 6iGÏNðI wK4= ½ïø &ãVj<abÚÑ<ÚÈa.öWh¼Ú!<a,µÝî9¯ÈxÅÝV÷Íý^æ«?
EL'°&MÿõN£väÓ½ÂGáR0íB8ïé^äëcÎ7t+$I¾¨r£ú¸áê=M=}âê=}¦ºnâhwç¨¿5v1V¹]©zK=M¶ÀÑÐ^v6Ç´D?zÑWñë±M6Þ­uv"OÜö©B1Ò+kZÚ¤ æKÖn
:üGnÏòáRÎ=}?âþJRþ³ª?èN"+¿f×öéú?&$¯ÿ<±8}MUÕËäS´µfqK'îãK%æÔÍµË@±ó¿2ÌY8&é<äÔ!­W¿om¹¦ ÖÁ¸Z0«Xô>s9ØäÒÄå¥E±¿*ÈÁqEÓ<"¬óCLbO-à~Ç³LÅlÍ~=}Mµ¥no7³AÛHÈüVârïáïÈ@3zNìÆFïÑâÆPÛwê{Nú.#¨«ëd)
½­ù£â]B´mE+ÚÌ dy 33ÄLüd©0ê<i= V+¸Ín¤ª¦lnq\"{¢²ÃBfÎ¬yzà~]?%ãeÄ6¿1°@&ïJb]-3	³qâ·&=M!íÐ.å|s½wHÙ÷?D&0t oÞeÐ¹ËñÖ5BPÜ E±µçÝêj$jMtæquùw©J¹èÒoéÓL÷¸T=MO®,nQ8E§P¬#¥±Är56Ôí»&$BJÕÔ"Õ;W/¼½´+³½DÔçõ5¥ä55%7¥(k³½v¥bë^kø×¸ ääÌæçåqÇb£(ÇççU]Ý½õÁÁð(G[êåæBLÕµÎ[êuM¸wåE7íçÜ=}îÒÎåqJâLë¼ªÂâLë¼ªÂÚÌª5/'öØ0zØÅíz?ê E>æRuiìÁü÷nJÅet «ïLù @oÞ©m'¿ø-V%ÐNlÎÂõ'(ÈÇ7x¥U]Ñ´Øm×Ù¥zà§Pø%úÖçW|ðdloÅYOôÜª?äè9¸[5õ'²¹;9Iß!c¢éø)»+Pq~è?¾£A# n5¦P«®éÌVÉ4ñ¯c²¯&Æ~ù¼ßÆo=}íPb-Æ éàÉ÷*åËÌÏ,ðê÷2m= /PÛ£û&½Ýºdw)çIXuª¡*ó,÷E¢ZðXQ~ro0û;=M\¹ûéÍÓ¿qÓv9½4ëZÀFÐN-ld®¡bèªºdñ,9OÑé?ØíÿZâ¾âÜyO57KòR<w÷Ð0ó£%o|.G$¤mWâ£CåýEª|Çó#4Î[ñÂÚ<{\|àÃmÝ7»Ä»iT÷ÓJUòM¦=}û[üGF6*;÷Éé=M©ÝúI¹FàËöv7_hãx>7igè®
Xê®ÎJmoÿ¼Ë|= Ú&.ø]úW'bç9ÙßADüvØ*°WÂQ¤ 1Æ«5úèë]+f³Öß ¡°53Pºûâ»N¬øJâF¢ÆÅ4-íÇä % ý&õpÅxØ4õ~û<h·¢eP²Õ Whi·/XR !ûª~ul d8tàîø>9ñúmö6eüé:>0N >.1ýÙ¢yÛX¿Nøæ§N8Å= AØ(èêA= >ÿßñ¼nàâ!¶¹¶¿-Øàç*íÞ¶^¦+&Çèo[¤ø:í'%)h[2(7¼Ê];(Õ«\B|«>þÁ7xSö/÷SÅÑK@"ç]ª_hxÌ	=}g2öShOôDt¼ó¤rþùH 'ûû>Ê6ÔÌMãê{5 VUCk³jyæÚp·=MFªëcù®Ã¢çÜGÀ±t°m¡ü¼''Ü^ ë³µüÀ6teãaa«æ.ô'ôñi$É£®®Çs¼óz8gÚÂ±*UâÂ,FV7Æx¼ôÂÌpèhø§v·-íµ|ÄÞhÍïÖò{¥hHöR?AÆàÍÊ\KR¬ß~Í5ÿÉè9ÍÂ=}ËîG¼Ýv½mãfzMt&ýû~Å÷ïz?[¼å8;k9ý¬ÈýÍViÛZº&UÏZvq¯éÑ¨ÄH¼Ñ¡´~¤ûC«6fôwÕÍ©ÅÁÁ»m´óÇx¶UgæÅ>d'ò7æ¨jr§qÌÝÆi&=}V³n+JÖæÝ<ÜtãÂ¦}¨e~éé,ãÁ£*BNôÌ?ÜøDr¹Ï1,´NHáî";¢çï×hîÀVå3ã8­!¸¿·©¸{ôºôóàÙMÇÔ§©3dzY®¬ý¼AgÏ#Fd þªj.$bÁÕû~ÛßàÊÙS ®´Ë=M9Ñýj2u8yd.®XëZò 
ÌD¨&(Ùî÷ñLÚ­NÃH¬ù¼ý>^/ÚGÇÇÀ SD!Ñ= SxWHA)¡3 QóÃS¬¬ã{aEÏ9Èh Ñ)=M465¶ÛÌOñzþªFZt­j&ð¿ ÑLñWàJ@À±qÜ|XïÑ(X~.'î÷ª~0æþjJúª^î'@)@?n>Ëÿ= vÆIyÄIy-ÜÜ,åx;éá¸GÈ_ò|öO EÝw  Ñu°áo{ï9!ÂÙ"[¹3GQÛïj®	<õs  yÌÃòwúJmpÇêÆWÀù{§ª0.l¾S ×b©~Äiü¶­Äjö×Æ§	Mð¸rÍ~Âyp UzÂ¹ÏD=MÂÙÿõt@G"<2ýsÆºVCYä=}FºÎõ?AnuSÑý@â¨q.£WyfÈwßO/S£/Ýã%F¢Ù¦jN¡AÚnÂöÂÜZûÕú¸e	åÌ´Å-u5°«sä«W§±!7~Ù¦Ïò¹¶Ûù"8Õ¥)O1ê´Ô¥»äïvç\Ká£OØà¿×k­¡[!rb$íûHUqÌxj¾FjcjSi5c¿2^éîxMoU@*¦s0ÛÅl"û$NO?:cÙ-m'S:a«&¹u¸o8üèë9¹ÉÛPX*¶_²°¥/jÝbto¼Q*vnV
¶Q¾jUr½BS
¸¹sqR^cS>j~=Mðô[S¢$²¢Mµ9s1ÌUzÍ$Ì+Gë»¯(a ¿¯¶Fåd"z9T¹!ó5°!°Ü¥0Ò/ó¹èGeøYë&ËuuËµ:\öö7ÌD·§¿öYÊTUîë¬ 1HJì¬µ®(Ëkä¯ÿËÊÙiEÈÿ@Û®GHi»C-­ðíáÄÄw<~$°#a F«ª¤!«ÛZõÀ[d»t~­Æ=M¸oe2Öc(Î=MÄZ#í¬B}¼°¾º l¹Ä%èÏòÑf$þÕX[®yTÙÂW¡xèÍ°3U)V\,Èpu
65"ç ²Ø]QôJ¦ÐZEÙU©2yPÖÞÄ+HPôî]Ý/ =M¾$ô~¶E¡s)àU¼4à»y)?¥Bh¹LÅ26FÈ+SòBóÛy Ö¹{¸Ö& ]H»cõý¥±¼¥®æ=MHJ]»çJÂº+ÊÙ\PÃÙ×:>UÑ »pI\ðê ÀÛ´4%Î-@õ|ÒeR/22ù ';³ï?7Tt¯8-níB ý0s·Î£ÈõUjàÀ®ª¯äÖYCíLð-}EÛOµ"g/r{Êl À3}Ó!tlB0%Ü	ÇôKÀFÀ¬4Im~¯e«¹Çôv,¼«FûãÇÐmuüÎíÃÉõ4Ä Í÷=}ª1ë[¹«çþ.ørl¥ÈwãÉ#=MÀXQÎ¢ ÁwoSI´Ãó«"(Ë¡*&ÐÌ*©ËÛ?!°kyd½Ï8O4ð=}2Æ¢Ljbypu^W'h · T°®8=MÄ:¿i óä ]ÛwðkMD&E?: ³m¼¾fe)PùöÝXÅ2Iü¡!Þ(¸
åä	¼b©zq2ðÕåàñ#Î9É¨µ¥4(¨ó^E%%3JØ}ùL²y*ß:>èÛåögÖ=M°þï[üÆðËähdûY ¢ùB5°E|åöJ¦¸C&ÿ×CÝ­'[/³_éJ÷HGb>~ÁZfÿS4_°ïøY$'b.|ìåeUfi*vn3RfÞ?F/_6>®0Ú5Ïá&D´¹ävV£V»%¤»Ë¤m&½]0¶êb0í:-Óã:»Ç?$ÎÝØ)-Ó)] þ?tñMJðÂµ´«¹ðÌI§
æ4@~ìi?«­¯=}=}-¨î-oè¥wWºGX']A%v]5 Ö è,B5ùÓ¿Põ®§OÀ3ÿ2zqù@ÕÛÓN@½ârÞÔ¯M©Wo=}ÉPÅ'*Q[ÃìK1ö­Úq¢I(¥Ô>vÿÏ÷¤gÔPt7tN¶VEQûÊZâW(¼K= V& H_§*o¹÷,lÊÞÅ;UÔªð8¤á·ct®Å}öÉ(&^HJìi úËa^¶Ó_:cExþÒ^¡Ç°dÅËrÁ¦b¬Jñ!B&¡.ôÌ¹',¡AIûÌ^@+èR=}û$}¿ºnt(CïÕÿèd© þvº×¨»Øó2ÏóRúÌCf­ÿov:êß|:PÖó2ÃÖMEm;·+À®¯%½²ÊÈÂ,Å,9ªch´J·o9G§j;ïÍüÕ£Ó}#îÒ-=M*Î³ Y¥,fÖ÷á÷#1&6[¯kxúX¿Å:¼¡»nÎèV%ª3¥Ö¬n¦ÑW÷ Ö0>=M×£P¸îe]¡üø~GEVy >é= xnGùjJEAç@òè=}oéd±³!Ú|*Ãö/¹XU°ÃÚL«(P7áQxb[ùÇt¹ÇoÑ$¹ç\0<CYì_F¨ï4¢n+1Øk 5êÿZbW!p_¥RrÏ¢é-@ð¯Û/£	ßã.ãô¼Ñ¬qEµ!£ÑWCßh0çÙ}§³s¸>IËa1Buô¥æ?ÚÑl--öR?£|\(VûAð«KÞ¸ÎeH¦Ô±(>ö5Ç´XÓÛ>_7Êÿ;üt5°$×8L Î «	 pï»U¼~AÙ]e«wÅûÔtR1ò½ Ë*Ã}<·ÊÃÜZ0á]h¬BRÔË|bhC åÅÅºø:ÀÃº¯0c½¿¦vídeÉ¿µ@21ÒjxO¤¶tP¨*¡Ãb¬7ìûóÜ¢ä]õTòMªu¥Ì°,yð¦4ýá«Ä¸(îÛÐ{òuæ\«®ñÕÉóVGY¼l8¨NÄ·%{¸$HI¦ó£2ì¯ôZâ(joz»Ì»;·Tÿ<Ü:t-
 \-*vÓå¡ÝÅáÿl¾(ÿ.7º¾kG¶³ÓX´¸óÑüXÓ²no´â¬D'w**zõNÎyMUÞ´:pÛÞæAR´èqÁo#J¤Å]ØgQ\a	Ü1Û°§í+èf\À/iäk/ÿ'v$à=}0Uñ·ïwòñ|e P>Î|a	UÃwú3+>CÉÎÞ¶2D¡ÅÃª¨¹®ä´Hç¬ÞS²%éA·Ü JÀÍX%âÊÇ%WEÚ}	s¢9Ùó¹(e0ÿ9#?]¿Äá¡ÈÑ ½OÎøs,>þDò®rª¶îVÄ|8X2Ù£¯vÊµ¬«8.Øn32§SBõ2¦÷Ë´ô÷Ä9ú¾4Ôéõ¨Û÷,ýµ<ONÆ#¤Ìt?È­#þê{ÅN GuJçt ¯ÞjJyBÀ£ÂÑwFæ3yÏÉNÔ @)fk!lý¾-¶qQö/©>zä4÷ÎÐýGè®Rî!O·;\©³S ÖNâlTË-ýsÇê~Í¦Ó¹¯I{ÔE~y»& °m&FCB.f0ZÐÌÔÄl|Õá"Þèäð?èz×ÎwN´»@RR¤®MÑÔ¾kH6ìa	Uí<ÛàÚ;ÌQwo½º&Esy|F¹ÚÀÏ¥¤òüjñGØ2DõëT½âdÚñiúÏÃvRuÙr,Xª#Û2<=}mºUZi±Þ®;¢±®kÛÀ9§ë©T·ÆIl³nõÆ&å·Û³¢Ì-ñy:³å&opïY¢¦eûI¼#¶F®u­Ev·Ø/X®À Ã¹¼ÓRkwHgî{zÝAÄ*î<w¤ê1§õ¸Î-P¼åºC
>ÙXOñ[!è?ýÞIoòÚ»Ê¿s¿Í<qÏLÑ=Møj¢9q;GÁ©¼ý°g	g,»­{7X¨>«	\àð¼½â½Ð:ö1L.QÞ>AßiDæ{a5\Ößëµ8öO{Þµâ 5)«C©°¸I§f¨F6ËÚ«&úª¿ìÙ¦Ä_£V¯¯&Õ¯¥sw¤=}w¤§"ðÓIÂ²£ÊuFû³£ÜàÏÃÛòøØ¦Ç6&g;Øßðä«HÔ»xÒøNSÌ¡u3cRß(§n×xÅûw6"¹¢Ê4/ føª.½ã¶=Mª³P.¦QünU.R2^ráXî1;	­=}Ù¶MäÇ#§há"ÔxyUî½.ê=}1C}\¦|SÊÂ®ºñ¢bajÊ÷Í 'siJC7´ 6?¾e"ê6ðAlè·éø+ÊHf$ºíán|qÐL¾÷ý1þGyë&ûÀtãQt P8ÜxÔLJo i­LEL¼Vü.XÃ.ß@Å?Û*¨ap¨Z ®¡ÃNA±K3}?æÝ½ÕfÏvw²Ryªp×ø®³v
/ü[l= vÑÏDxBÏâ/¡o+5Ö¢NÊQíFà@nPV¾y¨gO£ÍSõ×®xp¶FÑoWÝ3®}/"Ë'Âª²¹cÈÛé0RÏaUûµõ«= LcTXJµcïÀAãé³«èÞÎl2ÊuIA¤»î½qÕ7ÖÎ$Ý Ð¤Å^5$hÁ£øÁ£ØRxÿØNÅ¶ÚÖYÙ·hÚ90Úàptø>m ÖF¸zýIX®¡g{tEloîcòS®ýAc=Mÿ¼þ¬cÌ=MÄÊDÕO@.½k?It¯2qWgzn¸Å¸µDI®¤ÞËç1')= 4ìJü«.h©ubUö¨ÏÐÑþF%¸ß-ÈdùX7)= ] È£u*}H·d¹=MÅ]) X¾X¯ºl9 ¹g/Ç$rWkÊ´­X¡®Iy|¹m2;= ÙK«@'óvåäjlT¶#·»#+.Á\ËÉOò-®<Pêg[ÌE¯(mHä<°Ù8	+þöß} Ñ|njÚF[ÊhOG¿¡Q¿çHXú$ÉòT&|(×ÄF³Õ¾D¹³&wOàõy!nâ>	Ç= ]ØCni.3/>|N¶å}ÆoìÄq´ºupµîÔ§N¢,'0/nÏ6îÈh)üòqEQ TumÎÁØAÎ"#9-IíAA£¶í)5kÇ|x¾Çó
[«Å µ©wýØ§ÛÁ¬u¿(7Ïªðñ£¿Æc¡$;0­cÐ\¤DªúàLGfþVE(E|,g±Bè£ pÇ®z¹üGÐU5:xÙ÷Goxµ) ãÖëËXÕÃ+îÂOë×¶zCËPÐ+Ä:dûïþ2G{ºçD0¡zn%u¥Js Õeñ¶»/LtW<ªd]O\d*æu^Ð>ÛwäNØ.{µI#	7ÅÔK9tÝ»Mq]T=MíÐ= G·ÉJä!a,=M5{Maÿ}þ}6FúC)?pËç-ãùoÇÃHsÊ0Î~Ï'×Y£rü9Ã>I°Qó3­âÔÆk#4^c­WiyGå¢ªô$ÍSÝ@û3-n&NÜÞæG"8$B«|à½­o%ïÓNì1z§ÏÊ$= ,¨þ»ÍyÅx* ]FgQð¯=M3½o¹ù&/qyaKÓÆ}Ñ8Ö°×H,/ AU4<#ñá1Ðr:|îèz'·Ê^z
Kæ$õtÌø	l]ö°KFnæâP2Òr¶-wF»0"³,
_]¨Ð$ß7»)×Î£è¼q¦¥8Ìu5!2=Mmû¾k#´W#äsõÀöDqV´¬À(ÁlP@?qHwµgÖ[b
ëçü?#"-¾¤îmÈCû×TâTSÃïêÌ=Mp×Ãó<í,¬}PC¦È3 je= ±YìÄuàÞbP{cwÄÊx$I<Í¹ê¸(¸RtP¢O'Ùñ[zA8^}OàÄ[åèê²D%àíÊ3÷ý¹«ÖþÛ¥4ù§<¹®¢d}ùæ¤©_Ýæ~~¬'1 ß.ßH>÷ÿøé\9DHn¶gûañÖ²ÜôDÿÉÜKåæ§UàIÔUß¨©-ÍFaõ¹Æ1'¸å.i}Ô[lÌÓ=}Á·~õXÈ¦_¼nk|IìÃÞ?üouû;ËHBN ¬ìøN³ú_Àï¾V¾ÒïWNsÃÓò*'ôØö#U³"³GW;ËåÓÈ[¥<+b4ûNÊé4s·0Tn3ÊÚ¬´38\R¤Ýýf^¼z¾Ödp6R£,Ë¼ãIâË÷ïÖ&±QÞL·¿ÁÂïüºîFDñàèÌ(±Þb¡báJ!.%Àú ÙJêPÎW\è
a;]=}wJ²uWê¼®¼ß©v°§VöÉð DÆóõå	Îú¯uìV]Ã= Ýî5eÑ²åÅ
[¡-¡¾ª=MÈÎªC¼ôë<Ø¥ôwSÀáUv«R:Bu¼Ñº0= r¨'³	d¥DuÙÎzgÚ¹ö 2M¬§=}y×ô¾k¤kiNFÓÒ4cªÒríÍÀxæ<'"Þº¯Ý£Î®]5èëü¥ù;~ÂÙö¥2t«é²khÈ+öôSGÅ½}Î¸>ï		'Pp¾ëzánU®¢	Wê4©/p<*«Ð-Y= ÜkÎò_ß4þ2¶{®2eNðÏ4"nöÒ±rÎ¦DÈ$Q¿8ÆÜDæòiB°ru­ u}©ê¬­Ú)ðTW©1Ö8MV0gJx8Ûº
J::qNðKd>JÑ#Êr2K¾bn85v¢y@Ð¡¬Ã&&ÞÜØ|w½?¸
È'î*Mî6È#"ª/(ló PÉKüTòø(çPYm®êPîC$ÒM{´Æ>+BÑOÑriqõ¦ægnóÏ'ãqÃ;÷ñ)8IoÇOò	@Ò9ºWºÚ¾hcii¸bµYi6êL>ÃL²LÒÝ¬Mâ)!å¤»³.6VJ6êRøsT(ÑÒZLxÀ ^ed®R$PaêOw B~29òLúrÆbe¬ª©a8o¿èûÿÄÅÑÁ$ÐDwp¶4µÚeNuc´Ø6cWFæ.R.bHÒ8ÀÚPNâ_¢à2M}xqù¼"t:³íuJGÇ7Ü0íP] ìxkºèMvõw.Úfîeó±«ÔL_·®,táºNÑyõgîRâqG}ÊÛÆo¦G~æ9¬§BRáZhAwPZR±¢+"üæ+À#m¨ÖJ[µÂó®ã^ôÊ-Y"àÑk4&}Ê^ù¯D)Ç±BÒI3¬×ÁpÿR^ 1Äë&êëq´eFººdÔ'Û(º¥d¦Ê¥"ñH ö+JÊQjÖp²ô¢5z)÷Zã7¶®b\
óbrR:ñYÂbiÚRó!à~Xô¼\ÐS}ð²<ºs~6ÉsSE²1ë=MßV©ôÖÎ*ÜlèSñ4Ä ä§sÍþÃ/5}=MÙwî?~0â7Ü(Î4Þ¢rtè3Ø/ÜáVä¾J¢ÆO'¯øû({ºÃ¨>åÅñ]óH>O8þ)¿åPRÜ©OÑÌºòQÜ*~(7T²ªÑ9²7êyõÀÉíjc³CØzexÌÈæq^&ÍoD£TïU¨¨ÊüúFD óU;É¯ÍWý bð¬@¥ª0ÔdëYîv¾5!98Åâ,[®ZâÊlFÚ";]>¿ïÄTPg½³j»-äãüÄNJK!5úâþFeÓ"Òæp@(bÛ0P6hä=}BÄñ1óýcoV6	@ îq}î=MÃër2b(§¿¼1Íj×!A>5*ØÀ)¢uÊÕ/Q+ØòAxehµ°xÙbÇ[¿å2ÕÁñT.èx×@v ±×5)­	(W1 Æ.	¶Å@l R°|/G= èï­/GÕ>¡ &q¡Ðð©yüÕJ=}ÎmñèVd	«kÔ³AáÆO:^.ê"ðk®Ì5AµÎôW}OmN¤	Ð>DÔ}XOl®q®|Ûë_C ûAMWíÍ÷­ÏÞ	Ù¬r6J\â^ÇFH-zÿsøÖR¢9?&R>YÒ ¯?ÑOÔß-&ËîÂÅÑÚis&Irx¸èÀÇ1økâ]rw>¹È3¹\89µC±FÜ"ögdvª±Ò÷ýnwî³µ!Ö
yB¢§¸p¹¹
äÝ,A¹á¢gUª¸ø%¶%V	n©ÕOJ´ ,î_äxjæù¿üÙq&ú\õÏ\Æ±ÒÞq¸¦ýêbïVCµJø(¸ug~µ]0)Ã,þ\wÐE²¸.ÊÏ¿xzJÒOìqµ^v(ì½Ó°ßO@ôªyzûwf%Ðò¨ãí§'z¾I{ÓQ¥¦»èþÀÊFeÖôu_pÔëû®|Ät7òtê4¨­½-¤5òrFE¬fAË{Âmròk¾¿ÍRW
$|aÅGcBm"x(øSírÐ+B4E[TýJÇiúcÄî|êÈ»®òãVÎy*êÃÄh9zþz~·õO¿7ìÃS©üMÿDb6~Pùð,u ±7t³G«þä7Øô)¬+WÅòLÒJ³ø¡¢[»áAV­R¡¼9­Aªparü9W¨HKçA)ÅÂBG¥ÒÖÍú[C$o^vL±.]M³w
OXJ\ÿeêzõDAo#_xÉÜµ'wnI£V{°Q£iy­?²\ÖëÐUÅç2&n·f/ò]Fãç' Ð3ö¦ÜØRî.ßÖ'L¥ç J ÚÜñAÈÀÏ£ZToj¬Hu[ç*ÊÑÄq-îÔÒøð.Úc=})@Ï}^+õqS­=Mý8ÛÜì8o©þ¥
ÕÊZ÷¥¡TvÆQ°8YqD0zy	Ó/=M= ¿ëÔÌ5J2}WRÑ´<Åùõu'=MlÈ*ön"8"ÇUÄfZß"ñ¡m:V~æºK2J[~R°.aJtáz*>À9®#C£j©ï¿1= &õ¥:÷gX7¬âWØ~Ñ[.xsÁ]$¶k·tÒLQ^Ä9 Ú¢¥¡é¤åØjQõh
t ÏÐ*ºÚ¢ÓÃèÀ2éãÐÐôÞ|}H4QJÖ"=}ÿìíëÉ©ETm!*M{=}ë±Cð}ÆX
{}*ôHHDÁEê*kï¿Á*2o½×n´gY.Õg½çO9\uÿ·Ñ´¼%ó¸·7û=}«ã_Û5ëðÍÜ¥Á¢ã+¸¼©eÁ´©Gvuç3çØ1ýæþg¨wÑ!àGõªU%ÙY]*¼ðÙ)ñ®n<ã9õ·ÇÚØz?!Üz!/óäà*NK5f= 8%Cü } r¼[Ü÷Ë=}:]MºØîrcN&(ö>x0éÝþ¶(¼eR{{x/ï :×ý»£W;¯¼Ô¡È/íÈ/ÍÈ/­S½ä/í&¾¶bUè§À÷¼RÎ/ïS²ös	NüÄHÎA	Ü	\ÈÌ+­\oA5ÄÙ^ñ>Õí(ÛÉkþbhpí¾KHg	äzFGÕï>jap§i¶
L!úzt,i)oeÎªJý9QTáÏn:E"uT¯'1eu³!^vl¬Z!fb!ºH*Dë	¨~Çe$Q+9E÷cfBBF>ªh.g^ç­7¹Àº!®p5è'è,*WOÙiYLÉz
Ã¾CìÂp_Î¯×{VæöÏq.÷<Æ%eÙä<ÏdÙÓ· Þ½Ëe·çðI=M«ÎbÈà*¿$2PPyþ×6æ+Î>#­ÇîÚC¬2ýÉàj.DXâú\©À·YZ|Ú7	NÃ%;ÌðDoéçªÒM}4X¨ÿ÷õ;¢¥Â=}®f¾mÊE£eÌî¹êdAtÝ.0O=}"R«¤õ ÑÉ­Yqád~+±ï;íu¤]Í26EäÍØÓ']]c-&¥3Ù»C8#í5QÆ¦¯RY=}úOm_ºj{ÇêS)Î!ý³üãËÈ¼cÜºfPeË	;°ûYhõ  1èÏ¨ é7ïLûÂ\]Ê3êW}Bóa3¦gdfÛZÁ¾d B8kàýî=}1ãQLê! HS\ÉôÜû'~MNw4×½)ê¦3ÙGõÔ,À´T½¹îØºÀ=}$¶HåeÀ5Ð´gä÷m;®sßt.äëQ~ju4DMñøÙûøì&2¯Ý;j>jxzgn]æåÂlF{ Ð\¾ÜÂeZfç_X¥÷URîûñ#U(eXOD7Ðr¸à¾­ ÈLM~ßKOé0\jTÝ:D×bÈ+!ìâV$|ÃºÙVEXlMcg,ðûý?àèðû}ÏMcçl9a:¼þÇø0%Ñ²¢w;ÄF³_¶Oßè9b?]ëè9>=}ß26½¥o[2»À)'Z]X{º{âL)¶Hqemûç·h¶[9«_j¼/ÍHÍ¹àvÛ¨·¨sVC|ÛF:fJrwLE|ò¥UËet:Ãfxc'O]Uó¤7k&öÙT>ÎÌ¨|ð4h/ÎàhN³MÃÞ^êÏçaX_óü ©îðW2/XÉåÐ>;b÷?i~KG}6&ÝG¯é!çÎ~¿hÀz»ý÷ÓMGrA9*·ÐÇXW^ßèÀ©jµ::31nDSéÓ«hÀ&AÙ|ÆÚR·¥à2 ðEÆl¸®ö*?õ*Ïk¸¾l¸Î²	¼Õ8p­=M gaa¯ m(È;3Eã,;@#Eß C¹72	î¼/)úB³àÙz¶ÛßÇZe?eÏªÔER³Ô?ûñ»¸Exv5íºA¹&BiT+>â@Óþð(ã4M³Ògpj¡ÆÌÏ7»éÚýI%ä:ñì¶½w6S[=MM\ÓÎéÅýx§ì rÀ4c,3q¸$ãå!GpË/ç¡ëÙ"W/åÀ-| ëJ£æPûÈ©v«9ÊÒÿ:0ð9p4
»/V®È0uÅ÷Øy¡×Fÿ	8¼;ÓÎüAÒO9'²«hét¶òu2*Z\ÃÏhXâ·}±ª w°«iDg ñ= :ýÁßÂpüC¥VVôtDD7¸O)ks. ÝóYáÒ0
7_B×Ôo¶ü²t[À»)LßÉOðøþç=}âX:øRC§¿ªo4'©?ÐÛìy'×Ôà1}Æ0aZzæÝ[l(Z½Í:¨ZÜÄ@Ñ?	:8»ÙwÖáüaµ/ªéÂI= J°£7Ë'qé¦Ô8Y]Rá^rßÕj½?#'pÊôû»¤û¦¾©@NkEIwlÎãD4 ÀB³N­ÀÐ5Ó{ÑÊÿ¢äç	½½î~;Ã²?×LoN}1 © XÙâI= w]*gÖð!B#>F:èúªaë0¬/á0fÕ¯*vqdÃ¢¯Âîÿa?bºaF¹ÐðGÖ~Ï4rNnâcÈ
YM!¦W$O

Ñ|öÏXw§'¼>P@&C1ô?P±¶/×ÇÈõaÞë¹ô0uõ­p[;àQxFu0íù~[p&t®
²\®wu°­&W
ÐvLãÖÖb¤5Ï¼S:§yùXÙUM­	°nU$<O7-ó½eÕUiÞk7= ¿~±à¯Ü×Ö¶ÉüuüÞÈ_\ÐU)×GÇõP*CAäsÝ%%{áîtý§£´àeMmµìÑíý. Ð.Av9.Õpêo0BW÷+¤µn±ÅIk6/1C=}©|+Äè&ÃÂ"we¶w!&ÝaSïôàJ¦¤à'm¡ßD8àîe.Þë õ|%Q·Ç5îqVf [Ð_^+<Í:Õ³"¿.¶·1Ä&Ö­föd §h0Éjûråmò:q·÷øHf*Gª ;*å²ç²ç+MÎò=M_(G:ú°Ï©wÙ09=}·Pf_:¨tÞMJp.U*;í®2ÓW·µíe³¦{3×	t%.#Ð¾|Ñ¶C-Ý
wô=Mù¡(òB;3u±9÷"Ç-¼d:È¦ÿz1Oæ$O8t÷%sp6ÄOâè2êÂµ5è²utícø]ÊëFU¦Ñÿ%¿Ú_#VZ<Aßû'9cÊ'FÛM³b"g±PøyNWDÓ¶¼ÙT	üÓ²Æ±ÂpÈ1Ucºwfuk£¥ÖåtÝ°ýÚ­£o¢¢Ð¥EfËÓh1Ñ<±e*Ë²ú¿´|¾º£íÝì¯ù¿¡hoý¨=}Üû?XöÎÈy¾¼»-Ç#Ög§èÝ¨ÞåªÔên{ßPm²VòÈZ^½0áµâúmö1,Ol+æ>Ý¨×sA5ý§Ç¾{¯ÐÍ©2ÈÜ²xá? ¸rÊ= ÞÜtfQOÊyÔØ9;&iZãêl'¢\àðLð|ÓOÖÃ+ãêôz g²©@»©Þþ÷×3z²µå?Å/×7u"ÊMJd*Ó$qéLb?5h_VtnoôÈ¾vö$æ)tß¤ ú±óMà§ùLµ*6ËúLvo'Kcæ÷.$¼¤LÓ*Tí1Ù;ßÖ¾fU´âu÷Zs7Nhþ&gývÙ7ëþf%Þ³ì~5Á(ºV{9@ÉÀ¢Ã0So5Éáôl^¿ëëÊ£oX¸øË]TËä!À°eBVàð¬ï BAuh?ë½-;'ÈO¹ýHêýÁÖûÕ·orÏ¥·¥¬= {A/w¬5'iãý!ñæ5Ç´?_V5'ÕQéú¥8?eFJ*ô	vÂCKôô@Óª*)XTtO	m1:¬ãä5q^Û)CJ@¢º¡Ö2i!©ª÷ûg½c­dÝÓb5±QGìÙè:yõ4ôKI%7åÙìË[c aì£:2ÌËIrµµQÎ«
ýûZ¶pEæ	^K»x~0­m ­m|ÛJþpEæñ:aRÜã8½òö{ZjXÄ\4-J»gû¨]FÚO©¨à±WêÃL:¸îÒ$<{Eý&GÉÆGUðSÄÚáÓ	1\ _ªÿSc-7!@ûÜ°l4wEWÔë9÷^üXÄí9%ñö491¢¤kä$k=M:3"aüpèö=}@¸Hú_e(Ý9F·sRîD%ô)»¹ÇÕ-CU%õE)5=M!u©mcn¹»wNÊ­ã= ¬Ä=M>;¨QëÆ·2)W·¡Üâ¥ü;12 ¤ÂjD=}¡°¿9BaC?sæ3º¢¦%  ª{è(!ïuUÄY¼ë¿-3+¶VMÑ¬Ëðé!íÌ­×$ÂÎ©þ¬=}:h@jD@Ïeò¨áI½á ½é£Ó°È½b²eË7ÇÝ=}]üUhDJµ¡TÄþSU¿Ö?ðÏùÐrÏWï³îúgácçiÿ%ÈëÖuìyã.zÆßÓA+É¥ðiá÷õþ6¤hÕýÖül	IýN|½JÏX0åo1ÔZ">KÁ#-òjX¸j¼bhàÎ âÂDP- 7=}45¡¹A<·S«ñ{)«¡Y"qþ9ÿ7}Ä¦­¯Ô¤"´~ö\ÅOÌÕì,t?ðFs÷ø ¬Ãf(0b9ÞñLW{]"äêãÉLö§Tð/eU^É¦ªio×YVbf&­ÐÿQïN*&µf\ýð®DQ/b¶Ù'Ïòú¼ÑG<KÅ1d/ÏAòÿ[[Ü«Uü½@ÜÙ;¢¡6PÅâ¦*Q =}á¤<nÓ°¯xæ$ò¦ÜÀd]!çé!åú\µïàÉö&ùî'\·ÃÅJ= Ã7^6v6ë%¹¸[Kíß]mV¸îÉìùÆ7dÅèlÙä owOàk$;ZÈ½ógÚ<ø4ÍVçÞ!®4í2.A£= )×¶RÌÞ0	 <Æ\Ý1g[åþd3Ùrç = Ã\á@i«ÁË±ègÔBqJyÅ±Bô ]L)=Mfú¿vFõ²2TkZxºACºiÛ£åâöw×ÉãO´vM[KGEë1§m) Lt(·óNï«»7$F)<O¬UY|#Ï?Õîò£}Í©÷E¨ýnUìªÏ"pª»AXLÂëkczÁa)XTd} $hng@fU>þR}i½t~Z|ÐtB,}Æwi"¿Më,7ôlvN¯¢M=}{[ÏhzÖAXá+=}1<K-u¼qPDµd'áQð2]³3B^XáLL/fªGÅß[VêÄË-}7¯ì.'ÃËR%þÓa«
ÅFS¡;°Æ8OK(dè*ÞâZßh¡Ú0§«Ëÿ1F LoÞWrû8ii>â-}à³RÛnk,ÐUht
d;"2µðí·[g¿fwªTêYµÑ^{×Á5FúFñÏa¦5,ibcüû¤¼a»;ý§ì)
vòÅgªv¢t+vw²Sd@è>RýG#B×Oéb×ÝúC/ÂÕû87ÝM0æÝ?ÕãÂ7Ô¬¨ýröC¬)Æ&ÅH°I-=MÏK$Ìï±Fx¤EA0ÖÐ~Ú3 Bò¦QéRä­ÝøêôG?KRAB<¨R0qÚ=M®~h&¤"à@ÿ¹\éº4~îd=MôÖWµ}:®"étCÅ'ºÏßp´æºèÜ!¸l±TÉ»^ WZ1»^"xÊQxgÙÒÕ¡Ö£=MÓ0¸Ý¡¡¯öMI«ÚÏòxÎßjöÍGG2º6?j¬	\=M>û¤;æD*môó½ÿ§¨ðø$Då&Còfò.HHcÓ¨FPÅô|¤X¬UBY3¹yÓ§fMs:wÙ1ß@¬x«ß¨Ô(®ÿ~äu{êÖzx°Îô­!RÀØ´Þ©õá·ÐÚpoxx(ê*ñTÕHûçWåæKw¾:ëÀ<C"AÈüKÙ¶Üâ=M;= R[ã|ðó&2&7íØjF«iÓ¢çu¦)0N¿êÍc£,ø./$ÆXÈXH6jÁ÷µäÝ8íK¡ð/¶1àï]}=Më¹ßE1Þm<FQª|T¶EÁÿ¸g¨z ±-%JF3¯Çe¤<ßkÇ×ª)ôµ 0:¾óÌWD"gÀ^îë¯].8k+ñª_&¤C×2Pìß»Ù't#vW,ègÃv'¯¨",ðQÎcJîñ+ºY¡æ.h Oç°§É5= W%Ú=}ò	ôZ¶ý0=M§ºb£ß¿ÖQÖfÔaí	ìójflÙØG¡ub= ;éIOß¶eXãï&ü·q[¡ç5¤hîæî>í¸ÑÕ*WÓCÉåäLdMÛ÷7¤	æuxúEIíf	fÇ£È«2ul×FÁ©=M9û½äsä#Ðÿ^IWÂD 4»QÏö<Ã1!îÖ-í!ôùÏ4@ýQÇm 	çWVF/7%ÿãÒ¥ã!CNÅ¸$~£Ü;ÑìîÞÃ«ê1äã U¾~níÜL@ Zwþ1xgû	uýNû©i6OyÏ&ÑôÌbü\~l¨Ë1Ø!¬7E&ÈTuÝ4Ã½KóÄAô &(±ó=M÷$¾±|¤}ÚëFPÂ¡bÎ¨ÿ@q0¢Ö|w5.×ÌÐ|¬èÓL.ÅcÕ|Í¸#f,ò
(tË Pä¥¨¬Yplµö?næ;vË3ß×ÂÃWv°2TkÑyoÝIÜ75P¹¨WÿfKÙ?ËÛ|}'ß]¸ÍPQÞß{êAéf
)µÕHÕÚ ZÎ½.=M¥HÓ!íÊ@sâ!°®-(­áåeºýØø!¦.v¯øÅ=Mh½ýÚN#<%á£ µ}p×ÿÙxvÓ@?
Òéá>/#í'Äø¾+­RiÙiÏ$4WíY7;?5ìWèüôÌ'{È@ÎæÂ·Õôæ²÷Rð#J ´ýÑÉÖðí *næþäÌ1Ø¸Gêéôí	à2åðPºÊY©ÏîÓ"+YYRýI"Ô£tÐqÎzjH÷D_d¾q´=M´;ho»B×ÒìzÂto=MúKõìôHL6%ô«(ìoÆüÍ¡TtÕûî|ÕÐQ²Z¾´óÐ[Ë= ¶ìË%Ö^ã"¨í
½	óÏÚOÇE0Øç	Ò°À¸<ò®Ý3:0z*tQ@TJ÷Îö ûi0X¸§v¶Á£Uá8Ö][Å1ZN4m6®2LK*¾9<·Émã» @[¶.h»{æ£	ÊBl	ø ÕC2Ë¥q¾3äâ´íñ)4h}B),uÌÁíÒæÏØZÑfázª= jUÀÉÁà°m-x¶~$§hÊÐåRkn³(PçØã¤êì¥uTDEÆÅw1/Pª¯ÍÏ +Nxëáªû= Ì¸A {Z";KmëÌróíÒ[òUÇ®Þiÿ^é´H2æ¢åX@érÕ\Ïö©Aó­-éd¤Ù3¥Æ^eÿS_é+x6vûÄô<5ü©ÍgLc%F7ûIr<ð×Î«sk«.dA>û²8àù(xó½Õb©»·êDKñÝÈRÕ.%ÿ"ô¨ÎÛanU"ºç?æé??$h­ÄØ1ý e=}Ù0d­,ÕZõõÅEBè¹(ü!è¹¡\Ñt=MôØ­ªí$Ùì$¿¨ôjgg÷.½ê;è·A¡8>Ba¶Ü;Ú~¸Q°W*û¯ª6KÃØqçï-¨ÁSyïK ÑÏ.! ÍJTÁv/kçÚÒ£ÿx×ÿÿ÷ÖAdTËèÕ±~^þß»¨uä£k¦0FU>wÂZ,3§%äÛ%{i= E¼°xN«68×ºTöµÔ³	âämcA¤<gÇèðèN­g5L#ÀójÚ¿]2Vk$2~J¹½gõµý¡Øm©¯îçgéør8z±ø'L£HÔÖÜ0³µ¯@æ#2äù!¤6¯È kÕ:1E±AL¨ð%eà¬ÕÃ~uðÖØq«óóOdª&©fT^°ªZr}¾N_:?Q]_ò»|ÍÔ$oÖØ8ÉeÜôüöÙ-Û¯ý©®M¦§ªìgr¸òddâq:µ\µzã§¯´ÇØ"ÈBgÊ¶XÏîtQ¤}=M±ØV
¾+êÿä3¨'rJãÕsvK	¨áÞôw¡= ²=Mßh8É+¬4%Fêª2¤$ê¡Úñ¾Y"ODÆ{c²å[¸L×¾hvo~¤,É#Ò~ <¦Ägb= dÎ1¨yÈX¤Ë×8î*3¹Óg]ÊúrDI¡ nU+¶iY= ÔLpÒ)¬çBÐÒ'*áºOpKO­(ÎW0èMûcÞ:x4À+¼töÖiæÚNÁ@Áà1ó j)\1ÍuºJ]Ïä¥Ù'WzõÁÕIø¡=}(D Þx¥Ýe9Ë<Ï£nu°[LÀuÅ)Ú¡ÜoçBÙq²þO<jv[l4òwàOªrÁLâu= ±Í{ÂOº&aÇ/Þ?¡ÁFîGÒ&@Ür0[µFt©ÝHÁáÑý6výí.ÛfW"mâFzü¦Wqï^pFÿºB0w±¤7îÕ36Ü¡¤¢´µ®¾nGpá	vá²¢fº¬£xÔ×lÖâ1Û'·Û#óX½UIÉø¼²l¼üzDúÚØépÿ9þ÷Ëqe<ùîÚ4NØÊ·{ephßV:|1i¬MúÇ°p~ÇofÈÐp~È!Ì r×¹ rßù R->ÈÍMBf®{Qt[ÐgRMÁ?$íÍE<uôÐ¥¾? éBýP=M½h>äÚP!°XÍí¨½omæ}ßÛ\´Dø!´ák'¥ªaq©ðNòéK{#~=}#¿ïðß#= è[ßlç?´è¢´~>£M«u>#L£EAl§Õù=}#= ´÷MLÍ÷è[´7îo£Õíø{´´Ý =M6ÙÝVEÈðû]Kò{	'­òÖX[®#ØØMÐTOÔK4ù«ÅÛ[C.Ýz¨Ð½àWàF·{f²MG"gz¥fûî<å^[s½´ âäe¸ö%3©B¢#T1Aî»n] ñ·5­¥õ¬?$iÎ)¦^0»©iÚW5åýçÈ@ïpø®¸""õò¶ß= Æqc¼mºH¥Í Êÿdínnì ö ÍèØÇýnãdOrýk£táù.Z#J_©É±~
|= ¢e1nuV¬}0ov}Ý©¹öxÅÀ\SnÿnÿuöOL}Ëµ²+xÃßS7"Ý^UZ80húÝ®·õ+èf?o=}Í?&ÚrÔ&²íÀ1 Ù®àæ'ûùn;Ù ¶ Ü×W§ø
:ìÕ;áuËþE)Söøµ¨ÉÔÍùµ©}ØÞó¥&Ç×U§ Çpü ÇYDuß´Ãü.+øfÌ@y3÷ê½ö°j´¿à3}!²&xwh s:wÖâÎÆ&P7²|¹ï "eiÿ=M£uý}¼lFjüÑ-D*IÒ!ÛÐõîâYy´¦ËyáÂgJ\7Z´ç+çª	f
Yc]qÐOíÍåÌ'w9Rùãß37Å=}ä¹åEÛ»{QÜÖCæ)s©Õf{e¯¯µIÇléìRëuà=} b*ø¼|^ï}j¥fØÝ>mÃÏU/Ñe¼;kº"»[ðÅØ7ù5§¤êPÍ£\>ä}ÓçQÍã[´B(Y¤WÆ0÷VÂò;¬À§BÆ#Á¿
¬k®[¸Õ8Äû¿øz¿î"
ô7rüý×(ùç¥PÿÜÐmYc¥ja92
OóZþ"ßÏ8xÒß¡à]®À«ö· ­(ImÛÖÝ	#ÓôÕ¾úpn"iÈû°?}I³Ë@q}Ô26QqÏ³ÝLcÁ/Þ
¿ÍgÕ~FuzùKræ·¨¸wË³gñçÛhYe;ûáoTpý»ýPö ²Ã^dÚ´ögûPèî2^&ýLb
üaìÙÛ·;dÓXÁ Ô"§}=M4ùüLÝµ³G«h0]s$J@ôS%0YëxÓ°×RIZç q¾r§>måð£lk\õ= .O¹ÿt}Bò7rÞa¯Å(¡ÍÍBÿü´?7TªïÃáp2®,eR= 4g´Úö±ù(Lÿ,Í6NÉÁ¬PãÔ>ØL[#9ÂÊ9¯D¡Ù¯'}&óÌP'&/'í,8²_ÅAóGòÝµwÈo+Ãä}[·Gô±_ö¸¹gdú|Ã3z/ìËÁï=MÜ9¹O+ó}#Ò
YÇ±¯w%ðÌõHõ÷ØV(où&çªã¬ÑÜc<G¿I´p1¶=}&·1NÁïùöÏvpÄß¦ÆMvÜçÞrc(fL­'Ç+ÄD?}*ºñz-Öx5»÷8Î1Z:(ù±¦~ºTÝ·S&jiÆ·7ÙÍ ¶L«eÎéòK'U9_EÔÄçoCÍA% ]¿.¢È,í#!= ì²
ó0ôªâÐ]ªI¬Ì¿wÁóÁÖWÅ8km¼uï}(y¤¿nJPÊN= 
]h4xàïÒqô½ín§9¨pjÕ}=M´îå-§¢sUÓÀÏ/XÆêqSÌÞe©7ÑËÕ®tÅÞË¾g[Uh©*?ÕýUî§ø¸ËÈ±j.R¹×ù¨ë«/ã ºµÌ~öªVÝ¸qÅLÇ]£Æç·ó¦m$Úî7ªSÒQ®úAKBnî^z6yIÑÿqtdØ§¹tLc2Xµ³z&òfB<zÆAwò{~uºÏârDÂæ=M±z.ÑÈ¯zLZáþEvÒÐº¥»Ï*
(1%eØê¾¤Þ¸Å@íï h·áÕlc÷ÏÜXTv·¢î¥2&dÁåîÊm´£!±§K¯_Û­Ö£eC¹1å<ÔYwi$ ]Ú¢ç~KLzø9áe÷«¶«°U§¼ÀHuÏ;±q@«³ë'÷¯ªêV+ºc*ZÚÌ¹ oÞÕCÝ6ÍÖÖ;«D¢@"ëÉ= âë ©¸iMVfÏ!§(Â3ùRìBlul>=}è(Oê@g)øGGÇ-A(mcå&Då°ÝÐ¨0
<OTÅ]à= ²JNfR=}õ«ÇZE.ú[.5K)lßÃ4ÖGßEJ[K½òòÆÂÆ IV^¢²Þ÷4>Ô_§0Ýk/¾Ú7éÒä½®ý¹T5Þx"]§gË^Ë)åPdån¿Þ
õ¿Rñï0¿zü Ù­¯-øHº¸s:¥{Ä£û$Ó³3åd=}*ÔHH¿=}=}@¥è©çO¡;cªç ÓÛ h§hâØÓÜ3ý£ï ÄãÀ-Q} Õ7ÓH Ù¢WÉ'²Þ´Ktc3¯câ<Tgcsgnêå9±ðÂ«ÝÑ
¿Å¯(Ø ;VOØtÑH\Ì ÷§0+IiZ\º]¨)6
ËR±dæ¨­r·iCîûY1¯§àOÎN@"åKCõád^AcY9	F¾|Fþ/7G2=}ÿ»)Í+uÂ4¡°u¡ôKfsQ.tNRPÿt:he2L£üYVþ	'pê|(øóxt Ñh¶:È×ÐÒjfükÅW@±T _âK[íö´ÏW_N M_5âêròWÊX1Û¯R7!Á%²Ô³&Ê¬= Nòo¶[£¥Dë@áµ;.MÐ{i¿¾OÞ<$¼ÑBrH+<«ªÇWØ'@¦Ô®Zzà¡¼£ß IuF	$>â'!Àqº)¶l íõ5Õ8ÝæÂu|b±=MþPrÊÞ¤RhA2ñ5ÿÐþ¤ª0»°^©4Çö
Ê'	w7Ñn_JÍÐ"+´ØK.¨DEI{WUõEd7Â]Á&Öá¯Y#ü=}£/!«øºÅåãµßU p&s~ñT¦ó~¿rCú5TÅ 0¿r:xô5¡Rïí-FÁÀJ8xËÁøL¸+¦ÝÃ)óéÁ]þ~¾g[}2ðóY,íÑe(ßáU/®AeÙN!¨7¢µröR«o[ÈßÍ¸'ë·=M¾>èþJqXîùQrÁæ[LÞ[[çÍd@@øG-¿Ùl]/N«ñX#¿ùOí<¬pb<\â®X2zòRîV×:væ ö}'÷ÅóÛ0~åe¼ï=}Äðm%ðÌQzfÊêrØy6ì²tµâ)|ÊA	éé#M°ÍM2ï­uÎ·2³Ç?
8ÈÿKXÁ= É8úài^¶pi.d1¡ª5°½ìYúUPÿ"':×¯å&QvñÍ1mçOÜä¦FcPÂUàpÔO+Ú¨ctúà_ì8Ñ-"ÃýzüwSÁNÉ)*vÛæðIÓ@ÊÇ¬Oµð³ñE¯þ´ýMÂ·^¯óY(¦¡Aïtx4ê1ÚX^.l7E+H5ß
A5¬ ò½Yê©
l=M|ÃÓbÀAg:p!~6H,AÊYáqcûx«¤FçWðþr\ùqÔjJh¼¨øûxXñx~H½=}væÿBZGè²84ZW@k(® 3å©ë~=M.Å+bÕ^q¹x_¡ÍéàV.|á±EõE&§ª8L$wÆõ2pÕ;L®¬à,û í¯ÅZ­â¶H0q7R%m¦apEC£>½	~'t@F :;µYkfjÝ5ÌÓ£¦vaGÎ·õÄ¢ß8¼¹&G'Â¹;_æWNiÁÉbØ©c%és#l^ú¼ýÖc¯¾ ³¥û=MLeåÒºÜÄÅ18È°YËË+hv'O/¤2ríÑ{öKÕ/2)¿lèÏ=}ömu®â ôµM ¡V{qMm¡êS@xî©uñ¶+Ò¢éMR[¯WbOL+ònZ¡±WGÅß/=Mçpdom½Úa³!8!lÀR=Md±F»Á«E*yÎ 2Ý¼[b]n³Ò"¦= [ÁÁ	<qÊ=}ñ"væ#Oû[vú21°
¨!;ÝýO= =Myª+Ë±â¯Æ¨øê{\ ºCß¶ll¨hî;r _¯@Å®ÌÀ×êÆüÐ´V¼ýþ±ÍonÑáV¯ê6*s³i¸ÿíÅ'%ÈGÔkBk]µõq482/*1tUø¾Ü= Âï[Ã£ëßÐ{Æn·ÿØÝ?T$FîÞc¼	|¼Ò¼9WÐEÆY_çÇ(ÔÄ&nvñ|9=}P8Ý10ÞäÔÐéI«H87kâ;h÷qdjØÅ=}Zìç$0oÙ	>·Î<®Ýè¹|}L¸!=}¦èßÜ¢wIÑ¤P{ lÉNè'0æÂ±lk%î»ÿÕÊ4È2Dþ}qÃÍD=MFUQk(¥C/ÙßÙ8éßèóXD3ZG=M2*ÅûVÅÖ4òÉ=MUðkÐ¥+Å®)4A©=Mê()u§SV¿þ0ó81ÃN{õ¶á²5â_h¹¨±wA}4= 8QÜ\ÛÀ|ã3àE+L®Ùé5b#ýÝ»Z
UþUuZÞÒï UÍ=M!Ïþ× ºê£©Eþ,W|Þt%¼Ä¯|³8[õ;% AÏÓÂºZá}Þäþ-§83ÓWjäòÁ¦xÌòE71;·_s&3Rw¹G©ª)ãQ»¦xHÊ³õÃD÷É\	|Ä{àÊk¿ÚÐd1Í=}ÌTIîÝ#3= 1Ä%K4=M	@î¹$ÔBÕëÞ±.bÄE"Ö¡ðøÜ@3äxÉõqãÛ	SDÌ²a!Ä¶Ü|MÕ%Ì²çâ¥Á3=}óç'ö³:Àü[u ©Úq}þ{L6 ÜõþçLÐ3ÚWNl¾0a_Ä¸Ò¯ëø/#¯EÇ|;a#éÙy.ÈFûq
IyÔ§¡ÏûÊ¦Áf¥¿Wë4ô ©]ÙÃ×Ô²ú(= ëXF(5v®×
ÎoÔèXµàBBþ6ðaî´¸gÖùÐ½Þæ¢ÊxÂ 	°cg©e³p"±p £S7áîSµlÈßUSØ?4{©?zã#lÅ'êá04_Ü¢·¤9^w¶óÙ]	(ýÁÆ£V\ÁjxøbôDÈÈ2= ©éS'¯Ç´úÖ"ÌfA¤°>8q;úþoåpKbq,íîL_©®¥(zh.iVÑwmvÄL4C+4R1OÖT|q7¼Ñÿÿ= çë9×õ©1Pw#Þ/üSw¢Vyó9/ö?a§,àé;ìõKZoÇ\ GÞÃ2Ú§}ô¹2N|¬ñUÕº­Ïr)âCß$éq\mCL±Óí	éAWõAuÞ6±~%hâz÷ËUõî½¾E±oª)K%>"6_6ôPûUX±Å °âF¶ªFµÝzS
{16Q8"åóY1ùú)Ñ['¬2ß%Æ/¤JCBzóªµÊ~]ÀÝ«ì²hWÌ¿5vg:_&TVçÀlËzÕ¦uÕÏï·ðèpÁC7aeÈø½GV_;Î!ÃR °üÔRÃb'ï[1}Á¬ ÷\v¯ÚõNëe*M ûp½+ä3ÚæR{Dºäé'c'¢²3¬"­F£1gWÉ°ð*ª©Ì$5ÔùÞ,íNúF,(CW'»I; .µ¹÷[j\üíhërYHIj8íVÅ uÈCÉb)M$\P5¢VsÙ-z«å;Ç19ÜúGù¡f[\^Ñæó1ÑlyèÏ=}þ¿é¸Â8,£©LåduÑIòs
EIxh
ó9'¨ËFÔR|ª{^Ì½ô4 DÉK¦±ÕjJL=}|gHÊÌ0$Ns¬¢áÃ³_!VdÖ[{~Y®5s­Çt~I7Ã&= aNjwMû¿|Øâ|ÿñQ©óËÊp(<%}ô2vÉ î/ð¹mwuÔÕ~ºQµìKxaoËl?qYlz~d=}UfðçþN= j:E$®^_ó,¹<2¸ÂH­gîgFë5Ö ^&6ÚVwD÷/êæÏ?úáB¨:ú/Ý~I³ÏAMt¡_Z+fN¶Y"U_ö	JC4
°y¾#&ñM"ôñ¶þ
«= í®ÉÉiK©=}åÁÖ 3:íðJÈO×p'¿Æ9®ÆHhÊVÁé×|[6}%Ëò÷°~¿öÏ_çCR= ;ïQaê5ÖjÒÇ¿8íçËW\ó¾TPeJfCicò¾T½ÉÕ¾+jYpéD/yÎ/óØþf ß{'èùv~N°6ÜQ² Æ2\7=M&óó!©L¥MxNjkÚaì«£Ë®ùQ¤²!Û=}ä:~âê7¦íKÝtD¶ª"T%B*Ú¾ÊH©Ty¹×a	b+zÉiûv²ÚaìVf~ÀwC31æ= RÖJfxo_5o°ô4ð)ç±ÃùaC¡$õ*¢®îLr¤|¼Cs¤®þrüÃºújD¡e¿mþNsmu&C)¹hFF ^WoW°Q}Is±@J
.òí=MIz>"Ô¦xy-ÃÅ:wr-+S90õCd¯î+ð³ë¤%~úÊC"}P²¬þ©è­VÑåÉeg4;Ì0KdèTµpöV}- âþõ= 'Naâ°z<·jü¨º\îÚwù+ Àäþ:Ît÷AL»w³_÷ÑÉ¢áVFReÎ©R*[L_òµ.WCK'ÈÜry<£|wÓó¼¿$ÀÂñhbì#¦:¾9±¾(üv^A0C"É°÷iXÚ@<nV.kkë´_gE°æaQJÌ¦Y
+MTÝ	(Fd<QC×é1Q#®^½lrôNÈÿuv¸l¦ô²¨åºDËËÓ{"ïX%sjÁwc= Ð.ñB¸½jI@°,M¸ .oOfÑKä2/OK¹»¯6ÚÑÉ,¤¡96º¾#pRË#Þ*Ðq¸ÃBªÀ¿-vNÈ¿_BßÁXhÿÓ|ÂNtCã­C4KáI3ÎI= Û¢é âõ½LbÀ+$E^êø CN¦V'¶xâÆEØ<¬Éíjü¦»¥X¦V1 öüTÆ~W æsõE}f[C×2{]?=M~·VQ·÷ùnZ Cko_í	¶)­å .It%:µÁ¿Oe!Pºì¶N$¡¨>TÐí=}xWY*C×9«bElîíLzñ´:ÂiUl¡gÁ0¡l+ãZþQPMçîMpj"ý±BBÆ}I3µq¡(ó«Î=M7}çC[a	79Fhìëõà/x2vù,Åáca<YUå²í't¿KW!1}
Å¤1Y¶ðÞ@0ikÛè©ñk^=MdÎ´©ïË¼R¥y<&ÐýBLÕÛ¼VÎ1
=MoSm?½à|= qâ/[&4)¨H«MÌxÛÌïYe.
gîNÀ·OkÅXi·½ÝVLf±1ùÛ:*IUl79ûÖ;Ï§ùw?ìYü}ÖôÎ:÷«å"È<öèj±¿Ã3áîu©¹VÅ²UCXê"ÿ1çua"²
VÏÀ%} 6näKÈè£À?ñ©;$"ArONpöÖ}êÿ½}?ZòÎ:Cá³bÝj=MiSÅÞ=}{óô_Æ¶XQ$þ>Jt}gÀ$
¹Ã¶z=}ÚéAh%
Ö¢ Þ0;Liâô²R6ö¶óÉ_jB½â+ªË#¢AêÙÂººÍ
ÒP
ñ ^ï|uñ®ÿh|ó= R0hVHÖ{+HFÃ*þàÐh<é´-ä¦Å0±U¸áÇ!ÃåzÙ$"OYRV;9
G°áÃ¸5ExØ²èmNf«= = «ù§+3h¡CW+ñÈF½DÈO7
çË¿;ywnLA5$ÇªMb_M¬êµl:3Ë¤y6>â¢ÐùÀ¿Y¹Ñ<èºNe:TpÆ=MËF»\$Ë!vH ú !hÏ"ü
\³I nyVlI n	p
ÁaoOü(¾RI"pØ*ÏyÒËìáqâñJ2.Ã:·ÎuQAáL]{zl%xq)ùr dpÍY^#'VÉ!fpQÿç¹ øÀEtØ¬mcÊÔ²QP*N *NrZÐ¯:vrHúo¨6ÅÏ9Öbtrõk¨6Á°Kü p¶Ä"ðZ ð×ÏÈ_>,µ¦éÃRhG2ºõífÅ0°÷ä=M55ÑDU)çÉ* X´<}àîdCöíÜ6bY ¶õ:@ëK
VD ÑÆ©"@+dü	,a}$åõÎï¶÷¶0àU00ÙUÎ§MZÓFò]YàÔJ/Å
i^-÷*òi]r56ÉëIû¾Li.·Äë÷âÐyóZÃTëÖÅX= ;±ñÐ}fúâö÷ï>XðâtO¢¼QT¢«[ü®ÄÃC¡:°îÃ@ÄfÜXXo#0¼yY47KKáÉÞo^c!Í°F¹±(]]#ÿ20L½6½8·çíØ­p=}îfU\K[Âð»ðnEö};¢j&OeÂIû£rzþÚ<ô}!²sÎî6 B¸QSú§²v¶ÉqWþÂsìÏZ£V0Kjv½ï¡áVËôÂÇM#Ó¾ýäÀtÚÑÅD©¾C«±_V¯_iySS¿Ví÷¶åÇVU±Ë©*sÁO%¼Dÿ/ÎÌ©&hÙ¯Ã]´NÃý#Û¬!VÞëÝAÀ ¤lÚvì_®½¥T,Æ[	V²öbìë¸ÃÃ¡òãÃáÚ¯²ÕdQ£ÃP_ø¹-,v$_­Ëê}øU¥T'ãïÖ³!¹£ÄUC/ÃOÜ£á³Tb(=M³åVè²½H ôÃP>g
'Í~Àà}Pá®ÉDè8ùQÕñå}ª(=M#ÏÏ¬!V_¯ö¹õ°	SNk2Ý}©fmÒáÒD*(íÝr±Y<óOþö°ëV/O_yÍ}þEZíAè?ÈWqÌÓJe@ôù%|·<@(.ka@n¯vmI ¶ nI= GZI nÑ¹ké}J1 pÿ?MàòHê¥tÇ¡lC4Qæî.Õðþ>¶ß½ýKI÷¹:2ÖsDRU[¸'oO1N²9Ð1?ê´°CÑ|ty¤s²¢Êß¤FôÕ¿òAì.³ö°+Õ®îÝ5cÁè÷NExU(UãRéÓ{æ¿ïfÛØöô0¦´è<¤)½=}.L6}~½N{=}]µn;¬H¨Hô½ÈtÎÓL$­Á¦.ÅïtåÝ$Ü«ÝÙ"ßp{ä6µ½=}çPM)²j(qEÃ5k£è=}ñ8ë ³«#)áÙ¹Ó)÷z#.úwöStB-ºé,Â^¡"cGÅò-Úûæ,b@ÆA¾¨_ã±xÚkçAºæì¨Q¿¦ËÏÕf½!·¨ÑJaKAeJVÂSSKÄÄlKkKìë_
¥{kgÍ±Wµ[A×÷î¥EÁ¬,*g:µtØ2ÎÍª¢ºÍâï~= ö{vvúoËóçmÒzÞ²jZrWr/e¾pibåÆáê±Ú4"Zu±Òx*Á	8Q"²N°Ry óñÆGãÿ¬|èòísÿ³Äí¢P9n|MVesOM. ¨bØ1ÖøwÎJ¡$H= ÑÒ"q2Ñÿ;³ä¦ïk·%Ý¹LüßþÍæØòQXKº«W­ÈÕýêGë) ¦æÆî	y¤Û·ê¼nfè<TÖôªè2éë½ÎÌÐnòJ)7qò¤é]Þ['Q¥ÑS= ýÞbÁ¿qÉ«?Òc¾;ú°@xò5p¿x)-,rþ½h*¬æñ'ALÙ}8<DrÀIÇfI¸pRFi9çBC¥×HUE¦(ê^k¬·%#fªt¹1ö«þ»'Â[àÅáOÝþØ°goUÓfI0¾M*dÔ=M¾x'¡@(9Ô4²ÁÌÐÒcÅ;uÍ1ó^[)b[ ]@óJx©?},YpÑZK ¢ëÚo:j9"ÀÊc_AóJÎW#.R¸9&QRt½±61øw½*n÷) ¥6_;Ã=}'ÉÄí5á= n*gyîÙÖï8@G¢Ä Øy\¥ì¸®7YC Î-rëxxsoK«»O«òÂ^	îfzgÕàn	v)×¾Ð°gv#{ë¼±¿hþ<'ã°ë±^ÝêFàåFPó+µ51UÇà*ÄßçWqç°ûp¬mýiûÔæ"+yÏ= Ó*«òf?YËÂÒ@ì5ì=Mv½Ôã4üýMÇÀàîf>,óñ¢þí--I9Úf:,7õßÞ{ø=}×({¬Sa{"Ae£åaùú>¦~ÂY³°Z¼µÓ-5]µGáà< Ú\Ýh4Z)vÊGcì}¿
iÎnýº­d$¡ÇgÆÃèý6@¯Ù¿éÎ®0@g¹2ÃõatMxñ¥®j4= ÔnI nI nI nI no00&úÐÎjÆZôQ0ðH%íè\6>D+ºñ2#|ûÏQ²H0~ÛZÎl7\){±!A\©·Ü	öñ½êG¬þ3N3.F=M'[¸kcàl=M9LÇ¨ÇTzòç}?:|aOÝè÷¢I÷
%ûÜ%M®= ¹ð= Üùç>F×óÅ¶m'ÓE-þÎÄöÆ{ï÷Ï¶ýâ%©Ï2P°~Zî(}?!ÔÆ%-¤üAãÅ6ìpÏê»ºDå°ðÐ6Ãö]16È%,JÞPÇïhq}þ
ÍÉKÉÚ6úDÊÜÐ&6k-71Tñ{$?= ×&=MÍîäjüá6yÀËÐ= ¾HÌ,z©_bÛ¾çÀ)5E9B¯±Éöªh9zÒÊíB\¹ø
g~¤NöEFrêFâ8mr$ÆCÒ&7ù,L= 1gP[ÈD,v±{-ae{ü×ý)\_söñvE¶ P
«Üðy_Ú8±Ý?8Ø°TGäóÒyÄþY7]Ù² ÊF¢hFÅr¬½·T õ÷üVüÿØyÎt®þ2lyå}v©û-$ì±éËaZ´·6=MD¢}H+*=MÊI?¸¸Ùm'sÐQg¦ÅcTD;øSï é ¸®ZÊñßÿ?dq{²íõ,DTr·¶Í%1·Ò6Ð+sê¦m ,T{ÃMæêÒ¤Í'Ü}÷3²e($YfÊÆ;g.cLçýªØÑ³<rÆ&¬°¨£6¢e,7!ú³½
ù¯Ü!ØÊÙ7¦Ö (¬ÖåâuÍ£ûRx³1º<ªe$05RtÂÉÕrØzÌÙÆkDé}»Ð&go1Ûò½H¢M¥dX{ðuÓâÁ³<òF¶=MÐ£6²¿º3òD´ð°íz/b{¿Ý8Q ±S*·ñavEmâÊn¾Ü ZÂ{Ïæo÷QÓ"zÀé³<2DÒÜ&þìÒ°ÿùB25c©v5éÑXL?"Q!ñVW:*Ú2wë¯A9å³þ~¿ñöOÜð+êÜý®ñÔõNs=MÏ!^0{ÏYB¡!h´±¸<@ÌÚêDÀJ&glP%6âÂ^ ·ÖZ~ã<*6Æf ¾Ü XÀ{Éï$>ûE@Ëøc^ë!ÂqHÉÞÆÒ4Ðü¤ÐHcVl%7Tå{ôtñIw%enHÌã¥NæòÆÕÄz­ÀÔ}_Ö;iBË³\?ì:0|vjÒ®.Ê±ÿßÿ~ Q1ð33×®·þð¦Ò¦¶f°aZûWC«DÎÂ&h¤Ü°]"ûÊ±ÁQ{1üÈ£ÄÍ+dOÛÅ¾÷¸Í÷Aimâ}àÕ¢yTãÐª4mrº<0L$0Ü}ËEZe1iÐú¾6ö[}²ØÅ?¢ ³Åíhd º¨ÑÊ M¤º%gR{qbNW{ÝÏÚéõçýGÐPc&r°ë½ò6ÎÐì¡¤¶Ø{é|Göäq9åØ¢[ÞA¾qÎ3òÏ(-èÂ FiÏ}wÏàié®Ezîí&ØcþL7]f|ax%=MÊj3^*±­·6B5BÿÅ~ï2s¯%=MÈìÈu59ê¶¯Vw5	P<gndFüV(råfø¶V®=M¾ìpJ£¶ìl©òMºW{ÅïÁS8Júc¥PPÛýÜÐkÛt$â¸¬Ré_ód%=M«$hBÜâÎdÛ4m&$iLo/¸}zô¹)wî@?)Ê¦R=MvVYP	Hì$Çc1·%Æ6²æä<4mZºóõ¹ùPÅ^ÑÐ+ßérëQÊÏö)F§Ü±{ó06rË/4·¶·<p{]ÞDJ$Á·µñsNuoª£²ÅZ@Su{û	3tg¢4²|¶³¶m&cÏÓP21zÐGUt¶¦ÿ1Ûé'æ ¯P128Å>èryª¥)SðsàJô¾Ð³¬Ñr!«\ñ1ÈP\?k3÷(Fî¢zå:#XÝÐÅRå,¯ñ'Ï­ðÖÒzüo¬&Tf:GØJz %=M¯âÍq%x\}ò+;>VºëÕJv½&$±ºÏò)vôRI:8q\ÄÏÝ{ÿ:o)PÌ-Z;g£¬¿íD³(dô®%=Mú¥²íq
§ìÜp-Æë7ñ­ Þ¢H1!±\é~ñá*Ï½$ùpG+DQ®Z¬ñ-df;ÅSGòMÓL®+^Êÿï2¡¼ì¢¦MBÈÆØg-"oAÄzY¸%	øé5Áa»Íä£úÛ§×Ï$ÎÕé²|y®}Ó¬µ%ÖwªO£6r¦Í»E0ÞÉ#ÐhjP 7£º=}ûE°;?âr5ñ?&dzL£ÛÒ}#g0ë U¦^gp³%Ó1àð(âÅg² drºê¡+\¸Å¥å4À®Wa{f'gâËj	
_õ]÷÷Ü}¾Gù´½ ÕÜÐ*NÜ}¶w°­0þÛÙÁÀqðåTD{ðÏÔÌN°L¶WóÏ£âÑ]Ä×ÂÑ4â@¾ª¢âÙÿRLÅäÌ¶t:à~v¤!ÈÒt:æ2á¶q°zÍW|ÒaÇá$¾Þ³ÚNyÞ6ýdy¸oM®4ÆâÛú$$©ÂÙþ{RLeÉÓnd1[Ã= ûØs/ àîu´ÒÐÊÀ¡GºÒn)+<Èm)Wû-&L_à3-¦0è-bT¼àòBÇ ýí8Øfê^9Béàò@.r5|>øfê>9B9R~NÒÓ£Ø2Ô
pÇÝám±Éó´e¸«æk·¨Ø¼CîÍß·07À 	à|L[QkÁóãðz!=}Ç_}UHÄ¯âY}# ^BÄ.îÁX+ßv0È.¤A= Kz«®>vý1ájpkqfygJÐw= kè+Æ¡.CÅeæ0¹WÍÔ@P¦= û¯ÑgÄ÷í£ð®×=}U¤¼æøqeî/GÓ~NÆ
è
|Z¦yJdöµ×U«QÆ=}ÆUá{!³±@lßMòôzÑ÷!ú^ôZù¢a\Î¦|à×Ã=}l´»;Ú<âÆµÙu±6åÇ2BÕ×QiF¹åkSµeY°T½!bÜÈªÓÓû«ÃRÿü¶Õ,Ä:#À/pS9J*eIÏ´¹vÎÀj{ý4óùV ¥èá&îç90¨uË¤¨Í"¢îHËìê[¤ÕñäòiO.e]k¡uíÀF|øz¨Ú'§Q4ùýÛrö_G<øOõ=}<Ã¡ 5öä<ÿu?qÃ1¦Ì{ÕaSUU>,uBdG$)5É¬s÷XYJ?Éþ7÷Â9;4©(>»¼hÚµ= 4ø»ÐñÙZ'.j4ÀÊÛìêµª3~SÍBÆtîÎ©l³%?ýÁÌîv~å;íÂ"z´+ia3Á©×uZõ.^þlíüÑ½¶êÆPCÂ0Þü ´ý¬Â»Úü£6ú[¶Î·ØþJk©NþÔ<êÉL;ÂWcþüË[7IçÕaOmµK8#ºPý··$Rh¯ $~= óR¼Eº6v¿¦ijÔoq2 |Å¤PE¶6K>qfl§= j76OOv=MÚlf¢úúÖ ÜEs×±ñ¼.kM= -ºa½oyº¤u9fFpðÛ"óDCÊ-RéÆÒ~£nRwT.ü9¤Có®ú¨îË#'Ùqt1Bïá(ûÎ&!¬cHËþqÇ+Îö|ÇPdtkBãZ[Ähe{Âcúp2ÎëE¨ê³¹%"Ù*¢1Bä¨Í f{øw,hÐC+Ý¿øO}ð!;æå1ÖA½¡PøàÇ-n)ÄÍx´ÔÕÜ{ÔèQ= SFó´= Ëm£\Ø6k· ´¤¨1è¶¹:ük¥e@ÂÊ,4óÇ&¤zë®$Gßåò>l§,MtX«²%õ ³A<K'pvÜ°7À²5Ç
;vùÊæ´½2Ø°o¶¤ÄÆÓÅü^àF«D^ÒÂD¿	ûÏXö6E×7H.,)~°Z·âÜçªA6¾4%oX¿¼à¸p;b,÷º·dó î¶ÀZAóCaÞzFüåcvÓÀ	1§KMÁ!¡"+Òÿr°	ÏÓÀDðÏvM¬ð9Ó§ÔýÑ!úa§¯Z±WCÕ¸ir#+Tg®Gù ô<ÚÂæ¤F#õpr¨ß·Ë	ÇdÝn»Üî\yG&éæç¿bNéèwAIü¤
Ï2Uo³5©gev!%áíû©~?d2Öâ¹5ä
&fàtê¹fÇ}í¿!6é»0S¿Üj/Úäéîí­µMÊd¢«KT_Ô_¶ICÊÓ4V;,tuø§	¢Q^ø¡#øq6Np¹Ø1ûlÃpøÉâJç5î	.Ú.Ût.ÑEIt¯&ÊbZè
iô^Õ¯-ÌQõ^ +© Ø[Ëv7$Pm,Ré[Ö8}¾§¹cz¶=}VÔ"³qå8¨z+'=M/~ªñ5v·Ýñ2ÈÅHøÑY\ME(±ã=MôªUQ~dIêÕ¨Uxîº§O+ÎÚ?ulC$m´ 9r·Ë=M©°RL{qQÞì7$Te5HûqzmöÑÜÙUÁ1Ü9ü7ËÍ¶(v÷]º óþÖ§â®ûöª	±Å£¶Ý¡j±ÒöL¹Û%O@#ùÏI/ óÃ= ^ì5qb.emôØ¶ºp><;Ú]dÕéRUzÖÄ@HoÈ]Crt_ð·'#67âY,îvåG¢4fT'#åÉ²1 ÄVvb(4¥¥m!òÈ½áöQÀ+¥¬ò=M=}Åä>®âxOR¹TNf§M$hÄÛ»ûEÞì/Ãb·Ù;¾	ú³ÖÖ¢+nÕà+´h[¤¡ØÚd^ã8À3#7õÖ=}Æ¯[^KÔèL·Edíÿ	/9ÖÇZ¾Òùe°É÷ôA¬zW©AùO"ewn>Ðyøe~ÌmF25öu÷îYi^AÔä©5ÆA-(ëÏ!èæ]dCBz\®Wç!Ãù^ %p,D	¶©¾¤Á¶Øz ¬^M+ò~Xê:­ÉÿW~SÜ¥í=}®*hºz2x$¸ç.ÞfCív­K?1\-ëf)-0ZËF}ÄÞ6£¯wfÒ*1õ§O¥~D-X¬Y'Ì\§!®ï¸@·ÑKiÝ'QzßáKáØ¯>-xl=M}znN¼ñÒ?M B/ÝtaáNÂÃç?mF¹Ó+\­ä+_"·VúÑ0XUÞ°QÄá=}'uÈÄ·bwøÄåXèg@PWu»mKÅÌ]= %#	lY2T×û!Ty$¿ú¯uÒ5\»[:Móß+d0±B«·¥±t¹¥B³×'x;ÉKtA¦Ü½÷;ºvð<[bÏÿbáõ\DåI	¶¿÷½å
ÜÍOVª¹JvG.VÛèìa Qÿ	ÊPtÛ¶¼ÅÐÞwÿ|"Üá	raWâÐçjT?2O³TáÙ?D6þé²EÙ0©CòèZI ÿn­Ezÿ®æyOøba	= Lyÿn. Ib?tKÕ ´¸®@Ø ,p{Ô Mö^p¶>föYZç8~÷!AÕ"\ ÎðÜÛ	Bù$ çûcôS¾ÿCVºïVÂ¶³Õ¶»õ¶·åÛÖ×é-×	-4Ó°¿CUÎ¯óïG®µ! ¹ÇÖ½!ÖÕ1ÿW÷éçàÊ¿iÊ¶ÿ	fxÓÃ§!×ö×Å(a÷².2V;5þÕ[48= XYÿxyæUÉYXØWæë÷·&g<z)ÄÆú/O>Ø+é¤ch_JEí¬æî÷®×!ÎS¿÷îCZô¹×rRBx:àýÜp|^ß	@!Eç ñïlVÂ¶³Õ¶»õ£¥Ú	·$Õ­¬÷$Ö±Ñ12k$Ó4¢yÂ3{ªóXRQr-ò&M.é+9¥I*÷ï¼¼üu¢¬öÅÞpZGjpIe÷ê©* `});

  var UTF8Decoder = new TextDecoder("utf8");

  function UTF8ArrayToString(heap, idx, maxBytesToRead) {
   var endIdx = idx + maxBytesToRead;
   var endPtr = idx;
   while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
   return UTF8Decoder.decode(heap.subarray ? heap.subarray(idx, endPtr) : new Uint8Array(heap.slice(idx, endPtr)));
  }

  function UTF8ToString(ptr, maxBytesToRead) {
   if (!ptr) return "";
   var maxPtr = ptr + maxBytesToRead;
   for (var end = ptr; !(end >= maxPtr) && HEAPU8[end]; ) ++end;
   return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
  }

  var HEAP32, HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAP32 = new Int32Array(b);
   HEAPU8 = new Uint8Array(b);
  }

  function _INT123_compat_close() {
   err("missing function: INT123_compat_close");
   abort(-1);
  }

  function _emscripten_memcpy_big(dest, src, num) {
   HEAPU8.copyWithin(dest, src, src + num);
  }

  function abortOnCannotGrowMemory(requestedSize) {
   abort("OOM");
  }

  function _emscripten_resize_heap(requestedSize) {
   HEAPU8.length;
   requestedSize = requestedSize >>> 0;
   abortOnCannotGrowMemory();
  }

  var SYSCALLS = {
   mappings: {},
   buffers: [ null, [], [] ],
   printChar: function(stream, curr) {
    var buffer = SYSCALLS.buffers[stream];
    if (curr === 0 || curr === 10) {
     (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
     buffer.length = 0;
    } else {
     buffer.push(curr);
    }
   },
   varargs: undefined,
   get: function() {
    SYSCALLS.varargs += 4;
    var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
    return ret;
   },
   getStr: function(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
   },
   get64: function(low, high) {
    return low;
   }
  };

  function _fd_close(fd) {
   return 0;
  }

  function _fd_read(fd, iov, iovcnt, pnum) {
   var stream = SYSCALLS.getStreamFromFD(fd);
   var num = SYSCALLS.doReadv(stream, iov, iovcnt);
   HEAP32[pnum >> 2] = num;
   return 0;
  }

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {}

  function _fd_write(fd, iov, iovcnt, pnum) {
   var num = 0;
   for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAP32[iov >> 2];
    var len = HEAP32[iov + 4 >> 2];
    iov += 8;
    for (var j = 0; j < len; j++) {
     SYSCALLS.printChar(fd, HEAPU8[ptr + j]);
    }
    num += len;
   }
   HEAP32[pnum >> 2] = num;
   return 0;
  }

  var asmLibraryArg = {
   "a": _INT123_compat_close,
   "f": _emscripten_memcpy_big,
   "e": _emscripten_resize_heap,
   "d": _fd_close,
   "b": _fd_read,
   "g": _fd_seek,
   "c": _fd_write
  };

  function initRuntime(asm) {
   asm["i"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _free, _malloc, _mpeg_frame_decoder_create, _mpeg_decode_interleaved, _mpeg_frame_decoder_destroy;


  this.setModule = (data) => {
    WASMAudioDecoderCommon.setModule(EmscriptenWASM, data);
  };

  this.getModule = () =>
    WASMAudioDecoderCommon.getModule(EmscriptenWASM);

  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      var asm = instance.exports;
   _free = asm["j"];
   _malloc = asm["k"];
   _mpeg_frame_decoder_create = asm["l"];
   _mpeg_decode_interleaved = asm["m"];
   _mpeg_frame_decoder_destroy = asm["n"];
   wasmMemory = asm["h"];
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
   this._mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
   this._mpeg_decode_interleaved = _mpeg_decode_interleaved;
   this._mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
  });
  return this;
  };}

  function MPEGDecoder(options = {}) {
    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon(this)
        .instantiate()
        .then((common) => {
          this._common = common;

          this._sampleRate = 0;

          this._decodedBytes = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);

          this._decoder = this._common.wasm._mpeg_frame_decoder_create();
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
      this._common.wasm._mpeg_frame_decoder_destroy(this._decoder);
      this._common.wasm._free(this._decoder);

      this._common.free();
    };

    this._decode = (data, decodeInterval) => {
      if (!(data instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof data
        );

      this._input.buf.set(data);
      this._decodedBytes.buf[0] = 0;

      const samplesDecoded = this._common.wasm._mpeg_decode_interleaved(
        this._decoder,
        this._input.ptr,
        data.length,
        this._decodedBytes.ptr,
        decodeInterval,
        this._output.ptr,
        this._outputChannelSize,
        this._sampleRateBytes.ptr
      );

      this._sampleRate = this._sampleRateBytes.buf[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._output.buf.slice(0, samplesDecoded),
          this._output.buf.slice(
            this._outputChannelSize,
            this._outputChannelSize + samplesDecoded
          ),
        ],
        samplesDecoded,
        this._sampleRate
      );
    };

    this.decode = (data) => {
      let output = [],
        samples = 0,
        offset = 0;

      for (; offset < data.length; offset += this._decodedBytes.buf[0]) {
        const decoded = this._decode(
          data.subarray(offset, offset + this._input.len),
          48
        );

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    this.decodeFrame = (mpegFrame) => {
      return this._decode(mpegFrame, mpegFrame.length);
    };

    this.decodeFrames = (mpegFrames) => {
      let output = [],
        samples = 0,
        i = 0;

      while (i < mpegFrames.length) {
        const decoded = this.decodeFrame(mpegFrames[i++]);

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    // constructor

    // injects dependencies when running as a web worker
    this._isWebWorker = MPEGDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      MPEGDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = MPEGDecoder.EmscriptenWASM || EmscriptenWASM;
    this._module = MPEGDecoder.module;

    this._inputSize = 2 ** 18;
    this._outputChannelSize = 1152 * 512;
    this._outputChannels = 2;

    this._ready = this._init();

    return this;
  }

  class MPEGDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, "mpg123-decoder", MPEGDecoder, EmscriptenWASM);
    }

    async decode(data) {
      return this._postToDecoder("decode", data);
    }

    async decodeFrame(data) {
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  exports.MPEGDecoder = MPEGDecoder;
  exports.MPEGDecoderWebWorker = MPEGDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
