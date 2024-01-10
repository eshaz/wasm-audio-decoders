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
                  wasmString,
                ).then((data) => WebAssembly.compile(data));
              } else {
                module = WebAssembly.compile(
                  WASMAudioDecoderCommon.decodeDynString(wasmString),
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

        crc32Table: {
          value: (() => {
            let crc32Table = new Int32Array(256),
              i,
              j,
              c;

            for (i = 0; i < 256; i++) {
              for (c = i << 24, j = 8; j > 0; --j)
                c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
              crc32Table[i] = c;
            }
            return crc32Table;
          })(),
        },

        decodeDynString: {
          value(source) {
            let output = new uint8Array(source.length);
            let offset = parseInt(source.substring(11, 13), 16);
            let offsetReverse = 256 - offset;

            let crcIdx,
              escaped = false,
              byteIndex = 0,
              byte,
              i = 21,
              expectedCrc,
              resultCrc = 0xffffffff;

            for (; i < source.length; i++) {
              byte = source.charCodeAt(i);

              if (byte === 61 && !escaped) {
                escaped = true;
                continue;
              }

              // work around for encoded strings that are UTF escaped
              if (
                byte === 92 && // /
                i < source.length - 5
              ) {
                const secondCharacter = source.charCodeAt(i + 1);

                if (
                  secondCharacter === 117 || // u
                  secondCharacter === 85 //     U
                ) {
                  byte = parseInt(source.substring(i + 2, i + 6), 16);
                  i += 5;
                }
              }

              if (escaped) {
                escaped = false;
                byte -= 64;
              }

              output[byteIndex] =
                byte < offset && byte > 0 ? byte + offsetReverse : byte - offset;

              resultCrc =
                (resultCrc << 8) ^
                WASMAudioDecoderCommon.crc32Table[
                  ((resultCrc >> 24) ^ output[byteIndex++]) & 255
                ];
            }

            // expected crc
            for (crcIdx = 0; crcIdx <= 8; crcIdx += 2)
              expectedCrc |=
                parseInt(source.substring(13 + crcIdx, 15 + crcIdx), 16) <<
                (crcIdx * 4);

            if (expectedCrc !== resultCrc)
              throw new Error("WASM string decode failed crc32 validation");

            return output.subarray(0, byteIndex);
          },
        },

        inflateDynEncodeString: {
          value(source) {
            source = WASMAudioDecoderCommon.decodeDynString(source);

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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode0134a9488ad5Â9ªIuDyÃpõiì÷Jæ9ÂD«õ¡²+ûJõ2b°Ñ«FMroÃ¼¤«Ò¦U8ö](ëÉ0ãÓ~öcötåv We'ºÖIm#WÄN¢Ô}2ZV8Nçàh³^U3lï×Å\¥u¯= À£<a?5ÀE"kL²FSåÇñY:ùÅFóü#wm÷@?{ø0Üû= pGÍÈ"aãÕËQÍWæð"åf	uòÎiiÑ­Ù>Ùþ©à«öºFîõî6j©ÇãnjÛ;xÑË¿Æ|}µË}«
µµ®Ï¶!oP)ZH]VÉl}ÆE	}Ææøµ7:¡¡DL.(Üà'õ¶]IÚ6gd_I§<'up¿Fþ·üD)2ÿâ$ÅC¬üWR§ÏK#dpfn®ËÅåå¯@=}­úø§$ÆðA£Í²û¯r$ÅOØiâ±­ÄòÒÞ?);_5RûÅÙ¿îzqék¾Éó"Ùd³¦JÙmeþy
e' ÆPúÆPÁH!eg,vnÎZ/ÌÍ­ÍÍ=M+3g!ÅÂò£îq^®#ãÎE©É±	Û¾W1´Ü_Á_A¿-Å¢r¡%ªk'= 'ÝÓá0¦\Ë=MÖx/%êËÑ>RxßòÁKZw²êF	½ÊBN¿lªÞ=M1*É¶"]'\ÐeäërËûg¥çîìü¢?q(kÍ·ÉxÍfµÈ!0üÔ¢Y=M Kn×7É¥H¾®9}kW
ÂÌK\É½ý² XÿoÊdòßÍôk¯e0Ú?d¼ÏM2Ê¿ee³=MÎÉÁÛÍegÄî¥ðÜKÿN¿Âsïæ¨H §Wjsææ¨¦ÅçhöáÊµÑ?Üÿ!}à´Ìu¿(¾åZ½ÖôÀ^4/ª9¢xµv½ák{wBÁ* µfjö¿õKe	©ãdDçó×Ay;üémÐ,»*ø3ÝwÔI2áífÑ°Ó#¢ÊÝS#aÓ]}âæÓr^§X	Vb¤_-ÍBºÄ¹³j
ÕÞrCÞXÉ®;mo= >?Å=M%)ä¨ÓðlÂYDAoÙ^ª|ÇhaåcýÂ¢mr_ybo°ÕCØáUÝ°Îlb©ÿÖY×2¥Ìí×kýëÛ?GmCA^&-ò<öC_«bÉËÚè7»¶½d)mÂêPÝk!÷Ùÿî¹ÊÎhÆêqJ7§Ò-ròËa(ïdè¯µ:ÒR ¬«¤rGLÁÔ&Q Y7b=Mw»ª@Ù=}â¢=}ÿõãàêîG{®Ø®ANpÔÑ 6A=}MÛ¬K2 Ò#;óî¿º/|áVÂØÕÎÎ¿gñ¸æb:¨ã¤\ÕøÖ¤	i¼Rkzþ®62ñÑâgç8B© ¬Áù×âÂ»¬àÔAA!fÆj÷»ø~R/-r}¾Ïz²¢õ'r][#)>~²ZKLJ©P¹õ½L=}Æ*£#¹÷q»5ÝDqFî@,)ïùÌÖañl¹Z@Ê¹´Ì­¾¸$î^H/¡F¸8- EáÀì³/á¨ÛhØv(«ÿ 3û£	ÙíM@A¹bP?Xü2óx³úÈ
JÛuïÅÎë+êÛ\?Ñã÷Ýð(}#%L¬¡ô±½*ÛZ,4+É«Ñ><J:a)B½= ÉX;õ¹ìý°Ë<¾®ÍÍî¸M{ÛÌé^¼f?½¡¯;qTÜtJàÈÈ\?Çu
dG]Jòï|}D.¨fÿh}ã~iwþ/ÄÍd#TÓUÿ~@ ïïU",«Vµ©%ÊÛur£ã3o>²Ö­.#"µã¨¼3ªTwkl³/X0Ëö/2®CÐ®m²¿øý¸ 	0äÄçÿJ_¹tµÑÖ&Ï+=MÐ
´LîÔJ=M5ÚÃmU ñ$5~»W=}j²lË®Õ{jÏõÿRýÆHb¹
¨ÝÜ}¾b=M4aÎô7	aO7ò"çíYfÞTÇX0¦_|y²êùÍÀGå6xdU{R·'ã¤¿¥HÌXdP]ùÄ%¹©eÇ-"ñdiJ= =}&¶4Âêd DÏkç}1Ñº¥ÂzÁnzfÎ ¿XÔBqjêõ¼¨X¢ÑMl'Æ¹D½*ÆâæjöëTaxÁÊØU×Õs7[¨;4Y=MVÊ0Äøy4dÞ®¡O@E÷èêQÈµá Jtå:EÁÜÚÊÚªS_Üa= Iâ:;ÞbÜoNÀX[:T6s«ÊýVIÒàó¸Lw á6²yZ)EHLÖd×ZW,[¨3u@D{WVÂåß ËK=}¿cÓ×hfî5!¤áªýÚÊ= \YVÖã0§ÎAÈwxÈ©LÄ%pýàûøóL{ãJZë¤:;AáÙµ?ÎÊ¥z7úôª;EÿB({åî||QøÀ°_¤cÀ»]<-ròÅÓM²B¹ ¿·ñaWLí¼;O*7Xõ>IÔù¥*
8 ÷ÍpT¼rG
Ý³ÚàÀôÃAGf3¢ÿ(,Zz4SmÈÖukâ= P?]@;7±¸]ý°Ó*zdû~±iyÄWhºe¶i<vNcP«ôY6Çk¸M®? ¤PP= ®:¼w¥~'d4>ßjÛÈiCÑlÙ¾ÓÐÓ½õÈN¨ô .N#T"SñÌÒÁ<RAJÞËxJ¸ë¤õC«;ßVZt~6¶¤rNëë¨¼j:ûdnºôùtªÇFQçeãBuüS-HPÄÝÔ²pòkoQëc= ·ÐµÑ¡Åë|³$\>0Sal?·øj fÎÅz|ë\û[3sÇß:QÆß£È5[¥3þw×Lg^ÁªÌ¯üëxPü÷®dZu-á~y;õÖ
ÍÉE®}×kuA´G[ù ÁqúYúR÷ôz§l°óÉßµé= ì¿pgzTõTOC¢zØt(·ÈÐ¢¥ÒOi k2©xÔ	¤PBsú£ä*W×¦¨ÞwrÂ> ; JUô\éýª2Fj³Q zÑZPe÷ÅÆ#i45LÞ´ÆK\JÚ¦×øÞ%*$äø¶Oûú¢ÚàÀâ£¸ªÃ³ûùu±!2 Wñ.ÿäRU±¨°k(O~»KÙ¡Þ¤¦åOçððÐ¼ùÒå¶mãø*xyey#5½Ëâ7¸®©³*= d^Æ4?Ql=M£[ÅûÖR?<¬5ÇtÐn*A$}*äåÌ&¼:ç÷¨5{ä#ïëè«G3ìc¿íèsÿ1çD×@©u'ïÖõý¹XS±BÓà>=MW?uXîVö¥b×æ5x¿NöÎgä%¢£½t=}HþLò<Á¶ïÊÃ¾¿àñB×yN¾éE"Ð= W¬A>¾:BA<êdY{lÌ^x2ÅÂÇ¿KÜÐßMÜqt¤ñ7©ùÈíVfXÒfÂÉþ|oâÁÁú|n¢Á¡ê|ñþð|hfd{º¶íl{øUÐ #õö@Ô\Å;ÅQ_°(sÒýt%Äyþ$9þ¡ëf(úöú³ðRìAªw½.É=MkjçkM¢ø¢©aex1fÊÂÍ?M/ó3ò[rE'syÝÉìý2DÝ+¾.Ù°¶Ò3Ï#©5-.£/»äáB«2y×Vb¼uöÎ¸í°ß5BuIbhfKBrf±bóPÑ+×U-ß¡pnä&³lój&¾¹z9ÓKë= «3¢9¨äiH)¥´SãÑXH¾!°¾ËÌ+Ísy5¯»P@å,Ü¥¨ÎÕ:Ën-Ñ«åÆÓv·
Ã½n$I§#°) k±YÃQ¬gû0¹¹'RG±*9ý"n)h²¢'GKc2ÿ-ûBÜ$¯+(í§²joÞt×û¼ºzþ¢%öã²(Ã²O^#­#ó*WÞh,ýÃñ0-çÃQì3{22Ý»ÖâC\ZÑ@å~/#r¼â@©±®ìâðñ¤\z9 = fSòÜrGÐj¦¤ÂViäVüÍm®Vº(Ë9´½ËA'Ç£P@­åLA»1Y[rHZvÛÄüøÂ6ú°=}å$TÈFQ-öÃ_%üQì-¢ö	dx= h¿2èÌjµJæõÇ¯ªëPvÅ¸ìØJo¹­? c{4Ã0þ87ÆVo×uëwz 	ÔUå¤÷	Q3)jîÏc¡KeonxI%É´Î3ÈÎM¹Æ5ÌÕã¿Zé ;è>o«ÙÔà:¯	ÿÃI¾¬Ð=}áGR÷êf,ú¹øØ3löÅp/ôÅÊÞszs3þ×u#	µ¥_·³+ËK¾Ç2Oûõ6ºíÓñ©10=Ms×½©tÿ¾K ñ[ÂyKê·íÈä3iRFª=}ü(¬a)6¬OöJ£²¥sÚï,µ¸ÿN_½£pO¦aä!´¡ñõ¡³úe%M×ç8	g-¨¬õg H/gBþÿQ,hnrm°n/6×3Q<d-Ü5á/±««2±lÕWÐ\ j4{48{²?¶³*Ø©Ù[á;è!B-Læ@sÛsîû¬Áp=d{Çª2Kò¤Iø/2%2°-h÷
µsòßó2±,Bh³&gÓ%¯'sp±B!JqÛó#o¢/øâw+1øáû1	¨@Ù®Ðr2 júííåûBnTâäÕd=}íkõÈGõÈÉN_SÖ¤Ãñ%¨4ö[±ÓÕø¸XÎ Ê:ýêFi² ´ÿScùÝÀÆ¸ð{M!T¶Ä²ÿM7NeÝÌ´Z|øÃµÌ¢Nú= }Å¿~v¢ù3Eð½¬ÇEÅêkÂ)øÛÕi½ÛÕ[ùß×7ò"ÏLÊÂFdÆHÔ]À»þ'q-nõººáaêj·=MYzÆ3êWF ¯I&¹ØÆ/Á¾ø²Ç{^£9¹XL×ïªä1PE=} DîÌ>î¼Ý?uÿyhõJh:À(nK
¡8YîvU¸= Äæ=MÙê'wÇý^´gX¶0½}òçæµKÄ3v$Íá Aü@)zItÕ-×¬û¬ÛæIE@A4¸zbvMWÂzúÀtMQ¨Ä¼7Au;Sf¥wt§Qrdiå	uãê¿0PHùYn~6,S ²ìÝ£,^üvûÊW:Ö­±¥fccg~¤z®³D:Å¯òYE»ÍÍCöÀªâ£íª¢	t_\~èPzaÚÆÉ<Ò>è üéú¨¿
\ÞçÉYÞÍ×ÌÝ uAaÇhýè:mQ{»ÚÌÚáMÜs»A½ÝhäÚÅ^ÁéHühæÚÞÔÍê@G¨Ma8&Z
 KjxÏÝ.4UÕ ámt¼<©Cî
 ­D×õØ
à=}ÜFQÚ|Ìi§6VÕõÎ}C.Lg	¹E{Øi¥.ù×yÁjsýÏ=M(·ðÍýÏ-(Áð|ýÏù(¹ð~#¬ kÁ(ÅðÍÓý{ÿd×Æ²YfÆ¼ômèöv~b1a[1ÀÍ
dÑ²É·l×Èe(R#üt	ÙCZ×AÎ|Ó$³¸NVºÌ£Õ¹b¦ËÝ[h¥Ä7æñ·UøîÃD©º¬BÙ?Pø@fÒÀ¼K¹I§}Úô¿?x4y´P=uº±&Ïáí×;öpÏJ,ã¥&Æ°AÈ@z{QøÜÖ L½Ò¤x
ôý¢¶NWÆ=Mª7¸Àî²^åîvFaõô¿§xÖ<vùyýØÃfÝ^f$ ýçYU@Úät=}7Ü´AoÖ¾ÅÄÞ×E¿=MF®ù8Åø8Ôc¯566ªØiÉXÿN@ðlwøôÃ3Bj$U:NÖ0äi
ÈyrÞw½Ý¸©AÆë¶y(ÄeYLVtî³»£Ä3Pryx´÷Q³Ø×{~3P& @·Úp¡5­= *Úê"VÂ¯d$8EA¥Ö ÜàØáNÈµ¯Ò!]v	=}'|Dì3]ó©ûreçd$LEe¾3= ?½ñàb9M¬qçþdLØÿ§¼3Ó'q0K§36û½÷©+
ñ	áÊÉUtza8ûjTÉäY=MúdãðëÉÀüN
x?= ¼fÿÍ\êPö~N#ç»']øõVê¥GLÖ ÌMõpÐë¹ýÛ0÷÷X82/+ÛëRÊý±p+=MÓ+r¯#§9-z%XT[¸Æ4¾áTùäßDj"àOìÝX%?lmÁTS:áI¼[6mVÈ<9­_÷êV= §
ìÅ,-"ïô-tòî¶ðpõFü5Õ8ëF¨i·â:½(÷úÌ­¤>1éÁ+«ÌfÈ÷HÓ®@K~:R¬#39ÎJ#ëa
¥øÑ° §0K@ÖÑâ)¦Çö©HÝ» ¦£°²öéKü¤ÓUa÷qðÅyk9îÕ{0VHJ=Mê-¥¶Ó¦µ¨7)$÷¥É8ÙcBÈª$«y'DéKÐ0¡«úïªðW)ùÄÿºTüùw2CÌumñ;ß!ëA* JæËrø ño1)êÐ#wÆ%âM$Ýa1ðþÕGÆ?#g¦W8k<ÃL}¶ gÂÙYÊ×ÃÏ@¹µûAúò¥wL|.(Qö8=}D-%[ÃÍ{RkñFªj= Ö¦cÃùH>¥EÃeôr'ì]¼ÒyqsºìÓe¦ÌîN­WK{²õÈ¯ú!@4é¥ã¦
þùRü¥6] I¤aáUùús(¸]VRÖ¯¹¯´D¹é|FP²ëEýûÍ½oX÷¾$HðN'¸lE(H¶ä
"µ¡X*"d;XÁÒóÒ²ÐÛwkÖ.Iôü¢¹yñ&_vI/ÕS6?´yòëÁ)6Üú}ù?v?'Ä]¨>wÅHÜ)wLÂF+EÒÜDïL©]vÈZsbûqµDÙ ¾©~v =M@xLK\KSkw8;à6êÍ=Mâ)¿Áð¬âd'»Q|ýçÀVs§×^ jH¬§¬M£Ëtäµg²ò]VÍ¥:@ê£zä,«@8üq*P:uªEÌ%k= =uÇbÑ
~W= - ?TaOë±mæÂúZGñ$¦ï$m¦ªu2ù+Íf±mò$²y|BªxCÍqÃ»Ù%Q¸'»Ð:|/QÌvú:¦¾­HÕ;x¢þp¡½¯ú£@upÐ,n?p5$(ÐpÆíVMHeË.ãGÖÈ-«Èß¤BU}*Ðk­å§,Æâ·rÕ ¥Å||¤ÑzÊª}@zöLÃÇyÌMtS©Zô¾º$hzû	6Zl
IÌÓCqn$6Æ0uZ×ÿédq-¬P©Þs1ÌEºQ®= "XYs=Mº<*ý¥{MÔ½RGë¸$M¾Á,ò½X¼z¿díì¥hB­ø§¤ÜÐø¨´íÉtçñ¶KÙ®,O	ÚtS(+ÊÙõõHpøÏjbá+,X»HbG¼ó¥Ú6Ñg¯cëÃöÁNlBý3å®Æ-a¾±i=MG±±rý:+¤¯yú'ôß áÃçÉBÀß«7ØHç=}J¨ÎÛÏÆ{7c{\×÷Dkpn¦¸7("y¹dwÈë®;PÉ¥[iBª/tÇCÿûÆmÕ®¯¬¹1ôQúËsS$É% Usðtçqñ~ÏÁAùA öx¨ó$³z5vÏ>ÚF#ìöåUAÞ±PØPX]zmadÊ-Ê+Ò@ºà%Ï¼¯³¤ö/#&%LN&5A­Þ=}óÃoÞ¥?EH»ÐK«>EàSN¡Ø¹ªf¦} .²+6Z{<ç¦TIwu6áÖø:×N
FùEâlVFRoÈ¶Òx$é Ú|½_6z:ç9ÿ·;(þë0O|¸LQè¨\Cï¾­x¸O&L7½+{ÓC¸SÉ2ªãÁØEí)÷&èDZf+@ciå»J=}¢ntò!n¶GzJ¦4ÕWrEM7È©bOÄ#16MÇÅ5&C8[´kçHeô{8Ö>ðùH|$2D<<übLÊ«qM@uü !b}À^GÓµ·ìx>ó)J=Mó^·ôÙîËGLv=MóuÍò¢)e§ß$PÆnl/n®×m£³òà=}ÎýO±BOsì¼(ñJ/Ê4D@@%&ôß/QýÔÿ6EûÓ<4
 uúfþTz[ØÊÀ1îVõCÉ¯MGý93ëx£ç*A1­ü?<ìÛ¾*®xÖX8àÓ<6 £iÁnúVCwª¸UÎ¬JGËqpyûèüEÆÄ>*¤ëÁ(Ò^CBÒ@Êå@cûãÈÕëM_2óÄÄ®D".Ub÷4k=UexG8¾L±[ou¸+:}È/)f÷ð1Câlº= xÀ^= = VûçHÅÒVâ¸,¬Í.å B?D@ÇÞ8ØªÒÛÙÕæy!Do¹DçÖ¬Ú¥\-vÈ½h*ýæð<ë]Åþryé ÇMýrMÅ±vðy0Mæe·a@@\ ðå©´v6fõ9¿Sûä=}ó A´:auí"ßZ·®àÛKiYtç Õ<¤X^û y|fO"Ï&¤ú_/þ¾+6#1cqÇï<ãò#0ø#1Ça	A*ÉãÜÓüáªª¸<.å9%0Cà12/ç³0vEñ>ÂD1±³Ï3Ó{²dÃU5+¿	9-·LSSÊ^ß8>éF=}V.Õl54¶Ð?7òbÿCÕ6ÿçw%îFáEKÄC3ÔøËµzÂ·g¹!$/¾ ûYnERÃ¿q4¹çhÄPëq-ï¸TÿWCÆ?a7^ä|Ëå@2Øèw|-#MV¼¢0KïL¾¹;mcrÄ6L­}£äBén.rnVDÉÛô}}â?X&ª¼a7ùÞ:Rd>L:ò°U3àCm= K9v=}ÏFu¾í**p*¸§%iÆÔðHíßþ,>Vª_$Í¹#	=}¸yê@4U£ËØß ¬rIBÕÑ{³%|(^í««öz­Ô<ß¸Ó4&ù­.Mº6u§ùTx©òöX\þªªPJëP/´«îùaW;¤ µCm3­ë6¿y?ß¥VZÂäíýÏÄâkí{$í¶ùqjH4¡ë¨ïè£Þ°üâòma®væòy­j#	<ré{.áqxªFêÌúJé	Å°¾[üê·¼|r.	ÙèGàsÙèË{æà;´D®U0	ìªè]¶@/âóµÉÎwkNâ5C¹àÏ+©8ÎtÖ0þ+#ûÕ;|Õ?íâyh= ½Áx¯«Âá+nõNäÙ'ÂØl,= a-= ÿÒÅòÀb)á&{ÖÞÌ
§!Öy0ô§Ö)Ø(= çÀNÙàÀé§xöªE®ëpaÑ¥àÑÓç!ß3ôeÀ£ÀÂp¢AÔ?ç}B²H«eU JQËüØËæ\]:g­.Èú}SbÏîWÞMaÇ6Ç9g¨QùÅ=}âÇ¸úxÖ:6àLIeË7IzqõåXÑYÑ±s	I4kÅ­OËÖ¦fYÙ7Ähø{]ÉÞi.:Þn8EÞG×¶çÎø÷ a¹0÷ïo=MÇµc÷Íá(ëoÊ}É¢©Ì)£_IìNIÊ]Cò[ª5ú+°.H·KòÉ­Ü¼æ!) ãíb§,ÑR¡ÓÞäJÛt>M½Ví^= úÏaY1HvY<]£í¢O+KèYÇ´=}XÍ×ÈÝÞâ±ûtÆ¹=Mª=}ÂæT
kí	u@»$E:­ÆV/ÊìÂ ~XF 0®Us«ÀÛcó%µÀôDÑn Uv÷¥F4zSáÆ5Ñ;ç¬I+×´èãäõþb¢@]*ýêtQ3÷Z¡ â©= £·#°©.Ç2Þñó[ß3,ÏK²°S¤¦pªò$Ï«#2*KY"rò§ûþs{PVjÒ¬ýC#-©Åbè=}9#VCRÄ³p¬àsHî9?ü<13J7E«!ßR/Ýý+¢1U ç«ÀÛFÚC= 2ä¨¢=}Hb°-(u7!&]n8#*6ªNS0nÒ¶w¡ÂÉþéSbn«ËÓ÷$³5í2Q=M,"ª¯+q¦ ×àXÑH>_ÏUüî2(»Xü]w(¥|t0òÆ¤k(6S=}ÑùM{ZÖ4òn# x¼ü±©4à¹d­]·$Ñ9BÛºÑ2¬Wc-ª§ À_÷zä´¤Ã&qÚ^kÿmT_·¨´F¯ß­êÃatåÙ(aO»D$nð6Q2§Gc9Çþ-Ú±ËÞ¹ÃPáþüé¸'fÈ wkBä3Ù_ùv¡ÅÙ|NÍê×%Ð&LÑPf ûça= r9ööÇ@?(Ê]©Å±}|[¯Ò1L»|%öáþe4·é4+Ñ>2Z¶£E?nø	Ü9hý9R(í³àfûgµ3òhÃ¡ã(µôæñá=Mµût"âf8»ÔOªêâ¦Ýå;TVæS¨´¾»V»l¾îÉñbbæ£oÝ©À¶y7o¶:jéÎ^ùxwÉ0úØÎ%å[= "Jî­;TÝ6 Ý£:	OI³O^øæ§I6ºR^niEØ_hc4hQDivÕ ò\oÀ¢ª^^IÉò^Ã>zWµ}¸NÐ3bhå ïþs,ðÞn&=}Õ«1z÷pÔbçdèóYÄ=M1:ä½æì£ì*ÉÏmò97ô¦ÞøÄJêÐI5(ôï\gxÜèNË{²jz®lõEà
=M:÷WØOXJÄ´oö<Ú´5ºÃÍßHÝÁföºî@¡¬\ç·_âg0F¹ia7¯ôÂÀf,»´4ÞÒõcU/"-YÕ&ö§%D£E³:óXþc=}Ë´,àmÿ,YÅøªÍ(ÃÍ;òð;Z½Tæ²$YL.¥5IÀ¸g¸Ä ´ÞQaVñå¤¿ªp¹dúw£m·HÍÅII×Ý= r}E×:Tkmuaäñà¼Þ öËæÒªx_¨êsèÈáÎªx_¨zðy°yuóõËæAòÈn¯u°]	BK	µÒU¿æÂMu£lÌ¬&\8°p9+Xxîóc^½ íîÖF=M'«ùî'åhvÑÆ!k²ä½¥­±)¦}F:çWïê.^ZâQ´¿qÄÁîy'$ Ö(Fõ,.§ýkÈÅI/H¾IÕ»A,­W©&'ø<2k;YjÖíqSLë%0HªoÛ MJ¹îÒð£íeÕogZÖ¬sÓò²##ÜkfZâñ³jÿtd3è:÷Di=}ü'LJÈÊêrt:AÌóv/>þó(>Ñè9ÒùÒ¥¿ñË³O¿ê4¯t¡6î pàGj#¯~KVÚû3 Õ«³i¤RàÌDt;Üä/Õ~bOÕ³9=MÌ,ÃÕ,8qª3\L+»<ðGÊ£lvl¹xoÇÐjwX»ÅÏõM°ú,ÐÛMmi§r¡ÞÐ¿Î'½^Ýg§R£pdàHýr 2öÉdñàwôÀÎ©õH±t¼iUÄùì<*¹*!îãöêó:¦QË MÐrñLGH¾]ÆùH_qr;½ÃL*J'MdäËjNIæá)êÔo7£Sb¸Õ	lÆ0x4Ì´þãhvqûÄª&´G_Y
mM§\ìLìfi uíÉ/&]¼u_BH\!¾ÙÙ¼V£/Êº;*Dä B¼¤¨áDcÅûx¦pù>Ëí}ý7uò=MònÎv2
êÓ= ¡su©@M\e/>d}¥kAK6}p¢Áï|ákáueº)JXæüúÍ?Owe6¦@óX~ëÎó>EW6FL2	JSÿ£áOPþ-×ÅÙ-¶½@h°]%¡/­J^@ Y »½[*²5cØ¬JLª\8¼°¿EØ¸(¸(±y³8ÝC|Z#÷VÈt?i= ©ÂÝüOÊÖé;R¼NÜf¬þï °ñå-í-'UÃVTx?:U¬@ïâ¹Õa5¥Òs(ïç¤ìö$÷FÃ éÍà1ÂÕÏ¿òÐð8ÙòÀËÈ'z¤vQ¨û¨«UÄê×¾yâ£Æ¦A6ÙÍ?7è½CøM~·ÆÒÆ Æ÷Gn¤xË¨Þ×jmg©[¹¹ÿVé?+µÀäÌØi(®®ðnyÇoÓw]+Ëã¬Eq|¥j¸uõ@í	{Ý@]~ÿÓÖ÷Ô/mÙ4±|¬e¹7m©°4¤põÜ[rßF¸HEk ¸Ó ìi'r=}Ó$Wkr«2¶{¼«×I~?FV­³8Göv.o>T±áH/¼¸ÐZ;OMCk^à}xTÚúìF¥Xó?ZÒ¬P	]ã¸áXö,få½¯Ûö¬6eD E<íÒVn+¿ë8·=}DTI'Øýîà>Ðìh-áµBæß¹ÿî@4æ#Dªéxmæ!@(­ÑÙq[^ëæ_ÔYAÅ©uu¿ÄIôÿ ©Dð¨ïelæW)t2 ¥¬ÓíRý Rÿ9§<iÙ9F§·h15m¢ËRÊSÏ|£4\$¾ÙAV4ß,8Èï¦·ß¥,6üà(YÁ-'Ú#+¾²Û@É¤úE%lµ½Yíä¶:j¦:=}J%Xm~ñÄXÊ¦sÿº=M©^EÜùKÈã@ú-ñ§þx$6Ï­¬É°dôúÛÑcÕåNÏMÉw#ÏñFÓF}Èa Ì7zÙº¿9Ðc>å±µÝV}ñmiZ6¤¦ònÛÔÖ>âÜúuiÆz_õIC>éÿ_º--m çNµ«ah§aÚ.oâ,º­ÇØèÆäÙL	B÷~·-¹ºFñ]´sFKË4³¥º¤?gzÙQJzJÀ-ö!é£êLUÈE!8åà[].áÞºôTjBòö¾*vÒ8°í²;¼&nÖåÎÃËZÓ|õíÇ ²:	ÕãLFaôä÷;|¨*Ó-<æÀØLMÿª¢àø\	«ãÇ®«&gW^yfñx,ð!T»poIÒIÙKj¢1y#^µ+ìë"ÔnÚXÕ[.ÜËEs'Æ\à¸0ÁÕãÚ,TYÖHtGI9û-ê@àt=MM~á4ñr^&)ùLº~ûéÜììZñGK:å8/é¤Îî¾>¾Ä(*izi!ÐqD7	ùéL~%),.¨|ÈØÞV©U K<%©tFÖÃw3¼jâÇ"¾i2-ëõ í1²á®ê¾&Iïºã0r¹?¤ÿ8ª{°mHþ·Ê6¢$¬±ÿ¾yÇ¾.ìËVwúå¿wMúDÔj¡úÜ *NTA<1büÿèæ\l2Û>¥7A\wf²$²W¯= #áÿ2c)ok|°BF,Üt6Ó<û&þ3OÏN£ÁÁÁéå¥li	ÍfÄæþÓÄø!åÝ¨~8LóS #«®_ØÎLã9ñÌM>_dÀY¾Á
úáéÝè½8+uÙi¨íKþ>ß__­xEðëæÍÞÍ}]G[3õÈúKÓ¨&Mu^I¦Màáåîíðkm¯k§)rÃnëÁóY#þ{ 9à©ÀÈ¸§sx5fw¸}"99º-'%¬z¥þÅÿR²/a­rUë,>~f¿
6]Évk&¤­Z*KÙ»Éz/zä÷§Å:Q-Õ/AY~Z"%u^áÿæKm½uè§âs"oÑÇÔ5ýîB1´Þ5_7u×Ëva&zV\­ÁÞAVlS®v;y¨j?ãOHZ¯µ=}¦é:mf+ºÈ/]= R<þoe:1å>É8\´Í©ÈBÍç¥F;_ÜhEe³É¶xÓ ke·eüY@§~C§ZJÿ¢\®Ì(úQ©JË½õIÇT\Lÿ4#E|=Mö?¹ïJã$­ùcÓÂ{gPI¤ºyÖùýÎvy®;³£»ÚáP2#ÄVíeÕ¨ßËÀÎáwÈØROÙèe5º)hÒUSO¸¶I¶Ôß'R¼?²¦?äâÔÝb¶²ZØ7Êº¯·ül9ÿr8Ì÷X}óÆêþ.cyÙrà/î²æX«h:Ý4çe"Ø¹ï´Ü~úÁ|üîÕ Üñh¹ CVÛ@ÝSì]kÒÕyjg@ÖlEZ54:X	VGÊ8yÝª1ü@|Ãw?ÜÃ©>Ê7âß7?×ÒAçKa$:Öt/0)s?xdëÐ»½íN"^p÷l¼ÿ-«ZñS/ç1Ë@Ñ=MåýT¨ÇBÚ¢Û_âì	â°dZèúJ):;Öçzñ Ï·§zñ¨±)Ë,8Dz¬mF8'=}.ï!ç´NØÁxìIi9kS;yzÅêÍðc®°Ù±Nºõ~ÃI²¾/¶ºÈOeíS§Z¯¡âXK/g]EÒ±-á*= ðé5ÑÓJ®©qñWmz®¶nîÚ@ªôÛêG;0í7â4_6KEüwÕ@Ã^,±­ß=M­]´çSGÆ¼Ñ§øØ÷è´P¦qFaKy±wNÏ»ytP¾õØÓ¾WT+M¯BÍÂ]0à¥ú¥\q'äù"¤º,{÷ôÂj£mn¶øRe0[&Ô¸ÄÕe² ¤àIL×d68¯a)±Ã%Â#ÔÉºjÆÒÕ¯ßú$ÃE§óÀìUÃþÝï¥Jzt6Ò½j¡÷' ÁÎ/ ÊkS-'ç JwPÛÆÑacPIÀþAlÂl¯cØv¸½m4¨&¢Grà¸r[´4~/Bó2¯r/ó)KSf£Vp ?9Ü*¸$°º¤9 aç\9P§÷5?i¢Ø&'îÍÛÅzÎfíÁ_âYëkë.~#ê\yÕBä<)¼ÉR"CÅ7~>¦×Åd½cT½¿\¶ÃÿA9@ µõ5miþùË=M=MæÊ³+¡NSöKúõò¡Xq4_ð O[K:pHbWPYÊ´­íÊó£-Å?nÊ3çBÜµ¸&kCür1â1\Qå= (2£ÍÕÊ²ÙvÐWÛ@uÚÀúÝ=MëyîþPDÃà#KÚ 	.òìN
+Ák±¬/É!±dð£\r¥b/ªCè)y¤Â.M£Éú_ÉõøËE6	ËÑòù¸ZYU¬V)xÞÕ]uóýª=M*ÄaÉ²¨ Z'²ó´XØÿy>ô}mB½QEéðXÀêEâã§ÌªLå&§ï÷J[Aq¬ýÓäÀHJSÞåÙèÙéÎátVQè|&*s|­àRôþSTêGh4®,8ÑôÍp__~AîTUBbÁFïB\[¹ºòaH&úcðX&Í9=Mß§,«*òöe:¼,= lêt¢TE37Uü*ÐDTÖ×±]%aÇÕRá®vXyc¡IÃÒ:yFÈ,Ô¼Ö;SÖFm}4\ÀüÞ¼RW´µbo= Í.ÛøsÙ2,×Nèºâw÷ùoT
=MÑÑã§­ÞÞ¶ø­\â*Æ>JqÞ|±A¯bá?¼hÖ®·ÎÙâÕîfaqe.k"ÃíF+}ZCq	w M¯adW±LfØX4]µØìÚ±<U´=MgµýIKrflA=MÔãx±,Ü#HÏùù
gþþ¯Mñ_#@ñË­c R£7E»Q]Î¨Ö§_²òÃ­KNXJHÒOiÞÙÍxéÞÜÏh^
ÜFIoi^ÜxÖÖ^ûh^ÜAFI£\ßFßÜ«ÈÜ_YþKÔúÔ÷#
-CµsØðz'òý·	Ü]Ê×*¬hf×ßÔq
{!&IÜMø{1ObÁ{~.Ü±yÃxº/Þp9BxçaV3;3ù['âQ1#Ñp1¨×±*´¹¹!g÷~+Wû¾\ù§÷ÂÉá^ à+QÎ=}w°Ê¦ A9v¨:w7þ÷p­ÅnìòsnèÝÍ^ðò£îä6fÃÈkTÜùÉÚà4Oãþ*[ëò8bÇ|y4Å-ò2¡7)ÇaH(á¿J¾üÅÛ©¹Gl&¢øR_C'ßJlÿ·r$Mtî¨RÇþI!ï¾2èD|¡º|æt©¦uðÄ££Xêzp;±)ãt´=Mmfk0<¸1Øø9èô_Ãµ¨ÓúJEv3)þñÒ[/h¤= qÖªýgªÐµsì<©%;9/ÚrÁ 4mo¶ÐFÿN%(×JÜ$«C}ðaù·ù}§4hwõNARÿwö½Ó»í4SÍ áß°r*í=MÞ	IÚÕ¡ñ¡uKäã3ú;ÕyÀöÛx,(¾*"ï%J=}k"¯@âH'æÓÆ¬ë)$ª¦äëòÚ ÞshâÂµ)=}jxj^ÜÿE£qÿö§Bðãú³V=}¾ÊÓªýa«ÇP6öôÉMðféù_w¿Ë;\\D¨cCVìbAúM$ôa¥FúWþòýÑã)lWÀXµ¥±PõänÜß4ÛÕ¶= }¦­I"ª½À*Hñb4Kúvjh/V­÷Gq(hK©.ué¨&mBT"_Qò{Â: Íp²rW®óVÒ:äh2ØjäWØZ¹ðùéÞá+Öù¡Ð÷;L¾]ÐÔ±'0!7Ì+'Ú¬ÿíyhÙÀ³ÒöÏåZW*àybcÒqçpïØð2J@\,Ï?Ó­ñUzÚÎ=}Õé¿Dâ£%ñeÐX4±w$K:¢|=M¦KÞÀmöF®F3HÍçüÕxHÙÞþGÞ=}Bòd7eÛÛDj$ÐóµkÑ$ï õZw­Tbõõ­x_Þ4Vm1y±Ô·NP1^Õãûme÷LÞ w#.5w´x½Çpz*Æ= }ù½Ó|þèÉZä¼u
Jlú>Ä ¶ñª/M$=}çËÛ»ÀåÎA³d£±o0d	:òêH¢6YÜÎlÈ2tD²ÍâéØÈÜ\¦x~Úk<7Ç&ào!ÁªÐ+'½½¿õ¼5#¡ãdXñdÅÑO42ÅiÌá5çyºïøyÕÞ¬º&K?eÎÙE³4;NHQz¼Q:â¼È¼p¼Cä¸øñÕ®C¯£èËíC­£?þl7F2»,>B\B£ãÌÎÖÏ)ýD#y¶\HöIä:Ú®ÈjµTÕ~Ãd9Ìõ±äI¯:®|85@~eÃëµj®÷®R |ÊD7{
æÛ,"îBAì¸eKºL"õk²¾äí4»:|pÔ¿¥ú¢Ì¸MýÄ1»Ö ÅÔH¶¬³ÊEÁs\Ó,±&ýà¤ú¹Ñ#B=}Vy¥ÔOîBóÚÏU{iÀñÌÛ	\*C´ê#»ò¤&= Î= ÐE¼Gþ±?õâg= æ1øD"üóõ6n>äc?l,Ûý=M>D]Ü¸M¿ÅHUJª?= o¸k^Î!¹MÈGd>j¤JêÍp	"*õÌ(H<BHñÆÅëDÚ§¢ðÑw?ß!·½î²¡ç°R
ªà÷(}¾YîÏnoå*"Î¿£æS)ÚDÂ=}ÂjEE¹ÛYädL-ð±¤«Æ¹ý+xp\%1'ÎFË<åkáÚ&Þ(¯]wß0¿;[bëFëpß9è¦iÛì¡ìÈ7ïku.½GtÈÒH¾òkÕÝ@÷ÆA*L² òÇÛèíØÇkL6k= Þ:?uÅÿnóÇOÂRÍä­ÏÈÖ¡æñÉí±ü$¶Qº=}¶þ3açxðÏÃäCé4¼Ù¥½ZzwêbûF¥¹5»FÏ»¨Ð2¯ÕPöéÈ1X½OøBUaÀÄNv£ßk_dÞM¶_=}±»É¨°ÖfyîíàÓpDñrm´Ë%<ê)¡HÉ¶±[= x=MB¼Ñ-yÊa&øü²	y´!ù¹{b$V TXérOEK)¶Aji_èöV	&×T¯¿à9\Ä*dÝ»÷¶¼ý1H¢ðQ|ïJO±³ËOë}ó áÀfÊªzÏåÐhÒÆòË¸#Gû¿UÏ.m¥ DÆ»­Õ§_9ÊÉ¦'Kv²Æ}_i¡·t¿¡Özj·§×!abaàIz'£ä«ÐäýÆ³ (Yª¥ëú¶îJùõ5í0çW3q6uÅ(ßÀáÁI5çvtP °øîå&§_OþV^½qä.3íaJtüò>F=M¸Òó´]ï ÍV
wÄ= 3$+°<£	½akY+G}èãtZÍ®áhqS§© ÞPDß.ÄºÉ ¼Y=M¸ÖÄÔêMüjô¯÷´bb:zKï,éMÇ¤²½¿ãd=Mù2!mýæTø0¢L=M·­Zwõ9òÏÑXÈ®ßÄàFªª \|ßâTÕ6ò;Â´^°Ñé=MyL!ZJ@H#³²å+Î8C02µPG#»fY¯E°ïg¥3:Oþ£:âJ±Æeìa±mòN¤8aZ5&áNd=M£ÉSÓ^Ôè2³$Ór%Ó½±WVgâÒÐ)[KÎÜ1¶as%Ó#,a]Û¦¿Ôï ­0èì¢¯óÙôÐQ
e²Õé
eòc¾¤Pî¸OÉ;ÙtÍpVÅsÀÅ)øÈÈ©ÄW¿ïìñ¹7"ã(·ûå#²çFq¯D¯r7Û(pRI²íêN¨z2Fñ@ïÛ¿«"b®ÁEÊÈ^Ý!à*x®¡¢éCöl@#´m»ùÊc9(æ¿ì²Ø .ÌÛWYOÝë~­ÛA=M?Á·ÇlÏ=}nÁ%<³ÌjÛf8ò¡#åìA« ¶çÄÃú8­Ðô¸E3=MÜÎåmFSÕUqÑ«þ1ôÃ=}51äûù­oVfà¤SgH0_+Ê'¢CèF ÊÿÜð	dÿåcÑ$¢×Þ³wýð6õì¹ØQìäXnkpÏ^ÅBÜIùH±©?7ëÂ¯}ëÈ¹N(Ò;vöY1M&t³èèÏ7ÑçE¸ïµ©-VK%cÕãUÜ}Ù®pB´°÷ pa«µã¶ºÇPÂ¥¤.þ<5°B£¡j.!Àx)Í®ä×SîKÛíDþ×ø¯ñëÚúÖJúÑ»o/UúÂ'Ãäêd;¬­ÿÝô((a¢>8¬KÝ#¼L-ËÉÊ³m÷&3CÛ¨¡'³øKeAÇ{Î@~w	Óè2¦ó°UzÖ[mÌzæsãßq®'íØ-Â£CÌ7#S»ónC?Í<P+)þ)yLùÚº%+û³©ÙL%±ùz	Iæ	4¢×!ÐEw©gMPÄF--\Ó%jú7Ë¾®BÆîÍ_ÌpÓøÅ÷Å[|O¬y¾Ûdáð«@ª«lá¬â®Æ~þæÿ-ÿ»îÒK×k=}öò°×´+J.kýj*F¿ÇÏ=M ðòòÁ¬/ëS¦gfÖsªà¬=M/ÿÿz0u2æî¦Þ°=Mÿy+ª>©/Fª~*¶è¬N*N7½ð«ð@æ(= x
fýî|æ¬ä#&ÐÉb¹pM@¿ìuP|ç¬íe?~^æäEXø§ÚEð¦a/Pn¾jwöä¡µgsB3?sB{dÐÓCÅ÷®äÖ@4 jYX­y¤CÑK;F¾dL3ùbWl[Í" Ûf¬}eN
þcÇ¾«3ú»%Zåv-aÿÐÃVEw+}ìÃÞ/ëòàË® Ïj¿çÄfJjÿ«ÙØl^)¤_¾äÐ»Êx>ä>CÝ#',vÊèçySû®ÅÁ¿:·¿cQ¸=M·9Æ½¯XßN®éU	FþÐrÙ(¨¿H|L8úÔÔmÔðÜ&ÕËK?ÄK?çªþ¾ÆÀÊöüØô§¼ÓÍñK%#¨Ï+!ÿkÓòDïmº9H.z)Êà{ùfbÞ?{ß]iK!0=M&Ò<¯H®|àlÆ´§qàÅ±ëæ#)H&Íi¨Êê>Ô8¸ÏµÕRêðêÅáèÁðÝ»\Û ÔÊ²dñ0jõm¹´
Þ«áøhëiËÙ¸6~8þmï8æ¿é}b]3£Ô+ÍÏ´H^jyÒÔ-ÐÒÀñf ï¢RcEµÕÜÁ&¾Ü[3×Ü[3öR3Q-c%c¼-¸ÅØ!ÙØÅÖ,¨ä]¯l¥¨¯8âF¸Ù6Ü:¶ÉC¨hµ8ïbîkBTËvÚ¼;m¯ª·qg\úÿ[·!°æP¿¤¸#Sÿ> 0	Ë­tZô¡4æOQÿ.Â32÷Xysñë¼¤¶°Mé§)=MÄç¾äÃßßåQ0gQOMne±U÷×Û9¼ Ð!ZÕ-¬ÀY}¼ÙR~JÔ^OtöbÅóRËó}¥^I&±Ý0±?6(*]é%:Ùùà°Ôæ«ßÞ ¤j&"	6@ÞI8Ä5bµ°í=}úDC ?«®uÎwñ¨¾6I°B|;(<bPÄ§åªÜ&!M¿L:ÊêéØYHxrtxVòWxvÞ²,Ç!1\X6Á¹X}¤ÕQªÙw=}ä¹°Ö)vÏa¹V}ÔLi§ÿdÒoÙ$UNcIgÀÙ¤"'->~íÏêMmÎ¤CÇ°È9èÊÆ³wÜ´n×{HÞ¹¾È¡Z¸3÷êÀãÓÇNÚFkëxòÝûú- d}có¢4üýÝÁ!ÛµÒUm=}û[Þ]qÐ¦ñÀ ý1Êêù¿ëÏ%§Y²%°jHg¼ºg÷Cïh×gýcù{ºd>1XÊb|E×¼ºØèJå©J£øzªþÄk-XÐ'´ådÇkÆÿÎ¡MÑÏþêe	gùíý@{&tñrÊáyË¶ÃÕf~}Õ(ìÉÈéz$ÆÇ°&:ã[ ÇÕ[?R£ÈÌÅ@/O.:gÏJìAHÌ0%N= ÷ß?Ø¡­.àØñG¡¦O,Ï±ãPcêí1ùúf¤#Gúh)rÙÚ+ÜðÒÔáåñx9·¯²÷ÿsÖ#È´zEZì' 8ä×<Pøäâ0WW?zÛ!9×ø¤¼:Q©Þ£sfÓ<¨µáÆrkô~Gçt(v=}f·= W3p|Àv!{vuÖÎq bb´Äñ/ëmËïýÙH¾!/¼5ygX}Ådø¾¹(]oàÃvhøiürÌÆ&èYÙÒ¬ÎóÛàÂÅ[ å]¯G0ï$q¡£GùU[´¹QLoÏñoÿ
ôDßyvr=Mn{è @oÙÉTëÚJÄ¬&UÒOÆÖÊèçØØy$=M«~\ø#ZúÚÌA¬¾ÙM	ãVÅX#@.=MÏ}>gÒz5	Q¤ÿo|[gT1Â(ÖÙËy×ò¼GZÉBebµ¶HÌ<üQÊ£~ZYxvÚm dõ[Xl±	wl¸¾ÂqÏócc¥éðø±­m+p¹Izó#>JùÙy/09ca¥ñèÜím¥ê Ñïqbaê'ø¢x?¼û(DõÊ
f	Ð2@[IÇ,QÛo÷&Ï'îÍï´ ½ZÙôWal¸
ÙFQPör¸Ík{Ñ¢&Åoõ©zø´FäóvFüõ!d¼³
¸(öõÏQY¤x«ÒÎ¸ºÍe3kpú¯Æo ù~4ÛCÑïcuÃ²QaÍpæu~Ödîô=MpöÎm·CæU/êÏ/Ju¯©-ð8þñ7%pÏ&~o¯)÷;sÂÎÞtháÔgÜÍñ+íÁ£ædx,<áÐüÎ»ÓSrwAEk¡øýzhÄã<£
EÿNGÁõ#Ñÿ:­¸CE;M±¬­èà°\@aaG¨üzSØ}±Át®RËÊQ±kÞAàc¹¨ÍòÜYsªIµ
ðrIk¥QsÑ!¸ñÃ]¾Áþ:î= F=MÇ0qGzåñû\î?äô	
ä¬Ûq¡= }<vô÷Ð?q­ãBm²Î#hÿ²ºó%+ÇÉ,r%lyp?Z/ B¸ òÓ°¯ÞzÄKÊtBßK56ê8=}Ðü¥=M~µ=M½3qö õ^¹= ]}U>U]Ùy÷îU?R¨ïÁ;6¤Tè#óczã'9PÑÕ¿Ñ¬öt9Í·{3'ÕeÆá2xòvÒ ^åJß¥ÇAp©³æÔÿNK#©uúQÐ0Éêµq´	àÑìëö}rª"ÆÀ
ÓÎ+&¦8òÏRFd}µÌÛWFLÛ6®1°ÁsXàuã8[üî äÛ2kVÍøÿ)m­Ê!£'= ì/^¾6#9_y[¯y£ê«µl£Övè= nX	u ó°(w/wYÇÌ (d	ØÜ° 3_¤E¾!7¥v=}$ÙÒ·îIï¼é[ÿ¿$¨= eÌ¨íNMT°Aa¥IØªä÷v~Å^æqÐyÏ¨»VáÎ¸¦½x~í.ªþÓú.&|I
æÖjýÝ¶ ÜÀàÂÛê¹·ÕûçShÿ× >¥_«c
$ø
ãNñÀª$ò§îS4ù*<ËuÂz<KÊXÔ)éÇFËÊßgyp¨Ow	Óò3µ3 ÛÑ>90qHþfÂ;¥òåµÛNØ¾ßóÜ$mü=}½û}ýÂ¾¤ûæS!ZaG= j%©f
h};"D¥8;?B¥òÿAÜT)W©+ð"Åÿð°A<FæZo~4MÂ=}ïã7éV¦øíæÅ=MõüªNWÝÀË íF¦y%¸©#Y]Op³|ôéñD·®9úÏ=M!ïMolZ0©ôLhR§NÃrÇñ½ÇÐóÈÐ¾ê¡4DNÂ4= øwù ðl/Rè®»cø9ÒOÁºËìQõÓÂ,Å£$ük¬X!	Ø©#ÆÁ=MpuÍ^²k2ôzhÖ}MgmÒCè]<»× Ýa K ¯²ü&wr\s k\³­$ó?¬®4)è;éL	Ôy °ò^[W9éLEÈÈÿeWÜ¿)Eý·qURPupFåpø÷Ru¹¼úw*<aÀæSÃÄr/qr/v¸ÒÅÿ	rÙøÐ´ë|7ÖrUGÕ¾KO.>¼ü
{XôeÏL¹ø\x×[  m['òäèf80_ãyÍ¢ÚÃ@f><ÐÚÂ¸ÔI¾ãUÄØáöüÈçé|¤Â~ô²¿×ð¬b5îÍà@3F
ù¥H#¤ <"mäDª<·ì­°«ç#ý  lÁ	ñÞÕD÷O(¸§ÑsI¢ÕÇ°õ[½¦· ¹¿=Mw¤: #¦ánóH +C±hñVb:W)Ðð,ÕÉ!=MÙ=M½ÆÆ¡ÅÙL£&Epg³(ÕV*quÄIL= ð£V0±
î¤¿*%pºäÚ0²AFíA­7Äk#T= µX)B2q°OçP¡g´Yö>b
»ë©KªOü·ÊèØÁUMDd( ½°jÆ9¢zD:Ã·12k¼xÃ#h!b3Î í²º°-b?¯Ç±nkb¥o.a)Ê.í8ÓÿTyºpð&H±âÆÆÙ=M¯ð^õÄÃVähFdñí;[c8ìä8ÈQfNìæ(	¨uW¬3µ)v¶ ¶îÚs"µ¿¢þGÃUÃéÀ<¼Hªg¤ Vë©eSüÅý£È>ÿ>BÑÈL÷þ(ðõ9ÛÍÅíö¿ }ÂQ¯=MáIh|Þ¡éªóâ¨sJXã¯f~³â«gíË=}0ñíÿ³H tku_+ñl~)ù9£þbp[ðl¥ª¡spsNq*Á[hh)ÔpA7ëk¹dV«ø0uñ|þÂÀ«³'#­9kå'ÜíjÃc,&ú·¦e¡ût.Y©F¤qêî;¸[+ÏÒ0}'hy@V\#KØ´Îk­g(kK+w<y´­Ó$¡'juõ+zí;sßuâVÏpeª@ïº¶-£¿é­(ãDLî¼éu~àDäñû-t¥=}£Ï¼¸XÏYl=M#ØðOX³K¿æÎäð¾¡ÿ	ïþ¬càF²³'ÊcÃÊp¾[l"=MaÇL'(oôXu
p*i¢7á­aBKÏÍ6Èúþ·H#q(Q
4O SèçzkÔ¸?;=MLdÁáùê­Ñ§âï¨{bW¦Üë åþðò,fF[âõÃ,^òvU´ÁH6tÀ¥±¤ÚkÇ"ãæeÙ=M<?ê×ÜCâ#ÎèÎgíììóßqÃ= :/HU!Î÷«f¢ rw&ZÛ±WbÕxEA©vkÔ,°xé~gÛÆd4î½q(ÚÃ´é°òn;Ô#\<0IDÊ:@÷¯¥-'>¨ÇÈAåëqÿ?ùZ2á4LòêEe OLÓ!ap5²f0×^+}OÀ[ýÀ[½²½­wGöN8¼o_Åð³yÿ´=}6Ç²ßöç¬ÒzïØÞ÷õß*ï'!ÁJñþð~ %ÄGèG2Y3~FvãFò=}¡{0ë©³âÌ/@òF£¢ujÓ,Î(µ<^= vYsê°8ÏËq[>$a^éÅJúdêÜa³2Ö¬ó&J±z\é\uJ~ÑÿN©=}åBa×J¢éÝFTJë}zA¾ßGm¬¹¼7I½û*Æß§mÓV/)5ëh¢V^-¶qW6Ä=}¡4+O2R¿ÂR0Å¡<×ùÁ^*ð.ö)îþmì,Iõt¦*ÿ©÷pÅqÁÉ+0 @ØBu÷Ê²Lød>±Ú¨K'£õg	~$îlU»òìX|ébÅÄ£sF%Ú:Tæ&MMVÇÁÐÔî*ËA«Ë¡éß®TàY?¾»Ï5¤iØÂîC´ì
hÌöôª"ñ¤Mª!aòDý¿­Çî~)Û!BcµpÆHJz&ÌåÙ|.ÚËÚÝzzK7q¦Ùr×5m]M¡õÊj«¸ØÜÀ¯bNÖ5I£ ^°Ë>xY6=Mþ´nBøm½dNyuF|Õgòi·xàZ>IÚól9ßP,J<=}laæªZ=M[n]ÇÊ,9b£øé@ð²ë¨BBÌ=}Ná¾%´ÀØA:yÉÔÍ¢féku!Ú§þâØdÍîºäÇÂÄØ g©ËUéÑ&³ëæÐ«_;üS8éæbfWäÃ¿B 7¤Û9í¢?XËÙääÜWtnøe¿Î9J[áÐ@Íùá-¦âÚÔKy>-TØÀ3h·âCxîÙzÔð¯Ö|éÑº ç ýoÙ¤ï{5I[fF±+Ï8#ìjS%Êóö2PUà´= $Öh=MàðI,µIhÙÖÂ.zµ¥¤Æz©]±2ð¦P8[Øäsñtë³|Ü3TÙF¨áÉJ/£ ÍËÆxÖÌÄçôDír®³)R±(0°Cù-;4O¥Z¯~0.Lfe>çN£pí + ]/ÿªí0$X¡ïc$st,=}3@ök×º2á¹J@»<SO»´6MÙÂ°é¸±Lã®¾ÞêG/Bs{"¹Ã¢pIñþZëQÁÆ*«ÝYù#8ã6»ªr7ÈHöðÌ<Ú½Û¼ÙÇô°Á¬dñµ¶ÏÑëyYÀ]¨Üÿ¡ZYPµÂÚñ:Ój¶BPu·º;F;VÆwTø=Más)rÔ\OQJøWCësèqX%@ò]ÉºjîSOOîSiÉt¶&û1oeáIh)¶DN{ÞtsL¡ð=}6$> íÉÒoÑ³Ö7È¤7¿¿y=Mñ|!:=}ÿ²Vá©Ê}Á¯¸NDâDÆôAÆðµY ° 9O%Äå~°& v±£Ôv?¢ûr(¦ØzíÞx5é_Rè<DÙöØÒf|ß¥½ÜgïM«ý¥øß$i'rF-v¹×_ý;óé©ÓhYÇ¾¨;a|¨ë(WÞÔÕ¿Ö^=MÞ¾©C\l7vJÜAÞý¼èq[!ÏNA>É«
'¶ºíÂÿÇthc­±ëö®YXÂÚB?ÈÄiuþ®£ZeÜ@Ù?Nî¨õÍ3{ã0ñôªðH'æ	ë³L×£ÀÃEaÙ¹8Ó:µ¼Ôzã·öl\¹Ê³&i%mÜÃþé÷BÎëoÉôÊ]à´¯<ÐH%^%7÷Ücµ/$ý´ò Ï0Ì= )<½hk­ÏTãA¦Ð×-(äçãY©=MÞ[¨ [ß¯³¢±&²¡½à³/ÏÌu«= èLV±@ÆK£'27þ= trÍ^BÅHçjZ;'p»_ÃaAØz.Xo/¦Dó[Õ¬¯b°m.¾ï
ó¬£Ì}~¡U^÷½Ã*sx¹ÑÀ.nr¤ñô7Ç,pç/ä®¾mñÈªûÇ=Mv=  SìÒ+.&°Þgÿâ¾êÂÚº@c7¼ìáµbì½ô¨óÆÜºkÿZÕ¥ù¤$êùÔ:>iX¬oæ1³%»3%Ê LLt:<Aï¥fapÚr±÷¦ÿ°ÿ%©õb{ç¯úû²'Õ3üÍÅ8´YñÄ»ZÃÉÛ<Õ|J¦ #°nzE#<:êÂ½ã<è¦­[hçgî²Dc"ÉlênüÁDFS_vÌ0w5DºÈÿ#öe=}n·Ji¼[°%^ Õ<K¤RU·?cCGUaB(ëpøpí×­¼Ñ;¨ )k~f7ØáJbªÏKYK åöz¨>×¿¿§QE]rQÙ¡ sÇÊ+êÕ?Ù¨Iºa(uÉy:äI>àhÌgû^De~¼ÏÈôr$Ø:¦x¡meá= [n7½úÙé!ø=} ¡[h [rðyÀ[uuÝ^g³@Çª
äÔÎÜ¼¼%cjÁ\
ZAçËi!Zîàýy¬øÍîj
º~EÞy¿Ê»QiiÛ\±BH¸\1fo¾»hyC-Wé×¥ÃÍîäS¦]#Ì4zâÅ®tvî+À©Ë 0®3¦8W ¸q«éñoÕÇÑwÓB«á)¤¬KêkÖÕ¿-v½_P6½MË;TÅùùL°¦£7¢ô(bK÷îí­0³9¬sYbo= W|!ôíbªòï:Ï¤cáÈöí"Õ,©E
Íxç[Î»{D&ã4ýDC?&u÷pÆ¨Éù&¨CiS¯Ös= ØÄLp½FäE	ÿE
d¢âÑÙÁ¨8(>¿âÏKÅvhPµûñæ¡ý·íû¿J?ÒøùÜ¬MJcx6	-¶D*¹'âQGþ=MÀúð0ÝÐ¾©ÅAÿ«ó+$h¢Ä?2«Sò'üÖÀ_ È¬£­#Å¹·?;I¯$ò/¹y®Ù}pÆ >÷VHdo8¾¯ùózÿÕÛ¦e]Òx; B¹Q JÝ\®ë}RÉÇþââ1½r¶Xâ=MÕêåBÆny¿I	aÁQéT®jæù ääd¥8úûì 
çqØê¨éèÞô·IàÆ2ÿÞ+0øA¨Fy;ªânÿkh}pn%¢ò4¨^×îÉ:2³y<®Õ*wb±ízïP Çu¶mùv£ÎE_à@ËªÉáXsJC÷øôË²jÑ§sAèÞÔÙAeúÎë½´úïÞÎÃi+i#ÑçUôØB¥·¡á?¸ùir[â:âñEâ1'£'ìªÓ7âRØµßáÍYR¯RßR=M×°;ëWAïK×Èï¦Bo3dìª»S6Â7Çþà¢×-³MGùóØ½6R¦u\=}ºL}Ôå¹ þ­ïKîå)õÝyµ[EQñf]ßþ ×Î	%Òýr9³ÎíÅr]=M°6¯>,â= n4ÂÕpÀbxÌ6d&b5Q=}ÄØ]½×g_=}¯:Ý®D_q®©³C
­ËþÒ\¬åéí~§I%hìÚ4Àv(ÿ­ËB>]bW1ÄâvLÆzä¨<Ó¨t¡=}%Ò
ãÀvìº-^æþwqSü?ÌÞõÉ.l£|¿§¢YYd~R.ñ4{3Äýh@
Cþkv°6,â@ûZGLó	þÜÍOØè"ÅõKPFt¹¥ìî,êÙU¥Yúì§h8SìQ;f5xÐÀÛD-\rº är²nËÌÜ|¹ÀïrK^ÿ4Èî8¸¦Js¯07T-Ôh\-X¦=}Gì­KSUÔ4!ÂëàÓîr$ÛäÂTÎ[DÑË(àÀ7ÂqºÙ&"âÚ¨8%¶´N~7dÊË\t¹t´ø6Ò¾u)£Êê42nþ(}>Ã»ìHÊðõÃâØÌ
1Ûìi¬vëA ¿= áâk½!úzê¦÷ÿOj®kÜk]n(Üë{9RpæP¦ï±âUø,G	~Ëó:|ÙË{+þe¶]sS|¡át5¡
¿´{ZEy®è¨Öp¨^´À½&TPßÌ óâÒoU¨Í,[BiúËCÊ%·ðR= Khú{·0=M;¿#G¡!Ó¡£DVÅ©×ð áàûOÎ)ÌÃÝ)ÌÞe©®ìjoó§_+þ
çÔ­å"ëB^¯>ÂÀ×Õüé4'f(©ÿ;Ktç¬GLÐ©¼é©¼-åA¿IiÑü<UÉ¸±eRÅAéß³,j«½Û/àèÓÉ¡_ÏbõÇäúÓ?ÅFXs«gìÝ<Ï¶þ0PÍ/ª§!øö~î¾Ì*= 
áÞE&¥â¢[WB}â'hdÆbçöó3Î	XáÏØ¯u÷äoNº³Ìi?)¬OV*¾§r¦ÇfA]rÌ°³¸°ÇÌ°ZåXYngÐ{YýÝò6ÏÑ£eVW½Êa|¨úv	ængíá¦sÁgÛ%ââ¯"0Sºv3ùÜ¯à¬*"µ_> áñ6g)Îú 7UÎçlÑ«ÊÕÝ#ðàGÞçlßlñ9[v§ÕA'j&£u?Æ4Ð¦÷:UnAv0·ëÇDÑçFÖgVxhVxÛu<ßTîØt¨R>xÿ[Øj)ªáÕ
în=}}ÉÎcl.ogumGØpu[VDÖªt¸lÜjïHü½ùýBµªM¨¼Cj>\çz#ê´Âíãµ'ÜøçJu#M£Ij=}ÛKúLjé0zØø6Á(*£ù;ïýÂMÃ/Oc	uøKûø	=MGÜÐÅnÛøMËÛsN
~´Ê!çíL÷;ãôI%!yOÒUêV·/^kªÏÎbÆyåÖ³¯-hUI ê¹&Èç)j]\G,@ûäÿD
;÷öÁÀUVønxèY¶M÷jTà2½nZÅ'0¾Jm^\nð1î!òä ïËXF§Í8+¢cóàýç×ykw7,x¹h÷jWà{ tSGd=}Ô?Ø¦©Y5Oºá<OËdõ6Ü|xô¼xèDµä]ºT= Éä=}eVFzlxX¼tÃE
¥Ê¨9×Vúf]YÄTê÷!yÏY_úµnO¢ßúY¤á_ëUø!{¿ý¾I{-ìTùõ·Â«Ç´ÖAVXoãÎ¾µÍ:<x|iuÿÁ?ÅëKv¨kµzD¶)=Mj¡~_ºÒó´	+i1¡~t[½xçpMÄÎòøÜûjDLµG Hz LOãu8Âç)R~­nJÓ_)çíu/x³ÙF¬ºyé}/ÝÖC±éøåµPW	K^~qjè»Q¨Ð4HÙñÉõ[l]°Dfª}+ê¸"Ôï@BOXÉ¼âÈÌ5S+MW¨ÓZàjÖûÐu®*¨«l®î'1{]ªÁB¼Ãr=MGe~¶Úz+*Ö¢ßûcáÃuèÆbÄ¯hA$(òîª2SZ@+Õ©ï9=MÝS=Má¼²©ZÎû+Í¦p8E-±¦½éÊ»¼(_¡D/Þ³;UÄ QóÇ_¿ä8 uô·¹CSøIdâý¡-hÔé]r§àpDûSÇ[+£ò-VòRö¢2Ý£9ðZÂë.±ÃP/Î¢·Äqµ-ôW#½Éß±Pó1³!*céc:H=MÐñ¡îp#CBÐIhd)OpÀ= iV¬ýí¸TU]¢ñ÷è¶ð¹Ø©Eä<'´ª»Péÿ@Þ´T#Ô-Úàç^Ëõ4Ñ¬õÕ³¡ °¹u?jÁ¶7K®à%Ò<^ÖÊtééø%Eþ(C=M=}ÜRÈu^Ý ðîðwuc%¤= þ¦¤ü?HÍ»/Äì!R5*õÑ;Ë\ý¢iIkÊJsÌGëX¦åÔÀWmäóÆ|[kâ×ãçìj£ÎYý=Mãä'ûéOÿK¨ªå§6Ú[ËYDÕ= IÏPu=MG7hè F¤Õ
ôÍ sv_Óèdàx DvùÁi^»»;$ªç¢×¢å
G®rp4ÊáTP	âi¯*ÿI5?UÝ	a­å?\âb ¹A*tþaâý%Ãè#qS=M½eý$ÐÏì©ÊZ¢Ñã½ïïð½±¯ÚtV.{Özkà¥ç¯Ð?Ùäv]qÖî¯è¬[¦*Ó|YÁBn¯}asü*bMým_Þÿgv\%ZÄ,Ë/ÂiÜße¨Sy®vÚò4¨8c5ç£k£3t*ë³.¾¢'~ßÀ.ëaà¹5ð.éJZ5ù°/	ñÒbÀÖ¨XGºõØ[fð'D£n¥1´ª»=M
¨NéåJ¡¨÷­aÁX©$þÂä÷¢*áøE,û¶eY"}0¥rr¥2´9ëT²ª@>ÍZ^¡@æ®/Hà)§0Èc"^}ãlý{J´Ci£ÅÑ]ô|§Ikt¶ºÅ§Yµ:4ÆxGìòóâ!Ó«8Y{ð<é¤tÙu9haG¨¡ó¹°½à@äß©¡ÃvÖ~óLä¦Oï¥ýÙA«·¶¶ÔÓ]O¤ã¶| ¥õÄØU 
s@º°!M5'â[u,Å×->]KGtè~ñý¼$> ¹wÎ(TÞ=}÷®xCKî}ôòÿÐbèÞ}sVèÊ¨ßÏ9+é¢7ûXÉFhå6V¢póÃ&¼-í÷ôã¨]ôgTæäOôXúÉe\aÔ%1ÆßÈ
]ÀÄyYîæ§*|Ô+æRÝ­uZ¶hÿ¯^i>Mn±Êu	¿ªi¾\Cma-2Qÿ2U¢1²Æ!»}w[­m"/ððéé­÷g.OÓ*ÎuïaË~m³·¹·§iÏ]8¾eLøÌ:Î*5êÓ.2ôÇúç pb«ãÇwKlB¥=}>Ô(7êÔ[_9iî3#!(°¸)Åâ¼z|Ljæ³"¡áû$²[Ø6ÍlJó{¢E$~-ëþcù\A^&p}Å$¡»Õ²øCpó8?fÕ¼ûóO]Qõò:JÍÕÄ_Ñ÷ÇÛØN^V?F»VÂXw{sJÂÇåôÞ¤Ã ñóâÞe+.bJv.»aÏµVvp¿Làas$ö&Æ¶Ý5ÛGS>õæÍûÒ|¢Ø®#)©qÀîqö½ÀlÇJÚê<F±?]:°Ì©¾Å* Ù·ß#qäoFµ×N-²»=M÷¹ðyÜÒ¯@­59´Q5÷8~¬<¶ã_òü©9= jhÝ²»ä¥à4ÈÔ(XòP¨ª¤X®­]ônØzÚÊa·øùÚ,ñ¨y	ò]¸CYÏáAØ®nÚtÝ*æ¬¯¨Êü\}Àý{~.u#5÷FÛçÑB[ú*pnÀxbZE©b|1ô:*ß²ÁóçOôïO¬Î{ørnG/mS]àê¿¼ñÓYLû	0mK	9YnFü¿0@~Ï½ ÑÑ\F7 0 cÊÃaa@¹çäR£H»/^Ñ[£ß~O¡ÙþÖùr§¦Ý4ìÓm=MÔ"g"g¡éë öNhÓHÕ)ÀdZ¿¤xøkP>ãÒñHÅ¸¼hëW½¡
p ×=}dv¥&r=M[Æg¤ø M{"ØKÚ~µqY9{B&Boõ%m?êòØ^¼/ÛùzsÅÜï«Cïû"­F%ªí2!¿×7Þ2íÅeÇp¼[ÝÂ8éþ°¾ÿ<Kw¼Ôp$ñé=}1VÈwsÞ:A <·%[mg\_ÿ%ZxzY¯ÀüÛlÐðJÀaúçÉL¥VoÒ¿åc.F«ôÅÏ$·ðîß7OE]ú96ÆQË@s¶F#u(KY8ð3ýÕwÕKÝzðÃ&ÖødzfJDD4DayÔ$ágì×)t
©áÑ¶1½û©òï[u QF§ËÃô+(=}-´CíÛqÆhÒã¾yrÅ9|ønJÜá"~FÓ¦l¨z5Ò]>oûÉ*Ø<ìÉ´7JílàïNDÚ­óÙõ½CÂßïXé¡8këÞ>Ä¦ËÞä:e8à²èÖ<wÀ3>(î6?ùgúï{!ÃwKÖßÿ±¦àÐ{(	ò?µ´ÀÚÙÿ#¸]oô xãù½Vî£\4×öþí<¥xÌ«ßå5Ïª:pµò:7@$Y®BµõrúVqËVÖWXÓ%ëæÑ¡_= ;×ÒîPÀyghåö"«F¢ñìB¢º	4jdïln0ÌþU:¹F6îi72Uû§¼ÃIôÌÙ;|«htØß=MÙ7Øo¨i8.¢9´),àmDåô#òÿÍéÿÄÆ(?Zèÿhë_÷zs­árÖÒÓ1mÜÂÜ]ù= 1K=MË »lÑÂ)¥sá«FV£ÑvÖDòNy#¹QêV³rþ-ûtå«*¢mPeÖS¾ä^×=}+U©Sµ/q= ÛÄäÅßAºñ|.#Fp¿lgLÖÉqN$	MÉÞüþÿÿ_DAÎWVéb{6$ñX¡eAýò÷íÀÊÿ-¢qòÙGÅÃr¢.õÆÛã¦ôß X"¸ é&2}ÄÙR¢O&V¦­ÅDª5ÄKUËE¼;\ÄÆhdÀ!Ûp9!º¸ÈU×1I5CXÄ{ËªYÁÑ¹¾íã_{q÷|*4·p¨±@¶Ü²¦nî;4ýÊ£Ï&ÕûXBN{Ò´o4W?ØÿúUäâµÖ§±$e~LKÐ;r=}âL5»NÐºH;cß°~òµ¥E*¶XTdq"®fÄÁêY¢ÉIûº¨O@¶¦/Æî%!øT5sr\PfÙÈÎ_Øn6-dýc2ÂbÅ­ÑèåÍ£fÁö.ú¹¶9jiTMNÄéH*2C!æ ºZ{+"¥WÝZRÜâ«üµF~êih¬'²ÓòÖÜ	gwR^c,®=}Ö&I¯öf¢ no>º°Ýäf%äT©æâýûåÇaYÚ1>ÿz±ªñÕBµ¹YË¨v ÆDlh½Ô¯ÜîÄ{üÌ{üyz¥= Ïºxy\i6oàõ¸\[àþ½ÙÄ38ä¤ï·½ãÌ´Ö¾ãÿ^eÚÉ4Íÿ?~¥h:t]ä;á÷>/DH(Yé?YbcÝúýzÕà×= ¡(F nH¬÷RÒ­g
\³+*$ÀÎ>¹2n=}1ñ¢àÀÏKqV<Ñ~Kgø?â²¯
Z½ q«ª=}SçU£qvQC¤ûaC­;¿ @ÈMúJ@ãÆöÚþà í½uÍí\RÍcËØFÅ'»Ð(&ÿzkòUÈ×= !Ó
+i©¯h+7>ÄnÕó g\¢¤à=M¶dAz>ªþì¢u¾(6m*ÀÞX¥}èþOtR½«Æ6ß>cgToÈÕ=}tPÙXöòj±VrÚ=MÖ7w+åyð ~¼RPpÖ"Òb9.C4&NÖ;ZhjÚÊÞ¡^oÏ¾]Ð]Ñu}¯i}êá¨ß«o Wª§hf ÓãÆ[GîBI-àxËüù%/¤HâÁ;@&Kü+7Ïÿ+ØHæÒz×&K«çq³ÅÏú½1ùf@ì¿äªâõÀíKÐù­ð¤­F×EÛ¢¥è ð£yÂ¢Õä~s])L93ra¬ø,ëþÍ Ú²'<¶ü¿Gña¹Bí	¸àÒNÞr\ ¸¯ìê5^M8î©T¦¶úù,¸ìñò²T#)o©Á/=}¼ãKHë|­U@C¸c\$Iöv!¤i*I]ååaÃ= z»^º®Îâ»ø)[¨1ZÌ¨q6úPCwµÉâ;ù);¨±Ûn©vÃf@âÇ@¯tÓL¿¤=}E@^ÏOÊÅüÀ<ÿµQfU!á7¤o7åJC?Ã÷=}îÈx	]²qÃ³qmÚ¢ôÝáÑ9ÕbRc¥ÕóqÔ[îËSÜÞ¡(}úÇÐ¶VÑvâúE××øêÚtdã{Zµ¾¼#'>E­>¡ÊI²l){ïö<üÞÛþªM÷Ùoâ·Ð¯µï¬]²í yýNl?rÕGbõ[pCr+¦EªÉÁí0ÎrÏ§EÉ_ã·¥»Aö$Ý¾µóæäÕ¾È%vV:aùqW¹ãnþx<±öÞfa ¹ö= ÛÞ,XÜÚböNI<Î|·F>ÀÊT¡Ò_Úv<njÏF¾è¡ª=}ïÂ>×1Ôw¦HúË¡
c¼£¹¶-Ä^sCçx§æÇ¥ÔPaùÙz+pJNO¦¢Ì;GËa5MGØâ¥þØîèJ	ï¡®]°]åÜÛùp|¤àØ9l@UaóB<³=}ug:®<6©Pk9'ª²ýå (¤ÂQùLi6Úx)þ®ôý Ú= å(Õª}«0ÖÈ{Ê|­FWÖ-¢×°¤¢Âñmdà±[k×jfÆª^1qßÚdºkBí5EXf8LÛmì	ï|^4gÏ»ÉÒ08v#6ûYk?c>À)EÊ&ãybþÖiªºóe²ÿWÓ¼¬ÍXÅ^Z{@´L²}îèâ7¦Æ²í	ZðÕõ5XY×ÐóÂ¦Lª¬çèÓ(ÙacX_êÃU¿¶W8~= Þ5vE¹RmÍqZk¤JIqK6â_¯5ùËÅ®÷T#ºÈF³«»³:«NÚN2à/æê¤w µk¹,ú8a¹ntùdt= @-ß(µji^µT¶R76· MÌ»ÁõoOØa}ÐÚS°¥K¥8ïã0&Kåõóº¨£QvfµË\·!¢ã±y$>&S·Kü{i¹° _Áw_7eÇî!Â«s¥;s±ßñö°KÇÎg)¾Ç°²2â·«Îÿ·¿ù=MÅÇÍXóyB\Û6S& à±*^ÊFwc ¶±ÅÈØÄ$%)Ð]àuo9È4bëÜH©KC ®{ªçOèÜýî]!ëÉ±ÀD±WÓûvÉyæøöÔJwâP5óÐudûµHºÍå_¢\MoöÉgË5/Ü@ªìÞ$ª]öü¼e¨Ðbovs(/{e_¡Êà{Ãe¢Z^}7Mò©·&J7ÞþVIo¨Vú¾×þÿ´JÄØL(,×ê@~xw¼4¡Ecáq¤)(Úß(ë­Yóó»rÎáòþ¤¹aÂ,EZl\ÉÓ1'ã1Aq¼Wó&³kù';³/ã²>Ò·Cx±(ü§|pÓs¥ÇQJ[³'Õãf%p,ë±·ÒÏ	Q°igcÍCZ¥=M;zÃÁ±h«èX¤àÚ6YWÌÀ¾ÕMå9Æq|£Þ(ÛxmUïmSë/Ú<ýe"úæ_'ò~G=MÉ*HÆ)fG,Át´¡.)}k æ+"»E2	Ó­0Ã0&ö8]S2<= CkXl¦	BÏ
ïé}(x(Z=}äA¼ayTrÒðK	n¢=M±÷Ûéûé«Å «¢ffµíïfl»êûyïð/ÉÚ=M04B;lÉ%6ÛOÌ=}Çi ÖwÏtUÄá¤Mr?baÃ­Ñ7SQÇX áá$u= "¤K£BPU@x=}UÈURî¶xP¾»ÌK!&Vþ^¬ð= Û+¹$Oÿ^¬ÐÏÈð²×
Ü,ªm= éQÒéÛ¶?bé7×k]Á¼/ìÒ.£ÅÀIÀ&Ø ~óªôí¾OàÁjC;ycÃqâ
­NÎJ¼3~G½r
µHìh6zê_Qö>ëª-Æx¡Äeû½ðîe*ôôöB
ÉÝUúø}=}øõùõÄ@éUäÊ 0ÞG¨âÅ}	C|U"w~ÕGvÕÛr\Üm 7÷"­e@Â°B@é0XºH*L²Ùµù$½td0³@ÏLà@àê86©åÅHWù$ãÊ&©¨¢ïI·ÅîJ+·2èÜ×¹¸¶/´Æ¿'xRÜ[«´µ¢í}©: ¢	MbôjrÂYM6*¢Nn"ñcáü%4§p)^;æ¶°Þd$¢ÌâMª~÷J,dH¢Âyµéú¾;Vr!÷Y(ÒG-s';³{FG¥vQq_aÇëE¥ó®*±2>øÕÁü;-*=M+;y3Õö£Mêÿ1þ³GÖ)´'<¥ó2·Äáî]õó¯+3ñYÆHFÐ¼3Ã³ý·$¯mR¥:)¢Õh ¢N·þåÛJ%SS2E®&Å+ä¼ÿjó#³
Âù§Jål¯E.,V¾D)A 'ÆÂg>@8ROMKlàÀhW'ýYÑö²××ÂÛw¤×ãÀ*<Á@F»/èÒÉ=MwíiõÝÃãd× ,²,QÏâ°÷[JóÅ¡¬¤è6Ç®¬§ý!·8#{æ»âoþù¢o{=Mx#¼4ôz"Ûã2'Ú.Ôé. =}çT1SÝ>h\¤ù¤²wçôÒ«$kÒò×&øÿAt³¬¢&ÑSÞÛÔ£±Tÿp%ÁÅt
yÔïðZõ®ÜF¯¸[13+ VCóLw=}EÛ|{ë£YJö^Ì³,vÊÝé!Ë3ås²$ó0å;ù~ñ,s3ÿ3c3ã3**»ùÓ½3Ç³%Õã2Ã×Ó3Ã§iõßºp¬wÃ ¾ÂÅí ·×._¦°ôLÈÖí« OÚpBf¬Ë©wUb,üß³)÷SÆ­¾Ûq~úèÿÛóÄaÂÛµÙC{VÂ¤¤ó&9¥¤í äkÃþùtòCüØªÉ4æKO[÷.iÚJ/EÍÅO§x°k}Þg²=M¼ÏOòjkÈ:U-Zù89^¿wr0ìÄ»Òha&ÕÑ0ºû«ø}êÚr¤»²ÄÕÕpIÚ54¡$º/
Î®lQ°°H25=}ã«i+jÓJ«Åà¡EUFTÄlS= ZËù1Å0æ¤ZV$Ç&4Óuîm_|¿u«ábÁÐTû>0]m·râ _ oðgÄ%fù9wR*Eàêx·Åì¾¦H´íK<ò»i¼âä«-ªíS¹=}Dî°ýF¦ZìKO"ÇA+Ý:ÒFk(*ù-ùj²º}æ¡ s$õèÔ¯#d)Ò}oW#Q6"$èÊmÜE}%\±°îUA©è¿æè=Mû"v+üÇSjip«d8ÛÿTbØ¹UÁrGçÆ|a¥S³FüS¨Öü=}Gàÿ[7(¥\§PÈÂÏrîöÂ»;èGb» Ûn·vÌ³*®i¤xm{d.IF& 6:Ï¢|¾ÚÎ=}= _Xý>XÏÞÅTbÖ~²&ÎÖÃë¦rJäPµ¿÷)ï¸ëÿê§qkÍ15Lì t¹¹³]>2¿QÖ,ÒSÆ±úW¾ÁA4ìITéË¼Â<St½þÏÙ'y]6£±'(0ü|ÑÉþÊpÎ<=MæìÒA(³Y£qE°¶6 ?åsºÕÀ]A"£rÚ¢+ªÄ$A§_1#¦0îH®¿ïªe·kâxbñÊ¤Ï#¶¨ñäT"<§¡C­WÿrìÊ.Þà6Ûhà	|=Mk8²t­EÖWWèÑ,ïÑÆfvá$ÌýØ^&KõS£Î9qkÈ_X odv#\À±sÊ8G3]yãv³CÛÀ¤ÐémÜ%= ¹Nã<ÄlÒlx^Ú7 õ£¹§ÄP=}(m½=Mï¯ë.ÒVsÂÐª¯(jý¥ÿêA#q8Û Ï£=MjÁåë ¯<EýST"÷ÎBOBgïG»CQöÄ/F¾'#HÛ¥a¸ÅCUÉìâ!ö[êðnd8= $÷¦	^áÏfÅÈyÓ
Ê»= fãþ»#ôdÂ+¸ Pã(,èåzÒvÿç¿íi£#ÏÞW¼ØÀ= 
îi·3O>^ôÓó fùV~có&L7BPüÛÏî«ÓÏe¢."Ö)öú©Ã'H\o6Ä4«Æç°Ú%³áù¿1-"K$m¦ÍÅ*¸Ôo±Á= r«r¢mø§î½eP¬+ñÅ,yø³VÝ<Õ»Huô2´iK&BµKÚYpHçô?P%8ÿW®¤ó×@&¥ÀM,dû/ÍAÙÀ^Hz¼%QtmD	ñ^ò6)}¿ µÏÆ´ßÁÍèTR£ñÕ;hâí@[ò¿À¥Õ=}Å@õFÃ´Íüwö¾ðáuåZr³C·á£é¼Z|Ó÷ÝQ?´z	dc\ãáor!ÐaÐ*äaI+N ¸Y,¥\YLXüWq¾P	°ýkwúÅzÉâ¦fÃ½
øêFÿÎ®çòý¯wBiF» ¯¥ì ¢ÉdJ®ÕHÆàÐû( ÇÑ¶^d=MaæcH±7÷ÅåfG0ÊÆ<N}6ÍîF¼6fûÙÝq§Z§aøl%{{%Á= MÔb¾Ê>í7Ä¼fÐ$ù­iÈa%>Wú«@ ¿¤w9q æCÑ@ÜLßo¸ö6¸;Ç[ìcé jÍDW8=}]9\6jHÓFÁ°]ÌX6r]¤yP½AU¯Rqyc\8)5Î¨
¶<|!×³ôAå"Fþ1f]T>#+MFÊªk7¸²'Â^h¸ÛªgÀ4ÃÔà©¨ç>¿ËûÒê
ÆJ¹fm-8®$®©³4Djÿ;!>éþ¯®Ñ!¯ñzÜ}Hæ³üÔÝàä_©°Û¬1=}:2»^óì³TTïEÒs¬tï9Ð xÜÎw$Ù²×a	þâs!¤Äñy2 IÖäAô~CÅÓBãÈãþö(	gfÅDTtÎõiyïCJø?Ñu¯¸.0¸%Á¹Ïÿ»°f¨î-£r<FTÚk Ö >(t5º	Úðq:ÔySÂ.ï]Y H^¥×8°Dì­<°ÌfÞ·.Ö÷¥J|6·=MVÕi¶ÕRcÇôÕ~öB&.ü7(2;êjþ^MäqÃEEUý¢&Üe°ë¿ $ ~êåwç;æ»âçC»G'Sk)ûW3.Qtt:2Î÷áh­21:ÚoÌ»'é¡¥dÏ'Å3IÅÌÎ²!²m £8=M" Tmæ&ÉLòÁ{ñ£ì²æ§JêÔ¥¹oÓÎÿúÙÆo} û9Ós4½B[v·&ëø3)GSt;:¼8F6ãùQÆs¨J5o;Óè»JÓûLÐE# d¯añÀÒõ.5±yCÖp!@>a'S:o¨fâ1ìÝwþpaÌ=}õtu4KJ]fÄÃËû¦g~:¥Óí­bñý³áh¯ÓÑ¡on2ÔO*W§Ló>f;EÂíe±Ð,T1$rR
ÛS¤£ÍB®ÓfR,T|*ÉKEå¿oÔO_¢ÿY°ý!ò°AªUÓu«á#ÊÖð«åªõ×³%-$ÔàÙaëJ0×SQ»§zÿ7­Ñ´A?®¶ôxSzÅ4{xZÑ£(¢¡5{å«-ê&jÉå,Ä²ráMÊÑÓ= AØ¸ûþs?êw¾ç È5æÕjQÝûr?Ü¸*Wtp næ×bÕ_s3BR.vË7ì(Äúã¦ßb|¿ÅyO¯EC¹Üÿsà¶*	I@5~Ãêã¦Ïì%u16ô=M ZxÈ×ùîÕÆôúCÄOþÂªÙxH= §}+¢¹0Éï "FôQýµÁ>Åbo:ç¬±mÂÂmUgÀÉ®´JøÀ~ÌØÑwú­L#ÑÓ\ú½+x­]ÿSc3÷bu¨/igæ =}#Üø°æ÷#Fm"s<%HQT¦aÝ0kÓsàBºlé¥½Ï·ò¢±i½=M¬«xn^xß8kÿ¿j ¨ßÑlámà	ÝP µÙ!·Å^ÁpXä±´gÈüâº$èTç6Ôk'/ÕÐ+2Ð/!Â¢Scl'1F»ÞÕ=MiHùÅ@]K¾"ÐÖ»lTµVÙÝ'²/ªýÿ±!«ü]/Ö*ÖÙ3|éXTíÕ·wnÂßY©xsÅå\¼#¬Iî·Öïþ,Ý&J.BfÒ«á5"Àÿ7i]gJæºÈ3U£Õq/5?UK< Èbé+Z6IÓWø©´¯Z}: étüÞ[£¯þ;^µb@y¿æWôÎ:Û6!þµ¹H~Vnn Êoûó÷	-a0¶½åïLS¼ålû	(½ ðÙrôÔÝltï£0¥s¨W91JjD(0Ï¿
o*rkÍñÜÊzûwßhôg[Çöa»é¸ÐíL|¢^k¶Ô][X×Ïn% dã§MªFÆ©Fj|ö3È9£ °±ì2=}ý¢ «;ò;y{YeåÛ=M¿ì½ðÉM÷òàN²ñR}øË(D[¯bè¡´tÝ°
³DîáO¶3";æFHg¢,6t§H fþBÌ!çRòY-&öu©Üeø#(üý ×F^W÷Û§Z¹.	Æ4Ð.ô½úN	Hü²¸Fs!ÓÈEX<¦(:Qå&ëÇIÇ´ðSõ	7¾ªKÃ\Ê5ï÷8ï
Wïg£¾½õ¸HÝ#v¥ñFÛyté¦!RB~^Ì³Ýu=M§ÕØÏëßÙâß#å°éãmíÿýHö³¤1ð¦ZIc¢èÄÄV_a.X*¬­¶]áeæ*¥-À?0ïð:C\òéM¿LÏßàÊ¾&;åÕ.d+8&#ÑÝh=M¥mÑ<b=MA<úéR,×²ºÇ¸uO4Þ@¬)nE.Q~'}	òu©bµDéïÍ¥¦Ýý~?n$çz>Yß&>¿5?}:¼OH=}+ «¨Ú®N<ôÕÓûrVÅçMsuc¯Ê±gªûWÐPnOü'Ï>}Ôz=MæIä:¹G
Ô¼ÌaÆÅÑ5Dí4´Ýï+ZqVY´<Û¤ÏòãAÔmêêCÐçÑü6t½Ñ%mÜ½aü8qý¿hg=}£Ë"Å¼Háø7¼RvWì»PëHk1mü:d$Haz­W©:_~ø8ðÉWR
séÇ¹+Ç;Ú,}]QÐzÃöíM¨¢´§7ÑB{hÐ¨¤¨Z¤Z¨:¤:¨ÞÕ3×ë:CÒÒ+õgqq#qg$ ¬$ÚRP7!DGìó¡Å´Ö5Á:	?C:Iõ'SãÞëóE^Lóst %ZåÿJv¶¤P9¶ÞóZ¥E·¢KCb½ïæBý°ü©üÈC=M»/ÄÍnÑC=M»lSæòBµ?UâB=Mw
	UgrîB=M wÚÄÿ°|»w®©ürXÝvØ*N"½¼õz&	AÏk&ÁMW:RzhMÇlòL¸ØA#¹A£´Ûv\Ì¦ÎÎ*+êò[wÅ±=}îGkÃëËçá°¤¡¥ªÐM1Né{©ipcË¶&nËªÂYq'lløÓHU£Q$îä-Üê·'<{Ü¥¸2m}a©:ë:Ó¦iiE´°ÄM+oÇýPLÚY8Ä7vLf<Ð¼}ÅT¤±@Ói¹ÂÀì´ëàÒÑzØD¾/pm<Ö
í¼}ìØa¢ti½:Ì'dvÿ­Å&;ýrã©ýY&ürevêpµº|É¿Á$ÇA«±/Z\Î<Û9Þ¾2ÚÚÁÍ|êüô6Õæ÷§¥_·ð©±Õl7CÃ6o)}®éôÑÝ)[WàÊÅDÊU@AjïVËD¯V8pU½p|ï¶á«1ä,Õ¤¤ÜJò|®ÚÈ>/Tõlô|<üÓ$ýß4ÚØ	¨ò_|íüeílM}Âî¦]ÞÍ9Îxº	£|LXý!o4äIï»xÜþ+æ\Ç±Óg ]1[ª
\ø¡¦£¹H±©§$õ©)i±{¯ÿÏsÎËy¥ý´]¶¦cbá¤ï@\Øu·EiLß:)ñßv®I¶PÍf[3)þP{OÓñçè õl¹ö¸1¨<£MhþBÞ÷ÙÀ ©Î)GåÃÍÁ¿]§D w*WòÄ²n>!òkùq
{O7V²×¾KæÙÌß)xÚ½ü'ØU^x
MVÂ¼QÅô­_±LÂ!µ&Ã7 Ìr«Ë£KýÚ¹1Eb º¢øOzPËWK=}¸½µNö»Ðqn/ßÅRË &°¾JtXÉ]EBSÌïPItù¬Lk¡m%2üfµ=}ðA"äeÄ®Ó0wd-­"f´¸©6G#?ÿÔ;>j[_úìThò­¾XPZy&ªhO¢ä¹
[*òÝ½xÖ4= æ ó6ðô£{¨jàBµóa½é¿zß=M)÷=MúcdK»Ð^hT¥q.y#_@Ûµ(ûaRf/xü·àú²èä|!õÐ_0X(atêðýÄþþ}Ómn?UõçáWÌèÎ¿§¥6þ²¡]Góê	ø­#û>Â@=MQf¥÷í¸P±àÝa 2¦¹àºóÒ['øyC?ZF 6m­¶ànÌ³°ÊÓòOþjÁØÌ(Wúø©AW¾NºLÇüÞêGeXðeN:ABÇe{&,Þ\¼"TH¦*lÔ:ëeÏM-ÅÓÅ{äþEV;PXÃÊ}$Á¸Öã¡1	eY¹f»L9­ÿl RA>¹çÁÝêõ»_w&tkµ}·î|N~iÅ8e¥,ë1ü½Ó^õëÓ³qM-uwr"éÞÅtÔãº[Ûè¼çnE×5ôw'oI;Ñ0c'ßz"ÂÇ(¦;Jä0±Ó0QÈó9-øû8¤¾Ë¬W%zÁøO½ËðÓ&­kë ¨B´§Dªh#ºÎSªÒñWr#%²ÈóoEZ³&«UlDÊHó=M/&óß#Éä;ùå33Ø^PëµêSÊ],,6ºARg÷lNm.= âX»²±iÐö9¡ÏÛ­wCc1£ooÓÂ%éÖ3Ûoo#rvÈý²¶ÒÍþ8¦XÔäÂtttMÓ4NG¡ÇUWô~<B[mÄB?¶x	Ó¿aohmMS|ÍqxóßfÌ8K¢"Az_â´úYí_de6$õEJóÓõWÑat^÷Ïèµ²¶ûÅè±qÞÃÀèdYHtÔ}TÔzÍåbVlÞqØhõþGÛú!u+ßãÁ:k£!ñî«3¢#O¯k;+»»-=}F¡ðË¼kÖôßI	<YYmS-TÅ}æH¿¦¹fXÍÎÅ5Ýh	rå²&]ÍÛ¢½DGCXí6æáÊ½¦úKì¸È´ÌÉµOg÷=MÄÍ- bñ{S3Õ=}ófÔe¥¡
Q^üyÇáØ~0Eôaa.Ók®.µþ§°«ÝìPÔfææÆ§Ï|Dïá×{ ¥Û»·	¨Q÷nÎu¦= ø68ÑdÈ¸mÆ¤8§»LN[-¿{Å«\?P_oëî R¹0y|mÎ29ë¯ëÒ5:h%h8uNhßÓÕxUl°ØW6µç¯¡Eþ´U¾T|]údû¹V0ÔKáqÉGTQ)/Ï]Ú'âþÆøû¡×1ã<ÌQHuþãÇ¥É3ä*¹4´µÏÜk
¥tþ ìAÜÞ4¨?ì#Ê= X¤Ë¡wIÎI¬5ÜhÚÎbâÙÜ¬ÄOÓ6l£Ï%Z²þ¾óÂë²Oº|îÇS2=}§IÚÄ¥GýPS±¦þ«³ñÏ3k)4|D¸¥ðê¡ê¡Olê¡ê¡³cÑ­ð+O©Î3±BÄ<¢äfõ+ÔpC÷ð§sß§ræ*!giYC/ÈGK%y:Î¢WeWmTYÐPpQ°.}±;)ÍÇeÌ8ÚBJMjO*\V¢BR9ÌåT;.8,¯=Mû 	¹ .¾íþIùÙ° Ö¶éþ	£Ij<*Ën"2bQQ.}ïªAXì¦ùFIÿÑêaØ·a3c*oÎï®9î¬F~;W=}\Yà¡ò±sÛÅ)GY7êÄ\_@Nÿc4Ã%,0øCoò_òGrqAmÒERB¢NbP\Bkê7=}nZH:UP5$´W®ÕG×=}Ön^Öh¾ÕT&VK¦TïÅ7íÅCyNÉCá7ÒL´Ý·¬8Æ^-LÌµW,À¶ëOZHF¥¥7@õeX¿[N¤C¹ýëCªV6ÅÌÀÏüÉØcJRæXF½\àø9ð{ÆøV=M4¹ÄOÝ$¹§eSBü½¥»³\8¢À±ÆæÖ;qØ#QÐ±ö¥ÃXHo<ø6ÓdHY@=}ö@¶3ç?¶d ·Röä!á'k{L0ÞZ­ÕîM*]qRRï»ÞSÄÏ¯Þ"ÞÒUXk£Çõð;ÀWd¥d%:)Å9:U¬½Ð£ûéaìcÌ/cÛ3±	öÿl¡M£; SÙÝj1ÁÔ³ Í7È= }N¹óüþÞ íëññáÑjÒ¡«p	ê¡r ê'p÷¾§ô³ºWf÷ÊîãÈê K(èLìiE"~·õ@,ZKJIöa3¶[ÿÔaP9®÷¾µ¤<,¬Ì:a§¶¬s<R@{÷¶Ç¾g=M?ÿU)®§OÌ+ö§ÿ/U1elMì3Y¬A,R ,80FÆó;£DJîHyÊ¤ÀÖXuåd%Îñj¾·_Ù_¢%]®^Bÿ°^rq{÷píå§ÂÂvæJÕÏ»+³.èÈº­N?wï$©ýßÃìÚéªâ·ò­§)=MÙ#«¦ö¹'OzhoÄ¼,/3îÿ%jÿ«(ã_ìfô	I= FÏØÎWÃäàÀwÞg= ×nþÝ=}ß?r^Á¸t¹æÜT^Âum^J´æ»R ñÕ;S\òzöéû²O?9QWNõõA&5gÕ]°ïÉÃÐ­ò½&}g­v÷khÌp8Ð=Mg ¦Âò[§ 7³Ï[¢®ÓÆïéùIíªº6êyW«¿NÛöø^©5Ï¬Ý}Æ£ïéùI-*Ãíâ>ÔÃ¢ëä0HÀïÔÏ¶Zã9×Fè=}®ucO)@Û¥Ü¿Gµ?sN«Ü@cRêëÐsrsö«¡¹Sý'-ú®-oGÃ sóIsöÃ sÅ1Û*_Q©=MÕq-â¡$³#-Å2/#(²ÝûÃ3çÃãå²Xò)lxEw6]èZÑ >-Ci(X§mÀ¿û,©ÅÞgÖvhaÿOÇÄî±õó0ñw,á¹~{!ùmà{MÎ¾©®=M>,K¨lg=}<§U£ÇÖ®Þô®Ú×ÊÈ
rgó#ðòNlÁù°~ÕÁÎ]=}]¡o¢ê¡²A^;¼
ß=Måþi
Ý¹ÏÊÒ
­$êOè%rp	g_zèf?4ÇLÆj¬Îlº_ûè1	eIâM¦ûl1ÿa2>óG¢«RTðË]HÂ÷É¿_|Ö7{¤E­Ëh	QY!k~_2ÎâñçÝ)j[¤KÓÚ¡÷
ìïêò}öaqsâÚÇÒ)çm¸? ïèJÉG¿þ£ÈMIzÉWÌÄ?]ËÊ	)RlB?óï¤°Þ}ñÞSÞÑür sç§hºÒÈ§Zã¯Ïl×ý­*Ï$ó­gNÐ+ç©s¢ÑÛâ{äïÍ¢ë¨{ï cx{{W!ªÊOüùÌ}}TéWúepÌÆ~®°F|6ÀûhÇpS&\*z	=}íNÁ1i:h°¢,Ýú¶db
3S°©AJ= ð­ã2?È·²dhîhzhiNñNëß4ëzèz×{×áeWB
¸1ÁÃ\¥º¦í@»ÿV¾8ö"g­3.ZLøT=}­-ô{ÖÔS¬6/£ õ^u	TódBtË= D2
ñê¡áã¡ê¡ê¡á¡*2/= òËeQ3íB©hÚÞîg_²ç|Þá¡ ÂPô2ìóU	Ä*; ¡ô*|}c6Ô'éíèîNoVQô²¬± Gã«Bõ|åò¿®´ZÝ|?éß¤@=MÐ¹È×%çÑmÇÁW@ØNhunQ\NG#½W=M<<B[Ýnéøç5ãÕÛeÎì Â= ë{oÍÜGÂöÛeoE E¸[»Wmëí$2T÷2¸SÅ)qs-whuyÎãýË¾¨JA0 R}Äág lwÊu]orS¯Óð,çUýÓãª-æ'®~A1ÖuÎÚíNårâwîË'ä©C¦P"í|ÐÐ ùå-ð>"X¿¥oÉ|Â­álmÎ\«TiK/Í"x*k>Øÿ±{lQád2|=MÍPÒ¢{ªR¥o##/§®ÝÓúÝx??×R mª{bÑûm¸ÛPx0¥2Â% £Øo½@¢þ!¬gâ¾¬°úØOM«Ã_¥³Kæ=}±."¼KÛl.þ+eVÃj¢NûÓÖã°S[ÔeÂÜ%¬?gôix ½çs»=}S"ûÿÚ]Ó±xjý&Ü±?\ãe¢öµyV"uªJOÇ:/J<½tdExÿbCû¥;Bª<HFÅ5|k´-n-Ñ'k§-úîãKAUËª çÊ© {|?ÍµÓa8¨®D%álØÜtÎûhæÀâLÅ&Mêe;ÝOÜ1N_ÅºV1þÛlcãVqú×äiMKîíwõ¡Ì¡É§M[ö
¦þÄ²Ú?å#= ÷!~¾¨L_â°Ê*rÚE!Tb[¯¸=}ÐÎDqÄ%P¾=}W²xÊùÝ VØÈÍùðÀ¨?y¬jrhxºý#Í¶hÂ»åi´ÄÖWenÊCÅ²Ø2PöH+§@Cåkêú/«tîÌ²¬ 7RØn!#¬ÃÇL¹/AL½(VÛ¦f±Å¢Öqõ ¹Ó)Vê9êÐ^Ù|#SÝ[¢X$aC¤DOØíÄÌñ[k´(i1p»ÓòÁå©cábãÆìáû#|#¦Vµ°¹¨5#T!õËÀ¹èê?
®r[p¬ÊG¬?+¦rg{ Ñk¥PëôRp¹({bó¿$§ô¡Q{nÒÛ¥J·ýÂªw®ÆÌÔÆïÎç_ÏF¼s»¸3ë@^Âõ
=M ¶ßt´[Ä'¬Y¢ãýXùÕçüA61åGÖ2!xú x]ó5¥£3óo¹&10-&ß&[Ié¥I|i= øüÓµåbá8eæÊ|'µcARefÁdïb÷ <°Ê"°öqÉe3]eõ|m²õ
îVzÔEÂi÷ò]{îÀ6)p¾úH#¶}ðöìë@W³]GÍÕÀ§~=MK=}z3V0ø¬ÊrDÅ­Tw©äµ¨^ù]ÒËM¼¨\ëpy:nE×/$Wz3j,ÈUiZYÀÀþÚS4]ð¸¥c©wXS×²¨ñô
|C5#qþ@´%ÃK!,ÒÇÅ.¦GÒÈ³´E°d±¼@pü«L÷z©qÀ²cbÄ¾ÈùÂáÄ± )Ø60Sø7èõñ+¬RWs´
4êx¹(okxúí­µ/å)Pz¯¬M'¹3ÐÉ¢ZÌ(ÊM¹n|'@wÈ¦î¯Lx®7×/©øüéaülUz«}Ø¬¶ä#ÚjÐ¿áØ®Æû°-w;
	Óø@'tä´á_=Møáò¦>IDÃÓ²ë
±¼ñÂ[61µ.ÁÜb]à*,k*§~#c)Ã³°ë0;ÎÖÆ¨?ýW1ó8Å®ä:¯N<,~W
pz¬9~+(fÊ§NzºxÁHÙ£E§{\¹L3PZE°gÓí¬Ã"@÷!Ú$_òÕG²f²2\sgl"{ìÈ¢= _ùÇ±øê|¿Mø­éryþÄ~p&=}xH¬9Vë²,Ì r1xØÆ4Öö»ZlÉR×3WÁn%WçFÒ³ô#±<ÅHE¯ZjÔÄ9YR2d¥´a-:ø¼íe±fê'T;[á¦Åká5fIæâeÕUL¹±o¼t$
øÜw÷«8g7!Ü|r)öp¦F¡å©Wº¬#¹°·ß³êXæ¾Ü$Rñµ«ÅÌ¡ôxó´q,7ð÷)°u2rZÒÒô­ûË¬+a<²¼.3d5¹)3ämH$nûÛ§Cµ3í±0ï«P«çM"qu-;#ö¤= µ3 ¯>Ø;#TÈô§´È	2e/kD,Ã£ôÁÝõ@­óó4É³µ(£ÔN33CýóØ¥^/üÁ3Mµ/@ãÅÄº-ÑQúv¯ËùìbÖm}ÁVH9÷½I8WsLLÅ0wnð@9EþU¨÷c¸¼Uð¾[Õ5ÆjDOBéÌH£\¹,VÇd=M´öîI5´ømÉb¬86ùNô!Ý ÷Õý÷LÃø{8O~Tz1Á*ÓÉ0~.Sz³Tjz{Û£HK3Ý&³t¯,¢{Ó·½M±¬DoÆ[^140ùiÓÜ,z¸·¤#«æ9{63².4#*§àÕ7·¡¬Rë
9á}I´	ôØc£Ñ¼MUò4>)tà0¶=}b<R¬Ït±cÍ?0{1ë9D2ÓÞ3¢]§,µ2þq2¬xùÈÜ#«Å±5}ðoòGfID3%S×2C	Sº:¼îs0Åé´Á½=d{\1-=M¼ìÅ³)+÷ÒZ0ûóãv(Û3yÉ2®	×E7NFNÚ:©<sßÊá0u$:|ÅkÖUO§KÝBé½øå[ðÞNó '0ÃÚßB¼«àÑ+;7û"4S¿uá¨_)î5F¢¾Q¨ënw>°
Ñ3më³¥¯ò!ähâîäÅöüãääÜ^\88Õ¿¯\¦BåØäû¼öêMSÚL«u¯|4>CæÀAgn< 
¡|£WÔRîÇoÜÀô¶ù:é~60¥ ç8JâQÌwtøeb0kÉôÓSTE3"	286UÞ£+ÂVdÚ wNµøùÿÒF¬²ßè$65¯>ªÇ´!pç±=}#¼~¬yé+7ñ8ë¼Z¤ËÊÍºHvóëzõrZt+xT¹Z¦u^¹Y_±àC-a¿ÐW3ùWKî¢²gcÊuÊñÿh0ÁOa#çÑÃñRj/ÇÛ%k#l0½ïb&ò)= lÔhj½ûÓ»II1rÓ¯<üÆ'ç6M¯vm»Ç:G^{Ãr0«r«Ë31Þ¯5§£&¯¿²bûíC÷;­v½-ÞÞÐ6DN£¾­5ÉÙ°	Õ{é·Ã&üZe|+¯Ê[>êaAåìï%uç«H^vz-}åsÓÒL'ý³8*,k%mðæ¤*Ý©Å9¹Ñ« (Í¿"ú Óì&B¹Ü]Xî± ^9#4µ¡®(=}øP]së°&me.ð®CÒ/§²åÎïãÎÕþÑ«]Hº.|w).®]	q9beHzHb©@g{LÚ<þgûY¾ö\À3¯qM²ØÒÉSÛôå­1èÎ»= ø«.×|¯g¢>Cg{ÚÝOÛ±º8ómN(	·¶&ÓeDENÂ*s$±!|2;OÃNÏ²ö{
HìÎúÓyW¼Âg>²ô³]õN³ j|Á(I±÷¸÷EÇH¶.q_ #wû¶µv¢%¥øTUò½ªU<£bÚ-¦ú}*RA°ðÆõ¢¢<ì¬PSª0,,>m·ñS³W:uÈòÇÍù³G]ÐQf CdPA!/= øÖT­J^S·àhæ>ºlÓì¥3z5Äë"G	õ|ï÷ÃÞH
±Ýê1ß8)Â«nq;µ²
G~d"|Ä.xô°±ý/©¦ Tà¢eÿô\ o3Qµ^·|çÉï%¸®c=}ÀÏªØ\0p§ A)Û8ðk= ÇTv@÷K.§>pÉË£G5=}XM$ÁçºEÌFñ
izaDÓüh£0}¨"©"¯û¼<hôäÿ¥è/Ù+=},)®·^%í8èWußt¡	)!¿£D\= $óZq´Lm,ü&¡h9NQ©NGDÛ ¿È@éì7ÛcEÏÖ]?õÿþÇÏGäkN¨ï!DLÇôïàp¢¯s)H5¥±+ø2.>èÐõ661öhcÐ@t«ä&<@êÐ.å×He**X§Qq¨	*ä-8(ãmåxÖiç&ú-D|lDé§ç<pìôÙû8fkÇîEÌô0 w3<% OY®ß< ©Üéµ$ÁÆ=}l.ËËq_ÏéÕºÇx oYq×ô@§&c¹åpäæ²
rý&ò|Qå¨nµ´ùÅ{ÊÚap= Àè,N(ç¢êÛM»d÷ì¹u
Åð#¤ÎÓ1äKÐnÇ¶%q£³*ß:q¼ÉVä¡ Ò|úan5ÌâÊ#VÅåÊ/Ó±Âëüíufµh£YQõàýÊ?=}MÎ¨Ð«ºÛ+fJ%¤ÑmßZD$=MîÛõðZFóËã¼ XÔFjöi¾ÖöN#Gl/Úñ'öø\w#ÿå'lùí%n98«¡K°>t:;ûyÓVTdÑÒeä6"ÉAé2Ùtñöc=MzêÆ:²Ñ¹{¢í/ù6=Ms òÂkéY$¿<àKï¯Kÿ7##ìzuÍÀ1×kÈþUÃ)ßðÐm[mYlªóU-í¡´=}µ![·ÛºW)©#^<Àï¶ß_ãüd×Xïx¾êÑNG| Âñrv«Uª/¥p<ÐÁGÓ\±üû2	~Û8v¨SüCÂtÀ&±à[=}ÄË'{KAX8bëi#j"Väî¼]j20Òã8(H­zSd×Ì.pÓDMkT}ßäs¹/U)ñ/%®(H¦þó±cÆõáãç\ÐMÔÉ#çKe~O=MÑ×'À0_®!§2 rì&|¼
¢	tõ©&Z×¶{¨"´|£>¢ÇÒâ¼Þ§Y¶½p0!ºa\$1
?ê­FPLn¤Ñ.>ç*OCË·vjüLÎb~=M»LSm¯ý ¬MSÓHO3È/§2&'QX"/öÑö®	!úvøqßic¹M;ÞúEOòð\õHÞÃL§/Ñ»ru,A]¹¯= FTõºoaÖ]èÿÞYàF l½Ô±§ÒÐ s¾où>\@ÎÍñHD×9oªÆ]Ë]ðîEýJÖGËqA=Më\DÙªÊLPü/ÛZbO¾%ßå­H~OvCÖ:0ËHvì¿/3·nªï\ÜL1¥<â«Hïh3%¦mó§´s±ø=MRII)N0K1R³ñ¦À)AÌS»½Ót»©¸ïËn-©~ÒÉöíó1Óî´ÖÁ7l¢G
d<§L¨eªkã# äïªVoo¥!ºáÀTÆú¢û=Máo *2Ò±*
±~ÿ#Ò3ÙÀÜFÈWÜ§H
åJ= 1ø«{5Þ9Áe©¾9Ã"±æ±ÏþuõBäÿ¤×¹f¼~}K¨©³Îe+»3ÎØÎ¨ê	Ä"uIéæ@h¿?ï«Bñi¶T+5îÔ/JcB_úáþ³1â!¡Mq\?m"¯åêáh¶ÜNÈ;¢°ÛÇ=}ãd+¼¢Y\ç1çCÒM%)ôÏ (åÝ¶¨uËáNç ¼Åþý¹	3ÚàÌþ}K¨É£¡0Á¬þ²²A©xÙØïÁ}O'Z&úî¨NØ?î#õì= ê"Ïlë¢nÁ+9!°ÿ¾æ= RJ*{rSQq\CÞÎ,Ôõ7â.1ÐkW_Aþ D¤°¡wí5A²Ó®îÍi÷ÕeÆbÜpèÍ_¬½ õ´5Ih|K¥ïä)f¢¤¨%
rµ¨NØïôL[ÿ&?y*>)ÔT±ãÅ¥Ë¤øö§ £®ÙÇbÜ®§ÛÈ¿ìýö!½ñÚ/2­eu«GW¬ VÐ¦yìÚÛË)Ôñæõïvp©=}A"­zAþ¶RÜ¼©ðqwÑw­eÆ"u¯óNë4shÉíõ:uîÔ:)° &)
àç¾¨um}Ý;'¤²Gë2âðÌ~}«? =Mßí¬·(ÑWR}©yîÔÞñö²ôa¯êëá'kùÈ_ºbÜZ!Ó?lY
}éâÚ®ßÔþÖµq¦ä µIpVPÞIi\?ÞÞW1r2p¢I%hÒrÅ|K+§©=Mmð{¦7n}ZÜVF¤^?ãíM&k	¾ÝÐ¨uº§â%/[ízlÈK]Ú>þ>¬º¨ÆÔ¶î;>K¯ZÊÉä:8i=}¼¤Ô8mRÞä± ~v:bË-´>éÈuÍ!!(çl3t çÚaOzl_ÚJQ²é÷-lå³C33ÚðÌ^}A§°ðq½£ °·CÑf¶~ÿUÛÎ[$´¸µåÙzlÈIm¶¦i§@ß.¸Ôó]ÇZÖ9"° ÜJï ÍÆdßNQgF©»íRù Þ?×·3ÚðÌ¦"4)N³Û!u±	ûg.ÏùCþ¶O±ÀÎèKó}_¢%¯ÄÕðÌÞ}«[g«7s±rÐ^)uáÌ^uÁ¶îßè2ª0ü= SÙóµùVÜT	äR¿gO¤ÿqxZ/=MBÎbÜ/«r±>îû(¥Ñ¯MBh¾ÔÈx5YW7ìí,Å0y(ôô	ï3S4>>2',1M01æý	Y~(= ¤ÚÅ­FîptCà³Ý>Msq\K¯26ÎbÜ¯µ÷bOÇ>eÁÞ7>Ä¹Ëùë×²,lñ}®ftIjAeSMê?-1ÒRxß´ lSßQïC*½eàÏ"yßÔÖ«b= n¸Ð0â«^àuËCþFaÛC³¥8 Cë~j?þ·^næákÊ¾1O=MpÔ rumª#;e¨áá=}-(â´u	O®øpsµÂËÉÖû= ;u)cYÕzãë!â'~zè8¶þ×GNÓukoùí	Û÷¬91¤»Ç'{ÐwÃGs9^µuMY×ÊTÕÌê×1>È9ÉîbÍË½ìBÂZ·µ&ÔáÊ gÀ²ìÚ)îø2hY7Ôò'­ÕÛÿã7"Y¨uá)8RüvjéócÑºNÈ9bâdÄzûIÁÚ~R'±­è vë./v§xÔ uuiÁKxdmýSÅKÝÈ¨½Úq® ¯5®0àec+6îÔÆÉÍq;ÖUæÔI QÔpìý_Þ§±#áÃÇ KÈmX#*¿ÆËÕæ!Ì¥Æ*£¤¨uòpÎÍÃÔ;VWÐT5Á´Ó¢ûøHÔåó²ù(Í{Þä¢í )ÎvÈó«ï=}(rÒw)äÔº5÷¿µ/»®ZkáqÜJÈ½Õ<ÑàFMÑÁÒsi\?^å²O¯EM7Ì$¾TÞ4u¸*FÞÝ2]4qq6r1ÝH*òÁöë~êÀÜHh+oÃB³ìÀÑOïd÷êTÆ¹iûz	¨9¹ß,ÞÜZQ&gü¶z)èL£t"ëê²ÚCÜÔ¾µ÷·§@-?Í/>®´uÓõYûÖ
·_­;4þ¶²rHkÆy'«³îè=M2µzîÔ½e·kJÑ©'®Ã1ÙyîNuNÕÎEñl% YâjÒvK©¯Êi¼Ë)
4îVJîgÕf£À;(8Þu­}ÈW\³^ãíhúÁâ<È>N
¬ G¾ÉoM=MÚ>9±Ý³ÿÀê¥ÞRmIÅb2, %h-¤ËÿòÕ(zîÔRÝµM!î"§ÍhøÚY|k©?ÛW)= \n£üð¥ÍU¨ñÔ?ü#+Ú9ñÉûó­±ìbc\_.n¾¯n¿92ÔLT@y,4ÚH4ub>Î¥T6T¶6\Áö¤yt´H<T¶D<6ÄØÜRU?8×CÓ332§Ç\J¢ÉÅüZFíCyÅaðU#v:"E-3&ëôÂ¯ ©ðÓ(Àò²Y;ä3¯¦ö=MÂ,;£uÀüBSÞ,MsÄ_yVCpJ÷9Fo æY$ÁeNÞÇtww®ÔÌ 2=MlÇà<D@+ÅÐ©Å¢GÜËD2Û¤âpÖb3ÃM*°®"²²Qä,ESj]X?£Îø£åX
ïÁ¥ÞÑ¹l×À= ÄÏ½= 
}àd4¡Êè¼u¯MA]Ýe¤¹÷¾Q]qîe/ÞXºW/M0Y?î=}ñT8VuÃ.Óã$^ã¡Áºí ØE6ª6æu¡Îp2é8üåïýj1z6Ø±Äí×õ5xÄ÷I%lÀü¸XùìºEHäâg	~æ+¸á@¢½¬;Ä¹eÂ¥®®dÁ²«;ÈMÏ_ÀN%ÝªÈì= |ÖX8Ãe³;7¥sËjÀ-48\$ n ZØ¦*ä5?Å"ÐöZmuXAn hÄ"¦Æêhª¢9³"Í×´èrKKM4L9À2Ûµ£e#úÄÀ\Ø.=}ß²}Â{3ÜU
Ï²eÄ½G¢?í ôÎå+Ì$vµÍe­m[fK&[ÇÿBÕô%UHa*tsô¶oûh=MFàý%ÃÎx¸T1á¾ã§èM,VÆúTÜ,º½oV¥Ñ~´NGÙíÕ¸ÇªîüóäÔSÃí#oòÂW§8sÐd¶9×N¾#~ngëæGéÃ]p Òù¢ÿÀÓ%¸·ýêÐJåTµÔâ³U)Ïeû^^þ	à$±ä;ÜXO¢ô¸± CÊYïÅÀÍ=}LI*WªÑ¨ÑeÀM+c7¨Ý­zº5^0ððµ=M£l)©kÿE,ò¹«»«¨R?1ì!*QY­SxéAí= ·=}&OÅg
f¸.ãÕÛpÝ]ÜuAs¾fGkíÑÐGÄô¯<ÏGæ¬ù#_/ÏUb.ÈiÚZgx·¹?íG÷Âá?M#ZtæÄþ3ö¢êGýÊ1ytK'¡­JÇÎqð ûy¡6îëDOìÿj!5:ìeNp§¿>S¾¥óI%Á°ÌÉ½øñÑ\<cYü¾	W,¨¬[-7Í10qßNV³ÇÐ2b>= @¤æ Ö¨NkÇ¿LÏ%ÒrµÐßCú&ËdV²/ÑöÜQìávr÷ÎÃiáx3-ºù©*ÌèàÔÙAàOzW¨	»¿yDÍ~*z2fö,eD3ôa÷°
p,ê4CeoâAÃÂ<°#«u®ôÉãøÂ½×;¹=}ËÌè7vûýÑ¿öà¾ÝûyÅýZâ¬Rù-PÈG,w a.³plF­$X¸xömÕzù$ÛHÓ¶ÛË5^ÐFaÙ&%8ÖÉK%ãZ~f&<
Á«t")jP#ÅüK3@¯¥~ A»f\n*Íjm%q§Ç-èb´¿
B(Ôr¾·µÌ ÊuÚJb5ßä'±à+ðù¾á¢Î» [{x ¢Wi"8×kØÿ?#ZB±GÁçsçØþ}¤ÈÕíaÃ°ÅáP±x«l¦OMÑÁìlr\­ôÄHcpçäß·ñX*;§kE÷ìÚ¸zÕàstÀ=}.qÖDc­þ,u¡x	Ëä_ho¶EDÀçb¶>1nhÂï¸kÖê¤Yð@5ñ^¢ðSÎ±ð= 2#0>Z¾DòEÏ£Zßfi¢nÏè¦Ì©âÒö9 = ¸ñe&/ÃÎü\Zð1 Fñ\ÉÇ= NûíÖ¨i W-ÆÚ®oæ	üÁ½×ô5}5ð×DíÍÕ©>f\Þ ³´ýs®äeê	ÌF Édgá	óè¤.úòC|ûBÆOØ¸zë¾&±2îS-Ùh Puá±6AÒWÑº¶ÿðÍ:= ¢Ùg}«No³£õk£°W{Gb"y§úJR$YØâz=}mª¬«ª¦±= bðÇ[^íÂº°Sv+$ù0huSý¯ß|3]"Þ´_{ã uêëÌ§¿èÔd¹0aåHÏÁzzò¼©u5(Àÿøo^òTZX½pSCG/Ç$R­ïdj¯<ÑTCBî½f°|À÷I½Àß¤U{¼ëxí[U«×h\úI­wJbÞ{;~áÙì@Çúúìp{3íãö~:ïv$ä·çqÆkÃ×½nç£ËÔ.âEk? ÉR¥UÏKOl×Öú,Æhì¹Ë­P¥°¸ó°Ìp^¼q­jèÓ¢®fËx°Vy@D ùó.NÝñ©¾¦*úo!võxP]<H­ÿ1¥Õ¼æUusÎw	7(@ÿðÜL$ÙÀ-$ÇæÎÇll¡á JON«T3éÆïoÆ,¬YÒ]ú 	þT 6E?8øj«8Ò1ÕQ\Ú[À¡9MeÍÜ'­àñúZÇ	 2eÉ¬ã:Á	Ú£M/°íëÖÁ)fí&KrgtÞK	þØYjç!JÂCÏ¬Wí
càÈ½ýr?¢±öaÚÍp9§ÚNñÚÂ5ÊÁ»ÄM²oSÌ#¶/åÀóøó"z(´'÷øÂã÷°c-K«oµÂËc¶° zëubaÛ¸pìl¹ñ?­ ó»ñEEÉ½ý8ùevzÀ/ñMRâú¨ùOî7,ïÌü&fNG»ÆÑ7¥¨ÍÈ©ÍêÝ<¹ÿ¢êHm¤ÆoR¦¢Mï§ÅqÂÔyO÷Ç
¦3CBï&TÂëvL^þ\= ï¾ÖÚYN'ÀÌ1K³Bû[HªåÙ\¸)ý Ñºà}Sé«ÌXÍô¨ÃP¡ðCîÏG\lÁÃË9M1ø~-3(i ñ;/÷ÝøÜòÞ¬]Êí£ýÚî¨8+Á0 ²>Yd¢YsÙ¯³F[ë
æU(oÚ»¬0{5'	üÓÃ± SZ¦lä·ÊÛÝ ÎÆzæ9æ#ù¥  còYd= ÇäG-ªÁ­eË$qäÊØ­Ñ×£É=}++3´Ó[:=M±ÿ6/hþ'*&-= öJÔ¢öªë% ÇAy§dCÓ$,a
0ÚÍmá¹Ú!Eø±öîZÚi©ï×´ÕPhèÜj¦³øU­<=M±=}ÆÏÂÁD¿Ã&/cir¥ãcÁ)= 2,¶c*E½Ýõ*FÊûÔþ£FÏ.Äëú%²s]¥ÆýøU¸yLÑÎÿ.ØJpBGë´^²nÀ¼ñOGæì;L'#5zÆj@ö	gåÛêá£/ ê¡ê¡±ê¡ÏÐ_Ë§$/ó~s)ÚóÞðOû¿¦Hï61£öÏ) ÚÐ·5'Õ1ÿümÞo.£ºJÍÖ¤&NtÊËl»b¬K=}éìâcÈ$gÆ¢éj,¡ö5^¡õÂ-l.a0-Âî¨AC$º@Äè¯B$r3/=MtùA£Ê©«¬ëK)Ö¸Ð¦ÁwS¢Ý­»â]2æØ,"vÚÚî§||}EÖûÊ,uWÈÿT!
éÇÂº¿RÛ­ÒnãblcOöyúgÒÂ
)|o¸¨!Á'Ü^æ¬¾KE^g² r©/÷UG»¾Î×îÞû¢ËÎVZ¹¼©¾ Ò	í.!Mc./Å©½ðÅ}Pÿåu ¡â½ó?å±Â¾ÿnSDÃiãÆÁúÑ¯¤Ôì¢]Åª-ð:+qI¥NQ>]«uðîSA²V¬ P±ycU&zÇûxÃ©ÙKíU¨á¿Q©ªr[îShëÍ°ñí±}ÿÔ÷ëøÅÜy¿lRßÝëÚ/0Öy	
,= MuÄMÈcÕ6=}¨¢=}âA&»¸tÑÏíÓÂm04ÔàïTFNu±e@´:µpvîEþ§*XqÈ»AHÁåRH Jû ÑÐBG4SNoÔgïæ¦Sp?\NoÔ'&´¬pÆ¨úc«Ô·¦Ò»ÆÑÏlQbhZª´ÖgO©ÍQ[ÈÐSiBhÊÐ4yÉµCæÊq{Y³µ¶¹>³0ß¶Ø.,.-;8²m<AzÇ=Mé=MQË*¬øÁKsuöx½3x2/9}ã)'9yÑ!lO!~	ë¡­GsÊp<tw&x?ÌÇ7§;<£výµïÅò¢4}o¶%ýâ,î¡NG4gåD_åEo¥D[¥EkÅ=}\C%FQ½wÆ¬Xr}tFÆxX%c±0ý²Æc1Øs(Ç±[[]²Û0³Þså3#(w7M4}ÈàaàµcÈ;kXÑÈJþon4ýöFÈ½kÍÔ= @,,yÓ4`});

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

  var _malloc, _free, _mpeg_frame_decoder_create, _mpeg_decode_interleaved, _mpeg_frame_decoder_destroy;


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
   _mpeg_decode_interleaved = wasmExports["n"];
   _mpeg_frame_decoder_destroy = wasmExports["o"];
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
   this.mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
   this.mpeg_decode_interleaved = _mpeg_decode_interleaved;
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
            this._outputChannels * this._outputChannelSize,
            Float32Array,
          );

          this._inputPosition = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);
          this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);

          this._decoder = this._common.wasm.mpeg_frame_decoder_create();
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
      this._common.wasm.mpeg_frame_decoder_destroy(this._decoder);
      this._common.wasm.free(this._decoder);

      this._common.free();
    };

    this._decode = (data, decodeInterval) => {
      if (!(data instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof data,
        );

      this._input.buf.set(data);
      this._inputPosition.buf[0] = 0;
      this._samplesDecoded.buf[0] = 0;

      const error = this._common.wasm.mpeg_decode_interleaved(
        this._decoder,
        this._input.ptr,
        data.length,
        this._inputPosition.ptr,
        decodeInterval,
        this._output.ptr,
        this._outputChannelSize,
        this._samplesDecoded.ptr,
        this._sampleRateBytes.ptr,
        this._errorStringPtr.ptr,
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
          this._outputSamples,
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
            this._outputChannelSize + samplesDecoded,
          ),
        ],
        samplesDecoded,
        this._sampleRate,
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
          48,
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
        this._sampleRate,
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
        this._sampleRate,
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
