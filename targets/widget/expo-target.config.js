/**
 * Tonight: the home screen widget. One speech a day, the same one the app's
 * ticket and the evening knock name, on the dark stage. Fetches the server's
 * run of days for itself and keeps it, with the day's poster, in the shared
 * App Group; the app never has to be opened for it to be lit.
 */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'Tonight',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
