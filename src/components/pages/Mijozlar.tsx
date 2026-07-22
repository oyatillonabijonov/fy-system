import {
    Users,
    UserPlus,
    Ticket,
    Funnel,
    UploadSimple,
    Plus,
    PencilSimple,
    Trash,
    DownloadSimple,
    Eye,
    X,
    Image as ImageIcon,
    Camera,
    Check,
    DeviceMobile,
} from "@phosphor-icons/react"
import { StatusBadge } from "@/components/ui/StatusBadge"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useMemo, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import { useClients, useDeleteClient, useDeleteClients, useUpdateClient, CLIENTS_KEY, useClientJourney, useClientsLastEventDates } from "@/hooks/useClients"
import { CashbackBadge } from "@/components/cashback/CashbackBadge"
import { CreateMemberAccountModal } from "@/components/mijozlar/CreateMemberAccountModal"
import { getClientActivityStatus, ACTIVITY_STATUS_META } from "@/lib/constants/clientStatus"
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getSortedRowModel,
    getFilteredRowModel,
    type SortingState,
} from '@tanstack/react-table'
import { useSetCommunityApproved } from "@/hooks/useCommunity"
import { formatDate, formatMoney, formatNumber, formatPhone } from "@/lib/format"
import { PhoneInput } from "@/components/ui/PhoneInput"




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

type MijozlarTab = "all" | "members"

const columnHelper = createColumnHelper<Customer>()

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

    const [activeTab, setActiveTab] = useState<MijozlarTab>("all")
    const [selectedMijozlar, setSelectedMijozlar] = useState<string[]>([])
    const [sorting, setSorting] = useState<SortingState>([])
    const [globalFilter, setGlobalFilter] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [drawerTab, setDrawerTab] = useState<'cashback' | 'malumotlar'>('malumotlar')
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
    const [memberAccountCustomer, setMemberAccountCustomer] = useState<Customer | null>(null)

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
            }
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
                color: "text-[#141414]",
                bg: "bg-[#F5F5F5]",
            },
            {
                title: "Yangi mijozlar (30 kun)",
                value: newLast30.toString(),
                subtitle: "So'nggi 30 kun ichida qo'shilgan",
                icon: UserPlus,
                color: "text-[#141414]",
                bg: "bg-[#F5F5F5]",
            },
            {
                title: "Tadbirlarda ishtirok etgan",
                value: withEvents.toString(),
                subtitle: "Kamida 1 ta tadbirga yozilgan",
                icon: Ticket,
                color: "text-[#141414]",
                bg: "bg-[#F5F5F5]",
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
                    className="w-4 h-4 rounded-[4px] border-[#D0D0D0] text-[#141414] focus:ring-0 cursor-pointer"
                />
            ),
            cell: ({ row }) => (
                <input
                    type="checkbox"
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded-[4px] border-[#D0D0D0] text-[#141414] focus:ring-0 cursor-pointer"
                />
            ),
        }),
        columnHelper.accessor('name', {
            header: 'Mijoz',
            cell: info => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-[#F0F0F0] flex items-center justify-center">
                        {info.row.original.image ? (
                            <img src={info.row.original.image} alt="" className="w-full h-full object-cover object-top" />
                        ) : (
                            <span className="text-[13px] font-semibold text-[#BBBBBB]">
                                {info.row.original.name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#141414]">{info.getValue()}</span>
                        <CashbackBadge balance={info.row.original.cashbackBalance} size="sm" />
                    </div>
                </div>
            ),
        }),
        columnHelper.accessor('phone', {
            header: 'Kontakt',
            cell: info => <span className="text-[13px] text-[#141414] font-medium">{info.getValue()}</span>,
        }),
        columnHelper.accessor('activity', {
            header: 'Faoliyati',
            cell: info => <div className="text-[13px] text-[#141414] font-medium leading-tight line-clamp-1">{info.getValue()}</div>,
        }),
        columnHelper.display({
            id: 'holat',
            header: 'Holat',
            cell: (info) => {
                const as = getClientActivityStatus({
                    events_count: info.row.original.eventsCount,
                    days_since_last_event: info.row.original.daysSinceLastEvent,
                })
                const m = ACTIVITY_STATUS_META[as]
                return <StatusBadge label={m.label} variant={m.variant} dot />
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-right pr-6">Amallar</div>,
            cell: (info) => (
                <div className="flex items-center justify-end gap-1 pr-2">
                    {info.row.original.authUserId ? (
                        <span className="p-1.5 text-[#141414]" title="Mobil akkaunt mavjud">
                            <DeviceMobile size={20} weight="bold" />
                        </span>
                    ) : (
                        <button
                            className="p-1.5 hover:bg-[#F3F2F0] rounded-[6px] transition-colors text-[#999999] hover:text-[#141414]"
                            title="Mobil akkaunt ochish"
                            onClick={(e) => {
                                e.stopPropagation()
                                setMemberAccountCustomer(info.row.original)
                            }}
                        >
                            <DeviceMobile size={20} weight="bold" />
                        </button>
                    )}
                    <button
                        className="p-1.5 hover:bg-[#F3F2F0] rounded-[6px] transition-colors text-[#999999] hover:text-[#141414]"
                        title="Ko'rish"
                        onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCustomer(info.row.original)
                        }}
                    >
                        <Eye size={20} weight="bold" />
                    </button>
                    <button 
                        className="p-1.5 hover:bg-red-50 rounded-[6px] transition-colors text-[#999999] hover:text-red-600" 
                        title="O'chirish" 
                        onClick={(e) => {
                            e.stopPropagation();
                            setCustomerToDelete(info.row.original);
                        }}
                    >
                        <Trash size={18} weight="bold" />
                    </button>
                </div>
            ),
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [])

    const pendingMembersCount = useMemo(
        () => customers.filter(c => c.authUserId !== null && !c.communityApproved).length,
        [customers]
    )

    const tabData = useMemo(
        () => activeTab === "members" ? customers.filter(c => c.authUserId !== null) : customers,
        [activeTab, customers]
    )

    const rowSelection = useMemo(
        () => selectedMijozlar.reduce((acc, id) => {
            const idx = tabData.findIndex(c => c.id === id)
            if (idx !== -1) acc[idx] = true
            return acc
        }, {} as Record<string, boolean>),
        [selectedMijozlar, tabData]
    )

    const table = useReactTable({
        data: tabData,
        columns,
        state: { sorting, globalFilter, rowSelection },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onRowSelectionChange: (updater) => {
            const newSel = typeof updater === 'function' ? updater(rowSelection) : updater
            const ids = Object.keys(newSel)
                .filter(k => newSel[Number(k)])
                .map(k => tabData[Number(k)]?.id)
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
            setAddError(err instanceof Error ? err.message : 'Mijoz yaratishda xatolik')
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

    return (
        <div className="flex flex-col gap-6 h-full animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            {error && !loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                    <span className="text-[14px] text-red-500 font-medium">{error}</span>
                    <button onClick={() => fetchCustomers()} className="text-[13px] text-[#141414] font-bold underline">Qayta urinish</button>
                </div>
            )}
            {!loading && !error && <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.map((stat, index) => (
                    <div key={index} className="bg-white border border-[#F0F0F0] rounded-[8px] p-5 flex flex-col gap-3 transition-all">
                        <span className="text-[13px] font-medium text-[#999999]">{stat.title}</span>
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${stat.bg} rounded-[6px] flex items-center justify-center`}>
                                <stat.icon size={20} className={stat.color} weight="bold" />
                            </div>
                            <span className="text-[24px] font-bold text-[#141414]">{stat.value}</span>
                        </div>
                        <span className="text-[11px] text-[#CCCCCC]">{stat.subtitle}</span>
                    </div>
                ))}
            </div>

            {/* Table Area */}
            <div className="bg-white border border-[#F0F0F0] rounded-[8px] flex flex-col overflow-hidden shadow-xs">
                {/* Tabs */}
                <div className="px-4 pt-3 flex items-center gap-1 border-b border-[#F0F0F0]">
                    {([
                        { id: "all",     label: "Barcha mijozlar",  count: customers.length },
                        { id: "members", label: "A'zolar",          count: customers.filter(c => c.authUserId !== null).length, badge: pendingMembersCount },
                    ] as { id: MijozlarTab; label: string; count: number; badge?: number }[]).map(tab => (
                        <button key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[13px] font-semibold border-b-2 transition-colors relative"
                            style={{
                                borderColor: activeTab === tab.id ? "#141414" : "transparent",
                                color: activeTab === tab.id ? "#141414" : "#999999",
                            }}>
                            {tab.label}
                            <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold"
                                style={{ background: activeTab === tab.id ? "#141414" : "#F0F0F0", color: activeTab === tab.id ? "#fff" : "#999" }}>
                                {tab.count}
                            </span>
                            {tab.badge != null && tab.badge > 0 && (
                                <span className="absolute -top-0.5 -right-1 w-4 h-4 bg-[#FF3B30] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                {/* Search & Actions */}
                <div className="p-4 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <input 
                                type="text" 
                                value={globalFilter ?? ''}
                                onChange={e => setGlobalFilter(e.target.value)}
                                placeholder="Ism, telefon yoki faoliyat bo'yicha qidirish..." 
                                className="pl-9 pr-4 py-2 bg-[#F5F5F5] border-transparent focus:bg-white focus:border-[#141414]/10 rounded-[8px] text-[13px] w-80 transition-all outline-hidden font-medium"
                            />
                            <Users size={16} className="text-[#999999] absolute left-3 top-1/2 -translate-y-1/2" weight="bold" />
                        </div>
                        {selectedMijozlar.length > 0 && (
                            <div className="flex items-center gap-2 pl-4 border-l border-[#F0F0F0]">
                                <span className="text-[13px] font-bold text-[#141414]">{selectedMijozlar.length} ta tanlandi</span>
                                <button
                                    onClick={() => setBulkDeleteConfirm(true)}
                                    disabled={deleteClientsMutation.isPending}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-[6px] text-[12px] font-bold transition-colors disabled:opacity-50"
                                >
                                    <Trash size={14} weight="bold" />
                                    Tanlanganlarni o'chirish
                                </button>
                                <button
                                    onClick={() => setSelectedMijozlar([])}
                                    className="text-[12px] text-[#999] hover:text-[#666] transition-colors"
                                >
                                    Bekor
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] rounded-[8px] text-[13px] font-bold text-[#141414] transition-colors">
                            <Funnel size={16} weight="bold" />
                            Filtrlar
                        </button>
                        <button className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] rounded-[8px] text-[13px] font-bold text-[#141414] transition-colors">
                            <UploadSimple size={16} weight="bold" />
                            Eksport
                        </button>
                        <button 
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-black transition-all active:scale-95"
                        >
                            <Plus size={16} weight="bold" />
                            Yangi mijoz
                        </button>
                    </div>
                </div>

                {/* Table Data */}
                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full border-collapse">
                        <thead>
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id} className="bg-[#FBFBFB] border-b border-[#F0F0F0]">
                                    {headerGroup.headers.map(header => (
                                        <th key={header.id} className="p-4 text-[13px] font-bold text-[#999999] text-left uppercase tracking-tight">
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody className="divide-y divide-[#F0F0F0]">
                            {table.getRowModel().rows.length > 0 ? (
                                table.getRowModel().rows.map(row => (
                                    <tr
                                        key={row.id}
                                        onClick={() => setSelectedCustomer(row.original)}
                                        className={`hover:bg-[#FBFBFB] transition-colors group cursor-pointer ${row.getIsSelected() ? 'bg-[#F9F9F8]' : ''}`}
                                    >
                                        {row.getVisibleCells().map(cell => (
                                            <td key={cell.id} className="p-4">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length} className="p-12 text-center text-[#999999] text-[14px]">
                                        Ma'lumot topilmadi
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Details Modal */}
            <AnimatePresence>
                {selectedCustomer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 flex items-center justify-center z-50 p-4 bg-black/40 backdrop-blur-[3px]"
                        onClick={() => { setSelectedCustomer(null); cancelEdit() }}
                    >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 16 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                        onClick={e => e.stopPropagation()}
                        className="w-[520px] max-h-[92vh] bg-white rounded-[16px] shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="flex flex-col">
                            {/* AVATAR + INFO */}
                            <div className="relative flex flex-col items-center pt-6 pb-6 px-8 border-b border-[#F0F0F0] gap-3">
                                {/* Close button overlaid top-right */}
                                <button
                                    onClick={() => { setSelectedCustomer(null); cancelEdit() }}
                                    className="absolute top-3 right-3 p-2 hover:bg-[#F5F5F5] rounded-[8px] transition-colors text-[#999999]"
                                >
                                    <X size={20} weight="bold" />
                                </button>
                                {/* Circle avatar */}
                                <div className="relative group flex-shrink-0">
                                    <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-[#F0F0F0] flex items-center justify-center">
                                        {selectedCustomer.image ? (
                                            <img src={selectedCustomer.image} alt="" className="w-full h-full object-cover object-top" />
                                        ) : (
                                            <span className="text-[34px] font-semibold text-[#CCCCCC]">
                                                {selectedCustomer.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    {/* Upload button on hover */}
                                    <button
                                        onClick={() => document.getElementById('sidebar-image-upload')?.click()}
                                        className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    >
                                        <ImageIcon size={18} className="text-white" weight="bold" />
                                    </button>
                                </div>

                                {/* Name + phone */}
                                <div className="flex flex-col items-center gap-1 text-center">
                                    <h1 className="text-[20px] font-semibold text-[#141414] leading-tight">{selectedCustomer.name}</h1>
                                    {selectedCustomer.phone && (
                                        <span className="text-[13px] text-[#999]">{formatPhone(selectedCustomer.phone)}</span>
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
                                        className="flex items-center gap-1.5 text-[11px] text-[#999] hover:text-[#141414] transition-colors"
                                    >
                                        <DownloadSimple size={12} weight="bold" />
                                        Rasmni saqlash
                                    </button>
                                )}
                            </div>

                            {/* TABS */}
                            <div className="flex border-b border-[#F0F0F0] bg-white sticky top-0 z-[5] pl-4">
                                {([
                                    { id: 'malumotlar' as const, label: "Ma'lumotlar" },
                                    { id: 'cashback' as const, label: 'Cashback' },
                                ]).map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => { cancelEdit(); setDrawerTab(tab.id) }}
                                        className={`px-4 py-2.5 text-[12px] font-semibold border-b-2 transition-colors ${
                                            drawerTab === tab.id
                                                ? 'border-[#141414] text-[#141414]'
                                                : 'border-transparent text-[#999]'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* TAB: Cashback */}
                            {drawerTab === 'cashback' && (
                                <div className="px-8 py-6 flex flex-col gap-4">
                                    {/* Balance row */}
                                    <div className="flex items-center justify-between py-2">
                                        <div>
                                            <span className="text-[11px] text-[#999]">Joriy balans</span>
                                            <div className="text-[20px] font-semibold text-[#141414] mt-0.5">
                                                {formatMoney(journeyQuery.data?.totals.cashback_balance ?? selectedCustomer.cashbackBalance)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Per-event cashback log */}
                                    {journeyQuery.isLoading ? (
                                        <div className="flex items-center gap-2 py-4 justify-center">
                                            <div className="w-4 h-4 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : (() => {
                                        const earned = journeyQuery.data?.events.filter(ev => ev.cashback_earned > 0) ?? []
                                        if (earned.length === 0) return (
                                            <p className="text-[12px] text-[#999] py-4 text-center">Hali cashback olinmagan</p>
                                        )
                                        return (
                                            <div className="flex flex-col divide-y divide-[#F0F0F0]">
                                                {earned.map(ev => {
                                                    const pct = ev.paid > 0 ? Math.round(ev.cashback_earned / ev.paid * 100) : 0
                                                    return (
                                                        <div key={ev.participant_id} className="flex items-center justify-between py-2.5">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[13px] text-[#141414]">{ev.event_name}</span>
                                                                <span className="text-[11px] text-[#999]">{formatDate(ev.event_date)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <span className="text-[11px] text-[#999]">{pct}%</span>
                                                                <span className="text-[13px] font-semibold text-[#141414]">{formatNumber(ev.cashback_earned)} UZS</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}

                            {/* TAB: Ma'lumotlar */}
                            {drawerTab === 'malumotlar' && (
                                <div className="px-8 py-6 flex flex-col gap-5">
                                    {/* Name */}
                                    {editAllMode ? (
                                        <>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] text-[#999]">Ism</span>
                                                <input autoFocus value={editAllValues.name}
                                                    onChange={e => setEditAllValues(v => ({ ...v, name: e.target.value }))}
                                                    className="px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] text-[#999]">Telefon</span>
                                                <input value={editAllValues.phone}
                                                    onChange={e => setEditAllValues(v => ({ ...v, phone: e.target.value }))}
                                                    placeholder="+998 90 123 45 67"
                                                    className="px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] text-[#999]">Email</span>
                                                <input value={editAllValues.email}
                                                    onChange={e => setEditAllValues(v => ({ ...v, email: e.target.value }))}
                                                    placeholder="email@example.com"
                                                    className="px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] text-[#999]">Faoliyat</span>
                                                <input value={editAllValues.activity}
                                                    onChange={e => setEditAllValues(v => ({ ...v, activity: e.target.value }))}
                                                    className="px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] text-[#999]">Lokatsiya</span>
                                                <input value={editAllValues.location}
                                                    onChange={e => setEditAllValues(v => ({ ...v, location: e.target.value }))}
                                                    placeholder="Shahar, tuman"
                                                    className="px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[12px] text-[#999]">Ism</span>
                                                    {editingField !== "name" && (
                                                        <PencilSimple size={12} onClick={() => startEdit("name")}
                                                            className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                                    )}
                                                </div>
                                                {editingField === "name" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                            className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                                        <button onClick={saveEdit} className="p-1.5 hover:bg-[#F0F0F0] rounded-[6px]"><Check size={14} className="text-[#141414]" weight="bold" /></button>
                                                        <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]"><X size={14} className="text-[#999]" weight="bold" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[14px] text-[#141414]">{selectedCustomer.name}</span>
                                                )}
                                            </div>
                                            {/* Phone */}
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[12px] text-[#999]">Telefon</span>
                                                    {editingField !== "phone" && (
                                                        <PencilSimple size={12} onClick={() => startEdit("phone")}
                                                            className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                                    )}
                                                </div>
                                                {editingField === "phone" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                            className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                                            placeholder="+998 90 123 45 67" />
                                                        <button onClick={saveEdit} className="p-1.5 hover:bg-[#F0F0F0] rounded-[6px]"><Check size={14} className="text-[#141414]" weight="bold" /></button>
                                                        <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]"><X size={14} className="text-[#999]" weight="bold" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[14px] text-[#141414]">{selectedCustomer.phone || '—'}</span>
                                                )}
                                            </div>
                                            {/* Email */}
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[12px] text-[#999]">Email</span>
                                                    {editingField !== "email" && (
                                                        <PencilSimple size={12} onClick={() => startEdit("email")}
                                                            className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                                    )}
                                                </div>
                                                {editingField === "email" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                            className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                                            placeholder="email@example.com" />
                                                        <button onClick={saveEdit} className="p-1.5 hover:bg-[#F0F0F0] rounded-[6px]"><Check size={14} className="text-[#141414]" weight="bold" /></button>
                                                        <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]"><X size={14} className="text-[#999]" weight="bold" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[14px] text-[#141414] truncate">{selectedCustomer.email || '—'}</span>
                                                )}
                                            </div>
                                            {/* Activity */}
                                            <div className="flex flex-col gap-1 group">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[12px] text-[#999]">Faoliyat</span>
                                                    {editingField !== "activity" && (
                                                        <PencilSimple size={12} onClick={() => startEdit("activity")}
                                                            className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                                    )}
                                                </div>
                                                {editingField === "activity" ? (
                                                    <div className="flex items-center gap-2">
                                                        <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                            className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                                        <button onClick={saveEdit} className="p-1.5 hover:bg-[#F0F0F0] rounded-[6px]"><Check size={14} className="text-[#141414]" weight="bold" /></button>
                                                        <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]"><X size={14} className="text-[#999]" weight="bold" /></button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[14px] text-[#141414]">{selectedCustomer.activity || '—'}</span>
                                                )}
                                            </div>
                                            {/* Lokatsiya */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[12px] text-[#999]">Lokatsiya</span>
                                                <span className="text-[14px] text-[#141414]">{selectedCustomer.location || '—'}</span>
                                            </div>
                                        </>
                                    )}
                                    {/* Join date */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[12px] text-[#999]">Qo'shilgan sana</span>
                                        <span className="text-[14px] text-[#141414]">{selectedCustomer.joinDate || '—'}</span>
                                    </div>
                                    {/* Community toggle */}
                                    {selectedCustomer.authUserId && (
                                        <div className="flex items-center justify-between py-2 border-t border-[#F0F0F0]">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[13px] text-[#141414]">Hamjamiyat</span>
                                                <span className="text-[11px] text-[#999]">
                                                    {selectedCustomer.communityApproved ? "Tasdiqlangan — chat ochiq" : "Kutilmoqda — chat yopiq"}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => setCommunityApproved.mutate(
                                                    { clientId: selectedCustomer.id, approved: !selectedCustomer.communityApproved },
                                                    { onSuccess: () => showToast(selectedCustomer.communityApproved ? "Hamjamiyat o'chirildi" : "Hamjamiyat tasdiqlandi", "success") }
                                                )}
                                                disabled={setCommunityApproved.isPending}
                                                className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
                                                style={{ background: selectedCustomer.communityApproved ? "#22C55E" : "#D0D0D0" }}
                                            >
                                                <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
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
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[12px] font-semibold bg-[#141414] text-white hover:bg-[#333] transition-colors disabled:opacity-50"
                                            >
                                                <Check size={13} weight="bold" />
                                                Saqlash
                                            </button>
                                            <button
                                                onClick={cancelEditAll}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[12px] font-semibold text-[#666] bg-[#F5F5F5] hover:bg-[#EBEBEB] transition-colors"
                                            >
                                                Bekor qilish
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-3 mt-6 mb-6">
                                            <button
                                                onClick={startEditAll}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[12px] font-semibold bg-[#141414] text-white hover:bg-[#333] transition-colors"
                                            >
                                                <PencilSimple size={13} weight="bold" />
                                                O'zgartirish
                                            </button>
                                            <button
                                                onClick={() => setCustomerToDelete(selectedCustomer)}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[12px] font-semibold text-[#D13328] bg-[rgba(209,51,40,0.07)] hover:bg-[rgba(209,51,40,0.12)] transition-colors"
                                            >
                                                <Trash size={13} weight="bold" />
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

            {/* Member account modal */}
            {memberAccountCustomer && (
                <CreateMemberAccountModal
                    isOpen={Boolean(memberAccountCustomer)}
                    onClose={() => setMemberAccountCustomer(null)}
                    clientId={memberAccountCustomer.id}
                    clientName={memberAccountCustomer.name}
                    clientEmail={memberAccountCustomer.email}
                    onSuccess={() => showToast("Mobil akkaunt ochildi", "success")}
                />
            )}


            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`fixed top-6 right-6 z-[200] px-4 py-2.5 rounded-[8px] text-[12px] font-bold shadow-lg ${
                            toast.type === "success"
                                ? "bg-[#F5F5F5] text-[#141414] border border-[#E0E0E0]"
                                : "bg-red-50 text-red-700 border border-red-200"
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
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-[12px] shadow-2xl w-full max-w-xl relative overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
                                <h3 className="text-[18px] font-bold text-[#141414]">Yangi mijoz qo'shish</h3>
                                <button
                                    onClick={closeAddModal}
                                    className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all"
                                >
                                    <X size={24} className="text-[#999999]" weight="bold" />
                                </button>
                            </div>

                            <form onSubmit={handleAddCustomer} className="p-6 overflow-y-auto max-h-[80vh] no-scrollbar">
                                <div className="grid grid-cols-1 gap-6">
                                    {/* Image Upload */}
                                    <div className="flex flex-col items-center gap-4">
                                        <div 
                                            onClick={() => document.getElementById('image-upload')?.click()}
                                            className="w-28 h-28 rounded-[12px] border-2 border-dashed border-[#E0E0E0] bg-[#F9F9F9] flex flex-col items-center justify-center text-[#999999] relative overflow-hidden group hover:border-[#141414] hover:bg-white transition-all cursor-pointer"
                                        >
                                            {newCustomer.image ? (
                                                <>
                                                    <img src={newCustomer.image} alt="" className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                        <Camera size={24} className="text-white" weight="bold" />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <Camera size={32} className="opacity-30" weight="bold" />
                                                    <span className="text-[11px] font-bold">RASM YUKLASH</span>
                                                </div>
                                            )}
                                        </div>
                                        <input 
                                            id="image-upload"
                                            type="file" 
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="hidden"
                                        />
                                        <p className="text-[11px] text-[#999999] font-medium text-center">
                                            Tavsiya etiladi: Kvadrat rasm, max 2MB
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[12px] font-bold text-[#141414]">ISM FAMILYASI *</label>
                                            <input 
                                                required
                                                type="text" 
                                                value={newCustomer.name}
                                                onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                                                placeholder="Masalan: Aziz Rahimov" 
                                                className="w-full px-4 py-2 bg-[#F5F5F5] border-transparent rounded-[8px] text-[13px] outline-hidden focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[12px] font-bold text-[#141414]">BIZNES FAOLIYATI *</label>
                                        <textarea 
                                            required
                                            rows={2}
                                            value={newCustomer.activity}
                                            onChange={e => setNewCustomer({...newCustomer, activity: e.target.value})}
                                            placeholder="Kompaniya nomi yoki loyiha haqida..." 
                                            className="w-full px-4 py-2 bg-[#F5F5F5] border-transparent rounded-[8px] text-[13px] outline-hidden focus:bg-white focus:ring-1 focus:ring-[#141414]/10 resize-none"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[12px] font-bold text-[#141414]">LAVOZIM</label>
                                        <input
                                            type="text"
                                            value={newCustomer.role}
                                            onChange={e => setNewCustomer({...newCustomer, role: e.target.value})}
                                            placeholder="Masalan: Direktor, Menejer"
                                            className="w-full px-4 py-2 bg-[#F5F5F5] border-transparent rounded-[8px] text-[13px] outline-hidden focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[12px] font-bold text-[#141414]">TELEFON RAQAMI *</label>
                                            <PhoneInput value={newCustomer.phone} onChange={(full) => setNewCustomer(prev => ({ ...prev, phone: full }))} />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[12px] font-bold text-[#141414]">EMAIL (IXTIYORIY)</label>
                                            <input 
                                                type="email" 
                                                value={newCustomer.email}
                                                onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                                                placeholder="example@mail.uz" 
                                                className="w-full px-4 py-2 bg-[#F5F5F5] border-transparent rounded-[8px] text-[13px] outline-hidden focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[12px] font-bold text-[#141414]">KLUBGA QO'SHILGAN VAQT</label>
                                        <input 
                                            type="date" 
                                            value={newCustomer.joinDate}
                                            onChange={e => setNewCustomer({...newCustomer, joinDate: e.target.value})}
                                            className="w-full px-4 py-2 bg-[#F5F5F5] border-transparent rounded-[8px] text-[13px] outline-hidden focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                        />
                                    </div>
                                </div>

                                {addError && (
                                    <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-[8px] text-[12px] font-medium text-red-700">
                                        {addError}
                                    </div>
                                )}

                                <div className="mt-8 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={closeAddModal}
                                        disabled={savingNewCustomer}
                                        className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={savingNewCustomer || !newCustomer.name.trim()}
                                        className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${
                                            savingNewCustomer || !newCustomer.name.trim()
                                                ? "bg-[#CCC] cursor-not-allowed"
                                                : "bg-[#141414] hover:bg-black"
                                        }`}
                                    >
                                        {savingNewCustomer ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-[16px] shadow-2xl w-full max-w-[400px] relative overflow-hidden p-6 flex flex-col items-center text-center gap-4"
                        >
                            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                                <Trash size={28} className="text-red-600" weight="bold" />
                            </div>
                            
                            <div className="flex flex-col gap-1">
                                <h3 className="text-[18px] font-bold text-[#141414]">Mijozni o'chirish</h3>
                                <p className="text-[14px] text-[#999999] font-medium leading-relaxed">
                                    Siz rostdan ham <span className="text-[#141414] font-bold">{customerToDelete.name}</span>ni tizimdan o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.
                                </p>
                            </div>

                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={() => setCustomerToDelete(null)}
                                    disabled={deleteClientMutation.isPending}
                                    className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[10px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    className={`flex-1 px-4 py-2.5 rounded-[10px] text-[13px] font-bold text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${
                                        deleteClientMutation.isPending
                                            ? "bg-[#CCC] cursor-not-allowed shadow-none"
                                            : "bg-red-600 hover:bg-red-700 shadow-red-200"
                                    }`}
                                >
                                    {deleteClientMutation.isPending ? (
                                        <>
                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                            onClick={() => !deleteClientsMutation.isPending && setBulkDeleteConfirm(false)}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-white rounded-[16px] shadow-2xl w-full max-w-[420px] relative overflow-hidden p-6 flex flex-col items-center text-center gap-4"
                        >
                            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                                <Trash size={28} className="text-red-600" weight="bold" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <h3 className="text-[18px] font-bold text-[#141414]">Mijozlarni o'chirish</h3>
                                <p className="text-[14px] text-[#999999] font-medium leading-relaxed">
                                    Tanlangan <span className="text-[#141414] font-bold">{selectedMijozlar.length} ta</span> mijozni o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.
                                </p>
                            </div>
                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={() => setBulkDeleteConfirm(false)}
                                    disabled={deleteClientsMutation.isPending}
                                    className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[10px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    className={`flex-1 px-4 py-2.5 rounded-[10px] text-[13px] font-bold text-white transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${
                                        deleteClientsMutation.isPending
                                            ? "bg-[#CCC] cursor-not-allowed shadow-none"
                                            : "bg-red-600 hover:bg-red-700 shadow-red-200"
                                    }`}
                                >
                                    {deleteClientsMutation.isPending ? (
                                        <>
                                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
