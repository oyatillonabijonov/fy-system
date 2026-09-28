import {
    Users,
    UserPlus,
    Ticket,
    Funnel,
    CaretUp,
    CaretDown,
    Plus,
    PencilSimple,
    Trash,
    DownloadSimple,
    Eye,
    X,
    Image as ImageIcon,
    Camera,
    Check,
} from "@phosphor-icons/react"
import { StatusBadge } from "@/components/ui/StatusBadge"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useMemo, useEffect, useRef, useId } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import { useDialog } from "@/hooks/useDialog"
import { useClients, useDeleteClient, useDeleteClients, useUpdateClient, CLIENTS_KEY, useClientJourney, useClientsLastEventDates } from "@/hooks/useClients"
import { getClientActivityStatus, ACTIVITY_STATUS_META, type ClientActivityStatus } from "@/lib/constants/clientStatus"
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getSortedRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    type SortingState,
    type Column,
    type Table,
} from '@tanstack/react-table'
import { useSetCommunityApproved } from "@/hooks/useCommunity"
import { formatDate, formatMoney, formatNumber, formatPhone } from "@/lib/format"
import { PhoneInput } from "@/components/ui/PhoneInput"
import { normalizePhone } from "@/lib/utils"
import { ThinkingOrb } from "thinking-orbs"
import { useAuth } from "@/context/AuthContext"
import { useCashbackNextExpiry } from "@/hooks/useCashback"
import { AdjustCashbackModal } from "@/components/cashback/AdjustCashbackModal"
import type { CashbackTransaction } from "@/lib/supabase/queries/cashback"
import { tbl } from "@/components/ui/table"
import { Pager, PAGE_SIZE } from "@/components/ui/Pager"




interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    activity: string;
    location: string;
    eventsCount: number;
    daysSinceLastEvent: number | null;
    status: string;
    joinDate: string;
    image: string;
    totalSpent: string;
    cashbackBalance: number;
    authUserId: string | null;
    communityApproved: boolean;
}


const columnHelper = createColumnHelper<Customer>()

const CASHBACK_TYPE: Record<CashbackTransaction["type"], { label: string; credit: boolean }> = {
    earned: { label: "Tadbirdan", credit: true },
    manual_add: { label: "Qo'lda qo'shildi", credit: true },
    used: { label: "Qarzga ishlatildi", credit: false },
    manual_subtract: { label: "Qo'lda ayirildi", credit: false },
    clawback: { label: "To'lov qaytgani uchun olindi", credit: false },
    expired: { label: "Muddati tugadi", credit: false },
}

export function Mijozlar() {
    const qc = useQueryClient()
    const { data: rawClients, isLoading: loading, error: queryError, refetch: fetchCustomers } = useClients()
    const deleteClientMutation = useDeleteClient()
    const deleteClientsMutation = useDeleteClients()
    const updateClientMutation = useUpdateClient()
    const setCommunityApproved = useSetCommunityApproved()

    const lastEventDatesQuery = useClientsLastEventDates()
    const customers = useMemo<Customer[]>(() => {
        const lastDates = lastEventDatesQuery.data
        return (rawClients ?? []).map(row => {
            const lastDate = lastDates?.get(row.id) ?? null
            const days = lastDate
                ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000)
                : null
            return {
                id: row.id,
                name: row.full_name,
                email: row.email ?? '',
                phone: row.phone ?? '',
                activity: row.activity ?? '',
                location: (row as unknown as { location: string | null }).location ?? '',
                eventsCount: row.events_count,
                daysSinceLastEvent: days,
                status: row.status,
                joinDate: row.join_date ?? '',
                image: row.image ?? '',
                totalSpent: formatMoney(Number(row.total_spent)),
                cashbackBalance: Number(row.cashback_balance ?? 0),
                authUserId: row.auth_user_id,
                communityApproved: row.community_approved ?? false,
            }
        })
    }, [rawClients, lastEventDatesQuery.data])

    const error = queryError ? (queryError instanceof Error ? queryError.message : "Ma'lumotlarni yuklashda xatolik") : null

    const [selectedMijozlar, setSelectedMijozlar] = useState<string[]>([])
    const [sorting, setSorting] = useState<SortingState>([])
    const [globalFilter, setGlobalFilter] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [drawerTab, setDrawerTab] = useState<'cashback' | 'malumotlar'>('malumotlar')
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)

    const [cropImageSrc, setCropImageSrc] = useState("")
    const [isCropOpen, setIsCropOpen] = useState(false)
    const [pendingImageFile, setPendingImageFile] = useState<Blob | null>(null)

    // Save / delete UX state
    const [savingNewCustomer, setSavingNewCustomer] = useState(false)
    const [addError, setAddError] = useState<string | null>(null)
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

    // Cashback adjust modal + toast
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    function showToast(message: string, type: "success" | "error") {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast({ message, type })
        toastTimerRef.current = setTimeout(() => setToast(null), 3000)
    }
    useEffect(() => () => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }, [])


    const journeyQuery = useClientJourney(selectedCustomer?.id ?? null)
    const expiryQuery = useCashbackNextExpiry(selectedCustomer?.id ?? null)
    const { canEdit } = useAuth()
    const [adjustOpen, setAdjustOpen] = useState(false)

    // Inline edit state for sidebar
    const [editingField, setEditingField] = useState<"name" | "activity" | "phone" | "email" | null>(null)
    const [editValue, setEditValue] = useState("")

    // Bulk edit mode
    const [editAllMode, setEditAllMode] = useState(false)
    const [editAllValues, setEditAllValues] = useState({ name: '', phone: '', email: '', activity: '', location: '' })

    function startEdit(field: "name" | "activity" | "phone" | "email") {
        if (!selectedCustomer) return
        setEditingField(field)
        setEditValue(selectedCustomer[field])
    }

    function saveEdit() {
        if (!selectedCustomer || !editingField) return
        const fieldMap = { name: "full_name", activity: "activity", phone: "phone", email: "email" } as const
        const dbField = fieldMap[editingField]
        updateClientMutation.mutate(
            { id: selectedCustomer.id, data: { [dbField]: editValue.trim() || null } },
            {
                onSuccess: () => {
                    setSelectedCustomer({ ...selectedCustomer, [editingField]: editValue.trim() })
                    setEditingField(null)
                },
                onError: showSaveError,
            }
        )
    }

    function cancelEdit() {
        setEditingField(null)
        setEditValue("")
    }

    function startEditAll() {
        if (!selectedCustomer) return
        setEditAllValues({
            name: selectedCustomer.name || '',
            phone: selectedCustomer.phone || '',
            email: selectedCustomer.email || '',
            activity: selectedCustomer.activity || '',
            location: selectedCustomer.location || '',
        })
        setEditAllMode(true)
        setEditingField(null)
    }

    function cancelEditAll() {
        setEditAllMode(false)
    }

    function saveEditAll() {
        if (!selectedCustomer) return
        updateClientMutation.mutate(
            { id: selectedCustomer.id, data: {
                full_name: editAllValues.name.trim() || undefined,
                phone: editAllValues.phone.trim() || undefined,
                email: editAllValues.email.trim() || undefined,
                activity: editAllValues.activity.trim() || undefined,
                location: editAllValues.location.trim() || undefined,
            }},
            {
                onSuccess: () => {
                    setSelectedCustomer({ ...selectedCustomer,
                        name: editAllValues.name.trim(),
                        phone: editAllValues.phone.trim(),
                        email: editAllValues.email.trim(),
                        activity: editAllValues.activity.trim(),
                        location: editAllValues.location.trim(),
                    })
                    setEditAllMode(false)
                },
                onError: showSaveError,
            }
        )
    }

    function showSaveError(err: unknown) {
        showToast(
            (err as { code?: string }).code === '23505' ? "Bu telefon raqam boshqa mijozda band" : "Saqlab bo'lmadi",
            "error",
        )
    }

    // New Customer Form State
    const [newCustomer, setNewCustomer] = useState({
        name: '',
        activity: '',
        role: '',
        phone: '',
        email: '',
        joinDate: new Date().toISOString().split('T')[0],
        image: ''
    });

    // Same phone already in the base? (the DB rejects it too — migration 057 — this just says so while typing)
    const duplicateClient = useMemo(() => {
        const p = normalizePhone(newCustomer.phone)
        if (!p || !/^\+998\d{9}$/.test(p)) return null
        return customers.find(c => normalizePhone(c.phone) === p) ?? null
    }, [newCustomer.phone, customers])

    useEffect(() => {
        setDrawerTab('malumotlar')
        setEditingField(null)
        setEditValue("")
        setEditAllMode(false)
    }, [selectedCustomer])

    const stats = useMemo(() => {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        const newLast30 = customers.filter((c) => {
            if (!c.joinDate) return false
            const t = new Date(c.joinDate).getTime()
            return Number.isFinite(t) && t >= thirtyDaysAgo
        }).length
        const withEvents = customers.filter((c) => c.eventsCount > 0).length
        return [
            {
                title: "Jami Mijozlar soni",
                value: customers.length.toString(),
                subtitle: "Bazadagi barcha mijozlar",
                icon: Users,
                color: "text-ink",
                bg: "bg-surface-sunken",
            },
            {
                title: "Yangi mijozlar (30 kun)",
                value: newLast30.toString(),
                subtitle: "So'nggi 30 kun ichida qo'shilgan",
                icon: UserPlus,
                color: "text-ink",
                bg: "bg-surface-sunken",
            },
            {
                title: "Tadbirlarda ishtirok etgan",
                value: withEvents.toString(),
                subtitle: "Kamida 1 ta tadbirga yozilgan",
                icon: Ticket,
                color: "text-ink",
                bg: "bg-surface-sunken",
            },
        ]
    }, [customers])

    const columns = useMemo(() => [
        columnHelper.display({
            id: 'select',
            header: ({ table }) => (
                <input
                    type="checkbox"
                    checked={table.getIsAllPageRowsSelected()}
                    onChange={table.getToggleAllPageRowsSelectedHandler()}
                    className="w-4 h-4 rounded-checkbox border-line text-ink focus:ring-0 cursor-pointer"
                />
            ),
            cell: ({ row }) => (
                <input
                    type="checkbox"
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded-checkbox border-line text-ink focus:ring-0 cursor-pointer"
                />
            ),
        }),
        columnHelper.accessor('name', {
            header: ({ column }) => <SortHeader column={column} label="Mijoz" />,
            // Trim + locale compare: some names carry leading spaces and Cyrillic, which the default sort mis-orders
            sortingFn: (a, b, id) => a.getValue<string>(id).trim().localeCompare(b.getValue<string>(id).trim(), "uz"),
            cell: info => (
                <div className="flex items-center gap-3">
                    <div className="size-9 rounded-full overflow-hidden flex-shrink-0 bg-mute-soft flex items-center justify-center">
                        {info.row.original.image ? (
                            <img src={info.row.original.image} alt="" className="w-full h-full object-cover object-top" />
                        ) : (
                            <span className="text-sm font-medium text-ink-muted">
                                {info.row.original.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                            </span>
                        )}
                    </div>
                    <span className="text-base font-medium text-ink whitespace-nowrap">{info.getValue()}</span>
                </div>
            ),
        }),
        columnHelper.accessor('phone', {
            header: 'Kontakt',
            cell: info => <span className="text-ink-muted tabular-nums whitespace-nowrap">{info.getValue()}</span>,
        }),
        columnHelper.accessor('activity', {
            header: 'Faoliyati',
            // w-0 + min-w-full: the text never widens the column; it takes the leftover width and fades out at the edge
            cell: info => (
                <div className="w-0 min-w-full overflow-hidden whitespace-nowrap text-ink-muted [mask-image:linear-gradient(to_right,black_calc(100%-48px),transparent)]">
                    {info.getValue()}
                </div>
            ),
        }),
        columnHelper.accessor(
            (c) => getClientActivityStatus({ events_count: c.eventsCount, days_since_last_event: c.daysSinceLastEvent }),
            {
                id: 'holat',
                enableSorting: false,
                enableGlobalFilter: false,
                filterFn: (row, id, value: ClientActivityStatus | undefined) => !value || row.getValue(id) === value,
                header: ({ column, table }) => <StatusFilterHeader column={column} table={table} />,
                cell: (info) => {
                    const m = ACTIVITY_STATUS_META[info.getValue()]
                    return <StatusBadge label={m.label} variant={m.variant} dot />
                },
            },
        ),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-right pr-6">Amallar</div>,
            cell: (info) => (
                <div className="flex items-center justify-end gap-1 pr-2">
                    <button
                        className="size-8 flex items-center justify-center hover:bg-mute-ghost-hover rounded-control-sm transition-colors text-ink"
                        title="Ko'rish"
                        aria-label="Ko'rish"
                        onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCustomer(info.row.original)
                        }}
                    >
                        <Eye size={18} />
                    </button>
                    <button
                        className="size-8 flex items-center justify-center hover:bg-danger-soft rounded-control-sm transition-colors text-ink hover:text-danger-text"
                        title="O'chirish"
                        aria-label="O'chirish"
                        onClick={(e) => {
                            e.stopPropagation();
                            setCustomerToDelete(info.row.original);
                        }}
                    >
                        <Trash size={18} />
                    </button>
                </div>
            ),
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [])

    const rowSelection = useMemo(
        () => selectedMijozlar.reduce((acc, id) => {
            const idx = customers.findIndex(c => c.id === id)
            if (idx !== -1) acc[idx] = true
            return acc
        }, {} as Record<string, boolean>),
        [selectedMijozlar, customers]
    )

    const table = useReactTable({
        data: customers,
        columns,
        state: { sorting, globalFilter, rowSelection },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
        onRowSelectionChange: (updater) => {
            const newSel = typeof updater === 'function' ? updater(rowSelection) : updater
            const ids = Object.keys(newSel)
                .filter(k => newSel[Number(k)])
                .map(k => customers[Number(k)]?.id)
                .filter((id): id is string => Boolean(id))
            setSelectedMijozlar(ids)
        },
    })

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setCropImageSrc(reader.result as string)
                setIsCropOpen(true)
            }
            reader.readAsDataURL(file)
        }
        // Reset input so same file can be re-selected
        e.target.value = ""
    }

    const handleCropped = async (blob: Blob) => {
        setIsCropOpen(false)
        setCropImageSrc("")

        // If we're updating an existing client (sidebar open)
        if (selectedCustomer) {
            try {
                const { uploadClientImage, updateClient } = await import("@/lib/supabase/queries/clients")
                const imageUrl = await uploadClientImage(blob, selectedCustomer.id)
                await updateClient(selectedCustomer.id, { image: imageUrl })
                setSelectedCustomer(prev => prev ? { ...prev, image: imageUrl } : null)
                qc.invalidateQueries({ queryKey: CLIENTS_KEY })
                showToast("Rasm muvaffaqiyatli qo'shildi", "success")
            } catch (err) {
                console.error("Rasm yuklashda xatolik:", err)
                showToast("Rasm yuklab bo'lmadi", "error")
            }
            return
        }

        // For new client form — revoke prior preview before creating a new one
        setPendingImageFile(blob)
        const previewUrl = URL.createObjectURL(blob)
        setNewCustomer(prev => {
            if (prev.image && prev.image.startsWith("blob:")) URL.revokeObjectURL(prev.image)
            return { ...prev, image: previewUrl }
        })
    }

    const handleAddCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (savingNewCustomer) return  // guard against double-submit
        setSavingNewCustomer(true)
        setAddError(null)
        let imageUploadFailed = false
        try {
            const { createClient, uploadClientImage, updateClient } = await import("@/lib/supabase/queries/clients")

            // 1. Create client first to get an ID
            const row = await createClient({
                full_name: newCustomer.name,
                email: newCustomer.email || null,
                phone: newCustomer.phone || null,
                activity: newCustomer.activity || null,
                role: newCustomer.role || null,
                image: null,
                join_date: newCustomer.joinDate,
                status: 'Faol',
            })

            // 2. Upload image (best-effort — client is already created so don't block on image)
            if (pendingImageFile) {
                try {
                    const imageUrl = await uploadClientImage(pendingImageFile, row.id)
                    await updateClient(row.id, { image: imageUrl })
                } catch (imgErr) {
                    imageUploadFailed = true
                    console.error('Rasm yuklashda xatolik:', imgErr)
                }
            }

            qc.invalidateQueries({ queryKey: CLIENTS_KEY })
            // Cleanup blob + state
            if (newCustomer.image && newCustomer.image.startsWith("blob:")) URL.revokeObjectURL(newCustomer.image)
            setPendingImageFile(null)
            setNewCustomer({
                name: '',
                activity: '',
                role: '',
                phone: '',
                email: '',
                joinDate: new Date().toISOString().split('T')[0],
                image: ''
            });
            setIsAddModalOpen(false)

            if (imageUploadFailed) {
                showToast("Mijoz saqlandi, lekin rasm yuklanmadi", "error")
            } else if (pendingImageFile) {
                showToast("Rasm muvaffaqiyatli qo'shildi", "success")
            }
        } catch (err) {
            const code = (err as { code?: string }).code
            setAddError(
                code === '23505'
                    ? "Bu telefon raqami allaqachon ro'yxatdan o'tgan"
                    : err instanceof Error ? err.message : 'Mijoz yaratishda xatolik'
            )
        } finally {
            setSavingNewCustomer(false)
        }
    };

    function closeAddModal() {
        if (savingNewCustomer) return  // don't allow close during save
        if (newCustomer.image && newCustomer.image.startsWith("blob:")) URL.revokeObjectURL(newCustomer.image)
        setPendingImageFile(null)
        setNewCustomer((prev) => ({ ...prev, image: '' }))
        setAddError(null)
        setIsAddModalOpen(false)
    }

    function closeDetailsModal() {
        setSelectedCustomer(null)
        cancelEdit()
    }

    function closeBulkDeleteConfirm() {
        if (!deleteClientsMutation.isPending) setBulkDeleteConfirm(false)
    }

    // Dialog a11y: focus trap + Escape + focus return, one per modal
    const detailsTitleId = useId()
    const detailsPanelRef = useDialog<HTMLDivElement>(closeDetailsModal, Boolean(selectedCustomer))
    const addModalTitleId = useId()
    const addModalPanelRef = useDialog<HTMLDivElement>(closeAddModal, isAddModalOpen)
    const addFormId = useId()
    const deleteTitleId = useId()
    const deletePanelRef = useDialog<HTMLDivElement>(() => setCustomerToDelete(null), Boolean(customerToDelete))
    const bulkDeleteTitleId = useId()
    const bulkDeletePanelRef = useDialog<HTMLDivElement>(closeBulkDeleteConfirm, bulkDeleteConfirm)

    return (
        <div className="flex flex-col gap-6 min-h-full pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <ThinkingOrb state="searching" size={64} theme="light" />
                </div>
            )}
            {error && !loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                    <span className="text-base text-danger-text font-medium">{error}</span>
                    <button onClick={() => fetchCustomers()} className="text-base text-ink font-bold underline">Qayta urinish</button>
                </div>
            )}
            {!loading && !error && <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.map((stat, index) => (
                    <div key={index} className="bg-surface border border-line rounded-surface p-5 flex flex-col gap-3 transition-all">
                        <span className="text-base font-medium text-ink-muted">{stat.title}</span>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${stat.bg} rounded-control-sm flex items-center justify-center`}>
                                <stat.icon size={20} className={stat.color} />
                            </div>
                            <span className="text-xl font-bold text-ink">{stat.value}</span>
                        </div>
                        <span className="text-xs text-ink-faint">{stat.subtitle}</span>
                    </div>
                ))}
            </div>

            {/* Table Area */}
            <div className="flex flex-col gap-3">
                {/* Search & Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <input 
                                type="text" 
                                value={globalFilter ?? ''}
                                onChange={e => setGlobalFilter(e.target.value)}
                                placeholder="Ism, telefon yoki faoliyat bo'yicha qidirish..." 
                                className="pl-9 pr-4 py-2 bg-surface-sunken border-transparent focus:bg-surface focus:border-line-focus rounded-control text-base w-80 transition-all outline-hidden font-medium"
                            />
                            <Users size={16} className="text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                        {selectedMijozlar.length > 0 && (
                            <div className="flex items-center gap-2 pl-4 border-l border-line">
                                <span className="text-base font-bold text-ink">{selectedMijozlar.length} ta tanlandi</span>
                                <button
                                    onClick={() => setBulkDeleteConfirm(true)}
                                    disabled={deleteClientsMutation.isPending}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-danger-soft hover:bg-danger-soft text-danger-text rounded-control-sm text-sm font-bold transition-colors disabled:opacity-50"
                                >
                                    <Trash size={16} />
                                    Tanlanganlarni o'chirish
                                </button>
                                <button
                                    onClick={() => setSelectedMijozlar([])}
                                    className="text-sm text-ink-muted hover:text-ink transition-colors"
                                >
                                    Bekor
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-accent text-ink-on-accent rounded-control text-base font-bold hover:bg-accent-hover transition-all active:scale-95"
                        >
                            <Plus size={16} />
                            Yangi mijoz
                        </button>
                    </div>
                </div>

                {/* Table Data */}
                <div className={tbl.scroll}>
                    <table className={tbl.table}>
                        <thead>
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <th key={header.id} className={tbl.th}>
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.length > 0 ? (
                                table.getRowModel().rows.map(row => (
                                    <tr
                                        key={row.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedCustomer(row.original)}
                                        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCustomer(row.original) } }}
                                        className={`${tbl.tr} cursor-pointer`}
                                    >
                                        {row.getVisibleCells().map(cell => (
                                            <td key={cell.id} className={`${tbl.td} ${cell.column.id === "activity" ? "w-full" : ""} ${row.getIsSelected() ? tbl.tdSelected : ""}`}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length} className={tbl.empty}>
                                        Ma'lumot topilmadi
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <Pager
                    page={table.getState().pagination.pageIndex}
                    pageCount={table.getPageCount()}
                    total={table.getFilteredRowModel().rows.length}
                    onPage={table.setPageIndex}
                />
            </div>

            {/* Details Modal */}
            <AnimatePresence>
                {selectedCustomer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-surface-overlay backdrop-blur-[3px]"
                        onClick={closeDetailsModal}
                    >
                    <motion.div
                        ref={detailsPanelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={detailsTitleId}
                        tabIndex={-1}
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 16 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                        onClick={e => e.stopPropagation()}
                        className="w-[520px] max-h-[92vh] bg-surface-raised rounded-overlay flex flex-col overflow-hidden"
                    >
                        <div className="flex flex-col">
                            {/* AVATAR + INFO */}
                            <div className="relative flex flex-col items-center pt-6 pb-6 px-8 border-b border-line gap-3">
                                {/* Close button overlaid top-right */}
                                <button
                                    onClick={closeDetailsModal}
                                    aria-label="Yopish"
                                    className="absolute top-3 right-3 p-2 hover:bg-mute-ghost-hover rounded-control transition-colors text-ink-muted"
                                >
                                    <X size={20} />
                                </button>
                                {/* Circle avatar */}
                                <div className="relative group flex-shrink-0">
                                    <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-surface-sunken flex items-center justify-center">
                                        {selectedCustomer.image ? (
                                            <img src={selectedCustomer.image} alt="" className="w-full h-full object-cover object-top" />
                                        ) : (
                                            <span className="text-2xl font-semibold text-ink-faint">
                                                {selectedCustomer.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    {/* Upload button on hover */}
                                    <button
                                        onClick={() => document.getElementById('sidebar-image-upload')?.click()}
                                        aria-label="Rasm yuklash"
                                        className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    >
                                        <ImageIcon size={18} className="text-white" />
                                    </button>
                                </div>

                                {/* Name + phone */}
                                <div className="flex flex-col items-center gap-1 text-center">
                                    <h1 id={detailsTitleId} className="text-lg font-semibold text-ink leading-tight">{selectedCustomer.name}</h1>
                                    {selectedCustomer.phone && (
                                        <span className="text-base text-ink-muted">{formatPhone(selectedCustomer.phone)}</span>
                                    )}
                                </div>

                                {/* Download button (visible only if image exists) */}
                                {selectedCustomer.image && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                const res = await fetch(selectedCustomer.image)
                                                const blob = await res.blob()
                                                const url = URL.createObjectURL(blob)
                                                const a = document.createElement("a")
                                                a.href = url
                                                a.download = `${selectedCustomer.name.replace(/\s+/g, "_")}.jpg`
                                                a.click()
                                                setTimeout(() => URL.revokeObjectURL(url), 1000)
                                            } catch { /* ignore */ }
                                        }}
                                        className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
                                    >
                                        <DownloadSimple size={12} weight="bold" />
                                        Rasmni saqlash
                                    </button>
                                )}
                            </div>

                            {/* TABS */}
                            <div className="flex border-b border-line bg-surface-raised sticky top-0 z-[5] pl-4">
                                {([
                                    { id: 'malumotlar' as const, label: "Ma'lumotlar" },
                                    { id: 'cashback' as const, label: 'Cashback' },
                                ]).map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => { cancelEdit(); setDrawerTab(tab.id) }}
                                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                                            drawerTab === tab.id
                                                ? 'border-line-focus text-ink'
                                                : 'border-transparent text-ink-muted'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* TAB: Cashback */}
                            {drawerTab === 'cashback' && (
                                <div className="px-8 py-6 flex flex-col gap-4">
                                    {/* Balance + next expiry */}
                                    <div className="flex items-start justify-between gap-4 p-4 rounded-surface bg-surface-sunken">
                                        <div className="flex flex-col gap-1 min-w-0">
                                            <span className="text-sm text-ink-muted">Joriy balans</span>
                                            <span className="text-xl font-semibold text-ink tabular-nums">
                                                {formatMoney(journeyQuery.data?.totals.cashback_balance ?? selectedCustomer.cashbackBalance)}
                                            </span>
                                            {expiryQuery.data && (
                                                <span className="text-sm text-warning-text">
                                                    {formatNumber(expiryQuery.data.amount)} so'm {formatDate(expiryQuery.data.expires_on)} da kuyadi
                                                </span>
                                            )}
                                            <span className="text-xs text-ink-faint">Keshbek tadbirdan so'ng tushadi va 12 oy amal qiladi</span>
                                        </div>
                                        {canEdit("tadbirlar-moliya") && (
                                            <button
                                                type="button"
                                                onClick={() => setAdjustOpen(true)}
                                                className="flex-shrink-0 px-3.5 h-control-md rounded-control bg-surface text-base font-medium text-ink hover:bg-mute-ghost-hover transition-colors"
                                            >
                                                O'zgartirish
                                            </button>
                                        )}
                                    </div>

                                    {/* Ledger */}
                                    {journeyQuery.isLoading ? (
                                        <div className="flex items-center gap-2 py-4 justify-center">
                                            <ThinkingOrb state="weaving" size={20} theme="light" />
                                        </div>
                                    ) : (journeyQuery.data?.cashback_history.length ?? 0) === 0 ? (
                                        <p className="text-sm text-ink-muted py-4 text-center">Hali keshbek harakati yo'q</p>
                                    ) : (
                                        <div className="flex flex-col">
                                            {journeyQuery.data!.cashback_history.map(t => {
                                                const meta = CASHBACK_TYPE[t.type]
                                                const value = Math.abs(Number(t.amount))
                                                return (
                                                    <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-0">
                                                        <div className="flex flex-col gap-0.5 min-w-0">
                                                            <span className="text-base text-ink">{meta.label}</span>
                                                            <span className="text-xs text-ink-muted truncate">
                                                                {formatDate(t.created_at)}{t.description ? ` · ${t.description}` : ''}
                                                            </span>
                                                        </div>
                                                        <span className={`text-base font-semibold tabular-nums flex-shrink-0 ${meta.credit ? 'text-success-text' : 'text-ink-muted'}`}>
                                                            {meta.credit ? '+' : '−'}{formatNumber(value)}
                                                        </span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    <AdjustCashbackModal
                                        isOpen={adjustOpen}
                                        onClose={() => setAdjustOpen(false)}
                                        clientId={selectedCustomer.id}
                                        clientName={selectedCustomer.name}
                                        currentBalance={journeyQuery.data?.totals.cashback_balance ?? selectedCustomer.cashbackBalance}
                                        onSuccess={() => showToast("Keshbek balansi o'zgartirildi", "success")}
                                    />
                                </div>
                            )}

                            {/* TAB: Ma'lumotlar */}
                            {drawerTab === 'malumotlar' && (
                                <div className="px-8 py-6 flex flex-col gap-5">
                                    {/* Name */}
                                    {editAllMode ? (
                                        <>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm text-ink-muted">Ism</span>
                                                <input autoFocus value={editAllValues.name}
                                                    onChange={e => setEditAllValues(v => ({ ...v, name: e.target.value }))}
                                                    className="px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm text-ink-muted">Telefon</span>
                                                <input value={editAllValues.phone}
                                                    onChange={e => setEditAllValues(v => ({ ...v, phone: e.target.value }))}
                                                    placeholder="+998 90 123 45 67"
                                                    className="px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm text-ink-muted">Email</span>
                                                <input value={editAllValues.email}
                                                    onChange={e => setEditAllValues(v => ({ ...v, email: e.target.value }))}
                                                    placeholder="email@example.com"
                                                    className="px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm text-ink-muted">Faoliyat</span>
                                                <input value={editAllValues.activity}
                                                    onChange={e => setEditAllValues(v => ({ ...v, activity: e.target.value }))}
                                                    className="px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm text-ink-muted">Lokatsiya</span>
                                                <input value={editAllValues.location}
                                                    onChange={e => setEditAllValues(v => ({ ...v, location: e.target.value }))}
                                                    placeholder="Shahar, tuman"
                                                    className="px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-ink-muted">Ism</span>
                                                    {editingField !== "name" && (
                                                        <button type="button" onClick={() => startEdit("name")} aria-label="Tahrirlash"
                                                            className="text-ink-muted opacity-0 group-hover:opacity-100 cursor-pointer">
                                                            <PencilSimple size={12} weight="bold" />
                                                        </button>
                                                    )}
                                                </div>
                                                {editingField === "name" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { e.preventDefault(); cancelEdit() } }}
                                                            className="flex-1 px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface" />
                                                        <button onClick={saveEdit} aria-label="Saqlash" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><Check size={16} className="text-ink" /></button>
                                                        <button onClick={cancelEdit} aria-label="Bekor qilish" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><X size={16} className="text-ink-muted" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-base text-ink">{selectedCustomer.name}</span>
                                                )}
                                            </div>
                                            {/* Phone */}
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-ink-muted">Telefon</span>
                                                    {editingField !== "phone" && (
                                                        <button type="button" onClick={() => startEdit("phone")} aria-label="Tahrirlash"
                                                            className="text-ink-muted opacity-0 group-hover:opacity-100 cursor-pointer">
                                                            <PencilSimple size={12} weight="bold" />
                                                        </button>
                                                    )}
                                                </div>
                                                {editingField === "phone" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { e.preventDefault(); cancelEdit() } }}
                                                            className="flex-1 px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface"
                                                            placeholder="+998 90 123 45 67" />
                                                        <button onClick={saveEdit} aria-label="Saqlash" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><Check size={16} className="text-ink" /></button>
                                                        <button onClick={cancelEdit} aria-label="Bekor qilish" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><X size={16} className="text-ink-muted" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-base text-ink">{selectedCustomer.phone || '—'}</span>
                                                )}
                                            </div>
                                            {/* Email */}
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-ink-muted">Email</span>
                                                    {editingField !== "email" && (
                                                        <button type="button" onClick={() => startEdit("email")} aria-label="Tahrirlash"
                                                            className="text-ink-muted opacity-0 group-hover:opacity-100 cursor-pointer">
                                                            <PencilSimple size={12} weight="bold" />
                                                        </button>
                                                    )}
                                                </div>
                                                {editingField === "email" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { e.preventDefault(); cancelEdit() } }}
                                                            className="flex-1 px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface"
                                                            placeholder="email@example.com" />
                                                        <button onClick={saveEdit} aria-label="Saqlash" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><Check size={16} className="text-ink" /></button>
                                                        <button onClick={cancelEdit} aria-label="Bekor qilish" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><X size={16} className="text-ink-muted" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-base text-ink truncate">{selectedCustomer.email || '—'}</span>
                                                )}
                                            </div>
                                            {/* Activity */}
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-ink-muted">Faoliyat</span>
                                                    {editingField !== "activity" && (
                                                        <button type="button" onClick={() => startEdit("activity")} aria-label="Tahrirlash"
                                                            className="text-ink-muted opacity-0 group-hover:opacity-100 cursor-pointer">
                                                            <PencilSimple size={12} weight="bold" />
                                                        </button>
                                                    )}
                                                </div>
                                                {editingField === "activity" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { e.preventDefault(); cancelEdit() } }}
                                                            className="flex-1 px-3 py-2 bg-surface-sunken rounded-control text-base text-ink outline-none focus:bg-surface" />
                                                        <button onClick={saveEdit} aria-label="Saqlash" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><Check size={16} className="text-ink" /></button>
                                                        <button onClick={cancelEdit} aria-label="Bekor qilish" className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm"><X size={16} className="text-ink-muted" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-base text-ink">{selectedCustomer.activity || '—'}</span>
                                                )}
                                            </div>
                                            {/* Lokatsiya */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm text-ink-muted">Lokatsiya</span>
                                                <span className="text-base text-ink">{selectedCustomer.location || '—'}</span>
                                            </div>
                                        </>
                                    )}
                                    {/* Join date */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm text-ink-muted">Qo'shilgan sana</span>
                                        <span className="text-base text-ink">{selectedCustomer.joinDate || '—'}</span>
                                    </div>
                                    {/* Community toggle */}
                                    {selectedCustomer.authUserId && (
                                        <div className="flex items-center justify-between py-2 border-t border-line">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-base text-ink">Hamjamiyat</span>
                                                <span className="text-xs text-ink-muted">
                                                    {selectedCustomer.communityApproved ? "Tasdiqlangan — chat ochiq" : "Kutilmoqda — chat yopiq"}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => setCommunityApproved.mutate(
                                                    { clientId: selectedCustomer.id, approved: !selectedCustomer.communityApproved },
                                                    { onSuccess: () => showToast(selectedCustomer.communityApproved ? "Hamjamiyat o'chirildi" : "Hamjamiyat tasdiqlandi", "success") }
                                                )}
                                                disabled={setCommunityApproved.isPending}
                                                aria-pressed={selectedCustomer.communityApproved}
                                                aria-label="Hamjamiyat"
                                                className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
                                                style={{ background: selectedCustomer.communityApproved ? "var(--ds-color-success-default)" : "var(--ds-color-mute-soft)" }}
                                            >
                                                <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-surface-raised rounded-full transition-transform duration-200"
                                                    style={{ transform: selectedCustomer.communityApproved ? "translateX(20px)" : "translateX(0)" }} />
                                            </button>
                                        </div>
                                    )}
                                    {/* Action buttons */}
                                    {editAllMode ? (
                                        <div className="flex gap-3 mt-6 mb-6">
                                            <button
                                                onClick={saveEditAll}
                                                disabled={updateClientMutation.isPending}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-control text-sm font-semibold bg-accent text-ink-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
                                            >
                                                <Check size={16} />
                                                Saqlash
                                            </button>
                                            <button
                                                onClick={cancelEditAll}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-control text-sm font-semibold text-ink-muted bg-mute-soft hover:bg-mute-soft-hover transition-colors"
                                            >
                                                Bekor qilish
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-3 mt-6 mb-6">
                                            <button
                                                onClick={startEditAll}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-control text-sm font-semibold bg-accent text-ink-on-accent hover:bg-accent-hover transition-colors"
                                            >
                                                <PencilSimple size={16} />
                                                O'zgartirish
                                            </button>
                                            <button
                                                onClick={() => setCustomerToDelete(selectedCustomer)}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-control text-sm font-semibold text-danger-text bg-danger-soft hover:bg-danger-soft transition-colors"
                                            >
                                                <Trash size={16} />
                                                O'chirish
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>



            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-control text-sm font-bold ${
                            toast.type === "success"
                                ? "bg-surface-sunken text-ink border border-line"
                                : "bg-danger-soft text-danger-text border border-line"
                        }`}
                    >
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Customer Modal */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeAddModal}
                            className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
                        />
                        <motion.div
                            ref={addModalPanelRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={addModalTitleId}
                            tabIndex={-1}
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-surface-raised rounded-overlay w-full max-w-xl relative overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-line flex items-center justify-between bg-surface-raised">
                                <h3 id={addModalTitleId} className="text-lg font-bold text-ink">Yangi mijoz qo'shish</h3>
                                <button
                                    onClick={closeAddModal}
                                    aria-label="Yopish"
                                    className="p-1 hover:bg-mute-ghost-hover rounded-full transition-all"
                                >
                                    <X size={24} weight="light" className="text-ink-muted" />
                                </button>
                            </div>

                            <form onSubmit={handleAddCustomer} className="p-6 overflow-y-auto max-h-[80vh] no-scrollbar">
                                <div className="grid grid-cols-1 gap-6">
                                    {/* Image Upload */}
                                    <div className="flex flex-col items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('image-upload')?.click()}
                                            aria-label="Rasm yuklash"
                                            className="w-28 h-28 rounded-control-lg border-2 border-dashed border-line bg-surface-sunken flex flex-col items-center justify-center text-ink-muted relative overflow-hidden group hover:border-line-focus hover:bg-surface transition-all cursor-pointer"
                                        >
                                            {newCustomer.image ? (
                                                <>
                                                    <img src={newCustomer.image} alt="" className="w-full h-full object-cover" />
                                                    <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                        <Camera size={24} weight="light" className="text-white" />
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="flex flex-col items-center gap-1">
                                                    <Camera size={32} weight="thin" className="opacity-30" />
                                                    <span className="text-xs font-bold">RASM YUKLASH</span>
                                                </span>
                                            )}
                                        </button>
                                        <input 
                                            id="image-upload"
                                            type="file" 
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                        <p className="text-xs text-ink-muted font-medium text-center">
                                            Tavsiya etiladi: Kvadrat rasm, max 2MB
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label htmlFor={`${addFormId}-name`} className="text-sm font-bold text-ink">ISM FAMILYASI *</label>
                                            <input
                                                id={`${addFormId}-name`}
                                                required
                                                type="text"
                                                value={newCustomer.name}
                                                onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                                                placeholder="Masalan: Aziz Rahimov"
                                                className="w-full px-4 py-2 bg-surface-sunken border-transparent rounded-control text-base outline-hidden focus:bg-surface"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label htmlFor={`${addFormId}-activity`} className="text-sm font-bold text-ink">BIZNES FAOLIYATI *</label>
                                        <textarea
                                            id={`${addFormId}-activity`}
                                            required
                                            rows={2}
                                            value={newCustomer.activity}
                                            onChange={e => setNewCustomer({...newCustomer, activity: e.target.value})}
                                            placeholder="Kompaniya nomi yoki loyiha haqida..."
                                            className="w-full px-4 py-2 bg-surface-sunken border-transparent rounded-control text-base outline-hidden focus:bg-surface resize-none"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label htmlFor={`${addFormId}-role`} className="text-sm font-bold text-ink">LAVOZIM</label>
                                        <input
                                            id={`${addFormId}-role`}
                                            type="text"
                                            value={newCustomer.role}
                                            onChange={e => setNewCustomer({...newCustomer, role: e.target.value})}
                                            placeholder="Masalan: Direktor, Menejer"
                                            className="w-full px-4 py-2 bg-surface-sunken border-transparent rounded-control text-base outline-hidden focus:bg-surface"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label htmlFor={`${addFormId}-phone`} className="text-sm font-bold text-ink">TELEFON RAQAMI *</label>
                                            <PhoneInput id={`${addFormId}-phone`} value={newCustomer.phone} onChange={(full) => setNewCustomer(prev => ({ ...prev, phone: full }))} />
                                        </div>
                                        {duplicateClient && (
                                            <div role="alert" className="col-span-2 flex items-center gap-3 px-3.5 py-2.5 rounded-control bg-danger-soft text-sm text-danger-text">
                                                <span className="flex-1 min-w-0">
                                                    Bu raqam bilan mijoz allaqachon bor: <span className="font-semibold">{duplicateClient.name}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => { closeAddModal(); setSelectedCustomer(duplicateClient) }}
                                                    className="flex-shrink-0 font-semibold underline underline-offset-2"
                                                >
                                                    Ochish
                                                </button>
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-1.5">
                                            <label htmlFor={`${addFormId}-email`} className="text-sm font-bold text-ink">EMAIL (IXTIYORIY)</label>
                                            <input
                                                id={`${addFormId}-email`}
                                                type="email"
                                                value={newCustomer.email}
                                                onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                                                placeholder="example@mail.uz"
                                                className="w-full px-4 py-2 bg-surface-sunken border-transparent rounded-control text-base outline-hidden focus:bg-surface"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label htmlFor={`${addFormId}-joinDate`} className="text-sm font-bold text-ink">KLUBGA QO'SHILGAN VAQT</label>
                                        <input
                                            id={`${addFormId}-joinDate`}
                                            type="date"
                                            value={newCustomer.joinDate}
                                            onChange={e => setNewCustomer({...newCustomer, joinDate: e.target.value})}
                                            className="w-full px-4 py-2 bg-surface-sunken border-transparent rounded-control text-base outline-hidden focus:bg-surface"
                                        />
                                    </div>
                                </div>

                                {addError && (
                                    <div className="mt-4 px-3 py-2 bg-danger-soft border border-line rounded-control text-sm font-medium text-danger-text">
                                        {addError}
                                    </div>
                                )}

                                <div className="mt-8 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={closeAddModal}
                                        disabled={savingNewCustomer}
                                        className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={savingNewCustomer || !newCustomer.name.trim() || !!duplicateClient}
                                        className={`flex-1 px-4 py-2.5 rounded-control text-base font-bold text-ink-on-accent transition-all active:scale-95 flex items-center justify-center gap-2 ${
                                            savingNewCustomer || !newCustomer.name.trim() || duplicateClient
                                                ? "bg-mute-soft cursor-not-allowed"
                                                : "bg-accent hover:bg-accent-hover"
                                        }`}
                                    >
                                        {savingNewCustomer ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                Saqlanmoqda...
                                            </>
                                        ) : "Saqlash"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Image Crop Modal */}
            <ImageCropModal
                isOpen={isCropOpen}
                imageSrc={cropImageSrc}
                onClose={() => {
                    setIsCropOpen(false)
                    setCropImageSrc("")
                }}
                onCropped={handleCropped}
            />

            {/* Hidden file input for sidebar image update */}
            <input
                id="sidebar-image-upload"
                type="file"
                accept="image/*"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                            setCropImageSrc(reader.result as string)
                            setIsCropOpen(true)
                        }
                        reader.readAsDataURL(file)
                    }
                    e.target.value = ""
                }}
                className="hidden"
            />

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {customerToDelete && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setCustomerToDelete(null)}
                            className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
                        />
                        <motion.div
                            ref={deletePanelRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={deleteTitleId}
                            tabIndex={-1}
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-surface-raised rounded-overlay w-full max-w-[400px] relative overflow-hidden p-6 flex flex-col items-center text-center gap-4"
                        >
                            <div className="w-14 h-14 bg-danger-soft rounded-full flex items-center justify-center">
                                <Trash size={28} weight="light" className="text-danger-text" />
                            </div>

                            <div className="flex flex-col gap-1">
                                <h3 id={deleteTitleId} className="text-lg font-bold text-ink">Mijozni o'chirish</h3>
                                <p className="text-base text-ink-muted font-medium leading-relaxed">
                                    Siz rostdan ham <span className="text-ink font-bold">{customerToDelete.name}</span>ni tizimdan o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.
                                </p>
                            </div>

                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={() => setCustomerToDelete(null)}
                                    disabled={deleteClientMutation.isPending}
                                    className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    onClick={() => {
                                        deleteClientMutation.mutate(customerToDelete.id, {
                                            onSuccess: () => setCustomerToDelete(null),
                                        })
                                    }}
                                    disabled={deleteClientMutation.isPending}
                                    className={`flex-1 px-4 py-2.5 rounded-control text-base font-bold text-white transition-all active:scale-95 flex items-center justify-center gap-2 ${
                                        deleteClientMutation.isPending
                                            ? "bg-mute-soft cursor-not-allowed"
                                            : "bg-danger hover:bg-danger"
                                    }`}
                                >
                                    {deleteClientMutation.isPending ? (
                                        <>
                                            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            O'chirilmoqda...
                                        </>
                                    ) : "O'chirish"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Bulk delete confirmation */}
            <AnimatePresence>
                {bulkDeleteConfirm && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeBulkDeleteConfirm}
                            className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
                        />
                        <motion.div
                            ref={bulkDeletePanelRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={bulkDeleteTitleId}
                            tabIndex={-1}
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-surface-raised rounded-overlay w-full max-w-[420px] relative overflow-hidden p-6 flex flex-col items-center text-center gap-4"
                        >
                            <div className="w-14 h-14 bg-danger-soft rounded-full flex items-center justify-center">
                                <Trash size={28} weight="light" className="text-danger-text" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <h3 id={bulkDeleteTitleId} className="text-lg font-bold text-ink">Mijozlarni o'chirish</h3>
                                <p className="text-base text-ink-muted font-medium leading-relaxed">
                                    Tanlangan <span className="text-ink font-bold">{selectedMijozlar.length} ta</span> mijozni o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.
                                </p>
                            </div>
                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={() => setBulkDeleteConfirm(false)}
                                    disabled={deleteClientsMutation.isPending}
                                    className="flex-1 px-4 py-2.5 bg-mute-soft text-ink rounded-control text-base font-bold hover:bg-mute-soft-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    onClick={() => {
                                        deleteClientsMutation.mutate(selectedMijozlar, {
                                            onSuccess: () => {
                                                setSelectedMijozlar([])
                                                setBulkDeleteConfirm(false)
                                            },
                                        })
                                    }}
                                    disabled={deleteClientsMutation.isPending}
                                    className={`flex-1 px-4 py-2.5 rounded-control text-base font-bold text-white transition-all active:scale-95 flex items-center justify-center gap-2 ${
                                        deleteClientsMutation.isPending
                                            ? "bg-mute-soft cursor-not-allowed"
                                            : "bg-danger hover:bg-danger"
                                    }`}
                                >
                                    {deleteClientsMutation.isPending ? (
                                        <>
                                            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            O'chirilmoqda...
                                        </>
                                    ) : "Ha, o'chir"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            </>}
        </div>
    )
}

function SortHeader({ column, label }: { column: Column<Customer, unknown>; label: string }) {
    const dir = column.getIsSorted()
    return (
        <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="inline-flex items-center gap-1 hover:text-ink transition-colors"
        >
            {label}
            {dir === "asc" ? <CaretUp size={12} weight="bold" /> : dir === "desc" ? <CaretDown size={12} weight="bold" /> : null}
        </button>
    )
}

/** "Holat" header that opens a status filter menu (fixed-positioned so the table's scroll box can't clip it). */
function StatusFilterHeader({ column, table }: { column: Column<Customer, unknown>; table: Table<Customer> }) {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
    const btnRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const value = column.getFilterValue() as ClientActivityStatus | undefined

    useEffect(() => {
        if (!pos) return
        function onDown(e: MouseEvent) {
            const t = e.target as Node
            if (!menuRef.current?.contains(t) && !btnRef.current?.contains(t)) setPos(null)
        }
        function onKey(e: KeyboardEvent) { if (e.key === "Escape") setPos(null) }
        function onScroll() { setPos(null) }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        window.addEventListener("scroll", onScroll, true)
        return () => {
            document.removeEventListener("mousedown", onDown)
            document.removeEventListener("keydown", onKey)
            window.removeEventListener("scroll", onScroll, true)
        }
    }, [pos])

    const counts = new Map<ClientActivityStatus, number>()
    for (const r of table.getCoreRowModel().rows) {
        const st = r.getValue<ClientActivityStatus>("holat")
        counts.set(st, (counts.get(st) ?? 0) + 1)
    }
    const options: { value: ClientActivityStatus | undefined; label: string; count: number }[] = [
        { value: undefined, label: "Barchasi", count: table.getCoreRowModel().rows.length },
        ...(Object.keys(ACTIVITY_STATUS_META) as ClientActivityStatus[]).map((k) => ({
            value: k, label: ACTIVITY_STATUS_META[k].label, count: counts.get(k) ?? 0,
        })),
    ]

    function toggle() {
        if (pos) return setPos(null)
        const r = btnRef.current?.getBoundingClientRect()
        if (r) setPos({ top: r.bottom + 6, left: r.left })
    }

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={toggle}
                aria-haspopup="true"
                aria-expanded={!!pos}
                className={`inline-flex items-center gap-1.5 hover:text-ink transition-colors ${value ? "text-ink" : ""}`}
            >
                {value ? ACTIVITY_STATUS_META[value].label : "Holat"}
                <Funnel size={12} weight={value ? "fill" : "bold"} />
            </button>
            {pos && (
                <div
                    ref={menuRef}
                    style={{ position: "fixed", top: pos.top, left: pos.left }}
                    className="z-50 w-48 p-1 rounded-menu bg-surface-raised border border-line text-base font-normal"
                >
                    {options.map((o) => (
                        <button
                            key={o.label}
                            type="button"
                            onClick={() => { column.setFilterValue(o.value); setPos(null) }}
                            className={`w-full flex items-center justify-between gap-3 px-2.5 h-control-sm rounded-item text-left transition-colors ${value === o.value ? "bg-surface-sunken text-ink" : "text-ink hover:bg-mute-ghost-hover"}`}
                        >
                            <span className="flex items-center gap-2">
                                {value === o.value && <Check size={12} weight="bold" />}
                                {o.label}
                            </span>
                            <span className="text-sm text-ink-muted tabular-nums">{o.count}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    )
}
