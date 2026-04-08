function onMapClick(e) {
    if (typeof isLieuMode !== 'undefined' && isLieuMode) {
        customLieuPrompt("Nouveau Lieu-dit", "", "📌", "", (title, icon, description) => {
            if (!title) return;
            saveLieuDit(title, description, icon, e.latlng.lat, e.latlng.lng);
            cancelLieuMode();
        });
        return;
    }

    if (!isDrawMode) return;

    currentLineCoords.push([e.latlng.lat, e.latlng.lng]);
    redoStack = []; // reset redo history when making a new point
    redrawCurrentLine();
}

window.undoDrawPoint = function() {
    if (!isDrawMode || currentLineCoords.length === 0) return;
    redoStack.push(currentLineCoords.pop());
    redrawCurrentLine();
}

window.redoDrawPoint = function() {
    if (!isDrawMode || redoStack.length === 0) return;
    currentLineCoords.push(redoStack.pop());
    redrawCurrentLine();
}

function redrawCurrentLine() {
    if (currentLineLayer) {
        map.removeLayer(currentLineLayer);
    }

    if (currentLineCoords.length > 0) {
        currentLineLayer = L.polyline(currentLineCoords, {color: currentDrawColor, weight: 3}).addTo(map);

        // Calculate distance
        let totalDistance = 0;
        for (let i = 0; i < currentLineCoords.length - 1; i++) {
            let p1 = L.latLng(currentLineCoords[i]);
            let p2 = L.latLng(currentLineCoords[i+1]);
            totalDistance += p1.distanceTo(p2);
        }
        document.getElementById('draw-distance').innerText = totalDistance.toFixed(1);
    } else {
        document.getElementById('draw-distance').innerText = '0';
    }
}

function updateDrawColor() {
    let select = document.getElementById('draw-type');
    let customInputs = document.getElementById('custom-draw-inputs');

    if (select.value === 'custom') {
        customInputs.style.display = 'flex';
        let customType = document.getElementById('custom-draw-type').value || 'Autre';
        let customColor = document.getElementById('custom-draw-color').value;
        currentDrawType = customType;
        currentDrawColor = customColor;
    } else {
        customInputs.style.display = 'none';
        let val = JSON.parse(select.value);
        currentDrawColor = val.color;
        currentDrawType = val.type;
    }

    if (currentLineLayer) {
        currentLineLayer.setStyle({ color: currentDrawColor });
    }
}

function toggleDrawMode() {
    isDrawMode = !isDrawMode;
    const overlay = document.getElementById('draw-overlay');
    const drawBtn = document.getElementById('draw-btn');

    if (isDrawMode) {
        overlay.classList.remove('hidden');
        drawBtn.style.backgroundColor = 'rgba(0, 120, 212, 0.2)';
        closePanel(); // Close parcel panel to avoid confusion
    } else {
        cancelDraw();
    }
}

function cancelDraw() {
    isDrawMode = false;
    document.getElementById('draw-overlay').classList.add('hidden');
    document.getElementById('draw-btn').style.backgroundColor = 'transparent';
    if (currentLineLayer) {
        map.removeLayer(currentLineLayer);
    }
    currentLineLayer = null;
    currentLineCoords = [];
    redoStack = [];
    document.getElementById('draw-distance').innerText = '0';
}

let isLieuMode = false;
let lieuxDitsLayers = {};

window.toggleLieuMode = function() {
    isLieuMode = !isLieuMode;
    const lieuBtn = document.getElementById('lieu-btn');

    if (isLieuMode) {
        lieuBtn.style.backgroundColor = 'rgba(0, 120, 212, 0.2)';
        cancelDraw();
        closePanel();
    } else {
        cancelLieuMode();
    }
}

window.cancelLieuMode = function() {
    isLieuMode = false;
    const lieuBtn = document.getElementById('lieu-btn');
    if (lieuBtn) lieuBtn.style.backgroundColor = 'transparent';
}

let isDrawCollapsed = false;
window.toggleDrawCollapse = function() {
    isDrawCollapsed = !isDrawCollapsed;
    document.getElementById('draw-content').style.display = isDrawCollapsed ? 'none' : 'block';
    document.getElementById('collapse-draw-btn').innerText = isDrawCollapsed ? '+' : '—';
}

let isLegendOpen = false;
let isCatalogOpen = false;
let catalogMode = 'lines';
window.toggleLegend = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    isLegendOpen = !isLegendOpen;
    const overlay = document.getElementById('legend-overlay');
    if (isLegendOpen) {
        overlay.classList.remove('hidden');
        renderLegend();
    } else {
        overlay.classList.add('hidden');
    }
}

window.toggleCatalog = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    isCatalogOpen = !isCatalogOpen;
    const overlay = document.getElementById('catalog-overlay');
    if (isCatalogOpen) {
        overlay.classList.remove('hidden');
        renderCatalog();
    } else {
        overlay.classList.add('hidden');
    }
}

window.setCatalogMode = function(mode) {
    catalogMode = mode === 'lieux' ? 'lieux' : 'lines';
    renderCatalog();
}

function updateVisibility() {
    linesByData.forEach(item => {
        if (hiddenCategories.has(item.data.type)) {
            if (map.hasLayer(item.layer)) map.removeLayer(item.layer);
        } else {
            if (!map.hasLayer(item.layer)) map.addLayer(item.layer);
        }
    });

    if (geojsonLayer) {
        if (isParcelsHidden) {
            if (map.hasLayer(geojsonLayer)) map.removeLayer(geojsonLayer);
        } else {
            if (!map.hasLayer(geojsonLayer)) map.addLayer(geojsonLayer);
        }
    }

    // Toggle Ma position
    if (typeof isPositionHidden !== 'undefined' && isPositionHidden) {
        if (userMarker && map.hasLayer(userMarker)) map.removeLayer(userMarker);
        if (userCircle && map.hasLayer(userCircle)) map.removeLayer(userCircle);
    } else {
        if (userMarker && !map.hasLayer(userMarker)) map.addLayer(userMarker);
        if (userCircle && !map.hasLayer(userCircle)) map.addLayer(userCircle);
    }
}

window.toggleCategory = function(type, isVisible) {
    if (type === 'Parcelles') {
        isParcelsHidden = !isVisible;
    } else {
        if (isVisible) hiddenCategories.delete(type);
        else hiddenCategories.add(type);
    }
    updateVisibility();
}

window.deleteCategory = function(type) {
    customConfirm(`Êtes-vous sûr de vouloir supprimer TOUTES les données de la catégorie "${type}" ?`, () => {
        if (type === 'Lieux-dits') {
            fetch(`/api/lieux/category/all`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    let idsToDelete = linesByData.filter(i => i.data.type === type).map(i => i.data.lieuData.id);
                    idsToDelete.forEach(id => {
                        if(lieuxDitsLayers[id]) {
                            map.removeLayer(lieuxDitsLayers[id]);
                            delete lieuxDitsLayers[id];
                        }
                    });
                    linesByData = linesByData.filter(i => i.data.type !== type);
                    renderLegend();
                } else {
                    alert("Erreur: " + data.error);
                }
            });
        } else {
            fetch(`/api/lines/category/${encodeURIComponent(type)}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    let idsToDelete = linesByData.filter(i => i.data.type === type).map(i => i.data.id);
                    idsToDelete.forEach(id => {
                        if(drawnLayers[id]) {
                            map.removeLayer(drawnLayers[id]);
                            delete drawnLayers[id];
                        }
                    });
                    linesByData = linesByData.filter(i => i.data.type !== type);
                    renderLegend();
                } else {
                    alert("Erreur: " + data.error);
                }
            });
        }
    });
}

window.renderLegend = function() {
    const legendContent = document.getElementById('legend-content');

    // First, user position toggle and parcels toggle
    let html = `
        <div class="legend-item">
            <label style="flex:1;">
                <input type="checkbox" onchange="togglePosition(this.checked)" ${!(typeof isPositionHidden !== 'undefined' && isPositionHidden) ? 'checked' : ''}>
                📍 Ma position
            </label>
        </div>
        <div class="legend-item">
            <label style="flex:1;">
                <input type="checkbox" onchange="toggleCategory('Parcelles', this.checked)" ${!isParcelsHidden ? 'checked' : ''}>
                🗺️ Parcelles interactives
            </label>
        </div>
        <hr style="margin:8px 0;">
    `;

    const types = [...new Set(linesByData.map(item => item.data.type))];
    types.forEach(type => {
        let isTypeHidden = hiddenCategories.has(type);

        let prefix = '';
        if (type === 'Lieux-dits') {
            prefix = `<span style="display:inline-block; font-size:16px; margin-right:5px;">📌</span>`;
        } else {
            let colorExample = linesByData.find(i => i.data.type === type)?.data.color || '#000';
            prefix = `<span style="display:inline-block; width:12px; height:3px; background-color:${colorExample}; margin-right:5px;"></span>`;
        }

        html += `
            <div class="legend-item">
                <label style="flex:1;">
                    <input type="checkbox" onchange="toggleCategory('${type}', this.checked)" ${!isTypeHidden ? 'checked' : ''}>
                    ${prefix}${type}
                </label>
        `;
        if (token && currentUser) {
            html += `<button class="btn icon-btn" style="color:red; font-size:12px; padding:2px;" onclick="deleteCategory('${type}')" title="Supprimer tout">🗑️</button>`;
        }
        html += `</div>`;
    });

    legendContent.innerHTML = html;

    if (isCatalogOpen) {
        renderCatalog();
    }
}

function renderCatalog() {
    if (!isCatalogOpen) return;

    const content = document.getElementById('catalog-content');
    const linesBtn = document.getElementById('catalog-lines-btn');
    const lieuxBtn = document.getElementById('catalog-lieux-btn');
    if (!content || !linesBtn || !lieuxBtn) return;

    linesBtn.style.background = catalogMode === 'lines' ? '#0078d4' : '#e0e0e0';
    linesBtn.style.color = catalogMode === 'lines' ? '#fff' : '#333';
    lieuxBtn.style.background = catalogMode === 'lieux' ? '#0078d4' : '#e0e0e0';
    lieuxBtn.style.color = catalogMode === 'lieux' ? '#fff' : '#333';

    if (catalogMode === 'lines') {
        const lines = linesByData
            .map(item => item.data)
            .filter(data => data && !data.isLieu);
        if (lines.length === 0) {
            content.innerHTML = '<p style="margin:0; color:#666; font-size:13px;">Aucune ligne disponible.</p>';
            return;
        }

        const byType = {};
        lines.forEach(line => {
            const key = line.type || 'Autre';
            if (!byType[key]) byType[key] = [];
            byType[key].push(line);
        });

        const categories = Object.keys(byType).sort((a, b) => a.localeCompare(b, 'fr'));
        let html = '';
        categories.forEach(type => {
            const items = byType[type]
                .slice()
                .sort((a, b) => Number(a.id) - Number(b.id));

            const colorExample = items[0]?.color || '#000';
            html += `<div class="catalog-group"><div class="catalog-group-title"><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${colorExample}; margin-right:6px;"></span>${type}</div>`;
            items.forEach(line => {
                html += `
                    <div class="catalog-item">
                        <button class="catalog-main-btn" onclick="focusCatalogLine('${line.id}')">#${line.id} - ${line.distance || 0} m</button>
                        <div class="catalog-actions">
                            <button class="btn btn-small" title="Modifier" onclick="editLine('${line.id}')">✏️</button>
                            <button class="btn btn-small" title="Supprimer" style="color:#b40000;" onclick="deleteLine('${line.id}')">🗑️</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        });
        html += `<button class="btn btn-small" style="width:100%; margin-top:8px;" onclick="exportCatalogMode('lines')">Exporter JSON</button>`;
        content.innerHTML = html;
        return;
    }

    const lieux = linesByData
        .map(item => item.data)
        .filter(data => data && data.isLieu && data.lieuData)
        .map(data => data.lieuData);

    if (lieux.length === 0) {
        content.innerHTML = '<p style="margin:0; color:#666; font-size:13px;">Aucun lieu-dit disponible.</p>';
        return;
    }

    const byIcon = {};
    lieux.forEach(lieu => {
        const key = lieu.icon || '📌';
        if (!byIcon[key]) byIcon[key] = [];
        byIcon[key].push(lieu);
    });

    const categories = Object.keys(byIcon).sort((a, b) => a.localeCompare(b, 'fr'));
    let html = '';
    categories.forEach(icon => {
        const items = byIcon[icon]
            .slice()
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr'));

        html += `<div class="catalog-group"><div class="catalog-group-title">${icon}</div>`;
        items.forEach(lieu => {
            html += `
                <div class="catalog-item">
                    <button class="catalog-main-btn" onclick="focusCatalogLieu('${lieu.id}')">${icon} ${lieu.title || 'Sans titre'}</button>
                    <div class="catalog-actions">
                        <button class="btn btn-small" title="Modifier" onclick="editLieuDit('${lieu.id}')">✏️</button>
                        <button class="btn btn-small" title="Supprimer" style="color:#b40000;" onclick="deleteLieuDit('${lieu.id}')">🗑️</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    });
    html += `<button class="btn btn-small" style="width:100%; margin-top:8px;" onclick="exportCatalogMode('lieux')">Exporter JSON (tous les lieux-dits)</button>`;
    content.innerHTML = html;
}

window.exportCatalogMode = function(mode) {
    let payload = [];

    if (mode === 'lines') {
        payload = linesByData
            .map(item => item.data)
            .filter(data => data && !data.isLieu)
            .map(data => ({
                id: data.id,
                type: data.type,
                color: data.color,
                distance: data.distance,
                coordinates: data.coordinates || data.coords || [],
                created_at: data.created_at,
                username: data.username
            }));
    } else {
        payload = linesByData
            .map(item => item.data)
            .filter(data => data && data.isLieu && data.lieuData)
            .map(data => ({
                id: data.lieuData.id,
                title: data.lieuData.title,
                description: data.lieuData.description,
                icon: data.lieuData.icon,
                lat: data.lieuData.lat,
                lng: data.lieuData.lng,
                created_at: data.lieuData.created_at,
                username: data.lieuData.username
            }));
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mode === 'lines' ? 'lignes.json' : 'lieux-dits.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.focusCatalogLine = function(lineId) {
    const layer = drawnLayers[lineId];
    if (!layer) return;

    const bounds = layer.getBounds ? layer.getBounds() : null;
    if (bounds && bounds.isValid()) {
        map.flyTo(bounds.getCenter(), Math.max(map.getZoom(), 17), { duration: 0.5 });
        layer.fire('click', { latlng: bounds.getCenter() });
    }
}

window.focusCatalogLieu = function(lieuId) {
    const marker = lieuxDitsLayers[lieuId];
    if (!marker) return;

    const latlng = marker.getLatLng();
    map.flyTo(latlng, Math.max(map.getZoom(), 17), { duration: 0.5 });
    marker.openPopup();
}

function saveLine() {
    if (currentLineCoords.length < 2) {
        customConfirm("Erreur: Veuillez tracer au moins 2 points pour sauvegarder une ligne.", () => {});
        return;
    }

    let totalDistance = parseFloat(document.getElementById('draw-distance').innerText);
    let lineDataObj = {
        color: currentDrawColor,
        type: currentDrawType,
        coordinates: currentLineCoords, // Send as array, backend stringifies it if needed
        distance: totalDistance
    };

    if (!navigator.onLine) {
        clientLog("Ligne sauvegardée hors ligne.");
        let tempId = 'offline_' + Date.now();
        lineDataObj.id = tempId;
        lineDataObj.username = currentUser;
        lineDataObj.created_at = new Date().toISOString();

        offlineLinesQueue.push(lineDataObj);
        localStorage.setItem('offlineLines', JSON.stringify(offlineLinesQueue));

        window.renderLineLocally(lineDataObj);
        cancelDraw();
        return;
    }

    fetch('/api/lines', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
            color: currentDrawColor,
            type: currentDrawType,
            coordinates: currentLineCoords,
            distance: totalDistance
        })
    })
    .then(res => {
        if (!res.ok) throw new Error("Could not save line");
        return res.json();
    })
    .then(data => {
        clientLog(`Line saved with ID ${data.id}`);
        // Render it permanently via FeatureGroup to increase click area
        let group = L.featureGroup().addTo(map);
        // Invisible thick layer for hit detection
        L.polyline(currentLineCoords, {weight: 20, opacity: 0}).addTo(group);
        // Visible thin layer
        L.polyline(currentLineCoords, {color: currentDrawColor, weight: 3}).addTo(group);

        let newData = { id: data.id, distance: totalDistance, type: currentDrawType, username: currentUser, created_at: new Date(), coords: currentLineCoords, color: currentDrawColor };
        bindLinePopup(group, newData);

        drawnLayers[data.id] = group;
        linesByData.push({ layer: group, data: newData });
        renderLegend();
        updateVisibility();
        cancelDraw();
    })
    .catch(err => {
        alert("Erreur de sauvegarde réseau: " + err.message);
    });
}

window.renderLineLocally = function(lineData, options = {}) {
    const skipRefresh = !!options.skipRefresh;
    let coords = lineData.coordinates || lineData.coords || [];
    if(typeof coords === 'string') coords = JSON.parse(coords);

    let group = L.featureGroup().addTo(map);

    // Invisible wide polyline for easier clicking on mobile
    L.polyline(coords, {weight: 25, opacity: 0}).addTo(group);

    // Visible polyline
    L.polyline(coords, {color: lineData.color, weight: 3}).addTo(group);

    let popupContent = `<strong>Réseau : ${lineData.type}</strong><br>Distance : ${lineData.distance} m<br><small>Tracé par ${lineData.username || 'Inconnu'} le ${formatTime(lineData.created_at)}</small>`;

    if (String(lineData.id).startsWith('offline_')) {
        popupContent += `<br><span class="offline-badge">Hors ligne</span>`;
    }

    if (token && (currentUser === 'admin' || currentUser === lineData.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLine('${lineData.id}')">✏️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px; text-decoration:none;" onclick="deleteLine('${lineData.id}')">🗑️ Supprimer</button>`;
    }

    // Centered popup hack instead of bindPopup
    group.on('click', function(e) {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(popupContent)
          .openOn(map);
    });

    drawnLayers[lineData.id] = group;
    linesByData.push({ layer: group, data: lineData });
    if (!skipRefresh) {
        renderLegend();
        updateVisibility();
    }
};

function removeLineLocally(lineId, options = {}) {
    const skipRefresh = !!options.skipRefresh;
    if (drawnLayers[lineId]) {
        map.removeLayer(drawnLayers[lineId]);
        delete drawnLayers[lineId];
    }
    linesByData = linesByData.filter(i => !(String(i.data.id) === String(lineId) && !i.data.isLieu));
    if (!skipRefresh) {
        renderLegend();
        updateVisibility();
    }
}

function upsertLineLocally(lineData, options = {}) {
    const normalized = { ...lineData };
    if (typeof normalized.coordinates === 'string') {
        try { normalized.coordinates = JSON.parse(normalized.coordinates); } catch (e) {}
    }
    removeLineLocally(normalized.id, { skipRefresh: true });
    window.renderLineLocally(normalized, { skipRefresh: true });
    if (!options.skipRefresh) {
        renderLegend();
        updateVisibility();
    }
}

window.syncOfflineLines = async function() {
    if(offlineLinesQueue.length === 0 || !token) return;
    const backupLineQueue = [...offlineLinesQueue];
    offlineLinesQueue = [];
    localStorage.removeItem('offlineLines');

    let syncedAny = false;
    for (let line of backupLineQueue) {
        try {
            let res = await fetch('/api/lines', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(line)
            });
            if (res.ok) {
                syncedAny = true;
                // remove local temp layer
                if (drawnLayers[line.id]) {
                    map.removeLayer(drawnLayers[line.id]);
                    delete drawnLayers[line.id];
                    linesByData = linesByData.filter(i => i.data.id !== line.id);
                }
            } else {
                offlineLinesQueue.push(line);
            }
        } catch(e) {
            offlineLinesQueue.push(line);
        }
    }
    localStorage.setItem('offlineLines', JSON.stringify(offlineLinesQueue));
    if (syncedAny) {
        renderLegend();
        loadSavedLines(); // refresh
    }
}

function loadSavedLines() {
    fetch('/api/lines')
        .then(res => res.json())
        .then(data => {
            if (data.error) return;
            data.forEach(line => upsertLineLocally(line, { skipRefresh: true }));

            // apply offline lines
            const offlineLinesQueue = JSON.parse(localStorage.getItem('offlineLines') || '[]');
            offlineLinesQueue.forEach(lineData => {
                upsertLineLocally(lineData, { skipRefresh: true });
            });

            loadSavedLieux();
            renderLegend();
            updateVisibility();

            if (typeof startLinesAutoRefresh === 'function') {
                startLinesAutoRefresh();
            }
        });
}

let lineRefreshTimer = null;
let lastLineEventId = parseInt(localStorage.getItem('lastLineEventId') || '0', 10);
if (Number.isNaN(lastLineEventId)) lastLineEventId = 0;

async function refreshLineChanges() {
    if (!navigator.onLine || document.hidden) return;

    try {
        const res = await fetch(`/api/lines/changes?since=${lastLineEventId}&limit=150`);
        if (!res.ok) return;
        const payload = await res.json();
        const changes = payload.changes || [];
        if (changes.length === 0) return;

        changes.forEach(change => {
            if (change.type === 'delete') {
                removeLineLocally(change.lineId, { skipRefresh: true });
            } else if (change.type === 'upsert' && change.line) {
                upsertLineLocally(change.line, { skipRefresh: true });
            }
            if (change.eventId > lastLineEventId) lastLineEventId = change.eventId;
        });

        localStorage.setItem('lastLineEventId', String(lastLineEventId));
        renderLegend();
        updateVisibility();
    } catch (err) {
        // Keep polling on transient errors.
    }
}

window.startLinesAutoRefresh = function() {
    if (lineRefreshTimer) clearInterval(lineRefreshTimer);
    refreshLineChanges();
    lineRefreshTimer = setInterval(refreshLineChanges, 5000);
}

window.loadSavedLieux = function() {
    fetch('/api/lieux')
        .then(res => res.json())
        .then(data => {
            if (data.error) return;
            data.forEach(lieu => {
                if (!lieuxDitsLayers[lieu.id]) {
                    renderLieuDit(lieu);
                }
            });
        });
}

function renderLieuDit(lieu) {
    let iconChar = lieu.icon || '📌';
    let lieuIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style='font-size: 24px; text-shadow: 1px 1px 2px #fff;'>${iconChar}</div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -32]
    });

    let marker = L.marker([lieu.lat, lieu.lng], { icon: lieuIcon }).addTo(map);

    bindLieuPopup(marker, lieu);

    lieuxDitsLayers[lieu.id] = marker;

    let fakeData = { id: 'lieu_'+lieu.id, type: 'Lieux-dits', color: '#ffb300', isLieu: true, lieuData: lieu };
    linesByData.push({ layer: marker, data: fakeData });
    renderLegend();
    updateVisibility();
}

function bindLieuPopup(marker, lieu) {
    let iconChar = lieu.icon || '📌';
    let popupContent = `<strong>${iconChar} ${lieu.title}</strong><br><em>${lieu.description || ''}</em><br><small>Ajouté par ${lieu.username || 'Inconnu'} le ${formatTime(lieu.created_at)}</small>`;

    if (token && (currentUser === 'admin' || currentUser === lieu.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLieuDit('${lieu.id}')">✏️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px; text-decoration:none;" onclick="deleteLieuDit('${lieu.id}')">🗑️ Supprimer</button>`;
    }

    marker.bindPopup(popupContent);
}

function saveLieuDit(title, description, icon, lat, lng) {
    fetch('/api/lieux', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ title, description, icon, lat, lng })
    })
    .then(res => {
        if (!res.ok) throw new Error("Erreur de sauvegarde");
        return res.json();
    })
    .then(data => {
        let newLieu = { id: data.id, title, description, icon, lat, lng, username: currentUser, created_at: new Date() };
        renderLieuDit(newLieu);
    })
    .catch(err => alert("Erreur: " + err.message));
}

window.editLieuDit = function(lieuId) {
    let item = linesByData.find(i => i.data.isLieu && String(i.data.lieuData.id) === String(lieuId));
    if (!item) return;

    let lieu = item.data.lieuData;
    map.closePopup();

    customLieuPrompt("Modifier Lieu-dit", lieu.title, lieu.icon, lieu.description, (newTitle, newIcon, newDesc) => {
        if (!newTitle) return;
        fetch(`/api/lieux/${lieu.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ title: newTitle, description: newDesc, icon: newIcon })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Remove old marker
                if(lieuxDitsLayers[lieu.id]) {
                    map.removeLayer(lieuxDitsLayers[lieu.id]);
                }
                linesByData = linesByData.filter(i => !(i.data.isLieu && String(i.data.lieuData.id) === String(lieu.id)));

                // create updated marker
                lieu.title = newTitle;
                lieu.description = newDesc;
                lieu.icon = newIcon;

                renderLieuDit(lieu);
                lieuxDitsLayers[lieu.id].openPopup();
            }
        });
    });
}

window.deleteLieuDit = function(lieuId) {
    customConfirm("Supprimer ce lieu-dit ?", () => {
        fetch(`/api/lieux/${lieuId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(res => {
            if (res.ok) {
                if(lieuxDitsLayers[lieuId]) {
                    map.removeLayer(lieuxDitsLayers[lieuId]);
                    delete lieuxDitsLayers[lieuId];
                }
                linesByData = linesByData.filter(i => !(i.data.isLieu && String(i.data.lieuData.id) === String(lieuId)));
                renderLegend();
            }
        });
    });
}

window.editLine = function(lineId) {
    const item = linesByData.find(i => String(i.data.id) === String(lineId) && !i.data.isLieu);
    if (!item) return;

    const lineData = item.data;
    const owner = lineData.username;
    if (!token || !(currentUser === 'admin' || currentUser === owner)) return;

    const coords = typeof lineData.coordinates === 'string'
        ? JSON.parse(lineData.coordinates)
        : (lineData.coordinates || lineData.coords || []);

    currentLineCoords = [...coords];
    redoStack = [];

    const select = document.getElementById('draw-type');
    let found = false;
    for (let option of select.options) {
        try {
            const optVal = JSON.parse(option.value);
            if (optVal.type === lineData.type) {
                select.value = option.value;
                found = true;
                break;
            }
        } catch (e) {}
    }
    if (!found) {
        select.value = 'custom';
        document.getElementById('custom-draw-type').value = lineData.type || 'Autre';
        document.getElementById('custom-draw-color').value = lineData.color || '#ff9900';
    }

    if (!isDrawMode) toggleDrawMode();
    updateDrawColor();
    redrawCurrentLine();

    if (String(lineData.id).startsWith('offline_')) {
        offlineLinesQueue = offlineLinesQueue.filter(i => String(i.id) !== String(lineData.id));
        localStorage.setItem('offlineLines', JSON.stringify(offlineLinesQueue));
        removeLineLocally(lineData.id);
        map.closePopup();
        return;
    }

    fetch(`/api/lines/${lineData.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
    }).then(() => {
        removeLineLocally(lineData.id);
        map.closePopup();
    });
}

window.deleteLine = function(lineId) {
    customConfirm('Supprimer ce tracé réseau ?', () => {
        if (String(lineId).startsWith('offline_')) {
            offlineLinesQueue = offlineLinesQueue.filter(i => String(i.id) !== String(lineId));
            localStorage.setItem('offlineLines', JSON.stringify(offlineLinesQueue));
            removeLineLocally(lineId);
            map.closePopup();
            return;
        }

        fetch(`/api/lines/${lineId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(res => {
            if (res.ok) {
                removeLineLocally(lineId);
                map.closePopup();
            }
        });
    });
}

function bindLinePopup(layer, lineData) {
    let popupContent = `<strong>Réseau : ${lineData.type}</strong><br>Distance : ${lineData.distance} m<br><small>Tracé par ${lineData.username || 'Inconnu'} le ${formatTime(lineData.created_at)}</small>`;

    if (token && (currentUser === 'admin' || currentUser === lineData.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLine('${lineData.id}')">✏️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px;" onclick="deleteLine('${lineData.id}')">🗑️ Supprimer</button>`;
    }

    layer.on('click', function(e) {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(popupContent)
          .openOn(map);
    });
}
