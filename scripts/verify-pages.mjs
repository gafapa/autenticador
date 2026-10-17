import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const domain = (await readFile(new URL('../public/CNAME', import.meta.url), 'utf8')).trim()
if (!/^[a-z0-9.-]+$/.test(domain)) {
  throw new Error('Pages verification requires a valid domain')
}

const site = `https://${domain}/`
// New domains can retain negative DNS answers while GitHub provisions TLS.
// Repository administrators enable HTTPS enforcement in Pages settings.
// Verify public behavior without requiring an administrative workflow secret.
for (let attempt = 1; attempt <= 120; attempt++) {
  let ready = false
  try {
    const response = await fetch(site, { signal: AbortSignal.timeout(15_000) })
    ready = response.ok && (await response.text()).includes('DocForensics')
  } catch {
    // Certificate or DNS provisioning is still in progress.
  }
  if (ready) {
    const redirect = await fetch(`http://${domain}/`, {
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
    })
    if ([301, 302, 307, 308].includes(redirect.status) && redirect.headers.get('location') === site) {
      console.log(`Verified ${site}: valid TLS, application response and enforced HTTPS redirect`)
      process.exit(0)
    }
    console.log(`Waiting for the HTTP-to-HTTPS redirect to propagate (${attempt}/120)`)
  } else {
    console.log(`Waiting for GitHub Pages DNS and TLS provisioning (${attempt}/120)`)
  }
  if (attempt < 120) await sleep(30_000)
}
throw new Error('The published site did not pass DNS, TLS and HTTPS redirect verification within the verification window')
