let map;
let geojsonLayer;
let currentParcelId = null;
let token = localStorage.getItem('token') || null;
let currentUser = localStorage.getItem('username') || null;

// Initialization array for offline Notes
let offlineNotesQueue = JSON.parse(localStorage.getItem('offlineNotes') || '[]');

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = dateStr.endsWith('Z') ? new Date(dateStr) : new Date(dateStr + 'Z');
    return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

// Add a simple client-side logger
function clientLog(msg) {
    console.log(`[CLIENT] ${new Date().toISOString()} - ${msg}`);
}

// Initialize the Map
function initMap() {
    clientLog('Initializing Map');
    // 46°27'10.2"N 1°51'36.4"E -> 46.4528333, 1.8601111
    
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    const ign = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', { maxZoom: 19 });
    const sat1 = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', { maxZoom: 19 });
    const sat2 = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });

    map = L.map('map', { 
        zoomControl: false, 
        attributionControl: false,
        layers: [osm] // Couche par défaut
    }).setView([46.4528333, 1.8601111], 15);

    // Contrôle des calques
    const baseMaps = {
        "Plan OpenStreetMap": osm,
        "Plan IGN": ign,
        "Satellite 1": sat1,
        "Satellite 2": sat2
    };
    L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);

    // Add Center Marker
    L.marker([46.4528333, 1.8601111]).addTo(map)
     .bindPopup("Grange");

    // Zoom control top left
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Load GeoJSON
    fetch('/assets/merged_crozon_aigurande.json')
        .then(response => response.json())
        .then(data => {
            geojsonLayer = L.geoJSON(data, {
                style: function (feature) {
                    return {
                        color: "#3388ff",
                        weight: 1,
                        opacity: 0.8,
                        fillOpacity: 0.1
                    };
                },
                onEachFeature: onEachFeature
            }).addTo(map);
        })
        .catch(err => console.error("Error loading GeoJSON: ", err));
}

function onEachFeature(feature, layer) {
    layer.on({
        click: function(e) {
            // Highlight
            if (geojsonLayer) geojsonLayer.resetStyle();
            layer.setStyle({ weight: 3, color: '#ff0000', fillOpacity: 0.3 });

            // Open panel
            openPanel(feature);
        }
    });
}

function openPanel(feature) {
    currentParcelId = feature.properties.id;
    const shortId = currentParcelId.replace(/^360(?:61|01)000/, '');
    document.getElementById('panel-title').innerText = `Parcelle ${shortId}`;

    // Display properties
    let created = feature.properties.created || 'N/A';
    let updated = feature.properties.updated || 'N/A';

    let otherPropsHTML = Object.keys(feature.properties)
        .filter(k => k !== 'created' && k !== 'updated')
        .map(key => `<li><strong>${key}:</strong> ${feature.properties[key]}</li>`)
        .join('');

    document.getElementById('parcel-data').innerHTML = `
        <div class="parcel-main-info">
            <span><strong>Créé :</strong> ${created}</span>
            <span><strong>MàJ :</strong> ${updated}</span>
            <button class="btn btn-small" onclick="toggleMoreInfo()" id="toggle-info-btn">Voir plus ↓</button>
        </div>
        <ul id="parcel-more-info" style="display:none; margin-top:10px; padding-left: 20px; font-size:14px;">${otherPropsHTML}</ul>
    `;

    // Load notes
    loadNotes(currentParcelId);
    
    document.getElementById('panel').classList.add('open');
    updateAuthUI();
}

function closePanel() {
    document.getElementById('panel').classList.remove('open');
    if (geojsonLayer) geojsonLayer.resetStyle();
    currentParcelId = null;
    clientLog('Panel closed');
}

function loadNotes(parcelId) {
    clientLog(`Loading notes for ${parcelId}`);
    let headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const publicDisplay = document.getElementById('public-note-display');
    const publicInput = document.getElementById('public-note-input');
    const editPublicBtn = document.getElementById('edit-public-btn');
    
    // Setup Loading State
    publicDisplay.innerText = 'Chargement en cours...';
    if(editPublicBtn) editPublicBtn.disabled = true;

    // Load Public Note
    fetch(`/api/public-note/${parcelId}`)
        .then(res => {
            if(!res.ok) throw new Error('Failed to fetch public note');
            return res.json();
        })
        .then(data => {
            clientLog('Public note fetched');
            if(editPublicBtn) editPublicBtn.disabled = false;
            
            if (data.content) {
                let dateStr = formatTime(data.updated_at);
                let authorStr = data.username ? ` par <strong>${data.username}</strong>` : '';
                publicDisplay.innerHTML = `<p style="white-space: pre-wrap; margin:0 0 10px 0;">${data.content}</p>
                                     <small style="color: gray;">Modifié${authorStr} le ${dateStr}</small>`;
                publicInput.value = data.content;
            } else {
                publicDisplay.innerText = 'Aucune note publique.';
                publicInput.value = '';
            }
        })
        .catch(err => {
            clientLog(`Error fetching public note: ${err.message}`);
            publicDisplay.innerText = 'Erreur de chargement (Hors ligne ?). Modification désactivée.';
            if(editPublicBtn) editPublicBtn.disabled = true;
        });

    const individualContainer = document.getElementById('individual-notes');
    individualContainer.innerHTML = '<p>Chargement des messages en cours...</p>';

    // Load Individual Notes
    fetch(`/api/notes/${parcelId}`, { headers })
        .then(res => {
            if(!res.ok) throw new Error('Failed to fetch private notes');
            return res.json();
        })
        .then(data => {
            clientLog('Individual notes fetched');
            individualContainer.innerHTML = '';

            if (data.length === 0) {
                individualContainer.innerHTML = '<p>Aucun message personnel</p>';
            }

            data.forEach(note => {
                const el = document.createElement('div');
                el.className = 'note';

                let actionHTML = '';
                if (token && currentUser === note.username) {
                    actionHTML = ` <button class="icon-btn" onclick="editIndividualNote(${note.id}, '${note.content.replace(/'/g, "\\'")}')">✏️ Edit</button>`;
                }

                el.innerHTML = `<strong>${note.username}</strong> (${formatTime(note.created_at)})${actionHTML}: <br><br> <span id="note-text-${note.id}">${note.content}</span>`;
                individualContainer.appendChild(el);
            });
            
            // Append offline queued notes for this parcel
            const offlineForThis = offlineNotesQueue.filter(n => n.parcelId === parcelId);
            offlineForThis.forEach(note => {
                const el = document.createElement('div');
                el.className = 'note';
                el.innerHTML = `<strong>${note.username}</strong> <span class="offline-badge">Attente Synchronisation (Hors ligne)</span>: <br><br> <span>${note.content}</span>`;
                individualContainer.appendChild(el);
            });
        })
        .catch(err => {
            clientLog(`Error fetching individual notes: ${err.message}`);
            individualContainer.innerHTML = '<p>Erreur lors du chargement des messages. Cependant, vos nouvelles notes seront sauvegardées hors ligne.</p>';
            
            // Still display any queued notes if we're offline
            const offlineForThis = offlineNotesQueue.filter(n => n.parcelId === parcelId);
            if(offlineForThis.length > 0) individualContainer.innerHTML = '';
            offlineForThis.forEach(note => {
                const el = document.createElement('div');
                el.className = 'note';
                el.innerHTML = `<strong>${note.username}</strong> <span class="offline-badge">Attente Synchronisation (Hors ligne)</span>: <br><br> <span>${note.content}</span>`;
                individualContainer.appendChild(el);
            });
        });
}

// Edit Public Note Actions
function toggleMoreInfo() {
    const moreInfo = document.getElementById('parcel-more-info');
    const btn = document.getElementById('toggle-info-btn');
    if (moreInfo.style.display === 'none') {
        moreInfo.style.display = 'block';
        btn.innerText = 'Voir moins ↑';
    } else {
        moreInfo.style.display = 'none';
        btn.innerText = 'Voir plus ↓';
    }
}

function startEditPublicNote() {
    document.getElementById('public-note-display').style.display = 'none';
    document.getElementById('edit-public-btn').style.display = 'none';
    document.getElementById('public-note-editor').style.display = 'block';
}

function cancelEditPublicNote() {
    document.getElementById('public-note-editor').style.display = 'none';
    document.getElementById('public-note-display').style.display = 'block';
    if(token) document.getElementById('edit-public-btn').style.display = 'inline-block';
}

function savePublicNote() {
    if (!token) return;
    const content = document.getElementById('public-note-input').value;

    fetch(`/api/public-note/${currentParcelId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ content })
    })
    .then(res => {
        if (res.ok) {
            cancelEditPublicNote();
            loadNotes(currentParcelId);
        } else {
            console.error("Erreur ajout note publique");
        }
    });
}

function editIndividualNote(noteId, oldContent) {
    const newContent = prompt("Modifier votre note :", oldContent);
    if (newContent !== null && newContent.trim() !== '') {
        fetch(`/api/notes/${noteId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ content: newContent })
        }).then(res => {
            if (res.ok) loadNotes(currentParcelId);
        });
    }
}

// Authentication handling
function updateAuthUI() {
    const btn = document.getElementById('auth-btn');
    const info = document.getElementById('user-info');
    
    if (token && currentUser) {
        btn.innerText = '🚪';
        btn.title = 'Se déconnecter';
        btn.onclick = logout;
        info.innerText = currentUser;
        
        // Notes UI
        document.getElementById('add-note-section').style.display = 'block';
        document.getElementById('edit-public-btn').style.display = 'inline-block';
        document.getElementById('login-prompt').style.display = 'none';
    } else {
        btn.innerText = '👤';
        btn.title = 'Se connecter';
        btn.onclick = openLogin;
        info.innerText = '';
        
        // Notes UI
        document.getElementById('add-note-section').style.display = 'none';
        document.getElementById('edit-public-btn').style.display = 'none';
        document.getElementById('login-prompt').style.display = 'block';
    }
    cancelEditPublicNote(); // Reset editor state
}

function openLogin() {
    document.getElementById('login-modal').style.display = 'block';
}

function closeLogin() {
    document.getElementById('login-modal').style.display = 'none';
}

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    updateAuthUI();
    if (currentParcelId) loadNotes(currentParcelId);
}

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    
    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
    })
    .then(res => res.json().then(data => ({ status: res.status, body: data })))
    .then(res => {
        if (res.status === 200) {
            token = res.body.token;
            currentUser = res.body.username;
            localStorage.setItem('token', token);
            localStorage.setItem('username', currentUser);
            document.getElementById('login-error').innerText = '';
            closeLogin();
            updateAuthUI();
            if (currentParcelId) loadNotes(currentParcelId);
        } else {
            document.getElementById('login-error').innerText = res.body.error || 'Erreur inconnue';
        }
    });
});

document.getElementById('add-note-btn').addEventListener('click', () => {
    if (!token) return;
    const content = document.getElementById('note-input').value;
    const type = 'private'; // Always private/individual for this box

    if (!content.trim()) return;

    clientLog(`Attempting to send an individual note`);
    document.getElementById('note-input').value = '';

    // Optimistic fallback plan if offline
    if (!navigator.onLine) {
        queueOfflineNote(currentParcelId, content, type);
        return;
    }

    fetch(`/api/notes/${currentParcelId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ content, type })
    })
    .then(res => {
        if (res.ok) {
            clientLog('Note saved to server');
            loadNotes(currentParcelId);
        } else {
            throw new Error("Erreur ajout note via Fetch HTTP");
        }
    })
    .catch(err => {
        clientLog(`Error saving note to server, queueing offline: ${err.message}`);
        queueOfflineNote(currentParcelId, content, type);
    });
});

function queueOfflineNote(parcelId, content, type) {
    clientLog(`Queuing offline note for parcel: ${parcelId}`);
    offlineNotesQueue.push({ parcelId, content, type, username: currentUser });
    localStorage.setItem('offlineNotes', JSON.stringify(offlineNotesQueue));
    loadNotes(parcelId); // refresh view to show offline badge
}

async function syncOfflineNotes() {
    if(offlineNotesQueue.length === 0 || !token) return;
    
    clientLog(`Syncing ${offlineNotesQueue.length} offline notes...`);
    const backupQueue = [...offlineNotesQueue];
    offlineNotesQueue = [];
    localStorage.removeItem('offlineNotes');

    for(let note of backupQueue) {
        try {
            await fetch(`/api/notes/${note.parcelId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ content: note.content, type: note.type })
            });
            clientLog(`Successfully synced queued note for ${note.parcelId}`);
        } catch (e) {
            clientLog(`Failed syncing note for ${note.parcelId}, returning to queue`);
            offlineNotesQueue.push(note);
        }
    }
    localStorage.setItem('offlineNotes', JSON.stringify(offlineNotesQueue));
    if(currentParcelId) loadNotes(currentParcelId);
}

// Listen to network status changes
window.addEventListener('online', syncOfflineNotes);

// Geolocation & Recenter Map
let userMarker, userCircle;
function locateUser(e) {
    if(e) e.preventDefault();
    map.locate({setView: true, maxZoom: 16});
}

function recenterMap(e) {
    if(e) e.preventDefault();
    map.setView([46.4528333, 1.8601111], 15);
}

function onLocationFound(e) {
    const radius = Math.round(e.accuracy);

    if (userMarker) map.removeLayer(userMarker);
    if (userCircle) map.removeLayer(userCircle);

    userMarker = L.marker(e.latlng).addTo(map);
    userCircle = L.circle(e.latlng, radius).addTo(map);

    const geoInfo = document.getElementById('geo-info');
    geoInfo.innerText = `Précision GPS : ${radius} m`;
    geoInfo.style.display = 'block';
    setTimeout(() => { geoInfo.style.display = 'none'; }, 5000);
}

// Panel Resize via Handle
let isResizing = false;
let startY = 0;
let startTime = 0;
const panelElement = document.getElementById('panel');
const handleElement = document.getElementById('panel-handle');

function startResize(e) { 
    isResizing = true; 
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startTime = Date.now();
    clientLog('Started resizing panel');
}
function stopResize() { 
    isResizing = false; 
}

function resizePanel(clientY) {
    if (!isResizing) return;
    const newHeight = window.innerHeight - clientY;
    
    // Pour fermer, il faut vraiment descendre le panneau très bas (moins de 30% de l'écran)
    if (newHeight < window.innerHeight * 0.3) {
        isResizing = false;
        closePanel();
        return;
    }

    const maxHeight = window.innerHeight - 50;
    panelElement.style.height = `${Math.min(maxHeight, newHeight)}px`;
}

handleElement.addEventListener('mousedown', startResize);
window.addEventListener('mouseup', stopResize);
window.addEventListener('mousemove', (e) => resizePanel(e.clientY));

handleElement.addEventListener('touchstart', startResize);
window.addEventListener('touchend', stopResize);
window.addEventListener('touchmove', (e) => resizePanel(e.touches[0].clientY));

// Map events
window.onload = () => {
    initMap();
    updateAuthUI();
    syncOfflineNotes(); // Force synchronisation au chargement de la page
    
    map.on('locationfound', onLocationFound);
    map.on('locationerror', (e) => {
        alert("Géolocalisation refusée ou impossible: " + e.message);
    });
};
