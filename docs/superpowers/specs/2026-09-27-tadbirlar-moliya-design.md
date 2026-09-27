# Tadbirlar: Boshqaruv / Moliya qayta qurish — dizayn

Sana: 2026-09-27 · Holat: tasdiqlangan dizayn (chatda), spec ko'rib chiqilmoqda

## 1. Maqsad

- Ishlamaydigan bo'limlarni olib tashlash.
- **Boshqaruv** — hodim darajasi: tadbir, mijozni yozish, booklet. Pul ko'rinmaydi.
- **Moliya** — maxsus ruxsat (`tadbirlar-moliya`): hamma tadbirlar bo'yicha global cashflow, qarz, xarajat, foyda; filtrlar; yangi mijozga ham to'lov kiritish.
- Boshqaruv, Moliya va Mijozlar bitta ma'lumotdan ishlaydi (`clients` → `event_participants` → `payments`), shuning uchun avtomatik sinxron.

**Muvaffaqiyat mezoni:** "clientA 17 000 000 UZS to'ladi" (bazada yo'q mijoz) Moliyadagi bitta oynadan kiritiladi va mijoz darhol Mijozlar, Boshqaruv va Moliyada ko'rinadi. Moliya KPI'lari istalgan filtr kombinatsiyasida bazadan to'g'ri hisoblanadi.

## 2. Qabul qilingan qarorlar

| Savol | Qaror |
|---|---|
| Nima o'chadi | Bo'limlar sahifasi, Yangiliklar (web + mobil + DB), Bildirishnomalar menyusi. **Faollik qoladi.** Bo'lim tushunchasi (`department`) va KPI qoladi. |
| Narx | Tadbirda **bir nechta tarif** (nom + narx). Hodim tarif nomi va narxini ko'radi. Moliya har ishtirokchining kelishuv summasini o'zgartira oladi (chegirma yoki individual kelishuv). |
| To'lov | Bo'lib to'lash (bir nechta to'lov) — hozirgi `payments` modeli. |
| Sotuvchi | **Har doim qo'lda** tanlanadi, Sotuv bo'limi (`department = 'sotuv'`) hodimlaridan. Yangi yozilishda majburiy. |
| Moliya tuzilishi | **Variant A**: global sahifa, tadbir — faqat filtr. Moliyada tadbir tablari yo'q. |
| 1-bosqich qo'shimchalari | Keyingi to'lov sanasi + qarz yoshi; bekor qilish + qaytarish; xarajatlar va foyda. (Excel eksport — keyinroq.) |
| Xarajatlar | Tadbirga bog'liq **yoki** umumiy (tadbirsiz). Kategoriyalar oldindan belgilangan. |

## 3. Tozalash (bosqich 1)

- `src/components/pages/Bolimlar.tsx`, `Yangiliklar.tsx` va ularning route, `PAGE_META`, Sidebar yozuvlari o'chadi. `useNews`, `queries/news.ts` o'chadi. Faqat shular ishlatgan hook/query/komponentlar ham o'chadi (masalan, `useDepartmentKpi` boshqa joyda ishlatilmasa).
- Sidebar'dagi "Bildirishnomalar" guruhi o'chadi.
- Mobil: `(tabs)/news.tsx`, `news/[id].tsx`, `useNews`, `queries/news.ts` va tab bar/bosh sahifadagi havolalar o'chadi.
- **Migratsiya 049** (`news_posts` jadvali, uning policy/trigger'lari, `news-images` bucket'i va undagi `storage.objects` qatorlari) **faqat yangi mobil build chiqib, a'zolar yangilaganidan keyin** qo'llanadi. Aks holda eski ilovada News tabi xato beradi. Diskdagi rasm fayllari storage konteynerida qoladi (xohlasa, qo'lda tozalanadi).

## 4. Boshqaruv (bosqich 2) — `/tadbirlar/boshqaruv`, modul `tadbirlar`

### 4.1 Tadbir yaratish/tahrirlash (`CreateEventDrawer`)
- **Tariflar** bo'limi: qatorlar ro'yxati (nom, narx), qo'shish/o'chirish. Kamida 1 ta tarif majburiy.
- Ishtirokchisi bor tarifni o'chirib bo'lmaydi (FK `ON DELETE RESTRICT`). UI'da "Bu tarifda N ishtirokchi bor" deb ko'rsatiladi.

### 4.2 Mijozni tadbirga yozish (`EnrollParticipantModal`)
- Mavjud mijozni qidirish **yoki** "Yangi mijoz" formasi: Ism Familiya*, Telefon*.
- Telefon `normalize_phone` bo'yicha mavjud bo'lsa, xato chiqmaydi: "Bu raqam <Ism>ga tegishli — tanlaysizmi?" deb taklif qilinadi.
- **Tarif*** (nom va narx ko'rinadi) → `price` tarif narxidan olinadi.
- **Sotuvchi*** — `profiles` ichidan `department = 'sotuv'` bo'lganlar.
- "Kelishilgan summa" va "Boshlang'ich to'lov" maydonlari **olib tashlanadi**.
- Bitta RPC orqali saqlanadi: `enroll_participant(...)` (5.1-bandga qarang).

### 4.3 Ishtirokchilar jadvali (`EventOverview`)
- Ustunlar: rasm, ism, telefon, tarif, sotuvchi. `paid`, qarz, keshbek yo'q.
- O'chirish: to'lovi bor ishtirokchida (`paid > 0` yoki faol to'lovi bo'lsa) tugma o'chiq bo'ladi va "To'lovi bor — Moliya orqali bekor qilinadi" deb ko'rsatiladi. DB ham buni rad etadi (5.2).
- Booklet eksport o'zgarmaydi.

## 5. Baza

Eski migratsiyalar o'zgartirilmaydi. Yangi `SECURITY DEFINER` funksiyalar `SET search_path = public, pg_temp` bilan yoziladi va kerakli joyda `is_staff` / `has_permission(auth.uid(), 'tadbirlar-moliya')` tekshiruvi bo'ladi (migratsiya 019 namunasi).

### 5.1 Migratsiya 050 — tarif + sotuvchi
- `event_tariffs(id uuid pk, event_id uuid NOT NULL → events ON DELETE CASCADE, name text NOT NULL, price numeric(12,2) NOT NULL CHECK (price >= 0), sort_order int DEFAULT 0, created_at)`. RLS: staff o'qiydi, `tadbirlar` edit huquqi borlar yozadi.
- `event_participants`: `tariff_id uuid → event_tariffs ON DELETE RESTRICT` (NULL = "Individual kelishuv"), `seller_id uuid → profiles ON DELETE SET NULL` (NULL = "Belgilanmagan").
- RPC `enroll_participant(p_event_id, p_client_id NULL, p_full_name NULL, p_phone NULL, p_tariff_id, p_seller_id) RETURNS uuid` (participant id):
  - staff-only;
  - `p_client_id` bo'lmasa, telefon bo'yicha mavjud mijozni topadi. Topilsa, `client_exists:<id>:<name>` bilan xato beradi (UI taklif ko'rsatadi). Topilmasa, yangi `clients` yaratadi;
  - mijoz shu tadbirda allaqachon bo'lsa, `already_enrolled` xatosi;
  - `price` = tarif narxi;
  - tarif shu tadbirga tegishli ekanini tekshiradi;
  - hammasi bitta tranzaksiyada.

### 5.2 Migratsiya 051 — moliya yadrosi
- `payments`:
  - yangi ustunlar: `kind text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund'))`, `voided_at timestamptz`, `voided_by uuid`, `void_reason text`;
  - CHECK: `(kind='payment' AND amount>0) OR (kind='refund' AND amount<0)`;
  - CHECK: `voided_at IS NULL OR void_reason <> ''`.
  - Mavjud qatorlar `kind='payment'` bo'ladi. Migratsiyadan oldin manfiy summalar borligini tekshirish kerak: bo'lsa, `refund` deb belgilanadi.
- `recalc_participant_paid` qayta yoziladi: `SUM(amount) WHERE voided_at IS NULL` + `cashback_used`. Bekor qilish va qaytarish `paid`ni kamaytiradi, shuning uchun mavjud clawback triggeri o'z-o'zidan ishlaydi.
- `payments` DELETE policy olib tashlanadi, to'lov faqat bekor qilinadi. UPDATE faqat RPC orqali.
- RPC'lar:
  - `void_payment(p_id, p_reason)` — faqat Moliya; allaqachon bekor qilingan bo'lsa, xato.
  - `refund_payment(p_participant_id, p_amount, p_method, p_note)` — faqat Moliya; summa `paid − cashback_used` dan oshmaydi.
- `event_participants.next_due_date date` — ixtiyoriy.
- RPC `record_payment(...)` — Moliyadagi "To'lov qo'shish" oynasining yagona yo'li:
  - kiradi: mavjud mijoz **yoki** yangi mijoz (ism, telefon); `event_id`; mijoz shu tadbirda bo'lmasa `tariff_id`, `price` (standart = tarif narxi, o'zgartirsa bo'ladi) va `seller_id`; `amount > 0`, `method`, `paid_at`, `next_due_date`, `note`;
  - faqat Moliya; mijoz topish/yaratish va yozish mantig'i `enroll_participant` bilan umumiy (ichki funksiya);
  - `amount` qolgan qarzdan oshmaydi (043 dagi himoya saqlanadi);
  - hammasi bitta tranzaksiyada.
- Ishtirokchini o'chirish: faol to'lovi bor ishtirokchida trigger `participant_has_payments` xatosini beradi.
- **RLS:**
  - `payments` SELECT/INSERT → `is_admin(auth.uid()) OR has_permission(auth.uid(),'tadbirlar-moliya')`;
  - a'zoning o'z to'lovlarini ko'rish policy'si (`payments select own`) qoladi;
  - `event_participants.price` va `next_due_date`ni o'zgartirish faqat Moliya huquqi bilan (UPDATE policy yoki RPC).
- **Ma'lum cheklov:** `event_participants.paid`/`price` ustunlari staff uchun API orqali o'qiladigan bo'lib qoladi (ekranda ko'rsatilmaydi). Ularni to'liq yopish uchun alohida view kerak, bu hozir qilinmaydi.
- KPI RPC `finance_summary(p_from date, p_to date, p_event_id, p_seller_id, p_method)` (`SECURITY INVOKER`) → `income` (faol to'lovlar, qaytarishlar minus bilan), `debt`, `overdue_debt` (`next_due_date < today`), `collection_rate` (to'langan ÷ kelishilgan), `cashback_balance`. Sana filtri to'lovlarga `paid_at` bo'yicha (Toshkent vaqti bilan, 045 dagi saboq), qarzga esa `created_at` bo'yicha qo'llanadi. Eski `event_finance_totals()` uni almashtiradi (yagona foydalanuvchisi `queries/payments.ts`) U 051 da o'chirilmaydi: 051 qo'llangach, yangi frontend chiqquncha eski sayt uni chaqirib turadi. `DROP FUNCTION` 052 da bajariladi, bu vaqtga kelib bosqich 3 frontendi allaqachon ishlayotgan bo'ladi.

### 5.3 Migratsiya 052 — xarajatlar
- `expenses(id, event_id uuid NULL → events ON DELETE SET NULL, category text NOT NULL CHECK (category IN ('zal','spiker','kofe_brek','reklama','maosh','ofis','boshqa')), amount numeric(12,2) NOT NULL CHECK (amount > 0), spent_at date NOT NULL, note text, recorded_by uuid, voided_at, voided_by, void_reason, created_at)`.
- RLS: faqat admin yoki Moliya. DELETE yo'q, faqat `void_expense(p_id, p_reason)`.
- `finance_summary` ga `expense` va `net = income − expense` qo'shiladi (`CREATE OR REPLACE`).
- RPC `event_profit(p_from, p_to)` → har tadbir bo'yicha: agreed (SUM price), collected, debt, expense, profit.

## 6. Moliya UI (bosqich 3–4) — `/tadbirlar/moliya`, modul `tadbirlar-moliya`

- `EventsMoliya.tsx` qayta yoziladi: `EventTabs` ishlatilmaydi. Tepada **filtrlar**:
  - sana (Bugun / Shu oy / O'tgan oy / Oraliq);
  - tadbir, sotuvchi (+ "Belgilanmagan"), usul;
  - holat (qarzdor / muddati o'tgan / to'liq to'lagan).
- Filtr holati URL query'da saqlanadi (sahifa yangilansa ham, havola yuborilsa ham saqlanadi).
- **KPI kartalar:** Kirim · Chiqim · Sof cashflow · Qolgan qarz · Muddati o'tgan · Yig'ish %. Hammasi `finance_summary` dan olinadi.
- **Tablar:**
  1. **To'lovlar** — ro'yxat (sana, mijoz, tadbir, sotuvchi, summa, usul, kim kiritgan). Bekor qilinganlar chizilgan holda. Amallar: Bekor qilish (sabab majburiy), Qaytarish.
  2. **Qarzdorlar** — ism, telefon, tadbir, sotuvchi, kelishuv, to'langan, qoldiq, keyingi to'lov sanasi, qarz yoshi (yozilgan kundan: 0–30 / 31–60 / 60+). Muddati o'tganlar qizil. Inline tahrir: kelishuv summasi, tarif, sotuvchi, sana. Keshbek sarflash shu qatordan.
  3. **Xarajatlar** (bosqich 4) — ro'yxat + "Xarajat qo'shish" + bekor qilish.
  4. **Tadbirlar** (bosqich 4) — `event_profit` jadvali.
- **"To'lov qo'shish" oynasi** (`AddPaymentModal` qayta ishlanadi):
  - mijoz qidirish | "Yangi mijoz" (ism*, telefon*) → tadbir*;
  - mijoz tadbirda yo'q bo'lsa: tarif* (narx avtomatik, tahrirlanadi) + sotuvchi*;
  - summa*, usul, sana;
  - to'lovdan keyin qarz qolsa: keyingi to'lov sanasi.
  - Saqlash `record_payment` orqali.
- `EventFinance`, `FinanceOverview` va eski per-event komponentlar yangi tablarga ko'chiriladi yoki o'chiriladi. Ishlatilmay qolgan kod o'chiriladi.
- **Kesh:** `FINANCE_TOTALS_KEY` o'rniga `FINANCE_KEY` (prefiks). Pulga tegadigan **har bir** mutatsiya uni invalidatsiya qiladi: to'lov, bekor qilish, qaytarish, yozilish, narx yoki tarif o'zgarishi, keshbek, xarajat, tadbir o'chirilishi.

## 7. Tekshirish

- Har migratsiya uchun `supabase/tests/05X_*_test.sql` (vaqtinchalik Docker stend, CLAUDE.md §5). Majburiy holatlar:
  - bekor qilish → `paid` kamayadi, keshbek clawback ishlaydi;
  - qaytarish → to'g'ri summa, `paid − cashback_used` dan oshsa rad etiladi;
  - `record_payment`: yangi mijoz + yozilish + to'lov birga saqlanadi; qarzdan oshiq summada **hech narsa** saqlanmaydi; telefon dublikati `client_exists` beradi;
  - Moliya ruxsatisiz staff `payments`ni o'qiy olmaydi va `record_payment`ni chaqira olmaydi;
  - `finance_summary` qo'lda hisoblangan summa bilan mos keladi (filtr bilan va filtrsiz);
  - to'lovi bor ishtirokchini o'chirish rad etiladi;
  - tarifni boshqa tadbirga ulab bo'lmaydi.
- Har test avval eski kodda **qizil** bo'lishi ko'rsatiladi.
- `bun run build` va `bun run lint` (web), `bunx tsc --noEmit` (mobil).
- UI brauzerda faqat mahalliy Supabase'da (`bun run dev:local`) sinaladi. `bun run dev` production'ga ulanadi, u ishlatilmaydi.

## 8. Deploy

Har bosqich uchun: backup → migratsiyani qo'lda qo'llash (CLAUDE.md §5) → `schema_migrations`ga yozish → `docker restart supabase-rest-1` → `bun run gen:types` yoki stale-types workaround → `main`ga push (foydalanuvchi tasdig'i bilan) → Coolify. 049 — mobil build tarqatilgandan keyin.

CLAUDE.md yangilanadi: Events/Moliya bo'limi, olib tashlangan sahifalar, yangi jadvallar va RPC'lar.

## 9. Hozir qilinmaydi

- Excel eksport.
- Qarzdorga avtomatik eslatma (SMS/Telegram).
- `paid`/`price` ustunlarini hodimdan view orqali to'liq yopish.
- Maosh hisob-kitobi (maosh faqat xarajat kategoriyasi sifatida kiritiladi).
