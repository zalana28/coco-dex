import deployment from '../../../contracts/deployments/classic-v2-arc-testnet.json'
import { ARC_TESTNET_CHAIN_ID, routerRegistrySchema, type EvidenceSource } from './types'

const RETRIEVED_ON = '2026-07-19T00:00:00.000Z'
const repoPath = (relativePath: string): string => relativePath

// Coco canonical source of truth: deployment JSON and real Solidity sources.
// Compiled artifacts are gitignored (contracts/out), so they are not claimed here.
const cocoDeployment: EvidenceSource = {
  kind: 'repo-deployment-json',
  reference: repoPath('contracts/deployments/classic-v2-arc-testnet.json'),
  weight: 'authoritative',
}
const cocoSource = (file: string): EvidenceSource => ({
  kind: 'official-repository',
  reference: repoPath(`contracts/src/${file}`),
  weight: 'authoritative',
  retrievedOn: RETRIEVED_ON,
  note: 'Coco Classic V2 source of truth; deployment addresses are authoritative.',
})
const cocoTest = (file: string): EvidenceSource => ({
  kind: 'official-repository',
  reference: repoPath(`contracts/test/${file}`),
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Coco canonical invariant and correctness tests.',
})

const requestCandidate: EvidenceSource = {
  kind: 'operatorSuppliedCandidate',
  reference: 'task candidate inventory',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Operator-supplied candidate; not authoritative provenance.',
}
const xylonetThreeArgAbi: EvidenceSource = {
  kind: 'operatorSuppliedCandidate',
  reference: 'getAmountOut(address tokenIn,address tokenOut,uint256 amountIn)',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Operator-supplied 3-argument quote ABI candidate; independently unresolved and not accepted for execution.',
}
const xylonetFourArgAbi: EvidenceSource = {
  kind: 'operatorSuppliedCandidate',
  reference: 'getAmountOut(address pool,address tokenIn,address tokenOut,uint256 amountIn)',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Operator-supplied 4-argument quote ABI candidate; conflicts with the 3-argument candidate and is not accepted for execution.',
}
const unitflowOfficialContracts: EvidenceSource = {
  kind: 'unitflowOfficialContracts',
  reference: 'https://docs.unitflow.finance/docs/dev/contracts',
  weight: 'authoritative',
  retrievedOn: RETRIEVED_ON,
  note: 'Official UnitFlow contract table. Authoritative deployment values, but not sufficient execution proof.',
}
const unitflowOfficialUniversalRouter: EvidenceSource = {
  kind: 'unitflowOfficialVersionDocs',
  reference: 'https://docs.unitflow.finance/docs/dev/universal-router',
  weight: 'authoritative',
  retrievedOn: RETRIEVED_ON,
  note: 'Official UniversalRouter documentation; command-based execution model carries arbitrary-call risk.',
}
const unitflowOfficialRepo: EvidenceSource = {
  kind: 'unitflowOfficialRepository',
  reference: 'https://github.com/UnitFlow-Finance/UnitFlowV25-contracts',
  weight: 'authoritative',
  retrievedOn: RETRIEVED_ON,
  note: 'Official UnitFlow V2.5 repository; source/artifact cross-check reference.',
}
const unitflowV3Deployment: EvidenceSource = {
  kind: 'unitflowOfficialDeploymentArtifact',
  reference: 'https://github.com/UnitFlow-Finance/UnitFlowV3-contract/blob/main/deployments/addresses.json',
  weight: 'authoritative',
  retrievedOn: RETRIEVED_ON,
  note: 'Official Arc Testnet V3 deployment artifact, including current contracts and deprecated candidates.',
}
const xylonetOfficialSite: EvidenceSource = {
  kind: 'official-documentation',
  reference: 'https://www.xylonet.xyz/',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Official product surface confirms Arc/USDC/EURC claims but does not establish contract addresses or ABI.',
}
const xylonetArcscan: EvidenceSource = {
  kind: 'verifiedArcscan',
  reference: 'https://testnet.arcscan.app/address/0x73742278c31a76dBb0D2587d03ef92E6E2141023',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Arcscan names XyloRouter with verified source; ABI strength still requires independent confirmation before quote-only classification.',
}
const synthraOfficialDocs: EvidenceSource = {
  kind: 'official-documentation',
  reference: 'https://docs.synthra.org/',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Official docs describe Arc and V3/SynRoute concepts but do not establish candidate deployment addresses.',
}
const existingFrontend: EvidenceSource = {
  kind: 'unitflowFrontendObserved',
  reference: 'repository frontend configuration at starting SHA 11af092',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Existing frontend configuration is preserved only as stale secondary discovery evidence; not an official conflict.',
}
const synthraFrontend: EvidenceSource = {
  kind: 'provider-frontend-config',
  reference: 'repository frontend configuration at starting SHA 11af092',
  weight: 'secondary',
  retrievedOn: RETRIEVED_ON,
  note: 'Synthra frontend labels are secondary evidence and cannot establish an Arc deployment.',
}

const token = (symbol: 'USDC' | 'EURC', address: string) => ({
  symbol,
  address,
  decimals: 6,
  applicationAmountUnit: 'erc20-6-decimal' as const,
})
const tokens = [token('USDC', deployment.tokenA), token('EURC', deployment.tokenB)]
const incompleteChecks = {
  address: false,
  bytecode: false,
  implementation: false,
  abi: false,
  poolRelationship: false,
  tokenDecimals: false,
  allowanceTarget: false,
  quotePath: false,
  executionSimulation: false,
} as const
const candidate = (
  label: string,
  address: string,
  role:
    | 'factory'
    | 'router'
    | 'liquidity-router'
    | 'quoter'
    | 'pool'
    | 'pair'
    | 'position-manager'
    | 'position-descriptor'
    | 'pool-manager'
    | 'universal-router'
    | 'permit2'
    | 'wrapper'
    | 'multicall'
    | 'tick-lens'
    | 'nft'
    | 'other',
  provenance: EvidenceSource[],
  options: { conflictGroup?: string; conflictClass?: 'official-vs-official' | 'official-vs-frontend' | 'official-vs-runtime' | 'frontend-vs-runtime' | 'unresolved-candidate' | 'stale-frontend-candidate'; expectedRuntimeCodeHash?: string } = {},
) => ({ label, address, role, provenance, ...options })

const rawRegistry = [
  {
    id: 'coco',
    displayName: 'Coco',
    chainId: ARC_TESTNET_CHAIN_ID,
    protocolType: 'coco-classic-v2',
    status: 'unverified',
    factory: candidate('Coco Classic V2 Factory', deployment.factory, 'factory', [cocoDeployment, cocoSource('CocoFactory.sol')], { expectedRuntimeCodeHash: deployment.factoryCodeHash }),
    router: candidate('Coco Classic V2 Router', deployment.router, 'router', [cocoDeployment, cocoSource('CocoRouter.sol'), cocoSource('CocoLibrary.sol')], { expectedRuntimeCodeHash: deployment.routerCodeHash }),
    pools: [candidate('Coco USDC/EURC Pair', deployment.pair, 'pair', [cocoDeployment, cocoSource('CocoPair.sol')], { expectedRuntimeCodeHash: deployment.pairCodeHash })],
    inventoryCandidates: [],
    conflictingCandidates: [],
    poolDiscoveryMethod: 'factory.getPair(tokenA, tokenB), checked in both token orders against the canonical deployment pair',
    supportedTokens: tokens,
    supportedPairs: [['USDC', 'EURC']] as [('USDC' | 'EURC'), ('USDC' | 'EURC')][],
    quoteDirections: ['usdc-to-eurc', 'eurc-to-usdc'] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    executionDirections: [] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    abiProvenance: [cocoSource('CocoRouter.sol'), cocoSource('CocoLibrary.sol'), cocoTest('CocoRouterCorrectness.t.sol')],
    documentationProvenance: [cocoDeployment],
    sourceCodeProvenance: [cocoSource('CocoFactory.sol'), cocoSource('CocoRouter.sol'), cocoSource('CocoPair.sol'), cocoSource('CocoLibrary.sol')],
    verificationChecks: incompleteChecks,
    upgradeability: {
      proxyKind: 'unknown',
      mutable: true,
      requiresReauditOnUpgrade: true,
      warning: 'Registry data alone does not prove non-proxy status; every live run resolves proxy evidence fail-closed at its fixed block.',
    },
    evidenceSources: [cocoDeployment, cocoSource('CocoFactory.sol'), cocoSource('CocoRouter.sol'), cocoSource('CocoPair.sol')],
    disableReason: 'Live fixed-block code, proxy, relationship, quote, reserve, and simulation evidence must all pass before execution can be considered.',
  },
  {
    id: 'xylonet',
    displayName: 'XyloNet',
    chainId: ARC_TESTNET_CHAIN_ID,
    protocolType: 'xylo-stable',
    status: 'unverified',
    factory: candidate('XyloNet candidate factory', '0x60EDeFB094B84BBC6430cc130B358A43Ba1979e2', 'factory', [requestCandidate, xylonetOfficialSite, xylonetArcscan]),
    router: candidate('XyloNet candidate router', '0x73742278c31a76dBb0D2587d03ef92E6E2141023', 'router', [requestCandidate, xylonetOfficialSite, xylonetArcscan]),
    pools: [candidate('XyloNet candidate USDC/EURC pool', '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1', 'pool', [requestCandidate, xylonetOfficialSite, xylonetArcscan])],
    inventoryCandidates: [],
    conflictingCandidates: [],
    poolDiscoveryMethod: 'candidate pool must be reconciled with factory/router relationships at one fixed audit block',
    supportedTokens: tokens,
    supportedPairs: [['USDC', 'EURC']] as [('USDC' | 'EURC'), ('USDC' | 'EURC')][],
    quoteDirections: ['usdc-to-eurc', 'eurc-to-usdc'] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    executionDirections: [] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    abiProvenance: [xylonetThreeArgAbi, xylonetFourArgAbi],
    documentationProvenance: [xylonetOfficialSite],
    sourceCodeProvenance: [xylonetArcscan],
    verificationChecks: incompleteChecks,
    upgradeability: {
      proxyKind: 'unknown',
      mutable: true,
      requiresReauditOnUpgrade: true,
      warning: 'Proxy and implementation structure are unresolved.',
    },
    evidenceSources: [requestCandidate, xylonetOfficialSite, xylonetArcscan],
    disableReason: 'Address, ABI, pool relationship, proxy state, allowance target, and execution simulation require independent fixed-block verification.',
  },
  {
    id: 'unitflow',
    displayName: 'UnitFlow',
    chainId: ARC_TESTNET_CHAIN_ID,
    protocolType: 'unitflow-v25',
    status: 'disabled',
    factory: candidate('UnitFlow V2.5 Factory', '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5', 'factory', [unitflowOfficialContracts, unitflowOfficialRepo, existingFrontend]),
    router: candidate('UnitFlow V2.5 Swap Router', '0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A', 'router', [unitflowOfficialContracts, unitflowOfficialRepo, existingFrontend]),
    pools: [],
    inventoryCandidates: [
      candidate('UnitFlow V2.5 Liquidity Router', '0x0ef57CC428c851e9a9b7cD97190EF3D3EFe4B631', 'liquidity-router', [unitflowOfficialContracts, unitflowOfficialRepo]),
      candidate('UnitFlow WUSDC', '0x911b4000D3422F482F4062a913885f7b035382Df', 'wrapper', [unitflowOfficialContracts]),
      candidate('UnitFlow Permit2', '0x4ce562F687d0Ced27b79Ba51d79B63BD978F7F48', 'permit2', [unitflowOfficialContracts, unitflowOfficialUniversalRouter, existingFrontend]),
      candidate('UnitFlow V3 Factory', '0xAb6A8AAb7d490007634ef59d424b5d89688a1971', 'factory', [unitflowOfficialContracts, unitflowV3Deployment]),
      candidate('UnitFlow V3 Interface Multicall', '0x0453A723b4974dBc044B60F303E37C394F7FDdE5', 'multicall', [unitflowV3Deployment]),
      candidate('UnitFlow V3 NFT Descriptor', '0x9A37137Bdf62d3ddfA648f1616fcF38A91637660', 'nft', [unitflowV3Deployment]),
      candidate('UnitFlow V3 Nonfungible Token Position Descriptor', '0x421EeCc906A63C7261671e60A0F2Be9D02bbeB50', 'position-descriptor', [unitflowV3Deployment]),
      candidate('UnitFlow V3 Quoter', '0x121aeB6DEf00F6F67665008CaC1C19805886ed1a', 'quoter', [unitflowOfficialContracts, unitflowV3Deployment]),
      candidate('UnitFlow V3 Migrator', '0x4122f9B4ee7C18CC6b6b71180B438477D17034AB', 'other', [unitflowOfficialContracts]),
      candidate('UnitFlow V3 Tick Lens', '0x621d5704C2B3470D21BaC7Bb47B1b933116551fA', 'tick-lens', [unitflowOfficialContracts]),
      candidate('UnitFlow V4 Quoter', '0xf9d5Ae3c08602390ea15A3968f2D25cc3c3A7ced', 'quoter', [unitflowOfficialContracts]),
      candidate('UnitFlow V4 State View', '0xEAea934839E8A7CfBfd85336380F77d72e090bBe', 'other', [unitflowOfficialContracts]),
      candidate('UnitFlow V4 Position Manager', '0xA464d4e7614546a127773CedBDDd64FB81421723', 'position-manager', [unitflowOfficialContracts]),
    ],
    conflictingCandidates: [
      candidate('UnitFlow UniversalRouter', '0xEaF3195bE51861632cd32850973C9515DA48e76F', 'universal-router', [unitflowOfficialContracts, unitflowOfficialUniversalRouter], { conflictGroup: 'unitflow-universal-router', conflictClass: 'official-vs-frontend' }),
      candidate('UnitFlow UniversalRouter (stale frontend)', '0xC43cC6A1E0F6EB48Cd4131522C1C73B13f3Da0F1', 'universal-router', [existingFrontend], { conflictGroup: 'unitflow-universal-router', conflictClass: 'stale-frontend-candidate' }),
      candidate('UnitFlow V3 Router', '0xB0Ba24f9C49D933523219e92528E7e5db93e9AFc', 'router', [unitflowOfficialContracts, unitflowV3Deployment], { conflictGroup: 'unitflow-v3-router', conflictClass: 'official-vs-official' }),
      candidate('UnitFlow V3 Router v1 (deprecated)', '0x23970b3a5AD7211eC4A858a29258F1e288eE2420', 'router', [unitflowV3Deployment, existingFrontend], { conflictGroup: 'unitflow-v3-router', conflictClass: 'stale-frontend-candidate' }),
      candidate('UnitFlow V3 Router v2 (deprecated)', '0x75eDe46A468Eb600C10982e6FdCeADCB37a40930', 'router', [unitflowV3Deployment], { conflictGroup: 'unitflow-v3-router', conflictClass: 'unresolved-candidate' }),
      candidate('UnitFlow V3 Router v3 wrong factory (deprecated)', '0xaf13ae532009D49ecc9Cf7d969Cb1154C0BE779F', 'router', [unitflowV3Deployment], { conflictGroup: 'unitflow-v3-router', conflictClass: 'unresolved-candidate' }),
      candidate('UnitFlow V3 Router pre-security-fix (deprecated)', '0x509cF58CdA08C7aee83a2BdBb4A1Eac907343D01', 'router', [unitflowV3Deployment], { conflictGroup: 'unitflow-v3-router', conflictClass: 'unresolved-candidate' }),
      candidate('UnitFlow V3 Position Manager', '0x0553682bc188b850acd31CBd3500Dcd0aa35372B', 'position-manager', [unitflowOfficialContracts, unitflowV3Deployment], { conflictGroup: 'unitflow-v3-position-manager', conflictClass: 'official-vs-official' }),
      candidate('UnitFlow V3 Position Manager v1 (deprecated)', '0x394f12daac66786D04391556AF1363a36eEB7F4B', 'position-manager', [unitflowV3Deployment, existingFrontend], { conflictGroup: 'unitflow-v3-position-manager', conflictClass: 'stale-frontend-candidate' }),
      candidate('UnitFlow V3 Position Manager v2 (deprecated)', '0xf8ecf496D9c31Cbf2aEa4DEc32471851A5c95181', 'position-manager', [unitflowV3Deployment], { conflictGroup: 'unitflow-v3-position-manager', conflictClass: 'unresolved-candidate' }),
      candidate('UnitFlow V3 Position Manager v3 wrong factory (deprecated)', '0x1b947e4b30ebE81f104C764D8D8989c95032b742', 'position-manager', [unitflowV3Deployment], { conflictGroup: 'unitflow-v3-position-manager', conflictClass: 'unresolved-candidate' }),
      candidate('UnitFlow V3 Position Manager pre-security-fix (deprecated)', '0x77c39eB310BE31e60068CE29855F83359bf85fc4', 'position-manager', [unitflowV3Deployment], { conflictGroup: 'unitflow-v3-position-manager', conflictClass: 'unresolved-candidate' }),
      candidate('UnitFlow V4 Pool Manager', '0x33C02bfb9e39AAAe30F8bE86b850f8ce53d20C0b', 'pool-manager', [unitflowOfficialContracts], { conflictGroup: 'unitflow-v4-pool-manager', conflictClass: 'official-vs-frontend' }),
      candidate('UnitFlow V4 Pool Manager (stale frontend)', '0x33eF9605420D61FCCcEc1A3048Df65b92E1ff491', 'pool-manager', [existingFrontend], { conflictGroup: 'unitflow-v4-pool-manager', conflictClass: 'stale-frontend-candidate' }),
      candidate('UnitFlow V4 Position Descriptor', '0x212f6Ded16644cB2858Aa9Cc7Df5150D0356C2C7', 'position-descriptor', [unitflowOfficialContracts], { conflictGroup: 'unitflow-v4-position-descriptor', conflictClass: 'official-vs-frontend' }),
      candidate('UnitFlow V4 Position Descriptor (stale frontend)', '0x228432d1D38c2bcAa8eE579ed52C07ef190591e4', 'position-descriptor', [existingFrontend], { conflictGroup: 'unitflow-v4-position-descriptor', conflictClass: 'stale-frontend-candidate' }),
    ],
    poolDiscoveryMethod: 'identify one V2.5 USDC/EURC quote path; do not generalize to V3, V4, UniversalRouter, Permit2, hooks, or wrapping',
    supportedTokens: tokens,
    supportedPairs: [['USDC', 'EURC']] as [('USDC' | 'EURC'), ('USDC' | 'EURC')][],
    quoteDirections: [] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    executionDirections: [] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    abiProvenance: [],
    documentationProvenance: [unitflowOfficialContracts, unitflowOfficialUniversalRouter, requestCandidate],
    sourceCodeProvenance: [unitflowOfficialRepo, unitflowV3Deployment],
    verificationChecks: incompleteChecks,
    upgradeability: {
      proxyKind: 'unknown',
      mutable: true,
      requiresReauditOnUpgrade: true,
      warning: 'Conflicting deployments and WUSDC/UniversalRouter semantics remain unresolved.',
    },
    evidenceSources: [unitflowOfficialContracts, unitflowOfficialUniversalRouter, unitflowOfficialRepo, unitflowV3Deployment, existingFrontend],
    disableReason: 'Conflicting official candidates, unresolved WUSDC conversion, and UniversalRouter arbitrary-command risk prohibit execution.',
  },
  {
    id: 'synthra',
    displayName: 'Synthra',
    chainId: ARC_TESTNET_CHAIN_ID,
    protocolType: 'synthra-v3',
    status: 'unverified',
    factory: candidate('Synthra frontend candidate V3 factory', '0x0fB6EEDA6e90E90797083861A75D15752a27f59c', 'factory', [synthraFrontend]),
    router: candidate('Synthra frontend candidate SwapRouter', '0xA545bCB1Bd7985c59ea162aB1748A0803434C31b', 'router', [synthraFrontend]),
    quoter: candidate('Synthra frontend candidate quoter', '0x3Ce954107b1A675826B33bF23060Dd655e3758fE', 'quoter', [synthraFrontend]),
    pools: [],
    inventoryCandidates: [
      candidate('Synthra frontend candidate position manager', '0x444Cc395346428216fB6f2892eb03cB804aE4CD5', 'position-manager', [synthraFrontend]),
      candidate('Synthra frontend candidate UniversalRouter', '0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F', 'universal-router', [synthraFrontend]),
      candidate('Synthra frontend candidate multicall', '0xe139b61c9B8Eebf32bb335cb11AA6B7Cd69e13f4', 'multicall', [synthraFrontend]),
      candidate('Synthra frontend candidate tick lens', '0x84040D61a3f4fd9E116FBb5fB633DaC9172AC5F8', 'tick-lens', [synthraFrontend]),
    ],
    conflictingCandidates: [],
    poolDiscoveryMethod: 'authoritative Arc deployment and active USDC/EURC pool must be established before any quote is fabricated',
    supportedTokens: tokens,
    supportedPairs: [['USDC', 'EURC']] as [('USDC' | 'EURC'), ('USDC' | 'EURC')][],
    quoteDirections: [] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    executionDirections: [] as ('usdc-to-eurc' | 'eurc-to-usdc')[],
    abiProvenance: [],
    documentationProvenance: [synthraOfficialDocs],
    sourceCodeProvenance: [],
    verificationChecks: incompleteChecks,
    upgradeability: {
      proxyKind: 'unknown',
      mutable: true,
      requiresReauditOnUpgrade: true,
      warning: 'Frontend labels are secondary evidence and cannot establish an Arc deployment.',
    },
    evidenceSources: [synthraOfficialDocs, synthraFrontend],
    disableReason: 'No authoritative Arc deployment relationship has yet been independently established.',
  },
] as const

export const ROUTER_AUDIT_REGISTRY = routerRegistrySchema.parse(rawRegistry)
