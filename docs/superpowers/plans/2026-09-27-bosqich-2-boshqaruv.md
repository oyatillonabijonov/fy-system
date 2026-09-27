# Bosqich 2 — Boshqaruv (tariflar, sotuvchi, yangi mijoz) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boshqaruv — hodim darajasidagi sahifa. Tadbirda bir nechta tarif bo'ladi. Mijoz tadbirga tarif va sotuvchi bilan yoziladi (mavjud **yoki** yangi mijoz). Boshqaruvda pul kiritilmaydi va ko'rsatilmaydi.

**Architecture:**
- Yangi `event_tariffs` jadvali va ishtirokchida `tariff_id` / `seller_id` ustunlari.
- Yozilish faqat bitta `SECURITY DEFINER` RPC orqali bo'ladi: `enroll_participant`. U mijozni topadi yoki yaratadi, tarifni tekshiradi, narxni tarifdan qo'yadi va hammasini bitta tranzaksiyada bajaradi.
- Frontend yangi jadval va RPC'ga tipsiz klient orqali murojaat qiladi (`community.ts` dagi naqsh), chunki `types.ts` hali qayta generatsiya qilinmagan.

**Tech Stack:** React 19 + Vite, TanStack Query 5, TypeScript strict, Supabase Postgres (plpgsql), bun.

**Spec:** `docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md` (§4, §5.1)

## Global Constraints

- bun; TypeScript strict, `any` yo'q; `verbatimModuleSyntax` (`import type`); `erasableSyntaxOnly` (constructor parameter property **yo'q**).
- Eski migratsiyalar o'zgartirilmaydi — faqat `050_event_tariffs.sql` qo'shiladi.
- Yangi `SECURITY DEFINER` funksiyalar `SET search_path = public, pg_temp` bilan (019 naqshi).
- UI matnlari o'zbekcha; radius `rounded-[8px]`; ikonkalar `@phosphor-icons/react`; native element (masalan `<select>`) kutubxonadan afzal.
- Boshqaruvda **to'langan summa, qarz, keshbek ko'rsatilmaydi**. Tarif nomi va narxi ko'rsatiladi (foydalanuvchi qarori).
- Sotuvchi — `profiles.department = 'sotuv'` va faol. Yangi yozilishda majburiy.
- **Commit faqat foydalanuvchi tasdig'i bilan** — tasklar `git add` bilan tugaydi, commit Task 7 da.
- SQL testlar faqat vaqtinchalik Docker stendda. UI faqat **mahalliy** Supabase stekida (`bun run dev:local`); `bun run dev` production'ga ulanadi — ishlatilmaydi.

## Spec'dan og'ishlar (ongli, foydalanuvchi rejani ko'rib chiqishda tasdiqlaydi)

1. `event_participants.tariff_id` FK — spec'dagi `ON DELETE RESTRICT` o'rniga **`NO ACTION`** (default). RESTRICT darhol tekshiriladi, shuning uchun tadbirni o'chirganda (tariflar va ishtirokchilar ikkalasi ham CASCADE) tarif ishtirokchidan oldin o'chsa, butun o'chirish yiqiladi. NO ACTION esa statement oxirida tekshiriladi. Natija bir xil: ishtirokchisi bor tarifni alohida o'chirib bo'lmaydi.
2. `event_tariffs` ga yozish policy'si `is_staff` — `events` jadvali bilan bir xil darajada (028). Spec "tadbirlar edit huquqi" degan edi, lekin `events` ning o'zi ham shunchaki staff darajasida ochiq. Tariflarni tadbirdan qattiqroq yopish mantiqsiz.
3. To'lovi bor ishtirokchini o'chirishni **bazada** bloklovchi trigger spec bo'yicha 051 ga (3-bosqich) tegishli. Bu bosqichda faqat UI to'sig'i bor: ishtirokchini o'chirish va tadbirni o'chirishda.
4. "Tadbir uchun tariflar mavjudmi?" belgisi UI'dan olib tashlanadi (endi har tadbirda kamida 1 tarif bor). `events.has_tariffs` va `event_participants.tariff` (matn) ustunlari bazada qoladi va ishlatilmaydi.
5. "Tadbir qiymati" (`total_value`) maydoni tadbir formasida **qoladi**. Bu kuzatiladigan pul emas, reja ko'rsatkichi. Foydalanuvchi boshqacha qaror qilsa, alohida o'zgarish sifatida olib tashlanadi.
6. Tarifni o'chirish rad etilsa, xabarda ishtirokchilar **soni** ko'rsatilmaydi (spec: "Bu tarifda N ishtirokchi bor"), faqat sababi aytiladi. Sonni olish uchun alohida so'rov kerak bo'lardi — qiymati kichik.

## Review Focus

- Bir vaqtda ikki marta "Qo'shish" bosilsa, bitta mijoz tadbirga ikki marta yozilishi mumkin: `(event_id, contact_id)` bo'yicha unique indeks yo'q, prod'da dublikat bo'lishi mumkin. Tugma `isPending` da o'chiriladi (Task 5); RPC ichidagi `already_enrolled` tekshiruvi ketma-ket chaqiruvni ushlaydi (Task 1 testi T4).
- Telefon turli formatda kiritilsa (`90 123 45 67`, `+998901234567`, `998-90-123-45-67`), bitta mijoz deb topilishi kerak (Task 1 testi T3).
- Tarif narxi keyin o'zgartirilsa, avval yozilganlarning narxi o'zgarmasligi kerak (Task 1 testi T11; UI izohi Task 4).
- Tadbirda tarif yo'q (eski tadbir) yoki Sotuv bo'limida faol hodim yo'q: yozilish oynasi aniq xabar ko'rsatadi va saqlashga yo'l qo'ymaydi (Task 5).
- Tarifi bo'lgan tadbirni o'chirish muvaffaqiyatli bo'lishi kerak (FK NO ACTION), faqat ishtirokchisi bor tarifni alohida o'chirish rad etilishi kerak (Task 1 testlari T8, T9).

---

### Task 1: Migratsiya 050 — tariflar, sotuvchi, `enroll_participant`

**Files:**
- Create: `supabase/tests/050_event_tariffs_test.sql`
- Create: `supabase/migrations/050_event_tariffs.sql`

**Interfaces:**
- Produces (DB):
  - `public.event_tariffs(id uuid, event_id uuid, name text, price numeric(12,2), sort_order int, created_at timestamptz)`
  - `event_participants.tariff_id uuid NULL`, `event_participants.seller_id uuid NULL`
  - `public.enroll_participant(p_event_id uuid, p_tariff_id uuid, p_seller_id uuid, p_client_id uuid DEFAULT NULL, p_full_name text DEFAULT NULL, p_phone text DEFAULT NULL) RETURNS uuid`
  - Xato matnlari (exception message) aynan quyidagilar: `forbidden: staff_only`, `tariff_mismatch`, `seller_invalid`, `client_not_found`, `client_required`, `client_exists:<uuid>:<full_name>`, `already_enrolled`.

- [ ] **Step 1: Testni yozish**

`supabase/tests/050_event_tariffs_test.sql`:

```sql
-- Behavioural tests for migration 050 (event tariffs + seller + enroll_participant).
-- THROWAWAY DB only (recipe: CLAUDE.md §5 "Tests"). Run:
--   docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql
-- Every block RAISEs on failure; the last line prints on success.
\set ON_ERROR_STOP on

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('50000000-0000-0000-0000-000000000001', 'staff50@fy.uz',  '{"full_name":"Staff","role":"xodim"}'::jsonb),
  ('50000000-0000-0000-0000-000000000002', 'seller50@fy.uz', '{"full_name":"Sotuvchi","role":"xodim"}'::jsonb),
  ('50000000-0000-0000-0000-000000000003', 'mkt50@fy.uz',    '{"full_name":"Marketolog","role":"xodim"}'::jsonb),
  ('50000000-0000-0000-0000-000000000004', 'member50@fy.uz', '{"full_name":"Member","user_type":"member"}'::jsonb);
UPDATE public.profiles SET department = 'sotuv'     WHERE id = '50000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET department = 'marketing' WHERE id = '50000000-0000-0000-0000-000000000003';

INSERT INTO public.events (id, name, cashback_percent) VALUES
  ('e5000000-0000-0000-0000-000000000001', 'Event A', 5),
  ('e5000000-0000-0000-0000-000000000002', 'Event B', 5);
INSERT INTO public.event_tariffs (id, event_id, name, price, sort_order) VALUES
  ('7a000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000001', 'Standart', 17000000, 0),
  ('7a000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-000000000001', 'VIP',      25000000, 1),
  ('7a000000-0000-0000-0000-00000000000c', 'e5000000-0000-0000-0000-000000000002', 'Standart', 10000000, 0);
INSERT INTO public.clients (id, full_name, phone) VALUES
  ('c5000000-0000-0000-0000-000000000001', 'Mavjud Mijoz', '+998901112233');

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', p::text, false)::void $$;

-- ─── T1: negative tariff price is rejected ──────────────────────────────────
DO $$
BEGIN
  INSERT INTO public.event_tariffs (event_id, name, price)
  VALUES ('e5000000-0000-0000-0000-000000000001', 'Minus', -1);
  RAISE EXCEPTION 'T1 FAILED: manfiy narx qabul qilindi';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'T1 ok: manfiy narx rad etildi';
END $$;

-- ─── T2: new client → client + participant (price/tariff/seller from args) ──
DO $$
DECLARE v_pid uuid; r record;
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  v_pid := public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000b',
    '50000000-0000-0000-0000-000000000002', NULL, '  Yangi Mijoz ', '90 555 66 77');
  SELECT ep.price, ep.paid, ep.tariff_id, ep.seller_id, ep.full_name, c.phone, c.events_count
    INTO r
  FROM public.event_participants ep JOIN public.clients c ON c.id = ep.contact_id
  WHERE ep.id = v_pid;
  IF r.price <> 25000000 OR r.paid <> 0
     OR r.tariff_id <> '7a000000-0000-0000-0000-00000000000b'
     OR r.seller_id <> '50000000-0000-0000-0000-000000000002'
     OR r.full_name <> 'Yangi Mijoz' OR r.phone <> '+998905556677' OR r.events_count <> 1 THEN
    RAISE EXCEPTION 'T2 FAILED: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'T2 ok: yangi mijoz yaratildi va VIP narxi bilan yozildi';
END $$;

-- ─── T3: phone in another format → client_exists with the existing id ──────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000002', NULL, 'Boshqa Ism', '998-90-111-22-33');
  RAISE EXCEPTION 'T3 FAILED: dublikat telefon qabul qilindi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'client_exists:c5000000-0000-0000-0000-000000000001:Mavjud Mijoz' THEN
    RAISE EXCEPTION 'T3 FAILED: kutilmagan xato: %', SQLERRM;
  END IF;
  RAISE NOTICE 'T3 ok: %', SQLERRM;
END $$;

-- ─── T4: existing client twice → already_enrolled ───────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000a',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'T4 FAILED: ikki marta yozildi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'already_enrolled' THEN RAISE EXCEPTION 'T4 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T4 ok: already_enrolled';
END $$;

-- ─── T5: tariff of another event → tariff_mismatch ──────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'T5 FAILED: begona tarif qabul qilindi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'tariff_mismatch' THEN RAISE EXCEPTION 'T5 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T5 ok: tariff_mismatch';
END $$;

-- ─── T6: seller outside Sotuv → seller_invalid, and NO client left behind ───
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.enroll_participant(
      'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
      '50000000-0000-0000-0000-000000000003', NULL, 'Yarim Qolgan', '+998907770000');
    RAISE EXCEPTION 'T6 FAILED: marketolog sotuvchi bo''ldi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'seller_invalid' THEN RAISE EXCEPTION 'T6 FAILED: %', SQLERRM; END IF;
  END;
  SELECT count(*) INTO v_cnt FROM public.clients WHERE phone = '+998907770000';
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'T6 FAILED: xatodan keyin mijoz qolib ketdi'; END IF;
  RAISE NOTICE 'T6 ok: seller_invalid, mijoz yaratilmadi';
END $$;

-- ─── T7: non-staff (member) → forbidden ─────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000004');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'T7 FAILED: a''zo yozdi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'forbidden: staff_only' THEN RAISE EXCEPTION 'T7 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T7 ok: forbidden';
END $$;

-- ─── T8: tariff with participants cannot be deleted on its own ──────────────
DO $$
BEGIN
  DELETE FROM public.event_tariffs WHERE id = '7a000000-0000-0000-0000-00000000000a';
  RAISE EXCEPTION 'T8 FAILED: ishtirokchisi bor tarif o''chdi';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE 'T8 ok: FK tarifni himoya qildi';
END $$;

-- ─── T9: missing name / junk phone for a new client → client_required ───────
DO $$
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  PERFORM public.enroll_participant(
    'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', NULL, 'Ism', 'yo''q');
  RAISE EXCEPTION 'T9 FAILED: yaroqsiz telefon qabul qilindi';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'client_required' THEN RAISE EXCEPTION 'T9 FAILED: %', SQLERRM; END IF;
  RAISE NOTICE 'T9 ok: client_required';
END $$;

-- ─── T10: deleting an event with tariffs + participants succeeds ────────────
DO $$
DECLARE v_left int;
BEGIN
  DELETE FROM public.events WHERE id = 'e5000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_left FROM public.event_tariffs WHERE event_id = 'e5000000-0000-0000-0000-000000000001';
  IF v_left <> 0 THEN RAISE EXCEPTION 'T10 FAILED: tariflar qoldi'; END IF;
  RAISE NOTICE 'T10 ok: tadbir tariflari va ishtirokchilari bilan o''chdi';
END $$;

-- ─── T11: later tariff price change does not touch enrolled participants ────
DO $$
DECLARE v_pid uuid; v_price numeric;
BEGIN
  PERFORM pg_temp.as_user('50000000-0000-0000-0000-000000000001');
  v_pid := public.enroll_participant(
    'e5000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-00000000000c',
    '50000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001');
  UPDATE public.event_tariffs SET price = 99000000 WHERE id = '7a000000-0000-0000-0000-00000000000c';
  SELECT price INTO v_price FROM public.event_participants WHERE id = v_pid;
  IF v_price <> 10000000 THEN RAISE EXCEPTION 'T11 FAILED: narx % bo''lib qoldi', v_price; END IF;
  RAISE NOTICE 'T11 ok: yozilgan narx o''zgarmadi';
END $$;

SELECT '050: hamma testlar o''tdi ✓' AS natija;
```

- [ ] **Step 2: Stendni ko'tarish (001–049) va testni qizil ekanini ko'rish**

CLAUDE.md §5 "Tests" retsepti: `fy-test` konteyneri, auth stub (`permission denied for schema auth` chiqsa, `auth.users` image'da allaqachon bor — davom etiladi), keyin `supabase/migrations/0[0-4]*.sql`. Kutilgan xatolar: 013/014/016/019/021/025/029/042/048.

```bash
docker cp supabase/tests/050_event_tariffs_test.sql fy-test:/tmp/t.sql
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql; echo "exit=$?"
```
Expected: `relation "public.event_tariffs" does not exist`, `exit=3`.

- [ ] **Step 3: Migratsiyani yozish**

`supabase/migrations/050_event_tariffs.sql`:

```sql
-- 050: event tariffs + participant seller; enrolment goes through one RPC.
-- Spec: docs/superpowers/specs/2026-09-27-tadbirlar-moliya-design.md §5.1

BEGIN;

-- ─── event_tariffs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_tariffs (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid          NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name       text          NOT NULL CHECK (btrim(name) <> ''),
  price      numeric(12,2) NOT NULL CHECK (price >= 0),
  sort_order int           NOT NULL DEFAULT 0,
  created_at timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_tariffs_event ON public.event_tariffs (event_id, sort_order);

ALTER TABLE public.event_tariffs ENABLE ROW LEVEL SECURITY;
-- Same level as the events table itself (028): staff read and write.
CREATE POLICY "event_tariffs select staff" ON public.event_tariffs
  FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "event_tariffs insert staff" ON public.event_tariffs
  FOR INSERT WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "event_tariffs update staff" ON public.event_tariffs
  FOR UPDATE USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "event_tariffs delete staff" ON public.event_tariffs
  FOR DELETE USING (public.is_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_tariffs TO authenticated;

-- ─── event_participants: tariff + seller ─────────────────────────────────────
-- NO ACTION (not RESTRICT): it is checked at statement end, so deleting an event
-- cascades tariffs and participants together; a lone tariff with participants
-- still can't be deleted.
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES public.event_tariffs(id),
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_event_participants_tariff ON public.event_participants (tariff_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_seller ON public.event_participants (seller_id);

-- ─── enroll_participant ──────────────────────────────────────────────────────
-- Existing client (p_client_id) OR new client (p_full_name + p_phone). The price
-- is copied from the tariff at enrolment — later tariff edits don't reprice.
CREATE OR REPLACE FUNCTION public.enroll_participant(
  p_event_id  uuid,
  p_tariff_id uuid,
  p_seller_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price       numeric(12,2);
  v_client      public.clients%ROWTYPE;
  v_phone       text;
  v_participant uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: staff_only';
  END IF;

  SELECT price INTO v_price
  FROM public.event_tariffs
  WHERE id = p_tariff_id AND event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tariff_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_seller_id AND department = 'sotuv' AND COALESCE(is_active, true)
  ) THEN
    RAISE EXCEPTION 'seller_invalid';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'client_not_found';
    END IF;
  ELSE
    -- normalize_phone is best-effort (043 note): demand real digits, or junk
    -- like '-' would glue unrelated people onto one client.
    v_phone := public.normalize_phone(COALESCE(p_phone, ''));
    IF btrim(COALESCE(p_full_name, '')) = '' OR v_phone !~ '^\+?\d{9,15}$' THEN
      RAISE EXCEPTION 'client_required';
    END IF;

    SELECT * INTO v_client FROM public.clients WHERE phone = v_phone;
    IF FOUND THEN
      RAISE EXCEPTION 'client_exists:%:%', v_client.id, v_client.full_name;
    END IF;

    INSERT INTO public.clients (full_name, phone, status)
    VALUES (btrim(p_full_name), v_phone, 'Faol')
    RETURNING * INTO v_client;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = p_event_id AND contact_id = v_client.id
  ) THEN
    RAISE EXCEPTION 'already_enrolled';
  END IF;

  INSERT INTO public.event_participants (
    event_id, contact_id, full_name, phone, email, company, role, photo_url,
    price, paid, attended, tariff_id, seller_id
  ) VALUES (
    p_event_id, v_client.id, v_client.full_name, v_client.phone, v_client.email,
    v_client.company, v_client.role, v_client.image,
    v_price, 0, false, p_tariff_id, p_seller_id
  )
  RETURNING id INTO v_participant;

  RETURN v_participant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enroll_participant(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.enroll_participant(uuid, uuid, uuid, uuid, text, text) TO authenticated, service_role;

COMMIT;
```

- [ ] **Step 4: Qo'llash va testni yashil ekanini ko'rish**

```bash
docker cp supabase/migrations/050_event_tariffs.sql fy-test:/tmp/m.sql
docker exec fy-test psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f /tmp/m.sql; echo "apply exit=$?"
docker exec fy-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql; echo "exit=$?"
```
Expected: `apply exit=0`, T1–T11 `ok`, `050: hamma testlar o'tdi ✓`, `exit=0`. Qizil test bo'lsa, `superpowers:systematic-debugging`.

- [ ] **Step 5: Stendni tozalash va stage**

050 qayta qo'llanmaydi (`CREATE POLICY` ikkinchi marta xato beradi — 029/035 kabi, migratsiyalar bir marta qo'llanadi).

```bash
docker rm -f fy-test
git add supabase/migrations/050_event_tariffs.sql supabase/tests/050_event_tariffs_test.sql
```

---

### Task 2: Query qatlami — tariflar va yozilish

**Files:**
- Create: `src/lib/supabase/queries/tariffs.ts`
- Modify: `src/lib/supabase/queries/events.ts` (`Participant` tipi, `getParticipants`, `addExistingContactToEvent` → `enrollParticipant`)

**Interfaces:**
- Consumes: Task 1 dagi DB nomlari va xato matnlari.
- Produces:
  - `tariffs.ts`: `interface EventTariff { id: string; event_id: string; name: string; price: number; sort_order: number }`, `interface TariffDraft { id?: string; name: string; price: number }`, `getEventTariffs(eventId: string): Promise<EventTariff[]>`, `saveEventTariffs(eventId: string, drafts: TariffDraft[]): Promise<void>`
  - `events.ts`: `Participant` ga `tariff_id: string | null; seller_id: string | null; tariff_name: string | null; seller_name: string | null`
  - `events.ts`: `type EnrollClient = { clientId: string } | { fullName: string; phone: string }`, `interface EnrollInput { eventId: string; tariffId: string; sellerId: string; client: EnrollClient }`, `class ClientExistsError extends Error { clientId: string; clientName: string }`, `enrollParticipant(input: EnrollInput): Promise<string>`

- [ ] **Step 1: `tariffs.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 050
// (same trick as community.ts); drop the cast once types.ts is regenerated.
const db = supabase as unknown as SupabaseClient

export interface EventTariff {
  id: string
  event_id: string
  name: string
  price: number
  sort_order: number
}

export interface TariffDraft {
  id?: string
  name: string
  price: number
}

export async function getEventTariffs(eventId: string): Promise<EventTariff[]> {
  const { data, error } = await db
    .from("event_tariffs")
    .select("id, event_id, name, price, sort_order")
    .eq("event_id", eventId)
    .order("sort_order")
  if (error) throw error
  return ((data ?? []) as EventTariff[]).map((t) => ({ ...t, price: Number(t.price) }))
}

// Makes the event's tariff list equal `drafts` (array order = sort_order).
// ponytail: delete + update + insert are three requests, not one transaction —
// a mid-way network failure leaves a partial list the user can re-save; move to
// an RPC if that ever bites.
export async function saveEventTariffs(eventId: string, drafts: TariffDraft[]): Promise<void> {
  const keepIds = drafts.flatMap((d) => (d.id ? [d.id] : []))

  let del = db.from("event_tariffs").delete().eq("event_id", eventId)
  if (keepIds.length > 0) del = del.not("id", "in", `(${keepIds.join(",")})`)
  const { error: delErr } = await del
  if (delErr) {
    if (delErr.code === "23503") {
      throw new Error("O'chirilgan tarifda ishtirokchilar bor. Avval ularning tarifini almashtiring")
    }
    throw delErr
  }

  const rows = drafts.map((d, i) => ({ event_id: eventId, name: d.name.trim(), price: d.price, sort_order: i, id: d.id }))
  const existing = rows.filter((r) => r.id)
  const fresh = rows
    .filter((r) => !r.id)
    .map((r) => ({ event_id: r.event_id, name: r.name, price: r.price, sort_order: r.sort_order }))

  if (existing.length > 0) {
    const { error } = await db.from("event_tariffs").upsert(existing)
    if (error) throw error
  }
  if (fresh.length > 0) {
    const { error } = await db.from("event_tariffs").insert(fresh)
    if (error) throw error
  }
}
```

- [ ] **Step 2: `events.ts` — `Participant` va `getParticipants`**

Import qo'shing: `import type { SupabaseClient } from "@supabase/supabase-js"` va fayl boshiga:

```ts
// ponytail: untyped client for columns added in 050 (tariff_id, seller_id) until
// `bun run gen:types`; drop once types.ts is regenerated.
const db = supabase as unknown as SupabaseClient
```

`Participant` interfeysiga (`created_at` dan oldin) qo'shing:

```ts
  tariff_id: string | null
  seller_id: string | null
  tariff_name: string | null
  seller_name: string | null
```

`getParticipants` ni quyidagiga almashtiring:

```ts
export async function getParticipants(eventId: string): Promise<Participant[]> {
  const { data, error } = await db
    .from("event_participants")
    .select("id, event_id, contact_id, full_name, phone, email, company, role, photo_url, notes, price, paid, attended, sort_order, cashback_percent, cashback_earned, cashback_used, created_at, tariff_id, seller_id, clients(activity), tariff:tariff_id(name), seller:seller_id(full_name)")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("created_at")

  if (error) throw error

  type Row = Omit<Participant, "activity" | "tariff_name" | "seller_name"> & {
    clients: { activity: string | null } | null
    tariff: { name: string } | null
    seller: { full_name: string } | null
  }

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    event_id: row.event_id ?? eventId,
    contact_id: row.contact_id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    role: row.role,
    photo_url: row.photo_url,
    notes: row.notes,
    activity: row.clients?.activity ?? null,
    price: row.price,
    paid: row.paid,
    attended: row.attended,
    sort_order: row.sort_order ?? 0,
    cashback_percent: row.cashback_percent,
    cashback_earned: row.cashback_earned ?? 0,
    cashback_used: row.cashback_used ?? 0,
    tariff_id: row.tariff_id,
    seller_id: row.seller_id,
    tariff_name: row.tariff?.name ?? null,
    seller_name: row.seller?.full_name ?? null,
    created_at: row.created_at ?? new Date().toISOString(),
  }))
}
```

- [ ] **Step 3: `events.ts` — `addExistingContactToEvent` o'rniga `enrollParticipant`**

`addExistingContactToEvent` funksiyasini to'liq olib tashlang (uning yagona foydalanuvchisi `useEnrollParticipant`, u Task 3 da yangilanadi) va o'rniga qo'shing:

```ts
export type EnrollClient = { clientId: string } | { fullName: string; phone: string }

export interface EnrollInput {
  eventId: string
  tariffId: string
  sellerId: string
  client: EnrollClient
}

// Thrown when the phone of a "new" client already belongs to someone — the UI
// offers that client instead of creating a duplicate.
export class ClientExistsError extends Error {
  clientId: string
  clientName: string
  constructor(clientId: string, clientName: string) {
    super(`Bu raqam ${clientName}ga tegishli`)
    this.clientId = clientId
    this.clientName = clientName
  }
}

const ENROLL_ERRORS: Record<string, string> = {
  "forbidden: staff_only": "Bu amal uchun ruxsat yo'q",
  tariff_mismatch: "Tarif bu tadbirga tegishli emas",
  seller_invalid: "Sotuvchi Sotuv bo'limining faol hodimi bo'lishi kerak",
  client_not_found: "Mijoz topilmadi",
  client_required: "Ism va to'g'ri telefon raqamni kiriting",
  already_enrolled: "Bu mijoz allaqachon ushbu tadbirga qo'shilgan",
}

export async function enrollParticipant(input: EnrollInput): Promise<string> {
  const c = input.client
  const { data, error } = await db.rpc("enroll_participant", {
    p_event_id: input.eventId,
    p_tariff_id: input.tariffId,
    p_seller_id: input.sellerId,
    p_client_id: "clientId" in c ? c.clientId : null,
    p_full_name: "fullName" in c ? c.fullName : null,
    p_phone: "phone" in c ? c.phone : null,
  })
  if (error) {
    const exists = /^client_exists:([0-9a-f-]{36}):(.*)$/.exec(error.message)
    if (exists) throw new ClientExistsError(exists[1], exists[2])
    // Two people creating the same phone at once: the unique index (034) wins.
    if (error.code === "23505") throw new Error("Bu telefon raqam boshqa mijozda band")
    throw new Error(ENROLL_ERRORS[error.message] ?? error.message)
  }
  return data as string
}
```

- [ ] **Step 4: Tekshirish**

Run: `bun run build`
Expected: `src/hooks/useEvents.ts` da `addExistingContactToEvent` topilmadi degan **bitta** xato (Task 3 tuzatadi). Boshqa xato bo'lmasligi kerak. Boshqa xato bo'lsa, shu taskda tuzating.

- [ ] **Step 5: Stage** — `git add src/lib/supabase/queries/tariffs.ts src/lib/supabase/queries/events.ts`

---

### Task 3: Hook'lar — `useEventTariffs`, yangi `useEnrollParticipant`

**Files:**
- Modify: `src/hooks/useEvents.ts`

**Interfaces:**
- Consumes: Task 2 dagi `getEventTariffs`, `enrollParticipant`, `EnrollInput`.
- Produces: `TARIFFS_KEY = ["event-tariffs"] as const`, `useEventTariffs(eventId: string)` (`useQuery<EventTariff[]>`), `useEnrollParticipant(eventId: string)` — `mutate(vars: Omit<EnrollInput, "eventId">)`.

- [ ] **Step 1: Importlar**

`addExistingContactToEvent,` va `type ClientContact,` ni importdan olib tashlang, o'rniga `enrollParticipant,` va `type EnrollInput,` qo'shing. `import { addPayment, type PaymentMethod } from "@/lib/supabase/queries/payments"` qatorini olib tashlang (faqat eski enroll ishlatgan edi). Qo'shing:

```ts
import { getEventTariffs, type EventTariff } from "@/lib/supabase/queries/tariffs"
```

- [ ] **Step 2: Kalit va hook**

`FINANCE_TOTALS_KEY` dan keyin:

```ts
export const TARIFFS_KEY = ["event-tariffs"] as const
```

`useParticipantCounts` dan keyin:

```ts
export function useEventTariffs(eventId: string) {
  return useQuery<EventTariff[]>({
    queryKey: [...TARIFFS_KEY, eventId],
    queryFn: () => getEventTariffs(eventId),
    enabled: !!eventId,
  })
}
```

- [ ] **Step 3: `useEnrollParticipant` ni almashtirish**

Izoh va butun funksiyani quyidagiga almashtiring:

```ts
// Enroll a client (existing or new) with a tariff + seller. Price comes from the
// tariff inside the RPC; money is recorded later in Moliya, never here.
export function useEnrollParticipant(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: Omit<EnrollInput, "eventId">) => enrollParticipant({ ...vars, eventId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
      qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
      qc.invalidateQueries({ queryKey: EVENTS_KEY })
      qc.invalidateQueries({ queryKey: ["clients"] })
      qc.invalidateQueries({ queryKey: ["client-journey"] })
      qc.invalidateQueries({ queryKey: ["client-participations"] })
      qc.invalidateQueries({ queryKey: FINANCE_TOTALS_KEY }) // new price → new debt
    },
  })
}
```

- [ ] **Step 4: Tekshirish**

Run: `bun run build`
Expected: faqat `EnrollParticipantModal.tsx` dagi xatolar (eski `mutate` argumentlari). Ularni Task 5 tuzatadi. Boshqa xato bo'lmasligi kerak.

- [ ] **Step 5: Stage** — `git add src/hooks/useEvents.ts`

---

### Task 4: Tadbir formasi — tariflar muharriri

**Files:**
- Modify: `src/components/events/CreateEventDrawer.tsx`

**Interfaces:**
- Consumes: `useEventTariffs`, `TARIFFS_KEY` (Task 3), `saveEventTariffs`, `TariffDraft` (Task 2).
- Produces: —

- [ ] **Step 1: Importlar va state**

Importlar:

```ts
import { X, UploadSimple, CaretDown, MagnifyingGlass, Check, Image as ImageIcon, Plus, Trash } from "@phosphor-icons/react"
import { useQueryClient } from "@tanstack/react-query"
import { saveEventTariffs } from "@/lib/supabase/queries/tariffs"
import { useEventTariffs, TARIFFS_KEY } from "@/hooks/useEvents"
```

Komponent tepasida (fayl darajasida) qo'shing:

```ts
interface TariffRow {
  key: string
  id?: string
  name: string
  price: string // digits only
}

function blankTariff(): TariffRow {
  return { key: crypto.randomUUID(), name: "", price: "" }
}
```

Komponent ichida `hasTariffs` state'ini olib tashlang va qo'shing:

```ts
  const qc = useQueryClient()
  const { data: savedTariffs } = useEventTariffs(editEvent?.id ?? "")
  const [tariffs, setTariffs] = useState<TariffRow[]>([blankTariff()])
```

- [ ] **Step 2: Reset effekti**

`useEffect` ichida `setHasTariffs(editEvent.has_tariffs)` → 

```ts
      setTariffs(
        savedTariffs && savedTariffs.length > 0
          ? savedTariffs.map((t) => ({ key: t.id, id: t.id, name: t.name, price: String(Math.round(t.price)) }))
          : [blankTariff()],
      )
```

`else` tarmog'ida `setHasTariffs(false)` → `setTariffs([blankTariff()])`. Dependency massivi: `[editEvent, isOpen, savedTariffs]`.

- [ ] **Step 3: Validatsiya va saqlash**

`endValid` dan keyin:

```ts
  const tariffsValid = tariffs.length > 0 && tariffs.every((t) => t.name.trim() && t.price !== "")
```

`handleSubmit` dagi birinchi tekshiruvni `if (!nameValid || !startValid || !managerValid || !cbValid || !tariffsValid)` ga almashtiring.

`fields` va `updates` dan `has_tariffs: hasTariffs,` qatorlarini olib tashlang. Tadbir saqlangandan keyin tariflarni saqlang: `await updateEvent(editEvent.id, updates)` dan keyin va `create` tarmog'ida `const event = await createEvent(fields)` dan keyin (banner yuklashdan oldin yoki keyin, farqi yo'q):

```ts
        await saveEventTariffs(editEvent.id, tariffs.map((t) => ({ id: t.id, name: t.name, price: Number(t.price) })))
```
```ts
        await saveEventTariffs(event.id, tariffs.map((t) => ({ name: t.name, price: Number(t.price) })))
```

`onCreated()` dan oldin:

```ts
      qc.invalidateQueries({ queryKey: TARIFFS_KEY })
```

- [ ] **Step 4: UI — "8. Tariffs" blokini almashtirish**

`{/* 8. Tariffs */}` dan boshlab `{hasTariffs && (...)}` blokining oxirigacha quyidagiga almashtiring:

```tsx
                {/* 8. Tariffs */}
                <Field label="Tariflar" required>
                  <div className="flex flex-col gap-2">
                    {tariffs.map((t, i) => (
                      <div key={t.key} className="flex items-center gap-2">
                        <input
                          aria-label={`${i + 1}-tarif nomi`}
                          value={t.name}
                          onChange={(e) => setTariffs((rows) => rows.map((r) => (r.key === t.key ? { ...r, name: e.target.value } : r)))}
                          placeholder="Standart"
                          className={`${INPUT} flex-1 ${touched && !t.name.trim() ? "border-[#D13328]" : ""}`}
                        />
                        <div className="relative w-[170px] shrink-0">
                          <input
                            aria-label={`${i + 1}-tarif narxi`}
                            inputMode="numeric"
                            value={t.price ? formatNumber(Number(t.price)) : ""}
                            onChange={(e) => setTariffs((rows) => rows.map((r) => (r.key === t.key ? { ...r, price: e.target.value.replace(/\D/g, "") } : r)))}
                            placeholder="17,000,000"
                            className={`${INPUT} pr-12 ${touched && t.price === "" ? "border-[#D13328]" : ""}`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#999] pointer-events-none">UZS</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTariffs((rows) => rows.filter((r) => r.key !== t.key))}
                          disabled={tariffs.length === 1}
                          aria-label={`${i + 1}-tarifni o'chirish`}
                          className="p-2 rounded-[8px] text-[#999] hover:text-[#D13328] hover:bg-[#F5F5F5] transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <Trash size={14} weight="bold" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTariffs((rows) => [...rows, blankTariff()])}
                      className="self-start flex items-center gap-1.5 text-[12px] font-semibold text-[#666] hover:text-[#141414] transition-colors"
                    >
                      <Plus size={12} weight="bold" /> Tarif qo'shish
                    </button>
                    <span className="text-[11px] text-[#999]">
                      Narx mijoz tadbirga yozilganda unga qo'yiladi. Keyin tarif narxini o'zgartirsangiz, avval yozilganlarga ta'sir qilmaydi.
                    </span>
                  </div>
                </Field>
```

Xato matni: birinchi tekshiruvdagi xabar o'zgarmaydi (`Yulduzcha (*) bilan belgilangan maydonlarni to'ldiring`) — tariflar ham yulduzchali.

- [ ] **Step 5: Tekshirish**

Run: `grep -n "hasTariffs\|has_tariffs" src/components/events/CreateEventDrawer.tsx`
Expected: hech narsa.

Run: `bun run build`
Expected: faqat `EnrollParticipantModal.tsx` xatolari (Task 5).

- [ ] **Step 6: Stage** — `git add src/components/events/CreateEventDrawer.tsx`

---

### Task 5: Yozilish oynasi — mavjud/yangi mijoz, tarif, sotuvchi

**Files:**
- Modify (to'liq qayta yoziladi): `src/components/events/EnrollParticipantModal.tsx`

**Interfaces:**
- Consumes: `useEnrollParticipant`, `useEventTariffs` (Task 3); `ClientExistsError`, `searchContacts`, `ClientContact` (`events.ts`); `useUsers`.
- Produces: props o'zgarmaydi — `{ isOpen, eventId, existingContactIds, onClose, onAdded }`.

- [ ] **Step 1: Faylni almashtirish**

```tsx
import { useState, useEffect, useId, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, MagnifyingGlass, CaretLeft, Plus, Warning } from "@phosphor-icons/react"
import { searchContacts, ClientExistsError, type ClientContact } from "@/lib/supabase/queries/events"
import { useEnrollParticipant, useEventTariffs } from "@/hooks/useEvents"
import { useUsers } from "@/hooks/useUsers"
import { useDialog } from "@/hooks/useDialog"
import { formatMoney, formatPhone } from "@/lib/format"

interface EnrollParticipantModalProps {
  isOpen: boolean
  eventId: string
  existingContactIds: Set<string>
  onClose: () => void
  onAdded: () => void
}

type PickedClient = Pick<ClientContact, "id" | "full_name" | "phone" | "image">

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
}

const INPUT =
  "w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCCCCC] focus:outline-none focus:border-[#141414] transition-colors"
const LABEL = "text-[12px] font-medium text-[#999999]"

function ClientAvatar({ c }: { c: PickedClient }) {
  return c.image ? (
    <img src={c.image} alt={c.full_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-8 h-8 rounded-full bg-[#EBEBEB] text-[#666] text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials(c.full_name)}
    </span>
  )
}

// State lives here; the parent remounts this modal (via key) on each open.
export function EnrollParticipantModal({ isOpen, eventId, existingContactIds, onClose, onAdded }: EnrollParticipantModalProps) {
  const enroll = useEnrollParticipant(eventId)
  const { data: tariffs = [], isLoading: loadingTariffs } = useEventTariffs(eventId)
  const { data: users = [] } = useUsers()
  const sellers = users.filter((u) => u.is_active && u.department === "sotuv")

  const titleId = useId()
  const clientSearchId = useId()
  const nameId = useId()
  const phoneId = useId()
  const tariffId = useId()
  const sellerId = useId()
  const panelRef = useDialog<HTMLDivElement>(onClose, isOpen)

  const [mode, setMode] = useState<"search" | "new">("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientContact[]>([])
  const [client, setClient] = useState<PickedClient | null>(null)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [suggestion, setSuggestion] = useState<PickedClient | null>(null)
  const [tariff, setTariff] = useState("")
  const [seller, setSeller] = useState("")
  const [error, setError] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced client search (only in search mode, while no client picked)
  useEffect(() => {
    if (client || mode !== "search") return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      try {
        setResults(await searchContacts(query))
      } catch {
        setResults([])
      }
    }, 300)
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [query, client, mode])

  const phoneDigits = phone.replace(/\D/g, "")
  const newClientValid = fullName.trim().length > 0 && phoneDigits.length >= 9
  const hasClient = mode === "search" ? !!client : newClientValid
  const blocked = !loadingTariffs && (tariffs.length === 0 || sellers.length === 0)
  const canSubmit = hasClient && !!tariff && !!seller && !blocked && !enroll.isPending

  function pick(c: PickedClient) {
    if (existingContactIds.has(c.id)) {
      setError("Bu mijoz allaqachon ushbu tadbirga qo'shilgan")
      return
    }
    setMode("search")
    setClient(c)
    setSuggestion(null)
    setQuery("")
    setResults([])
    setError(null)
  }

  function startNew() {
    setMode("new")
    setClient(null)
    // A typed phone-looking query pre-fills the phone, anything else the name.
    if (/^[\d\s+()-]+$/.test(query.trim())) setPhone(query.trim())
    else setFullName(query.trim())
    setError(null)
  }

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    setSuggestion(null)
    enroll.mutate(
      {
        tariffId: tariff,
        sellerId: seller,
        client: mode === "search" && client ? { clientId: client.id } : { fullName: fullName.trim(), phone },
      },
      {
        onSuccess: () => { onAdded(); onClose() },
        onError: (err) => {
          if (err instanceof ClientExistsError) {
            setSuggestion({ id: err.clientId, full_name: err.clientName, phone, image: null })
            return
          }
          setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
        },
      },
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white rounded-[12px] shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
              <h3 id={titleId} className="text-[16px] font-bold text-[#141414]">Ishtirokchi qo'shish</h3>
              <button onClick={onClose} aria-label="Yopish" className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all">
                <X size={20} className="text-[#999999]" weight="bold" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              {error && (
                <div role="alert" className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                  {error}
                </div>
              )}

              {blocked && (
                <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-[8px] text-[12px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <Warning size={14} weight="bold" className="mt-0.5 shrink-0" />
                  {tariffs.length === 0
                    ? "Bu tadbirda tarif yo'q. Avval tadbirni tahrirlab, tarif qo'shing."
                    : "Sotuv bo'limida faol hodim yo'q. Hodimlar bo'limida hodimga \"Sotuv\" bo'limini belgilang."}
                </div>
              )}

              {/* 1. Client */}
              {mode === "search" && !client && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor={clientSearchId} className={LABEL}>Mijoz *</label>
                    <button onClick={startNew} className="flex items-center gap-1 text-[11px] font-semibold text-[#666] hover:text-[#141414] transition-colors">
                      <Plus size={11} weight="bold" /> Yangi mijoz
                    </button>
                  </div>
                  <div className="relative">
                    <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" weight="bold" />
                    <input
                      id={clientSearchId}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ism yoki telefon bo'yicha qidirish..."
                      autoFocus
                      className={`${INPUT} pl-9`}
                    />
                  </div>
                  {results.length > 0 && (
                    <div className="flex flex-col max-h-[240px] overflow-y-auto no-scrollbar mt-1">
                      {results.map((c) => {
                        const added = existingContactIds.has(c.id)
                        return (
                          <button
                            key={c.id}
                            disabled={added}
                            onClick={() => pick(c)}
                            className={`w-full flex items-center gap-2.5 p-2 rounded-[8px] transition-colors text-left ${added ? "opacity-50 cursor-not-allowed" : "hover:bg-[#F5F5F5]"}`}
                          >
                            <ClientAvatar c={c} />
                            <span className="flex flex-col min-w-0 flex-1">
                              <span className="text-[13px] font-medium text-[#141414] truncate">{c.full_name}</span>
                              <span className="text-[11px] text-[#999]">{formatPhone(c.phone)}</span>
                            </span>
                            {added && <span className="text-[10px] font-bold text-[#999]">qo'shilgan</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {query.trim() && results.length === 0 && (
                    <button onClick={startNew} className="text-left text-[12px] text-[#666] py-2 hover:text-[#141414]">
                      Mijoz topilmadi — <span className="font-semibold underline">yangi mijoz qo'shish</span>
                    </button>
                  )}
                </div>
              )}

              {mode === "search" && client && (
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>Mijoz *</span>
                  <div className="flex items-center gap-2.5 border border-[#E0E0E0] rounded-[8px] p-2">
                    <ClientAvatar c={client} />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-[#141414] truncate">{client.full_name}</span>
                      <span className="text-[11px] text-[#999]">{formatPhone(client.phone)}</span>
                    </span>
                    <button
                      onClick={() => setClient(null)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors"
                    >
                      <CaretLeft size={12} weight="bold" /> O'zgartirish
                    </button>
                  </div>
                </div>
              )}

              {mode === "new" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-[#141414]">Yangi mijoz</span>
                    <button
                      onClick={() => { setMode("search"); setSuggestion(null) }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#999] hover:text-[#141414] transition-colors"
                    >
                      <CaretLeft size={12} weight="bold" /> Mavjudlardan tanlash
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={nameId} className={LABEL}>Ism Familiya *</label>
                    <input id={nameId} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Aliyev Vali" autoFocus className={INPUT} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={phoneId} className={LABEL}>Telefon *</label>
                    <input
                      id={phoneId}
                      type="tel"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setSuggestion(null) }}
                      placeholder="+998 90 123 45 67"
                      className={INPUT}
                    />
                  </div>
                  {suggestion && (
                    <div role="alert" className="flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[#FBFBFB] border border-[#E0E0E0] text-[12px]">
                      <span className="text-[#666]">Bu raqam <span className="font-bold text-[#141414]">{suggestion.full_name}</span>ga tegishli.</span>
                      <button onClick={() => pick(suggestion)} className="shrink-0 font-bold text-[#141414] underline">Shu mijozni tanlash</button>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Tariff */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={tariffId} className={LABEL}>Tarif *</label>
                <select id={tariffId} value={tariff} onChange={(e) => setTariff(e.target.value)} disabled={tariffs.length === 0} className={INPUT}>
                  <option value="" disabled>Tarifni tanlang</option>
                  {tariffs.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} — {formatMoney(t.price)}</option>
                  ))}
                </select>
              </div>

              {/* 3. Seller */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={sellerId} className={LABEL}>Sotuvchi *</label>
                <select id={sellerId} value={seller} onChange={(e) => setSeller(e.target.value)} disabled={sellers.length === 0} className={INPUT}>
                  <option value="" disabled>Sotuvchini tanlang</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={onClose}
                disabled={enroll.isPending}
                className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex-1 px-4 py-2.5 rounded-[8px] text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                  canSubmit ? "bg-[#141414] text-white hover:bg-black active:scale-95" : "bg-[#E0E0E0] text-[#999] cursor-not-allowed"
                }`}
              >
                {enroll.isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saqlanmoqda...
                  </>
                ) : (
                  "Qo'shish"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Tekshirish**

Run: `bun run build && bun run lint`
Expected: build exit 0; lint problems soni baseline (3) bilan bir xil.

- [ ] **Step 3: Stage** — `git add src/components/events/EnrollParticipantModal.tsx`

---

### Task 6: Ishtirokchilar jadvali — tarif, sotuvchi, o'chirish to'siqlari

**Files:**
- Modify: `src/components/events/EventOverview.tsx`

**Interfaces:**
- Consumes: `Participant.tariff_name`, `Participant.seller_name` (Task 2).
- Produces: —

- [ ] **Step 1: Ustunlar**

`<th>…Telefon</th>` dan keyin:

```tsx
                  <th className="px-4 py-2.5 font-bold">Tarif</th>
                  <th className="px-4 py-2.5 font-bold">Sotuvchi</th>
```

`<td>…formatPhone(p.phone)…</td>` dan keyin:

```tsx
                    <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.tariff_name ?? "Individual"}</td>
                    <td className="px-4 py-2.5 text-[13px] text-[#666] whitespace-nowrap">{p.seller_name ?? "—"}</td>
```

- [ ] **Step 2: To'lovi bor ishtirokchini o'chirish to'sig'i**

`confirmingId === p.id` bloki ichidagi quyidagi qismni olib tashlang:

```tsx
                          {p.paid > 0 && (
                            <span className="text-[10px] font-bold text-red-500">To'lovlar ham o'chadi!</span>
                          )}
```

`else` tarmog'idagi axlat qutisi tugmasini quyidagiga almashtiring (summa ko'rsatilmaydi, faqat bor/yo'q):

```tsx
                        <button
                          onClick={() => setConfirmingId(p.id)}
                          disabled={p.paid > 0}
                          title={p.paid > 0 ? "To'lovi bor — Moliya orqali bekor qilinadi" : "O'chirish"}
                          aria-label={p.paid > 0 ? "To'lovi bor — o'chirib bo'lmaydi" : "O'chirish"}
                          className="text-[#CCC] hover:text-red-600 transition-colors disabled:opacity-40 disabled:hover:text-[#CCC] disabled:cursor-not-allowed"
                        >
                          <Trash size={15} weight="bold" />
                        </button>
```

- [ ] **Step 3: To'lovi bor tadbirni o'chirish to'sig'i**

Tadbir o'chirilganda (`events` CASCADE) uning to'lovlari ham jimgina o'chadi. `existingContactIds` dan keyin qo'shing:

```ts
  // ponytail: UI guard only — the DB trigger that refuses deleting participants
  // with payments lands in migration 051 (phase 3).
  const hasPayments = participants.some((p) => p.paid > 0)
  function handleDelete() {
    if (hasPayments) {
      window.alert("Bu tadbirda to'lovlar bor. Tadbirni o'chirib bo'lmaydi — to'lovlar Moliya orqali bekor qilinadi.")
      return
    }
    onDelete()
  }
```

Ikkala o'chirish tugmasida (`IconBtn` va `CompactBtn`, `title="O'chirish"`) `onClick={onDelete}` → `onClick={handleDelete}`.

- [ ] **Step 4: Tekshirish**

Run: `grep -n "To'lovlar ham o'chadi\|onClick={onDelete}" src/components/events/EventOverview.tsx`
Expected: hech narsa.

Run: `bun run build && bun run lint`
Expected: build exit 0; lint baseline (3).

- [ ] **Step 5: Stage** — `git add src/components/events/EventOverview.tsx`

---

### Task 7: Mahalliy stekda brauzer tekshiruvi, CLAUDE.md, commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mahalliy Supabase stekini ko'tarish**

Portlar bo'shligini tekshiring:

Run: `lsof -nP -iTCP:54321 -iTCP:54322 -iTCP:54323 -sTCP:LISTEN`
Expected: hech narsa. **Band bo'lsa (CLAUDE.md: 54322 boshqa loyihaniki bo'lishi mumkin), shu yerda to'xtab, foydalanuvchidan so'rang** — boshqa loyihaning konteynerlariga tegmang.

Run: `bun run supabase:start` (001–050 ni storage bilan to'liq qo'llaydi)
Expected: `Started supabase local development setup.` Migratsiya xatosi bo'lsa, u 050 mi yoki eski faylmi — tekshiring. Eski fayl xatosi bo'lsa, foydalanuvchiga xabar bering.

Run: `doppler secrets get VITE_SUPABASE_URL -p fy-system -c dev --plain` → `http://127.0.0.1:54321` bo'lishi kerak. `VITE_SUPABASE_ANON_KEY` (dev) `supabase status -o env` dagi `ANON_KEY` bilan mos kelishi kerak. Mos kelmasa, to'xtab, foydalanuvchiga ayting (Doppler'ni o'zingiz o'zgartirmang).

- [ ] **Step 2: Test ma'lumotlari (faqat mahalliy stek)**

Test admin foydalanuvchini mahalliy GoTrue admin API orqali yarating (`SERVICE_ROLE_KEY` — `supabase status -o env` dan). Parolni generatsiya qiling va **chatda emas**, scratchpad faylida saqlang. Keyin mahalliy DB'da (`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`):

```sql
UPDATE public.profiles SET role = 'admin', department = 'sotuv' WHERE email = '<test email>';
INSERT INTO public.clients (full_name, phone) VALUES ('Mavjud Mijoz', '+998901112233');
```

- [ ] **Step 3: Brauzerda tekshirish**

`bun run dev:local` ni fonda ishga tushiring va o'rnatilgan brauzerda `http://localhost:5001/tadbirlar/boshqaruv` ni oching, test foydalanuvchi bilan kiring. Tekshiriladi (har biri uchun skrinshot yoki `read_page`):

1. **Yangi tadbir.** Tarifsiz saqlash rad etiladi (qizil ramka). "Standart 17 000 000" va "VIP 25 000 000" bilan saqlanadi.
2. **Tahrirlash.** Tariflar yuklanadi. Uchinchisi qo'shilib, keyin o'chiriladi. Saqlanadi.
3. **Ishtirokchi qo'shish, mavjud mijoz.** "Mavjud" qidiriladi → tanlanadi → VIP → sotuvchi → Qo'shish. Jadvalda: Tarif = VIP, Sotuvchi = test foydalanuvchi, **summa yo'q**.
4. **Yangi mijoz.** "Yangi Mijoz", `90 555 66 77`, Standart → Qo'shish. `/mijozlar` sahifasida paydo bo'ladi.
5. **Dublikat telefon.** Yangi mijoz, telefon `998-90-111-22-33` → "Bu raqam Mavjud Mijozga tegishli" chiqadi → "Shu mijozni tanlash" → "allaqachon qo'shilgan" xatosi (u 3-qadamda qo'shilgan).
6. **Tarifsiz eski tadbir.** SQL bilan tarifsiz tadbir yarating → yozilish oynasida sariq ogohlantirish chiqadi, tugma o'chiq.
7. **O'chirish to'siqlari.** Mahalliy DB'da bitta ishtirokchiga to'lov qo'shing (`INSERT INTO payments (participant_id, amount, method) VALUES ('<id>', 1000000, 'naqd')`). Uning axlat qutisi o'chiq bo'ladi, tadbirni o'chirish esa alert beradi.
8. **Konsol.** `read_console_messages` → xato yo'q.

- [ ] **Step 4: Stekni to'xtatish**

Run: `bun run supabase:stop`. Dev server'ni ham to'xtating.

- [ ] **Step 5: CLAUDE.md**

§2 jadvalidagi `Supabase Postgres (migrations \`001\`–\`047\`)` → `Supabase Postgres (migrations \`001\`–\`050\`)`.
§3 dagi `├── migrations/           # 001–047, sequential — NEVER edit existing ones` → `# 001–050, …`.
§7 dagi "Events UI" punktining **Boshqaruv** qatoridan keyin qo'shing:

```markdown
  - **Tariffs & enrolment** (migration `050`): each event has ≥1 row in `event_tariffs` (name + price), edited in `CreateEventDrawer` via `saveEventTariffs`. Enrolling goes ONLY through the `enroll_participant` RPC (existing client by id, or new client by name + phone — a phone that already exists raises `client_exists:<id>:<name>` and the UI offers that client). The RPC copies the tariff price into `event_participants.price` (later tariff edits don't reprice) and requires a `seller_id` from the Sotuv department. `events.has_tariffs` and `event_participants.tariff` (text) are legacy, unused.
```

- [ ] **Step 6: Yakuniy build**

Run: `bun run build && bun run lint`
Expected: build exit 0; lint baseline (3).

- [ ] **Step 7: Commit — foydalanuvchi tasdig'i bilan**

`git diff --cached --stat` ni ko'rsatib, tasdiq so'rang. Tasdiqdan keyin:

```bash
git add CLAUDE.md docs/superpowers/plans/2026-09-27-bosqich-2-boshqaruv.md
git commit -m "feat(tadbirlar): tariffs, seller and new-client enrolment in Boshqaruv

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Production'ga qo'llash (050) bu rejaga kirmaydi. U alohida, foydalanuvchi tasdig'i bilan quyidagi tartibda bajariladi: backup → qo'llash → `schema_migrations` ga `'050'` → `docker restart supabase-rest-1` → frontend push.
