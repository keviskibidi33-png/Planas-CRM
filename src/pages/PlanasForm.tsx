
import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Beaker, Download, Loader2, Trash2 } from 'lucide-react'
import { getPlanasEnsayoDetail, saveAndDownloadPlanasExcel, savePlanasEnsayo } from '@/services/api'
import type { PlanasGradacionRow, PlanasMetodoRow, PlanasPayload } from '@/types'

const DRAFT_KEY = 'planas_form_draft_v1'
const DEBOUNCE_MS = 700
const REVISORES = ['-', 'FABIAN LA ROSA'] as const
const APROBADORES = ['-', 'IRMA COAQUIRA'] as const

const GRADACION_SIZES: ReadonlyArray<{ pasa: string; retenido: string }> = [
    { pasa: '2 in.', retenido: '1 1/2 in.' },
    { pasa: '1 1/2 in.', retenido: '1 in.' },
    { pasa: '1 in.', retenido: '3/4 in.' },
    { pasa: '3/4 in.', retenido: '1/2 in.' },
    { pasa: '1/2 in.', retenido: '3/8 in.' },
    { pasa: '3/8 in.', retenido: 'No. 4' },
]

const METODO_SIZES: ReadonlyArray<string> = ['1 1/2 in.', '1 in.', '3/4 in.', '1/2 in.', '3/8 in.', 'No. 4']

const TMN_MIN_ROWS: ReadonlyArray<{ tmn: string; masa: number }> = [
    { tmn: '2 in.', masa: 20000 },
    { tmn: '1 1/2 in.', masa: 15000 },
    { tmn: '1 in.', masa: 10000 },
    { tmn: '3/4 in.', masa: 5000 },
    { tmn: '1/2 in.', masa: 2000 },
    { tmn: '3/8 in.', masa: 1000 },
    { tmn: 'No. 4', masa: 1000 },
]

const EQUIPO_OPTIONS = {
    dispositivo_calibre_codigo: ['-', 'EQP-0038'],
    balanza_01g_codigo: ['-', 'EQP-0046'],
    horno_codigo: ['-', 'EQP-0049'],
} as const

const withCurrentOption = (value: string | null | undefined, base: readonly string[]) => {
    const current = (value ?? '').trim()
    if (!current || base.includes(current)) return base
    return [...base, current]
}

const parseNum = (value: string) => {
    if (value.trim() === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

const parseIntNum = (value: string) => {
    if (value.trim() === '') return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    return Math.trunc(parsed)
}

const round4 = (value: number) => Number(value.toFixed(4))

const getCurrentYearShort = () => new Date().getFullYear().toString().slice(-2)
const formatTodayShortDate = () => {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
}

const normalizeMuestraCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''
    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const match = compact.match(/^(\d+)(?:-SU)?(?:-(\d{2}))?$/)
    return match ? `${match[1]}-SU-${match[2] || year}` : value
}

const normalizeNumeroOtCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''
    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const patterns = [/^(?:N?OT-)?(\d+)(?:-(\d{2}))?$/, /^(\d+)(?:-(?:N?OT))?(?:-(\d{2}))?$/]
    for (const pattern of patterns) {
        const match = compact.match(pattern)
        if (match) return `${match[1]}-${match[2] || year}`
    }
    return value
}

const normalizeFlexibleDate = (raw: string): string => {
    const value = raw.trim()
    if (!value) return ''

    const digits = value.replace(/\D/g, '')
    const year = getCurrentYearShort()
    const pad2 = (part: string) => part.padStart(2, '0').slice(-2)
    const build = (d: string, m: string, y: string = year) => `${pad2(d)}/${pad2(m)}/${pad2(y)}`

    if (value.includes('/')) {
        const [d = '', m = '', yRaw = ''] = value.split('/').map((part) => part.trim())
        if (!d || !m) return value
        let yy = yRaw.replace(/\D/g, '')
        if (yy.length === 4) yy = yy.slice(-2)
        if (yy.length === 1) yy = `0${yy}`
        if (!yy) yy = year
        return build(d, m, yy)
    }

    if (digits.length === 2) return build(digits[0], digits[1])
    if (digits.length === 3) return build(digits[0], digits.slice(1, 3))
    if (digits.length === 4) return build(digits.slice(0, 2), digits.slice(2, 4))
    if (digits.length === 5) return build(digits[0], digits.slice(1, 3), digits.slice(3, 5))
    if (digits.length === 6) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6))
    if (digits.length >= 8) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(6, 8))

    return value
}

const getEnsayoId = () => {
    const raw = new URLSearchParams(window.location.search).get('ensayo_id')
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const defaultGradacionRows = (): PlanasGradacionRow[] =>
    GRADACION_SIZES.map((size) => ({
        pasa_tamiz: size.pasa,
        retenido_tamiz: size.retenido,
        masa_retenido_original_g: null,
        porcentaje_retenido: null,
        criterio_acepta: null,
        numero_particulas_aprox_100: null,
        masa_retenido_g: null,
    }))

const defaultMetodoRows = (): PlanasMetodoRow[] =>
    METODO_SIZES.map((retenido) => ({
        retenido_tamiz: retenido,
        grupo1_numero_particulas: null,
        grupo1_masa_g: null,
        grupo2_numero_particulas: null,
        grupo2_masa_g: null,
        grupo3_numero_particulas: null,
        grupo3_masa_g: null,
        grupo4_numero_particulas: null,
        grupo4_masa_g: null,
    }))

const normalizeGradacionRows = (rows?: PlanasGradacionRow[] | null): PlanasGradacionRow[] => {
    const base = defaultGradacionRows()
    if (!rows?.length) return base
    return base.map((fallback, idx) => ({
        ...fallback,
        ...(rows[idx] || {}),
        pasa_tamiz: rows[idx]?.pasa_tamiz || fallback.pasa_tamiz,
        retenido_tamiz: rows[idx]?.retenido_tamiz || fallback.retenido_tamiz,
    }))
}

const normalizeMetodoRows = (rows?: PlanasMetodoRow[] | null): PlanasMetodoRow[] => {
    const base = defaultMetodoRows()
    if (!rows?.length) return base
    return base.map((fallback, idx) => ({
        ...fallback,
        ...(rows[idx] || {}),
        retenido_tamiz: rows[idx]?.retenido_tamiz || fallback.retenido_tamiz,
    }))
}

const initialState = (): PlanasPayload => ({
    muestra: '',
    numero_ot: '',
    fecha_ensayo: '',
    realizado_por: '',
    relacion_dimensional: '-',
    metodo_ensayo: 'A',
    tamiz_requerido: '3/8 in.',
    masa_inicial_g: null,
    masa_seca_g: null,
    masa_seca_constante_g: null,
    gradacion_rows: defaultGradacionRows(),
    metodo_rows: defaultMetodoRows(),
    dispositivo_calibre_codigo: '-',
    balanza_01g_codigo: '-',
    horno_codigo: '-',
    nota: '',
    revisado_por: '-',
    revisado_fecha: formatTodayShortDate(),
    aprobado_por: '-',
    aprobado_fecha: formatTodayShortDate(),
})

function preparePayload(payload: PlanasPayload): PlanasPayload {
    const next: PlanasPayload = {
        ...payload,
        gradacion_rows: normalizeGradacionRows(payload.gradacion_rows),
        metodo_rows: normalizeMetodoRows(payload.metodo_rows),
    }

    if (!next.tamiz_requerido || next.tamiz_requerido === '-') {
        next.tamiz_requerido = next.metodo_ensayo === 'B' ? 'No. 4' : '3/8 in.'
    }

    const gradRows = next.gradacion_rows ?? []
    const totalOriginal = gradRows.reduce((acc, row) => acc + (row.masa_retenido_original_g || 0), 0)

    next.gradacion_rows = gradRows.map((row) => {
        let porcentaje = row.porcentaje_retenido
        if (porcentaje == null && totalOriginal > 0 && row.masa_retenido_original_g != null) {
            porcentaje = round4((row.masa_retenido_original_g / totalOriginal) * 100)
        }

        let criterio = row.criterio_acepta
        if (criterio == null && porcentaje != null) {
            criterio = porcentaje >= 10
        }

        return {
            ...row,
            porcentaje_retenido: porcentaje,
            criterio_acepta: criterio,
        }
    })

    return next
}

const formatNumber = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) return '-'
    return Number(value.toFixed(4)).toString()
}

export default function PlanasForm() {
    const [form, setForm] = useState<PlanasPayload>(() => initialState())
    const [loading, setLoading] = useState(false)
    const [loadingEdit, setLoadingEdit] = useState(false)
    const [ensayoId, setEnsayoId] = useState<number | null>(() => getEnsayoId())

    useEffect(() => {
        const raw = localStorage.getItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
        if (!raw) return
        try {
            const restored = JSON.parse(raw) as PlanasPayload
            setForm({
                ...initialState(),
                ...restored,
                gradacion_rows: normalizeGradacionRows(restored.gradacion_rows),
                metodo_rows: normalizeMetodoRows(restored.metodo_rows),
            })
        } catch {
            // ignore local draft corruption
        }
    }, [ensayoId])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            localStorage.setItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`, JSON.stringify(form))
        }, DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [form, ensayoId])

    useEffect(() => {
        if (!ensayoId) return
        let cancel = false

        const run = async () => {
            setLoadingEdit(true)
            try {
                const detail = await getPlanasEnsayoDetail(ensayoId)
                if (!cancel && detail.payload) {
                    setForm({
                        ...initialState(),
                        ...detail.payload,
                        gradacion_rows: normalizeGradacionRows(detail.payload.gradacion_rows),
                        metodo_rows: normalizeMetodoRows(detail.payload.metodo_rows),
                    })
                }
            } catch {
                toast.error('No se pudo cargar ensayo Planas.')
            } finally {
                if (!cancel) setLoadingEdit(false)
            }
        }

        void run()
        return () => {
            cancel = true
        }
    }, [ensayoId])

    const computedPayload = useMemo(() => preparePayload(form), [form])
    const gradacionRows = computedPayload.gradacion_rows ?? []
    const metodoRows = computedPayload.metodo_rows ?? []

    const totals = useMemo(() => {
        const original = gradacionRows.reduce((acc, row) => acc + (row.masa_retenido_original_g || 0), 0)
        const porcentaje = gradacionRows.reduce((acc, row) => acc + (row.porcentaje_retenido || 0), 0)
        const reduccion = gradacionRows.reduce((acc, row) => acc + (row.masa_retenido_g || 0), 0)
        return { original, porcentaje, reduccion }
    }, [gradacionRows])

    const setField = useCallback(<K extends keyof PlanasPayload>(key: K, value: PlanasPayload[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }))
    }, [])

    const setMetodoEnsayo = useCallback((metodo: 'A' | 'B') => {
        setForm((prev) => ({
            ...prev,
            metodo_ensayo: metodo,
            tamiz_requerido: metodo === 'A' ? '3/8 in.' : 'No. 4',
        }))
    }, [])

    const setGradacion = useCallback(<K extends keyof PlanasGradacionRow>(index: number, key: K, value: PlanasGradacionRow[K]) => {
        setForm((prev) => {
            const rows = normalizeGradacionRows(prev.gradacion_rows)
            const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
            return { ...prev, gradacion_rows: nextRows }
        })
    }, [])

    const setMetodoRow = useCallback(<K extends keyof PlanasMetodoRow>(index: number, key: K, value: PlanasMetodoRow[K]) => {
        setForm((prev) => {
            const rows = normalizeMetodoRows(prev.metodo_rows)
            const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
            return { ...prev, metodo_rows: nextRows }
        })
    }, [])

    const clearAll = useCallback(() => {
        if (!window.confirm('Se limpiaran los datos no guardados. Deseas continuar?')) return
        localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
        setForm(initialState())
    }, [ensayoId])

    const save = useCallback(
        async (download: boolean) => {
            if (!form.muestra || !form.numero_ot || !form.fecha_ensayo || !form.realizado_por) {
                toast.error('Complete Muestra, N OT, Fecha de ensayo y Realizado por.')
                return
            }

            setLoading(true)
            try {
                const payload = preparePayload(form)
                if (download) {
                    const { blob } = await saveAndDownloadPlanasExcel(payload, ensayoId ?? undefined)
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `PLANAS_${form.numero_ot}_${new Date().toISOString().slice(0, 10)}.xlsx`
                    link.click()
                    URL.revokeObjectURL(url)
                } else {
                    await savePlanasEnsayo(payload, ensayoId ?? undefined)
                }

                localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
                setForm(initialState())
                setEnsayoId(null)
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
                }
                toast.success(download ? 'Planas guardado y descargado.' : 'Planas guardado.')
            } catch (error) {
                const message = axios.isAxiosError(error)
                    ? error.response?.data?.detail || 'No se pudo generar Planas.'
                    : 'No se pudo generar Planas.'
                toast.error(message)
            } finally {
                setLoading(false)
            }
        },
        [ensayoId, form],
    )

    const denseInputClass =
        'h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35'

    const markButtonClass = (active: boolean) =>
        `h-8 w-full rounded-md border text-xs font-semibold ${active ? 'border-slate-700 bg-slate-200 text-slate-900' : 'border-slate-300 bg-white text-slate-700'}`

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-6">
            <div className="mx-auto max-w-[1500px] space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-50">
                        <Beaker className="h-5 w-5 text-slate-900" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-slate-900 md:text-lg">PLANAS Y ALARGADAS - ASTM D4791-19</h1>
                        <p className="text-xs text-slate-600">Replica del formato Excel oficial</p>
                    </div>
                </div>

                {loadingEdit ? (
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando ensayo...
                    </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                    <div className="border-b border-slate-300 bg-white px-3 py-3">
                        <table className="w-full table-fixed border border-slate-300 text-sm">
                            <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                <tr>
                                    <th className="border-r border-slate-300 py-1">MUESTRA</th>
                                    <th className="border-r border-slate-300 py-1">No OT</th>
                                    <th className="border-r border-slate-300 py-1">FECHA ENSAYO</th>
                                    <th className="py-1">REALIZADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.muestra}
                                            onChange={(e) => setField('muestra', e.target.value)}
                                            onBlur={() => setField('muestra', normalizeMuestraCode(form.muestra))}
                                            autoComplete="off"
                                            data-lpignore="true"
                                        />
                                    </td>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.numero_ot}
                                            onChange={(e) => setField('numero_ot', e.target.value)}
                                            onBlur={() => setField('numero_ot', normalizeNumeroOtCode(form.numero_ot))}
                                            autoComplete="off"
                                            data-lpignore="true"
                                        />
                                    </td>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.fecha_ensayo}
                                            onChange={(e) => setField('fecha_ensayo', e.target.value)}
                                            onBlur={() => setField('fecha_ensayo', normalizeFlexibleDate(form.fecha_ensayo))}
                                            autoComplete="off"
                                            data-lpignore="true"
                                            placeholder="DD/MM/AA"
                                        />
                                    </td>
                                    <td className="border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.realizado_por}
                                            onChange={(e) => setField('realizado_por', e.target.value)}
                                            autoComplete="off"
                                            data-lpignore="true"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="border-b border-slate-300 bg-slate-100 px-4 py-3 text-center">
                        <p className="text-[29px] font-semibold leading-tight text-slate-900">
                            STANDARD TEST METHOD FOR FLAT PARTICLES, ELONGATED PARTICLES, OR FLAT AND ELONGATED PARTICLES IN COARSE AGGREGATE
                        </p>
                        <p className="text-[29px] font-semibold text-slate-900">ASTM D4791-19 (Reapproved 2023)</p>
                    </div>

                    <div className="space-y-3 p-3">
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[260px_260px_1fr]">
                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th colSpan={3} className="border-b border-slate-300 py-1">RELACION DIMENSIONAL</th>
                                        </tr>
                                        <tr>
                                            {['1:2', '1:3', '1:5'].map((item) => (
                                                <th key={item} className="border-r border-slate-300 py-1 last:border-r-0">{item}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {(['1:2', '1:3', '1:5'] as const).map((item) => (
                                                <td key={item} className="border-r border-t border-slate-300 p-1 text-center last:border-r-0">
                                                    <button
                                                        type="button"
                                                        className={markButtonClass(form.relacion_dimensional === item)}
                                                        onClick={() => setField('relacion_dimensional', item)}
                                                    >
                                                        {form.relacion_dimensional === item ? 'X' : ''}
                                                    </button>
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th colSpan={2} className="border-b border-slate-300 py-1">Metodo de ensayo:</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-r border-slate-300 px-2 py-1">Metodo A</td>
                                            <td className="border-b border-slate-300 p-1">
                                                <button
                                                    type="button"
                                                    className={markButtonClass(form.metodo_ensayo === 'A')}
                                                    onClick={() => setMetodoEnsayo('A')}
                                                >
                                                    {form.metodo_ensayo === 'A' ? 'X' : ''}
                                                </button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-r border-slate-300 px-2 py-1">Metodo B</td>
                                            <td className="p-1">
                                                <button
                                                    type="button"
                                                    className={markButtonClass(form.metodo_ensayo === 'B')}
                                                    onClick={() => setMetodoEnsayo('B')}
                                                >
                                                    {form.metodo_ensayo === 'B' ? 'X' : ''}
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th colSpan={2} className="border-b border-slate-300 py-1">Tamiz requerido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-r border-slate-300 px-2 py-1">3/8 in.</td>
                                            <td className="border-b border-slate-300 p-1">
                                                <button
                                                    type="button"
                                                    className={markButtonClass((form.tamiz_requerido || computedPayload.tamiz_requerido) === '3/8 in.')}
                                                    onClick={() => setField('tamiz_requerido', '3/8 in.')}
                                                >
                                                    {(form.tamiz_requerido || computedPayload.tamiz_requerido) === '3/8 in.' ? 'X' : ''}
                                                </button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-r border-slate-300 px-2 py-1">No. 4</td>
                                            <td className="p-1">
                                                <button
                                                    type="button"
                                                    className={markButtonClass((form.tamiz_requerido || computedPayload.tamiz_requerido) === 'No. 4')}
                                                    onClick={() => setField('tamiz_requerido', 'No. 4')}
                                                >
                                                    {(form.tamiz_requerido || computedPayload.tamiz_requerido) === 'No. 4' ? 'X' : ''}
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <p className="text-sm italic text-slate-800">
                            El metodo A esta destinado para todas las aplicaciones, el metodo B se realizara a solicitud del cliente (Superpave)
                        </p>

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_290px]">
                            <div className="overflow-x-auto rounded-lg border border-slate-300">
                                <table className="min-w-[1050px] w-full table-fixed text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th colSpan={2} className="border-b border-r border-slate-300 py-1">Tamano de las particulas</th>
                                            <th colSpan={3} className="border-b border-r border-slate-300 py-1">Gradacion de la muestra (1) - ASTM C136</th>
                                            <th colSpan={2} className="border-b border-slate-300 py-1">Reduccion de la muestra de prueba</th>
                                        </tr>
                                        <tr>
                                            <th className="w-28 border-r border-slate-300 px-2 py-1">Pasa Tamiz</th>
                                            <th className="w-28 border-r border-slate-300 px-2 py-1">Retenido Tamiz</th>
                                            <th className="w-36 border-r border-slate-300 px-2 py-1">Masa Retenido original (g)</th>
                                            <th className="w-24 border-r border-slate-300 px-2 py-1">(%) Retenido</th>
                                            <th className="w-28 border-r border-slate-300 px-2 py-1">Criterio Acept. {'>='}10% (*)</th>
                                            <th className="w-32 border-r border-slate-300 px-2 py-1">Numero Particulas (Aprox. 100)</th>
                                            <th className="w-32 px-2 py-1">Masa retenido (g)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gradacionRows.map((row, rowIndex) => {
                                            const criterio = row.criterio_acepta === true
                                            return (
                                                <tr key={`${row.pasa_tamiz}-${row.retenido_tamiz}`}>
                                                    <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.pasa_tamiz}</td>
                                                    <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.retenido_tamiz}</td>
                                                    <td className="border-t border-r border-slate-300 p-1">
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            className={denseInputClass}
                                                            value={row.masa_retenido_original_g ?? ''}
                                                            onChange={(e) => setGradacion(rowIndex, 'masa_retenido_original_g', parseNum(e.target.value))}
                                                        />
                                                    </td>
                                                    <td className="border-t border-r border-slate-300 p-1">
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            className={denseInputClass}
                                                            value={row.porcentaje_retenido ?? ''}
                                                            onChange={(e) => setGradacion(rowIndex, 'porcentaje_retenido', parseNum(e.target.value))}
                                                        />
                                                    </td>
                                                    <td className="border-t border-r border-slate-300 p-1">
                                                        <button
                                                            type="button"
                                                            className={markButtonClass(criterio)}
                                                            onClick={() => setGradacion(rowIndex, 'criterio_acepta', !criterio)}
                                                        >
                                                            {criterio ? 'X' : ''}
                                                        </button>
                                                    </td>
                                                    <td className="border-t border-r border-slate-300 p-1">
                                                        <input
                                                            type="number"
                                                            step="1"
                                                            className={denseInputClass}
                                                            value={row.numero_particulas_aprox_100 ?? ''}
                                                            onChange={(e) => setGradacion(rowIndex, 'numero_particulas_aprox_100', parseIntNum(e.target.value))}
                                                        />
                                                    </td>
                                                    <td className="border-t border-slate-300 p-1">
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            className={denseInputClass}
                                                            value={row.masa_retenido_g ?? ''}
                                                            onChange={(e) => setGradacion(rowIndex, 'masa_retenido_g', parseNum(e.target.value))}
                                                        />
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        <tr className="bg-slate-50 text-xs font-semibold text-slate-800">
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center" colSpan={2}>TOTAL</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{totals.original > 0 ? formatNumber(totals.original) : '-'}</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{totals.porcentaje > 0 ? formatNumber(totals.porcentaje) : '-'}</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">-</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">-</td>
                                            <td className="border-t border-slate-300 px-2 py-1 text-center">{totals.reduccion > 0 ? formatNumber(totals.reduccion) : '-'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-3">
                                <div className="overflow-hidden rounded-lg border border-slate-300">
                                    <table className="w-full text-sm">
                                        <tbody>
                                            <tr>
                                                <td className="border-b border-r border-slate-300 px-2 py-1">Masa inicial</td>
                                                <td className="border-b border-slate-300 p-1">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className={denseInputClass}
                                                        value={form.masa_inicial_g ?? ''}
                                                        onChange={(e) => setField('masa_inicial_g', parseNum(e.target.value))}
                                                    />
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="border-b border-r border-slate-300 px-2 py-1">Masa seca</td>
                                                <td className="border-b border-slate-300 p-1">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className={denseInputClass}
                                                        value={form.masa_seca_g ?? ''}
                                                        onChange={(e) => setField('masa_seca_g', parseNum(e.target.value))}
                                                    />
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="border-r border-slate-300 px-2 py-1">Masa seca constante</td>
                                                <td className="p-1">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className={denseInputClass}
                                                        value={form.masa_seca_constante_g ?? ''}
                                                        onChange={(e) => setField('masa_seca_constante_g', parseNum(e.target.value))}
                                                    />
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="overflow-hidden rounded-lg border border-slate-300">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                            <tr>
                                                <th className="border-b border-r border-slate-300 py-1">TMN</th>
                                                <th className="border-b border-slate-300 py-1">Masa min. (g)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {TMN_MIN_ROWS.map((item, idx) => (
                                                <tr key={item.tmn}>
                                                    <td className={`border-r border-slate-300 px-2 py-1 text-center ${idx > 0 ? 'border-t' : ''}`}>{item.tmn}</td>
                                                    <td className={`border-slate-300 px-2 py-1 text-center ${idx > 0 ? 'border-t' : ''}`}>{item.masa}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-slate-300">
                            <table className="min-w-[1200px] w-full table-fixed text-sm">
                                <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                    <tr>
                                        <th className="border-b border-r border-slate-300 py-1" colSpan={5}>Metodo A</th>
                                        <th className="border-b border-slate-300 py-1" colSpan={4}>Metodo B</th>
                                    </tr>
                                    <tr>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1" rowSpan={2}>Retenido Tamiz</th>
                                        <th className="border-b border-r border-slate-300 px-2 py-1" colSpan={2}>Particulas Planas Grupo 1<br />Ancho - espesor</th>
                                        <th className="border-b border-r border-slate-300 px-2 py-1" colSpan={2}>Particulas Alargadas Grupo 2<br />Largo - ancho</th>
                                        <th className="border-b border-r border-slate-300 px-2 py-1" colSpan={2}>Particulas Grupo 3<br />Cumplen Grupo 1 y 2</th>
                                        <th className="border-b border-slate-300 px-2 py-1" colSpan={2}>Particulas Grupo 4<br />Ni planas ni alargadas</th>
                                    </tr>
                                    <tr>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1">Numero</th>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1">Masa (g)</th>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1">Numero</th>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1">Masa (g)</th>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1">Numero</th>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1">Masa (g)</th>
                                        <th className="w-24 border-b border-r border-slate-300 px-2 py-1">Numero</th>
                                        <th className="w-24 border-b border-slate-300 px-2 py-1">Masa (g)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {metodoRows.map((row, index) => (
                                        <tr key={row.retenido_tamiz || index}>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.retenido_tamiz}</td>
                                            <td className="border-t border-r border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="1"
                                                    className={denseInputClass}
                                                    value={row.grupo1_numero_particulas ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo1_numero_particulas', parseIntNum(e.target.value))}
                                                />
                                            </td>
                                            <td className="border-t border-r border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={denseInputClass}
                                                    value={row.grupo1_masa_g ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo1_masa_g', parseNum(e.target.value))}
                                                />
                                            </td>
                                            <td className="border-t border-r border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="1"
                                                    className={denseInputClass}
                                                    value={row.grupo2_numero_particulas ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo2_numero_particulas', parseIntNum(e.target.value))}
                                                />
                                            </td>
                                            <td className="border-t border-r border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={denseInputClass}
                                                    value={row.grupo2_masa_g ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo2_masa_g', parseNum(e.target.value))}
                                                />
                                            </td>
                                            <td className="border-t border-r border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="1"
                                                    className={denseInputClass}
                                                    value={row.grupo3_numero_particulas ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo3_numero_particulas', parseIntNum(e.target.value))}
                                                />
                                            </td>
                                            <td className="border-t border-r border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={denseInputClass}
                                                    value={row.grupo3_masa_g ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo3_masa_g', parseNum(e.target.value))}
                                                />
                                            </td>
                                            <td className="border-t border-r border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="1"
                                                    className={denseInputClass}
                                                    value={row.grupo4_numero_particulas ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo4_numero_particulas', parseIntNum(e.target.value))}
                                                />
                                            </td>
                                            <td className="border-t border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={denseInputClass}
                                                    value={row.grupo4_masa_g ?? ''}
                                                    onChange={(e) => setMetodoRow(index, 'grupo4_masa_g', parseNum(e.target.value))}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <p className="text-sm italic text-slate-800">
                            Nota: Para el metodo A: Cumple el criterio del grupo 1 y Grupo 2; Metodo B: Particulas en la relacion de Longitud - Espesor
                        </p>

                        <div className="overflow-hidden rounded-lg border border-slate-300">
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr>
                                        <td className="w-48 border-r border-b border-slate-300 px-2 py-1 text-center font-semibold" rowSpan={2}>
                                            Codigo equipos utilizados
                                        </td>
                                        <td className="border-r border-b border-slate-300 px-2 py-1 text-center">Dispositivo de calibre proporcional</td>
                                        <td className="w-56 border-r border-b border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.dispositivo_calibre_codigo ?? '-'} onChange={(e) => setField('dispositivo_calibre_codigo', e.target.value)}>
                                                {withCurrentOption(form.dispositivo_calibre_codigo, EQUIPO_OPTIONS.dispositivo_calibre_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                        <td className="border-r border-b border-slate-300 px-2 py-1 text-center">Balanza 0.1 g</td>
                                        <td className="w-56 border-b border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.balanza_01g_codigo ?? '-'} onChange={(e) => setField('balanza_01g_codigo', e.target.value)}>
                                                {withCurrentOption(form.balanza_01g_codigo, EQUIPO_OPTIONS.balanza_01g_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="border-r border-slate-300 px-2 py-1 text-center">Horno</td>
                                        <td className="border-r border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.horno_codigo ?? '-'} onChange={(e) => setField('horno_codigo', e.target.value)}>
                                                {withCurrentOption(form.horno_codigo, EQUIPO_OPTIONS.horno_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                        <td className="border-r border-slate-300 px-2 py-1 text-center"></td>
                                        <td className="p-1"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="overflow-hidden rounded-lg border border-slate-300">
                            <div className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-800">Nota:</div>
                            <div className="p-2">
                                <textarea
                                    className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35"
                                    rows={3}
                                    value={form.nota ?? ''}
                                    onChange={(e) => setField('nota', e.target.value)}
                                    autoComplete="off"
                                    data-lpignore="true"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_380px_380px] xl:items-end">
                            <div className="text-xs text-slate-700">
                                <p>Pagina 1 de 1</p>
                                <p>Version: 02 (11-11-2024)</p>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Revisado:</div>
                                <div className="space-y-2 p-2">
                                    <select
                                        className={denseInputClass}
                                        value={form.revisado_por ?? '-'}
                                        onChange={(e) => setField('revisado_por', e.target.value)}
                                    >
                                        {REVISORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <input
                                        className={denseInputClass}
                                        value={form.revisado_fecha ?? ''}
                                        onChange={(e) => setField('revisado_fecha', e.target.value)}
                                        onBlur={() => setField('revisado_fecha', normalizeFlexibleDate(form.revisado_fecha || ''))}
                                        autoComplete="off"
                                        data-lpignore="true"
                                        placeholder="Fecha"
                                    />
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Aprobado:</div>
                                <div className="space-y-2 p-2">
                                    <select
                                        className={denseInputClass}
                                        value={form.aprobado_por ?? '-'}
                                        onChange={(e) => setField('aprobado_por', e.target.value)}
                                    >
                                        {APROBADORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <input
                                        className={denseInputClass}
                                        value={form.aprobado_fecha ?? ''}
                                        onChange={(e) => setField('aprobado_fecha', e.target.value)}
                                        onBlur={() => setField('aprobado_fecha', normalizeFlexibleDate(form.aprobado_fecha || ''))}
                                        autoComplete="off"
                                        data-lpignore="true"
                                        placeholder="Fecha"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="border-t-2 border-blue-900 px-3 py-2 text-center text-[11px] leading-tight text-slate-700">
                            <p>WEB: www.geofal.com.pe   E-MAIL: laboratorio@geofal.com.pe</p>
                            <p>Av. Maranon 763, Los Olivos-Lima / Telefono 01 754-3070</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <button
                        onClick={clearAll}
                        disabled={loading}
                        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                    >
                        <Trash2 className="h-4 w-4" />
                        Limpiar todo
                    </button>
                    <button
                        onClick={() => void save(false)}
                        disabled={loading}
                        className="h-11 rounded-lg border border-slate-900 bg-white font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                    >
                        {loading ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                        onClick={() => void save(true)}
                        disabled={loading}
                        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                Guardar y Descargar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
