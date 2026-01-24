const API_BASE = `${window.location.origin.replace(/\/+$/, '')}/api`; // No process.env in browser

class AdminCMS {
    constructor() {
        this.token = localStorage.getItem('adminToken');
        this.baseURL = API_BASE;
        this.currentUser = null;
        this.currentAdmin = null;
        this.tournaments = [];
        this.schedules = [];
        this.users = [];

        this.init();
    }

    init() {
        if (this.token) {
            this.validateToken();
        } else {
            this.showLogin();
        }
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('adminLoginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        document.getElementById('tournamentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTournament();
        });
    }

    async validateToken() {
        try {
            const response = await fetch(`${this.baseURL}/admin/dashboard`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.showDashboard();
                this.loadDashboard();
            } else {
                this.showLogin();
                localStorage.removeItem('adminToken');
            }
        } catch (error) {
            console.error('Token validation error:', error);
            this.showLogin();
        }
    }

    async login() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${this.baseURL}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.data.token;
                this.currentUser = data.data.user;
                this.currentAdmin = data.data.admin;
                localStorage.setItem('adminToken', this.token);
                this.showDashboard();
                this.loadDashboard();
                this.showAlert('Login successful!', 'success');
            } else {
                this.showAlert(data.message || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showAlert('Login failed. Please try again.', 'error');
        }
    }

    logout() {
        localStorage.removeItem('adminToken');
        this.token = null;
        this.currentUser = null;
        this.currentAdmin = null;
        this.showLogin();
    }

    showLogin() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('dashboard').style.display = 'none';
    }

    showDashboard() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
        if (this.currentUser) {
            document.getElementById('adminUsername').textContent = this.currentUser.username;
            document.getElementById('adminRole').textContent = this.currentAdmin.role.replace('_', ' ').toUpperCase();
        }
    }

    async loadDashboard() {
        try {
            const response = await fetch(`${this.baseURL}/admin/dashboard`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.updateDashboardStats(data.data);
            }
        } catch (error) {
            console.error('Dashboard load error:', error);
        }
    }

    updateDashboardStats(data) {
        document.getElementById('totalTournaments').textContent = data.statistics.totalTournaments;
        document.getElementById('activeTournaments').textContent = data.statistics.activeTournaments;
        document.getElementById('totalPlayers').textContent = data.statistics.totalPlayers;
        document.getElementById('totalMatches').textContent = data.statistics.totalMatches;

        const tbody = document.getElementById('upcomingTournaments');
        tbody.innerHTML = '';
        data.upcomingTournaments.forEach(tournament => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${tournament.name}</td>
                <td>${new Date(tournament.startAt).toLocaleDateString()}</td>
                <td>${tournament.registeredPlayers}/${tournament.maxPlayers}</td>
                <td><span class="badge badge-success">Open</span></td>
            `;
        });
    }

    showSection(sectionName) {
        document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
        document.getElementById(sectionName).classList.add('active');
        document.querySelectorAll('.sidebar a').forEach(link => link.classList.remove('active'));
        event.target.classList.add('active');

        switch (sectionName) {
            case 'tournaments': this.loadTournaments(); break;
            case 'users': this.loadUsers(); break;
            case 'schedules': this.loadSchedules(); break;
            case 'settings': this.loadSettings(); break;
        }
    }

    async loadTournaments() {
        try {
            const response = await fetch(`${this.baseURL}/admin/tournaments`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.tournaments = data.data;
                this.renderTournaments();
            }
        } catch (error) {
            console.error('Error loading tournaments:', error);
        }
    }

    renderTournaments() {
        const tbody = document.getElementById('tournamentsTable');
        tbody.innerHTML = '';
        if (!this.tournaments || this.tournaments.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="6" style="text-align: center; color: #666;">No tournaments found</td>';
            return;
        }
        this.tournaments.forEach(tournament => {
            const row = tbody.insertRow();
            const statusClass = this.getStatusClass(tournament.status);
            const playerCount = tournament.TournamentPlayers ? tournament.TournamentPlayers.length : 0;
            row.innerHTML = `
                <td>${tournament.name}</td>
                <td>${tournament.type ? tournament.type.replace('_', ' ') : 'N/A'}</td>
                <td><span class="badge ${statusClass}">${tournament.status ? tournament.status.replace('_', ' ') : 'Draft'}</span></td>
                <td>${playerCount}/${tournament.maxPlayers}</td>
                <td>${tournament.startAt ? new Date(tournament.startAt).toLocaleDateString() : 'TBD'}</td>
                <td>
                    <div class="tournament-actions">
                        <button class="btn btn-small btn-primary" onclick="adminCMS.editTournament(${tournament.id})">Edit</button>
                        <button class="btn btn-small btn-secondary" onclick="adminCMS.generateBracket(${tournament.id})">Generate Bracket</button>
                        <button class="btn btn-small btn-danger" onclick="adminCMS.deleteTournament(${tournament.id})">Delete</button>
                    </div>
                </td>
            `;
        });
    }

    async editTournament(tournamentId) {
        const tournament = this.tournaments.find(t => t.id === tournamentId);
        if (!tournament) {
            this.showAlert('Tournament not found', 'error');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit Tournament</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <form id="editTournamentForm">
                    <div class="form-group">
                        <label>Tournament Name</label>
                        <input type="text" name="name" value="${tournament.name}" required>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea name="description">${tournament.description || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Type</label>
                            <select name="type">
                                <option value="single_elimination" ${tournament.type === 'single_elimination' ? 'selected' : ''}>Single Elimination</option>
                                <option value="double_elimination" ${tournament.type === 'double_elimination' ? 'selected' : ''}>Double Elimination</option>
                                <option value="round_robin" ${tournament.type === 'round_robin' ? 'selected' : ''}>Round Robin</option>
                                <option value="swiss" ${tournament.type === 'swiss' ? 'selected' : ''}>Swiss</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select name="status">
                                <option value="draft" ${tournament.status === 'draft' ? 'selected' : ''}>Draft</option>
                                <option value="registration_open" ${tournament.status === 'registration_open' ? 'selected' : ''}>Registration Open</option>
                                <option value="registration_closed" ${tournament.status === 'registration_closed' ? 'selected' : ''}>Registration Closed</option>
                                <option value="in_progress" ${tournament.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                <option value="completed" ${tournament.status === 'completed' ? 'selected' : ''}>Completed</option>
                                <option value="cancelled" ${tournament.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Max Players</label>
                            <input type="number" name="maxPlayers" value="${tournament.maxPlayers}" min="2" max="256">
                        </div>
                        <div class="form-group">
                            <label>Entry Fee</label>
                            <input type="number" name="entryFee" value="${tournament.entryFee || 0}" min="0" step="0.01">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Start Date</label>
                            <input type="datetime-local" name="startAt" value="${tournament.startAt ? new Date(tournament.startAt).toISOString().slice(0, 16) : ''}">
                        </div>
                        <div class="form-group">
                            <label>Registration Deadline</label>
                            <input type="datetime-local" name="registrationEndAt" value="${tournament.registrationEndAt ? new Date(tournament.registrationEndAt).toISOString().slice(0, 16) : ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Prize Pool</label>
                        <input type="number" name="prizePool" value="${tournament.prizePool || 0}" min="0" step="0.01">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Tournament</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('editTournamentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const tournamentData = Object.fromEntries(formData.entries());

            try {
                const response = await fetch(`${this.baseURL}/admin/tournaments/${tournamentId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify(tournamentData)
                });

                const result = await response.json();
                if (result.success) {
                    modal.remove();
                    this.loadTournaments();
                    this.showAlert('Tournament updated successfully', 'success');
                } else {
                    this.showAlert(result.message || 'Failed to update tournament', 'error');
                }
            } catch (error) {
                this.showAlert('Error updating tournament', 'error');
            }
        });
    }

    async deleteTournament(tournamentId) {
        if (!confirm('Are you sure you want to delete this tournament? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/admin/tournaments/${tournamentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.showAlert('Tournament deleted successfully!', 'success');
                this.loadTournaments();
            } else {
                this.showAlert(data.message || 'Failed to delete tournament', 'error');
            }
        } catch (error) {
            console.error('Delete tournament error:', error);
            this.showAlert('Failed to delete tournament', 'error');
        }
    }

    async loadSchedules() {
        try {
            const response = await fetch(`${this.baseURL}/admin/schedules`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.schedules = data.data || [];
                this.renderSchedules();
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
            this.schedules = [];
            this.renderSchedules();
        }
    }

    renderSchedules() {
        const tbody = document.getElementById('schedulesTable');
        tbody.innerHTML = '';
        if (!this.schedules || this.schedules.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="7" style="text-align: center; color: #666;">No schedules found</td>';
            return;
        }
        this.schedules.forEach(schedule => {
            const row = tbody.insertRow();
            const statusClass = schedule.isActive ? 'badge-success' : 'badge-danger';
            const statusText = schedule.isActive ? 'Active' : 'Inactive';
            row.innerHTML = `
                <td>${schedule.name}</td>
                <td>${schedule.type ? schedule.type.replace('_', ' ') : 'N/A'}</td>
                <td>${schedule.frequency || 'N/A'}</td>
                <td>${schedule.cronExpression || 'N/A'}</td>
                <td>${schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : 'N/A'}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="schedule-actions">
                        <button class="btn btn-small btn-primary" onclick="adminCMS.editSchedule(${schedule.id})">Edit</button>
                        <button class="btn btn-small btn-secondary" onclick="adminCMS.toggleSchedule(${schedule.id}, ${schedule.isActive})">
                            ${schedule.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button class="btn btn-small btn-danger" onclick="adminCMS.deleteSchedule(${schedule.id})">Delete</button>
                    </div>
                </td>
            `;
        });
    }

    showCreateScheduleModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Create Tournament Schedule</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <form id="createScheduleForm">
                    <div class="form-group">
                        <label>Schedule Name</label>
                        <input type="text" name="name" required placeholder="e.g., Weekly Championship">
                    </div>
                    <div class="form-group">
                        <label>Tournament Template</label>
                        <select name="tournamentId" required>
                            <option value="">Select a tournament template</option>
                            ${this.tournaments.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Schedule Type</label>
                            <select name="type" onchange="handleScheduleTypeChange(this.value)">
                                <option value="recurring">Recurring</option>
                                <option value="one_time">One Time</option>
                            </select>
                        </div>
                        <div class="form-group" id="frequencyGroup">
                            <label>Frequency</label>
                            <select name="frequency" onchange="handleFrequencyChange(this.value)">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group" id="cronGroup" style="display: none;">
                        <label>Cron Expression</label>
                        <input type="text" name="cronExpression" placeholder="0 18 * * 1 (Every Monday at 6 PM)">
                        <small>Format: minute hour day month weekday</small>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Auto Start</label>
                            <input type="checkbox" name="autoStart" checked>
                        </div>
                        <div class="form-group">
                            <label>Minimum Players</label>
                            <input type="number" name="minPlayers" value="4" min="2" max="128">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Registration Duration (minutes)</label>
                        <input type="number" name="registrationDuration" value="60" min="15" max="1440">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Schedule</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('createScheduleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const scheduleData = Object.fromEntries(formData.entries());
            scheduleData.autoStart = formData.has('autoStart');

            try {
                const response = await fetch(`${this.baseURL}/admin/schedules`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify(scheduleData)
                });

                const result = await response.json();
                if (result.success) {
                    modal.remove();
                    this.loadSchedules();
                    this.showAlert('Schedule created successfully', 'success');
                } else {
                    this.showAlert(result.message || 'Failed to create schedule', 'error');
                }
            } catch (error) {
                console.error('Schedule creation error:', error);
                this.showAlert('Error creating schedule: ' + error.message, 'error');
            }
        });
    }

    async editSchedule(scheduleId) {
        const schedule = this.schedules.find(s => s.id === scheduleId);
        if (!schedule) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit Schedule</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <form id="editScheduleForm">
                    <div class="form-group">
                        <label>Schedule Name</label>
                        <input type="text" name="name" value="${schedule.name}" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Schedule Type</label>
                            <select name="type">
                                <option value="recurring" ${schedule.type === 'recurring' ? 'selected' : ''}>Recurring</option>
                                <option value="one_time" ${schedule.type === 'one_time' ? 'selected' : ''}>One Time</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Frequency</label>
                            <select name="frequency">
                                <option value="daily" ${schedule.frequency === 'daily' ? 'selected' : ''}>Daily</option>
                                <option value="weekly" ${schedule.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                                <option value="monthly" ${schedule.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                                <option value="custom" ${schedule.frequency === 'custom' ? 'selected' : ''}>Custom</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Cron Expression</label>
                        <input type="text" name="cronExpression" value="${schedule.cronExpression || ''}">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Auto Start</label>
                            <input type="checkbox" name="autoStart" ${schedule.autoStart ? 'checked' : ''}>
                        </div>
                        <div class="form-group">
                            <label>Minimum Players</label>
                            <input type="number" name="minPlayers" value="${schedule.minPlayers}" min="2" max="128">
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Schedule</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('editScheduleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const scheduleData = Object.fromEntries(formData.entries());
            scheduleData.autoStart = formData.has('autoStart');

            try {
                const response = await fetch(`${this.baseURL}/admin/schedules/${scheduleId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify(scheduleData)
                });

                const result = await response.json();
                if (result.success) {
                    modal.remove();
                    this.loadSchedules();
                    this.showAlert('Schedule updated successfully', 'success');
                } else {
                    this.showAlert(result.message || 'Failed to update schedule', 'error');
                }
            } catch (error) {
                this.showAlert('Error updating schedule', 'error');
            }
        });
    }

    async toggleSchedule(scheduleId, currentStatus) {
        try {
            const response = await fetch(`${this.baseURL}/admin/schedules/${scheduleId}/toggle`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const result = await response.json();
            if (result.success) {
                this.loadSchedules();
                this.showAlert(`Schedule ${currentStatus ? 'disabled' : 'enabled'} successfully`, 'success');
            } else {
                this.showAlert(result.message || 'Failed to toggle schedule', 'error');
            }
        } catch (error) {
            this.showAlert('Error toggling schedule', 'error');
        }
    }

    async deleteSchedule(scheduleId) {
        if (!confirm('Are you sure you want to delete this schedule? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/admin/schedules/${scheduleId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const result = await response.json();
            if (result.success) {
                this.loadSchedules();
                this.showAlert('Schedule deleted successfully', 'success');
            } else {
                this.showAlert(result.message || 'Failed to delete schedule', 'error');
            }
        } catch (error) {
            this.showAlert('Error deleting schedule', 'error');
        }
    }

    async loadUsers() {
        try {
            const response = await fetch(`${this.baseURL}/admin/users`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.users = data.data;
                this.updateUsersTable(this.users);
            }
        } catch (error) {
            console.error('Load users error:', error);
        }
    }

    async editUser(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit User</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <form id="editUserForm">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" name="username" value="${user.username}" required>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="email" value="${user.email}" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Status</label>
                            <select name="isActive">
                                <option value="true" ${user.isActive ? 'selected' : ''}>Active</option>
                                <option value="false" ${!user.isActive ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <select name="role">
                                <option value="player" ${user.role === 'player' ? 'selected' : ''}>Player</option>
                                <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Total Score</label>
                            <input type="number" name="totalScore" value="${user.totalScore}" readonly>
                        </div>
                        <div class="form-group">
                            <label>Games Played</label>
                            <input type="number" name="gamesPlayed" value="${user.gamesPlayed}" readonly>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update User</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('editUserForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const userData = Object.fromEntries(formData.entries());
            userData.isActive = userData.isActive === 'true';

            try {
                const response = await fetch(`${this.baseURL}/admin/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify(userData)
                });

                const result = await response.json();
                if (result.success) {
                    modal.remove();
                    this.loadUsers();
                    this.showAlert('User updated successfully', 'success');
                } else {
                    this.showAlert(result.message || 'Failed to update user', 'error');
                }
            } catch (error) {
                this.showAlert('Error updating user', 'error');
            }
        });
    }

    async banUser(userId, duration = 24) {
        const reason = prompt('Reason for ban:');
        if (!reason) return;

        try {
            const response = await fetch(`${this.baseURL}/admin/users/${userId}/ban`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ reason, duration })
            });

            const result = await response.json();
            if (result.success) {
                this.loadUsers();
                this.showAlert('User banned successfully', 'success');
            } else {
                this.showAlert(result.message || 'Failed to ban user', 'error');
            }
        } catch (error) {
            this.showAlert('Error banning user', 'error');
        }
    }

    async toggleUserStatus(userId, currentStatus) {
        try {
            const response = await fetch(`${this.baseURL}/admin/users/${userId}/toggle`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ isActive: !currentStatus })
            });

            const result = await response.json();
            if (result.success) {
                this.loadUsers();
                this.showAlert(`User ${currentStatus ? 'deactivated' : 'activated'} successfully`, 'success');
            } else {
                this.showAlert(result.message || 'Failed to toggle user status', 'error');
            }
        } catch (error) {
            this.showAlert('Error toggling user status', 'error');
        }
    }

    async viewUser(userId) {
        try {
            const response = await fetch(`${this.baseURL}/admin/users/${userId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                const user = data.data;
                alert(`User Details:\n\nUsername: ${user.username}\nEmail: ${user.email}\nRole: ${user.role}\nStatus: ${user.isActive ? 'Active' : 'Inactive'}\nGames Played: ${user.gamesPlayed}\nTotal Score: ${user.totalScore}`);
            } else {
                this.showAlert(data.message || 'Failed to load user details', 'error');
            }
        } catch (error) {
            this.showAlert('Error loading user details', 'error');
        }
    }

    async saveSettings() {
        const settings = {
            tournament: {
                defaultDuration: document.getElementById('defaultTournamentDuration').value,
                defaultRegistrationDuration: document.getElementById('defaultRegistrationDuration').value,
                maxPlayersPerTournament: document.getElementById('maxPlayersPerTournament').value,
                autoStartTournaments: document.getElementById('autoStartTournaments').checked
            },
            game: {
                defaultTimeLimit: document.getElementById('defaultGameTimeLimit').value,
                allowSpectators: document.getElementById('allowSpectators').checked,
                enableChat: document.getElementById('enableChat').checked,
                wordValidationMode: document.getElementById('wordValidationMode').value
            },
            user: {
                allowUserRegistration: document.getElementById('allowUserRegistration').checked,
                requireEmailVerification: document.getElementById('requireEmailVerification').checked,
                defaultUserRole: document.getElementById('defaultUserRole').value,
                maxGamesPerUserPerDay: document.getElementById('maxGamesPerUserPerDay').value
            },
            notifications: {
                tournamentStartNotifications: document.getElementById('tournamentStartNotifications').checked,
                gameMoveNotifications: document.getElementById('gameMoveNotifications').checked,
                emailNotifications: document.getElementById('emailNotifications').checked,
                adminAlertThreshold: document.getElementById('adminAlertThreshold').value
            },
            system: {
                maintenanceMode: document.getElementById('maintenanceMode').checked,
                maintenanceMessage: document.getElementById('maintenanceMessage').value,
                autoBackupFrequency: document.getElementById('autoBackupFrequency').value
            }
        };

        try {
            const response = await fetch(`${this.baseURL}/admin/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(settings)
            });

            const result = await response.json();
            if (result.success) {
                this.showAlert('Settings saved successfully', 'success');
            } else {
                this.showAlert(result.message || 'Failed to save settings', 'error');
            }
        } catch (error) {
            this.showAlert('Error saving settings', 'error');
        }
    }

    async loadSettings() {
        try {
            const response = await fetch(`${this.baseURL}/admin/settings`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const result = await response.json();
            if (result.success && result.settings) {
                const settings = result.settings;
                if (settings.tournament) {
                    document.getElementById('defaultTournamentDuration').value = settings.tournament.defaultDuration || 24;
                    document.getElementById('defaultRegistrationDuration').value = settings.tournament.defaultRegistrationDuration || 60;
                    document.getElementById('maxPlayersPerTournament').value = settings.tournament.maxPlayersPerTournament || 128;
                    document.getElementById('autoStartTournaments').checked = settings.tournament.autoStartTournaments !== false;
                }
                if (settings.game) {
                    document.getElementById('defaultGameTimeLimit').value = settings.game.defaultTimeLimit || 30;
                    document.getElementById('allowSpectators').checked = settings.game.allowSpectators !== false;
                    document.getElementById('enableChat').checked = settings.game.enableChat !== false;
                    document.getElementById('wordValidationMode').value = settings.game.wordValidationMode || 'strict';
                }
                if (settings.user) {
                    document.getElementById('allowUserRegistration').checked = settings.user.allowUserRegistration !== false;
                    document.getElementById('requireEmailVerification').checked = settings.user.requireEmailVerification === true;
                    document.getElementById('defaultUserRole').value = settings.user.defaultUserRole || 'player';
                    document.getElementById('maxGamesPerUserPerDay').value = settings.user.maxGamesPerUserPerDay || 50;
                }
                if (settings.notifications) {
                    document.getElementById('tournamentStartNotifications').checked = settings.notifications.tournamentStartNotifications !== false;
                    document.getElementById('gameMoveNotifications').checked = settings.notifications.gameMoveNotifications !== false;
                    document.getElementById('emailNotifications').checked = settings.notifications.emailNotifications === true;
                    document.getElementById('adminAlertThreshold').value = settings.notifications.adminAlertThreshold || 100;
                }
                if (settings.system) {
                    document.getElementById('maintenanceMode').checked = settings.system.maintenanceMode === true;
                    document.getElementById('maintenanceMessage').value = settings.system.maintenanceMessage || '';
                    document.getElementById('autoBackupFrequency').value = settings.system.autoBackupFrequency || 'daily';
                }
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async performBackup() {
        if (!confirm('This will create a backup of the entire system. Continue?')) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/admin/backup`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const result = await response.json();
            if (result.success) {
                this.showAlert('Backup completed successfully', 'success');
            } else {
                this.showAlert(result.message || 'Backup failed', 'error');
            }
        } catch (error) {
            this.showAlert('Error performing backup', 'error');
        }
    }

    async clearLogs() {
        if (!confirm('This will permanently delete all system logs. Continue?')) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/admin/logs`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const result = await response.json();
            if (result.success) {
                this.showAlert('Logs cleared successfully', 'success');
            } else {
                this.showAlert(result.message || 'Failed to clear logs', 'error');
            }
        } catch (error) {
            this.showAlert('Error clearing logs', 'error');
        }
    }

    updateUsersTable(users) {
        const tbody = document.getElementById('usersTable');
        tbody.innerHTML = '';
        users.forEach(user => {
            const row = tbody.insertRow();
            const statusClass = user.isActive ? 'badge-success' : 'badge-danger';
            const statusText = user.isActive ? 'Active' : 'Inactive';
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.gamesPlayed}</td>
                <td>${user.totalScore}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn-sm btn-primary" onclick="adminCMS.editUser(${user.id})">Edit</button>
                    <button class="btn-sm btn-warning" onclick="adminCMS.toggleUserStatus(${user.id}, ${user.isActive})">
                        ${user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn-sm btn-danger" onclick="adminCMS.banUser(${user.id})">Ban</button>
                </td>
            `;
        });
    }

    showCreateTournamentModal() {
        document.getElementById('tournamentModalTitle').textContent = 'Create Tournament';
        document.getElementById('tournamentForm').reset();
        document.getElementById('tournamentModal').style.display = 'block';
    }

    closeTournamentModal() {
        document.getElementById('tournamentModal').style.display = 'none';
    }

    async saveTournament() {
        const formData = {
            name: document.getElementById('tournamentName').value,
            description: document.getElementById('description').value,
            type: document.getElementById('tournamentType').value,
            maxPlayers: parseInt(document.getElementById('maxPlayers').value),
            entryFee: parseFloat(document.getElementById('entryFee').value) || 0,
            schedulingType: document.getElementById('schedulingType').value,
            registrationStartAt: document.getElementById('registrationStart').value || null,
            registrationEndAt: document.getElementById('registrationEnd').value || null,
            startAt: document.getElementById('tournamentStart').value || null,
            status: 'draft'
        };

        try {
            const response = await fetch(`${this.baseURL}/admin/tournaments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            if (data.success) {
                this.showAlert('Tournament created successfully!', 'success');
                this.closeTournamentModal();
                this.loadTournaments();
                this.loadDashboard();
            } else {
                this.showAlert(data.message || 'Failed to create tournament', 'error');
            }
        } catch (error) {
            console.error('Save tournament error:', error);
            this.showAlert('Failed to create tournament', 'error');
        }
    }

    async generateBracket(tournamentId) {
        if (!confirm('Generate bracket for this tournament? This will create matches for all registered players.')) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/admin/tournaments/${tournamentId}/generate-bracket`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.showAlert('Bracket generated successfully!', 'success');
                this.loadTournaments();
            } else {
                this.showAlert(data.message || 'Failed to generate bracket', 'error');
            }
        } catch (error) {
            console.error('Generate bracket error:', error);
            this.showAlert('Failed to generate bracket', 'error');
        }
    }

    getStatusClass(status) {
        const statusClasses = {
            'draft': 'badge-secondary',
            'registration_open': 'badge-success',
            'registration_closed': 'badge-warning',
            'in_progress': 'badge-primary',
            'completed': 'badge-info',
            'cancelled': 'badge-danger'
        };
        return statusClasses[status] || 'badge-secondary';
    }

    showAlert(message, type) {
        const existingAlerts = document.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());

        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;

        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(alert, mainContent.firstChild);

        setTimeout(() => { alert.remove(); }, 5000);
    }
}

// Global functions
function showSection(sectionName) { adminCMS.showSection(sectionName); }
function logout() { adminCMS.logout(); }
function showCreateTournamentModal() { adminCMS.showCreateTournamentModal(); }
function closeTournamentModal() { adminCMS.closeTournamentModal(); }
function showCreateScheduleModal() { adminCMS.showCreateScheduleModal(); }
function handleScheduleTypeChange(type) {
    document.getElementById('frequencyGroup').style.display = type === 'recurring' ? 'block' : 'none';
}
function handleFrequencyChange(frequency) {
    document.getElementById('cronGroup').style.display = frequency === 'custom' ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => { adminCMS = new AdminCMS(); });

// CSS (kept as is)
const style = document.createElement('style');
style.textContent = `
    .badge {
        display: inline-block;
        padding: 4px 8px;
        font-size: 0.75rem;
        font-weight: 600;
        border-radius: 4px;
        text-transform: uppercase;
    }
    .badge-primary { background: #667eea; color: white; }
    .badge-success { background: #48bb78; color: white; }
    .badge-warning { background: #ed8936; color: white; }
    .badge-danger { background: #f56565; color: white; }
    .badge-info { background: #4299e1; color: white; }
    .badge-secondary { background: #a0aec0; color: white; }
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background: white;
        border-radius: 15px;
        padding: 30px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        width: 90%;
    }
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }
    .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #999;
    }
    .close-btn:hover { color: #333; }
    .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 20px;
    }
    .btn-small {
        padding: 6px 12px;
        font-size: 0.8rem;
        margin: 0 2px;
    }
    .tournament-actions {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
    }
    select {
        width: 100%;
        padding: 12px 15px;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 1rem;
        background: white;
    }
    textarea {
        width: 100%;
        padding: 12px 15px;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 1rem;
        resize: vertical;
        font-family: inherit;
    }
`;
document.head.appendChild(style);