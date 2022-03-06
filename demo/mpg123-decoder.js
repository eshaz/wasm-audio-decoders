(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  const compiledWasm = new WeakMap();

  class WASMAudioDecoderCommon {
    constructor(wasm) {
      this._wasm = wasm;

      this._pointers = new Set();
    }

    get wasm() {
      return this._wasm;
    }

    static async initWASMAudioDecoder() {
      // instantiate wasm code as singleton
      if (!this._wasm) {
        // new decoder instance
        if (this._isWebWorker) {
          // web worker
          this._wasm = new this._EmscriptenWASM(WASMAudioDecoderCommon);
        } else {
          // main thread
          if (compiledWasm.has(this._EmscriptenWASM)) {
            // reuse existing compilation
            this._wasm = compiledWasm.get(this._EmscriptenWASM);
          } else {
            // first compilation
            this._wasm = new this._EmscriptenWASM(WASMAudioDecoderCommon);
            compiledWasm.set(this._EmscriptenWASM, this._wasm);
          }
        }
      }

      await this._wasm.ready;

      const common = new WASMAudioDecoderCommon(this._wasm);

      [this._inputPtr, this._input] = common.allocateTypedArray(
        this._inputPtrSize,
        Uint8Array
      );

      // output buffer
      [this._outputPtr, this._output] = common.allocateTypedArray(
        this._outputChannels * this._outputPtrSize,
        Float32Array
      );

      return common;
    }

    static concatFloat32(buffers, length) {
      const ret = new Float32Array(length);

      let offset = 0;
      for (const buf of buffers) {
        ret.set(buf, offset);
        offset += buf.length;
      }

      return ret;
    }

    static getDecodedAudio(channelData, samplesDecoded, sampleRate) {
      return {
        channelData,
        samplesDecoded,
        sampleRate,
      };
    }

    static getDecodedAudioConcat(channelData, samplesDecoded, sampleRate) {
      return WASMAudioDecoderCommon.getDecodedAudio(
        channelData.map((data) =>
          WASMAudioDecoderCommon.concatFloat32(data, samplesDecoded)
        ),
        samplesDecoded,
        sampleRate
      );
    }

    static getDecodedAudioMultiChannel(
      input,
      channelsDecoded,
      samplesDecoded,
      sampleRate
    ) {
      const channelData = [];

      for (let i = 0; i < channelsDecoded; i++) {
        const channel = [];
        for (let j = 0; j < input.length; j++) {
          channel.push(input[j][i]);
        }
        channelData.push(
          WASMAudioDecoderCommon.concatFloat32(channel, samplesDecoded)
        );
      }

      return WASMAudioDecoderCommon.getDecodedAudio(
        channelData,
        samplesDecoded,
        sampleRate
      );
    }

    getOutputChannels(outputData, channelsDecoded, samplesDecoded) {
      const output = [];

      for (let i = 0; i < channelsDecoded; i++)
        output.push(
          outputData.slice(
            i * samplesDecoded,
            i * samplesDecoded + samplesDecoded
          )
        );

      return output;
    }

    allocateTypedArray(length, TypedArray) {
      const pointer = this._wasm._malloc(TypedArray.BYTES_PER_ELEMENT * length);
      const array = new TypedArray(this._wasm.HEAP, pointer, length);

      this._pointers.add(pointer);
      return [pointer, array];
    }

    free() {
      for (const pointer of this._pointers) this._wasm._free(pointer);
      this._pointers.clear();
    }

    /*
     ******************
     * Compression Code
     ******************
     */

    static inflateYencString(source, dest) {
      const output = new Uint8Array(source.length);

      let continued = false,
        byteIndex = 0,
        byte;

      for (let i = 0; i < source.length; i++) {
        byte = source.charCodeAt(i);

        if (byte === 13 || byte === 10) continue;

        if (byte === 61 && !continued) {
          continued = true;
          continue;
        }

        if (continued) {
          continued = false;
          byte -= 64;
        }

        output[byteIndex++] = byte < 42 && byte > 0 ? byte + 214 : byte - 42;
      }

      return WASMAudioDecoderCommon.inflate(output.subarray(0, byteIndex), dest);
    }

    static inflate(source, dest) {
      const TINF_OK = 0;
      const TINF_DATA_ERROR = -3;

      const uint8Array = Uint8Array;
      const uint16Array = Uint16Array;

      class Tree {
        constructor() {
          this.t = new uint16Array(16); /* table of code length counts */
          this.trans = new uint16Array(
            288
          ); /* code -> symbol translation table */
        }
      }

      class Data {
        constructor(source, dest) {
          this.s = source;
          this.i = 0;
          this.t = 0;
          this.bitcount = 0;

          this.dest = dest;
          this.destLen = 0;

          this.ltree = new Tree(); /* dynamic length/symbol tree */
          this.dtree = new Tree(); /* dynamic distance tree */
        }
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
        for (i = 0; i < delta; ++i) bits[i] = 0;
        for (i = 0; i < 30 - delta; ++i) bits[i + delta] = (i / delta) | 0;

        /* build base table */
        for (sum = first, i = 0; i < 30; ++i) {
          base[i] = sum;
          sum += 1 << bits[i];
        }
      };

      /* build the fixed huffman trees */
      const tinf_build_fixed_trees = (lt, dt) => {
        let i;

        /* build fixed length tree */
        for (i = 0; i < 7; ++i) lt.t[i] = 0;

        lt.t[7] = 24;
        lt.t[8] = 152;
        lt.t[9] = 112;

        for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
        for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
        for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
        for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;

        /* build fixed distance tree */
        for (i = 0; i < 5; ++i) dt.t[i] = 0;

        dt.t[5] = 32;

        for (i = 0; i < 32; ++i) dt.trans[i] = i;
      };

      /* given an array of code lengths, build a tree */
      const offs = new uint16Array(16);

      const tinf_build_tree = (t, lengths, off, num) => {
        let i, sum;

        /* clear code length count table */
        for (i = 0; i < 16; ++i) t.t[i] = 0;

        /* scan symbol lengths, and sum code length counts */
        for (i = 0; i < num; ++i) t.t[lengths[off + i]]++;

        t.t[0] = 0;

        /* compute offset table for distribution sort */
        for (sum = 0, i = 0; i < 16; ++i) {
          offs[i] = sum;
          sum += t.t[i];
        }

        /* create code->symbol translation table (symbols sorted by code) */
        for (i = 0; i < num; ++i) {
          if (lengths[off + i]) t.trans[offs[lengths[off + i]]++] = i;
        }
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
        let i, length;

        /* get 5 bits HLIT (257-286) */
        const hlit = tinf_read_bits(d, 5, 257);

        /* get 5 bits HDIST (1-32) */
        const hdist = tinf_read_bits(d, 5, 1);

        /* get 4 bits HCLEN (4-19) */
        const hclen = tinf_read_bits(d, 4, 4);

        for (i = 0; i < 19; ++i) lengths[i] = 0;

        /* read code lengths for code length alphabet */
        for (i = 0; i < hclen; ++i) {
          /* get 3 bits code length (0-7) */
          const clen = tinf_read_bits(d, 3, 0);
          lengths[clcidx[i]] = clen;
        }

        /* build code length tree */
        tinf_build_tree(code_tree, lengths, 0, 19);

        /* decode code lengths for the dynamic trees */
        for (let num = 0; num < hlit + hdist; ) {
          const sym = tinf_decode_symbol(d, code_tree);

          switch (sym) {
            case 16:
              /* copy previous code length 3-6 times (read 2 bits) */
              const prev = lengths[num - 1];
              for (length = tinf_read_bits(d, 2, 3); length; --length) {
                lengths[num++] = prev;
              }
              break;
            case 17:
              /* repeat code length 0 for 3-10 times (read 3 bits) */
              for (length = tinf_read_bits(d, 3, 3); length; --length) {
                lengths[num++] = 0;
              }
              break;
            case 18:
              /* repeat code length 0 for 11-138 times (read 7 bits) */
              for (length = tinf_read_bits(d, 7, 11); length; --length) {
                lengths[num++] = 0;
              }
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
          if (sym === 256) {
            return TINF_OK;
          }

          if (sym < 256) {
            d.dest[d.destLen++] = sym;
          } else {
            let length, dist, offs;

            sym -= 257;

            /* possibly get more bits from length code */
            length = tinf_read_bits(d, length_bits[sym], length_base[sym]);

            dist = tinf_decode_symbol(d, dt);

            /* possibly get more bits from distance code */
            offs =
              d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

            /* copy match */
            for (let i = offs; i < offs + length; ++i) {
              d.dest[d.destLen++] = d.dest[i];
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
        length = 256 * length + d.s[d.i];

        /* get one's complement of length */
        invlength = d.s[d.i + 3];
        invlength = 256 * invlength + d.s[d.i + 2];

        /* check length */
        if (length !== (~invlength & 0x0000ffff)) return TINF_DATA_ERROR;

        d.i += 4;

        /* copy block */
        for (let i = length; i; --i) d.dest[d.destLen++] = d.s[d.i++];

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

      if (d.destLen < d.dest.length) {
        if (typeof d.dest.slice === "function") return d.dest.slice(0, d.destLen);
        else return d.dest.subarray(0, d.destLen);
      }

      return d.dest;
    }
  }

  class WASMAudioDecoderWorker extends Worker__default["default"] {
    constructor(options, Decoder, EmscriptenWASM) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
        // We're in a Web Worker
        _Decoder.WASMAudioDecoderCommon = _WASMAudioDecoderCommon;
        _Decoder.EmscriptenWASM = _EmscriptenWASM;
        _Decoder.isWebWorker = true;

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

  class EmscriptenWASM {
  constructor(WASMAudioDecoderCommon) {
  var Module = Module;

  function out(text) {
   console.log(text);
  }

  function err(text) {
   console.error(text);
  }

  function ready() {}

  Module = {};

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

  Module["wasm"] = WASMAudioDecoderCommon.inflateYencString(`ç7Æ§§c!ö½vPÃJh07ºjzÄntwø:l¢{k«ÿÉ@×d=}W=}l@á½Ãë.¶È¿zÝ°iÛõÑ¹äJCáÞµØwßÅÔ|µÿoÜ		)äøg!v<ê×%êÆ©ç'Ù)©å¬a	$¸Z2¬ }f__?x>¨,hQwO<â>½¦¿ÑP#Ñ.Î´ÑP¿lo.ÎÅÆ{Èw?%ÚlQ"¶PÐì3,Qox;®ÿö9wça¿~Ëè ÔîÙ, Ëþ£««¦_É¯.~{W¦"J!WkiéérÕ	Fèÿl¨S2#§Å'ègÒ¥z³9®¡¯{W¶½ÍHÊ;7~Dç$=JzþÝÜÕevï{z5ÍÊ¡b7äÔßRØ±ßJxÌbX¯kF !|>1ûgY³íÝõ·<O§Ë¬|S²\\éB1+ú®kOØp$?nëÜb¿ôW°7tBxqý{ÏøQè!¾~ùÓ¯éF/Ú[F5G°e­N¦q©±e­­"UëÙ±7ìJ9½56!±%ìóçM=})ùå©W¦y"Õ)¡®æñ¸ôUØÂ¤=MáDéÀ£e ¸·$Å	(à-¥±ØÙçá¦"Ñ{~ÂÍ×û=@^baèOU¥£óyõÌYD÷ÛV=}}×Â}º0­ÕÜ|H¸ÏÏÁ.ÏëÒiÕÙ=@Æ)ßÐY2O$B×x­»}~¢j=@üâ|ÐÏfß[ÌprloØýù°ûVBÿ2{Lÿ&¼|ÎeÄ±t¿|¨Hkâhï3÷û_kDë«ÿ¦hÿõÒþ´üj=JÙ·C/âð 1ÕüZW­qÐÆòô¦p!és;{h\\ÄzpDDâ=@U´øíû%Q\`ïáQnY1ßu¬Js=MYåÌ~N¡LBõTªDc)àõäq¤t=M»µ8|uø»	þèDWNwpü-×gü¡Êÿí~D=Jr¨bÈÿÒg©¢Oc«/("Ä÷ßì"AõDèÔ£èØyeéØE=@òqhN	nÞ\`=JØªL«UÊõ?zRJ·Ë43A({Díy:D3rùj ÎÐB5@VµÔïz(Î>ÞÞâý>ËÛÄ§Ó/J(Ý{'ESç¼I9póÊvsÄÅ¿±	¿ÀôÍ=}qÜe=@óÅ£ÖxUðVpµ!öê bòz~×^Ë(äÙ÷Ô>o×R¶ctk]w¢Äß´w-¤¬BD ó0N7Ó_Uwõ3e<Jé°½=}>»ÿs½L6PÝ(Þ¾\`²À @Ó|Ù*ôIO9Ð1 yz£9)ûõTðÍ.¬ü(ÖÓ¬0H?îxå£ Î§É©©=@XÑî³¬ÔÏûÞfôÎ7iwÞ¼äQÝËÞ»\`sÄÊ?õü(¹åðÍ=}¬^KCª¡4dÆä«cZo*sÍÞqs/eÿ+eúÐU²w1×:|oXÑõ¢ÑDu:3ÓüPvvzGÿÕV·(3(ï>É9 CàV­9Ú¢õ«ìD2ÖàZOÈ¦® ë~=MÍ?hÜÎÖ%tcÎ9½¼>ë_Ï×JçBU¨d¦ÇÉÖöt8ØÖ]nQ­ûÖöVÔ?s½u}èN×®çÇErðß'Më¹]ÿy)¨JÖ<ÈÀ?óz;D*f¹Äãªóüû»7¡ÃéÀ/+ÇcÎ*t}ivKgõT~Wtð\` ó¿»mmâS=@8úß3òTÊ§ì(ÛW"%í>öÀËá²wÊ(Õ9Ý§:ûRHËp.¦÷DÝNà¼°G	ÒyeVö"àû·ô5ÊÏæàÅ(ßU×æxñKTíúNóIqÃÄU·ÛÖGQÙ·åÆy¸á.§nÆÜQnsnfvm¡?ÍÄC~fÄ°s$^HÏhÅ{<$Ö¤ÐOÏ|õ4xmÆByM_þÅp«~OâÜªSD-eíÐÅ¨DægÍ£\\oåñª,s¤ ÞQ0#uþf|ré=@/#@LàcÆ÷!éSû§_¹&2#=M	Ýi2úIçiÍÆN­p.£dØkYÏk?Õ¼£¼o?ÅÃÃlüËîttT=}ÑÅÚ9ýüÎ(.&=@¿RWÝUJÁuÙZ1üßËòN²µ#jî5Úq¹ HÅúÁ­Sç½V·ñ¸ÌÑäå^TSF{süZÆþ.M=@Z,Qî?S½öÀÊLLÿEGnr*	ovøîÂBù+dÙg&½Eýº[yDGgºßh=M×_×(õÖÊ/[«;¸jÔîE÷¶piÝÃøòtÿ^À±÷gµcà*§{#Þ¨>8¬Úcvhç[®ÄM+Äÿc*¥!Ó³æ]óÔJÞê¼2j¾,É@¶ï3UÎ¥U°µt¡1#a®¦Eª¥¡jÝÍõåëXè[ÊzäÓÖCÃ²zð	°B®ær³CÚqJf*>Ö¯5£Ý1ð2BC}êþMNâz«?.wðîÃ¸óDÐ."¤èN9²Ø9P?3Ø.ÛpòljÈP¦âã?]ÿ°|yq÷°oSíóºS0nÎ®Ä¸^7ÉÒ]7uLÉlöDwò¸áÂòü àÎîqQ¢_¶HÃäØwGM·µèËwþðo¥'Ì¾Le³±ükÙ4õ¾ïÈèw@&d¯ÌWc$ÛÝMmeòx·D	ã¾ÖQCîÕ^LíµÕ¦{NÛs=@®WÁÃ.>áyÅ*zþßÄeÞ«WÝá}OÎi7m´@û\`6d:tìËËÍqQ²ÜeVÍk{&Ç¸?k]ïâÓ¿¢l'-#j5e¸[¡÷?T¤Ä·÷(tÑM¬SÐd0fÌÑóÎ^¾xN@S$]1 AÇüR Sb{Ú_ÕÕEî>=}4LTÑd?Æ6bÇ¬ÕË÷þÌð]G@yr·pRC[oz¯f<*n¢UrÏ'3éÂ-¬­hÌpÇ¹ÃÕëEÌçjú¿À c¢Ñ¶j²¢ÙË"pð~Åÿ×éïg½a°iHâÝë1 H³ROÜ :Òýß§ÆßB!{@»Ë+òe{µLoÒH:|S¸*ôãáJte9áêA7ê)Ì¥­Õn(àÔØqË]×qGWÔHß(?òw8kúÁGGuäç]¬YhÚÉÍs¢.v¢$ÍÆ\`ÂûÞ¶Ò/äÝDZSCNÏÓìGF¡þEV2:²F:ÜßéOqlhNPdRÄôI(gzWV­G ¶9Ñ)¦¯=Mu"¹N5Òn®^¦ÔÍBøóì8xR~o2Ñl]õ÷t¡ RÕhø)ò$NÌçíÇ#é kQúÄ3T Ga ]dN7ôMjjÁ/ÞÑ5(H¼ÛÞ[CoëO°v2%kº;¿nð£þCØ§\`6 ÁzeFòd¶â2x;ßÇ¡æ¥©e^7F­.Kh\`ªl>ÜEÙã1â2äýoqöLô ìK!¡¹Ð¥±àÝá	°ÕµÌþ2C®¢¾ÑTafd1ÆÎqo|álxr¢gÄËÓõmíÇ¼²|}¿à	=}½ìl°íÃ¨r:å=MEid£ù¹G0ñ¿©yc¾°pXS)ïE"·W±9ÓM9½ÁÙ'ø³»Iæ$àÁéÎ!ó!ö	¢úmÉtØ8ML¯G=@(yí¾%yI¦ùI(+¡©%)kHßÙ%Ièç÷èeàF Y)9	íULbn	¸^GQäDföÆÚm"b"Ý¹¦IRíõ¬¤µà&YZilòé±Ä-°pidá%tpghÎ|(÷9f[âã'à©ÔùAYÌ­­8ÑÏm÷«­àOã¯}3¨Úzº ä¹*Õu	bHÕNôyfø¸@ÙVô9HÌ¬¯á'¿}=}\`y®ôML¢ÒGÒTGI=@ßê'LgF©½»×·\`YX!î+öö#·4&±»XÊôÜë®½ÅW0ó©O=MS¡ûÖ#ùêcG¹äàá2)å½«BtûòÏ¡CyÊÊ·YÇÚ¸SèÉcC&Ö :Á\\rbÂÎJ½òBÁ2KÀM=@;¢c v$Ö¼N¦íC.Ò¸G=J]=JmeàÃCt^fl¯G+QIâ*8{4ø¸ã÷2eno÷²2[Dß¹úà¤eÜ4g7¢KÌÆj2±±Fîk=MLÊ+¯ÅN <¤rÏïóY¿/ÍåbTâmôÚá°:ç_¯|×bð°®ß"þ À¶|!àÞðç×B×\`ìÐàá7EÍ7·ûïðÝ¥åSWdÐ'Ààknvrº3Blm5ú±ãZ½Ò_Ürrñòäælá3m57¡.Ws¥]^»¡çëÂ@~u+wv«ÑE9+D;e¨Z!iHâë\`=}:¢Ö¡ÚWº½ç¬µQ~´Û|ÁP"ûÊ'cÆiÕN#GáÏGöQ¬¿	W¼O®#=JÚ XsAv£¨ØHøÉ_À±kzGgdñ8Q©QFÑÑ0¬_ðsf ©ðé*¾0uqôE°®TC°ÉF4mâqÄ\\DÄY×´xþÊ+º¯B{VÇi³x»¯ÝÅ²Ç{µüÖW«Ý]$±RGã=Jøi=}FOäÛÞæQpû$ß=M¡Ò=}\\ÝmÝq?Æ±×¼ÁM¯IÊo=}&[¨®mjC,d]ÍÊÏî¹â]8l¤dê¿?lFxÌcæÇEÿ¶ üE,GçÛØ¸Ð¯Ñ¡ÿZDçÍéGíç£À{ST}²(r,Æq¼î¼¾7Ý"ô\\Za"[v<EI9{»RÐËØþIïÕBÇ/»ÈV¤æQlq³Ón{ìYÕ°Ýd7}.cùzåZ.\\'¹5HÑó-qÊµôr4áãóúºÖÅLbn((pàz«W»Îáusyü´ú6ÆÃ=@6G×Sä;3ÐX!Ûïc\\å³Eâodsoy¸w»gV\\xRE:.|¶ I3þ;¬po°aôqÜòµùC®\\Ý}ÖsÁ;t UÈZãGÒJÕ¸cT³¥B,^àMI&ÍÉ¯6$ò°X¨÷7ºú:u(=MU9'çÝhrÄ¨ ØÝh¡'lÅ{ûàiF(êÛ	§õhì%'ÑÈg$©v(õ¬¹ÔE±i¿ÖÑXÒ±ËfâlfÜ½QQÙHú³¢i1ûým¶Qi´ÌLB[íÈ´AÝÏJãn7àTÊãnÅ©m^Áè¯h®5drÔ«­<Û|®GM¶Ê\`ËÿsË»I4Tf.}þÿPç¦©X${ÈÀôßÔ@òUÕèQßþßz¿MéÆ=@,eZx+µÚòVÍçå¥E¨A+6ÌLg_ nò|²Pk´d0L¨ç3AÎã­¢ä;Qq"{c@=}¸?&ÜFù Ù=M¦Xq&CîHz&4¤­¨îÄ|òÇð=}üÃáaS|ÒÚE¦TU¡K¿çD~J>_æn=MÃÂ¡MÐÆâÙõ²ZÚÞ=M¾m¤:¾&Mæº}jDÆA¯Éð=MüvêâGfXøäÜò@5ªâ¶ñäVÃóÔÅKV=@ÕñÄÖ[½\`m4´¹ñv=@áCÌól±:ùùøÄóÜC´¹×?XÜ³ÖºqMEÆó°\`-Ü¯=@ÜÝRUÜÅOQb9øLåý?]r)]C)¡¸à;à\\h½WÜ¼dãpwÒ°lh.íÔ,°R}*üîÃv³\`uë*Þ©p6£AºÖê,ÀØ,+­]CïNÅÏªºÈF_=MIX3ÞÝYâÁÁ¹ãÁ_#ÍÆ¦çæV©çæf©úçÖ÷É&¥	¡YÕyäÒCã¦èÉX-îÝüèPiÝ«ãæClôÝ#aò=J (vàX§s¨ìö<×ÄóÉSüãç®FÝ#ýXÊ_ÁZ]½b½79P$MÃsS¦­ÎÖS_ÙÂº¤ü¾4XLU´HÎY¥|ôó§\`ÏÚ¾=@öÀ÷Ùv=MÌÇýRß¹Å#rïýÔÎí\`Å7UbÇÅFwÝT7;®×ÛÚäl)V)MøØÜú$üËãÖÀsÿjÃsgfÅã,¢À);5OùÇs=}TÝv°ðvõ¡A©ÿC.Ôã/²nññ#ÊÇ@ÛSëÕ7¾ÔµUÔ°±¯³ñ¢¤Vì\\-]Á¿;ºèÀSÍÜà´¯½Øw1ü7twøÝÚß|Ðÿ=JOÊh]õ&Äý¤¬÷ÞEÖÚ¹Å"B9{©í-\`jj\\SÇ-Ç¯³ðbUg©\`WÝêý,ÒðÌ@JY1ºÌ9Íy1£Õ¡~¦e>Iiñ±¾,RééÍ¨Õ.¨ËL\`â´aÂx§&áÆúÁè¶ÓÓz¦p$2o=}¾ÒÍ»§æ»¹ÐU/¤ôjkooë ~îï<=MÚÚSZ¥þcÞÌørüRuZG|Â¸ gI:«TÊ{JâÏ²vîL2zq:}³®[dtÙ¼YWtèÀ9ic5áuØSÎ=}ÓU#|5½tùÚ:vc§ÓKÑ¯¼9Ò; 7IèûFúOÁÖ>/­ãóWv~=MälÏee§oª#Êt¾æ­9íRjìÆÌjÏ"Ø=JÜo¥·8ÍÌÜpLJá=}hñnÇx»Wu©àT!X/óÑÉµ¥ùØóQlÖÎ\\ÑÈZ¹ïÃ'ûYs^Ób3×·h#«Z­y´S ¼ ÒnAÁví«9^¦°CV­Ç=@pt7Ãhn¦åN\\T±½Kó=MÐEºûGÐÔ¥·=}=@Ô¥ÔN¦B¸skßC}BúLbÆz-=}¿ðDán28>Dñ=MríÃî¸kï5Ùm83ÉRWHÅM²îúÚ-¼þ4ëgz¶¥ÎÓÛE[|»ÑÄ±=M<Ìú´¢#vêÿqlóVFd3Ø¾r­ÊÏUÌï¤=}!;HVèýê(¬¥K?=MaEÆø+éN^k+¸¸Ô ¨7(I(x¬ØÌ¬7P|¼ªö¿åqòÃVí×ä-eäÞåþs=@ÙÂÑ!z'JÉÆá-råýJÌHÞI­Lßb=@ÔQZ_FÈ^@~S)ÙQy(ú$É)%UñYa·FÈé8PV1´È¤«S£÷TÇó¬õ#·Ñ\`ø9Óyk¿¹ö ÅÉ"îÕX%yf¢8¦uA:!³1áhÆy	^(2wÒ÷ø|³ùgV#¸äÏ@7åÍ,i Ûpt#=J#w¡êEYëÙû	I"ÈÛêô#É¨%énn!Äªí·Ä\\ex«C2¾¦hFÿùþ¥.THÔVE,Å¤Á±=}=JÜHdÍ=MUGÜð»LgXU ¹Ô¼¡qÍ¹Ú½=@ÏoK^*ÅAeøÆn¯D_Z!	M	§íÕXå?eÖõôI'g ¡fËñ±hâõ6GÇ0+j¿p?,¨PÃÇO/ß:û<À¥§þ9¡å¡é ä÷¥à*õ©ü)=JF¥¾7úìJ:üáeÕ¾q­ ÷ÐÝÝ3|gWPÅ®DS\\Æ½H=JV*ZY\\z°wñ¥uv øçO7~ÛUÜuiÛ#¿]üèÄ'£"87r%\`Õ!¥0¦¿¥QÞ®¥Ýé*D¾O&CÇH=}ÅeÄN¥¬Ûg¼ä~KcX1[ÙüüXËÄüÈvþâíðo¹¤¤¬lzèåW×¶i\\ÕX¿Êßµ¤¤¼­{ ÎØ,áF¦yz/m4a,mW²'QCÞ'¡_9ôãõ¤($i)8í¥í))Å£æc"º7'£_Ã¤}U¨pÒ­KÅOv¯ö÷z­YÏiö®HWÀD¯HÆZ.LjT!þÆB7^öqÈR=}pàUn(r\\ØIoftíóKÂ\\ðÍTÌ/tà|vñ²æào»¡Kòq6q ¶GþØòÔG§ø¸ç¹NÊÓÞX.³å-õNõÒµk½ÌÄs¼Ö-_Ø£?Ps7\`)ÇÐVë: ?%3Qq=@\`÷íó¶ûJw; æYµyAÌ¥­ÐÊ8ßà§®Þö=@2v¢§Ïê»ÉiMòË¦ª|ÊàGP¶RÎF|Mû.UmÂxmÃ=}YþNä}ð~l­©Gµ¹Dó¨ebx{Ñ,8»+]%_xo9È\`\`öÂ0¸;kÕjP2Ñ/±dÇú[|ZqÏkÎT WÇcÐQOÂ.By@PþúÒA¶´ïÞÂþÆÄ4[e|}ÃµËÎ¾Î^Z¸üÙTË¤e5öþÕîâNOþÕ>µ¤?o¤Ô2N(Îr{xR~þfQîÊe*ÍÂïTÑ\\ÏxL¤©=@ëP@>{óè×MÖw¡E[äµ#Íp#Ã\`ïcûÁµOdµàZ=}J}ÞòP»úúÍîãÐnLÓq1=}PøAìümÅ$~¨&¥Oÿ:âØÓÞÇ¶ÿ·vÌgÌ0¾,º	.´üÞ¼Ê=@®nÁx±ûd¾Ð×Árù+9ÍÇðÃö.Ä|¾Nv¤^2ýëL°´Öádåýù3y	Æj,|áÂ=}K,hS¬Îx®ÑÅ=}GT¡ÐpCà®$®=}A£Çíß¾Ì8îqäQlQ<b#öJî«t=} Tª~1ö¼m}¸ä¯nËíf-xP½×3Í²ÁÖ¶±îvJMo!{7cz[íÓx¶l¶=Jµ=@/Eý»wTO\\¿;­3ÎÒÑZ½$ìZ@Ôúº¡ÃÀÇtÜ~¼~8¶ÉTßÿ:~Ùºvý}q1­CC*´pÀéµÄ8ëñÃTºF´EÍJìa·ìØÔÅqþÂ¬ÊÓjt¥:ß¥Ñg){´A_ñ²ÄVóNrõT¤e[®\`ÖäÖ×´ýÀcq¾f¶MÜ	jº]'Â÷º®·0#´Á·ÀÿÚñU=}þB§QçÚå4ÛÁkÙ>®¬:¿7£A³¿¾Ù;§ËZuäV¹ÏHsßïºñ_ÞAç¾Ö+ÐN2­ÒjVê÷­wÒàÅ=J!({se½S¯tÂ._ÄåÊY×ÉioÃÎòOå&fÚªÇÅTô;à«×Þ«¿ðÔÚfäuÝè,À|×À³ÇZ VþKBÁËËÇq9ÓõÚüÚ&ÿ·ñ¤ïG?Ms;Ø¤[1 ¬«ÄÔ¹;jí\\ÊTçÄ©+ôYúb¸qÒ´ûûÆt$XÅ/RS·ÝýäJÌä¸»²=MTuEÑ¾µ.Gîàoý^m¦ýª¾AáñLÇ£@-pòw-É|5ò­w×Þ+¿÷ÖÉËùiµøùÕØ©×}>½XùYcÄI%Òvº<þe#ßõåÓr/YFwÃýPK]g4Ì>_lÿL=MBàäùUrcåå.ÃÄ=MÎëÄ%:+Eµ·&dV}Äë>ù$Æù)#Ø^-ýAðG±i«L¸î\\©fB¿"©gU¤UgggUT$²ô´??´?OMNlzyßoÜ¬^às&sÚçåÑÝû@7*ÄMkIµJXú}½Í^Ø6½WëgÕÊæ@h@I!­öErQy±kÚ"j¤=@BöÞ{PÊlhó	ÿí6£WÙÌ=MÈ+R1\`úDÎ%.¨d8ÜCòtñby7H{9G©òðd×ÂÖÎ!pÀîJ´S×EhDâ@÷41IÓÛ^å6]=@ü+s^^u¥¾{:yþj=}Y¬=JþÔÛÜëë»·v¯k~*sF¿Ø\`ZP®KW{â¦pØÑ¶³d¢dÚaEì«^^bÈyaV	RN)×n;8ÔHxÂ-ÝÃßÖÜý^SÕZóåä_î*ûtDJgÚ&dn³d=}a©ûÞj=}E0Uòô3vs+tû,º0!«w¨×GÒ_Î y­÷ùÅfîÿ¼aÛò=}ZÜ	ÍrM*J-î[n¿_ê_<¿®ÒÀªjR?§®¿Ë W§7Zb,^íêZ­Kêz#ÐÕèô~J<1µã­\`908~oZf0ÿL#¯4vÒutä§hâßSÈ[&ÊÞ¹+5EÆÃò¡hW=}IkÄ¢§õëü¡wé^îrÏURº?å¸¿ìà^²wÜ;NÖðH<ÁývrspÎi¢ò»Ë^=M=JbLÎÍs=Jt5o®·ÔSR6¦7ßoEàyÞGnæzL¥ÍÔ1¦Î Êsvu×õBª"N\\¯GæÞùÞP.ÇM³}a²ª$ùøOÄ,:NÌnFUW{NÜØ__;ºÍ9$=@:\`ó¥Ì(Óò1\`4c	L'ê¢\`â	É¥ñ°"P|Q¬	¦Ë!8ß0ÒZGzòß¼lÍbÚA	Ü÷É!òmÙb\\ël#Q)o4G"®{xëÿ;¦¯´ÈÝ<«½:#>K»,qgÚXÎªcâ¥;ÌÊUÂ!×*zd½TfÀ9ç-¼ßzeópÕ0%ríPËg²_÷³°KÓh9Â=}FÍ9qÓú]2vû0ïÅÑ5_ÔÉxþ< LàFmäz?¾yo¾ÓÔ[æß<"	Ós"Ì7§¦e?Õ>WÚdýÕçc]<xä0ªÐü·=JÉAÌâ1O­|dNFªÖFmxý£wãS+ªt¯­ú­aøyî\`À=}êª(föáæ$\`â¢þ0iKÞÀ¦dQ&V<ù½üøWÇ¦í1þøoÔÃe¶ÎÛR¢¨õ9%ÈdxÃm5ª30üØy	DRà£×³Ü¨û¥AÙñ&A­¯¥=}-·ï<Ïçå·A´·|tS ÅPÇßSAFN;­39¿pÉ4àæw¦ßûxðÇwy¯lýÖ/ûÀA¯µµêÙÓ=@V~­bÎ÷[;ËÒ+ãí)lAk×ºx¶Y3-ndr»³nzRH~û|ÎÊxMvBéTÕwBàÇ/ß¿½ý+$õ|<$XDn.=MjþlE­=J÷à]Ôºð¨±ãþÎI±)üXüë8*=@{±\\ßxÚíÝV Æ=}òôÌã6SXa#<ú<Óºß·ÎddE?[÷ÕòÀ3µ¤ÞóÜ^RG:sµ­²k]mD¾+¶iUÄäï´ò	êØ»i üôÌy¡X×Ã ð1\\J¯DT¢È?<2î<mÐÁóìÒÄí¿8o\\ï6©^ÖÇ½g¥MmCè^¶<ÎÜ]/{çxë­\`E­¦È½­·­îmÍµðJ×K.¼6tÕñåVvº±Êb"?ÍÌj}Ø¾7<ZDú[:ÑÌ&ïFÚô6¹aü«9;Ç6Õö\\eµ õXRy_6µ´F]R|<½ëV6<ÇwÆ³ÙÄ{÷Þxù·9çIgvûÈk¨øðî»ÃÈ^6Å#!m2ís!Û£ÕSfçør3Çx9ý^*g!½©3CÇb´Í±»JÚ¡F§ÿKÑ©ÃijD=MÇ|T9ä,]Uýåt>»^ÔðÆÉæ»¡ÉÀoÆ½\\v4sÖº|ýØ®]wdxE=JzfyM+y9«xØ3%-C¸¶\`²ÑùÀquBE!¶ßâ,AËÕ6:]·ø6ÛúüÓO'b:åfL&biVZô1Ï~ñ¯8}fò!©4;mj@ÌýyÐÅÃt}ýìf^¾q?Ûáó=}dHÖuÑd.=@ÁH=}ÑøMnQuê2¿òùÉÛ6¨M\\APßGw46üV¿z'\`Ò6~Ï?6ËoÅ/§¢EöTàE!?u6!¢KggEÍYå[*^D(w¬íQåêÒ[¾drsgÑ @æ_ñ«m¿7	Évxèdd"Å[/NíÜún oaAW-Üq«öx}¿±ú¦ä¨ô6°­&1HÂÈhû>Qcad¢yâSä÷KFt:!àÅ]%Úý(gÂÈSY öÞMZ±wóõ ²SðØa¿Eã,ÓNµz¶B[¿éY=}=M×Üb·²Ü}j¸øÃxcñ©a®RªKÉK-òJÎ{ðd¯æ»¢¼AíoD÷ÐÐ ¾d|HwFÒ±>íÈ#'¹CÝ¥¨ÏH#â%È	I¼éâº9åº=}7É§%âcA¡òÂ8±¡âè,ÇÊ«GD¦*afv@=J¨~zw!«£Eg%¨4F%jScKÀðE>¦¢j¢]×"Q^<1ÉúrýAbRï+oM)=}ÔÞã°ÔBK ¯;ôÑQÇ;(¹ÜR^ÜcÚëâêCª­¨gq¹W>Å[EÚM¨)©\\æ2Óìx]I÷(dBçzxËð:°*àß9p½ÑÕZ459;^¯klÁ&ÕÜw¿fwéYÓ"ãtÔÍ#Ü¡è"tbx³8ã´Jyò'ªBl§õ-NWj7H 7\`»@¿H&E)ÜFh£Ã\`k8#kW½²dv¦YÆÅ87Ù1èu]©ü²~ÀYX«7gp¥ÔjQ\`G5*èB»øÃ¯ä×¡þ÷M4*,ïµìÇÖ¢n0é=}*¸_¸N@Î®¶ht(POmOwË"ïÍ©UO9=Jt\`&5LcÄZ948RQZ*Æ®\`oEÄA×¦ªê+°ÆkÊ¼0i$a\`¼7Kµ¼¾)ÂÞs+vw|£[ÁþëU=}®P5Ðb3VrW\`segðD.5Ò®qÁ*ôÕ¢ÑJ>23Sí=MuÁl¥=}¯\`ëÍ´áOîU"¬FrÆÐi¾BÑyÏTá\\ÊxPüº\`Lª­F=}d×/[ÐÎ¶­ÝÛ¾Ö'HD4ë»DKv7õëlÅtR¬RÁN¬xXjp0\\§\`­r÷@tÛV{à±k±X«õÔXQAC/Ñ¡YùñgàT,]ñv·a\\¿&Oöw.<ôö>»?%ª·¯þ¦?¯KÌêÍ×Wí»=J0ÙÖ±ÑH¢&i¦Î×Rz½*ø"Qî'¥+ûçD>Îý 4&xÚ2DÞé u^¡¸ªh³Ä?=@NÃ0µÀÃìw^¡Â&±483ÐcÄi6Ñ«­Ð,*÷Á[k15Xµ:ýÝ*ù*QmwxéÅ8X.°9°«áN[}T«ËãÎíû~ÙZ¥ÁËåwøPä|¯¿Â÷¹ÍoÄFÖøÎZv¡¤¹ºö<=}gE«8®üOÒaRc[¿¸Y]óÆ£¯RõÈ´å«-Øð·?ÃÑ-Çc º=}5­ímhí÷Áÿ#6x":}lö7Üc7ý¥M(´¥Á7ø¸üàk9äÆrÎ=@f¥Î¢ÍJÏO£wêým¨Vm+zölqmä°{¶nHá¡j=@Üþ¦³N¼¸MVecQ]dÕÏ¿dçKX>ÒÒ&ôz)°O Gb@éfõSÂFf@*ªX9~~,èvüZgG·õÁ»EÜ²»|q<6-{]Z¨µ-±-<zòôu¯ëÙÝÇ8¯Í	PºÙ×.ØÎ¥bLK0¤ÆMñò(¸î:WoóíÀ·©Ã~+9O<ðÅ=}D?[ÀAü<.¸¦oÇê3  ÆrÐ÷WzÒÀá5Q-µo½ÂÍz²]º¸ç=@s,ýN[÷¯þÐ<Üó¼ÃðÝMLäÇ·CÚ þNüòtádýÁáIxw lSVeÿ0(¦óÓ²ÎCÐóã«ÖÊtôj$D<SòèS#½Òdÿt2øÉyQÔ¬ßKà"<y»çuGlÄñÏ8K0h¹mòÈodéxÄý%y2å=J:ÜÝLó^GÕýÍÙàoXs¤Éñc;ouÇrqIá¹í5#çEò]?	ý@üÛ:M©·Çæµ~4a\`7±h@[ fc4Y33ñó+ù>¼e4Ûô¤:óÓÈ9=Jøø#8¤=J9é%IºVJ}ÆV@oÝÙ)m¾ÊøõØÎ®&ÃWMþçGFrS9WlÅþá#[îÏ¶CõÄÑO%»	ìyò·Ñ÷ÌæñùºAßï£¹ÉÄ!«]¯ß»)+õY|o åWåãø5qF}L¶±lv±~´ÆòË¸#kVóîn{Iò<AZñþØJó|2ÈjÝPJz ¯1jÄò$qè'~Úa½¹dV»dpò)ÇÏó=@Ô>w[?þÍÎr34Ý	æPèÓw¿ÃØ=JA¾}%QQúkÖY7ýj¼ÕÓ¸ÑM¾bµùk¦¢@Ã5ùK&X¦Ã¦à$²\`³§¡dòQÀùfÛíkÑã:ÏSf1Çxà«ËV=Jîª·è­ñLf¥Tí#Æº!úú&¥ÈéÊ}\`ù¬è=@oíuÆ=}øAñò*¸4s%^^Í¢\`÷·Q*Ùäoäô¨1üÝÎä«*²~Bjb¹ÈD,Ë§Ù~ñØ	ÒHîß¼I;¿»8qXäõ¦m_lq¾"Ë¤EpóÜbU=J	þSm»fYö|õûfXs÷ÁßËÍÖÅB gTUîÕR÷^>ÑødÑmzQ~À5îªk1aôÛS·s³NTÅ¬îRZÆR7|"è²a8^9Vsn>=}MöãnúJ«Éj©û=JZüÔ;'ÐçÖ¯bß½P#=MÙR£yh}=J2¸Û~¶çÂøåÞætÐ&d8@1¿ÐOðF4¥ãÁaöqNaË\\Ð|¸à­¼qjºôÃp7¹%5A|õ~Ónô¸=MóT~=}Y§	lËû{ñ÷9'ÆçÈÇðÍý\`sÆ¡=@õt|à­K±GL=JuýfpÛá¦¼n8ÚþkÇÀ^Ibû¦ÑbÑ©rVGéýÞ^#÷ýkFáwéûK´òûmÂ6ãOôG7û,=J¼Õo8f,ÒbïÃÀÆûúoÿs¼1ÌbÆêÓbÐññy=M_5NÍò$?=}*cç:GíË¼ëÐ83ï*=MmlO=}Odï#%t ¨ñà5ØÎs·h (\\¸)¶=}~§t@ô<Z=@@Su#=M#±³«'ºcQ\\È¸4tKHf§ä$hÐ$b(YÔ9	{um=MåÍhûMãå1¥Þ¢Ù!\\Ë9¥v5Y¥dZÞßàÔ|Ý&¼=M¹,îÕxQº¸Ü¤³"Ã¿,8$Ö\\!=}(«pÛ:ÿô»8xiþ«9ÚødÈ(3ÿÅÏÕ/TzÛ5ßæ4NÑÇ>s¹»ý4 ¸~:Aß>¹=}hö6<3¯¸ÕÑ¾LÉ×ÇíaåÜq÷ðò*½iAx+v80^=J&®jÆñ+odÄÒ:#ËÁÁæ°íÚ¢64âVr.÷1T=Mã÷!2%©pÐÖ?VLEÝ#Þµ\\=MU6íRsè"¡·ã¦!»ë]KÏÝª°'ÌÊÿ44>ÞäÂ3²ÖÛàâ@b!b1ÖôgÙÓÃ³«ì¯$én ^_5ubp>O}_êY¶ê<^V«D/=}ëOj;ÙBSdzÊÜlâU©ÄóÍëv\\¤Fo½¾e0ÑæOÝÅ=@Q@üçì8µGådí_ü8	<j](Ñ@àë?À¼kHÖ¢4·»åUx@	ÖH£ÒSeõ£Û§ôª	hÑá|hZ|n*î¢§N\`' 4øð²øzP<×µÔâÒÐCß%Ò¾x¦ZÝIßíoÃ±¤vð§þ÷Xt@l¦×_ÅI/t{¶\`ÍIåµüÇÙ÷Íà¾|ËÓ¬2G'í|æÿÑAËAWÙ¹ãèR=@Ì$×pIßå*ðÌX\`b§þ_o=}VÔ×{eµ°þd=}Io¡þsI¯óæTW>9C6±_m7æ¡%QÜ[4¨îi\`£ùî»FC\`z1/¯Öîu¾w0æS½ÕLþmx#ªZAh»"Gªqís/ø\\M6öoÀ²M=Meûm.NóIµrþLG5½eÃÆÂJPñÆ=}åh	­Û]¯ihY«Óóï¢¡<<Q+ûÓë¢ ¤=J°|9RcOëKôòþÐBé­xYÜçkÆÌúW»r'Òè~-G"¥þ<zãÓÂR}Y­hNh¼Pô©æ¢#Ú/Í§ûçI³ Y¡K±>¼©F-§:5æáªCí§ì]Àè¢¶:2lëlð&jñå®o±Ö^ÊáîffW¯Íå7v½è0#ËUwÔ¨kÓ¨Q2¬çÅ¹	Å%Ðmãëé)\`-þ^½Cb¶W·*³=J_¸P}ýî¦PkÅtHÕ±ç¥ç­¯àu¯ü¬0KQElUeÊ:Ì8I®?bJd	Y|m^9¤M=}KÝpÄìhú¿3ãså[³  ¶­DàñÇ=}ÂH·=J×ë³¡ã[Ùà¥½ì3¸}3 fû ¥ø_q(o1Óùß÷f¹ÊÔV&ÿ=J8-JÏÿ»¹»[¿L­c»ÈÜãwëF:Ç³ì×²k¦Æ¢HÅï'|ëdA\`¾ûååH¤4E@fò@}XÛãçÅøÍ³î4Å0ÓïLéH	^Gn\`Ádqo\`4A}«cqü:öüjE»P§9Ê\`ú/]|»½NÌºØ¹à=MvããlÛ<Ñ$úîÊíBBXM{;{ÑUÐæ=@âK{R^Ëõïæôú3:bÉ¶²Ò|U¿AÙ]QYRíä(=@&ªÐÍË¾èûÌæ»_ó´ª»5+c;M  9?ÕAÛ0y[ÿlIíÁ¯âú¤^øP;P¤²S$Gæøä÷àèÑ÷ççÍOê¨ÔþHÄYylâ¸xªÖKpÍãpo?.;×@G¥!exÖ¥KæÄªzuÃþVÊÈ¥ruâ!àµIåF¹üWØ	óÍô%>Æ§Ò	o¼@ñ=}¬u=MãbÄûÏÞx´¶ÏØ3?§ÁFot eæ»&^Z?³ìÙÁÉdóã[Rbu5¥áK	v~áë{» <0è<]>ïmÕ[bðöL¸¡ùÞÖUËKG4'PñCLë>'Bx,ñw².àîº|GmÛ:5|ánã|Ó ÒÁX=}Bòb­ÅÌÛï\`Ï$|#¨Ç¥ÏúÿºKDpÆ38SïbËmKéðø^ã8#s¨7KMÀ=MÉÜÇ\`´àg¡q¢X÷ytW6¤J^udÔ\`Ýir]Ê¬³±.÷8Óê¨%â»ÔÑGª1÷ì­ÞÐp¯wa=@^æ×$eÁ·åÇÅXÎÜÎ\`ê¡{-M3eò+x+Z¼²È=M¯f(óñw¿1MlÚHÙG1>]W?ÞN ë¶ñAÊøÌrÎ¿¦þrÚýÍÉð/K1S¶Bp"ÍxÂBÐ}Çûùô4øÚäK4­unQA®ÐÖ1X2UÜÝ.$ûVgNT=}kòì@gÆýÙ ¼Ñuêö[÷EìÌÍßÑÕ9£I·A_}pEðëÌW0»-îä¯¼×^ac~QÊsÑÕ[ö,n]õ¿Kò¿/\\O=MïçZ¾¸öð¤¸}]^îQ·Ál·=@Q&f§_dºR½þáW5½Â:7©òãYw4§\\KîÕ_"\\Àd1¢á©[±ÜkW}"	]±ÂDþõZUÔIÞwX$pð)ýÐ¯4d<ä®2Þ®$uÒoWKÙ,ØOþ!LÀºw7Xr=@òê4h§ÂhtÈQ#¾9ÉK­¨û.hw}$Á\`¯ªow»Øt)\`ïÀ.v=}>¾dÚeé)-»#öcUgµì¤ÀÛ4p¼ß²0yýºÐVß@×a?³YÒ!¡@ tcÑÖdW\`#Ë'?Í11µðúö¹	yiÛK)Q½vÁ©LG²N!Üw%5þþ>è¤_:þ¨/ò®ü­ÍÇ5éÄ9öyÚ!ÚöÞy@åFd¢ëÞ½?åªc%iAD¼~vA^·8YW-ÌûxR3\\ì=MËD®ÊMúC Sûàqón-mÊççÊ>æ¾<ÉÕ|_Å+sÖ}ÝÜ9BDß§êêî*/Ú¤)CÛ$ißµ$ù^ÄuÑ5+µÐµçÅX÷A_{vA8£ËLÉÇëºÿ«ßÅÑÍ$)ò@Þ;z'Þ2Ò¨.~¡2ÒÂ\\HÕNY4'VÇÄFÉæ*¤h±Ïèâm2þKÄùØmÔù	K÷©±Z~îµpîoyZ±x±¶/Âmð-Ä-Gë¯pF¿<®=@ì¼Ø\\oUXÂ>¤ê²	¡ew·èÞx]bÜ¿ï¯Í$W=M¢ ôO¿ríæÍHýLTå£Ï[6ã*$¼ü÷Oö5~z¾>4;ï±¼_«Ñ³gìp* ¬èÄFnoúÍj±ø­¦]Ñ&$i=J	÷ÇÈÝ¾ñÔ¦CUØÌÀ_\`2e+f7° å4q>? W®i<øbù'¨ï{'ó§È|ÆWNpx0Æg-×±¬W¤yèuN»VäRB}8%=J$g§ô¨ßg\\{iÀAö?ô£G/±ÄèæPß_Õµhê¸ðó)°´ÇZ¿dTeÂKY®¬sp@ï¼ïZÔà,PC@ZËþZ frZ°QøìÝ7}Í'¼ù~L!Xe´ºÁö×-éýM;ëOf¾}w1¹î¥X	Ã X¥Utfß7køI<KÇ£>zá¹¬N¨>¤øf4gGWp±òb=MRrÐ7¿ye]¬«û+#¯=J¾|+Ñ^lfÆ°Ýå-xÃBÆó¹+Q®Öë! A=@çBøAi­ÀöøCþcÕ¢0Ã¨ð$sê#=}Åª}ðRÒG Ø)õ{íÜ)z­FúbðÜFOPRÉs_Å¹½é²íîæÃ3<1=}mU5¿J#dZàä&<Å@G%¼ÖÞß9Grîýúxs[hÓ[]*=@¥[ÚÍ±ØÇónÅGñ¨åà^=MISî¥ö±á>ÂXæ¸«à4¦ë]ó4¯X3Ùp*­ÓÓ6ýo}âþ¬9\\K[äS¡-=JõXB»O¶0ÐûPGÂ~\`Råü°7´QHö+ÁÒ3MBx]û¯ÃÃ¦Ã	7ý·Ypz;òÜ6Mg$ÏÔc/×®ÚZ$º7sn¶Ô¿v¿2CÒÝ­½§¾ïï°Q3ÙCã ótèZnD¼ß½²W&Ôîóüüõ°ëÍqÄÇ-ó¢ÿå ëEù±pþÿæaÍà,1¶iéûX7¤ªÆ{Ø=}\`¨ôÔeÓàÂ|Zi­ÇÔÃr?W»§Htæ£^d¡Ò»b°èéÙ´²õ¥üèMïÏË\\Øxjª°*þÇÆäeµè¢úß[ºNNèZ#êÐÆïåÆï[ºÂGÌÝ4UªPþ£t¼¥,ÞO~k¥NAXÝ3÷Úås	ß5¸ò¯JÐcN¼ÈÇ#ÂÕìY /Ãá¸å=J÷ÉLýõ÷Î/	cáoÏ¡<úµ¬^k¡ÊÈ~Ésnõ®NÏu¨NÆ	H÷à7Óñép9qk©FñÆ¹Aý¢Eòÿ¤Fèb§&ÜGÉäÌÿZÉ§«wûò;Ýåbwq&=MK{ºº¦Â¢hjzlwí=}»£Øº\\'ò£³y3Gùñwãê"Å5ÀPû®±è?A'@©P=@®ºå~Wh¼OåtZ-Ñ#½Ç?'Õ^sFuÝ:;»]{Ø%ÐL T)XxeÕÏØÖ Ë9	«N»¼ísÃ'Î¦¥íi)Ýu¢w§Õ%§bX¨¤u(£Ø¬îV±¦©õË¹àô¹^æyÁ÷IøtÉ[± G-K=}ÿQÓgNByãô=@í!ßáíRh¡B£J·e×ººzX;¥=@ ¡Ùç&Ôß½Éñ_YgãÕ$mXÚ°í)Ð©Îæ§e#ÅéîÑ®=M	acþ0ýØPÎ¢ÃØ@·Õ÷ItÕ!qlåt»¥ádý¹ãØR9µF¡	àIïÁ¦ß(éÝoAÂ(m"ù%y"¦«Ó:U"®ï{¡r¶hWêÌ!ÔÄvÿ!Ï%ü4§=}I=@ÿüÍm*=}²XJÝÅw°'OõñÊb2pÈ¥!#éï´9Ôeìì%Tic½Cwú¦$	<e­ºQI(Khu'uí!âãÙ0Ê\`Ó=}w½½QZÓänW=MºGàÛßÜ¡Võ¬Ù|ô;=M¹ç8 ÞØu:ðÆÈ=@\`¸÷*h @H$6¼ÍÈ=}Ü5èoqDl=@¶ ¡Ù$ñp>ð|£ÿø¹a&SGÉï±2G©|¶á)àG)Må¨£ýâ å©&%#H¤®3Ü&=@·§ÄUÝÉ£	ðÜ§­('hË!»Øu(úqwYéIT&KJ	¬ÅOÔ·3ÖI>g=J_O&xüÄ ¦ëWûgço8Ì´9ûá[+OÞíAú-VÕRì§ëó;òRµhèæãÁP eû¢ùÕ=M!ô¦¸¦Ïfx3áYbaêÛÓ\`ØDýu¶}_¦ÆY¢tq²íiÐv¯{º0?õçuG¢HÛFUS×vpêúRº¯¿{¸¢Â»ÂÇóÊá¹5öAàÔåýË­¹A?I:óf þ(}èÓ#f=JiïÓ%'oÉÌÉÑ§*Å¼iÔ}$]80rf÷"òÐ¹÷lÀQg¤&Ô¯-1QÐt=J\`=}^Ý4Õ©{ù5¾¸Þ#X²io¾b§åÈoUàQüSmí£»FíôE»úº=}¦#ä[jôïÃ¤(qH2Þ½-Ù¶ãæ (1éøÙÇ ¨îãðØþ!,[hW^²{´]¸>ó Á¿¹5ÇÐßÆmóÝÂÑæw³×¤üÖ{w§êèÕg¦=M í÷-AÎÙMµûc É·û!ÌAOïÐh!ÎgíÞ»MGc¢©2:Êºhh°¢¿ò$ÍQx&8NÌV%a¤±#UÃÉ¾[?èÒêBRØZ'Áx}k¶£Ù¨ßd*ÿ[¹ôÔã.Ìnx?FÂ:5hbÆ!óË:!ãÄ@Ø.|V}ýåf² #Q-âû}Ëé!Ë*È}Áö£°E´újAoØ[Yn°nÖ&¸GÄ;.¸ÅI£¡¤~§\\Æzéd\\kÁ½ïNZ¶1eWAÏø\`?u#Ý_[Óoå³wQlë"aLUªl³<!ËÇ¨PÌH]Ï+år3MöóÈ¸=}^ÙÍY¥r|=JÃøMÜecÃìÁÇ¹Îyu_UF õ_¼sÝßMëiÝ>Ýî¦ÏÏÛ¦½¾O¾ú¤Óª=@Dqr?ûýt!43N.®Àãic>âêËö]ÐEY¨s¨zÅBØ[*Ô8åþ"l½íÌ_mØ*ý	ä%(ÄÎÚ£×÷»Ñ¿ùR´È5"eET&98(ðv.ÕGµ(Ã¹ÆÑ÷»®8µÛÆÝX¬Ò¯©ÇI×bñctXÉçG!_ÆHæjÂ¼ÊÕUïê }hÚ#­^¬k«Ì@D{à²æÜA}ôJýç_ UÝâ»ÁÅÁ¸hñìÅ´®oLÓ}ÔèSÐaeaâªº¥7ãêkÍ 3?ÏËßNè½ó«°	f=@Tß,N*­ÁöWì;øé""=Jf0ãã|þxYÕ× ½²OSå¼¯CáËâáÂ¦cÄ²ñ=@c[éäN</xcÅl]ü ¨ ëÃ´£Û¸=M¡ ª¬Âvf' æ³¬wAÇÝÀÉPmÖ\\(÷yUÅõÇ©M×5©Í!A©ÝéÐÿÄÀ[söÈÌÀ­x«ò'?Õ·4É'!&eüKËWÓµ·/:}çlXXÌð£µqAãÕë8ÿ¨ô£-Ý?¸*«Û+´MYÔØ³eqìW>5¥ÛµÄÀ7Áe|l	¦R)1ÖÂnwwOÉñU±KgeÝ?ßË¿YsNY¯ð÷Ë=MH^¥é´¶Ïá.Â&y\`ÕÞBocw1þöodÿÕ x >ÞÊ;£+aþzÜå.Ó¤¢¤ÎW+AÒjÖi)Ó&Lÿ.U±õ	|Ò6Å(óã6uÛqû6ÂzçÙ®Y.T¾nÏç2Çýgas	è=J³=}ýÆ1rÅ±ûdKÕü(ï<_Í:§ÂèÞÊXÅåRùÄJ¦åí:è âø÷~<ój=}kíWÚÐ8RM¥Ø}"G3§äÚ¯kØ\`<´þ¿ÈØï+7ÝßµB#Hg?§>äeÕÞKþðßcïhÄìFÁûÇ±¿cIa4ðà[uqQñ*D¶â¥Bµoè°5í§ÈµÑÅÍ@=}èØ¹R®>møl¼\\µXºÈgæâBèMQÖÌ7y¯ÿ0Ý'~E·©\`å±)Åóæ!ù/×K=@ì¸UK s4YèV©¬bªc¢Súe¯tK&l]ÏÊãìnÞÞï=@ovÞå[×ý½:ÒzÎÈ¯h?ë4§æk9b²ã/iÙøÔSQ03W¶7ünÅëV)TßoÚâÆ3¿âúæÂ«Dx÷âqÇñ-¡¿/)®b!ýÕfÝõ'á´âb)eØÞ{¾Ù²þâ¾ô4*t#¥oqì6³öqÕ)êz9#¥aª´PòÛ¼¯Õàuß®ÈdB·\`ùÿ8\`£¦=M¢½<»ønX¡»¼=@<jÑívÕä¾ÙÁ·TöÉêG~0O+$E	¦{cº¼mÌOr»=M¨)/~®ù<ZÀÅikÒ¨-²óm¯A8IYñ«uÁ¡E6XÜ³²ÈØÇZÅZOha§#¶ºI;5÷©!Ítæ!¡9Eh¾raV9á\`ÞÕAµÖÈ¢&Â/f_/â»Ûm»7=@²ß¡+É) ]±1¡qÓg!jÂ	ÍÈíµM¥÷	ÆAõÅâïêëd{èú÷ýªC\\³»Ú:¬­\`M±ÙA/fË\`rà­»EFçÂë[Çí]*YyÐ(s¶Cq£öõË¸Ò5ùNjZ©d!o;­Oë]ªúÑ_L¹I2ÆãäFêú3qÿ¡âÕÛ±i×mÅ=}°°£ãÁ!ÇTkå=JÂ{¢!¦,à\`8¬·ÐÀx?Ûhå@­fZ.»UVãê tÌä,ùvF7øÙ5¤(¾ÊëÊwy§é¥)ä9¢û4¤m_õ¦Úa®î%1÷?ÊGÖYØ[Ooªëe¼aøåa=M,ß[ä²½é¢MùÏØ£*¥\`|ÈÌ#Këbq¤uï©(WF"ëÄÌqáµy_ÀÁÙìøò^ö³¯ÎkGÒ,9MÕSì ýOfà&sx\`T÷Da¤Ç|*®óVõ×uG®{(^ð1ä¨ÌßFdP7s¿Åæ®àGcQaªó»¿*]ÁóîVªÅnÍ2è*t¶X!¶äsEä¼eÁ#ö$;&Ø¡öF"ÊH¯âªúíÐ~­ö4øNG¶'«é¨egV§[£Uoð5ñÁÏí¼ðìÂ+(î²~SÔ~¯æÍp_ùy~ÞµzÿCÿo<2dâÍ&Â5ªl]Á£kºpÎê·mx~Þ_T,¼	Õ¹?tP=JÿçwÁ¾ä"Ù~ÖÉXè¹gÓ>¾ôËu´V\\DAêÏz¥½«bx~\`Ó¸Ze<fNª/<úøMâÆ/<8Y&lv/¹Õßô°MÆQ¨y(.Üò=JHè|ö÷éÙæßñN×â¸	&¶ i¡ÐuEã¦©ààã©VâÖ$nÍÃUÆÅ÷IüsÅa5ÓÓ)ûåÚÕ,¿\`v<ºQ%´Wæ¾N?ýCa;kÍÎ8¦aáÚeð_þ¬¦×¿0fù/Hùÿq×?&çxä±!"åêÇ%Ç÷´z×îmH£Ég¸B¡y%¡ØÌ"H.wC©nh	"år¯#¹iCÞ2ÈÙ¡Ê=}¸Âñ=@·\`awWñ¸lÙwévë5[w!O'aøfjØÔô)ßÀ~ Ï-æX,Vj..®½AJ.zn@a¡ä­¼BL8N;Fþ0²=J2ö=JlÆ²4küüV4L¶C0?0ºbªÊL°+qõgèÙdÇÂZ©öyvåã%g!Ý¦¹Ä­ýªÍN³N¼Ü-õ#ë×@:iÕ/ûÒmWîª.WTºz±ø¶¥Ö8üÂ:°ã¦Ä¶µùYüÿ:Æ´]=MlbPÇ­u]ÛHúO«ø4Yñàb\\03X¦'î=}KîØ[^!=@´s_yæìàÌo¸Ø¿«C½lÕW8iÌcHÔ³ee=Mæoç=MÃ²-Î¡O5ïÑ~ó0¹öÒ°ò¦Lý¹lämÔ_(7/EOÛÐ=Mª»V¨Eí®vÎµ©¿=}&0rÆBÓØ/w¸Û,-åáÝWÂ"¶*Á3µDÉ|+ÀÍÆô}Òþ6TêvAËÀ÷¬{-°¾o/Ø7ñ¡ ^ñÊí6ùGa¡W²®óäî"_D¸Íµ	ïªÔrÜd4LU¿+k»ØùêÕï*S¡ý%7ãþ¨ºèD®)Pù»¡¨SF"á¾îÄó=@*â-¡Øà)¤1Ñ øZyñ¼&¤z[E÷j	$£|µ½@+?c¯Q_rü=}bK½Ç?âjÖÏ§üXO¸æÏx!tÇ1Hê2d@>X²*7âÌ4Ë¸P!×=}dß­iÜz5ûújA¯háTê	,ÞÅ7°~ sþ:vÞ»:tMo?gCÁ×uÇÌjÙKôýDLuÊ=@Pÿ=@[ØäE(½?l»Ë7Rtåw-D¯wJËdïÁüªJ:rÇùÛ«Lê!C+ã=MÀÜíè.üG½ÙÛJ~Nå^xÅzÞ=}c#w¡ÌnùD>÷ÊP÷ö¯ïøÃ=@æÌ\`Ùªy2Ìüñò¯hó=}=@r-JJe±¡@ØÛöÆöó?@f«Í{Ç£ynx¾¾j¨@ô6âÄüm~©ó»ËÉê°=}ÓÞ.¨Çâw¿ø*w=@¥+h~À­$4ÖtÇ;ÕoúÏ¬/¾d"{Òo§I=MEh|µmÐ$:ÏÀS\\·ÛäÉ-ä$±Å§nGzýëu½Pö|õ}ÂóPæ|õ=}RJÅù¯{DX]=MÍÂ³ýOÍ[èXt2a¨ÜHl°d:ÀeÓÆs­xi«ûõ³;$ÜçÞçv/;¡æzdk(Z¤>yG3¬V3íÑ¸6#ge¤ÂsÐ«àßÓ|XÞo¶=J¤¼7.óIæAÑðìô¾ÑÊîîN|´¸ÿ+¥ÜÁÛr4îu¿Z=JròN=MÞ¿¯sàQZäô.ð,ï6ªóÅ¶Bò×C<DhvÛ> õDUQ|\`ãÀ¯^ýþ¶GªÌæpÓÀÍ\`.¯»ì#£"µ#ø3eé7Õd9}ó7såÌÀO=@³ev£MB\`"ñH]2\\æ°6é¿;Ç¼!vEÇ3AÇeì2rÚ'Ô$jÍ1ò+êÌÈVmÅn÷oÌÆ¡ú\\z]ëÌy¶¡QòÜìWÚBÍà3áÝ~Dß3ýP@fxr>E×ØLÔV3ØÃèBçóôý=@o].îxjqgaàâÜ·r/* güâ¶ðùú¨ìÚoáÚnCáê°³JO «)v[òHÙ÷é¾Ý­EuÏ·3¸õ>dPÛjbùÃäEh]1Øß=J=}/í+¬Nq×Bu[YW»ÏÎ/LkÞj­ÇÙ<iMsp)â¿!DÙ»>|íËs­í§ÒØ{ñúSpÁ´ÀºNõ®Ô½nß?ÿYc5#ZP5[\`÷ONt??ET]»ÖsÄºëÄùt7wdoS7o×F ÙÎ°Å¦©ÚDÙì®ÿ%pÐ¤è]ÓÙìàÑèFl?¼èT²7ÍT-+¶]K6·=M#.¾õø74ÓEìÃju¤£Pçµ:ñ²ð#u¼¢ÖÊÿ©JFOVà%ÔýÔÒÍÜa2qUè÷Pÿ^çÝ~(b÷´È²%ÍãnrMÝnC=M>¯gpGz0ñ¦Äs?Þ%èï¦Ð2<Ûwq-)!öFð]©zñ@&§Çb84ïýAxZtgëÐwÿ\`{wé%÷FÐÇGw¿ÇÃxü!ËRâ£»3=}·=@hÆ-&5,6ÒI¬Ã1@½ çP°»=Mwf·äRH4G$l^8±SvÅsOÞ"Ü"²Ãö÷ÂùU¬ZVÝÞ¶(»¬·2ZàXp>ÈâðYN­²Ç¤OYÅÒÅ£=}ðëKZ8-=}Ùp°3	$I|}Z^ý+(SÄûË0\\D-ÅÒ´v\`ÃdB=}sqº±5:a/ib·vY%FÄäT«ºÇtpê ªÐÝ6ÿMf=}{Îçÿÿñ¥X'ð5±9Å°Ä°7víàö^ä¿sâ!¼ÄrÌ¸"=@ó~ëP:¯ÈrÓyqõF>j»5úùWàÅC[Jè\\kç×èÓæéKM£Ë-fìÓ7tðÐf^-à\`õ©-ÖcmÉïÝ^Ró·ë¡\`´ÈwZ·ãF\`¼1DÔÝWÂì#ðÅ£4M¯ë14à9\`ÁdånpªyÈ][Êai³í4}ÞÑi¢PY¤@bXªù#¯|h{5xKzò	^ùàï#Nñ=JTIðîõá#!\`@9¸(åó%§=}ßø ~ò6v³ÅÒö°tÈ%·Î\`t$_ÃP$Ñ÷Kù(È-MI:\\rToâ0qò7Cr Q5r=MÖÑ"JìÅÑ»Îwk¨ÎÛÁ±p¦CVÅÅjÕÇçÓêæk÷RÓ£àÄ0v4h´r/p¥ófvùÏ¿®ßøn*/;ízGG0.öã¹vSÂ^lçñÃæÇ	*{dÃ£~ú¶Þ§	?±Eò²ªteÂ¯ÄoàÔ;bMôM^hñ®	q5Âs|¤Ê£fyí5ã/å;*ð¬nuxu*N3tI)Õùó£ïÕJnfèà4ÂBv'1uµLKTY=J\\L¸<Ü\`ö¼¦;£îvæI7üÛï®¨nqV&Y5Y´ÁæÈ.¤A_û=@ÊXuëQvv K»ÜIF6±ñdd|ÝØ.­¸_xÈ9X Ñ¼MÅïø5²ê=MÓ¨#ÒÞ2&t8Ñ:ìÖPlþÆ=}Ö«<þ§ÜG3ÕÕ·Ú m{äHý²(Õa´vã=}¯Ö+%ûI»$µ#.WÂk\\a±Ç~QùÌHÂ;ËñáÐT,ÆÔ=MdOhtÐ)ë4ÂëdÙBÈñA;(O	ë:üfÂù\\ãJÜ£ÆQj#=M±Òº¢+tK2ÂD¸È:T]Ü×nÏj	@äü¹ þ m=}ZÉútgÞ41OÎ$>®y4(îËR=Mb3½NÐ$êSÝüaØ=MVîép~Ô)Fm;H]_öUJãS}±Öbúo=M°¹ò­p)DïDýråR0tu±¸]v¶¤ÏWeFFøß¢À?ðÁ¤;SÐûÛ½'=JÔ¬Ð}FÆÀöAÕ´w+Ö÷øù¶;ÿjYÁëÐÒï"³ÂÌïn=}o»±Çk|{×së\`T²ûWs=}bûÐpÉÂrSÝ|.¯¶ÄQ¯6¸ÇòÎ,¸JT)®/Ôýunÿ|÷®~e)¡17^AäMÓND2TeSLOv2É0§7I4igË4R¹9,E°aÆ¢=JJAè!¥qmÚE ³Ò >ÖÆ0qWÔôÖ/Í°O·.zøøÆ¹Kö/}Ðæõ¼ÍÌLR×¥(eî2¤#V}Æfº¾\`C!3gî0}ÊzµBì[èå¡«^Å2råhÿ°×^ÀtÊÝGÌ²Ø=@ôTüþ5à<]0§E£p^$K}áç¯û£¢Óv_Ji!"åFÓzÃ"Y#ÄMâaF";ÀIòo°¹°×QäÒyó:ø;:Ò¿{ãºûÃo>g=Mdþ¢"XLæÀ}\`¼å¶þÐe/J¡¤íØ×¼¬p­._¼ÄÐ;×£^¦öáMÞqË0	ÌÃ	øwõ¶°i{Eobâó0Ê5Eª¼ 9QlåàÃóøb^/&r\\¾¼nÓ5Ð¢W¥ë¶=M']ke÷Q#å÷KîÅKûá{Ï^ßWÌK]JÒ±¦Ä@Ë¡ÜSùôAê8ó­ÅÀ0Ë² ©ÉÃ2 ÒZþV´vµý´Y£_4p.¸Z¹åÝQQþ'ÿÆÖD³ù«eRS"»â0¹[¼Tzdj_G	HfbÇdZdï©çºC¤ë.PFóv=@CSãê=JYCb:ÛÃéh|©$å]íà tô@=},tQ	o_|$å¢ÄFôkH^¤s"ÍØ=Jþý_É²Ô¯v¤¥ñZÓv|»\\,'YU®¿\\t[OjLÙçíÔ×e6KèY\`Ö¬à4¿;±ß:ÉAEÅ®cYK§¡iã{K¨Þ×X\\Y:óò=@£íåÀ~3 MRÌíÛpËkÂ·¿a=@x@UvÎÕÀ:f5Õò#T¨­ÿ\`=MÐN¯4ì¦Å¢iCG¨mÜlce0´.¨t»Q´Neê¾öëul»dï×Lv?e"Ü¬=Mt´bVRhfnZ¸bóÒ±\\fÙå	V!M}W²,PÆ5-EMÅ!pj÷Ø_Nâ¸>½e4´>©íLråÈ«ÝWpoMÐËF	°.ßcåÝÎÅ 5D=}ÎaîYj8´õuê ¸ÑÈë¸ä^ü9JP§];>Á¼«ÞGûbñ-Ë\\*c"Wµ%wJ]åy*Õ¢OÓÀ_-ÏÆ]Õ/3ºyç{/M"n®OµOüÌül]fïeÂª]f:Z3.²¤?Á¬Üâ°øvu¶GÔCãÛ^¸?]6Äñ¯A£Yn=M:¦³W@¨¿@ÆjÀ=MÜ?Ë@. WÖ0wàµïÄ³#z<ät¦È³c¸kNÁÇ÷=@]\\Bxþÿ¢Â¦O>ÄK,GÝ+Ü§=M>º+dºô öHÛOL~bÈ³ò^}¢W[Q®¦KÃuÈ\\\`DÑ=MæîDèR1nÊË×ø\`<ãÂúªöPÆÛ§M|Èö<ëQ9¢Çm%þ·WÿÃÌzÕàÿFªS÷4]»xì°{qóì=@CªSëVáñ¾R-Z§ìâÕ~ÈÍC\\ÑË#ÇÙõÂDCÈÔFòûïmº¹ý=Mu8¼Xqòûq\`z¸©¤fØiÂ*1}@å¨9WB:&/«ª}*MÁÂïø8vðüKÎ®#ÓçÜèp	±¾CII)p¡ú$ÃgàsRH¶n#ÿuU0{1.>pvl?­qËcá{ú#Á8Ðª#§?vÃÏ\`ß\\TR»«V³w ù4Û2%óòuû@b¥Ù2V°iõÁd.×oçÁh9ÿÏd³^pÞ5Mo¿oànFßNy³æ¥ãz©¤ö1k@Þ"çÿÿ'Y· Ñn¦WÆ¡1G\`eKla>ðé¸Ì\\$¨!f·N*e×ýc#:¶SX{vaÿK[.a½=Jh4±PÞÔsB^@fSÖ×"å;qÕu=MR2©íÇs&-ö^=@m=@ú¬é<éÒ3ø¡=MS£¬·wÂÙ²¢ö¬IuûQo@¼\\³½3Jæ=J0Ä*=J¾¶÷1!OÍeÔl-è´	95Éèv|l=@úÃ1?²M1ïµ=J}Æ¹ÂCyN|XuÞn$£V1!T£LßeRE^oûãTQG!$ÀQ=}«¥bïôÖ5 +9BÎ¢EÈ÷àúha××£Ê³²é\\i++í¶¸=@n]ä$7$ðfßq´¦â)RÌ:s¨øª)·>)¿T+!ó9û´\\§c/ÍïL±8¸påAxHÄétç÷ÝU¡©W,Poãcp¾d«yosV¼£6¸þ¹h_>«î7­¨u3¨jô--oÚZpb¦nuSñaVì÷³f®cúþwM%ì_ÿ¦=}Pw"îv·ú#¢ý(ÇëÑEée´)ÅO8¹MÉµ£¦I#Õ@DÑc°2îÌÃ¡T°º~6?ÚT=@ÆÛóuÇ+½j½wê0¦;=J5e¯&Ô,Àôc=J.J&ÜñÊ=@áÿ¯§§UP+|=@çz!¤\`ÏG©fo+áyzÆ!]AEØyÚÛ®G?ZÑ2{ÕÒ¢¨=J(ÓÀÉùAÛëdeéÌÚìd\`\\+­&Åt)ÀYÁÞ»=MØ}×¶×OY1¾òûÞâß¯¼ÝÌÉ¡$rçÙXiÅQÄ Å©^«\`erÃaª<0¸n·¤ÑÁ ßâ=@~V8ZÍ(7Ó.7B~êPSgýùQ'1 ñ=}Aq×ãKôá=Jê5¥mãfød,]U­+lYzkÐµ¶7#y®[ZÅ;HN	 òÍÞCô¯eh¥sÖÒYF{¯ÙËã¸°J7E:¬yT¶=JD¼½Ðoå¿LatCòhÊ(w¡-¬;îJÞ>,¥îÈ×ÍcáZ[\\+ïÄÄ½²Dá@úX*M q³ ÝfX§üÞ§¢rWÞ9noOLS5äyfç}=@uf/­gäm«Çuõr$­ Díh²I=JäTE^þFõÓ°Õ7O¨=Jc%ñ+ÀB·ÎÔZ^yáïÊ ]âîißÀ=@n9¬gÓWü$ÆW×Ðë	wÇAÜ!8Bï=@ßù?ç>±®Èý}¤8Ã¥Øéã|c_¾ãÙsÑõPi;u	ÊãÁq=@ÛG@¹CXZLîg ðnÛúÂõ-?{léVº~ó±5î¨k¹´/ë00y*5äÞü¸y½ghzÃFv	Ê¿ÛÍ9­a¤)2XÂÒ@VGý½ÞEoÚõ¡àTlÝrï2«ü§ôGYÝAöÛ¡WyÅæ5èï©©âd©Ìµm÷¡\`án+Tpò9¹àíO|.Ô·Uº8ÊG=}dqp­&lIÎJ*µöE¶#ø,FëóPGÏÔRGþ«\`ÜÂÏ¤"îøF§´x;fQ;ÍáÞÖ4Ô~=}¸[¨ÕìÙ!8ì÷EöWñtzXÛßÖ<iÌbùí\\t6ºíA×8 Ù^9W5ÒÝ¦´72É@=M5$«Tú	eÁáDWéã<¬¾â,u	ô±þ°áî=@¿¯§.mTñóèw$¼.©+Kå¾^¢ÓóÑæØ=JÊ:=MêM"²sì¤VÀzá\`Í7JÒoDãú¼ ;ëMÓú²¹Úòh´Å¤=M]Ïúx·"(#hd%¹ôÃ¢qÙÕ©Þ/h¶òHÿü,7ÊÙQØÁ3ºý>1M±r÷/1äî3Ø¥ÍÓxBFZäÎ¢\`Ïðg,=J*ÊºæAö{=MÖs{cêKf\`ò=Múôã÷69ÏfUa÷öâlÊÇ7âðh5¹]áÄÒªÓ<RL¡"éß¾Z: ã"Oõ½ãeö?¢fóÖ7~Ó¢ß§1î~%üêÈRöÃ#f#ÛèÐ<ìVýfè,Õ=J¡¯xfWXbz}ÀT&Ïä3Ò<)'øñQaàF8'ìfÙøAì0>.vE¢ì9©@làöeÀxU4@ä=@ÍýÝ·WÏ%Ô3¯ÆN\`?äÃ´+Rl=@iH1NÙ!'#Ï±|²ëKÏ>ê^ó¦dÉa°´4¦µmh>RÅíNÅ^­Ä;T°N¶WøL²¿¦f cÀôM¼@|õ=@÷/ÿ7¥'9W¿æ3=M²DzYX"?"ÍâÛ0/=JÚ^8æZþ©¹EÂK/*4üñ¸¦¢øø@1ß½þ°îÃ03ïsQÌeÉO¯°]m´£×<ÜýI>5oøz+þ\\JV®=MÔm¤/=} Ô\`Ý£è'/æ .L éo¡¥ùzëk=J	¡Í[ûìYßy%¸3	Â¬º<ýjðä¢\\6åzGYÁ6ïUc3ÞJßÚ.¦æz¾×=JZ$c{:~:2güò¿xºí¦p¢H\\A=}®Mã\\ôL¤¸ún+0S=}Ru¢{ds5=@ì=}GÅ8jgæ¥åÆ=M¹]XUV2MR;®£¹JvõÇÏÞÖJK½D(HÊÃ'ÏôÖÜÅÙÖT©E~XgíyÿÚàr0CZù7	È*üt³#þÙ+þÎ&N<ßd0Q!ºb¿¯¬Ê\`k)p5¿¼?¼y3½WèØÆÏTñò#á£ @à±¨À®=}EìílêØX6\`ÔõïäQ6Ð¹7qq§­óá8$7d¯}ÚZ$¬õÏNÀ%bÉD&=@g&v°§=M³PçTz;'z±èÔVê#1(Á×ôKÖ±¾AWÍëÌ|gN¿ò¿éÃùaTèá1à*ûèVª\\k¯æ/ÿY^¢_,%;à¿´­ ëÌ6^äÐñõ:ðKýBz²¥ÂF¿Øp=MkqBgJíXðÒ[ôè@"ãÆôs¢ÙìàØ6ÐýÔß5ãòµóAqÖuîf²vÓ¿¶]1æÛ¥Æ¸RéÌZBÂPö×\`@óúÄjÛé÷mÊ)÷#tymP¸âñhaRd}Ý t²	¯'ûH0@òZ×'$DCEÔdO=MrFG|R[ «äóík6me¿GÈyõN¨Á/ôÞ åg_P\`¨Ì~®È>N¦<Ê8îàãd.(»Qó¬µ<R[¤'1+ªÙ_¡ÒJ=M×¯®Ê5\\ñF^¬ºßó¯Öxe'äªÓCÛMt¬=@pwaEØØ\`¨O[â¸iR{óá¬»o)Ã8è+gÐõñqÇò®	c)KÉaÎcFØFD=@ÉÏôhLÑP3vn¶UN>=@iW:bGVÙabpÆß\`Ö9"PÔØPûãÆzç¡08û=J3á×A]V¡HU!$Ê/sÍ¶Jºê¡dénzwabHLXfòÀ×Òmµµ4¬¡ßónÜÐÇo'xgÕÆNxì53p·Þ|4Ã°iR¾!áÓFu=}r²F|÷V[V=JmÍì3GCèÿSz¶ îL=@\\hØÍ¦4õâë«sÚ&U	Þ¤+2:¹íÆK¯Å*LÊW	à¨\\­wØæ®æ»IQc¥Lô°\\8zÂc­ìpªìN+V°?¤¥E{À¨Â	Re­	Ò²s³¯	8¥Õ2qlý&FÅ·ËÈÄ8 z]:àG;hY®§ÛVlÕìýsÇV¹Ñ|Käüø¾ivE%µ5ÆPÿëY¦Ñ¾sé÷qióEQqË3[ý¬°K2Ù=Jlz<Ã@0ÛË"jâ¦4s¬ýá{Òôe1^#w¤Ê8ð:¹Óû{hT%Óº^ÞÑ;í´L®¯úÏt½M¨¼¹Ê¾ùLÛ¬<ÚA½ÅÇÏóU_m»?=M/ÐÕÄyÝ­mE×÷mâXi|îyvvðÜ":.&XÊÛ-r¹È!qÅýq25hëÀQJ§<îI­ÇÎÐVçâzÃëKøâ¦WT×®!Ùü§®ºïæhÄÇÎW ã§â¬Óþ+¹­ÊhEFCæ=}-KâªC4¾Ð«¬¼çÝàËÔ°?ÉàËDYë\\q0$.­·®]ðùjeDWÕÏå×=JÂ·^\\0d0a=@Ê×Rë=MÑ$úÆâ)ßnF=Mêìàôëóð¨b'6lì:ò&bþÛFâ,Ìbz½Qµby:í^=MðÄFÒÐ+H*z­=}=M|^xïóïÆ~DÛöZo¤ÒWsÊqnA¼3}RµãÊð8ë÷î3]£gèÓÙ¥[´<l|-3,w{2KâÊ3±Þvë¬Ù}ð5§pZ9~ãæäÇ¹G SaR¡KÀËý¯Vmõh®Îeçÿw.ã÷u5]ãÖSv Þ»V9ð»;×«¡TDs2=}çç$7H=JÀporûÙ^wÜZ4ÓH{Lco´B5j!~Þf-áA÷tã»ç±<¨ß¼°inTu¹Ö=@O±*(ÖèvvE(Öè~û&%º-("§/©&hÝ·i¨©ÄØÑ#§=J=M#=M!Ñ¤ä	ñ]°i¨I3("§&"=M!9þ«¨):I!åç$\\S8ÛÒÍH=M~Õê¸6_DeæÓÅ¾pàÕÂ~Õ?Ç´ìáÑ4ã¢×Ýï´THï¦VÜ~AS=J"çÂ$Ê@Ûï$­=M=@ºxOcZç]hÃÅÃFösv5¡äüe{â]gç¼4Ð¡rÑ¡VqÑ¡Ö~³µýe]½Ð¡Ö ¼3Ï¡Ö¯Ç#\\[³¶óÎ!\\Äpß'^Ve{/A­jæózÕá£Ãcp£èo]5=J£9µ0%qËª£Ï/dÅq!¥}!ø²]²=@°ïkv\`	È>ø¨d¾FCK+¬Ð×Tk­æWp§Ô²*T ¦Ø´&óg-m.ñs­ì®}GèC%ñwq­Â=Mh-Kç«"Ja;C/áH÷ÐÊ°¾yyç÷Þl¥ ?$¹$²(Û)«½ÏÁX'ìÍËP÷éÖS'4ýfÈ=MùGnÍ÷<S±Jr¸º'5ÑdôaÂm¶c-¬yÄ°à¬rèìÕ´´Zþ«EÞ{lÞ*"Ol­+%ÌOFï®8j4g~.*²:¯%XK&´^ÁtÃ¶¿ø³à×->6;²{²,íí¬Êd¸ZU[PÚîwÜ(²#¯GPj;Ý°"%f á¡\\¯&×Ò«ZòF49Ñî1ï1g³ Ëø·µA!:I¦Ë¬áEet¬ï¥5=J¿moK=J\\{f.Ñ-J ¼£Ív»OQ¾Zdè¢ioo2³wáG{=@$ÚòäË´Â»Ø,ÜkÝøÊ@Ç÷lñÂm¬Àô3¥íÅR.S­Â¥²¡A´¬WÑgp*0mjuÔ?ÄFB±ziK1å¿)Ý£Gð8{õM=}³¾ÓCO }¨Q1^7¬'-ìÊg×âµÍ c;Ê]ºQ:×Ñô¼«oÙùi>²j,(/^mÚvPiþÄ±ûe×©i7µþµ³<!¢ÞÅÇ]u"ªËY@Í>ßåó4î¬Ë=M÷éÕ/ÉNODÍ¹lm^7tqÁ£)GðÓÄR¼KbRy>0-P]vM³!ÔEw/áx¯õ0Yávq®u?j<wÃ?êF?o×}W.ÍbãS?-"oÇ=M¦¯ÊîËÇ_ßæòÙ5½Ä°2Î´À\`x#xßs°wµ÷V³Ë@<=JP$Íº=@Bñº%ODÁ=M¾þÂµó°ð£±R'ÂXù·Ê=@Ý7wôÓRâ£õËãñWYkÂT49Ûy\`ÞÕ*³.$¹öâ/ÿ¤¢Ð%ñRE:D]9G'<xÝé ¦=Jï¡àâÚ/\\ü4Îêçà=}@-E,ðü_C=M_[6¶ñ7jF!Ý_KòÐPå\\¸(·À=MÙúºâåÄ}ÑÔõòÎûõßzúlsnÁÖjÓ7¾bÖr+Y>¸Üm\`°	Þ¨	¬uOuÄ¸â{88)Äs#®½¯xG~bììÙæ,CÙîvQëì!¬¸¼w\\é;õô^]-ÈÓÉÂ¢7Å{ÃìùPÌNvÆXë°¬:îÑ=@dÝwr¥äó³É°ì#Ñ/Ä6á÷ÈOC |*ÀdTjÕîLlÝìl7NÏË\\þ^ñ]õ^÷©vÐàdCD¿Ç=@=MVÌÇ7ÇÝ}Cú:yºt=}¦E¥è_=}Ws²fýpíê¾ÓÐÝ ­=Mô»P5ÄKÊ¤¼¶¬þs]\\¾ßÎê®ÆL{¼Pò§q=M¦¢JOHì»¥BGrV»§·èÓÀÍRå§ÃC0vãü|¾¼Ë¿òè¶GêehÆ$(®:éPBf4²°·Ã=M¢FdL¢Ô8µ\\a%Å¸äBÍ\`f[ÄäþÂÀÏÇåëg§?hÃVpÐöN[XýÌgÞïË·ØdøÂVlx&a©ÛÖÍî£FÓµIô¡ÜÛÊZl{hîà¼pEêLÕ@Au°E¿=Mº{âûÐ¤Rï	N»ÍBg9ÛÎÙÖBg=J\\=@¿ü0õ^_S«nÄå\`j&ñ4fpY£(ºéf=}-R(öK' Uâ§~êM+¦¬c-Ñ{FÐ-@Ãæ':´Í¨äX=MLàÁT]Ú|=M²¶BT¤yUx"õÆoK¾çhU¶Q¤^@=J¦øåv¸a(H¡ÊØýïÈÑGÇücGÙB^Ì­Ú­!C=JÐííèî×^9¶ã²á!lCÀ.UÄûZª52dºN3Æu¾O¤zþ.ð¬ilSµüA,çê¦|]ò6¥²>äu[¦8+ö² ÀQÒG<Qà*~¬B*×ÑÜÀ<]»Ñ70½ñ²»ËÐÏ¤w>¥_!®>ÃpÏ!>0é:àåÀkè¥Õ»UtÕ²PÒö?Ô0¬?ÇZ\\Ø=}>÷ë±öVI^ÿîFRw*ØMjä7*Z÷\`;¥=M£ñT×ÞÛ¶Äf|d¯u77íËìEÀÞ2½©mÒLãßp¾n×eû>¹ÇÔ]·ëiýDÍ´EM]÷yiÙy2k7»3X_®ÍªDÝ°rFÃ\`NnrÑg§BW=@DLK*Ù fÚ£²Y'ÖVøÎXÒÌnzÁÙuA78LlßÅb~qð¯Æ8TÅÅÃ.×ùÅÉ}¸[ïfà¦Õ¤NB ÐÖWðe.ÛÁ.Ð¿ip²¬·v:ºàTÿÝÇ&Å9Êý°ÎÖ\\|@A|Ê'Òmm³¾&ÿeÂJÃñÑÙ&.[â¾:]Á·yL¯-ÕÜWNÒ8Ãp¡ïÅè·ác¼®ÿÄUjP=}ù%Í@]<ÌèD¾ÿ{ërÜÿ¦ß;«h#ÍC¨$pÀÕPÜ÷Þràë¶1¤zaÉ« frxE¬Vh¬ï§;ÕjïÝ=@#emÔ©äìL[V ô:ì¨x]¾èFY?Äö5æHôÂ¤.ÒéÛ{#AÈr[.§¿)M	ÀáÀí½}ÒCZºÏdôäÑ0çUâ47	Æ×Ò«U~þÅf¶üi}=Jêam«îRCÛjµ¶;*áÍ1µS½ÔEã"\\AÍ\\ï®(Þ¢äßìT¡=@äÌ{1	Ûveðæ?ûòú	%¬Í4C4´@Åüã×.lò%Nò¤=M¯7Çum=J{ØösîÇQ%+Oac1¤¯æSìÝ-«X$=Mf@H§*$«#µÔçÇU9íE_¯RsÔWG¯sÕt¼ÓÙúY<»ë 2gNáõdËM¼­K~½ÍÅUv70ñµªõu=MzµdjÅµsØ¼=JõWy6ÊV¾[Àòó·RÛÄäFô¥=}=J²öBaº=J2>eßêC }6±9²!OÁ/E¼Êü2dUz²ìU¼ß±ràV!<ÓX¬m9ÂÁg¼¯l^¥m¯§3	¶^\\L-F÷}úyÚRGÐ\\Ó^\\7¯,þ6}µÒßo»>·¢ÿä¶màäEtáÐÜ±ÚHO²ÍúLæûf=}Ô½ðg{¼ôp5¹±Aÿca½Ý.7G=MË]6ÃS{<Ôz§_ 1x&a¸ÀÜvÖý¶ÕýÎFötAD]qÔÃ»N9Õô¯ªò½X=Ju~Æ»8ÇWLË@=}3¡\\=}²»èFßÖ·X%:/-êä@Êk¯¯«ûGÈ×§t}¥½üÒ ,­¢×ß9±Rç=@b=M÷H¬âC<ÑIÒó6êVsµU0e²=M·«JO¬s@QcÃCå/Ü2·SúÇ¹¦Þ±óqìªR,=}.ú0>ÊI£Ï-8Gþb{@³\\ÞµÖ9t$.µïöõ´Õ?\`\`]"Y¸£B<)oáÄ¡	¤÷q!ß_aX©þ ))(¡ßZ»RÊÿG!DvKTÚÆ\\Öú¨Ra §f¯¬*µ8vå5;wíaîW;½ÊE=MÛ#è#àÛ#z~Á¼q|ÒÚ9]mØkLu7ÅÜSDßï¸/í#x5újV´ñsþ4Í±±@ÆwqòdLÄ·Ú¥ÄêÏî0WA/î¸@©¼ôÂµI¯#°[Êµlù¹8.3­êð²k>ñ¼'ÅsS-ZêÞQ±ÓÆ=J2óWgU~ÑºtÉ ÕG¤VUóû>NÑ-Æ ·/ÔÛh²P|«öÐÏw\`ã0³¨?XäÂÁâBYAÝº$þ´ÚÇõåÂa+ C²5ÌÏn¶ÑóT·æ¡mÌdq:ÊÙ¢PÞ¤þI%ÐzG¤'rFÄºãgT¡E¾ßge£EólwBQ{SKcÖqüð²iÐ u1ÙÖËÂ#?æÊ¥>Þ³'+«ùÂÇçÍø/ãÿH¯|ax"{MZfKÒôæ"Ñ?¼HW:¤[õß$²;ØYhhòttP5ôPqðh×ûK1ºHdtýD[Ró¤oî,}ìP£]îÃ<ÔMQÅ7Ôùb¹ç®:×vûGÔÈç»Ç­×óFì8Ðý¬©gæ=@ ·?ÂK]á\`N7ùöä{çh½óñfaÒ_SÏ´ ýQ¶Vnì´PÇNÌK1+iõ°ð©Èªª¾rVíìÝzk^ÒÞ ±t÷ÂÃC½ò=}£Toöapq·s Úîa%³9óþÚ=}R·ÂJçÇ=}¶ÿÇÛhÊë÷dwViZÛZ¨ëx¦²að"³y1gÝ¾úk9[DZi-îAÖQ¶ixùÂÓ~i­·û Ê¢WëSFÓvBÝt"¾øE#@ßô4¯Ý¬/2IU°B¾X«³ÄnüqÛ¾"ÑÏ>·:ÐÝv¢õàv¢åf×?FÙÊ>ÐkÜ}¸Ùý»7^,Û}0°ùm[{Mbc!Æá[ìØÎn?ÖÛ<wP1ªÖ#ëEMù¨ ¾R¬#dGSÜ§\\%¨p×üè	Ä=}Óg_\`Íßx'm\`è¹ÿ°ISFáê^tåz×Z¶ÞàOYsÂþe¯ººr^cázôþÕßï=}©t¾uç/ýÁ=@Õç¸'KEÿ\\laÎT!$iØ®IßøÖÜsÕNJ¢öÔ¿7y&îSÎLP¥ïÐ10éßÈÄwþÇbó°óø,Ch¿Ø?U6s|-Y¸£þîCºqîC·µ±×\\µ!±y}Líëß"lUÐÐåôA¬GoRþ5¾Åjà+ZêÂhO7jZÆ\`*¹=}jD:=@4íOoG§2ô¬ª¨EÊS-X¬Â*[\\	Ú9âÿ â©È"Ü~;öæ§ßÃ£ßõõ\\õ']ùV×¼ÃÑZAÇß|¢B-mÇô' ¨ï"­M¶iE¶[(tÇs~Òmj¯ÐßdiDìCî!573Ót8aT¢O%¯0ZGwSGlÄ«dó:¶¤T¯Ò=}Ðk¡ïkÛR^´Xn§ë¯úiet:{ðRL3=J_³î=@g'¯p÷ÜõÅ]%þõ²³´ËJÐW»üÙ[¾ÒM´NHäÞûBÇ£íà]¿ÖRMTÜûBb©æ¨-ý»ðÇ¡Æ+Î]Ú£89=}¬ò\\¸oY#-»þ[~fbò0dS¹|ö®7WæVÏÖ8½Ëé,Íc¶¥7SÌ°¸þcKÆs'Àâ=}³ÿôÞ£=@vE&Ì·ÕeQ=@.Òh}µûn1Zó	¡\`Ñ3í¬	IN·¹P^ÀB3À*÷4½(]í÷>ýT£8%§½þ©¥|áÜoJ½\`ov¼S·üïZ·SGx\\ýsUJ©×k¾mözS\\þrñ¬6Swðxb2bGoegXKKgØg\\¯D¿ØÀv¢=@;*óìÀÑ÷ÁÖ¾Q{ÂPw¡ÊòôbÇ,5ØLc2?\\6.0,7¢Ïí£ _¨E·MBÏÀ5×Îð¿¥àl3åÝ8Q0¾:F÷×±Ï#J ëbÂø¿ïÕ¸áäe7QL/¢RÝÁ]YSçºôEñT~å4#P8i!9=M(^@@aÊç:-wÁ[6RGô8Ü70X.ÁÕÜLNÜÁUÞßáü2þöf×«_1¸p/s[uÒÞ,¦ªk=@ÓjÕ\` /Ö*ÒcV|»ÑÊ¿E¹À'PÞ0ö[ÇSÍÐ8.qlÃöCþ4ÝâZ\`+¼ÚÀúíº~ÅÉý:v:óKÏõ³h(M4Ü.6wÒ,´÷ÿ=J´(&î£!ZyAßáoÃ÷ûX\`ÇhÊÂðaøz¿éÌÄIÆ<lcóYöÈ'ºDÆ=}Âfÿ[GæhroØÆIwóêÑÒKéÿ\`T¼vf¾=@×WÓ¶Ë7¦ûH¦	Æ"i³µw¢ß;)x&J8ú9îïtÕLÒøø´þ@7ÎOÈý£éÿ=@~Óë1®çÔhÇMí¤¤ÿ	Æ;K{Qÿ¤=}§ä/Ýºyä?î"=@ï=}Çº$¢WâYâëË4@CñVîRØÑ¼õ:©Zçøhy	\`iâÜ"÷~ýð¿ç!¥·½n0^Ò5º-ÌPrE:Tô¹Cw)¸p³QÖ{u¦µãÛØ½aÇ}¢´ëä¶ha.¿RÄtÏ¸:uÓ½Di¹Ñþ\`,SL=}úªJè@:,]g=M@yÞKËÚÓRvJ¥î@G+Ö¿;^ØÄ^»í~ðÎ7}¤=MÀý&ÀÎdÐ"¯ïé÷W>ß /ë¶3jÔ¯@Ó'ÚLB°þôwvô·!ÇëåpðLÕ½¢ñ@"ü¼}]lÄú9CPô]~Úg_ä\`Q Zn¶ÍêÜúM~?·-:htà×<\`; ¶ÞpÖ¸ÔLµÿÆHþ¤Q6yS=M¿,aVöÛ:î°4=}Gßâ.@÷¤t=@YG§&h3ßÞÂuG[KmÚÕì´Ù»ÿ0=};]GÃò6­B~Ñ×ÈÐg$d?¯n&	Ñ@Mu=}½ô9koµàÍ½z'@aq?FG?iÇB?Anûû®Ö¸h|±33ãD³AÁ=J4ÈÁä®µA{ñ5es\`ù¦\`Dh¦^È»Ç¦.«!#	&ííu9ñ$YéîmáU0óö ;U:Ùºí_Ëß&âaCnó!5ùÇÑg\`¸^½.Oóü§ÏèÒùcñÂªp]bÚ¾tÝáðá¸Æ]²ß8E[fÀ]MGÍÛ»n¯ó=JÎÛ$ÀÔï±ÝÌ¼[cÈöãÿ<9xYuDêÃ}ñzðñVÛã5YhâPò»taba¶&2(}yPaN?ÌÔà5¬´´EQ	H¹dòÎ] Ûgþ&íÀ¬$Î8n½uZuâÊÉâJólô@Wxõk¥º¡¿c\`åéþNÈæÑ§v¥«T!^zÎº!Dº_«Oa¨.úßÛù*¤ö6µ10õÑì8¸m@Û»­âÒk!xæyfcXañ3·Ë§SÕÑd«Õ[2_4È±2aöÎz¼üQU.ß­È¼§ïÚ ªCÛØt!µR¶´ªH7>r¾ßË|ßë*J±Â8Õé	Ýò8Bæaùözk9N_=Mæuýöð¬+iî©Â­Y5{Õ6´J8BÔë^Ü\\àåv]þÀ©µdò¶ØL	6=}õ×î5 nßâø@ck|À>ô¶Ò¿C	Ç.êiÔÙæ=Jü£ÐWÿèÜ[ÐÐ=JÍ«jO¸ùû¨ÂÛÒO¸Ôctý.A«Å=MÛç[l+Å:=Müê¢ê%_åô7Õ°lïyð·²mDÐ¸Â=}#=@B^é\\×ÃF¼Ù¯º£VtÓ{b²ò^#Ô_úblPO¬a0¾à¤ÛqrV¶ãûLËÖ+ilse@rZb~Dvs¸æd¶ . ôÿ6ëÚÁÐ¢=}Ë\`N_Ö^=@EÇ§ ³¤ÒíHÓç4|pPàP.DVÐkêó×t¥g->rðR=M&ÞßW<Vrz6I¾¬=J÷ú,jñI´\\[ÞÍÝµÆïdìLa¡JV½íú¸ÃË(<¼U¾Ò«@2{k£Ú*¬¯V½ËÆ\\{r{+×½©ñ¾Ùõ­­¤³o0=@»Ù¦B0).*¢Dê$olµ?é¨»ó¿¼^té&É£Ò:þHIì±z]åM'*2/ÊiF1«¾3W«ýöFâãwwÕVeUÚkk1È­Lw¼×yõ±5Í+wíå-¾=}ë=MYcï[W²Ï>QrøÂÃhvW^\\¬nÚeeûÞÜÔ<onËXl&6KûµÆt.~°¼}ÃWüáÛ¶*,+íg0l¥ÔCFb0°\\ãä­×cc_ñ*«åå;\\¢Î¿FÙZ6øYÿrrÉÀî(=M:P"£4®-¨Û}hÉbÅoÌa/ÌIéj2Þºd=J1µ°Hê+,8÷1@Hñ9q'Á*=JYjZ©z>QJTdXAßAwã5Ö³»þdèvÇËëcF­;øý}¼¼Án×"ò¤Nß=Jt"7î+®+lÖô³Oê£[¦=@àÊêäQ»~ð¦82\`@uî¢k/S=J¬hèl\\¶Ó¢ÙÙç3¥Ô|s²ðØ ¤5ô¾þÒ©ó1#5©ÀYgVY´Í=M£WÈLUz=J(Mc·0cZ&N2­Ö-à9¶%Ò2ñ Kh³K\`-XN£ç)=@o½ W¹2>_S{øÆõWHãæ×»#-Ý¬qÎ¶QTD9ÊÉ®¥!¥&âÌ¨NHõ@22£"­VLöÚ1IÚ£ñJÜZÊlÂ2·ÏîÆBI[ÑßÖ;ÝÒu¿ÓW Çêr^Éaäê.=Mãªt]ÚË57fÏÿ0>Ñu÷¦®@º0Sû:#í©ÃJOÔ³çLmÛó;átäïQñº{µ¿úÛr"c²2;¹fhtúQÇð.øPhyàKì.AGïNÀ­5ÂÊsm8¡6×Ú#Çù[¾>&bë}WÂ8ùOs­Ò»ê6¾pa4 ¶¶¸­kliñIÂ;¾SÑ-öx¾ÅÞVC¢ªÐÐãð{¥wÀ;Oîätë³:YÝ©ÑY¡÷>ÜËæFëºÆèU¦f°-TuHìJÍ±Ä8Ãº\`ívÍ3ÈàÌaHò	ÁF²ÙL-3åP65xãâÖ4	ø·ÒÿWheñ¾éÜ>\`¯Ý=Mµ©VþpêîáP*ìÙ:°Ñï$Ûór´ ¤rÊ+ÌÒê©Óà~Lñ>Ð°¤»ß¡}aè\\ý/]¶a-\`ÌWÅct9¹rP¨ë0!9FV¨Ñ¦B0îm¸ëTZ½WÇ¤+fÌ­©#- Àjý:b¿¾v~©gÖ9/RØî´ðÏ÷í7°Dë\`íLD°rã"µmdÖÒâÃ5«U1#iò mÌçB>h(Äãñj¹Î®öÝ3ñ®hhqÆ|õ¦9'ºõ÷é$°ôYÿütg(5=J&A-tvy(ùµÈ"§Sè(áç³ñs&ÔeÉgu³ÑræíêµÀ¢ÄîíEà"r(í·©àQù½â#ôu)³úÿÒÖ;D: Ä^H5÷S/GüéZ&¿ø¯®Ãî\`¾¬Kç=Ja¨=}I¯WßËl*ë¡ÜÃ+J=@ÜÏvU¡ëÓ=MYÂBæ#ébt?ßVÝÇÜøïYßØô¢|w®*æ¿,çfJ!ÞXRN>¤J%0ÔÇÊ\`æXÚ7sÎÏêÄÑh\`MofºÏÕ\`¿ÞhôxRS2âoð¡'ZxTEO0äj/w¨å¡,Ëê¦uãÀ'd\\=JÆá	ÿ¦øzLÓÔsõ|ÓB+úß|/ãñÏÏô\\êtÆ|uøÅ±Ö¥=@A@ñéØNºxü:^¸pâ\`n\\Ö¬)D@.êoõôC{µ.Ø@µvÇ&£Ó7µ±¯ï¹6)ÂõÝ¾Ê0ìHd6/´þF©yàö'úE4@áô1V¥|\\ù48#Ú|âãYB\`ËôÙUXýW3ÀDÈ0=@ñ18Ìá\\ãR'Ê7úúË­Ò¤ÙÐUïDB×ñÕtÁÔÆ~ßÚÇÔ0ÒTmí°Ä6}¦©ÐÔy£Iê+±Cì½÷DÕ««3òFî¾cUú=J©ÝP _·Õt£jÏB\`©tDj.§òçS4þrçúYgÀî5°Èb=Jé¨¢¼Y \\yÍ¬ýS&ú¸èÔ%r¿[V¥z¶Jpa}3EºNsÊÜ9æð4¸Îæ@ürX3º5J×ÒæwÐÙ<.¶ÆÏ\\EÏ3VUvàXì~zÎ(£Á²ãÞ4õNÿ=@·ÏÙÿ'Å¹â!ÚI#Ä)Ë(_¤"'öèÇMV«\`?Sñf#°7Kà"sM	×)Qåùy¤µ	EôÙ$Hi¨ùªGô?²c|¸Y&Q5ß&ÜÌA¨×>i¡û'ÙXÈB;ãµåä:t('¶3=J³ÝÄÁ¼%'u7ëÿeÅ&þ°!BÔÍ\`T«Í·=M)&$_Y@WÔéÜçqøv[LÁgû¿¹)'iÈüEÍÀC&ÁId(¼5ï'+¾\`­RzÉAôs7°üÔþó>µñX&à²qIä¦Uèø-Ç'=JËL#ÚLÐNovCã2]·i|=Mõ&Ðþ9þdÈ²À#O$j¬e=MÈÅëpGÅÿ Õ´_"^l­ÀÐ_p³Pw¤iøâ­±wx¨íÀmTÍ"yò3á8[×U¥Ã^ÝÓ¡®khîìÅçÅR#Ùyu?\\\\ãÊð=@*UÕ:yd§Oóð,¸EÓTQc~®| ÄU¡íóÃ<·G°ößÕ¡ö¸7§u1&v=M¿l&,oNAvü$´¢R ÜîQ¾2|÷4=M'MÈf)®l l_ºvQåàûüÊ½ß?ý´ieTPé}ï¢éOïV¦À3¶¶Gyè*Vâÿs(ÖÇÙ	H¤Xô¶ÔÎÉAÎÝ¸&jÞI{ Øi&	$=@æôùfà§µ%0ÅSáÆ ²aÀY¤	ÙÛ¶²I9÷¢zÚcÃÊÃÝúÍûßZÄGËou9ÕUµÊ­àjø{A×£²:¤¯ìir+QCØWì¯sâ7NöL«ÝÂJ²à1*ð%Õ¿ÜóÙ½ãSs,¸é0k+þÉªÃflâ3=}{KÙøª~1N¹ñ]¬ã8ÂS3ë_»=@¶F5b[YÃqÐp+7bÍ²ïðHG~*·x».{7ÙK{ð½m²<'½íø\\Ê;ì8U0îiFByM0®qß¿sºÂÙAõñÖòýìËkñ$ðâÿ£B>C¾«ë·îÅ9SËãhWÜùÆÍÒCb¨ÓÌmt1AzÝ	LixG6Jÿ¨]2v@=}®$elt=@ùDJå òF ñ&Xzêè±h>Ù=@ú¨vLú6"OÂî³»Ã*ð«þ3Ügä°qÜÂb²q o!+VGCK§áÍ½ï¯È¹ào\\~î°¢4»	fÄÎÆ@Hþlm¨ráÐ"ûìªxPCá?©³J]¢gr²QpæItãfÚ«ºöº9e	ýÍ·áÿ"°ÈMPÇ3md!j!Õ9ÀùBe>ü 7Ü&(qH(£r9]±åÙ©^§©=M±èu)¾Îaæ=JÜá(ï=@º¨éëÕ!£(MõpiCôÅ]¢%%È¨¶gl¤yíù©©ë 5ã±6ÈøiYäfa"gé¤'=J¼!£ Í5 ±!¯ùÌýè'Ñ±ÐC­±æ#å(ºøgÜ[á±^ºÎIh])±y¸éTs)=MÓÅÀáÆºÈIF&IwÈÙh¬×IçYÎ1 HfâÉI©OA0Éä'¼h%ré$=JGfpÓ'+g}Å(§§=M½È¿!èUA?ümÇ­Å@Þ%Å84w]¥¨!È5ÑH?ü¿Í¤\`ÈsùégÎy× &Oq#=Jñl$¸'1éHæ%ýs(¥8"HæKiZ!¸]Ù&¹E!eë=}¯+gYx#9E¨>ü	úiÂâ)ù½$e"Ð¹^éá¡rII7\`ÇcU	£\`#èÕÑ§xÐ5é$­)â¼S=Mm¤í=J!%=@³á?ü)§öy©ëKGw#øÅç{r0© ìieK'Ûç¤diÛ&´q$l¤ýk­Ý¸%iÝL£ii¢È©)"+vü%¾Dh'_K§÷K­Ag÷aIü¨§ùSù'Ãu27¥!&¢íÛ}À'\\#(·ÛSI¦TS|yãÐùé!ïÎ(=}¥&î¥ø$rí%©"iEèñé	gÎaáö!ÂÑÙÆEü9ö£ùÒ¯'i:üÐ8ãEÙYÈFüÑÀ¥ð§=J#ùGûºèºÈéa¡hGüûÂÈù¥³Ù(mr9_ !Ñy%rÂcâ=}Ù¦§rÉhåÆ(=MÀè½$giÍ%ú×érü¹¡§	åèÑl¤ø=JqÉÕ( wY¯=}¥0&&öÐ i¢$('¤è£û?µ)W4ýñ FeWE=@H:üqçãóÍÆìºhºëm	#îÁè]ÎÁ¡!("ÃIFüÅpF)Á(¥#Ôº)!qù"µY7ËüÛÔã)cSÙMÉâð÷El¤Ê××ñ8¨yrÙS¦Ô)åqm$ög0a Õ}%£¡ñ¦d¶	Âë÷QÆ)ò¿}l¤ãÃ9ç"=JÞ§¼W­%$èù9w­=}£öÍx4¹æËÅèÝI7ôþëEçÌÆ(M	[¢ê½·Õy%¢è=JÍ¡æÙ8ùä9&ðÎæ¦ùo=}y¡ùldüg ¸!Æ¨^Îy§Ø%ÚÉô®l¤Ê=MowñýñúèÀÈAÈ§qrÈZ¢(Äiår¡=@}¥!df£i	ó_Ygf#GKÇ¥Þ%Ô	¨=JÓµ½ïë=Mø'îñ$m$«=@ë«}áX£ùÁl¤#)zá	6«×¥Ç¥Yù({r!)Ø%òÉ&¹º¸(æÀ°I$ï½K§$­y=@+¨cÎñyF¦´S§IGvÙù½)£&ìçm$	!æ%Ã³±Gr©Öß%(ó§¹9ãW­IeÍý	ºøgÛ²a#ü)hÎD%ð¥iY°ù¦=JÄß)¤wr¤Ì%åùè=J#Ål¤îÈà¹§Éoi9=M)g(&óé¢rù)s!â¡ç)Ã¸Amä)Ã··7ýèd$y'èâ­aGf¥Ùº§ÇÛ»oig^Î	È¨ñy¨¦r£¨=MUq"'i<ü'¡¡IÍÙØ¥Öº"!äÑAHâNÎyç©=MA0è ø×°£öYXg±­Kç£=MOÆ§©¢ä)¿ë Æÿ!=JìíÉK0ÙÝ³ó¹\`èïÓºÈ)ç·ï-$ùîºÈ^ ]¯íð©Ö]£(íï'É¤=M?l$i	§Â§ib£¨ðµ§&Ó3±±)eêÔâ=@ 	×¬J>äoÓ´¬/{RTàR HÍEJ,EÎ5pÒûÒ[ÀÒÛE·ûáÌuÖ³?¥aðØÛ[!]*=}(øç!#))f9	ö¦Õ©§¿C&ø0o¢»]vuä§³¹øÅhÒhµî¥g8T\\íePk¿vèõ=}UÉHL¯¡áIÉÅ|LÖ	×Ê-£MÐu¦JÍÈe>fÑ  édË¬¸¥?Íî9æhK p=M^³ÑÇ5À£$;³Ev¥þÓÖî¹é(îÓéÁ"üÐÏUX!& ËîÛgdÃã\`·x©+q?ù¢#§V#z!øñ7oO¸­#¦Ülc³¡_'IÅ»¢­ekífSàfjþq¡§¦!m³ã=}>	$µÃ¤$%k'Ð¦¥ a³%ÃXÑ!ÚN|«ãwo75ÆRýÐ/¸cgY	ø ïs«ÙPr¦C¹fs&{;ýÜí!åYÀ¢ÝìÐµ(h×î^ß»¿<é{óþÒ¶ö1NöéÏ¹)ý<yçH	íQáÙrfz=JãáHr¦Ôë=JÙNhÚÞó=MiûCèÐõ1=@V$ÙKCíÐ_YYÄ¿w?µ8¾{éÁ^\`Ñ11t&jsÅÛy	¾9¿âX}ØÏ)þ÷´=@'~Ø	ÉrÆ ù_u¶î¹A[?ä|àë«<)÷	>%#ÿõÍOÈöáô=@<iþ¢ã&£Oèøë^á=J³ò3ÕNhþ÷!&#=MM\`![çT_Êøç<yWeÁðüùxAÞ7³R)³EÉi_¢ïOhå¼÷Æ×ïód§Ø\`!I'iÿª\`Ñ©¥zçÂ°ÑxÚhýl/C	ö÷à¤ÅÕt¦àåWÜ¢î¤±J³IY¦§g\\æãî¥Ë/ý¥NÝ¨àW=MXW¹º"+a}Ç¿YQp}ã´HMÿ@¢=@Xås<é¼ùÀHÙ­ÙNÈ¢Ý¯<adÂ©cÍî}­wyÀAw!w±kI^è£5µàÿã¼î'fvqìôx"uÅP7ÇQßîY0àW¶t¡¢P'W¡ýöÔYU¿bmwÄb¤èÓRoð?øg!Á"´Ð%p©¢G~æãÁmÂÈ)ï íó7·Iâ½÷?I®¿¢ÔÝ÷Íðîòâ«<élúØ·µðræ«ÙWùÙøºâ[éSþÃqhµOÐÆ÷ÚcÚÄØ¤1&¦¨Ñ¸Aß	¦òyd8ý¯¶¡=@¾¢l?ýÁÕø¸çÙðÀõ¡)Ù$tÄ #±¸2¢X³fàæÕî¤%çà6Áâm5ý#Ú£ÇT¾"9ÓÿYÈRðÿAbÞÎ×î­ÄÃ´÷rO¿vÁæa0^·Á¢á:}ëgX¢8Á"?&(ÑÇQÞß|fGèÀ"Ù×vÈGÄÏáù ­ÁéSÜyü¬ñk³IÚÿÉ\\³©ÿîÿâðO(àîE¾àGä©ûâ"¯î=}´Å\`éÔ5ÓfvXY¹»b6P)¸7ÙN=MXà·OõþúûM_Å^¼¢çÙÑùüxçæÝ&^ZÃ'v}Ôe	ÿyðàUÈb|ù©UÒ	¶#	iÅT«\`&'ÛH¦Ë\`IÆ$rÅA×cÏ÷9èÀ¨YÈùaû©R^ÝÍm NZýÕXÅ^'Pöýq=MaF'>Qò{¸Óxc¦A³Lì_fK¿Úººð¶ 4:£#é;RõMõs"µÜncVMÞ¹ÀùIÜq'q#ÐôæùI\\äÜ}W1[J¾ºÞ)úô4}tË©YÙ æÄ"Z¶)/Ù=}ÿmÒrÊràÙTÁ1Ì×»û=@k×öI%E2éX¿'äé«p0ãÑ~yy¬ÿ?c:@<°8KwûfÖ3°Þ4o¢}ç;@ÉÓ6y¶¹Û·»³bµûg\`ä´[\\d\`\`DvsZ8²xíê>=MuæO³³LJÉö¯3D%ÏÂZÍS~¦ÌÏéû'9'í=}·;Ö9;K7C=}÷ó@{úIÔ:·2I¾s$ÚÖ×Îzºò.¶ó«ÓL=}W@¦Æc¼È>gÏy;AÇ¾N¤ëglÕB_°qQ½ÊNu)"n»gåÜ®O=@Ö rg¬cLl>OZgnæ2Sn=MR]µ¡¹ösßÀVäÄJññ=@ôvàxàn»D·y>ï²Ü¿À¾Nµ[hüÔw})_¤\`D=@äù G¯°ÞCD=@ÞmÝ9AÊ=Mé¬ö;ûðÐ¬0üÍÔ©níi64½N³¸ß&cèønÕdÆ7ÍÍ¶ç%Â×{FFë»û³sópÙlÅD%<½Ì=M×¶u?¿{æÕDÅNÄ×=JÎ5uwtxÞÂ=M)o»)pcD3Ì=}<V;ÆÝÃKÄº¼yüRhOÀÆ[Ä·7ß[Äí}¶n»Êm´ßác[uyÞîEí=M}Ö;îkð¢®O·ZðpñoÁA_±Õ|¸·¿¶Ä¾?\\hhP³CnÄaLcNU«=@·ö¦Üô\`³ûµ{òéx© u¾cEKûoè÷^¨EABeúrC³¹¶vÜNÝ-ÍÝ\\çüæ·((ð~¸_ð2ÜÛp/aÍ":AÆ¸¸O³@Wn´ô²¾Øk=@©ÊÍ_¥äX*¶SÔàÝN:¨t:-ÀJ´ ¹^p^öTËmJ»¼GWµØÄ?ÿLïDMuêoo/íBçNÿáKë¸;võÐaa8²á¤PÝ7@·xôtÓ¡r¸;Óº½?¯rÛ4@²Ê(uÞ¾ÅMC>mo\`¶ËnBÍÁØÍÕ³õIB¿ï¿ØôÚðâÄ\\=MÂ»ßÄ¼S+p©¡¡¾ë­1C½VÀB»h¸t´vy=}ÊPþÌÿöEs´¸<ßÕÏ!Ô:aLd\\¼VO¼åqäå¬Åï;ÿÌÌo^TÄ¸Áu]©,gØ:i>Qú÷ÎgþÍÚ½ä÷> }|¡c_gØ%XöõçFÎp~º1"~=@óq2%ÇÁzzþW£¾ïs¶÷×É¤xy6£ôûÁaO23.yl7l¬³ú®:pqtk2Qn=}2Ó®®£.tæwù2,uLÌ.0JäÐâþ¼AgÔÕXÒûbV¨ª 7GÂ¶ºxÀ	h>---¦-LÎU®¯à8}Y,NIÏÎÈ±VLU¾ogñ.PQì23®~ìâ,ÄÆ¾æòö±¨Ã©ª¡<t¢M_¿®	ïì5ìì}ì=}ìMìmì-ì§ìGìWììl0f6>BZIAe=}¥ìTìá®/®®®³®{®Ë®>lFK¼ú½úÃú°úÆJ9L.:&2¿3H.al£llC3rÒrÀ-3·2×3g2ìrìÁ®_®'¼PëÃ¿î¶È:yÂmu¢pJÙ QvMFPzì®'.ÑFRìVì¬A#äIUKáGú¼Z­ÈzÈvsnâvRs9M¶JÖNÆJfLb|Xt=}3È.Mk"äùC¡ÆÚºK¾MFcÛ.¯¹Kª:íä9ÛWÏ2gð!@p³ÛälâvðbsÐl°Âk°²J]"ºC»;º;Di}¾å®Û¹?Ï,Ãý´ü¼öÃöºy{FTô\\ïEöíx©w{t»cH¾ÉYSô{\\ó#µë5F1ìB-$cÀyRsP"=}0;;ð[ègýàè«ö©Än{>YÀð¤ÛèWðXq_àÓ+aÈ!»À×¬ys5 ÿ·&êpÔÊ×Øê½üÌT¤+ÖìÇæ=MFË^Qm+ÀF F=MØj©ÔÔîRÎ¿'Æì(GôèGïSïn¸cÃ=MV:Ãõ*ÁßFíI+¥Ea½ü«ó±bPQª3)CçøOå~l9ãlT$DòÑZVá+è80òjßì0Rê-À^~C- Á]-£÷6B}ûªh¿6¢nRøcý·çÄßüQËè¥ë=Mñc.e~B©.\\ó_\\T¬¶7|íT?x×=J/£|z-«K_º]ËêÍqf¤ò8lZÉÃü¥ÇS¡XJÂù®¶þÊÔ(´bÍ[=JW¸<O¿,¥FFï´À=J;K.ù6±½µò 2öb¨Î¹R^íÄe¦ØK}±f]8&gÑCÑÁa=MJý³ð(Cl\`]­âÇv±ùÙcV)­ÞÉÚ öÀE¾f¢o¦Ö=MÔ¼Aå>1¶~Fzëº.í&Z&*°q/â|2°ÞìFÌ)S#Ô¡vrÄ(ã(ø)éiéPÿIø)¡&))¢ËÞ"©1))&Ç)'¡&©Á(#¡¿ê)?ûð)(Æ'Ë&)ý=M)é)Æ%ÏB­)#)ýñaÑè=}©=M)BYøÿ.Øcµßæ%¿¼eÆÏK1ëA¸ãêí9ìÆ dbõ*Ø®Ó!Ù¾Ã(«Ú¦ñ¼.ý¸¹i	Å)úýÉi6sPÀ%.²ÞX8î4ÍB¡½õ[Ö4LBWú7¶ëLë¥JhíÉçç­mè&¯µ¿R=M}gÊ¦{3=M>¢í.EõF vúßÆÇ(hÒ¸JXj k~©·Gâ¯°@°þFß³&¯Çõâ£72=J\`¤ Gº²YãÝ(26­& ±5Ø ²î=@ßÅ#æ6Û°^­1	H÷ÌwO×ÆqÿêðGLuçy¦±¥2^öa¾»cGÂä¾Å¹\`0#&wâ+º¶s¸-ï\\°\`°s°=M°¦öuÔ^ìþ<¶H0_ØEÊ@êHïÀ=M<SÅÎº·UôMp'íßOFñaêÿúüZ«ß³ÀÒ÷ß>52ü¼íÙ@°È;ô(2ÒsÞUÖ)ÄàÆßwùÌwÕ×Æý É{ÅøyDñ^yÎætÚÀÓ°µ¦¹QZkã¬Ãaé$}5úÜX=}h&ÂeÀf¦ÀÜÃââ"ÿ®<=J=JJBÜnÃtvq_¶Í>¿l5µO®L;¡Whôb_ßáÝÝÝáõÅ³%£/3÷=J1qÁ	Ã÷º	ûûèz¨q]þÈ¯Bø*¡Þá¡EÈêØ0­«×òÇe¡ÈfI84ú("ö	NèÎQ¨}§ËæIÁ¡gHpÆæÑô¥££ËæBÆ PÇ¤Áñ¼&î³ÂF#yºñ9kèâµ0³åHA~oa³ås>!,cýÕâÕ£AÅ¤Ø=MçâeóåÄÉ¡ßG­zFü­º»ù>ö(±ÛénÕÒåo|ÛcR¨¹ã¼¥L·W¡0¡S¢&Ñ2Lò@|(ÎTVý¯ÎèªýÐºôØÂüDÒrwyIp{´Üeâ».a?ÐTôØr&½o_ÂÍLÕ½Yo¨×F×¤ND¶RkõéwóÒ°¤ò0é|u²zð¡j¥%äLöÇ¯ÇËRCqî\\lMþºîùÜ}éUt2yhO»×;×;bÕO§²ÈÇêõwçÕT¤ÙÎ¯3¥îÝ»å$þ¸íÈÐÄÎ°àµTó\`³@¯ÒË£TøÛôà³ mASa8×¹µÒ ðC ø- ¸ÀzþûeG,;PN=MÌÿÎ ºî;=MMKÎ¿O}¾K¤u(öXd=M_tCõWö_ôk¬¥rÎBªRÐ¹ø$>ÿÐ}\\d[¬Î=JsÌ°µ(÷BySÇØ24w,íì3¬lûÙ TÇ·{F9ÿ÷¨î-=JKÓî%ç4]ÛT¹Þ«ß!ùMA7ÜâM¥fîchö¿ù¿ºÉ¿Å!Óy{õ;Þ5ôã¿µ¸ÜÏÇJ$jÍI)z «=JÐ g»J¤jÑÜb%lÎ4z%súMðbÅM_5ý¢zâÔc/ïÝXGDl4ÍpãÔð·?þ&¬-^=MHáàyÓþ|YÙü%¨9~Ö=}SðèMSÿºò¨:@ùÌE¥k×úP'ýÂy/¿^äüXÜRÎj«h@XúãkÅºªt6;¼ÒRkçÊ±ÀÐ+cêyô«ºo[¤Æ+&jvñv!öÂöI\\=@zÌ¾ó¾¯í|@îòã\\!èí-Rö!:ÁÿÄ©í[ÁÚ}ôìE&n&LW$U\\BÍ©·Íª£"*5þæÙT´7ArÑÀ%&øºM®ZÁS¦HkÏ´ÇQà0ÿ±¬$lñ58¤\\HøÓùÅ½×÷w©in)%S=}PýåâY×°Qæ¿hqKñ13ÓËí°È¹Xû15:ÜPöïtõ=M[ÜÑn5I;	´ÅèEÛ¢6,ÿà=MÈ³{¾âÄÿUëºÉ[~÷ÛI×²wîó{Ñ??¯â?8=}Xnf¯K"s¾õ	î¹£êkî÷ëÎ· \\öìqbËð>êÐÅj	yÁÆÀÆ-St6¨_²HÌ2·§MðÍ6¨ÐW?þB2ýöÐ¹ÑR®7Æÿ_VïJ$[´-F<ôîèo^Ùu2-[6h9Ê×T»á^ècH=JvVP?]£Ë©¬×úpÕ>è{mI¤Á5ðÊcèzmú~¾ùRçví¯F1ÔWBï"iNÄ¼ÂÐ°eüù¾oYÄÖ3L¢@{hÏ±¤°äl²þ*ïCXNèMßÇ=@(.$õ´üÅ wGÒ	¯?úVêrhepÂ×S%H±Ú8Ä=}dlréÐú*l$UÓcE|9@}×«R}©@zf#)¯áè%NÝ{æöÃ÷S#iÒjá«4H\\qPÏòd9¨zßÂáÆçZ;OrçÌ&®v0=@<©wA§tçú25Ü¢hô&¦Ã%Xp:©³_£tåÌîÕDËºtÕX%h¯]5HZìfSí³ðc±R)¨8½û§¤0K#yS#ÁwYìËDíÈ:ÖÆ²:Kù´_8ô@3gºWÿlERtBû]³Ro3pÆD)5°W\\¡q=M&u¶ühAs£HìùfäeÕÑ±imLÙÑ3ÅS%và&5ÓiÃÏy§Á:|õhË*K	¥[Kõ Vqu°k¶Äpr#F¬­ÒKÞHB¶îÁÔ|îl?ª­úDa|98Õ^ÌhóS)R)iÒ[ÝbmA¼ÙªÔ8R÷!®þ0£lø¯BÒDõÍVµÝÆWu%lôåÀlråúN~Äèz_´MÙC8Ýÿ¤É¤uIdÙý2OSÿ¶ºH2QÛfùÒROZ|óÆRtT¯êÜçHçïì=MýVé1 }ì$1ò<®HúÞªêì²åº$ï1Ôªº§÷$À¯	}Àÿr¨/3ÓYpjEsK!äòèÇ($iì(òÞø{Xz [©²vÐÐÇýHÍ¾Ç¢Í ãPäG)GÉõà·ÊÏ@$¬¬øÑgÆQÎSqqÝ»Kæ©÷=}äm>®p;ígw	fê§ß¸GþL¨»=Meóìy­"t'ËVõg¶àpÅèàÊDq£Ð¨¶Ôî³³ñF¤Hç0·´þB´À®li¦×¤ÒL¦?h>Ðþ*Ä¯¦,;î;¨ëÓ»o"@ôèº¢wÈÒga®ùÅRÏ=J§WÚ{qÄéôü+,=} èªöYãºÀö¹Þ&kèt¡ÿ¨=@¤\`~!lôØ}ü±bËàwKëlRtäÔIÔÒÄÍÛå~g;\`Ò_!ï|*×"@ì$ÙÑçWÎ¢;E÷wo«O\\ß6@Õ[û¿Ð5b¡@\\Ë}[½Ùª[BªC\\øõÌÒMnÏÈú9Ä'A$j¬!©©²¼Ë3Ð¯s®¸Ð0ú)¨§»ÞÉÔÛwãxl§DS×ß-ªÂ!³¼~ùk"&l(#È*´#­ìQ:=Jídj½¢Ë/Þ<ß+w(ßcÊ5§ªõ§)º9ºý(+§jÅ)&M%ôÆrÕ©%É¼&ÔéªK!ä¶©xÕ×uèXÄ	çoÀæ¯ÑWt;@àfÒKcÁúf´ÉN!3·JNý*qK?¯ÏJ^ùkE=@:=}(¬@¥Bq$0Ü¦-/Xti¤cì O3ykÅ;þ2ÃVêã¬°³ëkð©lðPÛþ\\fVwij!+îg¶Ù¯/ßZ¸/HpÐxúß«3Û)ì!éÄÿØ)ä1=JU5ùÝ(,e«¹)#Zn"!,=}HèâIÑþ0ó<üÓWî&JV'¨ø'Hò|®÷Vè=@EìqÒÑÐñ¯í|4K)L:Eèº\`ô=J9þSX&¬ÜU:­YÓ5ÜW?¶Ò3!1ÞÆ	zIäjý-pKÎ¨AáÈ=}Ù©w ¯1J¦%©'çÜ¤x¢"Ä=@ß?9÷3©!Nß.[-röD[yò ,Þß8[ï¶$__IjÝ%q©ïäÏ=@Ä8:kì$ééLÎÙ&>½F#Ëÿ9§(Ñóéà èÖ¤cû´£kí¯$TP»¹Í×J²1tæÿ@|á/DQ±ÂscrôãØü¼qÏ$­ärúª®q.él0N2=J;.H=JwbqîI;©nAJ@Ñqç®ðæ ë³øÈòÒ#FAü:^Pá<EË¡våÞ4Åö¥{3Q_n%Uæ?ÐÉê'ÜÃ(è6.YíÉÌàÔ"$rjòÈ"GÞI1iÕ­³gqí¿7éÁÙ±uÞÀ¯Ërß±òLôñ*bH n½=@ÅZiÜh¦îù>æéIÐK¹Üxva+Ë&!gú\\&¡ìºáw6¶¹K=JâèÌVh[y­m"¸/5µî0§º¤«|U"=MzQAFÈ®K¤K|Dt´Í{æ;q#)gu^Å«¼Çy=Jez¢§Ø¨1ÝìàÿtqãÂ±%QÒèXpfc®ñõþ4R¨àè°É*âþ®·ï KçfÖÝE©àzµ·C=@.%#èÙz­ßbc>EÀ÷l¸i=Mv5VX,×$éoîfINÆ¯m©ñ=JÇ{\`üÄ¡lçøj~Ô¢BévBªGTç´W¢ÆÙ^t(C5&?nÀµcÇ÷'ÐS°¹b5aõP~é]Há  ìígq;E=J²HyíüCÓ¡3ÁxñsaY¢·ã­	Ëâ´Uí8Í¢EfWå6OØqÿÌ_[ôcFÍÄC¦t¡Öa,hkÝ@·zb>Æï¡gEÌÙ#Q¬}\`ê¨=}¦f.@H/úbvrD²ß½äK(¶7èu¥=MøíÂfKf oË=MËzFdA*ÙQÛfCø11J¹q[baÃµg!=Jêðß¨Déf>ÑE×«¡ø]©Ð¢µ]¸JÑ	z^"c¨§Æ´IÑ)"ì0 5pñI=J>$>=MÆéðT=M:~â*wÑðºÿºéF<Áwoöi&O0ãàjòÊ¢ £föÂ¯áp¸içç1[]*?nÝÙ\`JsV$O\`îHÿÛê]à	î©¡ævØí¹Õ¾+)3h­Téký¿}»¦eAé~ìõuÀ²/Ø9[ð|Â ,QáïÛ¦yÆ-ùiD¸ç%JMâQDò·ùð¹jñ ÒG»°âÝ¯{çÃ¬Ú¨Ñ;ë4Qñ£H·»ií]fòý0Eêç(¥[ ^¹C°ÜÈÞa G·_ïdßèB¡fÔN¯ó86òe-y'"È"yáF»åÅM´3Ý\\p'^=MG4¶Ã.)ºuÂH\\<PË"Ðâ9XßU=M=Mþ¯À$/)qþ>äíù¤ÑØDq2Æ2uq"áXZI°'=MáÊ-Exhó­SÈâ)=M5°¦ïæq_n¶Ì!Ù04øR¯àÌ%=Je¦¶â×=Je"ÎÄ¯qëû5~Z3(zmaä=J¤¡fÉè1%=@¦®Úm	ÍâßL*ÕÐùjpíhR%<$y¤²h=}¯"Åâ9hJ)Å²?³1 Å=Jmxeû¾àßÕWr>ðÔ~inx¤«f±÷H¾¯±O$.FníåRä3~²qUuËßcx$@x5Ë%êÍÒ"Ôi°vö­ï=}Û¥îÙ§µX¨=}po)ñL¦)A½l$Ä+Býf ²§ÓùÚ\${_&$?©æGñYï(ãM@åý(5&c9æ§a=JÍþbÉ¡C$ÙV²Ké«ÕÝ9XïÅZ(lPð¢±E'é¬Q_|=}Ã¿¥r?¢/¯cÔ0¦t¶kUgôý¦HïöÒd	GÍù^­	!.¡WFv"3¨±ae¤RµA¥-\\@Ìl¦}®eÉîÀ¹qMëF[ÇØxe-Ö·il·ñ¥zþ=}g&=JÝÔUz §dèÓH*±wu¥ÒÁ?£7¢L©~Þhä:ð=J±oÑz×qh¢ÿ:oøIðÚGñ[!ìXÖTíËoMú!~ÆHqq¶R 2¸k[Ñ2¦C\\C¡ì#¡h²);mð®ývcI§$àp5ÉçÑE¦©	¸]=M(ÃRú\\¶ÁsÈR)¥Î0øî;èÌþY68$;e¥gqU5g¯æ[ÂÞ_=@ÑGq¸÷zwkövvñ%¤rz5 A±=Jt;®£éðY±8=Jøý:6·â®ã;±iÀötñªXÑ;§§YHÇY´×­úÎn=}v³½àÚx	±ÿ¥Ê=M1R=}:g'X)>m9K¨Wb)ñRPí!D=@ç±YF ¹îÖ¹Í=@£2xF¬§o$Û?xä¶·1áü]µ5J£OFð}9QÊªu?¶V»IíMê=J´/­%=MåG>$:å©g>=}áëÈé=}¹×ÂÛa*Á¡ì°Erkb¹!o¦ÄÒüf&GéBáJ½¿2 #Do¤HëeÑ@â$7Ðþµíß[!æÚ,9©e«Ôß8ÌG],U^p1ZhæûAÿôÆo%7Í;\`<dâG«yñµr!5Æt¨³|3Å;g],H¤Ë¨å	ZÌrKf=M¥9iq÷è®	Ññ;¦ü5{}¤·±b¦]öeIø0AppéWí<	Êl¿P$6ø7È·#Güú¤öÜ©µÅ­èí¢á*.ØmþAAûøt¦;²máÌ«OÂ}=M¥Öb}:û ÷)2MðWíâÀÝn*Tv)+mh«ñTÊë¬µâÞMØPoþ'°òÆ¡CÉÆ³K{uÚ¦Û2¿ñµÞeÌÕÿ+?¦ðÍZ($WÆ©D÷	úÅA4GìØ=}Z=MÆßA¯ Hí¯	Ë["Ö{bT¶Ó±T­ÊÚ£V¦8k¿|ÞýC=MfÐú¢V	-aY6ëÈäåHp»1Ð®Âè"HàËxü Lf]¤M$0èÄ{<õçã½AFIj=M/p®÷h®®y¥"ú´RÞÏdÀgÉ¬ÇÍì1Îy=}iæ?èW@E×ìÑÁ©ëÁCâMß¥XêÒo	JkFvH¶yaÙjv¹ûîÝeéªã- qBäàì¿¨Ó2s	Dj¦'Þ=MM ½	ïSº¹6>Ñm|q¿¨~q'Õ%VÿýfÎíÒÉpTlÑår;Àà¤¦mHº{¹u'R¾¹ã	äëû³¸ æbë;cmxéåõ»KÉòJ8³0ßj_mòîW0Q(Âºæå²~ãebÔöâçLwkÀSü²K£î/¸7ðSL7y¢vTQB	D±Í\`a¿©»]¹®Ì¬dP5£ôj¨Kfno§YçÒ×ÄáhÀ)Ö)m÷¯Iiý{ÝjêdK7E_8ìÝTBÞbtÇðv=MM·ÑübséÐÛÄ^@ÉðÖNV·.ÏÛ¦/ù^\`[×Ò"RDë¯êý´=}"ÅÞ¼.Ht=MñÞ\\.è9Éð}º¦M¦w1x·ü©dy'ÖiÇÑÝ(=@Éø$ý©dy'Ö)>y'¦_)\`-]©¨ùù&#y3T)gé&³w£dbôª¦x#5>V~â²ûXØïu¾Väv·?îU)n&©y&YíæãÏ=Jn¦Èsw²bÈ¬Lî7¯g£$¶+7D@lÁÝ«ÕùîQ³;$;îì_ý¡Ü¨ÈíÐtïQn<[É¸ü)àX~ ñ¹_ä)ØZl8ÑCÆD¦×h¹b#Ål8/½bçã.7A?ßyL»âì!ÆGX.LXxû¼©þ§èD÷iiºV9í¥ïÉsùÕÿ¸Ö½vLgyë\`egéN»hó(Yõ)¡üKôÜY	)wÁè£ÄÂ¢F«f)ßÄK0èCæ·¡eîm|!BÆÓý )*`, new Uint8Array(107295));

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

  var HEAP8, HEAP32, HEAPU8;

  var wasmMemory, buffer;

  function updateGlobalBufferAndViews(b) {
   buffer = b;
   HEAP8 = new Int8Array(b);
   HEAP32 = new Int32Array(b);
   HEAPU8 = new Uint8Array(b);
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

  var ENV = {};

  function getExecutableName() {
   return "./this.program";
  }

  function getEnvStrings() {
   if (!getEnvStrings.strings) {
    var lang = (typeof navigator === "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8";
    var env = {
     "USER": "web_user",
     "LOGNAME": "web_user",
     "PATH": "/",
     "PWD": "/",
     "HOME": "/home/web_user",
     "LANG": lang,
     "_": getExecutableName()
    };
    for (var x in ENV) {
     if (ENV[x] === undefined) delete env[x]; else env[x] = ENV[x];
    }
    var strings = [];
    for (var x in env) {
     strings.push(x + "=" + env[x]);
    }
    getEnvStrings.strings = strings;
   }
   return getEnvStrings.strings;
  }

  function writeAsciiToMemory(str, buffer, dontAddNull) {
   for (var i = 0; i < str.length; ++i) {
    HEAP8[buffer++ >> 0] = str.charCodeAt(i);
   }
   if (!dontAddNull) HEAP8[buffer >> 0] = 0;
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

  function _environ_get(__environ, environ_buf) {
   var bufSize = 0;
   getEnvStrings().forEach(function(string, i) {
    var ptr = environ_buf + bufSize;
    HEAP32[__environ + i * 4 >> 2] = ptr;
    writeAsciiToMemory(string, ptr);
    bufSize += string.length + 1;
   });
   return 0;
  }

  function _environ_sizes_get(penviron_count, penviron_buf_size) {
   var strings = getEnvStrings();
   HEAP32[penviron_count >> 2] = strings.length;
   var bufSize = 0;
   strings.forEach(function(string) {
    bufSize += string.length + 1;
   });
   HEAP32[penviron_buf_size >> 2] = bufSize;
   return 0;
  }

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
   "c": _emscripten_memcpy_big,
   "d": _emscripten_resize_heap,
   "e": _environ_get,
   "f": _environ_sizes_get,
   "a": _fd_close,
   "h": _fd_read,
   "b": _fd_seek,
   "g": _fd_write
  };

  function initRuntime(asm) {
   asm["j"]();
  }

  var imports = {
   "a": asmLibraryArg
  };

  var _malloc, _free, _mpeg_frame_decoder_create, _mpeg_decode_interleaved, _mpeg_frame_decoder_destroy;

  WebAssembly.instantiate(Module["wasm"], imports).then(function(output) {
   var asm = output.instance.exports;
   _malloc = asm["k"];
   _free = asm["l"];
   _mpeg_frame_decoder_create = asm["m"];
   _mpeg_decode_interleaved = asm["n"];
   _mpeg_frame_decoder_destroy = asm["o"];
   wasmMemory = asm["i"];
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
  }}

  class MPEGDecoder {
    constructor(options = {}) {
      // injects dependencies when running as a web worker
      this._isWebWorker = this.constructor.isWebWorker;
      this._WASMAudioDecoderCommon =
        this.constructor.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
      this._EmscriptenWASM = this.constructor.EmscriptenWASM || EmscriptenWASM;

      this._inputPtrSize = 2 ** 18;
      this._outputPtrSize = 1152 * 512;
      this._outputChannels = 2;

      this._ready = this._init();
    }

    // injects dependencies when running as a web worker
    async _init() {
      this._common = await this._WASMAudioDecoderCommon.initWASMAudioDecoder.bind(
        this
      )();

      this._sampleRate = 0;

      // input decoded bytes pointer
      [this._decodedBytesPtr, this._decodedBytes] =
        this._common.allocateTypedArray(1, Uint32Array);

      // sample rate
      [this._sampleRateBytePtr, this._sampleRateByte] =
        this._common.allocateTypedArray(1, Uint32Array);

      this._decoder = this._wasm._mpeg_frame_decoder_create();
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this.free();
      await this._init();
    }

    free() {
      this._wasm._mpeg_frame_decoder_destroy(this._decoder);
      this._wasm._free(this._decoder);

      this._common.free();
    }

    _decode(data, decodeInterval) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._input.set(data);
      this._decodedBytes[0] = 0;

      const samplesDecoded = this._wasm._mpeg_decode_interleaved(
        this._decoder,
        this._inputPtr,
        data.length,
        this._decodedBytesPtr,
        decodeInterval,
        this._outputPtr,
        this._outputPtrSize,
        this._sampleRateBytePtr
      );

      this._sampleRate = this._sampleRateByte[0];

      return this._WASMAudioDecoderCommon.getDecodedAudio(
        [
          this._output.slice(0, samplesDecoded),
          this._output.slice(
            this._outputPtrSize,
            this._outputPtrSize + samplesDecoded
          ),
        ],
        samplesDecoded,
        this._sampleRate
      );
    }

    decode(data) {
      let left = [],
        right = [],
        samples = 0;

      for (
        let offset = 0;
        offset < data.length;
        offset += this._decodedBytes[0]
      ) {
        const { channelData, samplesDecoded } = this._decode(
          data.subarray(offset, offset + this._inputPtrSize),
          48
        );

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
        [left, right],
        samples,
        this._sampleRate
      );
    }

    decodeFrame(mpegFrame) {
      return this._decode(mpegFrame, mpegFrame.length);
    }

    decodeFrames(mpegFrames) {
      let left = [],
        right = [],
        samples = 0;

      for (const frame of mpegFrames) {
        const { channelData, samplesDecoded } = this.decodeFrame(frame);

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      }

      return this._WASMAudioDecoderCommon.getDecodedAudioConcat(
        [left, right],
        samples,
        this._sampleRate
      );
    }
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
