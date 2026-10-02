# O'z platformamiz bo'yicha Dashboard — dizayn

Sana: 2026-10-03 · Holat: foydalanuvchi ko'rib chiqishi kutilmoqda

## 1. Maqsad

Dashboard (`/`, `dashboard` moduli) AmoCRM ma'lumotlarini emas, o'z platformamizni ko'rsatadi:
Sotuv bo'limi bitimlari, sotuvchilar faoliyati (vazifalar, qo'ng'iroqlar), qo'ng'iroqlar va
qisqa moliya. Sotuv bo'limi AmoCRM'dan ko'chgan, AmoCRM tahlili endi kerak emas.

**Muvaffaqiyat mezoni:** rahbar bir sahifada davr bo'yicha (1) sotuv natijasini, (2) har bir
sotuvchi nechta vazifani yakunlagani / o'z vaqtida qilgani / kechiktirganini, (3) qo'ng'iroqlar
holatini va (4) hozir nima kechikib turganini ko'radi; hamma raqam bazada hisoblanadi.

## 2. Qabul qilingan qarorlar (foydalanuvchi bilan)

| Savol | Qaror |
|---|---|
| AmoCRM tarixi | **Ko'chirilmaydi.** Dashboard 2026-09-30 dan keyingi o'z ma'lumotlarimizni ko'rsatadi |
| Bo'limlar | Sotuv natijasi · Sotuvchilar faoliyati · Qo'ng'iroqlar · Moliya va tadbirlar (+ E'tibor talab qiladi) |
| Kim ko'radi | Faqat `dashboard` ruxsati borlar (hozirgidek); qolganlarga `HomeDashboard` o'zgarmaydi. Moliya bloki faqat `tadbirlar-moliya` ruxsati borlarga |
| AmoCRM sinxronizatsiyasi | **To'xtatiladi**, `amo_*` jadvallar va `amo_dashboard()` bazada arxiv bo'lib qoladi |
| Joylashuv | **C:** chapda asosiy oqim, o'ngda doimiy ustun (E'tibor + qisqa Moliya) |
| Texnik yo'l | Bitta SQL funksiya butun Dashboard'ni bir so'rovda qaytaradi; Moliya — mavjud `finance_summary()` |

Ma'lum chegara: hozir `payments` bo'sh (0 qator) va bitimlarda narx kam kiritiladi — Moliya va
"Yutilgan summa" boshida nol ko'rsatadi. Bu xato emas, ma'lumot kirgan sari to'ladi.

## 3. Sahifa (C tartib)

Tepada: davr (Bugun / 7 kun / 30 kun / Bu oy / O'tgan oy — `lib/period.ts`, Toshkent kunlari) va
voronka (Hammasi / bittasi). Har bir asosiy raqam oldingi teng davrga nisbatan ↑↓ % bilan.

**Chap ustun (asosiy oqim):**
1. **Ko'rsatkichlar** — Yangi bitimlar · Yutilgan · Yutqazilgan · Konversiya · Yutilgan summa.
2. **Voronka va manbalar** — ochiq bitimlar bosqichlar bo'yicha (hozirgi holat); manba va voronka
   kesimida yangi/yutilgan.
3. **Kunlik dinamika** — yangi va yutilgan bitimlar grafigi (recharts).
4. **Sotuvchilar** — jadval (`tbl`): har bir sotuvchi uchun ochiq / yangi / yutilgan / yutqazilgan,
   konversiya, yutilgan summa; vazifalar: davrda yakunlangan, ulardan o'z vaqtida %, hozir
   muddati o'tib ochiq. Qator bosilsa — sotuvchining davrdagi vazifalari ro'yxati (o'z vaqtida /
   kechikkan belgisi bilan) ochiladi.
5. **Qo'ng'iroqlar** — kiruvchi / chiquvchi / javobsiz, jami va o'rtacha gaplashilgan vaqt,
   javobsizlarga qayta qo'ng'iroq %; sotuvchilar bo'yicha qatorlar.

**O'ng ustun (doim ko'rinadi):**
6. **E'tibor talab qiladi** — muddati o'tgan vazifalar · 14+ kun harakatsiz bitimlar · qayta
   qo'ng'iroq qilinmagan javobsiz raqamlar (har biri 10 tagacha, bosilsa bitim ochiladi).
7. **Moliya** (faqat `tadbirlar-moliya`) — davrdagi kirim / xarajat, hozirgi qarzdorlik, yaqin
   tadbirlar va ishtirokchilar soni.

Dizayn qoidalari CLAUDE.md'dagidek: Plexus tokenlari, soyasiz, kartalar `bg-surface-sunken`,
tugmalar pill, DM Sans ≤600, Phosphor ikonkalari.

## 4. Ma'lumot (migratsiya `080_sales_dashboard.sql`)

`public.sales_dashboard(p_from date, p_to date, p_pipeline uuid DEFAULT NULL) RETURNS jsonb`
— `SECURITY DEFINER`, `SET search_path = public, pg_temp`, boshida
`has_permission(auth.uid(), 'dashboard')` tekshiruvi (aks holda `insufficient_privilege`).
DEFINER, chunki Dashboard ruxsati bor, lekin `sotuv-crmn` yo'q foydalanuvchi ham raqamlarni
ko'rishi kerak; funksiya faqat yig'ma raqamlar va qisqa ro'yxatlar qaytaradi.
`EXECUTE` faqat `authenticated` ga.

Davr: `[p_from 00:00, p_to+1 00:00)` Asia/Tashkent; oldingi davr — shuncha kun oldin.
`p_pipeline` berilsa, bitim va bitimga bog'liq vazifa/qo'ng'iroq hisoblari shu voronka bilan
cheklanadi; bitimsiz qo'ng'iroqlar faqat "Hammasi"da sanaladi.

Qaytadigan JSON:

```
{
  pipelines:[{ id, name }],                                   -- voronka select (sotuv-crmn'siz ham)
  kpi:      { new, won, lost, conversion, won_sum },          -- joriy davr
  kpi_prev: { new, won, lost, conversion, won_sum },          -- oldingi davr
  funnel:   [{ stage_id, name, color, open, open_sum }],      -- ochiq, hozirgi holat
  by_source:[{ source, new, won }],  by_pipeline: [{ id, name, new, won }],
  daily:    [{ day, new, won }],                              -- har kun, bo'shlari 0
  sellers:  [{ id, full_name, avatar_url,
               open, new, won, lost, conversion, won_sum,
               tasks_done, tasks_on_time, tasks_overdue_open,
               calls_in, calls_out, calls_missed, talk_sec }],
  calls:    { in, out, missed, talk_sec, avg_talk_sec, missed_called_back, missed_total },
  attention:{ overdue_tasks: [{ id, lead_id, lead_name, text, kind, due_date, assignee }],
              stale_leads:   [{ id, name, stage, days, responsible }],
              missed_unanswered: [{ phone, client_name, lead_id, last_missed_at, count }] }
}
```

**Hisoblash qoidalari (testda tekshiriladi):**

| Ko'rsatkich | Qoida |
|---|---|
| Yangi | `crm_leads.created_at` davrda |
| Yutilgan / Yutqazilgan | `is_won` / `is_lost` va `closed_at` davrda |
| Konversiya | yutilgan ÷ (yutilgan + yutqazilgan), maxraj 0 bo'lsa `null` |
| Yutilgan summa | yutilganlarning `price` yig'indisi |
| Sotuvchiga bog'lash | bitim → `responsible_user_id`; vazifa → `assignee_id`; qo'ng'iroq → `staff_id` |
| Yakunlangan vazifa | `done_at` davrda |
| O'z vaqtida | yakunlanganlardan `done_at <= due_date` |
| Kechikkan (ochiq) | `is_done = false AND due_date < now()` (davrdan qat'i nazar, hozirgi holat) |
| Javobsiz | kiruvchi, `talk_time = 0` |
| Qayta qo'ng'iroq qilingan | javobsizdan keyin (`started_at` dan keyin) shu raqamga chiquvchi qo'ng'iroq bor |
| Qayta qo'ng'iroq qilinmagan (E'tibor) | oxirgi 14 kundagi javobsizlar, keyin chiquvchi qo'ng'iroq bo'lmagan; raqam bo'yicha guruhlangan |
| Harakatsiz bitim | ochiq, `stage_changed_at` 14+ kun oldin va 14 kun ichida unga `crm_notes` ham, `crm_calls` ham yo'q |

Sotuvchilar ro'yxati: davrda bitimi/vazifasi/qo'ng'iroqi bo'lgan yoki hozir ochiq bitimi bor faol
hodimlar.

Sotuvchining vazifalari ro'yxati (qator bosilganda) — alohida kichik so'rov `crm_tasks` dan
(`assignee_id`, davr), mavjud `sotuv.ts` uslubida; huquq — RLS (`sotuv-crmn`).

## 5. Frontend

- `src/lib/supabase/queries/salesDashboard.ts` + `src/hooks/useSalesDashboard.ts`
  (`SALES_DASHBOARD_KEY = ["sales-dashboard"]`), tiplar shu faylda.
- `src/components/pages/Dashboard.tsx` C tartibda qayta yoziladi; AmoCRM qismlari ("AmoCRM'da
  ochish", "sinxronizatsiya yangilanmagan" banneri, `useAmoDashboard`) olib tashlanadi.
  Kerak bo'lsa bo'laklar `src/components/dashboard/` ga ajratiladi (har fayl bitta blok).
- Moliya bloki `useFinance` dagi mavjud summary hook'i bilan, faqat `hasAccess("tadbirlar-moliya")`
  bo'lsa render qilinadi.
- `LiveSync` `TOUCHES`: `crm_leads/crm_tasks/crm_calls/crm_notes/crm_stages` va `payments/expenses`
  ga `"sales-dashboard"` qo'shiladi.
- `queries/amoDashboard.ts` va `useAmoDashboard` endi ishlatilmaydi — o'chiriladi.

## 6. amo-sync

- `runOnce` dan AmoCRM bosqichlari (`syncPipelines/Users/Leads/StatusChanges/Tasks`, `base_url`,
  `last_success_at`) olib tashlanadi; shu funksiyalar va AmoCRM env (`AMO_*`) talabi o'chiriladi.
  `expireCashback()` (keshbek hisoblash/kuydirish) o'sha 10 daqiqalik siklda qoladi.
- `/hooks/health` dan `amocrm` tekshiruvi olib tashlanadi (db, backup, calls qoladi).
- `amo_sync_state` jadvali qoladi (`backup_last_ok`, `pbx_synced_to` u yerda).
- CLAUDE.md: "Dashboard = AmoCRM analytics" bandi yangi Dashboard tavsifi bilan almashtiriladi,
  env ro'yxatidan `AMO_*` olib tashlanadi.

## 7. Xatolar

- Funksiya xatosi → Dashboard'da "Ma'lumot yuklanmadi" + "Qayta urinish" (mavjud uslub).
- Bo'sh davr → raqamlar 0, ro'yxatlarda "Hozircha yo'q"; konversiya `null` → "—".
- Moliya huquqi yo'q → blok umuman ko'rinmaydi (so'rov ham yuborilmaydi).

## 8. Tekshiruv

- `supabase/tests/080_sales_dashboard_test.sql` — fixtures bilan: konversiya, o'z vaqtida %,
  kechikkan, qayta qo'ng'iroq, harakatsiz bitim, voronka filtri, ruxsatsiz chaqiruv rad etilishi
  (`has_function_privilege` / ruxsat tekshiruvi). 080 siz qizil, 080 bilan yashil.
- Production'ga: zaxira → 080 → yozib qo'yish → `supabase-rest-1` restart; amo-sync qayta deploy,
  `/hooks/health` yashil.
- Brauzer: foydalanuvchi Chrome'ida Dashboard ochiladi, davr/voronka almashtiriladi, sotuvchi
  qatori bosiladi, E'tibor ro'yxatidan bitim ochiladi; skrinshot.

## 9. Kiritilmaydi (YAGNI)

AmoCRM tarixini ko'chirish; sotuvchi uchun shaxsiy Dashboard; reja/KPI maqsadlari bilan
solishtirish; eksport (Excel/PDF); Telegram'ga Dashboard hisobotlari.
