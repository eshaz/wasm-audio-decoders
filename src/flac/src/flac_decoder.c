#include "flac_decoder.h"

#define MIN(a, b) a < b ? a : b;

FLAC__StreamDecoderReadStatus read_cb(const FLAC__StreamDecoder *fl, FLAC__byte buffer[], size_t *bytes, FLACDecoder decoder) {
    if (decoder.input_buffers_len == 0) {
        *bytes = 0;
        return FLAC__STREAM_DECODER_READ_STATUS_END_OF_STREAM;
    }

    int input_buffer_pos = 0;
    size_t bytes_stored = 0;

    // for each input buffer, store the data into the flac cb buffer
    while (
        input_buffer_pos < decoder.input_buffers_len
    ) {
        unsigned char *input_buffer = decoder.input_buffers[input_buffer_pos];
        size_t input_buffer_size = decoder.input_buffers_lens[input_buffer_pos];
        size_t input_saved_len = MIN(input_buffer_size, *bytes - bytes_stored);

        memcpy(buffer + bytes_stored, input_buffer, input_saved_len);

        bytes_stored += input_saved_len;

        // save partially consumed buffer
        if (input_saved_len < input_buffer_size) {
            size_t input_remaining = input_buffer_size - input_saved_len;
            decoder.input_buffers_lens[input_buffer_pos] = input_remaining;

            memmove(input_buffer, input_buffer + input_saved_len, input_remaining);
            break;
        } else {
            input_buffer_pos++;
            decoder.input_buffers_len--;
            free(input_buffer);
        }
    }

    // shift any remaining data to beginning of input buffer queue
    for (
        int i = 0;
        i < decoder.input_buffers_len;
        i++
    ) {
        decoder.input_buffers[i] = decoder.input_buffers[i + input_buffer_pos];
        decoder.input_buffers_lens[i] = decoder.input_buffers_lens[i + input_buffer_pos];
    }

    *bytes = bytes_stored;

    return FLAC__STREAM_DECODER_READ_STATUS_CONTINUE;
}

FLAC__StreamDecoderWriteStatus write_cb(const FLAC__StreamDecoder *fl, const FLAC__Frame *frame, const FLAC__int32 *const buffer[], FLACDecoder decoder) {

}

void error_cb(const FLAC__StreamDecoder *fl, FLAC__StreamDecoderErrorStatus status, FLACDecoder decoder) {

}

FLACDecoder *create_decoder() {
    FLACDecoder decoder;

    decoder.fl = FLAC__stream_decoder_new();

    FLAC__stream_decoder_set_md5_checking(decoder.fl, false);
    FLAC__stream_decoder_set_metadata_ignore_all(decoder.fl);

    FLACDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;

    FLAC__stream_decoder_init_stream(
        decoder.fl,
        read_cb,
        NULL,
        NULL,
        NULL,
        NULL,
        write_cb,
        NULL,
        error_cb,
        ptr
    );

    return ptr;
}

void destroy_decoder(FLACDecoder *decoder) {
    FLAC__stream_decoder_finish(decoder->fl);
    FLAC__stream_decoder_delete(decoder->fl);

    free(decoder);
}

int decode(
    FLACDecoder *decoder,
    float *in,
    float *out, 
    unsigned int *samples_decoded,
    unsigned int *channels,
    unsigned int *sample_rate
) {
    // append to input buffers
    int error = FLAC__stream_decoder_process_until_end_of_stream(decoder->fl);

    return error;
}







