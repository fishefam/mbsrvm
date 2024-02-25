import defaultUpdateNotifier from 'update-notifier'
export function checkForUpdates({ updateNotifier = defaultUpdateNotifier, version }) {
  const pkg = {
    name: 'web-ext',
    version,
  }
  updateNotifier({
    pkg,
    updateCheckInterval: 1000 * 60 * 60 * 24 * 3, // 3 days,
  }).notify()
}
