import {
    Users,
    UserPlus,
    Ticket,
    Funnel,
    UploadSimple,
    Plus,
    Minus,
    PencilSimple,
    Trash,
    DownloadSimple,
    Eye,
    X,
    Envelope,
    Phone,
    Briefcase,
    Calendar,
    Money,
    Image as ImageIcon,
    Camera,
    Star,
    Check,
    DeviceMobile,
    ArrowRight,
} from "@phosphor-icons/react"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useMemo, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import { useClients, useDeleteClient, useDeleteClients, useUpdateClient, CLIENTS_KEY, useClientJourney, useClientsLastEventDates } from "@/hooks/useClients"
import { CashbackBadge } from "@/components/cashback/CashbackBadge"
import { AdjustCashbackModal } from "@/components/cashback/AdjustCashbackModal"
import { CreateMemberAccountModal } from "@/components/mijozlar/CreateMemberAccountModal"
import type { CashbackTransaction } from "@/lib/supabase/queries/cashback"
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

function formatCashbackDate(dateStr: string): string {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const day = String(d.getDate()).padStart(2, "0")
    const month = String(d.getMonth() + 1).padStart(2, "0")
    return `${day}.${month}.${d.getFullYear()}`
}

function formatLastEventText(days: number | null): string {
    if (days === null) return "Hali tadbirda qatnashmagan"
    if (days === 0) return "Oxirgi tadbir: bugun"
    if (days < 7) return `Oxirgi tadbir: ${days} kun oldin`
    if (days < 30) return `Oxirgi tadbir: ${Math.floor(days / 7)} hafta oldin`
    if (days < 365) return `Oxirgi tadbir: ${Math.floor(days / 30)} oy oldin`
    return `Oxirgi tadbir: ${Math.floor(days / 365)} yil oldin`
}

const CASHBACK_TYPE_META: Record<CashbackTransaction["type"], { label: string; sign: "+" | "-"; classes: string }> = {
    earned:           { label: "Tadbir",        sign: "+", classes: "bg-green-50 text-green-700" },
    used:             { label: "Ishlatildi",    sign: "-", classes: "bg-red-50 text-red-700" },
    manual_add:       { label: "Qo'lda",        sign: "+", classes: "bg-blue-50 text-blue-700" },
    manual_subtract:  { label: "Qo'lda",        sign: "-", classes: "bg-orange-50 text-orange-700" },
    clawback:         { label: "Qaytarildi",    sign: "-", classes: "bg-gray-100 text-gray-600" },
}

function CashbackHistoryList({ loading, items }: { loading: boolean; items: CashbackTransaction[] }) {
    if (loading) {
        return <div className="text-[12px] text-[#999] italic py-2">Yuklanmoqda...</div>
    }
    if (items.length === 0) {
        return <div className="text-[12px] text-[#999] italic py-2">Hozircha tarix yo'q</div>
    }
    return (
        <div className="border border-[#F0F0F0] rounded-[8px] overflow-hidden">
            <div className="grid grid-cols-[60px_1fr_85px] gap-2 px-3 py-2 bg-[#FBFBFB] text-[10px] font-bold text-[#999] uppercase tracking-wider">
                <span>Sana</span>
                <span>Turi · Tavsif</span>
                <span className="text-right">Summa</span>
            </div>
            <div className="divide-y divide-[#F5F5F5] max-h-[260px] overflow-y-auto no-scrollbar">
                {items.map((tx) => {
                    const meta = CASHBACK_TYPE_META[tx.type]
                    const formatted = `${meta.sign}${new Intl.NumberFormat("uz-UZ").format(tx.amount)}`
                    return (
                        <div key={tx.id} className="grid grid-cols-[60px_1fr_85px] gap-2 px-3 py-2 items-start">
                            <span className="text-[11px] text-[#999] whitespace-nowrap">{formatCashbackDate(tx.created_at)}</span>
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className={`inline-flex w-fit px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold ${meta.classes}`}>
                                    {meta.label}
                                </span>
                                <span className="text-[11px] text-[#666] line-clamp-2">{tx.description ?? "—"}</span>
                            </div>
                            <span className={`text-[12px] font-bold text-right ${meta.sign === "+" ? "text-green-700" : "text-red-700"}`}>
                                {formatted}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    activity: string;
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
                eventsCount: row.events_count,
                daysSinceLastEvent: days,
                status: row.status,
                joinDate: row.join_date ?? '',
                image: row.image ?? '',
                totalSpent: `${Number(row.total_spent).toLocaleString("uz-UZ")} UZS`,
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
    const [drawerTab, setDrawerTab] = useState<'tadbirlar' | 'cashback' | 'malumotlar'>('tadbirlar')
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
    const [adjustOpen, setAdjustOpen] = useState(false)
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

    const navigate = useNavigate()
    const journeyQuery = useClientJourney(selectedCustomer?.id ?? null)

    // Inline edit state for sidebar
    const [editingField, setEditingField] = useState<"name" | "activity" | "phone" | "email" | null>(null)
    const [editValue, setEditValue] = useState("")

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

    // New Customer Form State
    const [newCustomer, setNewCustomer] = useState({
        name: '',
        activity: '',
        role: '',
        phone: '+998 ',
        email: '',
        joinDate: new Date().toISOString().split('T')[0],
        image: ''
    });

    useEffect(() => {
        setDrawerTab('tadbirlar')
        setEditingField(null)
        setEditValue("")
    }, [selectedCustomer])

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        
        // Always start with +998
        if (!value.startsWith('+998 ')) {
            value = '+998 ' + value.replace(/^\+998\s*/, '');
        }

        // Get only the numeric part after +998
        const digits = value.slice(5).replace(/\D/g, '').slice(0, 9);
        
        // Format: +998 90 123 45 67
        let formatted = '+998 ';
        if (digits.length > 0) {
            formatted += digits.substring(0, 2);
            if (digits.length > 2) {
                formatted += ' ' + digits.substring(2, 5);
                if (digits.length > 5) {
                    formatted += ' ' + digits.substring(5, 7);
                    if (digits.length > 7) {
                        formatted += ' ' + digits.substring(7, 9);
                    }
                }
            }
        }
        
        setNewCustomer(prev => ({ ...prev, phone: formatted }));
    };

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
                    <div className="w-10 h-10 rounded-[6px] bg-[#F5F5F5] border border-[#E0E0E0] overflow-hidden flex-shrink-0">
                        {info.row.original.image ? (
                            <img src={info.row.original.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#F0F0F0] text-[#999999]">
                                <Users size={20} weight="bold" />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-[#141414]">{info.getValue()}</span>
                            <CashbackBadge balance={info.row.original.cashbackBalance} size="sm" />
                        </div>
                        <span className="text-[11px] text-[#999999] font-medium">{info.row.original.email || 'Email kiritilmagan'}</span>
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
        columnHelper.accessor('status', {
            header: 'Statusi',
            cell: info => (
                <span className={`inline-flex px-2 py-0.5 rounded-[4px] text-[11px] font-bold ${info.getValue() === 'Faol' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {info.getValue()}
                </span>
            ),
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
                return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${m.bg} ${m.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                        {m.label}
                    </span>
                )
            },
        }),
        columnHelper.display({
            id: 'actions',
            header: () => <div className="text-right pr-6">Amallar</div>,
            cell: (info) => (
                <div className="flex items-center justify-end gap-1 pr-2">
                    {info.row.original.authUserId ? (
                        <span className="p-1.5 text-green-600" title="Mobil akkaunt mavjud">
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
            } catch (err) {
                console.error("Rasm yuklashda xatolik:", err)
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
                phone: '+998 ',
                email: '',
                joinDate: new Date().toISOString().split('T')[0],
                image: ''
            });
            setIsAddModalOpen(false)

            if (imageUploadFailed) {
                // Show non-blocking warning after modal closes (just console for now)
                console.warn("Mijoz saqlandi, lekin rasm yuklanmadi")
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

            {/* Sidebar Overlay */}
            <AnimatePresence>
                {selectedCustomer && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedCustomer(null)}
                        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
                    />
                )}
            </AnimatePresence>

            {/* Details Sidebar */}
            <AnimatePresence>
                {selectedCustomer && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed top-0 right-0 w-[480px] h-full bg-white z-50 flex flex-col border-l border-[#E0E0E0] shadow-sm"
                    >
                        {/* HEADER */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F0F0] bg-white sticky top-0 z-10 flex-shrink-0">
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-[15px] font-bold text-[#141414]">Mijoz profili</h2>
                                {(() => {
                                    const as = getClientActivityStatus({
                                        events_count: selectedCustomer.eventsCount,
                                        days_since_last_event: selectedCustomer.daysSinceLastEvent,
                                    })
                                    const m = ACTIVITY_STATUS_META[as]
                                    return (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${m.bg} ${m.text}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                                            {m.label}
                                        </span>
                                    )
                                })()}
                            </div>
                            <button
                                onClick={() => { setSelectedCustomer(null); cancelEdit() }}
                                className="p-2 hover:bg-[#F5F5F5] rounded-[8px] transition-colors text-[#999999]"
                            >
                                <X size={20} weight="bold" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar">
                            {/* AVATAR */}
                            <div className="relative h-44 w-full group flex-shrink-0">
                                {selectedCustomer.image ? (
                                    <img src={selectedCustomer.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-[#F0F0F0] flex items-center justify-center">
                                        <span className="text-[40px] font-bold text-[#CCCCCC]">
                                            {selectedCustomer.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all" />
                                <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => document.getElementById('sidebar-image-upload')?.click()}
                                            className="px-2.5 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-[6px] text-white text-[11px] font-bold hover:bg-white/20 transition-all flex items-center gap-1"
                                        >
                                            <ImageIcon size={12} weight="bold" />
                                            Yangilash
                                        </button>
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
                                                className="px-2.5 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-[6px] text-white text-[11px] font-bold hover:bg-white/20 transition-all flex items-center gap-1"
                                            >
                                                <DownloadSimple size={12} weight="bold" />
                                                Saqlash
                                            </button>
                                        )}
                                    </div>
                                    <span className={`px-2 py-1 rounded-[4px] text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${
                                        selectedCustomer.status === 'Faol'
                                            ? 'bg-green-500/20 text-green-100 border-green-500/30'
                                            : 'bg-red-500/20 text-red-100 border-red-500/30'
                                    }`}>
                                        {selectedCustomer.status}
                                    </span>
                                </div>
                            </div>

                            {/* INFO */}
                            <div className="px-5 pt-4 pb-3.5 border-b border-[#F0F0F0]">
                                <h1 className="text-[20px] font-bold text-[#141414] leading-tight">{selectedCustomer.name}</h1>
                                <p className="text-[12px] text-[#999] mt-0.5 flex items-center gap-1 flex-wrap">
                                    {selectedCustomer.phone && <><Phone size={11} weight="bold" /><span>{selectedCustomer.phone}</span></>}
                                    {selectedCustomer.activity && <><span className="text-[#E0E0E0]">·</span><span>{selectedCustomer.activity}</span></>}
                                </p>
                                <p className="text-[11px] text-[#B0B0B0] mt-1.5">
                                    {formatLastEventText(selectedCustomer.daysSinceLastEvent)}
                                </p>
                            </div>

                            {/* STATS */}
                            <div className="grid grid-cols-2 gap-2.5 p-4 border-b border-[#F0F0F0]">
                                {(() => {
                                    const t = journeyQuery.data?.totals
                                    const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(n)
                                    const cards = [
                                        { label: "Jami to'lagan", value: t ? `${fmt(t.total_paid)} so'm` : "...", color: "text-[#141414]", Icon: Money },
                                        { label: "Tadbirlar", value: t ? `${t.attended_count}/${t.events_count}` : `—/${selectedCustomer.eventsCount}`, color: "text-[#141414]", Icon: Ticket },
                                        {
                                            label: "Cashback",
                                            value: `${fmt(t?.cashback_balance ?? selectedCustomer.cashbackBalance)} so'm`,
                                            color: (t?.cashback_balance ?? selectedCustomer.cashbackBalance) > 0 ? "text-green-600" : "text-[#999]",
                                            Icon: Star,
                                        },
                                        {
                                            label: "Qarz",
                                            value: t ? (t.total_debt > 0 ? `${fmt(t.total_debt)} so'm` : "Yo'q") : "...",
                                            color: (t?.total_debt ?? 0) > 0 ? "text-red-600" : "text-[#999]",
                                            Icon: Money,
                                        },
                                    ] as const
                                    return cards.map(c => (
                                        <div key={c.label} className="p-3 bg-[#FBFBFB] border border-[#F0F0F0] rounded-[8px]">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <c.Icon size={11} className="text-[#BBB]" weight="bold" />
                                                <span className="text-[9px] text-[#BBB] font-bold uppercase tracking-wider">{c.label}</span>
                                            </div>
                                            <span className={`text-[13px] font-bold ${c.color}`}>{c.value}</span>
                                        </div>
                                    ))
                                })()}
                            </div>

                            {/* TABS */}
                            <div className="flex border-b border-[#F0F0F0] bg-white sticky top-[57px] z-[5]">
                                {([
                                    { id: 'tadbirlar' as const, label: 'Tadbirlar' },
                                    { id: 'cashback' as const, label: 'Cashback' },
                                    { id: 'malumotlar' as const, label: "Ma'lumotlar" },
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

                            {/* TAB: Tadbirlar */}
                            {drawerTab === 'tadbirlar' && (
                                <div className="p-4 flex flex-col gap-2">
                                    {journeyQuery.isLoading ? (
                                        <div className="flex items-center gap-2 py-6 justify-center">
                                            <div className="w-4 h-4 border-2 border-[#141414] border-t-transparent rounded-full animate-spin" />
                                            <span className="text-[12px] text-[#999]">Yuklanmoqda...</span>
                                        </div>
                                    ) : (journeyQuery.data?.events.length ?? 0) === 0 ? (
                                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                                            <Ticket size={32} className="text-[#E0E0E0]" weight="bold" />
                                            <p className="text-[13px] font-semibold text-[#999]">Hali tadbirda qatnashmagan</p>
                                            <p className="text-[11px] text-[#CCC]">Tadbirga qo'shish uchun tadbir sahifasiga o'ting</p>
                                        </div>
                                    ) : journeyQuery.data!.events.map(ev => {
                                        const d = ev.event_date ? new Date(ev.event_date) : null
                                        const dateStr = d
                                            ? `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
                                            : '—'
                                        return (
                                            <div
                                                key={ev.participant_id}
                                                onClick={() => navigate(`/tadbirlar/${ev.event_id}`)}
                                                className="flex gap-3 p-3 rounded-[8px] border border-[#F0F0F0] hover:border-[#E0E0E0] hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                                            >
                                                <div className="w-10 h-10 rounded-[6px] bg-[#F0F0F0] flex-shrink-0 overflow-hidden">
                                                    {ev.event_cover
                                                        ? <img src={ev.event_cover} alt="" className="w-full h-full object-cover" />
                                                        : <div className="w-full h-full flex items-center justify-center"><Calendar size={16} className="text-[#CCC]" /></div>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-1">
                                                        <span className="text-[13px] font-bold text-[#141414] leading-tight line-clamp-1">{ev.event_name}</span>
                                                        <ArrowRight size={12} className="text-[#CCC] flex-shrink-0 mt-0.5" weight="bold" />
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-[#999]">{dateStr}</span>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${
                                                            ev.attended ? 'bg-green-50 text-green-700' : 'bg-[#F5F5F5] text-[#999]'
                                                        }`}>
                                                            {ev.attended ? '✓ Qatnashgan' : '✗ Kelmagan'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2.5 mt-1">
                                                        {ev.debt > 0 ? (
                                                            <span className="text-[11px] font-bold text-red-600">
                                                                Qarz: {new Intl.NumberFormat("uz-UZ").format(ev.debt)} so'm
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] font-semibold text-[#141414]">
                                                                To'langan: {new Intl.NumberFormat("uz-UZ").format(ev.paid)} so'm
                                                            </span>
                                                        )}
                                                        {ev.cashback_earned > 0 && (
                                                            <span className="text-[10px] font-bold text-green-600">
                                                                +{new Intl.NumberFormat("uz-UZ").format(ev.cashback_earned)} CB
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* TAB: Cashback */}
                            {drawerTab === 'cashback' && (
                                <div className="p-4 flex flex-col gap-3">
                                    <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50 to-white border border-green-100 rounded-[10px]">
                                        <div>
                                            <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Joriy balans</span>
                                            <div className="text-[22px] font-bold text-green-700 mt-0.5">
                                                {new Intl.NumberFormat("uz-UZ").format(
                                                    journeyQuery.data?.totals.cashback_balance ?? selectedCustomer.cashbackBalance
                                                )} so'm
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setAdjustOpen(true)}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-[11px] font-bold text-green-700 bg-green-100 hover:bg-green-200 transition-colors"
                                        >
                                            <Plus size={12} weight="bold" />
                                            <span>/</span>
                                            <Minus size={12} weight="bold" />
                                        </button>
                                    </div>
                                    <CashbackHistoryList
                                        loading={journeyQuery.isLoading}
                                        items={journeyQuery.data?.cashback_history ?? []}
                                    />
                                </div>
                            )}

                            {/* TAB: Ma'lumotlar */}
                            {drawerTab === 'malumotlar' && (
                                <div className="p-5 flex flex-col gap-4">
                                    {/* Name */}
                                    <div className="flex flex-col gap-1.5 group">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-[#999] uppercase">Ism</span>
                                            {editingField !== "name" && (
                                                <PencilSimple size={12} onClick={() => startEdit("name")}
                                                    className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                            )}
                                        </div>
                                        {editingField === "name" ? (
                                            <div className="flex items-center gap-2">
                                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                    className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                                <button onClick={saveEdit} className="p-1.5 hover:bg-green-50 rounded-[6px]">
                                                    <Check size={14} className="text-green-600" weight="bold" />
                                                </button>
                                                <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]">
                                                    <X size={14} className="text-[#999]" weight="bold" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-[14px] font-semibold text-[#141414]">{selectedCustomer.name}</span>
                                        )}
                                    </div>
                                    {/* Phone */}
                                    <div className="flex flex-col gap-1.5 group">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-[#999] uppercase">Telefon</span>
                                            {editingField !== "phone" && (
                                                <PencilSimple size={12} onClick={() => startEdit("phone")}
                                                    className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                            )}
                                        </div>
                                        {editingField === "phone" ? (
                                            <div className="flex items-center gap-2">
                                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                    className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                                    placeholder="+998 90 123 45 67" />
                                                <button onClick={saveEdit} className="p-1.5 hover:bg-green-50 rounded-[6px]">
                                                    <Check size={14} className="text-green-600" weight="bold" />
                                                </button>
                                                <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]">
                                                    <X size={14} className="text-[#999]" weight="bold" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Phone size={13} className="text-[#141414]" weight="bold" />
                                                <span className="text-[14px] font-semibold text-[#141414]">{selectedCustomer.phone || '—'}</span>
                                            </div>
                                        )}
                                    </div>
                                    {/* Email */}
                                    <div className="flex flex-col gap-1.5 group">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-[#999] uppercase">Email</span>
                                            {editingField !== "email" && (
                                                <PencilSimple size={12} onClick={() => startEdit("email")}
                                                    className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                            )}
                                        </div>
                                        {editingField === "email" ? (
                                            <div className="flex items-center gap-2">
                                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                    className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10"
                                                    placeholder="email@example.com" />
                                                <button onClick={saveEdit} className="p-1.5 hover:bg-green-50 rounded-[6px]">
                                                    <Check size={14} className="text-green-600" weight="bold" />
                                                </button>
                                                <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]">
                                                    <X size={14} className="text-[#999]" weight="bold" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Envelope size={13} className="text-[#141414]" weight="bold" />
                                                <span className="text-[13px] font-semibold text-[#141414] truncate">{selectedCustomer.email || '—'}</span>
                                            </div>
                                        )}
                                    </div>
                                    {/* Activity */}
                                    <div className="flex flex-col gap-1.5 group">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-[#999] uppercase">Faoliyat</span>
                                            {editingField !== "activity" && (
                                                <PencilSimple size={12} onClick={() => startEdit("activity")}
                                                    className="text-[#999] opacity-0 group-hover:opacity-100 cursor-pointer" weight="bold" />
                                            )}
                                        </div>
                                        {editingField === "activity" ? (
                                            <div className="flex items-center gap-2">
                                                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                    className="flex-1 px-3 py-2 bg-[#F5F5F5] rounded-[8px] text-[13px] text-[#141414] font-semibold outline-none focus:bg-white focus:ring-1 focus:ring-[#141414]/10" />
                                                <button onClick={saveEdit} className="p-1.5 hover:bg-green-50 rounded-[6px]">
                                                    <Check size={14} className="text-green-600" weight="bold" />
                                                </button>
                                                <button onClick={cancelEdit} className="p-1.5 hover:bg-[#F5F5F5] rounded-[6px]">
                                                    <X size={14} className="text-[#999]" weight="bold" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Briefcase size={13} className="text-[#141414]" weight="bold" />
                                                <span className="text-[13px] font-semibold text-[#141414]">{selectedCustomer.activity || '—'}</span>
                                            </div>
                                        )}
                                    </div>
                                    {/* Join date */}
                                    <div className="p-3.5 bg-[#FBFBFB] border border-[#F0F0F0] rounded-[8px]">
                                        <span className="text-[10px] font-bold text-[#999] uppercase">Qo'shilgan sana</span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Calendar size={13} className="text-[#141414]" weight="bold" />
                                            <span className="text-[13px] font-bold text-[#141414]">{selectedCustomer.joinDate || '—'}</span>
                                        </div>
                                    </div>
                                    {/* Community toggle */}
                                    {selectedCustomer.authUserId && (
                                        <div className="flex items-center justify-between p-3.5 border border-[#F0F0F0] rounded-[8px]">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[13px] font-bold text-[#141414]">Hamjamiyat</span>
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
                                    {/* Delete */}
                                    <button
                                        onClick={() => setCustomerToDelete(selectedCustomer)}
                                        className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-[8px] text-[12px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors self-start"
                                    >
                                        <Trash size={13} weight="bold" />
                                        Mijozni o'chirish
                                    </button>
                                </div>
                            )}
                        </div>
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

            {/* Cashback adjust modal */}
            {selectedCustomer && (
                <AdjustCashbackModal
                    isOpen={adjustOpen}
                    onClose={() => setAdjustOpen(false)}
                    clientId={selectedCustomer.id}
                    clientName={selectedCustomer.name}
                    currentBalance={selectedCustomer.cashbackBalance}
                    onSuccess={(delta, type) => {
                        const formatted = new Intl.NumberFormat("uz-UZ").format(delta)
                        showToast(
                            type === "add" ? `+${formatted} so'm qo'shildi` : `-${formatted} so'm ayirildi`,
                            "success",
                        )
                        // Optimistically update sidebar header view
                        setSelectedCustomer((prev) =>
                            prev
                                ? { ...prev, cashbackBalance: prev.cashbackBalance + (type === "add" ? delta : -delta) }
                                : prev,
                        )
                    }}
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
                                ? "bg-green-50 text-green-700 border border-green-200"
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
                                            <input 
                                                required
                                                type="text" 
                                                value={newCustomer.phone}
                                                onChange={handlePhoneChange}
                                                placeholder="+998 90 123 45 67" 
                                                className="w-full px-4 py-2 bg-[#F5F5F5] border-transparent rounded-[8px] text-[13px] outline-hidden focus:bg-white focus:ring-1 focus:ring-[#141414]/10 transition-all font-bold tracking-wide"
                                            />
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
