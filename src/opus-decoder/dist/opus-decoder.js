(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["opus-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  function WASMAudioDecoderCommon(caller) {
    // setup static methods
    if (!WASMAudioDecoderCommon.concatFloat32) {
      Object.defineProperties(WASMAudioDecoderCommon, {
        concatFloat32: {
          value: (buffers, length) => {
            let ret = new Float32Array(length),
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
          value: (channelData, samplesDecoded, sampleRate) => {
            return {
              channelData,
              samplesDecoded,
              sampleRate,
            };
          },
        },

        getDecodedAudioMultiChannel: {
          value: (input, channelsDecoded, samplesDecoded, sampleRate) => {
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

        inflateDynEncodeString: {
          value: (source, dest) => {
            const output = new Uint8Array(source.length);
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

            return WASMAudioDecoderCommon.inflate(
              output.subarray(0, byteIndex),
              dest
            );
          },
        },

        inflate: {
          value: (source, dest) => {
            const TINF_OK = 0;
            const TINF_DATA_ERROR = -3;
            const fullByte = 256;

            const uint8Array = Uint8Array;
            const uint16Array = Uint16Array;

            function Tree() {
              this.t = new uint16Array(16); /* table of code length counts */
              this.trans = new uint16Array(
                288
              ); /* code -> symbol translation table */
            }

            function Data(source, dest) {
              this.s = source;
              this.i = 0;
              this.t = 0;
              this.bitcount = 0;

              this.dest = dest;
              this.destLen = 0;

              this.ltree = new Tree(); /* dynamic length/symbol tree */
              this.dtree = new Tree(); /* dynamic distance tree */
            }

            /* --------------------------------------------------- *
             * -- uninitialized global data (static structures) -- *
             * --------------------------------------------------- */

            const sltree = new Tree();
            const sdtree = new Tree();

            /* extra bits and base tables for length codes */
            const length_bits = new uint8Array(30);
            const length_base = new uint16Array(30);

            /* extra bits and base tables for distance codes */
            const dist_bits = new uint8Array(30);
            const dist_base = new uint16Array(30);

            /* special ordering of code length codes */
            const clcidx = new uint8Array([
              16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
            ]);

            /* used by tinf_decode_trees, avoids allocations every call */
            const code_tree = new Tree();
            const lengths = new uint8Array(288 + 32);

            /* ----------------------- *
             * -- utility functions -- *
             * ----------------------- */

            /* build extra bits and base tables */
            const tinf_build_bits_base = (bits, base, delta, first) => {
              let i, sum;

              /* build bits table */
              for (i = 0; i < delta; ) bits[i++] = 0;
              for (i = 0; i < 30 - delta; ) bits[i + delta] = (i++ / delta) | 0;

              /* build base table */
              for (sum = first, i = 0; i < 30; ) {
                base[i] = sum;
                sum += 1 << bits[i++];
              }
            };

            /* build the fixed huffman trees */
            const tinf_build_fixed_trees = (lt, dt) => {
              let i;

              /* build fixed length tree */
              for (i = 0; i < 7; ) lt.t[i++] = 0;

              lt.t[7] = 24;
              lt.t[8] = 152;
              lt.t[9] = 112;

              for (i = 0; i < 24; ) lt.trans[i] = fullByte + i++;
              for (i = 0; i < 144; ) lt.trans[24 + i] = i++;
              for (i = 0; i < 8; ) lt.trans[24 + 144 + i] = 280 + i++;
              for (i = 0; i < 112; ) lt.trans[24 + 144 + 8 + i] = 144 + i++;

              /* build fixed distance tree */
              for (i = 0; i < 5; ) dt.t[i++] = 0;

              dt.t[5] = 32;

              for (i = 0; i < 32; ) dt.trans[i] = i++;
            };

            /* given an array of code lengths, build a tree */
            const offs = new uint16Array(16);

            const tinf_build_tree = (t, lengths, off, num) => {
              let i, sum;

              /* clear code length count table */
              for (i = 0; i < 16; ) t.t[i++] = 0;

              /* scan symbol lengths, and sum code length counts */
              for (i = 0; i < num; ) t.t[lengths[off + i++]]++;

              t.t[0] = 0;

              /* compute offset table for distribution sort */
              for (sum = 0, i = 0; i < 16; ) {
                offs[i] = sum;
                sum += t.t[i++];
              }

              /* create code->symbol translation table (symbols sorted by code) */
              for (i = 0; i < num; ++i)
                if (lengths[off + i]) t.trans[offs[lengths[off + i]]++] = i;
            };

            /* ---------------------- *
             * -- decode functions -- *
             * ---------------------- */

            /* get one bit from source stream */
            const tinf_getbit = (d) => {
              /* check if tag is empty */
              if (!d.bitcount--) {
                /* load next tag */
                d.t = d.s[d.i++];
                d.bitcount = 7;
              }

              /* shift bit out of tag */
              const bit = d.t & 1;
              d.t >>>= 1;

              return bit;
            };

            /* read a num bit value from a stream and add base */
            const tinf_read_bits = (d, num, base) => {
              if (!num) return base;

              while (d.bitcount < 24) {
                d.t |= d.s[d.i++] << d.bitcount;
                d.bitcount += 8;
              }

              const val = d.t & (0xffff >>> (16 - num));
              d.t >>>= num;
              d.bitcount -= num;
              return val + base;
            };

            /* given a data stream and a tree, decode a symbol */
            const tinf_decode_symbol = (d, t) => {
              while (d.bitcount < 24) {
                d.t |= d.s[d.i++] << d.bitcount;
                d.bitcount += 8;
              }

              let sum = 0,
                cur = 0,
                len = 0,
                tag = d.t;

              /* get more bits while code value is above sum */
              do {
                cur = 2 * cur + (tag & 1);
                tag >>>= 1;
                ++len;

                sum += t.t[len];
                cur -= t.t[len];
              } while (cur >= 0);

              d.t = tag;
              d.bitcount -= len;

              return t.trans[sum + cur];
            };

            /* given a data stream, decode dynamic trees from it */
            const tinf_decode_trees = (d, lt, dt) => {
              let i,
                length,
                num = 0;

              /* get 5 bits HLIT (257-286) */
              const hlit = tinf_read_bits(d, 5, 257);

              /* get 5 bits HDIST (1-32) */
              const hdist = tinf_read_bits(d, 5, 1);

              /* get 4 bits HCLEN (4-19) */
              const hclen = tinf_read_bits(d, 4, 4);

              for (i = 0; i < 19; ) lengths[i++] = 0;

              /* read code lengths for code length alphabet */
              for (i = 0; i < hclen; ) {
                /* get 3 bits code length (0-7) */
                const clen = tinf_read_bits(d, 3, 0);
                lengths[clcidx[i++]] = clen;
              }

              /* build code length tree */
              tinf_build_tree(code_tree, lengths, 0, 19);

              /* decode code lengths for the dynamic trees */
              while (num < hlit + hdist) {
                const sym = tinf_decode_symbol(d, code_tree);

                switch (sym) {
                  case 16:
                    /* copy previous code length 3-6 times (read 2 bits) */
                    const prev = lengths[num - 1];
                    length = tinf_read_bits(d, 2, 3);
                    while (length--) lengths[num++] = prev;
                    break;
                  case 17:
                    /* repeat code length 0 for 3-10 times (read 3 bits) */
                    length = tinf_read_bits(d, 3, 3);
                    while (length--) lengths[num++] = 0;
                    break;
                  case 18:
                    /* repeat code length 0 for 11-138 times (read 7 bits) */
                    length = tinf_read_bits(d, 7, 11);
                    while (length--) lengths[num++] = 0;
                    break;
                  default:
                    /* values 0-15 represent the actual code lengths */
                    lengths[num++] = sym;
                    break;
                }
              }

              /* build dynamic trees */
              tinf_build_tree(lt, lengths, 0, hlit);
              tinf_build_tree(dt, lengths, hlit, hdist);
            };

            /* ----------------------------- *
             * -- block inflate functions -- *
             * ----------------------------- */

            /* given a stream and two trees, inflate a block of data */
            const tinf_inflate_block_data = (d, lt, dt) => {
              while (1) {
                let sym = tinf_decode_symbol(d, lt);

                /* check for end of block */
                if (sym === fullByte) return TINF_OK;

                if (sym < fullByte) {
                  d.dest[d.destLen++] = sym;
                } else {
                  let length, dist, offs;

                  sym -= 257;

                  /* possibly get more bits from length code */
                  length = tinf_read_bits(d, length_bits[sym], length_base[sym]);

                  dist = tinf_decode_symbol(d, dt);

                  /* possibly get more bits from distance code */
                  offs =
                    d.destLen -
                    tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

                  /* copy match */
                  for (let i = offs; i < offs + length; ) {
                    d.dest[d.destLen++] = d.dest[i++];
                  }
                }
              }
            };

            /* inflate an uncompressed block of data */
            const tinf_inflate_uncompressed_block = (d) => {
              let length, invlength;

              /* unread from bitbuffer */
              while (d.bitcount > 8) {
                d.i--;
                d.bitcount -= 8;
              }

              /* get length */
              length = d.s[d.i + 1];
              length = fullByte * length + d.s[d.i];

              /* get one's complement of length */
              invlength = d.s[d.i + 3];
              invlength = fullByte * invlength + d.s[d.i + 2];

              /* check length */
              if (length !== (~invlength & 0x0000ffff)) return TINF_DATA_ERROR;

              d.i += 4;

              /* copy block */
              while (length--) d.dest[d.destLen++] = d.s[d.i++];

              /* make sure we start next block on a byte boundary */
              d.bitcount = 0;

              return TINF_OK;
            };

            /* -------------------- *
             * -- initialization -- *
             * -------------------- */

            /* build fixed huffman trees */
            tinf_build_fixed_trees(sltree, sdtree);

            /* build extra bits and base tables */
            tinf_build_bits_base(length_bits, length_base, 4, 3);
            tinf_build_bits_base(dist_bits, dist_base, 2, 1);

            /* fix a special case */
            length_bits[28] = 0;
            length_base[28] = 258;

            const d = new Data(source, dest);
            let bfinal, btype, res;

            do {
              /* read final block flag */
              bfinal = tinf_getbit(d);

              /* read block type (2 bits) */
              btype = tinf_read_bits(d, 2, 0);

              /* decompress block */
              switch (btype) {
                case 0:
                  /* decompress uncompressed block */
                  res = tinf_inflate_uncompressed_block(d);
                  break;
                case 1:
                  /* decompress block with fixed huffman trees */
                  res = tinf_inflate_block_data(d, sltree, sdtree);
                  break;
                case 2:
                  /* decompress block with dynamic huffman trees */
                  tinf_decode_trees(d, d.ltree, d.dtree);
                  res = tinf_inflate_block_data(d, d.ltree, d.dtree);
                  break;
                default:
                  res = TINF_DATA_ERROR;
              }

              if (res !== TINF_OK) throw new Error("Data error");
            } while (!bfinal);

            return d.destLen < d.dest.length
              ? d.dest.subarray(0, d.destLen)
              : d.dest;
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

    this._wasm = new caller._EmscriptenWASM(WASMAudioDecoderCommon);
    this._pointers = new Set();

    return this._wasm.ready.then(() => {
      caller._input = this.allocateTypedArray(caller._inputSize, Uint8Array);

      // output buffer
      caller._output = this.allocateTypedArray(
        caller._outputChannels * caller._outputChannelSize,
        Float32Array
      );

      return this;
    });
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
    constructor(options, Decoder, EmscriptenWASM) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
        // We're in a Web Worker
        Object.defineProperties(_Decoder, {
          WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
          EmscriptenWASM: { value: _EmscriptenWASM },
          isWebWorker: { value: true },
        });

        const decoder = new _Decoder(_options);

        const detachBuffers = (buffer) =>
          Array.isArray(buffer)
            ? buffer.map((buffer) => new Uint8Array(buffer))
            : new Uint8Array(buffer);

        self.onmessage = ({ data: { id, command, data } }) => {
          switch (command) {
            case "ready":
              decoder.ready.then(() => {
                self.postMessage({
                  id,
                });
              });
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
              ](detachBuffers(data));

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
              this.console.error("Unknown command sent to worker: " + command);
          }
        };
      }).toString()})(${JSON.stringify(
        options
      )}, ${Decoder.toString()}, ${WASMAudioDecoderCommon.toString()}, ${EmscriptenWASM.toString()})`;

      const type = "text/javascript";
      let source;

      try {
        // browser
        source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
      } catch {
        // nodejs
        source = `data:${type};base64,${Buffer.from(webworkerSourceCode).toString(
        "base64"
      )}`;
      }

      super(source);

      this._id = Number.MIN_SAFE_INTEGER;
      this._enqueuedOperations = new Map();

      this.onmessage = ({ data }) => {
        const { id, ...rest } = data;
        this._enqueuedOperations.get(id)(rest);
        this._enqueuedOperations.delete(id);
      };
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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString("dynEncode0048¼Ú=MÊXÈÚÙ¬¥Ã:ÃGvA%ùO ÿYdvsÉk·ýI&È{ï¾L£1BòUcPH@P_ñpø ßÇ¨eK;aè¨ÐRõ0±=?È=JÉÀ¬7++æwif÷áâ ÍÂÝ²õïMí¶´Û*Áu¬~Õ]=IªÏûRñ7NÈ.M¸K2Â¶Þ/^Øæ#X96=I=LH=ÕY=HÀ=LØHPLÚ²ëj[kÛ¢­ÖPLîîëbjÝMb±=;ÔpÐÐyYKËÐx²¹ÔÝá!à©a]Ñ8rjy*qçº¤=KJ;O×7±¹ÏH¿©O?¨_?©MW¨W£ø×µ =MVE&[&sÍëDÖäÛçd¼|SV[ð¬rõº>ãD==kOy¹|(h@oVH@N=H©ÖõnÙP³ð*@÷NlÑ®*D0¢nAqð5ÚGêÇb¨&n8L*Ôòæòñï°àÜïqë»æÞÔäo¯<ïÕ&><þCæ&B çÃB$0s§aÅ/1å4ï¾àvBw==H¯¤´KQÛÏ¹vÇUõu05FÁ-nÕ8ckBNÐIÆ÷cb÷FfÖGpEhÌ­40¾{R4âÚ_­[$Ô¥,Âu7=×eÿ½=IÚ»x>âë,ii]BÕ9ÿN0­AHøåßµÆÀQâßÎ5éXWces.pKÕ¥S¾dü=}Á­dò<¦Õþë7s xLÞ®þÐñ²|öÝ+Ä'¹=LÜÑy[ñ×=}=KîB|ïí¦ò@ýÄ6Âµµ=M!«/ÞÅ)ç)æ{y®ê²j=Ç=@È¹´³ò£²Ø£«=L»òzæØ5$@B0ºµ×=I­®´1=J{¦ÖE^gÄ¦w{®®®®®®.?GÇòìfÏ¾¯ïVéò6PÈL=@¶+² õo1÷$i#=}ãNQö#0ÒlÐCðw?8h9Ü,?-9Ö¨«h§¯Ïü¡D8÷Õ3=L¾f×Ðì{¼À=LÉ'êåDãU`rz5÷`G%Nâv{ÑÚc?¾è^#%én?WdE¾Gh(A´0½ÏxfVû08/·Î±zd>Ï±ï=H;*6WòJ=@PHÞ¾bÔ?T¼þs´U]ËG:_8H~ùÁ-(µ]5òe0òk­Gµæëó=H=KÞ­FÂ WOWÑ£kTÑ=}@øIºÖ>*OQ$KÁK¨ÿPBxÿBÜ#â1yÑ^ß=@ã}È.v&+Æ=@{·0Ã~±$?¿b=KnÕ0=}Ã,ÞååñÕr=JãQè·&AGX©Ydk±P[vPÄci3[ ¢n·QÝL}[ò?NpX=}úCÞ`f=K^y=L·IóÃk­<Þ0j×Èö¸BZQ«¼%=HÔ+*£ûð÷f¿=Lôp7îî#K{¬=L%(þ#ãs jòµ?aFZDè©U¥üÃÙWß¿9»9¾M6BÚxZ6«¬~yÅ=Mk-ÁU¢I=Mþû óùXEÏN¶­Å:Á|BEO>³®hMÿýØ·³òÅÛp÷ñ>´1júMÒwøyÏÞ¢Â)©=LÌzZt=bÏzZ`âIÁ>¬H`×¿ó Vc#®]UÈW©Zaâvt=Í:=@@MX0õH9ÌÏ¨Rxo­Å82CïýLxQ-zðWY£G¶8^T{IôxK=}ÓÄ·¾g¤¬[¥®Ã»ÃPºsÕC=H6îã$Z|©f xNÓZ|î4º=JÃ+$à7ªLqY¶qå{=Jõ%C+Á.K2s¸sIsçê{a@2;Õqó]ìNi jöm!GúÔÄñd:oEVAÀ[uÎ1Ù²k12FxT±CþðMn¾%7ÇrÑÔÜR)£n>Ìnã4¹ÑCª}¾x¶ÐéF{4Ý[ÇÇAÛK§=MÌ=T¬¥]á=JÆã:=I]WP=HË?$Õ¾H=Mìò°;Æ·³¡_n¾'%½%¹[ìÎX`x~9gêzÝî=M¶µ«»Ti¬+¾î¯ÛsLWm=WÎYÂDÔ«¿Y¶>ì¿xag=b~QâdèNcFÂÕf;Nªaø~1=HMtf­ÊO=K~æ¥ÿ¥¦äJZyÆbÞPü÷wFVÕ02Tð%·û*ÿ*:>×è`á!)n%j^>ZÅwÃqÀB®=H.÷áYgk®,-é~Ëó%¨=@ôìLÅ¢Ò>=}Mð7?b#ãËò.~øõ.±´u}=D©û¾`s¿¾óÐðlUð SðRºVÒáM?=JÚOÙ^qË=@¯NF¨R§¦ÿye=M<«Õß=Ii×|öV%Â=K£Â=LË=IkMÆñiF4¥ëò6¦0à¾#MHÏåàIãDÌµ7b#ùq!Üno_RT&¿6¼¸²ª7Ë=@=KàËj1´Ç®º½¥éî¶«§¥Û_zÁ^¯9;ÿ¬?ÎCÛv=´=M@=LÈÌnÇpÑ+?=bä5ñyÑe<ßËwt¸rM¼­ú#ì¸=LÐ]Q®ñÍÌcuÖ­x=MWBc=@~VóWCÃÚ¤{Å^Pf&=JMbÅM~ÝzÚ£zp¬êuõü¯gÌrÒÌÔXÔu<£=b¨+µÎÅ·©K Ô5?#äØi«Ö§}ý<ùñ½P)KW±¬vÎþÃe >Z1ki°A±^g¯l%oæVk[5ÛoëBIÑTT$lÈ×Õ$/pãÏxn0Ü©ÝF©=KR=}TßBWÂ2k=JºáÞç¯ßÏyÆjÖ=JlVÉbQy|o~ûÈêåX¹~ÿxÇ¸ÕlçB4ÄE»_¶á}m¼;á×>g%;=bÑè_Qq'Ï±«Î¢?æz=} <ºM{q¬ÃzAÿ©6O¾¼B¦vá=K|ºª×&F>©ÌÂ9Ë=b«Ç5.'u´LÊ´dç²¬5^íj­5>u»Ì&áL6ëK[1ìÒ=LªÍÆðR¬HØõ[êÂ=L[µozÅh}Y°¡ï°m-*qÍéb£>à*lkz6(P Y(º=H¹¤?¹TnìtÏ·#=KÿT³­ôËXGwÈ=K(5p?Ì©i´ríèâÐl²HYÜ©;¨^&næ-µÉÓü¬¾Y=MKÙÑ/¶3s[tê+aÈY;m[Õl=K{ÃíÁ±QFÂJ×=MZAP²Î::=K=H½{ãÕV©[ÀnKë<÷}÷½Zö¸ÔKØTh¬Zæµ=Lí=<È:]èO¶øuÅÙ$oÊ5Ù^D#SñîwÑIL­¡=In=L.êBøuV0à*UK¥FýÌ=bùméîÆrõÏÑaP3ï!>TÉÔZOVµ:´ÌKêu­»N6ªøýòÆ2,h±;÷ÝYó@Jý«O@£K)$T °h¼á7nm»,#l6ÎëJ=b=M=H«WA=@=IrñÂ¹² gwrø£ÉL:? e·_uSsÒèwÒ*¾RHmÈlLµiüRÜÐÃ%á©¥/2ÅgM(c=I¡øÚ÷ó­ø¬?-ÞÇîë´nÉÛÍÁ3µÜ<ç{ `j#é<ýE%áñèYîãø8=}ÚÁÄs=H/á6=HËÚFGÓ7Ý¡©B=J=Kgô[%eg<CH_¥ûÓ~åZÒ~}kÓÚ3ÑBlójT¾^<bèªPKÎ¿ÉÂz6á¹´¾Èýæ®´â±ox=@,Uÿ°=@Úw5þVÏW Ë·=}Õ°ÿþÿ³CôûB©æ÷aÖ®nx~p=L=Lû­Øð} lz(~>bg(Øcg·g//ÿÆÏ5j=LUÂâ#cPo{=MëqÀÒÓÒQpCçBB=}¤Í}tëÿç®=}¡P.ÌïÒÆ9)þ=²ÁÒc#ë¦«44A-Ä·í ¤;²&÷)¥ºßhîîé7Ú|ÔÝ_s2CÕ=I{[J_ôy9XÒIÂfzjX Hlo=¥`èQ kèÊAfòWZ4ÉþË=@ªÚ×Wè2Fjî3QdaÈßÌ²­L¸=@Eä$ÐGYNÁX5BsúÅD)Òß#n3²ÑË;ï×g»12=b>¨F¢7¥_¶ã¤°;åÍ»Dnþ÷Î=HF¬76cþ=M~0fPù=M'=HSyf`hiàWÎsâYTÂjû=@¿æ¹%ÅCHWXÂLîOV=@À'$ÏNÿ}Q+Ö½/¾ÐF¸Ã9U=b)£Eë0KÂþÃâ]ÉÔ¾øÖ6Y&¹çø?4-zâ#Vù.Åº8=H:{=LªÂb9W;=K5±ùÙ=JYx×Römú·UiéÉæ¦î]I%S]±&iÑÔ=@xyÏôØÃ$¯ßÄÑÒæ`Ïê7=KÚÌäëeÅTïD¡ëäçOtm|Ïé-jýBÊ=J¡w©×=}-¯û<^üß'=KZ¨HDr¢þÍß0ÁOØ[=Ly¶ÎITê=}°&uW¶¾p_aqêºÁW·3#áÙ<òÊ;·ü=HÁh'¯x[÷'Tëìø=}, %pNÚ%7åIoãM&¬éûÓJF-ÚMÃÜËsëÊ÷«|¥$mæßd8¯e.u=KDÃºÍæõÃÍª3B×¹@x>Áöæ8¦´8ÿ{-±5tÚ[Àÿ¾Gèë?~|X¶%6cºn@rfZ?§.6Óç²×pÃ=@A32dIÆÌÓµÑvâ;¨ÁlWÌÕàÃí¯&=MÌÈOÅU­1EE>`=}=K[?[¿ÇLº1*$¡k§ÄüáLF>ÙìOOw3õ@ÏçÙÜ.¥KöñgVÀRlY(Ëàäw8)kò-©ö¨:5èßù·ñCÔX; aó8¼_ãÔtâOßòPoº<æ=HUQâu'ÔwÑ3áTN°2=b5Êí¤~Ù4¤Äã®ÜæÓÃ,£ÁÊíc4#]û©Z=}ÂPãä4ÿ(´öÿÅílPaýúbÕm;»9Çd8L]?ÀÖÑb»ÎH´ÌåÚT®&ãóÕC@=@i?Õ¸¡§~=I&×[âÑ7D8W¼v«]º¿/?ýT]rÓ¼°Á =I·=M;=Mç_¹ñì¤ÂïSZ7_G`Kº=H®XÊác©rÆþV1l3y§åÁÄ÷6èÁøKAçysf÷<=@Íí,ÂQ±©ZWy=}.7ªª¯PÆIdÙOn83Á¸vF°ø8udÜÚ{£=OD:±ÝZ2^I2'Jòcò8h§HAç·LJõÿL¥/=M¾¢-ãMc{¯rºÔm?¾¬Ð«-¦:¥sä½=K³ÃÚ_yÑfs°¿NH¤Ò¬úz·8=Lu=L{ca·C}¾;}móísfÀi:,U®jg-eMÃD{6¿¨Lf*Âß´z½§ÄE=Jaîú2:Ðª'rLsæ=KÐ >?=@§ÇPXG¨_~I x¸ý8)ÇÖ$wç~!jÉKøÌÓ½êpÒkÌ¦}ÊÞÏ,G30¡§v=L> /Ë4y8!É±Å}#Ç°$d±åÖæË|°©=I ¦Ò³Ôh­_=Igª{8¦'©pªNF=@=M=H=MH=}E0tËP±&Õ²:<%@>ã!Æ<!N=IãÃ¬Ë@ÎMP~ Ö^îRôTäìG$_Ç~².#N<Ä°=LUýLdH=MxLúuÎwõg[?%ë¬++ÆÄvòé=LØ¢zx#è%Í§fu|{lØâéÝdO¡hÏüYGBPüÆÇ,÷,0;£=Iã©­Jm­/IZIÌ2ÎtNA|Ó¸#x}çseíöA¿l Idª?È=îê=Hþ×=Ká¶ð=K=H«ô%Ç#às[@úóÕñpt.W=J,j ÎÃ-àá|=}çÞRû©(=Ky8¯éÖLìd=Éøy°ýðGtß>·àx´ê;ÕéOôG$jÛùüé=IÉRbAr=H 5UÇ@¡ÚÎýÄ:^òÈXÔ±¨ñ]Å;{/*ãÑ7ÇsBG|=I=L^hA¢³Ã(½ÙeBVEeÝE9WL_<9;VuD=}ÛgÇEÀ¾j`$k¦IÓÑIC-¤©FÊ%i7zÈG#Â>ðg_z ÏUE=JÿR ºN|=HW±v°|@Dd1i¤N=LÊÇéÜ8Iï+­(>àóÓzèïêÙ=IÂÕÞ%îS¸ûKJ<5H>Ï¡.=JÞÈÓSÛI-¬ô:=LÔòÁ>°ÔaÇAå!v%X`C oÆ²B|mCdµðxînØÁùt¤­ I(Ûo¸Püg:ql¬04<a65 íîG©³ºqöÙß5[pÞ3ùÇÚV×á ÜwQøc6æô=@¹Ä²RSéyÂ¬e!OÉqæwx©6=JÝñÁö|Cò=JÜÁd%§×ÜÎ+«3ª*=@8P=b®éÁÏr=J(gfÒ¾¾U w¶4!½Öõ'IÚk®»?õ÷zÊ}ù/úE,®ùÄ¦|M57¨»aCø{½ ò»SqS=JyFn?¿®>L<Å=JQ¸;Û]fù%¯=H<§ÚÜ©¶¥:Ü´ªãð]îù°¥zîÞµ)NÃ>=@C@ÃÀ£Ô÷òtvDoÙ]Eª43Ð?cÈDixªbkÕaQuàf8=Kr=@²R(vM-:Üæß6$'Û/Õq ÞÆí­qZ!Ô÷%¸zaûC¦^¬­ÃC=JìHðb6åG¦áÚYGæØ¯ºªã¥ñ,Ö=M&Tð@=@vm÷ª=b±MÂ^úûa?ËvÂÎÎ,ÙÙõntX5N}{û£H=bJ ,JÍøÌXtí'?äººäP~¬eU^®¼k^ÍëGÞ(n¼åWLnTºóÐ=KPVô÷Ô¸ùwZLb«8þr?w8Ûpä=}cx¶ô-^CØpãî8<81TgÉg*ì¤3Â¹H{ï°¶ä=}ÑíZè$¸9tc=K¬=HÊ vqÞÀJIÞuòèÏ ¼üIF©[BÇ.)`EÀiW=JÝQ¿ÇKÅÃb09ÌZäÂb?AM,$±KxìäaÑe=KÑúf.´É(hçíP.ýQê¾#uÞXqiÊÃÏµöðì2ù=|%¶WN«©%ÚZÏ?ùu?IãbFj-B{U§¯¤3²Sã?Àðì:ûÍV´¸ãgèoá×ùÒæÜcól<oXâbL»çYÙWªbG]ÎCd¿'|)V>g^Â¹7!ÄÙcvmm­+ÂìK¯Ý±kÝqnÔoÛ@á8¤p*Zá¦0×ËáïHÌpèãæ!81ÓÍöLíÆ3w¿3ÏÞs=}ñØ@ÎÔTù_1³o§Ö6³æ¬P/¬iEÝ¦øg%ï=Kd=J)/ýCªBÿ¬ìÌ°x«¥¹Ty¯ S4¾x|C¶|§Æe¼<h±ø*qÄ«LI©ÂSqD0`XîFÛO=@à=HH[fIàÿï)ê¨¦Tçp9óàôGó^éÔÕFyßñP=IþÅJ¹èR£=JUEË=L=KT.×Çq´æË:IP=L%ÿpr¯'Åân3óæq»=MïéÀd¡prÓBm}²«zÍÉ=J×â[¼GEÎxÜ©Ø#Ìûnº©£I¶©ÄÖCÚÊ3ÀýÉñUDÿ!ªÄÔ¹·2@/ÚÝp±R6ãÄÿX·024@ôÀ¡§±Aré35±¥=}õÆ¹½ÐlÄ=LªS©qÆÌ=b¶V®=J'³ÚZA>íÊyËDFagDÕáçCç@,vNQËÝ(ÌÂ©áq¹æ¹CK#/%_¿2æy<¯|<¯ÇÍ3µã_è¤=b=H=K âÛ('Eí%sâK¯ÑÍÁúg{ß;¶¿Ñ¥ v04sÇÛ#Â=L&³0U^WH5H°zß=J§l¢Õ=@v²¢ì±@ÓGê±vþYöNH%=JJMdT(B&Äná!DU§VúÚØ~árèÄÝª',üxL7ádÔ?=}×ÌTIvÉ¤~9úôñtÐw-=LKHII()Jx©U.·B-=Jñ×Ç=}áÃ@G=@ÿ&¦á|fú]=LºFf®ÝíÜ6]s-âºî¢qÉù²p0=LåÉè[x³êÎÚÀ+üïpDkæ½¸Ânª=Ißôq:º£lçÔ{&:¤e¤¥î`<w°Äx0û=KßÓhB2¦·fêûÖK=L×½ÆGÿ =}+§ÛÜÓF1®)êhô=KöÀ}Â0=Mê®S#½úoñ_Ü|=H{Ð8ïwgèR§HçP9tlà¼âa,üÔTf¶´ëQR,Ì2÷%~ËfÌÀ+Ýýµ=bè=Ãá&=MµäÅë~­;zH[ÇÛßÎßÕæ=}¼Ù4ìá]EßrÅwÐäÌé}9~M°®zñçßÛÂ¸]Å¸¬[=}ìèµuZôâê8*½=JÌ]z=Mt=L$JÆÒ±yìUPÀ¤M¯ñ»*WÊvIlPÞ§ìýÀµ)Ë1¹® scÕQËú/·áÔ'xã®~Ç=M´úA®å¯suÆnT+ÇµÕ÷å/úîêèv£¶ãxÕ¶à#1üå_­åÿAª¶ïû¾1¸HïcÓ=Md|õ©Ú¦Ú?pEê*U]Å©m0±2N²ã0ÊAà_¡ÞfOÆ|3ú®ùªf©û®f­{~×ùaá´²;ãéÁÊ±æ¬{xù~ñÁÞÏ´vú1à=IZ§j9ß=M0ã´~.û=J.ô ©ÚøQ»±vw)ÓOç9ãÀ÷v#q)vÕW½­dÆ:c¥eÚ{/æµ/æ=}»sd¯Ïuß´¡åÃòåÃ-dÆºÔ=MvßÐo=boD¤)/4¸`%=MÚk/ÿ»ï½ìr»%Ì7m3LöaC}×ý³f£*óE$ë5$ëúäE$ñ¾6ºö//´¯=Käîõßþ^@wD¯ÙÏN¿VâDwÐ·þïðitD v|Û~>ÊWÌwÌäÝÓY^úi¿§( }Ö]~éÜzé7¨ë*Å_¨wÂÎ¢OÎT¡ÀÖ6$AO#ÒËãÖeé:]æ*©ãÛ=MTF]F»õÜÖæ<ZW×ÑÕfªRú=L#úÏ'xy¡!qÍwnôÃÄzkóº½2/]&_Óþ©ÎÿºÄ¹IK¤§V¹ô!Tà=@`µvÞ×l±,ðOSæÐàþzf#]ú=HTxÄ¸O|¿Ç¤BÆD¤DA¨:#Á;¿h§?Ä_$6¤/ ìòÅëùV×Ýì)ÐÏP6G¯fC`Ë§~Ow½3¬=ìÍ=}Uu´DñË1_o|Æ!^Pòq;ì¬4¬¿«¥¬óóph~u?ç2z÷ ]«±Èâs ÷r¯×=IïÓÞï¢â»ÃN¾Ø©µ=Mª8'ncñ¬ªàxÞRIu l$/G4óLTÞý%5fy¯f$l=M3Ö=JéØÒÀýûR*[ý!¹ýf¤Gõ9^ÒyóÆäÖÅÁ!ôV)òu`~/Õ­«6ÍC¼¢SÅX2æµ0ãå/¾=}ºä=@[òq;ªú;ÿhãsL¯ûxÚ2£³èg§¯âlR)ò^h±Á.t9»ÛËEÊáÍèY&ãR·c75ã3Îøò÷(ç0¸eé*µÐ_à·eIw)=Jõ±­}l§=@jÅ¢E:Êì=J;÷=KSf?OsQ,ÌÍÿÚæn1oÄÚ)Û<[çì×ClµÄÚ1Û<Î£4Û<nãÉ=}=}ñ=}ç2«ç2.ù(Ú@jSÛ¼.Ûù³º~àrðò:æRN%îg¯J¯Òfw@ö|ÜwzÆNòàê½6ºV%~ó#~»#-Úuó»³5$âçsÅf¨ïIôäÿ£µÒ#RÞqÂëå#PqÖ.$àB<¤yç=Kló5üÙ»fF¬=Hýî=M­=J$zg·/Öw/º±/n©¶áæ#=}-¤å°/­ÂÅÂ>ÕñÐä¸¾Ö=@òæ>BüTü÷ï.»üñ,ä¼ÖëiyäÎ%uÚýÿëqvþ xu±=Iu&àô=}Bó7OgÄøõ!=L¸_mx*ù§/û×Ó°ìTd$Ã·=}f);s¬{ýGç4ZFÜÓCP{H¾g¶à²3½<Ç§Þ7õQ¯·ºhL ²yÞqJGrÃ¯ÉÜ=K`)&´'««GMê)z<äSÅüÁtá.kÈ¯ÇîÂ*¶x:Ôò¡6ðì{ÏS2EG=bÃ=H¤A=J¹î¯6<©=jQQLPXàJS°¹(¤>õ¬áßH9&B#ÿ³Ó3·á'.(9;>ÿÁ5Å´/äµ@FG»òÃ®XúÁI¹ïòå½2½Ò¥ðtB9Èþ=}Þgq{q.=KI?Ã~µ®©=KWÌIDR·'=bn=Jûôo{~AØ0 ¨ç®Ã:ùö{KÛ](dÕ|íæu=M=Izê3Èu|ïá];ÄÛ¿(@;ÆÂÖÑHésyÆÀ3ûqW3Ëo÷·NFMO¡óJ²øe­)Í'0}@=I3/Æè=KõhªêËÊ÷Ô§QjÁ:=MâX¹þvOÛ±SìÂåÆ7Ô­0pñÕV¡{º{=}=HA=Lþ#©÷¤©c¸0Åä¬{ùÂþ=K<T9¢YOÕhaÙTOÕ~5©XD¼ðu¹á6zÊòÈã=bëºæ0,fñY=M`!Óû»«À;»=}ÛÇ!¾£ðâùOÙ=ÛO¥ÈÅP¨3%þ¿ã=bÝ=}?l;çá×kK±>BCäJÁåq5WTð'=M¡Ä¤>ð{öÈ²ì@ÖMõ]$R.«MºM<âµþ½õÁåÚ=JD°òÙD²X¿óLnd÷PdíkËCûÛ×Ía${,³[/f@ïü¥äØã[Êxbf±Yr=}ñ17føÉÊþñ©âÞ×¸¶BhCÑà19{£0yO¼­X)ê¢ÝÓò'=H)ªÅ)ãì§ <ñuËÐ)|§hyjúÙBÕH+ëÓQEØî£®tOÓÿhË0Å¦¼Yå8[½lÑrñv-Ú=äJÛr;RÆÂåâH9°¸Õ<=Ý¥YÞïIrÜeû46!úu}5TLÓ­=I/Ø~7ýX1Äñj÷Í·©Ãòê;¦Ç~ëuáBczjwMÿ«¡é6¼ÿqñýPÿê/v|Ä¶ÎÒv½HÆÊ8 MºÊ©'­05·Oh+-Ú1Â÷sËõ³ Æ[ÈÙ=LºÄ£ÍC}ßj!÷E}ÚætÕsr¬;x~p?ÃÅ=H=K8ü¦tWëØ.Û-Ç=H'?MÿÎ2Éò=MÇÜfcÕ3=Mù¦í6-JÏ4;úãÙÙÎöC¢=}ØJIX.^¤Æ+%ËBôÖà]viMYQæí9q$¤ýï«¤»àhË%ÁhÓÔ!é]ÖPø¾,d¶Kð2¶pÔ²®6ÎïO'Ô¦ Ó1L,º¼ìáõã.N4õ¯òI/mCA«=b=}¾Åîd·}'<çñáwåh¸©¦WÞ¸^)HÓ­ð>²l¿3ª¼Þè_^øµ4oÁ)+¨¤<u!=KëGú=K0VÝÐ´!÷j=Hv¢ïK=ML`qùy=JUNí¿À4@màOÐtZôkÅ/²ËuÚFdc¦U(?7Í7Ëý³L#¨36~÷o=LY|ÒñûMDÔ× Ò«Ô«wúÓ=¸Z Iò=.ÎÈÌºÅ0,Àìp]±É§Y{ørö·îN@XÓI×ñe*üØîÏ¢tWùZª[z÷bs<À¿yüº¾nRãxÀnõdÈ~96)#ehRLøö^rRX@üq7T=@Ä$uºK]=Kî<PT1ê@ðõ9õì¸éWÒÙ³n#Ò»Ì|É¤ëfÑ,bÀ¾[ò§Úp¡XÈºîìCC-°Eö8Àì=búÙtIÜólC[ÓIS¥& lyb|/ C1#wÉA=JNÕrîÔÐÙê_©=L¬ìÈE×Ósn<Ï9»uu¹Îý<íÏZ=Þ¦¤àõlQwé=KÝ¼*Y)î+O?'þ;§6EÓ£GAAëFF¥§¼QÔÿ§C-3.øA-½{ a}Mç[Ü¦@Ý°r¢&V/ÎÃqÒ°J-5W+3ÁWÝàQ¶Ö¹5øÜÇ²Xò±~ò8ÌØ=L®@×.~lDÜ]òí_CrïnlrMá_¹J_PE=HeØØZa'n=H/ÂvVîÊ;&=bLÇ>É0n#Ýÿ=oüêZy¾Ð¥Zº·ôtGÏ½o×ã-íveöè*1¾±«®îl>î.v¥¬2K+zÝû=Káù/j¡Ðõ×ÒãµÓY.¸ý®åKQt¿²=H¹{Ö­¬+þÖ·=KmgÊMû=KQ¸Ðd~âP|ølIå-e0^¾¾$w60u=Hé=úükxØ!X¹ë¤G¬É­ºËÎ¼´J³%S<u«èÏRët¤=J8ÃáS%Evì*qÚ¥ÁYîónýz¨ksªà;BçI:øz³éSîóBòµÞÒLÓÔuàI¼!À=I´?h!efq¼ åå½&ÈµdP¸õ_käÕ 0v¥ë¾,v|Óon5öèëP,÷6Ø±ÿæTc»}ÙFSFE~D=Iàó=MçÃþ{.DdIç?_=ILh¨ù×Ï#+©FyÉ;N^«QÓ¦aQO1èÛnZñ¶¦»X°ÌÕ@Æ¹F=Jq×ÂCÃô¬=MÔzù|.Â´¤Ia5óBkkÖeÓ~[?îS²`®#e«§Î+¿ùªwïà=L6.ot×<5?hwi«=}¦PèrMÔâO½¤ÿÎ­=HùlÏu<²¿_ìYÏ_oáÂz¥²n×ò`÷å²50NÐc3­ôº¦}YúU?mbÊìölB=òo=÷rq9]Up¿UJÙi¨­Ú£´Ú*ØÔcä_éØÙ]g}=M¹#U·Î3ýÙÖõ/B{Þ_:ïkþB[²È=}ü]ABGr=@4Qa4xaúCh>Se¶¾¯äköñÊë½ÌÞS27ÔMèÃ¹+ÂSgÃÌùÖùIªÇì«H¿QFð'*-»ò<üÈDrAäz½T×såøøFz=KeEt'Ï]qVhËö¢»ísÙ¢*ÜàI?Ë_j_ÎÏ=Jõ÷Ô¶ãfUOjYiÖJÝ·A$ìAFÁÝf5^?¹<ë,'ÆÝ®yvK×ú+÷Ì6¿°ßùõ°2=I´N¢­Ú.Ns=IRó¸VâÛ3HNCàÉ3Ï¬÷ðUWuÀ¶®Kiàû=Jâº=bJdSÔºÑ:ç½ÔÎÖn÷r*}Á}z±r_y¡çäìõ=KæÝKiáß}Èìs¸«¨¯Ë£1ÈSÀQE^k²Úô=}Þà¶#Âén¾ýð/àÜô¼Þå¯©=L4Gf¿¾Þe+Øõ!JZiÈuó}¤=MYUß§t+HC·Aô¿Ê¹:Äc^¯^]=bM£oYÕ<É·¦k!w1B´æG×S§½ÇÀ§¬=@´çç&mßY·Vt¨A&ôÌR/¦=MX)FÅjºUëSÐèúü¡®Óµý5jÜÜ 9êÒ±Ñôç«ó.úÆôÔ¬åe³¥°,÷7¼X@ßv=}{+Ãß$óëP¿2ð¢cõV¨qXNü¦jÁ=M=@ßô<ÂÌ:¼eèà:}X8W;Ü,L¼Ã«)¤SøäkTy=MàY?çÃz»u5=1ÐV<}À-U§´´jpBãm.Ýµ­G±ªÝ°A-Ð)âæ®=@jõ¼#ðësK°tDªQ4ï ÙY=}¤.{}±a«`~^·hÎ0®ZÞstÁÍZÏG0¤¥§?VNÒ6Y%O0Ùôì¯åZ2×«{Æ½_ÆæögÝïá¬ëb=b¡`=IÏð.²¤íä¥57&±V¢Ê<þ$ãëé¡=I$wòÜâÊÇÃ /ÍºB12ÁfÆ0üÂ­,®V­ÝU,²FIËÔÀ¥î&*Î1­{Ö/Õ;¯µpÛsº!«{zÊÁù|ûVDâÍ=H¶ºÔ=}=N {=Hê¯ETM=L¹ bÍÎá#á·Û8dèg}N­«ºÍ:`[uS¹Ý ÙõA>fè«ÔL´NÖJ:×+þ!+ºAq÷s=b,Hµ ±d;Îþª(>öO»p¼)Ñvp£4ÀÏ¼8+²½±]^ÖÏôflô#WpÊAjHÿÚ¡Â4ð§zåßrBQ=b=JA!áI®ÄÒùÙ²½ÄuV%»§@l3¹øX.æWfÚ,7A)5æW5 Ä»³f1¬´A=MoàO5=LêâÀoÇ:oÛd¢#¡JøÚ2{±°U=LXª¢h=Lê¿`û÷ÂØA=Hó|x(xDÅû¯?èWYøp'ï§áÍÝïÄãa£kÏq:1ã,U:®Á¸&Jº£-)eÁãä&Ù¦(ÇC=I:U:ÑÔÊßWc&h¦ñ÷ç)áX$ï¬¤¾ n5¤~ñXó^'Ça¸E,. xÙf$øafãÄèÅÔ1]BU¼GíèGhlü-²h³ìFèr³Z0=KGú¹9b=@¤-F3­äaÜA'ÄîÿÂ©ª®Í°àÿæå¼=LeÙ:nòÑèÉXV6¤Å»¹C&=@=@ßô<FwjG~ÀÇ÷{íWH@bD$ANo{@-27º¡çOôqÐû¿ï)½<ò(Å¢J°ïï79c7=bÁsÚ=KX=M(< ¶#de½ç·U5ëµÏËLq)¡_»R`«ÿÃI=LXéz~=IYî2ÈSÌNñV®¿mÛ°®!ûÉ·âÜ|=Iø»í$çàJÞ=bêÆë+ù¶lðsmÿ0¡Úº=Júså=è=I=@¤ÞI?·/(R)$S©clâ¹t>=I²XÞ¤=L1¨cÅçÂ«ü3z=H?¾(=@Äöâ4håQÆ[BþÁ:øL°ÉÏ7A7ÿÄ?7=LaÂ=K4=HµãtüÐJ÷Õ*[`®ae¶ZíöaSa ¿H=L:_?ÐU'ÅZX=L(Oó®Áël&ø¯òÑ=Kú=J¾å­;Ñl£M^:ñìÇþ2 P=}znz¥GÃlÛsz 7ÞÀ7AÃ35#nxk¶l¼ÁI f/Õ(UvÝTsù5Ã.±§ÁNJÊ &O+¾ï/P¨­å¶m{:?¿P!:CàDR&´0¬WCÄÀÃ@Øt»Ò=Ê¿bMlW³@µ@=K´ l<CÝÛæg?ßÒíúJ5=MÌê¼îßy:õkÁ07ö7ÜWA°ê,OçÒ¢d ÚäôÊ=ÀÓ_i=Iu÷}=j«=bjiÉì=J=L¦R3Æ)Æ~v'åsÅòæ±óÕºó#àôØé.cÎ ·Ýß_E-xÀáu=J=bÒîÃHö=H½YvuðºmÒü+äNgLø6=HÁ«úË«3TbºØåiµËÍ¬µ?@g·~ñxØ'c8Íö)q.ÍÁK­xúÄËd®+¥<=­SÕ=b=LëÈÏÄIHE=S¾L%J¶±W°qên®qHX@=_?ýÄEK3¬=b=IjnK¼Ô¡T ù­»G þdÚ±{ô=Láw¾R?Öw=MÓ{E_áð°å(ê4dè6=L@µ/²tÅâÛ»Ð´'ZÃcTëi¥ì?7YYTæ-=K»eøR¼ô ÜÏKÞÞ=b).Õ.ö<DA³~{pOÜ+ÀÃSÛÐ¯Ì?=MF=HT,Dÿ=@·Ç£´ïó¹ºxª~ÙZÅ$þzU°£äÛ¼¯Ol!ÿé¡3¤W'Zs­|Øõûq-v¥ïÐ¡GtàGõ² k-bíã¸ÉZé¯ã Ï¹V=MÚª}Ä=JóÕùá+¡F|@v9=@îi!I1Ø{ö±!ÈA¤±þE³y|Ù!¼Y)=@°.ð¦ålè=Mß©ÙúÑLäsØ­.ßL³já=bPøõín½ËË¤àÐÚª'ZqÎ½i àºc8«Xfjh`Ço-¿4Lg=JÄýc=H<=}·ó¥Y'ÈÇ-5uØ)=KG WóB]zåÍx¦ uã­=HçÈâ¹h¹Ü=}º<xîz=×'Á7.åù0%ðÆ.ßËùuðêB#5ãÛ=I$2b¯QÁ5^5ÐK¬QäI©7ÏvApìÂ¾¦÷87åtDw¨Ø*üCÆ<}W¶á+RÇSâ»d?ÆM·;9sï_Sý=H¨d÷¸°ça°êâ^ËênZ9=HN£'²(ôÔUPÌNü°GãHã´ãñw6(çhàv¼SÈ)|¿/óæ=bÇ(ì(£Ø¥=Ii#;ìÿY4Øvx­W#õZÔa=KuÌJq&RH¤·¬oò&ðT4¥ÕY*=}PxJ´í]ø²ä`9ÿ ¯¯{©È´¨~AßKúV×D¸1#=HfõQlº2ÌùO¬ÿ#þõAÕ=böÂjÝÿ¤ã(sF_áõ&Àíï-U_W'¨s²{;µn¡b¡ºýÚMõ¥Áû¤nüÉ²Ãk¡¥ïPÇ³@3þÆiüîø`/Z½l±½=Kð­«Ô¦½Î#­tó2ñºhs[¼ðÖ[±á3¬òo=I£cr³=@¯}.Kþ~ùÊá~£r»Kj±} EÞÀZ@µ,OØì^§ðk0gµFa=M!!y,RYa{ùf¥u Ò=Mzþ+y»-µíìË=H=I¡Ìi­Bp)û·ó+jv·­lK¥¿¹ìU¤=}4h¸_R<ðÐu[¹öÚukr;ç=IR ³¾ÃTz5}Â2X«j/À7Û¾ ñ£5ÓÝ$ÔmpùîúÏ5wßÍ.w¡×râÜu¯·æjÍÜ¹i=@ÂD³Ur7Ó,otÃÑ#Æ¨ÙT5½ÐÇ¯Ê|¦> 9ÈãóIò 1ùî:®U¼(áî÷èÔñËÙ0^2ÎOºEº­zÐ!Yuè¤ÔÔNÉâs!þãsE,'=Hì7Õ6<íü,ºaRÑ´y÷³Üiè=bi'çÇ£å^ÔªÁ­éíßdýM­»Î=M=K²eºÿðJv£p2Á%©g=Hú²þ'=%J:'j@=@t¿óÅÏÎ-=}øSçÜ1±U~|Nò>­gdW¸×=Ia+_+OòHgÁ},ædóÐ÷<Æú~'$q÷¾ø/¦¬ßq½¾m=M:GßKº`ÐÀ]øól¯v1î¥íÑ¸ìýú½BõÉã}Øö=M1B ND=@Ugà>VÕF3=MKÍâX©â±¬±,àº!=@Ç¬²@4KÅ=}1C=J¤´%t¿¦0±W¯!ä¨D²óVÃì<V­=@ð©ÍÐ3°©þ1Öÿ­³£¨·s=IM±ÓÊ«ëQiëÁÖhÏòs S8 Î²Ó¶ð>AÞÒõê´h'µØÛiÏÝ÷×3¹ï.ÖTÅß0[ ¿åß¨ºoQ*CØkÄÂc¤«0ª-)p[4*lú$}-þÎgÃÞ|¬u?,ãÝÞº=bla§¢èàX·¸þðuO³¶òß+ìchKO¡Uø¡ûmcÌ Äñ¾uÔ|ÓÚM¶=INââu<^]±­ú ZÐÌqs¿f¥ò4±ña­Ø£ulPàûñ(ê.Ì=JCJ(Wm,Ù$=/hBûXEÞÃÝÈ]ª~Â?fØpC=H&ùÓzá`oh=´ a®Kíj¦6så4qOú¢6ÙÝ)½¯º­­¥²6;¸Nì.üR-U¦u§mþþômy=K¨äBr[Q5Ù´=¤Ù°n2cütÓ½è´jCYGKðËÝUklr=H¯nð,¿i@pÜÅ¹=Lù=@ÐfÙX!_)=@2¹|ÿ·7Þù¢¼=LêÝVéÒöï!ð¢Y´^«×Ô¬¹Ô:Â0ÓÒ-Þ=Þd.|Ê=LYtÒØáû`º#Æò=LscwÛÛ¾dt÷(À5,p^¹¸lT·UºõÒ¦Ýh´«úuÿ|jö¢©ÒyrÁM=b<1gÈ Ók{kÝ«çËÔôZ=I3=KaÌú4^5f°ió/Ø[k=}ñ·ùê=¦mÍÕ¾Ód[ÑÀêjÞèÒ;=Lx!ø¨U=Ll[ð1~Çd¦»5ãòk3Ó9ÚLPCö(_ÝÖn÷ÌÊ¹ùnq=L£ÛÌî^¼ALû{7__9µ.HLïBì¤­óx¨£¸Òç£û5Ýîå=@µzµæâgEÑÐeñî=LUhnz*üÔ4ì?1Û®Þu~³msÊ@==@»Úuój~Ñèçg}ã=M­H¡l×õ%êQø:!eB½hÐéJ¬öÀåÆV®ÖDHzºdBbOî=CBÀõ¢i:þ_¹zè«wÏ?Ä#8­àÎ=HA¦¶¹>ü}ö^'uCQ0Y£Ø#ýmaÕ­ËÕ½¬²;W+5fÈ§=Iþ¤Ì¦Q_=Iq¾ì4ìT& .<Ù=IiËÁÔÖ¼^Ëì¬=@N¹L^0rÒh32eráºÄó½~HW¦º=J¦o¿×]d!ùz#ï`Ê¬Lcäa>9ë_=IÑ %±úë*v5F/­>¢Õ2=slß=eÙßGx+=@P8°ÊØE#|÷UYa=K·=MÙ=ßñXUc}¾c{,¤®É}]á2÷Zø¡ê÷±Fî#Ô®5ðü½µ£ªa»öÔ=@úýâ½Lößì`ê~O ²ï¶B=HÆ^ëA¿¥ðËÂt1,$¿6¸s8PÇ7/é1Î'(kn.W¤{rK|¡Í^1¥ôuØ£¨Ç-ø4ê&B³ãÍ=J<p=J.¦ñ»@%+-å¼B-3¬ÉÎ­ÐØÐÝ-â2£ßÑÇ#´º?pÞ6Y¬Á7ÉÔ÷|$ ß!uòOóPæI6Iýn4ôñ$5Ó¡ô¶-îZ}?¾á8Å8Ö?Z9ÒªÝVÐcÖS¤eÈ+ðµéØÏøÀÌ=HãùUg=}Ö=H¹U=Le~GÁ] xrsÁ]ïÿ½ÀgçÙ]d«»}=K7ðØô­¶Ý=Ê®vº­ÆÀnyÖ[#°-=b¶eß÷Þ¦Ñ~½+ªËCÏØ×ò]r®%ks³;ôfüöÓº¸D!=Ãµ>TÅÇ&TV*J¯¾«á¦oÅ=Kõd ¡ùôäz«Ü¾ÿ{¿Ö4+é(WîÄ* Ã´sLÑ¬ÒÈdðT,Il¬ËÇk1ÕàÅÏ×1P'ôsÄ:L¤½<ø£Ý­¬ÿüSKP4Õfú¥=}ø&`Å=L{Ú«í­¿µXE±C+~ÞvÇ`S÷Ðózhý?äÑwÊÿºáþ¼ºMÌÍÚ=bêâFÒ$¹ô$Ï÷Ê_`?ó21ó>i2hÆ>æ7ÙU'p,Fy3kpSô1ÙªË_è1ôÍîSòòáyo¿²ä<k××0°}gëëZ®À$«ªêÛçÛ©®ÝòÀd1¤ïÃëìÌRX¯ÄÿÓXECkMüeuÈÂCmÕz&rlUµ9+:1Ëºo¿û,½àÐòõÁzö$÷¬ ´'²ªâ[ýhÅ|]$éðÝÃ4¥F5'Ñ³>ùÊäÒ';G%ï2:²sÄäßáaL1¹Ð#m¯óu~9iLÐ¼%Æ£~=KðSz(Í*^gyáVoÃS=H­=LÏ¢Ïz,N`Ä·V9åGD1Ë<Õ7Õ<õÜC0=-ý¼¨ÚòN=EÀ©å-E·ó³ùæé+¼ù)Å^Ô(oç5äW¦ßkLg?F è¬PÅ]Á&tÚèCÀêÐç¤úsø¹}³À{Î­_6ijáe¥m£=Mèì}¡®uëóþÛ7.©LävÅY9ï~oxÃëTâ«q7ÑPIôgÜa9è÷9¢$|±+TÞQûðTbã=$Âj¾1<ZüóÂhf°BGíB$ô¾OøþzøÇ»=Iú<§ÕëÓ:²<n¤¦ï>X4ýk.¨=IfM%o¢´Ü)ÒI@î»N_Ëx¿^%.å;þ®ãJ2=M ¡Y·PbKîév=HÁn«×z®.xo;ïì.8 ú8·ÀÒStSÛôFÐÔ2YjKYOTÛÊü°4½¬Ì648½D·$©BS{ÀkaÞ¥ð(Å³45u=îíËï?»V§æ·vD¹2'ìAAhóÒUX¾cMÍ-ôkM1-T¬]4´ýÓI  =@µÛÍ¤>`=} ê_ÝßC¦ÂÕÈâìÏ°ËÌoÆõòBnßòÔÛ£FÔ¦Ç¦Y~Ò¤)#ÄWYXË> A´<Ú;ê¶ví$|wMÃ¬±Ô³è=MÈÀø¢&ÎwÞõú<úýËÝÍ2kSdö<Ú=J>wVrí/R=M´]ã`jüà¬ åLòÙ½=M*ºã¼x÷[Ý mÌ[|hkÃFH¼jù4r&neÒìL!hGüÉµòáe}Ö¬V×Ý¸>fsÏée)#´=Hµ<ô«V/ò%<ò­®Î+'K>í&­R¡vÂúFðÖQGÅF.?=b¸­ö{CÆ£1¦Û$ü§î©í¿½×Y¯ÖiïIV¬=f±³×½Þ=H|Y>XwÃe¨ØrJI,õkcbð=M4E§Ý_å:«5iB=Jc¹>Ãõ[ÐoN/öe,ý|t'@VÜx4)Öðuk~ÝúÈnTq¼¶g#¸í>Wä¦6)6ì[â¦Êñ$´?ÆÖ´b%3Ü6=bcâÚ½ÿ&tÁN?1½`ÓcÎãÚÊÿþ.ý;Dðuï¥ÿ×°¢iÁu×_8u5Èÿ;8ù>bI¨ô´ÙâZ=LI,Äm5sUúu,¬9¹&Ú=JÈ#=I½=IgñÈ?¹}<6áVw{ÿ1bÙms`¼çÃá8D=MÐ#-pÈôËËPí*G¢Óí}QnÞ8©½Ããvç§bî=LË((NpÔe©ÉJÅ7+âàÒJØ¸ÂÛ§ÎiJÔ¨P[eÿÐ;ÎÁ/]A8)¤ænZÀy$~(ÖB¿vôË´÷Ø½n8+5ýKèòdA®å} _$î_q=}ÂQ=Iÿ]¯-¼,}EF#¾llÉ=IY,ÆYJp5=}»p¸441d§ÔKáøtÀ¡Æ#:ÛcÝPo3«ëÍõÁº·ª<ê=}ýóÒp×üÙ+9GE´ö±X¤_òLàñ¼ô5!_pì¯ÂÚõo9²QTZ³ûeÐâl¿;C;à$Éä?ÍKp/ñ±Ï÷-çc=@(90gÛ,YÖ[&6J=bÏÊ<º|0<.Ü¬«ÔÁX%$ì*L¸OÉ%9uâueg¨¿¯7,ÍËB:Ç'&üUñÐ´+=Iæå³üT¤ñ%Ïæ*©>(ót¤HA'H*1tÄ¯yèÑ4û@Á/ö1â°9ÌÞÅ=H¶{¤Êê´ÍÞë=@?±=L*FÐ×BGE=H7)8·DFÇAå¸äÇí»AÈÂ¦1ûÇ=H¢=bu¤úòXJn¡j¥æìêó=K¦ÝñN`65²¸ðbqvÚ]²=b©2ÈñÃÕÝp¸õjÑcz5Ç°ÉGAéú¤èíj1ÝûPØ<ÙAt4|rÓm0¼ã¸e,î>Ý[áÚ·*ý·Kß9J©31 ÉÇ´´=J³%&ÈÊsG/é3å×fÿùm¤$ñÑÈo@ü|õ{-kÄ½¹Hzx{¾=Iõ©Ã£¿ù±×·B¯[v§_Ea=}«ÊTf«NhÍT9£Äê¢Þ¥=HØ)¬@»ä'Y¼=H(oî2/¶ýÏÄà3ë[¢=LÊJYßKxxwMî AÂäÿd ðµEød8ÄQÖ×7Æ]-âb±Äó~ûTý¸åÌì-Ê>=K½aÐÅµ%xn3ú¹é¢Û}ÀD«=MZý7«Û2=MÝâo*äBÁúB¶,iï¿cúùõ¥=@/wv¥mÂ¤/ùh2õ8D8&ç¬%k!'[G+÷&»=I7ÐÃ{BA%·K=I7ÁÆñ3tµe} µ;#;ûÇ)mÚå/?Ä>¾´×@Sò/ó&Í,·%5òÇ¦ÎïH53¶gÂoÍhÙôm®sA~?Ð3Í¿èm£]TðX=LÿÂCwYLÊ¯8IØO(ôèì;¯lÏ¼1 ùÇùY¸3âhqÒ£5cÖÑfm)LÆÍVÝ=MnØl¡ëü&Cp«Ð*Swié6¹ÔlÇLJT`JÖäô[Ñ=H*ÎVCq¨á»u'ÉeÖ[=Jù¬«ÃÜªj¦½¨=J(=èJÇO¨=MÞ8)VúTÑYÖj¬é|Â¬=M%ãªit irË¥ZÝÃ1Y%aëæ¦ºI_ò> À=@=Iå|$dr=Mu¥¢çÈnfu=b}ÚøX­óKaª§Âî#PßNYZ¦$N:©°áÙp#8zï¤ÛK¹î.#ìhú»fñDàÁº^²³X)b>ºÚò}Ô=b@W¬r=beè´þ$4úÂ¨².tók£ ÂÉb¸=t¦éJûd=byÀúú0f>ø¦O+ü|y×±ÃêÎ6qíøaPï=LlÐå~BdO6Æ¹Ï¬b£jýR,¥â¾pû¤ã®(Pæ¡$=KtJ(=H¥K*õ¼_¦ÿþ´ã{ûNm¸2`óUíëé30ýNBvaºe2O´ÔÆî>ù³Þõ­©æiÿAZûþïï=b¿,5Ù[Ö=H÷Uõ4~j=M!_ñóÇ=Lq^ë¸!ÿik¯×n·=HÇÚ8@Ì×ÉnÜ,l¹=Lb=K)ÿMÕ¡:];nÍ=K¶qz =J²r°w+ëwR=bÈDøJu¨iS6çý>k®×ÈõAÇUJ?h«ïL=J4¦-Ñàn=Msk{¸Ø=b0g!`'giO*!¡ÞäÔm¯Ü¨Io¯dØ0tþ*ë%4L=IzÌK*üéæØR,Ü@»>ZåÛ`1BÆºrÖÛDxh·ðFÑDA =M¹£Ê¹Ã´e:ÈHÉAÿx=JêmS=@²«*½¦G6wOî.=Jd;²#9_É[eE¾FYÜÅîÂUz@Ó¼mrÍËE9àñ¸2¶Ù¡QñhÉ¥QHVÆµ5G&rÁÒ¾¹ÿç*¦[=àSãº£½ÃòÁé±ªBûyï½-ßÊb¯¨-Ä¸ÿ`=Lòç|«õ»ÄZ¬/Áïññ.öBÛ¡Ev=HyòÍõOæÂ||'¨Èb}D¨÷úB}*Ñ÷î=H.0uçââÎ9«D0á¨ô`lÕ]÷®Hc`_àÌ¦¯þÙ¢ûÜ((Ózî;Ôuj¤îZ°/êSws£±¥¨m¼}pÝà¨|xücî{}|m«)<íÉ=HûrÖó%®Ýg¨N[ûO-í¢±°¥Úÿ%+maxöå:kµN®Mú&=M0XÚ`FÒr=HÓã¥'[k@^p|hÅnSx Æ¬ÞÀ~3Û&Å®*=JÏ=}Ö}. =J{ þí1t=bµJ¿æöm®À-w¦=@Óoù>=@N8ÇGÁVÇ@ÔÄC«=L~©e«©Èé®,ÔYv¦{hØ~Ðol¨¥ëùv#=L`=bF*²ûdìn~WÈÃ5=Hd=Ko´V+}ªn­ìî=}ö°á{NÓ;=M´IðzÀï¼ôN=IÒèå_o2Qs£*À=Il~óaA7ÌX.=}'Fº¨ä3f9ì´ÏYX=9ò{Ë¥ägIg^ÖcÒméYA¢ã(M7Ê8RR¦Ä¤cÕA4§±QåÖÔbvêÃ¦É=bkçè¡Cv«{uÛçé3®1XaKÍ:aèø­x·T7 ÄvøqÈLÎXe*óÁ# _Y}îEºå`S³À¶Þ¿»Þ¿n²G£&Qbù£Êñä¡&¹õ-å=H£&=If©ô«4=M¾é: &in®ÁÏ´¹7 ÍßúO®0s=bM¬3.«('àÜb|ô=g]Î;ÌT¡ºÔY¡£UãÌ°£îå±zÏ×¹ñ´Ô*ñÝjB!X±ªÐ¼n4Q¡îØ=Knlîa=ªné®*=Iö=I=Ik8°8PL×¦Ê(80íP6¸¯L×¸Z=¯L¿¸¾¹Q»Y=I«k=@5ÐáYã¡öé'ÎEPmtÆµ3÷qAâ¬g&Y1ÀóBZïÀXÇï;ù6Ó1,YrëEÙb)á»øbBx~¯8¿­îx=}UÔQ8Ö¥çÈs«bÃC~rÌ¼YpG7ù»/C×#ÂÇ{wÂü§e)DÞÖáÌ¥=b2ô6·ÁEÏÿ2~ú:Í'µÅs8E®+ëzüá^~ÊcF¯dåÆ£¤tãÝçq^Ý~=M-bÊ ÜAÁ?=}µ¸û×äIÇ#98~_ìMºý6E=Ly[g#Í'ûÌ!t¾ò=MïUÍ=JàZ¸tBÊ¢ê$ÙMa¦Ø]EìzQ%|S=@ Üõ¬Þ¾ø×úVÛð6^2.ÒM®Ptøùzt«aH;MÖsÃÇ¸)V©?u?n3Áº>a=H9=b¾4'*«qÚíCüQä¬âÚ´úânÚÄ(TQîàyUÚsI-ÀÙÇ½ÏÓÂAropÌÞ'OpÄ V.=MÇ]þ!¡ÐÇ¹mO'áCéµíC*¾DÆþ³Ô ×tÙ´¾/{ÇU¹pÍüÔ¤ì=}îÝÁkoö=¸ÄÔlqcO$QÓ_5SiÝéööÏAçv=};f%å=M¡^!1q=I_Tùr|ëþM¤üQÏ_© 8&Ðr])@ïPneäÃâ#a{'!ÅQsö{ÈòL9¬{¼øJµhÔº¶34°Ùq´Vâs©ï®ÿ0ýÑÝûh´þ ¦^ªë²[©Ù=MJ¶ç=M®¶0dHØ§××H»Ý=I<Ù=Kî4Â=bªü=f>4ÞYõHý-=}QÃð$­ÑÒ²/¸=M=JViS tV³â¥Ð )=ïø¬cÎ5ÎY=~ËYË!MÄ¾Ñ©BÆ=K/>^Ó¥u®c*À{øáv¶/öiq}â¿#ø=K«Ñ5¼¸IÝS#ò>qò2JW0´ÃwpVM(p&h·¥ðÌ§EòìûSð¾³5aé}!¬79W­×ëÔ~çäXþÉÆ£ÎwÙ%=bîig,¶VÞ¬7õV,¹üÒa=}_=bÎuSÄ$8IL¬H?ÏÙm¡¨=@¼±Üöl/×«5v:=@2ìÝ{=IO,e1;³Kê²Í2èlD>ýj9íèàÁK¤Vù«=ÖÜ´a¯§nQ·^wyÀ7Ö=H5üDTpÝò=Mcl-=HV©¯ª?M¼×¤ÿkßPÆ¡v#ÙúQÞý_ví4Rn,÷_¾õd¬Ó°=KÔ|;I{¯Ój°YÍ£ªÓ°=bmþÐ-; äôÔ÷â='j;9C9=J¢Óº,zº0£ÖÔ!hÕøé~RÑÆý)ÒTãÞSîÕ^é=IâävµI³,=K£Ãl}=M9®ÝUÄh¾ÏL#sYçÇq`uF-Ö=HcÙAÕD®#¿©EurÚÂ×ø]ÖÐøù?^âCs=SÇÃ[sSþbËúNêdYû_µ©flÀÈ¢9ã<¢fY#jÚØÕX:ùÅm.waVµKt2`ûUx¬K=Hæ¡Úé}§ªqþ±sÞ£´ÌóÜ-Ðºt=K?£0}5ÞãÎ²Â'rªûf´_=J_¬±£Û³ñº¨Ä==I¡}öÉ)¸äÃ=J=}püNõ½ ])öÜø1ÔO%þIþÅ»ZÂ?ahc7SURc~á¦¶ÛÃÄ¿%³ø£=b¥Q`ÈêäÞ=Ì×4½+MZe·k°ß%mC,h|õ4Ý£4ú0$úkmCwí/æSû¦íÊÙê©¾=Kqº=KÖ¤kªù¯û_g0Î6©0PÑW½(ªnNêàå|¬lNöba×jÉX¾waøÔóõTÛMYªÙ%f1H!XuLjkeB0´¡±¬ôÙgæ½O¸M¼.çÔ­ÑxmÅ8¾µûËX{ k$OAòhÜzÙ 9¹ïësk%0Ò¡¾D©çO÷=bcòñr=MÁó±xñZæ·_¹Ñð.,´_W=Mö­fÁ#Qém6Ô'-Èkö¼rqÉ1¾åå©÷!fzÊ1.L¸4E3¾áB=K ÿxVá6&û¾ÅÊ!ëË¾ûÿÂEë´$ÓôüÜ{¯Þ.yii=I¾!ãqþ?´vò<(§_²çöh|m42=MÇbÁ¸×käQî¤,àzá¢¿Geê=}Öm=@p~°ÛD$ÚR2p¸êCý/´¾dñ=@mÄ4ñ¯õô.°:)S½|:8ÌÝåµM¾X-çaL)+Z¬Ú ÆöOWªó»)%^í¾û?Må=L¢=bBíÒ `²×ï~´5s¤ÞØè¶FÐ=H^)¨×£Ëü,f¦=IuIÈã9@{*Òó½¹^ø®ÂdÞGfr­²ûúöFgèBvÖÏpÉúY~®0Ýe=MåÂ=b=JûÞä§CX*1XÂ=HapÀQî=}(}í»W=JÉ]Xüh«Hð×® #ÂQýéÁ¥i¶MÑrL%dLþ=MçÕD¡Új~`f±×Ù:wPàÖnj­s:ëÌ5]f4 æ;~üª[0gÌÐÀN¹úàâã1¼d¤«àïàÐåªzUyà¨fÑo=@¼¢ùädCpéaZO:«q!UN µLÇ¦²ä<VàB/¢û=HXÃï©&õTêÖ á}R&Ô¾~¶=LÄþÔãí»Ô=}õkæèÍ¯§C/EQüÇÂ×ÿjä0z£.èýÄZí³â*=HômlDª=b©emÏbBQåosü¡Òj§,+BV>òi_jùô9}ÔíSZkùôÄé¢. ^r=MÍòxS+ã®TíOê-Jõ°a6|²hvÍô#,úðy_sûô/úçÓ­yÛrì¯µïõZs®»¡÷-ufÂU_=b*ØÏn¯j2RW4õL¶2/ uOé4Ó¡ªI>0D7Ù­ö°á¼ò¡=@ûÂZ}øj'¼¯Ó çwªµÐÝ!júªYqd^YzÛ?Ò.äáwÙ£©ÝÍôx.jàïIÀùlþÙØfdKò²DáAû'ÇçFvQ#ÝMm´l%®#ë³£Ê=bý(Ì=M_sÂ=L¾=}*=K½ñÂ_®ËEhêÛÙ-[¤*N¼zY/L1!þá'ôê¦VåÄêSzÅz*S´i¥ÂÛSªÛ$Ô&<Ý¢=}j.[yg!ãÓ.Ú°þµvñ®ç¤0¼¯».»/»1¥Üç1.åmãm·»)­ÁýÏ+2*Q¶TÚÅJaøa¶=Mßõ9Ù?¡mÝgûp¶©zÿáç'¦®^ÄMM!è]ûñðÑC4=K ¦Lç©EKG=}ñ³¾àaÆ¾ 1eÉ»ÂêF=Æ¾N¾ø'<Ä´kØ¢ì NÑYßËhßd¹·AÀ^¥LU¢_üª§=LÍD1=K9=bò¾`Òmú/Ú=KµðÔÕ=}{ä}ý%(ò°¾ÿ9IÙ|w²iFTÏ¬ÖÛ`u9¡û²=Hí1ëµ=Lï®×zÁã }n<øÞûvÊñþFUã¶7A(Q18Y¸ß1=MBR½U!Å¡±óÊèdÑs¿!µ7LK¥Ð¯Þ49+1=HÔÿºXµÞtëÍQç®;DEnÊÀûÆ¼ÑÇu«ÔåIÿçGÀBA#§þþ©ÅÀéù¥U=H0V/Ð¶ÛQ=JdzI5Í«=by<´ñ2 Uî3¢+>pp#0!<(¯CZgBUD~°·Éþ²w+`Ôl¦è*Y7Fêg¨Ë°Ôà4LëÃ¾Äì9F=b®éñz¦úTÊ[Cñ=blxCó==@=Mv¡/ÂÈg7k9æq#±ÀõÉ&=I'DEeEÔ¯½§+É!ï¢çqf^sIç{êØÁ¯ñÚ¼.AôàWa £1lÝ×ÀGÏ=Meã=MOeÙtzó2SÖ(÷N=}¬=}­Z®Èr=JTÉõ.µcï>Öòâ¨t%¼lØFäXãóg(Õ=}+yÌ¶º¡#i*Ëã=JçÛë5Â)º=K³%FóÓñ*}=M6ªUPjÍTñ~8×4-µ}rVõn­ð ´øäoÕ­¿Ý ÆÅî[7éÑ,Q/kÏÿ(g4ÕÕù,[=Fy¾=HF&OBæÍèûCÿÇÝ1ã*Y³[ýxñyú­µÒêÕÄ]»¢)Å{væ(pü²Nj)=IòÀCß,{´(&âW%gÐÖ¢È¯=K»>=JàÞcÊ»-ú±4üÆgÀâ¼°{Vc_BùtkÓ%MÒ×ûlµêÖ:=a]_{ ´¢ÿ6³oÀÄ §ñFÚarßé¹I¿¨<Õ-o?!ÕÍIröã2cN½¿e¯¬×b¦døLEÓ>0FÜ¼Ç­u-J%/Õ ô²­ªõÔ²Êp-þ=M2Ôw¼ÄtÍ[¯0-±<º[%çwëßâ0ªb%ã?tÝ%=}?ÄFb~rF,ÏÇ7#=K¹ýcS/bw´×#³³ùîî«ÝÕú2w(¡wå5ëÀ­¿ñïY'£õ=Kp§`sïN¢rÅÄ'¦B=M¶téIl#÷ÚYõiû'¸°4ó¿õxÔª=}Èb6=¡ Ñ9¦.úv£!ôãöUòúêk-jå-be¤ïû>0´Ü¼­s-JåíºÛV'u=@!/04s«OÐ)zì»ÃaHÕDWaÀwL=bI¤·°H×þØ½rm.on¢ï·xãN[~Ä=;YwVTbnbyx|$xÑbÑ.o®¸_=IùM¿#lÍU#Ìû´«Ê¯¹ÓµÚU[ÿ¾£'ÌÚ«ÿeë%¶Çá=L´MËõKòÿ=Kµ)ÞZ{ûªçk}>ÂS±Oâ%5e&ìØ­aìÿUì=Hj^¯Xõw|KÎå­àâþÏ¾¸¶Òè=}uÿ´â±!3ùYß_¦@?Xû¶.CØ{^òðÁØ;²¹õt=J²qÿ·~8æ¹Q¿&ÊvÅdÁi¯rE#|Ñ&=MÞÖÕ$©Ê{;·Ng¤íý¡¾=Lg=¹ãÚß³îÞÕ°.Â=K=ìòY±%ÿU¬=bÜ8@ÚùQ=Iè!%ù4µ¥O5:gvcí£ÛcäãuoK3=J}àýRöS=}]Î8(2(«½bñXj=I¬ý&I|G5Û¯à3=Lï«Ç}'ò/R¢Ì OÆñ»²×~=K5BoGñ»ªXò0gDoÇr^@%ð=@ÝÔI&Ë¹ÉÚ¹öÎ4Z z®æ.­=L=Ka0/uÇ@É *ÚÅ=ìÂ_iÝ#×>µøÿÁå=L9õ©î9UÇý´ñÓy£h­®ðîeÞ?ÏáÁÿÚ»úAÿÏ×[y'0MÓæò?þ/[T=buvû÷U.eÀ<à(¥ö|#fûÜÐÇàÅì=Mq{¡wª÷ö/¨¿T<ðCdÄ=HßiæF¼'ùÍzÎÜòjôûþ±æûàÐL³ùõGÿF¬Ã¤/zàx!841p»õ;?1çqÏ3Ïð¦°nàÑ]Eêø¶MNCo/ÔùB~±J¯~²Z»³á¥5n8+sk}å!üsåå_e DµÒ´øý|Í_§dT5±j-üà·¼¾QQ¨G?ÞçvrOLDN=}5ºï}g=MIiðQ4AÏn¤è)TõNIÜÑ°Úzî«NVbÎµcNðñ¢÷òo§²°ìFØ¡=Mf¯=bµÑ´XyöSÍõÉê`²á|ÂMÍ=}WydX¥Wk^é¦*2ò!¯Þù0¢N4âÉìp=L¢O<S(jÃjBnÒOìÐ E@cÁø9=M¸Ù=I)ú=KmN?ì=J=}wUßa$«DqvU{øÇ=KçÝË=}U4dÇ~vUþ¨¨ç=Iç¥ßNsT´ãº±ømKCF4| ÒÉÅjÇö| âÉÅtÇV¤b´=K=H&çßN#zøÏA»@¨T4=}Dº±øN>²F$Æ±xyøDC¨][*Ç6MÛb |{Aª¨$Pò özüÊ2°³¶íz¬êäêü³Lg³A­=}ÔÏ§¦ÀE3_÷ÆÁ%*3^§¦ÿ=@?-½Ó§¦ÿ=@E-½Ókw÷£dFð%jÿ¶9Çá¡=@[´KÑç =Þ±¸q P=LD~ZÚ×°Ñæ)ë®MÙaÄ6ß,è¤á*_KNØ¥ZhyÈFmIzKpvQ{ÈÝJ<U¨+ÚHSNø3ÚHÝZ¦LØB~Üæ¦dQ îÄYÀ·~K=@CÚHÙI$ÆÈ=LHÖ¤Zh{È=KßL0a=HéJ<U(=HmI^T(òJÀú5ÃYï_9¼òå¦âï«:¼$À=M~üû6IµrØ#ñÌ±ô¡øâäçôí¡£â-¨;Gíx w©Å¢yÝì=J¸è{´ãim¼ÎôH®vîâ°3gñ!Ä,oÿ¶ÀTCÈÔGgSb9·Ë èjµÍ=H1|<ÿ)|'ÇA~U&7~ÕÜðÙorTàFSZÖºº°Ø+ï^å¥*+77UHUªç½);fÎjRC'9S·rájìfñì¯«á¸Îa$`Úµ=}ÍËÐ ó&=Hô=bcÑ5·¬¿Å>xÁ*ïïÞÂÎr¥¤.ø±ëûxµýKëÜ«fÕ¼=}ôÐ/[v¦0ÖDd;ãUØ¢·J·~=}®8>î&fÅ;Þå8`·=b ãeâü¡Ö@¡gàúØí|4ò;|¦Âímn=}iÅå,hIgãÇ×#Æô½gñ£x§`q=M=äfÝ¼áiïwÛüö&(#o¼æ@o4ízÆ<tFÕL|ªÉÊça¦&+¹=J¯EÙ[qÃk1H ¯¨X+ÇOF¯äßPKºù}·=b#En/þÊðÔ®w½=@«®÷÷ò1=L»r=L8Ðå²½ý[½ýþ¾=b¾Â7+Ûl7Ã*08»ÖN×eU/3oFb[Üq¥²¯íÚ~×G3ë17ÛFÓÌ²Íúqº¡ÌW5¦Í'æÖºwáÀÚ¯¾­ð¢Áû¼ÊoÿMàÛ£²¦|!·SôTCådk½AA0Q&á8ÚÂN²ùâaÚþ±`ÉË &è¿»ÂÉýòº5ÍeGõ$}?=}Hê}dN=¬´c-§9cw¨¥C§GCS=@cÚ¶õ±|<$,ÅÊt¹7É@Ã/3ñæõGDÏÛ+Kÿm©¼À6Í«Q¹[ÞÂ÷ÌÛ·qS¿RRïoyÔå:LÐK1 Ú=L5ù×ãfCø_}ÏüâmUHÆD+=^¡$¡'ÑJÁÃy*Ø{QJ,åÂZ=Êª¹tÙãÛWúÛhªðoÂZ<¦qëê¢RâÚ®¡=Ì<£ÿçÉ=ICïUßùâéÇýXÇø<´Ìü=LI§QCaÉÂ6VÖNççÆôb°c®×e­ÅÎïO=vË5ª4ÓÒ,EÅ^yvâqÚÔZ³ÙISå^¡iQNÄ~:Ê?ê+GÓíþí,_]['Òá»ke÷æD¶øm=MrcN{üêáñ¯ìLlÜëaFßtþ;á×gÝÞ#Ü,6ÙµÚm0èn3ÆxP*¤W×ãûë!Ó8±CY£ÊåçzÁ#¿D·ØûÌÈmÌ{e§¯öÌ8=Mm,§/Ê Wi]¥pZÜKQ{v¼wºõQ°ä¦eæ|DªïóÖ~âë^ïG0ci6YÏnå%=@À3Ù5auøÐ{ÿÇ4óp=}=bjñ®§?;××ü»<î=@ûÉ(^ûY=JZ0¸ÈIË7¼´¸A÷Ã3'ê^1MÊò²¥[eòÐ.êIYi1æAÖÈ^¯tzÍ=H`ÃÈc¦~ú=MAÆ=bfAÇ?_Çè}Å1/ÖÒªG;OË4h azc4Ù>Zë%Su2ç%ÓNeØye®»B­´3s=@[ä'°ÃTÄïºº=}Ä<7·oË½òïKA=K8{ÛÞÌâçÙ¯=L1¯¯û~HÝPõi¸Tíäþ¹á:ï¦¼ê[òc²;NîÓÄÑñ.&½¥å]y_=ìÓCTGæ4=@&>J÷c=L0GçÒ@+Õ%=b ¼e0ÊyÅ=bØßàk=}þyëVë]¤ùÜ+§8Õ3h¦Ã7¸ÆDmêO±G)ïæ) °¯¸ÞÂu9NK@Fy®ïî¾l=}#ÉÁ@[ü¾ýê0°)'03ùq%iåMh2o©=K6vü§2'¥êäKùEâ`ÂÇµÈåõ+Wõº8»=Mç¾I@!³QÄ£/#á =@¸+d×ç¾pÔÔ(äí»XI«ÎBÛbÃön°ü}ê¯:¶Ì=@Ig?DEEÌ©CÁ¥ø¡Ã//Ëód-ý¸ Ö[K}<~&d;Ùvß#@4ãât5Ä/¯ò{ò=M°½n®¯ó92má¤bäÒï=K3y°×GÑÀë¼t*À8[â¤ÒWêÏ|OÂÆ¾º=béBmÆZß¯VyÙáû5ç=@F¹®t=@Dã 3ê7XÕñà0ly'ò°Ï¸NÄ¨â2¥jå=HEmìGHð/ÞôÍ $»=b®'¬=KpùÓ@`½±w°¤ÇiãÎ(§VÕ;Õµ±g`LÊBÿ¢»ÑDi½¬óÜèFI+=MÈu§ræeB®OQÆ¢YCuÍ|¾=Læ;ËIgÊ©èØ=JqFû°»óuê0eZ)Üê+«Ç!av[4ByÚ$á-üóæQ<vµô2ðÚá=ò_×á8>ïlxÝÇÝ]ìÙÂYØ³£=@Åv¶#¿=J»ãÜÃSy§spåfC[ÛÜÂh 7ó60=bÒû_¤õö0ë=^`«Æ.nÎkåýh`ÔèÚ^RSÓc`ËÄðûx3¡vÚÅ:}çP#;øÛçéS|ùÔA®µÃ½ÄÃ'Õn'ÊtÁ ô¿Íé³ü¨¯VSÏõnÏU=J¶Á ÆÛ=KvÎ69éSV=ü4Ñ±«òû©©ÞCµbÓË=K_Å£¼b;LÚ|U8OÚ12J]R.îEôQÂE!û nÊì4óáõºSU{¦0[u=}¸Q:t!±Ö×äÝë~¸õéÜ÷&1<Êª ÜQ¸»Öéºórªð¡A¡H_·¯(LÇoîÞx»ýÍT±ðÔ=HÂjÒri°y=LôôØiUÏ0Ü^à $òÓvVE-§ÏBz»zþ­=Lßî{õª=bÕþ.5ÆV]Ò_=J(=J$è­äg=}?¤ÛÀtéÒ[E_ÉçDÐ(oC¶fDF×PÆáöM=}Ê=Iâ6É°Î±5[Í3@=@wÓ¤<Àßow³¤3JÈÖ¶´²=bðÔ<âÌapüqe83ä%(Ï4ùbÂ]¤U/«×ÆHÃtÎCÖã8ôQÿ¯¿o³v'Ú=bmTØ®Cx(g<ÞÍ¡·.Å!ï0âÑÅòbcö¥Mº>.j¿½ò­=JíÕÙ%½#ØKÞ!DíxÞÇñÒ9­M$ÔÃR·»ì­ü~ãrçPQ»aèÔ±ß£vbW»¤N¤5ì¯fÉåcêuÆÞ³^ÂÉM¡zgÿ=IçS¨×JÍÇÄOVPTâ1Ø6¤¾!L¡fñ­_§Â=Ko]mz¨×-Í¨j®_½Ã¬ÞAO+R)ÕÆ1ÅïRO=}à<=@ÓfÒÛÌ×ÅmlÓ¥öcYíOÆ@NùK1z,¯ZÔ7ò=H¢çgzóÄ>´=Iý®¹KèKÅéòvúK¥=JùÈÙÙsz½a4ÞMçÄôdúÞ¯¼m-lËDjléHé¾Öê*îz ò¸èÐYÚmû7´®$BOÒµ:=HRËzYYWòÆÅáRtXÙ¯hâWæ¬T±î.¶¾=HÜÄÄ^2·¯1æ¡!û}è`3'=Kµ«mæèîFÐßsÜ==@sKc§Âüs:OÒ|b=K´1kFgØÆ=¶ü¬Úaïs½1#ë¯lÉe£¿á·óÿ¬²üæÌø³ÝÒK®Äð|0£Éu=JèÁúD:r-û(Ð¼»Î]QäjcÍ|?vj;¨¦ðé×Äß=Hhsø¿´SSz}¾d1ø`ïN_%Ì£=}äï÷kÆ¿£X`ú0Ct}Í¹zRÙ£¶NÿIÎrôÂ1IU«¬=}¼AðsùÜÐÀ²«hn8_Ô~rGX=boÎwHb=@{Éi§$)4êd.zw~}üIÁ ß6ºÉÿ×4Ig¾»{Ugù=J ®LõA¿I)ó=M¦IÁÀõK²ëê«[=IMáOqì¨+!ó,=M]¤ê9pªqjb x=MÃÓçÔ«ýmæ°õx¡!)G^ms~bÎ{Ú~%¨âvÂa1µÊ«ä@e«'ë×ÇÜ³õ ,øõa±&6Xæm;}³¦L`öÂ4¢4§¦õ=bá¨R¶.sCþòº¾ð¸q²£L[@ÙÜ±ÄÚ¤Ây=Lsí§øRãÏ@Ò¦O³ÅÜ?USÒv;ø>4@>ä·Ûß£3­Ô·§0¤º(--oMÅ¼g$ÔW9®|x¾Z=-°(5´ôÐ­áãéÖðºÃ¸óÆÉ®¦U:nÞ¹;¹íïÏ~GÐqÖ=bà=}¯>zk=K¢ãaOãòàCU&¶Ö3ÿÌÕñbÏñúá(·Pf3¿Øh+Z <~ÎÒ=Lãù¦@E§ÞVYéÇ¬©÷kcÚËJj·ð¿¥8*Ö´$Ôe>÷Ü2~ÏeÂÑAÃRÊ¹=}?.7ÏÜxâ}m|Ó·4ÿ§aÓ»O=L/.9Ð`-âsdäD>ìOð6V´î<ÜR>l#¦=H%Ù:©å=If$b3üµ=}g=LO¿²¯;µ»¡T=MrV]µBÏEUÇìÎ&Æ8WÊÂÍ5?jsÁ8Ë5ªWq¢n=}=JÏs^=@wÐ'=@Æ]°§Dò^]=b6Ûµ}p¡4ñä/´Þ=M2/Kb=@ý2_Pñ>ëmn²aä=H#Blre'*yÍÚõ%Bð[Ã¿æüÿµåÔYjØ÷¸³brÃõ'hËÆÝDLAE=Í©?Ì~Ë=Käe¤/ä¢=MxWüÑ;­1ydn=@}=I¦íK,jh¥Û[ &by=p|Of`j».[·²2¾÷eRõÈîÉ=b^/xýfSoÎç¤P½¡¸µ>´H¤,¢O2ó¨=KËLÆÄ¶=IuK4ÿ7ô<^3ÞÉbg=MQöYÍwphÿYûhÂñZ¼#ÚMfQ?ýM;zµÖ[»°qÎpHê&ÄÌW{`ÍÂ;t´O/ªçýôUøîUø)à%¸V¥d%Â@ÄÔngñLÞCÃ×ØÈw+ÜñÞv!>Jw:¬v¢Ö3´mücó[4ÅE³Ø6=H=IAyÒOJÝQÎ²=Jø¿#Ôm3#øÆæÈ­y«ÿÍï4ýiÒê.czZn=HD42/I[¹Kn²]¿=I~ÿ­QìJà<ÅÍkÛ¤µÑ¢Êa2+Ì$,Æ¹Í¢Û>ÎfXËççH¤Ê±í1cE4v}qÄ§lát»ëïè?ú<¼Þ=HªÜ ÀíPµûj4ªúÌ1!ÑóÓµÎ²¡ÖrÛCbÓóèG§aè÷<òM¶¢äÒÑèùGÌöÀ=H¡hÎÁ¶ÃIÕ!7òºóÐ»£ûÝd|ÂÁ öi¦¹¤çIµàn¨CäZcõ½½ô^°¹lcglÝñá@{ëña£º=@ÏO,©ÚÀ«1~ôµ Ð8Ý­¥@[6Ê=IE=@ó¨èÙ{H·&²=Mü¡§¹ ~Uã=}Üä·²ï=}gï=}g=I´«lÒDæ¼$=HîÑ£§¾|·]ã-Lq;Ü':¢~°Ñb|U$ØÙTºRîéxIú²Ü5¿¹L:=b}Þ(üvAtð¼¿-(£j=}±rôRèò:$Ü¾Ì>(Väç<®Ü%/lÌ/´®à;êaW^}uèÓ=bÑsÌÏÌÐm¢¬mLQüJxÑÄiSihËîØp_h`§lP¯ógí=ó6@-ßZq2èqÍî¹[A nSÆÄÿ=}»÷ÛÆ8=Mr)î=MºÉù§ú£y³=bø©[#-X=Löáõú:js!ÈÚ|=}8!B!Ù£*È~öÞ|éüðAÏ)´/l&öJ×ïµÄH@Y#èYH)UÐyË¡©àÆIØp=}´À¶µÝ=Ãí4;G@IkBgúDé©ÞÁ¼Ë¦ä¼_ÊQëS¤BEÄEÚÇCçDE$@>o=ITz=J§ñ¬(G2ÁiÀ=I7æWÔxÄ=J[g¾2':gVd]vIjt=I÷Å(J¿P®9G_J¬@CøSDé8<w9G:äE£x¨|oR*Ø=HK ÑIédùjª6Í8A/ÉckÐrGÍktÒdÇ@ÏÚ@G¯f(#¤ÈHÈ'ïðY¾Ç·&2!þµ#þµ#þµ#Òîz,&GAÀFZgçNZH@|ßN-=}«ÊØ])q§'ÇÒhJÂª¿j=@[ZwÿÁ×d0Pµ8Jp¨bÃAö¹iÆ=Jø_Çªê[=L/=J§»7.$÷N¨V­JJ=}R¹ý³SÇÇ=LxJëÐÍ=@ÝÌÏEnn=HV=I5è{üô¢tD>?uOJUT`9}ú eH_ÂjW§©»úTïê(öX¡=bzÿqø«I=bØL]=LGvsæÀddyÜÄ9à»TÜ¢}ø7õPXJWP¸«fâ8ØN¨ghÏàdn6Z2z4S<oCÖeU%9Q·@TC$ëÎø`.!=}ÁÎ¶ºÙ½¿/«çb¥±ag{ÒC¥Õ¿ñÍ=Lô=}Õ2¶:'¶¬ðïvy/ùo%ûFJ?[#Eïhr`1ÖÓÄ_Ákº§,fÙáÙÊ¿BµBfB`Eo%z¥U¥Ù¾Õ~C{k´ïðñzßÜ!{ÒG=#,):qúçn«Ú¸X9PÅ=Lð8©:ø¦é¦©})ôØÃJÉèIÇI7Vß,.ºyo0rÎ2öhfH­dZ$[@=J!nm;DÄ·î¿Ô/Ô#5¿º¦»8du4ã´Á3êªÂÒ³ûÊ[ADaÁ§%Æ@!(/õgýÆ$A&0Cã·utÞ.I®ùAÒ±àq<=M=@=M à¬¼c6`þ`a=baºUN¨hU¨![2îï2­VD¾¿?úËýòãimYKã9-%Ó¿õ§z³*ÐF%=b}óuëÄ¢üqU_:aZ»IöEö¯¤@Ó.pTHQhnÓ  ÒrÜP.nÃ$9¡(Â=K[JlPyöâ7[ÕhPf¸¤UrÁäbÁIòûÎo®¦ZbÏ8:|Ñ÷î@±·gÁ¨ÓörÊFSÎpS>³ºZaâP®/ø å80h4éÁÍÅF»ìÐjAAõ2]F3ß[oÜÈýDX}¢6=}sq#=Kb¯#Øæús-WÜjÒÜù1Gi~½Ä#Á4Áû=b=MÔo5ÇH´IÛF¤@IE^gB§q<MoXDIHBÀ$;tÂL0MSKOJHQR HPHHxPHHÈPHHHHHHTk´Ìåü,Wh­Åß÷)[r¡ºÑê=@.Taz©ÀÛô'bt¢ºÏçü)U^}²Êäü,Wat¢»Öð=L&[`¬ÀÙð^gz¯Àßò+]eu²ÄÞó=L(fy©ÁÖí-[a|¥¼×î=H#bj©¾Ùï=J!ai£¹×í=L']j{©½Ùó=L&=ez¢½Øð=M%^gx§½Úð=L&`i{¼Îæü(]d²ÄÝò=J!bi}½àõ)cj§´Éãö)=b«¹Ëâø#js¥ºãù-_e~©ÄÒëû-fn¡¾Éæú/]ey·Öë=I&cx¯Íæû=L0ew«Äßø$5ir¥Áãö)e}¸Ðâò+`f|ËÞî-m´¢M¤Ü£ZùøhP³ÉÉ<hñ=beÃ_L;ÒègN¥¾Ú2Ê%³YþÐêt*N_m,RÊÄ»¾?5?74á/äáG=K«®¬´=IAÇÌlOWØä_Çãä¹Ï&~CÑódiØ_Ø¢»>«=Lyêf<R­hã÷h(jâð¨Øs´©=}=LS=bÏ¦f6O:jX§Õ¿â¸i¥R×oê0ü/|ÚÃÒKÅÚ=ÛCÑÂ8®U¢P=Jâ[=K=Mæé=MHDe6¶Zïa4¿XDh*Rå/ÚfflNéàðèÇëóºW(òof×eiêÒðHZ8ËÏE?H8-£1Hã´kQ=HUüP8½ßH÷z~Ád<È=K=H¥8Å]ØïZ_á_|!i-AÉ ÊÑm{.mëNÑëbïÝ!Q¬x«Ñ5ìÐÊÐ=H²aïÛ»ÖÃäòinñ®ÁRH/2i@=}ïvÙxÀVÐºK=@eb/»oèsÓùÎBFÜXøh*PZÄ`ÕìvoR«N=LTI!Èð*è»JåEXÃZ¬¦fñXÎ&?qWDÞÉ=@iÉèËy(°Vàµ#¶j?ykÝðjÓ=},»àíVºv¥T¾Õñ/ØÙAxvÝÀÁ)¨*òíû=JÊ¯=@Ódµî ü`¶ÔLVÚ=K§Â¢'$¿>ïa£ÇÜtP=}»ùý|^°Übàý;¨>é$4Ûy=Kä_BÓ/uæ½BÓ×èô8ZRÌ®=JÅÌþ®yZ§·7»Z··{¡&{Íyº¾Üí$=@>n{íkj>>8ru3Å»+¡7ÕcU¡YAìáy;»z&¦@þÇ7ì­Í·â'­=b»;¥±7öÔDúôÎeÍU×'¬Þ¦7Û6ÐÙ~û=L*|ù=L#£4¥¢<öülwkÿø÷»®FÎe=K'Ï´]Ð8C(»M{/ôr¯BòET¾¦Uk,;}y;ýíÄáùr1¬üNSÁb%T1Ú?U+ÐÿÏ3A}©.ÈáQ°§´Sø=åN.sïl¨ÒLÐ$j§TWÇÓ?¼8^ßWk­a´ìV]Ûòúõ­i¬Òìú*hüÖk¬=Mh==JHWËÓ¦ðb«4Å®Ñ«ÚWä=@$=K0Õ¿8Q§¶C6k-²bÁ¸NuÔ=bÞÙjõµÝÙ³?(m³þ5ºBµßî>°c/èÁ9±ÏS÷þæñí3Z¿gÅ3«oé{=b{ÀABµ¡Aí_sçëÁ®V6»=MngtÙ|¼:Mî(Móª{:÷±4êTuåî£qE¸íüÅ/×â,zÅ©¼Ä®=IO÷¢qÉ9LYp´AAB+¿g°ÉlÙ'¤9îÜËf1}ç,«©Äb(Å:ÓóÅB0Uq!-ç~Äë¹ÖÆ»k*z;·7*SÌê=Hs«Vßg3ì}Õ4E_¶À-_¸ú£8úUÑ;w}¿[¤+Ñ¶Ó¶'»4´-û.f+q¶=ISë+>e»C+ö}¸=Iò¡Áï=HÆõ­zm¸¼Ä¦AÕoåÔîÑíå·À=L×ÏhFvY.^Ó´%Ù§¾;±ÓÔ(á¡U§ùiÁ;ÞfÎ&s¨>ÚýQáÏ¦Å=bB·üõC<ÍÚ=@Ü´_à9T_·8ácW3ÇEãÞÑõ?$ÐÕ#úVå×99ÕnN×ÒKÍ»¨yÿ¾Uà´¤*öû?'½M¸GÓVHõîÔñ|_zè²=@gÆS(ØzNrnÀ¯Àåz0ùÎ³H×»É+ëÙ¤%¬þÜQ¥KkÜþÉCÙÿMÿMù_LW+Ë¯v@=KOoïRÖ÷FúÒtH÷ ¶Y;(§õé=@gqK5èÅÞÒt0,ØÅLYÍW?5¸Hb3ÿJÃµUõJpV¹tëÿÛßdeâ>ÏÐG}sàF9=IÛQ=L0w×øH¸ÐIkÝ^/=@/=@ï°[=IÇ0×M ~_Û¤§Õû^SFùÎ]ìò9¬k.n{JvÙ²`³ËdÉ`ÔiªKµ«võ£tëñ¡Ë÷Ü=}XKi·TÞ#H¥õ=LIZðRLè9^:'­GQXp¤àxR_úæ§çH¡¬Ò©´°­ ÀqNCzÐþW§·Ø`eLü_úp=K³M<¼}uÀ(c¤-s=Ü`ðPNù5ÍÀ¬ÉäËeã^x'FºÔSëKJNA=K!öPA÷NðbUõ®­<ÂNp=}fÄ¨ìà¸V¾Ú¾DØéH¶y!ª¬ þÈ}øÍÆcF[ApX!³ÓL=}l®LÔyô´nPº HÀ]ôGÀ.Oö}Ô`xRë¨|À0Ì³P¾DÅ8,XPêJ¡JmJÔöâÒ¬&zÀî¸¶ÝAóIÕ@N$=HãÈTêb=J#óîøG¼K~ûÑff­ñ8lnoÛõf¥Â>°¦¶Â$Î=}³÷ l #=b²êíñÑÉ^=K'F9:%sm=MoûûþôÑäg=03kâ°~Ï­ëûO×ç¸B)A{¿÷$÷*5.-*¹D Ô4%¿/kó^íRtÉ¤°þüxBð<Ú¼Ï=L=KS6Â=Lzõ#ùójâgüú jÙìøX=gÍôVÒÞ6Ð@é6-öeï»+kÌ¦ Òvv=J¯¿=Lî  Ñ':üÔkö,6ósEEæî=HîÓ×*íásÞï¦Y§u[CÂCÂÁámÃ=Í¸ï³®.Ý:ú70Ö00Z¹=KGÔÕAy»­ÁÜý¡)ó¥Ãì!ãkr=F3ÙÇtúnw¾W¹h]l=ÂÁãwuÜÐÍ­aÑÀîÒÒÂä8&L·Ï¦¢A¾°aë¨_ñá&º.#ç®²Ã¬¯»-ÍM²=HÄE=} H8·a^KR;Î¹A=J£p¯2=KB¿ª.¸(p?&&=KRß/e Ü4­5]¥U×ÐàOõ=K=K¡=LÐÕ=MìÎ=@lêÈoXO±FÖ(kàºe_éµàheÌô¸eÉJð=@üôã=H=KyÆ7ò9Í£síJwçw³(Ïb³Óy.ëÔTU<=}2ÖÉÿénç­°Ò,XbÀ=I¸­¡@@>ãsÁµMÇ´2D&oËþ4|rhÛ`{=}b£°G'ß&WwfÂÀ7àûëËEìY ÔN:}Ï3=M£Ìip-PåÉQmÀè×Ú0W<ñ:zwî8£3ÊôØ±AtQ:=bÑUòwà­Ñ¢r×ot=}HÕ¹ÄU~èbb05ÀÁ-¸:î}¯Aa¯òo(y©ðÃ¢;è2²16±þëUüìrV%ÒB²Æ¼ýlo³=b-»ËÅ%dõoÔ}y`ñë=M/lévgÄ;¤Æ$úñÞBlrÒS¹å´VNò°=J­óÕ^7'º¼Ç-=LYG&Çjn$!¼lpºè×õÊÂ¶=Lc:G¯(?ã1ûµÔMTpÃBSZj=J4t13°zlB&G9±©4ÔNÄé{' X|¢ßÏëÊæ·Å¥}_»þtç6xÏÏ_B§Õoêî¢`²dPQ¶±ÆÅi­ü9¤¤½¬¯Ü°ô^Fw~sIúg[¼7}ÇRÅÅÝ¨éÉþÞÍ0ñé·å?ÿ!³ù?w=JÁ²°èî|©öåæb4Æk=@·äÞrbB$Bè©Ì©ë7Åew÷f exßL°Kú.Ch¹b=MÃóÿE=M-E³îë¸l§ã6^nt¼yj :F>Ã%íE³JõT=@ÀÚ[´I¥jÂ®Õ[ý_ñÑB3[u#»TÿÖ2lµ|A4@Òâ¸&¦Ve)¥#90 üó~ ÇúÌ!b=HW¼Æ¸Ý7 uÔ¯8»#/°ð*÷w5ù?ÂÜòd¥=}Ì¶ëMº¼'Oýæ'ÿ~ àïÖÉ+¾º¼}>0êvBºuÈK÷[óé=IfúÏÑÖ]|Cþ¸9`ÚÍÎü%9{Hö÷. ¥T*3BÓñûnSø×~BÖî8W½ø>õX:÷I¡+õÍÄ½=M=I=}AÈ%=IÐä°Åg2¹&uØò`¥íèWåÃÚ´hÕB§m¡ò«¼»x}Ö¤]à÷îÚ=M.LSÞ=bçæ`ÿæ§ôà=M4/.3´ÁÊFÀÄ¼í°ìd§g§¥áèéÄ? giÉ¶PºÁv«ÙËI=MÄW>|g%`°éíÒ#dpæÒbÏóµ¨=I&»D=@¼à¶2f3CÜñ{=J^õ=@±Õ|Ydæ,]|¯¹¬e=J³À¹,2½cª=bAÌ¥jÒ=Jªù ´>'sªsc_?æWVûÜ²´­óJ]?±pÝz½­âÏïÜ[¥¢ñq¸ÝBd- ÖÜ#8ÄvêfC`LVÏm=@D<ÕPe¹fÓ%íòc0JU)a0ÖõsÊJ#þ=Lõæ{¦=HÉ%5AÛ[ý¼`EåûXSÆØÒú­ã¨ÌXäÕ°XvG¯f=@kÈxÈùµ=Lþµ#¾úþµ#þµ#þµ#>6Eaó/n%E=}Õº¥ÔçþO=Iìh=@wmPÚÊ(kÎEµÅY·Y¬|É§Nº'¥=Iä_ënÁ;=}G©b{à=Md.ùÈt©as =MbPkÊpªÐkÉlkËtºëÈjpëÊr²ðëÉn¢°ëËvÂ0«Èi`«Ê½¡çU!à!äu!âµ!æe!á¥!å!ãÅ!çKàäkâ«æ[áå{ã»çSàäsâ³æcá£åãÃçOÁàÁäoÁâ¯Áæ_ÁáÁåÁã¿ÁçWAàAäwAâ·AægAá§Aåá|DáT®yÏÁt¨Y RùÎX=JÐhÒ`*hÑ=hÓd:pèÐZðèÒb2°èÑ^=b0èÓfB`¨ÐYà_ðÑL0©³Ö.Â,ìo­»/µjn#av/¯bîàq'y$ ~æ8yKÌâa®=M{ë­Þáø9´áºDd}þçoïA®S¬úäÃÙ¥tûm.=L5%zußRá÷|æ§­#ñ}>¶õåTùïé¾~Ô¸÷kÄ^1 Ü»êåc+â ÏºZ%{Ûk=Mû{%û{ØñÞt}-ðuÕÁ²u»é=bÓ<h+=}îÿR2ý¢}Â÷Ûtb­lã^aýò¥®åú3Ú©×tÃ­=bw#aWÂ.«úçxË½ª{!=H´~zë²{#$4þ|4!ÿ#eÀ¯û&æ6¶¯?¬·÷?=}!FÖe0äËåÃð³V¿5Ù6¹üÃe3æ?æ¹Ò¯å.á¯À>¡²u/ó1ý¥ôÂÍâ÷CýÂ=@¦w11^%î=}Âÿæ7CKzÀ ^×,Q!më¯­=}¦Ú%ózÄ¥Þ·<¥!w+×¬EñßE¾x¬/&¾¿è£­Fä)E´5¾¯mÿc{¶6¿â;ì=û¤§,ÅÝâ¥w;['Cådßº@;d/§3BCdÇ=I;¾'e§D_HgB?2!U¾+úùîÒåDÿsþÛó5îñþ3âè&*å=bþ}7=}Å?8àËè2üNókRÍLÏY¸X ~¢?ïPwP³``£xX{apz(2`|f«xx3¡½®ÒÍüÉ=MtaÔe­ØaÃ¬@DNüd¬Ìdåº¸',xüäéÈAúJ`Nqi½É3ëÊ8ìx×ì@ÄÕ=J`÷Î=@¤UíKöNÕ}h5µ¨&©Ëòîþ°´øÍ,¶ÏñS4=H#=K=@=H&=J$è=M/î ¾2Á#I$X`|X=I$aå©ð¾ÉX/Òñ×¥=I»ËíeO)O;¾¿Äf2I«Üo=LéèOSÕM&hÄ¨nð-ÓåÆØôÖ½¤H=@æÉx®M²eT»´PÏ:ø|µªÅ'=ø®(*â=KîM=L4àÃÍéTÏé~J«ì]Ç=` Z«iTÐËÁ'ÈQª¬pFW$¯KbQhUõ¨F=bbµ  VOsGe=IxÖ7J1£R«8áÈ­¾nÐ¿~Ü£»=Hí.=I8gªiQ=MF¨ ¦NiÿJåÊ&UÞBfXN>ÊgÄ>0O+ßFXP¨ªHrOl]h IMxAHSÈPHçW)È=@=bWI<[=HYØyLJ`K¢8®iEÊ®¨i¤ß$ïHQÂMªóN1òI±KÆàe=LuL¿OàâÉ>¼É¼=IUÇWlwà¢BbcH:¯x@ÕÎ[Qù|VÜN'ú]=b>Ø¨bÜ­Í¡HédæèaK©²QéPù|83²ÓßÊ UZ;°ÿ(%ÖL=IG[¦ËÅÍì[iÑkÉoî§*Ñüÿ[iÓQg~Ø¹JY/thª7UÌ²l=J×=IÂè¨?aÂæY²úaq­Xuû`B=}ÔØÃÊYÝaFx­1äîtñ­XÞv¬AC ù?[8üÛá¹zâ nµñÞQë?0êzÛwß¦î LGÀä=bÞÓJ=*+ZM¥=Iôh¯dÜ®î|ÆöÚÞ¦Rg$ãR]uyñõòÌ7Gë*¡Ü&î¼¬»}¦â¥±}Dqbù'Õh·±« ¯Y£1¼¿£é±£Â~¼è#=bÛµ«4A+·4±õ -îßíë?1@ñV,@O±ÞëqEîk¥<=bxá>àó¥ÌÁöê6âs³àcý».=KÖìÝ2=IO´?XÂÀR¿±EÁ=K1(u¼ì¼3agEÄ§Ñó8k=JDA#HYh®´QäóH=b=bI>æÈvZpK´¯KÝ¿È@=ÊöQ.·©(uù8ù)âJ¿`R-^UDøì=MIjü¢×8HÄu·ÎCëùøémRª=HFÌ0E¨Pz xWåwµ=L '+P9=¥p=nvh±?Å¬ñ%oÚz{Î!¹Tý7ûúÛ:³m£^ÂÓõ0#¦>:=K¦á&=}5¤ì`2AY ìd@èó²¸Ï®|ùäF@¤Å5Å*Ã´¢Ç¨4ÎGa²·svòãa[)=@·;ïæ±vDe=b-Å¨ACÈ'ÇQ@[³A®F÷¹ä%OÍ}çf=HçÒ¶¢cc§ZÀ±²Mur¯ý!ºª»Ï6K´Æül+×]­ë'^_}§÷$½ÑòÕCü±8~6­ë§xMð¡NÄWj0¶=K(ÁmÓ=Ms,ÐþB»;þÀ8 YÏ9ÂPÎÑÏ=8§Âj8÷1þ]aw8Ï«{º/*`zA=K¥ºj{Ï!<Y+4|Ó­ì=INj¹®)-D¡Ü6¿£¯kÁ'ö=Lù×v=M1=J.öCÊÀôx$#|l(úFDG5T5ÇD±¼=Kâ@,Ré=@5î:µ·R:!=M¥ÃÃÖc@¬*ÝyÞÅH¡%ß=MC¢MTF~ØÚå%g7=M=KÚL:­n4Ï§=H(Pª úÛÿC{>/ =Iû³­ÞRú4ãBÅå©5tOq8Ð³½?p÷?êØ-3=bútiFoÖËïdpxà§Ç|Ñ +é³.P)hÌü>ð±f¿=bUm¬iëk!â0ºéÂõäýµ¦2«=Lå=@×Pl¥Ü}ýÁ5½ÞS³²GT_dñÕÈ3ö D/½<å¦´WG¨$?Îæ>SûúªÝ#=bæò¨FC ì#BE<'2ãç |Ã|î-DÊn!-´£Bh,ðßÕ:a&©$ :ê'`9Âø*ì#/~Á`¯ÔY¿1-vÛlcÓ¥ÄçÆ$ãâ*îýÙW°>Dá4j=HúbØµKÂfI=b¦Kì_È=MJÔ'KÔL(D§ÚJKH ·Tø>¿)HSÍÇ'±H@H=bèíý×FÃ7[µ%?NN=}IBJ-E|ªH{É¿¡@÷Xx¨iËdRpéÊb~øË^¸ËoDXÊxli]%h´ÃTà&õiv=L7,èÇ­ÿ=J4>¬;¨g¿oãÇWT0¡Úã&åØ`eb*5²wKÈ¹ÝËÂÝ]¬í¾°Ý=[b4=K1´Px=MºÒêäÇÁÇóÆá©(%:{ü³a·Í43¶^à|Â@=H&]/î¿²ådc&|=HÑô ·>¬«ÆSû=b£9ý8jcvòæ¹4ÐÅÝ.­D¼»ï+GÝë&eãõ£¡Àæ âEæo)'òEï£óc<YLD¬gç+z?ÀmðÂ'@ÇHùHGÊ5Ñ«úKrMx$ü¿dëæ:=MFÎ9ãóXMõrÌ=J.¬YÑÊÏçÛúí=@÷)=Ò?VmO!<Z§yg°sÒ+xÜgªÖ¸øßÇ£Ï¨W×à-ÞÁ#æ¸6î c÷C¨ÿYoÿêÀr!Ü)T2&5:NÑCTáK­`È£#þÕ´Ä!þµ&ÔÓ¡.Â³#þµ#¾¤##«ÃÆ¾´È=H.T¥=bb?o5aS^~`Þ ÏK=@:'XòsØí`KÉ2<bö[.~ÓaïuÅ·Õxú¯Ò[R¥ñr<(«úÝNÆlM¨kÊA=}{ÜÈPþvÖ*@á`ö&ÒëL¶tj}tM?î±ÄA½+TVÏ¬z¨Á^w¯+?rÏµÙÕA¬®=xªÌäâSº^ÏrÅñ¨ÈÚ=KoÜ=V9îª+¦]ð`0khà{§¸±Ïè3¡'ÊwM×'P>Ä^ÜFXäCu=@;êø¢:ýÚGsÁ1³8ÂÑ=MuÕclu¤B^Kí×BhmsyHß2=b|§.uÅiÇ3i­c|Åsmç@x;×|6w±Ö·dçLb7ì=@Øg=}ÿLßLGåÜ.h¸¾Ýè'Ä=Iùº=I~iÀÛvÑZÁSõMüMSNS¾=DBóª¹ÒÒrvf)=M@rÌÒ{¹rR%9÷ÒÁÕDë,.mù£Ý ÚÝí,ë×ÚÂ¶¿ª:=Iï£R5(x=I3¬MW5]<aò¨E?,4=bvëçPT-2hüòHCKMôðt=Hm3^xóIb?;1ÿiç=HÊÄ2d:{ççÁ¿-)y×ß2Ã.ù+­vß/ªÜãº±%zßóTãÛËÂ¸V-ËºxñÄ~»úù*^û¾®©äÝÍ^ç{akÛ)úº­Ëö³zÐÖè½'Tâ%7¼4±°Ø)û+aÏÐçÿ|N¢îy-³rô=MsxÝ«µqÜ=J2,=B=})EÍ¬B,oûÄÀz[¶n¹l)nQ;ÑÜ³¼j[àq=H­J_*oÓ¯¥?À¶gÔkVCî¹Dÿ~^µ <&=LxÿjN9y,¦Ñ.³|ÿ=bÁ«=#5ë ]Ù¤7_/ÅY,ÂXD~äÍ)=@VPo°·`_¥=K ]µÁpúéìöQ)ÎPSöL»njàÈwÀ=NùíXa3J¡´X@»IÔ8SèðgÿÇÌârD0!×óÄ9?­.ÆgÔôÄ¸,¡··þ:êü_3ñÛÁjÁx6=IïN¿ö¾ï¿S¿¶Ü=@9óÕcr¤á&ÝG8þS^Ý|³/Ô¹á[£9»òkÛcjVC±tÃÎÿ+µeë¦ :h^ýã~t¼ü©¹³üTô'ª=MÒiû,Å£øè?_»òªaÁgòdéi{vÕ}+Cj^ÿ}-Ð$Ì(Â«úEÕ±ÅÐÆ=b´¦²=I~Î -b(9çOB$ëú¼ACÏ^ÉöúÙ=b°DïÍ-6M²:9ðNÝ} ¢ôÖã9¼c×Ö¹l¼eÐäùl%eË=I`.Õn6pvAÕ*=HæÙ°½cÑ¾.PÖ¦cå¹=Kwe=b2é V­E*ipÇT.ñ/¨ö¶bÌ;LÍU,&IT3È_¹E=b×Ö%Cyyw<é¿ í<5w?wùo#W?(Àf=L½¯-6¶,ü0»Gö¢'M9ó{e{©o²2³ÙqeÀÝ=b;Ö=búû½£ÆAþ)1Ò³é©sdîü¬Ý^´5!J7.t$ Ô§â=Iüqîã)º«R~®Ákjð9'=}NûýiG=bEyÙA8Hh]Iø!þµ7Çýª#þåäµ#þµ#þµã{#p#%L×ANRaÙ-ÒgLXYLál=KµVVá{àèî)ÝÑ'o=HÎF9xdGd=JßêID×WÁø1=IWa¥`1ÌÄÄBí=bøa$J¥®»³UÅK$2ü£K%8äòÌ=LÕRþÞ=IGG -^«ùP­=IM(ªàÁv,~ûù@xS¥a DeRáñàÛÉÊ£ZÞÌÀÄ_Ó»ÏªèØ^MOéÄúQD¢p.·Ì(X$J9ã×Å/Ïæ@hø!SÖ=bæ¨W¼Ï*×¶`Ä*Jñno°=J$#fÆCþÁ#N­¸ÜúÌèÕá@ÌQ$[ÕØ=H´ÐyÎÇ9EWØÀÓß@v,a¦'ÄTÒGI¶½%=IÌ3ç=@N¶âðq×y%{ÀôÆZ/Öj<XäöDÓv.(¦9c2¼QTÜýYîÖó¦røòÐÚË¶Ú=F=@kV~Ys[?¦¼Ñ»)±ccá¹¡ÝI¡|¿@Q¯8¤îÊ*vA=I²Õdâor=bÛ,=@+Xñg7nñìÝÄ3¤RÚi9ùj=M,Ñ¢t9~Wk¯EÑüoC4òõQU÷qy·GFÁ?ä¤­=bZØ«GZ±uz²nÆ[^húl1D¿l½ÀÞ=IÜ0B9)¹²ÜãÚ®ð9TÙhPfHrÓJpHöµ#þµ#ãµ#þµ#~'!6¯#þ³ýrùDË¬º¸Ãúç;zs­Á$:éN^/u¾[5Õ=LB=HÆªêÄÎ4µÃÄEXuT¬Ìßè Ò<eh»=}èq©°=@óäêÖo¸ÈþÌÙ%®ùlGQÞØfÅ¦F=}ÙwÕ=L/±O©50knëì96T¹ò£jÇ¨©NÄ,%Ô9#Øü±_ba?=Ji0HB.Vë<¹Ä¼Íg¯B8j1¥Ég5°ï¶£<fª[gÊ¿E GÂÉo÷=IAVk©Fs¬ÇÈ½gGDW±N=@|x+a¾d-/Ê°xwVS(=beY Ð+§ä=Ìî­ÃðPÁ] =Mñ[7W³ky¦OíG=}¨xö×S¥ÎQÄ@hûJöÞ0À¬UâU*5èIµfÖðÆ4T>º_pR)4bWøÂ*=Ju·ð®CÈË=MW=MëFS=Lë=I@]fÊÞ©àôTÏl/ê8%lNª+østfÿ¦lêìpQÅt=üBQ´=¸º«b=bì=KEntúx;xOü<¤äAæ×þòJ4-p´yúl9®îT±¦§ÑÿX%Ë­ã¢fòOëKÖç´=JO®üjU½H&åpÕæ ½úW/¤B)½°X~P&Êë û¶dgozÑh±¾ÈÉÁVß.99=KjªÛÞPÊO=HXLÈÊùµ#þµ#þ5Äîþ5ýÿþ¦Õ;þµ³®·ÐùTFo=Kõ±ú´ÔÛ=K9ëd)ã,ÁîåjA/]ÁÑØl­tq;=KN]Ö~ñz¤Õ¯G+-L½^L³8GObDý[Ïdu,üÿceÔ¼¡ºß=}Â1û>ü;nbè1·Ð=}½Ö~m=Jà?Ô¡¬ôqßfáêøÔÅ¹.°~/!ªS2«t±·ßÁÎ¡»1}>´@(µ=}a£:¾äúý/.YÃì5VDò5=Mn]:&Q;¥ìS2¥@r½´+ÌÅ¶0=@+Dåó=@_6D;ædd:ª'ã31?©#egì+ÄAïgþ@9hç¿EcS(æ¹h3JyRê3XÑÅ=IôVé¿­PÏÅ¡ÄpÜ=M©´ÄXoOüjØGvÊEÙÄ _'¤b=MÌö°ÆF=<`:Õ«>«tÿ+ð!]ÆÃG_2úL&$(jÒ÷[!u*æÄzîoûoM=Mq àïzÃr%>±4GmÕö14F{åÂTL³{Ø;,=K=b2úPESÑÃ~F¯0Ü=Kågº=@­Ý:¤¤T;0äÛÏÝ²)+;@içµÅM`p(²iÂ¯S¡ç=LþEO]k;y¹Þmâ=J_!BqWM­,frëäc'ß»J}¹M#6¸ôøÚðEÝàÀ=@Ò?§ó@=bGó9Wõé6b¦rºëÞø[ýSò­e«§2põõ¯F=IÂdc¸ä$È,K=IÕ¬E$©AnÞ~97áÛ$:[lÀþØíÍý¢0Vµ­=6ÿºU=MµtÄ Îxîå%S#q¾ÀO'2hE²O!åD+Gaü6*²¯_'72ªß¦Í%Cöc;%tR2éÁôÏÃ3-±wB'?ú,¶wæÅÄÏþ¬>)_>ùÆ^f0/ØDHñQK dh/(Ho¬OAuÂØ[êº¾TªCÂØçi>üUy=}ïiÆÌÙx/{ÏÁ¹à*¥=K0g±L!P¶û¸'Ê@-PþÖë`]ÕyÁÜ_£¸³=ÅI«L<¿R ýÈ©IçRÀ¯rì~¦Ð¡ÏXÍLÌ $Xªôjê=J=Lû¤YoOpv[yÁßÐ=JjBÐ=@²m®ÁÜàgs=MÄXÒ¡ûDõªæX?üòÌÃQklD¢p©¯ïL;ZÖ÷Ø¸°ËLëZÆ=@p©Q£,ì@aA,lÒ=/ZqVNípØº·Ö=Ý^EríÂ+ÎÕrèÒ¾ÑjÚ¾Z¨shCU%eÏ6Þ¶ý*ýc[Ç4¨ù1Nãú]S´:B|×=Kª¾Ó×gø=@òæ=M=Jtþû`Bâ.kÓú@2ÓïÆû G¶Ð=MC=KG8Y^C xc®)§^¤B à9æMõ/tLø¸/nS=I¡#=HÊ¶S&t(^JùxC`¼Ti#=MakÎ=LMªøbYÉíP¾µ^ÉÿP²&pÌ¿cÌ(®sÌ÷ÇM¿HgL¨{H5A¸ÌWë@¨¤H=}~M¸sg¦8;=I}gì:t7ç¤À5ãSWº(´V,ÄN#,´Ð5Ê¯9¡¸[6N¬Ê¡¥NNtçV­)|À%ÛR3©C-=`íâJµñèÝL®mz¸òLûÑø~Iv1çXÚ=@¡`S±¿«è jNÊtêépoR¤=J.öPPÕÈ;)ÜbNÚÃ6PdÁcTU:=IøhPNdK©pnHVÓE)f|æ>Ë°_ÖA=H/&èCSºÁ=I·W 0V¯Î%è» ]¢O¥¨+g¯`/L&gdiþ=KIdâ4©(Öeô°S·V =Hô}¨æ®MSEtT(=J³Cu/=@Â=Md^·zËSyîè±LþsvN1ÍhHFR.=KRÏÁx¡­v$ÅªJ4i«(aÉëþiLÏõ<èo_zn3=H4®µØ§ïM¢[ºÂ¯É9á4K¦O.$0>çJuZÛ©:Ñ¸µJä6Ïé5²¸ÁérþpË¯ÎZ sÖË*ÚùhüÈ:øwVÔÚM¶Ï|ÙJ3ë´RîegiñíËìFwñ6B¦ÇENÙqz§ÐËªW1ÁóiÁ²wb-êõ8ÊLmNÇ#9ï®&vZ7£L×l=Kc6ÙáÿLfl=LcÌCÁÍdµ¾æÖE7|±Ptin=M,ú=L¼Øôú×¼î4n£¾ØkÚ¬5njÅR ÀÚÖ-,PÐz®Ûúíñì2¢¹{ÖlÉÊÐw9¢-ê#[C¸ê ­ò/vh£¿aÙF!¬¤Ñ,m´JarîÏTzáÒ§aE:¶nvéÝ¹õ¨,·y=KzsmW{#=yú>sa2=Îw5=K=Yî¯{ÀÂ|} 8ü>¡Ö»úÀþÜ);-5Ã#ëßÜ£±ÿßRÝ/ü<ü¥'P¿ØC.îd¢=K¡W5(rËÖ¹ó÷§(DÝ¶}ÿçÃ%Æ=Km>¹ù_¯ÙTìE?0/àqËæòÅ`[òDÀiµ¥¡Ãd±ÉO%¹×:40AÎpÙÂÙßÏ/Di=}§SÃ%ý|{ºK&ÿá=b}]áå<ÒAfBmÁÀÐzýñ-'ªâíÅÚ~=@åé/1ûÅß°ï¾%èíkí­í]î¿0´7C|ùÊÒó1$ê¢ÆüÙ¤´é­×0âO1Ï}¢ <÷´ÁýéEÕ7q&C;·=}Ðû0K1ü=}Eü{ÃÐîàè,°ôrÑ·Sí0ã|>Ïê³ídàNÛ?q(DÒàdVoséùÙRæ%ðÒ£Ãø¹.^=HÔ)ÑÀãaë÷¸'¼ÜwáÉ}®ªõõN_±ê8^²³é­BêvEöÏs_b¨ÇÞi¶¬Ì8!`­½/(óø =@«fBFM@¨YW Ôv=I_>ùaVá«7tS´ø®¸§=×-Èg>£ª=J}sÄ ³Õë¦=b(=Lçþpq«×?eØï)ÐUåøÃÉ{þâ(n]-=IUµÑz8#jTz9=JJµ·¼æ,Ë:@C×w9ÿfî'<mÏJ8©hfÑRª]Ô2¿PfóW=Me=Kd}5køuZç¾j£ZÍïê¿¦TÒCª/tí=L)cåÀDf×ÿmè=H~Y'Ç=LÃÞ) ßl%ßÌeÛyMçí(Ù<=K=@±@=9»þ­¨8ÿT|_¬ªÎ¬^Võ=JVÍ´!àÕ,»x±­V¶aÑ¤,¦/*'ä¼Wwc-+>eA >g=}R8±¡I*+0t^;¹I²¯Px(þHóRyßo=L8Ë¤u=LvY.Ò)èPfÑ¸; y¡Ò9ª`ÿeZ+ñryF4]«^=}¡Vªx×=MDj^Gä¬9|*ÞN^¼ø@AkÓ¹ a@ÏWû@¹ÌÍÇ @7uStP×øø{áÍJ«^Ô¦Ñ)nyp`ÓI6Ð=H#¡LÖÝ£rÌ'L=HÕ8©_gd?==HÔÄØßO}=KøÿÍûd¸WNGt½L}+TànßVÏæì=JÑq¨aÜTªÍläPÛZ¨¿d<mJÁgUcê(+=KPUOe¹p0L=Kò¹(+`H;Áø)øw*iÿ[Ö¸Oö=K]æ¾NýX¦øOÛþ¨]«U=};t)w.§¦¢RQ®¸ÅQp'¢PóE.ËFx`ªOU¨Y§WÖÆãUW=Ký(¾=MtóKõàRõµÛ=H¡»J`lð=I>Z­p6LÉâJà¡=Iä|£{bÔ5¸§ú0vA4vk^Ñ31/ì¼¿cñZ|XójåÂ?Â§¹-aR¯än#r×ÛôìËl¡¾Á¸¨sñx¤¶¥Egñ+[Õì=êZZ<µÄtÃz3ßq¯ÒhVr=LÇÚìÇ®6ºû¹áVGË=H&]A¡Wn¾=b=®7àrSËÚí^¿:gÝb#®ÜCÆ6¢ð5R-÷+Ê¬ÒÜz±n-$]Æ¸÷¬1ä2<?«UÂÁVEÊt»ê¶3Áü6|=}ß5vÐðêrÂðºK|%×6é¹ÚÏqÎåèvçéÑkßðé5B¬íN6/¥<Ì¬[ýãFà.`ÿ&M÷°6$W<þ.±G¥µQÙÄ¥N?GÜ=KèRMDµdBNðè/½ô³àÈ¯So«ë|ä|K}8ÔÜ~& öË!=}ùªi¶=Iú»/3Ä)PEw=IK®0´¯ÉñóQv$8bÅn=b©ªOÄ.2Ìvðd6ÎÊØ=@Á)=MÀ­Êg®Æ.)ËH$qV=JXÔBXÒî£=KZ+·)Iï`ô÷Ô=Mfnf§å=HZA­ðcÙÌ¯Û¹.ß=,=KH7¼ÛåÉ9c{Ù%ãÍ7>¯+5p¦æÓê:øtg/=(éÒJäp.+VÅIrSØgv=LþWäÜpvÃys^«5wyY^W8¡ÆÎ=Mt=bÄª92HÓGÕøø+]SO>ùóÊ1RyT¥^I$XÊ=I^IÄ/³±ðp-=I÷mþpS,,{è?rDåãT£o=Jäs¹(»kb¶×H¿øÃ=PÚÌOÎi>èÌ5ºÎ=blÃ ~=KbFæ¯=HºÎapîtÌAO.=HâûN»°~>tyæRÙ}+aZ¶ÕÉlM±x!=b£C·'£=JÇF%m6ÐÉ7q*½@Haò'&ôh=}l2ø_á3Ìü¼kÆëKkÜ °WzÓt/9ªà&:ú#¤Ä°Qï(lO,°^ó_«°ù¹H¹ìòâó115¼©=K©=bn_ÔïPf(Òn¢?íåÂÆEsfFì£·èÉT²³Ô=M_x¯jÞ^=K¿|¸Dce¼6y¦¤TøPG¯¯Ö½LO_=b¨ÁÉKÒ>(f{O×2B«<=}hÄkT/êZNçl=Më4ê­ûuaì)Úa`âÍßº¸ÊWÇpÕeÄ<³_¨¨XCÒ¸$My®#û@Ç-IÚlÈ=J¸.!þ%³7ÖïÂ´#þµ#þµ#þµ#~2n2`=b7W?©Ö/îGHd9n¦t{XWâ=Il+(=IØÐ®=M«µË¿(ÿØ8?:?K·Cø8iìÎØc*WÏ KC¨QqðPiD?Ém¼Û=Þv|ÎÞVJ¼f£Db:.D:gÇA5WJ95¿7%G8+oçÇËÚ00a`áàØÆnÀª¨ª©«/,.]XZY[ßÜÞ}xzy{ÿülîì«)*[ZÛÜÙ{|yÿüù»º;<9WTQÓÒC=}ÏpïÐäâöùíûÏ¢¾Æ½'8@=J:=I!/Û»°£=@@l®^ý¼Õõ5åÅDsÕèòá£¸¡/(,*1¯[yø¾=}UÕwñ´6fâ¤ #=@B0=brëì³¬¾½?<¥jóÚ½Â#ÿ|¥+.V'kxáÁ_~V7¤ÅÏ{Â¸52Ïê+·Þºµ£Å;Ø¡ ¹Gc¬¤zÿ§oUò¦Âåsú½7=}/Æ­÷2=L¼fÎâ®¯=@R¸=@°¶¶úk7=@µ««ÙQÑÝ¨²²²ÒÒ¥±G ½©=b##³²:QöNË_öe¦æ5²Fíþþþ=@=KUmü+¢xÕÕÕ­­¡6lLèùq8%Zê|ðN³@[øNÈ^¢XUHÜÎd=bËXTHÃûµv#>úµw#>úµw#>ºÅþù'þÕ»d{yæ¼å]¡ï¼8ôenC¤oÔâ¶ûn#@Þf¦ýO-¼=Kt=LÄ*°0cú×§a(¥O¸ß¼Ô.M­¥­¡9iµ±cÚxcÛQêòãônìÓ_5=Jú!h;yãp24*BÀ$lçûÕú`ÓêñÏ´iF¬ÐWe=JÒ l­Lq-ºùä?°1y£ºTe){{ÉÿºÝ ¯¼<äe®o@$hä¢¶ÿ^#AÖæ¦ûo5T=KuJ*±,Æcùç'`0Oº×=Jvx&<Ô)m-¤µ;Yµ­£Ù&y|Pîâãõ®êóß4mú=M¨;{Ï°2#Â4.oBÂ$j»ÔþîáÏµ©Fªð×dkÒ=L¬xÚ¯Ü¾Íí¡=ICü:=@õbBtlÈ¶øzc@äæÿ[/*K=Kjð5V³ûË71-½Ã¹å|=JjtlÉføyO@å&¿X?q*[=H ¦&}Þ¯Ugþ+|ad3s»xÝXò=M2´)³Á!¶¤nÏUùH»ÑéÃôfÆîçÿ5µR`øÜ=âÃ=L.d)·ÎA ©îÌyuëÀa¢ÎÝÄ³ â[ì½ÜlJñ*óøÙw04M»ÉôzjÚ6üVAÉ&&ø3tkujZ±*ã¸Ø`4KO;ÈêvzÔÔ+}]¤³M:Q5«ÃØ¹~oPíÎ£õ=Ié4]ºSz× b=@N4-_BÃF$éè;ÔýlíÍµ=IF©=@d['üÇqtOhùêpÎþµ#¶#þµ÷µ#þµCþµ#¾|¯À&<ÐÈC¿é¢LÆ­L:=MÓèz©]#±uÊk7{ßjà#j=M?Ó¨ÓÓqãwÔ7J öx¨ÉÏÍ9ïÑ%=Êõ5ÀÒÅlÌÈü£X¿õêWLF±1ÂWkØ=IYêÁJPQmg@Y§¹ßn:Ä(]eó/=Mý±ºmwT¯RÁf|ZãGkOFE=K²ü8wöî1w&(°«GÎ×Îmý%DÍ=HrÃùEoe¸ëË'y¢ÏFÄËïgë/Z§yyÜr?Ç=I`¢8QêÊgéFË®Æ3ßBó?V>Ç°<*ÿ@=}óÒÜÜ§«*N=b;Zc÷ÿ=MÛ_%áfF+®ÖÁÒí­«;×=I[zæ{^ÃÐVE$º×C(A~Ý#åÃ¿>ÿtA>GaLw=@ÏFÆ)EÃíE5mr=M>GØ;ýóu'#F½1Ee¤æ>g³,>»Å¾ûÙ$Ç9ÚÓ#n-E'JÏCä>ö¸øÇÄ«G¦Ãgµ¨_=bF9%Eãt5auT>Ðÿ¥¬üG{ÓqÈIBhH`Ð©`tÎv²6F8$Aæùâôå!bb°×{&Ûi¡nú¬åe­í#¼1ä6=KhtÎ Tëøb®©T=K:xU#=KôW;øÇÎ1ÈHHXP yGò­¨Ëüàn±{Õ²âí%|±âþõïÁ=b×É `[ùyª­=L`Òíy]£«t¤4Õ=I dÛù«½6`Ö-ye#«Ä4KÁ©æc;¦,å;¦-õ; ¦-;¨¦./BCqî[JSpLÈÌyH}å?gfW®1ç7 =}æ¯3!=}Æ¾õö=}!ýg>¯Á ½¾åß¥/¯Å ½¾%ß¥?¯ }g¾Ó¥;«!}§¾ã¥;¯f4Ï¥Áùs¾-öÄ!Ý:¯g W¾=}Í¥E©ç w¾=}Õ¥E«g!¾=}Ý¥E­ç!·¾=}å¥E¯ßO¾A¨ß_¾A©ßo¾Aªß¾A«ß¾A¬ß¾ÅC#«æ;b÷=}f7ýÎýô±µÃ æ>¾N¯¹n¯»¯½®¯¿O¿¹o¿»¿½¯¿Kûx[ûykûz{û{û|û}«û~»ûßÉt¬jca®úÛét­r£a¢.úI¥Q%Y¥a%i¥q%y¥%¥%¥¡%©¥±%¹¥Á%¯ÈMn ¨Ì]® ©Ðmî ªÔ}. «Øn!¬Ü®!gÓ¼´MhTKy¼J~:±£>;fØ Ú';ÁÇçG/Ç6ãC¯æáw;®F4ÛEú·>W×8Q÷8S8U78××@Ñ÷@Ó@Õ7@W1kìç<Ü£BÃtIUHhT=LäLb9Êô­Á §ßÃÅ.¦»/$¿6?ç¬g!>Û­§!£>ß®ç!³>ã¯'!Ã>gW*Ðg9l=Lã@[×*Ò§9t=M@_W+«Ôç9|#@c×+»Ö'9C@çfìW1BÙæìw1BÛfí1BÝæí·1¥Bßfî×1­Báæî÷1µ/'ÿüfï1½Båæï71ÅBtIHhXLéª&GÆ°I9ÄXw=LW9ÄY·=Lg9ÄZ÷=Lw9Ä[7=L9Ä=w=M9Ä]·=M§9 Ä^÷=M·9¤Ä_7=MÇ9¨Ä`w×9¬Äa·ç9°Äb÷÷9´Äc79¸Ädw9¼Äe·'9ÀÄf÷79ÄÄg7GAÆØw,WAÆÙ·,gAD¬zÇá·.;çAD°|Çâ÷.£;÷A D´~Çã7.Ã;A(D¸Çäw/ã/ç/ë/ï/ó/÷/û/ÿ¿'oPfXJIHHÈ5´#þµ#þµ#þµ#þµ#6QµÜ¢¿í ÃÝ£»å=}]Uüa}|g]_MòòéþÂróîî2óê¢2òq|w-oEs%=qæºB¡/æ¼2a¯ç¿:±¯æ»FìÚ~ÁlÛn,Û¡,Úh{~¬|Ä¤[nÝ¢!-Ý¤¢á-Ü§1­Ý£ê=L¦Ç3%ß¦Å+5?¦Æ5¿&ÇÑ~ ®×­ ¬ÏÅ ¯Ó¥^t2Î#64âã6=@7Ò3¶3=Jí#°Þ£³ûå>£±õ¾£üLr`¨ËOz°¨ÊKpèËMvPØ]´9^¹=L_¼ù=L]ið©Ìe¦éÍa@éÌf=@ib½ÔùcÁüyaÇÜb¿=LÐÕs+dÈcµ=KpBm½ã¹ù2òµ#þÕ'þÕ} ÃV^«5õ»coo¨ÅÐÍM1Fj¹à=KeWÆF;:IÑ2 G;çñÏl2j!çÐËR=@­=HöQÆ%)MóexÙLß}¸É¥cDÂ=K±ô>Xl ÐÏ×@©=JØaÖ(U{å=@4X=Kren-¸!Rÿø£R¬XHrx®ÉúMä=I~]¼PXIx.ÉºfCÊµn0>éX ²ßRêxµN+vN¯oYÊ9rgôD=HoSÌBÑI¡ ¸ÞÙ?0@[¾oÇd=}1«á°$ï;¾ôÚ°VÏÐ=K)6¨iHU¯X¨ÈÉPïèËH_TdLÛ=JOtêËÔ!KyÅJ=bÀêLbÊÍfZ¤öc¢8=KQûÏ©Âi=b@étb>e>9IÃ=KQgiF´=bã8(7ÖÒh¶i_ÙçÙ÷Ù×ÙU¬MA=Ág!V¾7h!#E)=I)e/ë?ÜÅfîðo[R}ªpyÞ`ÒÔ)%Êv=I((îüqÇEGÑ£ááæ[R¯Ì{:öRÉþh§à¢äkµ`XT¹skUQË¤è,¯]-Ü²}õÊvwóßý6ù1-=}}5'd÷G-*?¿ÿúvýrë¢àä´p{ÝìÞò2ì=}úN¡·¸ZÃ~ôÚï×Þ_Ýbkâ=K#êÃÀåV&(ÊÒ?oö§=@Ç6A{Ew]/ãÖÇ=@Ä9A£=bÞÝïý¡ÓSº:ûü!ÕÚ.Ü6ìv©Ï°z¹8»mìÒõ×Ð`ôµÑ´_<U{NE¹.d³!¯#77KVD&/?Ó<ÓÜ?1¶Çs|^ãý=L÷ðöó±6=>mÕn=}m=}R/+_Açy~ráÂI)ÙÏ8X¤/âÝ f£¼(Ó£?¼RzÌ'Çêzä16¦ÆFÉ=Iié©TNÛ=Mª+Ó|¤ÿ+­&*°¾?N7H", new Uint8Array(91333)))});

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

  EmscriptenWASM.compiled.then((wasm) => WebAssembly.instantiate(wasm, imports)).then(function(instance) {
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
  }

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
      return new this._WASMAudioDecoderCommon(this).then((common) => {
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
            OpusDecoder.errors.get(samplesDecoded)
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

    const isNumber = (param) => typeof param === "number";

    // channel mapping family >= 1
    if (
      options.channels > 2 &&
      (!isNumber(options.streamCount) ||
        !isNumber(options.coupledStreamCount) ||
        !Array.isArray(options.channelMappingTable))
    ) {
      throw new Error("Invalid Opus Decoder Options for multichannel decoding.");
    }

    // channel mapping family 0
    this._channels = isNumber(options.channels) ? options.channels : 2;
    this._streamCount = isNumber(options.streamCount) ? options.streamCount : 1;
    this._coupledStreamCount = isNumber(options.coupledStreamCount)
      ? options.coupledStreamCount
      : this._channels - 1;
    this._channelMappingTable =
      options.channelMappingTable || (this._channels === 2 ? [0, 1] : [0]);
    this._preSkip = options.preSkip || 0;

    this._inputSize = 32000 * 0.12 * this._channels; // 256kbs per channel
    this._outputChannelSize = 120 * 48;
    this._outputChannels = this._channels;

    this._ready = this._init();

    return this;
  }

  class OpusDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, OpusDecoder, EmscriptenWASM);
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
