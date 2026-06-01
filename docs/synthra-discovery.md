# Synthra Discovery Diagnostics

## Scope

This diagnostic pass inspected the public Synthra app and docs bundles for Arc Testnet contract configuration, then tested read-only quote methods on Arc Testnet. Swap execution is intentionally not enabled here.

## Sources searched

- `https://app.synthra.org/`
- `https://app.synthra.org/static/js/3725.382cf41f.js`
- `https://app.synthra.org/static/js/main.26a8bed5.js`
- `https://docs.synthra.org/`
- `https://docs.synthra.org/assets/index-DEOHlRSa.js`

## Candidate contracts

The app bundle contains an Arc deployment block for `ChainId.ARC` (`5042002`) with:

- V3 factory: `0x0fB6EEDA6e90E90797083861A75D15752a27f59c`
- V3 multicall: `0xe139b61c9B8Eebf32bb335cb11AA6B7Cd69e13f4`
- V3 quoter: `0x3Ce954107b1A675826B33bF23060Dd655e3758fE`
- V3 position manager: `0x444Cc395346428216fB6f2892eb03cB804aE4CD5`
- V3 tick lens: `0x84040D61a3f4fd9E116FBb5fB633DaC9172AC5F8`
- V3 swap router: `0xA545bCB1Bd7985c59ea162aB1748A0803434C31b`
- UniversalRouter: `0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F`
- Wrapped native USDC: `0x911b4000D3422F482F4062a913885f7b035382Df`

The docs bundle also exposes perps contracts on Arc Testnet:

- OrderRouter: `0x076a864b5f3cc9004080e832c34f488553910ab0`
- Oracle: `0x6ee51c1ee45a5c986f8612aa7c572a9216c4eff8`
- PoolToken: `0xac36804b4a860c5463f3b89d077a0653aaa9d8f1`

## Quote methods tested

The diagnostic script tests both USDC -> EURC and EURC -> USDC against discovered candidates using:

- `getAmountsOut(uint256,address[])`
- `getAmountOut(address,address,uint256)`
- `getAmountOut(uint256,address,address)`
- `quoteExactInputSingle(address,address,uint24,uint256,uint160)`
- `quoteExactInputSingle((address,address,uint256,uint24,uint160))`
- `quoteExactInput(bytes,uint256)`

## Result

The Synthra V3 quoter `0x3Ce954107b1A675826B33bF23060Dd655e3758fE` returned valid direct USDC/EURC quotes through the tuple `quoteExactInputSingle` call and `quoteExactInput(bytes,uint256)`.

Execution remains disabled. The route panel uses Synthra for quote display only and marks it `Quote only` / `Execution coming soon`.
