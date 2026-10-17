import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const domain = (await readFile(new URL('../public/CNAME', import.meta.url), 'utf8')).trim()
const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
if (!/^[a-z0-9.-]+$/.test(domain) || !repository || !token) {
  throw new Error('Pages verification requires the domain, repository and workflow token')
}

const site = `https://${domain}/`
const endpoint = `https://api.github.com/repos/${repository}/pages`
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
}

// New domains can retain negative DNS answers while GitHub provisions TLS.
// Validate the certificate through a normal HTTPS request before enforcing it.
for (let attempt = 1; attempt <= 120; attempt++) {
  let ready = false
  try {
    const response = await fetch(site, { signal: AbortSignal.timeout(15_000) })
    ready = response.ok && (await response.text()).includes('DocForensics')
  } catch {
    // Certificate or DNS provisioning is still in progress.
  }
  if (ready) {
    const response = await fetch(endpoint, {
      method: 'PUT', headers, body: JSON.stringify({ https_enforced: true }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`HTTPS enforcement failed with HTTP ${response.status}`)
    const redirect = await fetch(`http://${domain}/`, {
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
    })
    if (![301, 302, 307, 308].includes(redirect.status) || redirect.headers.get('location') !== site) {
      throw new Error('The HTTP endpoint does not redirect to the verified HTTPS site')
    }
    console.log(`Verified ${site}: valid TLS, application response and enforced HTTPS redirect`)
    process.exit(0)
  }
  console.log(`Waiting for GitHub Pages DNS and TLS provisioning (${attempt}/120)`)
  if (attempt < 120) await sleep(30_000)
}
throw new Error('GitHub Pages did not complete DNS and TLS provisioning within the verification window')
