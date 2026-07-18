import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const deployment = process.env.VERCEL_DEPLOYMENT_ID
const expectedSha = process.env.EXPECTED_GIT_SHA

if (!deployment) throw new Error('VERCEL_DEPLOYMENT_ID is required')

const run = (path, args = []) => execFileSync(
  'npx',
  ['vercel', 'curl', path, '--deployment', deployment, '--', '--silent', ...args],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
)

for (const path of ['/', '/bridge', '/terms', '/privacy', '/docs']) {
  const status = run(path, ['--output', '/dev/null', '--write-out', '%{http_code}']).trim()
  if (status !== '200') throw new Error(`${path} returned ${status}`)
}

const suffix = `${process.pid}-${Date.now()}`
const headerPath = join(tmpdir(), `coco-preview-headers-${suffix}.txt`)
const bodyPath = join(tmpdir(), `coco-preview-version-${suffix}.json`)

try {
  run('/api/version', ['--dump-header', headerPath, '--output', bodyPath])
  const metadata = JSON.parse(readFileSync(bodyPath, 'utf8'))
  const headers = Object.fromEntries(
    readFileSync(headerPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes(':'))
      .map((line) => {
        const separator = line.indexOf(':')
        return [line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()]
      }),
  )

  const expectedKeys = [
    'application',
    'arcTestnetChainId',
    'buildTimestamp',
    'environment',
    'features',
    'gitCommitSha',
    'version',
  ]
  if (JSON.stringify(Object.keys(metadata).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('/api/version returned an unexpected public shape')
  }
  if (expectedSha && metadata.gitCommitSha !== expectedSha) {
    throw new Error(`/api/version SHA mismatch: ${metadata.gitCommitSha}`)
  }

  const required = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'DENY',
    'cross-origin-opener-policy': 'same-origin-allow-popups',
  }
  for (const [key, value] of Object.entries(required)) {
    if (headers[key] !== value) throw new Error(`Missing or invalid ${key}`)
  }
  if (!headers['permissions-policy']?.includes('camera=()')) {
    throw new Error('Missing restrictive Permissions-Policy')
  }
  const csp = headers['content-security-policy-report-only']
  if (!csp?.includes('https://11155111.rpc.thirdweb.com')) {
    throw new Error('CSP Report-Only is missing the browser Sepolia RPC')
  }
  if (headers['content-security-policy']) throw new Error('CSP must remain Report-Only')

  console.log(`Preview verification passed for ${deployment}`)
} finally {
  rmSync(headerPath, { force: true })
  rmSync(bodyPath, { force: true })
}
