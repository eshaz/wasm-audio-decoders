(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('web-worker')) :
  typeof define === 'function' && define.amd ? define(['exports', 'web-worker'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}, global.Worker));
})(this, (function (exports, Worker) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  var Worker__default = /*#__PURE__*/_interopDefaultLegacy(Worker);

  class MPEGDecodedAudio {
    constructor(channelData, samplesDecoded, sampleRate) {
      this.channelData = channelData;
      this.samplesDecoded = samplesDecoded;
      this.sampleRate = sampleRate;
    }
  }

  /* **************************************************
   * This file is auto-generated during the build process.
   * Any edits to this file will be overwritten.
   ****************************************************/

  class EmscriptenWASM {
  constructor() {
  var TINF_OK = 0;
  var TINF_DATA_ERROR = -3;

  const uint8Array = Uint8Array;
  const uint16Array = Uint16Array;

  function Tree() {
    this.t = new uint16Array(16); /* table of code length counts */
    this.trans = new uint16Array(288); /* code -> symbol translation table */
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

  var sltree = new Tree();
  var sdtree = new Tree();

  /* extra bits and base tables for length codes */
  var length_bits = new uint8Array(30);
  var length_base = new uint16Array(30);

  /* extra bits and base tables for distance codes */
  var dist_bits = new uint8Array(30);
  var dist_base = new uint16Array(30);

  /* special ordering of code length codes */
  var clcidx = new uint8Array([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
  ]);

  /* used by tinf_decode_trees, avoids allocations every call */
  var code_tree = new Tree();
  var lengths = new uint8Array(288 + 32);

  /* ----------------------- *
   * -- utility functions -- *
   * ----------------------- */

  /* build extra bits and base tables */
  const tinf_build_bits_base = (bits, base, delta, first) => {
    var i, sum;

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
    var i;

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
  var offs = new uint16Array(16);

  const tinf_build_tree = (t, lengths, off, num) => {
    var i, sum;

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
    var bit = d.t & 1;
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

    var val = d.t & (0xffff >>> (16 - num));
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

    var sum = 0,
      cur = 0,
      len = 0;
    var tag = d.t;

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
    var hlit, hdist, hclen;
    var i, num, length;

    /* get 5 bits HLIT (257-286) */
    hlit = tinf_read_bits(d, 5, 257);

    /* get 5 bits HDIST (1-32) */
    hdist = tinf_read_bits(d, 5, 1);

    /* get 4 bits HCLEN (4-19) */
    hclen = tinf_read_bits(d, 4, 4);

    for (i = 0; i < 19; ++i) lengths[i] = 0;

    /* read code lengths for code length alphabet */
    for (i = 0; i < hclen; ++i) {
      /* get 3 bits code length (0-7) */
      var clen = tinf_read_bits(d, 3, 0);
      lengths[clcidx[i]] = clen;
    }

    /* build code length tree */
    tinf_build_tree(code_tree, lengths, 0, 19);

    /* decode code lengths for the dynamic trees */
    for (num = 0; num < hlit + hdist; ) {
      var sym = tinf_decode_symbol(d, code_tree);

      switch (sym) {
        case 16:
          /* copy previous code length 3-6 times (read 2 bits) */
          var prev = lengths[num - 1];
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
      var sym = tinf_decode_symbol(d, lt);

      /* check for end of block */
      if (sym === 256) {
        return TINF_OK;
      }

      if (sym < 256) {
        d.dest[d.destLen++] = sym;
      } else {
        var length, dist, offs;
        var i;

        sym -= 257;

        /* possibly get more bits from length code */
        length = tinf_read_bits(d, length_bits[sym], length_base[sym]);

        dist = tinf_decode_symbol(d, dt);

        /* possibly get more bits from distance code */
        offs = d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

        /* copy match */
        for (i = offs; i < offs + length; ++i) {
          d.dest[d.destLen++] = d.dest[i];
        }
      }
    }
  };

  /* inflate an uncompressed block of data */
  const tinf_inflate_uncompressed_block = (d) => {
    var length, invlength;
    var i;

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
    for (i = length; i; --i) d.dest[d.destLen++] = d.s[d.i++];

    /* make sure we start next block on a byte boundary */
    d.bitcount = 0;

    return TINF_OK;
  };

  /* inflate stream from source to dest */
  const tinf_uncompress = (source, dest) => {
    var d = new Data(source, dest);
    var bfinal, btype, res;

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

  Module["wasm"] = tinf_uncompress(((string) => {
    const output = new Uint8Array(string.length);

    let continued = false,
      byteIndex = 0,
      byte;

    for (let i = 0; i < string.length; i++) {
      byte = string.charCodeAt(i);

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

    return output.subarray(0, byteIndex);
  })(`ç7Æ§åÈùöf½vPÃJ%0wJjR^³¾ÄK®Ì¬,q@ÕPP®FfÇö6P¹ÃkûBÌ'îóSÉÕªæ9¤çÞÕï}ý¿ßoéé)%ÃP3=Jqùõ.¥×ç(é()à¬a =@Z2¬ f__?xF¨,¬½Xb£³.XïNËþN)¾ª~þÎ|Ò²ª½½fôtø]Eçã+U¬^[?x:cûX´Áí¬=}]i¾uÂ¥XÓl¯ ÔîÙè.þÓÿ,-#Øh:xoAÿìa°6L¨©_! EíaöÙ1Kéà	á.?¨3T«ZÔ¯|þÍçH^ÅgU¬è«tÍáIF´¤ ±óÔb4þE6qÕÕkß@ïÚ@îs>ñÏZ²í´¶JdÕOÂnsBÈºX²uÏJ´õ&°F/j=}0¿£ãD	ÜJ4äÞT±á°E\`¾UbGwq¿d=M»É"{|gÑ@(p>®ÍëðV¢qB6¼×ë)H°58°0é=}¼_Ò3­fvXæUI5Q!¸v&gá¨Q7&×© eíßñ¢ÿ¿xç(¸ ·¤è×eñpa'ðW£«±#Çn{³¸àpý¦è´¼ç»À	jæ^òÅâPòÑ[óÐüJ7ø9Øøt£bÀÀ DÇ0Í¨'Öèp(}w:Öt>B×x­»}~¦j=@üâ|ÐÏfß[Ìprl§ÙÉ7ÍÞ[Ô;íÍnÔ#áQÎríæ¡^9¿TÏ&fæ¼&Êá?Q¦¸Ø3übÉäDò÷á}çæØ·t×R7.(ÒÀ{ª¡ÚT7ýÜ_¢Ø³ÖvZD¥=J7$:ÏMÍ3ÎË«çÌù£b$êîÐ"¸N·¯¶(Ê=@UWw¦:NÆ&~ÈÇÎ%¸1/ÚtMQ	À§!rfû«'×S_\\&ÅtÍ¯Îór¤Êÿvåq$8Þ$ÂtME8FóyÈ6ñÝDßùÇ6ÙLqeÜØòIÇ6_ØØãØB)¬§í_y°Þ]'Úph[(MÌOß+¡/>3+ÇKjÓÍª^¯TN~û%Ù}oÖÑ¹ix¦ÕNJg-ÿ»ÄVÚVÔø?mû%»|Îûüx}¾±ð Ï@ª"Í%}¤O©LBO­\\OH¨¥øUå¹xFóô£ÝQÐÛc×Öµ¶@ßÂ«æ³ËÒñlá'ÁSÔµÔ{öíB¿à­ØÄà_ù?Å0.Q¥Cº^Î=@Ö^ÃWQèªÿs¦­¢)Dxxzn¤¡ÕQw´bÊÅö$ý|=J=MÜÞá²x¿¤/zXéR£R]gÚ©¬ô¥"¹aGw¥ýP:¾ w?^j!ÒJP÷ÝQÝ,Õ%Ö)%ÝhU¡cOx­=}6W×¹Ð{Pj)Ñ§½>ýgÃ7Ï·Þsü.×À 	¾	?aGÇ:Î3ó*æ|ú¾7õ«St1rDÏgtTÓ8«ÐaëÁú4K/K»Ñeðeÿt±¢Ñur¿\`Ó¬Ò!yYUÐ"¦ÚùÚC¦úT5±ïM8Þ<=@j¢aß¯[UN:ªÓpÊ?hÜÎÖ%tcÎÃNoUrÙfð´É8=MQUÝå¼­U¶?I½ë@^Õ4ÙÎXNüþÄYsU ë=@ïEü$äâà©N¢{/}'^!1ìTICT-ª{}UAZhdÜ'V]ûÖÓE#j8Sªüþ9=}rùÜ4ÿµ¼ÛÂ7%Åú :´ß-,Ü4?ÉÚiuE§#g4\\õú¾1ÙXCà)¥ìVdi²>¹zM,è·ØYß¼°G	ÒÊàG@¦%p/ú|w)\`¡¿ ]QÕ=M#:¿¼ùÌÚvwà!¿ðÜàb¤W=@¸½ð>X½=MWk=@\`;Ñ3;¥<E;¹Ä\`egýz%GïÒ0?¹à¼h·qSÆª]ôtlÉùÞÎÖ~ë3Õ²=}=MÎ¶æ°ý²WºÔ.@Zñ¥^=}øùt­á^WYpÐ!(GzJsù¨¿ îJ©³DÈq$Di\\¬¦5Ià_Æw""áuIw&}æe¥di,å¥(þ!¹C\`,qùRQóÊ{CkÈ¸úuúæ¢¼ægVyÜ²fØÝXU½×TòTÕwd¾ssLÕ%=}\`Ä>ÉÆJu·	ä<Ï' /?jäX>Ã.[I²¢+=@¦ûå=}$4ºf¯H÷tÖ¡¼Ï{~¡ápÏg¯MTsD°}¸ä´Ê8îDp=J.÷$´¾suz;»7UÙ8Ì×[NªÙÖLPv¶*ÇØC(·òÂÑ[·¸HòÔÉ=@ÞÄ)wcúÔ¬Âê2qJÿ^Û·ÜÔdpÍÉv__aÏDäcõíÖÈïÆW.#èË¦i´1kFPÉÂXlÝV÷»*÷Æbª%þá¦æUóÔJÞê¼2j¾,É@¨¶ï3UÎ¥U°µta1#¯¦Eª¥¡jÝÍUäëXè[ÊzäÓÖCÃ²zð	°B®ær³CÚqJf*>Öï5£Ý1ð2BC}êþMNâz«?.wðîÃ¸óDÐ."¤èN9²Ø9P?3Ø,ÛpòljÈP¨âã?]ÿ°|yq÷°§|°½K}6â"º<Ùçdü^¦Üø^V³ÂgÛ®Â_ÄºG[»ÏÙr³E¸x=@Bg\\§ÅèdpôÅ@¯Ëwþðo¥Ì¾Le³±ük>d¯àtßy	PµÜ°xËu¸¨Vòú8Ü}Àð¡WOs0T·2%T~Es¼Cõaõv,´Ñ÷UW*ýÄeÞ«WÝá}OÎi9m´@û\`6d:uìËËÍqQ²ÜeVÍk{&Ç¸?k5ïâã¿¢l'-#j5e¸[¡÷?T¤Ä·÷(tÑM¬SÐd0fÌÑóÎ^¾xN@S$1 AÇüR Sd{Þ_ÕÕEî>=}5LTÑd?Æ6bÇ¬ÕË÷þÌð]G@yr·pRC[o~¯f<*n¢UrÏ'3éÂ-¬­hÌpÇ¹_)¿·ÞA2äüüWñÅ¸÷t(¾;52;_>	îâµÝäáâ0÷ñ-¡\`*uøMf;EÏn=@Ø8,äà¹=}Ø@=MhL\\^f*£Q{NÕ2ÿ-lTïöGjc!@n«µ(@"ìç+"ßò	ÿRÐÒÍoÿÍ=@éLGãóK2$ÜÍMGsaÕa¨ï1 ^3¹j·3y¾ý0]ÄÀ«ÖDÃpFvt0såÔ1ñG05,.@qC®¢W %ó»ºQ¶®n1o}#i7Ô¯?+ÓåÑíï¸Y-s@z³â3"àóo[Æ½¯GÆÒ´:x¯À	À¿=@{§Æ)Ósn¥±å©ñ­xÊ_=}Ô±©¡¶âÛÉûKzH+l-äVÊgyÚ¼¶Í·óR4 T[l9¬n¹R¹ÙÆqÇ=Mø2y3oQà=M«fÙ=}YøH¹µ=JÞG{s¨e  àmýê[r:èñp7z²ÌuÀ=M_!*Ak¡äù;ÝärâÜÇòg$ÍHËÄ'áË ÌR_,¦0KHÓô7¹¸sá\`Q{»þ×úàä=}<¹Ð¥úÑNÌþ~Æ!î$ZÆúÃÐI<.&ð¹xÈ&ÛíãîÀmâüéð	"ºdZ¨=MäFIÃ'ëU9¥#u¤É¤&wñ8GhÄZO|)Niv3qà)ë¡(óI½¨!áh!ai2øOç ¿©íáçÕ¡Àí(-)°E&¶h.±R»Ð=MnÅAw­qÂ=} 2IÑG©#ë9)u6¢£:vûÀig'£q2#!êúr(Ñq(óÒñ±vôéQÑuFaá7Çé°Iàïµ=JÓÕ±ýüËêk¼ìS#.iÒcr¦eÂÀQìT#9æýT³=MyHåÕÍ&¿o#Uµ­±ÓË&©=@ä¢Uõ#Ê":f¸~¿¸¹b!_=J¨»H¸éóò=@pÅÁZÁ¥*(W¢æâp/('ØrA£zìó÷@­é¼\\¾åY=@&QØÆ¸q\`î)=Mój6ÏÜå·QzdúpãÁwñ>x0éÊGîÏ¶A|D8PSòN\\ðOBl²òÞnF¸æïAýæbÕA3	°A+ÔÍ¦1c"6âú¸°<7¹zñêó1Xªíc%tö[áC±ÒÒC[¥6KpÍà%;¥Eõq@¥uËÑò±e@lfnµ¡E2µ¸Íb²N^êÚª½î¸lZFÔÞÌuÆæb%oæå\\î¾A±/¡VøC =@ZFÌáÐº´ç5õºú¸ç×@Ñü·{=@¶=@âáßEÍß'pBÿ àÞëçÜ[äîçB Á¶XÍñÞ=Mü\`r¸²S3d+èÐ²+$ZA<çðu@3BÁÁØ\`K¸ÒÏg°W\\6ÙaýìµSÊ³S=MËwjM1:)qlGbÒÌ8,¹!¸yGàOÜMö=}dïÂÓu=}&ú¨ 6ùT³À¨G9sÅ=JO¡ÕµZ©Ø4F=@øO3°Wùùÿí#ÝçðZ2ÔÍqqXã%µºö§Õ=MþjÛðd³ñHòÂ¡²Lª=@²z£ÚÈúOíÚ&½m2)r}°§mÏûD~*ü:ÍVtÆÐ1Yÿc\\×¤=}ã]É^u£Úí \`Íú ²P=@Ë5(&]ëø{ha ¸àF¸áöòddibHT#â¿öúû/ÕÄÎÿÏF3GrFû.i¶Mc;:ðÅª|=@öRG¦@N´íÄ:E%Èø¢?Ú¯>±Á8ÌÄ{y¤mÎÍaàÿû¾W)Tj²¼2ØH}Í¡ábÕaù\\do´LûIsÊ¹´(r¼¼Ü@É6¨xû\`-¥­éGíNÛ« 	KUDï^þ¿$ÍÂ?Í=}çJü½/x¹!n2dÛ¿Rt"¿÷z/Õ=MÚoº6ß59ýoJm)â=JÀfNäw°ÎJ©ÅÅ67³óäSl´ÍGp1*øòB6'N+|½ÞL_mÂgÐ\`mq´\\nlEáõ§¸è6&¨"pf;y<¤û½Mý£9µ¶]ô0n«>%1íÅ²Ê{»·»V\\&p£Êw >ü®=@æpG#tÀQvªfT2Õ¸x'H°.·à$=J%\`)ÑJ®h"Ëu=MAáBKÀD>Düà)!­!¦Ö!»ãâ%Öù¥z~Þy°	¥¹¨IÙ((ýùH'	KY)ë±þ·íIyøÑX±Ëfâ|Ü½QQÙCþ¢iªùým¸Qi´ÌLB[MÈ´¾AÝÏJän7àXÊänÇ©~ÁìOq~¯Gnÿêk³S¸;q~ÅþÎûòù69k>ß³Yn«WÔõ}}ãÿ,«ÿáÎ´ä@Ô.Â=}Æø1Oðc[O@CÏÞ¡T¥íh*­Ò3y¹gCÜ>ÌsºÌ8¬²ÃÃì/[JÉ¬Éó;¨~¸ïÅ0@cdmÀ­f%øU%Êùo)²m]<æë5$¨­ÌÑI[Ñ>Á¯w´~aS8³ÏÜA|c	Uk/l{mHñubÈ³§aÏ'ðE¹%ä¶6-uecÎ1{ó_ì5c1ÎëãûbfXõÀ÷÷\`0.aí=Js=@_½ÿ\`mà0.f=@óv6«ÛÝg=@·ÃÖÜC|ò}©fÕÜè÷:w@e®ª¸q© =@v ¼÷º.àßâ¹wÎ¯fD=Jv\`ÞCºWàÀÇ×qSc½×VsëãÁÛe[­&Ùh½©!EUý]Ü÷PWÓ­Ç¥þ®$WNnÚÖ¤Wï²\\oJyÆó¾Ý~6:AØx%þèÈ÷º¡+Cøt1VU:[ÂÈg½{vÜ7ò8ã÷{Mi(«¼jee)Ô¥£(!ÜP)¬¥cQ©ìçæV)æ¥££(â¥Åi! üö!©¹ãyBã¦èëÖdÁ+d^½ÉÚvê 6[&%XXePÉèNiÜ_\\3#÷ùä> èîFÝ#ÞÂßÜ5Ü5Ü¦\\ûIóvtENwÓ£ï6­þ½ ùÐ~;Ó©°XÑk$Ü¡PÏö¿æÿ}4u#ÄÃõÜÃ^hacÑh·|5lJ?µÓ¼8Ñ\`Ö^÷àÓ9"jDµÕYùi,T5×PGÄÇõ$Ã~7îð¿Ã?Vu3=J(qZ¿n¡Pw"Ã4a^]üì&Ê=}ÒJ<G«a;ÊÇ@ëSûÕ7¾Ô%Ú~79µ=}ÁÖîí0XUùLØèJ§óV}Ôpáùß?5QÅ8ÎE¾ÚÅÇõäÏvÕÿêÿun§À#_Ñ.Í=MaÚ«Å36ã$±Òé+E\\JJÃç-çï³ðbUg\`WÝêý/z·oWj8JoÝÖHpÛÈ8Ò"8üSð,énj+¾		{é,ñzI\`â´aÆx§&áÆúÁè¶ÓÓz¦pD3p=}¾ÒÍ»/yÊtkêÈ\\zz{æ{Zh<3¢áþÂç^F{N¾OÂ8SvqW5j*Lz/^´FnaÖ>ÛÅ#ÚÃ9îàbÒÍ²Ónä_ìBGOóÁ?Oqêyxí¼´¢¦âö¿¦ÃïsÓ2ÐÆèþºýló1~Ü²5uêaÄM¤å¼¿öZáU£Õï³ÉÒÑi½àdhÒ¼á?OJJ¨B/rÆ}¾FÒ>Ié÷?æ÷4uàÙû~~=@n ðÂÒýSüïùo%6Ï²g#Û¯!¿¦^Þ÷ttPo¡äñ7æI%Ì.@xÁ´½ú7]bÏ2ÉQ±tH)Ì¢g"%6Ñ?Æ0õQçßûÆ|mÐ¹C;É$&XsÅ¶4r¢á1N¡ q¿Ó=M¯ßÈT3I«|zð§.@ÞòB8dþêp¦à¤¿[ñW;Ì-ïæôcüÐaÛz4«Gr"DFkN°°GºÎº9«M·¹»´fÿfFÁ@÷¬ñeõ-Øh<t=Jü+uïÌÞlD.W;W=@Åâj¢Ú2Ñ«=M'/!àTð\`c÷Ç-¨óî®,FG&D&Iô&eÆ.ýo/EvÞÎN;ÃUá Ùº]°1 úñ Ó½ÖÛyÏê$k¬Æá-råýJÌHI­Lßb=@ÔQÚ_FÈ\\P~S)ÙQy(ú$É%ÑÕðYËÅq8¡ùã1=}_À-oyçjÆÄd½/Á	$åyÆÝH|Éü­ØUIÇå&!h$ûøö÷ø(I§F"ÀX=JqIÌ¯#rh§"Í^Ë\`eÕsO]!²NfÀü^¸4'ïDS­á©aÃ	3íÂéné=@q)=J¥ð,U©×)<ëÞ;L8aôb/=@Mzë#~¥i}{ÒÆ¥»ÔüéÝ2HxªÉõ¤òá¶¸ÙòDqÔ³&â¾ÙgÔt;·hôxÅÅ¿øA¯Úûú-b<@øþÖí©Á¹¦!ÙÆå&ðÉs(úäyæsg)è¿ê°^º9*Ô^Ô:r]ùVSÒ¯9Oc)ªÈ$øç½ý$'Ý/X)=MÁ(Á±Íªà<1«b½p©úÏ~iDÞ\`ÄÇwº[	Nþr»Æ^++ª£[½«\\d¤_F.dè¼0Ôà!ã¿#I¦¶Ù©Cèm-üè÷Â'§Z-_èô%PÞ®¥Ýé,D¾O&CÇH=}ÅeÄN¥¬Ûg¼å~>ºNAÈ=}ZáÁzwyP^Tø6õ}6^óÐÑQR.åýô"ÍÝ|³àòÐÑQ\`BoTõëq¹'Ö0ª÷hÎ¢MZ^=@<±©¼l©Á%oAù!)#9CE)	ö=M·óð±ùÿÔóþÅ{]lG6VT°D^©S';P=JóáþR8Óì:2·+Ó}^ú¢[I£ÌxBØúq¼'2x~(Æ^aFi$xFá¾«¼Å>ý[ÌGÙûñå;M°ÍWZeð8ÿ¸hdñq½cú~A¬î[@ê\\ó\\ úÎÒ¼Nj·¯s¼¡íÅ÷)¾OBìØiò¥%ÕðºØ2¥ÁîÑ5ûè«óØm× k¤Wb,ýAH¡SÚ#	Q ù2¼RIË>R±óà\`M4c±>s^«:Ðÿú.6D_³BÆ ¾[?ç=J	ïÍ0£\\Ä	+¸½þS«mêö¨¿}ü­QåÇ·7]Ð­ÄnúTº3¬ëËzd¶>ö{:ÓôàèÅ¯Ï_ñ®×.ýÆ2=Móì®DDL¶{Ûb·\`F½lÆ}w}KÐQvt[Þ¶þ¼¾p5ð[v4O>Öt«Ã¬¿Báxë´ÎxëÔ®¬¿èÌo»ëTlG³iSÃl<ZÙ^Q>tÈ=}úGª{öÏãÜ}ÄWQ½_÷i=}¶d´Ò2ý&¤¶ ¨ùp#Ãh/dû?²ODÞµàZ=}J}N£²ÅúqÊKcòì¦tN¼¤¾ ZF¨[QVgÞÓyñé|7«EÄp	óòNM´ªwwyp*#×ÐyÊyÄ\`Øwü6þÄºü{XÄeµüÞV×<cª×ýc½ÐÃjÝôÅ¼¯s½0dîz»¡$cÅ=}òGxj@Lxê±gxºþ÷³Ìmø>Sí ÆzIÆL9å=}âÆx»|þ«"r	µÄZóöyúQ]4£EÍË\`a·ìÁÓÅqrÂXÆB<r¥6}ùBögéo\`à¤fçEÅOÃNpoñX¾vÝ´K²ON8ZÜSA0¬Æ¨ØO3B?k¬þ·ÈÙZÍ=J-üîpì@V'TçÞÚå49×Á=@4bìk² °Ûæ5æOÞ»Tø¼Xõ,|ÛWo[WOªÿ.|¹Dü(/â£ªå³¨ÉÀ®¬w){¼ÛÖLÒ{Ä/K%&S|çÞüL÷lpYìÖ\\ªz{¸Ú7Ï7Ö¾]ßvëqD4õ{ÏßÀP8ZlwýÛ=@²°\\ÌHgÎX¡ítíÀaÔÓ%lIcxN<{Yjrò°$B»7¾3-ÄÏüÕ#»L&L·=MFª>G÷µØ|á?=Jlbep×9LÔB³_ØÜÞtãÒo:xh^w]îa7òw¦¥ÖW|9¡[Ê®\`SßªfÿÎòÿxEúxö$C$&}ÒáæÄqéð=@doü#Ïeq9(±:Ó=JÖ¼re#ußUäGr¥uYFwÃýP4MBHo´áDo¯»G2bç#5´¡3\\_Ýå0s÷Ä%W:®Ù·ï"Õð&¤¶ZÄÁ<Sù$Æºõ)#Ø^-ýð7ñ ¸:±oÉXq^Á©cB¿"©gU¤UgggUT4n¢ï´$´ï´¼ÂË¤ÒÑÝLkDí°©HØa$>=M-ªÒ~úñL2À5CþîY7ÁUíu¹º\\Nðl;¢*Öÿj6liA0·ëLªÂÒ[úÃïÌvjý¯J¸é°Coñg-z8öÊ_r!3&F]=J_Ä;4¸BfÌH¤{EÞlÓë»Å<­ºá"=Jd¾¢SF¦ÊÑð´û\\öu1îäæWË}pkf{Õå+á2¬}ÕðÊêóë0qÔa[?0û Mäzc®mÁá«°lá:lÃûx:÷\`ê®-øã]ÉLhÚÂ©ÙÂ&!³¢z!ìæDrÅ÷Ö¿ÇÐs¯sÿ×K0²ü*3Õ«I=@M]ýÙ#õÐÂ*ZÛl¸td^3z´<ªLé@-]â9Ö}:ÒK7Dtà_núJÁ¿¯oÈª»'H5iÕm-1*CJÙ§­KÔÖ+Ø»vJFm±,Ö-lÓR²ç{°°Ý>=}®íb$ ý6-í*mÅ T½Qè8@å0H6ÚÇF´8ýÔo¬Ê4?Â¼¾%¦}ö{BII-@\`bFºfúÑ-Ý¾ø$Àó®ªÏÄ¨Ú³»tzJçòôT GU¯:ÅMr·gÞNXÑõÂº½|³ºÍáî{ýð+WÎÍs=Jt5X pÿ^4>1è°VÝäÌ7Q8LR»ç{ÿÔ-º|¥úNXÐÏä¶jxº Ã¾è1ýa]*DkrÞüwAÌLÙ(Ý­sçÐ2¢"mR;Qu¾@³ÖwI,Ò­[®w¡®Ì¼ÀÓW[>Àµ6©Ø°ÁÐÎCØx¬4kËhû·´½S<"N Î>­¢r2$pÔRnjî´óo_jDÁ¿ñnj¦ûÜ«_Þhâ°ãÂ^KXtDR=}ÆSã«8XüøôröÖYsDÀPfÀ¿¹²oCÓÓÅµ"Î0]¬k*¾¢ºÞp-È³$ÑLÙKRþ§µ^.é=Mí=Jà§¹© ×E¨EróÇ2¨±´áyI7zdÊÂN¯pÙ'Ôa¨Ö£'Í±9ç¬=Mòê%4É&R=JÍ T¡TØï3æWM\` ëí=}ÙmIO=J¢ç1 ¯þZ1¡¹gôrXzlÕÅf²P¾øÏt@¹mN5ÿ½È&@^zé	¸_ÉÈk¡ÆZ|ÂT¹cïÛZ=JÙR?ä0«SÊ¦(z=}(=}³=M·yîÄ¾Æh~/?~ûÕìÔöÁFÁî=@þÝNª;×]¤ÈÇ¶_í´×ïF±¤ÿavìJEz~ä|6¦Ç½&lþ!Jzw±ä/º¿òtdÝÓXaOe*zÕºâ-¢¢ô#÷sÝZ0è¿±ÝëïMa"{B\`óQÜ ìyË\\fSfØüÃøa¦jÎ|ÐÄírEµ¬áF(ª©wÓ=M¾£Þz1rJ$î'×«¬,,úô¨»ìBßñ,BÝkXPD¢Nt¥¡Ei=JÕü@DÏ¾|ä wädÕõ}XâÚs0 «K9¿pä5àæÆ¦à\\MU·mÅÈå4ËöÐ6Ì]YÞ®¤µêÙÙ=@Vþ­b«Ï÷[KI~«F-ËµJrQÁ.,ÌÔÎöî|LT>IÔS±ÊxM6CéTwB /ß¾ý+$õ|üø^²9¶-É@B.^Ìk·­Ä_@^^9Ppp$modvgFkòTç =}×=}ÖVµc«ÖVÄõÆ|Î,Q¹,X?àÛ¸^xR}ÕJµÀoàvþÍÇu=@=M»¸¢$_²^!ïÙkBÃË7ô*PÊ¿[wo\`òI¥ûQdÁ=@v¥=M/C\\º|7?fù4³^.µáË\\-öþU÷×t±LÃ°iÖÉÛ¸ÓÖ¨g²§Ëg=@ëÿÐV@ü¯Z9ûìxk°eÕJÉ)n0mÌûo-»=@À¿ÕjÚH#ÜdÏvÀI¬(6·Êñ-÷åÌÔùáôðUÌKLkvÿZ¤MG¢i³½?¹;sû/£xì°}ÑSotÅvKá;m®8ÐÄ>O©¶Ð­äXhHVÍoÊ1#cEÍ=M«¤ýÚ	í+ì­Qé©Ù÷wp³ÿ{ÃÐ9£êI%5uòÔÓ·ÍRé\`¤³/¥ñûGÂ#­Î[ÈSÏ<!ºU=J ýï\\WöÐzHóÐFj±oD·æE¥ß¾:	Æö\`ø7´S_ù\`u"þ>PÔÿ,±cÎEÇ¦¤2îà¿]SRõ"¢Þ»f§àfÄñÂäÖï?âºQ9gªÂã²¯ÊxWñ«;6½ë«ûkÒÒdUö¡kè)u²âPÜBÇ1_¶=Má\`doöom£;ÝÅFhË=Mòäºx§{±ð\`»ÜpOÃÇýLZ¬&OV­	¼öD°s*½3bZÀtRc°rE>2Ôü» °ûd½Âo§¢eFg\`HA´><åC³&çyæeL©ùð Ø\`ìdj}·­.7)0û9åêÒ[¾rsgÑ @Æ_ñ«m¿9iºvxè\\d"OÅ[/NmÝú."oaAW-Üñªö¸Ô}Ã±ÿ.ði0îk(-9vy[É´=}ÞÖµ8E´Hzrb±tî§Ð6hæi YÐôuæäg]³föË=McZ¶h8[ïBõ·ÉpØjTóL>=MfrvøîÕcxNæþ{ÃÍÐ8¹î7KTAeb[ñ òJC¬2¾ÇWbuåôµL·}}ÂßÁ¸¾±=}1K§£9ù&«ñ·géü¼¦î¯Ñ%¦"í(åÎ[X-X¢íÑây)ø§eFj1Me«x¡zÖê87,ê7F¹úÄ/âI=}~ý§=@pù(ÏÉ,ñ(6Áztx¶Ïá°1H×:Èz%½D³­yN5F¾¤ªhT:;)ÎTáËTp²g¦®s¾À)µV6·+8Z_0#Êy@Ø°Ì¦]p. XùI")ö\`YlðÚý¶"qãé9pY¾½ÒÛ¦¯æK¯mËû@Á¸ì#\`¶ìmÎw:Å2P)ÔV?OQ!O¿f¡Ø¼èYè<:<ÐmâL#½qJØ	j$s5ú­±­wêoÏ1é=MÀ-Rdý0hò÷iÎüF{±s=Jo_Ö¦ýÒêÁyc6»ô8ðWÚËñyAîp×Çæ¨+ê7íÍËG²,ªj	Õoxæ[L­	3*ñDñ\\<ÉÌ¤pÉXO©­¼×Ëaz¦ßåäé?!¼1\`\`OÅ(/Ó»FyÂq/1¾=}I£*_xlÅÌ7÷µcØj=Jâ,£møKzúX­ÙéEó°ºoóaôòv Î2ÐPÓæÂu=J¿kl½}0}Æ.@Ï@Å"ÜP7¬¯~ìMdéµm\\×æ½:4®¸^ãæám¥f-ë#rËwZÌ1óBC5èÊCF±âD<eyRðA£ÃÃô×¶\`Ò]å3¢A[FÉ²=Jrñ®xUí§·@Ó¦aé±ðEp¢ã2}¢íÚÐ<´=J½÷cFëI]ÑAÊ]M­bnÃ ÅkÎZ5ÏñÀíÊ=MA«õÔXQAC/Ñ¢YùÚ#k'Æâ£µ]];Âcpöä»Ómà@ã·jCÅLìêéXFÜÛºÄÙÊZî©bC\`Ô=@t=@\\F3×4ã1ðOiÙEhüEÒ³mï ÒH·H::ú¸ÿÊ¢LÄèÜ}¡ÆaúÒÑÍ1çÜíc,$üÖó^Þö6CÐÌãíiAuüc÷[ý&b§F@Z8è¶³5d®Vuëà-f/Æ6ëac'D£ã:BhC°Ç/¼î6Õ¾1=@¼¼ð7Ñp}îì6°\`cÅìs[¬@j¸@î¼e½ìÖ]ël[õvÞ. eà=}tÁÊ¦ÃÍî£¹cêéöîÁOÌV% U08æãD_Ø8kxWÆ×9À89ù%6á]rícé=Mk3Ûcòcþy½"SÜËëbbIfsLi~ÌT»¯½JÍ»¾Ào+w9#ß²çy/j[3G7D´Éoù=}£=Jì)ë+ù|;<)rØäþNGqÔ ðÙôuUQiò~ïPTai]þés'Å'EqáE¸/ÚÂè<P±9Æec c*ºxòMB??ÇªYD=}ñvyq=M0äVÎþûÁ¦¢°«ÒÜCÛZBÉjjä.>?£ÆT}*V¨Ñmau_Ù=@e,LzH;Í­Xç*b]H¼b)q·@=@Íõßðëv¬ñ<Õ÷S·´Bu 5_³Ù_,qèMßx=J5å¤¥ xOý@Ò¡þ\\eÝ¶½cØ§áBÑz²]Á¸è=@u,mî÷¯þÐJÜó¼Â(ÝMLäÇ·¾d<ÏÇÜ&ØyÚ=M9ÑPeËþÁGÉicôeLSÇÜ°£ËJU¿J7ó¾&£~Çaw7	Ñ=}ëé2²kèî|1»5Ó­r¬ù=MJÜ»aÆøúSx¤©|1»ç58LeUÈGy=M{Øàdgf ÅÌÎ!£Æo@ÉÒÓýH=M0¢Ké¡5£Ð¥dndL¨OÙGæ½áÝXÇÅt=@0xçúñMð¸fqOhLbÃ=J#ÆnÜqK=@9K=@kcl9¨»¡&]Ú/´ýïì@¿Yª&:´aÇÝÜU\`SKéqÔb®¼äáMÈM6SÛo½Ä[é°âÂ[ýculÌsáé@#W(âg:A§6£{Æ!³}h¢°æZ$¦di#Ôò¨¹aÄG²üiòRîºrÏòÓ¸FÂî¼&qxv>«Vc0vG4¼êãh°24îÐGa,0l8ù¢ºÐ7Î³Ö©y1¥Ýh#Ö­÷[Uqø%VwàÏ·ÓÊHOp¾TÂ'\\wÔö/éâÔ~Åtic«Ä4è$üZ>NsàÄ hms0±Ý28ý=}5Þò¤8[Éõ¥Ýÿñ±½ÅÑ­.Û­³?I8e÷ÏRwcfÜ76Ï+QGf=@<û}ÓEø¹®æ³Ð­%_±ÇéS)@ÿ\\Ý_DxÆ8åhp0~rÑËËI=@Ýg+ê¨ÿwUü eJAÉOÿ7.jÎì*ì£"þA2w¥Ïd (=@tqJýÀN39Ó¶bûUÙ;dÌî5ÿZtÀï+)0ÍxoIlµæ³3À¸«s=@°¸ÜÂÒÖ:1ØÌ^­ûî{ÆdÆ8kÃ	z26§*­8©¾ï|D½<ås=JWçêÌ^u%L¢³ûcúÎgB»ÃN£A»Ù{6¸Z<»k­.¨=@Í+'Ïo­íÞuÕpÅ Ü@xÄ=M·ÁçÌg#v«Mbô|[ ¸ÃdÜ4Ä®¥FÈËÄÀBRÜÒ¨'Z«rmÏF±×àOë¸ªJñÚý=M\\=@·ØIH!ã@åXÎÀÚ|õÓ¾ÝGñùÖæ¼øÓPü$èíËlÙÍÍÈZ)£iÑ,oåémr&YsÆ¡=@õt=J1m8dnêÀÝ#¹ò1Oy´FâóS±dÇ,rûfÓbQªòXGéýþB#÷ýkFáwûK´òûmÂ6ãOôG?´,=J¼Ýo8f,ÒbïÃ Æûo«ÿó¼1ÍbÆêób°òïQáDàO^¼'´s«Æ2Ü¸ó"ý"á]1¯ª;º3#nsÀy(¼Ç	Û¬UÍ¹ç!¶Q¨3×hX¥sÃZµÔ"¾Ï&&í!îêè	Æ¿CùáqyÑWú(f§ä$oÐ$b(YÔ9|um)åÍh	MãÑ1Þ¢Ù!\\Ë9¥v5Ù¥dZÞßàÔüo&¼=M¹:îÎÖx®Qº¸Ü«³"Ã¿À<té\\(=}(«¨Û=}ÿô×8xiþ«yÚødÐiýÓí\`uó5~ÊA£û?rxeS¼ÜQÑ?ÖIÓJXRHZø¦æÃ{N<4GySý®he± fÉ[µM-vîác/ZcFÎûª},àI1>SÜôíÌk±ñ¼E¤7í[R=JÜR;º_IÏÇÕ¶Qa	MBÃù§pPÑÛ¦ö!â¹Ô¯p÷At¼Ùaì'42õ/Få¹öÉ³S÷Äg^Ao×~ÊÒÿïvúp·ßïÝêcõãùÔÿÄDÁ¿ÃBÒÒ)wy}ÝÚµn\`-v=}mØ3Vkí<Ò{Z;,Þ?µ»Ì-Y9W%X®å=@òØsø¿ÀfbDöNÍñï{^ãô¡¬_å§['Ø(ÿ=@UÚßÕ]Mç&¯óï¼ì\`âì|\\òÉ?ÙÅ×[Ü­¡ïó(ÅÿM)8¬ÜÔàÆÁz&@k\\,ÂÖLW*æhã?Z5©¥/ü£ÕXT_-¥³2hÑÐÃâ%yáäydï=}p(ý8!ófýíjihó²úÝ*!Éx½cgÍá÷®©äí§üÇúÝë ÉàQåÞl}/i<d%±Ï¢½yëXlY)°Ì%þ_$yå5ýO0Ñ)û.%þÚ=@#yeµ°Ñ=@Q(ýY?Éy$y¢ë Çö%|ßyÁë]ê¥%ß©Lå@Í=Jov)½Q)tF@ó»OzzòtænêðÅ\\ãTl§,ìx*ëF$n¡²+èGO:Q?bõv=@[aAL¹vn9;»NÕ'nÌ ûÛÊhà-Iô³3ñcÛ¯H´Ç&£3vwxYðå½ºb3²x7ðÝ-á¾¤jóS3{pÐ\`ï$G¤»TV!3<³~	=}¸TÎLI¢ñÅÀªôwïn£É(´¥³I[=}PÌ&YAYIÚæìTäçhg(ïÖWº¹ØD»!?Zðt¢ðüA¸8¹;-kÒhòÂI¢Á×Ò'º¿pUH¼ÀYyAyu-ýÎÙk(t½ÔiÊ~é=}¯XëwqÖÞ=}èÄzÛC)Ï÷*_·G-¸ÜÏ;ve;æðûÄÂùN}ó=MÚ¡Ù¡áú ÚzJgoO¥¡>l'­Ú,13p4³#khÚVn(¥=@ò³w}hcö­8´ú\\Kñha0üø!8í %¾3ý­;¦Vb[8bX«ÿ  ü¢kë·´ìRzVøcôéJãàÃI<¾ Ä¯!DÆ*Î~éU/\\5U!o¸}hX¡Vþ}\`QT¹-Ìo{bC[Æñ=}ÝâTì°\\¤AøÉvyµíÆiÃì³tÇO\`QB5x~Vø#a»ëfÿJßÍÓÐíÑ²øð|àòp<TZsD¬DMüÎ+þð6äpVÃ®­>üû 5WañR~+w6d¶«<¿ÿH;äè^Ç9EaNô5ÏÅPÃ¸×Â¹Cdh«5,QWg¸/<IÔþt=@ï÷5ÛØé_©@=J¿FÏ¡ÞB·¡ãLz*8GG¦»ì©å±_â´^=@µä­ÑYÿlIíÁ¯âú¤^øP;P¤²S$Gæä÷àèÑ÷ççÍOêÕþHÄYélb¼X«Ö?ºÜé{ä\`ÍÌ´Øa ¬²µÜ¸Y$ç%GÁc=@ç:wjÒÏvGz[iZnÎO¥¹$r@{¤ 'X4ø,¡»à¯=@µ=Jü¢X¸S×ý_àLSålo	Dqûß¼G$8NiG7vod¦ÌÑx64ø|¤=@l;	²¢¥C½@?&>$Îb²«Ùî6Doo':'6¸[]EG]WEt¥²£±,éó&°rÚaoi°½j=}L«W[Î>çñ4Uî¬þWc{Ø¾ÝÔdÏõ.0\\¸¢ ÐÖÛwSkÅ~èI÷Öîêd5u.!¾ÆzÞ"K ºÜÄ±&Ni[´ºÏùyã¡xYEohðÆþþTßZÖ«úö7ÓM£K÷ª4 ZðÁ;^eÎ1%¯=MqÔÈ *H^E6©Ï7üÄD÷ÿ¿\`æýçæû\`ü äºÐóØ>½û2	q7öOºÑMù/â2êØuçô]ìxH©=MÐô­ÏO¹¸-´	4åÊ2¸f¼\`â3b¼µÞ¼ñD3 ¤ýâJJ¯ÏKíR©¾ùSEeöÞhÔ]$ãÛø#CÐs¦ìT?ûó/ËD\`¬5ì´¶{+Â¨^Å9³ôn:ÜÚ/9#äÇÎàä<Zvñ°Ú×Äÿ­I·A_}EðëÌW0»-îä¯¼×Ðpac~QÊsÑ,·CÁ2BÝ/ûö£r37ãÜjÐÕKæâ×A°ü»ùt¥Ç¨°°¢·5Üÿ¢SÎ/\\zJ2iyk×0w7|F<Å$ç×è|E=}Ì9Ce!Ï³vßè×yP®¢·07ùð|HÀ]ZÐz\`òæTgyv&KÐðA\\ö´q@½ãµè»ï	©áË¬xå®$ÀXKL@WËè <¥{uòÕª3ç²O}­5=}Â_\\áìÿyI Ë¼shÂaûòÊ^«yý¾(ÏwK{}ëÄü)æwÛO+ý./O¦:øI£HøtùÇÚÈÂVÀ¬»WÌë}áã&^ÎSå×owoÌ5A{Ñ¾ôÔýíãIÉo{h¤Ú6÷&"'}EÉÒÉ	'}J¹qNãÁÊÐÐýM5¡ù«²Í UbmqP¾HnF"g5m¦¨Æç±ÐX©Ðúëý8ÐÇÖï0ö·)¤åÂ»ÁÎäQÍÙ¡¢C:· Qmsº;H9WýJV-G«±øÚu³ðÜgt HBä8Y6/ÏÂÐ¾"¿ÔÕ6yÇÄOý¼§êúÒ-HÕ-PÐYªÿ%ù²ÿ©üXiýXÇXnVÄXÄ!ä^þXvA<£ËL9Yìº'«ßÅÑÍ$©õ@Þ;z'Þ2Ò¨.®u9KÊô¢×¼Þ³éRÝäÈ§,#G¬S)8K{±hå8Óh©±^©ì8Ó²A·²µÈê%òªcfÊshúËGÖ=@¾Èï{³PkW_Y¥âìsË1fG¢vÕÓûÁ=@Ó§Ð5qàÜâ~éô7ùøãÎ<Â¡þnï¦agøÓEOÏÅ	ÆAÒÊRS>ò¶@O,y=}¥®¶*0çø§_c²´Êyª8Ç1#Ðx£#©úéÅgS¸#\\wW÷: ô6úÃ° åDG? W®i<øbi(¨ï"{/ô'È|ÆWµf[b¥09/ÈFærL{ü[ÐF ë¥ü$Ø¾õ'¥þÌæáVYÂU¾d4Û9_ï<¢wA÷ü'ªG·ó½)3û>eTê~ Zóôlh3/½¶äöW´Oµüÿ/v\\êVlÓÿÔìí¼ìîë6yÆ_EÐpï$ÿ=@NÉÓnãlü >KÙêøÂe2ú¨ÑqLÌuâ%SýÐÄ8H³!Û]Ù!Üú?£öE¬ÆµiNldRÊûH/Ûr&RÆ£>¤d¶8»ßâð{ºvûáDT9¡ü/-Í-ø5ëSÕÎ,x®¢båù6¡1Æ"¦[b½I-x2­ÝXöê¥[ÆY¨0WÃÿÇ]Òé6\\'¶ýìýªÑ\`ýù*Ñ¶{ze)±Í°)ýË0£¶ãwvzh½äèåhx(d8=}EPr"Jöy&?Ò.=J¢µ±Û§ýÂBÕÞÁÏ×§2AtLÈ° ty¹s·Ã+ÚÉ«Gg3wPìbp=M	ß7ÑC)rkM=M¦¢bÕ) p«ìBÕêA¸ÏÖzÏ¼'.ªnÂÄDpxÊæ4!ÆduþÐXµø=@w+bPÝUä@p3cÍ«Þs1P¿7tØÞ­³1ë¢äêOì2°ývÐÁb«í =MÃû¦.ÜVír¹¨Ó8¤kÕCKV¶hm¼fCÍO=}§Ol0=JI!ûsôpØÜ¼Y6»°&5éCÜÞÞæ Ü»#«fäÝØå=J·máeMÝÅ{«eðÉ	Á0#¦ªÆ{X#G2¹¥Xÿ@}4Ú}_Ý5ÓÌOÜùÍ#èewçøGN¸àËÕLÌEøÞàr³Ò¶Uçµ¡\`:ÊKìå¢Q¶µ¡ûAÙ7ä\`0¼®îA0giAÇ¸Ý"¡¸Ýb0<Ým/úîdéÓyªíåö¶T¹.'ì«4cå	ß5¸òùLÐcN¼ÈÇ#Â=MìY /Ãá¸å÷Nýõ÷Î7	cáoÏ¡<úµ°^k¡Ê¨Ésnü®NÏu¨NÆ	H÷à-8Óñép9qkùFñÆáAý¢îEòÿ¤éb§& ¿×°c\`þ8ü´p¸Â§ýî³J<8c9ýô°³W*¬<ÔEÈ²ö¯½q¥qøý\`½¡aÛeµy¦tÍA"#hYô/ðáYî%Än=}Hï%Üm&óÖÁ=}l¤£}ßÞ%rÀT»ë6ÆyÙ¼ýQºY÷=@mÚqnø£ßÿq·íoà(ÆÔ uÿß'ýéi,sièkcÇ1¦à!½¦éé"ÁÁè($=Môò åûþ¦u(úfm@èéú± J7±ÝüQw=@§ñj2us9sfð~X¤"(  FïyØ%9M9çí?<|@ôÏÌi(ÿç b$Qie¥©ìi%©æ%y$ÔÁç%$E¬ÖQ©aÉ&"Éþ¦Û(§¿mZÌl´Áûâ&ËÞ¤)'NÞµ?ã¯Õ]§(?&¥ÛE¶Í%	 Í"üÙ=@)=M¡àlý©8©Û)"¯Ùî]Â4Û¬¹aX´ûQÇç6½ÓäÇ(Þ¦©Ëíä§2ÊÌGû8=@¦ÝóÚé©B41ëbÙõ¢)Å¿Gg|gÍ3Äy	!'OÛ]²£»I,ñÝþéXÑ Ù¥Ç%*½dû^có,½Ôuþ|iEE«½ç=MÓ@¨¿hµòHj-Ë\\?òÃæà^±y MÛ%ÝúQ»6eeI¶ÅºÁwdü:Üöà©¦ïéfaÌbÀôU ¨Îðt"Vh]q(½æ'á³9iäa\`çÃée Éói#Ívº©ø¹þÑã\\%óq1 ¨÷_å¿a	²çiµóÄ´±h¤#Ï%³±9+s%¶U|v'ÊR+á´ýS!¼=@ =M58´8Aî@ã´T,ÜÍ,tñYÊ1=M|®%¬åMºýz@§ò¦ß¢÷÷Yw ÌaóeËýñ-À#F#t£îUÆø<ª!_¦Òõ	ÀBóñ¢fÅ¸Ø:íá±õø©vÃ4ÍJ7ÚåýUöÁ¥Ádfc|Ã¶ªËü{ÖJµõUÍFûZM[eå¼çjiYZÔ¿±8h~¦nNi}%Êf=}f=J­"U'h{zÞ¹}§w/oØi=MªÞïý¶)ÔòÎq¹æ=J=Jî~3¬@·@þ,ÏMhÅÆ5y{COx	Øû´ásÄôúNñZ1pN^<¨vCúãÈ	vç)ÚMV¹.ó«ð"e)­	\\ºxeiÁ¢Tæj¶Âñ¦µ·C¾¶ÅMoÜ'éÕ¯xýÄskW@¾áSû×yÄ_ÔÕÇIÚù=JâgÝj&'/ãòL¸çÄ_&e¨óO¥[eÃÓùgùZrqxd=}¬F.\`RÃ9¡Ä¹KO\\Âî)ö«n~Ço¥)p_ùO¤¸\\å,øÁG?B-ö?öå4Ð)@¨öTR·[ÿÙ1Êåd{_Áj¾òwTèìæÈ=MZþFôQ5±hc> ì/k$ôþX9Ìhó*Ø~«Rª\\ÿOGÃ°L^úo»¦ö5»K;Udé¢±®åQ«=MçMVç¦ÔhCx>aw·ö·cv,í?¥jéÍ|!s¡ý[TÀþ}µã=@<µùlë"HaLl³<IÕÈàPhgt- ×<àqøÃ½gFQyØ»Ö\\Ç¡\\¯ûYcIsÉºØÄì§éMsÁ^e<èøø{ö<¿À<Ý!7ø}ÀzlF	+×ÁcDýþJÄ{#áL5ÝéÐl5áö7T~ÆgXZ¥R»°$5¾IÂPQÀD-ÊðXNeqF$ÖC|aIí0Â(gÉÁP¯÷¸fi×ö¤p3-å/&Ç·â°º#¢(ñ1©¡Ð¬ÿ¸o©$ö#qXóýýØÁiÛoø¤£AkJÙ(yË´ÆÍ=@ ¥]ð?÷5¾7cN#t§[ÚG¾9E(J·²ozÊÒ¯p¾WLÅ×.Ãicº@E%/F¥nåÿ¯U ¨L:	¸è#ÐrÞú¾Ô´qâgØ«väDÍ÷Ã,Ýã! (UnÐÚ÷	øQ½-á7é#¢4º*6\\¡4q¢rÁ=M­Bôl÷¦ßÿØ<ÛngO¦ËÁµ¼èZ=M\`¶g>ýÈ§c±$Ä>Ýx-ôéçN</xcÅl]ü ¨ ëÃ´£[©0IZE:½³Ñ	[Yµø½KC)(¿÷øé»=@¯é	%5é'Ó	=@b×N»ÅNy{ùëÑj,5ÿDÅäÔ)þéç!)Ë÷@TyrÂ!¥uÔÿÅ«kæFùcþ£µqAãÕëH'Ö0þUF+,-ôa1ÍdÁâé@´¯çowW­óbt-r3§Ë&ÉY«Õ	FµTS),0Ñå?ìôr¹)o¤"×O³ÏúâcmÐ»c,v(E¶ä©FÂ¦rdËÖø»àÔÜQÙ/$,/kËh-|ÖØqZCá/Ê,Ûìé Ý#oÔo¸éãa±ôÚ.ßôÚ>¥>g=@MvF_Æ 2?¤¿®øÈÅNÜ\`¢è³óÚ¶ºú\`9ÍälÏ'Õ´OøpKì=M$ZgÑÊXÅå´ßí8Ñ¼Âµ0¤ÇLXSâ/=@þ!Ãm3]+ ÙØ¡VÏyßãW¶£çEÄÎUgáa×\\5é¸{Áû=@Í{rÍúoÝ{·C©¿=M>¥ñ¢4ÑZø	 ÍeÈõedCTÆ×ôV<å*ê"°%fAy!rWP¦Iz2S°Æ¯¿fKýøg	¤=@:Üñ¡þ3Elc.í&¬µ°äú&º¦ÈpiE#M)Ñ÷Á£É5mìÛ×ñÀY²ÞåP÷SÊç"Ü&3°¯ó=M*=JÏrþpµ	Ð^5^áÉ>Ò 9Â!ø¶jÍrg4§T¬?$þýÖ¢­þóÊM4®Í5(ÿÎu3^Þ;4a<þçÄ]ÂÉF"MaR¶´·ÓS@1¡0VÆÄ3g_JtGÉï?Æ#ñ9ÑÃ­oå©Ý"@)òçIøe´|(GI¹yeÏÜ|Ó|¨õËA÷ºòâà(«áÊH¡òù+ÿ?wú,)î\`Íàuß®ÈdB·\`s½ñaè5¨|LüÃòX|üL^»AÓe[ôõp?Q\`Ï3e?&B£º)$¡a]¦þÃ\`£vßºmöx²"Qì&«5Ò2ÉOVíåûy;Ô		*z¯í1\`3qÜC{B6ÛNº9®Õ¯ùÇZÅZOÁØÅ;çc<5÷©KO%q±ÝµÉ¾Þ¥iäÒçSðÏAçL¨¸îf_+â»Ûm»7=@²ß¡+É)]±1¡qÓg!Â	ÕÈíµü=@ÇécY¤Eä7÷¡ÌX7§QA|\`72õjÙÔ¼s¶¶­Ç­BFÞÃIc¸k^ñ=}ëò7¸Þö=J:p=Jó^ö)=J¦<=MðD{Hê9Öl©=@Ä o;1ßu­þÝäª=}ÔD»ñ9®ZøÁFêú3ñþ¡âÕÛ±iØqg=}°0¦Nu®þa¬ü£«9ùé=M9i4E1ëp}uÑ4\`ÀçWqP	¡HàcÑôÀ÷S³×úvF7øé;#ý¬0­\`çiÏ!''¨êµøÊá@»³@ÓÚÈ"Dà©çãlFI¬Ëßªëe¼APüpJç\`pa¢E´?¢Mãº"* ýsÃõÆÉ¹.=MFW?)#5ò=J1´Hÿ0|Iõõ\\DL:ëµéÅÍ4f¶ÖÐ2åyôâïXå!scºÓ^¥ t+½?^ÆãÓæMÅúVÔ·gºð"=JuYÆÂ¸£ÇT½íîÐXúÔÏ-î_Oê¶O¦ø pï,ès^ +¾ÜCC¾ ÒXÐü7gA¸=JYlñð4»¸×àÙ,l¡ÃEZÿJ}ýÀ° BYòG\`ÙCÀèÂæõToð5VAfuüF6+©nÔN\`MÕ{÷=}?KÔdÍä÷wÈF{(9ÂÕ³,kBs¾pÎêäucë9 <=M¦û~ä^áäÞþï©Ï|A)'; i uÏÊ~4ì|IMXåû_ìl>É4îÌÜsÌQÏl¬Ñµ.*,äeë·8âð!sê-<Êä=Ml	Ï¶b£½i,q£ÀióÈVd¢Ãà$(¥àqöa8õzoéÚ£Ýãp%eÿ°1Ü÷ÿø&@3ñ×¿ýØýQL÷¦8Àøæ²oy'¹Ðß?òF]Àâ¿fSRà"|¼~öªÑ®L´ê¡-à5å³ãPL²W©sJù4\`6æ¢iÁÑ¶çºfáX=Jg©å&ÊGs¤ÝËf¼n½±¨ÈE^ã§WÉ!U©¬+ú=M¶ãµrbñjÈ#b½Ø®ø~ÖeVzÚ!$Hhæ¨~a{ýXñ·TÓ6èâ¼&ïb£w¡tó÷MF©Ñ)]¡+ ¿'éÖ¡ÀeÃV½vª]ÁJ=}¼j422]Pª:+?ÕÌl¶S@l0.µDJ.ÔK\`o¯JCC@/;tÊ²î,¬¬B4nJéù!£ã½3<$q©È!V(hhõ!8f=Mnrü¹J÷igâû Ùî9t_5Ô6gKqý;9÷fQJIÄÇ«\\!6/õ®t´VnJYSÊÁn¿":Ã(å«SP1b¨Ä}ößÝ=Mª-ö¹BbC8p^È]ÍVûSÐ·MäPhë¨ZÄKVÞÂ·4>×>	}$ñäÁzÙÊ¥ÚºïµÁú{ô«ÇNÄ¼ftÐ¾YxùüÿQ1]}´ÊªÖ?QÇüÒ*VÔÃk:øýuóLB¾ã,NH>K$¸ËÒ½éÉ}A\\(ÚVÌÑ5uµ@)ä0(öëëõK³x4UòmõVX³½Ð!l¾ö¼Oç]R"Òt\`pW>û7ÇñéL Í>ï=@^¨æô¥õ¬ á]"!(Õù,WîÙûÄv$±ÄîþKsOöáÐ×(Ëäq|ëyU"p3×:÷¹b-N§$¬JÅ/Â°?¶ú=@P@tÏ@æ=@5ûækFÍe}6ùÚùkvpQ°ßþ¬áÕYÅA-Dhó4úzùtc =MâçâÈ89+ºB§	¨¡mÐîÑ>fÈÆù ¼à=J-üøú5EÙ(hôÝhíÙXd0·¸â4¤s}î|?Us7O Ö($#PbNo(Î®sÎÉl?\`J°NdyX¡oÐ¥<ã´º±Ëìcûú4c¸ë+¸ÖiëhAHOeã·ÌjQq?ÜÎúªò¡=}®õ$ÆÝ·Dú2b¼Ìß´¯+éÑv«Ï]Ál3§ü¢ÿõàÅ]äE=}vV,<U=M5Id&s¥sDïÁ|ôj¦ö×°o«ù4ÐN´Tp=JäÍ!Äm;ÍLÔ[)®:Èó$=M¤ÕÇáëX-=M4Äãïµ§¥´|#5"ÍÏÄ7§,2Ù0j¤Ï¡Ø×ýàJ*{¯ãr@î¿!£×A(=@lCþVÒëntÜ:$3¢ÂrãMVgC¡^âüÑØÞö]ò¦ç+k0¸´«T§/YÐ|p5Þè6w"ÍÌ|YiÙèá¹ÆÖï°ûýz}°vv]±1ö°\`$î²$ÙØæªý«¨óvaëÒÅíuQ­y\`kÒÈÊ=}Õ©XþN;qe´zïsí³èHhåfÞô·´Í·ÜìpSi_=M|9P7®w=Mþû1Z·¦c]G}¥¶/®:¯á8³ï\\åÃBh§ÀÒA¯\`~q±>?¥LW¥ \\¥|é6«[ßÝ|Øù)Ç=J¼®\`5í{ó,¥jÁJ/ B´îWq´scQºå²ùMÏDüútÜ<Û,áïù¡tHõ.ãÃê"3ý7+/8zV$>Å«=M½GÈ:Ë¤Þ¦ÛÀÒ5/ßr{»WLGBèÍa+ZÌ×¸XÛò&&ÜFÃ¨ßj¸ß§üñ'v ¤>xðZçoßé{¹Ê5\\~%w2£1ÞªoÊé-qv\\»º[·¼QþÈYÁþùr¢úIz|ÛjkÃÌ&²Á]øzõ3w/ h]¿"ÿö¿ç@ÀWäKß_$@Ç±=JÏoX548ÑEp³Ö2×,ýEÉ(»{é*3ÓZKi	¶£îs!4+"£SèIy¦U|º?ÀÂSà çNd<. ¥dÙ<Én×Ê½æJwåÝÐ pÄ:TUTÝ;é|Å§ý=M@5á±ñäEÈ1æm)ÿ§IÔ¬ö 'Þñ(ýÌççûü%ÌÞk­m=JX¿¬àO­ÚëÕ£=MÁBTEmBMäßvoçÛÖ{³}©RÍ±Usrb#Pÿ«ØQÿ3¾Æ¢:ß8ÿÃs¯Ûw²øWUSöf·sgßC´Õ¸RÖ¸°sGaEåT"7ß4$\`Ñ(ò$U\\'Úk\`¡nE³2SÅ3R=}öâºae=Jé:ægCÃ^uå³2ËéNÃ·qm%bËaûØXÖx#²¯kÁ\`2ÔT1wÔMéWÊ¼hoÐ.Fþ\`rB[æÎèÌÓu¯zé;ër´ï¡³¨ò\\¾CH:õj´Ò¢S¾]®aðÒ¸RÇÇ»JÞñÀ ßCcf¼ÄÚ÷LîÅ©Ñücöee§Ue]8wDÎ(þ7õÕ4²S|ÜjÑ*´Õ¨2°Vê!LhpØ_h{1ïlq@â<ßç8Ï¸á?;ý|sDWTÓöoaWÀP}¢wþ±Ã ßôT¢9ß³v0òO©XKInQwDÁþõÐ@HB+¸ÕWöã×@[oöºÐHî]ã«ãÕWMí¾áv§$¹hz^m0²ßýsejpýdq£°t=}¢ül^=}Û#q=}¿7¤ÞE¸æ¼B~3î@}\\ìj/8a/ôk=}<wwú|×@0ß $æUº°ÃåxÂ°åDÀÂ°ÃòßÐ!óölÅ\\Ú=@xÿs²S³t d´ìYÃ_Ôd]ý2ò³¤'~Ë©/éV^¾J(_üOëUáéË9ªÞ¢ÞhµÑÊñs@V5èÝ{6g©²ðFÁ¾°ëä°æ®AQæï&íCêô6â§ÚÏî#õN.0×÷|ØÅ²´¨"ÇQ¼7ëv¿0&<ÓÒ/±DÜóÅæÌÄYUICsb!àÞ3[ÔN¥!÷^ÝñlÊþ\\ö¨=MOùÖ¤¼ô¤O§5ÃPDàWKùûÈPó^óJ=@º~´¢ß6\`v¼ëd\\ú!@ä¼ðO¼cZXürüPbe	cKõ=M½èdú-Êêæk÷ÿô%ýªs»´²y¹ F«AcJ9Ú'bM=Jf$TDë\\¶PòWþ¥fÉõó'·:Ï=}öô2¬.-fp +­nÞ; ÓM&¢ÓpvòÕ¯Vgïd«3yfÑ>k]áãAmå:Ê©6{½=MË©òõÒ>yÖç^xøáÚ"¡mª$Ù ¢¤Ü	×NE¼X½w2Ë±¡õá{X*pXÐñå¶ú4@ùùvRâÿ7TÂ¹Þ£Ý}¬lÂNÙQ;)oyÞcÍõØh5Iù®Î»I!BÇì£Ù	ù¥;'éódPe¦±³â\\uoâ¬Ûùn¬+6õÜÖØv=@´Vç=}>~,KîàøV vËÓÝ½¹I¾È¯³&.LpÿOIù_¢$ó¨<ûË®³ÿÏ-Ã{ðVÄv¬öêLéãXÿÅ[NmoAöZi¼>EDÅjºÃ<)Hg=@mPìÜBêC/kÄ s§E&x>Îi¥ª&"ªEµ\`îéngÒ)F<HýG93ÿ>þÖUí9h=J°³9òj®=}YûïëÒ£Ü70p|uÉ¨|'cÈ\`ÕíÝ½d+×ö¬nM¸Öñ4]z=}Ì ÂcÝèaWk¹¨DÛþjÕæ6w5ºfªÏIVn ÚY6Js¢\`Ó­îE~=J¶î¬Óuá·ÌARo7Ì=M?PûàsÉ­¦cCñVî}Ç=J~Vÿ7r ieÍó«-ÈÒjHÃ2År:ÚúÝÜª¿sè8ýÊ;mó\\IVIá¤[ÁÀú>ê-¦Õ$üá¨§(´$Û}Ü3õ¸¸¼L³ÐtWÔt)z47=Jzø x$=MG=@m)úO~wÿÅ# uàÈ¸ºè§ÙËÿé6ÐÃy\`?øêmz³åßzKã£{ÒñÄ^~º°" Á1=}{é¡ ÖVed·®JëÂ|à$«û,ÿÝÞ¨Eû~am=@ äI\\ç»åÍ/ºa ,ämò¸¯@ÇÛVº±¦¦0q?þFÍB71;oÂjv&W¹ëf×\`FWY¯ÀaæÈÝ9È¶ôãÞäÉ"¥àÁÕÜËLøU_@Mä0'Öí]4þjèçÙàtn¹°Õ½Ä q~%ùðZVÿ!Åj§2çD´´=J\\pÍi¯½º=@D¸ö%õ\`ùÓr@.':¾ÎÞï¼Ú/©­Ç¦ûT\`Èâfá¢Tc©ã]ïAF=MÉ;tôh	8Ks3-F,Ûã±ØöCA®øàêµî²Òþ'#¿ÊoóÐfUVOåO9HN8|@½©ìn¯3ñkÂ%Wöm¦ëµc+|#lÜ@Îø°×î4ÙKh=MïÆìÞ¿~"6¾ó7´ÇNÏ.fÈù+j»#í8ñ_g	Híóeï´)¤ýBñ ìØ¬sMbÂjÌjtÈ}iW­ìFFÛ9ÅïnÇZ³¬¦¿' \\ÏÞ-nºµ	eÕÒpt)¨eY¿Pñ¼üt[À4Au¡~ýî_ÉòôLÀ½ [Ö¿Ø[öÐ¼[vT½~ÎÂ¶ê´ªÏ¶|²£=MñÖwV¤Õ°b!^Ö¯"¬iÚSwÚG6U}¹\`Ö7hÖùìBrVGµÒºnûELjÌß»wµ¹Ç_ÛõÆ=}äp^|¾±ñ<5-y7]KI[mZ­ç¸«Ö>dÌ#Z¾¸×ª.«4O¥»x8Ê®	ñ^ÆË55U>í# «Ü&Ô.¿6ÓOmÀWRÜN]ì¾=@ëÀlÀ$®?ßFÆõX&$ÐC­î¨?©¿-~uæÃüWrN08¢Ò²a/(­ÈÆ=}Ã"o]{Â6¶âÐãófø/ON¢,U*b*_n2R|æû,z¦såsøÖòlîcðáJÈ³!ÿVR¢&¥­WÝº­LX~@b=}"»V¹Åî+T´Z!DVÛ~73´CÏ¢+ÐÝ=J4EXJ=})ÔOhG@ÿvýjÉ]ûC/ôö\\¨®ì°h»9ó3½àÒ³×::_òÕsâP:Jðf<ôCdÝÚúµò5ÐþaùZHç:wmÔN@\`"<-Cüwõ®Ì7d ¸÷lçM>Ánè<7ü6zÂOí¤#¤ÐÆÆÒÕ=M¯L½yr¼:5ÅÍ_¹O&¼}Ñ¸dÎôW<cÙIíîàTJÆÈÂáÝ>5óf$~½¸ÄxôkÅC*R^÷ejü=@°¤ÌM2QâöPÆÛÆ-Ïz·í§Ý-b-;ÂDhw_ÄUü$çÅ0tµÌþ¡sñ¦Ê6êâ°	âôJ@,]Bß¢Vù[RVz[ôDáð|ãøGuj¸øI±¦Æ>ª6¥ÛÚ´ö¾§%"±%ñc®/Û|áJºG#3¸[_ñ\`¡^k56TðÈ<-~ÆÁÞÆðÿxLOÆüy¶À\`_fÙöf&Â"ä­÷öã¤»}óÃLéä_Ì8Ò®d>¾zïªÒ¨CeV>&¯-SrOYßÜSvóñ§ÛÊnd¤½på'bØ#§6lq?U]è¸Õ2arS]=J´MwrTnåÚëà%@ÒEß®d³¥¡_Ði­ôt[c¨é5Í'^/À2¨Î{ðë Ïåæ¿ò7¯E}B%>çºû!å>)~¡Mc=}»÷Ä²¦V9ëÿò%3Zk¸rÀu_x[=Md¿J.þ3{àßµÈaF?+ªQà$/ùÃ}´¢¼8*¿"cwBÕEy,Ý]@¯­7J+nÉ>ä:½¥Åîh¾h+.áÚl¼¿=JÃ)¶b¡gCÏÑßÈw¦ÕZ¡$ôí°²aë+/l	ò*Y§´<ÂÜ|N4>Èº­îfÐ2Á(÷°»â³£ÙôÛ ñÇð2oI"DvÚºWdS°V\\úEØÒcÚ³&æÜbë¨+Áí6®=@o'a#D§¸OýXµ.[¼ü¦3Ý=MT¤¤¡9ë¸\\§»¾·2_ùC	©~QÈþh^éè¿déÅ-î´õRÑ=MÐtÀöÜ¨ÖëÙ«:NDf%,Ät/¼öEÐ¬okìv{ØÂahKt¼%^ÄPÏÝyÂ^=}]§_sÉ=M÷%ðá1ÁÎ=Jà¾%õO(¼½Éµ"Õ"HWÝx6c²/m	~6;×BTzÖc}]¾Á 9º0Äìo=Jµ´ø¯ÂôØXÁb¢Æ-¸/+Z¥6ôp¨§þaËÁðÚ°äÝSç¯S²â¯¸¬Æc¾¥Å£§ÆqÇIÒ±c/ÂÜo¯=}ì¡M!ñ@´ß&vè²?þ#¯¸Û³3BöÏ$ï¼\`e\`i	N=}¥Uóµë^\\gc#OØ»ÖR aqAÓw	¿á%#ïÑnýÈ¥µqÆwâH|P´-z	q%/ËÍ:f{Í"¯AWÎù³è¡ýé+x¿J?×-ì4þOÏñ©¢Ã()»¢¬:-ÓU¢ª^Ä°9©øwX¡qRl2Uò¡;½|Ú=JðÐõ±s*¨¼Ûþø0yÖ"©}[ÂÏu¡=Mrÿ£oG÷YibÁ¬=J¶UÏ:PÛýïæ[flÁE´Ñö±@'b¹íNÅ^-m¬±´â%L#vXlÂóñ}\\XKßûmå©ÛbqVR¾AæAÐì8vWKqu8f¬<®"ñªá=MheÖî()²b:üsIËôh´3©´s÷ó5ÆÀ¡è#Ghñ¹@ôÙq©)%ôZ§¯¢h®J÷H=J÷Zá;jÓÀ¢KOC¨m^ä:à&~ë[É\`ít¬Hx¡UN\`õ¨S~vt¡Á¦¸ö>g³Aªz?ï·Ç  åüoýZBM£ÕTv¼ÄçÆ{b{}Ç=M7 ¢Éãÿn/öü²AãUp7ElôïÁSÓµßóï_s"Ç´ëÅ ¤TJèôèí¤À¿¯S5-jËBém¨k£æhuéøýp îç  ²üÜÎ,_îòÇÿú(<síóHU®÷=MÅ~ËÊüSfzë[DxÏ/âÍ3Û)^¬À¶ÝûaET©1ùLGBúÿªDëþ¹i´EØÊ8uÊcêµ0m!4Á2EÜsEìîab=M}_¹òæ$=MÖ<ÑBN¾±I5\`Ðúj}ö}¿ÙÁb&(ÒK	.½HZ6D¥åì]±;dg2\\MhL¢­;ög¸)T|óN×5\`ªRüÁ=Jê Iû¢ß:>Sp2Zøº¢}¨S&ªÔ¬Ë¹LÀõv b²üdwÜvÜ;¥Í¸ìûq3ðaÀH0º}¯B)ë9;$â³Ýp®½´¤:©#2LÐ}Ò*g÷ ðµ>¦%ç4Îk¤õ=MÌB0Biðîl?&ÖDÔÙb"ÛÑI^2]°/\\iÏzåóþVüWáÉõ·ÁÑ1cHb{óÕc		µÕÛø5¥±¤v¢Ù£Ùâ´´%^sùSg±Ù gñ3©ûÏúRö¬PÇXÅDSØqô÷_ÕéJ7¸ß"!²_ì8¡Ò«êÉ¯¸p\`ßlÓ²V±¨Cò|²4­#«híYRè(ÛJÂ=@þ±óìE¥<QQ&³}ø?füþÌÒ_E ,ý¶¬ÁÉ7l =}ýpÅôå·¯¦*Và®Îd^¿°Ç÷bR\`µc»¦¢¿e@TRKyEâ´1eÅÑ÷Ë¨(É	¨õ=M«çYaáîêl1tAìsË©=}_Ø¡S²´¶öEbn§ºÛ®Y\\Zâ·5v©ò¢:âÐÔR.7=}Gõz;¼ûr·¯ö¦/'Áë´p*w»v¹«rûÖÏSÂ=M&ì\`oëü"ï°\`õÛ<Ú¼Û%=}\\\\óAµ×8¸È¸y9AYMB¹êé#þ¶øá%ÞBÉ]äô)HEié÷Ý#W^?»©¬é¢8IÄ\`ÔñåÜåVó²Ñ&¼ÏÐÉodl«l¹@ÚÞuÿÀÅN#¾é}V>c/ö=}¸ß¸F±%Æxó;¶U½=MÿþÅJ¸÷úçþ&]ó:"°ÓP;îùv0],êX³væfV±"¸dà®TcÈOàüºå*/tçê ¾×za/hxrbjjÐãe¨#C#®ë°îUÆ:¸0¿½+8ÇÎ³ìO|P®ÀºÍÊØ¼@ìÖ5¹2ò®G·&_F­Ë½£ö³¡ÚPåL2íHÒÂÀeOßÖJ+½DöIÆÍÏôa£(=JJýýaUc¥$°§áÿ¿k^QB§~UOÄÕí÷ÓËû#sêøtM~À2.¨WLÝsrgOá"eÀÔFóéíõÍkOWA=@:ÅO,cüúÇEz~Áín´w®§L+m=MáºÄ'Í°úùSPC§['»CõsÇy7Â¨ºn R£Pè=Mÿ½AÒ²¨Òír&-ö\`ÝôkZ°¸Yrp-wºL(h	ÒZHYz%Ü*ó.D¿n*«øIWU8#$Bõ¸\`ü·Þ5NÔû_ôh083?¶-QÝHÆÃûnK!Ç¹éE_°-¹Ù/¨XÐ\\<ÕF3#\\@~#wdx[_º¢®!ø#Õ°éq:K\\+Ñ\\ò_¢©>ªé¡r¾c:Ò¤VL½E¤µY÷_:		»=@)r¦ZÞK=}ØmÖEÇÙÓâ>f	®Í°g6ñu­á ËÙÓ´ÉräðÙ»c2OvÞ©ÊÒ=}=}%úÂ»mc8"×j£¶Ï	ù·rõ¹¾´ºý´lÈy¬CþÀfqö-O¨t{À:RäûËé=}(4qNÜçír2äº£ö¥U2ÅBÞýÙ5bm4uoþmßô=MÁ<Õ"§dK¦gB¶ÈLIÊùÿmä¦²+Ø@<@Sª°^±m¿mí°¤ËM¬zîN°³R¸÷<oTÎ*WBb3òÙasÆj:vÎÇí,9©ó\\o­ÅO.áæ®£ÖFµ=M¼0ñëÞõ¡dkìxw[þI3¾ÆøìÍ×Ô-ÏµlÁí¹ÛL\`ý<~¤c1YNBlüàCS\\DËzÐVwJFÂZÝ65"=JÒ£yÙ¾dîqWÀÜ²ßÊ«¨1õQëÈÏM®Ù¦ýÐy9=Mê/úC¸gU'0MÍUPóå·ý8@ÄP¨¬£R=MªâÃ]îw.îwüHQlËá¬üJì~ÍIóø=JaT|á=}ßA®MËXÂ\\ëªÁËÈG8 ²\`:àÁL¦2%J²¯Q¼dXyÏì ÏÇ×R©ª\`â©Ô AAv=Mæwî"xSösÅ¹øÓDºÍú®Â kíb)ÛZKÔ7­ý«#>Ü½OÏ{Òô¤1^#·e1ßñþWI»'~êAýv<F\\|0vM6ÄVIÃ+N#2Úq#VOIEXR+¥ë¬¹¡ÀPÙþ;oæ·Ah÷8D<Þ\`á9ã&j;=Mh[ë[Ç]F$¾.&Aêã8ug¤ðIsIËýMv'®¸È+tçó§©°ÄÜlyð=Mº©3ýËûÿäÙå8.5JÖÂa¦cÝ½ÈÞ¯rá9[¿0¤ôØ\\ø»+û\`õFÊsËÈürzzÜ¡=@\`~ÿÚõ\`~=MOwujÉ»0("CE¥qÍÿÖ6ÞAFç»%ÄpðjñêýDlè?O>è&VIHÄ=}ÙãW;ñâ@k¥=J°Á'0K2ÕF8+k¤ÆURÙõ=}pÆQêÄÊú³UÀ"mèB+H*z­=}=M|Ö´´û½cÓ^.ÙóÔ±¼.×n:M­vZñz¡±B®ÃæHpÿçBoGÜÓ«8äÐú®ºä2r_ú.ÜÍ¢Ð¡À×Ó]¯;M[*ÈBV¾áÿ@ñ»~ãk36[á6ÉYC K¿	CXÙ<Mò7ÂóGv #·uËJ¹a¸6u£GÆé%aûrLÏ?ÿÙ*¦ñú[=MøÂçÅåÜb¯~¹R»ÕFq¶4Ê¥TZ$ Ú«5ë½íÂ=MÀåMÆøU¾oÎ8°ò2=Jùµ÷Þù57A÷Ié9c=J¹	±ñ]"=M!¤à	1ÏÈi¨©¸Ø"§t"=M!3öIééz5'((ä	IÎ­&(ªØ1=@N¯k@þmÓ?Âb7ÿp­§Q\`_æ½Ü÷òg?½ÿÔÌw{Z$~KA¡=@dÖÒìVð[s»Ã	Ó9üjÕfÊ_b5¡8t~ìÇ'ýe}íÇ¯ÇÈ¨¤ âýÉ³ìÇcGå¼ðOç5Ôdçc4¨eçÏt?ÁÛÄSp¤ñYï¤ñÒÁVíA½$Çvy¤IPÍóÐ%Üè Ì4X0«¢W¼Ì4Ìòïµ¦óµóR!Wx¾gKDí¯,dýWýfäQiÆ$n²Ê[Þ=M\\j8´ÔáÐÝÎÂ ýã¬Â×sFÃWÕÙê"Y·ª?;Ñï0¾;«Þiã÷b[¢ü]ôÊ!¸<·ÇíÐõxJ(¶eB®ðK¯4l ÄBÌA÷ªðÄw»7SûÈÈæ¥õäõã H	U($ýïû¥yº(äñé«PÅb)æØv"#³©BÄX½ªfî|>jÊ»t#dÝ¹²[¥ªåHç=M>ÑUêÑ¥¢ÿÌìm¶a¶~eFñBF,kB¨Z47ÌYeMnÎ*I³5,ã	/en£»gó°ÊÂRÁèà×­q¶eoÑ2nÕ|ª¬C24.ÿ´sõÚpJy6ÁÌ¨¼YV<k¸,Ö_î	ÛTPêAêâ¬=}ìk¦=M¦j¦Ê½¨8õÀ7:°¦³îEHºúà*xcvDæR.ÐÓÔ5åê'^d+®õx\\Ù¯Mò²üï-Ð­OÁQ\` nÿí,î°èÛÛUZÍ1ªÝå´%0÷$.·áJ=}dðw¹Ö¿ü±a;¢}0Ë'úûX>/Åy¥¶Ôì*6µjøÀ~U^cZ8Ë¨lÚ¡E)íàê²àhúÃýàf\\»r³Èd4À{aÐ¨ýJi.dü´å=@Zº=MHj=M·£DnÕ>¢V¤§((j.<ÖXz¬/M=Jù¸ÕÒ4$q(Ý7¹CÒ:ù)°qåcÝ®'Cz'@ÌLZqd}/,Õ26=@Ð,3<Y-/pIPx^^u6à¡ßkëT§ÆÔc9Cºn+ÏQ]ÃDÚyæT° <Àr=@ã?dLÖØb¿ôÖ:sâ.mJ}|Ógïó÷Ö*¶ñYîøHUîh8_ÕÍn¨áÅþ^.dzpá¯ô!Ów\`]»ö<É?»Q $üI¯Þð?of³ÄÚOÐs·ã{BóÆ%µU]£Í­Ø_zOYÑÌBi£{1µ~{>D5Aµ%2Ü*ÂU@EÈ"eyRÒ=@íÃ|\`Lò$Îmºn2-b¾=}$Y@ÁG	 ¢Á,Cff~F37á\\Çtwü_ÄBþV¸´f«äæäàPîôþvwä	â§O7°àÕcÌß¬¶¸y@ÇàµbWNR~ERßI±÷G¨âú; òðjÆ WHCäzÜÎc²E2«ÈÃÈlþþ+¯íOæUºtö<$&Z:OãOYÛöXw]Urc}iÛ[/ÅZÛÍ4oãwäÝoçÙsÂàc¬7.KÒÜ²y×ÝÄº îà½÷<i7¯y50{¹wî¼Q/ÊÊ+W½@;Ä?@JS5¿ËüFùVý^)Øv\\ú^TÝd×ñ[3Ç7ÇÝ}Ã*aüáÃì¦y$Ä³ÀNnð[Ì=@±¯c S=@1ñnÄVÀ°ªs\\4\\tÄ»ËÖÿPQ/P>³<eÁ^;%/eDí-SruÃÜë¾LY³Uö¸Ì BÚru{Às°L%Øý] *ùÂ¶)¨<sÇlþ^ûJ²Â´ñ T8fçkß g	þn¬;=@À-C0ÉVÎ®ì;vÃCòåXÝÍÞïÐ·Øv@»×WöÆé=@ZFúù­-íïãrmU3ÙNó:óæûï¼p7òRâ}g>pÚ©?£°=@:<p$ô´ã4ªÍ¯+ySìÍÃ¿¾jL÷EJûRÐ2mlY£(ºéfý7.I0¾cÎ	+ïú¹4qð}ÀSI39=J=}foz-B/K{êL½áIlÕ¥p·$éò¹µ¥p'AT]p.IôbLM°lmHõ3©¯ÝR%õÕ­Üa®o59÷ìò£ÁÈ¢ý /=JDH­0³þÙdÎ8jB³80Êë+EðF¢Áâ·oZdæç1ôbÝNûþ´>ûÖ²«qªÛ«Ns=JÌVû­ÉP"4@&dÕõbÑî´è:=@/mä|Ãh	=}mj¤ý´û2òÕøÈûÕý8³ý¢E]£y^lñVS[=}s©äQÎBC´ÎÿNFÜ¡r»ó~Ä¦ãæ5ËåÓxÖ@¥âD£ßÌÞ£à=M[Ò@í,.Z@\\Øý>^ì±ö6^ÿîFRwêº-Gû0*^Å²íµæ¿Þ ÕPìe_¯u77í	ùEÀÞ2u\`©­@¿ço4ï·Rÿá²¡Þ¬\`,}ÈÔ]·ó¯ðÒðRØßÑÉÑ£a"ÎK\\Ó°z]_î7»b\\r2îøMBþDLKÞ!A¸ËG\`yÖGoVHÕÉÿ·ïÃþ/~§¶²7ü;P¿AÙk¥³ä+=MÓ¸V=JcFzBúEh¶ã1dì´5egÒNIuä¶¡²¿Y3vE©¶:/}öJJ}Ô÷å1#C^Á÷ný°ÎÖ\\|@A|f)ÒFÐB(ÆºGöÎ_ábhoÇí{!Ú6½bXOîöÿ}=}ãr©©$Ôu@3Ô=MÀûÀYÀ$(\`ñw¼ÚcYÄyµgÿplþ­Ü\`TBsàÄÙ_ìV_©ÞÑ	ßè»À³]W¼³RwÊ['¤zaÉ«8KÑ;ùÉð\`.¦.mýL  4Å×Û¡°=@ÿFo÷oFÀ·Ô:ùã¯ÜrÕèÆT?Äö5k>zÓ=}ÒË(óV!ÿf»2$TisèWÙÝWañn©?XãZòÕÝy7¤@Dèebñ{X{{q¥Þ¨Ðê5/<4ü,÷!Y=J*Â¾s_ÿ·öoÐ¢ßÃ=@øó5±Õ¦óà=@?·dj)¸,[=M×ò¼p°Ð"ñ¬±WÁÖ=@Ñ$"¾@ùO=MþQk=@YD¹ ùJægy?9RëèócúUw@ÅG2ûI=JÛ=J=M-bºÓ+{Þl ýÇæ{Çì6ns|WWö¼v>m}ï¿²6àõLK{Íåð=@1G»F6ËDþß^Ý4Låìæ2@æ^8ßÚOW¿ïÆ.F§ö*;½ÛÞu¦»ÿ6=}ÏzíÄ*±Wðâ«.ùL×Ó¯1øÚD´"A%ï¥=}Õuãk+úrWz.ÇdU¥oÜ :ZÁèlÇ¨ÿo"iãÜqÜ²µ=@XhæÚa{lÅ»°J\\ê	¶¾/A/µüTQ½tXÝÂ¶Vlß6}µÒßo+¶Ê$¶màäEtÚÐÜ±ÚHxü¬KÁGÁKk=}OÐvÞ¢{·È]cuújòis·K]ã'IKËÐ4_IÉ=JîC÷{ÃÞÑCïÑscÂ¿X^¸ú~]M=JsH¿5tl\`î»ÝPê¡n9ÇGWLË@=}3ý\\=}²»èFßÖ·X%:/-êä@Êk¯¯«ûGÈ×§t}¥½üÒ ï)oíFt¥Ùßb8¢]Å1¾ÓÁåsÆ¨öºZÒZuü´+k"\`XU¢r3cßµ½ÆöorYÕ,âWK¡?xäq;aPòqìªRú½=J·ÖÊ#»d=Júk·½H»òØJ>æù!ÊÎ9pJÙæâàÇVøÖ²¡Øâ}\\­é=MÒÇAñoÝ«V(IÕ£[èÌ÷ øa¦£Ý·¬'q×@¹¿a))y)¡±51¥ÖÇk,g¡&->ÚÆ\\Öú¨R¡ §ïé-WkÊnî¬3Ì"°â¯W°/R=}ÅÅeÅÙ8o¯¿HöpËu keä¨Pò_erÓ}\`o-åàÛN=@:$Em~*ÔiT{W{U¶ÌGHäW0Æ¸ºjpª°·jg[y\`jãRJ ÞZÙ¼~\`íìÆ)Jöa¦¹mâe;ßmE¤ìJÚ[z×I¨]s¶VÏ§.Æ\`[²ÿÆ=J²&WgU~¼tÉ¸Õç¤VUÈÐX,û+xåpà,ÿÉ pgä®ë,kqÁK¤²ã´0A^qv@|Æ¸©,èX@|É;à£×·:p2e%¹¯¡±;=MÜdf±íÌdq:ÊÙ¢PÞ¤þI%Ðg°'rFÄºãDÕeà7t$àÈãÇæ·ËP¶½Ò¾r#=@MîÉU}%Ï­^$?ÉÔ9H/j=M d½ØÝ¡^ÿãJáÍÚåvð3iîvAÖ¶QÂÞ³«SÄ=MÝÇöcÚ}rÀ3;Â]ïø1s³÷±&òÑ_dÅ=@\`^ÿwîÊËNÅ¯;á5v3Åù.³õÑò$ó­]x:%Ö#w2ûð>÷ËEcÀökX¦8àÿdjVü=}·I	Y(ýãÙ\`N7ùöäzÜ^¼óñfaÒ_Sß"Ç3aõ\`»ÚÌsQsàøæ°QH°ð©W¬sã=}õÚZ8´Ký­îøv¡ðNÜnHÇt{/GÐÍð6e¡¨m\\_îAtõoýëàmI¯þÜ-7=@³¤#¯ÓÕ5 mæËÂÌÊÀ<dKp=M6jÇ"¬®ñ5f¿4ÚX9¶,LÆî\`¥nø¹Faz¥·ÏÖz®îY§\\)[wk=JnÂ»zyuS{ãxkSêÞ3v¢±f×¿l'ÆÙÊ¾UÜ}x×ý»7Þ8ýÐ/°ùmÅï!d!Æá[ìØÎn?¾«á<>wP1·Ë[ZýPØîNú×{.Õe|ÿ$ '¶É=J®VÖÄrÓÛCIÜs!§Ö\`&r;ß¡ÜâÚCââÖt¼ZÓ¡üÝ5«Q»=Jü=}äË¾Óó´Qø(¾RÁ¤þ5ÐY×qG%m\`þ5ÓäKg}ã¡)O&Ò|¿yOú»P=M[Õ\`f=}ÑïÁHØ¤ÅÓn³½ÂVº³½£ßìºNÏgÚ=MÒÇAñowÆ+£nÆûâìT}á¢©2iNOQ\\&?ÖµYÞäåç¦K{®lwè*yÓßÓ0^E*-¢*.í-bÛ0¾×+×ZL8þõ±ÊV2áM8Ä\\"'Ä¯3:Mý'wÂ(×e(£õ|oZôÿÏÿXWõV!¹«»ùfÝÞtHdáØødßOª¨ì¬Fî³wÐ"hª&¶Lb2Ùõ¯s¯Ðßc	3Ø6%¯*±®ÞÙ[ò­±Ü*ýû^N£uVºqXC¢påòì$aUv­´­ñJæwúÞµ$!Ö© ¾z'w¶ÇªºrGo/KætÀðÆ­ÍpvnÆêtÿÐ6O²L³ÅqDÞad] Ð¼¯ä×LE·«í(Aà0ð_Húã¨ñkd-ÀZWÒ°O=M¼	_ö4sGmï­­ºxÑ=MÇRPÏøvê=@Ü÷õ<ôZ¯ûø(?B÷3Zu;\\>Ïès=MÄ&Àâ=}³ÿôÞ£=@vE&Ì·³º4z§Ð@Í8Ê½Ý¯{¦ÃcwÅÂ=}&Ø$J¦^WÍÛvåìrÚ.Â)ÄCÐÂóÒQ©ÅÎ(eô¼äÁÏY,ÃÞCU ¼v¾X°Óvn¼Ãx«)7ÌF°tKÁËpd@r\\ ¬¾3í=JCeµß±éí g\\¯D¿ØÈvèÖUPÝXõýãutã½Jä2ç8>C×}Fx{&Y®ô-Ùë«î«=}õL×ØðÍNîØ,£USÁÝýµ}!-rµ/ÿ#ÌÿÃÅG¦'¦&Oÿ&	viTÂñºg%Xù]\`ib	&fÔçæ¢	^û=MÃCª>Ä±aC3mo¿Úü|ÐàÇ¤Ïµ´Òg=M)ÆÙØïâÕa(&"é]þÞ! ðï´ïg.4¢âÙL/ÕÔw(Ç÷Ñ?B.¦ÃíØõ¯¨{U:Ð{ç³ÐÿLò4¢ K Ähx:+|$ChÕ¯-?©2ðRó9à_BÜsÖÆÐ%Êcð¦ífÎôn|G6N¥=M 1èeèLH9ð^:/h{=}µÍG8ËøüãõA'mðNí³u¶x5Úè¹´ø*cþ2@^µÚaçKúwIë³^¨HÐ!^êò®stPÊø:!ý÷R³f;Óà=Ml}ß{L ÔÀÇ'kÕFñOÛÔLKS]±=MÀ¹WeÅtº³F)dáÎÙÌ3%:9f(ûLßÉw4½«:Õæ¼=JWÁøk]æ¨Ô/a­¡6s^=M$\\}jëx_2*\\½ùÊêÜUüÖ;2Jy×;\\§d¯B®?PÙxÝ¤¾Ù³Ò¢É²dwíÇ5ÔÄý­$îWõ=J\`ÀÖ|=J½®à<lÌzK»=@ÿLªZ=@},Û¨G!{ú¸Ï	dÃûG\\.[xøÇ®µÁhÉ³²+±¾|úáûý=J µ^ÎyëVîC&\\Î6fÌ) :#ÛÞ°Å.µ¿,#G?iÇH?Ák­NÃªÿ£âv³iD3¿ª¡¾d ®µA{ñÓu¤sòth®m¶ÐèØáÙÚæg¦¢Ë4i£Üñ=JÈP?s}@2"Ý<®Å#u´ubti2ªs"H­¹Ï\`vÌ\`s»¾ÿ3\\oÛ4±q¡÷=Jê¢U÷ýé ;	dM=@\`î÷¶Â¶ðpP­Ù»ðEÕûöW{ó\\Ë·Dþ:º)è8i¥û'\`GsCÑH£Ü÷øÞMèy­s÷r@c)=@V·ÊÌl~o´zï·ñ²yÜ¤a\\¶»2_ió*´iØ73ëÎÿ<;1KLgjÝVä3Rì@Y·oÁReXq! ÁÄÛ­!îYzövèÄ0´>-¸PzP'Ð¹Ù1:àF[@arÌ-=M¯ÒnÁu³/þ­QèÎÇ¢kfycXaåqÑ	ÛÆÿ}ÇðAÌd7eÅ{hÞz ¹puIÙ/cè|=JúlC,ªìäÐcYÌúDß­ï@RºRmÏ­û>ß²d%:ù3!%ÄD¡F^÷~8øQ°æì;0QuýöðÄk,î¹ùñõ+íÒwÐPöGÁOÿDC×YÐCõéÏçðY]±»Ù±ç=@»$.rË$<#&×Ë¯r&³þ¹Ç²C	Ç.êUÔÙæ:]ÏßväÝ§vwÇ3ÿ2¶ÊÒíªmÁþ¤¹h*W àm«jýàÓýfhä·¨fbò½ÌP8ö±ì3â=Jlô7Õô>ìÖ?öâ¯ÂQ´·¶õþ=}}ÌD-µ@!úÌÈºâ"4²ÃáyµÙÒÆdoNXã¦Gø¦ºâÈõoäêåAµî£=@BFW>0´ÊWRV m.fµ-ôjÍp?QÚ\`¹Õ9/¼ùl«^ïE2J³jÅëËÄéBÉRâB sô4æU\\óÜ\`«UZí{[¥5xa©ÃÊj\`·%=M=@=@rÆØS=J.K	°~°³©óÑaæR=}]ö;$/ÕàúÚ½V@\\c6]ÁY»Wãl·D«&¿1µêPÂò\\CùS½@o§>6±éÍ\\ÂCñ/|êÖöOÈ"þ+øª¸r|EØá.ÏA:/÷îª<Z°oµsUõWPBIÒô¡>w1óÛ?âi¼@­¾ÂºÒze,u÷[4wûKédv«M\\Æ/oºuÀ8õj;PoÒdÞRYÆ6kSLvÔ8Ý4ÑuÂ­/W­¯«¦IO°ñ¬ÀÄ=}Q_A=J¢ó R	Q¢SÂ²)4yWW´mÚ·}YPÍ:ºaÎ*PlLU°uÔàPpWÍ=@Sb+«õÌ*JYD-zÞTÓAÆ0áñá éV²µ=JöÄÓ+ UIÊÌyNÚ-JM=@1\`V?zÌTâÓóÀ¼^ti)É£Ò:¬Hiì%{_å]'Dú5ê©b@,S-h@,Í\\	¿ýPø41ÞÊÎ-ýkIóB©iÞAd+xÖÔN +Ùé\`e/GH.VxørvQÐ@Ä<LÃêg^öºáÌïbo°l×ÁE­qêRcu Ûüã!àb>Uß<-águá6dFMmÃb~s³¡uõ´Ð+Ü\`/û¡ñ³ãÊh¾sbI¾3¨H-ªIÖq2ÈÁ!Q¸#{Â· eBi2p8qGíSçbÆhîËè)ìíkíÃÆÀé«3JZjeéyýªÔjùà=}¿Ù³¤xi'CP~g~JõÁÓ­V¥º_Ï¹ÀA~8Íù:ëy=@Eýq=JDØ®úTkµ¼íTË0,ÞÈAÍªíà/,,d³¹ÜôÊð8­UÞâM@S|^XÄÍqÁs$º/Òç»¸PÔtO«£D­5ûJp2?Z#J­ùô±®öÂ\`O§=}sÝÌZv2Yôý@¬ÿðîÁ[ExtSèy§~®=M%º ¦InPÊö?1ÔqÈ©cÅ{ùõ£RÆ~7<Ï²Ô8Yvq^§eb\\ó=J¨°Óªe=Jác$g_È½Ô¨dîüJÊ(SQ£F­WûÊ,Å¡6L5í0PnßÿWÛ¾Â=}ýÌX.-±Ã/Ú.rÌ#ÎåËÃâ$³ÑA\`¬17ÉZt§åMFXÜÕw«»³"­Y3û,[a×;¾¾	ð*kg»&ú5U/nÁÓÂ=}Ä4 >dFÒhLt°é9YaÐY=Mà»¬¸®\\Ëµ·Ö¸07ù]ÍÇÄJÔ?Á*½t=J¨=MÝ£Ijë7çû[z#¾QxvÀ®8VS{C'8À±Ho*Z,/äÜi&ÈbBê·\`=}ZHÎ«£[86¦©P~Ð8±QbßÌÆÖ1ë-÷_°Òåãï×ú°½VX²"Ò'­å¶#°g°Î¦Nm\\Æã¥¨$ØúâCØ{YXîÞíd¸m6]ÖXîÑpC=M'6£5½-{.¥ëÏ=Jü.ü¤t#Üg´×¦AxµY%èZC+=}(Ä½¯ë¥3'l2ÊÙW	aóI]ôxâH^ê>Ùú­ïÒæcwF}.4ÃLþZ]Ü\`Ð"Hø x]sç;ïù$=Jf¬¥·ö+«YëH9HHQxú ª§ôËí&+Ðõ«DÜi¿~Z(¤\\Hz¸³7¸õÔQÄ=Mþöf¬±ïw¾¯±ñÊ]A¬ç9Ì S¨á°¸=} zA#-Z¸¿<ëY\\éRDØçÚÈ/±G)èÀïHLÁ¦¿ÈYþFütgÃ®ë(: s&&û)£ø=}éWï¨ÀiC<iç& Ñx<YácufyAEá$Í¹Áéå9 V<a¤ÉV;äDÉ_l-ì¸w½hùMØUÏÊ+uD¡EPè¼øãºZMº°|JçõÖá7dñËv¢KAG=J(1N5ÉCê×øÞ1hÉd ¬ã¿ûï)µ=MàÖ	HJÂ&ÚPlªt«§ÝVM#ÞXÒ]b®Dòd¬cöyÖuÓAÓcÊÒeÒ¹÷r{?9Á´;FW×¹Ü=}tïfx¿çé?2¾ô°¢ªÚÖ£Ê,ãÛXéíàå¬Zè×ÏÛ§YéæÀ'\\\\L¤âÕýRÊËcòøü|½½ÀÏ|[KÊíÏ5Øuu¿«¿äO!ÜuOH=M\\x~ñ×¥\`>Àï=M	q>rQ¤52DCÍcÅMÍãRk¹75,Í?¯jµü^òZüøì#m|d@9óõ°µIÃ7\\ãÔSk7®¶n8>Óc(À¦Ã%Ëa>NW½1çóëZÏúÉ?fuëtçò°TéØâváNr"SI¥G2à ÝP½ÕÈ8r1èO:ÿ=Jÿ=}*r=}ÕÔâ§¼vÅ½Ô@ zÿÊ6z½K´Iø~Ùçbè/,°9Ýðz.\\P[kø4^ÊÖ3ÅwÕ|H}S@0JO7ÕbAÍÐ¨·Z: ÐQ^ej­;]{.¢éãAÉàÇöýÒÊd£4i|ÿ§Îôz;ZºJpe|Wí?s¼ªrIÞ¥·?¬s£ÛØV¼Fî<BÖA*£Ý6Ï.üCHå\\9°EÁ=MyÈo ßÒúuÍµôd8Û0=@"?sh¡ØYDÝwåè|!fm©õ(±ô¯%)Î¡Pùc,ðò}OöYÁ({­?É7'nVYéá°ÉÁ'ççéá°IéÖjHFR4JÁ=Mµ)û,¡iåïXïyÉ!½AVYy¶²õRzüív$3S=M³ýÄÁ¼±'e9«'ÿ%Ä&æ%e=JBÔ×Å>KíÛô©¨Ô´Ä@_Xãlûï² ¡h(!Õ©¡sÞRMÚ"ËYiÔò'yaOA4À+ÎþÛ8{ÛhY¾½D¶ÑÓç½SÑ9Ç%;9©ýîg§%×hèS=Móo3oöv´Âc£;=@D©8ØA#wÓ»jÙfùZQ-3 ·¥Ô¯çÛÅÿ¸U´ÍØS­À_w=@³Pw¤iøb½±w8t«Y×AEàCï9¦¦ëkñføÞØüöÐs0#J5QÌÌnSÓlPW±Ö§8ÚÜ´µLÜYOâóÔÀmIâQió¾ZØâd	úaà4IiÙ>%¬ë{ÖÁH´Á Þ=}t.Ó ¯(¹HÀ©ÈÎºÁXËDrÐ½ú/ÍÕÏ´óéÖæ	¼\\ \`hõ.ð¸Qy,@N©=@øØ]¹UèÞZð"|¶X4¡üq¨¨¼)L0Kã9'ðéèÒ\\%]¹	èk ô×ÅG·¿´È!E0%?Mñm]g>E¥xP^ßVÒÝ@Ö×MÞ+¥h{Kú@ndTï!=}¡ÔÔJoSOmï¯uba3=@«<Å¶G;àg*çvxùP#xÐÊ3Þ(d./zí/+£¼?PlüÇ«â8ÊösH9Ø/¼G[Ml¢L×;¸¶M3QPrµò>øR3±>AÍ-43¼z×_.VôâQ.bû9Ò>õ: ;N(¨)¢\`;Nf Ø¾LèÈïÓ	.=MÚþÐÓoõ#·ÅÇ8Ï|[J.-U³áFü¼­ÝÝ¦Écq{]z*Ù{oùà°¾8V"»µ©¬c¬Rk%÷Jº[vz1æ>øÜ¨Èû,Óáñzá£¡+< gfY/tæm¥K³[mÝðYk^øx¶ö.Z8Îx.ÛcfämîkfÚa55½²ô2ãçGÇVÔµñûàbûo=}Ú´7vlM£bL³rW8Ó¯~%ªÐ÷S*ßjÎ½£ð/ñMt7Û"2löUÍRzÅNK½Î&è¡8&L¢èÚCÉ¢7KÇå¡=Jï%ôÉÂ\\HüÑ¹ÞQ9&ñKgè=JIBâ ë'w9G&àµY&§¼ÞÆµÑl$§ðØö1hDôÅi åÉ¢=}å¯¢!í¹©¥øÑ 3¯1·G¥ðiWç{fa &i©E½!C¦mm¨&KçÏbâM	"cQ¯gñ8¤Y	"aÍKÇ¥}Á8äw¼¨=J¾&=MIÉ¤£¼(Ð=}aÙcm¤^â	÷5éåc£è=Jªàç¡"ÈºÔÛm=M-È(ÙÎ&ìá=@ÑÉ8áøC¥m¹	Ý"¨éëw)è(ÈÓsäå¹(ü£¥®¢	ËE g$ªºf¡e¡è=@;Kcýeè\\=MÃá®³ÿë©ã=JÚu%r	àAØ&Õ%&¼)EiÃ%)vr¹_À¥Sè^£(åwåÛúM®)¨­ù÷&¡EèAü	HDfúv	!ñs§ He$­÷D<üñnwÑv%üaÉtèIÂ	é#ïìfç iåÊ&¸ÓKçÏy%¦'â!2ï©Bb1¡bêº¸6¨¡ùâ^ÎWid ¸IG  º(H­§I£ó-MKç#ªÛçõÙ¦¨¨ô)'hÉÎA6ÀDfÓK§ÿkeaEü©'ë¡fÑXâWÎaè%E¹Äãó!y$9÷¦	s£]05ya§ ùOÉh"$q£1¨E)íÐ)"ã	'ØKçÏùç¹¦ü¯K§­\\$íËºdüg¥®ºhÛf'h±l$­0Ù(=@ìY©\\ÎÍØëù§Y(§r¹a8&QyB#rÆeàÙ¥mrÉ^¶Ñ)=MÐ»½$aZäêë¨ÄÎIHâÈá©U¹¯Ä#I¤ä$Í)FüñvI'\`fÉ]"ßX {rÉ^Ò¢ï¨K§î1Ig$W3­8De"¹¦ #ld¡ê!ÉÄ%ûKçãÂ¡'#éØ8û8%äg)%&5m¤æ^æ¦°©tôI%=JñXã¨õðºýhâÍ=@¤rÙU6¨Ñ'Å1m$¾ð\`¡	óôØ·	ý	"nBéØÛWñÈ'êÏ]m¤u£ó!i¡	/óÀÛ§\`¥!a@±¸ÛYf¡ô;ñ±1]"Í÷%Ó9¯=@aÉ¥yGûðßI#¦¢è=@­áçWµÙ6¹0=@Ø#'YÌ½­w)òÇi4ê¾£l#ëºh«mè¸¡v¥dÎ^¸dÙò/wé5C¦¸£ñ°À©Ðç#ý%®)X­ïU&G±P1Yâùé£rHFâ&§Ü£7($mÍK§Ä=}áÇ&øY®"]-	!(Ùé@üà7ëie¥Kg$Å«íéÇ©äild$íÐÅDé)Ñ¹°så¶góÓ%§#ºÈd§Õ¸¦ÒóúëqÙ&íþOÙ4©f"yxiéml$í­	!¹§vrYC%qh^_I2MÅ8e$ iél$ÐÛ©!	¨K§üýÅHÿ?)r¨=JeyeÃEl¤=@ë 9©ëüI±[©BÂ¤ ù?©bÎA)Ê%£Ü!ãºH§}¦õd©I=@Å¡íò« 2=@QÀiÚ±1±-8)eH=}üÉì¨	9°Ç-1§ÜYÆDüÅÈE"þêÆìçA®³iã_h=MÕmä×f=@ý59"rC	Þ ùùåifg$õô½å_	ìmÉN Ï³£ü!\`ç'ãº(©§1~eT2oëØMt>V²ôÊÒÌ¥¶8\\J,-|/uD_DVÛÁBµ·{>¥³_ÛL Dô¡ç\`ø©øã!h))ÉQçéÿéßèàô^¾¼åðåÿ0³A¡Þ¶ôÙÉ4&¸ª+«Ôr¦øÍªMeµ~gµiÂ\\®#Ø}M³%Æ9²\\è²îÁÜ%üö¹OhPÁ#ª¬#v<NÊþÕùÒb³\\¢Ù´Ù¦ ²îA	ucciÓnb×è+±°éÞöº"jpieNËp	Æ>ÉdI×á0æI)Päõ@³I¤Å\\[$½~³Ñ2@£ð[³6¥þÓæîyèw£ v	r&%ü°?Õ]¤X©Nå£V¹yØ9©ÑûêïHh£Ér¨¤<úçå=Ms{³=MáªaÖç~xSø°¦Í}W<aÈÑï#sÆ$È!I_¾"ÿå+(è×éÈ?ÌÏ©:úmäsñðº»=@ÙíÜ³%\`>aVæîù¤B@Æ_ ×¦Eõ}P%éÃRVg¡ÅWño6U¹ðhè~÷4E¶U$¤¤³úMùÂÕeO¨Ý¼Ë{C¹ÿ8sÉùÜ¥I	OÈ¦MêáëY¿¢'*)5f¾"^Çÿ)[¥r¦õ}lñÝ§Ô]ç77Ößõ{­ü±w_UET@GÞNçÜîÁ^[PÃ1%u&zsµ¥Û{ô1uQÁK´·×©UoWi(Ø	ÁrÆ ù£}¾îy@[>äàë«<):%ïß¶[<yWcgñ³ÉYÛùR)ël³)Â~"îß<IÓ¥ó;Þ ¥C¾Dz"¨³QAàòïÁÑß$50c¯¿)Pm$SQÔ0Ø)Åî~Üâ¶áÞb'pÍù$½èvTÚ&!±ÿµÓ¢pÆãÀ=MTò"XÀO!ÿWïí\`/r&c­%EË÷O¸õS¯@÷ãé½îù%à¹éÜîav±6=@þ×çÜÉî¥7Ã³Tä·úµ)£ÅÂIPu&huéü7sfèÛoé"÷uUOØá]ö\\)à¥î@³Q1DÈØTÄÇÐ¹,Øg¦ÎîAAáÖï?³%âC¸¯¾ó²%wUÄP9)hy³8ÚF»!$Ø°òVø±Ä^Û¡©{ç´Õ¢Uc?79à¹Ó)àèî\`Ê.Yå:W)õ>¿7Éâ­ïCI0¿¢ÜÍï×ðÎÂ«<éjêÈWuðtæ«áOù$CØ÷¾âhéK(öãñuOÐÆoáW(Ú7££7f'¨ãâíµÔSèW7±|$±ãEYufØ´Åßq¤iúYóçÊ)ða§O7¥¦­q.çºáÝ¢¯Éû¢Åé'åíOì[kÑô_O¨÷|%ÁùÙa¾¢=MÀu]¥F=@+÷6{oÏñ¼"¹¿6fá"_·¿¢áJmë§Yã9Á"yuëGÑÞÞÚä§U	Ce^uùå	è¾­çUÜmuüÌ³IÝþÉd¡£³ùâÐ>¥q7t¸fâÖ$|ï7X!	¨÷Ïþa0Ññ¥csFd­ñäi8ÙN½xÀWÈOõÐúquûÞ_Å^¼¢'¾á}}\\áá½¢Y9õDGq#±tfÝÉå­¥$s\\¦õÝGq#1Åãí<I{ðIQëÁ@Õë¹ÿ£ûä]&=JQ¹½(ïÆ¨=}'±l=}~edÎ×y&mçÞÿYX|øç~¨öû¤û¬F¯RÀô~ÉíÑ»bSLð=}¼3µ3Ó&z#hy1i»qÂ\\pEx¾OôCkæþæH)¤(Ê§\\iôaw'=M&kTeþÜ=}}/l3s%©ÿ0ßÖÊ§¿GÐ@$!Ôéð	]QI°	å¤2?3>Óö (jÎcfüFÃb2¿#+ÉXh-ýÏÜyAh¥%6Ö]zùJÎÔØsØ3ZE÷L1l¬lúKÒSÄ±^kõÊëÒ49|ÞQl=}wËÛ{PÝhfBüåpqû±qpqqÄMs$+»³§BÂÎI´¹_OZXh\`p.½ãåZ§éN^EÐa¶8¹×Õ¹aå(KÖ©æhP\`¶ÿ'KLÒe§æ[ûN4$m?Ì;Ë­<w3©8ÄÈ?ØÀ>÷4Ãª;·wc:_¢æóÎ9¹·¹[Ptü=}L1USL=}<nYâ°ÓM÷$úòn<¾´IECYÜ¡ÅÀwÖ9]oE¿8³ÖÑ¹]°¯³Ì.ÐÏ5µ?Kd/Ó§FØc³Õ=@¼o=}%Â¶Ã³Ð³ÐÚV|MöÛÌB»à\\þþÂ¾üñ°ßçpùwmá5èmå=JÊW­mÄ  ,þ¨&Auz¤åÇ[V\\	~újD§~79"±Ëw¼âh»ûÐiÑõB°Ý®è¡IÍc¬­MbWf\\hK{ûÔw}§©}¦lÖã´ÈG´ÙÌZ´§½¢ÍÃ6ÆºÓ3³Pv'éR	RqOË§~ÆSv¶\`]nÄ=M¼<ÕsDïPo½}v¤ÍèÕ\`¤|¶BY<²y\\!\`P´XÐ§¼cöBirÉBuè5]¯D÷$òÂò¬÷ðzo4·ûû¼{=}ÜLððpOZm¾ÒØPwN±Oz%æ»û¸w~PhPüü5#ùxEG´ZpÕMWäòåÃôh-§&Í1SMÛ3Ðn jp×ÄaØû	É¶ò{gåpIv^wÚÖ=J>I¬Ýf¶'·»ûNûÓÐ5u|B»ü_ò%9ÞùTw.Ê´hs»÷ Ðb8ÌìyênûØ$Ú°O²IN|ÜÍûÝÌNÃÍ.³§vFâ²rÝBç±Î=M\`îÃ¶{¬$+Û!nàëîæ»3Sß8ó[L?ÜÌú7së,þ©P¿bmÒòP¶»g¾BGÏ!ú>v_#-ÍÜ"Öü?CCF]Õ}LOjt7È^¢J§¬ó>Oüñzs»w',¾®Þ¼Æ£ív3»;ÌÀß{?l'°o°±½ÏnÝ¢XÖnÎRÆpoÿÛVv(Ó%yÊï?Á0(.EæÞ±Ä> |ÝÃì¨tôGY±ÐQ_	¯£ãÇ­÷2µ4*ÍÇ¦®Ú	£3/oüÀqÂöÐ"ò'Ó~ÁÑFW Ø§¬zÀ=JlQþJþPB2w2K® ®Ø®H®zlNK°ºvÂxjZPOðÿ6ÍWZïMÜ°éIL´uW£ûÌß¬D·m1Ò=J«³2´x¶· ­[ú	ùÙP¬ßlr:Lx\\ù(»tÔs£òLÜln=@ÝÃ v:þ±Üý2ó®®cË1^b´}]É$(+hr¢YÇ®á®a<µ-ä®Á®A®®Ñ®ñ®q®±®1®å®®E®®ìoìcìCì3ì{ì+ìHl4U-Wc;8d<^RK³:m2QNPÞK^Q²ÙD.:&2h®ô.a¬5ËfËVË¶.ÖQ~N¢ô(®p®=@®H.]NEìdìks½=Jötpy²OöOQfQâ»å=}Ð=}¸<\\Zuìk¬mäÃ®®6¬1#äI1Ká7ú¼Z½»zÀvslòJ¾N±:p:=@:x;H=}SAÏ3Ø.¡¬ÈJ¦A¶esvZ;ô;¸ÜÆ¬¿¹Oª:ïä¹ÚWÏ2gðC! p³ÛätòJÆP}QmöNm®»Cæò6áó2ó2·É×!ò2=MÈ×?ò6©á¼C\\ò63!×%¥üe\\ïçÅöíx©Wo¢¾ß(ïgxPã¢Ãf¢³=Mj"´6ÍMöâê3O3¸.ìJì§ì¢ðáöaº#ùÜÆÚÕÕ1õ g	 \\AàÍDþªÅêàdÚ1rõ8ëÑÎã/%¨5ú8=J{?ç- xØ¸zÄ=}Øëªu¸¡e¸Êi¦.Züö¨x)8	¸¾<ñ0Ú´öÈ²ö¿ªý¤¸yª×¯Åsê¾MF½}êî)Ú=J<gTËqWK]?§5Ý\\Vá8 dòÙmßìdTÔí¥G¿þCG8Àý]£÷B{±h¿¢vRôcý÷'ÒåðaËèC«=}ð/B=Jé>\\ó_\\\\,7¼§¶¤ã4Qÿ7­fóÒ«jÁùÃº)W¡Ii AKºùvçåøþEå¢A:òlpÔ}~a©oF{ÞÂ¢ücAq³¼ãt«çWb8 ouªþM¢=JJFÆnàimú\`ðUa©^mkCMý¯yÃÔiÃ£Ùcõb×æÃ±Ãx^ ù:Þ·É9íÄå¦¨õ#ÙDÎ(®Ýà"÷­a¾÷QÝïHÕGpËÝ­Xý+ä!#Ë¥*äñ/Ëå2äþìFÌ)S#T9vyÄ(ã(ø)éiéTÿÉø)¡&))¢ËÞÞ"©1))&Ç)'¡&©Á(#¡¿ê)?ûð)(Æ'Ó&)ý=M)é)Æ%ÏB­)#)ýñaÑè=}©=M)BYôyyØcµßæªh)µÉm;XªUâôì[A¢"V(íÂí¨eqCê¿ZhóY2Õ Wµ]$&ÕçÀ¯¹W s^N¨Ñ=}Jü´åÂÝ;U¶wXñÚTÒ³jÞjaÂ[@uÚ9éç½³Ø«"l8©àà  #AXÌ¶µéÀ5oOÂý±Y~=Må*;ÒÅM\\kq¡$¹ß£Ëd,â*/§ã}'W \`´¼þPA X=M{ÿù¹ßjfèø$~û7=@Ý¯µ=}ÛÉÌ÷¹ãKÆõ_	Y£ÌÓdaèjÄoÅlcáÔ(·e®Á$Âà"+!ÙÒUM[SAY6íÍÄ-J;½Û4±µ½Q#ÂÁ~Ó®ÛÓOôÔ=@6yÕ÷¹güµß×ì?|\`óKEúÛ¾u¶$Ñµñ¢¸¯ÝØÏL=}W÷{ÅÍS=@AÎO±ÕW.ûfMÚ­'ù{½ÞÓíl)_cÅ»oÅc¹éÐiÍ\`·É~Ø¹ðBÈör¢¿WýÁ#H¹©Øäã,/\\¨Ñþ=M	ÊáQø§"Z¡^£"f]{¡¡!ÅSOêøxZ³\\¿Â¸öÕBÛpS=@T¯à@@uÖ=@3oL¦úÿQ½aá-!÷÷5<Äøø0 ôYé×MÅùJéççË& ÚÒWí5[Æ+Ú÷òü\`i¯íÄãdG»e¡f£î©V>Ê(Ãéó¦yy&Ðô%£iSfó·b£yÀ!ì£[bøwdX¹O#²=}[côðÈJ±H¬¦A7<¡ûgXþÓâµ<¡Û½R/Ð=MãüX\`îóñå¤¡º¡Oiteî0ËbÎý0kMêKº'ï8©³ç} Û´ÚÏz&ÈÙ?!Ünâ52|"y;oÔÊ½VÎ&ÝérÐ5t¨3±×kaÖ¡Ö!ÖyâGÐP×«´þîèÖ=@Ì8NëoëFãÃSà´ÜU<éeN¥À{7Òòu»Wq×f³0BMtzÞ\`þ/mg­	RÏnZ=MeÊgÙß"C;tîøÚ\\þ°à³®pÒKå²WÎ¨á­¢sUS¹·Êm·Êñ{S}0¨}ü¤ÏMWvZMÈoµ¿Ñ F \`ÿnMOÞ7~sàsÞRr3÷í¸§%tàwÞ±	äyãò Ò§nsÙß9a@ùÛ¡HÜ¡Þà.Í@ý´ê@²ZûLûHQ/ÕxMÏ±®QÐ¸BIû4ûPßVûÈÌ6û ûÂyEÙû=@ìgöwú1t9³>-:ë>'ûsÉnå~£tnQ°ÅzÅ~5f+w¾ûÉçC=MxeÏû?pË³RkzR$ÿËÝ[´=M»Ü£¹âIeÈ"â!ÇN=@u»\`:ç ['£N'LÖk@¡¹±B7_ñÑ#§ÆUtòY=@¹Óy|ô;Þ5ôã¿µ¸ÜÏÇJ$jÏE) «=JÐ gÈJ¤jÍÜb%lÎ}$súMðbÅM5üâ{bUc/ïÝPGTlÒ4ÍtãÔô·?¾&¬-~=M>,É{ÒÎú	Ë!=MHZSQ|Ø¸§q|ÔàKÈ'JWÈoÙd ¬ËwÜ%Ñ[ëÀÞ4TmÝÐ{r«=J-VÆÊ­\`K+¿BLN{ÿz¬¤ká9_w-ª¹¾-Kµßbû-"õªÃ ÃØÃ{ÃÅ\\=@ÚpÑz@¸t:MÕôÎ	%+9èqòz(GQ²ëS5]õ®âñr¶Ä)W¸ý--V|èËáß³Ôãéì°FM&ª¯tév2$´Ù>LÛr{Iïu5GYÚåóâ/âÊîçêG	Ñ$µ%;$	ùB}ÉZ¯ï-_f÷c4óhh¶YÚ3G°¦^³h®c­=JÀ_h=@Hy¹gO"Â"8|Î¹ï:âËÞ'dÉÕv¶ÿ8Ü§?gB5°Tc8Ì?ÛsPcV;w²Z=J<qn÷]B,°ÉpÏ&×¦(Æ1Fn6p=@Ùî¦°}tv+Æä³'^óócºÿD¯É¢7Ê±Rì Ìå	¬3R­u/f0ì^=M×Ó®÷ÆÿÒ_ÖêJ$[Pì¢øNþþ¿³WqNÙõ2-[xvh9ÊT»á^\`RcF[9ÐàÕXÀ<´æ¤ûiïÒÍ4	ScË9çuß/ûFUË¡×|¤ÿþÈÂË®5c ZÄ©þ3Ü_O[3áÑÉß\`Í)T¤{ÿw:ðÝòR¤ÒÒU^¸Òw7zÆle|Ó¹Íéß Ð=}1¡/~5Z¼ù Æ; ô¨àñKÖ­%®¸:üÙÀS^ªº(ttø°þ­ï>Jôþà/>yè©¦¨?ó¾ãJwt(Pï4\`ú´qö»sAÜø­I¾¡_gfvnóA|ß(¶	vd=@=}©uA-tçú2µÜ¢hô&lÃ%Hp:©¯totåÿDÕ®l4×Äµ%~øV¢ê25Îþ9Q 1	õ»il#A!5Â¬=@ôý2ó©póùz^ç2å·6¥tZMl®f×	Ú»ú-|WÞ«ÿD¬Åvfô7n¶<)U°\\¡oq&u¶ü_hAs£HìYfäQÕÑ±Jm<Ù3R%và&5ÓiÇÏyçÁ:ôhÏ*K	%[[õ Ölu°m¾¼pr#o¬-ÒKþHB¶¿îR|êl?ªíú^Dáz98R^ËhóS)R)Å¾ÂÆË5óêpo1¾-q-ßfKlY6~·=M{ÀÏWøÀ#¹Ï§[wKÎ¼d4wUDïÈX"<q×ygÏ9]­®¼¾_pr à!±Ð=}þ9ÈÞuÎî=}cÛ½ÓU.ÀW@HÉ#iÚÉA=@	yÀJªÔ/.@tùp¯þLYh~N,®Õ=@Ý&X&èÄÜÖpü 5Yrr§[¤-r4ãéP)l _VÑ!Áý); épÐOØ<Eqò£O3©ÕaS§Øtâñ=MUà;Þþlüuú"ÞQz(®g=MÒ\`Üh®!Ù¤¨l¡ÒÈ¬úRìâyeØÅ±¢ÊþÛµnY}&J£u"3{3IxÓi¼ã±û ýÁô@~ÍRùþyl»b»¥K>F÷Ëq@úzÓs·ßÈDËú9	THÔ2õß9ÕÀþ*Ô¯§,;î:¨ï¦Ó»o" ôèº¢ÈUga®ùSÏa=JWÚoqßÄ*«3ejAàòuOQ(ªVÏåég±\\Ô£KÜCmÆ|Pâº=JÜÜË_Ö=@^oi~{^í@ïý{!R¤]µ?þ+çÚFì$ÎÕçWÎ¢;EówÕß/Àóþì]ÔîþoØÃXò®pïVôçÔ-ð*ô÷cYµÊ¸:ÏÁ£liÒ -Ë3hà)'ÓKtTÓ¯PÂð?P;d°Dj¿)1¯ýô¹|ÅÇÖ®^|e*[=}NRÈ­#¯&g+>ù1¯yJÞêÑªTl5ÒO-Ô&ÕjQ$*C§Þ)¾9ºý(+jÇ)&M%òÆnÕ©É¼&á´é²K!Ä¶©oÕ×sèPÔ	çÀæ¯ÑWt;@àfGÒKcÁzg´ÉO!3·JNÿ*ñK?¯ÏJ~ùkE=@;=}(¬D¥>$0AÜ¦-UÆÖ'2Õ¿Nf/pÊ|MÜ*4TP/±C)/ÏGÑî=@|õÚ^'*÷1:!:è@@ÂÿìBø?¢BÃdký0ÔQÊð%5	)åÜ'©«HªáöYf©ÿ$5>h)½Éõ:	5v¢"¨¼|EJurÍà:­Ùß1c!¥Ru;\`ß"2IËÈ¼(qXFÀ|p]}2#AË­b:!ï¾á|0a{Ñ²å5\`ôä_Ùjö9èËXòÈ£áÊZ¸ËìQ"Iz¨q§Ê,9²C¯º$g	ü¤xòé)AHª)»!òcÕüÉýf~µO&§	=}¾<î6JhþïfK5zdîæ·?]¨ÿÓ§*ÿIÑ'?ÀÙÓdjÖ/3)´ºà}vÑiÞ#ÉT)ñüÙ×©òÛjS³/Ï9í?Õ²Ãnh¹ä¬JµGR÷rÃ	@ºFòIPQSÄåluHÓ¿S9ôÌ¡kG|3RÎm-lÜ*HËx+q°CZÙ¢Û×ªÆH'3D±Âý3ÑdåMç5®toêt®]Ûô_qOÆÿ:÷Ùì(¨¾Ã49ôìmC7³AßpËøÔ" B µmúÈ"¤GÞI1	hÙ­sgñê=M·/Ùõí?õlzÎM\`3[âI¹äÍs×BI!¥±¥<gb2íºQ¢QYÞÅ²¡{!{¨myÂ,ÉÇZ§=}fE/§ô3"gÉ±EÕõ5=M¿è·YÄÚâyvú1ó×yï'5F®íÕ<Z¤Ynwxoó§wfL7 ¡YÍYvé9Uô¦­ðý{ÜSV9Þ«wU6Ù¹çÿxUcÖd6RA2µ©«îýM¢\\ØV°xÕªè¿°A"¢9ª}çp|*ütXêä§¥{Ï?)5ßwÍÉaIÂ±D¦ÙËæ\`¡&/,<ÿ)gì@¢KH$D­©¶x¡ºæ=}'¤+Uñ"Í|ïÍ"*z»ñ½¦Ï{6VßLæöî!Ä"²[oå=}¥¡Yf¡Fû¨ {)VÆÙÆmÁ¤(6Æ ªñåâÏ?8FÓ8åEøâdR´ÑàëÝÜU{¡~W=}ÍGm[äÃ8YÐ ñäIqÊçÑ=@Ì;4qÆëÄ"Ëm_(¶¦HõØ¢´ù1¶êüçÍ6B¹³3-Û¨aîÈÝê¥of	§>}ph¬È2f<¶MA&=JÛ^ DÑê*U0ñPÛÙhF	B×\`xÁÈÍø£Y¾õ{[î'&e´0èêy¼ÛxD8è ê\`]ÛÑJÔ¬m]¶¡&@mzõL^ÇÛAmÔm(¸[²c7{¡ôí!aB,k­Ø=M£ð.ÇcE¹ë¤¥9ÍúÝÑI ¨R²\`M^$ïaî¾HÿÛòE|´ÙUO=@ñôÊ*"öØ9Ô&/wvmÇÚ&3Ù°×ªãf@ciìþÃUÚ£$uÆ	@Qg¯¨x7æ"b\` ­êÈúMaèÆZ,G£Ì TøApÿûç<l$Ço1]F!êoN´¯),!æ5úMyEØ¡3!%ñâaïûfBôäêa»Èb¥ÖU=@+ýØ!ï"5=}zOÈUÎõ jÃ¢í!î	å=M¨é2	F7ÂÇhDuùpÍÃIz"0ë¶d5ºHaCïá«pgbÿØ¶ù½AÍ&a]zXéÇæÈÉë©KWûIËõÇfä=}1Qq0@Æ¨Ä1÷½=JÑÁâÜ=}#´×ë.á2EwÝ7>Æ4ØkÏ¥Û(9"÷;[¥ë¥ár^Eã¹°'=MÁÒ\\¦ÌøæòÙ¡ì#Þ¢[I8Ö%6KqÀ=Mâç9ön¤íhR%4$y¨®h½'Ï"åßò/Iº)o®ß4ñmÅ×^#ÊÑt!÷ N¤0¹Ù]Ú\`1½Lù{QæÛï¯ÅÞ6Çu©/é=M 2¢9o¡Wm·´¢wSÞ\`×ìgõzé:ä9f¸´$òÎfÂzfH1ÞqÖ#dHg*á¬§Aáw"8i,Ñ¿ï°QÂf¡9ü=@7êAÔñFr¨¸Im$z)>Ææ<­1õíüyôÇ÷ÚØ'"ÓH¢¤ðóí[t}:mä¨1qY·ááhìÏvv+a%qí _yNñu]!ºð;ÂAð²DT[@×V!Sy¶CÝLê¡¡¡¶c6hCøb2ØðbF!]¦¸í9zÀêP$PäÏYp¯Ð2f·É¹kÆÛcÌdï dÞE¨´Dy ËÒãQ¤"îÁÍð^¦9 Á(0Ò?wâL©ÞhèB$ÛóC~»9Å	^n»µq[söéÞ1µór'Fe@Ññû;M´gðßæ{öK6	.wëâ­AÌ©ìº3_V=}¡YnÉè×ûì?0Sb8ÈIÆ¯,×Ðj¡/À³aJ©@¸?Ï¨"ôy/ÃS·ìIéñðþ½ÛCôçU²9Ó7ë :7h°:ùá"òK§@®ËZifXïÜBúVLñ=MµoÛÍ*Ä¾¬¸sg,C1§ÿHR"Kô.\`®	b¢¨â±eéh­õúM²Ç5 &A\\=@}¥Gi¨bªÙ ¹nn×²=M/2¶I¬-o$ÿ³ÿvòêÀíeCáï·/ºâÍ<7=MÓ±=}{êÓ4pÀò¹]ËðÌë'íX4¨®5ÞéR´seà	!¸Q^ö±ÕdÔWbÖJFQ¢Màw~^+©è«;ïD.¤§µLg¹­m5¥(8}ï=J$Tâ¡ 6·qéÉlÿ±{×¸;(?DÍ¯mB#hIßµøÍ'[2ÃeCG¸ëÕ=MÎH"?8OékÓâ²Æ?0áçzéB{Î:Ègâ!qÊ´a¡6lîþ#Â{=M;8A	0Á#â=@c/qIê#êìr6âhe~Òü.ÉÇí¯ëÚÚmT¹§µxàú9Â=J1)X²"$\\d­{(bh@°ã_\`ã¬²Þ0ýðñB[¨OðáÆ·aÑ&zðP6Cÿ,x~j­oÁãquÖµ²17»ãJ-Æ³K;õÚ=M%ë"3T¹q¡nÝGT¢·ñÞpì·âßVÄéÍaHô>d¬'QôbÝi4i«u¨jý'Íz~B90÷n=Mb¢ßF¬TÏúáMðåwíêª3ßPD¬§!ì#§æ´J9ö7ýüôZ¦ç+ÀË8=@ \\ý¥Md÷V³È"- 9aÍLglFkÒBhÞL4Ù¸¿YÐÌÑeÒî8ýî8¯OõÅßB¿UèsaìÃIÓ¡;pY#89zô¶àD{ÿiq=}!&üÿmØ8ê%GË4%OMRÕøt0Å!ôágEQ´=MHóÄæ@ñj¤ßg\`zF9sH$G×Ø­ïÛÝÁ{a¢t±{iµÖÙ<)yÆóÅø0òÊËìoFµ@XÌÓüôÀUÙÙ=JLì'Q)Å©©÷U8Ù²	Óî¯æê¿FØ:ïÁZdxL4åª÷øcD@laªYî;$;ÌîNÑ] Ý#Uìw»L_¢¦¶f«ÎÆ«»¯[h¡h(ýgeZÀA1´fLú°Ç&®c\\=}CîSÆöÊ>Ò2¤ê&!ekÙ¢¡<þ¾­·ÚØÃõ}ÂÐJõÇ)«ÅL«ç¢#£/ÉCL7¹úf=JçÆ¢M£WI ¹(³í¸f-?ÞîÌRÒ¼èÊ]6­\\¢¡|hfÊ¾=@TÞ]ôXßß£Éî¹©Ôã¡z=@ÕQÒÍðëw¢BrÆ]Aÿ}ÇÓÆ÷ÏÂ{T¿Ó~½ô}Ã_¿®Ï¼Ê~\`È=}K¿'ÃôPÐ@?ÇMb;",q[ßN«Ñî|£æ^ß6«IFr[ý~¨j¦Ø=}¼Öi·ÑÛ(^=@Éð$ý©Dy'Öi·ÑÛ(^=@©°ÑÛ¨è@Æ©Ñ8#Ãii(&îÞLãÁyÆ<vNIkiÏFtI¦ÇKt½QDg"ú\\:kÁÂêÐkÃ"TÉéõOÂoi³=MNÉY<rFÁ@ÿ9M»bXè@3ºô±VW³~\`##¬^Q)&vÜf<õ]âIÏAé©PgÜü}Üüµ9]³fýõ&Èn#¦[%éV)	sí)tÁp°©[«´ã»ñ-ðß¢4Voî'=JÍæÒtKhÇmñ(I`), new Uint8Array(107486));

  var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;

  function UTF8ArrayToString(heap, idx, maxBytesToRead) {
   var endIdx = idx + maxBytesToRead;
   var endPtr = idx;
   while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
   if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(heap.subarray(idx, endPtr));
   } else {
    var str = "";
    while (idx < endPtr) {
     var u0 = heap[idx++];
     if (!(u0 & 128)) {
      str += String.fromCharCode(u0);
      continue;
     }
     var u1 = heap[idx++] & 63;
     if ((u0 & 224) == 192) {
      str += String.fromCharCode((u0 & 31) << 6 | u1);
      continue;
     }
     var u2 = heap[idx++] & 63;
     if ((u0 & 240) == 224) {
      u0 = (u0 & 15) << 12 | u1 << 6 | u2;
     } else {
      u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heap[idx++] & 63;
     }
     if (u0 < 65536) {
      str += String.fromCharCode(u0);
     } else {
      var ch = u0 - 65536;
      str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
     }
    }
   }
   return str;
  }

  function UTF8ToString(ptr, maxBytesToRead) {
   return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
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

  let wasm;

  class MPEGDecoder {
    constructor(_MPEGDecodedAudio, _EmscriptenWASM) {
      this._ready = new Promise((resolve) =>
        this._init(_MPEGDecodedAudio, _EmscriptenWASM).then(resolve)
      );
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

    _allocateTypedArray(length, TypedArray) {
      const pointer = this._api._malloc(TypedArray.BYTES_PER_ELEMENT * length);
      const array = new TypedArray(this._api.HEAP, pointer, length);
      return [pointer, array];
    }

    // injects dependencies when running as a web worker
    async _init(_MPEGDecodedAudio, _EmscriptenWASM) {
      if (!this._api) {
        const isWebWorker = _MPEGDecodedAudio && _EmscriptenWASM;

        if (isWebWorker) {
          // use classes injected into constructor parameters
          this._MPEGDecodedAudio = _MPEGDecodedAudio;
          this._EmscriptenWASM = _EmscriptenWASM;

          // running as a webworker, use class level singleton for wasm compilation
          this._api = new this._EmscriptenWASM();
        } else {
          // use classes from es6 imports
          this._MPEGDecodedAudio = MPEGDecodedAudio;
          this._EmscriptenWASM = EmscriptenWASM;

          // use a global scope singleton so wasm compilation happens once only if class is instantiated
          if (!wasm) wasm = new this._EmscriptenWASM();
          this._api = wasm;
        }
      }

      await this._api.ready;

      this._sampleRate = 0;

      // input buffer
      this._inDataPtrSize = 2 ** 18;
      [this._inDataPtr, this._inData] = this._allocateTypedArray(
        this._inDataPtrSize,
        Uint8Array
      );

      // output buffer
      this._outputLength = 1152 * 512;
      [this._leftPtr, this._leftArr] = this._allocateTypedArray(
        this._outputLength,
        Float32Array
      );
      [this._rightPtr, this._rightArr] = this._allocateTypedArray(
        this._outputLength,
        Float32Array
      );

      // input decoded bytes pointer
      [this._decodedBytesPtr, this._decodedBytes] = this._allocateTypedArray(
        1,
        Uint32Array
      );

      // sample rate
      [this._sampleRateBytePtr, this._sampleRateByte] = this._allocateTypedArray(
        1,
        Uint32Array
      );

      this._decoder = this._api._mpeg_frame_decoder_create();
    }

    get ready() {
      return this._ready;
    }

    async reset() {
      this.free();
      await this._init();
    }

    free() {
      this._api._mpeg_frame_decoder_destroy(this._decoder);

      this._api._free(this._decoder);
      this._api._free(this._inDataPtr);
      this._api._free(this._decodedBytesPtr);
      this._api._free(this._leftPtr);
      this._api._free(this._rightPtr);
      this._api._free(this._sampleRateBytePtr);
    }

    _decode(data, decodeInterval) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._inData.set(data);
      this._decodedBytes[0] = 0;

      const samplesDecoded = this._api._mpeg_decode_interleaved(
        this._decoder,
        this._inDataPtr,
        data.length,
        this._decodedBytesPtr,
        decodeInterval,
        this._leftPtr,
        this._rightPtr,
        this._outputLength,
        this._sampleRateBytePtr
      );

      this._sampleRate = this._sampleRateByte[0];

      return new this._MPEGDecodedAudio(
        [
          this._leftArr.slice(0, samplesDecoded),
          this._rightArr.slice(0, samplesDecoded),
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
          data.subarray(offset, offset + this._inDataPtrSize),
          48
        );

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      }

      return new this._MPEGDecodedAudio(
        [
          MPEGDecoder.concatFloat32(left, samples),
          MPEGDecoder.concatFloat32(right, samples),
        ],
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

      return new this._MPEGDecodedAudio(
        [
          MPEGDecoder.concatFloat32(left, samples),
          MPEGDecoder.concatFloat32(right, samples),
        ],
        samples,
        this._sampleRate
      );
    }
  }

  let sourceURL;

  class MPEGDecoderWebWorker extends Worker__default["default"] {
    constructor() {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_MPEGDecoder, _MPEGDecodedAudio, _EmscriptenWASM) => {
        // We're in a Web Worker
        const decoder = new _MPEGDecoder(_MPEGDecodedAudio, _EmscriptenWASM);

        const detachBuffers = (buffer) =>
          Array.isArray(buffer)
            ? buffer.map((buffer) => new Uint8Array(buffer))
            : new Uint8Array(buffer);

        self.onmessage = ({ data: { id, command, mpegData } }) => {
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
              ](detachBuffers(mpegData));

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
      }).toString()})(${MPEGDecoder}, ${MPEGDecodedAudio}, ${EmscriptenWASM})`;

      if (!sourceURL) {
        const type = "text/javascript";
        try {
          // browser
          sourceURL = URL.createObjectURL(
            new Blob([webworkerSourceCode], { type })
          );
        } catch {
          // nodejs
          sourceURL = `data:${type};base64,${Buffer.from(
          webworkerSourceCode
        ).toString("base64")}`;
        }
      }

      super(sourceURL);

      this._id = Number.MIN_SAFE_INTEGER;
      this._enqueuedOperations = new Map();

      this.onmessage = ({ data }) => {
        this._enqueuedOperations.get(data.id)(data);
        this._enqueuedOperations.delete(data.id);
      };
    }

    static _getMPEGDecodedAudio({ channelData, samplesDecoded, sampleRate }) {
      return new MPEGDecodedAudio(channelData, samplesDecoded, sampleRate);
    }

    async _postToDecoder(command, mpegData) {
      return new Promise((resolve) => {
        this.postMessage({
          command,
          id: this._id,
          mpegData,
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

    async decode(data) {
      return this._postToDecoder("decode", data).then(
        MPEGDecoderWebWorker._getMPEGDecodedAudio
      );
    }

    async decodeFrame(data) {
      return this._postToDecoder("decodeFrame", data).then(
        MPEGDecoderWebWorker._getMPEGDecodedAudio
      );
    }

    async decodeFrames(data) {
      return this._postToDecoder("decodeFrames", data).then(
        MPEGDecoderWebWorker._getMPEGDecodedAudio
      );
    }
  }

  exports.MPEGDecoder = MPEGDecoder;
  exports.MPEGDecoderWebWorker = MPEGDecoderWebWorker;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
