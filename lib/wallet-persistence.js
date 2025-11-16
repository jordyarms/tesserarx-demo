// Wallet Persistence & Shared Navigation Logic
// Handles wallet connection state across all pages

const STORAGE_KEY = 'cpf_wallet_connected';
const CONTRACT_ADDRESS = "0x76d3ceB6cD517331C78670fF7C00D213f0292ADd";
const MOONBASE_ALPHA = {
    chainId: '0x507',
    chainName: 'Moonbase Alpha',
    nativeCurrency: { name: 'DEV', symbol: 'DEV', decimals: 18 },
    rpcUrls: ['https://rpc.api.moonbase.moonbeam.network'],
    blockExplorerUrls: ['https://moonbase.moonscan.io/']
};

class WalletManager {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.userAddress = null;
        this.init();
    }

    init() {
        // Check for persisted connection
        const wasConnected = localStorage.getItem(STORAGE_KEY) === 'true';

        if (wasConnected && window.ethereum) {
            this.autoConnect();
        }

        // Listen for account changes
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.disconnect();
                } else {
                    this.handleAccountChange(accounts[0]);
                }
            });

            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
        }

        // Render initial state
        this.renderWalletStatus();
    }

    async autoConnect() {
        try {
            const accounts = await window.ethereum.request({
                method: 'eth_accounts'
            });

            if (accounts.length > 0) {
                await this.setupProvider(accounts[0]);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (error) {
            console.error('Auto-connect failed:', error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    async connect() {
        if (!window.ethereum) {
            alert('MetaMask not detected. Please install MetaMask to continue.');
            return false;
        }

        try {
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            // Switch to Moonbase Alpha
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: MOONBASE_ALPHA.chainId }]
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [MOONBASE_ALPHA]
                    });
                } else {
                    throw switchError;
                }
            }

            await this.setupProvider(accounts[0]);
            localStorage.setItem(STORAGE_KEY, 'true');
            return true;
        } catch (error) {
            console.error('Connection error:', error);
            alert('Failed to connect wallet: ' + error.message);
            return false;
        }
    }

    async setupProvider(address) {
        this.userAddress = address;
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        this.signer = this.provider.getSigner();
        this.renderWalletStatus();
    }

    disconnect() {
        this.provider = null;
        this.signer = null;
        this.userAddress = null;
        localStorage.removeItem(STORAGE_KEY);
        this.renderWalletStatus();
    }

    handleAccountChange(newAddress) {
        this.userAddress = newAddress;
        this.renderWalletStatus();
        // Reload page to refresh any account-specific data
        setTimeout(() => window.location.reload(), 500);
    }

    renderWalletStatus() {
        const statusDiv = document.getElementById('walletStatus');
        if (!statusDiv) return;

        if (this.userAddress) {
            statusDiv.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="text-sm font-mono text-accent">
                        ${this.userAddress.slice(0, 6)}...${this.userAddress.slice(-4)}
                    </div>
                    <button
                        onclick="walletManager.disconnect()"
                        class="text-xs text-muted hover:text-accent transition-colors"
                    >
                        Disconnect
                    </button>
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <button
                    onclick="walletManager.connect()"
                    class="btn text-xs px-4 py-2"
                >
                    Connect Wallet
                </button>
            `;
        }
    }

    isConnected() {
        return this.userAddress !== null;
    }

    getContract(abi) {
        if (!this.signer) return null;
        return new ethers.Contract(CONTRACT_ADDRESS, abi, this.signer);
    }
}

// Global instance
const walletManager = new WalletManager();

// Export for use in other scripts
window.walletManager = walletManager;
window.CONTRACT_ADDRESS = CONTRACT_ADDRESS;
window.MOONBASE_ALPHA = MOONBASE_ALPHA;
