(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["mpg123-decoder"] = {}));
})(this, (function (exports) { 'use strict';

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
  })(`ç7Æ§å Ög]¥¼óöN=}¾*3®lmn¸óD,®A?>b  ¿øÊlr\\]Ä+Åã]­Ìù[³ ­¼ÀyÙ¤k<9¤çÓq×@yÅÔqc=@Toéé)Öç!v<îygY!.ÙßÈ) ©(ù)3%ìJ2ìù¯×Å=MÃÃÃzi»©7¢Å «ýaÁr=JLÑ#Tùvy3r?ùvU¯´2rag÷ÍÖfígÈÅU ËXx;Hw÷®}îxßõÈ{ö¾ÿö9<tÔgaÁ~Ëè Òî¹, ËþO*-#¬PäÊ@èK¦m:%uk½	ÐÏ2	Ké<n&èó¨	F~"çOÒî4	C°ßRx·¤Õ­««èë´ËtÍéIH3%!póÄb6{I¶°Õkyß@ðÒ@îsBñÏR²Í(Ê<¯:Èû!Ìbtìo>ÇºX²uÏJ¶õ&p{F*|>/¿Ú7:0gvuàýÐO6ÍÒ|6	©VtÔþí·¬fFx.2í­N¦u"=@=J©7í5 ±ë¯Bþá°kHP	?ø¯¥íg}éè%¸68©=M	èØÛ\`æôU¡eQYã$ÀQðY(ÿ&Ð§åì	6¥¨©#Ç=}{~ªÍûà^beèWU¡£óvõÙ7½A1£Lµ=@/#vÕnÜÃ^r­·ëÿÂ°£bÛ¼=J^I7_ôÄÉè=@7.ëÄn	ÅÍßZ@Fa?HÄ~ttr¡¸Rä;¼z»EÝfµaq_l¢¾r_äUi¸ÎÁ>¾!¹Ë|Ï¾É±<D6$Ï®â"äJW]-ãÕ#À¦ÐÉ{Ó?{õÌÖôÎ×]¡ÏÓÖÆpÞUÈ¢=J®Áy=MÀ+@|xDCò=@];&«Óµ=Me½^ÐI\\$®ÄÙÞ^Ïu¬JsuóëNTù6vý¯ñ­³Ö,û¤¡D¸Ï%v®Ûx=MÛ+hrg ì(Å·U&,ì1ÒÔÕ±lsE>ÿy%RÎß¬\\\`åiiLÆÿÒÌ j1ò&qQìÀà[f_§g¡LæÔa²ìYÅ$D¹m''ÒÐqmüãyMÌ1Øí4R<â,äé+ÏØ,üâ?Ôºtíã~{D¸=}ýC5rIQy¤´Û´ØXÁg7ýãÎ>Þæâ}>Ï¾osµ|gJ(ÝáB¬¿üt¨VBQmí(DûáÏæÜþ'cÉ Ï¿Ý=MÞ=@[/"÷Þf{ø­NÕ 0!Ð7oÅr=MÞù($x8$ÅSíàÖgäQq¿LsÕÄPwiMïÙðz|<çÆ,ÞîxyOê×ÎU¤ÑÝ;j!{·^PZGR,$üºªSwbÖP½	~\`n=@ðàdÑ¬ü=@Þ¶'ñb/~!þÜ+U/Ovü¿fÇØÆô¼Å8yßtW×¹ÑÿÐ¡ZûTÝÎE¾½3èPBéªÆ8ÐMaF¡?ÐÜ¼7v-ÉOýºv+´Ân'%G|kx¬æi¿8bGtK{yäèÞÉZÊax¥#7ý¿®-Ñ|Ïw+j­ØA^=@}&'5 DàW­uêh~b@÷ÊÂÛ$Rqn¬í@®ïl¤×{ôÓ=@mÂnýÎ2Øÿ±¶¨÷í%£öîÙ=Jt«TQBùôÄ{£dÈÿq½u}èR×®çÇGtñßãÛ=J_±ÃÑcÑSQfWU¼ËL^*¢H_ßü÷bKÚÞ¦¢ýÖjK¬nð\` :ì2qçjñûñg}Vz4xÄöy¬?ó!Ð{Q±µJgA-/¾ö»ÚóuI§gÅWô­Ûà3)ô¥ì¶GP¢®^±qúTåÉQà¼°=MÝh3ÙG^è£¸åØÇæ]×æx~Q;T×oÉ¦X4õþ¥LµßoÀB"ÂX5®èõ#uúÁßïÚ½+R¥DýÆqwÅÏÈÒtª	´£à¼Èç¶ì#ÚWtsÝÃÀÕHmöèöøe_seòÒ÷DËB=Jô,Ð6%3jðåz=}ùùr­a^WYxÐn(GÚMsù¦ÏZºér7ùMï°î(¥ºOÍs@Ï¦I'<q=}(b=@8q=}Zj&2t#=M	áiBúIè¥¸{x¼Í|¬fÇþÞÊÁüÊ£ÄN#Úf7¸ÂÔk¨¿Öô,w?¾õ=J°ä¹ôñ4ÕvyÒ]Îý:¿¾®ÇÓÞÖ÷WðéòsÂ-äzn@ÎìûjÎ9ºð9	\`O¦ã2CDº¿Ê:r0³Àfÿó:a«MTsF°]ö·íRÔÊ#5È:t¬(²~º£w:µËÌC	oþøîÂÄö+eÙ]$ýEýÂ[ùðèÖÔC9Ô(ÖÜÙ/[nã;¹¾·b.¤·¨]Çÿþ¾¿¤ÃøÚcÕ[õ@jèñ¾yÝýwGa±óÑáÄÞ@VqÝäQ8}å Ô¡³æµB®=@E<Ø4²äõ=}=@Þà%Q.ZMsö±âªæ?ûû?ítÏE¤­&Õ«ZpèÌaÊÄªr¯CÐóÅo\\5Ê¯í3¦Ô}yDc;6U¥MzHª´=@Ûì¯äÍðVUÉ*h¾o´xä\\Ewv.ÚüûüÎÅä1}³.+7µJ±Îq3IØí&Þ-+;=@¾\\Æ2Ã,\`E¹MwèQvè¼²	Ñfå®n^ÔÎÅûØá±'cæ>×°Gt¤ñØ!Þð³=}qr£ý¼YágîXöÅâæô!ÄOSÀyQ.2	°OQ»ävÍósàÙ½2¼ÜA³XTþàþ"Øî(Ì"Ï[FÖä¶èà®ÉÌ kwUÙwéü1ªÌØý¶Ë7½OícNMK÷°|ýùÍ~/CÕÍ:qïh×}± ){R÷øC­HÉYôßÔz4>ïùÿR¸ñ÷×îR	\`5½@ GnãloÝÃdj¦EeÖUÞ¯|v,¢ne=Mä@þwV@7&Ù ÷?ÇüR Rb{Ú_ÕÕA>=}4SÑd7Æ2bû¬ËKáþÌðËÀÞÏùl,njÿ?N»ÒH1êPMñeû,TY«=JÊ¹ÒÛ?åc(ÙÌgjú½À c¢y±¸j²ÙË"Pð¾Äÿ×éÏg½a0*Àÿ]+Ý+ÀàsÎ^ ;g,{ÐÑ¥T[?ÿÓ=Mâ9¼¸Ø[\\ÞhK¿ð¼S¢ÑJnåyáêAè7ê#Ì­ÕoàÔØqËW×qG'ÓHß(?ÛröêôØ¸.<;¼°ð§GÜÞD÷;(Ù.¡æxÅ%ËöÂ§Ï8b:«îóÊìü?8¡{ÚFjJO/C^¢W åó»·yC¢[Gîh$yÛåêèªæàç¡ }lñõIs@z³b:"=@_ón[ÀøèwRÞn2¡mßÝEÈ¿=@§Æ)ãsn¥°å©ñ­dÊß}Ô±©¡x²[ñº^R¹+Ë+@úÈD"%2÷Ò:cjd¥mre?¬n¹R¹ÙL\\øÍ»U¡*ÝQÙä®Ì7jÈ3A1L¹Qo|µxáéØ å\\7ÆªJH4JÜl>Ülvàe¤\`¬=@û;ÝärâäÇîg0­}ÏM° e%Î'ààRt·ªH	Ãk¦q£ÔííÑÅý=J·ÆW]QY¸Kä±ÐX9=M»²|}¿Ð	=}½ít®mÃ¨r:©%Y\`¨îIcÞG(V)È¤J7á¹|(Å"e9GzqHLÙ!Ç=M5i¢ïËçÒ)ó¡Hçò«m1hÈ=}pèn4eÎwm¾)?Y	)øi%}ü$è$­=JFü(1i¦åÄ-	¤%ÙiIâði{nªÜè3Í<X×Å¸KëÈ^¢®cñsÁI&iñz­Á/ë#ÝÝÉ¨®º¦9a±6·©¨)	WCï"Ú¸p#	%î³M »·"Õ¨Þ¢;edúF¼bOÉ=J19^±3©ÐÏ­.O"è¡O{¨&³M¡¿éäR©{¨Z?ô	(ã=@¯]}¾2¿qnezd=M¬	Ýÿ­%o¤bÈRMEî­5-c7ù·~=J	´«%Õ®ý"»kyÆ¸fçX$µ_)s_ÑÃ÷=@ >	g;æøÏ¡Õñt%R!üSÂ%Ã=}ëùCXÝ¾QÏ¼¬vLú$D{lV!é1ò§!éAýæ^ÕA2	AÓ=M¥A)6âú¸°<ß=M·*Õë£bS¶cY\`M>_M¹Kî2YçG~W¯Ä MI¦ZtaQ¾-@Gñ:Î2 _@¼u2°Í¾³À"åæå\\¾¾A1.©R¸ü¤B8û}rï0¯nñ=@´åR\`q$÷û¤!à]ö¥ÞcXFà¸àâáuaqÁüÜ=}ENqî¾>ëÉÀUnþ«Hxä¤jxQIËGMüÇ=}¸@L4½ ²Lí¤µ¯ýÁÿ|j=}}=JÓðmÅªpî8Jö(¹®dÚ{ÿnG.HGÉcunépÂQ´ÁQ"ûÚ'B÷É<WÛ&¡×göQ¬¿ÌWì&ãTeÁOâ%@%ã¤^©àé=J}"ÛµhReÎe	"eFÎFå.Ójð®é}ÛdáD÷¤ÒÈúOÍ²2¼-2ùr}°§mÏû³D~ªNRðã.Çi¢³ø¶¯ýÅòÇµüÖWë8¶lKÄBìL©Pâ¿ç¾ð×=MWa±GKß¸\`0GÁmOIá¼ÃGÄg>Ö+yÚwüh.²9ÛÙo=}&Û}ÏijnCqìKýüèÀð3Ib;	ýCÙ,à®RaÔxq!]ßÔ2òg¼ÝM®kN°ûE¿àßû¶Ë­Tj³Ü2ØbÌü	¸ûVÈµ:¯Ìi¼^²Ø¹NçÀÎâðQ­£½Þê=JñRs=J§æ",_´}¹$¶x¬ry@fúA¯²,O§Bz¾÷DÅÛ$Öx ìDsê5ìÕ<ºc¾(Î=JëÀfNåµöäòjÆÝEÜjâ8.à=MÆÀgþ9'N¾ÞLgmBhÑÑhmq§´|llUá÷ç¤¸6&("q¦;}<Äû½gÝ£aµ¸]õPî³>%	1íÅÒÊ{»»'C<âxøR£UÞôïÊCËgÙû qè¼3½eKÁ4l²ÍÅù±8è­Í?É¬Z$=JÑqX¤·®»¤zºy)É5!	']qÄ¨]h§íl×{û iE§»i$Ïç®éi¥"©ã¯æ&Á/I|a¸¨frú=}M½£ÏbQxv]ÓÊ=MÎ¨ØÞ9ÌqØÆv¨>o~C[MÈ<µ¾BÝÏJìn­7áxÌìn×©w~Âè;°´ò4å²ÖË'<#|®GK¶Ê\`ÿwÝsÂdÄ°1Ê´äîÂÙÙo»WÓõ}ã±=JÜýoÇÔFk.Ù5@oÃ3ÁVËöLÍæ· ".ZÞïÔlÀl^7¼þë:{\\4qÆ¿åòÓÅ=J Ý¥®Y¿ScB«o¸YõkÈcà!ôÆ8"ãKð¬ålaRß$;ÝtKZ¸=J<>É>Ó|·h¿¿s©Ù*?2o·¢ÆY+¥P ÂÁ¶9D©fH[Ü¶÷õõKo2t¨á;ÈùãJ7ø³àë=MàhUÛ[=J5&9HAg5¶¯,ËºO5.¹¯Øq¾ð=@ÂùTJ·V^o>òà hE,;ËM2¢6öY,ãïñ =@TAnÄòÍ»7ùM*lÃ¤¾ÜÿÄW¼@Æ- O»çÔ£®¦#¶)¥án3ÇØÆù[³sGàu	æÄz	,'¯¾2þ+ÕàjÎSÊ»\`]OL_/,ãQ¦pd+Õár=M«ªö#¶¼WüºjÜrù³D#û9¾.Ã#Mï#m([!¼&k!ü&+!(;!Üh)üáÏÃ©çÖ÷iÌøÜ¨hÝ0²Î-ò¦¨öümµc®¾Aùåºï#m$Ì&Âõ=@öN]É©ïÏrAÝ·< Vñj[e¨he©hE÷9P$MÃyS¦=}'æTÏ6|åº|ë/Î(CäÆÌ±õ(#¾\\rSVOä_éÂ¯¦xÌ$^t=M@h|ãÂTÄWÍ4xAánÝÅ´q.Vvìõ¿=J,)M:pÇ8öÑM5µê,½Ô«â\\ÉØ¥KõüÝ/,)<»MùÇy=}T5v°ð¦ù¡9©ÿ£³åù³-Lû ph=@dR=@ÐªK¢×«,+Í²Ì¢Ââ¸ÎVJKX]Zµ£+«$£µ@Â|_ä§[ÕWb¤øÅ¾ÚÁö¤A:ûÑvÕßêÿyj§¨«#ßÒ.=M=MÆAÚÂIa[IË(°1îªª|î0105=}·p¤l«ÑE/z·oWjø,º¬/9Íy±£Õ¡¦Q~IéêñÊU©ÚÕkÕ.8ÌL\`ã´aÂx-&á¼Zºè¾ÓÓz¦È+N>OÒIÙ=M-C¿¬¶gÊÊÌ¢áÌ®TLs¢ÙNöD<{N¾OÂ7SvqY%ä«9²j?úR:Ú|î¨P5;®ÛZÒÍ®ÓnäìBOùÓuµ¼Ù=Míyxñ¼´¢ntèþì$ócT.}xòÓ}h¿VèØíaÄM¥å¼¿öZáU£Å¯ZåKgøv©PëæOYtë±">Jx{Ê|¦"  U¢JÔçp±}{=M;½ÃÉÍø*rB¡ÛÏi?]¬fÆª#Û§ã]#R´¼sZsä.¾Í=M!°£VW¹§k,¶úr,}$¥íV^°=JóÏÑ[¹©ëîH¦Ùoí£-ë\\ó§ÞÒþZúQ¶²ÁÜÃåN·^T±½Kó=MÐKº·T]ÿgðEÿg<h,9ÏÊ¶÷$2Ö»[F=@Nfr:þ;ÙÞ­8ÖðÕÃ²ÄyJ~ÀDñFf{äp¦aq<³ïc+Uø±¡m]ÀúØ^è¼~ÓÎ®áAÂü]+_3Oñº²ORûKw¬ÄØ²Dyqâé"x-ñ76±~¶1Dæ2&¼²W/bÞÇ­)wÃ©5[·/ûë0=}WS· pØçìøBÿ§A>\\®e+äø$?eG_=}ôÖQ¶Í?êüaE·Ò9tEêÛöHKQæx"Q·]ô)î³ID«é]©©ÿÌ%Ûmçµëo·Ï¦ûiPãy÷TÇù¬õ%ÇÞx|áü³ØaIæ¡i$ûöYXV ¹h;Îua:!û±àh¼ùf#RwÒWV³VhLÛ¹dÑ@·ä,v¡i Üzt#G#©Ãø	8A>ªë=@q©é%ðAU©÷©¶=J²"_ã±Eb -ÿVØ/O©^FA+ºV7a&çYEÎ±<úAÝhLáÅ1ÜqKõFkQL|èâÔ¢q^(RÅ«Ú=MÜú¨ áH\`Çoó9A_=@éõðè!V =Mùt(údÜyæ3g)èÿè°\\9Ó^¸é,¦áÚj4KÌáNVIRDñ%Ì¥QÑ$ÙÜ¥UÚ ÑY(ñ±@Ð¢à;0·bÉp©úÏjD5ÞSrg(êìÄz)NþtÛLÒ»NÊýVÂùêF\`KUç´ïw1\\¯éõÜuiäì£\\=@@¨; ­xd¨çÀÁ­qRØÔ\\§èS×iOx­Åëp·¼î¨ÛiÍmÝqý¡(ZÛÂ´hN=J¯?/öÏS¦}ÄÇ3Å´kíL?IâÐS4k=}¸Þ\\#¬ä<äWÝÄ7£«ä5.Ý)ûMiÕ«?5Á·R6·áÎN É®ý 	h¦ë¯µÁ§i'Km¦=M)#Å¢æK&Ú7)caÃ¤}æ:2íàjÂ4ÆÑ0w~t©®SgæuY_´ÝÔ.Ü=MuT!öÌ"7^fsÈ@pàco(rìÙIëºôÉmíÝÓ	²ô@]WzÜçýopÔëW³æE3YimäOÐê¸ÖqA%,T´å5ïNUÒþ¶k½|Äs¼5_x¤?\`s5á\`)í5}2í´'®ÝM5Å"?ÍóYCÕk\`¤>ê>ÞmQQÞ2ÿÚù[êç1t«Gaµ¦E0î*Dm\`-¾läïóà\`U4ó±~u^¡ÀÔ_rSpÀ½´÷ÿ;L&åÿJyðe»tËþòO®ß'tÑÐ1± ÓlÅ¸Í{Q#Î·ùÓâ2Ñ3±tÇýà]_H;31ÊÔÎÎÌÊYº<.ì¦.hÖ[jªo6wÍ6QÎ<¾ýd¯úýÐ\`AmóÒTÏûd¼à´3?ÕüÅÐO\`Ø}ÛLÓ}ÛTËÏ~ÖRüÕoMQ?U®|ÌTþ®åwøSmsÎk¡*pû[uÿôxøuåÆ®=@)Ö­wvË¼§qÄ(ý´*IE/RUÄÕx@jÌr8;aË¸êhÎº¯#¶2NRoZFãµ 8H÷Í	YÓê·¡wÑËÚÌv;dMÐÔñþvåj{\`×wü7þ¤ºRý{XÃe¹üV×<cª~×ýd½ØÃjÝôÅ¼¶s¾ÙM;¸C92úØì}á\`QºlÆªúWnòÆª5¥üÆJÓÅ=}ÓnòÆ=JÙ×t³TËÉ=}Å=}x¢¡l8´}Ó|´V:A1ÌPV\\@[$Îôt°åçcä@tâ\\ÿ¦õb&2ÞCÇÀøcJ½ \`¥}qÕ¡¶t±NÕù}õÿûß¼s¨¾î hï>a?ÑP<»Õ¦³)µÎô§-kxi]¼®#°Bk´äÚñ#¤(<>=JtÄr¬ÏÏÏ@ Êýät+qâK2ÝèL+s#dÉ4ÝÎUäª~Å¿u¥{}uóD«6Î°é-a9ZAë$¼úÙjtxÀ._T~e{ÝÔ§(>C»Ð½û5^#cv¡eF~¾M--UvWýÍ=JÍH7¯Óüú)P¸YlwÝÛ=@²«tÌHgÎX¡ítíaÔS&l@Sx[<²ÚÒAÊ@aV$.«7~5-ÄÏüÕ#»K&f·=M6ª¸>G÷µØ±P\\ã¨Èk×[ßðKm:{rîØ¿·}ôOWl×ôsUµÐ°"Ð+ã¸Y¹ßo4ØW0Þ·ºÅ0hÏ@º1×ÄþäU-ä´JmÉ©4ÁÁýÕ(BþÑRPÃ¢(ë±l+ÍÓlWÓ§Ó £YÆ-Å=MWvÃý'Øà]]lÿLÕ:¤>þÙø;7÷VÚ¬·ÌÛÂFÿ²÷9êÒ_U»Ïê³â&©tÍ\`Z÷(÷Î(s¸Zý¿2=MY/=}§×üT)Ù©ÏÙÙoI{cßÔèTßÔ¡v¤ÒÙáToDí°)[âÌáBÎÝ{½7+Í0ëtK­èÄB&Ïû¾63=}|°æ¦ÖXhH*_:ìãÙÁ±kâ"jrþBøÞsPÊk6ñ	_Í6£WÙÎ=MÈ+R1\`þDÐ%.¨d3ÜCd÷².Qb]6	ÙH¤;EÞLÓÛ(Å<íºá"d>£SF¦ÊÑð´û[öu±îâæWÐ}ðkf{Õá+á.¬½ÕðÎêsë°ñÔa[?°{©MÛ}V ßËª2©Xû-7¯ÐKåCeãÌÇ@LäùúÈ²31üúÆÛ-hn¢KéÑº&!a:OmÜóÖ¡^7Ï÷=@ÜôxûÎÖìNÿ:-nUª®ÿê¡EºÂ&o}©vª>ÖKUQÎ3Ç¿.Ro!2j»µ«CfJàPé=@8[¸Dü[ÑkÙ=M÷.øÅßK»Qéqìùú*+j0ç#¤m~-mÏ=}ÓÍ3{ZL.¾ËV_/Zøàç^íêú{pÒ&^¾(Òs(=}±.=Jo7fBeZ>ëFªµîj?TZOS ÍëwÛp¥Î-6ªkèëªøô|kES],Àè$Ïëï¶~yä´,oÛSu­NEkìÍOkcë®NÉäcfWMu®±n{_©x½ê¿@gí·ÔAR6¦7oEày¯mîèn pÕ8jÎ Êsvu×õ.ª¾J[{©Ùä8ÀdêQ§ÏxaëtY²Äæ$ùøÍOÄ,=J=J=}ËnÆÇV{NÜØ_2ºÍ9´ð:\`çóçÂ"ÁÉ[Àµ6©Ø°Á=@ÎCèh¬$jËtû÷´r}TüësÖsS3º(:kÅwþ´JÏÝn_j<Á¿K¾nIÂ;ÜÌ_àÞKâ°ãÂKXt]ñHáßc÷Ë-ÇµÞÝ\\\`<DGu¼èÏ³¸ãRMÿVO];ÁþjnV2²<8¼=@ê©µ0LÙYRÎþ-u/é=MOí ç¹©$WÅ(÷»»e+&Àõ8>©¦Ê_nëíºlØ½6D÷ñËé&uÛ¹Hd\\¸MmU~«ÐúË¹Sæ@1à®â059½yV8otÒêÓ¤a5S8Ä¢¾rXzlÕÁf²¾øÎt°kòrÏýÅ>y$úÝkË'­ Â)þ 6ä½3sÉÓy¿Í¹cï¬éÖËS^7,}çk?Ó9°ÄÉrþDñwýûÕÌÞÍTRÎ´_Å?ùÏ?ñOÛ_dWÖQß2¥ñùÏV_í´¼X¯F|±¤obnTºäfÈ8ÓTçleØy{­òm{G@jyJS×öphaOe*zÔºÈâ-¢¢ô#jûôÀðº(föáçz\`æ°iÔGíðW#n=@x"S>PÈQÏýÿ®-½8ÓÇu>ö~]5¥Þû×±hêða¾8%ªRÆ^ÁdªR±üÈyF7?~:R­À8Ä³ú£f)4¶[e¨lK@D.]ú¸Wêùb¾ü?¡ÿ=Mj2µ(¸N-qêÎ±M=J/b	NhEÄ;ÁðÊwy=M¿:ý1ûÍAlïo7Ò÷V~®b±Ï÷3KKþ«FEÊý{ºÎ=}uL+û|k;>DÉáÕ×NüyµÚ\\Ú]TÔ×âÆ8û=@Ä¼ âÌsnZHnC.Zk÷mfI6¹÷MwQZ*½.[ÕäÞÚËÜV°.ÞÜx»Fï|ÓºäwÏ$lÇ¨;Ó±¤RpõÂÏgçg\`·Ñ³r"t®ßp¹C<Ê64ÃÄêá\\ÍîÉ¢«ûQäAv¦=M2Ctº7?fùD³^*µáË\\möÎ]¿Ò=@Ðm¾v[·nûÓÖ¨gçýHÜ=J}JA}ÿá¦Kv^¿½zÌ$øÔò¹(­kè\`Ø-»=@ÑuÊ£?=@ÍÑ>ô-zëF¹´7·Ê[ñ-÷äÌÔùáôðÝlO°¸.ãKcßpd¨<QÍTâöxMìÌ1LÇ®7íÔzØx´¾\`÷Âl	L®*G=MvgStÈ°_oñ1=}dLgòÜcd(ÂÐs75¥b[j¨þý²vÃñÝE¶=J<ÙÍ¾^t"¶+&ÛéÚøÓwÌaéh¤ó.%Q{GôÂ#­ÎÛOo<ºõ§±Qñw-ÝSû}âLÓDñy¶ïò¥Ûu#Lø3DþÊº|výÝ®mwÌ·s×RÈMä{óÑÒF5Ý³ ºÏLÁ7	Sû6Ð¥{Ç6£b7ÊvÇý*T~[YBzÁkîZf/E=}7Ê¹îä;ô1#AZîN+\`!+³³·ëáh¤5K4íóL\`c¦|{ü³kdÈ(¬ø²÷/uh.À«;ùT»õÈiC&ÍyÔÒ "aY+½Ó®¼=M©Þë°ÐØtkl2L+\`ç*-¹'o=}::ûäõSµ¡qýF§èAã{&dkG9:"g=Jýòs5¤ÖÎ}EÇ÷Û´-/ÙH§JÃÈ¨oÞ)µ\`suoÀËóµxX/~¹+¿ÇtåY9¹#þ¸o´h½)ê-ýöLÄSq%7Y¸HÚW\\YÝáÌä206Ä?=J¨ú¾ÁÞ£´¶ÿSpø[­û-À#êç\`ÀE·§pØêI_¡§cÁ;]#å]Å¾w+c¨M"ëâJiáWqÜèäâ«¦m´èï¸öÊj8ÞM_U:Û¾GGÅ,ëGdIZr=M6¶éNóL;-'ªï¸Ãiâè¹Ø ´NI	Ý-(%íhÈíèÉ¸IKñEhï§$ µXª[*Gþ¹ÞËhä­e=J¨Î-a¹3Ô+:XYÍ)üyµMÉ5lVç_9¨Gv#O÷Å§lMÝ)3·vh¥È­|Ùgæ}Îhn3æì°ØB[\`ø²Ýý(þ(ù\\a^(å«[ 1p¯#Ú ûjàÂo«0f©=J)¿j³êJU(¦ó&¦£ÃÄòæoE4ÓóV\`\\ªÍØåR¶iný>^oV=M"ÙbÝ/ó}%Üt¸§ý¬MÁ?§¿²«ºòvG´?Óô±Éºi,[÷00-SQÊÛ0¹dñvráV#(é\`ºôJê1cÆ#±ÞÄZó4æÎ0=JVÀ=@q%èõ_©ü7 s=@,e´ßÏ(,óâäí5Ç¶ð	+o\`ìU°¹¿ë³ôÆMÔÂÄÏýÙä.g=}3Êu@Âöb[Yt'dÏA²=}k5ÄÙ;±ÿ%YµÁ¦V®CLý)¸bs²ðÆWâ/tï.¯o$ÅÄAÖ¬êÛ5°&pÊá0Åf'WE=M°Zsóað[ùvRÏ*±ü¾ü=MÁëFgNq&@ÅAuÄú"×\\f¯¬áFì%K·§\\=M1k®JXÛÝxöÕ» sÆ5?/ÁY¤êv÷¶ä/ÅzØ½íSÅKóÉó¹v«+á?îéÀ1¤½( ¢_üº´Týg×7\`ÐÎÚ­Þ[Ö9f^¬×8ÀìTÀå¬aÿz.{\\wî.ö¦Z¶z´0½ÄíF¿´Î80Çó²/XÕäÆ.È-¢V¼dqWöVo£á[	ð¼)FÜCóí.ìvvVF»>$G'éì	¦C¯KEîùùÒ/Î¼ßrñlÕlüý[Þ¤û%$._ÛÙLq]q9²2±!zæË »j$eðFr=@ýãû-\\=MÔë²uò¿â¼âÃûÄrZ#9?&ï<­ø ^Dxq1¯00ÄY¬Vd:ÝQ+Ñ,QlÚ{xéÅÔ8i{EpÇÁ0¼îÚ¾1è½¼@8±s}ùìÒt\`\`cÅòs¬¿ðk9F_cgôlÈs°ÆzûÖºö²=}wF«8°üOÒahÛxY_Ðc¾Rõ>´å«-ñ¢Øð·?à-Ç#®Ê*ü£M²±¹$6ág]²ôcþ=M<l5iòæhþy»âSÜËçgb¡gs¸]ùÓ¬i»ûùÑÆ@¡CWÏÞN±5Bô¤ò/pY*´£¤ú¾°ì\`¿yXÊu÷©³ÛNq¼8VVe$cr]äÕÏ¿Ù¿5Y.ØH?ßÅED	ÞÖ(WØ(wØÍ7ñF#:½2¸ÍÆôF*k?\\Ìxêo·óÍs¤;Û¯0äV|oóe¯ð¾Ñ÷²ø&1ô81ôàÊò¼ù=MþÅæ×Ú0ÏB4qé3ç»&Ù\`b¼{[P»Û­Xçb]ð¼=Mb¡aÅ@°Ðû0ËWñöîvX­=}ÛÜ÷©·´Âr®ÄÞîE#M¾QZ·gÓVÇùôÞã¿§äb¿ÜpÜßâµ4¯bõt1­þTÚCpÀÿÎ\`»tÀæö~ÍG³ãC¿Ø=}ÑéåPQÖÕ}pk÷73P)vaþð.-&ó½ý;ë^cö·²2ÜÜcY2|ºzp°zó$ÍöT}=MØªä{?ÓeIüÃ¤üþ\`äÇtì@xOÏìåöÎæuôLN¼÷OØäéxâý!YX³=Mn~wãóÈL·ÕeÉ\`èO(v$Èñû;?Ð÷H¨RjDÀã¾føÌÿÈõRÉ°$ç8ôÃø1xÏ«-M	Ú=Mr¶fôûã=MsHOï´\\ë+´øóøÞñK9ov5È9)øãH¤E¹æ=MIúÊ}°ÞÄo¥bJiª¸Æ.wÊó»Ð8	òQú3²mtã¡;´ÌÐ¥öK(öØøüfOóÏµ&@¨¨!äh?È¾!HÈ!ó£Ifwbªè#IÞ&néñÜÅq÷Øà.\\Jd:t3Ä|«q¢~9Bâ«ÅÄÓÌhúOhó=JÈÓ=MkHòv»z«ÞU+-=MPù$grÝ0<(Tñè#¹­e°ðøHòDuÛÚUj*|NAÀÅä|íh¦Ôã'T Oøº?<´Y¦SÌ=J/Øþ$4$Ñ=}tGï!2¯ÖºdGÆìdÖëEP§Â'=J¸·ãF¿Û@ú=J@!Ä4F®ÄuøNHÃø|V®°sæ@»Ú©ô´Ðî}ÈX~ZcÐÓc#ÕHÀFÏT»µØëx¸î-töñw~qJK¹£WËÖÆ3RØk#¿¸ådGÏá0ý]ö	=J,RjyÎdIÊÞë#*ÿABw5¦rg%Ìcìp"Â%wóÄ6b ë¹ûdLð-eîÖNêßëâý±=@LÙ#ì/Ð#i¼éPó§§ÅäôäÃ{ÁÿÕÜNðAÛC¶Q¸þ+~BôfµlR¨jêaömjakòv\`03ÆH	åoéARxî°SÆnJY\\|1ÜÞA=@ãã¼Y<£MïFsð|}«§ÙSHj¬û,MZ­a)\`o¥/µß=}6AWÎúüH»ÁÈ¬ÀÓB¥ñ²'Ag>´äÎk¸E[Ø-Tþ\${ã¼¦×eôöq<gXMò~ôx cS±C&´AÌF»¢A}I'¤Ëù»{ñöý9'+cuû¸Ë|7:NàØeOã$ÝKß?xbÎ¿^»ïlt¨@cõa½}F$þ¦rn®¯åjNÄ¸kt8"óJxÐ³òº\`kòK6ßOìG/µ,=J¼àcv£zôÛð>?íöqÁAQõuH¶4AÂRÉEi¯]=@ÚWá»6µ=}Áw\`ñlæ.vðNÅï=}Èã\\>A°9óÅº¾;?XCùEEÚGx/©tÆfQi Qô$âVÃÏØ±Ã~Ýã¾ÉcÃÉ£ïÒFm[3÷àxÙj±ÑWÈiþ§Ô$ä$b'YÓ9Ù}õmaæÕh3NãÑ9åß¢¹!0¼®sEv5)¦dYêÎÏÑOqIí²sÇy¨ýÊFD=}ÝJ7P>¬@RÚ&Û-ý^úíÔ¿-HFûF¨Ò-F)SÿeÏÕñ~Êeßæ=J4OZ|Noz8Uo|kþ=@f¤F#¢]s.Dd×È~Ð3Ì§à 8	Ü#£ö6»6Z£¬[ÉÍõ+½lD7biOzÀ%sj»¼Õ¦[Dn¨ÅD¿¼E¤7íü[R=JÜJKÄ9<ÐV=M÷!2yiPþÖ=@Þ´@»·¯&SApæB¥0[¾NÙ¦9åðáÆïÛòZÄºü¬tí§{ú//4ö.l=@\`5ÆÇÖôgÙÓÃ³«l°$én£ç»y¬îá;_´¯~7Z'6cWÚ.7uÊpëm3úVp´8~çfÒáå:´SåPc¥C#¤^Âsp¹µËlñ	¾/ ý$îl0'×Û¡âp¤Óà4½-¯¯ÏºUåìàK´½bÕqÈI¦ôÉ\\áù7 Se%æ¾9¶_»dªBÕy81ö 	ëBåÍA¾Äç&dÇµÔâÒÐCé%Ò¾8¦\\IßíoÃi¤võ§þWXtß#àh4¾ÌögDçðhxAÏýeödqáRåel}/9=}d%±Ï¢ÍyëXlYIm{Öo7·h+¶o$ÒµP~íÍWD{EÖy¦þY>{×Q§>(ÜQ¨Óþ}fZF=@6ãk¨«ÉrØÏR"£;ý©óé@­olbs>><Y¨\`ËÛÛÐv>µÉ9ã-ënø»ÆSµ)§/ÔKxR°CÝ²XÜnÖHÃ³HLJs=@$YY¿#®óvàÆÂVPñóÆ½ûh	mÛ]Ãi(RfMÂÈ.Nx*Ì=}­Ûê«ÏHzt¬=M¾ÛÃµ'8Üoçr?Áµln=@!®=M$|»9 ç=M![ujÐ¤Ìæ	(Ü¥³IK[=}\`{(Á´Á9XZ¡?!É"H) #@jK#qZ¡7Ûê%4Â[¡Of5Á²q2«J~I\\%äOUiÏû´±N¿&×¢4q¡EÂPÄ7ÙjÄB(Â­|'x:1¥X¸iÏg÷aáö°ÊWW¹éÞCÊÐÄÆ÷êÃuÓ:Bùx.Ù[^ÃÄ ÿ·3û¼ñ)H²Ë¤ËþJ§rO¥q?l[®Ú,ñ/Mp´=}lñVnÈ§=@óçw}döá8tüiKÁiY ýøU98í %â@ý±<æÅ¢FA\`åk&Í=JkØä51?)R@¢¹cr§ØË.oè0áC*Sß´Æ®Vê&Öµ»u?¿õ{µ¦"¾÷ç4ªÆ~>q6d5ïå&L=@Á4=@ÃÚË¶W°^­±bÏíìÆÑC8öçtÇO\`!BG!T@fÉrÔh:V)û ýnÓÍ;?Â=}O7+ !nÄgªÂkAö-´c}ì40ex±Äõ>UÔ9w6d¶«ÎU~¥nþ´ ÄøºRY¾ÄúÛdà¢B¿^ÑÀ8"Hñd³²Tß|ã00-áîáÙô,æÜ£1Ú¸@G=M¹Öø.6°*%úÿëo¶¶+gÖëÊ#çüïDfïúÇh°e.ËßµoÂKÏ¥ÇÇ÷õ¿0_$¨º\`ý! èÇÀ*µ#Ý|¥èf8ôe5Üè±v+¶üw|F<®,LWòdè!ä¡Æ!l¢_+ËÀ\\Ó÷Åjïfîòq»Àûj¡cVÏé½q¿!åRb%zéµNÝWÞ¸å.Áðå§^ÍuÇ@7øÕwù¬´èõ_¸ÌOdGrxÖ·°LGhûo!}Qba0/SçËÎ\`n&êvr4\`b4WýHñê0·Íè¨ª¨_0ñ®Ã>8ÃÀÇWG£®£±àÊÅå>³©´6Q«ÞØ=MàPn,nS$ß¸Ë²/SÌWaåþu26H¡ÉÌÛï\`ÏBl#kÞËÛò=}ù-õWÖ½ûÖXð3oµI9Ó/\`w½õºÉñ¸díB+G'¾¥Á§´vðw0Ò|;ëÌ¯H2÷>»Ô÷¼|6ÒÊÂ¦CkÝmÛÉ)¥}B1=JâXæk¬}ÍãäÐÁaD'·bä#pÄ	ø)w9ì^Åä\\dàeÒ«S¯GcYÚ=MNRÃ8ãäAà30=MÕ®ðã,Y¬Byà¤ÎL¬cøÌ×ôpÇh'^ø5cs°òbÌUIi[üvÍÐÒÉÿåþÙøYDÀunëPÑRBß¬ì´V«Â¸^­:³ôn;ÜÜ/Gàäÿçx|3Öì¨T]í{	ý\`ýß%U'¢s]VVLµ?T°dE<t%tàôKÏçzÇþ® Rç4^£Lözn}õ¿Kî¿/\`MÏgi¾¸öüð¤À}]^ðQ¥·Álw 5¦ìúýÑÀ­] uöÙU¡;¾ôD<ëø>áYûÅDõÞ÷®;ÙûÊ.Fv=}ðGó°ÃâöÏªMv·ù¾O_ÒeéöÁè»c=J©ÝË¬xã°0ÀÙK,ÀÖË« DD¢kò°á:#É¡7=J/Ð·¶Û*^ªÒî£<À9w[¸B"uS\\âæW.VµÅ0ÉáWàPÅÊË®±¬#1EÃÇ]ü]RVRÐCSs;áÅru]£JôÔó¬}»4¦Ò!AàæÆ½ÁÇ=@EÜ[¾mµØÌ¦¾üBÈ#ó%Ñ\`)Ì¨üZi¿8²n¦ChÑ­/4_gà¡L²fé¬^lkPøw°	ßZý÷±÷¹Ý%t\`æ&uïh±<È Zïh\`X(QñÆÑµ0ÜÁûØcöÞ,ºðå½ËOR3¹³>êìnÑÑnXO]96§±½° 0­ö~t¦´÷ÔÐ\`/E¾âÑÞQZ-I3f1vVî¨6IfW)Á û=Ju#¦Kó¦ûî¡Ï#¬u¦K)÷A#¡-±);±V%4æfCIÿ)\`Ë·¬Ñnk}ÊJF¨b>~öC¹Ø¼ A®ªÀùaw^¸XØy¨6¬h±éÞm2üKÄúØmÔù	K÷©±r§Qkïoy9¨TVêFdHüVI|:U^tùân½Êßdá{ä=@õ|8	¦1fK¢àÓûÁ=@Ó-ÐÝ5qèÜÞ^ê7	ø,£|³>÷å[_ÌèÅI×7$Üü÷Ùø¹ÓÊRS>ò×¶WO-y@¥¶Ö.÷1'ø[¨_¹êÚ4iÚ¹þG*9$¡ã)¿Ùj _M1.nèC2d'ôÒ#=}Ýæ£~ã:*sj=Mæ&%ÃAõMrRaªtsøßºB£ZízßHíìÌ!*p|óÌµØ[ê9Ü	Ç=@¡ÐOçòíª´ÞæØ¯}øºñØiþ>=J¿Ó×g^uÐC·ó½)+û=MåTë~ Zó6mØ4/=}Zåµ"í¸æEPêÎ%E4Âú_ÂTeêNÂZrZÃ´áíþÒéÄ)]ñÁu¸¬Im+4FyL¬uâ-TU.5sß@¼!\\ú¯¤öE¬Ælöq+¿µ R²w½·,di=@ðqko	Ò¦=JKúkßExXÍ¦¨bà~êS×ºÉ6xÇ6øQª=}|=@=JÖ¥ý5Ú>ø)8]ò^x3ù)I=J¾g4¤±Å©¡þÚ©bþJYh¸ãVá´3ÀNüxæ=M¥¸]fì83I¯#Ûél]5ßJ§èôf´ÆØøîäÿÐoèNMmâ<^ÕO EÙ~~Ü&QÅÉ-.Èd¥ÒGÃR!&"¡åuk&Ü)»¼pæ#"(*E/=@5ÙÊ×,ÚcÈÜlÁàõì_>*Ä¡BcëçuÐÚØø\`uÐX¡Å×¨Ú5çdMÜ¶Æûê^Î-½ô0ÏÚkî­ãfÿVX=J<_.íSPä]ýuöY÷¤WåhV,CÁté~_1çÚÿ:dÍ9ºN·{áüÏ|t®FþÃíónôçî=}ÂÅÀMe$ì@n0yp=Jò1/l¸·+quuõé¸~E­hR6Âf¤Çe¡ìIùqæ9Ùu"ÓhAñDÀMóq¡­Å%âaaXÑ*»%öàî|Êi­gÕÚênw×q<!s Hj8áE[bz¿²Û\`àÇ¥YH¿CÐ!-ùh,z.¢i¦=M1CªÀIécZà­üõ-å&EúÆå¹N°ar7EBs}XªPþã»=}-Ågk¥NAt]q÷Cuîß£5Áep¶rN¿eöªä¿2ÈvÃ-þ-:÷æLèSÃÌõ\`Ï%<#SXoIKFÀKùË¬ü£ûÙèÍ;ÑôPQ®Tg^.' àgú{òx®A¤ÎRþ îã­[¿±qæÓ×Yða¶ÝqáÆÂ)m8Å_NXxÝ<­2cfvUEPá9¾Z~úoØWívieLÉà³çåÜ©£¬éö=}ùã}h\\( ¦ÆîÏàu<é±Ü"½+ÁKÞÁ¡pu¥ù¼Ç\\ñ½PÙ¼=@QËºYà-x×CòöÑÏÝEDÏäÓ!pã=Mª<ß.4ÌóÌF=M%%	Ñ©©nÙUçL	Q¥ç¼?;QQ©%©(YY£ßoÓB@å¹Éù=@&Ëqã<]­ã=M¡Ïú§¤«9¿m½Ð,MÜÆh¾§¦+ZU£) eeV79HNëmr3¤²¯~Á·SK! èÕy©0éîÑAØè%ùâ(e8)¹Å¡'ã#ü¡©ÍÒß'î(=}I©õ=}¤·YþéÙÔÖÖÊ7ÐrÜWD}e¤J×HfrlåÂ»åäýG{øIáAå+cd¢%¹uè|)!	Ô5{)K&#ë=Mé,Tî4hþbLÍyä¥õpçÔP}eëÞ¦Z×úaK×hd*z\`)=JPËw·ã¼BÙ¢<ó\`B©G(ô¿Õ¥ÓC59è{X¤pÝ\`Éç¹t:Miî¸}^¤½fâ=MØ31¡êô\\þ¤Ì³¬õ2ÐAk¦ãíx\`¨áhxy´ÿú2ÔÇ#,ì¦ão|1\`Fd>	»=@M1ÝêQ»CeI¸;ÁÇ!7d}=MM"8)õ(#ã[¯Û qD"¯¾øù-\`¥1)Ã¬ç(¨í¹&ÿµ	î¿ß	Å"ÉÉ¦"{Pó°é¤ó¹	^Ê#Üóq±'þÅâÙ %UþéiK@\`éL¹H"ºãXGN¯Id*NÅ]Øß[Ç7LßH0×âÒü\\àQ÷¶g¸FDËMØi«uõh«ÞpG.+E°Éc Özºÿr@§r ¥¯däÐÁeûEøúÓÚ=MTõfÁ¦ãx»3Ù[âmêÖàÚD8Âu¦·=M_Î¡ÆÖÍjîr8^ LýÚìvrØ*5¿5¹²ã{ºªÕ-|æK5õU=MÆyMe%½çjªIÝAâ[!Ðo±h¨¦jNK%yãàÉ)îëÓù#ù´hozù$*\`cO©=@~Ñ!F6úä"Ô»w	HÙÙ¯¦yô¢Õï1|véêUÒû»3px¡rIÓ"æ²nß=}Áb¸åÈo\`TÓSmí#»ífüEãúº)¦cô]7kÏôïÃøÒÍV¹>1ó«0$¯¥1é8OÇô¨îkq¡±V[!$@D]îôC¥q®=MÿlÑ¨ÉÚJ!Îâ=@×yÄ¯ÔÓÚ6«ß%äÒKèH~éMºJ¥Få6ñ2¨_ûU"¤âU½e#N8Ð}!ÎíÞ»eHã¢y2áök­lÈÍKL.æ>ÃUN&cÉ¾ï)Nóì\\9s[QO½¸°å,8Æ?Bq?F?ö(B^ÑÒÊ^ëæéGªb´HUpU»e¦¯£gñíÒcúìKz@¸-sîÚ¯%®>õþ:ÌÇhEù*Ø~µRªñÓ)Ü¸cmEDÌ÷_hì²¢Xeô	häm]ìÖê#¥íüuý~Ë½]jbÏL²¡ÞÜ,Ö]âÛeý¾Xç$ÎÙ=Jg¡¦¥±C.rB	hr×zÕîMcÑâ³ÒñÏo=JØìDó#¬¦.÷Ó&µå¼ö~Ð\\ø{Ðl$o=}ü¨§¿ÎÄÇ_@è=@ÉÔÆß¾ºgÙ¡¸à®9°XIåLÃTD6Kì° =M¯(zÖ©e5uÛ$i)/£µC=JæüÑA[{]äÌÿÅ§æÇÊ\`Xx°YZ%·¥h=M4Å{#Ó=@]Äã]5"eÅ[7Ás£(Ñ%©èÜ=@Øo©ö#qXôýtÿ¢N¬Ö¿Æ§wªJ¡T#	f£±Tøÿ¸¼õ=}ÜöùBÖ±Áaù}\`N½ÊÕU¯ê ¦þQûà ³­>ßVñ#òGöI¡ôäF÷·'4Æ&ö	ÓCæÃD\`BSØÒÐÆ´+RJ³¹Ä¼"Ð2Õ=@Öüà-_0ãaõ70\\{Ý=}æ7À¡®Ð´â7ëÞâãf£=JàßÙQß,Þúè/®uÓ Xá^×Z±ßÍºÙß¿÷X§OÆÑÁµÔ³áóÃ¨Ô#Ôw¸9t¡!"³ñx}ùXzó©%ØmÇÇÆYÏI²q)~ÏÉ»HÝGYUôï¤­õ!-¤ÍI\\¥Ö¸YöÀûgÿgpîT=M!¨\`Xý¡®©(aiÅ\\ÇÓµÃ\\>á6ÌÌ_j:È©á'éÝ§¿<o­ç[áóá¡Xó÷éþc©µñgçÕë8¡¨=@c4C1,8ôõápuÎ!d¡á@â/{ÖÏèRNß(<R×®P$r(9AC/ú|(¯ÐÀwPU±Kg(±5?ß5ßþÁO¼Åmú9Ã@ètð0v(IaÞLó>fîU½=@ì;ÿÆÜÐK²|èkÕt¸Fe2ÌìÔ¬Sì<ëU²ÀÙðüPj«9îJ)É÷Yzwr®XsÁlD:Ñø¸l´H=MêÌO 	¯âù+I\`%t(%N»±%ÁQx6{=MO Å²;fgKuý(ïRsÝ°g9ý/³ó,¿!ð¼m'øË¨åïóÜ«P=JÌ¬ºÔ=@Å­úFbià%¤·éx¦C»ý&GQt¤¤@ðýö=@ìÀ=Måß)ÒÏ{V¶p@_Ã xÛ¡xÀZþÏÝ¸ì=JfD¶ç«ñØx°>õ ac@µî¾P/B,vgfß¾$§mKöBJ<oÁU:5=}ýç!ùd!X°]Bå?«¢\\Ö\`êÄÑ©2aÄZ¡Ðq(!ì}!ÊââÛ×ò=@#t7¿wú¦£(Jí$bºc©Súe¬çûìùa]Å8Xd?¡¡,ÐgÂ$=@õÄ;ÐÈ¦¯v?4ÃsÆuAFídµÑ¾å&ÿ^3]®G#þÆòfçfÓ'°7wÛk:í°Âñã5¿É\\d÷tøi·Ñb,ÂÕÒü=Jè{îï#¡ãYîÀÍÏ&Yn2º t/*Ï&ÐçL®_MMZ*@nn(Øw#uj o=}Î-=M&Ô áW	I·aù=@C\`§¦=Mâ+¾ »¸pX¡»|¸¯7¡\\ÝÓx°HWÃ	Ôì&Ów¯ìOs|MØ§¥ØCgöÈflºxIÂiH?ö.Æ&y;Ô		.z/I¥¯í×ÝN\`EF Jéí+i t¦ ä¨yàhg¤åOmÊáãÅ©KYhùIGô\`çi¾¹à\`ßÕ¡ä÷Å@i8ò{&è6ùLm²LEF<1Í)@¸;ä;Ù5õÉþ9°#çcãbû©k¦GX ï¡LÎÌâ\\òçòá¶!ö§¸ÀR¼:££ Ü¶¼¬cÒ=@|÷Hab|í¥K­mê«Á5þZ)­·Nð	¶_ÞÕfrTþß¼RÒ>Añ­{îðÊ s¶¤\`feJS·61lBÑÙäP¹eÒèí¹·÷d¢r@­Ëcð¹#a\`rJdòfH	=@Ë&ÈLüÂHD¥@ÝÁ3ñ1ºÙ4à(±_ÅÉþ%Æ¥)Ô!£Ã4(tïCÏ×[¯=@~Ü;¤Ø<qaÆG*oeÔ@û6ÊØ\`qa¢ïý¿âKò~akªHÛp;=M_#(<Gµ)ÀvpÁK¨þnèÑsc¿_òæ£Óêßò´ÚU*F¹@f©û¾½0Ã³tÝð§Q?j\`³òöôÿÍönÞÇ#õî-¶)ç=Mþ~ÍãöX=MH^1cxó'×OêåD¥ÈO,+ÞÛ\`QÜ/rô±cþ·~»¾%Ôùð[fúqR\`wsdìà¯CãUöf¾²O;ú{ï&æØÛAM<ÝÄm<åBk¦Z«Ýð§Ø»:Àµvª#\`ø~=M´WtôyûâX£½Éw1¡¾)GÈË5úpUt¬^àpú´Z3ñ^|àDl­ØuÕ­Î£sÓ±)tÏH(ï$'ýïÀtkÓ=}ä®ÏòLMØêû,£y0U{ÞØ=@íóÑãêtL+¶hÁª øDËÈùÀ:YqØaì&¦/QuÛ?1c×yÚ=M´øÏ÷¿¿©÷ ã9<×>G%ü·÷Å÷}©£XW-÷ßø@óì×ëØýQ<öæ=JÈÀyærky(¹Ð?²B]ÀâÓfSÏNÓú®D ðWxÒÐÒ6¦Y]Z%Õ#¿?ëfáÈé\`ÓîÍïö!(çkù-©ã$ºGe»ÂïHux£iõ/Ä"Õoï$!}·®=Mir"­ãðôo>ÆMù!p&óÊ¦ïä}+/Åp½;g#±a¶lf÷Zñ¥{ICô§OON|¿}-×$ _yD$£=M0D8.@E(Ôt©Êe¢@Iu¤PúVA®yPJ89¹×èåZL))ÂeA"äÔd	ÉÈQsyÃ,e±lü|Ê,,lå-¾4²²ÊÌÍ-¼ÔÞÀ´M­f®Cp5=@;ûÕË1I1?´^\`24L¸G0?púdÊÊLÀ+:»)¥É§üÞ@'¦?ÅÝ¨Ö!$Ù)$i¨)ÛoAÀ¿ãJPl|=JK¦3°uè~·tÆuÐ)/ëÙìt3ÀTëå^è,bê&º¿cqv¹¤hM£9táÒ±=JÅZZ¨,ÄX^ÞÂÀ× d[­#"(!üi=@çnT¥CÕ­6æ®¸|8ö®~RÃ|è¾fu¡BíN]Ï²CòÌûð]ð0Ä |Í,\`tÒãl¦M»ZSâMÈUÆjr;B_ï"ãKýJGÇo"ºOo;òvCbð[×/6½W±òPd£U"J9ÿá¥uçæÃAedfnòVCdé®V>Ì~OEè]­H :@¦Q%¾»=J "AnÂ¾Äð¹#:­ Ü:Äwº\\Æ4¤äÃ](s2>äl&TGÐóÎÊsV¦1Z úg-ùÂD?æ/áÀ¹@JgrÛ)Ù¬w]RòÒ´å¹ºô¤7÷Ðá+;ù¹8Ý\`ÃJî 5d\\cÛÑ}öVsJ¡ï6ê®UNÇ/»¿ôhòÌÂD¦ÿGÀÌñ$Øèå'äÔüvR]© s9¤Gü@¦v²Ãê%ð$ÕÑåæZudÏvnV÷ê$«ý¦ÅwÇfÓëÏÈ¸!¦	>1+¥As*¥­mH5{ã¾nó\`~cÈ¦m@³Åñ+ÖÓÊCñÚ«ß±mÖË·ÂÉ.t  EoyD\\2nê4'Ü¨@E÷x¸p®c^ûEì¹Î§×Ìë·Ý) "NóT¾{\`ß#Ü°váM¥P=@l2/ïdÖÝ|D2Íÿol=J´YÏ¶«3ôüÑùäLêSOoyk\`¯JüGÝg:[T<És=JÎX,õ÷BÈSX-ÞÌã´[ÏØÃæægùÄþ Dª=}»vN/e@û§ºtÁ0jR¥v¦=@G¦ãÇgpÿ?«Ê3Ç£áfp4@Ë6S\\êd²YiK=}ZÚ¾ÌÿuÁÝ-;ÔüGZ}uV3ÕPYëqôz~ÛçûK°ÓTæ|0ÓµIÌ¥%rÂÓhæM_bÔ¯ÇÃPþ:Ð±0Î_ûoþ+v=@°H5²âÔó=}ÀÔßWvàT"~=}¸Ôÿ/¾LÅù¯ÇÄv^»pe¿b"ØÕÙð%Þàpßàpg¸±âÓB õÃèWÙUÎW_ðª§3ªÕJ×dfúåKÜ¶=@!+V¢®òæ×GÍõbô>"zG[¬j3¹Ò¸J#g;Ï:ZíXm6wÜ¾µ=JOüóÌÉ¼ØØõÆ£Â¦=JÎ#³x4}º7ÅRzÙûý E=J=}JÂÊÌ¢v=Mà"¯s<ì pçaT9ÂjÚ=M®AÚ¢6záÍS0þíFÒb¦ÊL-®êØûãqolwYS1V£¹DE_kKv¥5íuVrdi9©\\	ã!åÜÑ}¸ßü¨m.{¥ÁóÞDf¨7Î%e@[sÎ¥¨°éHWJÚ·ÝïÒEþGX¡F3ÅyÑÞ	£M3óu/8Nf:úÑÝ{bM¶õGc½ÖÓ×Ê	î%<´»\\3uåó!8@½ 3üø¶yÜATÜ_ùüÌLÞBÒùÖ¢÷%apg¬Å\\â¹ÑGãÊAùÈízúY/j3È4Æ>%¯ P´»*Yse¹¿NTå5c\\²U3³úØÌú£ºÐ¾âY]ü.-øFáXí)ê	¾âï4nê=JgJ¤>=MO¡ïì¬Ú ¢ÜÏÂÛÀáòü0»^ÊëßKúµÏæ»bMÑ}7°£.Ô=@AX´ËìúÞ¶ú\\?7ávËsÐ37q³°SßUêëväBþÉuRä}VüÞdüÖ@÷B¶å¾Ë÷cÉá¾EÈ\`òÔxÚdÜ¢s³sGá#Àþ Q¹vT"×ß4$Ñ(4Ó$õÒÙ¬7ÜKtlvnqºh²#³Fìáj0£P¼:Ñ²:$u¼=M¢ÎéOhQFà5Õ¾ÞNFÏ÷ûe%nI*ëNÊoöPtX¶1þä.­àXR1E<*A>ÈÌ§ÁëÅY=}ÛGäL9>ë8æF]vg+mÎdà:ãà=@C÷þ¹X^x²yO_o´á'$¹ÏÃõ¡ < ;t±Ì*°oP®^1ý.´Ûîd9GU*¾I%}íüÄÂ7º{æXFeÝnxi<ëk¥H¿ÎûÌ¼ô}\`]~ôä*:¤ ßUûTb<Ë=Mxù9éæ =@yNÍk&§çÔ«wË¯cá-ÎÙö;Í­¢µÞà4é÷èiðß¿GÕ·Î_Ðä«öÐê¨Ô\\Ý»El5í>ÌCêWAJÑ:;À7E6X£ÙÍ®Ö<[·Ðþà4Ò¼ß%Ë§V¤m\\4½ÚäÙ$#j:Þ%Dõxïwï0ÐT×Ó¢=J¸²Í¸=@û~ëÔM»ìÎ~ÿÑÎ¸ÃxÙá·!Fv{Õ©æYòò£Ò+³nù=J4Æ«ð0b§»ª°/D$FÈöºí2cÃ7Í|c­Xé¾ërmÿð=Ju7Z±£4êñ±ÊxàÁb°Ã<;nÿ9×X(ðQ«Ob$aÈôu|NþHçÅu:Uz8xaúóÍ	àò\`¤¯iOù#Z!Ô+öµê¶øCñ§°Ï*!þe½=}K]^ÃÍÔ=M]EU£GáÌõþû1ý\\w>mÈífwºò½kÖõJÓ>ûCÄJ­;\\ºâ!@!¼ðL=Möã»°¼@iÙ"J¾¸t .xû!VÑ@ý§a¨÷-UªÔd£ÙDZS¥=JrÛåa=}GZ.a=J|ko-ÍÉVÕÈ;í÷£GgC}þb;°$ùw[ãéCüPñxêp\`®î/¯RÛe#sxêg²xÄð>¸æùÓüTåm%K9[ÌX´Z>¢p.¼Êó6zíU5ã«§²Ãú]»òóCú]îü´Q©KÂ"¤-ñ±=}Ô¬ÁPÈ})Kë²_MÜynQ4{Føs(Áf]¤[O±à¯ÃS¾çÄºÕÅru&NÅ´i¹ÂSÜû¢/öø³Ê±úÁOàKä©á¹láI'¢å@åÉmI±B'n½5*wä½g%ãY=MÙ¦Wp\`^vyò=J#ÃÖ?«$O²{@Î¼ ýu»à¨ùÏ«ìi¤OâoÕ¼¹C'n,i¸ìæÄ\`óåä\\Ãt/«/­WõáÚ¶,¼´&ÊÅ²Ð>EDÅ6|!âH_óÁÚ?z8~:öSÊ¥ñÊÐÇ@iíû4þeO)cî:#0ýaØWWîimÔ)F}q¯P=@FV=}ûÅþmL¼Ú6húHV<BiLí:ÐñùzükÞ\`.rÜdP¡ÔÍ$Ï_QÇÊ[]kM¨½D;SãõëÓh¹µTòÿîAó¯HàÔÂêài-úZ]{_ºõ:¡UðùË\\ÞýnÈQÁx<Þw$ä=@J(p?bNÛÌü¤Íùjv«5¯ÓË æ·.dH_dH.¥¾ù¹ýÉI¾kkçàYTÀ5v;á!ÉµEó+7ñÎ¥nãÜÎ_~8=}jTÐ@"^s"ú¬£þhþÃh¢X^ËÝíª1lö¢s7£BI"Ù'hµ¹oCBâ¿|µÔü]úäp%ìðxü*JøYãº½<g-|²4Ä@uàØk²Wùu	VP}ÝöQÅ4¾=JG¾QÏ¥3¯H¬ARþLzÀ\\ÁöuHKõnìåÛ¢Ðýr<öSÕI.Q}o.äQk}alÃN¿$dèükke_[Nc÷¿Þ ðÜâkxoFzË3äf'ÄmØaÆ­3¨þ¬3¤C½ÝdQvÓ!ð°úøÊtq×EÕçÁýHÌ ØðÕU2Éwç¯-=}÷ýjµ¯Q@3p];Y»É«ßÔ"®Ig{E"uÛ#t·+vähª¼7O"ÆvÞ$y=M^ÎßðØíÉÒÿÐÆ¶ú­£ks´öâÏò¿¾VE:8¸ðÃìÛoÕï¢C<8öä&pà°£Ñ#îÃÜ¡Äù¡Åmþbã{ì.åûÙ¿4YD÷Ý¶ðk¡Ð«@ôQÅ¶×¦[ÀÂf¢;9¦Áfr«#1cD?PnÅo*Û=JÉÏ"ÔAØmìJå3¬Û#¸Y¤[ÑúRgoRÂu4ÑN°¼ðÔ'P´LQÓÎÁ}\`|ß$è}üâò=M¤ëâ\`/9´ìòÒGÈÀk³G¦5ÆUàIaÖÞ Cánd\`ádt=}evð×CF©I{Ïî#Q	{ý£Î)_é¯AÑóÛÆîß6wÄåÄÎ£Ü#|Iî#n¢\\èa6×7\`¿6|ÃÎLï2°z~V¾lùEy\`i¿¹Óÿhøg·Kèé¯Àïâ@µ(ð_=M$ÆÇ­!ËS?aqÒµ=J+_Þdú=@B=M	Øeßà¹D;óú_LEòjÅÚ?¦a(ÃQ ¼AQ»°FiÝ?L£­àRéxÖÄ°ËìnÆÕ×Ú|ÇyA]R­ïYsNQ©ójÄÆòb261ÝþøãRÒ=}Ã2æ¦vx*ÛzÑf<YKVñe2_7<~ó®=}âs¼ 43±©ÎÒFëêó*^ÊGzWöeZ¸\\ÆÍNf8Ú8k½e;ì>ã}ÜsMCÚ×¯-A9û@©E«chvÅÜ=Jd=MÛWË} w:°TvÌUmfÉ§hE´âsæ*²4ðì]ØJ-SIÌÓ+#B=@TªF&Àñ&È!¾Û|5>áFÙ«_u\`"e½Ô{ÜÖõöÏñÚ/µ1®µ·öhTTW³¤Ê©¤äN»úyÊs6eöÆ}¦fÓm9ËU/ßúgÏÎß{6ûK$.&mNûãNôàj2\\çÅÄ×5?K¸âT¿êÛ¿qP/r³sÎV[JQ y6G^xd]fx_,§Â½O>4P6¹ |ÀfLáÖìaüsÃæMàu^Ñ[	¯ër{þª]_èòö)ï*/ÍÓd-ä×z ê-,û~Ý&ÑEh´ÆÖûCÍeÝ°¶ä* ]òºþ2!²GÆ÷WÝ~Ýs¡Sd%çÅ4\\uãì's|6Â\\ÄKC $´WdPøyô?~-lNø¢Lùc8{ÜFEð@¡éLìú¸3Ê¸køµÙd|0ëo=MhÛ&çM­~®ZÛ[²ýU=M =@aê~(,ªôJº=JS;ÁÅ·÷HvûcWÆ|ì'"1Üp#°}ÀC¤É@)l¡zëÃÇ¡ZÃ¸ë¾hNñÕn[Â=}V¯x368µÚÛÜoAñÉh´,@9ÚÊ=@Ád¯TrÁ¶óQcÿ>6þóÅtMÐ_bÂÖW6iMi¢Ò,n¿½ä«Ë5Ì°iÕb&×F@7**EeýB=@;~VüðpàK,±[áÌòXX¬JØN£ïiâè{'a1ø'[#¨§ÚÕÍíá		ÿLó}ùî©R(Ôì"zlÐ­	çn¡Í"qäEóêø=@Alæ<ÀºvÏhä×z¾,m<ú·}âpØmÕ6 ýLb¯ï@ø#¸âä?qjZëÔ	Gv:ï÷ÍÕjO¨]ò&&0{¤ÃÎ~7¬7oN+{W¯a4½ÏÅ;lhªzZ/BøÈ%X1£YöÔ,ÊÎå£þF]ÝÀâcJ¶FJª¸ö>ÅyÌÈ^#{oÉõÍô¦Í®º¬È~Å\\	TåmÞkNXHLÖäqãv;gr¨	ºy¢7JÆ4æôÝ­VèzùE¬_ÉòUµ=}ÊBr£]< 'Õ«£®ãQ@ÃLx=MôçÚ²­NÐcGäécp>"ÅÕr'b*j²Á¾òóðomã"Ñqo½QÚ9Ù££ÏiÀd÷åBKÅÌ,cgtÚÕÌU@Ûóf=}QîdÉ'Dk Ù»]Ñ©J×®JsèKZJOô^Æ43EFög.ò¯éÉZìQ=@$¬hõñ8µ8ÈuYýéy#iéLèÉ&5¡êý.]6H¡Æ¢H°Ê6?BX=@ÆSlôuñj:°¬K^=J¹åÚÝêä	cYÆ8¤ â¾·C%ðä2ÜÙqÐJÛ|7Ù}¤ê±ÁncoJáú}6öï-ãÝ¾üEf,×¦oÌìÏæq>Êô??ø6¹lãÀÉ÷A[ÅäZéäÚ+kàZ%¬×_ñÃGÉSyññCt-»k1ùó¡¤5ÙoùäcæsÒWyØãºQÄ&Dëg»\\{\\ªCiUÞG¯³Dì!Ø(þÿ0ýb´ûáà(5Z3Èû2]Sg çÅY Qíq6î=}ÎGª~=JãDbîa|Xyß·¾7K²ÙJ5pÈ$ï¬/]X¼=@¸£dRCßùK'ÓegZ"°ëÞ@{ë=@ZÁÔñ«Ø4dÆKÓªöC}t{väóÑÅ´Ù]CGUÈñÑ¬ªó5Rå§Ä¾¶aµ³/mb¨»©PAKü=MSÕÚ{ÃRÁÞºàØJ=@§ÆX5·Ñ7ÔRê.¸A<¡ÞêYRË¡p:£%ñ´_Î£wÌI;¶7|dMq[à/Ar/ÿÆæêû¤¡	HÀ	Íí¡)ËFP¨´$qå°cVÖæÛn¤ R0·â<¹áîÉSkFlÊ6ALÀÉXbpþ\`u=JQCh8]aöU7¶ó½\\ÃlZìgZ_oÑ¿í'èeÆGd?îÚ=@¡GÔ¾rä ð&²È aº=MP¥_fØùÌ,âîµ?IÛ¸a7-²iÙÎX=@QAaOï¡ÜÃUº¼ÛÃÊÓ­"0%89Ä?ÐV6Z¯&8ï%/$'duC£ëºa8úí|õ(4Øßzk©¸µ-qr2R¿R©Z³ñX!x	Ð¼Ee¸-îØ\`+´ÔÅA5°µû|W¦a-XwR(ñ»õNÈGµX×·Ò&7Æ¾ªj_­¢V$ÓÈi4hhÍ³¹ÐçbÐ©¹ØZ#ÛEíå°/9Ù¹-´"±NÒ$O÷mÖ¨YZ2S¹òåôAvË«ÑÊÓëq¾×ß&'°¦Ý}w¤êæ 4ù¬³df2Mè£ÖÍÂêMª%ÁW@O]ë_I¡µK³zf²Á°ä=J*±Iü¢ßÂ%Ì=JvO¯]"¥m"ª=J1>@¢¯gÁ%Ã=JÛ1AM×ÏËNÉo®«á{qmÍ.Z=MÅ}bNj=Mt°§Ììã®R?Áhem"þsÑçi *ãS<$Û0¾â;^\\¾Î2Ù|N(<Ñ·¢áÌB°B	íîl?²IëC"ÈI^ªmîðõP\\"áQÍ ½ÓÎißÀEUy9¾=M#Õc	eL1	a°¶(ð%üÐÎÓ1Àá(Ô¿!Ü¥ØgÑ{=}ÆÈüâgÏ)ÍÈU¯È}mB^Ö÷Xã>M÷_Õiã_Çk;®Gb-LÛWiþ4­G·¯|;8'üÁÝÏ:?$,±z¦ã&½«:!¢Ö.!Qµ¿6Ð³ËÆïzc1sÙµò3våçù0ÇL%³ÓÙwëÕðÏ÷øE Odz|z,¢~P:ô	~¢ýëßàØãHæþ\\^ÕE0(½Á() ¤ÇéV¨å§u\\ÌëÆÇ@øe{-rS\\|ºpróOÈ'L0ízèåê,úÈ¶«í5@/àËíDÊ?\\Í²¾Ó£{Â­\\Ì(²í¥;v{µ,¼ÌÕÙv^ëñï"ùe?vÅéuåA¡D£WqPð®}Áµ·oIÁ{Ý;è*ØÀYH­m:AYNÊ¹í7RÌyµíÕ's5e7¤åÀ	l-ùæwÚ5Y=MmídL¿//ºs iDÅ_g0WäÂm<$@¤ÞªGÎt5áìYóÑ&·Ëò»UÊ$HÃFGö9"ceà±ÖPñUCêákìPå¹Ìåâ#²âJv¨uk«u\\áC+Æ=JæJFýÚõä¢vì8å*HÙ¼ÚïUc­ïÜôêé,/úçº£¾Û*d-¤­Û[z­ÎUÇX9)¶¶ì:p¿X|2ñ¡íÿój·xúnÇ¿3{ÉORGÏÕÎ¯öEF^Xp>"ä^Íöx­_/BkDÀ!¢ñÞÊ°aÃG\`JÈíÏô&ÜÅòÖW)ÝÛ_º3Æ¿Æg«íèM·î5³Ét³J ú¨<aG³%gry³zÜwA9é,eÅ>°ÿ},µµYéQÓôs&eË(HøÇ¯h¶T~5(ÙKbaunRèfêÒP°LeÏ=@\`þ:e*Õ]æz±~F\`ZÉ¨Æy+ö¥SÔ^0¿H¦ e!­NÔ¡ïÿ]!gÙ¶ÑÅÎÍájmW°Ô\\	IÂàÇ¸°_¥\\DÔ±®BãÁ#p_ðí¸b@jnÃm¸!4TJê$}K©OûR|Õ=MÔ2{Ôû_úhùVklkrÿ~ä³CwZ	årÐÃ¯ôÕÍðßêù_~puì%¿mKôìÃTé1TÐ0¬¹z[g©MUø:%4-ád@IbEæp4Jå~NôÙØF/ògp¾sþÕ7ço\\ÁDª©[\\¥èüIº³¤»7Hù~Vp4Ø#ÙííH°-Ðö¢æ'$DÕÔR¼ØÎ 8SD%j«Uð!ËÛMñýfªõâ,[Ð¨ág_LÇYiTl¤YV4ßh³±z±ØGÈ]9=@¿bT/läÍJ÷o1=M'p*/^µOûlêµÚA<¬X:Iýl.«½5Ç $+¹u;¶\`nwáEª~)SGé®Ù.=M·5êG¶$ã¤~Á¹\\êÿlLih{-r8ñS±°wælq.Û²s7=}D8ø<q0&ºñ£=J¥çkôÖMíÐª\\>OhÁ=}ü"Hõ¯ÃË'È%iECÁe¹¿¥gÅËüB)brÉ8w´ù½74pû¼Jô®tøaûþo£àX/ë-Ü¬àý<ÃVgÕÆËmÕA­)çñmµNÄ\\i§Ë¦Âw=@äÖÄlâêïÚBÀ[{Ø¹ÙuGjÎ[AuðüQ¿	ôlØëubS ÷_a)ôád+î8[X¢a½ìûÏ×=Jæø+KckFÇ ½á&^\\£!<;N±C­àÍªüãl+Ê½qHË¡¬Jü~ÍJEô=JaT|áíTü»z_AxÃêFÌ|8£ Úbºàg»hY®Ç»¢°ÈµÉvÓ%f¿´¿ ðÌ¦8ùZ¸³´!*ÓKµú¥ÏhdÙÞ=JF¯PvÝ5TðCº¬5Ë÷JüÚúbòã¹sñ1ü}òxÁÁpÍTQúa(G¶ÇI}ÍÕ¦ }Ë]òrCZ·®|Ü¦FºM&IÝ¾¦âÊ/01¤tS{÷¢~XüÊQû%¿õ¹>[>EFýc­Û:ïfc3©bÇ5jìþÍ'û ;\`½¤®Ê:ÿ=}=Jjs×aãù³]ÓSuYX~¤º³C·½n(Ö<ðö-í¡Ga@&Û¢«QgµßIØTë¾ÆM-ï:µrÐúyÓPRRgÔ#Ô=}ÖPjÊyÚ"r¢-©F·7ÞçÍûÜ$58ñò§wMËú7	´<¨à99÷³uî]¸¶38T1YaBåÖYÝ23uJzñ=J5L­÷ªÂ»fî¥,ÐCÁapnJ²õ6¢NJ953û£[XïÖÒBgã¼ÝtÍ+ÜË\`OK_;3s{»Mi¬ðe.=}YöÖèïTÂw7þ_ÇM®þïjÔ«PºGð]/QÝºiû:ñÆ £ýôKQá:õú ìwÀËIì#Çë$PÛ¬ÚOïcTÄóIw\`é£Ó¶>IðËS·ê%¥NtD3ÇÛ'<9aíÍÌdÐ¤zÔSÃbB¯~¹R»ÕF±4Ê¥Tª Þ«5 ß\`ÏßþG¦8ñsm_¬x¹ÖOñ*(Ö)¾ØÃ\`&©ßØÍ#=M!K1&%ú4("§E©&(Fù%Jñùÿé	Õé9n6©&(lY%q$2é©ÞØ¹ %§ä)S ¸à2ÓH¹ÕêNîæaDeèÓÅ¾pàÕÂ~Õ?Öw>r=@¢ ÎµC?nj~AóÈ#ç¼$J;Þï§$­=MàxOcLçýCVvö6¡@Î¡®eçÇRÃÅÛUüe àº×ýeÀÍúäýeÔþGÕÃ6ýe¥S!üe=@l×äøèÂþ¤|ÍsIPÍSq|y½ïÜ=}k2î»6A7¬§ÏRoèl4ß"e@ôHA©7 l+Äì¯Æ.Xû'#ëþ]U{¯p{½õcÒÓ ×Ármï»ç|­3jö ßEÚ4v=Moî ÛÁ¡,2nRya 8Wbv-öú¥1¿ðZ"[}zpOKÎa9Rä:üUýð:,ñ¨0=@Dr³ ¹Ñ+;H±¸eÎ(e¨§æb&=JÃüÁ(%ÙÌÿPÊøi¸¾¨¬ÉXù)øñ ¸Ì/\\3m®Pßr14Ù¿[m³B%1B«ßåyÎ°æ,¾¨$êì«µ´T[=@Z~ª±·é-BP¶Cýä*j@@n­"Y¡8ëãæEYnìÔä=JA­ KDûö>ðä²3ßuÛî7T:[pQ¨Çj¯Î8Uìßnc\${gäÔÁANãT«AV¦Zeh\\hT>ë8X\`;Ó»}{½[â×Hk*ÔêêCV±·­.{Á×l\`i·J¾ÇP~ºa"U÷´TQ  pßtîìö°LñÛëaÐØqP¼Ìoìlq=}÷Ù¼ hæ³Å\\²=}²è\`ßR­þ@ø8.=JàËó««2Ë)Aó)×fÚ×9$Þ×¹vNÌÑx°¾*xÃ6¾É^< 9N¬sï­Bw¼IÍr¾PDQCµÉéQ:­.u|½Æ¼ÿFvÈôWÕàñYfø(¸¬SÂî}¼%sÝ?ñÚ'ïÞpÐØ7o½wÖ¥/[OpÏôuì=@ì=Jíõ ·>mÕî¥	£=JuIÐø-Lt-~wrþi7Õ·°T1}â½:Â¼qc//ÒÂÁZ@ÿJª,J,s1¦·äâekU=@4Ê@@ª"èüTø}~Sø³Õ§½Ä³ÄÓcy.ò[\\Z8oÆxÞz¥/&÷=@É¡45êC¡Ö|¦=MU¼ÒÇ H\\Þ*eþvÍ?·} µÃæ? òÝÛÍ~óõÃ<¿/¢öTñw@\`4%UbBõK]Ë²7=@?í½1Á¬gÃC¸ÓôÐvRh»2¤6ë6±lÉ'¯øátsÖ=JçWøÀ2$rbCU£Øº0´Ãøe£^N_S¥wZ3w¢,Ü¼Ì×¹½ªÕp]\\_{9Q_Î©=M ¢G^þDå[±C3;aÖNÍ]¼_Q<(jÇZ{Jù$üo÷ÞÚc=@t7dë7WKýº8ëuûhnî¯Gb´U[CÛË4MI¶áÛØ½Áöwï\\%ÄkÅ$³GûP\`kWÒqøÜ¤ýZäNEü3üÒ[÷|»oô¾ïl¥aVÓCX =J¡*hÛ ÂvuâÇ>ª/ßvnÒKÛWþCË\\þv¼zÝnü&Ý.1Â<ED¿ÇÎG®¢çÁø°³ý4TîýÃÙÉèÐW¬}{Vø¤DðÚuºPQ=@C$=Jâ3¶r½UÚ.y¼{as°üEÆ>Â}Èj¼P\\oÿb¯ÆX¶Fôú¥ª!x,n!£tWñMm±ö´Õ;ðVzLÚý]0òeW­/:zÖ6TE½BàÊýÉ¾ëÑU¬ùÄÛ.«j/{4=M5q£Ê´¶vÃÃýÑÚ ³ ý¸åÉ é~æª~Û²=@)k¿+¸øiß:¬¼âºñÖ9Û×Î8±n|dÁ°E¿}õØÛHª_2![²XJF0j$j4z÷°Lî4Ä5ÈäËä¼\\rR©Î*4ëÐrÐÁPíìæ¡ý&Ï(ÃX»J7¦ÀÓÐ	hBhàù½åSõ©¹cHßÒî!OLKøOøþyÑlSò.&«ÛnJE[M­ÊCÅ<òË£å:7cq)¿ê^>¯ÚA©'µë¶Üa¯´vÄ¼º=JÖ«íÃ?£,ÀÐ=}RàÅÛ©×¡eÕÝ±ä,»¸ßEÿDÿPýã>oE÷µÚñ->áT³µÃS:\`*¯µE´ÅN³ÈÊ=@bV"=M[H\\ÎSîDwî4ÑY®Û®á¿Ø»aæFßÐ³jäÿ»1ÇÈjciD5>Oc¾¥=@öúÊ,Ò/YAÇeóþ¢Wûv_3ZÙ9SÄóÐ²»wv=@ÓïdèVêëÿ´ü?Í¥Ô@¯>ÌlBÜÌ6ðlÔ^wËQ¦òÄkñO~ÿTtYðÌ0*ÚCDK0¥»¡Ö¼\`H=}ÐbûåN7sDÀÞrh) °*ÔæoµNÓ}q½\\k~Qf>x·{ïÝ·4}1£-f¢ÎK¼;éÎ°z]_îî7»µx:êû,;¬±2û]]Ñçá\\yÖGÑféøÀÎX,ªtÐ3¨oÔuÐXºÝo®=M=M­¦ÀÆ=Mè=J =@þKû»q.!ý·»ºS¤w÷L~tñS\`GíÞÂìoóD">ó*gxAÙ415ÅPÍqM§N¿É ^cÃs¹µ§Ýc³=@n¦v±ó¹'HNäßï8G­j>ôÞ/?/!VËü¯já¬®õM\`:ÇhÎÖ°ªN5ÿ¢]âzðM&¸ÅbîK"a&qÏ«òé§z.ÓIÒÝÿ§çû«²#ÍHéçíeÎ6ÿBV+×w\\OÛs}´¥j=JC+dÌ9DÃTþO7Æ[Û5sp½AmVÜúGlWoÈJÓãõ0/ð\\ªE¸\\r©DäßTÜ']23Tök+ý¸¢%inÔMËuZ­$\`evv+É5+ÅX° Õ½S|qn/¯Âs<¡¿#ÔÌ°Ù{YBÐ!]/8©c>¢ô4Þ=MYfpÃ~}Çòïâ:Ïw´aU÷Þ¢S§ô4Áø¤y×UD¯«(ÇÏ4Ý²Â¹p¹ÐBgl"+s´íÌÑB¨z+=}øõÑjÀÁÙû¢Çã\\¿<h	Ê¼ò¤P+k=Juc\`;2Îiîýõ³ÇV3	A1åÕò¨äÝÉaÔm¢®Ò{ÔG¯Ãu<ã7¸ÔrØ¼Êë«i.kX¬­¯Z[C\\a£ÉL=JLd.d³úëÃ-sRaVïe¨á[¼Übö=MOaèÎÒõ°süMSªÁjêÛ¦*í­|¾e? í=Mm²ü!ÏfÐ*©Î@½7ß×ß?Á\\B®IU/ÒÕäòrÿ·kvO¼wc]¨Á=JÓ¢rhpZ\\½×.©áÀEþLnë½ðEGËáÝÜ%{6¿Õà²ÐÅ|Öó7üÜC±a¾þávÓù3"nð\\¡LÄsàezÍÿÁ$¹@H¹YÔûPTºóeñ\`Æäöb°ö>³nAÑ1q=MÍ <5´wk.ßÑ³ÊÑócUò´fÒÒxÉ¾Å´f®«mÛînP¹v¸gúHºDëÑmodþüË¼¿Ù»èíà×õ±RB3=@ß*GÕÀÙ76wË%Ö¢Øè PÈ}?<x1åh¥ÕÙ§wàÕçÔ*¾úS]k+½ÔÁ¥Ê,'¢v~JÄNWRþ=@n²ä×#LfQNüõÔjðÔR^Ú¬j0½ST-6-ì=}ÃÓ:Z¸<]ÑÔ|K±8vyß!j\\<Ñ!*ØL)1ïßçînö Ìb·F/ó8(¾ö=JÝÐbïû·)9ä8¹¥	å=}aá^¦¨!èã=}A"ü5 I6&)ñ½#)¡±50~§V-ñüX¤úJ3Rl%Ëf±?¼UÎn²¼z¯Þ.9pê¶ø®v³î%øuNATê»§äzªûÚ9tëêi¸4	³ÜY{ÂÂí\`ÚeD2æcÿÚÕËújÖ¸Ñü=}|GÐ´ÃfÄø¼Çl'\`eªPÎ»TÛ+Dõo+ëÆï·¿Ö!¿iaR8Áüb;ßýV­ÖÐÇêÏø¬éÃiwå3#ËµFkï£Ã+SÞÖø Í.;UôFçL½û\`,öÌ­9Jg©VeöcûVi¥q¨ÏCöhWIw*´àé2]^Áë(QXd/>Îµº,ÿÄB¿ö¥®ÐK:X;¿ZåKkÚùÃôënåXAÁ\`®qå¼¨ý¹î¶ãöe]±Z{WÉ=}e:ÿQÉâNbònn¨ºÞ«ü¿Ý',uéD=}'´ÿÙ¸µ¥*"èÚuz¯dCU4åyd3iÍp6¤ûÿôòìï§@o¹ÅmÞ/¸aql=}=}}®2\`x7 m(Õj3àÓ¤\\ö.óÜnwPa¨°c½åÖó×\`¤s0²GeÇù>ÖóÑ¨'%t0Ã½7Æäe~g¥YÑ§OÐ·Å¥|h!öÉãQ}d!BÐ¿S×ÜÄSÕþBf_eü#ïwó÷ÜwKìÒÙ3*­é@$J2æÂv^¸I æ=}jØ¥L®áõº´_ëÞ3¬Nxöaí/cLcîáÃã íä³Y~0ï!ÅZ´ûgïQ6^âê¸õ9xYvÚ=}Iì·´É"úÅ¼F÷Ì¬]±É"¬¯ñ5-h¿4Ú´CWînv¸~P´¬§=@pèþÍÊ¿Æ?VÖ[)Uwj«CÄþN¼ìLI9bN±ãØý\` ô	SQ#ð=}C±ýÅýwÑëxÜ}L#s¡ôóÊ tÛ\`ó>ßÄ\\V¼«vbÔÒÃ'8ïsð2¡mTQEJ2Ö0v=}°·oBjÒä¯3ÊÝ=M¹>÷U=@eÃ§	^ÙdÀÞá³÷j²Yy·÷õÞ°½	ñ*û9nþú©Ëb;9¡Hp£o§³Û¬ÁL=J:z]ÜÝuwÅ¹zõD0¬QêÕERmF/ýÁ=@µ¼=@5=@êïÁr¸kë-)O&_Rl»ý°EÔNVíQx6s¾7yNÜû~Ôy=@Rm(ÝýgÓüv¿ê§Üóø,CiÏÁ&õïã^µçÎØ1ºNÏgJîï/0"òÖb-²bÍâÐ(:ôrtxî3+ðA[_(ÿº+Ñ,?ô=}Í{ZÓ+Ö÷-ªâuDªÀTíp½77Ý0ê¥-N~¹³BvÂg²cÜé²­Ðv5¿C°Cn¹Eðw©ºÜü­q½ÀfÓLìM}-©öÜv®>X=Msºyj_ôÝ;Ï0¤ó=}·%=}ù iå|1%¶;fe.vÀ=@)82¡Zè\\~GWëµUYVì©\\ÄÐ2Ô«.dlxEÒðN4'Å?Ðÿx6îèÛ:³²$E×©ü³Ó(p³Ð÷T\`B­|ÀÕ'ÖN6"|ï®5qàêv./J-k½ì.Y·ËnG{Nêü@R¶òæÃt:;?S=MS>*ó=MAÚfjy¸GXñkd-mÀîú Û¤ï¸] ¼	_5Nsï­=}×E)2wñeVÚ~0¾xêúÜ÷õÉýê£©\`VA4®ð.¡ì\`åCé»-ÜmÁ_Ø?=@ðwhfÃS±s]\`Øv,þÄæTÄ1HÇgÂÎbfcëÔ9¼ðqÇmKèýØZ<VcÄ?Pm*Ç+¬Æ2WoÕ¼$XuàuÀè2}ýK3ðwýð·QÃÎ?Vá[Ôöz/1ôzM«ûr\\ \\ï4í¶¤ll¤á¥4_T=MçUÃÖ½¶÷ä®WyÄYóS¬LÐåÒðÐv×õ¶Êl]¼F®ô¡bóênñ¥¡Ú¡#Þ¸JÊXºá¼Ãè¢pæ%Ñ5»´ëø5n	pÕ]Û\`½àó×5Ò¢_ig]n»y»g%Pù)]äJæêfkÔ½?3[5Þ_­CÇ,"'¤MÕ =MýÇeiäæ¬«^7Ä;è©k&5þßõÕïØ"ñ5)êÞ{ýÿ?AU@}ÛëÁ[È_±w÷/­¿áó÷ÎÄy7ý	,Aþæ5ÿ/ãØêl A@6mêòs~ ­tVGÜfÄ×J°I¸¼Ð¢-Âv\`ý8~&KªÆÂ-¸=@G=@Ðe³G¦&dÁ¥Ùãø¦ÿ¦ÒÚ9üf2dar ç¨­¢màgH>8õ{#øÁÏÊ'ÀWµ§9C½Vïû\\´ÂEåõTÛv-½Âþ2^µdÝm&FÖ=@E_¨Hm ¯jàº3½¾vêÐ+ pW¤;á¢L|Q²ÍJqÖPÐ=@ÙXÑ¿5ú{ó¦lË¼vÓbZ£éÜ½hdë4µ=MãOìPEÿ0MJ(Z{¦<s'¯Ü¿.<ÅÀ0<½Ò«"nÜêm­\`ÌñHwKÇÞL¯ÇpÕ	Ò®x W>ÚÒäÁüPSw,xeÄoÀ{YtìvçÍ4îkRàá]ßªÄ*Ò¹xÜ6ïßÞbôÇm½þ*n]Ì5Ëû~µJñ¡óÂdÑµ=MãOä¡$À¦el°ªõcôÚÞ_Ýs´©Ié9N>O¡^îÆ/T±ïûk=}m;ªâYÜíwýezx?O¶x~&*º\\oW>9wÙ p·´AÀ§¾$ª®µ@{ùøOßN?	S<}þ#ÄØCñ=Mìuµ¹mnÁûèÑUüàîR15Sðß\\)æå,¯òAF*"x+ÎíNt½0QBpypÒzËP÷Éù«=Jiµ_¾¨å}¦YÖ¥^r&Í»·èD£_. eõ@·¯¨¦f<âP=@>ÇW0k÷Q{ðqy,¶ÂJàÆÑñ÷ ·ØEï__YÙàÝ¹¨ºw÷Ìl9<aÌ,Ü¹ùÝ¤an\\àÌÇKÑCEE±ÞgëoP×@NØ÷¡WØw8X@>\\¢Wýúì;ªÀkµÎ¸;ØÁbÄÚf !ÈºÂM~4}*ÊóÙYDp-ËìèH&úð|ÏF\\A¹~Î&Aô+|î§cËrÙVÏP0@år¸1ñ1SñÏ(þKÿ\\Ø:­7ÞcÿunËR¬pm¿ókØß=}­±«9ÛlÓ^ðWUÂ*L5®ð/ë×ÿÌÞ÷¿Ô7q}þA2#D³\\Ø¨>ô'Þ"Þ¨¹ó÷®E\\Da8{]Ë#¢Ò³M´7È²	Xê+lHúEÇßñ¿Ó0Ñ|JÐåWµëmÄ©uåò¶Þãôý´¦W8áx|Í/7ÞèÊ5¼¹éÑI}dæ½´G[ÞlØ[ {×D~Uwû9¡V¥	\`àþþÃ|AÇl®X{ÜÚÓEð7D«°\`2^9òÍ	<yC¶clÎÂ=}0.\`âï0®aB¢PáÚÔ:¾¡ºÆvÃ ÅCCD¬CÔ:®\\g­÷2ó¯µajæ·¬Gpþ[Ì û¶pJ£Ø%­ú÷âx\\béväsø^OÍSIé48ÔÝ×2/\\É^áRJ¬èRÆ"bá}âTêÜ¦grhµFlÎlÌjrbz\`&~8 áda=M÷<7ae%Põ¿oÕ¼,­*éö0Em.65P·&zÊ>ZuÌ=@K^{;{a]9ccë4öÖÀ]0±AâØDúQ=Môõ=@ß¦dø®ÁòÀË7Þjø#ô-£±÷WÕº\\À}P×4VSö89ª·a.â}ÚÙö©È=}6ú óðla=@¶#×Íõ< ªJ^9>mº-<¥=}Àvpó¿SÅA9N½-[©¸®XÉ»b\`­æ?6þúÞGèí4|{ù/ôÊB³4ý[FRìNØ=}Õ^Ä5±nj·<±ß½2'4w*rÌE.ÂºÎÊåýÃv÷ûUÄªx²óNüÛwâÀpÅä=JO/ÒÈ=}A±EÓe+çÊÅZ+Ðmä0ZOv=JÓr=J[kSïÈx,?Ê9¶A/Æ-Ð?@ÛbáOÚèþ5Òy'å¬¢%!49=MÐfêÞÔàþúg¿Ò½3p+z´_¶¬wu¯ÖÒ4ÐN÷¿üY&¥aTQÂÝyûâå'dú5¯b,Sít@æ,ÍÜê­IâwÅöbUÆÿ¬gÉ´â´U/SRÎ^ux± ´scÐfgÈå¥»f=}fFÞ)2XÓéSX{*ê@öIA*à¡-«ÚjËÿ_P¥Ð=J  0GWXRXô!:½Ê=MÛ=}ÆY7âý½å}´"\`fÿ"19®¬·Ý?öÞ ¬£}S!ôËyù\\ÑÜ"ßÄZ°{Ùö3ãvö3ñ¤ç Ì*<&ò³ w:.F^Cûíæ¨ÖÏú0Ü¿yZn¶Óþh¢=}µo²	LÉvëñeý¦GÅÛWÖ/ÏnóÌö|nOT¬ÿ?-¡¸}®ÎNÈFÐP~üFóD÷ÃÂk:¥Þ^²N.è-ÞyLyhÑOegýìà-93¨I|rhÉbÈoõöIÿ6b9ZÝ=@­6íÄ+M7q>H½;m&,5®Ñ=@ÊB=MèÂ¬ä¤<;ªIü :ÊVú_xèÛÄ±­á×Ïø5ÃY|Y?æº7$Wv[pXïùXÊÍP¯PòµU-5[¼ZbJC¤[LM¢ñ&]z!×"rV^É-üc+=}ÎçÅô+)-{¨Ã*b;ë5mGwÂÑ¿tly_«Yæ¸àÇF¤«U/r¸ÏQºOlw>:Hì*©Ö\\jT­ZÁÇs'õ<NÄ¾ø-2qs¢3U;8Ðnë¾ÜLN-8ºzØÔØ)u£F²XµP5¹YA6äúè½öhke*vFø+ÊÔZÎ27^NÃÉxç=@1ü'=M\\	7®£Åi·n+®=JÛKè[²V1EÅ:ÓhVJnq®aÕ¾±ãùý Çú^Éaä\`X%ã×¦7­öFoµ×æô¥<HýªÊááQÅÅÊØ´jôcxX<öu½ª4ÚP1òbÔ·ÐÊÄ^gVU&ÿ´NW0Äðú~ÈDÈlÒÅr0\\BÁs=MâvÄ\\ÃzUG,OÓmª8Õ=@Ù#ò+ï¶á5AðYO2à<oÁ]^GªäÚl(á	lÖ´Ð«g+EÍ¢ÝlGV(·{ÕeRó&U¿P+\\,ÒvvÚ2h"K¸¤*{=}]¨h¨ød^1¨Tpak:àº­é¥Çêfãé9ñ¥*;¡ÆZ©*Dä6v»Ç¤¹qxÖó óÒå6ÅÒGTWÂy¸VÔìS®Iö>iÓ mñ+¥ÛOfÓ#j¯åÎÎµ~æÌ¼¦%]9h(¶iáV Ú<ãÓö&7ÍN×þ-ÉÁ¡©E'\`<i£&éÈ!ît÷& ÉV*³I¡!ýIk<©èÀ¢ÂîíÅ¡"s#÷W©ÚQ¹»â')û<ËÕû=MMöÌbØ¢ýÎÄú tSRÝ¼0%°ÙÎXNöÈMàË>P\\íóÅÖO5ÊTÛé,5Ã]óìP*fl~DGlyå:3}A%9ËKóÞÑSú"ÄÁ£÷7M=}aQ];,tÙ4ÊÅ4ÈlP'Ph\\:Å÷c¦¦täz0ÊÌþñÎBQ¹Ðd8FR×¹Ü=}tÄìfùÁÜïbJ·WH&°1d[?  a]:öß^ð!àÀ;ì!Ç037OùoBÄÀÏ¤T?*ôÙ¿YòÕèþ<ÏùÓÏâ7Ô=}EÝ~@¹¦ÿ§tJÇÒJJr=}·ø³ 2	tÅ¿¿¦®FÔÛå]LñÏiVHÅaÍéûÃÕ~Ý¾Ê0ì Hd0´þF©w¨áö'úE4·@áóYvÚ}\\ù4HÏÏÔ	ÚZBm¿Ð<_8Ö¹­Árf ±dÿO9¢1Ð­\`§e:ÿÿèå×ñÕtÁÔÆ~ßÚÅÔ0_ÒTmÝVeË¤¡Ô$ÊkFZag1¤-­Ü_Zª+¯i/Dvz=@®÷Xâ°|{S°%É¼°êkSbÑåþ^Ó»B}+¤lÝ-h¸\`34¸,ë·wx·öö}G qÔ¶¥]YAõ×ÿ¸~yÚ@®ès<îÒ­ ÙÛ,YSY=@¿¯u¼Ù¬£%,ÕT®ù\\w¸øè×{¥J¹s4&wJ1øÚßÒªuíµôæPL­?\\=M Yú0ÖXÿ÷qâ7E) =M©!¨éÒâ©­C©iÝ>**¯lnÃãR	ÚëP¨ü¢¤M)íò!\`}¥y=MçÈÇó-ú=MzqS*ªéFiñøÕ¢~àµh!it]fuPnA&l»»Ð¯Ùü­ufË|§ÁuÜKiÕ¤¬ÿ@"åBÔ×><í«óé©°µÄ@Uhöz¸r©o é"åµu¤Í cVï¹¨Ñít±)â_ãz6Í¸;Îæ$æzxZÀÏ xÐ²Ig¤#ñÝo&&ÑYßLh¦¯9wCuX\\É¹U|îÖ³µÚhý"Íf&¾	¾C3ü;Ö=Mð­6&\\éIWE!~µü¤¥|ÜeØáS=@=Jý|~uävÔ÷î=}wÄ¨âÇ\\ÁPQ;öß\`åÚÅôRÈË­¹h'¸[ÐªU}¨­=}6ûð@¸	nó©NWòîÖj·ßÖù+è4G¤w¼·ï÷Çd{xùÒ2{íÉ¥³Iøö¾ZØè ÆEd/Õ¹É4=}ÉwØòÃ$´£R ÜîQ¾2|÷4=M'=MIiÅ(¬l l_ºsQåàûüÊ½ß?ý´i¥TPéï¢éOïv¦À3Ú¶Gy*Vâs(ÖÇYÌÇmhíX±[ðã½¢{â½ød½iÊ]ù¦é¿o¿­ g WEîÐTà[Ý³§é¨ï²"úÖ2¢Äv^øÅûÎ¦ø»qûü- ¦ôVÜ8lnÁÊZH#SËÐNé-5®Jâ3ÁQûcºXÅì½¼M®à1=Jõ%ÕÉÁÜóØ½S¬Ïi["¿­-ê.ûSvæ¬Öd­GZÂ½fHõ5=}eæàmînbS¶l18x³@»Sæ{ª88áq>DBÎM5=@3¼=JÖ_ã2»ö:ûni1Zã6º¯Zî4C¡qî2C&L+3 ÉímÖÇI3g\`¢h jô"#Ú÷Z7]BÁ:ÀÀF½m¤](\\Ê;ÎÙq@|oYß°¾¸TJg-òfGÉckx@Ìß	\`Þc=Jÿ0«(È¿Ö0Aògº±äG]\\é5Ú£ÓjD¸ÇqkEÄ¨3ª PªJl9ð;=@p¸?9òK6VfÐ-ÞUMïR:|ïñ¬o¸\`÷=}Enm2n<ý"{µÍ ¸P	=@>Òûóv=MàL;ÂÐF©ÇBP.ä<i¨3ô¿#IK|KýÎ&÷á©&ÿL¦ÁéÔ)"Ci©$Ðºøg!mÑ¶¯/çÍgòíi6Û§%÷hÑÉÑ£ÂÝØã$!s¤õÀõh$iØCü9Hd¤'ëùè¡Îñm£5p¦ñ½yÆér¹w"X%ËKçûýY$ÉuÙ¾fù·è	yc$ä%m%Éh¡=J·é§qrY Y§))££Kç×á'©gFüãqà ã=@Oq%Xò) mÇO	c¥ÔÀ¹(rY¸$9é(¡¡Nùq$¸æå091¸H¥9¹¦i¼5Íy£ÿOI©PÎ	f¡þØÉû}¤L¦©¢)Ð©¢©¼Èþé1Ñ¦ ´-l¤Ö¥ê%ÈrÅ)·¥!\\%îºØÆé×ÆÅl$))ä"ùgèºèÚûy)´±'r¼)(ÍÅù#±(ºHÈiÄ¥/a%&¡ 	Z©=JÁa¯'ùù$aEè?üIé"âvi±s§8Cgç÷IHüÑoÍwAv%igÇ¦		ÛÊ¡µ¯¥¤ýÆû©£#×ÇKçç¹±¨7¡H:üµ)ú¡ü¡©ÚÒÍldÄû)yæ=MÊ÷umd\\$'ý#(3!Gú	'ëh\\>ü¸FÇ©ùè"Ûÿó%#û!)Åñ8)¼hâéþ¢£y¹®7q¹Û7Ùç'º(Õ éi ÿKç#ê(h£=@ôIQ	iã=}%idyN÷Yfý!©hÓ)((I§ì%©ÅiåéaÎáá!Fü½ÉBü9ø©¼7®¸ÍÉe=JÿaAù6Ýõ'}		Èr¨)·b5I3)	IñE&åºHé)¯¹Æc¯ºf1'õwK§k'Ag±v!z	y	[e©¾ÎIå((á¦ µy®ä/Íh}'ÿS©4ýÐ!Ùå_&=@ý9F)UØ Y{rÉaÏ)Ùæºhß'¹É¢ÞuÀ®ûq¹H=@Y)¨ïKÇåÐeyù%êÜº=@©)ÉÕ=@°ù$¨wù©£r¹¿pµ·Wi½q	%ëècÎß!æ=M%AüM¯(9!öÇ©'ºèéû÷%&×	(ù£añ¦\\¶	ûÑ$ò¯ )}£(Ëc1Qùp9àGFüdpÑ'##5xfMÎ	%Ô(¥ýKyÉEü¿Íá#?$ÒÑ±y¢¹aØ©)QíÏÝq©¨	Þ"$ºø§é'ä	iFÄ¾Áé$%9Ã'º¸ wãÀ©Hüiý¡	$=@ù®äðûW^Çýl%$ÉéÑ#Êa¯ ÍÁ(¥ñ97§$µE'÷gñO%Ùäy9ù¦r¨¡ÙîÔóÓA©$ÍíK'äÝ¡X©Ñm¤è©dÑï§cÎe=J¨¦ál¤"§Q¦g)v!é¯±WEæq¹±£%¶h£q9)ö5Kc§Õ7Çe#Óú(ñÙ)m¼-m$@!)ÿ}ý¹g&º¨)A'=M±Æ@ü5p	!(èÆºø'õÑ'Ñ)wri^¤=J×i"qhCügÝ³a"a®à g ¯Ág¥rùÈ	(èyFæ±K§I$dYÇãU¹¯ w§õeÉ¤hÎ±ÉüB	\\½¨I=@§ú{1G:üÖÙfÜ¥ñ®U§y"êÇ@üeÈ=MY)ò7¥%¸(=@a(#ÍKç#è¹÷Wf¢rÉ'êÀyÖ%ìo¡Büûóiä$ò¸° ÛWÁ©Ê)ÅÑ±©C§)#m9'dfiS,dÇÂB§õÈÉ8ï|f&yÉHü]Ð¶¨Ö%ä½	\`&åJÎÙ#§	çáyh«Í¼¡ã1ÈÂ rY¦Ú](ïex7oÝq	Þ©r) è-ÖÔ!	T2oë¸¾ÔR2TEoï@¥ûBô0;JïZDåðB·D³çîB·ðð>uÛP.¥µÛ¡ç©Ø_Aøgæ!è¥#ì·ñÂ¶[ñVc\`ÉÏ=JÌ¯V<'JâÝ6É¢³[#×vÒ ÂîAtg\`Yãv¢ççëi?¶¢ÅKëÚ·£Þò,ÇécÓ(T÷étYÙ.éÈLÐP³)\\|öÿÚ1<yeELË¶í<aÃøÖÏëC³I¥Ã$"óé»"áwõ  ya5ÉòAté²'TÑç'5hºJâq9°¼<ñëY¦iwÓØÐ,üè<]¢n«±Ï0tÆ À	ÔèVÖÅëk+èÂÿù©Q¢êÞi÷X©e}$ªxuMNH¾	~Ì=M²=JW3<iâ§=@â}M$vÇ<¼îQ~Úo¦ÙÅ³	YRx¹O<{¦ósæÑÈ/ðÁ"ÿÔÐP?æÿ&sðlà7%/¶iO¾Uë+·\`¨¦Muá­­øè ©ý7Ðq¬ð¤KëÉw]Ë«'m7Écâ8³ý©7÷B£õt<Ù}÷~ÏºïCÿN(æÖ°cd^ri¿ß£¿$ÏZ³%]èËùGNÌÎ%É0¦$Ûîc)ã¸â3µÀ"Û<Ð?>GV	-vK§ÉôFUÞ|\`)ÉQ%tF]UgÃéj	eÂ?gH[·î±åÉe¡þ@Ç¨ýµ­·U¾àÝ#ØX)®¨{:Átt"b·º¨½"ÆÔ\`!3àQ&ãf¨6R¾)rí-ÆÀ'¨áS7yó¶ác$¦Ãìà"=@ô0r¦¸±WÌ"0±³I]£çæ<ûÑÏîKßìCç  »"C©=@3AA1®u&Q¡}çÿ	[jç·ÐNáTÈÍÿ@ðX åS<ùTu9Czèû<y]Xä&4³EGvÝÖéFßsSKÐ±UuÐ%Ï"ç!u¡ÅePoÏbá¨{(ÈÐíUð)PW}p¨JÏîY.àY´v¡¡¢V'W9ýÖDùTA¿bm÷Äc¤çÔLOðùh3º"ÆTÐeñ\`¦z¢C Ìãámç&ý~í³?··Iâ½÷??° Á¢´Ý÷Ý ²ë<ùaK¢Ðï=MNòù¶uÁt¾§	O<]³çgçkýOÉêøþ¼àåt3'ñdÉ°5<¹Ù$÷Ãû¨¡ U#÷Iâ¯ýØªÚ{Ë8yN'8\`	²ÍµùãtFY}¡¢®±îGÃøßÇ	ÏG³ÉÞ¿% =Mõ·OÞÀ&öÈ1Á º¢5}³CçO(§ýoÉw«÷=MNgþ~ùMOÈµi%¾~ççTà=@x´Áí<)×·óÕ}µ¶¬$ ÎhHä³¤¨©½}Ý9Q£Hº"yÈà°ýx9eMÙÄÃXCäîº¢Íà­¡XBÁf¿¢¦ýÀ5-áÜ¥T·Ñó»èX<±ë>úã(!MÕt&Âµ½y´Cß\\'ÇwNÈeÞþ×GO\`å y¬$rf¥ªW±'å0r"ÈÔ=@Ñd¹=@õ9HZë$ñýOhñÐ¹bØ­ùYü=@­ýÌßQßëüyHY'ï£'P$9ïPÚ8¦<þqÝÕXÅ_%Xöõ½aÉf'>Q{o¸ÓXc¦A³Lì_dK¯Ú²ºðyº4>'ï~PY³)µängÖMÖÙ=@%YIäqÀ'qÐõÜ	éh_Ñä8ÓjRM£)Ùú4}÷Û©ÙÖ ðí2(é£ryL«<ÿr7ÀÙ.nMÌÖ{sm=J·Ip iB¨(Ô#¡=MÝÉ)=J(­·¶rØ»»2ÕTtÊ4¸ÀÅËÅZþªá_cPð1=M¼V·§<ÌWn¬c=@²³Ô¶²´³³ÜpD½=M·­Ì¼$[\\bþ¼:slÖ²RNu¡ð$ð+óB<^w·²ÕvÚ6^¤&KÉ.bÅ%ml=M¸ð.¼o~±P.;§°N<)F×¼È=}Ùÿ>õ0<Â«3wW£:Wn¬ï¶²u²_Qs=@=}Í°Ô&cÍ<=}oY¢®DÍÖðh{sRû¼ZZXTk>ù\`çÂB³[ÕG<ÿêB89A3vùAHQd 3ÿ$büögL\\Ý_ÕØS[ ÝÂßd½V§½VcÖp=M<n_LåÎÜ¹ÏÙccû¶µZà	fÊWÅá[Ö1Çd°¯àG=@à£Ñ@Øjñ©Û0ßáeÄíÍ¶÷/9ûé ·ª²ð©B³A?#èl÷3bEqoD% ]McblüLÌ<<½¶±_a8ÞNNpïÕEÛÀ®ÔÊ"þZ\`uZSê³s@=@ÄÂ¾[ñ\`&µT)·¤^@h²¸´¹á®µø?°R¦|7gu½âBt´ï\`\`ý¸½F^Q²6Ç<¼×§÷sÌµ¥¬OøQXDxBv´Í¯$Â×ðÂÒÒ$ìÖhÔ@ÄÎÊPNà¸µµx«ûñÀ÷Äs3óóÊ£=}ÝÿDÁÎ´wl¾ÿ>$ÙÉÅaPð<¸ûpòy»5w&1¥"1ï6\`|qLL<WsªÂÒÆ¬¤ÙÞ¥ª[óFÃÑ£ ·[Æ\`ÖcûWÒhî¯£Å1ÄÍòÌïqõAÈÖ4Lß²ßI"ñÈs?Êä[ÿ÷¸À¢8ÌTyêoÿH;ððc_tBLÜÍÿ_¼OÍ/s'VFâòRÕ:BÍáDWKÞNçÏzÆÿU³^\`T[QÑK£pÎ{>àKTnJÆ YëÌ¸¶{6?ï®SÜ±¼<ö§Í·ä«³³ÔS¨(JÒÖhÑ ±_ëÿ¶Cñ¶üÔß¾n7Z0¢¢ú¬Q9GdîÂÛnµ&Û^|>õjx+pW÷øÜÀîÒrûtØ¤Õ3¨íÍLLR|Låq®±±Ðâc\\A]\\t~øsoÝÛÖv(ýÐi«È0¨bj/(Ò±$¥âÆ9ã{ö½$ÆSycÁöõÓ#[¡;U]þQûj+=J=}PIK¬®Ì!ø»@ÕOKÔYlaTû±<¤=}3­%fÖ«½|zI£ I=J·®<s¢s¢KãâÔt¢t¢l¢n¢râyâqâuâmâsâxâlânòJÆMÆPÆNFOFLMLÎ<\`=}=@=}=@:À;@<:hQvP¶K6QN=}3;®®Ø® ®À.Ô¨ZKº=JyÒpNâ=}T;T<Tr:ùpl?¬¹öInlqsÚ<p=}èNÖOÁf³ÓT=@ß®bììì¬QqÖ1ìKlk8M¦tyôyµZÅºs8JMá-=}<ø;TgìlPËVOÊW>_bhë»ü{È=JkLB3ì=M¥ìÞ®o.5ë·²î:>=@i¸*l^hrô;¤¼ðCÎ¥U½î{b\\SBQR>S:]S:>04í4ì4lýñ´µ¬Z(«Ì~ÐZ({}B\\S6³á?ïÀÌVãëèÏzäô\\î9XUtc4ñçvo#ÌÌFËºÆåjCfùJ¦p«[:Æ'®Ü.l*2\`,ýi\`VaÂyÛÈVoÑMtpd¼ÐpÎLL%òõ\`KÑã?%=}?ÅUÚfù¢Òºùf«Çÿ£Èµ¥¾õ[h6÷ò[(:Br¯w².pùó	[ÖQ*USFsÙ*=@6©.f|s1ÐHÂF1PÇ)Â4a|ûÃèñg-4}óÁjK¯#7ZÊ}-@aqs-åDÕÖ+TBÚ	÷ª·Þa?-$_=Jhë÷­U±ÕÝ¡QËËqõCK=}Qb®b~H@v/·8HÇ¬Í¾0¦ÎkèS78æJÏHzgB|¬âH2dâøM±9J®ãç§¡=@Å 1m+K¦P0÷lü2dÍS=JW·\\¿-¥rFF¯ÍgöLHï=Mç;ï(6ËÂð=}iD=Mú}¶á½£ãå6 Iôö!ÆÄ	ö'öQ²']®eæÇö½ùYcV)?kÉÚ VÀI¾,¢k¦Ê=M¼|:å>1¶Fz4ëº.íìZfY,í'ÌZ?­K×b±©t#¬ENy)g©Á)	ý¡Á)e')©äZ¤$é­)©(X)á'#e'éõ(&å t=J)´Ö\`=M)à¦(¢#)©!	©ø"'Õ |¶ë) )=MÅ³é©¶ihêH\`$>LùÅãtp8 Sa¢"V(VÑç8ø\\¬e"ÿÜeýÉb:Dûå5£u'ì ÛQj?ËÝe:U¸|f}þk2ËeÖB±ï­	£,ïÚúr¦Õ®©  88¯4AYÐ¬å×ê=@5nüÉY@ÏÝÙÛ9Ù;ÂMu]¡{ap%ñ=@¦{5ëª°(fÙ'DeGÏ6×6S£=}µeå!Ø;Bòí=@dK+¦#hÔE°×ÝßÏô_¨Q«Vÿ;;Bóà ÝÆáKðºÕ¾cæÓÖã£=@2SÌæ·î¡â·Jí,m/ì«ãõã%zBøßþÈ=JsÂ¬¿"³çëúZïöz²ó¿ðBsW}ëÍxý$«¤«»OX¼ÝS3s{p[W+=}bå=}Ø°=@°swzÄÑ_WZÎ8éîÎ¦E%M²ÍP£ý°×¶Û$)à\`M±a×_aéiÍ_È^Ó¹ëyr=M¢¿Uý7A"\`uzè$#¬¯ÚyóiÒ{#îÉâ'=Jùü[¾]þ÷NmÀäaímª­­:ò\\?Ô\\I¯ßZ¹|4WVÛQ6³2ßúÖ¥Zé=}y¹4@V2\\Ä	ëë8¸¥¼yzûûèq]=@ÈïBù2A Þá¡Eíè&0­«~ùÉéj+	3ú(Ã©}Å°ýâr°ñÒÑµ9ÐÒñ{\\v»0ÜÆ6'4ýlHÓËæÎÍù(.(÷_ oR2<ËH;4TlûwL>LV¼a	%á´z÷ùzF³zWñzç2ÇÒÀÒüûx5=MKMb¯ÚéYkÿU>Õ.S?q+ùÔÈVuîå½¾¬ÁtZ>ãl¹Û¼t¹(LÃY^[Æ\`±{Rá¾1f8ýÜ=@p?*$Z´|¼ë­N¨étøfü=}qoã7³éEfN¥¾ýzÀÒìþ¾u{Õqf3,6v;_áUe£6Àñz!r5ßÀø2¤Q¦ê	äf®>HÞ=@X6oêeøwfPM^ko&(HåÌ®(¹}+s·=JmÑp=MÖ=@X¨ *Y9XÓ¦çüÃ]vB;ù¬L9ÓM±gÁÐdÌðàQoOw¬Ìz_à*ÓF% ÃÎwúíÙhÚÑOGIÁzë ø ¸xuB\\ÙÇxÎjî3´.gXT=@kÇP93yvG[h¬4k½ÁÊÑNt(VXä=M_pCùMößô+H¬{¥rB®rB²Ø(øÕ÷ÿÑNæ/»«QÌÃDY$ÝY}æby¦¯}C±Jb>'Ù>ÏygæGjf:È¼xwP§Â³ÎgnÙç÷©+óé²¾MGã=MKpmU£IÙ¦ÐÖÊ®&ÌÍîè÷§Ü¹=JøÍÀ¾ «-·©§&í1lÄhªAí.¬+Çõü5»UzQë¹B=M³þÙ¹Äñ½ñWS¢AÍYÈú¢ApmÉH_øß_ÖÖÀA<ÊÉHÑT£Þ§|¤ë)j¿	á¥êÌòã\` ÇóÓpm,%kd±/áìÄ y}¬g£? óû¿ÜÐµl5®F,D^®0~¶ún÷l3/	ÌiÞf·R+(|9®X´»ýn9²5;¤9ù ö ò¸ø(K% O|ÃtbNk¶ÖTÅ¨E¯ì!ºÓà&e¸<å²Ç|AA2µééK­S#Ábl9ÂÁ9ÚzW%¬ÐÌÈ¦ÏiíðFP¦±/év=MR$´ù~FÛßruIì}H5EYÚÅïÞ#bÕÐgë7	åÎÔG9'o¢º(!MÐ^NvÏ¡qà=}9ÿU§¸Ü¹9=JÖ{q=J^gIÍ©ìÙkòÄZ9Õ#39µgORæy¦EØÓØüñ_2{éöDæCÌRâ¾m¡@¤\\A6uqE½ÛotþS¦o¦?§KH¯í®F;çayBé¶òM©~~	ö¹¢ëkÎ÷ïzÎ¶ 4öð%bØÐ>ë[Ån	yÆ=@-St^¨Zgn;áEgþ=}PÌ,¨Tâ_:ÃmIy{ü2EãÔû¸KêÂI2=}â¼úMà6{&tB¶TÇ]#f²Äß«ãnÙàîÞæîëßÃp§VK(KÁ)|Ë·c¦ÍÀR®¨X_4ðËOèzû~¾yÓçIöz=M¯H1Ó>¶$I£ÌÎÐVh=MGTt5$ÙÌA_u=@6æ»ÕRÉúmgwËuî¥Þ*ÏCY^è]×Çp©f'oõ£wÇ	ïVÊ÷*Í#ê?ØáÑ¤F úhM® 45JÞéÔÜ[S\`: Y¡0>y+©æ¨¿ò¼gi%o u(9VÊù«4Ûn\`ßdY¨z	ß¾ç\\;_çÌ&¶	t0=@;©sAGçÚ25h&,$@p;©°ßcåÌîÓ@ËÂôÕØ%LÆð¿/YBèþ$»î=Jc1Ó)LfµÓÑhg°ú&qþ&vÿüµâÒóâ±.U_LpÝÌ¦·-¼L1ß-oµÕc&vdt{l:ÕÐ)t§AÀÕVmß;Áã(<Í³ùo£ÆÁ5Ùòù\`Âö	}®Wþ§WO)¯=@ÉòÛÑ¨âU\\B\`ÕIWªúçÂ¾]¡ÖnðkÞÄq#­­KÞHB´?îÁÕî	®Þ*1ËfÌG=JßFö{£o¥¼)Ez)©z}¯X^á+E~EzÈé3	ýD3gA ÚfkuRøÿ#áß§;õKÞ¼¤TyÒ@ï»éS8»çy§Î9]­éÉ=}ô|Õß>Ëã¥:ÅÊÏ¤ÉÌ¾ë³QóÍRSÞ?,õ¤´¯ñÑ÷&ÄIbj7ïIR: jÝ,,mùp®l|@ÔÄÙ£+l!ßÉ#oR&èdÜØPAºú$|0Þ»>¤Ùù'ä(5çÝæ)qö)ßÝ¿þ§§öKÅãcùÕ£¹ ¾Ç¢Ï ãÐ$f(FÉspÐ@$$¾¬XÑç®$QÞ;qqÅMEl¢)ÄQ±S2µLæ°Æñ_¥A¡þ\` ú´²,×ð¡|à®ÉÚ@þ"»þ$­c]!2ø\`øuN/_eT[!-F_x¾jf?±»#D^XàýRôC;4%ßË´"_%z¾ü,]æ=}2¹JÀUsµVá|!¯ð$ætã¦vWçLôß0«wÔiÔá&¸7:ÂÂµòXAdw#»]©¸ÙümÇéß¤8~!lsmF=}âú=J´Ü_>Oß9ÿõÚsÞþÔG£IEÿÀ%cª=@¡V­Â'azß@Y¢»Dïwo¯Ï\\á6ÀÒSK!vAVl@Ý+=MZ2]ÓÀÁoüp²õÛhIÞ#-3È)1ül¾5uZÇevL VWªÐ)¡µ=JV)³ÄÆ%þÑûà Ê7:h{yÌc2Ééè=}HjF©z".ì4æ0DYÖªÍèaÊéà0Ë9ºs	q¡#*£)UÊ7É©^)ÅÜQ=@éy(uÿáòË!ä¸©ð¦_é¥ÕÖÝË£5yþLtÆÒ¿µóß®{&VÏy.Ë#Ä/b,ÛÔ:eþd¿ì­úf1÷uv"5K²ßíwEÆ÷7>âR-²ãÙs¢4´j=Mp;Ø?^vÖ48Z'é\`x²×Ë¿$+ä9Jìà¦cTN±ìØ?¢CÃ\`ká0ÄQÊÏ$5	)|8ã(éê9êyÀAÈé\`%5bh$ýöiÁ[ìéAÂo¢¶EVrÑß:­ÙÅ!¡=@L¦ð¤m"27þ&	=MÚÆdÄEÃmé²Gìÿ°2A{	ÐuG&«\`o®ìYJ=@ç,Ûh"¼àJ¡´ë¢ð4É=J©jU#7«5^eJ>l¡©ucË)&Ùè*®)¹©ÆÈ=}HèÐ'£çñmÅÛ®éY!nß0Û,ròCÛxò,Þç8Û|ï´$__IjÅ!¹(?%ÀÙ\`j/³)GK§Ñ¾¾ò¡¨iw)ßçÙáß	)ä¼õ³ÏQ@¿h6¡òÏÙL<¯Rg8¬RWxÊÞ÷×[§nÌ¦²¿¾­Æ¥TY/ÎôÑiÒÙä@_;KµVj+ælÅA¢¥e]È¢@Vîç¨+¤öµï=@´hXbÿ5CÈÊù#^.ùÇïÍîPKEYØëþáï³\`·ûüh5¸áÊì¶=Mâ}[EhU=Jò4fÓ%3ÄÙ«Ù·ïpù¢®¸¯iÙ±9ðþí¹ÙÛ¨ít7»ÝÛc R{H4É¶tÛbd\\:¸±æúÖV²2éçÚ÷UC±-fÕ:]dxìÕÒÞèAF¤x¯©(XB äCÙ³°[R,I©¯UÕTR©GÉøß{ÓÂÒI|øRtíµ*F¬-U=}[nysmg÷N\\G¸aY=Jí[èÂf9À"<wÊ=M@1å¬4¹²ßxåµhÌ@fwµè±¯ùipt[kfB;íÑp)ÔíµO&'0ëÏk=}Tß9ÈÒ°)0×â;÷ªI%4ß#õð=}íÛïæ#AÆ8£´OïõÊ÷ê2Éµ"ýú¡"6'èUtåjõXÖBE®Ô8s­úç}?èÛ?94¿qÉ]ÛZjk®©öðáÙÄÒ]áp×Å=}§.[«¸>YÈpá0A6Æ!°!âÅâ×7 GÖ/±UØæõ¨2Ïý=M{ï?R½ÿ-_t=@ëBhBýìªQý¤!Í=J KÞ¬»QÛd=M6èÿB'÷iÍº!|ÆÆå; õIÍkÍÚ!BÂ­Q|ÖÅüGÑA¹¡Hìþû!=JãU<Ç9°=Jj¢Ùf«ÓhZ2/fuëãf#9¨>\`¦øÙfìÓPý¼öÒÁeíî)&et°fë9|í·©·Yª:þ&+x¹Zë#Ö[8m·w5û¦ð6Õ=}¯eñLïn	Ò®ªm²U®8ã¶ñÃ=}èh@-·pÙ«(ÐR¦ß;»uZJË[Ð Ö¯¯Xº¤÷;}-fVÓHi[|+&ù%èmi~)çEÄÙÈ¸ÎE#%ßTÈ·8µ.Vç±]Á=My&­8bK¶=Mó%MÛËi®lÍÈ#î{û1¯ÑK vþ{5gQÍª}2¯½=MX"h³lÓ²=Jh¤@¹·7ø=M êçB)Ì^p¹joÙ"\\ô1%8©µßÏd$(Â LÔQ±86Tb=}¹&#àYHÚ<;åLfõ®CÚÎ^Ã#0oðwkjoöÒaIC}z¤7b\`ªõ¥ÿ{ôLy#¬)K=@6>åóÑÖ=MH%2Ä6IÀC²hõhÞG%Qop\`Æ¢*W½çñÑbèG¯t×ðnùÄ2ImÝk>Ç8GÙpïOåÛ¡"òýCÛåêr\\E#E¸«=M'ÑÒ=@4-Ìð¬RëÃH¢\\9 ×§I9Xí´!¸=J$ÔjÖÃ[=}C·%Ë	µBbH$w²	í¡	ÖkÐu*"ªìÙøKæw.°¹ïIånø×'o¸q(L=}|&;[S4Fëu¡¥Æç;ÐIÀÌ#ù:¢î;E	lóGu{åôP8VU\\b_V°H­¹Êôµ«B\`ã*PÀxêèIJø¤C!*íÈÅÛdE0Hg´=M#T'-ivÃå51µ¢=@; %_»"{T¸¶ï'¿=J¥(qV=J³äÙÚ ­Y,²!}pë?BâäR°§"7Ç§ÝI¥­³Ý[ñEGB-%æÓ»<¹y×fmDÙêeÎJö»ßF}É=@ÝUo=@mêøHB¥ä/&]Û	Ù3föJ("I¬Ç[ËV°öù®ô÷ûñ#.à¨^@À²¼¯ãG7	#gâ'ÜCßIksYé´yÖlï7"ÐJF\`YïÞ{ùT=MÝÒÕèo&SÞ¨¡;¶õ±ïQ{ÝK¦ûBOøGì²GñZ&XÖSíëïÍú)MþÄHq¶TIÁ4¸mSÑ¦Cd?=M¡îãaè² ";íP=@«Íã*'$ámU	¿áÑe&ÈÑ!c¢æ©@´ÞÃ4'ßAt_¹¾Êbö¾0¶í«µiQËÑzZD}è)@Eü¸Ëm@¥>Ý<üÛîè+üDÿ¯'¯ò4e¶àhYëÉ{R°±îæ]båM*uÑzá}²äÜA!ù¿îà$ëÐCdQ!ì3=}íá_¤ÌýåÒ:üBg=M@&$2í9Läò5~%ð! 5±B]3ûa=J²hl<°³(¢ ?¦<]Ûê\`¤ðG£m;NÕ´M¢öN>Ó¸û4îvB¦Ûjæ£Ý-ìV	øÀîÛ .Öì-d7îÃ¿ÚPFg>ø=}':ß8Ô¡Ã²ãiëÙð×²(¢_l¦ép³±ðÓ?Xg¨¯7£d_@ÙaØìç	¹Íp-Òù¶Êôw{(yB'ä:ß¹Ä?ø=J­·û >i6	øAºàb¿'<áJbfå!pí¸é~³¢ö!=JI¤¬dÓ¨®	Ý¦E»ýp¥bz¤5ö|~BÝ9l´Mj5"=J(Ãzã¤]¦"^ø8Ç­/ÇüúuÛ©·mèín!j.×qAAú#¦C®­aËm»ÏÂ¥gÇX´Rå@Úâ¹{=}l¢f:¿&ªÉÞìÆÍ¿û/CÁ¼MxùùîñÑ¤|% Rdi¶=}"=@ÇËÿ+¿§ñ½|Zô4WûÅ5?´Gî9QõbãY´g´émç=M½hÒfØ+Ô9Ã³g6SÿõËóxvÆ¸ëë=}Ûùei6¥°=M¢@sCÂÛ=}ÀOÿ$gíÇÚÞí/¢oþÏ6¦_ÝV$ùb²Ð5·eJiµ»íÕÊ=@Dtã«ô9FÚ³hwò\`à-\`ç­y\\©ïÁCâ}×¥YîÂï	JVwG´yàÖl×¹úöÕ1é!Á¥ã­$Bh­Ö+S2w	äÂé»"$å$¯õÐsÄqôÆùï¹G89@k|ð¾éYØ¥^\\¤6?ø|iãìdjïq{)é&=}a4A¾;¯Æ4ASÖ¢3¼ÏuÁSØ¦¯´¿¶¿ïâ)n$©É"ñ4áAÁî	Î/d	Å<	ÛB¡çîÁ#\`XL´¥¬÷b-D_X°¾Y*ÁÈ³ÙþO6JnµçsXÙßÙ._Ot²Áëÿ%[0¼¤1pÐAUî&¯"	Éëû³¸ &¬ç$\\du°Ø	ÔÆÑjK{jìóñ,¯«úeöñ)²PCmAywç2qf]\`SôdCä²5b/î9FïUµvõ>£¢¯8maä$dFßïI©#yGÒúï7xovA¤¼»&H£PmA¥qÏÇ}}_\\Æö)xìÉ-Ó}açÊ¤Ë·Å^7ðõjÈãâÕÈðv=MX·¶üâØvéÐÛÃ^ÉðÌV·6Ï»¢èy®^ DsvUSèçpKç=JÞü.¸,³Ï¤/lo7Y,&AI#«ùàÉø ý¨dy%iÇÑÝ'àÉø ý¨dió ýh5XæªìVÂ5Ý¦½¥Öÿ5q¹5K<~_n¹e6xù>hù#FÍ'ÛÍwæG¬úöR)ÀõöÆï3;'yâòõã.\\ñ×oj¸ÅY¦=@o0ãGÎóËâuuPÿm¨èJ÷ïii@VÙî¤&Ké"%O_i_PQé"f»òm÷½ÉòÓÉY)Á)e#:dA/ø9ËuCdh[9¢	ÖX«Ï´>èI¦²ËÇ>l}ý7x#A³þñç8)1`), new Uint8Array(107391));

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
    var ptr = HEAP32[iov + i * 8 >> 2];
    var len = HEAP32[iov + (i * 8 + 4) >> 2];
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

  var _malloc, _free, _mpeg_frame_decoder_create, _mpeg_decode_float_deinterleaved, _mpeg_get_sample_rate, _mpeg_frame_decoder_destroy;

  WebAssembly.instantiate(Module["wasm"], imports).then(function(output) {
   var asm = output.instance.exports;
   _malloc = asm["k"];
   _free = asm["l"];
   _mpeg_frame_decoder_create = asm["m"];
   _mpeg_decode_float_deinterleaved = asm["n"];
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
   this._mpeg_decode_float_deinterleaved = _mpeg_decode_float_deinterleaved;
   this._mpeg_get_sample_rate = _mpeg_get_sample_rate;
   this._mpeg_frame_decoder_destroy = _mpeg_frame_decoder_destroy;
  });
  }}

  let wasm;

  class MPEGDecoder {
    constructor() {
      this._ready = new Promise((resolve) => this._init().then(resolve));
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

    async _init() {
      if (!this._api) {
        let isMainThread;

        try {
          if (wasm || !wasm) isMainThread = true;
        } catch {
          isMainThread = false;
        }

        if (isMainThread) {
          // use a global scope singleton so wasm compilation happens once only if class is instantiated
          if (!wasm) wasm = new EmscriptenWASM();
          this._api = wasm;
        } else {
          // running as a webworker, use class level singleton for wasm compilation
          this._api = new EmscriptenWASM();
        }
      }

      await this._api.ready;

      this._sampleRate = 0;
      this._decoder = this._api._mpeg_frame_decoder_create();

      // max theoretical size of a MPEG frame (MPEG 2.5 Layer II, 8000 Hz @ 160 kbps, with a padding slot)
      // https://www.mars.org/pipermail/mad-dev/2002-January/000425.html
      this._framePtrSize = 2889;
      this._framePtr = this._api._malloc(this._framePtrSize);

      // max samples per MPEG frame
      [this._leftPtr, this._leftArr] = this._createOutputArray(4 * 1152);
      [this._rightPtr, this._rightArr] = this._createOutputArray(4 * 1152);
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

      this._api._free(this._framePtr);
      this._api._free(this._leftPtr);
      this._api._free(this._rightPtr);

      this._sampleRate = 0;
    }

    decode(data) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      let left = [],
        right = [],
        samples = 0,
        offset = 0;

      while (offset < data.length) {
        const { channelData, samplesDecoded } = this.decodeFrame(
          data.subarray(offset, offset + this._framePtrSize)
        );

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;

        offset += this._framePtrSize;
      }

      return new MPEGDecodedAudio(
        [
          MPEGDecoder.concatFloat32(left, samples),
          MPEGDecoder.concatFloat32(right, samples),
        ],
        samples,
        this._sampleRate
      );
    }

    decodeFrame(mpegFrame) {
      if (!(mpegFrame instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof mpegFrame}`
        );

      this._api.HEAPU8.set(mpegFrame, this._framePtr);

      const samplesDecoded = this._api._mpeg_decode_float_deinterleaved(
        this._decoder,
        this._framePtr,
        mpegFrame.length,
        this._leftPtr,
        this._rightPtr
      );

      if (!this._sampleRate)
        this._sampleRate = this._api._mpeg_get_sample_rate(this._decoder);

      return new MPEGDecodedAudio(
        [
          this._leftArr.slice(0, samplesDecoded),
          this._rightArr.slice(0, samplesDecoded),
        ],
        samplesDecoded,
        this._sampleRate
      );
    }

    decodeFrames(mpegFrames) {
      let left = [],
        right = [],
        samples = 0;

      mpegFrames.forEach((frame) => {
        const { channelData, samplesDecoded } = this.decodeFrame(frame);

        left.push(channelData[0]);
        right.push(channelData[1]);
        samples += samplesDecoded;
      });

      return new MPEGDecodedAudio(
        [
          MPEGDecoder.concatFloat32(left, samples),
          MPEGDecoder.concatFloat32(right, samples),
        ],
        samples,
        this._sampleRate
      );
    }
  }

  class MPEGDecoderWebWorker extends Worker {
    constructor() {
      const webworkerSourceCode =
        "'use strict';" +
        EmscriptenWASM.toString() +
        MPEGDecodedAudio.toString() +
        MPEGDecoder.toString() +
        `(${(() => {
        // We're in a Web Worker
        const decoder = new MPEGDecoder();

        const detachBuffers = (buffer) =>
          Array.isArray(buffer)
            ? buffer.map((buffer) => new Uint8Array(buffer))
            : new Uint8Array(buffer);

        self.onmessage = ({ data }) => {
          switch (data.command) {
            case "ready":
              decoder.ready.then(() => {
                self.postMessage({
                  command: "ready",
                });
              });
              break;
            case "free":
              decoder.free();
              self.postMessage({
                command: "free",
              });
              break;
            case "reset":
              decoder.reset().then(() => {
                self.postMessage({
                  command: "reset",
                });
              });
              break;
            case "decode":
            case "decodeFrame":
            case "decodeFrames":
              const { channelData, samplesDecoded, sampleRate } = decoder[
                data.command
              ](detachBuffers(data.mpegData));

              self.postMessage(
                {
                  command: data.command,
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
                "Unknown command sent to worker: " + data.command
              );
          }
        };
      }).toString()})()`;

      super(
        URL.createObjectURL(
          new Blob([webworkerSourceCode], { type: "text/javascript" })
        )
      );
    }

    static _getMPEGDecodedAudio(decodedData) {
      return new MPEGDecodedAudio(
        decodedData.channelData,
        decodedData.samplesDecoded,
        decodedData.sampleRate
      );
    }

    async _postToDecoder(command, mpegData) {
      return new Promise((resolve) => {
        this.postMessage({
          command,
          mpegData,
        });

        this.onmessage = (message) => {
          if (message.data.command === command) resolve(message.data);
        };
      });
    }

    terminate() {
      this._postToDecoder("free").finally(() => {
        super.terminate();
      });
    }

    get ready() {
      return this._postToDecoder("ready");
    }

    async free() {
      await this.terminate();
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
