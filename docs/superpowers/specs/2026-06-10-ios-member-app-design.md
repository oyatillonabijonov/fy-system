# FY-System aʼzo mobil ilovasi — dizayn hujjati (1-bosqich MVP)

Sana: 2026-06-10 · Holat: tasdiqlangan

## 1. Maqsad

"Fikr Yetakchilari" klubi aʼzolari (tadbirkorlar) uchun iOS ilova. Aʼzo tadbirlarni koʻradi va roʻyxatdan oʻtadi, cashback balansi/tarixini kuzatadi, profilini va toʻlovlar tarixini koʻradi, klub yangiliklarini oʻqiydi. Mavjud Supabase backend va dashboard dizayn tizimi (Geist, 8px radius, neutral palitra) qayta ishlatiladi.

## 2. Bosqichlar

| Bosqich | Qamrov |
|---|---|
| **1 (shu hujjat)** | Aʼzo yadrosi: login, tadbirlar + roʻyxatdan oʻtish, cashback, profil + toʻlovlar, yangiliklar (oʻqish) |
| 2 | Hamjamiyat chati (Supabase Realtime) |
| 3 | Hodim rejimi: tadbir check-in, mijozlar, CRM-N, dashboard |

Arxitektura 2–3 bosqichlarni bloklamaydi (hodim akkauntlari `profiles` orqali ajratilgan, tablar kengayadi).

## 3. Texnologiya

- **React Native + Expo (expo-router)**, shu repoda `/mobile` (alohida package.json, workspace-siz). Bun, strict TS, `any` yoʻq.
- supabase-js + AsyncStorage sessiya; TanStack Query (web bilan bir xil `*_KEY` konvensiyasi).
- Dizayn tokenlari `mobile/theme/tokens.ts` — `src/index.css` dagi neutral tema qiymatlari (bg `#F3F2F0`, surface `#FFFFFF`, text `#141414`, muted `#999999`, border `#E0E0E0`, accent `#141414`), radius 8, Geist .otf (lokal, OFL).
- Barcha UI matnlari oʻzbekcha; i18n kutubxonasiz.

## 4. Auth modeli

- Aʼzo = `clients` qatori. Yangi ustun: `clients.auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL`.
- Akkauntni **admin yaratadi** (oʻzi roʻyxatdan oʻtish yoʻq): yangi `admin-create-member` edge function — caller admin tekshiruvi → `auth.admin.createUser({user_metadata: {user_type: 'member'}})` → `clients.auth_user_id` bogʻlash (xatoda auth user oʻchiriladi — rollback).
- `handle_new_user` trigger qayta yaratiladi: `user_type = 'member'` boʻlsa `profiles` qatori YARATILMAYDI. Natija: aʼzo dashboardga kira olmaydi (web AuthContext profil yoʻqligida bloklaydi), hodim roʻyxatlari ifloslanmaydi. `profiles.role` CHECK ga 'member' qoʻshish rad etilgan.
- Mobil AuthContext: sessiyadan `clients` qatorini `auth_user_id` boʻyicha oladi; topilmasa signOut + "Bu ilova faqat klub aʼzolari uchun".

## 5. RLS (xavfsizlik)

Hozirgi "allow all" policylar almashtiriladi. Yordamchilar: `is_staff(uuid)` (faol profiles qatori bormi), `my_client_id()` (auth.uid() → clients.id) — SECURITY DEFINER, `SET search_path = public, pg_temp` (019 patterni).

| Jadval | SELECT | Yozish |
|---|---|---|
| clients | `is_staff(auth.uid()) OR auth_user_id = auth.uid()` | faqat staff (aʼzo RPC orqali) |
| events | staff hammasini; aʼzo faqat `is_active = true` | faqat staff |
| event_participants | `is_staff OR contact_id = my_client_id()` | faqat staff (aʼzo RPC orqali) |
| cashback_transactions | `is_staff OR client_id = my_client_id()` | faqat staff |
| news_posts | authenticated + `is_published` (staff hammasini) | faqat staff |
| profiles | `is_staff(auth.uid()) OR id = auth.uid()` (avval: barcha authenticated) | oʻzgarmaydi |

Webhooklar/amocrm-sync/edge functionlar service role ishlatadi — taʼsirlanmaydi. Cashback trigger zanjiri (auto_award → balans) SECURITY DEFINER — ishlayveradi. Anon kalit endi bu jadvallarni oʻqiy olmaydi (web faqat logindan keyin soʻraydi).

## 6. Aʼzo yozuv amallari — RPC orqali

RLS yozishni yopadi; aʼzo ikkita SECURITY DEFINER RPC ishlatadi:
- `register_for_event(p_event_id uuid) RETURNS uuid` — event faol va kelgusida ekanini tekshiradi, clients dan snapshot bilan `event_participants` qatori yaratadi (`price` = `events.price` (yangi ustun, default 0), `paid` = 0, `status` = 'pending'). Dublikat: partial unique index `(event_id, contact_id) WHERE contact_id IS NOT NULL` + oʻzbekcha xato ("Siz allaqachon roʻyxatdan oʻtgansiz").
- `member_update_profile(full_name, phone, company, activity, industry)` — faqat oʻz qatorining xavfsiz ustunlari; `cashback_balance`/`total_spent`/`status` ga tegmaydi.

## 7. Yangiliklar

- Yangi `news_posts` jadvali: id, title, body, image_url, is_published (default true), published_at, created_by → profiles, timestamps.
- `news-images` public bucket (event-covers patterni).
- Dashboardda adminOnly `/yangiliklar` sahifasi (Faollik patterni): roʻyxat + yaratish/tahrirlash + publish toggle. `user_permissions` CHECK constraintiga tegilmaydi.

## 8. Mobil arxitektura

```
mobile/
├── app/                      # expo-router
│   ├── _layout.tsx           # fontlar, QueryClient, AuthProvider, guard
│   ├── (auth)/login.tsx
│   ├── (tabs)/               # Tadbirlar | Cashback | Yangiliklar | Profil
│   ├── event/[id].tsx
│   └── news/[id].tsx
├── lib/supabase/             # client, types (generated), queries/
├── hooks/                    # useEvents, useCashback, useProfile, useNews
├── components/ui/            # Button, Card, Badge, Skeleton — token asosida
├── context/AuthContext.tsx
├── theme/tokens.ts
└── assets/fonts/             # Geist .otf
```

Tiplar: root `gen:types` scripti `supabase gen types` natijasini `src/lib/supabase/types.ts` va `mobile/lib/supabase/types.ts` ga yozadi.

## 9. Dashboard qoʻshimchalari

- **Mijozlar**: "Akkaunt ochish" amali + `CreateMemberAccountModal` (email prefill, parol; `auth_user_id` mavjudda "Akkaunt mavjud" badge). `createMemberAccount` query (edge function chaqiruvi).
- **Tadbirlar**: yaratish/tahrirlash modalida `price` maydoni.
- **Yangiliklar**: 7-boʻlimdagi sahifa.

## 10. Xatolar bilan ishlash

- RPC xatolari oʻzbekcha matn bilan `RAISE EXCEPTION` — mobil toast/alert sifatida koʻrsatadi.
- Edge function xatolari JSON `{error}` oʻzbekcha (admin-create-user patterni).
- Mobil query xatolari: retry 1, xato holatida qayta urinish tugmasi bilan boʻsh holat ekrani.
- clients.email kolliziyasi: auth xatosi modalda koʻrsatiladi.

## 11. Tekshirish

1. `bun run supabase:reset` — 026–029 toza qoʻllanadi; cloudga pushdan oldin `(event_id, contact_id)` dublikat tekshiruvi.
2. RLS matritsa: anon (JWTsiz) → yopiq; aʼzo JWT → faqat oʻzi; hodim JWT → toʻliq. `register_for_event` ×2 → xato.
3. Dashboard regressiyasi (`bun run dev:local`): Mijozlar, Tadbirlar (paid → auto-award), CRM-N, Sozlamalar.
4. Webhook smoke-test (service role).
5. Mobil oqim: login → tadbir → roʻyxat → pending → dashboardda paid → ilovada cashback. Hodim akkaunti rad etiladi.
6. `bun run build` (web) + `bunx tsc --noEmit` (mobile).

## 12. Xavflar

- `user_type:'member'` metadata unutilsa aʼzo xodim profilini oladi — yagona yaratish yoʻli edge function, testda tekshiriladi.
- RLS almashinuvi dashboard regressiyasisiz cloudga chiqarilmaydi.
- `events.price` default 0 — mavjud tadbirlarga narxni hodimlar kiritadi.
