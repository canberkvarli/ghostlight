const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Ghost Light schedules every reminder on the phone; nothing is pushed from a
 * server. expo-notifications still adds the `aps-environment` entitlement,
 * which needs Push Notifications on the App ID and a regenerated provisioning
 * profile. Until there is a push server, drop the entitlement so the build
 * signs with the profile EAS already holds.
 *
 * Listed just before "expo-notifications" in app.json: entitlement mods run
 * innermost-first, so the plugin listed earlier gets the last word. Remove
 * this (and run one interactive `eas build` so EAS syncs the capability)
 * when remote push arrives.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
