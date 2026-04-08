function onMapClick(e) {
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

let isDrawCollapsed = false;
window.toggleDrawCollapse = function() {
    isDrawCollapsed = !isDrawCollapsed;
    document.getElementById('draw-content').style.display = isDrawCollapsed ? 'none' : 'block';
    document.getElementById('collapse-draw-btn').innerText = isDrawCollapsed ? '+' : '—';
}

let isLegendOpen = false;
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
    customConfirm(`Êtes-vous sûr de vouloir supprimer TOUTES les lignes de la catégorie "${type}" ?`, () => {
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
        let colorExample = linesByData.find(i => i.data.type === type)?.data.color || '#000';
        html += `
            <div class="legend-item">
                <label style="flex:1;">
                    <input type="checkbox" onchange="toggleCategory('${type}', this.checked)" ${!isTypeHidden ? 'checked' : ''}>
                    <span style="display:inline-block; width:12px; height:3px; background-color:${colorExample}; margin-right:5px;"></span>${type}
                </label>
        `;
        if (token && currentUser) {
            html += `<button class="btn icon-btn" style="color:red; font-size:12px; padding:2px;" onclick="deleteCategory('${type}')" title="Supprimer toutes les lignes">🗑️</button>`;
        }
        html += `</div>`;
    });

    legendContent.innerHTML = html;
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

window.renderLineLocally = function(lineData) {
    let coords = lineData.coordinates || lineData.coords || [];
    if(typeof coords === 'string') coords = JSON.parse(coords);

    let group = L.featureGroup().addTo(map);

    // Invisible wide polyline for easier clicking on mobile
    let invisibleLine = L.polyline(coords, {weight: 25, opacity: 0}).addTo(group);

    // Visible polyline
    let visibleLine = L.polyline(coords, {color: lineData.color, weight: 3}).addTo(group);

    let popupContent = `<strong>Réseau : ${lineData.type}</strong><br>Distance : ${lineData.distance} m<br><small>Tracé par ${lineData.username || 'Inconnu'} le ${formatTime(lineData.created_at)}</small>`;

    if (String(lineData.id).startsWith('offline_')) {
        popupContent += `<br><span class="offline-badge">Hors ligne</span>`;
    }

    if (token && (currentUser === 'admin' || currentUser === lineData.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLine('${lineData.id}')">🖍️ Modifier</button>`;
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
    renderLegend();
    updateVisibility();
};

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
            data.forEach(line => {
                try {
                    let coords = JSON.parse(line.coordinates);
                    let group = L.featureGroup().addTo(map);
                    L.polyline(coords, {weight: 20, opacity: 0}).addTo(group);
                    // Visible thin layer
                    L.polyline(coords, {color: line.color, weight: 3}).addTo(group);

                    bindLinePopup(group, line);
                    drawnLayers[line.id] = group;
                    linesByData.push({ layer: group, data: line });
                } catch(e) { }
            });

            // apply offline lines
            const offlineLinesQueue = JSON.parse(localStorage.getItem('offlineLines') || '[]');
            offlineLinesQueue.forEach(lineData => {
                window.renderLineLocally(lineData);
            });

            data.forEach(lineData => {
// Ensure we don't duplicate
                if (!drawnLayers[lineData.id]) {
                    window.renderLineLocally(lineData);
                }
            });

            renderLegend();
            updateVisibility();
        });
}

function bindLinePopup(layer, lineData) {
    let popupContent = `<strong>Réseau : ${lineData.type}</strong><br>Distance : ${lineData.distance} m<br><small>Tracé par ${lineData.username || 'Inconnu'} le ${formatTime(lineData.created_at)}</small>`;

    if (token && (currentUser === 'admin' || currentUser === lineData.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLine('${lineData.id}')">🖍️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px;" onclick="deleteLine('${lineData.id}')">🗑️ Supprimer</button>`;
    }

    layer.on('click', function(e) {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(popupContent)
          .openOn(map);
    });
}

window.editLine = function(lineId) {
    let item = linesByData.find(i => String(i.data.id) === String(lineId));
    if (!item) return;

    let lineData = item.data;
    let coords = typeof lineData.coordinates === 'string' ? JSON.parse(lineData.coordinates) : (lineData.coordinates || lineData.coords || []);

    currentLineCoords = [...coords];
    redoStack = [];

    // Copy properties to the drawer
    let select = document.getElementById('draw-type');
    let found = false;
    for (let option of select.options) {
        try {
            let optVal = JSON.parse(option.value);
            if (optVal.type === lineData.type) {
                select.value = option.value;
                found = true;
                break;
            }
        } catch(ex) {}
    }
    if (!found) {
        select.value = 'custom';
        document.getElementById('custom-draw-type').value = lineData.type;
        document.getElementById('custom-draw-color').value = lineData.color;
    }

    if (!isDrawMode) toggleDrawMode();
    updateDrawColor();
    redrawCurrentLine();

    // Delete old line physically and from DB, waiting to be saved
    if (String(lineData.id).startsWith('offline_')) {
        offlineLinesQueue = offlineLinesQueue.filter(i => i.id !== lineData.id);
        localStorage.setItem('offlineLines', JSON.stringify(offlineLinesQueue));
    } else {
        fetch(`/api/lines/${lineData.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
    }

    if (drawnLayers[lineData.id]) {
        map.removeLayer(drawnLayers[lineData.id]);
        delete drawnLayers[lineData.id];
    }
    linesByData = linesByData.filter(i => i.data.id !== lineData.id);
    renderLegend();
    map.closePopup();
}

window.deleteLine = function(lineId) {
    customConfirm("Supprimer ce tracé réseau ?", () => {
        fetch(`/api/lines/${lineId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(res => {
            if (res.ok) {
                if(drawnLayers[lineId]) {
                    map.removeLayer(drawnLayers[lineId]);
                    delete drawnLayers[lineId];
                }
                linesByData = linesByData.filter(i => i.data.id !== lineId);
                renderLegend();
                map.closePopup();
            }
        });
    });
}

