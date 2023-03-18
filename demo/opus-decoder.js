(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@eshaz/web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', '@eshaz/web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
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

  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", {get: () => String.raw`dynEncode003b¯Ë¼O|K{¢	¶R²ª~s²ú6wTÂ[ÑG½?3¥ñ«óÌ)ikìð½;»Z¬×M¬d0¼¬çÓú^cpÈ|¤Þ+jbåüØá6)ééàÂOÎÚÍkâÏÑ^9ÑoìçCÑê)o©/þ=}{8½Ns<ÔÙÎ®E
¤C³±aC;}°EDÛhÛ±ûÃkËsÄ?ãÞ#ÑÓt[K#%IÛÓ@ÍwCôCL@0DÄSS¿dþKÞÙùËÜz¤LD«XL>0¨«¾þ?÷6¶ÝÇn?sFnsBîsJó;®óC.ó?ÞóÇËù6ýnª@ô¯¯2È÷ÑvIWu¥<BèÔEï¥¥ò)-~ôDI¥Ï!#rÆ*s­³EU£ç¤}ø%ÀPã¹{Ñ¤aùöîÒöHÀ% )Ø µ+÷;¬ÏûNSÄblÅx ôâãÖÒâiÞy¸~ÙÁÇ×b¢¯|ÞÞÙÉUØ/¯=M#çâîRxoõ$ÅHr¯ívµ@jæÄgêF7ø¶0N»gåÚÎ"Ó$-/òð-Ù*ö^÷A£»Ç3U+¹¯þVXZìàoÞ1£_þcäÅéèË(§·XBØ±é¨Iw¡!nRÉ7³T÷¹÷Ç9ÔÔÔÔTé26%ïI8WØuÂåõ.á6¼$fIic9·SZ;Ù6aWsaµaÐ!æÛÕ<iyÌ.µcSø0½5¹ÄÅ*Êý#;¶Wå=}u>CâÈ^£wrï?ÈQãòsK<kû³¬×2lÉb7ñe®æ<vëjÉÀãþx»­¨Û°Uøí>w<Y¡çèDõq)µõWPT¤ÉîødLp1æv·l³÷²ÖÖVMR;DÑ«5ú
ô~ñâÖAD1¨3½?øË6sÉ,[¿vß6-OÞ>R§NÕqÆÂZº×6q´ØäË½äîþAÊ3d+O©b:¬FÁÅ0GqøQÕiùrDÎ¾6>ã 1q×.ÜaÅÙ¶æºK+º¦kXIkWþÑBÀV9-0$kÁþ9kHEwºfÙÞ9Ûe»öÂ;¤2ß¬kK§UeA: j<§.üéµLö³«æÉÏ8ò@¶Iê>Àh7À¾BÅVLAåÿµ7];tÎ#[¼Ër;©q|zÀôÈ&!ïÊsôßô>£ö£ÕZJ¡h¥a¨.þ|¦'§=MÕ¿ú©ÙÓOSß}gïÔ;550&Z:HFíÀb»þ²_0ÝDL=}}´¸UÜMê¡} ê¾=}rò1O~l§M~/Ñ®Pë©ªßGOã#?#ÅÞjÌkhseùnF6	ÉÓ= öä$q0ûGTOj¦K%ÖK´®D¢¸Áú?z#®SþaôÿÂfv³ÅÖ£æ=}²¸SD²&3SÔÌ­eò=MÀ-UïÓ=}Åx§¢ìj\Á5²JHÕàØ!î
àÊ2·ZêÔ¼O}eåxÎsÂ(íDüQdùW%ãÑÍ¯/!J^aÏÌYÏÌûGíf>Ëý³ï­ãtm£;·EÓÏí'®Ðác>ÓÆA¼S¥@ÃMY½dû×Ï04=}üæê¼	Mü_ÏÛy§8öüvk	³ë=}×*i8¼HZ{Nòn¶Cõ¥Ñ!¸vÖ©«.¿´«þKg}ÓíâN/ÔälþC]½´¡Ãâ°ZÇ½.BºM*·=}y¼ºÊ¢m+0"ÍãæôPßAz\y]iúd òbæ\QZÎ9;yªØkx­µ©ºSÁïæx=}N8= ÌÌÞ}3	ÍX1¿aÖ'­®Ô£ò¡©ÙK~8¢¯ßÐN¸º:}Î>þ¿OGxbmÀÐ7a È÷ÜfÙ|>J¨Il>wP
ÁxÚåýHÒ2µPÐ°Ý!6>oø!2¾¡@¤.Ï\¿A>!ñh9®#á=Mÿ'ñ2MqâK=}o©§Ö÷{«}ì/SÜdp±R¡¦Á3Ñ;pk-
ðiè#l¦ë?Ñì¿h¦ÎS=}ÁûDa³kÇ¨Þ$ù(p ùd[Lâ Ä{6õ0Î<È#%OãÖJâ *è |1Ç(«¾©Ì^FÝ$\aæPn j@ºG7>ó­ÇoY0BÍqBGÒÐÏò¬ø¸üI%Bp¶£®QñÙE¾îüZq¦Öì­¶âEÄÊÅxÊå[r{ßÓ«jg´K¤Ôm»¶¥Jáí±¯OÊô=}Idµ#%ë¦tu.ÑÓ³k³ßèrjo¿ÃÚ¦FVÜÀ@;ÂØÓ<Ö7®E3®eìdÏabREGòªBspì2
©@ÇÇt= Í2áab8¨¤Î­ãð¤îùb$É|Ñ´Y¢,.r|¶_þ8"Ådâñßo,ïmízÏÿö¨	ÿáÓÿqµÛüÒöK×<OxÐ'adWì\½¥üÍOPmÓB8(ÄhXW¦óqIæJ¶öÍn¸QCÅ= »U¸B§e Ý^Î\¾}a÷=M=}>Æ·1|ã_¿§Ü=MAðT1ýAëTêZïØtl~Wú¥¥$¦ZýBá*>pXÛ±Õ7Uyë'a=M¯Ì~»«  í\5s^o,?V¼bÈ0~MUSó;ZÕU®ô!cÖ6ka#Ïe7þE0G·Ò¥Bx0LfXt×È= 3Öç55í-ÇÚÃÞkÄÀuý¬?íÀgÛ£Ã¢ÖVÓ^"y:h7ÀV¡Lõ¹,ªÝ8+6yÿ­RDd	z)¼Oõ¬hs2Ùk gµô#½d0 oÂ|ô*¬öôK I{Äxµ.'%N%ÐúDæÚÇ8\ð&ZK?ÔËsyé%H¸É%V!CÊ÷lB>OäÌ5eMÅP5&[>Ë½§¼Ê%hLê{¥ö]frªCßa=}¤=}&_oÍ­,¿ýÈùV1ÓþÄ£­¾ü¸Lë}û »þó)S±¶IïÂª½SH}7ú@1I¾òÞNÁ@úlÏ½¥]Íë<}cþ!gaÙöÜñQì­ÃB]få%ÐÞ´h]ANÿ·Nk¨*phär{êb7gÜé}n{ý«ÌúÅYA1û§?¿ÔGÇ=Múu¬´(éNz1=}s;$;}a9Q|Jc@µA6=MÆÝ#ªÈï1F-ìÈçÓS{Ñ= §}ßpR)«ýÈt÷¹Ûú@}ãèÚÑþäG¿0®'pB.#û>yI¨+§¿sï!ÇHÁæ¢Ø5TäÎ=M·!Õ¶ú@Û©§¼úþ[×Ö<FHÂY.¸=}øù=MWoö-³'\ÈVçÍåaáÇ/³¼EÇY]Ë@iuQÑW½ùfÅVO;;W2ËKï¾e})°k ±r0©*¤O»ªãî=Má¤½Ð/´8ÜçÑÍÖê±4¢=}¡tÔÖòöÈÍ9£AUv<~£>êîNÔÕEUõä?F*Ð,h<Úmª¼BÖ= 8ò¶¤Óùs]Á°äò4ø9´Z¿§-Åb¿ÝÝ_µ·ÍLA¾txbHl¿<þ¦vÛ{ø÷k|)Ô­§õûÇ(o+G±×uþhQH-	©¦x·kh%´æ*¦g}îõð,É(î	%6´Uø«sq&Lm¼ìô¾}wÖAÄ@ÆAó;Âç¥÷¸Åzaø5XñÂK(®ôøð¾4Çs´o@¬r%Ü©xÅ,"öÙæëÁ /á5¤ÚÀÈ+j¹ª$fÒf0çãðl0Uòáj°.,lúÉ"÷é­Ê[áÂ¡Áùkåã*@ÈJxg^Û\O>/wé [ëÈ;ÊêÝ¹µk·{NkaÛ>öY	åJ=}ß{Å¨L-=}åøR$xqx= ëÃ=M>²wÀ¿%_\º¶5:þctÃyW¾wÃu(%PYB9)ÅÇÞhÎ0Ä¾.â[!ÊÔ/kà"ºf¹"ÀÖaR·k²iÄ;1¤Ië:'¸þqA2ÏF\ñ3ßÓú©é{#Ã0ô!&ºv·ÛRÏÌjÖWø7%?±çÆøø½ºGªªÖqúUï=}°ã6SuÀîL¢~¹û«|+2ýßë¢·¿9Çe]Î'~§5LaÆT:òQ¶íFX¹8j¦áiªÜªN×âc¸HÈ¨øf·ø~ ­»&ùÕ&µ©"Ø=M;óÉx?F©fw#3LKÆ+ÅóCy^:@)	t4êEÖG9WÏ$âÅ»1\5ü:ÚÌ©ÌN}ø$Â,ã½!â=}K$ß#üjNýÓ¯)yO½=}v*Tâ&n¨¸ÕûëÒåC©DnÅö,ÙÉÂSj/XcÄÉâ^KÌ»~¿Ã·.ç2=M<È-÷¹FaÉßjÂÓ±y=},Ç³Ç¯¯¶ì4»²nª
yï Gê#^Ònï¢Y{¾f÷?fiq/¡±Ã9«¦}wCBª¬ºZpiüÊÃ,t0ÇñìÉaRUÚñ2ô»ÿY§û+FÐÛÜöië7qìÓàµ7þ·g¢3òpäyhDÓí]F0ò\_oKöVýÞ¶ô½PÖ²]^imfù!"îµ©|
b^ÇNYûÍ¿×ÞX>NGâÉ4î¬¹YëÏWÁÑz\§s9Û«= Çdçu<ÐëMÞøçuºRç¼t;¹X{TeÝB¡!X{5<[É¬n/ã]Kèâ1.ów÷Lim)ßC< x÷ È_éE	.M9W"}LÓüúT¿ô¼ýæ)lË§ÌYS-s,a®ØÕëþ*ÒÞWTQ·õÂ¯i¬Ò³et
}s°I.*HP)û¥¥òRc±÷é:=}ÂJÚ¢	NÈUC9ñbwýÚà½j·0z¼¬&;	è¶é4Ñ×l]õÅÂß4Z&î!îhjû~èt=}7\+®YgÊÕëÃô.D3¦âÚË(¾	¾1Sx0MtÒ¸Nt}²|º?­$7mÝÑ|.¡M3öÍiO÷DêrÞZúcdöAz%,OHÌ¿»>X@¦]y¬ùûÇãÑÀ´¼AÌ*A íùàR÷¡ÁÓíUÁârÌ3¾L¦«Tlgi¶UYáqfPýÔë¶§ë?áéYó&íÄ"ÝÖoÞ//8Þ!ÆXt= q¾xÖp ¯Ó¿¬WÂçü/E	!)EóÏ?ÜeÞÑ¸8p'/mwP=}®ÀÕ©wþÿW0ôg~e»q½	bÇ_ÂSgé7ÞuÀB9Hp?¶z£a4,ZDéP{-!1Zök²\Ý~8E±¹j=M	èjFôiø<Ä2×Æ9¿¼ßVëT¿G¡kPØh2\Ø£P.äöõqrA(þ<G :g¾= º\!QÑÍörnÏQa¼/KªµLU,Lv~+æIÛL8|=}2¾®bÊrËZ
wY'ËQ =}Ä?ÐK$Û9Ü9>Û%öÜE@ôpB4zêBwèr@Ö¯aD}F¤ÐªCPQ§k
×$ëÑö¡gôÌ\Éà¸².öªÑsGê(9©#_)çönA_ÎàÆb©\Ùl³ªëÖÚõ.GY³K´X>¡}wZ ºS´¶7nZ×üCwßÄj=Mu7TaíÒL ù¸çÕ,Goýíùê4(;,ÜãBìEÚù½|= '75¤ÎNs;óKÁO]/Åå4Dïß­ ì}9ú´¿IÐ0}§AZ|zÈ¼ºI&&9<]"&±/Wß|öGF-Õoi´kî¤A%0<éÆ]¡Û¢«AiAãZù#i"T·rå21¹-QúÖycí|·þ=}?VgF@AX=Mºâèj¡²ÕtJ±üL~yo"Á)k;ÅÜJÖCµãÕ*Zða&	×¨.Þ)ªýUG÷Í¼TA(	
85£éÔ\ÁGèlZÙW=M/^5Ì=M"r¼½ ß=} 	ª>_?C´úGG·1¤÷7þGÐ¥y²¯W°ÒºBFm;D1¬;ÂË]²äîè¬s®VeðÛS&!ú×¨äÅÎ0?mù= ±W OQ.F­Ík´¨\þ8­çôÙï0ÐEî¹k+×}ÄWD­®O¼ël£ðã:uÒ{1ª"¸ÂI:È´aÐìeÊ÷Ì­ùERSæ«W$Êt=M/ÉY¸P¾lèTgâýªú³iõÙ£:v:ÒDaq<²0å(¼%]ä=}5I8oXýd6Z-iãy,H3&¢zÁÑ95$'¿kó<ÆÄ<6 ´Ä.Á±ÖWúG<9Z¨ä'zìIVÕB@êGPëÛÞ G£»Z=Mó-Vð«éÆI÷ºÜÏ»NãGYE®°Aÿ	Ulmó_êt)åCB¹ò ÛF=}/BÅIp;1Â!ýv?ÕãkTÙÁÎþmêcÒLnÏíO3&òª	±³gñÁûy,îÉ±áßíj=MÁ5®%æl¼®èØmÆE;Úø=}Â{6L^\ ~¢
à
«ª.r DñaÒU´dØ¸B ­x2º= $+y_®nq Ö= çþ Ð[rÉ¨\oÊ'q1{½"FIÊ3q ( íº&Ó­Ec*ÖÜ6V"Ì=M¢·¥WR9#ühQÕòä]Gù:3w­ql<ø§Ùð¦Wµdy;&Ü.Øêl½ptì¶Vç4ç£FÌ"mën¤ßðV"a×fC3¼õúxÓN2Ä»Ö¤iD¯·,EÓÂÙ%Ímè¹eÇaíÄõêýgÞMâÃ~¨G±(,!¢¾ä+2Õ+P=}ø |±zÄgôªÕ·ê@6¼LS¤ó½D <yç^ÀæáË?)i à\ön¸´Íòá%­ÿÞîTÐrþ)öÌÔa¨*÷ pd;åÑö¬vRaÿº·Üpt¼Au­àªE·þ~ï ^¤@µQíîT6ü\æÒÉÜIîit°î0Fÿ0ØÕÔ¨;¨=}§¸­¼}d·CÑ2x"xèWb½°~¾ÀqCFÎD=Mºd+Nõ M>NAôæ?>¸EswÍºe*Î§Î)Ú"b¹kæVk©è Q¿¶Ë
sqÜ/+xPZ¼ZßædøûdÕV¢pì=}Ï&opÊu/cTë[ñ~Åï= Û
¼ ÎeÃòDÆ	Ëqûz§²}:
¯Wi¿,F´Méó6&#{ÊÂ}cwÈ67ív¤xúkß×TÄtXþÄ
=}Öû|y¦ÖMÕÿt¨ò#[}ã¶&q®Å åYÝ«A"qÏ~Ó­òß?	¸§F0y®)¹Læ­ò)²¶Ì¦	ÝuFÖPeäW4$BIOQ#!#(eW5NCè?
¬ÚrKöÌJ{8OJ~càp0Ö39þ#ýøqÚ"ïBqÚw­ö>¢ÐfÐÆÎ­ådayrÔ+×jMÔzçüd;\E£a d&GÚ©DD8	*Ê¯f\¼¡ÁÜ5PÉ)röwK	ÎË·5fëZ
Ö
Ât3þ
b/Ö/ª³ébCºÁq= lÿcÚjëv¶X¾Ã¸¤î)ÎìNmáK=}öÀPjÜtÊL?¿$h#á+Þ{Ó%²ki=}>³?Õkp4*÷PäSÕc,òvl´:J¿mq%2¾s
L½¨6·@ý{ ò¯Ô¿5BÄdþG!ÀºªÎã¾-<u+ÿÖ*ã
ù:o°ÒÐd²"Å*À:sÓÜQ"0ãÈ:?AEvx¥0ÞëGcþ[òD¢¶·Ü=}ÿ3áWÍ½&ãÖub9Fä§yys$ò@5TñÝaÌÜ6¨hHtv®¯0ÐæcúÃ®¸âit)W],qT/·ÌZÜñ&¾ä+2Õßùp¬_a|âÓ|¹:½Ê3ZD¡j¸(
·±J¾¿|«a}ÐegnàeÿW"Tò
në¸äôPìl%
o}/¢ºNªÔÒÜûÞÕÎú4vvèæ£Q·
g¬MÖ¿¯F.zi"¸¿Zk_é)ý±}¢8/$éæ'ö(eøü<Û<»¡#PåÌáÂÕQ¤U9ÝÚôÿñý;"2*û=}@WG) ã·÷aÔ·5¦_B¤ÆP¥ùæà¦#c½Á·>lÜï¼¶?<ôi¼qØgtÃ²­=}»°;â;+©º<ÓëAÖp ¸	-$­%ö³7:!¾¤ôÅbfh\R@Ïì×úÊªäÎí´­Äü(åÎ­àÎÍïæÑ½éo¢[ã=}¡íTp¶Åýzáç¾í]Q·åY&ñ-sÞÑ ½|¸|Þü3Í¡ÂêQx[¥°*©YÝ	îÁö>ÿÊp9úX:¿ÊwP9>ô#É§!jE7u'Åué|y±"Rø§öß¶øG=M¥õAÙ~¿Ù5ùµ»e÷Æ;ÕsCòÝg_Ó¯dïÇ?YIñ³@}°éq÷YÀ	³+åù¨àqè¡Åø¤*$7q	ùÖí¬@»Äà5AîÙ	®Ô¤â@úàê½SÄò\{nÐÐ5= t$IÉâýÊC¨wD»£vÆ?æác÷û»D}5²éÓâÓ±ÐO¸5Â»Øgpc¢7ëÐ;,½ Ò£hòhoÓYÒ§Åðíqt17NÎì4a¢.J!*ÔHqºç,§ ÅÚPÁ¬æÚÛæ¯âðÔçu^RÛXöÈ&â04Ø$ïÖÒ²á.©UzÔ	õ¤¯t(êU¯ìÓÞdVJÓnÍÒ-Ó=M
fR¡÷ÙaûÔAµf·fgÊ>zÕpWnâWlÊìpëTÖbÇ¤qð´Åwáo
ëTÓ¢!WÖw
aq*NÔ§=}®Ú\,zfz î­qJÖ= q¢!¤Î3øãÙn4îèzü$
#a«Ò"(¿«ÒÛÄ}ãÇþ*%©ð°þ­õô"öt¯MÂ
®Í&!Ù(!°®tÂÚÔ°ì3Ô©Ä£ß¹õÖ~àW¹¥IÂØjt$©I	Ôòù=M6n(]«wè|²Éêôbõt¯"®à	xÜvÚ°)rÂ)·it¶¢	±®À×Ø°vñ%4j/"·¾vBÒ7jÃqN¹;zÑFhßèøóêj3×À;ò¾LQíy²pÉPqÜÏí}ü¯#ÉÄ5iû\~ÆIGTm:¹¿Wù8ÜNÅ¾ÖÉ¨²ØË~ w þqbaö G9P5ÈãæÏÉ	Ù¥ÄÂåXEíÿí½ªlTO|\jÄ,&Y0íW¨½5Å/´À²ï85L¡³fRRËþÀ0PZ"¸ Õ|ÀÄÆ!=}ùÍµ¿kjPZ¶Ñ\Ñ*öQ³Ã<ÁjR)»Ø0ÏùÉÚÆùE¹rª9Q-°ç«²
ôßåú¶øðwI~ÊÐß9ÃÂCª¹3±k.á5S¾ñÆÒu&RßÛÝW}h§/ü¯ä DÈñë@½ì¥ýwdTv"TõOKÖÑ&2Í%lw2ì~WÍEôûÊå. _äÑ¡
Ù¼XìS7ïePTÏSaÇà}{Q<2 ú3U<ø -)Ô½Ößó"c'FäËv[ØåÈÛäü0zS°m¯É0Ö1¯#Ò¢×°Ò0.«PYGÖîíld2Ý4·F8nxÍr¾R² s¬bç! ²åòtÄbÖvC	¡¹_Âé{Î¢Õ_Eüå@»ßH¯"aBÀ5 nÌEÂ{^÷rPqI*÷4roÁ 2G9´ÇÙKÁ³¼4õîL+íj'*ïí'ÎêßWÍyèùö[ä+7+½â/= Ù×ë+ñÄ=MN%Í/Õß£Í_øÝ5óa¤Þ5ßa$°=MÖÕßZ_øü¡ÛäyÚ¥åÊpÕ%>ßµ°¢7L=Mý_í´§	Õ×á-ååo4îo# /~HÅû,ÔÝ.ooùfH Õ¼{PïÖvÜ¶bævÔ±qpæê±®#õô.;vÕ=}õ= ÞWõ²/¡Ò= Å*!O®©¤ß"¢ox	"k¥v¨ ×ýÚ'«4/§)mä®öt¯°é
fWõuà"ð©I4Û®bõt¯gxâÕÙÀ/G®Ëi×Ø^éåðâpÚW{¶ÉyláÍ®tÉõÿ»ëö´ívÕP¥³Ùb&ôÒúi®Ñ&ê¶z«µ, ûÑ!= Ánùc¼LÊ¹Ê
y= -âçøB÷ Ðar°)8¸jòýôRÌ¿?=}kað;\DÈn=}"Ü6lvÍ q<:7¢§,wt+Wa"È1	!×®×¼8ù*µÈËAÿ&õ°å%ä4×UdÖôWîòÁÆCD?g¥á±ÇÅð7ËRP»
×¥2Ï6+8Døòa_8÷Ð3éH}>ÆhuÙ¼éíÂ´mÇKÙ'&ô,6°Áonajè®àiX;*·|~Z¢Ð!ÇÕ qèxT»5ø%ýJ¼bäèbñ"D¥Ê!pÃu*/ÐÀ"÷KOÉ¸H¿X®{¦¸ªÖO2O×µÊ£¬.DÚ«÷¢ ²Íû@s¢]=}1.òàó/cF¡ ÷ßýJ×«êæ"ÇC+ÎBõÑÂåÓáýÄ*½©ÊI7³ÉëéèLýz#¨6?Zø3NhÙ¤dNXl· 7¥^Ír°áGÝO\ÔX¬éQ#<ã7Ò¶#yÖÜÞ¯·±þþÖÝóiai¶ÅHSÂ1©gÚÄI:nçÌÅs?Äó«á£¿ïÂü+U^#eØsm½Ý»Ö%@ª¯ÅAä\ ÓùrÆ.F³ÆFÞ¢:8©ò¸}X!1Y_uwû$=}'N;&DG ¿ªåf&2o.ÚÊ^>F¢8¸i¼UÔtéd8ÒVA$ ½Å_K"T{pPù~æ½Öå\¸C= ¢Ëj¤näÖ¾Nvßkz}p-H)Ðû½ð'A2W45ýôÉJ9ä®ðóÙV!B|LËÁ¿%oX|$²YÚ¤J"{|Ï«bóq¸ií~ ×³""þÔ^/ÇN[õíF Óßji«<½J+Oó=MèJe·Ö0OÖyTóTÖQÑ\]Z¥*?#ØWAda/j¬®¤¨°µÅÁXdÄ_<ÂV= ¯ãã^¨OPu¬\dó?a!?¿ý-õ>¾A2³~L­ùIÀåw {"Oãk±í^Ð.¨¼°WÅ½ÉF½ ñâÜNåÖ!=}c°4×u}Àª$¢åb=MÆÈ7§>~ÞúÙN´?ç	¯´í}LoØ¿áCÂÜ"i= ·©ÂÃÞ¥<7?´ì¡@­½Îk/±= °4Cß´õ±*°lõìåJ4;ÓÝ©bòpóê­dð~%êdó´[ÖÒì°ãÌBw!?*ÇÑåc_·í7úW,2öÞív½#¼ÿºt<È àìo
ø{uç1lm¨¿Ü8í2Ër=}<ËOYâO¹Þ)ü#óZ ÿ§éã¥TdÃ0wÎ]ÙÂæÒØlWahM±][Õ=}Ái{VÛÂ°º­öÝSlçcÔôJÙYw8Ó/hÞbrÓ±ìæÌ¡©ðphsè2×æBÒWÊâ.=M0¤Ü3þb	¤·\¨×OÞ<M	MWìBIåøh8Çimý]qtõòºÇEZ
í*Ìi9 /rf5òSÝKÌ*bJò@¥tËéaû×L©¬c$Ñ+,Ð,ªcGÙ=Míyã®xÑ|Qy5¥iV;JX»*Â°p½½(¦kè±ºF¶CU ÏÞ;¹%Q¤î?¤à<âHcç«\ÄXPôÊíKÊÏÐË!U3ð6]ê5±(»ÖdEll\À¿UZ -cfL6û¾g.A7=MÞ);mC 'FÞÕ¿=Mk´aÏWÁJ,ºÈnóSB?ëéÊÓgÁo[+}ûÃ;yky)þÍ!QEÁ$Lt=M i=M ¢§à½·/k­þsâNH-¥rû^Ó¹R]ÒâK|K»¥àÿ.Ö~bµº­íÑï§¥ûÃ£å!Kl<ôæ¾ÔUâ|óy\ÆÒ?oëWç;¾ÑùW^Å'æNÍQ6Zr
ðøP-fÒÙq"-ýïÎ;­TEh)ßÞwãúy«0vº2üº2Õ:4är9¸ºì§ªíÏçMtªú$ær
âs4 v'=}pÑëÃå¡+æ©Oï÷V	hJÉIdB VJÈ5Ye-55hî°ebîÆÔ{®Ç¶Â ÆÞ15cýÎ_ÑpÔaëÆa°/ßjJìo+ghrKXÐÆQVÇÚ[SÖÌDv§D0PZM®ÞëS1&ÝÆü?D¹IÝÄ Î(õlZ£oèÎm±ÃøÑÅ½,=Mó¶ì8ïÖ%=MIeÖYÒ!v»Lî EEÑäÆJ{s¿n¢
í?ÜZÐò6×Ò\gÁ.Ã°]~Jg-d<¢¨0BÏìÞªþhZ½æ@rÿ@«½GÍC£òLØxvÑh,µWÝÒ±ßUõ£àh*Ûºj¬§´izÔ#
exÕnÒRîa»N?æOS 4mù¤z¿¶óxOâ}eÖXõfjþ¯èWÓé)Åt!:NÛif.#ÍÐ$°Õìm#[üM¡ûXyÙYkö­göþNÆIö®'Ør}VÎø<éµl]±U²_LKõäØKôFLÀiáNB?}Û³~ÆöÈ1ßu,[0:4¨3Þl²Æz6Ó&®?·(úÆa;=}Ê¸=M%ÇÂ ¢¬°nîß'tO<À	ÌÁ= JêtD¿i.°ÿo8ÙÞéY0I ×mÔ@Öjxqiä»Ç±ûnÄÙrÛD8äNêþýx¯ÜÌÇTþ7å çÏL.ö©´lèHqï°Ç-Ý1r6Ý= Ç$ÉI;åv»Ì3ßç§à_?WO­3ªOÚÁo /Miéè¡6HÞvuûÛo	ÆT\z«º=MßYÑ¹L NW,ÀA?ßîû²É{?}Ô=M»HÊ¬Á  cO°% âÜ³«,±»âô;äÈï·zÚl7W ]q>wÌDåßé¢ç= NûÁx&Ó¶k«Å&p¨£ìßffh,_·kÂQN>NHEÄMÈýq ïa c¯Ù|¬·ÌÀLî:¢E%#y|xÜuÃoÛ­ò¥]hQUT$ç)së:Ùê·Z¯ÆVn'QPýoªÞp³Ìy+F8_' Ïé0-¯ÔþQ z7Í0RÆâÞâUÔ0æIq¦Á6'eý2¼@GöÐï%+Ø}ÖÓAÒñå-D-µò ñ$!1Må¦7aÝhTßñèæª³Ýý¿]L&^º888ÅG= ©2y¶Ó&éjA*ÎVèJÒõA?W¶(ó¹Ëç/Q¿t±OÜÓ%ÈKÊ=MTE ¬éÏ¡F|¯wq)ý÷; ×½¡ÃdÀô=}f«¬:>$Çáù#ÜÂ+ål·ìîÄÛ#ªÓ!%¦dc®·üg°ÆêÁGd÷³ÕSÄïbD|Æ{:}@'{&ì^æ^% ¥ózGSAfÆòK~_ÇâDd}ùáÄ·V
ì5!£[¯*ÑêíÍ1ÏÏÇ«WñÇ©7%y7·3yö´Ø ÍÈµêxCùÃ¥je'©Z±¸ü¯ÝO¬åPÈtÕyMQõ÷)c0=}"&(¶7ØþvâO^Â$=MfV07>At,õIÈþ%VH	sQ;p}¢¨u9ÍfíáÇ\Ñ¥¼.(^³ú'û;Aá#´z>[¨ÔeÊóöI­öì·wÖâ+Ïàqarn]ÊÓ¥ÃV½ÅYED§ò2;u/hnË=}ñ­Ï¼¸IÙñÖêì³08a<È>2=M%Ã« §ðæ<ñ;)WE³=MÆØ<X½×+îåim; ìÕÚV5ýqMLBÐ£ù-OûøcJâXô.= ´àÝZð£³OERëvÊ³·ÍÑÚ&¦ÞJw×wµW°§?($mlï99üB9­­2É.ìXhh!?ßÌ	Ç÷z
Hx%MAYP%3#>3À­ãñî?ÐÊëí5r¤£ÀWéZCMÏC,£h×JÊ=}gØJ÷¼t=}ZFü+2ÙÞ)wûíµvØ¹0Iu´0u¤0i0%©§ÈWqà{Ìò²'X1#ÉøNë²v1©vöªöÿ:Ã1Þ(ìEØT@ØèYòò¢V¾oÜøuÈá}Z#Æ«Úî¬Ôot­ß~'UHS73'ûÞ¢rÉÄ0aµG4¹¸Ç$@8V;º= #C(ôEU¼ñÁQÐle5¡ÊpiZ}*½/"öÅf¾å«ÊöêX§ç®k¬î}oTÇÕz&ÿýªÃELï@üØVh)ùtfZ_f¸#Öú<*ZÈXª&>;ù»·l_¾6ÂeÈi=} ¼v%î+/¥¸òÆ£â"Zó0*´RÍSÅü$¢~v?¯¯ßîÁ1eóS#WøÓ¬DÓø;þKÂßÞaqgûLñû@Z³qÅ¡rý&ÑunÞ'zcaÝMk(¦òÌ=MâaW<æ¸:ñÊßëðaÂðET/g¹v ¶Ê>£où¯ûéöp´¿|ó£AÚ_ýwX\QÙTn¿ÉûyoÊù×X~Ùî
£ö­C¶r«czR]S±Ë	B¹ êQ¥Üî£¼Z3B²· Ê*ÿTµUÿ}tÖ¼PPf= +czÊÙìÌ»éÿÅ_æ);Ã°ÕÈ^qÕ)A¬N¹¯ë|èS1'c¢fgZàsÔ,§yúD
ÌÂ·¬N=Mzòw¿Ý>Xgmaq<*>£%¦qsOºq,ÃV
"Fä. å²1<n Ùì&2ûQ®øùraWkÄá¢ÙHÐ[[³3)'W<÷çîö^n-ª -BÔ7UváÈY943/Û#lþ= c?Ø)gEµY30ö£¡¿zYá1°jä¢ø¡iÒæU7¯;F9u*2Ü6¬mPõgÅ|Ñ*UZ7{¸±âµçÄa. </gB&â&£>ê¢^U-ÛKT(ðFPæì+ïý5{óÕæÜÅÆíæl	²ÎÁ	pÒy°
ï0ðP±á°¾ã4Á^Q5(å³´äãW>jòâ¿q.]o¯J@ó"iþ= U¨-ïÐÄ]8y¾;±Bu%I÷º°avm1	ÛË^'GØTOý	KÂ	\8)ìÈËQJ§ä$H3}ã5W.}×øÐãmSùÉì¬ÙêZ¶É= {ÿ<ÈUû÷>á;w6WFÉD³q;Ýî<d=MË]2O;Ã}Å5<0ð:vÔuÓÿ;Ä©¨lØÅ|BÖbñèe2
ÙÑ~Â)!'oþ4-#û3×ïxî£þÎrA0R~bÓ*Æ®ùÿD%ºwçì£Û ëSl1hìò¬æ5óV=MUôZ7»AÕÑ4 Ê=}l´Ê
°ûu=MæÏÂî/EäþVÌPñ4®Ô×qncÜ>½&¬ùøÖÀ&ÛBÚº TA­8×¯µ§öÆ(©ÿ§L¸÷¶W16ût¾üùôø	hê®n7·#'Ï{ù
çí6ïlÞº®/n9²àëbåpÉ©Á¨á¿ÙÚYþÐ>½§Ô~Ì¤o3úú\Ë'ë0áne¡¢Tr?q9ç*oðë¶= Ä8×	íÆÃÓÖ^©É5/ãÌWÃñc±ÿ}LLEÔô/J<O#Ôi5;QkÑ¨G¼osýÈ´¶"O æé&hÌMeHÁÈdÊezFD=}Ý,J­¹
IÁ^eçdEºê56)U  æ 9²vûö9ì)=  8 f.ÔÀPS= 2¡K+G.bÛmÉgæQ¬(ú']²í$*ÊG$Jïù´.ßÍÔÉ3= ZgY>&¸úº®l3¸Lv}KôUëX4Â°Åh¾nkSÈI|§³ÃqX½ü3²Íh×Q¹-"l¬8]z5©"Õ²¯¬@zç@h2h­³*öä=}e©,æ¸|uöàg«iESb$wLuãDymg8d
!8­Ê§¤Þ)ÊÃQ(º>(ñ°}Ô,d¼¬Þ=}Ï½;Xÿx¹KÄñ_ö½~ñ&ÙâêÒÎ\~V¿xWòULþ^¿Md = ;)r-°ª9éK,õ(<æ=}È~9ÑV{çTGËHa:(	ôÄGÒùâÅ7Õ0lýÌbPÍYñ¸w)'©6ìI*@E± p­>(>4Jú¨0ùªßdµD8+èBV#íDKÍ&¸gËKcÁM#tJ£U¡£Fu°,òÁú9§&Vþ¼ óÑSàäª¼ãÐ¨Ç&
,óÇ ÍÃ§ ½©ÕÉ«Q0Çdó¶¤Ü'UO!	$·´ûbéRQØkð°ømò[ÍAí§ÀªÔÒyj¹;T2Ûs·4cÚ[Å¾ª£S­ÂÃÇÔòOFù,±w¡éD<¼^îCÏ|&Þ¿êõ¦ÏÐ°¶¼ÉqùÆv]p«.vÚøcëTÈ5Ç3å¥óÊ-Ë[C3ÎEûî*Sâ|¡§4=}ÿÛ ­Îïìó8éqÆvBXýéÈÑIÊõ%ígæÑîr
Ë}Gx¹lúâU%ÖÝLÍqÚNÏHG%q_¶X Z çÊkUÇ­°fs¥¿e1pµç¤÷>X³"Ì&PÏlê=MÛS«rÍÖthÉ±RÒªþ|_OÂéßZ= 7vH3Ä0V6e¸&ÀÑØ\c÷cPÑ\*øl?vï*p%ÏÇ´ä=Mfø½¾íôýøßáh6QÅõs¥ìJp*kO<-3óZý2ÐúÆëFé©¨hypÍ+,J	Bâ³KvÒLyÅUlLØB<²«b±+"§ê2crÈ(záM«SÃ³X"ë&çiØöN& ¦4õoè<im{µì1q3ï2/_?SP¥¿C]¢©ÎÉ<NÅ6Âi¬yòÉÙ&îZïÔÆ*Ö(Y/åN~·qbSZñuN-YäÌùG²JÀd³2¸ShWî¨õ¨qÓ¥~ÒL¯Í#ÿ«}ïÉ>;ÜÞ0p'Ü= ³§~½¼VMo=MãÕg\êd-»7øGtaùùõåøÈ©%#ÎõÚûu°>¥2Í[ZÅ<
è¾OJgIÁ9YÉÓsÀ7ÈNâBáöIS£+Î©õ+À'xQz«µã¡àË1;ÒQs]©þñcS=MB¦,ëÍÒ.wç|Í$Gí>|«>¹¿µà±hØo#ìAÍH×Â¨Âhàk~t­H?]åuùCßé\1Bå#»\ò±\|û½@Rpêj^ØOHBºÃË²Ý3ÓÂ#
}/²¸{?çLîüpQmÍÕ2£ÖÌ'>ããä±kÔ
Ó{cµënAàåëfãÛó(òÐhèåö\ã©«@_às­¾ÿ3%ñ*hÑHcèVÖeÝÄû7S¹ aÕ@gØíÄ·¾û]m|ïoÅÿa±CÌÂm»Ñ´Bù(ç=}·q§Ð§=}¹ÒÁÊ'¾ÄfYIÆ#L¨]6mWVW(vÉd-ö§äÅïßáKe¯hx®Yí0Å¼¡îS&yMÚÏÛâUûéþð'Ðëlb7= É	Á# ËI=}A~÷³J4÷øvJ«ùÖ±­Ï£ósmÁ²=}ÎêAÿ)C~øýÅÏ-Uk$$Z»ÓAÎìGb<=MªT9ûÀæ+¡é«ADÁ#×°¢ãei.4oüwÉu%·O= ÀØ±×
NëÇðÿåk/ÆV3«{Fÿ_N®Xyò^<qR.²¥6DË/}ÀúÒlè'C³ÚÿuS}QdÕÉû L½²jjáÉDP¾ÒÔ^;#KÍ	Ýð½dûñMú+¡vÜØ³§m¨ÙyÕÊ9ßÿÉm¬¾FÃÄHôg^v°õX§@Uæí]Ã
<²© {½$UL7%.n¡î¯àÇÿ-4ìòu<ñµbyKÿ;mÌtu-§zO\?Æq?mÇt®¯!&¶¤×Ó­(®okXÏÜÒ¼äG	o¡1¬nÛôÒ¶l¨©eg~¯3zDfk©ß*¯/ÃhÇ^mWAV&	ä´rjp@8³<¹H­D­= ?²_MsÑõïl³VÎÏ½NA.ÑTÐX¥P¾ßó»s=}Y¥È~^Ë°8_ððì=}m_A |Ö'9ìûÌXfî¸ÁÜBx£ Á«ä±£±YVµL×ÃÈ\v¤PñÕ:xÄ}xR©X¯%´As_?³u|\FH5°=MËÍl=M=MÍe@¬+Ún~ü¨QÆ4ºÈãÉü}µ= 4ö7¡Ó©vÃÕ£Þ)5ìÿ/kÝjL)Çïîám=}rö¨Iîä eàvI¸KÆÌW1¸Ò£üw$ýJ)+c+9ñyÿ§·ü2kéóá]>í¼Q&ihÜïû×7lL rÀÈý¬/sý!rY=MU¹Ú³÷õWøQ£QrTÍ-õíÎ£¨©Ù-Ñ4Ø9S70>aÈèÕA@æãY>myóìjîêVêb³I¶;Õ;U,Càj¡ìµÈYÅcÄc&B¶n ×p½l·dIWï\aGbáïÀ[ÊõH$O¼ò.SIyÏD"øÃéÙk­g.ï;Hæ
 /IY!nÕòí½'µé¢3xóßíB>Èê'LÉtÂÔbs7ÛÐ¶^¶óµ¾à1Ka\ü A
JðÌ&PE¡xf]È_Þ÷îöB°©YÉz¶íYÕÚÜ*«=Mì^¯¸aû}¬æA¹§f¢éeöv§= çXªO6³3þ&SÚjhc©¾LC+¡ö~{<A1ué_§¾º~×vd@¸Ø\Åùv·-?°þu#êLyïF²1(*é6_ªGÛyTÉIêÓÉ£ }ÚXÕ´ó]b J¾Èó¥>¶ú	Ðs/æù0pë	oà PKqÉ'0Q_íô"°K¢= °_62/¥ÏºèÕÿ
&GhïoIE´5	GÏ= 1/ìüÙF	çláFå³ÓÆvéa8
Î~µ®ò#cÎvYJ3kÖä
 kî%£³W¥hc$®WÜêOÿP´Ä&YÕ8À,âpo­»1æ@*K÷õZÈ\=MçÊæâªòøwìr\eî¶ZÉ þoòbMòyÕE©KcÕÉ6¸ö5\ ±ªÄ'àôMêø­8¶Íí1AjWyU(áW #¬Ï= "&hq,ÉCS=M°7ñB6¢r©æ-I=MÊÓÂÆø@_YvÅ2´>k³3åX +£Ê=MÒA#äI=MdæV$û¡ÛÅÇ_8¶äÖ­§/¢æVìÙtÞ¯¬|Ì§QÇ¢zuÈY¿÷éCy©ïé	9ÛC¸P´©rÍÛB´Þ
ÏÚó-r¦ë´x¦³vyQæiåÅ&óm» ¹l°Ø¨Ð>o| lÝ¡äöÎZ.k=}ÒùÏ3ÕNÓøAå,ß¿;ÊÇä°ÜcªÃVcÎ¤WÓ|ÔcÆÜ= ôZÍ]]ÒZCvh|öõBl¯¾	/êÞ"¡XoÁÀyÄ|Í¼8nHR'ì9äìE¥¯LY#³LøDòXºC1\®VëJXª|1Dºk>-­;ù­i«tÃ­\*	o*+çR»j	ÆcÕÁ£ÌüYUòêvTxÓ¦
Íð SuhiëgpíÁfmÅÃGWkrâ= ¶£Tn÷¿)þ|6!¹4µC9ò)MGÁªÁ Ò¥3
y+á6)µbA=M|î,MÂ*Ôy*ÁHÕ&J·Ë..·ÙÐÅKé³»}[­ Ð=}56GP7©ðÆu÷PNÇÔA/°î¹= 5D§·èîKU+= µ!aãTàõ*Ø®¬Ú&j¥YÞ£ïnÿÐÖ*"x=}T]o£ÊØàÁÙZ%!¨.ÞÇâÏ×»)Ñ>è¼´ñ3-ìP+êsñÁwsåí"gíý´@.°B¡(¬ìixX©ÑÂ,vÈ¡On!DTqâ¼¥åàé4õ}rÄà!SÄp­ðó{þ¶£2
»gîø öè \äÈ§Ë:¡(=Mû)$2~ábbå sBÆÄ6¥qñÃä°OáÓtã2>9±HªºK'²K E}X)D:p*¸õÞk= 2Ô8!$|_)j(Â2_
#â,ÿÔ®»>T¼ î%ììb«Ä¿x[ÊþGÍ[K{p/äÖ±l6g0Û1]5ý¬z6øNzÅbAºùXðwÑª¶«Bý]Ó1ÛI#Ãìj Q¿\ÅQ8ì°Òt*Iªh£º/ÞÉ¢ö\Ö#@íDí¢tA|9õ&ª£²T4µ-GYÆ³Çò³sRi\À+^å?îþ[is¯ü
£åËøÄÆâ/Ñ KvÛ]rwðæ;Sj{iD|W	=MÏÙ&=MÒÚSH£n©«ÝJ.ÀzNÅÉ¯ú­Ö)<mâüà&9w¿ª
T[âÂ\;íII]ÏægÑ7ðÅàvÆaÙ+¬°2©õ¹$ÓMJ½¾V[k±bFo¶ÚEU{	û<ûþyÆ\=}Ç½¡ÿ8ª%·ËJhé äHjXXûØW$*ï¦ê¾§êð°a£¿dÚa$ðþÜZÉ·î	UçWï¤YäÒëO·¶¬*jú¦Â¿q=}ôÁ;¶WE×vÜkÂþ¬[.Ù@0Ýòxz/Ô¿Ã¨¸'ï+xªYGga¦¾ªÕî´àÈW9Ú¢®~{«cMàæj«ËÙÅ0sbV8(çâíÉü£û§BÝ_ÄçeXI*ÁXiË|= »»3È¯3,pWxØ6¡¹=}8hãÞ¸sê«*ÕÑÊÖ(Æ#Û @I¹]u¤ï.÷ðÕ;=M×ÚíïTWf97é à=Mkü~._´¹|UÎGTÂÙ-,u]ØO©;Ux6dy2ý3	Ô{¦",.YéÞeIàdÐ¸scqÞ»C*lÉ}ÙÞ £¶*Ìì¿Ê::ÌÀ½#ê:8(·WâR^¥«±«éDë«{úoÊ8\ÇÁgCÓæËñ°´lxèI
éåxû¯*ÛÄ_÷gj  ÷L2½|ÛÓd¡|ïÇ¯6ÈÚÆ±²¼ú¬¹åçQ£OÍq}#?µÝ·Q±½ÀKu+C©LôädØßdë©ßx*=}Ò¼k/õÿ¹ÚtÉÑtÊ¾òÐª-e9"öÓy(Â¯óôÎq3n·ÕÁ³Å\ùõó;TóLò¦ÛÞxÞõO^Ò²y1°|eÞjVx d¡;]¹
ÒL@?t©Çzb4Ø}AGyøaoµ,p9¡F®¸­}K[=}4E;©ÞOä3¯*ëA û¡Î¥»»iXÚ29¦åp
CùaÈóì= ß ½5õHúqÙ¸·Hàµ¦YfñoG=MläæwTÊ(
fÍJ[0ØUt¸ÛëÈØµ(=M>:)=M.vdÅÁ:m~ö4  º,\9¢&ùrYAm5¼'ú:øvÒ7ö5¼^Ö"R¯ú:Y?º+4'Ðêîï°pßòâ¢º$PÍzOJ·:ã'3T,æêúÎ=}ºX°²è)=}Ç";¤Zµük]´wÍÌÈÖ¢ÿÞÀ2Ý= èAfCÝ	èï:Á{+Gy;-usfc$tfkõï7úÝ×Ã?ÎK 4U:îê$wØûòæå^ÉÐë?^*OÍcXX³MÿDBYWÙì¢W~fÙû;AG<=}ª«I´Ûþ¹¯AQ>i¼í7ÓoñÑÇlï3¦ÌWa-Î°²c°A²;¥+ò;IÈªoëÑ}çÌãõy ÉÀ° uÖ\gs±°INOU2»=MNuT
ßãó¼_ølq%TBÉÇ¬= Ær%nC¾#¥5û}\·ñø>T üÅ/'§^=}]·_÷÷FþÝÐÎc+mâ}¼à i!VKY ÝWj%_oz¡Î½@ÍÕËU3ÏÁø½ß%­J^P5ú{á­ä<¡©æBùè¡©Ø5uo¼U«÷Ogæ<î?g½ ¬¡T1£ª¾äo®ÊÃ¶ÝÁ,ÎgKTåÿ_ÃýÎq58-YPvÅÜeË²î=}-}nÃDÙ¶xþg@[ùçAÿ¯räáæ(­z!ø| N{ý_B¸¯&ÆQÜH/?PúE0>qWz5/Õ ¦Ól*$KxÐµÄ6f~!0Ù@"R}tÕ%«Ñþ.ÒÄæºtgËíªÄ}]¢Êûº!0t»­ã]!«ÿUþ²Ro^ aV±h,^¾häâR^·ÁÆ>¨¹¼^=}"¢böí[ÌÔ*íÌûngQ| nÑæuðfa&PäVs#3'ÚSzÍ]Â¡.öguÔÇhÆtk±kdIAEæ Ò­Vüe¼>	^ßÄ©ÈÑE¡7ôµÜ
Æ¯8¡¬¥lRâ l{ª9474§aq_b÷[{,¸¬ÍäOz vÝhÍìxn:¾È¹B=}UõÎ¢Iz3|Eð(oÅû¨¹vºòÇå¹îâµ¹U_Î 3¯ÇO·cAoiýä]r·Ì×ü]Ä&?úù²&:£¹Éaºï)wîaC¯kRq= µÓ
{| â ¢ UoÅc7)~Áûu©½ö ü¦_Ôo¤ätùùX RäUåºqZøÚ¯i¬ÈLésB0®Î^z»'8o!{ê¡[4#BP¤ÿa+\¤ÇõÓÁ.ë®.=}mCí±·rk»HG@aÞr±nsFzôàÆeÞ.½ªN]° ÿ*°ø×ñqÉ_]Ù¢2ÕMõE%;çåtoktö¯wIMP\ã·§µ9¢eXn¦"BÓ|ç8O	{õå Ë°<¦úâ)Ùç+»Üõ±ÂZØØ<ë?j«âcZ÷ÏËS>°¿Pöá~3Qs£/Ôkjû4Ä4aT1bøÂÿNvL°ëÀ¢ëh@qh"k=MÛLMé~´\±þf:)à6³N&*c;:J/Â
ï¤ºñÈÓ	RãÄ×TJ VB?ßIMTÆ¯ç= =MùLp Ó¢tÐ§­Zµ;
Ú¼lkÁW	¦lÆÔ#]wÕö	ËAQ²àÅ¤<$¹i³âÅ~÷»ÎRÖhµÞ»|= ïÖôÇòÎcþ|þêißknÞ¿¿vÇ»ÛÃÚVï)5MI+T.{Ìäg¬]¦îE+i¤*çûfB£J:¢Ðp®Ï«lØ´mØ½y~FË9 ©aZ¸Ô1Ç=MOU>{¾-tÛë oªvH*3µi-= »}I,yàÈ¤ú}â¢¾ÎEEj-¦	-IÿáùUvë÷þO6g5Ýu±v,é Øãì÷¾Ê8Óìü-?vÇ Øc\a©´Â ø P©-	cÝ¬·¢}N«§Çõ3RÎ½ÁÐ6ì]m¿= ¢ÐÍð _|m(Î 3SÏèO
ÁÝÄn1Ü= ÔÉ'Tq\lÛKnÏKwY÷\³KwØMw@ü[³UCÙùMüKw±½¢_³WCéÇCYvü ÀÁC®TünbóÚÃôLÖté¼â=M¹L}¿ c©§$¶/ÒæíHÙVfAR>¿÷?eZ ç®lhé}"Ê^t²<A]Úg!W9£ç@nõÀlLÙçÁVM«¢´}ì²ªþã[ç°¼{ zÛºÚ³)8X/8¥Tò¯5"-Q~:¸öiº+UX^ð²eyA4vöùP3¹^3cG(ßGaÞ9¡
·51sËªZ]ñ½¤Â°}ðÁ[P= u·eùHY1ÌnêãXJªËéQSÄÄt3RL:o®¬jÎ°è"ÖCr¼)
.SÇ=}ÀTúþ,#muóFñ³/MõÌdFóxÜZEvsÂ^._íù}Xé³Éû>¾@Í¯þ<k{(ëîJRR¬^~jÕÑ¶v¶£ô
Pt@}v]ß*¬ìOÚÞ6ïDâogÚÞ½]âo¨y.|n2¬ k Çä½µLÿ^ôÛWP4²óä¢ qEË,;Àj¾4ìcÊ^±Qæ²åê×3By£,®ÙXB^p^f_Öx4gÃ´WýDÈdj¤VfõÚÃsz¡PÍÄ
>,dÊR(F\eéM(sêb Úg &R2y(ívüÑ_Å·QWìu¬6àrO-@ÂêRó{z£Ãe@3b&]?îQQ	x ñ ²1×ÍÕv*)GÛ¿sw4EXç{æ¬ÏßãÑi§MÛH¦}¿ØÇÝ0a±	Áë¶d1Ûá0aýÊ@|Ê&¸¯éæ2=MtGÛ¡zy?°IIÖñ2´Êd÷'¢~<E 0D¶ï&Äµ"ýÉ]@çCÆîRLfyàb«·)±·)n3$k¶¼
®z3øÆ qgá¡i\é¨opÕ²+7±«ò»ÈÐFzå2d&5Mõæ;>Ò¿~DsKÏÅO_"èð,æ¯1½C0yyì\>ÐøIwJÄzý18wã§.´ ÷¼ëøE/², ñ¨Õ+( «ì¦°[ÊÞãÚY¾£Aïe,Ð¬ÞD»[[>³Ùùã¾g¾¯B«ÜèPÁÓe¯X&õW¶[%½Õ}Ìê*QJðv"yAß0Ø0L¦..0|Tm!JS¬pÁXâ«eí\(×¸P;Ó´¢+<Sv ¢{àõÍ+Qp1Xµþ	ÿùÛ$¹ö¤Bd~3| ö¥Iawô±O§ÎZVôëV(CHn!>¡	Qä]½¡Æc(m-©-V,T¦ç0·~"J.Àê±t}Z£fªtm¡³gÅBÆ¥OM8¥ª~£ÁÑÆáÈÑÝüMÏÚ¤ïV­+Q¯~Gñç1ÄJÿÆÌBgh%Í!'(S÷äÓ²m6ôÆ%êæ|¥W½ýv¡]²ÜOëoõÖgÅÑ£pÍºB °=}dWL®;¨øY_w{ø3µxÊÏ¨¼éü3éõÃÍrÁÛ´£»x|Wñ<Q;àU{=MnêA#Þ<¨@dÊÓCÄukU"Uj¿Y-V÷(DHPµeùmòYôPýR§´ªä¥·Ïý°ée»º^ýLn®Éå%DrÞ'Y%?ï0l*'³ÂöÍTJ±>S5!I³Ju[V*á0h½}áKÛ9áöY«h°=}¡<ÿÔÂ½_/æiò¥¡ÝÞ#è±'U°ø±É{í6fÅ>±p4£ÆQØ±ç: #ô:êûÜËõ¨cÞíÖ\®Éòøî¢îRZ#|Á)¢#KÄJ_aÝÓØkoÑWp¯Y=}^'<Ü¶nm}T¶TyQßÃ±pZ@|½ã{Zsq"¾	ÑÒ¡þ3ë);Iô»	7&[ÀhBáßJéIvï?¬¾p®ËúSØÆÞ Ï­á£60¬ÂfX¯ gWb=  ÚÊJÈ£ªQ¶vMËÅ>ãc-¹¾ùOäÔÎ.0tOÈV8_¿T÷zAÉ$p=}(õv	+ñÕn±@ÒÄ3Ê%voT¤	GnX¥àáÎÝ¨¢(5®¢îR(çÚím]+
*/´j0=MutîooÃñæìø:¾Î~.ËÉ6D¼Ï«wÕ£/ÞÌB
sÍÔ[H¼#Òb~ÚóB'µQQV(µb v³_PÈIÛûÄ	¦j3%Ê;~àöNÕY7Å,Àuu´³~[Ê]úaÆjÊÝ¤áªs¯*6<Ò¾S
Å5»¨r:[¤vä(%ÏÈ\|õ1×sìóh\|4Ò<Ý!»S1Uß= 
+\eE«òNÉþÐ-µ¨	¯è&ë²dRÔP=MlÍh!)º8ïÍ²Ä´ÄM4¶Eësi±SÒ2%ñÀ²h%zBL$ß\UûTc³Dáµd¤ób¡EÃ:Ë¼>S;-LW¢ê_qobfÿÞ[î¼ÛÞå3î¯-!idLVUÿ^UDÒLL {ÌZhø%äÎ^hz®ÊVV®M9;sðÔÕÂ$¯¹ÿükÒÿâÓÿÃmHlÓ_J*hÛx¯z	Õc1Ü$ÐKB-ëO[±Ïü;¤^¿6"ß2ýåv2Õ¹¼Ü!xÈ-IK ÿoÂ2E4sGV4eF"Inîq÷|	ú½/
ÂË9$xø6%[ÝÎÄñÑÔ}Í¾14_=  ¼Úî}3¼ ïþõbêÑ$ßYuÏªÀ¾ûPs;î¯¥··ÝpvsäRôL§ÈJZgåÒìV¼²ÀxÒ%xÓàò÷Ò©·ôÞ>Ô×µ®¼ïh)¿£pËËÄ§HôgDt!}¢ qÒ4"®,r¡­$à0#ç\lí §iæ/ÁqË¤$óéÑá§uotÎ³¡,´ãcPçÒìÿM¯'4zÞ]Ô¯u@EÈ
&a¥¯ÕáÝîuÿ5·L¦.çQÌÞ]=M	(Ô÷Ïr®¡ù©À4µé&+[
®ÈÙMYQ2o3#üpÛ7¤+")
¾ú*9y8Mñ¦F]§¥«'0^|°hs4 ½YÔæ·mÉöOøÆ©ú¾8[àÎ®¿]ò$«ÆV$ßVLßWÖ4P ­#OåXµ#°CiÔÚÁ¯$¨åù$(åvøÏ4ßÂùN­¤ÙÑàè§²®$c4­!}âvÖyÚlÚ*í5ÀªqÒ)·i4·i oÒyv{¯sêiØü[bí<ÖQDyù¥ÄI´T¨Ãµ×Ý¤ X§!#R5ù-¦ÉÒÔ@Z÷{q£ ¡Ú£d%~Ýº!¹Fä0û@Æn×óº*x²þInþ
Iføþc«
*û
	ûiC1#ö×ÊZ?ÅÖ¨ËS¬¨KÛÂ]iw,Ç¢.7= 'ÖÔâc9ùUlVÜSìà9m©íHÌìì)oÎzXÈÙßÃ¡²6ðÌêrÓ¯´%H,"s= ®Ùÿ(Ä
ö>¡)á§rdn¤bÔw_õç ikOº¸ny«lµµùp51ewfÊÆPè{/ç7òùfÃåÜ 1©Ý¦NÀ ú­7! ,¯°ÄV}Ñxü£ÀÇ·LÒ<à.?îÊ«ú^tñ:£ØFÚºo87è$"j4b«¯G%a«)ÑRSøåäµ-a|óÄþaÈåz¡v¡Ú*²"ZVGv°ø¬¶Wcö#z4 ]¥6¶gÕù$Up;Äz6ó6½-YW¾ì}@EY\¯!ø/CBÿ]S&äÎ~ r*ÎÁÈ¡r!ÿ«F'âetñ(~ê­ûh2u2ÆI_º±Ëÿ¶|¿"VL¦
Ø* *¤°÷2îå)jrû#ç= YqfLé|pª´¹$ZP´¤Ì2Õ:þ:^ÕÖèDÝs]òFIêBÞ*ºL>ù¤K¡Le*|.Ñ}è$Ì9ÝLÖé·{çZÊ\é ¨ÂÃÊ©UºÀbæÈ%q!
ÂðÔe)j{Kd«B3:	ùãÞ(Ýß¿È_Ú°u(î áæÑ+&^q¸Ä±z_óYÜw÷=}:ßn|ÚPZæ·ßâöt£ú"Æ%
âç}t=MLÐÿÌFÅÁ,ä^¤À5¡wüÊ¹ã¥I\ ù÷Öþ®Dq«^ 
Åb[Ý	B=M~	Q½zaà­ÞÌôEÈ¸ûEo~Îéo>Ï¬M:ýíÀQöÜAOºZ¢½qY¢´ý¯eMGQæÒ&¸8AÊJ%|ª ÀhÁòÄèà"¯Úx#U´niG¬Xåªs[ p
¹TU®ÄÓ5Rç%8tæÑ$9Ç¶#9ÏF¯oTì mÍ[Ý7E¥hîÝ%?K ­CF=uÚ*Ô*D8¤/-oµtÒ#oõRYÁr5Ìê9êÛÊ:$*¹zÿQ1wý¦¦ÀE¤6%¥UQTæ§Ï<
¶$§Zàûfö|tXI¬.øvÇ´/HÔspä/,d®&Ò6ìÀAK]}úå«±ïQØÖ>Âø&èÁ¤Ç^Jã$4å/´çq"Ò> ñÕ!£pì1È¯çÝîúÞ>Ð¯uÊ	ð¢è~¢àÛî¨=MnÔ= J6uBæÇ	eà®ç#{ÞsäÁÈÛXû0{>³ÆçdÌÓv&yÜqu¸Â¯Ó_+m
WS?aUlUÓbØ¢YYÓß¼®=Mt	S«!ü_b¼¨Íñ,¼¢¤öq·óèò²&féÅ¨#O2¯(jÈÓ¼ü2áL þ¯Ö®õ ÃÔ¶ÎSpI?F$R U )ªWÃ£7ø
ttÏëG=M6<~]²Q"K]vÀy£Gv
kÔ1Â1M|0èñô¨ÕõMÝï§ì<RÃ[9´Gî, ÄgÔHÙo	·Y=Mh)Ðh¬v¦§>«2å$Òþ¡ËzXÖò¤=M Aó!Ùkü8r>Zàð±ÿº§¹Ðé´Ö^j¶t5³¤èý8ÁF~=Mõ*BïdÎ	a?¾}²jÂ !ay£ª®¥0eC5óüðÅþ&.^k¦XO¸,¦ÞW0¢¦TdC¢LWó¤W\mZ?È¡¯;)º6/t¡
u¬,dÃkûÝ@+4nÁ.|'^úunbÖ$­¶/ì:upûç_£/Ê9J{ºdeQpâ)S,MÇFWT"¥é» ¯a¨!¤à8óÓÀ)c¸ìÆ
Z·_î'ØÚ<ä Pù=Mù1ùé.Ò ·Ñ¤ÕÁúYv3æ·|äÓªK'e[fÒIf#6¾Ú£ÚcÕ',80"ðÄ Þ>ö2NGúyñvúqÓ²üÞ?*ÊfÒï(l4¢3n©Ó­ï¿îõ[	LìÖqÞã
B·Ô$0O!z= ·ÕÚðÈ.Ýß_Ó²8ä7zò&ªðöýAN
¬UÙúg¹Ðcº9¤tzßÞÀëû§¦*$ÜA&këº­¹A<ù*Æa«¡K¦íÇ©'5Ó§=}zù­n±Ö±'¯ÒÝ>â&Ë]ExæO¡×17ÐxÝcheÉÆphÔ}=}Ójø-8Ê Òâæ<<:µ2à$â´¬{C}K¶9ÜDR£s~[Æ]Õß#ó¼=MIbHqAS>åñLdÒGÈÇyÜ@äåöÂðï]iÒ¸ÜìpÏ}ÐËfczïÃ¼#=}µSìÛÛþ£4­©ó®hÊ±þ÷»r4sëIE,<8]TÿgR¡ñ+ÅSd±z9áH3­óbó7«¨Â¶«8fþ I2Oºf¾0W'
+¢ ¸BöûÚÈf¾hsÒ,¢*ÐüB!ÊT§üùÓzBêGñÚ
Ú&éGñ!ÚÚþA«ë²+"#ÐüñW'¬9WömB¶Fº)÷m¹B¶>º)ùmÓtT9º ëõ	C¬ÍzJ½XgØ·lkF>ãm¿¼%¦©©×%]vÍdéL¸5é,ÉnYº°Xhêé÷°Ænêé×·°üh)º°)h)·°¢'QÔ:pî+_ÀBýá×íûà\S!ÒòÌË·7ÏÊýI]§ZÅ¡æIeÿwYzùW[°»7Å;¨B#L[²»-Å;xBô]{<qéCë;¶êCXìÿ;uV%Ôd<¶Ò¼2á®»6êCËuû?£vûØ?XP<µI«/Å;¸Bs·»@Bó);¼§BØ³õ^Ù)Ôân-¯qãh«Üáö)<¨eËþÝÌÄL%Æoè×å¹î&£ìñwÚå¾þ6RÎ£¼ßÂ ÅÆ_Ðü,½iÃ¡¦Àáqçm=}/ýå²¼p:/ñ«3Y+U·[¸{:ÈºLÀ½Û[Â=ME.áÞHâo:0BiÁo5aäÞHï\eGÓ¹7àMêEV¹¥KËâÅ	¤!éÿº(º¤@;¸F
õ+´Jå¨½8z+»ò^Ù]PAä1ixÊà!EÒÁm³k%À¾Ï©§FæRVr°éz©Ñâø{Ìißï$ã®Í²¥v¼ÌL Ç^P$$·©#~É7W.ÖHÇ÷¨³.ärÂòr01(ìèqêÕ~V´ó~©Ñï^¹ùD'\d(å.qµÞ=M=MNW0j[8ã³ =}yqÌ¹5´ç°ZRäÍhÓªÃ[Ï=}Xìé¢KçR³ïüòãÁ£·ÄáÈÚw
ÊzLÈÛîO
u xb· ZQ®Ïâ	Y_Ô»^'nkÃ,zÞËºA ÿEõ[r.É/BÄÔúT\|à cÜ\¦!¼Í÷"Î{vÛÙæN°î1ì².Í*¹!3ZÊÙuY¸0Öc-çu¯êNÐ³7Êáºò0ÙaÌPßÙîC
'ü!³uøI¤ÄïÅë°½â+HÓ%äF·å)¯ÌR1|JäÍ¹æ{ÍZ#ÿ  /TùÕ+=MÍ­Ar1ÕL«£Ó½¾÷o#tôûÌôIûÉzÌ@8»âïÁÞ[I Ç8Û7vº8= '¦:z³D¥ðDmTÇÏ°iùöÁ =M¢ÉV%[99ê9¦O$É9(z¨ÚWÿK!éÃI*¸%§D)µMCx{ï²-xTøEár{TÇØÔÞDäÅÍ wí³µ(þOiÂ£pÓU;73*¬*#O( Ï	/aCË2%acØ?ÜÚëYËDr|ûrõD5©åÏ]Ñ½=}ýefÁRË#ñ)nk5©=M¤ºÍuÎT5Eì>%³4*lÑÙJÌÑsÂë¨Æ
ÛÐÙlÉbÍ¾Ò."æÙåB¥þ7äç
<BÒüøéS6í]äú
]tànÍmPTì¤Ì0ïWÍ \j³jfp6º%©d   ßl®ur¥ÿÎúÖBgp
eLÁü
Gn
ìmèéc.¢°{½tÕ:Ù ñù7$1q ¨É)Üz¨«ã¦Þ¾52ÊÞcö½µ³Q)É¡PvöjOì ÉÛ­âr%abª¶2	yîAtÃ}m^-M},c¦áË/ÛÆÅiÏ¨Ï¾L¡¥vjFÄojÂrHúeÆõàÌÈa*[ Ty5IýÌY¬ÝTÒª¼´xíx>´?Ñ­ 1ÞÏµém×*©bcu9|Rû¢¯ÂC,P¾£\pû-hÚ9Y[i6Ï]8î{+ÜòêßÃ£EI2ýkÔ=}¢Ì vã<þ;CÙ5ÑPÂË²´n-:&)j7ÿé´}Ùú³¿8*WjYÈò¾²§ëb±ÐSjz®;HÝNwè×VT«s8þq±×:ØwDi©0n¢Aù×Wx^:ÞzÑªAXIOÊþê=}DÐÚ#cß®]5$É¢	AÛÃë¦JWþ¨S4ðRØ/Ïß´Þ¤ £Ôª°7ÌÀ6ªU  H@$MyþÚbvéËrÿ»5pÂÃS8úß]ù³ìoño/c}l¸ËòÇn0ñnÞáUác©á<g¼à:ã[åøòóy9¾º3ävOB(ÇÅ	)ÄôðV¾¼·["!l!á±çWr.+bØãéñ3K1'Êºè(õÞ@[%ækæ\Àä0Ò*g®×Î¼£/ÏSù÷:}ÝÉì¯ÞÐi÷_+^æïô(=}+Âª_+è* "ýÈF÷z¹lÞk:mû:t~jQ<Áqrp9Oß^
XA¬By+2ÊNÁ|ø°8=M(èþèÊé­Ñ}êI%#¨÷òw_ei24tÑopäýµä¨ÏÓÙ²±OÆ°a©¢f³à_û´gw'gÊÔ}~x9pØE$ÄÏ.üúyÇOÝ¹ØX|Ð%Q¤I/¹±­Ü5Ð ¸]FÔ!'73bV8¡§X9Hç°²kK /çM,roê?(K	»Êg¶¿õf= =MT5Ê[¢|øccÛÄûR¡zóËûcÔ%·×õïRoY8k\~~+]jÍV"Vù©KT%:¥P¦ØÆ­¹Mä(sêE>ñ·= wÙ0(ÛJM7ÏK6|uvW 
4Xãü»ÊépsQ:þòãô ÆcÀ0g=Må§cv^ ½w!Íbîôo¤.<øÖéÑW­ZÀbo³ÂMÓT8PÌ?Q©o½U¨Æ-¯Í<@å¨F%ê8ÄÛÊÏõKW(Ð²¯¨\-W¼fµÏý>n×ÓÊóÈÃÄ
¶KG_Y~Vc?c§g©Kiß+©}J@îÙöù_Z ¿(pë¤Ü
Àaï(Üt.².oÔªê²^mÂ AqJ4ék¯èD(@5Üfë|èAñZ­8#}¼>hvàl §óõÎRæÁL3Ý*Ö¢ÙÜ<BÈl/¼ õÛ{b£¥ÇygÁ¨éYvî4\C·® ÑE®#NQ%µ½w±ÕÞA	, Ö_KÛïå²«S±½IóXà@KôÐÃSLEvzêTE!(W7¨þäÜÆ i?÷O/ë+½5;Ýc=MÖ»AWÁÓÐÖPM=Mu«ãÝ{¿>ùñ%ÝFþhù^©Üùà*õx|ñÒ=Må1è´¶êXÞ/ÀßP ~Û¢ÙÍÊ-¶¬Ò]b ä9ûº+8³Y7ÌF9CÓ©Eg,½füõ'¼£Áä1èÄòâ¬5¯Òr=MÀúj&
¦>{BÖÖä&{Üf¯#»"'A6ã+Yæ\0}]óE¸îÊ: <v9G 1FWÂ+w¿&(XÏÌ¾ ó¤¡&óÍ¥Iò¸S,J­aßýNçrøZ«'Nõ©ÚÝÉf ¼×úôØµJuÈnä¦Ûå¨ÌN±.Õ®dÑº Å,}÷þEÿn1+7d/Õ^P}q°lÎLMQq{T×Ó­iòý1cYÓQAé¸ uÊ"ûª%Xd¹ÙkFø{ZOø l3ÆL2i1¼û[gÂ/ó® NÝPµö}ÄG^°ÜKûò¡ÔºkéïM3*B8óoUS®ÕyR²~¬!¨Í Ð¦$°È·3ÝHÿì>&mâÓ= ûuõó3é3E§ø¡´FÛ^ø Ò¼i¤a¤\ë»ÌÇ=}]m½ yÀ­®u$«Ì×7]_Ü;\v¤´PDÑl×ãIm¿î8vÚtÊ9¼©-@ó|ÔÏÃKDô*HQnSÕÊ×¡G!¤á!¤±ÿÏ{úJ,ò®/"1§Hc52Ûè´ÝènÏZ´NÆõÍóÇÉÌ*{­¡}UÈñâ/­Ê:ßZBrma&P59#T!I*-&¨ôÇÎK9³ÈÆ=Mµ£{Hfý¹ëP]§@Õ¢gÊôQÚ£À[±çã«¸pqöÃ¾´Üäðl%ÐD{ZæhO'ó=M°ÓAR#oùên¹²KÓë#¸QÛÕ×Ç} ÆtÙü¨»¤KÌ®ÆEmØc[ky5³RBðý=Mäµôÿ{aôa+vrÇ@Ö^O;çÄ(ÕþR;HÌ[£Ò²ðóõãQFg¹g®lï< ø´ò)À¥¼µûþâ{Ê'pzghS®qÛb·ðS¦[Jê²{&3§!_«~!L­së,)Å-UÆ; ¼Ú+| ÏdH§óàú ¬¨RÄ¢íQ-fòþSvÒgjr>þ$ÉrÕi¸P$U?bó+vüùZ:ãÏ&sèoÆþn=MwÇDw-pJj=}òTèqè'ò5%¥ðöM'»·²ìiPé¨c<¢P=MIÿ²d Ò^WVÜï$F³cÈêXg3oB¯R¿é-¶ñÕ1×ªÎ&xÓù\ÉR^ejz¦#ÞB!ÑÛÜ¼|0ká&i¢æ»²'®°¦×ýHèñf±h/= Õ´°cf}çÍô$öâ~:Ü£ÿÏ¸¤5n6­{^þne×Û ür=MãeQãÁ¢*Õu%ñ_ÓåÄì±ÎCw4;²XW8;DÍy¨Ìjñ÷TV à6 Vä±ÃC8ÌÀVT¿WOL´øM¥þÎWk	Hu'üª®dHÒèA1=M®6P@t½¬¨/!ZücoF= (o@ÆJ±#²Þ%ùSÆ¦BÿR-?×­|À¾Æ'Ð<¼ÏÙ|÷6\=}QXØÉw÷T6G1äìXæ:·+oè±Áªeó­ï÷¤¦/
:sU80zÌÜòº7#KB³Ø,4ÒzÃi<³âô%ÂÞ¨?öÞ SÛ­¼¢À3¨ÊÙÆït9ý@au<ÿIéõ8S¸eÝºc/M\ Õéãc~å¨TU0C$­±.8½ów¦O¶ó¡	ÚOLÒ-¹¦¦¤HÛ²¤Í½îTIËÜhuï^×O'/r®ÈæÅ\PäõXòÏàætÑ«¢D½øô	BÈ{õËvN#÷SW¿×ÞAù¶t·e³©F 91»OT£Fówñù*ô0/èâRnî«¬,z¤,
æòÀ¶i¨í'Ö+y!y	ß6®¶®Ñ=MøàbhñE÷+ýKDEÝRÆ{<-ÿ¬Çï[ýS»×w¤ûÜíUñãuøh Ã=}[Ö+HÂSÆÊÏÍØPèãqiÖomÉÀKÒÄëÂ
âìõÏRfÕH¹ÊæÐÃÊ#XÐ(¤]ÙÈï}9Â·èN
ÿó£ëÂäøýÏD´æá
énOJÓ<­èR (ËúcR;ùH27Êè©ÔçrMaýV(£cÜ(dªì·ö	;ôDàËÅáþìæ¥e×­ÄFE!o¡ÌÍW´Ø]	²g¡»Î1Éô)ÍÚ<VfRÔ±5(O¹Sêé+=}Zâi«FÅH/ZÑÀú2º1à±%âMGC&D£-k ´øA5:¶HgÃ9¨¥=}òÂw©ù>Ý=Mÿ'Ú-¬öQÛÑKþw¸Mß½óðGÑ ¯½\ÅÍÙìä^Â8ß)Å>§ÚÆ]¬X6Y>Òh¯«1/¯fäT8yµQ 
HâQªü<YËÉØì+iª¬nµ©¨öÀZ1cz¼öAAÀÅà}@;÷ä;Ö®$ñF	ev4lÊuÞz'û¹)OÈÜD4Üú9óÀvZ\¸fU¼Ï!Do7¯§H.{cKp]Fé{AÄquSêËËDËSô7£ÇfËp	»nõîã|¿È×a³üòÛ·%vâ¼pos{þ÷2i³R¼Â°í6½{I$ñû0ß
DH¢nþ½u¤÷jÆûêÄ=M³ÚÏËí¿= ß}OÛM»OëKý>mEÀ»æ¼w}\äè³\¹Á÷õoh@ÒEäøu±&mqüØ·ö$ñm(¯nÔo ¢Uá ­j}ìíl¦|%Eì·=}ÆLÿéçlÖ4ËÆÀa¬³øåCçbm7Ìô¯[¦ÓÌpàñæÅ= 3èÚÁ^]*ªàÐJ4©ÜßïÞñAVOá´><Uðj»~Ú8 FøòæÂ~íôº)¨åÜ¯'UÝa,ÒacÞ&°ºRÁ¥é¸ü/@üµØzÂñJD57Êø|¿ï .qÕ|åM°qphLNÏ­Æ*>C¦íÇF 'õ&I£¶¿~5¼¦IeÍ[äN1³CQ¦ÚV¦.= µÍ³ß}êäî@ÿÁuè.mµ¾a¦kBL 0hßóÖ¶6íâøe
ó_D#sîY9¶ö©@a õìÉ7ýÿ]xpsüùæ\"9¶tÊ;Ëj/¿GEÛ¿¨ò-{7#Ý¦ÞúËRÊh!Øï#b,ÛÒðöFæ=MgÊ	Êz.èº1:'R¹Êz®&¶èq³b }aÅÕúÑwjj ÚÅzÐ·M3¿b4O:¡7cÁI{K_Cú&àSl3_Ó":ÅËâbzÌ·]zÙ8
Êò:v:©ü»¤Ûy{ÍSD=}»ÇCPNf]QúÏ·%ûÈLÐ:Í\gzÔ¸-N(ïîÊ":.:ÞÖñv¤f$²u:ÆÀ³»ªW»ý;9Ío'8	Ó
ñ¨ñ¨ñ¨°U&±²7º»¥4 ¶½|=}xëV\I(»¿Ïè\Vu{¦wJeÓú¨»Zìr'üZÒã«4¬t+×v2åýÓÈìÄ»í·§è=}ÓESÉÌÿ=}ý#ÿN=Múùß+éRN[>Ù|WF¢UgS3(	(Öi?Ë¾Q£kfëUïBI/{iùÿ¡¤±@9X<7¢¦~ÝûÄ4#{MoK2¶±wÂæ+SÑ¾C4Õ=M¢¤3ª »yr= [;iK ïÛ$2ËExjó[ÖÓW])K+= V'1TnEõ.M)E+D1µI¡}!uú1¹Å­Ü¸âÞsÊUÿ©ìDZÆµÀ²ã@1¿°sÐ%!w¥R=MN²"#®¾!æ·É6Ã¨¼ÎKTÅ+÷ÈóYìr©2ÃÇC¹ÿ²ï,ÞäÜõÜúÚÜºæVé&q¥ÎðbpTÕÆ%g0¤dàt,~¹aÑHÑÐS= ^ ò
+þ}úÛå¡yÚÚrÚ¶Ö~­­$çeÕ¥ib)>{= WWX7cÔ= ®>Æ~9G:£¤êÎ!Ô#ù%õÕvru­(T1ÀÑýïý @17á4.´®(zö9·9Þ9ÊÖ¦¹ú8èò¶¹0QM¨òè8è& ç î´îôæt'pq¨qÈpðp ÓMNÕû¯ÝBle?§3(	éàNB°¨bö·­ßÿ@Â4 ØF±éw®ý+¹qèpø¥·Ï|hRF³oDâs;º*dB9ìWU»?K#Î¿ÇÏçDb}tyªpÁEëå®7+3O7baã?SRc!ÌK?Ò[Ù5P¸)H[£NmdzDÈý³¹ ¥»Î÷´êQ ½^åaäEiPMãKb@¯DïbôhÆC njÈ+uV·[#ü¡¬FµÒ­ßË]´´h&Qµ0 ãûöS(Tà/BÞO *Ý¢´ÈíWÕm·0²ÓgÇk¤àKÕó 5×­îítoÛÅ£¥zLÅC¯­DúïEócòáº#¢ÚU$ðc¬ÌmcàLì®*½B b¤÷E@DP]Å,{Ï6ÄüÖî'*Ôn
×tn:ÔÎ§)toM¦5Âö[= |Yì@Ã{U¥W£Ô\¦Îy6È*2þ)-ØwnòÀÖ
³,Bè^+T¶'Þ±FÊÖ
²mÕñ¼ÌD´Ð0ú¬¯gQ¨t6Ñâ(OgÇx¯2ðáÜ[[wqîó)H¸b¥vGá	ô8üRú.¯á´iµãëåÿ¤)#^R¥Õ¯ÇXwRªuéø­ÌÍò%5½ÆñXiõá¤£(ñ·+Ü¨§òp ¯ ÞIÈ¬ÙÌöOo$Uõ¿§e¸ä¢õ·¨·©°*ÖM®eYðÓÓ
-õt28*5±f² ×ú-²¾DIFÞ¹èÜzt¯þü.ª0ç8ýÎä8 Ø9Ïtæ² w£(nqÖ ö¯¶©.¸ëÈ¤t òV¹qÓqj,õöÆÃ	ö/3Ê[ÅU[ACÍ0Ð=}	ÖbRì×|ÇuÆJ_ W/EÂ$¢_!ìd¬Á£?øwl/hU^ýÜrÎÌ<z¡F6¤_=MYo1-u-cËV¼ó×atÎÿÞ+£]ÍùvîÄ½G#ÎáËwo½r<£Ø\§D<¦fF¶ÁQY+zìhDç±ëêBL#§uÖoÛI¼1Ë°L<ÿx5rõÕW]J<é\§Då»-\<z³sEíÂ»jÖ6Ë%RÌ;©Ûà»êÚé?÷íß¬³Ê#wQ>ð6u[aékj¤ÍðÚG^à4¼=}Ã ®!h= ÜùMâ , akNÄøß^@L¼jæ½¸Ñtè]_¾ã±¤-;"f%L30áe];w?Vy'YÐÛôZ.ÌÂm=}Þr ,<~]Á[üÂ<¥ì]l¡{KËHÃeAånÂJoGìb{!VàÌ-<OËùài=M~òS§ýpE,@XÇ<~1û'ä~ÑërDfÐÝÕg_rÌjÑµ@¯\pÛ{QìüæéCHI+Öpþü¡åðàN3aÁ«ÛÍE­£/ª¢Å-úØøïs¦!o®¬%wpÕ}m1Z
wÌØ´¹&'T÷ÀFÒ[AåÉÆÛç±.3a}w3ñÅwf))aéÜ).3J(fõ°µ=M«Ì³¿#)¹ôgiY·®&,èhTôrÿ$ê"¡à= pó×Íöª+V7r(TêJ©iUwËÑÏíjú Ö/ÝÖ~¸ hGÜkcm¬²RõRðpRÆ+ZeÒÙíª/6ò¹ñ½w38¦î$Sn=Mk~G³ÌÓ4¶xÓËmZeRä!®>çõ·÷ÅW­èU0n+ßymÅ*	EdNÝÁÔ®ya©"Û¸ôìOÓöøçâb;ód ##ÒØé1)ýÍ_f^<d~ ßc¦& Km}_òMîK]_ÜLí¡KE¿e¼%ý#kPèD±YÜýèÄ	é©£Z¯a¶¿çó2äÍ°èøWsf¢4jÄÎÑ°|d\p3=}"» &2Wsµâùè¸÷G:Àv!ã*ËËW^Ö|fqZwµ"¤¦jÜlpáxTôåoWN¶¢:ëðÄjÃ&µôw^ù~ûð¤t= rÚñ1â
óaq0| (
ºe®Èè¡	Mðnx*,þØO
ûýLOñâ¡8³..¶Õâª #ð{SÖ¯÷þrxåáI¹]²á;âª6åÑñ	®R¨gô8çý%­+KYÎÙ­â9¨ZÒò±/HNØ¯-½3®jèåª"PïgÄ7¦Ê5sás@çMºkòãíáÜøÚVu4jë2Ô-å"(>åAØ=}Ñ _Xt±2¤&BqÊªt²,(TtRü¹zè¡£t²¬	Ç×ÍµT~®
Ë+Äb[9yî$9*Ò·6Â¿ÓC¡ÂçÍ³O!;þØ'!nº4Áó/Î"êz&7¢7o"ôlÂ
Ñ¶n×%U]Ñ·'ª òYp95º¥ÁR¿ªÎ¬7= ÇÊæz Ñ*ÝSã;¶MÉÁäÑ
7Ð&JÏz£).êÞ9RX>TÂ¤Á	Þ_{pÓëW¹.Ëm;e_>t ×=}eÐàÞdD?«H¬n3£= òÔ¯H üCÔ¨9o0Ä¬¿æÂÜ,üî;7¾âÒHÒêåh²z!¼§ò»å6âX+
¢3Wä\=}³ö|âÀ©ÜFã¹õ×Åz& Ì>LË£=M<ÀJ2ø«;UÖaÙØõÅÕê¥YfÃ%Ás=M¶MB8ÛdÛøä:ÑP:^ôäK/ÑÓBs¿»LvP'E1K¯«êrÞäYäªçj_ËúU¢hU7ÆGÈ¸ÊÌuäÿÌ«/ÔÇa]pk{~zÛF¾SG[x°>qèÿÿçß¾ã¡b¾êÏK>)èaT©xö@­õÁêBµßP^;Èaºrÿß¬9[Í[óåkOn©^=}éî×pÞ{f{fü9ü\Ò{ï3Õä¿ÇAü£ºÛþËDfÛâà¥üùHßUð'¦{D¼E»_Ï;5!¤X!­6¤Y¾.(hþóku[_Ëz×¸ÅË95;fäÝéõÍÿEÝ½JÇON	ü¹=MÑET-RÍè_Á¸F>Ã±lzÌ:S]v°^LüînTY;¦iÎ,ÂW!üPH&ºb.>;
L¸AêiÇ=}*cSHYµi;ÊxºÚL$tÿ?|W CÕSHPüol5³á«© 4æ>È[3ó&ç¯âYT=M{	HÀ8Zá»mÔ1a³Ï= þÎØ×}±y¸·µ4$×'ÓhÖêø¥´»6o¼ðàôÌÜÙUä»ú·3¦RE
¢¡'Zìþ=M¾{ 
ihú¶(|p²bòÔ}Râ Yw¶kRôrÞå ¿]ó4af-ÞÆf 6i©«^tÞÁ¸B) Ä®^ÏOÅÝ_t?À¼&7Þÿ6ýº£³°¤1	«yÍQt&ìx°¢óe2+#£ÌåÏïré *¤c5w2	Ü(ûùå7J6±ÅßçÈóa÷Í]/¯2¯®n¯dOô.Ñ¼ÿÿh$$¸])X$ÖÏE-Zs_	Y m!ú×dþ¢=M&®Ýþ¹Ã4<^y¯ù-Rmý´--ýãS9¸¨?ªÂ|1±#Ók·´ãc Aº-ËmÓâ]Ð©	¢Ô¼ÆHÏ»47&= \J_é¬Ñ°t³Bd!Ç-æÃîoÁ£¶2!ßêì.¦£*©2nòR>.d·yÐ#a«Æå¼ÿ¶ÞÞ¿<½ÅDì¼<[Q¼±ì/XüÝD= ­H§¿Uó½oKíNÜsãH¬$£üül¹*æ-¿)gYyÛâ2°=}îDáÁ5/¯°ïðop¨ã ëTÕ]¿EkÑwô6!¶ZìøvAÚ¹ØáË}à,¿u]8t©N.¨Â:U5o39 ÎÊ)Ò@
«ëòî=Mÿ¡ËFåvÄ¹4ä«25?àFÜmãìc	@øvÝzñåæKø?Tüª8ÈÇ}P/"Ã§ãt%ãuVòý@oa¬O;òÌüÙaéP%x®%_^XYÂÜ9D6 þîõÂÆIÔqØefèäÊ­(Êêð½;bB¼ ~x¨HpiÖaD $PôTlf¢Ö&Íã[a«OkûÖ×Liö¨¯s:ÑÞB¦gp:=M³©¦G®^¨¼|YHuW2°¹úØu»Ë¿m7Ü×RRY¡¦¡çæÜË#6+Â¢4¹µ ¢/+{&ø÷Ó,WWPùG0ðð¥é8_¸HI#ºðÙÆ×¨qÈ¡|s­<à5"®aî¶0ä8ÌÉN+:ýâm ¦n/\>H+á"¬¡e#®¢¬ÛÉM5=M6ÊØÕ=}U$:4ëdDÈ¯P hë6ÃÊê0ÕßáÃù¸'·SòË{Âµzñ	}Æ?£^Í1BnÓæÇ22æ
ð=MÜÐ«_Ú6¥.Ño^OßÌ8*HÐ6&ì,_ö>¯,#ô;0æÞªMHrÖdÞÌéZþ/OÒÙÕ?b°o=M67'%då«yÕé= Aá+é(´·a¥Ñu	«
îó4=}hP5Ö©Y&tH45ì&LÛ®kO,â)R6OXÅéêà!·â,wdõ*^º±uí\û»ÞÇ¼îñ¯°±#¸÷Q5¯þÂ^úÿ}Ð	{_ÊXs-#9íDßW51ä&ÍÒÙE«~°¢s£KÚzoIØýýyyñ×!tÙÑZÚrûò_ß^ÍvbÝ¡.ôBZ>±¶¸¤'VµÃ.©ée¯±»i<xÕÉõN¯¡¸¤o7uüTÞFþ#9ç¯þ·ð¡ü¶ØåÀ·T34¥É]¡zñ×dN/Î¦Wðà³ù800Ðß´QwPTõ1nVx3×l¯[ÒP¤(0cÀì*ê>¨pâò4Õäd¼¦Òx Ìì0h'8Qÿßý¯v2 ùØ(R÷¯0>Ëªt¥ !ZñgÝ¼è¡qõghÚ¨x=}RgRÜì]bbbêÛÛ+2ÅO£Éð"åÚÙyÒ·7uebËð-ì1èc&ÑÐuWz\à µÏ§Gá
ÍÈ äHRÉÏöNJx¿ØÆìHÜ ÔNå¯}¬¸ûâv\å·ØLåÚÀÈÉÑwîf¡YFÚºÖèSºâ*3ª6²/e{VâÊ:îJ½lS{
ñ´¨ñ(ñ¨ñ¨ñ¨(¹Ç­è¸0_=MÌVþª¹÷iýúñÂëki¿6M}ÃE^58©¸LªL¢hüºA­Æ¦oO920úlÇ=}ÎÓýo¡kÆt<ÆýmëÅpKG¬_ËE¤ËI´OD H°oF¨¯J¸GkÿC&íyVílÖítípíxvínöív¶ír6ízB­kÂ­s­o­wb­mâ­u¢­q"­yR­lÒ­t­p­xr­nò­v²­r2­zJ-kÊ-s-o
-wj-mê-uª-q*-yZ-lÚ-t-p-xz-nú-vºm¥Ï4nÉDEÓüg!kÊ@gDüeK|OlÿÌ{MdßÌ|Qt{L= Ï|Pp{Nhï|Rx/lûK1uÒ=}uÕÞôYt$ô§	4÷å±Á4ÔÕl¡2ïÇpr!Èîb·
³nÜ½Ôm£Óa§wáWz
È(Pò§õÔí.GÔob	Ù ª¢§Ét¬.¶r. ï{!FÈ"p±6vðÿhðÎ'$­vö½Ðù ¢æÙð)È+ß¢Þ÷~[TìT",	«ÝnÎØØÝÁðßäd~¨Ô¥¦ÉÕ®ÙâÂ=}øO%äª= µg¦ôÙf/= ¾¥ßqHm¥Ïî aþI±ïñøm)Î0»ÂzA&Ó µ¡í¼§ÖÓá¡ñô¨¤ÁÁìèÔ©ªñvÕ,	¡øæx	)ù
1²({2W'~x®ó¢Ê/IF«8ì´÷²ÚÇ×°Õn
«1¥sh"æ$}ðçµÀÕê6ðµójr$$Qøáv0µòÙ*6>m³QÊDw= Þ¢ 0÷Íæm·Ñª/ùjÊ8äzÒ8±zÓ\Zí.cüMö²8îzb3¹í&¢²1×¹ölä&!¹âtÊ«x.´ù2Æ#0\Wc.^\'ôÔ*²E~47gÂz
DÏùaã:jQè=}çÈçÙvNö«X[óHò=}Vá©óv7°2¥%ñ äf à)¯%))Ùõ¹ª¥YÐ®¡éöV²@z>ÿê»ÑÛ÷ì%@=}\Êk=})J=}.Á8=}®½ÊUAÁQGÿoAÌGóUA0TË2GuQ ØÊ\è¢l IF	A~T_A©TyqÉË¾ÇË~ô~I)ÆW5EÃPkÛD8[= ?Äd1e«¸keC©OáÌOZêSKÒäÜÏ¤û0Û9ÕAßøQá(Ïrð{¸Ø@_RÔªDé¬n¢ÓªãòÁä	UZÖû÷þAßÞhÏò§üHì¾J¬Èx(W9<5CÓ-D¢Ó¬Kù­k¨®üÜék¿ö|7
H8u«nÚ&<=MNaÀ-ÖãHäì^T"FéâZG$9ËBûOPÃÊ|wÖoõªE «n«Üª=}Kø½iÁ{XEÜyçl9««ÑÌk|SKHS·÷MAÊsÃÜ+VóÊµ²M{%ü/ôp.ÝùùXßûIÈ4*CÉ±ÁÜÝFßjÄkÈqP!¤[YT©?ÒÏH8æWÃ´kðg£º\/Å\ÐqÑº«õü>ýûkð%¾Êé83Z=}<ÇG{ »ß=}?»u=}{¥<K<®;uWKR=}|»q;·s<T~[Ø= kAnÛðG?JQ=Mg£õGðWýptÿøE+¶ÏÛ[Q¥ËéUV+þg\Á~«ìÀìÄx£"Ø\/²@È®ÂlüF=MËº>ûª£Eõ]C(kÃÛ·w3¿[¦~e¿¬µÓôK¥[X$DÕuK K¥GK6@úñEïD/[Ìº¾±H4cÿçÆK·)üs9P£4¢¥pLs}¨´7^Á¶uLíß»+ü>DPN¬1·]1ã]7Óæ¿W³ß6E³
¾ÜÂSÜe¾ÌMBlwÎléCT4ÇJÑ	©Íí_ÑÏJ¤0=}ÑºôÒP¶z¡@rÔXhÞì =M!ÔkµêÇi·dn&=MÆ_tDYj"Z¨Îæ­¬öê}·ãÛQe3âÒOïèUf!c¤Pà+= ðd}Þ%¾35VP"	ß÷0hqÎP¥=M'ÅÕ¨éÃ8Y£?´½³ÛrMF$²FÜdFµa=MóúÌèç3êè£¦ìH¦,§õHø¶ÁÚÓÉØðÐqâT©ð(À¾ª'à0W£¦ÞµÐÞkr	ïô%ÿ
W!hXsò¾^ iÖõ-ù Y©ýX¢²
²Òmv³CXäb­v
øÎZ9Qê6ÅäÖ8!·Úêh<frûaG
Ag¡< ò¼Ó½éC!¨¡\ì+=Mì9å=}òTE ¡HÉºîÓQÊ
u\ãÂË]·i¤ÁÈ6]ëÛi<ôÄ:&¹6V[ÚÆ	Rrçl?Wº½¢ÉÏJ]Î Í:¤_ð6íÿí¼_	Ãñ²WþÏ*xçc±j:QB6ñÒø³úáfÃÎòª¸v"fÁõ¸30oeB*åUÜTÈhêywø·î#)¨&2Ç +º¾çGòAÆÊÃGðö¤Æ¸ê¹D§b×I(¯èúà·¬n62:a6qï?'ñÄº¦nBÒ||pâÀ,b^Õ O5ØÆÖ=M°¹} qÖÊª%¸»q,ê¾Æ:×p5|¹.®×Qæµª²ýüÈ¾ò­J%øF$·»üÄ{æz|²h¾¢ gQhÒ^ÅEB9^v³X¯þæ(¼SyvUôXMüº%Dú:á\9#Qß5zz±(Fß2²,ï¡¢ÂÇ¾8qÐ\ÎA& }Æ¯ $@®Ð.¡Uñ~l¶è¹Ù ÜZÖË»6.Ö!s(0*õ¥:«J÷{&6.:ònhã:ìbL°æÀ½ñV¦Íñù	¡P¯((q©DÒÓ2=}h| Q*åP6£\ vÛ­ÖJ¸Ä¼tpZGHzÊü0Üú³BÌ©0¢ç	Qî¾¢ÞPõå­$R0ö=MW8ÕÔñÍâ))*¶º."p|¤æ:´²Ww´ºé¹539	þÄÿÁejEÖ¡±K6|©ÊåPë¤óH=M©c\î.SVí¾èÅ^Reã? Tèá= ñÆÃCz=MTØ¡ÁM°Ð#Î%ÃþÜ«RÆ9øÁù¥Ä ÜªÇBÌ¶ë¹üÒÒê¯PûºXVrµædáÖ1¨.V¢ÈïbWÄÔÿÿvÎ¨(*BYì,þxÂ²SZxqvößy:j÷QÛ£Ó,'þÇRÌ1ø×àÍßp/Ôøé%gÉ§X±Ú¡Ö<h?æ;Û"Û({µ9.¢ ©_;ÂzQ"%,>P5*:ËÚ6P¹õ;+G@çþ»¿kÛ}4n=}#HG%>?1@]»ä?ã@=M»ò$3@=}!v>tO}@pïë¿p'Gr³^KüÃ~Mõ|5CÕF_jà®¸¯Ûò	ÈShj^äømç´»âÆøQzk{
ýçÏ	(¿ÃÛ{JbfT;ÇfVæsrxä~æóÛ;	»ÁÌ~µÑ!¢9o ¸¯¥-ï,A2(×Îà}i/ÄÞÂJ'8ú½çÏèÞ}Õ5Î !	ÕcZê63óÎHæåRÖk±ÿÛyÅíúbõô8ìs](ù¤PÆ!Åø[y¼ááý:Û~^ØÜ¾r·,N¸¹Ê(6,êíâ°OqÌ@ÅÄ-×Å:BØ;:Ùw- w9Á,wÖæKx@èex¿ýx!xLÄ½xÂÚÎxíàxùóxuúxêxOÅ2xI= By/MylZy£fyÅsykyÏZyúyÉ«yëÒºyÂyJÊyÓ Ñy´Ùy«)áyVêy6òyLöúybyòÝy³eyÏöyG%y(-yAÄ6yùK=}GÔ>O{Áð¨fÈ¸ñôlQ5¡¨ñ¨nç¨÷ìxÒGD(´³(¿xë¬#þã<	WýõLoÇ\l<}âªïy²È3¢áT5xçs¨~F¶¿Ônms%~äJê=M8äpD]à= ?BL	"ÌÁÿë©WBÉa«)­MÉâ«¬¹UÔT³ò
¨ØÇñt'Ä ½w1Øb#¬<&VE4&LÊPÎÖýÓl­ÕÔNäû+Ì½:~Ï'tãß¯ÃÅömPæñäs2 #¬½=M;üMüÚ:CªO/waS³kÌ	ür½Ê½?úDºCÑù-_j¸H)jìçþ7Âuãã/loßJ=MíM>«õö·º$F@Jd®ýÂò-ä@ú¸PãºÑ!³j,Û6ÅÖà7~ä7ñºË±²Ûñë¢Øü[¤6æ@&À¤ñÛ[!jïRR7vëãæ.rP®¬%»Åûea:äýãsÕßÝ *eG,²P°iØÍóÄê--Ï÷EíÐgf³¸ü6ÈE%Pw«ü»ÌE·Ò±	!H­¯f ·ÈÌ	Çi­gV«ýýMwàïDúæÒÛ¶ÞÓ|fÆDhdá àÓ¸Æ4¿·®LÙÆ0cÝðªLVZP­¡\¡ÀÀ·ÝKhÈ}m
Pk%
=}á¿Rxç;Æ·ç!.yñõ4÷	2´Ó" §ËÖa© ïgÒ½ô/ªÜ"=MW­UÓ~Âæ? Þ!×ÊZm=}ñ£ÖdÞTìrí#Ö g¡ø¿ Ô3À¡ívÎ=MTg
ûG×¢{¬uFân(UöUN=MëùÕ0ï/â³dÀd³Ç\9m g*ØÐbyÄõ Ä#öa/o¼ú¥MCÕ×{³ ÿ®bÙ)æWbø:õ	Ã ýÛ§ÊÜjÁ+¢giÈ®oÝs T Áé^Ì°Æ_®¤?R]32§sýD´VÁ¤S¦6¿ÌîwÏtaÜyYýÓÛKU½,Hã@âaÃù8½ÓìsËûd¼7ñ^;nö;6®Úðò8£N*ùùÃ2yË6+5Âr"¡µÖÆP·1ÝùÎv¶Ý"üî	YõÜÎv!©w«§¡ñ°ã³9Ô®´	Ç·ÿîbx¯¡ã^¥ÒW3
¼B'nì¢vQÉëÞ!ª#­·ÕH8Ë£VE>±¬µÝPZ9òÉÉ= ¶ Q¿òÕÎZ§ÉnA$Öì¡Ùdöï¬eoü"ÜlrÈ´ïÃïÜS-(Ð<%ÜA7±{Ú40èþ1éÂ y¥%íé·E<bn¦mµVbÌ=M®MEaÍ±¨=}aNã5¶wZ¬u£WvòÉê/®ë*7£éU¬ cÑpÉ_±_f!Ç{4¬s2·Â®©0kwuI^g¥cZòH\wUÇ)ù|¯(xÃ$$>Ô°«;86IûiÞz¥B6öZä¸ëâJBõ1\dérÆñ/Ý{øRJ½¶-³Jÿ")§­(	ïºö=MÐ¡Îée&ýéfØäXÔ*í£(ÎÑIÚ>ðôòÆó"ÕÏÕ¥m¾¢X:É7òå>nñâÆ ¶g¢òÞÔñÏ1§½ëqÿgb|+;Sq;<«ñ¨¡9Ö¨¨ñ¨¨ñ¨¤ ý$þ?ÑoÊ\ÁªODþão¿#à¾Cp%×è¸«±#¼ ü©ï´²}"¯Bï~ÿïýoíTiÕëuñ<Ð%ljéQu¥[YÀßÐKÉcÂ5 mDi|þW,e 9=}G |®isHîÌñ_FÅTT¾?ºeÍì2®M1 bû%wïXÆ|½OêÄ¾MÆþþ#9NÅN= ü#ùN¿Þ\<#&ÊÞÁù#Ô$¾.wÓ¼Ò²¬oP[å)¿	<B¯¹ñÂ³ÅhÇíôP¢5º®Õ}"½DS~:9Wgwæ>= nh¥r°aã}¢úEñäf¬Â=}±wÑÂÌÊg÷ÛÝ|MiÃ8= ÇÞ¶@
¾1×6-JÑ3-XAË43^qg·Âïó£Ë³Éº¢Ù~>uÀ)6c¬XÒÌ\|Ëy¬<ÙH¢+ü/_oYWþ¤Â\öZú*¼	%ØÅücîYW@æçë=}*h£}?¤
þ®Á¹&¯¯XVâtå>ÿbjo^ØU§gà;âÔµTOÓxRÞfÏ¦7#:¤Jm­ßR °û¿_ ¯¤[ÈQ©[à}¬õdZ¸à=}Ú"O-+Qh¦x0ÅÂ#-Éè¯Ãùê¡{¨v.´¨i^³rÓcü×+Í ÝZlNöqkBÑao¬õ³,Ã|	ÙkòÅk0øm6z¿ºDòy¡ZqYL)ÒW R¹¢iæò¡pæiñ¾°Ï­ØBâöç ½'ÿ:Z§AjíÕÓßñF¤L?J»È{<; 	ñ¨ñ¨ñ¨Vî¨:ñ¨aÿt¬yï¹QÎ!VÄÿGF2ÒøC!a_´ýÛCT\IOÿÄ¨:À-W¬mâ6d"rCÐ_Ä"ÉÑ¹Ø·ìf.W¶=MàJä6ÞmÃÝáÜ§V¡Ðl'eW!ï4oH¾#ÔÊÔ6ÖFë² É4ú¢P­g²>Pîñ3³vJw±¬íy§²ZùýLÉn¨¤ÁyÆÇiúýÇ´rË¶«Ö>I2ó:Ë# 443@EIê´3'hVÂù,>LBz,à5nÔºùÍo.v²½¹Û²$RJ8\8jt9.qIÂÖE÷(çÑÑm,tXà¦UÇªâ d ¨a àÚY¢SK¤ÃbqJr ÊàTT&gãÈð2P¦Ö§4þÉ^X#×	¿Âõ¯ýÈ² =}ôâ)Ç)'³tjo3+ÒÁ 9¶@k©¢K¬ü/zNÅ¸|Sù²]K÷*S5*¬'Î»iÌ\W#oq¤âNxiNg5<} îö»qÞÆÓÛÇ	ËÙÐö½4e$ÜÕj¦Cêè ¡xÄtHWtÿÏ¡qª¥ ýÍüm½<ëI?<Û§ñ¨ñ¨vÚ¦¶¦±V÷U"æ¨ÇG:Î5Êí§ÅÎþ,ØWÖ ´á{ùØ]4¢O´,öM\ù¡PIpä-ÆôUÊ:æîê4v¾:W­ïCÌ!1¡¨7U°kl=M 5|qG$*ß
õN574È<Õ9Ál+ªãS®ñldÄp 7¸O¡Óìv	W(B!wÙ¡|¸Ç= h²g43âPÉ×úÈ8Êq÷0ñà5ßh´]vÉ®(Ûx=M±BÑ¦vìÌôï÷¬½	gÃ¯|8ÍFÚßéÃ¨3µòVõp)sº­¢:J©Â¶-T1H´lå*Ñ0/â6ë8áJ=Mj¸4âôZnò5¬rÚÄ9#¸Lû¨{ÝBÏO4[M6½ÔÞW}*×KI3¿m¨ºcrÆþ¯rÇ2Ý«1¥[ú[½xyÌ÷X×c	Å&é£ÑùÊa!âS-Èô÷sÑ&¬Ç ÌÚO
:ÔÑû¦D'(,]Ý_©b.ü¬Eq!ä7qzÐ©6o1gv¯â*Ô¼A­Ô÷ÒØQÜ¦îËó¢úmÖ}âW©iõitî­¬lÞ.2wç.D:eÚ¸ª.»=}iOÝ²åËHT§¿®lmæÅÄîg9*= ·Ïh ßúÏ=M&àgec^²ºT9 	y(EÿP§úüýÝ1,ïe·åph:êzïÁõ@pwå h¦´WÂ'uù3¤¨xº(æþì<*UË§[säÌçàÈWËª¨N:Ù§Ý÷Ô¡¡X¨aüîÀ/*²ôÀ)¹9îPÀvè×Ä©~°V)ð\Ç¤¢·vàòI*üêXß%[âÎð¯=M3úAèöó ýìiõ,e'!0½©*²npãÂ!jµ3Jµøg(ºjª0=M&½ùy×ñ2\6éJúã¹±·
Ïø8'ÒZ[p;öªArû|J­o		|§GÍ#nÿKzgTÀ\ÇÇÁtÎtÞªÁdYV2kÑ^C«6¨?2x^ÃÚÈ&sÅcPÈ-¯&c¢êÊÝâjÇ»9<®¢Eku[=M^<êÀFl&KrÃÃ\e]eww	P¬§¿LÈÄc÷[Ý:ÞÃ¡Äd!è7Ô9a!l°J æ£ðÒ«= }ý-}Döu= Óºf§D6rw_tDyÍëÅÚÜÏ2/~ßGà¬iÌgà¦Å©º¡UÛ&þ.áñ¨B6§ñ(ê¨ñ´2§ñÈâ3 £wÓk0]N½®a¿ÆÔË6ÈDöÓëhÂDzÆÔ ?é¼Dùèã'ýøºÔ+Ü¶«¿ê8¾·»D>G-8G2õS/uS¡ljë4þ+$h¾HÁ= BSQBnÕmC¦Tçkgçÿ]\L1bM,xLy&NÜmË;ÞÚDs¸s<NN+Ï;¬w¥Jÿþ{xYè¬¹SÂµ6sãÈÃ~,÷ñÊõgÇ|ÅGÙÒÞcqU5Ý£Ä½Ç·¢_å^,ø_=}:³[Ý\W%9+£G~¼S©ÏÂî°cÎ~kW\+sSZá@%	[pAú¬[wJ»ßc;¼9S:Jª!3¿j¯¹5{¹ÅJi³³^#äR:"Ä³-ÿ¨YC5'ÉÖM)ë­þìC#z¯üm¢Ã×, D=}X\¸	<þy¥ÈXÂ'm/£Û
UMè¸M¤2hÖíTIQÕ¬èD]ÇL.êLq/U|ú<60ÌæÂ¾:$ÂI&ðÝ@è¯/·=Mû	â%ãùãÁt¶ÜKß½HQËÎB-áL1±fÙ]ùûá~-³ù@.Oqÿ#Ëh»3&PòIð%3p3×òE'-õé»1½ ëèÅÞÒÛ¬l}áiýýÇ@Sùªy!wï
¼ÈkØÀeÄÔYôo öÎ,=MM)ò{Dtw[}!sSÂÇÀ%#ló´¢OÐ]t²s	BG~ø+b l°ÌGß\Mn©G6%$Ý :¦bÔ/ñï\hßpõÌîpÙ¬àïL"íé§õÏ| ä/_dÄ8]²%z+Àá¿¹ßÑw§´ ÎK:2FõÑ9Ïx³²âÖvï³µi¬È=Mjéæ"äoGXÌzàÊïß~_¶z4*\TvdôføWÈNý$¾[8µ Af!õhHkbÎAäÕo5Òw8îÙÉÙ|ÜF¤ö8§KÜ$]^mÁ¡2­ÜÞôà­	vÆnO8Áøºø°µ(ÏùýXú°ÇVåôÎN8I óïÀöTlÎ&øj 8!Ðg"Ú­TÞÞ/(	Bi-8«1JÝrì,9vÐ@ Â77= F3¨ÿ²÷ñVþ4¤Ò2+å¸b4Úñ4êÚ+³¹Í2ª9=}ÚºT6ó¯+YA³:ôGBóò:Èòñè§ê×ñ¨öaöÔ41öñ´¦ññÈz5x·¶.Ð|7ôL7°'³©À*èy]~y/5o¹d×
&¤¨«ÀuY·z)ªR2ò.À<7Ø¯MÌF)ó*95­IrûîÝQ®0ó"¶hzñ¼ú®fóãàÕ¹î²-±òxd²zúð$Kj4¿Bb³U)mÄ.µÎnþ6wJå"ía©÷íÐ²«À¾Ò46¦·9ÀÖ÷á Ij(÷
j9Ò*õ7Ó:#³ j4Æ®ª³üä2w­*bùä'fÚó#BúÚ.ÖÆHPÞõVGÁ2ûÎ=MÙºFz}6ûðÜjOâ/%á<Ó=M¨KBKS#Jþ= þì C°WÀ÷èÞÌ4¢G6Ê~/ù,+%yLÆ7aÜIoº}ÆèE5èÀñUp+vNJ¥ü3Þq! Ê§xgzßJµ¨»y#ErÕ£¥Ó½ñZ¬²uÙ@	ûtn8»D5rÊ¡³ê§¼±¦Lqn³ÏKÙªñlf§ìòº¨k!îhµ/ñ4ÌI+¬ÿ¬xbw×%Çfáie­z­¾h®Â>*á¶]FÀ%«Y&¾á¹ù35R¨Ê8ÊÇÎ<ÓLÃí=M[B¾À[²cçùÁÚñkçMÉÌ´LðÊÃc÷R@o±ÄvtQíJìwOBb¬wY¦a?Ïçì¨MÙ¸ýôåG¯ü$JdóòyPì¡³MÞezHyþLúvXrd>öi ¥¯a} ýçsFÔxí,¶|q)Hüë= tjRd®­ì7iOí-[ºÏÂÆù4S¶qZÂ0Fëµ<¥úR{vïKr¦FuñCîÆ?^àã¢Q^+¯lUBË"j|ô?îY+{Å7cdWà+óa í¼m/ïÏÁGæecþ"2mÉLÛa£ë;ø·<@f@·dòû-±<)D³8}{7b<þ¹9r:L+ê{ÊúDï8Ä{AÈ=}å?ÖeÜ¼{5muï>G¢ß(g= AD¤Ö#&z _:= óÜËOêOú@o}jÚ'(.£êºiôÂ!Ë{q tC¾Õr¾e©ßñElAâÍ§{EàWÝ¬YÄï)w¸Å^1gÁQÂÆÆÌ_Å[S¤rÂüüSE7¤¬àjdødêÎñ¬b4xõ¸ÔosÍ»xTiî= æ¦¥Ö§êùÃ##L®íoà¸^¢=M£ÙO=M´Þ-Hc)Òij=Má%²U¯l}Èf¨p¦=}ôuÑ×Î©Cøc¨¸kÃÅG[ù/vùRxØØG':íË*§8Ê¸¦¡²3dîs-Ëô)ù¥ È (Ç6rí6"Âu±¬1n0[fp§d gð
µ±Ü§@æÿXØ%ÆÓÅÓHFÈuqy'òíx9ýo
$ìèFOÔ¼þkQ+òBÆ´hufú_õp3ß#{ô#"ÝõøYÝóÄV6r#)kòs«èûqîiµØ¦äÑ·Ëk4c"À- i÷d²Z+ ÂV¨SúÁU,(QwqÄöh-"èl®Aòv[ ¾·!-ÅÁ ·Ëey÷µ>Ê*LùÈs÷Âb8xÿ0§-V= ×&Yv
ªz£µ¯­ö´éü9¹¥R
n¹	æù 6º!ÖÚ9Ò~P>òb0!
¸Lz;HÁªk³ÉTÄ1uIX5NlùLoP'$äÉNæpÌn|B0Ö0ëµß\¥"U~.(O×+×Iún0O	±QÖkNÑ7Uy'Ëvþ<òØËM'½ÜL©sM'<!!Àn·«ïZí6}[½MÅ#"kL<¾c_×ÉÔgU+Ï»éØÄjTÌd+ÖEàrO¤ß^v>¶­mÌë_Fý§w×¾ðæ®\fþõ#·lh»*}RÇçC¦¯ÅlãäSLM¸iü_ddg( ÓóÁÑjmól< =}É*Lëì»f<ºE9Ûp=}Ð¨Mã[Îm5¸¯}}õÆ$ÞLädÛ~-$õuxÖ51ß2Â=M#ö¬eèÓÒ"GX)É²hÃµkº=Mf,áó­²E"hd1Ïç£2ÆÏAÄâÏm^ÕúÒ£K cÎ=}pÊÝ|Y~d,ºTÆGÒ7²ê·*zwýî§6Äqñ[5g®º´Ç$5)Ð '²­a¹wÆðpáë#j¡'tÎ¹kÌø2&	ÝNMÀ]0ÚÉÝD¦hy!6ÅÙÉÌb¿(ËÊÏÌ23Ò¢F¥·L¥Kpî3«´·ê·¶= úeâIw R\0Ø÷0)41têú3Ôêsà;ýTÃàBÂ\®G¥bþTPÇµçD"Òµ+ú§ÇËí$Ó¨¢ÁèGúáÛé<=MiÓî>yãE{,GÂ¬OÁO =}5Á=M'­HÔÃéÜÇÑ Æ\Oü*©l½¹+ÀO¾JËj\<¨ª?78Jd7ú¯9:(ÀèEHE2Oç¥ñ¯VëÜÖ	ºl±J{­OÁ2 ñ()ñ¨ñ¨ñ¨¦Çñ¨¢+½­ùú·÷+OüçÌfñpj{99iøÝç<·{Uã=};j:g,<=M/»H«AÙ;9ëm¡~
Z¿½£Ëû³ñ=MCÉi~9b¯	¸BÊWv¼tsôó´³33@?À¿ÿÿ= _àß POÐÏ¨Âl÷}í-e¥UÕõ5a¡QÑñ1i©YÙù9|\LÌì#{|ûÿý	þb[sgmui\= ^vêëóçÝáÜôèîöª#yyt¨nBJ:#ÿç÷ÝíÕáÉüìäw0'à¦ò*zµ49&1þu±ù¤ÀþFÿÎÒ*y¸6°.T2ÃÇ=MáùDg(ýÈB
ú'ycÝQOÖÙxsqs°,8âê:¯	vqòá¦§, v·Æ²Äh$×t¸60
Wu$Hb*¹ÂãsqIi¶8¸pâÙ±&'Àâz-Ô	6ó}ûaôØ7= Ê #ô"f?(=Mõøi!m6«ô¿p$(­LÒ½Ä= 8%£ÚÑÀ2áKn7¿Hõ@=MÈÈÈ02òaXú@øÝv´-_IrÍfÊ}¯®®®^^Ø$íb|b$cOÉwuAüàW­MÝLÄÿg´¯)Z...ÞÞT­C@]=M«óÄÄÙ´ÏéùHçXþ9]YO¿;;C)¡ñ¨ñ¨÷§ñ¨°1xqÖ*S©Î;.Kûv¬ò°H1,ñSýÅó]g!NÕ³aWaÄ~·§U+ÕméñGæ4ÁqÙñHâSÖÀd¿ nú ±m×óDSû¸Es=}">UóA'b¼>÷ªE+×Miò?4½QYò@CÚÖ¼D?ü0xzü.±wT×ëtÓ|op©Hñ.Bx÷©JéÎþTf¸ô~"ÓÒt÷2Òx£*ÓÏÜwÜãgMyàä§LÍubá gªc&UíÁª¤&T­ÁïÉ0ÈÔ?ñ+føéËäÓË¼wÛÛFg=}yßÜB§<MuBá_jc$Eí½j¤$D­½ÏÉ/ÀTÔCPq+^XøiËÄÁÓÎÔÿXBº=MV1AtØ¤Ç,#-t· x%ôµ'= Ù8÷¦mÁ,ÏiðS4Ç¡YðT!kÚÕÉ¬?	ðÑh	îñg$W¢ÛÓ_¥pñ-V÷¥réÍ¤ÕÃ|wßËFhÿ}yÝÌB¨ÿ|MtÂáOjd ìÍê£ ¬ÍÉ-àÔÓcÐ£= q-NØ÷£biÍÁÕÆÿØbºÖ1aô× ç,$
x-v
7¸%ö
5'^ù8ø¢­Á.Çiîs3×!Yît)«ÚÔÙ,?°Ñ¢X®ñ"W$XªËÔO¡°ñ,vø¡²éÌ$ÔÓüwÝëÆg]yáìÂ§\Mvá¡oêc(eîÅê¤(d®ÅÉ1ÐÔÔSÐ q,nØø¢iÌÁÔÖÿ¡Rº1!QôØ¨×ªZU<8:¨i:{J¼­|O;bñ¨!ÿñ¨¶çÂñ¨òvñ¨ñ2ðeqpn5ÔÅõ¶§âwtXgÍÑä¨çrã«¶z·Lö¹¼«¸à[è©,¦Á½]©Ò ÙW@Á(ªÎnmçcb8Ð]é£ØW%3^¼¡§®þ']²B1Zå2ö¬%¬eôüÁ|úv9ff%Ï$~½çÓ_.åQ÷Yw¿gØ¹ZÔaNxbí(Æ¢pûÙpÊE26= /ìùI¶ÙéÝµD8\®^À7$Æ½=M±mZ)¾hv@ðXVYªIÎÇó(²×=}ª2ûl×= ävað÷RØõ~êÖ×@æG2äÛ¢#¯¤'óÉc pºªÊãõZ$¬æ±ÓK:Øé§©.:ÊØEðÁþ}÷Û¥1R ´>Ö.çMWëôdg¸®ÈóÙÉ·¦3
ö«ªâAs	©g7%ü!>&×Jâ6ý,f¹wÝH÷Î=}ôÂåC2F®"fÞ%ák9íí]­f-¦´wsY}æ(sY:nJJI= «#áWO!D(í eºcÍ,Ò<5[;SÃSgÁi¥ô)9+4ÙìÕçØxvUU£Ê÷nÎ\aíØyX=M uà¯$×)þ[gÁGÞëU¡rGþ-kHþsçJ.ëºÁ$»;;KC}l:å ¾ïÓa¤nÈ=M¥Õào¤Õñsèâ´Ê¼SNìl ÿ	SÅàlPg'ÈüWÎìt°)SÉ lXw·'
>´ÙV.t
Ø.u è.v
 ø.w!"÷5wâÓyCf»}S;]A<SN°2Êré¡v·Ê:î&´±øÙ*¢µ'Ú6ì¦º±ØÂ"´°¹±Â2¸°º±¾.÷pz±Î. ÷pº± üé·ÐRö-Ù'Ò´îfº±0¼8Z±0Ä8z±0Ì8±0Ô8¡º±´ÒJ±´ÒZ±´Òj±´Òz±´Ò±´ òúx!tê,*,¦ÕñÂø'¤ª¢«Q¢­q¢¯¢±±²«R²­r²¯²±²nkFnlVnmfnnvnonpnq¦nr¶T}aíÌÌçavTáíÐìç i¶X@ØHXPØXX=M= Ø=MhXpØxXØXØX Ø¨X°Ø¸A½HÁXÁÅhÉxAÍ Ñ¢Éè;¿SÃmÓ°6ÊÅ-»=MØ*³ 4÷z
:®×z.¡9'n6 'ÚwÒ÷Úy=M5º$n8á*/ZYNRÙVZZ·Äz,d¹ ò32îBo;»kK>¬L£ÿFíÑ= "º)l2Ô¶8!Ù®ô2º1Ë¸j1Ï¸ ª1Ó¸¡êª1×¸¢*ºwÃJ,]¹ÿÎ3MªwÅ,e¹ î3Q*wÇÊ,m¹3UªªwÉ
,u¹.3Y*ºµËyßR$µÍùßr$µÏyà$µÑùà²$µÓyáÒ$¢µÕùáòØº9µ×yâ$²µÙùâ2$:ëB@;»{K¿Å´v84Ü@ÿ>,|÷KzÿN,÷Lºÿ^,÷Múÿn,÷N:ÿ~,÷Oz ,÷Pº ,÷Qú ®,÷R: ¾,÷SzÎ, ÷TºÞ,¤÷Uúî,¨÷V:þ,¬÷Wz,°÷Xº,´÷Yú.,¸÷Z:">4|ùËzN4ùÌº^.Î47 ynúÔ*º!~.Þ4=M7¤ypúÕªú!.î47¨yrúÖ*:!¾.þ47¬ytú×ªÙºÙÊÙÚÙêÙúÙ
Ùy¸Ú¤¶AKþ;Ûk7ØÈ×¨É¨ñ¥rðáñëñ¸äpù$¤9äntÙMêÒé1ÑwÞ§¬ò?¦m
@ÙÎßÚ°é²Ì¬±ó
RýðMjnar¶Ô1³rÝ°!ËT!¯ò6{Ð¤I³J=}Ö(&áòé¬ùñõâ}oÖ*}
µrsÜ³v*Lh±äÒàV'Oò³ô1µò¯òPÒ¨ón~áv#¬zEÉ.w^|Z¦&ã=}§®¢}ð]jlûAruäÿ?öwfÌug¬ÔSòµÀd1´ÿ²0ëýÐË¿n$^p¡sN¹Mß"¶Ýùõ	lÀ)ÚF¥ÜÆøc{V¨àa(|Æ=M¤äøeâô6eðÞùRââÐé-á^¨±ÒÊÕ$§5jö¢¢;}DMj3Z7"ÂÞ<ÜîQ9À:§vQKðrkØ|¡DÒâcÆÿf_æ?=MÓ´ÝP$m	må/nu<=MV§ñC4Èñr µÖ§ðKÕHrÇÈòí¥8òÛGHÁÓ^¼IgÌÛ}ZçLeÆLQÃÝÂD»TqCÍä®d¤çàM%¦åðý¥p=M}¬0oä¥HoÖë¢³[}ßD5zW°#ÿ*&§7uÂºRB>Ýàdb÷g Õ¿ÍâÖ;l=MPæRÝÖ§ ÕÑêö{ìmÏ£Ke|ÉEh]àcÞ~ËsÔpEÎcàPåä&êJö½K]zDÊÚ7èÇ¶»ÌfC>;w¢ñ¨
Wö¢ñ¨'ñ¨V|¨(qå!º°vÒ7UÿYtÈõèP/Fºç.G¿M¶Ä0ÿ­ylÐËLFÄÿ¯-Ê·al,¶Á	"9#8Ê´,Á×´jîÚ'/½Ò= M¢Ämÿ©ÈéHé~!~!/Ñ¤©áõþ²]³o³c£_¯sccå\qÊÒ àîmL9¨éX4Y]:·UzÀÒUÒü! .åVWÖ(Ö(â#Ú©ë®Ð5±Ð~ÂòäÔ§J©ß@lÀ÷/ó©ácxÍ ¡ÏÏÑqB±µsGvFøÝmí^f¥÷Õ×&Ø&×öÂgGÁFïÒ#iêð8»% h¥Èñÿà+ÎÎMn¤Qú»YTSKRZku¡[¯²ª
´õq¶±ñtñ0ÈÈ¡Óp§q·ðaø¶¢¦°ÇòH÷¿ßÿç¿×R®ft0\h¼¼h¼\Þ¹iÆ§â DLeÜKMK	?Ý= ÀGød²CÞÆ=}GZÿõhâæåà¦¥©¤ ¨¦¦¢ª*##ß.6Öðùv­UáÚzUüt:eAKp!=MñøÒ|×¯;1oÕÚ%ôfâ5µH8Un7G>ÃÜ¡ýàé	È<ÿm)fèÜaÉ;l7!x =MåUÿz5«xtÈyt^æb/ç
øÐS{Gð¨Ê2­UÿJJá8tB¦!¯w¶öG¾Úð&dV,Êì;:-Z.+É6­UEÍIr`});

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
    this._init = () =>
      new this._WASMAudioDecoderCommon(this).instantiate().then((common) => {
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
      this._common.wasm._opus_frame_decoder_destroy(this._decoder);

      this._common.free();
    };

    this._decode = (opusFrame) => {
      if (!(opusFrame instanceof Uint8Array))
        throw Error(
          "Data to decode must be Uint8Array. Instead got " + typeof opusFrame
        );

      this._input.buf.set(opusFrame);

      let samplesDecoded =
        this._common.wasm._opus_frame_decode_float_deinterleaved(
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
        this._common.addError(errors, decoded.error, opusFrame.length);

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
          this._common.addError(errors, decoded.error, opusFrame.length);

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
      return this._postToDecoder("decodeFrame", data);
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data);
    }
  }

  assignNames(OpusDecoder, "OpusDecoder");
  assignNames(OpusDecoderWebWorker, "OpusDecoderWebWorker");

  exports.OpusDecoder = OpusDecoder;
  exports.OpusDecoderWebWorker = OpusDecoderWebWorker;

}));
