(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, NodeWorker) { 'use strict';

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
      const ptr = this._wasm["_malloc"](TypedArray.BYTES_PER_ELEMENT * len);
      if (setPointer) this._pointers.add(ptr);

      return {
        ptr: ptr,
        len: len,
        buf: new TypedArray(this._wasm.HEAP, ptr, len),
      };
    };

    this.free = () => {
      this._pointers.forEach((ptr) => {
        this._wasm["_free"](ptr);
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
      outputSamples
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0089ÅÖÎëÚ5s§(w´ý w= ¨¨ Âi§å'Û_}@à	H30ª§D«Ïa]M? ð2vN*¾Ií6ÆÄf5:ê\ìö® ÃI¤hÂ_'í.5F¿F1¾ýhO5CÖ û@_lå}é6Äé²ußÑ5F»tþ9ÃÆ
xQÕ=}U!!%MMgÜá¥")oòb®SÌÅÕRIÑ\+-Ùó#¬^¬SïîÝÓêé³¼Ëaj£xÏÂÝÚ´6³×%Ýüà7MÂ:­ÂøÜS}åO :M®åOàyåNû¨Qþ¼AÊeïÿ÷þvc,PØ'oOo_kfjñ=}Å%"âBDuÞf=}êU 8ø¨á|q?ív/´R÷²G
bzsHE$ü¼^¨W	ðPPU[¬ðÏ>uzÇïE
¼qPÕRìïoîïïHxtb$Åÿ÷ààààÞ = 6÷ð>Hv_}h¢lù3ïJµG¶§ù:üxð½=}3UÄÊÈÔKË5¸Ó]çþ½AÛ M&Ã³sï¨ ¨LÝÞk¨Xc2]î'ÂüB1cðü{Þ¹.ä/-!Û×U¢17ôûyÎåf÷W]IÊl©^E<Es·hÙiqû/æóÓ} A8#²5Págä3$¤ñ´T0A´¹T}Ò_¢¶?*·aB@^è5¤»ýþprXkÉ!q?ºZæNjÛ@(ww<:+:Ä+Î¢.Iø%¿â/vs=Meû6VÀH£6"¾:6ô_NC^_2Zè.!üç]@íFQ.ZcBçumºÊX^t$$Â]éD]/Ç«oÅüUØ÷s$B¾ìîÜ´*Ç½þF®"ufcmR$ªÐNýfé®k?±¹ä!ØÜi¯¶½Õ#âÆá-ª:õ¬8JÑºfÛ@ç/°mÖ¾ïÛÖ#·ãsKÙËUÿþ ÙÎ¾%Z:ß:fñxÈc´n(4¿¯|ªôg°ââBü,áQS"×wTå;×Òn¼Ð0:YÂ§ø±qãqÏ¾Ì33ÌÞ^1Ó»2ÿLÒdjé¡¯)KÁßë¡:¡JKÇ>Â4J~K÷:¡0Ö{t+Ð-wþ*Ë_¦ëMAG Ã "HO®yû[oÊ O>!'u	¯b:=}ÎÂÅùK¼MÐ¾sÁí Ïþ^A>Êa÷s$rÔDOëô»^÷¬ñ
¶Äk*©UÓæûQD·ß:ÔIe·BmÏ 'JzÏyYabªD\0ðÍXÿÙ?ÿ\ ¼¬ éíÏ·ÓÕåÊûw¼)&UOÉÓû
Tæz½ØæÇsKèù,!Û´²ä£ðß= Å ~Kôr¾º)Ì¦¬&K¯X¡¬¢hc$*nËÊ8FrÊËfqÓÁL¤Óh»ßtÜQÜ],cªTRÿ1¬þüy,Õ¶HÕ³¥©NQCã/'øônDKÐÇ¡IL³ú9Ym3K92J.Õ¯bÏts>ç<?¸ëês<ÍØ-<ÚßZf)Né 0DN½ÕN ÂSN¾ÜÎUmFX³½\iâòBgHÓtÓÈH§¶ÑNï·ÛÎI~RpxZJuÞË,PÏ¢¾û8ºçJ^nÂÿI8·ºvÂWà_wMwo 'Ë³ tnûOwOZ= Ïð9ô(tTPóì×6Lß(:ÕáÚù¾´ÍÜì:ì´#~×ô¼»µcIâÉçõ¤SZÔª#¯P¿Ô!þ²¿î "ÜÊqî½ÏXËYe¦@ ,õM»åçªs´àCÄ¹Reb²h.cZ4÷ËÞú.ù]ùÝì}eµpH¬Ö¨õrwÍ]tæÄßøy= ÊP-3÷q= ÔStøÈMágø5ùWg¸óK:nÂÎ9)Ê¶=}À_Û7xc
=}éËùô+ª¯?<è»¶÷6Yªì»Ç&~Må¯ÍßÎ¾ïB	AsÐÉ3+v2*å ¡»7Ð4F7Ý-p­lß¡ÅÌ{[ãG\¡7Ï¾â9±mL¾rüdÁ0;O	Â_HÄ üZråUO1k¶ú2Ó~Ùâ¸3/°PsJy]õÅ²O´@$°¡ëEóÚ>J¾3+ÜerêerATQiEpz¶©h/ÁmÅÛÁû¯Ôæ[tá_mjìèÀçFli3Þ-.{Lj+k.Ë:+SþË?NlË¤t!ÜeÛÌ8ðK£8K§õ±µd¥ñqzë³ý.Ì²«Ë§º:ºùß|ô±D2êóÔÞAºh¯Ghï¥ó*ÄR!OOÿOÍÎç%0²¬ÉX¿	¡úßj@@òZµ¤°ÌNöÚñ9ZshÃOµðª;ÀMíßuù/½ |çBÎûòdÅ«ñFA.³¶: úEqÍ ÿ¢m½·¦0ÕøÐä)%M,åfàíôNø¯lÄÑÐÇÖëÚü¢ÝÚfÓê2ù®ÂI*Ní0R\M;NPP6Ö)¿_ Õ5¿L¡³ÏU·E|ÉE1Òe¢à¦4é>zÀªÁR«ÙoA}ýcrc$1kO¡^È ªé¾^ªÏ¶å0þegF¹cÝPÜ%¯d¦ Þè¶£"eÚä°Ý:Ú JO/Ã:ôº¬Ð=M¤!¥Ùµoì	+BÂ	¥Í¤R
4¬9cêíKuµ¿OAC¶''Â¢ùk×»¨hÁ¢eBäÃÊÉ½uzÑ±c_(?¼î¦TÑg( ¥ªÄK¨aºq¬æâí!+Ic£2þÉ¯Æ=M
kYp´çh{ÚðWÆ<qÂCXÕ1®^Ú/1 9äeZ=MxA,uÎ¹!©%k¬(aQ= AVe \ÈDÇç}ìÉÁU#P¿jÍSpZå¾+Â	 ÆúÐBì®ñWZe[>rZ<OcÝìæîx9uìC wU<Á5Ú¿>ñPñF¬A8ÑxhÏ³SHô¼y6àT¨Êbsë¯B·ø91¢ÎÞ_ÛÇ¢XñeÂöHX¡l¯/+Câçßq ±ÿbÉ_§òY9"mô¹u­LÉ9#f­hÈÎG³ztÿÂ9SIÔEtnràóè¦ëfÔufÁ÷+;æ#öb4.OÊî¶3(Â%ÖV']m22üblòO]u!C-÷Æ¥.s^¤6\a_E¦>ÿ;ùúÄðÜ0/£Õ±Ër]úIìI¨\/ÔÙY¡§~ÌgaJ \{D8ñ&øL= ÝFiu"Méi0È>8W ''ñÆØZ[v@]"¼Èxø^1¡ÜØ$$ÿ*³FðÝ=}çF?d¨&q±!eà¶Gt¾6x±5ÆS"@ÅwÁËlò0ö¨Ç(ûý+5!Åé#zºÃ!ìQFP=MS×-Y¯o£
x%LÊ Ã÷#éÁ6
¹AE°Ðù¡¿ía>-¬ë­1ý^¾Ïß3P|®|I¬>2âÍ-·pä-íWÑ+'¾ð'1pV"p®sÎüoÎCWå&1tpU~CêWe1 V" Ï¿pSY¬bÖå ùÔÌØÂ  ÖI¹à§ðrÕõ¤&iæ°¬N ¹Ú¯G-µg@vßÏgáaA­ÕP<êÏsø¼VÒÚH£õ¢x±úû,Uû.×Vê?ì%+Ï!ÓG´ÏÊ FüNÊ5K*x0¡Ûðwèºþ÷ÍµMÄQ/A¼7øCé¹ÚXÙi,|ð{&iDkñmøçH©	VÈ&æ&YUü¬ë1¨II;A7hæp¹ÉO¡¼ò»æ<ðãh°3@)$}ØA >ÿ¾Þcá¸?ÌsÓå§Ä*Ïà8S¡/(¿ÃLÏÍã9 CËÍ²ÆÂkHÜïµ¸ä´¥£@Ç7'¸t[]WÐ¿^ð<µ®ÒRRûÚ]xþ¼º)vìè
%Û_¨*#2¢³n¾µÂ¢È¶¥$RS|Ö¨ÊâA­ÞÀO×_ýºïOµ&áþ[Àp= ,ÒUõå9&0½eTZPMK¤zd#õÚ<$AëôîáoóMó!rç\±wwo&ö>7²@{[Á[µÈ¾ÌvZÈxZ£o³7:1tÜ^ÿe·9zú5âë«d¤6t= WÇmXñvº²¢$ÆÎh<µóîÈjèÍ= |tèÍqsÿ¥{ÎI¿Û½ëbïE@óÚö= HCæ-µøÀ¦|}çþÂÌFÈÒFUÈbyÔæÝFÝµÃ£?è®!ý9çéxºø¹EËë 	H£;÷F¹d8Nq£Ìå[äxÖ1èàN-ÝÖs/ª²±Åözæ4{&V®Uê¬LÝÇ¨·¢Öì1ª¨»@¹§ä¹áTòÈo¬*WfL=}0Jßb+ëé ¡6µÿµá º)ë@CeY.z±µì.ã?A¿¶î sæ±ÞK\.ávÞ|:'Þ¬8ßóèù-¥û¸YM1[(ÖÙIyêNuÈz,hL° ùLJu~ÀfÀ|À-Ñí»fÀd8Qs<= 7.0 [g<H}N´ih
 ël|Güz¸1GV(ÂlÏkº^²<¬°p¤¥ô$Ék¿okIÞ°iãaöÙ^×É^[Yø.	äªg²<eÿå¯@¿¢;%:¾@ß?U1õ(
ÂR-»iÜÒM¸êåc/  lÔífOïñûßbâ¦Ia¨Ò¦°x*c³·Ásmó¿°Ã$Oq7v@^µ9¡DÚº?lëµÿåâ ³ªRË5ZÆº·^âÆ·5µI!îgâyI»îdN;3XIaß5P?Î[_1I·­F½¾Úü,ccçKP?O/¾¢Ãâ,¬ü+Á$vNb9ûw×4}aÿ+©Ð®¸§9¾Då3Ì)9rFìTíFO·|ú¦l ñbè2[f$b]][7oã"ÄïRÞäIe£Ht§	pÓ%¸TØ2;èËþ\ÀÞKi0Gxgîç¯³µZð¦}Òxãî¬Vg¦\cD¹g&5ìolUp´¼¼<ÜÓ'UU½¼îïo¿îæïïï÷èVa24Ök^qo5îÖ¦Òî¢dëæA ¸Ñh¯Î]§ÂÀc·=M¿GLÒõ(Ëµk&ÐëºóÕ/=MGÂOw¹õzEHµÛ!¨åKv; ¹iJÆ^®Hy'pÜ~ØP5C$+1N ÷AÇâ[;$.OÔå18ðJt ··/øRk&àÑ¶ót«WoêL.åV½p3å¼%m³q·÷aO2jÓ7ÿýÀÎ5lUùÂà$ÓeºT<ûÎ&mÚ,ESysåÖû9Æ¶§ z=MjRå>#y£Î'»Å&4Í1Æì&OÜ^¹sBÃõÏp,Ó¾ó¡7J'4<ÑÔ5r
:åv|ÉÏ¶Lk4ö£½Ô,ÜéBã©.Þ½w
2åVé_¡÷T^±	¯ÌVÞ/8ÿÎÒöD~>Xê9×Ç_tèJ|¹a1¥$}ZxÊÔH¿ï~ò¼²£*ÿ'(´k³£+Ò,xGÅwÛ;cíKzßLdñ>GÄÕT¥8/»Ö¤[iÊ@Ñ5îc ¡LÄXqøÔñ2ÐómDíöUyÁYC®axÆ±Â1°1[Á0¹3ã¢Je¿byç³õÚX ÛÜÎç·7b¢ëT¼¼BCÃzÁyá^àê]kÚ³Z*ÒtQ{±îÙbY½}¢TÕ$®êÈ§ø&£ÛaS¤Rê1FØNù¯êçumiÞmðË"~âÉ¹Þµà'~2ÝEWI©ÅßLUÞ=}NÛ"Ö£P®T=}ßä#Î÷\ÉT\Å$ñ%ÿì&ÛIþT²ÖI8ÓÖÞìâíïA®%¥%E{Ý±ª­kðFM¯îø	¼¹.Ç:6ÓÔ=}æÓ°QÏ­Û0f_ù&/,sÉiôàÈy*Z
I,ÇÑR¤iKì¢ïj M¡§+ÝOx9byAæÏòn:Ùã
.ÒaÚî
ä'3qùj:Ãï¾¶Z3Ü^+I¯ÕCÃâD= §®âiU<ª°n§ôéo­ÖhÃBë¹è¸Uð"¨®RükâÀI¢¡=MP#!ÂÌ,ôNrÈUÀ|å(
ÙèCÁIå}µú¹U¼=MPã!Bÿh£cÌv
%ø ooËÊ½I¥ÔIjK.,/bVÂ' Â N1Þ¬[ýfüpB/7SàÞ7y¦ÿ>i¸ünJUÜ Bm(ÝíÖ£jE¨×Îø5Å±½Y±¿VÝæ£d7Ðãê¥Hß	}ß
r¹	sj¡$pâæQÛÔ
 oÝýE¹x$mòä
5ÀX8.ù-ëÈ¸j¾»2AjS{A^Õhg= ²¦(qÙ¨
}ÔR«pðò°Ú²ECÏQmdcÒx4lb²m-:4í´y¯±ïEkßÌß{%°>±Î3Û^û=MÉáF¦3[zFQÓZÙN³gjÝD#3´K:½I0tøzBceøx@iKcÜXþföQ:£³~Èfx¸wóÁsEþÈÈi-/1é±nÒ= T$h7ú_þW|ØÂL®ë|X¬âè]¥Úëö¡¨i2¡ÜE¨4¢·óè\:?a·IÃú
R#4ÑVýdÓÐFþhgÄr8ë}.¨Ú*Ú+lg£Îaô»Â½[9Ü-¼o©wSVgÒ×V*ÿÏ2Ý@· VãQÜ eIEBÂ¬8=}±þ|od;3+:.7BßþØûà­ßOî&¸ºd#ì2ÎhWHMB7|1ÆXÐ:Ã.= e¯«7|
 ÖMzìÜp¢¹t6¦Òé[òÌôj
±¹ù[ ë/~-0L¡¼fÄR¸ÅX
lÜôÊð¦½ôOéÑa±<ã3â$?+¥ó««±ìÐ:!¬­¢O®L¨ÐÁaÚ¥íÐ\ãÁ<ÃðHÂhô±ÏÃØÏ«´/¹8ª!n,q½ L­± T2°WÆ *5­ïF|X{!«)~È,Då*µN>mEû nËÜ%Hnn}ÝÛ#ù+è×Á+×ã²25ßn­vÓöåÚ Ô2±we{]Ðª¾d"eéh= v!©MavÅy¬DC×l0h(J7X6ÂM\[¨zD%¾¥DùRÃö[= µ¹ªúOã"'ás;¸âj
;ómsaîÞ×jThø\ß{Ç¼ñ{¤r¢OëÏW·h¼ÉÚùDwSóc×O¤8y¤rO¹Lq¼ðö-ÈW7]>41ê¼xôqà"}WÓ þüjl9u¤r~]@HmdcrL:··§txNæB^Ö>´ñ×­*¶0_Ò§ÓLHm¦áCæ¼»å$¼owØIuÁ7ÙE4C÷xÕ¹¡5÷ÊKÒa+Ò/½Í	i+&= Ègle
 I©;!RÕÇVÎÔ)³¿§ÇÎ/±ªäqM;ãQMYëäïíqNÿGhx%sG¸¹i©pÿ60×&Ã>'ü3ùW.Púnú-²O)J!ïEÌg®½¼Ño©3WG+¾ SÂyREúSÔÈª·Lry´¢cÐ÷Û	£Eí>Ù¨M¢Sqm.&Õ´5R	Úc[¹vâºü4êIêKì/òÜÍ$Y#K÷Á-ÖÎa,ØÔïÿé-§l3»O[×Èîù¯Õfû³¦ªÐÑsì÷:¾¦M8ÕÐý'ËRçãÑõµSlñI¯[unàqÏ½[-³t¥S¢Zhéÿ7©AÝO>zK«;Ý>[©D­V ür¬Ç4ÇmÉú(CÈ%±¡ú¬Yüy£äkï&7?ÚgÞ?V¦¬kTØòzQnQ× =Mã;,ÚÝÅ9Hîj}x§"FtòûO1ÌÙ¦IùÛÃ]!¥!âÛïÒf®WN´¸$èqÕêÞqÉÀ? fø7>ÔþwLVÄq3<DZ¨~¥¤Â^êc;FD¹Ókû_$?n­lS[hJOjßìùÑP^&æ³hãmíÙï¸Îý= Í²¥kÔÝøÕ$°Ë¡]<ÛÁÜN\õoÊÅ*BË=M#âë+@Ë¨G läÇí½-ÏkÎjQpsè'Oø%sx)ÈMf0ú´úrlÑ¨¢µÚ¾³Åb©À¬åÈGÐ+7ÊûïOðË<Èzè«ÒWÒXmi³6\{¼­æX¡ÊÓÎW§% »§XZðáÛÿ6=}Ò^ò<²Sn¬3äÙ¶cvÝºW^cûnYúM¼þÕÂ= Ú£­SL{jhÉ¸²cÔ×ÍY Ç¨8»Ðô,8¡ù°Ê^á+«oiüTÅÌk"=}¢NåXÏË×ÈÏª´*9å|ÜpèÑ=MÛ}UFX)eUÕýf¡¿Ûjß!*&I/Et.=M¿·Z{ÚbCOÇOfÉ.g}Ñæ%WÄ(¿êÅ+"ô_¹uG¸(4Ï©YÑ×/;í³Êib0½³J°¤Ùf£E¦¹Gæ@
zÊ+L".É¬õ@u1ÖÐTK0B¼ÑÈÀîð õd´ÒJU!aÔjýGaùl$'V(eG9F[Bwn´t= à{~1gH'ª8/¥iaÅÈ{L¤qbôÇõn.úm= H<4È)tÒýÞ~×Wá,Ü¬:¬¨¬-ëÂHVµå¶Ú¦hP!Ùl×kÑ¸üÈâMe{ûàÞÕÈ: ±Y'%¤ SBdÅÜÝi£gÛ¹£¨¡ÔZQåÕòpªJ¾Ú×a>[ñÊ¶<IÔoCÁl¦¾-Æác+I¸µ¶ÃÿêÂÏë ,ó<Õ&¦@¤îPÇ>9[{³Q\|¾n¿/
QÎÁ°wùwÐò#$¨p×ïs+
Ó³uÒé}~ÁUT¤OäöL¸~Öñ<}Î&yìPßWÛ>6Yÿ·©Ìÿ¡^¼®÷?*áèìùë:0È
»¯1ÚÏgÌwg¨Q= tr)þâTâ>BâHKJíª·ÛÈdX|ùYCJù	k#ÄQýf
2{º ¿QòkI;Ù$0¾0?Á= ÙSÑÀXÕstm%$´ød®æÒ×gâ®VæpjâÔ­À×«í"ÎÃwÔßxãS%öS©L¶ë5¿³ökFþÔ8½5¥)ã^T8F-·T~þdÚãÐÌeÔncmªw§p¿"écãVYOÓ:ñÈ[ÂhBµe¯}·þ¢=}(=}Ë!¢k
EeÂídKò \Ý¦õ°¤òÝ$W@Ò$¡^FÑÃ¹Ã~9bîZôa±A¨uæÑ¨eLÉ°Lßó7%Ìp¬tßÆ+úà¾jæ49¨5D_Bb'æíÝáIÂî-Ö5Må­¦>´d	#PÃÍNËä=MC%Þy¡jÝZHÚºÉù­o¶OÁñ4ß±ØGhÑÄá=}4Þ@
xEûI_VÀDu!²ô:<®ÖGG
VÛ#¿S«»î3¡®ô¤ãåì¿hthqý'¹Uµu9'Ð7G+¯Ñ0UÎVªÈÌ¡Já¿õ.{÷¨²Ó}«v7æQHO-zïÙ@u"lsBý"Òè¿¾çºìR1E±(¬æBÐ®Í×öùòÃnV÷JZ1òõ-a¾N&°ó±]²SXõ±OÕeö¡ÚæÚ´¼÷.ïÝóï@N«MzaÍÑÓ]ýL ìO%!©ãKÜ°v1ýR.ÿÝ¯at!cçW2ªë^çP_Ã¯atIúð5îu"ÃóÐî³Ä³ë)ÿÝõ0£Ñ´¥&V3½3z8ëZbk;á%ëùºÓuPÓF32¿×Q!®üûl$ýËd»ø,Rµ¥]@eÐÝ=}+(óP5]=}­]¥Ã²ÒÏ*ÑÒÕ¤0´©¿ÅJlÉù wÏ ©Aäi7«Aäi@Óy=M@J
eäî~á¼ÒyÍ§]±v#åÌH÷+&Ëa-mÑéUÑð[°3¼jæ\a®$ÛîÎ½«¦Ý·óòkTÁõé(/gD½= µLËô=}ÞEÄ&%EUAGQ"!Ë	/IÒ@£,ïö»iÞ¥¨FÐuùdr½¥CîDpÜKµp3¯ídõ¬æÎTdî¤\}kmdOïÆb¹©ÖH¤:.êVÚ ^ä­/ì§Y¦\2MYl]l¹¹zôr@<¤l2u#[D0©zH	:i²â%¸\,%Wä%Ãzöüv©òBAø´UÆ)Ä= }Åà@B= @røL²Ez(î¢Uñ²Ûî=}.ø,H/»6Â ¿ûªyáµRo&ñ(làÔôøï·í?<¯Õ·ÎÌ?ìÝv"A´MÒßÊ5Îs?Wè¦Rõ Ó&	Úñ6k=}rblöy[©)×ûK¡VÅ÷i²C«qïíßÎx¶ôíº	2<y ¢»P ¸¡]ìY¯ÎcÝúËKÿðîFß_SÒ@u9ûÎOq±t³]ò1ìÛ¬ßIò¯qÔß³~ÆÖY¨>Ý/nïÛ÷Ñ!Ñv=}ÓU#&WÌP
kºä2øª^WÑ"¶=}_Ë´3±­ß[P!Æa¿oJôQD×³<I2[ÏSVYpÙÞR>Ààg6kFC{gXß:Nñ©SýCÛ¶Ð&Ä|ÍäÅëru[|óóòÝ1ß~¼£ñ]¿Í®Þ]§û£^Ê4+Ë,ëãÉÝåÎÏâ#Ì6+Ï¢CÚ/CÚ+ÿñ,{ ð½ñ¨²Æ$"@BÆ	^1âáÎ¦Qñ]^M<C¶ÝÊ,5æ>ÀÝå,?¯Þ]ûò]¯Û;ÃÕJõ6¾¹fùGRw
røÃ=M¾º¯{8£Æå{¿JkÞLÈ5Dî k¶·JúÑÞÿ)ÒhaÇn^ÉàGP@ËãO	²rÉºnÒyÿ¡×Ö±Åî»ïjsro(´3ÔyÕ­4	{^õ«&dÃHRìfÐvêÊµRE³;è?+¦Êµkä:
óöë9î½C1ièÎö¯ªxXú¤$Ì@ãqNzò7ïsÖ§Cå1#¤ÒÆ?6?JØIU$ÖyØÜybvMLªORF6w?)vC°%)­¡³ôþLñZÒR|ñ¼kì	Býèrw¦@VDMýGûweÜSÏð= 4pWç'$±X'â'¦´8ëB4«y= ü-.?+Ä.=}Im!ØöÕH÷I+e}À= Cb¾YnÂ~/¡iAyþýül®ÓòE)ÌÖ×á¾"}
¬õ=}ýØ°å0J¥!ÙcßÒúã^Nå5Ã}þ²F©[;_M[x<vK¬÷2Ëa{©ºÑ j:wýêx$Ó^Qç@û®%ze&Ø.ÜX¤¬	¶.dËºWX-@åK·
9}.	n¥ò*À]Ø4JÿË¦áóÙ¯d#/ÐÖ_¶1AÏ;³aª.BºË.m¤ÙßÖ¬b´¶óUKÏòT»Ð]KÁÈWüÈa/¢"ÿR©ß­¡k=M¬!´ekY|µ>ÇqÌe	ØYo>ÏMë£Ð¯ß!d=M©Z1B×ÛbAVé<æbB­@iU<Òr©ÚqF{%T¦B*^"ªSjGÔÒMÐ~]UC×B¯ãæqÇ¢y!¿²Ú'#"úÉÎeíßÔñnwS	³eº3N,©äÍ6].ð¸µGã¯I=UGÙîxhÚÊÛW/ZÌZê!ANÃPûðø¼Yê½b¬Lã±T2?ÄÚ?0Å±@²:æ×M7" ÚÉj¡NT%xÉ Ðw¨¢«ßDC'Ák¾©û&ÌÅ2SWndXì¶½ÒªÖ=MZI©¯Ø6ÊI«_ÒîÒA»eàÅ%ëò°ë£«~;§iÁ= ñ{×ê·éël±zñRaððÕú>ÊzsÈ÷U#PÖá|Ù®kUÑ,ÇóáaéZÃ©&jVÇÛ¨Jª8ZÚ¬ã0E,_¢õzIñ7¹S¼ºä}YP¡ïÈ- s@'»suvì»Ê¨v§^Z
¯¤³Q/¬DÚH&Tn jg°(q¶]= *W°¬zîÈHt[}àë¤aÍ[ÎÖY|µÝµÄó.¬Cìí=MQ7+sù­VÆ±í^ºïà&6ùýElò|F£}ÇQÄftrï¸gøïÕ=}ÚI»HÃÙbÉD(¿é®Ü¢í@w§]s³:y*ªéýXKÒt&}Õ» x½Òæ4wD²=MBÚôËÉã'f7ãNßûå	Yï73Ò1jtÝppl(],£pVLøM^²ûÐ2X"«Óä/¥¾ný»ÓLíÃ÷TÜ£5 ;¦Cëùw lÚá|êó¸=}×H&ã8å\mv) ÑLº¬öà²GªWÓ%7}Ý(7Û¯iØGlÞÜÞ9E¢cT§$±áçis=}y¶¯Vwù¨,:îÆZ°°)èn¨I{Y¦äZ!HÀòU{^¬¯zºÍ¬gwiQKZ½vÿdTgVr Í>~òl F¾:£ Èw î#1Ksþ»¶^,ÝÉàçð¸3¡ºÍíh¤à
ûàû3ÇÑÐM¦0^^¼PAý[s¸¾(ÀQZ	!äDYí+êQ.m)lÁu¥g=}µsº©Ï³ÊË_öL^;Onät¸~(ÀLº?nU4b=}×Ì´6<§13´«:¦ÑPÖcÐlÝD]¿MV^-XÞ¬= G$>Ü¹T ò/ ¥ifBÄ Oe=M5IL?EÜZø8ÀÌ=MéÑ6 È	µoÚê×äÿ¤±19e=}ñTg4ÝtoUF¬ÿ÷ÄupähRØc¨Æñç0 »UX #_â®ª\ÒÏâÅÄã|°B÷( ¾ÊlÉÅØ­ïÏò×u¸°xü¹[JÞQôÜ6Qátë°ÄL¤A -lDÕùEUeÎ(atcíÍ177Ú7þL0CNVQ¶÷ö3AZ6	ûRÓ~eÎ= @"DG,;F¢§}ºh*,ÎãÍ¯L8@ËÊË1M%²³ª!©³:ÊÝëôÚ% ÍÎ®Ò¶³:1MËÝKáTaÞÍ®6úÚÂÜÝÛf½X=}ÝÝKSÓ³ë··æýQàÛü\5BË«ÀQàk/®møÜ;-ãÝÒ3äÈd±x8ËBá² 8×Bá² 8ÏÂà+%ìÎ&pÎ»ãpõÙø;ý4ÜHk_·òíýd@¿[
j¡åBï6}pC ¶þaL^²¢âaT½®ÿ<pm¸Y±÷¾½-nKSÇªuÎCÍÏ öFî0ÌÝMræZbK³OEêÒ 5÷ÚÞ/®Q+ëÀÃ1/ÿÕvYßî±!g$Þ÷5´7¶Ä,xF¡¤ßÂT×u*ý}±À¸Qè­LPmCæ\@3Ê=}.eÕüJ3VuÜ°º<tuHÆî	ÎïWç©ýÒËÂ®EñûÐ³dûwJ»RíhDSù= HB°ZÙeVÖY5ý	áø9þÜ&E]
B¹µlbæVõ@qp	3Eñ8ÕÉÜç¨´ßK«¦?l0°A­üçÚÏÛç¹ø´ÂâØ°¡=M$­öm	è H7iÐ5ã!uÃ¡íq<= TÚÉ³ûë?²Ó¥SÖÊ¹¢Y6z ÷kÍ+3ã»ìãe%ê&vv§­3Æ"Ö'["6VõÜWaÁ2û>Ý³ò½þfOÉºK^O·5¿ÀäWè|:m/)+ä=d{¢ºn¼>²(ÜGôu(cZîzTøÍlpqâ»o½Q¬GjåÌ±ñxàvI÷ÏbvHTÔ»*#ã=}Ú}óû\³nÎ*ë$ñ2^¯yKH£46òÁTbEq$kbæZ.jÖà÷vî4/çðcP.\5×èÄf a×¦ÀÄ\§³gÿT?±}¤Sy~fa³l37å ßb!EÛ?#'¥ÐÖOá½oö{Ý(ãuÔu¬uTy~¤!}½^eQ|î0Ïû÷^Q( -²À=M
Úôt¦R8r¢ù4ôü·ø.^Iì%íIÅ"¥Áe¿Ð³nosü%ÁÞS ¡ù¾øË¡,:ÎõÓáMééÆ#ö¬®ãüÉªcs¶CñÙ7¥]CèÁudñlù§,¹µ¿Q¤,I]ÜÀçau«=}b¦UìévPÿ(¬ã®î[ûl¥ÑãTñéA½Ý<üÄO½ï¡®æ! þ-h+M()h¶é}Ûs, HärÎÿý7Ã®¥M©0Ä%èÞèÏºÑ)2®§<]8|W¾}^§h´jàæ¤È¿ö &ø[BÒ?P¿¹w8t;bÕr"sm1kb¶ðE24ñ= ÊÖ(¤#Ø3*7Tú&;«(Ü-ÓÚ:|ö^»ó^ý|5Øo°PEÂ5³ëóÜ¯u5Ð)Jë×ráu¨ÝúúPZ÷,²°«Õ¼®<£Öý3k)	KÄÐòúO£ú»Ê~ø¡ï fY]*ÛÆåóÛÃ]T=MýBòª³ùWk({þ@WÈ«¾2¸¸pËÅì/äQ÷§Âý¶Üh^¬óK^GÚ~ßTi9ÝÊ¨sÝ.ìÎR(ª§ªaÒ¡å
·öqê}BzÏÏ´~õ}Ëd£N>d¿m|%cBÇÜ\T«ÍÍi?HT©ÁÃöÂó XyÛütVî-|= øe8äºâòýÎ¯i-:Ô\!êï±±!*?ÃpÅZÐÔÜÉ\[_§¥$ÍgÐ= ¥å×åôisq#,ømGDWQ	Ë º62÷|:]Þ¡¦ÊSj~ÃØå¼%èU§HâåØÿ®G|½§9N}ïÀf?:í´¯. ûÝ T8øÜ÷æ5 «ö6æ¤e'æµd&Ú?ç?o:÷8k9¾Xa#Pa#ô¯¯¯îÓ,ãÂJYWkLÓ¨löÌ{´ÀeÀq Äú¤)üÂ#ÁGÆ»©l"	K\«Núçøa~ô-kZ
À½#pI(h¾q\]èB\@!*¼åUþøð8©@Æä÷Oá0ñNå^öyÚarþtEH!¤ýÀ= (´E!yNsF¡:NKäò2è]I¼¯®÷°L9OÚ3@ °Äë57d{JÇó6Øg$Mo\¾mÕÅØéþ%³Ù<TÎÜ= D§ü7úØd¸ì¸ûÒXñËð®[ÛÂªz»y#{Z÷y±ëÐ[ l'4M.­<JP[ªÔçX4©±8Kú3íe­g« :*@«õíPxpLÑ¶=}ãêx%z$bôqäéôÚqAáQ_änCKK÷öi&Ñ»bûØûñ"úDEs5w0Y´ÖöSiÜðÒzNw[=}³õéÜ ã@-
{To§Wô. y@wh lÄI»= i8Hþyè
xãÖJF ,	r= ø_~/[{¨s«ÈÊæÜ®ApW(yÌígÁ¯¶ Ó¬Ð.i(üPQj5Ý}¬gDþA¬!ñ@¬éÐÍp°!Ò&$ý"ºZ­DAÁQòûia£ô×µè¢ê
zÖ9¹²µMÏXcÄC5ÁÍ³¥uÁ¿%¤¬ô^£?Ú-ÎcÏôé¨áÖ·¶0!¡{]VQÑpOâÐ-l¯:mñyþGÆAÌ÷X ýnwÊUº-ÚO4ÅËÓ°SÒü)¶d­Ï;pTðã·ûÖ2¡»Gù¢ ë@{³Ã&ÙjNTjmU£Gbñ:õJ¬ÞlÐÚG»Àjÿóiá?hèÏ{Z+ ²¼7?@uõÀÙâ<Ê
¶ÛªõøMvÙ_e;òÁîº=}^¸M§he'þê×k>#Ga³ Ú}ö: ´¡L²CÄBêñéú;ÖâHn§ãÕÌK¬NÙëì³Ù8ßÊ¢7êyNI&\v*fÁB ¯Q&q÷Þa0F
Ø§.DW¿Bt3*¬²­½É[P;þµ| ||5Íè=}¹Áå)ÝüêðxÑê°ÁR×Íç!yi>LêÜeRªÐ]Y+5_w/ÃF³ÛÈ,Ñ«>i¸|ä]×ÅÙþAIyuÀ·Ç{RGëm)ã#÷A¶<6¡*yW.Ot¥[¡T¯½fOd¼Ü¹ïb)ñonp=}¦Â¶¡¤:Y¡NÏ¦º^|ØµîÜó½V;xUÍÂ-ç´:xXLÌçÂ@9Döª¡OIì¶LneíJk.4x}ñ'[ÍgY·^XBÐKtpîëSsOÌiw|T-º0µ_éÚcÑm|aC:S;
50ö©c²´\[ßFo;u~nÈö\Ô>¶ 
ÛÚÿ²øXu XÇgv(æËÛy6çÄ÷/¿«*éT<²) ÏsozB¨o Õ0tÞÑÛì]Ì¦ôåúQò¼Í%1tñ½l;àZKa
ýò9daÒ¿¯á®³í×oíÅ4ä:ã#|sC lr?iKÙo7;;¸}drâÛBjrÈqTÁEzö!øi}tµ°<EjqsOpñûÅ\íë+Ò]m¹M¹¢ý×=MK-û Q^pH_2°]2®Ó§¶4ëm	÷%ÛÅMi.ûd£tëA §u[JÑQëé Òà6ÇNfeÝqét¾¸ @ÇÞÞÖHL¶Öwóûkcë««nA;uKÙä^o|þ]Õ¨o²4)aøTD²¤lpb@#Eçñ *Þnr®qæÉ@¨U!ÄM/àjhi.¸»ègÈ÷i!OD
öë.ÍYsÁ¤âÍþåøÁòa95¸c¶y\úîw{yíè¶Çün®@âoW3ùYX/j]ý×DUÏ®æçÄÆfmûvö¾gá§Ò|Ùêã!õcX3LÔpeW@4MüOö,ìtápC%îSB7x?ñÂT4ýùÕ,!þH7u#µ°dj²ý²9åÇ.Å?7u?>zÜ+«¹°ÅµÿãèS¢ý ¿.#w¥5¿³¨ïT-#PÖ´¯)Õ/¢ýþQ6@ò	Å¶N>sª ×#ÃmI/g^Ñ$:Ëo}"Ü"x,pmÁ»BêÂÕSòS4q´
h×¾9m1MÙOÍ	C
*WÞ+2ÐÐq6aßÿÍ´d-¦¾øå@óªd/DÿD|\óCÓn§9SwúÅÓH=Mº¥l½ÄåKÐXO1u®Ö{ôÛ¿,À*j­©¹.ÓwÕ¾_Øê'V= ©ûÇõìê¨ç<ÈÜDzº¹ÔILÆyÅMäD Z oÂÂ®u!)¿*LÛ»CîÍ¥ª£ê"³xoÆ³¬þyÞÄ¥ðØX8kêÜ÷ÏÇb##	ìçÞ}í	I³é½= ¶Éå
I.Loý)ä¶åÉÐn#!±ÖÑ){=}¿ýê~"}o
¾¶fÖÝ9¬1½= 8ê0H®'W7Ú,äÎÁîf^ÓbÖãLËv¹±DÇ^9¨PzÏÆ=MzïºòiA\Ò>ªlnä=M*
öjÚ8ÈÊÁµäÁÆq±	jq	_ê"Ñ¥ÀG@êò¥}B·p¡x6AýW­VËÔ+= Ô[ QrQÝ¹x#ÞüK²2eÊsêØ®õbY
\¤/íL>Gl= ul+àÍ_c×rÊïú¦0ÅZàçè)m))</¯&ÏôgX£h¾¸P
-£wí%a;à³b?ÓxØ{´a=}ì©ÉNéÇòNÉÈdeªØ:¸7X¸êDÄoCKÔª0fáÔÜ·h³ø ÷Md"i÷¥ïo8RW·Ò'Ñ{fã!^\Rv!_âa%å¯nPì$ÝÄFÑAQpÈE[-¤Nu=MôÄrWÿK¹mUHFÏo³Û¤vØ	Be=M³¹ ¯¤ÚÕ©>[ù´I~¨|ß7«Òì@¦¶RÃNØÀ½M3Psÿúi/Ïé¯[&õ/5Sµº×Ç³Eíiâñó:è¤H¬ÏaÑNë[Ô"Å©ÁOè]Þì¡÷öÅ²	èPgG©QùËLQûÕXßË5MÃuQ»~ÍqÛ ð±¬ûKâr½©= 7Zî añpNøj2K¤Âe7ø µè¢äªèwG¦ÂMk¨Ó
#|au½@OD×ìDptK8BòÇÐEBì%tS Ú*í Æó=}^¡Hä
ùE­1R©IÌDØbJÁ#ùói½= qÃ{É¯¥?qÊ;÷t±ö¦c<98äY&PÆÂxÊB	brË×´ÞÚøyæ÷ÝpxÎDnb¿h	hTùCÇÊ´a@lâWÿKã4ÑyÖwÜürGP4%ÕSä-Xd¥>yÑUÎ.æZÿOêV4E¢ÆNÎ¦â\&zI\¤ðoèÅÍÕÞfÇÇ?zá+hËy)dIÏs¹.	P;a/":Xb? d!+©ÊQj= »È#(owoûÁ±õ#ßDÔ
M¨$= ¦0²kå³hñò=MºÖ3ÐO¯8,gÛÈà{üBEhÒ®QD-¨´bzuöÃ
¾Aä¾³ïmþyËÿ5ë.´ÝäsHTþ=MûPW+\s¶t,àV!ÑsÓtë+¿ÊvË&+
çãçäN9Ø÷sÔÊÝÛrÂ¦Ufã®}ü4°YÕ	Éß¦Õ§3ì»I[°²¦lÎè"´Å¾³ÄëIãawÚÕßUk¥»/%fè9±ïºÕM¹ô·ÉüíË\]ÒY|Ð1ÐÙÅÿbÇ
)ú|©Ç$	
]ML	}þß½ÊQqO¼ÃÒã]P½q= ^§ÚB¨=MÛø"$ü Áég
Ù¥{TÞÒ:ÔÝ·ÏG\ÖGnõzän è©õ»}·)Ï}·Ç@©eëtW.À HF#@ÅzÚv¡¾yo¢ÝÏ{ý,ñq©²3&(	{SVKä3$è3'9sRrIÀ
¸ ØGÅ§'æ7ø¡Qýy¸Ú§	ähJ=};GÑÈçkþ¦Aêø"¥Mnânð¨¾jnráN6Á0v}IK»nó'ów=}oáñ¶}ëjWëT¤ÔSøÂ 5¾üîürÜ\¿Ú¿"ã ímâ7³%Cô§·?EbøÂUuCiS
3<×²2FØ|}!è}zø
húw~ª\nì¿ä3yMLGÅú«ÃDìcweb4¾dýQYBftÀEëçÛÊ¦P*µèÑ}ï"E¤÷mù_$áýÔ|&|º¨{nkL6R3üÇjàPÉ¡¶èÏ,Â Ãa¸´V^k¾ézàFÁSåG@füÉbÛOp¬¤c¥ÙsøqäÆE8
±
±Þet´ðÌ±c¢Â£»÷¨«Ú1ÇcÀuÅó3t¸ä^¥#¶Âà<¶hùAÊ@è8#VF~EJA	øQ/6PkH(æ)ÀlÙG6ÀkvÁ%ø6ê<cC´Ü(ø¤ßQÝMcõÍµjÙlÛã¾´³=Mïf2êõßäk(P³_ï®ÔB½ô+V Ò¶$¤ó©M¸^ôÒ+6}ígÝ¶¤à¦&­b_&¯]½hSaÀª£N£?orßc(1Vîùºã±rJO.+7<$Ð©ÒÙ©ºÀúõG½ÀÛ71pÇ¤o]róÝs¿Ï.÷¡CVê7º²p£c 8oø£35µûhµÝ>T\(ÌOëØ/= ªMU¬6N#	Õ³½rTBÄ{7(Þvmbe2é@4ÀÊÂhà\ Ï-{mpA<ëEÌa|ØMÍ?± HïÚ@üw{ww8c»æªèJù¨µCÉ_ ªáePùR.)Qþ [KÝ\ÞT^¾ëÍTÛ=}$©FE¨ÒQ÷¢ÌïÚMå62X®Ì%.û
(p+4îcv¸>ÜC°«i52ÿöêÁØÿÛ¿¦©ÜÃi>+6$X;ZW÷Ï= l°µÿáÆP÷ÍÏTæ·ëbÍ	Üµ¢@lKÎ½û\d,¡üO>Ø#ÉdbùGÖ°²§!¸úÔ'Ð= ±­¦=}K"4°Wù¶pÖ" ¾®§KAÅ9cÍ§>Ø=}·ëòÐ3·=Mô7Ý+$6¥U7ða<ÕÔëü¤éi1q%2p¯Ó§8tU0G*Çã=}TñRcÌ.îIÖÜ<âX <§QÌÒð*yV´¼>>xzFÜsÖ]»#Læ_a°ÿmd[ãÆåBÎs´>l,
¯ñ÷Øx¬¶ÖbjÆ+8úçwØB÷³£eøåÉDæ&pÅÀV"Þô1¿;»÷nöÏnâóh¶x)³eTù|¯ïu%goWAÉ¼sÇ.üêÌ¦Í>"%ö7K:2ç×'®h0R6³üÎSÊ$n|;Üê:y%»Aõn:åÅ@b{h6hGÔ½RpÚÇqHígÆ¸à}­Í»ªG0ávÉÝ. ×Ñ­oÃs²,6éÌÌÏ
>Ní=}ÝCíh=}K¼= Ä	Ù ªxEL+³ìëeåJbËY7
ÎÌ©jCSzt¯2tPÔn\cUÙx¦	^(1öB÷¹Wxôã
jÌPÏ¯2=M<¦´~ºB³25¶¨y.U¼ÿ|Ë:ù¶æß(ðiÙñÒÌ3C^ õ[/®ô= ¹J¡âÌ,Ñ¾b¨6÷?Ï¨ÐêMÕòWA'ÊrbQ]=}RÝDÓO_ïõ£dAÆËou¾}ºdWÿ9é¬(=M´®ÁÎªeíä­U]êÚ)Ò1¼$qµï»Ò"Ù«>ò6§=M%&-sËKØ@·_åÌÀJE	ÿ+*F ÷$üH}XdO¶ª¼T¡@d?Þ?Ôûß°XeK>¿E{ÜMîE §Ü~^ ¡Òß?²{Ð4Ö¥ºsªÙª;³o¼q£Iê	j7i^ðyCñy?q¶ÙOûqñ{ø=MC}ûSkÙKq¸Íï*Ç©ÌÓv¢= Y-Ð(xÛ7ÅÇ4= ëcR¿µ5à\JËÞ×.Ph»9,<\¦/í4âöEK¾åK6úûÞfZfþ§Wèâ&åwÌ(¶Ø~(<K½øºgØzÈ»ê\NY¡Dà¹¯?±îPÁÃxlX£_êñßcÞÂ	ÌÿY­ýáBq\4bB	ÖLÓ¶3 aÔ¬÷úó+G/ý·¿©oÞÙa°¤ÓM;T ú=M±ØJí5ZÜÈË^åÊ±öDÄd q°{x ß
×ÔÝ³.ilMKW;ñß"=M¢sZ!JEM°Á¾§ÿ~U:Ùº6û0íþg'ÊTX;@tKòälJ³]{|},-úÙÛÈW ¼ÜqãÈ,pûlÜc 4°}úÄêuPø³?¯[ .ý¯² ÷Sîc|¦7Z©7wù*úír= åØÁ@yeâ1ÄeÔàçýû  s6AYÄÑèå¬~Ð nÎ@Ú}i*+<hªïÛ÷û²21%åþm÷)ÿ	;PÓÈêôý	©~(¨y<³¤5*ÀÀ¶t5óYclDgR¨cíç]Îâ!âfXP~jþh"tHp?w!!+gðl=MÜ¨½1íÚRüäÉêEÆß=}Ç«D_(\Îkì>óñðPpÁôP:seþ¡IÅ	å¥,f°´P1 V:ZäÀz´ f;ùmÈkÓ(¨oÀxFn¶HFnaAhi
Õp´ç}_= E~ØZ¸}¼m¼ýO¸jHXLBÛ!£ÖöÇïÊOP;°ßEi­=}ÇÊmáàÎÒZ³H±X×ö§iOøO= ÈdM ?¨|wOÈ¾hÈs3 j$«(ñ´eSS¯Öóó@îì(]r§y6ø¨|öøÒ¬	é=}m»Iøí,× yµw¨M1b@wNÈÿ\C@h©VyI[7¼×"o´íÙEtÐ¦àDxÆ§»¨\Pºä©>ÆmôwÎ'P¿kL÷½p¨d:Ð°^øC® VÁëb°ò ÅçuÉ¼åCEX'ùºâàágª[<°§©ZÊýÍs÷°ZÀè>øví!@ÀGýxÈ}§Í¸µR§¨lÖÏ8JÆ°hZqc¨b:¤HEè,QÈoaÈçh¹ÌÇB¬¨æHìÈ%¸ÆË
Á9s°ß§­\9ÎaÙiWéÛþ9àqGèWËeªA$*×i01C't}½2ü0©ýnj×JV¦y±E}æ7ÜºR2ÊùÁsÊøÏ= ',µ6±/ùÞsÖeØoVÔ¢U¹EÿÞýý6Y®ç3Àg¨»R= °pízÀòq{ùFÛ(½j¹xÌKPmÊñ7á_¾ýªQõ¢hjBýßVy- µMº ùÎNÖ#ebÕõä!¹sW¥:ãlüàÈæ4Mîøá?ßºlß10òr%·/ÈKz\¸cx= ¬3s³à×ú¸>Q>S
ÝãW¨±¸F,uvTæìúß¢qRðsD~H{¢2< =}ÃÓ~¾¸OT<¨Õ6ºíe7H<üXW$§_pü®Ô +g¾,t3ñsÄ,TúE¤¬×÷/ÊZ ôB	½Ì>ÑZ¼»]0àyêGdoÞÂÚtÁâ1¬(æ^¨:ðLU0Õôjø è0öò¦ °6GYisÌdcd0X+geÅºV0]4G,6iÞ¾E¨vïøÐ
Æks½LCE~MN:¬s/¸Q¸ËÈ°ßp^g9ìu¢å	Þ[µoVgygÑøPKëvÍü¾~°/Á)Ø¾[­\mâ;¼SFÑSä/"øm= ÅðÈ1£kå¹ì&~èæ=}o2øjé~Ìê[%Ob"zÂ;X(=}(hÝ@q¤a\nìÈ¶\8·c]	c­ #TµIUo\§P1,|OzÈp½{\"&\ø
udwÅãaLEÇÙýd±#eÎ²î«CS¦dÁbÈeè¦ÓÑw?Ä@kFò1TeêÃH(»Ø$¼{'ÅÔgØ'"â{7!ÙDïl¨63µbì0â Úw=}=MRå´/¡Ì±bEj²PÄÈAÌ3{â§8UÃåsê[p6ô¶DÍ¹ÈÜíÉ,!uNC	[;)ý1á<|( ôº
Û¾9ZûüÄ¸F¼Õ%ÄöÌ¹¯%ôã©=}OXgØÌÎ¼Ë}tyqYªß¿ìc¾ÐÎ{þ9»X+Ô¨"ß*¬fª¥µ86¿ëÎ¥³_pH.j|ÇbãHgøÉb£gª9AH2½1aù1am0l¶éªVO¬W|Ñ\ÈÝí¡xnÀqSE x}©Â-¶»Ia«¶<UI­ÒcÌ¢µü©uÉÏúùÀÖÑºtÀi &HqÿW»&¬71N.ùFRÎÆ-Îuh Â[²(¬LÏû¸põ¯thh®:Òèæ¡NpBª"xSöÍ²oL÷°{fZÄ5öáÈáÏ9=Mî1Ç°@Ò/Hoð¢)1±läÉP¯\mEh!ÕÔBú£Ý}6Ô@ÏÒç7¾¶øÅPJe= Â>kQÝýà=}ÇºgÚáÊH¡íj$ÐY36ÅsTêø!ëäjgI£ó.Bj±e¢ô ËÀPíJl}¼G¦.Og:&oÿÉ%VÅáÊÂëùsMHÂª2»ïëkbyGÐ½ ìdØ-½K}º\PÑXû	xç|c0,tÜ09(°@QtÆ¿F®øL&W®·àDòÀ­êª7åzÅ'¶û£0íû]N-"%ÜtÇQdûniç	vT´a­j~ÈBGTº/ÐTlÛÎ xGëDyÏ''TC,ÁÌ	)!³IØô±ÉØ!KÛö1¨u_,³æäE6.µÌ9?l.·C³u(Õz¦Cîáìö5õh= ®?Ç= jhp09Úhÿ>z/>8²ç;ÁäÆØÑ­á²c³¼±ç«ßDÊ ç)=MeïÒS.½Fôé[®öå*'ÜÓþ÷ùÜ$Ï,7RÁ¿Z#FEÔ£¢´ç/¡ÿ¢vä:øv+Ë"Y¥¾&l<[Â¯&ûÎ¾æw»k#WöXÀ ³K/3 8«;«Pj1(§3s'æBÌx×ß6x ãº³6Þ/Õ§_,0 PÀúû%N2.É,û-µMR¾ùs½ùs¾ùó4Íús×7K±Å<¼KPàÚX ±G.JæùûHô
dv,N]JæAc®b´= } éó­üT_v¶6òÞ«bë8Æà´}¤6¹i_ÛdªÏ&X[ú,OÈÁ ´Ù¹aueFJ¶«o¯'Rè=MðcI<èúTiåe»ñi"lÂ¤yu'SÇpüÙ·Ó¸ÁG6ðøXHÄ×ÈÄ']çOëb¶Æ££_F¤£[]tÔÐ{ì#SzÊ´©×HGR7è;Þ¨÷ã¸= Úòs$ý%Á÷Uî053;±tÎrp65üõWwé_é<¡çCâU¥ÍqLÜìÅg$ï2ü#[ÏÚ2ÅZÎÉ­vÓ³Á[Î­Ýæ7¡DQ¾Ö(µú({Ë|¾+Z´V¦Ã-V¿õO0#æ<Â)y<ÇÇ?å{rÅb+MÁ]÷¸Ï¾0´xUßÝ¨9ªàh¶=}EïÕþyªèkÎþlÅ@+Ö¬ª&<Nñû¦öqã¹-Ù9bL4h.Lô¤}:Z¹S×áPiË^)à¿¥[´+Ý§ÙÇ9(_%>KÌ
v´Ö=M]³~FÎ(iö¨ß¶Åi^ïÇ
°EÏ0B?e}Ýt´t[2Ò
çÑÃN(O:ÌvÏ¼7 ôô}5{@+*xWÈ ¦©â¨wS¡Ú£oÃÊ'©iÌÃâ´~ÜM÷Üdcàí	{võ±×>´Ëä-emÀf®®Û:í;#¾/l= Su_ºbÃÃòÚ¥2÷q².©\ÞÉ¸éh%K{HàÖ]~³LÀP´¤U#}ÑËFâF7ÑMD)g× 4b¤QWdÍøtâÓçÊÇ'/ë´8©tfË|7·o®vLH´òkäZñ1R^Ðí»Mö9så:ßãJ¾(ôE ØLb*¹ü¸ÏLö;NbCYU"æñï+V]æñoÅCYÕ^ïW0²ô=}î&Çw©m1º<*U±Ï#uP¡3U'âb3U_Þ"ÆÐÞa®AÈÚu¸áÛ§p² ,()È[âwô}¿]·Ô|,«b4¯¤Ê?õ.Õj%4= 2^ºôÐó8©2¨>ÿiEÙÃæÖZR/ÖlÑ(§IUßÌÜOz³ÎYëh×¢.jiéûI«Ë~%ÄÖS~Tl!YVÁfx1ïBûÒï9=}º6¸lØWë¤2'Þ½ð»ßtýåãVZÒ.Å6O*¾I%¬ÞrWÃÔ~4Â#i¢·VD~}-p'/!23LkÃm	Z}ýZÄºa§,Cî[~J1Ç_Ú8Ó+b<:Ôÿ¯Díu^u&DíDípL·.Ê1=}äÔ¸Xøcb",Úø;~]æþs7»þþÛò_=M&xy¼R÷ô\u-Rayò(ÒÊc¾Êcp«Ñà­Þv.Í?éå_tM~í{~Ã¡ü~2¾¨ó646³]mCOê¯NsÑ6Xß{¦ªsU´¤Í¥ø¥êâØÀ¢ñ°Êê,%»ôyD®ýÃ]Yäy¸µ)·SæS?¨°
3TqZ(!Ø4ØÄØ¶të8 Ö9O[&0 |L·cr¿îcÆÐKr¿ÈEÚ\¿·\·ÊßíwÊ½Tï à#=}oózLñ³
ÚöÇ{®°ÎþeX!uKÜæÍ+wPiÒZÑZ¬ÚñÔÖYn^3oK=}y[¶ 4±ºÅ¥§¤°ãkXñ¶Gb!1ÝÏ@éÍQyÎØSÓMFÈ!o)Ð÷Í:UÞ;j¾uÃää-ÛÂ(ßºKÛE@ãùÛoäQ:î"Ú¾Î3XýÃ¨¨·%Ø²ªðà'1qß]pëãávçvÔÚQ%}\ÎÁ¸s5âõ øÄ©Ñú±F4¯ÔÖ&H=M÷Ýáª²ÄÀêñ1q´6ùDa;ÿmbÄÙ:.¶8©D¶Æ+Éq*ÇÀóèh71uÚÝÿ½ÚêÇá|ûB j^Æ¤¶¤'u#rL¸2nC¥èªàð×4WÇ%:Ã¼Á&Ãðj=M%ÇP¢F0ê¡§ÁçÿbßbåÕfÜíöñWÆÎËù(+ôxlþxh²i2JÆN=}z))Õjèv®õ=M½ì>¨eä¡j­+6çK»tÐ\tÏÏö~¦dò"&w²cíhCpG+þøZ¶x[!U°Gx¢X£¨kx¬S\Ïê÷Üuo­58ê= :¶É©U ¡"SÔ3²/«¶­õ<=MÖôa¥X;w^MÍ=}½ë4¯'9ÝLÅeä­qÑÍÐ¬¿tÔ¡7­²w=}7Ïa±68¶\1.?bYL rcÝ=}wêC¢]VÆNãÕ¢ª;qªì	éTSr4÷ÊRÜÀ|{Ñ·F¥JÚêãX¢!´5"Éz7ø¬+ÛD
²?+=}âø´4ÎÉµæ[à=MÏýPdÉê"GÐ(¢¬ù¼\-yÕmîMÜªïÍìµC:'+ã7\X?vÄÓtIä55?Y?qkG¾z[Éçss¼ôÙ}õPe1\ÊÞ- £'=}¯Î÷)äÞtwÜ!ÏÍÐ£íÆQ·åZ´;ðfpßärÅÕXU
w§Z&w$§ØfT½
uX»î©5úvfä}ó ½%ÕÚE(çïxÜ^p^TÑ(ñAýâ{_µEy=M$­Ôh¼íº3tÈæÆ£.²}nõ¼·R|¬Ðø"·úµZÑÚ9æ£[PP´ L0½½(=}Á¿=MMÙDÝ(Û6]*ÏÄ@M F¸í0zú	3ÆÛÆ-8ùÇWáË\= gØ©m=};ÅSágbù4Ý1¯*:vZ!p38-¹U*ñ[ÉÚXS<ÜÝ²ÞµÒææö,L¹~ñR^¥¸P2þÃÅ&r	oK|ïGØ6@ôÞ:uyaRo±¡ñmôqÁ¥Ã(º=}°ßM AKÖ|êÛ½ ZÅ1Qþ[û¥ Ö~Åa]0(d¡/¸ gÉêZ#ë:=}ÏÏª«N³LÒÍ³¸,¤Í ræÕR³ãèVQÅ¥GT¦ßDçÌ¬µ Âî¢WêhÉ o/YØZÍ:ñà´ûÁÂãH=Mü'Ä§PÖÆÎ?²¡";¨íù¢Å8nòS=}=}»¦¥íQ©××Cä<¿Ò,¿÷Õ9¿¦B>ÇsÙÎ»3÷³qwÀó\z\ÄU¶ól6gGEIkÏ~zWæåÛ,¥%^a[¬e]®ðJ¾ys´çv/¹.82¹ØYIô3
à= 8³í¯ÍKf¬Ê«ZwSÒ'Óò.!i¾®ÓÜíîÂÕ©Ó²môÖÿ8ÙS£±Ö?¹ ïÀ¤_Á úòÞ¥¥Wôð)v(ª®#Fídoùk¹=MyøvñúrPß,&º6MyµSqjÔ ñ^ùó·³Y¦Þ	ô´2É³ñÞ	f³j%àú"é§y¶¬kH$QØ98
ÿÅ_¶Þ@TÓGgô)fó)&þTAZ¶p~#% y$Þ3s¾Ç U¨\¥3Ä¸Ë	ß*ÅM´øÚboÊGRÆ¶b{µÏ/;X3Öpòìïq=MD	ì%	u«h¤$¸a	*¾Ò¦ä\Ä;¹iîL9ÕQß\ì=}Õ®OËjÕhÅp¨«9,¬:~×dÊ¨&\C4OÝàÔsW!.´mÕðÒkI@ë®Km¶ÚÕñ|cy9KëC+wkc[d¯±|mDÇ¤2o¡ÆÞ]S®hË5¢GH!~M­ÒÉò1'(8_ø:s¦µ/8R95iø
'ÅÕÑ¿¿å)°ÝÞûP¡0én<õëtíiõÞÂónñÎGuá5î1'ß@âP7_zGæÁb3Â¾tÙÊþ]1ÅÑ<[±2´xðàPg#ÃP5<µ²;÷<|#~|ü
u%ÛÄÊäâ<Ö_] _ìp"Ìö'X¡»BïcÑýâ®öÏÝò.ÞdbCvïL2es ÓúN¦È7oCÉókªå àå0Å= i¾v=}FMcóó?C3§§k¥!A.ì*äOìE¾Ã¡i¼ì¬Þ"[)lõâ¨ÔjVSc}BDêRRS£¼é/´t,Xù/ÔuÊ>MwrSØÙàÙy¿BúüìJNæ%wSK]P«FWMÎÀË|MpQrR=M7Ýx,NG8x^5Qý;å= ßõ7pÞ«XpâSÈ{SuDOü{EBNº¬T¹\ßã6Ù'¥Ïí+¯·BC×RdË¦¥Ý}{è».Ò¦Úú³yüÞßWÛpR¬åö?ì$ÿäRµ¹¿ |ÿ¡\n^zúIµÌÌÒ\må¸Ç/îzê¸dµ<¦["³u«;1ËwûZ®uÑî]Iã¾¹³=M,][;Ù&ës/IÙÿ,Ø
Öèï´+j>×@:_"ï.ÊXëïõ6LNñÙ	,ø/:ñ!ï0Aáô_Ã¥óËs1= uåÃ¤Ø_I9^íÔNr¼ßzâ:XMÇGéulóR= ato­Ñ²LK0¾Êû«¤±g{:n²võ%¶ß°?îÔ7®áÇàòu9.³89úÃ«ÆtY¿à=MC"õÖ)OG9_ê©ØkìætèéúwK¤?¯½B<ÞúùýÐíþòs¿òj^>s¿´JtPrÆjx	sm_5üá#-êfl¥3rQÅ^pÌ·OÓØ!$3
÷3A#j²§G:­Z×G(S£©)XT{R×BB#\ù¤=}¿ÕQ,ðº{róÛL5&@ó¦p= ûQbìi§oø aþì7° 8»C5xüvrÁ'2gêj1ë¶é@¶@$êV]CRñÜX2»= {¡A6bBÅ¥|·¤~ú§züçMÔ¤xË¾T½NÎyÞ:ÑèU¼Ã	qõJb÷V¼J=Mñï&üý£#Í¼C£nËÚpXÏjhùUKúk
,h1ßG÷EÙªg1ð«.¼á× ª=}ÛÛ®ÌfX²®_ª1 [)C>¨¹aTÊL"JÒcäÖÆ¢eÓL¥·8b{â X*§C¬Ù?K= 8è4h±.J=}4½ô©béÀ ÝIh§ÿx¬Æ~wRp/ß\mÎ4ÆMYZCf:ozÏiìÞ5Õ¦ªÜQ]ÒæìÒ9Ð9cûlúNI°S{l)ÆÉÂþZx°*ÎOË¼)R
×¹æàÕ«ç5|Æ/¤¹¦ãã¸ú_t@ëFþ=}]4bÔv±¹Î± »îÛ9ê\è$F>YÉ¾<F»Qêr¢N¢K
8J)¯oÉü= CmðmÓ§Öö¡×wn¡ÕwÒ¤vt{1Çû}t*ýMû&¹PhÅ,ÎÔº °Në9",AwwsW4+Nä8é«Cçí½³ì2n²åûÞYµhÑ³¥-ôÌ£wZKÑ»§Ìö§÷¡¢Sluç§e©^²'Nùxø )Ð¶ä â7{)®»X¿BÄÍW= = »»AFªÍ´jÃýú§:@<?´³«Eò³ë"¹R·R¤\.WçM¸iRC9Ù¼Ý%àñÓçXûYÑ= Ðe0»ë\æã_½ÿ{8	nP¥2Äu= 9iÁÀØBºfE¸â­¬éÇ<¹Ûy±MªfP¼4¨q:êO²Â³¨¼1 Eáº×%/?t´2ÃµhÕÍ$Z®XÝHvNuä(Ð]¯¢}±Ø'hÖ/W!1L>u<IG0<ñ§M($Ú6õþ*Ï-*Aª]ÑE¦sAÑ¬ó?/@×FÔ=M·
éÈ-+ó,þRÑ~u/MTXîæ¾0v0â©ó¹ÇN<Zÿæµ}ÕbÝ+I,©iaöèêdÔtúQÛìÅn¦@=}>%LUwÌä~ò>rlu1ÐðÂÒ¶c)­·+êÿî«ÀªÙ;c?é¹7Æ,)= ¿@>ûä¤ØaÅTòYu%N¾ ZµõÉ
V°KûèYÀ<´ùiÆ©¼î0¤N>ËêÝkÒRëeImk¯ôÆIr»¢ÞÅ[¬{];ïqZªès¦¡'÷³aeèÈÅ¨[æDQÎÀÿ»¹3
û$*[ {Õ©0¼Hr³Lús£,­³¼DÜ|îODp¯BÇä®+Ò	 O:l¼¡dP%DæÎW·2(]]øÿJ-ï!ö£ÀÇ²æ&ÒBÍ0ÀÛÐIg&§S¾ùãÉjWÛÍ1ßq1zíÐîÜØ,QZq/¾rº¢*ìÌ<ÛgÒGÍV1U
Òëü%,ÙÏ8:ãÐ~ñ ¦4ú×þ«³gÍõÏn=M|É63 §´0IÞÖÑË6oS!3Õè¤¬ôQÙIÉë¶ìÛÝÞÚµk3=}9¥Ó}'_Æ2 *9ò;â@^ÌÇ¿ÌÜåöàdÜôÚ¾'Î=}à×òçÿÌ=M(Ûè©àOÅäË!NOH÷ÇP©y8æy¤O;Iao¡xÉF¹(Ï¹¿SôZØ¿ÔÁ@çK¢7Aá_Êávéw1¡ÏÎå jÄjùÿ²=}6ý*¨l	È9§íÈµ¥R*Þ1P¶^uI¢ñîÄÆ}6uÅ¦¸®z2h¡Ó)0÷&£pÎ(jGöI@í ìñ~cùøø&P¶=Ml¬·K×.ÐSQ»'PD.s,ä(Bû Ä/2®¿gÙ±ö,­d~±qÜÿ¨xbÿíöË9Ðh¦§µi»ÂAðÂ6÷TYóntK+î7Etá=}7à¸¸±ü/&¶·ãUÀùK¶Ï·ö¦cc^´ý$^@ÆÛHYd©FÝîÙ¸ájâkJ:;ü»'%¥ÓÅv!Dná× ñWÂ¬7TYlk¨Ýtú¾;ûGN=}áEò? z:b6ÌóH)§-ãVGVOz¶åJV½6+Éï.b	"6º´aÐ°ZëKkÛÎt[£¶ý1ü*®ðÒZgôeÍx¡ia¡dY7tñ©.Öïù^é³ÛX±®àBAgÓ	¾x©©R¡Þ:àqE´á}ËNÞN3£â6Ü2_±6ô]¤8"­ýµ¿¯ì$Ïî+Ù"ÍîkI(u¼Ñ¡w¨Þ-þ*òÞXÛÿÖ6ÑÌA2ûÏÎk¯pÙEs««(=M(8y|f©oAÍA¡N²?k[7ú¿pK.ø}nbýë]BWÀ}¢lÕM/Ã
éô0ëì¬¤û×I2{áèfìË:ù¨È¥1¬uLw(q%ç¶ªÅWÍ.ËûÍB÷'Ör±iM¡¶®ÓÔ§:£ò[=M÷Ñ.ïª5s4¿a^)võLÇë* iÇëuQØTÄî$ÃÀsºÞ«öH¦ós´;x\ü8»SËc+*-×= ²YL±<Iú#Îõ2\Øâx7îÎ[Ö¢Ë¹t{oFûÎÎZ£ëùéEZ <÷RüT¦ ´øþGæwÜßh@nÀoøB{8%)ÑGw*+ÛdÊt-=}½»¬VEÎ­N >@ÍfÉÃzµs¨¸ô
°ß=}É­âFÉm¥¬Í	/±û)¯mCÏzï5¨:'ð´e@ËæX,ñAÆ÷|Sg&Y¸S=}|Ó¥À÷9+Xò·e*Ìò7C]¼¬Ýûûi¼(&Å{JjQôVmà9ÿ¦{ê'Ôª ¹m2Ø¡J®öª¿!Y°g÷k®2(ÄI ÙÈØonL¦ùuwÄ^¦sÒFÑ}S@îh?:öp[=Mxl_OUBg ¼5(k¡ø&×Fúþ ½³ s,wÞCñYä0n.¶a²jìÌ_ÜÔP·6øøÊÖÅgéÀßRtwÈ?ôÙn¹Ã)M°GüóÐ= ¶üÙ6vå²kÅ­@Ù¿nrÔna¸Ê·ÝñàòönÒk§±kìà½kIXPT(Æ÷¡e(hTx¸@´w=}WÄlp'QHÌðA£Wß@b¶d(U¿-/d¬;+ëKõA&EÛx(T$jAcE= ¯F8¯o¯b0aüGyëø·
n{âÏÇ? a×üÀ[6)ËYJZ­BÌMoOS¿ö(fA\= L}VëÍÊÆÚÿÆJYÜ­®¥­á:Ó96ÖâSPÑcÎu¢|1Us4VýuPäÃ^÷tGrwYÌCý¾Å,Ä\yâCð¾wÂhÍ¯ýhÕïè)ÊL@[FÞL@ZFÖL8/óHwt½CøAxç³éæ _Ñ¦¦bÝ|9C¨_¿ôß>âFï#^ñ+gÍ@ë6£÷v²þ¯­}a»P°õÓðÏxÇî·MfI¸´åÌQþþÑË77ÌïÌQ?Ãí·=Mõ6Ì¿ÃMVþæzþQËbÝõªüþQ?»äå¦Ë;ÃmC[8Ì÷ª&³}Y*Ï<Ú¬.ê^#·½îå~¸ýÄÓ8*ëm¶Q+«æOÇJEÎAu*ï»ÕHh9$ÓpÆ³ÖMÖ<­QræcPÌsüö=}6þ2îíù>E01ÎrºRÛÙÀÑCéØ= B¶önÃ¸ÃÚº_Ñt¦TîO×t¬ëÚt¾3ã7w;PPÊ<8ÕV¼çZ²£±þýÃÀöyZã= dÃÞÐ~½ópÙx(]ùÇ]j:ªK&U¿ª8"¶öK«_¢\$x,ÊzWn®¼^ÅO~&m¦ÕOyTöãz9@bWMPý^ùÍhÄê"	ÒÓTKP*^0´¬­ë!úýÞd5K3Ç5àhÊ®¨ã¬'Ï{¤ÖÜßñïÄ2Ï	¶=M¬öRÊÍM
}.îv+æÛ1×º_í¬ºÙö¬¿ÊÃê¬sîÐé=}ÍK½fìz½O:kå²¹òúä!î\Â4o)íá³ì¦= ªµÖø)¨nmböi0mÌØÄ¼F±}NÇwÐòÉôÇFÿú>Å~ubt½¨va4ÄÌG¨ÌÐ-'ºEö)ÂlªM¥0Àó	dí[lB³Õ3DrÌìñîx§Âý¶¦2¥ÓûÁ\è¿±¯ÙÛ¢^±Å2â­Ëý÷[5®A.Y½È}öÇÖ?ÌÄåßkøüó,IüÞbk¶~r\ås= \}ÉÖÓ4c¹ÅK%Ç_²1Å±8±Qî»î-ï+~àÈÄR<ÚuÉÝÆÄÙSª8OyM¼&ïL8ç1¢¸X¼·µ aäQ®Ë.ñµîXÅä ê-h÷õÍ&ï|ÕFþõòÆcRY= W0HxkR§½ç"¡ÔT!y¦#àä¹OÒ´jÂ´öþ¢¶²bvÌ6©'þx£Fã= o4þ}:<3dc¬i=}Ws mJ+~Wó*æ H[rDIrÑ7XL($jémÊÇ_]ç×RúÉñÅ23.ÚZ*A¬]Û]P£ÇéUìxÌO1Y6?Gà­~û(\%<ÑÙì
¨ã"	§²}º]~ÏVSýÍÉñºç5ÃhJ,q¸äL	®ÄÖ9SjoÌv	2CEáG¶ï>C©¸l;d2»5Nmvó$Eªõj#Xè-¸°ð_Õ¦&à·ò«5÷gzÒt·Aé&1¹»z-Q#®ËòËeOÅU³üb7K»þÐ ìå»v)ßyRûªÖèïÕ¾ë¥Á±¾°Jó2¯Â²>¼Ô§U»7vï=}}èÓ}«m¾e¡&±LQ­û=}ê§³ë®¯]j÷Z r¹) %âÁ·åÒ/¯Å"{ÙsÈ O=}Ï.yU¦%Âë>ëíÎLweïoÒ31(­qÝãd÷X^ÒØJæ¨·üâÅpfL!¯oýPh1kG.´0ü¾±òìëâlr|t]l8ØEW¾ ß«ïw'ßK$Nª@6§´Ø'X\âXW¤r½§uîëÒ¤·âÛÇ$»SkNÙúLsAÓ?²¤9óÇ]íW>©¦$¨h¥é'êÈW°	ÿü¢Âµm·iå@Nnzvûac´lÅ7ýM3üµd uAÈDV3|^NrÖü|eÅgê³ã8§ù+½]z3+°NmÛÌüdÅ î øZKÂ¥«|×þ9Ø(³+"M®síjsÔ_ÞûKxð=MþþÁÃ'Ý'HªÒïÆá£%}6°«ÂyìÈLÓÖ~g³B=}3=Mf¼[¯éÄy{ªÀÒd-= IHLÀWæúlvèXDÄ3Ð-ÿÅñ¿q+ËÀyùqXìDjm¨b= ]|ÂàGèc= Nü¨ÅØÆy¸ügXÀ¨FôkÅXÇÿã6I|tH(ÓUjyDx³Æ2TGß«Óíã>A}£3Ò%=M;$*Rí#pPÒ§¿®Ç°,F-?w?Ì©¥z
u·ùÂa=}Ï©ÝÞ;þIP´¶-;$Ã5'ÇÙ^lx½Ö¿ªt°=M°¡JqÁ/Ñ¢13 PLÏ kÆ= ÎLàY×¯úúå;¨¦þ¬p[IF}¯4½ó»À=Mê´(åt¬ÖæCßÉ¬k\ÉIÂôfEjga¾O1¾Câ<n< àà4·|gÏ2Åç7TkòòÃf±>..¯.Ã³ÃxÛîZ#jÇ÷02Z¡ÏW;Nvo¦üi/Å7¬?<Õqæ'¥±<Ä÷ª&3ÀaU #djÄ¨Ôí*9ÊU&	Óa}ü-4Ï-×¯S%J
£EØ9uÜ=M£Ñ	»£¾W»	.Ýø=}]·T[v¡Tø= ­Ôi#-O?ååvÒAxÜÆ&Ï9= Þ²#Úfùz³1ÿßÎ¾§Ì>Ü*óX3= Þ31§ö)Î~ÜÙæ)óåüºÙÞ#GvË-Éø>öOØa¿û°ÔªAZY7@éJX²6³TdàÛ/§æ½¡ùÛ µ¥Ñ1LEÎjÖÇ>RÂüî&!c?_P¨µ/3îìo¨EÅ\øÏìá®PÀÖu{ÿ£üù»nï@n±¤´¿uÓÑ÷õðÈD¹DO2ÉÓ|ÝÍ:]J´øÌ¦M¦w I&D¡j¤Ä è6¢jxê#RyOE¦®Þêî¢!é~}F&iÂ.êPxô=M6e8r#ê0½uªM6(Kö¶×BQãì\{:¥À	hâ}:æHN/G!Ñ¥4,mÐjï{¿¬Ç7$J}öþ«4^Ò~E6mwxX;ë± ?¦"{¼FèRyé´O¾©ú¢î$ÍciYÌpÜyvXµ\¨)~S:fäw{]Óò­DÖ´×]1]ò#ÎÅ~ÄGâMxÆ|M$.HírY0= %1¥ÄWãMÎ°³P3Î±VaÆe.
ÆÂ7X?:¨lN×X¼¬ïÑ·dKÿVgÉ5!÷E¹Ã~)9á+õ½vÐr¨úk±ÕÜiýU½Äëêû °õ4tG¨b´7vP×	6<kL,'RÐ4½{þ;µ9ÄÂ[|góòòWC=}e¢An·  àéµJ5æ= ¿à1zmÆ !ú7Ú+ý®¼¡'¹p4=}Z7ì¨rZëù<¬Ày~ºr}à¸:bc~Ñ}ßß4ZgÈl¨g»fÿËWæË*Ì/[÷ö¶,^íºSßoeN!|³ýìº^ÓT¥×va¶qÄÚ¢w ×X0cOÝµ¢SíI¯= .-ÜAã ìcT òÿnm'°Õhå "o0;G(lmèGß/hAg§ãâÊsCþ]XVZZ}Shª²)zF´öéL¿Y+=}åOí«[öÖA¨v2ù¶c&^öôhÕA&vzÆ{x§Ïó[eØPüØ"#À²øpÌ¡û÷;x»§MíÈwO½'Þ}L,j÷Ï×v;ôì?Å·°¾~ùd],MàJ´°m«yT:{/ =Mí"§Ub¦ûUJX´Æ(n!8$ $;xÓîºôÎn= !w~åÎr»£H]tf··w<~¡[htfùàt÷~Z/ocÕ= ¤°øñB{¹<ÝMæôhTïøæ÷t,³[3trEv¿ôÝ£çqÞP0açbÔ¬Ù¦ÎÌ¨Põ6¸ç"È®×$öfõÜ|úñbd-%bÊPCòÈæG ã:dÒS[KÑEÀûW":BX÷*YßD@J1a¿/nz°¬ù5z=}ÝdlÖ]ÕÁXíê*/ÞNIø&¸ïñÆÎþ¹Ív-»A­ã!EÐ~lªDÇy¢°¾EöÍS8è=Msn÷=}#$"Ô¦ùõ=}ÔÇn29Ñ[­E?»bÅéãéÖT¾«tµFåÜJ ò.:è©ì°nÓ0ªI¥©wcÁúÁN ² «= À{|N0m@´Ù#3kbÉUæN¬F!Ì.TÂfTØ4DX-é íðg^$½hIÎÉáaÑ'@æLèíësKLØ¨Çûm*«®¦Ç´lkñOºÞnQ¢M?]{ºmà8 íNLÎÛGdÏ¾G±Ð/rØý¸ò=MïÊCN2ÿíÉ« Äÿà-^©JPzVQÂ±¤õPìà4Ü«¦h­Ø"ÊXniÓ8!Á'Õ¥¼î àq'SÖ¯9Õ	,dëLÌb{ñssÎJ}c!ÂÃÞ(û0B×OòVUâéc8\Ì-òáúL@g8~{'\XF\¹©I~Õüu!o¹Ë5´ay~í=}®ñ9t:ÜMá5(ãWlæ°V_oñOÚzTß¢Ômß#ú×âµ^m=}u_K21¥ÛÙ·TØ
÷MãZS"G¢¨µ/ûiÙ?JM:uZñ[
£Þ¾AÛù²/L/Øí±ÂºT6´	\UÙ¯þX^;¡I´ÆI'=M0i3ôåÉtXÓáñïßbEP}±~Ø»T©ÛáÙF4ûÏ½ÍE,àûäË=MÙßÅû÷©ïÙ÷2=}fYï£ÍDá$å%ÍFbÎÊó©?4µ°gÅ{ÚÒÌßÖá:7µòë»4gp-cRUZpd'+ ÿH/OÞ1ô=MgÞ0vuð!E$îöØ³¹RaÄË(@°J Ãñë*ºðêmªð÷ßöª~¦Ó¸3ÀÅ«(r_0 ÇõÉ7ÉJÜj«Íþ¯;çÌZn§7æqE{LÈ ÁQ7,pGð.týû
ëª¨ ¾12WAi'6ANï.Q*þ@à&Xàü¸âÈHêÖ$k£¨ý¥¯smîýVSz®~Ívê(=Mx{"Yãåðá¯ËvüÞá1îKÀ©ìLUï¸c. W<¨÷ÿÆX¦ýÚ23ÿd÷)ÊdE¢¨ÒeÛæGW6Î$ÆÓtQðÎP bAhx Ê#	
'g'ÀjJ¬¨ü I:F¡/BgérC[È¨]ä79)êNÝù91¤Ò<Á,@mjñPaÞ÷¸ãü¨.L±æk)U:ÍüQS´-+»Õ­ýóã¢^ø_U³lX¦vµ¹o´RÇ¯é/®eß"µÝ *õ¯YIùÙIÅè1uPÛ}'6n§ÇañM;Û:kÉé\t¤£¸Ó |ßÒØ§À¸mñ¸ÿ¢^_ÉY©f §Cd©W?Ä:õ
¤Oa	¾!=M
fá'6Lðêþ¦íõCÊ¢GpÇ<ágf= _GêÈ&= H¼®¼!Í"¶¨ä¼Û?0åø¬º%sÏø|C;kÂµ?®w|bk³!û(Ì/mwõs¼Pöc¾/ôÞ¸µ~.ÐFd[Eq&"~^dJëì+Eÿ\Ãèa¸æÅ·È¥¼}= @q±Á\ =}­ÏÕ5$TÝÑe[< %é´#ê]ËUÝûVB)ê(È<2Óþ#¥wüÀÔ{ßO®!X¬
.Ó.¹ÜQe]ÄðZÔáqËÌÐÇ¨a²\sÄÂ¤¿@J&qÑ49z73^a¨Ñµ¾ç%ò[ð;ryEµðáõØ®®?LK û~ìîµõÔAÌoviâmë×ÝÊ÷fü]HÚ£UÁÛZu{b9I»ÜÒé/
üÅkz~¥uÑmgÙDè©t¬8#Å®ÇýoÎ»½ó-#oæñ
fe' $-ÐBÏj«ôC@ÀÐÄg2Z·h¼lwÁLÿq0ÎJÅüûª /0±ï=}ql:î,/K%{{´ L
]ìmÌtßJÆs!®ùÐ(F3,-ËáVs¦ÀkïºÅöøÂC·p·µûªÍLµ ïsBv(¶oßLü+e/:ö¥o$è0ð­q]ë= ²cg÷T=}4XYÈásÊ/Å	$¶ò
üá:S¿º'\'Æ½W«°¸¢¨Õí$ØrA'¶9á&E¿êzÊám×ÎTa¶ÅRc?à@ h
"ûßiS}Gr| qT23ê* Öõü¿E¤§öÏ=M= @Bôq^²c %WSè{°¢ê,ÍÐjamuþ\ºùÙ"{þäS!Rî fôúè?}¬,ðý@<éA?÷fÞ2êH+lù·Öá'æ¯C-@ý!Yå1Õ¨÷D<9×>,«$@zôñÖzib÷s~|2õuOSá/Ö£pRT6FêG~}WÅT®]}@Å¾ÿÅ%Õ§Ô¯=}­K}ãòï_2Zòi ~fÔ éÇWßf¦¼ï§<DÖEt¹èí"¶~Z|#â,D\°ñàJ<caY<zz/ö9Ù&ûâ£ÌF¾£·]«{»ÖXúß9U÷U_^euDb¬óT«jË®ü5DkR¹ÜN§¿0(®ù*¦B*bðµ^*KâFR\IkÿËIø0êê¸tEÇmh@éÊ¤Î2VUti÷4âX|¦×;*~¢
J¯ïýO³NPòxÐÄÕëåið»6Zµ½¹ç)Ì7=Møw¼£\+¯ÃX"8å]yfì[j(£]n\òÄi-¿7ãuQNì9m´nZSÖv®9.¢Zæ9fÄwÂÅC¾bP¼èé_suÏ´Âµñm]è<g8h-ù/%$ä;0¼µ}+0ÝOÆ
"¼5Ü};ÏLVvex1U=}	áyC>x!<tá°îòÅt¾@æùörÒáÐ$£GbÂyîë÷ {XFÛáyJ	¿Ãµ·8Jí¬dQ©@A2ûÔö!"ÜuÇÖUéü¬C×Â]í
ÆUHJ·5Tü$aÐÀçA5¾T3Ö¬êÈ²$ÁG¼îoÑÁe×fñ3ñEÊ"w:ì~Vð>9È³f °J×/MÝptA9Ð}ï!¶\Ñq-ÄjÝ7øD±u©UmûJÿ×LFu8U7®8Kîû·R qºµ·ðVkÛÅ Ç
óÍÃÆaºÝÔmådà~(jüßmMr3"P$ióÞc;pëËÀu0ÔÂGþ|\ñÚý¤¨ø­Ú»"?TìOb?¹ðÏg¸Ü!èV7Ûö¾Â¾qZ£x\ {¬éâ¾¤mÈó= '¹HÖgEµ ³u0Ï3w­È2L:4áÚc¥CBð\t^9Íwc?¾1´¤W=}/\ÖÿbÀ¤ = N¨lQpVOÈ|·KJ:ýý^;$y °òv?P@o~,N®ÀH(â¢hî9A³n¹C³¨Ø¿ÿJ2ßýP?Â"*s6x¯?0Ûe»¢²ÄAûÞWÄAH°ú½×ÄÛr=}©hðFµÆ·<)7¯tCv+êÈî++]<ºù%º¶ï$Eú%íÍUß#¨F¡¡"ÖFÝAZ(=MVvá>$ÙH$ÂhQ
.OÝ4S7lIÊAÑqFÑQÇ8ý)ªxgÒ_i§-TûÎys9I	´Â:z®µZ,ò/|ußJEÿwBØar~ù7þQ-ÌèÿJï]#H§~¿Ùvl¯31qvyèÒ!ü)Ðó×iåð#éÇ8á®?MÞÂêW!2i}v%ø«µ~,®"¨XT¥Ñy"Ê°jâÅ[| 6,T#Ç$Z©2c[äêâÈ°µb(0ÍÚçj= xØKÅÖ;ðâv¾àêÊ¡òÆîP×($áÚè®ù*ÂFbhñ9(»[C³2§ÇÐ@7Ç0£¶´á<¹zïDK«ð;PpÈ¼áõÔëë=}åD¦jâO ýÈ%tÑsÓ¿=MTLêÏWãíV'.Â ûÓ¸ØÏy/~â$#º¿ J¬sA®êò³µ|¬ä~Q¯!xÖÞ¸wúÀU\ª²8g¿¥ÐdÛ®Z[cÞ é
qÇyVDd¿/.o+JXUH|´i­¸;5ý6 ¦µ</Sg²w-]ÈVéVEè­ÅÈ{Wïmåv!ysÞW9oÙ{÷m
'ê2>Å= b²)x ØýõUON¾Ò<i«°{JsIany]JÍxw074ê"Äæéhô,ö9/¬¦7ft3B¨7¨ÊåPPÞó%"Då2÷L¤9/¨Z"v{·ü*jd|=MZÛÁÈm&Àæ¦oäZÐþE,&ùÂÞÜ{Ú6Üj(·M}P\ø§/¹,Í°=M6ÿ®/}3DÖîé(1z&°ì«êÊ¶°hW~ðBZ
_V
RV.R¹øætôêJÀ¿JÔvËÁ^&ÇÞ}VqJxÙa5qÎp8TJ¥ñÄB¦cçEöÀJc&=}ÃÛ(á­ÊSÞZv{Î#X]>©rÖ²eÉÊ{Q)õÓÃ)qÙ§¦	Á¤	¨é7ÅZm¿r¾ë1¢Ùüù!nºL:Î+àÝ©>dÄ3 3Pö÷ÜÙà®)= ©Oµ)>ceÁQ\·ô	ëD
ãisw¹)DëÊÎ­)¿YÉ{"ò""®3.3.3N¿QüBþK-\7M«¼/µrrF ·ÔOsp\_ü»»H?'ÄüòæßßiÕ ÊbvëcvV"úJá§²·¬Ä&«g0­ÉÓAýJØ£Iô·Òª{Í6/	ªµ;_bD;?5_í®ß
F¡áb¥¡:7'Þv´7³¬Û{Ð(«Âl=}£u¥;b)ì¡Çbý4B7¬ÑÙ¹§aG«g_+ïÍMÒ<'®Xd&=}YÏN1u®.	¬/ÓÀCU©½{æødªqcAFºc§5§!7<ð¢&ñTµ ^¾ÈÝº á= mkØîU2üV7D¹+x T|8 d¨CvÃ'¬	löÄ¿ôd:ö%ød¡>ö*?Ùd?dÿ/hÆ^gp9lbhOz46¼^!ÝÈFãø¼só#sÝHãNñ[tõÏH.Û2Äí,ÑßtÕ°Îbý67+KX5_Ýssó²ý¥´:k(Û?öPÁTúÄwþPx¡©Wüõi8¿NráÕÄjX<tSÓ5këp4:§t9ä:VÝ,¡|Z$OàtJÐ¬=Mçê¥¼ánÒôõJç©jÁ¡Ði%ÝqÙæ&s£/M1]âÖ¾ËÂ{Aì=Mûù=}|JÞ´Å´âöýÅÏ¾^\´sõÊííÍ/lÂ!,MrrÒ«Â³®b)FXÿ?³òÙõþÃÒñDâCùH?2Ï?yìÀv=}xõº¨.ú¡´of­= RÂêRòZòJò§ü×<!J½/¹
úëÌ¡É¸CZ
¿(zGJ xl¶E y¥'IÌA k¯åÔù·sÚ¼ÓÝMj%=Mìù¡«K¤ç×gyÌ©Kú¡L"ÑÊõA@l²	ñRËµÝe¹;ã	$y_ÚÂ jõãÎAùãÏ74z»ß6«@kð7ËZíÈ¢ iúÚõá¸=M°ÈõLîèkç!iØq0¸ÉÂìUåÅÙM¥øïg¸Ú-æ4ßKZË¹G¯¸ä=M¹Í÷ù ÊÁôÛSÇùN!=Mjê²Ìê1v ûÌ(}9@f]t-$!Z·.j¡ò{Dh.´¢t	¤Uelÿkù½,¨àÛ'Êf­c¾Zäº?Ó¢ÏhW¸Oåoú±üÃæNåÀVÆ_{;Ü_pfSCNzh'Ò//ÑÜìn.Æ?Sib?öd¸?úödGn>ö¥defR@_òV4äxH4÷|Fß<iA.ß_KPsêfùq£= Ö°#)¿HÆÝEw|LyØJ G¦h	<GEèÌ\(jd×ðW6 ËÙÁ@L<y= ©±ròAxÎúý·	¸¸ ßÌrÏQ½ðlåjK=MYâ³õ7ÝH7w= NÀÀH¤«ò19å¶¿ÕÑè (ª ç»CÔ¶ÂuVÓz÷K6ÖFô>5?özÝ/^\óÎ»¶k[Ë©\Î¼òSÉ\E6tJ§qÝÔ1(õdðD#¿4Ü:hs°®ÚÓTS.+3ó4¤ª©~ìÁÔ¶Ü[<D äIÌjäÅVÖXÖs= 9äÜ&'æt%= DöHbs dI/|}vë§VÖXÖsøv)uÊõõ?¿Êß¼EÅÅ ¸=MQ_¹;Bâèµ¸Ë/ ¬f­ü=}y|lv:@¥¥hgY= üþôÉke(¥¹{üxûxVµ}ÇlÉ§ÐÆ vHH½iáp¨x= ëùÆ xÇ'ç(£ºy7:l Ï ]ºIÈÆæ| CÚù'ûûþàh£àv+W|G^g:HgO;@P·[ö= }Ä@]±¹åÙÏºVî³gKÐHl¥wé²ú	%¬²´i¸PúfÑâÞæLqRøÄ1ÛoÍç,5¨ú£ :"=M%í¡ÿ Î´ëÖÄÚ¤Víc¨k´íbRåSm¶¢)_XÍ´s£Ïøõu§1ÇGLqïÂìn°ë]¥Þ^Eï0p_15y*ãFS¤²è÷¢÷öÜT'ãõ/= Fx¾WÖâà9¯ÂÌsLúÝ4êý§¦-}·ÇN úÔ2 RèmRà7l¸= ¨>3·Ç]?= >½£¾nGÒ"HÙgÔÞ×ÈLà6wÛvÄ
üqîÇ{¿3^ßß]1ãìkø¤CÖv¦ùTòUB"dß¨9Xö)cHºÙ¶¿»%4"pRÅ~èlÀ%ÎÀ|2ÛQ[ñ¾â¶ß$Ù÷
H.$Ûø^H)ÓøÛwòÅÌåG°\î7µ;å= ~óèéª©aÉI¾!608ãÍ×¹¡ýÿÁ¨{{{Y>æÀÑQè×½Ã*ÜåK2,k±ñ0©mÁÚfvÀèëb«+Üa?¦©ãÖiì8	Ø¡J<#Ã¡½îzæ0¤ßüòºaó9VéiÑE§µ?J	ÊP)ô¹héjIGÀÌY)ì¹X)ô¹í¹õ9Y©øXËsv-¨æÓÁªCtî$¨ë©ÍÕøY³$øI«p^0ÍÚDÑ(>y4ßv+´ë[ñ= OV{oEg\ÃªÕï²??×-J+]ôí!0È¬ä.Ë6X$UÍøRS4p©qr1î@æÜ1ðFâg»¦HTF_hP~Á= UêEû¿2÷V"3P 2F²í>{£S½oOVÂñ_çkHX?öd?öd?öd?öta?ödð'77]DÈ:U°b"ÒC0|ëØSÓ|øo*O´ÞÅ1G£4,Ä·ð®§úµúwd,~ùxño4{òäJØí¤_®|uZçMÆ%d2zV©V¨RzÛ=}Üè¶^Þ¾ã¸uPÿÑWW:U(b¬R¢;þdkUa ´:¦xF9ØâTµÝÅ|ú²8u= ÆÉØr¼¾àø]MM+¤Ar×I_þ%XA ¶P¬&PÕvôa(Xü¿ióÓåp;à«&m&= ú%;ìî³-vâ(UQ"1V{%ý¯Ç¬Ðk5^OÈ¸ÛbÆ²0,uÐ×PýÉØq¾ßð_acqBäfÔ°ù¥z}%MèÈN0r¡¿ÉC#í)ÍBà»ä¥A%QûWO~"(nzU<QwDèYaP ÕÁ3Xì«X3Âôº\z qôWlìÖÈ1,,sÈ= lô¼ù§;P:zjóPz7ÉÀxñV¯®Èc0éÇ¥nb¡ pÕï´bTÂ±:¥n½a@©éæM¹]ç­wR³BeP¦¥5¦:í	3¹Øî*SÔ³hÝ/ß?ZÕ(2.2³<³Uë¿,[ákðìñ]ÈÑ¼ò]r¬+À®,¼ñVxÑ¬d\¢
}¤Æ¢4UòÑ6Çpþ% Pwiÿ/ë4[ðhöR7I¥øô¡ð©FÏ õÖï±[0Ë_ÆÒAöJ¯«v
}¡f¡2øJeçW4µÊEöWr@ZL²÷Ï ÿÐrÇÏãz= ÍbLúÑÈ¼¡HÂÐ·ì©§¢	=}Â¬6×hÁ2¼@ë4²ªÆKí=}¸¬M.ÑÖa';Pz,¬@9¢ÛßLt	ý³zaÔeÕÌSGI¥ËeèÿÑ|ªÂ[rGÐcÖz<%dxÞr5jû}Û- â2§[@åÕGj÷ë -ø§mí{¯Ñxú[DÑÀ{µO_~Víw³dÎr¯vUÄÑ°z¥[OEÖàÿôîgKvKåQ$MÂðùø°×ÍCQd¤z½÷l¦:©È èÌEâ0ùDØ«¦QFÁê;Â wïÎCó9Sa
á
©Á©èRÑp9¨?îàÛwËãÄ4AW-±Ý]G<o?-6Ôsy¿µÔó1Ý87C@^h1&ã>Ýî(Sôr}!G4É2
ëµÏèþò¿öRQµ©o2,QÑøGIñ¦ä¬òöÏi%£eàìþ»Ã%Ä/{¢?y´[ïI:uD%êÑðyãÙXvÑÌ2cJö §le$=MÈ÷}Þj%ªõ
½,¥<ÅÔ8[%í§3¤Ñ¼X,½Ìc&T9^
ï«,$|ºÏs ¬¶×È-\qÕÐÞR}6½ÎÃÐ¹w.¨¢Ýlh1xÉÂ®$:¡4ªfKvïxOÅÕ2¦¨û±Û¬·Jx¡n¸:1:×Ì
$ìa1ç,ècÜñ7
³ºP3Ñz«?süÑ j¯GJF ¬HùI= oßÊrÔ·ÓÕOB
¤:~ÏÅ7O¶chmË/ =}ì¯bRºr¢¼ª&Q=}]É%÷L\ÑØêýÈ"u3cG¬»Cª ¬6QæMGwmõ^2'¥N S¨¦÷ I¥ÀUêäð<Eä,'vq4Z#31	éÈ^HÝ@_d>êæ)âoî3wÔv¸À03ß^s(]ö³HÞçÛØßb|:Ý»¤äö"}¼:0Ê2l\UB2O´Ün%'JíIq$ÑÔ.ÏwJÉDB¬Ó*OH½w=MøÏ¼8zÄ6úd'×WþKð}IXøpÜãSVö%WøÕi¦nRµJ£Ñlò´¬W<èÐÞÅ{£ÌÒHy¡ÛÀ·Py³nÅKXÑL-KÐuwÓZþ@#(!XMÕ¢67^v¡!x3ëã×¦4nKaû&èA¤\ët÷ïàS(kÖ3~eÍÚª4ÜAì½v"ò¥8ÏÏV£ÛÌÇ¹¬!¢j³Ç^PÅûhëtëgp¤{F°|§$é}8Ë;2y§FpofEöîIÄ-o(MOE*/»¯ÓXúªøehI<mrÊ%IEàè"yÌs¼êót~µMÓUÝ!iÒMØxnÃ³h ÇOHù¶´kgæ-ã¸YoTXé§E±
Ho2]5á¿pA¥|Zàçxx¾Éþ8ì
{<
@Hänþ_Y=M¢¡øe ÈÊ¦{o,DÛ_eÍòzAWì1/Óã« ±c¢ï¬ÈY#çÑþEû÷q?mú-êEÙ=}ëÂæ.ø]ºz.¤¼¯âªMC¥ôt	(RÇOåù¤ÛàÚ½	dLb%f²tçÏ -
EËa)±
¤vhÈ^qäÏ$Z.ì4Æ02{HÍ}F¶´@váæR¤B¢r³^(ÓhÝF¾Ã4Ao(õá¬uè;¹´lÔyx0Àz÷hM£Ã¡úôæy¾â@19£ û|¿¼!û1^" ·ÅÔÙèè®üJs9½ZÝÀ­"K4^k>2x= Ù÷àxWÆ*1	eüxX1øÚ¿£©þH>pÓ_KTsè*{(îR4(a\Ãpðè>q 
ÞÈ~ã=M®ìú+êoìªkpÅ!î ®ÈÊyuâ	µp·Óßã¡òª­,¹Èîçk^eá
mGpkUÂ(ÀpV5BQ%XÑ»t³¶µC¤ÿ[±B[<µÍµÓ¹ßêàûÎÚS©u÷òõ{ff{¿ÁïoKh* ±F ÄNHlxâÊ®ëÁ¸ì)ã8=Mé¶=Mßªñê?·)Î§ëA¯	«²:¡C9ËFMY²¹-é+¿j.«=M¹èÌÎ°	óªð°*µ¹Î«Á­=MñIßÂËá¬	ÁªIwfjç{Ö£Â­¼q[_i¯ú(âgßUø:dvIÂHQtQm;,AÂL'2Û*X)A¤E¥vüï&SpzäùU\py|6mâæ¤ á¹¸eL(µÿd_G>+,ð¨S*óyBÎZ~.ºMbãÖ¯VCUZ^¿qFù¬àüèçìËiGãÑÀÀ(Ç¸¡W¢= áÁa¾ "ÇTøM}\Ê§/ï2§íÇêd
Þ¥à ¬__9o§½(
¾W£Ý0×iîM¬·(ÕFÐ¢;Xcâ¡7Ì=}Â²kÏanR_q°fÒ.OXaÈ4EéìOÕ±ìXääS*=M1jJv§1©wIÙ¸´·3àÛ¯ÇËÿ²C¼uÙIiÒÅå8P*S!µ%$Êm-wLUrÖ_èÁ.«ë ´q97²Êha_*OÜ0Ãìþ@]6o£âTf1V¨Ì8{ç÷©k×¢~9ÀåeRÂ"YïÏ5Cz<Ñ'¶löÆôÕîú>B),ß¦ý¥lo¶=}«'zéJ³ô±içù¶Kkb¥%qgë}¬åöÂjÜzpë;X»m/ÕüÉNl¢ï×Dblvg	%ß@m©{
®*%³P@¦Íðë:?2F³3®8@²zI2ï«¾¶/ñ.f-]Æ>sÚÐö[ªS ÜÞjQ|ÉdbñØÕ¦±uëÑË¦t£gYh¼8gújò¢= Gòh¸
~_qTçÉkÐÿ1¦¯üá© ºÂ7Éì%bC¤(0Ìº3fT(òa	Ø&ÅÔaP°äÂé=}¦8ùü¼®8ä²üyÑãLMC£üÕlî¾£V= ¡¤=M+Ë¸/T+ï¼ÿ<zòøwkôùÜ¿ùÕy&²muKüñI9¯'§K'Ñ5f9þvL?QÙ%oóì?;¡hï0¡<$!B¿pª¸äWð¸]àhÊÜ7ðì^O? »^°!J#Bu~[/;·õ~uiVÑýÀU/øÛª[½åæ#Eá(Os[25EÀ
ù×buLª*¤N¡uÃ<ÁíæKTØr=}ËLõµÔK<±µ§^Á(¾<¯uöÆ\ºh6UËÈT¾ù8VlãmÞÝõA*¸ÜÀò{{[ cÏmª0'Êm¡ß¬ôîÛKoáï¹Ý²ðç(ïR¡¾Ôð)@¹NWqìuD¸>J= qÂ[±\)Bõº(lS2U'WU#íÛVs÷ÓïåØM´Ãyð}åCcUÁ«×¬÷ÙbSS¢4fx»c4úú·ëû®gh8;2y¬ãz&í¢;Ãoô¾ºËÐ"ùª 
D¹6 î/ü ¯ê»{«x»¹ôÞ£ÀÔ@Úïz¨~wØéýè«¤1Õ"PãHE/¶)E~»¢4üzøõmÏxJ%8ÐU
S;![Sà= lÝ«t&à:âX~èÿè¤×d®×?=M¼R' X® Gñtn¹Æµ=MßrÝ¼å
#v ~zA$Q?èÍÿ|QÛræá6ì$(fdY;OfL¦Ú¼çùjr¢ÿqê
ÚZë?¿ÖJ9ÜI¾ÆÏD0æ>à±ã\Ö°r@o­P¢Gÿ»T^÷ûþRß_BØNP§oë?¢ÌwåOmÂeù¾M¿ý(¸l=M:²» úw¿8Lbn~V'=Mô4P5lÔÇI@¹ù¬pDÆ36> çpÙä"Kó×}&=MñkÍ1ÄwÔÐ)·HFÿ:õ¸u)>ä(Z ¥ÐHHAãýØxâÕ\Òìß«}Gn\=}ñÈ(7®+Á¬ê²­BA*÷ü¹|Ís~ëF­sÔ¶UÞ3}ªoõp8¼PòÌ³A*ÜÛßdÐ3Æt!2D¾ÞÅñÐYS6õ/.Y-îµA= Lg>°= {À¯¯j=}R$(z4­Ôh®P= ;?PFÄcfX¬¬óáDðÅ»³qòNXðD´ ²ªQþ¬Çbp2Ä~É³ÞFc!x&å5Wn»üùçB,¥EVÚ±óq{ Ñ
^}[ùõ<ÈffÁØÔÔ²8ã&{æ¡.ò{g8=MÜ#\%RÒDÑì&ó5þ¢7ü­£§û aÞïé6ü¡Þ@ÃCn0ú\Øÿã{©Ë p@@[WdÀÀY¨è
ÄoL¦¢aÛNèæû%oJ)ïonõîo
¡o1ÌP2&kSDQ»éfEà»ïZ»õoGªÝÞ"Ø Þr3UAFHlXåtµæPWÌM"E.ãAxX%yÓ#6Þ5(g©ðÍ°¡7Ä¨$ñbE(,|"zð2·§#Q/!ðI¬G¦0ð¢õ¢ì×V\ÌUÚÕk	RÂ[$ysÀÞphC¬¦dP¤/DÉiòuø¥v:ÿc°Äú,®§¸vþ-.@f}Ñ«Àô¼×è×»ÿPÑuû&áq°Lù&µ¯ygïsØä%(¼ÑBÚ­¡T6´£òäý#RõüáWy´ýÕÉNÄÃ­Õ Îóu¡<$È­6d²@µîU0 ~Ëº7Þ0O»ª¥Ê{­VòÐÜ;8¯Ò\×M<Êb= ÂÁ§¤OU¾5d;)±è¾¯~|×]&(»F q9¿íRkÂå'RWDuA¬¹v@oºKØ'éLôèµëÀ<nÓÃÇOÔ!-B¡OFo¯ýû+= K¢eä¨fDÇK¹lXzød#öäêÿ'ö¬VBïðµUÿ'@Åd¿øhÁäH}%¢xûFkãê=})ìoË3?"a»ìúDpÖ1D§#c!ÃìÿsÌóbr1¼<·^½57³;à¯õ9L°åùL¸y¬	©Ë¬±ë¬
­ÛÑ¬µûé¤³½q¹éKÄ¥ùKÀaÒ¸^ÎeÝñYNÛ~<Î^ýL=}b¦ª× dl~JÙÁNRÝÃVnN[VXjý$ï£ËQz´.æïvol&Ò°\kC¯k¸¸;'«¶ãíOKN« '¡úo^NÁéüÐçz8z§¿´¼#üd©ûqzCÏ¬VÈ÷CwÂ|aZ_@gýñ¯¶èöÚåÏötNoHÞú6ÚU©K©¡kÑ©ª²-jËâmÐÎÙo,nR·èòé{Q,³9.?èôdVnòBÿDkÛ3Ye^Þò^¹?/Ë¥ÕÚ^9NÿÄ ¿H÷=  `});

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
   asm["o"];
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
            Uint8Array
          );

          this._output = this._common.allocateTypedArray(
            this._outputChannels * this._outputChannelSize,
            Float32Array
          );

          this._inputPosition = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);
          this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);

          this._decoder = this._common.wasm["_mpeg_frame_decoder_create"]();
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
      this._common.wasm["_mpeg_frame_decoder_destroy"](this._decoder);
      this._common.wasm["_free"](this._decoder);

      this._common.free();
    };

    this._decode = (data, decodeInterval) => {
      if (!(data instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof data
        );

      this._input.buf.set(data);
      this._inputPosition.buf[0] = 0;
      this._samplesDecoded.buf[0] = 0;

      const error = this._common.wasm["_mpeg_decode_interleaved"](
        this._decoder,
        this._input.ptr,
        data.length,
        this._inputPosition.ptr,
        decodeInterval,
        this._output.ptr,
        this._outputChannelSize,
        this._samplesDecoded.ptr,
        this._sampleRateBytes.ptr,
        this._errorStringPtr.ptr
      );

      const errors = [];

      if (error) {
        const message =
          error + " " + this._common.codeToString(this._errorStringPtr.buf[0]);

        console.error("mpg123-decoder: " + message);
        this._common.addError(
          errors,
          message,
          this._inputPosition.buf[0],
          this._frameNumber,
          this._inputBytes,
          this._outputSamples
        );
      }

      const samplesDecoded = this._samplesDecoded.buf[0];
      this._sampleRate = this._sampleRateBytes.buf[0];

      this._inputBytes += this._inputPosition.buf[0];
      this._outputSamples += samplesDecoded;

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        errors,
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
        errors = [],
        samples = 0,
        offset = 0;

      for (; offset < data.length; offset += this._inputPosition.buf[0]) {
        const decoded = this._decode(
          data.subarray(offset, offset + this._input.len),
          48
        );

        output.push(decoded.channelData);
        errors = errors.concat(decoded.errors);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        errors,
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    this.decodeFrame = (mpegFrame) => {
      const decoded = this._decode(mpegFrame, mpegFrame.length);
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
