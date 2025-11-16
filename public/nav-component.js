/**
 * Navigation Component
 * Shared navigation header for all pages
 */

/**
 * Render navigation component
 * @param {string} activePage - Current page identifier ('market', 'collection', 'reader', 'home')
 * @param {boolean} includeHome - Whether to include Home and Docs links (for home page)
 */
function renderNavigation(activePage = '', includeHome = false) {
    const nav = document.createElement('nav');
    nav.className = 'glass-nav fixed top-0 left-0 right-0 z-50';

    const homeLinks = includeHome ? `
        <a href="index.html" class="text-sm ${activePage === 'home' ? 'text-accent' : 'text-muted hover:text-accent'} transition-colors">
            Home
        </a>
        <a href="https://github.com/jordyarms/tdp-standard" target="_blank" class="text-sm text-muted hover:text-accent transition-colors">
            Docs
        </a>
    ` : '';

    nav.innerHTML = `
        <div class="max-w-7xl mx-auto px-5 py-4 flex justify-between items-center">
            <a href="index.html" class="heading text-xl hover:text-accent transition-colors">
                Tesserarx
            </a>
            <div class="flex items-center gap-6">
                ${homeLinks}
                <a href="deck-library.html" class="text-sm ${activePage === 'market' ? 'text-accent' : 'text-muted hover:text-accent'} transition-colors">
                    Market
                </a>
                <a href="vault.html" class="text-sm ${activePage === 'collection' ? 'text-accent' : 'text-muted hover:text-accent'} transition-colors">
                    Collection
                </a>
                <a href="reader.html" class="text-sm ${activePage === 'reader' ? 'text-accent' : 'text-muted hover:text-accent'} transition-colors">
                    Reader
                </a>
                <div id="walletStatus"></div>
            </div>
        </div>
    `;

    // Insert at the beginning of body
    document.body.insertBefore(nav, document.body.firstChild);
}

/**
 * Auto-detect current page and render navigation
 */
window.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    let activePage = '';
    let includeHome = false;

    // Determine active page from URL
    if (path.includes('deck-library')) {
        activePage = 'market';
    } else if (path.includes('vault')) {
        activePage = 'collection';
    } else if (path.includes('reader')) {
        activePage = 'reader';
    } else if (path.includes('index') || path.endsWith('/')) {
        activePage = 'home';
        includeHome = true;
    }

    renderNavigation(activePage, includeHome);
});
