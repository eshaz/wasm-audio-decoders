(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode00a0Üíe!µñ°L¾?µ|½î=MÏØÄ=M}_k\aÕÈ¢À¯2@G1ÚT6@\ë i»­­ÁÐÔø·ÛbFjÇö-ÈØcïõÃ®5¡ÆKG¤ÃçSf¹­îMÄaaÐñ­XlW_.óïRÒ­<=}ÕBjðu=M3[õ¾@¡å¯¦Y7RiÆU%d
{gÏKþw KØE6läk,ù!eåÌ<ÞÖY.e1¥
îù6³B\= +4¬,ôYÌúàªEFÙò]Dü öf7ªA´©6Ò³É$ÕNFéÄ°Á0ãå°åQrJz¥1çÑ¯ñ<09ë2ÓÿßDì|°³û|âa=M§iý\Ã>|Çdë6¯÷wv>aÇ¾¼¾=M^Ú{55=}wgcqvL¢\Më¯ýéèq­uÏê{¿_7Ëî¿z÷»îaRlÌÍÙö12úu¶^B692ÒÓÅ~<1NÅ·6>n9Ó§¦nÝ_3®~Ùs=}u1§JÕÙÁY¿W,ØõS¶é]uè6®YåêXo'tTÀ5G@@þÁvÃå
_Ú¾üN{î_ë½Ç¶S'¿îàõg]×ô
O\yçJI®x4Ê8|MPÄ9<îo»8N
ïB®ü}ª~ô= áÀuXÃ_îÿ#¤\~jÕë±¨X_JvÌ=M]á1mumÕÝIOù|pbáö"¹ÏVF2	vÈ$¤ý}cÀ<kc¦¹9Î+iNûo®xÜùrx' ½ñçäf^ëÉPëSÆu[x^õÛ4ÐÍw|4_%uðvwiÖO¹SÚ¬ZUyÿÕ;ÅSÅ;ÔhòJÕ®R=}ìPóO$ª7ÖÑÒûl¹þ|t×MvÌµfGöã¢kÔy[UaÇæ¼Sõ#5Ì1;Ò F¬87¹³¦hºæF|L1ÏQÃR|.æ>eèÖ{ô0W>Çb¶Ój,H3F
ßÓÌá[Y÷Ð¥ÓB¢qbÊyi\¿ªE7õ«ªþÉÄ-Éië¬Û/'ÄOWó?G4TS$êU¿ÚÞÍpë9ûJF Qí6
KÍ%Òì5çFj*²ÊW±cqzq ØìàÍ&ÂöÄ¬Üù, 7ÖØ°rºü×Æ+©58t}®ìpV#¬Ñwc¾ôeÎrô¿ üæ6Ï¯Aã¶v½ØwZT£6g°&òl= ãz­OÃÏ¬lQ®h´õyêß¤×{Kb=}ìQµ:	U¼¬/£;icà8CÊE0½L·![ýyI'Á&)wäbcÇt§Þe=}l§+RO}ÒlGî7Dî7+±ÃËHQ¼>[àc­ç@QÅ0B4Ð®oV\xbÿ8òKÑûºöuÎ«#l½pàÓ'¶½Í½ã¶=}lB«>,Äv~¬ËO´z;ÎÄt-Ñw(Ó\ÍC U¾Ñ%üÙãÐhôËÄÉÓIµjd'±[ÉÂóéòé¦$K]:~
ËF0[d/Tg¬kób#9Nj¬×µì	Â3ñÒþ]~gÆ²¶FÞ,äÚ»µ}©:¬V3mbh40\lÂÇõÒ3ºü¾¡Kpl¾= lêèKh¡Më]øÚËÔÁµ;A¬* 3ÿA#yO¬¶%æ.»5Å1g½Åøþþ9®|~éFÕoZj½x}.sïó.<cÅ?#S[Ô~Zq©Üé YdUQ9¡Gr2÷Ò>bb2bäñ3PâÔµ´Û	éC~áhUØÒÌz@@=}á>«fqÁË%&5Áº5E-e²åyPÍeí~ùõ°TPì/=}l"âp|Ä³WAè¹nOÀÉ¡+k}ðÒT_æ²$õ×AÊ"X2tHfïI¶¬Í°gºÞx|}!y·üëJ×£pR2øu­F±w«j#_0¿L)y¯wØ7Ôc²R¥e á#ú­wN7ð­ö@°¼~Ï(1=M¯ÅsvÓÝ±Ò¦Áué7ØiÅûyQtmj2¢Jë¸ºô¹=MÇl,ÚC0ýzð)ÊnP°Å$·®>1Üú^t¡«¸þ-j/<HÉSñhç®Ås£Vî¥ôä£ÎºBY8À46aÙ5IÿÈ­RÒrë$Ð
öî*õ35³¬²O:ô=MUÒ¸´Â²àO¯Ý«8Å®å¯´Ä¬Çë#ýr£ÌQOc'öQÜXã¹	IFØËÁ5QBr]/WãÒÕì»4iÉYF·´<´KP'ªkÖ'
Zøì)GrÉæ$°Ý¢Å0ösø¸§ómÀuÊ¥æ^¦3Øtds)n,ØË´®¬Û°ã><]¹¤% W{ BLl£SDY<©Õ´ÇTùõp My[U= ÌÁ
J·sOÅÛrÄ¿ùó2k{¸áEiJ¤±þ½ÏÚr9½æßEÿ«ÅÚö9}.°G@¼iñN=M'j¦9j×B_½Äj1oRåRHY¼ôÕSõÆÀãë2l¦ïÓïSÀ6íþ¾WÖ zX^ãQ|¨¥ô´l®ÎûàÜKðU$¤K.õ+Púm^²<ÂIÐ'SÑXÜ­øI=Mäµßô ôëî5 Ål4{ùåÐÊt¤>úN6}§FÚÞeùkRJùmÀ"»¤UUã¹»U·ÞÖu©aÂNÉ¹9±¼ òÑÍ ªøôîªz(³Xú ÍõfCÓãS³= ¾aÅfu=Mì= ñ2Ûc¹tìÃ¬(*h>J	áâû_Ê6±Á¨]_Åî,æ°$¸ çÆàyj²'©Àª\ÍLÓÕ rÃ¸è®eKó¿«9É@8Ëf2Xã35a+xíÔÛ~ñ©¸,°î©;xh(wPm\»yáßr/£vÜÑ¬¥ÉÛ¬AYR@Ù ÇÓ'gYÕvq\»¸IÅè/>L-ÕvåøW¢k×¶Wª= \!'ÕjFÆ- ±MW§É»ÖÂµù;a\«]6£BhVî½Ò>5Á·uÌñ5Ô5/n³4]Ñ¦n-D¬ShDEp5¦Rø-½;é^¦cîÒ¬¤kñpíÍÓl÷Ù|N¤NÒ8Å~|£jG§IRd~1Ãæ8BV-Åñº§35Ø¬Jú¨^^°<+m>xDQIR«UÝ¥Õ÷ðfF±= MG#cAdP®{:QCö G´Îürxô£%<Àäð»÷¡l¬³z¸%ß¼Ôß¬dc¯3Þ~#_3½So;{-'i {Ó¿ê>û}o|i3ßa£
[Mú/£nta¿ý]XYç¿ÞH·Ö BNY{îÞV¦ÉX#|GÍSmÏ×5ßbÉ¸%eî{¾vs)iD© ó}ëv¨¼Ã²Ê$â;¹i¥³Ôº¦²DØ¼Nãp¤c
Õ(#køR G   ã"ý+Ö¤ÃIèeKN¢ù©õeæÊe!ç
¯ÂÀò¨)èc­ûD~ðD~Ð~°IWl;Wä½½1Z~ü½Im1Z~|°Il;0æÖ5A©&2;HQ$û
0R£¢&òÜ{­ªdKDð²ªåj{Ü»«¿O¾"Äàdæ´W9¬I¿¬Ö4/Ù<|C¡YßøIS«Ø{ÜîñÃìÀ}Åñ0jUÀ£öpËïâ|#k1mü¸³+§yÀW1Ü@«¾%>»©{bæZ³Bë;= °Ç_bá¢yÛ_Ö·fdhÞ¡§û¯
ýOÛ[Î  Ð B bÜ©Eù^¥|Ìfd÷	E÷Ã(øE-DËÐB^æìæÆ6Eçî?IuK¢eNe-îPqèß´ËýÁB4>¹óH4fL®-»´uÝ½õFèzÈ	ÁÙùîÁ*þ×Á£zÞÉhùÀ	G,lDk-ðjO23@.= îÒýÞÿñöE¨Î1Fpxi:îFo9Ñ)áJîÔCÔÎxÓ¡¶qgiV¤oZ{º|B×e?pjÌ9KÐæðCìy}mÚ¢=}{Ûþó·XYÜ.Õë¶q¾¼OIâÔõñSï(Mëö´|ÎPIØqhS®±¨(vP'&vNÇéÉëÄÃÅ+ B¦= 0ÂÞÈAåÝ=}+¨ý}2ÁÏRHtÕ#ÈÃ{$MõÚI¶&K?~j6dW;6Ü]ÿ3[Ê12q·Å»nöôÛP®¶z5 õbÀc~ãOXê¸ýÁ ÑiE¢O&L»õb¿¸ý°Göb³j= wÒCô­MFÂ0(ÉµÉ-Ü=MN5=}íÉÐ8cæ&9®(VÐÐÔ+A²&\¬ÅQ¸¦;ÐøéÓ¬	ÿaAð}#ú-uKd¾Yåe= ¶Ðúù´IªÆX åàeEFñøªC:FFÖëôéF0Ë¥4¾0
§L:¾0ö¶þÅwÞÅ*Ù¾@)Eß¿A 'Å×­·¨c×l|×=}-¥a­Ñ2 ¹¾&lÏþÿ¯÷ÕÎµßSÔ"¢·ºÿÞµ;Ïñ?ªý«±¬f4&®Ñsn3Gç»ªØvÐ¢){8÷§NÚ¢wl#J¢J>&smU %ôàÊóÆ³Y´í!.ÅQfÍí	4VàGï©54£¡i7ÐÎ=M+kklZ-¿pplùnú¿nÌ*Ççò
úÊþô[\ÑqÙz·-q½{ËVµçÑ+ìVHcü&²êJ°ÿàÁ6^+ö·%5«ÐTL=}§¯ÌÿAÛÉKªÿò/Ç±*TOñ!ý´[
BbU]$·^ª÷C:¬;üC%Ùñ<mDâìkJÂýl?ÛÒ§0²]¿¯:ûiu±ðx)µÝ÷$Û¸fh*_òe[½ÕQIdýíT8»Å÷¥¹Ì Nè n¹µIá\§ÌßCþ®s­ð±#?Jö¼©IcèG¿xGT!çüp·-7|¾.Þ×é'[5ÚÉT Õ^a8Q?­mmW·ö¡Å×2ã:¦{-c0äö8ÙÛgllÜSØ68QJ.9qÑíaÚò õ2^9Kþ»+9ì¸²mÑO!Íþu{Â%²¾7c$¡¯	ÙQN«¯úJ^½SùyµåÙ´ÔÿcEiÉ'ùÜW^Æ= ÓÝA§S=M2/ù6(+YYú8 ¶|°,;63b´¡Ýd=M±ØUüÏlA .(=M<ùNµ÷à)[Â6iOÐ´pÙ>²Ñe;ÌÎl<ÈG ,(,ÍoµF»p$W(H\%bÄBäÄ,Í:VtG&UªªxÜíú·Zbq@ÆUÍ×Ïle êLC= .É0ñwRØµ¿ ÖÍq4´øV¡è	³mÈÐÿ8Å¥	+®Pbì¡ð¿
R9^ÂE=MÉPU¸Ë¸¦{k&a.7PS	¸Êÿ½k%aòc zí&ÆIþZ4X)Ôk÷JÏo~!ôý£ÒOTY¨kÜFºÍxía#Ü§0X=M¡hÝ¿P6¯úþÌ_ËIE¿IÅ0¿2Uñâ	kÓàû.0Ð\/@@>EÆúë<gH¨¤ÝSCÔQgüEG&ôÚ´2ùSÝ°+d.·¥Æ«lä­¦¦Aøã[Ðg¦õI	nÙ>B,²Jùú ^8	W´gVH=MÉ%MXí9<¹6Úp;OûnÄmÕþîþãJÜ¹j2ö¡aôü·éëIK¡n= À´Â³tåvu¼½@m.6ð{¢0d"¥oÎ:AãxB´kêäSð§àcÚ¶9ùê"ÏÇGÁõ¾¯Î?ãøx<¶ñó£<!áÈ6
½õÍ÷	_´4øîD0=}ÈDå'=}¶mÃÌæ-Qd×ÂwAñçã9ªó)GÔéõ­¦¦Aø&h¾ÇM¾@º¶Õk3Ë¸úà5'ã¦6Î"@
¢5JB¦Ø£#ðL%hÊAGõzîÍ
ØÔx&@fÀË ÷aðRà0-Â jÒ±¬¥ÉöÈvæ¼Í(ÖY,Ñß÷8Ï¾Ñ¿ê²¨2Ñäù,º¬¬âQ®Â·	jbK~<gâþ¾Ñ»jGËlµ)#ù8Á´Â¿½´_Í$Q:ÿÊlGæl'²¥",Ù²6 c·°$²rÉNhº.÷åÎF I¸;$Ô}>Üo
9z½{¦Ä¬ÿÜ­N=}Ñst­N;*LIqäÌ\§õçîµÕv³ÆpÈV=}t|±ÆV{*ê#°ØCÏ9û9¨ì ¡üðÿ³ÓÊ;Yîâì],OýuéÔ×À»fúh§çJ,Ò¸Þë&Òµ¯ÂðíþWÚ	ð7.*b,ï±¢Ië°á1çk¡KìÇñÕZæO27iw´
ÊH-ËÆOFä8){¨ÝØÿÊ9Õ	ò#º.Ãô bfëA:Ò^ËªÙÔÝ°F=MBxDòrhûÒ<m»IYÍ¼'?j±x?ãÿ?»#Ï¾wP%kq»
âæÌ_&îÿ*BéÍç#~k³þÛÄÝå§ãËoa§ß!ëMq§ÞvûîÈ±{§Þ9<»Ó¿¹.ÈÎ+',»ô©-I|#mÂ÷êüûkÇ =}]NySÀSX2;ÒºNó%0õ,^3ß»ì44-Â¼Õ©®3¤	ØÈÒÓ¡ïÂþ1'Ëî]Ó<z÷¹Er}6ÜÕ;AîÉ~»kköÞ	q¸wmõ¯äsË2y¬@hàùv²Q=M6þñÔ½ü[§ý§¯Ù¥:ÕH^ÅÂâ¦?X»Â~kÌº8­;6çòÀxÄ%4nò{ÙÀ«¬<,¼E¹ÿ¸>ü¸ÃòÞXÿ¾¼?{ïù¯pÒÐúëcÉClñHü:«åÍÆåæðf>ÑçÈÄR,û&>.OKçÐ0£µÎûjºü!HE¸Ü¶°ùÅ%¯á÷ÿ'9ê¨"Küìq»jJR Ö\nÊ¿(	 O :]^TªwÈëQ5ò
Þ5övæóù]>£ !º	íXpÅ<qw>ròùË=Mhå¦{x=M|ñv®ëKÈ¾\ly>â	ÐÇXå,¾ÜÆ¨Ñ.§lCpWÞß¢©)oAÃ÷­gÞ|Rny÷;®80<>_ ÀónNOPV~R
¡9Qn½ê½¾çn ¡dh~æ^f-ÒZ1ÙcølAauE&2ÈªoÏ¢gñ)¹19kKRêÅIL2häæÅûVåV-ÃEP×ïsëÌòk:íòµ-@Ý£UÍQ_9Rl,¹úï?§s¸ÌºÐÓÌe«xÝÍ6F9''¶Oy×_<h\Oê
IiN;Q>Ødn)x³ Fíô/sþùAáÔÂ¥ÓU/¼äN v¦­g3Ñ&È3\ÙUÍÙåý·Î^uHx×ÈÎZr><ñåþîg~
*5Â;'ì?ó}ù³'³ÍÝ6S('Í8/ë"<GýÓlpÁ.aÛnEgeñDi'@a@\õ~¥¯Ôó®è×§Jv.\Ñ£W*q,#¯j_)©+Áñ*s±É£ ¦¹¥z¨çò­ §'º2X¤Uð·Zx±&¹*4%½íË§LCiÜ ázbÐ	Ñ+6b¬!Ú$SgìsÆ(Ö^Õ%}Æé»½K¸Q¿3l= èÝÂfÉô,E=}tì8ZôÚâ®?t%|Ú(ÿ9.Ü*¸3ÞÏ7xð4É'q 'ìDy+r-Déôvy7ÓÊC³_aüâ(²¹w:£d+hâõtª#m"ÔjE/L0£eÝh?È¸ÃpÙSêÉSî÷xÀË{¹!vÃ(fCzÜyWÙ*Íù\qjÈÊ®xØÄyzþ ,<Ñ°ô§Ðü ô$ÕÃ¿§649÷W)j+~¤~ÜÚ>øµÚp-'lõ(ôÀn~î÷õ<}*Hßô'	+v|È)+Éx66,+'DÍ2-cMz0¬­µJÛÛÿ\Åoh@lþdNQ¼ËòØuJ~8ÖÁï$VÁÂH»E®J*G	¯l#ªªÁ%¨Õs²BWè¿^§Í.Ü²I1>ßO·Æ\ÝÞ^%ûã~MÁÇZÞe{§ÕÑ<pÖrç&b=M ëô-@ªïz£Þèl w/3HË1<9¯ñÀi¹Â9¼üEú2Ä_éÃhÿFHqy!ÖæryÄëêO2ÖÉ;ÂI×åQPï«*§ûÃu¬DU]VüQr¼,ýÏónu4¦)R_Øy âw#ä¤ëá³ðÔ
.^Øb=}¤õy+0#o-Ó¬Õ(·2ò´fÝµtªÙhÉ%Ìâ:Õÿè ²ì¯ÝïB¬B))ÁDbÓLÐãû[ í?©êÑ=Mü"±#BE0Á]6¤ë<1È[ØÄ=}WÝõ½®ÀÒwLxÿÜý.¶à@6<ìiô"= ó/
4¿¹]ÁîzCZÕ Ø{S¤ÝÁ#®ä'ÃÓë©k æxÈÀÁKð;66o0lîmûÏV62")ÁQw^Z×Üi÷ÿ~ø)überQe¥JWrM hëÉ§Ø\¨oOJÿR/¼þþ¸XµÈeJeO *)îAJ¾ai¹êÏÁ¤/ôÌW:Y<ë@Y/ÀJZ8 S¾
Ô²!Ø²%eK0ûþJQ×Vó¯¥zó6ö±Áw;',*²ücûªæcýÉð±¹1+ÉßD¾èø³·©[6°­H¥Ö¡wiü·XI"4Mà ëûáÔYþ²= rBã°f0cÄF÷ÑJÖktM yA+VBðqG¶öòü®Öù¼(<×'¶4FY©ù±¶iì=}×ÑðéïÐ?Ý©,^"¾w]^Xuö^O;Å¯õb/¾þÜóêuVâ{å¾¹Rc@>>$ÌyUs5*ª#»¯_{Û}Ñ4ÑjãUÒR®¾XËûAGË vÍGtÎ¨Æ«>Xûy.$[ v5¨&[s§4hí~êFì9/YPáî¤°6%zÌIPÜQwY&j²æ¤ZGò×ÿÞË|ÿùsnê2WRFëë	§o<ÿÂåcÄâ6ÉD^$ÕÎClyÆ¬Ò|ÂÈf
CrÄ~ÛøWdªcj¡ Jô]|ªpë²QB* ÛÀêH)Iü3Üd}C}Ì³ìóK{øÉ¶äZhUÄ«×©]íý¦Ç­?Á&pÀÏã®yÖ/T+	J¶V3UÔJí·1Wé;°u]èÚÐÚ_~qxÈUX¿<ë¿|f= è&Md¢üÑ-nçvÍäñyYM|ÞðMÓSÝ[¶iÀHP Ó°kÆèø)YèÒæZ²Õ¯(¤+VÙk¦Ð)±IBM °1Ü:ßÄ¤TÉ@ÍûAØ?1P÷ÍK
£w/±-»RV¿yÑ³v±³ã:å­1èÖëéòËo÷(h6Iâ4LMÉ,yüwMÇB3¹b,ÑSðP{a¾YZÒ*Z©Ï=}æêÒ·Õû$¬á  yëA)+C¿ÒZFÈYw+TûVÀë²º3&»£8á}äRG±÷7lEkôìRIb/ÉÛìêå¤¼*%OåÌÁ(t¦7Fónµ¼-:Öaæ*ýó|ùL&âMô6Èã±Ôc(*Êø9ëÈÕCòÓËXåÌ´Á(O= fÇàòBF»^4¬¸ÒV?d¤q²>Û
çEëÎUCÒ~þgôÚ>ï­±KÚVRwÑ~þ§.«¼ÍïUwñÛÊózñ±£UCÛõX§úô%ñ,°*n¶7ÿ´#+ñ?çLt+°I:
c$¬ùÒW7È×\þÇÉTÍv:lbámk= ïéËy°@F+8ÕÂÕÍ©Õ-îê21HßÅr>Ù²se²(¤¯áp³Ü¤/¦¤/à©"çÅaCE¨áK¤/éû²<¸ÈaMÇXõö¯5ÐC¤/5þ-òxNnÕÆÚ²_°â¨»·¼©,¹ìZøÆüô×égôù±-è§5k\úúI"kRÞ»xgH@×aÎmàÀkÐ¿aºM·èîþÆB Þ¿-h)01 F= +év»C§íÒÅÝ¼¿Ý·ç¶-{d¿ZEû²bÌFk
{Ãýåk{6FK2¿hû-fF½y¨ÐÀéºQ%mñ·uû²Äfµ¾%p½r-Idp³IÇb= dO}Avö,GRê®,áµ¶aóRØÿ@±çÑ>ÕØ{zá¦sÁÃ~&?àNNGr$ó¤­®­ÊÞkÒ8¿qòD¶¼jê¹¶ú¹+çdú±¶¢¤LÏüªQ8Ç2múÆpÞM(ÿÍM®^á8­Xä2yÄlIÐY´y.áU~Ï±+©Äþ¢Q¦I{ÀÚôæS=}ÃÊÍæTÜæ^óVêDío¸£/7¦å¨
@èøAë¿C@¹'¬Üû¤},ìkh=}eñ-ÀRK= ò·Ã¦0òïq"ªÖãF¹²}éÅ¦¤¸T:á¡#ö7<°S}ùùG5^Re#òvÎúLü¾#ÑúêJ*Y -dwQãI±Ë°	"6Æê¢öÊ½íp½TôJFòé¸ëTêlº«=}Ýnýã*'>Á2ûIÎuîé³­9jUvâµËJÈÄ&ör%¤¶²8Ýµx¦¥0a	hL¢[úÊÓaIræb(Õpðõ¨i%w4~]Bþ«oQeHÁ2h¢ZòÍç=};+2øó#¼sò-
ô*Hæ¹Ú-*Õ
£BÒ
;æåºuâôôæ&æ%ºÕ+HP,¹-RºÕ-ÈûæË-ÒºÕBì¹=}ä=Mr8(jÿ<qCÉuGÐL~Ò¶¯öCFø¹UkÃCñ÷°oÒÿ¥-Rtÿ-úï:4ñ_iEñKéiÒ
/ÇÒ}w½¦SÙTºtðbcúecã9§F_icv$8+C_ì~y¸+¬P6})SX§gÞõq"Çã×´Ý£ýñ¾âïT,ßór!*²?¤ºÿblbus­¾Þ÷ô¿7)àö¡ewoL¯¢=}{\Ú_iâ}ç=MþÌi\¨ÊÚRÿV¾B½àlc;\Q!
=M«Q0Ô+'ZHÿæ°=MÆ¥Áoñ»:Ý±UaÅéNJí¾ZüH.»éÝVÍWa¯cl-;í¥ïóyº)'ãìÄë¸Wä×=Mw=M¤Åf ðúäÌþE»~&ìê.¿@ä;±·¢l%Û*«WnX=M~ÉD»´»Wnf;b7ÖºÜ[þR\åÃyókSã5Ì :Ttö´Âß¿ñèà._õ££¶F_^¶tmk6>ÎoI×e («(\äÉ-·Hié¾JÏs1Þ-6"	Ô8Î!ÝëûÏRÂÉNëKZ0+uèßýýêo*T6ÕQ[CèÔÿÂ¼¡¤À§²Ñè7A­3± ;èuhþ×Å<|=}³ïIóo»Ã Í£°E{âÑnïÛD/S"5B8ý¢i kÙrÎÈN±ËÃI?ö#$ÚP°t²@ìZÞé»ÏL;õ-m+ôPãê°ê¦hw@ÊL*æR÷:µ°8µÈ%-r6®ÈÊI%=}¶ÿy@¢¯¹9Vh¶ÀôÄ¸²©çÐ7_ÍÄâoR´Ñt@¯ÝªÜá·:{gtº±°é¸8où³ú äCÖÚîÁÖÓ"íW\|"ÓcÆE#äA5jÏÎT69J­ö"Ë{Ã}ÈÁ±}ëvóÓÊ:)ØÀ½É@|$ÖÉñ>:9àå|öëeêj Ê¥|ÁJeCÀ3ÜÇ@v£ers+BO#6$)¡ØSo6yßaô0%}\!áð¸ÆA.dA|ù:¬,Ð:3M{7ôó'=}À}ö6{4xgý,ÎÇ÷iclÈÀ/¸ek¦Âw".|ßrçLèÖ(¯t h±²ùÆ¶
Ao	Â,¦¦Ñ
­¢AîÊb5^º´êÛ±ó¿I7ø´¤o1ì¿BiÛ%Y )->xAÅ[?=}Ògu§å$ë{äãvÜq(Õ¯õÂnaü(Äx":/6ß¡}O¯r¹¢U±L¸ê¿½tBjï
=}a¶,¶æYÂ+Â ~¢¸7ÿ¿ÅtCæ½¯^=MèÆ¢R}ÚÚpã¥yD÷ÁAWÑQ¢¼¿= hÃ¡]YúèÀ^72ÀTÁ(íÀýôq¤ÝïáÕ= òQCòÚB;èÐææ(J¨çr|#âö½Vôy(.Wßö#~«êZ9K'l$©ö©ø÷§ÊIÑ£öÒEQï«8vþEN²ª¿º¢ælÃÂ	ýÄÝ3leÛí²÷õaÊB£ÓeÎß×
í¨èËoS{ÅKxà.ª°zLbõvÐÕ%ÝJ)<Ùü=}Â8<É0OTbñcóîÇ£ï@8×ìÆcVÜ%aÇ=}íxÑIëí#_°,z]ê<'óiA=MtÍRÜ<Æ]ãº.¹	[ò­öEGEúÐ¡ßÝôíîôa¦È
ßÄØB¼ 6K×rbÕ83|AÜÜì³·jÃ¯f«@ÿy÷ ¸½þt8?\­ºSe|±d$ÎÜ,d;ÂzÝPP]ßéÚD}&YBã3áú[åO!äí.z/Ûe9ÆJ?PÚ½¯ ëÈõßÐÊ¼Ï$Óh·4§,¸Âò]-KàY¥%ËÙõ¿DÃ.s¡fr9ãüÚ	7º%o¸HáìMýÒqÐò¤pQ¼Ö©®ø°c°°£5ÀÁ&òùcí«7(o8°¦»ÒuúGÞi5jvù¯ôuµ0x±ègízçb&ôÛÿ3Öf­DoõÃwª^;Ö³ÐkÅÔs«ä®vÌÚflL= 0c*VDBn¨a0IwO¤{à¶HÐGÍz\­´tßÂ×ÍzB²uZY·Sä>m»ÂüB?À6×Þ)z}µÇ#gA	ý9õ²Ò=}4eäÏwÓRÆH½(QòoñëÑn)%®æÚXª=ML±¸CÐ2=}U|ërófÛþ ]ãB¿Ñ]é=Mr¾Âôê÷w$ÈwZó~¶WÆõßBaM iê,¨|{Õù«9{NER´]¹0²¾ÑwBCáªúäÆcOSâá'â\Hd<ÊÊÁ¸ÏÊQþôËñ©<ÛoøåÅÅÊQEHdâôbøkxÅäÅ-ñ)Ùõôò~¦Ôï±5ÔôôbjêÊÎÎý5Th÷òóOYâÂ¥ý{k÷bZeòRDúªôéJûßûËãYðÉ·ÎíYðÉ·ÎåYåYhó.µ-¼Ï2qÚG]
3EËüe?µ×mÑìëÀC{^!¯¬djÕ=MÄ_]Û?}ûþ12ß0]áøRO×ûÌ-öyýéãúÎÁL³þDíÄ~ïqû&PÈìÐïå<~µ=}nÎl7~¶Õðú"Üµµ#GñþÕU
$PzËSäa¡ÊOñYQNàXâjw®úLÿXU;Q'rq|¬ü©0Ýû&¯.iÉS´F¹õ"ëY9¦"õ3­yE´î®¯âwµy?Ü
 å*î?Å¨TéµâåêèBiÍI´¯*%O¼~ÒiDß/[*ZÃvp¨X´Å»Où¹¡%O^fõâ§|P¬.ûë¥S}H×¼>¡JÎ.C]ò¡íHø©+Tx.?ó>2Ì+Òb}ùóiiæ"!_é;tæU'«ä= êIYé?Es á&ßE¼¥ÄBÇGÇÖ~Ë6Bd= Aø¥3¾}ªÆ1èôµàãì+;ÓÄàÛûQ
ïFÃEG^Ò{ø¸7YºJµw:Z
NG¸
ö;;Í¥;Ø^~KöFæììjd4êmo¹ÇZÀc <a°ÝKbòf<¤¹âbw?°¥=}JÝymÈ[i__Ç³JIå³uÈyàOÖÉöÏñþËV:6úí¢;¯Þ
ÄÞLVfÌFRÖØBýL)sUå7&§Ô=MYU7M:Ø=}	/¬ëGù=}NZ?TMÊ
B¹|3Ã]Ã¶Ó6íñv4ë§°ZV·õfõýYÖMRÁÐQÕÝÙ.Ìº¯Q¬¶m:IÎUy7xçx7XÆÐf)¯JX1ÃjîUÈÅÍ|J1ßÃé³¨ÝCöv©Ú2¹þrÑöw¦¬ü~èj!gX+\ <= Ì¾½Ø|vçÊ«¼Ùõj¹¥â¸B^öªød  }R¹=MÃÅúàÁzm{ð.N¼tµZ;}:¾CÐÌÖhU»C= tñ×)>{ùÂ¶Tú½lÝµã ²®''?£úªÅr*&Ùl³1T6q= 	H¤.¸ó;4þv1MÖ°»$Õó= %tçÏ¾7sSÀêx«án¹eÁ)'F6èlòÕ^nÛ÷r÷½L$ÿõûU}æ^þÆy¾»= ÄX_NÃj³%J'ðe9BýìØóº÷qN#:Þwv­?ôãcÿ7ÁÚ§åÞCè5BhÕõkHy÷s¹nSæÚÞ9?´Ù¾Pä= tFÄ%Lã@a,n¨Ã·rQxO47aö¡CÉ·ÂìÝÅSºí·J[A bÛç	fºÒáOGV
ÿI®ÎÕÉÂtk9I1ÁµÊn¥ÿfu×m|Ë'Õ),Ï¨/âÜFûh}µ#³wvÃ
b£u^¼ðökPôâ¡ôI&©«)åi?Á®Áxé¸ü3!Îí°%¥9æ&ú*<Ë¡¯ü{ºeU{¦<+°zZÆ°ós¡Â¼Â{Ú¨.®ßÇãR©þ
®oî]YQ¨t1x*iêCÍÒ¡G|Ã-ý8z¬Óááa¤UuÙ)Þú2 :6ÖÚL¶¿ýså:$KE£&^1Y®¦ð¯ <1¡%Ômãúó}âI·¸Ê×ÊÚ"4c>XØÛ?Ý®óX>ÒÜ ÕÂZõìê·ô·jOò1>OÂíMý³|>>Ï{máZâVAOâ_Õ¯ïy:'x:ÆÆ¥´Æê5CúÙa5pv|±9«Öj>Ýyh»BM1X­pY¸í¡¼Ïâ/hØÆ@TVèü w¹ªI¬-ÙÐ?Vz}Ä7=MÖdÍ¤·=};+h=Mào¶Ðv	ÃºÞwä£´æZê^	f=}o­tw?Ë\0|Ý¿Qybûé&Iÿt= )ÓÆÅÇPfñJS=}ÇÛLN¨{cÞ
>Mïµ~±dsÕ(,½ï ¤¤<ê¦ð2S+/¦wä½·å½«Ûï|1Ò6"È¸í¸ù)T=}äîè<¬\F
Pµ£Üª#8ba±C¤ï7©bbè¢2y	!°ÅOuè°ê´7ØõÒN¶d}î1ÛÿùÜi{¢±V2£d7èÍTú<K}k§ ñß2oFËLý×ukå&.Å9YçÙTèYýþßö©Tÿvè²;¿ÔÒfÄQâ©/2D!ÊLó#·º×ÚDN»¡/®©nEW¶¤ë[®éUW¼ëý&_ÑXw¡Ð*ÕZþÿýø¾ÒãýÃ¯*8jk+~Ý$o¸Â¨zÑ	Ñÿ¸ÙÊ¥<¹8ßæEB¿>¼±= äûÃ¢.è2ÓIB]ÎÓæ:ÄbÎÎ¬£:¼ØÖ&:³ëâa££ÌÐ^©¶$%8qùë75¾'ÀPá)#½faÍûcv*T^èû-? KIqE´³â>Z¦y¡lØ+±(!øÇv\¼-²^Nq×@§÷h-yÌ"Î{z«Ù&tjé/çèièÙé¦T;dèöìkåNÑµÃO;§ß·°û5÷q ÏÎø/ènL¶ÿ¨*¦ÜòÕ´kÒc°g±kS$Í¾¯ü$xÐ
ï£5Ø»¸x7Áµböæ|¶½= Í½'ó¶ã}àC-	«±ÉÄþK·Þë¦±Ð![dýj0t¹&,q}jÄ¨ã£+3=MjÄú4ÑÕ©/´ã)-Éá]tù¥¤´ÊØiíyÅ= =}súA}ÐYçh½4õxG]!ï¾Åûî×YJAÅ¯ÉdÔàr'sÌ·Së­vè)ªBo&êú¸¼nòJÙ[YeåDgP³¼Ç ÂÏålà>PI¥"0ÃJa¨ökVèó=}ü²IwÉò*èmZM»;y$§J¸>}JYÿÉy·-¼ôëó¿ {Ò{B±ª>O]nÁ-Q C¿Ðn>:"Ñ«¦åÓWpcMÊ^hGh	~x(%&ÏÖ I>Þ½ðM0vÅ
hAÀú¬ý¦¾ºühY6}=MM¬aÐ¤¾k¼ÎÆÛ¶ÏÍP/ø½y[yAõê³Øã[ô×FSO<i[e×(ÉK»éº"[ÍlvéâîùL»aBº51¸hZP£´g±ÝùïúïT³ö°FXÍmZe*e¬ß	3¶.ê¹>òáÁo¶{®~?þàòªî0Û
¥FÖµÂA5µ #+sÑ22@×§ ºmÉÞlÏ9îöK0DfH'ÚvX03 Y(ØöuqfUDÏA8½P£òWÅPªèPêº4h¼ÃlqöWUÄu7 vbð®NRýØmèj"[mÔÉnZü_¼~voö©63ù~-&1 Ü¯3¨BétÐdÐ¹*¤î$D*iuS_vIÆ°tIÁê¾­K/ö<ò³Üd0E{ºX7=Mqa+èh «&iH¼ûý"[YIpavÌæ¬­®ÔÎñõíW¼cÍíÊ©z¢ÂÂXRcðûuRtì©K@x[¦¥«ûÉ»IW8L5<«©·AõÉ=}åWm 8;dF÷'ßEÏÒ¬ÿüßN·Ñíä~£V©5²þKÜ±¥tá]DZãcR^×kï«d5ÉXmc3Uì··|Ì9~ÝãÒHbá×½'óïÄp»ÚÑ»5Ù3kUWùvõQu¼±@|ÈÔßyU?Å'&nY­=}7(,ûÏæg÷P¼nÁõÙ«f7 )®NVÙ«ë&_Nöl ÿþTh63¸Zj¸øÎ»ó¾ûþTå{zXÑñ¥ê°81§i6£ÛMOafÝe$zû©;còå®áö»5dS#ãòåCFæåñÆsÜZÚ6ä!{tà>4ºu0ëÇí¨Üè½«çó§DmøÂ l©/loq¸9]{}_8áÆÔõµoÇ
ø¢ôÈÌ= Ý&¤ýcðJ¾q¡+VD5½pjv	§m»öM:kVémN}\VôMÿþJ|£öqÃ.ç·Ð&<ÆR'ë_ô(jþðÇÿ^uR¹-Y©Wïd¾!ÑõÊLQþ#Ö;äDÞ¶§*>|"?QMÛ¸8ÅNÙ¾Í{Þú{S8¼è&¼³,ñ»ÿ*ÉÎ¾|R"¦Â.°Þ¦dPì5U mVÌ11Ú¡¨iJÍ.SgwÐ)ÉvÀ?í-gÑËËäÒà Ð:·¦ÀÎeÞâiS(@ûÍü|8à0ç8Èíè@DÖ-9&>ÕÍBI çÄñ	Nÿî=MØ¢<ýCâ×·*jZ]1P;ÔY¬zðÞx(i/c©C>(£S8d|iXü]0RUbgÖûcÖèh@w¿Ã¼6Í<¡T´= L¬àkQìÄ.Käëù_(Tºü7æ,8öüxgÜ 2A>Å½äqk*Î(ël;-Jåb(©I|â!ë|¥Ã¡yÐ¢»ÆÕÖìh&kükí0¨B7ävz.#á(½g¨Üv÷þ7CO@²S©FÆ=}¦~Ï¸w2ÕÏg!X¼5<xr·Ëyvë/SëyTãÀàe¡(å" Þ	åïß{Üâ>ÒÑnÏÉ·oo[çlI3âîæã­Î¹îäyzä[(¦\-0±fÇßÃªØûÄÌiWò©Ìâ¶ôíg×úRîj¯'ÖI²¢±1o§E¨x÷ÝPñ­xô gÂ¡&<yïô¨rüå
ÃàBÔÐ·Ð¯Ì¡áR±µ= ¨ò+ ç7 P¨ üÅÏ9 ê2t»q2LóÈãÃ)/Í9HnÀ@ · 
D 27øÉ}i¦ ªiJl²ô ?ûÙ²Ob[í¦>yZ¶õ{ã$M%ôÌÄ]T8qs¨"ÚDÎc¿d@#»Qè¡|ùá&³"¿æ¶âvR²Z¿Å6/ä6IÆbÈ1ÒÂg<5Mæ£DÎSr¦;o³ïµþoQ¶[ ¶jxR ±bs§~S¯+_Ç¡
1cwË@_é·mº{Úóí°9¬Ñ±Pøþ<ß'ªeûñCMzí|$¥ÀãeïV ¾N¿zýb®fq$ó£GYús90§ÒPå¯2û×ëy;p>|?}L¼¶ù¯*ùlîüJ*Úc#5ÚÌxÊÏ@D¦úäLcÁr¤M w®Ù}©EÂa×YCa'K<ìj¢âÔç:¼UèlEýqæf*§K<¹Üeå½ùÓÚ!9èËqÛÓ¹ÄrJJ©QUg²}ú#}¦Öò+É¥<Ü6eÐn,ÍvjV]x= D´ ©2= kã^L7Z©(t|Ø×·cáø¸×:=MªÄr X&Øî±ëÃ,ªð½ª;\6«üfo5Ë1ÜÂjâL'S×å¤vuH81wí= «yQ*5Îõ=MIß5¨.¥<ågu;gw¤Ï:Á^d¹5v%ÂåM#z"Ú³¾å£=}DXÔS*7|t5"HDrÚ8[ZTêöï@9 !LÀÚ8Üôg EïÈòÚf+^ÄÒó
°õTd U¨ÈQ}C8fO8Ã*h8nB8ÅdÐ!·cì>#¸(´Utép#3SçH2çðÜ®y^O¨ãÏÜ=} &§¢>0td£c õöÔ!o¸­,ÄÕ
ñ½s@ÿ7´æ=M°ê?Ò×qÙ!Y¨$@0ýLê*=MBÑÔSU8RÈMû_Ç[¼³0¡@¢ÕB~oq«XÙ×o_Xô\(/
gH!×o@
Ô2G»åã§éñX¤4÷hZ~òÙ |Zò8õ§è;è§^©Qû§ÜÒÓ¶X^JÇË pay_á ý«ëºrÖè[ÂÉ*wjå\»7µÿXð$7Åãµ/U<V3ýÛH0aöðèn'Õ)v\ëmkw^J·PÔIÜèÑFcú£Ð÷Ö·<®ÐØ=Mo@¸3Iþæ>ié¬p=}Ü2OCû[7y= 5£ÅôG=}ò²±?¿Æ·XUÐ_fÊÿ«¹dYw5&ì·¯yÜNÍc»ZjQ Í±s>{ÝÏuÞã¶Gÿ*á¥¼Ï®PÞq»}Ú×|hL×Q²zÛãÞ¢ke'Û¨gm=}2õbÏ/ Ðú^¨¸æÎP :Keµ
= ªO
©P?YÝ[º!REo¤ÖÄàI_AÇïðÔ^tmBlB÷ON<A÷hX½(äA¤PHINÛ<õ[AVìmV~º}ÞöÖûÆw¦Ì^Þ;V¾û*ú¦6þï,ÝyV~à(W	V^"mª»nìV=MøÂóÂ²
«P±Q$³àUéùyLH°:S&Qù=MÛ/õTmê6.ÔLm*·éÍ;5»
ÀdÏuéBDn4Í+÷*¿Åymfw4Ô!ûox×Àºe®ºVz?HmÚX¸5¨4 âñwyjÃ0xË08ÎiØ¡ÖÜ¯ÿ:»I]ª÷tOÙÊUCò{/êÐwf84-Þzw¤Óh×®u\ê6âù¤ÍôU+3ÿäf92Çsk(°°á$6íàÆµh«:eMù{íItì¶I WM×áåN¥NF,èeÏe¨oÜ¼°yªBÐ|^9ãßaùXmÓZ£õUzÀ½â^+À|=}W!LãPXvn"ëá1nÁD!IFM6K3äkòT ;À]\òcÅè_K,ÁóÈþNöä!t2ÁnòY= -kq¥aÒ£=M)zI¡}¼±[v4ëÛ]Ü×<Çû©;®0Éçú¥qvmFxß×éC¶ÝuÏ?×ÂCÎ·Q#ºÂ= ÂòÌ¤#)sY·+¼´GWç±³Ð´º-S?¶}Ø!ÊVó;îò|Óÿ¼mÛ¾ýC0DwªñÕ+Ùj\jÉ¯f>uÄH½Bí¾ûèÛò9ÀüóÅ´ýÝEd>ú²;{È¤£çåôÝ×ñÚýÆÕq\yÓøæëvËíÈÓÝº8ú;êÛN=}à¾êÂØó¨%ö:ÉlHM'Ý8â¿Bf3pÔÖÒTfÞVÉ{0ôBÐlÍò§øI¿¿­Ôþ§		*¶Q´m/j³q6¢zmÜGY)nLúãÕ1Õ7[ÕÊoò{{Üõþ ;×Ñ?lÛÖf:ñÉñ<ÀJmÙÞà(íå$júÌÞíõ±<Ëò®2Ìp}À?ß3=}ª+%$yaË/Ym&·ó?ÐêÔið¤ ÷Þ¦>ãÒ=}1ËÂ¹³éwñÌ)VÇJò\­§©ÇÄ²êdå½?tËø?ag0ñÍãQ~ ÃâÒúÊýPÇúé]Éz%p×â~Ä'å5fªPY"»R%@ý£+&à´­¬5cwíó¯v/7jÇ59A~Û Kßñ£úµ}<µ£~wT¨§¯¯ì¾ó¾©G;¶Kõòùß8%ÊZLÞo= «@p´C¦'Ìõ±KÏyÄ£êvN"ÑP&Ä±
æ1
Rþú}L¯Þ.b(9r¢<­#2s1I3I5,MlÊyÔV$ºmyËÀÈÌV=}íaæÞ÷ê*âXéwê8Ib¢ï³ÿÖq	læ3ÒAä
súÝ¨ÙÝ§èu%$?ýìþé×aÜ+B^-=}3;_Ûí³mÃ.&*³[+°W{Ö01õVöÇo|bUl_3'åX½®óu7°¹öÔ©¬¨"çKÂ.°°'áªH&°ù"ß±9Ý ­Ð= [&]mC}2_Ömñf"¯	¿2zjNðcoçF^ÞÀ®ãª4®¹÷rDç?òNÜ®Þ«k«wâzivÌLósaüõîEgxS#SsíCFëù#±m\buÿbMõ}9Mõ¾nÿ	5üãÌ.R1ÔÑ~±ïÛsep°[÷Ð£ÆVÀgxßâ¿oºö&öz²5Ù 2$@)PqGóS¡;°&5ú4ÏQ·æ®|bØqõµ§ìüþmK@¤Q½îÖ4(·v$Èî	=  ÒvI÷CðÕ÷°Äªûa¯aVÎÚ­ªoûëàGEÂ5ò©ø$²Üd|nRµö:$¹+q8a\dÇØ&u§¾¿lQðÑM,*RèiºÙªáÎÞÝjn²Lè{b¹§d÷A¶O?yF7¸]ß©;Q^89hãw¹Üç0¹7p[ý&ÜL/{©ßÛAÕ!^ÌEÓéÑÆw.-¦+K¬-ÃëWXNã9%Vrã}îzòÄWÇÇn*[£ýXÝ¾!2ªqËÖ}=}×ß<XËo{E,BM=}±Ò ÆÆ72*riõøë¦
ÈÖÍVæ«¨ÒðY¾ÏØËSaº5s"_jÊI-õw]½a-øáh?åý0%9uìh÷¿þ?_âQ )ÉÍ¦Ð¼èH?= @2¹m-+VXN|ØØøMOccc5
sBØ±s[J|õ¸= |%ü½F¬}e+'I¨¸0maûw+W|Ø[_ê?ÿ3~FïüÜ½NÏ_X¯qSR÷^ñÚ?}wÞK?DÓÎ©ne|ÌöÁ«ÒÎÌ1ÝVB[ââä®E/*ÊÉºe÷exImýýC:Gz?fcÎZûGîü¢ÜS8'ó°ÍTXØ@é=}ú]j=MùpeõZ[üÎ:'ýsùr¨ !¾¸¾Yld»9Ä*[nâtg_iOý_=MwêÓ|KT¬³FÎ¹´O_duNãß¨lgTÎl¶è=MX*Aû1P-xGP»ígÆ?pé;aÓ.øè:=}e=} /w¿ûp¬Â7^ÆCÇüìvdµ6W*[è°Å¹ðE\{)äd-äkg;¹o{~Ï"£qëR''3±Ko_XwÿZlq¿´¿pç= ¼å÷õ³3Ûß1µ{ß¯c"÷¿À´x £kÒ­û$­¥ü¤Æ÷¡Ze´äaÍò [¹¤Nd*J¹1QN¿îÊ¢â7¾^}|¡¯bKàw*Ø±3<ª¤'CöÉÙj¢qÊqOÊ÷ErhnÜ/a¬c÷ëwªÍùÅ¾³oÛî¶_3&Î§w+é#G¸®ÞÏìE÷Q³dúTND«á¶ +ögEkó
F\+ÇXÁ|)Y$ËÊrnÇã{= $ñ=MØ¨uº?[ÒúÅÌÚBQ$¹Wz'7¦½íë¾Ó6×±ß}\YîÝBÊOR(*ÑE6£Yæq|UG"ê*9ýe%W¶=}½ùôû<5¦ZWßÏ±M.²m+§ó#þì´}Ûwz\Wý­SY2"Å%SájÀB á+#ØÎºÂîÜFþq7Ù/ÔãUh¨Cº¶IïÁ·Oc×oHBvT¦ÀñëÞ­[jÞâg&9éZ¡9v= v/g=MÙ7¦gM^p°õ'VyXS£ï7å]Q:-IöçûnK
ßz­n®¢Û¨du	&Ùr1+½ãçt?7ÿ°W¿ÆïLnëýÔ¤= ®¡PG (
 üH0Ñ&æÚÛ´¶ÒÓ:KNßÑf¡L6®À9&Àï3=}ñfMánÒmìÍ_Ù½þy°ß³§sØviÿEÿ[¦®ö}¯Æm<M·É?Ã±;Ýiàõ+^*Ý-ùÎ×r\©àí¯HéàI	_èÝL§=MÖnñ,ÚÚ¼jã_M= -wîÇÖ/_©ÂR|VßW@ÈÖñÔY+òjø5û×R_W¶^ÀÉû4¤¸1¤¼P;×¢°=}	Hk|.Ê_&?ÐÃï:ó¾ßí~C/?:	Îºÿ[C2¿&µYÍKÌyã°Gþ·ñT$iü+Æ©4ÝÈy\þÉgåNk]4ÍPÜþ9UW¢taDoûwº> þ7GàÃ?2/r"@TÇ?|·ï§8àIºøYm·~ÇnÜz§«=MãÐÝÆ¼3¹°:óW|²ÿq4°}yS'5í9?ÛïV¼Q¾öø!ÂsÒT[oÍ##= Êw}7ODRh^Ýª/ÕfEpÑûöX5È»ÿðcå¨lÏ¤ïÒÑu!FËK}Ø<¥ÌDùUÏ= ¦	Zï^ë¡C<FO¢ý9m®DÀ'Tª¸KðDå6¹8dÒ)ûVÇWÀ#®$¡ §hÈî NfêWºÉF|êÎ}bÉF+(Ë
A¢üÁÿþ­	¡¥:jFiP!|kX¾;è[À~zÞÖëãQx~LË×ÄáYíò?(ßa\ x-ä~PÛZ¨ ã­vÏ]¡L¾¹Joi=M2énO	¦ÈÊjX&¾pQ)}ØÂvÆ³w°Îà¼ç¢u¢km#ñ2·^í«ºÂ¯dÐúMØòµ}­Bï,×öpo	77ç mÃõkö¾-(kþ8ã¾]*Õ±H5&ËÀ¯H}ë|Ñ}¼3éØ¥'so¶4ºZ(\Ç×W dk= ªj±]ÝôÄ©é7Á³³¿Dtk&|KYÂVèàsgì¿Ò(Ì§.Õ? @ÒXÞ¬+\^GAlÛÎYz!gBÞ©«}ª¾·ØÅ3CÎÆíä<úáæx4Ë§W£÷.»~îÀOiý±zÀ_ØUà4Êz{|{µKÌYÜAç´¨¯´ ³¥xé¥Å©3+ùê÷O­]MôEë kr"WQK0¨v\tå÷e =}ò?É\õ÷_¬KM-1ZZdvÚ¼ áZöÁ{®^Ön´BöAÕeë¶ëÇÑé±ËÁÁåóe æ²$d
Ër)Ý´!['bÌÑ?ÄWìÒO-«ÁtsêI¶a
óti¬Ù!ïdÆ:|n;PD1Q*7q\Q·Zf¶Ê4I¸©mñqÙÜÍ=}ãrYÃÇøôsÎÃL|IÄòC{êÂçâPÄÒ¼usã}BÍ}ijQu]1ö,êã5É2"<BºîQtðÀ(ñÙò,ª½´u
ut
 Kø
©îñ)³¼! ³.O¢?ñÇë}û¢ë¿¼£T#¶ó[W
7[üs?#I1ÌzþÔæyõèK²i¦9úAû%¾W6z®Á:ö¨ÕZ~9û!"a­±Ñw,ÚÜ3º>}2û6þ­odo¹oÉ/ûôñÜo9#2Óðî¼d=M	ÜÛCDÒ¶kqßAA?|p0ÄîÿÚ2W¿3äV0,ú¡#ue\}KY.ê#ôDµ)ZLûT*RÊR>83~è{Ø÷aÜ®²;årmüvÀâ¿>º~Øë=}4Ö*çè)Ö¢²¤À	ûòa1lÁAbWucxÙN	Z)|8j:O±-îm6ÃÕV: óÞu:j %w;Qe\ëh¶ÍÄfÇr/èVÄñZ= #1åa¯«¿,J[%¶Æxh$ð§Åþô×l²Ëz8ÓR°rÙû,Æ7s&Nê¡¥;=M\JÝÿ¯¨q_Xò¿»Gì¯ÎôÍ¨=}oñùoÈ½YÂÀè¡ýÛ	mé©ðcß´x\l¤èM¢ñw9Ñ. ubÓ¡þ=M:kk=}àçUÞ0_TÞÈÂÕÉp«égs]läðûq,ËdzºÝKôp¹1\ýÄË#rý±ÂÊ;îO³4U	 ¢ÞD75w_²×æfØUÍéï¦Èw|Eg&òÿ;PÄTåjuðÂµëæK©ðãúÑ2 ðëèP<i6sé+
èL4CÈà/É¤9V¢¾óFµ6ZõXâDN7»^ñÜüùvf§²Õ-ø\S=M)wK7]!\áV>Bµt°éÊäeu²ýl_»	þ0= 5pe\ADÝùé³~$æãíNæäÆåü~¤KîËaW EåÌñS	Pf8Ô¼9«ÓâÔlßÄûl<N«í<z%ÆæZpäu%ÆnB«í4ýZ0Ræó&p©ã °!¼Õö¶Éeès"°£Ïñ5IóKÒÕò5IJÊóHª[¤W®ÇªA?SÅ>Þ©óÎ=} MWÔAº:¿µéÿÒz¨Ré + ªì]îM.iûóØò±é¥ÛHU£Yr|;+îÖÛÂ0¿çÚ J¼:ò.÷I¿Ì\>´^lÈ¬§§3¡¶±JÌ|	òLxþ¼e|#fNÙkµÒ#ÅUùå±¶s{èLBÞ3QúßCrÄwçÇ¹4RD¼'Æ!ÙçJÂÚÌuÍÈ
"àZÄ÷së<<:ÅFJ¶+1£¦s3wåohÜ K= /6é÷ÕCt	ç_Í)FîgÎI2.PëúQë¶262>­[´¦Ar­]Ü_Ö
GG.æ_oºô£ði¡H]d tv¡èùFÖø³òVcoÈ[Í³îks·1Æãcy±DÊá:Ã¤	ö¤	>)À2ÀöáÔo5²r#ñM³÷0i÷ luGv\OUÎWêHðý0
'9¼¾²´KÃUÞûi×$H³ÏN±µ\Y¡Ý}@½É¤¹U*Tf6pÙâìðá_V ²Zè¤È/².T}Ð<ô®øæ/d<üÍ:ixÞDaÌ}ZèxâÛ}Zì[ãàØ}'×
æN)kT«0µ9Û°mRye5Ä B¢\EYº¢:ò ôû%/i)þ¾ÓÆÙô·ß!HÑôÔ2¨°úgò³TÕ?JYÐÍ\kEaÊê¯'gf56ÚÍQa×»5ª±= ¶,¯½¹Ãè9­\X·3¬hÍ"È6YäÖ\&ý*ôÊCs²fÿø*6ªðjÃÙvCÌÏêB@Æï9nh%hÅ40SË/ôöËR(3ò©øîëð,h'ÂGÙ+þtù]xÖà0ÿûí¤É6ºÉ
Í£©ýKoPâòpðÂpÆö¦Íú±¶Q=MiS@ã»úþá.
T(¢A¼~@ÑÞVññyFHJCbÄP±·÷ôT ÈÖD=Mfò^D6¿*ªYÚûú¬u9b¹IªîhY¯æ<qÛº&!+?­/?Õx½~DG+}1gÿXÑZFnØþ7o~=M¢Î¿Û8hgý(Gx¯~!"ò%%3Pu²vsÐ,uN~äÄ±í-8²6êøGxO8üwÑ
]|ÞHV®~1×i¸Nga\~Îw8teN¸o%º¿Û¯²¡ÞAÐ×Ès²vuPKy¶¤|Ã°dë,ìÄu¸ó1¶²VæbfÕ:ù
àÂººQþ³ïéøB®ä(læTÄBE±<$Å,¢÷24ä/TµNà¡¡"x¤ÈMKÍ2HEVyÆpcUú=}× Z©t.¹Æc4°y¦0ÑàP%¾$õUèogD(I:$Ä7¼Äçô¸÷b¦ªbó\:(BtV*È=Mjy2~ÿb
°°ë7ÅA±}vó¸>NçFp&¨üfìtÉÜ£y¼Â8/¹¿p8¾+LGH6?KSAæ6r
ÅÁËKÍT?j[D]XOãí<Ô03@@bd½ÄÑûr>>uø0»:ÀH21&GÎI¨ÿr]~´^äuz@¸Âf±q2¦¹ãä§ÅR«7ÿ/	é	!uôZÃ¯sÓSG[ãKDºå%§Ò-Ç@óì)ÞEá< Û=}*Í­Çó4¤Æ,J\±³M°¯w² Îëð^a:·>3Di[ã&ÌÜègjçCÔ%^A<NárDÍÓÎ.ºéÑªVë8Nù´&ßÞs?³§= 0°
7ª©pzï½
Tã;ï= Ûá?=}fûd¡Jé0^dÈ©[ìÿùß,03òjbÀûmMöð^:$fúÜXí>Î_2bÐ'Bé£ÙäÝÅoîñEôQÄ±%­btë@³"KÙþ.ó²Ú3¾ìmæïLPkô°Q°Q3Õ!×phÆØ¼ÝÚ¶>ÔyX«£Çöd&²Xcí2üXÄ3¦qÜHh¤rÒ¼§5í°0ÜxtE?{5°®FoÛ¤#©5µ~àq:¨âQTææ¤ÚÁÂaÊÃ2(äþæÖ²(Îr{Ê¹3õT^:1ÚØü;ÛLU&æøÈÏjÒ<É^!t¡ìW»C)~Ì÷T¡¬Ü±×Å1ÉRíah4BüÀ#kÍïc÷FA5	°= e¦Òdr}U)U)&DøÑs2ëÀùBÎ 5g#F"MÖÍ§Ð=}}= |BÖ1bR{7ø|@PNÇ~9++k(È§äÙVè_®×É(
µOý8gò)wøí8GäHÕöcKZ"÷©Òã³Â±ÃáÂ1q,jé>¡êé­E0ÕÁêÙìÀê©ÏñêÈ-YFÐ©×¼+»´v´Øéù¼¼1snà{¤ßÊêt¹iVÄb°bÇ^UC%%»º¼ºUªT&T²°cSÈC'Ï=Mö@ñõÀòÑÿ!@¢üûé¥²IàCL ¼æ¡¬Xz+sï½¼ { ±°ÿd[Mä$ÛÕTcAyÉ[ø4î­æ­Hû&UyÉÙOó\8xKò5OÑY¸ðm{´TªyÃþ«*Æ¯SéÆTkr°9*ÎKÖ>ÅU9A¢®ÙØ¢Rë^ £vÄåëªh®=  7ÅÒeÃûîË±CÊÐ¶ªÙ°!½%¿)M+T½qÙM[
ìUUD,«ùZòén1ÄóÏôrÀìNp²e$&ÏÑ(G©¯ËÌÉfÉJÈ^A­]=M"'Øï^«á?
n(qÿåM8­d:4L£Æ)0dÄ1&y ¶jG
aâ¬kªª! ìRQÜÝAJr1ëüØfäªöÞ«fËhPNï¦î55Cö.¦ñk.eú	½¯kiöeIAû.ª²ä-jS'ÔÕªÉÆ-J*MèAãhºPÐk0Â=MwÛ/'@ùoÖ¯ß³hvÉÀU³Ô5Õ;íÝt0&Ùt4Á³0ËF­ä7U3çRäQUq(
ÁUATÛûU}4ß5û:1ò|>â(?HÚï
Îü·6üGÜ÷ÕTÝ]dzÊ
Ö¨Z1J¾)Ú¼8XE2 Aûj\é½,hìxàufÔÈ"¢¾{ãvg2+¨ù,ýÙ¿ijºÓ JËïFëþYdj;HËÈS|Ø YÑcü!Îî	C!þ²å×â1x·]h1ãæâ·k r5+öÚùNËvw= (Ò1ÌeWBXÌI<ÜOÿlèSx/T5vÄcw Ç'aÎ9H)ë]NóàÖð'¨¢ÊjÏ¹*rD6HØYõ'ÊËIÓ± äNÆ{Qé[Í*d¶¸º{ùs/Ð ¯6A^D©*üøÍÞf1Ï;ÌSr9ÊÃTH&â¡~ÆàtC= ºµÐÊ$CtbRð=}J©Æg5ð5ë í÷(ëB1:Uî[Vv¹EáoMceH÷ CBV¸gXø¬vÚ¼0ÊâH÷üÚ»/v= P¦ëeóö	Q¯ïeÞÜci³öx³dëÉbGÑâÂÉ~A®e©<Í6Æ%VãNÅ©øÎ÷¦ª	PEÊO&PÒÀ/Ý*pv÷$Z0¥9å@z^PzµAÇïâýÍ*>qY·×Èr×9+STZè-ftMs|KuM÷<«vïD¿$¤JÃ0ûßRn	2/ÜJFÃÇä÷¾<¯Y¸ËÝJZIÖ
"GÊd2ä×ôÚýªÈ3àà?73=}Ù¯Æ¥«Ö9?0§oD¼ùÛôºÛ1ûfåÀ×,!{8_ù «t®¹Xì>|]|R^kUdì®(êÉ¶ÑxÜ{[¹v(¶pìMM?¬ÖÕyTÊ-Á_(!{x:}g0aH/(;Âþúp«uÌsa÷fÂÞcø¢nCS¡SþÜÖo¤C9fís	²Én= 
´S	ê­>»Ê,b÷ìa!CûKöVX0L÷ÂþKÌEÓ¥øî7ÁTòòe}oÉÅ6Ã£Hs@Z,UÑx¬¥kácIa9z®¥ûíÝº|è¼ÎOy¬ù·o^¾ZÃðÖ×ÿ_ö_áµë]	÷|´wàRaNÏI¶!_=M¦n¥»}3¡oíM§fi+ö(ÃAçBõZÃ±­og¤K ø9Úh¾âF0IJD(Åy]®avk­gÝ·Ëk¯! ×Þtæç®ã+¬%°à=}£Å§ê®®¼ZV¢¸åÜÿÚìwÚTT?gcLw[ik	§HóQ7¦zá "ðÎZjÂÃEfcF­_Ö^!ÊQ7±¢brÓ*ó%£ÿ-áíh!ÈN~íh5¦Ü:úy¿}kÑ8|Ë2JHßTOk"hqM r±kêbÔ¼û,â-+Sã.e­ç}}=}÷#Wþaä%hôfòióX ËGøV*ôxíwjdC%1DÇÝ&zÜ|ÐÒ4»fIÜ:|ÀuÊZ.e×@²±ÍûùN@Á¬ÒcÖÙÃG+Ë+K¸æ¹¥£B{Á1©äË5Ú¾¬¨aWQÖËÊÂ<IË¹ßiÚÎisEnîdÏ¤¤/iZP5ðÓô<÷êþo"pèw¤|GÒ¡³¿ýøv%­*Ô.Ï/ g¬Iû¥6wPp7×ãYÑ}\o£9ÃÃ )ÞÅSªÐò,ÈdÁ}g)ÓM°QjÉÙÈ¾Ô{ýWO/W<ø¥ÑO.<FÖKËI¯zÏ~à«;a1Åoô_¾gIÏÁ
U¬4ÇoÅóâì!Nã¥tnúù wqyæ#¥Ô¯o­HöZTðÃpeðø³
dnh®øD±tûóûKú(eÎà7dàP3æòáYqÚï&DåóFsV:s!s´°Õ¸?â/y £ä[Î¶JÊö!·ÞkV dÏQ=M+EÐ^ÜIÐ¾±W&TU¼1cìÛã©û	Ubº@¨§µÙÅz@"ÄÎBÒ±§*Â÷Ã2ðý\tV6 ÐÎÛE@º%7uWU¤3û».¨x¼kIq,euqÌLç!mù¶Çb¤?u2wPËÝ-Às+g2eâôñiøcºÆk¼= [Â¾ôÜpÃ´tÏR[ 6aÁÿÂ¬Ð¼Ü[äPÙôÝÜ'rÍûhåw+|ÓJ!§%@&r-9àî&t5ÚéôD¸g*4Wnì±Vìä3 ¥Î¯,ÁÈ'GÐV«ÙçÅÙ{Düñ_~¥*áâV	øÃöä@-4ìjÅÚ]1Ú¢^ëqIqOBú¡1¶0çGÉb÷ktTCRIgñ«Hsª0,ÐãSòU~é^ømHlNñ<CðæOQúîhÇÛüÅ<Àäô\©x,j£¨!úùÌôî!K<0$ú¡4ÑË8º_vævÜ6A !dúfD@LB¬ùdõ	Ù4ÝM{²Ç¥dâó¿FÀNÀ&ZXzÎUGv²#Ü«êÏMb]:¨ßA^ïN,Í®×/¾Ñ%,¡ì&á°ÝþÛöZõÛ!Q³lqË~Í²!¦Ö. 47A?L·] Óü^L#Pza|ñ©Ñ,*XÌ£gÁ´½Wa±yVr%à.£ö= °0â2§RÄ'6A®ËT÷Q£ÙEC5ÏpWRSX4xÅ5Ï!>ªZÅ
<ý&V¦3Í¤,ÕBiuc=}]	¦Wð°.«XàÛ5®ÉÃk¾{«&J/N­jý8F6xãATõÂ0öC@ëàx½\ÛzÅ³"}Î ¡7i~Ý!léû&öËû·ÍseÿfBÅse¯Yö1Ñô~üVf=}'³Ñ	pvÌÿAû3û,D«HN0Â]øâ5á¥\ BÞSdd#±ÍG¸h½Ù·Ù4¸{ÁkA<Îp<âü p/ÿôÕR*ü#	ýßÖsLo»RÍû.töÝèµ²T:«Å,Íb»Y"¡
úåù¸!êlÌëS¾Óû6S/.Be$%*v%µúðâën2"9Ló[)~Ð= QÑÖ@ý7sàê;lÊjaôD>ÍñêN]5 oÀ-Ài¸ôQó(\Í8eÚejºùM±ó)vÈI
t¹N1¹ÅÈÖÆã;ú¢ÿ9èâo?Óè¿ôDNµ	4µ©ïó±íMèíXI%úåbÚð\rÜÀ?´ÿÊ=MÏX¤CX¸e%ÉFrL¡ÖbEytY)«n/w¹'ìdÆÚ! kfâ£­¯î= I²ø÷~âQ·ß¼(\Hc?<¶þÅÁÜnä¤E0,â*æÀ)}¬;ÒB ·°ãT4ÈÅnÛìÄ¨dIGáê»°zußÂ5:"PJKz ÷ úT·R¥¬(%~#(QÃßÈµíô|HÏd¤ô½ªTÍØVHIL¬jNëo=}jÈSÞ
M&2ÚþäØüÇÏàClÌÃ&Ù
ªQ%î§Ü]­Xö4éè¿Ö©aL«VkµµC/a!²äÿèúìå.ûPøëúeÎýóã¶+Á²T°iwÝôôjs=}´6æDY0×¯$= AN6/Q1H{Ñ¡èñg'åÓeî­¿ÎxB¶(Äë·(<£ñ È±p´å®t$ü÷Ë~¬µ¢v%[&Où´­Wí þy[S¡ºå¹"Æ°Ñ_A¤og¦ËÂÍÁÃWKÎÕbì©5<]B8Ç4Gæ/\Pß:¼Ývn@ãvoÒÉ¢&üÀ5©ÌÏXÄ­ïÃd»íØÏ+¥tÏ1§¼Â!ÖòÁ°]­öuA=M>¿|z/yÇw;¡@ßÒY'¯v8w»7áCÇ¾~¿]ä·­T\T¥ÛÅLo×êJ{{=}]û³ß#×øcõRï½Øû>= ãC£êkÁ·A}Ò§ujeÜÝ«Å	ó<\ðþ(=M²ü%¶9·Â9ÄNÜÜLåÃwÏXdËc°V]­\¸ßÏæ/q¾Ú#c¯&îÔ<+L®SûPOî÷ÆÇ»£RB¨X1\ò?+¯9Xú_wÆÙxä³3tCÙÿtQ×7= ÌÃ¿|f«gYç$»¶q a2Ìâd±1fjÖ=MçÄ[èÿ¯s×+¹°¦á¤Õ¤ãï¾ë4Ä(0Àf*õ²=M=MbòÞ^írno8¥åúý=MFØ~rIû§D[å×¬År}u4ôcG>r	ZGÕÕ}KÕ|qÔ­}Ô6ù­ÿï­à¦­_"ËÔ
ZOv^=}ô= ZzO1úÚRIß²ËL=MöO
]ÊuKñç].½eÚúµÊ|zó ìè¡Q.Áîx4²·n,~®*¶ý([6ÿöX0KK0t'üñ%ì0­õhT¯ùÿ%LÁSõ(ÁJ°Z¸J0ù¿RZªùãFK0­ÞJªYb'DõhuÞDû%üãú¨AÁâ-C¦êcRÕÃ4y_pÈÕ^2®*1wÂ+*¹¤##yãmÀD?\×5nËô:(;é0q[T«t²{ûòkh°õâº>B¶Ä+fdþ©ÌüÁ#ÝýÖÿV5\è¤ÕÄdÔøÃM+øîÈÓLøø·°+êoKñut7=M4ÜÎ:-ÁÕoå³Ôð
Ä²ºzCTVSÓºí-ÚñåÔ
\ð/Ø¿¢
x°1lÖ¯Â§O9Íñ¾,#'moq@bÜc¹*£>|¢î¶ÆÖÍiXwyìâÜZ¨ØÀ ?=}aÐgì= ÄãEßbrpxE±²ÑìÙZJ=Möõ¿Ö2÷á3·¢úÍ>-æ»íó4F;I"æ ­$Ã=Ma"áäd!%´Aý\OîávµÑ ÃýÖáÒÃ¶¨åë ²3Ä§äb©´-Äy¬ÔfQÁ/Ð	0sÙE¶@DøÊ ½÷ÃÌéN£@2·2y§*=MGãïÛó3ÞÛ«eÞ&ç	àÆY
¨¨UÜ4ËÔ¿xk;^ÿãçD>¥Ñ\YGÙcÞd°©¼èt WiDgÁô8ô·s'fpjÎZoõÄÉiìw@¸ïéôCì(¦D!ðªq9éPó6°mFq±D§ä(xfsD;TcE¥v QÓ)Öª Üý6Í^ïIï?ò_68Ä[Êòúu&á°Aî1§eåáÎ3É¢µÐ³E@+Xy!à>½¨J§"y!â®MÔ&«ÐÀ>úØ»âmA>!Yë= þëÎ±Ê-àÉ{x\¬Ã©cÃJÔÆ= ½O /Ûa&F0Ø\ÆÈ¬>ÿ5)AWTÂ¯¿Bcà3*Áë¢f8Àiß?#Pröéi³Èì¥LkuZÆÿMC/=}õ}v£GUÞø]xÕß8g-4«÷X´¿èG¢Ç£ÍÄX^¤Ç !ªh}LÇNÀ\0°C ðòÁñÃëC¶BuãHEH±@'Z-'Ý~¿¼&,ñ£@ú=MÏ/KÞ¿FÙ¹ÍÂ±C'ÝµßXØ¢ÝðãH-:EÊÈ) \øµNÉ#ç~ùVÆ&¡ëº5]'Ì°¾óUQól
ë¹àùfEWðø+i:ÖEbu?_èþènL8j¯ÚÚOL«	ÂL~X¤aÛüPî}3»92mÜAt¦A(|fÜlÊy6|ÒU§ç=MüÒ@"ö3q1Áéþ ìÙ¼,ØÈuÇaÉÇÙÉ£UÓë¶lÒN=MTÿê¢¥|¸=}Èh(ÄTiã)ÅÄt¾}HràoÙSüXö2ìÒ>Äâ_¸s¸À®4Ó(u*É0µ­[·;9e)Î@òOó	ùãZÝçtè2ØªZ9T+. :8v½ëBúÚ([&N<nt@DÇ,©-GoOó/_äÜÚw|öÎ*8u[cÙ¬ú©Ü|V¸Lä¢ÜÞïÝãâænèGDÏ°ëúiÓ·ñx$¹ð¶ßÈ&*»ögõPíx AÀF¥xp:P£¬[GÁÞ¡Te?khÁgy§ZÍÎ.4cvî±IÃö;cPTðS4K£s;Y\c°õT¢þÝä	HãgôÅÇÎäï*Çh(&Vº¿µ£(lú­bÎ¦äj(ÖÂ²7¨®øHÕ!%KÍÎù5iÅÄÏ^ó>wuô®:Ä9 	+$DÙ¶h!¿Ñ¼ö
J' 6iÅ@ñÆ8!Ö¡{!7/Yéz¢]¦^¯ý×WÀÊ¿1:}tAaå)´Èpâ£Ü·^^¸µg!®bý?f_E£·o[a3:±>/~ã28= A}Ýêò·ýMäÈ5èU
Ôô3ä²jæL'fCéÊ>>èPÉÙ¾ÇUW£¨!Ë"Íé âõÅ»[üXStâ
ÈÈY9 g@£õÝ^I3T¬ùÝÁÜb¨ægÑåjàõMØ°ý(üË¦¨¶­ÿáÛ¾eÅJâl=}hëC¼Ù=}E×ÆøEñ=}A<Áô¬{¢ú·Pr½S¢º±?ã¤¢¶m	Î­/~oNÑäHy:Í<^XJúõiVwêõ¶'ìësúI­ÍÕ¾ÉÕâIÇ"SÎ5øíYO¹CPº-Ìº¼p8qÑ§júÂ	kÑk®qùiNÂ]ærI#mÜÔx®o×±øÂ«%­FôF?ÃýÙÂU*×ð¬nt"å7ºÀtà¢4aÐH6 ÌEÚCEVù6gø]XÚùÜosÄ-ÔØÔ
çê= ð©À¨²aâÀþ÷E¦õc%ë@zú²u¨uö)JÝ­JÚþôÙ«JvCZ_&{µuÇ¢@ù@
°ü­Ñðõ:&^-âDàU=M&ï*]xv7»ëÁXapO4W aÏÉMÌky·óF¾ýÔ¸*\òÈ"¼µè"Hc\åÞU¹­ª´=}0zVv%¯RSNþ>wÃ*Q}K2eÆÃ-Ù¿¸mádm¹êæb*íåÏ]¬2»;= yíÏCcoNÂ02Ìñ¡ñÈÐeûñ'®'Ç~î&ZïßwcW!<¯×s,&wÀ¶|[ÏsËk= ¤+LÇÌ¤o©­ÛP¶VèsucîxqãÞ,dM>b=Ml-å!UfÆe#§Ã ÈS#'BO}?èÜåìÀ.ãÂX9\i(/~Ý$5(e
áÝ¾YAsL¸nãYÍåçFoãÒ\Áxï%XF¡ÄÎ"Uè{°'×äè!¬Ï]i¥ÝÝüÚÖÚký^»ûÌ,Wé)aQª5Êí](ç_{w+SÇ¿C´çyøxzÂnÛöÚ6Ìâ	f&È­hZ!¸ÏÚ>¹Ñã"y¶ÖË¦%qQ[%eC×¿B= )#¸Òíµ#3Ásøæª(%iý<PMN×Ï]¿Ý¦Vî¯­Æ¿ÉÏqh÷kRãúÄêmÛkEEÙrSÿú.âò6§X|É¼Èaø"ùV´ÊÏOOð[ÞÛnÑMä·êFwßÃn¬÷	CýgªÞr§ÉC½çNârÿ]UK1ÍLöM]Z_XG²%<Y$ü'ìE³}zúæKi4Ml9+Ñõ¬fæK5È7ØÈBzPûÄÒ|Ï°=}.ëT-Iør7i ÁNëèÇUÎfT·~WÑ]oGN^+t¥[Ó+óùÂ·N2×LV'öö0Z½¿ÚZ»ÿ¼ÛÀ$»Ã¥ÔDÅÕXo¡ú0´+ï:T7§ZMCÝOå[M\=M'?WSÝTí^q=M²acèíãÜHI3ÆÞ$Á§ÆéÏáìë~WÇíùåßlGÐ
G§	tÎ]Ê4+Còóý¡W±àMÓà¹\lëþÀ¢ÿT¼Á[ï6= T}Äg¼üºä%O@¼Õ|ó)ÌMHÜºs.KÈýæ7z=}eeýV¾ãZ{ýtÃ$£dµÀT: =MF-q]3ÓTüÙâäÈµ)NRÓ)~ä7yH*"TÚGâ[Õú_ù5¦·u¤{Ë	¤JC±¼*vó$ØÉ°LW]í¹lgA3§½KFe/eÇÎnëÃnhÙdÞ]1ªâ¿ü~â¦C³Æø5´ç¿©= Qfqò=M;Ói³{;×Ý5%%:öÝ¿Ô\	Æ?@´ua°ºT3ê2 ¶ R®u/ùoE<¨Æ{(4ÿ]¨uiBaÒ
âÎÐ= Qjn[$GbÂ½è3zj¥Ó° Ñ6ÕÍÆåvÁøYF"bòÇ¡È^àÀg/h5îÓy´ã Ùà¼lä(Á4HXµèå©¢ÃßÿôÞ×¡EQÒ>­dÜr«ù¯õZ<q]8Z[ìª(=M®wYb0éR5ü4¨(%-t	{5åÏFnÃwÝöZh^©I¼ÑóÒÎ À±mbØFJP¼Ù]x6úÞ'"lBX Xè?g{HfwEhÔ-ëVÃ1Ö(¶D;»¦¦Ä*b(}µIÿr+)âkè6­d-çdNöEäÚ^é>Ð#>ka5ü³ÐØ:ØÊjÎuÝõÔ:= Ò¡.5D7jCIËI·¥Kâ5Ùüb=}¹çfÕÓ!Wü¯1f½d­ªWliî_y1&¡Ù¤N<gØ'±ýb&OÃCÍÙä»$ý/Í@<ÂfÝ¸F|x<>hp2ù&é¸µ_å?AÏPTàe@¹8;bò]ëîëjÃÕ¿5ÿªjEYÑp-XòËúÙÑu×ßc}ø¦¼*Æ8Ø4ÝºíÚðNJ¦7ªÎX)ì¿%@¨ál³ê¥@/Ô¥Ó4é}U_lê¯QÉXº·÷dS²¶¤:CõÖÞ}ïó#lÒ(6ÀôJ80Þm¢Þ±5|¶D°$Á´ µ/<»(¹ôÔÿx8ãÓßBýLmÝÎ1_I~ÜÏÕ°{õ¢6³¾HDa*ÁKjÆLø÷¶ÔÑ9òsò¦F]Mæïq«[ó¢³&ð¹ºuâOrVÒì¡¾ ùK¥c*ÁìÒV¯pé=}Þzþ¿;Mmù¸h9tâ;íü+r+­/= EZÄç¬h	Ïx ªÑü$HnäzIÉZ¼}¦OqU«¯5X²'¡u¼rðZîÇ·È¶ùÃp':,«ùO'ûö*'ÂT·5|ëöao¿øsDXf½§Â^:ÚÉýóéÝñ8fÇ[fW¶w¹6)ðìµ¶Ê9Uè= 8ßUSW%çB;} oS¨ZHÝjôõÛ#=M¥×ëp@­n)/ÄHÎÿF\i>æ«Å$U"SY\zÝ|+¨á: !.¶2~>Ó(aÃ¿/ n¿í]ar¡EnKWdüá½bªª)ÈñÛ0ºG«½ÇiÜB½ëôYÅm½5±Xç²§.Å:ãöþÞ½°5ÂFósjH#öÉpne¸ ÑÿaOÐQ§ÓÍ&×±lAZdÓ!® &+äp'¢9üß6B9ÈaæÃ3EÚ,å°§¢;üósñZ<UrëHY(·BÅÏ­¹w{&¡FkBfã/Ö("é{=}x¡V å¸S¡8$!}*øãëgo¼ªÒ;ð&bÛØ_O¾Í;I_lÃ$Or¢èXiªe81Q=}ÅË¬Ä2Ó][=MùëøåülR¥ÐÃ^¦îjzý=M.{Rô:Îøå/TdÎ³YssÊöøc²ãBR
k¦Ïx{?.þÒÚÇ¤6ÐoS¨Øm+Ôf%.O>®kuè÷I³?	dÁl4,¥âñW_RéÊuk,.[6;ÁýI3¥¶)ÿ1Wê=M±lQWmúº¶Ùr@Ï×!JTþFMmäÚ|ÜL3¥±ÓM÷·ÿ»[×ùZ£ÌQArpâKAI«YdÎrÌª³åX8ÃÆÍ³¹ViÜ^Ï}|GéÒlxñ|,2ç¹Pp5Ò³3îèF6SÛº¢ç´F~rX£ÿ«Å»cNÿbòïÚÔöz¢ÙÜ2ïU2,SÏÕbnnD7[STóUò«Z_ËóÏf¨6pOÙ= "öc£¦= ³ÉZ;ØºsqeïcÇc¼(mr5Ù«	Ús1­ æ%¾WëWK{¾äýé¾b?F-¹[ >r/dÔ¾0¿¶Û2§ÁFk%9ºG}÷syµPt$HÖ8F ¥ÜÒttx¾õØjU)vFøa½ÙXÆw»6Y2IZ1bgA#¹m¨Îð»§opÃ&SúÒ¦ga	õcciÐÿ?ÌºsY­62w2gÍÜ¬+ýH	ß;\»ùbÐóbª=}x= N}f¾ÝÙè¥ÌGmVß&= Ãä'+öO
E1SÙ+þ£Òd$8¿¼Õ,,Z	\É²G!3^è<¤Óù"§-Îë¶aòýÒúçsjP³ûÐhI	øBîuÔ/?$rxEÙ×øt3µ­±ùÝ#ôirCm7cévôÞíþ¿úùÐFS-r¢Ê¿]YÌw´61ZÙ*²«¯ø@ã]Dýso« 	Ï
÷1´Õ¶.­ÀïE³Ü»Þæñú9ôE%±³Iïm]+ßz,6¿Õá¼>RåE;Pà%D¶ª»ø#óg5cÓ:y@ÑÑfmPè3ú#ÝT
5nsÁ*=MWÑP|8nI]u«VÄ
g>ôµ'aÊÄäçß³F<Ýöejå>º½^ÑK°6@B¹ý©óa2¶2çU¿ñ·PÑu Å»íEy­l
øl³.WDÕÙI§= æÜÚ=M-bØÚEChoMæ1.«¡9òg««"ÀwâV¼©p+£blÎC.ñÉÍJýÓ÷ÁÚ©ø=}66âx,çn{±²¾yjº=MxYPÁØ=}Y¢¶v:£ø¼ýO:";ýX ;£ÌGË²kB¿§blÙvÞélj1ã«×ÜÍy×¶¶Þ¼\×µ´¦vþõ6©ok´½þÿºAç+b©W×7{~ÈÍt'vyYÎÌIdø½{ÝéðXiªÓÝø5óØëP)¡}@ºÔo¦¶|·©÷¥Xcù3{>§= "çüZÅµfPW,-»{6ØØ¼æÇÖ3ß©~DêùS]bÓºùSÿÎ«Æq=MÊ<÷ié÷³Qµ¶ +U{Ø)A»;¿Þ©Þ¬Óù< CSþ·ÇMqdQ"køÍBñ¢ëêøþB{Ðÿ#hF¦x¥i I"fWËa<<ÚûÞÝüAî»þþ. ]rÁ=}]Uº5¾yhfd¸èõ¬F&=M=}CµlhÛ?å²ª«ÊxÕíæcrþTrE<ðøþa,xSØÌH³>Ìn:¬0©ïdb
äºö<¨_Æç{ÍÌu@o sÌt¡³½¯= ­sEuÑgÞöcy7 ÈÚJÆ=M;Ý©S~õ¬	áÜ?M÷vç=MzïÙÌIëx.L%åÊwíå2Ù}Uöú03rÝ(u9D¬ æf®Ìû3Ùhºæ¬3/5Ya_íio9Ë6DceFtiã'¤Mêôïµ,Ñª.ÖDÏL²Öï#­¨m7Y±«IÞÍW{Ë©NÁaSûß7"Åæt*û9Pl04ûW¾Ú¬3|þOÓncK=M	'¯rXOË	×ûµP¡Ìãëô_=}zº6BifL7c¶EykÕ6ÝUíC#ÿWc~ÜcçWóSù^ôýMO1rbÊßï\­C=MQjÓáïØk!f:lÉpIµò-=}Õ¨êY~çïÐ¾6sbTïg= eVÄü s©¬ÞüXN{ÜÏsø	ÛÌwE"³l¥ÙØÔlwÆ6t|ý½¶¦3FÓ&Ü[>Uü»ýª9p{­&>¤Û2cÍjóqz«±ªX4EWy
WÈÍÀÜy )µ),tP#¸òy1ÅMÞ6½IÎ|´B¨!¹¥:Þ&ørfI\Þ½j?r=MÝjÌ§Î %¦tqûÄøí¸VQÍP= #Jÿ~þ8#Ä^¼¾	åõd+Kvü!%úSë¿{0¶9(§^ÖãÞ6mÎÈ%}iR¾uP|"J¼úùp®íé1ïdZ!zMêëTIk¿ÐCJæ%ôL U§3¯c¯-«k¼Iy%V6ÏAXÏX3³C Ö:ÌtOÌ+?¡{3ïÎwçÍ%Ç¯Ä]T¶6[pE/®\Õxq?½½JwD°N¹æ<fæ7	=}'9üëj9®ûPV×q+<4¸ÎDÁÛSå±ÒØÇ2ÿÔþ³¶8sÇuE=M\©±7NÌLqFç¯÷8ñÁÞ¢wzcò}etRlO{¦t~S^1PP*óÚ«çcÓ<¡_»a=}©GOCB¤8ß NÝÛXP§;P5¶±<â?§Éö/jÜÈ
ðB+4ÀM·oYùäYåu}}Ò²¾¹n ¥2	Ü,= ¨I[w
uõ}{}÷¡ñÙg}ÝãÜO)o;PûGg3Aª_ÿÝþRÎ^nÖû%YO¡óñÛñ) µÜ¦~,¨ga´X ü­öa°tv#¦Â·¸*8>e_hÕepW6gZ{}û}BßúáÀtYP#~zÆ}®á|X"0Åt¾©â.x.aºÁ>Ï\$zx~XâRïÔSp}sHnPS2ð×üå7x9,= -²SuØÃqôy¶TtÈºÓ*.@¬´çü§¦:±Zøºµí¥
JlV¥Å÷4yBqDyxÙkI= ÌË·õuÕ­aRºoÉD³åã60vU¸µ´}"ã!6jU9óÔe£B¸:K¸BèõE@Ç¢ºRKÑ£@:øùtõ²²JD*eSÜ7duGINÓõgÆs>zñ¼ú°ÅJ¶9ÈøtéíQ=MåÏXÒCîqäEúüùñÓÑ
0ôÆrÝ¸ã®moÛ:Æv
òÁU[R%Òý²< gÜ§ñ¼¥ãÞ;ERjm8¯w$iç3kúBdùumÕËY¾LI¤=M_öþ^í¸Lù
êyOM9¶\w!ä¯bhº7Ë1EÜß_F±ÌÏ4cµ¼{> /Ã¼Û(ßáw×_v?|§0Ër¦ë@bÓiÑÍÆÊ"]©YÖþPßx¯¼¢®¥'!}OÏõ\c|p·\Â-= KÝÑ¢«Ú©¨Ø¶<ªv!M Ç¡c ¼8@¬¶àY½¦iÒm«û®­°OÏzg[0F=}éÅÝX¨yeÁAA÷J÷)=MÓp= n!ÞâÍ-lpÛ[ÈÎeÎâo¯kmÚÁxr´I*´=MßHuCf§¯ÚRÓyÏ­Z= pbá_ÿ_   ÙG8¿1>¡= è¢ *yLn(=M{V=M{V=MÖQ=}ÆV=M{VÝá:e"¿ÝÉïlã¾/[|ÆwXbån:³¼Àyi¶vS*EÌÎs9hØ&Ó0>BÕ-Iãõjò,À³	èæâ°#;_Þ;(é21.<´EÒín¸S5+ÈÓ*åÞ:Ò>mÜÂ.öËÒ<=}|ËÆÎf6ZnªÞÂ*ªÑ*³´u ªýåj¼/^.Bß)íüÇ¾W/ét¿ºG±a(½v§5M$Ïjý%ØË,£BøÎ(ñ"HÅ&¤XÂ$âhÈ$âß$ePî¨%dö¬Í$m°FþV÷iß®Q%°°g}SÁ¼Þ³b1<ØEa3!A"$±g-oêz#~7=MUÁtÚ·âÜgÐï©Í·Ùè
íyLO_UìRýG6] =M?3<>Ôå:ºËÿ5ag{V7Þ{V=MSV-{n;>WRNuilß'«uÖN&G= K¹ö®ìÍ$ê öÅÔ$÷cuð¸"k«Ù{a[= -c¹§aÉçâ©= °[¸JO&3"Ç$?¾ %/ã0ºøboÇ°ºN±Þ½¿¦íé{h<«iÑÒµ]eÉ*ÞÞåóF.ì^Âe'¡eËe*Mëµ75É.Ê÷ì¶«ôÈÂO$\IG?~Ì¶JxF5÷xá[2&²{¹--ñ+cqÚ[8Úc·MõÖUXBÕ¸t@BuñHS:ßSÆQ@A:®=MNYø3 '¥e¯ª& ´¦ il¢höÙY»¥8 » S¡Q)¬a;=M ëú*ö\¹ªøtÂ/è|M~°_ä¡kÕq	ýVnÃ=MceoÖ!Åì	ÿfÜ²:×d?»øà ¢|88Ì(Y8³ÓÅÑÄ6älFÑáe2ñ«]HÉHyIHi	HaH¶¿ÊZQ3ÃÝDvcjy©^Y¼ZoÇ¦³?¤³?d÷65LÉü¡oÇnF=}ÿ]ºmºÌ:ÿÞQ¿ü¢§õ"O§tóPW/1]¹%à P!´g/¬6Vÿ§Ì-}9|Þc¶B13º:[^}Æ×ñ\É7£D¤·V1çàÝ¹è0=Mx'³X,'/)´KÝtãÊX<ùV=}<kjËÊ~_
[À%ÜÿbÚ+ ¤u½:é:ßÇð]Dº}ïÝûQ·g°µ³Ãiò{Hüíäm?óôzUõõ«Õ´C%iô&):ÏKÿëÝVÊb±üÀú=MbJ.óÍJr(K¾ú@RÛB 1³v,Eú}G*ÔcREZ@Tª 1"±E=}Ø(sX&Ç()´I=}tÕË5ÌükùVÓ
þñ!IMr
b}ê8·¨¯ªG#A'ë·´Ïó´NÁz¸í.zîýÅ
å+JªäMÊ_j
Û¼×¶3xpgFÏûþoU+J}Ð
!NmüíïNß.ë ¶æ3ÇÊ×Hô5ñ=MtºæðXÉn4ZM®W/qQÀïû©¾Bø=}F¦K1
\:Êï =M{îYtµ ¦¡| ©X ¥xº=}Ü1·f_[Í2í&DDÄàí{ö*#,ã*gEGPÜèÜ}¯²= êø6ÿZýÒ¾ó&I42ÉìsYð&)ø7= ¤ £Ô>D¡-Úo÷ºu P3faºïJ¡ 
Õv	LwxPßÂ@ «&æóCëCEqv8LÑµû#ûCEÑéCMqCqKÑõÃ {£àÂÿïd»ôR< <@ÉQ¹íKnÉ¦;´´3ÁÈõä¾8$¿s6ñs1ODVþcCó jïßÚììÉëISóÂÛ#X°= È¾yÔÍÄìjÄ{?^¨ÿde¦ðh(Ù~.ÕkA6âí2!Øý_2-ý°8µâÖd{ùB¦jî Þå+Ì)ä¨Ç÷Ô8eXÙàñ6ÓáLU=M{V=M{V=M{V=Mû{VM÷tI3ÓMÕé|òu5n´²o"E_*Û@ÿtñ½7S²/Ø8ýØ¨qÊXÀJz8=}sy(5iÜT£Ä
Sßèç\ ¾Í@6J!ºMie·³Ä è&½ SS³eêLgÏóvRß«ÁµïüjË3s£çmuûÃÕÑQÒîãZ4cP©GR»ýlAèGP¹óÂEÄDuX0²witD³1¼AúwRÓ+ÑöVÏàz4õi,<)zÏj©èg,Pßnú=MÁ5Ýy^<®jìw?{?þsÏLaºû»Ý7 kQÛÐ®Á>¾*0kbaÞ¼d
è·2¬4È·vF<h¾7³ùn~)X_Êù´oÜ!^¥½)i$CGÜÆL:sX¢Ó½)^Ü~C9ÚÚ@ÞIMm G0x×Ã¨K±¿Î÷gk4S.vòHªÈïDdXÈg§+¼änáy+åÈGa^¥¡Ë³Ä&Aè|Ø¿¼Pðèf2¡Jî= \5¦5õÊõÞJìMDs/~ñk áóõõ8eæÃDQeofp¶I¯1r¦I·r¬çºåêæp:1æ¼VGÓ¢»Òö9¿s0úÁ]kSØÏÂýgUìeö¯Dº_{2É<'Ù~vÐ.ã&x:lðDW*L[¿3{"Áìäz®¾ZÑò¹ÿ/©XÝ7G	æ\=MnQ\%wp5É(=}Î+¥ró\)T¼¹N)R'0^Ð°Ã=}càÜÒ 	ý:ÂÍë*Ø¦IÓ÷×áZ+oiÇ>ä#S1»j¾g/.üeÚè½ø¦O¹rq"g>êB{ÜfþTgÆTãZ3wÉhy;?1nóDMù»ß1C©PÔ=}Õü.þ¡ºÃ/Ñ2ÿ5ËxªÃD{Ù2\]¶rË<!Òr|&?Þ,QÉ¿Òù>[´¿V±ÃÝj>dOÍ©¨¾áú3·	OjÍi«X=MhÜïÜX5Ý¨VDûØ-\]¦¯vØ~¼³r¿YÂm²Ü {¦|/TÛ×Ì&iöçZ1eJaE	ÓöÑ"ãHçß?í1î·½lJXªD¢| ô?KX]Îgó´çJã
ÿ½"LYÑIË3Ú\±«3ºÊµ;û¡}{tîMú@Ró9jj¾Zç¿iõ@tàÑ¶Ã_ÏfZÔ;V¶0æ½æ]t&ñD×T+M1Tf,ün­KÑÌ¹½nèó§ûÝºÜÓ¢mL¥¸rÜ³tÍrð~J"O{=}x¯ÆïD»õØ¨Áí= ¿'?¸orsÔÇ¾9§ªJc¦r^¬Bd×_Ã=MkÙxbàÓ£ÿ0q³Cù\ë1:r¯¸ÚsñãëFÕ_Ácý¸rÜ)çJt@<2bÒè÷¹þ[]¹ ·Dt.wy»nb¸ïpxøÇ2!Ë­xH$qÏMmñÔwà5¸ß	DÛ¼ûßP÷­WªÞb]gX½Ã_= ' 6â nèìfY!kQ»æÜNfÍz?F·TÆybÑÁÓª­0®¶ú
 iIv(&áD§ÐZoªæõ=M<b©¹ý=}»1¶¦ÿìDÙ´ûõïÜ.ë/®\= MKß;2×l£¡ûÇRHûC>íKq:JH  ßu_ôWv»3U"@JªëÏ×GJöu?t-Êô>ðï­ÎNQô0tU¶rld>¦E.ïÞÒÚFºOìá4¼3y¯CÂÍóÃU½£kýä.È%Þ¸r¨Z³^¹mè\fWTf=MÏÎÞûq©p£ß_6W	ñÊ×wÌÐ!74Çq,0fsv(Ý+ÕÍK¹&2È^¾D<+	j+Ï1¦'¡è%/Æxv5¾CÉ~
^í·Ü¦ÓTZöWÀþS:­
ù³LÇ«§ k^©¹Í×FfvGüiv4ßj;ôgY"Bâ6Eg¨zÓsØÆ¨þ&,:ÕD?m, ³&·?£1]¸ûÊ¿1Ý2÷ø«CÉ2¯è%¹Ü*TÇÏ=MË£þÂÕ¨vÙÆBä¨G¢aÜì>a<f+Å©ßDß´Æ@Vÿê£6 Fb¤SÛÓ7°/Ì_GóÑ}{-+ù¼ÀuZÞöáå8«ÅÏÝË eÈ¢B¤:£DòS^­´®X¨ËOº= ß7o_u=MÊIS&Ço= .^ ÞÂ_ ÞZ+LI8è4V÷¹/Ø&
JDYëäñp&lÐÃ¸ vâ·¹¥±°}®q«¹=Mi]ècÆº@£dÂZà¿IÍêÁ×¢¶ìr$ÁdÚ·¡ ÏiÞ­fü­ò÷¦ñÔ {ù7=MÉ>ã·D!Üå#È!,»ßuûæ°;q®EKÝçIßá]ÍËWlv-?X²UÊu?ê;ömÇµy(æxª~GÁëìG÷¸?gºÚ¸({ýÁùWH"ÓPº9ÖÓ8±£Hu£9¢G³Î¨¯Üìð#ê"t áB^»iü´pÿMveÃµÑòÏB| ÎÄ_=}âñ¡Y~?ñC³=MÔà4_ûÆ åèOÂô^ÌìîÿPG?ÿU7"!õÿ]ºq¬I©í)&Iã£\8»3Ï¨>Ý¿¡È1×CÉ>;ºq°I¡iÝøÃþm#µènØnoo_<72ZÏªdgBû8ÆDñEU¥ÌäÌêÐö÷òñ4Ò¨[EcdDóº;¼P[Ûà|w/×nóØ²ª²*²ê2üþâáâñâË¨Aä¤·¤ B©á²u²$ Ã$öÁ( V°Nâ+ Üåã ¿ÕW äÂ¶bªÁ²áGÆ$«ÀíRÇê²b¡äª^¨&
â\ J%ÐÓí°ªaò ó¤@H©'%°ÃyÞ²Âhµbº¡Ì°= é¡¿.2rÿóßòàdoóØmGëç#ûNú(gûÑ½ìb/ÃËÁOÃ+Ë¾µø/¬§FêÝà5¡#¿n¯%íºÿgeÉo ÃÏW1Û½A|i\¨ë.QÄf»zß«Ñt:.>È¿'J¶e×t/fðÓU8Ôªgö{Bj=}ú;¦³"Þ}ò:YqephXetg%@NéhøÃÿ®ØÐëÝÂÓ¹{¯N$ZÛþ$×@o¬DD,Iq@Ú¿"¾Íc×V¸ñÝk0qnb¨ý¢jé½T¯GSäNWèQçß¾ìã=MÉÕa!ù½%8Ðâ¹ãgòf¯UÂó­¿¬Æoæ¥o·æ!øÛé]2Òqñjëq;/¢ä&ì®÷¾bÙ~®Æ×=MßnRf	µí¤QHÎ:Rø±#mü±
ÜGJ«vûè{aH1U|/®q1Ðº¿¦Â
X¯K'pu#3©­dJË8\(ùqÒ~7wSfì¶×{[¨Ú:ø }ág/pæÛ¥/¶l@Rf¤9g¢¾$tÂÌ>ma	Þø,áäHÍÇêÏ^úìnYÐ&\d4	.H~Áó|l¹§Üº0sînaüDòßQÄÐ,sE±U3ÂvÖµ@?Z"ÏåUd=Mo8²ï<Æòs&=MêÝðK®D¸tÆ½FÙõµîlXP·$?Y8#ntGó!bÎ&ÄvQN½=M^Ø·?7'Ö©²Éù#!åÇGz±R&¥Ø3ë©ÒÑäay/­	Þ´zÇ8&/r¹e+dÜV-#fyv·ÓZ58È·oÕLà<;©gÕN2ô6Øq)ñ_áÈÊZ,·¶ÐÙ¯»?FÈ^'Dß£g¥y58ê~|:×'æYï¬Û jwAüø%xf½ÛWÞ/ªcN®Ë+öa*©+~dl9Ø¿y²_C^¾úrçÛ;üÖþ¥ôPG0I^Á¬vZnÞ½ÊRiñ?o>çÞ)âcÆ·²È=}hCpEeKLÎ=}jj§³xÏ.T¼³[ñ,,ex^#kC(weÂ\¼9îÔlgRÄ¤+b³ðñ-çåÓborvÓ½+ÝjÌt¬ *¦¾U|(Z&*ý¡WßÆÍþÿæ{(ÜtÓ)ºhj( Míñê¼= ¼Kì¦?Î{ÓÌ¹C&ÿ¬×¿AxßÃ0-QQ¹¿dÒ÷º%ºÔ7ÍÙ5Ùs9ù3â:ÝoÒlh*ïä%å§¡Q*9ë÷;ÙîqI,àËËL=M_ËLÒbuE(iÝö\fFboÇ2µdxMuw¨Éú>¬beü§fLþ69®Ïÿ8,hëh¼= Lõ|Îéá~ö9evÓ áÑ)²@Ò¾¿Õ¼>V vËN^îàÃW¯ç¯6ð6³è4ö^[=}@Ò«y¿¬±_Ù$2Qfð{ÎTµ<Ýän\¤Î[åçß7ATêG±0Iäpb3¨t	_BoOG}äUÁJP;Ç¡0jbÆ½{Õ~q#V-Ô¾>F
æÒCµ·??W?ßé>6¸·Íûs´,Ú¥|pTgJwÕ ô5BÕ}Ä*>Pè"ÇSüÖw6=}gôý¾ÏÛ;Ó~µìß6s½×CÇ×h %Òî:8ÁÅ9÷ÂÞ<}~ïp©äAïØlJßaP4#üÜ§ã×ÙÚ@zúëèí®W50ÅÌ@t¶6 Ìä«btßðÚ²5S/ç§M}Z.^ìðtØcUBl:ÚSj·AÃ?Få§Ã©e¹¬SêÅyu½{$ûÄñ×L·e1ôüFy÷LòE7TÏQRYð3Ùnó¸û)D­<6RFxÜòáÜ8øgì=}ÿ|OIe"÷ÓÍ%fÄÏÃaý\¿÷AUßwM2Ä<×Y[Ë5»XA6áÖ®4àGÅoä­.çá¥ÝíÜüÅ©ÒÅ¤[=Md×¢çQy°äEJ¯»ÓpG3ëuwYb¼¾ýðñÜ­ùff´ÕxBIàä¨Ø^Ù âüÆ^GÅt,×Í)Y-ý¸Gq_,dªÓ:sýhí_ä=}²
ñL½'>ë´§»¾xÕ7C¤õÚZGkùÈò/7Wq5;aWÐ¸ÿ-AE§¶c=}¸xòe6ÎÙïaðÓWÑ ÌçtA|îå¸PÊ~éË¹S¹V±FJl7ëJuü^^dÛþXuÁþZ¬oý')×ïUÊ¾«®pÕ?Ù±5Ô{HÀþß¥án
>X~Ä¶B¡.mÏöÏüDZ¹Bæ81Ó¢o$<ÿR,¥Õo¯ÓçÑ9#Fiòb[´öýàxnÔ]??Wl¸¾1@MsØpØ¼[TïæËÜÿÛÇëZ³9lmØÛex=}ÃQ_lâ¹&æÙÙ"HgoÎó{q2ájÕôÌ,Æwø4ô@üqè{BÓìN([&çúCÿÂÊ¾ÛpÛ(]¡Ø¶IQl¾Ë*ÇÜ=M«B|J4Ñÿþ}ÓºeÂö=}¾k$$´¤k3ÜG½Íª\¿*Ù4ÈÂýÇ©O¦=M¸Ó¯tPªâ#çBm$TO[ðn/ÒüÚJkzp¹D(¶ûÛSï!= L×ög)Ø2­P,{lvK¹:Ì2v¸6{¤re9þ« Ø÷|Ý pµgñ¼ýÞ{v{ªS»	nUÐÛV\yV-SsYvßÞ>üOXö¸Í5âJV9x,:QX}ÆN'FÖFlî}èWh7=}~ >ñ<I>0lCõ1]º¸Ð#½®Ø"»¾#¿¡¤±â¸±ä±ã¼©Ä1âº¹1#(ðä®Hp@c ©»= ©·|Ç]T¯Â½*X¯Hp@+D°Ã*J&	SÛÌâ<ÎWg§"AÄº+Ç2IÆ;k·*E¿û?cÖmÔ$0³÷êµ[Êm¸{mgÆ=}Ì»(:(_\h*T3¹«·+üdù÷·Ð"c½e-ø9q<#hCgòlæ:so	âlçûsA9TUå¹ÍTM·;ëk¹ûµwºuo "¨Á,¨B(Á.¤2°2âºÎ0å®´ðä©Þz>1æY¯VÏ/ÜÊ@§{÷5_|~06WËÎEªß×ã[JRLºfvô®6ÈJT\å»6å\}®eEmO{½`});

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
      return new this._WASMAudioDecoderCommon(this)
        .instantiate()
        .then((common) => {
          this._common = common;

          this._sampleRate = 0;

          this._inputPosition = this._common.allocateTypedArray(1, Uint32Array);
          this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
          this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);
          this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);

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
      this._inputPosition.buf[0] = 0;
      this._samplesDecoded.buf[0] = 0;

      const error = this._common.wasm._mpeg_decode_interleaved(
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
        this._common.addError(errors, message, this._inputPosition.buf[0]);
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
      return this._postToDecoder("decode", data);
    }

    async decodeFrame(data) {
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  assignNames(MPEGDecoder, "MPEGDecoder");
  assignNames(MPEGDecoderWebWorker, "MPEGDecoderWebWorker");

  exports.MPEGDecoder = MPEGDecoder;
  exports.MPEGDecoderWebWorker = MPEGDecoderWebWorker;

}));
