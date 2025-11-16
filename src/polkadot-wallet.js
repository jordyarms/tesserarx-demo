import { web3Accounts, web3Enable, web3FromAddress } from '@polkadot/extension-dapp';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';

const STORAGE_KEY = 'tesserarx_wallet_connected';
const MOONBASE_ALPHA_WS = 'wss://wss.api.moonbase.moonbeam.network';
const APP_NAME = 'Tesserarx';

/**
 * Polkadot Wallet Manager
 * Handles wallet connection via Polkadot extension (Polkadot.js, Talisman, SubWallet, etc.)
 * and provides access to Moonbase Alpha network
 */
class PolkadotWalletManager {
    constructor() {
        this.api = null;
        this.accounts = [];
        this.selectedAccount = null;
        this.injector = null;
        this.evmAddress = null; // EVM address derived from substrate account
        this.init();
    }

    async init() {
        // Check for persisted connection
        const wasConnected = localStorage.getItem(STORAGE_KEY) === 'true';

        if (wasConnected) {
            await this.autoConnect();
        }

        // Listen for extension events
        window.addEventListener('resize', () => {
            // Extension changed, might need to re-check accounts
        });

        this.renderWalletStatus();
    }

    async autoConnect() {
        try {
            // Initialize API connection
            await this.connectToChain();

            // Enable extensions
            const extensions = await web3Enable(APP_NAME);

            if (extensions.length === 0) {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }

            // Get accounts
            const accounts = await web3Accounts();

            if (accounts.length > 0) {
                await this.selectAccount(accounts[0]);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (error) {
            console.error('Auto-connect failed:', error);
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    async connectToChain() {
        if (this.api) return this.api;

        try {
            const provider = new WsProvider(MOONBASE_ALPHA_WS);
            this.api = await ApiPromise.create({ provider });

            console.log('Connected to Moonbase Alpha');
            console.log('Chain:', (await this.api.rpc.system.chain()).toString());
            console.log('Node version:', (await this.api.rpc.system.version()).toString());

            return this.api;
        } catch (error) {
            console.error('Failed to connect to chain:', error);
            throw error;
        }
    }

    async connect() {
        try {
            // Connect to chain first
            await this.connectToChain();

            // Enable web3 extensions
            const extensions = await web3Enable(APP_NAME);

            if (extensions.length === 0) {
                alert('No Polkadot wallet extension detected.\n\nPlease install:\n• Polkadot.js extension\n• Talisman\n• SubWallet\n• or other compatible wallet');
                return false;
            }

            // Get all accounts
            const accounts = await web3Accounts();

            if (accounts.length === 0) {
                alert('No accounts found. Please create an account in your Polkadot wallet extension.');
                return false;
            }

            // For now, use the first account
            // TODO: Add account selector UI
            await this.selectAccount(accounts[0]);

            localStorage.setItem(STORAGE_KEY, 'true');
            this.renderWalletStatus();

            return true;
        } catch (error) {
            console.error('Connection error:', error);
            alert('Failed to connect wallet: ' + error.message);
            return false;
        }
    }

    async selectAccount(account) {
        this.selectedAccount = account;
        this.accounts = await web3Accounts();

        // Get injector for signing transactions
        this.injector = await web3FromAddress(account.address);

        // Convert Substrate address to EVM address
        this.evmAddress = this.substrateToEvm(account.address);

        console.log('Selected account:', account.meta.name || account.address);
        console.log('Substrate address:', account.address);
        console.log('EVM address:', this.evmAddress);
    }

    /**
     * Convert Substrate address to EVM address
     * For Moonbeam, the EVM address is derived from the first 20 bytes of the public key
     */
    substrateToEvm(substrateAddress) {
        try {
            // Decode substrate address to public key
            const publicKey = decodeAddress(substrateAddress);

            // Take first 20 bytes and convert to hex (EVM address format)
            const evmAddressBytes = publicKey.slice(0, 20);
            const evmAddress = u8aToHex(evmAddressBytes);

            return evmAddress;
        } catch (error) {
            console.error('Failed to convert address:', error);
            return null;
        }
    }

    disconnect() {
        this.selectedAccount = null;
        this.evmAddress = null;
        this.injector = null;
        localStorage.removeItem(STORAGE_KEY);
        this.renderWalletStatus();
    }

    renderWalletStatus() {
        const statusDiv = document.getElementById('walletStatus');
        if (!statusDiv) return;

        if (this.selectedAccount) {
            const displayName = this.selectedAccount.meta.name || this.selectedAccount.address;
            const shortAddr = `${this.selectedAccount.address.slice(0, 6)}...${this.selectedAccount.address.slice(-4)}`;

            statusDiv.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="text-sm font-mono text-accent">
                        ${displayName !== this.selectedAccount.address ? displayName + ' (' + shortAddr + ')' : shortAddr}
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
        return this.selectedAccount !== null && this.api !== null;
    }

    getApi() {
        return this.api;
    }

    getAccount() {
        return this.selectedAccount;
    }

    getEvmAddress() {
        return this.evmAddress;
    }

    getSubstrateAddress() {
        return this.selectedAccount?.address;
    }

    getInjector() {
        return this.injector;
    }
}

export default PolkadotWalletManager;
