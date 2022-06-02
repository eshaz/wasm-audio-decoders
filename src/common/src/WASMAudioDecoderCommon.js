export default function WASMAudioDecoderCommon(caller) {
  // setup static methods
  const uint8Array = Uint8Array;
  const float32Array = Float32Array;

  if (!WASMAudioDecoderCommon.modules) {
    Object.defineProperties(WASMAudioDecoderCommon, {
      modules: {
        value: new Map(),
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
            if (wasm.length) {
              module = WASMAudioDecoderCommon.inflateDynEncodeString(
                wasm.string,
                wasm.length
              ).then((data) => WebAssembly.compile(data));
            } else {
              module = WebAssembly.compile(
                WASMAudioDecoderCommon.decodeDynString(wasm.string)
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
            const puffString = "dynEncode0024$%$$$%:'&££%£(££££%£'£££%£'*)$%$&%)'%$4*3&£%e´´(/£$e´´(/+C'*&$($(/'%.ê6)%(£D$L&@E&D$L&<E''dD%D&n(dD$D$L&8F(e%Z&8D(D$L&0Q$$E)D$D&e,F(Z&@D'D)D&E'D(E&0%//D$D&D%Z&@D$D'D%Z&<D'e£D%e£/â&%*£G$eDE+'£D(eDj(£D'e$D'e$n?F,E(D&E)'dD((dD$D)R%$e%F*D*S%$e%_%$D(e%E(D)e&E)0%//e$E*&dD$R%$D'j1$D$e&E)e$E(e%E*'dD(e&F'eDj(de$E)e&E('dD(D+D)_%$D(eBj(de$E('dD(D,j1)D&R%$F$(dD+D$e%F$D$R%$F$e%_%$D%D$e%D(_%$/D&e&E&D(e%E(0$/$)D$D(S%$D)E)D(e&E(0%/$/$/D(D)E-D'E(D*e%D-R%$F*e$r1$//D*)D$D(e$_%$D(e&E(0%///%)£e&E&'£D&eDj(de3/D(D$e%4$D'F'D%L&$D&R%$F)n(£D%L&(D*D(D'e%R%$)D&e&E&D'e%E'D)D*E*D(D)e%E(0%///Å'%)£eô3e$Z&$eø3E(&d'dD'e@j(d&dehE'e%E('dD'(dD'eð3D(_%$e%D'e°4S%$D(E(D'e&E'0%)'dD$D%4&F)e$l1*&d&d&dD)e#%q(dD$L&$F'(dD$L&,F(D$L&(j1,D'D(D)^$$/D$L&,e%E*0%/D)e¤&j1&D)eÁ&o(de3/D$D)e¥&e%F(eä,R%$4$E*D$D&4&F)e$l1-D)e%F'e´3R%$D$D'eô3R%$4$F+D$L&,F'o(de3/D'D*D(e¤,R%$F(E*D$L&$i1$D*D$L&(o1*'dD(i1&D$L&$F*D'D*D'D+Q$$^$$D$D$L&,e%F'Z&,D(e%E(0$/$/D$D*Z&,/D)e¤&k1%//e$3/$/$/)D(D'e%_%$D(e&E(D'e%E'0%//e%E)/D)/#.%0£G$e.F(H$D(D$Z&$D(D&Z&0D(e$Z&,D(e$Z&@D(f$[&8D(D%L&$Z&(D(D'L&$Z&4D(eÄ.E/D(e-E0D(e´,E1&d&d'dD(e%4$E2e£E$&d&d&d&d&d&d&dD(e&4$2'$%(,/D(f$['<e&E)D(L&8F$e(F&D(L&4F-o1,D(L&0F,D$F*Q$$E+D*Q$%E.D(D$e'F3Z&8e¢E$D*Q$&D+e#%k1+D(D&Z&8D,D3Q$$D.e,F*e£e,e#%k1+D*D+F$D&F+D-o1,D(L&,F)D$E*D(L&$F-(dD(L&(D*m(de%E)0./'dD$i1'D)D-D&D,Q$$^$$D)e%E)D&e%E&D$e%E$0$/$/D(D+Z&8D(D*Z&,0&/eÔ-Q$$1'e$E&e¤3e-Z&$e 2eä-Z&$e¬3eä2Z&$e¨3eÄ2Z&$'dD&eÄ&j(de$E&'dD&e%j(de$E&'dD&eTj(de$E&'dD&e4k(dD&D/e,_%$D&e&E&0%//eä-e-D(e)eÄ&4%>e$E&'dD&e`k(dD(e)D&e)_%$D&e&E&0%//e¨3L&$e¬3L&$D(e)eB4%>eÔ-e%^$$0-)D&D0e+_%$D&e&E&0%/$/$)D&D1e-_%$D&e&E&0%/$/$)D(e)D&e,_%$D&e&E&0%/$/$/D(D)Z&,D(D&Z&8/e$E$0&/D(D(e´%Z&PD(D(eô)Z&LD(D(eTZ&HD(D(e$Z&DD(e)4$E&D(e)4$E)e¡E$D(e(4$E+D&eAnD)eAn1%D&e¥&E,D)e%E*e¤-E$D+e(F&e$D&e$n?F)E&'dD&(dD(e'4$E+D(e)D$R%$e%D+_%$D&e%E&D$e&E$0%)e$e7D)F$D$e7o?E&D)e%e¤-E$'dD&(dD(e)D$R%$e%e$_%$D&e%E&D$e&E$0%//e E$D(eô)D(e´%D(e)e74%1'D*D,E+e$E)'dD)D+l(dD(D(eL4&F$e$l1)D$e3q(dD(e)D)e%D$_%$D)e%E)0&/e$E-e'E.e'E&&d&d&dD$e42&$&%/D)i(deE$0,/D)e%D(S%)E-e&E&0%/e/E.e+E&/D+D(D&4$D.F&D)l(deE$0*/D(e)D)e%E$'dD&i1&D$D-_%$D$e&E$D)e%E)D&e%E&0$/$//D(S%-i(deE$0(/D(eô)D(e´%D(e)D,4%F&(deE$D&e$l1(D,D(R%ö)D(R%ô)k1(/D(e$D(eTD(e)D,e%D*4%F&(deE$D&e$l1(D*D(R%D(R%k1(/D(D(eLD(eD4'E$0'/$/$/D(e 2e¨34'E$/D$D2i1$/D$E)D$e$n1%/D%D(L&,Z&$D'D(L&8Z&$D$E)/D(e.H$D)//½%'$e¤,/^'$($)$*$+$,$-$.$/$1$3$5$7$;$?$C$G$O$W$_$g$w$$$§$Ç$ç$$&%$eô,/K%$%$%$%$&$&$&$&$'$'$'$'$($($($($)$)$)$)$e¤-/I4$5$6$$$,$+$-$*$.$)$/$($0$'$1$&$2$%$3";

            WASMAudioDecoderCommon.getModule(WASMAudioDecoderCommon, {
              string: puffString,
            })
              .then((wasm) => WebAssembly.instantiate(wasm, {}))
              .then((instance) => {
                const puff = instance.exports["puff"];
                const buffer = instance.exports["memory"]["buffer"];
                const heapView = new DataView(buffer);
                let heapPos = instance.exports["__heap_base"];

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

                const ret = puff(
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
    if (caller._module)
      WASMAudioDecoderCommon.setModule(caller._EmscriptenWASM, caller._module);

    this._wasm = new caller._EmscriptenWASM(
      WASMAudioDecoderCommon
    ).instantiate();
    this._pointers = new Set();

    return this._wasm.ready.then(() => {
      caller._input = this.allocateTypedArray(caller._inputSize, uint8Array);

      // output buffer
      caller._output = this.allocateTypedArray(
        caller._outputChannels * caller._outputChannelSize,
        float32Array
      );

      return this;
    });
  };
}
