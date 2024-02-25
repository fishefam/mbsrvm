import bunyan, { createLogger as defaultLogCreator, nameFromLevel } from 'bunyan'
import { fileURLToPath } from 'url'
export class ConsoleStream {
  capturedMessages
  isCapturing
  verbose
  constructor({ verbose = false } = {}) {
    this.verbose = verbose
    this.isCapturing = false
    this.capturedMessages = []
  }

  flushCapturedLogs({ localProcess = process } = {}) {
    for (const msg of this.capturedMessages) {
      localProcess.stdout.write(msg)
    }
    this.capturedMessages = []
  }

  format({ level, msg, name }) {
    const prefix = this.verbose ? `[${name}][${nameFromLevel[level]}] ` : ''
    return `${prefix}${msg}\n`
  }

  makeVerbose() {
    this.verbose = true
  }

  startCapturing() {
    this.isCapturing = true
  }

  stopCapturing() {
    this.isCapturing = false
    this.capturedMessages = []
  }

  write(packet, { localProcess = process } = {}) {
    const thisLevel = this.verbose ? bunyan.TRACE : bunyan.INFO
    if (packet.level >= thisLevel) {
      const msg = this.format(packet)
      if (this.isCapturing) {
        this.capturedMessages.push(msg)
      } else if (packet.level > bunyan.INFO) {
        localProcess.stderr.write(msg)
      } else {
        localProcess.stdout.write(msg)
      }
    }
  }
}
export const consoleStream = new ConsoleStream()

// createLogger types and implementation.

export function createLogger(moduleURL, { createBunyanLog = defaultLogCreator } = {}) {
  return createBunyanLog({
    // Strip the leading src/ from file names (which is in all file names) to
    // Capture all log levels and let the stream filter them.
    level: bunyan.TRACE,
    // make the name less redundant.
    name: moduleURL ? fileURLToPath(moduleURL).replace(/^src\//, '') : 'unknown-module',
    streams: [
      {
        stream: consoleStream,
        type: 'raw',
      },
    ],
  })
}
