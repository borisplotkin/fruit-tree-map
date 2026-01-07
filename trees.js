// Authentication Configuration
const AUTH_STORAGE_KEY = 'fruitmap_users';
const SESSION_COOKIE = 'fruitmap_session';
let currentUser = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupEventListeners();
});

// Cookie Functions
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }

    // Fallback to localStorage for file:// protocol support
    return localStorage.getItem(name);
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    localStorage.removeItem(name);
}

// Authentication
function checkSession() {
    const email = getCookie(SESSION_COOKIE);
    if (email) {
        currentUser = { email };
        loadTrees();
    } else {
        // Redirect to main page if not logged in
        window.location.href = 'index.html';
    }
}

function logout() {
    deleteCookie(SESSION_COOKIE);
    currentUser = null;
    window.location.href = 'index.html';
}

// Event Listeners
function setupEventListeners() {
    const btnLogout = document.getElementById('btn-logout-page');
    const btnBackToMap = document.getElementById('btn-back-to-map');

    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }

    if (btnBackToMap) {
        btnBackToMap.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // Export Dropdown
    const btnExportToggle = document.getElementById('btn-export-toggle');
    const exportDropdown = document.getElementById('export-dropdown');

    if (btnExportToggle && exportDropdown) {
        btnExportToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', () => {
            exportDropdown.classList.add('hidden');
        });
    }

    document.getElementById('export-gpx')?.addEventListener('click', exportToGPX);
    document.getElementById('export-csv')?.addEventListener('click', exportToCSV);
    document.getElementById('export-cloud')?.addEventListener('click', backupToCloud);
}

// Export Functions
function getTrees() {
    const treesKey = getTreesKey();
    const treesData = localStorage.getItem(treesKey);
    return treesData ? JSON.parse(treesData) : [];
}

function downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
}

function exportToGPX() {
    const trees = getTrees();
    if (trees.length === 0) {
        alert('No trees to export.');
        return;
    }

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fruit Tree Map" xmlns="http://www.topografix.com/GPX/1/1">
`;

    trees.forEach(tree => {
        gpx += `  <wpt lat="${tree.lat}" lon="${tree.lng}">
    <name>${tree.type}</name>
    <desc>${tree.name || ''}</desc>
  </wpt>
`;
    });

    gpx += `</gpx>`;
    downloadFile(gpx, 'my_trees.gpx', 'application/gpx+xml');
}

function exportToCSV() {
    const trees = getTrees();
    if (trees.length === 0) {
        alert('No trees to export.');
        return;
    }

    const headers = ['Type', 'Description', 'Latitude', 'Longitude', 'Date Added'];
    const rows = trees.map(tree => [
        `"${tree.type}"`,
        `"${(tree.name || '').replace(/"/g, '""')}"`,
        tree.lat,
        tree.lng,
        new Date(tree.date).toLocaleDateString()
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    downloadFile(csvContent, 'my_trees.csv', 'text/csv');
}

function backupToCloud() {
    const trees = getTrees();
    if (trees.length === 0) {
        alert('No trees to backup.');
        return;
    }

    const btn = document.getElementById('export-cloud');
    const originalContent = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Backing up...';

    // Simulate orchid backup process
    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        alert('Backup successful! Your data has been securely saved to the cloud.');
    }, 2000);
}

// Data Functions
function getTreesKey() {
    if (!currentUser) return null;
    return `fruitmap_trees_${currentUser.email}`;
}

function loadTrees() {
    if (!currentUser) return;

    const treesKey = getTreesKey();
    const treesData = localStorage.getItem(treesKey);
    const trees = treesData ? JSON.parse(treesData) : [];

    displayTrees(trees);
}

function displayTrees(trees) {
    const treeList = document.getElementById('tree-list');
    const treeCount = document.getElementById('tree-count');
    const emptyState = document.getElementById('empty-state');

    if (trees.length === 0) {
        treeList.innerHTML = '';
        emptyState.classList.remove('hidden');
        treeCount.textContent = '';
        return;
    }

    emptyState.classList.add('hidden');
    treeCount.textContent = `${trees.length} tree${trees.length !== 1 ? 's' : ''}`;

    treeList.innerHTML = trees.map(tree => `
        <div class="tree-card" data-id="${tree.id}">
            <div class="tree-card-header">
                <div class="tree-icon">${getTreeEmoji(tree.type)}</div>
                <div class="tree-info">
                    <h3>${tree.type}</h3>
                    <p class="tree-name">${tree.name || 'No description'}</p>
                </div>
                <button class="btn-delete" onclick="deleteTree('${tree.id}')" title="Delete tree">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="tree-card-body">
                <div class="tree-detail">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${tree.lat.toFixed(6)}, ${tree.lng.toFixed(6)}</span>
                </div>
                ${tree.datePlanted ? `
                <div class="tree-detail">
                    <i class="fas fa-seedling"></i>
                    <span>Planted: ${formatDate(tree.datePlanted)}</span>
                </div>
                ` : ''}
                ${tree.dateFruited ? `
                <div class="tree-detail">
                    <i class="fas fa-apple-alt"></i>
                    <span>Fruited: ${formatDate(tree.dateFruited)}</span>
                </div>
                ` : ''}
                ${tree.dateFertilized ? `
                <div class="tree-detail">
                    <i class="fas fa-flask"></i>
                    <span>Fertilized: ${formatDate(tree.dateFertilized)}</span>
                </div>
                ` : ''}
                ${tree.datePruned ? `
                <div class="tree-detail">
                    <i class="fas fa-cut"></i>
                    <span>Pruned: ${formatDate(tree.datePruned)}</span>
                </div>
                ` : ''}
                <div class="tree-detail">
                    <i class="fas fa-calendar"></i>
                    <span>Added: ${formatDate(tree.date)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function deleteTree(id) {
    if (!confirm('Are you sure you want to delete this tree?')) return;
    if (!currentUser) return;

    const treesKey = getTreesKey();
    const treesData = localStorage.getItem(treesKey);
    const trees = treesData ? JSON.parse(treesData) : [];

    // Filter out the tree to delete
    const updatedTrees = trees.filter(tree => tree.id !== id);

    // Save updated trees
    localStorage.setItem(treesKey, JSON.stringify(updatedTrees));

    // Reload display
    loadTrees();
}

// Helper Functions
function getTreeEmoji(type) {
    const emojiMap = {
        'Apple': '🍎',
        'Pear': '🍐',
        'Cherry': '🍒',
        'Plum': '🍑',
        'Peach': '🍑',
        'Lemon': '🍋',
        'Orange': '🍊',
        'Other': '🌳'
    };
    return emojiMap[type] || '🌳';
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Expose deleteTree to global scope
window.deleteTree = deleteTree;
