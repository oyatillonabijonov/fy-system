import { Code, Funnel, Kanban, PhoneCall, ChatText, House, Users, Ticket, Gear, Bank, ClockCounterClockwise, CheckCircle,
    type Icon as PhosphorIcon } from "@phosphor-icons/react"
import type { ModuleName } from "@/lib/supabase/queries/auth"

export interface NavItem {
    name: string
    icon: PhosphorIcon
    path?: string
    module?: ModuleName
    adminOnly?: boolean
    /** Parent with a page of its own: click opens `path` and expands the submenu;
     *  with no visible sub-items it's a plain link */
    opensPage?: boolean
    subItems?: NavItem[]
}

export interface NavSection {
    title: string
    items: NavItem[]
}

/** The app's sections: the sidebar on desktop, the tab bar + "Yana" sheet below lg (MobileNav) */
export const navigationSections: NavSection[] = [
    {
        title: "Asosiy",
        items: [
            { name: "Dashboard", icon: House, path: "/dashboard" },
            { name: "Mijozlar", icon: Users, path: "/mijozlar", module: "mijozlar" },
            {
                name: "Sotuv bo'limi", icon: Funnel, path: "/sotuv", module: "sotuv-crmn", opensPage: true,
                subItems: [
                    { name: "Bitimlar", icon: Kanban, path: "/sotuv", module: "sotuv-crmn" },
                    { name: "Qo'ng'iroqlar", icon: PhoneCall, path: "/sotuv/qongiroqlar", module: "sotuv-crmn" },
                ],
            },
            { name: "Vazifalar", icon: CheckCircle, path: "/vazifalar" },
            { name: "SMS", icon: ChatText, path: "/sms", module: "sms" },
            { name: "Tadbirlar", icon: Ticket, path: "/tadbirlar/boshqaruv", module: "tadbirlar" },
            { name: "Moliya", icon: Bank, path: "/tadbirlar/moliya", module: "tadbirlar-moliya" },
        ],
    },
    {
        title: "Boshqaruv",
        items: [
            { name: "Hodimlar", icon: Users, path: "/hodimlar", adminOnly: true },
            {
                name: "Sozlamalar",
                icon: Gear,
                path: "/sozlamalar",
                opensPage: true,
                subItems: [
                    { name: "Integratsiyalar", icon: Code, path: "/sozlamalar/integratsiyalar", module: "integratsiyalar" },
                    { name: "Faollik", icon: ClockCounterClockwise, path: "/faollik", adminOnly: true },
                ],
            },
        ],
    },
]
