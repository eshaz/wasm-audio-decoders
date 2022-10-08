#include <stdlib.h>
#include <string.h>
#include "stream_decoder.h"

typedef struct {
    FLAC__StreamDecoder *fl;
    // input buffers
    unsigned char *input_buffers[1024];
    size_t input_buffers_lens[1024];
    int input_buffers_len;

    int samples_decoded;
    int channels;
    int sample_rate;

    // output buffers
    union {
        float *floats;
        int *ints;
    } out;
    int out_len;
} FLACDecoder;

FLACDecoder *create_decoder();

void destroy_decoder();

