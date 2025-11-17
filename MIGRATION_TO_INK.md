# Migration Plan: Solidity (Moonbeam) → ink! (Substrate)

## Executive Summary

**Problem:** Current implementation uses Solidity contracts on Moonbase Alpha (EVM parachain), which has connectivity and compatibility issues with Polkadot wallets.

**Solution:** Migrate to ink! smart contracts (Rust/WASM) deployable on any Substrate chain including Paseo testnet.

**Effort:** 2-3 days for experienced Rust/Polkadot developer
**Impact:** Medium (700 lines to modify, net -550 lines)
**Risk:** Low (Polkadot infrastructure already in place)

---

## Current Architecture

### Technology Stack
- **Contract:** Solidity (ContentPassFactoryV2.sol)
- **Chain:** Moonbase Alpha (Moonbeam testnet, EVM-compatible parachain)
- **Wallet:** Polkadot extensions (SubWallet, Talisman, Polkadot.js)
- **Frontend:** ethers.js v5 + custom EVM wrapper
- **Signing:** Hybrid (window.ethereum → ethereum.transact → Polkadot extrinsic)

### Current Integration Points
```
User Wallet (Substrate)
  ↓ (address conversion)
EVM Address (20 bytes)
  ↓ (ethers.js)
Contract Call → ABI encoding → Keccak256
  ↓ (ethereum.transact)
Moonbeam's Ethereum Pallet → EVM execution
```

### Files Affected (7 total)
| File | Lines | Current Function |
|------|-------|------------------|
| `src/evm-contract.js` | 336 | Custom EVM wrapper with ABI encoding |
| `src/wallet-manager.js` | 486 | Wallet + EVM signer (hybrid architecture) |
| `public/content-loader.js` | 301 | Contract queries for metadata |
| `public/deck-library.html` | 580 | Marketplace UI (claim/purchase) |
| `public/vault.html` | 286 | Owned decks UI |
| `public/reader.html` | 349 | Content access verification |
| `src/main.js` | 24 | Entry point |

---

## Target Architecture (ink!)

### Technology Stack
- **Contract:** ink! (Rust + WASM)
- **Chain:** Any Substrate chain (Paseo, Westend, Rococo, production parachains)
- **Wallet:** Polkadot extensions (same as current)
- **Frontend:** @polkadot/api-contract (already installed!)
- **Signing:** Native Substrate extrinsics (simpler)

### New Integration Flow
```
User Wallet (Substrate)
  ↓ (no conversion needed!)
Substrate Address (32 bytes)
  ↓ (@polkadot/api-contract)
Contract Call → SCALE codec → metadata
  ↓ (contracts.call)
Contracts Pallet → WASM execution
```

### Advantages
1. **Simpler Architecture:** Remove EVM encoding layer (~550 lines less code)
2. **Native Polkadot:** No address conversion, direct integration
3. **Type Safety:** SCALE codec with proper TypeScript types
4. **Lower Fees:** Weight-based fees typically cheaper than EVM gas
5. **Better Tooling:** cargo-contract, contracts-ui, substrate.io
6. **Chain Agnostic:** Deploy to ANY Substrate chain (Paseo, Westend, production)
7. **Already 80% There:** Using @polkadot/api and Polkadot wallets

---

## Migration Checklist

### Phase 1: Smart Contract Rewrite (1-2 days)

#### 1.1 Setup ink! Development Environment
- [ ] Install Rust toolchain (`rustup`)
- [ ] Install `cargo-contract` CLI
- [ ] Install `substrate-contracts-node` (local testing)
- [ ] Setup IDE with rust-analyzer

#### 1.2 Port Solidity Contract to ink!
- [ ] Create new ink! project: `cargo contract new content-pass-factory`
- [ ] Implement ERC-1155 equivalent (PSP-34 standard)
- [ ] Port core functionality:
  - [ ] `createContent()` - Content creation with pricing
  - [ ] `claim()` - Free content claiming
  - [ ] `purchase()` - Paid content purchase
  - [ ] `purchaseWithReferral()` - Referral system
  - [ ] `balanceOf()` - Token ownership check
  - [ ] `getContentInfo()` - Metadata retrieval
  - [ ] `getActiveVersion()` - Version management
  - [ ] `setPrice()` - Creator pricing control
  - [ ] `setReferralRate()` - Referral rate control
  - [ ] `withdraw()` - Creator earnings withdrawal
  - [ ] `withdrawReferralEarnings()` - Referrer earnings
- [ ] Add governance functions:
  - [ ] `governanceUpdateContent()` - Content updates
  - [ ] `setTreasury()` - Treasury management
  - [ ] `setPlatformFeeRate()` - Fee configuration
- [ ] Implement events:
  - [ ] `ContentCreated`
  - [ ] `PassPurchased`
  - [ ] `PassClaimed`
  - [ ] `PriceUpdated`
  - [ ] `ReferralEarned`
  - [ ] etc.

#### 1.3 Testing
- [ ] Write unit tests for all functions
- [ ] Test on local substrate-contracts-node
- [ ] Deploy to Paseo testnet
- [ ] Verify with contracts-ui

#### 1.4 Export Contract Metadata
- [ ] Build contract: `cargo contract build --release`
- [ ] Export `target/ink/content_pass_factory.json` (metadata)
- [ ] Export contract ABI for frontend

---

### Phase 2: Frontend Migration (1 day)

#### 2.1 Create ink! Contract Wrapper
**New file:** `src/ink-contract.js` (~150 lines)

```javascript
import { ContractPromise } from '@polkadot/api-contract';

class InkContract {
    constructor(api, address, metadata, signer) {
        this.api = api;
        this.contract = new ContractPromise(api, metadata, address);
        this.signer = signer;
    }

    // Read operations (view functions)
    async query(method, ...args) {
        const { result, output } = await this.contract.query[method](
            this.signer.address,
            {
                gasLimit: this.api.registry.createType('WeightV2', {
                    refTime: 100_000_000_000,
                    proofSize: 100_000
                })
            },
            ...args
        );

        if (result.isErr) {
            throw new Error(result.asErr);
        }

        return output.toHuman();
    }

    // Write operations (state changes)
    async tx(method, value, ...args) {
        const gasLimit = this.api.registry.createType('WeightV2', {
            refTime: 300_000_000_000,
            proofSize: 200_000
        });

        return new Promise((resolve, reject) => {
            this.contract.tx[method](
                { gasLimit, value },
                ...args
            ).signAndSend(
                this.signer.address,
                { signer: this.signer.signer },
                ({ status, events, dispatchError }) => {
                    if (dispatchError) {
                        if (dispatchError.isModule) {
                            const decoded = this.api.registry.findMetaError(dispatchError.asModule);
                            reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs}`));
                        } else {
                            reject(new Error(dispatchError.toString()));
                        }
                    } else if (status.isFinalized) {
                        resolve({
                            hash: status.asFinalized.toHex(),
                            events: events
                        });
                    }
                }
            ).catch(reject);
        });
    }

    // Helper methods matching Solidity interface
    async balanceOf(account, tokenId) {
        const result = await this.query('balanceOf', account, tokenId);
        return BigInt(result);
    }

    async getContentInfo(contentId) {
        return await this.query('getContentInfo', contentId);
    }

    async getActiveVersion(contentId) {
        return await this.query('getActiveVersion', contentId);
    }

    async contentPrice(contentId) {
        const result = await this.query('contentPrice', contentId);
        return BigInt(result);
    }

    async claim(contentId) {
        return await this.tx('claim', 0, contentId);
    }

    async purchase(contentId, amount, price) {
        return await this.tx('purchase', price, contentId, amount);
    }

    async purchaseWithReferral(contentId, amount, referrer, price) {
        return await this.tx('purchaseWithReferral', price, contentId, amount, referrer);
    }
}

export default InkContract;
```

**Changes needed:**
- [ ] Create `src/ink-contract.js`
- [ ] Delete `src/evm-contract.js`

#### 2.2 Update Wallet Manager
**File:** `src/wallet-manager.js` (~200 lines to remove)

**Remove:**
- [ ] `substrateToEvm()` - No EVM address conversion needed
- [ ] `getSigner()` - Simplify (no window.ethereum complexity)
- [ ] `createPolkadotEVMSigner()` - Delete entire class
- [ ] `signTransaction()` EIP-1559 logic
- [ ] All ethers.js compatibility code

**Keep:**
- [x] `web3Enable()` - Polkadot wallet connection
- [x] `web3Accounts()` - Account management
- [x] `web3FromAddress()` - Injector for signing
- [x] `connectToChain()` - WebSocket connection to chain
- [x] `disconnect()` logic

**Update:**
```javascript
async getContract(metadata) {
    if (!this.isConnected()) {
        return null;
    }

    const InkContract = (await import('./ink-contract.js')).default;

    return new InkContract(
        this.api,
        CONTRACT_ADDRESS,
        metadata,
        {
            address: this.selectedAccount.address,
            signer: this.injector.signer
        }
    );
}

// Remove getEvmAddress(), only keep:
getSubstrateAddress() {
    return this.selectedAccount?.address;
}
```

#### 2.3 Update Contract Calls
**Files:** `content-loader.js`, `deck-library.html`, `vault.html`, `reader.html`

**Pattern changes:**

**OLD (Solidity/ethers.js):**
```javascript
// Read
const balance = await contract.balanceOf(userAddress, contentId);
const info = await contract.getContentInfo(contentId);
const price = await contract.contentPrice(contentId);

// Write
await contract.claim(contentId, { gasLimit: 300000 });
await contract.purchase(contentId, 1, { value: price });
```

**NEW (ink!):**
```javascript
// Read (same API - backward compatible!)
const balance = await contract.balanceOf(userAddress, contentId);
const info = await contract.getContentInfo(contentId);
const price = await contract.contentPrice(contentId);

// Write (pass value as parameter, not options)
await contract.claim(contentId);
await contract.purchase(contentId, 1, price);
```

**Changes per file:**
- [ ] `content-loader.js` - Update ~15 contract calls
- [ ] `deck-library.html` - Update ~10 contract calls (claim/purchase)
- [ ] `vault.html` - Update ~5 contract calls (balanceOf)
- [ ] `reader.html` - Update ~5 contract calls (access checks)

#### 2.4 Update Contract Metadata Loading
**ALL HTML files:**

**OLD:**
```html
<script>
const CONTRACT_ABI = [
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function claim(uint256 contentId) external"
];
</script>
```

**NEW:**
```html
<script>
// Load ink! metadata JSON
const METADATA_URL = '/contract-metadata.json';
let contractMetadata;

async function loadMetadata() {
    const response = await fetch(METADATA_URL);
    contractMetadata = await response.json();
}

// Use in contract initialization
await loadMetadata();
const contract = await walletManager.getContract(contractMetadata);
</script>
```

**Changes:**
- [ ] Add `public/contract-metadata.json` (from ink! build)
- [ ] Update all HTML files to load metadata
- [ ] Remove ethers.js script tags
- [ ] Update contract initialization code

#### 2.5 Remove Dependencies
**File:** `package.json`

**No changes needed!** Already have `@polkadot/api-contract`

**Optional cleanup:**
- [ ] Remove `ethers` from HTML CDN imports (if not needed elsewhere)

---

### Phase 3: Testing & Deployment (0.5 day)

#### 3.1 Local Testing
- [ ] Test on local substrate-contracts-node
- [ ] Verify all contract calls work
- [ ] Test claim flow (free content)
- [ ] Test purchase flow (paid content)
- [ ] Test referral flow
- [ ] Verify content loading/decryption

#### 3.2 Testnet Deployment
- [ ] Deploy contract to Paseo testnet
- [ ] Update `CONTRACT_ADDRESS` in config
- [ ] Update `CHAIN_WS` to Paseo endpoint
- [ ] Create test content (6 decks)
- [ ] End-to-end testing

#### 3.3 Documentation Updates
- [ ] Update README.md
- [ ] Update network configuration
- [ ] Add ink! development instructions
- [ ] Update deployment guide

---

## Configuration Changes

### Before (Moonbase Alpha)
```javascript
// src/wallet-manager.js
const CONTRACT_ADDRESS = "0xBFF26E227Cb5fb0Feb0D18250C0a655A6066C865";
const MOONBASE_ALPHA_WS = 'wss://wss.api.moonbase.moonbeam.network';
const CHAIN_ID = 1287;
```

### After (Paseo)
```javascript
// src/wallet-manager.js
const CONTRACT_ADDRESS = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"; // Example
const PASEO_WS = 'wss://paseo.rpc.amforc.com';
const CHAIN_ID = null; // Not needed for Substrate
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Contract bugs in ink! port | Medium | High | Comprehensive testing, audit |
| Metadata incompatibility | Low | Medium | Use standard PSP-34 |
| Frontend integration issues | Low | Low | Similar API design |
| User experience changes | Low | Medium | Maintain same UX flow |
| Performance degradation | Very Low | Low | WASM typically faster than EVM |

---

## Rollback Plan

If migration fails or issues are discovered:

1. **Keep both versions running**
   - Maintain Moonbase Alpha deployment
   - Run ink! version in parallel
   - Use feature flag to switch

2. **Gradual migration**
   - Deploy new content to ink! only
   - Keep old content on Moonbase
   - Migrate users over time

3. **Full rollback**
   - Revert to commit before migration
   - Keep ink! code in separate branch
   - Revisit when ready

---

## Success Criteria

- [ ] All 11 contract functions working on Paseo
- [ ] All 6 demo decks deployed and accessible
- [ ] Claim flow works (free content)
- [ ] Purchase flow works (paid content)
- [ ] Referral system functional
- [ ] Content loading/decryption unchanged
- [ ] Gas costs reasonable
- [ ] No degradation in UX
- [ ] Tests passing
- [ ] Documentation updated

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| ink! contract development | 1-2 days | Rust knowledge |
| Frontend migration | 0.5-1 day | Contract deployed |
| Testing | 0.5 day | Frontend complete |
| Documentation | 0.5 day | All complete |
| **TOTAL** | **2.5-4 days** | Experienced Rust dev |

---

## Key Learnings

### What Went Right
- Already using Polkadot infrastructure (80% done)
- @polkadot/api-contract already installed
- No major architectural changes needed
- Simpler code (net -550 lines)

### What to Watch For
- SCALE codec encoding differences
- Weight estimation (vs gas limits)
- Storage deposit requirements (ink! specific)
- Event parsing differences

---

## Resources

### Documentation
- [ink! Documentation](https://use.ink/)
- [Substrate Contracts](https://docs.substrate.io/tutorials/smart-contracts/)
- [@polkadot/api-contract](https://polkadot.js.org/docs/api-contract)
- [PSP-34 (NFT Standard)](https://github.com/w3f/PSPs/blob/master/PSPs/psp-34.md)

### Tools
- [cargo-contract](https://github.com/paritytech/cargo-contract) - CLI for ink!
- [Contracts UI](https://contracts-ui.substrate.io/) - Web UI for testing
- [substrate-contracts-node](https://github.com/paritytech/substrate-contracts-node) - Local node

### Examples
- [ink! Examples](https://github.com/paritytech/ink-examples)
- [PSP-34 Implementation](https://github.com/Brushfam/openbrush-contracts/tree/main/contracts/src/token/psp34)

---

## Next Steps

1. **Immediate:** Test the current Moonbase Alpha fix
2. **If fix fails:** Start Phase 1 (ink! contract development)
3. **If fix succeeds:** Keep this plan for future reference

---

## Contact

For questions about this migration plan:
- Review this document
- Check ink! documentation
- Consult Polkadot StackExchange

---

**Last Updated:** 2025-11-17
**Author:** Claude (AI Assistant)
**Status:** Draft - Ready for implementation
