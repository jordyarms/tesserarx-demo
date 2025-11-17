import { web3Accounts, web3Enable, web3FromAddress } from '@polkadot/extension-dapp';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { decodeAddress } from '@polkadot/util-crypto';
import { u8aToHex } from '@polkadot/util';

const STORAGE_KEY = 'tesserarx_wallet_connected';
const CONTRACT_ADDRESS = "0xBFF26E227Cb5fb0Feb0D18250C0a655A6066C865"; // V2.1
const MOONBASE_ALPHA_RPC = 'https://rpc.api.moonbase.moonbeam.network';
const MOONBASE_ALPHA_WS = 'wss://wss.api.moonbase.moonbeam.network';
const APP_NAME = 'Tesserarx';

/**
 * Unified Wallet Manager using Polkadot SDK
 * Connects to Polkadot wallet extensions and provides EVM compatibility
 */
class WalletManager {
    constructor() {
        this.api = null;
        this.selectedAccount = null;
        this.injector = null;
        this.evmAddress = null;
        this.provider = null; // Will use for Web3/ethers compatibility
        this.init();
    }

    async init() {
        // Check for persisted connection
        const wasConnected = localStorage.getItem(STORAGE_KEY) === 'true';

        if (wasConnected) {
            await this.autoConnect();
        }

        this.renderWalletStatus();
    }

    async autoConnect() {
        try {
            // Enable extensions
            const extensions = await web3Enable(APP_NAME);

            if (extensions.length === 0) {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }

            // Get accounts
            const accounts = await web3Accounts();

            if (accounts.length > 0) {
                // Connect to chain
                await this.connectToChain();

                // Select first account
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
        try {
            // Enable web3 extensions
            const extensions = await web3Enable(APP_NAME);

            if (extensions.length === 0) {
                const installLinks = [
                    '• Polkadot.js: https://polkadot.js.org/extension/',
                    '• Talisman: https://talisman.xyz/',
                    '• SubWallet: https://subwallet.app/'
                ].join('\n');

                alert(`No Polkadot wallet extension detected.\n\nPlease install one of these wallets:\n\n${installLinks}`);
                return false;
            }

            // Get all accounts
            const accounts = await web3Accounts();

            if (accounts.length === 0) {
                alert('No accounts found in your wallet.\n\nPlease create or import an account in your Polkadot wallet extension.');
                return false;
            }

            // Connect to Moonbase Alpha
            await this.connectToChain();

            // Setup provider with first account
            await this.setupProvider(accounts[0]);

            localStorage.setItem(STORAGE_KEY, 'true');
            this.renderWalletStatus();

            return true;
        } catch (error) {
            console.error('Connection error:', error);
            alert('Failed to connect wallet: ' + error.message);
            return false;
        }
    }

    async connectToChain() {
        if (this.api) return this.api;

        try {
            const provider = new WsProvider(MOONBASE_ALPHA_WS);
            this.api = await ApiPromise.create({ provider });

            await this.api.isReady;

            const chain = await this.api.rpc.system.chain();
            const version = await this.api.rpc.system.version();

            console.log(`✅ Connected to ${chain} (v${version})`);

            return this.api;
        } catch (error) {
            console.error('Failed to connect to Moonbase Alpha:', error);
            throw new Error('Could not connect to Moonbase Alpha network');
        }
    }

    async setupProvider(account) {
        this.selectedAccount = account;

        // Get injector for signing
        this.injector = await web3FromAddress(account.address);

        // Convert Substrate address to EVM address
        this.evmAddress = this.substrateToEvm(account.address);

        console.log('📱 Wallet connected:');
        console.log('   Account:', account.meta.name || 'Unnamed');
        console.log('   Substrate:', account.address);
        console.log('   EVM:', this.evmAddress);

        this.renderWalletStatus();
    }

    /**
     * Convert Substrate address to EVM address for Moonbeam
     * Takes the first 20 bytes of the decoded public key
     */
    substrateToEvm(substrateAddress) {
        try {
            const publicKey = decodeAddress(substrateAddress);
            const evmBytes = publicKey.slice(0, 20);
            return u8aToHex(evmBytes);
        } catch (error) {
            console.error('Address conversion failed:', error);
            return null;
        }
    }

    disconnect() {
        this.selectedAccount = null;
        this.injector = null;
        this.evmAddress = null;
        localStorage.removeItem(STORAGE_KEY);
        // Clear deck cache to prevent crossover between wallets
        if (typeof window !== 'undefined' && window.ContentLoader) {
            window.ContentLoader.clearDeckCache();
        }
        this.renderWalletStatus();
    }

    renderWalletStatus() {
        const statusDiv = document.getElementById('walletStatus');
        if (!statusDiv) return;

        if (this.selectedAccount) {
            const displayName = this.selectedAccount.meta.name || 'Account';
            const shortAddr = `${this.selectedAccount.address.slice(0, 6)}...${this.selectedAccount.address.slice(-4)}`;

            statusDiv.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="text-sm font-mono text-accent">
                        ${displayName} (${shortAddr})
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

    /**
     * Get Web3 provider for ethers.js compatibility
     * Uses Moonbeam's JSON-RPC endpoint
     */
    async getWeb3Provider() {
        // For ethers.js, we'll use JsonRpcProvider with Moonbeam RPC
        // The actual signing will need to be done through the Polkadot extension
        const { ethers } = window;
        if (!ethers) {
            throw new Error('ethers.js not loaded');
        }

        if (!this.provider) {
            this.provider = new ethers.providers.JsonRpcProvider(MOONBASE_ALPHA_RPC);
        }

        return this.provider;
    }

    /**
     * Get a signer for EVM transactions
     * Checks for Ethereum provider injection from Polkadot wallets (Talisman, SubWallet)
     */
    async getSigner() {
        console.log('🔄 getSigner called, isConnected:', this.isConnected());

        if (!this.isConnected()) {
            throw new Error('Wallet not connected');
        }

        // Check if wallet injected an Ethereum provider (Talisman, SubWallet do this)
        if (window.ethereum) {
            console.log('✓ window.ethereum detected, attempting to use Web3Provider');
            const { ethers } = window;

            try {
                // First check if we can get accounts from the ethereum provider
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                console.log('📝 Accounts from window.ethereum:', accounts);

                if (accounts && accounts.length > 0) {
                    const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
                    console.log('✓ Web3Provider created, getting signer...');
                    const signer = await web3Provider.getSigner(accounts[0]);
                    console.log('✓ Signer obtained from window.ethereum for:', accounts[0]);
                    return signer;
                } else {
                    console.log('⚠ No accounts available from window.ethereum, using custom signer');
                }
            } catch (error) {
                console.warn('⚠ Failed to get signer from window.ethereum:', error.message);
            }
        }

        // Fallback: use custom signer (limited functionality)
        console.log('⚠ Using custom PolkadotEVMSigner');
        const provider = await this.getWeb3Provider();
        return createPolkadotEVMSigner(this, provider);
    }

    /**
     * Get contract instance with ABI
     */
    async getContract(abi) {
        if (!this.isConnected()) {
            return null;
        }

        const { ethers } = window;
        if (!ethers) {
            throw new Error('ethers.js not loaded');
        }

        // Try to get a signer for write operations
        try {
            const signer = await this.getSigner();
            console.log('✓ Contract created with signer (read/write)');
            return new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        } catch (error) {
            // Fallback to provider for read-only
            console.warn('⚠ Could not get signer, contract will be read-only:', error.message);
            const provider = await this.getWeb3Provider();
            console.log('✓ Contract created with provider (read-only)');
            return new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
        }
    }

    getEvmAddress() {
        return this.evmAddress;
    }

    getSubstrateAddress() {
        return this.selectedAccount?.address;
    }

    getAccount() {
        return this.selectedAccount;
    }

    getApi() {
        return this.api;
    }
}

/**
 * Custom Signer that bridges Polkadot extension with ethers.js
 * Factory function to avoid issues with window.ethers not being loaded yet
 */
function createPolkadotEVMSigner(walletManager, provider) {
    const { ethers } = window;
    if (!ethers) {
        throw new Error('ethers.js not loaded');
    }

    class PolkadotEVMSigner extends ethers.Signer {
        constructor() {
            super();
            this.walletManager = walletManager;
            this._provider = provider;
        }

        // Ethers.js needs this getter to access the provider for read operations
        get provider() {
            return this._provider;
        }

        async getAddress() {
            return this.walletManager.getEvmAddress();
        }

    async signMessage(message) {
        // Sign message using Polkadot extension
        const { u8aToHex, stringToU8a } = await import('@polkadot/util');
        const messageU8a = typeof message === 'string' ? stringToU8a(message) : message;

        const signature = await this.walletManager.injector.signer.signRaw({
            address: this.walletManager.getSubstrateAddress(),
            data: u8aToHex(messageU8a),
            type: 'bytes'
        });

        return signature.signature;
    }

    async signTransaction(transaction) {
        // Use Polkadot extension to sign and submit EVM transaction via Moonbeam's ethereum pallet
        const api = this.walletManager.getApi();
        if (!api) {
            throw new Error('Not connected to Moonbeam');
        }

        try {
            console.log('🔄 Signing transaction via Polkadot extension:', transaction);

            // Manually populate transaction fields using provider methods
            const populatedTx = { ...transaction };

            // Get address
            const from = await this.getAddress();
            populatedTx.from = from;

            // Get nonce if not provided
            if (populatedTx.nonce === undefined) {
                populatedTx.nonce = await this._provider.getTransactionCount(from, 'pending');
                console.log('📝 Nonce:', populatedTx.nonce);
            }

            // Get chain ID if not provided
            if (populatedTx.chainId === undefined) {
                const network = await this._provider.getNetwork();
                populatedTx.chainId = network.chainId;
                console.log('📝 Chain ID:', populatedTx.chainId);
            }

            // Get gas limit if not provided (should be provided by our manual setting)
            if (populatedTx.gasLimit === undefined) {
                populatedTx.gasLimit = 300000; // Default fallback
                console.log('⚠ Using default gas limit:', populatedTx.gasLimit);
            }

            // Get fee data if not provided
            if (populatedTx.maxFeePerGas === undefined || populatedTx.maxPriorityFeePerGas === undefined) {
                const feeData = await this._provider.getFeeData();
                populatedTx.maxFeePerGas = populatedTx.maxFeePerGas || feeData.maxFeePerGas;
                populatedTx.maxPriorityFeePerGas = populatedTx.maxPriorityFeePerGas || feeData.maxPriorityFeePerGas;
                console.log('📝 Fee data:', {
                    maxFeePerGas: populatedTx.maxFeePerGas?.toString(),
                    maxPriorityFeePerGas: populatedTx.maxPriorityFeePerGas?.toString()
                });
            }

            // Get transaction parameters
            const to = populatedTx.to || null;
            const value = populatedTx.value ? populatedTx.value.toHexString() : '0x0';
            const gasLimit = typeof populatedTx.gasLimit === 'number'
                ? populatedTx.gasLimit
                : populatedTx.gasLimit.toNumber();
            const data = populatedTx.data || '0x';

            console.log('📝 Transaction params:', { to, value, gasLimit, data: data.slice(0, 20) + '...' });

            // Build ethereum.transact extrinsic for EVM transaction
            // Moonbase Alpha now requires EIP-1559 format (not V2)
            const evmTx = api.tx.ethereum.transact({
                eip1559: {
                    chainId: populatedTx.chainId,
                    nonce: populatedTx.nonce,
                    maxPriorityFeePerGas: populatedTx.maxPriorityFeePerGas.toHexString(),
                    maxFeePerGas: populatedTx.maxFeePerGas.toHexString(),
                    gasLimit: gasLimit,
                    action: to ? { Call: to } : 'Create',
                    value: value,
                    input: data,
                    accessList: []
                }
            });

            console.log('📝 Built EIP-1559 Polkadot extrinsic, submitting...');

            // Sign and send using Polkadot extension
            return new Promise((resolve, reject) => {
                evmTx.signAndSend(
                    this.walletManager.getSubstrateAddress(),
                    { signer: this.walletManager.injector.signer },
                    ({ status, events, dispatchError }) => {
                        if (dispatchError) {
                            if (dispatchError.isModule) {
                                const decoded = api.registry.findMetaError(dispatchError.asModule);
                                reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs}`));
                            } else {
                                reject(new Error(dispatchError.toString()));
                            }
                        } else if (status.isInBlock || status.isFinalized) {
                            console.log('✅ Transaction in block:', status.asInBlock?.toHex() || status.asFinalized?.toHex());

                            // Find the ethereum execution event to get tx hash
                            const executedEvent = events.find(({ event }) =>
                                event.section === 'ethereum' && event.method === 'Executed'
                            );

                            if (executedEvent) {
                                const [from, to, txHash] = executedEvent.event.data;
                                console.log('✅ EVM transaction hash:', txHash.toHex());
                                resolve({
                                    hash: txHash.toHex(),
                                    wait: () => Promise.resolve({ status: 1 })
                                });
                            } else {
                                // Fallback - return block hash as tx hash
                                const blockHash = status.asInBlock?.toHex() || status.asFinalized?.toHex();
                                console.log('⚠ No Executed event, using block hash:', blockHash);
                                resolve({
                                    hash: blockHash,
                                    wait: () => Promise.resolve({ status: 1 })
                                });
                            }
                        }
                    }
                ).catch(reject);
            });
        } catch (error) {
            console.error('❌ Transaction signing failed:', error);
            throw new Error(`Failed to sign transaction: ${error.message}`);
        }
    }

        connect(provider) {
            return createPolkadotEVMSigner(this.walletManager, provider);
        }
    }

    return new PolkadotEVMSigner();
}

export default WalletManager;
export { CONTRACT_ADDRESS, MOONBASE_ALPHA_RPC, MOONBASE_ALPHA_WS };
