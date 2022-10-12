#include "flac_decoder.h"

#define MIN(a, b) a < b ? a : b;

FLAC__StreamDecoderReadStatus read_cb(const FLAC__StreamDecoder *fl, FLAC__byte buffer[], size_t *bytes, void *decoder_ptr) {
    FLACDecoder *decoder = (FLACDecoder*) decoder_ptr;

    if (decoder->input_buffers_len == 0) {
        *bytes = 0;
        return FLAC__STREAM_DECODER_READ_STATUS_END_OF_STREAM;
    }

    int input_buffer_pos = 0;
    size_t bytes_stored = 0;

    // for each input buffer, store the data into the flac cb buffer
    while (decoder->input_buffers_len) {
        unsigned char *input_buffer = decoder->input_buffers[input_buffer_pos];
        size_t input_buffer_size = decoder->input_buffers_lens[input_buffer_pos];
        size_t input_saved_len = MIN(input_buffer_size, *bytes - bytes_stored);

        memcpy(buffer + bytes_stored, input_buffer, input_saved_len);

        bytes_stored += input_saved_len;

        // save partially consumed buffer
        if (input_saved_len < input_buffer_size) {
            size_t input_remaining = input_buffer_size - input_saved_len;
            decoder->input_buffers_lens[input_buffer_pos] = input_remaining;
            decoder->input_buffers_total_len -= input_saved_len;

            memmove(input_buffer, input_buffer + input_saved_len, input_remaining);
            break;
        } else {
            input_buffer_pos++;
            decoder->input_buffers_len--;
            decoder->input_buffers_total_len -= input_saved_len;

            free(input_buffer);
        }
    }

    // shift any remaining data to beginning of input buffer queue
    if (input_buffer_pos) {
        for (
            int i = 0;
            i < decoder->input_buffers_len;
            i++
        ) {
            decoder->input_buffers[i] = decoder->input_buffers[i + input_buffer_pos];
            decoder->input_buffers_lens[i] = decoder->input_buffers_lens[i + input_buffer_pos];
        }
    }

    *bytes = bytes_stored;

    return FLAC__STREAM_DECODER_READ_STATUS_CONTINUE;
}

FLAC__StreamDecoderWriteStatus write_cb(const FLAC__StreamDecoder *fl, const FLAC__Frame *frame, const FLAC__int32 *const buffer[], void *decoder_ptr) {
    FLACDecoder *decoder = (FLACDecoder*) decoder_ptr;

    *decoder->channels = frame->header.channels;
    *decoder->sample_rate = frame->header.sample_rate;
    *decoder->samples_decoded = frame->header.blocksize;
    *decoder->bits_per_sample = frame->header.bits_per_sample;

    *decoder->out_len = *decoder->channels * *decoder->samples_decoded;
    float *out = malloc(*decoder->out_len*sizeof(float));

    *decoder->out_ptr = out;

    int divisor;

    if (*decoder->bits_per_sample == (unsigned int) 32) divisor = 0x7FFFFFFF;
    else if (*decoder->bits_per_sample == (unsigned int) 24) divisor = 0x7FFFFF;
    else if (*decoder->bits_per_sample == (unsigned int) 16) divisor = 0x7FFF;
    else if (*decoder->bits_per_sample == (unsigned int) 8) divisor = 0x7F;

    for (
        int channel = 0, channel_offset = 0;
        channel < *decoder->channels;
        channel++,
        channel_offset += *decoder->samples_decoded
    )
      for (int sample = 0; sample < *decoder->samples_decoded; sample++)
        out[channel_offset + sample] = buffer[channel][sample] / (float) divisor;

    return FLAC__STREAM_DECODER_WRITE_STATUS_CONTINUE;
}

void error_cb(const FLAC__StreamDecoder *fl, FLAC__StreamDecoderErrorStatus status, void *decoder_ptr) {
    FLACDecoder *decoder = (FLACDecoder*) decoder_ptr;

    *decoder->error_string_ptr = FLAC__StreamDecoderErrorStatusString[status];
}

FLACDecoder *create_decoder(
    unsigned int *channels,
    unsigned int *sample_rate,
    unsigned int *bits_per_sample,
    unsigned int *samples_decoded,
    float **out_ptr,
    unsigned int *out_len,
    char **error_string_ptr,
    char **state_string_ptr
) {
    FLACDecoder decoder;
    
    decoder.fl = FLAC__stream_decoder_new();

    decoder.channels = channels;
    decoder.sample_rate = sample_rate;
    decoder.bits_per_sample = bits_per_sample;
    decoder.samples_decoded = samples_decoded;

    *decoder.channels = 0;
    *decoder.sample_rate = 0;
    *decoder.bits_per_sample = 0;
    *decoder.samples_decoded = 0;

    decoder.input_buffers_total_len = 0;
    decoder.input_buffers_len = 0;

    decoder.out_ptr = out_ptr;
    decoder.out_len = out_len;
    *decoder.out_len = 0;

    decoder.error_string_ptr = error_string_ptr;
    decoder.state_string_ptr = state_string_ptr;

    FLAC__stream_decoder_set_md5_checking(decoder.fl, false);
    FLAC__stream_decoder_set_metadata_ignore_all(decoder.fl);

    FLACDecoder *ptr = malloc(sizeof(decoder));
    *ptr = decoder;

    FLAC__StreamDecoderInitStatus status = FLAC__stream_decoder_init_stream(
        ptr->fl,
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

int decode_frame(
    FLACDecoder *decoder,
    unsigned char *in,
    int in_len
) {
    int success = 0;
    *decoder->state_string_ptr = "";
    *decoder->error_string_ptr = "";

    if (decoder->input_buffers_len == 1024) {
        *decoder->error_string_ptr = "Too many input buffers";
    } else {
        // append to input buffers
        decoder->input_buffers[decoder->input_buffers_len] = in;
        decoder->input_buffers_lens[decoder->input_buffers_len] = in_len;
        decoder->input_buffers_total_len += in_len;
        decoder->input_buffers_len++;
    
        success = FLAC__stream_decoder_process_single(decoder->fl);
    }

    if (!success) {
        *decoder->state_string_ptr = FLAC__StreamDecoderStateString[FLAC__stream_decoder_get_state(decoder->fl)];
    }

    return success;
}
