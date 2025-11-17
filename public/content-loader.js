/**
 * Content Loader - Dynamic on-chain content retrieval
 * Fetches deck metadata from blockchain contract and manifest URIs
 */

// Known content IDs - Active decks only (excluding legacy decks 3, 4)
const KNOWN_CONTENT_IDS = [1, 2, 5, 6];

// Cache configuration
const CACHE_KEY_PREFIX = 'tesserarx_deck_cache';
const CACHE_TTL = 3600000; // 1 hour

/**
 * Get cache key for a specific wallet address
 * Returns a wallet-specific cache key or global key if no address provided
 */
function getCacheKey(walletAddress = null) {
    if (walletAddress) {
        // Normalize address to lowercase for consistency
        return `${CACHE_KEY_PREFIX}_${walletAddress.toLowerCase()}`;
    }
    return CACHE_KEY_PREFIX;
}

/**
 * Resolve URI (IPFS or HTTP)
 */
function resolveURI(uri) {
    if (!uri) return '';
    if (uri.startsWith('ipfs://')) {
        return `https://ipfs.io/ipfs/${uri.slice(7)}`;
    }
    return uri;
}

/**
 * Fetch manifest JSON from URI
 */
async function fetchManifest(uri) {
    try {
        const response = await fetch(resolveURI(uri));
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.warn('Failed to fetch manifest:', uri, error);
        return null;
    }
}

/**
 * Get attribute value from manifest
 */
function getAttribute(manifest, traitType) {
    if (!manifest || !manifest.attributes) return '';
    const attr = manifest.attributes.find(a => a.trait_type === traitType);
    return attr?.value || '';
}

/**
 * Check if deck is legacy edition
 */
function isLegacy(manifest) {
    return getAttribute(manifest, 'Edition') === 'Legacy';
}

/**
 * Parse manifest + contract data into unified deck object
 */
function parseDeckData(contentId, contractInfo, manifest) {
    const { ethers } = window;
    const price = ethers.BigNumber.from(contractInfo.price || 0);
    const maxSupply = typeof contractInfo.maxSupply === 'number'
        ? contractInfo.maxSupply
        : contractInfo.maxSupply.toNumber();
    // V2.1 uses currentSupply instead of totalMinted
    const totalMinted = contractInfo.currentSupply !== undefined
        ? (typeof contractInfo.currentSupply === 'number' ? contractInfo.currentSupply : contractInfo.currentSupply.toNumber())
        : (contractInfo.totalMinted !== undefined
            ? (typeof contractInfo.totalMinted === 'number' ? contractInfo.totalMinted : contractInfo.totalMinted.toNumber())
            : 0);

    return {
        contentId,
        name: contractInfo.name,
        description: manifest?.description || '',
        image: manifest?.image || '',
        year: getAttribute(manifest, 'Year'),
        creator: getAttribute(manifest, 'Creator'),
        tradition: getAttribute(manifest, 'Tradition'),
        license: getAttribute(manifest, 'License'),
        maxSupply,
        totalMinted,
        price: ethers.utils.formatEther(price),
        priceWei: price,
        free: contractInfo.isFree !== undefined ? contractInfo.isFree : price.isZero(),
        legacy: isLegacy(manifest),
        external_url: manifest?.external_url || ''
    };
}

/**
 * Load single deck from contract + manifest
 */
async function loadDeck(contract, contentId) {
    try {
        console.log(`📥 Loading deck ${contentId}...`);

        // Fetch contract data
        // Contract returns: creator, name, maxSupply, totalMinted, activeVersionIndex, price
        const info = await contract.getContentInfo(contentId);
        console.log(`✓ Got info for deck ${contentId}:`, {
            name: info.name,
            creator: info.creator.slice(0, 8) + '...',
            maxSupply: info.maxSupply.toString(),
            totalMinted: info.totalMinted.toString(),
            price: window.ethers.utils.formatEther(info.price) + ' DEV'
        });

        const version = await contract.getActiveVersion(contentId);
        console.log(`✓ Got version for deck ${contentId}, manifestURI:`, version.manifestURI);

        // Fetch manifest (with fallback to local metadata)
        let manifest;

        // Map content IDs to local metadata files
        const metadataMap = {
            1: 'metadata/deck-1-manifest.json', // Waite-Smith Rider
            2: 'metadata/deck-2-manifest.json', // Tarot de Marseille
            5: 'metadata/deck-5-manifest.json', // Anecdotes Tarot
            6: 'metadata/deck-6-manifest.json'  // Clown Town Tarot
        };

        if (!version.manifestURI || version.manifestURI === '' || version.manifestURI === '0x') {
            // Fallback: load from local metadata folder
            const fallbackURI = metadataMap[contentId];
            if (fallbackURI) {
                console.log(`No on-chain manifestURI for content ${contentId}, using fallback: ${fallbackURI}`);
                manifest = await fetchManifest(fallbackURI);
            } else {
                console.warn(`No fallback metadata for content ${contentId}`);
            }
        } else {
            manifest = await fetchManifest(version.manifestURI);
            // If IPFS/remote fetch fails, try fallback
            if (!manifest && metadataMap[contentId]) {
                console.log(`Remote manifest failed for ${contentId}, trying local fallback`);
                manifest = await fetchManifest(metadataMap[contentId]);
            }
        }

        // Parse combined data
        // Contract fields: creator, name, maxSupply, totalMinted, activeVersionIndex, price
        const deck = parseDeckData(contentId, {
            name: info.name,
            creator: info.creator,
            isFree: info.price.isZero(), // Check if price is 0
            price: info.price,
            maxSupply: info.maxSupply,
            currentSupply: info.totalMinted // Contract calls it totalMinted
        }, manifest);

        console.log(`✓ Deck ${contentId} loaded:`, deck.name);
        return deck;
    } catch (error) {
        console.error(`❌ Failed to load deck ${contentId}:`, error);
        return null;
    }
}

/**
 * Load all known decks
 * @param {object} contract - The contract instance
 * @param {boolean} useCache - Whether to use cached data
 * @param {string} walletAddress - Optional wallet address for cache scoping
 */
async function loadAllDecks(contract, useCache = true, walletAddress = null) {
    const cacheKey = getCacheKey(walletAddress);

    // Check cache
    if (useCache) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < CACHE_TTL) {
                    console.log(`📦 Using cached deck data${walletAddress ? ' for wallet ' + walletAddress.slice(0, 6) + '...' : ''} (${data.decks.length} decks)`);
                    return data.decks;
                } else {
                    console.log('⏰ Cache expired, reloading from contract');
                }
            } catch (error) {
                console.warn('❌ Cache parse error:', error);
            }
        } else {
            console.log('📭 No cache found, loading from contract');
        }
    }

    // Load from contract
    console.log(`🔄 Loading ${KNOWN_CONTENT_IDS.length} decks from contract:`, KNOWN_CONTENT_IDS);
    const decks = [];

    for (const id of KNOWN_CONTENT_IDS) {
        const deck = await loadDeck(contract, id);
        if (deck) {
            decks.push(deck);
        }
    }

    console.log(`✅ Loaded ${decks.length} decks successfully`);

    // Update cache
    if (useCache) {
        try {
            localStorage.setItem(cacheKey, JSON.stringify({
                decks,
                timestamp: Date.now(),
                walletAddress: walletAddress || 'global'
            }));
            console.log(`💾 Cached ${decks.length} decks for future use`);
        } catch (error) {
            console.warn('❌ Cache write error:', error);
        }
    }

    return decks;
}

/**
 * Clear deck cache
 * @param {string} walletAddress - Optional wallet address to clear specific cache, or clears all if not provided
 */
function clearDeckCache(walletAddress = null) {
    if (walletAddress) {
        // Clear cache for specific wallet
        const cacheKey = getCacheKey(walletAddress);
        localStorage.removeItem(cacheKey);
    } else {
        // Clear all deck caches (both global and wallet-specific)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_KEY_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
}

/**
 * Load owned decks for a user
 * @param {object} contract - The contract instance
 * @param {string} userAddress - The user's wallet address
 * @param {boolean} useCache - Whether to use cached data
 */
async function loadOwnedDecks(contract, userAddress, useCache = true) {
    // Use wallet-specific cache
    const allDecks = await loadAllDecks(contract, useCache, userAddress);
    const owned = [];

    for (const deck of allDecks) {
        try {
            const balance = await contract.balanceOf(userAddress, deck.contentId);
            if (balance.gt(0)) {
                owned.push({
                    ...deck,
                    balance: balance.toNumber()
                });
            }
        } catch (error) {
            console.warn(`Failed to check balance for deck ${deck.contentId}:`, error);
        }
    }

    return owned;
}

/**
 * Get deck by content ID
 */
async function getDeckById(contract, contentId) {
    return await loadDeck(contract, contentId);
}

// Export functions for use in HTML files
if (typeof window !== 'undefined') {
    window.ContentLoader = {
        loadAllDecks,
        loadOwnedDecks,
        getDeckById,
        loadDeck,
        clearDeckCache,
        resolveURI,
        fetchManifest,
        KNOWN_CONTENT_IDS
    };
}
