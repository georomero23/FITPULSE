/**
 * FitPulse Gym Management — Frontend
 * Vanilla JS SPA, matches Game Hub architecture
 */

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let AUTH = null;   // {token, role, userId, userName}
let PAGE = null;
let SIDEBAR_COLLAPSED = false;

// Wizard state
let WIZ = { step:0, user:null, data:{objective:'',experience:'',days:[],limitations:'',paymentPeriod:''}, routine:null, editingId:null };

// ═══════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════
async function api(path, method='GET', body=null) {
    const opts = { method, headers: {'Content-Type':'application/json'} };
    if (AUTH) opts.headers['Authorization'] = 'Bearer ' + AUTH.token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch('/api/' + path, opts);
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.message || 'Error');
    return data;
}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
async function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pw    = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const msgEl = document.getElementById('login-error-msg');
    errEl.classList.remove('show');

    if (!email || !pw) { msgEl.textContent='Completa todos los campos'; errEl.classList.add('show'); return; }

    document.getElementById('login-btn').disabled = true;
    document.getElementById('login-btn').textContent = 'Cargando...';

    try {
        const data = await api('auth/login', 'POST', {email, password:pw});
        AUTH = data;
        enterApp();
    } catch(e) {
        msgEl.textContent = e.message;
        errEl.classList.add('show');
    }
    document.getElementById('login-btn').disabled = false;
    document.getElementById('login-btn').textContent = 'Iniciar Sesión';
}

// Enter on password field
document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
});

function doLogout() {
    AUTH = null; PAGE = null;
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

function enterApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    buildSidebar();
    navigate(AUTH.role === 'Admin' ? 'dashboard' : 'my-routine');
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════
function buildSidebar() {
    const nav = document.getElementById('sidebar-nav');
    const items = AUTH.role === 'Admin'
        ? [{id:'dashboard',icon:'📊',label:'Dashboard'},{id:'users',icon:'👥',label:'Usuarios'},{id:'machines',icon:'🏋',label:'Máquinas'},{id:'routines',icon:'📋',label:'Rutinas'}]
        : [{id:'my-routine',icon:'📅',label:'Mi Rutina'}];
    nav.innerHTML = items.map(i =>
        `<button class="sidebar-item ${PAGE===i.id?'active':''}" onclick="navigate('${i.id}')">
            <span class="icon">${i.icon}</span>
            <span class="sidebar-label">${i.label}</span>
        </button>`
    ).join('');
}

function toggleSidebar() {
    SIDEBAR_COLLAPSED = !SIDEBAR_COLLAPSED;
    document.getElementById('sidebar').classList.toggle('collapsed', SIDEBAR_COLLAPSED);
}

function navigate(page) {
    PAGE = page;
    buildSidebar();
    const vc = document.getElementById('view-container');
    vc.innerHTML = '<div class="text-center mt-6" style="color:var(--text-muted)">Cargando...</div>';
    switch(page) {
        case 'dashboard':  renderDashboard(); break;
        case 'users':      renderUsers(); break;
        case 'machines':   renderMachines(); break;
        case 'routines':   renderRoutines(); break;
        case 'my-routine': renderMyRoutine(); break;
    }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function renderDashboard() {
    const vc = document.getElementById('view-container');
    try {
        const d = await api('dashboard');
        const expiredNames = d.expiredUsersList.map(u => u.name).join(', ');
        const alertHTML = d.expiredUsers > 0
            ? `<div class="alert-box alert-danger anim-slide" id="dash-alert">
                <span class="alert-icon">⚠️</span>
                <div class="alert-content">
                    <div class="alert-title">Atención Requerida</div>
                    <div class="alert-text">${d.expiredUsers} usuario(s) con membresía vencida: ${expiredNames}</div>
                </div>
                <button class="alert-close" onclick="document.getElementById('dash-alert').style.display='none'">✕</button>
               </div>` : '';

        const barHTML = (items, max) => items.map(i => {
            const pct = max > 0 ? (i.count/max*100) : 0;
            return `<div class="bar-row"><span class="bar-label">${i.objective||i.group}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-count">${i.count}</span></div>`;
        }).join('');

        const maxObj = Math.max(...d.usersByObjective.map(x=>x.count), 1);
        const maxGrp = Math.max(...d.machinesByGroup.map(x=>x.count), 1);

        vc.innerHTML = `
        <div class="page-header flex justify-between items-center flex-wrap gap-3">
            <div><h1>Dashboard</h1><p>Resumen general del gimnasio</p></div>
            <button class="btn btn-pink" onclick="navigate('routines')">➕ Nueva Rutina</button>
        </div>
        ${alertHTML}
        <div class="grid-4 mt-4">
            ${statCard('👥',d.activeUsers,'Usuarios Activos',`de ${d.totalUsers} total`,'var(--green)')}
            ${statCard('⚠️',d.expiredUsers,'Membresías Vencidas','Requieren atención','var(--red)')}
            ${statCard('🏋',d.availableMachines,'Máquinas Disponibles',`de ${d.totalMachines} total`,'var(--pink)')}
            ${statCard('🔧',d.maintenanceMachines,'En Mantenimiento','En revisión','var(--amber)')}
        </div>
        <div class="grid-2 mt-4">
            <div class="card"><h3 style="font-size:14px;font-weight:600;margin-bottom:16px">📊 Usuarios por Objetivo</h3>${barHTML(d.usersByObjective, maxObj)}</div>
            <div class="card"><h3 style="font-size:14px;font-weight:600;margin-bottom:16px">🏋 Máquinas por Grupo</h3>${barHTML(d.machinesByGroup, maxGrp)}</div>
        </div>
        <div class="card mt-4">
            <h3 style="font-size:14px;font-weight:600;margin-bottom:16px">Accesos Rápidos</h3>
            <div class="quick-grid">
                <button class="quick-btn" onclick="navigate('users')"><span class="qi">👥</span>Nuevo Usuario</button>
                <button class="quick-btn" onclick="navigate('machines')"><span class="qi">🏋</span>Agregar Máquina</button>
                <button class="quick-btn" onclick="navigate('routines')"><span class="qi">📋</span>Crear Rutina</button>
                <button class="quick-btn" onclick="navigate('dashboard')"><span class="qi">📊</span>Actualizar</button>
            </div>
        </div>`;
    } catch(e) { vc.innerHTML = `<p style="color:var(--red)">${e.message}</p>`; }
}

function statCard(icon, value, label, sub, color) {
    return `<div class="card glow stat-card">
        <div class="stat-icon" style="background:${color}15;color:${color}">${icon}</div>
        <div><div class="stat-value">${value}</div><div class="stat-label">${label}</div><div class="stat-sub" style="color:${color}">${sub}</div></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════
async function renderUsers(search='') {
    const vc = document.getElementById('view-container');
    try {
        const users = await api('users?search=' + encodeURIComponent(search));
        vc.innerHTML = `
        <div class="page-header flex justify-between items-center flex-wrap gap-3">
            <div><h1>Gestión de Usuarios</h1><p>${users.length} usuarios registrados</p></div>
            <button class="btn btn-pink" onclick="openUserModal()">➕ Nuevo Usuario</button>
        </div>
        <div class="search-bar">
            <span class="search-icon">🔍</span>
            <input id="user-search" placeholder="Buscar por nombre, correo o ID..." value="${search}" oninput="debounceUserSearch()">
        </div>
        <div class="flex flex-col gap-3" id="user-list">
            ${users.map(u => userRowHTML(u)).join('')}
            ${users.length===0 ? '<div class="card text-center" style="padding:40px;color:var(--text-muted)">No se encontraron usuarios</div>' : ''}
        </div>`;
    } catch(e) { vc.innerHTML = `<p style="color:var(--red)">${e.message}</p>`; }
}

let _userSearchTimer;
function debounceUserSearch() {
    clearTimeout(_userSearchTimer);
    _userSearchTimer = setTimeout(() => renderUsers(document.getElementById('user-search')?.value || ''), 300);
}

function userRowHTML(u) {
    return `<div class="card glow user-row">
        <div class="user-avatar">${u.name.charAt(0)}</div>
        <div class="user-info">
            <div class="name">${u.name} <span class="badge ${u.status==='active'?'badge-active':'badge-expired'}">${u.status==='active'?'Activo':'Vencido'}</span></div>
            <div class="meta">${u.email} · ${u.objective||'—'} · ${u.experience||'—'}</div>
            <div class="meta">Membresía: ${u.membershipEnd||'—'} · Días: ${(u.attendanceDays||[]).join(', ')||'—'}</div>
        </div>
        <div class="user-actions">
            <button class="btn btn-ghost btn-sm" onclick="openPaymentModal(${u.id},'${u.name}')" title="Pago">💳</button>
            <button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})" title="Editar">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteUser(${u.id})" title="Eliminar">🗑️</button>
        </div>
    </div>`;
}

function openUserModal(id=null) {
    if (id) {
        api('users/'+id).then(u => {
            showModal('Editar Usuario', userFormHTML(u), false);
        });
    } else {
        showModal('Nuevo Usuario', userFormHTML(null), false);
    }
}

function userFormHTML(u) {
    const v = u || {name:'',email:'',objective:'',experience:'',limitations:'',attendanceDays:[],membershipEnd:'',paymentPeriod:''};
    const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    const objs = ['Tonificación','Volumen','Perder grasa','Fuerza','Pierna','Resistencia'];
    const exps = ['principiante','intermedio','avanzado'];
    return `
    <div class="flex flex-col gap-4">
        <div class="input-group"><label>Nombre</label><input id="uf-name" value="${v.name}"></div>
        <div class="input-group"><label>Correo</label><input id="uf-email" type="email" value="${v.email}"></div>
        ${!u ? '<div class="input-group"><label>Contraseña</label><input id="uf-pw" value="user123"></div>' : ''}
        <div class="input-group"><label>Objetivo</label><select id="uf-obj"><option value="">Seleccionar...</option>${objs.map(o=>`<option ${v.objective===o?'selected':''}>${o}</option>`).join('')}</select></div>
        <div class="input-group"><label>Experiencia</label><select id="uf-exp"><option value="">Seleccionar...</option>${exps.map(e=>`<option ${v.experience===e?'selected':''}>${e}</option>`).join('')}</select></div>
        <div class="input-group"><label>Limitaciones</label><input id="uf-lim" value="${v.limitations||''}" placeholder="Lesiones o restricciones"></div>
        <div class="input-group"><label>Membresía hasta</label><input id="uf-memb" type="date" value="${v.membershipEnd||''}"></div>
        <div class="input-group"><label>Días de Asistencia</label>
            <div class="chip-group" id="uf-days">${days.map(d=>`<button class="chip ${(v.attendanceDays||[]).includes(d)?'active':''}" onclick="this.classList.toggle('active')" data-day="${d}">${d.slice(0,3)}</button>`).join('')}</div>
        </div>
        <button class="btn btn-pink w-full" onclick="saveUser(${u?u.id:'null'})">${u?'Guardar Cambios':'Registrar Usuario'}</button>
    </div>`;
}

async function saveUser(id) {
    const days = [...document.querySelectorAll('#uf-days .chip.active')].map(c=>c.dataset.day);
    const body = {
        name: document.getElementById('uf-name').value,
        email: document.getElementById('uf-email').value,
        objective: document.getElementById('uf-obj').value,
        experience: document.getElementById('uf-exp').value,
        limitations: document.getElementById('uf-lim').value,
        membershipEnd: document.getElementById('uf-memb').value || null,
        attendanceDays: days,
    };
    if (!id) body.password = document.getElementById('uf-pw')?.value || 'user123';
    try {
        if (id) await api('users/'+id, 'PUT', body);
        else    await api('users', 'POST', body);
        closeModal();
        renderUsers();
    } catch(e) { alert(e.message); }
}

async function deleteUser(id) {
    if (!confirm('¿Eliminar este usuario?')) return;
    await api('users/'+id, 'DELETE');
    renderUsers();
}

function openPaymentModal(id, name) {
    const periods = ['Semanal','Quincenal','Mensual','Anual'];
    const sub = {Semanal:'7 días',Quincenal:'15 días',Mensual:'30 días',Anual:'365 días'};
    showModal('Actualizar Pago', `
        <p style="font-size:14px;color:var(--text-dim);margin-bottom:16px">Renovar membresía de <b style="color:var(--text)">${name}</b></p>
        <div class="period-grid">${periods.map(p=>`<button class="period-option" data-p="${p}" onclick="selectPeriod(this)"><div class="period-name">${p}</div><div class="period-sub">${sub[p]}</div></button>`).join('')}</div>
        <button class="btn btn-pink w-full mt-4" id="pay-btn" disabled onclick="doRenew(${id})">Confirmar Pago</button>
    `, false);
}

function selectPeriod(el) {
    document.querySelectorAll('.period-option').forEach(b=>b.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('pay-btn').disabled = false;
}

async function doRenew(id) {
    const period = document.querySelector('.period-option.active')?.dataset.p;
    if (!period) return;
    await api('users/'+id+'/renew', 'POST', {period});
    closeModal();
    renderUsers();
}

// ═══════════════════════════════════════════════════════════
// MACHINES
// ═══════════════════════════════════════════════════════════
async function renderMachines(filter='') {
    const vc = document.getElementById('view-container');
    try {
        const machines = await api('machines' + (filter ? '?group='+encodeURIComponent(filter) : ''));
        const groups = ['Piernas','Pecho','Espalda','Hombros','Brazos','Core','Multi'];
        vc.innerHTML = `
        <div class="page-header flex justify-between items-center flex-wrap gap-3">
            <div><h1>Gestión de Máquinas</h1><p>${machines.length} máquinas registradas</p></div>
            <button class="btn btn-pink" onclick="openMachineModal()">➕ Nueva Máquina</button>
        </div>
        <div class="chip-group">
            <button class="chip ${!filter?'active':''}" onclick="renderMachines('')">Todas</button>
            ${groups.map(g=>`<button class="chip ${filter===g?'active':''}" onclick="renderMachines('${g}')">${g}</button>`).join('')}
        </div>
        <div class="machine-grid">
            ${machines.map(m => machineCardHTML(m)).join('')}
        </div>`;
    } catch(e) { vc.innerHTML = `<p style="color:var(--red)">${e.message}</p>`; }
}

function machineCardHTML(m) {
    return `<div class="card glow machine-card">
        <div class="machine-icon">${m.imageEmoji}</div>
        <div class="machine-name">${m.name}</div>
        <div class="machine-badges">
            <span class="badge badge-pink">${m.muscleGroup}</span>
            <span class="badge ${m.status==='available'?'badge-active':'badge-maint'}">${m.status==='available'?'Disponible':'Mantenimiento'}</span>
        </div>
        ${m.description ? `<div class="machine-desc">${m.description}</div>` : ''}
        <div class="machine-actions">
            <button class="btn btn-ghost btn-sm" onclick="openMachineModal(${m.id})">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteMachine(${m.id})">🗑️</button>
        </div>
    </div>`;
}

function openMachineModal(id=null) {
    if (id) {
        api('machines').then(machines => {
            const m = machines.find(x=>x.id===id);
            if (m) showModal('Editar Máquina', machineFormHTML(m), false);
        });
    } else {
        showModal('Nueva Máquina', machineFormHTML(null), false);
    }
}

function machineFormHTML(m) {
    const v = m || {name:'',muscleGroup:'',description:'',imageEmoji:'🏋',status:'available'};
    const groups = ['Piernas','Pecho','Espalda','Hombros','Brazos','Core','Multi'];
    const emojis = ['🏋','💪','🦵','🔥','⚡','🎯','🫀','🧘'];
    return `
    <div class="flex flex-col gap-4">
        <div class="input-group"><label>Nombre</label><input id="mf-name" value="${v.name}"></div>
        <div class="input-group"><label>Grupo Muscular</label><select id="mf-group"><option value="">Seleccionar...</option>${groups.map(g=>`<option ${v.muscleGroup===g?'selected':''}>${g}</option>`).join('')}</select></div>
        <div class="input-group"><label>Estado</label><select id="mf-status"><option value="available" ${v.status==='available'?'selected':''}>Disponible</option><option value="maintenance" ${v.status==='maintenance'?'selected':''}>Mantenimiento</option></select></div>
        <div class="input-group"><label>Descripción</label><input id="mf-desc" value="${v.description||''}" placeholder="Descripción breve"></div>
        <div class="input-group"><label>Ícono</label>
            <div class="chip-group" id="mf-emoji">${emojis.map(e=>`<button class="chip ${v.imageEmoji===e?'active':''}" style="font-size:20px;padding:8px 12px" onclick="selectEmoji(this,'${e}')" data-e="${e}">${e}</button>`).join('')}</div>
        </div>
        <button class="btn btn-pink w-full" onclick="saveMachine(${m?m.id:'null'})">${m?'Guardar Cambios':'Registrar Máquina'}</button>
    </div>`;
}

function selectEmoji(el, emoji) {
    document.querySelectorAll('#mf-emoji .chip').forEach(c=>c.classList.remove('active'));
    el.classList.add('active');
}

async function saveMachine(id) {
    const emoji = document.querySelector('#mf-emoji .chip.active')?.dataset.e || '🏋';
    const body = {
        name: document.getElementById('mf-name').value,
        muscleGroup: document.getElementById('mf-group').value,
        status: document.getElementById('mf-status').value,
        description: document.getElementById('mf-desc').value,
        imageEmoji: emoji
    };
    try {
        if (id) await api('machines/'+id, 'PUT', body);
        else    await api('machines', 'POST', body);
        closeModal();
        renderMachines();
    } catch(e) { alert(e.message); }
}

async function deleteMachine(id) {
    if (!confirm('¿Eliminar esta máquina?')) return;
    await api('machines/'+id, 'DELETE');
    renderMachines();
}

// ═══════════════════════════════════════════════════════════
// ROUTINES
// ═══════════════════════════════════════════════════════════
async function renderRoutines() {
    const vc = document.getElementById('view-container');
    if (WIZ.step > 0) { renderWizard(); return; }
    try {
        const routines = await api('routines');
        vc.innerHTML = `
        <div class="page-header flex justify-between items-center flex-wrap gap-3">
            <div><h1>Gestión de Rutinas</h1><p>${routines.length} rutinas creadas</p></div>
            <button class="btn btn-pink" onclick="startWizard()">➕ Nueva Rutina</button>
        </div>
        ${routines.length===0 ? '<div class="card text-center" style="padding:60px"><div style="font-size:48px;margin-bottom:16px">📋</div><p style="color:var(--text-dim);font-size:14px">No hay rutinas creadas aún</p><button class="btn btn-pink btn-sm mt-4" onclick="startWizard()">Crear primera rutina</button></div>' : ''}
        <div class="flex flex-col gap-3">
            ${routines.map(r => {
                const dayCount = Object.keys(r.exercisesByDay).length;
                const totalEx = Object.values(r.exercisesByDay).reduce((s,exs)=>s+exs.length, 0);
                return `<div class="card glow user-row">
                    <div class="user-avatar">${(r.userName||'?').charAt(0)}</div>
                    <div class="user-info">
                        <div class="name">${r.userName}</div>
                        <div class="meta">${dayCount} días · ${totalEx} ejercicios · ${r.name||''}</div>
                        <div class="meta">Creada: ${r.createdAt ? new Date(r.createdAt).toLocaleDateString('es') : '—'}</div>
                    </div>
                    <div class="user-actions">
                        <button class="btn btn-secondary btn-sm" onclick="editRoutine(${r.id})">✏️ Editar</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteRoutine(${r.id})">🗑️</button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    } catch(e) { vc.innerHTML = `<p style="color:var(--red)">${e.message}</p>`; }
}

async function deleteRoutine(id) {
    if (!confirm('¿Eliminar esta rutina?')) return;
    await api('routines/'+id, 'DELETE');
    renderRoutines();
}

async function editRoutine(id) {
    const r = await api('routines/'+id);
    WIZ.step = 5;
    WIZ.editingId = r.id;
    WIZ.routine = r;
    WIZ.user = {id:r.userId, name:r.userName};
    renderWizard();
}

function startWizard() {
    WIZ = {step:1, user:null, data:{objective:'',experience:'',days:[],limitations:'',paymentPeriod:''}, routine:null, editingId:null};
    renderWizard();
}

async function renderWizard() {
    const vc = document.getElementById('view-container');
    const step = WIZ.step;

    // Progress bar
    const progress = step <= 4 ? `<div class="wizard-steps">${[1,2,3,4].map(s=>`<div class="wizard-step ${s<=step?'active':''}"></div>`).join('')}</div>` : '';
    const titles = ['','Seleccionar Usuario','Datos del Usuario','Duración de Pago','Generar Rutina','Rutina Generada'];
    const back = `<button class="btn btn-ghost" onclick="${step>1?'WIZ.step='+(step===5&&!WIZ.editingId?4:0)+';renderRoutines()':'WIZ.step=0;renderRoutines()'}">⬅ Volver</button>`;

    let content = '';

    if (step === 1) {
        const users = await api('users');
        content = `<div class="card" style="padding:24px"><div class="search-bar" style="margin-bottom:16px"><span class="search-icon">🔍</span><input id="wiz-search" placeholder="Buscar usuario..." oninput="filterWizUsers()"></div>
        <div class="flex flex-col gap-2 overflow-auto" style="max-height:400px" id="wiz-user-list">
            ${users.map(u => `<button class="wizard-user-item" onclick="wizSelectUser(${u.id})">
                <div class="user-avatar" style="width:40px;height:40px;font-size:14px">${u.name.charAt(0)}</div>
                <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">${u.name}</div><div style="font-size:12px;color:var(--text-muted)">${u.email} · ${u.objective||'—'}</div></div>
                <span class="badge ${u.status==='active'?'badge-active':'badge-expired'}">${u.status==='active'?'Activo':'Vencido'}</span>
                <span style="color:var(--text-muted)">▸</span>
            </button>`).join('')}
        </div></div>`;
    }

    if (step === 2) {
        const u = WIZ.user;
        const d = WIZ.data;
        const objs = ['Tonificación','Volumen','Perder grasa','Fuerza','Pierna','Resistencia'];
        const exps = ['principiante','intermedio','avanzado'];
        const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
        content = `<div class="card anim-slide" style="padding:24px">
            <div class="flex items-center gap-3 mb-4" style="padding-bottom:16px;border-bottom:1px solid var(--border)">
                <div class="user-avatar">${u.name.charAt(0)}</div>
                <div><div style="font-size:18px;font-weight:700">${u.name}</div><div style="font-size:12px;color:var(--text-muted)">${u.email}</div></div>
            </div>
            <div class="flex flex-col gap-4">
                <div class="input-group"><label>Objetivo</label><select id="wz-obj" onchange="WIZ.data.objective=this.value"><option value="">Seleccionar...</option>${objs.map(o=>`<option ${d.objective===o?'selected':''}>${o}</option>`).join('')}</select></div>
                <div class="input-group"><label>Nivel de Experiencia</label><select id="wz-exp" onchange="WIZ.data.experience=this.value"><option value="">Seleccionar...</option>${exps.map(e=>`<option ${d.experience===e?'selected':''}>${e}</option>`).join('')}</select></div>
                <div class="input-group"><label>Limitaciones físicas</label><input id="wz-lim" value="${d.limitations||''}" placeholder="Lesiones o restricciones" oninput="WIZ.data.limitations=this.value"></div>
                <div class="input-group"><label>Días de Asistencia</label>
                    <div class="chip-group">${days.map(dy=>`<button class="chip ${d.days.includes(dy)?'active':''}" onclick="wizToggleDay(this,'${dy}')" data-day="${dy}">${dy}</button>`).join('')}</div>
                </div>
                <button class="btn btn-pink w-full" onclick="wizStep3()" ${d.days.length===0?'disabled':''}>Siguiente ▸</button>
            </div>
        </div>`;
    }

    if (step === 3) {
        const periods = [{n:'Semanal',s:'7 días'},{n:'Quincenal',s:'15 días'},{n:'Mensual',s:'30 días'},{n:'Anual',s:'365 días'}];
        content = `<div class="card anim-slide" style="padding:24px">
            <p style="font-size:14px;color:var(--text-dim);margin-bottom:16px">Periodo de pago para <b style="color:var(--text)">${WIZ.user.name}</b></p>
            <div class="period-grid">${periods.map(p=>`<button class="period-option ${WIZ.data.paymentPeriod===p.n?'active':''}" data-p="${p.n}" onclick="WIZ.data.paymentPeriod='${p.n}';renderWizard()"><div class="period-name">${p.n}</div><div class="period-sub">${p.s}</div></button>`).join('')}</div>
            <button class="btn btn-pink w-full mt-4" onclick="WIZ.step=4;renderWizard()" ${!WIZ.data.paymentPeriod?'disabled':''}>Siguiente ▸</button>
        </div>`;
    }

    if (step === 4) {
        const d = WIZ.data;
        content = `<div class="card anim-slide" style="padding:24px">
            <h3 style="font-size:18px;font-weight:700;margin-bottom:16px">Resumen</h3>
            <div class="summary-grid">
                ${[['Usuario',WIZ.user.name],['Objetivo',d.objective],['Nivel',d.experience],['Días',d.days.join(', ')],['Limitaciones',d.limitations||'Ninguna'],['Periodo',d.paymentPeriod]].map(([l,v])=>`<div class="summary-item"><div class="slbl">${l}</div><div class="sval">${v}</div></div>`).join('')}
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin-top:16px">🔧 La rutina usará solo máquinas registradas y disponibles</p>
            <button class="btn btn-pink w-full mt-4" onclick="doGenerateRoutine()">⚡ Generar Rutina</button>
        </div>`;
    }

    if (step === 5) {
        content = renderRoutineEditor();
    }

    vc.innerHTML = `
        <div class="flex items-center gap-3 mb-4">${back}<div><h1 style="font-size:20px;font-weight:700">${WIZ.editingId?'Editar Rutina':'Crear Rutina'}</h1><p style="font-size:13px;color:var(--text-muted)">${titles[step]||''}</p></div></div>
        ${progress}
        ${content}`;
}

async function wizSelectUser(id) {
    const u = await api('users/'+id);
    WIZ.user = u;
    WIZ.data = {objective:u.objective||'', experience:u.experience||'', days:[...(u.attendanceDays||[])], limitations:u.limitations||'', paymentPeriod:''};
    WIZ.step = 2;
    renderWizard();
}

function wizToggleDay(el, day) {
    el.classList.toggle('active');
    if (WIZ.data.days.includes(day)) WIZ.data.days = WIZ.data.days.filter(d=>d!==day);
    else WIZ.data.days.push(day);
}

function wizStep3() {
    WIZ.data.objective = document.getElementById('wz-obj')?.value || WIZ.data.objective;
    WIZ.data.experience = document.getElementById('wz-exp')?.value || WIZ.data.experience;
    WIZ.data.limitations = document.getElementById('wz-lim')?.value || WIZ.data.limitations;
    WIZ.step = 3;
    renderWizard();
}

async function doGenerateRoutine() {
    try {
        const r = await api('routines/generate', 'POST', {
            userId: WIZ.user.id, objective: WIZ.data.objective,
            experience: WIZ.data.experience, days: WIZ.data.days,
            limitations: WIZ.data.limitations, paymentPeriod: WIZ.data.paymentPeriod
        });
        WIZ.routine = r;
        WIZ.editingId = r.id;
        WIZ.step = 5;
        renderWizard();
    } catch(e) { alert(e.message); }
}

function renderRoutineEditor() {
    const r = WIZ.routine;
    if (!r) return '<p>No hay rutina</p>';
    const days = Object.entries(r.exercisesByDay);

    const dayChips = days.map(([d])=>`<a href="#rday-${d}" class="chip active" style="font-size:12px">${d}</a>`).join('');

    let html = `<div class="chip-group mb-3">${dayChips}</div>`;

    for (const [day, exs] of days) {
        html += `<div class="routine-day-header" id="rday-${day}">
            <h3>📅 ${day} <span class="badge badge-pink">${exs.length} ejercicios</span></h3>
            <button class="btn btn-ghost btn-sm" onclick="addExerciseToDay('${day}')">➕ Agregar</button>
        </div>
        <div class="routine-exercise-grid mb-4">
            ${exs.map(ex => `<div class="card glow routine-ex-card">
                <div class="routine-ex-icon">${ex.machineEmoji}</div>
                <div class="routine-ex-info">
                    <div class="routine-ex-name">${ex.exerciseName}</div>
                    <div class="routine-ex-machine">Máquina: ${ex.machineName}</div>
                    <div class="routine-ex-stats">
                        <span>${ex.sets} series</span> <span>${ex.reps} reps</span> <span>${ex.restSeconds} descanso</span>
                    </div>
                </div>
                <div class="routine-ex-actions">
                    <button class="btn btn-ghost btn-sm" onclick="openEditExercise('${day}',${ex.id})">✏️</button>
                    <button class="btn btn-ghost btn-sm" onclick="removeExercise('${day}',${ex.id})">🗑️</button>
                </div>
            </div>`).join('')}
        </div>`;
    }

    html += `<button class="btn btn-pink btn-lg w-full mt-4" onclick="saveFullRoutine()">💾 Guardar Rutina</button>`;
    return html;
}

function removeExercise(day, exId) {
    WIZ.routine.exercisesByDay[day] = WIZ.routine.exercisesByDay[day].filter(e=>e.id!==exId);
    if (WIZ.routine.exercisesByDay[day].length === 0) delete WIZ.routine.exercisesByDay[day];
    renderWizard();
}

async function addExerciseToDay(day) {
    const machines = await api('machines');
    const avail = machines.filter(m=>m.status==='available');
    if (!avail.length) { alert('No hay máquinas disponibles'); return; }
    const m = avail[Math.floor(Math.random()*avail.length)];
    if (!WIZ.routine.exercisesByDay[day]) WIZ.routine.exercisesByDay[day] = [];
    WIZ.routine.exercisesByDay[day].push({
        id: Date.now(), machineId: m.id, machineName: m.name, machineEmoji: m.imageEmoji,
        dayOfWeek: day, exerciseName: m.name, sets:3, reps:12, restSeconds:'60s', completed:false
    });
    renderWizard();
}

function openEditExercise(day, exId) {
    const ex = WIZ.routine.exercisesByDay[day]?.find(e=>e.id===exId);
    if (!ex) return;
    showModal('Editar Ejercicio', `
        <div class="flex flex-col gap-4">
            <div class="input-group"><label>Nombre</label><input id="ee-name" value="${ex.exerciseName}"></div>
            <div class="grid-3">
                <div class="input-group"><label>Series</label><input id="ee-sets" type="number" value="${ex.sets}"></div>
                <div class="input-group"><label>Reps</label><input id="ee-reps" type="number" value="${ex.reps}"></div>
                <div class="input-group"><label>Descanso</label><input id="ee-rest" value="${ex.restSeconds}"></div>
            </div>
            <button class="btn btn-pink w-full" onclick="saveEditExercise('${day}',${exId})">Guardar Cambios</button>
        </div>
    `, false);
}

function saveEditExercise(day, exId) {
    const ex = WIZ.routine.exercisesByDay[day]?.find(e=>e.id===exId);
    if (!ex) return;
    ex.exerciseName = document.getElementById('ee-name').value;
    ex.sets = parseInt(document.getElementById('ee-sets').value) || 3;
    ex.reps = parseInt(document.getElementById('ee-reps').value) || 12;
    ex.restSeconds = document.getElementById('ee-rest').value || '60s';
    closeModal();
    renderWizard();
}

async function saveFullRoutine() {
    if (!WIZ.editingId) return;
    const exercises = [];
    let sort = 0;
    for (const [day, exs] of Object.entries(WIZ.routine.exercisesByDay)) {
        for (const ex of exs) {
            exercises.push({machineId:ex.machineId, dayOfWeek:day, exerciseName:ex.exerciseName, sets:ex.sets, reps:ex.reps, restSeconds:ex.restSeconds, sortOrder:sort++});
        }
    }
    try {
        await api('routines/'+WIZ.editingId, 'PUT', {name:WIZ.routine.name, exercises});
        WIZ.step = 0;
        renderRoutines();
    } catch(e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════
// USER VIEW: MY ROUTINE
// ═══════════════════════════════════════════════════════════
let SELECTED_DAY = null;
let COMPLETED_SET = new Set();

async function renderMyRoutine() {
    const vc = document.getElementById('view-container');
    try {
        const r = await api('routines/user/' + AUTH.userId);
        const days = Object.entries(r.exercisesByDay);
        const totalEx = days.reduce((s,[_,exs])=>s+exs.length, 0);

        // Build completed set
        COMPLETED_SET = new Set();
        for (const [_, exs] of days) for (const ex of exs) if (ex.completed) COMPLETED_SET.add(ex.id);
        const completedCount = COMPLETED_SET.size;
        const pct = totalEx ? Math.round(completedCount/totalEx*100) : 0;

        const tips = ["Recuerda calentar 5-10 min antes de entrenar","Hidratación: bebe agua cada 15 min","Controla la respiración en cada repetición","Descansa 48h antes de trabajar el mismo grupo muscular"];
        const tip = tips[Math.floor(Math.random()*tips.length)];

        vc.innerHTML = `
        <div class="page-header"><h1>Mi Rutina Semanal</h1><p>¡Hola ${AUTH.userName}! Tu progreso esta semana</p></div>
        <div class="card mb-4">
            <div class="flex justify-between items-center mb-3">
                <span style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;font-weight:600">Progreso Semanal</span>
                <span style="font-size:14px;font-weight:700;color:var(--pink)">${pct}%</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <p style="font-size:12px;color:var(--text-muted);margin-top:8px">${completedCount} de ${totalEx} ejercicios completados</p>
        </div>
        <div class="tip-box mb-4"><span class="tip-icon">⭐</span><span class="tip-text">${tip}</span></div>
        <div class="day-chips mb-4">
            ${days.map(([day, exs]) => {
                const allDone = exs.every(e=>COMPLETED_SET.has(e.id));
                return `<button class="day-chip ${SELECTED_DAY===day?'active':''} ${allDone&&SELECTED_DAY!==day?'completed':''}" onclick="selectDay('${day}')">
                    <div class="day-label">${day.slice(0,3)}</div>
                    <div class="day-count">${exs.length} ej.</div>
                    ${allDone?'<span style="font-size:14px">✅</span>':''}
                </button>`;
            }).join('')}
        </div>
        <div id="day-exercises">
            ${SELECTED_DAY && r.exercisesByDay[SELECTED_DAY]
                ? `<h3 style="font-size:18px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px">📅 ${SELECTED_DAY}</h3>
                   <div class="flex flex-col gap-3 anim-slide">${r.exercisesByDay[SELECTED_DAY].map(ex => exerciseCardHTML(ex)).join('')}</div>`
                : '<div class="card text-center" style="padding:40px"><div style="font-size:36px;margin-bottom:12px">📅</div><p style="font-size:14px;color:var(--text-dim)">Selecciona un día para ver tus ejercicios</p></div>'
            }
        </div>`;
    } catch(e) {
        if (e.message.includes('expirado') || e.message.includes('expired')) {
            const u = await api('users/'+AUTH.userId);
            vc.innerHTML = `<div class="expired-screen"><div class="card expired-box">
                <div class="expired-icon">⚠️</div>
                <h2>Acceso Expirado</h2>
                <p>Tu membresía ha vencido. Contacta a recepción para renovar tu membresía y volver a acceder a tu rutina.</p>
                <div class="expired-date"><div class="dl">Membresía válida hasta</div><div class="dv">${u.membershipEnd||'—'}</div></div>
            </div></div>`;
        } else if (e.message.includes('rutina')) {
            vc.innerHTML = `<div class="expired-screen"><div class="card expired-box">
                <div style="font-size:48px;margin-bottom:16px">📋</div>
                <h2>Sin Rutina Asignada</h2>
                <p>Tu entrenador aún no te ha asignado una rutina. Pregunta en recepción.</p>
            </div></div>`;
        } else {
            vc.innerHTML = `<p style="color:var(--red)">${e.message}</p>`;
        }
    }
}

function selectDay(day) {
    SELECTED_DAY = SELECTED_DAY === day ? null : day;
    renderMyRoutine();
}

function exerciseCardHTML(ex) {
    const done = COMPLETED_SET.has(ex.id);
    return `<div class="card glow exercise-card ${done?'done':''}">
        <div class="exercise-icon">${ex.machineEmoji}</div>
        <div class="exercise-info">
            <div class="exercise-name">${ex.exerciseName} ${done?'<span style="color:var(--green)">✅</span>':''}</div>
            <div class="exercise-machine">Máquina: ${ex.machineName}</div>
            <div class="exercise-stats">
                <div class="exercise-stat"><div class="val">${ex.sets}</div><div class="lbl">Series</div></div>
                <div class="exercise-stat-divider"></div>
                <div class="exercise-stat"><div class="val">${ex.reps}</div><div class="lbl">Reps</div></div>
                <div class="exercise-stat-divider"></div>
                <div class="exercise-stat"><div class="val pink">${ex.restSeconds}</div><div class="lbl">Descanso</div></div>
            </div>
        </div>
        <button class="exercise-check ${done?'checked':''}" onclick="toggleExercise(${ex.id})">
            ${done?'✅':'✓'}
        </button>
    </div>`;
}

async function toggleExercise(exId) {
    try {
        const res = await api('routines/progress', 'POST', {routineExerciseId: exId});
        if (res.completed) COMPLETED_SET.add(exId);
        else COMPLETED_SET.delete(exId);
        renderMyRoutine();
    } catch(e) { alert(e.message); }
}

// ═══════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════
function showModal(title, bodyHTML, wide=false) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-box').classList.toggle('wide', wide);
    document.getElementById('modal').classList.add('show');
}

function closeModal() {
    document.getElementById('modal').classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
// Show mobile brand on small screens
if (window.innerWidth < 1024) {
    const mb = document.getElementById('login-mobile-brand');
    if (mb) mb.style.display = 'flex';
}
