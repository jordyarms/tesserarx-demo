# Tesserarx Demo

**Reference implementation of consumer apps for the Tesserarx content pass protocol**

[![Live Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://tesserarx-demo.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Polkadot](https://img.shields.io/badge/Built%20on-Polkadot-E6007A)](https://polkadot.network/)

---

## 🚀 Polkadot Integration

This project now integrates the **Polkadot SDK** to provide native Polkadot ecosystem support:

- **Wallet Support**: Connect with Polkadot.js, Talisman, SubWallet, and other Polkadot-native wallets
- **@polkadot/extension-dapp**: Native extension integration for account management
- **@polkadot/api**: Direct connection to Moonbase Alpha parachain via WebSocket
- **EVM Compatibility**: Seamless interaction with EVM contracts through Moonbeam's unified accounts

### Supported Wallets

✅ **Polkadot.js Extension** - [Install](https://polkadot.js.org/extension/)
✅ **Talisman** - [Install](https://talisman.xyz/)
✅ **SubWallet** - [Install](https://subwallet.app/)
✅ Any Polkadot-compatible wallet with EVM support

---

## What is This?

This repository contains **reference consumer applications** demonstrating how to build apps that:

- Browse blockchain-gated content (tarot decks)
- Verify access via ERC-1155 passes
- Decrypt and display TDP-1.0 packages
- Manage user collections
- **NEW**: Connect via Polkadot wallet extensions

**Live Demo**: [https://tesserarx-demo.vercel.app](https://tesserarx-demo.vercel.app)

---

## Features

### Deck Library ([deck-library.html](./public/deck-library.html))

- 🌟 Browse 6 deployed tarot decks
- 📖 View public metadata
- 🎁 Claim free passes
- 💳 Purchase paid content
- 🔗 Connect wallet (MetaMask)

### Tarot Reader ([reader.html](./public/reader.html))

- 🔮 Full TDP-1.0 package reader
- 🎴 Display all 78 cards
- ✅ Verify on-chain access
- 🔐 Client-side decryption
- 🎲 Interactive card browsing

### Vault ([vault.html](./public/vault.html))

- 🗂️ View owned passes
- 📊 Collection management
- 🔑 Access purchased content
- 💰 Track spending

---

## Quick Start

### Local Development

```bash
# Clone repository
git clone https://github.com/jordyarms/tesserarx-demo.git
cd tesserarx-demo

# Install dependencies
npm install

# Build Polkadot SDK bundle
npm run build:lib

# Start development server
npm run dev

# Or serve the public directory directly
npx serve public

# Open in browser
open http://localhost:5173  # Vite dev server
# or
open http://localhost:3000  # Static serve
```

### Configuration

Create `.env.local` (or update `public/config.js`):

```javascript
// Contract Configuration
const CONFIG = {
  CONTRACT_ADDRESS: "0xBFF26E227Cb5fb0Feb0D18250C0a655A6066C865",
  NETWORK_RPC: "https://rpc.api.moonbase.moonbeam.network",
  CHAIN_ID: 1287,
  NETWORK_NAME: "Moonbase Alpha",

  // Content Repository (optional)
  TDP_CONTENT_BASE_URL: "https://tdp-standard.github.io/content/",
};
```

---

## Demo Applications

### 1. Deck Library

**URL**: `/deck-library.html`

**Features**:

- Browse all deployed decks
- View metadata (artist, tradition, card count)
- Check pricing and availability
- Claim free decks (one per address)
- Purchase paid decks

**Tech Stack**:

- ethers.js for blockchain interaction
- Web3Modal for wallet connection
- Vanilla JavaScript + CSS

**Code Highlights**:

```javascript
// Claim free deck
async function claimDeck(contentId) {
  const tx = await contract.claim(contentId);
  await tx.wait();
  alert("Deck claimed successfully!");
}

// Purchase deck
async function purchaseDeck(contentId, price) {
  const tx = await contract.purchase(contentId, ethers.ZeroAddress, {
    value: price,
  });
  await tx.wait();
  alert("Deck purchased!");
}
```

---

### 2. Tarot Reader

**URL**: `/reader.html`

**Features**:

- Load TDP-1.0 packages
- Verify access passes
- Decrypt content client-side
- Display all 78 cards
- Browse by suit/arcana

**Tech Stack**:

- JSZip for package extraction
- Web Crypto API for AES-256-GCM decryption
- Dynamic image loading

**Code Highlights**:

```javascript
// Load encrypted deck
async function loadDeck(contentId) {
  // 1. Verify access
  const balance = await contract.balanceOf(userAddress, contentId);
  if (balance === 0n) {
    throw new Error("No access pass");
  }

  // 2. Fetch content metadata
  const content = await contract.getContent(contentId);

  // 3. Decrypt package
  const encrypted = await fetch(resolveIPFS(content.payloadURI));
  const decrypted = await decryptAES256GCM(
    await encrypted.arrayBuffer(),
    content.encryptionKey
  );

  // 4. Extract ZIP
  const zip = await JSZip.loadAsync(decrypted);
  const manifest = JSON.parse(await zip.file("manifest.json").async("string"));

  // 5. Load images
  const images = {};
  for (const file of manifest.files.image_list) {
    images[file.filename] = await zip.file(file.path).async("base64");
  }

  return { manifest, images };
}
```

---

### 3. Vault (Collection Manager)

**URL**: `/vault.html`

**Features**:

- View all owned passes
- See deck thumbnails
- Access purchased content
- Track total spending

**Tech Stack**:

- ERC-1155 balanceOf queries
- IPFS metadata fetching
- LocalStorage for caching

---

## Architecture

### Data Flow

```
User → Connect Wallet → Browse Decks
  ↓
Claim/Purchase → Verify Transaction → Mint Pass (on-chain)
  ↓
Access Content → Verify Pass → Fetch Encrypted Package (IPFS)
  ↓
Decrypt (client-side) → Extract TDP → Display Cards
```

### Key Components

#### Wallet Integration

```javascript
// Web3Modal for wallet connection
const web3Modal = new Web3Modal({
  network: "moonbase-alpha",
  cacheProvider: true,
  providerOptions: {},
});

const provider = await web3Modal.connect();
const signer = await new ethers.BrowserProvider(provider).getSigner();
```

#### Contract Interaction

```javascript
// Connect to ContentPassFactoryV2
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

// Check ownership
const balance = await contract.balanceOf(userAddress, contentId);
```

#### IPFS Resolution

```javascript
function resolveIPFS(uri) {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}
```

#### Decryption

```javascript
async function decryptAES256GCM(encryptedData, keyHex) {
  const data = new Uint8Array(encryptedData);
  const iv = data.slice(0, 12);
  const authTag = data.slice(12, 28);
  const ciphertext = data.slice(28);

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    new Uint8Array([...ciphertext, ...authTag])
  );

  return decrypted;
}
```

---

## Deployed Content

This demo includes 6 tarot decks:

| Content ID | Deck                      | Price    | Supply    |
| ---------- | ------------------------- | -------- | --------- |
| 1          | Waite-Smith Rider (1909)  | Free     | Unlimited |
| 2          | Tarot de Marseille (1760) | Free     | Unlimited |
| 3          | Anecdotes Tarot (Legacy)  | 0.01 DEV | 100       |
| 4          | Clown Town Tarot (Legacy) | 0.02 DEV | 50        |
| 5          | Anecdotes Tarot           | Free     | Unlimited |
| 6          | Clown Town Tarot          | Free     | Unlimited |

All decks conform to [TDP-1.0 standard](https://github.com/jordyarms/tdp-standard).

---

## Development Guide

### For App Developers

This repo serves as a reference for building your own consumer apps.

**Key Learnings**:

1. **Wallet Connection** - How to integrate MetaMask/Web3
2. **Contract Interaction** - Reading content, claiming/purchasing passes
3. **Content Decryption** - Client-side AES-256-GCM implementation
4. **TDP-1.0 Parsing** - Loading and displaying tarot packages
5. **UI/UX Patterns** - Best practices for blockchain apps

### Customization

**Change Styling**:

- Edit CSS in each HTML file
- Current theme: "CyberMystic" glass-morphism

**Add Features**:

- Tarot spreads (3-card, Celtic Cross)
- Reading journal
- Card meanings database
- Social sharing
- Multiple deck support

**Integrate Your Content**:

```javascript
// Update contract address and network
const CONFIG = {
  CONTRACT_ADDRESS: "YOUR_CONTRACT_ADDRESS",
  CHAIN_ID: 1284, // Moonbeam mainnet
  // ...
};
```

---

## Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/jordyarms/tesserarx-demo)

**Steps**:

1. Connect GitHub repo to Vercel
2. Configure environment variables (if needed)
3. Deploy

**Configuration**: See [vercel.json](./vercel.json)

### Other Platforms

- **Netlify**: Drag & drop `public/` folder
- **GitHub Pages**: Enable in repo settings
- **IPFS**: Pin `public/` folder for decentralized hosting

---

## Network Configuration

### Moonbase Alpha (Testnet) - Current

```javascript
{
  chainId: '0x507', // 1287
  chainName: 'Moonbase Alpha',
  nativeCurrency: {
    name: 'DEV',
    symbol: 'DEV',
    decimals: 18
  },
  rpcUrls: ['https://rpc.api.moonbase.moonbeam.network'],
  blockExplorerUrls: ['https://moonbase.moonscan.io/']
}
```

### Moonbeam (Mainnet)

```javascript
{
  chainId: '0x504', // 1284
  chainName: 'Moonbeam',
  nativeCurrency: {
    name: 'GLMR',
    symbol: 'GLMR',
    decimals: 18
  },
  rpcUrls: ['https://rpc.api.moonbeam.network'],
  blockExplorerUrls: ['https://moonscan.io/']
}
```

---

## Browser Compatibility

| Browser     | Support    | Notes                       |
| ----------- | ---------- | --------------------------- |
| Chrome/Edge | ✅ Full    | Recommended                 |
| Firefox     | ✅ Full    | -                           |
| Safari      | ⚠️ Partial | MetaMask via extension      |
| Mobile      | ⚠️ Limited | Use MetaMask mobile browser |

**Requirements**:

- Modern browser with Web Crypto API
- Wallet extension (MetaMask, etc.)

---

## Security Considerations

### Client-Side Encryption

- Keys are fetched from blockchain (publicly visible)
- Decryption happens in browser memory
- No server-side key storage

**Implications**:

- Content is protected by access passes, not key secrecy
- Users can share decrypted content manually (like any digital file)
- Blockchain provides access control, not DRM enforcement

### Best Practices

- ✅ Always verify pass ownership before fetching keys
- ✅ Use HTTPS for all external resources
- ✅ Clear sensitive data from memory after use
- ✅ Validate TDP package structure before displaying
- ⚠️ Don't store decrypted content in localStorage

---

## Troubleshooting

### "Wrong Network" Error

**Solution**: Switch MetaMask to Moonbase Alpha

```javascript
await window.ethereum.request({
  method: "wallet_switchEthereumChain",
  params: [{ chainId: "0x507" }], // 1287
});
```

### "No Access" Error

**Solution**: Verify you own a pass

```javascript
const balance = await contract.balanceOf(userAddress, contentId);
console.log("Pass balance:", balance.toString());
```

### IPFS Loading Issues

**Solutions**:

- Use public gateways: `ipfs.io`, `dweb.link`
- Pin content on Pinata or NFT.Storage
- Enable IPFS companion browser extension

### Decryption Failed

**Causes**:

- Incorrect encryption key
- Corrupted package
- Wrong file format

**Debug**:

```javascript
console.log("Key:", content.encryptionKey);
console.log("Payload URI:", content.payloadURI);
console.log("Package size:", encryptedData.byteLength);
```

---

## Resources

### Documentation

- **[TDP-1.0 Standard](https://github.com/jordyarms/tdp-standard)** - Content package spec
- **[TDP Developer Guide](https://github.com/jordyarms/tdp-standard/blob/main/docs/DEVELOPERS.md)** - Building TDP apps
- **[Tesserarx Contracts](https://github.com/jordyarms/tesserarx-contracts)** - Smart contract docs

### Libraries

- **[ethers.js](https://docs.ethers.org/)** - Ethereum interaction
- **[JSZip](https://stuk.github.io/jszip/)** - ZIP file handling
- **[Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)** - Encryption/decryption

### Tools

- **[Moonscan](https://moonbase.moonscan.io)** - Blockchain explorer
- **[IPFS Desktop](https://docs.ipfs.tech/install/ipfs-desktop/)** - IPFS client
- **[MetaMask](https://metamask.io/)** - Wallet extension

---

## Contributing

Want to improve the demo or add features?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

**Ideas for contributions**:

- Additional tarot spreads
- Reading history/journal
- Card meanings database
- Social features
- Mobile optimization
- Accessibility improvements

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

**Note**: Tarot deck artwork may have different licenses. See individual deck metadata.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/jordyarms/tesserarx-demo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jordyarms/tesserarx-demo/discussions)
- **Live Demo**: [https://YOUR_VERCEL_URL.vercel.app](https://YOUR_VERCEL_URL.vercel.app)

---

**Experience blockchain-gated content with tarot decks • Built on Moonbeam • Powered by Tesserarx**
