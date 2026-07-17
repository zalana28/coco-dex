#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { encodeAbiParameters, getAddress, keccak256 } from 'viem'

const CHAIN_ID = 5_042_002
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000'
const ARC_TESTNET_EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const contractsRoot = resolve(import.meta.dirname, '..')
const configuredPath = (name, fallback) => process.env[name]
  ? resolve(process.cwd(), process.env[name])
  : resolve(contractsRoot, fallback)
const artifactPaths = {
  factory: configuredPath('ARC_TESTNET_FACTORY_BROADCAST_FILE', `broadcast/DeployArcClassicV2Factory.s.sol/${CHAIN_ID}/run-latest.json`),
  router: configuredPath('ARC_TESTNET_ROUTER_BROADCAST_FILE', `broadcast/DeployArcClassicV2Router.s.sol/${CHAIN_ID}/run-latest.json`),
  pair: configuredPath('ARC_TESTNET_PAIR_BROADCAST_FILE', `broadcast/CreateArcClassicV2Pair.s.sol/${CHAIN_ID}/run-latest.json`),
}
const outputPath = configuredPath('ARC_TESTNET_DEPLOYMENT_FILE', 'deployments/classic-v2-arc-testnet.json')

function fail(message) {
  console.error(`recordArcClassicV2Deployment: ${message}`)
  process.exit(1)
}

function readJson(path, label) {
  if (!existsSync(path)) fail(`${label} not found: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`cannot parse ${label} ${path}: ${error.message}`)
  }
}

function optionalAddress(name, fallback) {
  try {
    return getAddress(process.env[name] ?? fallback)
  } catch {
    fail(`${name} is not a valid address`)
  }
}

function artifactSender(artifact, label) {
  const sender = artifact.transactions?.[0]?.transaction?.from
    ?? artifact.transactions?.[0]?.tx?.from
  if (!sender) fail(`deployer address not found in ${label} broadcast artifact`)
  return getAddress(sender)
}

function transactionRecord(artifact, predicate) {
  const index = artifact.transactions?.findIndex(predicate) ?? -1
  if (index < 0) return null
  const transaction = artifact.transactions[index]
  const hash = (transaction.hash ?? transaction.transactionHash)?.toLowerCase()
  const receipt = artifact.receipts?.find((item) => item.transactionHash?.toLowerCase() === hash)
    ?? artifact.receipts?.[index]
  if (!hash || !receipt?.blockNumber) fail('transaction hash or receipt block number missing')
  return { transactionHash: hash, blockNumber: Number.parseInt(receipt.blockNumber, 16) }
}

function validateChain(artifact, label) {
  if (artifact.chain !== undefined && Number(artifact.chain) !== CHAIN_ID) {
    fail(`${label} chain ID must be ${CHAIN_ID}`)
  }
}

function createAddress(artifact, contractName, configuredName) {
  const transaction = artifact.transactions?.find(
    (tx) => tx.transactionType === 'CREATE' && tx.contractName === contractName,
  )
  const index = artifact.transactions?.indexOf(transaction) ?? -1
  const hash = (transaction?.hash ?? transaction?.transactionHash)?.toLowerCase()
  const receipt = artifact.receipts?.find((item) => item.transactionHash?.toLowerCase() === hash)
    ?? (index >= 0 ? artifact.receipts?.[index] : null)
  const address = transaction?.contractAddress ?? receipt?.contractAddress ?? process.env[configuredName]
  if (!address) fail(`${contractName} address not found and ${configuredName} is unset`)
  return getAddress(address)
}

const factoryArtifact = readJson(artifactPaths.factory, 'factory broadcast artifact')
const routerArtifact = readJson(artifactPaths.router, 'router broadcast artifact')
const pairArtifact = readJson(artifactPaths.pair, 'pair broadcast artifact')
validateChain(factoryArtifact, 'factory broadcast')
validateChain(routerArtifact, 'router broadcast')
validateChain(pairArtifact, 'pair broadcast')
if (existsSync(outputPath) && process.env.ARC_TESTNET_ALLOW_RECORD_OVERWRITE !== 'true') {
  fail(`refusing to overwrite existing record: ${outputPath}; archive it first`)
}

const deployer = artifactSender(factoryArtifact, 'factory')
if (artifactSender(routerArtifact, 'router') !== deployer) {
  fail('factory and router broadcasts must use the same deployer')
}
if (pairArtifact.transactions?.length > 0 && artifactSender(pairArtifact, 'pair') !== deployer) {
  fail('pair broadcast must use the same deployer as factory and router')
}
const feeToSetter = optionalAddress('ARC_TESTNET_FEE_TO_SETTER', deployer)
const tokenA = optionalAddress('ARC_TESTNET_TOKEN_A', ARC_TESTNET_USDC)
const tokenB = optionalAddress('ARC_TESTNET_TOKEN_B', ARC_TESTNET_EURC)
const factory = createAddress(factoryArtifact, 'CocoFactory', 'ARC_TESTNET_FACTORY_ADDRESS')
const router = createAddress(routerArtifact, 'CocoRouter', 'ARC_TESTNET_ROUTER_ADDRESS')
const factoryDeployment = transactionRecord(factoryArtifact, (tx) => tx.transactionType === 'CREATE' && tx.contractName === 'CocoFactory')
const routerDeployment = transactionRecord(routerArtifact, (tx) => tx.transactionType === 'CREATE' && tx.contractName === 'CocoRouter')
const pairCreation = transactionRecord(pairArtifact, (tx) => tx.function?.startsWith('createPair('))
if (!factoryDeployment || !routerDeployment) fail('factory and router deployment transactions are required')
const pair = pairArtifact.transactions?.find((tx) => tx.function?.startsWith('createPair('))
  ?.additionalContracts?.find((contract) => contract.transactionType === 'CREATE2')?.address
  ?? process.env.ARC_TESTNET_PAIR_ADDRESS
if (!pair) fail('pair address not found; set ARC_TESTNET_PAIR_ADDRESS for a reused pair')

const compiledPair = readJson(resolve(contractsRoot, 'out/CocoPair.sol/CocoPair.json'), 'CocoPair artifact')
const creationBytecode = compiledPair.bytecode?.object
if (!creationBytecode || creationBytecode === '0x') fail('CocoPair creation bytecode missing')

const record = {
  chainId: CHAIN_ID,
  deployer: getAddress(deployer),
  feeToSetter,
  factory,
  router,
  tokenA,
  tokenB,
  pair: getAddress(pair),
  pairInitCodeHash: keccak256(creationBytecode),
  constructorArgs: {
    factory: encodeAbiParameters([{ type: 'address' }], [feeToSetter]),
    router: encodeAbiParameters([{ type: 'address' }], [factory]),
  },
  transactions: { factoryDeployment, routerDeployment, pairCreation },
  source: { broadcastFiles: artifactPaths },
  note: 'Arc Testnet only. No production deployment. Old contracts remain live and unchanged.',
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
console.log(`Recorded Arc Testnet deployment: ${outputPath}`)
console.log(JSON.stringify(record, null, 2))
