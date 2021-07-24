#include <stdlib.h>
#include <string.h>
#include <opusfile.h>

// This shouldn't be needed by calling application, it's here for OpusChunkDecoder
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

// Main persistenc object.  Pass this to decode()
typedef struct {
  OpusFileCallbacks cb;
  OggOpusFile *of;
  ByteBuffer buffer;
} OpusChunkDecoder;

// Always instantiate and free OpusChunkDecoder with these
OpusChunkDecoder *opus_chunkdecoder_create();
void opus_chunkdecoder_free(OpusChunkDecoder *);

// Returns 0/1 indicating failure/success.
int opus_chunkdecoder_enqueue(OpusChunkDecoder *, unsigned char *data, size_t data_size);

// returns total samples decoded for decoded data
int opus_chunkdecoder_decode_float_stereo(OpusChunkDecoder *decoder, float *pcm_out, int pcm_out_size);
int opus_chunkdecoder_decode_float_stereo_deinterleaved(OpusChunkDecoder *decoder, float *pcm_out, int pcm_out_size, float *left, float *right);

void opus_chunkdecoder_deinterleave(float *interleaved, int interleaved_size, float *left, float *right);
