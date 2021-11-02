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
  })(`ç5¢£åX%ÔßOÜN8¥ªÇb³ýÎàs}Ïb¸+<r\\ú ÞËÏºt°p¸=M3}|Ú=}6Sc¼,«í]b°hú¢ÄÑ±ld3ÛbjQZvt«líÞËºÀ¾Äll3&(!××Wxì-£ð³ åè	'ç§ë¥B.k"¯Úf__?xFQÙ+½X<3NÓs(S+ÓÓsÏz;+PQ£¾¿Æâa¥ïh¾/Õö3ìÍ³Ó¬³ }4ÇÄÚÄ#Ëlsß!¼Tþ¿BvjX¾×.J:xoAÿì±Ù9l¨©_%ÞEV­²	aÅ¬4éá.¿"GíÚ@ïs×{9å¤úÝL\`z=@­mùôØR?±kW4¥­_Ô=@ìâHÿ¬b3=Mâ>/þE~ÌZ8ìÝ¤>qsÂVµÌÝõ7ü/Ó>®Ã	R´­Xj´ÌÊ<ÁÕË(W9ìÊU8ÅÓFDzØ®^G¶k¨¥É¸¼ãaÌJF7\`°ëìº®8¨Q6	<&É"ÅëëZæ_"ZF9­$ÀZòíìåì'èòîé%á±¡±é¤"Õ Â8ÙäôÓØu'÷áæ£Ð	âwf:èM¦Ó¡À	H(£>¿B=JÞ_7=@ïáØRG#J¸ÄJÉïNÅt­^biâdUDÖ·$Ý$D÷#y$¬Ì·û^B3\`ïw¯1W·UôýEM´®N~¤'B÷Ì·{·:HO|7øùègPoDçÍ£Ò~S¿®°1ç×bKØcäPr=M¦J¡_	¼yä\`TßÌ^:"Íp+ØÛëÔ^võ=@=J»ÓåPÜ\\Éû-Ù}n¾À¹¶P¾»°0Ø´Ì«³wGsDû5C'k×Ä"üJrüb#ØÒfÿes!G9ðÜ4¿pxéW%Ü»åý¢Ì-%çþ|ää"aßÙÿ¿p5s½»jÕÃ ¹GZ¿p\`Fb¼ÉfC¸_ùÉgCo¸ «idCèåZ(/%Ü°ÙÈÙEüøÙ±_»9s!áäD;WãØ7âUÊr=J4&/¾d4r=MÒlìo?ß)d¾ð¤$=M®áäp,ü]ºGÓSð¬/õÌ[>çé?SoDWW^o£Ö+²)>§)tÙ¹1ÍzÐNwØõôíwõ£!û³McG ÷Þf=@TÑ¿µû'ä@]Úg¸a[>¿¦BwàéÜTo§{U´£G8åü úÿv=}àãýªÈJ°°g¥ÜÁ+sm÷t½ì%8Ç®a2!Ù.oÎ¡á¤üÎ2-äóÖiWÏ7LÁÏço¢¡ÔþUª#7qómÃ«'=}~í©ÜôäÅ\`«ÊÞiÔÊ+äq/[ÃýÈgÉ?'ÉãõSLEÆâ§^W¹\\-$y=}eÅÎÂóRÎw|ÁPïÜÞ)°Í&Øâ®Jwr0=JÀ¬8ÑæJ8v{djüR{|ëxê8^ç4¤ýkU®>¦»µf\\Ó°!|dîelÔÞsg=}=}~qTuå©¬©[ï­§°Wõ=J­bVHÊ¿Ú0ìåCÕW¶³QIË§Zÿ"ïÄyæFSÿè¼|xaíNÄNoUrÙfð´É8QUÝå¼­U¶?»#ó^U]µT£dÄ¯|!NüþÄYtU@7§i<æ$Òh}'^!1ìT»6?Ë+êÒÓ¿5ÂVWIG!¨ÀÃ× =@þ·&VÊ]±>j±³VÎ¯Ôoóö°§Ö÷Xã\\U¥2aï+ä\`+/Þ4ØyNUàO×·èZ/CÝWô­À6©@ÇIn^´qÒ;+ÝðVA³×ÎKGÀña}85]è§Í,SÙÐ©Åå¡tUåCÙ½ÿ¦²ô Z^s¯RV}½§ÏÛVàW¸µß=Mß[§ÁóÀÊYÅ²} ®²g³·²qwÅÇÈÒ'¸×~]­´q]ZsÉðÍ>ø±]ôtlÉùÞÎÖ~ë3Õ²=}=MÎ¶æ°ý²WºÔ.@Zñ¥^=}øùt­a^WYpÐ!(GzJsù¨¯ îJ©»DÈq´7³'9öäJ	lîÀÕ°½Vøuå#h(<q=}(N=@¸ Èø¹j=@Èi#g%°·*'ûå!]ôs\\~pºÑ=MÄ@|D^Y¿N7õ½VL¹ÕÖµôÕô@Üô½8O|<£Åòh®·¥ÂÀP¯!QQò|=MáØnéÄ+ã¤¯cºØ5oPkö1Lª_	d¤á!®è,NyËqÝ<Çf þ@gÿ×{y²t¼A±¾ÍØLÒ-EÛ°;bkÁÂèL¼<~nÎ¤­&ôä­63=J%UÕ²ÆóÃB=}=Mcjß°©¤D\\Ð&vÍÍ1ÜÔ=@æ_×Ðÿ©½8ÞÔJPZì;r_·¢ÍÖãÔ¸û\`ýw÷7ÓåÄ°øÚcÕ[õ@jèRÉ=@¹ìk:\`±óÑaÐµúVuNfjÝdQ8ÊF§ñhW»¡O?®=@G<Ø4²|=JýÌô¹¶ÛBeK¯ï{°J)äzÇ-Z8 oaïa0>tT¿_M=};ô":­ºÅAS[- ´2NÇ1ÊÆLÆ¿ÖK *÷B+=MT4âô´¤®.ATÚ¬jèóâÅbý;Wí¾*iwùÁn+ûßëÎLë=Jf=@r82òý®9aÖÐzÔÒÚRbC\\ïªµ²¾wý»Ð=}Ðsî³OîÖû®¢µ³öX¥ot¬áíR»Óÿ[|Þõ?nWèYtSìß]ÉÒ§RøG°oÑúàvÓ{àøÙ}R¼ÍIeµ\`\\Þ­þÂÏuó¤¼kfàtMìhæâôAÿp<Åp<Ñ§Ãsj%Þ£ÏÏ§8*oÑãmE\\u¨elÄÇP 'Z>Ð;íú'ïÈ×/Ë®WFD_¤Þ§¬RÕÿàí\\D>ïr;.ázF¹Å³Q®ÿiº9ÞÚ=MBm©ËÌÑÙdLÂÔêM¤Äptm¾p»Ìi©©ûÓO·Á¬=}/ÝD¡ßäkv[ËJÌôPÏÍ{ñóªýSâDv'Of=}=@®þ®¼;}.ÏòM{p8ª7p®Ñß¬~ÉÚ µcJbMþ#o¥«ÊUWÿæÖyCÛª:=@mw¶åÒ\`Õ©µ¥Pú6©f­ß8Úþfì=}Û{tJzÑ%b[ÍàWLmí-º¡Ì@oÜ´zgJÎ|Fù+¾k¾ Hâ«YEª)o!0µ&¹l¹d~g'Uìÿ»ÅF¬ÊYedüûÀÝ¤=M/¦iq½2þÂ_qcZÍC{5ÿø^|\\rtß|¯ebÒa:J:ábôJíÛ©u¸®fNPdRÄôi)SzWÖ2r¯Ñi?\`Y ¦3)»+¿²Åº°¿&>ícë3¯Ô2~Ò#wHÿñ#ÉÉnÞá§¨âU)áöh.]Ë¤"¡ñâ¸E%CG¼0;J^Êõ,ý/)>kñCgìð>/¥¿B\\K1kÌq¾ñ;C{â â]ª½lû³Jù®µÅ]Àñ=MLbqþ ¼	#à'ßÇÃú^6<®"Ò+4{óåæH=JLxAG[Õµ®U3±Í	gÄËGÔø=@	¨Eé×X´|MÊ÷¡:{ÈÔòÇ¼H?s4µÏeKä±ÐX97¡tLtwð¨yvØ9í3ÇC8$KkÚø&óéd ¢Eæ(ÇR7á·("å8I|qHP!Ç=MMÝi¢#Y§{½ÉéËí±hÀ=}pèn4eÖ'É±Sò Ée" i#ü(=@(1ëãÎèÜ9¨"À¡^%¢é¨=Ji=M·É{n²Üè/ý;¸ÅAw­qÂ=} 2IÑG©«9'u6¢£:vûÀig'£q2#!êúr(Ñq(óÒñ±vôéÈQÐuFaá7Çé°Iàïµ=JÓÕ±ýüËêk¼ìS#.iÒcr¢%]WyªÏÙI¢å<ñÉb q#Uµ@19}ël#èúä¢Õõ³z£n.9á-Ï=MMøä g}§?âÎ±=M\\ÜßûOöHbâZ­ýæâp/(§ØrA¢zìó÷@­é¼\\¾åY=@&Q=JØÆ¸q\`®)=Mój6ÏÜå·QzdúpãÁwñ>	yÉ6¨ke²uCYÎ^Fv|ºs¶uZ®:õ»a²bæF£½YÐ£íóY<è6Y,~q#8ÞÛËGö6ODHËì¸×ª½9*± ¿ìÂÝ]ì8{{] Bl¶p!M\`äÁ×¸V Àlyå»9¡V¦:WJ¾íëíWd¸JØ»ú*í,x<e 3ëÒü´XAôÚ=}­{F@ÛÝbí²ÄlT =@YVmle àÆ¥uapÓ¥Ý[=M=@¶=@äáE~°·û0! óð<!à£Þçà[ä¶ÀGý¸uJcLÐN.Æ#ÔKÌ/íâsDYNÞ®äË®Í¯²e¬À ÎçCÌááòZæw5¥YÔÏªPÐêý·±\`+·²GjÂ'I8=JÍÔ³d2fehÀòó·Zy>ÐXwÍk%[ÆiÕN#Ç¡×göQ¬¿	×ÌWì&TeÁNâEàfi9ùDýíJÒ¸HGã±½Wàmä]!×¸}-ïDNH¥Jì	K´*­ïMl_í¤lÁ6íy8¯K&MwC 7÷Áoz+rm¶ÜRÄøIæ~òÞìwøÒo=@À±pË:wÖmA&#Ñ­ÇÍna ¸àF¸áöòddibHT#â¿öúû/ÕÄÎÿÏF3GrFû.i¶Mc;:ðÅª|=@öRG¦@N´íÄ:E%Èø¢?Ú¯>±Á8ÌÄ{y¤mÎÍaàÿû¾W)Tj²¼2ØH}Í¡ábÕaù\\do´LûIsÊ¹´(r¼¼Ü@É6¨xû\`-¥­éGíNÛ« º?£·Dt'{vá´û³:ó,Ññ¥Ì:[ÈNq1>O&ÜôÒhÕ=MÚoº6ß59ýoJm)â=JÀfNäw°ÎJ©ÅÅ67³óäSl´ÍGp1*øòB6'Nó|½ÞL_mÂgÐ\`mq´\\nlEáõ§¸è6&¨"pf;y<¤û½Mý£9µ¶]ô0n«>%1ìÅ²Ê{»·»V\\&p£Êw >ü®=@æpG#tÀQvªfT2Õ¸x'H°.·à$ê¥a)QK®hËu=MÁàBKÀD>Düà))­!¦Ö!¼â%Öù¥z~Þy°	¹¨IÙ&(}ùF'iKY)ë1ÿ·íIuøÑX±Ëfâ|Ü½QQÙCú¢i1ûým¸Qi´ÌLB[MÈ´¾AÝÏJän7àXÊänÇ©~Áèu¸Ò4e²Ô«­<ã|®GM¶Ê\`ÓÿsÍ»ÉCH¬ØS=}èØé</àÒXyw5.À	ØÕ½UÒô;xd«G¾Bªï¾¾ÀÕûÕç7éµ*0{=}ÈH¥LSn½JoG.;]é]¯5Ökh.iá½çM&ÒFµóañ6V¨8eÙ«hA'M8÷rdáWR(0/çpixSX=M4þÅ>Ó|B<uXÎÖèÁ­4®Ì°f¸Áf=}%îuß%·aH!CC0À ær9¬¼	®A8r­Í×þ¢ÀWÅóôÅ6"6é­ñOv6ËE:ÂÉO]].¸¯Ø÷¤½_ÜôrK5w»)Ç×Èó$\`m^:,dH']µ\`mÛ×ßìo\`»@­]újàú àHÏvàÝN/ìÅx¡ä0#§P=M)÷û\`ìÐõÜÅw|1e!öÒ3÷úr²ê´÷:4jÈb½SûÓBJXÇ ùÒ§gÅK,\\Æ¿8êô÷üJZg¥PÍÂÝÞEºGüçÅÍp¨&'O«  (_!&Uw(o!x(â¥£s(£!ü&[!Ü\`©$ÏÃ)àçÖøiÌ=@[õ#¦	hÝ0²Ï§úv¨ì\\-ã]®¾åºëãæÃ§$Ì&®õ=@ÂõN_½i=M|Î#<öý=@ÄõXÂÃóXÆó°£õn©N]S¯ºÆ_Ï?]6|ygÅ|ëoÎ(CäÆÌ1õÃ¾\\ÉwSVOä_]Á]ï¦Þx§DÏ 5IÓâv¿b÷Ý/Ñ]ÅÍàwoÖK¬Ú_@áÉ©.@	vd^eÁ÷\\ÓD²·U]Tè±ÝVQª#Ië<Ã^KØ\\õ>öÎç¦¡Ç«xÊÄ«ræ§æ«¹ÿ8´ÿÀ;Æ<æjÓä²ßÌ¢Ââ¶ÏøLHX]Z£@/µÃ|_ä§XÕ÷ÕbJÊ®=@g5U×0Ø,]ÝöÙc×QBGpå«oñ4%âÃ¹K):afm0.N½L=@eê=@Â¶Ýüý\\5fg*ÿþ,Ï*üÇ^õ>J¸´ÊXÇ=MÁ"º*!¡~¿ê[~î005ýóÔ¹)À]7$üÁZÿTV?´ÙörM¬<^Ü¹«8¾tkêÈ\\zz{æ{Zh?³.£fVÖböD8×Ò]¼^ô<v±>ÐÍÀ§ê1nÊ4>c2Sa=}ÛÃ2ì\`Bþ{dî~LD¶¸¼!Õõ´¼Ù=Míyxí¼´¢ntèöìÎþ]V.}xòË-Tîä§õ±^q óOUïÂë5=}ÿâhçzøx©Pê¦zOUtë±">Jx{Ê|¦"\`\`UâYÌçp±{{Í;»CÉÌxÑrA¡ÝÏi}?]Þ¥Á, ýùð çØMRãsHóïÎx"çHµaõ%ÑéN«¯ýÏNÞ\`$¥ì6xSìÑóË<ö\\GÙ1	ûDëÚ6 üE÷S_$Â;Óù¼ÞßóÒÚGx°N¹¡Å j¡~ÃÔ_ÕÓ¼;¢P/ÿÿqkµ¶Ðm7îÔC<KdzòUFÁM7¤=}e0¿Ïª@K±®y¾Ø;Á÷;n+s´/#=JHRðgüÿ·(BÓò}÷í³ûVo æÝ¦Ð\`=JMËÎ@8XGÚ.VtUÎkúü?ûç³%29@	=J¢©ëçº´Æ·¡xª\\D[Ë*qqeé0)Á\\)\`Qk{ë0=}WSsnô×UvÀ«G^ÛÎdý¥SÚ¨ºyxß+Î\`:{9tº\`Ök»_Fÿ=}Ä\`8yD=}Ô¾)½Q©Þ'ù'ý=MÁÙÅq8¡ùã1=}_À-oygyÆÄd½/Á	$åyÆÝH|Éü­ØUIÇå&!h»Áùö÷ø(I£F"ÀXJM9ûì¦NÉè£&{ÄzÅÇÿÎÞ<ÙÃ¥n<HuÔVD q/"¨Ø·¾ëéÅö®\`öÛÌÍ©dg«¿i)=@©³²_;±E_ Æ,\\"ØÚ;R#=J¦bÔçÉÓ!R~øçr	\`.\`X9Qêùgäpñäd·Mÿn¨ôHOµpIQ×÷÷tµl+\`áX Æc35^=@éõqè%ÄÁù¨=MùÎÝXY©á¡#ñ	&®H¥ôW]í¡Dò1*D2Î#ÃÞ À>þlnå¡sø	ÅÑ¨ÂÞ¨é&Å!+Àõ)"ï)Ëc REÊ×®kJøÎûISÿ¹0Äwå=}¤v=@a3_|bQwê*öÊ6Å¸!¿31«øãÙÎ«TÀ§¨q\`fM'Õ°úªÞ]ß¤éIöj·Ù\\§è3WgÙª°Dó&d©Ññî¸PóÈ&¹X?§r¼5ù3ÂÕÞÞuÒÐ^àQ=}D?°S°YÄýý=}>¬$&ûÓn×ýý½^E¶ÜL?â=JÍñ¨­TêYI|â;BD³misËéõÙ§"ÌµX#%)&±6·)ea¢§ÜE$ß\\Ðþ&¶z1m\`uÂ4ÃÅË0÷t©®3gâW_´mÔZ.ljT!þÆB7^öqÈÒ=}pàUn(r|ØIë³ôÉ¿°=Mq	S¶=MÀ\\WzÜ§½dpÔ=MßW´æE{Xib,ÝÊ oÍ §^Ã-wÏKâxF	GPp÷6Ä>ÿv¼gEÒ÷ÕZs¢Ý#IÆÜ.mQÆFîaá9Qé¶0´Ú§¦ôh	êË=@àYµºÈ¤%F«5¹åÙ>&T×=}%.s¾9z4>áíÅ;¯Æm´NÄj2ýX,0·Än6x¥ôÂ´{­fC÷*ñs\\¾êK\\éìSë½Öøð°X×Cýë[wL?ò.ë=JzÒ]Gdp4Ò²~	÷èÏ_ñ®×.ýÆ*=Móì®DDL¶{Ûb·\`F½lÆ}w}KÐQvt[Þ¶þ¼¾p5ð[v4O>Öt«Ã¬¿Báxë´ÎxëÔ®¬¿{ÚÌrÙ?Ë¸îÉ>ÖvK3ÂÄ=}4aÏc_ù3[8êRdÛüS÷£#À½óÄÉÚ3pGo~Ü2ý&¤¶ ¨ùÑ·ý\\§Üö5ÌUØ:uAPjÐr:aË¹jmº¯#¾rNRìîc&x¤}Éô¹©ÙÎD,a_ÿ·è½Ûä»sÞq>*çÅÄÈ¶*wÉj{Ä\`Øwü6þÄºü{XÄeµüÞV×<cª×ýc½ÐÃjÝôÅ¼¯s½0dîz»¡$cÅ=}òGxj@Lxê±gxºþ÷³Ìmø>Sí ÆzIÆL9å=}âÆx»|þ«"r	µÄZóö¹ýQ]4£EÍË\`a·ìÁÓÅqrÂXÆB<r¥6}ùBögéo\`à¤fçEÅOÃNpoñX¾vÝ´K²uF}E2$ÃåÀN~.3|ý×Ñ_¤èÈÉí¶¬9s=}E3ÚÕüìTfÞS=J21KûEðXÐ¿¾ÙûpÔZuäV¹Ï3rßïóßÞAïÞ¾Ö+=}rgr%A=J+à×P"G©<4\`'qsðÜ´ÊpA®¾Ñrütµ^5Cç2ÝÈÉõá-locì\`Ú¿\`Ú|øþ\\Ç1I¢UVq¿=@Ãbê2_wñM¬Cô²=@£ºä7U7ðÂÓÐ5§bïrNìÌö«ä»º7[,ER=}0^uÏùMo"oDñc*×RdÄ=MA	ÏýTæê	®Ø ¶In~[<Û=M¾{µJâÆ¦ÜÄ²DºÅ" ÎHj2ãó=J}+£úÔs»ÕßÆ\`ÊÇÂ]#Q{£_¹¨·×´ü#Ïeq9&%:Ó=JÖ¼re#ußUäGr¥uYFwÃýP4=M]gô´>_´4ÿLe:¤A>þÕø<¡7¼Ä_!ÖJ2Eµ·&¤¶ZÄÁ<Sù$Æºõ)#Ø^-ýð7ñ ¸:±oÉXq^Á©OB¿"©gU¤UgggUT$²ô´??´?O[mzyßoÜ¬^°7)VýRðß0*÷{ÓÊ¹o:VA\\Ó³ïDX°óÚÀ=JHKr¶¯¹¿ïñ-×0b!úBVh:=}_0d]×¾3ä:î¡÷ZmõåâÑ+ô«Ã7Þ0h«É¸­0æp]lë[88­qþm9hÇvR_bü¥=}u:G6=@7I7±<Y¯­9þ[Ä°Cª!ÄáÏgôR²QaJ(@kÿB>bc=JrPÐìJN8×tET±<\`úz@lòÅg½UGÌ#Æ8÷0ÂJ7÷Ce¡ýwî1@>¼)(¤Ì21¡9QöÕ«ÞöÄ¾ÂDªO7ºÚäH(g\\]G(Äé4¹3Ú7­?UÒ^Ðm½*ÏX+rX[Z­%êdßPé=@8Û¸DüZÑkY=Mw.733B{àÝd^ª *º+CÌôD=JDó.ì[RêdJ¾´hÛaôúÀ¬Bq	ÄÂ6Ò¦}õÜ(îëÊ÷­+à½m;ößr:~Ë,½¼¼É9´c4=MMêì0±-Çq5$Àü	Ã:ÚýY5\`[|44ÎAïØ¥ÏÚW7½.3ÕÛ±À.C=}¼¦|T;·5HÀbbÊå¯^3ïhÒÄp«ìêºàwÞ%nkî5OÜaÔÊ8Üx9ä·îïÞtá¶û7ò3üX½ü¡Õ$Ð§ÐHjMF³äl~ÿ© ZWÓ>*9I¥2O&³üL»×mªF_¥zW°ÚxïjåÖ=@^ÝB´]Xõo°imu}ü6Qk¯ÊzÉÚpoVâó>³¦<¥|´kfÎ].§XM>LJïÌDJ·õôLJèàêD¡UIíÞvDÞ:AO7¾3Vö¾j1dAN^d=@ÁN7u=}Hõôq_îÌ¶~ÙþØ÷Úo¦|­CëJ*tfrÍ+yn'}»:>èoD¬	Üèñh%7é7Îx.é#mïÑ8ß0R¢ZGzò¼lÍbÚ¨ÿiæ(ûí±ð=Jç¯y(>d;e¿e?.À;E% ³Ër³?b«§K_öë¹<7ó/tý´1û®üã~óÛ¦÷¶Ë¤ü½	¬7T!Û°'}]¸}75p4}¦H([Ñb@0&ßGÏlJZE¾xIì©f{æ³Ö´¼ý±ÔÊ¬T¤v´#ü´=M×¼DÇ¤À.ZÌpùÝ½ÛÔ{ÕßºízÙ$¶sbD-ÔÅtáÅw´«ÙÝ§¼²$HnHÔzá*Ü6w\`ß÷Ð1*?ü¶7¡Ê7EyciHÕV@ðª(föáè&\`â¢0iÌGíðW#¢=@x"s~PÈMÏÇñÿdý#°9ÒÇµ~ô~]5¥B{&Àí!ÙfÆ\\¹@*s8ÎIéé_zzjÊ5Y|B7MÖ BUv*\`Òïn-¹n=M1¦wLÍ¾|tÁØs#¦ô/A\`óê¸eZËür¡+öÀa´½ùÏý}¥aK¾^Åk¯Àz;"_ÿÄ¯¤:QÚÞcP­Tº*V;®Fî&¼jj~¿¾Ãt.¯m?W%:þ®K=M%Ö3í¸ÆÕÊà´dj©t´0;ëb:ßúðJ¢ç;7FþÖÛÊË£Z[aü¹ÙDüXüë2láÅÇ·6õ3û¾L?b£>ú<Óºá·ÎÄlÃ/vÝ&TÜìÌHÜH¹ÖíýÙkÎãY¦7ìÍù6§z0Z+×¶@UL©ÍC-åp(uUµhãÞÈEYòº«¾Ò=JcrÎK:æ7¿CP5Í8d>ó>]&'n¹vm5ÛX5Ø\`Ý²½ÀY®£²@¨Õ4\\~	/#&ñmaB¼=}·XD²Þ tÝÕ/¬òÁÿSÜ&:Y1=M^1·iH?W}§è\` X«A7;3mÕlÕ°ûEê%rÆ6Õ=J\\¥¶r´Xò<\`6ÉlÝdwS|^4ãGµ:,ª]ÿÎR#å~]GþË¡CW,gòùBG)T6]ýÅ°§])x5:Hf³'(ç\`­_ÃÑEçOq÷ÄhÊ+©ùWKÕÐ\`¸Ì&»¥O@Gq¥ò9¼ð¢¤Ñ¾tmØªwAõÞZÅ¼k¯¥NÅÔ*G@¾aÿ|è²\\±ÓbaRÎþfW}}ÂÒÀ5F´ºK:ìø~ÑÊV=M=M»ûpHÈÛ@=JlÈfÆ+üÃK@¬dßÎI1Áqþ[v0Å/p1ËÌâ×Z	»1#(YKÄòä'ÓFéßû³YXDôí´Â3Gq=@Ï=}Y­,ud^\`á³¾_TóÆ@«;ùR»õÈiC&À=@Zv=M0ÂvÂí«óà~ló[nÍjz¿¸Þ]¶=@ÃîVíÛâÙraM»éµSµ¡qB§ÿÐu1ÔºÊ	Jbæ'+Ìè5¶DmSñw¸¾þëóFb~£-óõÍ­àCýj\\^5wªû\\J%^º{ôç¥Wº×ÄyáyÃ+º)ê-ý}öQÄ.WÌ­!°ÅÌ1þF<øË<å\`mà9eg¹µSÄ¼\`ÙùvL9¢8vEÍ!àmv[ð¦=Mã»UºtÜ2ïb9<}#å\\Á=@T¥¸=}³bYe~ÆÂíMm²ôï8xv  ûG\\r°Jl\`5ø|E³Á£[Îû4Ý ü»jgÎBÈ!öI¢ö	UçXó±!É)(º¹Á^ð¯æ	¯F">!ñ÷ãâmð+ziÜí?1ï4úê-â«=M;Ý*!Ñ/ÿIÁÁßû]©ÑêÛY.XcKÀðE°G£Þl¢m×"Q^<1ÉúrýAbRï+oM)=}ÔÞã°ÔBK ¯;ôÑQÇ{(YÜZ^0æcÞëþêC®­¨gq¹_>Å[LÚ£(ê©\\æ2Cíx]I÷(hBçzxÌð@°>àß9¯p½d4ÑÕZ4¥9»\`¯ÏkLÂ&Ü~¿ÆÊ	Á~"	ãtÔÍ#ÜáætîkrÃ8´myòG«â§'«½@ÊÛ09å0Åªµt9(¿·©8ÊævE"J±_)ºÀsnGP«AÿÚwÍ°-àÏÃiZnTeBÁßê°HÍgÊ=}Eß ¸#/*]6Õrl=@e;/*«Õoxæ[L­	3*ñDñ\\<ÉÌ¤pÉXO©­¼×Ëaz¦ÿåäé!¼1m¢HÜºDó®£~jc»1z=MNÞSda	úæ¿=M4.¸UºaF,/\\"$µ	à»2¾¦ÍF¹öy4¼ô¸ãÎ8CN^cZïskÛó¯	L\\=@JpOfÌåbN}¤ïe3Ëjr½õ¥e¾pèñ]:Æ¹>.MY¤êÀ¶»Û=J5ô¿ë²ÕKÛ=M(n¸Æ »ÁÃÓôÂ­dÝÅª¡«Gí³*¸vÞ_Â»8=@øð¡Ý ¥æ.±Á¯Z¯aV¡/µTË2Ìø2(Âcç*ÇCCîKôÞ6L_±RgðÜ.H0Gé²/XÕäÆ>Æ ¥Ãç^í1ìWööoB×[pÐ¼é7\`,£µ2-µ'äòðlè¶ì:)òÒUõNÞTÆHBÁ&æ"rÊP8?Ë¤^¤jækjeä­×Ùµ¾$ôxÇ	jÍÈÀ·Hºô72½âÏ	¼ÚÃC\\vn±ó©Ö=JúXÀÎÄÐ#ñ$bWFú¦3=}AÚ=Jì2Àhø9>\\.	ål"B ØA¢u<]Ö|HuÀuDaÆDw;5]¢CèÌ3Qï2³*cÎó;uv4ÝøÑ±/¡3ïV]ûä;úxR¬¤O¸¼=}g*)<=}ÄÁ²Ü×ßEbæÿÿ»ãdúÃÍ1cßàhdff]¼ÇyM7&¸É1ÛQîJÅziwàÑò°0á¡=J¦ÒOµÎ'zÑ5ðÓn÷ÝAx´«¶p|¼A/Ö_gL h?*ïQ^×tm¶Pê¯)­-ÜÈÏèu&Mã|½FÓCéô³ÃSýW×¦·&K}?ÅÒÒ&öz)°O Gb@ê$ôsÂFh*jdK¹~~,èvF]gG·õá»EÜ²»|q<^-{]Zhßï«Üí«Ü3RUbÐì*&x±ìû¾òØ¡.ØnÊgLp1¤+fNñü(¹îDWÖqóíÀ·¬Ã/¹OÅ}D?[ÀAü<.¸¦qÇêA  ÆtÐ÷WzÒ âCQµáBÑz²]Á¸è=@u,mî÷¯þÐJÜó¼ÁÃ(ÝMLäÇ·¾d<ÏÇÜ&ØyÚ=M9ÑPeËþÁGÉicôeLSÇÜ°£ËJU¿J7ó¾&~Çaw7	Ñ=}ëé":­¦³òÏ8L÷A|1»Ú/ÉíkùLbÇÑbû'sGn Xb²Öò£ f·áqãÕä¡»µ¼@n{|Ñgüñ7l¨@vï!ä³ön&t=Md¢Qdá\`¿ì×7Æ¤íË¹o¶Gù£¸ìu¦nì\\óêc³¸lÖãÜHlæÖ­âáè®H&M%î5ò>Ñµ¯åûVU*#K>údá|l¨¹~"Às¸¸ZÎ¾ñ@Ëwäñ&DðvV÷3³P(á=MÕÃ!®ãk¾!]o³¡ñy÷%=JCì×ò)ÊÁÓL%gÀ Þ¯M¸s)2MË:mL¿LÑdÚ¨;uIc[{þ1ÜîBö[ÆUr,$BLR:Å Ö3B2c¾gkÄ\`ºPÜ(»g?÷$Ý8\`ñò×FcåùÝ^¿ÌaÐ¬¤¾ÞE{Ô ÅõîaßÓ\\ý?&Ô|÷T).U²ÏRr¼_ÿÛÞ§°¼68c²yyVúLcîÆ©=@¯Y½÷I;õPÛ\`x1#î8ÄQ¦b^ÁÌ^¯Êþó\`Z¾È/ÆÂÝû¡u.ÅÑyÏbiÈ=}PÄ8ÄéùÝF ô'Ð&úõö=@b§»ôcl%BCê{KÉ°°¨¾ùÐã.*%a×rª¦À~a:*»4-2}­J^×¿ÿ%UGÿ­v¼NfÎ\\üòo¡ÅÙÒçp²<©_~íR@/&E¶d?§2WÄQPÆcÄ1Pó§EdôäÃÁÿÍÜlFâ´ü6p=}qÖd.¨mKZ>Ù+0Gò)Rñ´Ï^PO ½êçuî¥«nâÀì!oúLÍÊs¥ZL]sXLÍBFOL­03&Öq,$uµ0±Á·	\`WîóÇæ^óñEY¥oó¥Ã,q¾ÏG]Û?^3!Úbfmõ^W[zõ{å&$hLã7¿¿ÞGàÀ.e,¬Fíy¹õaä¨¢äº°ítWÑ|ø¡FiÝucÑÄr¥%8±4ç¸¸¤&'úÉøÇ5>(¸7KéòQYUó«ÉG6cÖ:+Á¤ùiLµçG¾fS=JÀñOÑFÐ#Zq´sïc+n "ÇÐð=JøÈ8âð¸8}n¸HñòW{Òz>*ÁÆÅWB=M;j·ñSøÆáíÆ¹èX4ÖxÁfBï.xð[nhYh«åÿÚWË»Þ´Mw4lº61uð1ÅðéÇcR>-¶9sÀºy¾#>T#GuYâ¼P_$¥ù¢&ÇúÜÀ¾s9ÝçÒ´yôùHùùhV¡y6%öÀ¦õ ,Wùí¸ÑÕ9^Ô¹=M)Ì$OßÞhée(g¼¥¤Úxµ!¤I¹O=}$ÚñÞäÑ-m5ÕT~ñYc(F¬Â¾ÿ³77ü{\`Z;iÝü|lð©,õÉeúY\`,gÖãÿëçø±d3=@ñ¨dT£È4~lWYâ,óS¦Qo| Þ¬M?îoGïÍEðÃ¹a]´nlË=MSÄÚ÷XÅÆ]ªóåµ"\`Ñ*P±­^D¨tÊVø =MªLo£^²&úõ¢mÙf0/@N,Ü­Þ¿¥.Mãùò^ÕÅ÷ÖLÅo\`éño ÃÓØ?°C_[¾N¦!åðáêÛ%ò&ÃºüÖmí¨{ú//4ö.n=@\`5ÆÝÆ%ÖôgÙÓÃ³«¯$én ^_5åbp~P}_ê^[Äê<^V«D/=}ëOjÛBSdzÊÜlâU·Äó­Íëv\\¤Fo=}Áe0Ñ¦QÝÅ=@Q@üçì8µådí_üõÙÂYS­UVO­&ä=@?àDMe¢Æégz}ÿÀ<%¾cé§Øáy¦ÜØ³Þ*²$êV&?Æ·såÇÙäÊþ6Oü=M=MdA{w]!{áäRÇ#ph±µ\\¹ÚCº%Ò¾¯"@=Jh4¾ÌöCçPh8AÏ=MeÅ÷0qÝRåÞl}/i<d%±Ï¢­yëXlYIm{Öo·h¡+¶o$ÒµP~íÍ @7áÒ=@QhÁ´ÜÒÿ=@½h4YØ½£évÔ S(\\B8°ÆG¢é y>&Æ²é³íLc\\ÖÎ844³ÁRÅ6¢}PoÒù±ÆÚ+×8§Leî*	¸<²½4ÆPÂÅµV;ÙqÐ¢Ì±2r¼ÿh@»Òod@þq¡=Jmc[kv¸bQ §ØÙ±B©¦,}½ýµNNx,Ì}­êWÏHzt¬¥¾»Ów[æ¨1ÆÎÆ´bõoËL»åí{§Óò1e ujÐÌæy§ÿçî9#º"½^{(´Á!XZ¡?!HÉ"H)"@rK#±[¡7Ûê%4Â[=M¡Of5q±ñ2«J~IVö9æuâþ¨òtÍ?9s uö}ïý|bäê^º©7äüÎ¹eRÿ.ËuÚ¡}&U%¦÷Rá¶!)ìªÄðÜ¸«]qü2ZÐÇ2=M\\_wö<ÞÓÛ¤ååeRWb:ÈLÞ¼çe4Kd(k+­.M¯n&JIb\\@La)gîÐSÉFk1ocÃºÉÞE-¥1acbÜå§üã®ë#2è@ÆÂ¢1FÁê eeXæÊ=Jpo a>YR@F	º$ö93t¥÷ì¥7ø[*|Ô	?ã,Ã¯?#¾µ»=M>Ã¹õGµf¾÷³4 =Mª{>xp6dîe VÁ4=@ãÚË¶#¯Qý}"ÚZyÐáÌ|¡³÷3ð¬=}?5(wNZy_rW@£#¥ÔSÌÝÛäþãWÜ{â®4ö¼°À0²^¥*ß[­XÂ»DµPJ¯§ÞGlõ÷[´¿âdÿ±P0Gðêc³ô¹²d[wíð7³lÐ3GÐU°¸y=J¬êsu%¦¹«nn¿Óä¢çã¦kW=@áÙô,æ\\G7·Í¸@G=MÇ¶ÖX.¶F4=JËÍ­µBS&á¥­ÕjçÒµ_¢´ËÙ@$BèVî¯=@Í=@\`³Zûmtû!deÅYU=J=@×à§iÐ§EW+@Ï ú¦#?ì»¾¡3§Ù9S%EÏõ]TÔ¤Q²ßJ"Ì	è	Ã5ÿ.®ôÎ\`+?-MynìoéáG(Ò	°¾'xHÏ	Ì=Jm'X¼öàúd¨;Dïû¶XÏäðV¡÷tÒå=MRäÜm	·±ÕÍ«Ór±y>8¥ç&þsø·këtYRå7;YüÌ¬é7¸lÉÞ51[¿ÂkÍÒÒIÌ·ë[­æm¥Ð3§9[zaÃi¸õ:3 Ðñ<rdlNÚO°¾ÌI´¯ºäOQô¿ßqçÃêjðe6ù>×µÿTàSO½ô!Í#¶ÿÇ¢HÄ=JÈ|¶=}´@iîH| v½UºÉQ;Üc(s!XEÍñÂý·Ä¤Õ¶vÏ@°ÿ4g:ÄãKÅNÙUÎCzë8ð"\\¬±é"§Frÿý8ê­­ÙÞk}ÍãäüÐÅaDè'ÇaäpøõwAü^Å\\DåÒ«ã®GãJÚ=MnFiýXhÔf¬¢bÊÂ'×Êß5´=Jbð=M×X­Å¸MãrU£Ö»Ñqi·5l8|D\\¶üq#ÆÜÛívíÐdÍÉ¿å?ÆÉÄn>Ó²xX2wýá;:¶4êÍ¦r~P¬º¯W¤bñÐõÿNßÿxÁªÃdø\`®oqÿÖxI^I]í(æÒÃ\\	Z8@{aZµFJ=@/U¾¯]_tåóËdÓ1¿yd?öânêÂW²ÀUùmôºU5ät@ìµ¤RGÃï·FÑÞ²âyàDY¯ÞùÄ6>"®ÉÑy×0w7|F<Å$ç×è|E=}Ì9Ce!Ï³vßè×yP®¢·07ùð|HÀ]ZÐz\`òæTg(yv&KÐðA\\ö´q@½ãµè»ï	)ÚË¬xå®$ÀXK,@WËè <¥kuòÕª3çªO}­5=}Â_\\áìÿyI Ë¼shÂaûòÊ^«yý¾(ÏwK{}ëÄü)ÆwÛO+ý./O¦:øI£yHøtùÇÚÈÂVÀ¬»WÌë}áã&^ÎSå×owoÌ5A{Ñ¾ôÔýíãIÉo{h¤Ú6÷&"'}EÉÒÉ	'}J¹qNãÁÊÐÐýM5¡ù«²Í UbmqP¾HnF"g5m¦¨Æç±ÐX©äúëý8ÐÇÖï0ö·)¨åÂ»ÁÎäQÍÙ¢C:· Qmsº;H9WýJV-G«±øÚu³ðÜgt HBä8Y6/ÏÂÐ¾"¿ÔÕ6yÇÄOý¼§êúÒ-HÕ-PÐù­ÿ%ù²ÿ©üXiýXÇX.VÄXÄ!ä^úXvA<£èL9Yìº'«ßÅÑÍ$©ù@Þ;z'Þ2Ò¨.®u9KÊô¢×¼Þ³éJÝäÈ§f#G¬S)8K{±hå8Óh¡±^©ì8Ó²A¶²µÈê%òªcfÊshúËGÖ=@¾Èï{³PkW_Y¥âìsË1fG¢vÕÓûÁ=@Ó§Ð5qàÜâ~éô7ùøãÎ<Â¡þnï¦agøÓEOÏÅ	ÆÓÊRS>ò¶@O,y=}¥®¶*0çø§_c²´Êyª8Ç1#Ðx£#©úéÅgS¸#\\wW÷: ô6úÃ° åDG? W®i<øbi(¨ï"{/ô'È|ÆWNpÈBÆg-×±¬W¤y8N»VäRB}8%=J$g§ô¨ßg\\{ÀAö?Øô£G/±Ä3æPß_Õµ¨ê¸ðó)¬´ÇZ¿dTeÂKÉ®¬sp#@ï¼ïZà,PC@ZËþZ sZ°QøÄÝ7}Í'¼ù~L!Ke´ºöG.éýM;ëO'¾}w1¹î¥ØÃ X¥U´fß7køïI<KÇ£>zá¹¬N¨>¤øf4gGWp±òb=MRrÐ7¿±e]¬«û+##=J¾|+Ñ^lfÆ°Ýå-x¦èBÆó¹+Q®Öë! A=JçBøAh­ÀöøCþcÕÉ©0Ã¨ð$ê#}Åª}ðRÒG Ø)ý{íÜ)z­æbðÜPPRÉs_Å¹½é¸íîðÂ3<h2=}©³@Tk¢D"E	CPðÔ\`Wd OIì¯¼²ÑËÇü½¦|*Ö!q9l½³Ú\`e¸û&"¡íði|ú²!bIHøéç{äT0T/ÅSU>åNi+Êc;ÐÐ°»=}RCYÄìgÑø<FßÓ5³û÷äS*ñ oì²VK^Z·\`êÎÜk¿\`zfXByaµ5ânwBëÄ³Xöö<õfÂxõf]ÄÙ´jÀBûY÷kY_M®¯û±r¼Q~×ÌÙnòjÇGÆÍHUXdfÓu£÷òßu¯KüºÖÇÆ©WMxÀÀÀ\`6HgüfiºÆ¸q¡ßAæ¦ n÷¥ ]UÑø"EüJÉ9GZæÅ]tOé-k([ÕöÏtë&^ Ô KÞn £UåýþÆËpE$(èTLä»Wy%¸>Á²ôâüå¢-+D,æµ¡èV$ßkðj¼º"ìÊ,åýÅø@Éø@ñj ²øTÖ*Äzaßu3¸Ã{/»ÊâöfzWaå\`Xë;#î^±nüÝ]é5ö7hÆvçïøçjW=@aæcÇ¤ãCXµ¾øåeàÒx,¤÷ÆPXG>÷ÙýsÇRåuÄºÎó¹®½Í êKreÒÃ=MÂ ¤8¹¢-ãy¶AÕ¹¶	XVçÜÿZñ°«wûò;ÝåbwqÆ2L{ºZ×Â¢hjzlwí=}»£Øº\\'ò£P ³y3Gi	ïwãê" ¯¢©u½ìíÕ	´uà¨Zµi»lrYÔÀ Ió¼O\\Â«ý&óÔø´(DVN8ÏÖ¤2 ²òCWÙà$ÒXçâòàçåæôéµ}ÿøÓäUÕàçç$!qJ3§¿ý£ê¥iSù!µ©Ù×_Ø¶Fé5Ao÷Qà9÷_Nëh%8§Ú©Î'ä¦($®SeäB2«¥ÓÔhsK³ñâ¶ô§àHèéÇåGp[!½(íò-¯®~Á¯Óù à©¦?ÙÇ&F¸ä¨'³ùø§!ÉÇÿ\`ù(ia(}çèOä(påJó	%÷Qh QDÖ©ÿzEvåÒºä^Ø\`©R×©i3ovÉ©ïoc©ö0=M(%á'Rè)ÇWäúÉíi¨õ6ÐlÖ=J=M@q¯[$ÎÝáÆ+µÕ\\áýÉÀyUw¦wÕ¹8+¾wÞMäø«öÄ\`C ÁÆY¥G­JB¥ '$¿UÃ65©­æÜÍvÔÑ_k%hßéN 0Kyhm=Jâ¦À$¾Ù©Õ6j|QÄPQã|³ñge=M=MâÔÀ/çÏ¿ùLÜñe¥Gú*Òv¤/PÙF÷ýÄ2¦(Vf3Níøøqg=MPA¦½¸^®ÖCÝI Yù¸R¶ÏÜÇIæ(Á|dhµ9ö;dà)ÎB)¥&m¹$·wä¸§]#QH¨¾3Ü(Yù#'ûÅ$^iêøyè»åáç&p'%6Ë!»Xu(ú1wYéiT&KJ	´ÅoÔ·3ÖI>g=JdO&xüÄ¨¦ëkûÇL{ï±Âª<5+@ ÿbá>è=J2^¾oI^Wu=}åÇ7xÞÿªhqè H\\ÑÝ®AÆE=J'E7IáO\`pÛDHùA&ÐÍUî Ü] I}ÐìRr-4Ï8f¹¸?ä¾PMã>UòìôRq^föröøØYú¹5öAàÔ¥ÁÿË­¹A?I:ó¹f þ(}ÈÔ#f=JiÔ%'oÉÌÉÑ§*Å¼i=MÔ}$ý80rf÷"òÐ¹÷lÀQg¤Æù¯-1QÐt=J\`=}^ÝÞ²-ÍÈARG:©´ôR$ gµæyüÎ}°°äLc°cÂaLËKÁ"¥ôªø¾µ]ì'í¸ÞÝfü;Q1C=MÃ&9¨õæmd&²·Ó/îfö:Í>FS¼UIÙ@dwP/ßzÐnág=@ÒÐ× ¨êèÕg­=M í÷-!AÎÙMµûc å·û!Ì#OÁïÐh!ÎgíÞ»MGc¢¡2:Êºhh°¢¿ò¤Çû=}ñ)]1<{@'EçfÙ¿öcôÂ4b ~6¾]ZTÂ("[ÑÓÊ^ðæéGªÂqÿ,{LaÓ"4¤¸íz²¯UÉVFø%z²÷5A.SÀÓHnå¦Úá½+áÓú	,{*ùÔud]í7oÊµL"ÂALmL¨8÷2¡y,ñ÷é¦¤~§\\ÆRþÄ®EÃEÜÂ.°U ª¨qïXt¡ý[TÀþ}µã=@<µùlë"HaLl³<IÕÈàPÌH]Ï+å3MöóÈ¸=}^ÙÑY¥rÜaÃøÞecÃìÁÇ¹Î¹uwèØ»ÎuÄ×G3R³#tu3%dSuRË¸ª=@uF·_:÷Ò¦ãX»¯ý Ë¯0?TøHAÂg¾#òm'ïYó9v½=}u·+zA[¼ÇM8o°þ÷ñÚ+Ðé£ù&ÏsdÅMùwUÝÈ{ìÿê+©MØKhÈ)ë	ÇSÅßûÉh(uÞãÞy;ÀÀo:òÕÀ)½¡§ÚFRãFEÅæ¶¤¢o,m83ä¤Ø|2ñ\`í0ÅirM;>RË;µòUak¹cç8äïð¨+1ÃHûD£´çIä2îáÁÅèS<@W^ÏÅ;aùÄ J½Øð_ãêçgÆét?{âS%áóêíh\`gà,N*­ÁöÇì;Hü""=Jf0ããÜz¥]ßUÅnV{y3LÁÎYöâ79¯!ÞÑ¤	øËèFoÖýª$e¡GXÆLgùÓGW}²¨øùVb}[¹Wù··õ=J-Í5\\Õ¸XÏö¥ûcõ7Õ\\îT=M	'èÜã#aüä!¥©ÇÉ¦ÑµíM³N[¥´¤8 e/L¡=}ÂÙ=@þ'Q©)¹\`S©lñæ	|×@EÕ4	66"¤\`ùËøf´éâø7 bÇaÊ\`2:BEz(äcJEãî7á$ßzVïXCvð{DÊqtÅ9)¦3'½~s#Zb×:8m¤&9UýíA¿YsNY¯ð÷Ë=MH\\¥é´öS<iÂÙüþ'=M²ñmü3¸ÞÏ}ç¤ÁñÀg#¤WRýAYÒd54óHºT¯g¬óâW=J,?²?(iÅÎÄ"UÁ¥Ò6Å(xzÕ6uÛqûgü÷î{ýï¹zËãoÆãsL%8!÷0yÆÉ6u9ðòG83ZÑUéÔÖ>LfØ9ý4¼ßSáµÏ2eT³ãÊS=J¼¬°w×_¡Éc¾Z=}ùD¡1ù|$~¥ÈìÂÕßËxäüý¥ýTÝßµB#Hg?§>äå=@VØ[=MÙÆBYw¸(>ð#>¶çñ£qQm¯ÝåCµoA*BÉøÉHÓï®ÙE4KïºÝºåÜöÆñõeãùDl "X·dmR±ªÇûÚuAÄI¼ùý²'Mé¥)àÃ&<'«rbàÜe·'/» Îc/ÞAÀiëäZ£FêFæ>ÇäEö¾«à=}Ç,'6=}Hö£·;>ÓÑËyoÚlÉ¤Ä?ºd£Gî«ëÉÖÄS«Å\`lphÙP6#Q1f\`(ò74Í´ï«!Gå+5Ñl¹ 7²|±#/(mÆ%ûXÅ!	V&Iã!í£q{ôéMl!"Þ}TU¿Tá?¤û6³¸I¢5K©ñ°&Fzû.Pê'y]å~uÓ­ûÇÎà\`£¦=MåQOLÇ³LO×Oªx=}£»äßGÍ¦ç~¨-ÄÚ}[áï¹»1#Ù©¡_íqÇ½ñ~5cî®²©föIâª´,ð\\æE'>Ë$'7JP9?Èb¦½ÞOÅ;§­K=@·.KÆßã=}=}Ðîüß¥]lØañu,§«çã¹hÒî¥) û%üµüµ@±AßÕaïâÌÁï¹ó»BwÇñçõªHaV\\ RÜëDÛ X=J&	*(2eßH6¥ÿ¢{äa'o¹¦máË#xþÏËèlôÐ+	\\úÕÔ<M=MJ.1qxá:öîÿ Z­MåA\\b.Æ;¢£\\7ibÉîâ¿Û° ¾1mGÕzÉãßÃ'¦{î#kü=JâXJ®Ôp-K¶]OñdZì&ýeÿÖíÉaÍÈ3m-h¼Ol¡Å¡ëÛ[Þæê1#	 ±I«×·­ÍÓÏ}/EãõÀ×M½Þe9Æ}õ¾nP¸0	2Ø&Sk­kÅÉþ%¨!(a¤i=JoWúµj#îcµ~y¦7iK¸¹X\\ëúêÝ=JGó5=}M\`XºEÍEæ7ï4æ»òßX¦*¥ ÎöxÕù×q¬¸À´)&/b­_o¹-Ó¹Õ ÃÚ]\\7];²=JØïÒ,9MÕSì$ý¿fÛõ&§|x\`T÷DÈÇ|*/w\`TòP^µ9Î[h"ü5QPAÄÑôZcàÓ5ÞT¡*wÄF3Z3ÉÝÇ;¥Ë*Ä<·äF*ÏÖ pÁ¥pgÏGäÄµÓmù¯M"õæú[áà¬¤ÎÍ¥Õæªú°ev_òþÀÏËGð5±÷°ÏYPYçÜ´»Û#ìcõ§ÈOV8°ªi[L<ÅÔ»ÿÒ#³´Ú:Ç{Py 8R)1£öÿn«J6ØNrÍ|ÞÏÆ=J1å\\³èÚ¤TDdáé|Óµ©Û¨ä" i ÛÏ|zT¡¯XSÜò²õwÃÚº\`ïQ-ÛÆÒ|Ás¤çº=JÓL+fjÁª8£Í-Ø§<Z$ªÆ.ÒÂåâz¡SMx$¹ê{ÈÀÁyÚQµ8ÐÁ(À© ã»e·Äí\\~ûYØû(ñxåæ«ß])äoìÕ¡Þÿ³r]báÂmæÏÝ\`@û})Í ×/\\ñ¶ÃåOOyô ?¢SsTêÚý\\l»]o£=Jå+¯îà=};îÝÀéäNº£ /E0æÉõ}ðrÈAáÈé[¨ú¸NçzHsÌóm¢iù7ÄèÀù%!¿ië*ä"£ðoNÆJù!#b½Ø®ø~ÖeVzÚ!$HhÞ¨~a{ýXñ·TÓ6èÚ¼&ïb£w¡tó÷MF©Ñ|^=MººâIÈÅiÃÀ)jáx÷gì!lß)ðã1!)h§Q,Æã.Ãf³ª:ð6:LJJ9?S´êøn¯B|V®6ZÔ+oÚDjµ9}~2¼»+~:ÛÐR4oN@¾RÒËÊLJ#§èã½3<$q©È§H%ç¥gèõ¬Tmyr'óî#'}Ywfòq@ÈÊögmë\\Ë¼L5;òub4Oû¤OøNý)^Tïô*ñy}´ã s¦Cª#k-ñTë«w¸ôÝ¦\\¾ïUDdÞnîQ9p½¯ôÅÀGW7Ý{«ÆÌÿï9~åÁ(ÛO>GVOÞêø^<wbsHO}ôAÑ=}­ÃSozj=@´½x~\`*@ÿîJ2¿»6ô+<9´:§ñzþó	ùÓC)@üý¯¢àÌïéØÀ«iFZ²Ì½âì4zÇ$AµÁõÎ&²¼ÜÎ¡O5/Ió0öÒ/wu¶l5ä×"Aî¸ºÌÄð¹£ÈÇçVb"\`p8©ÅÈéD)^Q*l¦º8üý	RÐh9sÔí¦ÆÉØ¥îX?&è¶¾ª=@4ûÆ²]jüÑ©;î½*ýÚ¬;DøîlSÅÓþ¦Å¤KÄG÷ýGî[ä]ø6å@÷vW¢å°à¥[Êë½Ö*7Ö¾!fµIñoÝ¡¢2ªîåÐ!äE\\OhÏ=J¦à­qÁÞ0¼!Cº °¢	©}ÈC¨O]S½ý{=}æ îúuÄLÀÔ¨ayÔRÓñágaë¨SñNvL'<Ôr½+SQû£ãõ}ÿÝò¯ÉokHð¡AX·¬ò68Ò's ãRó>/d³iÔºO×$/nèeJ=@ùÆfZ±ð¤mê»>×ÙA6b%¹dFVÇ[å>td·èé?mÐÿ»góîLJÛ|_è;à ×íÉÞµ®Ð;¦SÏ6øñÎHâ VdÙlÌÒ.XÊeäI[T<ÑDy2ÓFÑØiËÕüë E\\ZØÚØÃÈ÷Uu½W=J¹=@=}jzå^*ì=@ÍUçáÇà/+²TölÜJ¿)=@g!á?túÌPk×4P|¼¯úyê­ínôGóéÍ-Ïh±k7r5ìì\\~6~U¢[¿d]ÄÕÔìIÇGÿmQ ¥%r_IùóB÷à\`7_ÿ2ñî^ý§¢*ðÍy¶Òð¥¾0ràdGÁö=}¶Ôàcvá\\"=}®Ô3d»wà¬ww@ÞÍ2FgÆ§èøððwåÐVRÑB\`ôSè{ÀRÑtëÎÈÚÓÆdd¨AP×«YÑp-¥¹Ûª:ÌàöKÛBva=}íÑù<Ìú°ºÌ¹Ðo¨ùøwyÁKZÐ ô#é5ÜµúP¦bôÅe9Ò&ÎÊôHm»â#RÇw[S.Ü=}ÃÎÞwM¡bÞ¼ÖnÂê×uG¼ñ\\k~PZ¨ìmj+á->µhó @ï=J"±QnÒHW	VÁOTv¦kW|~@¦µr1°wê@¶ÕmµWcii%®V1¡ÏI@_ºÉ9}å×µH¯½[v{¢þMÒ 6ÿ¨5¬k¤E÷¡{aÒe"ê;vNö£Í3ßu#OZ<H1¾¾£VzzÐRi¶ÝÄ	¦<}«çy·¡Qè\`_oÁ¯ÁµØ¹d7èoËCâ»õ¦ä,çí°{LUlÕª$ïAæ©§þMª£lT6¦òùaföçl*¨´ñÍÉ5¾>¯àO´×§YsÅ¸¿.«»xBÕÁ®&qd{WVYrý|ÎÃÇ»P.ÂêtÄêîÙþ	ÎâìÛ !°+ú¡Å±TÆJÝæwiÑ)^Z$ÀèCú=J:"àuÏÊóJþ£â #O°4ð:dð²_}{VaÕþ§þ	dôÒá#t<<8¥hÂsÊs,OQHnßdÅmÐ|Ë¿Ö=}ÌÆ£õt4]y¥|y°L$ÔÍ\`4ÕMÅ|ñ÷Ãd$ðÐ4h©ß¬è÷Óé¦aÜ(t¡åv©?º÷Gûð?lôì_ô.](J÷xB@"Y.¹Å1¢P÷ü¤LlYs=Mûº=@ho÷Þ¥à5U=MúÏ÷Æ:¬Ôôk}?Â=JòÙ¤5ÒÎ9~ºS+qF·¡Å[N¶B|¢èÌ3µ¬zékër³ï¡³¨=J|¾CH:õj´Ò¢S¾]®aðÒ¸RÇÔÇ»JÞï]ÀáDcf¼ÄÚwLîÅ©'äaÃë¡ $ FÄ^r'ÓEÀ/:}ÎÞ[Áxíè*>':6ªÛào¦¶§Ì8´®¸VO§=}tGUøLÐÙÏ¼^~|ÃµVvÐâôÄÒ9]ÁÝ¿Ý~H?Ã6îÁ$®¦:Ç^|YÅÔ¢1bØ=@Zàî>[mÄ¤:÷¤ßà¶6}\\i#mû9CJ=@xQrgCw¬~GCTçy=Js5û~Ú¿ïIwÊ\`òsûHbtzKþ=}âwó2-?b¹R1wr^Kkuß°BþtÕØjD hDØñ^÷vmØ_7ñÉ÷V~àsQ}/.Ç®À¼ÒÑÍrP&¼YÌ´oÙ]]·$ªÆÒáÿy@$A¥ølm3¼=MP<æÜf)*Îïmßf-gxÜÇ·#m^âÎþQ9=@ÿQæbËµ=MWùd1ø-¸Åê­WÆévxlú\`YÄ·Ò¥	"ÜKÂÓäâ%cé_ëË0DÃÅAPÙÒÐ =@ÃMMóF@¸\`Kp§'èÇà_0p_Ý÷Æq\`|Ã´øw|ÙÎVýníàOc¾÷÷B£8¯fCîÄ6¼t;GÙÄë°[\\q0dX&lüâÎu\\1ð¯Ds.ÅhQN¥£öÁv1*^7¢ÅaÒÃ§Õ£éDZS\\Ev;Û/û­,X1î&+×QE.ÆqvOÆM¸»öRã¯¤¹]£eãé;Ì¼Ck·ªñòh*§ZÇ²Àhìhÿ¶åg®IYÿ²sFãÔ_Ð×ºÏ±Õ1Z³Ñ$¾L¸¡&7¯).cézþná a\\NCïýbÉ½]&WVg(:ÊÈEgÈÈÅ¹c¼·AÁóP®úíñõá{X*=M·v´¡EÎ?çVÈÉçÂzÕE~ZIéúÑ.¯ZsyL(µÈúpÁ§àAäiÈ3sMiû[dá¯¹É!L$óï¨óv "Ô8=}¹À´/É³.-BÀ×ÃÖ?¤AøSÒ.l²ÇÂl}ÑQIiPg5é<#3îõoÜØ¶Ô×thÈóå'NÌm3=}Õ}0\\Íä·íÜ^Ã.Ã«o¨ôôáÞr°´XþÃ¸¨NõÂüÖ.k&¥¹Åæ5õ¼++A@.Sîc{º¼Û)öýù+#×"ªEµ=@ñiqgÒ'F<HýG93ÿ>þÖOí9hÂ°³¹ôj®=}ùûïëÒ¤Ü|©B-MÓÐYZaiÓ(FyXÅÿÞ#sÇªÌâÇL¸´?ÊPnÇö$Þ.}!]ýjµ/Í0\\b¬+V'KÞ±k,sìÝsO<NÍ,N@~uäA=Mw¡«|þJdÝx6§¸Åcòð¡oÉ½{¨úlfÿ0oï|ªÙ(Ý5aäÇFbZ\`¸4»¸Ú³.+5gU5Ã:Ih7D;h¾¦PËøµq@3ÇGx+fêáÑØy©!	ÎÒIåNÅÚRS¼¿ÔþÖÔáêØz¹78öîÎiX=@gmÿ~çÓÚõ/2ÙäZ_õ¦ÜÓx1H¬tÎ×¯l9ó÷µlg=@ÎË¬þñ!åP=JÄ²$çÕýN.3ð¾Üÿ9O´ÔÈ%á=}o§UÁ%K}=@Û¦ihÄ5£ÉPÊõ¢2ØúÌ×½Áðº¹YÒ¬ä¶~6-çJÌ2=}2W¶³IÖûÂÑ¿$ÍÖË­QgÍÜÄ!:©ù _\`~îô£W×Ðl¦ujåÉ¢p«Dòç!³{)T¦vý¸ÈÒÐtùOB°Ï$¨=}Ò!Ím{;fxð^'ñ<üõ»ÃùEc?ó¬Ê15¬dSÛ AÖc_ë	ÆEFâ|æ·QBó×f»tøÉä$pÐ"=M&]lsewQ$åwKîÆfSªmJ\`!ú¿c=MO@¢ûÆB;¿äié\\w5Þòg¾µÏáëõ·õ¬îkôyBöeÒZV2¹¯#Ö¹Ù¢cQhjTr=@ÞÚ¿ÿñAèÆ}Âàdÿ\`è:çQsS+¹Ñ *z(Úí·ùáñ x[§?Çé!^ðÛÇÚÕçü2øePºÒJOùÓIÀkW8¸×±÷Ì¸Dànk\`\\þåüá¨åeCàäuÞçnºÄïÇ~MÏ)_ç­AÏó»ÆÎÞ|¶ÏloüG_wÁ"BÜÜ²Îá§6ÕÏ6ÝÓ6½ôN?SPMZ¼LSÍ>"[=}µ×ÿ\`øg7Kèy\`Ö@ t=}Qíô¾&½7ç9Z°@<uñLTÎB{°ä²cºýÿA¹\\ÀÄCÒØ;·>ÛÆîìê zívòqö:öÙgÄUU¯ 86ÏUJkJ@ÅâlsDÎ-ámbR![7Ñììïhæw¦Ê@éRkÆ¦O-øºO5´Vó¶ZÏÚÏºÏKE p÷1ä"Ü=}éÁ³ðJÛI¡ð*ÿFPÀ]¼@³«ñ1f~îÅ,)kyø³v&ÌÃR bv0p=}H¬dN¢,U*b*_n2R|æû,z¦sémøÖòlîcî¡KÈ¸!ÿVR¢­÷º­LX~@bF&rÀï·*d>oÂ¥7õÁÔ°.ï¶|æ*}ã¯7A:âØ³©ÿF*µÐÊùÃ¶,WdCilmÉò±®s~é2²ÿN=}2:=MØ4H3O6Ç] o/}gùZHç:wnÔN@\`"<-Cüwö®Ì7¡·÷lçg>Ánè<7ü6zÂ°ÝvçàbÕb{ñ5oòQÉúºNK@\`qÅHÎu yÇdºTõßuæ¨F=}=@»Óª¤xÝ}²WN}wÍ³dS1³¾-Êún+sE³¸JÆ=J\\Åð8¾l_8y9É6n¢%þ_ÿÃØrÕàÿL¢U÷´|	S»é£GÍ»«Ø]*ý=M¬C¨=MøS­Ê5Þ÷®ÿyÈ{Ê¾_ÜÒ¥	¶Ï·dÀø«Fh,#bUè*C ?ÃS% ÷! ¹õ25ÝÎpèJe=Jõ÷<F¸ðú¬@B~¶gO0ÒbÙc·ÕÇntiW(«¶á{Õ£ñïéúG¾ø=@µÆtö>[%ÿ1³dÊ<ð{zl?-ÌÔ#Þ{úoQ9Îªo­òéþôÐ]¯OI!ï¬<Ê×yD =MÂå![2G§ÚÙöûùÆ%Àc¬×ÔëKJÏöªÑ[¸Þ¿_LÓ:ì0¸ÊÚÿ<OÌÝËiâ)('}8M}´óU%CÑSÚÝL·\\89=@àÙWnR¨z¨¦S¤hÍ¡Y=@R¨z¡Mc=}»÷Ä²¦V9ëÿò%3Zk¸r¼u_x[=Md¿J.þ3{àß·ÈaF?+ªQà$/ùÃ}´¢´8*"/wBÕCy,Ý]@¯­7J+nÉ>ä:½¥Åîh¾h+.áÚ¼?=JÃ)¶b¡iE¿ÑßÈw¦áZ¡$ôí°²aë+/l	ò*Y§´<ÂÜÕ|N4>Èº­îfÐ2Á(÷°»â³£Ù ñÇð2oI"DvÚºWdS°ÝW\\úöØÙdÚ³&ææRë¨+Áí6®=@ogáºè[qY¡Û¼Áoc!T¬Bs^è®!¿Tgçå±qÃèVuôp®DÝ¶IcZTå=}yYIÄ	tÇ	÷[V«¡¡YWoãc¾$ý}Odßubi=@â=Jk2<Y¤7Èã§+wO,s7}ëÌJYPÜRv!Å^I:Oó'\`DÝØ·ãüQvÄ³ßÃèDÍù§=M¥¬u|öâ'Ü<©óÛùï©£§&*#Õ@Ñc°Fî¬ËT°²6?ÒV=@ÆCôu¥0r-w\`Lo£lÂôØTÁb¢Æ-¸1+Z¥6ôp¨§wþáÊÁðÚ$ÄÝSç¯AU²â¯¸¬þÉefâhëÍøä9¡~ÚíÆ,v×ÌìsÛå»%5ï¤Xî4&&ôìtq#î.6üdc%~Ç\`e\`éþR=}¥UóÕë^\\gc#OØ»ÖR a±@Ëw	¿á)ÿnýÈ¥µnÆwâH|P´-z	±¤.ËÍ:f{­"¿SÎù³èñ©*x¿J?×-ì4þOÏqè¡o()ëÅ¢¬:-Ó£ª^E1=@!©G	|T·á¸êúóz®:ØÁ»LPçÐëÿ¶ßrÁ9½þ+&NÓÈ7ÙÈï)¸ZuÁð»Ô´ðd¾ X/ëC{tKvóÑµ¢Î¢®Xa>¹Ñö±@'b¹íNÅ^-m¬±´â%l#vXlÂóñ=M\\XKÿûmå©ÛbqVR¾=@AæAPê8¶WK¥8f¬dþ2w¹+ñ§ Öí³&;þJÎhlÿ¿§>=}Ú(½Ä¼AbW§e§Þ	øI÷Á¹%ñôZ§¯¢d®J÷H=J÷Zá;jÓÀ¢KOC¨m^ä:àvë[É\`ít¬Hx!UN\`õHS~vt¡é¦¸ö>g³A¯z?ï·ÇÁ! %üoýZBM¡áTv¼ÄçÆ{b{}Ç=M7 ¢Åãÿn/vý²AãUp7ElôïÉ{|A½µÅ¼ãeö?­aóò~æk&£%8ñÄ?ÐV6*¯&8ï%/$^'dyC£;!ÃMtõ¼4Â×:K¡8´'%uÖQ7Q©¥ÑÙî;\`Á¥á|ó·±¬th¢Êo¬ÿ^Æt5Þ÷q=}){.WóCìµ=@\`~$0ÈodZÊÔ,_¬ÓÝI©>aúkGÀjªA7°Þû?X;\`½=J\`ôî¯³ñqXD¾£±Nø_rR9iòåôAìÔÖvË«ÑÂÑTY"'¨§èó3PgB^  Ãð8=MM¤:p¦(Ûn0ÛLÂ¥F)Îì½õórAü*ízÎYë=MªhÒ=@JR|Ø¶:ÆßKÐ&|"+/mIoVÁùÂúâ;ÝØÏèÃM pG¯Í¹<Úé¶øVg6èöJÑ4[(­<o!K=}72Q? gJ(;nvÑz+¤ÄgÜÔ¶AT" Åä>récWy³B¢æ¿´²¯Tô"_~=J=@I^ÖI]°/\\iÏzåóþNüWáÉõ·ÁÑ1cHb{óÕc		µÕÄÇAÜ!8Â=@ÿù?ç>!¶Èý}¤8ïG¥¸=}ö)ÌlùÓËZ5ÄäÎâHS_Ö(¬^bÔõ	M=@2eË0,å§äÓ?0Eþ4ocuøÀl~õ±5C¨kÏü­ï¬}IP5ÏsÆÆOxcr}µÌ=@ò3v[4§\`3yvET\`@+êÝ=}¼úÖ¡_=MÊVþÊoÒÊ®fé©(tHÈ\`Ñ%é$³u¨¤ùyÊÝÁ/!Äé<-5GR2Q¯Ô)wþÚ¼ÏØõl~êK­>µO¦»£­ëR}$qð­ê_oKÂ°´º¶µpV@ý<Ué6^,´¤Î5vm´¯YwëÂIA=Mé>(X´=MÿFõky9µXYC5áiTMÝÀÖ¨Ûòûú/" ¬2&Åy÷¦±yµÏmU'»u7aåÄ	¦};#P"#ÁËÍÄfàUµè5ð¼¶¢tZPó¤(¢;ÑM>R+Åpå¾Ããw¼yEïl»Ýêø6_ò¨âùÈFïâ\\c=Jp'è3<6u÷imÁö/¯y\`v_³J¨\\*Å;ª- /òÂðu=@ï=}¼?±¢¯uÒ|=}U6ã/zÊþ5q4-=J=}®?¹*.Äå=MÁÉ»yBræï3zcC=Jú[ÄRLlâ3c8þülÂ?38+#±Â M©ý¯ñHGÖóXæ2ìÚæ1TÐxsWUdrª¤ Î41\`z£ów¿(ÂDbò÷tøÈèã	]:÷3pÉbÿt³Ô¨<G£µÝüßòeïlä\`«fpµò<B¼?y3$W§ø|M#¡¢ÓÕf¦e5§RÒÎìDÌÝnJqDäÿ+oqãfA1ßØÎ0¡O<Z^¨5Ði2gù)NÉ¼û!@ýHÃÛÆþ#þªá+s~²¼Ü¥	:y\\Sqy«´±d6°÷ið]UYª[¤k\\DÔ±ÎAãüÁ#0¯;!¢@±Á/ÒyPúºÙæL,2(òñ Þ»ÖÑJ{7Ø{ \\JrÒFbÃwëÉCw>	ã²'E8)·{mb"=JTÍOçô»ºYOkq¿Ì=M>}-³qÒaá¦Èé»?"¥/Ë?L=}O=M°6­!q+"¥A±n#¿-«ÔñL\\3ÁßËár°(ü-'×H'Ù°~ùÁ%lE\\ôgîäK#Ä´Åîpë])bíæ^R¨éèp@¤zo&nü_¨·îøkRÌ'-½qÇB±ð¶FÄyõê©Á/ôV'x¥ènd$;ü¥¨{òsZ­DÖdùÿ»\`*³É|¾Oîd´Ø.Æé¬ÿ;³ÚA<¬XH4ìpAðd,xçB=@Àì<I_ÓéËüîc(Ç:èF¶[°ø¿9 Zúhø*4³"oa2çh÷zzéËÀR#²J>[³L´æªÝn»4Sj5a°fø,\\7|\`Gúa.Bd=}Ñ=@ãÆêíÛ6 û=JP3ë×AaT¡HU!\`ñâÎë#[ZGDy¼ÄÚ³½=M6q,OÃÝUjÌfEÁúÖ^ÄrÇw=@Þâ.cùôQê¯.mr\`coðvÍV>t%~×S¸ÏÔ3®M6=}@¶+IF?¸TÇ|­"Öï<@Û@^ºÑÚ¶§@FtilP¸$ôaä((®'Z8Z1GÝ=@oZ\\ä¦¶æc\`NËÓKÂ±\\8²ÅcmpjN\\p?¤aR7Lv$HÈ6¨ÍVOO@¨e{¥kb<Ä¬S=}6â C=@:¹-¥Oì¯ÚYÀ.¬¢dÓ½Ï!~T´üÞë'}ßéâD|­@í¡tx¦xÿRíF¯PîvÝ5Dð#¹ç¬5­±3{:IÆ¸9®õÑºÇVX·l¿	=@ïhÊóÛdBÕgÐp²Ñ,èúÈ¼âÐº»\\D;Ê#ò6Jóqªgô3#k35Ð¢tG{ï¢OÐýÊKûp¥+!tÏqµB!³3¸Æ«ÂýéÐþ\`Q=Jiu,øjû(u$2ÏÉHQ.5z,¥w5)]þ¾ÏAAô¥M9]ØD±±&óÂP!9×ü§J*ïæõÃÇÎWnä§â¼Óþ/¹}Ì¡¿¸6²àK*w4¾p¬¬¼çÝäËÔ°ÉàËDYë\\,$.í¸®]ðùjeDWÕãá×=Jú7^\\0d0È=@:×RËÑ#úÆ¢÷Ç³bð¡3T1Qa:åÆÙ]23mJzñ|=J42ü=MkÈ*]f+Pý¶-¯xÛîIï25Â*=J°EÆBÁ~¶ÈøsÏKQª©wgþÀNO¬BCÌ­c¬äeîz=}QöZÔèïRºw7ú_¯-®þojÔ«PºGï]/åÝæwÇk]Y6D³+îKÍæ¿Õàb¸Îô7t²ã%yPõúÜ9»Ù&øjÍBküìvÜq½õL5/£æì¥=J&é³p<SoÙÙ¨»1âe°¸Cqõ ð¿ïSÎ¤n³#zi\\~*}û¬ûá­7	2ÈFðF©¥³çeòF¨ßÆpnj¹ÖÿO±*(ÖçtvE(Öç|û&%º-("§/©&hÝ·i¨©äØÑ%§z#=M!¤°	ñÏ®i¨Ézø&%g	Ù''(,Y%çä¥¿>¤5VâÓ±|ÿTZDÔ·0%¸à£PÅ»×¤àäTPÿÔoÅÌÓlXÒ à{¯ç®¼Lã]éÁ}IÎ«åâéDVr¾íÇ'ýe=}ìÇ#ÇSøÆøÑQç=}¯e]üe O·u¤ñ@~¤ñ>& ¤ñt¿TXç_}Ú¶¸ÿ´ç¸ßzÕXçÝr°YPßeÃÈhvp½w÷!ý§Ûn?6,Rõn×Ðo»µA$¼Aã½{øäÆRù¥~^±A4ÊYÚÂy«&j£1K¬°û¸õ*cRÐÓÀeXÀy4ð áèOàÖäH=Mé^,nÆ@¥£ezo.ü((_Mî=JsùRÁ­et^ èyÂXe£«"]:üE%?T2¿²â9-D\\o\`În¥¤ØÍÕßßgéíÀ)÷qµm9ÇN'É©/w\`(y[ýc	#ò ^	P+£²ßÎRªj'ØüWI; *¡éSxýúªyu9æØäo¯±BÓIÖêÝb¸[bì.¬Z&>Dnçê ²r+h<A.è5 ²L¥øÝ7k[ÙzX½1¹B¡´8;²@Î*/]:>2Ôí?Ý¼À·äkÈþBXïn'NúN¬=JG/Õ¹éø=M~vªYª/Q®ã¬"ðMþ"ª"jåQ'æFîÁXGúÖJ6#ï²aðàïgJËá+ÆæÂ^¢{2âv}=} «%,2ÁÇ2ßpº;ÎµY1v1uXùxä²Ôá=@±/²ý7ï¦p9*¡?!7Ä8·áJ=}dðw¹Ö?ü±a;¢}0Ë'úûX>/Åy¥¶Ôì*6µjøÀ~U^cZ8Ë¨lÚ¡e)íàê²àhúÃýàf\\»r³Èd4À{aÐ¨ýJi.ý´å=@ZÁ=MHj=M·£DnÕ>¢V¤§(j.<ÖXz¬/NM=JÉ©®Gçu{?¹&ÑEH|zK$_¹ ÝG j²´ÒÖIv?2ÚÙLþÅ]Õ4Nræ6>B§ÂbûÎ¯aûV[£¿¤/ÕÔf²kô=}/ÁÈö°êh_ÍÓBsKÀ²Ú¦Ã~ìçSÝlN<6«vsÏ >Qaß6ZØGéÒ=}e¥ÆY=}%bþÖåÔ·<#|ý:~kC@T	×\`Óön]u¦ÌÒàÇ½u©>üDÁ?Þ§/ì°?ÂQ_´ìrVaq­»óEGßT±T£cïzñ¸)3õµdÖÑÜÌúâþepº/êÛñ	£~kÿHHÉ(x}L¬VÙYud.s®ZªmcËù(­A©ßï¯Wº»ðímOùÚÇúUý£PÙþÎP÷½xÙ³k÷²×ò=}ÒõUålVÙvw ùþf'Eá×êTåh _Ñx}åÀ½û³óÌýÀ;Ñ¯.¯Ç¸-Ï\`=MÚ´Uãí9Fdì8B²ýØo­'tÀ^-ÍFKÚ]ý²5ÇdÊÂç®Á§C\\´ÃxlÉI*ÌNaºæ(OÀß/SQ\`ÐÍP ~ØRás¡\`Õ!_3ý\`ÑuÚhÇJ.@Ó Àø=}üÈ"àÜÑË(ðJ´ÛÓGÇgÕt\\Î*>þTjÕöLlÝìl7NÏË\\þÇÄ=MÃÄ	ÃÓå×x0ÄpÑâePuÕhÔÝË T=}=Jpf{D%]B²Ir]û¼®ò"gpþ$ÚZ1öXïtÖdÆ%=JâÇµr½ï|÷:zgspkÐus]\\¾ßüÎê®ÆL{¼Pé§q=M¦¢JOHS3}\`ÂÜV»§·H÷{¾èö6-@6Sô\\óút	¤ð8=JãGÁ	yL3Åæ}²ÄPD.;}Ûbøxê«Ñuhr@ö´ aGeºÆ.gSÄàöÂÀª¡îÉ«y@|l2Ðö[ÇVÁûH!úpCv@»×WöÆé=@@ZFúIó­-íïXÎ !Kà¿®¼²¸Ûâ{h0C¯E¡Ô±ì2 ÙVÙZö¤Hlìr\`+ÞZ=JÓSo¢^ý¼<rÎã-NDïbrOù	GÁ¸¼«=Jíª\\±ÕB\${ÒØ¢|M+¦¬ñÖRC*ÍJN4 mÒkig#Òtðõ²Ê%mCqîzru×òcY¡@¯é¨Çå§ß} °×Ëækåç"7c\\OE¢Á«EâsA¥ðÊkLÕvGÈ+:F0Ì­+ê0Â[-D OÏ£;¶8¯\\øV3^ßLo^U=J;Js<b{ÀkÏ=}¦c5(ZÇÿÆ}S[o2,ÕKS"vaÖKJçXïc.¤â±î³æ·ÃæQDÊÀß¾Â³ÎiÚ=}d|¶6_×µÎÿNFÜyr»ó~Ä¦ãæ5ËåÓ¸Ø@¥Ê<£ßÌÞ£à[Ò¡@í,.Z]Ø=}?^ì±ö6Ô^ÿîFRwêº-Gû0*^Å²-õæ¿Þ ÕPìe_¯u77í	ùEÀÞ2u\`©­@¿æo4ï·ÒÕ;ßØ/.Ðfõ~D½5·{ïÝ·{÷yiÙyásmÝu7Ë²÷ØÛELº:²ÇÙ0[ôÓ\`nl=JöSFqeÈeÕfiÕEµ]Ó5ÔÒäB;EþÏóLvTY­ 4ÛÚ,ðþ|GêØcÊúÕaö§c9ôû³?A üÕî{shÀàC:U<Â(BK4ÐÂkjÔ~Õ¡÷x]XÅ³Ñ7sÎVXþ÷Î¢({Ácv[&uUbKídÂs÷T¦´d0Ì-\\vâ¾:]ÁwrLg¯'Õ¼WNÒ¸p¡ïhD¹áS¾®ÿÄõ£û¦Ó@]<ÌèD¾ß{ërÜÿ¦×;kÙ#Íç'Ø·VÝvÅ»vn,·û­Ä#n9Þ5c·¢(]àKòMBÄ@ÛÝ}Ç¹ç]ÞØ°RX<íª~¯¢øW½_m.Óúªí4Ìª\\}yÇj7Au3é³>mú#sÇ'\`}v¼5­¶xØÞa%þÊ¡¯ËåÁÖ?ßD?Þqµ@4!ÏzJËzðVú¦),hà/ªtÃ~}òïÿÞ´AWÈÃFåâôwûÒ-RPÚG=M_´VÆ§V¢ó§ä×¹y,ixç§<ç ì°øÏË R!ì½'.ª<ÅÆ-ç¬ÅÜ®1,ñE¢V""*8Î¢?j>×ºg9~±Z-{¼~tä4½ÿsÐ\`®ËÓØtn0»$ºÒûX°¸r8°z7bÄ/»\\b.5D±¢_ßã¼=@¿îÆ.Fá[ªÜ²óOaèÒ"ò°³üRwªíÀ[j¬»þì-£7ï&Ý'£®ÿÔ#|z*^|5~Dk¼øô»Ög.öãYÁ¢Ñq;(¹E¤BØ»VÌÃßµ9Yöõ­ ²^4L-F ÷r{ÚRÐ\\Ó^\\µóòÌp¡X~õZßR°ôÄ?=Jï¸/Ô×÷bÕåËÎ åT¥2;NWBC<¾ðg{¼ôp]¹qAÿ=Jca»Ý.7¸&=@:\\½);<Ôz»_ 1xöÀkÆ@¿ÒwÅÄ{¦Ä¾­lm2w_]8ÈãÊNmFcÕü/ 1øúØ=@L<\`»:hGP]«òÐGõ{õÜ9{Z*Ö+D~òBB?=@Ï^ßßaS·&þhFèïËÎß!µ=MÚ·aÝ£jÃDp¡ãÅîñ6ó/­4ÝNWØBÚÇ¯¹- Ü¬±¾º}ÅbSùó®ÜTº¯<k±Î¥>¾¦N6²,g3ò0DÉI£Ï-8GþZ{@³lëµÖ 9t$.µïö´¢´Õ@\`X]"eY¸£^Cò)káÄA=M	¤÷Á!ß_aX©þ ))(¡ß jèñ=@?>Yú­\`ñi:q+õSí4±1	&eú<.xþxV²@MÄ°²ÅLPª¼Û#è#àÛ#z~ëøf>TàIÞÝØì°ß­nÀD\`}^ÚµGu7Ëé[n/Ê$Í<@ï=MO¯{Þíí¢µ+ÑMNºûdÊMFzy6$½7úX4²GWöÕN¿wÚZÁi07	=M:xnú°ÈZ2¶B¾bÀ±	v<EMuI+Ñw6DQbL©uùôe¿ÓÎüÑm#tÁHõô¤t^Áb«*ÑM«t¢ÖyåÌSä®ë,kqÁK¤²ã´8A^mvu@|Æ¸Y+Á\`5Óyß2ãæ=@ÿpàµ£M®Ç'qìå-²^GÈíäÕ¨J{ÇM2úæ=}g¹Ö' }âH-¨N8wò3áÿG 0O§ùxpÜz?ðs~tÎ¦»Þ[ù¿Ó'üë UUD'´yÿYã1¹,Ê_¥ÇseÄ=Jº{'P=M®I_ÐµXð=}vîê¾£÷xUFKN¢[õÿ$®2öÃ]­ÖÎîÜám¨ýDGÜwEÄtµÐ_úz¼÷ìô²/Ð®wÄ¬î}ÝkCQ²§=@&ê÷P®´z·FwJAh1ÕZÇ J@ûßpá¹A)Ç¼°5RÄ×óÈÅXþÄ>&x$®ÛÅOÅrûÎ½N^í=}9m=Mé@WëÎ³ÂñÂmÁòJÛÝC]h]<L¹xÏÒ¬8ý{ÜGÖ b"iKÃD5ÏÌsbÞKä¹lÞ«0aîaÓúÎì®/eKzvûú]u3G:Í0]Êx¦ë¤ì"=M¯£Èt¯W ]Ñà1ðØ]+;xcÅgLq¸EÒçð|RlÁhÃ©ÖÂðJLvÝrdÒc$ÑÏ>ß¢^ãÒ~ÍÊ>RPæ¡aÈâ=@tË¨bUxÒzô¿aSQþ×ò0åý,mËâÛåÆ¥xäB|Ì4bôê3´P½­°úBÂ½Ù<µR¬#ÿFSÜ§\\%¨p×ylÀwÎ ~¶=@D9Î%hE¨Î2ÚåßZ¶Þ OYsÂþe¯ê½r^cá{zÁÓ÷ó´Qø(þ{XÙ×AvÙ D ±ÒAÚ}em¤ÐØ)=Mt"{ÏöTÈÞtÊM·=@ð×¢QxµYgzSê=Jád}Ý³Ä=}QZJÍQåßÔ¯Kst¥ï{eY¸µÔb-²bÍÒÐ(:¨rtx"UAïþ¡q#lÚÍ2¯Ä¦+È|}7ô\`*0=Jæ+2°ý0=J7R-ìânFöæÒµç9k:újF^%_5=}JpÐ%E_' ô'îÁÏ´¿Õ÷öuÕÔÀI-MÉ£¿öfîÇßw*'®/cê²=}Åv§*ï"ÝëB=MùØn:Á5õ\\w=@é-ìCî!5+83¡mºíß.9×éú*ÐÍrÁJç¸\\¶ »¯Â0?1ï¸k¢ÅÊå=}ï)R{Ù$ÅBõïe+ÝK»d´4l¢¿þNè¶ßcÝù0qç¶Â²b«ë¾=JÕw:tþ;o<a¹^ÚvO5o\`B-±'Y7¶Y=JfÊã'¸¬0àVùz7uðÛOéÂ?¼d°´11JÇxñe{vtÇÃÚ«×ÅÁOè¾ÿü4ÍÝ·'UZÄÍâÀLäRt=}½ð_ë"WQ<ßÕ¿ÖãÃ\`"oE<óK?Ê$vWp½öGjQãP5Í"TÄbdQ"kü"pÃ ¯»3úÖZ)_]v[×¼zuà)as'¡ÀOKu.\\]î\\Ï{äBÐÔ[ÏÍsd/(Ù_²²CT¯°DºKÏó3|P6Ñ­ÎñW=@H(8eâõ>Ô~ðå¤q\\#ôÝØÂöä®WyÄYóSx¬LÐezÆÿxboé:T9æ01@1xVÁûæá åTé·ð»:åÀ5×xã¶YgiÓb§yaÚ¯^5zÇM$\`Ã´ÏàÛðáø«ø}ó9¡yÍ¬£6Ývgí·öùÍüïÇ±¡y>gÈÄ+¢xË£â¨µ»ZÞ~3UWä§%£ÁeèXµdiZQ(Ùc¶åäÉö³)¥8ýpw¥yVmÊª1äõ|ÚÔN6¾y¿=}ýäth_e©¹ê²MUòDì0Y5µ«ò\\wµ´w^×@=}kô:íÝEÛý¼°"¤úÀüt÷FÒ"mºaps¨ÚØëºïxH=}=M^×CB?ºT³=}sZº·¥Ñ)=J1 ¢=J\`Ð«ZYS¹DFÒ4ðÀøW@åI\\PCxÞR°®0òØÍ0ÚêÌ®ç4«ä3xÎa-ðlPv|\\+°â¡aÈps³rßGADU7¬=}ÛßÎ9ÔbxU³o=}\`5m5sÃd:aé	£	~¬v"ãï=MOÄÚ9ê=MIW|%ÎZC2KétU2±Àl¨SF^íåÑ½£ñºîPn½ù¸PW_/>~Í¸j0J½_#64VÕäL÷DëHÐ·*þDKý!ðí²kZÕq3!D³´¡xþK,ÅI8NzÿÆHþ¤Q4áKÝ¿,ÉNÞ¿:<¯4³æàV×>+®ÛÈ<¸uJéy¬ V'=@¸àºK²Næ#vn6bÎ~Á¬è¿È0áÎH­4Kø=JÁL=JM'Ý±ò¹oÍ_Næt1Õ>òÒ"«ôÎÒâ>DNó61Ö¸íït&ûjbÙ.æõìþÛMféºdxwl1Fq^w}8õÝo±°Á@GÔ½¥6³Ü»^ØªiÑ­]©·3q1«S<è=JÓæ7½áw<ÆN¬v§{Öìû]bZEtÝ$áïá8_ ²ß¸D[¦]MGÍÛûÅó=JÎËü¤ÏN$·ã/UTPÞ{­D,É&1åAä	ðMS=MæMùàã5VÃ îÁ/äØ¡hÓ3ó,e	ÅÏ»F~~²ÔÔr;Ôâ¢õ0PÇ[<ËCªE±ÞKgÂÞLeÌø¦anÎq5Àova+o¬ÌÛ<ñ(|Íöf ÈBh/ôÅÃÓûj»lÕqøû2ô®ç	bË*ìT7­00sfF²%SÛª¤ÚîÁþ§ç=}ù·UñO("k#áY~Pÿ³Òxíø~Ý9÷ÁÍ çËä9¿e­F	SË6+jýæ¶A{³ê5>r¾ßèÛë¶VnÇ§²ÛÒ$%§w\`·e¸\`ÄT1=}Zm^ J_­½\`$Ï=McûJ+Ñ=JªþT}=}¸õ¼Z·Ö¶G$ØàAý.ß	¼X\\=MA×ÃmÕòaír[§,Îz§³&Y(=@úlN(nñxî¶x¬Õ¡=J?ÿ_²Ãü£ÐWÿèÜ[ÐÐø®Z.pzþêÖËuÔçqI*@_£âËjÊþHIpéSHa:Þs[P8ö±ì3â=J¦ô7ÕôbìÞöâÃÂQ´·¶uþ=}}ÌD,µ@yËo}l(ÌKhWè\`Í>»âôÊØ­îwãxnÙ=}Öà¥ÛrÆ·ëûlÊ1¬üï¼ 1inêÝbÊV9^NñKp©,µâ÷ßzJ#V>ræ«ª7¼2ÞDFTÑ#Ç¯ ³¬µ;É~ØÖïåL½V=}â,]F?\`yRÙäû(õ./ÜûIEáàp·-Q2#\`þÌfj&uhéWmÃÂ8üYÚÿ¯ø¬GËÅÝ2ÀóÂãö|©³ó?~y5Ùf.\`ëÖlÀórxÃ^UÍb®%G¿êöbKÊÁ,XFuõîÑ80n@½4	Z¡oqåORçªRèP0¾J­[Vv\`ë¢cäáº¾ÕeBu¸×ê'¼ÞBÎî.m­n¯d@¸{´8#ÿ+4F»VR¬Ìá0´Z[Ulÿ«­o£2t;|÷Â}:e±cª\\?ÿð!{¢VÓc{|+¸Á¹§¬Á¬ p±"ÙþüÌbî0Ba¬\\4+£m40LNÜâÎþ¬h´Çü¯=}jIâX4ú/Ì[*oÕ,pÁÄ§+ðÓq¦5)Õ¬ââS9øÖÑW[ê¸¦#T$,e*\\? í<+OÔ¬EÀÂSsÏu)¿·\\KM¦.ÝeýÙ+wè*&±Kº\\=JKPZT _×ÜVj5tdZG>)»¯TYÎ^-ø.?¼²=@Ø~9µ*çdÈÄx²ñ²Üçêè/Á&.Èë"[!Ñ_1£6,ÀÄ#BuçÊïµ±"-íÏ^·x=JCJzo#@ÄõËÓ¡8/t-<È=Js=JßÕíêkf÷"7«yÅ'ì>eæé(=}äÁã¥£$ØjÏâCØ{ý×ÐÞíd¬c6ÝQöñÂ=}Ðäò»H°2¬îC9ÄûØ³ªQÅÚeVÿ/ãô¤@aðµ¯Q1oªÏ?Zæ]Û@,ùKÞCìTzr¾ÆP\\WÀ÷vû=}NØB>ä²ôö>¯tÄ)§æqóüººì5e1îy6÷9 Ó¬¡ðª¡Ý?2¨INP³hÉb¾È/áÌ··ÞÛh¨ó[PVÂºÓröm[\`AMUÓ	é.p»BÂ_ë6þÿýJµ*L)Ú ±*K=@ÅÌìw{/A:^4 ÆDéèv'¸{/éµaÓc±î7Þb#ha1¶ý¸úBá3Dí¤s¨êº²¯¶pIi¢µ0Üè<ISRDÉ-ðh6u;5}«s(+»ÿzEßK5­·ÂÔÿÿ3Mÿf#D¸ïxªdÊQIn&Û:¤nô2ë:^JyJû+AJcýê Æþèö°:JµÔÚs/­w|;8Ån½<¶«0¶ì4z=JÙÝh¦_q8iEZw¬Ë]øGÛJ@¯µc´6}D ·MÕeÿô|*m¨y·ñ¯|i¼0-¡#f|·¸0/«ñ©Ú£ñJÜZÊlBçÛ¾Â=}F»=}×Æ&3iËcGß#ÎåË_àÂæØ7#ctA­!P&Qvº¸Ü \\ù}2)4[á²+/qÄ<R. u"DC¡"p´ÞøØb2sÜë­¬	1Ë8Ý}$\\ïÀ¼Ú52¼Ìÿ?ïNCø TàÈbi(ö¡^av|H;°ïOÒ4ë´ô#¸³å[õÜ=MÒq27@ïÅ?ËûQõ·<Y<KbÐ\`ªµÖ+åÏåÇ¿SÂ7æÝ!<Vy|¡¦&æ	7ÈH"ìòÀÐ4B(K=JHkâ9Jû%(*e=MÚðºJ¿ÌéHÈq1¾Z=M¬ûà]Å¶°k8¸§$³;ÇhÅâ:p§ºµ¹½ãçaî%µká=MÙÃQÆ7î=}¢ktèúÆÂkâ# íÐögîAåÅA£^²Øû7á¾Ñ¦Ü'¼ãùrå'y°aé·îyÉ&=M5È"w¦¤û<ù»¢ä¥Ècy³s&À_YO<iâ÷E¤ÔXè%ÅÅ(yXP%ß(<ËÕûþM^JM^S	ffÄç|Aþs­''ücA<Û;z4{¡Óà"w³³/¦¦?'¾Ã]-ÕõÂ}ñåZIZä¢©\`ÀÓ¤Í_¦ÓKðäL.¶Ù>j_u=M_\\y¬+OþjÐ6~eùó¥2Éþo&/_1ëQÛCS(òä@-ÙrÍ®üÂñ-\\¨al|Úd7?VHÒjÖõÞrJêÁÙõÙØiùà¶Ee^R£0¬ØÞ~cúÎÓ~'¢ß~¥kÈÓ\\,Ú|áÓ.y47	\`ÝËÚ^H#´¥·jd{\\júºÏB÷æ8÷ÉÚ,þ:>W¹õno¾j¶ ÷I¼Á°Ú¢r0&òð¹óßl_u3JöûË½Êrwzõ9çË²Õ÷Ò·bO­(Ö=JK4Ô4a97/­K~#_ïäO«wíÓê$jÞe_ÃaÆ¡úpdË­Ò0ÙÐë¹ØÔ=@=M¸Ïu\\tÔs­LZ~¿ËÔw±Þ[¨L}ÿçÔ9ã#KiçEÂ½÷DÕ«0òí¢ÞÆ?öw=@®÷ØÔS´ ÑÎë75VÐex~Ï»w+¤lÝ-g¸Yý³F_¡ãýÀ¦ã½£D?Æhy´¥¯Ùh|V,2ªo:ÍUÓt=J$:Os:ÉÜ9æð´ÁÎæ@r35úÕSéØüÊ5É~È·@6@4Ë£à¯~ ßÒbsm5uæX=}:_ïùsvÓä§G7ä©%ibÿCÉ!qTA©k¶èÉán¡»³ÐkÂ=}W	&µ0UöhE$³ê¨7içËù$¥¥M¨7i¨ù8=J+PâÚçX*hé>'Y@%OoÙ(&i(µOH³;»±âÕ5o_¤Læ¸'gfè|'®u¾KhÕ¤¡ÍÉDð¨QFmÏ½ìbÚh(Ùù§(¯ÌPæ¯âä¨u[ÝgÃ¹)ð	~ÑaÁï&"ÑHC|d(e¼5oà*©\`±ÉAts7püÔ~	ó>=J=MÕiÄWÛqâî´¢Ê¥éifNãò¦hÔ²Ós;}ñXì$v=M¹D=JTéSçSÌ'ß¸E¢(§JSÖù·ÿ"¤WádÔ½çü¨­w[øñÄ\\ÒnýÞÐpqPÉüÎ!í¶¡Ê>bè Ûõ!¾{f'mAF©2ýäæÿ¿s]E1ðB/ð@¸no³|=@|¯¶÷ õF?înÈÉxÜÛà=MñÔô8?K³§â&tÐn±K$Gô#°èÛÏ}Ú$"£Ï:ÙÐ½Ý5=@§oÛ£R³ûxR;ÎÅ?ð%Í±g£¾á'B¯æ3¿j\\×Épu­Xö?ý´iÙ~v(?=M'À>½[´P[ fÃ'Ý=J=@P#Ý h¡µ»¥&Ï´T¯[ð«½â½ød#=MÑÚò¦è&¯eÈ£%@!76}¸ÝbÂí&V¤	Ý¶²I9÷xzQ ÆvF÷Å{q_Üäqûü- ¦þôlbÊWf©HKr~o;ï{Bs05ÁÚd³Ö«J.¼UÅjF£Ýg*E'¶f¾wvÇöws=@<F&²aË°-fB»Ov¬d­qG:¾½fÈò5ûdæàkînRúA±'w¯@¼SÆ{*(7áS²ÛÛq1>*È=}XNíüU=MSKD³¨:¯Îê­Úí4!¹%ñý3!=J«Ïë:fH"k¶Ï\`ßTT!Ë²R'±Ë@BÜræÁ$ÿWhbagõÑx Ã>_-ÜP<r«/Ö^¹»PHÕ¸¥Vfé²DkÅ7Ü%,o=@ùDJuJF öî&XÒéè±Ï²ÙhP++=@"Oí³»Ã*ð«þ2gº°ñp¡²b²qËHÚÂÀ8ÙØ¶º0ûólÚ¢Z>I5æDßÃJ=@ñ}³Û­N¢ÝÊË@)wçe}ÞKhQ¶´qrÃ|&Ì¹:Êtæ"ï{tÏ©r®kPsÅÑ &ÿl¢Õ9ecYFéKÎ9è&ÆMK§ùGU¨&ù¨BüMå!÷Æ ¤÷¹Ï¤&=J½Ùè!s¤ýÐuÙ¤õÉ9± CèV¢\\¾a"¡gçÆgl¤¦'9©q 3#5°¹é5uØÂfù7é)y	Z¦'h§ùÆ)=@Ñ?ü´§u)¿©Ér¥¢ëÓii °ld!ÐaWâw¼¨æ!&}IÄ¼(Ðý\`Ùh	m¤{þá	Çéç]£èØ!ªuáé=J«ºäm¸#+ù(¡|¨¢&ûm$]°¹¤=M³¥7	a×iiZKs¡­Íi§Kgügæã)à¹hJÎaù%ð§¥XÈ nrÁ¹ôPi!àºh×ü!F í5e&óE)§Ix	¢=MI¥"È¹¯úÖù'&½éÞÝ$©£}r!!ìþÉ¦Ý(K'(èµ8'ðÎ§©Âþû^çurIA7aÈeý§P#èÑÙ§xùÁ5é °í)æ'´üS=}l¤u'É!#3¡?üµ(ú¥¡©Úê-mdÄ!ÿÕ	_¥=M¼ºø_9©)"¥é©el$§¥©ï_¹8°-°Gù§¨¨"°g)³'h»Î ÿ_¡=@]l$5°Y¨ìÅécÎ)7§ÑfíqØ" r¦	¡\`H_#y¼ÉgIÉ$á½P!?È&Ñ¡èºþ©|	Å©££Þ(Pæ)±w©"	(íKçÏã£qh§&º¨	ÓWµ±èIüÐ7åEXÈ>üÑ¿$ðéã¹G£rÙú¡=M¹)±md%Ñ£¡Èi°rm	-Y§"Îëù°ðÃíEi"°2Ý!"¹BæeÓ	íçm¥!Hæ'ëN'n79æ=MýÉDü6É#qéBüñwi÷©ôýiÑuÁÝiÌºh	{ý¸¢'¨K§îÅ%Èf=@³AY8/5°9h#Á)ÞºøeÇ¨reÇY(ù´KgÅ	Þ!)¨r¹þ7AEØÅé5s£í¦Äá6_§f÷!±äl	1Ù¥ é¥VÎù¢=MigØ)sÈÁ±©§&È°Ñí"8c(¼qÙÇDüt§é¥59yÉÅfH ¡§{rIÈ"ÁAøgîºh=MÊè¨æø6Þ§AùúIó°ß)n¢è	¨õ@:üã!Ø%ÉoáP%XÅ(£G	9âÉ¤|ÛºhmèôS=}É7_7íÅXf=Mm%Ä%âá 3KçOI$hKÝ$%¨Ëó%#èUh)ùÐægÎ¹!Õ!Û^£FhÌw¤¦RÎIG Ýy'r¹f%ÿ§IS(uKç¥AG&½é?ümég&#å©>üûI\`{i'ç9hCü\`&_!ÓÁl¤ìÎ¡ØÆd¢l©¿$Èæ9=}@éXÎ){		&üK%G<ü%$ì©¦Kgé£"§iðkÑ±ÁÅ8e$ÈA	9K'¦=M'ë	©"=}K§=@ÝÅàØ#&) #º&õQe)ü5½$!ãu¨Büñ'Ë¡ìO}Ø)=}Kçåç=M		ç:üméþ:	\\']Gé9!¯w©¥=J«Ý!4=@cõHç­md!C±©=J¾?ñ¯à\`'ÚÿI!¶ºHäÙ¡ëáhÝ(Y¯ÐA¤iüeÍú?K§¹a§¦÷YæðºW7¡h¢+	F8WMÅ=@È'³¡'òýmiY9)ù­9)dfi¡.Ä¸eÛO$=@Ð¡æZ×>üµèàÓâ	µÅ>ü½ñ7©Îò®!Qùéå	¢÷Æºè$!ç!cñ1PùÔ9Ç¢rù©Ò!ö=})âñ®ìíâ¹\`ÆFüAA°iãq¥õK§]çý(öëÝl¤ðîèã\`%ñ¯ä¦c}8)|Ù¤f=M¹í°ããµÈ'§&üèÕa÷i¹#|' Á)£é;ü!èÚuÉb&Ã»ºH£â¡ü¼ÝÙæiÎÍ$è±xgùmH4÷Y¤ i©Þý¹±w§)$Ïñ¯	±=@ä9æ&æÂÞé"Òg©]éÃZÉÈg¾Å=Mmd!ÉçU¹HüÅPg"$ÏMíÝl¤û=@¿)]µ1®^éÿ$m¤õ=@/Ùi ÔyH½æ)~I)ìçéMÎ)¥	+ÿß×%?.{{>âoÓ4¬/{RTà2 ÄBò0;J÷ØÒÛðD_=@BµU´O DeÙ[ ØÖ!ù*=}cç!¥ùÁ'[=@ [ÝÖ¯Ù¿KUÍ±Ï»THº	zæºêW³T¨ðíÚ%¶û°èÃ^[=J÷¢?I<çxAáT(ââ#"1ÉY{ï6að¾¢g×´úçêÒÕ&?m=MH]Ô)Ì$lÀ¥%·cÍa,'D&ø?yéIBçuÅ±Tho¢^þaTéÆsi0?'z$ÙëÃmÐàÒÒßÔDTÁBÚbÝÔ´éXâv[96zôu¸¢[nï§CW	$?ìý[è§ÓÞ©xmØÅl~&n­'ÿ4ß´ 	'6kçõDÏOWèÑÐÅÔuÝTèÂéjï©Ü[öW¤\\&?IÓ¡³Þ ¥C¾¡h?yUãºÜÙxAß6¶Òb]uïù¡F!3ã a?Éï\\=@üþE·hQµù¨¯Ü×ÉSâ©7µ!éiÖ{|ëýÜ<Vøß¤Ézs·¦o'WhThÿ<TçwÊ´É\`âéç;Clï£±'ìg |èÀ×ÙV µz6ÿÕÝæÙ´!þEÜ½ÇUå7ýQuê£ÕâIQÔ"ÿlÀ¶ÊèD¨Õ³wV$oáØ¤Eí6å°|ÞJíý?O\\æ]^&{Êõß±wÇzoÏVcÞ oï§6qìôO&ÐõÄP8'Ëjò?éFèRTíïããD"æÔ~òsïcIþ=@'?ìÌì5i?ÉÒ0EÒb0ÀC=}Ð©ãm¡£M'ADl¯±ë§~f÷ël©?éj=JwµqÕ¢mu«ßýØÅØ$ì°îýH¥W{\`ø@Àâ%m=@?^)X7YÓÛåþÀ=JD8íÏö9=@®°ÃÕù9!¨Êÿ¼ù¥¨$a§6å'l°/æz´fè"Ì½´=M¸%EGÔ\`W7Aí¡Ôuïùåô(#pTÎ°ü±Ààê°Â!\\=}¤Ô"y6fa#aµë°Ì¥ÙIÔgW1ÇÂÎÿüôxáÃÑé¯De^ùVâ	Gù1Ø¢¦ÅÀÞ¢á­T(µÅÏëc}løÕ"áw7F=MÒ¢íÀm9XÁæ~®|°WÁ}áÝ¤ÓEa­=MÕÍáçFFd­ñ¤i7×ÌQFWÅfõ~òÖÓ8À<Cq_Ö!¡æÇæM¥e?ÃÝ=M²ª?ùÂíêèTØÙCäÜÿÃ¸íß&á-%xÚ#>?{=@ðaBÍø­YW|­}HUÌ_Ñ¿#ëfÿyHÍ$µA$wIñS zïÈ.®U¤ÿÝÌ~c!|"÷]yéo3ÀÍô}§8ÉoÎ²·CyrMVLÎÕ¥g&oôþ\\ÒN&oÌFÀ;fôuóÙ9Õ'q#ÐÒ£©$b©ÒÔ ßî~«zÏ'é­|Ô ½)çæôÙó96ø±K&É¡ÇØlo,ïÕÜ§hö;²\`qpÅÍ½1êåTé ïáiæ§å~ì	(§%CÄ=MÄÄ.ÝûVJVb6G¬ÅËo}Þ487«9föSÛÛÈ2µy\`ÿý±QðñÂö$ònÆsDEwICGEE¸üÑN%oQ!´¨ÊS[¾îâî"b;zr÷¯3%ÐBZçK~5¦g§ÌS$±Úþn§¦.Õ%mnÍ $nÜs>±TnMì1NÅ¼(FVagQSSîµ?N\\+MÄÂJtÔòn½sICÉBvsy´HRýÙÏ²µxt<ç=JDËþÕ¹\`íÍ½sz¼S[_hd{ù\`WÅÛhì>¾eNäèhëB;K´<ÂÀXL®Þ>Ö¾»ïåpOØ¤U@ºÍ\\TPÅ¤OÅLr·\\ñQ´nß¿Ðð¾N½hh|IÐÃ·Äg^5XÎq%8l¬m¯®_ú&ý/R'"YÀJ! enæèÃÊ«^$=@µ¶±Ëw¼®ûÛÐiÑUþÂÀ±Ý{¾èÍc´­MbW\\d[S;PÎÃhÿ¾Â>GØÐñÄ<Õó¶ÍÄ^½«½¼wV_Scû¶Ao(ERNÞ¹³xrZo²ø°ltÜ¹ÀÎ¦tVcïÎaE¯àûEí}ðn»Êm´ãÁ[[uy^ïí=M}ö;ðî+$¢®S¸úñpñoÀA\`°õ|¶·C_SQÜ¦¦v<]î²ß~ºÆ.tÉa\`Ä÷ó\\NðoÅw¤K)D'ãw{ð®æoA£a"÷áéÕj©gNh\\\\ó¾ö8²·øóÒtµP_}'óðÒfÿÝ;ðÍ¸ò3xKXbõíÂ¶¸O³PyOn´ö²¾Ø+©ÊÍ_¥äP*ÿSÜà]O:¨t:-ÀJ´ ·þq^ôSËm*»¼G×@½=}ÿ\\ïFMuêooÅ/íg~Ôgim¬óBMÂÀwËA yEvöEÇ¾½|ºfM|SYU4º@V:k'Á|Rap\\nY°´ìBß±¼=}·çHÄ¬³·ØXX©~@É}äVí4=MTô¶ptÐ.'Óë}08FÊy\\Ãn$bTS\\×S¿PjxÒnõóÃaì¾>GOóuIKþnNtN¡·.a±LÔqoµì~>Gõìþhï)3Þb¥¨@=JyÊçu¥ÒpQ_ÅSÑuã=M®åZYáºÐC{k+®QIK¡kl{{áõÍv}Y(þá¥ÔU=Jvµ«	æÁP~Jâ:3_320l}lBËGËUËeKÆ:w²MÎ;Ð<=}¶Só_gL5v³²ØC=J¹|ç{ËËzÝs¦iDüiCëÛóûÇvçúè§2$1"¥%låz®¯Þ8½Y,Î»DÐÎÄþg9ß²Æz@»ÐG=}®EF^lD4 b!+7 |k}éiê1?Õx¯á®aTæ@13Y3Y2ù2y3¹3¹29392¡3á3a22Ã®µ®®ý®=M®í®'®®G®÷®®ÿ®353Ý3}3=}2M3­3S®blNË1Ë]Ë7Ë/k¦¬Jº=JyO~Oâ;2?3?2:ù¤l¬ÑÄhªúÂúÄúÇP6QöNÖKFz<Æoö3®c®§®.a®Ó®í®¬vFl"´ªÁÉP@Kµ=Jkèupò/ÞLvQN~ÞP}<@=}Ü2ò%®®®½®ñ.ôoc¬UëÇÊQ2!/=Mx:@;v.ìÀ=}uº(,2[Ö%:|ÀúÇÆð ¾BÕÕ¸V\\ðS\\ï\\î\\n.ÃëµöÅ¶Z±¶úãNMM¶£Ls¿ò6Å©ÁÎ°V\\mü§sÜçQsuÚó>!\\9eÛ'sTu¢¾Osé»ÎÍ¼µÁó­Áb8®ÙóZdìÞ5VÉz°=JjM6JQ¶¦¥Ð7è(ö©°n¿N9Àì¤Ûè×ðXqàÓKa¸ß!½À¬ysu ÿ÷ìêPÔÊxêýÌT¤0ÔðÇæD=MFËFQl*ÑF F=MØjT>Zö¨x)8	¸¾,ñDÚ¬öÈ²ª=M¸ùªß¯ÅsCêÎmF½½ê")vÚ=J<gTËqWK]¿¢5>¼BÀ1EGd>=@Ë¤[G Àúç½8!ôZÜæ81Æò£5AGp=@Ë¡?GH=}Æcäã9 5Õ£L^[WÅJÅtÍ6&)i°,#°18ymÊè§è4iÛÞ¤dEèzJ×X_ü,b=}4b¤ÎÿØÍq¸N.ãkóç ÿÇ¦Q,¬"vOùrÜÙâ-t¾>9¸dÑ|RPÚá/ñëöÖ3Z¾dB¹7FªÇÍò 2ìbï)û6/Éâ¿ÄXÉU§ô~'Kù(äÈ]¶ýôÅ¨ºn)6ëB!ó ZtwÁùcV)­¾ÉÚöÀIIÎ,¢m¦L=MÄ~:åOE6ÁË½4kÁ1%ìúçX,=MÌúß±XçB±©t(¬-ý¼Ð©ØÆé)ùÙrÑ)G))iRWW(	ë)=@i©))&G)	Ï©(§O©¯^Ç©Åi©¦T))"é%i&(§Sð=J©¥()÷Õn&	"iðµãÿý½ø×ãdfÊù©ãÆ5c=J4Øæö/Hhµ©1áùðk7=JtÂ¦) xÃCY2U XwZ&gÀ/¹Wøõ¥ZRå=}Jü´åÂÝ:U°¼w _þl:ÌEöB·ïµ	ã!sáz¦¡¯iEÅl¯µ¿VïÕ°©Õ/ÌÞüöõATäâfñ¥.ÕcÖÃäÒ­½ÝÇ(Ò«jXj kI~ùíxpsuÈn(8xf¦&'ã·È1NP¡=@IÍÄÊÅ_U¼	'>(öÿ8»ØÃ±göËµÿÏ",8\\øh+wdnÀ'ÂàË";!;ÊÊUÙÚàÜXôB>°íq_ß0j\\P/¨YÀßûwþÇú?|Ï:ðÐÀXÙ¡Ó?ÎÈéÅi¥ÎQ«UÎÌÆm{±Ü¤Y[ÉØW;c¥AxääÖwÞ^y8xÅ©zýF¨×àZî¶ê\` q*qwÏwCàü$)ÙõÞF¾Æg(Äà)¶^¨|âh@Í¢\\MÇ=MÄßvû¥f+#5öAîæ¯É½±jí³Éb!õÛ¾÷äÑ¾*EEëºÏõd\\ÙÖîDÏÕ>VÛQ>³âUëÉêØÃß¿¿¿ßë& aUÚJr¨EEUôéì=@8hÅ­ìàà=@ ¯÷z°]Æ+ÚXêü\`h¯Ô¦#dG»i©(,/îéA>Ê&Ãé³¦yy&PÕ!o'®¤{²}çÂ¤£»¤[bøwd#ØHu?Q¾õ·gkäYág.#XDNÌ¥îÒ}ANQ{µwñÿû×XÑ³åÆ¹¡ûÑ&æõ:E®ºxE.9©+åJ Ae¶'OxïTøÀ´÷k¥ìçÔõ<Xã-âuë=Miï£AÓ¬yÚº´ù(L[_u8èK»syâGÐN×³ôþî¨NÓ.å­Es»[1´×Ì´î8aóÈ~~½cT]à0#|ô{ÔAyÌ+dð²<¾&Ï°äêÒqEã¾¸2¦1Þß\`éÃVìÓ×GC¼þÀËÞwPM^pwßµ"³k¡s4óQ×Î,.G.g8sÉÌAa }ÄvÁ=@UGlHVTiß=MÚàÓ@DõËÌTÅnµ¬ú,?aáÙþà³ ASAßGtIAÁý÷·ïÇ±G×WKÒ÷ÞÌ¡dÚ/LvÞrÞñ{ðôçýK³çMðqÞlÞsSuÞÑ.mÞÀ&Ã^ýðÎ^°ÂÎ­.§J!ºrû9{v»´ø$>ÿ}\\d[®dÎ=JsT±µ(ïB¡S·Ø24w,íì3¬lûÙ=@\\Çwz4¹÷èî'Ðà}³¹¥	3pgH-ûIýjÏ®_ö¸:ÍË"^é¹»èÀÀ½m¨¿»iÐhoXqúXRXdÔW.û14'"±Ú9.aß±e³.û-D¿ÏAL¿éy¬H[ðãFÓâÆð·ñsøSAÍYÈ_zAtmÓzÉÁI?ô¿|?ÖNAFÊzÉÁIQsãß§Ð½¤k©Ôvñg¼ÛxÎC%¸Î~mL%kúT±/ßlÅ y=}¬_?~°únåÖòÌº,ë1bl=M0Ïl,ÔZnrÌÌË.¬ûItÄ°*8®V´»n9=MY±-åñò¨¿}´¼P{@8ÕÜJpó¿wé!-Hlèqò¼(Gñ³ëX@Bõ®ßâñò¶¼)W¸ü--V¾èËáSs@LÇtÙÄKq2i«Y½#f¶èUCår7 òã9=MOá¯¸A¦º=M=J8ÛIÚ$µ%K$	ùBýªZ³ï-ß¢TñÅÕ§¦:ßFd.#<'5ø0ëWìÖßLÈ=JH¥tÞ[âOåsIµñJm%h%v¶Nc=MxåÙÌem¨ïcñ+®<ÅªWTqÇëáîüAb6âî;û¤^0ëÅÑzkX©]Éé=J+1;a1-»»]õ[5ÉÎF}.QÂf§iw8Ns["Ãj¤²L9hÁÅZ8UÓÊÈñjÂ\`§fstQÖpÓC0ú¹»Î7®ÛÆsRÓÕ<%HûæXOñBãÇý#¹¼ßÈÓnQñîfîëãÃüØ¤læUoÙ)NË¶¦QR®X¿@¶p5¦M±=@Ï	Ss{¤¿þÈÂP±5c8ºZ¼©þsôÔFui¼Äý©?çÒÜÐ²=JsDk9F¯ð;Ò+t[r¦qeÏ'3ÁOÓAÄêdzé5UÊª¦à¶Zá} g8G>Q®º¨ÏvË+®»\`ÌHVS-{ÐÐ)WÊ¢%5!Õ¢ =M#ÜzaòjÝ«<H[q\`Ïòd9¨z¿Â!ÆçZ;OrçNGívP=@<©uA-tçú25¢hô&,_!g6M(4µ¾ s´Á_¬çvÕP%hÃ]5HZì¦±<å­Iþ»in#A!5Â®=@ý2ó©póù¼_ç2å·6¥tZMl®fuüfF~NjØ~5JsâÃmùnøÍNS2&ôåú6ÿhÜ¸âø#ÁBÏ¦Xô½fä®£xxy9ð+°°,Ù2R%tvØ&5Ói¿ÍyçJÀõhS*K	%Zhñ ÖjU°o¶Æpr#F¬-ÓK¾HB²îÁó|ñHl_ª­ú^Da{98õ^ÐhóU)S)EÂÆË5óê¤1¾=MGQ-ÏfKlYÁ·{ÀOcWø¿#¹Ï§;sKÎ¼ä\\w	òDïÀX"4±×ygIDÙ}3Rÿt¶ºH*wQRÛHfùRsÏ[ï½c»Î^4«¤gµ¯ñÑ¨ï9U	¯!u:¤jû,,5ÑMl½AIô¼Ù¢+l ?Ù¨A¨WßÖðÔAºº$¼0¾»>Ù¨w(¯YÙ)M©÷u F<Eqò£c©s¯¡ÉU<Ø"ZKÙYO¦-YR©l$È>E*ì%fiËe>yk>_ÑG÷mfºsWLÁÓ_¨~£u"3{8ItÓi¾ã±ú ýÁÒWÒx{»ÓÉ=JâVL!,eb¹HÃyÙkËe_°NÇDËú99®Ù±N|_ª?Éj¢.®ÝÂÕ;è¿ÜYN»¿ù7t7ßØÛ@N%Í÷	*«3en÷YãºöùÞ&«cèôÜ'ÖôÒ¯bØýÔ9|ÅÚl¬UÒ5×KsCÜ¨ÒP°wÜÑÍîÀòR1õÒ-¾¤å¥2éÈ¼Ùàº¨o^_OÓOÀÔÓ¯Ún¸Ó±Ø]òãÝº3·´C¾¥o1¶pivß=JæV´dl¾À3'Ê©Ë9®P"(Ñ|m¾»}5wZ¯UvL>_ªL)9µÎ¿IKñ\`=Md#â×Ò-îæy¾½N¥8ìAÙ÷!®1zTñI>h«ú,É=@+´î5WÊ¾Ò×7RÙö+G-û!û¤'}hj%ÉÕ/Þß+(¹éK¥,×(Ç©t	ôè'l¯\\(_×àP#ÄöU¨!ßö0ÜWf{´ÚÚ?òq¿ÿã®{F}ãy.K#´0b4[Õ:UþU¯1Ë¢8´	Ú°ÂA¾í:±åÔKñaº=JRÏÁMÙ¼>¾C«l·ºóLÆURÂÂ?F&Á¾¨Æ;wWííü-^Ijí"zx5=Mb=J.wERÈª<¥Y¦)cô)/Ð£*¨#U=@QïÉV)F°2)ìíA!=}¾jß®65[iò$?u©ªé±SìU@7MþÁý)î¯íÜ4K)L*Eè²\`o¿ë7þSX&¬ÄJ1]Ó5W?¶Ò3h 1¾Æ	{IRäjû-pKÎ¨aáÞÈ=}Ù©o ¯1J¦%©'g¤x¢"´=@¿?9ï3©!Nã.[-röC[yò,¾ß8[ï¶$??IjÛ%q©ïäÏü´8:kì$©æLÎ×&¾~c}ÕI&y»©=@éÜÍ×>îÌÔ9í?ÿ;]³lH/k@ezô×¼È	@{ý»iîvôpÏÆ\\W/~×¾y©ºAçµºxªç873,¢®d·1¢ýFBøËY²HÕ=@=@$/²ï»@ÍsÂCgGÜÝe\\çj"Ï.øÃë×îðÿ\`EÙÖð=Mhþ]ëÓúp§?à!§z¨sfÒº7ùacþH«P§ZRujúHbeßX¹Öµ£ùl¹{¢ë´¯=@ü¨à?´©®lPJØF¸9±¡^çC5LEê%¨9yë×11B.Ù@îÞ =MXhTØ+Å½=JÅé=}0ç´ñÕÊ	F(ùéï·¿?ÏTôðv~Ü1P_·Þ<½lã©±mÇFo<0³Â³RÝáC¸pê G¯3Ó¥ÛÖ&v^Å³\\Çy%JU?¾z-ÓAÝë K_=JòªöMV¦'OÖ±y9óÂ4BfÏ<$~C¶÷9¸E}ó'òR]I kßz(E;ÛûmÄpö)WçÀ·Ñ0=MÒýÆ5¤³OïtM^gL¥KD&D-©¶|¸¡ºÌ=}ÉçªÍ,zÏÆG	9d~¥?Îzc¾cÀ¯¯¨<LÇ%xM¨¢6m±Ç±µ]G±å¤ûÍ²áo!0=JFäþé¬UÑ¾µ1fp	ïXË©Ò0bºíR¿0ùTVqÕÉíÑnW¶2ñòdæÂ&c=@&^6ø!ÈÌ£õðR@DÕ\\ù=MñH·úñ¢6¯fÀÆ·Ú >E°O¥pìBb@=M½$î²i«!Ü¢èZP7©.á{¢R.±X"íïS[x¬íë¨R=J<8wç"=}®ØÉôYùfíÃð=J¬öSÁe	í£$;NF%GO¬=JáQQ-1¥=JEÕa2hàEA6Gß¨:¦\`WnÝ¥ZÒp>B±î}:ÑL&8ùî*ÑÀ2HGùÝðâ¨¥>"û¥B­Hg&Û'm{^) MÌÀðÌMv-5GáñWvïÕä&ât£>7Épß	åÊÔSrè½9ÀÝò\\ÂÅQËýMvÈè6EÑèîó æú}îµù°§Ùò6«°=MÕíúÛÇQnÎM¦[þ-Éátk	]2°Ç¢ç²póòhäA­·Y¨h¶£}4W°Ê¬%\`ö¶ î(Miwó8Âç9ðB±³Kä=}'4xñ]èQ(G!%ØjÈ@²âêÖö»ü@Dy)ªLÍQìY"4ÐÿÇ¹ö®³Rß#8ÜíÛx¦»à2üè)&Ä0%å&Ü¡Øë§°ªS d?	eì¢¢e8¶´7WbÞ*Îâ=MëùYóe4¿¯ÿ;[¼'ÄRdçV=@¯4u íI¯Å- ®ì¥=JfÎ¡Ä¯&7pì u~b;¨z¡k>=@e¦ð¢[Y Ù#6±èñdq¥ÏiyÅ¸öpç{Ð?Îx¦®=}'Ïd"åÿò-Iz"on®pËÿ¢Ä¦ûãýX^ÍU| h­ñaÇµò³Y{=JÚMä=Mì÷4Z´øè°){®_ä±<eÁÌw¢æÔVÅ=JþêHÉ!i´ô|[l+¶U¿²'õM¦G¹H* ëµÅÛTE|¹Iñó¦?Ú³aPø·¶_'Zä#oæè2%ýÈ=M±ñÿ»#áï8Æâ<±S1TìüùôÇ÷ß	w%,²ùü°ër>­ä¨1Q1Y·ááhÏ¶#+a}ç¼Q_ü<¿Ã¥rN¢.?®[ÔPæt¹pÒhWè¸]p~"$FÍø_±À=}8¢a°ÕÛ\`8PF­W?%«HôïnáöoÒ>	68ÑÚµ{rZàjvÑÕÂýx±\`Gê#÷Ò#YtÂ¥Êåw¦Ý<?=@=JåD(Úæ>!{qçÔ®ÙÍìÇ@¯Ñ{Ù¥Íûoú©i1E@Ép¯ÚwM>é¢Bm ÈêuåÛä¾/±@9±wÉY=JýÛ>g¸¸B[Ø?F·¼ ;ÂCf3 ëï9²'C­ðÿ¬ÿÝß*ç%ÞpuÙ?çáEæêãÝ&ê6>3Ç.§çã1t\`±ÞªCbì¾$¸ðëUiùA2_û}RB­³i'ªQúàbéU´C³CI7í$J7c¬Zùáb¥A§@¶ë;ZafXíüC6Ìí=MµOÚ×JÄÀ´¸Sgô,%­y¡>:­Dëâ¡6fiíÇÝù=J\\":Ñ=@°7)¯¶<ö§Ø=MÑ9%·÷6È¶Â_þfIk³­Úé¢Iædè<ÈsEg=Màâèè2¼áë×Kf¨f´bíü¯[^dÈxbZ?IhnÑºqâj'¯<ÂÚU ø¤9é?¢øê§(béÌ=}\`Ø®=Mq´ìÆaelßx=MZ7ÆÿoöÁÕ:_9ï¥Fë1åÀâ &GP¹íûÿöRæ	â<¹¨i3É1{çØ;+¿ÄÊ¯Z&§Kæ1ÿõÉq%·Í:\`LdâF«ñõr	©@ Ìì@nù²ªáÈú¡6U¹¦9'AÒßíÅe i¬öY¥LvÕ#21u«Ûõæ-qñ#ÊòFãh$e~Ô=@>ÉÇí¯«ÝÛÊmd¹¨µx=@ê¹B¹ª_X²$\\d¯;+bX@´c_ãÌ²à8ý$ñB\` cðàÄ¯aQ'{06Dû<Ý¹lí¯ÁãquØ±Ò1·ºgi5È«k{uÛ±«"[Ô¸qánÝ7T£·ñÞp·âß=J6æÍaHôIìèØ=M['Æç9 %¸=M|áIû	¦ÿbF¿pqß+ý{öb0×0K×^ªÛ}úiFç³Á0çg¥¨IÙÌò-ý ëÞÎT6	Ö­ÚGÀàç6!ö²èÀ³ÑÁë4yØcFªí·Üz¹Ú±ºZÌA°8Ø6%×_Ú&ï¾1¿È=}§Ä"ËË"èv¤ÝDMÜøÐ;x&r¤5[¡r¦B±ä½0îÀ¿²Ó/Ää©øYgiæ©;äØËâa7ëCÅ a>	æÁéNF!rÅßb0üÝ»(¢rò¹ô	GR¸ÇÏã¶âë}d¦¹$é¤¿"Y©t+U¬\`àjKåìo´AUzÌÎÍ}ÓüôÀUëãÌè¼µ¢5!É²)(³)ÊZéßbæL¨Q½AÊ¦µle¥ØüåµíX;íÆn>+ÅûÆ^ÜqöêßAÕ]ß3§3[¼ýÕåÖ$Uøw_¢#¦¶¤,sh-ÍðA¦(l&Úßâ×_Y Ú@£nø=J#YRN\\²}b#ÂkXzø:&ª"¡¬RøÓó1EUï]=Mè	ë^oP&¡Æ=}³5ïõ!U"¶õ<¢®+ø·¦#ß¦T½i#Q8c6~µøØÒ°Ó/ÉJéìHÆïåÍ&+#LáÐÇ½ T×Çí%.¨&$}÷¯Yé­|Õà©Çªäë·Da3ôíjÆãbÕÈøvXÇñ¶ücÙvéÐÝÄ@ÉøÖNVÇ.ÏÝ¦É2ù\`[ç®"Fë»ê!¬ýu;b´2fOÀø=MÏ3&=Jjd¹ÃÐ½1oEbÁö'CÖi­Ú(6=@Éë$]©0ù'CÖi­Ú(ýÖi­ß=JìRö&¯ÃéZAhWè\\ùÌóç¦&ÎLûÔ02(c%j=MÆ9{Éb"ë±k2èî.7ãøî#&hëVÌ)sFQ#¦cÁjâÞÒ¦B³î¯eÕ»jX1S¦Røü¼r£½ÉYrùùNÕq£0!Í!ùÎu=@¤tvx¤P»È¤ãÅÅÈ	½òSÉY)Á)e×:f[­6÷)ìåGù>M¹1¶>8;í!­9ÏR¯=JS¥ #I%©*`), new Uint8Array(107396));

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

      // min theoretical frame size
      // mpg123 works when the input data is at or smaller than the actual frame size
      this._rawDataPtrSize = 48;
      this._rawDataPtr = this._api._malloc(this._rawDataPtrSize);

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

    _decode(data, inputPtr) {
      if (!(data instanceof Uint8Array))
        throw Error(
          `Data to decode must be Uint8Array. Instead got ${typeof data}`
        );

      this._api.HEAPU8.set(data, inputPtr);

      const samplesDecoded = this._api._mpeg_decode_float_deinterleaved(
        this._decoder,
        inputPtr,
        data.length,
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

    _decodeArray(dataArray, inputPtr) {
      let left = [],
        right = [],
        samples = 0;

      dataArray.forEach((data) => {
        const { channelData, samplesDecoded } = this._decode(data, inputPtr);

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

    decode(data) {
      const input = [];

      for (let offset = 0; offset < data.length; offset += this._rawDataPtrSize)
        input.push(data.subarray(offset, offset + this._rawDataPtrSize));

      return this._decodeArray(input, this._rawDataPtr);
    }

    decodeFrame(mpegFrame) {
      return this._decode(mpegFrame, this._framePtr);
    }

    decodeFrames(mpegFrames) {
      return this._decodeArray(mpegFrames, this._framePtr);
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
      }).toString()})()`;

      super(
        URL.createObjectURL(
          new Blob([webworkerSourceCode], { type: "text/javascript" })
        )
      );

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
