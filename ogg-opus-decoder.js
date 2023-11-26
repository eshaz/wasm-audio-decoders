(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["ogg-opus-decoder"] = {}, global.Worker));
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01b1ed4f83e2-3÷ÁÞeeägü{7JÅÿ÷w¼7äctýwpÃoñäyº=MB*Z,½|ÐMò±qp"tCì\ðauôudüÅÔwQ#åJ÷ôÍ¹©Ö/jµ·R«®M®ÛGv
ñJ= e>çFÛ][7àlÜÏ±!ÊHU¢É²©Ûép@9J=Mve1cMÖD5Ò(u9¶]wæêWöBÃGIã±UÚ1{â¤_ülµöSÕö­D°åxd®¬0dëx¹¡&é9 qï-Ä§aÐ!±,<XÂ;½Rô@\÷Ho&¬ÿRìÜ!À	ëº	N^:Xs&Û:Q8d7À³MNì2ÈAi \ÓÈB¹ýºª$¿ª]+jÛÁ­ÄÃÉ¸À~Wù/¢,,åÅ7µÛ¼4Òÿ4µ&òëB+ïP\eÁïQÄ£:là=M¨ØÙRmWd×@,¹³ô_ÖÙ ÚègËKeåâegVf7çgeeÒú½ÞgeOGâ¥ñüÀÉ+UVø½îÄ7Oôh¥mèt{åæÕzBaSa5Æì,ji´Ks{t÷"¿=MdRÌ(gì¹P¶åõ³Ê2 ÍïÌâ0Ïs¬S¿­05%GW3,ÛÁSÅÕOÊ§x¸Ðzt§
Â¾sÁc£¼¦p\!ðð÷÷¿åLÔ;#üÿ§
ê¹è¾s>GK	ÛíÊ¸e"ñ¾úM¢,w¨Ì&ÛÈD'ËìÚÚhµÄÆ:3 xRÜì¬³#-= aîØ©"4¸Ë,æs3Ö+6Ùÿ¼RÞ¢>wHª;zìñ¡MM_V¬S×K_­Ü®¥è¥¼ÔxÍ)MÈÔ®|?/Òü¢)åqÜ¢hÃå£¼dï[!±dá}bÃap[µ¶e¸)¼Áþß®;_tÚ4QÇfbÍ^o¬«ñþGv>þÞ]hoñ®Ë¦²¤Ê#äiÁ×ïÃHê¨»¡éCÝ~}]}]]{[ZÃh®ÓÝt¥)¨=}÷(ixf§Í.!m½
æÑhU|$hîÍ¡/ãää4n}§®0mYûz!å®jÓä<ø¢ÙÓæ×³uüÒ[²OìºOHjPnÎ5ÇçÎt®-Ê7w}´0½½T"v9c
¯JÅ,LÄäµh]Ð_]IÍ=}JàÝeþ²§>Ìè¯¦xôçÝ õ= aÛÀÂTÿ¢ù$¦êÛJîÃÜ¼lô]¥²Ýá¦aÿBÅËûéÚÕ°l>à´ Z%øC<FM1=MåÂC¹pó±ÕÃäyÐ=}wl0Ý[Íá Ú°øäã´pt%JßÞ´ûd°m<
~qv¥êÝÏ'E3ò{ÆºDâ°f¡4c¼ÜL
m2_<èàÃ°þmWö\eÕ|ÁFdVT ÜäÐ3á®\tëýf§ f}Wl.?æÌ')·¢WÞÊhðD¿hÐüiøE_%g=}<ÚÉé÷_ä­s|1æÑ	a¾üòÞDú{Þ4ÆD~³ól¿´A,]E_JBjoi{ð$záù$QÚßuD½32¼c¼\/áL¶lBó®ßZf§T1µeÃCâà'DtB>ÑûÈàôÏô&W# ÍKó£ýjÈ!´´G)åÔ±¡ïç.±ËI2Î3ì[-µx)¬xxDÍ|³YtÀ 9oò/2(»¡PW]j¦jÆ7U¸ÈÕjøcN¬p<}>vî¦îJ
<ÙxôçæÌq4¥öÈ0ÀdH/fd/ ìk°Öj±
j}]È2'ú8Þhiq¦¿= »8R¦L½WõþD-.\ÚóñÑâæms;çº_%¿6$|og)Ü vY6Wóuèý}Ú8EJDÝÚZVÎÉªÁÝÎéÚzGå_Ê¬&DÙ	n$JCaÛ¨fï ãµ>´ÃÞËÁÞ§SFp[NÄþ0Z<Ðß·Bt¹Ä@N'ÊäAgZ&¾,q·ý4ªU]ÌýXÔzvß«¦8e!ÔDµÀrã&ö§¥õýxÕÐ*L±BC2	c<,FêtÔWõ¥É¹·eÃö,ÖPÒip²!Ù4nÕ´£WI	f?ñ¿N>VUd­5tÂì]Ï;ò »åÄÉËYOxDÀáV©Á&­¦Ì$ëÍAðn®$h|Ó²vÿØysm hÉþOÿ²]iËüX<ìÏ<_d±}=MZU2|ÖÔ´Ñ4x×½û-G-ÊýÚïÔI:'f£_{¤±%<°ÙUQGy­k÷&¨à%aO¶ñø	ÉðÅêW7É´¿Î)ÚÃ»k,¨ÓÍ{©¥Âd)²JTBÚypQCß$(£þEã°Ãk2zPy7Çæ	õ÷g<+ÐÕ<&7üUöyC¬°}Ø h¶PñX~¾í2îØ= ÿ\÷Í¶Êû¤G}¥l¸Îú?y?OÆÎð)	BSsc¿G~¬(Þ:BdûV)ÁeíKô$ñÇp=Mdz\¬UDG#ÒÀ§ì¥¹&ÌOP¼[s§,èá.+E¥½8·ÐËQhNà¶:Ç?ÍZÈZ
hÍúüa
aÒÌJzµ±:Ô<9ÂW»ç¼ÐêPõÜñj±ÃDós8Ý&7×ájüÉKL_i7bb4fW6Rêæ.eJíI«ähS&k=M<åõÕ4ðÙb2ñW²­½±|eU½xÛ@=}8¿Ða·ûa<gGrRJ·AýQú2³h}ÂPVðûÛ©!.)O§kþCgå©E-Qy¦ïäpÐj¢>à® ê°ïaõi¡Àâ/s ê«@åDd6°üÉ=}OCSg,RDÜÜQ89ôµÈNè¤Ö¶uD}0Þd±6H}dBóÆóÐfqo6CV°{¿°êb§Àr©!å#l¢V>záTw8ã-ÐCÞ
-P
¥XÿôvuíÛYRÛrnÉ¤Fè2óUô÷ösôbå]¸²¦"k^Òkx9<Y½~¦,P§åz&øAëAÝTut-s´'òÇ¶£túY°@Ñ³OImM}ÍfQJùÓ_²é¿-Èñæ*nù\±#Â|F<ZÏI}\%ôfFËxL×)õZæD=MyÉawæ/PËqüÞ=MäÕp7ÖÀý©eA!¢9ïP¼Â£¾ à(Pëº$M¤Ä;ÉG¸s¶º(Ùj%DYãÓ'gfÖ:®êýy3Yè·àÆþLÔ3óüÆüÉj¬Ù5jÚ¶mg©= ÷[ç.xäôÎ×¿2¡ ôãæ~Ûtuï&ÐV mfXú?&ò(CýûK=M¯ÚI'>ØP7·Ï\ïÝebèÙ:UîbýÃ|}Jä,×/_çì	¤^îhølöa= l{/½¢<K¹©Jý±TNa§VRÜ.6.»è¿C~_QIcÙÁü ¦Ókù¤¿¿	ù¨#Hk÷äüåá,÷æ·ä(ÿBoÔaiJYÉ&1¢roÉª?y 1ô®ìF°-lÀ[ü¢È£¬£m;Òå¼ÍÃ£ë*V ÉPòNE¸UÈh¬ù"¼i-ºSÖæ¸ 'OêËÌk'åKPdg-vçÂ)x¬s©7Bõ²òp««×ié M tK·PB´mZë£õq9T}®_Î\úÔkçTª/mx,Ï5tÐ-÷Àé9zÄ;öõ '±A7= Fm_dì­PË¯Ïxè×Þà<ÓVÆÉýR
¯-ÈU«Hðªü®¯_ñïÅN$vØõDôÜuÓ!MR¶{Ö/ÉHò;¸gp¢Â³RÐ¶»	ìrok¶Cd8fþ:bCW¿xE+Z·¹úv½/
MlzØ1¾Pa§yvrJ)äê¨EåÌåëiq«Gùï÷"QqçVþ°Ñ.£­Þqw¶r;Cíµzgm.:+°jkkÛÑ!Í 7w@(wÔï^wWm×Øè£Eì¹=MF%7£ÜÕþ_lsU+ý&à¬ ã?#W_)&vUø0ð/ôÔc~ª¥§ÏÔ1¹,Bð§Ô.î×8)e-Íj7l´¦Átcì@x4ó)ó)½©@õoÝl¤idzev6 AíS-]åö#Îëåp=}Â¨TpÏ¬%r)k>L¤Yvã<~)zuKþðÔ"E½2{^µ¯Ñçñ8¤û÷ì¢Z×¤WQiÁ5eôav¶¹¤æP« ¢Þ1q Ûnm?±çþ§þ= ´/}HRi ÄuÏ2Î=M«(pÁ2F·_È¥ñÐ Ù´Ä^îZ¢çð¦ÀÂL¨¸bAJCûß&wlUDºH(z czi dº!·®iE~± ájaú¡Â,+!ü;hîhÊ5d+%°>®©ª¨óØ®·½@hý¶L.Ó]'ì+;ÆI</á/d±s°n$ÈÆ³|3QP°±¢ðµ¹pTbb<àmi>óø¨ú_L´íè¬µ¬S,¤_b@¤ÉÎ"¨ßúXAxc?9hkÈÎó= UÂV	²NwÆ0Ð§Ð(Er²,#hÀ!ÆÙs=MpÃ«®Mþ¦RA´ÌCäÝFÒEQ¦©·úËìÁ=M("¯	ltÉðûÝ§L9ºUß®½_'ÂV~xjáäØà= ç~ÌÕv!úÀ ­+$µÊq)ñ?ñFcDF!wmBtêD+*(Ä¯gåYðW{æ.*»wúRï­ñKÉÂÂ»¡ Ëøòrñ%WP¹{ÍÊLè4WÔ 1Ú./	,õþÅJ¡¯zO×â4àYãYûºjÅÃ&éKME±zó¿¿ÄCuÉÈ ù$:U¾2ìæÛ¡Ä9|ÛäÝ¾õ÷0<Àêø~ò××0SãäsåÖÙ¥ª|þx°¥®¹pJ¼9\lÈá8mqG´bÀ7h8§FÆGGxñ8Lsà¸>p;m\o²yeèkPÛúHQOqP0pJEUÙðÖ#Fê²YTHþ¥&º$9å I¿î:0ÂQ z÷'ÊGgÜ­³,Ô<oß©î¾£nPÕ4= pÌýoW%¦elÜäxDPnÑë#áñQëÃ;2h=}Ø@ÃouupÉÁHû¤ãÄäQ0Ð(¨ÞþZòÜ!êµiüýÒþW¤Wwb@âÍq|}ÒXøêºµ¦b?GnÝ ó ¾?Oþ¯q.lX½,Ìí|à<å>Ô£E5ß«?VqpÏÓë¤(M|wD·DâùÒ,ÏÉl¯§½ôá|ÝÞñrt,·Cô@>j{.&ò(è¹ãøì×çMU t¯¨9  ®uH,]ÉÔ1)Qô¶Ð¯Õ8Æ$ZÅÑ2iC|ÔöimjàØÓ®ÈTD|nw×U*x¤Ä_NÿÃ«#[%Y¯àÃ»Ö~|Ú¨axø)×fÞ	ñ×åËtw¡ÆôMhòçÀ¥»3§=}&§|ïmÀ¥zÞ¶iÎÒ0T4×ÄeW=}= P-ëá«æwñr(ØàÀß´®ôqÜ!ñ¦'Õ@¸aùSh·ñL¢HGìB$_(ü£(ñi+mÖb%Öô¦¬ì´

Ír)8àãñ²¦ì)ç*À¾Gsd]IÉY4zmâ$yJ Ðµð¬®Pq½=MVHjO'0&{ÆJ(vÖUUl´®£é¼¸íáw?ÔçÏäDÞ:wigR¬uD±¦þ¿³´/¦©2l"®éÝÅx"³b¯­E¢} Õî{[0#1¸MÐÅ=}SL´=}p9: ´LÁ?P_>³VK|7RÏw*©17êJ¤KbåtßÞÓÈË.<È<ßE°3°±ùËà}KÝ@u(Ws ¹êUñr}ædÑ2âìü{ùâKñl°ÕÊj ¬B qÒÎÃNÑ Wòo:a9#ùZÚÜìõvDÅe¬ 4;xÖza1.à¿Ûê/DS&Z-Kcmq»aÎýïïGç¼.à³ìbð°|2[} "AÞjÈw3ÖàÐ³6.ð~*y,iXTlSPK¶w\§×BÈsA$h2õµl2á\6àëÿ" 7·t?@a?ç|=}3\¨Û³IðË¥Õ{G@3W«´¥	"èc[p×ÞñêoEUhÙêQÇG¥ÈmÈÄÎ9Íàd PÔÂÙ°ôí­%)ù§P¿Ï´NÒ½ì{/S´= é|%= #- ¥ËÃØÞÛ|n}Yì**¯vÊ{4$º\1»×·yé$ão,#Ôd,Î/ãN°Þª§úSç¿öìOu51«öÐ=}N= /¹í°NëWo¯ÞÆT¢Èt¥ êaÉ¦V+t~8©[3pvXÀ[?÷lUCG_å|3 Ú;yL+Db±/úçÉµÄá^!_Vfú­öÑZÁÕ=  [Ës3¶¦á§¿<#¥K·¼3(íGÆ&-!¸Ìä@\2AºUì£HV|[¥nÖV îÝ¬êMâ*ó¶~J4 9ÂeVe:#g8M,I§©,¨æè*8Hù ¿³êÒ6(Ö6Ü¥§u:uAv{§-^2¹k/a8Fm:]ÔCÊã¡*7¿9Ósä½$®uZi"çÎ¶i~²*±ºC|ugáÂWª
eq)¯;~$UÂmN$¨ÉlPì8[;?Ü¬Æ9ãßl,e¸0.¡ã¢1 o·=M¡b<'2$ä= Wl½¨ø¨«&!HvÞÏ·
q£"
reûiçê¢·ë?»|Ç]+èËjæù¾Ñ/õ0·Ä/¬Á;µ<®ØÖðÊØgêæô¡d¼¸'èÆ"ä7HTB¡¨K¡ü{×/S¶;èÍUB~íØ°úe&;;®Q¹½Ò4{M÷7eO>nÏH~3«¶üÇxÑCÝ¶=M?ÎöèôÈ×³wµ+CzA@ È	4-$\[ètb¬Û·3Æã¿·¼2@ÑùFëê= Ç&.ã3KmE5Îae&éIÂ(P$Ân,Íâ¸r6hxÛöðÙÞ¢yÏ±wâÍÒ$ïR¢Y\Ç_+À&r¾Dº:Ü­Màbµ¼]ï½uñð&¬3~ùõ@qÃm\
Ç{C3óL{Ï´·= =MÀñú1Õ4%÷ûRUôêiÀzyËÊìsãePÜ§EÅ	Ó7­?#ÞêiÂ9Ï¸vÂP|a¡w;}TR?NscQÁø¡fE¶bqäÍKÑM=M§TñKAQØxþC?»µI1îtWr"zÂ@Ì¥¼D*¸VÖ|Úw= ØZªëËJk÷aFýÔñU<æ¡=}²Õ·ÓKw,ü·Åø;ìFN+ÞP9"6 ñçP£È/èÔFîÑ¥¤^HÑ= Ö144ÔhÆ}DB#
= j©îÜu°¾ÐpÆ$yïmtP&àÃq5Wo âÒù]àIóè_æ^SPÊC!¬µÏM°'U\ó3»Ð\C5H,ÌJÇY¨Aþ-ÃE¿UæCjbü'×ß$J¥FÝ
ò=M±3prLåFÿ]ÁoÇyzÑ+®(Ì®tDF«7ûI>³ûVÐÐ+ªI%0CÆ@Sg*kKGjQÇLjhéÒU#hÊu2{'¡F_Ò1	íW7¯ócKgÊSãÿlr)cÀ×Y¯Kp
äbäÀähÛ{?a'rIpÝã¬Ä4{}M l&X¯¦oØRötR6Û¨~;5:p
ãZ-¥Å)ywÐÁ'{èº\Ýá(°÷úR¶¬åÝ(!6£¨_TÛmgx½õ°06ñÜ~÷+¡wfÙEøòûâX5=}Ê.ï&\ÌmIðWA ¸U$ä±ãµ-çê$À%/9*Ç:P:¥nä/÷¨oÔêë© ¾zèO[W®ùòßãîýo_|+èàü)åyÔÌB¡¨Kåz±l<c¥ìñ jª°îËl©««·×:4/E/r= ÐüîÆÆ²iðä¼rWÛì¬}êfÇ[xVc}L¿Uí6aA.q6¹c\,|½¹UÃ'Bò¬ãÙvÓAöD,Ð9ÌÇ=M hÎ+ßNÎ/ÌÄí²jwÇìm½= 0zæw$ÐïF´»Íï­>ãuÀµK©ÿÇ«ds~1u?úW0uÔªg3ÝüáÐcµ/¤ÞéÊJQÂßjÞ sJÖX·ótùp*­À=}K-i¤+Û>,¨2J0feo««6x/J¬~Åâ= tV@>l'Ól,þKIbv§×öc§³pþFÎ^g5¢b{N/Ve{qÅóWÞ¬ÇzËë¾l|KÎG£SyZbÖÌ}Àí_= Ò{Î@ÜÁ<±íªS¤SW¤ÐÅî
¥.ÉGAÝâÅiÜñ­Ô4íÌ0µ\MíÌ09Ý#rØ¿à·9½ä)e5ìHï¸K#
Ý¹v~Æ'óË*y%©Â\Ü	Cv% Û¨4ûzóÄ/q ÀÕ	ª@µC	×z
(c¯uCìß" w¾_!U,Äuéäkp>?ÛÍíjq¥sgÍÔ¯
ræãâ'AÛÖ¢ÖîBvüññYÊ.GW×¿5t¦FS«sQûÇ¹+uÎDö!sS+u4ÏÒnH2Éi¥¼fVª FÑÍ2[I{brÔ©Â×¡Wzôý4}Ó8À¡zh®ÌlÎØÌ;e@ö
¦ëµà¶%å6£§r)½S·æéP1ìæi
4LÄ!p·æé¤!è\Y³1ÑáÖuw¼1-ðù|kq4b:ÒeU^aL+pFò.rR<lÃÃZn³ìLâî½÷èò°¯ÈtKzéMáþ¿ýrêSª!ãï5t[
aÿ$	åé}LØêÍáê½}Í«Í8O*3ôxítROIé*¿ZjqÒâà"9}b}£bm6u>È s¶xÈÛ<þí¸u,ºGÍÙü;!«³W¼NoQ	#+¤æ*6æê®=M.®%z"aÆG"«J¢åïäÓtOY ÁÇ|êÈNïècîZÚ½@Ò/V¸#v¦Ð=M$ñM^MNÜzË§ÅJË'»ÜÅ'k7NOs6^afÚÝIáº£H]ë
-N¤Àé5¡B1\ÜY«)EÈÛC§¶xðÀV¶kÓ0ÈT¶ý_²¼¦YviáÃg­êNÍ¦PÕ	jëOk[È¹#çtXÁ»$ x^= Åã©T.wÛD;òL;.7Ó¯Ðç«¿J¸£<×$ Ý^çïÅyóñïÆ¯é:½=MðÜLÇÎ0%±¹= j©º³·mi0gÃ«zÙ­pq	ë)aÚ[¸5ÒÓéH5Àþ
,m$µüL¬RÈk«n%Ä0ì=M÷¯lôFp½dþo§OÐoL+¨Í±j0x¼i¬»+[@ðm·¨äfêGOâút>þ½pj°'àË8¥I\[¸ÕÕÀYøXÜ+×5Fêý¿ÐDÔ¿´ið2Üÿñ?©!°.øØÅÙp» 6¯Ré#+pdýÙG¶=}âñ}¡qNºcKdn¥×	èjuÇA7¾ßn.ËÛ§uXª÷&Þo¢-d¹ÂÂ l0®kø}ÅB= %0®TóCp0¹~Ç=M= Ø8r-+ËªyXÌÐTvÎ íP[íüb~V5ë	FÎôþâÁg+è:&p¨SÜ­t,àd~çÚ	<d^B/úÃqïÍÕÇ/ ãru¹Òá<¼qö©uæöuþ¨ âÌH©úØ°óè©ldôyx 'ËqVç ~ìg¡ êYdô&ÙL!ò>A¡©°ü¡8úL[8Á/gëºÔÀÀ6|7¡xôºð­ÉQxg±¶g÷#I¨mrà|áUeîo643E¿= _­qà(<ì7 ·,_BÀ ú²ßãx9Py*úä+ÙÍ;ìÄ£]Ya<],DYnº7æ!s%éQè¡MògcuÝ!	çGtSêy¹8´w!ÉIÍ«Å8O
âÍå8sMALØêUÝ8uívÒã32ã^£Ý¨. ÆX9K¤ßvUÈ¬»'çýO]R(e¤ ^J)ËÇ& W,&JÖîf7^ýÿ¬%úý?aRcTÎÊýB?IËý:¥ÐÏÁrË'!»ÜÅINs6Þa6ÚÝ¿ZqG¯¨ù·mkÎzÉ·RcD=MØ§gÖ á ü%ÿÃDz¤CÒ÷-ìã äÙq@WîûWø½]*_G#"T5ù)aø²<®p,À!ê[Ü m\kk[k\¬&nÕînGZó1yãyIô4Þ}1³i:®kÐ]6¶°Ál§hD©'Ê¢­®(ØÍí¯'md$¡©ítí*Ía®°®/¨ú@×uk,î¨-jÏ2n7ªZÓdl:Öµ¨#%IFPü h&>ª3tÞúö×î!zÌd3Û_Úßàø!pd\'ñ{= ÌGwã­¥´Ý= gjÑËË¥!ÝXKÓ#Ô?Ý¦öjÐº3E?já7I~* Ðx$FüõbÐ d=Mä9ÐR¨µ¸­­rêêédrêð !æéËM¤¤·-säiEqºHð&åcÑ&\-~	¨fÔ	<UÎþR-ºxyaÿJ®49Z!ÊK=}= Iµ'e[MN£õÌ
ÈÊAÿã¤U.a)¨Tt9·óCºèuÔó|»PÑÁ(Î_îÊnëEýßºRmº0ºHª]özÞY~~·ÿè¢á_«TõlLD<)ÎËùÐ\ãÇ¥bÿf} dNQ*Ì#_÷V],Åü$d
iH5µÓ¦óµTó¾1>áQîõh,×ó,@¿ú¨3x¬7Êr¡4¦È\®ý²>$&À¥¿ð9v}í2héî/§hP,ò»ì4+¦=Mnø¬ýÕP.¶,mlÀÕåád¡YX(n¼Ò!ô= ¤'ÏÆ¢iêãGÿT[îYCÐ7dûüVÖúó®î]O
.§aïY6ìb¦IP¢ôÄë50©àÞpåx0ºOö­:efìSÉP4½ mVÚ'QPRmHd¼_?	6þ31¸Ð®*/dç8&.#º²Pq~ÎPÔ#AÓh'³h;îjX"JÀ %v6ûâeQHö÷r Ñ"çós¶bHAeùx¶õ%×Ó ça¶øEOrÝÕ¼Ýºt6ø¸Âù¼m²°?@M?<#eEÃä%TJ{Òüôó¡ÊOQ2nûÒ»,Ãè´HßJ#~ sª)Áç¿dB@À²Hò%ùªÜ¶ð¨Rì{KZÒÕï×Qp;9LÓëò¤Ñ¹nµ­(Ñ¥j	×mØÈzZÍV%O-ÝêÄÕ4¤Ú oð¸6É<R$\T|PôEòúÙ ?!äkY6¾ß1.ö§3µ¥uâHo=M(ÎÆðûÄÈ^Ú·LwîtG÷f»ð:äF±%Lh"2ð?[w|¿¯>äs	Df;­/oìË(wXÑ®ÐcTzõ×´³¹CÑ~îH
y»räÚSÿÙø.Y¢d"j2÷ZçôÚùR´ÍÑ±ôX,ÅkÊ;	z9yÙtNÉS;LKïØeç!¼²³=}Û-[´$±Õ¤swGmZï>+¥zL±nÓ_wf|9ð_ßËÁòñ$] Cæ9ªðH>ûÅô§¢
w¸)]4öëY"^§Vói>k ­
[YíÌþ{Ô=M§¯ô9«\;«ÇT	îÖÿ¤rV<aUó.¸@ÀÚ_º¤²­>{©½Í¸uá~Æé28Çô!C0Ü1ð.ÁoHÍ'ÍÒ= YY9Ø	(£k,ûÍòL½)ûñÜ[\²Uéwé¦zQ¦350i6õãs _bæÚk=}Mî{.óK|ìS@öä®IóÀ©shi Æ´E?³ùÔäÝ@aÃb&­É@Ï>vÚ}q¿îMmÊõ¿e
²¾ö.lÏßpêªUL~aïSU89ú.Qê¹ÛnÉhv¡óq9±ÍÉúÓ	$Oàú÷@yBßùH0ÜfóÜº_tµx<tÞ}åBÎG¸ÊÍ7øT#puYù¾=MKù®"³;F
Ë¥ÖB¥aÇûÙQÊ¦-¬éà)ùÔú<ZòC^ÿZOcûÿÏPÌjïÖÄ7&P³.UãqQu%?ÝÁÎ¶õ$±Rü¬öQ^1mbíØzÞGïààÅG»yWIÆWÆðq¼R2¿NÎ)%ï* ¦o®h©¬sH j¦N\+y»#B ö§X[hßX
¾Yh69½£æ§2BçóK]ª{8Þò= 8õ£ÌX²
Û;ÐuÞ­tw@KîÚ³Dmyæo^Æ0Euä_å&VhíÝN{Û»þ#t95TPKi=}²Èk^Aîþ7 
#ÔôÏ ²}ãÉÏ*ISW_ýY<ÏQ¤j½ÿëöWÿ¼_éQAËoÃ>¤ó
7@[þñêð|]Î3±cçkSvòvç=MJBVÛîÓ#jý¤6qÐÀiîò	ôoVÌ×
Bâ|ëS,Æ!æ"Häý6B­_N8¡ëáhU¤c^êB^éÑ ¤*¦gF~´ïN]½ãÕñÊV^ã4õÛÁÛÝ}lv@Væ[_}(~*|	d}zÎè5	:ò_ÄjeÆãäÀv í(Á³v<S¥GXÖº¨c,"½Z= 5dQ9Ê÷AAdý$~=MÇ	Þ»sçI¿
1óæVõü<L8öÍìHàcIg9,³l&Í<O+³ðÐ_ìã:4$©~âàNZéÚ­07+XÞ*_$É·B-¿;f.èXx£:Ù¦XhÞìÚÍÆ:åMÅåÅ­UTÌþøÌ|áJâýxü»½u%ÞàW&ÚvUòÓ*Å|ËÌ¤¼hëD§yÉl´¹æã%Ö9[.ÞìtcÐJý¾ÝÓ¿!á8ÇÄ´ÄrÛ!:ÔgÆ#S×+uUÕwÄ½3´¼Ô= SNÏl'+mL'ëw¸%>ÿ ¤9= ÖÖ úXæÂ_äÖ£M_Xé«@­V@òmÙ/á;csÜd	³|ÍdÉÐV	­Ù¹®E¥¯ÐØtÏ£ù4z|z	ÐËúØD[eA5Ýjm P7<pQûg?8öDð#=}(Éèê{=M= öx=MÇ#õìÆ°£ô¸ÝðÎ.Õù'ÐíÅdLQÝ«8«0Z +é¯A½dU2r= úy ×ôpO§Éèz/âÛ= WnkOÔUÀ®6ú&}ÕCÞÍ}Ì Ù?«ñ«¹awçI2¶ðúJ¥ãüQo÷bÛ¼ÞV7@.oVÑÌ¤dÇ©èÅ04 ³ãÿâëÑIRCÌÄÕi¬âtN´=MÇ%b
o,{èø !ÏÑ¡¯BàbÔA¢ûã+MõIæ F_a	÷s±öÝüâÀUÌhé]1ÐHE@9Ï[1P}ê/Üq52ukë÷YáMEiÓIåäÞ	@¾kë¥Í^¢Ð#åQ°^§ãçÌG+¼ÇÈ¯¦9
P·¤ûÎCÚØ×<_ñîû /qY:£ë}«ò7Ör6³{=M 6PÈ c+Nñ+ejý§lL½%pzØt+¹2dú<@N)R/uÿÔ ÌÔåMõ¯òÛJ®¹n]HEg+À¸ºö%ãÈ¾l-U2	I§Ân9÷acÅíÔi;z}JýUj(9û÷ÆkÊ¡NªuÞ=}îý/J= êÿ:,©¦¡3
èT£!÷öÙ:¤YÝUqdÎ<Ètb&âd#²ÁB5×»üÕº¸ï8{è£½È|jR^ë;Y?ùð#ßZ,Më?ùÂiÎ|-Æ<©[u.o²ï]l*§MÓW=My½*M^ '½=M"U<¶Jqn­Å*ªóªm­<Ô!sê»ÝÌ²äovLÖOçÕgýln¨fPn¼~ë³[RiØÝôp ¬(©ÄÖÉ%GC£Ëb1Ë/@êOi¨¯ð,È¼fÎzÄÖ¸ã®«5]ÐQhðÓàI=}m/lmÙ®¦¿7Õ¾mn®¦ÿÄeøp<vìO¡®¤yM¡G¸4§¿ã¥ì§ß,µ]ØhQe«õ¦ò,ìù¢ù¦'ì
î \ÿßgu¨Øê$ÒÑ&¬ ©ÄîÈ?p.9rm\|= ñ]vÆâ´l¿Û.×â<fvÑ°LAùç¯WYmG×TÓÜ ACÃuÏê.ÈUµe£B.Í«jÆdtc~°A×yÄõôµZ¤9êÈõÉ«[nÿåi°V²jìêìÃ¼¸z :ÃÅÎ¸é-R÷Ù´ZçOµª:ÉWÜbk±Úó\(uèWá0ò¼¿à,¤~èf®ïÕí:Ïr ¹[,úÒaåï/Zô¢HÇËñ.
bs¢F;Ð<4ã: ïi"Êá§}å&Ð÷z?¹Êz7Uæa¦-&nÖ'ÊWuqs¶ýC\= O;Xs×T§Zmîó¹MDìD¬büµ³¸ÖÀ9iz$Ç[l-ü[ºº#Mx$0æÀÇø
U[ÓfYwË¡Ò«)jX·NÉ%£çÞÐ §p¨kp¥Dåü:)CícTáHíêf£·fm7OPÝX= Cº;-«»¢wÿÌïÌ>&v¶{ØÄOVS»ð[¸}]W¾[TòºDéÁ£@1P8FU®µ^d¹½	{õÒHÜN»:Å#ùÒ cY»¨ºïÍoë­-xp¨q<þ¨K)ª£g¨êÔpÐôÊøÞE©´,½± æµp ÔM:ihÔ¿r9ì2éÃª;,ÈiÄ=}ì:é>8=}[­eY¡¸ñ³¿84"ó«]?'§ÿÃ'àV;_|Ø§ÿkÊ¬¿k»×Û]%2vó\OêrÄâµíÌ¹gsÓµNj²'ÐùÇÌcv3å´84qis·ãºÐ×T8*ÜÝyó= vsss U= *ÁÈwÞ=}'ijÄ§\ãw¹ùX|DltK;.4ÉÏ,ø§¡xp²½ÐÝxÜkõJL[[NÁ['k7&uê¦fç#$ªãúÃI&WÎ@)¨ùÈx(ÖAíÈÐ5Ò8f£2sÖH¦ÒÒyÏ|cQ*¨-_ôèIï{¾¿jÖ= Ó¹/ÆÈ%û åàZb$Áq¤¤qPìÐ1Rm3QË¿£v,¨»,¨Þ{#
®E=Mé£/Î*p?m(^yq,/N(6)oìcómVA(]ÚJÐ.j¡_^H¼ ÛÆ.j¹ìP7ÈPðêoN±.= nNnÄr hÄ¤îÏr¢9´o" ÷Í3LÏiøt¶à-,/S6_à)Çjõ'#~ìõ(w¬$5rÎØnPñÓ 4ÂGØóUôÖ1ëºYÍÿUônÿ·Ù¸ Ë¡í¸©óW|u¢Â-µ+T÷ï3µêÂi>2Y¸qÀÆ6[bK¾£
:Âü¥¿Ä#´'vGgcÌÈô^aå×ª£abÈÎ Í·»Þ*1û5Åÿ·zÓ÷o ì½×!eÅ·{ùT xp²ÖËÅ1¦þ&£3Gø_~]
´FÈ]fi HùÛ½ÀNHºAéð:<VdñÝø¿
}ì?½º2©Í¨E½-Q¿HS![
¬=}q¢wÊÕ¹(NPkdñØuÒ²(!®sÏ¤;á¥ªûh|G5)</%ÍfÍxÞ=MÎagèpúEºÃ®ÍÜ òÙtÏ$V,)-â:3PAÎvÎ»´! +A«6Îèx¼$i3æµ]Ý¢?Ö_gÊò$gñyúð"¹½IØ1öÓ**>iIØÞi:£wý3Óû;½|]o¶	ÚÓZÆ*ù
Ò&iÙân"¶STS+ÞXàÑLa«¡XTl¦ùz[õóì9ÿÐX¢ô9á{!ù$5ÅØ5BËMGôÝQuqiÝrÒFS%óÊzTD¢!²h ÐxÆ;%2ÎAo©«ëÃVõ&uäZþºHq§Y=}}ÞbÕ¾¯0tmÝ1ÐÁ©ûÆÂ¹Sö¿UýÄo LkÕ*«¨7?@¨Üïíý\ß?Ö $GqäñËym­<IEz$ÌgRîqWüædÄØrÁ¦)~ùaæ¹9Cõôð_óö'AÙ,%óäRôÞKõF¶;P'ä¢kÌóYÖßh^DR&cb|ÞvPruÇJV+³RBN?·-ë³Yý+j=M3Ø¶ú[´FMº¡"ì¼¡]STA%ê=MÙýÒâ= çª	·=M:@LLÏtàß¶=M(àÀ²$U¾ïFuÂü­~¦õåÊåómj]Çûeü\sã0|Òla^q70Ó#Céýytw~ã+ÖH½ï^cs­E©aH@ Z¨*ÿëìgïöÄ¸]P].¼D# j~n
ªôàÏ÷Zã)©Ï¤Q?öÁsVË;M¾Aÿ
ôTÿAôXeÙ¤¹²ýç^aÐ(A]saý?Ãdº¨¥Îü|}+Ð_,0SàÜmîÎ¸¼ø-Í¦_uÃÊ«Äh$*(´DQ+ t@öaº¬M!üÍ];ÚBlÔÉ»^B}-ú¼PÙÝÇÐfb1¦¯á-­ph@ìÉïÿË­gûÄàë9ú®ïrXú!:
¦É¢[ïðÀ=}å"pøÎ
i,{= ­ß~·$*óÎ×ÇNÚÞv= 8inÇÅû5Ï%ã±Òm.løRWÏ÷y«þ´7FèåX:Ý©VCB&ËåM?ð¸-¬EøË²)0_Áåþ^ÊNñ»fpa|m«ÄH ù3Q+qíþØ·Xû= »M
!ÿ
LÖ¡Ò´pÔË_?íQ"^é	hy	Ð]jFT]pZ_+^0b.MuUÉ²åÔbáµQ= ?×óßþGÎË=}Ì.?Ùô¥øûvh^|;ïáó4sJyÿVcJÚdKé=M/4øëíghï¬M\o§"·_«UÞ[Y+ká]ÄÀ	×<þvf1=}³ýaþÎ°:ÇÓ¦.Çl'¦¿µA
.ÉM"iÇ¿Y*\FôPÖ[äJ¼¬wÏGª1LM4m¨\#£Î>;+x¹>ú¸ichÑcÜY¬RJÔg]÷Ëè=MEcÕ$n­Ük­÷àÝk¶$zU÷àLT¶à¸HÄ¬ô!ÍS±ÍÌýl¸pÃ¯{¸êÑ±:_kHW¿*²¶Oág¸H¸­#uçX6¾HjvÕ{øÖºCØ\±(®ãËc@@o¥x^Mië4ØÖ¾Éäú%åÖ?ckÌ4iÍZ ©áüÿbP½Õ¦n	¶î[ÅÙcaÉ#e+¾ø~N¨è&5iÛ¨Ë¯÷¾àÁîhIõ@D¶}_¢F[mùäÌÐ"(÷Ç÷ÅôFÔx½õé+=}5]+ù.>Ò$ºª¹nþb×eý] f	$ ,sOE^À?YÞ Å±¨1»¥îCËâui+}V´Çèø.
ëò´nø|æ'Ønë\èlbôä4µ:»Ea@U{¢êPª3^óålÕÄ:÷9òV¥3Å¤ºß/ZÈ>Î®á.Ôçaï<Ìxäë_§¬óëCÚ¾ØQuûÙù[W8pRwý2 {Ûûí¹ÏúÔ£Ô8¥6;ûÌ$_ÓñtÆ¡^Kùh|Â$}"õHÍ2±]$ÂÈéôäJaõöèÛ|y÷Ï£>ÛÓ&f}Èa}M¯²|OaÕ éÀïÒî½_ÄÓ.ÓÛã³ÆwÊ=M.=}Ji(~·î_aÕr(vÃzÿÜÃt·Åø´.X·þÔÕYl¨ÝLä$£ê @WÉélÉÀ
(çýþÐ= À"-¨dT+Ð´BfA9= Gxgm´'i§ÏË¯y@uÿ|Ü%ð¦éÐÿûã	2þmñ×¸ÛÓÿ#ëùSãö ¤S>\óNð¿%iVÓÕ,·[°U­óÍ¼H¤ÁNÆ:Ð?/xãÓ´B¾4w±ØAK¼ñöÆ<«|M­8­òÃh KÜ´ºCÅS[vù ÞáMhñ7$ó¨W@U|Mfâ_	@z<Þñ±fn¾ó§üûÐvBÛðxkÌÔCln)ÏþÈ\¤JµÞJÔG¾±TU=MsÅªárUCV#)'D ¼+6¥F5ÏSq&G¸5rCgAö«e /ñ{ë92Ýõðäh¾û"A/¸KQN©¥zA5 gv^ä ñZ>¦NYÂ B!= âÉ§þ¸Þ¶hÊýe= _!VÒf{RªY"ù6ß°³ ÓÞv-2WÞt>{C
*¼Øï?µ=}±&²7wÏE£$üð¹8u^Õ×°#ýù>Òà?vxTXSWy¿â¶;ZÞ|¥
  ~~!ûáË«QTE«¢wq#_:Ë*ïQ4·ÅÜü^¥Ä\NæÆéÎGï0|ZR&=}ÔÍdQ_ÏØf.x]éóLgx{'/ÂÕcÅÔoò(
z:¨~¤XëyíM|Õ/
=M>ßJØNO¯ç Ï  oî¿%ÎÎ á¾#= x>=Mí9Ný3oþGÚv6¿cvÁ´E^kÇb^«ÏLkÆ		Åás#½Ú= fngç^?HjO}ZÃ/ýgßOxþªËÊ;%©}&gÔ4éµòÑ#Fç5Ú÷(&è%H«Ë M2v²å´ÔöLÃ6¡©Î©t 6ÆsPt6;¡°Í®,]l!ªÉ½[^.-Ä@¡Ã°,3v­uìÅ­?Ï5RY·$.­÷)Qá
a¼Úh\é³<Ë¢@{ì¦´/ÒËìN´¹nÏ¬ïüOYÏáá_o{ÐToôä &ØPlQ¥v 8hþ=M*h&Õ÷zkHZ[bõw£ÁrÖhQÚhÀff÷ÏxÊjÇçt< _è£VÄo¯¬¬m¼RF¬÷þqX[i=}L!P+)oI-Ä· þÿ¬Úøe¸ø@BjÄK½24§TÃ{ûÝ\ZÜ£ uÚvÚ?Ô¹Ç´À"Á*½Õg]Cþ¥?Üj,ìÊÎd
ÁAÜrTºÓ&è1#a÷6	ÚïT¦×Ë<E¾©ÜæØ$zÀtñÇ ~®G2j\ýãFÓaÀ-«jÖ¯ÉöqîM IF¨¬÷Æ8ÐXIÎ=}Î§±&B@ðÒÛáþaÉÃc¤^Vq©cõeMn± v= w7_&Îäsãú#WèK?8åÃ;\õ}ïSì#kÿøÀþÌÌÈÆ= êxæÄqÓøy&§K:¬$OÐ@2À(kª¾¶F|®§ÇëféÈNl'b¡ÿÌøAëº2ù¤<y+p,y%Ú*´__­Bt{BNùì¥¡î$]Ïc¦£"L_¼Ý¼Ô×òð°j3»@+aÇ9ß>t~ÐÍæã0¦Åå¼5À¢è+l0vÒ¦ùNÑ&EHHîÑ=MÆ_M>öû¦ó~éwS¨>[ÌvzJöµ­IÐÊ]lSÒÞ¦Ý0So>C°ô¿5á;WÿF·ÜaâØé:ØñêðÞgY¾ÆJS®_eõl+5JN*[ÿHåoÄ¥^¬ªÚ\IÐ«Yù"AVaE°D=M?²´¥ Î0³øè·râö5e®ÀPççb0BL»C/ßî½#ücíÄPsv=Mv!Åë[:MJ2wcU6ûß(¨ÜfYwùnREÿÅ±O¨¨Ö=MIæÈ6rD¹ÿÛøÉÁHÚþ¾¢È"_ÑYyéåSD
õ\;1êð.æÄ¹kbB>RÌåÚ_0®7ÎÐeaï^Å©1ÅO¤Yb¿QK°®uÎé©¢ùj¸x^Äl@NÍízcx ÔDr6Ñõöè* øPÀ*ÏO÷1ÿØß3N8Ó;ÁÃNËð¹ûà$ðé©á§r3¾¢çNx¯¦
a¤ÙP¡yB~G7è4*0jPµEã Á[w° l¨uLÀ¯¿£Åv\ ·ð÷bw\%>TRÜ£ç¹ÊðD!o>ÙSða\,u»Ù¦1ú´ä©4:¦¸Á|ÖÝï)GOöÒAvü*oRyqIv$È×Ê{[:{ÎvªAÞë·6÷ytï6_ÀêµôC©±¾¼r¡×MøÝWaîÙbn¸pI­>ÑªñÚ&^*é\ì=}FÍ¦·_le7VÜá(nCmÜxûGÛ	áüTnk¦af>£bÔÀi)¤$9Ì7ÙÉeMZ¦'Ñ7oÍ
g/A\Ô¿D>rWgj>ð@xE³è¦¤,F©ÍGì@Ëõ°SKX-TáÀ AnÍÇ¤mguO¸mºëuî¬Ì§Ú!
I  À1&Í,È3ÌïÜí\Ç!m.T;£Ï!ó²Ø=MñÇºÜ×M<1nñÚ¹Ð)ødë-Ë&Y¯Å\i¨ÙíR¸ËK©"¢P«ÅôÍ= 2¯µÖR^ÏÒõÓ´AM°ùz|b'9lGÜÌe»§O[øÙÑFÍþ»Ë5ÌBh¯S³ò&N =M¸³D¥>Ïÿ««3¢çËÞ5|O96}«=MQ¢6«·Ò"gLoò}5qeýÛgeúh©cAïTû'¢;,Ú=M= ,ÿl¸2nÇÎßnòtp£BnÕEÞÄúxÛï¢Âktþ'4ÞbE'¼ï+y1ì07mT7¹n,ÇËGõ
è,÷
BEKÙD+Mð ch£²õÑXôuºûÙzJÜ]Zì-ÄoæüÝW¸û³íµNñq 2EJë_uÆcflòß´t±¶í¹\´µÅ2ÁÖëÂ(Èþ[}-\¹H=}øÑ¡·uù!·¾øYwÅáA%,= (:½gi¨|Ù7~6Õ	çæüLB[Ý¸QÈkh©v|qkÍf¬ñØÛõ-¥§ïÁ{¤iDÈrUÎq*Yí³¨ÔÈSsTd.	âè4&ygS7@÷Q¡9A|';¢(®m	½ad­]­ÐËý,ãÌYëÃèYh!Âk¡×íæ¹sàéë/kûÈì%ÀÀHX´ZÒÇySYur¡ô-Åø Ø©PV@úÞèQv[ÓÍÆ/¸Ã>
|õ'o+¯]ÆØc_ÇãïgA-¤1Q2m¤F
ü'o«-,ÍV]~®(-átéVÔ3Cm^ÔðãÉÄ¬ËêõøtåG"{HØHnT¥ZúF±ÝWI_¥G)rë]WSÕå:ÅGÑ>È^ÞT½%/iÖ?½¿(ìß?QBêËã³ä*ãDÿOénÁB³o§¢öå<hKÅQüuñéøéøã¿!ÎsP7dkðü~qßzfà¼|Ï)UØJO7ãÐ~·æ(mmAYihhÝÜÚ²otÕîËâec§Ïè+_3¦pÑ
AÃq¬÷<¼:»¥êÓJÂÈ¾2ìâº{êÎgÅ5= ÍäÞÑ)É:1úä²wë±3ÞþcÑûÔ\­Ålÿìº®é Ë@òV'®EÇfü­f!JMÏ! S-T÷e¨Z£kQüÖ©IQ£_>$:°*ú$v'Ç|ILv¨ðÅhDXTä¢øqÕ7öíeH¢;DCÐ°¯= ¢ÈQ«x*¯f<cën¨8°_p÷IÈòktÖâÙðYÎðzUÜ[D§UÌÊD¬,ÄXÞ©?ã0* &«=MF°&§MµSëU«4ËÔUEÁý ÃùÓ_Î_|îvíùGc# ðK¶"¹G,ÝfAå'ú¡ò$Yu@P°¾KÔÒ¦×)ý²Í Yl{àFdBþ#¼ ôm6	F_CIÿÎ[À¨Ø¯ÔµÏPëïwOsòãÎH9£x7Ôj¹*­ [ç'xLL>!Sb\T$mAlÂ*0¹¢Ù0x+³±]Ïâ´^~fòVPÙ¼ú¨Àá1Ãæ<
NcY]$ØÙwTþZd= S%N®G(Àh4/,WdÀØÕ(à£S-,_d/Èò¹=}¿_d "N®y&§
ìSR»hß =MÌX©çÅ¨vËÍÅçV{wÞÅ/»S|%^ÔÀ@]ÿgLû±xtì¾¿0;lþeÕ	sÍH"AÕ¶ª>÷´×À¶R¼Â0ëÎwZQ+ìÇ¬eµÄYÏ~ZÏ2ee @@ñ¦uZO=Mù¦ÓÈ\øKeàQ+xZ«Që[u³)¨­6K5nR)í;ñ-oÐÈøv=M­$è·ï&ËÇ:ÏÌÇê6ð'ÐAE9!ÄÓíy ù,ýb(r¥BÑ]&KñvÈl"/×+7 z¤Ý°|&d×~?>=M¤H%£ØÏpéqµ²ã8§#ufw4¾99ÚäþaR&v"ì	úÀ7"¶ªt¨ÏJG¼áëx¼¿ÉTBQÉÚe:3ÀÑ_Z]ûFmùîð'åQRìµøüh|A­!	+OÄ.Oo }ËðåëM>$ÍÏ6Ó,¤ÆKÓ: = ±Éý2!ÇÇº^n
_K	µ]¸Kk¯¦ ìcMn¦	Ó4·oe+§ßn?O°{ë³¦=MÆIAÌ\¨TN>Þ*Ï¶ý}"{PDIU*Jx¸[ÅÐU¯4:1äbækÉ£wÄÂÓ¿ç*Y òÎÛVWÄ·zÚÈ¿ÇRÐò[Iy 
}v-w_R¶na}È¦zô8;yêøù|ðÝLx£ÑÐÿúùÌê	6±@Õm}ñhXCQyp¨FçÏ2Ó
u ôÔõàN·µõX}½:Ùv¬emÚZ=}bS$Éé&XRI!æÀ q)M5¹|G¼	bzEÿ
}»øþ¿&*Qe}Rþí%d½Ê,6Oÿ¤Îïcù1ÊCí¡:æÀEø¸µËóÓU)wÓíJEè:¥ZDþ= »fô6Uõ*¼TüRãVÆý,âw^)7ÄmÍ¶ÅÇä^Cv4$86þ6³CjBÊ¸ç¹µNPm©Ù^Äªþ ¬ÁñjB$oÉ«ì@¢LmÅ´°üüó­óÑ{°Ñ©C6i¯ó=MónÆÅ-e ¶Î­ÁùN[NàùÌ.ùø!ÅµÌT5ÄåY$³@¦Ýt~\z7èMc}Æðd£ÌùûõT²V=MÑ÷­ús!4°?7I~æiMåí"ã/#È&ùQLWy8qk¥àAL\ýõ ·»»îé6ÏþZE¾¢¨¸^·ñò%*[E ¶\XØØ¥À®éG¼5þ)N£Fà/	²xqÀ P ¶Iô
Ù®ÐpgÚMÿFn]¬ó­À­dY²AÁÜußN±ÁÀ0­ý¤K?Ëak	VÈr[ËÅãg×jzCØE6¾f¨~'+èIû;5ù;¹T1æ8ÂXânRNËJYuØ´¼¼ø«{FíÅpfØNíþíû#jáâääjVªp+U¸égßjFwæ¹#:â.,ßÄ+ªE®YE²o¢8wÐâUVRÖ­ï×bgC¨Cq6[ÒµP¸ÊUIxà@ãpXWÓÈÿë:*8úÐ/5 (õôK= ¯·Ë1:b_«¹×(]imá -®àhØ^¿ÐjrP¾,Y¨oð^7î<i>$ÇÊ«ª£.b1iõLÆ«®sÝHsXî´:ó²m¹· º_îá8TÍ®ÌíÑeÔÌ2+,°È[¨C§ã%à'ï¨ ¯!ð/®%tªkP)n3ð¯3ÒL¨ÒÒ]¼MÔÿ%t,±_£¨RU!l¢ó" 0oïg30j°+kÏ+à®¬úÙn)3ÐTÅ_ÎHç5aÛ6&û÷]3ë\ß»EÃòKónxmªªgÝ;Þ»?>HOõ¤|ÀÉH¹>1½VçÞ«"é±£ÑïüsÝbÃäX]Y@ÔúºhÚãÉí´Ëøí2TÏq°Hp9DÄ·öÄñð°Ã"m«&°ÞK³·äÁÌý"I1çsêöW°\£Ü í¸}±Æþæy¥©Ñê1}9Âf«ÊkÏ&ÀïÖ!ÁvRäò[±ÁüÞA³Í,cNX7¢UYÍúÏÉù	¤âZHÔTi²ckJ¤Á=M(jipËúS:r1Ë­âq{´1Î¢)ÆÄÞâõ°Ûma
×ôeNÒâucfÈÊSnyÁë\F;?TU2ÂdcoÐò@Þ[dÉö3
"= ña,HòØÛ¤I ÞlÇñj^{ÿÇÜÐâ-©äYÙ'¼ÇÃ¥ÛT¬:Ë¯9ù2òbô*õZþEAÇÍZ§6ù"êoFü8ë/EwÙ8Ð_X\	zxÒ
È¹·0äV¨z²ñªjÕBJ³cnÐr±ÞÕÉ5¹ÄQfhX{^AñèiZy¦2×wK=MÛ| _G5cÞ~:*ÞÂ^o¦Jø"/ÚM^ÿ5DQ	Ý¶ê²xM)ozÿ Ý¤ÂÎÿhC'Zï9³ÕßYn<%Ë fUmf1{{CI¦)
 ¡\å$@Wàâë©©ZÛÇxwA,l;ÖCÄOXp¥©çÿ+ÆZ·âë³ðÄ!üúà#ô¤DÜ=M½Ùßdó5rå}¯É¯¥¢´´f*|.mdcoN3À¾¼´;t{"ï¸<¡4Ç& düøþÈêW|+ýSÎ§îkmH2ó9©Â8=}iéíõÐ½p­fAÄ	Xö¼½íR¦OÑexÖ%Õµdº5¶äÃmööOó|¦#ÎænÀÿÞ#î#"!;â>jZ§rd}_Îc|-Alál3bâì¿¤ó¼½.ÇTºß^Õ«5oÚ¶ êJÛ	= où ¨¤Ò¢Ü3f4~H_ûúKJìbI$ÓÞ:^6êÂulê]æ´bItP¥M&A°cÍlÈPÈfÀ¾­Î"înØoV¦¢ñ<-»ßc0Ñ;­±h= NNk2 i@ÐWoO¤dâ*¼Äµ§;hXÄÞ!	]Ûåg]>©ÚJzÍ@Y5î:fCF'Cf°?1Og¿¦F6úW©ÌNi°%$?Ì+-ÀOËÈ1vá^aÄ6Á®aq×ùLÃîì^a¿Wåç½ï=}­Æ\p6ë0ç^V:Õpð¤"/¯J v+à} Ìz[«/¨SÑ![»ôãï¿À¡á]zjd^
WMh¿P#G ÀC5f$vÍæÏgowä1T¢]«l÷&QçýòG¦¼ê"²Ã^´J4;±DÎÝ7HÊ±Æë¬7Fç(eI±]cAàH=}÷	3aÕ5ºÞ×Å³Çº¸[¦2'r¾åónÌà_§ÈRÆ¾3~â§Ü/·!Î Lçf5£@/7®¿v3](AaDNNÝ'Ãk Å1È
íëVSx«Ób^cøaT{ÒËêXpZQPÅ"wþ£CûÀ;Lp#ù¼/»!©b7¡ù>úµ*^l^Ý¶ÈO´h²o¡pt²òn´º=}G^&Æ=MÜL:ý¬Æäüãã¶" ¯s6ê>Q#],ÇÛ8ÅÉôgÂ"W IBQ¼áx@x"+×*¦ó4HÚ= ÇÆ' ¯= Ññä©Û¤|ÿ(ÃQrlÞ%DDT¶«×ååü$Ãs/½Pdx_ùZÄ¿aËÝ'NëôVë»ü
õ>µË.ñÅ£µõM}'[ç«w4¢YOòì 0DÉHì""¹d_ÌMÛ	èñQþ±PiÓ¢×q&QZaCPU¬Ìÿo¼ [k(~ð¯Ðh}cUtè¦h/ß¦×m©ÍAèZø¡dÍ=}b èBà7Ñ?»Ù#P²%±áãµ hÃ49§ÑJ",Êã¶4?ÂhH"ÖÉh2¢û"Aþª#¶¾Ú©±[L>Ä
(BåôÒâ]Üÿ¿êkNÔjíøCÉß¼ÖdÝµ	«c;
>b+/'¬}ÙÏV=MyãG
GÝ|ÆùÓÌj1åÆòë|ö6}K¤Íi§+!FO
òü 0î=MÃòl¢¡í.)Ìztk®R %ÌrÕ:FË{VäÞNÒ¦"Þæ ]VG²méËvù¶ìAðÎ3úõ=MÞe®B	ÔÅ:ÐSHÒË{ÀÎÕÄ>¤öùÝóßó»ÎbbÛÇþ&ã-Wyk¨¶¤]B\Ö{Àâ#¼»+êÎGbÐ\ë	,ÏÏsT{¢¢|¢«J® \a[X«ÜvÍø2MNøÈíhòÏ8=}?Ð¥"ajÒssÓ¾ÓUÒÌüDy9®7éRÑ	ch4]HØ?õoÏ£àHUÅáíÝ¬"0Í¤®WéØ6öÑ;Qj¨l0ÉÐð vtÝÂN·ëvÏ£U<au²(y$vSR¨£$n"çç²$«¦9øIà)=}û²FZ¯>Í$é3\ Ôï +?ø¾1ÐÂémæÍ6(	&z]Â+c¾xÿ .Ü q8@U«xÊÇ¬I	ýÜìdð~MA=M¶ü#µÿß÷c4]áÍN^¨T}i Pë²Mi°.JÄQ,d0²!L·²~Êoëßï¸çµxË¨îçªãä tbþ¦ûónÍ°IÂÕ&Ý^>²½.·ªDèùZhÌì¡Ig)ï= QNëÔYÊ¨ÜtYZ×uòMOOxZ"
ûÁ1Ü	)7W#FæC=M²qæ²¿É$j 8s­&V¾n»18üXøsçÙæs5^ëgJ¡ 'gÎc\ò<Î)rìÉ«²q'AÈ×{m»ì}mf?LÙñboEyÃgøUTIÚHBÜ}ñgÈznN	lµ joPð¦Åçñ>´ÛQÚ·µ	´ßgMZ~]^$X7£:è	S7endÚþbºðUÑêbð!aK¦gè¤² ´&g_Õ åwzmÞS wvòä)çL²íNÛ¢*4mq6U2ºðuh»âÌ{´°F­·nO8h¸^á¹^w#·^
¼Å/Íd³´M¥jË³¾èÑ®,Ó"Î,¼uÿ19¾@ñ«}ï¨²r¿)dþÍiØOÎ¸?{K/X´7Îø~9Ä'¦³Æ¥¥µêGRHF|*à|lµnWÎ§1nC±d?'J¨ïË= ºa+Ðn¿a\òÌµ²Pâè«%¦Âb±¡×½ºô°Ì_TlR_bpaÔ'Tn·OôÉütoÀý"A=M¸/t¶ñ¯#ìõá¨ï\]÷gÙd*ÎE¿-1q8+l6«Û²,èp3f¿í&V2¿ÒóYå^//Eg@Í²Z|÷;-EÎÜ"¶»¶?Eü7=MßÊÀ+
ÚðZ&©å½<æàmè!x©eÆé6IlÖ¨¡!¾ Yk_Þ*aëg¦»üãçJ·ßþiÉ|eo½»(ß¯R2 i$ ¯$Ü¨K¶	o~ÙÊCð4P|
îKn¥ú§á©1¿sìÑ÷À"Úö¦¼ðá¼pWüjzóÖÓÌ}íàMøq Î" adv¹lYÁ'@Oxz­òË±otc'|"8»Ýç\ÿÔõwæëegIMwJÌ¤¿Ó2MvPGeÑõ>cÂø= bÌ]5·ï¿cTÃjîÂMÌ÷9ëVTËu&/	(IÐnÊ«á +¢cYéÄÔî=}ÕÚ¢ø[Rö+ÓAÀvlFÛ4PD*O[(BL¢Ç»_üû×¿GÅÈõÍÝ:"«úÒû4&ÍO[,AëÁµKÍ± û1ád­û¥Aü2o*A±qóH@\ã/Õ3UÈ42®´kcZýl¾1Ýz@w ÏUO¢©_&r	!Ã= pÐÿ±ùßIwÒ+ýöt_A×dßs¯qÐv>pÍ
@*¦^ÀèikÄN&*]ÒagÕëwçÈF2¦<!ùV-z»vËCWM¼Ób½0 Ä'GÓ\oÝhTWÆSñL=MËxÏÏªò	VÏÃú¯<ÅÂ£w /UCÞö~üÂA%ULaJ4
a¢uqSÛÝâ>!¦¨Uf)ÐºúíÃ= ?Aº¬=}Ì
xaPÒë¢âØ¹ïòdÈ¾é$AíÿÆv= *\QÕ	öãÈW)E])= /âZ¡Þ[)÷3$fùP9Éb9B	u	#>ÞôxãA{®ÿñwEm(\ß Hôh¥³²lõøYâûãP1ö= ËSö'++)¼']ü	BºÔ´8ëOÄÿê96ólÛö1¦	C{Ç{±ÚÖ×*{ã47v;Sß"N¤PBM$c4ºë¢?ö+¥8-Õù°¢ó$}æ¶CÀJhÇã PPêQãzÖï~xê{è¼_l»iÛGÍÌkÚHøÐWÉëØ%Ø9úXä= ×jè8hè¨§lhûxÚl5ÐZ"«|	ë§ç|ZìÚátá¾W½uüâ¿gå JË:ïùcÃá¯äßó~kP+H1ÿáðBû"°ýJ©ý)IÕTó ä6/¯Úãì÷&Ìú=M +Ç6$ÿÈÂÓÏm0Á ú[ÖÐ¦v2$?î	Ä,}DkÝ;D¢h®c©ÐM,§ôFG´Ü¥¥8{â¹ÐÐg­øOjc= ZoÀ¸T&ï¯= °éîï«>s	Ùè"_E'ñ»Át­¸jK@ÓÿÐ^jxfÑ xyë:G6Ù})ü¿¿3lµA·x±bq0i3_i&XðÞ<=}:PJ<4NKÔ²´Ðß\yÖ$Éî»!&TÀeyÉÒÞoÚ=MX©¾VáÎðôJÓYd°¹3:ït,S= ¯ùî4 ¤R(zÝÏVoË¶³m©8¸mÎorÖ£ô>Ïõ>.?Ëùô[ºfIyêõ»·°ö"nIÖa;v¶&96ªÃz'Di4ÓÓþ­Õ©uÀNj,²D½ð{ö¸ÑÈiiYÕyü¹eÓl;¦<µ|¹áv®çª= ¦X b= gÖ=M]\ízoamyXåæÁ¶,+*á9-÷Õ/}(NsM),òjvGºD_ÚàcéãBJÐ½ O¯ºh·>duùMçzÂîë>êÆÃìú(ÄÈu³J#¢6>©ãY@!¬;5×ojÓb)Üê _ÁgþñC@:	êÊÒ0B¯	/W°\Ü½Ô~ýDÃ÷XlØ+q½î¹c°ÜFTº^zçJLtl-EBQÙ~GóÕqñn:Q+u\¨ %#­lçrêÓ>¯ª$= µØ^¹ÍF~7¢NDÐïø×kUi&¢¨2¼Þ¾KÒ¼¢f<O Z¤Ê¯+M7ÈÇOq#çó£^4÷ëK²dèÌ<[&osLpH7Ø:OÆyUDéÑó¸ì2^ þÁDôã@. Ôxø;8Åp@aä}ÌÆ}ï0¿%JRcìô]¢X*êSÊèT¾ù*7m½ìbô0ÉÙ0.Cpø©$D+~²­²Éî"®bû§êúpÈ^ÃÎ°R Ikô°(= =}0¼£#É
¹óÆÔRÅKõf÷¡TÄ/ï¯kãÀÚÖ¥CRº²¥>j3ç1d;Ì5±Ý"Q¬:{×r!9UbÆhÄ?P= Õþ­¬]$_ÊÀ=}gwü \òóÖÏ\ðÑTò*Ñ£ü?©²éx4Xq¹ßóXª×´ãT=Mi]ceN¬v
õÂ%Ö}'
dÿ	d²PCép5XðþË3Ö#d«	hY{5êåm^øB@6×ÒØ¦xV$ïý3Pï2¿xµkUºEÚ²ôxÆ(¢|}±#Ûçd3{TvÅ®§ª²8KÈý¢l5eð>=M³jØÖ£´?®NÒÈ:]i<EÆ7FíÊ= Ca
bJÓ¦Ç@5¿äË_ñ®jÀË#Â^Ï *DL@mùeoÒ+­Ò[´Ö£Âàà!Á×ÍßDêDó0ç\[Mê­C­¯3Ü­¯M¶pðÃpàJÏ	zéôC*iVè{¬nÜ+ÝéSHK-Ï}T<×kð@Jø= åí+Ïn¬Òi¢Ä¤ø4°X0­ ï7"yµ3X×dªíFÉÔnSb³Ìôð®¿@gkfCWôPÜ¾!áKöopS%Ø»OPÀ¼?ßÓL(P¾Þ¸Ify3]8l/ èý	Í[!ê0Ê³{ÿ¨ª[¿Çå·}W5=}{+DX
Pk¶Î/¿Þ/_\+­Í^ã/õþø[îkZ\3ÐçìïHô/§|­L­Ô/§Ì­]­]¬ªÚ\´qQé5PÛ×YAFDr"qÚ¨ºwküY®¾VÅýw&µÏmÏé1Ø;Ix)=M@rÔµ¨í)åü#ií½÷!|4Hú]A"¼½Éldymº=M"$__ë+n²sÁeH¶¹¾;¤Â²þ,<)¢òÕ÷¸î= ÿy\ÊÝ·
ÕWc°Ñ#È¸äÇBtè;qÔìºB[¨/¸îGÎÞ4âª ±±4G©ë	¹Y6¨!ød÷Ôõò<ÝSÂ¾>9uHL¶1W(ï{ÄcÛ¼Lzw7|Y»\¶÷HMD^Â.]s(ÐÝgÐ¤òåígL»F´P*4?ÀKÙØ/o¶¤EhÎ;<ôÙv<åÃÙ¼#.k ól>gjÀÌ¿|ßÉÉÑaê<~ÕåI)Ü01üÌÈ2½öxþ$(²GPÌ¨gÁ$¥9#µf= ?ïqV<B>§_¶]Â¶ÃN_Õbê/;ê(*å|<jfwðû9>ð¤|ñî7dP n*÷ü¯Â¿v>±9bà"úôÍ.ëzÇMpÄGØ­$MH9Óæ=UÐP8ÎÇÜ°¯äþ9âvî/@rU(²×q4å<þ\ã"NõFq= :I×e"9t»P©¿sr&zoÖwZP@F=MØ|ï9ÀÑpPÍèÒÙ¢ä{ç:øÕÃêäÛ= AÀ º9|geî#ðÀ­§¶pnÐà3¢[(Q02öSN/r{ûY.Ûi9¬<Úy @Ìæ¯«õùup°+6=}Ü¼©Vâ;îGhY¯ÚÑè¾ïùGl°ÄC=}  àqõ}Ñ +ÙáÑMý7r¹nÇ$êÚ .JàLå»ÉD
ý­1x´ ®ÕÂê0)NË^Vÿ¢íXjRóø¤e²¶º(~<³¤b1G¿íD)M$üÌÀ­Îj= ¶W2I*&X	4õ[:Àd·®°À¢¢IµV/µxJÒ£NDkÖ;$ÄtX­®= ^y:õPæÞf©æ$­Bâoè÷àÒùkw=MuâæÄî ÞgÎZ4±5ääÜ;9kÜÖÊoà= !!ó3+vÌ÷@Jâ!­¨8dÁÿ
¤¢°pú= neßDV÷}v}È¯åÃÕcÅ60w*BaSûÖeàsé¢«ÊR¡ì³³=}gEøÞSÏ¬qhø/C¦²Í-=}kú¾ülhµ,"ü?t]	Ô>æ¤= J!_,\mëx_iâG:)ªI<%¡@>ðjÜtîxâ-¬åÌê	Â÷z4ÞQÏb³¡nJò*ÒÄIÊ·úÄ¸V^ðæ°hØäÍàÃáRúE*-Ì±ð¢ÊÇ± ÐAYVb<U+¯ÝÆñL%¼ò0ìU\èµ9q( å)K¿màKáöSëðÿÙSy+úóå(õäçöÂ³ÃA6A³m,ód1À¡Ê×tüöçÖcüUyÎPy+J¯uþÙÈßUà»êòLPÃVÛÚàrÓPÿQ= ÃÜÃ0§)y:È:> ºbýHjõgÞr^ìø'¨Ç}:UyÎ/¾3/UX70û°äÞ· C/ðÐ+/Þ\åçNWLÇ/4mùÀ¤¦Õó\Æ\7Õâ_æ×û¤d= ìÊ·Ú},-È²ëgÍ3àe*Ý=}Ç¶¤$QëñÅ¿8n³Ç{³ö=}(|XØ¡ÉÖ»MX×ôÜ%h]Kvd¿þBÚºxXÀ>­¹)úþB[ÌTXÌÂ	ÃfÂvçqÚV
®+éË l´ÂÃÀ©äD.½©ÇA(éa=MJ8â?T&[«Ó­ÙÑ·Ç7{wbxbÇøº°aT{Üu\ÊÙ¨óÜR ¥*³Ài=M*jà´Éb(TØµ/]È&%Ø%Øÿÿh×OãHPÍÙÈ6ì,?|*[®Òg>â:m¥ÛwÕÓ;ÐõC}_¤÷yl~Ü­'GkW×§xÞÂz{úif;NuL@ õûb2AùÚ}kM >Gé*f*étu&g¤Ï{ÑµD{b´³/0=Mír
ºÞfj+mNs½í!õËÌÂÊèÈñDÐZ¨ÙPL0ÇýDrÛV{¸Xü= ¡ "wTWkwé¼8-:jçøz¼ÜJÝ'ìÎ.~g)¶¼ô8£»ï8­âÒb
áe-Nc÷ygjÉ-ÿ|YÇ÷x¤Dª¢íU¯Q¹Ý"aªßïNr¿¨ârlt¦Í
r¦(8ìø©¿g°Ø0'¸ÜÎå0ç'¸"aÀ¢°¿gvÐÎ@4®ê¯ÍÎtr¯å0¿ ¿gÐ&l4(a¨¡yHêì©$%(á$a8ª$f4nFð(¿'yrÏl4
Ø5éPè3úÎ]ú$¥Li½´ÅëìuÁ'ÊQãDÌ¾Á\õk£<¥=M7Íû	zsÏÇË*Åüõ=MîMÉ&áz«?tòËQ9 ÅððgÝ±:´l³U¿ÆÑ(1#1O´]»(1>²GÍ°_±NÁq´ùÍ6'6&êÔ@ íÀmèØL´nÜñ±(»Aëq^l³¿!%1O´ÍÆQ ±»a±8(¶¹ì¿AÞ¡'gqMhä|'¿*lÄ)ìÛÔ0¨B°îHå¡pw®8à0V>«À=MY0­÷®èY0¨V>«(Y0V>«ø°ðù_°0	yvÃÈCaÌCÇäô0uÑÊ¬kZ©CT{ÇGÈUvóe?÷^¦>¾q¥e5ÄfoQù¡E¥°33ðJ+É¹Ã»Æ~QWv(öÁ2'Úð¬ÎT[ £|M#[>ûá9EúÎÑm¦Då ®+¯ÔÚPX=}d3o5:=}l'ó¬¦c)PXAðVV/ãIúé÷Ù4v¤"E"ºLáOÊ	vs&gn?ù¿²rëRV=}9q±dì5?%å$w[ïàS¶Ì5>©§S:öèw¢üNVdeX}	ë,²u_+ì;®@Å<­_¤;Eg°$Ì~Lz¥Á^êrÁ¥²$¢Ìaiv¨ r2êMi3Ì¶¥Îà¯9¨[aá¡½U9
Þû½3_U ,­¸iÛiÒLÕ¦ìñº0ºªÙ¬¨Ä°Q*ÈQ~\: p¥¯N,x T¬Ó\ÍY<GöË°¡Å 2¡È°Ò	«Fµ¹Öý.ù#èºSã/x4ÅîMÃQøÍ8Gõð8ºo°\¡°r\= l6Úw¾ò&«XKõT³¾1eÑw-MTUtëÆGycÏµ£¸åp®d¡Q)CèbhÐÄÉÓN¯j?$Z cdT/ëdn¬M ÅÎòz¸ºG ¡àÁÞ°éè­¼È.AÚBa+sÚ0§rS½ö¢Á7ØNTPÌíÖ´2ÀÏv&AMAÎ)øÚ¬±HHÅ)[R\õ96¨ñ¢-ÃØ [¦&å?í¡BKF¢tÒr@ê-§zl'NnÜöê')VyKJó ®qîê1þ Vjn×í sÖl©Ý-XÖ'´ÂnØ¸Õ}KùkÓ|b@.ÌxW9òÜ£HîëÔøÃñV]èÜ5|ÍïÉCæLL2V/-ø= ÿQûV,2v5®³|YÛó?oJÈìãóss·ÙOÄOø5Æv´slØÝPÇ¢Í	ÿðtäcoÆO¶
G VÙ{R?43$Be BCò?HUxõ]
úSM¨¼LsëëIÀ¦±áýüîpôýHÞVnn «bíáå0qÆ7ÍÏéýQuó¤ÁV¸4}·{2&Ê£¢ÿu= )fÛß÷%+Y+È#
]v{ÿùY¬´ÀfÓóò+·åA?Öpð¡¿DZ¬Y4¦z£=MYa â»e²u
u_EÎ¥Sàë£L:w=MiÐáÎ£fÖ ~ÇÈ$-Lf_6 èi]å.pÿ¨c£<Wºs¹qA+é?ÊÎT³?l_$é^}½ËAoôy[rdÛóÎlòÃ@÷\¦ÑßdãôÎFjµu;MäL~§Ã¼iÙÊç/=}oæh+ï/õ¸Q/-Ê![~D!_ÃÜ2wØw) [¡Çbö{¶a+ùBþ
« ¢PÃM{Ö¢p@|cóëÇÆÃZ/§= øV=}oçwÊ9RÞ~cCy¡>Úqð8¶ª3QxÊØô¿<QÒ®éß ·
Ý,þ¹¿P<V¾GF~vÆÊfz¨°£-ê¯(w9}>!_H"ÞTG|®±n ¿>=}É8J÷,mÃj"qBM^_ÊÔÐzb¢VÂ¾áñªQ%}«}¹~o®]!ìCJ[ID½Æãu Èµï¾%ÖßY·yé²©lÇ~c
?ñÃ?[¹ n£çõ+þ¿Ò&e5Z2PÇâc£¿5j<DbRê¦X7û)7tèÊgW5ÔðZ%h©ZF)À^¾j2<­©0^$ê6âX&2= as¸bý-Bö!»Â4ôËy¹¸MQ¶AqÔì±*nz$©%9&¢Êéë¯
ãò1úÚ#T¸íJ¶À»%Ò´°%.æÇbÞ¼ÙÆc}-m â=}Ýó¹5rfdzK	^Yúv­½íj]¶MÐZÃGM®!¾Ä] t
Ð²Æ×,òîÅ$fTõÎ
Ya9tòè ®©÷ï!>0oWÿ¸âæ=M¶^A¶"¦¼ç8ûÃh¼Í¶§|k-µûCS=MsÔÙÆ³fhÖñ\IôNãïJÅÍ³Xãªf]N%Fçä/IþÎøÅ«=}Ãÿ=}Ä6Fýêz#Ð½¾xÆ"d=MåÓ:¦3Á vî®5}¨ÛÁ;|@Ú}:k?¬eÇÛ»õâ<²/	S+õP= (­*Q×<$4B@óBÇÞ5]ªqÁæ']W[wö÷Éw=}yPr£édÐIC[fHëÅTDjËKK¿T<Ñ¹¯Ý²0»ùY¡X¤¢üêÓ|Ô­7öe¾íÑØÅåZ·¥6Ä|ý °º]c; 0wè¶TUö¦	M [¾åûu¶Çöô°Ç¹t´Yª0}w°ÒtÕghÚÎw	Y­»î>Â@n³SC¡ÏûÖ~èú®71g²«a°7C
öùyµqdÊeQ_&ïÛK	Îh½ûê5£©Ù½9Ú,÷Z&\C79M®áJSÄí8IëûÑ	q(riT/øD÷èzòÿÉì´Rx![9Ñv6ªÕ= G ªÍÌÕg8ÂT=MÅE|þ¸Æ^Óu^æ"» ;*Å»+oWG0eÔ0'('|Oï(ÖGÙR¼8¿àvùÆG¼ÅT¯å;oþ¼&ÛÙ´ÓY¡|,öý86 ÓB¢jÙÚ¾Ð%%öIyçE_¿¾þVáe·ÓW6
§ü±eµVsè¾ÏØ·MÆæ= ¡eÕvç¿ßíRk?¢§= ÷Ã@xöÕk" .>Êh×:Ñeýýö= ýê"¨=MÂ= è-$´9Ä@>(ugÂç ÔI>a­Ó%ÄRLùÈ´n¡9 c¼Ç+ír%Ä.ªJÒ= D¸cÓ~e=}i°ÎÓÄnà	_Ò>ÓX^Ê»Åü þeQÇÊòÚá+RÏ[õYã 	÷Ó±ÚnævQóVcªsÆ¬ä©g½g¥ÎµZ¢¤ë6ù	ü1Ãqô= õ×¿@òÿÍÙ÷JÞuûHáN!^UæC*ëRÍë5Ývfß·¯»jÜªlQKyî­ÚÝÚ°ôéi¦HyOJÓ7ái?E¸è<Ð.çk[æ¯¼*¢§OÖöpÎÀ+NelÅfkìM®ä©0.°¦° ï$¤8^Å-M= þ7?süO= õ:pÍ0j®Ö5rº ¬|©vøâµ²39A¯_= u92DOÌ°°û5½pÍ0Ú0F§Üú£vÈoI/ï0åÜÉá²KÄ¶Õ:BÑ±):ÂRöu= ep­w¹R;0àÔÝúoªÜÜ<ªÈo©ª;+1f%V âã×
¨d½eÆ|/°ÒÏÄ¾qá1pP7}¬NâPggg^åÜ ¢°®H	¼3Rà§×3­,Òç¢+8y2_²= 1ÍbhÅPKÈèÍ±¸âÈÌÂ>
OÑëÄ¯©á"ÞI¶¼á»[Äõ:[¹dÑµwÉbÅ(cQZz¡Ñ¥y6bA» ¡Éÿ3ü! £½Þ^Æºpïiø±ºY1²´oøÇôÈóìþÆíÅs0?}.»	9Õòºpr|iÏ 9Ó÷CÐÙÏ$:2°¾Î)àÉ5q´³=MI@÷°/»CQÐÍ³ìÁ:uô³¯l¿8-4z2Äxô -wÌÆotÒiÂÝ·Dªg]²= ößd /»Èüéhäÿz17¢ÒfÃLgÊnØ{ ø7+Â"Ê¬ClL ¡áb,ß±s­R_­ R(óÀ6ß»ÄKËÛ¹®UVT<._ÇçæP³¦ç3Mã*þB_iÑààÖ¼C~Aûùÿ:4uÔóÏ¶3x¶î¹E¶§Ü(óÂÃ¼)ÕÁ¹K¡H¡Ï!ú×Ã$7XÓYßËº±xÂ¯´oÐ]=}gy,X ú¦ý!!jMz?'On>LæC
ÝÿßÚ)WñáØCÜ þD,ê¦#Ïè|¯Aà|?äðá¾â6IÉøÊT=}ð½ì½n½"·H¯2/8/CoDïÐXH¶+À«d.R#SÿÛq À¨= Kçml7ÊÃs2íaËïm+#Æ¤W?Ê\\÷fÛØv5ÆCÑÒPÒïÈ j¡È~!Ê±ÃñY:ÈbqµêsPÊ 'öÚà8ºÛÈ¼8°õc	jÁTZnV3Ë:rµrÔ¹?dúæhT÷ä¸ø&d[å{ôó¤±oøGw¢ÅppEWíºÛa7Ô¯Ë®2Åû4n=}	wJ:×­fêÝGæÿ×Ïè¹¬#1£';ÅÕpQTªòªmAI;#aåÁqéx|íª)¸ö*+¤%ÜùG;XyÒöºSÚL=MÏâcV=MlD×RãúQÚsiDk*¹P]/Yhm4:^ÌuÃNLî»NKºQiÕ¡¶N3)±pg»iÙd_0OIÊÉËb¸ZFGËl'ña´acDåï¶rÂ´	ýõ=M'öûo$8*¬n(OO$ªP$¤È¿¦á=M¡fzXo«6Á©®]Ü*O¼èMl¬èøhãv^kÇ<çXNj
6õÖ]ª6To|r[ÇOgIáù¢t¨K739i]CPæ¥ÞîS'NÝ^äIç,§46¨­{Jd%RS£÷ÄÜ?=MY]â'¥
m\7:^{øû\¦¶äÈì=M­i
w$ªgTôç!Lå×©}@&SUcî-§VH+×Ï|×/__h+>×ßòüè\ªü/_}¤è­áz"ýsëæ¥Xj~!¡-ö<Oþõ{Ìð®_ î¦_]\ K+=}~=M³Gl­k¯w¥C¬fðÌýPD%c¦= Äõw,¯Ùöcá¦Â.µzËÒe1¤TzöÝèÑwÙ"8v¸Ë¶¿U³«Æ:*](:éô2ï\µ<wºi¹AâÃÛÉgaPëÞþà VÔ@³*Ã9=ujõéDÕÏ6øÃ¥ö>&:ÉÖûîv3ïzM;yTõÎ)Ä1Ês?Áagceaâ´°ÔCNy¶¿¬Î²ð9iþêU²&¹eø9ÂÀ×ÏpÆ±*¹!Â Rx?!S»Ú0Ã¡48T¨Å¡l0NÑ¹q¾eÅ¡¦è²= ÝçÍ¥äëPvqÆ©o´y9Ì}KØD­ñÝru#æóúYÂe{Ö
'³Iú}àõòõf5~k{ï|MÂCR\åÜª1¤Î¦½­«èzÙÓÉí´õÌ¯ßFQjÐú¤B÷µAøð{@´GXõÝò3À´[:ö}1IÒÑÌÁÝèGðjÐÁ 5}úÔ´ËRß´hµsæ»º±Î=}²øö'rZôGaÄ¨¹ÜFÅS3ÝÓèB Gky¶%ÂæQñ÷ÇriÅ¦º}¾¼¿%Jì~wEú-Äôéú¶êå§Vpl\no«Ü°(Ó.¨WÄ*åV5ðO&ÓØ­JäG©ºÈßòÏkXÍÈò
zL¡þQ5,¤XLÆª)*Æ**J)}¦Kt+Ñ,ú#ÀÊz4v.BÓRH¦·biU°ô

ú0

õ"wì*z¦( GÅH°_iUôô¬ô¨Ì;¬ÀUFÅçæÜ-¢ÒT©1)"TéÙýÆ;ýmm5v~¾vÈ#Ô.»·ûä§æåÌ¬ç|A8¹p>åI?äôfäÅV}ñVà:JBì5Eª%$BÛogF_åuëHG BôÏfÄY·)ú{øw!{
ÒÛt&-Lâ$u¤Íe ¨©Lì³ªL Ã2Ú  Ëª')X84Ha%½z{Áñ{âÚ{Ëê­HÌÃZº
¹vDQyÑ¿&¶u÷Ùµ
YÛDn»h×Îì(nSgf@JÎo4Xû|[Lkê!kµÞ:DO.ò=MßÒæ©³h¨Íé&òþ$@[«õÊò¼T(WOÝi×Òê÷gäôýé)«4Hþ5wõ@L§ÆÙ0ñ$ýÍ3= >úë/ò=M~Ê¢Î4È= >úÞn¨cZ8K¯]6ÿÇ]«xÐ{=MÜüS(°Ñ/«oNÊ	é2s§eÐn©ù¤¥^M-È¹C@È/«Rü|{â!úq¬cV8^ç,¥G]¬= KÖÝ_¯Åø¶ÂbÊjVÀ+iío>q­æâzØà9å%[«§oR|Ó¨UPÙi®mj8äræ)G54*vèÜ,ºg2Vc¾,ÀNj¯kf K¡CÔàð-¥:~kµÝlîä¨Ó V½ÞN´Çø }}ÞÞ,~YËKª5øÿë²¢è¦YKK.Èe%®.*Ö¨fú¹?:©Þúøïe¦âZO¯¤G 9é*¯\§ð&×ÿ(LnõÅL-©Fø ë*7ís6?®c&ð°ZéòugîJØt©i«ß²<SòÛD!åý¶ß¯¤_@þé!úô@ð,Î¦pÉë{1ëýä%ïÖ²[u5¬èÐ¿Ú´QÓã5$JùV%½Ö2Ï²=M´)MäÍÐþëïdL_U½{ Ðg®¯òÆôô½¦6"3\8R¢rd±­4XL²x1[Î(ð
ò4hA[¯XÎ¡©MY²³)ìòXBU¼Z«»Æ^/C~ÓJØ=}ÄÑUIó»Ð,±åQçB¦í,&Æf±-Ùº"]U¨CèúÍÎyòñ¬òu°y;=}¯zø"qDÒuØ>áÐ!¹²ÔwlL'S_c= cà7Q4V/Ð´Gb]àÕApåËÞ·­<½>.@DëZuB!¥J¬=}×=MÓFáñ4Í~8É½Ñî&´¿^uu]UôZj}ÿ·ÚLÑ·AóÉ¾lÂ#kÿ7= ¼ÕxÂ1÷îpD[ßé°¢ÁúÙ=MIá»c?xf1Ý¾ãtÙ»ûa0¡µ§ÖÁÞoó÷ô%ÁySµ= Ææ1 !F÷Þ¬Ë ÞU5ñ6ñÃ9á=}wÔ¤Ve¿]W!inå@rª§D=MÉÎÁ!ÃyÐ°ÐÜ³°{1[:ú ¡Ý6Þ´Ôv5$aPe3½ªd<y×ÃÔtob¶]2Þu#ìI»£Py°ÍBnkÄ= ?9
½@â1æHvµò¿¤»= 1¦pDªOÞ19ï4È÷2(Å=}·À!È3x_0}¹zé8IÑÛAvÿQ:BýîT@»Gp¹6 q¾mÒyaÅÕãUÒMnMû»¬ðýè³â"þ¡Ùü2ØJëþgp-/¨Fjêbç^h+£= ³Ìü$Ôôîæ²>¾0«¤[È;ÐjÙÙqxzõ4ñ?Pn+®3H\ðÚphSI¥]4ÀÒ@XjmMµ(êöò¥¢þ¢ïBlØ¦ùY'2ømyÆVBöÓBÙ
¿ò#ykQ¢o9 Î(ÚµÐú<M~)Fgäççs,Fõ=Mý=}y(«Zlh$§VÇ0N®§T×¯X.ìvÊVöÇÚþÆ«)ª)+KÕjÈ:m©!üXóJ­¥oªÓÎÊâÂzLãE÷ºý»ÐéÕÏãp']cräÊS¦jâ¤p@®ÏzÔï|%ö2ùyø£wÈãà<5$6"b­x¹¿®eçMÊ/UÙ«0¥GãtpNTÓBLxGã.ÈÌÙ²¤¦óÏ¥)ÍgUyrìÑâ(½HPöMÖWß=M= ÌäØ´=}ô¬!,Qj4ÉIàÊoä§CXqäkÃÏÂ´Í'@®Ñõ»»ýû9¾õÓ»)³bA»e<V ¹ßÃþÛFÔw6[¿.Ë¹j[:Y"rrâ/Ú §5xøO¼Ö@= pH@o³dúWw7«Ä¥%&efåæY{aÊKÓ
5»ÝÙí=MGm)©'ø¯ "ì«?ýùV*óÎB¯ÝÔz¶'40¾-°©§v¤@à8~!%ahuAì[ï:/«b¨«áµVý¼R8mì«®å:/ôPL| ò¥Ãµpæy·ÊFöÑ= zÆSk©jY^­­»(Is±Tô® Pý;p_P¤eÚ÷ëí¿ô®Ä§ ÜÅÐ=}Mæ.SOëLuRPPjANjt[¶rï_?³<zW7+Ë=MçþÃ{r¨= w_M_üSsÁÈáqõLÁßl&é°GTØÝæ°nX¡Ê÷Qy3ï¶*g&wµp½®+ðO^²@Òº
Xë"/-õiXNJb_7ÛôS 4PÆuµ"úF"NbroWøªb$N×"!äí.Ô,[¿¥æé)R°%ßWµæK6ô3y¶EÐÀ= ØPæF>Üÿ@#K]7°}ùzvT¨m·pøR=  ~§CÁÎÖå®@nK³Ë®Já?ÃË]ß?XT=}÷+ð9@= ¦NSW9÷ðhðÞ;yÙQ ´ Í Rö³eÒúÄA-}w,\p¤^TûéC= n~¶¢üMþ¹¶0¯,¤«±ÌîçO©øØQüñ= ¶YìòÎ.Â¬BaßrýÊ¾&­á Â¾(×k[ÜSR\sªÙZpNÅëFslgªJÈ&Mbr_Ö¢¤µÛqÀ¦ìocËwä£jÊQ$åÅ¢Hèlf¿VÙö	*ï/ZõOÅhRðë_ÎÁq·d¡HÚk,¥âò¼.j SRPÃWÛRBà~ñTCº?Í*åaÃÚ8÷p%íù§²Qd«}ËøÞ½XkÌÚ$^*ûx{ä-×£©x	¬çK5¥ù¥õ¥ýï*­«­¤$qQÙ>P´Ð!~æúö=}_ÏÖSRõI±Ë¾o åw%0ØêcoKàÝäÖZ®BR6½¨®ü?ÓðhüKýÚùÄ¥<MeV)÷°«¥¯÷£Í¼O;½J>-éky¥V¿+Es©¨ù$²ö¢X´vBb¦ýÞî³ÈöwWr%ì@oþLÊÉg%¦ÄûþA êÊå0
Þty}$
k>o*8Ý	ßóöÿÿÿòò ÆÚÍÌh£ÐoG-ÏÊDDZÚy*Yi ö§^ÙDÚ|«FëÍJMAãîûç7Þzwãc"U7ølÄ¯sàÝÝ">SôEÜ#;{Æ-À¡Ê_¹H£±é	=Má¼jCø,'v_¬0'²kÕ¹´ðg>gggg(&ß×ê¨ª&.s3okÜßàMb= rPp©p|¢0 !.	9ðÒt0(v©ËÐµ¢úò¡ûÁÅX¶r(X¦&-w½D>@qñOkÞI¢E730\JqÕWá>Ê}¿¤	qÓGa=}Æ5Á÷µuÁø³úUA÷·
Aø²öE÷¶ø´þe÷¸¥x±ô=}áw]z]|«yw{z|§y{z|¯ÍyrÍ{ÍzÍ|¢MyzM{MzM|ª=Myv=M{=Mz=M|¦y~{z|®íytí{ízí|¤my|m{mzm|¬-yx-{-z-|¨­y­{i"ÕWá>Ê}¿¤	qÓGa=}Æ5Á÷µuÁø³úUA÷·
Aø²öE÷¶ø´þe÷¸¥x±ô=}áw]ñþÕóÀL$éÔØîH>êL:É }!âárýªK?:wSúº äáýYJýæäWJº HÚø¤ý$
#KWðø×$~:êh¤gqMi/R$hù <eõü~>Xæ'¤#6$hJ½"ÿôNás?¡	USm×mØ,]B^õ×
ìÏÚ§ûfknäAZGÝæYÞ>*Þ$R<¥SHîF^ó@F+^$>à<÷JåzWö÷^cH
XkÔ|J§|'wôcÏBªI.oo7
]×I~+e2
ÌLW9îKl^Ê  ìëXììdlcl,+ æ¬,2$a¨Ï>t^&Uæ@g§"§érØ¤Å,PW7ä#gKªmù^HYªãfZ8\¦#NOþ+m= hªßnÔ4¬¢QýÏB~ã+ |ênÙtHªKýEã/ Ð{­0¸ylð®¢­>#1d·´©ð4èà ^Nd ,§~g~åfgXZZ^ ë"ï8Ä³¶yÓÖ!Æ¾úîI9÷1Ë¼ÕÁNWtCªA_³'é$ìòcàÔrÎ¸.ñ'æ9,Ñ+ËlÁ0À¹=MNú\Ñ³nf5ô¶ýò'¯0ú/Á¥FîCßÀdbø%U8ksÔ.ô­÷«Ý
xØ ¢êÐÐA]Æþ1,ÕQ 19éíÕ+áõ¾7un¶}z¶¶G=}>9À=}ç57Ó ÓJÞSøùBCo¨ÕzÃcÃ÷×.p=}	T³¨ñ¶üÜú= [u¿\5¤\>Õ°Ëæ¥fCî	<	\?ër¦u·}¾¾iÌ
£.Ô¢Êþê~M¡&äÇcÆ+ùÐ÷Òtú=}q­è3:BY÷BæËâ·ØwcTbUÀ?t>)s{ºYî×Cãºl{Ú¥&hCfh¥õîÎYêNu\'çwtÃäF©£%+_0·[Ç­®_Nü¤ù÷àqcAöYoI%>i[Èèa»üg
>åÎì~°f#ÎCTv¿_8b².¯÷X =}ÉnÚnLR3©Þâ>Lh°'uH1-Xí¯lQF{¸:Lo¬C¥ 8Ç!D¸ãµµ¶cºË´g¼57ÞòÏ·s-ð¶£NÒÁ|¶§ærþîÏ£ûÀîxÔèºiZÅSÀâ@Æ.åóoõGÁlEBÐ+Æ+¾+	ÎèfæÑ¨so3 é#rÙíÇl³Pze?mWÌ¤z%}§$A^¼<i¾?"°Ý´Í
±.0Gðgèu÷d,;ÿ{K7fjvR'ìf
«}h^µÇóé=M³Ë´þàæiöÄqH ¸lkÆå$Ïù»AAPò¼(3fé³ïª³éXlp³Î¦ÀµÞÞsÚÞºæ:éÂ'¾Ó×®¹ºö©cf5¼5Î,6A®= :! {â¥étf×ãóÞôðçäKæÉßªÉt|OâòÛSOÓS?ÇB<s
Ó§Â§ùu:æËÑÇçg9jâlv%§übwñÒÂõü9n5.iöó¦ú©^¯GEßIÞPEC÷ãÒïWJßTH,ÜjØ ÿdå#þ= À#p Ùý
4LE?¥ÓÈØÂ= |%khç¬'[ç*LD¥UôÄBß"HO¿UØD~¦T= ¦2²ðk²0×rAêyÿ?çÓøÉºÌÄ=}æb>³ÄqÌÄ)Ww&Ù~*tÜ¤á¼[úGdÕâêBd]ªMÌgVód]3OeÆC·"´Zî%{diòa}$ÕÏ/ÿþwJ÷=M$çkeü2o+1o¾É¹U±kä±¦ÞÑí;Qâò÷·'3¹¿»ºBÇôÒY>°Ò¡TÂÏNâ8 <³¯©Ø¼¨µCOù¼>3H½µ¨_õUµ!ÎÉ-ÎwêÍ6bx)÷z6½ãË:"Ñ"ölzínðù¹d&	T}cÍÌVÐSÍÌSm;¯È (:ÆJûú°8Ö%!7%Y~pHÃ>]2m1È>yÆn«¡ý{Vl$í®OÌ¯l= ¯5Lf·­­t7þÒ²wlèãÚ"9ââÇw
|ô{Þ¬§Ù¨Õêì¯¡ð«la2.ë|[(B(ôqÃ§õas¡ÝHd{¶î¸{K¬ígñfÿ ¸w®cåØ*}L}½ êÎj$v¯âq«k~GÀ,ÎdwÜM1kÙQ&ï¡PÜòB¿4ÂÝFÑ©$0§_vn8w!é4âmÞ½´Sq¯³HðÌQëcº"_¢<bÈj&/ÝJ£¯çêÇPu¨-qIKå<S:RßsªÕù ~A&çË_Wæáf?©nÝ#ô0hÙD$Ì~(l¿ab iNWª­Û§h¢oøÐ¸à
Ê_{ã¬_EÌnª&[=}}3ãL¢æ@×Ë¬"èñÄe9¡RÅBÿëÁW5(°7=M·yþÐ/¿&,´ùõi
vPzÂ~	Ù¯é÷ÖÖÃÞ¤°+HH[Èj[ù!êÅ¬?è"®©Ûãpø5/oqkZ¬ÓÌ\5¸D:OÉ^¿Å7wl1<@Ä©xÞA/ôºü½zç¡ßºcûú ÉI[ð;	>!Òôò^¼«Ìß	H|^N}!±}h aIÏ­PbÔbÃ8»Ë	X0#<Ö#è§p"{âLPÙ;7PÇ,Ðð½ËÏC¡_÷'mjñþ jÐç%Á¶ÀÐÐçßÖÖ( w ½0þ«x°= hO¥Ó5«Y=MåÁ%ï6H "e-ëIÐjá¡Ïþ³ó´Ð±~ñzÒQ Æñ)®³%ÿÕ± ðWöÜ×÷/®´k¨X#%l·È±¸³bP°:c,pÑg½I	¿5±frq%³}=}´²ÕÌ¹É9Ñ7µyÑ8Ç%Q¸´Iq³ç!5ì­Qõå»rÎ+¹¤Õî'!yá0(ø6:BÇoRkáîâkðÔ~{õX!õ&ú#/=Mõa= lNjoÉ±w\ü$ÃS¸¥7©kËÁ5BHÕ&Lcÿ»$´ÞãdR/öÿ­A/îtð8V hçÿÏämWÝðäê' YpXdº
ë= wEºT7ÇWØ÷¦°ÍP@Þ
hG7ú÷GÈXu.úehz éÝk®¼%¡V//½öêk¡FWP²¶Í=}E­ÁÇpg8m@«ÚÂ¾¶ÌÓõÏÃV~!W ûL¼FÐ¯ð¦N#´Fn8£¯/[5x6Ût7+eö[ÄÌï²*±7°Vîoiîëp}î= îÅ;¨î¿Ö¸ï¥ÃïâÐïÜï;éïá÷ïEÐïpøï?w!ïaH0ï8ïÀ@ïIGï*Oï!WïÌ= ï¬hïÂlpï÷ØyïhSï)ÛïElï½ï£ï·:¬ïoÁ³½L´ÍòÅñgàgLÈáfg	b~À«öæ¡CGµí<ÿÿék'ùà;÷¥£Eò Q	R´·¥èRbê¤÷	zOÄÎÚ,3a§ñÔL|T®YËÎy8MÁ×7D
È:\9@é;ÓÄcÙJXj#äN¿äjoåLm©=M³Ë¤*;=}76Í;ÞSc?=MÛÒ­Ú\{I$nMÈÌÛÙÛ]õôôÿ~*ê<ÅInaázRû÷¨¢	WtÏÆï\Ã=}¿ÆÍ_Å}OØiiª=}Q¨Îr¡È3ø= ¶lðºw0ÈM®Öi®øPFUÖ®øZeÃx=}¤ ÃþÃUÉ~V¾	C¸nukëc¹ºÒ*
¯D£ÿG%r=}jðVëoû&-ÅÉoFz°=M»0ÙvÅÅýêÒàéeö!VQír:3^ó¡kñKÝ¡¿Âj¹ÏL¹ÀÅ]à©ªøvS+ÆD\i!ýö÷Æ«dµ¼ÆX=}§â=MvlÛçâV÷z>¼ûgÙ"L_Ui	z8Ö¸~F[u§\3@èÆ-_q$[3ê»Ï)Ùæ	rkp#wFd$LÍt¢#/Ø{Ö)ìê'F)= ªû-DÕh
ÖäL)= 3ïÜ9[]Qd3dÜ©?-ê/t{Ú£ÞXo,êE"Ê­Q=}G~|yl{AVÉuEã"ñÚgÖé]àÿºÿ7Öé/Ý?;<báÞ}XÓ%hÈRßÜS= 9O¦6%ùûÒÞ,È'²»¤ÙðÊR,å}D%a=}U,ª%JM 0X-÷/z4f*µø"eÏTÀcÛØHïn$*(ï8ÆêÝ>¿9³%c"iNvuR
É'ÔDÊ£ý-¸C#ï4lc½'~2%ÃÃ¢MEæI)V¯ëFêDº V#»#ië6?ÌCBÝ^°ÕÀ PÕïþUÝéBIèº]ÍN1pµS¨u$ràOv"CxÒÁø	_xã°#½XÄ9­Íþç(<W!Å<ÝTðÌ:÷)Õ[Ó¡à;ñYöé,5ä-É·}È;f$ÙÈôéÄÃs8råùºù.Á&cÑuñ7|´ª©à1ÜÔ³Ý1­ª{PZD­I@Ç-*Èxzïå4~µ Oæ¨xÙà÷å¥óYí*¬t4ÜvÏ½/L½(eOl"ð{¾fÌ_Ý¡#âÈ=}Þá}£òýKulÿMÎù¿VêQ*À[mQò,ß¤RÎ<"	üýn¾ÖÂçeíþÐÄçÞbñÜÜ|Ýº-r.Ð¼çØlpêv}©¤rEW}ésþÄ½XÉ¥v9l÷-éyr7Êñ.7ªm@}+EC.ø¸¼üÎ×}×®lÇÈtfpÄßKIÅ![ëh¦ZÉð5æ4ú%Ë}kö4/ÐyDQ2=Mé±W´9? ¨î®ÉoÐ¬)UÀl§	ÿ ÷Ï ön!:¢Ïµ'2*(gÎwb§ù {;Ù6ÂN*j_Äø')&­¿fXcîÔxeq^gýÏGp°º3¸1ûQÙ»1<g*¬gÔgg'ä 6JñIÁ¤ÇÁô¶
jF±,w§¡dÄã-}Ö>HjHÐ£á×tvõ:<B×Kë6zþPsÝ þÀ]×â¦}"Ê4ù¹Sï¾Ô%Á¤¸ÁÚ@Ñ®¡Ý24È}&SvTÎKìQÂ37®~á» 52·}9_ôªR¡vô¤Æ/øÑ2? V³O1ÓÜu÷¨-E= ztQ&¿¯ÝywnýU9ñß¾
TÚ©¤êÊ7þ:	&ð²\$/ÓÇûRÍ6é¹}JÊ?ëªÉ½÷<ÑÞ»ñº0»¥öÛÐ¤ó ª¿_ã=Mî3þ/ÿ	9PÛ§ dö¬.Ì­ÿc3¯çü!ý}¢D|½8Lqã¹K,¾âÐL*¦ª¸ceÑiüÄ£wáÌv6øÛa;3ËöÝBxªç
Ýîà´. Ú)ùùS]àÍ0Ò«(¦¶fÐq¤ÇPÏms¯6¢aâË%ÐÑ®­}Æm6EIY¬$Ê= 'qNgä¹hîº^xÕ"É«ºÍU®Ò­kÈ&ì"xÌwrúÌ¡x¾¿ïº~Ê|¡çÂ;pø{ê)Dè´·cÃifÅò3¡t!ôX*ãëç@Ã@Ð.YX,ÌMÆVÈDàå;Y@X_.BSÏõ¥+8ÜÊ|Fó$ãù00cãºHÖª­%¥ìkä®Ò*Wqdxù]*À{^ØöeïMm_"µò¡±ÁùÅñ²¡ggg0dæÄ°9à®ùôT>{@5íKúª«2øÈgíe¨.©¡;#ö-Ì¢uq7õÐTdE«*[JôP#lö¦~4;}^WKwY:Ouù¢µ%FÍ*¦I)¬/ÑÌ¯B¶Ò3óºd>Í}Ò®cw5]Æ]!Ñ¤}þðÅógLõD¸Å
ùÖ²ÇêÕ¬"âªòï	Ä= 85j^8ùÉ¾D«LuR2­ù2jÎ¡G,îuóskY°pÄ'²,ädÐvÐ¿^tâ-ï:lbý³-|Q@8W¡Þõx¶¨8a­§µÀÍP4R®Æ7_mteøùÖ0²¤kÐ9­«ÌCç°x9¼Ø	"AH´s2éëy8üè5ÖÖ;âÃÁIE·.Ïwcûa:6e3ë õ-]Ç;0ñ È~«Yj¹b=MÔ)¢Iñ6ÊËN~'ÃeÆ5Qo¿Þ§Ym ¹Øy¼i»èal}æ Ù+2>z¸6toy¢x42©ÇË5WÈÒÉàÀ6Úé3Ó¡Ù»Ó8aÞÕÇOuTYÑ²îýÅå+º]D!%»ÿVs¦	ë}4ãá&è¼%çÿ-öüöÏ'cÆÑk\ÁÊv)â3|[ååHV¶5h[Ë¬¢Z¿8@ç>,ÔÄ~ù¢rg1ì£ %O,ÈGÎrÚX)83±³h¿Wrá']ËvÌâÅ>@Ôñ)Ã©xé4$Öd)¬Ïº¼ih(
¢Ãò¡±É³±a'ÌggD goË\ýè@gQÏI.2¨§O-]öc" C= ¥tï)5¦ö ,GxZc¯ýÊq0¸¡©ñWlÀ°X4a!áWºô¡Rq»éFÛSZ_uDûW=M6þÈIëóFrÉ¥Õ&«ª!b·Âäæ:¹«$Þ+~!A¿»à%)îüH±îÛO¢$[ï·=Mp1z	ôoÌB09ÕZâ>ýi(µRE»èKêÆ}o¶ü-ö½mÖH:};8^ÛawHæxÈ¡GêøX;îìçÍq8¿¹ôÎªx:jìN)Ë}røÙ(j¡	tÆ°~_Y8j(>×(Ç¥¦Q"2¸ØÍíJ&D8,v(Zèø8©$:ÀøÍ-ª+H>º/=Mlx¡ë0/¨Ø=M±zË2Ïy.¬Ñ»§¸BÍÇ}R°3
EÆsx,ÒÍ^ºV¨8¿ùt)äMbs
YÉ2]¹½&ÓJeéC+DÙ?];Eå¸øÌ4)½îªkÚGÓléíèwÒh?x*íZºí=MGq.®õÃÖÓüS'#Ã«®D¢ÏG}b= zûò®»h»oE{GIå'ÐútsÞNº|ª½/'UTêD}¬JÝüzÓ¢)ÇK~â6Í·y#®Õ8Zj©Îzö×@¥
*-ªFx= ;-Û¯xd1SÖ¶my4KómÇ£^9/¤<«
õâ?Æ3YÃÀü!ÀÜÖÚØ+Gâ= a=}pÀFBXÿ,ê¤GÄò¥»ç_QdC¢Ü¦UCÜ¯¥Pv=}ù³[êáTK}xu,a¾h9(YÞV°x^ëG= 0p+ªmUÏN¦}%Qm\2ÚËÔÛüÌJ®YB÷×Gåæol:K!£ ää?ç$m¼BÒÞÉ@Ò	¼lhcwpFdÃ§g¥RF8ç¿fâöÌ\eR_F'>Ø.0ìû ä ñM2U¿]@%Ñ,2B
ØN=}ÿ_ õ
ö}m±â~fÇÆT/ó}^ïúÙ½GQÔr)7µ¢/º7(Ö¥DCÜ&SE$^+FãpEÌK0ûjVàOP=}jãoûÝOÜßÊ{Ù+ÚtppMûÄê(-]ÿFd= ?ùê|êo#GDä£FMNîµMµoL¼Y)¹eö¹	¹IG¼f»¥Ïß¡)c1³2J\¶£hºeÍÁi%èTÆÁ¦¨7ÅBwkBEAêL?Jo((Üú}ç'<^Á×9­¯¬_¦¥º·Ègä	"HrwØ½÷oAt·¿ã)©ì4&ô½ÿÏ¡ ·÷ÊÍËq£è´80ãïq1£ì·åÏâÁsq<½5ãQlM²NÍ·s­Éñ·óÉ+x¸ôu+ïå×¡Ò&ÇÐø|qlb½ç^Û´ÖpãÙ4«ÿÏm´ ¸Ï-¯z6gßm@3®	ßíê|2¤ÂÍ"qY[Åü%(ºíE18óº9ÏÝ·|¡Ý3²ö!Ò-üÝ5sO³!yÙ1u-)IMÀF¤ûùÏ	g3Õ3¢ÍYLC´,Çt\Ý	D¶ ³üÒÄ1-ë=Mþ8Wså!ý¶|úZaîâ¶c ×ô@ÕBÕi	B¹ÃQûÙ²s]Í)xs[É¹92gaçÜ»õg÷sI|Âaþé%ù7tÇ®áÉ'º6B5Á~À7Ì4Q¤ùÑu¼³ Lð])¸ë .Ra¸ûp,4ààé«ÄO®§1pvÀèÉì»/ Ñ¢Zäé(êr¡ø	!² a¸v'F¼2çQº!0»2ÖôQ.0ßMî¶$s:µ¼hã8¦$ñJÊ¡?3PJáÅ×|LqF¬÷qã5QiÊS±= ¥~ï>2zQ&ÄÕH1·8s/Á^2L/{¡ûëa@þ6rGI-ÓM¦M±ø«FnÓMç1#DÜ¼'ã&!Í¡UQOÕ|Í´ 
ÃÑÑ·Dföòmá¡Î	á^#E¯Óôðú$¨è£¤Ñ¢®øW90ÓnU¯ÎªY©KÅÜoÑ<OÂþZxÕõ²°*8.iúO%AÄ^^u= W:¾£,ªãÚ ÃJÁÕÑóÇfU,¶Ó©+7ëúçÏî÷§~ðóëóÀÃÎTÛ#àÚúÇ÷O×\ÞèAîÓzEFõ®ãCÏcIµþñOGD¤qÖ#	ñBW$zuáG5¼ÔTû²u(RØ:Ð%ÓÿçõkzCåL}Óç~Ñ*ô5»j
ð:ÅþÑý:ÅÇÖÔ/b¤Uðd¦PdDdnÅËÈT\¼õ'd|G!q$u­:¶l[!ë¬Â'dQtëùL&]=}\¦¦4&$MQúX¯ë6Ø¢¦ï|¿ïZ0ÊÚÚÅÔ32¤R3Ïÿ2{_v³lB¾3wa.3ö ¹3µ3ºÚ~33,3\#= ¶Zb´3uÄT³hã"KS×þ8_Û@ºYBYË^\ô®÷OÊnJæHßÃfTDhiî kÑ¾#=}Qxì+¨"çÞ@ßSÖ)å)¶^ñÞ%Gm$ÛfGg: U]g ÊrEkH­]SªK88)Mï';Gd%¨¶ìüX"JªTZ¾åGýþg«nNÞ(Hßo¯1gïWÆ^à= ìÛVîðCK/Ë®6¢NÿçõPÆ=}ýÔÒÅ|óô¶Â-Ò;ä«u!Ùó³îËxQ£}bIbþ»cUâÔú·Øç|S½*]R1+Æ¢?|)Ý[K1jpØVQzÉ(»«» t2£Qãg-r¸æE=M\?møËYZZ6ÔÙ-¸þ·&"2Jï¿ÌäÁïËS5?âo=}ãr¾WéÄ8ô®©ß¿/?sØÝOÖ;=}	p[æ'b"Íò #q¨áMÞfô¼,M©²öuN¡KCä·Zj*´-ï|¾ kûg¸û3ØëÁà¦woïÉ<VK/çzÐLÖ´¡¬@±0Î9ONòI$âÉ~(6?;ÄÈ7uçÍ¼XøQ¨¹Ï:ÌÛTZÙËNaâÇÐí>öÍÏ=}x±µÀÕQ§Zõ%~ýsz©úãG= üò_ôÛoÌýv\,!M,ëËùxXLäárÛÄ.ÏOÝ¥ywUÔ©±#¡¡~ÍmÄH<.jv~t=MB-Í
C@ V»/ö²CÝu¥¶6i«Ò»ÆRÂ¹Ùwú;¢¥=}Ã=MpRµ/GQõÚïYÜvgúÍÅä¸>iYJ|vAü=MËxtSÑÏ÷ míàtã%
7(|!éï;¡¢¿Ð×ï/õ·¦]ÉE¼QIrCf½¯éuÂ²4\ìÉ°Er@î½×./Ir@pÊÊ¦À·¿mqa:²Ï·çáyq=}H-éfCÀ7-1|·ß>íN|4 ¬iÑÉñjà¸=MgE3£ÃAÅÜ²ö4!#Û3Qó¡;Ù±<-Ù#´öt=MIç×¸'3®lãr×Ý´©A/ëÆ×,XqWúáAK¹íÝ@94OÌâAZÄ¾­ùº86ã Ã³FÖòa-(±Y»­QY|¸ÛÐ,2Z¸ík·;>ßqìµ÷\Íqçr¿þtèçMîäÈÝICêyIrSqJQ½<¾Ò¢Hï}sïÞiÂ^²HËRÊ¿L»h ý³è¦ºQPS¹À{òhå!ÆVq½=}Õ:rvsåûs$0C~¸:r@u¢¥.ê¢é£9oôKiÎ5·æBkúñîj!íÊéúÛE@A&>FÕð.ØzAý_ 	ôË½GBKd¤úôç8YVÃª9ÉS  ÷N9è¼S.1Þ×7£Õ)5v0ÂðEjy/ËmDîm&ÏloLNé»,×®4$^àH^æ%y^Ào¨cTóøaòçáZÑýmûA
ø¶ÚÀµµà.ÖY¢ÇÖ«®OËàýÀ5åjÝ9g:Xïx#Y:ãÛpA=MÿVÞ6nCy;¬®øÚ!BàX°æ«YlJÈS? ótØe0ü£O°ý?®ûhpÎShÓ5s÷µÐþÈxx	4Å/Ø4²Ò£äºë×&vMâ¾X%ÚGËÏÆu¼fb[Ïçèq¦û÷	hµfðu¼ïdâ¡9êoÍgõèø}õÍ!ªì¥P96$M¢R8ÜW8jT=MeØOº¤÷<©Jº2I¨â¹= 7÷/É'õ¬ùe	Ä>ç7bI-Ú¿(i×,Ó§cD¢RÅíÙJ7ëâÉN2ÛPãBTF>Ò/ê)eÑÈDÒdæÐàq>¼B5L;¢gºË<H_7My·îßûè$BÄ~tì *éÚf½zDãe"eÛïg/TØ!¸8r¤øÊvQ®¸·¿ä)E2¾àÊb>2þ·Ý¢%Êq¶Ï= sQÆ¸G1mâ-äà5ìd¤=}ß¥P{3P×ÊaÛÉPú³°¼¢a.½)jõ3ÁÒò¸:ìnÑDÌeWìòKcÎ­í·ÌüAå4Jì=}"fï¥³Ù6ýtZÁãÏUnÑVÝUü:2;z²ð¡7á ÏC´ÈzCiÜu\¨ÍÀéý-( ÑÔ\ú*UnÚNu§Ö×ï¨åÐÙýëíR~È§[ërQkµ'0.V)ò#ò2Cbñ)½~åYç^ã½R*ò.ÂÛgOK&W()%iËë6,N7è%g  Y¨ewkW÷¹füvÍ_íÚ@úÄbgËj]7T= ²·ãr¡Îd"oTÆ?eÂ­@¦V	gÎÈ¦÷F-0\Ä=}¢t¡7#ÅKuuSÝØ² XØTuåjD28d-üßwZóMqàw {VYg242 iÉëutROãEêrx³Ø· â¯:r°òÐ®^P#6[5Ë6O»çcUga¥¯â"°g ¬5wcWc%¯f­¨4¬¨¨Ý|Eö	ßÝÐðH°/¥ºJc¯C­áÜKFu{®$ª@x·°¥Pbû	--GAÆüSY_u°Ä:æf&¥¥¾ÉËÊÌLMç,?jjV=Mç²afd(!%#'äJzgb$%'&¨¡£¢¼½¿¾@9;:üýÿþy{zÜÝß£©kÄ&
l+¬¸8øv×ÕVWÈF£©Æ¤Èàf'tW^(Ïé=M.­Ê>WgR¢*Ö­¶ü_i&¨¯TØ¹ßæek°©ª(Pp¿@d£?~Úk2¶LëÏmÎÍG1Qå£Þ¬  p¬¥~xRzÛZ6|,©Ë* o= T#KgR
'Ð\j¢öqAEO#ª+ðÛNf]cgh"ë¢æ .ðÓêtè(Rü(,øÖýtIî©©l©]öø+Õ=}4jà¯ÙÇl¥)PIü v ÏÅä ÞNlh®8YÞõhYî$oøÐ%°4î0$«¥Rö^0G.0"w6æ'k,¯¿á±5Rá±WÉx\öûÒg¡À¢û­´¡±¹PwRÀ_2,¤gÀß!ë¸H;ùÞ/ûÚâÏdäûëÈ ðÃòâ¹¶±1(g|gG|gL|g~/g0x2qäòWmÍ8$gªI~&h&¾§¢GzÉsÔ;jÝK)×Í×Jô-ëw¡;c_gÝ\ªKçOc¾XùÉJ>zõ~äðvü'ÃM5:Éqî»êó}.Ëi·ØB´mÛ÷¡=}CßhÕ|ªMÇÏd¶xù¹PJ:¢5¦îr$'ÍJÍ 9jIÿ½æþg¤ìîmÀ_B|wÙ.jþ/IPêmôQ,½À×Ù@º!:²ÝÄKË3ùÐLObmWMÝxËoR^X|ì»B$<sà%¦cjý'XÉ·#Psßaá¼©17ÏaÒ¸ùñ LKBíXEÜÝv»oQVxz"ì³R#4FqÀ%¥mÎê ØÉÁüÞ(	<Î­ò = D'7b×QÐ(Ù=M¼áH(ZbHµ§¤?ÚÉwÄ;lÝK*uÍÒ6t-ðèfGÞäg½Ê-|èÛ(\{= %¤;ió¿XËÃ·¢1Óße¹¼ªA÷ÏeÂ¸úÑÐI7mQeÜÞ~ûoUFØvºé{ÈÓ'TFy@%£3NiñÇØËÏÃø(LN­úà <Ì"W"×Uð(Úí¼ã@¨Y ïd@5§¨_ÚÊûi}ÃÝäK,ÍÖVt.÷wÂý¶
2&-ø,Od%MrË!Læw %¨[jûÿXÊ·¤ASßcÙ<©9wÏcâ8ùÐKGmU=}\ÝtÛoSfØ~úëHÃ"Du %§SNjùØÊÂ Î(
8­ö  LL&G¢¯ R¢èò¡±ÉµÅ7²áglo'~ggn¨gN¥hÚõ¹m½CsíO­!BåÚåU 8ÎV!üvØ6»UÅ§*
dCé¯Ô=}>Êüw£-Ç/Ã-òNö7µMN{Ìº5&ÝTNö)0¼®+Ñ?oð¸zé½î99ÒëÇ°Ãö®$KÞ³¢à%RþÉÀÇ!B­IàÇXLóHDØR 3iå]ûXµµÑ¡8?9¤/_Â¢¹¤ò¥eÖþ°|<Ñî,.}4¡÷+%AÌÿªºÿýÆÀÓr)¿©8á«Ù¨ÐÜìYðE=  Wþ0A5ý×¯Ìk ¤Ú(¢à¥­ÜÖ/DÐ!\WZp48XBååp§@'ä­*Ãa± °ðØÿ¥oðAÝ«odð±±±pÀ³=MðÌ³pQ÷ð(s¶pO2	ð§K¹pÎdð(¼pâðê¿p ªð±±ÂpÀð{pÄpnÌ ðÉ*Çp©Ïþð~ÜÊpåÊüð{Ìp9»úð¢-Ïp»¤÷ðÕÌÒpõð÷cÔp¨Zóðëó×pD)ñð{ÙpnïïðÖýÜp@­ìðvÞpÓcêð²éápAèðSãp¤µæ½¶²±á±³rÐN=Mb¥
£­¾w¶$atâ=MÍÉÞåS"e÷¤@8¢Ã ÞÏxí@¨á
ÕDz×ÊþNëÑ±É¹óÉ@ú= fv³Uç|'P¾dKîL¬ªÑ}Øªï{¤
oLÀ¤-K -îP¬âÁ¼Óçwù]=}JÊôbåW=}vI<nâÉ<ãçx]?ÎtbíW,=}x«I@®ÑÞýÄËúÜXJe$ËûüXZe&ËüXje(Ëý<XzeªåKP¬ÚWÀs¹É·1³Ä±ÓËýW(0	k¥pì«Pd¦+ðl«@¬díëÐl|_¤dïkÐl|_¬dÏKÀlv_ªbOKàl~_ªdÜÀ't_mFÐl£o{Lªd\À¸l«s_¯a\ Èl«w_¯b\@Øl«{_¯c\èl«_¯d|´l-a|¼l­a|Äl-b|Ìl­b|Ôl-c|Ülo®â*>+@¨tegî ,ì4déDdêTdëddl4liDljTlkdlL2
I:IB
JJJR
KZKb
Lj|ñÇãB>=}ÖäzGãF^=}Þ$1ß59_=}AßEI_MQßUY_]aßei_mäq³Äás»äáuÃâwË$âyÓDã{ÛdW|ÃÎ²Ásá½Nç;fú¤üÏA¨ìP¬¤/¯mJð¬°J-zL­D/L¯ÂïÆ/ÊoÎ¯¢Âð¢Æ0¢Êp¢Î°îÇI±±±±ò	ä{Î+IïWH+KoWhàîW¥K/$«ÿ ðð@­C0£¯{ ªàð­K0¤$¯ ªðÏu8)Âðú-:è¢ØÏvX)Æp
-<(¢àÏwx)Êð->h¢èÏx)Îp*-@¨¢°Ý:±1±ñb}Ïõ=}j¦¢Ñïu<©Â üm:ð¢Ùïv\©Æm<0¢áïw|©Ê mª ÐKx¢êx )Ï.­¸£4-Ò0yØ£<-Ô°yø£D-Ö0z£L-Ø°z8£T-Ú0{X£\-Ü°{x£d-Þ0|£l-à°|¸¤t-â0}Ø¤|-ä°}ø¤-æ0~¤-è°~8¤-ê0X¤-ì°x¤¤-î0¤¬-ð°PÝò²±ÑÁµR°/Q¶¤2ªr-¯áPI}èÐ¤B­Õz£J­×z0£R­Ù{P£Z­Û{p£b­Ý|£j­ß|°£r­á}Ð¤z­ãí°íÐîðîî0îPîp.o¬ïò¡1Á¹±±±gggg÷' T]okÜ^kw^mK]pÃ[Q>Ï{YR:¿«YQ?ÇkÙ¾f
ææÆ6ûZWB'+ÚXGëXC+Wù¢Eë¨Ué¬mD ì¤M¤ ÓF½czÔJåãzÒPÅzÓHµúWKg*×LWêLk
KáZã{ß= {ÝX­ûà\ÃÖo£« o¥Ì p¨£ o¤¯ü]crç,Ýdw×ìdsëczè'%x.=M(|Èßf÷fLeûfSÖr±ÌíAò´ÄÍ¡ò²ÎÝ!ò1Õ[É<Øc;ÔoÙS<Ö_¹Bó¾Ô¡ó¿Þ}!sÀÖ¥as¾ÂY=}îyT>ê©T=}ïiÔ÷=M
±ÍþÃñOiw]/ÝgNb*ggéoOÏXfl¬{Ôóy£·¨ÂØa2d^¦¦PPµ§®¬= °mq¹G=MâwñrÈ%¤r»WËØgÑJ¹G~Ì¹kv\µ´QëýÉ9´@·¡¢´R³áC2<Ç·ahÈI1[9µ2ºÉZqÑy=}1;ìiIñ7ÀËºïÑº÷§ùåJ3=}Éå	¡¶PÁ[¶ÔÏ¢ñgUÜñSÊye¼ÊøÑÛ1AüÌ#»òy{¶ªÍ÷óÌ8üü?Jç=Më_5¨HT_-º&X$ðÛ=}Á³úÝ«VyÓEÕmÃúöÓÜ·Þ¿Üzç½/NÀßa[ÉÏ4OyØÍ?©!ÀÐ³ÈÒ¡1d¬¥Ú!³ðâ!EjáDø :*Ä/©ãÔphDìR+ôyT^ªÇe·NºN½ñÌG«ÏeÎZP °pe os¹ohâÍÏÎÏÍÒ~bm{maRrê¨ê¨*sªº=M 9úýOüùN JüJ|Ëí ÛèHHJÛ%«=}©¢zQ79©S3#$ZZ!VbwºÎ½Í¢Ð¢E|(Å¼à !H®?êj=MPíUæÏãÍ_ãEå^ÊJJÔ:BÜ²¤ï¾rê
FæJÎntr´r®r$Ïü;æÊ$U|àÈxpt¢¬M\_î=MßÚß[FÌ|½÷ôø+£û0¢5jD®mË´#stØ&Â.RÔBo2/ø®Ç­lßXÛ'ì®öh£ Ç^ûM= ÀK»<<[¼+ônovÉùÊþMúÍþÍú
=}¿ê|(\ràØEAæÒáõRüþE0ÈüO~±­nPõ6{vt|xð±Àµú¯¯}Ë¯üÕ!®Æ8|ZJï<8k
jjcª¿GNÙÅ)Ö<µRsN7©}0rã$âùàO/âüö|	ÆtlÎiÿÜ¨aeýÿ¬Mõ|/£ÇÔéwYmïwwm&Ò¼"',@bbÎMªlèé®$Ín§//IÜP-®Ëü,j¥û' ôM¯ëÏ)LÂ¡£ØIð²`});

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
  const samples$1 = sample + "s";

  const stream = "stream";
  const streamCount$1 = stream + "Count";
  const streamInfo = stream + "Info";
  const streamSerialNumber = stream + "Serial" + Number$1;
  const streamStructureVersion = stream + "StructureVersion";

  const total = "total";
  const totalBytesOut = total + "BytesOut";
  const totalDuration = total + "Duration";
  const totalSamples = total + "Samples";

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
        const samplesValue = headerStore.get(headerValue)[samples$1];

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
      this[samples$1] = samplesValue;
      this[duration] = (samplesValue / headerValue[sampleRate]) * 1000;
      this[frameNumber] = null;
      this[totalBytesOut] = null;
      this[totalSamples] = null;
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
        [samples$1]: 1152,
      },
      [v2]: {
        [bitrateIndex]: v2Layer23,
        [samples$1]: 576,
      },
    },
    0b00000100: {
      [description]: "Layer II",
      [framePadding]: 1,
      [modeExtension]: layer12ModeExtensions,
      [samples$1]: 1152,
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
      [samples$1]: 384,
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
      header[samples$1] = layerValues[samples$1];
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
        (125 * header[bitrate] * header[samples$1]) / header[sampleRate] +
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
        header[samples$1] = 1024;

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

      super(header, data, headerStore.get(header)[samples$1]);
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

      header[samples$1] = header[blockSize];

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
              let frameData = yield* this._codecParser[readRawData](
                nextHeaderOffset,
              );

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

      /**
       * @todo Safari does not support getBigInt64, but it also doesn't support Ogg
       */
      try {
        header[absoluteGranulePosition$1] = view.getBigInt64(6, true);
      } catch {}

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
      this[samples$1] = 0;
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
    constructor(data, header) {
      super(
        header,
        data,
        ((header[frameSize] * header[frameCount]) / 1000) * header[sampleRate],
      );
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

            if (header) return new OpusFrame(segment, header);

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
      frame[totalSamples] = this._totalSamples;
      frame[totalDuration] = (this._totalSamples / this._sampleRate) * 1000;
      frame[crc32] = this._crc32(frame[data$1]);

      this._headerCache[checkCodecUpdate](
        frame[header$1][bitrate],
        frame[totalDuration],
      );

      this._totalBytesOut += frame[data$1][length];
      this._totalSamples += frame[samples$1];
    }

    /**
     * @protected
     */
    [mapFrameStats](frame) {
      if (frame[codecFrames$1]) {
        // Ogg container
        frame[codecFrames$1].forEach((codecFrame) => {
          frame[duration] += codecFrame[duration];
          frame[samples$1] += codecFrame[samples$1];
          this[mapCodecFrameStats](codecFrame);
        });

        frame[totalSamples] = this._totalSamples;
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
  const samples = samples$1;
  const streamCount = streamCount$1;

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
      this._beginningSampleOffset = null;

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

          // record beginning sample offset for absoluteGranulePosition logic
          if (
            this._beginningSampleOffset === null &&
            Number(oggPage[absoluteGranulePosition]) > -1
          ) {
            this._beginningSampleOffset =
              oggPage[absoluteGranulePosition] -
              BigInt(oggPage[samples]) +
              BigInt(this._preSkip);
          }

          if (oggPage[isLastPage]) {
            // in cases where BigInt isn't supported, don't do any absoluteGranulePosition logic (i.e. old iOS versions)
            if (oggPage[absoluteGranulePosition] !== undefined) {
              const totalDecodedSamples_48000 =
                (this._totalSamplesDecoded / this._sampleRate) * 48000;
              const totalOggSamples_48000 = Number(
                oggPage[absoluteGranulePosition] - this._beginningSampleOffset,
              );

              // trim any extra samples that are decoded beyond the absoluteGranulePosition, relative to where we started in the stream
              const samplesToTrim = Math.round(
                ((totalDecodedSamples_48000 - totalOggSamples_48000) / 48000) *
                  this._sampleRate,
              );

              for (let i = 0; i < channelData.length; i++) {
                channelData[i] = channelData[i].subarray(
                  0,
                  samplesDecoded - samplesToTrim,
                );
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
