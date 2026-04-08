function updateAuthUI() {
    const btn = document.getElementById('auth-btn');
    const info = document.getElementById('user-info');
    const adminBtn = document.getElementById('admin-btn');

    if (token && currentUser) {
        btn.innerText = '🚪';
        btn.title = 'Se déconnecter';
        btn.onclick = logout;
        info.innerText = currentUser;

        document.getElementById('draw-btn').style.display = 'inline-flex';

        if (currentUser === 'admin') adminBtn.style.display = 'block';
        else adminBtn.style.display = 'none';

        // Notes UI
        document.getElementById('add-note-section').style.display = 'block';
        document.getElementById('edit-public-btn').style.display = 'inline-block';
        document.getElementById('login-prompt').style.display = 'none';
    } else {
        btn.innerText = '👤';
        btn.title = 'Se connecter';
        btn.onclick = openLogin;
        info.innerText = '';
        adminBtn.style.display = 'none';
        document.getElementById('draw-btn').style.display = 'none';
        cancelDraw();

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

function openAdmin() {
    document.getElementById('admin-modal').style.display = 'block';
    document.getElementById('admin-error').innerText = '';
    document.getElementById('admin-success').innerText = '';
}

function closeAdmin() {
    document.getElementById('admin-modal').style.display = 'none';
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

document.getElementById('admin-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const u = document.getElementById('new-username').value;
    const p = document.getElementById('new-password').value;

    fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ username: u, password: p })
    })
    .then(res => res.json().then(data => ({ status: res.status, body: data })))
    .then(res => {
        if (res.status === 201) {
            document.getElementById('admin-success').innerText = `Utilisateur ${u} créé !`;
            document.getElementById('admin-error').innerText = '';
            document.getElementById('new-username').value = '';
            document.getElementById('new-password').value = '';
        } else {
            document.getElementById('admin-error').innerText = res.body.error || 'Erreur inconnue';
            document.getElementById('admin-success').innerText = '';
        }
    });
});

