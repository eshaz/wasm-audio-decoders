#include <stdlib.h>
#include <mpg123.h>

typedef struct {
    // stores the interleaved PCM result of one MPEG frame
    unsigned char pcm[4*2*1152]; //max_mpeg_frame_size*bit_reservoir*channels*sizeof(float)
    mpg123_handle *mh;
    struct mpg123_frameinfo fr;
} MPEGFrameDecoder;

MPEGFrameDecoder *mpeg_frame_decoder_create();

int mpeg_decode_frame(MPEGFrameDecoder *st, unsigned char *in, size_t in_size, float *left, float *right);

int mpeg_decode_frames(MPEGFrameDecoder *decoder, unsigned char *in, size_t in_size, float *left, float *right, size_t out_size, unsigned int *in_offset_ptr);

void mpeg_frame_decoder_destroy(MPEGFrameDecoder *st);
