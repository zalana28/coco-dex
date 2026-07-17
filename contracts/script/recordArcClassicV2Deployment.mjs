#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  getCreate2Address,
  http,
  keccak256,
} from 'viem'

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
const rpcUrl = process.env.ARC_TESTNET_RPC_URL
if (!rpcUrl) throw new Error('ARC_TESTNET_RPC_URL is required for live receipt verification')
const client = createPublicClient({ transport: http(rpcUrl) })

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

function requiredAddress(name) {
  if (!process.env[name]) fail(`${name} is required`)
  return optionalAddress(name)
}

function materializeRuntimeBytecode(artifact, immutableValue, label) {
  const bytecode = artifact.deployedBytecode?.object
  if (!bytecode || bytecode === '0x') fail(`${label} runtime bytecode is missing`)
  const references = Object.values(artifact.deployedBytecode.immutableReferences ?? {}).flat()
  if (references.length === 0) return bytecode.toLowerCase()
  if (!immutableValue) fail(`${label} immutable value is missing`)
  const encoded = immutableValue.slice(2).padStart(64, '0').toLowerCase()
  let materialized = bytecode.slice(2)
  for (const { start, length } of references) {
    if (length !== 32) fail(`${label} has an unsupported immutable reference`)
    const offset = start * 2
    materialized = `${materialized.slice(0, offset)}${encoded}${materialized.slice(offset + length * 2)}`
  }
  return `0x${materialized}`.toLowerCase()
}

function artifactSender(artifact, label) {
  const sender = artifact.transactions?.[0]?.transaction?.from
    ?? artifact.transactions?.[0]?.tx?.from
  if (!sender) fail(`deployer address not found in ${label} broadcast artifact`)
  return getAddress(sender)
}

function transactionRecord(artifact, predicate, expectedSender) {
  const index = artifact.transactions?.findIndex(predicate) ?? -1
  if (index < 0) return null
  const transaction = artifact.transactions[index]
  const hash = (transaction.hash ?? transaction.transactionHash)?.toLowerCase()
  const receipts = artifact.receipts?.filter((item) => item.transactionHash?.toLowerCase() === hash) ?? []
  if (!hash || receipts.length !== 1) fail('transaction hash or unique matching receipt missing')
  const receipt = receipts[0]
  if (!receipt.blockNumber) fail('receipt block number missing')
  if (receipt.status !== '0x1' && receipt.status !== 1 && receipt.status !== '1') {
    fail(`transaction ${hash} did not succeed`)
  }
  const sender = transaction.transaction?.from ?? transaction.tx?.from
  if (!sender || !receipt.from || getAddress(sender) !== getAddress(receipt.from)) {
    fail(`transaction ${hash} sender does not match its receipt`)
  }
  if (getAddress(sender) !== expectedSender) fail(`transaction ${hash} sender is not the recorded deployer`)
  return { transactionHash: hash, blockNumber: BigInt(receipt.blockNumber).toString() }
}

function validateChain(artifact, label) {
  if (artifact.chain === undefined) fail(`${label} is missing its chain ID`)
  if (Number(artifact.chain) !== CHAIN_ID) {
    fail(`${label} chain ID must be ${CHAIN_ID}`)
  }
}

function selectUniqueTransaction(artifact, predicate, label, optional = false) {
  const matches = artifact.transactions?.filter(predicate) ?? []
  if (matches.length === 0 && optional) return null
  if (matches.length !== 1) fail(`${label} must contain exactly one matching transaction`)
  return matches[0]
}

function createAddress(artifact, transaction, contractName, configuredName) {
  const index = artifact.transactions?.indexOf(transaction) ?? -1
  const hash = (transaction?.hash ?? transaction?.transactionHash)?.toLowerCase()
  const receipts = artifact.receipts?.filter((item) => item.transactionHash?.toLowerCase() === hash) ?? []
  if (index < 0 || receipts.length !== 1) fail(`${contractName} must have exactly one deployment receipt`)
  const receipt = receipts[0]
  if (receipt.status !== '0x1' && receipt.status !== 1 && receipt.status !== '1') {
    fail(`${contractName} deployment did not succeed`)
  }
  const address = transaction?.contractAddress ?? receipt?.contractAddress ?? process.env[configuredName]
  if (!address) fail(`${contractName} address not found and ${configuredName} is unset`)
  if (transaction?.contractAddress && receipt?.contractAddress
      && getAddress(transaction.contractAddress) !== getAddress(receipt.contractAddress)) {
    fail(`${contractName} transaction and receipt addresses differ`)
  }
  if (process.env[configuredName] && getAddress(process.env[configuredName]) !== getAddress(address)) {
    fail(`${configuredName} does not match the deployment receipt`)
  }
  return getAddress(address)
}

function transactionData(transaction, label) {
  const data = transaction?.transaction?.input ?? transaction?.transaction?.data ?? transaction?.tx?.data
  if (!data) fail(`${label} transaction data is missing`)
  return data.toLowerCase()
}

function creationData(contractArtifact, constructorArgs, label) {
  const bytecode = contractArtifact.bytecode?.object
  if (!bytecode || bytecode === '0x') fail(`${label} creation bytecode is missing`)
  return `${bytecode}${constructorArgs.slice(2)}`.toLowerCase()
}

function requireExactData(transaction, expectedData, label) {
  if (transactionData(transaction, label) !== expectedData) {
    fail(`${label} transaction bytecode or constructor arguments do not match the reviewed build`)
  }
}

async function verifyLiveTransaction(
  transaction,
  artifactRecord,
  expectedSender,
  expectedDestination,
  expectedContractAddress,
  label,
) {
  const hash = artifactRecord.transactionHash
  const [liveTransaction, liveReceipt] = await Promise.all([
    client.request({ method: 'eth_getTransactionByHash', params: [hash] }),
    client.request({ method: 'eth_getTransactionReceipt', params: [hash] }),
  ])
  if (!liveTransaction || !liveReceipt) fail(`${label} live transaction or receipt is missing`)
  if (liveTransaction.hash?.toLowerCase() !== hash || liveReceipt.transactionHash?.toLowerCase() !== hash) {
    fail(`${label} live transaction identity differs from the broadcast artifact`)
  }
  const liveDestination = liveTransaction.to ? getAddress(liveTransaction.to) : null
  if (liveDestination !== expectedDestination) fail(`${label} live destination differs from the broadcast artifact`)
  if (liveReceipt.status !== '0x1') fail(`${label} live receipt did not succeed`)
  if (getAddress(liveTransaction.from) !== expectedSender || getAddress(liveReceipt.from) !== expectedSender) {
    fail(`${label} live sender is not ARC_TESTNET_EXPECTED_DEPLOYER`)
  }
  if ((liveTransaction.input ?? '0x').toLowerCase() !== transactionData(transaction, label)) {
    fail(`${label} live transaction input differs from the broadcast artifact`)
  }
  if (BigInt(liveReceipt.blockNumber).toString() !== artifactRecord.blockNumber) {
    fail(`${label} live receipt block differs from the broadcast artifact`)
  }
  if (expectedContractAddress
      && (!liveReceipt.contractAddress || getAddress(liveReceipt.contractAddress) !== expectedContractAddress)) {
    fail(`${label} live contract address differs from the deployment record`)
  }
}

const factoryArtifact = readJson(artifactPaths.factory, 'factory broadcast artifact')
const routerArtifact = readJson(artifactPaths.router, 'router broadcast artifact')
const pairArtifact = readJson(artifactPaths.pair, 'pair broadcast artifact')
validateChain(factoryArtifact, 'factory broadcast')
validateChain(routerArtifact, 'router broadcast')
validateChain(pairArtifact, 'pair broadcast')
if (existsSync(outputPath)) {
  fail(`refusing to overwrite existing record: ${outputPath}; archive it first`)
}

const liveChainId = await client.getChainId()
if (liveChainId !== CHAIN_ID) fail(`RPC chain ID must be ${CHAIN_ID}`)
const deployer = requiredAddress('ARC_TESTNET_EXPECTED_DEPLOYER')
if (artifactSender(factoryArtifact, 'factory') !== deployer) {
  fail('factory broadcast deployer does not match ARC_TESTNET_EXPECTED_DEPLOYER')
}
if (artifactSender(routerArtifact, 'router') !== deployer) {
  fail('factory and router broadcasts must use the same deployer')
}
if (pairArtifact.transactions?.length > 0 && artifactSender(pairArtifact, 'pair') !== deployer) {
  fail('pair broadcast must use the same deployer as factory and router')
}
const feeToSetter = optionalAddress('ARC_TESTNET_FEE_TO_SETTER', deployer)
const tokenA = optionalAddress('ARC_TESTNET_TOKEN_A', ARC_TESTNET_USDC)
const tokenB = optionalAddress('ARC_TESTNET_TOKEN_B', ARC_TESTNET_EURC)
const compiledFactory = readJson(resolve(contractsRoot, 'out/CocoFactory.sol/CocoFactory.json'), 'CocoFactory artifact')
const compiledRouter = readJson(resolve(contractsRoot, 'out/CocoRouter.sol/CocoRouter.json'), 'CocoRouter artifact')
const compiledPair = readJson(resolve(contractsRoot, 'out/CocoPair.sol/CocoPair.json'), 'CocoPair artifact')
const factoryTransaction = selectUniqueTransaction(
  factoryArtifact,
  (tx) => tx.transactionType === 'CREATE' && tx.contractName === 'CocoFactory',
  'factory broadcast',
)
const routerTransaction = selectUniqueTransaction(
  routerArtifact,
  (tx) => tx.transactionType === 'CREATE' && tx.contractName === 'CocoRouter',
  'router broadcast',
)
const pairTransaction = selectUniqueTransaction(
  pairArtifact,
  (tx) => tx.function?.startsWith('createPair('),
  'pair broadcast',
  true,
)
const factory = createAddress(factoryArtifact, factoryTransaction, 'CocoFactory', 'ARC_TESTNET_FACTORY_ADDRESS')
const router = createAddress(routerArtifact, routerTransaction, 'CocoRouter', 'ARC_TESTNET_ROUTER_ADDRESS')
const factoryDeployment = transactionRecord(factoryArtifact, (tx) => tx === factoryTransaction, deployer)
const routerDeployment = transactionRecord(routerArtifact, (tx) => tx === routerTransaction, deployer)
const pairCreation = transactionRecord(pairArtifact, (tx) => tx === pairTransaction, deployer)
if (!factoryDeployment || !routerDeployment) fail('factory and router deployment transactions are required')
const factoryConstructorArgs = encodeAbiParameters([{ type: 'address' }], [feeToSetter])
const routerConstructorArgs = encodeAbiParameters([{ type: 'address' }], [factory])
requireExactData(factoryTransaction, creationData(compiledFactory, factoryConstructorArgs, 'CocoFactory'), 'factory deployment')
requireExactData(routerTransaction, creationData(compiledRouter, routerConstructorArgs, 'CocoRouter'), 'router deployment')
if (pairTransaction) {
  const destination = pairTransaction.transaction?.to ?? pairTransaction.tx?.to
  if (!destination || getAddress(destination) !== factory) fail('pair creation destination is not the recorded factory')
  requireExactData(pairTransaction, encodeFunctionData({
    abi: [{ type: 'function', name: 'createPair', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }],
    functionName: 'createPair',
    args: [tokenA, tokenB],
  }).toLowerCase(), 'pair creation')
}
const createdPairs = pairTransaction?.additionalContracts?.filter((contract) => contract.transactionType === 'CREATE2') ?? []
if (pairTransaction && createdPairs.length !== 1) fail('pair creation must contain exactly one CREATE2 contract')
const pair = createdPairs[0]?.address ?? process.env.ARC_TESTNET_PAIR_ADDRESS
if (!pair) fail('pair address not found; set ARC_TESTNET_PAIR_ADDRESS for a reused pair')

const creationBytecode = compiledPair.bytecode?.object
if (!creationBytecode || creationBytecode === '0x') fail('CocoPair creation bytecode missing')
const [token0, token1] = BigInt(tokenA) < BigInt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
const expectedPair = getCreate2Address({
  from: factory,
  salt: keccak256(encodePacked(['address', 'address'], [token0, token1])),
  bytecodeHash: keccak256(creationBytecode),
})
if (getAddress(pair) !== expectedPair) fail('pair address does not match the deterministic CREATE2 address')

await verifyLiveTransaction(factoryTransaction, factoryDeployment, deployer, null, factory, 'factory deployment')
await verifyLiveTransaction(routerTransaction, routerDeployment, deployer, null, router, 'router deployment')
if (pairTransaction) await verifyLiveTransaction(pairTransaction, pairCreation, deployer, factory, null, 'pair creation')
const [factoryRuntime, routerRuntime, pairRuntime] = await Promise.all([
  client.getCode({ address: factory }),
  client.getCode({ address: router }),
  client.getCode({ address: getAddress(pair) }),
])
const expectedFactoryRuntime = materializeRuntimeBytecode(compiledFactory, null, 'CocoFactory')
const expectedRouterRuntime = materializeRuntimeBytecode(compiledRouter, factory, 'CocoRouter')
const expectedPairRuntime = materializeRuntimeBytecode(compiledPair, null, 'CocoPair')
if (factoryRuntime?.toLowerCase() !== expectedFactoryRuntime) fail('live factory runtime bytecode differs from the reviewed build')
if (routerRuntime?.toLowerCase() !== expectedRouterRuntime) fail('live router runtime bytecode differs from the reviewed build')
if (pairRuntime?.toLowerCase() !== expectedPairRuntime) fail('live pair runtime bytecode differs from the reviewed build')

const record = {
  chainId: CHAIN_ID,
  deployer: getAddress(deployer),
  feeToSetter,
  factory,
  router,
  tokenA,
  tokenB,
  pair: getAddress(pair),
  factoryCodeHash: keccak256(factoryRuntime),
  routerCodeHash: keccak256(routerRuntime),
  pairCodeHash: keccak256(pairRuntime),
  pairInitCodeHash: keccak256(creationBytecode),
  constructorArgs: {
    factory: factoryConstructorArgs,
    router: routerConstructorArgs,
  },
  transactions: { factoryDeployment, routerDeployment, pairCreation },
  source: { broadcastFiles: artifactPaths },
  note: 'Arc Testnet only. No production deployment. Old contracts remain live and unchanged.',
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
console.log(`Recorded Arc Testnet deployment: ${outputPath}`)
console.log(JSON.stringify(record, null, 2))
