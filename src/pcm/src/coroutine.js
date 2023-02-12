import fs from "fs/promises";

let notify, notifyPromise, notifyComplete, notifyCompletePromise, waiting;
const initWait = () => {
  console.log("init");
  waiting = false;

  notifyCompletePromise = new Promise((resolve) => (notifyComplete = resolve));
  notifyPromise = new Promise(
    (resolve) =>
      (notify = async () => {
        resolve();
        await notifyCompletePromise;
      })
  );
};

let instance, view;
const stackAddress = 16;
const wait = (arg) => {
  console.log("waiting", waiting);
  if (!waiting) {
    view[stackAddress >> 2] = stackAddress + 8;
    view[(stackAddress + 4) >> 2] = 1024; // size of the stack
    instance.exports.asyncify_start_unwind(stackAddress);

    waiting = true;
    notifyPromise.then(() => {
      console.log(arg);

      instance.exports.asyncify_start_rewind(stackAddress);
      instance.exports.resume();
    });
  } else {
    // wait is called again once the async operation has completed
    instance.exports.asyncify_stop_rewind();
    notifyComplete();
    initWait();
  }
};

const instantiate = async () => {
  const importObject = { imports: { wait } };

  const module = await fs
    .readFile("pcm.wasm")
    .then((data) => WebAssembly.compile(data));

  instance = await WebAssembly.instantiate(module, importObject);
  view = new Int32Array(instance.exports.memory.buffer);

  initWait();
  instance.exports.resume();
  instance.exports.asyncify_stop_unwind();
};

instantiate().then(async () => {
  await notify();
  await notify();
  await notify();
  await notify();

  setInterval(() => {
    notify();
  }, 1000);
});

setTimeout(() => {}, 10000);
