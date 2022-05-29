(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  function WASMAudioDecoderCommon(caller) {
    // setup static methods
    const uint8Array = Uint8Array;
    const uint16Array = Uint16Array;
    const float32Array = Float32Array;

    if (!WASMAudioDecoderCommon.concatFloat32) {
      Object.defineProperties(WASMAudioDecoderCommon, {
        concatFloat32: {
          value: (buffers, length) => {
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
      caller._input = this.allocateTypedArray(caller._inputSize, uint8Array);

      // output buffer
      caller._output = this.allocateTypedArray(
        caller._outputChannels * caller._outputChannelSize,
        float32Array
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
              this.console.error("Unknown command sent to worker: " + command);
          }
        };
      }).toString()})(${JSON.stringify(
        options
      )}, ${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString("dynEncode0089µºK¹.ÛXépÜ·¤ôëÀ*±A-ÓþOHEM*3áJ=Jn=H÷ÂL>,ì.3.§Ð:³=JW§õKß§vÙòux|ô£$À6aU§ôóOô Ø=}ïÍ?.`Bý%6<úB'AüN¤¿z÷Ç%ÅV ©±ô=L¹gfDkwÙ··éúJf¦é¡¿ê©°8®}a¤èQÉ«-²gGú¿IñÙÓñª4ÔOªÜq!º ÎÙí½È=Mø¬O=MÊuó¹=Jµ ë°lGd=J¯JúålÈ«ýå?â±A§0ÄªøB~|6a(ááÊÞÍ5*UÃçQçR¯gQ·ôp=@Óoëtqm}v=LSOW×öDá5ø¥'&èõççæhegz¾4øtQ_Ó;Ð;ó%±ùw»Æ`èÀä%ÛÕ@ò=b.cþ|¥Ä2&5 =@®¨nGõJTER»¼¼¼||üÏ[°ðz=JîfÂüWIÂ=@-XDÏXqâFäHÍHáHÕgGíºo]!ÛtvÇfû×»Ë²=@'yÿÐ3Ù7==bd½²Û°3ýz<]-_=b.áþªÍÞIÐ¶Ûó.l)âÎóÝ&òTàg=MíÂR£¨½Ùæ]Íq%Û~R)²=L¯àî«5FcIÊÃ}à=Lï·=K)Xß(1¼tÉ´àÛí=LC'ÐTX=bÛï#J=KÀvJ]Ó»»aZrf×ææDtÕÑ7Ãq©¬w»$=L7g¾/'¬Ô£úyÃØuâÓvYô[r²=Mxd3oüù´¢Æ­=HL¼G½cHuq2ü<âÈ¯DÐ=@?/ð;ç»¦ßxÏò·´ÜòýZå?0×=bd ¦[ìGdjJÌ¼­ÃQ§ÏÇùÑèÅO*bNÈ¾l¶ÜxÏø´þ·4yU$ï<g+JÑ?Ù;É=Jâ)I=b=K-ÔbÕÌR¼DÒX÷êÌíBöÚGÓ_Ä3Iø¦~ÿzXã]!óÍ%½ð¼L¥íà ÝÊ=I>,õ=@@a¬)Æ Ç63ù{þäãÇ.ªÀºÈBX0*Hßÿ*Õò¶Ô²@gÇ+Æä=I@í£3dC?ý]QÛÒG.¶ÇÞ3E1+{¾5j1vø=b£z&>«TIyÙÈ¯=M½5íS¸ªCaGÑCs2Ò1)Æâ¨¢ûö5${Ô²*«ÒÜ=H¤èë¢âã;þ§»í*ÿO¾=b²s=L¯sdÃÎîU{È=K%1ºÙP[iæ­s{¼K5è_`Èr Øï#Û³ÙØ>£¹º¨¸õã½Î2í,áÕÔê÷º¶d¿ÈR'Ã9JzùÁñ%}®s,®da0¬M<ÇïîäÔM=@=ØTÉr0n+MQÓUpëI¹Á*IA1Õù¥$ðæ×ýjX°v¾.ïkò¢½o51çp»Æ)Å$®ñZZ[ºíZRµòOBâç¬²xcÔ)n¸¶vUÁ]ÎRÑYáðazÄ~.RÑ,mWS§=KË_,3Ç¶¼3ÇØÅ¢:äçn=KÉtv²]<gïÐ^LoBÔ±XWKLÅy»º=Þ=bj/ C×»ÓpÐØb¼ö¯D/§ÒCtÁô(³[ô»÷xí_®!í¼(=bbðQýÔùYðã/ÕL:<gæ,þ÷Ã/¸è0Ð:¢Q©­ûc=HÃvVSéÙñýù,;¾»|)p9¨¤myé8¯Ü¦íâÓËêZ¶Ø¦0eÍiîÆéõÄ/OBX¤&KmG-o¶0ÁW¿¿¼IóeØL]áOg0%¯µ²Á%m¾*²©bÒÔ#|&+-S´L+~[¢Rß*¥¦;ñá¡5Úác!µêß=MtÛe=MRº)Pî/b¡oVNkAf=}ªòÁ5¯~ýJm³=bã.3á`ç5éº^¹Þ=LªÞ+êK=@üN¤}è~>-³b¤¤TÑëßÀkåï±ÀØGáì,yXµobB¶#T;jfñ-ÃH°'~;`W²Ê=K¿;>bí#Æ=bwã»ÔOÆè0ÜídåÓCo/;E%û§tóÉê¡Ù§v-xòzÖ?Õ»Nß0¯²ÐÅ!ÛK¸'Èlká£óL,ÚjEÔSá­{_!WÕø4!0ÙÝA9{À¸£|+lE!Â(P·=LúSÜÇÀ nVn2L<ïî/Fó;»=Lç_4¯ÞÇV°.ÅrAwýôfr7þ ûÖQR·éEþ±û=IIê9½'L9C°¨ú&=HzOMfWpúµô<%,¥Dn'H8o=§ðc©æT=bõ¶2yÆ¬&ÚaüÔL¿pýð¹Âÿ.Oåå=K~Å¡¬´PóÝ¹|=Mæå»Áó=LSgÏEgoþ1fO¡tar¡¹õÉÂÓe`9±·=HF9Éþßo´eÒücajÔÑ×ñ<+Ý=L.ZrTÃ¾TÊù÷äYP8®d­ îâwêÁ@§¯P=}g[&I[@sN=Mýïä¾,ä©oß!9ÑxKz9Sí³=@¨ç³x'n=KµÔÏ®ñe¦ç­S;Ï;QBE1ÍfÕïâjÁ©-¶»×¼×¼¬Ö×§ ÞÙ>úéGkÄ.+]uIðÃß)ë0lÜÃï¶Kñnd SÒ×;X=IÃ½ØQcN.ìÀ)&ætaÍE+ÝóÝÔHÝáËÖG-Ï!0|An{w*ü<v)¯ÅFÿê=@ð®=Lá¸ÞäVp19úÑæ±>Ñ»³°»àA'X=IÞµÄoiàÓ>¦ÁÎä³=}Tâ ¢sv{º=KNUS£à Tu=b¦§ÜÒR»í@VxyÒ4û@u Í&Æí@=}ÝËëäâíËLñe:gç ¦,ßË?æ=H©«æÎhWKUç¯±ÚéöÌü±=bý4-gkN¸þ/ÜqâÙq®uÇ(=M0º`s=KÖ·_÷ZáhúÍB°NéµjÈSæ=J~£KUZ±ðpïF¬F(# Wüx-Û×Éu5±SÔ¾ëÈØüdðP`µ,Â£);ô²ÐPÂ_O¥$M;u`ÛFYáe³MDü¾[/¯ø:ã8{R=l$¨y¢¢$=Jh&c=@=@5«äì(¯ªRapú²Ç$.U3[Ún+z$ÙïdH¾OIAl'pÈèßq<C:ºJ÷·:ê=`Éa÷=MìÇ»¯fln7,u!pµ¸:`L7ôïX{í>¹²ýLÓ&ÍòTFËõ1µÍ»)ëúÎú©¿ÔìÜÖfäc=JÃY3?³§s_ú(éÛ:çÆÈCê¶Øª+ßS×ÒåpÉõS:²M=JI6MÃ_+!j¾i·]ï4y$FoDGï[$& Fq¨ÅoÖÈq=@xÚP¦e¼¢ghüçåç=}ôoÖ`P?çúN!)w4DÕt·I!c=}túN¦_J$À²~yç1¡Æ´Wnàe¿|çÛ¹Gð÷n@Ð¤Ic:ô=H+=@ø=LÛñeñÄ(=@¯þëç»nÜH^â¬a4¹ÁÙB¬cUQâY,jË=Kx%¸¦=}ÀµßËúÂÖß/§N²I°1ê1Î¦Û¬2N47×î®Ù|¤*»¯ÅËÔ:«½=I®*ÞAê£YÚ=Lo16¤½t«ýK)ÂªË0#Ü«ýO)Â¬ËÌ=Lï±Ë¤V[ÁVíñE*}ë§j[çiFÍ=bÐ·R¼­$DK¯ÄQ° ~Ñ­$Ù©=Lf ªÿA?À¿ÑÖ°}ÐØ-RWö/bÊóH@Êw±OEèäx>±BÀ³>ü!(¿¨Pµóµ=@ T³(b=bÅÉîhHô;-¿%AòtâXDdIeÊß±bäç;+úeÆ¨ûÒj'jFnÎI=@C°ëmh$¤v8¦ef.=HNDdÉÔÈ=I=J?y¿Ä{´h}=J)=Líz#>P=@=HÛ-ú¼ÈM:´ÝT0éâ.þ-@¡ñÊÀÎ»qi« 2^4û=H=Ki=b=J×q²[nvèEËeâaZOs=M-OmS­=btíXõ3¬üª~±ùcQòJb&×JëmçÀ®aw)³É#d}#{_XÜÂn-Q¬Y·UÅ¸DäÚ×»]®f£d&=RU{R!O=}¼µâ°Güç¯g¼üäDTÌL|!CõÞsbm{@QbåºD`ñîÏÁVAÏÙ6wd=ÀÔý~ì*ü$8NôSL¢§á·VyéÈ<ñ7pæÙÛ¦_;5¼àç±C§Uà¬lj'ª´j9=IÊµàpÐXaüyï@àtíã.µ²Tzµ°¾êÃ_Â}VÍ}ÿÀ«ýþÞÑ×^`Ç7õÜG@GäÆÝmk<3âÅ®zw/n%ÇÚ6ëHR9g&°Þl?g±âúYâgÚg~²ÛKý¼¦ékÞKåaÌ7üYCËÉN­ ±=H¾BU¥y,EM²GAn9øÇ´Ù'ÕÅ3¢ãøÛº-«-ú×$òbôg<î{åUªG0Å¨+·ÑF©nÉûËÓ¢ñ:ÙWÉ[7=L,:Jß¶û=J¢6µ«NHkÉ°5áÙ:$¨´ré¥ÔÐ2/7~[Èu×M)íÓÚ/íD_¼®(nàcîµÍz'¿vÕ=H¹¨U/zAúq=JNxÊfy¨¨¢Álk´G¹µþÌåÒ±¢÷X°Ø=Hb4@ÏyÅ1Æ4È;~×ØÝ7È°V=HRx=Hì(âECíæ4´|C*üzq2ý|A%Z=H*¾åÀMöUè¸åþµå¼á2óDÓ^8òqÀÜÊÔJ6ùçùÛ/æðd¿swjæêðô÷=JÍwùQUÛÓBâú1=ImÖ¡ ?úl»´,·p­½ìÿüðµ~D¿`¿OæZkÛBkÐÚKNh³æ&|´wì}-&w=MPGh°víõÄR!õ°ü£çRÛ;:ÏÑM[Øë'^&MS¡Û_Ú=@Á)òÄ=}3g]:®Ad_@ aó°a1àÕþû÷½øe(0y62!ì3£=KuÓWoymõ­=K6T1«ez(ÄkIÿÇa£¡sÅÉ]ì?¦lPe¢h|Oe£=HDö¾:²MèàTwõ60u¡4t¶oZ_x7ÔÒkÎÆ³T[9±`,Ký=Is41á=LxEjìù²2{¬Ò ¨7ü=@ñ:èY=@O>Ãaü,V=HÊð½=@Aot>`ñôgOô#îcH)B~#RíSÔß?ÍkFÂioþ)r#¥n¬ÔÕ ¶=L¨bæ9{L=L¤à.Ã/C×2ÕÚ5äG¹#ÂOla§ÿÇñ.Hefâ]°xé¤P=bèkï=Lèår¢aªhLV¢G@wÌï±ëØze%iæfpU²DWüü¸_÷Q5á{î÷ßÞþHñQÙM.eµ~4tV¢iW/õâ­e{C¨¡»n¶>e­Îf8¥»w1õ®ãß0N]Ü¸=bÖI6)®þHQ­=I1 sÅ=M'ª<=JC:õQ%ª«t'=bUÉ}Z³ããAªüß==KáºíßëÂ661úÌ=L*ãw²àFµê`_ ÎiQ¹ =J,KõÄ¬ùÕA.¥¤wICy#8ÙøI3yÑãØÙÇe³;Çh}ùú¾¶+=Ja´E/È7Õc@ÏU{/ÈGwØ)¾êø´¿£SZSA´ûÙ=(Í*ç¨â=(Ý8tG¶/à°±È=H¤®áçßÐäó%w=û1ç×F¶ÊpÉÆ=K»Â4ÀF8=R§ð'^m!£W¼YªÓÑ¨/ËGj´/ïQuµUI*åÍêò§Z)^ò)Z}£áÝÎËvÜ0qà£g=ÿA=J=HH¡E®5û)n£áKÎç¢þsÐH hf bUÖçE-|ýß ñÅn¤ÇØ9A !=JÌ¬Aç»á³P¾1X¹s=}jq­ã=I³YÓéH;ÆtqÃ¢Ôm=I·¾E¬+nit*©sX¶Ü=bÕ½ú£WY¢ñ{ÝPÂª=I¢Á½=KükazÓ:JrÍÿ1=IÖV¥ÐÓýóDßIûÉÆæ(ä0=}È&.+¨Öd¹éºUI*åyâÛPÉPÙ(Nþ1X^ï$=MÏGW¬Y²Ð¶îê+û·3ÍéiÓÕºÖrñ³êR¾ÙK9ÜÌb=bQG&ëÝÙõÔáI+NU=K¤å¨­ñ®|¦N°Ï oâ_E*6Ã6.ãq[å¶ÏéiªâJG¬nùsñ¿ü5-6«ýã=L×C½°+ÎUI*¥ C°YRU@×,5Tp :oÖöVp,,+^.â:¸ÙñÍz«@Ýï¨àæl?k¢<+³GW¦~í'æ®$Wx¤50ÞqÇ`²UmÇþHØ.Û:pSFq·_B=b[¿Ü«MNzýFh=br:ÒÒÌÂHåQ=@´¿ócý*&Oì#Àd'UMi=KÕÇq:#åDUÉâÔwE-oJÑÒd¸ù =LåÕòÑ²SúB^xëÐH5f°®l®þö¤=Lß=KS=KÝÍef&ÍòþÞ8ïj ï_YváT°­2éyÚøjãÇ©ÛRëÃ_Q=L9ÊE=KÙa|»ýÖYpK×Yí«Õ(ÚcÑ~Zoï<§ðÿM:eø¯jØf°nüXOÿ|á¼ÇZKqV.ïØ¹Â]hðH=Ibë=}w^O´øéÜ«£ïò#¤xEl<tVÏülÌwJ¯½³¹v@|Sh¨ÿÇêu=Iàáh+÷òE9B(¡!í<Àµ¬ò6ð]nà(Õæ=í³^U^&k@üHlÞÉèZ¨·Ó=K÷Ïª<¯KzIR-QV½=HþCSRÞÆ=I»kc5Ñ,äk5b¤íp$Gû¬¬þ.Î1~ÿR4§¶$1;ôÕ~=I¸=K>Î±ò¹e}ú-Àzuö2ðlqø·ÈDBz='éöÕø²£¦#@ÆôeeýljÃáõ¶Üu©ô=Lÿrfþsô½I´©ý+$ú¹Ge£'rÌÛkGz[*vLÖqi=HÒÉ¯ñÁÝéþ»øu¿£º7~¿£·ìB¡¤Ù2$-=b5i3¥¢;¥øÑ9a¥ÅÚ;ö.°ÄôlÄ×8ÄL¦ÍºúíÄðMH÷#±=MW­?'¹*ës¹6ÀH©C1Æjî;ÆÅ1ód4ÇP©o²Ôeb.RÁ¨½ÒöDÀ¾»íî£Öeq=Mn0óà¦ñùÑ¼òÿ=J²¤°S2¥³%¶¸Äùy(Û>=Mþ=IzJ7¼Öñ=M±¨9è}7ÜØø÷urÀgÛP]Hr®Ìñ'qh®Ü=H¥x£8$zQ=@&)PÓ#þái~vR=MnÞøîÙ ®ûË=M&ãwâC=b²»¡ïé¯¼Îl¨¹{iÄÌVívQé=@R&ª¤ÛöïsË_=J!ßòúXyæ*¢Ízµwcs=J¯|d7=b~©÷j¢=L=KÜOF+õûCgwF×P(ÞÁY´ÃQ®0>=@è0Ì»ÇQ¶1HHßàÂ^6Q{êÃ´MôÂüê¼EÔKi?4K{8n¼A=H5=K7¦ ç§HÉ¤i@ÐJ4nfÄm©ÜoÒøp=L3¹oüMH*ÍòY¶·Hr49$DÀ<lAWÌD34x_W}éRC¶Ñ¡©d½ÀZ£¯ÉùZ×RôçEPB¸ÉÉí¹¬iÅOËÑY+¦RÝËÏ=M/®³+Íñq=MúÐ-[º¥6ïõqNÿGÈ0CøhQtÉWvãØ&ÃþóÆpÝºMîÁ¦I©,É¤jQÖ3yiÙÌûI=Jsì(K¹ªÌ&E9lòn=IþÅâ¹Õä¡/Æ´ï÷ÂUÁ1ÌÁ=HU½öñãÜaðHZ:·Ø`<=bF¦¡2ÐMÁ3:=}=X¡%Ü@%ÓÐQ!äõÖz´=&ðì;tüÎ=bûGJÍ#FfÏ#Ýî&Â,»Ãz¤UW® SA_¥«'äÍ3+ß¡íø-·Mð^¥±wÜ¬÷øæì(/äsý>öîXªYeèÏäÐ·@B­]N¤6+k=J6<P[=LGywðR¢LÊþLÑÎqÙ¼ëÚéïÒ=bC]þ 8GqöÏi¾)¼Þ*fag(B_§s¥JVýÞNb¦qaÏ×þ!?ñwQA!ïö×RAý(=}n=@<úGÞ¤¥[*Ëþð @p»±< RÅCô«PÅÿsò{Íñð§¬ÛÿÛsð3#~IÅ0)©½ ÛÙ¼T·°Ô}j¡hkaÜZ=I£ ¬(^HÁxz¶h£{×Â^²w0ÈM¦ZA®PÁN}&-Ä1£Ê'5K$ª7¨f²Ú`©Â¼l¼*b(vÑ¼Í[¼ÂAÓt=}¥ÒüÏHÛÚ,<pªÏ[ìjBtÂæ´öÛ¿Îãøëz)sèÿÁ^=H-ü>=L?å:¯ý¥zÕeµÜWþ«+;l)Áè¬Y=J=Hv«°«q:hà=b=K,ÈLZàÐA)óµÚ§üyBþ*z=KÕãk7p,ãª0(£¶=MÊXôªVÊ:kðXH.q=byD'Ì¢}A22qCõ-K<5¹Ìä=JÖúxÓöå+ºm,+ú%ªDÔFrr±DÁ­&'¾êÅ=bô_¹uG¸ç±Ð©ÙÔ×/;KÝÍiðËJ°tÚf£EvºGâ@=JzÊ+L=b.=MÂÉ¬õ@u1ÖÔTe0B¼Ñp=M&ç9Êõh¶®Ü¬ëÈ0|#$g]øUoHB¶.'QþhDÝCÇ;]ès6z4¢{£S·J|lÈ?Ð¨TçJ,Ô`Pè´.á>úæ÷Z²Ý^¬ÁÂìØruNgineTïÇpñ=Ló·¯I¾ÁwÍ©Ízº|¼U¶¸=@ÞÍz=D1=K>pû÷e³«·mãõ|aØ+ÍÛ%9OgÛ})«»ÔÝ­ápf/5ûA=@K7.§ÍóÊ!Ög@á»`NÁgãÊs8ÏÔäÖ½giûI[+ìøpO,­ïÙº3¿T]RI8ïb:=@ÄÙÿ5qÜ´¶7=KÅFH+aUX­Bñ§pM¶W±Öü;«ilG=bÃøë)S(kêÇ¡¾WÈ,#Zßä|w7öGÀ8qq[BÛ3?cWíQL;íhW_m4´×õÂWi}°ÙOÁ^Sq=@D|g4~ýYc5n=}ceN5èwé;p2(EvpÏÁB ñæ=LéAÄÉúN&íCÿX!¤m½Ø:ðâ1v00?`Ù÷'=b]VàVRÂÀàHò ý®Ò}ä/XÓòw³Xá«BÚªT½[úèK<£àÛoõÜ¢÷ì>Úòxf5äsÄên=IÁÞ3ç¾q®þúåç57«a[ÃsH¨FÈ´`­úqä@T=^]¿ßÎW_6íj¯*@2T)-»MUmn÷Uªdo×D!/óêÄâÔ,cýEÖcM1ßqÎ[=JZ2~·çLÏ2~LnépËi×Ãä[±4¢ýÇ;÷b¬(ûîlP g>ûg3ô&$vb>ÑÊ%,á¿ÊãPÓUÎ[ê4À;¾15Ì­áµ=}Î1Qâ¿y¡×ôÐ{ñ!Ykð=L?õk]D=}=LÎDóâÞ¤_4ñe[øú ¦¼î¶¹ê¿-Rà`ú;âÓ=ã*ËÍ¯@Õ,íVøÌÔêUoD~8«Ã&®U¼D¦5p4´,1([ò-­üÚ<ÎQXÏ¹ÖÈ¤$í*Ázt¯õ¨]®ÿÿíèÖì[Ô¼1dÑUúþRåCÕN-¸$£¸!:LíÝçØM7ÁâP«0¿A½&{ïiñ]=}¿Ûu#kw°ó±]³'SXõ±=KOÕeö¡ÚæÚ´¼ó.ïÝóï@N«MzaÍÑÓ]ýL ìOû%!©ãKÜPv1ýR.ÿÝ¯at!SçW2ªë^çPßÃ¯atIúð5îu=bÃóÐîÓÄ³ë)ÿÝõ0Ñ´¥&V3¹3z¸ëZbk;Ù%ëùºÓuüPÓF32¿ÓQ!®üûl$þËd»ø6Rµ¥]@eÐ=}+(óP5]F}Ã²ÒÏ*ÑoÒÕ¤0Ô©¿ÅJlÉù w=@©Aäi7­Aäi@Óy=M@®J=Je=Käî~á¼×yÍ§]±vsåÌH÷+&Ëa-iÑéUÙð[°3¼jæfa®$ÙîÎ½«¦Ý·´^[=KkRÁõé(.=KgD½`µLËô=}ÒEd%%EÕBGQ2!Ì=I/IÒÀ¢,ïÖ»x^Æ¥¨ µa¤j?òÁýTÿU/=MâU|þQ£?bÏC@¼T_/rNª{2è¿£$þí¬I=I½ÇM¾ÐæÝøÒ!e¦ÞË=@ÕÀ/ÌÜLIM8f6h_0;ôÓØÉk¨ìJÜ;Áè-ÐºbøùsM@R>=L/NjP¤êwfB/pBCNXFGÒ=H×m¾ÁÀ1µTéÍÔãi|±,²îáôî¥³¬êÎ=}ü ©éÌ² ÛNõHøvhûóòþyKõI®U¯ê¿X=MR.ñQû4&)ÈÊáË©R»¾ÑfZË.vÚòº+¹Ö(:Þ%¿Æ$ê=}ç£m]Ê×á*Ô¨,)¢{ZPÅ$=K÷USQwFNu©;4I»(©»~Ø=h=K=H£¿Ìï¡kw.=KÃãP)ÊtÓ×Ñaw55`SÙbk²²;h·ã5å'=IºãÓ3Bþ£sa*]ù#).CÕ©ÓÐý¶òB=b$¯ÛÄ6<¯Ëp=Iü`kú)mßs$Ô>¼[ÍÌ/ü6>ÙN³*}º=JNïX?â=Jíy£»0I7SUù3=}»ëÆ}ÂÝËûç¶g~.=@8·FÀK<Òõºó-»&=I7ÝTÚpßmÆZ]©áÃd}EÏ,££ª3ÚÏEÏ®£>¢ÚÒ¢>Ü,%Ï>nS1(_1á,o Úh8Úß,ïîT1=H)ÚÏ,7Ì²,÷16£l1N¢ÖÈ#k°ËÌXo¶ìwé¾ó#®Ú»£þ¾zµ,÷ÞY1·ôàÏv`1Ö-Ò¢~L=Jå£>µ,«=ìHLé¿4*£Ó!÷ÁèTHíýÇI} &Å[#¡úkÚ,ð=Kg¯áE=HvÚLÈ5Dî=@k¶·JßÑÞ=})ÒhQÇNì£qK½ûÈ¨[»,ÕÒ²×Ò=M@=LùñËj²ºàØ@åÚË=K0«âè=H]õ«&d=KÃHrPCc§K=KáÝýíHõÍÄ=M!P@ì^cM©éªTñþÚJH©cÕË{g(l¿¿¦w=}{Znzò7ï3Ö§C1{0B]ìdû¤­UeAbèy½(¦×Å¥ë%µêathw÷c7ÄLÓ=K*=}ÁFâÀExR¤»²=IöÏ¹ w··fº4l?Þº¬f;Da;ì?øÓÜé,J<tîTüð¸XðXµXà;eÞt¤-.?+nÛÐ#lûÕð`/èÀéÚ÷tôÊfEõxr{%ÜùåÃCBz.½çY*¯°5#HÕÐI¿ãC=K07=é%Õ±öQ-A·6së·ß&CC'òb¥ôërbj@Ù«u=L-TyáCR9Ö.óí8dAWwW0]2pI[ö*¡pð¦[PäNÓÇ·ê ÉáÆé©Ð#TN~ëî­~=ó9&Ù=KãR¿.ræ¯toÝå¬âüÓu[e¡Í*[B{¾14+uoÍÂïÎÓê,=}î=bÌÓóê%(kBN¿2IÌÏ/v;Ájo@Á}©Ôê§Ì6`,Iý*BË6º(OÒÈXü$Y­£>ª`Òºô@=bõ?ÆÀdm%â¿²¦­¦øÙ=Jü:®È=@UÇÝö9ãÜMèh§tCÍmâØV54t0)þY.=Iwì=}ÒÂ=I{]U³kO<ãË´_ùàÝ²iÚ¶§=b}Ä«óÆ)çµÆò×}þY¹º'íB»P=KùG$À¹Æ§LM¶_ÁÄ=J,R×¢_Câ×¾þa;&NÇBÖÒ5HýÂDÓ§ï'ÐBì¸¤ùGf¦B=Hí=Iávs×¿k]=IQþÒâÿèGf5¯rh*¹£¡Mm2¾!PÃ2µàó|ÚµvÍÕÌ-ç_ìÚÅPÖg²UÕõe°§¶buÒÈ3È±«çgPá|Aºô§3Íå=IBÒù óÈ¿áÍýH'ÈÑð]gÐ9ëQ¤ËýÝ_²xè2þäÅ¹#TûjÝUÎF}ºbsGg.¢,Phº«}bwÆÃÃYíÌbýí`«s=@¹ê:¥¨I]ÜFBãý¨³èìD·Ö=H¬?ºý±æÝZÆXÌ¾IÛ:,ÛÃ+$Ñ¹ÏÏu³3¬Ne=LËß¦ì?àbûÐPX#¨Y)ªxýø)$âGý(=b»ZãTsÉîÈôIÓ/½Rw|vdZ4]ÞëjÌÌIq'B¬_Är=bí·gò3à¦²BÚôËÉã'f·äNÏûå=IYï7;Ò1jtÞpp,(],£pV:ÀjsB¬PÝpÕ.¶Ü£=JûÃ¢®Eê»¦>n²_ÄbåSÒæ=KÈ»:æúL1Æ)M«À c=H0hÊ6`Û·´n±µq¦[ùUÑdø<0´Æ^0´^=Kx0óû3@ÉÚÂXLênüåFGJHXFxXl,½ª:5pÇmø}çá§C,Ô£ükÀ¨<OµçÆ=Hº:«£z/ù?xÒ=ò@Gqe=@Ýâ(_÷=H`É·ká4ÿl§ºâ/sP6Wá°¬ÂaÛÆÓ^ýpù+{=IÌÍ/Fú±@)ù®0s=LýÍeúãÆIáÇüÔ°6Û,yÎ=L¥¾âA>Ö¯£åÓÃºLßJjV+¡ë-­ífÅá·ôåEþz=IÛ¨zÎ¼¡Jéü(¾$_òÉûî;þ_ÞþÎ­?rAÒéåfó ó[(G.%}BómãÊX=@<ïïB'ïQ7aZ=@pWaÀª´¹m9+¶xÝ½gbnVª¡'èË=}íºpüc+VdÉÊìû=+¶Ã8ß6$Ð¹Ôýwh?«·¯;d@Hn¨yxÈñç8=@»UX #_â®*-ìÏâÅÄã|°A÷(¾ÊvÉE(Ñ°~¥>qt¿-[JÞQôQátë°ÄL¤B -lÕùEKeÎ(atcíÆÍ177«8þL0ENVQ¶÷Ö3Aj6=IûRÓ=K~edÀ»@Ôî²¼©®ÅqìGÎzÏ=L=}Ù¯¬èø=K§ÚÂÜÝË¹ÊÝë=L1MÎ®+=@{ÍÎ®Ò®³:ÊÝP®'::TÓ£,+ü/1-E~ñ'ª³ò11=MÝMååC³ò8-o/çüÍÿ8MþÓQh-íÒ>1Ý@ÿ-Eø(û:Û·ç'û:Û·çûwXÎÂ ±PÃXí=}Wâ8círàz0Nö<å=Qq?øî-L¤ºAûV£rdB ¶=}cn²¢âaT½®ÿ< ÿèK±f³ôñÑT®=MËa=}­W$u²T®Xu2=D+<BîL·áf+3ÕÔÎN±ÇõÙÖö!c¦*¨5SµÚ¹¸E`4eáà©åªn¤?Îh°º¿5ûöaÌrqÆeE½)»¢ÇÁ¯ðu`VÛ!ïAÞ>(¾nï£e 5#õQ·.ùû¼D7QÇz¢#Â©Y¯jÞny×+Rr¶2õN¸¥ØJ»Ríh¨DHC°ZÙe~ÖY5ý=Iág g{élo³*ü÷áP¶<ÆD#b÷^¤XÞ °Zç=b=I/EÇß5=MÎãõPØ´ØùÒoE+-AýèH2míÆ&é÷er$=}vcMØ9Ûó÷; q½é*ÄQg©Ð2qRrÖ¹cÓ-±ºù±_JíÉ@KèC3ñQòúüþ=}<, 1í¿ßÓð?¯<ÖÁìl-U^Ùn4-_]Þ¤=@Nà¤Ä@ceõ²Á=Hr¶Ð$=L÷îSðMXÝ/ÏÕ7:=H}òlÎ ¦M¸G'¼¡+ðÞáS!=©ÌÕü¦+)F°ñØ±D¢î@Ø»*#ã½Ú}óëf»nÎ*ëtñ2^­y[¨ÏM^_­%NýHñ tkb}öZ.jÖä÷vî4/çðcì,[òß04&wDö4$'óÏnÑxNµDîÜD.»V=M7vÎúÞà7V4õÕç®dÖØ¬¯¬µ#=IÎÖ{Ý ãuÔu¬uTyþ!ý½ÞeQ|î0ãû÷^Q(-²À=MS1þË¡R8r¡ù4ôû·ø-nIìÔ=L%íI»ÇùA6ÝS U^nÂÿ3](ìI^Eê=M{:j²é=L=Jþhôð>ñ~ñ4Àø,ÊÂCûÙàqw=Iø+LK9a©`÷oÜÐf­÷< áYï¤ý¹Ý=JÒ=}¶§j¦cò²ÒTûá©«ò¶,=Jj[ÙWWv¡Ü$êýêç_=L¿¤¤½iòé`.]Ð¸'pKØ¸$<L-¼n²ê¸Âf=JÞ^îl­#ã«rºÔ^ÃxåÌèþqz^>zlH5v7¼{VÃÀRAH¢Õ=KtÃ+õ¿Þ/Ã¨3Áä=}²øÓl³cþÙ=pOCjóñ=Mt»íåp=I5Q²Û.1a/ó¢¾óÃL_ÑP°|KÅPlg¥ßÇº>²Ë_¬YéºÏ0LQýµîååê=}ÌIñSÜØR5ÏÜ×Þå=H°Ùp±¶Wá¬×¯1=LõìgÖ¦³^J.¯ÌFÕ1àÑ`8äâîËWBÉ<èGw?bÐm9¯zN$y·M¼ïCNuo`»Á~öÆ+¯ÅÙvüÞø>Ô®}=J§ÉóÁ9á¢k+&=M=J¾¢r[Úá=I§Ï(¤øí1.QBÛ¨{ÉWÏX>6JèåDöÏÇXB*6¤«º¾f¡ªK¬@ö=Miq$1æ=H #L<Ðø÷ìº§=HjÀgvMßÕß£ön§òuK]ï!²/16·ü§~Z[Y=}=}GPÃSM¾ `AãÃ=IZÀG=LLðíÉ*ÄT{!_Ý@ásS©ny&°7¢wèU§HòåØÿ®G<½§9|mÀfG?í¯. ûÝ T8øÛ÷æ5=@«oÖ6æe'æµdöÚ?ã?o:÷8k9¾Xa#Pa#ô¯¯¯îÓ,ãÂJY_º=H.z¿S´ÀeÀqÔ=@Áú¤)ü¢#ÁGÆ»©l=b=IK=o«Núçøa~´-kj=JÀ½#pI(fgô=@=]èBV@!*ÜåUýøï8@Æä5Pá0ñNå^VyÚaroþd5H!¤ýÀ`(´E!yNsF¡:@[Ç/3=JWBVA&L£Ð2W·'u:C«õ1?ÇÞøÏ$Ø`©¼zûÌ]ú³¢ÉÒWo¸ÇVØeiÃXBN¦°÷ GnHQ®¦,&ÑdÒn=MMTIô¸ÎÄ¹I,¹²Å¥Ò`¯*Õ ÏU¨Ô=M­µÆ8oÌ=K­Ù+AP2ú&©we#kÂg9¾¥¦H(¬>ZóFüS8|àï8.|8=I6Î*áÇ 6?SþBfß¸°J¢Ãí;n§pY«lÿbáfØ*½>²=JØ&º¯ÖM ÔAÔ=39ÖÖõe_t¸Ð!ÈÃ­Á8'LhAÜ¸P@xÏài8HÞyè=JxÓÖIF=H *=Irà8`~CKk=J¨s«ÈzxýÎÕnnlJÆü=MXþ¡«üycºò:Ù¡Â³%¤áÁÏð.+¨z7Ö=LÖ¥IÍÄ¥Ä­Ã=HÁJÕ3ñf5T:¯úaNNúÍ×POÑüëÒ±áOø=K?9¼£Æôør;»iÎ¿³ú9,Áaù÷5îôaã¿òô6Úvfé¾¾C=}%ëëQÜ`¬Ä©&¤ðº·«¥ºtMã,ÚK`¾ï}iÓB.È)´=@}ëª>»çflÛÃß×cc;Öë­4G/n«`=MÀ{V=L}è¦S4qýÃÉ  µ¼ôCNxÎ|Î§2£È{Lwø°î=Mh¶Ç¢Vatº!ú>Fêä|=ISÓ%u´êt¬÷;iÖK²*Ö÷±o5ü8^}¯B»(,ø<¾!Ièw8éÑoÌ¯q÷~®ÌöS>±Yëó§²¤Ü=K@S±Ýù=L@¸°w!÷ÀvÏRF¹ÏwÍ0ý4KÇv{±f?Ræà¶Ñª*Ä#6ërÈ[H%((ï1©å5-Jj¥.#üdã8ó&i­ÄëK=L`~Ö¶ù¤ =M¥ÚÌxO9ãBæ#s};ÑE«~]%hqÀbö6)sÉjb8&=HmÒÿ½~êA¶<¶¢*y?ct¥[¡¯½êlv=b²¡<ñÙ½üÆck=H{òÄûã¹¿ë*ºÃí3 (åQ¯¡Ýôäíhbx¾mÙ¿¶NGÄ·meIw?ª¹é¡Á üÆÂ ÁÑ5¦aoZ³Å.E*æ3(z¼BÀUofkTM^­J¦¤.º0µ_éÚSÑm|æaC:;=J50ö©c²´=[Fïì³N»(?ò=HÔ®=@=JÛÚÿ²øXup÷gv(æËÛyÖçÄ÷/¿«*é=LT;)@ÎsïzB¨o Õ04ÞÑÛì]Ì¦ôåûQò¼æÁÚ^ZñOî8/=M¦;rÛì@®9õÍ9Ó£Q%©Uzß@í>=}X4t·P=õI*U¦|åî~OXþ$râÛ[xûK==H] úld)H=Ô5<%U{,4¤&Ð+zzÅ×:ª¯ÚlLLý±±Ác³S&¬àX&ã0#ÉÙ0±½5{ÄùÓvÎ#ÉSöô5|jçC@æ¸«ª=Jv¡¯æÂ?=@üÜ*=L6tâ_5¡£¥÷33#ä#eÞmM°=}NS7lS+ÌöÞ=bv8+ïÉµ=MFëx¤E¶w)õ(ph÷6}ËÑÉD6³ØhÔÊx¥CøMe3¿F»=H GQ¹âA'ì£Ðwg?Ê4lõÅí]ÊûFj-jD¬L;GñÀPØM²AVLwþU e·í=bbÀÔ»1KÊ æ.×­Yj¤»vsì¿uýv}ýT>@â_öúyðÁWT¬ÉU0Yý;nôÈT|½¦Z»Áh·X¢@çz8 û$êÂ¯ü=b7x?ñÂTýù6!ÞH3ñsµ°djý9å=HËõÞZöôl°Í±Îé(ÅyÙHðÂ9=£õel0àÕr0FÌé(¹ÌCü;c1­!¶¤¥³{¨À¾¸=b=I»=b/ Y^ª@­e/{=}`1åÃòËÉsäÈ# Ä©öO=b=Ìí×í',Q¥anðNµ»0²±dÄÞL| )Ì¢dÇMyíÌ&4ÍxÔÿg¶òî=};þãbê|OÞ4o{Aöã<ô@äbÁÈà3_8³Þw4ñP,}Ô¡Lº×=Jëj!¬HSçÛ°èG{ðí¼#ù£÷(Ñ3mWÝáìµobÍ7YöUX«uÏZ´?lðëP÷ÇïhExA'´=@V_7Ë­Ì×Ä¯1Ö±N9(øâÊÐ(Ìëá/s@W³¬þyÞä¥ðØ88kêÜ5ÐÇb##=IìH5rR=JLñ7æ¡=IA=IÔ®vÄ[=J÷>ùzÊ§4ì+½ª=JNÉÑ4øU-@}õ1òj÷/=K¦Í.BÄz¡ùÿfå±K²twÏS÷[¡m»ñÊj|Hgè³=MÁ ¹s2­À¹ÒP&×S^¢8HÊÁrX^9Û»»u~°î0¶¹°¥&Y³µlãZ[¿µ«6(=J'È`nE¬jF ¹X¢=I-âñéÒÚ}SëJèC kÂ¦=boæ*ó×¡º®äÑÆqèkÜ=HR¡¤çË¿ýéL=}O²bù.øDº­q®>?é(â¥êPØ}`ep±Â±1­Jõ=K2Ò0j#øR# lÉÛÓ»×õb4õ$-°´a=}¬©ÉNª®=KéÇòNÉöw0áÓ{TTN|=@:f¦üæj.=÷-J®L²`h³ø ÷Qd¢n«óhoø=J%vÅmÄ±=}º3/~äÁ6,9Âb±nP¬$ÝÄFÑAQpÈE[-¤.u=M4ÄrWÿK¹mu=Hð)!49¿}ÄÔ¬(ü:|y»¹ ¯¤Úª>Ýù¢ÔI~¨{ß7­Òö@¶ÃNØÀ½M;Ðsÿúi/Ïé¯[&õ/5Sµº×¾|Ç³EÄîi=b4ô:è¤h¨¬äLºr.N(Ï¥lÀ«þ¢Á.äÍd)(I8ëø(íÁª=Mêíº/ð´*ÊßëÑí=bó«ý2ED¼Âj5}Ñ¾£ôàq»Dö=}vk@{ÝjÖ¥ÔwY@o=I8¶=J¸GùmJ<Û)oÅ¿DÊ6y÷=abó=Ky´÷'v¬gGì%4pÚ*íÄÆó=}Þ¤HäùE­1R©IÌDØbJÁ#ùói½àtÃ{É¯¥?qÊ;÷to±ö¦c<98$=&PÆÂxÊºbrË×ÔÞÚøyæ5ÞpxÏÄmª±6HH¤úCÇÊ´a>,âWÿKã2ÑyÖwÐ2ÂGùme³°;=Iior=¯Ð¶Åüèò`ç=}Î(:ëáJ³øØúZÐç_ýðÅ¹lýHkÏh=bN Ñ(23c°KP_§Ô}¤1§ý¤aÑ¶/ù{áJ­¼?yb©dë¼Û}­Ñ=K©Âycço0©Û|efåOþú[ñ?²Ì<¤k£;l­Î%N$µ¹¯²É~Èam>]äqpÓ7º þä2mà'ë®Ä#F²Û°9=@4ÏNE÷çQÞ5ýóÔeèÐ±ÀüµiµÃ2gÅBªÞ`/g1=}·²ó¦]ÿ]=by±£q-N4¡ÿRÖæ²³Ø³Æ0ì'B$GÔ4=M7Õ_:=MÜqW+=LRÌþÕá=M«.ìEqÔ«Ø+¡9¦®?==M<,ÁÐ¡ð µâÏºUL¥¥Ë¥þ}im3mæÉ?¸¨@}k<ñ©ÒÖÅ¹ÑèîÎ=M÷½,]1ÎþÕ=LæwÚ¡>Ê±nÈö÷rDIÂ|=Mk)YHÕdÍn»ñm,¯}À*%=î $=I³Ù¬ ©F=I$÷GòdKäG(Th×Nä'1ÿ£|3Ï¬CÚ½ý^×ÌnKä³äà3'9sRrIÀ=J¸|¤°çXW`ÀíÃöi_@9-ªö,5´[`)æ7bÞ­ùßzîu!À=J>=°ãú×drgÆB´íyó'ôw=}oáñ¶}wÙGjF.ÒnÊB@g~ö_£=IB;Buþ=I²Lò$N¹$Õ6»{5Ñ WfP{øz¤¹D7§Aû)=Ms5ÜÓ³Ëx=Ålm=K¨Ho fÍî¤©l=@%òQýbVlûÇÅ:n=I8ÅØ'ej!+Ì=JDÀGÏ<Ö6ÄEL´o]úEÃIëyÍøz¤nfù¬<ÇeMÓ)¤sx%Á¸ ¨w¯Yø¾Ñß&|HÅWKñ«ë¡VBYJb@«Yå¶7Ùß©¡=HÞÔ=IDa(Àj?7±ä³g}ë-øÌÄÓÆ=H»øT+¾·î·ÎHþnõÎD»¬ÐÌOvÏ­^Ð/=I&ÐÖþfjî4cÌ<®pó?N¤]q;beäZèøM¤üó7Yõ²ôz¢YÂºÀ:~ËE6$³a5=I?j¥(wgM]pd®»®«:?¤ÔÁÝ'V*â@ò¡$^uØLìÅÆÇô<®Ý#¾ZïN-VS¾k s>­Z¯»øSN´Nw£°b/ö¯]%½hMaÀ¬£N¤?or¯c(1VÏA¡=H6}élÛÚ`bJ¬­±!$|·RÁ¿Eè#¤2Fà]|aÂþ;¥c>Ú2¦Ï.ÿ!ôìÕsüÇrdÀÍ<QÀ^E=}µG¶Ý>Npú¿èJrÍº<©Ë´:¯©mEÖëoWdØ4ÿ{½VSÎ9d_$)%ø=J4rD¢¬Ûús¼eâºgªuN°lf«äÊD$&%dÅ,ä¾^ò=Lý=Lèg;GJkcÄ·Î7Ä/#?ã77¬ã+a½rn~´½é}=@Q¡»«móÎÑ·¢kµ-Å æçµ¼Y=H1&£YÆR: ðÖB=}=tûL;;r=bû]§8Þöf½¤vp¯ò=}ùÆK+0nüuÏí=}en«öÙÌáÁNË¹!ûä¸EáÍ¬p9ÁFÆ!=Iº0Zñåô(=}q°Ý:&pdýk=J@iýË[ç¬±%BjM2 ZSERZ ÜkTÆ4ÑmÚDÎ$q«?ÿ-{»ÊA/jÓ~±CgSJuãÆV=}­¿@ÚW=b÷+ýqzCWõsôs,<ð95fÁÝ#Ùïe½¹>iÀ&þÄt=IÅÍùOhò/¹4?¦Gé)£ØÊ¼a*TY£M_o=}Û ê÷ÃIÓ6ñ)#dDÒÔÜ=}.þ8¡rÖ³£eøû=IåÉDâ'pÅÀV=bô±Ão»÷n S<]Gæ¥Ð)³eù|¯ïu%goWAÉ¼sÇ.ü÷Ì¦Í>=b%ö7K*2ç×'Æh0räÞp=L­}@Qp=@BÜëjÂîÿübSì¦A÷<T=Ø=H=IÈh¬#m<±=H&x©=b=@USÆÕ-x±ÍÄÞ²g=L=M.Âk+(Oñ´aªMÚië¶ì:g=ILª¢¶·bF6y%g>m«]vÌQX=J=@áÝò5#´äc¾9ñÍJØJI¹åàÂfÍ¹~é2ã=b¢sF9¾)`[V§OâºkÖÔyXFxqYmºÀnù?þ2Ã¯à®®HjçXÅ¬À¸mü`[î~ç/¡ÀÁí234áR¯6¤Ù;ÿ¾*¾­Ù¼Ýòþ<²±ï.2~ÓXÏ/CÖ/cÞ»?»4í=acvó½ð8*=J-9aÿ¿=L¤­å²J²j¯d©ê/ÖË&bÍðº¢ØS=M2Öô~©mu¥©Þ ÃEþ:k£Co®JöuFýdµ!.=Hc½÷ú½Ý%càMAf?=J5;æ<Ão7j(Å·kæy=@!)8GMÔS9+ºÑêÐÅã=MÁë]Ì¥²)£ËíÝUðY½=ILLfJ¤4ÙyC7iöY$,NY[mh®>rn|N*qw=LZèUËÉ¥±d°¥»7*ÒÇh.å  7N=}6âá8/=LB3%ÓH>ðð0äPÖR<¬d4çK¦km3CDï=@ÝÁ=HîÞûBdçúk4!/zº$·OaF=K¢¹:Î²ÄOæ<Çz5êî¡ï.¶Úò(=L²=bÄíÖËÇF#&a¹5]+F¹ûi°jú¸r4ÁéXÒpë|kéç®æý+*ÍµDAÚgWÂ~Ä=LRáL0w=H3B=K©Úaÿ?~wµYØ±}NX@=J×ÔÝ³.ilMeW;ñß#=M¢sZ!JEM°Á^§ÿþoá¡¹6×RsEÆ=L© &¦îø_B=?yO=L¦zÞ1N$ï=@s®Ï.úü=HÛÆW ¼ÜqãÇLpO0=}÷ ªØslÿKaØWÍõÖ-¸ÔrÕÛµee ~ôP@AÏ=LACNÞO.äåàùÆzGpÙr*wù°~ö²[Rfv²e2@kwÉ ÷=HÉ©FEË}s6oVmÆwS|ÿ²,qgÌôÌU-emÛÛÚÃBôRfÉVî_.÷K_ñÊmÈhlðî¿áÌ8÷ãyàâ®Þ8:/èh5©Ìm)·QKUsºo48*Xey@@@+áIM~ÿÅ¡®]è=@UTÈc;}éhß§¨È¤øoQ7~phí'mñ.£ccCmÂ×­Jha}=J³=@¹©`Ð²ÌR[Ú³K¦íüýhÖ=H3v@W¦ØA[p°(Vøt=Hb;ý}¯åøíx=H,|¸ôhyðqz`wBUüýOhN=H(ü²ÀÔ#¥dU=KÔíØµIÑñ=KQ}7ÁýåÑZ±G«½zu]o=J÷ïL|vJ,gf}Po/Øæ~Åø<PyÜ¶úBäã£[-×6çn?5ûu³fGzº{V,Gr¶ò9ÉåïUù Næ¨Å|ºó6èA°øç~¤.¢§cþO²=`hÈû lóà{r8Poìã¨ï-?NY¶;QaÏ¥]ûa/zìXÈÿq-ÖDi;¢ÐµD®V'kç=IPt¶ñÔèÈdxû,°å_m=@}uRÑý®¦Û.EdÍ}MÍLtH6ö|/t=@ÆeZ¨©÷ÒÿåÎÃ{Hª%`fô=HsÐø{ø=H5IÈoa}Èçxø%«(e=J7g~*(WàE=JÇÙéµj.R½õ¿Aü!æuHx=@Ñwï1AL²37ðÍGNCg~í#ÝBÜC}yÆ0io¡ç¿àM2!mÝ©Á¥>û)ÀLôØRÚßÜÊA³~ÐPw°|o¬8æn¶æ´=}í sÖ;i~RÂâ{Ö£AÅå8[°'ðÁUYHyº©FÓ½`°ô:ZC·â=I¶kÄÆ ·X4=b{ç']jo71AÒÄ(öÏ>jY=b¬ßôwSy0ôAqO»ïeó8¨èþ½¶&KXÍgi0 ÄCüX'ÆÍÞçîjw.ßBÏZeDð=KÓbFN.=@¦Åãä%C=H}=bs÷8Ïsu¦6ÛVz{uÜt=LçÕm§¢>tøöd{¿h|ÌJ7-éÒzå]B¯ûýæÖEÅó:PDk}ÖI½±û¶ ï1r¸À/ÊïûzÇU=@5³°ó¦Pôy>-x=94Ex¬õ!b=}¤òV÷vÑ-ö·5k[i-^ £åþñd(}ÿqr;1@]ØÕóHÞfZ|3£gÿ@LIúþ#jÆægEïuëPgQþf m ªMh°ßp¾g9¬u¢å=IÞÛ¸o¶gygÑøÐKëöÌü^~°¯Á)Ø][­=mâ;¼S§F¾ÑKä/=b6n`Åðh´¤kæ¹ì&þèÀï*øié~ê[%MbzÂ;X(;·H°µ¢1óZÀ;0zµTPÛ¯èÀ1¢¾Ñ·¾¦â=I~AvØ{¥,W¤PHyM¸úm°ô°Üd¯hb=@¥C´@)±r¿Ú½BÛSÍýäyÀú;=H)G±²ä¡¥?d?kFò1Teë³H(»ìØ$¼{'ÅÔglØ'=bâ{·=bÙDl¨B¶4µbì0ç Úw=}=MRåÔ¯x±bEz²PÄhDlT{â§8UÃÙsé[p6ôDÉ¹È(ðÉ¬(u3=I[+)=}Èè:v¸Í{!É2£áôB=bö §ðwKËdÕ°H6y==@Åk=ÙZ³whH(V!ÿNÊ=HZ³Má=bðZ®GÕ=@*f=L^¥µ8µ_wJÎwXà=LpH.j<Ç=LbÓHc8Êb=K£gª¹HH=K2½FÈè<Èèp°l¶éªVc=LBW<Ñ=f(ð|¡æxnÀ¬qSE ø|©Â-V¼Iá«¶<UI­ÒSB¢µü©õÈÉÏúù¦`þÑºv`i=@Hq×¼&¬71N.ù>R=H¾-Îuh ¢[2ÈÌmç§X~aÝ_ªHl6GÖwìG¯À¦q=@níGÈ±@Òsz0­8d?Q¤ÿÐxyV9¿`éÑg¤Ks*%e¯=bo#à&î=I++øq¦$aØ¸fcík¤+UÑ)ã)øèAÁÓ{K=@6òêÌm=JÁoGWX1Ð/+DEÊ}z_e¸t[xüaÅ=Kß>õnÚÐåL$üÏ_YÄÙ´ÎÓS³i?áD ACÂ¯ùq§0(z¦±¾vEÈÀ=@k]ôðJSFÝð­~Òn º¨-]T=@È+B¥dµ-r/=bÇï°}#ØýYÇ¦ç(ÃJÅAÎçè&aýE=@Ã Aåör@e=I=MAw@jðzuô'Á®,·¯V«·ãð}ÊÏa´=@õàu¤J×©8R~æºöÁÃù=I<Ñ³cDed|4GømrBÅ*Ä¼=I2õ=}=K[xrØáÓà8~F¦Ý.ÔéT[K=K@:@î_ÿE]ÎàN{=I&xÛ(²GÜàH46þvDCM_pÃÅéÊùjDmßªsd*¿g+ß*k¾NÔðT°zÒ´ªªÎÜN=IëÏNMóq[Òù=J=IKµÒ:/=@ì:)¤ 0.ã±{íùÜ$ã,7q¬°yúõ+D½»ßEÕºu»#@ëha×»¬*Â³ÃPð.üÕÃ=@móCeîM&$'ø·=MÖôÝø×Òí°ÍÔ«LÚÆÆÝ_Æ²cûg&5¥äf´x=}ëÝã¤2Õ5ÐÐ¸8lmóÁ®ÜÌ=J©ÏnÑ³!=@4j]3j]2j]ßk]%å¥Úïð8+y(øÚ°Ôdjm¥@dÖ2dú>Ô;Ô7rXJ]Ñoÿºcäã[3Í;Jç7ßq_ã*P6.?ÌÃ(.kãDG=@wß)é9g¨B=LäÍUþÅÈX=}ð@mgBA.àL¼~fOüÃibÅXo)}å¥çúä§XWÁ'=H%ÿÅ2FN;ä¤½½5¤À½-2  }vP½¶­l=LßÉ%&æFé1Çe-ç7,[©^ÀòÂúe]x6+5SE5°o.(À;¿WÞ9ÂØA=Lâ=JVërïGhj©Ë¨'£lzg­Ô&z¿sÐÕn¿Û©òäÛJW¬*sK@^La7òCí=Mxvv°½è¬£&Kebè])bÃ=KVÝ<*ôC±Eg5¶ÃÔ?ñªºÇ×È«>dÍVr.l×=}+CiLgÞ=@¶7¡é¬Ì¦I ÚfA(äZ¯EWbë½B¿ýh¤Ù±aumÞ=H}NLôô}:Z¹ÿßáP}iË^)à^¥[´+Ý§ÙgD_%¾KÌ=JV´Ö=M]³~&(iöÀß¶Åi^ïÇ=J°EÏ0B?eýÝtÔt=LK2Ò=JçÑÃJ(wO:ÌvÉ¼7ôô}5krñid<«nkXÎÒßGJ.D«ÏÝ=Hü&)'©iÌÃÿâ÷´~M÷=KÜdSàí=I{VFûõ1×=}ÔËä-åp`f¶®Û:íE#¾+làSõßºb³ÃòÚ¥2÷q*«=ßÉf¸éhK{æHà^~³LÀÐ´¤U#mÙËFçF·ØMÄ0gß'=@b¤QW$ÎøtÑçÒÇ'/ë´7©tfÓ|=K7·o®v:³òkdYñ1R^æÐí»MnÖ9sÕGßÃ®ó=H5zÐýU£Õ=M=bÄº£o8¶ïX_/WuËÜìæñ3sËÜpZ/S·½þÇæÑâ,²Ìq}ªù©Ð=b¾9JðÏ9¨êiî3»ïÞ/P3»æÞî¥Þê idÌÍª}ø>-ÅWÜ·ÏÈÊ=HS.<¥2~¯]·Ì|,«b4P¤Ê¿NéGÕj%4`2^ºô£Ðó8­2¨¯=IÖÐ#æÁ&G¯.Ö=KOÈ¦=I=b·/lÞ)°NG¨%¥¼çfR2Ñx6oµeòÛ5gZî=Mâã/Dkjû´íÔô<as«nµ/@sâÎ¯ì>GèP.IðÙ¨&íÙs0nÁ=}!ü-³eâð2÷ÂÐÚÅ©[.ÿ¾F­rB0²¯çï3ó:AÂéÁÆæ}eV?#K1÷=bý~(º3Ø(Â3ñõu&R·b¡DíDípJ·âR·b9Ôê³v_YT|ô,ÿÿoñ]T5Ê¾> ¦=IcTÉö¦=Iîó=L¾ªîpÄ<dÓj=}Å®ò»»Å(¨Ê#ð-ÂÏïÎoBÂëÍ|Ë²¶È¡ ^Ãú¾=b>OåóVãtû4=M^*wGÿ!RjªÎ:ÃÛt<ìÐÃ~3£ÚªP¤'¤É_=Öc:ËêÙ´0Qó÷&¬í=IW}Ï=IÈ¼±*Í=I{=H û-vOÒi-ûI»}°oMóJ=ÕüLC!ktÎ5:¨P¹FêÄvýt»vFÌjý¨g1r ò ©´»=@©#î<´ÖÍcÔü¾j½.I1?¨EÅwðÕ=Lj2·«ÚìyAñ­xM¹=}.¯ñ|óÇÞüêãrÔ=LÞ¡§¶zp>MhõÕÝ³ÍLä¹g=H«írE¬î®kg¨Ò)Ð÷Í:Uî;j¾u³äÜ-Û³Ç¶ì.ðBi.U@ìvÊS»)­ó{Ý(rýÇÇÄ(ÛËW7ÅßZÂ61xÄ×ò®}ê>Ä¸Îº«¨û[ØüblE1<:öGv=I©vP*}?#Ûµ¾ßþãïCßzxð-uGÌÌÉ$á¢=}ñÎ=MÄM>®Xg=Jöñb^ñrË}ÂEêìí+;ÜÚbãÐÑéV¬SngàÝõ=}ñ±¿3ö¯ÙG-¨sûå&¶Á6ÃDùOsUiýs%kyD¦ð}êibkðüglðÇúØ'f$Àrr+¦ãmfÀgÆ=K7¢E¼`nüE=HH=IT°mF{Ò¨l²¬))Õjèv®õ&=M~½ì>xf$¡j­+2üçK»tÐ=t¯Ïö{¶(x[»äÐwR$íhApÑgAÀø x]!U°Gt¢X£¨knÒÇ.¹À´ÿ¼_^9tae¬ïMÔÕn®^Ü?çK¯¾õðâókÑ«££:ÒØÔá3ê§ÍÑwVÏ=}­+.tF=Mþ®àÍ=@cà,=IÊõ_^R{Ò]Ûdõ´qjdý6T¤¹fsGk'®¯Lb}ºÉ9N§n}=MÞ>Ñ¸Mí2#=M­ §ªÐùÝ!ÝKüoô³ÙEv$ñ+]ÿéÖ±öcdgmèKóÔ }®*f{¿Ù¡'÷É/tZðÏåOÕ^²Åíb¥ªzÍ=b¥[!§÷501(t}<BÏ[Ã®y¯ª´4¶=}(WD-FAøËÖE½ ))K]Æ]ì7-ÆÆti:©Às½ÎÙ®r&ðÇ6è[F¦qgGÍ^c)«¯Z=bÉÍ®; ýh=MuâÒ¢=J^ÝC¬=¼ü)DÐý4-În»Ö©-j=Õ¢Ç6Ê%éÄo&m¶°Üx/¤j3ER6`=I·ÔÙGJ# 'yêírÄì¥Ç×þðTÐ,½G*%6Ð[-q¶¼h¶£Òº?Ô!zr7âyoÈªx(I¡ó ÜsÙôÈÃ]ñiw=HÐÑÁÁu&OäM3}Ò~GMÁìj´ÕèâÈ=ÛSk¹ìú1oß´1ÙÖËì¶§h2º¸èÒê!ÌZ-=J¥+' ð01Û3áCCcÏés®Y=K4ÂçÜrýÃ=§|U=MpVO(ãöà3©=@nÜt,é)ZèÊPÐjqZ:%rØ±ÀùëÎõ±ú·Aòç»Ñ(nFÊ½³»Î&=}Ç=LKDS/Ñ§õs[XvÓÕ[p¦=KJ=MSDÄÅø)9ñÖÍ:áã¬¬Æëj­« =HEZFG+}?S¯í68ïí§ho4Âå*¤¨T%;ð9ø)Ä|=fp°ñ+!ÀTÂ¥E¥6äIÂT¦l/M'«dÕbQ»A'`{½Ëî£ã=b»é°ÌÅ°f6ç$-ß¤À«NÓá$å=KRã þ1Å¢_ÐÀý=@ô>ò=Iruo>úTøèçéúLKC=Jp··²=LLÚWLûõr¦÷s¼Qióþ8ïæ!PÛ`ÍÖ!0Í1j¾ÚL4vD=Kàü¢»=MÌ«j©QñÏ=@n­X.=}ÛüÍy#.êî§¯.{>ÃD ±î¾¯Ü!FF<¤=H=JNô%DA=}µp>¼YÅNX=I~çÏ;=MFöÁú¡ËM@ÿ=}Ay¬=LÌ,ß=J_ßëî}y.V½3Á¾ ñ´I>Ý©½SIÊ÷ùW=K4=LÁUJ9zÎEhÊmPaHÜÌÄ§r&;äOÎ²èx]Y÷]Y×ÐCîåt&|ÃþWÔÖ=K³Þ£Ì ÄG·oÒ^E& Ð*GÐ4Ù'Æk@1ñ{©GH=KRÆ¶bâÕÎ Þ$u0>=b*wÂÁû;|Ô÷íGé_­þõÎÔuQÎ­ ®K»®©ä×´Z»}¡¼|%=HI«M_Äöý×t7£Üö¶2Ætì7Ý¼&­f_½´=}Íº*ÓuÀM==M>^ü=@h<Yg¿JÌÂ%°hZ=IóWZlèÎ6áyM#J,=}5h¬¯úÑkÑÌ~õBnÜ>=@qéºþî(Æ©!õõAÉØ13ým º×JSðZN¥¢_~RIr;û]SZ©b:áTÙÆ6÷Fö6l3ù;Þúóuà:=Ks1Ú/Pª®-ÚÛÞgØ7F²ýâïâ¥Ûívp½toªpbÃ-ÿ=K/;ï52¸5P£X»cÅ(ºíûN=}q;ÿû°Ôä¤1Û¤ÓT?<ÞdÖÜBn²wkÄåNþ=J]MËA··B×7Oôcò>xÞ]õý¬ÝÆÅN=@Á¹úÔ®OyË@P´ý¹uÇ¼î¬Þ=bY)lõâ¨ÔjVSS}ðv#°´ôU=I=b75x¼îáëS®ÿÐà_=H=MC=K=K@T!¤,¹W qký WPè7@=bA9oÏ©»§ÇÑ%'CXÑqrpËIL½ancF%=b×ßtc~n§º+ÕmÃÔzjÖNbomúë=LÌÏ_ØK×ÜòÖÀËù¡v#A}öÙþÑfsi±(=K (±ÕóÜ(Äþ-;ûÃÔÉmó;¢$½d+ÍÕ¯=JZHføªæ§¦¨¥I»½½²ÊWP^cìÛ_§ï¸b;R»$*¬2+X¿+Pó±m©pöKÝÍÆ5Ú,ÇÁÓ¶µ^¢/#èûeî`aýñ?­£Xás=}ôÔ&Òß£}U0ÏÃåÀ/óôÒ_=@=Kô>Où2Lz1«-~G¾8zôÙW>]$ÇìJ¨(ÕulOÇ·àÅúÆ:7øÐ=K»5£ì­°;=Jk¢`ÎO.FN{-Y?õQ8­4hnKÉª%>]øØnV¿×m:ðæc=KÙ`:©6Ýd?XC©mÒ5tÈÐúfµWæúLKß=MOÈ=@ú?µß85wd/÷&? çævà@ßb¸áÈ×Èu=HNÝtª@í=b=NS­T§hnYÞÎÐ×i2·ÅÁ¨û¶ßqüKeÜ~ýØNæ]8Øbt°ywÞw0ý{vÙßæ¸ÿS~XnÅ!µ=MD)êË§GJZÝ°nÁUce0=M:PåûÿL¡A$ÿÉv!=J´nNf47sDåÃð3ÿ!Äs-áMIê|­!öTnïá«÷Í´>?ç»e=}ðÝ ôÎeOWuÚ7ÐEÏ%Ð r[c¬Ê/ï=b¯HG»r|âÏ°ù&Á$~k:=@¯!V5<×ÌÑúÏÊÞ,!T;EÜ¥ÌÚÁ¨òÁ×Èùýô^s8£¶-h´8^¼[=bµ0ÔHã²2=J÷p4]òÙæÏc¡õÏ=Kn%jUi-ÕöÐ=K6/§÷-ê Põ=M5ôpÙf1¤jtK`=M8^øF[ébÞ¡È¶ô©w8tô=HóÎiø°D=J'O~íMìÜ´d=JÒ{+^§kÒqß=}ça:rÏiì=KÞ5Õ¦nX©Ü=@Q]ÒÞìÒ=IÐ9Sû¬úe:°S{,)ÆÉøÂ>ZLY«¬ªÍF§ÙpIçR=JF=JP!76OXà=~!¶6pR±tþGæ;g³#ÊÇsÝu.=Jÿ¡!¤ÎÎàâí5]­u`=}êK`/Êö¶½ÙNõ8«GÊÉáÍúHùi4º1ÂNe=}·²BZ=I°ÜôläÂÎÙn¬dCÝ&Á^YÂëÂÊP×!løÔçÚÑHÛ;!$FRgäXÚåÀ=@nÞgi.à9æ¶«£:Ýk·BSòÅ_èÔ³u,ôÖ£7ZKÑ[§¬óüe¸»Fë ámpm2ßZ~µä=HD¾Y+îp·TÞ'½=MÊïb¯0ËmÕúÖú¶L±+é=Id>=bÑÛ27Ì pJ)¨=HDð +»K$C§5pE¿æs5xÎËÉy'5ä¾ÌN=L/mvµ±ýÌM³©¿Zîæa)Ñìp²áúu¬þFI{¨{ï²¿/$ ©|íµZð8êß§îÁ-¤ÁúïkÆÆ¾UÁ®ÐNlï x}ö ,©ï:L]ïþ¸^ÊND'ñé¼Å:ms¨ÍD¹H|=@>×Æð=@@¯H*Éh*r©ð¶Dµ9trõ,J«ãzpÝ´äç/rë±7R½øíÃ³Zs626Þ¶M¨*Ôë©aÌ¤21eñæ­Ì»ÛD²z{¼âä6òDIò££ØúIõA+â ÆÜ½±y±Q§Á?=Mîäk a?NYè':Ý¡ØP6ªÖ¶PM¹¼'ÙKß¾è£öAÄ³kêNâ×ÛÒ¿1¨1ÈÐáM=Jæ=bQþ­Ý(µ@6®¡H´X±1Ïj~ö¶J-e_Oì{¾Xûó½Ä=@ú>æ½tÚçü'NÒ(9¥Jp=}m~u¥X«PÛbR#éú.Ù¡Gå9¡`¹BARÓ¹F;Ñ}Å~¬5bçCìO =Lð@&¿ÞxW*ýÿûZV+%'}³)eÌ¢ñ*ý&EQrU8DSù%COg­lwMõºÈ_v²]Hú¥Ù¯+Î=Ip¡ÌkúOXéõ¨üwÿ®Âd-ÛÚHgÊë?òå¬ß¥Í-ýþÓ¯n&g=MÃh®=@¯}´à´IòBÄÔ*ã*,Ol¦ÖÆã©Ð6$ßy°ÐÍ=MVÓ°²r>+»PVú»¢FNó>,æÑßRÁ°¿~÷«¿,{Lú)ß_D¨´0IÞ×ÑË6S!;Õèô¬ô'QÙIÉë¶ìÛÝßÚµk3=}9¥Ó}#_&2 *92;h·Qd¾¨$*·6?Tv2>M1¥X+cô4¹Ê¶D¯JØ27g¤ì'L¶)ÐÕìÇì=Iè¾dP©y§ø&|ôcÆ;Iaoqx=JÉF]ó÷à+(5| ù÷F=M¼å:5=L9cJeÚR¹ÓAµwO¢½¦iùÿª=}6ý*§hl=I9§íÈ%oµ¥R*î1P¶äÄ¹'¬çÈ£b×«³D(]8®YÜÊ@=M×|ETyh_iäG;&=I:Ï½ÂHôA@@VkKz ê0[ªîí¢Xì=JfÙvZGJXeFåBT=Ý¤ö±?ßmVó}²D$`õDF;¿ªaØ¥xÙ±A0Â¶¸TYó~àÎTÕzÅ ¶B(²'/l®Î(ò0|otÎÁj¤ /öV{C~BNÑÈÇ=Is$§2èsöSç3«1´HýIµziáÍb¢¢ûØWg&È§O?Ufûµ0=}o%`Ï}AlÐ]åö5%ø¹6¨m¸ì#îôÌ?î4cX22ë=Kß4ø*í':Î´à¹I=HÖ4ñG¬Ù=bîò¿éï´UûZú=}!¹HÝZC=}Ë¦såñRâÛ½dx]·+¦ùõVñ`Þ=}[¯<ÓAû¹*ð=H4áå¸®I#è)ÖÒ?P9&Ë­pöjPE³_²´ß_Qó!«Ø>ÏòÞ,WñUÁ*ìºº¢bE`³S½P³í(ÊKùF9«6Ñ,5Ñ9ôóÎó;Ö´]³`Â[^`m­],~ÈhëG=IÔ½Úå!«ø³·V éü·åCÏ¨'ÖPÏ&dAHiì úÁWÍõ3,¨?û«¿¿;ª`qi%³ª~n¾¯=@zL=J±ÃKÈuWâjÞ{ KlÕÍÙR±­ÀÒýtïb{æÉZÛ+Aiº©D0J=I±öÉñà=@Ýó£K37³=LæóZåQ9t¬nXj@ÂuQØH^~äÎÃÀsº¾«öH¶³s´=L;x[ü8»Såc)*-×_²QXL±¼PÚ#Ïõ*=Øâ`e·RÅrL/ª!þú·B*«ø¹Á¹ç=KqÒò@iBnløüGæoÜßhÀnÀo¸ý&)ÑÇw*+Û$Êr-9=}º¬VE­N=@>@ÍfÉÃµsø¸ññ=J°x`íü±ÎÇ#+PJ#=IàóN$kM'6ùhþÆ+jDU´=@¿ÉE±ÌYÁÍSxä±ªyúåDIÇ0®A¹ûoÆ/GsÛ¤UÙRb4=KXQ´¬8lÐçJa¢ýq²må+szw~Õ¤Q(~O]@!Êspoq¦X|#k¥«=J[6ÔÙÇ©ón$<xáä?öêUÚôlo)e÷G¨=Id3`'(ÅSÔ0g÷åçS&{·óæ½q.={YUy:ªt2,æ ß @)¯Ø9OôTíØ¨Çzdî'±É,Ó{üº *ÿd»^S?.ÅIÌû®òÜ%GÝ§özmåú=bLÔ)ÿ­w=JÅÇ3àÎ¬xH¶ç]¤ùJm}Y8Æïg8 e°zï&=@u çIHÎðA£W®ß b¶c(R_-xÒ@ÍíÎM=Mbù.cÈ °¨¼=LZú>6Ö-òëBÐvðaüÇëø·=JnwâÏÇG`×ûÀ[¶*ËÙJZ­öc÷°Dú0rNû=L©+u=K*°Ø­ÓÁ­Ñ9ëêä$;w=}|a¼,«4÷¿=¾;À¥ørÝ<6¬[f+¤ÿý=@rwóÏ=@/j=ýØôf¼£Gwþ£wr£G'w~£ÇÐ%ø+ø/<èÖ^£¦f`òýhmçsèæ _Ñ¶¦bÝz9E§_¿4à>çFs^1,çÐ@ë¦6÷v²þ¯­ma»P°õÓðÏxÇÎ·MfQ¸´åýÌQþÞÑË77Ë/ÌQo³í¯=Mõ3Ë_B³M~ÞæzÞQåâàõª¼ÞQo»æå¦Ë;³mC[6Ë÷ª6»}.ÏFÚ¬.êb#·½îå¸ýÄÓ8*=LëmQ+«æO§Lég©åÙ¼¢-ÈíaÖ.|§¯k/â}ræcPsüò=}6Ý2îíùE01ÎrºRËÙ`ÑCéØ`B¶ön¿¸ÃÚ:_Ñt¦TîO×t¬ëÚ2¾3#ß7w;PPÊ:8­/o¢øñvãÃ&$ÿ¿qÇ6vv5ÏÏ&3+Ã£>öÊ1ág=Lx>õù°<VlQJäï$F½þOJD}oòØEöú=JjÎ~=L×÷=Júþ®ºû=bíÅiö?ö¿zºgå~¥IUû!Ì¯é[Ð.îÈjl[WsM<.ºUÁC3òß÷Þ¦_R,x)R=K6XÏ¬/²Ó½<öÝÊ¬IK?ÉJ­«kÉË;D@=µªÝ0Áú%¾âÔiG»$©¦¼~+®¹Ò#«jÍÏ#w½£láú/À!=}AÖU;r%ßüÙ»E´º=It/ÀÙþÐHRû{sN¿yÜ{*0&=bRç_}JÇ7ÐòÉô¿Fÿú>Å~ubt¾¨VaTdËG(ÍÐ-'ºEF0Âl|M¥ü0 ó=Idí[lB³Õ3DrÄìñîx§b=H¶¦2¥ÓûÁ=è¼±¯ÙÛ¢^±Å.â­Ëýh-ªá²Ôù*ò}rd#õ4ÿA5Ihµz¯^Ï=I S;N=}}î·~ôòC@«.Þö¡§ê×¨rÝuÐm·=b«Û¼ÚC4ç¦m^=J1þ©³è¦±m`Óìk=b×;j ¸]`¢Ñ Dum*[¡½;ü6PD¹[x½¾+Ó<³Eç=J¿-ÇL§öìñLtï=XDÁç9l=L>Ð¯Ï'[ûK¨¯EÌ=J¯nÌKºÊÏKÓäö-ª®DÑ)¹*M<wvLÐt#=}Çÿßþä%_è~)XÚhè'Å!À.åñ ÈW.IDÊÃÁ¦óªJ~âÁzüex6=IÅQ@KËû¥ó¸³-óìò]É=}°wi÷¾>g:¡ÈHnñI,ºó=}g36ØnÒ>epD½pµ,Î­]ñ)kO)ÐþFÙ<=}å®ãsHgÀîyQdÈI_M¹éR×ì5û)+è`ì3¿xøÞö2·ÈIAuuíËºïBÖç?ù~`¸[x®ð=bÓ¦&à¿O=}ßÀÇ=HÛ=KiC¤·¡0wXÕÅrh>ï=JÙó=L¬@º<Så?Æ@Õ¦IZæ¤ gÃ1)^«EåíÑ=à¡ÜáÂ¬Ó~Ò9%çSÒ×SÉ6KU[Ëï¢`ÿ¹ã¸®Å{ã÷Õ!±þíÍÂc¹n:ÇMóÀ=@@s<ý¡YüWµ¥ ·F­=¼çÕ±þQ(¤ì£ÌMÎÁûR7¥:ã:;+ê³÷¼Ò31(­qÝãd÷X^ÒØJæ ·<º'zw¡/¢fz@­3.=LAøqSråÓ£=He!á_Ã~ÔM8üV*ûÚ;[¦XìI=Ó¼~Lé®iRtÃt¢[¬&OLFËòL¦4¸çSÀêÜïÉâ)¡³÷á¦àRJ¿îV#=JU¶ÑPo7Ä9W90¨lÉdLB¥ûÅ ¹ ªë=bF¥?ÿA¨ ÃënGÂT6äxT÷&{þñÜhÅ`=@¡+e¿òÎ>ÙECÊQ+¯N§%¹ÙðzÕhgÀùWÆØc=K]I°Øø¬å¯ùpégâAckþçÑ¶Út&+9-0Olüy`=MQ5L(óGÍ­ðuKùá2-'=HJä¯ =IÏ=b9¦ëõçÄ»iñ}Ðh=H=UÀfz~ô]e_hÖhÀÅC±kf­Å =áMy{=H{¾~OT=HæÅx=Kp=bÇn=HÕXLy|ÆH¯'ìyÅòÖÿ¥'°áë§=Lp'8[ÜÛCqó®ë2Í/Þ8*#MÒ±ä9§#°2a¶%mêÔkü»cÎótÏÄKxfL' =L¢ÒìËc¨_ÍÇgÜ³©¾QÁ=Je#©{6Êq=Jó¦ÀEe]ÒãÈ=J5§§ì,Ì!«î).ß¥>gL¤7û8)&lkóA|íy{±ÐW-=JrÖßòÝð±ø¬*X7~T/y´)J9íWã=@ø#P«§*{]u@s¾äÅúÞ>3`x3c©Y;µÏ=>Û¤ãó»ß3Ì20+|·ÀáoÖB2¢wlÿàúà^ç=LïZiáÿT5ÂùÜ`ªä¯ý¿Òb&@×ntôon/JÿBúyjìµý¾=b+Ùün]³ÄSÉîlÉg­áý2)É¢=K£ð¢IÛ3Àãó$îr×n`4®yÅ6ZÑl=IÌÜ75-exÛÆ¶Ç£½Ø³#Ú^ùz»1?Î¾§Ê>Þ+óX=K3`Þ=K31§2*9+21ÇÝ=K´7ª3Î=YàFÚq6?VqªúaÛwð²À¥£]Ç²¾!££%³g],tÌrÖYpÎ,;1þ!@±EW0¿Âð7Õ+ÜZ_FÍBëhû}Æ7ç§p`¬:Æ)Ël$N£ÿúVÁhÄ'=L+í@ÚßU²bcaW÷ÿ®¦êÿÜ=JÜNÛÜ¥®]*ÌejÇ=@£e¹À  ¸]Há© K¹VögJFs¹F;Õ9ÅEJ0M=}&1¦0#(êÃÄÚA^¬A âôµ=M! :Ê â}2=Hs|(/Jl ]ZÎ{¬í{¯¬Ç*$J¢Ë«4^Ò~Ü@Pfc(îN=@'Qö²¾»NðnDGjJÇ¦l=KA;þ«ñÌy=Hq=HHbª=K2Zß¦X¶[¨)=H~R[:Nä÷yMÛê­DÖÔ×Ý1ÝòsÎÅ|bÌø4 zDXÆ²k@h>9=´×6ð¶k+.ìb«ïõw[I%]ð$bzß0pú¼- ¦ê<ëø©Ø_g&ÙáµÚ¿#}.èbîûQL¡»Ö§=K=,uÍÏÓ=MRæ!967{xæúftÇýõ&nx¨ÕÇØ½á/8îj>e¹Õ]j(HT..Ât[ûäáãÌiÛÿä=KÂú1ìïnû1E7GËv0Rï%2q¬æR}p­UBj³ö=}táJÐ©{ÆJVåL`P-=èÉ~_·Ð+@:ã>dÖèEþo~»%D=MåÕ.fcãÏ4Rë6UBºpÞrOëO4³ ÚYE#ý9Úyb=@níAÈÕýÃÇ^¿/×RÉ¯]B·®&K.C¡=G`gw¶bl'¹ü~æíÇc`@ÁNÚ°mï=bló=@ñî2t_êÈÀ+,R.ªGÌËÛÉlPàãLäuKYõ,áWíFÅ[öÖA¢v=bùªc*{'>ø¯eTM×OP=@ÓXª¾rÄx,lðÕN$¾ºfÔªeíh¦MÄRÝ¦W]X%Þs,,oê!Ïu;ôì?Á·½^nøä],ØL JÔ°=KY[x®T:+/Ì;ÕXïußÂjipQç§nÝU=@=IHE2á Ø³â´c×AIý p³Ó Z.ëåpoùîú 6Pw·x=MyekÓhvAªãàè$rìxmßZ@ÑÎe>æõ/Øq¦ýä&ÛÚßçÕpÞç@çtÀ0=K=Iy¿8ÃÇNSÕä~º¡Õ¥ÐaãèBZS¨ °î=J~?7@²=Lµ=}uöÛWu)ì^½E=b7mª´¯ÄÒúÚ#¤ÏÁÜ¸ob6=Mx D:J1a_/Nz0«ù5z½ÛdrÖ´2&á¹jeF°:3ë@Ø¢g¿$ØYù³ëuÆ6­#ººw1Ñ´@lØ«|IÙ#ë»2ØÔë=KSÅÎÐEôv=Kø|áí¶òç=bFë+¿V:ûY=Kà¸=J/ T±·¶~ü[§Øh(¬lâsß¼hjðlâæÀ×¢IT¢z[¼{Ê¨$Pk=}íR7kÚ¦=h¯ñBð^Ö¡õ=@ù¤Ï_^üA»ø¶h9£J9[¾Îo©oVNPóhÇÿy©ç0=bì[p.=,soç]ßªÁûúµ>=@U÷^!ÎúJáæ(@w½³.y©È´ø¸=KLÅ[VØ½¬CAa.hi4ÇØÊ{+ª(;ÿeÞÁ,³®[z2z¿¼q=b¤å9ëkÅúUÝRæ*¤¯À'I»í|^îàÝø*[`>ºü=}S¥GVöm=}æVUªGt0~=MP016VqùøIÄûåNç=KLº=Ká 9jôRÙÓ_YêHë±§ûç|¦} 6u¬·­n½HùªLÉéº~)Xõ9z´: ÏW÷´Ë0a.0-!}RW¡¸¼ÜZEÖNÕ÷X.$3³£ÿ·]´ÍªQ~daë]ëÈ*ßÐè R1§ðÚÎÿû¡bö¹³w+÷±Þ=b-4pÁ3×Ýº®Æd«Í}+@îdu¿¥Ùÿ×zFíì¸¯Ó÷*9fYV_£M7N2KitMÐsV·°ëàÓIû£V¼¢áº»ÞB=JTP=Ko¨=sÊS)TFbq=@êÑéSYøeàCãqfÞãÜ¯<5þ=Kªy WKu£+XiÄ¶Ç>Çºà$Ý¹D_4&=M¿ ¯®©>-Ø¯âUùyàc¿¡là3XþóÓ±P=@KôýúÊ.¨·BêÉÿ¦ÆÐ'¼«´b>×ky*/Ã®OÙÇY=°--µÓ¸b¯xS}ûûu=IÞy|ºô#.Û8,Gå¯SÍÞ_2ÓKÇÔ÷=}>µ ÙG±n>À«ë¹:í¿bÿr|ºqÖÀaµÐÆZ'Ã3ÂJ?=K$®ñYïX!ÒeÙÆD_öFQ)àª5®=@Vp¡ËbÐAª7»=K½ô§J+´mëëZ¹{­GÂ8ðPC©á04=}ÕÔòÝ»p·=J)3éÝìFûcOµ×hí*=Hm6G'Äc!­?ÏÄ{ÍE$F[rU¥Ü{L=Jl=Mo./,×F}u=M×Ö´¬|¶#âÎ½øDã|ÇJ©Â'=H9$Þ=@ òÀ_ë5Ùæ=LòbÛ¥ÚëYKhbåî¼ëzõ.±g¥ZfÊ@33áú©9r¾ö.T´--(a5PebÓÌøÀnèazh*tHp/¾=@vþP=LÈ]hýZé`Ööú¥I¸æ¾§ÆCd©wJÒd&a?¹ï_¹D:g,lâa<'ÌÊï=SÙèvTxüHèµ¾KÒ7}_;àî.Xé2ú<!NL%ÅÇôÐ0Â÷lWjv´nÇ}àÔewhy'°FÆ./ë2¶µ¾¯ãX3¿7~=Jr¾PëûKÛ/ ¦0O9º^Üéâùo+,BYIÒxWJÕ¢Pá(µ=@$-ßFamÙ0ôB2;î2 ê(3^JÕ§dlh=pG=INW½íQ<gV¨êÃ6A&BÜ¼ÅW:¦n+â=J|MËpB ¯&w×ßÆ¢&wÔv1µ5YïÙøáoÏ7Åý;Í·)âTá3ÆB¢ä»¤GlØ=@¨z´!¼Ý»´,mµû0UA-,;å!2n¥DÂD.è`>÷K LQCy´Åð9U$=&ÅàlÜ&­=u|94´ror³6ç2ûGf|=@/Ê55Y+vÇ0Ðgÿ=K6u=IØ{}=Jïm_ÒUqZÐ¬¨ÎÕ=IðÄDÎTûSoJ;g]Q=LôàK£Æk{Âé0F/Ìêì§½/Æûyë¸díöo¦ákÕwÓ#¸ïóAö(UðÝI»¼+g5<þ;yQi¸ÛlCÝê=H´`¯bß$ë´}=I#åèáw×¯rÐ§=MJ½`²=}Éì½Å^=I¡ØøR¡0 ­LÌ;^DñmxV9Ý$E=bÅgákÏ®bR§íÖ|Tä|÷LÕ´ûê=LfrXu ;ßIëØ£hõþÙÅÐM`?Crý4ßÂ'¼²¨£=JÌ®iqJmä}¾=~Úùé©§îôk!RëpgöýäÁ¨rêÄ#6Îxb=K·ÖäÿIÛÖ3*QÀ¡µuÓlnåÜÑéúà{=@ZÉ:VìÁØ&µÃ]×Â%íÔ®_øëõ=K|YS=K=å>ôÝ¡ÛNîBo9K=I]VÝáJÆs¬S¢µtÏÖ=H²+ÐJúÊmõ5=@ìÅeL=Kç¶ÓÔÈ=b3;±û¥/FôJÿ5PáY{ÄLPIU¬ÿ AG=H1ýgxwéôýð[ñ=Lûó¼¤û¯¿_=}¢ôÜ·æð=I ×6SÍâ5tº[ß![¢æþÀI7_ÍlyL3kùÁØí§v±ì¥U<G×8á¿¨W=)Ì_ÆiJ{·ÝÅ~x=MÒDêòg&O`Ü9ø_òæyè´÷K+Ó¿{;ã<fÔ!hSf[;#¤µ=}/¾Â2=HK¯ÅÃ.ELÃìQ@¬6¯ÚWyÜ=báP=Jð=@ª ÷oÆ^,< MÄV=K=b¸åM)¦LÜi¨Ã]cnRdêê¼àªÇKÚáùNOËa=KÐCWgo|§_S#õlyrX9i§ôÅêã&.^úc7ãvtç8û#$ÚÁ8µ-ÔTë§LUò_ºûêu;êùÌ´«¶bÈÆíøwÄ´ouã_Úæ'ØNö¨áÜýwëÉèxq&K²@´êDP(¸ÞFxÊt¥epÝëÆEvõ~º¡ÀBÓáù=qÁÎ9=bæ4§ë»dåðpoKâ~uL¤g8I=Kås/j98%¨^Áîe`=K×aé»=HÅEç&w?îDrX=K0¿;hTeoêÐÜkþ»ZlÞ³%àRRû BîþkcqÁ*t#xÆÆ¼â%øöwÜùghuX=}l7INÓ·ìpQÏ²µ¶êº§Ä§L¶«(m«îÓ7Ô#ØyâÔûÝì~ù¯özËåudýls4=1{9Ï¿¿_Ñ/ï¼¾õDm¼xõéÐçV Û=@áÙJ7]õ»Âb¤þ,ç0Wp=MJ¿YøqWfÌéÊ¾$9váú_aàh×¡þ½]©¬ß;Í´ÂìOà4é=bfBþÔé%ïÎl¯~¢pE ÷¹­°§¶3ÆP}©(¿¢QGÎ=Ú½`´÷I(¦ÒAt÷(ë!8ØðöÇ:=KTH²éò¤á{=á¶µß¬h(7¸óµr6==Ë=}$ÝgnÎõ×¯~Cò¼û?èbSU?ùØké%AUê×GÖäC¹®·¿0·¯ôÄõ¬êèþ+Eéq=jùºV=Hó9ê»µ½«E¨ðÎW=Lî-DKCð@­AW=MWñÙG§#Ùh¤=bÔ8ðKûì3à÷dC%8ÔûDÆTÁ890JøhSßÔi'w-fëY3D91¶ÚLá_¯$W=}fÜ|äAðg*0·]Iâ]ÇZ{1=ÞÈhcV³0PsóÖÝ2mV)(ËÄ5Pa=L°Ì­gù¼$â)TK»¤k+ÀFÈUûfw!û=@µ.òxV=MvÒYriÇ°i2{=L|s×|ñ)åôJ¶9Ë(gÖ9mI(.pD¹è uçáüô~áÓ#×£hCfr_ÌöM ¢%ðÏø}½£ýÆutÕ§:³ _IPìqÞð¾¬ù²ÔømNh?`öÚâkÍÿ=H@=pJÛ¤.p[jØ¾/ÜLÓãiµÛæAG8;¸U±â|}òÜþI[¿×vN¹M×¤Ù§ìædø·µ»+W$l­JèK9Îàø=MçÝ|K¨ÿJ·­zn$¬y¹¤3¯âÙ>{«µ[ª¨eH4=O]HQÕ[xò0¢{7uàÿÊ²µ}­WQ`ÞL´3w>=HâÊÄUÀ°Î4r?kC]Æwbj@Å!ÚûÞLß5ý=Kþ@ÌzqT&2Nb?êù=MÈ@ô[L,Lê¿U¼5µ×|¦R@´F, J÷=@ÇGüâ´eq+è¢öþ¦q©=LHæýJ¾=LT1!»&¼¹üôÒÂbê¦_~®Úl¼%¨INW=}x?õú-¥W«¨pÕ =L}êþ²Ñ¤µ½¬[î¨=}cÝjÕÕHÈs÷¼óMøýù³ÐáïÓ8A=bä ýc£he¼³¥ÞúSöexKyÝàCÀé}cIryx;VèÚUxÌà&£}ó}£á}Öaþië¡×û,ØËÝ~¯]Jx{Ý~)AÊÞ &23ªØ¼=I¥L¹öÄÜìd³7dÆïªf$Ï[Ñ6ö$ôd?öôõ/þV¯âÄpÅ.t$87z¤ü*VwqÂwRm=MCcrÒ~®iÆXþ|¿mà7ªîÁÀj®5=I],¥ÊµLòA¸^YôÌãÕýcOíî±G=K)YâÌf?=LüO¦Xlç$yYøc¼w9#û<¶Ck(pi~N9LãÅÙ>þqÅµÀ×Uêç& ÑÿL!hÑcºUL½ulîÉm=I}=IÓºl/m,Ë¢ºR8Ñ$RAö!ã.6àq9[ï³çúEïäã.[ú¼.¡.Æ;Bíã?ÇÞ=bzÍ=­çÛ+á.úDË1=HK¸ô=wØÍfûotX&þôû`p6HÎä¥(¶cÓè7Ö3«ðì¿ÍÜ½Ê´=}Ï¤s/çê­®}ZQDsf_úÀ'K|økÜx:d9Ú%?ïñì¹z=}öLµÖ¢Z¡l¯ØìEüºJDy»»oRAñ/þ5¢ÄWÙöUZ  l¯Ø¥ºúE=Mû¼­¼=ü=H`órºòPþ=@ ··Göã²fâqvÈ#Ø{¿úav¢fË¾Ú=Hú]×60OÜv2KÊXuPÇuN÷uKõPßõO5Ló5MèkÜ=@zçOülçe¤ú¦·PÁ°ªÛé²o«¤¬r!Z¡=J)*00 ½}LOíÍN¹úÃ7J4j­<È=LtzÃé©âæTz·#ÙÂ<z¯ã½iî`ëÂtûÅ=LÍKÞ£­ù,¤bXM2A¨ì#zEq=J¡ö9 ;ùý}OD}ÜÎpÉÙUax¹ wáU¥8égØÜm%4=MìÂJ=MÙÅÖ©7«²K¹¹5¬`=Mq§.¿=Mü=@³^ ¹ÅBÖ2,LûKÙBÒ2ï¤CþÆDôñL¯o6Û3Óû<å2X=HÙsË{V=@íyäW·®¹~ùN`}÷ñºÁ§$ù§n]V)fú=}Û´£ÕhORîE0lÅoºÂ=bhU>N;Pã'úûS#é8_=}E¦pjÐWU­Lxh&}ý[ìtRîïöpJ£ðd?Ub?ö$=bÂd?6>=@óãdÓÆ|Èøjs4ó+ë¡æÄÝJ=MYe§t¨`ÉÎW¥N¤I´$JNdKÚDIêÌ=Êù=y_i'¾pK* IæàLpÀJ}Ä*qÊ±5pj iÀªy%|¢E|­=I=L8PËJíyD¹÷?9Î/Y¬àÑÜÈS=MÜ´`KìÊêá>ùÏ¤ê(?KÑ=JÿËu=}ãpB'WV³«væÇµÄõà&_áî¤§,2*²×Ì¹£8@=L]¤BzÃ:2L8N)`M*o&@Àñpv@³K3§2FéocÓ±?Ïá^LJ=IE-A=M[»,¥yÇé¬jªÆ¯á&Üí|Ïu|Ã°Ø=IÂ¬¿?Wzs<s&³£S,=J§ìt~í³4J²»=J¬Là[iþOâWm=I§ãñ¸¯¯=åå¸,å¨eçùö#å¨kr»¾=b!UÏGXÊãûs+XI$%LN&°6è|~oË}´ÅÆ÷U¿G½v}(Þ)Øt=h=H[h=H÷t>µZî^$µåHC0h#ÆG]h¸~Âá=~ô¾!üÅfç*}õh=@=Ié°NWRçþ{³=Ié=bÉ=IaÌ3Äè=@á#`åæ_[ÁäNædòÕuùjXhyèp=@w|e,P¨õäÉ=b#iJ¯å²®ÉäC[ ¹Lb=LÁ=Lä=b=HSßûÍØ;áö¼üÔ´4ÄöùíÛ3Ær8ÝPù¦8»9å.SWW¸]UP6¼Fòé±d9¨ú.Õy´»åk<Bâ6÷N^¦DË¶<DöJêåÊ¬r³Pÿ<ä÷êw¶-Ý$: °²8 ¢ÒÐÂÉã-FºT¶>>Éw¾@a4WF&MÒe©ãêb=bS4Cüs¥íÈ=¯uK%PæEWHÝS¯û'E¸.>N×·>=}»aGh=Jþª=}ä*Ó[Ôà.òÞqNîp Äp¸Yv¹Wkçm=@îÂÐBÞWrèå7eËjJ¤=}&n?ùX¹£BÓxÖ(?[é`nD@Âf·¥÷=JôB$G'}Þ=H0ú¶×2ûBÑGÚì]¢Ïáò¼®r]:ðÖý=Lv_.}ÝsAXS{F³=HTñ£?ö°|d3EûI=I ¹©=I&+§N=HJ¢ëFçT$êÃQQQÉö]=}ö¸GíR=}{|Ê¶Õ(XSR}ê2çÔ~pm=LsIS}âßG#vì¾dÆ²«ó/òÅê+«~.sÉ`GYæ¼3/§p¯Vx¾=LÛÑ¼£Óz¢åè<Ï<ÿWgøÊº/2rZ=}½öÖHï_u=LI4òòïñc#ÇÖÐ¼Ô.!Ä%aVHl=MÎmz»=I²R7{û=IÚwÁ=@=K$s8O©¨`6«Ñ'+S«¿ÛÖ;g!ínsEaÖ=HiÅ¢RVL¦n×[2ñÌøZã¸IÝ2Æ2×?{2k=HÏUÂc?¦KhL>ãXjb?öd?öd?öd?h>öt}vþ<HÇ¢ü5gvÈÿWS3#ÒV3Íp-E=IÚ×ù#¶nrB=HýÞß¯È¨|Mté»¦ph|¬H;L%mð=b]Æaf&fY¾a%-·J7UÌ.w=K?êþýðý¼ßBÁ${°ý¿/'ò÷VåÖyXm°jøREÓÞé=@?éÀ=JñC´ö¯æ&VÑïÝ4:é»¬c=MÉ;º#ôdaUý·»'I¾ÆÒ'ØWçü=K¼5Óþ_É=@Ì=@0ÒV½à±=bZ5÷´á27Ú!ºÞ¯X¨Z£RÈ÷ |òiBU4EN OüãùzµËXí¸Ð;ÒÆ&ÆZ¬á£äÛ`|¹ý²×.oþÁvÁ¢ÆV´>¶=bpoUP­´~ýÖ-;u#4È¸),öa=bå>ïü,~#õåÿÐF§:Äï8ÞgmÜêÐÁRïð]UÆ¼`Fa¬C°BJÈ_Èüe¦æ=LfáÆ1ÉVûÇ×¯=bb§Uôåÿ-:®2Ô[2]Ì^8=}1¬AØº³u>uÐ=KU£Dz=H2U=L|EJThUuÌ~JÕ»ho¥ÊùèáÆáIù³äWàOcð?B$AÂc¿í|û¹R1çu=L¶o*g=J¶´éúËZ*¿ªX±>e!UÄýy=H*Ëëµ³î¹à,ÌìOú`£¶^ÅS¤Jx¶=}¢¤U¯ºZÒ«2¦QÐH¨ZqÔÊP¼=IC+=HjÇÍPzÒ&Ná}ºR¯GQ=LÝsqÎåÑc =JÒs=@Um­/¡£VÊq}ª2¼¡ÇX=JS&!×ÛHî­=YY¤qVÁì®/]B(÷cøÁpÑs}ëP+q8rRqÄqÅ·OOÁVÓ&GTÃ%tZ¡Ï.Îà-´C±ÌwJ¥=IiÄ)`z¿ºc&ZðÁ§qpA;È=HlÅßÉ=Hî³~¶ý=HG©2ù·(^DaèÑó Ï8nrk¯d|Â¥ø+t<ÅÒÑs¤åLK}ù=bF=KgÖð}ì}þã­p9§£¾F¥P),ðüÄð{³¼ÕsËEËÛÄz»°d=@`nºý¨wÉ nÚú:ã{ÒvQZÅ¥EöA-7Lgq¥ôx»eÓ»ýE¿¢F=}ÉleËÛÄù¼C¾ p³£&õÔðò}Ûo0 ¬=@6NÛUÐ±cØïÖ}¹?©2D<­ñÁ=I )vBA}ÿöTJMj÷]g`Ù=HUBÃj=HÇE£=H«ÅÝtà¥-7{¸[×üì<OâöEJ`;Òñ=LÊí6ôk°ëí¿Z=Mßqyâv¨]ú=Ip*a|ÖCäVÈÑj«=} ÑïNH'=MGÑ@U^ãÒFZqÊÅ3pËýX=ë1Æc¤a-×ð¬ý£F¢ífüÏ;Ã5R­ÌXÈh«ü¨1Þ¦fÉ=@íjüÆè,¤ûÒvR¹}ÇgªÏàmâ; .Û)æ¢§ÉüÝ2}wIþíftdeÔ,Hzôr0´YÎY|ÓfÈtd¸A?P=õWúÝóßÆýÏ`p<1p{âLâ^&Qs`nbø¥ïVzÏ8j÷d¾r=HÆWj¾ à,T§y³*8)¸üÕoíqå¨põâv¾k+#^¹Ð¼41æøð¦³~¿}µÃ)ühÂ5]ý=bQ¹egËßVmÙÿzÿ`/wºC½ +|ü<·Z§F!ÆÒóÒÆ=JaÑjØª¢wHï'JqZ±|^8J©°aë-=IYA=HvRQ4På÷Ok=MÌ~=Hë÷ãÓ{6FH_=H_®Hãl=LOÆüÍâ|Ò½YÊ­<Z11]Ùvl=Ho/IoÎ=}íF»TÇÆ¢uÍßh½Gý¬<¡Ò=J=Jq¡ýµ+hÁ=Jú­~Ì©2rP:@§=JG­~Ë'pdke ù©¨¹P5=HxOëqûÝÁ>+x|ær¬,=Kxúc$ZeØF('læýÍýKj¬õ'ÉßÜxyµÌ'(*»4Þhkðü÷Éü LhÓ¨_ÔÑX=@ª=M tÆõØ»tå_¸âîHuhj_gVÂ]²íZ[DJ¸Ýs=M=K ªÏ`YXæ§À¡Ü¹ËðýÄç°2P{­8xf °áóHËÁÛj×ýä§0»¢RiºK|êâ§{´â3q¦¥V¬=MwXkSöa,Óæqj@Î°ñ=HX-Ù¢&iï?¯2 ü*únÐ~(]6Á&Òs®j_?°°ÙtòqõÒqHÇxn¹èR=L0Òi(6FÈï5xËú%¿»38»É.¿&=HSb8%=H6øYAW§8 ;¨«ýèô¯{2¾¨B&!=!Ï­vÓ&=K·OíÏb+ÿ<Í­­È¦ÊÈi}Ð|þ)RªûLÍçZxA¦¦bIÇ®¤QÅ'kôßÏÛÊÞ½bÝ_0=KøYÀ_Rqüå=IëÁþÑs5Qj}Íú¨Zs­,ÌÎ¨A#{=H»]¨Zè°~ pHQRÑÒ=bW5¨¼¢p+ØÚÛÈj}èÂIºb|Lz´_¬2¸=2]`°~¥w«2¼ýñy¾7¯¢Bi^=@ÒP)=@{Ánmv?m°=IoÅØÇKZÍ¸ÇùÄ*Ø5´ ØÏõxe=Hr1%yÌ=H$_lO¬¥ôÇKhØ,Ç%ÓEÄWþ==H%ì½(¬~àÉüÜ3Î!ù/¤*û||0a<d=}q(AóßHä¸vÍÀ=}æ=WBYý¯÷{=ü=§)¹xÏà{<&=bÃ+¦ñØ?,¶cBÝü+ü9ûdÂÁB~tn_8R6è´@ôóh^*~4ìtpvãHc@þñsÁÐBtø+¶ùb5ÐbP=bàO»©=JK(fÒdÖÑ,m­ö¤9r%K¯2±Ó¢=Mf[ê«fn­öò9ôÓÀQv~H°²Mü¬ú£ßýêß P¨ «YÂ4?hí¿¯óãClçqt;êõ¼GT»°}ÂÈoÏ{J¥GóOY>{¡4¼îBvÁRT%Zz¿jVÂ¾ÿ2ú>Ü©lÑ}î=Äè=LOjÕDÁ¢û¶Õe=ML3E=bÙ¯Wc¶2å@[ËoD¢k}l4ÅcqÚ¤ÐqÉuH¼=JlÌ¨îPiããuâÞûpîÇMVîHrÂOXUÔe½ªÍdhsêM]ðuáÓ£°§xé¨%áZÃ³5=by>'fÛBÆpÅ4x¾©ï}%±Vº¢À@èBA.Õ¸Î6³í'À<ûGÃÇv.=}&%pba¶zm>ìÈ{»wòqzá9=MË:ô­©68LízãT ¢7åÏRè¥ü=L`E^uoWýÚ}f:A¯|dUÆÂûh*¸mö¹ÍlÖºPÞâ;AÀ=JwubB¡o0=¿ú¿ëÖeÙ¡Oó'¦ ÕÒ¥á@Ø¾µÜÚ£Ipe=}ÞùÙOã8÷T·Ï£8=M{ëèHÔ(ÛÎO=H/b4E6ýUÊ=}¸;´y$òhý&gÔ[¨oôðÏÆ/äH­G*#D¯Ca=bß»Ú«  ¢¤fWÇ=@¨wêP²Jù$Õ=}Â&Bî=M¥öêâG¾.ô±6ÚÏ«/ªUsWqî=KUå+fÎÜE£pÉ-=LàÒÑ÷MYtr¼QEyû%´=Hª)bNHöGÅÛQçKO=Mx+u=MÐÕã=J2=bàÒái=Jul¤5¶IÌÚRAO%NTSW|@yÏýØðÜèL¸y|ú·²åi]ØÕÕR¥#STRáÐ§MNÞ ìÎ÷.~òªÔrÂ-!ÂÕ=bÅ=KÖlö>þzðÂ}î­bøYllà÷@ùÃÅ#müfÅh:3vµA1Í`¯ø§#dY)ò=K?z±×é9æÅ¥30,AçFÄUï à5brQ-Ñþb«ñ~£zú`¹§FíÃGDü;Ø=MçUXiE6­®n­wmuÄ×^©vCZÂA0Ìg¢NwÞJµ#àú*JÄã Y¨ë=H¹Ã=M3æ,JÂ¡]¸ø[ÉÑîÂø;PÀr¼Ë=b>#=LG1¤g=MsbòuþLµÓ=;Õ'-¼æÄ$ v,bùá%¨²f]¶Sí+éÅTm9yüì=KÜLð:ÖÆ'B=@A|·VM*É¨=b¬àR¼EI±¶È¯=}ÿ<åÄ¡Ô1®ì{ª3[ãÍÒ[¯¿ Ï,ÛJpÁîËLòY>ÊUE@iõ=K?¼á0Kfä½²yhé{É¶ß¥-.ÅÏB5¤ßP7¸&LÂ¦Ñ=M¾i´ÞùÀ,T=Mqè½#üâ~±,bðÙ7!IïfømÍ+=}º6z<aë¢T±¯òÖìxèµwüL¬ñ½«7ÍxIRzÆ¶ÈiSOæ^/ø=JäÞXÐWnÊ$J {²ÕûP=H¶ÆOÀ²zv­:Þ=H¸,>¸ð%»¨2CwµÞ ÒcÏZñ­îbmtÖvA¡ek0k:K¼.1Ø*=þHQ¢k,dÊOO+rtUÐª×¬*ÂÜô®-ÍZXW,¸ÁliÑ=M>£BÂÿÆ{ÖKÅZì2rÓ'Ãà«èÏwJª«BV!=L¨b=ù×t¹$=K}Pú¿f=IFê¼ ?é4=J|ç0+]ß=M=I,O{¨Âª¤PeeÛÝïó­h¨EËAðªðõÈ«ÇuWmÚG=MñT9.k¯+·zqÔm°e0Tc»Eû'ú.·(õÓø¨îEfÇíÍP¨Jßg|ÐùpþËÁ=b=ÑvÔÜyáJ!h-pçPO÷¤.ëbÛ=}=bgµgwBÑp/q9ÉÆ#Ñ¬>§i4£Ê=KA½|=}ºeæqäWéMÁ=Kx°{¹x¢d_¼øé³7e¢4Ê'ÓO_YE/%VE²8¦Ãã½ûN+##¥«¸kGt?¨ò6©Ì_7Ni9¸;Dù¶ªÚ_!24=H»ÐÜ =+ÑlT$ký÷®l$¢¤=K,fw¿Ç¨ØlÌa°Æ-Kz£#7§U9,0³RÈ$½=LÝ?zjîµj`Þ»ÎÑ#,+z?ð=M-¹ÀAº½=Lj#óE@Ï=I)ý·+´×$ìªjNSÝP£¥!3{2UJRñ[å3I$raxÐÜs³¼ÕS¢#=}=@&%_ùiFH½hç¦ð¹ÂèXæÂ¾ÜÝ 7ïÿVÈ¥¦%QIÏÄmoÝ<¬Á$¸<üÚÂÛ~mEêaïÂ0ê¤êJ;ÆYc(¢=qÅ=LJ;·ßíRpè¾·0ê5ØèªÝ20«ò!wCKÄ,µ?Ù6Â& ~QUòi'q¶Ó8î=@PäóåmWÅ?ìÁÿØ=Hh®é»3Ò94PiôÅP2Ûnd/ÍûÒrúø0ëÄïÆäzÂL2æ)xB»Ì¨júõ¬ 4+,'þEÄ-~æèôë´Å5¬RÑÅ=KÊö(ã×D¦P<ÙS¨>þU0t8a¹)V9jÀoÕ´.=@©jT=bèU=}k³seîæ:È°}Uáq8=J}hjÕÀÆ]Åy'çwÕ×¶ÄTè=Hä}Øþ§2 95|ÄÆ_=JÕVN{WûßÆ©düdsø¹Pæ LNI/Û=KÈâì$¸kU¥øXNÕÔà­/t½=Kèáa¿'P`-ù{_°Óõ¤Á_}|/´x|@øj=>¬¥ÔLçú¨ôNK(EI&J×Ïu_0bN &z¸w§é1I±=Hxsb?;öôQ'<öÕ=b|ÆÄd¾p#<öD=H?þ?hWD_yÖ¦w=IÙäÑRÌôÚìïÀÙ=LwaûQs}!zz¤ÞrÃ=b=K,4Yìûl×àEf4+«;Ö¦U9I¤uùI eyI¨©K©¡kÑ©[¯&ÝñYêI59Jaª vì,Ò¥Ä1YMúÑQ|(!Þ=<Nï=MVwùCe§8X¨Kñµ'Ñ/[=bõ·ì=üÁ§V5£CûéqËòHéü:ºäB]*9úæúÊzâÅR­þsBîUUb«°xs/ÞM©}êþ¨|¤f65ßO]b¬¹b5zèáÆ)ºx4=HòãÛ=@»æ8,7ÄÞ$ àÅç+!wÍêÍÎËkÑI­ÛÑ¬=LµûQ,IP|¨$H©±}JÊéë¨5H``ä|tÛ=@=fÝ=KøZ´º®ÖêÇìÕ]Õt88fö´Öÿþúb¸", new Uint8Array(96365)))});

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
   requestedSize = requestedSize >>> 0;
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

  EmscriptenWASM.compiled.then((wasm) => WebAssembly.instantiate(wasm, imports)).then(function(instance) {
   var asm = instance.exports;
   _free = asm["j"];
   _malloc = asm["k"];
   _mpeg_frame_decoder_create = asm["l"];
   _mpeg_decode_interleaved = asm["m"];
   _mpeg_frame_decoder_destroy = asm["n"];
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
  }

  function MPEGDecoder(options = {}) {
    // injects dependencies when running as a web worker
    // async
    this._init = () => {
      return new this._WASMAudioDecoderCommon(this).then((common) => {
        this._common = common;

        this._sampleRate = 0;

        this._decodedBytes = this._common.allocateTypedArray(1, Uint32Array);
        this._sampleRateBytes = this._common.allocateTypedArray(1, Uint32Array);

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
      this._decodedBytes.buf[0] = 0;

      const samplesDecoded = this._common.wasm._mpeg_decode_interleaved(
        this._decoder,
        this._input.ptr,
        data.length,
        this._decodedBytes.ptr,
        decodeInterval,
        this._output.ptr,
        this._outputChannelSize,
        this._sampleRateBytes.ptr
      );

      this._sampleRate = this._sampleRateBytes.buf[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
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
        samples = 0,
        offset = 0;

      for (; offset < data.length; offset += this._decodedBytes.buf[0]) {
        const decoded = this._decode(
          data.subarray(offset, offset + this._input.len),
          48
        );

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
        output,
        2,
        samples,
        this._sampleRate
      );
    };

    this.decodeFrame = (mpegFrame) => {
      return this._decode(mpegFrame, mpegFrame.length);
    };

    this.decodeFrames = (mpegFrames) => {
      let output = [],
        samples = 0,
        i = 0;

      while (i < mpegFrames.length) {
        const decoded = this.decodeFrame(mpegFrames[i++]);

        output.push(decoded.channelData);
        samples += decoded.samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
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

    this._inputSize = 2 ** 18;
    this._outputChannelSize = 1152 * 512;
    this._outputChannels = 2;

    this._ready = this._init();

    return this;
  }

  class MPEGDecoderWebWorker extends WASMAudioDecoderWorker {
    constructor(options) {
      super(options, MPEGDecoder, EmscriptenWASM);
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

  exports.MPEGDecoder = MPEGDecoder;
  exports.MPEGDecoderWebWorker = MPEGDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
