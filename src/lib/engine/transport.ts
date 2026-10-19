export interface EngineTransport {
  send(cmd: string): void;
  onLine(handler: (line: string) => void): void;
  onError(handler: (message: string) => void): void;
  terminate(): void;
}

export function createBrowserTransport(workerUrl: string): EngineTransport {
  const worker = new Worker(workerUrl);
  let handler: (line: string) => void = () => {};
  let errorHandler: (message: string) => void = () => {};
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (typeof data === "string") handler(data);
  };
  worker.onerror = (event: ErrorEvent) => {
    errorHandler(event.message || "engine worker failed");
  };
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (h) => {
      handler = h;
    },
    onError: (h) => {
      errorHandler = h;
    },
    terminate: () => worker.terminate(),
  };
}
