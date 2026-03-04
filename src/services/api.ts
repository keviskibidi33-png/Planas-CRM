import axios from 'axios'
import type {
    PlanasPayload,
    PlanasSaveResponse,
    PlanasEnsayoDetail,
    PlanasEnsayoSummary,
} from '@/types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.geofal.com.pe'

const api = axios.create({
    baseURL: API_URL,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            window.dispatchEvent(new CustomEvent('session-expired'))
        }
        return Promise.reject(error)
    },
)

export async function savePlanasEnsayo(
    payload: PlanasPayload,
    ensayoId?: number,
): Promise<PlanasSaveResponse> {
    const { data } = await api.post<PlanasSaveResponse>('/api/planas/excel', payload, {
        params: {
            download: false,
            ensayo_id: ensayoId,
        },
    })
    return data
}

export async function saveAndDownloadPlanasExcel(
    payload: PlanasPayload,
    ensayoId?: number,
): Promise<{ blob: Blob; ensayoId?: number }> {
    const response = await api.post('/api/planas/excel', payload, {
        params: {
            download: true,
            ensayo_id: ensayoId,
        },
        responseType: 'blob',
    })

    const ensayoIdHeader = response.headers['x-planas-id']
    const parsedId = Number(ensayoIdHeader)
    return {
        blob: response.data,
        ensayoId: Number.isFinite(parsedId) ? parsedId : undefined,
    }
}

export async function listPlanasEnsayos(limit = 100): Promise<PlanasEnsayoSummary[]> {
    const { data } = await api.get<PlanasEnsayoSummary[]>('/api/planas/', {
        params: { limit },
    })
    return data
}

export async function getPlanasEnsayoDetail(ensayoId: number): Promise<PlanasEnsayoDetail> {
    const { data } = await api.get<PlanasEnsayoDetail>(`/api/planas/${ensayoId}`)
    return data
}

export default api
