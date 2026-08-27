#include <stdlib.h>
#include <string.h>
#include "neaacdec.h"

#define AAC_TRANSPORT_ADTS 0
#define AAC_TRANSPORT_ADIF 1
#define AAC_TRANSPORT_RAW 2

// size of NeAACDecFrameInfo.channel_position
#define AAC_MAX_CHANNELS 64

typedef struct {
    NeAACDecHandle handle;
    int transport_format;
    int initialized;
    unsigned int init_channels;
    char *init_error;

    // input buffer, only used to join arbitrary chunks of an ADIF stream
    // across decode_frame calls; ADTS and raw frames decode in one call
    unsigned char *in_buf;
    unsigned int in_capacity;
    unsigned int in_len;

    // interleaved float output accumulated over one decode_frame call
    float *pcm;
    unsigned int pcm_capacity;

    unsigned int *channels;
    unsigned int *sample_rate;
    unsigned int *samples_decoded;

    // planar float32 output buffer, malloc'd per decode_frame call, freed by JS
    float **out_ptr;
    unsigned int *out_len;

    char **error_string_ptr;
} AACDecoder;

AACDecoder *create_decoder(
    int transport_format,
    unsigned char *asc,
    int asc_len,
    unsigned int *channels,
    unsigned int *sample_rate,
    unsigned int *samples_decoded,
    float **out_ptr,
    unsigned int *out_len,
    char **error_string_ptr
);

void destroy_decoder(AACDecoder *decoder);

void decode_frame(
    AACDecoder *decoder,
    unsigned char *in,
    int in_len
);
