#include <stdlib.h>
#include <string.h>
#include <opusfile.h>

typedef struct {
  /*
     data should be large enough to maximum Ogg page size for instantiating OggOpusFile

     See https://xiph.org/ogg/doc/oggstream.html
     "...pages are a maximum of just under 64kB"

     Tested with 512kbps Opus file whose first data page ended at 54880 bytes
   */
  unsigned char _data[64*1024];
  void *start;
  void *cursor;
  int bytes_remaining;
} ByteBuffer;


typedef struct {
  OpusFileCallbacks cb;
  OggOpusFile *of;
  ByteBuffer buffer;

  // 120ms buffer recommended per http://opus-codec.org/docs/opusfile_api-0.7/group__stream__decoding.html
  float pcm[120*48*200]; // 120ms @ 48 khz * 8 channels
  int err;
  int (*decode)(OggOpusFile *, float *, int, int *);
} OggOpusDecoder;

OggOpusDecoder *ogg_opus_decoder_create(unsigned char force_stereo);

void ogg_opus_decoder_free(OggOpusDecoder *);

int ogg_opus_decoder_decode(OggOpusDecoder *, unsigned char *in, size_t in_size, int *channels_decoded, float *out);