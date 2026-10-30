-- ============================================================================
-- Sava Meta CRM — RLS Policies (chạy SAU schema.sql)
-- ============================================================================
-- Nguyên tắc (đã chốt với user, đối chiếu hành vi app tại HEAD 7dff2d5):
--   * "Đọc/ghi" bên dưới luôn có nghĩa: user đã đăng nhập (authenticated),
--     ĐÃ gắn profile -> member, và member còn ACTIVE. Member bị tắt active
--     = mất quyền truy cập dữ liệu nghiệp vụ ngay (is_active_member()).
--   * RLS là ROW-level: Postgres KHÔNG chặn từng cột cho cùng một user trên
--     cùng một bảng. Vì vậy field nhạy cảm KHÔNG nằm chung bảng với dữ liệu
--     công khai — chúng ở bảng phụ có RLS riêng mà MKT KHÔNG CÓ BẤT KỲ
--     policy nào (không policy = PostgREST trả rỗng/403 dù gọi API trực
--     tiếp). Danh sách bảng phụ: deal_terms, deal_contracts (qua deals),
--     company_partner_eval_archive, publishing_request_intake_private,
--     publishing_revision_private. Cơ chế + trade-off: DESIGN.md.
--   * service_role (khoá bí mật phía server/bộ nạp) bỏ qua RLS by design của
--     Supabase — khoá này TUYỆT ĐỐI không đưa vào frontend/chat (SETUP.md).
--   * Helper has_crm_role()/is_active_member() là SECURITY DEFINER đọc
--     profiles/members — không đệ quy RLS (xem schema.sql mục 2). KHÔNG bật
--     FORCE ROW LEVEL SECURITY trên bất kỳ bảng nào trong file này.
-- ============================================================================

-- ============================================================================
-- GRANT TƯỜNG MINH (F12) — không phụ thuộc hoàn toàn vào default privileges
-- của project Supabase:
--   * anon: thu hồi MỌI quyền trên bảng public. CRM này không có bề mặt
--     công khai nào; anon key lộ ra cũng không chạm được dữ liệu (RLS vẫn
--     là lớp chặn chính, đây là lớp phụ trợ ở mức privilege).
--   * authenticated: cấp đủ 4 quyền bảng để PostgREST hoạt động; quyền này
--     là ĐIỀU KIỆN CẦN nhưng KHÔNG ĐỦ — dòng nào đọc/ghi được vẫn do RLS
--     policy bên dưới quyết (bảng không có policy cho vai = 0 dòng/lỗi).
--   * Hàm helper phân quyền (schema.sql mục 2) đã revoke EXECUTE khỏi
--     public/anon và chỉ grant cho authenticated; hàm kiểm tra gates
--     (jsonb_gates_public_only) cũng grant cho authenticated vì CHECK chạy
--     bằng user đang ghi, và grant thêm cho service_role (NF2, tại
--     schema.sql ngay dưới định nghĩa hàm) để bộ nạp giai đoạn 2 chạy
--     bằng service_role qua API không bị CHECK từ chối vì thiếu quyền
--     hàm thuần kiểm tra này — không cấp thêm quyền dữ liệu nào cho
--     service_role trong file này.
--     Hàm trigger (set_updated_at, guard_...) KHÔNG cần EXECUTE grant:
--     Postgres không kiểm tra quyền EXECUTE khi trigger tự chạy.
--   * Bảng tạo MỚI ở giai đoạn 2 không tự hưởng đoạn này (default privileges
--     của Supabase vẫn cấp sẵn cho authenticated) — migration tương lai
--     phải lặp lại grant/revoke tường minh như ở đây.
-- ============================================================================
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Bật RLS trên MỌI bảng (bảng không có policy phù hợp = bị chặn mặc định).
alter table public.members                            enable row level security;
alter table public.profiles                           enable row level security;
alter table public.companies                          enable row level security;
alter table public.company_partner_eval_archive       enable row level security;
alter table public.games                              enable row level security;
alter table public.deals                              enable row level security;
alter table public.deal_terms                         enable row level security;
alter table public.deal_contracts                     enable row level security;
alter table public.leads                              enable row level security;
alter table public.deal_leads                         enable row level security;
alter table public.tasks                              enable row level security;
alter table public.activities                         enable row level security;
alter table public.publishing_requests                enable row level security;
alter table public.publishing_request_intake_private  enable row level security;
alter table public.publishing_revisions               enable row level security;
alter table public.publishing_revision_private        enable row level security;
alter table public.market_datasets                    enable row level security;
alter table public.market_records                     enable row level security;
alter table public.market_observations                enable row level security;
alter table public.market_observation_audit           enable row level security;
alter table public.app_state_meta                     enable row level security;

-- ============================================================================
-- MEMBERS / PROFILES — mọi user (active) đọc; chỉ admin ghi.
-- Ngoại lệ có chủ đích để user bị tắt active vẫn "tự biết mình là ai":
-- họ đọc được ĐÚNG dòng member của mình + profile của mình (đủ để frontend
-- hiện màn hình "tài khoản đã ngừng hoạt động"), còn lại bị chặn hết.
-- ============================================================================
create policy members_select on public.members
  for select to authenticated
  using (public.is_active_member() or id = public.current_member_id());
create policy members_insert_admin on public.members
  for insert to authenticated
  with check (public.has_crm_role(array['admin']));
create policy members_update_admin on public.members
  for update to authenticated
  using (public.has_crm_role(array['admin']))
  with check (public.has_crm_role(array['admin']));
create policy members_delete_admin on public.members
  for delete to authenticated
  using (public.has_crm_role(array['admin']));

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_crm_role(array['admin']));
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.has_crm_role(array['admin']));
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.has_crm_role(array['admin']))
  with check (public.has_crm_role(array['admin']));
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.has_crm_role(array['admin']));
-- Lưu ý khởi tạo (bootstrap): admin ĐẦU TIÊN chưa có profile nên chưa qua
-- được các policy trên — dòng members/profiles đầu tiên phải tạo bằng SQL
-- Editor (vai postgres/service_role, bỏ qua RLS). Quy trình ở SETUP.md.

-- ============================================================================
-- COMPANIES / GAMES / LEADS — mọi user active đọc; ghi BD + Admin.
-- (MKT trong app chỉ XEM hồ sơ công ty/game/lead để đánh giá, không sửa CRM.)
-- ============================================================================
create policy companies_select on public.companies
  for select to authenticated using (public.is_active_member());
create policy companies_insert on public.companies
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd']));
create policy companies_update on public.companies
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));
create policy companies_delete on public.companies
  for delete to authenticated using (public.has_crm_role(array['admin', 'bd']));

create policy games_select on public.games
  for select to authenticated using (public.is_active_member());
create policy games_insert on public.games
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd']));
create policy games_update on public.games
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));
create policy games_delete on public.games
  for delete to authenticated using (public.has_crm_role(array['admin', 'bd']));

create policy leads_select on public.leads
  for select to authenticated using (public.is_active_member());
create policy leads_insert on public.leads
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd']));
create policy leads_update on public.leads
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));
create policy leads_delete on public.leads
  for delete to authenticated using (public.has_crm_role(array['admin', 'bd']));

-- PartnerEval legacy của công ty chứa Deal Fit + ghi chú Hard Gate (thương
-- mại) -> admin+bd TOÀN QUYỀN, MKT không policy nào.
create policy partner_eval_archive_all_bd on public.company_partner_eval_archive
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

-- ============================================================================
-- DEALS + TERM + CONTRACT + DEAL_LEADS + ACTIVITIES — chỉ Admin + BD.
-- MKT không có policy nào trên 5 bảng này: không đọc được amount, term,
-- contract, custom, liên kết lead của deal, hay timeline hoạt động của deal
-- — kể cả gọi API trực tiếp bằng anon key + phiên đăng nhập MKT.
-- ============================================================================
create policy deals_all_bd on public.deals
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

create policy deal_terms_all_bd on public.deal_terms
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

create policy deal_contracts_all_bd on public.deal_contracts
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

create policy deal_leads_all_bd on public.deal_leads
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

create policy activities_all_bd on public.activities
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

-- TASKS: mặc định AN TOÀN của giai đoạn 1 (F4) — chỉ Admin + BD. Tiêu đề
-- việc + deal_id của task gắn deal sẽ lộ thông tin deal cho người được giao
-- nếu cho đọc theo assignee, nên MKT (và mọi vai khác) KHÔNG đọc được task
-- nào ở giai đoạn này, kể cả task giao cho chính mình. Nếu sau này Zac muốn
-- MKT có danh sách việc riêng, giai đoạn 2 phải thiết kế lại dữ liệu việc
-- an toàn cho MKT (không kèm deal_id/tiêu đề lộ deal) rồi mới mở policy —
-- không nới policy này trước khi có thiết kế đó (điểm cần Zac quyết, xem
-- DESIGN.md mục 6).
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.has_crm_role(array['admin', 'bd']));
create policy tasks_insert on public.tasks
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd']));
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));
create policy tasks_delete on public.tasks
  for delete to authenticated using (public.has_crm_role(array['admin', 'bd']));

-- ============================================================================
-- PUBLISHING REQUESTS — phần KHÔNG nhạy cảm:
--   đọc: BD + MKT + Admin đang active (BD theo dõi + MKT chấm — đúng luồng
--        hiện tại; member vai 'Khác' không thuộc luồng này).
--   tạo: chỉ BD + Admin (submitRequest trong app chặn role != 'bd';
--        admin là Zac, cũng là BD dự phòng).
--   sửa: BD/MKT/Admin đều sửa được DÒNG request ở mức row (RLS không tách
--        cột) NHƯNG trigger guard ở cuối file chặn MKT đổi các field gốc
--        của BD (kind/entity/intake/build/source/assignee/hạn/người gửi) —
--        MKT chỉ đổi được status + current_revision_no + bộ đếm khi lưu
--        revision, đúng những gì submitReview phía MKT chạm vào.
--   xoá: cả BD lẫn MKT đều thấy nút xoá trong app hiện tại (deleteRequest
--        không phân vai) -> giữ nguyên cho user active; revision + phần
--        private tự cascade theo FK. (Admin/BD/MKT đều active mới xoá được.)
-- ============================================================================
create policy publishing_requests_select on public.publishing_requests
  for select to authenticated using (public.has_crm_role(array['admin', 'bd', 'mkt']));
create policy publishing_requests_insert on public.publishing_requests
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd']));
create policy publishing_requests_update on public.publishing_requests
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd', 'mkt']))
  with check (public.has_crm_role(array['admin', 'bd', 'mkt']));
create policy publishing_requests_delete on public.publishing_requests
  for delete to authenticated using (public.has_crm_role(array['admin', 'bd', 'mkt']));

-- Intake expectations (thương mại) — admin+bd toàn quyền, MKT không policy.
create policy intake_private_all_bd on public.publishing_request_intake_private
  for all to authenticated
  using (public.has_crm_role(array['admin', 'bd']))
  with check (public.has_crm_role(array['admin', 'bd']));

-- ============================================================================
-- PUBLISHING REVISIONS — append-only:
--   đọc: BD + MKT + Admin (phần công khai; phần nhạy cảm ở bảng private).
--   thêm: BD + MKT + Admin (BD lưu bổ sung, MKT lưu đánh giá — author_role
--         trong từng revision ghi rõ vai người lưu như app).
--   sửa/xoá: KHÔNG cấp cho ai (kể cả admin) — lịch sử bất biến như app;
--         xoá cả request thì cascade theo FK (referential action không qua
--         RLS nên vẫn hoạt động đúng).
-- ============================================================================
create policy publishing_revisions_select on public.publishing_revisions
  for select to authenticated using (public.has_crm_role(array['admin', 'bd', 'mkt']));
create policy publishing_revisions_insert on public.publishing_revisions
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd', 'mkt']));

-- Phần revision nhạy cảm (bdComment, gateNote/gateSource của game, Deal Fit,
-- Legal/IP evidence, note/source Hard Gate của company,
-- productionPillarEvidence.source) — admin+bd, MKT không policy nào.
-- APPEND-ONLY như revision công khai (F11): chỉ SELECT + INSERT, KHÔNG
-- UPDATE/DELETE cho bất kỳ vai nào. Việc xoá vẫn trọn vẹn: xoá request ->
-- FK cascade (referential action không qua RLS) tự xoá revision công khai
-- rồi tới dòng private này, không cần DELETE policy.
create policy revision_private_select_bd on public.publishing_revision_private
  for select to authenticated
  using (public.has_crm_role(array['admin', 'bd']));
create policy revision_private_insert_bd on public.publishing_revision_private
  for insert to authenticated
  with check (public.has_crm_role(array['admin', 'bd']));

-- ============================================================================
-- MARKET — dữ liệu tĩnh + quan sát:
--   datasets/records tĩnh: mọi user active đọc; ghi chỉ admin (bản chuẩn là
--   seed/import bằng SQL Editor — admin ở đây là cửa phụ khi cần sửa tay).
--   observations + audit: mọi user active đọc; ghi BD + MKT + Admin (đúng
--   app: cả hai phía cùng thêm/bổ sung quan sát, publishing.js marketForm
--   không phân vai). Audit là append-only với user thường: không UPDATE;
--   DELETE chỉ chạy qua cascade khi xoá observation (như app).
-- ============================================================================
create policy market_datasets_select on public.market_datasets
  for select to authenticated using (public.is_active_member());
create policy market_datasets_write_admin on public.market_datasets
  for all to authenticated
  using (public.has_crm_role(array['admin']))
  with check (public.has_crm_role(array['admin']));

create policy market_records_select on public.market_records
  for select to authenticated using (public.is_active_member());
create policy market_records_write_admin on public.market_records
  for all to authenticated
  using (public.has_crm_role(array['admin']))
  with check (public.has_crm_role(array['admin']));

create policy market_observations_select on public.market_observations
  for select to authenticated using (public.is_active_member());
create policy market_observations_insert on public.market_observations
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd', 'mkt']));
create policy market_observations_update on public.market_observations
  for update to authenticated
  using (public.has_crm_role(array['admin', 'bd', 'mkt']))
  with check (public.has_crm_role(array['admin', 'bd', 'mkt']));
create policy market_observations_delete on public.market_observations
  for delete to authenticated using (public.has_crm_role(array['admin', 'bd', 'mkt']));

create policy market_audit_select on public.market_observation_audit
  for select to authenticated using (public.is_active_member());
create policy market_audit_insert on public.market_observation_audit
  for insert to authenticated with check (public.has_crm_role(array['admin', 'bd', 'mkt']));
-- (cố ý không có market_audit_update/delete cho authenticated)

-- APP_STATE_META: chỉ admin đọc; ghi bằng bộ nạp (service_role/SQL Editor).
create policy app_state_meta_select_admin on public.app_state_meta
  for select to authenticated using (public.has_crm_role(array['admin']));

-- ============================================================================
-- TRIGGER GUARD: MKT không đổi field gốc của BD trên publishing_requests
-- ----------------------------------------------------------------------------
-- RLS không tách được cột trong cùng lệnh UPDATE; đây là lớp bù tường minh.
-- Khi người sửa có role 'mkt': các cột kind/game_id/company_id/requested_by/
-- requested_at/intake/build_label/source_url/assignee_id/due_* bị KHOÁ —
-- đổi khác giá trị cũ là RAISE. status/current_revision_no/
-- legacy_revision_counter/updated_at được phép (đúng submitReview phía MKT).
-- BD/Admin không bị trigger này hạn chế ở các cột nghiệp vụ.
-- Nhóm bất biến định danh — id/created_at/created_by — khoá với MỌI vai
-- (F6): created_by là "ai tạo dòng" giống như created_at là "tạo lúc nào",
-- đều được ghi một lần lúc INSERT (data layer set từ phiên đăng nhập) rồi
-- không ai sửa lại, kể cả Admin/BD; nếu thật sự phải sửa truy vết (ca dữ
-- liệu hỏng) thì chủ project tắt trigger này tạm thời trong SQL Editor —
-- thao tác ngoại lệ có chủ đích, không phải đường sửa thường ngày. Riêng
-- legacy_extra (túi
-- dự phòng của bộ nạp) chỉ khoá thêm với MKT: BD/Admin được sửa để xử lý
-- dữ liệu nạp còn sót, MKT không có lý do chạm vào túi này.
-- ============================================================================
create or replace function public.guard_publishing_request_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'publishing_requests: id/created_at/created_by là bất biến';
  end if;
  if public.current_member_role() = 'mkt' then
    if new.kind is distinct from old.kind
       or new.game_id is distinct from old.game_id
       or new.company_id is distinct from old.company_id
       or new.requested_by is distinct from old.requested_by
       or new.requested_at is distinct from old.requested_at
       or new.intake is distinct from old.intake
       or new.build_label is distinct from old.build_label
       or new.source_url is distinct from old.source_url
       or new.assignee_id is distinct from old.assignee_id
       or new.due_date is distinct from old.due_date
       or new.due_raw is distinct from old.due_raw
       or new.request_note is distinct from old.request_note
       or new.migrated_from is distinct from old.migrated_from
       or new.legacy_extra is distinct from old.legacy_extra then
      raise exception 'MKT không được sửa thông tin gốc của yêu cầu đánh giá (chỉ lưu revision + trạng thái)';
    end if;
  end if;
  return new;
end;
$$;
create trigger publishing_requests_guard_update
  before update on public.publishing_requests
  for each row execute function public.guard_publishing_request_update();
