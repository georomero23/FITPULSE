-- ============================================================
-- FITPULSE — Esquema PostgreSQL
-- Ejecutar en Supabase → SQL Editor (una sola vez)
-- ============================================================

-- ROLES
CREATE TABLE IF NOT EXISTS roles (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO roles (name) VALUES ('Admin'), ('User') ON CONFLICT DO NOTHING;

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(250) NOT NULL UNIQUE,
    passwordhash   VARCHAR(500) NOT NULL,
    roleid         INT NOT NULL REFERENCES roles(id),
    objective      VARCHAR(100),
    experience     VARCHAR(50),
    limitations    VARCHAR(500),
    attendancedays VARCHAR(500),
    membershipend  DATE,
    paymentperiod  VARCHAR(50),
    status         VARCHAR(20)  DEFAULT 'active',
    createdat      TIMESTAMP    DEFAULT NOW(),
    updatedat      TIMESTAMP    DEFAULT NOW()
);

-- MACHINES
CREATE TABLE IF NOT EXISTS machines (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    musclegroup VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    imageemoji  VARCHAR(10)  DEFAULT '🏋️',
    status      VARCHAR(20)  DEFAULT 'available',
    createdat   TIMESTAMP    DEFAULT NOW(),
    updatedat   TIMESTAMP    DEFAULT NOW()
);

-- ROUTINES
CREATE TABLE IF NOT EXISTS routines (
    id        SERIAL PRIMARY KEY,
    userid    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name      VARCHAR(200),
    isactive  BOOLEAN   DEFAULT TRUE,
    createdat TIMESTAMP DEFAULT NOW(),
    updatedat TIMESTAMP DEFAULT NOW()
);

-- ROUTINE EXERCISES
CREATE TABLE IF NOT EXISTS routineexercises (
    id           SERIAL PRIMARY KEY,
    routineid    INT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    machineid    INT NOT NULL REFERENCES machines(id),
    dayofweek    VARCHAR(20)  NOT NULL,
    exercisename VARCHAR(200) NOT NULL,
    sets         INT DEFAULT 3,
    reps         INT DEFAULT 12,
    restseconds  VARCHAR(10)  DEFAULT '60s',
    sortorder    INT DEFAULT 0
);

-- EXERCISE PROGRESS
CREATE TABLE IF NOT EXISTS exerciseprogress (
    id                SERIAL PRIMARY KEY,
    userid            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routineexerciseid INT NOT NULL,
    completedat       TIMESTAMP DEFAULT NOW(),
    weeknumber        INT NOT NULL,
    yearnumber        INT NOT NULL
);

-- DATOS INICIALES: MÁQUINAS
INSERT INTO machines (name, musclegroup, description, imageemoji, status) VALUES
    ('Prensa de Piernas',         'Piernas',  'Prensa para cuádriceps y glúteos',    '🦵', 'available'),
    ('Extensión de Cuádriceps',   'Piernas',  'Aislamiento de cuádriceps',           '🦵', 'available'),
    ('Curl Femoral',              'Piernas',  'Trabajo de isquiotibiales',           '🦵', 'available'),
    ('Aductora',                  'Piernas',  'Máquina de aductores',                '🦵', 'available'),
    ('Abductora',                 'Piernas',  'Máquina de abductores',               '🦵', 'maintenance'),
    ('Press de Pecho',            'Pecho',    'Press horizontal para pectorales',    '💪', 'available'),
    ('Pec Deck (Mariposa)',       'Pecho',    'Aislamiento de pectorales',           '💪', 'available'),
    ('Press Inclinado',           'Pecho',    'Press inclinado pecho superior',      '💪', 'available'),
    ('Jalón al Pecho',            'Espalda',  'Trabajo de dorsales',                 '🏋', 'available'),
    ('Remo Sentado',              'Espalda',  'Remo para espalda media',             '🏋', 'available'),
    ('Pullover Máquina',          'Espalda',  'Aislamiento de dorsales',             '🏋', 'available'),
    ('Press de Hombro',           'Hombros',  'Press militar en máquina',            '🏋', 'available'),
    ('Elevación Lateral Máquina', 'Hombros',  'Deltoides laterales',                 '🏋', 'available'),
    ('Curl Bíceps Máquina',       'Brazos',   'Aislamiento de bíceps',               '💪', 'available'),
    ('Extensión Tríceps Máquina', 'Brazos',   'Aislamiento de tríceps',              '💪', 'available'),
    ('Crunch Abdominal',          'Core',     'Abdominales en máquina',              '🔥', 'available'),
    ('Rotación de Torso',         'Core',     'Oblicuos en máquina',                 '🔥', 'available'),
    ('Smith Machine',             'Multi',    'Máquina guiada multiuso',             '🏋', 'available'),
    ('Hack Squat',                'Piernas',  'Sentadilla en máquina hack',          '🦵', 'available'),
    ('Pantorrillera',             'Piernas',  'Elevación de pantorrillas',           '🦵', 'available')
ON CONFLICT DO NOTHING;

-- Usuarios y admin se insertan automáticamente al arrancar main.py (seed_database)
