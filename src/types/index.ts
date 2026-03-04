export interface PlanasGradacionRow {
    pasa_tamiz?: string | null
    retenido_tamiz?: string | null
    masa_retenido_original_g?: number | null
    porcentaje_retenido?: number | null
    criterio_acepta?: boolean | null
    numero_particulas_aprox_100?: number | null
    masa_retenido_g?: number | null
}

export interface PlanasMetodoRow {
    retenido_tamiz?: string | null
    grupo1_numero_particulas?: number | null
    grupo1_masa_g?: number | null
    grupo2_numero_particulas?: number | null
    grupo2_masa_g?: number | null
    grupo3_numero_particulas?: number | null
    grupo3_masa_g?: number | null
    grupo4_numero_particulas?: number | null
    grupo4_masa_g?: number | null
}

export interface PlanasPayload {
    muestra: string
    numero_ot: string
    fecha_ensayo: string
    realizado_por: string

    relacion_dimensional?: "1:2" | "1:3" | "1:5" | "-" | null
    metodo_ensayo?: "A" | "B" | "-" | null
    tamiz_requerido?: "3/8 in." | "No. 4" | "-" | null

    masa_inicial_g?: number | null
    masa_seca_g?: number | null
    masa_seca_constante_g?: number | null

    gradacion_rows?: PlanasGradacionRow[]
    metodo_rows?: PlanasMetodoRow[]

    dispositivo_calibre_codigo?: string | null
    balanza_01g_codigo?: string | null
    horno_codigo?: string | null

    nota?: string | null
    revisado_por?: string | null
    revisado_fecha?: string | null
    aprobado_por?: string | null
    aprobado_fecha?: string | null
}

export interface PlanasEnsayoSummary {
    id: number
    numero_ensayo: string
    numero_ot: string
    cliente?: string | null
    muestra?: string | null
    fecha_documento?: string | null
    estado: string
    masa_inicial_g?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}

export interface PlanasEnsayoDetail extends PlanasEnsayoSummary {
    payload?: PlanasPayload | null
}

export interface PlanasSaveResponse {
    id: number
    numero_ensayo: string
    numero_ot: string
    estado: string
    masa_inicial_g?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}
