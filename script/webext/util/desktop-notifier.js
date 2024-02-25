import defaultNotifier from 'node-notifier'

import { createLogger } from './logger.js'
const defaultLog = createLogger(import.meta.url)
export function showDesktopNotification(
  { icon, message, title },
  { log = defaultLog, notifier = defaultNotifier } = {},
) {
  return new Promise((resolve, reject) => {
    notifier.notify(
      {
        icon,
        message,
        title,
      },
      (err, res) => {
        if (err) {
          log.debug(`Desktop notifier error: ${err.message},` + ` response: ${res}`)
          reject(err)
        } else {
          resolve()
        }
      },
    )
  })
}
