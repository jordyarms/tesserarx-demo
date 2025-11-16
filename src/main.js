import WalletManager, { CONTRACT_ADDRESS } from './wallet-manager.js';

// Initialize wallet manager and expose globally
const walletManager = new WalletManager();

// Make available globally for HTML onclick handlers
window.walletManager = walletManager;
window.CONTRACT_ADDRESS = CONTRACT_ADDRESS;

// Network configuration for reference
window.MOONBASE_ALPHA = {
    chainId: '0x507', // 1287 in decimal
    chainName: 'Moonbase Alpha',
    nativeCurrency: { name: 'DEV', symbol: 'DEV', decimals: 18 },
    rpcUrls: ['https://rpc.api.moonbase.moonbeam.network'],
    blockExplorerUrls: ['https://moonbase.moonscan.io/'],
    wsUrl: 'wss://wss.api.moonbase.moonbeam.network'
};

console.log('🚀 Tesserarx initialized with Polkadot SDK');
console.log('📡 Network: Moonbase Alpha');
console.log('📄 Contract:', CONTRACT_ADDRESS);

export { walletManager, CONTRACT_ADDRESS };
