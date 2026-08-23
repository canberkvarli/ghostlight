// Generate an Apple "Sign in with Apple" client secret (a 6-month ES256 JWT)
// for the web OAuth flow that Supabase's Apple provider needs.
//
// Zero dependencies (Node's built-in crypto). Your .p8 stays local.
//
// Usage:
//   node scripts/apple-client-secret.mjs <TEAM_ID> <KEY_ID> <SERVICE_ID> <path-to-AuthKey.p8>
//
//   TEAM_ID    Apple Developer Team ID (Membership page, 10 chars)
//   KEY_ID     the Key ID of your *Sign in with Apple* key (.p8)
//   SERVICE_ID the client id used on web: com.actorrise.app.web
//   .p8 path   the Sign in with Apple key file (NOT the IAP key)
//
// Paste the printed token into Supabase → Auth → Providers → Apple → Secret Key, then Save.

import crypto from 'node:crypto';
import fs from 'node:fs';

const [teamId, keyId, serviceId, p8Path] = process.argv.slice(2);
if (!teamId || !keyId || !serviceId || !p8Path) {
  console.error('Usage: node scripts/apple-client-secret.mjs <TEAM_ID> <KEY_ID> <SERVICE_ID> <path-to-.p8>');
  process.exit(1);
}

const privateKey = fs.readFileSync(p8Path, 'utf8');
const now = Math.floor(Date.now() / 1000);
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const header = { alg: 'ES256', kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 60 * 60 * 24 * 180, // 180 days (Apple max is 6 months)
  aud: 'https://appleid.apple.com',
  sub: serviceId,
};

const signingInput = `${b64url(header)}.${b64url(payload)}`;
// ieee-p1363 gives the raw r||s signature JOSE wants (not DER).
const signature = crypto
  .sign('SHA256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  .toString('base64url');

console.log(`${signingInput}.${signature}`);
