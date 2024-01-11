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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode018d9092bd4dÉÙR&£Þ9wÄËxEÚXÆ9Hm°p¶Þ­Êü2$.iæ°s"O6·Bm».Hïì7ßìg¨íBkÙlÓNê%ÀJ]'ía£Ý:6HîÂ¼iäfv£PKÞ8ãbj=}ûô4+ÈÌ|ïÇ5Û=M¢-UáF£@ñ§äUøÑS@ë&IL¤ýU
rô¿þ¿#½¦\þïÔÓTþ	Qá[v¹´´q¡Üµ¡¤î÷YYÙyùo[²ÿËÜÆ­¦r&êÅEþEþ¥$)°Önò®ßÑí© Ýõ¹ÎUÚkG¢ÓqÕÓ²ákÄVp¤éO¿$>V¢ùþ"m§CFªûmÖ,EPsgSX«x<<ãä'/97C9x;ulªl {Ì ÌL¨¤LÿvR= ô\Àï¢m©æG5ûöiH~SVslÏ¥£É@õ"ûµ¦ÿ»«¬ÀØØ+ý/É>yÅTYm	[&&&&&&|sL×_Õ«EBÌJ-mâJL÷süKXÊ0,¾SÙdÁÑjïlâE3­þ1¬ @þîþ.h|x¡{äESµ,BrF.ë3;Ñ@º<¶»"¥EÂ((¡úæx¢×ä4xÇåYÐne5'Jês¶Á±3Ëþ*¾l(ÚRÂ´Þi?5qalñëþtCKò
Ôù¸d¶úÒ îz^;=MËp§ïJû0ß6%ÔóÙ_h= RìBZnüþÊ=MEsgu<D+\¦D¤3ùrÚPÁ-cLÞ<£ò£úî:ÏY²Â?,çx+ær¹ººnÜ:¤B.,|Ôúæ³ø\ðQÆ_\ô÷³¢H±ûW=M&¿í»Àm³ZÂÙGfjì/°>¹ºL#	36­üà&&|ÔÃZ%ÖÀÞêAaF.%js;íó5^>â> bgõoÌc 7b$_pß2**/qôhæwÀ¶B±De¦»¢v²Vä¥ÇK^£¸ö2ØÒ3·Ðà"í××ßö°)0BpW/è5ÁôÄP_|Ræ¹õ¶éÄl°ÂßÂ^QÃj"Ê*ïC¶(³ñòßÝlwÕ9kºë¯Û÷jÛ>ðØö£û{fwÑßAªuM£= "9àåV#ºE>DèIá÷ß¥Ç¡éF;æ}¿%4}\»êdVÂå#÷8r>¥%À= ÍMs«Fûò]Ù<]NØ(9"[4>ÁK
{ amðµÂÕ×ÈÒJàa]¦J<^¹§¿-*yç&2fLÉ3xÄ°B .Þ§â= é)R:É)²(ïÍ ¢ª·Ó¹·F¢Úëgôí!EØÜPW"¯ê43_ÂIÓýþ88à®§|ûyÝêBß#²º«¬¸æù¼ôÚÎÄÌu=M!} F²þÀÌ u¤Ø"¨£¢ùn%Å71ÁõkJfT;(Ðß¬·ou§ª¯Gàu2Y=}rÇ²O*¨4]Nßê¡Q¹Ô"ýI«ARYÎèT³¶:ØJs¤ö^zO¹4Lxhì1 ¿¥§*È£·ÜõzLßàçëêí?DöºÝä)<ÉQ	u)e ßUðmrâÌô±ë2v¼§*M G<Iø¤ó0TÒ[ÂÅ"Ãx|;£×ð¤¶»¡"à2±Sð³·¸;âµu¿®RÐ­õÎÞ¦/ÞÆ!o54ÎæÀJ¶£K@×âéí&«*>ì§Óq³YÉU¨Ò
ÿîg­!YÐúD7²Jváêê|¤ÎKéeûe;^ðª~Y	çå|«nzºÀ}¯u½]äóÖ¢SØW¤ÄôÚº=}fT·4vccLçr!÷A(~éèyÕêÏn=}:­³CÊØhYÑM¥ÙEÛGï´¦´Ñ#Gæ¹\Y!GO£]-WµÈÒµd¦x_øDP ¦l·±n¤ë¥ÇÐoåkpÙ-Täÿ¤¿CTÛa"ú9¦xa	Ë'/ùíðÊçåÄ!õIS·vE×÷81p·v~·ö]î"YPè[Ã1¯"´ãë¾¥O<½éÑ¨£NXft£2¥KÛáa F÷¡ø¶ÎZt6VÚÎKª¼Ìñµîõ§6Á£ÓÃ¦%uNÀxéÏÁû1.L"(ÿF¹¾íErTgÒö7hFÉîiÿêÌoÎÃ«ÊWÂ 1;4Óñ½R!PÕÅ{ð}µÃ gyÃ×¬6 	£Ú&0ô´tRabøû1	1ûà\ TGbGó½íN_áæÁ2ÌßÂ;$¢JOë.3.ãë1$ñ¤(Y§tÔÁcò&æ=}²c;Û×¢viÙaýódÂG± ãîvç]ð[z«ã4a7d·ÀHNm¡÷ =}÷¨H®~Ó¬@=M:= q;)äpN=}GÀAµã7
Ý½D+è§éª¥ÄN¡í÷¿Â²¾&ænt­ÁñÆZW	ëOxâg¯|y[X¸ÒOî$%@ñ38?Ø¿QV|jïÌsÝ	ÙËpÀÖg?¨=}[;êv1©çþnt#¿#ÓX°Éçûtò§i>åWº EjÑåIò8Ì'âTì²y)ÚÄGvD½Õ¦s#)½F¦[q~9zdÁgÆ§O  n«WÂHö} É®Hëañ¦= Ëâ¬£ÌTFh­éTwdt~	û1³	å2NïIìy×ª[ÓíUéÃÆK¯þÿssÅÆ¨8X(Mø"k8Qµ;FÕ4DYÉ\?Ñ©wFØ²*GMöÖÓÜÜÎÉTN~yP&óva
Òëà'R±)ßcÉBp!·¿soés"Èí=Möæ{Q*÷D®ýÄîéØå;©=}éL H]Áy§£'Ç'=}E ÔÀòB¾VÇ3L=MW+Á£È~{ûëNóIVy = P
ÝùHý,©m- ¤OeÊb¨8cÁ±f4ÁV
ù"¥I,´¡âÖà2^ÏtSôt[Èp ëa¤c %p8,Ü×:º.n,Cc/K¸h¬m4*LæTìèødP ©ë<IÇ³K¬ãTt.B*z©°-ÿ¤%ÝÐ>åi[-þé¢Âí¼LÔèÜJü
lS$$¶¼O·q¾ú<¨K¬A¤I&¦ÅM»,NCÂ\}"ã4D89_S3/ü@¢Å¥ßìÓ qeÉs÷I/_ÁSí&ÚU/îl5åÍ}6°ãTi¨Ú¹%úùòSr>-lbMB^nV¨*M>w¼Éb<I:¯àhÏHgñH5úæ8QONñ²Ã7ìÃ£)Råñ>5¾MS÷Sai%GîñJTnéngu];«Á¼íª?û+ñ,ø¯{é¹?åáïNæ£aöp3 ±5A7Ñ
ÜèÈvçBô­*ôÒªa2LstTè,Êw$\= lL
h\Ëi	ð)
î¯¤Ë7Ì¤¼kÊåLLìikkcÃÐ'¬°§£6H Ú,~\µÙËôÌ.û2Öü<É zJ=}ynÔlàXô\¨¡ú:ÆúÊ	óXíÃ¨øÎüUT×-ÝSPdÙ]µaI4¥gx½ÀµÐBÇ·OµØúéMôò0â±%Kõ°MÝ¢6ð§dÍbOÏ WEÇMÝa©ð°ÝÄ¹%¨¯²Ó¯ÕjIíûazsÕjJí{ax£Yx¯õN©a(¤Y(Ò°ÿñµ%ø½q[aá|Bþ¥woÅåIHïgåTÆowÀ¦µûUÕ¦{]ÍæûNêëÓJ>}þ&üge;vR ÅNÆi¢ÊJoXnçr¤bñsZi.ýèp¹s¾cwP%-/12qÑçõ °éõRkq=Mýähq.&ùKµ%	OØð¾&Ëpl"!g~°Ä¾\¶¡¿DvTÄ=Mö= $\¬p
ª|N	ÜW³-e¤0ñJÀIITDvèød%´®RãnQy¾$ÝÄ,ÜrÃÐâDÏà§ñb~ý7¦ÆÛ&mõ;k³7sghçi§Ev=}Æ|ÝÄè+.jzç¸ê¿I6^=}dÆ"ÿ/ã©ì8b5nöJôÐ#EÅÕîæûä0öÌd~	Îþk|¹ÒT{88>uTeõxhl¯eÿ¸ÛL¡gÏþÿkkù	+èsxÃL|fDA^Ixú¡|Ï· eæñwWO §= >è'_µzc=MÛì¸I«	Imþ¹»ªh$V=M¬õõÿÃåf­(ÚÔß¸q*ª×6ö¶ÉD:QQDº-ÿ{~èV}ñ gOlÀiãûL"ñ-I©R4gVJt_¿[½8QÐQb)»DH­(*=MùÙ÷f:UÆvðgÓÖvï»¿Cý\W¬&¼K|E1*= dÊUÜæñËÇ@<\4¨L¡y=}Z¨ïJhmèA)w¼ÊÌºì  <Èä£ð+·a ©XD3ÌîAræ²~cê ¿M©6èÙÆÝ·Més¨Ù¼±>á®ÞjÄì!JVs¯~Ó¹Es±ûK¡EÖÙK¡ç×eÇªç¢ì TKýa=M ê>ÑO{jðA?6d/{Ý[ä%<tb÷ªûàÊJaF»Vj{JïRÈRÎ0¯Â]ñW'döÛ²=}}}Sâ³Ë8êm(§Ì¯ô¿õÚmº(ëo
¬í&= ÔÑ]ÌÊ¼ûXux¿m±4îàÄõÄG'=MfNJÖ<g0<¾ÞoMÆ©ã1Tí²¯JX|MKsãJÇÓwz·ÌTãÒþG´Õ-¦Lð8vø;y^ÞÞ£Úÿ²¾k6óZi*0îSÐªÙ¼ODòóóóóóß&z{Læóó,í6ë!,¡6)3æ@çÞ¶îÂ"×Ø¦ºx!ò×èð°GÙÒº!ð×æ@©^ö·ö¦4Éà_'vºÊw¾":ÎÑèá= ß0Ë= M'#0õ¥ÝÐØ+'Ùºø3ö5²Ûú3Âö¢4ãòåÍ*ÞÎÖcy¤cÓ"6ïÚé?µ¿òòûZ»æqÝ-ûZGÙGñZI=M¯5¾ræÀ»­Ë§«A:v]Q6±Y''=M·¯:VL dõP}|5¦'~}t5&L'V}x5&Ì'v}:
 ´/3¤©óíÝÒ·	[ ×ª­eÔ¦ºìåpZ?ìÕZ¾ZðË¢§­¯=MA­­zO°¥ÊÍYAQal4ÞÑ®sX5-Féô÷ºÅU¢óçÒ¨ïjÑ£²C2XÅ¦ñÉW%c(ÂDª]TaM(ÑþÎG×ý°$:·:òp+¸XÔ.sqq^ÍòÓXª-?0§Õ°Vu{Ç¯Yõí´Ìáj)YUx¸Þ*"l¡àëüj²3îmR¯ÿ!ß_Þ§²²\3Ê(ã#Î¬@õ~×Å÷î«_uÖÈw=}%Ú0òê¹­´Emµ-¶¦!ñecÉà-ä{ ¹½}o·ºÌ¬Àº¬/2®¨NsÊ(ä#Ns©Ù¹õ-ÁàçÙÖã©àúÆk!»@z}Ðÿøp}ò¯÷Èd'«Öù©ëùææ«ò;¿à¦ ÕWRËVábjTQþªëé±¯Íé ×ü¢5âé+:C;9_%Í¦=M_Ùx6¾@½}wÉQÄ#qJØëêïÇÝóÊ@W½õ.0XpU.AZÆkBn	#tAÖ8fýkrf»ò²¥Þðæ«¬Ûè[¼6Kt= ÑQÅTJØéêÓÃ)CÜæ¹v8ÅÖk,ÍfþéNähJ&+N=M¥mß¨óÝ ¦1ÕÓÍÐQÏ!5êK¼üí=M­©¼YUñ±~$Í1AñË°îºsõhIvW±Ì%>õè#Kl|kwÊ1"ªÅGcüjGøL"bõK(ü¶®|´åÆµNÂéû-è¯5¾óØ¾0aWxÙï×ÏôÌ\¢ÐJL}P>^Mæyw7òÔ[E@,Ä)=MîA@vgË©!-qôsñýpÁL³^Æ=MÔ5n'É¶OÐ?)I×ÕJÃ%cî¾pDs®c¢%	àÇ'õwÜv4pó²¼ï~k¬Ëº¡ÎYÚÓ ©¤8ø\h Ó3sFªYíðæDêFVh¼0ûªÇôx=}¥ mNq^þhP]'t#küñ:¨Þ¼fó\Ìö®!¡ºLl¡^Nú_yÊ³p-:ã@Ö'oìi¡ÙÕZËÓÇïºÛ°Ú«Í)qº³4EÀËpªäS±4õý)[Â¢ %0%£Û§%°b/t/Kþç>è!¥_ÙªT;¿y>~P;ÞeJk»&CqAQÈ­a¤Ùùi3ê°È
pö?¸q§å79TUû+~É3±þöÜue%TÊ%}ÎÈòO»VQRaådMïÔ®ÂOùð­]iÒ&TØóý"ôÌÜÜl)à¯äßl$%±aq\ÖÿEÆYòêÝSa.Ûz îó£ó¼n2@P_qù2û-¤ÓdùknE çå~æ~øÓüòÓi[©kó¬¢ÄØm© Ù$­XÎ_a{ïº3×/#Ô~@NjcÍgh,TÅ*â{T1#¸sS®ø·óØV!?\¿ØËº5è6QYëfÕ^ÇM¨Üf¥3Ö9¶£Ç|KTý~£ÖÜið>pA!}±§TJâ¡ejõß'q¤Õ	zæ^éÀ²Òä<D¬ITíÈ´çK¯+X~PÆAH	BÖÒ»i(àçÞÿF­ðßÆï= «µÒÉ,»®¡;i°ÏßCÿ3çïÅK´}º«Å¨5Gc
L¤´I°Ë+:×ÐË5®tHËRJE §D¡¾Ûö]¹ç÷¼MÔ5Ó÷§g¸Þh)&KHK'¬:ÍÀÑ_Øn©m+/)è]OºËR§F¶°2F_Õô[p1TO y¶ô8r±fæVgïÙùÑ´§¹£w	~Dñ»ñèø@3Ð©?e,ð x³ù>ª¢ÒBå4^L´X÷?ÿÃµ»=Mä±ôñéÉE[Í3Rqrº»!Ã0-Öÿ]-+cú
ccf¾
ÍÃ¥Ý§ÏûìE&]F9ÄÙuMþÞjß¶ê:²¤_¦_wÎq¶í´
x¸@AÏÛ,q½3¢®6×lã°MÒÉPs °À´[IMC+æ¢+p®ááa= 7¯{z= ¥÷Ðñs¦35b d1«º0×ò\ÄÝ6ÝMóIé÷ÒzÕ©ß+($mµá3hÝ;Cï ´Fð)Aïwý?c¥L=M<è¿ÞÜ+ÚIÝVü¥b¯ÌÊÄ}´æ#>[Dª&Ææ\ßføòËT2+x5M)Ûe÷:eþí!QTëi=MKÝ¹
Æª©ºEª¦;.XçÊéÀ÷e½Ä¾®È?ãþ¤rÕ/0_=M§bUO= 2\/-¨Ö£¯àL³O¶=}~!1ö¤$×¤TmÎ«Yv3£O X ùS,ñàö_ ù.Ì°¢ãô1mIg8)ô1OX+'Uá´fÕ)ñðzvf³¶ýý^ÖCÕÜ?ör±¬òÈ=Mù:ð+zºfó~{£»Z_ÝSiÍ&:ëüý¿ÆßûÏ·PaØFH5âUeù§
¤ª9 q5û7ëY]S jáé÷»ÔW5oG¦ÿj=MxÿÊG%x~×;¤ *R3øx>ÿ*rîþ1^^sP-W,Õ"UÎ[è¦{äFå^ÒÐÔv%ù¡Þ¿võþÆå¤\Xz,Raà«[FFCéùý¼Çð«k;@LèLzÜC$>ÄI6
óÖ9ÆXÈFE÷+|[l~vxaß«J°Ólòv|Wïá6ÿ02»Ã|/U	¯nÆÿ]÷*
¶L±ü}ÑéÚEÏAH^äÏfµBP^nÏ52]°KÁÿ)ø)ÒIlYrý©'òÑDMZ= eYùú¯-ý;%óÔÔ# NÊºKÌN9ê¹+£bg¶ÆÖºµê'RÉqå¹h«§½hkÕ¦qìyïSÛ)#»rnq0ÉÚv8ò),=MÅUáÃnge\ßy=M­¯ø©æT¢Ý¦¥QÍt³(Ý~ ð¹åL_ìp¥évèuJðÅø!þÉü ±R;Ê$êâùrô9l(:nô»P7(l¬á­Ñf¯­9¶T¾_+Rý­ò«íÓEÝbnê<OÓX×fø?ý«#ÌÒoXU¦g¢TÀï²¾»ñþ¨KMOÝoÖGËD¢XhÜ
]Èj6XoUEÅÀ}Å#mÍèÿ³U/rÚ©;(	¸_êy³/úùÚbÈµÖ\!%8å±|òÊØ	Ãxã+lJÊ×ø$({ïSs= yÐÿãÉ(?Ç²r:ùWW
"ö\),iÂäÿæc­ª­æ¹pi>Ù£´âÖµÛ¬ífÄã¥£;èå7§5@í"!2¶â8ÞGåÖ}ý;Õ/µÏ;ëµÑæÕãû9¯âyÇD÷OÓ*óú1"_¦§Y]}¦µXêpH­U¿Ò-!:oæ'tõ«ÌIÑAß×ìÒøS¹Þß4WRyÇ¹ù4x¶j/U¾Ãß*Æ(K,ïóUo^.¶÷=Mg19?¢5sÃä9.ÎrÙþÌ¥öð­:ø¥$yV_ß02ÍM¹&øÃAÏ!¥ïÖ ¸ ÷EÓ:T_ªÅ8½Ê³b[Á/H
OúÎü è÷ nî·sÊW&ã £Í³!÷ :/ÎÙÖú±ìJHä±&?É/ÖjçjÁµ*m!Èë¿qùÕ4¨ýq·÷Hñ= ìw»äÞ¡ºåé÷Rÿ,Ñ«2·Z2È1g¼[~ fÊg+i
@©XöR9rÁ¢ãö9+ÿÑÿÛUv:ñÕÎ.JÐàÆkþLé &³Í-À´*2«ï ,ÝFü|°æ%{ ÉNÖÎ±rújzE 	È#ìæ¸QÐ÷éx+ãó !Ù÷ó,S !X	½½8.s¦§{pÁ¡zÈæ³°.L%ÕÖ¬¨«¢RwîþÔ7òÁS¡½¹I2\¦6_gÝPàÿCþØÐDwâÐ8¬iÈ#íp¹ÎÂÜ*Ïi|yK*ìQ*xìkHôz,À(\éÊcþÈQ1EìNHNPØtYTÜrZÜc4LÊÉ{}¹üÑþ'D©ü/±lCpHÆÝÜV½zgK ­i	¢pìj¹£RG(Ø©ö	uÐpáþÏ$©Ø 7Eä= Ãwté KoRe¤,@ùG[xkÀU6åæ:ñ©cb&­zÅ²V°UvÇðÉêÁNnù= =}= 	ñûþ.N[UNJþ¯u8û&=})<%Ø-³üëC]Çî,äéÈ(ñ5Q  ì9\ÄúpÌ
\yZ)Ù$¬¬ÛªWbA}95Ç;®ÂßoGö"Ñ*r¿"û¡íäÇ4®Õ{¾ùº)HL%¬= âÑôÉÙ»jÕµ¥!!i=M´=}&¾@ÀEé|ó'°ü= rqt=}âJ´n¶GöògGÐÒ4^= !	²xÝ'×µ¹!mÙìU¾Qx¯ñsÿ'DbËüÕ!sÊ\ÛtÇéæK ÅCËÃô´º¯Ð%}(?+BFHzðQUm"Í=}$ÕÂ1£ìj¬s2,·:õïàU¯¨¼´Â2û7 qÿ½2q©cÜÏ®XAçöAvÕC+Á)_Ôì$lXé§¤Ð~©ufÐÅÏÖµ!³.ÊÄö{²°¨1l*Äm4½étu^È¡¡uSÿ¦=}^ú³;TÑ¾å$R6¨Øº<Íc?¥mÄI3Tm[!6	~÷ÂácÞûA#MèÊÏ¼l
·âSÊ0Sý\5Þz¦Âñ\õ(
ÖÃ$£ì§CQ£ûNt®­¨ÛÄ²Ý#v~b=M &O¯ìa£m[ÌaÌäÖ^GîÇ¿8eE?}¸oÄéºWtÜXËZ.÷¾"¥?6ÅÄüÕúiÚÛ¹«z>@|VÞcÎ¯R9á©1éûØþl¨R/nkè,y+wÏ²ðõ¯]kÝÕÙ²±V±ÙrÙrÓºø¿eîÕ¼wCãºV¾ÐNB-<Þ¤¨8âðã÷´go- ü=}Àâ¦4³'N
!ü«Ð/Á×Ö #ÝSUð*MeåÒþßÈ®±Ú,¬½³$ÆAÊýâÎÞJ»­påVêbæ¢wÚ ¾­m¢áI¸ÕWôñh>Åé¹Í.ªªÕp5ÐîòÐ«·=}Â#ÝFÝ.Hf°[-ò¹­ºµ1=MªsÍ2>ØÂæØV^3öEOK!º"=}Ñ3Õ-ktûúÞvØãmÁ 7ÛÈé®Ö¿Ó.Çã¥ø¶À§}µ­ª¾deÜ¸UÙOMÇ438óØ^ù úæC?ê?K«DÐZú?5í¥Æ
b+|h±	n&@t¶ÁÁ2?GðýR©úGÓ¾ÞÅöXiIw¤zïO&ÿ4$Èá¥åDòøûðqÜQÜO¢ÏL/×ðñ¬µ8X¨d£¯]Êì=MÁRì@znv¢9$ÛÕI3Ü}&×óÂ'\R¶Øz¬Q£Ê?<Z¯o}ðòK¹ü×4¸Is¯§Å¡P0r/ÈÍ $$Äi^}^ß%Oëîf}Yð5Ä¶9jsx¦Õc¹¡å2B= 1ÍjyzNÖ'?
+rÒÿÏùÇÁC¾Q®ÑpÆ§Î6µ?ã5¾+Ýuâ17é"ûÝïy3²Ò¶ÆÁx­$ñöÆF m]G¾%.øÃÍKË=MP@¿\CG&Ô¤Ì·7ìïG©?,ÓtæÇ°þ'[#»õs¥Rr;"	L¾ÐSdnH«~´Ù¥{¯Di.Jjæ$VÂïÀâ!ý(ÁhUCé	±VÏ»|fFÉÒëÀü<»·^¤%KE$UÏÆÚ-¥W.³Ü¸gò0{gryýÆ±Ô¥¢Ç[þ4xÎ-r,|4=}Xû§ØYËÕ=M@&Õ³Ö7t$|Ïð´9©õ¤¿ùJéT¡ÌÉÌ,ê´Ôt²ñ¾·§ûäRRØ]éÉ¶ãoÖrñrÏåú|f?QôYQ²wrî¡Ö!ÝñZî
<dÚ¡R2®XsÂ-Qå÷Ûëæ±èù¸NÃÿ2l¬´}ù=M¡óìlúñ¬ªÿ¤+h5kZÃ×®ºG¤¶rU(¶¤é!;*-5Ãºd.þdÍÔIàûQ¯bÂ¶
Ë4ô²yùi:= bC×(ÿbyàNieÞ¤05îäÈìSìRê0°¸C(!3Çe*
­ÉÛ¤~ûA¿NÀò³UörÿqE,TæpÛçÑéév-ñi­ÄÅjÎ{¢~}àI¨=}£bþQ|¬à¤°<î²ikd¸§øiêÓÇÔ'×å ;]äü·ò	#ÚnÉKqßÿè1ád02UÜ-{?ÓHúhôgÃ¿SAð~«BhlïÂÐ£¨º?sÝ~$Ç£&j/(Nl9ä	ðýìü¤lZÛ=}Ï}D£ø~ÿúÐk<g¡²¨X²	ERNì$&ûcÔ)}{vt.Ñ2Vê©<÷Ã\~yMà±KE£¸ÃZ</§Ù6§eòZY\%N£;Î]û¹P§±FÃ¯^g00õÒ³ècq¨¢ÂC6§®]%ÏÎïN_l:Ñ9ÂÃ[úÒ¸¢ohÍ-M¦ç.yÖêö"£¥ÊøìK4¤b 0&s ²	áücªÖ¢ø%íK®- þms*d¸#½qÆ®´b3zf¹²Ò@Ö¸ÛåÅÄñ&?{xS-	NpÊ¸QYñ(^e'Ówäïpk&*ZD=M£ûÈ»°¢OÃKâAbã+¿¦PýôÝ_h= £= ø^=}ûmXì[\ÙËXõÇàÙHøiBv¥*:yç]U=}= 'MìØs¡ìÞ¡Ès%ÛIóüºÂÎty§ßùs@¦îfÕ2ãå:?$ôú'w{GL9&xr-<ýBm
·JULÊH,|ôî! mÁõ/¸,êy[£Ú5Õ-©,0©d°óEV+.ûàÈ÷<÷:Nê~»6.8$P±øcúÀûIL= KãIqÀÒm K¶g®tæËXÿL8]!GËî1ã$|ÄÈ¤IÔ=}}·â?5ÛÕÔ ½ý^µT½SÌ¿Eû¶ÿ3è§Q¥å.Ð.W°v¥÷¯=}vÀÐ7ÁBÝ£OòÏë­= ÔC¦Ã?¦.µá¦È
Y.Æ~×ª©²Æ©fvÝ¼v¯jA(]ZK6-L±¹ôµ¹fó¶åU«/ÑeÎB¿3ÆÂ?LÅôØãë=}O6#LÜX|Æ8úq(üÛÒ9,@f£¼e:È´>Æ¦_¥ÏÞ²|ÊMØvbin>ù½Ïb?ÍËø2Ûµ[= S/D1ðñD3l¦}SÖ
ç:ý¸©BOÈ¸)Ac/¢ÛµQøï tÙË8ñ{7Ø"½Ä°TY
vx¢ë¿+3ñ9M "»¸K Óñ/oç0$¡±'²µ[%±pÚøý¬YT3&Èq^âÝ×Q´ZóF=}þ6óóEÊ$ÚÿØ#à:\î-ú1rú*c<*Øé»~|é»:4ïÁ7ÒI ×Ç£"¸{åo7ðöW[7Ãé¹pç:ô¶½/":ª¿¦©Ï·íWôã¡{ÑdÿÆÆ#3G¼ ü:(J½¯ç´§ÑfÐ)Á®çÁHåtÄàÒñÀÊ{j)Å¦®KÈ°ÛO¸(ÀþÄÖ~Ìö?BV"Ð]cW+Á.O' 
ýûgTag®= Òøì@Ïøjå¦mïæKA¹ålµt§ç']d(é6Z°&@½hCFû§öÆöG^zO-vP
¿êñÇðl
Â©v=MFDtÅY1º3¢·aým1ð1p y/&h0çÌïÜÈcïfò7ª×ÄmÇî×éyð¯¾J1Ôy¥>µ^TÔ0^¶?H/ÃãAµÂ¦!0úí¿%BâoSCùÚ¨d£cÒ­S¡Ýìf%Í¤ú¯ûY:jXÜ¾þ¨ÌßJéÞÜ¢²"·¢=}1òæ£ï\W|öÊð!gHQt§:Co:PHmðÄHõ#}5 R:ÿ04»{tqIËú_jËnvÅtvÅ?lÚ­ÒW×Æ.$BCè×¨¼CeÅ¸MÅvCSÕffì¨ßCñ"ÐãÅñÐãÅñÊ9tÒâÒs¿Zzc[½ý·õælz×ìbJÍ§(Êx¥|ôäà(öÝ[))¼LÔâ *ú½øvYàÑ²ãQÆÜ0Þï3vG¤Ý p«¼\ðPP§ðjÒÞg
=MÃ= 6'}MZÈÚ/¥i{¤hÁÇôfòÝyOwMØBé¿ÓwgÅñÁñ
Ç. ­e1FXQ a<t= l]Õ>¶¨ ÈÓ­Z½Ïû#i±ZØ£ë+yßI 0ëS'Î$°çq]& ¬+Ìº\ðá®çk;r×(Älnq¢OÔ¦ö0ücò9¡úþ©G¥¾áE_ !¦q?ª^n:ßV»ugrµïü8Ü³F3«Ðb¦uxµâWN´I§Th¸yçÙ ë¹Æz7zÆªêÜí¼5°&·pFðÑ;ø\#@põå7wªný#K¯Ä¤6íd
°.ï_"5âÐQÄàÚ34¬$ëü+âQ/q>®70ÖB.*@&§6ÎOÓ«$Z
ænØp2þTgÛ\¯È¯:ÆSÅùg:R'âdÔÐJ£?TÌ¦ÿDÑþÎRo1­YeHú_Jý¯9dJCñ:4&Ø.õv<	Ïaíª-AR»ÔMNçèù@ºK:þÇÿKqà×jc°D>9kö(¡M!â·V8jbM¸;áRBN¤(ì9È£Rªð­Ë(k¶÷»[ë»×¼[;ò:c=MÐØ=MÙßú>áè)K'ªânØþ»iLÌSM[°{ç´m¼Ñßz<wUä¦AÒ§®°Ï= qL®´dZ»Ö«Øje²níÅÆDê¼ÿYùSú£y.íÊ[5ÊYóo<ÅÖ÷-+-#0aFÕ[¤qù1-#°)fdäQF]xqwÁ6Ïé©ÏÉÖ*TÊQÒU7ð#fÜÔßËË?´ûè©´-åWgÈ8r2É.Û/±z·öBA.¼º¥´!ßÙY)ãÒ.Ý¡?{¶)¸Ë¡ïá{d^éy=MJÅjùja[nJNf= I¯'^¦n©®ú¦7óä«ÿk;¯§Gæ·B)GP Vb_?ðøçF>}©jQ«Æl]B^ÿ¾Rÿý
G%Ýi9#úÇ¸8¥»ýÜAéÑ.¿_Ömy®Ì?¶¤þ«tôÀÇ%SäÉ µó-I,\'¾³§G×ôEaêùÝt¬Hr¬!as\­ï#X3$é¼ôçe;ªVë[ÏyùÕãDcÆ+¶éÅæ@¡°Ã¬0ÆÊ3µúN*xlàc{¾£¿9ûX&.NÐç´g²£MÓÚ¢vº&Þ ìy¸Õá''b÷}øs´jùZg¤892ÂÇ£0ðù¶8F\Ù:ÙWÊÞhÚÈëiz³éLÉå"¹S2É
@ÝI= o¯Ée';EÊJI),ús§9#Ø«fqY(R¬ípµë&Ê¶9+ÀFGÀVxo}w£Ê¿é¸l$¨?0ÕväßspÄ<Îw0l= ¶¯¨ÿ4þ±±I£BdóÚ2=}Z¾òè¯®HúY¾ugÉg#2ÌÅÏ­ÅýMµ$_[pÌÚ$×ñ3}û-XûÒm/àgãæÂèmu'3l1LÚZ~Ú²VUIïãfëU»Ù,W´jP GÖþr±âh¡?¼rf9+Ùüz$ì3qÊp¦ÏÈi÷êÂ$½ñ±õÆÆ÷0J
k;{wC,ÌaiÇ¹Ûé¸Ûy dàÿ®Å%Íñè=M
ÝÒèÿuNùsw\ÉUÉs=} Ël?4Î¡èÓ« .IFETÂµÎ\ÏÐî{?}{D¼¿QÞMàðäËKÜºE{ÄËrLðºD/|Ôí»#ß2a.¨L0ôÍØC&ÍûX^©Ø~{ù[GÄ9¡µhÏýn
¨q,!Âjº5æéGçI@?ØFû¬»ýGÄÚ?Bme5ÇqG~ÏA~ºD¹E¼«Vçýzfp+ë.åÖnj£ÄO¼1aê#g=MøèKÞÞ¢P}mW÷%Ç:ÃAeF­w7V¤AÄ¬Uôkzó=}- ÒësJ3bº§C=}ÂHpCIz»aºº?r\¥pß;ÑìPÜ¸hyÂ^7Áíá°.õYøãåÐ)¶È^rzÔérñÆÅSöd¬L¼Àû*'úiôõJ^väyO= °É^glWÅi	/HZï2jÅ°ÓÓ%[±Ç@Om	j4=MLé(ìû«!9ÇÝ­ÿÐÇ=MîAkw
&#ñ6FýÚòºH§Â©XôÕ$çÉFTâIàölmïË¸2ü_ }´rçxÓkÈj9ôV9ôÿ&÷¾Â¡"zºbÄ¦Í73c=MÇÿwÝRÂò³¥ëÖ2ºk	1SB\!"£Jºó¥)Rä öjv2_Ð9@oâóÍ=}{hÈ­(èÀ-XT1äç
²²²¢.?,®,7&²S?ÓÞ§aµHî~W÷§
;ã0±"ÓÈèÓ·"U¸óª¨n£¡~²< §Þ|Ïi:(&jOHZ_Ýçáo¾W1­LåÁ+wâÃçB%?D[è©ÖÆó%¡Ôz#P¯ëwpr	= ¸zå¥¸ úno¨Ë2RÓ9n L¥®Åòqutàég{ÿU%|®Æê¥Ñ|1dÅ8G)Úw;1ë*(m,¹²gA½ervfû®ì±É­ÈÀ| õ]nn)3é;
PÈsK+é9¾ öíXB6=}4Q5Ðé@Á2{0ñ;³ ÊIëüû²	KôDu¶}ðî¼þÆóö=MP2ÅëéìªêÔx¬¶é,ÁÆ|óî³$E²üÙÄÖfU¿»ç¹aü0XE&ÂT×ÿÓ8;.Bw×m¥-'N£VÓZrh9Û¸Ò@®ÈÜEÂø¯$¸|ÁÖ/ mÙ#ð.å5ç  ;½nMWÈÛ$¹U°öñ±îÀõZ4v<¯Ø,V{^Â
\Å8,dFÎÕóbÝ_+ñóéãCÄ®ÞÛvÐ®àÓ6EÖhEqþÖ«ËxfQb[2s."½øÊß¯ä{¥>¨W´NöÙÛ·%ì£s4_ø]ÖW:}}nÄ$Uìè*IÎµtWï£DÜ¼£»|UC³2Ã*¹#vlG<h½O¸ú¨¥P´ºöüU+{ÓxJÝÅ´V kI­n²©W(G.Ä¾üå©=MtÀtjýH3ët¥MÃªZ_Qçrê×ÚyYU¨ôÿù &ké$r}à»¶µ±S5aÕÏæÛjWp^¨{{LÄ«
 ´ÿ'I\Ãòmùª·~otÜ_Õ«Üñè¡?ó×T²ßò¥ºô^EÝ^"´²ª©	ílì00Käº¤¤î6Î¬/w¿ÎKÇèþèÎ|ªá$ÿ0±ÙM+ö0Z'1GÆ´4l|$ÈúÉ§ÊjéãJq+²ØØ¬½47Hr¿õGð6ç¡cÀ¸Øû$Ë×3ÛéÆÛ_òbÇ¡Î=M 0veJiÚïGQt)ÄB8
ßow,k,E,ÂC,¢Ùë{HÎV2¥áLíµ$¦èj¹Êífub»B= óD¾)^mý[».®~F¶|á¾+zEN8»ó±Ù'H:YâÒ÷Mð6j.ÕÂ_$oÈ'Ò(©¶µÉ]«hn²RÎE®é
_(k'iÓÄnÅJèvÃúÐ" Á±Ja¸÷¦S=}0"=}-R£@wIÁÅ¡LýzÃäjk	X.Ð7{a¥z'úÁàÀnÒý,-;äN<oÎü;K£jT\oØm|V.BÔÐ§f.b³çë7â½bòòûì¯+8
# ÖRõi]þ|ðsú§ÌQVíÀv= % ù=MY4!i@Oä©»½= Ì[ðk*/; Z¥X27]ìåVÉÂ´As[	d÷Òh H½R.~'§_ï bOR«UöúMsGWçìOÄ¸·E&¡7Â&kVÖÖ50UDgÍKëäpÖ*òW¬£.0D½eÖÄÒIq*=}Ê\B;îy+ØØÌÐ£&þêgôvâ$NØß×:oñ¹A³Ý¨|$­åôWÇ1(O«Ë-RXtWÅcÍ
H+ô£+p2´ñdSS(È»¡ êf¿=}oÛukéª¬[ïºPe3¿ý= H,YßÈ¼$´³ÑJR¼DsÍYHþmkHqkÁj¦z¥7l¡¼s ÿÉ¨äÍ$iÑÆtEx¨r°fÌrßÜE×Lkr-úÈ%múYðà\¤e§÷¢°üãe$]
?ð»*kçN{×ìîØvØn=Mþ»[¤tÜ¦ëÄËfzxc&n.0ÉO
oYÜ%®¨èÈÛ¢¤Mß¿A=Mÿão  CÓ)Iíÿ·D4ÿRõstÁÀºmGcý+üf²å¹¿UjñÕhUÎ+ ¥M¸l2àg*d­O*¸P#Í%þ@d¬ç/ªE!Ùl~;Ôr kï@è¡¬ÿ!¨hñ®B¹.;,H,v1ÒV] ÄÐÛÇ kD®ÿ*Æ /çbénj¿®­x51Àz´rgtWÇ7d,Ö@÷­Ï.QÒ+ç]&PÉ1=MÒR k¢®÷Rmªw=MD¼¿Ùôÿ[­}3¼+»z´'o!>à)ïmzººÖèÓÁ©çÉ±GÜZPx¬ðp;Ö¶XTD¬®üºÝº"æÅ? éeË,ÜÉÄQÃÞØÌâ>zH·1/ÿ+×ü£báô·.:¿dÑH!êx¬y/ùÒ9Þ¨%äØª
¾ÅQ!:â¦ÑÛò¾èøêÕÖûÌ9ÊM ÷M·^«ìLZ|Y¸¦Y½eõYÈèE°jä>Z/L2 $hà7KYFAÙÙ¸W)þ®éõÇGÁf"û Æ ÎÅK¤ý
e4ÑYÅ9TW#Öà[ñ¬K6cÛõ¾õÌ¤¨î=}ú~@N­xEåó.§èúý¥¬NNàËªæÃ ¾nn9Þ¬x;Xª^_yºV° ¨öæ¾NæLykmêr-	¿Å¯ùÉýÿÕ»£¾Û= ð¬*Wè@ëcD¦ãÊ°éÊ×ùtCVÄm¸= =}çÇXÜ«¶ÑM9cW$1¹vØp8´þ¾«H£ðçß}CÛlRýÝM.8¤éÀ».Ù¨µY "pô½ ê]çíËÆbW kªöç8Ê¦Õ¶ §)4= É]¸â'è)AÖîçYOµìÎa1û¥â#¹Ï6Æèp9éü¶¹Fk£;Ty0rsi#	e$·¦j6bÏËã3ÔOEñ1ú;oµ¤±g­Ü$¯1ãSÿ:Jëá£ãC21=MâæBW_FÆ dUö©[Lh¤ = 9= ; -ÕVö;¯\0qE9ú±ì?= G³5o\©k´µø|§Íme²ePHý:Àk³¡Ð±¤òL2ê'Öp£"nèðA¯73i5'¿¸ï²üåãºFòÒe?qðB@²ìK¯Ó(6.¥&Úã2ÂK±:*§:jckrözbõzE{3W= g7^§#Å²:n²²·9Ø!ÅUP®:Z§:*¸$µê~F:z<:zX= gç]·zM±]YîA}L/%ìÖÞýÂácUµ>\îXFñ¸¨zgÑDCS:Lÿ¬ÿæ/¢p#0µÀ´Ø=M _§¶S§?¾¤= ÿõ<å?ÙlWpÆ«î¾
Äqª[%Tb\ÅÆTëÓj)B]ÎC²¢©*Æ±á¸3ú½£|A¨ jÐ¦&^°¦ ½L,:Òw³:ï_8ÿ£;¶	SöÊ.º£é4,pAô~ U5 ÓAs¬±q½º~Ä±¥Ì§G+(7 yF]UT­Hóô}'!&N%ÐÎªê> º§;ÈMÇéøæàøÖnë§«£TdE¶Úúç+,¹b<õVMÔsr¹»ë°[Ã·¬Ãq¸Çiöd%BïA2C¦ {IiïìÐÞ½\RÖÆyºDð%Ö»ûon?Õ¥ÒÑâ­CÒÌVXÚQóB¨"»'Nýú¿YæÙ¬ÏÅtæL½Òµ1ÓÛXq©^= Uc}Ð«³1Éþ#_Yè¬±öcÇ´ìh ´:2}­©¬EÂ9XVß|
FR= tõféXÄjªú[£BØ{GÕ%åÎ-£íS×ÐèÊ¥Ü­	= Ç=Me÷MV¯ëô¯O¿Ë+ºsß*(a¨r>ôahWÈoj/k»É¡t:}ÓkAJ>ç6\;D2Ø3?"R¤"h"

ôæÚÜâÄBG0=MBàôËÞÉX¦M£¨£*à³ÔNØB A*1°z±:gÖÒz±ºhÖ²zÑòÏú1eU4ñïtc>Ûr_æê×av,§2÷66X_|ç¯JUî-¹ËWjSHjÓ¤0^q_¯Ûc'Ñ H¯;.Î
g^ÓÒàÿoÐít?ÚøêµRö÷D{­¬x ö±Gÿ«J}Ç'U³¤À´
®Y~§ð,=M&·ô+÷tZ8ª!:Ðt³á³¹1ªßW«òÔþbïcm@Â_>¢/Ì [j¡lÈOòÄ¢ì^Ú>©üâ²A±w7ÕÁÝc¶"[§Ø¢áÑ8Îvø:¤áz³øpq* êiN¨êa!äV9ä¤ÌoÂDJ1s+GAsçþówßï¾Æ·£ °ï¾æRq¢Rñ¶£ ä±£.ßê^Y aYxøçt7êJb¡Ú!yfzy"¶'8ãâÁä:/õ;·¢Ú¶² /_¸âÀ0#ýjÎÃ«üÐûcå^ë*¢ZÞãÁÔå^9å^I¿ãAäòÒU5¹Ø¸9õë^òê1ûÖeRw#ÕºÍØêÛÝ1i;é"ñ&úB÷¶Ç­çbR[ø$Oada%z8"M °¸5)Z¾]­ÎÎÜcQhÇ"+[¢Ì7×uñ%'¶¢*gð¼Ð2¿mßö íéeÂ @úÀQÒ[u^Ò?/Åèýçnb&O¦6 [eÌ9'£=}hBÄÿÄ~Ve%òWCKß(_
@ÉÒ×dÁìõyozZ¢\Vø8ÿÜ^XX/4ª°´î¨xì¦6¾Kóõr= 1#c+³º+¢IW¢®fÖuÇÿ·+Îr@(ÊdËV¤þèÁ»H|¸K1a27aàD2ËñÖjrÜß¤ Çü§D*½Wb,f)ú7Ì¦ÆÝnìãKù·îà$Ú°÷Üüc+"=}{WtðVä
ØÅcd¨YÕÊI¼|öB1ÅÖ$h[E#KðiÔà´k¼²<d×:a0^  /¢#ºW7Máà¿üc!â]mP<	*£Ù 9½9´= ±=MBâ~+|=}gv!ìO÷µD'kÌvjÏAÃvÈ59LÏÞäw9SíÛÕrÿ%¾ðßÂ£Àýéø\O»oåû]\c§|èW¨!Nè:¹/|ÏUþlÅ6­´rÎ~e¼ëc"}md[«.µ|:Ë!§¾éÅ¼ÎñIJâ~Jv·ICÂÛK0fCæ®ýuM¶vKx¸IÖVöbñ%Ð«3ôó\õ~ù\«RÁÇqRb¿^!Ú®õ×ýk$tkÏÅxÞGQ×x³êÂBµ\²Ä9äGDÿ4ýGPKrüE­*r;¿¥wcÒ!\%*
Kõ¶¥väËµ-6K"p¦¾þÜâ,ÃQ¢Ë+(_AÊ¬¶zj¨c£ùi(WSÊY]SJ6hEt[ý	ülËÖ{n(È×,Â dul(?5 ßvÇiB6ÚVÕùn'¼,¶oM¢*ØW= EÓ]±G>¢\Æ 8Í ^!ý=Mªß2rÛÌ]= 8Ë³ÎÉ<¹ÉýtØõX°û7V:´¾Umã'½úÇ¤_Ç¾¥õý«Ð©ëPAÞo/qxº>h2½jÎçIÀVàéÏõÐ_4àj9ÙtX= °v¨ \Â¹ÃÝó^UêZÿ'I.2«~Òb¶9°k:ÿnOíN",ÊµÉ!16=}ÒU:hðGt&²üb¿~}Ú@ôF÷æËS"CéYè(öû&cÚ|ÄÊ:ÙO¹|ÿ9Ez]'x®zÛ
ð±I°D²[­"ßC¢êKãÑÛm/0[=M»«$°Anòv¼il,±T SÍ±ÐlUÖÙY 6±í"ùüZhâC³{q·$£;ðBíÅÓs#µÜ©®¬km#p^qø¬HàÕþ°2+^ßÈ!ÇïUK¾Æ2å
mðèÌr°·ù£°õþ{1©pãerãZ¶mLÎ~ü²dø¸±EÀà("2^©/ük]óÇøØøÊ£ÐÎÂë½ýÝ»¸pÀh"!J×WÇ¶YÔø+Ùçq,-= øOT¶K(cb !ÉZ¼×qºµFÉGô¬èà^À©mbÇ	èÖüBÀJ­ÜVöwúj£?¿oÛÙ}Å:a½Û»FÁ5F:Ë·õ0C5­ÇfoáK"ôä}\ùm¬)äÈ
Ð¬øáfwNÌÅìq¥ü¦ìËô*:Ê@õøæ}Ü×²ëNÌY¯ÜÜ"ÕêGàøã£dÎY·¬qÉÙñ/ê(m4é-?ÞS«ÒA-Ô:5½&S-E	5Gh&0rbä3ÖéÀz"ôp
èýDûz0/Ç0ÜZ±XS§©aq6«GÑóK÷ÄHky/¢ING^¡d@©±·%5@qù×»ÞôJ+Ìü=Mºlá­öÕÐkQ¬ï9Òuq¤TúI½R[{)"[ûÒLsy] ýLj°îæïJtø~ÀÈÅPöNú~R0ÿ-= iÆß}{hýjûPæ¬oòÊvÏ|©vcy¯Þ=Mb} ªZH*KM;¦3ûi.T³a82Õ3®UØñô!þêøé\æ3vdø+Ø|c¤B¼pØ{Y¨¬þéýËõRþéq¸ßd}Ê|æ(²»èF¼áÀ¬k2n5ÑÇsÚ÷ÍÚ± ¢6Ø+C®.,
oTèmÇBxv[þi¥iTr\_[¥àKèÇ3Âïg¤Èß3FB%3b]2^þO?@Zz9³¨ù}ø{pYºNtq	[)¤YÒÆ\b ËúW)X'¿tF +;tÉèré¿ßµîØ&AqUi#ÒÒ76$ªÓüVqê¶A&ßsº= bÄËÅÌ<U1è2ÌßöHc)9Ff¦3rð­®ì°ùN³!4ôÞu&\´ÀN	©Äó xçò:ðCïXk]h2¤ÈûGÖDL©s¥nF¶[\\@)ðÙÈaÚ\ôàóT©t
$­= >¿ÁÆw3s>·Êëér0Æ´®*0$Â	ONMfÅ¯³säÐÁ<$ÔcG8lµãÖc{-ð	Ëì:ªñÍ÷­£ýþ­z	kN~äV½stûv:HÒãZÀÿÏ-ÒañÚ¥KjD6TjcÔËÃ,8p¨ p=Mi¢ÃÚFöêÐñi)VÉr"e)ÄE>ù*¬¤èT«¼ÚHmmdØªK PhCÔ?#êý)è	¸I¨­þln½ù»OÄ¬Ïg·Kì­
kªÏwçîõ[Òë ÒñõTä$¾2óêobÓÇÁyWýæ$¶ÿn×¨WÅ!2¹E'ixé°ÚñÝÛOò}6+JÄ"ãoÿ¦§¦·XJ§ ¬þGÂt=}(±Øà£6=Mh¦÷àÙÄ»¦;g.ü¶¯áí¿,(ÄëGËqb{[âÍÙS&¦]O¢J;ÍÿÑ¹/s?0F·ä¸&¸ñ;YÕDíÕNÉÅ»âªèù
[ÿù¦¢4jùpB±XØz?4ø!éÖ8j·ëIÁ\É¶ñ®nÆääáQ®¨R~ÑjEéû[Êãjñ·£ønTø{ ý$öýîúÍ.(,ÌmÅnªñÖ_Ï¢ÙÈê3LD¹s Ùìj®¤RçSpÂDé·æ±ÍÙ¦NØþk>äÆl*ßñ©Ëmê%¦¦wÆN¹I]¨FÂð,ê óÇ þazjv:[)éË$¸F,I7ÄV*N).^ôÛZ%µ2G¹&è(Í#ÍÛc» Õ«&§]gÑxcñÄÍï[R%Ò}Dÿé[T|ÄuñÁÊ%ýµ$h¦÷Ø¯ qÈÚAÝ¦k¯§XUø5SüÛ¨ôv2.Ò´õÚGõÓ (Yát?Û@ÖïtëVI>´ø<Ù 6¶ùi0¤~ÕC;µúÕAÄ7!1V)<bÂ/ÿâùÉÞ=}è@âCüèG|®Þ» (7®cSQ¸	|oäP¿xcv¾§úb·É49F!¡/í0÷~.¡h_ó¼ä®þ9Þwð;K^Yvçá18òº¸áö®L<v0½Õ¼s¢ë73$ÏOåS0·ës"2ZíÖLÐ}ÌJm¤u­ñ&ÜZªó¹+tït~= ìÃRÏh'¾4ó= _U3!þÖ¢@T/zùQ¢é
Ç]ûmüW¤j!Ló#×ÙßònrÀóSôZOQ RÈa×2.ùÐÐfFºõµe3%¸´Æ°%Ý¨Ê>¢¢ª>&pãÈ¾ÎuõÆD«NI~lqH¬"Ü$(Äµ×#³¸¨ù "nªàUXÇ×Òú£%R'Ô»ca_-RVbõr(îÓãÇ_Ë¦±<ó@mVW£%¶yí9¥ø0Ý«>@Ä R&ïIpâcÈ­ºÁÑI½i¬{iO²HmGè+>2~â¬ÄxhSãDÿêFô«n;Ç.¿dæ­Nn{0´üÎ~^õ?aãUoÅÉp*¼$<hÒw=}}X<Ê-lcû9«Ù«§@:t¸wPæÛ¿ÐYõDþ»WösN¥úÇø¿éPqNµ¤XÇ§Cëñr
;Ö Ûû0"®Ðåc/­=Mz×ùÚNó¸ùä×ãc'm o¹>¶w-=}Ü]ºÇèì¢A"µN ç!&ãå§$»Ï+í­t=MÁÕxE§Ñ]µD:Z}­èéó= ©âvr	d¦!ÁS<Ïðy³~dCtÐÕ(ú"2#<&!¢2±ÑÍ:]éæ¸²¡®5r¯»
÷.s=MA#êÓêGåßÜ^lÐ~Ü= ¬âm3Â°ÐcSì)êÕ&*#f¿¤tX/Bµq-Ýd%2ÝoØeÖ­_ÁºÚ= "Á¹æow7·ºây6í¶l?³X#Rà0(B ßí¼¿¶dÐ±Dß¯9Ì¯]ºâdA¼7L	Ííïíè«Ì¦)Yµ¨å«f	{ÆãÄCX³E.KÏI(×|£~KÏJ_îù"dÖñoiN,ü$IXÚÿ2À.tÛ÷õá5Ó¦$ÓR§B¢Þþ¦Bä0¯÷®··0Kì0Ï'ÎáåÓJâ09ÓÚ°W#ÞÌ9ÞÓ0ûÍ!¶0ûVV2ª.I¥tÌêÄÀ@80ô qÂ'²å'¯S¿wÝÖÑJ#ÞD$Ò5»ØäÓz¼»ÞèU ¿w(ØÖaÓÿ?Oä%ÙZæÏGæªóêÝäXáR°?ÇwVâ]NV \ÒÃ'DÔzIÀRü&Îò¨àFÉ5ì»Ä¸»$(Æ«p8ê»\¶sãûÑ,1~=}º g©ç©õ!°,¬ªz²3¡= =}Ó¹áfyùk¥mA3Þh=}¤|éøÌ èYTrSÆ$#Eo=M ã|	]ALÌLIÛ³ºMÂvÛõ$Ä8(v3I&;_Ú¼J¶_^më@¼J·
d_¥$Õ^¹bû1øù«Ö	ÇGÛ¿6YÍé8Ä
Uúè80eÒ÷Ô-£wïëÏìîüNc|/ f
q»0¯ÉµfcXj|c®^ Î>êD§0£C\¦>_Ag²ðô= ÃÁ%J©~_g"M6{?d¼R,qáóõÿZ¸Ð*o@È/ÔµñIÕr DüfJ}V0¥Ã´|õ ºonàrvuªÌÒ \]ÒÉòoj
zZÜÈ-zz=}kØÇï¯ÆûF·Ku_/	ï	K?rëõ¨%zâ)7R÷×>é2²ÅySW8ºÑWrT= þ±»ýîu«À#ÄvrÌjI}mNo¸ùU]U¥·¤ør¶s.Âø/Ò´ÍjÐàÆòàèj®b\;L,×²ATÒQ0ãÂö=MÕäËÚkÿ:*hoêV[}ú	À	¨láüp¨
¨Ì­/ý³uù¯G;Sûñiþ^{ñS ·:æsc= YÝR¥®ìûaK¨"+¡à¨j×¢äW_?0ÒE\B-n1úvïáÿ±NÔm ¼¨ »ãÊÍÒýU¹Â_ÏaÑû³o}}c´jÿ_±scÊ××YEÇ¢W+9qdÑGî©úó~=M¿S)ã»)²?m°C	ñ F¸¤BUÕÌê*[Uéf_|_üVöµt	p²WqZÕ\"­ôdÕ-¯·ÔGr8Zõ¬t¶²/ÉÚRL
iü_B_êçÈ?fø"³ÑMº÷¸í"FDØÑÓ×3=}®Ú¸þM%x ðSåZ2t+²ôûr}@2lK#ôgW_ÿÀIáÍâY-Î!j-9ÂWá/©?ßßØ° Uéç§Ï>ýæl,Ä¾B¼útÀ¸  }=MiK"÷H=M½{ô>ÆzEÂ<Ë¹O}%­ß¸/¿9õÕÌÎEàþ]Éo½Õèâ|äoN+$=}ÑîIÄá|þ|Ø{ðkh-$Ó¦¤
ÍØ Vð÷Jg(_ÝP9%E2É¶pX"ömÚ'zhSô}=M'¥.og «ã´÷9¶ì±µ|»ßÓ/h·¸7í¤)47j*m6ÓÃª1\9âæ^å¦ªx×#éÿ<DW@ZOhrL¾O;v9Y«xÀS¸[ïÏD3á±ßÏÐ­f£&±4ýUÑdhb5#ëh¾1NÌ¡Æó!2N½ÛöönuïñZ=}RQHPnñÒUÊ+R#¥WÇÌ¸NRïO]¬ß
vHA#äOû<=MúêuX
~Üè8Ít"Ñ2mPÿ«ïû«ä^»³¥=MîiiO~~Ûh¨öÕ=}ûc	½&ß§^Îßì÷s¯A¼Ú¿ãVwi÷êÝJicPä.£|y|ZO1	æ¯Ù+/ÿoçäØ0ë½âï8" ¼V¾©ÔÐ¡v Ñn²¡7\hâa·Ôá6°.Èz¥ã¶ÄÚQ÷úbxRjyU+¸}v«®ûÁ8²Aï*µ;*¤\Þ¥£[m%·/[-ÁQ+K±äJÎÈjê½pYËàóð§¯@_$~4 ôÛ9¿¸§1:Çö¨WÞÿq>äêæ\'_µF¶ÁþåãÿÐ¾/Xi).(*¸hÉ¡F£ëúqí%í1ºjÕÇë¢q;åruWnI¹»¶UqhZÏÒª´¡"k'eF­Ê;;>ÇÑæàGµîOx*>$S·9-¿æGarD³ÆÎ&dB= Ô¨ÛÄëMWïNüás¾UC¥ß(âõmMRY/}Ñ.¹ÂíYÝA*.Ë6YÖÖL¦ëý|ôkõã«E'F)Ò=MÓ×Iö= |Ð­fÞÎ	¡ R´ÕCXMVP þ¿©[wèä{=M
ÀâKå9g'ûk¹"i=}G"õQ2)Ç!ÖÓ­½=}ÕÐMyn±³"%Hî_>ñW<Óç´áæ­ØÛÚ¤"bç;qâW¹5<º§êr¢ ù­ãºû UßQ3åöãþ¹î9oÒ×N¨"èJ¦eq;? ÷Ìð¿*,÷S9äE9º §ßÇ£,¿fEÅkÜR¶Ç*Åb§]3Ï,¼øDøØp"þ¬FÒZnÎEåY>Øåß®¦úÆN{ËÚ§õÚ#2G>äÄ= çjÅÛ8·ÐË"$o_ó	3eõÄüµ¹ÍCÂE[]T!üQÓëhB|xÿEnã	iÕ>¯.Ë³°ÁâÊÓn§¿<$ºIeÙðQÍÚéÁãÀ3àÁsãÄ½*PÉ ?:=}etû9ØãâîÕòÜÖ°ÿ@ÚûC6ðîP;oS·âiEé¢åRABË¢\´ÙyU+'é1ýuÄ»£õ8ß¹m9»:5ãÚÍ§8ð÷ÓñA»æÓôá¿¯
r5,zòÞ4I_äàîÉT4¸"&6<Fñey5¸ÈÓ3zG°î50ÿÂBûMµürhÕ¶§ß0}¯ÆÀZ/á\
_:ä2»1»O½áDo ­úèuÃ0.Ìö0ó%'ç:¡´>^þ¶§BßA÷ÂÎîèQ=}vøâkË}Sâ¨Â6YãX³ñ(|n¼i= TDä%Ê©bÙ få
&-uïÎêÎÆiCn6áýTgà®îfÌR[ý5N}¦dúô¾Ìn.,V([ë1äÖ«Ó;4ÊÖ e AÁx6ZÀÕ_¿×Dº©R©@é]
ß¼	ïÞ=Mç¥ßäîù².2xù*7À=}[Õge°Lúªdÿ»(qwÖu{·cu0â;½Ó³¤®¥U7Ì£é¤Îó} ´@Â+à»s´ÛÍQ§Æqì¾1ÖÏw]UUW±nUE¤&_U}A¹ÖÜ£=Mµ³ºº|!exåûÿW5·7Ãñj±V.§5³î¿Á¸Æ!6{55:u¸)ÙnÅ¬ãÐRMoÇÚ!é®¸R÷ãa=}!¶aîBA}AêäjÏÑBËù¸W?ë£ñø¢[9!ánåZìrå6ËXS*d¹hÙ[=M9:qÈáº±£øúÉVÂJÿÿr|ä£Ñ;oÞF÷÷¤Vâ ,sÝZõJ¶<
nL×òÖb8Öt¾wßãÉzù¼~Móìxæß!Vå>Í2½n´>¥ñÎöYÚÛ°µÍ>2pfgÕUZeÜzÕÓbª'·<Ób&¾{"Ðxÿ°XÆ¥ÈqÍ"/ F/NçèÞeM®ËeT{A­\¨¦×2«°NXOw-Ð*å^~nM(2Ï+g½ËÂ'g»ÜÃGÆ9vàk_Ïß 30Õ-êðc'¡aæ¤UbLÐõê?²  Ù2
Û8ÔýñÒÇ%óÞoA*ÔXgVZØ¹¹¿bgýîÅG9èÆ þòp5¤ë(}±K¾Å¬íÂgí/Ôõê&#+5OpBuÞ¹1g»t»;p am_XF9oÑÕöàQøýÉ0Y÷~h¯ÞÚ&ÏqáØTqFá0PÝ^ðÓÅ6ðàxôá-C§¡%g}YÍGóy½¥lM-M¹Ù³WÕÏ;ÃÁ1@=M¢Ý¸ÎUþ<ûì£¢$Ýw¨$1Kþ¾tÚJ¬srÏJß*®hò= ¼N_x&¶Ðs<Ä>þÞ9[ãöuo
ïÇ××Å×W½à@O±¿xdkBë%éCÈB^N:}ÝsWB§°¤wi1Ëþ= J§Q],´Gu0¨¯(1		âÈ¿:{±CÓ¼%HkËog¤ëiî,ÄïÑÎà,MycãFu©áÐÜ6³&¢AêÓ?m= «YQÏÂÙÿòvÄ*eò_@SEFùÙ×]çÄ?1y%ðv<ò)ÂÿâË.ILSNêòíÀØ¡HNð®àÇf¢R¡ráÚaIª-p 8ÚýåL4³ïÆþl¬ï¬F¾
üÅ[Z+dÿ=}æZ¡§} ©:}»'GÌ|X®<ÃÚ¢ûÝ ×¨Ü×«ý~	(Q­ðÂqáèªJÕÍ{= èÑü¨É8RBUÎísù	²&Ï}¹TÚÈâ£òï×¸Q=}Ù_ÎE¨WsÍ­OC(¥Eþn¸ Âòùu¯'çµÕÐ}RNþ&g;C'ÁEÞ_éü_S*ÌWÁÎBYï4lä´ízÐç©@dþÄi§ñ8Piò/T.ÈíÝW7®	9¸¡ÀÜq zjçÓÁÅÔÐU =}Á±uäyQw¼¥îú"÷B¢0n1V®ÄÊ-6}¦¹üT~çö±^bõÌÊ»§JRñÎÆVÖ÷Ø±±¬¨ñpg3ã¡T÷Ü0Â^Ï@øÓ¢Ö0ÿðò6´ÝweS¯úðp!«l]Që4ÃÄ¢ûú¿så¡2;«¯ïá Ú/°a¸mÉïj8°Wq2åÔ"eóxÝ¥¼2Þ²I§õö0u9©ÆpW÷»´Þc-ãD<v^#Î/øúþàÐ¦!DñQb Üù?ÀôíÆ;\WõÜ¼Oûúq}ªU3ªËvç¸èMHiãû¡à.\
³­:/XfDDPÞÏv#æÆø'HÌ|P= ïèþÊPUòÑð±} Pi?Ìõzð§v£mÅmÍ»gy%5~Û5ç<Á$=}ÕhÊ¤höÊ=Mm¯?ùïSæ!S-ÙÖbÉõ´Äá'Ù=MeQÔ¤#²bt½ßtÌÜrSY³eØà¾Ð¸¤Ú9l«iïð.´3,Ð= ]eÉ£´Ýhg"²nÏí4¯,ä
eHz#ÖÖ	Ìð@Üì­¾úÛnHø¸ÿ#dÃ£-¬Â êzï
Y:rWî~4½|ÞÏê±Tjâ=}n>LEý y!WvQ=MÊF¨lÚõg9xg*D= çÍAýÍ=Mw= r|ïV?ªMmú,Ñã8Âmä?VÎæu6ä¥¿ÚòàY(Í©ó8òy+Iáü"òHÁúX©ÿ·ÝB2ÌÀ.)adnì3qþ&RòºW*".Í ØbddP÷¯´#q§ûW¿¹TgdÈñ&T!×íñÊé²&ú'ï*1.[Q)/êw4*>ÙÈè²¨nÕ8áÚÐkcÒÓí¢%On¸ÄÏåi9°Ý Á|rX?×®S!?À5*,¾×ÕÊª#aP¾êï÷96ÎÙ ¤ðwb7þ?ãèQb5n_2!5CÍ=}?î«ëIüÀãPÌ6Yè21m¾~<çcÖwªS½¼;ú·&íË%¯tÿKnDVè·è1t5Ñsèeg½ãJÍit(ÃÈlX= f(ítª $E14êÄp(/%u¤¶!¬S¥³ÍFûÐß(­tL· #3n/.!â¨ÛòÒ*8"æ<6w0ãrK«ÆÅ®ik*æNNóð¸÷ýOÂ:¯«CYÕEÒó©7¤Ò³êBA#3Qu ß=}ÔJkÛ=MYÞÛ¿É{öbô.Taøa¦ú¥çÇ¯ä¥d±/k}kå?udqº²Q·,19åæà Ëä½'?(gkÿÈ)¯$]& øê) ×ÄFBû-ð|½ Úf2þÏH.Éº|sÎséçÉü|\p(0í1ÜôxqþDù ²H@$³s/¼öýp÷$¨eÒrðû ÉW©â¨×t¶ÁÎÇPÎ°¸çö¾q¦­JQ_ä³©Õ¥ÝG8)ÖüñåÂãt}p²É½ÁsK "]öü÷ç­84÷"Ón«;:NBãùPÇé%N¹pïÏ<-q©úNEÛÝ]ãQë{¹7ù#$d-]n\<^üHs
bSMÅ2½Ñh³CVõüM[ì6Ò½,{«àWP÷¿%-ü·¦#@þµÑÊ£ê
z0©(QUò¤ 8¦d¼(PÏuD­ô{>[ÒÅ|È]õÊÂeqVa!P#)ã2òkÆ¬òçñ¸ø@Úé(F(P=}l»º9§eÄ¿7ò[§ãHSZW¹ñh9»Þd&6¼IA7zhQêX:ÉÝY!±óÝ¶ì¹TãEÚ._¡;-¶IÚ5þ¤þÙäøp]n9%Ü¶co!ó^ÿ©<BM{ÃK2g= í«v>1oìlÉG¹ÆVa^vïuX#ò¶î<Ió!>}®5ï½P÷'VÁ/ÇZs_ù!óòÁ$(	1faõC.-[³W×ÎÔ¨há,J²s =M¯L:B;¨yK_©m¸GÓk¸MØTÏð¸Ç±¢ÕBÁTzî;þ¿MBÖ¼6¹WËþæ
ÝÞ64GËýßÕØýS¦ÁGìÇú&¢ìa~º@ÿ,@Ë¸¦qÊç\Òh <nNæp½ÒÐ:9ü³À$ñ	,Lmé¹,¿Ùå}XXv@?Ö£Vnà¦P!âÎª¦k1éAtÖâ'5®ÏP<½¶ïrÑ¢<w¨\°÷x51ÅBµ^¼ãP±tÚz)ô¹ÄztÒóm¸ìlq=M0W¨úÔ*ÏØÜLÛØySº#¾­éØy&¼1"îQ¯f¶X9ãnªÊYd¦+RØÉÄ®]©¹Pxe#NðHö¡Ú*@$Ñ~ÇÑÎ£Ö°\Íå£?hp@Û)òÎ¼Ò=MøOëO2 Ô,äQÒ+35CÖÅ}öW-h!ïx¨KxdH­»66ôÍÚ¡÷Ï5 ±×Ü}G üÓKý=}ÿÄ¬³	@üÝë>ãQb0_ÍoA4,Ûd(OÈK_q­¨â¹Ç5Ü	é &7~ïö*õ8ûûFt¤³V,P¾ªÈ{ÖDH{V'e@A0§Ú7ÁAyG2»ÞÑv­3ÒüT¸8¯éÍÎK!çvh 9+mìb^6å¬»ÇöEí¨G£WðM÷ÚQòm?ËB!âVêø9;ex´Wm\°#pYüt(o´$jëýçýå¶1QÙOè³$=MÓ&=}zð±A{»Ö
}z<ùäëUFl¿
zºüH9J0AÈË@pP2vÊPËC1Ü²¡½Òw ï+T<ãÉTnFvL \j}	ÐL$ÌÓ\. ¸+ }k&'yëË>ÜÄ­É¬ä|¨~!ð';£¯Ï1ç[ÕÛtáÖ¯úÕ¸x+u«:ã¥¢g¼_¦°½#ÍÆ8Ù ù ]mA¦Ä]b«YéS¾ç8oB±½¥ÌlómÑdNÄ&ÇØx+kÚô:>¸*CÓvao)äqQ_T·>ÏÂUµº~×çR/HÊ¯+¨·Ïå^&ªµôÅt8sU+úØÓÍ°oL®X¡äâ×\¨sLíw²°zäç?Éß?Ò ¦ãïkALBÞP§^LLBþæ9t¸Sg¥ËçöHLÅÝ1£&ã^-ïHB¼ÏònsyÃsÂ|ñ.ücB	ªiñ§qÚÓùÆiñq7:²åú­Îr²¡»¶BßéÃ³WïØìÕKC¾òáF=MÎJíÐ5þ£þÑ³¡Å8¡±Ñ6¤ÎÕØªøJsðj1Ð%Ùß7¤ÈVEÜ·[=MÊ¤9y7±7Þ¥è8ß¥:-=}âß¥ëÏberç¥Ö²ò9ÓnJ×n éðÝõéÖÝ­Í=M»%éÔV©ÖÆS= p1«Pþï­5î®ê?"d l·¹^E}Â©@#«F^SîÀ®ìÐ»oÝê~j7czg?Fw&£*R«m¶|AÁà=}aÐå¯Ú£¥wp×>Ê/CIu|o9xYP0Æõ#p.cSòHÉj'Tþ¹j×|çPÑ­²Õûñ=MR¿ý¥Þ!.Øgn{+#lEön_ìÅ¬'öÓPø*zjd{!Å{ôê¢¤{¸QÞ4*S4è¦ÚäÈ<î4~^½½D¿c%¨øÚÀÔÁd²vÂ\ÙábÌ*L¤\ QÝÇGÕû³ü¿o@'ëi.{ð¬:ú$'E¼¾³UH,U.¢}\Þ¢LüËD.ÕÄÊ7ÔmËëv@;k%ZxH¯1Íý#OT¬÷üC$ÔéUôMéGá¥Vû _>é260¬¬ÇÌ	wlW~O  "ðµc|µª80»>SH=}g±ýRA?ÿfÄÿmÀ!¤äÎÚË¾!öÝã$#$..1áv¥é #.©c¿­3NVpI>5Ù9µèy+Ðªr
\h<Jn,çÝ4fTzXkâ·¦éá%OÄ{È8q÷¡»jÔz´ûh3lÆß#;ø(®Àéý¿±WÂ8ÇW;\olÊ\= Â}W¥4ÄE¹ ¼ä5ßÊ_çö¤°kZ³ì0dÒqvdð*|·BïÞÃ7§8­FÉé"8ÛißèC¹ó¶õy¢.øõwR×á+ÿà¹lÁÝùj ëèlLÕ²ñ#ûO	º¼Åc÷W³27}bG¿1j:Xaîmo÷ºK@:uv~÷V® Æ:0t ûïöÕ{»"ØÕÈÙ÷Qí«¯¡ØÜ¦Ëä.À©»-V2é3T	vKºJÜp8Ä¦n,6mÊÓðÜÉÒT/ÁÞ0äû²¹3sáúÌ{¿×Äci\a_,s¢yóò8Èèd±ºä¼ºPXpÅ¼Jñ~êQ[kJËæÌì6tX%ïÃ!Tü/Oªu8¥nk«¹½´RSwÙOâ§æýmQgÚFñ= "·Ð å¤÷qÒkÒG>Síð:Ãã;u(÷Ê7V¤MØ/xzÔ9ÀkGÇ+EØeýlè ¼ciTø{WÃ²¨û	0óú=}= ÀÖ{pg¯m+^wºÛkµÜØ¸q)Ç|#Õhe9{9&Uÿt= tpê§E-,>£1Wih-"ÏÙ Ë)*ù¿ÿ Iv¸B?0÷Aé)9%àZRv@ïS^É9Ç´tGC¸ÝÇÝÖò-ïCØJ
i\´x@ï!=MßüJôí?Ñc\À. ß Õ¿¶1±Ò¤cr	âdP³rªþ²Ñùñmýê½ñ.-ÄÇo vÄFõ-¦£¥ø }¯ëX¼V}JEAî U+©2­[Ovù×4þo¾ °o4KK µî­ÙFtr£ÆD±"~9ÇóØôq¥­?@ùÀ!Ã!Û}õùÏb)%âÆQ	¹§¶^À<úmR¸#D|»=}ÈÍHÿVráoÇÿ8,%Îú¶]µÆ­LÆ)æ	f¼	k1ü[H2^;:ËþF;ÆI GBHÕÄÄc¡gÀú¼S4 *æÉ,P¿À|¡£eÁ8!4ñÃx¿»{¨³Ô Ù²2º3C?NÒoØùýæsÓèsÂI<þPiG*U~;*À|Æ´T%|gÆZÝ7L~zùJt¥°çT
i= ýÀªPôØÝTªæþïù"¥ê$ nB/_S¢ÆÈ9þÊígnâÌË£*êrc-cSîÙõmÇ§?°}·S6WS6bU!Ã÷ß-<ýAa=}ïknù«¯p!sq[«gôÄê#ä³I¬N¼¦Ã= +Õúaq3½LuU&ÐknT­(¥¡ïöQÿç)E!CÞ¯)ØUHÿ÷:6CH d= ¾Ê¼54iþ*~'aMÔ®µï?yp>Ác ©1-ÜîÚÝ®ëswèÔö¤1º4=}ù·ÿ|,h?ÿõ¡¢Oþ6Tñh×&ÒØr#­1*gïÏaËóôýKªôNÝM2^ ¸T-Æ4ä(ÏN+Q,¤ Õ+Vö«ÂórµµÎXæ;ÐÞ
¯tÏÂ¢D¥xqfÒ~Ë°åÿ«,/EåÙ²½îµyç]5£"CÝOmogµ{W¹ß¼$úÆä]ÒÅÚòþ GÌÕÀÉQÑÀ»rðxØcÖ«½môF=M;ÖÁï²zaù-)küÆçoj_¤¥á¾­
Ê´,¿AsÓ´ÔÜ½KQwÆóòG»lí¨º·¤ù­¶®öX#ZZö%	_'³zCÅÂh¿	°ÜÔ2ÚVªòsnðMÝ	¯ç~¾K?EU÷rcì×.èØò×}ÕM%{­_xµSaqsø Z[ß°ù¼ùßfÃEúóÍ±þà<uCrúÃÂ«¤ÏåÝA³¡@ýÚ/èÑïP¹pnJ=M4=}Fºaýúý×ÓJ0ÜÆcMLmMÀH(jA¢aeH2Á@ÆJ-¹6ÚüØè§Äùr×ý /L´ù¸üYp)le¹Ð
öêK÷=}et®FÜö£ÊNöXa1®nÖ\*Ì9ÂÔóKªj®ÉÌ	-äû¿º®õÚßP8PÒ¼5&=}T¦áÃkdÎ*gBï(Þ?ÓGªÞ¬eqÚ W86ïT4yf·°Ó+fØ:½[Èý :oùkÝA'Ñ;|ÔÑÏ:³¸g©¯GU[#8é½/´Õlß+Z\¨²¯±õÕþÃbÚ¿z©ÔðÙ5÷Ò¬á#BÜOÖÞQÅôu)40=  '[öþ33où^fôÍô­[[uqkØKT/«Ãº5Ìw.ÇOù.ôÍjmÔÊ¡Õ)	¬¤·û}#eèïºÖÙÜá#¹ÚmLìÞl8·ßWË!fpó8ºHÎdZ)±ïþJ;»êH.Ö
U¸7¶¬?B&®è7Ëñ3þËñà¢Ï¤Ðé¢¿pÐÃã®è	U¢?bÙâ®1®ö¢ÿvã®Äã¦_ø!J7ÜÃÃ?<7U?0ÿè1ùîõaÑÇ÷»qòñ1);îyA	Ò}ÿö¥¿EAJY*0K4Ïø¤Q!k )6B(oiý?;|oA.ÐÁwæÇìÒÁ÷t¢òZ/1Iä.ÃzeêÎ8.ÉÏØ	s¨ÖRÀaÅ1uZÒ@OÉ¬5Ô²pô_È	ëý®©£dóßtv¡æÍÊûÿ»l3áËÁ¨å¹ÒQ¯@Í{â~ZÑø÷'/±½¢ÐjïmnÕXº¤ÿþïÚå7R¼ÕþdæÙs´Fy<Õyu@æ\>¯¸	Ã8õ÷¹æØl4awH°æfñvñj2¿5«b­jT²}ùºñ8Vºô4^bk®mD%$Õ:ËËjêÊËâupà	 |LTÊéúu®~=MKÆÆI·q¤ÜV._ø?LÍûì}>¦aÇY³\ìÜÔ¯Ë²Æ)Vô]aùÓ§z7ÿ3¥Óó1B²6#1!wUÙföhÿjò¯£rè"ÖLÚT3= _ìçÐï7Ç3±×	âíEµbà±ü<üònÐ.àéö\¿µx@¾«nK]§¦ø½)>bÂµô9õfðÙ%Ú8m©ôª<= 9QHgO¼¯H¥XµOJõ÷B·C.¾ÔÔ÷Ç
Ó·R? yñõÊCÀ.*FA:Jc­¯¨¡Ð³àüTb23±b¼ã¿XÔ}?3Ï]$§¯@	 »ÞxDçj>Êç>%«²L1Ã¹qC¶D¬[P,·dIçÌ×J®|±8·é<pnOö¥lãfìZyW$¡ml ÐÞ%0ªÊ=}ì«kôN[¥îfêv2".MÇøjjZ	õ¼¬'TûÊ¼°Ñå-+LAÁÊÝuCÛG)î9k§ÙQ#<.I£kÅ 8­gsÙ©6(¨ÔxÖ2øn²ßv=}ésºxºÛ>»­áSæHgLäuâß0gÓÈ%fÝá2E¸ 0÷<á«)\bøc¹áÝwüZÖ«¤ÕÄJFò÷{G;5è*bòÞIUÍ&'W6÷®Úý×8köcÈ´v97r#9y*)Þ= 1_RÉ6E 'INÁlÛÐCßè#cê&OÂø7^ú_ÔÁM«HF=}1ÜC÷ðeILÜ'ÔÍ )¾þâO­Ñ°8naY²(DH>ù-Û T$§*ãìä¹S/pí§[ ð:ó]yþs$U ås&-ÁmW±_]xDWâ£Wj4Y
8È:ñ(|MlDpüØèó(íP½Iyq9\H"0ÕpÛt;ØM¯)Òoúøk&t(,hìª|,ÊÌ~üõN&oü§ÏP"MgÛÿòu?µT;plªóz¾kYgCúh¨ÿ'ÚÛ§øc{ÎúhCzÉRgSxÌjÙw[¼dl{uÙ¦ë!>áÅîºr%a9ÀPxÓ	6ú1èhÕh'Á= L®§mJªwTh/j¬= n/ÎcåL= rØ¹4\ô¢¸*nÝD§èPpÌ8hýçãTG.´­ÖçPN­e>®§.¾×ÒÎ<(üP§ÃÅùk×.¿kTµÐÂR©N¶11ß¨Zé¡/°Gïóï¶)ý-;(r«üEAµµü|qz u¨5Áw«Àºý{&\>tÂ_¤[¸ÿøy>ÇüÍL;õq96'ÃAÌË/dïB#,p*²Ò/µkÑ»ÚQ\[¦Æë²BÎâ²9Ì·>¤ÔØÁG³yáWvÅ¢ ¿sÑYþ©Æ°ÅÐÅ=MeÊeªL-âµP£ìoà	}ÇëO@©oûi(ýÂCïº»Ï¸Þr%¦%Þ¥u[õÏq°¤Æ¾F=}]§ª^½§= >¡9S¥|/1àú½iDþzA¥äpÐ1å9THõµZM5Í¿
ÃëÍï?Ádnq ã¤{Í83nßÉ=M\>¤©ßÃg/Ê¹ÁN®+
hÝÉ	ÕÈËeALOæðVOßS+$¡j8×OÞÎ½K­¡\ x½¯L(O%CJ­ùiôhnfjCÊ½á]h;DZC|"B²¡h÷6P¯[;Cz¹O>4OCL»DzXUUÜñ}Ôä¥øK4
ñ/Æo	ùT³+\sj6aÈì^4_CÈ]®Y/LtpS^*¾í	(¦ø0ñFIZ¶ +q÷¨×ÜÄð¬_1f_vÕÈvb»_àJ1<=}SP2ð2A¶y¹.[¶å¯:@[c¯Vë¸eWKë°jÔÅKHÚÇ
<awÞ¶¦¶ròvÄ2XÌË$C	X$ÖòÂ_¸h±|«v´OaoEálsë/Þä^)Ój(§J_Ouñ'^CÙ0BÆÓ|s¦Êò¦Ú¹Ág]g5A^ëqBÂ§äÜY¢PhÛIóesÚîÐ©Ð ãæJ×Ð98È¹ÛõG÷þõãáW9§=}V	^!äÌu0ä½n<ýLÇ}'äÅÓp©{n/¥·×!óZb/2µ:ÙçG¿¿ ?!µ8A"x1ÆNlzÔLÙOÒN/=MrÑ«ô}	¸©=}ÏëÜXvåË||y'°Ø¥TÊ &Ù¿æZ¶çÜø¸ù(ôhCúhC\RôhCÆ<ô_â$)Z	BêSxð¸kôJ´ ð½%B1ûfÒU»6V¾hÝ¦üQyÿÂ¿t¯Êo %©ä V9ÊÙóº6h @ìÖOÃáS¨<¼²ªMÍÔtìÄM,;N;Vû;Rûnf¯ÌÌq°ËµÍ¼Ñ©LI}Î½®s+¢,\~é²Ì+¨d¿S¤3*æã	\Êq«£w~×Bbç£u¾ðÞ
«ËKï,ìû	.¬¼bª9uWL§fpFihqP~Á=M0ßp1ËuCÍíL+ÇKT[ á= ÂÚªÇM]¯ý:
ý¿6~Ê°c"äQ+(8²Xz\kIl@h,Ä~&øL<
3qCj,u5,7IÞ¹f·ñµÞ×5ï¡:@»h?¼4ÿ° ¿>2EÞ÷ÌÙ= ?OO.^ñÒÐ d¯5±¨¦´6PF'6ÐLEé3Y[$[S:óæ(:f p²¹,¾á9¸\ýÏô?/ûÙÙDZÆØ¦\Ô·OÁ2èn]Ef{:êß(?¸T×<8 ~/ÓXe(LB'¾*8üKøÉøüG$<u¡d1¯ÙØóT¸§_d NVÿg%*Æ%@F*v	Ôßù¹[£¼=}ñÚÌI~[>9óÙø|wjzWÚ?øØåVJTµVçéK ¼øýsu­4 ° nï
þ3ØóHÆPp_:JZ8óEúUk)\ Í4EézÚêèAùaokè3hU¸6 ãûÄ"f5xsñ;ôÉì"»tÑHc6øJçLñ°Û*xü8ÞV<ºf8¿þ=}Í	³KÌÎZ?¹ÌL×sR-Í#_wVeø&î%ÓÝDP¨bºX­qÔQ©X®&óÕãñ?À¿ÚÔ[)zÛÚ¤ÏUâuG«­Áj¸vÌæ{;Q"äßÂÛæ"9àJ_S÷R¶jEÓö:_Ç2fúÉ§4Ú-¶b"!'×º2î2&úíµÂ""ç×Ð×ú2×~A¸:tGî§Ln,$zã-uw{3¸]ýýjÿWµwò2 !É9Ï"teK	yT{t{=d{{,·B×'öO8Î$6áºÿf_¿Ë$l=}y¦¶ç$IxÃ= T4t, ?ùæ'|ï9|üúhCúhCúhCÂCúhC:+Æ~Çãr7[¬ôâr;;yY9eÈ\©MÕDâÔaõÚbÏºd÷^©»t­zT>f)ÚªW±*á
[ÑÇ
/ÑhÿÁBoÕO ÃõÃU^1	ÊæËªbæjÂá *ä;W)Xþ)tõÈÉÈ(Ò¾zX¾v&yPC °Ç¡VÕ;zWZ~Õ¨mß©6S|L\~ãìaáZd©Xþy;ÞYÖ;:@ed"þ9]ÿ	ËO¾²ìtLÕI»þÊ0¤#àüdéºé«m1FèþÊ´mfJ)ª=}ßC|n/+éA vç·þ´_bÕ[]:É#¹!zHôT&|Ñöxÿ¢_"Õ¢Å ä:Á°ÌÈ¿lÅEz8dJ.¬aêPÂêØ@tËùÆô»êMvEÿpé	([î1HÖ¢¹âÈzÚ ÚqpÀ¨&|kbKÊ¢6Ç,Ktß{ ²)
~
Ù&´<vÃûÒ&yØ|pøÙºÂaf¨ÆþK2¢E!1@Ìª/C É[Dë[dô,?Äm9
·m¹<[ÆcrWMoÆ1ô.ÇQú=MúÖÕÙªw5U;rÅ|:öºâ=M/¨=}Î.×îHOº3"
ë= üw¨åå&Ê£åXÇs°1ÙQ\£½öªòÍ§afÕ¥ÜááøuÜ1F	zbYÎ÷\å£Ókí¢ßÌ1	xÇ_ É[×ùÎk:K9m£Ôóþ_ôScÿó¯×hw#n>Àå_øï;_«¹Npz	×:5þü»t¤É)+j©a§v ÓgRYcßÆOÒÕú%{
'S8ÕD¾¢<ÙÎg*'Õ(ÀÆTÊXµCÿ§_¸A¯:pð1,E¢6¾ã ©W°yÁZ=}#Õ$_ª<
QPZ4¬ý~IësTY³4_v£ç­ªW;æ¤»Nð ëïàøC)Ja¦vÐ7°Ï÷SZÞ8|Ð'¯JUR1LkvÈûÏ£vÎëMÜlReG,³¹$ûÏðÉã0_)©F¬YÄÕ¤~«_[	ZíZ= g%<}å"¨¿¯+ \oÏ1tE®[´kS0þ	­m¦1l¯'â vÑ+RâÙ*y;òÔ146\ÕÚ\iÈÝ5¡~lVÕdý©C[ò@Í½MàÕ"?5Däq×?o]ÆÞq ìúØon
5ÚoÝ¶¬&~ù<LÝÈ2xT¡Ë¸9»)1daa¹ÆÝ¹QU,>»:ðíQ?#ÕvÞ¼íë94®ÓùZ2LÈìqÈ,þÜ¾sÌj@ö²Lîøz{ýÔ-£[Â=}Td&,w¬Ô'V<9áÏèÉsÂ[M@ò¥Ø¦RÑÒ\^Íç^LÌ¾+2ÜvªF70¨Õ4Àºt·JtÃùí7È:ð{^LÆË2VÕÂ&¦P¦7&F__ vÁëNE$ç~þUT5¬vûaíÀ1Ôõ
M{[X&Èqá1ûiSµ°ÝGÓ*«sî0G§ÓLA¸$]èà¢Æ7Æ(¯JQewY¶²Ìõô¬}¯_»FÁþí 1SÕE¶ÿ¿[j¤«Qc¥zþsØ^²Ä?Ç0j*q­t1iÞ5®\^äà ÚÃ_è¥jü°è&h±Ï9{U= Õ·y6±tð¸8+©>¢ìï1|õô}mËG=M:86x^5ôÌ³÷Kã·á=M>¬y¬Y|^G
Pd¾NÝì(æ&"üýSL>Lßæ6¾|àõìÕðÂÊ,ÏÕ æ:9ÒwÕ¦Á®É)âI>ÊN×p"¢µl= ¸å[¦¥
Øv¨©àHÁ­!Oö00lYô»^©Tå§Qj?Û¾p×,YiþÆzæOÄN«aï1RaYíw\g^D5	SYU/º<®oi¬Ë²{ ._un ³ÅiÙ^:Ó:&V¦\ÌÞ³0béÊ6±,F¨Ýg'øõÞ¬Åès§>léûÙ,:£ÉY.æ8éïC¢OsF¾%¿p%mZODHa"¬ii¦õ[y©àôiÔÛ.¦Cûs'SéYy^L6gÖ|b(¬vñKLC¿Q¤>Àì54³·äÞ|þ°ìý|S; E=M¨§l%a¬L *-!|4¨Þ3akqÑæ{°nûdðß¬\+C;"ÏxÊE¤©ÜOI|îÝ¼xNHÕ×m\=M¡i¬«= DMIc. ò:Ìúí¸I/n'<L0ñiôLÎÓË{ûªËí¶ÖöhXïY@%6"÷RHÑß¡}aaÀVì5°×¸ÝÖÄÓ_öB¼<°Zú½ÇøÞÔ66ÓK.¡o-¹ð?ÀOGªøx=MÃþÛ= þ¼ö±= =MT= f*P D¾ö·,j­!Íç*¤gÿ¸xù¦>öÕóèFYÖlh?OÅw©§«G½_Ò7Ì¾
Üd}ï[Ü|÷±ý+Â/·¨pÁ°nlÜ¬oÉÂOíàëQ0Î yÄ8û?wtè(DÛSª®J!ue¢ÄÎw|ÝlæFÿSÌúæ±úyLð;)¢Ï>çÜìÉðb°~ÊQ¨tàÏ5=M:P|öbüÖ$¶ø=Mm§x|#Ö&Ó5Ðï¼ÏXÜzEPóTD<ßØàKâ0£ß÷6Í¢ß)¨EXß*NHÄ1¿Í[I£ÂJÄ3§â7Ý¦<gäÒtO15cTíXgxþò|Xl1l#WXWX,$h0n§mx×õß¨<C#>Lñú±jeÃõàyøe-\Òù@cñ0G>êbÙ:uHhÉð+ ;³æ ²Åæ&°w	Ï¤Â£Dà%¨~ZPq·
 ã*AO¾ uSFÄê!Oµõg÷ßc@sàO÷;¸Z¥(Ïnþ#ÓcÈxâæÀUÒegÙ8®}8 Ô¶-Óy¸ÄefÊÂÍ5.ã~VªÖMTüýväÔ¤3åÝ@Ä³¯Íô?Ys	8Â; mLÚi®í@{2Z§Zïy=}§|ÄÛ­íõi¿;	gBãÏýdß cþTá[¬4]NÜÜº×4=}þ($FìªÌAæIÎ=}t8èË	Eê<3Aç[§l¹Ì}°ë XåhþT/ª¨ØØ´°jÆ¼k° ë×weóLßºzÑ©òãÖVLD=MÜ¦¥×;H­í¼6ÂÁY=M²v[t,Þ\Zq¨=M,{$Õgþp9cö{Ý2DJ®|ß½õzg÷ß({
'æ¾|º"+ëÍÈ66tu	3ífb£LMs½CrxSK3Ý|¡Ë¼]Ð§çaØîNôôB^&~|iü¨ÅÂÞEt |{¡ù¬e{ï«Q»j,ÏÙ0ì§¬EÕü+TºÀð\°ó2]Þn8éòTC½ìßìIq
?»×:üá*Óî3¤ÌÏ/¨ë^Åãq¡ÔîÛYÎ0@%æî¼Ôà«;ßµ¸1=}ðZ6éÛîù¯Ð¤J©1\Zý®OÛÞSXÒ¸Å%æ&ÇWÊüd}}XÀ^'liµ!>/°/|ð|äs¡Âl¼K©û?%¡a)#{$d>æ^'îâUJ
¡[áóûjqªç/zÛøü4ýïßì~qÍÇdÏ=}µ@@ÔFt@ ÛyLa·©Îs2Â×¡k;FMkNÎjT,Èûðà=}'¥jÅÜfq´×= Ê,
ÏYëwJÉû*sDaB!O"¦@öÑ.& ¿Ðæ¡ø¯JûÛ^¹d{ÓY[hx é ¥ß÷hÈÿÕ'O{<#xs.~R$3%ñ[bs1nÖÏxH,Euz6@è&ªX"= ì~÷÷(yæ'ÍGå5½a<gÆÕí^'XX#Rmy"ÿJÉWñzÙÒYÛº]²O¸Æ C½å? $òòqL9(^ÏíÒy»tÅfp	Cë4¸ùkeüÎÐÝ¶g= *[®ð6âüÃÊ¯}tQ!ôâë5"ìÚJÔÍÂ¤Ep¯a= eã3ÍþÞmz§K¬ï%R6N8â¯ÁHÁs³MÚÈ¹2·sn¹fLØÄy× âpZÛB6ªdåø[ºFd =M¦Óùþyã¥+¸A	!DvñÂw7¯ p¯¢;ìÅÓ|,üï¢%û=}ÀËï%yrJò.â^z3LqÝ¸ íµ^[I@±Re{{S= HûËX­J÷lâS£KíÔdãã6ûÜ°íïï¡]ê°OÌ<Ä_Ù²m=}y±´+¾Ç'@DV½Müx:×vòó%Àu3÷X$YòÖ½V~IÎ*z>OÿÔ¶=Mv4Çê©©¯cÏøZÛÇ9Mp£,·hÚO=}\6*>©ÆíEçæ¥uIfu"ÄÃÚD©\Ôíf MÂ&M7
ÄH!î6jX)ÓìÿF/¨ÃõVWfz<â×í zòH¶4¾øF;N<váÂAlê ¢înä¼= >om¨C¼\¯mò	1Ú<ÖlDSBô )ð{éMÔ¾Ûz éCén¦QµPmj(øÅxbRWÒCç½	6¼¶IÕ­åôc'v¯	üé½= ¬çz°TÀï hÉmTèüUþ#ºÏ9DL´¶5M«;à8T0Ý	øw0Ð|Wç°í¡ªÓjËÇp&ç´g=}.&xzcÜG¨ªºÆâõãk¨C¿6UzªäÔí^úiåè=M¦øÝ¯~×â	ñÿæþÎïÈXóÔJÏéÐÝvu,{Ê;±ý\äÌO¬§Øj8É£¼Ó
ü<lZÈSTÛd[Ë"Eâeòaëö¤ªEMS\&Ç _åXAYüáÒ'¬èé½0%÷³{\|+/åÉ&ÏDcþ¬aÝKL£O|P²É
8OræÒëÔ0Ao^±rë»9¨D[è¸ÖüÇJ+Áz6Ä#¸trÂ7z^bN¶ïÜ»X«?{[Þu8âNØ°Æ22nÙ-m
©¹QajÿÈµyW~b¹)ZT|°óÜÌÍ®ø7Ûóõ'ï!
{ø ÎÏ}PRJÃrZóé¡7iÆþM"O«v	à:ñ ÒPG0¡cuë&G;ÆÀmnyªgÄò¯}|¶,£û0]çXó_Â¬¦/r¡¬Ö]
Ä¥|JÌ9¬Øn:-TOP Ån@nOÀ*Àäûôöø Än×»bY#9EÒÎâÛ2%ª[lÿdíl2ÍÏx"ÿ©¯pÍk÷j_moT¤ßÕ5£y= }ÔúQàr¡¯7ùÃ"ÜJÈYðä	-­2,ÐÝK¼¿­<ÇxÇòmÅ|°"Õ"áoç¤ÿGi»1{»a¨ôxþßÏêÏEâåwÏÊÖ2{ü EC©¥È9=MÉåwtE»Ä§z¤!%%åãy³<©ÁÁÆñ%t¯¥ä4¶Ë®ÎÌ÷øÓÃÒ$Ùxjûï&Ü4ÛôLWÍâ->'cð^ôPzg5×Îö]MÎÃØ$u~y>t´ñâW=Mþlÿ/"«x4¸= +ú	ÖáÑGÞóêCt,ære}UcBf>_"CV&å<û©Æa ¬]ÊI@äzÿi4^Ä|l¤ b=M¿-Ð°Ó«¹P_ªpÃ¤5Ñyåµ¢úãf+1ÐW}Ãæ5-[9WÍâ-/T$,áu}údzãÇ=}·²ê]:(Ôv½ßkÅl/1rì!nàvSM	ü	|t9PØ{Ûýw¡ù:³·¯ê]ÊfõéhòÑs69Õ¤}>ð.= öùÉIKøÎi÷	=M»u] ìðw]çý*,ªe>§Ý·c9ÜÇz= o3BË9È@¾8Ý¢5y[ºëx®zïð3ÒöË"»5±	Cz2¨Å~%ØÍ ûÂÕÄ}vpivas!;9×Õ¤au¿4+p¹	Tgý8ÎG-'¾ÀzÐ<nc²ä5XiÖ´êÝÒßnt8EhS¾Xª/áÉ§kÐ¤á{Kõ Û¶ÛEp:©úT7!bUÓ¤L¼N= qd]q^$RÑ¢-5ÖY²E·}¶>*b£2áÓG-ðÌ1¼SÜX@øl.êå"»5ãÁâ>CÄüºãä<¢v§Â0¢oMn £U|â¶ÆÕ¤áøÄ}A´4Z³q[¢vWZ*¢3Õø¤òaí»Zi®¬´a TÉ¡>7âW×ôFWPoòj´óÄC~>µZ4ÝákÛð»{pxÅ÷¿ÓÙáÓGhmqA¿ô;,ÄlS¸; D1·aHéUSHæf{$ÒöË"»5éH÷Zºß>äñÐ¬ßháÑG-kaøÚê»sì7À8B8=}ôî>MuocZRT³«Á½Ýj´¿±NÄÉ dZÀ½-þèû"Îâ-n
óüHá|jfT/Á,·Í¦ÝZÎF¤þLtµtâZ/aÛ«"»5A[«lêeBEtûû"Ö¤áá¤bø
¤Ù6fkT/,×Õ¤é xêD*N'JÄiz¼7oàvWJz¾â¨yØåK78_²÷2~÷à~ÊÃ1FÒ6jÉ÷½Ï$5jnûËì>KZì!sàµ7v¶ý^®ÃPaú}ÄBÒ6ÊÉ7­ê/L»úÖhÿ.sÔ>ÒöË"'Y÷J9ö9N'â¿ôBD²Ä×ÖÂs0<d_ûimDzKþÛ9×Í½=}³4©¹A7j0Ù'ÝÑ/Öó¡[¾9R\±(-´÷+sÎmÀcìÃ²dõáØë¹f5Rº¿án''Å@ÝUÚÝ"Àe«u¼°jt´Ð{äl$=Mwíõ>àtîÝDSNê»¸éE¡­Ð²¼0O¶]èÙ5S7D&ü.'ï«wÞÿgqàJ.B¨äá2M1DÅGp½çz9jFi8_Ñ¬éèå©b GÊQ¡^âµÐA;SHw±çfDY¬ãÚæÂI¾¸"÷ãvíG|û¢×Ûøo¬c2(á÷-
á,ÎDÓlÈëQJ¸1-Á5ï5mW 5êh½þjÕÄ{7Í¦ÝÚâP¿NarÚwE<RÑ1(¡£kGÈÑj´a7°D¥<.·ÊäÁp«~fâ³ü[ê¢µÚSóci'W¤]8|1Í¦ÝÞPJ@î]à§{7Í6ög(7MuôP¾ÄHâ'»ÞT~ÃfUá\?ijn¢ÎªdE«ZÓjÌqS7!"úûÉ[Î¦ôd"[×:R7!ß%âkßð÷»ç½/pî\¾Þ5áf"#*vH	·¯ê/¦\+Ès0Ob\¸GÇ=}÷5»5½ÃøÍçs®FÞ
l×ò%ko%óSeËr)â7ÍTi¡¤âw-s4âlwY÷jb69¯ÑHâ«6T/]ýý¾'èuñ7Tã1G¤c¾çóA¬Èí s·.7EzêËËËÇ;ðãÂ-Á¦hDd£ú¶ÇlYÄµüÈ8Ýáõ¹Ë·_F{Wì}'V±·2N·$¸
ádÝòX\»LêEØ³êÝnXlÚ´éÔë¬Öª(rÍóB}yQTxU·Wa#²&±Ð"ôóBÖII«Â»êg'èqU{Äømµö<çÑð
¼r%5á·*ÅjÊÜ·8Qc¾CiN2Î¸mU^5~Mq3ûi£=M¿-ì$[1^Çx,<²âl-{@ÓÜÛQÁG-«¿{ZNw¼º_Je-£Çá}rè§?÷êÝâS¹ªÝy}ü¶»9÷Í¦Ýöfð3Ò¦GµC¼è~hÍµ£¿øV&ò5õ¶0IÃT(5a8x_~ÆòµáêIüìèã21ç.|c;©2§q<É8\7ÎstQZ¼ÔüÛüýj^ zÕI?Ú'.E©zLj=}!Uâv·bÈfÎ49($rNZÎBÒ Ë<a0=}DüÛAôâW%Òèö]°Bë{Üjrm­oÀRu7zLv(íÁYsC¸L¨GZO3ïó@¶­¶Ãv/üI¸ñ2oþr1ÁçwØÙväkÉ{fÜ TN»Óém$i
v !v¦k\HkåðÈÉmDvÖ?ódÖ"h¬+>LÄöý¨Yþ³¨'ùÖº®ÍD¶âÉN0%Ëî8Õ<N±PvÖÿ÷ùQH¹£Ph[bq§Ø­FvÏ;döÙµÚ*Fç/Æ³®Ú!KõÙå8ÀØØ¦ócHÐí¶0Gæ#U@yvèÃ¨;?îþú:­ÅP¿Q5	,ò8"âa#
íúâ²æ¡¼o[êÕà í= Í(þ°wFÏ=MÅÙNTxÝð%iÊ¢~Å*Ôj'ø-ë¡]N¶c§D=M-:Ùö®_Qm],}Ïr×î&ûU¸¢À«¸èµ"	ÀKJ²÷	zÊþjTèki}ä7[·­PömÌ{Hö!)AÊùMÏ1Ø½3=}Ö·ßîD%eÚÆÖè§y'_;KìÌêÊì= =}µ= N=Mhä$UkÀe»íÍê´7aÜxQBËÌªÛS÷,ûý8®(ø»Ò%Ùo6*Â (/Z5´	ª0ñ+Ûtzek_setªqÚf=Mâ%À¼(=}Á_ðª³QÇ|Í:ÊðZõ­ß^öÓò¹ð6ÀÑ1á"æ<þO= :¼[iájO<&i×DØïuOe[ÈR0ÈYmæAñ¾{²ªÔ(Æ'Â»«*ÊÅ²|ÙI2Äâ/ª!Åµ}µp¤l9R¼{Ë·@¶·Íqàª¸¯Â¹±úaù\d0oá Q­Y	Ü©çeM:Ý
3YµíìÀ´c½
9¶nú²A{§ÚUK~ÛnÒÍ¬GçÎµ%fýÒK%"pq£s0öôÅÛÑ[ozÓº£¬NM¢+$°¤I¿|o9A¿E¬díP8ùiÏeN²i,x=MfX÷_¥Àöï¶¼ðåFù¯JÎ8uÕá·§Æ6´+ð	ÆyuÏÛùOO8%mþÜ^	ED#sOÿc¦mñ~©Rä¹Äø-nõÜ´5.£ÄXzµ»^Ô:¯Ú.2µjìÑu!(ã.ºÄÕæä¯t. \·ÿ¼Às ¨ sf­z9·[Æèpxß5ç\t®%cSw-ý[sÔo= ûï"þ¸æwçöûi¸²èÀà«îì¿ ÷Ða¿+|y0­ÜÔcÞä¡º$ßÈ\úÿÞ,+N¤_ý=M¾Öòù5)´AÓýðaÕ¡ÕoNÓ AÒ»°Ã@*j?TU«¤" YÛU´åìþÃ2|P|på×}(oÉ9ÐÔðÁ,sPxªñÄÌ)*FÂµV)°29ðp³øo*Æ6ý*h|Òd(Ùó Ó®®ËOkõì[y9
ùÅ!È¼´^ª'ÓM)Ú)áùóÜß§H?¾"/úÈñÍt½»Fàü{2= ½ÓðLÑª°äÖ0ÌÔ,âÌüîNStYé£=M%UÁÇ
	7]þ)¼¯\9#¼Òywâï;ìµ0âüÿMÔ*o?©ÿr$>|¼H80^iAn¶×/ê5òð+ þü'NNÕ[ç©Q³ö5Å9§Õ½ÆÛÅ!;
ÑE^069ÅRWÑ1òáRGaÆ¬p
ß9ÝQÂâ$_èÉKArª+Cô{£âKëz/OºÑr@+/ñ­¯óÕ³í>ö£0\s hÆãÜRÌl::TE|ýî£A¾b¿JP%q®ËÛ7â³¡ß)È,²61¨"®= y±w:JÞþø­½;¦|e²a§þ{Ãú­kìH*´l;.{.0PÊóöü|CiúÔº>yêÉpG¥ë7ÍlÎ7lóSr¡©Ô{R=}éc,H(NQ¸Añí.ÔÜ¬1¯ó®R7ìX&e¨Õýyý/"ÃÞ)C!üõÔtº4=}s§æ+Ä99qV]^éùb¯{}ÿ'àÐD= ¶°ÇUö^.°å9KZpÊ©Ózâ[ÛÃÔUê'UâTn5ør¾Ì¯§.@±ëþ§Òæw;ö^ug¬ÑlªqêmÇÀ½eM['F»ëõµÔît$Ì+ô<Vë³ujèRä ]úáq.# ê3õÐG2dFDû¡[­=}{ª¸xÜ¾ùéò,ÿðÃEYR\.PØ=}Uk¾¼;î]çé=MÀÛG|e6*VuØ)cÄÑçì»ËÔ>É
k.ôoP¯Daïî¶S2«s&ôuÅdøÙÚ¶.¬ Af×µÆ@îlbõh¸.ÊnºI£ÏëY*ã~yGhÍZ- <©Ê¬iEülY= Uíîn×Aû÷r®Ç«³°î¤\Å= Áß©*DEÕþ¿òp=}>ËÔäFDC È¦®Ø¬@eð²ÖkáMæÎÀ{èÛÔ=}»%3&ò¹Ý|pòV|	÷D¯QJ0{âálb°ríÎX,pC#§Æû'Q¹ræeüþsv*ÛV^Ï_¨0Y:þ¶imôËKùôÏÕxÜÔE6ÌìR mR±Ì­QöÀF$µÅ3íò	v;YÑ$Ó;ÉGVÂ£s(üÛo
uçÃäR­.-VÃòþOÉ ¥/;UV:kRîóÀbîÞºÔyZ¨¡«©Í¼Ð"c=M6Wý­¼p"òUÓø>kþ§'^©;XXþÄ}è FS¾ñ)X¥¡(Tx%³× \\½$Ö´õÜSpú¦æÈhÑv,t[5·#szíNnÅ#ÚµÐPKR¼àÆMd~ÖôWWBå¹ÛE¡ªäñ¥µzñgú:LÈ,)W5ì@£<ÊÔÖ½õs_é#¬rBpú£Ô£àò»ÚSÆõ7tIöSø[ïÒ¸7D«oQ?¹wPÎý=ML*°®SF }×9Pà£h4¥à~µ²ßÅùýYäYNpßnH= fÎ,¥¿Ën¿Nhtþ5ÿÉ#´x5(ú\xZ3
BsT~ÓcÉ³e¸(Æè>|ÇPaj >Gö\îSøÑî¿ÈuD¬oÆ º= nÀ01×µçÐßlá+ÊµÏ75g"t%ê¡RÛ¨äSÔ&.è_»H]Æ%Zei ò!
àÁ¦|ì¨Ù.öËàÇK]z¢ÑOÊÉ[ÛòÓoÒ{?EbÄ	ëd ±ÖñI¸a#zVþ¹ÅáOzûÙÑwËv*Uãî;©dí
%ª6·F_(ZS$©5Î^ýul¾ÜsÁ(KðL"zdÀ~= ìZ¹bâ½z¨Üï-P+®¸yõg¥bh/®ïÒ#	b8E c°}Ë(Lú°Ã³CúhCúhCzúhsüQ <ïÈê:3øWÅ!²ä89Å¨$´vCÒBohòïÊÒCÅô øÇ1ôW«Ä_!QæÌZ£4<Pw«±¬àþXXÁØL2«ÂP9t´àcGÍ$Rhù¦ÓH-pçæqMyôõ|-XÓ| ÏT°³,-@ø£QÅ®R§ /qµ*Ã±70?ùª¿±*ÞÕº¹Ýí0ª3óëÇÈjýø=M:)W"D07:4 Vy½g8sêÀFv{{¨ºWÈnR-÷®èÊ"½:Î-ùr9=}îßhyh\¨!Ú¸Tü{¹bx½å£Ù<ùÊdkúXª«òü¤H\ê}Ú¢&´ÆÂ"ì9éëñcbb±Ëû(p]îxöôu2 ¨Ò{FÊèrri.3Ó	ü\x±Jæ¾öN®.înü¯0/ðïpo æù$T¤Òïá³äµâÌÝïH¦£¡§ÏÝ5ð:3? Ä¨HÂ¸ìóv¯~9£ÿÄª®= ùÆoÕD¾pFsnðº_©özÌPÉñú@¼ÈBË½{Ú	=}ÃOÎEn°®Þ¥­ßÑU/Ñá,Vbü'gÄª/Mü-L~hfÝÖV{Ç¡¢í³fª?-d1³¼¦Ü¾nt}äü§`});

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

          this._decoder = this._common.wasm.mpeg_frame_decoder_create(
            options.enableGapless,
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
