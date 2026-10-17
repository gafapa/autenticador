import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

// Allocate an available loopback port without interrupting other local projects.
const server = createServer()
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const port = server.address().port
await new Promise(resolve => server.close(resolve))
const require = createRequire(import.meta.url)
const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, DOCFORENSICS_E2E_PORT: String(port) },
})
child.once('error', error => { console.error(error.message); process.exitCode = 1 })
child.once('exit', code => { process.exitCode = code ?? 1 })
