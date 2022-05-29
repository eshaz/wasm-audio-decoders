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

  if (!EmscriptenWASM.compiled) Object.defineProperty(EmscriptenWASM, "compiled", {value: WebAssembly.compile(WASMAudioDecoderCommon.inflateDynEncodeString("dynEncode0060Ôñ¥â4°pæ+ÂCã<=}M`CN+ñ ò»@v=L9òjn}[^·¾ms»h`Xyg&+{÷¬ßîÓé=@´xã,=Lñí=bO åKnNô®WNNoÿNî«=KÆ°¢ôêê·'õÆ%êÀßÔ¹Êöv`Jwü i=HHÛØ¯aIÛzbþýibàpàâbÈox=JàqÁmá§b412)=MÓ 05}=HøeJDöp±°ßqcãè©xÂ43;wT·»¥b¼·÷ Ýû<D!lÏßZRñ=J±&ybüåyüã¹üçq¼à¼äÙ¼â±¼¦=HÜX*OeÓÔ[ýô»n|ÊCag=Mµu8À®ÎS&Ýõkgm=JÁ51=LE(Aià`nÏCÂc}I=L=bQC´=KúéÏOÌÒiÚ=@GÒ[6Âz=MãE¬@iì$óx%þÂúú±û¯½¦ÝþZìæmy¯.È]¦ç}NI1É¯í.ÛÏÔ)3ËþIÄöR)TóòkþGs=I¹¾6Q7N5¯êmH§]ÿ¿t?ö'=L7«=I]OíPj=@q½aB ß¶Y>mËí__îvÞ°Ýëò0­LH{¾a>¦=M=IÎ©=}òEàüX´íÏBÓó!¬ÅÎr'y¸ÆFÍIâ÷'Ùëï?Ü9ÆÆÆÆÆÆFW_¿4±Ð$Õ=Hnµ©[Å¿¬Bns½ó©S½m°-`÷@ü(Ù=}tì¾BÛýZaé+OîX`Ç|½~ÔHmú/¦'eÎÈi {.ó°×ÑfÀà)B%NÁ~=­Á¾«Ó=Ka.¥8=H3½=}AájÍr=@Ôy=Je:b~1Æ¥ûºûj ÕÍM}ÉÛËÓ´ÄÜ'}Á³ÊL=}¦¯X²GéNqÍÊÍjÍ¨¼`8=bÝK7#É«ßEi9~z81=KþhÚq/TüÀQäGRÆCc(79ÍvãÞâG:®ÍGIè¨³Ïçn£ÜôX«ßòßa£ÅN[O[È½á+O¬T@án4Â{¾Î=H)]s'/=}hXO}VóNz&#Á¾Ôª]YK3ÁönçÁ6^¦ìC¾ß°b×wa 2N©C =H'Á 1°X¿ìa8$Aµ]=}UðPî´;eÛîoZj»µ%]jgotl´é]X¤aÒ.5©bÏ`L{¡1íå­J3ÎÓºÇ'úÿ¼JÎ6`úØwí[A.=L«M:Ñ??É¬âó­{ó2K×);sóázã´äíw ?ÙS^Ø#æÜÁdÐXîÄ¬hPÍä,ô7Çª?rmÊ´RfpUËËµWÔu#$ÏÛ7aK/¦=JH1¥ê®àÔzÝéäÎÀ&ÑY=MÙ4S~×$Ù>­­=I[Æ(=@Ø¥3â°¾AD-|ñ=IÍWx^²Ü=@/Éìæ:,!5}ìrwÏm ½¯²¦=b=}¦Æ³3SØúøá?I£Ùmº¬aE~î<=M÷q³ÛZÎÉ'ÝReZ)¾Hc[m3÷ò'º* ïñ!þ©£yL:*¥Äkt¿ÆÃn´©»ÚS!èiÅ8gÅcRòNªOlÂDn,z`òrõç¼¸Ñ«R`FB÷¡áºaäçÀ±ªµÝ¤PJÉ=@SdÖiu2oq»O¾Pvìa=LdÇT+ãXáîMø~à)Þû­ÆVpÔEözW^ý=I-ØØuÈ=bÐÀlvñÈ¬5EâÚC,4¸OÂfqÎý&ÛÆä±Mo%ýk,g4ß·2@¶|a§@¿1Ã¬fZ¢ÃrµÊïâ4@$g«9E=á)J=bF£ÊÜ2;Hàï3»=Kï2&÷MÊ/öU $VU=³²©ÅD=IpÄï)<B8ûÈÇÎþp£]GÔ¸õsß6ß[¬³`¿9%âôlÄ½åõBEíãþãgOã·×¬R=H{²µASÞ³ÏY­LãKÞC&¨ûmx­Yÿ°µÁ=JÂ=}÷Ð½æpÑÆó8Tz!£i%2ãÁä~4½äû½©ÎxC£»¥³`4@ (WZ¾'Ü!r¸¶Ê¸ûpRbö¯!óÁÊ{¯WÍ7µ[à¤ìïæbMKëß£eÊW;1==M5(_it³<=@»t(âÈè)1ày=J·â1¿Ýß#ô|1xÂ¦zoZc)<a#E ;X¾È[U£zÑ=HÊµc;Ê®§ý&6²¤!nËûÒÛÇpqõÄauÛaµ©Î(á¨@¾¸R2ÅpW4 ¬=IÅMíIw[(Óu|²T('5»Ë;ØSöäØÙ=I!äè)ï=}{´5{}0=bfà#®¬ÿ­Q=IÆ,Y´*Ö%´Ì³ðkÆefO×W¡¿<ÁÄ õÌeIw^¨½&=I&ÆÎÝ¯}ãÞa×Qk¡ÄµÛ#S)Fê=IÂQ@Å)=ô$QÛÌ!>6$Æ¸$?Ú=@+)÷;pü©it½¹õ=|qÂ¥êµÊ°òlA&w'2ÿ@c]Métm}|Û'<{ç5ç=HK½©Ïø~kd%² íþgcÅ³<ã¢:2bcëÜV È=@¨=H+h!8¢mÊL=KåUÁ·Ä»ÓÂæìß=}42#6äW­©g}=@)×¼ÑcÍ×¸Ö³I( XRÏ@0Z¹AúØ{}¯zýìJçÐób6j-±hÁ¬0=I:½X#áõìKùIç=J3oÚJ¶=bjùz«GJK)X#xq§ÁrkÕ=@ïä#B>óÔk¹ 1îéÄû»¸¿<IPm¿_B%»Æ5sÙI]'¿Y÷=£¢&òSWåÎ2°k>ì±ië¾ÎÈ&=LZþì_-ÍÓxôÛá}ßÊõk±Fmôü82Þx¾Yë=@Z1²YW«{ñr{r':µ¹¥=Iï(±¹Ý+|Aõ×jæ[ÀâU²¯¥¢¢Ëjo²ð=MsÚ£$Ã¨Í'Ý«qX®s¸=JìûtæÊTR=}'®Ìb£ó»DnNëàua`|FU|·À7äçEPÍÛXèÁ=LX©è_÷ >ÁPÖôÇ=bpnÆù²°­¤r dÅ8øå:$S4v)÷,8nQ Ä=L<=M=J´úG5*Àjì¸øÈÌezfúI=K-]UfISdìû2½hÊæ¨pê·1#$I[÷ínÁ³ØcT¯Ü¾Ûê[,½C|ýI£(ìÍ©$õôTàJµ=@gÎ/¨Nq!6¨«^Í?ã;(ê=IadÅ¹=b$ºÓ±ÝFvgv=ü'{=»4.äúZyyXÚóøáÞþ×ïn¬ÆöPÑÈã×$éºBå²ÀÌDf»½K5/¨ýòFøßÉþ_Ne2e^¶¡Ývz(n½F[î)hTY=IÐ´À¦¸jØLí{=Lòf¬¬uKUÂ`ÖgÀTpáT}=KsLÅÁ)H)@ZàBÖª`àPîÛ¨h:¢Èuq/%ÑÚ75Ûze@{J=LÉú@ ÚÜ^°¶=KÀ)N+¹^ùîÇýÓr,;¦©OÝíýà}¨=Ks;;ùúa=bÔpÌ¿%dÜ*Ôa~|öTp?«32T=bsi=LsNEoZGÛàëÎ8Tuû­h¥ûúò¥©U4[=K¬ÖFT %pflMàbUÒÍâ<E<Ôáäy;ûÉ8ÒJm¼¼º=MUR!=HW=M¾=Hh-J6'=Kw6ÉT#A:=L·(t&FjQÌzÊ²ISxó¦c|ÊQVÉÞÜ~'×8ò£Q¡/GV&VGBD5t%E=Hïi¶VU^]<å5¯SZ|dÓ=b»¥=ÉÝ¼y=HÇ%í­=H7xÝ=IÝú¯ö*YÓÿFÕo?òd½ôkT½êæRRàZÞC³P4ä 5%õf¾¢¡/C¾¦db;xàDiè=bJk#gasbÚÝKA=JZÐ%j8vÑ%=@J>_ð>Å3µbëcÐ+³¤=H¶¦rj_ê3ãXÿÀòw±½Ý;ã= ?ñÑÛÅRÑÐ_4x$=ó¹;dT=bOØ;t¢ûO,ý«BaÏ¸dL]ËVNÝÁûãõ5¢èÞ6ÝI`¿èQÊV%ðfQ½n=bÜ¼1ìØÃPÛ)SV=LKN9çÑá08µiKBSz68Ñ)}ÝïK.Lp]A6äØBc:A»]HcÂÜþuáìïNqm4Ñÿ'Vjy-Ìçþ¸SØÉ½Â[9ÍÂéïJXçU¤.RÏË²ïÍ©bF±)¤vY÷®£¨ÈQïÉÅ WR`=JOð´¦<øú#µ¾*ÑW3Yu±1'ÅäÙZ¡Ì©):ñ!ÔFùÇGw`«i-ÁÈYU(;È]¡Aüªø°=H¤Õbû¿=@ß?¨ iPKaJN´=IrO`2×âF-=@ê¡þ:§,sR(¦çÒñÑ¥´UOA_M,¨ò¡)Õ~úC¼(W,¤Uû£Èôèt~w¥¿RÛI@Ä'û.ÕÓ±ëÌù§ï1Ì½ÙïØ@/¡=LDnSO­)õ^ÎÂÊßv´®_doCüÇ>s>ã£Jk^=Mý©ÒA~«<-HP=}&{hïNÙWmes¿Ü}ã4]WUù[BGzópÅâ÷oÎ,q@§8òH`ö§Rh­¸Í$éÙwsb^|=TÕôo¡o9ÃT4o¯Ex7ù*qÃfZð+FW.zYB-=LPï»¨ÜT=LCy-f¼³vPôî¨ áîâø·üXPq5Ò7ÈüYÖ°=KÕü»FC$5°&=}%GSëF^õ¡ä{Ú/@åd-·g=I«¬î3ÃãÕMÖ!½÷­?yÅGCO~/VDôÀEZÛ×EÔø¦©ò¤D<AÌ·k_:·©ê°õ³+4xÔÖ^/yþîàÙàT#=b,|m>£àâ.KfO­îÞÜ¼Çð[6o=HûBLI'-¤=cý=K8eð=b=}YÝ¿ft~¢ë¥ÔÈ¥8!.Ï%:YB/ëµÎ3=}aéWþï_Ûìéýä@´NZøê¶[ð®jêYZ´Q½?Ï<=MÞS¨gæRÃ¶²¼«Øäõt^q~22ð~ÂJ­?ÂnÑdNaüñÜoä¬=@[ß^ÈÐIv*ÇÿèÏ¨jÆëÒá$â*è°_l°_~°U°âÜQ|Dßqo>rÐ9ìo;ÉµÏjuõÌ.üI¶Æ¥j£|«[^ñÏ?Ñ5mÏLªQ~H&^º¡Àf@².÷¹ãqïpÃ,÷ÊüFKþ=L½xÁð=KRFmÆìïÒF?ïâ^H¹WÇcoÑ)uû®<wÿÕÐ¶2éBj8ïÜubücãqíMï¿ßtp_Èg e8'ï=}×Ö=b¦N÷/øÜþ a¸!%±t%q¢ö=Hú¡«>²çD_K§H°¹¿$V´Gã©L'Q/1ÉÝ;ß>Ï<-bÉý;îþçÈ÷Á!8¾éËìS¡*.ãù¾£Â3·OFZÂZÚ=}Â@ÂàZ^«^}ö!äÕúÝWÍùM§ÿËPyvâ{$Ì !ÖµÀÅ0A]×JXyRÆ ÍÐ$´hía[ láÌsA«K'4ÝW=HÙÛÈ<ïïzÙ ¥ô8i²«nÆÈ{V+Ææäy²ò%ÜðgÒ¨{Qï KW§Z§ÿ?djlÛÆð¼QL= à°ýo(ð% ÿÁq.OV-°yFk¯'³WYcð@|[Ðèýej³õÍí#°=IoÝ%¸_Üõ®5s(¬=b*ÓÄ÷{=@¸¿¾ðóä){oÂÎk^~ðÃNÆ:4ß¶f¸msîéGuªD¨ð£ú+häíî¡=KÅ]Geß#øÁsýÏl}À]wFù´v%²=IÈ£]åj¦z+å¡ ¸=MæC©ßXòÜR¶v=JàpìÉ-À=I}ÝSSQ-´[?ê^¯i¨Þ=K:N=K2¡ç£²N}â*^Xçãk=J¯=£kß]D'12¿þýhfWª9Ç1ÇúÙQ>Û9ÎóC×ù _]=H=IôJ'%íTwKÙ¨PMðböÔâamP£øk{={^|I±f$g!°ªÈ I=Hl~)«ÓÝ¾f>º4z37ÏØ+Î=Kh3cÞß$=@kb¨Tgên³VçµF=bd¼¼ú|¯#-ÁùÎ*Å¤öUnÇÏ¹ä^Rý×R}>=M.§==LyI1ôLë><øÚÊ¬SÜÃ8,Ñ`à¯~#0ÞP¨³¨Ü%09kI<;õY÷îðRfÙ=IÝBc%Ò¿U´#=KÏN·Ì&i÷·m×wîú2¢È,~9Õ§V ÀâQ¥=LÈ'½y*cÿ]{=bì« ÙÜæN¼ ª£ýQÕÃÐ¢X¿dÍ0£uÁRo¯¼'ð=Ký}cv0+WM)½&÷òcðy©ýÏÝíÉr=L))½÷OÏæMÁ§Zf»(êæýéó&Î°ýû¨Ñ¼!?xJ^F.4þä¯aÎ^Ïé·ÌW9Ão5·Ãø»óBÔôøê­Ì3ÙdÇjWÈ­Ò_ü¬;2U×MiWóý=IPSæPx=I>=KPÿ´öXÖº§,¼7`Doáq+øÉ,êüTes*c=æêtû²²«©ô÷ªÙ=IäL.TýÈ¬)2Môö¨ ÇÓÞJæò+jOÁ¥Æ¼;<]=b.Ä`xíñÞ¾ûðñPò7DdÂ{°½E)ýðaÛ³=@BÐmcç=L&3aH¹(.ÆÅ=J>oNª¹=LÖlÕøÕàû­8K4,4ÎÎcÈsÀKs³ht=b®y¢´ÚNeÿDDdq=L+zzÌ,I¦8ø®X|]òrû2Õf¾5MÛÁò'èÈì Ë Zú=L¯iwËö0X$b)¹EYeÞ²Eg=KÚ`íâÈoRy/õ~Þ#P£üìÛ÷kø¤ÓC=Jöá`EëF¹ú~cv$Ö¨ñdTeÌ²eiZÅ1y1fXçC®I_.#å¿HÜï©*ý¯ß}ÝÛfHÅ¬i'.Ûz/YÅßûØ2²dÞÁ¨erÓ³/Ú¸náó|«y,Ëûrú4;ÍÌ¢=HÛKÓé¦E­=J¾¤Am.ïç=HuÎ)h¼ [8öJÝ Fí<ß¶u^ì]GV/6¥v=Mï´PDÓ}¸Õ°¸=@Ãwõ{UH¯q/Ó> L¢¥¾âiÉT··ø¢=MGò?FiV~¡'ö^A¾×9Âþ{ §µCÚD¯g.ó¦f®ª%y¬ÙéWÙ(äB¢q÷*¤êZqnFªah± ãÑþ ¹·ZÂ¡=I?Z+=}Z1Öõ|ÈÆÄxêµ}Û^jÔ>G©æÐ>ä¬~2¿â]ÐA}FpW<w3Gû=¡{âuK.Ãê±'¹@ÔöVÐfqGB¦V7¡Åå¾£hMf¶F¦pp=@û!ïîaÁÙPiwkøÀ=b`3J6ä=I=¸ñêYärßwóõWßW¥Ã^´lWÙ¢ÐÌÿ øxä½Aæ^¡Â*ãY31¿içG²Õ°n=@ã <Ýë¢ÝV=}Ç=HË=L¬Y·=i#^låHß©í:øUï¬À=@3F}µß_ólEøDAÉ¯´àûø?ôsºR¸Ð}«K¸ºG=bßÕû/G·/¸Z­}}·xW¢¡®³Ð?=}²40CÇ%ÍÝE*ÏVrÄ77µ?=J»®Øç¨#ï¸lÚu(ï°;-^´XÙ£?úØrsy ¸¡Þ_ìo^&H,</ÝE¯ÜÒwóä¡=}ªÐ¢­õ$ü@}'Ý)ÝÑ®ìá=KÙs^½Å¾æÒÉcïAÈ®áßW·Öz¿1Xþ¹BniIvF)Þ,¼.Wi=K®Ý=}åCòô.þZIû3½¿ï8QÛL!Â`0nà&UéU5èK¥úæHúÆÂ{AÎ`S;×ÁábnfÐ_÷¶ÜÜù:Â?æ¿±¨aòò2vù5Â·ªGHÒÍ²zâ`CßK§¢æà<÷¢û=J=K¾öb$»QÏa Úà3`Ø¯Ø`¬¹ãI+úÇºßPQÒZC¿Ô=ã_ÿ[[¢%óÑ£(¥aÅµ7ï[²·=@ôøÌ¼U<Ú'=MôÈH8ýå=@¶iøµ±Ã£)Æ4MÉj_n®¯+¸Xòµ/ï>~ëtæÑ¦/5!5Åâ©]â¦ãQÅ-n¿Ú¡4J>þ¢ýéÆmÏgèË=y_?Á5¯§ß£ÎZGûççâoîËðï]5§vû³iIþ²²ÉøáÇäpOjÏàn=bíuêådó®éâöÑÅpãçã¡á¸°}YÇí=@'Õ~:ØÍ²ûÈ#¹ÆWÌ^zÇ?=H­9j ´¿RPÅþ-Óù}3r=I?Ê=I2³¡Dtl=MÉ%;p=@ù*Þ©®YëCIHãûÚ¯b:6!=J«usv d£=M;ÆFP³¬ªêÝ£ s¾Ðözô^8Xj âÀ%ÅºëRÍ«mÿÂ=Ll*þÃÒß+tÌ^æ)8=!Fø>=MÜQÆxZËÃÊÜõNóµjÚDbóÉË=bÁü+HæEJNÒÑ×ø7×÷SÖy½çf=}ê¸=L¡tíav¦R2¨þ°ZÙ%{Z2=L©03$UÍ=@nFÃ¾Á¹ÚbX1=Ly+Fø-FèÙü-=JÙò-êÙê-(üÁ³û9l-ÌSûÙî­Á.),kÌrSÎ,Ãd«=^§%H1Ìøâ-Æé-óÙ&A=L²=JG*¬^ÈsÎxØ]y$ë^IRâýpN4±=H+jõÓZ=}M=KÞz».ºV¢æ¿»BTYyÝ=}É]:ÓMzÞ=M@Tv;Îqí4/ËHZì3¯/8AS§=L¿3+óÙùK´Úß$5^«dN¹1¯Û0ýC=KÕM)Öm=}YºËïËH.7j½=}¿«Ô->½Mz²7¶ÇMé=Mf^«]¹DS!ûã¯^w¥û=MiÊhköëm1ÄíH=oäæüå`ãyv×¿D<m.õ³´OÀR·´ÝwÀð¥gælÙXÞä|=}Sïtg};^à*÷ØëçÍ®¬Þÿëy=UGà²Úª=K¾~³y^r³òö:Yæ)=K®9EÁ?ÃA§½AÝXv=LPµî¿¼ R`w5·£üouËeu¦Ó»¨7Ò©Kñí|µÐM¹è¹»y8 «lÜPdÜN=L_TÔ^Ü=Y²ÂQ;YRðsMâ[NÕº=bâµ]MKíEÕxÚ|¨vØè@ÝW]×ÀªïXÅX=HC®æ£¡jº%a4=b¦Ï}¬÷ºü0XÅk§ø{¬øÇwKºëbB0j]=Ij=KÚÔlC~f=Hùg«z²wX±uÜø52Lù;ÓãlËgf_ÍñáêìqæiÃ=Kp0â¥=bÝ^/¦ À|Ú;=}ªè·ÐóöW½å£uQÉÇy$;{*ÀCÊßÑ]W¦ýtý=LZ­ÓRN+./ZSÐ5v~lû&y/=bÝ=Må[hÕ/öDT-.ë^Ñü³¶=JySÂ57üðd·SóI=@=M0oWùé¢ËaÍÙc}öXå Þ9@ä«=@qûj¿{O¤×Y<æÅ_(jXGÚ^|¡±{BcF{N²§ +®Ø»3*Ò¨òÑÒ©ÚZVáÄàQ#kþ6ëõdÒ=b=b;©¯à=K­2/Èò=I©Ú­óT¸óTi­2¦óT­2Kú©©Úã­¿³Ý=I3´ÿÈ=Jï5×ðJ5ÝÿQG¤©kóÔ%FqóÇj/ø¡°5 óïfðÞ¸ÿi|ÿÚÅþæ¶N©£åÆÖv0à:ýÎ70û5M=},Í;ûú5·;Y2 îàÖë¸V¸æN=}t9ÔÕ«û7;Ô%1ü{ÓfIY¹­/cGS¸ÄýÒ¾A¯e¼ÍÚ×ÑùÖ=M2sMz6GÑæIÙ=M½£×61óMzÏõþ­/:ÈÚæ(y..s7=@Ç§ÿ1|- Û¿î#-1ÆG_ËOa§ñé·ú=J*=J=LJ.ÎÕº½smc¢ba=blã«!hn!XU=J9»Éüc$=}.ß_=}y1>P»ÏÆ<^6O,~KWFû{N[÷±f}.¨(èØqQB%ëwN%k{ÓL1 à4@¸íiór=Án=ò!zª¿ýo¼ßÐ²Y`!½~ôàé7*LÝVÆòô-¸nLÚï ätbö²[N°æ]£|äõ`ÿ4NVB[=¤õZ­e¢cë¸­&* ï¯å¬ìpNL­>CQ[¡Æ#ÄzIyóER¶ù2÷&à×JÈÁà²ÃÄ¦6ù48=@æXûY¸Q=@:ÚÂ~cÖÉ¼3à=H]þPAüg|=bá[1=bÉÈÍ@ÍóBüL³O2)ì¯ÎÊzkÜZsW[*«úyø=L`GE4¨óUBÉnöq½§ÊÙ-=L.Ñc®O71ÓûhPó{6&oÏ=}ûr«ÙÞP@=b¾uÎ¦xkÜápÞA'º<3ê²ÂX*X5¡D`)=Kè²äMèÛ ·;¡ÅFW>ÖëN3ÍÔôïn¹xùÚ½t·Y|,åÁ¼C0>­üÅÓ;AÚæºq§üyñbg.´í°ûVxÞºÃd½}§¥ uÐïÚ´.sý¡Êä´Íl?Û8ëSÃØSSU3_Ö:ÍÕþ°åo­ñoÐÚ`[ Zb£y×·Û4õUÛjY//'ñáå^a í.|Gô^#mc=JÔIB=LÃîc´Gy· uÃ£³=KâÛ´!¼·sô<Fâ<Z®Û¢ýú«jS´ÛE5N¾i¬¾{%Ðæò¯Sóï<DKsGnhï=@=}4CÊ¡(j¡q,ðf>âJ°½¡I×qÿ¹o¸ÁG ¡;4?Ð­+'Ý£¤,UüØF¿ÅTg ÔÅ·*É¿Ô¼Ab(eõëÊp@÷`³´X{tvÝÅð|=bníèÌ¹s=@ßÒtø0$-åÕ4I=IE:Ã²c©bWH±±§=bû=HòôC¢²Ðjl=JhåIÕ7e¨ãf6Ø¢¿hË½ç¢µþÒ=@Ó=H·ÖûÅ§O+bK=J(t9n¼q=LÍ«­Ýú|Z]¹à²½,=IDµXuÚ0H/Æ³ß»¦Dqd¹=}6A)zÕ§0Ô²²û|¤=K=K.½ê=MËX<luõ<JÒi=dÝA¦)ÒâÃkW9Ö=Iû1q¨SÄJ>%Àuï¶Õ(eÀêý<öÐ?½VÓXo=I@æ5Ñ¥åÌ~&¦E¦Pøs»ô'°¨XÄY?tQWã±1=KÚXZÐÕÅ=L«'D¾}FÐ[xù*0U=@H¶ÝDí `g·õ?ØW=@ÞJxøvµeqé*É²$ëÐ5Ê=}}Cú#dyL++»Á,®d¤³ ZMðSm°Ê¹±ìxõ4,<g¯þ¡¬UÚ6¸Q·-ýÊÊú{ºM»m$7¯wK3«-Q[¯¼Su¥Ñò7£üu Âw|´Û¼x½µHå¥ÌÒÔûYÙ¾XØzwcïÔµV/É¢1_%È|p`­7Ø!²® ¾å=LcI7dxÉÍÇä{|ª×«ØLXµ*XWõäK8`4z3=@ÒëÄà3æ7cX£g@Û!Á]z¡.V¸1DåÑdí:49bÞJ&§=Æ%i&=I3JeünL`5ªÒ§ rÒ%À~ª-PËW¦¾%=};õ=KóaÍè%à'¯çurÊÜÔêE±¶ö¹ìWâg¹F=JX/c(ô¨ùiÁP¦Ñx¾?$_ÞçO×àp ·´l=HÈ @KåàqaÜ 4¤¼N#ôFfæ-Hq2%tIBC²=KÉ!¦ùÌkGtÉ¦~«MzØÔsÆ°´(E¤¶pd=@üÉ_Fps¹ª»µ@Ê¤ªÒèxà<=Kâ¥r¡'¤?ë<÷d}aã´öt=JL=Ks*Èr[v·ª8|&¨*y6J+÷þ¸ÛNåÉaDrtº¼©§³²<ÔG(Z;Ö^)_F_]Ã']3ÈõÏô=LrÏQç+À©YE­Lb¶9è*¦XõÈº>nGæ7¹æ¾n=}ÛÅfmíZÎ>çDQUû=Moò ÷øiÎîÑMúßÆô({µØr¨Ây^óu­«Ã²¥ï=KTBÀu+Äé%Î¤§%%fwh&](­¢}ä·rur@Ó×Î¬õ¥wâi=|¤írë;µÃ.È¥ÅóM=Lç¸){ÃÅYß©C>å.óÎÙ=I§ç=HVÌC<±jìèÎ«Ð÷ÕUaÇ»LÐÆL¨öÀôSBÆS:hëÑ'¦ý$0£ë×Ê ¹§]aÅW=M3<Aòo!Eò;=@Ad¡g­d&;è.}+HvÞ'Ö|·ÖÔkÐ9j»=}¡_¾Ì¨±5»ÂùH/ºìC8»+0S6à, sdc´xÅYEÉâ?`7t¢=J#háÐ7¾âI«=MløO8úø§ }¶Æ³HâõI©¿ÕöH!jÃkÆ u½þÍ[¨Öç'*v}ÖG8ÏäÛc¼UÂ¤LNªÔïþþ³ùÒo=Hú%kóÐñô®|pÈiá=UDF6:óúÁÃ½ßf=IDOÏ#íº=õG»Ã./qP¥_ú`äiVÑËÉÉ=I~¦Eÿp%ÎÀqÅ¥¬mãÔÓ·(-Ënb«XØ}­_è¿Áô§#¶ÂÆ®ùeS~Ý=IàìÖ é·þ=@i]=Is'ï¥#$ÔºVäìÁÍ5Ê¸1+èº¾¬Kõt3QY}}vö=H]uÑ4¡¢$TJcp µwozÿô¡tä=@ãÂ©n¿H5Q¨³nÅRÄºÊÖ~÷xÃÉMÈc!íUÒ-ÔäÜ#]Ñ«ñæ=@³·öÞf5sêç úéaeIS½ Õd¬ÒÉ æ;=I#DO²tRUB3°Ø SÆíÜøðû5ÿòa6[ÔÉåRU¯_HJd[ôÄ#¸ÇX*~xµ8ÌIB;ýÑÓîxêï7ºv=I_¶W`à{7»X8Ïìíy{VºfÐ÷AïZQ×Ý¡5ÝæÖjð·Õ=@L&¯1l0î=KøÁ©]3ßAæ4YÙÜ«?çuî¶Iãµz=L*¹Øåì³`2]3:72Õ0£IXõñ9Í' ¨äæp'á*×ÝAG2Ü_J~Ïq4ÏÑ«T±.?]¶=L=bw®´ïCÏ&äNïºÄºë$5ãÃ¬/õIä{T=LdAüôñ7qxmVi#xóÝ­ì¢ØBAq=bÓózy1Q=bÂôÆa*hÝ_EÊA5(I¤T=J2rÈ((=K¼)ZDbª%:häÄ¾>`Ò©·@&Î .f2àkØ«ú¦4îÙK<0Úér'­Ë±ÙÆ²2f%Qev¦,^?ÑÇkÍ9ÒN¬8úqðháfÊ¹5¤ºè2Ù&aV?UÙOeCDY»´hkÚÕ$nZ¦2gKÚ¡ØÕÆæÞ¾úî3U¥8_wÿõÔßÚ(Ð%!ÆÙ÷½¡Xáà¡EÛrÊü«EêÁX®Ñ%?øDz¦wp¡ÅI=K=}v;~7÷°¶¾I'³}ÕÌWÙl®ôøÃMzY{$zd^§ïÚÄéûQ+N51=J;½Ë5Áerº7à6«Ê}·Wz?ì°>øt³ai^ÁþÒúúúú E 5aÊ~{÷F¾àÒ®¡$tðKüöG8Û×MH(nTyÊl¿L9¤°TW«,Ý=J·³õ]ÇÊv=K¡E÷äSÈ¦-=JÑÛô¤:=@óÉ;=HõavÞdÖ=@ÕÇ8ñ5qU¢F)ÓÄ%æ!*Bm$piCäEz«¾?{=@G¸ÕÝý²?zj=}»o0¹©Û=J/&Ö@&ÃÞÕwÞþ+õÇøÄº6¹ørú·+ª:?×uÆæËi8ÊS&|-`iSÆ¶Õ=I=HY;úw:ùÇ=KçMÁÛT}»Ç5»vçô·=KYglBÕu(zçyzüÑgÊü7iýí9=@¬¤)«?²dRn6ùJäå ÒìW+lÔÅàÅæþW Ue2ñé=MBøeåæ=@,}+'c{úd¯ÙæfÅÃÒåRèiÆöåªAñF(6ÂÛo±& cÀ©îb+R¯B9óÖYv/u;m¾ºu±nRJcKØ v@êÓÀù£k¯Ú±Ì3=@£°~ßº5¥fÍ Ù=LÍmÄUÁ½Í¿Íyv©þb÷ì|EA×Ä·T#v-jï´Ø`¶ÜwÃÖ4ðËQ) Ú/Ý)3=L'±'¦6ù-¡KÂýOGÏ=MOè91ÜÓ¡Ë~IÌ=L$([³<=@<#ÖB±îo?SIÿ^IçÊ¯ ´Yh=K~ÖóÖì¶(AJqå¡ápï6ÊJÀU 2% =KtøPñpl_ M9L.d*1yôÏóõO=@óöO´ß?E&6(ÁêutÙûÅ'>ÎoO8 nÛÃOV6ëX?ÂïôH,H¬Y=Hu$m2äVJ7·f!ïhWy{÷ö©·¬=Jm$Î0=J%ï¾!n¼ÇLø¸Îræ'ðOç5'ø¾0?k0ã÷ã^ÿ¬·¡0ð©]5±Ñ|²2#ÞTêÑQT=Hd_3ÓW]=H[,&JåéûuÁ*xZ^y»¯òç¿-£´è=@ápnN¼ÝÓÑ[uMB¾2çü={P^A8Qa`@kX%wb®Xåß`YAEe âÛ§Õf>ø¾i>ÇÝoaMTL>ØC½O¤rÛtxüÞäE-á*º·[Ü{È}nr=LäkQ¢_þZåàÍLÖ=Jw l±};Â#||U­k¼À=!8­Õ;«G¦ô]geÜ3¼¶iæý·;­T]sª R¦¿4OÃÔÛ²Î°ÌBûn)JºéSÚ¶Í=}O9JªeÌ(0;Ødü¢8gé®§è%X¸&lÁ)PôëFZ$9ÈJKZ4û;¿÷ac'-BóQUÊiÂgI¼PÛ°ký¢kÚ/ESÞÔç.0~õpkELqk=L=Ièªá7ÆQlSìîåîdÔËÅËÕg L©>XÂI}p!@§g=KÆ1íÁ/rÝ=b%ÖýÇS=I­¨ÖêDûð!=JE;hIÂòÖ]O¡³¿AXsé§<Øµ¨þ/´{/k,tb37a»ìUeé² ´öÇúþÙ´~áà@nÖCãÑkdP.¬RÏNpEoYõÖßñÆ£ÛXG=}#§Ìw¨pÔHqÛ´A·¯#1,hßlMUûÑß¸P3a¬X=K;¥WÄÔ¹tã?§P^J,®Y¨s­ôú!BÎêcHyjKÕ®µ1=Hê{%ëðÈ+Ëá¢Ä¬¿d×°¨Dsu=KQ÷#Z ¸.Ñµÿí+3Öóæ.uµ?G5Æu0ÖÕÄ=HYvZMØÙù=H|c×¢qSÄ*I~àËeÇ!=JWøbú¼é]@ã`ÕgJnô×V.=@ðLl=}0yt=b.pç.@ãÉW8¦(µhæ2TfÜ´ÏÙæÙÎ.>b´uì?Â'8/¶ï#r=@Wâ¦mQ@ñ>a³`þÙæe'ds`±Nù`=HtÉ¨ñÙj`¤%ÝMàZº=HßDý¬},Âà¤îø®%=@ãr;6õ[.*=I£×ÓÖúÃ8|=MØ/ÌFºPÄí¡ÝU¥Õâ«ZBWâ-!sCý¬zÈ®¦ìÝ¶«HÍXÈ¬æÔñ¦Ng>¡3q´f/R1ån¸¥zËuëRÐ ð<1=t9õÁùð)yÅ÷dírf';;¹øWyV·fþÆG%í-VÇ-öì=J8Îg¦,u1'3¶&ä:C`?eG|f[v6ä.UPSí·ÃìfRÕÖÂ=}Õêy]ÛJ¿fS3ªå¶Î°yöùòhÝ?$æÓpãÄÄÃ¼k*Ì~ê¯!Wê'áÄç=M{±/x(&áRÇÜ=IBâ½C(HLÚèè¨BF=H¯5í©¥ÕG+êè·`+[h=@ö7$92b¨62ÌïÔ³ ã¼ø=IìðØÜÕêm²@þëÁÁ*Í ¯ ØâàÈ=]¼÷?cqÜ¤å¥ÁX¡?Û»}wÍJ{P`ºUïÕ¸»6?µOö=}Ù¸áÐ,iØºYc°y§6÷k¬IOïl¥IóWÂ/ýÍ3=}ÞN½¸b6[¾_FÄWõZ¶äÒÄBïS »eÇ x5ç=@«¢ûî ÀË=©µnkPËxMÞácÓ-ã»Fæ6ÂâB÷>gÎâYX5ë<åÐkx'<qíbÉ#8]ÌÄÂoÌU«f.*aá0èvMß0ý)ûZ¢ùQ]bC¢`ýda:ýZó] b0Å¡ÖeçÌ·Ý¯¿'¥£ëæ[8Î$æ»he²*>-$j`¼ÏÄW·]±yYz$KheÌjØNQ8m$zÁàÌÀY®e/®ÄT=}ÅDï6¤ö=JïinüñTMCÖÇÏ;Õ÷=H±;óõEb:e¿Q<ÍU%5t0?Òq]Pº±g{HtqÄ)5«öùº'9ÖeÙøn´£:kz9òÖý²=Í@Ï?ZE1ú¶À.J45m0-ªÙH+¸¶5ÛòÒ«ÄËsÔ3&îsÉùË5@J=IíË{¥Ù¬w+cQ+â±9m£»/ÓcÉ-68]¶ÙrX<ÍDg@ö%wJh&GõO$Xæ¶?ä·èÅ·éÕÔDv/¤ÖÍ'ÃF=J;ª!  @(=bðÈÝôPY5M½>ümNBê¨m¼U]ÐjÌ1àqÿ¹ÖH¸¥%«¼©vdaß2â­jXËÖ[}£K(¬1»ê³,é=MþçÎL²6ÒJ6¡ÙÛÌwY`£¸!=J±E=J©µt¥y+ÒVþ3ðxwâ=K/¯¹ËH·=I¤Ý³¢2FÓâá¡5ëÄÈ=B[q1U·§%£Î¦=HB 2Ã£RÆcÔ@ù§·°&4!HH+ãØÞò¼¯¹Ìy$Lèv°%>¦#¨Fªní]F*=@®X×jPs{¦×f6oÔfâ°´»{Ù×=Km*p°MÈ3¿Ü»=}pR*¢÷ÚegÅÓæ%#Êm»´atUÊÛ£=}Â Ê?¡t=}bR?ÂX{zÝ×+£7ö+KÁw³>3ø{ÜÈìVE|oNG~£Lì¿ì=LÜDu^'èï¹¥ÜÕËd<!©Ùõ8!ÿÛ49ö_xª ÁBµ|#üÔ¯M2=M÷=MIK*=LfQ=JáÔÍ6'D'ÍX8+×8ÍT¿kuðjuÊ¢äÉ5©=}'ôü[§6Í´1½ÀHw¿;}Hµfæ XÈ®lD²ÝïxNnÈ8¨BºÆ;T&;Í5!e·0Éë©si3n|aäî¶·çv@­ÉëÎª[Ü«±¹¡¾DÛaYyÒ¬ÜÝ=KU´ï{ÍN41ÕåàK+e¶Ê×ò­êiïãÎ¸|l]=L|Ñj®éo,¬}0îA=}þE=Mj9=}vÐÊÆ¼ðV`©ö³nà³ÃÐ3 Ï{à=JØ´*+Ñ~µ)ã:ã3 pÌ6 ¶¾½k-jZµá»á0=Hý0=HåÎ±ñvµæ¼cá¨øê`=I©õ]á:Ò(=Mhø=I@F5äõWe D=M=HvfSpã=IoèàuÂ'¢¦[¿ïÉ¨ôÝ`7Ì>¥ù,Ç¬ÌtÌ8Æc²¾NÑû<ÏË³å7-D**4<GAl¨FjÑDà6Q÷óµ}¿»66ñÁ-{û'Dé =pÂsíâËö.8¤ÁÀq9º=Ié}¢Dólðn¶>ì0Ñ¶aû®©§k#§V¡O$qo%BjÚ¤ç(d'Uf§×gîÃê=Îy»=J³vµäj½«¯ÿã=bÞÆ=@9&ï$G*xEHh+=KÐÛ¹ÔÈdWè¸ôÚÇD£´ëâèw{Oÿ×CÀÙ'¹§éâãÃØYZH·}äÍ¢×HöB=J¶xò·²=M­¯_`Ä.¾ü»°qiðÞ+Pg¼â7Óæ¬6ýÙÒK,G3ÙÓÇQ¬J«?Â­t¾åýÖ|/&sìÕ¤$T¸ë{ÂÌÈ=JfÂòiÄ=MnVMª=KñU%Xý:ÞbãwØNTÅ¬s=H7¢q>$»(¥3kØ¢¹H,[%´ÂRÒd`|á«]½¡U±0nI5vüBG>Ìgs­Æ- SH1ÿô8ñÊúÎÒbqÅÄ=}Oä»îæ4=Lõ=LhB³@¨¬¶¥øÞLr¡§ÿûõ+Åö¿+ï=}2iÊ%4É6áæd(¼ËÔºg=@yOøÊfðqø~Ô¸Í@ÑÀ*.ñÀK£óQº¹ÊÌCÄ ÃçWÜ;(<P-uøæ IRÃÐrj;ö£Î·O¶,[iHq»ð;yíÍóíÕK,F&÷ê:ÿ`rÍéIÙâ2s}KnØÓ{ãôâsfSôyõ}ÉvãÄàbëÔ½)Qññ(Úoòº:¸îÏ¹÷ÄcP@LÕÖW¸@(îõ9-0ã~ÆÊÐE´Éìßp$J¶(®·Ó»¯=@ÃNßz¤þi_+CdØ¡(7kmZ3ðò¼]6ÂòBjÉeÑ<P±Ãÿ£.Åv¸Ã¼éY´ß©´'Ç}r=½=IìÆ}¤­=H±UÜ»Âyð>·¦º9=J}áK=M³ç94ÿ3{çÐè%¨_ëÕ´ùýü_^}Îe>*?6çÐÈÚ=IAXèé[N#q7¬Å k=I0Â]«e0v¸4¿ÆÛ=I^&°îú~§8âJ&Kç?~Otç÷Ï4z=KvT­æÏ½ÖúÅó¶fßÕïIz¿¥óEce.Ñ³¿¦=H~|µoqc=H=}cÊ­`íØà:wS¸¦o¥=IþóAgAÛsO('Ët%ÃX²Ì=bI ×|®¬Ík¡~Õ#BbÏF|Ü=Iu.íÊy=M¼<Á=}#FÀaoî**~BÔZ<x¯NCúâÃ=LÚÆX}Á½Ë97¸wâ&ÇV`=K£P¬=Js|1*ñÆ¼~MUl¢§{wøð©h=H6=HøÕï=Méì7òìR.~´7uþKØ=Lê=Jþ(¾û£øÀ=KçÂËÔBÝ¸ Ì0 ÑçÞ¶ÌË=}8=}vFî7êÝ=A)ô¯55ãqhP³¨Æ³qðcõèùª:D?h[®ª¡?sµ×äÏ6jÿaw´=}Ú8Ë$¯M1ºÚ6CÎ·cr=Lf0`Ql§ç·¬·LÑÁ=@/Íß<[sÃKQç¡P=J¦¼=I?Î¦Qø=I5õö.µ)upªVÊkÊZP<Ñèâwx[µU]5Ý8íz$/É¿l9njÙÀ,Z.i*bËÚ8Ä/eÈ×>=b3cµÅ±Æ,)ýlúëÞ=@G)qù{=MFÃÔ´)|ïÛ¼¬TGÒzÐ,=Lrï-%[:{ÝîTl¡ü¡ýónWÑ-)<ï´ðÅ1¨aM§k=@>!qØÕz£¹êúHÃ×ÒË->äé=HÌ-óÑMañÁß8ößíëÉ¯ÔË!fÈåóW8Û5Kô;ý­9'j©bÒ^Û°J3VÚ¯|&|?íI|åTÊ=HDÊë­Üôra½;ÏÞVwoØåT43!Äo±§u+îBµÎrÓcl~Ê§úË·E#T!W¶Z6*ãÔêRº=IÃvi_¾½¸§¶_}4JºÔ=L.¶HÌØ¨¯eXIG»0ãð7=KpâïË=Myâ´¿§þ;H¡þHQ%o÷=Q-jÌ²¼-z>ìïEç=JW8Þ£$ø*êzO=@=H=Iö1ó=MR>D[5ìà3^4FdÆÏÁöÊàU#V&´°ô$mõ)n,=@¬ô¥E0è®©qýÝq§Ç`äýö=@½5gQx©3×Z?5ÓJnòÁ¯¢¨ÐÐ:`-Ø6¡í~)c½a]ñ+FäM²ÎØcvLMHAoÁ>³l!×ú.åle±ND=}ýE}~ùUb°J8ÙqÙ3p8ÝúCnÔ§y=M<)ú³²ðù'üaöåËóÚdô( $#ÔÒºç¹Ã¢ûç0cÈ?,o¿o!_¶É+½äþ!»Q-LÂe_ùÛ>Ø_;>aÁª½ÈÜÞ(ÑX9UÎM®Ý_gà&GyÉX`A±°h´.Ú² ßßõb±e»MnÏaTdkaÝýD¿4³éáí/UZ6oªck©ï*fiO7f=I´m¼µyÚ=y^â&qêýÈ:Ü/q(p¡[LÜ:T=H»¨Éª!x¯%]`=}æ$»âµÙ'=²9jX÷õ=Moªµv=J§vê=LÑ¼!Ø=}åM¿Ø[|´=L§/õÖë;ÖÞ=K1v­­ÃNðÁQÔj=HúJêõÊ»üËJ3!®¨µÂ©öyÈøÌïLN%c0é!Æ½QË±ÕðmR?³Ûk÷PÆ[q3ósEüc*E$ïPÝ{»´Iôj£ÌÌÜ¶[H!ão,ÖcÏ&ß`L×«°>Åj;µ@îDCzs^YBÝ-VA®*ô¸ÇnúÍÛó>ó×}ÿ&¯`Çm»Ç`nÄdv/É=K'&þ ¶qV¨în¨ê `ÙG(çæÿÂVÏ(ë¶Yé=@VZ=b»0ÑQçsìfßH}D²öÏÝGhb]ylÛJ+è¯E¤v0äEúFvão·ßpKÒo×Ï²­È²ßiêG¿£Yi7Çã=@ß=}SÇ=KOìÜÎÙæWIlC~ä«©&1=HÊG!¶=Hökn½PCúÄÏDQB]Ú+=H}PÖ>÷¦`x; ¡|¦.Ý¥!ÖóµkµÜ²Ã©#à;!Õ+æì³qOCTN°Ôõ;Ìmxó2ul~þD/¬XÚ^ü¦dÒoj!¡äòÎõ%2¶æÈ1$sJ=IÎÿ+w7õîPpajÃ ãW©ñ=MaD|ÀlLs¸}=@håªÈ¥<ýg^FýoRA=K%­HÂ@®6ZEwÖãÌ=}¬0ï³­:Ëç£=@=J|Xf°`9ÍÑ­Ó²JÚi«!wGELm4]^<;Ö¼Ô=Hêbã(]rd°:ûw°@8é»mkütgÏ4Ä{+Ô//VPéÍW8ÉAË>ö=}{¸¬7.ÜÇ=IèR¨{þ=/Fúà@ÎªàËõº«Í`63ù=JUÔzþn+f«r{S}èúÕ×§f}7`bB·:A{Yw¦ÑTÄÚáï>¹GTÀ×aM£¡u<m&Å9¹~Ùp}Î²Ñbãÿ(Ïý:Ý6º­à¿=}ýÅÉ|D+_^TÍ¤ªÁíçF©RL1Ð=Möo%µ¤<`´]ad¬ÂX.Áú s9GPSÎ.½n0îC][ÐMîbÌ'8j=I§ëª=KýoìRuÜ4__ç_dæßO¯_)C=KCpQºÏw[ú`k{TK?äÜlpÀÒ-¢6CÙ£7T3=K5p#¿m®ñBMÂ¹3V}îø=L¤%lOs´+¨?_5Èj^Åë£Åäç¤±¢/2c¥Fs´v«ä0Iå§ÐÃ=J(-L'ä1Vm¼&kä76Rc_CÈÍGq¾KÎlÙE_ÝN¿¨ÿT­µº<)¤ ³Üºú6ùRqÚ`yÅ>ÅÖ=MÁ=Mr:3­_Ì=bEKòLd4ÿ³Á(@iÆ`²8Þë¯õÅ9ldy®6ìYý¢glµPzß(ç¥páÜ`T²PÌê=Mô_­ïSæ+áåÌKEpaHOÝ·ö{=JrÜK¬zÿÐÃ«¨+U#=}_:ÜÖZ XfÄ?F%Ê#@=}È~hIø´¾=MyïEA,/òUW?=}uÒÚßÉû5&%Û^-%Ç+×¯Êþ3¤sþ?º^ùoQG;MËCñÍOÉ_7?ÓGß÷?×dWÆTYÉOc!Ø]Ò=I×=}=H!Ú¨Ï¯/ð^B+ß/OY=_¶ý8QB=I6ø¿oãj)?æ[µ_|ì=@`}ÈoGó¢ð¨>r9³ÄÙ?F~ÑT~äµ!àÊm¡(;ß}£Øf`Ùp.zªÐ6Ò¨÷ö[wÛ=He6d¹±&1LøH±r®@û:=HðÉ·/«¹Ìb©òmªKcï¬¢mRM«'=hÀhÒØsãÓÒ$m}V3 'º~Ðiì©sÅË)x%ÿpø(®¶ñk°ãeÂ+XÐgË¹ JEé=JC³=Lhµ=Hì~=I8¸Û³äe'(*À÷¤Òoý¡}U¬Reð¤:{ÃCCà»Ü*Ñë±yÎùÔQÊí`2Æîv]z)`¸äÏ9=J×#èâr¨Ñä» äïäwáÜxºÚrÅ{¾Fô85Ü£j=b¸ôC¡ýôF',Ûò ²sºãhÿ1ÿó´ÁÄ·Að=I¼Ë×è9ÒS+Jö5¢=K³¿¸gý½=@f<oeë7ªÀö+ ü¥=Lnç¼H!õÆNèÊx¾&Ôùdõáì¥¬âø<ÉF N¬Õ¼ÔÓµá;.ñ+5#ø@ù,MÓ¤$²`nC«Ê ¥×35Ô½F;üù=HØ|ªù¤¶{àW`=}Zâ¥Èc«&¼£]pí(/4vF9:öµ,Ó¤/T4¿Â6^T4LÙÒ=bwXå°ª³Í.²üÛéZ?¸%bÙôZöÒVÉRf=Ç}~ÿüeÅ¢©®2Âê6Èqn³0«Â>Cõ»B§f»²-ÄwMÅÜ|I¥¡{ñ6@(bv ^9,Þ¤¯Vhó_3¨rg9î¥°yrÆWOÿ=Ji+tØÅJfnZÔ'o(yQ=«ô®Ã«Uìr@D¬*ø#á=bÌyYÅû=}!²¬@àXÍs²Yùüùbß=Mh³<G¥¡øó3=xÆ_´^ÜÐsÎ{rî=Ms~p_þ©µêÿ@J}1v)bÌ¬ÜFÕU_ÆDÊ,A[ ýFÐ§?.Ò0=L=Iþýe)î^ÄOa²éê¯i5=@Ò~Ë´»D6°r=J¸Dw´y !=}f¼Õþ½</Ðij}*e­é~=}Ótð²ÈNô^ÌxE=@R«¡íp¸%­Ðxù¾CÉ&©¯U.Qý =M¬]åJ¯ÇU[¨Gb'x½õ¬5P4;Y>cÄ4PWeúáØÅUW2:sß¾Óû¬á-çÜJÊz.·!X1Ó(¤¹áYÂy×¾/`y;¦úùÝâdg¿ôÍ/YÂ=bÅwµ®=¼7+IÈAEE¶º¼Z­ieÕáÆ5tmªî}ïãI¬åÖ)8µÛÉÒPÛ^«ÍËEgøÁ=LU¤tV Ú´ëîKb6Ù×5¹BóaÕM3õá;´!=L×2ªXG¦S¥uA%-þIW^qÜ«tzðsFexÊ>¨#ZßÿûÈ=bZânP|3²ÀHÔaiíð`Ã}*k)=Jî{¾Y>%ó¸ß¼cXßHbçÜ­[Ã$Æ}´íåIÂaîú(96¦|ØØ#ð +Ð¢Å¡õîµ¤Ïäõxµí×Év¹®Åªs{<ç~ VÀîAsçSº,ÂhïÆU:(=LmvW«ub2ù±ÅP®yçúÙùa!ê=@=M÷/WJ5o»xÉñM¶Rª,K_Xûñø=J°¢¢9nB#6½ü»¢aÿttñjÑ®DkÈÍ@ ñü§xóØEÀ{íY=³i=M´§¦mw3þwüìAÀõf¹A?Å;­+ÄUGÈ=},£qÃ`¨ÿej»¤ëÓ<Pî/Gÿb¸äDp¿EMÃ½ª4øfU+Õêq=MP<OvOÐÞ¬ìÄ_=Mse+¬//=HÂs¯O¤íE}ÜL&&ì4ô»>éâE}ÂBö×¨%NÐKÒö×J(=MzÝ½ráNÌ=}Üìw<é¬©»µ*ªQ±Áq¹Ä=bò;¨õòÅ8¡;M¼ó%Xx÷Â»Â4þ¹òm©sóÆL«ª$ÕæLy=}=@p©ô©<pAzØ:pýqe!3÷Øzhþ|!Ãpv!=}Ðµ|hµìh~!9%åæhÓi!;®Ð?qÓk¼co=I=äh+îð¿;2×]­Å1a¯KA}ãka1¸1«=MBÁ=ý)':w3D´Ô¶]òGÁTE¼Í.BOäÄ­øZf&¤Ø'|Î¨ õEi%>mSâ6ÙbE_í«mã]=}¿=M>?.ë~3öÉÞk'­=bÎÕ¶o=K^S7È{=I³Rå0þZ6@[]@ûvâû4+=.þ%XîUMÑx?=Júù¤ÌÅÉ÷¥Õ£±MýÒc¡ª=}P=IY9§.àDMØØ#eIÒéñxøãßyQ¯-BvW#¹/ZèÐè%®RÌÊ²Ì³ÂZyî§¿ô*}»Eë¯ó(í¬¹ M»^¼@:!*Î¯óì<4FêgÆh,¸¹¦|bS4n[ÐÐqäãÉÙ/SöëÝß¼½ñ£@¢f~·Öu+©ñm=}Ç­p»É;eúÒ¦3îÅkÃÇîd²,û=Hö¡ò=Kc*Q_ZnwUìÊ=J<¡ÍÄ¤A+EÐÑ´,Sç%).¢=ë·ËPý=}·®ÜM]Ø9/îãñzOñò-OÜFÏ nE=Häöñ+´¿=}ÏDKï¦|;òôéïcQ]~í:w¢´¼ºÐ¼¯R¾é×¿8[KN=Ld»Å»ñªR¹Ò$=J$í:¾w±Ñ%|»¿Bäa]À=IV¦´hç¹wøÑN-ÜGW=IRN-aªiæB)ÇHÀeú:î¥ÔÀó`í¾øãFL,ìHv}=KVÀEÌh;Ã»Ê%~T8:ã4Ãa×0ÃÊý=K=JÔnc=H¹ïï`Óõ#lð#~;[=L'=Ht~VLñ=L`åRfäºNU¤¥Ó=LÂÁ§qb6ä%9ëèÜÍÿ=bóÍÜÎÕø ÇÒÜÎÿÂ×ê9%yxëö[Ëbê²ÓãF=}]P8:Þ³ &*åÏµ[ItµÕqE=}uÐàQáë=b`|h*¥jr=LS6%*X=HªÛ¡äÊÿÊÿ8h=Má*¾Ágþ=M¦=b]¶ëª;S=LÒ>¤8¾ef3ÜùM³ûÜð|9¦83¶}(CÈuJw¢r:ækÜ4´<Ìb6På`NË+=@=}!xüÖÈÉô·Ñiq³éîÃ]'=H=@(Ð!çM5@7f5>ýë5qKPS:ë5¡«y'÷â:,zBµp®A´Ä£ò*[j`v]/@cfEÇ 9%=JôRvÏðL#UæýéÝw¡3]Ö=}n4³¦Pã*Ö%î}PÌÙÛÑE²:¡±£ÞÌT=bÌq,¨ùoù»d-èvq<»¤É·ñ×ó¿-ÃëÍÍ¹N²Ü³¤¬wÿBoCåº«¯.²ªÈÏÆØ¡ì{Á+Êtr]µ>æÉ{ºúºêf«°Þ»2Í(#»{Æ]>ÆõoÜºìdÀÊ±uìÇ_Ò'@­%=ó9W½´ßEúºe²ËBht>:öHå®± ¾Á1<5>$È!¶cY×°¶ t=bqg0v>K¡²%c4ë?£Gñ08hi;w±FòÈ~zÀ·°'øÏàÅ fðV,2=KafÈàÂ»Â³8h·éE5èê¹æç~R0Ë;MjmuÚ?:ÎÒ÷¿h¿5Íï*S±jÇ=}g^íj§,,µ5s§9Ý5mÈ=JÃ>õ<QnWÊ«¢Ç³Õû;mÀHûÐAHàÌK¶hiù¢áîñ[ûNÚ Á4½i8nà®+Äjò0Ã¸=}Øyéî~;5ÅW:¡b-²OôtgLµDÖ¹ÔÎ;²]w2Ó_%¾!¨1Ð¨=}ô±:U0=KÁ'{¿=K05ëïT£WÔä$çMÐsãÉ±,®pmyRÕ)òá=K¦.¨ÀäÔ§¦CÊ#Å¡ê¸Ä×µãT±à|èjÔ!1ñæw»¾zùkRÁ=}}Ðaý%ÃÒ»o¬©ÍÖÈjBfËì[?p¥=}kÕLÊªù¿HXQÑ÷®«&³ÍÔ¹Öª=ñoíÊÏ=HVÖ7.úf=HSmX²ªÅ®.GÛÍJX5=L¡>×=b¤(ýQY[Â@è=}=I=}ÚÓ=I?£Æ·Ð=}ühî_=I£ó=}Æ/=M¬-4³ÍI½ÿÈÞOÈA=@ýU³V©ßZ¶W²=M+ù«£Säël1Ö9ÿ_ß°Ü²ÚÈ¾w-0ÊÿpúrîKõ)YFÞR@~§wä¬à(é=LßËN^1à$4Hò8ÈJýDÏGö´´ ásM7þW9Ï'`æê=b].º¹­<T@·ì41)#sb&MvY¡úßÎt¯ºÛVðéó$WK~ÐèQj-%WÛôMÆ=@Ùk}È=IU«õÄ¨'þ}{Zj÷ÈX¼¤4vq#~ëºãD~¾!aàQØÌt·ËÑ=MÊ}çEßâªú.òîñÌ·_§+Ý÷øçññdTÂçÑÑ®»Ø6^ÓpÑþÖzaüãâ÷À=JgmW$¬aUÐ`yc ùÁÏKE4ævÔåuÄpÔÓtY®õnñ=Jø®6ü%Â³¢¤rîñÐxq½{ÈÊûªR3þ2RW5ÎÖbûg2`®õ}FÆýøÑ,UtBø¨lhö':s<~E=Mû56I®ùpgR´tÖô!`=}¦hG.©Oá=Iß]`£=IØ¯yÙ×ø×ð¡2qÐ=L0ø1.&¡Ì/õMÔNÃÕ$sD<+È_Ü=HcMÿ^ó3qý¬ÌÈ¯õ¯T¼³|øm=JäºûÖ¸÷IÄEý<¥çzZ}KÐpfg{ÊöÎ%=HÊåR©Æg[5vè<@Ëx=Kw=Kµ=L¦@½×7%Êw&Ø7I¶å»x¿¶Nø¸UI ºQ¼=@uÍ+w¹mäD²»Ø£¢® ¹û/ÅÝ÷=}ëØûÓl=J=bZÔp|Ò¹Â÷ÕÚ£û(Ð¼Ä·«£}úü©=ITr=IÿÃu´¯LË$bÔL#Y*¼³ùÔjí/IÊH¥Ôû¿$N%vë¸û£¥ÔµqéÕFR¾³>,yYjFKNægÚþ{P¯ÿb8À¦ãï~|c*ÿfßF^XgN0?ÁÛ=b6k;~?r´7âótW¾=JH1V=Kw_îÛ´ëÊ?!Þð2)(R}¼B¦ÔG¦dI[¹¹¥|5w=K´û~Ú$:w=KOæTHM¼=L)-HM¾=L¾ôY*g®sÒÉ>{ùF2±3¼*Ö÷¬ I-GòFòF2÷áÒá3ÿ/ø«ø«+Å°wÊën'5õ[hVéÌ(Æ¡êï¼CqOSBcõ¼«Uø¥Ñk»öZá/=úMÅÄ·°ðmº19Çúê¨T/,¯õ=JzÚÀÛqÜæ}Wo_3Ç9ÁÆX9Á×xe.Iû=½X9y8e!~c7SQí ÊñÊmr£mbT°$å×?RQhz®/¾´%¼ýÙ¶å=ÿÉqS:Êô|Ã4ÿ«®6ùÆßÊJ1C´1LÍRYfóÊ^çÄîóxQÊà(VC3ôýÅÇÍZóç$Ê²çx:eÍé=;V$g¤¯¹ëï°â£¦¯uKuîâúKj^ú2·e±<KxH¶ÙÎ5ï|ÂÕ»wQ¶}Bæðµ¯°O=Hð#Çòypþ?ã>1|üO¨ïM?;xÃÇ4=bG¿._ÐVYû^)=LïAiü;Å8e¦*=}Ð¨HZF è#ºBé=JÐ¬Æ¢_Ë¶=K>Bëì5³½/{¯¡9;¦_)Æ·Æ+9£±mðX»=@3Ç×±Cxìur±Qh«ÓïH§8zÛ|!H¾¯ü|ÙÛ¡r#ÿ=JD8o®á»L=}¼ð=Mã>ÓÅØõ¦7zXÓKÛXÛ´>ÓùQÊ¶W­mZ4,wËêç%ªäGìÄ>»*ºòÆþ/û=K]õñõ=IÜ$[?]W9ú=JÊéeÆõ@h^Ê¸ß½¶ßcdÍf¨qÆy8OÁ+S6åº=Iø%ñ ñ]eó=IÞ Ã=LïôÞó+;nq9Ã=åò÷~{=M;ø/Ëµ8·=L)à²ÀïoP_õÜ¹=M¦%:Å©ùhû­öS3Éÿ=M½ÍiÌGéW3¤RäSqDM¯UïW'ngýij_äXâZ¸ICG®uÉÖ_N/=HþiU´k§´záË·tmR=I,É¹åW-°Ôl¢Y=J é¬íg[²QÎ¾ò/8 åôÿàè:¨¯íºàÇóS^=bø*íÊ#Òyz[àEÈîæ=}l°&©Ð_{k+uºJæíaSdDlQè*su÷À¸:M=}7¯PX=J¾=I^=J¬lõ;ÒØ:ºÚÃYIãÞÉD=bpu7Zc²=}½CìM÷ÁLõe«$4ÎÅÿNºªW÷=M<¥Ww=M¼[â)è-3¶Åi*>Ë=J®0e±å¢è¾j19Ú7Ú·è~,·Ç1=Kø¥WÇ1ÝïN=b#oÝ!/_n^J_DÛokGzÌï=IÆ=Iôju2R5ÉôM/¸Ç=LwP÷.W±F43è»L=M>Á$.U÷%=Iñªå¯O;;=@8çàpqZµéÓìN||z[JÏlÃô¸Ý=@æs¥ºvîµF=ÒàL=M5¹ç,6=J*êîõÔV÷{ÔØ}.¶9¹29×1¹÷H=LöÛHPM4âûÝýãÅû.AÓ=L¬H<¾¦ =I£æÅ°í¤=@} =}áfP=Hö¹¢¶c¢M¡Kl|Æï#áïò¥B%áÁÀAbsáÙ2¥FAæ©z½@üãÛhÎÛÐÏú$=J­/Ø¶Æ<­IB:þ6²¼y;î1û=HNIÇâ!7±Ã%º¼ûÉå$,Ö(=KñzgâeÈTcÆ©{gxò×ù§²ö¡Ú? êzñx»Öv³H¢Â8æ)ÔÄ7öwh=JÏm@N=L2pÅ+¦ïm eQO£,&ÓO9úÍSiÓFûÊÑ=MÌ&Êé;ïÆûØ/äoÏ¡÷­|¢Ö_¬úÏ3ÔÔw{@zß#dÇ¹G?l=L®ËLèÎÞôÑûò÷|ÓÝ­³+ú³ôEj²5è~XfÍªXöi!=@°9=}«<Ì:ºgMÍÖ=MÑ¼f»÷{ü´µ=M8æ>åËËu½wÝFËlA151ÊzhÇqÌ©îpùÒ`â¦Ó×`½Oß[4¹Ä/ÉREè¿È ePY+æ¶ÓVA?Èý¾0ÍKÐ^Y_6ßèñ¸©0HYÏà^Ì´ÊÖ:³)èª¸m&©&Yz+Á{)¸û¥ú÷I.Gªÿ¯QYSo=M]9®ïã´_rÒÿIIÈ?gÛÿ7É2*wè­#¿}ÇEu4Â,whÖepRy=JËçET]YïÆO¶Ê®Ö_>JSØ=MÚÀé%³UáIYd#îMöS­F=}PH![B2Í[,2²^ÁV1®Á*ÚeÛÕ¡ýã=}Ê§@@c¬ÈRTwgêSÿ²­.:¦Ù!Ã²r¬7Â^´^¿ýZØMA$ÓüåÇ©7÷¿*ðß¶n7oÉtø})u]þz©¸gá!^)QCÔá¯ú ù¡=M):<ºÒ³Æ·'ÄsXQõñú;Ã=@Y8ÄËå¹o?ºVcu«%ñÈES«¨`SY¿_JZÔÉ@%5 ÷Yne6b+ArmÇ=HzdÌ±©*}°:E=@A8æ:j Ê{õ²ýÜ)0¨]±­¨µ%Ç:Ý,ÝpÑ´kí=Mát=J¬â¾¡^¦l¤÷0#äeNíd4=KW©óÓ3ýãÎÙËrëQôaÛÎRÑÈ½tB=McZ¥èþ(±ì}A!t²HÞb«{QÐ=I#·Ð9EAnW@f÷ç+|Ni^t÷gK8?A/:E!fnÖþû÷g»Ò/A/>+ãun-8=JãÝßn¾~Ì-!õ·½~Ì#!ñçoIÀÏG/1+ãÍ8=ÖÙnVÆ^<ÚÙ]nVÚ^<ÞÙÓ3=[RÀµ5$©^<kÕÔÞRå Öp´MF£p´g»ÓkÒ=JË+L¨ò³x$Æ½Zû&;¿±/ØTõÕìÞQZ·6®ÎÑRõÕëÛ¿¹[õÕë;¿¹UõÕëÃ»%JJv_ùå!0É%ìÅbekáø¿=}¦¢RqfÃ$-X=Lç/ûwSØ=X²à4a+bÔ|ÀÐ¹à,aê+bT}ÀM`cg8 òcL ±Õ%raHÍÈÝ½/|/h8w³dûc<Ý¹à4aÎ 'aÎ F`'k0×à÷ex A+b µ÷chÄXrþN¾=b3½QÔWR=}¯Çs®4Ô6­eRÉøªz¢©Sù³ÈË½­6¶w³ÉÙÿ_¦rQ=}=ÝºÓõ¢}0Ê/ðÔ<æµ»`]÷Jÿ³­´UZÏjûïX46mï!ço(XÏ_ùèÇÝkÂi=bìte§-û®+-ÍY/?×1É*Z 4´¤­{=bàI_ØÑù¤UÃ<f¿|fDX=IúKQ¿Tÿºa ?â¸1sð#ñJøÀS[þjZÖÚ¢=J75ù9S¸WøA*°fæÌåÓ»ÐðrËIm,=KÍÁöIÊÍQûZ½?þ¬>Éº«§õ®¯Éò9)ýL (èÒû§ýuQÉ=b%kÝ(ñÿÃÞaêñcÏSÆPVÇ>cÙ=I5A¼ÉCÏ×ÛûÆi$Gú k¹ª±Î·ý¹^2ã~õ6!ÚÐ~IK=ÅgiX8¤ZI[S6Ý¼ªÀâ²êÔ$ÉýÖ£Ø¾ðÉCÚóÏÿPyQÙ>+Þ=|^nÁ$býeû=M'Cä/[ë8ÂªÙ>9{¹k=bcât_+zlYÇì¸¼gDFË>ºß0øYîNA8ni2ýx52Æ¾¿­I$Ó$+îÿ =JJ¤56¹[N¸_ãÜòDã¯}¿^âC1s'X6éRU»þÅ÷N£:±Iæ'_UÈZgÍP2é=L°æ5¥ØÅçj;3ºNÅÓ¨®Q,¬õçs ´¯}@SJ®oÙ1ÄTyÒYÎü¿¨ÿB»Mln=IÇp¶S}ùIûæè%KfÝ=@w¸«õK`LX#t¹=JcPô6Ðx±+8*NW¾$Vÿ^SwÑ=M¡#ºÉô½W=Dãu÷Õ<°OfQWß!²·_KÿLü|&°Fén/Ý=JÄÌi.Úr ×R½Åq¿ø~es=@ìýÂúa=Iì¹òãØÖL#¾tnçÈ+øz`=X¸ÄÑÇÝjdí(ÇÖrd(Õrô.®â0¯¸Ä=b©p4iô®â=HÅ0¨ô=@ +êAeÄ8=Mflì¨Mo¼²Åæ^¡ÉÖ¡}_=}&2q2rgÜÉsVã=tºIcE~Ýß_éÊ=H,þ.Zÿy²lOTëf)¸'Ô¨ª»¥¦Ô¶ÄçxºQY(k>«ªÍ_ÕºªÞ©=Im´,=bý{ËJ)Df«%ªäÁP',S=L=K*=Éýñrpî¶<Å=M/ÝRÝmmùN~Y3¥½g}4Å=}ï§±[7#;ALÈ^Ü×Z¢q»dõ±ÿÙ;×[C>·iq«¨FÔÜ»¾â<¹i)««(î:-pò~Ôµ1ãÒÁ&åöÓã÷Ê­¤CTÒÄZK=MºòÌÙg.PÐ=@bîNqò. Ø,KáMu(ô_:=J7±J¥ÊAÜMGÿ=@~ÉKXg¼ÑÇsÿ1Î¤f§å4¤aã+ÜÐYØãx=@1;U?eâkÖ[j=JèF`=I+NGÞ~ã=@Öv¹å xÛx@ð@=IïÌM=pR§^?¶îE^Zï­-sÒ¿ZåCL_XØ^Ðô}d£Æã$HWb¥]+g0:!3,1qmû3ÈÃ'IÝ¿'ý@=¦?ÓÆ@Û%)-6¢^]=Þ¸×Õðji´Þð.èëHþe{à=b4ðæ²®Í²¼1xY3wýTÞÉS¦S:ñK1¿E=JYå¹*[=K-eeIr+#?ñ$¾àZ½çÊcY_©¥ÜÇQÂ¹ÌÉHB¬¢c:ð§JÍou¬±¼+ô­c¸j«_¾¡V>B=X=KÎ¤o²_A.Ð³Ì§F6ÉlfÒQáüû'øÃù:Î=}|É.#ÿÔzY5ê=b½8ÞË'Ô§k 4/#=LæN,=L4ßªc±]sªìÉF >ÿñÂ¬=}ò%c=I5·=(Í®`==d=MUK¬L¼ÙþG'/½Æt&¿&jX?Ç<ë¥ ø-©í·seMÑíHãp×@ómß_ÁxT!Õ¾7Ü6><Z(§Ùuä]C=@î>FÛês­²R+E'2+µø5ùôIÙÆ§xµÇBÖâ·÷ÄÒkïåÇìõåJ·È=H'¤³ñÒXEã%¨J·M=H²5-áþ(/®®´=J¯ÚNsÍ_KÿÅ&æ=K#oí~Zndµ¬%¤¯ñ=I^æFõ}=byPAµÏ=JK°×¤ã[[=K¨_ÁD=HwdeqXâ:L[÷yrx-ÚiMeíKÄÈh~ä=;ÅÒCÂÃÛ:gC¥]¿¸Ã-Ó±.Õ=Jµjê[GµÁ öåÇ+yT¡â¿tÂß¨ÇçL_=KsxP1qìfät®Qÿ¡-»¤=LÇAôf§ÅCFÒ¼å8UÃëüËó¶ÝwH:Ô4±Ó´üðPnõ³ßãjR¨½dD:vN ¦=b:<EíI-bÒ,µ=@w4ý}[s¡÷ôp=LW*=JpÙ^F£@ú~P Ö,KGÎÂÂBÓ~dcé'p4ajajkë{xäc=Ôú08£!=LGP3ÉòÏ)Kì]fmlx4äÖÃ9?]m®Õ&Ü[­û?â=L¹(×í{­ÈÀÀn«­n»ç­=bÎãð#¾æNÏ¢÷¢npJ}=IÀI®A®ö=Mzzëã§@ëáýÙKäf|&0ç:ì ^oujA¦]xÚLÇ/Fû0QÅ¿-Üõ»,ÙÁ ¹=HKCrD3Ð¾îÍAº£áÖ9²½3TâÂ8õi@Ö=H÷Fì}£E¶Â¤=L=ÆàëP×lßWï¼×ÉÖ¥5¬ «A~vk¾² tµÚs0àÂè¹¹=Mmçj¤¨CÓ=K~<=ËCF47V½¼Õ(¬I²Éu+ÊÈOUkÂôô)½dÚ¦%]T©ßnéØDßPrP³ßX=I¡h^ ?h^`øÎfUâ+!Ò«ºÁ=LÝË¶sWÉü9CéÔNO+Z7º`01&2ÅJWÑÄ=@0CÔIà¿wLf4ÃØÿ50U<¼jGsïß#p7­^¸lÕVÓþ|çPäKM9}ôñ1)â)%ÉÆKZ5lðÎ[=bU¬¶©å'*á¸ÏÖLs»-îÕ·áü(½ýÊwA®í3=I? í#±;g=LMFG¢_uCáØ÷uèGLAY³HY'vÒl9´Y¼¦¨ø;pÅ,ÒÂ*å<Ò;ØÀúCàÒ}7¥çÞ²Oè.PSìâ¹HZÐ1»Íãp!ÔÿlÄL`hl#Ô¨ï÷aÆj­]B«9ÈÜªña[dc=H;w¯x·¸a==L_]^¼}5£Ã®GBÙn%oÅçÄQ+ÈTÀÌ£ÑL0ÚlYn&×6wöy?s¿ayùÍ6Î`Ôw=J*Lr0e-tkuy%ªöãÎ¹P=I,°ÊÙ¶;½®ò(¡bjpÓôvõñÀáZDíÐöÌùßÇóC6°üï`yô©éØdõð.¶Àáôc1ÜDtÃ®×dZc=HýE[ÎÅ¯ÆË 6ï;úªþê¥­]qÇ1ü=H¸C=I+È;}YnÇ1xÎÛªïG^Xß¤Z¡)ò©ºÅú=HJ¨=@§/¨bN®=HÞï?¾Ï+Ä~ähï7¨õ6ë¢câÎøqn:»á=b¶ðÙ¦$=h&õQy¤»TæÃå¢å³J£=Jùv?¥´i(k­=Må±ßÖù`ÄeV:¢¡&î}¶§äéÅÐ¦å®AVJlBWmáiÛì>Ça=Jét&)0Í'ÓmlÒÁ²J©sed&(J_1#¦=MôØ=J¾0ö¾sXýk&ü-qj`6 ÏV}íA«àfN¨pÎ(wP=}÷Ó».ßMÊÈ#Ò÷NcåÚG!c4c»ób7¸6Àì9àþP5Âà>a=MK±§Ãs!mù§(À£=bE%õv`JbGEtmÌÂ%¯&Qû:r/ÄD·Ìç ;·c#IìÄúÎ«÷âÔíÍâsüXý°?ãoßôK=MYDÐ¶0¨NdþµÙvJúåwáì7{L68=Mº­Çâ½Ðûú|X=J6=bE=I=Mh@¨=J¢áXZ²éÃôÛ!ioåQu½gk)[àNò0µ~Ê/¶3þëÍRªËkC;÷&ÑG¢$++¯{ZH¡ùp=H~&tÉ5CÈuPîÝ=LNÈîó5ö)ËYî¿kÝñÆ¾}*Rp=KÄÁXNËW0Gßz%ÑÿzKRÿæ[l0(PjÈøÑP3í·uSÏ´#WûC:Jø=JéµÖóh<Y­`(£×Í|ÝiòÉñ¯?ºª¾Ô<y{E%]=MËÙMpqZkiRîÚï4âÀì&½ wNgs-´|z8ë/¸_cµ¯tdCø:<ûß`²=bÉvª=JÉÒvL0¯=JáxkQc$GRd¤üÒAjg¸c=JcûÝâþ$Ù7Khø×R¸^=L8ãÇ&=M^CX@Î=H»Ml?÷%°ÒÎ=K^IïJÏ[kyÚ[QëJ£X(ßøv¹)ãxÍw[©1=IwÖBÂé[âXÍ7/$e:wßµë@bÆãò%^a$e-ÆÙ2±ßá»ßtdCÅ::¤ãséª=KI¾Måò=}fv´CéÝÜáWÍýìðÐ£Ëzò>Ïð!=@*ÈÞâ=Þú=b0ýÃdÄg7|¹S¹µlsT¨5M=H¹³öîA¸!YiV=J¤Îb2å<ù ÛË=b0B=@0|P9P=I@Æß(4Matºc­!ýÎ{~kµ£G¯¥KºÔv¼{õÝ`·6àgÝuÌØð ¯ÍèýGI1%³ñÅC!u±Tòì`áÑ¦úe1ª0Í+öØ°kFÅ|×D(²l±`¤G,pÃ&È=1-Äwgm*½Êàm Îºn'LæÓÈUÓ²ä/ÈRñªÀÙÊOÓjrQÅü=K*µ?¾@å©÷=L¥ëD¯%6r/+9|§O¼ïÉmr=H7Z$=JíBaä¼=KÅùLÅt²5¬7À¹,8Ý/Û}Ë²èÚ6ö©¦=b¤ø÷Íä~ÄÍô0¶ë{±=K:à<Í=K5=Iq Ì0´E.=IÍñøÅ³èËæû¹¼6ÃcÂPS³àKÀºIÚ0®=}våO#üãmD¼=@ñJËö 'Â¤Ì²ä¹Ö»ET{L$5%Ö£=L=H=Ý!Â3H_Ïlp]5r=M=K.¨®%=Mk2ÎL?ÒÁUºk°eÃðGÖ=@[½7ªõ=MÄÔáqê2EÁæÈ½VêóÚf­$Vr·| ÝÍ¹=@%eqÌÝdýª×çÞ=K¿ðùXùy»ÐØàgDGÔ»Ý¸¨/î*­-½6XNâ!]ËKÀ=@´=H¸´0l ûºÍ6n;¡ég9@DÜ³»_Å^ëìB.0xùðYóîû(Ô±HK+öRö8d²r,3f-ö7F;á=H±Ê¤Fî¼îlr=M¾øððiðµp±?åð7üfÇÕ)Ç±=}e)íìÖÕ!=@ÜªJó3=LeÃ=@ÙNªÈ¢ß=HþÐgùTÆô=}@1åß#9,§0e~â=L=@ëz±xo=Iúr²öð=Jä4«è¢i¥b«û¢ÒtØ ¦pÐð§¬½¾hÇ=KtNXõ÷r-ªJô¢Ê3éFÜÅ¤ëç;Ó³-=H1t?öäûu+ehåÞ=IÎå=Le=IÓÁ'MµìÔÅ)Ì)/ë=LDcª«5§¤=JO´#NSãaÍú½3ÔÍ¢É=HÎ~æSýóVÖueQa@'Üã&ha¤ælF­çÁZe 4WAµ<ð[=MÀ=KðG_P#Ü¦TÄY+¹-g©L=H5KÉëBNïUµßW=K^NßZïÕC»=MnÆð^r=F/ë1ëQ'Bï_sÁXäY¸2=J_+ßêÐap¤i=bÏXÚ¦liF]~=bæáxèIï4]çmóý¤ÐÆ^]Ð)tý£ç¹W6æßR»l-¯-Þ®à¥ÀXkÎC£õÐuç)6m8ý*kø9TBpoÀÎä¡xàÇW¿¥;F³C¼;Í;Í;Í»1¹Îó?o'öiîäaz`l/`ñS4õ=MÑ¯Y^Q«=Le~0wÛ³Np÷Ô#ÇD=@Ô @g$»^ÿúwC|`go{±í¥¡zóeßÜøYv,âexm5Ð=K¤7ç¹@iÃüºê%W=IP?ºQ(âÑðfÏPx®â«Ð?ÑC³jÞ+)ÚÐ/è`>ph=HPê¸{`oÝ± ×8ú µõô#ß:îLÝbf¢2p`#+~¯ÃÅè¦2è ¾ÂAÕ£g>S`h áek°í*?¯yZ!¢ý®@KÐ(ø~ÑT&Å=b=JP}n¹&íp1ãÄoØåvÚùÎßW³øìE:Î'ÇÄ®IàæKQ¹=Jë«?ì¨Ï#éR[ñ­Ã¿ÚÕóO{¬MÖüó¡,r¶pVL®8¥ÁÝ=b2=bÁÿ¢×åViíl]v®¨©Pæ@@¯¡Ãâ¡;bsc/ee¼S/P@·>Ï÷OlÿOv><¦ØRhUxG^ -7=M¿sjûöÜþLñ´Í¹@Éëû$þÁj¨I¢þ` Õ|A@=Zê*vN8½;dKeë%üÂþÆÅtìÍl;Te=}²Õ©ª)úÂ½±=Kå^åÓjÔYR?D)÷»W¡®üo9]:u:ØMc-píFæÚôº]££5«u×ôQª¿´©¡Ù¬©jUñÓP;#]=KmO5ÁÆõ$ÐaT=Joþ<Ù%=IÃfWJ4=J±=M4*)q^>NÒi«#Ù~@voPêçx.ÿÇaÈ`ÙÐâ¢fô¼¹i¶«¬Íñø-¼=Lb^³X&Y)¶ð#=MñD¡±b¥ÑF5=Lz-¬âóÔorcC2éíæFé-9!'«bé$N=}?.p»ÂHJ1ÞzE½ÎdÝ<s|¡ùÑ=Ls£ÊÓö®=L¾¢=LO+¢QàR¦¢hÌ7=H$¼Þ°á@y»1oÔm:v*¸SØ¿û#Ïép»/À&B6£ï,ºM=ÓÉ¥,§¬ïx52HÅ=})ÊPÆº·2Ø£³²*ºó9Ï]§/ds{·7½ =I&ÃRtmrÉp`ÞÉuÐ±Æ»=2?Ü2Ã1n²f=I8Ö.nhÖ`V0ÁÉ=LbÂìiHê!$Ls¹I×N?WÜWüÛ._üûæ}´´¼ÈSÉk&þÙU'$ÉV×[³êþP÷Î¯ÔG-Oþ ÏÍD=I=K/úT=M÷Í¯°²5=bÈ,kí.=IZõÇEÌ'1<êï½7e=b(so?Ë{kFf§Dµ^ÅÈMqOÌÞ¥1¹Ë×-[Fþ>ÄÿõïEô6Kû.º{ÞBªÙ=Mþ=I/RÍ'ú,L]6Nñ¿Q±3°Ã9Cï{íM·OiÔ­MÇOì¿R=L¹Ëì¯°HÙEZnNk×vÌS¸PÍë?ZÍI%/J-/¹Cº5ÏæîËW¿QFÑ.«#.¿ß6Å)Ð+1+ÅmLÆg'ý±QSæ7O«Þ20ÉÊÀENì=b7æn¡»s3SN·_ËÙ±,9üõíÓ¿trþÙMYOSòå=IûH¨6cü©Ã¡Ïªé;péiÓuî3¨,ÃbBb±cÚù=Lð{@â¡ú=b¨=Iå]4pÏÉÏzÛÙ{Ùr(ó ¼u®aíü¦B±Øqª¿=}¸e¤ºFbT©Fó£þÊ û`pnäàóã£ësX96LÈ¶sÐ8OX¡$í®í=HÃ=@¨l¢_¼Bq]½¦Vò'`·mQtÚ|hwûRaØiÝ¯a¿zÿV)¶î`< a¿w½bØE)BPÿ1ùf WÍ ~§<À>2Ky¤*Rc,¶ùïôôz.=Ku(s ìÃ&sg©wjb=KÙ=Ln¶[Ó¾­¨.úÄ¹)düO=HÇ@7ï£é@I:=bVÇ=K½c-#à¢öïdðq ~]êo¸þrqdiì=Hf²çuêcÂæàÌ ´q°=}¸^DÁ=@èz¿ëôoÈÌWÕõNeÙÀs±(®`HÀl:Ö}Æ¯sRâ}%«8=H%qÅÄníÜc4®Ó qUfl&%qOÿî:Ð!<93;¯øÁ|?,xn´²©aíÜMIÈÏ=I=MÜ¸¼T]ù$];¥+G[®ûÌÉ¦ó¡³H¦RA3Ç2²OüÀJjA2u(ºÿÊ³@KYÜyôå>=)Æ¥¾¾%ï ¥=ý§²oE%>S·Ò¤TR¾ñDUÜ×G>ZD@ìòý²sÃËO<)+=J-/4S#}©¾6çDW'N7EV|©,(+­Î=Hôµ_B£²N=}¾)ýòÚ©°xtùÙÙiÒ{KÒæXÄUF}ª*=H=K4%¶²ähçgK,§ù^J=I*<÷$,À'MeäìY¼¬}?úS7zÃýîâ5Ã5tð§Ix=Jëá½ìJéq¼¶Ò6(øRåÚíøDÏFÙi:g=½jàÙ?7Îªû]½¼£>îìlLUÐRrFïÙI§ª¨uÅÙ»àðiñí°!îå0¶ríð}ã0fØ=HNÌäî£µ3yGH}<yÓJ2UJÎ¦ÏóW=bÕ»o~÷ßãcÇET¢o¾ñ´¨© ÍNJ-gîüØ°58=I6ÞJüÁÛC/Æ=}=IÊöò|s[yS7ÌíÚ@!+æn¢Ë=L'<Õ;nÇD>Ý³§Ó,ü<FdÍlïÝ¥²¹?!EùPýG?xþøþßWÅ£&Ò*,{s.Æ÷´=4Z74Æ:=LuÁÛóßðÝ?¢Qì=L¼ Á×¢Jo×¿4ÝÙæ«äñÏ]0ÃÎCÛ¥H>Ø [RÃ»=}:!Í62}YW¿ª¹¼#i.«âò2S´ÝLDRXÖa¡{=bÃ/¾ñ=HK=@5m}ÝGjðØK6S&®.x»7Ë×¤}-(ÎJ8¦6Ó¶ÍØL¢±IKÎÕ©Ó·ä¥$þ¸XPÅ#ÇïÏÀY&=})I·!Þw=MÁÌÀÙ8>DT=Û{xÕÃ«gÿå!;Ã. =mýJ:Fv³F=L<_°¦>]·-²âÃøÐ]îøóÏúyN¤¯_%=Kèó.¾]=JE¯Õó=}Æ=Mp¥$~¸TH½{/Øò'¢A³?w>Û¶S+?ìÛi>ÕY,EËx70ÖÚ 0h°fÛ²îöÀ_Bûît=IKTÇÏ^ýb:¤y±'Éæ. EøÐ=Æ=bÅdô£.CtÒ=Idán0àË`ïûf'§cé/L+Ãr¦(ÍcWoR~R=b=Iìk¼líoþ@o}=Lb4}ç)sÂ9´ELàßòz%G¢Uò² ;fUÔý­Õ1¥´øF¹¾gëÄþà¤ûÃÜäc0è:¦6R|5b4¹S=IèÃÝðÑÔg­aMgq_Tôû`þì¦¹äùà£hx>]kµ,Æ¿í¡g«]=@|Ã;¸¿¨ßi.ºX'vyz[~­²åExWyÍ¤*Á=Làf=@kâxìÂc­¾z=M=b9&=LG³á,¾f¿;fð¢>xÎu~Ò©î}°§qà¦Dí=JÅ2_Â*x=LôðøêÉÄmæËe7¹bÄ.î±õ=@õÂ_@gL«ºÜ-ô ¦G#H 'ë²¶ ¯§=}âcá#µv=ËûrbÅc©Czï,ô1z'Õ@Ö1fG;¯çÑÁÔ  ©ß[Ru[õ+`µc=I1ö>&@¹ú¯Ýdxüã#c`D/.{¨ìl[&vfp!ÍÅ*(ß_÷÷±¤îúzä=IÂ&h6¼jgÒøi·Øy=L_,×Ìa§lyjÀØHàË{_Ã¦Pª~-p¤eEbúx½u=b4æØÐÎEY=KdíYPmáfyöâ¤îÔ~Gü=b^ï3U ¬Û{*B@©©:òÿ?½ÔÂ'-û6»7Ë .:2$8 ã´¢cÿßßWB6õü+)[çûs@CMÂÍ=K¥=I=J3wëwtÆ½=LUTö÷=KG½á+=bs³î¾úáÎ»°êj¢q<EÜ¹ÁGò£×¯Kñâ©Uï²yËR£Ò¤±=Lbâ=bEÙûFä©neß·]N(â!ÜjÖ=Mé·=b>èèÀOÕ¾!ñAA?ÕQéGN<ªt¿ý[Í6ãÃ#¬ùáÝÕ%ÿoMõÍè¿÷pÒ«Ø¾HCECIÉvCþRB#}o=MùùÇL>Sç=b=bâ¤=bZ]Ûò=bãÃÍ(ouøÅÒ¬ò4Ì4ßUùWB[éçgÝwQ}²¤Ü÷Yúñðït­wêäëtuåÁñq='h>n=M0ÎôyØCÃÚÞTöcß<¹Kñ>½,ö=}7÷{=I`SM÷Ë¢~TØè=M=I;jPn(´®!EwqÇåì=I¹=HK7áùaÎOÝÛódø©ö³oÁ±ì =L|~qcü|VïìÙqau$fqeá¸¨m:E×dwé&E´q=JF¢5äi2¢(n·Íä$°=KB25êãÃ|NíU1±æ'°Ë&Ôªq¾´ï¢_7¯õbëÑF&æÃlTUÔÕ@Í=H.Eyú¹äz¼¾¶ØXA¶³ÚËFOñ}ÛÚ¾n®¶êrÙ¢ñA¬s/Q¹nÝßUÞMYTV%SÇïkw¬ÕÖÒ1&Æ4ð=JëÞ^Ç_Fehªn¢å°ñ8}]Ñþ¤íÚá?=JÉ(nùDg²ð·ëL±­0r÷¾tÑgíi¼ 4?3^N69ø(-Kb]­úÀ'C4À=MÞµYLÖN1ðùó'zÈ©µÅ|}U¥IYM=I)[=L»7'5¹À><8 ·«ã+©¢µXÞÑ¦Ò$:yöZ*îø=}6|lô1ä+ÞÛÝm.ßDH)fËM_L=IÓA´«s½°Ä¡ÿòJÓJxNKT_ÖÁqïiÙ¯?Gz©Øãå=Iö£A/=bÇ;xÐ©±ýñNæ§ùqáÃÕHyHMÌ=JñÏ=}iæº|0_Êt#Âìf-âðÐDbª]/ç7ÃãÆ®ÄÓç£½&Ë@_Â­è1ÛkT¹=LåÚNX±H;ÛåzZ6ò¯¯emÔ@=HäZÞ üâZ;Ó%«|T´1À7g)Iísô10÷öBÅ&ìrzNÍß×[4ß}r=@U«ûþàÄê·uO=Mþ¯ÎþÅ§=K@¨Õ¶Äé·¬7ôÄñ]MJòóûcLl8Øò$óa½tÚ }±úH=K$ï¤Ý±v=J=HUçcÅ0¾~M=J=IìZ¾¿¼Ï=KnGV¶,=ét>M/ä­7$yKËßõ¾0±c=KVNIíCþ!=M/`ýqì!>ÍUÅy.ZR+BõÃÙÔ#]ß¶½Åq§uÿbw}ÄH}1}TUîéZßîú=Hâf_¸=L=Käæ/üêÈ=HË5²amÝÍÝpKË=@f¼Ï»Eåm.x$/BbÍÙ8'÷&RkÜ&2êXC;Ê¸[Ö:ä,A!ùyÜJH!UE÷Gà=})ð±y1Ú5@»Êó*x½=I=@ë¦/=@ÈÝø9`zUï´%HâÃü9ê¿í·¶ùsj4^ëV0!fß>úì9­×ÃÆú²ªd]^B=fw½yþq(ê§7´ÑÁ=KÿêÎhÒ¹ü2)à²z]~LÎ ¢£y×Ø±|¥uv»3 <*1ÃVðèdøÎÇJ=bPyw=L¼_ä20F»ï8Ø.iºu²-6W|¹uÉKîPÏn>Sö=Lv1=@=@=@=HTïêôÈîý]2¿öÞy|±ð=K)»¥=H¯­^=M÷=I*[µD|üðK2Òªæ7Ç)'RÑ,æ'{w*+]å¡ (âHÅ6½j»kÓ(ÝõµÖ¥B®@ó¼qaÎhµ­§°ÚêH è­¡sÙ8=}~?¯6ì=@ß0b²à¿Ïõ=@u{dÇzäëDOL5c¾Irf0}G8M8Í;ÍWîÍ;Í;Ç]ì±=J61&;]Ôßõâøµ|d)Å¡ÐÏ¥pô·e!çìSUå©°CYd^y(×fÁD5S+ß^S×5à¦äèær¨å(çjä=Hæú3ò6}I¬·3ó>Tcy,°æò1ìÅsù,´ó9,Åk¹,²öò5=LÅ{9,¶ó=}LÅg,±îS®Bt®Cl.B|.CbBrCjBzCfÎBvÎCnNB~NCa~Bq~CiþByþCe¾Bu¾Cm>B}>CcBsCkB{CgÞBwÞCoJ5ßz1äp=bèêxB¨ét2(ë|R=@èr*=H=@êzJÈ®«º3öVÔ½I®¯Ú3÷^lÄ£y.¨¦öQ¬°sÇë,Õ(©¯.ÅGQvUMl÷Qs{ø?ñ0(þPq{ûi=}ûøyýûúy]£,ä9EØøþ#-íEqÒê³¶§):ü&>&*.ü>>H±®©¯þ«=IÖ->;)lÛúÉÇ(VÓîEöGþÜWvØ0¥>ðF>¹F=}E.=HÐ¶=Ký½æº4=I=I:º=Hº»=Kí:;J¡ø'H=I>Kë¾I>Û*=@÷Z(ÌZ+Èà=Lf)ÌèLæ*Ð§(ÔôÌ'(Ø=L=L'+ÜLû!tøÆ,Æöy-=KÆ?Lvún¿Ê+-ÖyKV4g>¦[Ù=KÍ×ÍÛÖ×ÇVÛV=@×|V>Ù<_OìóýÕ=J¯×VùÊ§G=IIb½&«5Úú´[Ú®JIÆ=}=J'TÚ÷þO5[]Ø¨vï(DÑ9ÇÄUü,¾ô=}Ü­öÏ*T}9CoÅ]é,ó]÷Ö£ÀÕ7W®3>8úX4UÐU9ýíÑN{­2½W,¾åKÕþÏKWJJGÙù(×CÒÝGEP'9N7·óÛ½ß>ÙÙ?Ï'6k¶[0ÖT¡L¾Ó¹¹=JfX2_ÝÆ¶/ÎQ9¸³%Êýºý=ËÉ=J-4F²=H4®ÍÏ-/ÛÒ?F/`WkáÅÕßê =â@æáecãáÒtcî¡CfDccî¥Åwví¹¨{¸¬+âÓò!8©f©ô!§æ/ÿÄ$(¡¦*<gW­n£Ëe$yjø°IäÁrâ$´Çu¸udjSê/7ìiÊè+5°*@fÈ0Ø½c2!fF}=HÌÊë&f»¨~Öø nüëìkL=MÛgø{|P=Ivöýºð®î°>Öd4ifí$.×¡EÓwx=J½$ÁJÃÐS<ÁÉ/¡X.!=}cÿçÙ=bxMeQoH -T¦Ão¨¿øéÏYÑ%aøp¼xãiátÿ#Ø¸úÏjÅØÐQ-ÁÈ;bÂ¶x,#±¦ °{i*êzü½éÑpf&#aÿOä1§o»rô{ßbW9à&.b¨£Ëø¡ÅÁçt:1*ßÐkìµ½Ý«æÙ¼I,.`Q)âÒËô¼x¾G¡=LàÅñõ_Âxö÷¢('´GÎ@×çä¡ÁÎ=}wÿ[#XÅ`dbøxà*a©ehÖ`Õe¬à4bb GaÔdV£`]dP1dÄáÔî t.à6pÜ¸¨=@ùø4Òh7EpW Oµâ¾µá8=J¡É Ï:àÎg*aâç¬­ü¡Û¢@nÁà=H>{¶Þð&eâ=ybÞÃ³0õÁpO¤¡égEó ÊmcÄøfÇâ>,ç°¿fIÈ0T¡à°Çä8×zXÕ=@¥«¡Æ=Lfé]}[~PN'F¼âpÐi¡¢²=Ké=@GhÕDéI÷dMM¬(2=bço´ü $kè8ÇczéPÃqÒPmñ~x3Ýæ~®Àäú¦ª~,°+&ÞDüÀ¤EÓæ¬¹«²¸²ôk¹^5¶LSäuLÄÕìÖó©»=JÅ=bøÝHõ,D=@ó«³DÜâüß½®M¿+%}ájQÑâ¿@ÿ½¶ðîª£É=Jú=K·õ=bgoõ4¼¥ë­³KïA[¯´üëRn}5¼­·=I©=KÊ=Mæß¥Vß=HqD=MÌ¬gKÌHÂýNÁÍ«/¦;ùn49©Ê»ÛÍ=Lß=í­NFÖIþ+42ÛG=t§Ò=ü3)ôÖ3éKF|ÚKÍxO¢[ú4=K½åÙÚ±Û-íÿ<ý:ÐÁ§²«=HUDcÛêäü.^îþûAÅ×Tq±¿Uì=IÞÿ$õ[óAa=Íð>ht3d-µ`ML`Û {etFbáê ¢¡dSPñ¸XID8Ð­álåÒëfÞ8*BèG<p¶=M£¤©ö#]¸80jYÑ)À_¤¬û^d{øç÷Âü?ÑäüØêGô¼ló¿Gó4@I'4Ns©þy+LHö=I<×ü¹¹J%¾Yâm%öWKÛYÁ¬·÷×ÈÓ´®tæÙÝ³dUgHz2y­Ã5·¿Ò¿X>ûxqßæ9{ÏoÖp÷}5.ìíÔ:Ù=KÓ´·ÞCNüGîH×Ù¶8=K±Tõ}H_S¿³b3äLºùß4ÛÜwï!ÁÕ-§PÂú6&tgý7¯M=@µE=L»®ÌN8Ã=@­RÏçö_Ç,;=bFëGõ±UQÉ×éçm9&=JÈT~k`æc+àO!dÌxÀØå|·µÈ8vo~!Oðw¾Oh%èQ(Oøl^«d]}©'Xe^ÐÊ¦N¼|«ß«®ÄÄúÂ¼üÇ)=Jù$wºÄ.üüë2äêýJ®KÌDO;uU5¦ä¿87Í¿Ð§/5g¦XøFçf>¸à_½yÁcîíÉ¸óð´t;´·öM­Þ~=H»Qãþ¬6oKh=J[Ø¿=Kà f²òk=Jg@]d¸2k¡,ä]èkx2x©l«ÖrIV`&^¼ÄÖ=M,©¡Ç=J=J÷Ý³/=LýEe}Ñ=KNqM]¾ÔnÜ½{¦ö¬_ÿß³nD{Æ¬xEú¤LÄ=HQ0ÓâPh¢Êg4=IâV3}ðV#hù³ È)®Æ¼=H¾=KrtÇÍû÷68Q~ã¨·ÅÔ­ÍÎgMRíÅ=búz=}u§ÊA=Kv_Ù}]7s;#xòW±]#M=L¸E÷ä_®Æû°·û^»ÝSsûÆï!T|©¸°=b¾÷ÍK¶¡ä~5Z1®è÷û»6¸X{¾o±Üú´Â[='¯C,÷Bî=}8ÅòÄÃ«H9ÿÛ³3¥|5Ja-úsè»d¸¶cÍ  ËàTb¸à=J `_Õ)``°Åàë`¸`=[®c rÐèbº¹ÛõR?Û?xKop:oNq=@}+`>ÅB¢ àålÒ=@äjÊ8 nnÐæ@ï°ä£ïtÔçMw©¡º÷ÖæXè°ßýz_õá=}k²húçXÚ;=ÛÒÀBüMå$ø°Ûy`ìx<ÃËÝÌ¸è tC=H*k_EcÔÎnÊR+TiÃçTK±ú÷1Ý=KdÄoÛ=HÆ&fUY¿±®ºG©Ñq­cý)êSÆ¯¶nK?=Lãu¿kÏÑÕMJIs'í|<Û©ÎZ?¤×^¿M=}Ù3õëGé=M9OÕu^=Mn_´wËÕç.â _øLKUÓÜ&~Oö=J»®Øýû;F¤é¼Þ¡Uj7*º]åo§T7=}@ð_ß`î`Ñ_=Mä=b¦³FÄqéâçÿó+1,´AtêWng9Tr¿È7êC²¦ô´§Âî&Ð÷ß²»çÀoïøEöÙ;þÐN8{[Àq¦(0Ø9ôAl³J>MRfé[pblùcÀ¼«t ³;y;Í;<xëÃÝÍ;y6>8þ«¦åÖÄ=Ø?MéZ Þ8lÂ¢JÒÇîBÌ=}zËñ°ç°Íæ¬4Iq_,£ÿu§=JÍÜÁïÓÆ²æ{Ç«ÉUAµ¡ä@=bY=ò<ðx6-éC 1d.½®/Qt.¯cOV¹=Mó18çqìºð'YdÀÝ£ß½B1=JÂÒÓªø©®3©Óux²Pßèògõôî²Ñ·Â5uG>=Jø¥°z8»XS!Iíâ^'d#iÆr<Ù8Z¦°Y±Ð=ë@J¡âòÏö=)«¿ã[2«OÌ^£}4ÏºZxýo2¾rcÐµ=M»'Y^2wjö~²Fä)o=IÏ=MD³kÞ[í[¹úC'Ëá.ÓÎöRoR;²]Å¡:É¡=}ÉýâKd'vk¦=8¿¸d¯eeÑbß¡@@?â¥eÿ=Iø3=JF=Jê³g´d¶UjBÈòê²u{=IØ¼%?Íµ4Ôª©Bî)+³R )Î·fØ@UÅeOÐ=I·P½!Çe#&¸Q½®9Õû(1=IôS¦.³Ú)Ì!ÙÇikË«Pèõ2æ=>=Idý{%ì¸¹¬È©%|¼,&DûëPü¾¤§q=Mãë8X=HðËjDsåÔM¼¨Fb=¹àÖØa5ÃjÈ,'ÚÅßÅDÃ=Kóï-KÞ?ôçÙ¾~&fÙô)¥ÃÃsÅtÈFç^«Óèï)KP|¼-=H{GÌÞ=ðq­¦;¬y}'+èñ%à:¦;ÆK½/$ó]=}=}ý!òTl¦l/@%)ÔæuÀÂ3«A=MþæU5´=Ju#«=¯!Ã¼jQó«ÆY ÄLªiGV©4«¤?qi=µó ð¶båÇCÙ÷q/ENQT½u'fG6$2Û¦w¦$RÆÛlåÞäëÆÑÉþi;v%/F¤Ò¥~é=L¯ù«Èv!Ç#zs®(;Üª#¸ìüE,i¥KØhóâ¢Ëh&xv,=@úfoiÂ&B bcYÍ§`ÆÖaýVGøËÏ[1>ïÝ=M(ÜqOÝøWAUoÏ.-TÆÈÏ¶ØQûwUþ=>3óÕ~KIá­=M}ÚÃ¾E&ã.ÎÜúM*,hõk/Ó/ùQüØöL$ôçî<lÕ¤Mòc_ZàÚVÈÃAÊ^E¥×»î¯ÁH»Ëzr=MùÜcz¼Á8Î®Ë¸QAß«FÔÄ<âP¶ÓRã-IÚ4ìqZÆ=LùÇ*Îuú@S0øûN&:Ê¤:ÈRlYV*à®f=Ö ÿYóU1=I3#Vý7£ÕÙ¯ç:Q=L7@=Iv30;=H©ªß­uÈðÖ­}ÃsÕ=J^þª2'ünú=b.=Mó1{y]<©Lñ=Kúsü &Q$8îÇ%üÑîEþO¸.=M~ã§'ä¥íFC±¬Hêç©19â>c§ÝnnÃH@Á8Ål¥M@pÜfn!Õ{VlB O¡%mÄ1öatÔz ã@^¾1oQû¼[M?T9*ÚKª¯Ê'UD=Lg½WÖÇ³7NÜnL&å½éÛ>å²3,J,Jý¸s^}YÏµgÆÍ¯+V¸.Î§ÍM?öeÁÍè¹=H&¯â@a ìàbÀ=MÍ;>_Ê%Í;Í;Í;ÇL{WqÞÕoTóÚí=}­PøÏ=@ðÁ}¹N=KX¡Àeq«Pó¹$¬=b|5F@ðãiÊz¾Yóè=ÝbÌ%ÃH_Ótõl#Q/Üz %Ï]Xð7k{ý~=ð1åõ®('¿=Jmû!0EË&¦40 =}=Ln­0Ý³m/=Iª¨<=HàÄËy=_åµÎÆtë°v¼`VÜìùG¢Î{ëo=@<õá%_3ðùêétÁI;¤Èì'×Ý×fjÉ±Ðpê$ûÐ,åÂ^¦h´e!½pYXC3×ÞXKéobû@=HMiV ×^Hæ!ðÊÒbíæ,MAÏëóÍp´Æe§«h:øC$üä¯ø 1hi,æH{3£ÄXÇt?_`eéø{ÝéO¢þAU-'=@X@¶7}¬>¤]éË@ìúòSx3ã'JÑÕNR£o!I*HÂ^kNu®÷  ¹{ÑÃJJb;êXCH©AïBÐÄs!aÔC¥÷wþ!#ôy÷µyð¤ãÔçÿÐf?#ÅZËNò=L6(+Ù©înñZQÎòªº).ÕÀüItr[²ô¬þ=H%rÏSÒ3ÿX«Ûr/®Ä=M:ú0PúrSVDÿ×/)µ6»Ql)VÁü6ÆDÁaû+¤ò.ß§²çÇ=I{|-4£ytí|Ï¤Íu~V¤Éæª}/Ð}}Ù=},ß¾Æ§WmÇç9¨Dxª½-yÅùs=@xòû÷ó¼5ù@òôXCa¡P`pht aLÌ;Íû9Í;Í;U¿Í;ÂÛB³¢îÖw^áßè[~&¯°£æ®ÊñefÄ´1ü=}ÕÄµ/û<Øz¤z(ÁëØ²Tí=LUÅñpû¢²Pâ0m4ñ=M$OÍoÁOyÆóUIbÑÉºy»ÒÄgÞRO&ó$Ý¨9Õh=M,§AtÒb£«±QGÞ¼b%@µÔé­f×p°Ý5÷~£·=yBó¿âß[»8²Ý {7/ÀI]æég=HXwÒytÀ?¥ã¸ªÚ(!=Måu×ÐB=Lo$£YÑÑ¼hWþè!®®rÔipù÷§U«Åø=J!¡sR:XÞºw)éÚ=H=@à1=Mì1Ô?t²¥ÆPsà<v»Gõ=KMðN`Mý®HRÒ¦]Ë·Ð¶¡¹$c·Øá#9{~Y¢/o¼Ìaûl¤þ¡ÞþmeµÄx¤Àrö¢1h¿ê!ß¨ü¯ è¤ZðìR2tl¡Çø ®}w×ÆB=J½vE wkS±ýµà_ë0µ·ì¼è£´e´BÆÔ7B=KÉ}$oÀ=}qëú!L6âSw;P#}5·ñI;å£7Ú`?¾ô¼I'OaÌäËÎ#Pjuä~ü ³ó©|9íJÿý¥èXzhâg pdàâÍ;Í;MÜM=MÍ;ÍPÊüÍ»7¿¯öôýÔY_)Doó»×ÝülöÁLß¼_±ö­ÑÒóÜ;t(³_ìÞ·©y+W*:=H=bµÞ·CQß5ØVßgËP_z=Lù=Ké£îvÒ:<>=Lí¿n¦¬=H+æJýT¹×¢ÿ 3?pKæ|^-hõhÃ<Å=JiüÏê=blÖ'ù] ü'3=HïEî_=b,úS·=L_1æ>´ÿ¯Ä'Ñ»Û}§:N ÒÍ§(éö®;ùeñ=H¿ÒAó4uí{¿OÖ£&}G¯NLÿK!MÐ¯^C)¦U9>û^Ô?T¡Z_WÃF¶NÆYÑ+bÍ|¨TZ ìòâH¤Â¿Óô£Hýs=baÿ°MoEÆÑxûNæQ¾t.¾=MhDw¤'ò¹ûs%«±Ü=}u-2W1$=t£Ñ÷w'Ò=}îúRóBù=¿S*rØÙá}é¨Ä¼ô$ÍYÄÞ=ù®«!&õ?F2Íÿ&þÅÉÜGú.XJÔJp=L+ .óK=IS*ÔÍvrWÌ=·Æ³Hô#-¥¼*Ç¶æÙÔ^þçõÊA¿EOÍ;[j» ú¢T®uèMÛêÐn¦ÆµÑö<_äïìT÷²Úô¥eÅDN)ü=Kk+9½áúâM×¼¸©4þª¬=Jþ¶%û¯µÜÊ=IE_5Xç6°=@æÇª<H=HLÈïãJ°ù½'wK=M=MGÝUØ@X½còûmdòñcR­,=JÍB?ó­´ùó<,=L-Øð^ÝkK0}:*/ßÐõ1Í=H®ËÃ*äMì¯ÉTÖ9A}XãT«}Ä[ÔVë®z_7)=@Õw÷¸6%øª¾å=}¾0íY]ÎfU0=¥oß|I¡»÷ûHLÅZ=M¾Ú[¸07ç3VÄ?UAw5/îZùÿ]RclÀW-`[f(êH¡îêf)9èMë¡rÝæøÈ{Bç£äñ1ÇçÙT-%Ã#Hy&2Éd¡9hÎí@ÇdQqÌ}§zB±þÎ}ELU±TTe,êq0?ÀN¬a¦gd¼Ú@=Ið:ØÆ}¢Lhqìi$¸¥¤åè'îmê°üBqåw¤TßtÑ)ª,=Lë%uêù³,¿;$|NøÈµi=MVr¤¨¸¾Á·dSÏ|ùÁ_¦iúçA;§r*©QôR>©êÞèôt.²|úÔmª±=º*ÇfaîlæÏÊ;Ö?$Í;®^:Íû×/6ìÍ;Øê¿î&³×äi³A4}Ç¢øi?øåi;ÒøPøinµ¬@zø@;*ä*®<[÷ig×Ý¬X:(gø0 ?/Ðë¡ãÁ¶}#=¢fûlÿ>8=}À¸ÒàÁÑã=Mãö!Úl#=b¤rrÁßq=}sAqciZùà3çs!aß¤ip%V l4C1:uçDçÑ=Hïã:ètì%Ë[¸«&Â5-x=H%@Ù¹êÂêæ,ý((§mÞ¦*r?«Pï§dz=bNnï&tØåA¦Ù»ç¢d#qâmïãQÁºNl¢µÃV{gB$S`¨êbð}HïQ=PÆîÞ¥X¢GoDX@âçâþÚA]ßþè¯=}Fá=@/NAn»|ëÐå^£w|Óæí(yïµüÐ0q2G|Ló68Õ}.¥ïmZ<=MÑ1j5ñÖ?bÎûAÀv7ú-x_zÁ£~T{=@¿¹ÚXÿ¦ÔH ¾{~º0ª7¤/mLÜ=JîJëÊø§uj¡8ÀlÙÏzÁÏrvEBEkeÌïN»¯Á®ì>d92mèß~½ÑK½Ëî¿ã/Ù=K äKjÈ¸n;=JÚÝiz}wÄJ,¸àA[FÃ-£¤[|(<øíl3¹=HòøiN1Ôô»­£$´¬ymAÞ[dTýð#SmÅîãÑ(¸=Hî~ãû×¦¾ÙòÓçCÜ 4«neß²v³w) Ztr5C&`eONôZ½VoµÖò©Ï{­{2¢º{=IÌÜ}+µ³ô¼eMy·ªk¦vñÔK*û­yô¼üª¯òò(T=}rÎÜ^c¿ÈªH§úÄ)ó$öW´YmQß=@ËI¯I4ã§ÔÝ'Ýª£ë·=}Gr7]rMÚþªc.0qYóÔµZx­«¤VóÿU~üóò«2Ë$1üf2·¾Ä2åÌ;2 dÓ9Å ÎýúI¬ß)3OKIHIut:ð;/lQtêüvòÄÈÝwõ»G£1oÎ8[×<»ç<®I<Q»'ú1O`¶6ì¦»ûq>[²<Ïµ)Ò^Ù÷ª?NÜ°DÂ?o7Ì_Ös{O¶¹°Ôx./¿à=}¦Ü'Ë{üÿÖÙo:×ò_ÉÛý?]ZiÏîGÙ_FP=÷Ñ5ï«gOQÄà_ÿ+ÐàëÜ[?ØË;*V-YÄ;ËûùÏ=MÍÏË»5üÇýÎË;XS?#¯´y$ßü{!¿'îGæµX>ÊND£¯C÷2,Yþ6Ü<f§¾=HC!7üTC^ÖÜßÛ¿xð$=}©GqÙ@ä[NEGÐs=MeÊ·?ì;ÕD=M7RÆ{Xû4-âëº=JEW=M»ÝÏ×;#ýÒWS»ûnQbÞô¯ØÐâ7==MAó#/SðÚ~ËB&»Ù½Õg·Øù&G¿)ËºNP2.[=REßY+ïYïîÇ¼>=òWæwüÚ/WÞBû*RéëÞP[8°a=J!ÀØoMi]×Po¼{Z¢ÑªßÎzà=}fÞ&máá^L½|¾î µ'±(;zùß&@_¤O{oNs(ÏrZM°¤Sw8=J=@?ªµ¨Î=K¡½½có1]=@vìÊÃ.½=(6#R£Z=@7fHÅäÐÃÔ=LùìæÈ[uÔC¹@lÜýs=}oø=@/Õ³TXÍæW*vÈvÁ³ã§iAYÆ«~=b%vËÔ[7fÃ;§ÏÛüI`ßu§|7Ó=b#=I.ÂJâ·T8×è,PÎâm°=HNmGÈJGë?Ü1V8oÎ}^(yàùuám¢µÔøµhÒå=bJË^Ék#úAxùwaµ[¨4ìè=b-Û±pÖ¤Ã÷fóÃ[pk-£ÑÐr'CÆb=}­ )=J¤t;A9'ü=Kª& ÷tü^ðâÛK³qËæG=JR3@}Q3ÑóK²f¦ÇD½,êð9{wÄC>à|l»òãÕ]Òñw+ßE¢oR§ÙHûïÇSÑ¸`=K7t=@VÛa£kÑp=MÃë0hå­¥²æÚÆb¯wÑ=@dÙ^r¤ô«Kdo´(ïò=b¼jïË²{£¯«ynÆ(=J¢æ½íÜÞ£NxaÆbæfk0+w°² ýbÖ+eÏwMþà7d$ßrLGßSa^jTXû ;ÿhÄ0ðª=@=Ibuzh?£«Å  ¦Ô¦ª>.²ÒÌððä^³¬R¥´Bµ¤î{j©QªaUKµ TR)>ïVZGòÛÈnùdÄ³þ£ví(éÝ=HB¦zÍ=KpóÅÐ)f°*AzGñ¨K~&3çÂ/ÂÈÑÈx©Â=Mh2ôåñÖÓh-}|¬îá ÿv·Zò<ûRÉ+}×ò?Ó;7ýÉ¤ã©n8óA»ê)öTJëèî~K¤³:ÒmíFY­ýw¦?àBÞI2TÍ=JÞ¡w4HÔM5¶½0õ=KÃ)¹ÕIî=@5æ26gã=HØ$`L«CÛ13Y=}) ^k)=.6=(4×ÆÖçÿëoùKN;=LÆ]µ6¸<.ßÝîÅÜ=HÃî|Ç³o²%=}Ìµ#vöý².²[=LÇw*¶Ú¥L419=Lè=Iè90¨ÃC#Þ;E¬Sü~; ñylÃaßÛø7R«»ã¯êNeôëÞÎü=J;Kêû¾ßåNnÓëe7ÊlÌKb×5öÊ)7lióïÒ¾oNµEÒ5$ûÒWaÿD½¾Ý1æñ=KÕuÍ=Hq?ÎÅ!Ãóý;ß>ºu#WÅÐc²(ÇÈ¸,gù=LB#=KPX~õ|A;Xí#ÛØ2?£¼/V±=bNS=Vã=M§ûÔýGz<EOÖQCG=J»_ÇYIoÞ´aöÐÛ²ÏÌ^<w!UcPÕ5ÀXfnãGøñÈÍíC0qCu®³!þþJºssÔ°¹o=K§zÖ?®!i/IP;s½­AÌÇáÙlÁé%Ï=MA&n|Ð+5i!xzAæ!~ÀÎ¾8#g§¦[K4dÂ=Mx}èÞ~fóuqè¢=bIÈô%=Mn¥iH:ùè}]òuùb?=I°Ú¦ñ¦bsi«Ì,&3-¸wò=Lë.'u3bxU¤¥Ý&(ê¦xãúê±t!5Grì­òâ=}õ=b2¾æé»ÅÈYã{s°¶@X~a{e8rÐTàMßeº3°9áº4eù?ç¤øúu1õúbzÿ,,=K3=IÏ¬Úßí{2êÙ©ÄÔþÜ®$0ü5ñDNx¦Ö7â=HgSrÏê×PÕ.4òÂ¯)ê6TÝèu­ÉðØz­YÛÕIÅåf±îém°´SzDôr¯Uôa(Ð)ÖW*gV^#s%ÿÈÃk/W÷'øOFµ¹&ÞÇB'¸»ÃjëTÂ&þ9Egs9ÛN½±8²_Iú6BÃßÍ=LHÝ½MIxÙ¢8nY¨Y}ÙïÿÝÙ=@&uQ=Mfá¼3ëo·ý'wVº-·R=KòÜJ ³ÜÜQe~²?)»?<EþÏÿSZëÿYê³j0LmÕõá¸ÚÐxB'=@Ôü±!=H'úÐÞ=Ig_+&hûî9ÖÆX=}*PËúmJj}=}Lâ{=@ôMãÊ=M`$|o&¥%Ðx§¦Á¨±Î=@/TÄ½­%÷Ô,<ðéHúÌ~*%È¹v¢Å­q=NvHçd¾¨XàlVbæ|r0V¦ ?_ð=b_«GßM]?¶8=J0=@Ð¯!=JÆ«a_%=H`)qd°xîÍ;ÛÍ;Í;Í;VÚÃ;ý.µ§%ÜßY¢  ³(¢w¬=K Îà]¾Þ°Þf=K`wpgê s=@E/c%ePc`v ~b=[àyÄaSfá|$`=I{ÀU@rÜYß=b7Ï?_0ñÃxáùåõíýããëûç÷ï¿  ¨¸¤´¬¼¢¢ªº¦¶®¾¡a?Òð )=@=J=I=MÇÀÄÂÊÎÉÍG@DBJNIMwptrz~éÏ'Ø¤ÅôÔl¬,=MÌMý¼Ü=ã¢#Âr²2ÒSëªÊJûº;ÚnOAò²ÑQnlï­¬+*=J=HËIL}zû2¯¿ÒSNãGÏÏ=LÁEyöô»¶?>£ÞQVC7ÿ~ö0×n©=LKzùÃüÖOIý[e´¬ü=óë=Kz;Ûç&©.¿[X%;O{î¨y§Æ¶m-~ØK1=K¯=Ki*nñe=MsÏ=ò¥#ÆXXM×Ëeûð,:^YÓ×¾Þ½)=JEõ>ÙNQWE¼&qõs·>CèÏº.Áp²ØFI¾=KVsöjw¬>¿B±®Ù´ ÇD&²±&ç²!}ö(¤TÂ¢Îõ000°××Ã81{(kHXQCSScù2Ød­­­ml«~Ûá|çÈ:4´Ïæä¬¡Hå}§Èpù¬~}M¬ó&^8öå1p2ñí_h~`ã ``ê^ÿË9öÍ;Í;Í;º[Ì;7ÛdMÆ ÐÀ¿Nð?FÇ°/6Ã87À¯N²ëôÈJ±ûÒôtnUéIy+{*6Ò=LEg:Ú6üÃÝÃÖr©ºí=M=¡·:õ=KÄ×=JñÁoL¢kð¯ÈH¡{ÒðnTá=Iy)kª2²=LD{ºÚ2öüÝÁÆrªºéí=¢§:ñëÄÖFÆ4Ò8)TTæ¡ÎÇz=KTCeüÇaFQ¡NèÝÈOúòÁ0ÅfìÉFûÑìônS=Iyx'»*.R=LC§:Ù.ÖüãCÜËnq¥Õ¹ýÍ=©ãM¦üÆô©y$£ê(B³zÙ(¦|=IãÜÈz¦Qò2=KXö¶þu¨C¿úå©ä±9­¶Æs2)«ÖBr¹üÄøÙø¥|=}ÅÍÖQÉÎò'¹&ùè^<=@S(Ü[=M/Þr9?ÛÂ/AÒ«üÈNÑûÓü´nWùyy/>j=LG:Û>VüCÝÇ®s­m»ãM=¥×9ýËDÔ1ÃïJÂëø/ÈLÁ{ÓøÄnVñÉy-*:=LFºÛ:6ü=MÝÅ¶s®u»å-=¦Ç;ù+ÄÕAFÅQ4ÑÕ8-ßTVö¥¾Ç{ÏÂfÐÿ¢pkXøf~ag¨L`O{ hþ³2uöÄe¿3=bs@daîPùø hu=}À¥P}Àgð)iæøëy$°3}6Ägß3#KV@üÁì)y=bÃê$ÂAÓúØ$|£ÜÌ&PúËXþþmÇ¨Gx¿ûí¤°5¶Åk3%ÖAj9üÂäYø£bÕ=}Ã½VPÝÍÎó/Xþ£Ëà6{ê!Ç;Y-Í[;.Í;)Ì;ÍÕèïÒp^?£³¡Oj80Ô/HÇjªÉOü²PDÔ=@¨¸Í³¾ E]°Q­¡TZe=bYõìô%yê¼vÛÄHu­.¨¸ýÈÁW{ÇjÆ§K$ J¶'î¯BÈ&eúý­DÊ#^£5HÞ®Î¬¸H×g*ÝÅ¦ý]È¨àyÓ|LT=Jigo³RïÔãaæþs1§Më3©Ã6!úïjW4Â[DTfÛþÚÑ]±Ýe]IëâVMÄ<g»ÖjÊ<>|=@ÉÐ;GY?NáÃ«.VNø4R½ÔHæoÎòÞÆw=L2=}â¾ý1CØ÷7tYJÞ'=M:Á¢L×-_£6PÙ¸èw´Íi3^ÏÀÓÜþµâ]å=I¯É®1x7*QûÏmµÛNM0`'9åå¯Øº<Y=Kß}üêQB´ºÞ%ç§ô=Já×ÖßU¢ÝâX<Y*=Hä=L=LèLêA9¼~oî§(/§¸Mx~_gon%ÑPt,¬DiM0Å±ßòfUª_Åà®j``¢xè2'zÙN©û9+9<)=}ÙóS§^úSW,(=Lùù9ó¹³­&Äý,)}2Å;Ô¬7IüNÃpëé-x%Ê,Âæ&FßæIà``ph¢¸_=J³-ÅÀ¬ãøÉí2Êú=}¬+Éú3=MÙ:ïá¸xs¦ÂÅ,$.xêu»Ã6&¼Lí!¸|ó¦ÃÕ,&NxîE};Ã6'ÜL/cÙÁþ({S¨¾/DýS°¾¯E=MS¸¾/ESÀ¾¯F-G1Z[sbk dàä`¥-¤ýW~oÆIÿO8UþÇ7K9UÞÖ=M'U9VÇ7Ù8ÕÖý÷½GÇ7Ý8ÕÖ=}÷½WÇ78Ö-ë½SÃ79¿Ö-û½SÇ·~L*ç½ÙÖE)Ü9õRÇ·85oÖUå½]Á·ÿ85ÖUí½]Ã·95¯ÖUõ½]Å·ÿ95ÏÖUý½]Ç÷gÖYÀ÷wÖYÁ÷ÖYÂ÷ÖYÃ÷§ÖYÄ÷·ÖÝ[;ÃþSzU~Oæ=LÉÍÛ8+þVÖfÇÑÇÓ¦ÇÕÆÇ×g×Ñ×Ó§×ÕÇ×cs£³ÃÓ÷áÄ{y)ªÆóÅ»y+ºF7a½0i=}0q½1y=}1½2=}2½3=}3¡½4©=}4±½5¹=}5Á½6É=}6Ñ½7Ù=}Çàe8ÀäuÆ8Áè8ÂìF8Ãð¥9ÄôµÆ9­ëÔÌelcÔbRÉ»V¬S«~ð8ò?SÙßÿ_GßNû[ÇþùSÆ^Ló]ÏVoïPiPk/PmOPïïXéXë/XíOX¯oIÿTô2»ZÛ6am`l$ üµdzQâ=LÅ)Ù8¿÷Û,ÝF¾ÓG<×NWÿÄ9«VóÅ¿9»V÷Æÿ9ËVûÇ?9ÛVoB£èQ$ûXsïB³ê¿Q%XwoCÃìÿQ&;X{ïCÓî?Q'[Xÿ~oI¥ZñþI­Zó~¯IµZõþÏI½Z÷~ïIÅZùþIÍG?~/IÕZýþOIÝZ7¡a`pdÂ>®_¶ÞÈaQ Üp$oQ¤ÜqÏ$Q¨Ür$Q¬ÜsO$Q°Üt%¯Q´ÜuÏ%¿Q¸Üv%ÏQ¼ÜwO%ßQÀÜx&ïQÄÜyÏ&ÿQÈÜz&QÌÜ{O&QÐÜ|'/QÔÜ}Ï'?QØÜ~'OQÜÜO'_Y ÞðDoY¤ÞñÏDY(=Äßù/,ÏFSÿY0=Èßú¯-F»SY8=Ìßû/-OFÛSY@=Ðßü¯.GûGÿGGG=KGGG/×¡Pàxg```Í;ÎÍ;Í;Í;½Ki­bô6+¶+ò»üR«ÜEU.I5.OD7.G=ó¸ÅãÌR¨Æí¬Ò(åÕ(òkxÆûÇËÆúÃûÅép§y=MÖ»zí;ËÙ;É°¡ßK=}÷¡ÝCMW¾aM-×>ß©´8ÆïÅ18ÄçÝ¶¤Çë½våJæ;N|úûNOªHÎK%µ¶Ë<ñ¶}ÃLQ¦¾Í,Ñ&iµ foÄ4 dgÜ°°gk¼p=I=Jæ8Bé=LúøBèêJÂé=b´#hð³küP£©=LÐ£ôØ*IË=M2=IË=L>*=M.Zñªf:H¬zúH=@ïjIÈëâ³-°»õ­³³}Uµ½Õµ´ÊzÉ÷ÒÉÉóÞõÎêvìÓàñkH;=KÍ4Í;MNÍ;{Ï~'6dã¸Ó'=JDöÞÝWüÙïðM=M=Mû!mþIW÷_¼]ï=bÃÕ>½^Rå­µóÐÌâ»Lv!x®=}¤Hym÷ÍÐËç=}Xõ#Éz=LîqjÌ¤ §=¸À=HxîPBáùÁ;`Yà)tLç;p8=Mç¿è¦âÉkx»¡düÀKe=}q¸=b«a,hÁuf@tæz@èf±@2j®ðeyXX ÈtÄ­À»hpÕáIxçáÒ¯á*6vùÚçîú0~½|URÙ0¹J«G«=8PÑîýäCx=¡ãmbÆè'ubpÐàacmÈ~crjhamÆ7ÂZ¨ñ¯zÑ1=bê~éØh=0ãå9­ønÍ´Hsæ¦)×}3hdÛ:]i/½=@PæOA7¿Î¢^ §¤>¤¾¤îðDÅD¹DdW[l9ÙØ.ý?/?TÔ_¼P³v+>/òÛuÑ5u4u6u4tîeìZïXÉ7'òXÿÓ@=Ij?é=}ì½ë9è¿ï»ë»«y)È*=I*=M=J,=IV6Z:òZ=Ç|-¡eñeÅ%µuõù9UU]^VÑKU°Òñ)ßç[KwFL=JÃ§½}>öT6üJ,:L:âJêÏ=IÙÚØ'ÎÊÖFç44×gVfläìçý£.MúÎ«ß©XúXµIçâßÇÞ&Ùí=KXÉ=L6»õ½ùµ÷;ò5ý8{zrt|F_=LÅ/0Â+olüÎRVemZïg/úLóö¥+æÕ·Ñ=JÚ¾^=JF¥Mê¯$?kG8uÔíDôôõ6õÔÅY:ÛæCG'C]¾{úY^äÔh)£ühÑñí¾wñç(0=IDÿ´ä_Ûå=beÂù¢6JTf)Ì¸=M=}Ap<ÆM®]µÔk", new Uint8Array(91333)))});

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
