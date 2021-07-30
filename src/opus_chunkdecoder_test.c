/*
   This test file is intentionally excluded from the distribution.  Should be
   used internally when developing/testing the opus_chunkdecoder library
   independent of WebAssembly & Emscripten.  This file allows you to compile
   quickly and test things. See Makefile targets build-native-test
 */


#include "opus_chunkdecoder.h"

static FILE *outfile_wav, *outfile_left, *outfile_right;
static char wav_header_written = 0;

static void put_le32(unsigned char *_dst,opus_uint32 _x){
  _dst[0]=(unsigned char)(_x&0xFF);
  _dst[1]=(unsigned char)(_x>>8&0xFF);
  _dst[2]=(unsigned char)(_x>>16&0xFF);
  _dst[3]=(unsigned char)(_x>>24&0xFF);
}

// Header for a 48 kHz, stereo, 32-bit float WAV.
// http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/WAVE.html
static const unsigned char WAV_HEADER_TEMPLATE[44]={
  'R','I','F','F',
  0xFF,0xFF,0xFF,0x7F,  // file size
  'W','A','V','E',
  'f','m','t',' ',      // Chunk ID
  0x10,0x00,0x00,0x00,  // Chunk Size - length of format above
  0x03,0x00,            // Format Code: 1 is PCM, 3 is IEEE float
  0x02,0x00,            // Number of Channels (e.g. 2)
  0x80,0xBB,0x00,0x00,  // Samples per Second, Sample Rate (e.g. 48000)
  0x00,0xDC,0x05,0x00,  // Bytes per second, byte rate = sample rate * bits per sample * channels / 8
  0x08,0x00,            // Bytes per Sample Frame, block align = bits per sample * channels / 8
  0x20,0x00,            // bits per sample (16 for PCM, 32 for float)
  'd','a','t','a',
  0xFF,0xFF,0xFF,0x7F   // size of data section
 };

/*
  writes WAV/RIFF header to file.
  This needs to be called twice, after decoding completes and total decoded samples are avail.
  Opus does not store time duration in header, so we calculate after decoding.
  More info: https://wiki.xiph.org/OpusFAQ#How_do_I_get_the_duration_of_a_.opus_file.3F
*/
static void write_wav_header(FILE *_out_file, int _samples_read) {
  unsigned char header[44];
  memcpy(header,WAV_HEADER_TEMPLATE,sizeof(WAV_HEADER_TEMPLATE));

  if (_samples_read != -1) {
    opus_uint32 audio_size= (opus_uint32)(_samples_read * sizeof(float) * 2); // * 2 channels
    put_le32(header+4,audio_size+36);
    put_le32(header+40,audio_size);
  }

  fwrite(header, sizeof(header), 1, _out_file);
}

static void write_pcm_float(float *_pcm_data, int size) {
  // write WAV header if not yet written
  if (!wav_header_written) {
    write_wav_header(outfile_wav, -1);
    wav_header_written = 1;
  }

  // fprintf(stderr, "Writing %zd %zd\n", sizeof(*_pcm_data), size );
  fwrite(_pcm_data, sizeof(*_pcm_data), size*2, outfile_wav);
}


// TODO: don't use static file names, use args
int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "ERROR: Opus infile required\nEXAMPLE: chunk_decoder_test in.opus\n");
    return 0;
  }

  char *infile_path  = argv[1];
  int file_path_len = strlen(infile_path);

  char outfile_path_wav[file_path_len+4],
       outfile_path_pcm_left[file_path_len+10],
       outfile_path_pcm_right[file_path_len+10];

  strcpy(outfile_path_wav, infile_path);
  strcat(outfile_path_wav, ".wav");

  strcpy(outfile_path_pcm_left, infile_path);
  strcat(outfile_path_pcm_left, "-left.pcm");

  strcpy(outfile_path_pcm_right, infile_path);
  strcat(outfile_path_pcm_right, "-right.pcm");

  fprintf(stderr, "                INFILE: %s\n", infile_path);
  fprintf(stderr, "      outfile_path_wav: %s\n", outfile_path_wav);
  fprintf(stderr, " outfile_path_pcm_left: %s\n", outfile_path_pcm_left);
  fprintf(stderr, "outfile_path_pcm_right: %s\n", outfile_path_pcm_right);


  FILE *infile = fopen(infile_path, "rb");
  if (!infile) {
    fprintf(stderr, "ERROR: INFILE could not be opened\n");
    return 0;
  }

  outfile_wav = fopen(outfile_path_wav, "wb");
  if (!outfile_wav) {
    fprintf(stderr, "ERROR: outfile_wav could not be opened\n");
    return 0;
  }

  outfile_left = fopen(outfile_path_pcm_left, "wb");
  if (!outfile_left) {
    fprintf(stderr, "ERROR: outfile_left could not be opened\n");
    return 0;
  }

  outfile_right = fopen(outfile_path_pcm_right, "wb");
  if (!outfile_right) {
    fprintf(stderr, "ERROR: outfile_right could not be opened\n");
    return 0;
  }


  const int READ_SIZE = 4*1024;
  unsigned char readbuffer[READ_SIZE];
  unsigned char *readbufferp = readbuffer;
  int bytes_read = 0, samples_decoded = 0, total_samples_decoded = 0;


  OpusChunkDecoder *decoder = opus_chunkdecoder_create();
  int pcm_size = 120*48; // 120ms @ 48 khz
  int pcm_size_interleaved = pcm_size*2; // 2 channels

  float pcm_float[pcm_size_interleaved],
        pcm_float_left[pcm_size],
        pcm_float_right[pcm_size];

  while( (bytes_read = fread(readbufferp, sizeof *readbufferp, READ_SIZE, infile)) ) {
    if ( !opus_chunkdecoder_enqueue(decoder, readbufferp, bytes_read) ) {
      fprintf(stderr, "ERROR: File could not be decoded.\n");
      return 0;
    }
    for (;;) {
      samples_decoded = opus_chunkdecoder_decode_float_stereo(decoder, pcm_float, pcm_size_interleaved);
      write_pcm_float(pcm_float, samples_decoded);

      // fprintf(stderr, "samples_decoded: %d, pcm: %zd, pcm_size_interleaved: %d\n", samples_decoded, sizeof(pcm_float)/sizeof(*pcm_float), pcm_size_interleaved);
      if (!samples_decoded) break;

      total_samples_decoded += samples_decoded;

      opus_chunkdecoder_deinterleave(pcm_float, samples_decoded, pcm_float_left, pcm_float_right);

      // write raw PCM to left/right
      fwrite(pcm_float_left,  sizeof(*pcm_float_left),  samples_decoded, outfile_left);
      fwrite(pcm_float_right, sizeof(*pcm_float_right), samples_decoded, outfile_right);
    }
  }

  fprintf(stderr, "Total samples decoded: %i\n", total_samples_decoded);
  fprintf(stderr, "Duration: %fs\n", (double)total_samples_decoded/48000);

  // seek to begining of file and re-write WAV header with time duration
  rewind(outfile_wav);
  write_wav_header(outfile_wav, total_samples_decoded);

  opus_chunkdecoder_free(decoder);
  fclose(infile);
  fclose(outfile_wav);
  fclose(outfile_left);
  fclose(outfile_right);

  return 0;
}