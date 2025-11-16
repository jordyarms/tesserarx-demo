/**
 * Content Loader - Dynamic on-chain content retrieval
 * Fetches deck metadata from blockchain contract and manifest URIs
 */

// Known content IDs (can be expanded or made dynamic via event scanning)
const KNOWN_CONTENT_IDS = [1, 2, 3, 4, 5, 6];

// Cache configuration
const CACHE_KEY = 'tesserarx_deck_cache';
const CACHE_TTL = 3600000; // 1 hour

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
    const price = ethers.BigNumber.from(contractInfo.price || 0);
    const maxSupply = typeof contractInfo.maxSupply === 'number'
        ? contractInfo.maxSupply
        : contractInfo.maxSupply.toNumber();
    const totalMinted = typeof contractInfo.totalMinted === 'number'
        ? contractInfo.totalMinted
        : contractInfo.totalMinted.toNumber();

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
        free: price.isZero(),
        legacy: isLegacy(manifest),
        external_url: manifest?.external_url || ''
    };
}

/**
 * Load single deck from contract + manifest
 */
async function loadDeck(contract, contentId) {
    try {
        // Fetch contract data
        const info = await contract.getContentInfo(contentId);
        const version = await contract.getActiveVersion(contentId);

        // Fetch manifest (with fallback to local metadata)
        let manifest;
        if (!version.manifestURI || version.manifestURI === '' || version.manifestURI === '0x') {
            // Fallback: load from local metadata folder
            const fallbackURI = `metadata/deck-${contentId}-manifest.json`;
            console.log(`No on-chain manifestURI for content ${contentId}, using fallback: ${fallbackURI}`);
            manifest = await fetchManifest(fallbackURI);
        } else {
            manifest = await fetchManifest(version.manifestURI);
        }

        // Parse combined data
        return parseDeckData(contentId, {
            name: info.name,
            maxSupply: info.maxSupply,
            totalMinted: info.totalMinted,
            price: info.price
        }, manifest);
    } catch (error) {
        console.warn(`Failed to load deck ${contentId}:`, error);
        return null;
    }
}

/**
 * Load all known decks
 */
async function loadAllDecks(contract, useCache = true) {
    // Check cache
    if (useCache) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < CACHE_TTL) {
                    console.log('Using cached deck data');
                    return data.decks;
                }
            } catch (error) {
                console.warn('Cache parse error:', error);
            }
        }
    }

    // Load from contract
    console.log('Loading decks from contract...');
    const decks = [];

    for (const id of KNOWN_CONTENT_IDS) {
        const deck = await loadDeck(contract, id);
        if (deck) {
            decks.push(deck);
        }
    }

    // Update cache
    if (useCache) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                decks,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('Cache write error:', error);
        }
    }

    return decks;
}

/**
 * Clear deck cache
 */
function clearDeckCache() {
    localStorage.removeItem(CACHE_KEY);
}

/**
 * Load owned decks for a user
 */
async function loadOwnedDecks(contract, userAddress) {
    const allDecks = await loadAllDecks(contract);
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
