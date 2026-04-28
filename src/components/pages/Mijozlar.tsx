import {
    UsersIcon,
    UserPlusIcon,
    TicketIcon,
    ArrowUpRightIcon,
    FunnelIcon,
    ArrowUpTrayIcon,
    PlusIcon,
    PencilIcon,
    TrashIcon,
    ArrowDownTrayIcon,
    EyeIcon,
    XMarkIcon,
    EnvelopeIcon,
    PhoneIcon,
    BriefcaseIcon,
    CalendarIcon,
    BanknotesIcon,
    PhotoIcon,
    CameraIcon
} from "@heroicons/react/24/solid"
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid"
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline"
import { motion, AnimatePresence } from "framer-motion"
import { useState, useMemo, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import { useClients, useDeleteClient, useDeleteClients, useUpdateClient, CLIENTS_KEY } from "@/hooks/useClients"
import { CheckIcon } from "@heroicons/react/24/solid"
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getSortedRowModel,
    getFilteredRowModel,
    type SortingState,
} from '@tanstack/react-table'

interface EventHistory {
    id: number;
    eventName: string;
    date: string;
    status: string;
}

interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    activity: string;
    eventsCount: number;
    status: string;
    joinDate: string;
    image: string;
    totalSpent: string;
    history: EventHistory[];
}

export function Mijozlar() {
    const qc = useQueryClient()
    const { data: rawClients, isLoading: loading, error: queryError, refetch: fetchCustomers } = useClients()
    const deleteClientMutation = useDeleteClient()
    const deleteClientsMutation = useDeleteClients()
    const updateClientMutation = useUpdateClient()

    const customers = useMemo<Customer[]>(() =>
        (rawClients ?? []).map(row => ({
            id: row.id,
            name: row.full_name,
            email: row.email ?? '',
            phone: row.phone ?? '',
            activity: row.activity ?? '',
            eventsCount: row.events_count,
            status: row.status,
            joinDate: row.join_date ?? '',
            image: row.image ?? '',
            totalSpent: `${Number(row.total_spent).toLocaleString("uz-UZ")} UZS`,
            history: [],
        }))
    , [rawClients])

    const error = queryError ? (queryError instanceof Error ? queryError.message : "Ma'lumotlarni yuklashda xatolik") : null

    const [selectedMijozlar, setSelectedMijozlar] = useState<string[]>([])
    const [sorting, setSorting] = useState<SortingState>([])
    const [globalFilter, setGlobalFilter] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [showFullHistory, setShowFullHistory] = useState(false)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)

    const [cropImageSrc, setCropImageSrc] = useState("")
    const [isCropOpen, setIsCropOpen] = useState(false)
    const [pendingImageFile, setPendingImageFile] = useState<Blob | null>(null)

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
        setShowFullHistory(false)
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

    const stats = [
        {
            title: "Jami Mijozlar soni",
            value: customers.length.toString(),
            growth: "+12.5%",
            icon: UsersIcon,
            color: "text-[#141414]",
            bg: "bg-[#F5F5F5]"
        },
        {
            title: "Yangi mijozlar (30 kun)",
            value: "156",
            growth: "+8.2%",
            icon: UserPlusIcon,
            color: "text-[#141414]",
            bg: "bg-[#F5F5F5]"
        },
        {
            title: "Joy band qilgan mijozlar",
            value: "428",
            growth: "+24.0%",
            icon: TicketIcon,
            color: "text-[#141414]",
            bg: "bg-[#F5F5F5]"
        }
    ];

    const columnHelper = createColumnHelper<Customer>()

    const columns = [
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
                                <UsersIcon className="w-5 h-5" />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-[#141414]">{info.getValue()}</span>
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
            id: 'actions',
            header: () => <div className="text-right pr-6">Amallar</div>,
            cell: (info) => (
                <div className="flex items-center justify-end gap-1 pr-2">
                    <button 
                        className="p-1.5 hover:bg-[#F3F2F0] rounded-[6px] transition-colors text-[#999999] hover:text-[#141414]" 
                        title="Ko'rish"
                        onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCustomer(info.row.original)
                        }}
                    >
                        <EyeIcon className="w-5 h-5" />
                    </button>
                    <button 
                        className="p-1.5 hover:bg-red-50 rounded-[6px] transition-colors text-[#999999] hover:text-red-600" 
                        title="O'chirish" 
                        onClick={(e) => {
                            e.stopPropagation();
                            setCustomerToDelete(info.row.original);
                        }}
                    >
                        <TrashIcon className="w-4.5 h-4.5" />
                    </button>
                </div>
            ),
        }),
    ]

    const table = useReactTable({
        data: customers,
        columns,
        state: {
            sorting,
            globalFilter,
            rowSelection: selectedMijozlar.reduce((acc, id) => {
                const idx = customers.findIndex(c => c.id === id);
                if (idx !== -1) acc[idx] = true;
                return acc;
            }, {} as Record<string, boolean>),
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onRowSelectionChange: (updater) => {
            const newSelection = typeof updater === 'function' ? updater(table.getState().rowSelection) : updater;
            const selectedIds = Object.keys(newSelection)
                .filter(key => newSelection[Number(key)])
                .map(key => customers[Number(key)].id);
            setSelectedMijozlar(selectedIds);
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
        try {
            const { createClient, uploadClientImage } = await import("@/lib/supabase/queries/clients")

            // First create client to get an ID
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

            // Upload image if we have a pending crop
            let imageUrl = ''
            if (pendingImageFile) {
                imageUrl = await uploadClientImage(pendingImageFile, row.id)
                const { updateClient } = await import("@/lib/supabase/queries/clients")
                await updateClient(row.id, { image: imageUrl })
            }

            qc.invalidateQueries({ queryKey: CLIENTS_KEY })
            if (newCustomer.image && newCustomer.image.startsWith("blob:")) URL.revokeObjectURL(newCustomer.image)
            setIsAddModalOpen(false);
            setPendingImageFile(null);
            setNewCustomer({
                name: '',
                activity: '',
                role: '',
                phone: '+998 ',
                email: '',
                joinDate: new Date().toISOString().split('T')[0],
                image: ''
            });
        } catch (err) {
            console.error('Mijoz qo\'shishda xatolik:', err)
        }
    };

    function closeAddModal() {
        if (newCustomer.image && newCustomer.image.startsWith("blob:")) URL.revokeObjectURL(newCustomer.image)
        setPendingImageFile(null)
        setNewCustomer((prev) => ({ ...prev, image: '' }))
        setIsAddModalOpen(false)
    }

    const rating = selectedCustomer ? Math.min(5, Math.ceil(selectedCustomer.eventsCount / 4)) : 0;

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
                        <div className="flex items-center justify-between">
                            <span className="text-[13px] font-medium text-[#999999]">{stat.title}</span>
                            <div className="flex items-center gap-1 text-green-600 text-[12px] font-bold">
                                <ArrowUpRightIcon className="w-3 h-3" />
                                {stat.growth}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                             <div className={`w-10 h-10 ${stat.bg} rounded-[6px] flex items-center justify-center`}>
                                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                            </div>
                            <span className="text-[24px] font-bold text-[#141414]">{stat.value}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table Area */}
            <div className="bg-white border border-[#F0F0F0] rounded-[8px] flex flex-col overflow-hidden shadow-xs">
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
                            <UsersIcon className="w-4 h-4 text-[#999999] absolute left-3 top-1/2 -translate-y-1/2" />
                        </div>
                        {selectedMijozlar.length > 0 && (
                            <div className="flex items-center gap-2 pl-4 border-l border-[#F0F0F0]">
                                <span className="text-[13px] font-bold text-[#141414]">{selectedMijozlar.length} ta tanlandi</span>
                                <button
                                    onClick={() => {
                                        deleteClientsMutation.mutate(selectedMijozlar, {
                                            onSuccess: () => setSelectedMijozlar([]),
                                        })
                                    }}
                                    className="p-1.5 hover:bg-red-50 text-red-600 rounded-[6px] transition-colors"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] rounded-[8px] text-[13px] font-bold text-[#141414] transition-colors">
                            <FunnelIcon className="w-4 h-4" />
                            Filtrlar
                        </button>
                        <button className="flex items-center gap-2 px-3 py-2 hover:bg-[#F5F5F5] rounded-[8px] text-[13px] font-bold text-[#141414] transition-colors">
                            <ArrowUpTrayIcon className="w-4 h-4" />
                            Eksport
                        </button>
                        <button 
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-black transition-all active:scale-95"
                        >
                            <PlusIcon className="w-4 h-4" />
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
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F0F0] bg-white sticky top-0 z-10">
                            <h2 className="text-[16px] font-bold text-[#141414]">Mijoz profili</h2>
                            <div className="flex items-center gap-2">
                                {editingField ? (
                                    <button onClick={cancelEdit} className="p-2 hover:bg-[#F5F5F5] rounded-[8px] transition-colors text-[#999999] hover:text-[#141414]">
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                ) : (
                                    <button onClick={() => startEdit("name")} className="p-2 hover:bg-[#F5F5F5] rounded-[8px] transition-colors text-[#999999] hover:text-[#141414]">
                                        <PencilIcon className="w-5 h-5" />
                                    </button>
                                )}
                                <button
                                    onClick={() => { setSelectedCustomer(null); cancelEdit() }}
                                    className="p-2 hover:bg-[#F5F5F5] rounded-[8px] transition-colors text-[#999999]"
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto no-scrollbar">
                            <div className="relative h-64 w-full group">
                                {selectedCustomer.image ? (
                                    <img src={selectedCustomer.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-[#F0F0F0] flex items-center justify-center">
                                        <span className="text-[48px] font-bold text-[#CCCCCC]">
                                            {selectedCustomer.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-all" />
                                <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                document.getElementById('sidebar-image-upload')?.click()
                                            }}
                                            className="px-3 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-[6px] text-white text-[12px] font-bold hover:bg-white/20 transition-all flex items-center gap-1.5"
                                        >
                                            <PhotoIcon className="w-3.5 h-3.5" />
                                            Yangilash
                                        </button>
                                        {selectedCustomer.image && (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation()
                                                    try {
                                                        const res = await fetch(selectedCustomer.image)
                                                        const blob = await res.blob()
                                                        const url = URL.createObjectURL(blob)
                                                        const a = document.createElement("a")
                                                        a.href = url
                                                        a.download = `${selectedCustomer.name.replace(/\s+/g, "_")}.jpg`
                                                        a.click()
                                                        // Defer revoke so the browser starts the download first
                                                        setTimeout(() => URL.revokeObjectURL(url), 1000)
                                                    } catch (err) {
                                                        console.error("Rasmni yuklashda xatolik:", err)
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-[6px] text-white text-[12px] font-bold hover:bg-white/20 transition-all flex items-center gap-1.5"
                                            >
                                                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                                Saqlash
                                            </button>
                                        )}
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-[4px] text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border ${selectedCustomer.status === 'Faol' ? 'bg-green-500/20 text-green-100 border-green-500/30' : 'bg-red-500/20 text-red-100 border-red-500/30'}`}>
                                        {selectedCustomer.status}
                                    </span>
                                </div>
                            </div>

                            <div className="p-8 flex flex-col gap-8 text-left">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between group">
                                        {editingField === "name" ? (
                                            <div className="flex items-center gap-2 flex-1">
                                                <input
                                                    autoFocus
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                    className="text-[28px] font-bold text-[#141414] leading-tight bg-transparent border-b-2 border-[#141414] outline-none w-full"
                                                />
                                                <button onClick={saveEdit} className="p-1 hover:bg-green-50 rounded-[6px] transition-colors">
                                                    <CheckIcon className="w-5 h-5 text-green-600" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <h1 className="text-[28px] font-bold text-[#141414] leading-tight">{selectedCustomer.name}</h1>
                                                <PencilIcon onClick={() => startEdit("name")} className="w-4 h-4 text-[#999999] opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" />
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-2 group">
                                        <BriefcaseIcon className="w-4 h-4 text-[#999999]" />
                                        {editingField === "activity" ? (
                                            <div className="flex items-center gap-2 flex-1">
                                                <input
                                                    autoFocus
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                    className="text-[15px] font-medium text-[#141414] bg-transparent border-b-2 border-[#141414] outline-none flex-1"
                                                />
                                                <button onClick={saveEdit} className="p-0.5 hover:bg-green-50 rounded-[4px] transition-colors">
                                                    <CheckIcon className="w-4 h-4 text-green-600" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-[15px] font-medium text-[#141414]">{selectedCustomer.activity || "—"}</span>
                                                <PencilIcon onClick={() => startEdit("activity")} className="w-3.5 h-3.5 text-[#999999] opacity-0 group-hover:opacity-100 cursor-pointer" />
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-[#FBFBFB] border border-[#F0F0F0] rounded-[8px] group">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[11px] font-bold text-[#999999] uppercase">Telefon</span>
                                            {editingField === "phone" ? (
                                                <button onClick={saveEdit} className="p-0.5 hover:bg-green-50 rounded-[4px] transition-colors">
                                                    <CheckIcon className="w-3 h-3 text-green-600" />
                                                </button>
                                            ) : (
                                                <PencilIcon onClick={() => startEdit("phone")} className="w-3 h-3 text-[#999999] opacity-0 group-hover:opacity-100 cursor-pointer" />
                                            )}
                                        </div>
                                        {editingField === "phone" ? (
                                            <input
                                                autoFocus
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                className="text-[14px] font-bold text-[#141414] bg-transparent border-b-2 border-[#141414] outline-none w-full"
                                                placeholder="+998 90 123 45 67"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <PhoneIcon className="w-3.5 h-3.5 text-[#141414]" />
                                                <span className="text-[14px] font-bold text-[#141414]">{selectedCustomer.phone || "—"}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 bg-[#FBFBFB] border border-[#F0F0F0] rounded-[8px] group">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[11px] font-bold text-[#999999] uppercase">Email</span>
                                            {editingField === "email" ? (
                                                <button onClick={saveEdit} className="p-0.5 hover:bg-green-50 rounded-[4px] transition-colors">
                                                    <CheckIcon className="w-3 h-3 text-green-600" />
                                                </button>
                                            ) : (
                                                <PencilIcon onClick={() => startEdit("email")} className="w-3 h-3 text-[#999999] opacity-0 group-hover:opacity-100 cursor-pointer" />
                                            )}
                                        </div>
                                        {editingField === "email" ? (
                                            <input
                                                autoFocus
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit() }}
                                                className="text-[13px] font-bold text-[#141414] bg-transparent border-b-2 border-[#141414] outline-none w-full"
                                                placeholder="email@example.com"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <EnvelopeIcon className="w-3.5 h-3.5 text-[#141414]" />
                                                <span className="text-[13px] font-bold text-[#141414] truncate">{selectedCustomer.email || '—'}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 border border-[#F0F0F0] rounded-[8px]">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[11px] font-bold text-[#999999] uppercase">Aktivlik</span>
                                            <div className="flex gap-1 mt-1">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <span key={star}>
                                                        {star <= rating ? (
                                                            <StarSolidIcon className="w-4 h-4 text-orange-400" />
                                                        ) : (
                                                            <StarOutlineIcon className="w-4 h-4 text-[#E0E0E0]" />
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[11px] font-bold text-[#999999] uppercase">Tadbirlar</span>
                                            <div className="text-[18px] font-bold text-[#141414]">{selectedCustomer.eventsCount} ta</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[14px] font-bold text-[#141414]">Tadbirlar tarixi</h3>
                                        <button 
                                            onClick={() => setShowFullHistory(!showFullHistory)}
                                            className="text-[12px] font-bold text-[#999999] hover:text-[#141414] transition-colors"
                                        >
                                            {showFullHistory ? 'Hide' : 'Show All'}
                                        </button>
                                    </div>
                                    
                                    {selectedCustomer.history.length > 0 ? (
                                        <div className="border-l-2 border-[#F0F0F0] ml-2 space-y-6">
                                            {(showFullHistory ? selectedCustomer.history : selectedCustomer.history.slice(0, 3)).map((event) => (
                                                <div key={event.id} className="relative pl-6">
                                                    <div className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-[#141414] border-2 border-white" />
                                                    <div className="flex flex-col">
                                                        <span className="text-[14px] font-bold text-[#141414]">{event.eventName}</span>
                                                        <div className="flex items-center gap-3 mt-1 text-[12px] text-[#999999] font-medium">
                                                            <span className="flex items-center gap-1">
                                                                <CalendarIcon className="w-3.5 h-3.5" />
                                                                {event.date}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 bg-green-50 text-green-600 rounded-[4px] text-[10px] font-bold">
                                                                {event.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[13px] text-[#999999] italic">Tarix mavjud emas</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-auto border-t border-[#F0F0F0] bg-[#FBFBFB] p-6 grid grid-cols-2 gap-6">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-[#999999] uppercase">Klubga qo'shilgan</span>
                                <div className="flex items-center gap-2">
                                    <CalendarIcon className="w-4 h-4 text-[#141414]" />
                                    <span className="text-[14px] font-bold text-[#141414]">{selectedCustomer.joinDate}</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 text-right">
                                <span className="text-[10px] font-bold text-[#999999] uppercase">Jami xarajat</span>
                                <div className="flex items-center justify-end gap-2">
                                    <BanknotesIcon className="w-4 h-4 text-green-600" />
                                    <span className="text-[16px] font-bold text-green-600">{selectedCustomer.totalSpent}</span>
                                </div>
                            </div>
                        </div>
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
                                    <XMarkIcon className="w-6 h-6 text-[#999999]" />
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
                                                        <CameraIcon className="w-6 h-6 text-white" />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <CameraIcon className="w-8 h-8 opacity-30" />
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

                                <div className="mt-8 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={closeAddModal}
                                        className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button 
                                        type="submit"
                                        className="flex-1 px-4 py-2.5 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-black transition-all shadow-md active:scale-95"
                                    >
                                        Saqlash
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
                                <TrashIcon className="w-7 h-7 text-red-600" />
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
                                    className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[10px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    onClick={() => {
                                        deleteClientMutation.mutate(customerToDelete.id, {
                                            onSuccess: () => setCustomerToDelete(null),
                                        })
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-[10px] text-[13px] font-bold hover:bg-red-700 transition-all shadow-md shadow-red-200 active:scale-95"
                                >
                                    O'chirish
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
