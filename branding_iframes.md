# Branding Iframes - Planas

Documento de referencia para mantener consistente el branding del microfrontend de **Planas** y su visualizacion embebida en iframe dentro del CRM.

## Alcance

- Microfrontend: `planas-crm`
- Shell embebedor: `crm-geofal` modulo Planas
- Flujo: CRM abre `https://planas.geofal.com.pe` en dialog modal con `token` y opcionalmente `ensayo_id`

## Reglas visuales

- Mantener estructura de hoja tecnica fiel a `Template_Planas.xlsx`.
- Preservar bloque ASTM D4791-19 (Reapproved 2023).
- Mantener consistencia visual con modulos recientes de laboratorio.
- Botonera final con acciones `Guardar` y `Guardar y Descargar`.

## Contrato iframe

- Entrada por query params: `token`, `ensayo_id`.
- Mensajes hijo -> padre: `TOKEN_REFRESH_REQUEST`, `CLOSE_MODAL`.
- Mensaje padre -> hijo: `TOKEN_REFRESH`.
