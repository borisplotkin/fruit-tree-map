// App State
let map;
let markers = [];
let addingManualMode = false;
let currentTempMarker = null;

// Icons
const treeIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const tempIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadTrees();
    setupEventListeners();
    registerServiceWorker();
});

function initMap() {
    // Base Layers
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    const googleStreets = L.tileLayer('http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    const googleSat = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    // Default to OSM
    map = L.map('map', {
        center: [0, 0],
        zoom: 2,
        layers: [osm] // Default layer
    });

    const baseMaps = {
        "OpenStreetMap": osm,
        "Google Streets": googleStreets,
        "Google Satellite": googleSat
    };

    L.control.layers(baseMaps).addTo(map);

    // Try to get user location for initial view if no trees
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (markers.length === 0) {
                    map.setView([position.coords.latitude, position.coords.longitude], 15);
                }
            },
            (error) => {
                console.log("Location access denied or error", error);
            }
        );
    }
}

function setupEventListeners() {
    const btnAddLocation = document.getElementById('btn-add-location');
    const btnAddManual = document.getElementById('btn-add-manual');
    const btnCancel = document.getElementById('btn-cancel');
    const treeForm = document.getElementById('tree-form');
    const modal = document.getElementById('tree-modal');

    // Add Current Location
    btnAddLocation.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        btnAddLocation.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                btnAddLocation.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                openModal(lat, lng);
                map.setView([lat, lng], 18);
            },
            (error) => {
                btnAddLocation.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
                alert('Unable to retrieve your location. Please ensure GPS is enabled and permissions are granted.');
                console.error(error);
            },
            { enableHighAccuracy: true }
        );
    });

    // Add Manual Location
    btnAddManual.addEventListener('click', () => {
        addingManualMode = !addingManualMode;

        if (addingManualMode) {
            btnAddManual.classList.add('active');
            btnAddManual.style.backgroundColor = '#FFC107'; // Accent color
            document.getElementById('map').style.cursor = 'crosshair';
            alert('Tap anywhere on the map to add a tree.');
        } else {
            resetManualMode();
        }
    });

    // Map Click for Manual Add
    map.on('click', (e) => {
        if (addingManualMode) {
            openModal(e.latlng.lat, e.latlng.lng);
            resetManualMode();
        }
    });

    // Modal Actions
    btnCancel.addEventListener('click', closeModal);

    treeForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const type = document.getElementById('tree-type').value;
        const name = document.getElementById('tree-name').value;
        const lat = parseFloat(document.getElementById('tree-lat').value);
        const lng = parseFloat(document.getElementById('tree-lng').value);

        const tree = {
            id: Date.now(),
            type,
            name,
            lat,
            lng,
            date: new Date().toISOString()
        };

        saveTree(tree);
        addMarker(tree);
        closeModal();
    });
}

function resetManualMode() {
    addingManualMode = false;
    const btnAddManual = document.getElementById('btn-add-manual');
    btnAddManual.classList.remove('active');
    btnAddManual.style.backgroundColor = ''; // Reset to default
    document.getElementById('map').style.cursor = '';
}

function openModal(lat, lng) {
    const modal = document.getElementById('tree-modal');
    document.getElementById('tree-lat').value = lat;
    document.getElementById('tree-lng').value = lng;

    // Show temp marker
    if (currentTempMarker) map.removeLayer(currentTempMarker);
    currentTempMarker = L.marker([lat, lng], { icon: tempIcon }).addTo(map);

    modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('tree-modal');
    modal.classList.add('hidden');
    document.getElementById('tree-form').reset();

    if (currentTempMarker) {
        map.removeLayer(currentTempMarker);
        currentTempMarker = null;
    }
}

// Data Persistence
function loadTrees() {
    const storedTrees = localStorage.getItem('fruit-trees');
    if (storedTrees) {
        const trees = JSON.parse(storedTrees);
        trees.forEach(tree => addMarker(tree));

        // Fit bounds if we have trees
        if (trees.length > 0) {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

function saveTree(tree) {
    const storedTrees = localStorage.getItem('fruit-trees');
    let trees = storedTrees ? JSON.parse(storedTrees) : [];
    trees.push(tree);
    localStorage.setItem('fruit-trees', JSON.stringify(trees));
}

function deleteTree(id) {
    if (!confirm('Are you sure you want to delete this tree?')) return;

    const storedTrees = localStorage.getItem('fruit-trees');
    if (storedTrees) {
        let trees = JSON.parse(storedTrees);
        trees = trees.filter(t => t.id !== id);
        localStorage.setItem('fruit-trees', JSON.stringify(trees));

        // Reload map
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
        loadTrees();
    }
}

function addMarker(tree) {
    const marker = L.marker([tree.lat, tree.lng], { icon: treeIcon })
        .bindPopup(`
            <h3>${tree.type}</h3>
            <p>${tree.name || 'No description'}</p>
            <p><small>Added: ${new Date(tree.date).toLocaleDateString()}</small></p>
            <div class="delete-btn" onclick="deleteTree(${tree.id})">Delete Tree</div>
        `);

    marker.addTo(map);
    markers.push(marker);
}

// Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    }
}

// Expose deleteTree to global scope for popup onclick
window.deleteTree = deleteTree;
