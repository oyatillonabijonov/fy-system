# CRM va Dashboard'ni alohida mahsulot qilib ajratish: audit (2026-11-27)

Faqat tahlil. Kod, migratsiya va sozlamalar o'zgartirilmadi; prod serverga va bazaga ulanilmadi. Hamma da'vo repodagi fayllarga tayanadi. `CLAUDE.md` yo'l ko'rsatkich sifatida ishlatildi, dalil sifatida emas. Tekshirib bo'lmagan joylar "aniqlanmadi" deb belgilangan va 10-bo'limda jamlangan.

Yo'llar repo ildiziga nisbatan. `S/` = `amo-sync/src/`, `M/` = `supabase/migrations/`.

---

## 0. Bir sahifalik xulosa

1. **Alohida backend yo'q.** Brauzer bazaga to'g'ridan-to'g'ri Supabase orqali murojaat qiladi (`src/` ichida 179 ta `.from(...)`, 24 ta `.rpc(...)` chaqiruv). Biznes qoidalar Postgres ichida yashaydi: 110 migratsiya, 10 182 qator SQL, 166 ta funksiya ta'rifi, 47 trigger, 163 RLS qoidasi. Yagona o'z serverimiz `amo-sync` (Bun, 4 826 qator, testlarsiz).
2. **CRM uchta narsasiz ishlamaydi:** `clients` (mijoz), `profiles` + `auth` (hodim va login), `user_permissions` (ruxsatlar). Qolgan bog'lanishlar (tadbir, moliya, keshbek, anketa, FY ilova) ixtiyoriy va yashirsa bo'ladi.
3. **Dashboard moliya va tadbirlarga SQL darajasida bog'langan:** `sales_dashboard` va `sales_insights` to'g'ridan-to'g'ri `event_participants` va `payments` jadvallarini o'qiydi (`M/103_*.sql:75-79, 182-190`).
4. **Repoda real kalit yoki token topilmadi** (fayllarda ham, git tarixida ham). Lekin egasiga xos narsalar ko'p: domenlar, Meta piksel ID, klub nomi, server IP (`CLAUDE.md`da), xodim ismlari testlarda.
5. **Boshqa mijoz uchun kodni qo'lda o'zgartirish kerak bo'lgan joylar:** brending (~15 fayl), 4 ta domen, piksel ID, AI promptlaridagi klub tavsifi, lid ball qoidalari, yo'qotish sabablari, Toshkent vaqti (45 faylda 120 ta joy), +998, so'm. Til qatlami (i18n) yo'q: barcha matn o'zbekcha va JSX ichida.
6. **Cloudflare Workers:** frontend o'zgarishsiz ishlaydi. Baza va Supabase xizmatlari Workers'da ishlamaydi, D1 real emas. `amo-sync`ning webhook va navbat qismlari qayta yozilsa pullik tarifda ishlaydi; bepul tarifning 10 ms limiti va kuniga 5 ta cron cheklovi yetmaydi. Telegram akkaunt vidjeti doimiy ishlaydigan jarayon talab qiladi.
7. **Tavsiya:** (a) bitta kod bazasi, modullar sozlama bilan yoqiladi. Sababi 8-bo'limda. Qisqasi: kerakli ishning katta qismi (7–10 hafta) ikkala yo'lda ham bir xil, (a) dan keyin (b) ga o'tish mumkin, teskarisi qimmat.
8. **Addon tizimi:** hozir tayyor ulanish nuqtasi yo'q, hammasi core fayllarni tahrirlash bilan qo'shiladi. Eng arzon boshlanish: hodisalar navbati + chiquvchi webhook (3–5 kun), keyin qo'shimcha maydonlar, keyin frontend slotlari. Jami 3–4 hafta. Tafsiloti 10-bo'limda.

---

## 1. Stack

| Qatlam | Nima | Dalil |
|---|---|---|
| Frontend | React 19, Vite 7, TypeScript, react-router 7, TanStack Query 5, Tailwind 4. PWA (manifest + service worker) | `package.json`, `vite.config.ts`, `public/manifest.webmanifest`, `public/sw.js` |
| Backend | Alohida API server yo'q. Supabase: PostgREST (jadval va funksiyalarga HTTP), GoTrue (login), Realtime, Storage. Qo'shimcha: `amo-sync` Bun xizmati | `src/lib/supabase/client.ts:4-5`, `S/index.ts` |
| ORM | Yo'q. Frontend `@supabase/supabase-js`, `amo-sync` esa `postgres` (postgres.js) drayveri bilan xom SQL yozadi | `package.json`, `amo-sync/package.json`, `S/index.ts:35` |
| Baza | Postgres (self-hosted Supabase). 110 ta ketma-ket migratsiya | `supabase/migrations/001…110` |
| Auth | Supabase Auth (GoTrue) + `profiles` (rol: admin / manager / xodim) + `user_permissions` (modul bo'yicha). Tekshiruv DB ichida: `has_permission()`, `is_admin()` | `M/018_*.sql:2-8`, `M/056_*.sql:50-63`, `src/lib/supabase/queries/auth.ts:6-28` |
| Hodim yaratish | Deno edge funksiya `admin-create-user` (service role bilan) | `supabase/functions/admin-create-user/index.ts`, `src/lib/supabase/queries/auth.ts:290-295` |
| Fon vazifalar | Alohida queue yo'q. Navbatlar Postgres jadvallari (`telegram_outbox`, `sms_messages`, `meta_events_log`, `crm_call_analyses`, `fy_app_outbox`, `tg_schedule_runs`). `amo-sync` ichida 12 ga yaqin `setInterval` taymer (30 s – 10 daq) va 2 ta `LISTEN` | `S/index.ts:62-79`, `S/telegram.ts:155-156`, `S/sms.ts:227-232`, `S/capi.ts:117`, `S/callAnalysis.ts:297`, `S/pbx.ts:80`, `S/missedCalls.ts:135-137`, `S/tasks.ts:274` |
| Real-time | Supabase Realtime (websocket): butun ilova uchun bitta kanal, `LiveSync` | `src/components/layout/LiveSync.tsx:13-26`, `M/076_*.sql:12-13` |
| Telefon | Brauzerda WebRTC (Verto protokoli, `@xswitch/rtc`), websocket manzilini server beradi | `src/context/PhoneContext.tsx:136-139`, `S/pbx.ts:159-163` |
| Fayl saqlash | Supabase Storage bucket'lari (`client-images`, `receipts`, `task-files`, `telegram-files`, `event-covers`…). Qo'ng'iroq yozuvlari bizda saqlanmaydi, OnlinePBX'dan strim qilinadi | `M/048_*.sql`, `M/100_*.sql:265-267`, `S/pbx.ts:122-136` |
| Deploy: frontend | Docker: bun bilan build → nginx:alpine. `VITE_*` build paytida kiritiladi | `Dockerfile`, `nginx.conf` |
| Deploy: worker | Alohida Docker image (`oven/bun:1-alpine`) | `amo-sync/Dockerfile` |
| Deploy: baza va gateway | **Repoda yo'q.** Supabase docker-compose, gateway nginx sozlamasi (`/hooks/`, `/mcp`, `/pbx/verto`), Traefik, Coolify sozlamalari faqat serverda. Migratsiyalar qo'lda SSH orqali qo'llanadi (`CLAUDE.md` bo'yicha, tekshirilmadi) | `git ls-files` da compose/gateway fayli yo'q |
| Zaxira nusxa | VM'dagi cron skripti: `pg_dump` + storage → gpg → Google Drive | `ops/backup.sh` |
| Monitoring | GitHub Actions, kuniga bir marta | `.github/workflows/uptime.yml` |
| Mobil | Alohida Expo ilova (klub a'zolari uchun). Bu auditda chuqur ko'rilmadi | `mobile/` (58 fayl) |

**Mahsulot uchun eng muhim xulosa:** "bitta dastur" yo'q. O'rnatish = Postgres + 5–6 ta Supabase xizmati + gateway nginx + `amo-sync` + frontend. Hozir bu qo'lda yig'ilgan va yig'ish yo'riqnomasi repoda fayl sifatida emas, faqat `CLAUDE.md` matnida.

---

## 2. Modul xaritasi

### 2.1 Barcha modullar

| Modul | Route | Ruxsat | Sahifa / papka |
|---|---|---|---|
| **Dashboard** | `/dashboard` | `dashboard` (bo'lmasa `HomeDashboard` ochiladi) | `pages/Dashboard.tsx`, `components/dashboard/` |
| **Sotuv bo'limi (CRM)** | `/sotuv`, `/sotuv/bitim/:id`, `/sotuv/qongiroqlar`, `/sotuv/telegram`, `/bugun` | `sotuv-crmn` | `pages/Sotuv*.tsx`, `Bugun.tsx`, `components/sotuv/`, `components/telegram/` |
| Mijozlar | `/mijozlar` | `mijozlar` | `pages/Mijozlar.tsx` (2 087 qator), `components/cashback/`, `components/anketa/` |
| SMS | `/sms` | `sms` | `pages/Sms.tsx`, `components/sms/` |
| Vazifalar | `/vazifalar` | yo'q (har bir hodim) | `components/vazifalar/` |
| Tadbirlar | `/tadbirlar/boshqaruv` | `tadbirlar` | `components/events/` |
| Ilova (FY a'zolar ilovasi) | `/ilova` | `tadbirlar` | `pages/Ilova.tsx` |
| Moliya | `/tadbirlar/moliya` | `tadbirlar-moliya` | `components/moliya/` |
| Hodimlar | `/hodimlar`, `/hodimlar/:id` | faqat admin | `components/hodimlar/` |
| Faollik | `/faollik` | faqat admin | `pages/Faollik.tsx` |
| Sozlamalar / Profilim | `/sozlamalar` | yo'q | `components/sozlamalar/` |
| Integratsiyalar | `/sozlamalar/integratsiyalar` | `integratsiyalar` | `pages/Integratsiyalar.tsx`, `components/integratsiyalar/` |
| Anketa (ochiq sahifa) | `/anketa/:token` | ochiq | `pages/Anketa.tsx` |

Dalil: `src/App.tsx:81-88, 196-265`, `src/components/layout/nav.ts:28-60`. Modul ID'lari uch joyda bir xil bo'lishi shart: `src/lib/supabase/queries/auth.ts:8-28`, `supabase/functions/admin-create-user/index.ts:11`, `M/083_*.sql:11-14` (CHECK cheklovi).

### 2.2 CRM va Dashboard'ga tegishli kod

| Qism | Fayllar | Hajm |
|---|---|---|
| CRM komponentlari | `src/components/sotuv/` (15 fayl) | 1 943 qator |
| Telegram vidjeti | `src/components/telegram/` (8 fayl) | 674 qator |
| CRM sahifalari | `Sotuv`, `SotuvLead`, `SotuvCalls`, `SotuvTelegram`, `Bugun` | ~1 730 qator |
| Dashboard | `pages/Dashboard.tsx` + `components/dashboard/` (12 fayl) | ~1 810 qator |
| Hook va so'rovlar | `hooks/useSotuv`, `useSalesDashboard`, `useTelegram`, `useTgWindow`, `useCallAnalysis`; `queries/sotuv`, `salesDashboard`, `telegram`, `callAnalysis`, `leads` | aniq sanalmadi |
| CRM yordamchi kodi | `lib/phoneCall`, `phoneAudio`, `lossReason`, `stageConv`, `telegramStage`, `adRows`, `attribution`, `smsOffer`; `context/PhoneContext.tsx` | aniq sanalmadi |
| Jami | butun `src/` 218 fayl, 38 251 qator | CRM + Dashboard taxminan 6–8 ming qator |

Worker (`amo-sync`, testlarsiz 4 826 qator) ichida CRM ulushi taxminan 2 700 qator:

| Qism | Fayllar | CRM'ga tegishlimi |
|---|---|---|
| Lid qabul qilish, atributsiya, ball, Meta CAPI | `intake.ts`, `attribution.ts`, `leadScore.ts`, `capi.ts`, `intakeAlert.ts` (~570) | Ha |
| Telefoniya | `pbx.ts`, `missedCalls.ts` (~320) | Ha |
| Qo'ng'iroq AI tahlili | `callAnalysis.ts` (~300) | Ha |
| Telegram akkaunt vidjeti | `tguser/` (~580) | Ha |
| SMS | `sms.ts` (~235) | Ha (umumiy) |
| Claude connector (MCP) | `mcp/` (~740 + tadbir va vazifa asboblari) | Aralash |
| To'lov cheklari, keshbek | `telegram.ts`, `receipt.ts`, `index.ts` | Yo'q (Moliya) |
| Vazifalar boti | `tasks.ts`, `taskbot.ts` (~710) | Yo'q, lekin `taskbot.ts` sotuvchiga javobsiz qo'ng'iroq xabarini yoqish tugmasini ham boshqaradi |
| Stiker / ko'rsatkich PDF | `pdf/`, `mcp/events.ts` | Yo'q (Tadbirlar) |
| FY ilova | `fyApp.ts` | Yo'q |

### 2.3 "API endpoint"lar

Web uchun endpoint = Postgres jadvali yoki funksiyasi (PostgREST). CRM va Dashboard chaqiradigan funksiyalar: `create_crm_lead`, `merge_crm_leads`, `calls_day_summary`, `call_analysis_stats`, `requeue_call_analysis`, `sales_dashboard`, `sales_insights`, `send_sms_template` (`src/` ichidagi `.rpc(` qidiruvi).

`amo-sync` HTTP yo'llari (bitta `Bun.serve`, `S/intake.ts:233-274`):

| Yo'l | Himoya | Vazifa |
|---|---|---|
| `POST /hooks/lead/<manba>` | so'rovdagi token, `crm_lead_sources` bilan solishtiriladi | Sayt / Tilda / Framer / Meta lidlari |
| `POST /hooks/fb-lead` | `X-FY-Secret` sarlavhasi = `FB_LEAD_SECRET` | Make.com orqali Facebook lidlari |
| `/hooks/pbx/me`, `/exts`, `/record/<uuid>`, `/audio/<uuid>` | Supabase JWT (`JWT_SECRET`) + `sotuv-crmn`; audio uchun HMAC imzo | Brauzer telefoni, yozuvlar |
| `/hooks/tg/*` | JWT + `sotuv-crmn` | Telegram vidjeti |
| `/hooks/sms/status`, `/hooks/sms/templates/sync` | HMAC token / JWT | Eskiz |
| `/hooks/fy/*` | JWT + `tadbirlar` | FY ilova (CRM emas) |
| `/mcp`, `/mcp/*`, `/.well-known/oauth-*` | o'z OAuth serverimiz | Claude connector |
| `GET /hooks/health` | yo'q | Holat tekshiruvi |

Frontend bu manzillarni `VITE_SUPABASE_URL` + yo'l qilib yasaydi (`src/lib/supabase/queries/sotuv.ts:430`, `telegram.ts:20`, `sms.ts:150`). `src/` ichida qotirilgan domen yo'q.

### 2.4 CRM va Dashboard jadvallari

| Guruh | Jadvallar | Yaratilgan |
|---|---|---|
| Yadro | `crm_pipelines`, `crm_stages`, `crm_leads`, `crm_notes`, `crm_tasks` | `M/007_*.sql:6-68`, qayta shakllangan `M/072_*.sql` |
| Lid manbalari | `crm_lead_sources`, `webhook_logs`, `crm_pipeline_sellers` | `M/073_*.sql:10`, `M/008_*.sql:2`, `M/088_*.sql:10` |
| Qo'ng'iroqlar | `crm_calls`, `crm_call_analyses`, `sales_script` | `M/074_*.sql:15`, `M/090_*.sql:9, 33` |
| Meta | `meta_events_log` | `M/093_*.sql:33` |
| Telegram vidjeti | `telegram_accounts`, `tg_templates`, `tg_chats`, `tg_messages`, `tg_schedules`, `tg_schedule_runs` | `M/100_*.sql:11-53`, `M/102_*.sql:4-15` |
| SMS | `sms_templates`, `sms_campaigns`, `sms_messages`, `sms_eskiz_retired` | `M/083_*.sql:19-35`, `M/095_*.sql:21` |
| Connector | `mcp_auth_codes`, `mcp_connections`, `mcp_calls` | `M/092_*.sql:11-33` |
| Eski / ishlatilmaydi | `crm_contacts` (072 dan beri `clients` o'rnini bosgan), `amo_*` arxivi. `amo_sync_state` hali ham kalit-qiymat ombori sifatida ishlatiladi | `M/007_*.sql:29`, `M/049_*.sql:15-76` |

Dashboard'ning o'z jadvali yo'q. U ikkita funksiya: `sales_dashboard` (`M/103_*.sql:27`) va `sales_insights` (`M/104_*.sql:26`).

---

## 3. Bog'liqliklar

### 3.1 Uzish qiyin (CRM bularsiz ishlamaydi)

| Bog'lanish | Qayerda | Nega qiyin |
|---|---|---|
| **`clients`** | `crm_leads.client_id` (`M/072_*.sql:12`), `crm_calls.client_id` (`M/074_*.sql:19-22`), `tg_chats.client_id` (`M/100_*.sql:41`), `sms_messages.client_id` (`M/083_*.sql:38`). `create_crm_lead` (`M/072_*.sql:106`), `intake_lead` (`M/091_*.sql:10-82`), `log_pbx_call` (`M/074_*.sql:43`), `tg_link_chat` (`M/100_*.sql:100`) mijozni telefon bo'yicha topadi yoki yaratadi. Frontendda `src/lib/supabase/queries/sotuv.ts:264, 419, 504` | Bitim doim bitta mijozga tegishli. `clients` jadvali ERP bilan umumiy va unda keshbek balansi, anketa, a'zolik maydonlari ham bor |
| **`profiles` + `auth.users`** | `crm_leads.created_by` / `responsible_user_id`, `crm_tasks.assignee_id`, `crm_calls.staff_id`, `crm_pipeline_sellers.user_id`, `tg_*`, `sms_*`, `mcp_*` → `profiles` (`M/072_*.sql:13-43`, `M/074_*.sql`, `M/088_*.sql:12`, `M/100_*.sql:13-60`). CRM ishlatadigan ustunlar: `pbx_ext` (`M/074_*.sql:13`), `telegram`, `telegram_chat_id`, `missed_dm` (`M/089_*.sql:9-10`), `department`, `is_active` | Hodim, login va egalik shu yerda. Hodim yaratish `admin-create-user` edge funksiyasi va Hodimlar / Sozlamalar sahifalari orqali, ya'ni mahsulotga "foydalanuvchilar" moduli ham kerak |
| **Ruxsatlar** | Har bir RLS qoidasi va funksiya `has_permission(auth.uid(), 'sotuv-crmn')` yoki `'dashboard'`ni tekshiradi (`M/056_*.sql:63`). Frontendda CRM / Dashboard fayllarining 18 tasi `useAuth` ishlatadi | Modul ro'yxati 3 joyda qotirilgan (2.1 ga qarang) |
| **`sotuv` bo'limi qoidasi** | `department_type` enum (`M/022_*.sql:3`), `isSeller` = bo'limi `sotuv` va admin emas (`src/lib/supabase/queries/auth.ts:43`), `src/lib/constants/employee.ts:1-17` | Bo'limlar ro'yxati (marketing, sotuv, buxgalteriya, operatsion, it, hr) DB enum'i, boshqa kompaniyada boshqacha bo'ladi |
| **Migratsiyalar zanjiri** | 110 ta fayl ketma-ket, CRM va boshqa modullar aralash. Masalan `M/072` `clients`ga, `M/081` `events`ga, `M/103` `payments`ga tayanadi | "Faqat CRM migratsiyalari"ni qo'llab bo'lmaydi. Alohida mahsulot uchun yangi toza boshlang'ich sxema yozish kerak |

### 3.2 Uzish o'rtacha (kod yozish kerak, lekin chegarasi aniq)

| Bog'lanish | Qayerda | Nima qilinadi |
|---|---|---|
| **Dashboard → Moliya / Tadbirlar** | `sales_dashboard` `event_participants`ni (`M/103_*.sql:75, 182-190`) va `payments`ni (`:77-79, 189-190`) o'qiydi; `sales_insights` ham (`M/104_*.sql:43, 46`). UI: `dashboard/Bento.tsx:143, 167` ("Sotilgan joylar", "Tushum"), `PlanCard.tsx`, `SellersTable.tsx`, `FinancePanel.tsx` | Yaxshi tomoni: pul qismi allaqachon `tadbirlar-moliya` ruxsati bilan shartli (`M/103_*.sql:31`). Jadvallar bo'sh tursa funksiya ishlaydi, UI'da plitkalarni yashirish kifoya. Jadvallar umuman bo'lmasa funksiyani qayta yozish kerak |
| **Qo'ng'iroq tahlili → Tadbir narxlari** | `call_analysis_claim` AI promptiga tadbir nomi va tarif narxlarini qo'shadi (`M/090_*.sql:99-107`, `S/callAnalysis.ts:100-101`) | Mahsulotda "mahsulot / narxlar ro'yxati" degan umumiy tushuncha kerak |
| **`is_customer`** | Mijoz "lid"mi yoki "mijoz"mi: `crm_lead_sources`, `crm_leads`, `event_participants`, anketa tasdig'iga qaraydi (`M/097_*.sql:59-60`). `src/lib/supabase/queries/clients.ts:35`, `Sms.tsx:80` | Tadbir va anketa shartini olib tashlash |
| **`payments` ustidagi CRM triggeri** | `trigger_meta_on_payment` to'lov tushganda Meta'ga `Purchase` navbatga qo'yadi (`M/093_*.sql:107-121`) | Bitta kod bazasida zararsiz; alohida repoda olib tashlanadi |
| **Voronka ↔ tadbir** | `crm_pipelines.event_id` → `events` (`M/081_*.sql:8`), `events.app_pipeline_id` → `crm_pipelines` (`M/105_*.sql:16`). UI: `sotuv/PipelineSettings.tsx:8`, `pages/SotuvLead.tsx:19, 540-559` ("Tadbirga yozish"), `events/CreateEventDrawer.tsx:19` | Ixtiyoriy ustun, UI bloklari yashiriladi |
| **Worker'dagi yagona HTTP server** | `S/intake.ts:14-18` barcha modullarning handler'larini import qiladi; `S/groups.ts` va `S/telegram.ts` to'lov cheklari, vazifalar va CRM ogohlantirishlariga birga xizmat qiladi | Ko'p qism allaqachon "env bo'lmasa o'chiq" tarzida yozilgan (`S/index.ts:73-74`, `S/capi.ts`, `S/mcp/oauth.ts:19-21`). Shu naqshni qolganlarga yoyish |

### 3.3 Uzish oson (ixtiyoriy UI bloklari yoki faylni ko'chirish)

| Bog'lanish | Qayerda |
|---|---|
| Anketa havolasi bitim sahifasida | `pages/SotuvLead.tsx:23-24, 144` |
| SMS bitim sahifasida va Telegram xato chizig'ida | `pages/SotuvLead.tsx:22, 25-26`, `telegram/TgComposer.tsx:9` |
| Umumiy UI Moliya papkasida turibdi (`ModalShell`, `INPUT`, `LABEL`) | `sotuv/LossReasonHost.tsx:3`, `FormSheet.tsx:1`, `SalesTasks.tsx:8`, `LeadCreate.tsx:8`, `PipelineSettings.tsx:11`, `pages/Sotuv.tsx:17` |
| Umumiy UI Vazifalar papkasida turibdi (`pickers.tsx`) | 9 ta `sotuv/` fayli, `dashboard/CallsCard.tsx:6`, `SellersTable.tsx:9`, `TasksCard.tsx:5` |
| Ilova qobig'iga o'rnatilgan CRM qismlari | `src/App.tsx:16-19` (`PhoneContext`, `PhoneWidget`, `DialPad`, `SalesReminders`), `src/appMain.tsx:13` (`LossReasonHost`) |
| Boshqa modullar CRM kodini ishlatadi | `pages/Mijozlar.tsx:2-3, 35` (`TgWidget`), `pages/Sms.tsx:5`, `pages/Integratsiyalar.tsx:7-25`, `pages/Ilova.tsx:13` va `HodimDetail.tsx:2` (Dashboard grafiklari), `lib/toast.ts:6` (`phoneAudio`) |
| Jonli yangilanish ro'yxati | `layout/LiveSync.tsx:13-26` barcha modullar jadvallari bitta qotirilgan ro'yxatda |
| FY ilova triggerlari | `M/105_*.sql:71, 98` (`events`, `event_participants` ustida) |

---

## 4. Integratsiyalar

Sozlama manbai uch xil: **env** (`~/amo-sync/.env`, repoda yo'q), **DB** (admin UI orqali), **kod** (qotirilgan).

| Integratsiya | Kod | Env | DB (UI orqali) | Kodga qotirilgan | Boshqa kompaniya ulashi uchun |
|---|---|---|---|---|---|
| **Telegram bot** (cheklar, vazifa boti, javobsiz qo'ng'iroq) | `S/telegram.ts`, `taskbot.ts`, `tasks.ts`, `missedCalls.ts`, `groups.ts` | `TELEGRAM_BOT_TOKEN`, `ALERT_CHAT_ID` | Guruhlar va 6 ta kalit: `telegram_groups` (`M/070_*.sql:21`); hodim: `profiles.telegram` | Bot buyruqlari `task`, `vazifa` va tavsifida klub nomi (`S/taskbot.ts:395-396`); havolalar `app.fikryetakchilari.uz` (`S/missedCalls.ts:10`, `S/taskbot.ts:21`); barcha xabar matnlari | O'z boti (env) + guruhlar (UI). Havola va matnlar uchun **kod o'zgaradi** |
| **Telegram akkaunt** (vidjet) | `S/tguser/` | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TG_DATA_DIR`, `STORAGE_URL` | Akkaunt QR bilan ulanadi (`telegram_accounts`), shablonlar (`tg_templates`) | Kuniga 30 ta yangi chat cheklovi SQL'da (`M/100_*.sql`) | Faqat env + UI. Sessiya fayli diskda turadi (`S/tguser/port.ts:38`) |
| **OnlinePBX** | `S/pbx.ts`, `src/context/PhoneContext.tsx` | `ONLINEPBX_DOMAIN`, `ONLINEPBX_KEY`, `JWT_SECRET` | Ichki raqam: `profiles.pbx_ext` | API manzili `api2.onlinepbx.ru` (`S/pbx.ts:13`); zaxira domen `api.fikryetakchilari.uz` (`S/pbx.ts:174`); `/pbx/verto` yo'li gateway nginx'da (repoda yo'q) | O'z OnlinePBX akkaunti bo'lsa: env + UI. **Boshqa ATS (Asterisk, Zadarma, MoiZvonki…) bo'lsa: `pbx.ts` va brauzer telefoni qayta yoziladi** |
| **Eskiz SMS** | `S/sms.ts` | `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM`, `PUBLIC_API_URL` | Shablonlar `sms_templates` | `notify.eskiz.uz` (`S/sms.ts:11`); 9:00–21:00 oynasi (`S/sms.ts:50-54`) | Env + UI. Eskiz faqat O'zbekiston raqamlariga yuboradi |
| **Gemini + Claude** (qo'ng'iroq tahlili, vazifa boti) | `S/callAnalysis.ts`, `S/taskbot.ts` | `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, model nomlari, `CALL_ANALYSIS_DAILY_MAX` | Sotuv skripti `sales_script` | Promptda klub nomi va "tadbirkorlar uchun pullik tadbirlar o'tkazadi" tavsifi (`S/callAnalysis.ts:40, 111`); 6 mezon va xato teglari (`S/callAnalysis.ts:30`); `api.fikryetakchilari.uz` (`S/callAnalysis.ts:20`) | Kalitlar env'da. Prompt uchun **kod o'zgaradi** |
| **Meta Conversions API** | `S/capi.ts`, `M/093_*.sql` | `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE` | Chegara: `crm_pipelines.lead_threshold` | **Piksel ID** (`S/capi.ts:13`), valyuta `UZS` (`S/capi.ts:52`), event nomlari | Token env'da, piksel uchun **kod o'zgaradi** |
| **Lid qabul qilish** (sayt, Tilda, Framer, Meta, Make.com) | `S/intake.ts`, `attribution.ts`, `leadScore.ts` | `META_PAGE_ACCESS_TOKEN`, `FB_LEAD_SECRET`, `INTAKE_PORT` | Manbalar, tokenlar, voronka: `crm_lead_sources` (`M/073_*.sql:10-29`) | Ball qoidalari o'zbekcha satrlar bo'yicha (`S/leadScore.ts:17-22`); forma maydon nomlari (`S/intake.ts:24-25`) | Manbalar UI'da. Ball qoidalari uchun **kod o'zgaradi** |
| **Claude connector (MCP)** | `S/mcp/` | `MCP_PUBLIC_URL`, `GOTRUE_URL`, `JWT_SECRET` | Ulanishlar `mcp_connections` | Yo'riqnoma matnida klub nomi (`S/mcp/server.ts:10`), kirish sahifasida logo va nom (`S/mcp/page.ts:103-104`) | Env; matn va logo uchun kod o'zgaradi |
| **FY ilova** | `S/fyApp.ts` | `FY_ADMIN_TOKEN` | `events.show_in_app` va h.k. | `com.fikryetakchilari.uz` (`S/fyApp.ts:18`) | Klubga xos, mahsulotga kirmaydi |

Umumiy holat: kalit va parollar env'da, ro'yxatlar DB'da — bu yaxshi. Muammo uch turdagi qotirilgan narsada: **domenlar, piksel ID, o'zbekcha matn va promptlar**. Yana bir narsa: admin UI'da "integratsiya kalitini kiritish" yo'q, hammasi server env fayli orqali. Bir martalik o'rnatishda buni o'rnatuvchi (siz) qiladi; mijoz o'zi ulashi kerak bo'lsa, sozlama sahifasi yozish kerak.

---

## 5. Kodga qotirilgan narsalar

| Narsa | Qayerda | Hajm |
|---|---|---|
| **Kompaniya nomi** "Fikr Yetakchilari", "FY Tizim" | `index.html:14, 19`; `public/manifest.webmanifest:2-4`; `src/components/pages/Login.tsx:27, 40`; `Anketa.tsx:30, 42, 63`; `src/lib/booklet/BookletPage.tsx:94`; `src/lib/signs/drawSigns.ts:113`; `S/callAnalysis.ts:40`; `S/taskbot.ts:86, 395-396`; `S/receipt.ts:147`; `S/mcp/server.ts:10`; `S/mcp/page.ts:103-104`; `S/pdf/drawSigns.ts:113` | ~15 fayl |
| **Logo, ikonka, fon rasmlar** | `public/favicon.svg`, `public/Sidebar/Logo*.svg`, `public/icons/*`, `public/images/bg-*.jpg`, `amo-sync/assets/logo.svg`, `amo-sync/assets/login-bg.webp` | statik fayllar |
| **Domenlar** | `S/callAnalysis.ts:20`, `S/fyApp.ts:18`, `S/missedCalls.ts:10`, `S/pbx.ts:174`, `S/sms.ts:15` (env bilan almashtirsa bo'ladi), `S/taskbot.ts:21`, `.github/workflows/uptime.yml:39-43` | 7 joy. `src/` ichida yo'q |
| **Meta piksel ID** | `S/capi.ts:13` | 1 joy |
| **Voronkalar** | "Asosiy voronka" + 7 bosqich (`M/007_*.sql:98-109`); "Umumiy" + 5 bosqich (`M/075_*.sql:11-21`). "Umumiy" nomi bo'yicha qidiriladi (`M/075_*.sql:24`, `M/100_*.sql:255`); `SotuvCalls.tsx:41` birinchi voronkani "Umumiy" deb hisoblaydi | Keyin UI'da o'zgartirsa bo'ladi, lekin "Umumiy" nomiga bog'liqlik bor |
| **Lid manbalari** | tilda, framer, sayt, meta, call, telegram (`M/073_*.sql:25-29`, `M/074_*.sql:38`, `M/100_*.sql:254`) | qatorlar DB'da, to'plam qotirilgan |
| **Yo'qotish sabablari** (11 ta) | `src/lib/lossReason.ts:3-4` va `crm_loss_reasons()` (`M/104_*.sql:14`); trigger boshqa qiymatni rad etadi | 2 joy, birga o'zgarishi shart |
| **Lid ball qoidalari** | Lavozim, aylanma va "kompaniya emas" so'zlari o'zbekcha satrlar (`S/leadScore.ts:17-22, 42`) | bitta fayl |
| **AI mezonlari va teglari** | `S/callAnalysis.ts:30, 111-121` | bitta fayl |
| **Rollar** | admin / manager / xodim: CHECK (`M/018_*.sql:8`) va `src/lib/supabase/queries/auth.ts:6, 36-40` | qotirilgan, lekin umumiy |
| **Bo'limlar** | 6 ta, DB enum (`M/022_*.sql:3`) va `src/lib/constants/employee.ts:1-17` | qotirilgan |
| **Til** | i18n qatlami yo'q. `ThemeContext.tsx:26-27, 42-46` `fy_lang`ni faqat saqlaydi, matn tarjima qilinmaydi. O'zbekcha matn JSX ichida: `sotuv/` 15/15 fayl, `dashboard/` 12/12, `telegram/` 8/8. Worker'da Telegram / SMS / AI matnlari ham o'zbekcha. Oy nomlari `src/lib/format.ts:1-4` | Boshqa til = har bir faylga tegish |
| **Valyuta** | `formatMoney` standart `UZS` (`src/lib/format.ts:28-34`); "so'm" / UZS `src/` ichida 30 qatorda; `S/capi.ts:52`; cheklar va promptlar | o'rtacha |
| **Vaqt zonasi** | `Asia/Tashkent` yoki `+05:00`: 45 faylda 120 ta joy (`src/`, `amo-sync/src/`, migratsiyalar). Masalan `src/lib/period.ts:1-50`, `M/103_*.sql` (13 ta), `S/missedCalls.ts:18-20` | **eng katta ish** |
| **Ish vaqti** | 09:00–18:00, Du–Sha (`M/103_*.sql:17-24`, `dashboard/SpeedCard.tsx:14, 20`); xabar oynasi 9:00–21:00 (`S/sms.ts:50-54`, `S/missedCalls.ts:20`) | qotirilgan |
| **Telefon** | `normalize_phone` +998 ga majburlaydi (`M/032_*.sql:1-25`); `src/lib/phone.ts:2-29`; `S/capi.ts:23-27`; `S/receipt.ts:104`. Chet el raqami "maxsus rejim" | o'rtacha |
| **Klubga xos tushunchalar CRM ichida** | "Tadbirga yozish", joylar plani, keshbek, anketa: `pages/SotuvLead.tsx`, `dashboard/Bento.tsx`, `PlanCard.tsx`, `SellersTable.tsx`, `sotuv/PipelineSettings.tsx` | 3.2 va 3.3 ga qarang |
| **PWA yorliqlari** | Vazifalar, Moliya, Sotuv (`public/manifest.webmanifest`) | 1 fayl |

---

## 6. Sirlar va ma'lumotlar

**Real kalit, token yoki parol topilmadi.** Kuzatuvdagi 616 fayl va git tarixi quyidagi naqshlar bo'yicha qidirildi: JWT (`eyJ…`), Telegram bot tokeni, `sk-ant-`, `AIza`, Meta tokeni, maxfiy kalit sarlavhasi, parolli `postgres://`. Tarixda topilgan `postgres://` satrlari 5 ta commit'da; 3 tasi ko'rildi (mahalliy test stendi), 2 tasi ko'rilmadi.

Mahsulot bilan birga **ketmasligi kerak** bo'lgan narsalar (qiymatlar yozilmagan):

| Nima | Qayerda |
|---|---|
| Server IP, SSH foydalanuvchisi, kalit nomi, Doppler loyiha nomlari, Supabase loyiha ID'si, konteyner nomlari, zaxira papkasi, ATS domeni | `CLAUDE.md` (110 KB, butun infratuzilma xaritasi) |
| Egasining domenlari va piksel ID | 5-bo'limdagi fayllar; `docs/` (~12 fayl) |
| Real ko'rinadigan xodim e-pochtasiga admin rolini beruvchi so'rov | `supabase/snippets/Untitled query 556.sql` |
| Shaxsiy Telegram manzili | `ops/backup.sh` (~20-qator), `.github/workflows/uptime.yml:53` |
| Egasi va xodimlar ismlari test ma'lumotlarida | `amo-sync/src/*.test.ts` (asosan `callAnalysis.test.ts`), `supabase/tests/090_call_analysis_test.sql`, `M/104_*.sql` (1 joy), `docs/superpowers/plans/2026-11-10-call-analysis.md` |
| Prod bazadan olingan biznes raqamlari (bitimlar, qo'ng'iroqlar, to'lovlar soni) | `docs/crm-audit-2026-11-19.md` |
| Real bo'lishi mumkin bo'lgan telefon raqamlari | `amo-sync/src/intake*.test.ts`, `docs/superpowers/plans/` (3 fayl). Ko'pi aniq soxta; bir nechtasini qo'lda ko'rish kerak. **Aniqlanmadi** |
| Eski dizayn audit matni | `audit.md` (ildizda) |

Yo'q narsalar: kuzatuvda `.env` fayli yo'q (`mobile/.env.example`dan tashqari, u bo'sh), dump / csv / xlsx / sessiya fayli yo'q, `supabase/seed.sql` yo'q, migratsiyalarda real odamlar kiritilmagan (faqat tuzilma: voronkalar, bosqichlar, manbalar, bucket'lar).

**Litsenziya masalalari (sotish uchun muhim, huquqiy baho berilmadi):**
- Repo ildizida `LICENSE` yo'q; `package.json`da `"private": true`.
- Shriftlar (DM Sans, Inter) litsenziya faylisiz: `amo-sync/fonts/`, `src/assets/fonts/`.
- Ovozlar Mixkit'dan: `src/assets/sounds/`. Qayta sotiladigan mahsulot ichida tarqatish shartlari tekshirilmadi.
- Fon rasmlari manbai yozilmagan: `public/images/bg-*.jpg`, `amo-sync/assets/login-bg.webp`.
- Dizayn tokenlari uchinchi tomon tizimidan (Broom Plexus): `src/styles/plexus-tokens.css`. Shartlari repoda yo'q.
- Grafik kodi vendor qilingan: `src/components/evilcharts/`.

Git tarixi egasining domenlari va ismlarini saqlaydi, shuning uchun mijozga **tarixsiz toza repo** berilishi kerak.

---

## 7. Cloudflare Workers'ga mosligi

Limitlar Cloudflare hujjatlaridan tekshirildi (2026-11-27): bepul tarifda har bir HTTP so'rov va har bir cron ishga tushishi uchun **10 ms CPU**, so'rov boshiga 50 ta tashqi chaqiruv, akkauntga 5 ta Cron Trigger, kuniga 100 000 so'rov, Hyperdrive orqali kuniga 100 000 DB so'rovi. Pullik tarif (oyiga $5 dan) CPU'ni 5 daqiqagacha ko'taradi. Tarmoqni kutish CPU hisoblanmaydi.

### 7.1 Asosiy to'siq: "backend" bizning kod emas

Frontend to'g'ridan-to'g'ri Supabase xizmatlariga ulanadi: login (GoTrue), jadvallar va funksiyalar (PostgREST), jonli yangilanish (Realtime), fayllar (Storage). Bular Workers'da ishlamaydi; ularga server yoki Supabase bulut loyihasi kerak.

**D1 real emas.** D1 — SQLite. Bizda mantiq Postgres'ning o'zida: plpgsql funksiyalar, triggerlar, RLS, `SECURITY DEFINER`, `jsonb`, `AT TIME ZONE`, `generate_series`, `pg_notify`, advisory lock, PostgREST hisoblangan maydonlari. D1'ga o'tish = 10 182 qator SQL va butun ruxsat tizimini boshqa tilda qayta yozish, ya'ni yangi mahsulot yozish.

**Hyperdrive real**, lekin u faqat Workers'dan mavjud Postgres'ga ulanish yo'li. Postgres baribir biror serverda turadi.

### 7.2 Qism bo'yicha

| Qism | Workers'da | Izoh |
|---|---|---|
| Frontend (statik SPA) | **Ishlaydi, o'zgarishsiz** | `Dockerfile` + `nginx.conf` faqat SPA fallback va kesh qiladi. Statik fayllar so'rovi bepul |
| Postgres, GoTrue, PostgREST, Realtime, Storage | **Ishlamaydi** | Server yoki Supabase bulut kerak |
| `admin-create-user` edge funksiyasi | Qayta yozilsa ishlaydi | Deno API (`Deno.serve`, `Deno.env`), 212 qator |
| Lid webhook'lari (`S/intake.ts`) | Qayta ishlansa ishlaydi | `Bun.serve` → `export default { fetch }`. Handler'lar allaqachon web `Request` / `Response`. Javobdan keyingi fon ish (`void metaLeads(...)`) `ctx.waitUntil`ga o'tadi |
| JWT / HMAC tekshiruvi, `node:crypto` | Ishlaydi | `nodejs_compat` bilan (`S/capi.ts:7`, `S/intake.ts:10`, `S/pbx.ts:89-120`) |
| Tashqi API chaqiruvlari (Telegram, Eskiz, OnlinePBX, Gemini, Claude, Meta) | Ishlaydi | Oddiy `fetch`. Ichki Docker manzillari (`http://auth:9999`, `http://storage:5000`: `S/mcp/gotrue.ts:12`, `S/tguser/storage.ts:4`) ochiq URL'ga almashadi |
| `process.env` | Qayta ishlash | Ko'p faylda modul yuklanishida o'qiladi; Workers'da `env` handler'ga keladi |
| Postgres drayveri | Hyperdrive bilan ishlaydi | `S/index.ts:35`. Hyperdrive `LISTEN` / `NOTIFY`ni qo'llamaydi |
| `LISTEN telegram_outbox`, `LISTEN sms_outbox` | **Ishlamaydi** | `S/telegram.ts:155`, `S/sms.ts:227`. Faqat davriy tekshiruv (30 s taymer allaqachon bor) yoki Queues |
| 12 ta `setInterval` taymer | Qayta ishlash | Cron Trigger eng tez 1 daqiqada bir. 30 soniyalik ishlar sekinlashadi yoki Durable Object alarm kerak. "band" bayroqlari xotirada (`busy`, `running`) — Workers'da xotira so'rovlar orasida saqlanmaydi, DB qulfi kerak |
| Xotiradagi holat | Qayta ishlash | PBX va Eskiz token keshi (`S/pbx.ts:18`, `S/sms.ts:23`), login urinishlari hisobi (`S/mcp/gotrue.ts:3-8`), PDF keshi (`S/mcp/files.ts:7-8`) → KV yoki DB |
| Vazifa boti: `getUpdates` long-poll | **Ishlamaydi** | Cheksiz sikl (`S/taskbot.ts:405-428`). Telegram webhook'ga o'tkazish kerak, bu bot qabul qilish qismini qayta yozish |
| Telegram akkaunt (`@mtcute/bun`) | **To'siq** | Doimiy MTProto ulanishi + diskdagi SQLite sessiya (`S/tguser/port.ts:38, 73-77`). Workers'da TCP ulanishni so'rovlar orasida ushlab bo'lmaydi. Doimiy jarayon (VM / konteyner) kerak. Durable Object ichida ishlashi **aniqlanmadi** |
| Chek rasmi: `@resvg/resvg-js` | **To'siq (shu holicha)** | Native modul (`S/receipt.ts:4`). WASM varianti bilan almashtirsa bo'ladi. CRM emas, Moliya |
| PDF: jsPDF + shriftlar | Qayta ishlash | `node:fs` bilan shrift o'qiydi (`S/pdf/render.ts:2-13`). CRM emas, Tadbirlar |
| Yozuv strimi `/hooks/pbx/audio` | Ishlaydi | Range bilan proksi (`S/pbx.ts:122-136`), asosan kutish |
| Telefon websocket proksisi (`/pbx/verto`) | **Aniqlanmadi** | Hozir gateway nginx qiladi, sozlamasi repoda yo'q. Workers'dan ATS'ning 8082-portiga websocket proksi qilish tekshirilmadi |
| MCP connector | Ehtimol ishlaydi | Web-standart transport ishlatadi; `SET LOCAL ROLE` tranzaksiya ichida (`S/mcp/db.ts:17-24`). Hyperdrive orqali sinab ko'rilmadi |

### 7.3 Bepul tarifning 10 ms CPU limitiga sig'maydigan joylar

Hech biri o'lchanmagan; baho kod o'qishga asoslangan.

| Joy | Nega | CRM'mi |
|---|---|---|
| **Qo'ng'iroq tahlili** | 18 MB gacha audio base64'ga aylantiriladi va JSON ichida yuboriladi (`S/callAnalysis.ts:176, 230`). Bu sof CPU ishi, yuzlab ms | Ha |
| **Chek PNG** (SVG → resvg) | Rasm chizish, har bir to'lovga | Yo'q |
| **Stiker / ko'rsatkich PDF** | 600 tagacha ism, shrift joylash | Yo'q |
| **MCP so'rovi** | Har so'rovda server yasaladi, zod sxema tekshiruvi (`S/mcp/server.ts`) | Aralash. Ehtimol 10 ms dan ortiq, **aniqlanmadi** |
| **Bitta cron ichida hamma taymer** | Bepul tarifda 5 ta cron; 12 ta ish bitta ishga tushishda 10 ms CPU va 50 chaqiruvga sig'ishi kerak. SMS, CAPI, cheklar har o'tishda 20 tadan yuboradi | Ha |
| **Rejalashtirilgan Telegram xabarlari** | Har bitim orasida 3 soniya, ketma-ket (`S/tguser/schedules.ts:10, 49-55`) — CPU emas, lekin uzoq davom etadi; Queues yoki Workflows kerak | Ha |

Sig'adiganlari (ehtimol): lid webhook'i (JSON o'qish + bitta SQL funksiya), JWT / HMAC tekshiruvi, PBX login ma'lumotini berish, holat tekshiruvi.

### 7.4 Xulosa

- Workers bazani va Supabase'ni almashtira olmaydi. Har bir mijozga baribir Postgres + Supabase turadigan joy kerak.
- Workers'ga ko'chsa bo'ladigan qism: frontend (oson, bepul) va `amo-sync`ning webhook + navbat qismi (qayta yozish, pullik tarif).
- Telegram akkaunt vidjeti saqlansa, doimiy ishlaydigan konteyner ham qoladi. Ya'ni natija "server + Workers" bo'ladi, "faqat Workers" emas. Bir martalik o'rnatish uchun bu ikki platformani sozlash degani.

---

## 8. Ajratish strategiyalari

Ish hajmi — taxminiy baho (bir dasturchi, haftalarda). Aniq raqam emas, solishtirish uchun.

### 8.0 Ikkala yo'lda ham bir xil bo'lgan ish

| Bosqich | Nima | Baho |
|---|---|---|
| T0. Tozalash | 6-bo'limdagi fayllarni olib tashlash, `CLAUDE.md`ni ikkiga bo'lish (mahsulot / bizning infratuzilma), `LICENSE` va uchinchi tomon ro'yxati, tarixsiz repo tayyorlash | 1 hafta |
| T1. Sozlamalar qatlami | Kompaniya nomi, logo, domenlar (`APP_URL`, `API_URL`), piksel ID, AI promptidagi kompaniya tavsifi, lid ball qoidalari, yo'qotish sabablari, ish vaqti → env yoki `app_settings` jadvali | 2–3 hafta |
| T1+. Chet el uchun | Vaqt zonasi (120 joy), valyuta, telefon mamlakati, til (i18n qatlami + barcha matn) | **+4–8 hafta**. Faqat O'zbekiston mijozlari bo'lsa kerak emas |
| T2. O'rnatuvchi | Butun stek uchun docker-compose (Supabase xizmatlari + gateway nginx + `amo-sync` + frontend) repoga kiritiladi; migratsiya qo'llovchi skript; birinchi admin yaratish; zaxira skripti; yangilash tartibi | 2–3 hafta |
| T3. Integratsiya yo'riqnomalari | Har bir integratsiya uchun "qanday ulanadi" + kerak bo'lsa boshqa ATS / SMS provayder | 1–2 hafta (boshqa ATS: +2–4 hafta har biriga) |
| T4. Toza serverda sinov | Bo'sh serverga o'rnatish, 58 ta SQL test va 34 ta worker testini o'tkazish | 1 hafta |

Jami umumiy qism: **7–10 hafta** (O'zbekiston ichida), chet el bilan 11–18 hafta.

### 8.1 (a) Bitta kod bazasi, modullar sozlama bilan yoqiladi

Mijozga butun sxema o'rnatiladi; tadbir, moliya, keshbek, vazifa jadvallari bo'sh turadi va UI'da ko'rinmaydi.

| Bosqich | Nima | Baho |
|---|---|---|
| A1. O'rnatish darajasidagi modul bayrog'i | Hozir ruxsatlar foydalanuvchi darajasida va admin hammasini ko'radi (`M/056_*.sql:63`). Uning ustiga "bu o'rnatishda qaysi modullar bor" ro'yxati: route, menyu, `LiveSync`, Integratsiyalar plitkalari, worker taymerlari | 1–2 hafta |
| A2. CRM'dagi klub bloklarini shartli qilish | "Tadbirga yozish", anketa, joylar plani, "Sotilgan joylar / Tushum" plitkalari, voronka ↔ tadbir sozlamasi | 1 hafta |
| A3. Umumiy UI'ni ko'chirish | `ModalShell`, `pickers`, grafiklar `ui/` ga | 2–3 kun |
| A4. Ikki konfiguratsiyada sinov | "To'liq ERP" va "faqat CRM" | doimiy |

**Jami: umumiy 7–10 hafta + 3–4 hafta = 10–14 hafta.**

Xavflar:
- Mijoz serverida butun ERP kodi va sxemasi turadi (moliya, keshbek, tadbir mantiqi). Bu intellektual mulk va "ortiqcha narsa" masalasi. Frontendda build paytida o'chirilgan modullar kodini chiqarib tashlash mumkin; SQL'da yo'q.
- ERP'ga qo'shilgan har bir o'zgarish "modul o'chiq" holatida ham buzilmasligi kerak. Hozir bunday sinov yo'q.
- Klubga xos yangi g'oyalar (masalan FY ilova) mahsulotga sizib kiradi, agar har safar bayroq ortiga qo'yilmasa.

Parallel yuritish narxi: **past.** Bitta tuzatish ikkala tomonga ham boradi. Narxi: har bir relizda ikki konfiguratsiyani tekshirish va mijozlarga versiya chiqarish tartibi.

### 8.2 (b) Alohida repozitoriyaga ko'chirish

| Bosqich | Nima | Baho |
|---|---|---|
| B1. Yangi toza sxema | 110 migratsiyadan CRM'ga tegishli jadval, funksiya (~40 ta), trigger, RLS qoidalarini (~56 ta) ajratib bitta boshlang'ich sxema yozish. `sales_dashboard`, `sales_insights`, `is_customer`, `call_analysis_claim` va Meta triggerini tadbir / to'lovsiz qayta yozish. `clients`ni keshbek, anketa, a'zolik maydonlaridan tozalash | 3–5 hafta |
| B2. Frontendni ajratish | Qobiq (auth, tema, `ui/`, toast, `LiveSync`), CRM, Dashboard, Integratsiyalar, foydalanuvchi boshqaruvi, SMS. Hodimlar sahifasidan foydalanuvchi yaratish qismini ajratish | 2–3 hafta |
| B3. Worker'ni tozalash | Keshbek, cheklar, vazifa boti, PDF, FY ilova chiqariladi; `groups.ts` va `taskbot.ts`dagi aralash qismlar ajratiladi | 1–2 hafta |
| B4. Testlarni ko'chirish | ~30 ta SQL test fayli yangi sxemaga moslanadi | 1–2 hafta |
| B5. Doimiy | Har bir CRM tuzatishi va yangiligi ikki repoga qo'lda ko'chiriladi | har hafta |

**Jami: umumiy 7–10 hafta + 7–12 hafta = 14–22 hafta, va undan keyin doimiy ikki baravar ish.**

Xavflar:
- **Ajralib ketish.** CRM hozir juda tez o'zgaryapti: 072–110 migratsiyalar (39 ta) taxminan ikki oyda yozilgan. Ikki repo bir necha oyda bir-biriga mos kelmay qoladi, keyin tuzatishlarni ko'chirish har safar qayta yozishga aylanadi.
- Qayta yozilgan SQL'da pul va ruxsat xatolari. Hozirgi testlar eski sxemaga yozilgan.
- ERP'dagi CRM "ikkinchi darajali" bo'lib qoladi yoki aksincha.

Afzalligi: toza mahsulot, mijozda klub kodi yo'q, o'rnatish yengilroq, o'z yo'l xaritasi, keyin SaaS'ga aylantirish osonroq.

Parallel yuritish narxi: **yuqori va doimiy.**

### 8.3 Solishtirish

| | (a) Bitta kod bazasi | (b) Alohida repo |
|---|---|---|
| Birinchi mijozgacha | 10–14 hafta | 14–22 hafta |
| ERP ishdan chiqish xavfi | Past (ERP kodi deyarli o'zgarmaydi, faqat shartlar qo'shiladi) | Yo'q (ERP'ga tegilmaydi) |
| Mijoz serveridagi ortiqcha kod | Butun ERP sxemasi | Yo'q |
| Har bir yangi CRM imkoniyati | Bir marta yoziladi | Ikki marta |
| Keyin fikrni o'zgartirish | (b) ga o'tish mumkin, qilingan ish yo'qolmaydi | (a) ga qaytish = birlashtirish, qimmat |

### 8.4 Tavsiya: (a), bosqichma-bosqich

Sabablari:
1. **Ishning katta qismi baribir bir xil.** Tozalash, sozlamalar qatlami, o'rnatuvchi, integratsiya yo'riqnomalari ikkala yo'lda ham kerak (7–10 hafta). (a) ustiga atigi 3–4 hafta qo'shadi, (b) esa 7–12 hafta.
2. **CRM hali tez o'zgaryapti.** Bunday paytda ikki nusxani yuritish eng qimmat narsa. Bitta dasturchi (yoki AI bilan ishlaydigan bitta odam) uchun bu amalda bitta nusxaning tashlab qo'yilishiga olib keladi.
3. **Qaytarib bo'ladi.** (a) dagi har bir ish (b) uchun tayyorgarlik. 2–3 mijozdan keyin mahsulot yo'li ERP'dan ajralsa, o'shanda ajratish mumkin va nimani ajratish kerakligi aniq bo'ladi.
4. **ERP uchun xavfsizroq.** Pul va ruxsat SQL'i qayta yozilmaydi.

Shart: mijoz serverida ERP'ning to'liq sxemasi turishi sizga ma'qul bo'lishi kerak (9-bo'lim, 3-savol). Agar yo'q bo'lsa, (b) dan boshqa yo'l qolmaydi.

Workers bo'yicha tavsiya: birinchi versiyada ko'chirmaslik. Frontendni Cloudflare'ga qo'yish mumkin (oson), qolgani Docker'da bitta serverda qolsin. Sababi 7.4 da.

---

## 9. Qaror uchun sizdan bilishim kerak bo'lgan narsalar

**Bozor va mijoz**
1. Birinchi mijozlar faqat O'zbekistondami? Agar ha: til, valyuta, vaqt zonasi, +998 ishlarini (4–8 hafta) kechiktirsa bo'ladi.
2. Mijozlar kim: tadbir o'tkazadigan klublarmi yoki har qanday sotuv bo'limimi? Birinchi holda Tadbirlar va Moliya ham mahsulot ichida ketishi mumkin va ajratish ancha yengillashadi.
3. Mijoz serverida ERP'ning to'liq sxemasi (moliya, keshbek, tadbir jadvallari va funksiyalari) bo'sh holda turishi sizga ma'qulmi? Mijoz kodni ko'ra oladimi yoki yopiq o'rnatiladimi?

**Mahsulot chegarasi**
4. "CRM + Dashboard" ichiga yana nima kiradi: Mijozlar sahifasi, SMS, Vazifalar, Telegram vidjeti, AI qo'ng'iroq tahlili, Claude connector, Meta CAPI, lid balli?
5. Dashboard'dagi pul ko'rsatkichlari (joylar, tushum, plan) mahsulotda kerakmi? Kerak bo'lsa, tadbirsiz kompaniyada "sotuv summasi" qayerdan olinadi: bitimning qo'lda yozilgan summasidanmi?
6. Bo'limlar va rollar mijozda o'zgartiriladigan bo'lishi kerakmi yoki hozirgi 3 rol + "sotuvchi" belgisi yetarlimi?

**Integratsiyalar**
7. Mijozlar qaysi telefoniyani ishlatadi? Faqat OnlinePBX bo'lsa ish kam; boshqa ATS har biri alohida 2–4 hafta.
8. SMS faqat Eskizmi?
9. AI kalitlari (Gemini, Claude) kimniki bo'ladi: mijozning o'ziniki yoki siz to'laysizmi?
10. Integratsiya kalitlarini kim kiritadi: siz o'rnatishda (env fayl yetadi) yoki mijoz admini o'zi (sozlama sahifasi yozish kerak)?

**O'rnatish va keyingi hayot**
11. "Bir martalik o'rnatish" yangilanishlarni o'z ichiga oladimi? Mijoz keyin yangi versiya oladimi, kim o'rnatadi, pullikmi?
12. Qayerga o'rnatiladi: mijozning o'z serveri, siz ijaraga olgan VPS yoki Supabase bulut? Mijozda server boshqaradigan odam bo'ladimi?
13. Nega Cloudflare Workers: xarajatni kamaytirish uchunmi, o'rnatishni soddalashtirish uchunmi yoki server boshqarmaslik uchunmi? Javobga qarab Supabase bulut + Cloudflare'dagi frontend yaxshiroq variant bo'lishi mumkin.
14. Nechta mijoz kutilyapti birinchi yilda: 2–3 tami yoki o'nlabmi? O'nlab bo'lsa, bitta umumiy SaaS (ko'p mijoz bitta bazada) haqida o'ylash kerak, bu boshqa arxitektura.
15. Muddat: birinchi mijoz qachon ishga tushishi kerak?

**Addonlar**
16. Addonlarni kim yozadi: faqat siz (biz), mijozning o'z dasturchisi yoki uchinchi tomon? Faqat siz bo'lsangiz 10.3 dagi sodda papka usuli yetadi; boshqalar yozsa barqaror ochiq API, versiya va cheklovlar kerak bo'ladi.
17. Avtomatikani mijoz admini o'zi UI'da sozlashi kerakmi ("bosqich X ga o'tsa Y qil") yoki har safar siz kod / webhook bilan qilib berasizmi?
18. Qo'shimcha maydonlar faqat bitimdami yoki mijoz kartasida ham? Ular bo'yicha filtr va Dashboard kesimi kerakmi?

**Huquqiy**
19. Shrift, ovoz, fon rasmlari va dizayn tokenlarini (Broom Plexus) qayta sotiladigan mahsulotda ishlatishga huquq bormi? Yo'q bo'lsa almashtirish kerak.
20. Mahsulot nomi va brendi bormi?

---

## 10. Addon tizimi: ulanish nuqtalari

Savol: mijozga xos kengaytma (yangi vidjet, bitim kartochkasida tab, bosqich o'zgarganda avtomatika, qo'shimcha maydon) core kodga tegmasdan qo'shilishi uchun nima kerak.

### 10.1 Hozirgi tayyorlik

**Umumiy baho: past.** Kengaytma uchun maxsus qilingan birorta ulanish nuqtasi yo'q; har bir yangilik core fayllarni tahrirlash bilan qo'shilgan. Lekin poydevor bo'ladigan narsalar bor.

| Kengaytma turi | Tayyorlik | Hozir nima bor | Nima qotib yozilgan |
|---|---|---|---|
| Dashboard vidjeti | Yo'q | Qayta ishlatsa bo'ladigan `Section`, `Card` bo'laklari (`src/components/dashboard/pieces`); vidjetlar props oladigan alohida komponentlar | Sahifa tartibi qat'iy JSX (`src/components/pages/Dashboard.tsx:97-161`), mobil ko'rinish alohida fayl (`dashboard/MobileDashboard`). Hamma ma'lumot bitta funksiyadan, shakli qat'iy (`sales_dashboard`, `M/103_*.sql:27`). Davr va voronka filtri sahifaning ichki holati |
| Bitim kartochkasida tab / blok | Yo'q | — | Bitta 891 qatorli fayl (`src/components/pages/SotuvLead.tsx`). Desktop va mobil ikki alohida chizilgan (`LeadView` 51-qator, `LeadMobile` 580-qator). Mobil tablar qat'iy ro'yxat: "Lenta / Ma'lumotlar" (`:583, :670`). Yozish paneli rejimlari qat'iy: izoh / vazifa / SMS (`:414`). Lenta 4 manbadan qo'lda yig'iladi (`:258-277`) |
| Bosqich o'zgarganda avtomatika | Qisman | Bosqich o'zgarishi allaqachon yozib boriladi: `crm_notes` da `kind='stage'`, `meta.from/to` (`M/072_*.sql:74-90`). "Navbat + worker + qayta urinish" naqshi uch marta yozilgan: `telegram_outbox` (`M/060_*.sql:14`), `meta_events_log` (`M/093_*.sql:33`), `fy_app_outbox` (`M/105_*.sql:18`) | Har bir avtomatika alohida trigger: bosqich qoidalari (`M/072_*.sql:50-70`), yo'qotish sababi (`M/096_*.sql:11-25`), lid taqsimlash (`M/088_*.sql:22-61`), Meta (`M/093_*.sql:68-88`). Bosqichga bog'langan yagona sozlanadigan harakat — Telegram shabloni (`crm_stages.tg_template_id`, `M/101_*.sql:5`) va u **brauzerda** ishga tushadi (`src/lib/telegramStage.ts:13`), 3 joydan chaqiriladi (`sotuv/Board.tsx:41-45`, `pages/SotuvLead.tsx:79-84`). Bosqich boshqa yo'l bilan o'zgarsa (birlashtirish, forma, connector) ishlamaydi |
| Qo'shimcha maydonlar | Qisman | `crm_leads.fields` — erkin `[{k, v}]` ro'yxati (`M/079_*.sql:6`), kartochkada "Forma javoblari" bo'lib ko'rinadi (`pages/SotuvLead.tsx:154-158, 759-763`) | Faqat formadan to'ladi, UI'da tahrirlab bo'lmaydi (`src/components/sotuv` va `hooks/useSotuv.ts` da yozuv yo'q, faqat o'qish: `Board.tsx:88`, `LeadCards.tsx:73`). Maydon ta'rifi (turi, variantlari) yo'q, filtr va ro'yxat ustuni yo'q. `clients`da ustunlar qat'iy; forma javobi mijoz kartasiga yorliq matni bo'yicha regex bilan ko'chiriladi (`M/081_*.sql:10-30`). Lid balli ham o'zbekcha yorliqlarga bog'liq (`S/leadScore.ts:17-22`) |

Kengaytma yozuvchiga xalaqit beradigan umumiy qotirilgan ro'yxatlar:

| Nima | Qayerda | Oqibati |
|---|---|---|
| Modul (ruxsat) ID'lari | 3 joyda: `src/lib/supabase/queries/auth.ts:8-28`, `supabase/functions/admin-create-user/index.ts:11`, `M/083_*.sql:11-14` (CHECK) | Addon o'z ruxsatini core'ni o'zgartirmasdan qo'sha olmaydi |
| Sahifalar va menyu | `src/App.tsx:196-265` (route), `PAGE_META`, `src/components/layout/nav.ts:28-60` | Addon sahifasi uchun core fayl tahrirlanadi |
| Jonli yangilanish | `src/components/layout/LiveSync.tsx:13-26` (jadval → so'rov kalitlari) va Realtime nashri (`M/076_*.sql:12-13`) | Addon jadvali jonli yangilanmaydi |
| Worker ishga tushirish ro'yxati | `S/index.ts:62-75` | Addon taymeri uchun core fayl tahrirlanadi |
| Worker HTTP yo'llari | `S/intake.ts:237-243` (`if` zanjiri) | Addon webhook'i uchun core fayl tahrirlanadi |
| Lenta yozuvi turlari | `crm_notes.kind` CHECK: note / created / stage / lead / merged (`M/075_*.sql:27-28`); chizish `pages/SotuvLead.tsx:313-335` | Addon lentaga o'z turidagi yozuv qo'sha olmaydi |

Kodda plugin interfeysiga eng yaqin narsa — Claude connector asboblari: har bir asbob bir xil `ToolDef` shaklida (`S/mcp/def.ts:8-16`) va ro'yxatlarga yig'iladi (`S/mcp/tools.ts:26`, `events.ts:90`, `tasks.ts:41`). Yana bir tayyor narsa: PostgREST + RLS. Addon hodim tokeni bilan jadval va funksiyalarga murojaat qila oladi va ruxsatlar avtomatik ishlaydi. Tashqi addon uchun alohida kalit (xizmat akkaunti) tushunchasi yo'q.

### 10.2 Kerakli ulanish nuqtalari

**1. Hodisalar navbati + chiquvchi webhook (avtomatika uchun)**
- Bitta `crm_events` jadvali: `lead.created`, `lead.stage_changed`, `lead.won`, `lead.lost`, `call.logged`, `task.done` va h.k. Bitta trigger yozadi (stage uchun joy tayyor: `M/072_*.sql:89`).
- Worker'da bitta tarqatuvchi: (a) `crm_webhooks` jadvalida ro'yxatdan o'tgan tashqi URL'larga imzolangan so'rov yuboradi; (b) worker ichida ro'yxatdan o'tgan addon funksiyalarini chaqiradi.
- Namuna sifatida `fy_app_outbox` + `S/fyApp.ts` eng toza (qayta urinish 1 / 5 / 15 / 60 daqiqa).
- Cheklov: webhook faqat "bo'lgandan keyin" ishlaydi. Bosqichga o'tishni **to'xtatadigan** qoida (masalan "sababsiz yo'qotilganga o'tkazma") baribir DB triggeri bo'ladi. Buning uchun addon o'z migratsiyasida o'z triggerini qo'shadi; triggerlar nomi bo'yicha tartiblanadi va bu usul kodda allaqachon ishlatilgan (`trigger_crm_lead_zz_auto_assign`, `M/088_*.sql:61`).

**2. Qo'shimcha maydonlar**
- `crm_field_defs` jadvali: obyekt (bitim / mijoz), kalit, nom, tur (matn, son, sana, tanlov), variantlar, voronka, tartib.
- Qiymatlar `crm_leads` va `clients`dagi yangi `custom` jsonb ustunida (kalit → qiymat). Mavjud `fields` ustunini qayta ishlatmaslik kerak: u forma javoblari jurnali, tartibli, kalitlari o'zbekcha yorliq va lid balli unga tayanadi.
- UI: ta'rifga qarab chizadigan bitta umumiy tahrirlovchi (kartochkada), ro'yxatda ustun tanlash, filtr.

**3. Frontend slotlari**
- Bitta kichik registr: `registerDashboardWidget`, `registerLeadPanel` (chap ustun / mobil "Ma'lumotlar"), `registerLeadTab` (yozish paneli rejimi), `registerFeedSource` (lentaga element), `registerPage` (route + menyu + sarlavha).
- Dashboard vidjeti o'z ma'lumotini o'zi oladi (addon'ning o'z SQL funksiyasi), sahifadan faqat davr va voronkani qabul qiladi. `sales_dashboard`ga tegilmaydi.
- Bitim sahifasi uchun avval `SotuvLead.tsx`ni bo'laklarga ajratish kerak, chunki desktop va mobil alohida chizilgan.

**4. Worker slotlari**
- Hodisa ishlovchisi, HTTP yo'li, taymer va connector asbobi uchun registr. Connector asboblari uchun shakl tayyor (`ToolDef`).

**5. Ruxsat va jonli yangilanish**
- Modul ro'yxatini CHECK o'rniga jadvalga ko'chirish (yoki `addon:<nom>` prefiksiga ruxsat berish) va uch joydagi qotirilgan ro'yxatni bitta manbaga keltirish.
- `LiveSync` ro'yxatiga addon o'z jadvalini qo'sha olishi.

### 10.3 Addon qanday ko'rinishi kerak (eng sodda variant)

Bir martalik o'rnatish modelida har bir mijozning o'z o'rnatmasi bor, shuning uchun ish paytida plugin yuklash, do'kon yoki sandbox kerak emas. Addon = repodagi papka:

```
addons/<nom>/
  web/      # registrga vidjet, panel, sahifa qo'shadi
  sql/      # o'z migratsiyalari, o'z jadvallari (x_<nom>_ prefiksi bilan)
  worker/   # hodisa ishlovchisi, webhook, taymer
```

- Qaysi addonlar yoqilishi o'rnatma sozlamasida (env ro'yxati), build paytida aniqlanadi.
- Qoida: core hech qachon addon'dan import qilmaydi; addon faqat kichik ochiq yuzadan foydalanadi (registr funksiyalari, `ui/` komponentlari, Supabase mijozi, hujjatlashtirilgan jadval va funksiyalar).
- Addon core jadvallarini o'zgartirmaydi; qo'shimcha ma'lumotni `custom` ustuniga yoki o'z jadvaliga yozadi.
- Bog'liqlik: addon SQL'ini qo'llash uchun migratsiya qo'llovchi skript kerak. U hozir yo'q (migratsiyalar qo'lda qo'llanadi) va 8.0 dagi T2 bosqichiga kiradi.

Bu usul sinab ko'rilmagan; Vite'da papkalarni build paytida topish (`import.meta.glob`) hozir kodda ishlatilmaydi.

### 10.4 Eng kam ish bilan nimadan boshlash

Baholar taxminiy (bir dasturchi).

| Tartib | Nima | Baho | Nega shu tartibda |
|---|---|---|---|
| 1 | Hodisalar navbati + chiquvchi webhook | 3–5 kun | Eng arzon va eng ko'p ish beradi: mijozga xos avtomatika core'dan butunlay tashqarida yashaydi (o'z skripti, Make, n8n). Naqsh kodda uch marta bor, yangi narsa o'ylab topilmaydi |
| 2 | Qo'shimcha maydonlar (`custom` + ta'riflar + tahrirlovchi + ro'yxat ustuni) | 1–1,5 hafta | CRM mijozlari birinchi so'raydigan narsa (mening bahom, tekshirilmagan). Filtr va Dashboard kesimi keyinroq |
| 3 | Frontend slotlari: Dashboard vidjeti, bitim paneli, sahifa | ~1 hafta (`SotuvLead.tsx`ni ajratish bilan) | Vidjet sloti 1–2 kun; bitim sahifasi ko'proq |
| 4 | Addon papkasi qoidasi + build paytida topish + addon migratsiyalari | 3–5 kun | T2 (o'rnatuvchi) bilan birga |
| 5 | Ruxsat va `LiveSync` registri | 2–3 kun | Addon o'z ruxsati va jonli yangilanishiga ega bo'lishi uchun |

Jami: **3–4 hafta**, 8-bo'limdagi baholarga qo'shimcha.

Hozir qilmaslik kerak: ish paytida plugin yuklash, addon do'koni, sandbox, vizual avtomatika quruvchi, addon uchun versiyalangan ochiq API. Bular uchinchi tomon dasturchilari addon yozadigan bo'lgandagina kerak.

**8-bo'limdagi tavsiya bilan bog'liqligi.** (a) yo'lidagi A2 bosqichi ("klubga xos bloklarni shartli qilish") aslida shu slotlarning o'zi. "Tadbirga yozish" tugmasi, anketa havolasi, joylar plani, "Sotilgan joylar / Tushum" plitkalari, FY ilova — bularni birinchi addonlar sifatida slotlarga ko'chirsa, bir ish bilan ikki natija olinadi: mahsulot klub kodidan tozalanadi va slotlar real misolda sinaladi. Ya'ni addon poydevori (a) yo'lini qimmatlashtirmaydi, balki uning A1–A2 bosqichlarini to'g'ri shaklda bajarish usuli.

---

## 11. Aniqlanmagan narsalar

| Nima | Nega |
|---|---|
| Addon papkalarini build paytida topish (`import.meta.glob`) va addon jadvallarining Realtime bilan ishlashi | Sinab ko'rilmadi; kodda hozir ishlatilmaydi |
| Bitimlar ro'yxati (Ro'yxat ko'rinishi) ustunlari qanchalik qotirilgan | Alohida o'qilmadi |
| Prod gateway nginx sozlamasi, Supabase docker-compose, Traefik, Coolify sozlamalari, `~/amo-sync/.env` tarkibi, cron yozuvi | Repoda yo'q, faqat `CLAUDE.md`da tasvirlangan. Serverga ulanilmadi |
| Prod bazaning haqiqiy holati migratsiya fayllariga mos keladimi | Bazaga ulanilmadi |
| `doppler.yaml` | `CLAUDE.md` bor deydi, kuzatuvda yo'q |
| Test va hujjatlardagi bir nechta telefon raqami real odamnikimi | Qo'lda tekshirish kerak |
| `callAnalysis` test matni real suhbatdan olinganmi | Tekshirilmadi |
| Git tarixidagi 2 ta commit (`postgres://` naqshi) va o'chirilgan eski AmoCRM kodi | Ko'rilmadi |
| Rasm fayllarida real odam bormi; rasm, ovoz, shrift, Plexus litsenziya shartlari | Fayllar ochilmadi, huquqiy baho berilmadi |
| Har bir handler'ning haqiqiy CPU vaqti | O'lchanmadi, baho kod o'qishga asoslangan |
| Stek Supabase bulutda o'zgarishsiz ishlaydimi (`JWT_SECRET` bilan HS256 tekshiruv, ichki `http://auth:9999` manzillari) | Sinab ko'rilmadi |
| Workers'dan ATS'ga websocket proksi; mtcute Durable Object ichida; MCP Hyperdrive orqali | Sinab ko'rilmadi |
| Eski KPI funksiyalari (`M/022`, `M/044`, `M/045`) `crm_leads`ga qanchalik bog'liq (Hodimlar ↔ CRM) | To'liq o'qilmadi |
| `member-self-register` va `admin-create-member` edge funksiyalari prod'da ishlatiladimi | `src/` va `mobile/src`da chaqiruvchi topilmadi; serverda tekshirilmadi |
| `mobile/` ilovasi | Bu audit doirasida chuqur ko'rilmadi |
| CRM hook va so'rov fayllarining aniq qator soni | Alohida sanalmadi |

### Yo'l-yo'lakay ko'ringan mayda narsalar (o'zgartirilmadi)

- `amo-sync/Dockerfile` izohi hali ham "AmoCRM → Supabase copy" deydi; `amo-sync/e2e.ts` bo'sh fayl.
- Repoda ham `bun.lock`, ham `package-lock.json` bor.
- `README.md` standart Vite shabloni.
- `puppeteer` frontend `dependencies` ichida (`package.json`), ishlatilishi tekshirilmadi.
