#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getCreate2Address,
  keccak256,
} from 'viem'

const contractsRoot = resolve(import.meta.dirname, '..')
const recorder = resolve(contractsRoot, 'script/recordArcClassicV2Deployment.mjs')
const runRoot = mkdtempSync(resolve(tmpdir(), 'coco-recorder-regression-'))
const deployer = '0x0000000000000000000000000000000000000001'
const wrongDeployer = '0x0000000000000000000000000000000000000002'
const factory = '0x0000000000000000000000000000000000000010'
const router = '0x0000000000000000000000000000000000000020'
const usdc = '0x3600000000000000000000000000000000000000'
const eurc = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const createPairAbi = [{
  type: 'function', name: 'createPair', stateMutability: 'nonpayable',
  inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }],
}]

const compiled = (name) => JSON.parse(readFileSync(resolve(contractsRoot, `out/${name}.sol/${name}.json`)))
const factoryArtifact = compiled('CocoFactory')
const routerArtifact = compiled('CocoRouter')
const pairArtifact = compiled('CocoPair')
const factoryBytecode = factoryArtifact.bytecode.object
const routerBytecode = routerArtifact.bytecode.object
const pairBytecode = pairArtifact.bytecode.object

function runtimeBytecode(artifact, immutableValue) {
  let bytecode = artifact.deployedBytecode.object.slice(2)
  const encoded = immutableValue?.slice(2).padStart(64, '0').toLowerCase()
  for (const { start, length } of Object.values(artifact.deployedBytecode.immutableReferences ?? {}).flat()) {
    const offset = start * 2
    bytecode = `${bytecode.slice(0, offset)}${encoded}${bytecode.slice(offset + length * 2)}`
  }
  return `0x${bytecode}`
}

const canonicalPair = (tokenA, tokenB, bytecodeHash = keccak256(pairBytecode), sort = true) => {
  const tokens = sort && BigInt(tokenA) > BigInt(tokenB) ? [tokenB, tokenA] : [tokenA, tokenB]
  return getCreate2Address({
    from: factory,
    salt: keccak256(encodePacked(['address', 'address'], tokens)),
    bytecodeHash,
  })
}

function receipt(tx, blockNumber) {
  return {
    transactionHash: tx.hash,
    blockNumber: `0x${blockNumber.toString(16)}`,
    contractAddress: tx.contractAddress,
    status: '0x1',
    from: tx.transaction.from,
  }
}

function validArtifacts(tokenA = usdc, tokenB = eurc) {
  const factoryTx = {
    hash: `0x${'aa'.repeat(32)}`, transactionType: 'CREATE', contractName: 'CocoFactory', contractAddress: factory,
    transaction: { from: deployer, input: `${factoryBytecode}${encodeAbiParameters([{ type: 'address' }], [deployer]).slice(2)}` },
  }
  const routerTx = {
    hash: `0x${'bb'.repeat(32)}`, transactionType: 'CREATE', contractName: 'CocoRouter', contractAddress: router,
    transaction: { from: deployer, input: `${routerBytecode}${encodeAbiParameters([{ type: 'address' }], [factory]).slice(2)}` },
  }
  const pairTx = {
    hash: `0x${'cc'.repeat(32)}`, transactionType: 'CALL', function: 'createPair(address,address)',
    transaction: {
      from: deployer, to: factory,
      input: encodeFunctionData({ abi: createPairAbi, functionName: 'createPair', args: [tokenA, tokenB] }),
    },
    additionalContracts: [{ transactionType: 'CREATE2', address: canonicalPair(tokenA, tokenB) }],
  }
  return {
    factory: { chain: 5_042_002, transactions: [factoryTx], receipts: [receipt(factoryTx, 100)] },
    router: { chain: 5_042_002, transactions: [routerTx], receipts: [receipt(routerTx, 101)] },
    pair: { chain: 5_042_002, transactions: [pairTx], receipts: [receipt(pairTx, 102)] },
  }
}

function liveState(artifacts) {
  const transactions = new Map()
  const receipts = new Map()
  for (const artifact of Object.values(artifacts)) {
    for (const tx of artifact.transactions) {
      transactions.set(tx.hash, {
        hash: tx.hash,
        from: tx.transaction.from,
        to: tx.transaction.to ?? null,
        input: tx.transaction.input,
      })
    }
    for (const item of artifact.receipts) receipts.set(item.transactionHash, structuredClone(item))
  }
  return {
    transactions,
    receipts,
    code: new Map([
      [factory.toLowerCase(), runtimeBytecode(factoryArtifact)],
      [router.toLowerCase(), runtimeBytecode(routerArtifact, factory)],
      [canonicalPair(usdc, eurc).toLowerCase(), runtimeBytecode(pairArtifact)],
      [canonicalPair(eurc, usdc).toLowerCase(), runtimeBytecode(pairArtifact)],
    ]),
  }
}

const state = { current: null, methods: [] }
const server = createServer((request, response) => {
  let body = ''
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    const rpc = JSON.parse(body)
    const calls = Array.isArray(rpc) ? rpc : [rpc]
    const replies = calls.map(({ id, method, params = [] }) => {
      state.methods.push(method)
      let result
      if (method === 'eth_chainId') result = '0x4cef52'
      else if (method === 'eth_getTransactionByHash') result = state.current.transactions.get(params[0]) ?? null
      else if (method === 'eth_getTransactionReceipt') result = state.current.receipts.get(params[0]) ?? null
      else if (method === 'eth_getCode') result = state.current.code.get(params[0].toLowerCase()) ?? '0x'
      else return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not allowed: ${method}` } }
      return { jsonrpc: '2.0', id, result }
    })
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(Array.isArray(rpc) ? replies : replies[0]))
  })
})
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
const rpcUrl = `http://127.0.0.1:${server.address().port}`

async function runRecorder(env) {
  const child = spawn(process.execPath, [recorder], { cwd: contractsRoot, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const status = await new Promise((resolveExit) => child.on('close', resolveExit))
  return { status, stdout, stderr }
}

async function runCase(name, mutate, expectedMessage, tokenA = usdc, tokenB = eurc, mutateLive) {
  const dir = resolve(runRoot, name)
  mkdirSync(dir)
  const artifacts = validArtifacts(tokenA, tokenB)
  mutate?.(artifacts)
  state.current = liveState(artifacts)
  mutateLive?.(state.current, artifacts)
  state.methods = []
  for (const [kind, artifact] of Object.entries(artifacts)) {
    writeFileSync(resolve(dir, `${kind}.json`), `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx' })
  }
  const output = resolve(dir, 'record.json')
  const result = await runRecorder({
    ...process.env,
    ARC_TESTNET_RPC_URL: rpcUrl,
    ARC_TESTNET_EXPECTED_DEPLOYER: deployer,
    ARC_TESTNET_FACTORY_BROADCAST_FILE: resolve(dir, 'factory.json'),
    ARC_TESTNET_ROUTER_BROADCAST_FILE: resolve(dir, 'router.json'),
    ARC_TESTNET_PAIR_BROADCAST_FILE: resolve(dir, 'pair.json'),
    ARC_TESTNET_DEPLOYMENT_FILE: output,
    ARC_TESTNET_TOKEN_A: tokenA,
    ARC_TESTNET_TOKEN_B: tokenB,
  })
  if (expectedMessage) {
    assert.notEqual(result.status, 0, `${name}: expected rejection`)
    assert.match(result.stderr, new RegExp(expectedMessage), `${name}: wrong rejection: ${result.stderr}`)
    return null
  }
  assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`)
  assert.deepEqual(new Set(state.methods), new Set([
    'eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getCode',
  ]))
  return JSON.parse(readFileSync(output))
}

try {
  const accepted = await runCase('valid', null, null)
  assert.equal(accepted.chainId, 5_042_002)
  assert.equal(accepted.deployer, deployer)
  assert.equal(accepted.pair, canonicalPair(usdc, eurc))
  assert.equal(accepted.transactions.factoryDeployment.blockNumber, '100')

  await runCase('wrong-factory-bytecode', (artifacts) => {
    artifacts.factory.transactions[0].transaction.input = `0x00${artifacts.factory.transactions[0].transaction.input.slice(4)}`
  }, 'factory deployment transaction bytecode')

  await runCase('wrong-router-bytecode', (artifacts) => {
    artifacts.router.transactions[0].transaction.input = `0x00${artifacts.router.transactions[0].transaction.input.slice(4)}`
  }, 'router deployment transaction bytecode')

  await runCase('wrong-selected-deployer', (artifacts) => {
    artifacts.factory.transactions[0].transaction.from = wrongDeployer
    artifacts.factory.receipts[0].from = wrongDeployer
  }, 'factory broadcast deployer does not match ARC_TESTNET_EXPECTED_DEPLOYER')

  await runCase('wrong-pair-address', (artifacts) => {
    artifacts.pair.transactions[0].additionalContracts[0].address = router
  }, 'pair address does not match the deterministic CREATE2 address')

  await runCase('unsorted-token-salt', (artifacts) => {
    artifacts.pair.transactions[0].additionalContracts[0].address = canonicalPair(eurc, usdc, keccak256(pairBytecode), false)
  }, 'pair address does not match the deterministic CREATE2 address', eurc, usdc)

  await runCase('wrong-init-code-hash', (artifacts) => {
    artifacts.pair.transactions[0].additionalContracts[0].address = canonicalPair(usdc, eurc, keccak256('0x00'))
  }, 'pair address does not match the deterministic CREATE2 address')

  await runCase('wrong-live-transaction-hash', null, 'factory deployment live transaction identity', usdc, eurc,
    (live, artifacts) => { live.transactions.get(artifacts.factory.transactions[0].hash).hash = `0x${'dd'.repeat(32)}` })

  await runCase('wrong-live-receipt-hash', null, 'factory deployment live transaction identity', usdc, eurc,
    (live, artifacts) => {
      live.receipts.get(artifacts.factory.transactions[0].hash).transactionHash = `0x${'dd'.repeat(32)}`
    })

  await runCase('wrong-live-pair-destination', null, 'pair creation live destination', usdc, eurc,
    (live, artifacts) => { live.transactions.get(artifacts.pair.transactions[0].hash).to = router })

  await runCase('wrong-live-receipt-status', null, 'factory deployment live receipt did not succeed', usdc, eurc,
    (live, artifacts) => { live.receipts.get(artifacts.factory.transactions[0].hash).status = '0x0' })

  await runCase('wrong-live-receipt-block', null, 'factory deployment live receipt block', usdc, eurc,
    (live, artifacts) => { live.receipts.get(artifacts.factory.transactions[0].hash).blockNumber = '0x65' })

  await runCase('wrong-live-runtime-code', null, 'live factory runtime bytecode', usdc, eurc,
    (live) => { live.code.set(factory.toLowerCase(), '0x00') })

  console.log('PASS valid deployment fixture accepted with read-only live RPC verification')
  console.log('PASS incorrect factory bytecode rejected by the intended guard')
  console.log('PASS incorrect router bytecode rejected by the intended guard')
  console.log('PASS selected transaction from wrong deployer rejected by independent binding')
  console.log('PASS incorrect deterministic pair address rejected by the intended guard')
  console.log('PASS unsorted token salt rejected by the intended guard')
  console.log('PASS incorrect init-code hash rejected by the intended guard')
  console.log('PASS live transaction and receipt hash mismatches rejected')
  console.log('PASS live pair destination mismatch rejected')
  console.log('PASS live receipt status and block mismatches rejected')
  console.log('PASS live runtime bytecode mismatch rejected')
  console.log('PASS RPC mock allowed only chain/transaction/receipt/code reads; no broadcast method occurred')
  console.log(`Fixture outputs preserved at ${runRoot}`)
} finally {
  await new Promise((resolveClose) => server.close(resolveClose))
}
