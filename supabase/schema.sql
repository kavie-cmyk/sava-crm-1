-- ============================================================================
-- Sava Meta CRM — Schema Supabase (Giai đoạn 1: thiết kế, CHƯA nối frontend)
-- ============================================================================
-- Chạy trên một project Supabase MỚI TINH theo thứ tự:
--   1) schema.sql      (file này: bảng, khoá, index, helper, trigger)
--   2) policies.sql    (bật RLS + policy theo vai Admin/BD/MKT)
--   3) seed-market.sql (23 record thị trường tĩnh từ publishing-data.js)
-- Nạp dữ liệu thật từ localStorage: xem MIGRATION.md.
-- Cơ chế chặn field nhạy cảm cho MKT + trade-off: xem DESIGN.md.
--
-- NGUỒN SỰ THẬT CỦA MAPPING (đã đối chiếu code tại HEAD 7dff2d5):
--   - Kho 1: localStorage 'sava_crm_shared_v1' — shared.js seed()/migrateState()
--     và các hàm save* trong index.html.
--   - Kho 2: localStorage 'sava_publishing_v1' — publishing.js read()/
--     sanitizeRequest()/submitRequest()/submitReview()/submitMarket(),
--     publishing-bridge.js (migration Partner legacy), publishing-score.js.
--   - Dữ liệu tĩnh: publishing-data.js (window.PublishingData, 23 records).
-- Mọi cột có comment "-- app: <field gốc>" để truy vết 1-1 về field hiện tại.
-- Quy ước chung:
--   * id GIỮ NGUYÊN id text của app (c1/g1/d1/l1/t1/a1, REV-<uuid>, MECH-001…)
--     để liên kết không vỡ khi nạp dữ liệu (xem MIGRATION.md).
--   * Chuỗi rỗng '' của app (khoá ngoại/người phụ trách/ngày) -> NULL khi nạp.
--   * Field ngày của app lẫn lộn chữ tự do ("Hôm qua") và ISO (YYYY-MM-DD):
--     các cột dạng cặp <x>_date (date, chỉ có khi parse được ISO) +
--     <x>_raw (text, GIỮ NGUYÊN chuỗi gốc) — không mất dữ liệu, vẫn sort/lọc
--     được theo ngày thật khi có.
--   * Cột legacy_extra jsonb ở các bảng chính: "túi dự phòng" của bộ nạp —
--     khoá lạ trong JSON xuất (không có trong mapping) PHẢI được nhét vào đây
--     và báo cáo, không được âm thầm bỏ. Bình thường luôn là '{}'.
--   * Tính điểm (PartnerEval / Game v2 / legacy) vẫn do frontend JS tính như
--     hiện tại; DB chỉ lưu dữ liệu gốc (điểm từng tiêu chí nằm trong
--     publishing_revisions.entries / scores_v2 dạng jsonb).
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid() cho audit id

-- ============================================================================
-- 1) MEMBERS + PROFILES (gắn auth.users)
-- ----------------------------------------------------------------------------
-- app: S.members = [{id, name, role, active}] — id text kiểu 'zac'/'linh'/
-- 'tuan'/'mai' hoặc 'u<base36>' khi tạo mới trong app (saveMember, index.html).
-- role app giữ NGUYÊN văn: 'Admin' | 'BD' | 'MKT' | 'Khác' (migrateState ép
-- mọi role lạ về 'Khác'). Role KHÔNG lưu ở profiles để tránh hai nguồn sự
-- thật: profiles chỉ gắn auth user -> member; role đọc từ members.
-- ============================================================================
create table public.members (
  id          text primary key,                       -- app: members[].id
  name        text not null,                          -- app: members[].name
  role        text not null default 'Khác'
              check (role in ('Admin', 'BD', 'MKT', 'Khác')), -- app: members[].role
  active      boolean not null default true,          -- app: members[].active
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,                                   -- member id người tạo (giai đoạn 2)
  legacy_extra jsonb not null default '{}'::jsonb
);
comment on table public.members is 'Danh sách thành viên CRM (S.members trong sava_crm_shared_v1). Không xoá cứng: ngừng hoạt động bằng active=false như app hiện tại.';

-- Mỗi auth user gắn ĐÚNG 1 member (unique trên id = auth.users.id).
-- Một member được phép gắn nhiều auth user (vd tài khoản phụ/test) — chủ đích
-- KHÔNG unique member_id, xem DESIGN.md.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  member_id   text not null references public.members (id) on delete restrict,
  email       text,  -- bản sao email đăng nhập để admin nhận diện khi đối chiếu (auth.users mới là nguồn thật)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text
);
comment on table public.profiles is 'Gắn auth.users (Supabase Auth) -> members. Admin tạo user + dòng này; tắt đăng ký công khai (xem SETUP.md).';
create index profiles_member_id_idx on public.profiles (member_id);

-- ============================================================================
-- 2) HELPER PHÂN QUYỀN (dùng trong policies.sql)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER + search_path cố định: hàm chạy với quyền owner (postgres)
-- nên ĐỌC ĐƯỢC profiles/members bất chấp RLS của chính các bảng đó -> tránh
-- đệ quy RLS (policy trên profiles gọi hàm đọc profiles). Hệ quả bắt buộc:
-- KHÔNG bật FORCE ROW LEVEL SECURITY trên members/profiles (mặc định Supabase
-- không bật) — nếu bật force, helper sẽ bị RLS chặn và mọi policy hỏng.
-- ============================================================================
create or replace function public.current_member_id()
returns text
language sql stable security definer set search_path = ''
as $$
  select p.member_id from public.profiles p where p.id = auth.uid()
$$;

-- Role chuẩn hoá: 'Admin'->'admin', 'BD'->'bd', 'MKT'->'mkt', 'Khác'->'other'.
-- NULL khi chưa có profile / member không tồn tại.
create or replace function public.current_member_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select case m.role
           when 'Admin' then 'admin'
           when 'BD'    then 'bd'
           when 'MKT'   then 'mkt'
           else 'other'
         end
  from public.profiles p
  join public.members m on m.id = p.member_id
  where p.id = auth.uid()
$$;

-- Member inactive (members.active=false) HOẶC chưa gắn profile -> false.
-- Mọi policy dữ liệu nghiệp vụ đều đi qua cửa này (xem policies.sql):
-- tắt active là thu hồi quyền truy cập dữ liệu ngay ở tầng DB, không cần
-- xoá/khoá tài khoản Auth.
create or replace function public.is_active_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.members m on m.id = p.member_id
    where p.id = auth.uid() and m.active
  )
$$;

-- Đang active VÀ role chuẩn hoá thuộc danh sách cho phép.
create or replace function public.has_crm_role(roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.members m on m.id = p.member_id
    where p.id = auth.uid()
      and m.active
      and (case m.role
             when 'Admin' then 'admin'
             when 'BD'    then 'bd'
             when 'MKT'   then 'mkt'
             else 'other'
           end) = any (roles)
  )
$$;

revoke execute on function public.current_member_id()   from public, anon;
revoke execute on function public.current_member_role() from public, anon;
revoke execute on function public.is_active_member()    from public, anon;
revoke execute on function public.has_crm_role(text[])  from public, anon;
grant  execute on function public.current_member_id()   to authenticated;
grant  execute on function public.current_member_role() to authenticated;
grant  execute on function public.is_active_member()    to authenticated;
grant  execute on function public.has_crm_role(text[])  to authenticated;

-- Trigger updated_at dùng chung.
create or replace function public.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- members/profiles khai báo ở mục 1 (TRƯỚC hàm trên) nên trigger updated_at
-- của hai bảng này gắn tại đây, ngay sau khi hàm tồn tại (F8). Mọi bảng còn
-- lại có updated_at đều gắn trigger ngay dưới bảng của chúng.
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3) COMPANIES
-- ----------------------------------------------------------------------------
-- app: {id, name, type, roles, contact, phone, last, partnerEval?,
--       partnerEvalMigrated?}
-- roles: object {<line>: <nhãn vai trò>} — line thuộc 4 mảng game_studio/
-- publishing/ai/metaverse; nhãn là text tự do ('Publisher', 'Game studio'…).
-- partnerEval KHÔNG nằm ở bảng này: nó chứa Deal Fit + ghi chú Hard Gate
-- (field thương mại MKT bị cấm xem) mà companies lại mở cho mọi user đọc ->
-- tách sang company_partner_eval_archive có RLS admin+bd (mục 4). Cờ
-- partnerEvalMigrated không nhạy cảm nên giữ ở đây. Túi legacy_extra của
-- bảng này cũng bị CHECK cấm khoá 'partnerEval' (NF1) để không có đường
-- vòng "để nhờ" partnerEval vào cột công khai MKT đọc được.
-- ============================================================================
create table public.companies (
  id                     text primary key,            -- app: companies[].id (c1…)
  name                   text not null,               -- app: name
  type                   text not null default '',    -- app: type ('Publisher'|'Game studio'|'Indie dev'|'Doanh nghiệp'|…)
  roles                  jsonb not null default '{}'::jsonb, -- app: roles {line: nhãn}
  contact                text not null default '',    -- app: contact (đầu mối chính, text tự do)
  phone                  text not null default '',    -- app: phone
  last_label             text not null default '',    -- app: last (chữ tự do: 'Hôm qua', 'Hôm nay'… — không parse ngày)
  partner_eval_migrated  boolean not null default false, -- app: partnerEvalMigrated (cờ migration bridge)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb,
  -- Chốt chặn đường vòng (NF1): toàn bộ partnerEval chỉ được ở
  -- company_partner_eval_archive (admin+bd), không nằm trong legacy_extra
  -- của bảng công khai này.
  constraint companies_legacy_extra_no_partner_eval check (
    not (legacy_extra ? 'partnerEval')
  )
);
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 4) LƯU TRỮ PartnerEval LEGACY CỦA CÔNG TY (NHẠY CẢM — RLS admin+bd)
-- ----------------------------------------------------------------------------
-- app: companies[].partnerEval = PartnerEval.normalize() shape:
--   {hardGate:{<6 cổng>:{status,note}}, evidence:{<7 pillar>:{status,note},
--    productionSubs:{<4 ô con>:{status,note}}}, scores:{<7 pillar>:1..5|null},
--    dealFit, notesWeak, nextAction, reviewDate, reviewer, updatedAt}
-- Đây là dữ liệu GỐC tiền-canonical: bridge (publishing-bridge.js) đã/đang
-- chuyển nó thành request kind='company' canonical; giai đoạn 2 bộ nạp chạy
-- tương đương legacyToRevision() từ bảng lưu trữ này cho công ty chưa migrate.
-- Sau khi canonical hoá xong, bảng này là hồ sơ lưu trữ chỉ-đọc phía BD.
-- ============================================================================
create table public.company_partner_eval_archive (
  company_id   text primary key references public.companies (id) on delete cascade,
  partner_eval jsonb not null,                        -- app: companies[].partnerEval (nguyên vẹn)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   text
);
create trigger company_partner_eval_archive_set_updated_at before update on public.company_partner_eval_archive
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 5) GAMES
-- ----------------------------------------------------------------------------
-- app: {id, title, own, genre, platform, stage, emoji, desc, bdNote,
--       buildUrl, trailerUrl, company?, scores?, verdict?, mktEval?}
-- - own: 'ours' (game của Sava) | 'partner' (game đối tác). Khi own='ours'
--   app XOÁ company/scores/verdict/mktEval (saveGame index.html) -> các cột
--   tương ứng để NULL cho game 'ours' là đúng ngữ nghĩa, không phải mất data.
-- - company chỉ có ở game partner; khi studio bị xoá, app giữ company='' ->
--   nạp thành NULL (mất liên kết có chủ đích như app).
-- - scores: điểm BD /10 LƯU TRỮ (không còn tính chính thức):
--   {Gameplay, 'Đồ họa', Monetization, 'Tiềm năng TT', 'Kỹ thuật'} số 0..10.
-- - mktEval: đánh giá MKT /10 LƯU TRỮ trên hồ sơ game:
--   {scores:{market,audience,ua,usp,trend}, verdict, by, at, comment} hoặc
--   null. (Đánh giá MKT chính thức hiện nay nằm ở publishing requests.)
-- - bdNote được MKT đọc có chủ đích (C7 publishing.js) -> ở bảng games là đúng.
-- ============================================================================
create table public.games (
  id          text primary key,                       -- app: games[].id (g1…)
  title       text not null,                          -- app: title
  own         text not null default 'partner'
              check (own in ('ours', 'partner')),     -- app: own
  company_id  text references public.companies (id) on delete set null, -- app: company (chỉ partner)
  genre       text not null default '',               -- app: genre
  platform    text not null default '',               -- app: platform
  stage       text not null default '',               -- app: stage (giai đoạn phát triển, text tự do)
  emoji       text not null default '',               -- app: emoji
  description text not null default '',               -- app: desc
  bd_note     text not null default '',               -- app: bdNote
  build_url   text not null default '',               -- app: buildUrl
  trailer_url text not null default '',               -- app: trailerUrl
  scores_bd   jsonb,                                  -- app: scores (điểm BD /10 lưu trữ; null = chưa/không chấm)
  bd_verdict  text,                                   -- app: verdict ('Đang chấm'|'Nên nhận'|'Hold'|'Từ chối'|giá trị cũ; null khi ours)
  mkt_eval    jsonb,                                  -- app: mktEval (đánh giá MKT /10 lưu trữ hoặc null)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create index games_company_id_idx on public.games (company_id);
create index games_own_idx on public.games (own);
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 6) DEALS + TERM + CONTRACT + DEAL_LEADS
-- ----------------------------------------------------------------------------
-- app: {id, line, title, company?, game?, stage, owner, due, idle, custom,
--       amount?, cur?, term?, contract?, leads[]}
-- - company KHÔNG bắt buộc ở tầng dữ liệu: deleteCompany (index.html) gỡ
--   liên kết (`delete d.company`) nhưng GIỮ deal — nên company_id nullable +
--   ON DELETE SET NULL như games/leads. Deal mới tạo qua form luôn có công
--   ty, nhưng deal sau khi công ty bị xoá thì company_id = NULL là hợp lệ.
-- - line: 'game_studio' | 'publishing' | 'ai' | 'metaverse' (LINES, shared.js).
-- - stage: khoá stage THEO TỪNG line (LINES[line].stages) + giá trị cũ ngoài
--   danh sách vẫn được app giữ qua option "(dữ liệu cũ)" -> text, KHÔNG check.
-- - amount/cur CHỈ có ở deal ai/metaverse; deal game (game_studio/publishing)
--   không có amount — dùng term rev-share (bảng deal_terms). Giữ amount NULL
--   cho deal game, tuyệt đối không ép 0.
-- - custom: field riêng theo line (LINES[line].fields):
--     game_studio: publisher_regions, build_version_sent
--     publishing:  support_needed, planned_investment
--                  (+ side-key planned_investment_cur / planned_investment_text)
--     ai:          use_case, data_readiness, current_systems, poc_scope, poc_result
--     metaverse:   use_case, platform_target, expected_users, hardware_needed,
--                  concept_url
--   Giá trị là chuỗi (multi join bằng ', '), riêng expected_users dạng số vẫn
--   lưu chuỗi trong app -> giữ nguyên jsonb, frontend giai đoạn 2 diễn giải.
-- - owner / các cột "người" khác: app lưu member id dạng text nhưng CÓ THỂ là
--   id cũ không còn trong members (memberName() fallback hiển thị chính id đó)
--   -> chủ đích KHÔNG đặt FK cho cột người, chỉ index. Xem DESIGN.md.
-- TOÀN BỘ cụm deals bị RLS khoá admin+bd (kể cả activities/tasks liên quan) —
-- MKT không có bất kỳ policy nào trên các bảng này (policies.sql).
-- ============================================================================
create table public.deals (
  id          text primary key,                       -- app: deals[].id (d1…)
  line        text not null
              check (line in ('game_studio', 'publishing', 'ai', 'metaverse')), -- app: line
  title       text not null,                          -- app: title
  company_id  text references public.companies (id) on delete set null, -- app: company (xoá công ty -> NULL, deal vẫn tồn tại — đúng deleteCompany: `delete d.company`)
  game_id     text references public.games (id) on delete set null,              -- app: game (deal game bắt buộc ở app cho publishing; game_studio có thể thiếu khi dữ liệu cũ)
  stage       text not null default '',               -- app: stage (khoá theo line, giữ giá trị cũ)
  owner_id    text,                                   -- app: owner (member id, '' -> NULL)
  due_date    date,                                   -- app: due khi parse được ISO
  due_raw     text not null default '',               -- app: due (chuỗi gốc)
  idle_days   integer not null default 0,             -- app: idle (số ngày chưa cập nhật)
  amount      numeric(20, 2),                         -- app: amount (chỉ ai/metaverse; NULL với deal game)
  currency    text,                                   -- app: cur ('VND'|'USD'; NULL với deal game)
  custom      jsonb not null default '{}'::jsonb,     -- app: custom (field theo line, gồm side-key _cur/_text)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create index deals_company_id_idx on public.deals (company_id);
create index deals_game_id_idx on public.deals (game_id);
create index deals_line_stage_idx on public.deals (line, stage);
create index deals_owner_id_idx on public.deals (owner_id);
create trigger deals_set_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- Term rev-share — 1-1 với deal, CHỈ deal game mới có dòng (app: deal.term).
-- app: {rev_share, advance, territories, duration, exclusivity, marketing,
--       payment, advance_num?, advance_cur?}
-- - rev_share là CHUỖI hiển thị ("Sava 70% / Publisher 30%", "Studio 50% /
--   Sava 50%", "Chưa đề xuất"…) -> giữ nguyên ở rev_share_raw; hai cột số là
--   bản parse theo đúng parseRevShare() của index.html (số % đi với 'Sava' là
--   sava, số % còn lại là partner) phục vụ lọc/tính ở giai đoạn 2; parse
--   không ra -> NULL, raw vẫn còn.
-- - advance cũng là chuỗi ("$50.000 (MG…)", "500tr", "—"); khi user nhập số
--   app tách advance_num (chuỗi số trong app -> numeric ở DB) + advance_cur
--   và advance = "<num> <cur>". advance_raw giữ chuỗi gốc/hiển thị.
-- - territories: chuỗi multi join ', ' theo GEO_OPTS (readMulti index.html).
create table public.deal_terms (
  deal_id           text primary key references public.deals (id) on delete cascade,
  rev_share_raw     text not null default '',         -- app: term.rev_share
  rev_share_sava    numeric(5, 2),                    -- parse từ rev_share (phía Sava, %)
  rev_share_partner numeric(5, 2),                    -- parse từ rev_share (phía đối tác/publisher, %)
  advance_raw       text not null default '',         -- app: term.advance
  advance_num       numeric(20, 2),                   -- app: term.advance_num
  advance_cur       text,                             -- app: term.advance_cur ('VND'|'USD')
  territories       text not null default '',         -- app: term.territories
  duration          text not null default '',         -- app: term.duration
  exclusivity       text not null default '',         -- app: term.exclusivity
  marketing         text not null default '',         -- app: term.marketing
  payment           text not null default '',         -- app: term.payment
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create trigger deal_terms_set_updated_at before update on public.deal_terms
  for each row execute function public.set_updated_at();

-- Hợp đồng — 1-1 với deal (app: deal.contract {status, no, signed, url}).
-- Deal ai/metaverse cũng có thể có contract (editDeal tự bảo đảm tồn tại),
-- chỉ term mới riêng cho deal game.
create table public.deal_contracts (
  deal_id     text primary key references public.deals (id) on delete cascade,
  status      text not null default '',               -- app: contract.status
  contract_no text not null default '',               -- app: contract.no (đổi tên tránh mơ hồ)
  signed_date date,                                   -- app: contract.signed khi parse được ISO
  signed_raw  text not null default '',               -- app: contract.signed (chuỗi gốc)
  url         text not null default '',               -- app: contract.url
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create trigger deal_contracts_set_updated_at before update on public.deal_contracts
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 7) LEADS + DEAL_LEADS
-- ----------------------------------------------------------------------------
-- app lead: {id, name, company, person, line, source, status, note, when}
-- - name = TÊN NGƯỜI đầu mối (sau đợt đổi tên lead mẫu 29/10), company là FK
--   tới công ty; person = chuỗi mô tả đầu mối ("Anh Minh — Founder") — hai
--   field khác nhau, giữ cả hai.
-- - status: 'new' | 'contacted' | 'qualified' | 'converted'.
-- app: deal.leads (mảng id lead TRÊN DEAL) là NGUỒN SỰ THẬT DUY NHẤT của
-- quan hệ deal<->lead (migrateState shared.js) -> bảng nối deal_leads.
-- Bảng nối thuộc dữ liệu deal nên RLS admin+bd như deals, dù leads tự thân
-- mở cho mọi user đọc.
-- ============================================================================
create table public.leads (
  id          text primary key,                       -- app: leads[].id (l1…)
  name        text not null,                          -- app: name (tên người đầu mối)
  company_id  text references public.companies (id) on delete set null, -- app: company ('' -> NULL = chưa gắn)
  person      text not null default '',               -- app: person
  line        text not null
              check (line in ('game_studio', 'publishing', 'ai', 'metaverse')), -- app: line
  source      text not null default '',               -- app: source (giữ giá trị cũ ngoài danh sách)
  status      text not null default 'new'
              check (status in ('new', 'contacted', 'qualified', 'converted')), -- app: status
  note        text not null default '',               -- app: note
  when_date   date,                                   -- app: when khi parse được ISO
  when_raw    text not null default '',               -- app: when (chuỗi gốc: 'Hôm nay'…)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create index leads_company_id_idx on public.leads (company_id);
create index leads_line_status_idx on public.leads (line, status);
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

create table public.deal_leads (
  deal_id text not null references public.deals (id) on delete cascade,
  lead_id text not null references public.leads (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text,
  primary key (deal_id, lead_id)
);
create index deal_leads_lead_id_idx on public.deal_leads (lead_id);

-- ============================================================================
-- 8) TASKS (việc) + ACTIVITIES (timeline của deal)
-- ----------------------------------------------------------------------------
-- app task: {id, title, assignee, due, dueDate, deal?, done, overdue}
-- - due = nhãn chữ cũ ('Hôm nay'…), CHỈ còn là fallback hiển thị;
--   dueDate = 'YYYY-MM-DD' là hạn thật để tính quá hạn (isOverdue index.html).
-- - overdue lưu trong app nhưng HIỆN TÍNH ĐỘNG: task xong -> không quá hạn;
--   có dueDate hợp lệ -> dueDate < hôm nay; còn lại mới dùng cờ. Cột
--   overdue_stored giữ đúng cờ đã lưu để đối chiếu; giai đoạn 2 tính động
--   như app, không coi cột này là sự thật.
-- - deal có thể KHÔNG có (task độc lập) hoặc bị delete khi lưu rỗng -> NULL.
-- app activity: {id, deal, type, who, when, text, url?}
-- - type: 'Note'|'Call'|'Email'|'Meeting'|'Demo'|'Zalo'|'Messenger' (giữ
--   text + check theo đúng danh sách form hiện tại; dữ liệu cũ lạ sẽ bị bộ
--   nạp ghi vào legacy_extra kèm báo cáo thay vì nới check tuỳ tiện).
-- - when: seed là chữ ('Hôm qua'), bản ghi mới là ISO (todayStr()) -> cặp
--   occurred_date/occurred_raw như quy ước chung.
-- ============================================================================
create table public.tasks (
  id             text primary key,                    -- app: tasks[].id (t1…)
  title          text not null,                       -- app: title
  assignee_id    text,                                -- app: assignee (member id, '' -> NULL)
  deal_id        text references public.deals (id) on delete set null, -- app: deal (không có -> NULL)
  due_label      text not null default '',            -- app: due (nhãn chữ cũ)
  due_date       date,                                -- app: dueDate ('' -> NULL)
  done           boolean not null default false,      -- app: done
  overdue_stored boolean not null default false,      -- app: overdue (cờ đã lưu; app tính động — xem ghi chú trên)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create index tasks_deal_id_idx on public.tasks (deal_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.activities (
  id            text primary key,                     -- app: activities[].id (a1…)
  deal_id       text not null references public.deals (id) on delete cascade, -- app: deal
  type          text not null default 'Note'
                check (type in ('Note', 'Call', 'Email', 'Meeting', 'Demo', 'Zalo', 'Messenger')), -- app: type
  actor_id      text,                                 -- app: who (member id, '' -> NULL)
  occurred_date date,                                 -- app: when khi parse được ISO
  occurred_raw  text not null default '',             -- app: when (chuỗi gốc)
  text          text not null default '',             -- app: text
  url           text,                                 -- app: url (có thể vắng -> NULL)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create index activities_deal_id_idx on public.activities (deal_id);
create trigger activities_set_updated_at before update on public.activities
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 9) PUBLISHING REQUESTS + REVISIONS (+ PHẦN NHẠY CẢM TÁCH RIÊNG)
-- ----------------------------------------------------------------------------
-- Kho sava_publishing_v1 = {version:1, requests:[...], marketUpdates:[...]}.
-- Request app: {id, kind, entityId, requestedBy, assignee, due, requestNote,
--   source, build, intake, status, requestedAt, current, revisions[],
--   revision, migratedFrom?}
-- - kind: 'game' | 'company'; entityId trỏ games/companies theo kind. Postgres
--   không có FK đa hình: dùng 2 cột FK game_id/company_id + CHECK ép đúng
--   một cột theo kind; entity_id là cột GENERATED = coalesce(game_id,
--   company_id) để truy vết 1-1 với app và join tiện ở giai đoạn 2.
-- - status: 'Chờ đánh giá' | 'Đang đánh giá' | 'Chờ bổ sung' | 'Hoàn tất'
--   (REVIEW_STATUSES, publishing.js).
-- - intake: hồ sơ đầu vào BD thu thập (theo kind):
--     game:    mechanicId, genre, subGenre, artStyle, coreLoop, gameFeel,
--              platforms, devStage, monetizationModel, targetGeo,
--              metricDownloads, metricRetention, metricCpi, metricRevenue,
--              metricRevenueCur, storeUrl, videoUrl, expectations
--     company: teamSize, country, mainGenres, mainPlatforms, trackRecord,
--              website
--   Field 'expectations' (kỳ vọng publishing — nội dung thương mại) bị MKT ẩn
--   ở MỌI bề mặt (D4 publishing.js) nên KHÔNG nằm trong intake jsonb ở đây:
--   tách sang publishing_request_intake_private (RLS admin+bd). Bộ nạp PHẢI
--   gỡ expectations khỏi intake trước khi ghi vào bảng này (MIGRATION.md) —
--   và CHECK publishing_requests_intake_no_expectations chặn ở tầng DB nếu
--   bộ nạp/frontend sót (F3, không chỉ dựa vào quy trình).
-- - current của app là BẢN SAO của revision mới nhất (mọi đường ghi đều đặt
--   current = revision vừa lưu; sanitizeRequest cũng fallback về revision
--   cuối). DB chuẩn hoá: current_revision_no trỏ tới revision đó; trường hợp
--   current lệch revision cuối khi nạp được bộ nạp vật hoá thành một revision
--   bổ sung (migrated_from='current-snapshot') — quy tắc ở MIGRATION.md.
-- - revision (số đếm) của app: giữ ở legacy_revision_counter để đối chiếu;
--   sau nạp phải bằng count(revisions).
-- ============================================================================
create table public.publishing_requests (
  id                      text primary key,           -- app: requests[].id (REV-<uuid> / REV-mig-…)
  kind                    text not null check (kind in ('game', 'company')), -- app: kind
  -- FK tới entity: ON DELETE RESTRICT (F2) — xoá game/công ty KHÔNG được âm
  -- thầm xoá theo request/revision/private. App hiện tại cũng coi hai thao
  -- tác là riêng (deleteCompany/deleteGame chỉ cảnh báo, không xoá request);
  -- giai đoạn 2 phải xoá request tường minh trước khi xoá entity (DESIGN.md).
  game_id                 text references public.games (id) on delete restrict,
  company_id              text references public.companies (id) on delete restrict,
  entity_id               text generated always as (coalesce(game_id, company_id)) stored, -- app: entityId
  requested_by            text,                       -- app: requestedBy (member id BD; '' -> NULL)
  assignee_id             text,                       -- app: assignee (member id MKT; '' -> NULL)
  due_date                date,                       -- app: due khi parse được ISO
  due_raw                 text not null default '',   -- app: due (chuỗi gốc)
  request_note            text not null default '',   -- app: requestNote
  source_url              text not null default '',   -- app: source (link build/thư mục bằng chứng)
  build_label             text not null default '',   -- app: build (nhãn build/phiên bản hiện tại)
  intake                  jsonb not null default '{}'::jsonb, -- app: intake (ĐÃ GỠ expectations — xem trên)
  status                  text not null default 'Chờ đánh giá'
                          check (status in ('Chờ đánh giá', 'Đang đánh giá', 'Chờ bổ sung', 'Hoàn tất')), -- app: status
  requested_at            timestamptz,                -- app: requestedAt (ISO; rỗng/lạ -> NULL, gốc trong JSON sao lưu)
  current_revision_no     integer,                    -- -> publishing_revisions.revision_no (FK thêm ở cuối file)
  legacy_revision_counter integer not null default 0, -- app: revision (số đếm đã lưu)
  migrated_from           text,                       -- app: migratedFrom ('bd-partnerEval' khi do bridge tạo)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  legacy_extra jsonb not null default '{}'::jsonb,
  constraint publishing_requests_entity_by_kind check (
    (kind = 'game'    and game_id is not null and company_id is null) or
    (kind = 'company' and company_id is not null and game_id is null)
  ),
  -- Chốt chặn tầng DB (F3): expectations TUYỆT ĐỐI không nằm trong intake
  -- công khai — kể cả khi bộ nạp/frontend lỗi. Toán tử ? trên jsonb là
  -- immutable nên dùng thẳng trong CHECK được.
  constraint publishing_requests_intake_no_expectations check (
    not (intake ? 'expectations')
  ),
  -- Túi dự phòng của chính bảng công khai này cũng không được chứa khoá
  -- nhạy cảm tương ứng (bộ nạp phải tách sang bảng private, không "để nhờ").
  constraint publishing_requests_legacy_extra_no_expectations check (
    not (legacy_extra ? 'expectations')
  )
);
create index publishing_requests_game_idx on public.publishing_requests (game_id);
create index publishing_requests_company_idx on public.publishing_requests (company_id);
create index publishing_requests_status_idx on public.publishing_requests (status);
create trigger publishing_requests_set_updated_at before update on public.publishing_requests
  for each row execute function public.set_updated_at();

-- Phần intake NHẠY CẢM (RLS admin+bd ở policies.sql — MKT không có policy nào).
create table public.publishing_request_intake_private (
  request_id   text primary key references public.publishing_requests (id) on delete cascade,
  expectations text,                                  -- app: intake.expectations (chỉ game)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   text,
  legacy_extra jsonb not null default '{}'::jsonb
);
create trigger publishing_request_intake_private_set_updated_at before update on public.publishing_request_intake_private
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Revision app (mỗi phần tử của requests[].revisions và requests[].current):
--   {entries, gates?, gate?, scoresV2?, quality?, productionPillarEvidence?,
--    reviewDate?, strengths, risks, conditions, next, comment, bdComment?,
--    reviewer, role, status, at, build?, frameworkVersion?, legacy?,
--    migratedFrom?}
-- PHẦN CÔNG KHAI (bảng này — bd/mkt/admin đọc được):
-- - entries: điểm + evidence từng tiêu chí do MKT/BD chấm.
--     game:    8 khoá Market (size,growth,entry,monetization,ua,economics,
--              rtw,whitespace) + 6 khoá Prototype (uaTest,retention,
--              engagement,monetizationTest,gamefeel,tech) — khung workbook cũ;
--              mỗi entry {score,status,note,source}.
--     company: 7 pillar (track,team,data,collaboration,strategy,pipeline +
--              4 ô con Production capacity/cadence/milestone/liveops gộp
--              trong cùng entries như app) + 'history'.
--   TRỪ 2 khoá bị tách sang private: 'deal' (Deal Fit) và 'legalEvidence'
--   (Legal/IP Evidence) — phần thương mại của Partner, MKT bị ẩn ở UI (B3/D1
--   publishing.js: MKT không render, lịch sử cũng lọc bỏ 2 khoá này).
-- - gates (chỉ company): {<6 cổng>:{value}} — CHỈ value PASS/FAIL/PENDING là
--   công khai (MKT thấy nhãn cổng); note/source của cổng nằm ở private.
-- - gate_value (chỉ game): 'PASS'|'FAIL'|'PENDING' — nhãn cổng MKT thấy;
--   gateNote/gateSource nằm ở private (D1).
-- - scores_v2 (chỉ game): {version, fromMechanicId, market:{k:{score,source,
--   rawInputs}}, prototype:{...}} — khung Market Score v2 chính thức.
--   'source' trong scores_v2 là NHÃN nguồn điểm ('auto'/'manual'/'override')
--   mà app hiển thị cho CẢ hai phía — không phải nguồn xác minh nhạy cảm,
--   nên giữ công khai có chủ đích (khác hẳn gates.*.source ở trên).
-- - production_pillar_evidence (chỉ company do migration tạo): CHỈ {status,
--   note} là công khai (MKT cần status cho coverage); 'source' TÁCH sang
--   publishing_revision_private.production_pillar_source (F5) và CHECK ở
--   bảng này cấm khoá 'source' xuất hiện trong cột công khai.
-- ============================================================================

-- Helper cho CHECK của gates (F3): true khi mọi cổng trong object gates chỉ
-- chứa khoá công khai (không 'note', không 'source' ở BẤT KỲ cổng nào).
-- CHECK constraint không chứa được subquery nên phép quét jsonb_each nằm
-- trong hàm này; hàm thuần đọc jsonb, không chạm bảng nào -> IMMUTABLE là
-- đúng. gates không phải object -> false (sai hình dạng = chặn).
create or replace function public.jsonb_gates_public_only(g jsonb)
returns boolean
language sql immutable parallel safe set search_path = ''
as $$
  select g is null
      or (jsonb_typeof(g) = 'object'
          and coalesce((
                select bool_and(not (jsonb_typeof(e.value) = 'object'
                                     and e.value ?| array['note', 'source']))
                from jsonb_each(g) as e
              ), true))
$$;
revoke execute on function public.jsonb_gates_public_only(jsonb) from public, anon;
grant  execute on function public.jsonb_gates_public_only(jsonb) to authenticated;
grant  execute on function public.jsonb_gates_public_only(jsonb) to service_role;
-- (authenticated cần EXECUTE vì CHECK được tính bằng chính user đang
-- INSERT/UPDATE; service_role cũng cần EXECUTE — NF2 — vì bộ nạp giai
-- đoạn 2 chạy bằng service_role qua API thì CHECK vẫn được tính bằng
-- chính role đang ghi, thiếu quyền hàm này là lệnh ghi bị từ chối. Hàm
-- chỉ là phép kiểm tra thuần tuý, không lộ dữ liệu; đây là EXECUTE trên
-- hàm kiểm tra duy nhất này, KHÔNG cấp thêm quyền dữ liệu nào cho
-- service_role trong file này — service_role vốn bypass RLS khi được
-- dùng ở backend tin cậy, tuyệt đối không lộ key của nó.)

create table public.publishing_revisions (
  request_id    text not null references public.publishing_requests (id) on delete cascade,
  revision_no   integer not null check (revision_no >= 1), -- vị trí trong revisions[] (1-based)
  reviewer_id   text,                                 -- app: reviewer (member id; '' -> NULL)
  author_role   text not null default ''
                check (author_role in ('bd', 'mkt', '')), -- app: role (vai của người lưu phiên bản)
  status        text check (status in ('Chờ đánh giá', 'Đang đánh giá', 'Chờ bổ sung', 'Hoàn tất')), -- app: status
  evaluated_at  timestamptz,                          -- app: at (ISO; luôn hợp lệ ở mọi đường ghi hiện tại)
  build_label   text not null default '',             -- app: build (build được chấm ở phiên bản này)
  entries       jsonb not null default '{}'::jsonb,   -- app: entries (ĐÃ GỠ 'deal' + 'legalEvidence')
  gates         jsonb,                                -- app: gates (chỉ company; chỉ {value} từng cổng)
  gate_value    text check (gate_value in ('PASS', 'FAIL', 'PENDING')), -- app: gate (chỉ game)
  scores_v2     jsonb,                                -- app: scoresV2 (chỉ game; null = phiên bản legacy)
  quality       numeric(4, 1),                        -- app: quality (Evidence Quality 1..5, chỉ game legacy)
  production_pillar_evidence jsonb,                   -- app: productionPillarEvidence — CHỈ {status,note}; source đã tách sang publishing_revision_private.production_pillar_source (F5)
  review_date   date,                                 -- app: reviewDate khi parse được ISO (chỉ company migration)
  review_date_raw text not null default '',           -- app: reviewDate (chuỗi gốc)
  strengths     text not null default '',             -- app: strengths
  risks         text not null default '',             -- app: risks
  conditions    text not null default '',             -- app: conditions
  next_action   text not null default '',             -- app: next
  comment_public text not null default '',            -- app: comment (nhận xét MKT — BD đọc được)
  framework_version text,                             -- app: frameworkVersion (PublishingScore.version khi lưu)
  is_legacy     boolean not null default false,       -- app: legacy (true = revision chốt theo khung workbook cũ)
  migrated_from text,                                 -- app: migratedFrom ('bd-partnerEval'…)
  created_at    timestamptz not null default now(),   -- thời điểm NẠP/lưu vào DB (khác evaluated_at là thời điểm chấm gốc)
  created_by    text,
  legacy_extra  jsonb not null default '{}'::jsonb,
  primary key (request_id, revision_no),
  -- Chốt chặn tầng DB (F3/F5) cho JSONB công khai của revision — không chỉ
  -- dựa vào bộ nạp/frontend tách field:
  constraint publishing_revisions_entries_no_private check (
    not (entries ?| array['deal', 'legalEvidence'])
  ),
  constraint publishing_revisions_gates_public_only check (
    public.jsonb_gates_public_only(gates)
  ),
  constraint publishing_revisions_ppe_no_source check (
    production_pillar_evidence is null
    or not (production_pillar_evidence ? 'source')
  ),
  -- NF1: bổ sung 'deal'/'legalEvidence' — hai khoá entries đã bị cấm ở cột
  -- entries công khai nhưng trước đây chưa bị cấm ở túi legacy_extra, nên
  -- bộ nạp/frontend sót tách field vẫn "để nhờ" được vào đây cho MKT đọc;
  -- và 'hardGate' — biến thể cũ thay 'gates' (MIGRATION.md mục 4.2, bridge
  -- đọc current.gates hoặc current.hardGate) chứa {status, note} từng cổng,
  -- phần note thuộc publishing_revision_private.gate_details.
  constraint publishing_revisions_legacy_extra_no_private check (
    not (legacy_extra ?| array['bdComment', 'gateNote', 'gateSource', 'productionPillarEvidence', 'deal', 'legalEvidence', 'hardGate'])
  )
);
comment on table public.publishing_revisions is 'Revision là BẤT BIẾN (append-only): policies.sql không cấp UPDATE/DELETE cho bất kỳ vai nào; sửa = lưu revision mới như app. Cố ý KHÔNG có updated_at/trigger: dòng đã ghi không bao giờ đổi.';
-- (Không trigger updated_at cho bảng này — xem comment trên.)

-- Phần revision NHẠY CẢM (RLS admin+bd — MKT không có policy nào; chỉ
-- SELECT + INSERT như revision công khai, F11 — append-only):
-- - bd_comment: app revision.bdComment — ghi chú BD, MKT bị ẩn kể cả lịch sử
--   (D5 publishing.js).
-- - game_gate_note/game_gate_source: app revision.gateNote/gateSource của
--   game (D1).
-- - deal_entry / legal_entry: entries.deal / entries.legalEvidence (company).
-- - gate_details: {<cổng>:{note, source}} của company (B3: MKT không render
--   note/source Hard Gate company).
-- - production_pillar_source: app productionPillarEvidence.source (F5) —
--   cột công khai chỉ còn {status, note}; source là "nguồn/ngày xác minh"
--   cùng họ với gate source nên thuộc phía BD như mọi source xác minh khác.
create table public.publishing_revision_private (
  request_id     text not null,
  revision_no    integer not null,
  bd_comment     text,                                -- app: bdComment
  game_gate_note   text,                              -- app: gateNote (game)
  game_gate_source text,                              -- app: gateSource (game)
  deal_entry     jsonb,                               -- app: entries.deal {score,status,note,source}
  legal_entry    jsonb,                               -- app: entries.legalEvidence {score,status,note,source}
  gate_details   jsonb,                               -- app: gates.<k>.note/source (company)
  production_pillar_source text,                      -- app: productionPillarEvidence.source (F5)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     text,
  legacy_extra   jsonb not null default '{}'::jsonb,
  primary key (request_id, revision_no),
  foreign key (request_id, revision_no)
    references public.publishing_revisions (request_id, revision_no) on delete cascade
);
-- Bảng này append-only ở tầng policy (F11: chỉ SELECT + INSERT cho admin/bd,
-- không UPDATE/DELETE) nên trigger updated_at dưới đây thực tế không bao giờ
-- chạy qua API; giữ lại vô hại phòng khi giai đoạn sau có chủ đích mở UPDATE.
create trigger publishing_revision_private_set_updated_at before update on public.publishing_revision_private
  for each row execute function public.set_updated_at();

-- FK vòng tròn requests.current_revision_no -> revisions: thêm SAU khi cả hai
-- bảng tồn tại, DEFERRABLE để bộ nạp ghi request trước/rồi revision trong
-- cùng transaction mà không kẹt thứ tự.
alter table public.publishing_requests
  add constraint publishing_requests_current_fk
  foreign key (id, current_revision_no)
  references public.publishing_revisions (request_id, revision_no)
  on delete set null (current_revision_no)
  deferrable initially deferred;

-- ============================================================================
-- 10) MARKET: DỮ LIỆU TĨNH (publishing-data.js) + QUAN SÁT DO USER TẠO
-- ----------------------------------------------------------------------------
-- Tách bạch theo đúng cách app vận hành:
-- - market_datasets + market_records: bản snapshot workbook TĨNH, chỉ nạp
--   bằng seed/import (seed-market.sql), user thường không sửa. Frontend đọc
--   qua observations() = records GỘI (shallow-merge) với marketUpdates.
-- - market_observations: chính là marketUpdates của kho sava_publishing_v1 —
--   dòng user tạo/bổ sung. Khi id trùng id record tĩnh -> là lớp PHỦ (overlay)
--   lên record đó (record_id = id); khi id là 'OBS-<uuid>' -> quan sát độc
--   lập (record_id NULL). Xoá overlay = về bản gốc (deleteMarketObs).
-- - market_observation_audit: mảng audit[] lồng trong từng marketUpdate —
--   mỗi phần tử là ẢNH CHỤP phiên bản TRƯỚC mỗi lần bổ sung.
-- Record tĩnh: các field vô hướng hay lọc/hiển thị được tách cột; TOÀN BỘ
-- record gốc (gồm history/cpi/entry/uaBenchmark/verifiedDaily/newApps/
-- eligible/cohortHistory/simRange/topTitles/verifiedByStore/titles/
-- provenance) giữ nguyên trong payload jsonb — frontend giai đoạn 2 cần
-- đúng hình dạng này cho marketAuto/marketSuggest (publishing-score.js).
-- evidence_type của record tĩnh là CHUỖI NGUỒN workbook tự do (vd 'VERIFIED
-- CURRENT SNAPSHOT + …'), KHÔNG thuộc taxonomy Fact/Proxy/… của quan sát
-- user — giữ nguyên ở evidence_type_raw, không ép map.
-- ============================================================================
create table public.market_datasets (
  version        text primary key,                    -- app: PublishingData.version ('2026-10-28-v2')
  source_file    text not null default '',            -- app: source ('SAVA_Mobile_Game_Decision.xlsx')
  source_sha256  text,                                -- app: sourceSha256
  imported_at    date,                                -- app: importedAt
  allowed_sheets jsonb not null default '[]'::jsonb,  -- app: allowedSheets
  enrichment     text,                                -- app: enrichment
  framework      jsonb,                               -- app: framework {marketWeights, prototypeWeights, rubric, source}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger market_datasets_set_updated_at before update on public.market_datasets
  for each row execute function public.set_updated_at();

create table public.market_records (
  id             text primary key,                    -- app: records[].id (MECH-001… / SIM-5…)
  dataset_version text not null references public.market_datasets (version) on delete restrict,
  name           text not null,                       -- app: name
  category       text not null default '',            -- app: category ('Puzzle'|'Simulation')
  geo            text not null default '',            -- app: geo
  platform       text not null default '',            -- app: platform
  snapshot_date  date,                                -- app: date (ISO trong file tĩnh)
  downloads      numeric(20, 2),                      -- app: downloads (DL/ngày)
  revenue        numeric(20, 2),                      -- app: revenue (USD/ngày)
  top1           numeric(12, 10),                     -- app: top1 (tỉ lệ 0..1)
  top3           numeric(12, 10),                     -- app: top3
  top5           numeric(12, 10),                     -- app: top5
  newcomer       numeric(12, 10),                     -- app: newcomer
  free_titles    numeric(12, 2),                      -- app: freeTitles
  grossing_titles numeric(12, 2),                     -- app: grossingTitles
  new_launches   numeric(12, 2),                      -- app: newLaunches
  titles_count   numeric(12, 2),                      -- app: titles (chỉ record Simulation)
  evidence_type_raw text,                             -- app: evidenceType (chuỗi nguồn workbook — xem ghi chú trên)
  confidence     numeric(4, 1),                       -- app: confidence
  source_url     text,                                -- app: url
  note           text,                                -- app: note
  history_period text,                                -- app: historyPeriod
  history_note   text,                                -- app: historyNote
  cpi_scope      text,                                -- app: cpiScope
  payload        jsonb not null,                      -- TOÀN BỘ record gốc (history, cpi, entry, uaBenchmark, verifiedDaily, newApps, eligible, cohortHistory, simRange, topTitles, verifiedByStore, provenance…)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     text
);
create index market_records_category_idx on public.market_records (category);
create index market_records_dataset_idx on public.market_records (dataset_version);
create trigger market_records_set_updated_at before update on public.market_records
  for each row execute function public.set_updated_at();

-- Quan sát do user tạo/bổ sung — app marketUpdates[]:
-- {id, name, category, date, geo, platform, downloads, revenue, url, by,
--  confidence, evidenceType, note, history, cpi, top1, top3, top5, newcomer,
--  historyNote, historyPeriod, cpiScope, provenance, at, audit[]}
-- - submitMarket luôn ghi history={} và cpi={} cho quan sát mới (không kế
--   thừa số cũ) -> giữ đúng jsonb, kể cả rỗng.
-- - evidenceType ở đây thuộc taxonomy hợp nhất ['Fact','Proxy','Hypothesis',
--   'Internal actual'] sau khi read() map ('Export'/'Verified source'->'Fact');
--   giá trị cũ ngoài taxonomy (vd 'Partner cung cấp' ở chiều loại bằng chứng)
--   được app GIỮ NGUYÊN qua cơ chế "(dữ liệu cũ)" -> KHÔNG đặt CHECK, giữ text.
-- - 'at' của app là thời điểm cập nhật gần nhất của quan sát -> updated_at;
--   created_at = lần tạo đầu (bộ nạp lấy 'at' cho cả hai nếu chỉ có một mốc).
create table public.market_observations (
  id             text primary key,                    -- app: marketUpdates[].id (trùng id record tĩnh nếu là overlay; 'OBS-<uuid>' nếu độc lập)
  record_id      text references public.market_records (id) on delete set null, -- record tĩnh bị phủ (NULL = quan sát độc lập)
  name           text not null,                       -- app: name
  category       text not null default '',            -- app: category
  snapshot_date  date,                                -- app: date (input date của form; rỗng -> NULL)
  geo            text not null default '',            -- app: geo
  platform       text not null default '',            -- app: platform
  downloads      numeric(20, 2),                      -- app: downloads (NULL = chưa có, KHÔNG phải 0)
  revenue        numeric(20, 2),                      -- app: revenue (USD; NULL = chưa có)
  source_url     text not null default '',            -- app: url
  updated_by     text,                                -- app: by (member id người cập nhật; '' -> NULL)
  confidence     integer check (confidence between 1 and 5), -- app: confidence
  evidence_type  text,                                -- app: evidenceType (taxonomy hoặc giá trị cũ — xem trên)
  note           text not null default '',            -- app: note (form bắt buộc ghi phạm vi/phương pháp)
  history        jsonb not null default '{}'::jsonb,  -- app: history
  cpi            jsonb not null default '{}'::jsonb,  -- app: cpi
  top1           numeric(12, 10),                     -- app: top1
  top3           numeric(12, 10),                     -- app: top3
  top5           numeric(12, 10),                     -- app: top5
  newcomer       numeric(12, 10),                     -- app: newcomer
  history_note   text not null default '',            -- app: historyNote
  history_period text not null default '',            -- app: historyPeriod
  cpi_scope      text not null default '',            -- app: cpiScope
  provenance     jsonb not null default '[]'::jsonb,  -- app: provenance (giữ nguyên mảng nguồn gốc)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),  -- app: at
  created_by     text,
  legacy_extra   jsonb not null default '{}'::jsonb
);
create index market_observations_record_idx on public.market_observations (record_id);
create index market_observations_category_idx on public.market_observations (category);
create trigger market_observations_set_updated_at before update on public.market_observations
  for each row execute function public.set_updated_at();

-- Ảnh chụp phiên bản trước — app marketUpdates[].audit[]:
-- {date, downloads, revenue, url, note, by, at, evidenceType, provenance,
--  confidence} — 'by' ở đây có thể là chữ 'Workbook' (khi phiên bản trước là
-- bản gốc workbook) nên là text tự do, không FK/không ép member id.
create table public.market_observation_audit (
  id             uuid primary key default gen_random_uuid(),
  observation_id text not null references public.market_observations (id) on delete cascade,
  seq            integer not null,                    -- vị trí trong audit[] (0-based, giữ thứ tự gốc)
  snapshot_date  date,                                -- app: audit[].date khi parse được ISO
  snapshot_raw   text not null default '',            -- app: audit[].date (chuỗi gốc)
  downloads      numeric(20, 2),                      -- app: audit[].downloads
  revenue        numeric(20, 2),                      -- app: audit[].revenue
  source_url     text,                                -- app: audit[].url
  note           text,                                -- app: audit[].note
  by_label       text,                                -- app: audit[].by (member id hoặc 'Workbook')
  occurred_at    timestamptz,                         -- app: audit[].at (có thể null với bản gốc workbook)
  evidence_type  text,                                -- app: audit[].evidenceType
  provenance     jsonb,                               -- app: audit[].provenance
  confidence     numeric(4, 1),                       -- app: audit[].confidence
  created_at     timestamptz not null default now(),
  unique (observation_id, seq)
);
create index market_observation_audit_obs_idx on public.market_observation_audit (observation_id);

-- ============================================================================
-- 11) APP STATE META (truy vết 2 kho + đợt nạp)
-- ----------------------------------------------------------------------------
-- Kho CRM không có khoá version/meta riêng (seed() chỉ gồm 7 mảng); kho
-- Publishing có version=1. Bảng này ghi: nguồn từng kho, version kho
-- Publishing, thời điểm nạp, số đếm đối chiếu — phục vụ MIGRATION.md.
-- ============================================================================
create table public.app_state_meta (
  key        text primary key,  -- 'sava_crm_shared_v1' | 'sava_publishing_v1'
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger app_state_meta_set_updated_at before update on public.app_state_meta
  for each row execute function public.set_updated_at();
