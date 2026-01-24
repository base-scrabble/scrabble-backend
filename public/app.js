const API_BASE = `${window.location.origin.replace(/\/+$/, '')}/api`;

let users = [];
let games = [];
let stats = {};

document.addEventListener('DOMContentLoaded', function() {
    checkServerHealth();
    loadStats();
    loadUsers();
    loadGames();
    
    setInterval(() => {
        loadStats();
        loadUsers();
        loadGames();
    }, 30000);
});

async function checkServerHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        document.getElementById('server-status').textContent = `Server: ${data.status}`;
        document.getElementById('db-status').textContent = `Database: ${data.database}`;
        
        document.getElementById('server-status').style.background = data.status === 'healthy' ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)';
        document.getElementById('db-status').style.background = data.database === 'connected' ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)';
    } catch (error) {
        console.error('Health check failed:', error);
        document.getElementById('server-status').textContent = 'Server: Error';
        document.getElementById('db-status').textContent = 'Database: Error';
        document.getElementById('server-status').style.background = 'rgba(231, 76, 60, 0.3)';
        document.getElementById('db-status').style.background = 'rgba(231, 76, 60, 0.3)';
    }
}

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        
        if (data.success) {
            stats = data.data;
            renderStats();
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
        document.getElementById('stats-grid').innerHTML = '<div class="error">Failed to load statistics</div>';
    }
}

function renderStats() {
    const statsGrid = document.getElementById('stats-grid');
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.totalUsers || 0}</div>
            <div class="stat-label">Total Players</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.totalGames || 0}</div>
            <div class="stat-label">Total Games</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.activeGames || 0}</div>
            <div class="stat-label">Active Games</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.completedGames || 0}</div>
            <div class="stat-label">Completed Games</div>
        </div>
    `;
}

async function loadUsers() {
    try {
        const token = localStorage.getItem('privyToken');
        if (!token) {
            document.getElementById('users-table').innerHTML = '<tr><td colspan="8" class="error">Please log in</td></tr>';
            return;
        }
        
        const response = await fetch(`${API_BASE}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            users = data.data;
            renderUsers();
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        document.getElementById('users-table').innerHTML = '<tr><td colspan="8" class="error">Failed to load users</td></tr>';
    }
}

function renderUsers() {
    const tbody = document.getElementById('users-table');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #7f8c8d;">No players found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => {
        const winRate = user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) : '0.0';
        const joinedDate = new Date(user.createdAt).toLocaleDateString();
        
        return `
            <tr>
                <td>${user.id}</td>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td>${user.totalScore}</td>
                <td>${user.gamesPlayed}</td>
                <td>${user.gamesWon}</td>
                <td>${winRate}%</td>
                <td>${joinedDate}</td>
            </tr>
        `;
    }).join('');
}

async function loadGames() {
    try {
        const token = localStorage.getItem('privyToken');
        if (!token) {
            document.getElementById('games-table').innerHTML = '<tr><td colspan="6" class="error">Please log in</td></tr>';
            return;
        }
        
        const response = await fetch(`${API_BASE}/games`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            games = data.data;
            renderGames();
        }
    } catch (error) {
        console.error('Failed to load games:', error);
        document.getElementById('games-table').innerHTML = '<tr><td colspan="6" class="error">Failed to load games</td></tr>';
    }
}

function renderGames() {
    const tbody = document.getElementById('games-table');
    
    if (games.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #7f8c8d;">No games found</td></tr>';
        return;
    }
    
    tbody.innerHTML = games.map(game => {
        const createdDate = new Date(game.createdAt).toLocaleDateString();
        const playerCount = game.GamePlayers ? game.GamePlayers.length : 0;
        
        let statusBadge = '';
        switch(game.status) {
            case 'waiting':
                statusBadge = '<span style="background: #f39c12; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Waiting</span>';
                break;
            case 'active':
                statusBadge = '<span style="background: #27ae60; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Active</span>';
                break;
            case 'completed':
                statusBadge = '<span style="background: #95a5a6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Completed</span>';
                break;
            case 'cancelled':
                statusBadge = '<span style="background: #e74c3c; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Cancelled</span>';
                break;
        }
        
        return `
            <tr>
                <td><strong>${game.gameCode}</strong></td>
                <td>${statusBadge}</td>
                <td>${playerCount}</td>
                <td>${game.maxPlayers}</td>
                <td>${createdDate}</td>
                <td>
                    <button class="btn" onclick="viewGame(${game.id})" style="padding: 6px 12px; font-size: 12px;">View</button>
                </td>
            </tr>
        `;
    }).join('');
}

function showCreateUserForm() {
    document.getElementById('create-user-form').style.display = 'block';
}

function hideCreateUserForm() {
    document.getElementById('create-user-form').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
}

async function createUser() {
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const token = localStorage.getItem('privyToken');
        if (!token) {
            showMessage('Please log in to create a user', 'error');
            return;
        }

        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        
        if (data.success) {
            showMessage('User created successfully!', 'success');
            hideCreateUserForm();
            loadUsers();
        } else {
            showMessage(data.message || 'Failed to create user', 'error');
        }
    } catch (error) {
        console.error('Failed to create user:', error);
        showMessage('Failed to create user', 'error');
    }
}

async function createGame() {
    try {
        const token = localStorage.getItem('privyToken');
        if (!token) {
            showMessage('Please log in to create a game', 'error');
            return;
        }

        const response = await fetch(`${API_BASE}/games`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ maxPlayers: 4 })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`Game created! Code: ${data.data.gameCode}`, 'success');
            loadGames();
            loadStats();
        } else {
            showMessage(data.message || 'Failed to create game', 'error');
        }
    } catch (error) {
        console.error('Failed to create game:', error);
        showMessage('Failed to create game', 'error');
    }
}

async function viewGame(gameId) {
    try {
        const token = localStorage.getItem('privyToken');
        if (!token) {
            showMessage('Please log in to view game details', 'error');
            return;
        }

        const response = await fetch(`${API_BASE}/games/${gameId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const game = data.data;
            alert(`Game Details:\n\nCode: ${game.gameCode}\nStatus: ${game.status}\nPlayers: ${game.GamePlayers ? game.GamePlayers.length : 0}/${game.maxPlayers}\nCreated: ${new Date(game.createdAt).toLocaleString()}`);
        } else {
            showMessage('Failed to load game details', 'error');
        }
    } catch (error) {
        console.error('Failed to load game:', error);
        showMessage('Failed to load game details', 'error');
    }
}

function showMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = type;
    messageDiv.textContent = message;
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '20px';
    messageDiv.style.right = '20px';
    messageDiv.style.zIndex = '1000';
    messageDiv.style.padding = '15px 20px';
    messageDiv.style.borderRadius = '6px';
    messageDiv.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => { document.body.removeChild(messageDiv); }, 3000);
}