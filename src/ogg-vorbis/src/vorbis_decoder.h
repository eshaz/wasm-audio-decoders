#include <stdlib.h>
#include "codec.h"

typedef struct {
    vorbis_dsp_state dsp_state;
    vorbis_block block;
    vorbis_info info;
    vorbis_comment comment;
    ogg_packet current_packet;

    /* input */
    unsigned char *input;
    int *input_len;

    /* output */
    float ***output;
    int *channels;
    long *sample_rate;
    int *samples_decoded;

    int *errors_len;
    char **errors;
    int errors_max;
} OggVorbisDecoder;

static void set_current_packet(
    OggVorbisDecoder *decoder,
    long first_page_flag
);

OggVorbisDecoder *create_decoder(
    /* input */
    unsigned char *input,
    int *input_len,
    /* output */
    float ***output,
    int *channels, // 1 - 255
    long *sample_rate,
    int *samples_decoded,
    char **errors,
    int *errors_len,
    int errors_max
);

void send_setup(
    OggVorbisDecoder *decoder,
    long first_page_flag
);

void init_dsp(OggVorbisDecoder *decoder);

void decode_packets(
    OggVorbisDecoder *decoder
);

void destroy_decoder(
    OggVorbisDecoder *decoder
);