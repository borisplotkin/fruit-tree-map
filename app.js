// App State
let map;
let markers = [];
let addingManualMode = false;
let currentTempMarker = null;

// Authentication Configuration
const AUTH_STORAGE_KEY = 'fruitmap_users';
const SESSION_COOKIE = 'fruitmap_session';
let currentUser = null;
let isLoginMode = true;

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
    checkSession();
    setupEventListeners();
    registerServiceWorker();
});

// Authentication Functions
function md5(string) {
    return CryptoJS.MD5(string).toString();
}

function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + value + expires + "; path=/";
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function deleteCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}

function checkSession() {
    const email = getCookie(SESSION_COOKIE);
    if (email) {
        currentUser = { email };
        updateUI(currentUser);
        loadTrees();
    } else {
        updateUI(null);
    }
}

function register(email, password) {
    const users = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');

    if (users[email]) {
        throw new Error('User already exists');
    }

    const hashedPassword = md5(password);
    users[email] = { email, password: hashedPassword };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));
}

function login(email, password, rememberMe = false) {
    const users = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
    const user = users[email];

    if (!user) {
        throw new Error('User not found');
    }

    const hashedPassword = md5(password);
    if (user.password !== hashedPassword) {
        throw new Error('Invalid password');
    }

    // Create session with cookie
    if (rememberMe) {
        setCookie(SESSION_COOKIE, email, 30); // 30 days
    } else {
        setCookie(SESSION_COOKIE, email); // Session cookie
    }

    currentUser = { email };
    updateUI(currentUser);
    loadTrees();
}

function logout() {
    deleteCookie(SESSION_COOKIE);
    currentUser = null;
    updateUI(null);

    // Clear map
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function requireAuth() {
    if (!currentUser) {
        const authModal = document.getElementById('auth-modal');
        const authTitle = document.getElementById('auth-title');
        const btnAuthSubmit = document.getElementById('btn-auth-submit');
        const authToggle = document.getElementById('auth-toggle');

        isLoginMode = true;
        authTitle.textContent = 'Login';
        btnAuthSubmit.textContent = 'Login';
        authToggle.textContent = "Don't have an account? Register";
        authModal.classList.remove('hidden');
        return false;
    }
    return true;
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
    const btnAuth = document.getElementById('btn-auth');
    const btnLogout = document.getElementById('btn-logout');
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const btnAuthCancel = document.getElementById('btn-auth-cancel');
    const authToggle = document.getElementById('auth-toggle');
    const authTitle = document.getElementById('auth-title');
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    const btnToggleDetails = document.getElementById('btn-toggle-details');
    const extraFields = document.getElementById('extra-fields');
    const treePhoto = document.getElementById('tree-photo');

    // Toggle Details
    if (btnToggleDetails) {
        btnToggleDetails.addEventListener('click', () => {
            const isHidden = extraFields.classList.contains('hidden');
            if (isHidden) {
                extraFields.classList.remove('hidden');
                btnToggleDetails.innerHTML = '<i class="fas fa-chevron-up"></i> Show Less Details';
            } else {
                extraFields.classList.add('hidden');
                btnToggleDetails.innerHTML = '<i class="fas fa-chevron-down"></i> Show More Details';
            }
        });
    }

    // Photo Handling
    if (treePhoto) {
        treePhoto.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Limit size to ~50KB for now to save localStorage space
                if (file.size > 50000) {
                    alert("Photo is too large! Please choose a smaller image (under 50KB) or it won't be saved.");
                    e.target.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = function (event) {
                    document.getElementById('tree-photo-data').value = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Auth Listeners
    if (btnAuth) {
        btnAuth.addEventListener('click', () => {
            isLoginMode = true;
            authTitle.textContent = 'Login';
            btnAuthSubmit.textContent = 'Login';
            authToggle.textContent = "Don't have an account? Register";
            authModal.classList.remove('hidden');
        });
    }

    if (btnAuthCancel) {
        btnAuthCancel.addEventListener('click', () => {
            authModal.classList.add('hidden');
            authForm.reset();
        });
    }

    if (authToggle) {
        authToggle.addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
                authTitle.textContent = 'Login';
                btnAuthSubmit.textContent = 'Login';
                authToggle.textContent = "Don't have an account? Register";
            } else {
                authTitle.textContent = 'Register';
                btnAuthSubmit.textContent = 'Register';
                authToggle.textContent = 'Already have an account? Login';
            }
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const rememberMe = document.getElementById('auth-remember').checked;

            try {
                if (isLoginMode) {
                    login(email, password, rememberMe);
                    alert('Login successful!');
                } else {
                    register(email, password);
                    login(email, password, rememberMe);
                    alert('Registration successful!');
                }
                authModal.classList.add('hidden');
                authForm.reset();
            } catch (error) {
                alert(error.message);
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            logout();
        });
    }

    // Tree List Navigation
    const btnTreeList = document.getElementById('btn-tree-list');
    if (btnTreeList) {
        btnTreeList.addEventListener('click', () => {
            window.location.href = 'trees.html';
        });
    }

    // GPX Upload (with auth check)
    gpxUpload.addEventListener('change', (e) => {
        if (!requireAuth()) {
            e.target.value = ''; // Reset file input
            return;
        }
        handleGPXUpload(e);
    });

    // Add Current Location (with auth check)
    btnAddLocation.addEventListener('click', () => {
        if (!requireAuth()) return;

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

    // Add Manual Location (with auth check)
    btnAddManual.addEventListener('click', () => {
        if (!requireAuth()) return;

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

        // New Fields
        const condition = document.getElementById('tree-condition').value;
        const harvestPeriod = document.getElementById('tree-harvest').value;
        const notes = document.getElementById('tree-notes').value;
        const accessibility = document.getElementById('tree-accessibility').value;
        const photo = document.getElementById('tree-photo-data').value;

        const tree = {
            type,
            name,
            lat,
            lng,
            date: new Date().toISOString(),
            datePlanted,
            dateFruited,
            dateFertilized,
            datePruned,
            condition,
            harvestPeriod,
            notes,
            accessibility,
            photo
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
    document.getElementById('tree-photo-data').value = '';

    // Reset details toggle
    const extraFields = document.getElementById('extra-fields');
    const btnToggleDetails = document.getElementById('btn-toggle-details');
    if (extraFields && !extraFields.classList.contains('hidden')) {
        extraFields.classList.add('hidden');
        btnToggleDetails.innerHTML = '<i class="fas fa-chevron-down"></i> Show More Details';
    }

    if (currentTempMarker) {
        map.removeLayer(currentTempMarker);
        currentTempMarker = null;
    }
}

function updateUI(user) {
    const btnAuth = document.getElementById('btn-auth');
    const btnLogout = document.getElementById('btn-logout');
    const btnTreeList = document.getElementById('btn-tree-list');

    if (user) {
        if (btnAuth) btnAuth.classList.add('hidden');
        if (btnLogout) btnLogout.classList.remove('hidden');
        if (btnTreeList) btnTreeList.classList.remove('hidden');
    } else {
        if (btnAuth) btnAuth.classList.remove('hidden');
        if (btnLogout) btnLogout.classList.add('hidden');
        if (btnTreeList) btnTreeList.classList.add('hidden');
    }
}

// Data Persistence (localStorage)
function getTreesKey() {
    if (!currentUser) return null;
    return `fruitmap_trees_${currentUser.email}`;
}

function loadTrees() {
    if (!currentUser) return;

    const treesKey = getTreesKey();
    const treesData = localStorage.getItem(treesKey);
    const trees = treesData ? JSON.parse(treesData) : [];

    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    // Add markers for all trees
    trees.forEach(tree => {
        addMarker(tree);
    });

    updateDatalist();
}

function saveTree(tree) {
    if (!currentUser) {
        alert("Please login to save trees.");
        return;
    }

    const treesKey = getTreesKey();
    const treesData = localStorage.getItem(treesKey);
    const trees = treesData ? JSON.parse(treesData) : [];

    // Generate unique ID
    tree.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    // Add tree to array
    trees.push(tree);

    // Save to localStorage
    localStorage.setItem(treesKey, JSON.stringify(trees));

    // Add marker to map
    addMarker(tree);
    updateDatalist();

    console.log("Tree saved!");
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

    // Reload trees to update map
    loadTrees();

    console.log("Tree deleted!");
}

function addMarker(tree) {
    const marker = L.marker([tree.lat, tree.lng], { icon: treeIcon })
        .bindPopup(`
            <h3>${tree.type}</h3>
            ${tree.photo ? `<img src="${tree.photo}" style="width:100%; max-height:150px; object-fit:cover; border-radius:4px; margin-bottom:8px;">` : ''}
            <p><strong>${tree.name || 'No description'}</strong></p>
            ${tree.condition ? `<p>Condition: ${tree.condition}</p>` : ''}
            ${tree.harvestPeriod ? `<p>Harvest: ${tree.harvestPeriod}</p>` : ''}
            ${tree.accessibility ? `<p>Access: ${tree.accessibility}</p>` : ''}
            ${tree.notes ? `<p><em>${tree.notes}</em></p>` : ''}
            <hr style="margin: 5px 0; border: 0; border-top: 1px solid #eee;">
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
