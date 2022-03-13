#include "ogg_opus_decoder.h"

static void deinterleave_and_trim_pcm(OggOpusDecoder *decoder, int channels_decoded, int samples_decoded, float *out) {
  for (int in_idx=(samples_decoded*channels_decoded)-1; in_idx>=0; in_idx--) {
    int sample = in_idx/channels_decoded;
    int channel = (in_idx%channels_decoded)*samples_decoded;
    out[sample+channel] = decoder->pcm[in_idx];
  }
}

int ogg_opus_decoder_decode(OggOpusDecoder *decoder, unsigned char *in, size_t in_size, int *channels_decoded, float *out) {
  if (decoder->buffer.bytes_remaining + in_size > sizeof(decoder->buffer._data)) {
    // buffer overflow
    return decoder->err ? decoder->err : -140;
  }

  // fill the buffer until ogg opus is discovered, or the buffer is out of space
  if (!decoder->of) {
    memcpy( decoder->buffer.cursor, in, in_size );
    decoder->buffer.bytes_remaining += in_size;

    decoder->of = op_open_callbacks(
      decoder,
      &decoder->cb,
      decoder->buffer.start,
      decoder->buffer.bytes_remaining,
      &decoder->err
    );

    if (decoder->err == 0) {
      // mark data as read
      //fprintf(stdout, "OggOpusFile discovered with %i bytes\n", decoder->buffer.bytes_remaining);
      decoder->buffer.bytes_remaining = 0;
    } else {
      // keep reading ogg data
      //fprintf(stdout, "ogg enqueue error %i, start %u, cursor %u, unread %i, input %zu\n", decoder->err, decoder->buffer.start, decoder->buffer.cursor, decoder->buffer.bytes_remaining, in_size);
      decoder->buffer.cursor += in_size;
      return 0;
    }
  } else {
    // shift unread data to beginning
    memcpy( decoder->buffer.start, decoder->buffer.cursor, decoder->buffer.bytes_remaining);
    // copy in the new data
    memcpy( decoder->buffer.start + decoder->buffer.bytes_remaining, in, in_size );

    // reset cursor
    decoder->buffer.cursor = decoder->buffer.start;
    decoder->buffer.bytes_remaining += in_size;
  }

  // decode
  int total_samples_decoded = 0;
  int samples_decoded = 0;

  do {
    int offset = total_samples_decoded * *channels_decoded;
    samples_decoded = decoder->decode(
      decoder->of, 
      &decoder->pcm[offset], 
      sizeof(decoder->pcm) - offset * sizeof(float),
      channels_decoded
    );

    total_samples_decoded += samples_decoded;
    if (samples_decoded < 0) return samples_decoded;
  } while(samples_decoded > 0);
  
  deinterleave_and_trim_pcm(decoder, *channels_decoded, total_samples_decoded, out);
  
  return total_samples_decoded;
}

void ogg_opus_decoder_free(OggOpusDecoder *decoder) {
  op_free(decoder->of);
  free(decoder);
}

static int cb_read(OggOpusDecoder *decoder, unsigned char *_ptr, int _nbytes) {
  // prevent buffer modifications while instantiating
  if (!decoder->of) return 0;

  // read up to the number of bytes remaining in the buffer
  if (_nbytes > decoder->buffer.bytes_remaining)
    _nbytes = decoder->buffer.bytes_remaining;

  //fprintf(stdout, "cb_read, _nbytes %i, queued %6i\n", _nbytes, decoder->buffer.bytes_remaining);

  // read the bytes into the decoder
  if (_nbytes) {
    memcpy( _ptr, decoder->buffer.cursor, _nbytes);

    decoder->buffer.cursor += _nbytes;
    decoder->buffer.bytes_remaining -= _nbytes;
  }
  return _nbytes;
}

static int decode_float(OggOpusFile *of, float *in, int in_size, int *channels_decoded) {
  int *_li;
  int samples_decoded = op_read_float(of, in, in_size, _li);
  *channels_decoded = op_channel_count(of, *_li);
  return samples_decoded;
}

static int decode_float_stereo(OggOpusFile *of, float *in, int in_size, int *channels_decoded) {
  *channels_decoded = 2;
  return op_read_float_stereo(of, in, in_size);
}

OggOpusDecoder *ogg_opus_decoder_create(unsigned char force_stereo) {
  OggOpusDecoder decoder;
  decoder.cb.read = (int (*)(void *, unsigned char *, int))cb_read;
  decoder.cb.seek = NULL;
  decoder.cb.tell = NULL;
  decoder.cb.close = NULL;
  decoder.of = NULL;
  decoder.decode = force_stereo
    ? decode_float_stereo
    : decode_float;

  ByteBuffer cb;
  decoder.buffer.start = cb._data;
  decoder.buffer.cursor = cb._data;
  decoder.buffer.bytes_remaining = 0;

  OggOpusDecoder *ptr = malloc(sizeof(decoder));
  *ptr = decoder;
  return ptr;
}
