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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01e1c878ac2e.6£·ñ}º)ÎX½Þæã[çÅcL´ÞQxRü/bE:úì¸éaÀV+NJ&ßo©´Õè};K"ZìÆðºúJO--°mîÁ©EFMË@= O}Þ>Éòw¬ºÅÎî¤(´ºyu7tâ:.Ä¾@zûËµã%®ãßàA¨ï­(~ÌayÌ:$Y¯Gzø«^Áõ8}P[BâL·§VÌÈ BÂS>jQÄ2OÃGèj9;¿³¿;«³NP»8¯ædX£êE¿i(2Xjqt¾oñ¢ñZSÑÇËÁäPÓ±ñªz­w5ÿÚÛMkþëYêxZúZæYvÁ½ÇV½Âî½/ñ(¹ýWÞ§4°Ém0Úmp?Z³W^ W¤q»Ê@Ñ°ÃLÂ<Ä\_Á¦pÝ¥°ÝÓlòáPÍ·³L©XÁÇÎÌXÝö^y©µï¼-wzÎ(zÓ¨¯/{$Ñð­­­ÝyzÜàsÎR3-@þþþsUÞsÐÏ\Ï~YÁÜïÞqLG/µö×6fLó(Û2xü8ù÷8øÖWÂYÊ|ÜýÆ7 8ÚOOx~2ÞE´Lk¬Oí'.Ç&<·Ý=}§ôVþ=MÇ{fDKUØ¼8ê{H­±C;ô¸¿PÐÔ¾ª5=}$Tø¦l+hÒÔÑsi4±¸^
Ì|C|/J{í^1MpWæÕ*·Ìwyøvk*àE£¾>þÕÐÖ6i¸£ÀÍ+ïâRnÆÂ@XñKËî:°X|èÌ·Þ·w?«=M;ßÍSÈyìÍKE ½¥2{ :£;
Kä È2<qÒ»Î´yâäoÕÓj{*¦¯l¼G¡MAA¡núñEnm:ö¾|=Mè(,²1q-mªØ|G­z;K½1#­/T.¦2fC¨Â¡= êßÐ6ôëÖÑ°øÊÜÅ,XÖ¼|&ª0µH3KÆ*@y³Ô-s²VÝ=},Âx¯øöyí-6c

*fUo·oÅ
l½#÷Ï<tyã²Ñ4/,KKÊjN»¦E$·Ó-WªÅC ¿ôÖ94(}µÎCpI*J= óO@Ðî&3ÎL¤f÷´r>9ª÷Ûci=}¹¾
$íâæøBCóíÇJCÝl»'è¬3NäDGÇñÂfø×¼sª¿&YOQtb¶Ó¿ñ]Qø!Ä©À°bÁÿº(>è3d5aÈñ8»ËÎgAù²=Mçîú±/×agç-3nY×Õ$½U¾§@ÂgZ7p+?DK{thE.íÉ?Ï¥$¦i&ª,\-mó8Êê9Z-¸Ê!#þTT?µ¶Òqn¸æW{&
,¢sðjv=MxJ*©¦o<[i0+Ùª[½s}
¥¦3Æg&æ,B§
Öü¸Ö£Ã(xµxkÿ¼g|iOø[ôÎ]c$£vüh±e¯3[&íõ¥=M%vÏë¦¥_<rå¼ÚÕâ,¾ÈßÜpI²£­që ÌsàÀ ìTnÉûë~÷0IrÎàm×3ô$;?{BæÝXlJ¯18}½¦bÌ¹´3¬ÄÆ æHØ?Ê û~¡ô£8¿ë\2fÄÈû}+lÖ¥XwëªB)blnÈ>	ó+*Gmôæ¨G¬D)M´ùã"ìk«ñn«õ(Fî«{¨|CÂ¼,5æ0èwÊ³úÄµluØÁM£©d5µøVpXX#ª½¶ÓÐ6.bÉF¨ÌËC ìÓÚ£W¤Wn× 4éõÍºt´JBìgË{íiÑÉ±tñIg¢ßsSßÒ°g Ó¦×¸[yÆ~¸{¢ÛÔKj$çKº@lÜ[9CèÌ+íõëhFæ_9<;½;¨ó§B³ÜV³ò¹ªÑ$µª¬CH7µòqç6'ºä×B=}h?NÏ­Ù7
ê Ñ£µú©tøÜÓûH+ásQC= ÙI>ºpDSþ¯h1u.øM­(ôÔgón0,¯s_:³RwÕIwÉ,pÏgHÈvP«ÌZ¦´|) £QóNy(ô;uCÛ2º¶&30Å
9,jíK+.ëÓÎIÛ$ê¤.´)¸²ÒM¡!Ø ;ÂõRîÒ·6I¯¬
§ýÛaÏwÐÀMöNBÈéQhRìVÆÀ¥nMµö\iTÇA>pØiÒ¨ÀhÂ2M)Mº6u9HàÉ=M{hË¯oplüü¸½1ÚA¾póU,V®E¡etI+àK=}] #= ië¨7?îúÈlEèiü ¯íJMì A,>þx³&úB°LeÄ7BÊÊÛ}¼âo×µa±2FCù½g»­»Ë/)»¤	AÊõ{"åÈ¶~Y­ÏåkvKp
õ­Åwç8#áy -.ôlÝ½îeg4o¼MF)ÁÖNrXâWÈF*(vB,EãÙÝÜúÁEaØÀãT	Ñz*úçì~u2Ã2Ý½]2g²Ó¡IZi(¬-@s÷ÔÆO¸q÷:Ðî(¶Ò¥s"W¯oZ¾AÈås)Úñ×øwòeýnò×ÅóÒòÎx»ºü£ôôÂèÞ¿sL÷¸Ò¨°rá![
Í§ªåÝÆôGïÙ5¾ò]9Ýý¨OvQþ@ý¨r{ÉBwÛHk²[lVücÔe¢ÒÕañjdty¬ÄÁ)O±ú»%ÕÊPíÐ87Yðó§=Mò?ÐÒÅ*xÃ1°>ÊÙæo9KéÒÕiÈ¹Ï^¹´í~®©¬R)¹beáp$«{h7ý3¦0§°5ý¬½3BáGôyçzÆo×òµ,ù>Ðög¡¾e_AS¡SWÏ#ýÏ19÷þVB;ú9cn.j-ÃÌYÝvNòv^Y»jXXÔM·^XkNöÏ|ÄëÍA£à$É|"½1Ë= G:$s*Ï^,¥Á+ûn¯ôÐüPpÿï­ú2 <9°Cmà°^Õt÷èËøggà»¿;¸ølÛ~MPaß ÀÃäÓ® Û@¬ï¸Øä4¸ý9Ù5?þòÈòînMÐXBüâv¡ÅÿñÜ¥Í'ðnäYÚx ÑÓÛàÇÆZC|øBöSàyÀ¹Nà¨ÔIÁ^¥¬aaµð§ï_]ó¬·­¦= ¯hL>»Fvö^v¡¢aÛjIsÜèÅ8¤Èöv_±ùdJÂõîtÝ#¦ãác0þK§W±IC¢¹§G1G9ÿê;Ñ¾i@î]p@ìâøòå6= ×b?ÆF&!õz;þ».±¼&N¬;÷ïú5NÙrÁ5=M×¦l&nê3¼'µ$4mÿøe´fLõ>¾P}¦E~ê©¸%í-½9E¥c=Mñó´§F(ä)1J6jÛ§.Ì|ÊÎ;æhì_ë~h&þÙ·ÚØÒdYÊ¤èÁÚtP= ÑÝÃnh& IZ¤þÿ|©º^GLÌà¯]!f Ø°OMMÝ[[5|b&®pòîlµ¾ÕÐ[ÑPßõÐ[¼@ÒôË+{IÙÆ0ÃMØººhð½Ü ;VË0¹ILºJ¼FÏÄ<çtJÀ9ôyX[¬(7ãfOGm'"§È¦e±?hr"2ù¶2òG:+)I$ïÁ#á'¹È{&cÂlãí6rkòYî5nôþm ^-f!.ãVªm3D3D3x°y¬VÖm3¸®yÌV´m
3­y<ÖÃúÔC² ºõLäEø/·ÖYÕqTRåyËÃ¹Ôá9VM¹9¨\Õ(1=}qr=}b=}cíÑÒµÔòòÖD»¹oÊ§^¢½òÞ\f^³x¤Æ«zà^<Ë,ã]Ò;Ï1Ö²
ÛÃ³ÚÙwÛÿ12³3SÍ9fIä}pI¦q¿ÝÇaçQ8¼ÝÇbzMB	ÚÌZÙexï¨CÝíÛp
Ãü(OÃ1¹Ò>-*¥äÉ¾YÚ]¶Á¿¸ÒÿýÿdÚMãkhV])·|d¬\]|/W¾qjZó³:öMJy^¤µ®>ßÐ4?Za®1¶®±uç:VÍKg_oñ#¹{Þ¨¶¬%²=}\:p,äøþ÷ÈËsQ¬2L§,çû×3/ ¸kÞÑ¬öû¹.?À^}ó<t­'uÆ7Y»Á TòØøõÞH
4µ°¿X<>n% §'< Ú¢·@u|"Qa= à±÷kD´ßèÄL]Ñ½ÍO;ØQÛ@»I¿¢VakXôt½:uÒûÏ#+íÈOJ|'JçU[ã9ºÄ¾¤TÄÄäpDRË¹!·þÝ!$t««R½Eu;Ðµ!+Nx©TÀ+-]:èÈ ví¿)·¾ýÑt°ÈGÈ<*ç«¬]½[Þå°úKÒñÒµá/(áx¼þq®o"ÿKºvT³ÜNððTÒ=MÝeå_Qðô« Ù|Ê Ø<@cDÈ¥hÀÞÊß8_¬=M°ä= \ÄX^ÀhÞR ÜFLxß¦£LH¡IÞ _¬H×Ýâ;_×O_Ë@GÄ6(¹xÊ@0à£I¬+Ã}á4ö°b3âÇk§×PÂñâ*føó¦ÀN´&º|MúP¥cLoÂÇÉ,b|é +eea´b@ÒR=}yì(î
²ö,}!9m7Ö;µ«Úëð¡l#5h¼õøcüì*Vó½\¦íkXkÞ'&KK ªvÎö´}+óBÂHXãÑáÁD¹|±\@WaPÃJµÀ%å¯ÛôbM[bXï-cÊ$Éy÷Òô¢¸/éß= eÁX¡ÙâlWÊKíGèØ^;µÿ^nQmóxèÇãSËïÉ¹)p¡+éá¬¢èw-ËÖWj¤,è~à=M*CMH4VX¹ïL¡­ÅB¿<GGGGGG5ï°}ø= ­Ýev·µ¦1ùp¸'§ÓÛ·Ý¼ÂÁ½d{I³ÍcwN5F+:.³37¬ÆyãLM-ÈF{Ó-úLÇD/|
E+<ÿ41:,Û-öLñ´¶µJiJ¹{k'üÒ-.y»·uDû±iwVy·åç'L=M¢¬c(éÌ§5
^÷õzSG|aýÓ	Z±GºdñF>G;!ò^µzÓ£º=MpÉ9´ØfòsLËã+kmß^²' ÄG4ÕL½Mo_m|²RÛO§0ÄG[ÆîÀu¤R´pm(ôôÂFWt%ý#æNoj:T.qul?i*L..D[çÂOû'û>oW¨áJ'!ÁÞù¾.­¨µl¿Ö2%ÇÔâ½AKë©bæG;%èC¾#ïgYW¬iúE«jywqyÍ·Ðbø¸iásÉbýÖuAçÆtZ±b®N7wÖÀftø¶q"ëö'¼Îk#å)\oéôû¹ªl<!rrx:»2òßG+TÓ¯f[Ì÷*ïäñ²(óemmsp³¸	úúYÏºýígÊ1'ëN¿.
(N­C¹pá>blº{y¸¦ãÓcìoÓá;x&*!wþJîz«[Æïªîäò²×Ø¤àd^ig)å|×M;:¿è|S)bã!dmjã÷ý4âþ¿sÏÑSL_ÆÑæËüï¸Þrÿ*ýØM?:édkL­5¢7Æ:F0¶UØâR=}gbøÈi	
ÜJ(JFP67í<×M::âç
åo3¹cãOæ-_Ìr"ÑËíòs¬##Ðó,#è«H7:òçNUVZÓ	T_#~¹ÁýYx!>­kÔ°
¢h¬Óà°J®ÚúV¿Ã]ciÅçÈX*¬ÁkÔ°W
¤AûTc&m¬Ýc Ã]mibî¯ä¿FaDÏ²òÿþÒ ¸â¦RM°Í×7;l5¾7yF*x!o·È}Ty6;å=}#¯º¿ÈèS¸9Øõÿ[ÈíÐaýrÈX+o©üHÜÜßê	¿þÝÖÛËààgaüÊ¶+>U¦e!§,, º}¢veÆ0¿ù¸Çì@ Ý÷¦2¼K¥&^6®Î±®kpØ &ºËMU*ùjó=MÐíNK;ï·pð>ÅïñuÛ±VGåa´hê= =MGÜË£¡f ×x'ÓÐúÀ:Yé³´Ðy^Ì ­¥=}u©GÑpÈC@»U*ûrZ¼	«^¹vÂ0O¥D<¼ß¦­kæ¦«WZD¬×<³°pÉo·­{ -jü.²(O8/ñ'è4¿g0ßKp«Z Ûä&o{ïNÏ¤cTBt^¾$M'G{òÛô\ ÛõáÃPvíÿéÄ,¼y#£´ÄqÒ}/k»¯4-FçOÕÂ*¶¶N½Y$ü{W>Ã/!iSgÆ­ÓÍ¨ÿÄ'¼s´|HkÛçp7<Cü×c~öK^´ì;³â®Eµá¡O´¡ß÷çÅ5Ájþ?I^Ú£èjX«f>*jÓÕåHhôêþfÌniäùØYeâÅÃ84ÂõgÐµ©âMØWÜÐ«GüÒì«z»Ù^»ôA2WÁ¦S(.¢6Ë]á¾
ÐºGúêV;¿R7d&F5;²H:	Û(­MºÞ/êXq=M~4REç.õ[£Ý=}QHØª[ÜïÁNÜq~ÔBÛÖ1«æGÁ#r>Gè«iºbzW*Aj|rqCu¡Ü^¡Mù¸+k¡ÃÌØ	pØrU~¼ÄÞ#ÂO=Moµ¦!P¥sÓ>-Å>J¢SîêÐÊ>À(}à6Â|,ìÝÑoÌO@ñ|é+MÂÇc4Û= Yþtµø~¶b
»ú^7¿&eÿ#×¦mò8\®ÿ°¾$2|Ì¥ApÕÐnÑ_ZIÈÓÐÕ(K¨<Úÿ»WÜÚyNÿÈLæH3|âh?·¸×7q±GJ;dÏýÕåÀÑÆ)'ÛìRH¯	Zìº3àó7[ý:ý#Ò¶MÅl§¬¬ +6éM¶<®XL=Mrl¼v«ÅJ å¾Í/ÐX= iTgL+*ü:}@©ÖÁWQþÁ2VÙÇj<.HNXõCªr*\vc/¾ìlëþF 		äþc]ÆÍL\_¢B¹d$bÐ,òNÅ3¼^Ùe/¿ìke±DbDÄïU.Ä±dw±B²iÖû!@ß¶®xÍ*H=MÉ-Kæ~²B,FñSà«ÍâÁräjè]QQK6¾ø·TÎvÈ¶7-µðj00Hî$«­0]6 \0¼i¡¸IL
ÉX¸ááç+Ñë¡7íÑüã²"ÂáÕýEïø¥<ä_ÇÐ½¯iR;"ÖOÒ×U5ÁÚç¡è{k=}µ´ÀúvÍSÀÚcëWrëÒTÎqúå©ÃÏhPþçPÃ°pjS}AT jþãësö~SÈÖ3²N'\>'Åôz?«a¬®à÷üí¢'§µM:£0Ît¬qgabuZm½©ÏCËr&h±²b÷6jÄÊÏT²qÉ'uæª=Må²%æÿç>j{ÀÃºÃ9¾JêKR]«Ht.f-²qªG#ouÊÇ)µ{©rý
Tp3j5tnù)üÈT|%(eÁÉy-EjQ³¬ne¤gÂõ´ÇKn£Ô=}PrÉª¿VØ=MbBáÂ_±¯òåä¤ÝÕâ=MFU²lvºùÜ9êÔª2 5wÌ'lÛ%³Q>VoÃ3eD°Ö¬V¶Äã¸ºº_í¸tf=}¨S~Åiç¡Ö¥T~Õqý@VÝÓB6Øör)È[[Ò|Y&R= ³2=MbKìöddÔe= GNW=MïQ'Ï°²oÜ%ØÈ°cÌ@WÉì7 ÔÌ¹ÿÀ
^C¿:®{(²Xÿ°^¯sH= \ÕÖ\ÈlÙbyGÔßyàÑgÈÇê¥À·êÈSZ@îs^Û%«S5æ¢°@½Îåå@C'=}j,²ÈBÊeÏ¿eÅÉ3°ò¥öÛ©o±¡<¥FK!BÌÕÖIa|Ð(SëâzJ§no=M¤T ÜA?VÐø´Åªw
Nw-SUèV|j<¼ýwdÝ*M£´¹½ÜF,ºó¾q«4w;¯Ú
qd/Æî<&­ 0j¦-ÙèÓÂªÊãvd"cÊMJ ¹ n·C"Ú«_n ¯A,Í@J<ý$6å§ºEä6~ Ð7Ôéi} opÊý?ñ Õ!&>%éZ:s¨RØÓÚÏiJì®NlÛóqÙBé=Mµþ´Üì´ÊYrÏ"°©ÇiVqgÅwã¢£1¯N´Í¥#XROÐ$²ÿ½\pTÅU¯íÐ= °óÝìI¨b!¿å*;2'Ë¢W²ë³·MCøNæ'L1nÓQüá«×ÙN5Ä«~KA:>T~¸éÿ:Øc§g)obF\=MDlÏVªö°ød®SdÇv]XÃD÷´ÂS8?©þíïÞá¢ÅêêÓ47*u·"/~Y°qµï&ÃK/ä1Xb;î7êFjèWü	ãfÌC8d®rëºÑ£aiïrõOÃÚöN"¥ï~îêü®ÉÌûçuõç1xLM"±F!(½ì	$ ÇßIrÍ @»+ØCô3u×DFôOþ÷7ô¾CY©ßoÓ<þ'wäÚÜØS^T^Å* Ja1÷!L³v$9¦$é´&vÿLù5ë§þÚusç&P¬Þ÷§|ÓD²-!+Ç6¼7¦ûKp-U;jôfª/^ééB<)E¡)ctzvÛÎÕ~êã®µÕ£J­b$0)K|-Éy.kóH#,·Ï·yÅàÀÏO÷.(=MþÖâ"æËE/Ú§,oíÞ]áuÿ ºIdåÞÆO mÄYx§HQØLlL#e5×¦J?Þ½ÿV>^´ß,C?ø;/0æûZ_= êÕÕ=ML§2J°ÔÊ57Z¥ÿ= 8§aj1J¶OJ(_<¨§ñÏ.Uº»ôêv¸<'c°fÜz83Ê-¡§7×EHRyÕEAô£|æ_×ý]yááù¶±Sú·{TYn'ÈÍÏU@¤ªÀðc¤ H	hÏ{ªÆ§ÿGQ=MáÚ0òJÀ2ç¨hs(<;?Y·.¨Pào7à×ÊNÔÒ·üÇB «\ØÎÌàV¦Ú$Úç»ïÞÇÛ®|' °-ÿ9×Ý. >èR8[Ñ§_= ÿ= Û¹¿]>@SÛ¬ÉÍB¤= ÿmÿèS«ÌHOßP1Ó­¨d[×±rõV_L\¯¢È$2Ú	§= ô.«|vãÑ°ÔÒ¿Ø÷O/ÈºÌ¿ËÜwÛÔÖMÚ[fZg¬= ×82\c¬àû<¾ËvO¹Ü2ësãhX«g=MßÊÔ1F Þ÷Gø£ó{©
O[2I=Msx9ü.¦÷ÆÒ'ýÒB¹<¢ÿQbÕ,x¥ÐÍeÐéï~(Ç®&¢:@}gÏ= ÞETOÆ= Ñ·¿&ÀóÔÁ.TÃ2ÕÓ[ÃPW«>¥ ±UiO 	!5btÍ2=} ÿÀÃi7æyU¾&rA yUÏòþÕTéGÓ.½Ö^XàïkÝ5÷O(Âq[+°ÞËloÒõøÙ+·ö'wkò÷+VÏtî" FBÆL|6þ~ÿ¹J²pÃ%<Ð¥ûÛ¿½HZ|þ{¸Fv·0 ß ¿}&ïå¡pèÝÍB³[ÀpSXÝÁöÐÄ( P¥«jtn vE= °H¤5J[0ÅÝg	j|·tgþ,)ÉW¦|@°L«RÈ¾pêí°->XHäyù¢%Gó½ìvöúM\?2£vO,UD( s¡¡Üt¨O¡3}»Aþ+û:{7¿¬ãvubH¡pôÐp¤~ËÕëÅÖµv2u¡<#Ø§8Í.c©ùÖC'O­Û8T
}Çßµ<jv'õögéqÌdó¦ ÃÑ«J5ÁêJâ¿à×§¸kåº zÆ§ø#÷_¦cÝ³.*VR°¨Z5VlÔL/Rh(ÑK©ÒnÅe¡CSI~|^>3'
d5©Î^ìîèxù$¡®§¿{E¸kèI%2S·=}=}ãØu%Vvþ1sõ+s\Þátm]2,Ê1èh94pLvu{ûÙv¶OÌÇOfKû7}ýUíÙ¾Ë³2o_îj»2ËIC£¦¡sgôÚôD"Z~Ê^¡y#Ï±[Gì&"6,cÄ	Å{:¾0J2¢k= Â>a3²s¼ÏW¢N= 1Ä$õBÂ#ÏúäjÆ5·YÉWÃ3%ì©ë5ÎuYl$·3TÝ³5ÕEÁów©öê¹Ì!R9×æ/Î«e4¢O|æ{Hõ{ÔYc2çy³Óöèx- ×þ±zuvÞ}ûÌää¦xÇt^ÒHêF¼UîÀÑùï6L9íY¦EûÀÀ,ÞÅ;TÁºZ£ogµòXãúê´v=}¤::¬í?>¶Ë%[ú£¢³ÏMËM(ÿJ¦]Õñçpcr¦©1ÃI+¥k½÷Úy¤.²Ñÿv«Þ-kF9ð|«Ù/|R HòûÐ\ßñP hÀÔÜ3õ8ÜòÈ@Ã»0ôö¨	ÎÍUq|ZÖø©1G*CÅ0©Ý×~H}¸GI§ÊÜ_£ýæYhVn~½wí®n¡kÆ	ÎÚaÕò­®ÇkEË°$Ýq}a±â"h³û·9µéPCÖÉó3>èª"%½ÕG	µ[ËÁ¥4ÈocÇRìë3ÆÊÆ2ápk«d÷,ôò·Ø;DâìªÛôSÝ°8¼·öÏÔÞ©¶CÛFk<Ü]Ò÷ðù,ÒÄ=M7$¡
$ÑÅèÈ¨Cú£Ô%°/ã¬:±m±L®Æé*ôPÙ{ È;Wx\00øú§ÃyZOØ$¦Õ6Ep=}FÂg104ùg/(ÄÝé·F½(Îk5=}÷¾2(dÍåU¿±ë¦¨lÍó.¦½êÇ=M)ÛÝÆl9$gse÷¹ô¤×Æ´ÜÍ×ÙxþÓ6Ã1éò~4ªCéelYú¤6jö¬s?Øþ#ñÌìÁ¾ÔîäÔ-©/ÞÕQ)óc3;°Ùý/¸Lh_=Mv·á]±]ý²N3®°l}%4A£2Rç= )ÞKÒã ,á¥T{W}=U½ï@q\YgÑÍ= þ(LÕ#<#=MsUõÆmïø°é<çÔ¼yüâlÌmÃ36ÎR)j&ö¦rx^BEAFË-C0Ñ¿ïw5Ï§I[Ù"Rî= Äg = ýh<Úkt{ÓþDnwëpÜvÜ".-ô|ëYBhUáÊ!/UËÿS]ÿé1N(i¥£V1ç	}¾£9òt° «P$18oÚÝN§ëÂ½à%Ä¥«ÿ¨Ã¡3^«FcSzàÜ3*Ükêf~	­¢®u¿~¿mÇ[Ñq]üExx6>Æ 6¶3{©|rÛ;âÞë¦í>=M~4q<¾~òsëz>fLÂÀ%]¤	¤gÈîëåà'Òãà7ÃÀSI ÕÞÙ4¢Ej´UZÁ¢ñ¸ ¾êâ­fÓ¹ÞãC³Å<}AKzÿb©öÑ¹uÐ¦oJÁÃöÎb5\^%±ÿü®ó²°aMöî&¶6Ú´¦a¤³þ*?;*}ærüÜñb¦õ%µàëòÚnî}·ÄµòJ¬«'hÜÉÏz1	Qg|wryµ^ö:?Fuc¥B§¡»v|ËRàI=M´¢².÷£hYÔ»!eVB÷»1®qÊÅýQQ°ûgR!ÅÜ^´]c{#Åy]rw¶½¿î*ôASX%´HçÕ
5pµ´«â{Pn"Ðè¾õà4LÝ%Á£áLù1ß7zFccN¼vWCËÁÔÈV:æ¶:¼7­Kß}¢ <Å6-z¦m DWz>rî9ª8Ñb&­jõçß6Å¿¹ ¦Í@ÞõH/àÙÔÿy®Úëq¶AÒ­]ú7ÓwM!IdãÌôw<z8Ú@¶½¤=MçzßSÁ8whÝº|þ°ªvÄÄ&QväÂH¹êÁ6--6ÿô#,6ËÒBËÑYí;["Ï¨µöN|Qkªü\¾¶ûîÁvMñêþ,×IÞì²{tF({4ÛvÍ&¬&^®ÄÄÆtÕth#:E%Ôk 8>ÂäüÁYör­ÛïT³Âdþ9ã7£ù¼UÀ3Ù½s[÷#û}²
±3ÞÖg>q[âÞT&]P¢­{c"vKC9llùúDT(gýO
©A²ºXÊuf=}Ñ/ë'sÎyþ§/jjÊ£ó¥Åt#yÂïäò¾ÖídJ7'×¤¤«;V%ÔØèÓ\9ÜS|2ÌÀÊ](V{0e©*Cô?§ã= Mêo1ª|HyuFe(T¢é7èæÓ³zÔT@ËïI©= Z-WÜß4rððB}©4\bLÂÝ¯JÂwr(HQ£$=}ùC3	1¦e(T$ 7êtWó;8Ep÷7å®Ùâ¸v=}ÌÁ" ÀB]3æÒËØ_À]1ê²ä®-R! Õ9·EYÁ§²gÂÄBu¹éäv0±RX¬-xC)w80ÄóóRê	i)Ìä£ÇsUxÅßPXPóÿ[ü,'êü,±ÚÜ¾n=MòÅÕ®T¿Q=}áö²+I[½àíîóôI]¥ÁK{ÂÈ½Ñ=M.Tèþ n±¦KÁåònC£3ü.[î¤IG#ôOïÒXhÝ6¥0cÊæÇ¿©lhv¤Ù»LN*âõ_º³üz¦¨¸¿Ó²Õ_Ñd´×t«~¢{nG¿Ã%C(»k¡U»¬÷9N4,äMoÁ¸ä pÝÈRF¹3ó8Ój¸>±{¨½ÙÁñî06Êâop¢D­~UIM\tíÂw	ü"¢SÐ?k#·ÇÉ¶Ýd w £¨yè~êN ¹ùCºÙåIW_÷= ?IÖDÏµIYõ= U-MzË-zÍépþyL/fEpj¨ÑØälÇ¨g:J_ÖAW º¦}mÍ5©þuµâþ­?Äg>6#´«7¦a¶1jæ­8±k>¥ï¼²®]§º]!,æ×¢×25ò¡ÀIÙ\)_À èõÆÌ²~HÁð8¾ÆgÏhXÑ'ìPÅX7ìÂ²Ç¦±_ÈkÄÆÈ¨þv=  (ÅØè¼©ÈNâp¤âp,°DN¸Mø§L:±4Lcþ²>¶±"¼\êAaa´ã=}qtNLyyþÛMðZÎf$; èUÁqïý³qÊëqLOhb8".Z8sîÐ:É6Ï¤Ý'@+LÇùWy¾ÞÄ²µ=MÎH<R³æZ½jAûV	B{Ê£½¯(±³ª¨§à¤Dvþº!6»¤à.òJ	ð«ÝçM0 h¼ÔÔ¥{QHó¾,Å1M.ÂÌúW6úÖ9¥Yñ0bCÓ"Rd×ÖÑð=  ¤a4ÓBçä¥²½°á¤QX¤.Ã=}5eÔ0{;Û«þi3emZ}àùf(ù¬Ì0W P¨/ù9Z2úóàV.= »jÔ8é TDY®LMös(¾³JMòê;IQFÉí1eÎê±à¬iÑ·Dªe´6
2}óÖªw^û R|ê^-y0ÙõJf6(b¡ÊEúÂ^8¶¡JàbO!ÿÖ0	?¨ì¦ü{ËTo¶blø6µÐÉä¡*^ø¾#c<ØÌ,
î$ñ*¼xÐ^àüd¾sYôqiêqÀºsyo3=MÒìÎ)sÛ1nºÂ½ð[Ùô:½j@h}e©K/QïüdMÐm	÷Ëº±ßtX:½2*Ù,æ×Å¡õ+ß Îª¼ÔtÁZ#ÃÌ»S-(
¢IéÀ²ü$ø=M²b9¾Aêù¹÷=}lBo­QôáÈ}ì¶6S|iØ*ã³),ý!%3CvÕ>íÏ1øä»¥üÏ%íXcdÙ%ÜÆb@
'ª81^á¡ÿaÚ®"%¥wEðÄOÞ]3¥C@ñ¹òãßI=MCpdÄËùI³ÏKçuûºÅ^ÅH+S°)Ø%P%Íx)yWÐÑSY~ý?®FFW|P5}¾Å£Ü:áJR  å1èÄ¤	>Å1Í"þmæõ'Ç= ¸&¯{A ÛÐºÿÃMðÃ=}=Mêñ@þ¯[iõþhðÀüßß9¥ùg@úg°DYKüé¶Ò}áÛOÌ	±DeÿÄ2³ØÁ^ä1ì§êG'E°¯Í¡LAEå$º4ðY8ï\	Ï¦ñÏä}*)áÄôÞà¶¯;Ô7aÁÎJ¯q8}G± }Ä%É¼ á4\öWc<¸;?¾Ò-IôK¼²W@=Ma({NMsÝkvl½¢Þ¸¦uË¾º&£êÂ¥%dôf§©@ã·û	øÔÿøOb= ìæØÚÇÁ;¿Ø¨HmlgØ³
¾ó@ÝG2XÝnâsÄ°æLçäSabóÕê?Ô2õ*ì	i*Ë/À¾¡ÏsmXîôuÂé8e(·äÂdÆÙélCJÌ¿Û~dü·"<¸Üà°ªO­!áXûiÊ«ÝÔ° àpàà	ìvÇAðp.zKXó;¹½/PXWúf¢[ ¢fä.Ô°õº¸OI¨<{»>ÀË¡£#¦@¯M	WL6ä96ØÏÌø f)n;.þ]!Þ¼ôIÜCv;TD2§¯1{4]wE¬@ÐD5¿ZaiÁÎÙh*H 3àný§ö]^3 º#%²ö{V&¹Ö¤[LÞq¬®]p£Sª:ÖËàðø(ªEÓÛó'µÅË®¦¦Â¶[Yb©ö¶à;ËiÆ[¿R?
µ<nÍôßôz s´Z'5"¦¦´éòjÆ×æF0
ÍT.ºxaoñ¦¼ïVÅÛ]Ù»xç ãqæýÅ	#JsnÏptó 8)AÙtB«/&QIU'{QÅß®P¯,4T^´EÇ_|½£Uª-ÔÄïèÃ[5±,kÔÁ¹æÜ¨Õ¶DRÄØ2<?²U¡§©Y8T/íüÍoÞÖ;/ÏÛÉÐß¸<>±×¯ÀÝpp|üktå¦*]RsîøbdúgaSPÇáê$²¿ddô[=}¡Òka+Í=}×ÿ]øiBOÆòxíwi:5\#BÐSÈü!cPn¥è2©A8*Ýün"Ú¨ÑÆ'­>ø?= %Çó
Vo½ÉwâÆèS\05k= ÉÁ¼Xð\¾±+b«°¹"Û/	V©¾ýg¦8[
=}¨â1à²àX[F= Á÷]ÅÛ(>_û¶û ´sÈ.ª(ÅÚ$sÃÛð6\/6,£GfX\¾}]'¯:KäÎ^tm&NéÂ~ÔP5üªæ,ld=}Ö}X"\Ð¢KÊ/U}æ~lGz8î\7I¹¤>¬ ØÉXr?ÚÐv= gù8ÑÛó_³Ó3 óÎÅqgý6À)Çô»ñx{*U^àR¸[ÿ>Ðý G½þÏnÕv{MÅôÞ?Y$ç=MfÛ<:h\pU5üå2ªéÄzm)x#fÔô×Úl¹uéù]X%sË#bÙ|#ñm·2Xé×W5ØàÒ.KsÆ­Üd,;NºÎÂE%« º§ÔiX=}Ö|mcÏé=}×)Ê\ÕUÙ4Ñ(VÎ¾ÿ°sÛ6«êµCõvÎ¶ØùWãr¿¼çËý«,ö¸t~AUv[ÖÒaL ¸5;Ý÷ÕÉ	Sð{+Ì/fÿ)ðÏ¸ääéÌOÄÒá»Ã·åeÄËZ7@,*$&ÍHÞ2fòæKBzD4	îKu4à'n_ÖÝKÕBnþµ	ªBFcòÅ¯¿+N//RìärÒð£òk"XM#$\
¼=Mþv&ý-ÅÈ©©[Å5b~7M$¬¹Lý
gö÷GIæë»è=Mx&õËQâ¦Ú/6câu²£8W÷rXÂÕðè%ê¢À%k¦K(¼x}éÚêstD¦Ä/Òcï¿xT[ÌTÝtämÌÔyÐ|GÒµP|æÅ<p'¬®í1¡ÜUUäx¿ÚTÄVpìðé·y$aURÆ»4½Ôµ!¸L®ÜåzÌRý¿s<ú®Ø=}Ä£ÙS¾T>ZWGa¤öµèþ}o?­ò·üðni0{k:~ÿ[$tH:	2§¦¥Öa|:THË;<°UfÇFæ:T+øN|´+#ò¡E)¯øÏ#®9|¬Z0{â¢)×[ÀÞ´¦%»7r	Ä£ÞÝ/8ñÿXª)ÃÓP±[ÂÊ&rVÂ*Dd DÙ¶f°=}àé;æÚnO¶6æêÍ0O¼ç"2g¯qZa2?³W]ª¨hO¨½rÁ>Kv=}Ãr	õÈD¥s0g¸y½5ý­°øä¸Ïtc8ú}ÚZLfPìâq äûÕöÕ®IWCd1¿vücO¡Ïö=M=} 1Ï¬ûÎN:Ó=MÖ¼ò»äÜ1b#òfÎùß¤håHNIÐkåå@X&nÔÞB}thE¥êPø?qÑo71*mod0¾ÔzÜO>0¦§±.(jå¬7tY¾þ3Ã-NÔ¡|È=}_káqSicA+n'ÅRËp?æ»É¦x^ÝÒ¨ «ÐBKÉ3äCäH[Á¦Ps©	E+¨F=MhHùH2m1gþý¥P¥h¨2 ¤LÛHÄñØ!= 2-1.kôêJævIfÓ!M$/c2H.·)¯òoÃ%n0d?-p¶?xÉU×WTP,±ýd÷è·»$B^Ç×]ÑxWÇûÂ&+x6Î1%â//¬³ØÊÔ\eo­ÙíðP#Zi!°x¹,ÙÝ¥äu¸¹¼Ú^Ç755Ð+cùõëùq$<ú"0­ø"cÆ=M>®?/d¢Âk4#8£´©5}Þ,2øbú.¤ÏOäÖ_É_ùÑåM3>é¡U¯+>oõµÿÊqÞQ¬Ç½ñ_¯¿{}OÃR<ÊW@¯èúÉ)µÝ6Þiåî½ÒOá]6Îþþ¸§æhÇÐ|Q®öË<cPÞB-)-nJ¼¸nGãö?%Øòoö©ÃÑLÔ3@+Ø¨Ã¨ÀLhL0%5$.µõ5h¬7ö¾ëL%%Ë^8òÚ ®kÒê$¨N¿è±}mM'Þ´z:´º
éz/þ	Hêû@^Z¡m}+	¦/'§%e3êZ/Iþ­¾ô²¶%Àô:yÛÉ	Igi¹¥¿Qj(S'Z>.êÂLiët¶ÔÁ|
jUVñÜ?¼r 2÷-ÚD@Ue^R¼ ÃE@þ%ÞF»°´´ýn},îÖ÷RÖí<BÑg~M?|jÊo¦@÷ñvä³®§O´ûµ0BbâÈ/ û0¥ð~nsóöá=}ú9RHU@»óYºbÜ«%¬âÏ1­ÒßFBx&YC«Å¿L9àÀÊ1ãV¾OåéÍØ¿Ç\lÃA]A"{^¸*lU®®\o¼¿e ±rÜÑ\>b§R+ Û·Ö/aÕnèùÂn-×Ç= ÞÛ ÚÈØøxQ5CT®^î´À(\TÍlü<ý~¼kHDº³ÙëÙaA¥$³ÆÛª\îæ¿nðÞ³ß1]À´3ì^àqÈ Úæ§Ø±Õ¡Ö4cAc#úK!Z-£TVnAãâCäZÛ[^Ò´{¹2Î^Û?©²´y>d§dµ#~pÕØãEq¢´cäÚ«XÎ?aßµd5q¡ÌB0q¡èGÍV²\¸è´ð½Ò	À]µ"=MîpÔ?HÐVx;åFLµnBÉ¾8~íïZÀûrüýÃïGÁ=MÐW*ñêaS~R CtVõ·ªË¨5Ò!m#jlc[)âa&ÖHçÌµkl¡µâøP@Fñy¯	Å}âÑ
n@àJä GÐ¦1§"Þ©8?@±»{ÕVá£2 ágëx²E±¿ùüP.{]KàRÓ·Ø=Mü2» =}®;Öñê¥×1,ÐMº×D$ë9I~Ø÷8ÜÍÝ7Ý2H»'¼ï{Ïp7:æÝAø¼7­ûFTäÔci 	òS«e·í:§øã:­çÞ(Í^ä]/AîÙ¿'ÛÒ&!¡Ä_ºÝ©µ©Ð­,éçmûb+ìðEû°yÐz½&[+hÐïVz3ùlîë\Tißd©í7ÕIø$Ö¾= ÿlk@ÛL&É%©é»DF¬æXæSð&ÀÝCº°É³îo¶NÖØ±OÁóº%M¬F]íè@ÚíÅ¹­$e%¨«Oó¸<x<C÷¶Å².¥âxÉ WÐ37´yíoj¼|è¯okABoVóygñ$ZU·
GD9ì7<¢eæGe2Cl´;_ÎaW¥:_9ãH\_±ù?sê,e§pÃó÷R
$3
Y@Ð¤ïÖ?³AÊO¨DBseý g~Ék·C5 êÇt4EÚeX¨ç¨jw£Z­è3v¦,|mã´5ìÄÚëÇÕ£ÖSéËM¡Ö%p=M¿ø}¦#TFü\ÉxKùéKV^x	´D_¥^³WÆ	ðÛFÅpY7·î·ÿ÷vfÆu÷,×À8:ç<qô*!/+SàÏ./ q¤Vs´¼0rÄ|VÝàg~w£ÈÆl TÍ;":à»ûó½å\Í;iVhÂ0##ÙQ¾6×<Ëé;yUOú]pÏ/8%¼vN8G&­Å¾¬é¼u]	\ÓC|ûKar¾ÅA4;tJþåÇî¤T´íIþÝcJ~Øâ2\aÄJnM22¹b(ººø±à÷<±»à/±» ÞÐå³ð-grz«Yàù	Çß\û	YûÈæEuIÝÈé¡Gz^Mx¾CpÌ¶·)¦L©^¥Dj÷¨çm
­ãÅL@KJÊ$®/ÄóKïþ·LwÒ´ë×wHÐkK¡þÔ)VÙm©ØÉËð¡ááÚv9QíïKÎh1È0]ø½m¬pwE§qE­#ÞzoYÚlIìKMU®DÂ×eý <¢C¶aÝ©ÂôÌçÝ1ðX ÿ4|ÀJ]ñr¬í¿¶pìÕ ë¾¢,¶Ï=}ÅD=}?%Ù$.«¯A§[1¨¹£~>xpRïâ¸W·µW3Yäöp^ê°¸i>N"­0¤Û/VÂ¤^lì¡¬º¿pcÒ¬éC£>a7I, £\éOÇ?î[ÐfÛvõæÔ=}ã,£Dz¤:¹Ókbh)Ãó¯t!ÃDïæ<ecùÝª?ICWÌ1øÊâ!ûí¸¤}Æ°£2¡ÈøL4(é#Mm¯&ø¾Sü ÅB'«Hº{
Ö"sGTÏö$J®!n {ÂIÍü¨iYx<õ
&X0x®ÉÎÌôîÓ-«Å(¥­+çâG'Õ^Ï²YãÂ<ëï0Oè@-÷Ò&G4y	Å¨KSe¶<RviX*JñÐ?ÖÇÑÐd×Î,5,^&¿w+ú¬ûÐ>½É¸ÐÛÖ~F¢?KîÖ'âHI}¶MÞÏWÍä½é¹:F× G¹6 
Ü*¶0kõÈ¶0kõÈ´0.ïbãxò¶MÍ½¦4òì<±= ÒÞÔ´Õ°0² À³ = /Û>n¿B÷g=MÌØ½LªÏK¸>Ox,±JÊòd²¤iÌK[1@C4òÆé!!Y¯ºÇf®pÕ÷ÓèÙR2¥«ÔÈ²ÄÐpMWTkH£ý C­ÓìÔ_ÈÊÖÚBdVSUîhâ$Jóô3¢úÆ!^²Â[ö»Á²h¶Ð¡]tú
»£XS{kß"-4=M¨üUñ»çó§Â11Iç~NaN½NæöùÂõµÑmÞçésÍ½tð~â¢üÜE·ðÔHü(Ò¾SÅÀ[Åß/RG_G¾=MÇ{¦=}¼=MÇ¯:­®CÏ{fâ5Ôý(Çþ¢Tò'~.ç{ßºÞ
ÜºÞÔüI»UItbÇ ±E/èEC»R¤­UìR¾#á EáÏæÉP¯k¿[4ÉÉ~ Û| ¢k
,= cö72ÕÅ"]ïÿ¥HîVºQ¬æw]O	3F0:G¼};Ëz<úl¶¯p,¢,BËÍ¬äÃÛKóZFÅåvãÎ5)ïÓlZ<CÈÈ#lÌÒp >çW-¶u«y{(jP$®ÉE¡'È¡) ¹Ö¨ÛGU½¦¯É´óV¦¯õ/¯ý¯)~æ}ÈÂ-B¶Sá9h¼ðMÅÏª¹eg¦Nx7Kì÷4U±#Dï¼|Øµ0l¶.4=MûyWm~¡Wf§J'Kg·-òñ0{ö9òy Ù
q«ôc§qMà)Uä}ëUÞ´i|J=}aÔ\ËVæ-v[Ë×ç×üË÷#¬W+û¥/}iÆ#|ô¹Ï±!GÍ!fá»zMÚ±J­¶0A[ ]³]=MÚeôO½ÆH*ËÂK¶35söXá}R»Ïk²µº\/´3Ó;6mýMù$(=M;AºËâ÷ë=MéE»åJ,¤/ì:7ãùuÊr\©NZ0B¼RVv¼$nÐ.= åé÷°Od«ëJÙõÆ¯;çôv¦Bg­Ù«L:-Á)L°#îdÿÃ9_±°aØÓßëFÑ?Bl~>ÉZÏL1óöÅ	nÞ£»Ê6¿¤d@,zC2¿<uûô}im8À\O.C<Óþ¾°ëb$®äø¨Ô~7YgÐìc¨Áúhm°¥Ðï¢ÃºÎ®ÿl\$[¦6 J?!Ôá®,ÿd\bÈ6d(âÆãCÆ:÷¦½9wZ¦ÛöÏãÏ 2-<ß×Ìõ\Y­<þç ¹ÄC}<­y2°;k=}ÿäÞÍ+dãûÌè
¨ÜÛ £%í¡,êÙQFû¶×Ý³ÉÉo\a­go\ôËÈ®QSwo\À¬¿'|Þß+®{jÖÛP5¥ìüÉèò½á!KK4»EJ×Ó­xîéZâRÂkªÁL=}ºE[výSÇ'¢ÂïO)vw8ÛfkÛyaY¶KYÁ®x±7¦5ô2n)Qd#.ùãÅ{¯&µï¤}ÚíBwL~ã¨¸O}ÜW±õ÷è)lXGv?ËoåÓ Î­÷¥Àsv¦SÔ[Üd¦æ@Àûv¶Õ£J×kwg­O@²xäÒÏ¡æpoÝ=}p£D1"LNþÒË×ÅÚå&>úv9³ò ÀÕY>.2¬§ù8re3|&FÚ:±,ÐÃ[³3A~×Wþç-âÊøVÌDýäÂüÔGøÃA
4ÃÞkß" õrüÙel°ÆiN$9Û¤ÌÖ08ä*ÒUèLã_D¸ÄÂl5ó*5Þ:pa8ÓfZ= ôæÌ¹í=MgDEPJ0Ñ6©RÓÂVðþèCZÿþÉYößª8ë
Oµ,;Kh3­¹æ&À= ËZI^ú¸Ñ)¿·0D%f¾C<;·O|+1~³5ß8IßÜ©ÖÁPAbÐ³ÙF!J_¬e<²üË-Ø§5õõÑsd²Äá2ú @*"*ñs£UE
X¨¿å~kêûÙt¥7@1Ó ÉÔ¬C!<1iÓÛ|¹|Ëõ¯IíVÙ+P²àÅ¦¨N÷êÃ.-8Îâ7Kù#>o½7në;P5±ç'æsúaû<ZWôd= ·üÝ¢ ÆÍ06>Ù¸Nîßº·Á }°WííPíß:HälÙHJÑ0,e´ÁÉóÎîý<êcgúÓR²-W	
ë_#Tbn=}ÍàkIà?'òÓ-D1=}û6=MPLFûñ¦ÖkBÔ×¤FCëX[ÄÈ;vKK<·Á@.Ñ²ôÄNý)W¯¦ôS?©ES/cb	êtÓþÓÌQ­s*	Æþ}²ÖKßç!Ùô!ëÃq#?¬ ÇùålïÉÍ(:zÈEØevªOC?TW¤tÒÞ¯Ñ*9Åù¯]
 h´i}Wä½8Ñ°qè~Çv4æ°ÂÓÂhtÆ1±8/.LWãbì"ýQr_ï´úÓv
ä9%ùÅÉ-½B©íÃâÄñÆ÷ªúE=}/Paªî~F}¦ºë^ÿ­åòN@§FÓxËß¸fÑ¸$¬ØD5ý"q=}¸°pºÄX¾k1dÉV}= 	,¤6jÝî?:ÖaÈòÖi)nt¶f¨ÖièÝI##ÊzàÙràS¨îãR£ÃÁéódè Ìµª«ÿÈ<0Ëú$§M@uw/BîeÛ¦oèA<,;n4ûýX</öc~Ö2dî_.^kêËãÆ4Çu0e
àµ
¸ÆH|u0}~Ó-yÓÆ{²#r.ËsûË6Ì&A)9ç/ùî4Æ3Im-®ÌÿóùO8P^IZºH§JvÄàÒ÷.ÀhÅ­®©{âê¶BlÇ#°SXÑ ÞFÈYc¥MF>÷5·¦-tÑÙåÍîäSTÅÇ½ÝS")}¥ÈÇÒ­S¯Ï½ê=}¯µ¬­¯G=}íj/±Íe|@§Õâ=}Åôödô¬¶ïÓP]·®!¢ºéâHJ?åïMX°6sM(¾I»ïoNXä!MEñÑ#[ó	ÎS¡Ô8*ÝhwòP÷Òé&#áQ7¦!c*{òîÊ¾ïì(OèÌ{:qV¡G½é¹q= f.ÔO"_yiaO7*¯yêçÎé·BX¿Ê÷0wøÜVV}Òkèè ,ËÑî¨F=}ú+¼ÿKW¯VOÞ®PVI!øÃ=}þæn¤¼ùÀ¦e¦{=M«æ´ð8Úç}yÙ±ë\ñA¬UÓÓç$ßùtÌçMïù?ÃAV,¤=}w¬[-Ú,$"A®ä±C2¸¡¹Vºë'QDól0¾Ø½1Æ&/hE¶LE=MÌÖW._½êU@¦F*ãx§ì"X³ÏeOoEùKh¿ø¾ËëáC5A=}z<bY¶»êüö}0¯6­íÒúnEì8Ý¦¼&­K~´+i;n-ìgõ=MdÄzm°1¸·09= pÛ­ {¬
wÅ"må£½ÇÀÆd	«ó©"¶g35¯@_/ý)Ï²ô?7jU1²"ÐaIêsåy?ûeÏ¶á_QÀîXôèãLD3ÅPÚZ¨¼âX\hÎ*yþ´¦*UHûó¦]{Ò<Ù(âZkñ)åeæOöçÓ=Móê1}X½ý\åÀd3E ­Wo$ÛªymíÛcEbÛeÅÜYLEP%ûLª_ÊÔùé®UGµÎ>=}I÷T[³epZåb3â|¤Þ¯1Êb]ÇMukOÒ;ÈZaò
à¾,H¼)x'§µr¿y>èu¹TÅÃD¥,Ùü¯¡ñÖ.UyÿMäõhÆW#.N*¥Îl:×?óiG+á
gKÝÆRw?;U]%ÄNC±¦(û¾u^x®,Å¸ uî)e	Ñ«wnÖ:Q|ÁpÉÈ°Ì6ñpEÌjófÆÖ&7YÂ.¯Ä^òC-²ÏÆ°.Ö¿'¦­Ïþ9ô0=MÙÏÁ[¸gÌ·ÎN×¶]#ö9Ô	êEan¼¤hº\Zë¢pDnSÇÊüþ~$[÷¸¦G*ÌP]l$;¥Ð¬øù¥æ¦8Ëé.B&ÄR	!Ôó9Ä qÝ eöÅà"É ¶þvß´ HÏÝ¿9 Ì|G@¹×v-ªD¤D×16\=M~nZc°ÎY*Ú¯:sÓþëÁèK%6ú~BJ]³³ -=}Zß¶³D	¼12WFLKË½áyÔf
D1óþ×"²àö¸äË­kMÖ×âÕcñ;%«^¨PÝÖ@Ô Ü¾ °'Ñ°ø×3¹ËñAIöÐQ~[=}=MÌivkAø9îf(¤"ýÕ\÷"D­©j±!Ûâ:×Wìk0¡-N¨¾oo¥i~{¯U]pÒox;Ð!Lª#üxÂüQÒ÷½Àb4÷~PMßÙ0»¬¾jLD8p¯å=M5'?}æ~ØÉºÌ2;(ÿ¶Sï°)n¹ò¿Oøo­y_´ÌQßÄA×Ñm.8Ä°Fí ¯S1CÑR2~·ÿå«LÇAm>×é8yùmSj}ÂË&Ï@ÏRÛ\QÓû1mYTýÚ¨wâã^ªºâ±+*vwÐ%_;¦ ×ñòÙjÞ%ê&úqJSÊÃìçSïz'´ÉÛLPÝÍíq=MJs
]ÊJ¿î§înê2|±¹*%Óþ)W"eÕú±¸uÛ{
9@M;#mÕL¦tùµdCJ÷^í+2Ti¡\;ê	{a}â#A)ëxÉ@ßZÛ4ÙÈ¶ != ½<1É#>î qÔFMkwr8ê»èüV9¡x#6zBÏd9Äûx=M:Ç£ãv7IÏfÅ^¬z=M,»õ0vOçÐ¡?3(iOÕ6ÿ¿Òs 6í±6óê¸cø\^¶q hå/,kßëw(ho6¢lNªFå=}²YôÐÏ§8x8@ÍvÓaq-Ïñ¡@1ÈâßÝ>Ð
©u¯m8K18dëåV|¼	²^é+{ü	·õ"RôÕ´ûõJ±ócÉîûEIâ"êÛûEÉëåzÉ{k=}¡ñJM§Ú0/Áp[W,;JPÖII"(ûUúÊMcO×&±}LcïÜcL±?ÓêÛ_°î»&/"¹ÏëtÊ­)d¢ìo¶þv= ªÕ¡]ÏKlÉ»±à¿² iNM0¹FHË Ä7×Ø7nQZõô£ÆÇñÒæ£Æöüdr8åÒ(=Mu¿°înä¾GÆÔ0@&â2dEfP¬ö·uÇaºPWáxX4kåÊçø·àÓ®P9=M&øÔ
rÈR°û0ýÑ³¡}X%dßHÛäÝ3Õ}-;Ô¡XYÖ	
éf[EJ´6¾SÊr,(h4Õ?x¿wf9$oLI.obãjUîCêð¦²V¼JÒQ0áÃ³1^d¼¥¦(ae#ÉôÛ÷M	l¯DØ
:ÕO,Y×Q±qî·_/WËÞ[¶¹ÂKn$Fo=}|êút~r:§ÏÆx,ãrZÁJFº$Ù 5cÏ6§=}Ñ2jÿ3ñ¬[rdÈ¦? ªÐÀáù¦ÑÃ:¥èÏ^Ë«%ÐÙòõ{lÚ«Å¸ËI¿Æí!ÜPØ$\ùï±,õÌT¬®Ól¯«°~~©Ê@mMø7p4\Ù¢r38Ê$êOèÄJ»C·9èm¨vÁÆh±2vÑ4VÚú7 Z¶SÅ)ÞWEdh«ÖW&À[Åi®ÕÿÁæò\ÙyMc´þ3ÞÕÈ]unlïöùoó96!µã'k {.ÕÁß@Ä_ºú»§üÒ.LüÀNÝïkwd¬>Ë­=}¶*zÄÃêÏu§ô«¿\æÌJ5TmrÀndõh<ü+öÖ8«³q´&ÀùÂ¹ÝB5þR"Ñºnj76ð5Òëý,nÖqòª%øôÿ¾­Û<?{(*z%¿ªK[nø§-âI×x¦DQwQVÚØ=}å©g9 OêxE¥Òº³Ðk âÛåØ]¦GÐ+qãÐIôÆtOÞKjÜ¥cZ.¦ |÷= ÖÀ"qv?x7Js0mF¹«äóÃWÔi©)ªá7æ³óØãn
Jm¶5ß¾477ÿ <ÛÎÙ®x7¤$%¶èîfúñ&.Xu'z«=M9
t(þtª?X"#S/À= ËBLÀÉ¯Hé0ÇGp¶²Îu¶dKãùÐ¹þ&X½DupËÉÝä§ÿ,ö'RäÄí	=}m þ¥BñäYÿ!Õ0'!YÕZZaF÷éÄr[0ZP]-3Õ¿5«Ëâ'à°Õ§ÉP+$~ d;æ¤|tJÅÎ[5¼X®ÁÌä2#¦ÈK@Åæäö9ÄólMÒØãÚmvÀ_Þ½n¼_~°*¥dÙ»75·>øÜ5uÌNôÍ¡ÑÖÛÀßìÃï§[}­=}EÕ>0}¶l½W1²!b'M"SNs}£ôP8;?2þ¨c%®iwÝBôr¸mûms-p×à5û"ú>,?2R¢'a¼Â¤Q%oHö&:0ßÌoa Á[Õ= &KÊ¼L¬LRØQ<øPb^>ßhUôÍ]s*õ^µ@prd¨9º&8¾HâEÜaC½«=M·Ò/é3rAÞp»ÖyÄz3û´¢í5â­:íÊP./ªeË«K>QYbà­DÀY$úFnFj	ÜãèVÄÑî4<M\SPkgÌI&?"e£Â¿ÁÔ§¦Ü¼÷uË«!èÔ9É¡î_h³í¼yHô¶ËÖÛ°Ù½ u8ÅX÷ìB´*¶ø¬¡VQÄÂë¤£ú4&±	îT8
Ú?~¿yòtª O-8¼=MÈßÅYXÇ%¸"»»xr¶qpüEry¬ê]ºÄÍÄ,;Apª*O+U
!©¬úób¸N¡0,BwhBsÊzYÈvx¨ZF³11«®ªßX5YÈLÃÁkõ×uAVeóÝ¾B£Ìd¨Õx«!1z$ËÓ8t½=MÌºÊ@%©±¸ëÑ·ò2yqeqÔÜÐ­­Ö¢¾? À E2}úöÔú\å ·®GÖqmTënÔe¯ó,uíü^¯CU ~ú; (êFjög[ÂG1/-5ÕZ*×.ëZnÚõU1¥táØ!×<vUþÇØóª\:)qÛd×£ËÈU2Ü©JÉ{v­óðnõÛf§eSï2Éäý4µÚ®ûDa°ÈaÁøG³ðáÅM= ñ;ãÒÚÅÈ1¶úÁ_2ïàÞ=}8^	l½Ø¢¥øe|k	Õ»8=}<§9[´K4 Fw£/¢be0úRQãô+©>±YºÎu>WPî/i«o}©¶Í½JvÛÓ<uWw~ÑÉ¶ÉF«ÙB6ÊØÜYëê7{&D÷%7Y7Ô&-ªOOAîÔÖ;S0?EH6©]gÝUÃ	hÜÈdDÖìK/èçQÏÉê«Õbo·V6Cü¾ûÏòHÚAPæO%w÷wmöseæÆðòÉOzïX¨ãnÏUT¾"Jþ[o;îÖ·;oa Çç53=}VöøZ¶g:¥oY+fq+(;ãHkøðÀi07ú
7=MµEe§+Q¦AõÏB8BºVÅUÕØVX>$VØ±ÇûSaGQm0w2êÖé¡Í¬°~>µEè(Í¼ÿpCS0O×.«gìÃÏ6½8öð9¦Wk^^G=Màc-kÕÜrBÔ¹kIÊX°OÿÒg±	é»Òî2J±!|ÈµÖ~Í¹%¬)=M]®HF¥Kå¦°yË¯«òP¨1tû@&³?xNUïa{ôÎ7 ôzj_MïÖ6Þn×Nõ>
f2]Ð¶>ï°l<ÌNËÎQBu¥ÐCíùgd¿nÙEi¼ø.ÎèÎñww uÌyS>kO1kêÒú×ú×]kJé= ¿×24|7¸)ÏIÜg ÉÛ&]h_#4¼'lã5îµ¯Vúò,Ê/<*çÏ%H%MÇ¥úçDÙaçt1ù´ä Èz8É}&gâ+ÓW$~*[i¡z¶éO¤Ì³Àªxr$ToÈé<°æ'×nÐBx	#íLTV0#¨qdWïÀyæû/NäåêF9¯ÒQmÅ¸Nà«Ré÷§©¿Ì ÊmÆ3eaöxäE§ R½ÇÆó_óRªµº]¿yÇë&î_©®òÐamüÙ´Éañú§Åå|*ËTçNÏ"§$®yc¿k¼ÜK(SUùÑ5ªã3wGRnì0y â^tþ¬¯BÙGAB°:6ú4
G®AÇF36Á0Éh$£ |Í³È%zOc³zªwýìÝNkªÂÊ]ùÔ[.CËñL¼×þÚ2il÷·Aª°GÐÊZÐð?>´Î¶ü~¶[ÝÕgúÆÝ{syÑh¢w$þG¼è," ­µýõGÞÿ lM¼ÒÏõUç/46$¾m½ÍËkÞÕ¾ó¬[!.ÏÎÄ÷³¤GJQ~«©Ê*æ§¾­Ø+ù+2jº¬oûýÍÅó Í¬«o i#{udßDPã?8)k~·¼UÌ,W¾î9²ÒÂ£<f(.móîÇIx}ð = = _mîö¥G'ûpGc²B**~VþrmkytÑÓË,1sä(o¢µûtõÞ?¸ê)å4C½aAÊ[Ç»QVúbT*ãt~¦øä@@Ñò%Àí]¿yâCÛÛ&¤¥m±Öpó´]Ã  Ûé¯f5¼Ö·è]
[r¶âJ5ù R>Hu:
 
jËª÷$/ÿñTû>÷%=MiUJûS³.@RáÎ¡¬ÜïIGobÒ>=MëÁª£%Õ¹©6¦i5PºBæåioÒ¶Î,qSÁÁê4HkÛÏwµX°\¢µÜFÿ9/Ë¶zP%ßwÊ²÷=}ÊIfQ©ßÖWoÿ|Te6ûÅ²u§ >F=}vº:Æs4®*Ó
(ÿý%:-ùFÈà"1àQðV=}ìù	¹|%k,ñÛØ© ¡ÍÃì°OÀ¯~>G®àü_§½îZ\Â¦°"BDÞ¥Û"8ÚP¡ÖàçÍ·ðZÀJèí^Æ<R8±XúÍuøÄäÔ$I²¦±¨.u2¬YÊÎÂÍ Ä7SPÎOïõu:@T~r8>þ]0¨¦>= =Mq
¬HãìrÞd¾hvb
RÝiYhKÇ[éb¤Û(øÇí·^àçÝ¹®¢¡nV_tó/Ñ59Aë[æ'ÍÒPQ²Â> ;uQ^KS½ûW~wÑ×°àùce¶éq(= B×âvpPò¬ÎÕ)6ãä{¬²çº#Ñ¬6óÀõF÷¨+k¥à1½h³Rêuúó¡íÜOWÍ'£æ¸%Ìn^	¸e{áë³áÿ~î/{¹WãM×¼­³}Ð2æ ]"!D¦¨%À0Þ£;§= NLÉ)¶Êü OüøSôÅøÏäHUÊïýMFÎó²Ì0á»ÓÎÎíÉSÎoo1FAJÅ*±² hçÿyBQ --"bC¦%ý4ÃCàñÈ<ùTÝê7ÙëJ+¾§¹×¬¥È&~a1	:¯òw©f5ÄS>H_7YËÕì{÷>°X9v|J+l3Ð¨>­÷L üÖÙoË-JÄ·ôDp¦¤.!©ñ¡£§"lo^Oi£Ìÿ9þþþ0ÌNúÅõ§³Nëü¡í1PSÀá¼ãpºR¨NÜ®>«ûèVÜÓ6E[·g  ²ç¶Õã8;äÏ««¼)¦[óÏ«ÿ2Æe{@gE¨É»Å­VÐ·Ôh< Ò\þs·XÀ?.*Þ*!ÊÇ=}K{éa ÊÂ&^ZÞC£©FãÃ¤hR³Ò|¤«S)ÞÎVyìÕ¶ïËP§aËrÛ}qùhÇ	«®÷ó»ÉMöjêvìóò3%w.õ×l@ºJCSI"É8WIã# =}<w5öC/Ú(0Æçn®¥÷/«Ø= äoý= û×&æìÞ&y¦Vwµwÿ×jxnnd¡",>|su]= ¥ýÇ}#CÛ½íñ¤pèèÓµn³/K±p{
Æówç.¥YÀødúÔI3ýlÃÅQÞµ61ÄûjÒ0¯ÅOUþêooG50«½
x2"=M;ìøåß¸=MÜâÝá8=Ms©×µ ä¿Å|ýÅ"0=}E»#0	5 ÓNõ¨¹$m9Pah'¹ÛSP¡KµDQµÏXMÂÒxrÿÎO^Ùï1z¾ZöER5~Ò]Óü@ùms¤;äÐ%È[hìÑyGñy#pÕ.´Cí9)û#7M»_¼z©N¹é(+¶U¦Õ«fK²%­»²¦uYFÈÀôøLÅf¹=MÚM3iútHHuORÔ$%úgÛiýÕV°¬}Ç¯¯Jù5Ä=}1<­ZæÖ«7$aÎsìÔÉÍ\|zàF¿æpzàF~Â=MÔó= Pôzù»vº¥oÔ½½½±XÞZë,Ã³[Ù­-»]kN§W÷)÷CÂ®¢ÓÒÛObÅhnqTd£ÒË½®·æç ö-¡Á[»í
À¾Õ{ÔÃn7·?öÂP¼H´].< "îØ[ÅÁQÓXXGcdadô,5ÁA+ï÷Orú(¤©Å,:,¼ÚcD?UCçHõ|!]"åEoSsÑE6@Wfÿô·»U­zê<%±ZAo|%Ûþ!Z.l2´ÚydByT(´ÕO´A¢@hNFRÓí@J¼NXì(ýHàÆ~¹\þx°²t§:~gßÃ¶Ä³_ýÀóÀÀ¥SZÞ9ðÿäÇÈkÎSø¸v°ä/Í&à2%^°Ã]t45ÄWl®ËùU¾fÔÌ/¢"þ;VßWJÃüh/RæiÀáõª:läµ>Å-RBÎ;~¬pÈÒÎÒm\×åt¹oL¢D¦Kjv~mQp¸çYö¶Úþ>=M";î~iôß.lÈ'5ßz\\¨A=}8	É/YðMðFÜ¤@>Óaa>Sð>¢;ã_m­Xgû©o«KcÓ Ú= a}ÑÏD¾É|pDÄS¥öfípV§1[)<UaÇ¹9\ßý%ßëS*Øÿøù°¨-qÛ(v½M9\Ç¹ÔR2&P ec= ÃujYÝ¤oC¶ßa¯Q	Tó½OpÍ#,¶¦rjydd¸nüm¤×Økw µ>í]ÑJ)=M]üý\Â&+4"4Uï{1àøT.øU¦ò§Q7â¬µ¼Òi/þ¸L
¹¾¨ú×Õãy0[=M¦ß88pfìÑçÄ;?îUùÚ%.:{#¹ÔezG=M]áí=M ô³-â+k#{®f³MuG\?x]ºå¼2Q­Ü¬»ëç£p«Ù.<Øv±¼qAê	Óº<¤¢¿µI,=MCGô-7áàIDÖ"è´QáJpÇY­/÷7Fù7â¿ôLÆZ,î#&fÄrD²úHå´Õ^ÊßÖFì+3uæö¸Ó½vmvìÜ>@NÄCÄáyÿ¼o}PqTiÛLèÈþà>Àüx¹ÁxÜS*÷Ì¼=}B{ÁùzYÞÇ=}'°´I,é2í £yvôë ÙÔçåÈÄ:uon°2r6­ÜS¥wðÔ¡Ñ&bPO­íÄö·WRÒ=}Ó|Ñ?ÜîeaõåÛÈ;5Ø''Iõös¨EÑ;fíÒäh¾A=MÚß­Èá®r÷ÿÅß<JSÈÏZQ^c¹÷"À!9÷dmóógSÛ¶qåH:±éQ@¹Ô©Wé§¾)ê[Hà[4gÑÊª¼ðCdì]@¤Ôï ¥F¢ÑízC®iv7þÝÃê]h¿Å|Ê|]çPÔÒIC2qÐEÓ~«¬ýH&;­þ«IÊHqÜZ²ñÝW:tgiE
ÓÛÌàø¾S?Eß]ûÓ®Ó»¦[nËÍÛnSÓÌßç6ýÑC üfKU0ó(³Hâ<Y>0øéÉR±mÌèøÕ)^U!Ã(éµ­Á	¦Ù^)mpÌR}gEx ðJ9
R«\F¨£¹¨÷aUFÎrÐ¿G~.â©PÙÞ´~ÇN£· ¿¯f¤+´³æmaOôÐ$é~Õq$8±-¥yð:×§e= Ä¤¸=MÁ{< 7×ðpÄxï½ØQ29À
Vw7KÉeÛ¨w[ö°ÝÝ~Y/¢Ôü Ó@ô°>Ñ]Ë ÜààæX¤ÔnhÐßÒ}gÈlp²¿â°Ð^É@wqØ¡ÔÂX ÖPÊJNÇ;é^8¡ð­ö2CfW^bËÕ¥<[Å-ÛxïxÉväd!_MgQ¥(²ÚÓ´¿¦\­bTIYò=Mgu·-WÍ=M(,¤¿dQ2U»a³Ú¤Ö¾M5t·FÓh¢J;[ô	Î(Ë6»Xg%÷µF¶=}%¥63 Þ8k{]¿ú"naáaV~8<+&0BÝÀBª)ÜÚwÍ°+K¯¢ËÊ}X ïSÎçÕ ïTÎ¸È~Lx×ÐêØú\_ÓBË§GÄ0ÌA²nù)÷½½Ê×;ÛF=}dydíNÙ¥Ñ8úrú?ýð)×¥ÙøWý©¡NÀ×b.ÔáÀÑ&¬Ød;Ë}húäÄ'¿Ñ*¤=M¤qz1ÁæeðÖ&;£=}¤{Øp
*èzÍ*ªµ
ÚáØJF°÷È®áì\9]À= ta£Q
fªåfdg£YìëÞÅÄ@6s53ù\ë0çõ$
Ý=M0¥àþ	Å·÷3h"¡s²-ÝÄª¤q4­bÇî|agÝþ7tnl@¯ÖLÄbºR*Å¸v¡frÏîÀ¤~KHrÓ.2&!ÓbK<²BàðÄI§\íy4kÎRTrä?¾0Æ y/"îðøÜ¬£½p3+QT¦Su¼í¯ºC þß¹«å47÷¹+í2×_uB%»Â_ñÏ£= ~Ñð@ÔÒ7_Ó@^æ¥ZÙú§êÂ4Hý~%I°@Â4ÇÒáÌ_Ëßg0ÑÙ@´YÍ*f~¢(BA G-¦-½·¹_Åby{ Ìr@lÌ Ú¦0_$0ï!Ê©û	½m¿D¡ÐL»FR¡0 n¥MVB¸ôÖôWl"Û)ÔàY[@= ß8¿ØXrO[}°Â¡µ4ýÓ¦ àÏiòäÁSüÝàÏÎ@9ÀDà¼ÞnÄ2ø´C{¼7ü*Owc§¿§êÙµ ÖìB÷àÇìp¿
:ÝRÚ¾¬|LþÌ<GÄ!Ä¹ìÆóL]Å'Øéñ;O	?©Uô¾¯åý,
ÄìKÚnî«c·#ªØ²3»YåènF_þçêñ³£Yì¡¤å:D³¦æÓ_ÃH@Q¦= Hþn	 ²2Å¿Ytë #÷b OÓîfT=MÒ RÿìªdÎ#Së¸Ïf)×ì¸ÝÐ>YÞ qC½Q¯ú¢4Ø:§­S¼GE ­ØêÐß¶ì-ñÅÉRgÄTÒ½Yvp»ëCZUàÐÔOWÚa?xqÀbý$Lík¦²·¡OsªTÝÁ«:£²ö¦Õ.X²ZFôèºe¦«6? +?h×ÉºÜ_ÆBzø·q9ê¸µÓ4P5|"(ífÜ ¿àßÞ¦j-¼:w¸fÌ iºÃÜâÕÖ~zJ¾d¬ämõO_Nd½îN=M ghV¡YNÅ:£1ÿ{µL@[F×#?/x;/^»	ÅÌKÌ©dKFaÍÜúîÜìUë3 3%!ßQ ÏF´ëXäàCÄG;VL»©WÌÞ©¹uåâ¤}
jnÐK+bNn7V©æÿÄatøUÃ»2È	À¶òõ¶@«Ë>Î= }Ù|:?bih[û·>ÍêñÝok3×­ÝÑy\¾v~>"¬J·Ug¨²
ÀA)ãÐuã¥g? r,'¸ðë¦NaýMí½ãØg³RóÄuùHuÃ[ ÿèJ'ð³2ÖÊâ¬HT³ëZ#~X*ba|g~RÇzÒýq9^(ß$ËM)h-íâÕ/ºÃH}²×o_2Ý-¨mm¹dË?= ½ÌWtL1æÇH%(Òo GZØÒÅF<xz®ß$I³³ö-ùöjú£«l¶=M@ûR= kþÙKÑûqwi­Åue ýc4¨ýÃ­ê:9¼ö.ôÜæ»Í¶!Mî½íå(%²ÙáïxD%9Ê®»IÙß&ÿä%:= }Á¢ÌxÙ´	ã«±Qo;«ÌglÆÀÖEØ´÷(­ð¥Ö°vd¯á]_ßÕ4Ó"Uô){J£:|-7=MªD"oFäc 0ùbðIs*¡õí3Øm$iÁ¨"Bj=}= ]= þYR¹BHìenm_vXèíuÉH¦30ñº= ÇÕ<ád{n­ÎÓÅ-£(/-ßµ-ÒîLghÛþ4îQ7ø)ñ¿zÿ:¥Rõlt8íô]çì	ùÉÑTm\W­#ÍN­y?<Ç-(_Ý«ï(´r§s³·ì%¼DïÃd,õz:p´<h+ðù
ÃÏÃd)R¨¢}et°ïñ«òRU¨¢ÕúqÓáøÉ'£x/*Sè5/eOWÇy}¼ÅÎ«nT?mÕúËaãb>?Å·'±ºWäfÍá?¥°iüx£úzÃR¤tª5¢çÉý.{îûÑKaÿárQ¿¦-gDiï{ø¼²Ô{o3õÝcAA-=}éAþ·Kuxp~(ÿFÒpâ@*«ªK£'=M~ys+o^ þÁAöÄÖ#v¬¼!Èq·üúO#1¥Q¶)XHõûÜaCayÅû¾æzÅ"k¨K0Mw¤ñ³ðÂAÏTc{¿ÛÓ÷ñè³Ï®0,2=}Bq[ýyßzöìR_y=MR)(ÖM¥£hÇµãæ Z>!¡üDË¢¡U44ÈÛ­ìêiC
oÁ)¶¬:Z+µÓe(5ù!ú¡È);±pC?*Ð@+ö@:¢,B#,%.-åGa3yh§âÕO[e&YÔ»&X=}«4eveåâ/D_wnRÀ$í,Câý°A·bU/úEðúQÂ±a¬Qv3k"Æ­îÑû em#Ähì_é	?$°Êù¦4w5òQñö]	-úö{®?>b }¬yl|$üGåuMÙÊX)Ì¶&u^µ{ÿÖ6ÐóòlëÇ&wºs\rÁ	vú@<9µ7ï=}ìvú/jÿòùsplYò|qÖY*¼D¨M¦gL6Åzdc×óÊ.6~n°ká,ZV)-êñ°ÓçiòítAÃ å@LÔ·ÌÛSL8I´÷yL¨ü£Áz{oôvR¨¬ÇÍ9ÐþÅÔ¦ØG=MVÎü½,jN¡v<Û×¬)î·¬n¹1ÖLë¶ÁÄ¬)ò¤J|¹·ök¸èÑÇ zÿ= ÷ôàÕ×BT­¥ý¾%%­·E"[°ÏHí£äNd«°ø¶ùYCqvO©äñèå|ÞS°%ÌØò_O ´{d nùÙ©îý÷'uNe|,³¨µMt?SKuÇøâz= YBO¸Ïñ´'SW>Æcâi/Ò[Ë+qøâ(lýäÙöXÇ=M'ËÀ§1×ql»÷ÔÅÊ%4¥pxÉ=}ó´jTb¯æR÷U÷Ã-Ê-¦º¯y¯ÙÕP(®»Y°ÔËÂ¡f ÖQ£pØÍHØA¢p[¹ÒTÛÿÿC=}Âö»6j»<4¤ãLøÙ7µË wuGwåE×	E¥ ìU>.¨Jó¬ñ÷ìÉÿSñW&ì
Å÷ÐÜ;©chÍNEfðº¾#É¥qðº¶#×[©#ìºÈÔÅð
;©öÿsqN	#]ºôºº©|Ën^F[ÖÃ)ÌÇtmu8í^qûi?×NüqÒ·K(ð/Üñ:ûê ¬^{K¦cü ÏÁ¶1 Diç^*dMdçûUQfäFytG K!»íýól5II¿w
8éµo&VG#¬Ýõ*£Ä¯õ=M³+Äë¥½òílFÍn×,= 1Ø®%Öú¤ÿydðô,þT©Å®1-¾fN$,ú/¾ñ91À#ãýRjuñ+zFßÁ± ?ÒæÝ$wBÚ.ÈóN^ÍJ7%W·¨Ë5¢:ÆæD+{PÒb6,°¤y7¤Ë]=}"K~üýøÁDâñEðbºÖ>BÅÙÙJgr|£îm¾î»¼Ñö=M Òße@[Twêp§ÕþCZ±r©jrAPêt	ÆV©ßÕWr³®ÿµ0 yo-ÏÝ}ºÐüEô¿öÆ=MTú¢JkÐø^4®N|&W¯)=M«ð+7Ù> WÕ5ø_&qjJÌÅüÁìä¬&@++wÞM¬\H [Ñ>¨tK"ÖôÌDú¿Úé~ýB¹W×~W°»J×I±S®1ÉÊÜªT¥¿0zµtì yºº°ç½|£§=}Qd¹ß@mxµ³¸IÇúíõ¦0¡YÑ%W3Ø&LÕÉñ¼î<Í?Ë·PäúÌEðNêw¦ç³åØ±@f¤©¸lpþ;¾j2à²ÁÝ"= ½Ü'ýÓ Í^6Õ¯Ç£ÝÉÞý¥#7³86ÍCAYæý I½(Üã.ßH®8F	ãÌ".sJn9>.§¬cÃR½gZÜdtyaâVºôÖ¦x³?BBFÁ¨Õ½p¥úóBþq[Ç^QNë\(¼qUZõ´{M­µwEËLË sÊ&RýiüM.ýðÙ¶³ÉçÖÍOÌÝÖí<pñ;þ¥¾ËÐnxÊ'(ü ¢ÍjU¶µË¶³ÃSûQG¦óyÍDûvJÍ¬¹ÿþ¾Â9òÐ¶ÕÊ]&HÉ0Éü,þf£Èòï;Âú-/üÛ>6ËÈwz~E½Ü+\KÕ[U:¿Gò¶µAQµ3*4	1mì.¾}[Í6Äzº~ÚBÁ_¶î |Ím*»ó§!¢òúµ
0Ö»Ìmcí;@µNï³Ù3D³ëé¦YøôèµQ|IdtB[zpb.ki
Éñ×amÀùýÞ"xÙØ¸p[9~;,åHËí*ºÄ4'ü¨kdwÊñz
¢)~
DÁõÂ*)ôæØjñÒÞÑã¡8£5= ôp|JÁ½s®¸¶¶Ëuµ}U­¯_ÖX­Þçpë³ÍSh¿]á=  -Ù<¤À\iü£î£î£î£î£r×Ø^»^=}ô\ýÕYO¼ãøÒÀ>±Õ­àÎÔ¼ôHdÍ Q÷Ù<¡³QÿqÎÁ T/ð±o>2ù¨ N¼NdEÑ9¼WøK¼N°n´= Üsµ­; ÌTÏH= ~×àgÝ÷¡È~+t2·/¯H*Nh4¿	§Øwç'oûùÑe=}NÖ(ìÙ ¼MTYgÒÂyÝo6béØìÞ\ØþÝ¿\ð ÏÄêý Ã¥·{\l¾Ùt1¤z:^ºh+Pm³:C±õ²õWÁe¸ÎX ×LO¾7¿ÉnÇí§ÙçR)'ç+1bP¢I$8Õ% í¦)­¢;Í¥¿©i!Éð9òØR:Ä-sbnê¾;Sl§9öiO¹mj±½¤ò·Ø_@ 14n}"T¸µf8ÞÚÊ]4QµÏ	¬ ¸ÌwÙfé@FkÑ Qa*­>­¨NÎ¯Ñß)%{\n¬G;y Ù¶à/>1N1.1c2bSuå¦	%âÓqd-æ*i¤XÙûÄDpÑ?¡´YõØÄ/½müQ§ºærãðWD·A
ÇBçBígDñÛ[(10Õ"= í¦ù-¢]§/ÙR¤dYü
~ûaéÁ'j3í¼R¿(ìÿ?iTÒM.ÿêù#pÂJ¡ÙïêÌ½gåñ7£Êðñ;+¾ñd²èuRÐô½ã[Â^Çí¤ÝÈ"¥ÀwO¹*n82ØsÉv*ýêåÄ#Ò=Mbg!ýí¤é$"r=M	l}@E-À#[zP­k§ògôº§«Ç×í·~È3ú¤0üÂ	)Ç¬YDm q¢ÐÊänQ¶­pIhi&Áß[>ªù§= ¢èónú£½ÞY°UKm<D®ì¶'ÎPÒ°úbP?§;»¼³h/3RXJ(@CqÕÓéÊjR³ø49Äº³Úì/ÉØ[6k»þØ+HÛ:È)·Øõª}.y?¾$& <ËÙ]+KßÕÎÌ³Ð²t0lGÞÄõÊ=Mªq_-Î·gL Xî1oE2Õ³v7T²¹+´zÖÏ¹nL¼NWHN¼§^6ÚÈ-Ô/Ï ÐßÜrô$2êÞ~eWzegM££ fe4>e¸½e¨e¤^eÝeªâ£gê]<×¾\0¬''¸h@óÜ=M[0Ó3v.{<c+0V#Ö#«mutkS¹Fq1çku'a³X¿Ï¿Ù¯¼P#=}Ï;W¢§ì_KAòÃSiif7EÊ©¯â(ÆÆ1cí¡¯QQ{ÒÞJ!à{ÛzÄ§µzXôVôK­Óm~6 TÝy{DV4§0ùGÇY°Õ
µzXÿöKóaÖò1¬ájé =}º&§Èf{8ÕMýÍ22pxl¥A}6Æ«á·ä°Y¤
·ÍÄÔCNf\Ô4jfnBHvm¶gî¬îÇüë_3ÑcCÂáúûIvô=MîþÕ^ç	{êkÍ
Ûõ¹3Â¡wotµÐÞ[ZôÛ~ÀÍxÃÛÞºîÛZÜtÞº×¼2p¬w¿GM?¿m_0ÐÀØº ®xÃí×WÞ_3C >0·rï%U^a©Ý@éùa<¡Í«Â)fwlCRÙÛë®Rù^£p6I³Øý±ÿ8Ò¦Äg¼G8í Ñ¦ÈPÙºÔÏ ØÉÒ°çáyQëçM1wjýõ¡®N²úýbyjQì?§ Ñ±!f|ök¯­}ãxF¨AØü¡Ûã7(7þdÌÑ7%8êf£ºÊ[UäO²òvídöò7Á8Å±òõjT4-°ÆL¿ùm§Ö(î!õÔ±{oÂ<G/2î©yit¹Ì&·Êõ³;¹³½.¼wÿµ= C2£»9Öáß%
¾!15\Ú;§o¨ê¢'ïÈÂo= Â¿Uÿ06§½(0´~ððë·ÿ§«t9Ø;§5iªÌ&wÛ'¾KQ÷OÂvÞoË/È|².°CAÉqÏbOþøÂú­$
>·o¡´[¨²Îó7¥|ÌÜ|jLÞU}g|ñ¦Ð	AxlÉLë+35
f9Ì£SK¿Ü1ªíaÖh×]ïð¶²ØÕÞ.ì;36¶«ðQ?rYv±?Êu¦X¥1æ¨Û¤rxþ¹ÎW¦L!++ëY»Â£É¡´b´Â1}ï	½Q\gïQäõ$2UÿÎDÿÎÿ*f=M¬ü)s.¥=}Ç°ðÿñýö0ÉhOÌåÀ^ôô½ÁGc|ìOr?Ðáz½âqå¬cNcö¢Á5¢JÒZ>áA&QkA6$.-lÒ&FéÀÝûñR9Üâ9Jæwæ#CÀ9­PZ¦»^qdÀÃaè:­G7YÿðS¡£nEFkÔô®»6Î__ßÇü¬&KÙ²òþAwTK\Ù{ï¸_ÄX¹÷{'#¤°þ²ÿ¿û(¹Tª{ábxä¤iÊûn¸mmmàßH¥ýaÏ;	Ý¦/çè°ÙºN¼N¼N§ª ¼OY¸};Ì °d§º\XÕ²óØ=MÜ³_ÍlµvÎS.×æÎn5h)\N,È	²ûM$Tºky*{;{u° ´PÆÔ·Ø³åÈÆÞ¹^lÒ
^ðV¦µfNÞW'¥5%¥·)#K,
¦ÇY;õÒ%ý§= Xàih¶<¤*T¨>r×VnËXòò32 ÎÎËMÌëöï8(ËÍ	kyý@kÈ)òê ¿ÚÓ[>üV?¸°û:;õ=}©j)øQÜ°êÍÉÔáÊY4S Tºb¨®%?o[}fUí3rÌ;¸ZO(ÇY·º)¾9ìpi2:ÞwýnUuØ©?õ64FßrC.6¿þZwÌØØÜn4Ë\î²õ®­Ô0r³Z)è= %[á&îQßZÞH ÐÐ^:üÊý3æ,Ã=M°·nD4?Ä¹rZÐþÄL2xwÿZ?^Àè)i+ÍÐ(HÏD÷ZUßr^¦_>pÌ$6\Ó ¡Ú77ÁY3Ï¾*L  L(N°BèÈ¼ÈÌXæ|	ËÄµ";lDSoJ ¥;æü}2#¡ûg»Ó?sLö&¿bdàåë®ö»ï6O1?]KÚ¾S½:ËW¿bf3­7è®D} xß)DÚs_)r¿Eç³M§ñö¶ëÛÓæ³=MÕ¹Æ­%Û}2­lË½ª)PÑeÌSè³v=}"ª0r?ÈpÏ®3¯E"5I(¯éBû³L]û2ÎªC Ð¦5÷NjU¤zµì¾_çp²=MKÝ(ÑÀ?¯×©ißjMbÕ³cµjæ­±DZ³-Òª½gUtýÜ%nIkµrêÏÒýoe¬Ã(W(vp)dZåÊF/$Ûb®ú:Z= 7R
üîdÈàñÊØðTêÀÇ¶_rèºvbOJ£á<Y
ªO]hU N§çÏÖîhÛÛ´{Bw'[i§)@¨
2øy.r¿&j$)¸([tr$iüþÈ^)øSâÐ¥D¼Ò ¶iqÿAx©^ô&yÜr·ÄúçK'7<×ig}¥4ò¢îÍ­_¼tdqÈ%3ÐVhÃKýØQå¸Þs¬°nI»QÀÁ~¯6--ä¨ï³GyEÎË¯»_= Ë&ÝH²îÊ9Ø]Ü÷³á8¶ÈK½?x©o$Üó»(þmßyì*à·ÊQH{t5ëßÐßØO³_ÞNÚÒÓÓÓ¯>Ð;æ#äÇvúhøJÞw6m&{¤x)rÛ;§Ñ³ëÑ8G²¸mÑØ]ÏDßjùdr+Ï·r]gUúzTîÍÖïþªÄbÛqÒû= ËØ~^yr÷}Rë¯²5';iUçÔl?ê°³DÝýòöq2~¹!»dª¼ÙêJì/XÜ1zúo²üz³² â
ÄrïHé6{w^ú Î¯õ(Ûi(Cgm= çF¾qU!uðØ!¤mÐÐL¨,ÍgÕþ°è)ðü¢|ÒNµÊó?%[¢O%b_îu*r¿³®Åý G¸ëÝP«¦ÌwèêJÞ­âÐyä»nÕ÷Ä½Qr(¾)b×ýR§vI= kt9²¾(0ÈUúâ³"=}0P.«>­)XÂ½CEHN8ðcôVþ"K®¶Ò]ÿÖrÃáØ¯Ä,« ÑÍÃ{µ üÏBÿìÆù;÷¸eÛm´ývu=}a Ë «@=}tÐÌóTNü»ÀzeÛÇµu~PI b= \sÜÜàDÞÐ=}ßÝ'J+?ÔZurë~XÀß#ÛsvòV]úX'M83?x0pEê\Gò$E3l)Þs4­!{ªiÁ|­Óú¦üJPº¯)  c¸ÉvvÜSoÁT÷ÓM%®Éeaß{÷+Þå³HÕ§pÙu¼rgTç³5ÿ×t?Æô
¢á*Ât¹£+îÆ2Ó' Ôëô@WÆ&Ûqâ-kPFsæ¿86ÿ_T!ÒE~PÃÒ·SD[]¡Mw«·Ð·ðRÂ#Éy¥!¨
ê¢þQ:$Û·ÝbzÂ^GÅypÍ«\ßÓ
¡ãhÑÌ$3À§ëÐÔá³x[¼ú,³Ýd:pÖ§
82ØTó0tQ= Ø¦~qôZ§R¦ÝñÛ= P"ß@!ä»Ø¾)XtÀ?¨ÚÝ°«ÀbãàO¾rÔIÎ$Ì4= ó;°T¹beàÐ2á;F YªêÝè)ÞàîEÝAìË/ÛÐ[aËÛ:àü¦ÊàÇÆ<%´ßóÓ8¹¼ jR_úÚåÇ*ÜÄyT,÷BÎ:÷¹°H{+s{¦:k_Yeú"ÛùÎãGó2»"Èq]¤Ì¹¥É¿½b¢iÍî%ì~X6vÔ4iô¢«mª-.0öÝmUå¥."[v¬rgzÑáÏ¢'Mr~)tYõ"WãV£ÐYàêÍà¾ýáü§Ù"eÛVhÞ+Ú §ßI¤ØVánº=MGÙw,q?ÇÛt³à{Ä:sÇ¦XÍòVàI)<Ç\ùà_\ðÛÛõfhïí¬.õ8ÜcXÑºö}M¸àýÚÅ>	ùbUãÑäÓJ/R"ÃbÜ)à;S§ Ö = ð××= ßÌ%Æs¤Û½[ÛÄrõö*À°/á}$]¼ÈeÍã]Û0È_Û¥=}à+FðñÀ8ÝÀ³6ìïIb¶ Óp1ßÔ´WÅPÝÞQúàÒÐóÞ3£àK= û²íê.¤¤µâ
¯;Gº§_Ê²ðqP'4p.^û²ñâÖÔÃT.k3nÕôZîß0¤6á%VB1»O| ýä]&+çþ¬FädÏ/pÎ·\JMßGXË¥Õ}ÐÜ®åNk^Ixië;"Iå_b~4åWk¡G§Èû=M»5³"BWÙø¨$8
ÉükµìÔ
ÙÉÜü	Å¾6ëJÏÇÍ*Â:ÐÃÂ¥&õ%.Üj£Ä=}nÍ_ã¬5&WHÖóqì Kw¡ËVË~Fåã×ÿq#A¢×ªÚåc:;éÝÚ¡â8´pP¾sêeë=  v¡»¾Âzå3·N]6!Á¶¾{ónÌå^Êâ½åm8Ë?ûÀ#Ê)MÓ<ã¼-îpò)¹ ½ô*¢o$xI1é®Ù·RicJp«Z@ë~}mÃíëÌü¸4ÙßP§=MÈÏÛM@ádXË¶w¶#ÌßúDüÆ@ànLOÛúD.U¼Û Z9Ø0ÝÀTÑOªøóÛÛT\zwWóoü~2;ÛÜõÑêäwÁXøÃV=M7i¸H¹­~\ÛÐ]ÿMàÜ¿L9RA5ý8hG.R	aKnÚxã)LPÝ´÷éNS/ xf*Î´o(KÀSV'	ùX­opÛ\É§^±Aþ¨¼eddàV_Ûc£òüÞn2iºÄ@º@wÜ¸'Ã¿rïÖõoY^UÐú[ñÐÆf¹ö¤xÊýõYÐrÏ= õ}]ãnÃ¯Ç)Ú/= Ñ²Éôã¢ÝóõåØtV2;$tÓ¨Uë´~ÂÄÎU´°CÌYë+ö·Î Q÷(ùÌÞ¿	Ëhvý¬,	iî½=}ßql«Æ÷¦æ1	Gú\²ÅpÕºzðY4¹¯°]Îpz4(x¶û  ôÚ¦#º ÔóWÚAI"B¶hÏêþÈQ²egõ­õU( §Çi/µíZýÑûÍÙ-Pðf6:|%·	ÔÎõÝ=MzÉÎp¯VÜRXáfy}}ø ¹Èñ4ê_¼>è-#òE>»8%BÁ®Ãì¼Ý2pÐTõ-ýèüÈÑJlÂH0711«ËÕMáöÕ­&_ïÇUU·à"Â«úã²ÕÒc&	% îÈ®X'èõUTlH1w@¨N0CPL¢TÂn)^ØØD£õW_Oß@0ûôÆbêgMNàÕñ½­#¡7P8Ö~­5=M</@ÛÔÅ9M¾²Éb'Öù¾î¨ÒIÓ¶å%L,+§Ã8ÔÅ?ñQ»\\SC£Onzé ÑytaBÙ×ÉÍ$Y~ÝÉ³JåÄW¹¥¬ÛÃÔ[þ¤îåÇ÷5{^¹eùewt;$èf÷_»Ñia¸Ùµ¯H¶¯ÿ6=}.(!2E¨ÙP>öbsCÐ¼ýX¥l¨4dðìÚIG°p¹,yáÞqK-¯w.U Ut¡oU_XVP	¿I>x·ZnaÇÍ³\y"òp<&#ÑMÒmlå¹N Ò2ÈËË¼kê-mp1_¢èÞ= :q¡5dæ°:QñdEÐÐ*ËæÀ8&¸ÿo9v,!½3ÇSí»1µ|!\Í²~ÑµOØ|°êÅÍ»X6da&ÐE£àê£,6ôUÉaH0 =}§ë±-A
Z« P¯"UXXv¡{FFÕ ©úQ41¥ÿxV/Xôò¹¸Êç¡ë37É3âÞç¾ß	'àl¡´S«SGñ¥]ê¢¨êÍi¸&«sÙ®§ä åW4Ô5t¨êýå§ÜÍ3é=M­½T<ºè)Î1ODÑÄDí31õß:oÚ°9ÔVËdJå·>7|ûg&Uî7Hñ1¶±Ï G¨¨í£ûtµëÒ¨fØxPv«Á]Ñ%?Tíß¥¼ýÀr$!	Cw.è¦;(U½°QÆ^@f£ÖiBgXô­:Â®8¦ulêMþýÃdµ%Dlóéµ:uY ÀüÄ/Ý¦!lýPÅûDg2ïÀÅÙ_:ÏiHÐ= ÑYÔãZ@gwN»¥¤[\\tä+êÍC<ë§ ·@/AV8Ç\ÒR¥²Ît´Æ¬@);A­]ºe¹ËvpVb÷È#÷%ö~ ÄÌêi¿§.îyB's5®"h¯,ËQÚ©*È5×¤lÆ±,Á+Ü]®táÍ¹5ÇÑc!«Dh5õCyÐL(¤¯I ïWGÎE#Á72Øbo÷ßÐ'»bÖ:9ÌÑñ1ÆøKï»Cg¶ï=}T3Cª%ë´»§=}2D¦¯úõëÑ_ÆÃl»í&	=}29Å]ó-üÔº)ÚæüZ¸pzÇòÅ »ñÞéÎK	À {cnµ?®ÃûìUÖ®ùæës(:èü¥UÄ¶Ë!jé= Ý«yþ	]þäÄ£IÍüZ½ëS¾lGSÑ!Ù­
Ü	E0·ªë/X&í°?_*óá@é]	×£-= ?&l¿òë7Ïûà»o£èÂc¤;"©ÍkÑÁ³tõ÷Ì?zákÁÂ­N»¸fÄ¤Ôg1Ië´|Q®ön!ÅüZïfÄóÖ ¿î%bÐ= ´p±¨Nk÷ún§msÑT>ßÝ#²ú½P¤w¼?-B«sîkn7 +P21ßq<öôe¯ÀS±q,bå	Æ;''b][ÞÓwçü°àÑ(øf¥ûÏÿÎQðµ¯*>Òg#YºgkjàßÄ²vdõeà	å&|ÜÝddÓ# = 0¬­9 _«ÞBÌQMMÍÑ¯9Ü¼àO¬×Y¤þäF63'ð_ma±çO¹àÊìÑwWbÄ¢~|öUlµlÊzÁÏ1 ¢<½>c4°ÃÖõXó=}{/ËgEåX{îÏ@¿º®tDÜùÓÌÕ Ô¯%µS
A>ÌXþ¬¨WÖKVÛ|eý5î;éLùô|P7À¸%$5ç«açÖT:©eHoL»31÷ÕlàDn-¹6vßEÞ=MõÊ'¼UªÃÎ= GüÚðÐ2nTL&ìLsü¿i Î®Ûâå® ì[QÄ§Wvn(PÀØæF"è'Þà±Þç=M¼KD{Ã·"Êù|«XÀüA¡<Åæ§B¢vd"hø ±Ä|Ès{ØÁ5'|Ð¸ðj·DW"J¤ 	3³nfÞ?Ü¿¬<pø¾ÿÄ¶¥:$u>±>2kú=}ÑZE·jÇ}k)øÕÁrB4úMDBÔÇÝ!øUÁÒ6ù«°Ýdÿ½;	þH4¦Ý(×ÉQ¾+ 7|?|4û5X[<Lï×àq_l¬mq«*ø5û´Ö£*sU¥H=}þ_ûüðYÍyÆOVCDËð@/ìKÒz6®Ô÷à'b»Ñ´>1ÎiÊÏB8QÄ©³,Õ&XßtÉTÃF½J^'Åi= 2"!®ÐìÑ@ílNûÏ§÷uâ¶«hx¦4õ8±¥Âø%v=MË2ÔwÙ6/àtÃ;Lý+ë}U"(_)îú>c üTÀC]vro{=}>mL]ûLÍ>1CÕrýY­¦~ ñ1kU"VO°àÐ[ÓÉÅJ0¥Ý>1¦bÎ_øÁÏ¦ú^³|Þ&:<,¤_  Ö	¡j¶õØ
/K1ZºíÀBÚ9ÔÙ}»âïFe5ê«c{2 ÇÇÂÿb¤B%ÆæO/ÔÈÃËÚT>»¦Ã*TY¨ÿ¸Ó= 2')ì±9V$l e¹Ga$Êã+rÚ/\Ûî§·o\£ãøÓã¶¼µº¸Wº%EÒÒÌÅôÁ!á{:Odüú{ùùrfGàúW4_«K1ÔÁÿ=}¥¦h$@UÏ¿¡mq":1FÜÌÞÓ¯Ä©NhZàøì}U"F0DÕwÙ×Ýo>X[Ñ4>1·Ùíÿø2CÔáh#¾þÑ­nX½ÉVë àÖÓÎé  ;)
³ævÐZ¸Fû¸¹t	C&ä/&,µ*¼Çê-U:xÿÍàøXëºã>OTÐÖch¯ßUº»= 2')=M¤æèÑ-Lß ÝïXêsUjß
^ðÝ¬ÄÄk ïFe5ïKÔs
LÑtû7Y©ï½sÕÀ	¶¹p;ÄìRØÞÀç§\Ræ¶¤³ d»%}ÀÑJ&è:ïë&ªõ0Ø§0Ì(Oûèõ!òÁü7e M)1sý_:kÎÈøõ¬²ìÀÊ&C_\aËõ¹¢·uãÊ  û[¸ßå5ð,,;ð»f¶ïÊQ2Ê¤á:9^ÿþ¿,j§½A¤/öÙ¤]è¶5¼³§Ä4×{fÔ~ÞÙö¯¢ÂNè²+pñ¾×O]öu[Ð«Ý{¸®â·©'}3=M²»×oÆ,'ÝÂ5x4Ô<|³JvÖH[Ï5uÕD¤¹ Z!¶GÇ¡(®
UDÙ~^ò¦Ý#ç«aXïìZZçLûûÆ¨ ö	ì^6´h.õÀÍneiU´Bù¢Âòþ¼ä£};Ó¤Yä>1ºÙÃJx±´©°S&^ß!ú#±Ç=MEû3©Õ= tãF"{ÌøFT HßÝ4b³úÅ¾Þã(=}ÐE= >Lô=}Sq{à¶ÆÝäÔLÉc;;Ó}dVÌ|Q¡p4	ìÀ9\tl0
|r7j4	Ë¨ÅõP)¬dNì%K16¨VâU;S×HÁ³VÝÜ
&%Ö=M!&ÉÉ¢ÚöU"¦Rº¤¨öN_¸ÍÀ!Ê-|¯:ù<°3iÿnXûUEÀîÒ²&+ [oYkÞ¿¯¾@©'mÀ¬¤bâ¶uã;â Àîê
"= d¶i5X¤ýDPw	ØÜ­ÔÃÐ½,cË#¨¾M@gï TN/í:¼¼>ú<= i +1÷5M
ÝÜ³ÜÏ	yØg®äØ¡unáÖöµ:¶Ñ°P ßr*ø5ÝÝX¾82ðEÖS%
1.~Ð×ÒS+\J÷"òª£3¶ú.sWðKx
L­ðÚæEØ»Iy¼=}þh VtÛ&#5êçvnË$@*}D>Úlâ«aa¨w^ôÌÜÒ(á«c_;÷~"L}Ø^sMàc'ÜMûúêÉ}G¡ÜÎ ;ì[Ï­_îÕÉ¶¦ßøÐPªÚU"öX89ÖÉ$Ærd ÛQæF"FghMääR=M\¥ óu¿ðd­?VâöG68GÒã6dÌYUâfJîÍÊ«mU"@y;WÃ.x¶vsIÒ½½Ù'ÑÛµû8¼S>kUð¡PW*xù²¿|ü(4Nör<Ä-	I³{ºNÙÞdY­ÈÆ5î= Ø×9T/.væ ±y-ÉÏÅàD1ïBéïÃ	o 4íj»ß|ê0Ä©MOÓ,¼-M{)x	I|ésCtÛg°\X #7ÿ8/+äfuX©u_Æ®ÄÞRm ÍC¥æOQª¾xp)zÂnØýzÙÁNh¤äQlxULW~5ÞÂú¼yÙ\tç¢]ñHÊ°çzE¸ócáU,à369°ÔñkÊô× kÕû-xuØà¡G(Ì©CrÎý:.ås|Ï	5Ð[~§e³µzô)Aó³)*ÁlW©eñ5@yBG¬åwürFj°¦PÂü÷¸·ëc=M$m°Ø:g ;:&Nºè·76s&Òó	Ï½fêwÞYá ú¯åi¤õXï aúª¾4òp´Zµ.çKÉ&âþ}CrXìé»«u÷.]á¿éÞêà5õwÐÇa@$Èfªq@¡É¼<§À¿Ä± ¸^Æ®®ð= Ëãc}çßÉO|q'ª*¼¤ç=M%åDë|	FñW,hj¾ut¢
¾ÁË¬àÖ´¶Ô¦ îÜpþáÙ ^= :ñiÍdÎcáçµöYÃ+Þ/=}LÐÔ´ÂE×ºÁÙèûÇ3eJ¡»:8êr»m+Y£¸² 1 k0ÇÊU/ÀoÎNo^¿"¿uî9fÔS ê,.·B#Ôïµ[Ð±·mg ðV)áú~G%8§Ã ·«$%+6zÑû±ÛÃ­.¶àÛqú¢U|érg_ mÉm4¤ýéÿy&, ÄO8C¹Rez:Ä Âr ¹Z¹d4Ó¯¥<[ô2Ö ¹	(jdãp_Ù®;ÝÃÏ3|Sã%¶3d¹¡#³'þ¡×]o0)ø!!É0í£=M©¸à¥fî½ë¶H«mã§ÙTHî´¨{ó¿7#Ì²eÍüpÐñ?åÕöeczî8Ål
1/OB{W7iÄ%5É=M¿OµÃIÒòí=}ÐJéZÊè= ¢Ô¯+DøaÜRî«§høý23Ù©Þïy^htwÓiv¬£¹üko%rt[= Ã§x¤oÅÕ°=Mkêÿ¸±àõ®h\LJ=MH~é/÷°2MY¦SçûoÑUcûK2Y½oÃó^eÀ³õ;k³Þ&p/(Jö»S´iuVS¯ñØØ#DHî³?°©Ã}öiÑÍQÿcJNïëÈM_ ÎÇx@ sÖÏvÇ'¨3ÃÆbø×
%Ä
ÚÒ©ëCÙõZEHþQ& øºCXJ 	Ô½øÖÐú]îXèùt5§gkÐ©zXÓ(Låx ÷Ñ(n%bÿM(<ÅC¼º\mÍR¢I@ªÍe]cÖVñØH4ÛÝo&Õá 
¯¤ËU'Ô
ÊPÍÁ¿"W= Ô¤ººq<ds­sh8«O¿*të¸Þ?eYªUP"8AõóÃ$yÍnÇØÆ­¯»¨Çp$ÔSó¾Jå­º¥*¦G×r l,ø4
»§$çU¯ðÄs|ÖÇ¯9îDHU×,µS p= vÛTÕ:ÖÔ÷÷M]¯­Fâij!´èZ°øëþ¨JÙÓ­KÚó9¥?ÇÛf;Öè]µ
¬8_úÜ¿Ùû®.lùSx»V¡a@GÁz øØúýpÅ¦"Msçrik$°båtÄµPi$Ê»(eü®1{«Ëi4m)%;â06l0ÎÔ¿¦ëÆ!=}4öQ
¦¤Éü)<¿ÂJ¼QÇO2ÆÌ¶K½#5lÉ
(çCGaE³é÷|GÛMÈ ~DÖõ:ÝÔÎ±»[mÜïèúGòj),ø4ÄÑ¸m*ñÃÄõ9&H#¦Ô:1s+2 îª/)¿»üöçãÄ{Òo>£!òÈ/H´¨ÀçÃÞ¼ZÓ.ÁûËÿ½D×Ù×¿A¬¾Wµóüªo±¦lÂëÕ.ñÛ¾IG=}/¢RÅ?í¬&9AÞú
ù-#,·é÷[EÑÕ"C÷3Û}jbå¨ï;Jô¦J,: ÑgÇQU¿SëLrÆZt¡«+íþ®¦7Ãï iU~d}÷þËàc¦Ë¼OÑHÀ¤Iµ?ÆÍE4= e½j=}Výo7ÿÔ£ò+,sÁö2u¶Ï{÷^ÐèjÞ"Õ¾"¿æ$TáÔiîÍí1AQ¸zìÂÃFagSõWXQÚÄZ×ÛèqÍFc¿6ÍYè¾'&ÿKººFp5<[~\Ìç*ÂíãÌ¿ßõÄ¸°§6×
7ÐAd¬=}Ýý{EélÍnùÔÃûçf©æÄÜo~»zm5¡J^$eÑÆÃTõ¨¸Èþ= ç=McY,÷wC=}ËBZgot	Z·©µuó[Ø(L qUhs¼ñ×>nó¹ôÀ£L	Å¦½Aö°îµíKÁÚ¢²´ñIà¢n\Ñ×>©ní÷÷%È7ÿÄBóWÒm.¦²úZll%ù4OéüÌYµQv\LÔqBiq RøSUàlÎÈ@sÅ.æ}öÄÆUåÌcJ{:§ãÖ?wÝ¯W#½üË?&Ö>3ï÷ñÝPlIrÄÊ0­3fÞ÷H¿ÊyýNN «½ûx£>ð_ÇÄ¬Weu_àUe|kÙÔ6âP9-Ñä#}Äx\jÓaÄyPë9§xÏ«-µ= JÅ«|=}DP*ÚÇ¿hFT6íóë{M4÷­jËk}½û©ÁÁ>ýG4þG© ¶S¥¿"Â¢âÕ5Jî	©qíèÓ1:jM÷ÌþÊñ®ÂkýXä :yLý$§m"ZÏÉHpz PÚÝ]èäZz= = c×Õ(ÉyA¿wr¶ N!ußZÉmCJ¿ï÷ýoDºeÍÌ@Ýóväm¹QþEX=}l¦sÐe¬)²R&gb³/¾·Û| ÔªmÛLÒ»TuådGÿ
>¨FÚ2?¿GRE6Ç³µP}d·[¯GÇ=M7 [Ì/=M°£ýåèYà¼ùC}â¥Í F^k p9f¤çøª]jp¡ýñ~¾  ØjÄôô^ÿh¨DZoº×¿Mk¸8L_ýPE®THc3zöÜ-¾ò|×éñG'õj_ÜbØÀs þ+eöÖ.Æºdk>Zoº&2ÍRF]uú{ Îìndj±ýb®:W0º¨ &t2ÙoØ¢õ{ÇÄì¾?)½¤ÄÍ5G?Å/iù
lÌ1X¤ÈV(s5©10§#îrPZ¹ý¨c$M¹Ï'9©%OÉt¿èZhpmPöÇ«Rî·hºryºMP]ªb[øõîhßþÔrH/Ê| Ò<º_ô Þ¶­3>æ´ÒuçÍú£onò9û7AÚ°àÑ kèAcéÐÚ¼CDC¼N¼N¼¿¹Nß'Ø´6ÀKm4 ":S«k4RZsO<5_>GÀ4E¬aT$[GÍR"*}Ö´MRÛ» Ïâ"ÓöX -Õ<;Á2T­[_FìU:®wBìv&ï­_g×ï;MÕU³9YPÓê7 I"mô3R+o³J$¡·t)³J fµ£ãæ»BKÇPÙ´îç¹«Í1JQ[»[xm°ïNQK¿t|ÐÏÉ²ô?í×ù¶4Ø@ê´ûå«7¯[éüg ®/Þ"ºÓèQÝÇ¯ã2ïdF¢Õ{¨ÀäRÎ¾½Â2×W"Ü½æÀ5rZ³q1@*Ø¦XÁA¨Æ&G>é2.ÓÐÄïþW7@Qg?»2Å¬¸@?¯þK;H¥Ø×Qï*³öt7ñýóû÷ÿÒÇr¦ÇQZ]b1w)FSf3ÖäÖàÇ B"åf·Kë
Z<óRÙFwó°KXdéj¸ò0áªwoUüoqLÏñ·³®rg¹ÏÑ­$¹Üäâ2ÌäÄ¿å¢jéìBýelÑñ!ùêòòófiòê&Eiý2+%ÖjÝ@Þ§Ú¡^Ä¸ÛðÝgðÛü ¾àxÞ@é&ºqeqÍ$â2âGs^±Âa	ì[)[AÓsÒñô_Qï= Ö'â`});

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

          const decoderPtr = this._common.allocateTypedArray(1, Uint32Array);
          this._inputPosition = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);
          this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);

          const error = this._common.wasm.mpeg_frame_decoder_create(
            decoderPtr.ptr,
            options.enableGapless ? 1 : 0,
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
        const message = this._getErrorMessage(error);
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
