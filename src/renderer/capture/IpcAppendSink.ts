/** Keep every IPC message bounded, including large muxer fragments. */
export class IpcAppendSink {
  readonly writable: WritableStream<Uint8Array>;

  constructor(sessionId: string) {
    this.writable = new WritableStream<Uint8Array>({
      write: async chunk => {
        const chunkSize = 8 * 1024 * 1024;
        for (let offset = 0; offset < chunk.byteLength; offset += chunkSize) {
          const copy = chunk.slice(offset, offset + chunkSize);
          await window.pulseClip.appendFile(sessionId, copy.buffer as ArrayBuffer);
        }
      },
    });
  }
}
