import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const markers = [
  'VITE_CIRCLE_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'BEGIN PRIVATE KEY',
  'PRIVATE_KEY=',
  'seed phrase',
  'mnemonic=',
]

async function files(path) {
  const names = await readdir(path)
  const output = []
  for (const name of names) {
    const entry = join(path, name)
    if ((await stat(entry)).isDirectory()) output.push(...await files(entry))
    else if (/\.(?:html|js|css|json|svg)$/.test(name)) output.push(entry)
  }
  return output
}

const bundle = (await Promise.all((await files(root)).map((path) => readFile(path, 'utf8')))).join('\n')
const findings = markers.filter((marker) => bundle.includes(marker))
if (/https?:\/\/[^\s"']*(?:api[_-]?key|token|secret|password)=[^\s"'&]+/i.test(bundle)) {
  findings.push('credentialed URL')
}

if (findings.length > 0) {
  console.error(`Public bundle contains forbidden material: ${findings.join(', ')}`)
  process.exit(1)
}

console.log('Public bundle secret scan passed')
