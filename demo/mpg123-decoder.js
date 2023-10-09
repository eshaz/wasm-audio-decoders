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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode018de9993d6bÉbÝ¾Ò|*U@ij:9qxVG±ÈAÑ áÎÕ(Àáè¸MüÉê'ÐVÌÍ¶gÓÐöÐÄ*ÐÑú]2gµf@P-Ke>ä2äèõ÷Í¬zÃ1Ü·êbÌkvººÍò<Új(LôÎ4³uá×QÒ«éÕå>°øq	qAÛÅ0ÂôBs©%	Ø3ÓÓß30îdûLô|ÔTÚ¡)YÀðE)Õ}-=MÏ¾«  33qà ±"0ÒÓQV¾¿Ì¾½0¯½£Ö´®ÖÆ×«Ù©¸¾cÇî1åTëFoÉFºhoàë°ºð¶téM¯¤>[²ùý&mÃFº;në ESoWwgph{úËrÀËæë÷X7;H7öÿ[¤	V&ä	ZÄ	X	\)UÜYÔ¬ÉYLïQ·M¨Æ?Þi_Ed¨ÜÃ<£O=}m&ÒHÐV ~%æç yòTÆóìm £YYYYDYYÉâÓM*6xb8Ôâ7w<Q¥HùÇóÛaÂbø5¼ÔËÞä¨ä¥£d¤GnKýv-(Ér@ã.,6ÿû5$*9¸Þ/ñ= øXÛ8üÝ FÖ^#Â,6Q/;RÉ¡7>I\Kç]ÉðKQAë¼;J\kt$´àþj[ê¡D¹·F«Q(YPØ¯{ÙÍ\CëR9üúsÇ2:õ¿Î>Êg¢]´j)å<èïë1á·³0 ¹|u-üÝ:¯ÎI;þ»Z;sDcå¦º<s ïzÒJ®¨ÛÀôs-S#ÌÛ¼¢ò£º2 áYÂ?¬çv)éoµZºnÜ:£BK,lÒúÎÓøDÜðQÆ_Z´÷³¢È¼ûY=M¦Àí»½mÓZÂGæ j*4°>¹ºüÍØË^ÝD6ÙU°(óY5&5»ç÷jiÝÏY ¤¾ÒÀáu]7e^÷ú½}ìxèbÏÊwÒö¶_êJãÞ :¹&!çÖøy¤4É ñÅÙªÌd¸ö2Ò3·
à"í××ßö®*0B°Wï»DÝöÙ;6iFÖÙõ¶é´l®ÂßÂ^QÃjªzï?®x³Èñÿ>ßÝluÍ9k¶+¯Û÷*>ØA1AÌÄDù¯¶gAnÏvÕc»9ñÊNÑ©;èyy¡Ü"'a®=M½c"û¾ëÁ>(_= gFÓXßúÃÊ³ðósn«ei®ÜèyB² j}am³8Úrj®ámýÄóSLØ+Nê?G	26\®;AêahÒN½ÓÓì0æÓ§¿-*yç&1¨~yëuEvGLOÕ:ï¬Ð÷!ISÑbÁ´ô°VG¥]jiîÒ×ûÒ $&¥²;_ =}ÿ>Ùd6vÍÏª  ë°FEab~ÄÄ5;'Ò¶ØN³D"¹C$@öÖU³R±G&,êÑk°²ñjûûÖéZ\¡oï6ÿP/2]ì°è"!(dHåâîþ\0ØwÒùêÚÑDÊl Ã#)ÛTÑEÿp']æ×<%5Cd
ã.%eô¸ue¨¡Ã®:ØXþ\d¬]/è&®¢DÙ=M»YW-øµ{å5É.ÒC°gØÚöö¢}Xkkº3ÆÐêþKÿ¤;= ïÜØv»$$¡)j "3üÜìd·ybÓ¢ )øý·ºc læ·!±®»Á+-5Y%×µ²&¾Û¡©-?o'»®>Ú|íºµ·ÐÁ·ß©"nÁµø«üü¼Þ¢Ëªåó&[¥ä.æ1IJTx£Ó«q"/K>½:IH ×s;#,÷Ñ<Çëääæ\C¨CøAÏ-í\+)Ûxjê½I¾dñÍ©´Î+åÒÀ$!Ü»ôºCDkR¹4vIcc;ço'øcpK«#eNGOîæÎÙù8¤c#£D+x¾Õ%*Q¿=M¹?å{&¢¶º-Î"ÞC÷ì;jÜ¥d.dÛ(ÈÀKâÖO¼I½qRKIc&Í<q»)eW¬Ëçä[ð[%éT4N¡ò@Ãs0ÐSXY@1¼ÂØÇ[«[ªóV]j=}qy)á1ÍÞkU¸*kÏ¢ õPQ¾Æ)]/¡= dW;¼¯$Yïº²¿5ÅÂFµUDPv²ÄÚ°"kÍ\Ó@jñ"àSBÁQèäöLÆ¼4¥XÿuGèK8â!SO[ÂOÃp£wWL&¨f=}¸tÍYNG«zpör³ËïÐÇî8Z;0NÇÔô^!ÆáéiÍjÝJsWxÃi©-è7ø³³¹Ú²&ÑàÔâp# /Oµt&÷©÷rbÎKÕCE^àpY=MScG­ îCQgbÞ6¯ªè!§yGÓÕ¿÷¢#»^tinîÙ:ÆÍu5¿¾DÍ@CCª<¾åÇ;×NÈ«@ÈÎï2gò 8F2NbM=}3Uà 6¶UQ¯ÌDÜ.n! ]9Ù¤vIë2º[P{I¹v=}ß±yô#ÙM¡âL±
I$~kÂ(íRär Ë 1"´¶P=Mk4 ÿÁ×É÷R,(¼W½ç{¨º}õF"$öÿTïËDÉQzÇ_o2¨jN5Ç+â?´U[f^º<(åý°!>û;í¦ÎU^ ¨îÜ»\§^Ò0*J®É¾]|é@E&,Æ_Ú^òÄÒÚ³m¼,½ M4wmPotÅøx%GnÅ+VaÑ,@aÈàdê9Pf&Td]Ï±ÛOí;°Fîôí>G]0LIDßærÊ=}×o§@Ñ0X ´në#ÐÊ61ð¤ÅºVov¾teÆ{
e= ®*GZ.UXþÕ@eÐW'>ã©ßRÜS\á©Xi=}ßîó%&raØ¦6ju£MjÆ½[ðFÿMÿj{Ï©{ÝåÂ£ªºÁÁîþÈ;¨ôWÐcSÐc~¸á->iÙÃød+ËäjêeÈRCþ§½n»Z­{®5ëÌ>/®V%g]±K²ï}û+Ýá²"Ót*¨,^È*Ds5l¹9ô¬¾§SÜË¶"ç&¢ÐPöü:x¸ÑÓCÈMÜè|ê#¬¢x6¨¹	Ç<lÒiwUÁAÃ@jlúá{ ;¼VfZù§âþÌÓ}ÜükE|r~Èø°ë+Ë±SI]ÖAm|tºDúd|/® »ßl¨È&Ö¹èÀ¤Æ¬K_YûöâgeáC
wÔõ¿y({ _é+äá®ð3fàÁÙ¡ËQ7~¥h0\í¨(Î&.íµõNÐÂ}Êºé}}ÓeãfG"$¤Þñ÷õÄaù¤Bºø"åÅ%9QóÝB.m= à>e ¹£Â³eÝú\'§ß3¥Ê»4dÏµÏHGdÅUÇ
;¥%Eà>UïÞÔæ­±Ý48-_7ètüù2DøjsÌç}ÞuÉ·wMÄ\L||qX«Ê})ôÙKpnlê*ZÔÒ¬õIµpª4+%2Uf<5
iF*Ô5}fZZZìÛ÷= D5¾/îGèëúb¬PqêüÄ
ßêØ ÌväËzÉÈuì¤4Û¨¡ú:Åú$&ÙwY#Nwñ§|Äcs*k"Í.(<¦.Þ5~Ü¾®AdîñÝ¡÷áæ#gE=MWFóí/Ðâ1oöëâpÑ·pY÷à®ÝàYÍz*¾°²ÀÓ¯Y¦YÕêÊð;aÀsÕjÉðûaôY°BSyaØóYØÑpñ\Ý}9MêÅædð^ø|o½bR>t=}xU=}>
u2Ô¿Ýé¿é.?éhI/>}þv­ï&þúùT¹T
ÅNËièJuXn×rY=M w?	V{ÝEn¶ÃÈ¾aQÆ²É-/12qU>^Å¬^®Jm;C
ÀfOÞD}}¼ªRu¦ú,Ýß÷RÄiQ Û.=}0ôH%û ]îú#prbTmìTýs ?µK«cRm®æüRXúÇjagºÙY V¤ììRNy$pÆéÏjirÃr"eâjÚöâÔO;óut®ñoXÏJéá ZB$ÄEÁý®_îþk-è+.jZçÀ³ê_L6^=}dÆ"ÿ1ãyì6b5ûrÔP¶þû&O?i<Óp@ÜpoQAi±Òfû88.uäfõxäì
Áe@ÿÀ	 ú.ÅÃzLô¿KS\ZëpxLõ¬gõkN=MÃ®Ê#VÕ{¹×¿ònËÏ~iºö!CøÍ4¸=M"êkÊÉÄËkÇ}Å£4zñjNÁÁÆø99TÚ36ÒÛ2aE¡Î+hãïoèVÝÆd}:1Ó?Ûzën=M|&	û°Ähl×¿Ýënàúqc= vä¥
Éô7QÐQ2)»Dh­(ªùÉa?øþs1öh«©×L \¯PÜÕmÔµ.L'NlB<æR> o°|Ù|XLö#t^LkD
d<î=}Ì²xäfOxóÄNDõÆ ÌI@HºÌôà\Ìw,ópÆâ5Te$vìÛYõXJ×o:H±³)à1;¾¢+\ßs)lø#P®ã¼±Lh3?ÄfáÑ¿kd©PZ^$Äþ"ÏØèì4
ØKoøoE½ÜÙ¤§ýß/¸#Å=}¥:ùwB5¨!¢«=MäR÷6D¶ÏÜ\ÄLmk¸óÝIàyÀ·ßàÙ£6ù,6*sáÌDª=M\ê=MíüÏ|ÊF§lÜ¨ó¯ýc¼=Mck]?vk|=M#Ö½
Í = oÃK»=MmÐÛÿ©S¾©zÓä°½ÈEÄvòÞÂQn½×é«%´­4û,j=}9­_=}	mø÷V8P1kí$ÆI± ]Æ×Zªë×ìä= Ä*ì·U/Ø°Okù¹÷s{&^½p®3ü|óóóóóór{jÄóóó#?£(11¤»ÚAõÛ4ÑXVaí·åÖr62ÍXÃÙòøùÓd6/ò&¯3Âx¦*47#ö&cYô¡á= ¿/àj§ñAÔººº§ð§D34ïtñÈ¨c50²3»à\'çÓXÁ.²Ü
3Âò¢´ÚÃò%-Zõ­íÜïZÛî
Á&§cq2/O¡Wi' Ý-úZC¾÷ÙGñZ?=MÓõ¾ÒO9&£îªcÉuï6·Y'#=M·§¯:= k[øA<9&×X'v49&ÖLX'f89&ØÌX'Z	àØòZµµ¨ºM-ß9tágÒþÅ
¾ð*êAUÏ»
Â°jêAQA~VQHõ©ÒÅj"y/¢ò=d{XMq»çò3Â3î+Ì¯%<0Ãqÿ(6°Áþ¨?JËQGâ2©Q¿+qêÑÙèUº'èvÀÂ}oÓÍ«Ð0.yOòø+¹xÍfAô= W¡çÛË±Üa¦ÊDwçÞÓ¾ÊÑå]MÛËaj¢Ó±@/0y¦â^.	ØÙ>kGàZPMøÒ.q51ñq0Á×Ö+ZÃ<¹N¥£ª÷µ-TH5m5âÈÝSÍÕf^=MRù«ª9xïÕýoµ]"JâÈ_§ÀbWJò¦ëé¶/t|T	+µ«Cyf??Uèÿµ½¢=}/WÙò¿´ÎùÅ3
Æk"»Å{}ÿøUnØÒAÛÅiÔç1ýq}GôxWï¥arjñ3ÇóÞ!RKUaajÔRþ¨ëéµ/Iy¤ª¢"aIâÚ:¿}ùh@úòµÈ·íDØ!lÿ%æ¥;¥°XÏï|8ØÛW9ôãæÊ§7TÆÌ8[´¬þËàÑt?¶8Æo	?ô´¸8Oí£Xa9	ý©T^{[Y{¹åÝ~Íö:ý­%íßqMïÝÿ[Æµ¼Þ)@ÿÿCîç<¡7tÙc@qÕÆ}F²ÔWÆ(ÿ[YkªÍòµi[ÛuvÁÊÀj
paÏkåÏË¨¼~U>ÍÒ"Ä×jÓcòãh"È,õjsÊÅLÜ¼®üRØAÿ±Ý/6Çê7Û´m.·2aÁê¾®Ý7~__µôÃ=}qtûßø<,4of5úÂo/Ë)7^óe}³RTÔk6eùÃI¹Ñ#ìÃÂ¶¨¨SØ¤ v+Ç@êMv0bâ^Ì£@
úîmä%í'k#XdÝÊ|¦læ±7_à°|-%d,4ê!½U53}T >¼úFµ= UbI]zã¡rËyW}´Äoziúî3Òkïú4I>òtCúv$Ôøs¤Zê7Qd3 dvPD¶´0Ø"D:p <Lh0ÿkwM7Û03Ð(Qº7º5méeñlø(N6³ÛQwËË=MV(ÖòOW3}et·É4= 4/¡à(¨JÕß¨Äºk]3viþÞÛ>3'æ+êre04imÛèþxá^e±^'ñØy=Ms= ë=}@ÏÚ3üÎÑ1²m1fs!ç½Áª=}DÆ¢ÙÚ/øV´¹£çì @}Îo*ÿî$ûß/É
8:MfnÑÏÔ-YÀoZµSXÊ+î=M:jÚáy6nÈÂÿÃ¨H¥lÜ_ªò«@rÙúbËz½d5á(Ø>©¼:{ßàý"Ç¬ÍWùåÓÏ*#Äºü)bíz8ÙÖ¦"c7*x$æ£  åLÕOª±ØzÅ¿³Êî»EÀ(ñJýa
UÛGq^ºÄàWêómÏcóWft=M&³,32©=}÷<Õ¾åª×mÆíÃ=Mø²Òßåí~º¡*TÕG[{Þkf~.ýÄ£TH1áï-ÄðÖ»,­»k?íFd;d|h0[= 7}Z² ËTD¼Ú²CýøÎ= ¶Ì>"¦"Öw[§M¡zË¸|¯Ï®O¶S]"8)Jsåt¹+ûlN5Ú= 	=}Ôä&.}æõt7Â|ÂÐ~ÊAzú ¾hÉ[d[ï2Cù¤öI9<vï:­.:_AjÆuülïKxô¤oÃÛ¾3µ+E&üß¯ü3·ã©æyÐ~ùqSXøKÖâùbI±èZ?Ã¨ç³¤èÄ*Wqö<jY²kÊ|Îtdç*ÃÕ?ÅDÍxzÉnÇÿN0wZlD'[g{âQ°ð §*ûH²t¤ÂÇ×8ËÝÝÇéÝg&ÚcùP=M
'Íãld¯gÍÒU"CQ°*ûJ²t¢.TTS²Úp´]D#]:î^=}§ÍìZ5Z$yv4ºuÙ÷*³^îØúÈÿü»>W+n/ÒM°ýñ\qma7Ì¼ý:tg¸\¨ûÓ:%5, þå,×d§!&ìó7çü;Cü:òà]ä{	ú<â!m¢=M$;ã}¨^În­©JIñ¤2Q¿èGws¬iSþçÐÂûv[å6mM&'éa= Ì¦"ÙH¬	ÒHÕ|=} z¦Uo{,üüDo\ÀBÿ)2í6.@ª¢*ÿtß^úÓ´êÓq &ëW=MËzsàfí°ðw§C¹n4VòUÞÐMÍWÉS¥ûñÂ®Õ'¯aÐuuÍ7Q~dFõÞÕ°Wñ£õ/)¨;ÑZüþ&ùþ9û¤^1BÅËr@Yñà® ÚA¶ñ?&°òGÆßSºDsÛÿ1ÙÄÔWiúáYù¯âó?VÓvi³^®ÅÇ· º&ù¯)¿°n½îÅRAFç°Ù}Édè±GÚ[4|'2S´³-´©c¸Ä¡gF±­ñí%ËAÖ"~¯ÖrùÃZË´5ãOÖÿaâsG^/Ëéäê;¸D)ne Ê{ýêF;MCøC¬Rñ®dZ^é¤ÿ5N¹ºooFÛÕ^8Ç=}7+Õ±2G~·(ÒAþü_ÞÃ­¯÷³ÂGÉó¿úºýØtýv9]8mô¹Yv<Ëpø,ò¹ATY"2\[Â8æÇÄ[nrÒ¼éÜñÜEû|éÌ Tùì,ë/ÉHXÍ$â­f4Ü1Y°Ôâ§y RêÛÍ}¢óQâEÈ ú¾#Ïµ¨{¦×Õ;ª.×é.,ÓH	p­
IÒé7³¡CÜës§EÀø´&°iuUÿÇiÀ >sÄ¾:
»Ù÷&_óO±ÔÄ<hÙyjks=}:>Q¦q´>Üð@¬ºò×Ð·Üâ÷Æt4ÍÇ"fÇï×ºóO¬U8´x1á3@Ðzþ NÖa>Wäø	ýèîçh÷n¥ÿ:±½ÃÞwceñ9èXT­ÿc¥Ë³ jÏ	]n¡F®qâÖ«TjXtGP3ºÁDÁ²­
n0õæ5È3Ô¤3y¼{Ó\=};UÈs"UåÐÿ¸íîµtCö	.ÈÅYüeKÝA|)[&¬oæL=MqÚ1¢â1(/l»fÎÎg(e²h^Çá0É]=M7Êb»ú5ÿ©ÔFp1ÒÌåc])Ütªüögg\ÕâÁð{.V¢\$Zÿ²sB	6ú!þ"$VýF8»q©=Mígp¥^¶8á+1ª×¨­4ÎI4Õè÷)¯þÛÝôçãºâ§µÁxïÔìMH¯/fË}O=MÕÄ~C.äï[c&s"ß·©Ý5X·ùÎ]ò7Í6è{2!.¬ ìâAÕl´¢z¥2=}'¶×>?D»xf~aû¾Éq¥¤6ãbÍJélé¬_Ø§­áR]'qãþ¬OñÞ4T§Ó¼"6þÌ<ñÎ^h¿ö<>v#É¸ºçÕV)÷hGåÐz[Ñ¸þ/½f6®Ùó8¡ùã¥Ö½ô¿ DãLK³ncíD¦#§MëÅzáV©N´ý31uÖú 2fq75C=}tzëøÖ«	HHâÁ&«>1e¢5 ÆrÈëÿqîutý"eUÓ(±u¼¨VÎÊú©T= §ìùHÜêàQfæªX¢¯1?¼Û~[zÞÄqHü'TVãYøc$ÓXv6Í°\|<++îaÅ·zÆË*W7ep,7¥½·:gúÂzU¬8ôf¥OJ5û³ÈØSÑHò¯.D£XÕ}fýLÁç·*eeg+y +yùÏ@MT«AÒd D§ç»Pç £<ÞQu9jòÄ¯º)Ú·!\Ù¢]ªÞàF)Seðd¡=MÄ²¯zÆWm=}äõ¸44t,þp>ÈL0bOFä©X C÷8/zh KªAªPèD%úù¥Ì=}o²èE÷o;}múí©9k/úÜÿ8vyîGP&+ÿ74ÜjÎVÃK%yÞ¶wcO$ÍFÞõµS¨XG(};[~1~.¢"Jûã·t¹6fxkrãùg/FÈþXsÞX÷èlÂ>sH;l¶8#»J³W¹_R5?kÀ@)º Å¢ÄJµÁ£§VØ9³ïuÝ©~ºÁ0þÕ@þä5}Êmâvd»Ü*;êòl¢Kog©"%Ä¤ô
þ_ÇG:F"ºjKRìvÚÀ@oÞB.ÄoÄÈvÛoõÇÕÄ"¡­7Í(àÖµ;£kj,&üëÑ8ÙG{¯&Õ½fÙWûÑ¹¦:uö	 JúÚ5,njVÏ5¯Ì&hÝÅ1+a[ LG\/°ÉRK2ïß*qÖÐ©/×Ý£çK: ÷-àãÁÈº~ËÐK¸9.¬ZÖDf~æÐCçöOèÈAUn"rÌ%A^ÀvpjzÌz2,]ÄåïrQVS¼´âÃò[¾ôOá²ö½J4q´µ(c ½ÂªØÕuÃR(­ì\öWËþ·tÈb³B\¡2¤ó½½¾Y±E¤·¸Ïç¿Óeo/·ÐPãuÉTk´ê´#ûM×ÂB×MÇ!Á?ûÁ:I$·¶\ï=M¬²l¬ÈâqÕ5!Þ.I!Mè,ÏCd{ÚU¥À7ðÓ"ÛY5¯¾0Dþ¶)ocêB.µ·­¸c²ÍÎÉ
R.("= 5M _I= üÚ?îÌ¿X»¹ÞsbËxûh+\}5w#sc)qobì0(VRq]Ä1ß6ög£§ï»l#ïiÄ0¥øj}µ« ÎÒVæ(Wo¯/^âbÞ1Ýix%ñq¨B!=}ÂEL#ßAÑÀA¢äL×æzÓØ<>yãõ74îRVÎTwãS2ÐbuÿwÄ= 5ª"ß  »#ib¤¶*UÜ)1Ê¦Ï?ðFÐx6ú¡âºC=M0JZwÙ
_Ýrð9Ü§kµ¢ºÈG*û§út =M§Üª/¤ÿd=M¦Õ¹¤2?SÐDð¤è®WæÍã.zqÎ2?Vè©?#'p$3/²ÈÜ"=}Ñ;ÕMëR?ìÞf¶ºý7öä³= Q÷O¹]±Æ0])T¢WB¶ºì~òÍZ>Høk*ÖæfX6[¿½mß	þËk #ÝCÚd~:nÝÂBRÍäÙ3: 
a<Ä»"*´yõå×2E ýÒÚÖ%;o)"BYmâ= bjâò1$7/¼ÒFN7ÀF«1j_Ð¥ÉÓ£°Í</:59¸ÿøqðÄÓèMá·¸¶ãîÊù·HoWÃpZ¯Ák¶káüÜâKt2µ;®Ñ\ðLQB,º·ÑÝgf6ÒâÃênb@êiC­Ð(²SÛÌ®|)Ûwi/¥4|r¾ móm¶«cb	dc1¿ÁÄ¸#0AlAq1ÌíûCÃÝ±ÐâFËqÇác>S/Óð¢8$wÕ¯o3¾Ð.Þ/§7Q&Ô3NªöÑZpófõ¤¡1ÝX= Xp«¢BÔº#S¯9|S£Tq,<B:Xj$ìV8QØXDÏrÕoö¹«ñ¾#oôå9óàéîmV[2 ÞK\p^Ë8Wñ#@.ÏÀÏCbÃ$<ÎEþ'µPDÖÞ;òæ'¨Gñî9ûv@ÈìáoèÙìÒEòß£ëïÁîµÈ§lÊrDíêÓ
a;Õ²Oò^ªÁu¯WÐtöãµËëÛò$õ§¶s«RÖ½ôÂ"Î_bt¼ìR§¿9"±AM+¥C<)iôd=}TlB¸ì°^Æ&¹ÍEä½é"E >é·çg¯v|^·>+kjX= ½½Üà(WyaØT±®µ2ù\nÓ0Ì]3_§#¼Á¬Ù(áWåw¯³^{±%=}¿ÃWm6ìÄëmð=MÅã= ÿhn¨q«+®ÉÈwìÔ^'J]#±ªÒÂ0PRÀOã<|iÃ3uºPo²0EáâßïÞÒþqâ÷ì¥¦å&Ç gpuúxg·"WjÚÉÉ{Tü©pTX!p}ñ¸/ÅväKð92Þ4O°\rú»Ù  ëÚ¤Nîì!ª=M%­4¢«Ç§ÆËß5CããÑocÙÆ°$Þ¡[ûð9VtlqÐÝä0ÆËú¾S·ny3S¾&ê Ê&RÒØRµ$Wò«ßÖ68¾»H)µYNZDk"kGs~<	¸ñ$äwêt7xå¶âÜqZÕ
é<ä=Mï»ã[÷aU'z{¨ÖY;P]B}Ä£lW¸}yT ©\®PìLbèzK¬ß±%¹ '»É¥ol (ûkóÐqË¥¾öê)í÷S´&È«¾8UHâ}eá|NÁ5_Áý~\M"7JË¯õcóêõløÍC/{÷èvïÉw>¿³_2±,a5¹±ÛeUÊMï¯w®¯lÖ0Û4ZÅÕÑç¸Z?ÿø^nk·Gk¡¡)n3ò±³üÒ#d¦2­þ%¾=}#ÓiÈ§X~õ ³nÐI/ëxO¹A
.Õ(®= VÆý	Ïnm<Âp=MÛ×UötÚ¨¾÷­üDrØA¡6sS~ûÕ'HÊ'Væà-Ü.=}.&ãË]	ØÁöÌyY3,ç b4¤=MºêPuG^4BçX¹ Î¡ùh;Cð Þ\lÄñÂáôúè¨Àøþ§Ìù>'ã¾Só£Àe¢âÃMïºìR£¾´ßiA}ä ð|¡Ààù)ñTpvê½èâ­øRï9rºîf¯.º£å=}iwI[~aLvûò¾U$L7QÆqôü¹´K$ %MVã),ïT=Mä¾ÃÞïºb6T5TMpõvF,eÝAúO³ü]yãøA<ñ ÕuU*/.ÔxL :¾Èûè=}Æ.ìDøOëéAéñ( äÌ²kµ¹,0,ÉÑ¢7¯xæ²ß*àIÏÚÙ¼mêT8ñS%"|çi"ÀW°}²>ÚÊ<èß\ÏÕÀ'Ãgâ7ëÌ*=}7ÔÃ.;"|º%¦!áà]À5ßÚøþB°pùcquSPút¢¦éÏêÉî®$XJ ñÈïÔ;CðÜö/w/ÕÇ=}Ñ¾EóEPµõûÉPí'â5{»æÑ4øÑËöLÓûbR³÷´*<qÛ>ÆÖùOXåmÜ!ºP³x¡ $?r}õ»¥N÷ë­¬a¯*æÌtÔ1{=MäóñD|Ì}SÉB¤E£Wt9£Û÷¦QXÓ´ÉQâ>·SâÁÄ÷"½ðT¾/îÒ],ÝÀ£µm.[¶n w·äLs²Ñ¼÷³rî·ZÚ¢xÚ{ð°©ú¥»Ç£Ó½Ý¥ª¨BY¡P ñb·~Ö$AË±ù»ÖFF± F¤·nÎ0H>±ï=}>*Ld¨Ø_få7ÞÏ;·ÐlÉDL)õ²ÁÞÌÔ{bS¶k&õ	SQmø, P@ÁZªElú»KîÈFr9Z	¥ [ãgõ_hö¥Í@±Á*ø ÕPL6¯Ù¼½óëÉ9©S]kl#¡xÖnäÃèóÀ 1châË)kUAJ1ÿ´Úö=}SyÝÀü~§¯>°çz\ÔíGåz¢9CvÜÉù¯mHc²L55±tþ+¢eBß¾è~d>ê?]'TiÀTmCÜavÄÜQðQ*ýC½õñô n#J±¨ÑNÿ|ëÏcsuBÅ¬#¬:9ST*ÃÉEzéA¾Q?~Ñû^y	I	>b>à@n~Þ:i?ò7¿âe+Aõ;æ¢sÊ³s«P\ºçq¾DÊÃYÕ¨£Äðt êUV5÷;Óy^ÎÖú ]NI{ÂûMb²Á:ùêåÌ·3õê+õµA8ð¤>¸¬ûuÙË-2KQëÙ!â½tö&¤ñWtÔq=M¯CiñÊG Ém7Èi]J}kõn	[õî³ÉgéA¥g¼<Åëi&ÜåË/?Z	k§}Å¡}EéÈ_ZîI#ÊB³ugîjÞªAH$cåÅºMÆfCfN¼¾(= +ÐçÅ1ÐÍvM®'­Fsq½}·5¶|Ò?6JÕ£*ÈxL°)¼4ÂªÈYyDõ÷#?:ÅnII£û+á"QÜé½¨Ç!=}ÜLÊn/g[^Éåsðp½Ù~,>û/·ú+oÙàQ÷W¿LæB´)PzFïÚEÀ{²ÿµC3 }_þ$HÇG¹ÝïÜÄ?Ü/ïoÎÄ~zx.,&ÑQ*!ý¾¥­s¥Hhb²Ä Þ OYÐÁ>H2²¦ñò9£C©îa;Lenê$M=MNWÀWí"üd±è^BZÚ¡&LÏ-0dI,:Ï=}èËº¯Î;yr²ØeÓn,ãüÊ#iÏÅêJÙoyî"}6$ÖCw= Ýh¦rÖuðO	O\rÕ¸9Èù¢;Ö´W|H7Û¨GNÓaÈu-qª¼¡üõW,^]rzÅk_»ëáÞ<0P¹ÛwÈu£/¢iGlßÖö¥·zÒàAú8 &nLºeZPÄ%)6v5ñ?ï L]´8b ª×WrË|nXoÛñþ´*«Qý¯8ÆNÆù?J°/u'å5ôO[Ï´Ô{@¥ÿÔ±n¼£e h]àµîÚg s´EöoQdàDbé&ß¶÷ËN8¥K0Äå»å/cï
 ²í5í\ç9 º+=MbÅÅÚ=M)¼Æê¢7xËrÃ|êå Ùê2éû$ "6úÎFßï"éûäÕ»A
Äi¥{~>ÙXÖKçë</á=Mê Ö(ÑùºV«ÐT*F1õRÙýL­=}PõèòåQ«ÞTÎa¾û]ë2êiâöa¹a¹³+lVìÖsGg±j vK&>ì­îgjPX.ÿÁ@#ª$fYûOyIÞþ D	Y$)	3RÊ-ÍZTªÝïÞGÍUNe'¡ÓscÎ['íÌ½lWéPþ3þÃ£&üôÉÑP¤®ÁdªåQ¥ì\î÷7pÆñóiÄÝ	-TÊSì/1|^
B³ÝSóÓñ\[y­d÷ïñ°Ðfàäµ{R{ÐÌmå[öTb[»=Mmzöcä)ó>ÓÅT]D9Ìà@6½ID¢Âè+dçéj?Ïõ ÷F¾hn¾¹låËõqDú@¶k\DMªiêÙ6ûg= Ê)ÊÎ·)ÕÙÁÅÞõ²ýùJnÐÿ¾|þn£eDÍèíÿ<ü;p
ì	SEõ¼*/8hºR|Ó(r5¤üñdþêKYklkì¢ñÖ,n±Y3õºmÎ±'(£÷Kh¬%¦3^èâ¿Î¦íÆ¯ñ:^»÷ c¤gr²¹S%BüjÚwj)=}B\FÄ9·1b85¿üókI ì{JÒ9ÁHùGrVeÖõî·eeVºccÚK¶éÆªö*fî
3µ
nhì¬÷
l¿"£¸ÿó/}}ºK»,ãâ1ß©Ø= wKv(¡a
zc÷×}Ö° û1zâc^'Ðª_¾biNôÖCëÓr*û= Lù\¼c¸þ²ìl9a<@Þä@[ý]ßü:,t FF!|Þ%Ó»Æþþüýþ!üÙëaãìO'éJ&1EÅIÒ\ F/ìÑª>©qzt"ßJb}Wqó!¼,µ")ûV/÷¸·¹+Õ	ª»÷,Ä÷¸ê;¶HÞIú0p½àðV<êÆ÷}°æM>Ð¯!³fuÅ¬n4z×©¶K/,¡%?È/E{j7¶8ó©
Þ= csÄt26FKöç¿Éz(%Úûîôÿ  inmà«qØJ1Eý'økÊñEK¹<¬1tÌóXØSÀ§b%G|÷[îO{Ù_¬aÿÿ¬bÒI
Jbúü:Fß)É·Û{ ÔR5é£¥ÓM¥©u*m^P024Æã¶ÝãÆ$*Xb+üÞ±ù:	³OsÎW¾÷ÄÓµyêã{­:Þ#­Ñy7Äu@dÌoðÝÎÉøF« d= <Ì¯ F!G¼2Ûj}3º0t«UzÆÞnµnlûlj-{"¸§z³NK_\þ¯Ò6 ÏÄ¥£ì_u2IqÕ*¬ÍT¼|Eýkdp/wdÌçø¦,öV.qÐìÚBoGäHÜâØ½JOó²iûµ¡³2{@aéhç¦'O üá ñ¥= /2R¢¦;gè[H-JÝB$èÇ[[br£@YØú8äÁyîh;rh¯Há<u"ÌÏ¸
¶Ìªé¢wÕAÐ§ÿá
°6%$û]E¡³^
TêpùÊÆøSEhÜÊ½¿{F¼^ñÐ,- 8= <wÔ¿Õ§[pw{ÿ\¢ºzÎá¿O3­_2tð,­cÒù×K^Ë·Ö.Ín0aîakwLKÎÚ?©ýö0ºHæÂ)9#ÕÄ÷ÉÜTâLX·uÛNÒ¼#KÚÜO,Ì7:¨öì/j®.?ÑL×ÆÄçÙ/?J3ÃPûÔ­¿âbhÍ*ÐÆ6og? Ù¼1_ã<Ë«þzÐ2ò<ÔK§¯p86A{áuÝxûÀ½=M=}{³d^Ã¢D³Í®!ªÞ¼A²áf\PÜÒ÷î&ð5Þ!ÂW6ß0ìI=}§ïé0ì÷!q=}¿Nÿô\á2¿æ´4EUTénR-È£äuÂ@µh¹ª"<Ò²©8ÙÃqtUU/<qá*ãÂ3ùÐXHQø©¶¢£óõ¾²+gº$Ò¡w0ýKrÛ9âø±0X<Ù£;9o,ÒN0lÍR÷+Ôh
»Æ ±4¢ÈrIâê¬Zv:)[ZÜUÀKü'RàLªû£üË#k»ÄÀÍ|$].= ð¢âªE©à,¬¬:héÍ=}S©1¸dCo+¤2Göëj´Ué³p}"i·õKtÇ¦¤sN"xøV@ÀØ©;1Ëuu=}÷Éa16µ(= &×wn'7Ê½/µòøñ!þfý.ëµ»xóc©¸V¦:G#ccÀ5¸êÛ®8æùùa)_YÒhsAÝ½¦HÝ@º= sÿN ³ÖÍ½ßk
G%âh·_"£éEìQv×/b0£¦ÖéçÈ+ÁJµ?»Éöù=}zôSòLG}6x«Ò8­L^:ç7­ÖS.?JïÁòuI§&¥2o²úøXt		uCÔh¤JØ:ÁÛN1ÎÉß/¯eÜràmÂ³Ä¢Õ<ò\B51qâôkçnèVÏqüSº

°'*e­!r-ÐeRj-xÔ-JÚÄØ+2ÈÏèm¤·Ýµ/]BnÌ	ÕýÞhÍØ±­G¨¶÷)|ßn)É±°Ûè}|1p7:¤·Å= a(É,F|hBâ)ðjáØ ø²~êC'i æv{ôù *kÉ$rà=M¡"Ð¡ðâ÷Á¯à·]3dºKÐÜÉ~°3»Â­Ãý{5¶~è46±<-ñ¦6_þ!Ð¦ÓZæÝ»0!.vÖÖ¹~(nx¾ÙaüãZÒfÅ·uz]ìa á¨Riö"Èõ·0±YM­´Îg5@3 Ñ0Åöp= -¤_ZðB$Öw2Åª;JVidUð]ÿç µ9üãci{iJêE­©4Õv?7ªµMVöæÇË
Ýbþä¡,mnÚ¹8,WÜÉÕÊV¬½´B//O
äáùR-åMÝ¦§ñ¾,#@6+ÃÆn³¸ÛºdXbÖ1GWç¡%^ÁÓÝ|¤{,Ø±P³bÙÿÛzÿ1-ÕyèÃnýàëcir àf×DxÿáÆVÍÔß.s7wÔ±¥Ûýô¨þ-R£BwUIÁ»ÅÁöOÁä9üKÔ½®Â¿Â³Az-¨ZÑ·I{©¸RmdsÎü2Kj4«ÜQä«QlXàøÜ1á?Ð:ÚaI¡â½XÓ¢°jçqùaØ;¯ÖÛé·Ó áÄiIÓÎ/Æ¦úe4üÁ@³f.Ûªµ.»ÁKåM)K4W¶È>ÛÔSé7ß¼=}ß7ÛõªYj*_;bK´?½ªP5§¯_ï= Or«V¦zMsçìO$¢Õ³27Ús.dþàww­JÃ<¬8= î@Ùðì²Q¯IÂC
æFX¬o:¡ìy2jòg\= = GË§ð,ÿ»ªÙaèxàÌX-yñ¸~ßRRÙ÷Ú/Ç£ÒÍ][ÁwûÃY}Âë¶>)ÅIüñnÆ¢É¶4ËÃ×{EáárWMH-F$zL!ø¦óm;r©üxÌ½·z?ÜYâiw4 ¥!ÍêD¨JDk?Éz,L²¹ã@¼nÃü;Ff=}tEzBilt×Á+RV¶w¨c vøÀOø%y,\SNÌô´"$ÿá®¾ï ¯v|z(%Æ_rqCfåCì¬ÕGéÌ,.MH~.,h¤|èô§÷.|¬0Lõ³ùyyL<×9âÝµÐµ°){0;´£ÙíÂÓù­Üì<Ü´³3édquöàY;ÎðÎwÃ®aÛiÒ¿UmØWzË=Ma+áMËvîôù±}&ÀáÂw¸VËSD¸¬}ûØP°[IPfiY º?#Âa¢_è÷ã% Ó¥\bõ´JPkDÓqF[V/7vFXHª®¯½wöØôietSÇx\¡p7­Ð.QÒ+ç]æÎÊ1M/ k"¶÷R2mªw=MD¼¿Ùô¡ÿ[!S<Áz7fõÚ~¶!>äÌRQxçè «DÓÅÁwtNÑv'çd¨ðp:ÖõX4ª´üº?çæFò&Ñ÷lÿÂåbÓ±hÓºJ2îhÄ¶î/þkäë:f:ð[ÁCÖ©Âj¬ì9¿?N»C:ÂWssÒÞá°Ûÿ·c3ÒN¤7æYÓKãßf!÷Ní§}J =M=MTÜ^6l&|²%½uõ9·ºi öI<FzS	,Wq»_à©KâTùÏî¹Þ:µS"oà= è^0VK¥G:|Ùán_ìP"»ÏÌ²Ï]«8hæÑºF¸]µs¤Ôj§­ê|åJ hãz»$êÐ7WãèéSôý}"ÜÜÚ@°ÉÐÕùaäoxÿàSïÁÔ= UkÊ¸´Çxjè!âÛVm~mo¹yð*3®QÝ«*×6fcbã½î¦îü!eoA#lã3ªýª#,·à7eÞö$ñ]sÞé[t;P¡I8hÞ©!ý6ÐÊ¸;*¹p³qÉryÑäA£= Ö½,)÷°X@k*v	§b«$±çWt6m¬×"ã£¼úÙç¥r¸'= 0mtX6÷°;tWUxênÆçºÁäÃ}ªfÐLáí¼7é&+= M}1zýPÞ«ÕÎ+«ÒÕ~99¨áRÚáá£#dßçM3¹RåòvúÎÛ3qqÆªPéÿgÆj©Ë:X!)ák©ä=MB:¯~Èº\øX¤seBý?{BðÁ±EÀÛeBxYMl.R¡^?°Øfü6$¯÷î_FòU}ÊGÂêÚäûÂê&¢¾PDS¹8#i?¯ùµÙáÿqäQÄÂa°HVk3Asè_gõzçt4^g 4ÚxI4B ^')ÍøGò×p£2ÉRV[cÑø|Oè!+ùÎøhÎøALªA×Ì½Óó·p¬ï-%¬ö-mö5)¤Þ/~,X­Pë?mÛ^Ê;äèÐ¢<¯¶²Ç&Å;¦îM5ÐîXmîvÐ:?ÂÈ0¦$à u|K¦Làr¦Ý;5i¾â\)p¼;«uMÄLkîÑáº3ê½¡|(þÈÓñS=MñYÏË+&=} õØ÷ùÁZðnÀ1ËËÝ0mâ$ÐÜ3,Ñ.«{¯0ÃL= ­¯$öI8¬uÖ¡G*$7 ðiFÝVT¾b[mÂV*ew¢ÇïtÒIröF¥týêQ'G¡«/o>\n§D28ºV½9w»	E¼ôþE&zêµ°¥Lù§¸³iõbC0/A0G¦kÉl±/ìØÞ½\r=}±	È#Æ)º< %ö·ëo·nÉ±ÇpÝ­GÒµN,o³ðDG>«1ð7Nýê¿Yæ¹iÅ0Rga¶¨¶º0 ^ÒÜøA¬=}­r@ùZ!­ÖÀacÆXÍÙç@ÝpóÅ©Hú9XMq¾¤|¯R@U{v?F|ÈyGÑÉÈ©òåÿdÔQO×7óÓE-ÁÂ
l0~OD-Õ8Iù%·oÙS3=}.YÜk#5Vãt»óâ»k²7+5D(ëÀâú\h¸bßì^;D2ØS?S$jÓLK@9³eàbØ:kµmy¡ GÌTªQ$jýÝ¤¨ï#£È3YDùÈCw´rÌ¶4Öf Ö¦Ö®Ñhwµþ¦ÞZXS[êOÇ¢.@E"$i¡= ÌÌÚ¡è= <!=}^ÈY¯Tò¹fêzIhzÆÇÚ²Êoa²gE¢þºÚwXè3È¢Þ[QÈïñt	êøàµ(= É«lÑÌ[´WÙ¦nÉszsº[òÛ% ÓæóóËyÉâ\(¬£ª!J t»Û©2&ÕÛÕ²ô!RÔwâõÔ¬oQãL¦&Ùó)3õ|l= áï'ïÆë:]Ã½¯¦ÓJ½uùðùpKö¶5Iò]4-MÀ¨u¯UÜË{ü[y ÑVù¥s\¾oÔûHrUÊLUzoYãZïûGæYÚÂF3æYêÝ@%Zï{'á78²°©Ôsz^5 ¾Ó*Ú'{Áfj¶?Hfj¨õ»k-F so½]ã¿4¿¾úL]îóG"_Eû¯¨=M_Ý¿D°ãÄôÒ'¢z¶ãA¨ãA¼¢jÚæ^*=}¯òvûíâ¡zº*fÆPºÈErßØËcßúáf4¹@4#Çû£UãTï>pÇm2½s6EKgI¿ÿWj©· ±¥ÔaòaIº> ]eÖöMkTl¿=M*àÂ2¿3= iD.½Ç¦ý¶u©¥wH~dHY¦
ç/;#¢bf= 7@ô7[[Ù*ýsk=}w5åOgzÓÃÿ^ñùÐ&÷^CÒ¸B²jä¶ßG£õ.>h(cìø8âþ'3õ÷æÁ¿z%Æzì_a:&¯­hõ'áíòñ'A)m4Í·Ü®f{öuïÆ¢óÝö mG4öD03þ{lèÚ6¸î7aàD´?¦5èºG)e¶öi®oÑ¹¤(fY)MÒ¿¢kõ?^?6MsðX3¦äÌvZU	9M¨ZT<÷ØÅäxSº#1«{:çºòÂvçþN¦dÞÈSº¾'Ç|öç×kÓø2þ40ðmsÒ¸¹èª7í6MÍ3ZN'Ýº§2ç½jZ?M=}aÚ(iÐ;*AP÷= f82i«õ	ü= ®E ¹{ßÈ59Mì25¬wÙ¦9Mæ:i¶Àñ³á+?åÐ:ÊÂðFÏÌ°k!äµèæyÏzÏUþìÅ6­´rÎ~öy¤c*bÛ<««çWyk7.aýrÉÎñIJ Û= Mg¶CÂ±l^úH9ÅaÉý!|÷D	ìéú\Å1î	±	{K|æi8NvÞ8®_I=Ms'$ÉãÊrÆnªMæw"c¼7÷ÞY¢ä9è5þ$ýÖ= ògDTêß{s:¿ü¥oßÆØÄZ%+
çA¡FÉf"ÁcþÊ¢wL¥ ¾¼¯m
"7zö²uHÄ9ºuEÄ=MYÑTJióÅÌÔTJdüì¡ü1Zª2óZQ7á¢~Ïw­Ï$H£íõ/3Ã2Úó'ó\	f=M}&ä£;%é×KSÂÚ.¤èîô;¤ùß¯7ÛýÐ7AIQ¼áaT¿äÎPË¯úâSØÂbé¢÷O­d»2¥sYô-Æm	¡© ëPEæn?oHJ!eÏßå{ºNæá6È¡U>0å1= Õã#XnÕø~ºáKKæÂ·8v= és¢º%ìcI/¬QH$¤ÉÇû~ T-cáhÇrbzV$}G·ú=}Ùß/Ñ		= sÂÒº¾;?pÿ×ú#"rôÎ¼JXxuv#¿ü$ðAÐVÄÍGrj¥TÍvÓ÷XÉ,×±à¶ò/LÚ]ÔÒq»Ènuo Æï(ØLüj4&7´¶K!íÑM¡°YiQq7]kÄÖw7h±ø }K½|û¯AMª(Rýyºz!@ÅÛËInp¢?wÅëîÂý²Ï(·#g.aÆ¿ÓÈÎ^*Ç¶<¡¨ìNB	¹D 5=}èÙòØ¸TGSúÿä6£7à'WZ¼F«¢b¹qÊ¿îf9µs±¿ÙEb¨J.[üò¢ÒÎ¼ÖÇ¥ÊË·M W
×W®²òÙ= N'ó±JÈ³uáÙb}ÆR,q3@ï²g8w3È¶A2µkMkámÙT=}ç¼ac ¸03äQq,I%sE:dÏãÃÎIö6ÊÍ´c×PÑU2Rh7ÞÎxgU5­³FoµeW@(¥@km,úN¹ôG÷6NLãð}\Ãm	CðEò½ô*Y¹gUm,2NÌº"ËNY/XbC,ÃýyþþÀUær	î7oüi.ua3µZ·¨òjl\µ/È¦ÒAW0g5½Îþö5GãvY67"ömÏ¡d»nzþOòI¼ï{[)õâS56&ïjå'	ÂNÔ$u][ù¥ü@Õ?x"»h­tÙÃd±¥Å¶lÎ/¯ÜGð#KÚÏ¶|an;$~tra|êß¡½TµåÍ¤LÀAWÉ´H@ã³H'5+zRÜOÓ[~Ydnt½ñ§~= ÛMêOw]öë¿â}öEÆ_ýcÐiV^Í3]$ÙÚø¹Ïmßâ©ô $Àqø!=}!½U^&åFP=MêõR×S®WºÀUEËJ³Äý#þ£0'ó¸õ³ýFõ¿;Lo²âø~,G£L«ë0o	vçs
id:UÑ<qÐæ§;×q<7Ñú5ÚÑ÷)9»Ê;ÔQ|¦³±!+Ü|\´;¤ #¥É}j4ÛãÅlß\¥¿ó/AÛø}ra¼ÉàjçÛb÷%_uETÿ?:y9Óªù}øwàÕ:m´1~¶,¿t1É¨4à ß;øWÜ!ô\Ú³Û ÿZõ.U#1U·±3÷J¡XM°mèÀâìú#6rPO£Pzw:¼¼ØóÇ:ÿÌk-vG[îÆ @¸?Ù8óÍÏBÚeØµÜ\7]@éZª\&©<%:9¸/WGV+*M"J.DÜ¼ûqji:HÆDLét~F»¼¼@)ÀÈOº¹swòóô©À;£êÑ´AÅns$þ·Ê=Mêþ/o³1ïFgÓ\G¦µÅ¨¯íÑ¹ÁZnr= i@û¢:±¤®h ûEéêêqÕ=MeU­Ðém±Ýgr7t<í"¼°k¹oè¾éçóm9íX=Mæ¤A­	¨_Hzû´ïjcÔÂ@é®äx=MZE®=}®ü²(sjûðó¦j9é½ ýÕ'¹îkn£Ü»~xïxÅp"ò¬©û6Pä¬$ýòµú	áÝ@Xþ; xü	À.jê ÁPût¿	83Jvô= á3Ë¾~.¢­Mãuëqsº¯ÐÊK¶Âxù¥ë?õ5ØPK¹$%$äûùÓÐêM'-r/;{dïTµê!ýæ	wKtÝb¼E×ãJÓ#W?ëücqT*Íãé ±ý6íYG¡ßz×o[vs%Øî7u
v:;­Ð£F¢W$»/*-GÞNr6F&®Ë0þôùnWëGH1UåÑÚò4à²Ú7Û"¿âWáX-"= ®XmEyäúÊ]BæXB| á,° ÆR©Á´$ÕehHÂÕÑ_¯Æ5g5m"QXÜ63aþÃU·ÎÑÒªüdq¡z0pZºîÑ= ØÎ6ëm4¯ÊýÅå¨¯²ostZüipª­ö1
à u[üRpÄß~¡®ó{­¡å±ÕÙ-Ý)©ßÊ|¶¿«,ìó pK¦à#Î,Ò¹Ý\×K,DÓÓ1>#ytËúW+]Ùô¾ÑjkZsïJÀ4Ä']tþ²m¤µ¢§=}ÆÉm"«ÅX÷»RÓ6ù"¼-+¥l? >&ÈQUa%g³Çd¤d²éFq¥>U;X:À½Ñ
*3h»RîFªÝÍ¹E
>µYÍÀòÇº/&=M¡ÐÂÆZò³JáAuqgQ-óÁG¦&sêCWÁ(¯$ì,ý^7M8åÃclñªú«^Ì\,*âñx_Ï¸ý4C_()TçÊ°4ïPÏ^{n\ëFKzuJØÕms?EÇöÇïA³k=}mH xêêX;èDTuARðã8}9·=}sÞïU(P3f*JÉmT>ÓÆ«q=}«6òFæ_xlq#¯3ÑA-×âJ!/¶95óÉR¨]	<d¦9~Ø,Pë¤%­q%ÜbªÜ´9T&ÈLÄ»cü¦ø{äµCJ°3añç'¾fán&§$ä¤55Êc^[óÉNâ d{  ¼¶,)°¶,ÝÌßØ²·6Óv ·è<Îä«;ëBå·WÃá!êf''ÐíFýß%¿²^^ð¬ìæj0[©7Pãø¬Í,£ÏÕFÅL~X
oL¤($ø£&¢áq¢}ªg´oª;àòª>ßzÔF3Þn^µÚ¡Ê¹¼+Ûù¦Æwö-µëYûÎ~VÓ¤%6z3"¥ø@áef8oÙTÌ¿k~¯xªõºÓ	òÿ¦ËFFØûN)?u	ðX~Tä
ËFi<:ërGýô+Îã*Øå5ÙJÅçýÈ|^ä.BõÉ÷8rý©+.§>°	Ê.È2ÈåDXa êÔsÞYëL*xý¼pí~Uz91Ý¦Ë)rÓí"MÑ4«­ÝëÀDIðvÞ(ýNµ$XÆ§;ëqrëd3L´<^OïW(paÌ£¨Uz0®DCqó(iÍ¸²âôaq4R°çðèÞ îMÜaªÇÈlB"µN´BµÊ¿:Cá»ê4	NÍ[®= Áñ§rbï:ýú2ÃP\ZV¹124rï§ /UÄ.>Ò hÐÕ)yö_òÍähßTdÙVùõ¦?c#]kå¸+ÉòÉµ ó^4Îªa©¯}+ãW]Ô=Meä±2Xc<áÉªtbLÍc-èÝuÛÏ d[M¼{»1YÛXy	&x´Ð^ÇùqâNÓª¤=}wØ.7O$=}|³ÙpÁÛ¬þAñaáç6F$[Z ª¶öµ+·jkÖJÕ1éÜj×vÂPýTØá½Í<áÖ±éK5ë=MUyFUã©Å¹¶¸Ý«J	«Åã¼C²$êýÒ}ë³kêNHÔI$6äìÇy8Ï{M­KìÝt1êü¸U®![+$õÝØ×BÏ]ú§!ø]ër®uò§aÎÝ£ÓßçÏÝ§ë:Îã£ñÐ]Ì^­0Îä­U-ø·ÿöL-N=}J¥tÌ
Æb^@Ø_§Ú8Ô8ÎY¾jn^-XÕôG^¤Î¹êÇo;ÎU +ê§A )Îe{· nKáûãæ¤©8òÈ·v	ða#^B.*0¤%fùf+=}X[a¬ÃpÓÄðâÎEÉXZnÿ %\¯n×aeé\¸yá«£Ø&à|tÑpÍ¸9	VØ6´­Õã¥àáAEO'_©]±:Tpû×DÂ:uOìIûrb°^R	×±[i@S IÁ=}·t*_-¦¼­L¡Ê´ cÉ}ZÊ×Ïn7°&ûñGW2(Ó»Jºÿvuý·$kq_(_­#Yp§¶ç ð-Õ¯êÐ8ÙOðþjy³®7{­ªX3ÜEú0ÇWê3¯5X¶KÎlò^yË²k÷¼«¶Þ§?NgÜSV1k4ätÞ&z@ÓBÁú¯ñyÙþS3ó¦H$pë»JÑs4òo,	yK.W¢<w¡,x¿~Ùc©ÉÆÚm	ï¡P|sQSô|K|7² JpÔ9ÝAö»p¸ téD5 -8ÀzHJkzJQíÅÍô¹Þ3\ºÄX¼hÇLù·ÌûÐ.tÃBºy§ÊÛZnÔ×^é2²EyxcÓb£ÒBSgðÉ;Q¼Ì8),&7R\-Wväz0ÔclñÔ£Ð°À5éì±3uh©Ê7ÖÊ5Îw«ws¸(uáv= ëË"©·Sr=MÔ9·­÷à°òüÁÚkþ*~[Iñôõ¨lÙùp(SÃKÞhÀ×$krÖÓd&8@éCÈ°pòücJÁ7ÆóÕä¦b|SÎÜP:ë2¸òöµq«ýªý_D½7ÛF-o¨S1¸6$77ùf2óëÕ,'ñ¯Ë=M4Ä?Ëv#$³Æ<{Þßs^6!?'ë°v¾àg¦Xo¾h¥àçÅ¸qMG	a+ìBUÙÌ
j»Vëp@2l"ÌåÞ{áÎÑÃ'&K¸ÎWK/Ú!ÜG8ju{ ØC}'Ä¹ãwÌÎ+"ë8B°$JãöÜIòe·»».?o~UÕVAã_A¶LHÅöbá{æßãã«Ìèzº	= £×XX}6/÷%O¯Ù= ?cµà&r"èÇ'%ÏG_w" ¨è-È,®É&(Êã4Dàã7zíI\ï¡jþh}§ãè_°}¥¹:ã¥òãDSçÌÞEèÇåêôRîG7«ÍÜ3Íº=Mò£½pJ6ÜüÙß,k£JáWEwªÂ,àäuZ]l!G÷Ruc!´= UhB6C|ÿ'Nd÷7ô\âgIU·=}³å±?ù°f7´bLçFÜ¨ÄGÌXäyÇÌ?ãhWGxq/V'ÿJÚ)
£¥;ëÌ´{õ9TVyVÒÓlÆ(~QæzGõPú¢¡õW£1dg³N¶É¿^â72ïè¿í²÷ÎAq(L?óq^í'¤A4O^b¡wVuçï7Ái¬. ¢®ÿÉ8ªÞ!qLÛÆd8.È¿âØlÎèëMjj=MhGùyx
ÌÃN[´¸¡×^4©ÉSW»IwûÊØ­g¡pãó>+:ªgÒ?ðza;tN©\!_óµ2í[îÕøþ×³áäãxB~é	¢øGRÐ0A#²_oÀ©)cb^¦ü%gï( à¡V¾éÔ0¶_~²¡,d¹Ë]A-;O5,ªE®Q|Í'î  dù;gãAël,ÐÿtS/®ùÇ6²C¦E9¡ÉÉÔîåÅô7¡2î{rã×Käõ4DóUqØ®öö(réS,Ëk*Æ^WuBõCs2ú·ÜÂqWp¹ÿÌ÷Xy0q#¥Vxðÿ(êÿûÛ;Ñm¨}zàsÇ=}g#VP½VGÀ&B®Ò¸Ôì«tÍNÕKÞ7ætRW|	Ú©åO+ßÔ9ÛÞÏc!kªÙ
m%«ßæ¢· 5Ôên÷¨!òÊÈ
OuA>wo99äÒò"É£ ·@éE%Pí.¿-²¹ÂýWþP3òEuÙb1¿Ä®3mjlIÞz9ÁqR?Æé>µ?Ò¯ú= ý ¢'sQs ¡ñnqVXÅæRJ ôbkcÈniY®ìÁãzº,H0åi=}"õ5ßìªW³°©Å±%®ï[ý 0×UjÝve×MÀ}é: ·_Þ¯ÔÛâ¤´cç+qãWÞ,º§Êr¢y­ãÂûLA2­¦(µð2æ(ØÇóÎñðÂìQ!	@ýRõ%<äè	ïÈ8Àã^3q4°°Qùj5¸(§×ÇãÌÐ8jío£{ ýhÈå»]Þ¤RGÛHÃµõ!¡ÂX¯ý°?¹& ä=}1Ï¿ßÝM{SÒ7Á]yg¹Ø°>¤¸Tvù;©OëÎÜ0O2kç]F«B}ãºRùëD\¦£>r(_0ïH6#ZÊËÒò1å&Ý, §¸TªÞExºæNTòØ\â= 'ßÝ d:Z!va:P(8=M'k¾KVÒfÃuÎu= Yûæ,9#f2®ÈÅ¿úÿØ'(êÿ@Xþ½äÃÉj·ûúßR:âþâù48åxàÄåf¯U1ù/My(Tã±2¨'xisÚ1·Ò[sL wÑ1BÛºlVúõ¦*ºl÷&û¦&çÆwmôÙ
ë0¹U!Äpâ9·\õGß¦¾¿oÂäÙGªMÓhÝí1ÙÌä+3S7{1
¨¶ÒØ×î¡ì3üQhP¯vcø'Àé¥²>wGn-ÊËoûàÈ·= ¾26:2uÓ2õÆsØ@ t#/¢"/ b£¾_H_hKãRÌÁ
! Ú0C÷µ$êg PìýlÎú»ã5ó7 ¥Z/=MâX¬ÿGÛ= rCÊ5ÜîUÈd&P!ÈP2Ó¬]ômò«x[ïoPÉàBø£*@U­ÏÖ«óû-ÀÖ¨Å Á¨u}xgÎI¦±ö¦ògó[6s)¯ôxF-1K~j½õ¾¤Ò5®Ú;M:±):dÙcn(>ÍÐ1d6:t­ÎQuÓ É®øõ(û½År§ðñ þ,±ðÆ´íR¿plÉÊgsÆ7ôÃe²ÎÝ¶~ð'µ¡.»´Íè&°k«¦dÚ³µÆ+¿ÿZ1p 8®ÅpóÙÖÛêüòZ9(°ÆÇ72$ó+þÎ´¹ª×úÑìzñT-@_½A¦å%4 ã/áæÀåúîÆø&ádB·Y¸H~]:ÑîàéÝ§!IµÈ(-óðØ¢Ò³RSnÀËz]ô7×Ug3
4ÇV/ÂçÜÙ¼ù;É|VA8	GêBB=  gâ(,ñ%^àëOØÐöÒb1L)ÜÆÃÉªz-}zjË'æ×õWñ7MRûï>UÛ <YÚÎô×ÏvCCÿ@2¸= ×³8w«â"Ä8w åÕO_GtWU~ÍSjUÆ¥×ÞRnGR§*µym¬ypÕüçsV¸r-¨7ã3|l5èê?xûMÿ¤k·ªö/ò	"ø½ÔHóKù]3\ãc§¨¦öÉ%Ód)B³±c²¯í,ù¦þÞ^\ö+5î3ç!IyãfGÛÍ¯n,F»àB¸ä$>#À$ÄÇ«f§	¦}ÜÍZMT :^b¼§³ó#Ldú¦V³uu,°Ç¤ßúd8Ùd~Ö3~Ñÿ¼8¥L-þº;ô!æªÈ±7ºèU)wuÉd-;÷æw?­h-¹_´ú÷5ú£³ç+¦Aû-&ÆSD=}µ=}±úG_ð°äª§ßJ0¢"­RÇ³áD¼ÎÝ¶wèèßlÇ$c= 3K2EMÿ.ë6»	°d.x3èýª30¢O®d8eFÅù[ãöw¨Ñ¢¥"áý"Á·[V6¼ÆB()±,U°¨-ã¹|2RxL¤b³©ùÚ¼ûVÐj´·d¯ó»bJÖIþ= H§ª?xÌZy?4,j±@ÆCü&ê9Ô3= |Qcy¦ Äsz= ¼;
sRAÀcÜ3¬"é|Mû}û"[ÖÀíu­âlQ¢¦"ÕO]Uu	íÂ>¥§sE¿÷ÚÄÊCÏfùÀû²¤ GUZÞ³sétø;ÀýÓ;Ü·dEEø¡ù×ñhm&!MßùÍLMíîòíW·Ú©µ*Ýç¨®ýå4³>)NG|lï,F¦BÄætÝ+ùãÎHQÊÚ»ÃäÚy<£rä$75×2*4²I4
(­î¹âè)JXÕÍrpè|ÈÉô^15s^ý°fÏ}ºTâÇ¬¿p¢2¢Òoõ3Ðv]E¨WåíêÄÈÐn^gp'GÝ ÎÎ§MP NúÄ=M:S+DO¹Z Ãiv°¡17>³çCÇv¤c¾ø¨ØË7Ùdjþhñ.P8Lý|Æ0Ømí¸ø#}Fk<-&]»>dödêQ=M£d{uâ#3++þùN=M¦Ó¤5Q¡¢Å²cÇã9¼~¼Ú{ýIþ¿^ìNAªÔ>_ÙP÷!I5§ ²XÆÏsQa#A÷óÉ§÷d&lÝ©8 É"cÒÚj;zÈâ³*WZß\/ahzþ$>ògTõÊ.0KÛzûgEBXñeð>¶ú¨­qêíî@5ÒôËàÄáQâv(¨9[e]ÄÃx9öC1¦qÇ¡SDßð;A íµ$Ä
ú=M °·yE@ÝZî ¤<?SÞjkÉ-»Ï\g}ps´úÝúý2b Rf²"¦å\pê¦6­YbÓÒORt¥ê¤v¢½dW:q@L,Ûjt{hxn5Ìµji"øÚp£}´ÊI9¼<ìÕ¥FÙÍq;ÔLÆ9¹tLË3ûôKgÛR¥]ÒÜ$ p]§òÏâ2fÏ­)8½4É¯Òa?Ó§ôÞ¸  ÐÎÌF¿n-Vº	ýúæßÂT"Ç" §ÔCð¼ªËý0§çÁ>{yài3+%R°"Ú5>ÅïzøìÁ³J	ýHÛÃ²ªÞ  vÿÀÍÌ*©uè»y9ÎÌ÷ó¹$8Â½5r®SÈÌ ][ðÀVýu»°àäÎÜö7cº¾ Hn±=M×MÅ'Þ³ 4çÎ5õºé-(t^m}i?Õ¯(à  ùÿÊ~ÿö Á³ÙÞüsUT áPl©ðQË½ïJ§«ç¦xWÉÿ7Þ^ÞHl&=}*Qt}QÌ×õxP=MÓªCÈü".Ó$Ù´Ôb\d= =}= Oí!q¦òÏ&3I *xª¹MðO­½+û÷VÍ(³íæÕ§ï³ãùg6h&XC@ eÔ¶F×bAQC»WÀÈú]1Y´*åÖõî×I¿QRX§Âë.¹(¡ïõU1cF¦CE&®/a dö-«àø)çYö{i)ÞÂ[ÒBRIç'äá<ù²ÇgÈñeÛF½Ü\JD&,àsúßß}%üçcÆ/§©P¿¼ÃÞ(V5Ë¥Úy+¨P
Xì í·èçlÞÖ(|m÷¨>&Ò;åö m	*J¾¾~ØógÂÝÂK²sfRGQmB¯#¥é¼Ôáè­rhÏW-§»(A?V ãÑEFgeËÐÂÚ
ÑÂ¥{UNænÛw|{YC°[ù5Næ/Èqíu&&ýYE°»ÙGøv¯wÎ'¤2ÜN¦Ò{³µ~ê&0)±É¬õbç­«d5Àg¾AYÅlÍï«D5Mkå>vDrÂðÕ4¾¨ãÓPÑÁt÷³û =}ªdnùÿ*ÅeTÈ4ÿ¤A¹©)+zQ-v©Êö)böØ\ëÊ«ÆäcÜmÈOD}:½KÊ= 4TÈQEhõ¤¤²dK Å>¤¶¢ûÉrÛÞbh²Ó&@sïÍìv	êàýÝVã*LêçÚS®¶<~ ÍJËß5He&×O'BÇ$¬lVÐÀ{È=}´e*3£¡@§9#å6AE·údç^,uÿîoåu1)}üåJ¿/i^ªþºj--<Kij5?j¡ëP=M6IvJÒøqE=M©P¥î%úl¦7eGÐã A^LâÊq	cH6bE%-üK»©¨éÞU}åbgÔ¨¶XËÃãØ;xKx½ßF1ØéKðÊcäúKÙºFù÷)ÙsÂeþÞ3ÒC?üL!úo»ü ~¥ÔÑkO7
°8çmÝsùð²EØjûfù \â¤Ô³ïë´Äçz| Âª}O ³ÅOºUÿy(]!·Úv'_]¬GøG5¸¾@-Ë2K<Áxp:~P+ëÖR¯_w>]ò+½Ë:r²àÜD6¼Ø§Wî¼Ió'>}a½%=}±3&Ù!¡RÁ(4Ø@Þ'z^©»Õ@õCþ0m%$æòA¢¬"~(3{¸.Äí+Æµ@fèp>NkaëcÄïÔ;Ïãí³ÂÃ>-ö½=MÑÔ 6ø  ;â®J¯UtvÊþ5ÉÂÒ­áÁPàÉ«¶Ç£_*þÓ½Úl$Û°oìäC­/1ÒØÝMÇ©àÀ¸|ÆpêVÞ»GlN÷¨¬[§MÉ¢B³ÿKÎ'YnïÑ %=M JìÃOL¡Û\)"Ø?Ù¬,ÿ 7ðñ«¡ÿ¦ÊÜx-v»b­Ñ¾ ¿ãÛc}·em\#¥*0oôÞÇÃËÔ¢°ã&IÄb@l®lå{ÇO¼ú	Æ	 ðó%:=}JÞa
&XW|]È°LÆxBlÑÕÎ-Ëdß
óÍïqc×æ¥Þ=MÕÓã8}3=Msx²,bR	;]©}ÅDlFêÂ*ÚU*H$}/.ºÓK=}µÆ5±qÍ@Û¾[?-èmgK=}¤
zÑ= Hö¯o_+3ú ým= #ÒDïp	ìP>E­¬Q¢^}9ïºÑvoº	Hkq(v(	0£Ãksp^Q/­lNqÈ!$
)¢~õ>õ²¡Ï_Ü<ÄH_ÄFgTÒÃ7å¦¤&¬VµÖçq_ýz¦:Þ¡3·¼½&³+ÞylSÿ,¸_p ëÏMÆo6ïGì¯4VÖÐ¿ûÜ¶GÕµ'/= ¡páÅÃEôÎ\ì:ú<9O:¥VE¿>ýQ²$
ùÑ@ßwÜñpW= nÈùXYOfÎXxVñ¹=}ýå¶1YN¨/-¢¯ÂÑ0R«ncù¬ò¬Iï®ÄlZO;F80{-	ö!r¨´9Ï'×5.uu©ÜwâË~,L}¢~)tÄK·+HneÈË {txi¢~)t@Ë2^k\|L,$DPKDJnXoçì.4e²ÉCÞ.§²àõ«9º¹Êf#+éqfqè4»©¢%ÞliÁíV×ª®Ú÷;²³ßGGãvÑÔ§®NwA>ùr%d«JWQ¹*IOôu½ìvA2Ôw]=}_Í'Á×9]]ù'#ùº×ÞùÛÃ\ªRSdìåÑYáÿ>Õ_ì¶÷æfðÝìÀ§,ÔxÇ<3!+sLúoºf,Ü"ùb)b= Æ|ÇrgÿÚvÌtgÇü;Ü³¤)øÛ0"ªÂçÖ
8Ôw´¬VS¯t £Cx¾upÁfjóé.ãjNF "öä&Ë	9ÌÌ/JNð±Õ@QnaO5!b¬Fç,+R¤ºì5¿7ÉMmEñ ÞP¹P=MìµýÓ¶uÑQ#AQFSÂ¬k¶î?_Þ*kóZöò\0í\à¸ó¯Ö°ÀÜîà= ¡CQ\Ö·¶A+O üãÌVà},6×z3BÊs14AãÃw= GsýÆbñ]:åÜ_¸¨?n<g\®óTòÉrïU2éþ·KèÈbÑúkáÞ¯2²»j[²[H8îÝà=}|KÔ=}¬ÛÁ½QÀ×>Êûò»_4L8¿}j= ¶5#pÿl5|2]q«î3iÈ·Ñ|>¨!nàøç3^r«àâíö»!.­zýÌlH}ê.8ãwì;
Q¦S&T zèWÉ«ñêbÜÊ\ ÈÜè¤P+áe¦	¡swbÔ"PÀæï:>Òu¦bÂÚóZÔÊ8$Ë~	®Å20u´nóÃÍ= »èQ
êÚ±ó8?a7½fïÚÝ¢|tb¡~=}<K¸6Aû¯ÜmMaÇ¶,°T~ô¥}Ä
ó"Xp¾ôöYd÷°Vú^Ý©xÚ)ÅàL¥ô~üÌeêRÔl@?6FS>Kò£hT3æµ$åpÁÈ¶Ý²âWt ¨Ò±$2ÙÍÅäÎÚâÛgÁµèØvÌ¿ö¶ÚÉ0SßÛgî!®iPG¿Ù»·û<eCÅÊèêrq\Ê|${Ç§Æl1ìÿØ¿k1O<ÒmÁlFý;V@¤=}É]¹±Ä0ý¥)Î?ìIsÌlO8!"(rÃ4³ýx4{æçóFúÀ?ì£ôf|B4&ý®WëæpStòo~·¬B¢å.´ù*wóí¸/äÃ1l©°Kã5RgcM<úV }Ç9ñ#ýøú&ÝY]Z@¾¤!?âõ/ýxâ¯1Mß^Ø|bÔñëåÐï&³éldG-àüAá Ã6"Ï¼Ll;
rkvZÛD?¹<Ø$©¨æcoûzxõÇÀ¿ÚÄ¸ØT¼¹ñ¨oe8_"ø ÿ´ùýÐ#ìP4î
Åm	Ý<
SÝè{ýIËp\4Ãu<
gøà®3ô}âJ(ó÷lS-	À9Á¢¢Â¯ÿØñVìÓ{´ïj\ýô(öb:ö0ôµj÷Â|ÐScBÕÍT}gÇI­ÿHó~êRZk(
Aç6DIËntÖãÈõ]a´Yv.Á½¤[sÚ7ÓèKÐÉÉ¨o@jF¥QÆÏ¡8¾(xG¸ *þúÑu§QBmo®$¡­.
4gú¿G½5Tböì-zÂE~µÓzCVØ2É5B@¬Zu®ÇÃáü
MVËßö)âtjõ­ZwsØ|£ÜÞBù+Êòöò²Vxzíõ¶µ	y¿1õAPJ·´ä´·ícÍ² 
sþ^ýP¸}âÁQoùl-zÖ¤±2¹Õ9×BmÝ¶pR÷#HÑi	àºÊØÍÀ·q))«x^ N©/Y¶Òj0ígB¢:trcyBâÜYÎüÌÑÌÑ¤dÔìç6vº1»õç<Ò«AQpëør]¥KtêÂç07¾TnR^I«ÄRÊ¬Ä&Å¿²8axôáf\,ÙËuüÖÀ®)âQñrÉ¸áuû:2 	è	â(3íU%Gô©ÏÌØÑ|pXxM°á­ßâ¬FÈí-ÙË8£e6ýÊkôÛL:Ç 5	Ti»L·[±	3QqÜ
Y!<9B2ÿ;«BÈZ}åCPí|¤Foª+ö´ÉW_#Qj¿U~vnÃ4/õ,P\¾{MA=}Ã¾À+efÞ,!ì&½ÿÇªÆò¹¶úJÍA;ºs­ËEÑd#òùÇJòõ*=Mª¸ë|»Æ=M¡«åÖÅF#IM.©s«uI±Ç4É{à§}2àib6 ´.Ë)ÆÏ;\Ú|Ò¿Â [ÃÐ
Õg0Õ¬Ï»hÝøÐµ§H+OÝ¼sôU®øU^ÙEÞ ¿@Ô óøÐ9ÉiÍ±)fî>_ÆÍy$¤.t5ÿí,íÙéíÄªÕ8Z"Fy°µ#Ý!=}w~*ðß{ÃïvQ!Â¯yuu²-ñÝrçè¤û-8¦
¤-!<f7.{BµÂÎò¾VAÑÀV¡bqb¹Ô®1¬MøNéBÌG'T0_{Jæº¸ÐÞ®é¼ùG
ñåÓ6Wàè\Wý.Ó]yû§õÝ¨þ£ùÕr>ú§!(åËX.S
(= ÚjÎVNOL¤bÔë+±ßN0q¡G7.qe*tÚ©Ë¦=M,Õç7(×¿Â<Õ|ì×»¢,Ö^Rã!ÜêÎ£=MÏâ=Mó{³ûtµî}«sBàjÎß¼Ï=MC7Ûðúþ$GlÛØÉÅ.G#íáÊþ2ûRRÐé¹¤½Â¦»éádÖf*)Æ<^âU¥Ìé} ~ÑÍÿÛSÝø¨*é²fæo·ÝÉâ¸Ó@Ôaaê,Ô×]#xóC!ù®v³±w¿ºËíÚ(æ)7ôÖlVäÝ²ê¯ùNÉ	¥ÜÓúÊSä£9Õ"ù¸ö¥Ù«¥_¬$æCÍ­ðÔ÷BZûôfÀé°ù^uýÐûýÀzóÙ±ÿèÒþÈÄáêÂË9Ð
´a§!@}y.ìô¾îãsøøkCéäØv_÷gñ ÚI2;·y)3:ñÈçCó<«ôgà#Wmèúä¶,"ñÃoW:âëÞL¨Hò7£brø-Âw}~]'ò)UmA®ÃöUorì´ÈVY,P\ÌF
{D¥$%= ¨f'¯Wäd%'Jñ2s½M«ôÝfqï2dÝ£P;âªÙ@UèvÅþÉ=}R<AÚ×x57<´Yyð¾Ä-¬ÊQÞîÕfÑE6°þB¸1$!§Ò{5¬ÑÍn¬Û%hBÈñ)ÊäFí/´¶ì¢kmäº¯iØùmóçÅØb/÷»/>³áæq/ RöÅf¡~°[²Ç$Qvuoé- Î)²*2ÅÈQ&]&àú-,K5j¢=}ønÔÊ©D}0«Ô~+Êy~«ÄÞ¨±ÛlX¸IS÷Ò/Ó>îBä¸w¨ìÐ×%°Î&Ê&:Çh|êä= þ'wX½òG¤;ËêH/!«ÿæ&JñNÐÁ*«?aÍ)y÷­o§UÏÁBÍUÏfx®!ßÃ¸É1lÍ;Û=M-^?ñô°'b(:ïuîu©bé´R.ÞP¢^X4ñIBëY= K\1c;WIÜÿ¬c^zoàýÚFgLvï^-\ö] ÚÝÜ9ý-ÁÔ7ê^êÔ0ÂBd2÷§Yøbon§$xÔáïÃ5n­TÞÖi&3Ò'é% Nò k7¹?áG¢£á,m ÆùøÆÝÊíÀ>a¦tÏkñ7é¼8=}¾¥8þwÍíÖi7UýQÃÉ+Ï%õ#ÐR¤1åª£ÃF)<ÕyaØ9oZðbªñ:N÷&!çB¼öváÂ4K_5áÜµÕZÔp	Éù®=}E³Ã¼2¸ËË§Ö¶÷® cEA÷ñ§üÚ]x8Ó3QÙ ,_¼Ê%ÆdWÂÕlî17µtÒJ¶®Ù/!D®ÈD!W-c.«¡/]à/PæÎÃûÕ0àÞà[¿2M«&Ý	LuàRçª° ³ú¨ce
ÓïÞÕ?¿rx½^\ÇG}¸0ÙÙà´¦¼7¹¤a9µ;nJrN·¨P1EÞüòß¬à½&Ï#c1½yå VÂö9Öe>;=}oß$ÖlLÖ+Ðc~s'ÏC}&*He­àeáZ®øâÍüS)%ß)vaésXB¢ê]´îjwàH)7æ?>W«Ùg®(6$6¶ÈZÍSÇfÚð0CïÝÑÉÐÑú\âÝë·.Ð8Èl¼·lpûìh[·"K²)údau+Kpu¼³ 7YòMý©|û½iÜCÖï³DôÃgä·Ýcg{°= õH<ËþHg}XéapETx×ÃïSa0Cud
»wâ ÂÌN2tcq[x=MaÀ|Êøàe Rûð_r:ïðà=}ÝðªìÐââI­8p=MéaÜBp>çþLáG¹ÒÐÊ[Z'Ç¢X|^Ó¸þÄó@oRõÞ8^^Ó´%j6"Ä7Ñâ¼6¥è;áÒø~@c9Áå¯(ÿÙP1¿áòÈ-0È«¸ïz?ÉË*¼¡¥ÙÚ0<aQtRt*ÔÅõR óÁÆvùuâªÌDOyq7­ò¼ãÂ1»nö~ÿ ßÚH·9ÔºBEw¾Ø°:6Ý²º÷A6õÊ~þ.¾,ùb[À]ú=M·¼\Ú~(SqÚÀ-æ¢1¹@ñ$}Ç,­8s(ÁKa%A¯O;õRQNÂitsçZ-vq´%ës°ÜíÕ¿ªÖÝaWµß.xþ7òLHs= *ÛþFÐlL¬.n:nü*
ªP±- nnnnnÕËzë;¯Ê$ÉDúã&üä= »ÊjYD:JT4Ê 4ôKJo¬m¹~D=MÌ2ný®hë~ìÅ@mU?µpÄßÖ¶CúhC:ãù;ú@=}CD=}Cú(ðh&I{¾ìb|)
NF"»ÜÜ>|âã[¤ODhwíÈàT½û¼¼®3°3³0ÅëËVD>VsÉ
^dýW^¶â7NÕÜ|ûÑpjÀÁq:«*¥{&'AsP¤è(/<{UY2cî·Q²¹íØòöÈeÐ0§ÞÚuÂYcó^s¡pðl~ãï¸ïÌYº5 émì­f5Î34Ó$vwdÚöâ Ï¤$)µ~Ø@ò3ÌáÞ^¹o¸Ôô$t à¯ôõ×d5w ï»Æ¾¯¾ëqaãW7WÐ@2zÓ27øÓÄ¿b0ÞNñõîeØPUõÌÚx ¨4ÁIÚe2nÐ·¨ö®Ü¿ªÅSRËRëR«yãyOÛyMùR£ùOÓ9Tç9OL~ÈN£ìoà	=MD~§ëQpëi(þº»R%S½auÏ 7Þé1°^Ð­	nE¸ÉmÌ­§VUÐ¢Ç½þ+S¤1à0¥0E¨|ð¨Vø¨ûS4=}mqéîðO¤µ{Q,³= p³óÏ!pÃ¼Og}´85Qìð 9gýÐmùteäE·oàÎ_ÿzÜE¤äýDýl¼ >ÌSÄoòþ¨u´.îÎE(­qü ÿÂÎEÿ@!ËnRß#<4½Ù;_÷B!;qj;mI5n²c°2¸ne4!l®rtq$lUm<û±½ÓErôPÛNÉcm7ìuPF¢aZÞª
¿%kKé4Ù¥(Fµ{¶(H'BnkÌmæ?Í;¹ú¥K&ñ?@C·çTgçpeCú»°hC:ø<úhC
 ;ÇfðÀêwö	üLÊ5Å&ja~ÃÉ¢t²PR¦}Ó»¹¹=MØ.H¼)È¥{7i³[µU%äÜ,Z\»cÂ]F¦gÄ¦l=Mw¬MC,P¢Ë1,ft¦i²u}llL¤û¥«G+<OÐüÎw¨á
3]\£óS;án0nùn¨OBni	îé.}z¯îú>}']\Ùt£Ær"j·'×SI~lB¨züÃ¡eÓTu9|Ý,l©5@6ÀBïà´ÝÎ5ÍZÄÚyK3(GáÁ7àZädV»ÒÄ§âJÞ>Í½­ÆaÁ=MVU±¸hUNI=Mm¨=}áRðl&:ª(ä¹ø¬³ggäB;gL	ØTs"XçLlK²LújWâX$úë&Lþj3z{TÄ@*eÆç(z±]Èç;WIÇpKù4ÍyË!Ô[ûÊ;W^ 69é´jBiê<±d~wÿ*ì×E¼³³¬ÊI¬]o~í$úÇË±¥	o­¬R®|R°<²­²¯ÊÖÕmå^TmZ
*tdÔs«ÉÇûÑ¬ÕÈ AÞ
´ ÍäGª>#
K\ÅåJF¤>Ë	|LuËlì{s¥©| §JTCi³¶½½ Có¶sEäÏý Ìíþ.Ø-[Ü^Ú¸Q#ÌbÆKüM_ü]ÿû*ðÉÚ$À[|$j
rhC øÐdO,éþf,ìºHY,B$+2cØÄoÁN:çÖ1ìòµôË(Ãt·ë®ìóXl2f}òfùéßçãëîrm7Å?!ÿ­P"wøÓ:ãå·È®²PìJD×à\ås?+=Mß~ö¿ëû#x#äåkL77´_ú³:'«ë0<	ÞA(2i_ÿ|ÿh7!÷Ç87GÏvWò0Õ6>jºIö_b°ô;[vJúìrë-ç¹çîfþW8=}¿	oÕvrÁ"2AÐXIÏ+Ù"¬Wú8A#èÏÈSj2c9:_û×Èã¶L7]äöéëéÏ×ÛòWûjç»t+°Ð³W"èëüD!©rãbÅï~DVùq4éYøáXüCvP#"lÝüè1h\"¯_Zì+ÿHvÖ,¨³2tUß»Ì"1W5Ã÷0ÞöpÏ²qáË=}Go	Pº2ð"iÔKAXðI±üÕ@îhµLårrmI=My½Øm·)¾#dxBI¾3 ¾¾¾5Âúh¼áo9!¡ÝX®[t@p	å7dß¶-Ç=}o	#"/óHØZP¡B= ÁÊ«Q½jláªÅBÛdy^	Úà ì9|xÁ7Æ=}ÑxÁ4#÷#ö#øã+ü÷Ì$M]ÁÂÊ'#3:¦8¦¬&ÄI'#ó3:v= ÁpÂþæ sÜøõhBÅ/×õ¦M.M$dbê|P¥1-Ëo­,ñÒÄ8rÂÂVôkiÚã[ LyM Nô\ìK<àÝQíncà¾âwÍÐ:¡áX½ã
O3Ãÿb³Ò÷½þ.AJ7£­,¿ï[Þÿ»è¨RÛK|kÅTCoðhCúhC
ïhCz*ôïe\
d;J÷Ú¬^xÒ.kâw²Ö¶¬;^'9²WcÓúd»(r»ÍG+x§ KÉ)ø6R«Öd­"0_bÕt^]Ø¥tß v©[Sôßæ3Ù³q¬(v\¦:>'5¹:>I9·£^éMV^nºr×QayzbÁq½¶ )!a#áZoWQpþ§L¥8vç1ù:d¥XÁÓG[÷á[´®²¢?4ø9Çtæ£8°ÂAµ%¹K\ÉEê	RÜ¬v¨aá:Ý>C»¼~_iñìmÎ»?HtFv'?\þ®ëÜ{ÐÇô~IÌ¢§vë1±Ð8øX	w=}ÞV@+Î÷Oel &b<ZÊÕh«F'1÷WYL¹<[H°;zêxKßôÚar÷ðóIí±F°Ê Ä1ÄaXÌ;éüÇÑ#Ý\ßgóøO
®¬èðlþ|jø
-ÉBúqÊewhJ0ó<ÑUKqAYºÛlÖk¹\ËðÌ.#§9¹XkÝ|LõóãmÏ{ÚøÔú,rÏXDÛYdck?ÚeÑë¬Xç·ÜÆ1°EÄså(Hªd<÷nHN¿Å=MQMÝtkhðº\³Vhþý0]h9!eò_"_4¬ØÜ4_KÝÜÚ¹1oö?ö°8y,Ä½¨ö²0ª%A©6ÄÕxåäáH&Vµ1ïçheê¡®ñ¦¨JÇì> öß¼çæêKÑÄÖf= ß1+=}^= fNàù¢ý¤ßØ#åh½i0Gú§ùÒÇv£à9]¯è9ÖçÝPøÉ"ÈvûülíäÓÑÜî®ô¯ÒûÕ?&ÏúÂ¹üÏ§Ó;Xn 1´UCed¯*Í1å pëZªÕjÓÙs1\¥Ïõ*\<Õê©öô=}ÙRþó~§T°Zð(½_zÙAnâSTb{YÜéSéø6S©1Üvbqÿ³­ÊS­1= Æ[pÃHq ð42>ÕÌà¢ö_«ço¢ÛÐw¾D¬aÔÇ­JYÔ£tÕ¼~¯eûð¨]d8
qß\ág°jOÕT]F·b7Üè¨Þ&öp	U²	ôü( À_ÉÑu
ÁléTZ¹\r\ÁSkäoø1l7¥%yÏ{tµ16X¯rÓz÷Wa®­·Ü= vË»=};t1êkÎ7Uh²EJÉ ª;PBÿ¥
[ÓÈ-P6Ö]ÝV5=MìE*Ùv_º= H_$uÄ¢ý!e!ó¢_1
Yå?öÊ0­Zï*D9-Ä_ûÓfL¡À= ¥.BzÙi$Q	¸¬êUèÕ¶çxßÓ­ÊòÝPÿyèx$¡­jÒØÔ(Õ­2=Mnìý"júp¹1:¹ó") !TÕè+ñà_¸mæ÷NáµnwM_"qQ	Ëô_&ÉîzVÃó¥w0Ü½åXCø7@§v£2åvd&,m«öLÕæY	Ébe¬vÂhi ûÄ	Üq= 5ªêE©öæ,ÎÕL¥ÜôIdvâÇ°¿áä®ÎÌ_þiSáòX aÍÐ,ºT>é#= c ¬°ª¨Æ-,þÍ1KÕ
Qÿ¿)¨¼Iù0Ë¯ÎÅï+ÙADnîÒAØl= iÿ[¥2_Z	MòT'«z«sè1üw~ÂcïUg;óÅ´xÞIá$·¯JZcÈG«e©ìÝ\±d-Ú=}«SScÿ¼B øÍ
ðãöJß»M=}|w|W,é|øq *tgl=M'!²¢*<øÌË¶ÒôTLîñ¤ºàûé1*DK@fÁ'Êã Ða~*	r>JÒW}GR
¤hFö¨è&{§£f~¹¯ZÛN¥26²[Äx¶C¥RÙH»ô¦JOk¿,] 2Ú½º·¨iVÕC]k°Å§©A&fW2ûÁv²1²+RýKÍçY ÕAM GÀ¶d¦­µ	}ô'_Ø7^ÝG>³oF8â{Â1NY®h¸?&¹½Ýæ²dUV v	Â¨üçû%Kiç~·4Ô<ÿ(vÝx,®©F¸XÊQézÁTçÂ1~ST¦À1½SÁcq¿eÌÌ×´i×ÔÒwÔÏBïüÊ¬nÔ1Øv(ÀõÜ]èÅc'9ââaÉÙè{ìo¬Ä~z¹{¥ÌEtÙ6¼ßc¨1<FekK\¤Tc\àd{kþB;Õoõ
[)PQÝ´NôÛm\ÆÍÿz¦zhÍQÅc/©8ñâØÝß°Qüò´Ì°&£µì®Dc¥{°SL¯¯¬TÉNÆ\ï¸sAú#Zs(Ä<!1§#ï£ÃO¥Î§r½ rs}µZÎt	ÐÜY¼uv	ámkíÖ/#+ÞòR	Z¶íÜQñÂO *3¯jV½ì4é1{IA©ie×ÛmY¥n ¹ÑWsÄ/ :øO<þÒüÊiýI,8LB[rÌµ¼%LÜgZnhâÆjô¥\8Õ*ØE- BÏxú#-Î~:§sÛ@
5Ù
èZ¥zz¸ñdÃ±«g¾e,Ö;sîÓä}FQ D»²îO­PUCÉÙmMl ÝÌã>ÿ= TD%DèÌW¸¤©K.ÌP:¼«Î>wÆM@hÆ®GÈ LBgÌEÊ«M3#fØ8' ÍºÙÀLR¼ÌÂ
ÔVdÁolL
ò/ì\»~b8Â7ÞjÊÙÆ·o¹ð¹èb+×hu?á&d-G
7Ý¦6¢Êq(Hrß#âö1ßn°Zßi*g±LbV|-çV<8 w³| t^ý}²
Á6äèXIeì¿VLÃûù¨ÒA¶Âù]t¯Cæø?Þje»O÷3ãJjzJÌ+¾\Æä ¹NV)¹NYÞË.§h¶Ysîÿ"KÆ8ÛçÑn%pi(»×n¡Áz	JÂ¶Éxæ¶îÂÒd"óÚ.}ÅÔØ°xª79J&Êq¯ùú3bâÓJF0!Í]°¢L¨yy+'Ô­aÝ8ñÇD±mðUÄÍE80à¹5f¨ Î-Àæó ËHbR§d}l3{=}æ_Qóó¾ÖÐåL¨´½AÈû¦äËzç8Î®É
Eø6xEð·tàum44£2àeEZXi<O¬g¹k­ebº¬Ëi;äàçºôü#¬<Fò¹zEð^2PG2 {©¤|IÖ¼²
ù@Iì6#¯¿81qlèM´=M²dê=}$a§§óMGtÜ5tNóLMÜSØ±zEþãxÁ	5_hk¶¥ÏATÊúÂ6ÚKÕZ9%£I×Ü¼Ì-ªaá Ëà=}y÷ìí ¥hÿðìà5,¤õRT.ºw2=}m@@gNõQY{D)'µiFÇCù>Îo	$ûHÜ®3ÞRI¼Ìi1Ä\ðN#&>t@ßÓu5ýâ»?pè%¼6¼ëÎËæ¤2cÄ·LÛ0½= ¬.Ç^<õ©¸ÿ0½4ÑÎs-^æY9½P$0¶Ôä¶!"Ñßå>sá»4½ÃÏ.RkÓ_tóÉEÕî4µpr/¢©Y9Ùªr«PDør&õZüû¡×å^ÞU>¸ LI'|¤lÄæÙ÷ÛNÓÎØXxåQ9uZ=}TÎÉI7
ñJkËô·ÀDûÑº^4BDàÅ¾6<ÿ­*xÇ®e¡QffJ0i f´Iì÷¢­_§²|déí|m-{p\ªD>¶åÚÈTû)P4yÌÊ 2Iv+\K®ó
¼ë«DÛhÈwç×nWæÔÁ/]Y
&.¹ITÂOëUÕÎÄ4õ£øR	°ótzV»JÆ¶BzªÆ±ÚîdÓX]ïØ= ÓÙ¿t÷ _O}H±.j\éáJfºQYrWv<ÇÂÈBÚ¹	Ú-Îê9Èá¥Öwäz©±=}õÒZròXïý×Fë+ò?³¯ó4ÔG£õPn")ÖhÇ%Ô¹fVX¿N¿ìcZõ®=}¯$ )yþ	Ëè<àÊ¢ÃüyD­®5P¡zvÛt>a7Ä(« ï×T@·¼áW<3k°-U'iþwöù
¸àÖ-Eµ}l¾YoamâV·'jÊ§  m3ª#ß¢ý#ùl2(2G7O~ó4gaø9Ât#ixM°
CÅÈ¸\¢çË×LÕ=MhÇG?'â
ÔVþd¼©Ð0\Ä>ÙÄå&Ê¬¾Ùk¿J]7u= Uìÿ5"Æ=}!RõtGÒkæïùÒpvêÄ,òUkÔB|7Ñðì=}°Nø¸8áD4½¾¾u;n,d¨ö3ýå È\¥ªZfhñ%ÏmDã2?ÀY¦àÂI=MrØÈó?±%qk-[åîF°G!ÑÍà*»xÈ®NBGó´ªcíþÜÑ"z³îetáS[å©½é:I¹Ìkù×¨(3èÊt°=}yÆm'ÙíâSK(êWT½Pa{ò[0<RÕFéÞ¨AqÊryd7Õ²=}F?Oj!= %Bédmd7§g|;F½P}8T$öåþýNh$ô}¿Ë_3d±Süèpg@ÕÒ[¾»m0¥4UF;I	è;ýï!î	}ûIZÂÔ©Jwïr¯è:Ì%Ëa¤R¡ë±9@ÇøZKÄ»%ö:Gð¦Ò¾JVÌú+}Np:DqEX£®chl ¡áÏíd6bpÞµKÂ^.ò:=}Ô°Óû¬*~Ù:N úe]HYx´jT#T)7Á¸Ê|è¦áqL8°=}uÃû9LºMÂµ2·Ë¿F9E­>*Mò@0ë®;®5ÜÐ«äEt8,nM2{JOâ«$Ô°ÓKDd|sªpð4øô,×i·y¿÷<ÁQPiÕÍíptÙ*Æv	9ògsUÄ7/Zº»%ÞÙBÕ tÑ=MÜÖÞ¹+Ù.GhÓxE÷µlPìÊÏnn+KGbIÒn9¯RÏ<0Þç~õÿ¼¤cèt:"1Ä*ë\§a¨XL"'Òbuwm¡>4$òÏæôQµPb7m2©J__ý³Ý}Ë#É	ÉïwûFª¡r÷£[sp@4¬-Ââ´ÀÁZ¾WËSB­	®noë¨ÖOóÊÀ»â{)Åm×îHK6ã?F¯îjÞø<Ùêd©¦Ô}ýz(¿!ÜDÞõÉ:òÀv'Þ	±uLK¨k¬c2}ã]Uð
nîSÖ)}f}Ïn¦[&¸D@OABF(ý²¤÷óØãi/-·4ßYÎtüFø=}|ß­.×Æþ­üBûöý~OLpÓÈ¶±áöÔ0Ão6ÎâÃ(W´kªs>¸ËÝ_\®µÇl¤¦dÌ**S?ý)G×1×·þ:FÐjÊû$ß¤w@Å6.»®Ði·¹.+1SßTÄHÆéèÑªãÍ«¹T é$¨×ÙÙ9Ñ¸È ä§'©¿Y Ð8MU= ¡,-¬BBÓ°(/Ø3ûÄ>YL4à4@lQÑò-·]åÚx>u@núaÑ2-Áõm­(2Øe Ç?·òÍLEüÆ^×= "ö\ÃKU±·¯jµ@»èG\9ÿùPñxgyåv×hqQÙ¹TäÄ©wHFÎPÔu«kIf8Æ{= õ(|÷Í¦].°#îvþ(á¯9!Ã8ùÜ_®ò(¹L	áÝôãò-·Ý^pXÜ·CxQ¸ªå"»ucZ0¥¶ü)üÞ_¼W}6ðíKÄK cn²´ÅCã ¢»u+UyÊÒÁ;z¿¯áã1e>]vÁÃ«ëlB-
ûÂËÍ¤uV<¾õÉºE[\IPyåµ¢øãO´*öþ= ç¬cI*f%â5áÔô£<>¾= /Á,WÕ¤áËh_IÒ)Y²-D§1¨ÈL~Ç{÷ Wäã²1÷&à\~Ç£ÓKðÉúEb­êÝZ%&.dýx¸aò{1 »5¯6} OâiúðQ%rÞ·+Ô|.·ìAÆ4¡´é~ãCðâ×÷ñ0l$möøõuXï/Ýá1
óTé"Ê!e[÷ßÉ·°ê]>¬ßT¤p4rfB|]»9×Ö¤á¸'7åè¨	HD£88dÎO'ÞTþm}q7!)ÔÒ17BL(g = óÉ ÿtÎrs[TJT= 1B¿	÷½Î$óÉ
{ ÏwVð«åb=M7Íò2@éÔrî~?{ @¨hå!sàµ·ü´¾Ì¤~©B¦°³·°júýÿg¦LÀd\(üp¢dèÖ_"wê»ñpê9ùXÉ/Á,×Õ¤á;êBs#6eG¸?.Ò6zÉ·¯êÝPÊüwÂS3;Ï
¤ H¼b&bgb	e@=}åíþxsoðÎ §¥5{=M ¦m¨+xó¦¥]EºDW-·ÝP}Ë@DêSÒÔÐ·G{yðÞ'Ü¢-5Os-iÅOl !7sÞ÷´WÕ¤áÉçôÉ|»yçi DDW1·7wBËO³aù|ðÞÜ²1H;F;è[mÔZLëJ¨{¤â~6Îòk%7O²¹ìbâvB_ÂÉ6«¨_i/aû«Â¥.ØaûT}UÄ,<åls¼×6!b¡Eu(îwÃ(g/a««â»^ì$C1zPÔÆ	IÝ0e/Á,WÍÚóBëcÁ
ÇcíZ·&@gh¨21'^dø
öÄ{
}hlÅ´ã²-Ç¥Ðå =Mà#
çb{Þ3ÚÉµ¯^±ÀôG¥coôHÚ] ÈBÜ-}¦øO¼(øÁ72¼#ùao#Ï¦7ýÚÚ)æµq35×¦ù¤V{ G®8|ØÍ½Ae6=}Ê5èpm»$¢»é.$Þî¡õOº³áðâhYDÝÚ¾µÌÆúÌÿ6ëI]g87ßíÌ_è©jþ¥:c{éûTâÎö/;º¹ÊwÆj«ïõR7!®çäpê:yèÉs839§k%"×Â8½jD²4Â~xßZ7Â]Ë7\-è0|ª¼ok¢ßÝ§á>áýrÆa;ú%Eû1¨â-537î&mw³ÕéHdï/_ÚR|jª/{ ÷bèd]"+¸'þÊy· Ät;!³ðÀøûZÑòTuNbß-55nkæU½uR6Èâ-áÇÁzÚâí@îS%(j7ÌÚÖ$5p(ùñ7t
fÈ{{M}G-Søéó0ûJS¬ÿðâW=MWÃÄ+Õt-@x×ô2cïâ×¶Y·ü6¾Â¤Òº¥^~=}ô%5á7yGNWÐX[êKÉ¢»^ô\ªÞnwUt¢êªåÂáÎ¤á¥(ÂÇ-ºHRi5K|2¿YÇüþÙÀðù,É[7Îâ-ðû·ÑÝ= 7|NÎóB{wáã/j·aðÞõ	ÌÅE¥Z:¿bð8ßjx¥º@JÒgª=}MÈ "Ýbi»ÒÔ¬¬¬ªdJ¾8§Ý'zhøC¡*üs¨!ÄO*âµ·Á£	,¢vér¼Zñ"ßí"X"Ë7ø5H?rô$l»i² »5}r|3 ;°<1ZÿQÑÒ-Ç@çÌopñ¢ò÷ØÙ.WÀ@g±kÍë§$I»úZºÿñ(Âý!Ad	º/ÓL>K$ÒÙá7"Û){+4Ò"âïx¥èÔ{í=M_-¢ýqõaSíÿàÄûÍ¦]¼TØÐô_õ*\d7ü]Õ=Mæ°´´ï§êÝ¦sí$£vëùÇÝª7GÉPºæÂI»5·ð#
5ÊD¡¤ãÂ-5Ay¾= /ê¡h$:Oú-!Ç&BñY¿áA!Þë(ðRZáwbv)¿¡7;kD<º8ß_:]ÉøäßdÊ+bôâÏG-Ò os$0RÄ4ÄE{uVÒ1ëf³ZÝélûeÇ×qN7=MÎ¢Jw*y-ÔÎàcZXmsG-g/,äw^ÈÖehÄ´g@7òY/:Áuç<Ô4{ÌÿÐýÔþ&ïÕblÚ½
§Ôó h"ìGjóî= ÑGÑ¾Ò@f¡Î¡(^ÄI
kH¢?ß~Eÿß§ÕºÉ2ÉJÐ3¸ü«y´Jðí¤°»ýØ{KÆ
ÑWüItUêNüÈ9>ª«}èI1Èæ@x1Wz\eSQl(ÁEsÅ ÚÃU±H#-èÌ!7O+mÞÙ,=}â1dínJ1IÌÆBÃÈoêÔ£InútU÷ÿ²iÔ.dxÁ³!3[éºÞ)Í 3Î×ìAÐ³9b&2=M2OÀxêS®=}!Þj¹ØñRf
º(äf=}ECã)î¦ïá
K\¿bW·÷XË=}C7¹$Íþt»16Ö=}vT­ZEé®Í©3íJp5¾YÕ{+)[0ûZÂÝÐ¼um¡øIèÍ]ã3Aöo}ÓuÜ.ÿ2=}YÄq¢¦Ç"º¡ÖIWK&ÒlkÂK«E{pºüû¸âô¢nÁ},ÎjÁ×Ûg«Ãí®_²¥àe±¢Ò¶=}èÇÙy3)1ºÚväì<,;+¼öe!víMz¸XÍñ|¦ù¤½-;M Ôâw4oç,,´ðB\DRÌEbZÂ$¯Ù³~a['FÚ	^óáO KRÞ	¿Ü4 ùüö y3ùM·Y&$Úå§öO> ï*-c+>óÁ6ÐUuÁ°G¿£>á¦¯ß7W9dÅnöc¤ôû7ûndYû2hÑ²¾
îyÒô*o^ªsÍ}M¹ç?¥HP°IZ©Z§$M[P«)³k_(7ÌÞRÎÎÊ×©¡!~Nüco¤¬"Of!¢­6¢§Q£ÃwCtxÞþ	Ï7FÏïóÎK´ºùmã5Ëàó¡½S<& Êø%Ëc!}Cç³ñl	´}¯-ê:­¡YùE¯ìÙWþÿ^A@Ï©´/Ïô~0£ÔímÜÐUØÌë&þãç¦HMiø=}nâÃû®ÊùJmOÔ{\MyòÂvÈ&Á>!$¾Î9éÃSk-â±·¢)a \¾K©®4ÃînâÙ}E4õËièØ îÆxÒý?ïP¸#(Â]ýÁ4 aÝQ(r¡$u°ã3]ß!{¼/
ÇWÚ8]#(Ó19¸ ]Fô¢F¤O¦FÆùÓã
¢t):~6ÍáºôÙøðÝÅô°þöÄ¾LWE"9:ÁÄÇ{"L:&¶I=}¼&ÖÖB®÷¦ÜVÔÞP4U°Èxµ¸JU£HØÎ6*tÃF5\
\möEÈM%1¿Ãá	Ô[I Ìç°E>=MÊ÷±±~í0Æg¯$(f[ûfðñÓWÖó´q 9<EJÌ(_nþ¹2Úþ«ãLJ.0¾'ÜÖî?(¬[[i§!ñ[ÉIßc>þ Â~Û)áE[z¯QxÚ3@G0¬O	îüÁL¼ôcËÃ©W*$ uÚ°í[³Û·Ã@´¶IêÉæG%×^ÃSª¿- ¥$iI6ÄS_ö¥È0P>ì/
81^,0\7,D=}íp ó»ÍÙq§*ËUKÍâuÅÛP¤ôãX$M¯·¾d¼!^7ÄÆm0ÛþæFXeS$jb^õûçQ}!H²^;Há?¾\FEÄZmí
±ôºï ÁÑá©ã±%©4Ð©×dË¯iõ^áãÔ)ïòÑ¯_¿Õ
7ïêQ÷)~Ë¶ãµo'7=MØvº«ÓlÍgÜhÀ·ì<ÞÈn£/æÑÜ^NÊ¿À± Ó=}eÁ^ôÆz©84Uo,üccðiÅU½ÕÑçG%÷¦LkîÙ¬4ÍâN·Ç ¶[*\á_WöÕÏck5EÂ¥dy÷ÅÇ(ÓÊÃ|<Nj[ üdÝ]R^n«@ÁRDè{C0#eÕ»+þê¼â-ü­b|ÓÀpÿ°ïå»Ox=UjÚNío¢ç?Ó=}]°4ß@ïb<rÙy±ÅÅ^×(µÛèW=MÄÁ0#àå ¹\(ããñuõ»C÷FÎÑZ6.hv¡RªqAuÝT¹ãlsþÌ«Ò0·ô´(O°q»Úq7pýaB%¬ÓÝÇæ<Å/9dAuÌÕz/|»ýª&%Ôùíô=MHÑZé¤¼Á!0=}HX¬\@dÌ=Mñ¼ {:ïT8ÆuÃ·ÝXV»= A.j_xièÄÕôå"4¥LÃ;?ÜF>¨ésot]Qn²ÐåñüQ%¤d½õºÑ»M¦´jya[ñ2Ûx¨¯	º¼¤,0eÊ+JË|ÝÀ~îQè÷>=}¡pß YÀ)ÑVxBÓ33!]HÆç=Mù2È!)f=}|÷Az"ÝR+ý£ëÒ®¼s[8jú-óÝLVä+ÍûiÈD|Ïsöñ=}=}ý²çÊDBª =}ô)ö§¶[Uèé±OÅ&?þÐeå¬R08ièh*ÐHP2æùÌ¾±ü·m9-¦º4°å¤Ù= Y¿£5~?qËBèokMÞ·7|wÿ=}=M-r\~èÑØ©ÄÚï#¹yDÅÛ´RqõÈ®öÞscE¡{Ï
}À¬ìCÀ®14°iáQ,<o}
PNï¬oA¦LiØ!©T	à½R¿Käó/Ø°ä«jq§ ÖZÄ´~Ëº(8ïÝ]ñ(?Åî+ÖÞäqqcÍ|o½@&w½Ð5#°s-$.×øÍÖÒáòÅ$þW¿Öñ0Bå|ÅÚõäIrrE¨:VOép¥¿[òZpÔÌY 2VttÈ¥UX1 A4ÌÏTQp~C9*ú/\Òôá¢Ø=}mý©X³!.îìTo$6©íQx±HÀòrç¹#	´éÓ¸¿!¿zCcl*ÜÛòa<æd+0±¥ÁÕvÇ»Xg~Ã°6¿$3p©AÓb ëÁpÂô>/¢bèþïf
£Ón­ÅMl[ÊNpi²cî¶zà¶!R¶©ÃEÕs¸Ö	smþ6}jvy­JÜ¦,ý&mzÅáÆ«X aZCtóàIKçp°ø+È y"OZ):e*îw{åjAôÒ=M½pÂ/½&ªÖhIÌ~)F#v}&Þß²¡:®6ü·\«¡®âáÖzW Y»ï4¸p0Y]ºö$êõ©Ùsù{V?WË¶'OI<3]Á,¶ªìuÎ¯n««ô4¿°~¯ÏQÕæé÷J¨Ë<xÆ1Ï¿k¢÷	XPqÅ£©·îPÄOÏ³¯Ð,[ÊUÈ	ñ	8½äø=}ËYá"RévZópØaH-õÅ|%´É 'Úl¾lWx&v<ó#w·%4¾]î\¢ÁúMwú^>¯XKôâiÆxÎ,ZlC¨ hCúhCúhSCúÄoFä>*;ã= Âò)W8âã)GX h/ç~z¿¾+¯è)@VÂª_Àò¨ö×o9,ó= dî6Erò'2l_'Hîc ¶xÒê-XoúC0ê]þ:¹ÿíÀA]Gò0Æ.pSO Ü]fBÒï)ïPÆÞÿ!Û¨bÞæRC&ÑÛµ1££µ=}^àÀ¼ªPL*ûEÂMãÛò×h^bc= Fñ	¥úPâ;&i
Ô£r*}ïÝBTR:+GÌ×%c­ÝCÿcÐe½É
6úOztW3"Ì=MpÄ£w¥¹3dÉC«ø|CrÊ?DGjt»3Y )§×G¼cJÈ»¼¿xwÒ÷¬DZþu=}HAÀ_F¯éJ+ºÿ{Ý= Ç°KDtHÕë9%Am]=}}ÄÞ^¾>þ~¹ÃXp¯>Ñ· ¸!7¬5¾j®µa>ãàÕfV(j'"P¼@ãF¨ÑÕIö
ÕC©þ1h%þé }>#öÁQ,î«¿RCf$ªç¬¥³ËÖÑå¨n­é}OÕµÑÕ¶¯ÐqÞ¯7ÜqwÄZz¨L^mÄ	]lzLyÏµÇV±ñª½ yÑÒæ]øÒ_ $´%} 8Ä`});

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
