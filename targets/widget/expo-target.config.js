/**
 * Tonight: the home screen widget. One speech a day, the same one the app's
 * ticket and the evening knock name, on the dark stage. Reads what the app
 * wrote to the shared App Group (src/lib/widget.ts); draws nothing it did not
 * get from there.
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
