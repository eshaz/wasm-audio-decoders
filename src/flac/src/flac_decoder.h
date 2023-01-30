#include <stdlib.h>
#include <string.h>
#include "stream_decoder.h"

typedef struct {
    FLAC__StreamDecoder *fl;

    unsigned int *channels;
    unsigned int *samples_decoded;
    unsigned int *sample_rate;
    unsigned int *bits_per_sample;

    // input buffers
    unsigned char *input_buffers[1024];
    size_t input_buffers_lens[1024];
    size_t input_buffers_total_len;
    unsigned int input_buffers_len;

    // output buffer
    unsigned int *out_len;
    float **out_ptr;
    
    // error information
    char **error_string_ptr;
    char **state_string_ptr;
} FLACDecoder;

/* callbacks */
FLAC__StreamDecoderReadStatus read_cb(
    const FLAC__StreamDecoder *fl,
    FLAC__byte buffer[],
    size_t *bytes,
    void *decoder_ptr
);
FLAC__StreamDecoderWriteStatus write_cb(
    const FLAC__StreamDecoder *fl,
    const FLAC__Frame *frame,
    const FLAC__int32 *const buffer[],
    void *decoder_ptr
);
void error_cb(
    const FLAC__StreamDecoder *fl,
    FLAC__StreamDecoderErrorStatus status,
    void *decoder_ptr
);

FLACDecoder *create_decoder(
    unsigned int *channels,
    unsigned int *sample_rate,
    unsigned int *bits_per_sample,
    unsigned int *samples_decoded,
    float **out_ptr,
    unsigned int *out_len,
    char **error_string_ptr,
    char **state_string_ptr
);

void destroy_decoder(FLACDecoder *decoder);

void decode_frame(
    FLACDecoder *decoder,
    unsigned char *in,
    int in_len
);

