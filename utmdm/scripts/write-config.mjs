// Writes dist/config.json from the Amplify app's environment variables, so the
// site knows its API and sign-in addresses. Without them (a local build) it
// writes nothing, and the app runs browser-only.
import { writeFileSync } from 'node:fs';

const { UTMDM_REGION, UTMDM_API_URL, UTMDM_AUTH_DOMAIN, UTMDM_CLIENT_ID, UTMDM_GOOGLE_CLIENT_ID } = process.env;
if (!UTMDM_API_URL || !UTMDM_CLIENT_ID) {
  console.log('write-config: no UTMDM_* variables, so no config.json (browser-only build).');
} else {
  const config = { region: UTMDM_REGION || 'us-east-2', apiUrl: UTMDM_API_URL, clientId: UTMDM_CLIENT_ID, ...(UTMDM_GOOGLE_CLIENT_ID ? { googleClientId: UTMDM_GOOGLE_CLIENT_ID } : {}) };
  writeFileSync('dist/config.json', JSON.stringify(config, null, 2) + '\n');
  console.log(`write-config: dist/config.json for ${config.apiUrl}`);
}
