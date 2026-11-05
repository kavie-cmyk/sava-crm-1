-- ============================================================
-- "Biến động tuần" TỰ CẬP NHẬT TRONG DATABASE (pg_cron)
-- Sava Meta CRM — project sava-crm (vaegwvawlwpckfkmjzsj)
--
-- Thay cơ chế script ngoài chạy tay bằng:
--   1) extension pg_cron,
--   2) hàm public.compute_weekly_snapshot() — tính lại TOÀN BỘ
--      payload 12 tuần (key 'weekly_movement' trong
--      public.dashboard_snapshots) từ audit_log + leads/deals/
--      tasks/activities/members,
--   3) lịch pg_cron mỗi giờ vào phút 17 gọi hàm.
--
-- Định nghĩa đếm khớp 1-1 bản tham chiếu
-- goals/sava-meta-crm/hidden_files/weekly-snapshot/compute_weekly_snapshot.py
-- (đã qua cổng tương đương số: 12 tuần x 5 scope x 40 giá trị =
-- 2.400 giá trị khớp tuyệt đối, 2 cặp chạy liên tiếp; bằng chứng ở
-- hidden_files/weekly-snapshot/payload_python.json,
-- payload_sql.json, compare_result.txt, cron_evidence.txt).
--
-- Đợt 05/11/2026 — GỠ leadStages (Zac chốt: bảng biến động theo
-- trạng thái lead không cần thiết): payload mỗi ô chỉ còn 7 chỉ số;
-- helper ws_lead_status_key (chỉ phục vụ leadStages) được drop ở
-- dưới; leadsMovedUnique giữ nguyên cách tính (không dùng helper).
-- Cổng tương đương cho bản gỡ: Python-mới vs SQL-mới, 2 cặp liên
-- tiếp, 12 tuần x 5 scope x 7 chỉ số = 420 giá trị/cặp, lệch 0;
-- payload mới khớp 420/420 với payload chính thức cũ ở 7 chỉ số.
-- Bằng chứng: hidden_files/weekly-snapshot/
-- payload_*_nostage_pair{1,2}.json, compare_result_nostage.txt,
-- compare_equivalence_nostage.py (so bằng hàm probe + bảng probe
-- tạm, không ghi đè dòng snapshot chính thức).
-- Hàm chỉ ĐỌC các bảng nguồn; chỉ GHI dashboard_snapshots.
-- KHÔNG đổi policy của dashboard_snapshots.
-- Chạy file này qua Management API (SQL) — idempotent.
-- ============================================================

create extension if not exists pg_cron;

-- ============================================================
-- HÀM PHỤ: parse mốc tạo của app (legacy_extra->>'createdAt')
-- Khớp parse_ts() của compute_weekly_snapshot.py:
--  - chuỗi có Z/offset: giữ nguyên offset (parse sang timestamptz);
--  - chuỗi naive (không múi giờ): là giờ tường ICT -> gắn Asia/Saigon;
--  - rỗng / không parse được: fallback mốc DB (p_db).
-- ============================================================
create or replace function public.ws_parse_app_created(p_app text, p_db timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_s text := nullif(btrim(coalesce(p_app, '')), '');
  v_t text;
  v_tail text;
  v_has_tz boolean;
begin
  if v_s is null then
    return p_db;
  end if;
  v_t := v_s;
  -- Python: chuỗi kết thúc 'Z' -> thay bằng '+00:00' trước khi parse.
  if v_t ~ 'Z$' then
    v_t := left(v_t, length(v_t) - 1) || '+00:00';
  end if;
  -- Hậu tố múi giờ chỉ có thể nằm sau phần ngày (10 ký tự đầu).
  v_tail := substring(v_t from 11);
  v_has_tz := v_tail ~ '[+-][0-9]{2}(:[0-9]{2}(:[0-9]{2})?|[0-9]{2})?$'
           or v_tail ~ '[+-][0-9]{2}$';
  begin
    if v_has_tz then
      return v_t::timestamptz;
    else
      return (v_t::timestamp) at time zone 'Asia/Saigon';
    end if;
  exception when others then
    return p_db;
  end;
end;
$$;

-- ============================================================
-- HÀM PHỤ: chỉ số tuần (0..) của một mốc thời gian theo ICT.
-- monday của ngày ICT trừ first_monday, chia 7 (cả hai đều là Thứ 2
-- nên hiệu luôn là bội của 7 — chia nguyên chính xác).
-- Caller tự lọc 0..11 như week_index() trong script Python.
-- ============================================================
create or replace function public.ws_week_index(p_ts timestamptz, p_first_mon date)
returns integer
language sql
stable
as $$
  select case when p_ts is null then null
    else (
      ((p_ts at time zone 'Asia/Saigon')::date
        - (extract(isodow from (p_ts at time zone 'Asia/Saigon')::date)::int - 1)
        - p_first_mon
      ) / 7
    )::int
  end;
$$;

-- ============================================================
-- (ĐÃ GỠ 05/11/2026) Helper ws_lead_status_key (nhãn trạng thái
-- lead -> key) chỉ phục vụ tính leadStages. Zac chốt gỡ bảng biến
-- động theo trạng thái lead khỏi khối "Biến động tuần" nên helper
-- thành mã chết -> drop luôn khỏi DB khi áp file này.
-- leadsMovedUnique KHÔNG dùng helper này (đếm lead duy nhất có
-- diff status bất kể nhãn, kể cả nhãn cũ 'Đạt chuẩn') nên định
-- nghĩa đếm của 7 chỉ số còn lại không đổi.
-- ============================================================
drop function if exists public.ws_lead_status_key(text);

-- ============================================================
-- HÀM CHÍNH: tính lại TOÀN BỘ payload 12 tuần của khối
-- "Biến động tuần" từ audit_log + leads/deals/tasks/activities/
-- members, upsert vào public.dashboard_snapshots
-- (key='weekly_movement'), computed_at = thời điểm tính xong.
-- Thuần ĐỌC các bảng nguồn; chỉ GHI dashboard_snapshots.
-- Định nghĩa đếm khớp 1-1 compute_weekly_snapshot.py.
-- ============================================================
create or replace function public.compute_weekly_snapshot()
returns timestamptz
language plpgsql
as $$
declare
  v_today_ict date := (now() at time zone 'Asia/Saigon')::date;
  v_cur_mon date;
  v_first_mon date;
  v_window_start timestamptz;
  v_payload jsonb;
  v_computed timestamptz;
begin
  v_cur_mon := v_today_ict - (extract(isodow from v_today_ict)::int - 1);
  v_first_mon := v_cur_mon - 77;  -- 11 tuần trước tuần hiện tại
  v_window_start := v_first_mon::timestamp at time zone 'Asia/Saigon';

  with
  active_members as (
    select id from public.members where active
  ),
  scopes as (
    select 'all'::text as scope
    union all select 'member:' || id from active_members
    union all select 'unassigned'::text
  ),
  weeks as (
    select gs as idx, (v_first_mon + gs * 7) as week_start
    from generate_series(0, 11) as gs
  ),
  -- ---------- Số "tạo mới": mốc tạo CỦA APP, quy về owner HIỆN TẠI ----------
  lead_rows as (
    select
      public.ws_week_index(
        public.ws_parse_app_created(l.legacy_extra ->> 'createdAt', l.created_at),
        v_first_mon) as idx,
      case when nullif(l.legacy_extra ->> 'ownerId', '') in (select id from active_members)
        then 'member:' || nullif(l.legacy_extra ->> 'ownerId', '')
        else 'unassigned' end as owner_scope
    from public.leads l
  ),
  deal_rows as (
    select
      public.ws_week_index(
        public.ws_parse_app_created(d.legacy_extra ->> 'createdAt', d.created_at),
        v_first_mon) as idx,
      case when d.owner_id in (select id from active_members)
        then 'member:' || d.owner_id
        else 'unassigned' end as owner_scope
    from public.deals d
  ),
  act_rows as (
    -- deal_id trước, lead_id sau (chuỗi rỗng tính như không có — khớp
    -- truthiness của Python); cha không còn tồn tại -> chỉ 'all'.
    select
      public.ws_week_index(
        public.ws_parse_app_created(a.legacy_extra ->> 'createdAt', a.created_at),
        v_first_mon) as idx,
      case
        when a.deal_id is not null and a.deal_id <> '' and d.id is not null then
          case when d.owner_id in (select id from active_members)
            then 'member:' || d.owner_id else 'unassigned' end
        when (a.deal_id is null or a.deal_id = '')
             and a.lead_id is not null and a.lead_id <> '' and l.id is not null then
          case when nullif(l.legacy_extra ->> 'ownerId', '') in (select id from active_members)
            then 'member:' || nullif(l.legacy_extra ->> 'ownerId', '')
            else 'unassigned' end
        else null
      end as owner_scope
    from public.activities a
    left join public.deals d on d.id = a.deal_id
    left join public.leads l on l.id = a.lead_id
  ),
  created_events as (
    select idx, scope, 'leadsNew'::text as kind
    from lead_rows, lateral unnest(array['all', owner_scope]) as scope
    where idx between 0 and 11
    union all
    select idx, scope, 'dealsNew'
    from deal_rows, lateral unnest(array['all', owner_scope]) as scope
    where idx between 0 and 11
    union all
    select idx, scope, 'activitiesNew'
    from act_rows, lateral unnest(
      case when owner_scope is not null
        then array['all', owner_scope] else array['all'] end) as scope
    where idx between 0 and 11
  ),
  created_agg as (
    select idx, scope, kind, count(*)::int as n
    from created_events group by idx, scope, kind
  ),
  -- ---------- Chuyển động: CHỈ audit action='update' ----------
  trans as (
    select
      a.entity_type,
      a.entity_id,
      public.ws_week_index(a.at, v_first_mon) as idx,
      e ->> 'field' as field,
      coalesce(e ->> 'from', '') as frm,
      coalesce(e ->> 'to', '') as too,
      case a.entity_type
        when 'lead' then l.id is not null
        when 'deal' then d.id is not null
        when 'task' then t.id is not null
        else false
      end as ent_exists,
      case a.entity_type
        when 'lead' then
          case when nullif(l.legacy_extra ->> 'ownerId', '') in (select id from active_members)
            then 'member:' || nullif(l.legacy_extra ->> 'ownerId', '')
            else 'unassigned' end
        when 'deal' then
          case when d.owner_id in (select id from active_members)
            then 'member:' || d.owner_id else 'unassigned' end
        when 'task' then
          case when t.assignee_id in (select id from active_members)
            then 'member:' || t.assignee_id else 'unassigned' end
      end as owner_scope
    from public.audit_log a
    cross join lateral jsonb_array_elements(a.changes) as e
    left join public.leads l on a.entity_type = 'lead' and l.id = a.entity_id
    left join public.deals d on a.entity_type = 'deal' and d.id = a.entity_id
    left join public.tasks t on a.entity_type = 'task' and t.id = a.entity_id
    where a.action = 'update'
      and a.entity_type in ('lead', 'deal', 'task')
      and e ->> 'field' in ('status', 'stage', 'done')
      and a.at >= v_window_start
  ),
  trans_scoped as (
    select idx, entity_type, entity_id, field, frm, too, 'all'::text as scope
    from trans where idx between 0 and 11
    union all
    select idx, entity_type, entity_id, field, frm, too, owner_scope
    from trans where idx between 0 and 11 and ent_exists
  ),
  moved_agg as (
    select idx, scope, count(distinct entity_id)::int as n
    from trans_scoped
    where entity_type = 'lead' and field = 'status'
    group by idx, scope
  ),
  won_agg as (
    select idx, scope, count(distinct entity_id)::int as n
    from trans_scoped
    where entity_type = 'deal' and field = 'stage'
      and btrim(too) in ('Ký hợp đồng — Won', 'won')
    group by idx, scope
  ),
  lost_agg as (
    select idx, scope, count(distinct entity_id)::int as n
    from trans_scoped
    where entity_type = 'deal' and field = 'stage'
      and btrim(too) in ('Thua — Lost', 'Từ chối — Lost', 'lost')
    group by idx, scope
  ),
  task_agg as (
    -- Python: from thuộc {"Không","false","False",""} NHƯNG điều kiện
    -- frm != "" loại from rỗng -> hiệu dụng {Không,false,False}.
    select idx, scope, count(*)::int as n
    from trans_scoped
    where entity_type = 'task' and field = 'done'
      and btrim(frm) in ('Không', 'false', 'False')
      and btrim(too) in ('Có', 'true', 'True')
    group by idx, scope
  ),
  cells as (
    select
      w.idx, w.week_start, s.scope,
      coalesce((select n from created_agg c
        where c.idx = w.idx and c.scope = s.scope and c.kind = 'leadsNew'), 0) as leads_new,
      coalesce((select n from moved_agg m
        where m.idx = w.idx and m.scope = s.scope), 0) as leads_moved,
      coalesce((select n from created_agg c
        where c.idx = w.idx and c.scope = s.scope and c.kind = 'dealsNew'), 0) as deals_new,
      coalesce((select n from won_agg m
        where m.idx = w.idx and m.scope = s.scope), 0) as deals_won,
      coalesce((select n from lost_agg m
        where m.idx = w.idx and m.scope = s.scope), 0) as deals_lost,
      coalesce((select n from created_agg c
        where c.idx = w.idx and c.scope = s.scope and c.kind = 'activitiesNew'), 0) as acts_new,
      coalesce((select n from task_agg m
        where m.idx = w.idx and m.scope = s.scope), 0) as tasks_done
    from weeks w cross join scopes s
  ),
  cell_json as (
    select idx, week_start, scope,
      jsonb_build_object(
        'leadsNew', leads_new,
        'leadsMovedUnique', leads_moved,
        'dealsNew', deals_new,
        'dealsWon', deals_won,
        'dealsLost', deals_lost,
        'activitiesNew', acts_new,
        'tasksCompleted', tasks_done
      ) as metrics
    from cells
  ),
  week_scopes as (
    select idx, week_start, jsonb_object_agg(scope, metrics) as scopes
    from cell_json group by idx, week_start
  )
  select jsonb_build_object(
    'version', 1,
    'weeks', (
      select jsonb_agg(
        jsonb_build_object(
          'weekStart', to_char(week_start, 'YYYY-MM-DD'),
          'scopes', scopes)
        order by idx)
      from week_scopes
    )
  ) into v_payload;

  v_computed := clock_timestamp();
  insert into public.dashboard_snapshots (key, payload, computed_at)
  values ('weekly_movement', v_payload, v_computed)
  on conflict (key) do update
    set payload = excluded.payload, computed_at = excluded.computed_at;

  return v_computed;
end;
$$;

-- ============================================================
-- LỊCH TỰ CHẠY CUỐI: mỗi giờ vào phút 17 (giờ UTC của pg_cron —
-- chu kỳ 1 giờ nên lệch múi giờ không đổi nhịp cập nhật).
-- ============================================================
select cron.unschedule('weekly-snapshot-hourly')
where exists (select 1 from cron.job where jobname = 'weekly-snapshot-hourly');

select cron.schedule(
  'weekly-snapshot-hourly',
  '17 * * * *',
  $$select public.compute_weekly_snapshot()$$
);
