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

  // *start is first position of _data, *cusor moves as reads occur
  unsigned char *start, *cursor;

  // this tracks number undecoded bytes in buffer
  // increases when bytes are enqueued, decreases when decoded
  int num_unread;
} ByteBuffer;

static const int pcm_len = 120*48*8;

typedef struct {
  OpusFileCallbacks cb;
  OggOpusFile *of;
  ByteBuffer buffer;

  // 120ms buffer recommended per http://opus-codec.org/docs/opusfile_api-0.7/group__stream__decoding.html
  float pcm[120*48*8]; // 120ms @ 48 khz * 8 channels
} OggOpusDecoder;

OggOpusDecoder *ogg_opus_decoder_create();

void ogg_opus_decoder_free(OggOpusDecoder *);

int ogg_opus_decoder_enqueue(OggOpusDecoder *, unsigned char *data, size_t data_size);

int ogg_opus_decode_float_deinterleaved(OggOpusDecoder *, int *channels_decoded, float *out);

int ogg_opus_decode_float_stereo_deinterleaved(OggOpusDecoder *, int *channels_decoded, float *out);

void deinterleave_and_trim_pcm(OggOpusDecoder *decoder, int channels_decoded, int samples_decoded, float *out);