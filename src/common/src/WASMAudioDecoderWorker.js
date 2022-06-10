import Worker from "web-worker";
import WASMAudioDecoderCommon from "./WASMAudioDecoderCommon.js";

export default class WASMAudioDecoderWorker extends Worker {
  constructor(options, name, Decoder, EmscriptenWASM) {
    if (!WASMAudioDecoderCommon.modules) new WASMAudioDecoderCommon();

    let source = WASMAudioDecoderCommon.modules.get(Decoder);

    if (!source) {
      const webworkerSourceCode =
        "'use strict';" +
        // dependencies need to be manually resolved when stringifying this function
        `(${((_options, _Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
          // We're in a Web Worker

          // setup Promise that will be resolved once the WebAssembly Module is received
          let decoder,
            moduleResolve,
            modulePromise = new Promise((resolve) => {
              moduleResolve = resolve;
            });

          self.onmessage = ({ data: { id, command, data } }) => {
            let messagePromise = modulePromise,
              messagePayload = { id },
              transferList;

            if (command === "module") {
              Object.defineProperties(_Decoder, {
                WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
                EmscriptenWASM: { value: _EmscriptenWASM },
                module: { value: data },
                isWebWorker: { value: true },
              });

              decoder = new _Decoder(_options);
              moduleResolve();
            } else if (command === "free") {
              decoder.free();
            } else if (command === "ready") {
              messagePromise = messagePromise.then(() => decoder.ready);
            } else if (command === "reset") {
              messagePromise = messagePromise.then(() => decoder.reset());
            } else {
              // "decode":
              // "decodeFrame":
              // "decodeFrames":
              Object.assign(
                messagePayload,
                decoder[command](
                  // detach buffers
                  Array.isArray(data)
                    ? data.map((data) => new Uint8Array(data))
                    : new Uint8Array(data)
                )
              );
              // The "transferList" parameter transfers ownership of channel data to main thread,
              // which avoids copying memory.
              transferList = messagePayload.channelData.map(
                (channel) => channel.buffer
              );
            }

            messagePromise.then(() =>
              self.postMessage(messagePayload, transferList)
            );
          };
        }).toString()})(${JSON.stringify(
          options
        )}, ${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM})`;

      const type = "text/javascript";

      try {
        // browser
        source = URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
        WASMAudioDecoderCommon.modules.set(Decoder, source);
      } catch {
        // nodejs
        source = `data:${type};base64,${Buffer.from(
          webworkerSourceCode
        ).toString("base64")}`;
      }
    }

    super(source, { name });

    this._id = Number.MIN_SAFE_INTEGER;
    this._enqueuedOperations = new Map();

    this.onmessage = ({ data }) => {
      const { id, ...rest } = data;
      this._enqueuedOperations.get(id)(rest);
      this._enqueuedOperations.delete(id);
    };

    new EmscriptenWASM(WASMAudioDecoderCommon).getModule().then((compiled) => {
      this._postToDecoder("module", compiled);
    });
  }

  async _postToDecoder(command, data) {
    return new Promise((resolve) => {
      this.postMessage({
        command,
        id: this._id,
        data,
      });

      this._enqueuedOperations.set(this._id++, resolve);
    });
  }

  get ready() {
    return this._postToDecoder("ready");
  }

  async free() {
    await this._postToDecoder("free").finally(() => {
      this.terminate();
    });
  }

  async reset() {
    await this._postToDecoder("reset");
  }
}
