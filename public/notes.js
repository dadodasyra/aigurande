function loadNotes(parcelId) {
    clientLog(`Loading notes for ${parcelId}`);
    let headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const publicDisplay = document.getElementById('public-note-display');
    const publicInput = document.getElementById('public-note-input');
    const editPublicBtn = document.getElementById('edit-public-btn');
    
    // Check Cache for Public Note
    const cachedPublic = localStorage.getItem('publicNote_' + parcelId);
    if(cachedPublic) {
        try {
            let data = JSON.parse(cachedPublic);
            let dateStr = formatTime(data.updated_at);
            let authorStr = data.username ? ` par <strong>${data.username}</strong>` : '';
            publicDisplay.innerHTML = `<p style="white-space: pre-wrap; margin:0 0 10px 0; color:#555;">${data.content}</p>
                                 <small style="color: gray;">Modifié${authorStr} le ${dateStr}</small>
                                 <br><small style="color:#d40000; font-style:italic;">(Actualisation serveur...)</small>`;
            publicInput.value = data.content;
        } catch(e) {}
    } else {
        publicDisplay.innerText = 'Chargement en cours...';
    }
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
                localStorage.setItem('publicNote_' + parcelId, JSON.stringify(data));
                let dateStr = formatTime(data.updated_at);
                let authorStr = data.username ? ` par <strong>${data.username}</strong>` : '';
                publicDisplay.innerHTML = `<p style="white-space: pre-wrap; margin:0 0 10px 0;">${data.content}</p>
                                     <small style="color: gray;">Modifié${authorStr} le ${dateStr}</small>`;
                publicInput.value = data.content;
            } else {
                localStorage.removeItem('publicNote_' + parcelId);
                publicDisplay.innerText = 'Aucune note publique.';
                publicInput.value = '';
            }
        })
        .catch(err => {
            clientLog(`Error fetching public note: ${err.message}`);
            if(!cachedPublic) publicDisplay.innerText = 'Erreur de chargement (Hors ligne ?). Modification désactivée.';
            if(editPublicBtn) editPublicBtn.disabled = true;
        });

    const individualContainer = document.getElementById('individual-notes');

    // Check Cache for Individual Notes
    const cachedPrivate = localStorage.getItem('privateNotes_' + parcelId);
    let hasLoadedPrivateCache = false;
    if(cachedPrivate) {
        try {
            let data = JSON.parse(cachedPrivate);
            displayIndividualNotes(data, parcelId, individualContainer);
            hasLoadedPrivateCache = true;
        } catch(e) {}
    }
    if(!hasLoadedPrivateCache) {
        individualContainer.innerHTML = '<p>Chargement des messages en cours...</p>';
    }

    // Load Individual Notes
    fetch(`/api/notes/${parcelId}`, { headers })
        .then(res => {
            if(!res.ok) throw new Error('Failed to fetch private notes');
            return res.json();
        })
        .then(data => {
            localStorage.setItem('privateNotes_' + parcelId, JSON.stringify(data));
            clientLog('Individual notes fetched');
            displayIndividualNotes(data, parcelId, individualContainer);
        })
        .catch(err => {
            clientLog(`Error fetching individual notes: ${err.message}`);
            if(!hasLoadedPrivateCache) {
                individualContainer.innerHTML = '<p>Erreur lors du chargement des messages. Cependant, vos nouvelles notes seront sauvegardées hors ligne.</p>';
                displayOfflineQueuedNotes(parcelId, individualContainer);
            }
        });
}

function displayIndividualNotes(notes, parcelId, list) {
    list.innerHTML = notes.length === 0 ? '<p>Aucun message personnel.</p>' : '';

    notes.forEach(note => {
        let isMyNote = (currentUser === note.username);
        let actionHTML = '';
        if (token && currentUser === note.username) {
            actionHTML = ` <button class="icon-btn" style="color:#0078d4;" onclick="editIndividualNote(${note.id}, '${note.content.replace(/'/g, "\\'")}')">✏️</button>
                           <button class="icon-btn" style="color:red;" onclick="deleteIndividualNote(${note.id})">🗑️</button>`;
        } else if (token && currentUser === 'admin') {
            actionHTML = ` <button class="icon-btn" style="color:red;" onclick="deleteIndividualNote(${note.id})">🗑️</button>`;
        }

        const el = document.createElement('div');
        el.className = 'note';
        el.innerHTML = `<strong>${note.username}</strong> (${formatTime(note.created_at)})${actionHTML}: <br> <span id="note-text-${note.id}">${note.content}</span>`;
        list.appendChild(el);
    });

    displayOfflineQueuedNotes(parcelId, list);
}

function displayOfflineQueuedNotes(parcelId, container) {
    const offlineForThis = offlineNotesQueue.filter(n => n.parcelId === parcelId);
    if(offlineForThis.length > 0 && container.innerHTML.includes('Aucun message')) container.innerHTML = '';

    offlineForThis.forEach(note => {
        const el = document.createElement('div');
        el.className = 'note';
        el.innerHTML = `<strong>${note.username}</strong> <span class="offline-badge">Attente Synchronisation (Hors ligne)</span>: <br> <span>${note.content}</span>`;
        container.appendChild(el);
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

window.editIndividualNote = function(noteId, oldContent) {
    customPrompt("Modifier votre message :", oldContent, (newContent) => {
        if (newContent !== null && newContent.trim() !== '') {
            fetch(`/api/notes/${noteId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ content: newContent })
            })
            .then(res => {
                if (res.ok) loadNotes(currentParcelId);
            });
        }
    });
}

window.deleteIndividualNote = function(noteId) {
    customConfirm("Voulez-vous vraiment supprimer ce message personnel ?", () => {
        fetch(`/api/notes/${noteId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(res => {
            if (res.ok) loadNotes(currentParcelId);
        });
    });
}

// Authentication handling

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
