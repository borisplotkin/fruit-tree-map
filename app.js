// App State
let map;
let markers = [];
let addingManualMode = false;
let currentTempMarker = null;

// Firebase Configuration
// REPLACE WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
let db;
let auth;
let currentUser = null;
let unsubscribe = null;

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
    initFirebase();
    setupEventListeners();
    registerServiceWorker();
});

function initFirebase() {
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();

        // Auth State Listener
        auth.onAuthStateChanged(user => {
            currentUser = user;
            updateUI(user);
            if (user) {
                loadTrees();
            } else {
                // Clear map on logout
                markers.forEach(marker => map.removeLayer(marker));
                markers = [];
            }
        });
    } catch (e) {
        console.error("Firebase not initialized. Make sure to fill in config.", e);
    }
}

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
    const gpxUpload = document.getElementById('gpx-upload');
    const btnLogin = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');

    // Auth Listeners
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(error => {
                console.error("Login failed:", error);
                alert("Login failed: " + error.message);
            });
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            auth.signOut();
        });
    }

    // GPX Upload
    gpxUpload.addEventListener('change', handleGPXUpload);

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

        // Optional Dates
        const datePlanted = document.getElementById('date-planted').value;
        const dateFruited = document.getElementById('date-fruited').value;
        const dateFertilized = document.getElementById('date-fertilized').value;
        const datePruned = document.getElementById('date-pruned').value;

        const tree = {
            type,
            name,
            lat,
            lng,
            date: new Date().toISOString(),
            datePlanted,
            dateFruited,
            dateFertilized,
            datePruned
        };

        saveTree(tree);
        // addMarker called inside saveTree success or snapshot listener? 
        // With Firestore snapshot, we don't need to call addMarker manually if we are listening.
        // But for immediate feedback or if offline? 
        // Let's rely on snapshot listener for consistency.

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

function updateUI(user) {
    const btnLogin = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');

    if (user) {
        if (btnLogin) btnLogin.classList.add('hidden');
        if (btnLogout) btnLogout.classList.remove('hidden');
    } else {
        if (btnLogin) btnLogin.classList.remove('hidden');
        if (btnLogout) btnLogout.classList.add('hidden');
    }
}

// Data Persistence (Firestore)
function loadTrees() {
    if (!currentUser || !db) return;

    // Unsubscribe from previous listener if exists
    if (unsubscribe) unsubscribe();

    // Listen for real-time updates
    unsubscribe = db.collection('trees')
        .where('uid', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            // Clear existing markers
            markers.forEach(marker => map.removeLayer(marker));
            markers = [];

            snapshot.forEach(doc => {
                const tree = doc.data();
                tree.id = doc.id; // Use Firestore ID
                addMarker(tree);
            });

            updateDatalist();

            // Fit bounds if first load? Maybe not every update.
        }, error => {
            console.error("Error loading trees:", error);
        });
}

function saveTree(tree) {
    if (!currentUser || !db) {
        alert("Please login to save trees.");
        return;
    }

    // Add user ID to tree
    tree.uid = currentUser.uid;

    db.collection('trees').add(tree)
        .then(() => {
            console.log("Tree saved!");
        })
        .catch(error => {
            console.error("Error adding tree: ", error);
            alert("Error saving tree: " + error.message);
        });
}

function deleteTree(id) {
    if (!confirm('Are you sure you want to delete this tree?')) return;
    if (!currentUser || !db) return;

    db.collection('trees').doc(id).delete()
        .then(() => {
            console.log("Tree deleted!");
        })
        .catch(error => {
            console.error("Error removing tree: ", error);
        });
}

function addMarker(tree) {
    const marker = L.marker([tree.lat, tree.lng], { icon: treeIcon })
        .bindPopup(`
            <h3>${tree.type}</h3>
            <p>${tree.name || 'No description'}</p>
            ${tree.datePlanted ? `<p><small>Planted: ${tree.datePlanted}</small></p>` : ''}
            ${tree.dateFruited ? `<p><small>Fruited: ${tree.dateFruited}</small></p>` : ''}
            ${tree.dateFertilized ? `<p><small>Fertilized: ${tree.dateFertilized}</small></p>` : ''}
            ${tree.datePruned ? `<p><small>Pruned: ${tree.datePruned}</small></p>` : ''}
            <p><small>Added: ${new Date(tree.date).toLocaleDateString()}</small></p>
            <div class="delete-btn" onclick="deleteTree('${tree.id}')">Delete Tree</div>
        `);

    marker.addTo(map);
    markers.push(marker);
}

function updateDatalist() {
    // Simplified: Just use static list or could fetch unique types from Firestore if needed.
    // For now, we'll leave it as is or implement a simple client-side collection from markers.
    const datalist = document.getElementById('tree-types-list');
    const types = new Set();

    markers.forEach(m => {
        // We'd need to store data on marker to retrieve it easily, or parse popup.
        // Let's skip dynamic update for now to keep it simple, 
        // or we can attach data to marker object.
    });
}

function handleGPXUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
        const wpts = xmlDoc.getElementsByTagName("wpt");

        let count = 0;
        for (let i = 0; i < wpts.length; i++) {
            const lat = parseFloat(wpts[i].getAttribute("lat"));
            const lon = parseFloat(wpts[i].getAttribute("lon"));
            const nameTag = wpts[i].getElementsByTagName("name")[0];
            const name = nameTag ? nameTag.textContent : "Imported Tree";

            const type = "Other";

            const tree = {
                type,
                name,
                lat,
                lng: lon,
                date: new Date().toISOString()
            };

            saveTree(tree);
            count++;
        }

        if (count > 0) {
            alert(`Imported ${count} locations from GPX.`);
        } else {
            alert("No waypoints found in GPX file.");
        }

        event.target.value = '';
    };
    reader.readAsText(file);
}

// Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.log('Service Worker registration failed', err));
    }
}

// Expose deleteTree to global scope
window.deleteTree = deleteTree;
