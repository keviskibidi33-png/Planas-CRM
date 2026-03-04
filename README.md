# Planas CRM Frontend

Microfrontend del modulo **Planas y Alargadas ASTM D4791-19** para Geofal.

- Dominio productivo: `https://planas.geofal.com.pe`
- Backend API: `https://api.geofal.com.pe` (rutas `/api/planas`)

## Objetivo

- Registrar y editar ensayos de particulas planas y alargadas.
- Mantener guardado incremental en BD (`EN PROCESO`/`COMPLETO`).
- Exportar Excel con plantilla oficial `Template_Planas.xlsx`.
- Cerrar modal del CRM luego de guardar.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Axios
- React Hot Toast

## Variables de entorno

- `VITE_API_URL=https://api.geofal.com.pe`
- `VITE_CRM_LOGIN_URL=https://crm.geofal.com.pe/login`

## Desarrollo local

```bash
npm install
npm run dev
```
