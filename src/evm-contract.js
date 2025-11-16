import { ApiPromise } from '@polkadot/api';
import { hexToU8a, u8aToHex, stringToU8a, u8aConcat } from '@polkadot/util';
import { keccak256 } from '@polkadot/util-crypto';

/**
 * EVM Contract Wrapper for Polkadot SDK
 * Provides interface to interact with EVM contracts on Moonbeam via Ethereum pallet
 */
class EvmContract {
    constructor(api, address, abi, signer) {
        this.api = api;
        this.address = address.toLowerCase();
        this.abi = abi;
        this.signer = signer; // Polkadot injector
        this.methods = this.buildMethods();
    }

    /**
     * Build method objects from ABI
     */
    buildMethods() {
        const methods = {};

        this.abi.forEach(item => {
            if (item.includes('function ')) {
                const match = item.match(/function\s+(\w+)\s*\((.*?)\)/);
                if (match) {
                    const methodName = match[1];
                    const params = match[2];
                    const isView = item.includes('view') || item.includes('pure');

                    methods[methodName] = (...args) => {
                        if (isView) {
                            return this.call(methodName, params, ...args);
                        } else {
                            return this.send(methodName, params, ...args);
                        }
                    };
                }
            }
        });

        return methods;
    }

    /**
     * Encode function call data
     */
    encodeFunctionData(methodName, paramTypes, args) {
        // Create function signature
        const signature = `${methodName}(${paramTypes})`;
        const hash = keccak256(stringToU8a(signature));
        const selector = hash.slice(0, 4);

        if (args.length === 0) {
            return u8aToHex(selector);
        }

        // Simple encoding for common types
        // For production, use a proper ABI encoder
        const encodedParams = this.encodeParams(paramTypes.split(',').map(t => t.trim()), args);

        return u8aToHex(u8aConcat(selector, encodedParams));
    }

    /**
     * Simple parameter encoding
     * Note: This is a simplified version. For production, use @ethersproject/abi or similar
     */
    encodeParams(types, values) {
        const encoded = new Uint8Array(types.length * 32);
        let offset = 0;

        types.forEach((type, i) => {
            const value = values[i];

            if (type === 'address') {
                // Address: left-pad to 32 bytes
                const addr = hexToU8a(value);
                encoded.set(addr, offset + (32 - addr.length));
            } else if (type === 'uint256' || type.startsWith('uint')) {
                // Uint: convert to big-endian 32 bytes
                const num = BigInt(value);
                const bytes = new Uint8Array(32);
                for (let j = 31; j >= 0; j--) {
                    bytes[j] = Number(num & 0xFFn);
                    num >>= 8n;
                }
                encoded.set(bytes, offset);
            } else if (type === 'bool') {
                // Bool: 0 or 1 in 32 bytes
                encoded[offset + 31] = value ? 1 : 0;
            }

            offset += 32;
        });

        return encoded;
    }

    /**
     * Decode return data
     */
    decodeReturnData(types, data) {
        if (!data || data === '0x') {
            return null;
        }

        const bytes = hexToU8a(data);

        if (types.length === 1) {
            return this.decodeSingleValue(types[0], bytes);
        }

        // Multiple return values
        const results = [];
        let offset = 0;

        types.forEach(type => {
            const value = this.decodeSingleValue(type, bytes.slice(offset, offset + 32));
            results.push(value);
            offset += 32;
        });

        return results;
    }

    decodeSingleValue(type, bytes) {
        if (type === 'address') {
            return '0x' + u8aToHex(bytes.slice(-20)).slice(2);
        } else if (type === 'uint256' || type.startsWith('uint')) {
            let value = 0n;
            for (let i = 0; i < bytes.length; i++) {
                value = (value << 8n) | BigInt(bytes[i]);
            }
            return value.toString();
        } else if (type === 'bool') {
            return bytes[31] === 1;
        } else if (type === 'string') {
            // Simple string decoding
            const length = Number(this.decodeSingleValue('uint256', bytes.slice(32, 64)));
            const strBytes = bytes.slice(64, 64 + length);
            return new TextDecoder().decode(strBytes);
        }

        return u8aToHex(bytes);
    }

    /**
     * Call a view/pure function (no transaction)
     */
    async call(methodName, paramTypes, ...args) {
        const data = this.encodeFunctionData(methodName, paramTypes, args);

        try {
            // Use eth_call via Moonbeam's Ethereum compatibility
            const result = await this.api.rpc.eth.call({
                to: this.address,
                data: data
            });

            // Parse return type from ABI
            const abiItem = this.abi.find(item => item.includes(`function ${methodName}`));
            const returnMatch = abiItem.match(/returns\s*\((.*?)\)/);

            if (!returnMatch) {
                return result;
            }

            const returnTypes = returnMatch[1].split(',').map(t => t.trim().split(' ')[0]);
            return this.decodeReturnData(returnTypes, result.toString());
        } catch (error) {
            console.error(`Contract call failed (${methodName}):`, error);
            throw error;
        }
    }

    /**
     * Send a transaction (state-changing function)
     */
    async send(methodName, paramTypes, ...args) {
        const options = args[args.length - 1];
        const hasOptions = typeof options === 'object' && options !== null && !Array.isArray(options);
        const callArgs = hasOptions ? args.slice(0, -1) : args;

        const data = this.encodeFunctionData(methodName, paramTypes, callArgs);

        try {
            // Create transaction via Ethereum pallet
            const tx = this.api.tx.ethereum.transact({
                to: this.address,
                data: data,
                value: options?.value ? BigInt(options.value) : 0n,
                gasLimit: options?.gasLimit ? BigInt(options.gasLimit) : 100000n,
                maxFeePerGas: options?.maxFeePerGas ? BigInt(options.maxFeePerGas) : 1000000000n,
                maxPriorityFeePerGas: options?.maxPriorityFeePerGas ? BigInt(options.maxPriorityFeePerGas) : 1000000000n
            });

            // Sign and send
            return new Promise((resolve, reject) => {
                tx.signAndSend(
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
                                hash: tx.hash.toHex(),
                                blockHash: status.asFinalized.toHex(),
                                events: events,
                                wait: async () => ({ hash: tx.hash.toHex() })
                            });
                        }
                    }
                ).catch(reject);
            });
        } catch (error) {
            console.error(`Contract send failed (${methodName}):`, error);
            throw error;
        }
    }

    /**
     * Helper: Get balance of ERC-1155 token
     */
    async balanceOf(account, tokenId) {
        const result = await this.call('balanceOf', 'address,uint256', account, tokenId);
        return {
            toString: () => result,
            toNumber: () => Number(result)
        };
    }

    /**
     * Helper: Get content info
     */
    async getContentInfo(contentId) {
        const result = await this.call(
            'getContentInfo',
            'uint256',
            contentId
        );

        return {
            creator: result[0],
            name: result[1],
            isFree: result[2],
            price: result[3],
            referralBasisPoints: result[4],
            maxSupply: result[5],
            currentSupply: result[6]
        };
    }

    /**
     * Helper: Get active version
     */
    async getActiveVersion(contentId) {
        const result = await this.call(
            'getActiveVersion',
            'uint256',
            contentId
        );

        return {
            payloadURI: result[0],
            specificationURI: result[1],
            manifestURI: result[2],
            timestamp: result[3],
            reason: result[4],
            updatedBy: result[5]
        };
    }

    /**
     * Helper: Get content price
     */
    async contentPrice(contentId) {
        const result = await this.call('contentPrice', 'uint256', contentId);
        return result;
    }

    /**
     * Helper: Get content creators
     */
    async contentCreators(contentId) {
        const result = await this.call('contentCreators', 'uint256', contentId);
        return result;
    }

    /**
     * Helper: Claim free content
     */
    async claim(contentId) {
        return this.send('claim', 'uint256', contentId);
    }

    /**
     * Helper: Purchase content
     */
    async purchase(contentId, amount, options) {
        return this.send('purchase', 'uint256,uint256', contentId, amount, options);
    }

    /**
     * Helper: Purchase with referral
     */
    async purchaseWithReferral(contentId, amount, referrer, options) {
        return this.send('purchaseWithReferral', 'uint256,uint256,address', contentId, amount, referrer, options);
    }

    /**
     * Helper: Platform fee rate
     */
    async platformFeeRate() {
        const result = await this.call('platformFeeRate', '');
        return result;
    }

    /**
     * Helper: Referral rate
     */
    async referralRate(contentId) {
        const result = await this.call('referralRate', 'uint256', contentId);
        return result;
    }
}

export default EvmContract;
