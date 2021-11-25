#include <stdlib.h>
#include <mpg123.h>

typedef struct {
    // stores the interleaved PCM result of one MPEG frame
    unsigned char pcm[4*2*1152]; //max_mpeg_frame_size*bit_reservoir*channels*sizeof(float)
    mpg123_handle *mh;
    struct mpg123_frameinfo fr;
} MPEGFrameDecoder;

MPEGFrameDecoder *mpeg_frame_decoder_create();

int mpeg_decode_interleaved(
    MPEGFrameDecoder *decoder, // mpg123 decoder handle
    unsigned char *in, // input data
    size_t in_size, // input data size
    unsigned int *in_read_pos, // total bytes read from input buffer
    size_t in_read_chunk_size, // interval of bytes to read from input data
    float *left, // left output audio
    float *right, // right output audio
    size_t out_size, // output audio buffer size
    unsigned int *sample_rate // pointer to save the sample rate
);

void mpeg_frame_decoder_destroy(MPEGFrameDecoder *st);
