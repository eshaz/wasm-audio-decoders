(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
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
          value(Ref, wasm) {
            let module = WASMAudioDecoderCommon.modules.get(Ref);

            if (!module) {
              if (!wasm) {
                wasm = Ref.wasm;
                module = WASMAudioDecoderCommon.inflateDynEncodeString(
                  wasm.string,
                  wasm.length
                ).then((data) => WebAssembly.compile(data));
              } else {
                module = WebAssembly.compile(
                  WASMAudioDecoderCommon.decodeDynString(wasm)
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
          value(source, destLength) {
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
                  const buffer = instanceExports.get("memory")["buffer"];
                  const heapView = new DataView(buffer);
                  let heapPos = instanceExports.get("__heap_base");

                  // allocate destination memory
                  const destPtr = heapPos;
                  const destBuf = new uint8Array(buffer, destPtr, destLength);
                  heapPos += destLength;

                  // set destination length
                  const destLengthPtr = heapPos;
                  heapView.setUint32(destLengthPtr, destLength);
                  heapPos += 4;

                  // set source memory
                  const sourcePtr = heapPos;
                  const sourceLength = source.length;
                  new uint8Array(buffer).set(source, sourcePtr);
                  heapPos += sourceLength;

                  // set source length
                  const sourceLengthPtr = heapPos;
                  heapView.setUint32(sourceLengthPtr, sourceLength);

                  puff(
                    destPtr,
                    destLengthPtr,
                    sourcePtr,
                    sourceLengthPtr
                  );

                  resolve(destBuf);
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

      if (_module)
        WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);

      this._wasm = new _EmscriptenWASM(
        WASMAudioDecoderCommon
      ).instantiate();
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

          let moduleResolve;
          const modulePromise = new Promise((resolve) => {
            moduleResolve = resolve;
          });

          let decoder;

          self.onmessage = ({ data: { id, command, data } }) => {
            switch (command) {
              case "module":
                Object.defineProperties(_Decoder, {
                  WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
                  EmscriptenWASM: { value: _EmscriptenWASM },
                  module: { value: data },
                  isWebWorker: { value: true },
                });

                decoder = new _Decoder(_options);
                moduleResolve();
              case "ready":
                modulePromise.then(() =>
                  decoder.ready.then(() => {
                    self.postMessage({
                      id,
                    });
                  })
                );
                break;
              case "free":
                decoder.free();
                self.postMessage({
                  id,
                });
                break;
              case "reset":
                decoder.reset().then(() => {
                  self.postMessage({
                    id,
                  });
                });
                break;
              case "decode":
              case "decodeFrame":
              case "decodeFrames":
                const { channelData, samplesDecoded, sampleRate } = decoder[
                  command
                ](
                  // detach buffers
                  Array.isArray(data)
                    ? data.map((data) => new Uint8Array(data))
                    : new Uint8Array(data)
                );

                self.postMessage(
                  {
                    id,
                    channelData,
                    samplesDecoded,
                    sampleRate,
                  },
                  // The "transferList" parameter transfers ownership of channel data to main thread,
                  // which avoids copying memory.
                  channelData.map((channel) => channel.buffer)
                );
                break;
              default:
                this.console.error(
                  "Unknown command sent to worker: " + command
                );
            }
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => ({string: String.raw`dynEncode0078ì½Ú×>7
.	0ãGtoÿ3sZfAªJ(\ÎY~Tú­ÓÎÌÇYJrsÖñÙâßxHó\ÚÊ3¨ÁCßüÉCæÅdc÷yæ1fI³õiVWwZkeóÍ¯ÏÃÞ×=M+ï?Mv6£©ü?öWÏ ·¼z´ ¬½Ë Pï2mySï	DG½{í¨H"ü!¾ØÅcú3R2µV + OÐRÚ3ÚÞù¸Íý+¤¡ac }ûMîM ®EªW»±°úæ7sh#Á±~EÛ¨Ç¤Hªá}[,Â 4q ë'=M@qn£õ!/ê\ëÿ]à'X]þècì_.äUOÓèBIXÍëve/êFa|è}íHöÅ¦;bêñÔ¿-â\nVÎËç:dÔçWÒæ¾Çchw«z;Á{#Ë°í"}&±í|fèbT[¬ð8áh Ë°ïr³hWÆwvWaðX[Æ{î²p4K8&}6ÞUÒ¡+×k= ñ±	mÝö= æ#ç¸EÇCAC½AåõtURÂ5JL÷TÕy±i(ÔùtÔ]ÖyV¾*%QUÊûLUê¿¶Í[ð ATAEÜ¨Ë<é~ñÓ2X]éVZ[¯×®CDqUdwOafÇRu1= L²Ì-Tl¸[%G»òO´ÔwI(÷y¬ÝóUª©sÚrf8«I«<Jf"ùây0¶FJ»9= mõÇ f wf è>Y=Mª8¯øèf´ù®xç,´Çº5]ø!zn_¡nxkY«ÿñQ!,Î{îà×)Éó2;{ÝRlùKÝlhððÄ®=M®}ø#æSccòc¥¢ª6cU,5±Ð­nÖ%ô±ð4ïÄÂÄx.èW>^,7jüäÇT*Yí#òGo6T?¸ÇÀG]!¸è¨§P¬åûö_Ò3$åhÌÀ9TS;÷êtEë÷
÷+~»ñbsgEÿàÕ'þkg;pXvxâ)5Å§¯L\vù_Vf|t¯WD¿;öçI EúTÇ÷v>ô<IØ|±>W é¬±èox¤e¬òúe¿»=}X÷n~ØÿÏWîO¸ReR98g²ÎVæd±4É. *O;¢´ËT ¨Èn[§úë.çÚè\øUÎ¥= oíÛÞsM/­'
.3Sø¦R»[ö°ÐLì!µOfsûRlé*éåÚòu1ÝßßÞÈÛ)Iz= S/ç÷L·|çPî®¦¼ô]máä¥Z/ü­"w~ mãc½g¥©l;©¼çó´¯xcG¾h¥IýÆø¦ïõü©2"Ù>Év%á°hïD$ðVÅ½/!þÞ<ðÍK%ïj^@V.÷©vGá¾¦T5:9-Õr¦R¦9U¸Ú¾:5"÷úD>ÞXiÀ©«Wa»ñ}ÒÄyq¶«W#Î)Ëû;Ë»/*c¶qÕuvöKnÞ ±­Ê-§]6µ'¡oäYº(½§)©¿²"ý<5î¨Þº®e»©Eø4<óª|¡D¿3Ý¿T9.Ñ½{X
Ð¾MTájTk3= = »%xÉ:( ±2ð¬HqÒz³üªÎ¿ åè4{[Â{o3£Ýì÷Ø{«x¯QPç+uýµzÕ1=MR5÷ïæÅÖy¨ú½ ©Ël0V0¨Nó¹ÂüÓÂÈóG©"ôo9 0@ô¸uofT".8BpÏlù'6Ðú¼=MÒ=}­pi9Áîm¥A&vw	Ý\Ã\ ®{hiÞòcLþ])O¾Tk_;pªÕeS4ÒP¥µwÌÚó¢üg¤QÛá*i/0§nReáEÚ w!êGr§áªXCóÐù$_½(
U4ÉÛ= ß= X9ófX=MÕ«< ÷®d­!¢Tlñ7&.õÉÑ]êWa1WTákü~{^O2Fw»PÄýa«Í)ÓQV°»K0)aSp²9;µöÆ!é2¯óJ7áäÅ~Èû{wTcKòýk5~ÃØÀÐ+®a»8H·9|þ	"å¬7Ýó&0]ëÀ¼pË+¼õõi~¬ëî7FkWÒûl¹©ª/Å2½þ¤ ÿ$=MDÈ{=M5v
*qão] >@ã ´*béØï¸Ãi5ÖíA#­Â[ðàëÈMº.ÍûRÎÊ)¼9ÿ-;Ð1+Óþ¼Ú'½=MÔm
G¥0´ ,Ä8µ¯hãÑóC¾ì« ô\1~¡ò= [b@%O%5ñÃð¨ñ$&.@§¬ü A·ó¯!";*HJ~ø;ÆDÅn!ÞB.w!Þe<ä	Þ}~góozTPs§«gGÅ¾r·Êè".SPÜOÜ1Ä?ÕtZÕÑK
Ñ¯Á#Úæ¢¾Ç¦Û<w»Á5?ÞdåGäú½ôîH{ÕÆ6LýX¼ê= AïÁY£Ú$ÊÁæôé¤;v7«$ûÛgó»\(bí57iÅ«ØùÐ*&©h8Ì²ªÑU	¹ÖcàùùÝ¶Ì¢¡b9= ôäWJ~ã-nM:þ(³ ,±©»¾7Ù¢XÈ#üEÁâ²¸f2dRV¥ØQÝø= ¿xYC7Jßpë(áZ®{-Ç#ÿ¬¨è{¶¬NªEÉ®ã:Ëì3h9ù]c®Í×íl¬¸$üíÜèª­XG+b@l;·¿ÙÃíü[&ðÑ¸IÆ)G®ï(64¿ZÇõv6výÃïDìsj¿sfóeL×hÃFWgù2uÒhfµÛb+= ]ÃÞCgAl×U­¿¹ñH([ÇåêBù
ótf¿R-LC÷N¶_»â/wææ»¼Ú»ZpÌ3ãï m©±¦ãïgÛú¼¤è·©=My½ À Î= ï-Ïù¹*}ÅÌ'ð!eÌïgz×Názc¬#
èk:ÈÖ6³nü?ÅØàîÿT9õ(º8Ýø;4[¼'êóÌV-¿gúnB<Çºt7xnú/[´þý^ØÎ¡}M¼Ù%züÈþE+ÈðfRz¯q
S Ä=M3­M=M¢¿k4Ò¼>8 mú>>
Ù7Ê7V,R|õøiÛ+ü2¹EÁÎÃnò0ÝþvÝäGÜØ9GãÇê¬ëO±?Àßþªæ>®Zºêò¸iH{¯P_	ÞÒ Øs¨J»Àõµ-Û~¸Èº­M¿ÛfèØ9Gåï°xAGæ&ÌÏÇÃacY¼~:b±nT¹è.vÒZ8?	ÅV¢ÂQ)93äm$Ï·í4ÄÛö²J´Ãö{aT÷ãÜÿkõØz5¸6ÅdH¦Î´n >ÎÁ]C«Ë¼ò5 9æ¾ÀW)ú>¦²Î´úù¯Â\xyYo ,ûH¢Èºí¨?é3âGÍs}Xb$,áØ¡{¶÷ #½ÛAfCµÑöÄXQÆÒkn'ÉªðEÈÛØ åxaííÞ3ëËºÄ¯Ø[cËô£8ÄâX9ÙAXw=}oB´¯{%èt]NÉçÿj#vuóøçRpÝD½½mPs#Ä~¥µ§È©üy;#3¸5ÔoD±¯×Ú%g«®E¬àd°mþ§&ÜUÎòqØÒLsN!)EbNnïeøíNÑIsÿã+ÖÛ7 ¼<+Ý õ( Ý@ÛdOXÍã/ÇiG_Á'òÿe±¼3«lôæ'e(5'X¡Bµb2¹©QwLOg_¦dÙ5öÎ_V¢~qÇcã¡õ]â!M.Ç5¾°%qUKô÷ç[q¬'ópT a)Iò¾±>B£mu>X1ázÍSÌN= ð=}|µóäx
2¹Ldöò¨ô¸(Ç¸çµÔÍ|&ÀùSª& \Ì5O·oPl8ªB~0[¡Ì­'wZû= ÁGàL&¶	e»öXg@0µR®áG°
ºMÖÀGW$ålt'mWía&Aü®,FIxQù¯¤zvóÿ×PRÛh4Ð)qO§ò§X©ÖE6J6C¾þ£©çv¾Þ§3ï6?ë5õs¦ò}3ÝÞ_Ô,ç¸ûO³¦3[gé5ý·R$hXåâ_Û17Sµ?¸>³P¿oÃíTeõÈó®ÎôÇæ4,B)uT)6bpÿm6[ßóÎÅå Á°|^é­¤l§þH¸W·]2Â J4»ÚëÛäá¦o1Æ'â1Ç>ÿ8C{³«Äqk>ëö(Hý×5Î÷F#üõMÏøBGO= ¥à'"FWE¯¦Øztòø3!ÔòØÙVyg|éD	Zû®C;y][Ö(ÊVSvS)lCcôçµJZÔBo¡D¼mºà .°Ú aÙògäè*ái>%F¦ähïÓÒn ïþ±¿'Û¬áC
{v´ü;Ò¿f ·çÂ¦oïËq+ºéZÍm?°õ_4hhJÈhQi.îVH8÷/¯é/whg®¬Uëfª6= ~~)s'o=}GNÇõ4ôíÍåy·:=}.üÏD½(´ÿá:â^öaï©X[X'¤õBñHöð¤p5FeÐIHûÔJV³£\®8W¶Ü¡õhI+Röp*¬gèímàûï¼zìD½é5X<ÿ!#11Æû]D/ûªÑe [To'N)%úªÎYa¦ª¡'Ñ¬'æ\= µ¬ÓRÄ&=M)c?~ÓØbReù3Æ¦Ãò2Ã«Â¦¼WµîeA¡9:oåbjq suö »ÆFë­k'õý<Í¡-*Rw°IÃgAzë4iFÍÉy(îÖÃ~©ñç[íl[¢ùTEÛõÁ­QßÇ·áRqY&Ù¸ªïgoõñ ¥IeÞEîö£JF÷Ö@%
èc5V¦À4oºl×Ä<UüÅ|Ê¯Ô8Ìì-0}a»#çDWÓ-3«$Ø w«Ú=}Qm¶(D·:»Ò|J»¼5aÏ<ÆþX¯´¸«ò}<¡= 6ÇÖ ¶¤Ô6ûj1?3
Q×iCC*L÷E ÷ b¨Ì&×TútG¯ú%/|AÔ*X;î¼Ò=}ºý±$«ßò$=}ÀîÜ Û]÷\3ÝÎ0b¾¯oóìÛÚ÷%U¨{èA
BB> ¿ ©ÞãäcqcÃÏ>â 4ñû[[q/[>÷lsëùÿ0vÍGTë7èÆZ$2d¢P¯õz¤Ø¼Ûäs= sT'·z ÷({d[2³ÙÛoCßÅRèxè); ¼= =}ÍkàÁ=}Ób t÷u¢cCýP¶<öwNÏ+u;RUFN1ep}Àûîeý0R°äDlòõ8c bíùybs§sïÐ~!Í\a3§ãsEä·rô¥ÍcEuÅÈÜûpþ®P$²ÔwFU÷®»6OD½ .JH@ ±jX ¾ÅSºpJr©îWµ&ÅRÕ§âo[[ÒfïÙ}~L
úR~e&Ñs]é#Ù¾L%Ü±±= O?msÛõ
Gçy}×þµ«À&òîö¸ FsÝ<ÚXG*_ïsÞËk[!st³Ô
yÀè»°<f
!B.>YL ÌÿÚ$T÷´×ºbÜ^ÈÙY±*#-¡¡¤NÏ\Ùj>ûàå=}_ö±Yæ?ím<â«iYp«Ö¼|±1¤¸Ph|,Ï÷Ós¯Ä®Iq>»$vÔÁÝÑ¤=M®¬Ô²>À1ÐþÃÍâ°lÿáòâ?çÝÅH|ÛÒ«Ð"FüWôqºì³Nv/wÇÛ¤äy
×C".ÿ"0= ³m[V d÷ é¹mïàY'tÒrc?+:XË¡ÿ¤þdgV§Qêt¦«zp7Oý*¿u0 Yê®ª6Ê8©yö|ëÙ[û÷Eµú?ø= i§èz=Mù?áææ,Ý¸WÓÒÞþÏ\>ÅçQÕÙ~8gì¹x'"õ:v(BÔ y]}BK$AèëÐ]ê	Í5»-d%È>×6ïgÖ2Có/­|>± í,¯{
õù®¬àá>|ªGMîþ#¤Ãxôjùnû?º#þFAøYVÆR§½ÛÅqÅjÊðs<CM¼7b¡ÀÿÏWL'Pü×&Ø'f$DñèM1ýHµ._eû8[ÃÄÐY&3ìõÞÖÃuã':üÃ¸ñWzU×1 þ²[Û#RÚYhö,EºkÍüA4ùÏûÕ{HÃçQËóîë£§n¸jî aôY6mÍÁ(nÔ27QB².§j²ÿaä³«-U²/Zô¹°9ßí÷ë¨/gËÆø·AÓ= NõnD»ÇMÍÁ^N³nÅ9*é9:õ¤ÒL·ËC®ï;µóJuÜ¨v5¡ô¥¾"o"DA¦t6Õ@¼c ýCnãøôx)RÄ\§ÈX¯Ìè;\ÌêB4BÃÜïg\Ñåê.ýæ,6Éì®]Oæ,!ÄPõ¡ª[Ê´²ì×P|xÝ¥<mgmIgQj¸ä"£´1Ê*¯¢O© .EÒ¼³¥¹Gºî®1ò·0CÝeR©LÙ®{4æME~iµQÞ^îã¸ÓxSÄîj|Ã_iÁÆÆ9þ$9>ìÿæüiW:I÷A©*©Õl"fV{ù´fªM¨z'{c#*©Ô]Ð¸[g|ô
å*-/t<BÎmx--´úèjGA=Mö²;h»üó­_Ã1¼ë["Êøê;½ëk äÈÅ
yÚ3ÀÓzrÐ. ú¶r®ÞIJ~p9é?lwÌ_YºGì¶¿^F7ù6µl\ªüË_µ_t
7ÅÜ´áAöÙÀ«ë²ÛGò+Þëz±4©'ÂàÚç_,U4ûÀfUëaBÌ­)}F ÿ4 ©Ý(æÁ9sP^bõ8^Tw½$Bts7³+aÙ[ÒoMÑP42ÇZJ/²(bê(¼ÇÊÇ·:¦òâ¯îÁdIºà"õð_4Pý4òÊc'&¨ýÊÒëT8m6áB´Eu;5f*Ñ¸¿½e¶òdÇF¢+ÒÂXëVÄÓ´Ü:ËéCÄ*bÙ5ÂyÉ¸û®é¢þ*&èl=}ºÏúÊ7móMUÆ·BÝ­²HD@¨!À×³mtÝ= ö5GY4,Á÷ýn;sì»ëqñåX6v¥¡g­AYR$ÐÏèËj¡Fz+*K©°¯Öì7²òUz,ãÐi"\k¹¸Vúæz·²yüv\9Ô¤ØúxÄ#S«n¯ìâ½¢þ^ÂtEÖÄÎVwMrË©T_!9)õ2zÙäì=Müãr¡;^Çý÷!±´#ûêx¬<U/ ¢LßWõ2c#B÷ë=}Ç»cÞ°ÔÈÌu§!É+v	îòTbg÷Êü´T­eAèkÓêÊÃ&æá{ÃÔpæKîöúñ>JçìÔØÓÉÀIue^þf·£fb£×Éö+HmoôÕm%2]ï 0q¹'ÃjLîó°v5¡	çG´H¡ÎW·[û7iúýs1'tÇfÙ
¨ ÓF¼ !ÊýÝÌý4[ð.§2§"6©lß¢ÒçºhßN÷1cçÔR8°KXWuURÏ¬Ã6ßÎ0 »º2ýñ*©kµæ>g"Û×ïY0+?'tÅr^ôGOîr3¾ç(x¬xHì1¶É<6éµL,ÀKhu½Kºä¥Txîö3û%ùz~èw5ÎôôSdåö½@ÂÄÂSÜ¢ÿÎ+µ¢±"ÆØc+T4çª¨¶h/öÜ@õ©\*)B*^ÝA¸4wx$°{øo¬ø©ã¨õÑËu§¶ÖFôt#gsXw[v¦¤¥ËiÜÒêÑ¸ÑCmsuÎ²¡U£
ÉÂÄîÊ&ñæO4KÆÂJ¦ã²í_ ÍzÞÅÀLPÜ«âný÷ÄÑßÜ¢ôA_¿c½*½E°_">MÝþÁuú¾ûiE×¦ò¹LbV7´¾Þç ctwWÚMÇý÷ÅærÛb»¹3ãuµM¿§­Ó°&KõJµ%Özá­Õ{GàºüVr6ô ¢4x°¯Í Ä²mªÒ>MªzSà}Ú¹í\U®µæiX=MRãëR,®ÝºóÇRO°s¾åB^­x>r
¬×®¢cÁCd,_ÀuÎÃ=MùÙàíVxEÔMêR×GüRPóxIîÎÅ#ð¹+ØQL2%Ú²©/øÚR­ÇÉK_~|´a}ß!¹±«×}Ö­Ñ£Ðî½%ýôSÔûaÁÁ_P£-Cx;*_çEW¨7Þ®÷=}ä*qÃÞï£×tÄ>%vR×³%§ÜÅõáÕ-[ÒR%æ¦bîñ+ÕF2ÝÁ2Ýì]ÓþÔUêN¦ÏU*Uª2ÔæXì)Ð¾Ø¡ÖÍãÐ\AÃñJ/çËI_ÞÕµETHKòK>ôDC¤ÃÇz·íÛQ¨ßP«)Ñ«Ç(QEÑ®=MñE@´E¨G(ßQÜ^z<´GçVEªÏP|^âÛ÷ <w(uMÅ)ñP$(±çÊ®Ç0±#b12·Ô¯/Ò4vZwìñIFï}â¡LýÂ±uffÍÕ·¥_$×ó6Ó»O'%èr:z6HåQ*öeQæÕ7ér½a. mãÇïã= r-üKÇ¥HIa2¥?$×³S%C­ð#2!lv#tT«IµÇîóHåiÍ2n¼/þæ3Î= RÛU2eÒãß2­ìS-6&QæÅä/þÌ@--½ïÚãw1v¤j19ûÇv¼eâ·Ã­I-5\tü§­±£Ü«¤ÜTõë¯±SÆÉ@6û]H×=MÚmÕø5ÄþªEo\= V5÷(µ°ðaPiGÌ6:Ó´äëÞJO197Ô÷= £ê#-ÒZ]©*n¤i-d	X¥ú´@]½©E6¿D@"ï¹íÅ~ô:sÚi¥æÊÐY#70ø\ÔÐÕãZôË)ëÈÙZÚ¬/Üò¥0ÃÔCé}ã&µ#©#ÕÝäîý¤h{§´y³#·¦{7õ6\Ðtî6t¥]c6î9UcfíÒ:úÍue-]íò¤á&ð X,Ófsg}>ôëhCòqÉ?ã/}!E,luV²¦-°iC®¸¨ÏFÝµ-E Ngø°,Ä÷"£i8ðá-hØõ= .£~ÒöÌ}¦fæ-¬ó^nd;R
=}X7ÅNÊ"@ÉÚ¨.y¥Ñ|T_wd#È¥Oá3S´ÁT<qY#èÓÀýôRÑ}ifþÊæ~&jO÷ãLAë:"WLß»g64[äp$·á;ÍÏð¨ä¦âC>´oaÊ#S÷båÁa93vé0ÛÎ"kÚ4¯OO0ñ&EÄû&N¸7õá
 |3xZ¯HÙ"DÄÂÔzhUÌpRð§ä7q|²»ÛÐm×Ä8·'Ieë|ù¼å ç0Ã{§3âÙèCF¾ÏS_,ü£ªMï>7§ðÂ§ÎJV®æ
l02u,aËO­ÁÇ­ÁLå¬ÁN5ÁòÃl¯Q­MßbÅmõÅm	rx!ÖUo÷Î¼,¨Áä®¡kÛk,¡Í=Mô\QN3l;rÄXpÄI®Å$E¸QÌª½ßù2-«ÃÑUîÓä/ÝÃ+rÒ/NV»E{dà= . mãîã= î¡Ò.2ÿ&æaÊl¾/þ&°ëåFµ·a1Üê6ø½ÎSÁ¥´´~#ÃG;ý&&íaqÜ/þ&&íañR%#ãÕòÖgNHåOzÕ³M%sÎa±Il$_¼¼Frèîù0BRMõÎë¬{ecêlÑFá®Ô
Fé4ÁßÙïw-oø#Àfý_\«ëÞf;ÀÏíüx9è|£+9Þ_¨ëi+,ú¸Zµg_@ßgëX_è§¦G·ßgrYëF±'YuwÍUjjzZÆf&f&&&&ÆMMö(®¶ØÛGÂûiØe2=}]û­ÛÖ÷môX8lY8E3FðÈzÖ"jmQO  ìÛ±(ßçm5OltacÀådVlsÿ´#xT´Íé Õ¤ïXs»ª¶/u´¼ÍmÔ)²C¬{³B¶]«]F¨º0+¯òLê[o{DþAìßÄÖ /F¥ëAì´zðní"ÕdÍ£1¾MÉæÕJÉûb¿1L=MBàÓÜi	¢Ú¶í7ßUÞ®k¸ü»0\8·\Ï°æûÎ2N®©F¡t¶mD= \^»ÛùÅ÷tn»Óñ!Þ~£8±	úá"ÃµóÒûÝ¼¯yÓà¾«£Yqgî8i_uòlyöê»ÏthNÞËÙ?ïÆÇÖUztÃðn)&O}LØ³>:ÃS= íhÕú¯§ô×óÒ¹D¼s|×±7Ê¼j\!Æ¬û^äÕnO@lî³ DtVÌìÄHÉªê·Êê«m¸N=}@DqÙ'Ò
[HV¦Æj!ÐµSYòþ°% õ¾@Õý{ß"¾àî¨¢Àÿÿ¬2Âï¹Í8íeÉ}ÇìÿLx!Wcd=}qq4=}q^A·ïÓµÇ uPVùÀþA{®8¶|(úW3cíeBróqÇE?	ùp5v¦¸ÆßëÂo=};ª{",GíéN)Î"kã£6»¹Ëã}O-úýìÐ¹è¹¦×í×/®Þ¨·ô­jÏ×Zæ=M8ü[­¹Àa jáòj©¯ýóôåZTÙ?wL1.C(ê+ºÈÀ;¥ºÝ¢Ë u=}ßJ{^Q±ÈHm¯ÄKjFÅÜ«µqOqØâµYx &äÂR!¡Ôx±'êÉïµ´¦®lL6Ñ2Ý½Rª Æk}
= $WH±©hÒÄ= ×BERa!ª½å-'ô
ð¼gë2k= 4ù YE"
Âì?ýXÌÍêKcD| »ûã´ç b= 2ðâñDùFÁÈÙ"düÝÒî?}
á	§ªi/«Ä¤	±Ï»^#W\:Ò+~+±Ý46e!§²uQ.Ü'C´úã/µ´ÑfÆ=MLóIâ"ëÛã¶/¸½{·¹×ð \±9(g ªlÎ¯{^â9ì5Ï=M9Î­ã$ò8í³):õ=MÃ)dIvÃ¿þ­*ñÌó¶XÙðNDÏÿÉ wÜq×ho1ä¯ÈµÈ-p^*[0²·LÃ?ÍA5[õÉîªªîBHÅ/Dbj¾x:úcBç4óH´£ÅÀDÞ"ú |Í?J0Y¤Ô5HÜ»Ôëû½­kQ(î³\´æ{LifæI ¾¢âÞfü{Ç¯ò5"(H$ð@M= ÀËÒ)®Ed%Nßc_ópÛRmi$îõÔÝL7k<S"Þ¶/úÿ.ü«Ð¤:¹-#}1Ók*x5(øÅæk·FÇ~;*ã	Bv¡¦r¬rGÓæÉ@N%s"»ëzî­N*² §78ÀÁV¥Y)[©Û*ÔÁm*ì¹c©"®Àn^«°åðµøW76N&ä×ù%3õÖÐÛ¿H FhÛ«¶Ú¯£«5@¦Ê8ÁÙýí!²#=MTÇ¿BÂ	^p­9óz#ZbÎåbÜøU})hbKÆi­¶°>j£"ÑoøÑ^ÒÛ]g»ÏFÆ§ÝZ@þ9ËNáÚ§4.weîWfxÉøíÅÚF+ÊÉø8£zº|hyÉèq0Ë];laêìqÙÓ!]ÒÁY¯._áz1¹µChdÌ/$
CÈ*úx]ÄÁoçn@)^5Iâ¹-ÝÛÑx&î¡ÎÁnè{3R¤
ðpëdµle	8ô	»ûK9¨ÀiC¨Úã*¢ÊÍ8v?=}2;p!°;Òð]JÁC¦§DÎ	¼HZÂ²[[[µsoT6u×fu+Svi=}Ûs÷o&' ÓM#|>SçtfbÅ«Patje¡dz?ä|=MöR¿Yò%\¬ìÃð§½Å4oñôuÞa@¢gjÞ«9E©&Ç­E¾
PwiRT¼¨"û?,lêï"ACÍ¹^Ý×ºù|[öÖØnÂÏgXë-BúFR|÷îO4ù.âß¡Æà½Þ%ü³FÐÑiïéP6¶ÙRì0úÂS±_"8 = <¥tÕ2PLþÍ¥7;+_Ñü%ÈFBÓäDÃZã;²	óÐfLøÌs{BfèÓ?U/Y
9MQY|°º£n5zE¤À¸ßéÓê2U)r= qå5}PÊ.I7_¡Úæ#bD)ÄÆÑÑò¨Û?(.¸ÇÓozªÕÃXlÈÙ]Ïp!ö§ê3!Üú	ÜìÖþa*Á%¦çC
°D{Ñ¨¸Î^Û= 
=Má#6bÛÞ8vk¥yÏìqè*9äoQ!ÒìP»c4ySdè%ºé)HåòR¾eà@åà'pìº¸Ã ÖÇææåµ!®\âu_ts¥pûÏ·kôã@q±z¶cGú¸8Ú.?; ZúHÐÄ¢³Í¤©kÎëýT4^X3üOéuZZûîý=MÊmîoÐA1Ýi^µ²äÔÊyåÃ¿#´Ç¸rÛr3gºRþQ.ÍCÐI=Mj3æÑ©%ÏËÄâïkË?£r¥nü¹òÉ>,Õ¸í~­êUÍ©¹=}
.Hã:ë2±4ü
#OÞriÌ%U8 èÛ5ÂÌF£1²º.Yv<À»Ñ®-<¸müjí6y}a<pFó|Ð1LÛ;eÌ
Ùjï±½ÓiöÆ¸ù1]Yñ«Ô',äµO*4È´+M§ yNslJÍ\vXrsÜ¨+;P\pBgLP£äa=}é+³Û^©êõºãÚ,¤ÒèLtáã xUýOpP>þs»¥{0Ãh¿uh¶FÖ'»³}@7#KG *hzExõe(1­·tÞ0ûO!?/bs(]9²fÝâH-5­ÏíñE
ÙxKõ·K½@ýY	èãÈKi£ç*SÞ?úG¸-À|¿ Û¸]¶kËá¶	w×Éß?Òç|mÕ,æTõL u/×Ãá#øMÛd0i©s¥RÝOªmXOõÝÊ÷û=MØýÍ°¿áEÁ\yx+9¶ê*G	¤´¸ðÙÞÊ{²ÎÐàýqê>}ü¤¸«¢¦ö²¬4®ê´ÊòM©'AKË1À@r\.ún$»
ñ1~Ã2z¯î{î®0-0ø@å©î¤AÒ']Km%áZH-=Moº£ÛÈÖÜÙ<dwï.H¥[F %QÊzJø¥#­ÉÔ$§7Zá>ynWlágy[=}¥ÑÌ§= Q²¡r1àôËNm4hÜcÄu4´c+(½i·¶¡òU=}ZXéï	Y"UæñÔ½p&±(ø¹]ó+¢Ãò»üs¿o¨A¦ú"BÞÅO¥.í«O.ûÈÊÕÛ?Ë!¢*ò%Ò@bi«Ìî$Í	7æ û8·-!¿W3\¶Ò%S.º0Î¿MRà5Ãù N­mCãþm5Ü¯¯x=}Ìç¸úø÷Æ SIMyâ2®^Òø]ûÞ ¡ÿ´1Wu\U!ãá¹¿îO"9£ßpÚÞ¹I×'¨o!'æ£sGP¤ÎíÀC'~?Ij¬#>eÉáý^äºÕ¸ÛY_£ØÒÂ®9$ "Ç{¨>Ù= %¤þÀÆ$ÐjwIë06)!glU2HÑÁó"GþÂèd8ÿÞtb¦t´÷T° F¨AÒU/+¨úoÉEcM0Â­5RW13]ßþJÏãPâ$ßüýÓ$M­}ívn(F]DKmûj´t9	ÁmrB@öÝ=M\òvyûðÕÏÝFZþaÝ«½¸k²½ßÝª £ÉêMÙ«ªúñsÐ#Ñ}öö(ÛuªûyDØé= Ñ·{Ì¿¹Ê­)Í'HX=M1»mi8þ9Û£û*©1:ñý0Â$= ^@>äóoÈ©¾Ïz®{¡#¿Ýq¿éSd1	t¢'6ÏÌ£RAy"Öãáí¸±hþ6.ÇâMXnÎª$±Îë ìY§¡Óä³ÿìèB[Çâíá1ÈCGû$$ËS ÌúQAË¤¼ÃÞµaY(fäAìÖ!= ÐYi>>þóâéqI.¸±ðGõI$?¹ÿ¹Dµºc·a/Wk'SBåcôë¾ãaÜàq?]?¹1Åe<ô4_[·v[Á%e¬yÛ^ÛÐÁu,Û,þd%Ú©¥ÚI2RÕ·@ÝUäXíh÷OdQµàF»|¤#/IaÎçÏgÏgK"VÝ>N@Ù4ñ4ÝÓV¦æC³¸ñ´4¥g
«SjNÃtà·Ð5½"HÉHbÙñãí>ie=M1c£U^Ñ9õÂþÍÝJEÍò})£,âi5Ï){¯Ç&a8th= kuøn©Ï= ×çó= f£¹wÖ¼à£ £@qZ´~!= ¯;6o"ÙqÒl¦ |wO#°« kõ'qÊ×+òÅÙÚÞýàªæµ÷þJÎÓï¼z¡ôùfÔõëés}Áñ§ÑauÇvmð÷ïàðÃxhñt:«p®WjnÜë	ÆS5¶{çÀ'Vîòræ2a&eï´ÉÆ·[;S^XaÈsô£àå³À}Zývm^ýüË8|3Rþ 
Î*ÙyØ®íÔt9©PEÅ¨5³*¢1<ËB^æ}6ñÌm­I;F-ê«¡õê¼ÐUÜrÆ¾M=}g2i&Ì°Wß¹®]CÏ²¡¸©Ño¸bXYýèYü(öõh«üéª¬×6	Ç+.ÍQíXó°&=M'ã	>«9Gd%ýÒ= ¤yÒXYóvs%n5S¬éþVm(©×F2*8
ÉãÂX-Îö;¤;6yÕb)í¸$Jçpj)^2ÇZ¾t= ØM$¡ç
LnD¬I¿âÐV<P&+ä¶Ný\_b8º¶IýìGM¥¶ÁþÁ>Àò2c÷\êEÈòó:kô$]´ mî¥©¯R4xäÇè¾hÂþ!=MÐéµk#´{y9ä_ûé3««|(*F«jïïQj3t±Ñ>Fä= »Üsôð*óp¤ê\¹³ûúº+ªtrép;äÐì»s"=ML	oBý"~·e:ü7F[3Åì·Äº½©@j{ñ= oMß.#ÿÔ¬ÉêûÇEUÔ¥ß $ÁÇM9£4=}ØO´ý@.ÆÉÀØ!©iÏ:òÓ¬Æë*L0*#KFî¿_Ë2ÛëRò%RhàKªLôEkuîÑññVÅÌûKa$E$­Ýb2XÒf!Cèíæ¹¥£É_ðô8f¸¿3{]AnÕßØ@¶îþDï~Ùßõß(f0óäÜ¢|µï5y×= mÓÚ /Í~C/@Ù®FKm»Ç)|= 5Éõ´ð@=}Ø8«Ç)Xøß´Bµ[y­½dË\zxùÃéñ×SõEO·(Æ>^¤Úªø¼Lð=}ûEÓ­o»Ê3ëd¬=}ÂqÚèOhÂ¬çµKEãì9³ûrd6Dn=}fÝ×Zxí>·æ³O»aJÔ EnÔ¥)/Y=}¨J½íñP~Úh$aøíÛ%>´(¡æNàöd¢/DE\Þ«=M|Z³äÂÿ[eÉ©Ggõu=Mù@qçñSv.$Q
&¢8 Q<ÂlY0=M/èéäJÜ_DÒ_×cT·W°2£Ý¬%+!\¦Õ H7Vt¬wÊáPMè¿ùÛPÿé=}¯
ðäüã¹­?+tËàhZéûQÖaÄ¾L«º*ÀæhäËq«Ôá2¶Z4©¬5>	KQÉ.ê	4GDÉâ²Á¸§uªÝ°ÏCD'²OÀê-7ØùÒÃíb~s0¨Ç ðô]6ÊnÊ(¨]®X¿´º¸¨tî&CgPþVý1èpxK¯g15Cür~t#²Ïu»µ$ÒÍcgÎ´«G"äÎ9ðµÙ$Ï}yÇ«÷zâ>ùÍ×Î#}bÙ²vn@È·éÇcNgÄ¼ga>E+7à:Z(V/R¯ûý%Ls¬FiR¥R	÷¦Az°{: Q{Õj¹¼mdÑZW"²éÐp;=}áot= ãTª?v¬_PðguV^[ÏòÖ§êâù+'8°ÖYHæM ÈåÐ~<Ä^ù.6M8Ñ³àIvOy.DLïhÇÄ2¸aè3kí¿eÜWW\¸Ó
Õ9Óí?Jk/ÂÅFd¦J¨ÝS%úÐ<è¼Â-ï«
x©OqA2« zóÏÛøðµzyÓã}$t¥Ïù~@~Þ÷©ch@gdÀ63dI¸ÚeÛü¢U£³1UQV*åBg±âL.M#4]zR|×q·¶Wäm6=}¢µç1üöpÓÉç«AZÝAmÃ^Ì«-#Ó\¢ìê· ó,¬±Uíi/ú7fìcÏãºãÒ=}°àÚAb»H7-ÂñUÑæ)$2u¸%B¥ù¤HÅ[~³ÆÝ!¨}Ïç©Åå$XM¡PRd<¦~Í^ÿ..Í^á­ÅPuðpde\6× Ðõ?óZXÒõË1º¼>Ä$¿Ïë.Ú)ÄL&eè@Ôm.
¯¡XP¯¨ÒôreÅÊM¥ýc¦& ,ùc|f¸ùÆíiÍÂ¿â¢FÍñÜÂ*ÍÄÝ¶a
¡ÐyóEæK¨D«6¾Ç¿¿*èo¶áÿ=M2M&Ð¡D ÓjºnPÄ®T$Ràv
m %ÁÕÝ"]dmKª¦|Ïÿâ%Ë?¢bÕIU_Ý{û²\à'ûtZµsI ÏóTÔÈ=}&Â=M¯£{G´êõ}ÝÀÌ'*È¯´¿Â
¡#r
»Dày]êdÝHLÔAUÔa®wÆyöÕßì£W
6«üQÖ=M#Ï »¸-û&õ·sn£=}j"ÊÃ'°âB^ÿM²\æÈ}Ô®ÈL-jþ=}¶øÝMì7û 2\7ÍhéïíÐfÎsl#Ù¶%æNK»®¬~"nÝÆê¬>§ÿLy¶2Gµü$6*sAR3y/óÌÕdØG5@ËbäÃþ]w§~\¨i²ÙOÁ9Ô*ËÄ3ÄYÀãÝclíöÊûèÌ¯¸2	ÈO?J[?epP9,ï@el¨L­âºüá­ýÉÛ"½[vù!Y+ìKo2d¡ë)í+T{óßô°^[;øã¼V­Z¿=MYfþI:SµT
¥ù5%Ô¹¾ücHé|²Ð×;Òú?NÌÓìÅ-G¯Ì¬âÅ^	O|q.¿vÆþÎ6¶å%?Æ³®lÁÕ½8TíÖ¬ùC c»X1ìHS ò»w©£¿°þÊí	M&¡/ÕzR©tüQ+´[åiÕ~R$,JfApJz=}ü°3ùã*¹å¦Ð=Mò±Æþûñ¸o#P|­¨gÀ qÏâOJÀ«ö"8¥Q81çLL¯â!/ À²¿&¸ÄÍÿùL­B^¢É~1©þ|y®ÔL46¿ð×xtü´Ê :r¤¼ï³m¦Ø­F)	Vuçþ¬B¶(ã ­gJ«®d+ùÊ©§oÍÐÌµÑ&®Ýá$h2«1".¦-oñ°{ÊëÒê\'[§ß#ËÓÓ®
Ù¨FUÛbî"@®¦Á´Ùmm´ Õ"qÈ®	µ TëúyL9]BþÊÛX+CÜðÈi3ôB¶= °ZÐ¿ÀdCèÔî°S­Û\ïcÈÚ¥²ÞI"ÂÿÈ½ÏZK_bôÈ§à®)¿>ª·¼ñµ%y4<d²CÖÃ«9åZ]à VDÑ1åMZ=MA_að$&Yð¯a\ É^éè\Ò=M²½Pìÿæm&ÖÚ½B¢ñMRlaøÄQIë¹ÊÛû¤9±;a½I±cF4È1Ý^ká:@Á°m!ç)ÖýîkGþ(Â<"lÐ©Ä®dÐÍ{©A|â2Eÿ¯ÔsÞ"M@rÚtÝxÉ¯¦4(rZ¢LxgÀ~i^+ IìDz¦H¤ð^ujÚbÈôÓ=M±x9!væ¬!ÑHª­PZNä3<//ÅEK½k= ·©)Mì0><À~	l¶õb_äýTâ+Î* Çù³Qê-¢:l»=MîlqÙ+7Ê¾|ñ*tHR¥y£¥V	Óú¢¸¾M
KáerúªªVy±ê{@\@	EN-J°¨].FØR%N÷ò>ãM	+50yó±4Q¾æþç&:¬|Æ>f äÃy1ÕG6g¿ä¸æ¯Ü¨­®N	E·§­-·ñxöSêòÔ|ßÄyQ	)ªðåK¿~¿^¡«¢³HÑ

Y´Z¤³Hí!Íü¹NmÀ¢1N¾ô#íÁ®xÖ:3ÿdÐ%KUå¹ÃªøÆâó¾ÞtKIX¼$áqd 0Ã3÷i½ìDE?b¹b1Úý\
jj7Þrüx¿Q{]ò½ûöUá Aö£Áé=Mâ}éT(ÉÛ©»9ÝÐÛÐq$v¢É3úýrÂkïÂ5ö¬3ñ¯âº2åSE &bëÝ<=M%MÜèÝ-QCÎs±eg{óÐ¢_Wí!±)kW6E%8tå5ÿöûg¶éÅ!HÜÒë1.¸¾åùu=M;*ûòcçlýÛ a©üE æ4Î_h³=M?#³aì#¯AçÂõ©£#M/&Êo/Q]fÈ¤Uò'=MAböVz×ã0)§+ÓLbO´ T{âPÑ«1RKÐU>Åâfe¨Y3Yóg éZ=}&#ºpÚæ°Fém,ÆÀåý´àþ=}Û|V:å°p _é|FÅû2Î&Ûf¨Ê&+q§Bå8nù¹ÍCc°6¯>sp^Å$X#cöÆÐsLÝ%ÒêÜ6aD½fDQ{G ¶FÉâÜ%ÔAå;bmCã©A2æÔØº¾õNÖÚNµ*ÜTÇª"ïòmí1?G*$	Rã+ß= 3bè°Ã*Cübøì/"ßß=}*ìReÊRU¢ÃöfðøÉd[	XÇôdÈóäÆ£7|·ýÜªy}ÈaA{Á¦Aw~J¨ýr'+y6½Ïp\0bÜ= Ù/¡C@Æ%áNÚIíµöÜ#f
Øø2 ß°²4>ÜÂC®¯2rIn?"ï÷ô åv¨ Ö%¿âçB¥§BN/6¾N.Bìê}üý
5Vø¶´ï'îÛg#\}¾Mu"³râõ@Å² +5_óÜE­1÷@rÆBãòÐÛG}à®åYáû"âÉÞ@A¬uÀG{òë«ÒE?=  ¼o= Ä]L]ÜÑÝ¢²g= V aë';<Iåüëªk«Ío6¢ÏIÀyå¿Vfyðí¹JH.·&´= ïê¯ãÁVü R[BuÂþÅ7¥÷á¦ÇlNúìIÌè5ºI¼çP3r-S&¯dÛ±7ëv3ÓM]m¤mßÜÉ]ÞÄ_?¹æ#¯P<¡JísåIFÁjBÓÁÇõ<l²dEy]VÓ]©¯8XYó#êg$2_Ç§n6/J/ÌeËÎsa8Ì rïh:²C	^WÎsI)¦%IéRPh¶¾hG/Æ'#úuJN5·® úÌ×¾/@öì¯ÇlpkÿÃnpÞ®¡'ßç9¿7â"@µDæ ÀæËOA¾Q#àÅÑ¬ÌCà#%jn= S-ñyÅ×Ät!EDV¢µï¤]µ©ømûê­Ûâlñ'=}m¬ÅÅÅé9ªÙ-¹·µ=MËàæ5Sì2Í^àRMã¬õwªõæÎ3ûB¨WPµe0ØÉ2§>ª I¾ñ+²¦'«óîwø1iÐ(ÿæç¹owàQ{WaìFßè±ë/õVQçw@$øÊ§?F Ô»H¨¥êyæßªô©O­ÿ±1³­ÿ?+ö;ËÔØÑ"Üm¿ÜÌ PÛd/O	k1k¯/;Oµh7ía§¹GX%pÞÐö!þwDµç´1knïÈºFGm±ôéjÄ5Ñ3è?!góþÀkk¹ôÉ%d®ùBÑ¿J	#@¢PQâíð(?Ó0m= cAº=M= ¼]Mæ&O	Ï(¡ÇòÈåhö%ÂíO\ÊëêC?Ic§b°:¾Éá £ÕçjùY,;FSÏþí«¡]^Ñ¡Pé/a[SÝðË(ÒVl×¦Óyw*M_¹!Bºm	}ÃÏ°Öß(uçÿû,a1¾æ­Ó=}>åI¬Ì«^ÇøâäËÕ*jíüýÅUà²O!Â$
#:d=MùTµóx²
¼îg
½ÊäwòåR8²U1ü¯UÜ-Ïèî'r	YSä®ø!ðR= þP±'ïJûeV÷~dï#ÏVÝÑ¤³*rwõn6^ïSè¿ÝÂ&«3æÓaÖA½ÌTÖRogÁJ3þßßxÜ¤¶JNÒzKÐ½P»}jPCÍ|z@³®¬ôv+o÷½É."|-s= ç¹?u@g.Ætt&3.	O:¸+ôc³= ÇÙP;ÉÓ¾UÌÜyÅÊ¥aT³,YÂeüò1ÿ3¯)ÆàÚó3×þjÜ[í'GÈ~¹w2åçàÆÎÃNqT2×jlfKc¨è¨&ÂFSËM¦4%pùO¥CÕ/CàÒñÇbÓÖeø/k¶oi!ã|ç,*}\Ê 5@qÒRÏ»*ÂÎ¥]ÌqÉF
¼BøX26X[Ì8s0òoÌàWSÜ
±H£´ìµ9óhmt±\ì¸Î9¹üÊU¢ÍwÒ­¼¾hÙÃíì&ÕÏ<ûXX~ ÙùzõgµzKèø©hØí x:¼¤Zf:k¯gô 6ÒCK¼z§þS~T¾wÆAýÍe­*B|Æñrá"5.Oo{"B	çÎÑûÍuåó	Ê'(ôÓéÎÆÃV¸UgÇ5õS¼ºÂÍ¹føJV´ûz?ÆTâ9YD]°ñ{Cú]/¤·Ñ/ÉüÝíà,(­çÃfm¤6OðWßÍ]	®ê´i÷E9ÍÂøá=MÂCRõùºòÂ%#mÆ%ÝÑÿÙÁÚÝ2{É¼ÅåemAe¥ð×@¬øfîpÂi¹´×\ï
¶úv^e¦õ  Ì½'(ÃûV
ô= ÿuÅ¢Æx/iP%OQKJêyîíïrv<Æ° 'po[.y¡kþå´0AkkòùÃ"sHË¶Ôþø×\¸´ýg¬	õ·g^T­ º×e°L*orSf  ³í %>êhUÍR)0÷ÈD[qw·h³0­tã7s×ö£×þi=}øOò«Ö?áW·Ø¥eÝqí¦yc¤=M®GªIMY×=M!ófeâè¼O¦
âR¶Ýbø!³VÂÌ@èF%ÚÁ4âanc·Ïù?¶çî $^à¡À²lY¬zµÉÜ¶ëSÖÝ)º.÷|¯T<6Ê\&cè³åGS9Ý4¸= óÕ¥³hÇ¿Cqç«Xj¢v)î¦>ÇPPz¦fL¼8}¶¥ÅcÄ=}x×ey%H"ÝV63XN(5%³gSOvq CO±-HôÂk0û?yÀõt#Ý_¨\°ÑvXï¨pl!^ýSd^rP )¸|jxDHÃA+¡.Êi§µFc§âÓ·"ò´×ú&[³Wó­fI5çQÞ	k!æ á±uèÍòÚ×ãÇ×	ÍÑ3Ì'@4£f)Ú5ÁmjÒEiÔÆt´ÑöjÕU&	Ksb­ÑS&Ï¦Ukß&V¹Í¬tVG§m÷\ut1ÃÎåå´­ÜlµAWwjSd3r.õ0¯OvN³tDKA£ÖÝá# 9*ÇGç¶uÏÀvìÉTkawÈW.µZG!·×'ó
7í/#v}'ÃyRMU¶lúÇ¹ÑÃ E2Ï¥f¯ëLÓ <³/òs§|úßhyX¤ßøìáQ)÷1ÆµÍèãô]ånÞ?¼
è|WPö¹Ä1@¼=M=}¾ñ¯£Ì,Qm: ®´ W¦Àó{¡ùx{þøc|çèÆ0;öìÐÔC/«¹åH¼+=MàIÚÇ ÊÄ\bnøyÌXçy$T¶T9ÒÎ)ò½bi¡Ïü¤¾$PÈoÐ	Õ;¦Bµl fbÉG  0øÌóÛ 4ßdéÇæ¢¯9¥ÏÕ4¾Ë¾ø6Jý¥R­
¦(H6Ý#5{þ]flD.¦¶ÖVjÙàIMÃ=M Óhªº{ÃÅEO´*=Mê´ Ëqk¤LüN:¬dÍã-#h@Ì-S»Qä1aÝíGMDE§#ÛÓÐó5¸0}'ÉùÑmù°ØÑÑì3WDcûéÒ¿,µÉ;h)¢ÌÂÏ	Ï "ÈÁ	 ³ålý03]
ãäÑÍgJ,»=MR¬5X1-DI¡ÖÚ©xóYÝ­VÂïYMìã3Æ1­ ñúãÊªÒå º2§ÒÓp®HïApÍ= ÈWÛÛDh«-=MÖKä¥ë²\±lL±×ÚNnlL\)ñõ\üÛ¦hk2±ÃénlÝbbwÚ!\É0dÓ	+»¯X·Áñô:?¸¡".3ð	È)¾+èpû¤qñ:IÐæ¡·ªÐò3à§[;À§Røt(|¿¥Øfe¿,EyÒw |f¹Ì+óÍ?â:¬á:¡ÖùûD¾w FRhv±0GÝ	JIà )¶|°}ªÞ§Æ¨Ó¾ö±eÞÐÎè×lüÌàöØ<+oñ	&cêêÒ~üb= m=MQ··!0¡æ Z%(p¨©Í_bI }Ô-©ie²'ãös{ËëÙWv=MR.U½XÌ¿7ewÊ~ÍO%!|!ãt=}²"¹î´^Ì°í/@$¼Ìß8¦ |âxÿÁíeNuf²õîé73FZÖ²µÄïG!ñ¹á2ËÚr+á± ¹Å¸]
ß¶(Õè3ÀD"ÿ¦áF	Ò_p¬@§jÆã vtÕmk^5ëÛÄ	>bðbIdHôãyâLhOû}µ¹iBçOÀÁ¾n4^z	+ôââ>ÏVpI+9Ñ©Àº­fÌ6yäØÔØò»+¬©sÃ6 ²GRÚ­:Í)¼î&ã]2h*ê=MS}ÎºÓûªÁp½{+Ãÿ»ç²Ë»«ªîÅÖÓÜêMSD2j{Ä§Lm¼Xo¸R4ÌC±%Àrf2õ:{~R-«öÜ[=MùQÌ9+$ï)JÌrg§½þó	hZÞÓlo\x6±Àkz­=MçöõJ1GÄÔ0(Féç&û¥´ýe0²>ÀýþÇø)]qÜíâþÏvd3ðããxwo×\hÿGP-·¾äÞª+}âÂFüé\djµzmáûü0yc-ê	V6É$Ï= =M"©Cê¤P\¶lxf-×øý°þPFÍ©	L3Æà¤FÃK}<BX¢l­+ªµú­¹Ó§ÇÖ$/ìLãöÎ.\}<$Þ7¹¯÷uùê&¯ñ<«s *¾¸È<cFnÒïéö¤}ôÌþTÈÜ¢@IR$z§ð¬úÏÊh"û%ä¬^k÷,Ú±êâ0 fñ}âÇ|5¸+nÕÞÒç¶½OEJ­|ø]+¸Ù;þØNîV)qÔØËx²<Ïk.)¦âÄûr²©ìÍ Nh:¤g,Þ¤gèöÄLv+4ðC³Ä)ËúÇ »+4¥g|Fj¶®ý)Û§/Ýïzçñÿ]Êé3«Q2
]¨#¾×I¦Ó/Z}¯6v>LÙp (ªÜ<
ARâPºSªeÌýpÎB.< Ð¡ÁEH¼U¢C¬±*ßP <¬ûºDJÄº¿h ãè¿hP´´~9[Ïðd79»´¬úð= F,´¬ú+£¨+|ÇX.Þ¾ä1þöÂÛm£(d=}vö¯×Íi­A¶4èMõÍ¶ 7«=}Èo=}ìê¢°#u ­+_Ù­l	öåFZg0BÔÙ»h±Õø£C[óì^ÛºÒ_Ìto|2ÇP372ò÷³§ò7Ò:q¥«3(ùLñKU"^oçKåì3Z7µn¥9ocV¿Ýà«¥öôx¯ârtFüpmSZÁW® UÄú*¬ÛÉ§¢Q&ÎÜ½I/B3oÛW¯s@hÏ4'7ÕE©
#í_gv:Ì´?Z·ãÃ?Þ)T&_^®ÂÄ³;)= ÃâêÓ^÷ÁlBì{I¤XîßÉ.v­ÑP>¶B¢­Ç1Ó@E¨/¸çùæP{^ë ÏnfXì²üU:-TSPkôCý.·FxçY@/º2ÏÝCÁ	ì¡UÅÂfáâÞ·§DH¬á¢qEóæd[D<Ø¡Ë}í<1ÊÈq/1 ß#êºàq5ÿ:sÍçîÌ¤OÙýpOêh2'QÎRs	èSeßÿVÀm@Aï¶¯ØÿêÌ¼C@ÍD»ÒßÒ¯ê
^»y??º
¢*é´áIpõ¼ýÍccÉi?kYb=}ÇfF4/ÍNñîòÂh±»$D eùøbk®Y(Qr= ëfRÉwL29ýë¿ë#^³5G¡ÉE=MïóÈ=MØ äþÎ!e¨ ÚÌÃäInëHº³©2¹¿bí$}Ùc*9n*PUOc¥è3¥®'ïJ1&V¹ß§øTòôxcNÝ?K¦þh(ßL§'ÃPûMÃÌN{²ÿãîÙÒ8
ÚéÐKd¸<gà¶Ó«ô¶¿ÈP¶¿ÞhQþasÛ¤î©Ó¯{uìÉ³ïÀIâ&H4SÃÚû£ò= $ÔPÎÊ5Á$cÃ ·a&+Îg2°ø{ÀñÃû|c4é!öícFV!-ÜøN¸Ý'
ÕÇO{Z(Å!¾=M$·%±'äÿzUé±6¼îâ¾ôS¤AWÓ@[à«b§ü¼,Ó=Mp!!0^z@xfoíÃ²ª?î= J  ;¢ú_b´-3ÈíÁããÞúoB-SJ]OÆ~<meÃm¶Áq1wÊ5ÓÚ>iüñOµ¾Ô)Û=MäÀÊß×¡ç§¨ðO.¤¨Dk«\ÊÕ!jçd5S´mþ¸KÅ±(¥ÏCxöÈÑ&RÕ*Gþ-Ï¦=MdÎ\¿.×n)½,Ù~ñ+½â, :¥(½¬¥&éq­´
Èþ¢#Å'¡[Qpuð%=}Ô±ê	Qï¥¿>l§ é$'º×åå0õWê9IÚ¬Ð¼K¢åÛ¿æ­4-¡®ûäÒM®hùP±ä< ½ÕªÒu#å¡Å^qåWým/ÔÛ!ÁbÅÙ£
åÙÛ	fÛàf'dÈ¤TÕeíÅ$¥Qâw®BB´¼!°ÞR:òµÀ"ix-ZOa-´Ú.½¤ZÛsÂTÕª|Eõ{¤òía~= +yÂãxâG¤ÀW£Óâ£ªýèÊ2Ö2[qHµòûí3½WÈ6o¥[£©c	îôÆ.¬ñà¥ÍmÚ°C>Í}hï¢«ÌMèBf%DM"ÓÏ2ÞS²T-qF0ÏÅM%å±¸W¯/Y:3SxQð¦Mÿ®jºù	&3fªPe&|Ä´ 	Ýê}	g)ÏÕ"ç2\¾û= %ÿ/]e*³Ü/dûÞ!mÏÂÕê­qàûÕÓ.ÚwlT4\²cí¢¡nà¯$}ÝÌêÔ§ÿ.]~1k-µ5pºï«ì{V£8=}ÀÄ½©SÖ¬\@OÃ&ùîI½¯(c%}©Ú	UíaûxQÅ= |¿¢{õÆ= äÐáÜNTAG2µ°\z²+Ç>*¸
¶ðS.Q9¡ $fûô½ÜHLê3Ä	Rié¾>£ÛU= ÂÐ°îÂd(GARðMVÄ\
Ú$á¨"ËçHë ^\ä6È=}&>]ñSK¸f§Vz¿ÔaÍÊzK%2µí³;Ö+µÜî}KEXPsRïàª®ëóþæÙª1óÇSmoÞRÑ·EVaE)é§.JªFÑ?ÕÜ."FÌ)wÚÉo2àÎsÜÍz¡Y(ïon°!ÜB}¼ùÁÜkÃíoUy>V|=}~Ûg ð³/úÞaöeñ¿¢æ­³ÑaÑ£#tiý²ñðºB å3}îÄ|I
Ä·Üº
= ö5%ÄÚ°%ºëaõOîkßàVúÆâ¥åuÊ?ä-?.n¦ÃÀHèn1 8µ:.~áAµ4
Ózx¯[iPÔ¡'O=}æÍcéÐi³ !aÄ£aAêm7rÒfMïñ P	¯»'d¨¤gLK-àwQ°Çïú@yÆ¹9Ã¨%'¡½óºørPûy¸ÛçcLþÞíý0ª%ìÃPÆ÷NbÆfF
º¥ÚÅý j ·¾:Ù¼8ì¬Aå¢ÓI	mLM«±1%<e|2Ú¹"Ê^Þ²¯DbËÄ <Æ©þèSÓXnH¡ãõç±±é#É$»[e¢\¡ç¡¸QÉ~= å|÷Öâl Äuë%a¨oñÆ;45Ê)¢o?Fî¶lÚ±Ïöa©Ûõc àI1ÏHvñ÷eF[ ìá ¥ëHÒ¶J®ÅéØN] 6e(na\Mz0Ò»uFª0ÒÏ£R¤ÑE ò§jiÛís¢í	¼Îp>:òù#	¼= Õ4Ì§êäÃÜVjÊÕýi6Å«rJ{òVêùÎ,l/õ¦,À'Gòõ¦kë+¬Cjä¦#+1ÐãË1ìcÊ²ìÎIo1¤Á±Cª5¶­ÜÒòÔàÏ»®!£T+/0!×Ø£-bÉý*§Ù= Pk÷¾½1ÝJA ÞK 	1+´Õ<bä£+½¤Å	4èÐ¼aÌVÃ¯ëÞ6¼æqªÏ*<ÔÐÚ®}X=}
<¾ºòè vPsëk_VW­÷v®S±ä¤å7eI.¥¹eÒèjVCµ3òiGÙPbÕHunûÆÆ½ÇaèHAa<[.Eä+ò±ìå§M)æò= 
Ô"SáKÖ"Ë\^lÞbD"«qHA/õ¦f5	é¦!Þ³FKäßëAnì¦qä¦=}ä¦Cêaª²aÔR+1\+1Ô2dxÕáIY0²÷
ûÜ¸òäþ»"pp"­¡j¶¥Ë \Â$Ñ/*Ý= SDGå§«6úúäHÆßQ= ÌL¼õ^f
!bk.9ßPéw8÷õbþåÞþåÎòÉX ·ûùÕdI­µS!¦.¹Ú<L¸½÷o%ÆVPkl%P_+«ÇÍpç²KñåM¡ÿ._
)
bÞ¬õââ39ÛÌIäçé[{¦áÖLò»tÑA©îÓZëÞMøÃK?>¡ËªÂ·>\¶).Õÿ-íÄ-'ÓïÕ¦ÀÈú»6¼¢NÏ°Ââ&ãp¥YÌ.¢"ùüM3eÚÃidzq(= è*¦¨[%¼?QNºG«8·÷7VIdª+ÖE×BÛß8e_·ôv^\keåP>í°¿M(ÖÍ#è= îµñÔ<Ù¥h¼MÖ°«½wÃbndM(Ûå2.­æÿú*5ývÇ&Ô|æ.7 9\W8å{¼n= pÑe½âû)ôZ±¢ìæbux¼»<\Uci{oN2ýÞSã^»Ú}nË-ÁØn¡èC*Bmy!·QÅZµÓqÏálÒ{÷´BWût±r= ¯[MÑUÏ±Øn!)§L¡£y«ñÇN
ì^q42KoÃÐÓa=Mðw=}·¾]¶=}}É	Ã¤ª#bX'óE]EÏ\ ¡¢:lù%^EËw"Ø$:AÀù
u}®)öø«N?¢3AÝåÿ &÷ÆY%\1?"­íj_ñÕÄ=Mç ïÃâ¸¡Ç-ù7ß§gã#É).ç­!=}Þ]´áìR¡&#ic{ªñð
¿ÈVù77«ÌbèHh§â#DÜôg1Ëà}²3÷oL16¡+®mÌÃ»Ì­Þ´Ó® b]ËK*géi|·ºq9"±ønÍ=}S5#Ú{ÊnNô|bv¸ôâ8Iz´/>,T£Ï6)ïIrõXàJNyé\Õ= wþÝ£Òdþ fõ}i/i ²BËÄ¢¦VØ)njòM2'XiÍÛõrêÝ ºrv9âáaCÇf.ñ	µÌÔ¯MObf²F@>Ê(|ÄukÊí= v$Ìì÷Ò"½2·¡MU¼P¤ãÝ%âú ].<b§Î¿í¹ô¤ýúkIqòé5= 3= ýÁlú¦IÁì?«QQôOßtp'ØZöhï6­N³)èæh:nèâÝ
â½Ëº2ô-ãÍZ_CäÝïyGòaì:£3Û¹µ0QVâ¾Q1qT¼±­HÊa[snJ¥ïÚ¼pöÍåÂÆ,r= Fæ;9SÏçÓ#Ù<bx­T [",é$[ÕDÝÍ®Ô#Ï*V¤sD«ÁoíÍK	âFÞ-ºÏJaäÌ²ãMz=Mâ	FÊ­¿ßÒ;/ËÃænýìîÏ5ÍÄ_èI±Ò}¸°9»~VÃùîxÏµXInb+Æ"<!3üÒ¿cìÞUØG¿I¤iZ¸G«ÉçþÚG´i¤kè;nGèÆ:X®úæÀñ.Q>|Gtü^?ÁNÄTNÓ[rNÏýd.»lÆpS×9ØãKøbeö0E±TÊÚ^ÏZkêÊÛ+xEî8$!¼TUFYõÄ!3<{Í¹òS¸À·â²¨d;Lì*µÜ.»r«Ë|%ç-=}ÝKJ=MÂCÆ0¸}iW»DþËgQ¿²ÛR{E¾DçþÎãÝÎÃ1sà*þo£0³iì]r]8QE¬íçKòÓÒ®vêÿÆ×G7PôèNÞQ7×TÉ²?åÂÖnêDmíZ½ÒñIDmþ¡ÀM{J2ã@,¡Yhßú¹*3ûÚQåR¼2RYî%¶êÐñÓÌÍ%ÈòNý¨ã¶i­¹hXrXíÁ?49¿±ºÜ"¦R2{àòwÓFªóNGÍwñ®ðf·¥à­Úp}Ëò,æ¯·v%5ÀªÅú¾wX·xrÉ)8e¾ÛAè[Å­_ ßâ@D&ø=}ÜÛåÞáÖ=}´DúF¬õ©>_o·ÀjA¾*ûÌ_ªaaI6n®'+ÁüôãáÔ;×^MÍ®L=}¥\¢ÎÀß ÎHosWOò/
ë*K=}/¾¹ÿ?6IC}Ã ´MdÇ¨trÈæësÒÛVý¿ÿVÎáSÙk+$´åþ¡ñdMñíî?8ÁC9ôI\aÇîÅÓ ÛÌq¬>²ã^}Á¨5³n?bwQ)·=}ãïýl¾Dé²´÷Ñ²BÔ×uÕrBYræ^t|«Í17~¢$58Øw\pë²ÃOÅXÄ'N/DQmQ|öô]Þà®e"H= Fävé¸Ë$)-¬ýÀ3µ×5le¸áÖÚ]À,ã1äòØ¶wCo·Ä¦&ò|t2(fR]Æã¶µºÈúPkÅ°¿;Òz. IÍº?Þ¬Ó×¼¹~ !ÒÊ"×âàqÅÀÑ=}ßR¥å©5Ì&ý%ùâð5úJr_»4¯ZaH¤Tã^d®C Ð?P®µAÈ -=  9½n¼êælÅ	Þo[çd8þ;=}~oýC'TO5ªÔæèk4ªÐ?8v÷&N­(ktÑ3ªPùõ÷îÔ$¬(¥v@=M9dq+sBØÃ~n)t1fBØ£~n	tQóÝ(­{ó³÷Öä;8^GY£ûe¨(¯k_@=M9®dmt±òÝ¨©(Kt1sBØíZ|÷fÄÊ(ðâj=}8<"<ÕÝhúbOàãæÒÆÝJß¿¾Fã|wêOðs#b72i^ÏO§Öwb2=}aÏO¥Æ42æég#cï72æélMí'&Óv(UÉÎOæiwÑ0äB{!Pi0¤|ÚöÙA¿,<Äi	×¹\~×0ª± È^)pY]x)y\Ï|Àó½øTxB£zìØaxÕ{Ð38yd0¸Ñß|yÜ&O«ÿzî¡×~VExf6¸äx¿'8	£z\~èpx{°ð½ø&yd58yÔï½x¿.U§[adªF+£kìºÆ-±ÆLl$3¿\Ë·=Mè£ºU«"cãÆNÞË1¬P4§ö^pæ6¶¥ÂÊá£°Hâ.EÊ²Þ;¢ÉÕøÃíF!¾Òm^çnt\N9óòi×wùGt® ±¢
ÜLÎTÆõïÆKte/Õlál¬]u.â$¼ÉÙ8lÖb îäÎÀfsA¿ÒìÆ«ï!w$7áñxö<4¶c:_µ!Ìn7eúÿ]/»¢MÎR!ìFÿò'ª]þª0©kSb©)Î5ùá-%Ü®
PWPfr.eÙjLÅÇí¥m¤Í20DÙK>ÅîúßÙRîâ¾ ´ácÑG¾Ô4Hÿq±\¯5¡4q<;Sð³hîMÃ-%?èæK>ÞVÌfHdÝe ëù*D&²Ç+TÃôÌÒ*Óo´J¯=}£h)loüeÄÓoé¢Í,}k1yÊÄ\¾«übjåP$ieÔÛ¬¶Gc³?÷yÐ+0íoðhá÷ÂÀ¡G³ó{áy¿PßØ[÷Ò»v¦ÎO{ê)­ç;·RSuþ¨ä[PZ¢6MZ56#Gq ;Ãf|
MMÆLNRR­ãSc´?Á3è$w?ú?}i-ïß"¦-+ªAt[wràrëJõñÀ%Èr¿m½ðÞÿ2ea¥o±¼ðÞÏ½2Íp´ý¥8$TÊ[M®jAö²)\ÍLåÀjåÑÐÔ§h%nN ÿL«h#qLâ¾uÙÚiòû¶IäÌ=Mãdp;77"X©%Y¨ ð¢ÛS w*×ócRwrW×:-R ìÅQÝ_¿GMëªïYVíZçö>OÊµUtaòYþ¼IY1Ç:ÑÇÌí6!¢;[àêz8P¡Çø°ÍÃ
<C?¶d½vè Î+ü!y878³³Éç§>ê¹ø4ËÇúZAÁsÂ\^ü³þòz¹GiÂ­MÊÝÉ¬JåUNÕ~~G	ÆÃb¼EH·Ò  Û]7ÓÐò¶¸ÒZø§UüõÆrHÂ|[ÜgÐh!tql?c.Ùvp©N÷¿YJ3K¦>6$ÀVWß	[Z!A (HÁ	m
]§ð§£­q÷Ðb0Z*ÚÚaâ©«ïæ]L[~ÕÊ$*Ùh«=}D«$Ä#£qò¾Â¸úÄ°Y÷FÚÓr<©qìañ*Tµ(Å2LÜUo¹êýcY·³6× ÚCýìÆLÄÆV.fôp\¤ØIçC=MH¡òñ=}Oü¹Zþð/!F=M¡Bùü2cý"N|¬Æ'Çö6ÍíÃÅVÉKõì üo FY(ô«Dc	e@¥(«/7ç­C í÷N¥«'sq?!¿R²n¡f$Y«0Mäü(|²©­ÈXXjÓ¥Ôv£V¦3Lu/¸h-VæÇ©Þ±U+·V
Hlç]¨>f]þÏ)äÁ)ñ¯w'#þbvtoEê×rýÛPwn)Z9®³îþD~óÜôIf}bmÇgºû= F WvÆÆguªf|¯Q«{Wd.jaMçûÅ{=};hãüaàÀ_<½aß´«®x=MÛ»öXÂ±åj¢ß\Ç5= <Í¯N^Ä=MqËEç<GÊVóACüJÌswd0¼VÈnzL'Ìº<= wpÆZAË)ã= H|Û2,§¿b¥?¾ãPG)Å[ÖhÅ7LÖóçéöt½¯áwYY>PàßÌèòÇD¥í~{1p¸Ff©^ÈÅeÀ^.{khádâ½QJ:7Ö)ß÷tRLìíø ×þÑïï9ÓíáöóùêÆ<~EàÚÄ«3bum,yîÎÍ*ðXâmí·¯ÍTáøWÇXSÓW2D<>ýã_ñötdv¨vªÎùwÔë>5Ð|bÆâd18ã¼Ç]eý0yètu5üÙHëC4&×R$5-/m9ÝjÒ0ä?!ùòã?ÕÊ*C]®¶ÿ"ÅÅMÌö6\êãêÍ_MÚ,²++]5òÁkÈi)*HòÄbci·çÌ ?öÄk9ÚÈbOA¶Ì!æ	^¸ÇAGÆÆ³Ì748ÇZjd¹ªëî2u¬·B}Ïÿ÷ãålÀÚ"©­µ!rÏeFø¤ÐË¸U­JT××¸rlüòÙ9Ò =}5åneõþð¾ÁÐ§=}? Ãó¹;^³aú÷V¯F®.õbw:êêÃ\÷z!ÛÓ|Eo'¢~äqÂiäÑN/ø¶ÀhPç );¹nwap= 3~ýÆi·E%. ÚÐG:¡<þf*«êÔøP»&1«CáN= åRì=M¼MÉ¯¡LDÏYeÇÁØ¢q\mO.è3:&d'I®¡ïìÈØ&ú6ÎÈ®±núf¸(QÎUI-	_ç¡1ÒÕJ¿¡¤¨9ñkdE¿ÄðFúØi¨úÊÁ?ÈÐÐÚÈk¦íýúÑGé	d
'0\ÅÆPûõÕþF1HLºë^kUì°­±ke0ôOô6ëÐè(1Gï£¦,[©cªÿ±;þGÙ(.cëP9HÅ²_ëÝ?ÁÍ}K­ëÂëj:-"ç¤§2.= ¬^mPë>Hó
c±b«÷ËñÖNµÞfdÑäÜÆªnMTÎ1;§ìb²0|ñd¬;¿FB)áâ0®ÈeÃ$Ïgìò¹©äB|0b}ÛÿÈ1Í©\ÏöÎ«8=}SÑpË9WAù!]FÅÕåÙ­jËÈ¢( Âç|È©£«£ÜÀë;´ÚÄåæM¾ÞÿvJHÕÿrK6cìüä#¦ÅßÒ=},'çDRóu¢G½%ùÉñÊõLWõÚÆ2¬êÌd6tL7ö"FúWw§úWÇ{#ò9=MØÅo¸Ý,þ)n¥þúÕT<Ùt¼Jý5§c1^zøæäâR0e¶ ,C°hcUØòg(òµ/ÈÔ5_õ½OÅ«ó¤þ²s}Çõðf;meQå	KA5A=}H­+ÜîÁ­Q¶pµ}ÊY	"ÃN²ÉgÉn¡2ÞÚ">þ£íÏù51@Õò	èÉ[ìä¯È»÷LN_ø-]Öë¦=M]×)Ú´GÐùèBµýÖÄê\}«ÅÕÄÝüüýlÈ>A%½}¦{¨ÏïJ«ßÇÇbµ·	¯µ¿W¤SX§|¨U¿ù:·6{|òö²³Ïå®9¿âQ=}*IMh¡½Píñ Q½UÝn90Êð×²Wæ':­¹K^¬ñ¦f*ÿZ]Û×¡AÚãH¾¼ayVêäÇRq![3¢(®sç£×Í«SÊê%Ñzì§ÌÍqÝîÃÁ È¢ª£ÄÕ~3Ý9ª'r$]ÑUÆA°ÁF7Á ¸ 041b© Çlü+ÜAe³Í±/vùZ°ñØ} ¹ í/1cä A«EsÆ©~[¬Ëë¯³ØÂWýrSÑÆrk"ûß.~Ûu³0%ñ4Z!@}âbðñE!	ð4bª2eÆ3
"ßÀ©Dn¶*ÔP[wya¿Y¾Ã>áë2ÚÍ&µò¾P)í±6råöÓ5ÏmüµÖÛ",Î¨_»¹¯¡Pä.zE«ª]Ê´Ê£}o	ºÓàÐ	<¡.ÍPÄ«gª^Í 2ë@/*zsåÙ¹">Æ$Ìû¢ìWÍ#öóÃ)?= s¤¸­ÊýéªÇÓDYæµû ÌÐm Kz´Û\E·-)É#ÐÂÄ´-Ö© Öp>úEYxN¼çn!Yëø~fÄXæ@//°3 rýlgÁÄ%¿íçîõ6[eó8¿C= <dª¯£¹ãvå¸pâ©
O¸Öcø
QàbP¼è¹^yê Pðn¢½ñà´éº]©äÚ5=}Ç>)RGÜ,ÎÕæq+8JñAC­Gèò¾ªÆO×½²ßX°ö?Qo= [§]ÆÃæê= ã¾óA9+2^v½XÉM*;æáUj##MðùS,q"&%"ºµÌ0ª-­úTÀB],6âÁ¦4áZ= J§Ð½vÈ«6O94Ç]5¿ïÆIÝN¥O+åjâã5 ieë;¨5hjjú¶2æFÿðëÜ³ÛB0æë,jðÿ®Î²?¡DHâÃL£ýµ0M4¼«'~ýÝT$éÔa= fEwÈ¬ÚBÛ®­Þuõ ±	Yá¥ö>9Ç«J^&¢¦çÌ;*/[2M¥	¯ÍÚ"ä0kyÿf2élåÀtüU¬e0ª­kÞäöon[Rl¤dìÜêÈ¸\m®Á Ðºÿï~[.7;fÅl2»!.·ôâ±PÃÇÁ_2%|[bfEW¡Ù¬kM!çú=}ó³l[ 2#=}1{Zmð¼êv7ax"5¡úµk&O(@ìï\	ZÅÐß(Çíb.ro[û3Þ-K÷SÔ»)B=Mû]ù^ÿ÷·à6fLHSowÖHd(uæÒÜöß(Íæ
Í"Ë§dìü]o}i¬ÇýR÷ÍÂåoI¤¯cí®C^=}ø~æeÉ^º"uàÁ Òè.¶ÂCí'ÜÀÜã/&ðMðÚÖeåÓ_Ç\cÖ0­ßBÖc¯@Ó_¬·¹ö·ÅÙ= aFT©z*ûcÑ_+$ÊÍùÎ¯Mb^&¤µþÛQ|/^Pb$ÿTÀ|k1«ùe%»5ºëXXkCYÛ:«ß¶iæïQHà åé[c)èÚå= ZA1ØÑO¾Í?~8ñÕÑë86®´ÀXÞTJ;Fkp= =MVØ!@JË[¬tÇ= Ãª@å<ÊI¤ Ö"|U®Ü¿:Õå9BtÉòâ¥=}}¸¬chÙþ«¾YV´>ûë1SRÒL~ÐI~Ð]èDæ°ÿ&æô¶ÆÌz£T"5;¡À8é"ÄC"äóùqÖª¥¢?å¢.ÑMîÝa¶Vv­ÀV,XXt= c|=}{ÞB|õ­ÙP¾æõÊr®$&ØÑDPåG¡ób½ÉkØvÔ-1úAãÝ´üÒEÕ(m¥Ñx!ÆxÕÏYKt9«÷rpÆF¯ýÓÔN5;<X_øÃ©%¬µàUýg#½ælÌqÖßrÐ'åüÕÄ¨u³éíIãDÈ¥c@ÉÝì/P,rw±y2Âw,[íì½<!°=M2,s'ÄcòÚ_Hu¦c¤/±/­ÓAù<{ÿeÜdlÈG¬yS_
0IR(ÁLz¥¦ Ø»aû1|òï= j^}­÷î¨©ÛÃïhøç¤UriÑ6*D1£O÷<Õ¨0÷ï£¢£¢à~XEÓ%®c£Ó¹ñ4é¬p;$q{Eà¼	Pã°@¬ÉàcC^%Ú+bÝJíÓÖCsû©É{ÇLø¼¥1z¼DØb£§ä7cO&)~ßíAß¹%3¢¯êRM}Wúj©!ÇÆËÙ%Ê¨|"¢GÅáÅàM}f81ÁçÆQ¥ÕÆÅp³FÞþ}§iÜÖKz2äºÃY=M£Þ)Óù§ù.Àx)£ØüÜXyÏ{ñ>0ºÚÑ,º°Óu¨Ðíÿ'6ØÊÂQ|6Ê>Å°_ÛDÉq¥íUNE5Æ1É; üC}®=}öAæ=}$AëÙÅÚÍ îÝBä=MÝÑA~L·ÃMXKgÐÿ»5Gð{R¬3*ºMóFîÆ
%²hðb>ø)\Fø«®þaxÊ?þÏ]þ:ÎáÝ1ÃÒ]&pX«w§b_ÑÔì(OÁJnÔHâÉ\¹õgý§r/×lç·v[7o:Ågæ-ÊDÛt½Â~f'ú:;÷¾¶YÖÒEç\=}~¦xú8wr'º<XØw÷¡¸þ§þw¾wt= »étÇA·vËrá
wU0Ø8°àÇ¼z~ü×Öô0©ú j×l:Zp÷)Øæü¹øßo×½µS^Ë[ÔS.åS.åS.åÓIÑ)æ¡WÆN¡ê?ª3üyxGx	k´L¶=M%éÇ´qviÃ$}HóËf&5ì5;ß\£ì8£X+<Óv[¯x©É½¹}÷¥ôq0Dú}M¡è®#¼O'§ÿÑXÛ¨Ò³=}o!¡hWÒi@úé~çhÆúÃèWéª¤[Ë£öCAòèG xV¤ hµÐ2xõÉ8ïP&8Í=M¶;÷Rdõz~¤ºµJx©7;C0ÇÛÝ ¾J 8ÖÚY7í»Vkx±¸ù}ÈBWÇr9¨º­²ÆµX7cè@±°é´l>¯Ý:0"hÑ>Iû¦¨Üðýòæ÷oË0§]Ræ?ßÜÆaøþciÑ"ÃW+Àç;js	§Åµ§Û×ò/íg´Äeî¹0£DÎn¡dÆP(½Ùõ:J:Ùºïýnu*¢ÆÀÁhþX,XÇ¹Ûú¹Sz{G}}ÔkGh7XÏVç'3g´gV4T5¾ð¶jm_v8EO%×14ôd	Ì¢åÑ´Xá¶<ÙÀaº'x¸íY²Xtr¥B±fPÕ.¬S|c}=}ÚÞ2ÝåSl}2¬U*ÊíÁÂAÚÕÉ#«ývýëìq5jW\­A3Ó§o¹Æ+Qu*¥RRðe{E^þò²Òu»-»MÃ'*  ï ¡³¡+iÂ×ÌÁ£¹ñ.§¬ÄÁm	ëhS;u#gM&ÙÞ=M<è·¯yl"/'T/ñ=}4!Û~obL"É%LBA)vVfêÃ;ñXhÿ7Fßyàxñèúº,2~ÔÑÎÃÄå	°²4E5Ô$«zvËp>qA©2Î;¦%	\¹Éz½é^M$EÄúì{[Jþ^ªE¯Q9?Ãz<fUWFÓÚ= bIö&]Õæ|õT¹é$±)»1ªâë­Æ$Öµº$gC©ºiøj¾º£¥¡äO <ÔöÈùXÓIìRBÐkð×;ç4ÓGØ>ZN´»D¬Ò)etëá½D¿Ä¡MJ= Ý'UAâhÞÒÏJð»ËÊBÒ3Q çu¨¿G|ÏOÕ8©!>¯Ûj'­£´7P,0 +¥öÿ6qÚÞØàü)88¹BÁ³ß|³x¦³ÁÛ}ÛÄØ©½ÏÔ¡Þ@4ëÿñufqU1_3_Tëv_T¬°\º¼Ü­¢¦,QD8íiCwB«)oU,
åzë½ÓÊFWôq³%jÔítJ[uæ/¥#áÛ,%u:Ú+Câö]aÅìÒ4mÈöM³ù&»ø°bàv5¯R>W ,úb×,±ÿe¶ÍÐMâ¬íf"ÿêç5tÅ¯EõQ.;ñ]rëÏ½5ÐÑ'¯RFõA^;1Í¥ÒÎ#.¥$òá 5ðs	tER>¦£.{2%^åÃ´Ën0ÍãóèPf}=Mmr%z/µã«¨íÖ)¦#pÍ6_EéÅ¥Þq¤S
í1^¯»Í3Ë§ÔõqIÐ3½©ß&´fHªb,iHýï~kºFÔ%rq;¡ëNdÆ£õPLµRôo*Ñ=}§R%û¯ßT!u½OàRt0Ëñ/"÷Ûa¬·¬sjWu¡
û!= ÀF{Á¦^°ºç³©º? H ¦èéHGÁDÛ5Z¤ÉòQz¥Xº¸>@ ×P:öb Ï,5´
´~\º6' ÁFi ´Ò§IÚø£orëAíXÅ|Òßãº<Q>I9=}tTÁTÐÆèPgp¹<í²ûF ;µ¼¹7§év=M&sA;ø#ð|µNüµ=MÃñ	ø´û6¿ø§ûV»ó	Ü³	¸xæÝø'ÿ¦{4P\é0Iaä{×ÍXs~Ç&ª'à
ëø]qùÐôD^þ «â½dð«Ûé<¶Jú 8âyËBµ?ÉvÌ´£Qøk­mtòÊÝÜYæyÔ§æRÝH´x #\qÀû\Ijüø]ÁX; âí°Ù«Þ@~¼M	[½xøPÛkíjÀýøÞl6¦IuX/xä:­Qi~y¿SÁî:dáºVêÛ0/ Aâ¼}¿æ×:¤í
a´(ã¼5ü¤þé<c£ÚN%h¯ãþ5MÌCÁ^>;ùÂ*ÑàpË×ÏßÓõm5J
gÇgQÑZg©ëýQ Åù~Å!#!ÆDÀ3(åî8Z½Ã	ë%¶M9Z ãÔüºË¡¸¯Y¬KåïÏOÊ##!ëcôY.ûasZçWô·§U¢32ÖáÂrVV6ÕHïsîÛâÀNÅáB.ÑaAim¯ç\LÞegsY,_åÃ»b;ïjsß\®­fGáôr®wÎ7ìw®á¬Í¤ÆÃÄÕÕ=}&qMEq«»UërËnÜ­¬fvn-ÿCÎú7­¨û-«]Ä÷&yüqÈ.Ð«ÓÏ¡Û&ÛLÐ@1ôM;8¦Æm= ¨¦ÕCð£]ÄÝ¿«ÞFó2ÿnMÖ§sØdi(ÄV~§óÿHÏ;;×î±S2ÿ	®ÊýÁÑIN(ª¹J¤ÞÑêR¼*ÜjÛøÿb<½= Ì­)®æ¹Zåé?G×! åaÝlP2}&V,gHa:SMÅÕ´°£ßq¤SöÉÒK-ü¿Wn´Õì/1ÓÕëM½Y3Ç]T$á=M	´#Qv£¯=}²ËìoÑË­>BQïm^5!ÑqÏC×®H´ËÓ¿Xíé¦Â#3pzg
íAý/­íË¤GÑ,®¢aÌæÑMÇe÷"j¿Ç±ïáp&dV,Ézn(¡uÿÓÇVKz;An=}Éiê'·òS!&Û®QæVJ(ÕøoQ3æ&rã?1:/>VñV¤[h?Sñ¤ÄA¤4Ók&§ÒRó' ·íÉr,Î¯,ih×2¯qÜFmEU4ÉËôÏå±=M×ÎÑSJ»è±p¤W0ghQ
j¥5b¾Ëôþ¿>µÏôgÑK&¸°áo
í³Ê«§ùuÒ;ðJÄgY3Ê«ç·ãfÚL¥$U{».<üp2M-EDs¤S(ß÷Î9_%ªúß¢0ÞãT©%5÷úOúËÆÕ0i4eÇí5©K_¦=M¼>±Ïêwíÿ8ð"ëðó:igç·&s]ç>KÔþäWòj:Ýç°ÝoZ(ÀÈ }óªàOúÍÛ´ä= nZ&vÒÇÉ¿àþFÜ¸=Mè·tÞ;Ý|¿riñ1Ì¼¿Èª= 9­ø?Eü[ÔÇUÙnH=M©Õ.ùsÍo|o|L>&þ>Gºhÿ¦Æ}×VbNt{Ü}Ö)UÔ"r×î87ÓÅX+rÁXex¾2	Fò= ¢Ôk»ªó¸ÅÓª1¶To9yà¼åc}®âVbQ÷"{ZÐ½gCÀ@¹Ë¼óº<wÄwZ;pÁXAÚl¿°<ø[U»SËTÊfRì(Lr8ª.m=}j¼[$½ø÷ä	)gJÍðªëÿIþÃ>à{2Ø 9®H¬ÜH¢4ED¢RÚî©pÂQ©øj>hã0Kmôù²úx¬bwÌµë>qþÀtY":üÉDcpítè¹^¤®EþÎþuû´(§ûàsim~mÿI¶¸¿ª4Î¸Ç¿U6ù;Í-Zã¯{]zA.¨DKò(8/^oHz~_SË&ÿéÙì¸8A÷°swÍ@xÍ!I6VDXÑjVùF9yJ×|jZ^	Å¾þõÛÐ{Ó \/«\7wCCÅó¹BLèKyÛ|ã¦iùÞ;Öyc÷kÏ|G»~'¦zg 2XRF}w4
¿ê|Éù¤*Å&
Ýb»´Ë°/tÍûþ·ô{æX¹þÉm[e[ÍÊPw2 Zæþ¿Ñz´A¬A¡ÜS+¯çADÀT2ñ;r­#Ïp2ÆÑÆ*¨©®HQàpCÿW×·!2ö©gºÒbfõ4UUdbâÉ"¢BäÌêZÔa=MZC=}ÍO×ïíèa1µàé¼êRëÿ*kë"Ô8Õ¦¬Õö¾ÒU§éêù3)Äâo4¦EÕÑ	ÀZÑtNsüÃoÿôÏsrXvÕº§¤C	N<­áÏÜÜ SâO  ?b<\K¯'ßdÇ$Ew´ofYYËÅ962J#sïÁËN&Æ5¦6É îïíïé©ëB0YÆüNLLvíwuYY9é[¡iÓ
ÊNþÄëV´¤ÅSÊæ²Z7îuS{ßËªú7t¡H=}MäÝ¼¤¼Â§Ã<k=M<YÉ	:2Võ,ZeH²îüqjJÖÑFlu= ß6téë64¿îãyÏFlÖÑÚzD_×¦}H{w¹UØ9³Ó±ë×4ê¦ÈO+«4¿³6ùnVñ.ÊØ¶ðÐDP½é¦hÂð¼äk.-V«´½Pà´ÌÄ¢ ¼ðzé,Ã\g¶
¥ÜMê"]»MüJº@ÏåüNº=}íK¼iÓïñ43ª´þR+ÞÉÂhjÄm)~·5'n­åä°B¸×ÇÏ¿ÓVþbô¡
» Y}};ÝaKóç'/Ü.ßwM-+gQH¬î=M¤cÁ_0C)p#wËWsÏÇ´öÈ¨;FNÞ*®®þÈm¡lkñó®| ý²»ºIÆ= «rõä¦7~ICtND¼@¨=Mû4ËÚýbû¤Èãq1= =MÆ©'>~Ì×s²××·-Ùí_D![Ål|´þrdÏ-G#ÍT@·²ßR{Å¦!"»/¶*ÒT02ó[bý6fî[Dì-¬pÔÌ]ûgÞ¾&åÇTÀ7ÑËD8x¿åî¼0d)JOXu¿&uµí_/}F(¨I}½l)=MÈgeå«¾iwÕßh/³Á$|Á ò~¶LÁ+»zÕ$E¿cã!«r®hYñÆ<4A~ôÊå¼ßpc¸çKud@s©²´lôagæ!66ómÔSiþÒ´4Hwâ²®Sô~Eùè\ÂuGóÏZû_ÄXK:d?áXwÚÅ)IëlÒmUlH_¯I^â= ëÓùrJmè'~ntì®8ú~³"kÒc!/Jc´>ã 'S]½§.¯ÞP= Ó÷_c?OóÅLyR$]À^#Z5MOibR)ëcI¢°
GµEÍ±IÃßáäñÜ÷s%.dP~çÃ{¦Ü_= áø¦~5&ÅlÁbÁù2ëÍ¬Pv»(ùªrJÑc!~3ÖÓ«½F¿Ñum°wV-ÇFþGJ<= ôÖ5¸~tØÇu%cT?áØ´»S{²³¾÷õbð5ÇI]= 2£§¼§ës®pßóE]õ%ð"p°ß¥¿ÏåûV?= Ç¯5À¬pëD|¬l¿IzÕ®r¢óÛ?Ëº×sbëÑ= cn3i~â8mïÌÕãû¹ôvÈï­à¸}spPÔñî3sÒ÷ôö×ãWÊ÷Bf¥\#Ô÷ñzPå=M	%wõF3ý®!I=MSx2Ðlð²b MÿmI8ÐÍ¦s+²F#|kMôé19ún¿½$+þiokãi©s)]ÎTIÓWÑã'£?km'ç&>G ÈËã!²3AÅ@¹oêÑ4DNøÚôm®ÏQfå&³Så¡
ÿ#áØ®I>ñVZH@æ³bycSLQkz%ñÀá= ÇîiÖÒCMª©/êÖ2öKN GNæöÏÀHÀÙ)ÐÂä®s)áMÄ?j5õÞ¡LPÎ¢fËËô££Ü"öýÇ2,ºÊY¢l±)Ú¡/YtJêíòbÞXµ3pbbkY£/ìRy±¥ï¸]B 2püÃ1/º­+@R3³êõh|yî/koK!=M;= lýÐh6¢¡Ò®,Iþ9Q þXÚ¤ûÈ= ðüì¥"üHWQ#3jwsÖ
)åG<.åSÐSåëåS.åS.k©Î!²ÍëUucö=Måºp v/6 /eÔXùTïÏÀñ)êh7wuË=}áÄzÁ¾~Ñ\¿y½È¾}ÍLÈ¿{Eà¹£RHìU= ¹§rHyÚ;9 >¨ÄÚK9¤^¨5Qu±û±;±
±[Gº+]$Ü­ãÑG¾®+=MedÜ¯êªê²ßê®_ê¶ê©ê±Ïê­Oêµ¯ê«/ê³ïê¯oê·j¨j°Çj¬Gj´§jª'j²çj®gj¶j©j±×j­Wjµ·j«7j³÷½^ÇÛÀý¬ª@ÿ´ üª¢ þ²à¾ÒIþîìÕ= ¾òIÿöØ»>¾©þéÄØË>Þ©ÿ,IÁAî&¿ÆòjÕ]ôV¢Þß0¯Ë6ßÔë')µYÛ­©~uEÉÁÞ:ùAªÝïËEÛK\æDGÁ±éî5EÑ±éë&5CKË6ÜÖàæ´×ÜÇeÌ5£-Ýn,TFÎÈag¢_"Õ#éÇ%óc´ËgQ~gÀ^VQ:3Ór¾£Wâeåõ3R#û²!%+3 -3#5ÿü13/r= %scíaõ þBÚ0Ä¾@Þ¾Câ$D>CæúAê*ÄBî2ß@òD_@ödÝsAöÞëøÜÎQÞï0ZElÐ+µV_mºóbÿ¥Ý17Ï²/R--fÑgVQdQ%V)U3îò_æg¶A¯Æi%KôkW¶Ã_"]ô­Õ .MðÒ'ÈkÍâ7ÎOc]µU/SlðÖgNkõò÷¸~CZÉ´Ül$$QÃ*óÍþ'Cj¥6£SoÝt	$·=Mq_*wBf«\»^¿ÛVáoNR3ónßú[ÜOËMßï^0Wæ2æfïëLBmgYðø2¾òÖ^½jÕò [Ô×eñ±tñsm=Mèc§pV?Vo3cQÉg¿S?)Wl $µ½Sh_Ý:ÿ¼Y_ÐÐR²ýüÚ= DÐ0k9Ð 6ýCZÙv ð0ë¹´Tõá´$õêý;u½Ë­8?	uig]SU¤ZÅ*)àd\.Ë£.#e!J!íEÞÌæé ÆåSVËuq×Uuga·{z§þñ'VÙ	ø
¸.ÃzußåXßÁÙ6½->ªèúKe]Ho;@91É¿Ëô0ÆÉx7ÊyÐu¸Òæ ¹²"ØV!ºí(Òä0 ©õ	òâá$ó¥DÅÒôN9*ÃJQ*³.H+ûÉáöµDÈu#{-XZ¨ulÙao½kôfà¯hgU³àøö.³Òµ¸º´ÙÖ 6eýÕV$°õú§l5uÈeåxDéùp>:ÜõÑðli¨.ã}¶^¶Y ^Ø$|OÝ=}5²°èûZÙÖøoÉ[	6óÜ6ùvû¥Õ°®¨÷âbZnàáax(=MwFHK& P:_Ì?[û 1Ñ±åCý¶¥>_}XcØÆ¤)j×[Bêèñ=MÎqïÿv¾ÐóùT^®uh9íxâ¶|¿x{È@yÆÈ¿8\%x:yäy¸¿ztã·HïxÅ¸>_ÄYà{F»|Y¿à.ý|TpuÊ(sÜO\®fÂHÓ¢(LX,XÔäÙ*eeY«0ù&Af¨-nú¨V\Gx(ú¹Ïýù7}6¤ÅyS2@2¢ÊÙ
åýÑ&):b?5¹«;LÔ»pö«8&'{¥ÑªãÀdÇµnúí¶¶gª°¨ÅòÒuúº¹0Üµ.¤©õ¸üõÕÑÖºPh9üj·çYsæÌ¡îTíº5:»¡ÛòX9HÏ;!»â;®äØ04§s=MÙÈ¤ÍáÊµÄ¼cP·np6Ç½ÒäÊ<áÊï)(-ÎDU§Ãv,~hóüüÇ
(ÇîÀ ^1üWa£]ÂaBÊn£ÊêNÎÜÝAÄ_CàQ­o>½¦,#KÊTL^%sj]D$n»\B¼}1«º=Md#áÂö8á%ªâÈIE<¾°KKþ²Û»G½#ÅLú:¾».K(Öààâï¥We·%oGcP¡á.\<ñÓÙã.¡[ÕWU³tJÖP°9ùnO²ã1}AÆ4f2³ßü«Í³= ÁK¦µÁ§ïVL=MmUYBoê[falt¤ï/OòJåßµÅ5|õ¯oÙg¨6¬a§1Mç6à'~¬æø¦ Fä^zÍïùüÌúfGæÝX XÝØ[í¡fª*%Ât"¾=}ÇG³$Nø ª×ô"9^{©ÐTLýé!uÔ.{Øl'y/ày2ÖVüiÖèjöí\êér4sGµo]bïíî¤++k°òwÞÍ1= bÍj(SBv=}77Q®Ã².µÕ;U¶ÃuòÜûîeº¢¼_ç÷ÍÔ7r¸1lv§".çm@·;¬­ïþàq?ì+ÛençQÞWS£U	ÕF°Sél¿ï3N´Ø µj0ccuUsá6gR£{î'T:¶f«<9ÝÀÐ»= D@nìÄèõÔº!Wý\aU-f¤KæcA¥òÊvððÑ^GE]ñÛ×ÿ¦ÕÈY,ÄVc^3µuV´ì3véÍïa|û¨¬ Óyôi= !Úhã=MÃ )rë= ´ôÚ';æð6«_=}(Ë¢P5YoöÊç»wçpQ¦üT5¬ÄõëDBÝî·Þd_ Ê]±ÚÙ É:-BÕ4¸.èÍ3kO# ÃerazÊe§æg,W7cûµÄ{õç&@vçïÎP8GÚNÌêe¯¯Ìå÷ÉÐÓJ5'Sü9Ç×ßQm|-u½ðÕ§ýI¿}=}y-³ôhrëz¤=}ß»«jþ.¼[*Õ¼0«I§Ó§.Å	
QjR'£L>íëä}7Æ-µU×knvÇc:@<E/VÿÆ³Ðà­áÈhðÉÉ_½){o:Ôò¿L-U33þª' I	Õ2õ&îËa.¤/%K¤ë¦tÀ¯ÑìÕõö¿UBÅTR²VK¿cY,3·vñ{uß®×
i2áÉ{:­ÏÏ³'c¥Ø7Ç3UÔä ªDt)©l\^1Û©k¤¢ÛÊç /ï'{a4¼I³Å×IÊt;W6ÊÞkcOE&­+÷]ï¶e[Ò¢²WÌçu2&t= Xr ÿ¬ßYäæØÑ{ /{5ze'{:çø=}zÄT~Xhç?*ºxÐç(nÏøøw4Ëzh|,É¸ãã s_V«>2ga|n¢Úø<òÌÜy'*içØúÀû þnèþ4 èµ8å÷z]ÊI-5©¶HSØç#pB½±á1< HxÇóxx~m¦EC= RùÃlèJ yØºM¶]ýQáR?þ}ðbí¢zÄ#µ$ïÝéf·$9Á#WG¬æàw]}ÑU²,Æ(ºnêIí+±0g/ñÕR<½|sR^]^Æ%!¶Ï½ÉÆâ¿£6ÎfÜKr-«­×*tD7 -·iç±dS1ÝkrÍmÃhõ$QgÚ±v!R7#û-²;Øùg7Änës¦¶ã'ó4g<ÁGkÞîW

ÿWq·xxÓw±´,¶ï´´Ij=}´vþi´#µ}%¢µü:¾µË^ÜµúµÿµC*µI60µ²7DµÌ'Yµoµ¶Ql¶×©¶àO£¶[°¶¨Ê¾¶Ì¶7¿Ú¶>è¶(÷¶ÊÓÿ¶Ø¶]¶ñS¶èf¶P'¶sØ/¶37¶¾@¶/H¶ð¢Q¶3Y¶Ëb¶Vej¶~s¶6{ØÔÃ¸ËS.S±)åST¡Ûõ+.åS.N®VPC.e@pñÕi6Smùu(é<üLÙ\F=}Q2é¬NÄÇR ÇKÕváþö·£ÌSÈp:Ù^D¯FòJÈb;#ì÷âÅúÀá9¹ükqË1©$?ù3¼[¡Ô¾ÞÌ~Ve+ðÓ)åóê-õßjòÔ8rþºv2Ð<Í=}\^¨á
ê^¼¢¨ôXwó¢¡Z&Ä=}"å¢F5Í©é¬¸(/¼h_·úK}uþ×Dð0kÌ(mjXp9MçúÆ·|ÃW¤qç
6~oÐÎVQtÿÜ² ½ÃWÚ,l©²Ã5Ü~Xì#Ò/ku§¤áµDÊWÒAötnÍo+¬?óáOz_ÊT¤]Â]/rCú,Kú2»Jô³}óN¥p¿(7Ò(ÖÞZ|ævúÄó9Õõ97Û}ò¶÷Ë©Í½EÍ Ô%ºcÇöº=}IÖ¢ö¯ÊiÚ07S" ãÊêa
<íÂ÷Í
\Íø
U¾Â&ÌÚiÖ9cCVçÌXÊ'XÁ2úÓFþÏ(Z3*cê®çË¡_ã¹êÞl
ÛQÈúkFNX£Ãp5Ë²¯)*H
ÚÒÔ±¶0Ç½@¯Y±5 ÔÒ)iÉßNÚÎÐ@aR1Dë}Äp+xehz"?ØImBôvB@?ÎOñt6¡k4´j ó>>ÔBê¡HDÝàãu^»OY±ì0ÅÈÕ®âFQtpØ.ª²óy-Ñ.EÚN3ÄÐ×às3ÝÊ2³ûa9a£Æß9<ìÕÂÛÀ;Óµc#!ÌÇÃ½çâ¢þÊpÅú?0ZÇëÕDjùAÔQ=M¼ììFe Ó 6ã¾Çp#ù%|G>k¦CU[a3¢Fé$ç oÐ¦ ]EnuÚ÷EZJà´¿½.¥ËÉDå \´ÑÀª¾èI¤ú÷Gþë¬/Ùpþ)îÈ±C»ÛNi}ýÈNÏæ¨º¥¹­¹<=}ù|âjSxDdzè³eG©÷÷NVnÅ4sÒõá	qVs¨»f;cVaEHÆVÔ$hZë¯§bã´q5Õb´ðNK{Òï²lè?4BUp¬S=MåÕ¢÷ê^Ô«[×°i¤Q¡1b RvëíØmyólÄdIÖã?:éîLtåCf.Þ;H/N¬Ò«q~¬0:(UÎN(Z;wDaæAÖ1}Y%^\Km lEÐ«GÕUÄé¢¬9_©¯Uñ,M ,I¾\Íje=Myºpeø¶kcËÿe³Õ&ÿbjâ-[íÐÏ&Å8Ë¥óá/ÉvÄ¢He²>bÌuµ=MË°¬ýÓ¯Øªr1PïöÏ­ÊÔ±ùÝ[)G±[ÈöCµW)Óµ~ÛE?åHó¾+ç|5ØòrèÞ>H9;(CR9púÉbØ®d<ùVûÀ@¥{ = ¬ø9uñ4Zë×®1nÝR7õàâaÅ+ÁçÞ=MmÚO=MLcAïÑ2feF&UqPó3o4ÕèMMß³)æètÛ³jW"DôSÖe)UÖßRÊR7¥:R+È|9{øÏx}8ÒßS.5wMåSîê.åS.åS.åFP¯ftb= ïÈlòÝ3X©W¸;²*TÏiû8ºX+ üñ°"E9ë~L¬4jqs|P?Hw_ ö¢þ[»pÊ¬øWri'®²µpÛ¢ç¿7Ì®ûÓCOßæ çø3ÑîãsË=M0ÉyANªpw×#TÚD ¤0xÔdq«GýTÞ®Þ¹1£{w»«ë¡ÈèÃ:J/HògrÚéfÈJXÇ®Y×=}tô!ú3Âöki?gthO|®ó9ÉSdùfÈtIûÇÔM\|¿óS;çWçS DÊ,©?±Ë¨ùóI¯ÿ@hG 6wyç©¯rWý´;c¹i·8%&³è5rO8Åë­_©ó~MÇZbTÉ\ÿúK=M÷I=}tT£ö»¦ùù*®Z>LéMÃ}.¿i?ÏêHÅ
:ï<Y@úßÝz= ö?¦é¦´åÛûÿ¡«¦#ªã ~a·Y6ÿClOÐÈT·Ð%	»k¼½ó
ïm[U=M,
çcÀ9ð±ÑJ¡¶nÑð ´ÉV^Ù\ä·inò@Ò-­Y­^e×@·g#$/ÀÓZ
ñd×:°%½¾EÜAç:z¼®wGÊ¯°!ïÿª Õ×Â±V R¢´ÆeêËJ=M²Y²²j2åÅw4DfF+	@©2«ðCª¸©ßÞ¯§1"«ß8å¿¡i?Ôßn{úXy øzPQ.åS®+åS.åS.c7äS.åæ?bê,[1heµit»To¨	­©öúªªìÊ¥¨^üeY%ë#òV\>KJP¹Ó<¯áÜ%§üP
úoüæt)áöçóóG	©%Ç ÃKAPú=M³h÷¯f»B&»àÝ¶Ò²·_iK] ~'k]Åäª0ûøbs 6l2ZGttSW:b{V0ö~Ãg¯Ä´pý½=}7Cxs¦<ÊJ»Nùæ¥$0ëýß}ñB[º0o¼îê
Ãù@4´"×¢;ÔÉÏI>oK2ÀÆL»}5yIáÝs¢ªûø}\.ÐUUµ'äÕåÿ|éàgìº«b×3ú+BB02=}FV0i@bñöXÚ¸QÜjúikä  ;Hiz+-	(¾pÊv=}¹Zôz½ZIÿÜØ ¥²;|îBa00«Ïe*Xñ¡NÙ1Ððb$zÔq×ü&2Ú]¢½t¸ê¢hÝo­#35×Åcö ycîÐ´MÞ/7PþVe 6JÄW¦2N{pn\Â·ÖñØK=}ÔëþG!É PlX|ÄZ@.átÈ¹q~¹hxÐÚxÈ¨.åS.åS.$åS.ewÚ,ß'åSñsÎ(/v5XZú$TÇz#W·6ÆuhJZTçºTDID·XóÄï­Ú òÉ/h¼wÓÀ©ÊEôÕÖt¢;cá*¤k[o¿êdWÑ
zÖ´° Ã1ÒB$Î^èÿ"tÓ=MKMïÍ?h²­jK\b{ÅÎà$E=MR %N¯¼=}24Ð!¿á¶Ímq.<xë»&T¬<ì¡t?itÝäBeÙËM)ÃI4Û^ä@(b}$+Ü+7*O%p¶A¾®Äc-¹1@Cg.æ([ù'µÃ§R«HY¸/"?±Jc<!óÆÄZDwíÕÐë:ý¿&Ô0gBÜ¯à2ð@&ðVZAòÁ§Oó©\\EB¹çfÝrèl	×>sJ'Xÿ= Þ·rtqLcGùx¦×ØÒ»³6|¬¯ ÌEØæä^Û½_ºÀ½hÓ ë:ðï³v2è<Wþëöô|¼«¯
ÂÉ':À¯ýá¬çß«%Û±7§Ês°ò>ZGûi°Xõù.0fÁUóÓ0ÛÄJRÜ$LË ×úùì¢6ËËpB!¬¬é5 =M÷K±9!6¤µªRÁ öÇÝiÅ°&Nä*gÜ+­¥ÿ\9¢Ôë1-y=}´Ü\ébÙaq|l]ÝÏ¸^Bz¶ö§XóÍÍ7ZbÕ¼A^ÖÃë/&·ñYÉúL2÷£30{PÙ¶+oBh Ù¿±»$¥&Xß¹}}2=M<ïÎ*nÂ:d# Í=}9Í¬òÏ«çÁ­Ú#1ÐûlB·&ÙÔÈ¥_O
u¼W²®§ nòÆmÔÇqçm,®è56ù¥_°M »ò®¯s	ÅÌÆæÚiÐ¢ETCæ¾íÃ«#f¯KäW:^¤Æ-t1}øÎÆÇæÝñ÷£ûå¼ÿ-Ùª5ù®væßïØ³÷çaÄ³>çSïbXºÅ+/ï(kâÔg\qlÆªGít*õ¦òê2(ÑPýå×ÖïÙäV¾¾¯ñ«3ñíÃï2ÉÉeÙåÈ%mµäÐKû>&"¢"&S, UPyBÑf¦)àÆd¥îïïXÿUd­ä:ffäjvmìß_ð\ðnÍ·d¸}r$È¸Ö¸'ìLÉBÎç¹ÂTBÍºë%+Bó¼î+Gò (!(õ4m®'ÍÙQéæUÌr£!'øzÂ:|= ²Ë¸Mòy_H'(e	ø×}ã¥ÚÀó^Äd¼\ñ( Ù¥Ïü^ìg= 4¹<B@¡égú Ï½UÉq¼<pOÜ½Äq¢ZMï3ö #wO× kEw"Ó¼L/ ÜW¤J&7qLL[5Àõ¬n
ÀßÆ¬æ3Àk½*@¡ªÐ¡ÀuVÜùÌ£ÈJÈùÒÌÈ!ÍÌÜ$Ã>¢¢7&ïk=M\_"'÷ìÝ'ú¶¼¡@ú=MKi ±Uày=}ýìM·§?jzj­¦
ôJ(GwÞ5EÇëaÏÔ¦]öDO#AÿQ,u½@s£Ã¬ä÷~=MíA¥«JaíÅEÄ]ÿË!=Mé¢UÁÃ"Ü²I£"êÏÝQïÂméö¨ùÂw<
=}KA°Â·Ã=}â)a»ÃëAïgÜÒlô­¼sJJ,6î´a¥ç?I­Ué,>²
´?ÊËä|å>H=MYìõï=}À,mÂ¥ðÄgú oÓvÙv,Q­sJe¾Òh?RLñÉhÇób¹¯T!YE°= Âç®0È'QF¬¢Uþý±
µIu¦^L³quIìl@ )H<RÉÉá1vJô®sÿJ×=}^©²+o0A:s½6.S¤!Þú}Ýî®ö¯EÀïæ×bCrÈæå§JPVæ~oOâUÁ.'£5Kýæ!íF³³JÉ7,3NHYÙ>ìq}Þ+ö³¢¦áÃÂ¿µ2êÇNbHÿÎR%HF^ö4­&% SnÎR@b'vÝMG÷)O×7+>ç$N^×;5ßÅV(ôä.Y«Þo½ ·ØN÷g(ZÇ¯Q=MOPùCÑh!¢þeÑktë$ËNáNÔÚâîdñ?Ärñüå5é%T+å6ÕÓ:¤~+;âÓÑYä^ídÑbâ.Pö}S6í14á¦?
Þ+hæ«P=MËQéÊ¨»\(*Iá$bÐzk+D>æÜ¥¤àqfFT²ªu¢óÎµà Ó*"·C"g?½mÜ¯C³)4&>Ä¤HÛ%æã(fÉ*¤u'ª#j*p<Sª÷[Æa¡QAóÝ«L¯CeÐ¢Kî«&Æ=MA­»ÜÃ$°/3$éïãÑ-ìE4g²ÿAe4¦A;ÃíUãC<F£¡ïªóÊvâ4&LOJÄÒmÁí??Â]±ÊÅ+_ÊÝ\®áNi{J»ÁbÐ¥%fÁ_WÀÁc0{¥
/ÂnN_m_Äp_P¦ôø¾ç6ï#}	Xþoþiáq¤ßVñ§,X£Æþiè/ 6wÒ¬³WõFÆD[}G´ì÷§"9e¤^h$Ak1Q2½Te>Êö½ã·ªâw
*_äT<Ý/ê?7=}´Sä7^/ÿó]f_OZ}t grt|§å¡]¶U±'(³;s}_[
¢pÜÒòýç5FMVZ-Ýïqdða]?4= >«öcNÃ6cNÖ÷uµ¦Mh_6húË-ôJVôUþW4S4òv¤ÈûrNÎ(­Î?Slwr åpÎb?®ÀÑÿ%l	W#ØSWóÛÁfð.¿ÖéÜ®ï<ahF VO}¹%3ÙÖÐï= l8×µéQ-¯ìnùjÉ×m»Kë,¶àù¹W¥©Û­b+å(pÈ÷HßÓàÓ<#ûèõ=}ØÌÏ9Mrðàµg¾Xo	àõ8RodV¬-5èEÑþíIyËN³i¦Öî¾#¦= pKbÒf°çbùhV°æ[ý»5éSVÝ6H·0ª÷@¾XSh¸¼ºÑ¨4³ýÒ¯7wüZb¨pÕ¿>A©1¡z>ÚÃìK°\îúKg ä3²£.ÇøáV¼léüÊAðhìª<
àdÂ¹= XÐí)¨·'Lð4©Ç82¤O4wüëÓ%ÇªÆO[ab<Â½X;ÌäAÇ» é²Zï[yÝØOETF<0ç@ºò®^Ü[!Ö\Ø=Mæ¦
ß\ÚéÛ¦L*j5F;=}Hôì²;u(ô½yBv8ª"Bé%+] $ÛØÇ}Dª °%¸ÍÓj:=M0Éá§ðV¿ýtA¢ðäÌX&RHèè¨»8*ÅzîÍpÑ£/#É½P\ Ð¢ZGÆ3'PiÌ<_Z÷ ¨âpÏU¤ZÛÀçv lGÓ	ä#¼ÊæáÝÀý.m÷HýzaQ¼ßÌd%GÂÑÎJgå
Ò\¬­ÀÆã!?ezJM¤ôêïG5Y1\=M»îÛ*¡GÄä«!Æ~å2¾³®
ÛÜòAô°²J"iÌ¿dõEÉ"=}¼ª>]é¬+Õýð¾Hnúè7±òÁ9ï.·na!§µ2_Å=M´XÆ{1
Ë$«ÕdÀöAv=}ÃA±In;Ë;àÎP*r°R_SÊÔ­ÓJNçu= Z<6ì2e-d¹3íSï²	ïÜàºCÃ!p1¶¡Äl@VÉÿZ­aUdNÜcV:>ÝvÝ#ößÞSYïDY@^3s£ÕõÿÍ¡&©Ö=}ÑÛí]d<	[$]£b)¥#TF*¯*eMd:þ$:Þ³íì²#À+VA!D â+êÙÅ5TÑ'×îDt£KûQò)©¥b¤¥^+d$ìËn(UÁQK©ÝãABo~@Z2í	%åË]ØÕªRYÄ9UÊÓODj©oÖ=MsÑÀ£>Ãe5_Â	Ò=}Êâr¶tmöÀ'ú,q8­to5VôÿY¸v{Z=}u^ýk£ÓÚðX6fî¸=}m»ÞjÅ=Mk16Uªæ4íÏWD©Ù7÷ðÇâ±<åÔÇjsË±/¶î·òÖEï WXæUgiÔS4î= £¯= {·U_£×P^×w&WÊû²íO:r² $H;gÝeÙü80ê%{ní>mvUH]¾m>«Ðæ&Î Ðçû]{È®ëD798YSµ'dYe^ø,ÑY q×JI1´hHOA	¶¨= ÿ	yØö¹Ð¯|¿²ücë°¦¾ØcîÉ v¨îÃ:IîªÆ¿ÛûÏ¤&Î>¾øÏ³É³}
2¯}µ7ºV§9Pü}ÑOÞ[Ur$ÔÙâÎ½_[.õy~âÚË½²ê$(Ê¸7Òyq¼fôÈË
dfz20tÃø)¹¦Zpãç èqZàû ÷Ò¼ÒiÂc¼2ä
U¬ù# Æ Aò)ú6
KeJzªª@×ëaFhäJIER»álïÈ¥=M¼{<Ë@)ôqó/3ÛÁýELØS= ÇÎñK]ÜïJ;vf	ÛóJÇ¾»®Qó%!ÞË·ÖâS=M×âÇryþð"cáJø}EdAe²ÎÓog*÷ÆÔÝëGªwÛD²ìR4ù­ÕÕDÊWÄÛÏ#
Ñl^® è3m4#ãE'AâcÜÞ*&=}ÝWk;CÚÝ-]ÝÛüi
!lÐÊçHYQÚ×¶dS¾èëw¤æTß#13.WÉf]»SZÕp0tB´hcÖéi×êÂ^ýÒ¨cUV4Â2ÙEVàw>V­®7­[®?ì/Éà2:H°D}]ýÈ%o9-y= ú%Ûë´óÄ8ÁÙ=}u\|àúïÊ(COÜ2¬ÍÿêI¹@?'ý= 5º(%Ïve@éÙèÀ<M§Òv uÇ$v9wÊýÒ)ÒRË­Je%lN,r·áº"9èöØXÚÞÌÿC" ~B÷x#YÚ¬Ü,ÛlØØüBÌ¸RyÙ°Û´ÛÛÄ~zz;9¨£c¹¯á¤Ù\V99ÆHX	ÏÊÉËOLJNIMKO¯¬ª®©­«¯/,*.)-+/ïìêîéíëïOÉL¬¨-,íèêíolniÃÀÂÅGDFA£ ¢¥'$&!ãHxxykv«´»ÁÇËÏÓÖÙÜÞáãçëîñôöùûÿ	!$&)+©¹ÆÑÛãêðöü 	=M#(,158?EKPTY]= gms²ÇÙèõ&.5;AGQ[cks·Îâó)3=}FNV^er¯ÃÓáíø
 &,16@HOV]chmw¹Ñæø%1<GQZbjr¡Âßø$7IYiw£Çæ2G[n¿Ûó.>N\iu¤Éé 8Ncw©Ò÷7To~«×þ"Cb§Ïó0Le~¬Ù&Hh}±â8_}³çBk}¯ß3X}´éFp|¹ò'X|»÷.bÄBy~zÉ~X¸_ õRï0È(z½¡£VÕÿY©Dnóü~·rxôÄH²b2sö3ØîÞ
&©,¸ËòîcD!¢ko{y³D®ÈÏÂ?G±~vëfsO)!	ÙðÚ SÛ)Eðx;xxL.åS.åS.åS.åSöÓ+å'ï{ð¸yÐø}ô¸{Pø{Xxú4ü£¤96ýä9Ê°:ÞØzùÌèûP8ìhú0¸~àÞÁïÐût¹çPû\èþ	ÙÇ Z(üÇàZèüiá;B0>ª$YRð>®ÛôÛÂ/Ðý¥tº'Pý£Üé^Ù)LéíP;·liõ0»_#\}Õà¹jµà»{õàÂ¾j

&,£q
,ÁaÀ×	|ÉIÎÜ·JIî\à±Á­UáÅîjµ5áÇæ
K¾´ Ã¥BÊ¶!¿åBÉ
²LÝ¤ç¡cÒC*çácÑSê,m%ÑÂÍUâÍ.j£Õ5âÏ&
M!þ1<ÉO5NÝ§wJO3n]¦ñã<1@º¤Zñ@¾	ûôÜ¢¾iÊ&*#pÎ*À] ×Á|ËAÅÎÚ·IAÃîZÜ(1½¬-TÝ¥îi54Ý§æ	CÑ¾Ù´C¤>ª¶?ä>©
±DßÛg _²C)gà_±SéìkQ¾°MTÞ­.iU4Þ¯&	Eáþñ<ËGõNÛwIGón[qß4DÛ3P:¤^ÛóP>)ûõäâ¾kJ&.¬#qN.­Áeà×AüÈQEÎÞ«·KQCî^ªä 1Å-Uååîk¯55åçæSQ>Y´0C¥Fê¶1?åFé
³T_ß´yï5]ÑGo,o4e±Çò?Øî¹í/ÓetÆï'ScÜï2^ß¶Lï7mQGwlo6u1Çö_Xó%¹© ~F.åSVæ.åSÓåS.å3§-åS.U¾7KÐå\ô= ¹O[¸ýDp@ú"<íä'-Æ4öDÔ°¼((Ím9Ë.¹·}(yÕÙÄÒAzû;µÂú%eÜóüø},±¿§o%§/|Iiå¯aò¸û¼|éýÂ7hjÅï]ûpX³²M8Ó+v\ÒÖFRC´àT°K£Ç¿008mÕnêZÞ2u[]xwÉÛpu·ô¬¤!uf·|ÎSKU÷éf %riú¶<qöÖÃt<Z¨"²t{ý£ÛáÅY¯<öýrkÄÂs}å·jËgd±Âátjpo'WÛb¾RNsÓç/{$xËw6^Ó×·¤r6O+Õ·xxx7zÔ·\z7¾Ò·ï:}7ùÐ·n7+Î·ïå7©SÌ·R±7gqÊ·xx7äÉ·B775Ç·ñ7pÅ·E£7¬Ã·BO7 Á·iô7k¾·7IJ¼·¾*7o!º·²º7ð¸·[B 75¶¶·Ä£7t³·[=}¥7*±·y°¨7×¯·Ýª7k|­Hy8¸;¸Þ©ìÉCíoÿÿ^FoÝæNÜedAVI Nà¾ó´Z­iAª
åªcÜÆna¦K¡UÛ2Æ_ì~Ù©Ä:ÞýM¨3ÙÿáP>Ùõÿu«Ä|xø¸:qÏâ¦{Û=}¬ÁáÎK¤eÙÒÆK,>áµEKö<: ©£Ûî>È¤!PÛ)®^Úç>ZE©#Û®î?è¤aP[)¶^Û÷@k¼V¿jBñgÿjJñ¢ç?jRñ¦gkZñªç¶^M_Q¶=}l¹Øy;x¬~èùø½NRïsvØ¬ña3Co+c÷îµG&O+cudÒÕc+ã·îeG&k(côd²§3FG&s(cöd2§3fG&ñ(ã¶d3^?&ñ*ã6d¯3^G&´P=M3jÚÏödBÕq*£çî]G&¶(#db3r;&¶)#×db3r?&¶*#db£3rC&¶+#Wdb³3rG¦dj9¦§dj;¦Çdj=}¦çdj?¦djA¦'drn/?´_­ÖcµVããÑKRn(µeeFZÄF^FbDFffZÆf^fbFfæ~ÞÙÞÛ¾ÞÝÞÞßþÞáÞã>Þå^Þ§{Ñ@¼®ª
=MDÜ»ÑBÌ.ª-DÝ'{222«2»2Ë2Û2ë2û2 2!2"+2#;2$K2%[2&k2GxÄ(9£D(;ÃÄ)=}ãD)?Ä*A #D*Ù	%xüÙ¦÷ÅC¬Ïjø<fkt4÷6·wkFq_6ëw_Dñ«÷nAöQ¯s\4
×jÄ6A³ql6J×rÄ7a³u?»ô<Ãt<Ëô=}Ót?i±Ö?gðW[õtw¤Nyø¸x;¨Í|iú#óÚa*ÿdóAö*d£óCv*?d«óEö+_d³óGv[¹ô i<ð÷ZÉôÏi£=}/ðwZÙôi«>Oð÷[éôOi³?oðwKûl5À·Jl5Á÷Jl¡5Â7J+l¥5ÃwJ;l©5Ä·KKl­5eqWç÷àµÆKcl³µÇWKsl÷*Ô}xø¸üñ³uÓq}<{i¹4·<i½4÷<iÁ47<«iÅ4w<»iÉ4·=}ËiÍ4÷=}ÛiÑ47=}ëiÕ4w=}ûiÙ4·>iÝ4÷>iá47>+iå4w>;ié4·?Kií4÷?[iñ47?kiõ4w_{q¹6·\q½6	÷\kqBtÝ¶«7gD÷^»kqJtá¶­7çE7^Ûk+qRtå¶¯7gEw^ûk;qZté¶±7ç÷'7GW¶WuK{Úxxx(D.åS2Q.åS®æ.åS.åS]RtycÞ!#
#Þ%B&ár¢.JòÑaLâÝêãÝö'4öN2£5ò>Qc%tR_$7ÜÿªãÜ
û¶¢$ý¦»U¥ëÅM/E«±¬¯U©W<É¾ç#T
¾åejÂ%EîB§ÌHW²oÜÈWðs4Ë¸ó¹_t¼ÝûåjÀÅî@½ì.@ÙÚ¢!ÿ]&Ã!þ.ó¦Þ°f30BbÛ-SJ"ÛUÖC#±Æs¥~Ðg6Ø7obØ6kvÃ"®ó¤#°d+2Ðd*è)JK¯ÊKÀ³4ÃÃ«h»´]l->aL­Nç\KNÔßt	À{åh¸Åì8ýì,8}
!â ¥@!!p&0ºÜìØÌÑ_xcXy¾I7eÛåSô$UßS.åSNäSnZ}+ÓþÐ3+RTWµ^9¹XoéÂ;äÐ=}~ÚW÷¾ìlwvm%GÁ,»*ÀûC0Í;æ}t*Y¬#°è:ÝTbÙ/~öqè{#«°µ:âªÄrXêæ¥(S7i(YúÖp©8È¥d.:§¼«8,-Ô}FÔ(EzU¡ÐÉ:ÃD¨ÙÛhz»åè¼y=MÄèa~ÀÍûô*¹àÜÍØÓ2¤øa°úê³°§øB9¹Êt©¹q_fvì®~÷k.ZíÍ©Ù÷®Ð¹|LØX=}©ØxûðlÎ1|ØYxªÞÚr,Y à½·FýlÀ<d¢Äg¹rÉhïÿ¹N[9j_ü×ô½Å´·lSü÷¤¶<@c@@û@@}êúTTÔß÷ä7¹v²DgSçwÛwwnAOR\úmPÞN¾ä2¾¥Ý¥]¥ÝÅ]«ákñ¿25\´¸÷rzÅtÊR	óW5[Rkfòî´³!4þZþr>$^d8À>úñAHá£C ¦#!ä &£"Gç¢ä¥â¥­Çaß-+RëFooubg4lº*= ½oì§#£/3 ©71(1$)&#­R= |ßCnU&"KÐb­-~%;©?éJ°ÙÔ	f@ðt3o)g]¶AðùrÎJsGW¿4C'£&%!æFâ $§à¡f¢l3ËgÞ^qÎEÃÏâ-¦îÜP>E+nÝmúöÖ+&QK&½/kg=MT¡õÌhsí>cLÓ?¤Y	!"b"vè¿¹¿îçYè9ßF1bëFònKÅo §Ê«¹lY$|©0 f¿hkPÚzTrÄþhÇ7Y@ä¸B\Â%Nà-²ô>8rsßNö>9 ¤Ìtz`, length: 91333})});

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
   requestedSize = requestedSize >>> 0;
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
    this._init = () => {
      return new this._WASMAudioDecoderCommon(this)
        .instantiate()
        .then((common) => {
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
            this._preSkip
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
      this._common.wasm._opus_frame_decoder_destroy(this._decoder);

      this._common.free();
    };

    this._decode = (opusFrame) => {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof opusFrame
        );

      this._input.buf.set(opusFrame);

      const samplesDecoded =
        this._common.wasm._opus_frame_decode_float_deinterleaved(
          this._decoder,
          this._input.ptr,
          opusFrame.length,
          this._output.ptr
        );

      if (samplesDecoded < 0) {
        console.error(
          "libopus " +
            samplesDecoded +
            " " +
            (OpusDecoder.errors.get(samplesDecoded) || "Unknown Error")
        );
        return 0;
      }
      return samplesDecoded;
    };

    this.decodeFrame = (opusFrame) => {
      const samplesDecoded = this._decode(opusFrame);

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        this._output.buf,
        this._channels,
        samplesDecoded,
        48000
      );
    };

    this.decodeFrames = (opusFrames) => {
      let outputBuffers = [],
        outputSamples = 0,
        i = 0;

      while (i < opusFrames.length) {
        const samplesDecoded = this._decode(opusFrames[i++]);

        outputBuffers.push(
          this._common.getOutputChannels(
            this._output.buf,
            this._channels,
            samplesDecoded
          )
        );
        outputSamples += samplesDecoded;
      }

      const data = this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        outputBuffers,
        this._channels,
        outputSamples,
        48000
      );

      return data;
    };

    // injects dependencies when running as a web worker
    this._isWebWorker = OpusDecoder.isWebWorker;
    this._WASMAudioDecoderCommon =
      OpusDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
    this._EmscriptenWASM = OpusDecoder.EmscriptenWASM || EmscriptenWASM;
    this._module = OpusDecoder.module;

    const isNumber = (param) => typeof param === "number";

    const channels = options.channels;
    const streamCount = options.streamCount;
    const coupledStreamCount = options.coupledStreamCount;
    const channelMappingTable = options.channelMappingTable;
    const preSkip = options.preSkip;

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

    this._inputSize = 32000 * 0.12 * this._channels; // 256kbs per channel
    this._outputChannelSize = 120 * 48;
    this._outputChannels = this._channels;

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

  exports.OpusDecoder = OpusDecoder;
  exports.OpusDecoderWebWorker = OpusDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
