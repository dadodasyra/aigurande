function onMapClick(e) {
    if (typeof isLieuMode !== 'undefined' && isLieuMode) {
        customLieuPrompt("Nouveau Lieu-dit", "", "📌", "", (title, icon, description) => {
            if (!title) return;
            saveLieuDit(title, description, icon, e.latlng.lat, e.latlng.lng);
            cancelLieuMode();
        });
        return;
    }

    if (isSurfaceMode) {
        currentSurfaceCoords.push([e.latlng.lat, e.latlng.lng]);
        surfaceRedoStack = [];
        redrawCurrentSurface();
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

window.undoSurfacePoint = function() {
    if (!isSurfaceMode || currentSurfaceCoords.length === 0) return;
    surfaceRedoStack.push(currentSurfaceCoords.pop());
    redrawCurrentSurface();
}

window.redoSurfacePoint = function() {
    if (!isSurfaceMode || surfaceRedoStack.length === 0) return;
    currentSurfaceCoords.push(surfaceRedoStack.pop());
    redrawCurrentSurface();
}

function redrawCurrentSurface() {
    if (currentSurfaceLayer) {
        map.removeLayer(currentSurfaceLayer);
    }
    if (currentSurfaceCoords.length > 0) {
        currentSurfaceLayer = L.polygon(currentSurfaceCoords, {
            color: currentSurfaceColor,
            fillColor: currentSurfaceColor,
            fillOpacity: 0.4,
            weight: 2
        }).addTo(map);
    }
}

window.updateSurfaceColor = function() {
    let select = document.getElementById('surface-category');
    let customInputs = document.getElementById('custom-surface-inputs');
    if (!select) return;

    if (select.value === 'custom') {
        customInputs.style.display = 'flex';
        let customType = document.getElementById('custom-surface-type').value || 'Autre';
        let customColor = document.getElementById('custom-surface-color').value;
        currentSurfaceType = customType;
        currentSurfaceColor = customColor;
    } else {
        customInputs.style.display = 'none';
        try {
            let val = JSON.parse(select.value);
            currentSurfaceColor = val.color;
            currentSurfaceType = val.type;
        } catch (e) {}
    }

    if (currentSurfaceLayer) {
        currentSurfaceLayer.setStyle({ color: currentSurfaceColor, fillColor: currentSurfaceColor });
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

window.toggleSurfaceMode = function() {
    isSurfaceMode = !isSurfaceMode;
    const overlay = document.getElementById('surface-overlay');
    const surfaceBtn = document.getElementById('surface-btn');

    if (isSurfaceMode) {
        overlay.classList.remove('hidden');
        surfaceBtn.classList.add('active-mode');
        if (isDrawMode) cancelDraw();
        if (isLieuMode) cancelLieuMode();
        if (typeof closePanel === 'function') closePanel();
    } else {
        cancelSurface();
    }
}

window.cancelSurface = function() {
    if (currentSurfaceCoords.length > 0 || editingSurfaceData) {
        customConfirm("Êtes-vous sûr de vouloir annuler la zone en cours ?", () => {
            executeCancelSurface();
        });
    } else {
        executeCancelSurface();
    }
}

function executeCancelSurface() {
    isSurfaceMode = false;
    document.getElementById('surface-overlay').classList.add('hidden');
    document.getElementById('surface-btn').classList.remove('active-mode');

    if (currentSurfaceLayer) {
        map.removeLayer(currentSurfaceLayer);
    }

    if (editingSurfaceData) {
        if (drawnSurfaces[editingSurfaceData.id] && !map.hasLayer(drawnSurfaces[editingSurfaceData.id])) {
            map.addLayer(drawnSurfaces[editingSurfaceData.id]);
            upsertSurfaceLocally(editingSurfaceData);
        }
        editingSurfaceData = null;
    }

    currentSurfaceLayer = null;
    currentSurfaceCoords = [];
    surfaceRedoStack = [];
    document.getElementById('surface-name').value = '';
}

let isSurfaceCollapsed = false;
window.toggleSurfaceCollapse = function() {
    isSurfaceCollapsed = !isSurfaceCollapsed;
    document.getElementById('surface-content').style.display = isSurfaceCollapsed ? 'none' : 'block';
    document.getElementById('collapse-surface-btn').innerText = isSurfaceCollapsed ? '+' : '—';
}

window.saveSurface = function() {
    if (currentSurfaceCoords.length < 3) {
        customConfirm("Erreur: Veuillez tracer au moins 3 points pour sauvegarder une zone.", () => {});
        return;
    }

    let surfaceName = document.getElementById('surface-name').value.trim() || 'Sans nom';

    let surfaceDataObj = {
        name: surfaceName,
        color: currentSurfaceColor,
        category: currentSurfaceType,
        coordinates: currentSurfaceCoords
    };

    if (!navigator.onLine) {
        clientLog("Zone sauvegardée hors ligne.");

        if (editingSurfaceData) {
            if (String(editingSurfaceData.id).startsWith('offline_')) {
                offlineSurfacesQueue = offlineSurfacesQueue.filter(i => String(i.id) !== String(editingSurfaceData.id));
            }
            removeSurfaceLocally(editingSurfaceData.id);
            editingSurfaceData = null;
        }

        let tempId = 'offline_' + Date.now();
        surfaceDataObj.id = tempId;
        surfaceDataObj.username = currentUser;
        surfaceDataObj.created_at = new Date().toISOString();

        offlineSurfacesQueue.push(surfaceDataObj);
        localStorage.setItem('offlineSurfaces', JSON.stringify(offlineSurfacesQueue));

        window.renderSurfaceLocally(surfaceDataObj);
        executeCancelSurface();
        return;
    }

    let savePromise;

    if (editingSurfaceData) {
        let oldId = editingSurfaceData.id;
        if (String(oldId).startsWith('offline_')) {
            offlineSurfacesQueue = offlineSurfacesQueue.filter(i => String(i.id) !== String(oldId));
            localStorage.setItem('offlineSurfaces', JSON.stringify(offlineSurfacesQueue));
            removeSurfaceLocally(oldId);
            savePromise = Promise.resolve();
        } else {
            savePromise = fetch(`/api/surfaces/${oldId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            }).then(() => {
                removeSurfaceLocally(oldId);
            });
        }
    } else {
        savePromise = Promise.resolve();
    }

    savePromise.then(() => {
        fetch(window.BASE_PATH + '/api/surfaces', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(surfaceDataObj)
        })
        .then(res => {
            if (!res.ok) throw new Error("Could not save surface");
            return res.json();
        })
        .then(data => {
            let newData = { id: data.id, name: surfaceName, category: currentSurfaceType, username: currentUser, created_at: new Date(), coords: currentSurfaceCoords, color: currentSurfaceColor };
            window.renderSurfaceLocally(newData);
            editingSurfaceData = null;
            executeCancelSurface();
        })
        .catch(err => {
            alert("Erreur de sauvegarde zone: " + err.message);
            editingSurfaceData = null;
            executeCancelSurface();
        });
    });
}

function toggleDrawMode() {
    isDrawMode = !isDrawMode;
    const overlay = document.getElementById('draw-overlay');
    const drawBtn = document.getElementById('draw-btn');

    if (isDrawMode) {
        overlay.classList.remove('hidden');
        drawBtn.classList.add('active-mode');
        if (isLieuMode) cancelLieuMode();
        if (isSurfaceMode) cancelSurface();
        if (typeof closePanel === 'function') closePanel();
    } else {
        cancelDraw();
    }
}

function cancelDraw() {
    if (currentLineCoords.length > 0 || editingLineData) {
        customConfirm("Êtes-vous sûr de vouloir annuler le tracé en cours ? Les modifications seront perdues.", () => {
            executeCancelDraw();
        });
    } else {
        executeCancelDraw();
    }
}

function executeCancelDraw() {
    isDrawMode = false;
    document.getElementById('draw-overlay').classList.add('hidden');
    document.getElementById('draw-btn').classList.remove('active-mode');
    if (currentLineLayer) {
        map.removeLayer(currentLineLayer);
    }

    // Rétablir la ligne d'origine si on était en édition
    if (editingLineData) {
        if (drawnLayers[editingLineData.id] && !map.hasLayer(drawnLayers[editingLineData.id])) {
            map.addLayer(drawnLayers[editingLineData.id]);
            upsertLineLocally(editingLineData); // Force réaffichage visuel correct
        }
        editingLineData = null;
    }

    currentLineLayer = null;
    currentLineCoords = [];
    redoStack = [];
    document.getElementById('draw-distance').innerText = '0';
}

let isSurfaceMode = false;
let currentSurfaceCoords = [];
let currentSurfaceLayer = null;
let currentSurfaceColor = 'red';
let currentSurfaceType = 'Danger';
let surfaceRedoStack = [];
let editingSurfaceData = null;
let drawnSurfaces = {};
let offlineSurfacesQueue = JSON.parse(localStorage.getItem('offlineSurfaces') || '[]');

let isLieuMode = false;
let lieuxDitsLayers = {};

window.toggleLieuMode = function() {
    isLieuMode = !isLieuMode;
    const lieuBtn = document.getElementById('lieu-btn');

    if (isLieuMode) {
        lieuBtn.classList.add('active-mode');
        if (isDrawMode) cancelDraw();
        if (isSurfaceMode) cancelSurface();
        closePanel();
    } else {
        cancelLieuMode();
    }
}

window.cancelLieuMode = function() {
    isLieuMode = false;
    const lieuBtn = document.getElementById('lieu-btn');
    if (lieuBtn) lieuBtn.classList.remove('active-mode');
}

document.addEventListener('keydown', function(e) {
    if (isDrawMode) {
        if (e.key === 'Escape') {
            cancelDraw();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (typeof saveLine === 'function') {
                saveLine();
            }
        }
    } else if (isSurfaceMode) {
        if (e.key === 'Escape') {
            cancelSurface();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (typeof saveSurface === 'function') {
                saveSurface();
            }
        }
    }
});

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
        // Fermer le conteneur des calques s'il est ouvert pour éviter la superposition
        if (typeof layersControl !== 'undefined' && layersControl) {
            layersControl.collapse();
        }
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
    const btn = document.getElementById('catalog-btn');
    if (isCatalogOpen) {
        if (btn) btn.classList.add('active-mode');
        overlay.classList.remove('hidden');
        renderCatalog();
    } else {
        if (btn) btn.classList.remove('active-mode');
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
        localStorage.setItem('isParcelsHidden', isParcelsHidden ? '1' : '0');
    } else {
        if (isVisible) hiddenCategories.delete(type);
        else hiddenCategories.add(type);
        localStorage.setItem('hiddenCategories', JSON.stringify(Array.from(hiddenCategories)));
    }
    updateVisibility();
    renderLegend(); // update master checkboxes
}

window.toggleCategoryGroup = function(groupPrefix, typesString, isVisible) {
    const types = typesString.split(',');
    types.forEach(type => {
        if (isVisible) hiddenCategories.delete(type);
        else hiddenCategories.add(type);
    });
    localStorage.setItem('hiddenCategories', JSON.stringify(Array.from(hiddenCategories)));
    updateVisibility();
    renderLegend();
}

window.deleteCategory = function(type) {
    customConfirm(`Êtes-vous sûr de vouloir supprimer TOUTES les données de la catégorie "${type}" ?`, () => {
        if (type.startsWith('Lieux-dits')) {
            let idsToDelete = linesByData.filter(i => i.data.type === type).map(i => i.data.lieuData.id);
            Promise.all(idsToDelete.map(id => fetch(`/api/lieux/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            }))).then(() => {
                idsToDelete.forEach(id => {
                    if(lieuxDitsLayers[id]) {
                        map.removeLayer(lieuxDitsLayers[id]);
                        delete lieuxDitsLayers[id];
                    }
                });
                linesByData = linesByData.filter(i => i.data.type !== type);
                renderLegend();
            }).catch(err => alert("Erreur lors de la suppression."));
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

window.copyLegendLink = function() {
    const params = new URLSearchParams();
    if (hiddenCategories.size > 0) {
        params.set('hidden', Array.from(hiddenCategories).map(encodeURIComponent).join(','));
    }
    if (isParcelsHidden) {
        params.set('parcels', '1');
    }
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('share-legend-btn');
        if(btn) {
            btn.innerHTML = '✅';
            setTimeout(() => { btn.innerHTML = '🔗'; }, 2000);
        }
    });
};

let legendExpandedGroups = {
    'lieux': false,
    'zones': false,
    'lignes': false
};

window.toggleLegendGroup = function(group) {
    legendExpandedGroups[group] = !legendExpandedGroups[group];
    renderLegend();
};

function getCommonPrefix(strings) {
    // If only one, return it
    if (strings.length === 1) return strings[0];
    if (strings.length === 0) return '';
    // Sort strings
    const sorted = strings.slice().sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    let i = 0;
    while(i < first.length && first.charAt(i) === last.charAt(i)) i++;
    let prefix = first.substring(0, i).trim();
    // If prefix is too short, just return the first one or original fallback
    return prefix.length > 2 ? prefix : '';
}

window.renderLegend = function() {
    const legendContent = document.getElementById('legend-content');

    let html = `
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size:16px;">Légende</strong>
            <button id="share-legend-btn" class="btn icon-btn" style="font-size:16px; padding:2px; margin:0;" onclick="copyLegendLink()" title="Copier le lien avec l'état de la légende">🔗</button>
        </div>
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

    const allTypes = [...new Set(linesByData.map(item => item.data.type))];

    // Group types
    const groups = {
        'lieux': { label: 'Lieux-dits', bg: '#f0f8ff', types: [], icon: '📌' },
        'zones': { label: 'Zones', bg: '#fff0f5', types: [], icon: '🟦' },
        'lignes': { label: 'Lignes', bg: '#f5fffa', types: [], icon: '〰️' }
    };

    allTypes.forEach(t => {
        if (t.startsWith('Lieux-dits')) groups.lieux.types.push(t);
        else if (t.startsWith('Zone: ')) groups.zones.types.push(t);
        else groups.lignes.types.push(t);
    });

    Object.keys(groups).forEach(gKey => {
        const group = groups[gKey];
        if (group.types.length === 0) return;

        let hiddenCount = group.types.filter(t => hiddenCategories.has(t)).length;
        let allChecked = hiddenCount === 0;
        let isExpanded = legendExpandedGroups[gKey];

        html += `
            <div style="background:${group.bg}; border-radius:6px; padding:6px; margin-bottom:6px; border:1px solid #ddd;">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <label style="flex:1; font-weight:bold; margin-bottom:0;">
                        <input type="checkbox" onchange="toggleCategoryGroup('${gKey}', '${group.types.join(',')}', this.checked)" ${allChecked ? 'checked' : ''}>
                        ${group.icon} ${group.label}
                    </label>
                    <button class="btn btn-small" style="padding:2px 6px; font-size:12px; margin-left:8px;" onclick="toggleLegendGroup('${gKey}')">
                        ${isExpanded ? '▲' : '▼'}
                    </button>
                </div>
        `;

        if (isExpanded) {
            html += `<div style="margin-top:6px; margin-left:14px; padding-left:10px; border-left:2px solid #ccc;">`;
            group.types.forEach(type => {
                let isTypeHidden = hiddenCategories.has(type);
                let prefix = '';
                let label = type;

                if (type.startsWith('Lieux-dits')) {
                    let iconOnly = type.replace('Lieux-dits ', '');
                    prefix = `<span style="display:inline-block; font-size:16px; margin-right:5px;">${iconOnly}</span>`;

                    // Extraire le nom
                    let lieuxOfType = linesByData.filter(i => i.data.type === type && i.data.lieuData).map(i => i.data.lieuData.title || '');
                    let commonName = getCommonPrefix(lieuxOfType);
                    if (!commonName) commonName = 'Lieux-dits';
                    label = commonName;

                } else if (type.startsWith('Zone: ')) {
                    let colorExample = linesByData.find(i => i.data.type === type)?.data.color || '#000';
                    prefix = `<span style="display:inline-block; width:14px; height:14px; background-color:${colorExample}; margin-right:5px; opacity:0.6; border:1px solid ${colorExample}"></span>`;
                    label = type.replace('Zone: ', '');
                } else {
                    let colorExample = linesByData.find(i => i.data.type === type)?.data.color || '#000';
                    prefix = `<span style="display:inline-block; width:12px; height:3px; background-color:${colorExample}; margin-right:5px;"></span>`;
                }

                html += `
                    <div class="legend-item" style="margin-bottom:4px; padding:2px 0;">
                        <label style="flex:1;">
                            <input type="checkbox" onchange="toggleCategory('${type}', this.checked)" ${!isTypeHidden ? 'checked' : ''}>
                            ${prefix}${label}
                        </label>
                `;
                if (token && currentUser) {
                    html += `<button class="btn icon-btn" style="color:red; font-size:12px; padding:2px;" onclick="deleteCategory('${type}')" title="Supprimer tout">🗑️</button>`;
                }
                html += `</div>`;
            });
            html += `</div>`;
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
    html += `<button class="btn btn-small" style="width:100%; margin-top:8px;" onclick="exportCatalogMode('lieux')">Exporter JSON</button>`;
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
        coordinates: currentLineCoords,
        distance: totalDistance
    };

    if (!navigator.onLine) {
        clientLog("Ligne sauvegardée hors ligne.");

        if (editingLineData) {
            // Suppression hors ligne de l'ancienne
            if (String(editingLineData.id).startsWith('offline_')) {
                offlineLinesQueue = offlineLinesQueue.filter(i => String(i.id) !== String(editingLineData.id));
            } else {
                // TODO: Offline deletion of online element is complex, we just discard the old one locally.
                // It would reappear on reload, but this is a lightweight offline fix.
            }
            removeLineLocally(editingLineData.id);
            editingLineData = null;
        }

        let tempId = 'offline_' + Date.now();
        lineDataObj.id = tempId;
        lineDataObj.username = currentUser;
        lineDataObj.created_at = new Date().toISOString();

        offlineLinesQueue.push(lineDataObj);
        localStorage.setItem('offlineLines', JSON.stringify(offlineLinesQueue));

        window.renderLineLocally(lineDataObj);
        executeCancelDraw();
        return;
    }

    let savePromise;

    if (editingLineData) {
        // En édition: supprimer d'abord l'ancienne
        let oldId = editingLineData.id;
        if (String(oldId).startsWith('offline_')) {
            offlineLinesQueue = offlineLinesQueue.filter(i => String(i.id) !== String(oldId));
            localStorage.setItem('offlineLines', JSON.stringify(offlineLinesQueue));
            removeLineLocally(oldId);
            savePromise = Promise.resolve();
        } else {
            savePromise = fetch(`/api/lines/${oldId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            }).then(() => {
                removeLineLocally(oldId);
            });
        }
    } else {
        savePromise = Promise.resolve();
    }

    savePromise.then(() => {
        fetch(window.BASE_PATH + '/api/lines', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(lineDataObj)
        })
        .then(res => {
            if (!res.ok) throw new Error("Could not save line");
            return res.json();
        })
        .then(data => {
            clientLog(`Line saved with ID ${data.id}`);
            let group = L.featureGroup().addTo(map);
            L.polyline(currentLineCoords, {weight: 20, opacity: 0}).addTo(group);
            L.polyline(currentLineCoords, {color: currentDrawColor, weight: 3}).addTo(group);

            let newData = { id: data.id, distance: totalDistance, type: currentDrawType, username: currentUser, created_at: new Date(), coords: currentLineCoords, color: currentDrawColor };
            bindLinePopup(group, newData);

            drawnLayers[data.id] = group;
            linesByData.push({ layer: group, data: newData });
            renderLegend();
            updateVisibility();
            editingLineData = null;
            executeCancelDraw();
        })
        .catch(err => {
            alert("Erreur de sauvegarde réseau: " + err.message);
            editingLineData = null;
            executeCancelDraw();
        });
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

    let popupContent = `<strong>Réseau : ${lineData.type}</strong><br>Distance : ${lineData.distance} m<br><small>Tracé par ${lineData.username || 'Inconnu'} le ${formatCommentDate(lineData.created_at)}</small>`;
    popupContent += `<br><button class="btn btn-small" style="margin-top:5px; margin-right:5px;" onclick="openCommentsModal('line','${lineData.id}','Ligne #${lineData.id}')">💬 Commentaires</button>`;

    if (String(lineData.id).startsWith('offline_')) {
        popupContent += `<br><span class="offline-badge">Hors ligne</span>`;
    }

    if (token && (currentUser === 'admin' || currentUser === lineData.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLine('${lineData.id}')">✏️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px; text-decoration:none;" onclick="deleteLine('${lineData.id}')">🗑️ Supprimer</button>`;
    }

    // Centered popup hack instead of bindPopup
    group.on('click', function(e) {
        if (isDrawMode || isLieuMode || isSurfaceMode) {
            if (typeof onMapClick === 'function') onMapClick({latlng: e.latlng});
            return;
        }
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
            let res = await fetch(window.BASE_PATH + '/api/lines', {
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
    fetch(window.BASE_PATH + '/api/lines')
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
            loadSavedSurfaces();
            renderLegend();
            updateVisibility();

            if (typeof startLinesAutoRefresh === 'function') {
                startLinesAutoRefresh();
            }
        });
}

window.loadSavedSurfaces = function() {
    fetch(window.BASE_PATH + '/api/surfaces')
        .then(res => res.json())
        .then(data => {
            if (data.error) return;
            data.forEach(surface => upsertSurfaceLocally(surface, { skipRefresh: true }));

            const offlineQueue = JSON.parse(localStorage.getItem('offlineSurfaces') || '[]');
            offlineQueue.forEach(surface => upsertSurfaceLocally(surface, { skipRefresh: true }));

            renderLegend();
            updateVisibility();

            if (typeof startSurfacesAutoRefresh === 'function') {
                startSurfacesAutoRefresh();
            }
        });
}

window.syncOfflineSurfaces = async function() {
    if(offlineSurfacesQueue.length === 0 || !token) return;
    const backupQueue = [...offlineSurfacesQueue];
    offlineSurfacesQueue = [];
    localStorage.removeItem('offlineSurfaces');

    let syncedAny = false;
    for (let surface of backupQueue) {
        try {
            let res = await fetch(window.BASE_PATH + '/api/surfaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(surface)
            });
            if (res.ok) {
                syncedAny = true;
                if (drawnSurfaces[surface.id]) {
                    map.removeLayer(drawnSurfaces[surface.id]);
                    delete drawnSurfaces[surface.id];
                    linesByData = linesByData.filter(i => i.data.id !== surface.id);
                }
            } else {
                offlineSurfacesQueue.push(surface);
            }
        } catch(e) {
            offlineSurfacesQueue.push(surface);
        }
    }
    localStorage.setItem('offlineSurfaces', JSON.stringify(offlineSurfacesQueue));
    if (syncedAny) {
        renderLegend();
        loadSavedSurfaces();
    }
}

let surfaceRefreshTimer = null;
let lastSurfaceEventId = parseInt(localStorage.getItem('lastSurfaceEventId') || '0', 10);
if (Number.isNaN(lastSurfaceEventId)) lastSurfaceEventId = 0;

async function refreshSurfaceChanges() {
    if (!navigator.onLine || document.hidden) return;

    try {
        const res = await fetch(`/api/surfaces/changes?since=${lastSurfaceEventId}&limit=150`);
        if (!res.ok) return;
        const payload = await res.json();
        const changes = payload.changes || [];
        if (changes.length === 0) return;

        changes.forEach(change => {
            if (change.type === 'delete') {
                removeSurfaceLocally(change.surfaceId, { skipRefresh: true });
            } else if (change.type === 'upsert' && change.surface) {
                upsertSurfaceLocally(change.surface, { skipRefresh: true });
            }
            if (change.eventId > lastSurfaceEventId) lastSurfaceEventId = change.eventId;
        });

        localStorage.setItem('lastSurfaceEventId', String(lastSurfaceEventId));
        renderLegend();
        updateVisibility();
    } catch (err) {}
}

window.startSurfacesAutoRefresh = function() {
    if (surfaceRefreshTimer) clearInterval(surfaceRefreshTimer);
    refreshSurfaceChanges();
    surfaceRefreshTimer = setInterval(refreshSurfaceChanges, 5000);
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
    fetch(window.BASE_PATH + '/api/lieux')
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
        html: `<div style='display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 24px; text-shadow: 1px 1px 2px #fff; margin: 0; padding: 0;'>${iconChar}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });

    let marker = L.marker([lieu.lat, lieu.lng], { icon: lieuIcon }).addTo(map);

    bindLieuPopup(marker, lieu);

    lieuxDitsLayers[lieu.id] = marker;

    let typeStr = 'Lieux-dits ' + iconChar;
    let fakeData = { id: 'lieu_'+lieu.id, type: typeStr, color: '#ffb300', isLieu: true, lieuData: lieu };
    linesByData.push({ layer: marker, data: fakeData });
    renderLegend();
    updateVisibility();
}

function bindLieuPopup(marker, lieu) {
    let iconChar = lieu.icon || '📌';
    let popupContent = `<strong>${iconChar} ${lieu.title}</strong><br><em>${lieu.description || ''}</em><br><small>Ajouté par ${lieu.username || 'Inconnu'} le ${formatCommentDate(lieu.created_at)}</small>`;
    popupContent += `<br><button class="btn btn-small" style="margin-top:5px; margin-right:5px;" onclick="openCommentsModal('lieu','${lieu.id}','Lieu-dit #${lieu.id}')">💬 Commentaires</button>`;

    if (token && (currentUser === 'admin' || currentUser === lieu.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLieuDit('${lieu.id}')">✏️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px; text-decoration:none;" onclick="deleteLieuDit('${lieu.id}')">🗑️ Supprimer</button>`;
    }

    marker.on('click', function(e) {
        if (isDrawMode || isLieuMode || isSurfaceMode) {
            let targetLatLng = marker.getLatLng ? marker.getLatLng() : e.latlng;
            if (typeof onMapClick === 'function') onMapClick({latlng: targetLatLng});
            return;
        }
        L.popup()
          .setLatLng(e.latlng)
          .setContent(popupContent)
          .openOn(map);
    });
}

function saveLieuDit(title, description, icon, lat, lng) {
    fetch(window.BASE_PATH + '/api/lieux', {
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
                map.closePopup();
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

    editingLineData = lineData;

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

    // Masquer visuellement l'ancienne ligne pendant l'édition
    if (drawnLayers[lineData.id]) {
        map.removeLayer(drawnLayers[lineData.id]);
    }
    map.closePopup();
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
    let popupContent = `<strong>Réseau : ${lineData.type}</strong><br>Distance : ${lineData.distance} m<br><small>Tracé par ${lineData.username || 'Inconnu'} le ${formatCommentDate(lineData.created_at)}</small>`;
    popupContent += `<br><button class="btn btn-small" style="margin-top:5px; margin-right:5px;" onclick="openCommentsModal('line','${lineData.id}','Ligne #${lineData.id}')">💬 Commentaires</button>`;

    if (token && (currentUser === 'admin' || currentUser === lineData.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editLine('${lineData.id}')">✏️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px;" onclick="deleteLine('${lineData.id}')">🗑️ Supprimer</button>`;
    }

    layer.on('click', function(e) {
        if (isDrawMode || isLieuMode || isSurfaceMode) {
            if (typeof onMapClick === 'function') onMapClick({latlng: e.latlng});
            return;
        }
        L.popup()
          .setLatLng(e.latlng)
          .setContent(popupContent)
          .openOn(map);
    });
}

// ...existing code...
window.renderSurfaceLocally = function(surfaceData, options = {}) {
    const skipRefresh = !!options.skipRefresh;
    let coords = surfaceData.coordinates || surfaceData.coords || [];
    if (typeof coords === 'string') {
        try { coords = JSON.parse(coords); } catch(e) { coords = []; }
    }

    if (coords.length < 3) return;

    let polygon = L.polygon(coords, {
        color: surfaceData.color || 'red',
        fillColor: surfaceData.color || 'red',
        fillOpacity: 0.4,
        weight: 2
    }).addTo(map);

    let area = 0;
    if (coords.length > 2) {
        // Calculation of polygon area on a sphere
        for (let i = 0; i < coords.length; i++) {
            let p1 = coords[i];
            let p2 = coords[(i + 1) % coords.length];
            let lng1 = p1[1] || p1.lng;
            let lat1 = p1[0] || p1.lat;
            let lng2 = p2[1] || p2.lng;
            let lat2 = p2[0] || p2.lat;

            area += (lng2 - lng1) * Math.PI / 180 *
                    (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
        }
        area = Math.abs(area * 6378137.0 * 6378137.0 / 2.0);
    }

    let title = surfaceData.name || 'Zone sans nom';
    let cat = surfaceData.category || 'Danger';

    let popupContent = `<strong>Zone : ${cat}</strong><br>Nom : ${title}<br>Surface : ${(area / 10000).toFixed(2)} ha<br><small>Tracé par ${surfaceData.username || 'Inconnu'} le ${formatCommentDate(surfaceData.created_at)}</small>`;
    popupContent += `<br><button class="btn btn-small" style="margin-top:5px; margin-right:5px;" onclick="openCommentsModal('surface','${surfaceData.id}','Zone #${surfaceData.id}')">💬 Commentaires</button>`;

    // Add Rating UI wrapper
    popupContent += `<div id="rating-container-surface-${surfaceData.id}" style="margin-top:10px; display:flex; align-items:center; gap:5px;"><strong style="font-size:12px;">Évaluation Globale :</strong></div>`;

    if (String(surfaceData.id).startsWith('offline_')) {
        popupContent += `<br><span class="offline-badge">Hors ligne</span>`;
    }

    if (token && (currentUser === 'admin' || currentUser === surfaceData.username)) {
        popupContent += `<br><button class="btn btn-small" style="background:#ccffcc; color:#005500; margin-top:5px; margin-right:5px; text-decoration:none;" onclick="editSurface('${surfaceData.id}')">✏️ Modifier</button>`;
        popupContent += `<button class="btn btn-small" style="background:#ffcccc; color:red; margin-top:5px; text-decoration:none;" onclick="deleteSurface('${surfaceData.id}')">🗑️ Supprimer</button>`;
    }

    let group = L.featureGroup([polygon]).addTo(map);

    let maxDist = 0;
    let angle = 0;
    for(let i=0; i<coords.length; i++) {
        let p1 = coords[i];
        let p2 = coords[(i+1)%coords.length];

        let point1 = map.project(p1, map.getMaxZoom());
        let point2 = map.project(p2, map.getMaxZoom());

        let dx = point2.x - point1.x;
        let dy = point2.y - point1.y;
        let dist = dx*dx + dy*dy;
        if(dist > maxDist) {
            maxDist = dist;
            angle = Math.atan2(dy, dx) * 180 / Math.PI;
        }
    }

    if (angle > 90 || angle < -90) {
        angle += 180;
    }

    let labelIcon = L.divIcon({
        className: 'surface-label-icon',
        html: `<div style="position:absolute; left:0; top:0; transform: translate(-50%, -50%); pointer-events:none;"><div style="transition: transform 0.25s cubic-bezier(0,0,0.25,1); transform: rotate(${angle}deg) scale(var(--map-zoom-scale, 1)); transform-origin: center center; color: ${surfaceData.color || 'red'}; opacity: 0.8; font-weight: bold; text-shadow: 1px 1px 0px rgba(255,255,255,0.7), -1px -1px 0px rgba(255,255,255,0.7), 1px -1px 0px rgba(255,255,255,0.7), -1px 1px 0px rgba(255,255,255,0.7); font-size: 16px; filter: brightness(0.6); pointer-events: none; white-space: nowrap;">${title}</div></div>`,
        iconSize: [0, 0]
    });
    
    L.marker(polygon.getBounds().getCenter(), {icon: labelIcon, interactive: false}).addTo(group);

    polygon.on('click', function(e) {
        if (isDrawMode || isSurfaceMode || isLieuMode) {
            if (typeof onMapClick === 'function') onMapClick({latlng: e.latlng});
            return;
        }
        L.popup()
          .setLatLng(e.latlng)
          .setContent(popupContent)
          .openOn(map);

        // Load the rating *after* the popup opens because the DOM element needs to exist
        setTimeout(() => {
            if (typeof loadGlobalRating === 'function') {
                loadGlobalRating('surface:' + surfaceData.id, 'rating-container-surface-' + surfaceData.id);
            }
        }, 50);
    });

    drawnSurfaces[surfaceData.id] = group;
    linesByData.push({ layer: group, data: { ...surfaceData, type: `Zone: ${cat}`, isSurface: true } });

    if (!skipRefresh) {
        renderLegend();
        updateVisibility();
    }
}

function removeSurfaceLocally(surfaceId, options = {}) {
    const skipRefresh = !!options.skipRefresh;
    if (drawnSurfaces[surfaceId]) {
        map.removeLayer(drawnSurfaces[surfaceId]);
        delete drawnSurfaces[surfaceId];
    }
    linesByData = linesByData.filter(i => !(i.data.isSurface && String(i.data.id) === String(surfaceId)));
    if (!skipRefresh) {
        renderLegend();
        updateVisibility();
    }
}

function upsertSurfaceLocally(surfaceData, options = {}) {
    const normalized = { ...surfaceData };
    if (typeof normalized.coordinates === 'string') {
        try { normalized.coordinates = JSON.parse(normalized.coordinates); } catch (e) {}
    }
    removeSurfaceLocally(normalized.id, { skipRefresh: true });
    window.renderSurfaceLocally(normalized, { skipRefresh: true });
    if (!options.skipRefresh) {
        renderLegend();
        updateVisibility();
    }
}

window.editSurface = function(surfaceId) {
    const item = linesByData.find(i => i.data.isSurface && String(i.data.id) === String(surfaceId));
    if (!item) return;

    const surfaceData = item.data;
    if (!token || !(currentUser === 'admin' || currentUser === surfaceData.username)) return;

    editingSurfaceData = surfaceData;

    const coords = typeof surfaceData.coordinates === 'string'
        ? JSON.parse(surfaceData.coordinates)
        : (surfaceData.coordinates || surfaceData.coords || []);

    currentSurfaceCoords = [...coords];
    surfaceRedoStack = [];

    document.getElementById('surface-name').value = surfaceData.name || '';

    const select = document.getElementById('surface-category');
    let found = false;
    for (let option of select.options) {
        try {
            const optVal = JSON.parse(option.value);
            if (optVal.type === surfaceData.category) {
                select.value = option.value;
                found = true;
                break;
            }
        } catch (e) {}
    }
    if (!found) {
        select.value = 'custom';
        document.getElementById('custom-surface-type').value = surfaceData.category || 'Autre';
        document.getElementById('custom-surface-color').value = surfaceData.color || '#ff9900';
    }

    if (!isSurfaceMode) toggleSurfaceMode();
    window.updateSurfaceColor();
    redrawCurrentSurface();

    if (drawnSurfaces[surfaceData.id]) {
        map.removeLayer(drawnSurfaces[surfaceData.id]);
    }
    map.closePopup();
}

window.deleteSurface = function(surfaceId) {
    customConfirm('Supprimer cette zone ?', () => {
        if (String(surfaceId).startsWith('offline_')) {
            offlineSurfacesQueue = offlineSurfacesQueue.filter(i => String(i.id) !== String(surfaceId));
            localStorage.setItem('offlineSurfaces', JSON.stringify(offlineSurfacesQueue));
            removeSurfaceLocally(surfaceId);
            map.closePopup();
            return;
        }

        fetch(`/api/surfaces/${surfaceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(res => {
            if (res.ok) {
                removeSurfaceLocally(surfaceId);
                map.closePopup();
            }
        });
    });
}
