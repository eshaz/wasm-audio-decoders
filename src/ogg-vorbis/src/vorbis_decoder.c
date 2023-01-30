#include "vorbis_decoder.h"

#define MIN(a, b) a < b ? a : b;

static void set_current_packet(
    OggVorbisDecoder *decoder,
    long first_page_flag
) {
    decoder->current_packet.packet = decoder->input;
    decoder->current_packet.bytes = (long) decoder->input_len;
    decoder->current_packet.b_o_s = first_page_flag; // first page of bitstream
}

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
) {
    OggVorbisDecoder decoder;

    vorbis_info_init(&decoder.info);
    vorbis_comment_init(&decoder.comment);
    
    ogg_packet pkt;
    decoder.current_packet = pkt;

    decoder.input = input;
    decoder.input_len = input_len;

    decoder.output = output;
    decoder.channels = channels;
    decoder.sample_rate = sample_rate;
    decoder.samples_decoded = samples_decoded;

    decoder.errors = errors;
    decoder.errors_len = errors_len;
    decoder.errors_max = errors_max;
    *decoder.errors_len = 0;

    OggVorbisDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;

    return ptr;
}

static char *error_strings[] = {
    "Unknown Error",
    "OV_ENOTVORBIS the packet is not a Vorbis header packet.",
    "OV_EBADHEADER there was an error interpreting the packet.",
    "OV_EFAULT internal error.",
    "OV_ENOTAUDIO the packet is not an audio packet.",
    "OV_EBADPACKET there was an error in the packet.",
    "OV_EINVAL the decoder is in an invalid state to accept blocks.",
    "vorbis_synthesis_init error"
};

static void add_error(OggVorbisDecoder *decoder, int error_code, char *function_name) {
    int error_idx = 0;
    switch (error_code) {
        case OV_ENOTVORBIS: error_idx = 1; break;
        case OV_EBADHEADER: error_idx = 2; break;
        case OV_EFAULT: error_idx = 3; break;
        case OV_ENOTAUDIO: error_idx = 4; break;
        case OV_EBADPACKET: error_idx = 5; break;
        case OV_EINVAL: error_idx = 6; break;
        case 7: error_idx = 7; break;
    }

    if (*decoder->errors_len != decoder->errors_max) {
        decoder->errors[(*decoder->errors_len)++] = function_name;
        decoder->errors[(*decoder->errors_len)++] = error_strings[error_idx];
    }
}

// call with each ogg packet (id, comment, setup)
void send_setup(
    OggVorbisDecoder *decoder,
    long first_page_flag
) {
    set_current_packet(decoder, first_page_flag);

    int error = vorbis_synthesis_headerin(&decoder->info, &decoder->comment, &decoder->current_packet);
    if (error) add_error(decoder, error, "vorbis_synthesis_headerin");
}

void init_dsp(
    OggVorbisDecoder *decoder
) {
    int error = vorbis_synthesis_init(&decoder->dsp_state, &decoder->info);
    if (error) add_error(decoder, 7, "vorbis_synthesis_init");

    vorbis_block_init(&decoder->dsp_state, &decoder->block);

    *decoder->sample_rate = decoder->info.rate;
    *decoder->samples_decoded = 0;
    *decoder->channels = decoder->info.channels;
}

void decode_packets(
    OggVorbisDecoder *decoder
) {
    set_current_packet(decoder, 0);
    
    int synthesis_result = vorbis_synthesis(&decoder->block, &decoder->current_packet);
    if (synthesis_result) add_error(decoder, synthesis_result, "vorbis_synthesis");

    int block_in_result = vorbis_synthesis_blockin(&decoder->dsp_state, &decoder->block);
    if (block_in_result) add_error(decoder, block_in_result, "vorbis_synthesis_blockin");

    // save decoded pcm
    *decoder->samples_decoded = vorbis_synthesis_pcmout(&decoder->dsp_state, decoder->output);

    int synthesis_read_result = vorbis_synthesis_read(&decoder->dsp_state, *decoder->samples_decoded);
    if (synthesis_read_result) add_error(decoder, synthesis_read_result, "vorbis_synthesis_read");
}

void destroy_decoder(
    OggVorbisDecoder *decoder
) {
    vorbis_dsp_clear(&decoder->dsp_state);
    vorbis_block_clear(&decoder->block);
    free(decoder);
}