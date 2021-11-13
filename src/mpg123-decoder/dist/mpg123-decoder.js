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
  })(`ç7Â£åhùöæ½vPÃJ0wJjR^³¾ÄÖK®Ë¬,È@ÕPP®Çö6PTz¢mÞfÀÏEN=M;åûùË×WÅÕÞ|EÕEU¼%	ùÝ£¼*ä!3öå=@¤h¨(¤¬a =@Z2¬ f__?xFQÙ+½X<3NÓs(S+ÓÓsÏz;+PQ£¾¿Æâa¥ïhÖú3hÍ³Ó¬ê³ »}®äF c_mã¦½¦÷OÒÙçT[ÕÂªäRßJ÷ÿKkb?~5	Bè[2#'ÿÊÉ	Íÿ6	KéHn&è¨	<~"çOÒî4	C°ßRx·¤Õ­Ýoúaz=@­mùôØR?±kW4¥­_Ô=@ìâHÿ¬b3=Mâ>/þE~ÌZ8ìÝ¤<qsÂoû0¬â~4ìâö>ïkAJo{z3ÀÁÕË(W5ìÊU8ýÓFDzØ®^G¶q¨¥¹os¤"E{:¸0EíÛ=JGâ]rìá0éE°5(Z&÷=JBD&xB¸±k§uB(bã¡	ã§!eíåí	$¡é]¦'e v±£þâ"Ïá(äýÀaI2	?( 	Sé]&õRT[û=@DÖµ÷ô{ÜeüEäíÏkFõì_khÿ´s\`¿0¨ôíÛÞÞü=J^E_ôÄÉè=@/ëÔn	EÍÿZ<´Å49òDôÞ¾Ñå\`p>2sÒò$ZÄoEÍDKftÎDÇÉ§¥üw´^ö¥qzÓ|ôùíU37ù9¤lwºð#þÿjèOÉ~oJpß¶,å­ÂÀ×ëM}¡whÍÛ1Ê²RWICwRM77?o-=}Åe¼^ÌA\\$­ÙÞ^ÏkºÎ¡{£Ô¡¼eH¶?êT·ÆÞ© Mç¡Ñòo1 á¤ÓÏòÕU·@¼PM«]HeúÝT·bNi£\\FùþÈi¡\\æ´Fêä,©\\¦ÿâää &5 7ÿfaÎÇ9MI¼_LEj»ê?ú#4R>ºð×z¯®µTä)ÔR·ñ3·.ÎJåd|}¶/5ÀoÿãR¤©U|´^´ú÷èþ,:)R$(¾óÉ2póÊvsÄÁ¿±	ÈÀôÍ=}qÜe=@óÅ£ÖxUAÍï%W¥FRT#=@[Äú©´Ô$ÌÔ>ÚdðF ÏÊÕÃPæ÷ïÐ+gk67¥Y-¼°þÄ¿PÝ®!GÚd3:íó3´rÎs;0½©tEnXu¥µ~Ó*E¸¼±\\ý-%QÒæ±)¿ýûÞa,k©=@~k-¹4\\Ñf¥ühUÚäù$éàiÝÁ}n\`bëÿü$Hü0ÉP as[½zrÅÎXwú´)7q#ýû3kÄº6êåW/Gx£jàFÂÌªÎ{ÍÎ¬ÇªG¤ý?îÐ­2S"LA£äýæ}7Ï²¡ä®~½¤PPÒ¸Àð ).)Ü´ù1%6Àë1×ÜfÜjU7®¡]BÝ<yhl%Ôû´_É¢Ùc|=@Ô§_ÏÆü±s^s´=Jüº£¶?iGèðy¡O1=@CUL½ë@^Õ4ÙÎÝsâÏÓ_¼Vì=@ïEü$äâà©N¢{§Ð$	9®ìýÜLCTl-ª{}UAZhdÜ'V]ûÖÓE#j8Sªüþ9=}rùÜ4ÿµ¼ÛÂ7%Åú :´ß-,Ü4?ÉÚsuE§#g4\\õú¾1ÙXCà)¥ìVdi²>¹zM,è·ØY:smdVÙ¸þÑàG@¦%p/ú|w)\`¡¿ ]QÕ=M#:¿¼ùÍÚvwà!¿ðÜàb¤W=@¸½ðøQñ¬èÖLx=}L N\`LH_ ¤ÐË eà´{÷6TH÷íN§D¹|bIà÷RU3§gý¼Ü|Ó/QÚÙÜKx¶Ñ»\\DÕwMàjÔ<ê¾£¿«GýÚwbiU7¼ûÞæEÃÌ#¡j«Ng%=}­&O¢HS\`N i[¬¦5;ØDxÜbY%"áuIw"}æe¥di,å¥(þ!¹C\`,qùRQóÊ{CkÈ¸úuúæ¢¼ægVyÜ²fØÝXU½×TòTÕwd¾ssLÕ%=}\`Ä>ÉÆJu·	ä<Ï' /?jäX>Ã.[I²¢+=@¦ûå=}$4ºf¯H÷tÖ¡¼Ï{~¡ápÏg¯MTsD°}¸ä´Ê8îDp=J.÷$´¾suz;»7UÙ8Ì×[NªÙÖLPv¶*ÇØC(·òÂÑ[·¸HòÔÉ=@ÞÄ)cúÔ¬Âê2qJÿ^Û·ÜÔdpÍÉv__aÏDäcõíÖÈïÆW*#èË¦i41kFPÉÂXlÝV÷»*÷Æbª%þán¿:¡s®ãTJt«yµTi\\ð®â?üç?íoÏEä­&lè7êÚçeÊû?A	BzRÕ~=@¶vnR=Mm6lÎî6ÕäMºHª´Üì¯æ-^.¶Õ¶S=JTU;<Òê4,#P=MvqÞ7},&^g<ß1nä1½´.«McKJy=}hÛ´ÃmÓäÑÍíÌ¾ò>-XL|ìßawqÄ°y=@Ã°O;ÝQÀ:Ýp=}Ü=MWP\\åÞç?Síû37ÍåqÐØýñr£ýÌYá=}ßæ»#åRÏ2ø¦Ì Ëe¡úE@§Çl\\ÏÛÑ½odéxËu¸¨Vòú8Ü}Àð¡WOs0T·2%T~Es¼CuÆ P+ïý¿À c*>Ç8õV#~3 ÄùízÂÌoÞÅ7m!A¥àøA®<àÿû 3ÌÖ8õz>©ÑM§o:lfOÈ:)jhúì¸6'¯´ÈÝéü²´Ó¸+¹ÜCS7Ï}D³o´(&«'oÑÀ^´4x>÷ÿ0[ï®¬²ôSÅ¿¸oGQ-xÑ=J]ÁÒv±ï=}|Í;tpv;¾K¹nCc*\`B;È=@4|©ìYª=JÊ¹Ò{÷ÿ©ÍA/¬ØÞÞõÐÍ¥Ý¼iî,lî¥7ïa[ÌÖ'WÃæk]&êÇ7=@dê|á2yîpS»ßÕ­jÇØ=M®Õïâ¹à²679j³>óTlªºtf1zøç/{£=JÌé/è*(AEWág4Çg{ÒÙ2q2¬èrqü÷·ÉA¦«'FwìMzìýFÞë¶ÐnWúÇÍeý²­sóJSt?=JâÍkªjR­º7Ùï)Wc<®»ºÅÊT)&ÑkßÚLJßAÈ(æO&q¼/~LlDè{61Q>ÔL®}ËäÃáÏáâ¥¾I©§<û #Ø&	]%Ê=}÷®	G=MdrD¾qªúªX5yA&.G2E½{>ò®ÚI.³H{HoÆqÇ=Mø*y3oQàí«fÙ=}XøH¹µ=JÞG{s¨e  àmýê[r:Í0RnëOõàÄ¥ªµÊeîÖX<ØQF¹¨!ä± Òe©%Ò'àäRt·ª\`	¿k²q£ÔíÍM¡ü×÷s¤~NUÞWÀ®®ÍHÄäf^S³R_C%g[ãh6QbÆ±.ëàe©ãÍ½Q)$#¡õË^\`#¡=Mc¦rG£Âé¡¸¹ö(=J¿±áç&Oçyç(Ð±8I$¢wB#<SÚ ©¼IÐ®M©=Je)yré%É%I.¼%ôài&ÿåõ) «)¦í·a¨p;ëKô$@vqÚ Þa7HxK¦Æ &ÿ1i&Ù[¾kZço(ÃIK	í÷+mM#ÉG#ñ§OÍHI=@[S)ð¥ÉÆX\`(àE¨ÔùAYÌ­ÑØHxu±Ä-1u5Ñ=}&õËJùÞi+óAé¨=JÇs¾I©GÙVô¾Ifv/5%=@ï}=}\`y®ôML¢âGÒTGI=@ßê'LgF©½»×·\`YX!êë¯CÆ°ï_T¡oäê­Tõ1=}xÈáBN)·¶½»Ño©Ûi3¡fÜL&Éx0RoMÁf«ü«\`ôçìdÐ"¨5kô¢KÏ¼¬vL¬K®¸æoqîò¦[÷E°Ýt¨»7¢;Êdô¡ÊÇ­ùªµ7Rû2? /Æ¦=J,bÆÝÙ>ðÆGÅ; ²´Ä;Ýñ:^åIËáûç Ûá>¤·¦âµ±ò-ËF8Hû>1·µ®0B@¼Ûu2°m¿³½Aé²¡°ÇB¶Ú=J¸ÇïcíD°m=@>|Ûá¨C¥E<Ûáÿ~ä[tÄ·ûD!à Þ=@ç×	2Í\`¶\`âáu\`pÁâá÷EÍ÷Ü·ûÞÂ 0ó;[OkQ=Jö5;WjIìwÌ¢óLËGMü5PFWn;ÞÞQ÷:çço°0¥{W/^[/ÈfÞ3n*ì)rÒ-1Ewþk=JÓíànx ®£lÑB]¬I7ù¸&ãOû<õæ=Mh=}ÔÎ%?;ù«íãNëÚ#ã¤b©àÂH0kòO¡IeÆÛGüÇãæÈDR=@Q-C=}(8{.úDVH;TÙE=@=}äBÀ©R6IôÚèÞTd¥­4jD¾o³ý(=JÏdqÐ?xL¡pWtÝà¾1e]4±Gä=Jùi=}FOäÛÞæp=@û#ëñzóñ×±¹xéTb9ÿN×Xrú4qjµP"óF3ù³ªâ\\.¾Üpju=MÝ²MF=@®!ðÕªWÝTÎbæné¢Aÿ¶¤üELGçÛØ¸Ð#+l¾nZÅDçÍéGíç£ÀûST}>³(r,§Æq¼î¼¾7á"´àCE&BP³7Þ¹±Öò>ýz¹ä¶x¬ry@bg=}¯²NcdiÊRÁ\`mG°W¬ÎÒ¢ÂX,C4)ñ/¹ÕÜ«Mûo\\N/#rv=@w;|FZd*8pðz!,ÁMsÁ<ÉÎ?ÓCìc]ßCd}¾L$<âw½=J!=}íaµ¢¼úµÈFÄøôM¥Æ{\`J4ÎBhBÎm.·´6¾¹»AÉ]ôå0ÜÑÂ½XMÞ_òÜf1{kG<!ZNÞ1	á#qõh/Këù8ÔEéâï2KáþÊúJÁà'	AIæ¥ç¹^ù'ì§ °	±dÍÌ©d&©&Õ%2©!É¨ )5£#Y5hÎF(¢hki6·ë¿¼Çfc£÷â¬¸ñ=M$ãüh²ÈHäf#{>¯=}ì²ÓýHÙ¾ÐæÂW/ûOÄÚ]­k1ÿO&Ìänk~7FNÁò¿LB.ßs×xD·&öø:w{Å"'ßRÚo£ÕUÔJÚÖ$ Ç{l¸*¬ý5Êîb1VÐîLÍÞ· ".Z²Ä½KuKÄ.SJ²Â#ßÈS:8P"ãÇGqvèc»Íõºi£é8ãIp¬aâkaR$;tK¡CrÑÎr½ì:ÁTU¡K¿ç<~J>_æ®=MÃ¡MÔæâÙõòZÚÞ=M¿m¤:¾&¨MæºjDÆE¯Íð=MÜvê"GfXóäÜò@5ªê¶ñ$VÃóÔÅKV=@ÕñÄÖ[½\`m4´&¹ñv=@áCÌól±:úùøÄóÜC´¹×?XÜ³ÞºqMEÆó°\`-Ü¯=@ÜÝRUÜÅOSbALåý?]ò)]C)¡¸à;à\\h½Wü¼dãpwÒ°ll.õÔ,°R}*îÃv³\`uï*Þ©p6£AºÖê,Àà,+­]CïNÅÏªºÈF_=MIR3ÞÝÙäÁÁ YYâÁQõõùåÁÁ¹åÁß#])Y÷¦)á(ÂµñòW±§%öÔCJÈ¿ Ïm]#3õ¾7öø:|È÷él0ÜÜu=}XX½ºÿv(Öu»øuö[Åy¯XåPåPEøW=}'»öÎ>èk=@¾ÄöZrg!t/A»$´HÎY¥|ôó§\`ÏÚ¾=@öÀ÷AÑãûøc¾ñW¦Î[ü^Å÷°?Æø÷¸Ð\`?Û°2ì=@¤Ë©À);§]ú=@aõÎJ\`ØöÎÕ"HÈ÷ÜÇ*È©.ísü®âôV}âËÃ[½ ï0d«/Lû PheRÑÇot-ÏL=@´Ô\\È¿Èeµ¢âöêöîÿAÎYÃtÿ ãÖ\`Å×Îý«­< ýå!V¶×¾ßDâ¤3Òùö\\éÞÈÆE0@GU=Mh°'mþ	ª7C:ºv´*Ì[øtùÅwõV¦+~{5ºÁ-r¡¤ûVÕ±{ÖÑ­æÿeTè­ä´Û¹m+¾		{é,ñz;EïEVvQÕh(ø^uð~ÕÚ~Rè\\M·®Í3tþûòhùqý¿¬ªgÊÊÌ¢áÌ¦T<3¢áþÂç^F{N¾OÂ8SvqW%ä«9²j?úR:Ú|îP];®àZÒÍ²Ónä_ìBGOóÁ?Oñ±ÉÔÆ°OÖ>ü³âö¿¦Ã¯sÓ2ÐÆèþºýló1~Ü²%äÀ9	¸¼u´[­ëØ×@PÔ§¤ËüÇÇ(vª#Êt¾æ­9íRjÆÌjÏ"Ø=JÜo¥·8ÍÌÜpLLá]hñnÇx»Xu©àT!X/óÑÉµ¥ùØóq{½f¼=M´sûÇØÿ¥íf@À!ñèR«¯ýÏNÞ\`$¥í6xSìÑóË<ö=M^GÙ1	ûDëÚ6 üE÷S_$Â;Óù¼ÞßóÒÚGx°N¹¡Å j¡~ÃÔ_ÕÓ¼;¢P/ÿÿqkµ¶Ðm7îÕC<KdzòÕFÁM7¤=}e0¿Ïª@K±®yÀØ;Á÷;n+s´/#=JHRðgüÿ·(BÓò}÷í³ûVo æÝ¦Ð\`=JMËÎ@8XGÚ.VtUÎkúü?ûç³%29@	=J¢©ëçº´Æ·¡xª\\D[Ë*qqeé0)Å\\)8Qk{ë0=}WSsnô×UvÀ«G^ÛÎdý¥SÚ¨ºyxß+Î\`:{9tº\`Ök»_Fÿ=}Ä\`8yC=}Ô¾)á½Q©Þ'ù'=MÁÙÅq8¡ùã1=}_À-oyçjÆÄd½/Á	$¥yÆÝH|Éü­ØUIÇå&!i$ûøö÷ø(I§F"ÀXJÍ9ûì¦NÉè£&{ÄzÅÇÿÎÞ<ÙÃ¥n<HuÔVD q/"¨Ø·¾ëéÉö®\`öÛÌÍ©hg«¿é&=@©·²_;±E_ Æ,\\"ØÚ;R#=J¦bÔçÉÓ!R~øçr	\`.\`X9Qêùgäpñäd·Mÿn¨ôHO²pIQ×÷÷tµl+\`áX Æc35^=@éõqè%äø¨=MùÎÝXY©¡¡#Q$ÎH©	ôW]í¡Dò1*D2Î#ÃÞ À>þlnå¡søi=JÅÑ¨ÂÞ¨é&_Å!+Àõ)Ï)Ëc REÊ×®kJøÎûI Sÿ¹0Äwå=}¤v=@a3_|bQwê*öÊ6Å¸!¿71«øãÙÎ«TÀ§¨qafM'Õ°úªÞ]ß¤é¦Iöj·Ù\\§#è3WgÙª°Dó&d©pÑñî¸PóÈ&ã¹X?§r¼5ù3ÂÕÞÞuÒÐ^àQ=}D?°S°YÄýý=}>¬$&ûÓn×ýý½^E¶ÜL?â=JÍñ¨­TêYI|â;BD³misËéõÙ§"ÌµX#±)q6·)ð=Mí\`ÿw×Ò#CË8°ÀZ?\\am7Äé¾(2=}¤á>±~2®àðª~Óc[DæÂ¹f{Q¶²&»Îi¬=}¿iQ÷7ñ¹è}BñWÊ%Pï¶ñ>£aÌ¨îÞ/ñk´Öûq%\\1ÄtlÇbðèeÚvÜ¶ÄàB^SÔÃNó¤\`z=MÅ¼iäb3°ÚÕybcÜà³Ix¨ÿB7ü?ù%¼"¾§üè«óØm×@KgÝ c,ýAH¡SÚ#	Q ù2¼RIÊ>R±óà\`M4c±>s^«:Ðÿú.6D_³BÆ ¾[?ç=J	ñÍ0£\\Ä	+¸½þS«mêö¨¿}ü­QåÇ·7]Ð­ÄnúTº3¬ëËzd¶>ö{:ÓôàèÅ§u¸33Ðc+ð½¯3_^oBÍDbP¯bÑÄÐlvxÂþ¾CÓOS·@¶ÂÞ?ÖtR¿ì,]/U[Ç¬?sÇ¬3/UïÌo»ëTlG³iSÃl<ZÙ^Q>tÈ=}úGª{öÏãÜ}ÄWQ½_÷i=}¶d´Ò	=@;=@ßÐç"Bï&Èñ¶ý\\§Üö5ÌUØ:u_APjÐr:aË¹jmº¯#¾rNRìîc&x¤}Éô¹©ÙÎD,a_ÿ·è½Ûä»sÞq>*çÅÄÈ¶*wÉj{Ä\`Øwü6þÄºü{XÄeµüÞV×<cª×ýc½ÐÃjÝôÅ¼¯s½0dîz»¡$cÅ=}òGxj@Lxê±gxºþ÷³Ìmø>Sí ÆzIÆL9å=}âÆx»|þ«"r	µÄZóöyúQ]4£EÍË\`a·ìÁÓÅqrÂXÆB<r¥6}ùBögéo\`à¤fçEÅOÃNpoñX¾vÝ´K²uF}E2$ÃåÀN~.3|ý×Ñ_¤èÈÉí¶¬9s=}E3ÚÕüìTfÞS=J21KûEðXÐ¿¾ÙûpÔZuäV¹Ï3rßïóßÞAïÞ¾Ö+=}rgr%A=J+à×P"©<4\`'qsðÜ´ÊpA®¾Ñrütµ^5Cç2ÝÈÉõá-locì\`Ú¿\`Ú|øþ\\Ç1I¢UVq¿=@Ãbê2_wñM¬Cô²=@£ºä7U7ðÂÓÐ5§bïrNìÌö«ä»º7[,ER=}0^uÏùMo"oDñc*×RdÄ=MA	ÏýTæê	®Ø ¶In~[<Û=M¾{µJâÆ¦ÜÄ²DºÅ" ÎHj2ãó=J}+£úÔs»ÕßÆ\`ÊÇÂ]#Ñz£ï_¹¨·×´ü#Ïeq9(ñ:Ó=JÖ¼re#ußUäGr¥uYFwÃýP4=M]gô´>_´4ÿLe:¤A>þÕø<¡7¼Ä_!ÖJ2Eµ·&¤¶ZÄÁ<Sù$Æºõ)#Ø^-ýð7ñ ¸:±oÉXq^Á©cB¿"©gU¤UgggUT$²ô´??´?O[mzyßoÜ¬^°7)LýRðß0*÷{ÓÊ¹o:VA\\Ó³ïDX°óÚÀ=JHKr¶¯¹¿ïñ-×0b!úBVh:=}_0d]×¾3ä:î¡÷Zmõåâ*ô«Ã7Þ0h«É¸­0æp]lë[88­qþm9hÇvR_bü¥=}u:G6=@7I7±<Y¯­9þ[Ä°Cª!ÄáÏgôR²QaJ(@kÿB>bc=JrPÐìJN8×tET±<\`úz@lòÅg½UGÌ#Æ8÷0ÂJ7÷Ce¡ýwî1@I>¼)ë¤Ì21¡9QöÕ«ÞöÄ¾ÂDªO7ºÚäH(g\\]G(Äé4¹3Ú7­?UÒ^Ðm½*ÏX+rX[Z­%êdßPé=@8Û¸DüZÑkÙ=Mw.733B{àÝd^ª *º+aBÌôD=JDó.ì[RêdJ¾´hÛaôúÀ¬Bq	ÄÂ6Ò¦}õÜ(îëÊ÷­+à½m;ößr:~Ë,½¼¼É9´c4=MMêì0±-Çq5$Àü	\\Ã:ÚýY5\`[|44ÎAïØ¥ÏÚW7½.3ÕÛ±À.C=}¼¦|T;·5HÀbbÊå¯^3ïhÒÄp«ìêºàwÞ%nkî5OÜaÔÊ8Üx9ä·îïÞtá¶û7ò3üX½ü¡Õ$Ð§ÐHjMF³äl~ÿ© ZWÓ>*9I¥2O&³üL»×mªF_¥zW°ÚxïjåÖ=@^ÝB´]Xõo°imu}ü6Qk¯ÊzÉÚpoVâó>³¦<¥|´kfÎ].§XM>LJïÌDJ·õôLJèàêD¡UIíÞvDÞ:AO7¾3Vö¾j1dAN^d=@ÁN7u=}Hõôq_îÌ¶~ÙþØ÷Úo¦|­CëJ*tfrÍ+yn'}»:>èoD¬	Üèñi%=@7é7Îx.é#mïÑ9ß0R¢ZGzò¼lÍbÚ¨ÿEi=@æ(ûí±ë=J§¯y(>d{e¿e?.À;E% ³Ër³?b«§K_öë¹<7ó/tý´1û®üã~óÛ¦×¶Ë¤ü½	¬7T!Û°'}]¸}75p4}¦H([Ñb@0&ßGÏlJZE¾xIì©L{æ³Ö´¼ý±ÔÊ¬T¤v´#ü´=M×¼DÇ¤À.ZÌpùÝ½ÛÔ{ÕßºízÙ$¶sbD-ÔÅtáÅw´«ÙÝ§¼²$HnHÔzá*Ü6w\`ß÷Ð1*?ü¶7¡Ê7EyciHÕV@ðª(föáè\`â¢0iÔGíðW#n=@x"S~PÈQÏÇñÿdý#°9ÒÇµ~ô~]5¥B{&ÀíIÙfÆ\\¹@*s8ÎÉâé_zzjÊ5Y|B7MÖ BUv*\`Òïn-¹n=M1¦LÍ¾|tÁØs#¦ô/A\`óê¸eZËür¡+öÀaµ½ùÏý}¥aK¾^Åk¯Àz;"_ÿÄ¯¤:QÚÞcP­Tº*V;®Fî&¼jj~¿¾Ãt.¯m?W%:þ®K=M%Ö3í¸ÆÕÊà´dj©t´0;ëb:ßúðJ¢Í;7FþÖÛÊË£Z[aü¹ÙDüXüë2láÅÇ·6õ3û¾L?b£>ú<Óºá·ÎÄlÃ/vÝ&TÜìÌHÜH¹ÖíýÙkÎãY¨7ìÍù6§z0Z+×¶@UL©ÝC-åp(uUµhûãÞÈEYòº«¾Ò=J£rÎK:æ7¿CP5Í8d>ó>]&'n¹vm5ÛX5Ø\`Ý²½ÀY®£²@¨Õ4\\~	/#&QlaB¼=}·XD²Þ ÝÕ/¬òÁÿSÜ&:Y1=M^1·iH?W}§è\` X«A7;3mÕlÕ°ûEê%sÆ6Õ=J\\¥¶r´Xò<\`6ÉlÝdwS|^4ãGµ:,ª]ÿÎR#%~]GþË!CW,gòùBG)46]ýÅ°§])Hx5:Hf³'(ç\`­_ÃÑEçOq÷ÄhÊ+©YWKÕÐ\`¸Ì&»¥O@Gq¥ò9¼ð¢¤Ñ¾tmØªwAõÞZÅ¼k¯¥NÅÔ*G@¾aÿ|è²\\±ÓbaRÎþfW}}ÂÒÀ5F´ºK:ìø~ÑÊV=M=M»ûpHÈÛ@=JlÈfÆ+üÃK@¬dßÎI1Áqþ[v0Å/p1ËÌâ×Z	»1#(YKÄòä'ÓFéßû³YXDôí´Â3Gq=@Ï=}Y­,µd^\`á³¾_TóÆ@«;ùT»õÈiC&À=@Zv=M0ÂvÂí«óà~ló[nÍjz¿¸Þ]¶=@ÃîVíÛâÙraM»éµSµ¡qB§ÿÐu1ÔºÊ	Jbæ'+Ìè5¶DmSñw¸¾þëóFb~£-óUÍ­ÜCýj\\^5wªû\\J¥6òÒdçÀ£ò÷Ñ"Ñöªbò©=J«S=}w¬Àûë¥íwû-83z³âÙ^ÅK±ÇÈ!ñï>w£sÅáÐU»±cf1Ð·û1VKÐB£èò?rO®Æ1³Ó&Ãâu¿gñ³nÆÁÇdTø^ö»âKn1QP¥%8CNm:KÅÜÝ/Ó·îuÙæBXü\`_¯¥r£bÊH|6ù¥¢9fÖ#¿ÁM¥äù©©ñuD=Mlh=Jl¸a¦´%=MK=M*dÒI$4ä­/ +ê2×ª%[k_1=@#Sù6Ï®¤EB û4³7ßÑÉþrF¦|M»y=JÊþAÙ1>Ó¹²¹'yÔü EÔ®íApRÉÈp#éôìúBú0}-:È9$Igøÿz¾ð²êø#-)¹oòB Ä;)h!9ë¯<_ÀY¥ÕºaÎÚ×§R^Äöü{bW÷°{¥²ÞSV7=}ë¿Ï¬Õ.'èÎ¼Q(|G÷ÁçïL8lLõ2îTI¨|2î_Hri+DÚÚ3âÒ=J"Á*ôÅøÞ«99Ã^qþ<@¢{7U	^¢gOÄ#}8mÎÜ­5[ý/dÛ{QÂ*íÚ´øWþçÍH{*:Rè>NñEM\\"Ç*ÖVMOÔ\\aRDT -ïaUpàÕ%E;©Y£Z®KÅ(/Ó»FyÂq/1¾=}I£*_xlÅÌ7÷µcØj=Jâ,£møKzúX­ÙéEó°ºoóaôòv Î*ÐPÓæÂu=J¿kl½}0}Æ.@Î@Å"ÜP7¬¯~ìMdéµm\\×æ½:4®¸^ãæám¥f-ë#rËwZÌ1óBC5èÊCF±âD<eyRðA£ÃÃô×¶\`Ò]å3¢A[FÉ2=Jrñ®xUí§·@Ó¦aé±ðEp¢ã2}¢íÚÐ<´Jt F¸=J¹Ãý5úÃ»kFÌvå÷J|Â¯üVuÚúµ=JÜÔõóopëáÁCõ]¨ziQìö¶.¸ûDÝT#åº×oMºðà²ZÚÙ5±VÎUR6I¸¦°·Ôß¼ß6qlÕì£«óù°¹Þÿ0zÛGÔqÍ1îE.ÞÍ¥_R$ärãÐÙþ#G7^+ÙÿZ¡¸ªh³Ä?(WÃ0µÀÃKíw^¡Â&48sdÑcÄ©6Ñ¹­,ð+÷Á[k15X¶ºÝ&*y+QmwxéÅpX.°y°¤«áN[íT«ßãÎíÓû>ÛZ­ÁåwøPÄ|¶¿Â/ºÍoÄFÛ øÎZv¡¤Áºö\\=}×E«8®üOÒaRc8Y]Ï£³Rõè´å«-Øð·?ÃÕ-Çc¤º}5­ÏííhíWÁÿ#6üø"£:¥l8Üc8ý¥g( ´¥A8ø1¹üàr9äÆtÎ=@f¥ÎBòNÏO£{ê$ým¨W}+zölqmä°{nHâ©j=@Ýþ¦³©N¼¸MVe=Mc[]dÕÏ¿Ù½IUÔ=}?ßÅÉC	ÚÎ(÷Ø(7ØÍ7ñ,vc3½í1øÇFåF*rQ;¶´´xêA·³ÐÑÍ#\`-@[|uLÈJÔåpV6ðÑábz bzàX+¯¦oHÑô~B*eµ	zb$÷|7#¤q=Jt.TMúÏA*ðmVG)rÖûì¤¾fãàÂWÂ³LßcÏ{;ó¨ËPWßp=Jò¡Î=@3¦¹ùøÓ,ß¸±À\\ñßß¨µ4¯bsç^QZ.pÿr4L¿V£¯ieL×ó=@rÏÝP»päÿSõÉ$.e(TÜ=}t§(#½]PÑæM¼üSÂAÄP0ÜÜc0üºo=@xópÿÓ¨ýþ(§d{?&Õ¯9[òÁ¢¸Jü¦kX:3£Fn V°ý#´=}ÇÉþk¬­òø´Æñý¢¥¾Õ×x9¹çÐ¥AãR§H»o>ßWM·§j8Y!Kù~¦yÑÅrñvîÙÎ'_Ø­¡ =@Ï}SêÓaF$¢îÆRæîqNFQ½6fÉ½r=@RîÄUKîõ¤h²¥euëh¸©k6àªväâE÷Ìç/ºIl0×  ïPO!r?±ÃÎ22mt£;ÎÐ¥öÙKXöøüÆºüÙo¨5iXá¤Ç£yÂEîo£Ébm¾¢A§þæ9ÈKY¶h	ä¸&9¨ãÀTÜ	÷¿qbÂ¹ZG4[N|SÔM1eAÛN)»=}=}o§Ju¸ëF}ñã¬NØ¹K¬,Ûñ÷Äª«ºmÝ?HÎ-LI#=@ýëÖyh] ¶ô»Ý(fu½×S¤TÒqså;Ïô_é£çv¦}ÅT]ëYØTÿÐü yxÊß¬D°¬Nó}GxRó=J@É­"î,W\\ÁÈmö#"\\#;Û<ÝºyÊ£ï±íxSt}¢8dyÇ-mê³cE§1¹ßnÚ£$~°=McKÌÊ#%f¨÷Ñôé/§ßö·°ýÁbÑÆíXÞ¹»+F?¼ qãÄy*Úý´¿'8òïs-+:ÓZªHh_/lý$Ó¸çéßü{gòÞOsìmTMG¸á#´®¸Rl\`¶¼êéëÒ}û±úLÙ£ìãÏÀÍ£¼ÁßËÍÖÅC gTUî«ÕR÷^>ÑødÑmza>,mDú«&¹Öt|a3ÆÈåoæABx¾°S¦.GY[d1ÄÞ1M\\ÈNL_´ë;ðL\\ºêù¤ÞXÊéÞ§Â ÿ²(ý=@lÆóu½¦æÜ¾æQÉS.qTð[}@k}¨È9µí]Þvý<8¯ç@ßõÙIM¼zÃSqÕsÚMJò[â¶Í±ñ§Ø/!Ø5ÓbÖþTñ]UYà¿Ô³ÞÁèÒúÒQö©9'ãjû:<)µ¦<Ñ=@ÇÜ¼F"ëºíä8;ãÏ!(MÜkó½L1£ôËxÄ9ÎÈ~Æ=}jÁ¸	6&J¸Ðº\`oK¡v°<¸4o+óãL±[H+þ¢Æö£eVø#Ìê ó­{Fx=JFm=}â7<DsÕbÜ¨ïÎj xY.ñÚ¦Ú&Ã­l[ê"º3#nsÀy(¼Ç	Û¬UÍ¹ç!¶Q¨3×hX¥sÃZµÔ"¾Ï&&í!îêè	Æ¿CùáqyÑWú(f§ä$oÐ$b(YÔ9|um)åÍh	MãÑ1Þ¢Ù!\\Ë9¥v5Ù¥dZÞßàÔüo&¼=M¹:îÎÖx®Qº¸Ü«³"Ã¿À<té\\(=}(«¨Û=}ÿô×8xiþ«yÚødÐiýÓí\`uó5~ÊA£û?rxeS¼ÜQÑ?ÖIÓJXRHZø¦æÃ{N<4GySý®he± fÉ[µM-vîác/ZcFÎûª},àI1>SÜôíÌk±ñ¼E¤7í[R=JÜJ;º_IÎÇÕ¶Qa	MBÃù§pPÑ?VLEÝ#gXÜõv×ZöÒ³ËN#¤=Må	_è,¸qù®¾÷HD µ¬URzúPMÜðÜ=JÆà£w·õôv6~Yþ)PÜÑÓïã\`Ì\\[ÅÔ+Ð³K.ÀÊ3þRÂ2X+´ïrû«ÔÁ1À§Aì[NtuHF7¼û=MRÄâ[beëÄÞhÛº¨)? ÖÿCØ»¨×ì¤sESCù´ßØÚ÷=@Bëå)÷»©±dÉÜÔàÆÁÑö#ç§ôÄhY=M-½wÎ/j¶Qá,Ù=JvW¦ÿ/ÏY»HIãÒ´µÄ³å¹äÿo>ù0]l!{e¾£öÐ±÷ªqÌYîÝ*!{ZÑ>xù] {¡âRG	#\`hÅoÏ?ÄT"»ú[	iVïÅ¦4 ;¤û$ÂE´WÔ	{å5V<­ýq^ëÌD=@dIßÝâo×áh{é~Áo×àÈ{¢ë Çö%|ßyÁë]ê¥%ß©Lå@Í=Jov)§½Q)pF@ó»OzzòtænêðÅ\\ãTl§h®Ç9/=}³	K0" ¾jÆ~=JV]ñ³¢g\\ï=}gnj¼Ö Û²nWüÛÊhà-Iô³3ñcÛ§g>eí"=M<ÂÄÆ¶¡QK<:ÇD¶Ù1Sª¼}<Í¶v´eòL~îX4<³~	=}¸uoh¸aáñV+¿Å´³h'?!<imQvün#Xhã¢ë®		¥§¥&µòK¯Ië	_î,Uð¶	¿¶ÏYFGHM.¬z§Úº[iúX{%KU·fNW[yAyu-ýÎÙk(t½ÔiÊ~é=}®XëwqÖÞ÷§_ýË]à	)UÅ+DÙód0øFuMêÂ L¢·Íóþ^[ÉsúÐ¼ñËËÞ=Jîkòó¥´út R®æ%1/â9ø=}¶><÷­¦=Jò²&!Ö»=}ÅÐ¦Â1G>Ël¸§ü6ÎÇG=Jò° S<Ð1M"ØG,ÕÎå¬¬E?¯ázÞçÊÂþû¿©ík]iNR_5_bñ*rÓ¨4@ýXp¸}hX¡Vþ}\`QT¹-Ìo{bC[Æñ=}ÝâTì°\\¤AøÉvyµíìÆiÃì³tÇO\`QB5x~Vö#a»ëfÿJßÍÓÐíÑ²øð|àòp<TZsD¬DMüÎ+þð6äpVÃ®­>üû 5WañR~IÄBB-íNTÕgLï^Ç9EaNô5ÏÅPÃ¸×Â¹Cdh«5,QWg¸/<;Ï/ß	ÄéT5ô^^¸üáe¶¡\\Üðå;ZRª±¸8XÎ	7Ø,÷ÅÌX=@=JS°è"Ü:A¹ðNìn9»Uo	èÖÖ­áÔ=@!'ÞÃèá!Þ.ö¿m2q|OºçhÎ¾XÁ÷ÒÒÌ·ÇJÌÿ¬Ö=Mµ¨Ù%¨ñ¸Y®=}:S½1~ö9¶f;3A' "Í¨ÁE|äïe£¾Ã§éµ¬Ý9år\\l"oæAq]ä¾=@D»Û¾_UËÌ·Íó8§±a¼IØ¸0ÐLGh{b}Qca0/SçË²\`næç¶sµ4(\`b4§üXFîê0·ÌÌ¨²¨_0ñÂÃ78ÃÀ·Ogîæm«×	(bXmNÅÌIísJ×â×3»êÀB|´×§R@kÀÆRôÿGü,-CñZf¥}ÞXÕÐ¾ÊwT	¹]¡£Ç¯Ï¬¥t[xR&:¥rÙÛ]wØÚm¨¼ÉÂ¡¡oòü"Ñå¢ÑÁ·Ì¡Ixa×\\\\¿BUj°~à»æØºj/eB=Mõ2ÄGü­'ì!âMye*9Ä7°éü0w·tÅÖ"¡E£eYarý´ó®ÜÍ0< òý»¬ºí¸=}û&våÚ½ñ#âÓ3=@=Mß=Mª á¬=@XR¬=MB¹áäÎ7¬c¸L×Ûp¬ÇH'^X2cròZtIôð8]×9Å¶¨Ò¨°<{ÏLdãJ^wpk»[T*ý¹K{Ã2l@àÊFÅX©wá½þ¡e,¸b:@G×Ýd§ú¦ö6%ÍÌô¦íbÞoêVªAÖzÜ?øþRP±ÎH~h~Ê[=M<+àJÄØf9SmØVºT2Y¯Ë@a=@ÆüÑÉËK=Mhæ>üh\\z=J=}¨ÈhßD^Çar¾sà$À¯sv²°iÁP¤]ÿ$àhÃ:_D^fEuÇ­£æøêÂÔmJÀÓîi]±ÂDúõZUÔIÞwX$p@©)íÐ¯4d<ä®2Þ®$uÒoWKÙ,ØOþ!LÀºw7Xv=@ò4i§±tÈQ#¾qÉK­¨û.hw}$Á\`¯ªow»/Ýt)\`ïÀ.v=}>¾kÚe©ç»£úcUgµì¤ÀÛ4p¼ß²0yýºÐà@×a?³YÒo¯Ç|øSÕxµ7¨©@o#ëëÌ[^=M!ýyò©Ì¨¼§!yÏ­fH»Ð÷©«ÄÄìw¹Vg1L¸Ù=J6GÃz¤º;ã®!V6«Ç# HÀÃàå&ÃÁm1yeÂ ÜAEZa))ïÆUµæN?ýoeC÷¤çíuõªÞ=}eCt¬¶¢Ã0C2f°t^À{Ü=M êú¢YRïf\`ÏîÑÔ~÷j¥¥<þVÃÀ-°pIGZ[/¥+Ö©pÖ(½ {)ÃÐuKûûæ¡ýÏ#ÌÐuä½ò5wA£¡=M°©;Ð±!4Öf?Eÿ)¥àÊ·ªÑojýLJ¤2+?}ðM¿Îw&oËÉÏýw¶µ½AjùÑ:v#A¡2+µdnr#eÎ#=} 2=}yoæn.=@Ñmð,öK=M+w«8ßàlÍV¸t^3lØs¤í?Ax4g=Jê¡w·èÞx]bÜ¿ï¯Í$W}¢ HõO¿ríæÍHýLTåãxÿÊYS&æj/oxËjàR=}¢ÄMV.=J\\ØÕók~.¨ô0fòqaôõ)­(ÆcuS¡ÖôÁKá­Ú}ªø>é\\vqá	ÿ¢ÒÚK&»ð#!]YÀñ¹Xz!¾ÆK[î=JCg>û¥L³ûosñÂ1så|X!Õ»{µ´ÜæØ}øRºñØiþ>u=J_Ó×^u!- ^Py(QqÁ}Î®Óþ+}ëNU5#N>v\\\\ùáRÀV°sá?Zó*Ýª3Ï­ÓÜ59u¬3¥=}1½]f=@ÆÂD?½©Ð<ã4s{®æ,eJj%ÇH³2XÑvÅd¢NïøæÜ	õk[Ù2X(º2öÍªäo¥>îLÍú{[dn=@ðCqk\\o	ÒfÃsA6¶8bõY.ÑÖ¼4bÏ;h]ÆGï=Jv¨6bK7øäáåZ-ïè"CÞ¡øÊø'ì]ò]x5y-øÉvi-Æ\\pkÚ')F_V%É8_òu¹Võ¬Ã~ý?à#b#Åbvö¶ÃJ­Zi_ÞÜz3ìýê	@9%ÐõZ[ßûÛYót%:X¾nf7¾ÈîH=M½D]-çi-e¤<Äv®ß¶ñéEx](»¬pæñ#)·,ý¯Zú«YFuËÚtO$3*÷³Z__¶Æjó¢û>cÀ=JÒwr¶ø=@w+bPÝUä@p3cÍ«Þs1P¿7tØÞ­³1ë¢äêOì2°ývÐÁb«í =MÃû¦.ÜVír¹¨Ó8¤kÕCKV¶hm¼fCÍO=}§Ol0=JI!ûsôpØÜ¼Y6»°&5éCÜÞÞæ Ü»#«fäÝØå=J·máeMÝÅ{«eðÉ	Á0#¦ªÆ{X#G2¹¥Xÿ@}4Ú}_Ý5ÓÌOÜùÍ³a	ÇÐ8_<qú!!;û·£¡Îân~ð¿ïeE2ú:=Jæ·µ¡ûAÙ7ä\`0¼®îA0giAÇ¸Ý"¡¸Ýb0<Ým/ú®déÓyªíåö¶T¹.'ì«4cå	ß5¸òùLÐcN¼ÈÇ#Â=MìY /Ãá¸å÷Nýõ÷Î7	cáoÏ¡<úµ°^k¡Ê¨Ésnü®NÏu¨NÆ	H÷à-8Óñép9qkùFñÆáAý¢îEòÿ¤éb§& ¿×°c\`þ8ü´p¸Âïdn:³d±Æ±íî +¬<ÔEÈ²ö¯½q¥qøý\`½¡aÛeµy¦tÍA"#hYô/ðáYî%Än=}H¯%Üm&óÖÁ=}l¤£}ßÞ%rÀT»ë6ÆyÙ¼ýQºY÷=@mÚqnø£ßÿq·íoà(ÆÔ uÿß'ýéi,sM	JÙÆø-è\\%s£è	 ä&Õu©§Õ¢%âXhÛO©ÈÕK[5 K		m×%M7±ÝüQw=@§ñj2us9sfð~åÜ'Z´ãÉ!IpHò¤=M°UNÎäV¾uo¨àá'ýÕÙâ¤þy¨  å)¾Öà¨ )â£!ÉY¥!a/x((h#áhÓ"'%äØèôT±o¯>YýÿÌß#m(%sAU5$&õØUô#=M aBq!	éqÏ×)Ñû¯Ð)<()5³Z?/IábX´ûQÇç6½ÓäÇ(Þ¦©Ëíä§2ÊÌGû8=@¦ÝóÚé©B41ëbÙõ¢)Å¿Gg|gÍ3Äy	!'OÛ]2£»I,ñÝþéXÑ Ù¥Ç%*½dû^có,½Ôuþ|iEEIQ¥ñï|ßV'TÿØ¦@»gª0lüUº]£=M8	È=@p=J!ËyLC  hCaKYé=JÅÎK÷Â)´©§nV¿&r=M·é¾ü¦ò¸úÛ'Qï¢%=}I¨¤]÷¨¡ùi½©qÃJé øI¶þÑã\\%óq1 ¨÷_å¿a	2çiµóÄ´±h¤#Ï%3±9+s%¶U|v'ÊR+á´ýS!¼=@ =M58´8Aî@ã´Thq	ð.¾ú8j9ÚÚÙðãÏ2!/¡qJÑËV$º#ÄÄÄn¼¡lÑ×¸1Vc¿à²bÇOè=J*Ùâ"zÁéWÛ[¼¹¢è=JaGK°Ý9ÁÇÛ)Â\\?pkD¡ÑÂY!X=J£îÖúÏÞ\\C+mõÏÍk@ÀpcÌp  O¥«¨ìèÚ=MàTåÖ8G¦æÒ"ªr¨ÛÑ É~÷+)³é|iU$>'f-¾&}ÉLÉZjðq\`§¥æ@Üfû=M¦@YFbb[,áÃÊÃoÍoFBæjrÅùP¬"}~p³ýáÞ¥¼PÇ\\^Æ?ó[öëæ;37ãîÁ	e}0ØÑÆÓAI ÎÇ»¸jecôBÉõ©GüqÆ<y§Y:M[	l°BÏb=Mr»ia#¢ßú]SÒô¬\`OäßsÝp_ß- ãDFáDÀE²©âJWa¥G.µøÛ¶è=}çè°é¨±õYãYQ]ãÑÆCÐ·Fòsñ¥lÅ­ê0¯fx[îÕn0ý¶Èb(bº²ÔÝ	×£×ù{ðê#ÜÍ,ÊÆã¬£ë	ë¹cw/Ï[ç$ÿ*ñfTÕ<²<ãsïÂF°ÄmV#Q±lÈâJrÛvwJ­çÇ6=Jäoy¯(@²,¢X}ü[ÈCRl->ãðñæ:C<ÛÌe±¡pâ¥<b¨G}óÌzé<Îõó<BØ-$G×ÁäRwñïÒô}É×³£yWÄuVgÝû3/=M¥ö²¾5Ot¦ÖÈ¥ÄÄ²¤¾0O¹Æ]Q¥øcxúæÈôéMódáû4Íh¼hK_¯%¨ãp¼Xà N¦ÇÇÍÂOUWOEÆÑVË®=@cè-Y^ÐÓÿj^Íãúo@©wá¯@ÃE~Òb¥ zMý7AèRiZwxV÷_0jß·îr ¸b>×C|aIí0Â(gÉÁP¯÷¸fi×ö¤p3-å/&Ç·â°º#¢(Q1©Ð¬ÿ¸o©$ö#qXóýýØÁiÛoø¤£AkJÙ(ayË´ÆÍ=@ ¥]ð?÷5¾7cN#t§[ÚG¾9E(J·²ozÊÒ¯p¾WLÅ×.Ãicº@E%/F¥nåÿ¯U ¨L:	¸è#ÐrÞú¾Ô´qâgØ«väDÍ÷Ã,Ýã! (UnÐÚ÷	øQ½-á7é#¢4º*6\\¡4q¢rÁ=M­Bôl÷¦ßÿØ<ÛngO¦ËÁµ¼èZ=M\`¶g>ýÈ§c±$Ä>Ýx-ôâÖ¼³,Ñ ÞÆwK$Ceiå=JvïfàÂia\`X¡­9Â·X²óîýÙdäÂÁ\\¡oVaÖØó:Õ¶)Ý#ô	rì	'¯	(þßbÆa¼òw<ÝÑÒá}Ja«¯#·wÿ©¡'éÝ§¿QNö%çOÿÛÛÔ÷êJX¸ÙFfàïÍ"µ×ÿ¹Ý¨=@£-Ý?¸*«Û+ÙÅ-Ü{ÇuÕ5ïìÌÐßÀëFÏ+ä Î®è#z(YÁêÿ¸\`ão¿¾©3­ý4ZÎñ)àÌ\`g¦Û#¼n|FdKýß!ÕòÆÜX+P)µ·#TWpi¸¢vhNÇzrdÿÕ¡£½Ù¬\\§« ¬ÔÝÊzÉ+Ó\\YbMÂ¶,Xz«©'Ý#oÔo¸éãa±ôÚ.ßôÚ>¥>g=@MvF_Æ 2?¤¿®øÈÅNÜ	î³óÚ¶ºú\`9ÍälÏ'Õ´OøpKì=M$ZgÑÊXÅå´ßí8Ñ¼Âµ0¤Ç,XSâ/=@þ!Ãm3]+ ÙØ¡VÏyßãW¶£çEÄÎUgáa×\\5é¸{Áû=@ÍûÁpËõçµ÷ÌD](T	ðS ¸ü>âyÆépë fÁ¡\\~bßå¿ÛN +ª6!£XÈ»v"ähàË:|6c5ãUõö£ææmÐÇ¥èÖK¹üÒ=}=@\`®2°ÿ#/A7åË#K#f·©\`åq(¡ÅóYiAâß°®¹Wåý:¡wÄ}j¥#=}6Ù5½ñ+öëu«Ó·@èëv@åhûSzÿHð=@ùZûëÆB«p»¤ä?$~.UÓÑ0Ó½kqö?2qA&óÔsÁ<àM>}!Ì÷À©ê=M¹ÊZT\`ÐÐF¢	ÛEÚPªRÂ©@IiîãÉ8@Ü£)÷LXø)³¥iÆ¡>Ï&¥L¹yeÏÜ|Ó|¨õËA÷ºòâà(«áÊH¡òù+ÿ?wú,)î\`Íàuß®ÈdB·\`s½ñaè5¨|LüÃòX|ü,^»AÓe[ôõp?Q\`Ï3e?&B£º)$¡a]¦þÃ\`£vßºmöx²"Qì&«5Ò2ÉOVíåûy;Ôi*z¯í1\`3qÜCûaBrJIì35Ée\`tæXåaM¤æNúAÅ("mtæ!¹9AçiçRçë ¨â{å¤}¶uY¤o&âF³ûþ£è,íL±LEÖ;,hù)=M89=J¸Ú}¥ëZég±ñ@Ï×e©=@òaEÄnD%xXÎDW-çÔtP[\\8 8lú¨e0ëFy1Mabüà¥[­mêC«ÁQýZ)ís¶Cq£*iþÛ4'ÃÈ¹÷AoÆIþX7È{ù°,lyÒnHi:ìbÿÖ-mQöI}	ØðG(éãHvBD»V;ä}	é5¸·sÑ/hòi)¸i$RF.EwWÇTò àGÃÎ§	£ÆT\`ÑN´ál]^b)Ê¡y5D6(¾!å!éÿ%+Yd«.ôQøÑì¤(Ë!4¦»3°=@,È/rÂrEÛ«B=JR=J·lÈÕ-ÝyQX¿©g<¶Îá~&YJí«IÖS¤~Er§VYßõ®Ç»Â³j.¡W¸aq?¢Bw; ýÉØ¾=Mµ ½ÜKÝ|=@â ¾,òPUÜcõ|£q\`Ë~E¥J·ëÁb[ûäúFdP±³ùÛwÊãuõ0²üòtªCu"Æ¶µ/ú¦½þ=J,Rß]ä]SzÕüÿvÏE¤XFë¯¸ã·Ý?þMG/®Ø\\aÔkÐÐÝV7Zºe]V§[£ïÀÞÔ´¶÷AøVsZ.&³;Ó¼²~·Öp_ùy~®¯Ò¶\`a£Üq#iôØP4.OkD½,ÐW.i¿s¾¹¯o}üúåü|A)¿t&µýïá%ÛÑµW¿¬|ãU3u»op Íô®¯ÞSh?²n½änyüu¯.yA3=J+ä.¡ò­EG·½ªû1Njïñ¯äèuCPý©.¸ÞæV©¼g\\éÜ&à!ô¹Ã=MþFÀË´¨· i Ô79ÄÕÇ#W<¸ïäUÑÑÙxnÄ#ìãïFWÇß£Ý:µÈ$Iwá÷TºcîøWU£|àÙìus|[½-°ÇÀ=}´ÆSô-	7XPàÄ²JÈß&×ýO«fùÝUZ'È\\ läªé&Ç¸­ N÷°r<wHñ%£ºý® ß¦éÙ&30jýïÉ¹ù]XLF-£èùñÃ¶¡OÐ«¬çÒÍä¸Ä c~sò ï¿Yðóä}tH"eïÀÄÑCy±®î'&óÞ&±ä!)ö-ÔÔ&Ùÿu Î-æX¬òl0::äw-KVTÜÒÒâ*x¡~²KjrÍª=JÊ0¶´=J*Kx0?¬ÎÏ;>nB]R4­rF/[6ÒòÀ	¥ø§ÙdrÂiQÐá'È¥èÿÄ·v!Ê~ÝÊôú=}|©[G¨ê<9û¯CRùzÚvÒÎòl.<8Á,¤sàx³½ói7ætÛ\\cêýÆØÇE*F¨òêÛô}ÍVÉ4E´°yaFû_3 ­û~ãÐquí~ÊAÑÏ"Ø!üi=@ç®L¥?Õ­¯Væ®¸|8vMû®½{\\Ï¦¤ÀØhkiÂÃ|./×b¾pg{÷6¬Èèx@3ñÊö?AJÊ2û¡6oÇ&'Æäªy±Kg²YY&C"í[É/1½W±òOd³UÖJ9ÿÓÙÛ¢ã¦OxÄø	-{\\uÀ¸Ë=JÍTÇCßª×Ó³{oaÖH)À»·|>ý"TùáÝÁ/ñÆøòýÝ±#Ùðéô3êß:éx±\\G<}É±N¿Z	ÄÊá¤1HÛu/iÇÙ=JEOÊßl^a6ºµ¬¢@DZlíÃRÝ¿YnÌ#ä­bp¡PBÈ¹¬ØÃ¶x6åÓå/öY0^â¦¼?ÊËÈ¿Ã=MâçÒ¸89+ºB§	¨¡mÐîÑ>fÈÆù ¼à=J+-üøú5EÙHôÝhíÙ\`d0·¸â4¤s}î|?Us7O Ö(¤"PbJo(â®sÎÉl?\`J°NdyX¡oä¥4ãäHº±³-¯ÌÊ?F­-H¡Æ§Xft Eo«x¹Tsæ«+»p2ÁÝbEùÿöË:No?7-ø¨ÕxÃ*uöX¯<$äÎÔ÷Á×aØòÕ\`ÜñÃ.NÔðAhì=@Øß"½ ½ú^´YÏ¾«ø#Â7µþ-Èvr>æ·êq!ÿU1Lpo~(3KfÇíñe­0ð?=@_ÝµA¥ Ú?ßÏäóqu_åE$.:þ7ªÚt=@WÑp*Ì4ãÓºV²gTùý'W¯\\ÞÒzÕ¬³¾K=}=JZ»qTìÏqÃùº#¤gü¬ÚÚ6F?-$4vÏø¸§CÄÔqnÏ¨î§Iæ=Mcµ7Í=@ÐËÐ6ÂÂäQ9êÂ7³;£Ùü*ó=@Ð-'¼Ã¬{ßö\`¯Àx0É¬zßfkQÜó)ÚÓsL¸ >Ë´=MØ±=}¦g¦ê¡÷câ¾ïE>ípc÷aô4EÏ&þ·u³ÇgÂ^:\`¿·}qñIíÎ_Ò¥Ú¡[@:l>ÀcN@­ó"Ì>zGG|~ÛÞòãós'\\.ðþøtãh)¡ªu ;®Y6q£Q5+¿¶>~R<áFËýåSPÆjàLhÝ·¾àu±jUótî¸3@éúS£V=}T,=MQváÿ.>ejÛ}{0¸y ¢l®û×ïÌÌWîAþLooëá²"¸.ë²àdæLÉùôq$ëëÿ-c=@ sI!\\ßå{bCí@ÿ(»qg¬ùõzaMâGÎáûf A­äí¯)8F[ønlðÆatÈz¥è¾|YMk©jsÓÉñ,/´MøbÕ-Wñ»_ß?%¢ýý¢à°Ò½ÿ=@HÄ«¿=@?ãVÚ¯×UúeÆBOÜLÞ4Òy¡¦=@1oç,ÂQÏìê±&¦]ï=}ðU.=JÏ"¨f £×ÊoskèÐ!¼Þs:®Ëç¤sò©àÏ=}ß¬x¬^Ðî÷ÄÈClªsÖÎsöp&t w³VHH¡¢H8çÞÅ§Òì3\\õýH¡#yµ  pÍsµÀû07Ø7«å~4À6ì¤Ù¨Ç·ÁÒÚ6Ë¶=@\\?ðÝpçÿQx'×Í¶¤ÅIØNKÚ­Ã~1äÈ~QzkþÔÝS~d?óÄ_K´÷cÉáÖÎZÞaPþRÌÙdÍÚdÜCP¾ÓÍ¦Ô=JÝTÆ$õ¡MÙáõë0;OKÎPÍvZ=MÀ9m®«)l âºüVÖQL®(¼\`H7÷=M®öoeåÚd­@0ösKÒÔF^«s¸&Ôáªt$z?Ã<îûnáCmì²OoyîUÄÞBéØR1E<¶~á¦ÁÁ8W¯xÃ++áf0Î²´Á0ipcm¢-¶²üãç=@C3|o¥fsyÅ»ïÍPÓ3Vlæ¡©Wç«mùVèÝýáÜ]=MúÎkyÚæÔªÂLÏOµ£X /Êâ±ò,¶ß§Yä=}=}zædë¸U{Ræ×bµÂèÀtü{sXäÛÎ]ÃÅìUÌhùÞÙòø|ë¥Òw\\:±±Yç]3#JdüâÎ\`aê8øÛ²S°^JÄó7öçCCÐæý©þû°ÌãH\\jÖÇxû0\\Ä,Ódô]~¤Éê½@ÌUµ÷i¼jÙº}Ì¿îÊtÒQàÅ¼;0TâûXõ{8Äº|¬À7ÝZÒÿ\`Ýý«^öî£ö^ýÚî^õvmØ_7QÈôV~àsQ}/NÇ®À¼ÒÑÍrP&¼YÍÔoÙ]]·°ªÆÒáÿy_@$á¥ølm3¼P<æÜ¦)7g*Îïíf/gxÜÇ·#-_âÎ^N9=@\`~NæbËµ=M÷ùdAø-¸Åê­÷OøPQKZÅÁp~½gÃÁ2Ô>a¢iAuçpWbþjM½w¨ýl?ÿþød¥#òr\\ñåáÃÍw²{§e¥éÜÑÃg@\\-_ÍÀPø ]EW£ÇË½~=@Uõ^ûÚ8£8gxÈíKy0ÛX­Î|nñÕÚ¨Æ6=@¼«¸5©Þú¿^X¼ö«Ëp¼\`ë#Ðù3óHG!ä\`ý«eE*w-7	ÔÄ0v´ö0}n¤Þ%:æªõ+[©ª÷ðC+;ý35ÀÃÎA]pË=M#xªRGp:MB=J[Ü9jIvQÌÏ¹Úy_=MÙDñu_4qØwáUT=@3v¢åXÏ2Äã=}ÇE©KaÚ=}k8¤1ø@_c=@×G¤1¶à6upîÄUù6©5u¹©a.Ò!T¹ÑP%=}¸M÷ÜsFT³¾5ênMA}Ç°¯ YµYP>0?öñYf$SkKv¼½²)ÌQFÞûÉ¯¹lüò¹¥¶øæç²¨Û	¢\\G½GèÌínUÃÏLëLë*°UPoÀ«4T«:@eÐúþC$óñ9rùìÙn¨,»ÖUÍÕ¼¹Ef'¢i³zìî|á«öÒ=MÚ@wÐbk»	ÁÜ÷B¼ËÌµäÂÕIó\\Ð>EDÅjºÃ:);g=@­PìÜ:ê/kÄ s§E&x>ÎiÝ¨¹\`¦ê·ÕoE	ÊÈTþ©¸3¹Ö¸±®4À1Iöíî%Jì3a~ß\`äfbJ!p-MÓÏù\\aiÓ(FyXÅÿKÞ#sÇªÌâÇP¸Ä?ÊPnÇö$Þ.ý!]ýjµ/Í0\\b¬+V'KÜ±gk,sìÝsODNÍ,N@~uäA=}w¡«|þJdßxF§¸Åcòð¡nÉ½{¨lfÿ0kï|ªÙ&ÝÝaâÇFbZ\`¸4»¸Ú³.+5gU5Ã:Ih7D;h¾¦PËøÕq@3ÇGx+fêáÑØY§»e±Sñ8óPVedt´NÏÃTßÒTç-×ÛU^­mcÝÛã[¹µ9ç-Á|_$W¤@l$°ÿg0Ç%\`[ÂÄh~bÑ-9kOü=@lË±oËHüzkDÛd6âPÌ¨ =@D3k¬[ÏífóåÌ£ÔêÌ×ÒØ«Öiô¤=}	y¶kÑ3\\;l ¾UÞþÏ­f=MÝcÔÊX=MB%Díjb²Rì.l51£Tß2£SÞæ7Æ§Î~øÑÿçî	Ýç·Á7?ÛwÕÓá:Iü_úGÈ{Ê0?§ßL¤þ\`Út?IÞÍaåä¥X°Óè	.-ÿz~.¹½\`Dw)3Æ®Þ=@Ð%¤à£xoÜJï¬ÊNÏWÀ¬_áX"E¶­Í5´áî·Íã¿ñ|óã-ýùé´ShR)¶z| xÛ(2[QytB=J:²÷gøbYæ Ø/^QpnÏùÙvý,Wy\`C#SW£|ýÜJºÜÂ&=}0pTvb\`5ìhEµô³9ºôA¼_Y¡\`O¢7Y>Ð×ÎðÍvzNSO=Jþ¨8*´võI bÕ[" RxøSÐÙÌ}&Èðbà=} ×AvDë£ñ.<O1|ì Æ$C>=@=J´§VPÂu>Íí§Ug¡áÅ½UÇñÌM¬þH&P	o_|$£¹^cÄ½¾´Û~²åräÍÄPØ#Im@ÛÆà¹×·\`¿¶|ÃÎLï.°z.V¾löEiûÅ_ÖðãÑWîA'ï°ÿìx¬Ã¼©Û§@ðúln¯>M´zA[1<Õ·æ¤ÆÛ|]=MFý_Ì»ÌffÀ½BÂ3#²C¬CnÏú;÷¯Ë/N2î=}Rs­µ 21O&hÐ65ØBø±Þµ9¾÷O²½ÙJuWCÜNk»OÃ;ÐÞ8à>ÜþMíØÒªa !ü]BN =MØ"FÊwî¼küL[îª±´¢}=Jióc»³^=}ïx±óê²ÜÅö=Mzl¬QÚ,9ª-zÝ8pÎ8¯LïEV*ßïÁ=@Eö´VnÆm&mî½W´/¯E¹(ê65ØO¨@zî/ÅôlEÆ°IóÜâsFjÑÌ2Ù#\\HuÿºÊÂ{´ATa5ø×Ú,,_ÙÝ{÷^7c=}Ç{ÊÖïvQ=MqÒX=}#ºÇZµD@ÅT8+{­æÄ®,+ÆïMËV¸ÇË]5%0ð8ç²ætg½¡®'6­o5ûÎt»­Y[àï\`ºKoÒ/ÀWÔ¯ÿÊñâY=@VþelsUÿJ÷*¯\\æØÈ×ßïï³ädRlh#®°N3ÛÚc¼ðYgßÒ×mÔV¼W»\${vqÐ,ì³£eíxKàºöÍy_²PÎFNèÃ{8ªl½çÝ/NÇÒQd¬¬õìCõcz4ÿb]]ê§°]:«ÓÏ}áÿ~ÍóÐL×Ùüéó=J×ÞRt§Án(¶øq0äø*ö¶5"·eÑ6«Xú\`­¯;õç¯ñFý¸ê,?ÍÖûog¥V¿=@Û8ì{òñSo%ôÚA5Õòvñá¸©ÜyfqÈm:ÅO5/+À=JB}] ±p=}ÞêÊSkajï£õ6N|ìS'®"xCÍíôöí¹´©ÕeRöÆ×Ac¿æ«S ÕQªtBÑok36²ÔÁÛÜokAïÉ	¹,@7L)|UÅÌ÷>À¦A5tÎ­ØáhÞ¹Ä	ýJëè\\qi2àÔ0±­¾\\-ÈÐbü=@®ÎlÞ5Eeà°äëuÒí¿²ø1£ñGM$ýÙFxoÐ>½=M¡=@~!èb}Û=JoDFHÖèõ³zâï/_©qû5B§é¥¸päEóÃê¸=@m£2Øpy:u­3nÜlÕ¬µsIsÕ.MÊx²Ü××æqÕ=MÒ2*~eÛÿYB¥øÆ|îÅÁ*ÒîùìÂ¢tAÂÇÛRF*3P$Îú¯ÂN Ë3Jâ¯¼Ù*Ùô&ìãÓÍYi×o!4Å¯ãýH\`næË9 W:$p 0=J¨}¦Áì¶M½ç¼\\¹QëÊ®FN[oâ!\`µîwö­¥¸àe^XqR(ê¬¯Fµûs\`fÅ»«©o÷«çÄy¿o3 5âFJÞ\`ç(ôEAUÃ ¾M¡ÙL²»n½uÂIÓüýåu©2 ¾õ´ÎnÒ[¥ø"è'Ì´eÎ(Ë#_!×þ#Fí|I¢¡!L|¾ÅUpÓiGaÌ}5á8±=MÇ5¨7®JÌ=JÃAú~lYºZ?V4<(LµïéãPk9{¼ÍSt^ÈUÇ§ìÎ3ÉÅÕ$VIUè_âN/áçÐ¶	XUÁFi)&	ï¡»éÈÄòkVB$ Ñ²ïz«ô÷Ã=JÈËæÞª^ú=}X,~Æ¡X¾ë~ +å¦íë=MF^2ªz\`ÌðèC·å^°ÙaþçÈw±YfqkîW>>=}-ã=M÷m±fÖ%q/eöSê¾ÿTTFAHåEãiàzÖoÖÊøöÙVÖ¾¹·vêX×½ÀYÀÞ»Û#¯PÃt,Ð»ëøóYÿDµnÙoÛñäcæx$ÙæÙXc½QÄ B\`¤rÃR8j§I?®¸ln·¤QA©°4M§¸y­E)-Ô.ÓW:ÊXSg$½hy°!CäÄQ2[ªÈä¬0rÝßêh¢ïßn26Ç6o2¤/#Xüu5@÷Õø#ZsGêy\\Àjè'³F)V0ÝFÓdÙÖí#1|:Æ{Ï>øNÀ¦ä²apµ±§w¾Ç#úÌ)5Ý§Â½2vz;agÉóo2]#¢ì4ÖwðõOWÎÀW¤!Y@q²/¯ä¬!ìN«æON¦ó«qzl·ú6)B ñ´_Æ¢÷ÉI;q7ldM~q[+yÁhÓc£«ý èUéq¥)û,#ÿ·)ICÐÙ:ô1<Î-æC\`,rfÿ<YÎ.gí9rÆµwA¬øÀÉTbýPsúM³8øW¯îU¯´sºù[ÅÃÌQì:ÔÌâ{×ô÷¨ñ÷¤xäD°DîÏ¶süwÝÁ]4QÔ=}¨æ7¹]áÄÒªCdFL¡ïrÖw¥mxã"õtw|fA¨QÅãPCÅGãÈ´a²é	¢gítÝì¾¯+Êz¶	Ë¢éÊfÉËVMee¥n|+Ýß4Xø»I³ÎÙ¹¿bìwTãÛJzT>HÒä£»ßB7Ñü,]û®©<kuðÜÆE¥Þ7¿é±»86äj·âñIï7^z±OúF=Jo­K×$¥¯u®7Nâ·\\ÛEaÆ'Ä±';=@d³ý7<ôí9Ø¯ÅTU}J$SÓôuF¨©º ¬s9B0·çÃÛm#"zÇH.Ã;É£V;ækÖ2Hñ©?Ó\\¼=@/Å^êZ>ubå9æ^2´¾UM.BræSé>¨jëúq;õ]P¥FîÖÇSP²çà{qÍ.Y=MÅ]u9­Y]òÓl¶)=JónA;ÁhÖKFÎÌä5îh¬²>Tjyfç¿l/	hÖ«uõs¨>íê5=MñâØ´ÒÌ¶Ém?1Hi Þ'­°7ðÚxØj°ÈÑ>hÃÄo× }ãJñ-QT£ßÆh¥u¥ýÖl ËH=}$ÕÕãÌ!Æh·ý¤tùÕâù¬#SÆD4ÝÊsÑõPÁp´»Ü÷Yr­MäW(g·ÚíGJàÑÅÚÍ»w×zTLõË$à>Ìl©hÊù5´YÁX@.ýÄ$ZÂ¥Yw®iUôã¬qÄ>ßp¨íx$µ{ôÝkuò¨}áÛº9*8Åï\`Åº~±×üÚÍC1ïH1W¼9Ùñl/OÃ-5qÞcgùÈ%Õ©""¿d¥=JÙ#U÷W[Úú«ü¯ |Ò#	n·Ut@ÌLM08{IÎVµöE6#=@,ýe\\H.ØÓT4kínñ\\þ®^|KÝÂÀbk)ÚÌ;j}NýMD|^U¦4ð'âBéâ{Ú#åÎe¨ÕË·Ö.ggVäæV(Â¶öÜ ïLÕíQ°ùìÑ±µÁà<¶q=J	¦p¦¶ùE©9¸âß&@Â´òi\`ëYb¹9wEÿÖ=MÛZÀî}¨×[sà|ýùìydl«l¹@ÚÞuÿÀÃN#¾éV>c/ö=}¸ß¸F±%Æxó;¶U½=MßþÅJ¸÷úçþ&]ó:"¢í~½2ÁP-ÚC+bª¶æfN±"¸bà®TcÀOàìºå*/tçê ¾×za/hprRjjÐãe¨#C#®ë°îõÆ:¸0¿½+8GÑ³ìO|P®ÀºÍÞÉØ¼@ìÖ5¹2ò®G·&ÿI¯Ë½£ö³¡ÚPåL2íHÒÂÀeOßÖJ+½DöIÆíÏôHa£(¡=JJýýaUc¥$°§áï¿k^QB§~UOÄÕí÷ÓËû#sêßøtM~@5.¨WLÝsrgOá"&ÀÔFøémôqVÊ¼À5²Ô÷<«Fø9RdÔõ¯äbÎïP_îèU»ªËr]÷(m£ Á#>½¶èáÂ(ò¶ÎøÑ0véArÌä ¾f½	 ¢´sc¤5~niþÒT](+]Å©BmqØANXÍ+Ð¤r¤»U©MÉ~B¹AÒ§ª$,7#ôULªj¹¾?±¦§¶qEð¤/<ÿDIY-\\±®4ð«½^ÆÃûnK!Ç¹éI_°-¹Ù/¨XË\\<ÕF3#\\@~#÷dx[_º¢®!ø#Õ°éq:K\\+Ñ\\ò_¢©>ªé¡r¾9Ò¤VL½E¤µY÷_:		»=@)r¦ÏiÞK=}ØmÖEÇÙÓâ>fi®Í°g6ñu­á ËÙÕ´ÉräðÙ»c2OvÞ©ÊÒ=}%úÂ»­c8"×j£¶Ï	ù·rõ9Á´º]µlÈy¬CþÀfqö-O¨t{À:RäûËéA(4qNÜçír2äº£ö¥U2ÅBÞýÙ5b§4uoþ§ßô=MÁ<Õ"§dK¦]B6ÉXIÊùÿ­ä¦º+Ø@<µØ>ê¤mÄíkôË§gÙz ;kR<ín>£@ñ³L?|ª@2£Æ,àEâÎødÊ_Ö9ZPüx×c«±éCÕÌë÷<¬Yé vf¸ïs­ÞÚe^GQ_]QÙÐáD¹.tø]û=@«üo£\`XËõñ\\»dÅÖ3ÔæÈ¸ÿ«ÿ53°ºÞ´¶ÃpR¾!ÜÓFu=}2qàBPöVBí,hJTFÕdÏ8ûµOVWJå	ë\\ óÂS'2ÃbU	Þ¤#%=} íbëF°ùé£Ç?ãëò=MÞÇæ¯ÐÀóåÁHôbJ6½E+½ÞñóB}÷Ê^²Zÿ±£¢Ü]"·´â¿¾"n/rÄ5ÐvZ=JÒÑ±mÆgÌ7®2ÉAìè@2Ì³ÎxÀäí}ÓÚUôQü0!yÿ(¬Æás7¶7	S¯cûcÍ6>Ä:]÷XBi 4X6HPnßkæ§jdh:XÉl Ü®å^4£a%ªPéñÖ ÂDmÝÉ4"l¥ÄsÄmpôªnöÇët½M]ªNI+ RÉOí/OYÂÁÅÇÏóUn»?=M¯ÁÂÄyÝ­°nE×÷'ãX	îâyvv6ðÆ(_Ïàb+)dAØ-|¹ÈqÅýqR'2}iËÍQª<"ÉËÐVçâzG£Âÿbf¹YÄfZæt!«+®?°Y ü½à: tÐ|afxÃðc\\J°¦Ã-^Sþ}D34t ø°ÔD¦¨°æ.Õó¦3=}6e<øêÉEi-ÞÖÄ¿è ¬mÕaýòBB¢mòáÌ®ìÁÉímÿaÓOB(zúcbãë¦©ÅkrB,T±dÀ-jºH4ô.Â;3ZÃFR´O(ºYpêÆ1*a~=Jîâ>ÕÌlxT·c+&ÜËàNkU;îòJ=}Gö[AþK°ÄbPÙ±{Yp{±Ê­ØSEKÎX,|7^«RÈSÇ6Ä£òr6ªQ05C×ßïNz,möWmÑ¥5°À§²¦¡0õÄî2íÄÁ@1½gÄ¨í<Rò=M·Mí<5(w^¼rS¤ï¤fê_	[öbà]ØVxKÿMtT1#»CÍ,È´@¶èGJ% lZ"ÀO :Ñ"ÿtD;Ó-ÇgÜpÁF,"Ýä÷ïä°µ¹	±FñmU"=M!Ã&%]gý­|ùIéiuÝ&hXO&%®¹	Ê/¨©I=M!!(¨éy§hQ¯(@þmÓ?Âb7ÿp­§ñ\`_æ½Ü÷òg?½ÿÔÌw{Z$~KA¡=@dÖÒìVì[s»Ã	5Ó9üjÕÑ_b5¡ y~ìÇ§üe½ìÇ/ÇøøöÑaç=}¯eÝüe O·u¤ñ@~¤ñ>& ¤ñt¿TXç_}Ú¶¸ÿ´ç¸ßzÕXçÝr°YPßeÃÈhvp½w÷!ý§Ûn?6,Rõn×o»µA$¼Aã½{øIÆRù¥v^±4/úöÑ]£¨ZÛæ»:kMñªF>ý~·r[Ñ/=M[å	Ô¼b\\Å«D+ULxµçæ?RÙL,©ñ{ÎÛ¾õÔálGODe	±vÁÇæj&C¡Z27-4?®ô^[nYÜµ+·_ÅLE|Ìgg£!±YÑÝõû¥þ©1Y)%y@±cx$üø)@Äì=M&üÙZýi$"=@;^	P+£²ßÎRªj­¿ßI; *¡gÚ%Sxýúªyõ¡çÐÄo¯±BBÔ ìÝb¸[bì.¬Z&>Dnçê ²r+h<A.è5 ²L¥ø}7k[ÙzXg}1¹B¡´x;²Î*/]:>2Ôí?Ý¼À·äÈþBXïn'NúN¬=JG/²éõ=M~vªYª/Q®ã¬"ðÍ¢	¢iåQ'æFîÁXGþÖJ6#ï²aðàÿgJËá+ÆæÂ^¢{2âv}A «%,2ÁÇ9ßpº;ÎµY.v1uXùxä²Ôá=@±/²ý7ï¦p9*¡?!7ÄD·áJ=}dðw¹Ö?ü±a;¢}0Ë'úûX>/Åy¥¶Ôì*6µjøÀ~U^cZ8Ë¨lÚ¡U)íàê²àhúÃýàf\\»r³Èd,À{aÐ¨ýJi.dü´å=@Zº=MHj=M7£DnÕ>¢V¤§((j.<ÖXz¬/>M=Jå¹Gç{?¹&DH|zK"G¹ Ü3%]Ê$Wnoþ=@¹Ð4.;÷CÖw/<N04¶hvÆüì^u6à¡ßkëT§ÆÔc9Cºn+ÏQ]ÃDÚyæT° <Àr=@ãdLVÐb¿ôÖ:sâ.mJ}|ÓgïówÙ*¶ñYîøHUîh8_ÓÍn¨áÅþ^.dzpá¯ô!Òw\`]»ö<É?»Q $üI¯Þð?of«ÄÚ/Ðs·ãÂÐZ¼cõ÷ û=J@p1âôËtxo[þÛ=M©òÌ8@ÓÌR^@X@ßà;+ZV\`f¡H}z×±Qäéu¾³Jõõ¼8k<K6=JzxÝé ¦ï5ÎzóÝQ^ôÈóU_ÓsµÎõzÝbU.øÄ:õU}½Ç]_Ãr)ðUÚôò\`à÷Ó=}þØÜÞîKkÑÍjÓ7%bÖºm^±8ßm\`0Þûúêï¼O÷lRq2!ö¦QÌ=@lÑ WFY«¶äÐ½ú1«Ró7PYÃ©³ ÄkôÃ$³·SÂ³G?ÁUôüÇW§wìÞ÷<rQ2k¿o¦ÇÏ]å=@®ÞQhá×ÅÀ"RÆ©Z²L¥ñùÔ¼6eS*/ß4úCá²úÖÚz-sÓÒ6Á¢ÃÐ#¡Õ½«Ð{Ãÿg¸óüÔ¹ÆÇô.â;yÀðè÷ö@0=MåüvÞNK\\¨¹;ßhbö+Ýu[å<á8hbLüÛ~].~y¼{º|ü¶6×\`cSZKÑr¾ãÎ³Y	ûbIHr³q´ì¾7Ð@£cuÀq=@>áY]íª/m´Üv\\Þ<¡ÇÈÛ-¢q&!½rìP>ÌÐ³0kî~d¸Ý½=JÀ9|á/ÝÅÐ'wqxNQBky³V]ÐC=@ÇÁ½¯¾zb¾S]6£AõÞµàÞûQD½o5]'YÀßÆAE61%=JêhA|%%:tìUsan\\Ûâ{£M\\4a~9¯å;oçÂf®®»èÜØ,=Jê}´NOºr0r^´3ìºúuÈéÿdYGù>-ë±+8áy[Íì;®Ïôqì-".¹{\`þ*pkr>Úò±ú{Í¨¤iñïÍµ¿CYM¬9F»;mKWßK¹®é>Ü' ÿkíßÌ¯Ø1 aæõÞ¢=M 0=JD­0³þÙd§Ò@jB³80Êë+EðV¢Áâ·oZdæçEôbÝNûþ´>ûÖ²«qªÛ«Ns=JÌVû­¹P"@&ëdÕõbÑî´è:=@/mä|ÃH	=}lj¤ý´û2òøû8³½£E]£y^lñVS[=}s©äQâBC´ÏÿNFÜr»ó~Ä¦ãæ5ËeÓ¸×@¥ÚD£ßÌÞ£à'[Ò¡y@í,.Z@ZØ½?^ì±ö6^ÿîFRwêº-Gû0*^Å²­uæ¿Þ ÕPìe_¯u77í	ùEÀÞ2u\`©­@¿ço4ï·Rÿá²¡Þ¬\`,}ÈÔ]·ó¯ðÒðRØßÑÉQ¥a"ÎK\\Ë°z]_î"7»b\\r2îømBþDLKÞ!@¸ÌG\`yÖGfiÕEµ]Ó5ÔÒ$äB;EþÏLvTY­ \\ÛÚ,ðþ}GêØáúÑaö§C9ôû¯?A üÕ¤î{shÀàC:U<Â\`(BK4ÐÂkjÐ~Å¡÷ ]XÅ³Ñ7sÎVXþ÷Î¢({ácv[&uÕbKídÂs÷T¦´d1Í³­\\vâ¾:]ÁwtLç¯§ÕÜWNÒ¸p¡ïÅéµq#Fasì÷æhWÜ!~µC3{7ôÄÒNèð2ÝÊ&û¨$pÀPÜ÷ÞrPÌ_«ðk¦Ì1d®Æpf©àC:;6wµSàøñCíÝ>_A³z\`Ôlf@àóÄK×$¼~\\Yê/{j¯ÓÑxÊ°$µOÝ®	n´KÕ&N#àéä÷àF=}'âìJÍ½Õ×=@÷h_"=MFo×ç~oGûÁ¯%Ã,¨M>rR¾5^	éª¹+À|Pÿ~a3A×Ãïßÿ´ÐeñYFØ^*'e¬3ñ¢·áLuDCÄ=J¥I5HàÜÇ=M}fá¿ê¹}É.ÙçÚËÒgô¿g¿ isfÊ.%PjÙ=JÐVà«jA'¤H5hhª-SÈ?:oUAïEÿSöj¾NÿÀìþOóþ°[^ö³òåV|I<_ägú;óë:Ôk5q\\ÕJÜõ0ñµëu=Mz59åÄØ\`ü|ösÊïÀñ\`0z@[Cuåð?I÷Z¤8gÖ3\\¶ErVü´Ç¢=J6eÙËÂ·©ç¡fÉÚô74ªp«tMÖôüU¼ß±ªãV!<ÔXì)m9-õ¿g¼o^Ý ¯#£ú8»°vmªíèCS5X4@Ï~xP¿[Cþø¯CÐ@ïzãµ,æBÛjßC±a¾þáv9gþÇÎ/mXeXm¬üâQtÜvÃØÌDgÀÊ«æ÷»©ÆöDm%i~lw?hÜðhê³\\Ä]Ì\\ßáx]´Ùx½ZUöFËÓpøë½fÖTA¾®²MwäªºøãHdeþnlWP<ìÑíP:ÞM§cE K40ªWj­4ã5-Íçìdf%Ö¾Ðè PÏ{µ)µ±íáb¾Þ Fà\`9R}=MX¡½b'ÂKãzÀÎï?-àÇØÛîº<AQcÃµº/ÜlTúÇ¹L¶»¹®+{ÊQëEj=MMÙêË­DñgôL»xR¢ÛÈßksI¶j§eÆ;ßìP0©%ï{eY¸µ-&i¦çÅGØ#èäEåí/%¹WHU()Éö)Õ8×@ö8ò!÷dÕ¬/¤ú"1RcË'zê%´©1¬jõ³³/ûný75î~5züP\`	a	 \`G´4UfÃñ¶lïÀ­ =@'vº ºò|íÐ´0 ÛsÖKa°Ò*~©~ðÌ¢Ìn×Z´ ¢Â[=J®.\\1^®-³k©Ü+Dõo+ÛÍ¯£¿ÎÜC@ì1è¥Fì³ÒGú=}0«·;­tUñ¼&ÅsSM=JÞ³kÖø=J.q£ÑdÇ~$b=@yµÐ<Q:G=JÞUz7¹¡^wÁZJ\\n9[áu[÷¬³¨ël´=}ö£X=JüKÓ?eÁä=@ò8[®ÚÝ)¢¡:[ÈPÕí¡_6PÔ.+$´álÕq'»ß	4ú¹îË3Ã×àäíÊÎÕÃór@ìb³t³¾g¼\`p&ã\\ßd¨oÍÓ$O!=J{*^èÙ]d¥q½Æ5Õg4åíÎÆÍpöûïô¢¬sÅBÂ\\ÙchïÆ-e¯.YãÉ:«c}¦¦º¿¾v@( ò¹¶§Ímàm}ÿÞp6DtÜãCåê¾Ús!vºâ¦Ô¸ÖÉ\`Òh=M.ÛùÄIæð®:vûGÔÈç»Ç­óFì8Ðý8îL§gà=@ 'iÇ%ÝxüöÖ/Ou½×WÃ¦öý¯½ìµ	ówÉZ Ý=}3UÄ¼µö¢&ÌOÂ¾eÛ65ý·úÏâ@\\grðvööÂnÅòÍ}SÔÊíþÂ1Õx¦Ç¨y¦rÐðÆ"lã4Bø\`²Íº\`Êë÷dwS	]ÏZëx¦²a>}^Fö|l1gîÆë&6Ò=}ÚÈZ(bg¥ÈÑ|µ'6=@Ï«Ûtj®½¢ø9Åò#»=M0ÙÛ¾?´º"ÏyIUÐS2Æ2ýV¼8¸(So×HwXTSR/Â\`°3·QØß|ÒIø´½?¾w ôs¤UÜkÅ=@Þêú%£R}Ö"È½\`p¿¾Ò,¸Z¬ÌóÊ[^0¿Â.äÿT´è¦q´ÖIÆöèÉ{=}ÆºÄ=}Óg_\`Í×x'm\`è¹ÿ°IS,Ö 8@U6\`MæAÁóu<Px¤ KN<Fwx$va¾\\ÕeîÉ<|Ù¸$¤ëÏÒ©ò°¤+eßwaÎT!$iØ®IßøÖÜsÕ.düfÿô°Q¨Þ"ü­ÿ´w96¨ýg_ÅÒe¼7½Ç/\\ ÜUÙGUØB¼ÎÞ1àFßâÒ³]J¹²]DÁ¸@9±În°é¬¯vw¡á¿Y.e´zÒóA=JSß\`ÿª-ª78ùEªb*HQ=@ªÜ_JÖ?°uîëöµä%:¾/+'\`îk}0éÝçZ+äé[ýéåiy¦Ô2ãèöæÞäÃ([ZÃÀóömv=@ÿuÑà.úyº­¶bÛó>	±7z¶iE¶[(t.1ãÚVÓúÞ\`'eKßÇk¦é:=Jºº ^0cút 57dÄ°N§È/üòO-ùA)¯úzB®á3äµ {&Èù¸<7Ôé³Ûæ=}ZE<³×ÍÒJ®s÷ÜõÅ]%þõ²³²=}Bv³7è¾¨·ËnG{NrÍ· p7ø~ÜzáÍ[)ì=@ê¢'@èÐ-ÄeBXrõFHP1ÿºçFµå°KÓÒ¢º7üæ}HïÎþÃ3Eà£uGP×Zdé,Íc°¥7SÌ°Ìþ]c]Ö·	<¡L{åÃ\`ùÄÅÍ¸Þ7»F|+Ôùþ^ï+¼àZ´ÙZÑó¬	IN·¹P^ÀB3À*÷4½(]í÷>ýT£8%§½þ©¥|áÜoJ½\`ov¼S·üïZ·SGu\\ýsU©×k¾mözS\\þrñ¬6Swðxº\\bGfegÛ ¡ÐñÐzÍ\\ÿ¼óÁÉï=@O£d¦ótxS¡<nAËa«LU=MÖ´íS´)¯z£=J_b´bã¶çßÿ"^¸®ßJO\\Û&¾®£!gù@üLkØrdÀñ=@?aA e©_iü]¹4[ùèù]£!¶ö·aö_i¹aÙ¡Gü]¢¤0=Jc¯$÷pìú{OÖÞ¾=@×ÆÌå#äL¦"éÔ[¸©ca(ãvE_çÛ9«,HÓrëÔ½Æe£ÑÆÂ=@Ó#¥/pF«cPZAÀ\\¢Ë	þ4nÀ~ÌßÂ2à¬BÈÇ²ÇÐ¹½Æñªà¾è°ùjïI¬æ[t­¡7°V <U!ÂBÑx\\ñÂÃ±~ÆrÔ­«âeøe=MUÜêv-=J}H_Ûbz?¶WÇàV üiv\\ÆèîÞú7¤2á×ò6º=Mq·«o]2¥ýG,:Ær=Mëäù.¶¯vÂÎ,6Øìg¶¼âï=}»eX^E/QÙsÙH~éôÆ<Õ´Pü@°@¼\\§Z#ÊÜèÓ.ÃòMãïg=}OÄÚ9ê=MIW|%ÎZC2KéôU2±Àl¨SF^íåÑ}£ñºîPo}y·ÐV_/>~½¸j0J½_#64VÕàL÷DëHÐ·*þDKý!Ðm²k^Õq3!Ä²´¡þS,ÅI8NzÿÆHþ¤Q4áKÝ¿,ÉNÞ¿:<¯4³æàX×@+®ÛÈ<¸u!:é¹¬ V'=@Ó¸àºK²Næ#vn6bÎ~Á¬è·È0áÎýXmg4Kø=JÍu»\\Ú³(ámñÌûD<VÏ­4¡~&zt~47¼°-K]O(NÆ,ß£;XÈrGQWØOKÕU"Ö=}8×]Ä¡ùÞ­ ûkÏo1S&ÓH­¥ÜNwÃQ=JùÁLöTì{$kDÂ®["TíN½.Ñ@sÇJ}>Õâ 68ö°áüÖh'×É=M±D©îð¶BèÖÃ;Ý¸ûÖ÷_ü¥}ßV$·ã/UTPÞ{­D,Éý&1åaä	ÐíS=M¶íyßã5VÃ îÁähÓCó,eq÷ür8TTnÎ2¢æ¸â>Õ¡M½øB³¸z}6ê·×"MºÚHvW»G{¨FLüÍ/^õLÐÅªLk¡ý³Ü=M©ÓsH£y6É ,÷ö~ÕÊrK_J,ìD&òd*ÕÿðK­­NdZJ¡¸tî§ã¾jg uè³ï¾=M¼©º&eÀÛ¤Ô½ãl~Ñ]Ô±@ò{åM¿ØJñ!4FRm*zÞVÍ%o>Í Ú,/<Ò~ZÄÌ5{IcÐ(¨½w=M¸Í·ÐcÅô+c&.ö:·âgn÷=JÎ·¨Ä¢x\`rª"ã¢câFßóþ®ã=MåÎDvMUÅèÕ¿ï^m#áÎÅö"o¥úT7ÚadvÉ*S~L)µé_Þ:³i»$Û=}[=Mç½JG¢o¿¡7ÐÞÅu¡ÞÙ¶ÓÓ]Ëd6«;>BZ¼û1êåo÷\`R:\`Äñqáû¸Q6ðFC|vÞ³-Ë,Câª\\Â¤íÔ\\«ÃZc]\`K³=M@=M\\î>åÒðjÌogýûÞºÚ4²ÃáyµÙÒÆdoNXÄ #Æ#JýXAû,ÕÁV<ÞzBR=@«àÊÛÎÇó9;V8Rõ-·Dó²ûÉêfØÄ£g>rh5/ü>ÙQ­N,0±ô(dæ§Ì=J®Q¿UUØòNõ.Øê6qïÂ÷AôÕÆÞ)=@]k«ÞD!ñð××»b=}ê3lè7ßÒ6<)¼yÿ¢õzPÂm5ÖËÝñVìæBXÝþL¯D_ú,#U9@«wZÕº\\Ä}PW´$RB8¨qZ]¸3ÏªÃufñüôåÓ-Æ+G»æïÎàìaöûû3tYJ4ÄÙ³+Oò6µ@½ÀvZó¿UÅ8ð¼U©ÐNW0S[óúJ{Ëøâ/ÀÄ>ÄÌm¨êÂ,qb5´JÁWGÀ«Lvö´zÚü{bC¬|nÂ~ÝFÿ>îxÁZ15ú05×,×"ht6¹/W_QÔxXê¼{èy|Zø:)?È>±E=MÐúwpKJrë*v®n6Á~w¶úqÛ×}ä,-Áo+äj^0Êê|ÝYêbµ©o:AëÃ_î<-òxÎÌyNÚ-JM=@1=@Y;zÌTâ¨³óÀ¼^té£Ò:¬Hiì%z_å]'ú5ê©b@,S-h@,Í\\¿ýPø41ÞÊÎ-ýkIóB©=@¬wô"F]bæJuôKã|U,Î¢dK¼ñ%GMô ¤+%@´=}¢Ø/=MñÉÇ=@G[2ÞÃüèV¬@YHÈ96Áü^d«ªj?X±ÐÛc>æU7r¢¼Q«Ø8-1î_=M5D,ÝÉ\`%¯ ¢©ë&Qá¾ã¥$ØjÏâCØ]×ÐÞíd´c6ÝQöñÂ=}Ðäòû°2¬îC¡ÅûØ³ªQÅ¯¡(lË=}TÉG¸¬ª×ScÒeúwò6WàÐ¾þrÃ®ÉÚÉ	WK{RÌÿ3<9bÕçëàeÏæ-ÙnóC:Sç¨aeUËÄøÀáSE]5ÉÍÎ£Ä_ñåNhù7h5=} ¢è-æù-u}ÉTöÑ2ö1i¹+]ë9¨mnYÛõ¥=}1ÝZpEÕÛc¨ëûRKßþ? Pèã±{f*Óth¯±ZÉîÅä)O¬ä¤,6<=JÿðHWÿ{ÿûþÝøäÔÔ}ªYHô¦Ã¤RíP.9ÍzRìÇ2û\\¨þ°ÍÜapâ<²0«øöW[VCàE¤[ÄQ¢ö®]Z"×½"r¤¥h1àÙÚ>¹\\àµ>ì£'ú|Ôm2çË¸P¶tOËÓTs~¨=}@/:t­:¶iUÀGr¹Êþ{ÞºÜÎÒ,çõ1Þú¾Ñg8½ðþÙE*À¾ãö´ªOü8ÚtÁ[CR@/ÄT«éÇ÷äU£JÊ@³=}çnÓR¼ãlMMô³u¿ñí>c¥T'qz´"g_¨^oi¼ûã£»¤OóÅ>8ÃV2â»L[²V6EÅ:ÿ@b|xv´Âýáî±T]õGß#ÎåËÂâ$¿a2Yxm¢<Ó7ÉÔ=}nÕQn¢)ü8ôãÕ´èïx|>ZIêãç:Û\`±PÝêz²ÜÕ¬Ð¬?/¡¹÷¼hLtª?vðúl_GXÃÂD^~>^=JÄCþ.UÖ@£ojÎ%=Mq±!#õå?[#XÆC©#q,ÏY\\Ù£BèÁ=JY.+ÔÇ¹vÞ­ÓÁGgêõRÍÒ1µh£uþÄ¢Ð2?\\¯öÓ«·üáöë÷hÆ'Æó÷¼äýMáµÉåë¥.)DÞò/,¬wfæHØfzæGË+±2ñ81zïÚD\\ OBÆÀéH°öM8ô=}V[ì¥ÆÄÇqZÚê³\\Úh'ÒxÞTflâ!k=@hëy% äú£ì6$L©÷æJHìÝ|\\"¯B¯í_aFfëñh	ýÜòMvçµØæà\\_¹ÄÞ|ù¦ü=J×©[6%WN¨ÉÉîu_'À¢°îÁ	$þCtfuïi³Ar&¤í@©"|¦!a(óÈÆm°õX(ÕOlÍ'Ýpjæ|£ò_¥Ï>~s­'íücA</<z4Ï¡Óà"w¾³YÜ-&I'Ä]-f×õÂë}ñåZé\\ä¢õ©À#¥õÍH¬Óð;åL.Ù>=Jau=Mÿ\\Ày¬h-¸Rþj;~eù¨tßärgu÷kox§p´¢ÃØCëýü$ReËÎö=MC	¥ËjÓbÇÚ4À_9~Ja=@á ax:²ö¡ß^à=@Ü	pr¹¡D0^¾f5ÔÆüÜ~T\`.¢×~¥kÓ\\VÚ|aÓ.ô»õÒù$ìü¢³,n+kmh^±^IïTÛkª¥ÞfØ:{Ô0pb©ñ«£CMåkP4ÿVOÒ«ZÅ¿²xõ«L_ñ	»½Xi°ÌÎïËamc\`¾6$Ý¬±§SÓTæhÖA6z?ÁÀ.´7q/Ù-û=@ü§õ]kEÊwi6Gn_¥_0j?>!ÔgäN}ÿÎÔ¯~_RAmCÄÏd´%º\`ï9Ô$ÖHæ_a=M<+-²Ü_ZV,½Â&J/D¤z=@®÷ØÐÚS¹Ó>µ-º¼0aÚjÆ¶{ýépv/È3÷8=J&b<ãÇR<¡	·y¯x~úÇ$fÿóèÔ%r¿ÛÒLªJk¶ØÕ Î°UØo&¿Nk»ôh!DU0½NG¿<FÖAJ£µVÏ/üCk8Ä_ÂWçôF5ýå{ÛÁ°AÀ£O;·¿}$ØÛÞU)°­fÿs%TA)µC¥iÝ²BMÝyïÁZñè#7æ³§\`=}ëæ&¨ü¥í!Ü!p'¨&ÈG-=MzqS*¼éFù@ã%/oY#tS¨$¬æ³¥¢nHl»¼H4ÙýyvCyÆæ¾i ¼E¤2ùÔýçpá	8ñzÒ:C8À¹)Õ¥ØÒ3ÝºY>¶v°=M)æ9ÉR·=@E/@i"ï%°¿8ã)ðlû\\êÞ·d=@LU=@¯|­ûÞTß¡\\o'=J#Éö@ê§aÈoÿÝ!Ô]ÇZÄhI}îÎ²=MA§ÐqßcéSVLÒ§Þ¸BJ(~§JóØùwßÂ§×a~e½çÏw[Æþ_zÝÐw·øvÖgûÎs±CÚókSÐÿíÀiUÍ¢q©wÍvôaþP÷DFº!aà0Y¡PTt¾ÜÀT¦=@Êð=@*UÕêRX%|¼·ïõÇb¸øÒ²}íÁ=J±ý\\ODe6ÃÂÁùa·WÇ¬ÿñùU¯"¦$hcåÁ=@>±?ÀÂG®<kÔçæi£Í±y¥é¸}òõÁz7Ný$óØÞ^ìû[\`×"ï{[s[CmEÉì\\ñ½U+5w¼iÕDãñA¬ÜBÆ_S°A°eÖMiÁ¨;µº_1§Å	ÃÝÃñà	jeÚ÷¸ð´ny%'à'´;=MËH4·gQ=}ÅD@¤þµ=@ãà=@;ÞªgIÝäÜÚ:d5MGÇ%2f¾\\¡Í>¼ëìOÆÉnjbìóÔwò¸6HªaÙ¨ùP$xÐ3à(nÐzí£+£Æ?PkþÇëâ8ÒösH9Ø¯¼G[¥M¢LÎ>º¶m3Q\`r5ó>øRª3±?BÍ§5ª3¼×_¿Þ:ni²k|Zm¯º"Ñ§Ã®º=Jãü´²#¤@Ù¨=}öì|ÅÔ@_å%að d¾xïº:6×N¦ªõ1uµ9ò÷öÃ½§Fo÷ª+æ?gD|ÙªqX(/¼ùî5=@Û¾¯aGé7:2àkIjõ$£p­×5ÎØHm¸Ã	/s!æ^RD7O1øPòÊ7÷é.übe[\\=}êbºd;Ö1¢9>1)¦~8@QýK¿;edA9ÚÍ«Ìé¸Tø?Eîp¢n<ûJ|µÓ ÌÐwS,ßzÎ½£ðoñMv7ë"²lúUíôYJK½Î&'È¡ ¦ËWæ©þýÈe¤§r¥=}pm$»E&()VÎq¡Ég=MîèHr		"=J+ñI½ð·§÷©ã_Îô£ùÆÞæûz»Å	'îÑ<üÍ=}%E¨ %hèrY©Ý)óÏ5½ã»A"ÿq¾¦é)}Q9æ¡±)¼9¨	Ç<üÅ I)Çé£ýi6±(·ãÇØ)$ÿs$ëèý¹©üs$9EyÞÌ¶©9o{)aWò)Ð#è§ù$ëål¤p8¦=Mù §$é½5M¹¦ûcÉ¦dÎ	\`·Ùi !ü%ç%^'äåPOø(ÝfuA@üÍgMÅ0Ø	#ò§m¤ý(èC±°ú(·"þDüQ~%)Ì­Yå!-K§õMÉéç's(å¸b}!$ÓºHN!àýéàÜ#I\`¤ïH-9Güç¥!ia'Á	"kr©¡Ê)=}1§ôiu]©ò½Ä	_âcÎ¹´pÄxÉ&Ïi¿¦		[á¡ýu¯	£¤'ö»YçÒ&¸sKçãÙ¥¨ÂÅ¡5o©e&ñ¡Ø	éº¸Ð ©%¼¡ùÚNÎWMig$àÉH& º(ê'gI'mKç	»g"ÅÙ¨¦¨¨ô)ËçiÅÎÁDiÓßK'ß'qX¤öEâPÎ)(ß'¢ô¹ur¢w)¹\`F[§#Y½É"ÃIÆ(èñ¼Ð AÈ$åÈuiÏ)79é¶½¨I)ýði"öI(ºüé%&íÉâkr	Ýq)eA9)JÎáöBãá}fXÎyR!y¦]Éd&ºh©)(ÕèÝh@ü{)Ñ	öu)>üÍ·'¡çÛ=M°è<üE¹"¥HIüÑöi%É	b|é¥%°¡es$ËèU¤%Áè$rÙÈeýÿq¸¦hÎ¹Äüé$äyù¢ýéÝ)EAäiÌºhl);]Þ´çm$úai¤½ùFü%iê9©¤KÇåÎqy÷(úüºþ©þåÈ)É?Õl¤"a§Fà%)¢r¹Àp´·ÁY)Ys£MQ§"ü\`2ÿ'dø¡®l)±Y©$©¢JÎy	íxé¤ñ9)Q£C#_¥¤EÉ2=M_Ü#é¤rX!i#(ÇcY£\\ÜÐ×(=@Ìºþ[\\#ïxiºh'i=@#yÇFü¿CM(/iíýí±æqE¦Ý#¼CM9áXä\\ÎiÝ$¹é¸Øuôõ!Z­e©DüûÀè3áæâ-K§ìý§1¨GÂ&rÙF¢kýÄ(:ü)÷¸8÷½qø'~¥Q!6Ç$µ(%8tù!ß©gKÇ¥Êq%´ÏóòEi½S98±gMÕy¤eiIüÍù§¥Ù%´¹¦MÎ=}1&öI®$8#(ÈÉ±Ñ·a\`ö¦)¹°Se·fC¥©¯ºÈ^UÑ9ÇÙ)Í(ü®©V)%QÑFâ!«K'«à(X&ÑqI?ü5phë½çîºøgæ=JM§(÷)Büù\`·æäei$Ûù°Sy¦Ø"áÙ¯Ð±%Hä'öÈãhÎv)êW#rIÑèsxåÅ9¯ÌI!w¦%¥È¨XÎ±ÉBeõÇ©6!ã·å¨écå¯^Þ!Y#ó+KÇ%	Ömh¸?q¯À\`è¢#IÎºHèç)I¦£µ®ð$haÕùoK§ìY\`¨øèÔºU¹§è	I3÷ÍEÆ$ci&ãÑ±©}C£g°'¢¨ú½.Ù¸eÛy$ëðáiaÍFüµèÝÛâ!	É<ü}Q¶¦æ=JÎ9Nùé	á"ÍÙérñèÄ)µ'¼áæÿ±HÅ¦zrYâÑ)æ6¯]p¨ÉÙihÎùS¶¦¨Áè¸=@=}m$®Ñ$&(mÑ®Öó'èèøYø2ßéâÜýÐGóÎæq$dùMA±)eêÌä=@ 	{k:?oë¸Mt>V²ôÊÒL¥¶8\\J,-|/ÍÛþþBuOð^=@{>uÛPîÃ%Øç0vö#ùc!))Hèç!á$á=@ÅkÚ¶¨Ü)z,·èce&Æ¡¿À	D &ÕâØÅN(ýG=}=MØ±htÁ¢$ãJÁ@sF»âðàçô7øt&"GyxÆÔ#_³©øÚ¦Ù9N¨åªó{^$µhÔ¦ðõÙ=JMóy¹¬¤dØUK&@ô½_AOèíïµ©äïq·17Yâô*³}I·O¨# zÊ©ÅY¯/ÉäÑcOòô	¾î-E´áIHÞOsÑç65áùD¥¤®è·µS½-w¾""ÀÒÈå¤öÀ"í°?±=}L@ï6ð¿¢c¡Çî_áö<éïúÎæÖDisòÜ)ÑOÈ WòéûðyÀ¢$ÊêÁ"^Çïûê[ås¦zcõ}LðaÚ§Ö]§7ØU1ÿN$ÙKÃíÑáÖR7¿u6ÆYõBC}÷m,O(}Cµóy	~6¿âhmèE&xWtè)ß)ÉrÆ ù"}Öî¹AabØzåJ³)2t=@B³ÑÁÞ"ÉÈääîùÀÚ¦\`©«îéá]öU¤LD³9Ýþi©("òW%§6Ùô8ÖaÉîý´øåè&Ý½'oW­ÇMU¨ÃO'ýGñÔ1Ù!Åî~Ûâ·áÞd#tÍùï(Í©ËQTHzýÚ!%_uÔ¢ÌõÃ=@=}Uó"@Àï¡\`|W{ÏLa/s&âÕëßÒ²À<ñïG¸5'VñISÉ6ÙåÌéî¥7SØ¿gpâµOÖw&¡½O¨ãºOMâ©ãpsfÓÓoép5UNØá]ö\\)àP³Ñ/EHÙV»ÅË9¬Ø¤=MâîA¿ÜÙþ¤#O³%£B¸®Áùt&wõP¹"àj³6Ü>Ç!~$°ÿ~TLø±Ä_Ý!¦}çuÕÈ¥Yc¿7!à¸"äËîdÒö.åW)Gä½UDi=@1µ5T9Q^Qµq×s{­N¨ùªÊÅ@¹¿¢Mu«]ØÃS§müÓ]9§Àræ×ÕoáO(£/7æ-¨céuíuXßO7±låãEXtfÛÄõ_q#ýYóe©ê°§6å'mq°g½áÝ"nG¦o¢ç=Må°á±åuØ¿¦"&øu&Ö±ÏáùÉVÐ_WA fÞÞÇî­Bµ	óvWÕBX£4ÈJK°Ì¥ÙFKõÀ®-ÝyewûÕÞ%é¯CfeàòVâp	Gy±Ö¦}¦ÅÀù=JúÖn¹­<)óíüËO(]í?'®<~øo'¼<yVê=@U\`ùÏèZbéb¤ýñúC&eÿ)¨n?³I¡àX}KÝÀ°etFÓÖ³îý¢gq =@ <ÃÕýÑ«;<ùÂýê(<ß¶ÿ$Ñ{(Åk'X)Äî1£þßÅ7ñó£¯o¦mÞ ¾di"$ó=MÎé¢hÙ	n)ë¬q±à}s®ÔÇaÕ$ïwôÃÑ¹ô£$YäxºÍÚFï|Ã"¾X<Qo®ö¢lD;KÇT	:J$3}PõUõs&µÜncVM¶¹ÄùIÜ'q#Ðóæ	éÉiv±d ÔjRW)ÙÊÀ?ÜáÔí~ñ©YÙ$$Wíàb)¹àÕÑz»jÔÙ2îÂÍö[S­¿z a2è¨Õ$ÝÙ	ÊÔ¨­6y×ÈÈ6ÝûVJfNFGmÄÍ¢]Þ835o¢Ã}=Mæ;ÈºÔÙ¹rt²_Ã{sð¢½gXÐÄhTPXXðF×ywþ9¶sõê~':}|¬SÃs3LÊºö¿3%ÑD=MZçK~u~l§§¼ª'9-L¼3»Ö9;K·½¶SP{úIÔ:·²BÆt(ÚüÆßÎzIºî.¶ô­ÒÓÌ¼vP§~l|æ[o¼ÈF]nËu;I½ÆV¤ëg|×I=@qîÎºÊ}üª®ÂN»gáÞÜ§ÎSøÒrv-§Ì[\\|>OZW¬2	cn=MMµ¡¹ôu·=@Vä°Jq	~õv[s[oºDxr<ï²Ü¿;Ðhðþ½hKtI=@àã©÷ç\`9ýhÞ±¸mmì±°aí/Ò'"YÀÊ ¥v¬èãÊ«^$ÿÔI?"9mÅôN³§v©xÒµ[óÖ6=MÂ§Éèp^1q~v|´UÖ'*}|v¬ãÄÈGtÔÐZ´¡§ÝNÍÃ6ÆÆÓóSsP¦íéR	RqOËmvÌS|¶X]îÂ=}}}ÔsÄNÎð»}v¤Íèç[XL_v<3dPÏÄ%B}nAÝN}¬hLKÿFvDÖysJ	oÄL¶r§v¦v£Ë®L¯ðâbóÒóc»×=}<½ÃK~èÝ¼m<Ò§î\`QÎR½>I\`¯&Ð·µ]oE=Mþ;?laék¨«­¾»®ÒÒ}4eJXPQÍ=@UWÅ=@D=JÙy[pÓÈÍ¹^ÐBPx5´9ëð+ðÂb¼ýoÐT¶rD1dÚ¿Ð,zwÉÔò¥}L1{Ñn[³Ì!R§=MÆ<dP7@SûÜc{×|÷Û¬à¾èP8¶Z¶u|'¨E<wðëÞ¤u'ê.Ý4ÂÆ¾±C»t£{°~Ý«réN½tã[´K¤[~=}ðòHts\\ ³ÿ¥4PXÐ°â&«{¦x´6Õ¶ÕT]¸Cã×S¯<Ê!¡¡Ñ0yG\\Úh´?=MÓÎòÞÐ+^+tl_søæ»ÐÂ{uØ¤Ù4Ë¨MÌÌò|Lã¥¾ååTâcfAMdp>xÍÌ@P©#~Ý'QúF#Ó«i« 4YËE¯ÇþÐÚÉüÀñõË#÷¡Jw]ìÌ¬,êÑÜxhl¬®ÌÌõÍw}|vI(^¢ÖU=Jtµ«	æÁP~Jâ;f3ß230l]lbËgËEËQK¬:m²QÎ;Ð=}=}¶ÓS3_çL5vs²Ó?BªÂ|qÞÒÚÚØÒÿ^fÊ¤7G¾¬ºâ¾ÂøÐhúK>­,-¦-MÎ§Bìm®UA«¡Àã¤7²[}|wùm@»=}ôLÈ÷Þ¬­­½h¬ÇprMvMö³=JhÊëëzÆÄ#úY%9xì3NæPæ¼|FúOfQfMfKfPfNfJQMPNMK<ø=}ø:x;¸;8=} =} =} :\`=}=@=}=@:À;@<:Ð=}P;p=}°;|3®RlYlAllu¬"Ök:Kª=JqÒtJâ;T<T:ôu:ù¤l¬ávIrlmsZ=}p;èNÖOFº^3øÖL®.ììhì}¬1£ß1dZËJ=}±<hMFJbÑÅsÂwòL¢»Ù%=}à;*×3]33?ó¾®ï®VlC¨bN_.KëÈ{¸=JxN3ì§ðâ=M®o.=}ë¿Âî;ÖV©V+®=@§²Suó\`øåá\\t¶ÿ\\q@C=MNÃUCPCL¼ö=JmâspÂup$þçmpB!ò×n&åÿÄöºorèß	ÛÁ	¼SH ±Õ\\ñ­VÕÁu{\\ó#µë5F1ìBGðcÀyRmL"=}0=}<ð]è-ý°[	Ji÷LY×V·Þ§ó¶¸D}Mà,êàQW.É¼Õ¯«w~kªñâåoì-·e£_ãäñclcxâð¯,X×ccðª+~sûêR]%c¿'e¶§eÄ}´sFCêt\\ñøKÜ*øb°i,à@P*}8vx*=}ùÚ)]ãë¤·uò¡Ò®Hß®ö~_zòôÚ&d"úÛÚ8_´ÚÝ®8â}p±ûb=JÔípøäZàÜ8§Õº=Jøcý§ÊÝAËË¥õCë=}ð/D=J)>\\>òaT~D¬·üDü0#´Ïÿ7­,Ò«kÁ@òÃz=JûM×¡GgQKÂù7wÝÕþe£A:ölIpÔ}~a©ïÇzÌÎ¢=@ã¾l\\#ô¬çWb8 ouª;þM£=J*FÆoàimò@ðY(¹R^íÄ¦ØK}±f]©$¤x]xUkÐ=}·']®1íEÃ\`É(Õ0ÓiÂWi5=J?»ÿ@Ö/Û±{¥Ö¯Êõ ª@«{XelÁ¶miO©k$¸sýiø	#)!Ï$í#)¸))IY¾À@)=J©Éé)×©(¸)üi)Øè<"éìUÄø"é÷Éáih¾)©¤&	'!É]¨)Ôè>ég)©$"ÿ¡L(&I=Mïã÷_Û=@­¡HúéRø¯F/b,9ÉïéBN-â<ÐéÄð]eìôÇu=}7ei(¦¹ë-yµ´èe¨BÄÞV!3:ïö²?msPå\\ÖDMB×úG¶ïï¥ÖÖNèúìÉ××ÇËìïtÀX}]Ê,{=M5?£ñ.òFàvþóïx)Û\`Iþn:AJåÌI¡ÔéðxnsUÈn(xXæÔ1.Egáà¸rìÁ©²äKàÖ×s¨M mÞ/Z¥nãhYÆXëAr}rÒHÞ~!E«A«ä/ä\\±×G}Á{ñÊZÆÕÓWa*|ZCU=}¥ÛæØ×ÜâØ:¼T¿Z\`ß£çqkw1ß/Úq¤Ýà¿ânôPUc=M´d¿ÿ%²{)sBù[­ûß=@wÌÏ£Sõ,¬Åßß¯M¸.àÛi,c¼\`tÕ'éÐW]}$(]ý"s$b¶ó¶¸=@\\w¡».ÕÉYRZ@¨tw¨«·¡ùQ¨±Iñ»±ù|\`}ÁaéH},.mÀX¯òæ´°;¾×|ÛîÇzNØð±¨.±à\`\`\`à\`/e	Öë¬JË#Ù&4dÛ#84d@à±WmCò0êàÚç××=}u"B8Õo(&#5>:)Üzª$ñ(PggÅTµ'âæJagwµóõµÇñ=Jþea¾åfÀQxîSù¹E¥¬i¥2ï^ro!²åzÑXäsïxÌâAóÅ¸ÕÌïsùåþ=}¡OIÌïk¿&æU:E®ºx®¶¤0± Ae¶'OpïTøÀ´÷k¥îçÔAõ<ã=}âuë=Miï£AÓl¸Ýº´y(L[ÃXNcF\`±ÝÜÛh ÂÄÞ@T}=}%ý±ÛuÚeâ».a/ÐTô×r&½sxoßÂÍ\\¼Yo¨ßFß¤NDÊ¶Rk÷éäµzâ7ª7¨Ï¾ü3Ë¶²8æ=@¡ÂoÂeßß]eíñzEP½;ÄÊÀL¨àº$7óQ×Î,Ü_¬8×_¬HQÏÎ9ûÝµE¢%âÓ¡oËu¿xÞZË¹¢@WÈ~Ew¾úà{?PûÌ:OÞ*ï÷c 5\`ûH¨¬gPË Oç=@Èfíãùû<´dvU¤ÑMJìnµn¥Æ?ÖÇüew¾H<ÈÂ=@e¦nUnÅþÜn¥tZnóÉohæpñ5×JakSgN|6n^}6jAO§TS/ÇCl|W^}ìo© ¶Q¾pN¯P»;.kË¯øÐR¯1ô©+º~£'¡«»¯ql%AºµÚpc»eH^þFI!=@ù×UòKéº	ÑhSqúXRXdóÀ °-¿¨&m1¬Ådê½!N¬+·ô|5»TjQk¹B=M¸~£Yls=Mkß=MÌ>ÞµûAùÄÒÞ5ÏË=@UÒùõ¹TÓTa|58zÓùõ¹}Öãß§tË½¤k)*¯!¥êÎÇsãd ÇrÓ°N ­Êá~8ç5¯\`óÉÐ.üTÒ¶òËû¯ ¿oK/¬9ÞÛ°ð7®.~²ºnm3/Ìiþ^·ò+¨|8®V´»n9=MY±-åñ)º'LåÀ_d¯Üô¬B_\`'¡â9UgjÀ|bp< s¢­É³NÖíG©mPþ&Ù¾HZ9IË¼!?çwÕÿ¬5Î}÷'c\\2eVz$TÉqü¦Ë³×ï8O!fàèú,å·¶Å¹t]L WàõßÐéâIÌ)'®[73}½=@êOvÉí{ k¦¬_tÆËÍsy"¿]2=}_Ù?2¡}Ì¯9³í7O	$f0«tÙãdùî×Øâ¼ýõóºZvó*îPµÒý"´"T$l4±+AbLÈìz"\\&NTRñf=JJ2\\p¥/=MMÆz´=JbýwÎÑsxø«Ö=@&ò:gn;à1g¾%Pvj£&lTÒ[:ÐÃmIùwQÖp×c0ý¹Û©J¶vlw¿\\îä¾Z2=M¾ øjt=@0Ð<£õç|Á-ù;:1å3ÂïÕ9ç(=}¯d·¼Í:$üå~Z@W¯<¹¨Ñÿ$CÏw·Ctâº=MjÏ/ÍC)qÈV}0ý¿¥$ã5$ÙÌAw=@6»fµß¨t96¯ð;Ó+t[r¦Qeß'³Á×=@hÞ,r'XÖª+p¸]ìuùb®zÉú;l$ÿ\\¯0:üoóÂ¤ÚÎ7nÃÄ(õßªó)YæÇ!ÙwÜéôsó)kÛ,Ä7Þ+}¯Ö=J1·£õE9=}{¯þ×i=MaC½³î}=@/ ¹|Y^ììFÈù¿%æ\\éjè­»î×<¥ÈüßPRDë{Ë½§ÉôÃ/9Bè¾$;îc±R)¨8}úp£¤4K#yR#´ÐAa{­¹3øn²ºÕF¾W<¤JÔ¯\`Úíg±ÈóÆq×ë²©Ïæ5÷ÚØØ²ÕÆ©³{äìÌfSùÍu"¯q¡ZFBP¤ÄÚ¯ÜÙðôéº$½c$þÁ8¡/°7ïÏ=}´0:ç9=}ñtÞòîT®¾ùNb²Dl«Kk¦ãLÿ8æK~Í0br9wÍ=}*¹¸l=M½æ	ª)­<]Å]K#Ä8ÊªæØQ¦yÊÀQ¯ktØfôÜNÑïã\\)èÞYÌæÕS®Þ5w|yË5oÍ?ÉZ×ÓádÇz°|×ð2óøß«ú¬Dï¶¶¼¢4ÑfD¯êçH×ïì=M}Wé1 ì$1ò<®HzßªêL²åº$dï%´Õªº§ÿ$À¯	Àÿn¨/3ÓYsjGsK!ÄòèÇ($iì(ôàùßÊ(*vweÙÎgpßìEÏù3"u¦X\`¼Àò¤3DÉ ì]ôÉºèQFGÿp\`®(ùy8ÿ}:Do¢7¡ñ§I!¾d |µ²%o·N3iWøUMR±V!5$<¬DþG?Ã$;¸S<QYJè-±»#D~Tà}×ãpRí´±TìíçK_ªÉj¢.®[y;è¿ÜYN¿tù7t_Ø\`¢5|&{×Ùªê®ÇYL5Xäß<MW©z¸ÙümÛ	ÔßÈmCÿæ:Ft$:Q¾à3EXNâ¬V7Õ_mû9ÿ>÷Úsþ´H#2E¿Ä%cª¡V­Ú(ER#5A@îðý¯Ï\\ß6ÀR[û·Ð5c¡@\\Ë{[µÙªÛB²Ã\\uøõÌÓMnÈú9Ô'A$j¬!)*²\\tË3Ð¯s®¸Ë0z)x§{ÞÉTÛ÷ãx£DO×ßGªÂ!³¼?ùk"&l(ß#È*t"­ìQ:=Jídj¿¢Ë/þ<ßß+(ÿcÊ]§ªV$hÙ©ò1ò)ßªà\`Êø©(»'ayÌÿéys(ïáòÕº¥wðiÑÿ=@N½£ÿTõÒ¢ìý@Ï25»  À~{øO~¹ó§lM2ó_ê{²¯Ë=@Sf2ÿz'°ßî®éÊðH°ÂeÀèëãF	ê4©¤cì O3ykÇ;Òþ2ÃVìã¬´³ëkð©lñ0Û_þ\\fVwij+îgÆÙ¯/ÞZÈ/HpÐxúÞ«3ÒÛ(ì!é¼ýØ)Ä1=JU5ùß(,e«¹)#\\n"!,=}HèâIÑþ0ó<\\ÒWî&JW'+ø'õ|®÷WèEìqÊÎ)È5±¿ûò>l(oø\`î§;Ä¾ëIÒ}î"/EÄJ1|AøæûUBñz=}æ9ÒcéËhz«Ô1î¶lr'ØgQß)Ô59j" )ò$¥Æù×ÕUHÔï<(èÚót30º¾]Èº/ÒGÙð´CéÕþÔhª!¹ü(´uß~GJ=@¬®©©or#SScmÕI&y¿©§=@éØÊ×>îÌü±4ãîvÌ:ãqk:ãï8¾ä¢Õ~áoD1±ÂssôãØú|jÏ¦ô$­Ü~±,Fnr=}êMþfêÅîhµ9§kfßà=@YjVx¹¨ßBwí÷¢¶=}f»%CLXÎMVO\`kÉ ¨7\`E!Ëèã4x°_puõÚéGÆêç4Há­=JÇyû¥¦§6\`¤NLnY&dçHd¶Ø±ÙÉ=@íÎ=Jô¬Á?E=J<×Ï=MFE>Ù*¯äyl¦ï¢FE;*%íÈ=@]@n_®Ã´E!8êZ;þU²CQw~	5 gÑêY©6§69îlé=MB,È¨¯ÕT=J=}=M¿å³ùÄÚÒYvþA×v8=M(¯i8 ðë¿óB¤ßaQÑÍöbDÇ+%AûÞ9P7µénýÃRý.À/êÐÊ?ßp^îÈÄá[Ñ÷OI=}H°6âðhêìÁÉÊxï$B#":H·ÕªýTË¿"ï&D¨è-Ê3\`¿¹¶\\Û H~5=MiFË@EeæCØ!ïæ'Ë@	¢B\`ØÂ·äÇ¨ëÃ=J|Ö^ì0æo¦INÈ­híò!zô#@ü p­ùïÂj~Ó¦BéxF²GUç´×¢~ÒFô&Æ¯¯(nã íXp¦%Ðcp¶f5aýþæg+a¡ð­çq;A¹È7yíüC3Á÷êsaY¢·ç·ÕíÚ)zwë±{TçWÈ~«üÁ¥Ê¤³B>«ûW¢\`ß1=@¨i<Ø¡HÍoÕPR@§4Õ]ùå·ûù"]4£WïÓãEå&[hHb<u ¶°[fPP9ìäó»ð,	§vC*HåÍûzR8Ç5ªô½Æ,Ñ­-{êÍNÆÄ÷í¥ýèÐ2ZÇÈ£¬ýw=@ìåOÃézX¡è¯öMr&#¡¾2¨°	HÏ±Cbü5öî(ëÒ)-FlÉæýÍI´Å@Ì#¶gBÝ04¡´qü´²ç;(±éîÁ2C¦?yÝP=J öâ¤6$ýåIµç,Ú'{Þ"MÌÁðË©|v=}5Çáñ7¥v¡ñµ¾¤&ât£É=JMåèÒ ¥^g7Sáë?æBèF@s*}XñðùÌmeFUB$cßÍ;úÑY\\­¥Ë{ù&"ìr·ä»²i6_þn¹=@Ó2©DËG÷Ú	7É[RC5f5øqù,ÛÛë/GÚ9=M¿lõÒ=Jã7ð¢)»Ûàqvå9=MùwjßNØºX³«/³I	=}©³å'Lyun\` VbEwèm»Û½I3]÷q¾¦5 7=JáThx®)²÷ª=M¨eG=Jhl=J^qUg*;õÆfæG1PoÛp@Æ¦*W}gñâ=JàG¯tØð.¹D²FwÝkW>Ç@Ùp¯O¥Ú(¡"í3¥ì=JeÎ¡È·&7qí(~^C({k>=@e=Mp9fÅÛA%¨®mõÚÌ{?ª_]LÝ¾3-Pij	s l¦!÷Dc%­9R&fLíÌ	]æw¨ü£AÄýà ¥ß?ÓeÉêµVÖsmþRCÙ¤/B¨´Xhqê{¥®aè­<eÁÌw¢âäVÂ²H­¸ÌÕ+BdÓ*P¾tì(Gºè´1!ª£×ä#÷Gß7-¸Gí³¦?Ú(»YPù·¶ß-[àï£æã2%ýÈ±_º#"8Fé>¹1Tìì¹øÇ÷±YÁ, ²¹üp=J¦ë?BÚäR° %0XxhââAÙæí®5ÂÚGØ9²­TÈþruîK·ÝìUâJ¶ûß=J}¤VìV¡Sy£æCÝÌë©9¶cý,¨Xb=J.ðdbÂ"]&8ëØâ¡z@íPdäXlÏ®²d³×I¹kÌÛOeð dÞ~AØép×q¥{ì5g'Ø=MÝÕzm0èÓC*å÷u¡gþµt"fdfã{b©DäYF.'Üã"Sþ2E_p±[¦öåÚEtR%Bÿe¿Ìñû3Muhî¿¬{üK<°vëâÇÁ(Ç9©îú3ßNE¡Wj	¨úôO8	ÁeÐ%FfgZ5oìÐj©cÀ ¯¼7MW@¸?Ï(Ãü¹ÿ%Cìv>4ð!	m$Þþ,Ø´|0À\`j¤ÍdÚçb>Ám¹J%_¨g=}i3ëÚòuÂA£@ $66¤D[ #<i2÷tamÑþb£0¶'"à¤y>¤I­Eíâ¡Fæ	ë×ÉêKNvÙ-e(5CÃSZ!å´	ñA å[Ö4ê{¦.Q7ï('T¢Qýë¶°Lr/a°þí³R7ÍtAð²ÒÃú£åº+¢!Qd±hêc	ø¿êÎÛ¡ "ÙîM05ê¿ÇÛPFe|>x=}¦»úÏ\`ÔÈªãiíÙ$×²'_¬§èpqøË?Øf§­Ó7_cg0aØì­	yÊ¤Ç­Ò{ù²êtw{yBà:Þ±DùÌíð[2ÉeCG¸êÑýoÎ)?8ènîW²Ã?3¹çûÚ'B;y#Híùz¥±Y¡£.ÃÉpþ£Â{+8À,£âü1·¹Ýëïºé/¦õ§àaÒ~×Cägc­mkñÞC%DÇ	ð=JZëW*«:'ïoäçDÉ¤.ú×£S=@¹´LðÐ/vEH"?B	¤\`Ç2jÏCiÑ×ZO^¢;AÅ¡ì¿¾$²èBÝóBDç>èG¬xùAÍ¢¨¾ Q]Ë¼ù¨v^På³E5xÍE¤ÝÇÊæ=MK\`;]ïÓ%=JâBX)8÷!·ïwLz-~Ef=}ï¶=M=Jý¤RüÔ¿o½xB[7­¬PâR =@	-¹Ñ¡LÄfZAvuÔìï¤°cåµö­ÂUÃ"CÖÄíùÚéé;wA;h:<i­;íTíwÖ¢\`?Oe	lÏq nÉPnBÀ¿±wÙ=@=JýÖÐ;X&r$5[¤aräI¹¤}°=JýWÕ:^ëYjæ§3äâi7KCÅ8Áa<	æè^oF!rÅýÏb0üå»k¢r9S	IL¸ÇÏã§¤·Ñ"H½Âd©T(îó¿,\`à/jK±ìo´d@U~ÌÎÝuÓüôÀUëßÌè¼Å¢5!É²)(³)ßZé×bæL¨Q|@Êõ¦µy¥qØü¥´íX»íÆn>+ÅÛÆ^ nÁªUùî:$=}ïNÑ] Û#Uøw_¢¦¶f«ÎÆ«»¸¯BÉé:)EGBõµ-oH»]' (]æfC4³6>xhz4~\\®d(%ÇºAæeµôëp©ÆóðWë^oP&AÆ=}³5ïõ!ôU"¶õ<¢®HØ·¦ß¦Õ½i#Q8c6~òµøËÒ°s$lx[º9ó#ª{ÕúøâSeÿ=@ø§<i¨'Ëì¹	kÓQÊçºðwÄ°\`=MJøÆy¡Ð\`ÁøpÆÐÝýwdµy=@<Àx¬ü¢èy® dÅÂl¦¸=Jv=J¥ëÏ2Fï\\.È<uü.¨JÇñvý#ó-ãÌIbÁö'CÖi­Ú(6=@Éë$]©0ù'CÖi­Ú(}Öi­ß=JìRö&¯ÃéZAhOè\\ùÌ?óç¢®LûÔ°2#[z%j=MõÆ9{Hi=@å=@ë2ãê.\`·ãôîÁ#&whëVÌ)sFQ#¦cÁjâÞÒ¨B³î¯eõÜrJÁ­~h>sÎÜóùAÎc#¼»Èë§Yç"']#¼ß¼È<½½¦ÂsÎÃXÐ!Nôµ)#)x¤E(±ø6\\ÆY)µ38f}ö·fHZØí}en6	9höå·Ô>lÐÿc©Ù)+`), new Uint8Array(107492));

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

  var HEAP8, HEAP16, HEAP32, HEAPU8, HEAPU16, HEAPU32, HEAPF32, HEAPF64;

  var wasmMemory;

  function updateGlobalBufferAndViews(b) {
   HEAP8 = new Int8Array(b);
   HEAP16 = new Int16Array(b);
   HEAP32 = new Int32Array(b);
   HEAPU8 = new Uint8Array(b);
   HEAPU16 = new Uint16Array(b);
   HEAPU32 = new Uint32Array(b);
   HEAPF32 = new Float32Array(b);
   HEAPF64 = new Float64Array(b);
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

  var _malloc, _free, _mpeg_frame_decoder_create, _mpeg_decode_interleaved, _mpeg_get_sample_rate, _mpeg_frame_decoder_destroy;

  WebAssembly.instantiate(Module["wasm"], imports).then(function(output) {
   var asm = output.instance.exports;
   _malloc = asm["k"];
   _free = asm["l"];
   _mpeg_frame_decoder_create = asm["m"];
   _mpeg_decode_interleaved = asm["n"];
   _mpeg_get_sample_rate = asm["o"];
   _mpeg_frame_decoder_destroy = asm["p"];
   wasmMemory = asm["i"];
   updateGlobalBufferAndViews(wasmMemory.buffer);
   initRuntime(asm);
   ready();
  });

  this.ready = new Promise(resolve => {
   ready = resolve;
  }).then(() => {
   this.HEAP8 = HEAP8;
   this.HEAP16 = HEAP16;
   this.HEAP32 = HEAP32;
   this.HEAPU8 = HEAPU8;
   this.HEAPU16 = HEAPU16;
   this.HEAPU32 = HEAPU32;
   this.HEAPF32 = HEAPF32;
   this.HEAPF64 = HEAPF64;
   this._malloc = _malloc;
   this._free = _free;
   this._mpeg_frame_decoder_create = _mpeg_frame_decoder_create;
   this._mpeg_decode_interleaved = _mpeg_decode_interleaved;
   this._mpeg_get_sample_rate = _mpeg_get_sample_rate;
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

    _createOutputArray(length) {
      const pointer = this._api._malloc(Float32Array.BYTES_PER_ELEMENT * length);
      const array = new Float32Array(this._api.HEAPF32.buffer, pointer, length);
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

      // output buffer
      this._outputLength = 1152 * 512;
      [this._leftPtr, this._leftArr] = this._createOutputArray(
        this._outputLength
      );
      [this._rightPtr, this._rightArr] = this._createOutputArray(
        this._outputLength
      );

      // input buffer
      this._inDataPtrSize = 2 ** 18;
      this._inDataPtr = this._api._malloc(this._inDataPtrSize);

      // input decoded bytes pointer
      this._decodedBytesPtr = this._api._malloc(Uint32Array.BYTES_PER_ELEMENT);
      this._decodedBytes = new Uint32Array(
        this._api.HEAPU32.buffer,
        this._decodedBytesPtr,
        1
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

      this._api._free(this._inDataPtr);
      this._api._free(this._decodedBytesPtr);
      this._api._free(this._leftPtr);
      this._api._free(this._rightPtr);
    }

    _decode(data, decodeInterval) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._api.HEAPU8.set(data, this._inDataPtr);

      this._decodedBytes[0] = 0;

      const samplesDecoded = this._api._mpeg_decode_interleaved(
        this._decoder,
        this._inDataPtr,
        data.length,
        this._decodedBytesPtr,
        decodeInterval,
        this._leftPtr,
        this._rightPtr,
        this._outputLength
      );

      if (!this._sampleRate)
        this._sampleRate = this._api._mpeg_get_sample_rate(this._decoder);

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

      const type = "text/javascript";
      let sourceURL;

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
