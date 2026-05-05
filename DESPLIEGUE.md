# 🚀 FitPulse — Guía de despliegue GRATUITO
## Stack: Supabase (PostgreSQL) + Render.com (servidor web)

---

## ¿Por qué estos servicios?

| Servicio | Qué hace | Coste |
|---|---|---|
| **Supabase** | Base de datos PostgreSQL en la nube | Gratis (500 MB) |
| **Render.com** | Servidor web que ejecuta FastAPI | Gratis (se "duerme" tras 15 min inactivo) |
| **GitHub** | Repositorio para hacer deploys automáticos | Gratis |

> ⚠️ **Limitación del plan gratuito de Render:** el servidor se "duerme" si no recibe
> tráfico durante 15 minutos. La primera petición tras despertar tarda ~30 segundos.
> Para un proyecto personal o demo, es perfectamente aceptable.

---

## PASO 1 — Subir el código a GitHub

1. Crea una cuenta en https://github.com si no tienes una
2. Crea un nuevo repositorio (puede ser privado)
3. Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU_USUARIO/fitpulse.git
git push -u origin main
```

---

## PASO 2 — Crear la base de datos en Supabase

1. Entra en https://supabase.com y crea una cuenta gratuita
2. Haz clic en **"New project"**
   - Nombre: `fitpulse`
   - Password: (pon una contraseña segura y guárdala)
   - Region: elige la más cercana a ti (ej. `West EU (Ireland)`)
3. Espera ~2 minutos a que se aprovisione la base de datos
4. Ve a **SQL Editor** (icono de base de datos en el panel izquierdo)
5. Copia y pega TODO el contenido de `schema_postgres.sql`
6. Haz clic en **"Run"** ▶️
   - Deberías ver: `Success. No rows returned`
7. Ve a **Settings → Database → Connection string → URI**
   - Copia la URI que empieza por `postgresql://postgres:...`
   - **Guárdala**, la necesitas en el Paso 3

---

## PASO 3 — Desplegar en Render.com

1. Entra en https://render.com y crea una cuenta gratuita
2. Haz clic en **"New +"** → **"Web Service"**
3. Conecta tu cuenta de GitHub y selecciona el repositorio `fitpulse`
4. Configura el servicio:
   - **Name:** `fitpulse`
   - **Region:** la más cercana a ti
   - **Branch:** `main`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`
5. Más abajo, en **Environment Variables**, añade:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | La URI de Supabase que copiaste en el Paso 2 |
   | `JWT_SECRET` | Una cadena aleatoria larga (ej: `MiClaveSecreta2026FitPulseXYZ`) |

6. Haz clic en **"Create Web Service"**
7. Render instalará las dependencias y arrancará el servidor (~3-5 minutos)
8. Cuando veas `==> Your service is live 🎉`, copia la URL pública

   Tendrás algo como: `https://fitpulse.onrender.com`

---

## PASO 4 — Primera prueba

Abre la URL pública en el navegador. Debería cargar FitPulse.

Credenciales de prueba:
```
Admin:    admin@fitpulse.com  /  admin123
Usuario:  maria@gym.com       /  user123
```

---

## Deploys futuros (¡así de fácil!)

Cada vez que hagas cambios:

```bash
git add .
git commit -m "Mi cambio"
git push
```

Render detecta el push y **redespliega automáticamente** en ~2 minutos. Cero configuración adicional.

---

## Solución de problemas

### El servidor tarda en responder la primera vez
Normal en el plan gratuito — Render "duerme" el servidor tras 15 min sin tráfico.
La primera petición lo despierta y tarda ~30 segundos.

### "DATABASE_URL not set" o error de conexión
- Verifica que pegaste bien la URI de Supabase en las variables de entorno de Render
- La URI debe incluir la contraseña que pusiste al crear el proyecto en Supabase

### Error al ejecutar el SQL en Supabase
- Asegúrate de ejecutar `schema_postgres.sql` completo (no el `.sql` original de SQL Server)

### Probar en local antes de subir
```bash
# Crea un archivo .env (no lo subas a GitHub, está en .gitignore)
echo "DATABASE_URL=postgresql://postgres:TU_PASSWORD@db.xxx.supabase.co:5432/postgres" > .env
echo "JWT_SECRET=MiClaveLocal123" >> .env

# Instala dependencias
pip install -r requirements.txt

# Arranca
python main.py
```

---

## Resumen visual

```
Tu código (GitHub)
       │
       │  git push  →  Render detecta el cambio
       ▼
  Render.com          ←→   Supabase PostgreSQL
  (FastAPI corriendo)        (Base de datos)
       │
       ▼
  URL pública: https://fitpulse.onrender.com
```
