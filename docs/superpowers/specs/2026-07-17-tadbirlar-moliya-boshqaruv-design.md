# Tadbirlar bo'limini ikkiga ajratish: Boshqaruv va Moliya

**Sana:** 2026-07-17
**Holat:** tasdiqlangan, implementatsiya kutilmoqda

---

## 1. Maqsad

Hozir `/tadbirlar` — bitta sahifa (`components/pages/Events.tsx`), unda tadbir boshqaruvi ham,
pul ishlari ham aralash turadi: `EventOverview` ning ishtirokchilar jadvalida bir vaqtning o'zida
ism/telefon ham, narx/to'langan/qarz/keshbek/to'lov ham bor.

Bu ikkiga ajratiladi:

- **Boshqaruv** — tadbir yaratish/tahrirlash/o'chirish, ishtirokchi qo'shish, booklet export,
  ro'yxatdan o'tish statistikasi.
- **Moliya** — cashflow, qarzdorlik, keshbek, to'lovlar — barcha pul ishlari.

Ikkala sahifa bir-biri bilan sinxron ishlaydi.

## 2. Ko'lam tashqarisi (YAGNI)

- Ishtirokchini o'chirish / tahrirlash funksiyasi **qo'shilmaydi** — hozir ham yo'q.
  Shu sababli Boshqaruv jadvalida "Amal" ustuni bo'lmaydi.
- Yangi grafik, eksport formati, filtr yoki sana oralig'i tanlash qo'shilmaydi.
- `EventOverview` ning banner/statistika qismi qayta ishlanmaydi — o'z joyida qoladi.

---

## 3. Marshrutlar va sidebar

| Yo'l | Sahifa | Modul |
|---|---|---|
| `/tadbirlar` | `<Navigate to="/tadbirlar/boshqaruv" replace />` | — |
| `/tadbirlar/boshqaruv` | `EventsBoshqaruv` | `tadbirlar` |
| `/tadbirlar/moliya` | `EventsMoliya` | `tadbirlar-moliya` |

**Sidebar** (`components/layout/Sidebar.tsx`): "Tadbirlar" ochiladigan element bo'ladi
(`path: "/tadbirlar"`, `icon: CalendarBlank`) va ikkita `subItems` oladi:

- `Boshqaruv` — `/tadbirlar/boshqaruv`, `icon: SquaresFour`, `module: "tadbirlar"`
- `Moliya` — `/tadbirlar/moliya`, `icon: Coins`, `module: "tadbirlar-moliya"`

`Bildirishnomalar` da bu pattern allaqachon bor, shuning uchun `filterItem`/`isActive`/
`toggleExpand` mantiqi o'zgarmaydi. `filterItem` subItems ni `isItemVisible` bo'yicha
filtrlaydi va hech biri ko'rinmasa ota elementni yashiradi — ya'ni ikkala modulsiz
foydalanuvchida "Tadbirlar" umuman chiqmaydi.

`prefetchMap` dagi `Tadbirlar` kaliti o'z nomida qoladi (ota element nomi bo'yicha ishlaydi).

**`PAGE_META`** (`App.tsx`) ga ikkita yozuv:

```ts
'/tadbirlar/boshqaruv': { title: 'Tadbirlar — Boshqaruv', desc: "Tadbirlar, ishtirokchilar va booklet." },
'/tadbirlar/moliya':    { title: 'Tadbirlar — Moliya',    desc: "To'lovlar, qarzdorlik va keshbek." },
```

Eski `'/tadbirlar'` yozuvi o'chadi (redirect bo'lgani uchun hech qachon ko'rinmaydi).

---

## 4. Ruxsatnomalar — migration `047`

CLAUDE.md qoidasi: modul ID uchta joyda birga yurishi shart. Uchalasi shu migrationda:

1. **`supabase/migrations/047_tadbirlar_moliya_module.sql`**
   - `user_permissions_module_check` CHECK ni qayta yozish (046 patterni), ro'yxatga
     `'tadbirlar-moliya'` qo'shiladi.
   - **Backfill:** kimda `tadbirlar` ruxsati bo'lsa, unga aynan shu `can_edit` bilan
     `tadbirlar-moliya` ham beriladi. Sabab: hech kim mavjud funksiyasini yo'qotmasligi kerak.
     Admin keyin qo'lda olib tashlaydi.
   - `event_finance_totals()` RPC (5-bo'lim).
2. **`src/lib/supabase/queries/auth.ts`** — `ModuleName` union va `MODULES` ro'yxatiga
   `{ id: "tadbirlar-moliya", label: "Tadbirlar (Moliya)" }`.
3. **`supabase/functions/admin-create-user/index.ts`** — `VALID_MODULES` ga qo'shish.

⚠️ 047 prodga **qo'lda** apply qilinadi (SSH + psql, CLAUDE.md "Production deployment"),
so'ng PostgREST schema keshi yangilanadi va `admin-create-user` deploy qilinadi.
Coolify migration yubormaydi.

---

## 5. KPI ma'lumoti — `event_finance_totals()`

Migration `047` da. **`SECURITY INVOKER`** (standart) + `SET search_path`.

Nega DEFINER emas: RLS a'zolarni (`members`) allaqachon faqat o'z qatorlariga cheklaydi.
INVOKER da RLS ishlaydi → sirqib chiqish imkoni yo'q va `is_staff()` qo'riqchisi kerak emas.
DEFINER bo'lsa RLS chetlab o'tilardi va a'zo butun klubning pulini ko'rib qolardi.
(019 dagi `SET search_path` patterni baribir qo'llanadi.)

Uchta raqam qaytaradi:

| Maydon | Hisob | Nega shunday |
|---|---|---|
| `total_income` | `SUM(payments.amount)` | Haqiqiy naqd. `participants.paid` emas — unga `cashback_used` ham kiradi, u pul kirimi emas. |
| `total_debt` | `SUM(GREATEST(price - paid, 0))` — `event_participants` bo'yicha | Ortiqcha to'lovlar qarzni manfiy qilib kamaytirmasligi uchun `GREATEST`. |
| `total_cashback_balance` | `SUM(clients.cashback_balance)` | Balans `cashback_transactions` ledgeridan trigger bilan hisoblanadi — o'qishga ishonchli. |

Frontendda hisoblanmaydi: PostgREST `max_rows` cheklovi qatorlarni jimgina kesadi va
raqam kam chiqadi (CLAUDE.md dashboard eslatmasi).

Query: `src/lib/supabase/queries/payments.ts` ga `getFinanceTotals()`.
Hook: `src/hooks/usePayments.ts` ga `useFinanceTotals()`.

`FINANCE_TOTALS_KEY` esa **`src/hooks/useEvents.ts`** da e'lon qilinadi: `usePayments.ts`
allaqachon `useEvents.ts` dan kalit import qiladi, teskarisi aylanma import yasardi.
To'lov qo'shilganda, keshbek o'zgarganda va narx tahrirlanganda shu kalit invalidate qilinadi.

---

## 6. Komponentlar

| Fayl | Amal | Mazmuni |
|---|---|---|
| `components/events/EventTabs.tsx` | **yangi** | Tab bar — `Events.tsx` dan aynan ko'chiriladi. Props: `events, selectedId, onSelect, showUmumiy, onCreate?`. Arxiv dropdown ham shu yerda. `onCreate` berilmasa `+` tugmasi chiqmaydi. |
| `hooks/useEventTab.ts` | **yangi** | `fy_last_event_tab` localStorage. `[id, setId]` qaytaradi. |
| `components/pages/EventsBoshqaruv.tsx` | **yangi** | `EventTabs` (`showUmumiy={false}`, `onCreate` bor) + `EventOverview`. `CreateEventDrawer`, o'chirish tasdiqlash shu yerda. |
| `components/pages/EventsMoliya.tsx` | **yangi** | `EventTabs` (`showUmumiy`, `onCreate` yo'q) + `FinanceOverview` yoki `EventFinance`. |
| `components/events/FinanceOverview.tsx` | **yangi** | 3 ta KPI karta (`useFinanceTotals`) + mavjud `PaymentsLog`. |
| `components/events/EventFinance.tsx` | **yangi** | Ixcham sarlavha (nom + sana, tahrir/o'chirish tugmasisiz), "Qiymat bajarilishi" kartasi, standart keshbek editori + `Berildi`/`Ishlatildi`, moliya jadvali. |
| `components/events/EventOverview.tsx` | **o'zgaradi** | Pul qismlari olib tashlanadi. |
| `components/pages/Events.tsx` | **o'chadi** | — |

### Jadvallarning bo'linishi

**Boshqaruv** — `EventOverview` da:
```
Rasm | Mijoz ismi | Telefon
```
Sarlavhada: `Ishtirokchilar (N)` + `[Booklet export]` `[+ Ishtirokchi qo'shish]`.
Qoladi: banner (tahrir/o'chirish/yig'ish), "Ro'yxatdan o'tish" grafigi, `EnrollParticipantModal`.

**Moliya** — `EventFinance` da:
```
Mijoz ismi | Jami to'lanishi kerak | Hozirgacha to'langan | Qolayotgan qarzdorlik | Keshbek | Amal
```
`Amal` = `SpendCell` (Cashback) + `To'lov` tugmasi.

### `EventOverview` dan `EventFinance` ga ko'chadigan kod

`PriceCell`, `CashbackPercentCell`, `SpendCell`, `DefaultCashbackEditor`, "Qiymat bajarilishi"
kartasi, `totalPaid`/`totalEarned`/`totalUsed` memolari, `useUpdateParticipant`,
`useSetEventCashbackPercent`, `useSetParticipantCashbackPercent`, `ParticipantPaymentModal`.

`EventOverview` ning yordamchilari (`initials`, `MetaChip`, `IconBtn`, `CompactBtn`) o'z joyida
qoladi — `EventFinance` da ularning hech biri kerak emas: rasm ustuni yo'q (`initials`),
banner yo'q (`MetaChip`, `IconBtn`), tahrir/o'chirish yo'q (`CompactBtn`). Ya'ni umumiy
yordamchi ajratish shart emas.

`EventOverview` da yetim qoladigan importlar olib tashlanadi: `TrendUp`, `Coins`,
`formatMoney`, `formatNumber`, `StatusBadge`, `ApplyCashbackModal`, `ParticipantPaymentModal`
va keshbek hooklari. `Export`, `UsersThree`, `formatDate`, `formatPhone`, recharts qoladi.

---

## 7. Sinxronlik

**Ma'lumot** — yangi kod kerak emas. Ikkala sahifa bir xil React Query kalitlaridan
(`EVENTS_KEY`, ishtirokchilar, to'lovlar) o'qiydi, shuning uchun Moliyada qo'shilgan to'lov
Boshqaruvdagi ro'yxatni ham yangilaydi. Mavjud mutatsiyalarning invalidate mantiqi tegilmaydi;
faqat `FINANCE_TOTALS_KEY` qo'shiladi.

**Tanlangan tadbir** — `useEventTab` (`fy_last_event_tab`, `fy_last_crm_pipeline_id` patterni).
Boshqaruvda "Yalpi majlis" tabida turib Moliyaga o'tilsa, o'sha tab ochiladi.

Chegara holatlar:
- Boshqaruvda `UMUMIY` sentineli yo'q → saqlangan qiymat `UMUMIY` bo'lsa, birinchi aktiv
  tadbirga tushadi (tadbir yo'q bo'lsa — bo'sh holat).
- Saqlangan ID o'chirilgan tadbirniki bo'lsa, mavjud `eventValid` tekshiruvi ishlaydi:
  Moliyada `UMUMIY` ga, Boshqaruvda birinchi aktiv tadbirga qaytadi.

---

## 8. Tekshirish

1. `bun run build` → `tsc -b` xatosiz (`noUnusedLocals` yetim importlarni tutadi).
2. `supabase/tests/047_tadbirlar_moliya_module_test.sql` (throwaway Postgres, CLAUDE.md
   "Tests" bo'limi):
   - CHECK `'tadbirlar-moliya'` ni qabul qiladi, `'yaroqsiz-modul'` ni rad etadi.
   - Backfill: `tadbirlar` ruxsati bor foydalanuvchida `tadbirlar-moliya` paydo bo'lgan,
     `can_edit` bir xil.
   - `event_finance_totals()`: ma'lum fixturada `total_income` = to'lovlar yig'indisi
     (keshbek qo'shilmagan), `total_debt` ortiqcha to'lovda manfiy emas.
   - Test eski kodda qizil bo'lishi shart (RPC yo'q → xato) — CLAUDE.md talabi.
3. Qo'lda (brauzer kerak, men tekshira olmayman): Boshqaruvda tadbir tanlab Moliyaga o'tish —
   o'sha tab ochilishi; Moliyada to'lov qo'shib, KPI kartalar yangilanishi.
