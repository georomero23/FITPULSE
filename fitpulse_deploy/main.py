"""
FitPulse Gym Management — Backend FastAPI
Desplegado en Render.com con PostgreSQL (Supabase)
Ejecutar local: python main.py
"""

import json, random, os
from datetime import datetime, timedelta
from typing import Optional

import bcrypt, psycopg2, uvicorn
from jose import jwt, JWTError
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ═══════════════════════════════════════════════════════════════
# CONFIG  (todas las variables sensibles vienen de env)
# ═══════════════════════════════════════════════════════════════
DATABASE_URL = os.environ.get("DATABASE_URL", "")   # Supabase/Render PostgreSQL URL
JWT_SECRET   = os.environ.get("JWT_SECRET", "FitPulse_SuperSecretKey_2026_Dev_Only")
JWT_ALGO     = "HS256"
JWT_EXPIRE   = 480  # minutos
PORT         = int(os.environ.get("PORT", 8080))

app = FastAPI(title="FitPulse API")

# ═══════════════════════════════════════════════════════════════
# DATABASE HELPERS
# ═══════════════════════════════════════════════════════════════

class CIDict(dict):
    """Dict con keys case-insensitive (PostgreSQL devuelve lowercase, el código usa TitleCase)."""
    def __getitem__(self, key):
        return super().__getitem__(key.lower() if isinstance(key, str) else key)
    def get(self, key, default=None):
        return super().get(key.lower() if isinstance(key, str) else key, default)
    def __contains__(self, key):
        return super().__contains__(key.lower() if isinstance(key, str) else key)

def get_conn():
    return psycopg2.connect(DATABASE_URL)

def query(sql, params=(), fetch="all"):
    """Ejecuta SQL y devuelve lista de CIDict o un solo CIDict."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(sql, params)
    if fetch == "none":
        conn.commit()
        affected = cursor.rowcount
        cursor.close(); conn.close()
        return affected
    cols = [c[0].lower() for c in cursor.description]
    if fetch == "one":
        row = cursor.fetchone()
        cursor.close(); conn.close()
        return CIDict(zip(cols, row)) if row else None
    rows = cursor.fetchall()
    cursor.close(); conn.close()
    return [CIDict(zip(cols, r)) for r in rows]

def insert_return_id(sql, params=()):
    """INSERT y devuelve el nuevo id (usa RETURNING id de PostgreSQL)."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(sql + " RETURNING id", params)
    new_id = cursor.fetchone()[0]
    conn.commit()
    cursor.close(); conn.close()
    return new_id

# ═══════════════════════════════════════════════════════════════
# AUTH HELPERS
# ═══════════════════════════════════════════════════════════════
def hash_pw(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def check_pw(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_token(user_id: int, email: str, name: str, role: str) -> str:
    payload = {
        "sub": str(user_id), "email": email, "name": name, "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(401, "Token inválido o expirado")

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "No autenticado")
    return decode_token(auth[7:])

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "Admin":
        raise HTTPException(403, "Solo administradores")
    return user

# ═══════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════
class LoginReq(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    name: str
    email: str
    password: str = "user123"
    objective: Optional[str] = None
    experience: Optional[str] = None
    limitations: Optional[str] = None
    attendanceDays: list[str] = []
    membershipEnd: Optional[str] = None
    paymentPeriod: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    objective: Optional[str] = None
    experience: Optional[str] = None
    limitations: Optional[str] = None
    attendanceDays: Optional[list[str]] = None
    membershipEnd: Optional[str] = None
    paymentPeriod: Optional[str] = None
    status: Optional[str] = None

class RenewReq(BaseModel):
    period: str

class MachineCreate(BaseModel):
    name: str
    muscleGroup: str
    description: Optional[str] = None
    imageEmoji: str = "🏋"
    status: str = "available"

class GenerateRoutineReq(BaseModel):
    userId: int
    objective: str
    experience: str
    days: list[str]
    limitations: Optional[str] = None
    paymentPeriod: str = "Mensual"

class RoutineExerciseIn(BaseModel):
    machineId: int
    dayOfWeek: str
    exerciseName: str
    sets: int = 3
    reps: int = 12
    restSeconds: str = "60s"
    sortOrder: int = 0

class RoutineUpdate(BaseModel):
    name: Optional[str] = None
    exercises: list[RoutineExerciseIn] = []

class ToggleProgressReq(BaseModel):
    routineExerciseId: int

# ═══════════════════════════════════════════════════════════════
# SEED DATABASE
# ═══════════════════════════════════════════════════════════════
def seed_database():
    """Inserta datos iniciales si la tabla está vacía."""
    try:
        existing = query("SELECT COUNT(*) AS c FROM users", fetch="one")
        if existing and existing["c"] > 0:
            return
    except Exception as e:
        print(f"⚠️  No se pudo conectar: {e}")
        return

    admin_hash = hash_pw("admin123")
    user_hash  = hash_pw("user123")

    insert_return_id(
        "INSERT INTO users(name,email,passwordhash,roleid,status) VALUES(%s,%s,%s,%s,%s)",
        ("Administrador", "admin@fitpulse.com", admin_hash, 1, "active"))

    users = [
        ("María López",    "maria@gym.com",  "Tonificación", "intermedio",   "Ninguna",               '["Lunes","Miércoles","Viernes"]',             "2026-04-15","Mensual",  "active"),
        ("Carlos Ruiz",    "carlos@gym.com", "Volumen",      "avanzado",     "Lesión rodilla derecha",'["Lunes","Martes","Jueves","Viernes","Sábado"]',"2026-03-01","Mensual",  "expired"),
        ("Ana García",     "ana@gym.com",    "Perder grasa", "principiante", "Ninguna",               '["Martes","Jueves"]',                          "2026-05-20","Quincenal","active"),
        ("Pedro Martínez", "pedro@gym.com",  "Fuerza",       "avanzado",     "Dolor lumbar crónico",  '["Lunes","Miércoles","Viernes","Sábado"]',     "2026-02-10","Mensual",  "expired"),
        ("Laura Sánchez",  "laura@gym.com",  "Pierna",       "intermedio",   "Ninguna",               '["Lunes","Miércoles","Viernes"]',              "2026-06-01","Mensual",  "active"),
        ("Diego Torres",   "diego@gym.com",  "Volumen",      "principiante", "Ninguna",              '["Martes","Jueves","Sábado"]',                 "2026-04-30","Semanal",  "active"),
    ]
    for u in users:
        insert_return_id(
            """INSERT INTO users(name,email,passwordhash,roleid,
               objective,experience,limitations,attendancedays,
               membershipend,paymentperiod,status)
               VALUES(%s,%s,%s,2,%s,%s,%s,%s,%s,%s,%s)""",
            (u[0], u[1], user_hash, u[2], u[3], u[4], u[5], u[6], u[7], u[8]))

    print("✅ Datos iniciales insertados")

# ═══════════════════════════════════════════════════════════════
# DICT HELPERS
# ═══════════════════════════════════════════════════════════════
def user_to_dict(u):
    days = []
    if u.get("AttendanceDays"):
        try: days = json.loads(u["AttendanceDays"])
        except: days = []
    me = u.get("MembershipEnd")
    if me and hasattr(me, "isoformat"):
        me = me.isoformat()
    return {
        "id": u["Id"], "name": u["Name"], "email": u["Email"],
        "role": u.get("RoleName", "User"),
        "objective": u.get("Objective"), "experience": u.get("Experience"),
        "limitations": u.get("Limitations"),
        "attendanceDays": days,
        "membershipEnd": str(me) if me else None,
        "paymentPeriod": u.get("PaymentPeriod"),
        "status": u.get("Status", "active")
    }

def machine_to_dict(m):
    return {
        "id": m["Id"], "name": m["Name"], "muscleGroup": m["MuscleGroup"],
        "description": m.get("Description"), "imageEmoji": m.get("ImageEmoji", "🏋"),
        "status": m.get("Status", "available")
    }

# ═══════════════════════════════════════════════════════════════
# ROUTES: AUTH
# ═══════════════════════════════════════════════════════════════
@app.post("/api/auth/login")
async def login(req: LoginReq):
    user = query(
        "SELECT u.*, r.name AS rolename FROM users u JOIN roles r ON u.roleid=r.id WHERE u.email=%s",
        (req.email,), fetch="one")
    if not user or not check_pw(req.password, user["PasswordHash"]):
        raise HTTPException(401, "Credenciales incorrectas")
    token = create_token(user["Id"], user["Email"], user["Name"], user["RoleName"])
    return {"token": token, "role": user["RoleName"], "userId": user["Id"], "userName": user["Name"]}

# ═══════════════════════════════════════════════════════════════
# ROUTES: USERS
# ═══════════════════════════════════════════════════════════════
@app.get("/api/users")
async def get_users(search: str = "", _=Depends(require_admin)):
    sql = "SELECT u.*, r.name AS rolename FROM users u JOIN roles r ON u.roleid=r.id WHERE u.roleid=2"
    params = []
    if search:
        sql += " AND (u.name ILIKE %s OR u.email ILIKE %s OR CAST(u.id AS TEXT)=%s)"
        params = [f"%{search}%", f"%{search}%", search]
    sql += " ORDER BY u.name"
    return [user_to_dict(u) for u in query(sql, params)]

@app.get("/api/users/{uid}")
async def get_user(uid: int, _=Depends(get_current_user)):
    u = query("SELECT u.*, r.name AS rolename FROM users u JOIN roles r ON u.roleid=r.id WHERE u.id=%s",
              (uid,), fetch="one")
    if not u: raise HTTPException(404, "Usuario no encontrado")
    return user_to_dict(u)

@app.post("/api/users")
async def create_user(dto: UserCreate, _=Depends(require_admin)):
    exists = query("SELECT id FROM users WHERE email=%s", (dto.email,), fetch="one")
    if exists: raise HTTPException(400, "El correo ya está registrado")
    pw = hash_pw(dto.password)
    new_id = insert_return_id(
        """INSERT INTO users(name,email,passwordhash,roleid,objective,experience,
           limitations,attendancedays,membershipend,paymentperiod,status)
           VALUES(%s,%s,%s,2,%s,%s,%s,%s,%s,%s,%s)""",
        (dto.name, dto.email, pw, dto.objective, dto.experience,
         dto.limitations, json.dumps(dto.attendanceDays),
         dto.membershipEnd, dto.paymentPeriod, "active"))
    u = query("SELECT u.*, r.name AS rolename FROM users u JOIN roles r ON u.roleid=r.id WHERE u.id=%s",
              (new_id,), fetch="one")
    return user_to_dict(u)

@app.put("/api/users/{uid}")
async def update_user(uid: int, dto: UserUpdate, _=Depends(require_admin)):
    u = query("SELECT * FROM users WHERE id=%s", (uid,), fetch="one")
    if not u: raise HTTPException(404)
    sets, params = [], []
    if dto.name is not None:           sets.append("name=%s");           params.append(dto.name)
    if dto.email is not None:          sets.append("email=%s");          params.append(dto.email)
    if dto.objective is not None:      sets.append("objective=%s");      params.append(dto.objective)
    if dto.experience is not None:     sets.append("experience=%s");     params.append(dto.experience)
    if dto.limitations is not None:    sets.append("limitations=%s");    params.append(dto.limitations)
    if dto.attendanceDays is not None: sets.append("attendancedays=%s"); params.append(json.dumps(dto.attendanceDays))
    if dto.membershipEnd is not None:  sets.append("membershipend=%s");  params.append(dto.membershipEnd)
    if dto.paymentPeriod is not None:  sets.append("paymentperiod=%s");  params.append(dto.paymentPeriod)
    if dto.status is not None:         sets.append("status=%s");         params.append(dto.status)
    if sets:
        sets.append("updatedat=NOW()")
        params.append(uid)
        query(f"UPDATE users SET {','.join(sets)} WHERE id=%s", params, fetch="none")
    u = query("SELECT u.*, r.name AS rolename FROM users u JOIN roles r ON u.roleid=r.id WHERE u.id=%s",
              (uid,), fetch="one")
    return user_to_dict(u)

@app.delete("/api/users/{uid}")
async def delete_user(uid: int, _=Depends(require_admin)):
    query("DELETE FROM users WHERE id=%s", (uid,), fetch="none")
    return {"ok": True}

@app.post("/api/users/{uid}/renew")
async def renew_membership(uid: int, req: RenewReq, _=Depends(require_admin)):
    days_map = {"Semanal":7, "Quincenal":15, "Mensual":30, "Anual":365}
    d = days_map.get(req.period, 30)
    new_end = (datetime.utcnow() + timedelta(days=d)).strftime("%Y-%m-%d")
    query("UPDATE users SET membershipend=%s, paymentperiod=%s, status='active', updatedat=NOW() WHERE id=%s",
          (new_end, req.period, uid), fetch="none")
    u = query("SELECT u.*, r.name AS rolename FROM users u JOIN roles r ON u.roleid=r.id WHERE u.id=%s",
              (uid,), fetch="one")
    return user_to_dict(u)

# ═══════════════════════════════════════════════════════════════
# ROUTES: MACHINES
# ═══════════════════════════════════════════════════════════════
@app.get("/api/machines")
async def get_machines(group: str = "", _=Depends(get_current_user)):
    sql = "SELECT * FROM machines"
    params = []
    if group:
        sql += " WHERE musclegroup=%s"
        params = [group]
    sql += " ORDER BY musclegroup, name"
    return [machine_to_dict(m) for m in query(sql, params)]

@app.post("/api/machines")
async def create_machine(dto: MachineCreate, _=Depends(require_admin)):
    new_id = insert_return_id(
        "INSERT INTO machines(name,musclegroup,description,imageemoji,status) VALUES(%s,%s,%s,%s,%s)",
        (dto.name, dto.muscleGroup, dto.description, dto.imageEmoji, dto.status))
    m = query("SELECT * FROM machines WHERE id=%s", (new_id,), fetch="one")
    return machine_to_dict(m)

@app.put("/api/machines/{mid}")
async def update_machine(mid: int, dto: MachineCreate, _=Depends(require_admin)):
    query("UPDATE machines SET name=%s,musclegroup=%s,description=%s,imageemoji=%s,status=%s,updatedat=NOW() WHERE id=%s",
          (dto.name, dto.muscleGroup, dto.description, dto.imageEmoji, dto.status, mid), fetch="none")
    m = query("SELECT * FROM machines WHERE id=%s", (mid,), fetch="one")
    if not m: raise HTTPException(404)
    return machine_to_dict(m)

@app.delete("/api/machines/{mid}")
async def delete_machine(mid: int, _=Depends(require_admin)):
    query("DELETE FROM machines WHERE id=%s", (mid,), fetch="none")
    return {"ok": True}

# ═══════════════════════════════════════════════════════════════
# ROUTES: ROUTINES
# ═══════════════════════════════════════════════════════════════
def routine_to_dict(r_id):
    r = query("SELECT r.*, u.name AS username FROM routines r JOIN users u ON r.userid=u.id WHERE r.id=%s",
              (r_id,), fetch="one")
    if not r: return None
    exs = query("""SELECT re.*, m.name AS machinename, m.imageemoji
                   FROM routineexercises re JOIN machines m ON re.machineid=m.id
                   WHERE re.routineid=%s ORDER BY re.sortorder""", (r_id,))
    days_order = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]
    by_day = {}
    for ex in exs:
        d = ex["DayOfWeek"]
        if d not in by_day: by_day[d] = []
        by_day[d].append({
            "id": ex["Id"], "machineId": ex["MachineId"],
            "machineName": ex["MachineName"], "machineEmoji": ex.get("ImageEmoji","🏋"),
            "dayOfWeek": d, "exerciseName": ex["ExerciseName"],
            "sets": ex["Sets"], "reps": ex["Reps"], "restSeconds": ex["RestSeconds"],
            "completed": False
        })
    ordered = {d: by_day[d] for d in days_order if d in by_day}
    ca = r.get("CreatedAt")
    return {
        "id": r["Id"], "userId": r["UserId"], "userName": r.get("UserName",""),
        "name": r.get("Name"), "isActive": bool(r.get("IsActive", True)),
        "createdAt": ca.isoformat() if ca else None,
        "exercisesByDay": ordered
    }

@app.get("/api/routines")
async def get_routines(_=Depends(require_admin)):
    rows = query("SELECT id FROM routines WHERE isactive=true ORDER BY createdat DESC")
    return [routine_to_dict(r["Id"]) for r in rows]

@app.get("/api/routines/{rid}")
async def get_routine(rid: int, _=Depends(get_current_user)):
    r = routine_to_dict(rid)
    if not r: raise HTTPException(404)
    return r

@app.get("/api/routines/user/{uid}")
async def get_user_routine(uid: int, _=Depends(get_current_user)):
    u = query("SELECT * FROM users WHERE id=%s", (uid,), fetch="one")
    if not u: raise HTTPException(404)
    if u["Status"] == "expired":
        raise HTTPException(403, "Tu membresía ha expirado. Contacta a recepción.")
    r = query("SELECT id FROM routines WHERE userid=%s AND isactive=true ORDER BY createdat DESC",
              (uid,), fetch="one")
    if not r: raise HTTPException(404, "No hay rutina asignada")
    rd = routine_to_dict(r["Id"])
    now = datetime.utcnow()
    week = now.isocalendar()[1]
    year = now.year
    progress = query("SELECT routineexerciseid FROM exerciseprogress WHERE userid=%s AND weeknumber=%s AND yearnumber=%s",
                     (uid, week, year))
    done_ids = {p["RoutineExerciseId"] for p in progress}
    for day_exs in rd["exercisesByDay"].values():
        for ex in day_exs:
            ex["completed"] = ex["id"] in done_ids
    return rd

@app.post("/api/routines/generate")
async def generate_routine(req: GenerateRoutineReq, _=Depends(require_admin)):
    u = query("SELECT * FROM users WHERE id=%s", (req.userId,), fetch="one")
    if not u: raise HTTPException(404, "Usuario no encontrado")
    machines = query("SELECT * FROM machines WHERE status='available'")
    if not machines: raise HTTPException(400, "No hay máquinas disponibles")

    ex_per_day = {"avanzado":5, "intermedio":4, "principiante":3}.get(req.experience, 3)
    sets_val   = {"avanzado":4, "intermedio":3}.get(req.experience, 3)
    reps_val   = {"Fuerza":5, "Volumen":10}.get(req.objective, 12)
    rest_val   = {"Fuerza":"120s", "Volumen":"90s"}.get(req.objective, "60s")

    group_plan = {
        "Lunes":["Pecho","Brazos"], "Martes":["Espalda","Core"],
        "Miércoles":["Piernas"], "Jueves":["Hombros","Brazos"],
        "Viernes":["Pecho","Espalda"], "Sábado":["Piernas","Core"],
        "Domingo":["Multi","Core"]
    }
    if req.objective == "Pierna":
        group_plan = {k: ["Piernas","Core"] for k in group_plan}

    query("UPDATE routines SET isactive=false WHERE userid=%s", (req.userId,), fetch="none")

    r_id = insert_return_id(
        "INSERT INTO routines(userid,name,isactive) VALUES(%s,%s,true)",
        (req.userId, f"Rutina {req.objective} - {u['Name']}"))

    sort_order = 0
    for day in req.days:
        groups = group_plan.get(day, ["Multi"])
        day_machines = [m for m in machines if m["MuscleGroup"] in groups]
        if len(day_machines) < ex_per_day:
            extras = [m for m in machines if m["MuscleGroup"] not in groups]
            random.shuffle(extras)
            day_machines += extras[:ex_per_day - len(day_machines)]
        random.shuffle(day_machines)
        selected = day_machines[:ex_per_day]
        for m in selected:
            import random as _r
            s  = sets_val + _r.randint(0, 1)
            rp = reps_val + _r.randint(-1, 2)
            insert_return_id(
                "INSERT INTO routineexercises(routineid,machineid,dayofweek,exercisename,sets,reps,restseconds,sortorder) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
                (r_id, m["Id"], day, m["Name"], s, rp, rest_val, sort_order))
            sort_order += 1

    days_map = {"Semanal":7, "Quincenal":15, "Mensual":30, "Anual":365}
    new_end = (datetime.utcnow() + timedelta(days=days_map.get(req.paymentPeriod, 30))).strftime("%Y-%m-%d")
    query("""UPDATE users SET objective=%s, experience=%s, limitations=%s, attendancedays=%s,
             membershipend=%s, paymentperiod=%s, status='active', updatedat=NOW() WHERE id=%s""",
          (req.objective, req.experience, req.limitations,
           json.dumps(req.days), new_end, req.paymentPeriod, req.userId), fetch="none")

    return routine_to_dict(r_id)

@app.put("/api/routines/{rid}")
async def update_routine(rid: int, dto: RoutineUpdate, _=Depends(require_admin)):
    r = query("SELECT * FROM routines WHERE id=%s", (rid,), fetch="one")
    if not r: raise HTTPException(404)
    if dto.name:
        query("UPDATE routines SET name=%s, updatedat=NOW() WHERE id=%s", (dto.name, rid), fetch="none")
    query("DELETE FROM routineexercises WHERE routineid=%s", (rid,), fetch="none")
    for i, ex in enumerate(dto.exercises):
        insert_return_id(
            "INSERT INTO routineexercises(routineid,machineid,dayofweek,exercisename,sets,reps,restseconds,sortorder) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)",
            (rid, ex.machineId, ex.dayOfWeek, ex.exerciseName, ex.sets, ex.reps, ex.restSeconds, i))
    return routine_to_dict(rid)

@app.delete("/api/routines/{rid}")
async def delete_routine(rid: int, _=Depends(require_admin)):
    query("DELETE FROM routines WHERE id=%s", (rid,), fetch="none")
    return {"ok": True}

@app.post("/api/routines/progress")
async def toggle_progress(req: ToggleProgressReq, user=Depends(get_current_user)):
    uid = int(user["sub"])
    now = datetime.utcnow()
    week = now.isocalendar()[1]
    year = now.year
    existing = query(
        "SELECT id FROM exerciseprogress WHERE userid=%s AND routineexerciseid=%s AND weeknumber=%s AND yearnumber=%s",
        (uid, req.routineExerciseId, week, year), fetch="one")
    if existing:
        query("DELETE FROM exerciseprogress WHERE id=%s", (existing["Id"],), fetch="none")
        return {"completed": False}
    insert_return_id(
        "INSERT INTO exerciseprogress(userid,routineexerciseid,weeknumber,yearnumber) VALUES(%s,%s,%s,%s)",
        (uid, req.routineExerciseId, week, year))
    return {"completed": True}

# ═══════════════════════════════════════════════════════════════
# ROUTES: DASHBOARD
# ═══════════════════════════════════════════════════════════════
@app.get("/api/dashboard")
async def dashboard(_=Depends(require_admin)):
    today = datetime.utcnow().strftime("%Y-%m-%d")
    query("UPDATE users SET status='expired', updatedat=NOW() WHERE roleid=2 AND status='active' AND membershipend < %s",
          (today,), fetch="none")

    active  = query("SELECT COUNT(*) AS c FROM users WHERE roleid=2 AND status='active'",  fetch="one")["c"]
    expired = query("SELECT COUNT(*) AS c FROM users WHERE roleid=2 AND status='expired'", fetch="one")["c"]
    total   = query("SELECT COUNT(*) AS c FROM users WHERE roleid=2",                      fetch="one")["c"]
    avail_m = query("SELECT COUNT(*) AS c FROM machines WHERE status='available'",         fetch="one")["c"]
    maint_m = query("SELECT COUNT(*) AS c FROM machines WHERE status='maintenance'",       fetch="one")["c"]
    total_m = query("SELECT COUNT(*) AS c FROM machines",                                  fetch="one")["c"]
    rtn     = query("SELECT COUNT(*) AS c FROM routines WHERE isactive=true",              fetch="one")["c"]

    by_obj = query("SELECT objective AS label, COUNT(*) AS count FROM users WHERE roleid=2 AND objective IS NOT NULL GROUP BY objective")
    by_grp = query("SELECT musclegroup AS label, COUNT(*) AS count FROM machines GROUP BY musclegroup")

    exp_list = query("""SELECT u.*, r.name AS rolename FROM users u JOIN roles r ON u.roleid=r.id
                        WHERE u.roleid=2 AND u.status='expired'""")
    return {
        "activeUsers": active, "expiredUsers": expired, "totalUsers": total,
        "availableMachines": avail_m, "maintenanceMachines": maint_m, "totalMachines": total_m,
        "activeRoutines": rtn,
        "usersByObjective": [{"objective": r["label"], "count": r["count"]} for r in by_obj],
        "machinesByGroup":  [{"group": r["label"],     "count": r["count"]} for r in by_grp],
        "expiredUsersList": [user_to_dict(u) for u in exp_list]
    }

# ═══════════════════════════════════════════════════════════════
# SERVE FRONTEND
# ═══════════════════════════════════════════════════════════════
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")

# ═══════════════════════════════════════════════════════════════
# START
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("\n🏋️  FitPulse Gym Management System")
    print("=" * 42)
    try:
        seed_database()
        print("✅ Base de datos conectada")
    except Exception as e:
        print(f"⚠️  DB Error: {e}")
    print(f"\n🌐 Abrir: http://localhost:{PORT}")
    print(f"📡 API:   http://localhost:{PORT}/api/...")
    print("=" * 42 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
