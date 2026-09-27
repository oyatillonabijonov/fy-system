# Bosqich 1 — Tozalash: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bo'limlar sahifasini, Yangiliklar'ni (web + mobil + DB) va bo'sh Bildirishnomalar menyusini olib tashlash.

**Architecture:** Faqat o'chirish ishi. Sahifa, route, sidebar yozuvi va faqat shu sahifalar ishlatgan hook/query'lar o'chiriladi. Mobilda News tabi, detal ekrani va bosh sahifadagi yangiliklar bloki o'chadi. DB uchun yangi migratsiya `049_remove_news.sql` yoziladi va sinaladi, lekin production'ga **faqat yangi mobil build tarqalgandan keyin** qo'llanadi.

**Tech Stack:** React 19 + Vite, TypeScript strict (`noUnusedLocals`), Expo SDK 56 (mobil), Supabase Postgres, bun.

**Spec:** `docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md` (§3)

## Global Constraints

- bun, npm emas. TypeScript strict, `any` yo'q.
- Eski migratsiya fayllari o'zgartirilmaydi, faqat yangisi qo'shiladi (`049`).
- UI matnlari o'zbekcha.
- **Faollik qoladi.** `department` tushunchasi, `Department` enum, Hodimlar va KPI qoladi.
- **Commit faqat foydalanuvchi tasdig'i bilan.** Tasklar faqat `git add` bilan tugaydi, commit Task 5 da bitta so'rov bilan qilinadi.
- SQL testlar faqat vaqtinchalik Docker stendda, **hech qachon production'da emas**.
- `bun run dev` production bazaga ulanadi. Bu bosqichda UI'ni brauzerda sinash shart emas (faqat o'chirish), tekshiruv `bun run build` bilan bo'ladi.

## Review Focus

- `/bolimlar` yoki `/yangiliklar` ga eski havola yoki bookmark orqali kirish → mavjud `path="*"` route `/dashboard` ga yo'naltirishi kerak (Task 1 va 2, Step "verify redirect").
- Mobil bosh sahifa yangiliklar blokisiz ham to'g'ri chiziladi: ortiqcha bo'shliq yoki ishlatilmay qolgan import yo'q (Task 3, tsc + lint).
- Mobil deep link `fyapp://news/<id>` (eski push/ulashish) → ekran yo'q bo'lsa, expo-router "Unmatched route" ko'rsatadi. Bu qabul qilinadi, alohida ishlov kerak emas (Task 3 izohi).
- 049 ni stendda ikki marta qo'llash xato bermasligi kerak (`IF EXISTS`) (Task 4 testi).
- Production'da `storage.objects`/`storage.buckets` dan to'g'ridan-to'g'ri DELETE storage triggeri bilan bloklanishi mumkin → migratsiya `storage.allow_delete_query` ni o'rnatadi. Baribir xato bo'lsa, `BEGIN/COMMIT` tufayli yarim holat qolmaydi (Task 4).

---

### Task 1: Bo'limlar sahifasini olib tashlash (web)

**Files:**
- Delete: `src/components/pages/Bolimlar.tsx`
- Modify: `src/App.tsx` (import 12-qator, `PAGE_META` `/bolimlar`, `<Route path="/bolimlar">`)
- Modify: `src/components/layout/Sidebar.tsx` (`Buildings` import, "Bo'limlar" item)
- Modify: `src/hooks/useUsers.ts` (`useDepartmentStats`, `DEPARTMENT_STATS_KEY`, importlar)
- Modify: `src/hooks/useKpi.ts` (`useDepartmentKpi`, `DEPARTMENT_KPI_KEY`, `useSetDepartmentHead`, importlar)
- Modify: `src/lib/supabase/queries/auth.ts` (`DepartmentStats`, `getDepartmentStats`)
- Modify: `src/lib/supabase/queries/kpi.ts` (`DepartmentKpi`, `getDepartmentKpi`, `setDepartmentHead`)

**Interfaces:**
- Consumes: —
- Produces: `useDepartmentHeads` / `getDepartmentHeads` **qoladi**. Ular ishlatilmaydi, lekin bu bizdan oldingi o'lik kod. O'chirilmaydi, yakuniy hisobotda eslatiladi.

- [ ] **Step 1: Hozirgi holat — build yashil ekanini tasdiqlash**

Run: `bun run build`
Expected: muvaffaqiyatli (exit 0). Qizil bo'lsa, to'xtab, foydalanuvchiga xabar berish kerak: bu bizdan oldingi xato.

- [ ] **Step 2: Sahifani va route'ni o'chirish**

```bash
git rm src/components/pages/Bolimlar.tsx
```

`src/App.tsx` dan shu uch bo'lakni olib tashlang:

```tsx
import { Bolimlar } from "./components/pages/Bolimlar"
```
```tsx
  '/bolimlar':      { title: "Bo'limlar",       desc: "Tizim bo'limlari va hodimlar boshqaruvi." },
```
```tsx
          <Route path="/bolimlar" element={
            <ProtectedRoute adminOnly><Bolimlar /></ProtectedRoute>
          } />
```

`src/components/layout/Sidebar.tsx` da import ro'yxatidan `    Buildings,` qatorini va shu qatorni olib tashlang:

```tsx
            { name: "Bo'limlar", icon: Buildings, path: "/bolimlar", adminOnly: true },
```

- [ ] **Step 3: Faqat Bo'limlar ishlatgan hook'larni o'chirish**

`src/hooks/useUsers.ts`: import ro'yxatidan `getDepartmentStats,` va `type DepartmentStats,` ni olib tashlang, shuningdek:

```ts
export const DEPARTMENT_STATS_KEY = ["department-stats"] as const

export function useDepartmentStats() {
  return useQuery<DepartmentStats[]>({
    queryKey: DEPARTMENT_STATS_KEY,
    queryFn: getDepartmentStats,
    staleTime: 1000 * 60 * 2,
  })
}
```

`src/hooks/useKpi.ts`: importdan `getDepartmentKpi,`, `setDepartmentHead,`, `type DepartmentKpi,` ni olib tashlang, shuningdek `DEPARTMENT_KPI_KEY` konstantasini, butun `useDepartmentKpi` funksiyasini va butun `useSetDepartmentHead` funksiyasini. `DEPARTMENT_HEADS_KEY`, `useDepartmentHeads` va `Department` importi qoladi.

- [ ] **Step 4: Query funksiyalarini o'chirish**

`src/lib/supabase/queries/auth.ts`: `// ─── Department aggregates ───` sarlavhasidan boshlab `DepartmentStats` interfeysi va `getDepartmentStats` funksiyasining oxirigacha (`getUserById` dan oldingi qatorgacha) olib tashlang. Agar `Department` importi ishlatilmay qolsa, `import type { Department } from "@/lib/constants/employee"` ni ham olib tashlang.

`src/lib/supabase/queries/kpi.ts`: `// ─── Department-level KPI rollup ───` bo'limini to'liq (`DepartmentKpi` + `getDepartmentKpi`) va `setDepartmentHead` funksiyasini olib tashlang. `getDepartmentHeads` qoladi.

- [ ] **Step 5: Qolgan havolalarni tekshirish**

Run: `grep -rnw "Bolimlar\|useDepartmentStats\|useDepartmentKpi\|useSetDepartmentHead\|getDepartmentStats\|getDepartmentKpi\|setDepartmentHead\|DepartmentStats\|DepartmentKpi\|/bolimlar" src --exclude=types.ts`
Expected: hech narsa topilmaydi.

- [ ] **Step 6: Build**

Run: `bun run build && bun run lint`
Expected: ikkalasi ham exit 0. `noUnusedLocals` ishlatilmay qolgan importni ko'rsatsa, o'sha importni olib tashlang.

- [ ] **Step 7: Verify redirect (kod bo'yicha)**

Run: `grep -n 'path="\*"' src/App.tsx`
Expected: `<Route path="*" element={<Navigate to="/dashboard" replace />} />` mavjud. Demak `/bolimlar` endi dashboard'ga yo'naltiriladi.

- [ ] **Step 8: Stage**

```bash
git add -A src/
```

---

### Task 2: Yangiliklar va Bildirishnomalar menyusini olib tashlash (web)

**Files:**
- Delete: `src/components/pages/Yangiliklar.tsx`, `src/hooks/useNews.ts`, `src/lib/supabase/queries/news.ts`
- Modify: `src/App.tsx` (import, `PAGE_META` `/yangiliklar`, route)
- Modify: `src/components/layout/Sidebar.tsx` (Yangiliklar item, butun "Bildirishnomalar" guruhi, ishlatilmay qolgan ikonkalar)

**Interfaces:**
- Consumes: Task 1 dagi `App.tsx`/`Sidebar.tsx` holati.
- Produces: —

- [ ] **Step 1: Fayllarni o'chirish**

```bash
git rm src/components/pages/Yangiliklar.tsx src/hooks/useNews.ts src/lib/supabase/queries/news.ts
```

- [ ] **Step 2: App.tsx**

Olib tashlang:

```tsx
import { Yangiliklar } from "./components/pages/Yangiliklar"
```
```tsx
  '/yangiliklar':   { title: 'Yangiliklar',     desc: "Klub yangiliklari — a'zolar mobil ilovada ko'radi." },
```
```tsx
          <Route path="/yangiliklar" element={
            <ProtectedRoute adminOnly><Yangiliklar /></ProtectedRoute>
          } />
```

Header'dagi `Bell` ikonkasiga (`App.tsx:159`) **tegilmaydi**: u sidebar menyusi emas.

- [ ] **Step 3: Sidebar.tsx**

Olib tashlang:

```tsx
            { name: "Yangiliklar", icon: Newspaper, path: "/yangiliklar", adminOnly: true },
```
```tsx
            {
                name: "Bildirishnomalar",
                icon: Bell,
                subItems: [
                    { name: "Barchasi", icon: SquaresFour },
                    { name: "Telegram Bot", icon: PaperPlaneRight },
                    { name: "SMS", icon: ChatTeardropDots },
                    { name: "Email", icon: Envelope },
                    { name: "Ilova", icon: DeviceMobile },
                ],
            },
```

Import ro'yxatidan `Bell,`, `PaperPlaneRight,`, `ChatTeardropDots,`, `Envelope,`, `DeviceMobile,`, `Newspaper,` ni olib tashlang. **`SquaresFour` qoladi**: uni Boshqaruv ishlatadi.

- [ ] **Step 4: Qolgan havolalarni tekshirish**

Run: `grep -rn "Yangiliklar\|useNews\|queries/news\|/yangiliklar\|Bildirishnomalar" src --exclude=types.ts`
Expected: hech narsa topilmaydi.

- [ ] **Step 5: Build**

Run: `bun run build && bun run lint`
Expected: exit 0.

- [ ] **Step 6: Stage**

```bash
git add -A src/
```

---

### Task 3: Yangiliklarni mobil ilovadan olib tashlash

**Files:**
- Delete: `mobile/src/app/(tabs)/news.tsx`, `mobile/src/app/news/[id].tsx`, `mobile/src/hooks/useNews.ts`, `mobile/src/lib/supabase/queries/news.ts`
- Modify: `mobile/src/app/(tabs)/_layout.tsx` (`<Tabs.Screen name="news">`)
- Modify: `mobile/src/app/_layout.tsx:39` (`<Stack.Screen name="news/[id]" />`)
- Modify: `mobile/src/app/(tabs)/index.tsx` (import, `newsQuery`, `latestNews`, "So'nggi yangiliklar" bloki, `news*` style'lar)

**Interfaces:**
- Consumes: —
- Produces: —

- [ ] **Step 1: Hozirgi holat**

Run: `cd mobile && bunx tsc --noEmit && bun run lint`
Expected: exit 0. Qizil bo'lsa, oldingi xatolarni yozib qo'ying: ular bizniki emas va bizning natijamiz ular bilan solishtiriladi.

- [ ] **Step 2: Fayllarni o'chirish**

```bash
git rm "mobile/src/app/(tabs)/news.tsx" "mobile/src/app/news/[id].tsx" mobile/src/hooks/useNews.ts mobile/src/lib/supabase/queries/news.ts
```

- [ ] **Step 3: Navigatsiya**

`mobile/src/app/(tabs)/_layout.tsx` dan olib tashlang:

```tsx
      <Tabs.Screen
        name="news"
        options={{
          title: "Yangiliklar",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "newspaper" : "newspaper-outline"} color={color} size={size} />
          ),
        }}
      />
```

`mobile/src/app/_layout.tsx` dan olib tashlang:

```tsx
        <Stack.Screen name="news/[id]" />
```

- [ ] **Step 4: Bosh sahifa**

`mobile/src/app/(tabs)/index.tsx`:
- `import { useNews } from "@/hooks/useNews"` ni olib tashlang.
- `const newsQuery = useNews()` va `const latestNews = (newsQuery.data ?? []).slice(0, 2)` ni olib tashlang.
- `{/* Latest news */}` izohidan boshlab `<SectionHeader title="So'nggi yangiliklar" …/>` va undan keyingi `{latestNews.length === 0 ? (…) : (…)}` blokini to'liq olib tashlang (`</ScrollView>` dan oldingi qismgacha).
- `styles` ichidan `newsCard`, `newsThumb`, `newsThumbFallback`, `newsBody`, `newsTitle`, `newsDate` ni olib tashlang.
- Import `{ formatDate, formatDateTime, formatMoney }` → `{ formatDateTime, formatMoney }` (`formatDate` faqat yangiliklarda ishlatilgan edi).
- `SectionHeader`, `Pressable`, `Image`, `Ionicons`, `router`, `colors.border` hali boshqa joyda ishlatiladimi, tekshiring:

Run: `grep -n "SectionHeader\|<Pressable\|<Image\|<Ionicons\|router\.\|emptyCard\|emptyText" "mobile/src/app/(tabs)/index.tsx"`
Har biri kamida bir marta (importdan tashqari) ishlatilishi kerak. Ishlatilmay qolganini importdan olib tashlang.

Eski `fyapp://news/<id>` deep link'lari endi "Unmatched route" ko'rsatadi. Bu qabul qilinadi (Review Focus).

- [ ] **Step 5: Tekshirish**

Run: `grep -rn "useNews\|queries/news\|news/\|\"news\"" mobile/src --exclude=types.ts`
Expected: hech narsa topilmaydi.

Run: `cd mobile && bunx tsc --noEmit && bun run lint`
Expected: Step 1 dagidan ko'p xato bo'lmasligi kerak.

- [ ] **Step 6: Simulyatorda ko'rish**

`mobile` ni iOS simulyatorda ishga tushiring (foydalanuvchining odatiy usuli: `bunx expo run:ios`). Tab bar'da 4 ta tab (Bosh, Tadbirlar, Cashback, Profil) bo'lishi kerak. Bosh sahifa yangiliklar blokisiz, bo'sh joysiz chiziladi. Ekran rasmini foydalanuvchiga ko'rsating.

- [ ] **Step 7: Stage**

```bash
git add -A mobile/src/
```

---

### Task 4: Migratsiya 049 — `news_posts` va `news-images` ni o'chirish

**Files:**
- Create: `supabase/migrations/049_remove_news.sql`
- Test: `supabase/tests/049_remove_news_test.sql`

**Interfaces:**
- Consumes: 029 (`news_posts`, `"news-images all"` policy, bucket), 048 (bucket qatori).
- Produces: —

- [ ] **Step 1: Test yozish**

`supabase/tests/049_remove_news_test.sql`:

```sql
-- Behavioural test for migration 049 (news removal).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests"). Run:
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql

DO $$
BEGIN
  IF to_regclass('public.news_posts') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: public.news_posts hali mavjud';
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL
     AND EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'news-images') THEN
    RAISE EXCEPTION 'FAIL: news-images bucket qatori hali mavjud';
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'storage' AND tablename = 'objects'
                   AND policyname = 'news-images all') THEN
    RAISE EXCEPTION 'FAIL: "news-images all" policy hali mavjud';
  END IF;

  RAISE NOTICE 'PASS: 049 — yangiliklar to''liq olib tashlangan';
END $$;
```

- [ ] **Step 2: Stendni ko'tarish va testni eski sxemada qizil ekanini ko'rish**

Stendni CLAUDE.md §5 "Tests" dagi retsept bo'yicha ko'taring (`fy-test` konteyneri, auth stub, `001`–`048` ni qo'llash; storage migratsiyalaridagi xatolar kutilgan).

```bash
docker cp supabase/tests/049_remove_news_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql; echo "exit=$?"
```
Expected: `FAIL: public.news_posts hali mavjud`, `exit=3`.

- [ ] **Step 3: Migratsiyani yozish**

`supabase/migrations/049_remove_news.sql`:

```sql
-- 049: remove the news feature (web page + mobile tab removed in the same release).
-- ⚠️ Apply to production ONLY after the mobile build without the News tab is
-- live — older installed builds still query news_posts.
-- Image files stay on the storage container's disk (/var/lib/storage/stub/news-images/);
-- delete them by hand if wanted.

BEGIN;

DROP TABLE IF EXISTS public.news_posts;

-- storage.* is absent on the throwaway test stand, so guard it.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    -- Newer storage images block direct DELETE unless this is set; a no-op
    -- custom GUC where no such trigger exists.
    PERFORM set_config('storage.allow_delete_query', 'true', true);
    DROP POLICY IF EXISTS "news-images all" ON storage.objects;
    DELETE FROM storage.objects WHERE bucket_id = 'news-images';
    DELETE FROM storage.buckets WHERE id = 'news-images';
  END IF;
END $$;

COMMIT;
```

- [ ] **Step 4: Qo'llash va testni yashil ekanini ko'rish (ikki marta — idempotentlik)**

```bash
for i in 1 2; do
  docker cp supabase/migrations/049_remove_news.sql fy-test:/tmp/m.sql
  docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql; echo "apply $i exit=$?"
done
docker cp supabase/tests/049_remove_news_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql; echo "exit=$?"
docker rm -f fy-test
```
Expected: `apply 1 exit=0`, `apply 2 exit=0`, `PASS: 049 …`, `exit=0`.

- [ ] **Step 5: Stage**

```bash
git add supabase/migrations/049_remove_news.sql supabase/tests/049_remove_news_test.sql
```

**Production'ga qo'llash bu rejaga kirmaydi.** Yangi mobil build tarqalgach, foydalanuvchi tasdig'i bilan quyidagilar bajariladi:
1. Backup (CLAUDE.md §5).
2. **Quruq sinov (dry-run).** Storage qismi test stendida sinalmagan (stendda storage sxemasi yo'q), shuning uchun avval o'zgarishsiz ishga tushiriladi: `sed 's/^COMMIT;/ROLLBACK;/' supabase/migrations/049_remove_news.sql | ssh … 'cat > /tmp/m.sql && docker cp /tmp/m.sql supabase-db-1:/tmp/m.sql && docker exec supabase-db-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/m.sql'`. Xatosiz tugasa, keyingi qadamga o'tiladi. Storage DELETE bloklansa, bu yerda to'xtab, triggerni `select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid in ('storage.objects'::regclass,'storage.buckets'::regclass) and not tgisinternal;` bilan tekshiriladi. 049 hali hech qayerda qo'llanmagani uchun uni shu holatda tuzatish mumkin (qo'llangan migratsiyalar o'zgartirilmaydi).
3. 049 ni qo'llash (xato bo'lsa, `BEGIN/COMMIT` tufayli hech narsa o'zgarmaydi), `schema_migrations` ga `'049'` yozish, `docker restart supabase-rest-1`.

---

### Task 5: CLAUDE.md va yakuniy tekshiruv

**Files:**
- Modify: `CLAUDE.md` (§6 Routing qatori, §7 Storage buckets qatori)

- [ ] **Step 1: CLAUDE.md**

§6 Routing qatorida:
`(Hodimlar, Bolimlar, Faollik, Yangiliklar)` → `(Hodimlar, Faollik)`

§7 Storage buckets qatorida:
`` `profile-avatars` (`021`), `news-images` (`029`); `` → `` `profile-avatars` (`021`); `news-images` (`029`) removed in `049` (news feature dropped); ``

- [ ] **Step 2: Yakuniy tekshiruv**

Run: `bun run build && bun run lint && (cd mobile && bunx tsc --noEmit && bun run lint)`
Expected: exit 0 (mobil — Task 3 Step 1 dagidan ko'p xato yo'q).

Run: `git status --short`
Expected: faqat Task 1–5 dagi fayllar.

- [ ] **Step 3: Commit — foydalanuvchi tasdig'i bilan**

Foydalanuvchiga `git diff --cached --stat` ni ko'rsatib, tasdiq so'rang. Tasdiq bo'lgach:

```bash
git add CLAUDE.md
git commit -m "chore: remove Bo'limlar, Yangiliklar (web+mobile) and Bildirishnomalar menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Yakuniy hisobotda quyidagilarni eslatish kerak (o'chirilmaydi):
- `useDepartmentHeads` / `getDepartmentHeads` va `department_heads` jadvali endi hech qayerda ishlatilmaydi. Bu bizdan oldingi o'lik kod.
- Header'dagi `Bell` ikonkasi hech narsa qilmaydi.
- 049 production'ga faqat yangi mobil build tarqalgach qo'llanadi.
