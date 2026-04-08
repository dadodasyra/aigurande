let map;
let geojsonLayer;
let currentParcelId = null;
let token = localStorage.getItem('token') || null;
let currentUser = localStorage.getItem('username') || null;

// Initialization array for offline Notes
let offlineNotesQueue = JSON.parse(localStorage.getItem('offlineNotes') || '[]');

// Draw Mode Variables
let isDrawMode = false;
let currentLineCoords = [];
let redoStack = [];
let currentLineLayer = null;
let currentDrawColor = 'red';
let currentDrawType = 'Électricité';
let drawnLayers = {}; // Store layers by ID

// Legend management Data
let linesByData = []; // Array of { layer: featureGroup, data: { id, type, ... } }
let hiddenCategories = new Set();
let isParcelsHidden = false;
//currently as 08/04/2026 it's 232 247m² so 23,22ha sur 30 parcelles
const highlightedParcelSuffixes = new Set(['C0516', 'C0519', 'C0517', 'C0533', 'C0713', 'C0714', 'C0722', 'C0720', 'C0725', 'C0958', 'C0959', 'C0960', 'C0961', 'C0727', 'C0732']);

function isHighlightedParcelId(parcelId) {
    if (!parcelId) return false;
    const id = String(parcelId);
    for (const suffix of highlightedParcelSuffixes) {
        if (id.endsWith(suffix)) return true;
    }
    return false;
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    // Gestion robuste si c'est un objet Date
    if (typeof dateStr === 'object' || typeof dateStr === 'number') {
        return new Date(dateStr).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    }
    const d = dateStr.endsWith('Z') ? new Date(dateStr) : new Date(dateStr + 'Z');
    return d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
}

// Add a simple client-side logger
function clientLog(msg) {
    console.log(`${new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })} - ${msg}`);
}

// Initialize the Map
function initMap() {
    clientLog('Initializing Map');
    // 46°27'10.2"N 1°51'36.4"E -> 46.4528333, 1.8601111

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap contributors' });
    const ign = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', { maxZoom: 21, maxNativeZoom: 19, attribution: '© IGN' });
    const sat1 = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', { maxZoom: 21, maxNativeZoom: 19, attribution: '© IGN' });
    const sat2 = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, attribution: 'Tiles © Esri' });

    map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        maxZoom: 21,
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

    // Custom Legend Control Button
    const LegendControl = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd: function() {
            let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.innerHTML = '<a href="#" title="Légende" onclick="toggleLegend(event); return false;" style="font-size:24px; width:44px; height:44px; display:flex; align-items:center; justify-content:center; background:#fff; text-decoration:none; color:#333;">📋</a>';
            return container;
        }
    });
    map.addControl(new LegendControl());

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
                    const isHighlighted = isHighlightedParcelId(feature?.properties?.id);
                    return {
                        color: isHighlighted ? '#a46cff' : '#3388ff',
                        weight: isHighlighted ? 2 : 1,
                        opacity: 1,
                        fillColor: isHighlighted ? '#dcc8ff' : '#3388ff',
                        fillOpacity: isHighlighted ? 0.2 : 0.1
                    };
                },
                onEachFeature: onEachFeature
            }).addTo(map);

            // Load saved lines
            loadSavedLines();
        })
        .catch(err => console.error("Error loading GeoJSON: ", err));

    // Map click for drawing
    map.on('click', onMapClick);
}

function onEachFeature(feature, layer) {
    layer.on({
        click: function(e) {
            if (isDrawMode || isLieuMode) return; // Ne pas ouvrir le panel si on trace une ligne ou un lieu-dit

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
    const created = feature.properties.created || 'N/A';
    const updated = feature.properties.updated || 'N/A';
    const contenance = Number(feature.properties.contenance);
    const hasSurface = Number.isFinite(contenance);
    const surfaceM2 = hasSurface ? `${contenance.toLocaleString('fr-FR')} m²` : 'N/A';
    const surfaceHa = hasSurface ? `${(contenance / 10000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha` : 'N/A';

    const extraPropsHTML = Object.keys(feature.properties)
        .filter(k => k !== 'created' && k !== 'updated' && k !== 'contenance')
        .map(key => `<li><strong>${key}:</strong> ${feature.properties[key]}</li>`)
        .join('');

    const otherPropsHTML = `
        <li><strong>Créé :</strong> ${created}</li>
        <li><strong>MàJ :</strong> ${updated}</li>
        ${extraPropsHTML}
    `;

    document.getElementById('parcel-data').innerHTML = `
        <div class="parcel-main-info">
            <span><strong>Surface :</strong> ${surfaceM2} (${surfaceHa})</span>
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

// Geolocation & Recenter Map
let userPosition = null;
let userMarker;
let userCircle;
let isPositionHidden = false;

window.onLocationFound = function(e) {
    var radius = e.accuracy / 2;

    if (userMarker) {
        map.removeLayer(userMarker);
    }
    if (userCircle) {
        map.removeLayer(userCircle);
    }

    userMarker = L.marker(e.latlng).bindPopup("Vous êtes à " + radius + " mètres de ce point");
    userCircle = L.circle(e.latlng, radius, {
        color: 'blue',
        opacity: 0.5,
        fillColor: '#514ee6',
        fillOpacity: 0.15
    });

    if (!isPositionHidden) {
        userMarker.addTo(map);
        userCircle.addTo(map);
    }
}

window.togglePosition = function(isVisible) {
    isPositionHidden = !isVisible;
    if (typeof updateVisibility === 'function') {
        updateVisibility();
    }
}

let offlineLinesQueue = JSON.parse(localStorage.getItem('offlineLines') || '[]');

window.customPrompt = function(message, defaultValue, callback) {
    document.getElementById('prompt-title').innerText = message;
    document.getElementById('prompt-input').value = defaultValue || '';
    document.getElementById('prompt-modal').style.display = 'block';

    // Cleanup previous listeners by replacing the element
    let oldBtn = document.getElementById('prompt-ok-btn');
    let newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    newBtn.onclick = function() {
        document.getElementById('prompt-modal').style.display = 'none';
        callback(document.getElementById('prompt-input').value);
    };
}

window.customDualPrompt = function(message, defaultVal1, defaultVal2, callback) {
    document.getElementById('dual-prompt-title').innerText = message;
    document.getElementById('dual-prompt-input1').value = defaultVal1 || '';
    document.getElementById('dual-prompt-input2').value = defaultVal2 || '';
    document.getElementById('dual-prompt-modal').style.display = 'block';

    let oldBtn = document.getElementById('dual-prompt-ok-btn');
    let newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    newBtn.onclick = function() {
        document.getElementById('dual-prompt-modal').style.display = 'none';
        callback(
            document.getElementById('dual-prompt-input1').value,
            document.getElementById('dual-prompt-input2').value
        );
    };
}

window.customLieuPrompt = function(message, defaultTitle, defaultIcon, defaultDesc, callback) {
    document.getElementById('lieu-prompt-title').innerText = message;
    document.getElementById('lieu-prompt-title-input').value = defaultTitle || '';
    document.getElementById('lieu-prompt-icon-input').value = defaultIcon || '📌';
    document.getElementById('lieu-prompt-desc-input').value = defaultDesc || '';
    document.getElementById('lieu-prompt-modal').style.display = 'block';

    let oldBtn = document.getElementById('lieu-prompt-ok-btn');
    let newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    newBtn.onclick = function() {
        document.getElementById('lieu-prompt-modal').style.display = 'none';
        callback(
            document.getElementById('lieu-prompt-title-input').value,
            document.getElementById('lieu-prompt-icon-input').value,
            document.getElementById('lieu-prompt-desc-input').value
        );
    };
}

window.customConfirm = function(message, callback) {
    document.getElementById('confirm-title').innerText = "Confirmation";
    document.getElementById('confirm-message').innerText = message;
    document.getElementById('confirm-modal').style.display = 'block';

    // Cleanup previous listeners by replacing the element
    let oldBtn = document.getElementById('confirm-ok-btn');
    let newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);

    newBtn.onclick = function() {
        document.getElementById('confirm-modal').style.display = 'none';
        callback();
    };
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
    document.body.classList.add('no-select'); // Empêche la sélection de texte
    clientLog('Started resizing panel');
}
function stopResize() {
    isResizing = false;
    document.body.classList.remove('no-select'); // Restaure la sélection de texte
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
        console.warn("Géolocalisation refusée ou impossible: " + e.message);
    });

    // Démarre le suivi GPS en temps réel
    map.locate({watch: true, enableHighAccuracy: true});
};

window.addEventListener('online', () => {
    syncOfflineNotes();
    if (typeof syncOfflineLines === 'function') syncOfflineLines();
    clientLog("System is online. Syncing offline data...");
});

window.locateUser = function(e) {
    if (e) e.preventDefault();
    if (userMarker) {
        // Si on a déjà la position, on se centre dessus en douceur
        map.flyTo(userMarker.getLatLng(), 18, {duration: 0.5});
    } else {
        // Sinon on force la localisation
        map.locate({setView: true, maxZoom: 18});
    }
}

window.recenterMap = function(e) {
    if (e) e.preventDefault();
    map.setView([46.4528333, 1.8601111], 15);
}
