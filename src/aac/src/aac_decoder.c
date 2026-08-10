#include "aac_decoder.h"

/* Output channel priority producing the channel ordering used by the other
 * wasm-audio-decoders packages: front (left, center, right), side (left,
 * right), back (left, right, center), then LFE last. Indexed by the
 * NeAACDecFrameInfo.channel_position values; UNKNOWN_CHANNEL sorts last.
 */
static const unsigned char channel_priority[10] = {
    10, // UNKNOWN_CHANNEL
    1,  // FRONT_CHANNEL_CENTER
    0,  // FRONT_CHANNEL_LEFT
    2,  // FRONT_CHANNEL_RIGHT
    3,  // SIDE_CHANNEL_LEFT
    4,  // SIDE_CHANNEL_RIGHT
    5,  // BACK_CHANNEL_LEFT
    6,  // BACK_CHANNEL_RIGHT
    7,  // BACK_CHANNEL_CENTER
    8,  // LFE_CHANNEL
};

static void compute_channel_order(
    unsigned char *channel_position,
    unsigned int channels,
    unsigned char *order // order[output_channel] = interleaved input channel
) {
    int used[AAC_MAX_CHANNELS] = {0};

    for (unsigned int out_ch = 0; out_ch < channels; out_ch++) {
        int best = -1, best_key = 0;

        for (unsigned int in_ch = 0; in_ch < channels; in_ch++) {
            if (used[in_ch]) continue;

            unsigned char position = channel_position[in_ch];
            int key =
                (position > 9 ? 10 : channel_priority[position]) *
                    AAC_MAX_CHANNELS +
                in_ch;

            if (best < 0 || key < best_key) {
                best = in_ch;
                best_key = key;
            }
        }

        used[best] = 1;
        order[out_ch] = best;
    }
}

static int ensure_capacity(
    unsigned char **buf,
    unsigned int *capacity,
    unsigned int needed,
    unsigned int element_size
) {
    if (*capacity >= needed) return 1;

    unsigned int capacity_needed = *capacity;
    while (capacity_needed < needed) capacity_needed *= 2;

    unsigned char *grown = realloc(*buf, capacity_needed * element_size);
    if (!grown) return 0;

    *buf = grown;
    *capacity = capacity_needed;
    return 1;
}

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
) {
    AACDecoder *decoder = calloc(1, sizeof(AACDecoder));

    decoder->transport_format = transport_format;
    decoder->channels = channels;
    decoder->sample_rate = sample_rate;
    decoder->samples_decoded = samples_decoded;
    decoder->out_ptr = out_ptr;
    decoder->out_len = out_len;
    decoder->error_string_ptr = error_string_ptr;

    *channels = 0;
    *sample_rate = 0;
    *samples_decoded = 0;
    *out_ptr = NULL;
    *out_len = 0;
    *error_string_ptr = NULL;

    decoder->in_capacity = 1 << 17;
    decoder->in_buf = malloc(decoder->in_capacity);
    decoder->pcm_capacity = 1 << 16;
    decoder->pcm = malloc(decoder->pcm_capacity * sizeof(float));

    decoder->handle = NeAACDecOpen();

    if (!decoder->handle || !decoder->in_buf || !decoder->pcm) {
        decoder->init_error = "Out of memory";
        return decoder;
    }

    NeAACDecConfigurationPtr config =
        NeAACDecGetCurrentConfiguration(decoder->handle);
    config->outputFormat = FAAD_FMT_FLOAT;

    if (!NeAACDecSetConfiguration(decoder->handle, config)) {
        decoder->init_error = "NeAACDecSetConfiguration failed";
        return decoder;
    }

    if (transport_format == AAC_TRANSPORT_RAW) {
        unsigned long samplerate = 0;
        unsigned char raw_channels = 0;

        if (asc_len <= 0 ||
            NeAACDecInit2(
                decoder->handle,
                asc,
                (unsigned long)asc_len,
                &samplerate,
                &raw_channels
            ) < 0) {
            decoder->init_error = "Invalid audioSpecificConfig";
            return decoder;
        }

        decoder->init_channels = raw_channels ? raw_channels : 2;
        decoder->initialized = 1;
    }

    return decoder;
}

void destroy_decoder(AACDecoder *decoder) {
    if (decoder->handle) NeAACDecClose(decoder->handle);
    free(decoder->in_buf);
    free(decoder->pcm);
    free(decoder);
}

void decode_frame(AACDecoder *decoder, unsigned char *in, int in_len) {
    *decoder->samples_decoded = 0;
    *decoder->out_ptr = NULL;
    *decoder->out_len = 0;
    *decoder->error_string_ptr = NULL;

    if (decoder->init_error) {
        *decoder->error_string_ptr = decoder->init_error;
        return;
    }

    int is_adif = decoder->transport_format == AAC_TRANSPORT_ADIF;
    unsigned char *buf;
    unsigned int len;

    if (is_adif) {
        // join chunks so init and decode always see contiguous stream data
        if (!ensure_capacity(
                &decoder->in_buf,
                &decoder->in_capacity,
                decoder->in_len + in_len,
                1
            )) {
            *decoder->error_string_ptr = "Out of memory";
            return;
        }

        memcpy(decoder->in_buf + decoder->in_len, in, in_len);
        decoder->in_len += in_len;

        buf = decoder->in_buf;
        len = decoder->in_len;
    } else {
        buf = in;
        len = in_len;
    }

    unsigned int pos = 0;
    unsigned int samples = 0; // interleaved samples accumulated in decoder->pcm
    unsigned int channels = 0;
    unsigned long sample_rate = 0;
    unsigned char channel_position[AAC_MAX_CHANNELS];

    if (!decoder->initialized) {
        if (decoder->transport_format == AAC_TRANSPORT_ADTS) {
            // initialize from a syncword so that leading garbage cannot be
            // misdetected as a headerless raw stream
            while (pos + 1 < len &&
                   !(buf[pos] == 0xff && (buf[pos + 1] & 0xf6) == 0xf0))
                pos++;

            if (pos + 1 >= len) {
                *decoder->error_string_ptr = "Unable to find ADTS syncword";
                if (is_adif) decoder->in_len = 0;
                return;
            }
        }

        unsigned long init_sample_rate = 0;
        unsigned char init_channels = 0;

        long consumed = NeAACDecInit(
            decoder->handle,
            buf + pos,
            len - pos,
            &init_sample_rate,
            &init_channels
        );

        if (consumed < 0) {
            *decoder->error_string_ptr = "NeAACDecInit failed";
            if (is_adif) decoder->in_len = 0;
            return;
        }

        pos += (unsigned int)consumed;
        decoder->init_channels = init_channels ? init_channels : 2;
        decoder->initialized = 1;
    }

    while (pos < len) {
        NeAACDecFrameInfo info;
        void *frame_pcm =
            NeAACDecDecode(decoder->handle, &info, buf + pos, len - pos);

        if (info.error) {
            // ADIF frames are not byte aligned to anything detectable, so a
            // frame truncated at a chunk boundary can surface as any bitstream
            // error. A frame can be at most FAAD_MIN_STREAMSIZE bytes per
            // channel, so within that threshold wait for more input instead of
            // treating the error as real.
            if (is_adif &&
                len - pos < FAAD_MIN_STREAMSIZE * decoder->init_channels)
                break;

            *decoder->error_string_ptr = NeAACDecGetErrorMessage(info.error);
            // errors usually consume no input; drop the rest of the buffer
            // rather than retrying the same bytes forever
            pos = len;
            break;
        }

        if (!info.bytesconsumed) break;

        pos += info.bytesconsumed;

        if (frame_pcm && info.samples) {
            if (!info.channels || info.channels > AAC_MAX_CHANNELS) {
                *decoder->error_string_ptr =
                    NeAACDecGetErrorMessage(12); // invalid number of channels
                pos = len;
                break;
            }

            if (!ensure_capacity(
                    (unsigned char **)&decoder->pcm,
                    &decoder->pcm_capacity,
                    samples + info.samples,
                    sizeof(float)
                )) {
                *decoder->error_string_ptr = "Out of memory";
                return;
            }

            memcpy(
                decoder->pcm + samples,
                frame_pcm,
                info.samples * sizeof(float)
            );
            samples += info.samples;

            channels = info.channels;
            sample_rate = info.samplerate;
            memcpy(channel_position, info.channel_position, channels);
        }
    }

    if (is_adif) {
        memmove(decoder->in_buf, decoder->in_buf + pos, len - pos);
        decoder->in_len = len - pos;
    }

    if (!samples || !channels) return;

    unsigned int samples_per_channel = samples / channels;
    float *out = malloc(samples * sizeof(float));

    if (!out) {
        *decoder->error_string_ptr = "Out of memory";
        return;
    }

    unsigned char order[AAC_MAX_CHANNELS];
    compute_channel_order(channel_position, channels, order);

    // deinterleave into the repo's conventional channel ordering
    for (unsigned int out_ch = 0; out_ch < channels; out_ch++) {
        unsigned int in_ch = order[out_ch];
        float *dst = out + out_ch * samples_per_channel;

        for (unsigned int s = 0; s < samples_per_channel; s++)
            dst[s] = decoder->pcm[s * channels + in_ch];
    }

    *decoder->channels = channels;
    *decoder->sample_rate = sample_rate;
    *decoder->samples_decoded = samples_per_channel;
    *decoder->out_ptr = out;
    *decoder->out_len = samples;
}
