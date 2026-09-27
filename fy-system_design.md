# fy-system — dizayn didi va AI slop'ga qarshi qoidalar

Belgilar: **[fakt]** — kod, qoida fayli yoki sessiyadan to'g'ridan-to'g'ri iqtibos · **[xulosa]** — tuzatishlarda takrorlanadigan naqsh, lekin o'zi buni so'z bilan aytmagan · **[savol]** — qoidaga o'xshaydi, dalil kam.
Manbalar: **FY** — shu repo (git, kod). Sessiyalar (`~/.claude/projects/*/*.jsonl`, 858 ta noyob xabar): **PR** Stores/product (ProDuct do'koni) · **DB** Apps/dashboard (Contakt amoCRM analitikasi) · **BP** blackpack (Silex studiya sayti) · **YX** yuxo (mebel brendi) · **SD** Freelance/sado (agentlik sayti) · **SB** web/saboq (EdTech panel) · **TS** togsafari7 · **RF** Rafting · **RT** rtmp (Relay panel) · **OC** ochiqchasiga.uz · **TC** Desktop/test-cc (o'zi yozgan baholash brief'i). Iqtibos formati `PR 09-10 061cf9b2` = loyiha, 2026-yil sanasi, xabar uuid boshi.
FY'ning o'z sessiya transkriptlari saqlanmagan: FY bo'yicha tuzatishlar git'dan olingan (115 commit), so'zma-so'z iqtiboslar esa boshqa loyihalardan.

---

## 1. Kim va nima qiladi

- Oyatillo — dizayner (git: `designnabijonov@gmail.com`), kodni Claude Code bilan o'zi yozadi; FY'dagi 115 commitning yagona muallifi. [fakt: `git log`]
- FY — "Fikr Yetakchilari" klubining ichki paneli: CRM-N, mijozlar, tadbirlar va ularning moliyasi, keshbek, xodimlar va KPI, audit jurnali. Klub a'zolari uchun alohida Expo ilova bor. Shu klubga landinglar ham qiladi (RF → TS "Tog' safari 7.0"). [fakt: CLAUDE.md §1, §6.5; sessiyalar ro'yxati]
- Qolgan ishi — o'zbek mijozlar uchun frilans: landing, sayt va admin panel, dashboard (PR, DB, BP, YX, SD, SB, RT, OC). [fakt]
- Stek: React 19 + Vite 7 yoki Next.js 16, Tailwind 4 (`@theme` CSS ichida, config fayl yo'q), shadcn `base-nova`, framer-motion / `motion`, Supabase yoki Payload; paket menejeri bun; deploy Coolify orqali Oracle VM'ga. [fakt]
- Interfeys matni o'zbekcha (lotin), ba'zan ruscha; AI bilan ham o'zbekcha gaplashadi. [fakt: `~/.claude/CLAUDE.md`, FY CLAUDE.md §6]

---

## 2. Did raqamlarda (FY)

### Bo'shliqlar
- Qadam — Tailwind 4 standart 4px. `space-y-*` bir marta ham ishlatilmagan, faqat `flex flex-col gap-*`. [fakt]
- Eng ko'p ishlatilgan gap'lar: `gap-2` (8px) 137×, `gap-1.5` (6px) 89×, `gap-3` (12px) 68×, `gap-1` (4px) 59×, `gap-4` (16px) 50×, `gap-6` (24px) 22×. [fakt]
- Stat karta — `p-5` (20px), ichida `gap-4`; katta panel — `p-6`, ichida `gap-6`; kartalar orasi `gap-5` yoki `gap-6` (`Dashboard.tsx:57,64,89`). [fakt]
- Tugma va qatorlar: `px-4` 118×, `px-3` 101×; `py-2` 141×, `py-2.5` 75×. [fakt]
- Sidebar guruhlari orasi 30 → 20 → 12px ga tushirilgan, bandlar `py-3` → `py-2` (FY `8c90872`, `f3fe605`). [fakt]
- Header'ning tashqi padding'i uchta commitda 6 → 12 → 16px sinab ko'rilgan (FY `266e811`, `4184344`, `4f78015`). Hozir `px-[24px] pt-[15px] pb-[15px]`, bar ichida `px-[16px]` (`App.tsx:96,100`). [fakt]
- `<main>`: `px-[16px] pt-[32px] pb-[20px]` (`App.tsx:274`). [fakt]
- Mobil: `spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }` (`mobile/src/theme/tokens.ts`). [fakt]

### Radiuslar
- Bitta asos: `--radius: 8px` (`src/index.css:375`). `.apple-sq-10` va `.apple-sq-12` nomlari boshqacha bo'lsa ham, ikkalasi `border-radius: 8px`. [fakt]
- 8px'ga 26 soniyada kelgan: `0.625rem` → `4px` (FY `08e418f`, 15:45:54) → `8px` (FY `b3b8d37`, 15:46:20). [fakt]
- Amalda qavsli qiymatlar ishlatiladi: `rounded-[8px]` 219×, `rounded-full` 104×, `rounded-[6px]` 67×, `rounded-[12px]` 48×, `rounded-[4px]` 19×. Nomli shkala (`rounded-lg`/`xl`) atigi 1 marta. [fakt]
- Kontrollar (tugma, input, qidiruv, dropdown, header bar) — 8px (`button.tsx` asosi `rounded-[8px]`, `PhoneInput.tsx:35`). [fakt]
- Badge — 6px (`StatusBadge`, `rounded-md`). List/grid toggle segmenti — 6px. [fakt]
- Kartalar — 8px: stat karta "for a sharper look" izohi bilan `rounded-[12px]` → `rounded-[8px]` qilingan (FY `b4afbd3`). Toolbar konteyneri shu commitda 16 → 12px; tadbir kartasi 12px. [fakt]
- Modallar — 12px (`AddPaymentModal.tsx:121`, 14 ta modalning hammasida). [fakt]
- Kontent maydonining yuqori-chap burchagi 20 → 26 → 0px (FY `452642c`, `971ac82`, `6e7460a`). [fakt]
- Grafik ustuni tepasi `radius={[4, 4, 0, 0]}`. Mobilda `radius = 8`, karta uchun `radiusLg = 12`. [fakt]

### Kontrol balandliklari
- `button.tsx`: `xs` 24px (`h-6`), `sm` 28px (`h-7`), `default` 32px (`h-8`), `lg` 36px (`h-9`); ikonka tugmasi `size-8`. [fakt]
- Header bar `h-[54px]`, badge `h-6` (24px), mobil tugma `height: 50`. [fakt]
- Bir qatordagi kontrollar bir xil balandlikda: DB'da yagona qiymat 36px (`BOSHQARUV`), PR'da nav 36px, sahifa tugmasi 47px. [fakt: DB CLAUDE.md; PR 08-27 a87cd13f]

### Tipografika
- Shrift: `'Geist Variable', system-ui, sans-serif`; mono shrift yo'q. [fakt: `index.css:4,9`]
- Butun ilovada `letter-spacing: -0.02em` (`:root`, `index.css:10`), `font-synthesis: none`, antialiased. [fakt]
- Shkala izohi: "Minor Third (×1.2) anchored at 15px base". O'lchamlar: `--text-xs` 11/1.5 · `sm` 13/1.55 · `base` 15/1.6 · `lg` 18/1.5 · `xl` 22/1.4 · `2xl` 26/1.35 · `3xl` 32/1.25 · `4xl` 38/1.15 · `5xl` 48/1.1. [fakt: `index.css:424-441`]
- Og'irlik atigi ikkita: `thin`…`medium` → 400, `semibold`…`black` → 600 (`index.css:444-452`). Shu commitda H1 800 → 600, havola 500 → 400, `th` 700 → 600 (FY `59362be`). [fakt]
- Kodda shkala tokenlari atigi 5 marta ishlatilgan, qolgani qavsli px: `text-[12px]` 226×, `text-[13px]` 193×, `text-[11px]` 109×, `text-[14px]` 38×, `text-[10px]` 37×, `text-[16px]` 27×. [fakt]
- Sahifa sarlavhasi `text-[20px] font-bold leading-tight`, tavsifi `text-[12px] font-medium` (`App.tsx:104-110`); modal sarlavhasi `text-[16px] font-bold`. [fakt]
- Jadval sarlavhasini o'zi `text-[14px] font-semibold text-[#141414]` qilgan, katta harflarsiz (FY `4215f9c`, `b1731b0`). [fakt]
- Raqamlarda `tabular-nums` yo'q (0 marta). [fakt]
- Mobil: Geist emas, system font (SF Pro), og'irliklar 400/500/600/700. [fakt: memory `mobile-app-preferences.md`, `tokens.ts`]

### Rang
- Kulrang shkala (neytral, fon iliq): `#141414` matn/asosiy · `#333` · `#666` ikkinchi darajali matn · `#999` muted · `#CCC` placeholder · `#E0E0E0` border · `#F0F0F0` hairline · `#F5F5F5` hover va ikonka foni · `#F9F9F8` dropdown hover · `#FBFBFB` jadval sarlavhasi foni · `#F3F2F0` sahifa va sidebar foni · `#FFFFFF` kontent. [fakt: hex chastotasi, `[data-theme="neutral"]`]
- `--background: #F3F2F0` — oklch neytral bloki ichidagi yagona hex, ya'ni fon sof kulrang emas, iliq. [fakt: `index.css:352`]
- Aksent — har temada bittadan: `neutral` `#141414` (rangli aksent umuman yo'q), `black-orange` va `light-orange` `#D13328`, `member` `#6366F1`. [fakt: `index.css` `[data-theme]`]
- Holat ranglari: success, warning va info → fon `#F0F0F0`, matn `#141414` yoki `#888888`; faqat danger rangli — `rgba(209,51,40,0.07)` / `#D13328` (FY `59362be`, `src/lib/constants/theme.ts`). [fakt]
- Rang faqat ma'lumot tashisa qoladi: bo'lim ranglari `#EC4899 #3B82F6 #10B981 #F59E0B #8B5CF6 #06B6D4` (`employee.ts`). [fakt]
- Grafik bir rangli: `#141414`, `strokeWidth={2}`, `barSize={24}`; grid `strokeDasharray="3 3" vertical={false} stroke="#F0F0F0"`; o'q yozuvi 12px `#999`, o'q chiziqlari yo'q. `--chart-1..5` ko'k rampasi ishlatilmaydi. [fakt: `Dashboard.tsx:121-240`]
- Brend ranglari: loader `#FD5426`, bildirishnoma nuqtasi `#FF3B30`. [fakt]

### Chegara va soya
- Ajratish hairline bilan: oddiy `border` 587×, `shadow-*` ~39×. Karta: `bg-white border border-[#F0F0F0] rounded-[8px]`, hover'da `hover:border-[#141414]`, soya emas (`Dashboard.tsx:64`). [fakt]
- Input: dam holatda `border-[#E0E0E0]`, fokusda `focus-within:border-[#141414]`, ring va glow yo'q (`PhoneInput.tsx:35`). audit.md'ga ko'ra qora border faqat fokusda bo'ladi. [fakt]
- Soya faqat suzuvchi qatlamda qolgan: modal `shadow-2xl`, dropdown `shadow-[0_10px_40px_rgba(0,0,0,0.08)]`, grafik tooltip `0 10px 15px -3px rgba(0,0,0,0.1)`. [fakt]
- Kontent maydonining yagona soyasi yumshatilgan: `-10px 0 30px rgba(0,0,0,.06)` → `-6px 0 24px rgba(0,0,0,.03)` (FY `b29cfa5`). [fakt]
- Modal ortidagi fon: `bg-black/50 backdrop-blur-sm`. [fakt]

### Zichlik
- Asosiy matn 12–13px, jadval katagi `p-4`, modal `max-w-md` — ichki panel zich. [fakt]
- Bo'sh ekran ham xato hisoblanadi. Mobil ilova haqida u shunday degan: "ekranlar **boy va toʻliq** boʻlsin — boʻsh roʻyxatlardan koʻra dashboard-uslubidagi kartalar, statistika, section headerlar". [fakt: memory `mobile-app-preferences.md`]
- Boshqa loyihalarda eng kichik shrift o'lchami qat'iy belgilangan: DB 13px ("eng kichiki 13 px bo'lsin", DB 09-06 b686e19d), PR 14px, BP 16px ("Nothing is set below 16px"). FY'da esa 10–11px 146 joyda ishlatilgan. [savol]

### Setka va kenglik
- Kontent `max-w-[1400px] mx-auto` (`App.tsx:276`). [fakt]
- Sidebar ochiq holatda 340px, yig'ilganda 80px (`Sidebar.tsx:196`); qidiruv maydoni `w-[320px]`. [fakt]
- KPI kartalar `grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5`; grafik panellar `lg:grid-cols-3 gap-6`. [fakt]
- Modal kengligi `max-w-md` (448px), 12 joyda. [fakt]
- Matn kengligi `max-width: 65ch` faqat `.typography` klassida bor, sahifalarda ishlatilmaydi. [fakt]

### Animatsiya
- Sidebar kengligi: `{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }`. Bunga 4 daqiqada 4 ta variantdan keyin kelgan: spring 300/30 → bezier `[0.32,0.72,0,1]` 0.5s → spring 260/32 → shu (FY `6ec304b` → `51f0108`). [fakt]
- Modal va menyu: `{ type: "spring", stiffness: 300, damping: 25 }` (12–15 marta); kirishda `scale 0.95→1, y 20→0, opacity 0→1`. [fakt]
- Sahifa o'tishi `duration: 0.2`; hover'da asosan `transition-colors` (201×). [fakt]
- Cheksiz takrorlanadigan animatsiya faqat ikkita: login'da `blob 18s ease-in-out infinite`, loader'da `tracerDraw 1.8s`. [fakt]

---

## 3. Stop-list — AI chiqarganda u har safar olib tashlaydigan narsalar

1. Kartadagi ikonkalarni har xil rangga bo'yama (`text-blue-600 bg-blue-50`, `text-green-600 bg-green-50`, `text-purple-600 bg-purple-50`). Hammasi `text-[#141414]` + `bg-[#F5F5F5]` bo'lsin. [fakt: FY `b5a2608` "neutralize stats card icons to match sidebar theme"]
2. Holat badge'larini svetoforga aylantirma (yashil success, sariq warning, ko'k info). Hammasi kulrang, faqat xato qizil. [fakt: FY `59362be`]
3. Badge'ga border yoki soya berma, balandligini har xil qoldirma. Standart: `h-6 px-2.5 rounded-md text-[11px] font-bold`, fon — tint, matn — shu rangning to'q varianti. [fakt: audit.md → FY `fab19bd`, `StatusBadge.tsx:13`]
4. Dekorativ gradient qo'yma: karta fonida, cover placeholder'da (`from-[#F5F5F5] to-[#EBEBEB]`), "premium" `#FFFFFF → #FFE7D0` fade'da. Faqat tekis rang. AI "bu brend identity, saqlang" desa ham. [fakt: FY `fab19bd`; SB 07-18 a217f45d "Global ravishda gradient colorlardan foydalanma to'liq solidga qayt"; BP 08-03 229a6f84 "gradientni olib tashlayver"]
5. "Instagram stories" uslubidagi gradient halqali avatar lentasini yasama (`from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]`, bir-biriga mingashgan, `shadow-lg`, `hover:-translate-y-2`). [fakt: FY `57eee43`, 5 daqiqadan keyin `98d5fb8` bilan o'chirilgan]
6. Suzuvchi chat tugmasi va oynasini qo'shma. [fakt: FY `8c667d4`, 2 daqiqadan keyin `749318a` bilan o'chirilgan]
7. Bildirishnomaga "3 ta yangi" qizil pill, har bir turga rangli 40px ikonka-kvadrat va chap aksent chiziq qo'yma. O'rniga bitta `w-2 h-2` nuqta. [fakt: FY `f8c3f5d`]
8. Kartaga, tugmaga, faol toggle'ga soya berma (`shadow-sm`, `hover:shadow-md`). [fakt: FY `420e1bf`, `e0b3d6b`; PR 09-10 6d9acc40 "butun saytdan drop shadowlarni olib tashla"; SB 07-18 8fdfa6b7 "Drop shadow ishlatma dedim ishlatding"]
9. Fokusda ring, glow yoki inset halqa qo'yma — faqat border rangi `#E0E0E0` dan `#141414` ga o'zgaradi. [fakt: `PhoneInput.tsx:35`; PR 09-10 e7e0d9c6 "inset halqalarni ham olib tashla"]
10. Navbar ortiga shisha (glass/blur) fon qo'yma. [fakt: PR 09-10 c0db26d4 "navbarni ortidagi glass effect bgni olib tashlachi"; TC "excessive glassmorphism"]
11. Rasm ustidagi matnni o'qiladigan qilish uchun qora drop shadow yoki rasmning yarmini yopadigan qora tasma ishlatma. [fakt: YX 08-13 5be47eeb "Eng xunuk narsa esa yozuv o'rtasidagi drop shadow, juda xunuk turibti."]
12. Sarlavha ustiga eyebrow/kicker yozma (`// Kafolat va xizmat`, "Fikr Yetakchilari", "Ro'yxatdan o'ting"). [fakt: PR 08-25 7295f2d4 "/ bilan boshlangan kichik headerlar kerak emas!"; TS 09-16 aa15fc38; TS 09-16 4e15e501]
13. Section'larni raqamlama ("01", "02 — Fabrika") va kartalarga 01/02/03 yozma. [fakt: YX 08-10 6e551608; SD 08-09 bbafdf70 "Har bi sectionni shu kabi raqamlash kerak emas!"; RF 08-05 611f8119; PR 08-27 084efdea]
14. Sarlavha ostiga izoh (lede) yoki ajratuvchi chiziq qo'yma. Sarlavha va unga tegishli amal bitta qatorda tursin. [fakt: PR 09-10 061cf9b2 "Sarlavha ostidagi linne olib tashlansin, sarlavha - saralsh button bilan bir rowda bo'lishi kerak."; PR 08-27 a87cd13f; BP 08-03 0488379b]
15. Jadval sarlavhasi va yorliqlarni UPPERCASE + `tracking-wider` + `#999` qilma. [fakt: FY `4215f9c`; DB design-decisions "UPPERCASE sarlavha YO'Q"; BP CLAUDE.md "No uppercase or letter-spaced labels."]
16. Ikonka ortiga to'ldirilgan fon shakli qo'yma — o'rniga ikonkaning o'zini kattalashtir, stroke'ni Regular qil. [fakt: DB 09-06 349f3c0c "ortidagi bgshapeni olib tashlab ikonni o'zini kattaroq qilish yaxshiroq"; FY'da `bg-[#F5F5F5]` fon hali bor — 4-savolga qarang]
17. Sarlavha oldiga rangli nuqta qo'yma. [fakt: DB 09-07 de80396e "uni oldidagi jigarrang nuqta kerak emas!"]
18. Holatni uzun rangli chiziq bilan ko'rsatma — nuqta yetarli. [fakt: SD 08-09 b0bfc5e9 "manashu uzun red line kerak emas shunchaki red dot qil yetarli! bu ozgarish Global"]
19. Tizimda o'xshashi yo'q, bir martalik banner yasama (to'liq kenglikdagi pushti quti, chapda qizil chegara, to'ldirilgan ikonka). Mavjud chip'ga rangli nuqta qo'y. [fakt: DB 09-07 de80396e "notification bar ai slop design, system designgga mos emas"]
20. Obyekt ortiga dekorativ shakl qo'yma: spiker orqasidagi figura, logo atrofidagi ramka. [fakt: TS 09-16 aa15fc38 "spikerlar orqasidagi shaklni olib tashla"; PR 08-25 972b2d7a "Nega logolar shakl ichida?"]
21. Yomon kesilgan rasmni blur, opacity yoki gradient bilan yashirma — kompozitsiyani qaytadan qur. [fakt: TS 09-16 f8aea16b "spikerlarni rasmini tagini opacity qilmasdan, rasmni kemasdan natija qilb ber menga professional HERO kerak"]
22. Bitta ekrandagi tugmalarni har xil balandlik va radiusda qoldirma. [fakt: BP 08-03 75ad7d3d "navbarda ikki button ham ikki xil o'lchamda nega? bu toza AI SLOP!!!"; PR 08-27 a87cd13f]
23. Bir sahifadagi bir xil darajadagi sarlavhalarni har xil o'lchamda qilma. [fakt: PR 08-27 a87cd13f "har bir section heading o'lchami bir xil bo'lsin"; DB 09-06 40d05d3b]
24. Tizimni rang-barang qilma — logodagi bitta aksentdan tejab foydalan. [fakt: DB 09-06 97cab0f9 "tizim hozir juda rang barang, accent color professional ishlatilinishi kerak"]
25. Rangni o'zing o'ylab topma ("yashil ta'lim uchun ideal"). Rangni referensdan aniq ol. [fakt: SB 07-18 8fdfa6b7 "Hozir esa lan'ati yashil rangni ishlatyabsan ko'nglim aynityabti."]
26. Duotone ikonka ishlatma. [fakt: SB 07-18 9165079f "dutone iconlarni olib tashla"]
27. "Apple uslubida qil" degan so'rovga ikonka qo'shib javob berma. [fakt: PR 09-14 e40951a4 "Yo'q men ikonka qil demadim, zamonaviy apple style dropdown bo'lsin dedim"]
28. Nav'ga dekorativ dumaloq avatar va strelka ikonkasini qo'yma. [fakt: YX 08-10 05dd094b]
29. "Wow" effekt uchun chaqnaydigan, blend yoki morph o'tish qilma — oddiy silliq fade yetarli. [fakt: PR 08-28 611631a2 "qandaydir chaqnash effektiku bu umuman bomidi. opacity qolib ketyabti. Shunchki smooth o'tish bo'lsa yetarli edi"]
30. Lenta (marquee) va avtomatik aylanuvchi logolar qilma. Kartalar birma-bir almashsin, qo'lda skroll ham ishlasin. [fakt: TS 09-16 494bcb7b "lenta kabi harakatlanmasin, karta birma bir o'tib tursin"; TS 09-16 97d94b4e; BP 08-04 3637585b "Logolar auto scroll bo'lib turmasin"]
31. Keraksiz scroll-animatsiya qo'shma — sticky yetarli. [fakt: PR 09-10 58427c1f "nega mahsulot speclarida alohida scroll animatsiya bor? bu kerak emasdi. u sticky bolishi kerak"]
32. Sahifa almashganda butun sahifani skeletga almashtirib, qayta yuklangandek chaqnatma. [fakt: DB 09-06 97cab0f9 "sahifa chaqnash effekti bilan reload bo'lib ketadi, bu realtime ishlovchi tizim uchun sharmandali UX"]
33. Bo'sh joyni oq karta ichida qoldirma (to'liq balandlikdagi sidebar, raqam ostidagi bo'shliq) — bo'shliq sahifa foniga tushsin. [fakt: DB 09-06 40eea825; PR 08-27 f99ac083 "iltimos to'girla AI slopsiz design kerak"]
34. Sahifani faqat hairline va matndan yig'ma — "draft paper" yoki "wireframe" bo'lib qoladi. [fakt: SD 08-08 5f87eb12 "sayt draft paperga o'xshab qolgan"; BP 08-03 a31eb2b2 "hali ham wireframedan farqi yoq. !!!"]
35. Footerni katta brend wordmark bilan "hal qilma", unga YouTube, xarita yoki forma tiqma. [fakt: YX 08-18 5ae3db35 "katta YUXO yozuvi emas"; BP 08-03 19ea2679; PR "footerdan mapni uini olib tashla"; YX "footerdan formsni olib tashla"]
36. Eskirgan stok rasm yoki Lorem Picsum qo'yma. [fakt: PR 08-28 920cd178 "Claude sen 1950 yilda fikrlayabsanmi? Rasmlar juda eski"; BP `2e26f2c` "no stock photography anywhere on the site"]
37. Tekshirilmagan raqam (jamoa soni, tashkil topgan yil, loyihalar soni) va topishmoqqa o'xshagan "kreativ" sarlavha yozma. [fakt: BP memory `site-copy-plain-and-true.md`; OC memory `news-portal-keyingi-qadam.md`]
38. Telefon maydoniga `_______` placeholder qo'yma. `+998` doim yozilgan tursin, raqam `90 123 45 67` ko'rinishida guruhlansin. [fakt: TS 09-16 4e15e501; FY `PhoneInput.tsx`]
39. Admin panelda "slug" kabi texnik atamani ko'rsatma. [fakt: BP 08-04 5e1a2c67 "Slug yana shunga o'xshagan atamalarni men umuman tushunmayman, tushunishni ham hohlamayman."]
40. Desktop bloklarini mobilda shunchaki ustma-ust yig'ib, ishni tayyor deb hisoblama. [fakt: SD 08-09 "Shunchaki responsive qilib qo'yilgan holos. Mobile uchun jiddiy UI o'zgarishlar kerak."; TC "Do not simply stack desktop elements vertically on mobile."]

---

## 4. Qaror qoidalari

- Bitta obyekt ustida qisqa amal bo'lsa (to'lov qo'shish, keshbek, KPI maqsad, ruxsatlar, lid yoki foydalanuvchi yaratish) → markazdagi modal: `max-w-md`, `rounded-[12px]`, sarlavha `p-5 border-b border-[#F0F0F0]`. Nega: sahifa konteksti yo'qolmaydi. [fakt: 14 ta modal; sababi — xulosa]
- Ko'p bo'limli tahrir bo'lsa (mijoz kartasi, tadbir yaratish) → yon drawer, alohida detail sahifa emas. `/tadbirlar/:id` olib tashlangan, tadbirlar tab'larda ochiladi. Nega: ro'yxatdan chiqmasdan ishlash uchun. [fakt: FY `59362be`, `23d5cf0`, CLAUDE.md §7; sababi — xulosa]
- Yozuvlarni qatorma-qator solishtirish kerak bo'lsa (mijozlar, lidlar) → `@tanstack/react-table`, Mijozlar'da qo'shimcha grid ko'rinishi bor (`bcd6111`). Umumiy ko'rsatkich → karta grid. Bosqichlar → kanban. [fakt]
- Bo'lim faqat jadvaldan iborat bo'lib qolsa → grafik yoki ko'rsatkich kartasi bilan boyit. Nega: "Hisobotlar, Plan kabi bo'limlar quruq tabledan iborat" — u buni slop deb atagan. [fakt: DB 09-06 7f1f2a80]
- Rang ma'no tashimasa (bo'limni ajratmasa, xavfni bildirmasa) → kulrang. Nega (DB): avatar ranglari "hech qanday ma'no tashimasdi". [fakt: FY `b5a2608`, `59362be`; DB CLAUDE.md "Rang ma'no tashiydi"]
- Gradient funksional bo'lsa (skroll oxiridagi fade, sidebar'ning pastki fade'i) → qoladi. Dekorativ bo'lsa → tekis rang. Login'dagi rangli blob'lar yagona saqlangan istisno. [fakt: audit.md "RISK NOTES" 2-band; FY `2a0569f`, `fab19bd`]
- Qatlam kontent ustida suzsa (modal, dropdown, tooltip) → soya mumkin. Sahifadagi karta → faqat border. [fakt: FY'dagi ishlatilishi]
- Element hover yoki faol holatni ko'rsatishi kerak bo'lsa → border yoki fon rangi o'zgaradi (`hover:border-[#141414]`, `hover:bg-[#F5F5F5]`); ko'tarilish effekti yoki soya ishlatilmaydi. [fakt]
- Bo'sh holat (web) → ikonka va illyustratsiyasiz, markazda matn: 14px sarlavha + 12px `#CCC` maslahat, `py-20` yoki `p-12`. Mobilda — 48px doira ichida 22px ikonka. Nega (DB): "Bo'sh holat kichrayadi — "ma'lumot yo'q" butun kartani egallamasin." [fakt: `CrmNLeadsList.tsx:361`, `Hodimlar.tsx:76`, `mobile/src/components/ui/index.tsx:147`]
- Yorliqsiz ikonka → faqat header'da (qo'ng'iroq, sozlama, til) va jadval amallarida, native `title=` bilan. Tor ekranda yorlig'i yo'qoladigan tugmaga `aria-label` shart. [fakt: FY'da 31× `title`; RT CLAUDE.md "this has now bitten twice"]
- Yuklanish holati → ilova ochilishida `LoadingLogo`; karta va jadvalda o'lchami aynan kartaga teng skeleton; tugma ichida `CircleNotch animate-spin`. [fakt: `Skeleton.tsx`]
- O'lcham (kenglik) animatsiyasi → `ease: [0.16, 1, 0.3, 1]`, 0.45s. Paydo bo'ladigan qatlam → spring 300/25. [fakt]
- "Wow effect" so'ralsa → sekinroq, silliq fade; chaqnash emas. [fakt: PR 08-28 4ae8b9e0 → 611631a2]
- "Ko'rinishi yomon", "draft paper", "slop" desa → faqat vizual qatlamni tuzat, komponent strukturasiga tegma. Nega: "Uni stukturasi yomon demadim." [fakt: SD 08-08 3efb3ccb]
- "Qaytar" desa → aynan aytilgan qismni qaytar (masalan, oxirgi 2 commit), butun redizaynni emas. [fakt: PR 08-27 34f8bb95 "menga 12 ta redizayn commitni emas oxirgi 2 tasini olib tashlasang yetar edi"]
- Yangi komponentning tizimda juftligi bo'lmasa → mavjud primitivdan (pill, karta, badge) yig'. [fakt: DB `StaleBanner.tsx` izohi]
- Blok (footer, section) nima uchun kerakligi aniq bo'lmasa → yangi variant chizma, avval uning vazifasini aniqla. YX footeri uch marta rad etilgan va "kontakt bloki" bo'lgandan keyingina qabul qilingan. [fakt: YX 08-18]
- Mobil versiya → alohida dizayn qil: hero viewportni to'liq egallaydi, keyingi section ko'rinmaydi, quote va rasm bloklari qisqaradi. [fakt: TS 09-16 42f1cf95 "mobileda hero section to'liq ko'rinsin! keyingi section ham ko'rinib qolibti heroda."]
- Forma sahifada ko'zdan qochsa → uni alohida to'rtburchak ichiga ol. [fakt: SD 08-06 941f11c3 "form section design juda flat, ko'zdan qochirish oson redizayn qil. formni alohida rectangle ichiga ol"]

---

## 5. Oldin va keyin

### 1. Stat ikonkalari — FY `b5a2608`, 2026-03-09 07:45
AI:
```tsx
color: "text-blue-600",   bg: "bg-blue-50"
color: "text-green-600",  bg: "bg-green-50"
color: "text-purple-600", bg: "bg-purple-50"
```
U:
```tsx
color: "text-[#141414]", bg: "bg-[#F5F5F5]"   // uchalasida ham
```
Nega: commit izohi — "to match sidebar theme". Har metrikaning o'z rangi hech narsa bildirmaydi. [fakt; sababining ikkinchi qismi — xulosa]

### 2. Stat karta — FY `e0b3d6b` ("with specific user requirements", 07:42) → `b4afbd3` (08:00)
```diff
- <div className="bg-white border border-[#F0F0F0] apple-sq-16 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
+ <div className="bg-white border border-[#F0F0F0] rounded-[12px] p-5 flex flex-col gap-4 transition-all">
- <div className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
-   <span className="text-[11px] font-bold text-green-600">{stat.growth}</span>
+ <div className="flex items-center gap-1.5 bg-white border-[2px] border-[#999999]/30 px-3 py-1 rounded-full">
+   <span className="text-[13px] font-bold text-green-600">{stat.growth}</span>
```
18 daqiqadan keyin: `rounded-[12px]` → `rounded-[8px]`, commit izohi "for a sharper look". Soya o'rniga hairline qoldi; o'sish chipi to'ldirilgan yashil pill'dan oq, kulrang chegarali chipga aylandi — rang faqat raqamda. [fakt]

### 3. Bildirishnomalar dropdown'i — FY `f8c3f5d` ("more minimal and compact", 07:05)
```diff
- className="... w-[360px] ... border-[#D0D0D0] rounded-2xl shadow-xl ..."
+ className="... w-[300px] ... border-[#E0E0E0] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] ..."
- <span className="text-[11px] font-bold text-white bg-[#FF3B30] px-1.5 py-0.5 rounded-full">3 ta yangi</span>
+ <div className="w-2 h-2 bg-[#FF3B30] rounded-full shadow-[0_0_8px_rgba(255,59,48,0.4)]" />
- <div className={`w-10 h-10 rounded-xl ... ${notif.type === 'event' ? 'bg-blue-50 text-blue-600' : ...}`}>
+ <div className={`mt-1 w-2 h-2 rounded-full ${notif.unread ? 'bg-primary' : 'bg-transparent border border-[#D0D0D0]'}`} />
```
Nega: sanoq pill'i va har turga berilgan rangli ikonka o'rniga bitta holat nuqtasi. [fakt; sababi — xulosa]

### 4. Jadval sarlavhasi — FY `4215f9c` (08:19) + `b1731b0` (08:20)
```diff
- <th className="p-4 text-[12px] font-bold text-[#999999] uppercase tracking-wider text-left">Mijoz</th>
+ <th className="p-4 text-[13px] font-semibold text-[#141414] text-left">Mijoz</th>
```
Bir daqiqadan keyin 13 → 14px. Regressiya: 8106 qatorli `88489ea` (2026-03-14, AmoCRM integratsiyasi) sarlavhani `text-[13px] font-bold text-[#999999] uppercase tracking-tight` holatiga qaytargan; hozir `Mijozlar.tsx:647` da shunday turibdi. [fakt]

### 5. Radius — FY `08e418f` → `b3b8d37`, 26 soniya ichida
```diff
- --radius: 0.625rem;        .apple-sq-10 { border-radius: 10px; }  .apple-sq-12 { border-radius: 12px; }
+ --radius: 4px;             .apple-sq-10 { border-radius: 4px; }   .apple-sq-12 { border-radius: 4px; }
+ --radius: 8px;             .apple-sq-10 { border-radius: 8px; }   .apple-sq-12 { border-radius: 8px; }
```
Keyin bu CLAUDE.md'ga qoida sifatida yozilgan: "corner radii are always **8px**". [fakt]

### 6. Sidebar yig'ilish animatsiyasi — FY, 4 daqiqada 4 commit
```ts
// 6ec304b 05:39:56  "integrate framer-motion"
transition={{ type: "spring", stiffness: 300, damping: 30 }}
// a6e0916 05:41:44  "fluid cubic-bezier"
transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
// bec1b8f 05:42:31  "silky smooth magnetic spring"
transition={{ type: "spring", stiffness: 260, damping: 32, mass: 1 }}
// 51f0108 05:43:33  "quart out ease" — yakuniy
transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
```
Nega: layout kengligi o'zgarishida spring ikki marta rad etilgan, belgilangan davomiylikdagi egri tanlangan. [fakt; sababi — xulosa]

### 7. "Brend" gradienti — AI yozgan audit.md → FY `fab19bd`
AI audit'da shunday yozgan: "This is a warm cream-to-orange fade that gives events a "premium booklet" feel — it's visual identity, not accidental. Replacing with flat #FFF5EE loses the warmth gradient. Recommend: ask before changing, same as Login blobs."
U:
```diff
- style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FFE7D0 221.79%)" }}
+ style={{ background: "#FFF5EE" }}
- <div className="h-[100px] bg-gradient-to-br from-[#F5F5F5] to-[#EBEBEB] ...">
- <div className="... bg-gradient-to-br from-green-50 to-white border border-green-100 rounded-[10px]">
```
Commit nomi: "design audit — unified badges, formatting, gradients removed". Funksional skroll fade'lari tegilmagan. [fakt]

### 8. Sinxronizatsiya banneri → chip — DB `web/components/StaleBanner.tsx`
U (DB 09-07 de80396e): "notification bar ai slop design, system designgga mos emas."
Tuzatishdan keyingi izoh (kodda):
```ts
/**
 * Sync holati — TIZIMNING O'Z chip tilida.
 *
 * Ilgari bu to'liq kenglikdagi pushti quti edi: rangli fon, chap qizil
 * chegara, to'ldirilgan ikonka. Mahsulotda bunday element boshqa yo'q —
 * yuzalar oq, chegaralar hairline, holat esa kichik nuqta bilan beriladi
 * ... Shuning uchun endi u oddiy `pill`: header tugmalari bilan bir xil yuza,
 * bir xil radius, bir xil balandlik — faqat ichida rangli nuqta.
 */
```
[fakt]

### 9. Blog kartasining meta qatori — BP sessiya 08-11 (`src/components/BlogRail.tsx`, transkript `520b0559`)
U (BP 08-11 5345bfff): "Yaxshi lekin, tipografika xunuk va mos tushmagan cover rasm bilan proporsiyasi juda noto'g'ri turibti!"
AI:
```tsx
<span className="rounded-pill bg-white px-4 py-2 text-body-sm text-obsidian">{item.rubric}</span>
<h3 className="pt-1 text-subheading group-hover:underline">{item.title}</h3>
<p className="max-w-[44ch] text-body-sm text-mist">{item.lead}</p>
<span className="text-body-sm text-mist/70">{item.reading}</span>
```
Keyin:
```tsx
<span className="text-body-sm text-mist/70">{item.rubric} · {item.reading}</span>
<h3 className="text-body-lg text-white group-hover:underline">{item.title}</h3>
<p className="line-clamp-2 max-w-[46ch] text-body-sm text-mist">{item.lead}</p>
```
Nega (koddagi izoh): "The rubric used to be a filled white pill sitting on a line of its own — the loudest object on the card, louder than the artwork it introduced". To'rtta element va uch xil kulrang edi, uchta element va har darajaga bitta kulrang qoldi. [fakt]

### 10. Hero → kategoriya o'tishi — PR `src/store/HeroColumns.tsx`
U (PR 08-28 4ae8b9e0): "smooth o'tish animation kerak insonga wow effect beradigan".
AI: `view-transition-name` bilan umumiy element morfini va `useViewTransitionState` ni qo'shgan; brauzer eski va yangi kadrni `plus-lighter` bilan qo'shgan.
U (PR 08-28 611631a2): "qandaydir chaqnash effektiku bu umuman bomidi. opacity qolib ketyabti. Shunchki smooth o'tish bo'lsa yetarli edi".
Keyin: morf olib tashlandi, faqat oddiy cross-fade qoldi. PR CLAUDE.md'ga keyingi sessiyalar uchun `view-transition-name` ni bu joyga qaytarmaslik haqida ogohlantirish yozildi. [fakt]

---

## 6. U AI'ga nima deydi (so'zma-so'z)

### Yozma qoidalar (system prompt'lar)
- `~/.claude/CLAUDE.md`, FY CLAUDE.md'da ham so'zma-so'z takrorlangan: "Minimum code that solves the problem. Nothing speculative." · "Touch only what you must. Clean up only your own mess." · "Don't "improve" adjacent code, comments, or formatting" · "Never auto-commit without my confirmation" [fakt]
- FY CLAUDE.md §6: "corner radii are always **8px**" · "Theme colors via **inline `style={{ color: 'var(--header-text)' }}`** … never hardcoded hex or Tailwind color classes for themed surfaces." · "All user-facing copy in Uzbek." [fakt]
- DB CLAUDE.md: "Reja tasdiqlanmaguncha kod yozilmaydi; katta o'zgarishda bitta dizayn taklif qilinadi, variantlar menyusi emas." · "Vizual o'zgarish deploy'dan oldin lokal brauzerda ko'riladi va tekshiriladi (console, axe, mobil)." · "Tipografiya: olti o'lcham (`T`): 13 · 15 · 20 · 26 · 30 · 40 — **13 dan kichik yo'q**." · "Ikonka ortida fon shakli yo'q" [fakt]
- TC (o'zi yozgan brief): "not a generic AI landing page or template." · "Avoid: generic gradients everywhere / excessive glassmorphism / oversized meaningless typography / random decorative elements / excessive rounded cards / template-like layouts / stock imagery / unnecessary animations / visual clutter" · "Avoid animation that exists only to make the page look "fancy."" · "Motion should communicate state or improve the experience." [fakt]
- RT'ga yuborgan BlackPack brief'i: "Dizayn sistemasi (ranglar, shriftlar, spacing, radius, soya, animatsiya) bu hujjatda **belgilanmaydi** — u alohida prompt bilan beriladi." · "Hech qanday rang, shrift, `px` qiymati komponentga yozilmaydi." [fakt]
- OC: "BIRINCHI QADAM — faqat quyidagilarni bajar, dizaynga TEGMA" [fakt]

### "AI slop" — o'zining atamasi (11 xabar, 6 loyiha)
- "iltimos to'girla AI slopsiz design kerak" (PR 08-27 f99ac083)
- "footerni to'liq redizayn qil, AI Slop design bo'lib qolmasin" (PR 08-27 976400c7)
- "Claude sendagi AI Slopdan charchadim men" (PR 09-10 061cf9b2)
- "bu toza AI SLOP!!!" (BP 08-03 75ad7d3d)
- "desgin AI Slop ko'p" (DB 09-06 7f1f2a80)
- "notification bar ai slop design, system designgga mos emas" (DB 09-07 de80396e)
- "AI SLOP design sahifada to'lib yotibdi" (SD 08-08 5f87eb12)
- "clean lekin foydali har bir element o'z ahamiyatiga ega bo'lishi shart! Umuman AI SLOP bo'lmasin!!!" (SB 07-18 ebb7d15d)
- "har bir element o'z joyida, SLOPga o'xshamasdan, chiroyli UI elementdek turishi kerak" (OC 09-02 e87dad8a)

### Uning ikkinchi xato turi — "quruq"/"draft"
- "sayt draft paperga o'xshab qolgan" (SD 08-08) · "hali ham wireframedan farqi yoq. !!!" (BP 08-03) · "Hullas ko'zimga quruq ko'ringan narsalarni yo'qot." (BP 08-04 4d72f621) · "Mijoz hozirgi dizaynni, seni dizayningni huddi note taking prilojeniyaga o'xshatdi dedim." (SB 07-18 38c8e497)

### Rol berish
- "Iflos haromi claude UI designer kabi ishla!!" (YX 08-13 5be47eeb) · "UI lead designerdek fiklab izlanib menga chiroyli footer qilib ber" (YX 08-18 5ae3db35) · "Claude. nazarimda sen Senior UI/UX designerdek fikrlash vaqting keldi." (SD 08-08) · "UI designerdek fikrla." (RT 07-31 0d566744)

### Tizimga mos kelish
- "system designgga mos emas" (DB) · "filtr ui umuman tizim dizayniga mos emas" (PR 09-14 1f07c5e5) · "bizni web sayt dizayn tizimiga umuman mos emas" (BP 08-04 5e1a2c67) · "tipografika to'liq noto'g'ri. design systemga mos dizayn kerak." (PR 09-10 423e038c) · "CLAUDE saytni dizayn tizimi juda yaxshi lekin u to'liq professional ishlatilmagan." (OC 09-02)

### Referens va migratsiya
- "Saytni to'liq Next.Js Reactga migration qil, dizaynni saqlab qolgan holatda" (TS 09-16; RF'da ham xuddi shunday) · "kerak bolsa apple.comga kirib kor" (PR) · "Senga 1000 ta referens berdim lekin birortasiga yaqinlashmading ham." (SB 07-18 8fdfa6b7) · "Senga namuna qilib bergan saytimdaan sen iflos hech narsani o'rganmadingmi? ULar kabi UX qil va ulardan yaxshiroq UI qil dedim" (DB 08-27 d9254384)

### Qisqa buyruqlar (noyob xabarlar soni)
- "olib tashla" — 54 xabar, 12 loyiha · "kerak emas" — 22 · "yoqmadi/yoqmayabti" — 19 · "xunuk" — 19 · "qaytar" — 18. U qo'shishdan ko'ra olib tashlashni ko'proq so'raydi. [fakt: hisob]

---

## 7. Jarayon

1. Referensdan boshlaydi: URL yoki skrinshot + bir qatorli buyruq ("Kafolat va xizmat sectionini shu rasmdagidek uslubda redizayn qil"). Tilga olgan etalonlari: apple.com (eng ko'p, PR), App Store Connect / iCloud.com (PR admin), grau.art (YX), manobranding.uz va fido.studio (BP, matn uchun ham), Attio (RT), sports.withgoogle.com/teamusa (SB), Medium/Substack (BP maqola sahifasi), kun.uz/spot.uz (OC), raqobatchi demo va ikkita Google Sheets dashboard (DB). [fakt]
2. Katta ishda struktura va dizaynni ajratadi: avval ma'lumot va karkas ("dizaynga TEGMA"), dizayn tizimi esa alohida prompt bilan beriladi. [fakt: OC, RT brief]
3. Ba'zan tayyor dizayn tizimini to'liq token jadvali bilan tashlaydi: har bir element uchun radius, soya tokenlari, har o'lchamga letter-spacing (ElevenLabs uslubidagi referens). [fakt: model-c]
4. Natijani brauzerda jonli ko'radi va skrinshot bilan raqamlangan tanqid yozadi: "1. … 2. … 3. …". [fakt: PR, DB, SD]
5. Aniq raqam beradi yoki joriy qiymatni so'raydi: "Sidebarni 284px qil" (DB), "80 px emas 64 px qilchi" → "unda 36 px qil" → "hammasini 44 px qilchi" (PR 08-27), "30 → 48 px" (PR), "logolarni ham 15% ga kattaroq qil" (BP), "hozir necha px da turibti?" (SD), dropdown "3 soniyada avtomatik yopilishi kerak" (DB). [fakt]
6. Katta tozalashdan oldin audit qildiradi: AI `file:line` havolalari bilan hujjat yozadi (FY `audit.md`), u tasdiqlaydi ("Phase 2 ni boshlashim uchun sizning tasdiqlashingizni kutaman."), keyin hammasi bitta commitda (`fab19bd`). Audit uchun maxsus skill'lar o'rnatadi (better-ui, better-typography, better-layout, design-critique): "findskills yordamida eng zo'r UI auditorni topib tahlil qil". [fakt]
7. Qabul qilishdan oldin lokal brauzerda desktop va 375px'da ko'rish, console va axe tekshiruvi (DB memory `vizual-oldin-korsatish.md`). Kontrast va px o'lchamlari DOM'dan o'lchanib, jadval bilan ko'rsatiladi (PR). [fakt]
8. Rad etilgan g'oyalar reestri repo ichida saqlanadi: DB `docs/design-decisions.md` ("nima sinab ko'rildi, nega tashlandi"), BP CLAUDE.md "What was tried and rejected". Maqsad — keyingi sessiya ularni qaytadan kiritmasin. [fakt]
9. Variantlar menyusi emas, bitta yechim: "Variant menyusi berish o'rniga ish bajariladi va natija ko'rsatiladi." (DB memory `ish-uslubi.md`). Istisno: PR'da variantlardan birini tanlagan ("A Editorial yoqdi"). [fakt]
10. Mayda iteratsiya — mayda commit: FY'da 2026-03-09 kuni 78 ta commit, har biri bitta qiymatni o'zgartiradi ("reduce sidebar gaps from 30px to 20px"). [fakt]
11. Commit faqat uning tasdig'i bilan. [fakt: `~/.claude/CLAUDE.md`]
12. Bir xabarda bug va estetika aralash kelsa, avval bug tuzatiladi: AI "Avval 3-band — rasm qirqilishi, chunki u aniq xato." degan va u buni qabul qilgan (PR, e4963f00'dan keyin). [xulosa]
13. Ekranni qabul qilish uchun yozma checklist topilmadi. Eng yaqin narsalar — TC'dagi "Avoid" ro'yxati va `six-step-qa` skill'i (unga o'zbekcha trigger'lar qo'shgan: "sifat nazorati", "QA qil"). [savol]

---

## 8. U nimada umumqabul qilingan fikrga qarshi

- 500 og'irlik yo'q: `medium` 400 ga tenglashtirilgan, interfeysda faqat 400 va 600 bor. Odatda UI yorliqlari uchun 500 tavsiya qilinadi. Nega (DB): "500 400 dan deyarli farq qilmasdi, lekin har katakda "qaysi biri?" savolini tug'dirardi." [fakt: `index.css:444`; DB design-decisions]
- Jadval sarlavhasi katta harflarsiz, qora, 14px semibold — odatdagi "kichik, UPPERCASE, kulrang" o'rniga. Nega (DB): "O'zbek lotinda apostrofli so'zlar (qo'ng'iroq, e'tibor, ma'lumot) bosh harfda qiyin o'qiladi, ustiga letter-spacing qo'shilsa yana yomonlashadi." [fakt: FY `4215f9c`; DB design-decisions]
- Semantik svetofor yo'q: success yashil emas, warning sariq emas, rangli faqat xato. [fakt: FY `59362be`]
- Framer-motion'ning standart spring'ini layout animatsiyasida ikki marta rad etgan, belgilangan davomiylikdagi bezier'ni tanlagan. [fakt: FY `bec1b8f` → `51f0108`]
- AI asoslab bergan "brend identity" gradientini ham olib tashlagan. [fakt: audit.md → `fab19bd`]
- Bo'sh holatda illyustratsiya yo'q (web). [fakt]
- Manfiy trekking faqat katta sarlavhalarda emas, hamma matnda, 11px'da ham (`:root` da `-0.02em`). BP'da ham har o'lchamga -0.03em (`body 16/1.5/-0.48px`). [fakt; buni ataylab qilgani — xulosa]
- Minimalizm maqsad emas: "bo'sh" va "quruq" — xato; mobil ilova "boy va to'liq" bo'lishi kerak. [fakt: memory; BP 08-04]
- So'nggi yillardagi moda — footerdagi katta wordmark — rad etilgan. [fakt: YX 08-18]
- Yon tomonda kam havo ataylab: "hozirgi sahifa ikki yonidagi bo'sh joyni maksimal kamaytirmoqchiman yani kam havo qoldirmoqchiman, bu ham bir dizayn uslubki" (BP 08-03 15aeb872). DB'da `max-width` umuman olib tashlangan: "1400px cheklovi 1920px ekranda o'ngda 236px bo'sh joy qoldirardi". [fakt]
- Dizayn jarayonida odatda bir nechta variant ko'rsatiladi, u esa bitta yechim talab qiladi. [fakt: DB CLAUDE.md]
- Kartalarni yumaloqlash trendiga qarshi: PR'da "Faqatgina buttonlar to'liq radiusga ega bo'lsin / Qolgan barcha komponetlar, cardlar corner radiussiz bo'lsin" (PR 09-10 6d9acc40); togsafari'da global `* { border-radius: 0 !important; }`. [fakt]

---

## 9. Loyihadan loyihaga o'zgarmaydigan narsalar

- Tailwind 4, tokenlar CSS `@theme` ichida, `tailwind.config` yo'q (FY, BP, PR, SD, OC, product-main). [fakt]
- Bitta ikonka kutubxonasi tanlanadi, package.json'dagi boshqasi taqiqlanadi: FY va DB — `@phosphor-icons/react` (FY `components.json` da `"iconLibrary": "lucide"` qolgan, lekin lucide importi 0 ta); landingfy'da "`lucide-react` … do not add new lucide imports". [fakt]
- Bitta aksent + neytral kulranglar, fon iliq oq-kulrang: FY `#F3F2F0`, SB'da so'ragan "sidebar background: F4F3EF". [fakt]
- Ajratish hairline (`#F0F0F0`/`#E0E0E0`) bilan, soya bilan emas: FY; BP "does so with a border, a tone change or space — never with a tint"; PR. [fakt]
- Shriftlar — sans-serif grotesk: Geist (FY), Manrope (RT, SB, YX, landingfy), DM Sans (DB, BP, YX). Shrift tanlash kerak bo'lganda birinchi Manrope'ni aytadi (3 loyihada). [fakt]
- Har loyihada bitta radius shkalasi qat'iy qoida sifatida yoziladi: FY 8; DB 6·10·14·20·9999; BP 20/100; PR 8/12/18/20/28; SB 8/12/16/20/28. [fakt]
- O'lcham va og'irliklar to'plami cheklangan: FY 400/600; DB 6 o'lcham va 400/600/700; daily-deal faqat 500. [fakt]
- Tekshirish raqam bilan: DB "sahifada har matn tugunining hisoblangan `fontSize/fontWeight` juftini sanash. Toza holatda 9 ta juft chiqadi". [fakt]
- Rad etilgan g'oyalar reestri repo'da saqlanadi (DB, BP). [fakt]
- Eng ko'p tilga olinadigan etalon — Apple (PR, `apple-design` skill, product-main'da `#1D1D1F #0071E3 #F5F5F7`). [fakt]
- Matn o'zbekcha, sentence case'da; sana `16.01.2026`, telefon `+998 XX XXX XX XX`. [fakt: audit.md, `PhoneInput.tsx`]
- Komponentda hex yozish taqiqlanadi, faqat token ishlatiladi: product-main "Hex colors are banned in components", SD "hech qachon hardcode qilinmaydi", RT "components never write `dark:` variants". FY'da bu qoida faqat temali yuzalar uchun yozilgan va amalda buzilgan (`#141414` 460 marta). [fakt]

---

## 10. Nimalar yetishmaydi — savollar

1. FY'da 10–11px matn 146 joyda ishlatilgan. DB'dagi "13 dan kichik yo'q" qoidasi FY'ga ham tegishlimi?
2. 14 ta modaldagi `shadow-2xl` va `backdrop-blur-sm` ni siz tanlaganmisiz yoki AI qoldirganmi? Stop-list soya va glass effektni taqiqlaydi.
3. Mijozlar jadvalining sarlavhasini `4215f9c` da 14px/semibold/qora qilgansiz, `88489ea` esa uni UPPERCASE/`#999` ga qaytargan. Bu regressiyami, qaytaraymi?
4. Ikonka ortidagi fon DB'da taqiqlangan, lekin FY stat kartalarida `bg-[#F5F5F5]` kvadrat, mobilda `IconCircle` bor. FY uchun qaysi biri to'g'ri?
5. PR'dagi "faqat tugmalar to'liq radius, qolgani 0" qoidasi shu do'konga xosmi yoki FY'dagi 8px ham shunga o'tadimi?
6. Header'dagi sahifa nomi va tavsifi (`PAGE_META`): DB'da "sahifa nomlari header barda umuman turishi shart emas" deb olib tashlagansiz. FY'da qoldiraymi?
7. Ekranni qabul qilishdan oldin o'z checklist'ingiz bormi — nimani, qaysi tartibda tekshirasiz? Figma'da maketlar bormi? Figma ulanmagan, shuning uchun manba sifatida ko'rilmadi.
