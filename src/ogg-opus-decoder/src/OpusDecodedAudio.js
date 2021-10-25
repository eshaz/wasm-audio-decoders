export default class OpusDecodedAudio {
  constructor(channelData, samplesDecoded) {
    this.channelData = channelData;
    this.samplesDecoded = samplesDecoded;
    this.sampleRate = 48000;
  }
}
