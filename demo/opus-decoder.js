(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
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

        try {
          isNode = typeof process.versions.node !== "undefined";
        } catch {}

        source = isNode
          ? `data:${type};base64,${Buffer.from(webworkerSourceCode).toString(
            "base64"
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode01b3d98c0556'DMóÃ3~íÖL* ·*" ³¡­eÅk%¶+¹3*[2tÌü°ÅËó³sâæÿ9c­4§ì­ZÝ[eàæ³kPº ÇaUÁ¡7]É=}$Ó {ýT,xÇôÈøö«þ!ôø{>Ç±=M3õ¸S!tÄÏ4]ñú¦ËCñzô+%õ·ÓÓÕ3SÉsÅ?}hE´]j$öL»¿g*û¸Ä[¹d÷BÃÀÚÕäyãÝ7Xya;Tndt;të@ðAÝ-Òr1SkGG$5³ÚµZÅZTÐ½Ísïõ¨êQ+â{LX¢XecwðÉÍé}= j,q¥ýÝÆ]Ê	tjßï´#¸çéÙ=Møýñ= Az(;= wjj
lpºnqèNMZ(»èÁÆë5óûµHÐH¶Ïµèì½[àJVaó0A­µúé1ú®¶Ð)'ë$úz¶P)'í,ú¶%'Üèú'f&1æÈÜ¦"
+zZë|âSõw"¡Âxj¤â¦­Ý².|ó+¸ãÃ´½w
3²ÿv²¢v¥vïÁjÛL¸p}IéÆÙ%î~:×eyÉf=M÷FRïeïZº	EO_8Ùð ¯L£îT´ÒzD¿V»¿bÝbuO+°{îQCÖ¬ë¥¤å+0ooz¿ñ¥°²b=MFdöò§ä(÷.c$+"ÆÐÓOëÖ#ðê§·@ªüÛQ;³K.s1RJz½2ÆkJ@üsÁ¯>.T)"Û:·½2?ð¶ïç¶ï:òg1[´aàºfÖ®[{«iî+yÆcÕ«#/Â= Ò½òCk³û#8ªi-ð:¤ý¾ÎÀÅOfÌ^Dû-Ô ßÚûçY8oQ8Â¥¸N7Y¤®ªaPÞ¹½<×K[Òíß¤f]ER4TÝ¬¾^´¨Ò*'¨^K¡ÎóàéñY%ö ¡f ÇP/e2Ã£~Îÿ96×Ñ9vë>S ÒN¿f'ëß:°_V%sÐÖ´­ðÌÒ$»éÍK9=}t²ôßsÙ?
ÂQ§°óính<8íJ)¾±Ï!è¶ÂxcÑÁÄÃjË[Åª¤<¶ ÿê¼O3o´c¢·¦wßÚ )u0~X¡/¾S\>)ãkÂYÐözYP® Sæ¼ßN)Ù¢CézÙ¶èÙ\ÃÊ á3ñ2±¯^òºoõñjµëúeñ kÃÜ£ü7{^YzSRÃÝ ÿ[ä4ut«¼äwÑvíä÷Qàs] WÁRÃ¼ÕA!îk$°ÑIÍ$º5¥!=M9 îãöÙxg¹Õ,.B¾êÊÕ^"Jÿ2Üñãé	öÊ!~x0ØásÜÜæNÏÙf\ÜÈB  àd·nãháÕi}Þj¹!0z¼9ç|!òº©fÓÈ=MüMûf(ÛA= ûió¤ôÁ$ùhI'ù"2äôÌ¼á õÌÜÏ3oWîå³Üú ×>!"vß³£U#|T\\b8è"M]ÑÝÊð»µ¼½Ã+»ÉXµ&jÚÝ×bÚí Ø#6ø[CônûHæãQ§Èë÷¹éãØ3+|Y-Ùn»l8p+.fçÀM#ÂË?|ÕGÇ6\2sOMÉä)ÅÄIÅ'ÍLÔ	= bB5Æ_º2ßÒ	´Þ
 ¹1Uæè<-à ô;Æ6ÚEÆE-e1È¥U*ñÜB¸¤§éÎAú]@ç	®ãr¿
niJ·á)òØHùý8£æ	ÜéÈ*ü')Z*è;T±&¹HÆ0²2RÜ3b=}$ÓÈÆ_ÕÜá[*'x¶µ;Ðjª£iÌðê?®ÈÑmhÎiH<bºËª¢4ôoÃuÚ¶a^qíY×ßOié1³y<Lõ{K ûæ·¢ÛiÑÿÖ?«¼X9(D!)×ì?Êêÿ=}T³[4t{ò¢"äpüß~Å) Å»Ë]3ætãýh@Ù&=MóÕuúzÉ4±(Â¶í·[r:F	V-â²ÛùÙ)+?S½;DFp÷Àñÿb¸^Bè¶ÁRÝ ú/AéÖRÝÊý°Q!BeDÍI§ÇPx ¦SpK:ñº X¡	=MiÛ«6déLÞêjNC[×$V]{@(\ÙÉ¾Ñ=MI¿QsoÔg= ðÖ¹=}ÜÖïª4ö=}ÑÐmÖÐ*î("ü;ºNºn)Ð¯ö{K¯ìþ,T½³ë¯w¿ëÇ	ëÙ	ìáNMö ½%t]s0¬%3ZÙñ¢s3Ý*½âWá	æjiÞiÜÝ,ñQx·DòÖÌÚ
ÿðdèÈ¾ºáÉNÿ²TØA¾éysÎ»±éä¶!ñëþtLóÄ~]ÊüSÀDÞO¾ðØ|C!gìItËÒK"AXËknunÔnû¢¡û-GÃïIÑG½ÍåäúY+G¿ÍL£qÌàãã¼õ@Úøõäæ·&¾Iñ,R.³ñ~©-î&Ú	{;®YHÅù ®ÇñãÙÐg:Ô)x?¤ìüX÷)Døó®È=M?æFÈ!¾s÷²W|[pôõ¶ºêÜö¿X£è}É0ÍÆÿà¯tÈ¦-¹0J¬qÂ-ÝDÞÐ¸5îþ£­ý,ì¦Ú¥ÛaÂÿýëµ¡üê¸Ç ýBK¼«µ¢û­2n¢2¸+Ó¼Pò¨ËòªMÏ²0DCd¯¢ËWã íôv.ÏHcXLHý	(ÙÞ-Ï³eú= 	-lCÁô|<ð'¤)¨7-Vó¨¨cÂ\P²?}9×;uü«)	â6%û	âãº¬{î4ÊÖ/k´Dý=}]û	Ë*P]ó¹Ó¸5ñ^*÷oµ\ =}_oÓCM»g= ¦¸ÙÔmU?JzÇ9¬áv=}ÆJs«µlö«Õ83Þ»:0hå¯MC©3ÏkÂ·äH7«ÒÀ©Á3jög¼õ"KØýôèÄü,´õÛvÉp+Rë,t®µâ~õ=}ºÕÞQnbÞbÏ ¢Ä4ã¸ùOßçéHµ¶Æ¡EÉQ>n§àëòáþ"Ô\ÌÕômÛÑy¿Î³çÃª7 ÄLÿ?!\-Ù¢ür*9.3'³Ô1 ÞÕaX·Â¶ð#60Mg£ åGÎ
Õ= «j,¸=}/M¶»}e³Ö÷qU­U,ÏDQ ê±» »( fX1ëF;<cð|LÁc= ñIë£d+?ù{Æ= ÷&= t{·i^Yü&rÌE2&ófpì±Á3#tÙx[Áä0åµq ©ÏÈKâÉ-ï)À)üöú±¤U´nÀË×ÌU¦iÁ·XçÀxÀÝ³X3sÇ5ôc¾GCiÁÙãj*nf³vºÞ0Máû|ÒQmªªýI2ÙéQF0ªjñ3SlFã÷7äS§-íi©wç»~ Ök+hÑµ£,Y~Á+ßÜR=}¢8üýC<·<oü¬.°¦03¾§ÔN@¼øRMCøüT¨EÄé60-ÝÀä8´vÖSópOÌV©ÿkêLà=} êÀ-¹O]	¦AÞx"±¶Rj}qzÕçnNE0	Rhu¤dÒÔëNñÛ÷wf!3äWåSÌFÚë¤:Ø!BËxÔÑô²Yë4í´(Ø*ð=}¢m­ñ"Á(ÒZ,.Ú·&uZ=}e­¦± Ü+m¤DÈ(éTÖ¥s/e rA^,2º¤Ôäôÿ?	¡À0ÿ	äã
óB¦Ý+­÷ÈMJèµíñ76Dzn»·iÄ³|üÖ"òäÏÒ·ÿ»[±Âè¹<Þµ¿ïa;Vì¤âÁdÚãBeºQ¤ÇÅÙÖ¼¨"rð?p&d|ºaü¼l¾¬42©=}?VÀFz¬ÓB\w­ Æk¦²Ül,Ê Ô§¬òk×-ÏÓdÇc/Ð
qê6a]-áx	bþ{¨ÖginÂõúÿbÚ²ìoáÁyÿumµf?%ìb¤ ZùHnù5ôgQ&|vMÙ¡"6³m¹(Òy[£ç;R¾K¼QÚ«îæa§IJ¯².øE2I¥Äñ¶/.FÐ£ 2 ^é(,¼&N,=}5gjW|wÙfb%ë½rTlt.ò.d=M0IÁs.OÔ_;SþÓÉHÞÇ,~þr³¢,«øH¸¢Â©zÙöõÚ®CÛ®"YN7")=}¥4 ±Û³DLÇäúõëÆÙvú8SsÍdhjÃË¹.S<ÃI#ViÒ®°Ã®H²A×Çe<øýùùÓÕ´ø7?p.Íòc:"ü¬o1¼áAUâ>ßîâô1éÖñùmð!24pxn©9À	Û½.Ò:·!.^>)(ËuFyÜ*¸áQÔv@ä¤÷.ÿ§BýÏÄüþ¨?é$BáÊéñNòV¼<yÑ  s§½H*­= NwÅà¨«:¦÷!yk*®§×Ñô~Ñ[brÀÔT4÷c	ðmºÎ+d,MWåxÏ[¦ýa$2QR©àKL70Ëíü|ìyDjìy)YG¦Æ3X7³g¯Mc'¯ÔS#ZJãT<¼[¯Áü5¤g¬²6êCïêsbµ¨VHJm\,ÍCÁêvÑ·U w¡DÎB¸G>?^ÇðSoºé§ÞnD× x&q7zì·#ÆbÏõl´uõr:b÷äC/QÑË$%zN¡uÑ²}ñ.G6êv=}^^Ë©X^aÃþÁ«îÔÏÁ£¢$|­s=Mh¸È½>j º%®³ïû+´?çÃ¯ A¬»2ÚÍ1n²Â=}Y¶ë *pZA;icûê_ X)¿p3¼»ù)Ó£V9Ó=}¼cïEÎuúhEKncîsRöOqÙPTO ùÞìâ®Z%CK4±»e°JÄ= ¿gÖ£âB×NÜ«ÙoB1²G'¢É#.BZ%÷ÅµÁ'ïK>k,@
?[IHìö:â6åP:åªpBKÔ$= 8åIÃáåìryÍOùÁþÝQ@çBÂ~ªèûÙ:¨ë½ZäkN||¢Aá@enVÒlÒ%Q ¹né*K9üE7ã%¡NkTb3üD]%\¢òÎJ¢Aq×vNö!à$ãè:­EÔÈ³ÒèÖÜÓ¹d¦þP.&C.b²¹ZTM½æAm<R¯±¢·ªÉó½*¬rhêßÇÝw;öÿnø26F2>¯Â:oÝÌbAjô8*úÃÖP Ïõ#Þ*6ÜxRÓPÇËð= <zj(a&Ê¹@´ÏÕitOüu=M½°¹ØÑÕr»@k7»qX³ä*WrÏ÷Ø£ªq#*§-c#µ= ª÷Êû½sAw6}ïÛ;SqTTqµ HHºlgÂ¥àB¸|.=M»kÝÜÆÚB¾È	Ï¡GLÐfß8ªÖöÏ¾§¢ìfsêïnÖx¾SÎFfÙ°3Ì3þèHÉYÐ	çÔ ,vr4èV¨,¹>ÄÉl*÷UîkÃö¬=}¢B2+^®Bd6»$|NAXÝI$ÍúMµIZ#UÄap±Íªê´fÂÉso5 48>"Ìlrrx®¸Ï3èõß»vã½D-$÷¯´ùÐE²*BãTe1=M; LtþûBd¤8Osh¤¾ºPîS_¦TnÔÀyØ+ãaíçü°R Öæ£ÒãÉä¶²¿wx·¨Z§ïFüR/Ëh¬¤ìq±ÁR0çÚ:®W{´¬ÀÊC#ÐÖÈL'+{«PkþòsGbMì´EÖi­»~À¨l³ÇvñD= æ0öø10L/©lòÑ(%= ¾ÛäXIÏê*°B©èæ×CMTJ6oÚ:eÄ°¦»g±.W4XótLdó%=M¬37³TíbHÔN4¢k8ðâ2£9Qqíý¢¹Ó4Ðº»; ìÜ½àøðñÂH:4zmblfæh
O]ÚEL£{á(YTcëMFF7|NÍUª8Ï2}*ñ ÂF¹Z°yÞc¤]Õú4ÏøÓ+Ë=M= BÈ{±QÈY ÿË3 ú¡
LÊ~þøÒÍ[*ûçÏ= *ÏØ°=}îüMDíFB0ÊÚ-æ"Á2±¬2Ä¦âÿ$cÁû1
¢hð£mûN3dö23r¬9ñ·0ÿ¯hv;+°Aîãåü»:nvþìæäoQGçÿÒgN«áæ·«
?mfú°k[Ft/Òéç¾rås=}4	ãT´1û*tS|r"!u&gzÊ=M¼R#µâ¶Ö,i©3÷pøpDî6._-©_>ãØ£^<ôÊ·ª;AJ´¯ÂZ_8BÅ#%S/í.e#Js,ül?{E29¥Ì8å±°~J¦ ñÉöd×1©ýùýmEpRñ¡îP¼))?>þÍÎ³/z½µµþùq7÷ZÀ6pCEá^?òKYCß,\ò¤4l©²WvªÔlQ?Ïâa*ÐK#(H8ðkÁ¡5sËd8/wjÌQç=M°îyÖSo=}òOóüöR¤yifëëÝ¯£Á!coÿÈ¦2B!|3¸¥&©«Aðup8ºEðCïÒýñLm/7Å_|¤ÐJ¢YB*%·Z
B½¹Ô~ñ ?P'©ËlAÅZÀå±	S¡RÂÙ©ë§0ÏÓ«ëìd¾µmÒ3<å\ðàÌÄÜ!ÁÆ&;]=M¢nãøú[w¼¥Ã(ltAð±çK»ò½rõó\
	Ê¤F}5±§ªÄ
)³¬wä)ífßzhõ.3ÒDuIôõkG~¦.Ôn²ü´Á b=MiÕðíN¦n%êDIì0´NÜå¥P¡"$ ¹3YVèá:±¦K?«Ò§OGä[a	%úXµÑtÕã^Ä°g´ð¾ìß/§6ný	¢¨1¿(KèÜ3ÕÚb2ô'Ùwa"µÐwµÇuüZ\p¾qZHV÷cÙúãq|ãux'bv;]^ceÜöZÅ¶Æé¡ÙWã¶Ò´ú µëß|òÈxß6e 	rQR¬\ês%à Ã¡õñVM}v¢\k·1;F¤aâÏÑ+¾þÖólU<l [Y{3¸d Wâ´0´ßô5l '9§´±tÜòª®»ÔÊ1rE×Gvµ§eõ¼
OùÍ ¯Sñ ÇggÇðr#W5È<èÐ\eR½ùÙ¨¡hü¼ ]1= ÃÌÔ­£¡[\þh~IÛSçÂ{©snØÖ#4¬¶é(%°÷aÝy­lì¡DúVÑéïÛ¬|qÁ_ÂìKVÚlB#>DíFÎj×§zDMíà·Ú{{ÎdÔP²ÜÑjñ¥èa'|æ6ªjz@Kýr¤jÓÎfËSEDVm&bÒ\(Ã_å¡WïÜèªWL£|×íúÖÆQ=}NkygêEÇÖüÜ³ÔÍÙBZZkm×¿ØÛ¨Ê²ñ!"MØþQb?ÿöDÊPÞ}Ò¦¤nhå8¦ü{0¬^prk¢4î§ÂòbÜØyj/a|yû2¹¶mM®I¾Êäÿ@ aÎ òÌîá~?mÜÓ*£Ø\/¹´ù¾YÌãÃ±*ã¿ÀÉïµc_!?M­N¨>t·VÅ²o=}¼Í¡Îg¼!§rÒ'G=}ÃK .Ç;Î "ØÅ¡ËÒ×Ìå2	«dp¤¶G¾SÚ¡1ôU®¨[eqL*a«p#âºé=}}U±o¸È®ÒÌvôZ:$¹]²AçGFufYðí´a2A­Iz5)g9VèÑ/À\/22Ì®X¢¾¯mymÎ%m5.RR	Ð6Ð&­Þ Û2Ø'|A©rbÏ3û®éÌ­gSñõ ºÆ|;/_×yóZëô0²Joª*5\®^R°F¢;düË§= ·Ô§X¾~ýÈA¥Ìjæc0s½wËyæÈ= õ?©2Hþé6á0éK0)ZÐL¸ÑuûÛj#Ö%qBÎ¦º¿\©ãJW¿©§)gÒdÞâc^?¹>¸ó¶³= ÿX¥bÛ ù?QÉÍ¤2éÈ¼"¶3F22ÇÉÛÃ³âö®Ab#¾²új(¶ìeÎ¥yÀú~mêqùdAÞú±^P*Þ¢È~n{.¢ Q{ØÒÙ"òÑÛ	quy¿q²*×ÑãóÍ+À#¥ân#h¹l¢É¼.-Öº«rný¤XÀÊ½¯$EcíÓY)S÷ôiþoáäØªPª-­²R
t8Hb£\C³ÿ=M¡ù]UÀ=Mbf¯´^ò/®LR±-¦"l\:]dMô#wRÔ® ©=M!q3h_UIhAi	à^þ©égï~&æóc$tÆæjU¥:Ô8½aø8¥ú:°ô¥ÿcoëß(ÿ0TÐ/£â3pÑJ§&º1²K¤jÐRS6nvBÓVÒ(ûÇîý4pÏ«hk/p°gÖÙücÆi»>­±(Xth1ºÓ$p}DÓçå}þ{¯$âu·ÅÏÜ~ÕÏ?¬5PiO Êæø@G©Q)ëªw×I|þv¼gÀð ki£¢äøcDçp-¾Ùj[y"v¶z£ZöJýô×æ;øÀµÓ\¿q!òäPMº[MaB4ñ[db=}SQìRÒÇ^×¢Ç~=Më!
mB%:!Ú×V«KÇÒDGöeS«3Ë\¦$Î*)¸Pæ&ì=MiIé<Âþ.'éÐoïu7ÁÑøëB#t»ÄÇÁ\¹\ä4¦Ëw=} ô1ªXîìØïÊåöKZ=}Mu2]5¬{îI¡þ äÆú¤g_ÛQGö=}=M!ÿÁx?áx^Ñxû¡DºÇlSûKeOE=}4O¸þ/Úî2Ê÷b¥ß×Z+Poôå=}.E7*øºà7[Éé2â¤TYá"lÜPiÀY	ßñ< ÆÞ© Q(=}ÐúcÉ¬ô>"§ ÁOÂÕ©scOxª1âqê4w¡ÌIe«!~Â=M/j"¥WÐdhE]Ù+-¢?¨Ã4 Ù&Z2cÄnÖvÁÖ)l^;= -eáavû8wi2ù¸M>×¬ï½uÏG¯ÒuwÎZoC9:M Îª#VjyÒ¹ýC1JDÀ°CRÅá=}ÄÝaÐ9þÍÝØi)DÐéSk3pÁëÒ;ááq¤yÜ¤LAêíÔJÇn?Ê|gw·5u¡;]Z§çI÷Jàä+ÿéÍwÇÏÅfbÒ¯nEçÛ¹¸¹¼ a:.vNt«Ïîÿ°ÀGïG£»f%ïkÓfp«ï¦ti)Ì:nl~DA/Èü6Z_=M».©W³â-yÆj~Ôã;¤«Æ«¹Gîz¢vAHk§Úê2ALr{-y?°Ukákcöïê"Ïv|ÕÀÔÑeàà~N²¿ý­L<í¦Fí°b#í:xÀç²ýºOÆÍòÛØsýQ÷yÂ¾RäU	ÃÖ)2Îüîq­çp= 	^YðLæÃz£ËE§àQQ¬ÓmEâFÀýL[ä «äs=}áfk¢²°éÞ¹~
hê¥ÓfEÇâ½86ÖèB-'Äýl£l
À2ái{5ìTâ-[~Jä2Åi^+§ºÍút¶2¡äuø¢,r@{kéº"î/<íg§¥¥x= &E aè;T×âó(°×Ò´i=}ÈEëiWX>RþÓÌrYÛ¬ö*ã"½Îâ9¤¦~M"D¼PuÇ.í5Héw·þ\Ú°ñÊÅ©ZxÓWßxÁ= qCãm®R¸*àcõÁ'oÅû-=}×E§ðÖùæÖ}û-û=M?WJù&Ö¶Öù¾ÖûÌüb?WÂ@W"Îü¼~ªñî2³Ëü6×ðµûÌóEÜ¡üÌY]ç¥t6D1RT$ØÜ-WVTûQ:4ÓÖ¶HWx	Äø	:> ­ÙºdíhV:Îø½cÙ#=}B¨ûë;Ç*ÃM§ÇðBoV7Öª@QþE¦ÀÂÎc­~£_QQØñþµ¦1w©.ßê_=}ÈcQQÄN¨scÄn©=}§OÍðNã-´_(întH@Îúb¶úZÛwIÌúþ<ÎÛlëQ½wcÖChgøü:\æXoG_<e0,üïÏ+Ve¬;z¹ïÛD¿Æ|g¢µm¹á
Q°ò²´Ú
(<¨õp-b]®(^nX#ö×µ´åÿÝsõ»ÀëÔ#QÏ]Í¢ûI·;°B*Ú¤Rdø.%fìÿhpÿì:,1¢ªo´ÔNÀ;a®¡pQ.¡l&¨É-18àW©NJ _À®:ï»^³ï-inZï3¢§MC£ÃêlÉ»ÀßèÌ»4ÒR½ûlæ?Ã¡ ¢«°ÃãLù-y8o(a'u+·£ÊLéÍ­Î^ç	UbÛj7À'yV»1ÛññWmQQzt\ðÍçÓr~ÉñO¦ó7öëè#òÄ	ë¹= ¨p!O70ð1åV|Úÿ42u©QÈ,üæ¶FÈi5ÍcïàxtåUúDæ^= ¦ «4Æ®(§Ù´¯9ah¤v^Kõz*üÚbª¿­þ+Ae_÷= NÄyþ ®·Òp«Fà¡øÜÆÐè/¯}Ãú¥mà·=}CiÐ(aÍ{´kÿ/Ò
.ñùö«C:DEN\ú$ÿutË©]èÎãÁ¨wñÊ^fÐ±TVÈ$ÌEFkÞ#ÿ»ÂV5ZèùÈ$·´jU½QÇÀöW«ÞBàBQ¬ª^¦7í? ð=}'ã,3¸Ú³ÆË¥»= n¢ÜRRB¶48p±ñZó@ÏG±XvÀ½¶=}'gßäa-ÌÓèÈpö^3ÝT®]Ä%!&ô!pY= Y ÁüCv¯»x{0äûnÊµÆAúäO4­Z¬|zÏ ì£­wlZ¶uV[ê~kÉîôäC¹n5çÐô*DQ¾óùî# ~zìê0éev×¨O+vlà§éºóç
}ãa#´5}øÂ£þ3\Â½¯=MJÜÉ0å#DåOéà_@;/[ræS*%ËgKq×X§L% LdÐà8×4®ÎÈç[Î0×S×ªhÙÞë¸¹
ÉÈ7u§mÐûö¹+ÕÄc:ÿHRã,³K~noÖ¦4(GÏe:Þîa»iXYïÀ9Û1"9¸Y>KíÕL"=M.]Ú¾@±¶öVrNF+·Tb£@mÖ[íÜ\»Á^^ý= «¿ÈHuùÅ¼­u@EþG·ZqÚPýÖc\(pªýs©ÝÑ_­c*3Ü})%úP®]
s2 ÈG= AÝ¦ãé]Áê­3zPPý(ÏL7²êÖ±1)úðC=M¯BíÚ#,_NZXàÔÐ#®ÌLé}V1\.s@ó³×8ºÜH+ª§ÿ¡ÐxSä^ÈÜûû¨ï FÕ7^
úPäaìÿ32à½)ÖÃMµb¿Pz 3íÐ°|=}wcU1+-£§]:Þ8héðltg><9ç*]H]!wpðoã2nña^Áèz¢zï$©7J	ÇxüäÍSá_s´È.S]= x=}= õâßHV/z,L©ðrk<±íø²®ÉVÕ¥¨±ùþì´nÅ ºþb¼ãá»ê½}¢I£¤Î7«ê8ëeÿêk_Â¡>p iBq?9êµ«Öº.°Íôt­èK	nîuÍFç5ú ´ò(>ç1f·(Dµ¹{_#Ä<ÐÆnBcC?Gh;Ï«¨ºÕâP|³RéFwÓZöOå¼ØñéX¥Ë¾Ä~	}ºÓ6¦èÝdXzn¶T¥Ò-Lç¼l£gàMÛìµb"2BÎ£>ÃÓmaÛÎ#ósj=}³Ö´«ó
Æ$¬k©@¿N¤Ö%U~ÜZ= X	þ5þoªê¥M|ADÙe{\p¹Ñ7J
ÇJZÃtÃ3%YW°Nvk§thÝ 	ô^kÄ¡wsµ$
mLMs6#A0KqvÉlâ¼í´¹\ß0ìø
ÖGØàiòßaGcì?[D-Hæ_
ðd©Pþæýµ|Ø×gkEAY'Wk±-¢¨vj ±0²¡(²¦Fªª®*°¨ep=}ýe°Ò[eóPÙGJj[¾tÖ]Mbõp¥)ëêqt%g%Ú+[ª¤EßBbð~~|oø×kìyhv¤8Õ.0üÆ~ÍWÿÆ!=M¥¸Fí-õlJ
d!=M!ÍCJ~ÉÎ?RÓËJéÖjÆ)wÅ/û3ub>á·Æ×«ì7ÅØÉ)y/SgýWFPiÿ}åÜÍ¾)xjy$½®RÉáä>_û§¨À¾~q·ÔÛùUmk!Ð¤WÀð¼ËO·l?Ð©õºDJíKíKéz¿¢ÙÍZÉÇsn¯,0VqÉ­º]Ø!P5ûëvù3_´5÷ ïIõ»P!kÝÍ&[Q ëF¥I§²à@nÊeZJÁJK 1%|(;!ê}#¶è(°=}$ØÍ0Iföe·.xOóIê®WS@cËêvú]'g«4øAPÝ5I\vóð¡.èÊEkÙÙZJ%Æ
»¼w/ì[S«KC÷'©=Mj§NÃpe^nf~	at_ËîGÚ¼@gØÌYV¸.ph/8ä"ÆÂw§ðôãø@=M= N¹	«pº#Pv$ÝUæ=}Ã»* Ga.jQ6¨f9¥{	¸[/½eãÜ§Ã¾ôº¼	ËÅ´Jo¬+i¶ÑbZ2Ê.¢Éü'ß´k}x;,D}#váð)åzáûúçfÊØ­èPëÃÅ´xÎî[]@ç³_±]ro¶2ç%­@l3ôs
¯nµÃÙ£Ú_XhjétË/ùÇêüIGðQøóÇá LXå¥|0AET£¼ wçÐzÐxzM>DxÛ*k°= ù¢Oã=}E¾óg¾Lüo£ïÕPì1!Ï	éT¼@8~Ë®-àÊxÙBK(~fpMåjDçÐ¬hw b>V5Ø?AÁU:aî3DKðX·Ð¨d§©WÏ2~|hÉQË
WW1Ù4P:]= 4MÜ¬<wÆIÕÀ®5­¸ÛÒ9Ù¹ç{á*43¼£ïÜX4Í¡êÇÄðX×Ç(ZÔ.û¤3Zð¸^¬5jòbW«ëö;ÀÇ¤÷ééúó	ë°SåÄèC¬gAlû8W«Ø(lÙfÉàIK/8^"¸oØq9Âääóðd#vðkløiKü¤ÌPÏW²À±É¯16òaþJU%þjÅd{³|¯ýâ6­"²Òs­UtÃÑn|<ckÈæ\íâ¥ºqì¦6TP7xahQAøU«:Gï/T+Ý-eræ\m~aÓ/ÐK»TÕmNèÞ½þã/Zk¡!ÿ¥ÍùJCi]¥´¥=Mê	j©©Ä}]^¯[ÙFE	.f	d+ñi¹}]pùÞ;° °2(\HkPn1M= nñqþAhñ5$õ¦Ö³ü ¨­ñvªÄ}vV»"õ5»2ÏEDX	.MÜVWNd$L]¿Ï&½QÔY÷ÆÇhsáFlÞ=MZè§ø"+6ß5èIôi
ÅÏ°½v0è¨ïbãÀ^!±CKSûYç!ÈEüÎ'% Tgçþy°â	SÁog?í=}íU_yï8@[ËZãKToDÇÕïJc=M-Aê?ñú¶D.^wðeHoZÝß9êï)*8n9(9üéP¾Ütå=},= _¦Þ°:=MÅ~eÏðèÒ¼>*ë°KY³)l­Ä.wÑ.£¤IØ{k§uù)à²óôma\í@üÅÏfáóÍ:#Dfä2ÜH{ª}ÑäN=Méô'P8ì1ý?j~Áß'TùQjæó¨·E|¹,u1Ajx©Í©xk3eåhÖ.×·æþä£û>.dqº{¸V"D]´Ïcpú<Ø$¾Ün4¥Íþ	òÃ	òÓî¹QÐdÒù®I,äÓÉCkMÐ>T¾-dëñA'{UµôÎÑ^¤l4_ÒÔVuÑd<ÉfWÿ´&¹ù-ç{LÞ°;øfÖÑ3ÈtÙw;®þ¬ñÊð)¢°|æßzäZùÓIYÌBU©Òh.¡°&^| nÅú*èhÓúíÎÞä#2A.wãïÝG¤D.ò²¦òRÌK½B[e­Äj¬z8Ï\Ò»ÅG»¤ OÂB³ß¿où4ìµÒÀt£ªÖ¡ïýse-ºP1¨í,¨áí¨!hzð!@AÅé{tD*) P©{ap¾c*n©Ñîf"r;²÷©Ö½@ÌÌP\Ñfj
M[b&HVB>#Rh$Qg|%xWó¹àï¯ÈsViy<¨Ù+¿+ò]éy§5±!3¡rÅ§Ò×7)_5ùS ³|ÎV¥Ñ§½DqÌ©ö
?~êS(ôð©zaSÝªö¡~õQ@#)Ù!*<Iîe{íÓþÑ©ø);½ÄçIttP¾àaqaú­{1¶òÃîº³/4q«õSüÉ3®.×Ï³_Þþf(@z®OâÊ. êh®!×dzÈö7cu
gÛ_(gh4­ÝkÍpÇc@Pòhµ'öEA <´<i¸Üã±ûhV1Ôo%þùG¶:·¯üh_÷Æ¿î
|ºÙ´^N/°iR üht!ªq#?ÝO¨fº´ú^@óVäX¶¡ºatÖ'uø¼®ÓÄy»dÆÑ~Ö_M·L¥a,§(E¨ÀÏ0ùNîHÐ´pj6y¥f¤(è7!ºoÊ-¾@ØõÀï)¢¥1JémÑÚÉ¥E»_Ü>=MÜ ²Ï9ìUTÔ4ü¤´Ã.fë1,>M¹ÙË¯4WGêñ ÛÝßÒXm%çR7{öqc¼R^Ñõ=}ÁÙÌÆÎº¯¨ÎÏAòF'w@&ø¬õHn¤7pPí¦ØSÉp¡x"]ë]Ï^æ ~ïÆ½Bóó#êj¤t­L¸¹+Yðæ£êª¦:K¯Ý.SÿÎn]Bï¯¦dùVi:WC¼ÍÌ§[ðY£Z[7òÉ9©pQ-kr=Ma	èÓÙ¯(Q ªÇÝç¶G¢ÑVÒ±0j-g<Ùü&´§¿îiZF÷Û«îâÍ}çÃ¸À8{×¥<=}K+Þ0ãO¦üek^?o^äáéF9èZñ(g¨hÐ{)T(>Û¬YÆÉ m,XL[Ï:ßfßõP,Ée¨çÂshµfJÅ@iÑý´ \÷IqÌËô3M¶ÏèºÑnCÐÐ.{é9¿½;ö£C±g,ÓPz¶=M¶qÇjðþO;fj4¸¶ëÞl­L¶'ó\ÔÑÌïwî½sæåK3µÓ¥ðÆ³HÕÀÜ%´3ÛWkW= Ð¾BoD\4l|¹CIüGÀÍÕf ò&IÂÐMN>OÛ vxYt¤×xæb5Ú"ÏÖkWàþâwÆ_îä±$:dyW4Yw» nh=Mõvúþcç?ç%ò¯Ô(çà¦ä¸£_Ñ3(Wd	d{Â:ÀÁ\tàqÝCµÈI¬¾û»Åý3Ë-Ï""I¥oqÌ+M4O²IêèîPAMèÌdÁ=};ÙÈz=My7³&sîì½©â_(!¿PÎÖ
X?½¥()HX(=}Ì°VR8£rÝ8ð c*æßæÖ§/r¥ë£5=}Á4ykÉG¼ìPõ8¢&(:·IÐd÷ðÎ5èô¿çHòVHYâ¨ÄÊ¿6ýöø÷ø¥j0[	÷°àîe¥T;;&¸;­]:³ï ß¶ú´É|%K ü¶ïë}8,Nº¦Üez
	¡ÞØ¡/ËÉY]¯¿7Ú»;yv(¬Ðn5BÝfÙÞ°ðw§VÂé=}~é¬
¡ó4Ñ= ­zíJÞ¦«}{îÑ	"ôssâóÔA_àí<±4ruÇX­m= îYî^¬©;*¬êÚ68bJdÕ·F^´Ä2OºaÝ×¶Pã§]:[Ô·@2Ú\©vZ1´6ÇZâ¥V¢9s,;ü?«ÜÙ{1L. ì£Îre¦m}÷e3dFÐTöíJÛ6ªµ<XN:,ðå©X@ð·7ùç¬²N3Ùî!©½,yÂÃÿ¾ÅS'Å·Öi¡|C«66ýó
ØxÈÅufçXbÌ_JKÎöÖ@ðjÍÌ6à7ÅÜ®Ø³aê¥ºÑ ¯DÔ(Fµi	´oËÂ¿¬!5cYæ³ÍH±;UvPfÆ)0È¬^ñDX56WÝ×ð®ldõàþJ%_ü%´ Ð¬Âr@ÌrBÛ)Ä £ =MºÖ¤åMÃ­EpâEIÛyàbÞ{v'SÑ)IgG"¶2°¬bé@IX5;$áäý= »çÏÖJ:%n?,:Ü-÷iéôæ ú$Õâ¾ Y-yÇpXçî)¶ê½1SÚ1$á]í-!÷×à;ÍNÝÂ0Qr@¥³mye1õ0l«OX¥PËçÏrYÈPß¬=}xD{£¢+ÿ_mlÆaºµAÆ?¹hBÏq§in
êÊ¶= nkÕ¸d¡ñ§ù0ù/HdMýQkuÛËµ¬WèJõ¸£±Áë8;LÜjÇº	ÆðÂð$×XQ$F= È!ßö1äº+ó_½[¾HWá~e=}=M/çì×tøzZßÊ§0Fèõ&5oôôP÷%ä±¼P »pÀ{
Z5¶!aùÛpz9­NÀ£4ÑlQ<ÌÒÔhÁüú)v÷ßl40e:g¹%Ü¨éÏ÷å$+jë­V72Z³òd13Y"pF.oä·>³È%øhh4n"cÂ´Aè¨®Hj@íØUGÝªý·Ô"c+á\Ô*Ni@_aiê@=M¶	jî'øj3°jËñ¡9)e(d¹Ë]çùÒÍÖ\ó¬ºz6ºkzÃnJ:»Òø@£äÉÄPºÜ:³*Ö$£ª#RÞë)= 6ò9ÅûËK+Àzc_ÓIÜYZÀ(W¨oè0LH³ºLÖÃðeÎ£é/îé­bJh¹§½èýõ5eçj|[ <\©k§Â= [òúõ»0i6?/*SxÍË5fíÔ«ãM©{@§°ÅkîS Uf¢z[K(Ð¢©At©9~QéF÷Ú9ÆõY(Ï×µ·Ð^b¾àÔNOGÙ©imùH¸kw*¶¤*åk­	]Ï*éM\F¡=}/³,B*\ü9ç ÛÙïIÁmL$+¼Ôû;ÛÛì&eÙeíëæ)sî9R'AjÝs'¯\T]H	t6ÌRUê@Àp ¹r= Â[Øâz|+6ØÂÂeý¶öc¶:7,X-àPèÞ
díEÈO:ýõXIm÷ìc¹¹DäÐ³
DÞºµ
gôCûãctø|þË,Þ(ÔÒ= ÛêñÉÔ­¦Ã°Ü^Â=}4èéìzµÕ6Ò@àZËÀc{eMªåÙ&ÌÆÎËøÂÞ)s\GÊÝ_½ÝbÁ¬&æl]©Ù(Ë*ë¶E\Ål¼S(¯(~DåEX,¦M:Ä7Òbw÷VMXæäD"Ã÷÷éM	ùDwwÁÖ¥£ü¹ûÒÈÞ"Í¼{óY= ÿx¢£ý/í$wv!$¸àÕÖdâV$pTqKµàþH(}_X	9D&b¿ïNZD«ÌÖr9ïH³)ÀAâþØ9A¸ á7;çß9)KÍãØy.Û'Ï_a+ê{	##¿¢·ÔRGpíöÙ÷!¼py5GÇ¥Ýã ×3&Õ´"Î±Ó8×£¹#¹¼mOÚáÇ!Ð:¬/n[ÁßQ¨­eürÙÁbFvnÈA¼÷yåädÝ¿à9ÌêÏåË¶æÜ·åÏ:Bk© ûvBx«P´µ×°gÃ+ËYÿ&SêëôÄÑ#dÁmj3Õø´¸oXÔÇí¦1,é(ÿÛðñ¾?³3Ö#\5>Úíæ=MzÔp5¯u^ S8-i|_-­[Ñp=}GEí% w ÓÙég?WnKfÈ[{_ t/)k¾ðá¾Îÿò	BúRRÉ}Ãü
Û¥bj'µ]ÍgK-ÚíÃºå\Í°1{[ötnÑÙ2M´Ë&ßªëã=M[í×þë¶FÔ
Ãaóâ:ªé{»ÈK9s£V2e9Ua
{ Km­ÄjúQëi 	= æ®*ËÝ­¤³¯ÝØWl»¡ûØ#_®yÐ¿½ËÇ)[¿Eµ»ß.(\BÂ@Ï´­°ûlý¸qDÈs6J5c4¶Ð¾f&MT:ï9#×}l)+9ãÎ1Ô7@=M´PaÐÉiQóvï£÷ð÷AÕðÊû!Ðç÷7JDu$û»£'5CvçÚÌ¥ZÔXkYXxxÈ½kVy1Ê95~ß;ykI£\¯Pm5L-ùþ«2æ?bð7EV¡­iwæUâÐa?geüíµê	áVçúeØÐ:é#Kû°a>VgQ'%±.)lÈ+Þ2ÒtTXù¶Ø¡nÒúæH´M¢Fõ>¨áÉó2k VÁªNvõÑG§Ñ7à[!oô&«°E¤ü+¨Éõ\dôû}}ömzo(á®_°ä«. 
=M_Ñ°Ôc¤ÀNåMø°c1Kìó #µx6qKZ(-üf  ÷Lñ·[VâÒ_ÇnY=}þd»Ú6ÑèOKÉ5ïùi· ë«C0ÞON9¨ållv{q'>2tºÒÍ	hð§ kðP*ù"´z¨~£î#umÿhx]bfÁíÍRl6«_Âvæ\#GM«ùÞù©m$¨ùþ ÀË7þÎÊNòõñ= [K(b= <@D@¥bÑÈn4+¯Þ~-çD å2Zròt	üÊA;ªL³Æí0Z= Í«d= P)vf !dhã*oQ<Â:/aa<$Ì?ó3RõåN)´¸ûÌöKüÕZ ±À= ê½¬AR[îö0f	«G¼kY(uÚDd°ÝÊy³ÍhÑr(Z¡Fpä3­;ëÍoíJN¼00)º\RËJò¿EhmÀ{ ¶)æez_(ü= be5Yá aócdbjTDÀÐÚ]ö®Ý,Lm(R:Wô¯O©xöN ÓFºzß¢ú BÇNl³ ®×m]_^?ìlF$"¤Â¯ïìWê*¶/= Býçl$b*Æpìÿ09<]V¡$[l+.Vð»0ËöÃWa.B¡úÝ§òaaDÐgÒà3.:9C¶[¿d1ì.y¡!Mp¸ÆZ6v4cà²í¢YlïD5m¨#6õ_ñH"ÃiîNùïÎÞ~H+ÁJ¦öGhêÝòJ£ä«!Ë-B9õQ^jxzÖSþ©Ñ_R­òâZHjCR-¨íOàÔ´Öªäïû~ !3tvº Ëmb½¨»0£pPqhÃPemAÁ?ÝÝ~KurJjDB@±µý(ÐÍçOáéïWE@?Ä¯¾= ôs(Øõ£$P(hªz½XóCs,fú9Ñ<Ñò1#|Ú= ÔÙhß«amÛÝcz¤~³I®tèiÁ,:7÷h?a)*Úv·Oá0ÜZéÚÛ.nÀudü¼´]ÒdÞÌóÃêMMMÙfë»6C»ø ýÄà¨ädþZÂ5PJÖ¦Ãmüæ#­.oÁvõN÷Ú|s±ù½©²ºêm;W¿'ï>7~ArG.£ûáwö0uÒWorÏó¡çP¾»á¸Ä)Ð#*kvÞoQ´%pGíUÝUø´n&q§aè:î,&ýÝúzIØç¦KæSeÍA{WÑ´Øåã$sãPOITûKFÔ'ÒÁêªvv£r%ÊT£)/æßrv2êòc²i*dæ8áÐçñÎò­ßü«Qî±!¬Tì°:ôgñÒtÌX«³ÊÂC¼mïcQ<óÈt	nÛvóÀðtÓÚ¾8ÐÃªG¨-¾ý¶ñØ¾üB|Ñº¢M9\¡.rK(g­¾ÍúÜ ¿$º+Aó4»È)TÊnm8G©xcÚtý¼âó*~´	zÝdàro"¸¯Þ©= ´º.]ººë=}_$t+4Ð+.Ï_þ)> ¨!¯	VIÄ?lö9xÜCM]ÞqY $T\N¥Ð<&hëôv.*âÑ3_ ®}ª>¹çsrnécY.¾ª= f®ÔçFÆÝO6Ú]wB£0éÎGî½öà/®tº÷n4ú¨ò¿¤nØÛ¢å8 Ü$£¼@¼òdn+R:îÜP"iH¡fÿMîÍÑïÖX*ÐRy5À³Á·ÉÒ^xyQsè	Ä©´ÏúË×øÓ3o.övÜ®{â}	¨L©åu#ò¦ºoÄò5êËr²a=MÐ½ð8e»9ðJ§wZ%¾+uC &>±:ÞµCp¦Á*" 2ÈXANÔV¤¸·æ6S2¨úù^Ø"?/Bñß,¹ª|óyï»JEõLVá5§àÊÏMZÈçÈ{xº§îø_b1%-@³ãQj45ëµ
S.Ü]XPÝò^d]Cä)ûeÂwn\½p.áÇÀ!N= ´½Zøm5töF¯lB¼{R;³Y®T³eÊÅ÷Û	ß°þ~3É ïQ©m$G5Á4öÍSã)Þæç.R½ÀÓZ3R4;³øãäôæ¡Õ{ê¢/ûDÂàáóJWh´*%Wr!1â©-~·@¥ë¨Wp)×g¶Û¢!³¸CpÉ:çªÔXaJãÊ/.)Q~÷¢âl n7?]Ûãq´JÃ3móµzSXç+V¹xßÐR ¬[ÿùwi*o£è"~¡¾ÕÙq3ÝUï¹yF²Æ»¼#= \¡Éü^¨hQ_|K$K"ó×D\ÖhÖ¸Ãa´ÇsÎxJú$§-4Âs©ëcô3­úÔÈpu¢yzmì¬kÑi,ÃÐ!$µk>R{"Pçè,=M 3Oròì{
¯X};Oý(vÿÎÂN ¬,Kûñ§GBÄ¬W#¶L¥ðÏQu*Á·M>ñ:Rª$¡Í=d{8éÀÒúu"Ã®ðy	{{ä=M¯W!¢ðëß	£ä­²2§ª#ô§ê1²ú2ÚÌÊj4<ÓñÁõH³åÖr0  ´â[é*P¶ü¤òJ8§Ü¦È¸âîòZX;ZË^>°°4Î)n¹¬æ]Þ§(ìR#(iWÎVâÑðó£×ÄEjàj¯ÌÄõòJ{«&EÜOõVÊ"iÃÆÆÍò51¿Y¼¸³Öj¥¸K^pvÍ¡qHåVQ¶·'T}ª±Â {1ù£= ®wÜ/å@àÔâJ×. ±h¬§4¤Àç >¨9 snï	6%po=MëÄÆ3¨Â´¢ÍKñ"!p$¤2*¤lÍy9[*v¦Þ~²Ö¯l~©­"Nû|.²°
¢p*ÒxhÃ01ªn¡ó£:Rrp âýcÑæWr«½|RÞ=}.r§2Ú)0¾§^¨bv¢Uq  ú@®µ5²	h¸Bô6¦MC,ImØÖÎxÁjóúþ¢ú {J¿[Ã·çà!~¿4CÌ/³Ôë{uÞ+=M1]%!pß°= ×·qr KzcTNwa4gVÊ)X¾ètCªî8ÇÙúºRóËu-Qªþg7Ò=M¤ëÚÛ·ÏØ¦J<tìì1¸\½k·*tz<=MåùZbø)CÙò*:m ~ÁóÀ±És}0yêÍ}Ý´bPÁ%tVÿ,æy-Ùë¹mí:¼½(jÓ$ /×R×ËÎb¹?u~Xé»6	"ü§ô8õ«\=MºÃyHÈ¬ôk¸õ«û+,Î:QF¦ÝÚ)ØYõ|ôXxaxÍÃÑ$A¼ÒÆªW9ÙGÃñbÓ^mOU9«Tl³,f
@¶= Íø1èYq!¿ÝîmÒ¿kQ,Hb
:à®Ü"oå/>),gUjtGNlzø\ñu«<ÝÉZ^×O;ÚßÅwßùÅ0äzX1,:=}ÐxZÄÛn µ|¥õæ;¼Q.ñÚþ×ß¸ÓqW·W/êo	q>J.8ýÙ]4'Ø'²Ï'ª_â+7íÆ¯ÝçEÀÌ>¥ÿ=M¤_ zï9õ§ÿÀ´U©
9Bð¾ç³0ÔGp\©ÑPð*<é©ZHµÇáIë×)©o¶¥ÌºµG0õøüÐ)úßÕÏ1ZS %I%øeûã j×B¿iWQ¨o¬²-â)gÄÀA?Ð´¸i:{*(ÍÔxBøå´sài)ß9}ßN
¨s¾		Âä6\rr¤òTfì1ã¸9w¦VÍ$íL?à>ìcãÜA3¸Fô~ÕìvýZýóe«»U¶óVÔ@5ûôrÉïÜa^ÕrL.l
$ÏÃôIc2á2ñgüÅ*¿Ï¼Ze¼ªrÄ/OWKÝx%$=}>2B!@1Ê­ºí%Ù9¢¬ã(i)N.aLùrÒàV]ßÌQN¸|ä±³pÅ¨-Å¬ÇBÛæw í×ï= j{¢÷å4M§2SQX¼Ò[î%Þ¸­½u5]÷¾ãåûmCl-	¡âôV;mÐ±1çÀ_Ùk¡ê Þy OüF}gêAb}U¯µbyeÉaòFBñûñJX¢;[]= 3
°Uy*ÀËÓ®(rÌ@^Íû
ñ­Ñø=M.âÜ¡ÛciÍÖJa8%ÈkïÂ×õ¸>YY/Ö¶tkR§y!sÙjÇ%hï¢d7·
ÐÇì¤þÚmu¦5î) b|T^SÁ»y_M6EVüzØTÐ½)P?}úáÉ1@°'Xà³æ;6×½þ¯á¡?eÔ¥o¢^nÚÞ/å[Yú¦;,5Êë¢T£ÆâØù¦«óÐ$xaª4Ô/þç®ÿ;¾ã{0/qL'9^¥p®5öÆîÄ_c9[PµNI¾Ç\»¼ãÔrC_a{r.áÑç­î½S²ÖÊë¯æ ÒÖéÛÿÎax¿÷MffP-"$¬Y´4ITâùï eYFAk÷Jþ÷H·H*äÉø,ýË:És= Z¿?Æ	:~=MÙí@aó9;®P4¹1áZ=}ö|ïó ~FÊà@-V7pÓ?gû)VÃx¢×ÎB×l3ýycUÖ:70îÓ>:Á=M*$1¼î«W?lyIëFâSi·á¢_zÞºîh[Ê±f%XÍì%Ý#Ki'Õ9ÕöRY¸û²a!ìØÒ0dß5äýö÷¿³(}ôuiÂàUËjÞ¦l{Z³É<ÓìW
k0_þüÍS/8YDiqÙÈUÈkL5ÌBüDßè9U9Ü©§¸(9\L[äß6B¶yKdtcÿ·våOLÛËIÔØ!9O¥µjáÇXéàqØ<s*!äy<ÿü(}õ¤°äåuOûHgjÖôå Hx«Ë
ÅQÌDÒÈTüÆFYJá ûùìæõmpÏÕü7×!ËQ#Àãï ËQËQ5ÞãïÀ¿<äËÑîv+ÏËa?ËÑîvwø9Ë&¼v#£$Îà¾¶rÂX\¯7Ë~9ª"	¹LÎÞ¹ÊÐ7o·ÝÒtL_ Ò aõøA%Öì.Ñ¹ÕÒálß±[b|¸æmDäÄQ_9ÎÅ#,õdj¢s[Ó_(QóxgTf2}R+°Pozã°Lj#­éV±?±£(ù})Þñ¹¬nÍ/rÌ/¨(ÞÚ9#Få²[Eäq0.Ï¹{*¿ÙÄtqgv_íÔ^©!h4ÓØ«GH/NSeSs¤¥êo±"hwû¿tr?«Z¤Í>.Ç[ð÷k8j%j,a=Mè~h­Ä8úG pe>iYý{@ÿÛ©ß
	=M2Ë¡Ú ÒâÏC$ì¡Ñ&x¶&·ÑË¿ßVÌÁó¬Åý:H0JBÎÈl1îo,xq°^Y{Ô#ÅÄÔ0B^í=}W{­Ãñ¥¸QàÜ%y¥¸QÂMdBæÆÚµÜ"~ÑH4&oZqq~øðVMÕ{WÀw¶qÀÉúxU+ËOßWro=M6¢í!Ò­cxn) Ïc+>_C1f+Æy$±×ç5Xå¢	',Wð­÷w¤dÔüH«ëÃò«U¬Ï÷xU¨½z¨W«H+¢80l}ýãxhÈÿµEÆ	Ú!r§­;*Þñ£­ÅÚ¿ºþ= áEÝðâ¯|+¹t_8<&I]é¤¢&=M&P¶GAºnÚRTöÇìAEÇx,÷µåmÁ=M;dæ6;'_u}Ãi]âxÑ¥gõd3îd,pRè¨ñíú³_z:3ly­sc®Q¦Ëuf?°éGDNCRcz]0Q[_:'AËuGtM[ëaç®Ãd9b ÜðY&n&ÞåNV	:º-©L­ÄZ©ÜÈ®YG =M>"m8ÒÞÙÕêêpù=  :Îí?ë«	03ÊD2õ´ºÇÒoÛÍýs4oWôuå"_@°mUfÂÿ[ª^§<ÀÎÛÈ)£l-Û­Æî¨&{Ve= 7,Æ®?Ï¦{¤i(M£ #!ÎC?Ò^PÑ6ûeÝ¤HÄ"f¼vÊµkRq_@ß6¥µyYXz!øHÙí §^½.S|4EQ=MÀQÑd^*= b°¿û0nÊVI¤¦m>¨ÔþÌzúwÂË$ØmÐ#ÝiÔü E0¸³þK,£t6M}æSüê<Ê×©DÑu?u±>´n1agÔ¯edº ¾Q bâaÝî×ÁGzù íî}Íx¿8/ó_D¿èÕk;aµ*6B
Úå>  _q-.¤ ää/(ð?Ê]àpìFûç~ ãv»	XC
-ÐÕ[l	ÜÝßô± ¨iv!Huº6Ð£í^0¶fôþ=}mgl«
n¹"ÝÊ®Pq¢U¥¾èÀ_xÔëop[ß¤0½PÕ60UUl=}oXw
=}°n{^ÆÓý;K6[¾"¨\´"ë¸M¹ÞÔnýT¶ö¸¼¹¦Èc½Û´Áø-óÒÈÏ¿úRuýkù\aøïï§c:qyNQT¨= ^ yÄª«0Ø¥]ÍkÏX#]½Ûw÷à¹ÖPó	^ñ¡ ]"#
ÅÍÄ³öVù¶ õÆo±0VF3§ý¼ïç6Án= ýs)³çüÅøÙªaÓ¼à©=}>¨ ÊNDË=M¤ný )RÐeVO§©}QSüìFøi^1.Ñkçäeë_Î¥[¹n!h KbxzÃ-;TºËí÷Ö)ðWË<Üg{ê'Àì£-Eö]9áVû7ðÛ%"³Õ$= 0ô=}SnYÔ­ËóÁÄ÷Ì-zDöR*íQÎ8èÂ°úÖm¶ëGµí>b6ÇiýÒ7Eñ+nÇw dËªô±-Ç(á?u|°aózzÐíàÿhÜÁ®o2ç
ô&hÖ°b)äðûRLêþDÝHhçR¢h\êr¥9+¼Å´î>ÂySÄêI¨GS'Z¡ñ£
i/ÂL tÕë±VÁàU)MðviiãèAX¦U¬pV86)I0Eñ­j­kJ-!ÐOLÎ]Úúî"á²ôi£|O.¦CA=M.b'ÏÜêÑ= ÿê246.Ï|ÃC%´Åì­H|¨Ú¡³Ä¢UþV\*oFÓåOr©o0ð¹ãÇÑ['}Õ¶r/T?ÑQÃûå© j{B¼þUÛ,}fêÞOØbª¨3ô?è÷á1{V'Þè²ã= ê|OXâ(}}CÏÐ.ûOÞICT¤~³¦áó¿&Ö]À¥E.+ñÇÇ!¹ÎNÞh=MO^=Mzx¢Ta8åb6²Ú&â|E2öG{û5ô <vkoZàï®ì7ëåîÀ³ôtþãH6j#Eù-Y3)¾¸ë3?´ÓÒ<dj¨½=Mä>]ã½åN*lì=}/Zý:û(ÿÚ"Ed\÷åÅAD#ËÄäÎNýÞí}VØVQíì¥ðªkäÄ!)µÎ©Ë³Z]?\lLÚúÏüî;ü¿L«ÜÙ;5<ø¥£µJ, ºvs è=}(mØW4åÈáuþÏ(Ò}©oØ°ã=MhYÒÛÈbµ*ÙTÂU½GùARèQBöjñ
hvlöw-9Ú|l
±¬û¹ R
ºÄPÿgg~Bî[Y'ÄÍG¨ì]×7ÒNùJÝPgö:½ÌP(ë»6¶CÀþZpuzW=Mf>0H-L¾Di a²x-È^Ä+&d6dÀ(-~>(¹gJ8ÐÆ^ÑÐÞA¸ýrioÎc{ÛÑo´þ¼g£¹ßÞÕ_we*Ä>ÖOvbþów%seïI(-¶I ÓàPÉL@C :É]uÁîê¨¾X5<È®d·Ò.#±l;ïGÚP4ÿ&í<Í+ÉPY]_d*ä>@xßf{ÃñýHøÏ¡èÙÈ$wªu¶_A&6QÅÑPÉªzÅç«täS¯£¡6r¢±ñ°åiþc ¨àôèàëü,X=}Ñ r£$Xç%¦ÇºÜPOðÇøñVvØ!÷ÚZF%!÷Cf N~T=M0dhTzÂ_0d!®!ûJP¬×êZj&d¡+¤ü8ºqÎcçâÚÿdõîxÄøßlcs|ÊdÇ>-J¾¾OïI¡ÕI/Äþäv¶>ÁzHºgä»¤<sk=}BbEbx$¹@þ¢T=M,¾IË°ó1©åðºSôàéÝ÷V\[*<±L®ÜW¶Êÿ¾õc±Ò.©èn÷9RÉ-JCOQ|4R@4 Ã*ðÒ»®ë=M6x;~[ô3É=}k£w
äQÚÊô6\l>Ý]ä=}¯kÍä"éíjä9þ°ºÝPÙ¦ZYqîÍðôÈ¡ÖR"ãM#À¤ì×&Ow <¬X0÷iRKYMG§¼ÙÂ<*HÁäg¾ÿÅx=}Â;QiIQH"@q\½}x=MÑ1&¯ Hb½U$hâæËåõïrúAjíQ= ¾é\Á$ö{]ÚË ÝFyÊ$ÌÃíõÃbÓ©4¿î®BéyÌh£¬zfQ0±e2eÁúz$Nµ eµNë×'/¦ÍÓ=MwàÆ¤÷ÒfXLáCb*n>B¢@[O]mlð)GÐgR/)VÓ®.ßMpÍè³<ò®ë0ôÌòsåË:wþïõ.Äé;y;|RóãMFÚ:=}Â¢Fé¾!ïúB¹=}H&DNò:ÑcpâíC¯ ö¦ïRóCñ2!0ò2Bu®éæ±¶?éè¦xMdÅ¤É¦ù0XL¾²]{ýFq¯Ò±Ñ CÄdwUcý#»2ðË0þñ­løoÅâøKÞ6I0\KxfDsÕd°øÖèF\1ó>Ñi±Þr[(:;B Ì2XÚ]ùé¾=MÿH"ÝÂIeB:Ç¶¯2Þ	= d)þØUùíEëR©I£Vé.<©³à³ëÒ´!ò,Í°SæôRÄÎ^Õ-WZnøMr¢¾úZß õð¼HyÿÃ~DÞ=}9±\Ö}ë7\k+5ÒT¯ÏSµtñoNúv&Üé#Ô=}ÚU©ºöAÉCorHW/VDl½H0½úvFaïÆ×k²@øH=}ßèvHyñ*µ)9~ÓP¬<L=}þcz^	¢¨Ú+/s	ÂÅ2öá4Ýìo àðZ®Ôr#Iç°u³¸Y­Y¶?ÐCHäîI;\2]ÑRjH¡=Mh:¡h÷ªøF@I(ÈY= uûÆ÷OöüoÏ57)½Ô-Ü÷fðfðÔmò>Pøb9%ÉNøªïm®ú²Ò²è¯|ò°p¢ýy¨1ßOú+ÿ,ï häþhTÛCIb±³Á¦?(	}-&r/ÎXuÞNôðÐ)$>= Î?w,§ üWâÂ¼ÀÓ÷7)¢OàVì:À:y/+ÀvË._Ñû^¥ áâº<b êhðÓ¢)
èÐ^	Ï[é£yèO ]úf=MXf Tf	à= iGiH>Ï]'AÜPõ©ÝµÌxüÐåß6µ Àï3ú¨håH<lh¡Æ¾h*Kà:ü5ÏØ>%w>¶6Ó÷6¸Ôý6£W>uvÀFçûmÓì ¹*Ä©¡ç<üÃNoLü}ç|Y*j¨goh]K)?÷(rWÑ&ä«ç?çþ&Àjä&zÁkMã#?G1s_Y¡¡y4½9­nPFöÜ~Óp"Óø JË1ÉÔåvPwc&¿F2ZRàâÿÄºsPTÞÄýv@@ÑÎ4½ùêÎðQyi4_"ÙwÂ x=M?xEgöhyé¤' ¸*òQ°= M)ìí¶fg,-Ø3¯ÁÆOP2æ#§d(Íö¯zúÍj¦eHa<J­Ý'"k5ð×b®q4ÿF¼Àð\_õ»Û)ªd!é Å= 6©èn	Rìa5 "÷Ik[ëoñò5c¨Êqñ}ÄÑÎ0YYD5#Ät9N­ÄÅ¨t¡=}N°¢Oí¾§ÝÆÚRA«ø6¹ß³Rò[è¢wñ­þ= ¾-g Ð!Bñ±ò=MÂ¿ÅÛ¼Ý°²¶¢øtUê]ð Ì»>WtkWQ$q7ó)ìÝÖÌþf{¦Ý zxï'ú>Üð2«ihß®ç÷¨áÔ]£LQA©0cª,PÙ=M]/Lk¯h$Æýày/4
3ÓRTm)ôÒ±©µRZ>¢ýUÑBÚ/ ¾IåèíëðR«hdÅ±hü )ÑðÙ«lY BÛàÒRânx½©5íúw§ÑVñºÒ{õ>Qò*jG¥=}(ÁÍ>ÑFEm¨ì¨Z¥²¯Räju¹Æzë¾IaÚr%Grâ²ßÒaÒK
§.[í'ËRÏR&z%®W¼EÌM_= Øj( Å¿ìlÌn|iÝ)qU¶]2MÕ½ð^Ç©¯= ðeÒÛ= Ý<÷@èèLõµKÂL¥,>Zþ^´´²!ª¨= 
Ryx4Óy=MS*«:ÝU»È63à©<[E] z ")ëëhTç;õÒÓþ_@ý\qú§¼ ûwÑðX0Ã$pa¾@h4_ÇÝ×ôbS®ÏÖ¹TþUµªùµÒù^ªþF&Pö!fÉ\³)Usí{wº¯>CàÄVË0ætÇäW1¯ Îc¤X#\v0ó#¬å:.ù#°~vÁª×2}~6¨Ïâ£ ¥0ºîR~6àìÊ¦týºBÑtqCò:áÂiR~RáÂiR|RÖJº'c*¥tiÐä±Ïrïñº.Þ2!pï´º.Ö2!rïKì±0,cm!Æ×2¡6Cííò¬õî' Ýö[1¶YÉ­\AàfÔ\RuÓéÍZ!Í¢/àd
ã­xÎfë°Mx|
ß¡.(¡
ß!2(
ßA2I[^¯rÉÉG¥óÿ}L{·=Mý5!1(º¼ÜúççQ|ô7ößHÜô87zzJµWÁCÉÓ&3±´%ºÛâ¾&3h~µ§Ð¦e³þÁc¢e³Dûo¿ST¨'ð&ïõ¬å£? Á#ª´ºk°e³L¶-3´AÉS³zá¾*3ÖJ¸%3áºÃ)ål÷YîEm L!ÙþO[_.óN½GãHç	7­× æZ]ÿíM_= áY¦q«X×=M¾­gÝüX	#íS&RÔ'÷m³pãJPZ §ò0 /wZi!+¿ñ0óy²p2Ä8¡5µ>_ö 8[,ellÀZç²¨nâ7ç­Ù,úrÎKM=}\v¯âàF\1	Ãª6óÏòH(Þ!Æ²È²XÈ³§à;Èp=MuÞO[·®Âq®³^"ÚÝNÄÈ9[ýG^ãvHT¿!¿½iåREÀ^ IÖ r¤N­arnPè= XQZýÊZZç|OKáý
é5ïÍ_ûâv&¤õÒã¥&"	óYË,æ+¦Lê:jê¦© ~þh= ?z#Y@o\Ô§éø¼iwMsÁ-É=}GUëf¯Ô¶pL_.5V±,WÒÈbëûszÝ¢üâLêÝ-¡^ÖÛXkõú_VEj¦É4'eéÑ ¥ÂØçñúyOzc;ùßc¬í~~.ï«2ÇQ*©9µ@c3Óx²_¹ö±ÌáÖ	»´l¬M*Wò¯°ë¡Á¼ÝPrËeÑÊ Xw&ñÜwg^ÓèUaý_0*_ª /$Qq¬~¡<QoÚ­eræÄr(ñ_ÐH+"52N¨QÙDDxCWã+Q«p=}.íøpÕ9Ç]÷î=Møít«µÿ´ñb¡'4>É0TJ
ürÓ|**õ­çRÕº#üð6cMoW"ÍYCÓbÎ§¤5û]ºYÑIiu°Ð3Zg9vÓ(xæwq±àr¤Åhò©Æâ=M µ×6D»¯Ë/­ÑölËò£2:Ür°Z|ôo üø%+¡Úþ#Fð¶ÙF"b}«u§ÛÛLP³h~ÆÏÀûO_Ð­Ö>zñø#;ùT?\´sB²ñ6¸=}îú*Õöþ<Ï%Úô3oÚô×» 7ì%&ÅPÿë¼µ8í4üjýÌçÅÜÛcße+´Ìi!ñ¶V"ÖRÁ·Ü\ee±CgÃîA²ñ¡¬Ãü¶qg¼® i¯ç¶kÖìkÚ­Å±/F¨ó(Kò,Â~f/s#Z?0IorßìyX&}åYfßñts}â¸á+â|h°²ãáxØW
é¾*!_[Ú2Îê¡ÕGÈ6RìQÊÄ¥'ùýó3×=M$²Qiq\.þ ãH §ÜE¡Trc^~ópb®zq¨£)ëîMr»LñsvM>6PP[7e n°"Cæ:;ì×&íqàô¡ß:ìÇ²ß<ñ7ûJõHèÎâ0UÇ1§#2¦=M«£.¯ÌqDÀ l¬z¾òÍ¤Å
áHÁTÙðâ>=}º}ä@j~Tåâi}U!¬h;ýS%­Áu¤­(¥= ãð:íº«s§V(+LàêÝâ~Æõ ¦­w'þåZÎÕT8ÑÖ¢g/­äo©j\5­ÊôO¾R5Ö«ý®üvÆÍ@µ
E ¾ô3?Å!¸ÅØÈoÏ4Í	Gô+³8-±£3¿þu´ºFªéõ;ìåfÜ\Âp$Ë§JêS¿2jÍ~°xROMºy¬>ªKë§nªÇB÷\Î£ö!ýI1$.ò.ÃÅVàù  ÎØc.±0é©)¨t"	($F"=}æ£¶ëõ±2§z¥®[V>ä«8×F£\a÷'¡(HéJ­Ê£<¼ö-Ã)v]ª¥%'ºW!Ï^Îúa>u/6ÐËKù0£­ilÔÌC«~â1VïJôUÊG×±Dï·!ñiV-bF$]VKñ kN<Ð¤$q9= ?'§RcðnD2Ã¢jë4²9NwØÖ¯Ô&=}F³ùø[Kø}?¥ä
úsBÔ1z):úMG¤ÚP[÷1ªVÜ¦rGX¯POzç ôzªöJÞùrn=}pJàRÛät0,²8oøÐ!ÜPäQ{ü¢rAº]Bbú=Mhwá8N,s°¯(T æ	s²K$$Ê´9éúü±ÿÇyÖ÷ÁV?¶R®:»vS"Zð4JÈ= Ö= B= &ÍUøcRÁ qrï×øÝr°a¼7-Åe1RZ½Æm¹ÛJiòÂÈ\jVÿÃ£É4d?d§ìåÀ«;*áWÚÁ²ý+c=MÝw°m0Çø]lmm}tT¥baÆ<Qòy÷ej® r×v7ýÊ ºp·Üÿ= ô<_ °ïbç´Ä3Ba-BeÞØÌø­BµfSÇÇ{÷>]f¢ûÃGé~Ø-OnÍÑùú{Äï\¬ª~Gyx}©gÂTÖú¬b wDÔ(]Çe®üJsMb÷~¿±Ót>cÅW>väiO2DÒß¿?û ¶PÇ¿kàüÜ.Ë¼,ééãaõ 9äJmí¡=Ma(î§á ]=M­eI.âç=MìTîÏsIb.ù=} øáq©Ö¦à/)çXsÍÆ4ÙVÿâ4·-\Æ~ñúÉÔâ»VÃÑyI±¬åÏä¤ìÂ5¸z»}ßNõ&Ö6#9R_¼@ðÇu-ÁòF/Vüñ}¼3TXÙç¦O+¦Ü¶À VO+.À3j×9¹éÂ+Ëm7©µ0ãº¿N7!®´vñ9ÑõJµ¹'gëL^>}'Z'ÚâM=MÀHxtÖ{ø
xáïDTµº@ä¥4íUyÚØÌpÓ4 ùîk¬áE(	&9J½&ÆûÙ§-kX,çâúÀO¦ý\ASn\¡¹-t!hÐíC)rÉ?ÐöÚí×Ûß p{3^~f£9rº9aêoçn.VÙCX#?Ìâ\ÀÓ=}íz¼+s!;[¡D;AûÈ¸ÙWÑK¬]>Ù¿j«klb¨ aÑË·^GFáXFf¿sY>¹rßù¡þüÞ=}FunóúñÓÒÈ¿CKFáø}º­â¶ò¨Üt¨ø£ºòØ«6ÃmÌc§Òáº^{ ¨¿ÆthMk"ý§\áB¾2RL½8A)Hé= rã×¾=}1[öº¥m.ð9ª¿ÒáWÖ_.ò¦Qrñs0Aòuþ¸¸Biö+Ñu¨©á¥{tÙf(¯É ÁûêËÕøK%¤]âNÐ¬Âª<LkhZh=Mexïip:#Ðyb{yß#L¶I¢ÜD2x5¤wqvµw&¹®¯Ü¥9d¸?´ Ôõuu¹{9<ÜÊcÈiú¤Sgs ¸ ¾ÕP¶þ°«¶0T§ÐÅ0k<áR©?I%$iÂµ¹íWzH^á^³fÉ8Y1æZºç=MaRÅüÇsÑl>Î~·!ÅªÛß>ÂiH	5ñ0Br}é=}ù¶ÖY& Jï9®Æa\©Â;×ðÛcâóÅîcáö1Ùv«áÀ8y*Ø
Óù)ýaµ~Î´Ð8[Ýrw(üîþþ¼n¸½÷$8OXTÓ/]¥ü>Q1:FÏ°JÓ´¸»Ìý~	DT
V4­S@#l2FÝ·ûOÙBï¶oüü+ªú*P= ÔµÜ¹¦?të!BKÅªTR*IF±olÌó´z±ÑaFQ[+¦çbÅ¿ð>÷tÕPrüRúµsîCÕO;ùk$ßð%«®Ä¬: YI|í'øøjqòíùÉ«l-JKe¯árpI~ïËÄÑBDab8½·ãÖj¾µ7hÓ®D;±Ä_òEæ' \{ÎwÈåÈ \Â\9=M/Jì³Ê]=M¾Vi¶½85ÑßAËÆ~Õ?µPu*xFê/gÒ4¼?ú´\<çÜÛ{@øz&gÀã¿Õ%TüÇÌ·t{ú²^>PÜlXTàxÞ{îÊ?¸^Ö³]ôæ@þ3¹ ûÃa£Jjh£= I¾á1c -%6BáßV9m^ØB¶í!nñ¸,Çbx!ªIä¶-u
6Do¹¤£-¶gABùÌzÙ4ÎCúsGcöuQÈIx{3}}B^¦/}GÉó¦uZ«%eÉ£Hîc¥)iÈ~~ Ó#íwLYÎXbÕï·Ú1Ú©vR!Àî ñìOH¿ïÂð*µ]ï¾v>oÌV]¨9mhÜ(baLºY^­q]=}($,!Þ5¼ëEÝFßãë
çgâûØTjÁV®tZ±ñCn×%8ö¨&d \ª/®ëá÷o°?T@Ñ5N=}A9ÉÃ(ËxKå= nÏ= µdBLë85 Lo	­pJ:T_»d=}þÉ9¢Q©Ä0±:_ÄIR~´À7ZHìôv?6R!øalþçk¿ú¢
hÊ"ücXÆ]éÎkèP³C=M´ë­!å×0}ÕRqhGo±ÍÞX²H#âEÄ­V»êýo¼ØÛÕ¤-Jß5Úhë?}SkÎáºÎu\êOAhÍ>=M¢v(
ÏÂyähl²Ó-¼{\õÇñË}Rù0¼É®;â¼7ëuÐÆ1d	¹*Êù-¸ðü¦QêÃc*¤àc¸_<²Ò6nT!	ç/®Éöd­H¨V2±Ú¢±\ß°òAù:¤ôFdëÿ¾NA~¨½Ö
UU&N®UÐ·Àß= å¦ÔóÊR¹¤£ÌðÎJÚ±còÐk3L{½lZ3k(ywÚÖOlÃµæì?¬3gËR¤@A©&;ï(Pd7l±uæ~] ºÐò2÷³â÷Kñ (/á ÙZ®M+´¥gíû ÷ËÈè"Ï
¸3nÝ!a©ïâU¨ðî3¼	~j´;ØÎCåÅ k<ùþ)VÙø¢Ç\³.jChOgç+ãæ£h\Ëku÷½ÆLR§(5Ä­Üü¤òIÒ+Zª0.aÅf¾¤±ÔWp«ä,²u­O»®µ¥NSÁèD³èÔ1(äÄÇÓ*ÐzûøæÚ_<´m¹ß^%¾áM¦¼ìe/öÅ³ä-OÂ wKÍ2'FáLrK^]èY>IäÌGn&ã¦|½VµH=}D?Ø]å'<Ð )ÖQ<çþÍzn0ÆúK[E= Þùà¿NÓzë­m@´æ³-ÙÌ&ùýÄH6[)RôMätª(ò«V&HÙÙ¼ÆmøTlÚþV7iZo¥PmÀ{ào¸^ÏÞ^YsÜØíá[ðëDN]N(=}ë08°K´ý îí£ae3~ã¾(p!¤¢9>vª­è=M:VocWiÿy^"¡RiðK= O­\gÊ(ñuå=M=}u0)!=M"3²²Ñ}Àþ2y=}É¾[Ýåh¡ñ ±ì¢®ho´xÎ2¶äñÙ9Ùx(]\còúIÁDHáöNMU(5óî» w­lÓÉdbæÓ0 x8Êò0ßjû*T1ÝÒpÛfª:æfoC£³Â{$t'Xjï¥×ðî_iàý,§ÚçC½ª!ó3D\ûôè3!dsµ(zèõ,FòÁÑ¯$§úãJLDäçÄò§ÊËj¨Qa¼%gØm&ÂU5hCîÎKQºYù4\ÄL=Më$¸Ã×=MH97ÿ³¦ ä¢v­hOCÿáß]hÌT1ÖZP{àëRE®áÃÀ(BäûLOÞÔaÐÊ×4Î)å6ó)i7ìë¯)|Ùu5Ê+e]gÉôÔÅxæ= Ù:GìW}Ô¨ÏUC¶ ^³ÙFµL»ÑC{·ÀÄÆåü æ©xÐr­Uáq7s ¨dNcEø¿afYéh	Âê~I$ä½ ½[¸h>ó :cËô}f<:=Má/ã<vÆL_[ ja(æå¬Güo]]8b­ÉRÖ¶
Î/xXclºö«(¶ÌÞÍÔT¯½@Í^.*]iÃ:Ç&²§ö
ïL=M~ÔÉJÉÛ~£(2½vnk0t§¸twQ°ûz´7¡¾-aÌ"w¹\%±ßú¿uÉ@ñ³]ÄS?½Øí¡ºg0! ©Þ°¨qcïºJÕÞ|CLØVå{æ6m@z=M3<RQk}ßÎ=M4cT)ïBQ¦Sd|Åßó(·(ü,¾0OátQÜP^EmU%«få½õýQí¥*´Æ>§·b9P&«Nú0Ñ·T.Äèä# 3E²	Çò£¤bxV~,Úà­üïhf¡üVk¦ö2v¯9r«¬R²ö§q	Þ6W«þÛ÷¦EXX«F¤ÚFòöËñüñLgùrHÊ²ç=}Të·Ã÷ç¼u"«-Üù¿ñ¼«²þÄÃ1å±fë¬f×Rû²±R²Þ®Òî²"?´óæ2E3×äÅ·³ËÄÝÙ×ß1Ü¬ÚôÎu÷Ý²ØR÷M±2ß¶GÏÃ¸±V_ ¦oëzi i i = di¸®./P_÷AàÆÏ)¼¶§¢¸¼væóïÂ(þÆ0+¥½6º§vñGnÒwØ«¸ì¹Ð¤Ý«t¤i²Éx«ÐºuÔvyÆCyt>Ññ\ÀfÔùöÀ½O@]ÀÍ{é+u¿ZIáä{0=M½GÎÿÞÑãÁàÑz|#ÌÑkç9/út"ìÂ¢ÎÄsÎµ4¸È1óÄó
TÒ½«ÑÈlú%ÛZ wñÓsÕÖÀ´Ã¦îío5Î£¿	4Ç°D»É}= Òéqº{ô³½ß3±!µ|ÒÁ6Äå\Ì¼Ä¸!sÃ-W¼ºI¼^tÂëÌò÷ÂmsCð£è=Mm¶ðÅåTGj¶RFlX¶Î súLáá0¾Ù0¿Ú²î3ß,Ì,¸®._N0ÄBo¿uIc5c*vÁ:àÁÎIÉÙÀ®Ïmîg"ªCÔ(öý5ê¹Z¸2ÁÍÎ×ÀÑKË+ñÓàm29²ør²¯)®m®§|¦!0~WBB¤¡Â/­
ë\c|~~ÑþXYEXuöQfk|Y3÷Ea§=MÜ³sDa6RUbedaþf ggÜYùtcSþàâJWG_àÈháíëjóJî² o®l¨&Òç¬KòU\@ñ¿+!]ú^Vòîp¤Ý>¥T%Z%eefåþÌb§ýHgÅG­ôVGWÒìºrðíc-­; Î	 ¿ª&Æób-ª\°	Ré)û¢= Î= EÏÎÄ¢ áJcç´!²Ñ±ë2Q¸S´t¼½IË4%Øàä(÷¥éª½d»ÛZ£@¦F' Ó:=Mæ|6U·=} ^ èNN·ÚÄ×¹yXÆÎÀàÅN"e6BJ·Å<.3PÔiwóúZ°è²&lÄ§$#·ydw¿}[v<×8e-¨¿d5oÒz»x¶²æÅ=Môü®yØ²¹Ê»QdH¯ócT?è£hì¯ÙK»d¨½ß!àå§{ÿZøÅòJ	×Ýu/wG²ÃV=MÌp(íÀÿN}Í"ùý%*Î§ ÃHl>ÇëÙ¯!ÿQ}h7ZôÕ ¿µs²=M¸|ÊÒjrÍ¼ }ø}S×Hùwp¸tÁsY~ëXÁÆëÿ÷Æý5ö<pr{ü²ß®¢²ooL,¤0"9c5Í¾ÈÊ'£wê°}èi¦°!*yà¯|a¾êZPn¦*=M
hå8 -¡>éZOlu·÷w[­H^o~tU=}B/ÐzÓDU:¢h?7±äÌxHrÍKn÷íë(¡} º¦¢q¬@bîö¸X¨-ÙA&
ùÐÜßbÐ¢d+T¯=}Ù ÆbHAG/ãÃg #ùàÖÞA5ÂPdqF+_ìyÖç<¥=Mpdétåâqê$qéáÉÀðbNÅebï^êLå~"O^rÎaH1±­N¿zâ?=}î0 NYtZCÀºJ0j¥Àþí0pò¿ß_H$üö|f/I!l§mxsÙ')¤°'¿Zþë#j¥j$	¦uV%bñ²ðCÕKm<!5ÂÅs,ÍÕiÆ?iÅV'GkÉ³@}µºfõ©­È<,ß*Dëö3ánËÉ@Å#ãNtûÜ2KÒh8°Ã"*Í.,Ýï½ýÓQåªÕäFOüà_= ú÷ÊÚ©øUBÐâ¦ÇÀ¥×&IÜÓBÅè »»Îõ{}yQTxG¾¯BÏ&ïn¼ë*Ã¯ÓÉPøD9ÔCÑ7d	uR+÷²ýJDpÔsöï8ÄÎu4}ZoüsÂÑAusJø¢YpüÀeHûÕ³êsø³o¥$ké¶p½£0ÎCÚÄLjç|9Ee¯óß±w%è¦DE6w>¥«ãL¼w45;sän608&Iì= ÝÕ¶\Ù	%´îÌ«¨U!CÄ7ò+m¾;é#oì ]
ô%òS_CÖ8Á7Cúâ}>Å³IZ÷çô5Âö]4ú3KÔÓÎÃçÚiêlÒ[ÂB:{ÕÈ³ÍþË°ûS.t"ä7Çe¶åË¶AiP:3oàw$¡ÅÉ]ü÷Ìó!ÕsÝhF¾µcûp4?ßµp×h$
7·¬®M"ð}/¥W<¸Ùù#SEß¸ç¥hZVpXi¥H~Rûpoë&gÜYç«çX?aZ¢òQ$ÕÞ¯ôæI+<Éáôá-NµÂô ÝÃK»ÿS·n¾YLÈ.klÄnlLk7kÆðClbë¤PÂ<0øE0DNhí<Wkvp.xðª¡Z:DW pPFLM.$ üqQÒ¡û=}¦ñçXrò'ra[ó$-ö°qo­ÊÒ=}¡©ý© HþøUDw 	
KPÍ¡DEiâàZa1{£Ê:X»ÄÁÂLAå°æGÿ"lÚ<LtAô7?¬/DÍqèJ_çuåÐÊJB3VATmË+Ø[ÏÌtXÜ*8?ÜÂ¨wì"Æ&qðxÕã*.=M BºYpj6«DD4Pá)!UEÄ×â°;8SEj½»ÌÖÅ;Ç_» ×ÄE»ä»¸óHõ(Ó'Ë]]©+ªÃ7aHê(æmF6
 .£|p}9ÁáOHf¯I÷üßGhûü 4|2¬­ðº/\Yä-9u{P|Ú¦¡èþüad¨sÈÎÁQq«öºTìx2YðìøþÆîÚrh¼z¾ØH¨Ðïqds2¤[EnâÎí\äYkÙÙ±@=}R=M²@hKì*ügÒ×j/öæºÃQE¬vÊ(Rq486µÿ¤¯òg^N=M®á<L¿+1[LëËlØäV±^ùÜNã&ô'=M)|6]BPïqs}tÚ' |õ|>mÁ=Msæ#«QÆ,jQê)%zí­bÅ*ãZù,(Êtäç*§i¢TæJþê(^Ì(§ÅÌP+X:âÎñ&«µ¦ñ>!q³©n(Ö¦Lñ>Ö*YJ.t[Ì d¤»ÁO#µ"åPï"­®%=}¢rIÅÆÅAu-o¡+FpâÃN)¥¯ 
à2]ANç*<ëí¤£~Bh¤@Ym·>iØÐ®±pèr¯ M5c .Or=}¤¤¿ß¬ß=};¹4Þ}çÈ¥Qr%0'4~ípì[²úz39MT&ÜÜìÙïÁRl#ûÌµÈC´þ/Ý8TVóyCÅuè3¨u¤óaV¡æn%};a·Àl ±ôö±ö1Ç¨H$3^:T¤tf³¯6Z6¹zJBMÀ"òù5
êR]¯JÐ£âV«Ï[½+óYQaZ¦\á­åÈ\$EtÙLÚ?¶ÓU= K/½Ò¡.³çWéDh/À(Òh)Ó¹$_WªEêûÏÐ6WC©5;²ðÞó²yú£sFÄw»¤sáÃ´ù?*ê óS@óy¾Ö9¤Ûc? ,Ä|4¯XëÒ.GçûaGsgÅÜºÔÀ¦3áÇã7;¨è¿¬gå*ÆfEÁWõKP¿qéô¿ã¾,+O-{íìq)KÌ= 3³×Ô² à&4y¬B8ûµ]u7×+èïækÓ&	¿>ôÞx±tþ´Jõgp«-6?¹5iÒ{UÇ¢ÈC	N¸sÝ>=MvV+ðøó¬ó; ãÌ= ¶^üïÎÊÓÓBãá?Á»ëÜÂqÖR¥ìóó]]ê\= Wêä+Hµ\B¶Öx7&cRg7¿,&½{¹ÅÖvqd¸ß4à÷¦=MLå¥{²ÇD= 9¶r9»]ëÌ¿Rä7ðJt«ôÁ&½â6°rF¬AÖ7;´6*Êù4rSÀÑíºB ²ÄoFú&»·tß³EËìÈå¹¸,!ú¦
¼Å4zkÞô*§N½æ%W´p%½®òÿ¶ãäO £Ûþ5ÚL¹üio/1©Üé= j-%2jõÞ¦Üyù­×¾@¿/±°¦=}8¸æ*= Â¡!UVü\ÛÞdbn+Ü¢X=}ý"lìm§ÉeÛÝè6ì{©]ô×9neÕâ¥g9RÈ¡-Wp¢sVÿü«=}E£µdO[3S£+ÛPW*¢ÁnKhæÿ3øtgè)þÌÐÐq}àßÙÝýlÝì¨P®E^>q0#.W¤ÆcbY«©¦qPEgè|^u"<!J×>ïï ÅO¾w!µkXFTèä$ /.-[r.ú=MGgèØÄõFoªºÁüåi:HM?­bê%Lç¤­[¢Urö=}ûÓ#(æDÚÉ¼Cu§þïøøÿgdÁ5jöÂà2îçBÒ¹ëÛ|KQÒsÒ*\}ùW*&ÿªhx9}s/®];ÂÖ£êßiµo¶%Heú#¬øÕ5(oíã&_.Ò!ªPÚ´MGÌ®£5^èeÏÑÄ0)B?Ó,ÄÔÉM»ÈFå³D;µQóW½ î5:wþÇ]ì»¦SsµÕ8^Éõd^To?>Ï¡ß §	5zßýÄñÉBõ²HQu| zÍÌ?7jTÍB~=}Æ]+ö4moß,¤£v= Yí)§oÏOyýY¬ÕdtÏ¼,é02¨1 ¬§©x¦Bâ¸cjfhuDæ]ï<1±dª­Ó·X÷ÎTþ_æ­ç<1úÍþ"õ§¿RæDÈåá¼ôXãHàiùèØdÔ&ÈÓäDZ}µö°ð ¢!Pÿ;rÝw<ym/áö°¾©
H~!ÊÐ¿Ræ Oq¹:uTÇMQáÿhµ2Âú.T·Ö0Ð (Ñ:Ù¼ÈL¥°ÞìÞÖ1'sßþãs	õNOÃán= ¨l²DVÚh±&WÌ?(óCÀßø0"?äo2J² 1}/öñöÅ¥DqèEc
N|¨çËÅÀª01HÊTÖúù9­mÎÑù:ë?[Sjf\¥-a& ÙÍ%¤ù²^w|éÁ¼ÕÊ2ñoIËíÅºèHPÒãôÐ²ÚñHTÃ>ùRèÐâ½0.ÒîÈ0ÜÁù¶Ð©]f25ÿl}[r= eÛ)4@a½Í­Óìq&UmÅÍ­¥gÓ)D6Ävõvp ¢!Ò Y µg1ÆKLñIZ5rð ""ÑòõJ	yD/_{>åP|Õ®"êAaªdø9²cº'$hÃ(wSbÅâÅ¨w 	ô°= ò7ÞT4©¥+úÀØ¤­þèëÒXhjÅµÚ«±¯ÿßÀOdq©
xd¦8]sª*ðq5íyæ«X¨ÌSfêG#¢ÎJ5áS_âòÒn$Ï9!k²]^úé«Î%£Ü#ù9aÉ0=}ù¢+F[²kü}£B>¦(û­ßQ^;9-¦I@ÚjWÒ×-^µ	,@pé¹¤ &¨WÃþqå©¤Xd¯éB$gÕ¡/®À.ý>C¨­XÀÂ÷É£ùÂaârïº)¹?¥<®\¹0=}É\7Hµm+§í>6H¨T®«ÜÝËÛùª5ðúÄ^d#LÜT³ Be+Ê ¿S®Z&^lýK°'ê=}Øþ¢âb$DÌ­¦®<¦«]%' Èém¾kV9ÓJ
J_±*¬ ñFNXAÝÝfìÍ­Yiáq>uVl \z½v®¹à°7äÅKBk­8á¾bÍi)ÐÉq!I["é¡´¾I>d²[;ø&= _íH±«¥h§~;5?Ø"ÈTä,üñZÕÒ
I~#¦7II~%ÐAQà-W9~Îº}¬8nqû¯U^øa9ÜúoÄHÝìUÏÄáXñ»ußù
Ä Èpá'ÅR@_¢ZÞùòË²iÒÀVÔø,~5é³ÔëÎdº ôbË¿Soi ) i i i )òùlq­$Eâ{"?ø«©ÃÉy8#õ»¤üÔ/÷r= âàõ=}_Ø«ó¡nÞÿ,$@9u²±ªè9$ÿÅKy¿ä:,ßÄþy½	d9»U;ÔA·EûÔ@¿e{ÔBµ=}ÛT?½][TA¹MT@ÁmTB´9Ëöééþiiú)
)©©óÁÁûAA÷ÿõááýa=Maù!	!¡¡ôÑÑüQQø öññþqqú1
1ù@å2yä4üÿÍæKxÏd3øßÌÞxÍÕ;Õ9ëÅûÕ8çå{Õ:ï½ÛU7åÝ[U9íÍU8éíU:ñ¹Ë=MÆäÇtÏ¨{ü& 	@iæ?äqZ_lä"Oð-yN¼ÈÆ?E<ùv×æ|å«Ü-Q!ò GP{Yì$©ß.î&<Nn,-MâZ¸å!ïbdÊ\Ø©!\PJÈ_§¨Ýò Íª_("7ÕðÎÐµ|;¨ë¢A*ù5fÅPLÇèW]Ø  Ì~I=M&O^©ïð»¦«õðÈ= ÷BX-à&8^à>=ML|Yôù@eI^Ô~L)~i
y0eÑC¬CúÐfÿéãN@ÆféênàÃîiè )úæ_*hZnð®­±aÐQ6.[ÁªD´aòîBª¡FO$=}f&ÌñþÀ]/è[i>+L=Mb¦r	ÂÙðUj§+Z¢¦0-2ó¹Â~LïÔNZ§__QJþe.9b~¥àLqÞª¯D_òH¬e²}¡ºæö)Ñ.îªÁÏ^Ò.©·)0]­Q&"êÙß(¢ç¼aN,qª>¨ÔÏÛ¦øÖÔlL¢*½ö¬¯ß:ò¼GqÙ[²âÉ´ñA§r¨yQ×Î]|2æhîl!Mæhal¿àÁh\ ¦¦b*>¢dÀ¡åS.½;´VÐôXl·µT3¥µ¡Âµ-f­·4¤ÌtúÀ¶0¾¹¹¶»¹Ð6yÖ¿{î¹ùà>}ßÍúeCdK/N¸â6q6¿EÛ6$J¿Òò{=}G6¿JölÁ¡>ÏmI½;ÇãS¼óØ·ü<|ÁÝ#pãüÝ»¡ÇyÄÇÒbÃJ]TGs¨S¤]¹WP¸?ßÅ@ÀIC= ã,QÈë¦ò_i4dt¹ÒNugÉW6ÐGê sÀi:³$h¶? Ð¬ÄmÚ»äK¯ÌÏÊK%Ãq%ã!(xzÔ!úkö¯Ð}0=M#ðK¢¼¾ù@}Î¡¶|ÃÚB¨¶vÒ­³û= µ?ÁuzÑYY ©NõÌ¿ÿ&=Mj3KÈ¿Ã=}T9ô¿ê:Ò´Ý½Y«»°Ä>B*Sªÿ3ØÄ}¨²¶ª:yAµûöþËòjõÎçéi8ÇO±ÁÚ^íö­E¿K/ML´L¸#Ülp6³Dì°xàà8C!²áa)8\qî7´ðÎÒ­õ²\Ò·µËË3}´ü¸»	³(µ¿3µÓµs´'ËÓá³w¶³°³£Ä·ç4'9sÃu3æÃïû2dSLåË%»
ÃªÛs¢	5	4]ômób3Ò¸ä¹5^Ð¿ Ïó.ëôíµTRÎ5º¿üCy«4¯Î»10tÃ"8öß<´ÆtÚh·Áå¿¶æôbö[â6'kº­³Ë=M	ó[öð¸¯MÍUxÓ	5÷°À(Ê+JÖÃ&áó£p¾vkJSHRÔ\÷û»h<BÕ ¡û{Õu:¿ÓÏúw¦;ÐTÍ<£VbÃe²ÈD¡ÜËv9Ñ?7MßùýÑ{¿yc)àÖÏ÷9òûí^ÜþÝìKXh¦±xÑ	¨;È= ¹(??y*DüN]u[ðåm8VHþ×OO2k= }x 1½¤d5áSRC)ýÜÖö[M= WØJHuî
Hmø>ÀÝö~ªÝ²[ë¹ !íUlM_FJ'ý&À²Eù.Ö{Fß¿®ß¹ÜPÜçìüúÌ©üþegè2§Hè ¡Ö)q!ÖQ|gX*¥Æ{æ)Yÿ.ö(.mY>6#h6g!_Ö b'Å×ë>i
O¬Ìö[HÖúÍi&×hH­ê"^NkÀLÑ).T¶¨UN,Ì-þlÂÅ~¯¯èòä0F²¸y½c)ºv4us%Ù$¾; Ù¥K¡Ù¹QÅ¾"= ÏaÛ#>T!êÞ7N£?æ5^h»à¤vecêÅ¦ÎECÒP¿©Rõ÷i¾3Ñuoì'ðy+Òødz+÷|8uå¤ñüÀKýn Ô>= ñCiÁVL}ðúLX¡XòÞÎ,R)e¢)~gø¼¥)= Á~ZõxÃªâ½²Ñ¹3.6êV¤_­®ZÞJ¡É,Ðè°4éEviVuªvî<k¾lö¼î]ª Û¢.{©¦¬°rü1Òµ*ß{òìiLVsmvÍ«ÆD V>°Ùÿ¡åâ\6%ù zéi¢Õ¬b¶>²	Mæ(¦8&}OÊ\m®cf«¶Î¹ Ñç­ÇB­µ6E4MØs³5!É¿Q	ckÿAû&.!ñÅªÑv®3î!¾ucä{"R¿±Â«²êÈ<úéÖðÌ±d"ù!PÒ Ùqn AæîMñÏÐc|]ßLçûÚÊ=MÝRVOî6=} Álßz¢=MÈªiÀÀÿ)ëj$i¦Q3©!ÞªÀ¦çÀ¥niWÒ²2îå5®Ð0ÏcÝédÛfTaß~^¯ï!J¡ºïÍ2gÂóÃª¤i	´Pb¸W÷ú"¨xâdãXÊ5/MÁã[ä?É Ú1?¨L)=MLU5â¬U1QXðv¥òàu= Ã­oíKß<>j±ZvSü®¥(y¨F¥ÑÿÓ	å+éf:£}Òõîg]5 :Ó :Ãå^3dØM{%T-hýOickay-DÞ$Ð¡íÞÖ&áÙ_]Ä0P#[é¿î­r
ðdï«@¤×%¢=MÍêw­eÈá^.[µ¬bÅù äÉÞg²]"1vK­KÖd¦ýK÷Z^eàÝpSvi7c©yIèÉ±x;
¶ÈÒÙGñ°it ò°,Gk )<×K_.§'Åúç= ÀrúfºUÊ³YH3¾Ã½Óð®,fÊãµ3bÂ>¥(«ôH¡®ªÙ§­8R©ç³ou³N#Ó|¯Ü2M.øµüp34p4Sñó×ã8³,¹£ÙÆrÓsõ¹ìÇõ¸èß¸Îës¸¡£ôÃõC3Ç'8cÔçüô=MZémKÓÒ= 6PÍrhÓÞXPÃÊï~tµòËrú$=MZiõ/#CZfh¿³y	¿MRLqõ#SÊô3ü­Ä6.GÊ²0hé¥z$Vº¨	MJl _"
eS7v¹§­= ÛÚ= ^wY1ÁìæÚÞ:§ 	CHÏ¾Âe1 5\z¿Ònü!­ªûê*ë­>v¡ Îê_n#AÆõ°Ý¯/1ïA#7¾g£4Ò1°ªK?Ñ$]êyp@Rï®²³]³²Ý¸ïãìïgñ*ïÏVQï¥xï±9¤ïN^Ãð¸= Ýð7uùððÄ<5ð:RFð~eXðqkðírðbðÇ=}ªðÁØºñ§ÅñäÒñÞñ=}ëñãùñGÒñrúñAy#ñcJ2ñ:ñÂBñKIñ,Qñ#¡YñÎbñ®jñÄnrñùÚ{ñjUñ+ÝñGnñ¿ñ ¥ñ¹<®ñqÃµ¿L¶þÇó9h Þ@0iläÉy­ i æ_ odðJ¿¼ {{,=M+ 7ðc$v[´ÏumÄç?Ôä´õZ"gñ *@«YÌ­ð_ë ö¾.7Læåëüö\Âb°\è¼ÕXØ·ºÄD9wc!ÏºAÙ#¡%ÅAZ#$1ÍLÌ+j P?yiì<{{5ï©P|Ú$´Î½¬ÄB	ÈFNuKä%M}LÆ\s£D5²öGì[W';=}nåÈ^i\ëª	x$5³tÅtR²»"Ç§ïÙË+ ãDtê5}B5·
r¼2»Iûq¥×â0À¡þâd_v¯:í[øþ[§äçWÂeÅ¶#m n/2¾¸þ=MÂÜ&u:j	¥\¸r0È[2I+â¤=MS®=}NX¯ö\¯i2C)=M*ûSicPtÓ®^¸8iSÓâ{gÊÊ¯îc[^¦êÈ&=M$3=}sÝÙ²=u[ëMWUþx¢ùÝ¿¤*È( ýáPEk<bý¥¥Go½eû|HýßÞ+0t®@½Èïü
#~t3D½	/J)À%'Þ/@Dz?á%ßÎý#uuÅïXg¼r^JS.VKôÞ>¼àÜYxXK0>¬7/&ÄQ>{¨ÛUh"ÄÎÒÈ% Ô88/UÃà@õåÈãµY7Êð_³>y/_
¦
ùñim¬oª ,KCúNÙ!gßJ5ül§"TÏ%ÍKö:^·VOBÒåµi|NÜVûÌdêeNxßp~7L«8eîFÌßüs¿Oÿó$í¾ùZæ Ín÷ÍÆcqMý¨g§yZ+Ü8Ü+?ûÔ±å|ß¢PHü÷úÚñ<m<nÙ§ç4rÅ»MOó+w&ÚQ¡^ÏÚp²m;uSBTâ9£ßá@y&ûçUëÌx9ûa{ÖD(>×&·ÊÕ«ªëúu¼,Î9Ë®7DfïGìÙTÿñÑuKSÃ}Í5¤}Àù[¸ZÙ;q°5KdëCsÜ4¯iÖ³æn³®&Rhj°Æ¢zq	=Mq;ªñC®£­:ê-N>È/©UqyFî.UtfÑmTFî!ï#
i(ø[+±|L&,?/wfÚyð'[ÖJÏ«4ºæd}=MîÉAcV"%/MÀ°=MCÎ½¶)$-UÈÒ±jAAØ.É7jMFÒAæ¹NdQÜng $ÝçtTäê@,g;gTùË¥ H´T¹¯)óR¬¨= v©a:ñúea/½´Úæå-ÎÚD&Å½ÙE) µyÙÆ[­.ïüÒz$íÏîjAøb§&zc¢¯aÍ $ÛIèA×y)×Þ?ó¬$ëª/:&!¨ãïíÁÖßÛÒjÀÔïÿÍ?¡qô' ð;¶L(#³°®ÁsáVòº®nÒù\0cZÂºm©ÔÜaê>i§UópÊÂ5.¥+øÂw¡% g2nHFaÝuaÞP\ÐL¢e FIÁR¶hlj>kMGMåþ6
Ð²A¯j]¶æiZ>.ßjV~LiG©~5´ó?³»µ i\ +i i i Öd®åªyâ®ìê'¥¥ Í^ÙÄâã4\ä
ÌøÄ7N¿¡ôkí¨v­+Òí0.S*dÎmPíÑ¹j= K?Mî E³pî¨C?bøÍ;ù
ô¦-ØÉ8IV¬/Ì¬GSäyÏ½Ôhf³y,{H¾Æõýã¶ ë¯æÈú=}E¦Û¼¼ïÆB:Ç6HÛOÏ>óÒëH:U¢»:¸T®#ÓÎ®V2qÒa¥¬ôhÊò©w*¡(6kY¾-9P¦ÄE©ãì":NIéÃ@nOIcÞã:èæeætLxy[çw/0ßr_ºÈ¾ÐÒ Ú^ö¢[Í©]jÅ©p7<Rï/|TmÍ!áÅûÄxvõ!vµú!»¯³f>Èr~²UÊ%1ziCL«´"t$Èq(òö?203¥(*E-Æ·&/¼öÌQ&Å±ú$®¢Ô Â¡[Ã4¥ötoÄYý£u7âú;¡ÅoxõË)ø¢LÜ=MWñÿ/¨ð'±=MÎp^ZOI½½UÕM"C dàÜ2ðAß(uÜTñ3ëâ-D8=}æpÞfÔN×àTvÌÍg/:Å\Gû0Ñ­iêÈ®pXcÂ zñôêª YÆ|²vµ½1!á7Ò:å~X_K&ñ¥+¾­ségábREÝÁ~rÊÃ_,ë¡j{mDiÏÖîZUÖ¶~Õ@ºÖ­àAågäý­n¡ßô£³Ë9´¸#i
i i )i±> iîäçÖMr EA&z8;Þ¦D§À-Ôê~qD½%çô R};\ÙEOØ²1#GCìÑÖ5Ø1GÞýCèx!QÞDÞ¢]Ø0F[X'{Éb¢®¢Ú	Ñ²HÜ2©~òW¢±ÒÈfÑGg§Ù 2	]Àö¤eANÊã=}ÐS|ïðòÀúLÏ²$áêàA­©âVuÝM"aM¹©²e¸®@l]g¾@gp?Ì%CqÚB#¯ë¶Þä!}ìÇaNÈçÚ) o:Eöa,¥$(1ù©Êo]0ü©ZW?2~XC*ËO«sh¢ñD\¬Lo,Ï^3,ØÑ²_õAAÝ<fìËVt æ=M¿°:¶]m?KW°³¶Á æÕUK3ÊY_Ù¾eIÒ"ziid±P¶Ê­î¤BHæFÉkÅÌ¡ù|ñÂQG½½jðÌ«fêöÈ/Ñz¾2M¹ÅÆwC¨Ô×7¥²T#Ï>Õ£rÇxEYyò?B¤ß0Ns¬2EûYl
Ýnèòã6ÈmLwÁ|yò:2941ñö½LXwê¶þËY=}b%¡Û±*È¦Âh_kú0ðÎüÉù(Ä·Â3(Ó»³¸i i ¬=M.iÄoÍ^ ²òAÚÙ/Ñdª~+CTÇÖ²FÒ@Dt±V¿T,Õúa@ïl,ðü4S·øòÜe'>ÅúÎG¬8²]ÿ¾²ÂróÐnßÀ5çlj ÆR-à?¿gL(÷N¶ííe¤gá1ö
Ò~­ÏN3KÔJ¢ÌEçv;Wáðåù!i¼®ÿ/}fLùL'OâßcÂd(þ²c6ZèH_|Ä#}INú¬aAM©G fô4¶ ¢ÐQÖ>vPpw¢OÄl£ñÊg^$¯}T¸!¾(,*ÁÁ+ã_|© Q§Y-dAÊ°ò 0Kfv:ºÌq?¨ø.ò¡Ì­Æl|Ò67³íá¸ÃÆ{/xÓmº$ÞKL:5lËuºÔ/Å8%óÖ¿xª½vq#éø#¤·ò(÷e×2ùDËh¥?T×97y²Ê~uEë?óï¥bÌÈØ#éDò±ÿ4	Å©æFcå Uí rå8PÌJý= .Í5@{+Y¦íèÑÌ·"{óM<¢Mÿ¥Ðekfç>Éyüò:©üìÛÅ­áºòe^ÚÂ6º,= }úñN½hr³z3õWÉÅwVüø/Dá[jKxßÞÔ®¼ÀqX}ôåwmyd¯%Õ©J	ô½2= Ø ²bwêk=}Mxo[)èÔÚ],É6oÍq²ö$(àÂ:°b(û¡ÄKy=}-Á~éãjm42Bêû­Ö&çÅ÷" o÷#æ2 ù¡1æÖQu§:à»V=MÌPý¤p	åöïT@^ -hf®)²rº
îåt;ÚÑ¬Po<V·'«0ÊFB*T\P!'J'æ!ê¡ðß¡t
ÂÒ.£<ªªpÿò~ÔñE­c¬lB_60OC¡(òÚ÷° z­(ò¤¶?h¿£®¥´	ÑssC¦6ï°,CuDôgRÂ¡ã7S»J<ök¡Òõ¯%»®¿½9Ü®(KÊî9l#ËÐ´&V·§i¾ãú3t´
R½+ßWí	;üNÃNõ·Öõ_!»äÅái;F°Õ;«(÷÷±Äp÷hÃæêõe%äÒ7ÉÄæ(ZKFÚwïÄÆ\ßT	u¨ã¼^¥Ø J­>7¦×ÏÕô°[7XÊØ¯¥uÁL¢£²y3èÐø.ù=}ûÞûÜý{¡TnnG¡!y±)êêé)ÅnzIùÉtÓÿõQ¨¥^ªîPªÀ¹ºhÌgcs8ôPÃ¹èÆÌ{ñ6"
æë1¾6®Ë?ïtÐ6*bãkcHtl*Ë_2_J¿eîÌÿ¬w>ñ¹Â/ci²Ã6J2±¥:ÌÒs¥Ú¶º1ã~3¥¹çÑåÃws8&¿7¢ó*ì¶í¿7¬ä3Y¿7{ãS¨IÂ{:;ñz¤Ô,ÍÒ:þsnq·Ý	H3E¼çÜGó(Ño¶ºÑ/­t8IÝáo>5°ûáïñx4æÄÏ$s[eË=M >÷úÄïÇ4:õÄ;¡Þ·~uî¾ó´0EÂ¦ÔræÂÏ¥ÓqÞÊÑ×u¡ì#ä×ºßeôÅetûÉ{5Ð¾å
¹ß¦|3Æsû:ÌÓC½TÔò¸Ft%åA5<¦ð´+×´@:>$ÜÇºdcéò¹ï]UúÇ7Ý÷tÄûNäÎ÷é5ÄÊÕz#F¿:À­ãÅ½ö$ÔcPÒ¿b}6­tó;È·sÉ2¤Â'«õ1jÂÇ2¦¹fôâë§ÆQ±§36¡cnÎ?(¸r*áÃ²wÌOP5Ößë³bi6îc}g¸fóÎg·kê4sE1qêÆPg5ÌÞàO¸[Lö\§¿Ã.¹oÖº*Ý&é8¤¥Ù#¤QÄã¿ÔÛ½kÍóþðfþÊmó©+ mT¼Eþèó6[ö1BÝ;¡	4Î1}£åcÂ7tÆY+Ër2ßO¥Ï¶º.G[ÄKÜó¦ ì£|I¸îÌ[ê½+é%
ÅéXB3*ß¼ÃG<t+ ÃìÖ¿/ºÉÿðÿå¹ü2Â¤Ho¯ú/ºn|·¤Bwm>'{rØÒÇDõxdUÜ¨;7;Ú­ò!F}ªêû~é%glL«êÃ0H¯1<?~ìy·¼;CøÀË.I»qO×îBD¥ö:|a¬ºüñUü» ×x |uÐN{§¨hÌÔeIÿüwýJDCx×µ¥Áì¶Õ:,W)¹ëPûïÀVüaãå_Çó/Ê-EñÚÇöWÎßüV|çeY½|Õ¦Õ{@m$WUµ=}W»IÛLÏä{D±w^.yûmx©kyÑñÊxÓePp!=Mi7µiõíNÖþßH¬F6º8@5éÓ@ åa
©&5×P-ÈÑz¬ß
^¬k¡xßü49aYSUN»-7½íì,5¼É¾9}·¨n·>ÏÈ·~¼·EÍ¸N¸*¸J¼EV.¸¤ú:¸!Øçü M©WÒÙÖè=Mh:­f@[æ-ÖÙ×úz"#Tx-gÓÀ%?Sú-ÙPÆó>Q¥sDl'!µTf7÷âZMN	z©hgøoOQgóòY Y,j)¦¦VE¡Z Q:[±Ä­$=M÷<Ð#À(Rÿè>¾~¢åÀqùV¬@ ¾= ,P½Ðnü.¢x
¡Ê©Z§§s
g²­ÝUPJñUÑÍ¨L!¥@=MRÀ'ÖÔÇ|õö¸Ä/ð
ÇZ'>27·-Bó\Öä FÇü=M5¿A GøvÜ¥hõ´'Ü Jì¹f2Ax¦ôä£·§ÈQ7~µÚVñ­]5ÁÛl	Ð,Âè¾:g«KÁM§µæ0èszZÓ/ã÷¼Ð/ä·bJL° R9Â§ZCÌ« 4ì½Òhó<nIÛå8ð]zy ä·p³q6üZ ¤fÐeQâÁÛÕ¡7JHOäû¸Ëkf!+~Ð
eðÅï4+Ô.Yê)ªtãÖß§öj$±ÛÌ3qº^ó§oÑ75/»!LÎ=}îuC9±»g°É4n=M¡[Ã<VË@ªR÷Öfâ¹ÂWz3Ï¥.®+ïmYÚÞ ÷¯±ëÄ_þõaöåq þyþî#G.ÝQ¢ xÚãÝÐ0ÑWAu¿§
{w76L+Òe£s@ßoÐF@xtDÏ=ME>W¥1øÑ	û5/ðKBõì¸Û+3
¶½$xõïäX»þ~=}c©úÄùÇ°ÌzôÁÉê%8>M¿ìx9ïß»	Ñ.yvÁ¨Åß?áô= Ø0Z·
@V[ÀÒB¤$éñÑJÑñB=}ôlã¹À½Ìß=M~ª°¿ÑÇãkm@tðË¯|u¹º1¬òÌÏ*¹©qsc4´Á¹}ËÛé}¾ñÏ|ºÜöñs8Å£&Þ´J-ÑtjÃ¿&AâºéÇ6¥= ÕCÇÞµø6õ#%Ý3]S/£=}{¶>Û#´øvKçÕ¾i~3ðtÙßÀ«\C-ÕÌy.Úôxf· Aº¥éÉIúwóÛû<· ±ß ½:8å¢Åµn>5¬©³È«ôônÂ1¸5ÚÑ££aÎÛn³¢[ÆË= %³ëîèh4ª#ÿcþe7výÓ
 ¹>µZ5Zä?áç7«ô0K8P=M#è¶8Ýëã"ÕmðÁz31EÕG¡F6}ÁÝý4X»ËýÃ6ê>8tK7²Ó©Ä0Ò;<êw­æ$£Ô\2Nç#»ÀÓ(âD_í%©ÌåC)?ñû¢Ùl\üMw-%~Í%Ì\ñèR~Ãh'ÕÒÄø§°|C]Æ°ôgâÌC}Ø}wQ·Â>C?Â>5Îºå5jeºé,fÚ "Ï= r"Y¨8Uîè9Á(t*,ÄG|Å?)Ý»ÆbÇW4-04Jt¾¼oô<1n^ùª{ÌpiçáxH-á¾Uàî\ß+g7ý®âWJ>(¹MÓePð§<öç,«ëè#ëú¢T²§­cVD¡ÄZAF¢/vzg¾=M¥AQ
²÷
A¯õêrZêÖ7uù·ÒÉzùèÜ¯i¹¶õ_Åig@t]l¤­GüëTÌæ£C[ÙQàyo<-+ f´IÝÌ õÆ±çÈ­ÿzs6«sÅÏ= äÄô&gtR2_Ö#yºÑaKÍA%DQ+åÎ<Zâ!MBÚz·:ÓoÆ5¯ão!Ä4ä¢TxMûgä?yw¦äkxèÁd>P;â©Úñ|Ç<ýx3]ç¬KAÏ= ÿ¿¤~uö,KkÕºL@l«&ÑIJÖ2´	wÇà~ÕçÉây =}$ßR6-G!ÕÚE:j¤#%¼EzØwzüH/±}úuÉÁ6ÁäkdPô®ª¿QÍ#¢ã¶âËe<4 ¹ß¤÷¼sÑbõRÈº!Ç4oÔ/è:&7é§Ï3ÒÙcåËRÿ³²fdcSç½o4PÃÔôãzÂj-t½ê(5Çî«$7Àé}IÓP!¹jËvÝ0Y¸CZ½9ÆÔmçû.~ô¨ûûHÅ¶VÈò|pWZªèñÓ.iEØäÊ<
UÒ#3«!õ9=M
F§
¦ûöÝ<¡þÿ/|AüWÚKw×hd,õNM¶á<Hh08ôh$Qm¦d5w®·ý5úµD4ÄçJS"gã7.¸¨ø'\Üè"¦]g'µª½ÀrññYñR
rèõ[ßAMV#ä,ÿÑ>è&Ú9¾ë­Hém(Ì Æ¿åÐî=M¾tôæ._Þ)yE¡kVê]­P?ðÆ9
HVüç}%£ÕýÿôH+sðÆêÿ áéÏzä¯õ¯]?Ï¿/x1Ñ©*ISñìäÛ.OtB¿Á²Ò»°6Ò¥®øTýT-TÚõiènÎ-²ýò¬>m8ùeÙe'±^¥Ð²[®Â@@Le»~8v­
¬ÒÐ2|G¨N{â½øeÅ_2H²¤J5²â}Èd«_¬rò\üPÆH«2õ
)×È(  Ðð06Ü9ùyyYZL R!!èM ³ ÐÏPOP(H§ÿYe ÏPðo/¯µ6övÖúxwÚÙZYÊÉ&,¯ìm(Yn-®º:AAþûàÛ¤o/e=}@Nj¢.S{¤FÍFÿ põ&=}«¾I_q$®Qöz¾l,¢f
"ò0ÌË= ÐPegÖ·JÍ¡rÎC3SÇ¡¥À.Ap¦¨:±¤Ý¡|¬&I= g&²Dg±­Úbmmr¿~9f°#¨i®î.®X§Å_bu©ðvE¹Ì~)gp«íýzìInY¥îâ.9×Z«b2±c7Ëf¶Ò0ÆRÉlZ7$ã*¦lÒwUJÑlàLe±¯ÎdLLÍ®wÆþîw_f*i1ÊhÏ Ãh'½°özò«8ÆÚ©â°e®Êaðnyª*zra¾ÊáOðhù®*z2ãÜºË³vãÇóBVléî|Ëíà×»Ô§ý¾ñ­³ï_ÌÄÕ¢|§4×=MÙ÷%ªäQ6üÉ]hÅ|-r*YR7&¿õ´³i e= i¬e i@fR $Ó#¢Ä¹¸§É¬O ñ¦é( )60oå9£;áiË>¬KÙÑi¼:üÃÒLAäoU_^à~qY@Z vìy
åÄ(f'¤ekÿéÚÎÕ¹#BõjÃ¦,R¹¡j´®ü³¢L=}ÄïVW~à|%ñZ8z t$ìuïÔ'pÈª'£oÐëÙzÎáYÆö jF ¯Âb6%mäý!FìÁ¢ÃÑ¶6©¨i|Ì}µ³þ«7YÑdÜúû¡ÒNQdoYOßzÍqT= ~Ìî½D&>uâ'è{a·DÜùMK4Zc¾ßµñSTº{´Åî®Y×Ü½þd5â¼%5A§lLLóÛHØé£¶ÐpúáC¼9MNÌw~Ðº2©ílP_¼zÐ½ëµl-Ø4°o½9¤7áhëþ¬GÑhÌúüãR«§@êG*= ~jg¦_ ëþ¹¥@ìKýÇ(i¥ÞoêaCv\ùL7ôïS;¾àuõñWDº wôEë{ºYÇâÛ ýþfEâü$EçA¥8KûËHé¥ÖPoÚáEx<9L:LwPÚ2~Î©¹,OO¼½í5ðn­ÖT°pý9¦GÅáf·~«?Ñfìzû#RMD$·t(	Ð&iÏÌÐcìLùçèÀi¤Îp*aEùNGtïW[>ß}ÕñUd:ÔEí:YçâÜÝ~c=}b Ü&=}gA©XL÷ëÈé¤ÆPpáDü9NJwzÊ2N©Ù,Po².¯ ´ð·}È¸³?P/i@LÆi dÑi ¡i ]¹'­a5  ª?1YUG¡¥ÑÜÈº>WÝ%éÈÀÝÂÈåwaÓÜûe¯MTS;dÚú4®??ÈÞ=}<Éå)r$X;Å=MÚºjíÅñ¨ûSÌÏ«ãîJ{4°:]°!)O-Ký!c¢ÁG²}=}í­CÓÞëü§o]¸bºÂÔþÚægúY|·<GßÌ®'ÀcVuð¨ñ,¼0_bvQZ^[õ2{ûÔ2­USgP:®~ô ºª9zN¶§×VÊ!®ÐZsð#¿|AüàâøZ!«ÙÌ)tÝv0ÝÌíÍîaÖ=}*, Ö]¡ú-]ÐÙw2ZÞN¯²Zõ= ªcÃâ[ÅI°ø,s«ï^·º!½þRO%VäaGêÍ±¦á\´AfÎ¾r-£i,¥síëÈvñh#¯=}ÒBÛ¶¢Wóá¨TÝu°õ«¬}[mÜ?r__;=}Dï=MÑÂAúfÄîAz²v6ö¼ÏmÜº¸fF,õnß'G}Ò=}¯3ñ»³¹Ë¹å>T>=Manòïç*qß&fÙ©AùgùæÄb¤?ªûI|GFäÚ&e:'LéÐ(íZ®ã»>ÅévÛ_9Àvcïÿv©ãÁvïRíÓ³³·5Ã	r&ÌËÓàYüÿVgMêÀ%MY çQ©ÓÉy÷?DÌædæ9ÿxË>häÊ.ãÉzAÐfdî9,ÿz©ËB¨äÒ®¦óKÚ¥yïE
æ,ïGJ,ïI&,¢ïKÊF,¦,çbñ©ÜYÂu½SÃ¹3;ô³ù7è%°ÀE^Á²-Qb®hÑn1R¬()PRª°()R¦/èâ)B¦/è")R,cÞÒ)xa¯HÚn¥
}R0
òÊ)¨:0
rê)¨B0
ò
)¨J0
r*)¨RÑ6:Q>BÑF¨ "B,o.oÍeYh â.ÌOxLOÌPLPÐxPÐP¿uÿy?}¿ÿ?¹eC<×ÞL|9eG\ßL~º'ôÚ'öú'ø'ú:'üZ'þz' 'º(Ú(ú((
:(Z(z((R´ÉK6Ä	K:ÔIK>äKBôÉLF	LªW6Ý³³9TËs¾µkxá²{¶ié¦pr°¤°¯ò¬&ò,Ù¥Ù2­W­Y2+7+8+9"+:2/w/x/y"/z2©C0â©G0"É3¹³Ã¹ÓÝµ@+ôeïb&2lz¡èªN.0&²ö©Dpò©Hp2©Lpr&©Pp²¤Óñw>«Äþo<ò¤Ûñx^«Èo>2¤ãñy~«Ìo@r¤ëñz«Ð.oB²ô­CWÒü­EWò­GX­IX2­KYR­M)±0®ö$­OZ,­QZ²v%ÐÇ³³µôÃÝ §":ÉÃÂwº¤õ¯ÃwÊ¤ù¯ÄBwÚ¤ý¯Åwê¤¯ÆÂxú¤¯Çx
¤	¯ÈBx¤=M¯Éx*¤¯ÊÂy:¤¯ËyJ¤¯ÌByZ¤¯Íyj¤!¯ÎÂzz¤%¯Ïz¤)¯ÐBz¤-¯Ñzª¤1¯RÂº¬õ±CÊ¬ù±DBÞ¦J¬¯qæ²LÂBþ¦Z¬¯qè²MB¦j¬¯!qê²NÂÂ>¦z¬¯%q,±,ñ-1-q-±-ñ.1®/ªæ 3)Ë³Ç9rÖ|f Îêi Ìî\)Név)ªX+YV¬ÂI&ïØâ^ à,ù!R»Q¾ïÚüò¢kÕ#Râ÷f{ØEC !©AåF¤C"w½CÌ'j®óHÁ+Â5N Uja$÷qimzZuçN¢õþ-êëT+î¢þà)\JXÎÇj+
l|©-j'jÈJ kæöYî$ò½A¦ïV^ñk¸yc7dsøC3À!'<¼),s
U(åb{ãw\!¨Q½¦;¢w8ÞpÔz»mú#IÚ¯×÷Vlª_!­=MízÇÍn.0áõ^8á©U¶ 'FjHMjº0àùZXáª]ÿöPé¢^ç1B­5Q	m}N%@gñ	Yfðr¢QðPô»Ú÷U2£RÒA¹x7=M«Ê±f ç(¹LØQéVßE[ÿâF_ÅÝþF<×OEM(5W^ê¥hÎ dá}¨éeèÎ!qëxmÎ"l­N!pÌÍ¿äúgµÐyU^½0ÿdùkÏàùÓ<ÑÙÔø@´Ó÷YùöÈVZdIY= ÈÔ
^DÉý]Z<	ýSLé7ð.Õ¶t»FÙ²#TÆrbf¤Ï±Ï¿=}HYûP<eGÅÜüQÝ 5wü
_KáeHÉØq 5x~Uôka%Äàø4ÍÐõ×{]7!%ÈÖT=MPµ20Ë»ôKÔ²×ï1¥jå¡´ùaÓ¿³£O ið"$¢Q idi ·h 8h[M² ×¥Ã.çi	â¯dæÃíüØÆ~<¬wõùß×Æ<|ò¥LwwÒæC°b®Ò¦Àì@j¥Oò^Bzv·VâþGØÅ;NÍÎ::Zà]q v':¢÷££û#{{öÑâ@RI}þe>Õ]¯îO¥ð÷±<UW«ç1½âèá6N~néëéêNYòlÝ¨ Ý:GÂ^!æÑûHc½½,$Lÿ-=}×>HÛ<Û@ß>Á§O#Ëi|*É-øúIn
m+èìîì*LÂ?Ì{¿Êâ_rN­´V}I[Î B[<þÚÚØek\Oß1´ZïoåkäcÔWágò{(iP]sô¡Qz]¥[( ©g &hhÎdJÍãLkq¬V m.h©]EË"ZÍ+¼ü<¼XëBFzá	%ö=Mµn¶µNöù°yÉf}jÆmÕõÔ×ÓO¼÷TDý½Ì-[¡ÃùÊ¸Ëñ;n'v	þs{wu}yt|üªê0*çÿò2ç5&Ce±¿ÓYVW ^E.Fát5ëV³y çò@KO%
v¨¨Í­ÇNËó¿èÆAá((±¿û¿ZE$H½ðaé$·¶;Tê¢ÜI	@Ó±:¡|§|ÌðT0¡= w³[ .'½®mJÓ1++å ìæòÑZË¯_;1?¸Ã²J²M©JC'ûq´`});

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
            Uint8Array
          );

          this._output = this._common.allocateTypedArray(
            this._outputChannels * this._outputChannelSize,
            Float32Array
          );

          const mapping = this._common.allocateTypedArray(
            this._channels,
            Uint8Array
          );

          mapping.buf.set(this._channelMappingTable);

          this._decoder = this._common.wasm.opus_frame_decoder_create(
            this._sampleRate,
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
      this._common.free();
      this._common.wasm.opus_frame_decoder_destroy(this._decoder);
      this._common.wasm.free(this._decoder);
    };

    this._decode = (opusFrame) => {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof opusFrame
        );

      this._input.buf.set(opusFrame);

      let samplesDecoded =
        this._common.wasm.opus_frame_decode_float_deinterleaved(
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
        this._common.addError(
          errors,
          decoded.error,
          opusFrame.length,
          this._frameNumber,
          this._inputBytes,
          this._outputSamples
        );

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
          this._common.addError(
            errors,
            decoded.error,
            opusFrame.length,
            this._frameNumber,
            this._inputBytes,
            this._outputSamples
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
    this._sampleRate = [8, 12, 16, 24, 48]
      .map((e) => e * 1e3)
      .includes(sampleRate)
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

  exports.OpusDecoder = OpusDecoder;
  exports.OpusDecoderWebWorker = OpusDecoderWebWorker;

}));
