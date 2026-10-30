# Kế hoạch nạp dữ liệu lên Supabase (một lần, không mất dữ liệu)

> Áp dụng ở giai đoạn 2, sau khi đã chạy `schema.sql` + `policies.sql` +
> `seed-market.sql` (xem SETUP.md). Tài liệu này là đặc tả cho bộ nạp
> (importer) mà Miso sẽ viết ở giai đoạn 2 — giai đoạn 1 chưa nạp gì cả.
> Nguyên tắc xuyên suốt: **giữ nguyên id text** (`c1`, `g3`, `d5`, `l2`,
> `t4`, `a1`, `REV-…`, `OBS-…`) làm khóa chính nên mọi liên kết giữ nguyên;
> **không field nào bị bỏ mà không có dòng ghi rõ ở mục 6**.

## 1. Nguồn dữ liệu (3 nguồn)

| # | Nguồn | Nội dung | Cách lấy |
|---|---|---|---|
| 1 | localStorage `sava_crm_shared_v1` trên trình duyệt đang chứa dữ liệu thật | members, companies, games, deals, leads, tasks, activities | Xuất JSON (mục 2) |
| 2 | localStorage `sava_publishing_v1` cùng trình duyệt/origin đó | requests (+revisions), marketUpdates | Xuất JSON (mục 2) |
| 3 | `publishing-data.js` trong repo | 23 market records tĩnh + framework | Đã có `seed-market.sql` — không lấy từ trình duyệt |

Hai khóa `…__corrupt_backup` (nếu có) chỉ là bản sao lưu sự cố hỏng dữ
liệu của app — **không nạp**, chỉ giữ lại file để đối chiếu nếu nghi ngờ
dữ liệu hiện tại từng bị hỏng (mục 6).

## 2. Điều kiện trước + cách xuất JSON

App hiện tại **không có nút xuất dữ liệu** (đã kiểm tra code) nên xuất
bằng DevTools Console. Trước khi xuất, bắt buộc:

1. Mở app (trang BD `index.html`) **một lần** trên đúng trình duyệt/origin
   chứa dữ liệu thật và để trang nạp xong — thao tác này cho các migration
   nội bộ của app tự chạy và tự lưu lại: `migrateState()` (chuẩn hoá
   members, gắn lead↔company còn thiếu, đổi nhãn evidence cũ, đổi tên 5
   lead mẫu) và `migratePartnerLegacy()` của bridge (chuyển
   `company.partnerEval` legacy sang request canonical khi thắng/thua đã
   rõ). Xuất sau bước này giúp bộ nạp nhận dữ liệu đã chuẩn hoá.
2. Mở tiếp trang Publishing (`publishing.html`) một lần — `read()` của
   module này chuẩn hoá kho Publishing khi nạp (đổi nhãn loại bằng chứng
   thị trường `Export`/`Verified source` → `Fact`, chuẩn hoá trạng thái
   evidence lạ → `Chưa rõ`, phục hồi request thiếu id…).
3. Mở DevTools (F12) → tab **Console**, chạy đoạn sau để tải 2 file JSON
   về máy (chạy trên trang đang mở app, đúng origin chứa dữ liệu):

```js
// Xuất 2 kho localStorage thành 2 file JSON tải về máy
for (const key of ['sava_crm_shared_v1', 'sava_publishing_v1']) {
  const raw = localStorage.getItem(key);
  if (!raw) { console.warn('Không có kho', key); continue; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  a.download = key + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
```

4. **Giữ 2 file JSON gốc này như bản sao lưu gốc** (không sửa tay). Mọi
   lần nạp lại đều bắt đầu lại từ 2 file này. Không xóa localStorage cho
   tới khi giai đoạn 2 nghiệm thu xong (app cũ vẫn chạy độc lập).

Bộ nạp chạy bằng quyền **service_role / SQL Editor** (bỏ qua RLS) trên
máy của Miso hoặc trình duyệt admin — không chạy bằng tài khoản BD/MKT
thường vì RLS sẽ chặn đúng các bảng private/admin-only cần nạp.

## 3. Bảng mapping A — kho `sava_crm_shared_v1`

### 3.1 `members[]` → `members` (NGOẠI LỆ cơ chế nạp — F10)

`members` là bảng **duy nhất không** nạp theo cơ chế xoá-rồi-nạp-lại của
mục 5.7/8: vì bootstrap (SETUP.md mục 5) đã tạo sẵn 4 dòng và `profiles`
đang trỏ vào chúng, bộ nạp dùng **upsert**
`insert ... on conflict (id) do update` cho `name`/`role`/`active` —
**giá trị từ JSON thật thắng** khi id trùng. Dòng member có trong DB mà
không có trong JSON (vd tài khoản test tạo sau bootstrap) được giữ
nguyên, không tự xoá. Rollback (mục 8) cũng không đụng vào `members`.

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `id` | Giữ nguyên (`zac`/`linh`/`tuan`/`mai`/`u…`) |
| `name` | `name` | Upsert: JSON thật thắng |
| `role` | `role` | Giữ nguyên văn `Admin`/`BD`/`MKT`/`Khác` (CHECK khớp đúng 4 giá trị app ép); upsert: JSON thật thắng |
| `active` | `active` | Upsert: JSON thật thắng |
| — | `profiles` | Tạo riêng ở bước bootstrap (SETUP.md mục 5), không có trong JSON |

### 3.2 `companies[]` → `companies` (+ archive)

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `companies.id` | |
| `name` | `name` | |
| `type` | `type` | Text tự do, giữ giá trị cũ ngoài danh sách |
| `roles` | `roles` (jsonb) | Object `{line: nhãn}` nguyên vẹn |
| `contact` | `contact` | |
| `phone` | `phone` | |
| `last` | `last_label` | Chữ tự do ("Hôm qua"…) — không parse ngày |
| `partnerEvalMigrated` | `partner_eval_migrated` | Mặc định `false` khi vắng |
| `partnerEval` | `company_partner_eval_archive.partner_eval` (jsonb, **nguyên vẹn**) | **Không** để ở `companies` vì chứa `dealFit` + `hardGate.*.note` (thương mại, MKT bị cấm). Cấu trúc bên trong: `hardGate{6 cổng:{status,note}}`, `evidence{7 pillar:{status,note}, productionSubs{4 ô:{status,note}}}`, `scores{7 pillar}`, `dealFit`, `notesWeak`, `nextAction`, `reviewDate`, `reviewer`, `updatedAt` — tất cả nằm trong một jsonb nên không sót field con nào |

### 3.3 `games[]` → `games`

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `id` | |
| `title` | `title` | |
| `own` | `own` | `ours`/`partner` (CHECK) |
| `company` | `company_id` | Chỉ game partner; `''`/vắng → NULL. FK `companies` |
| `genre` | `genre` | |
| `platform` | `platform` | |
| `stage` | `stage` | |
| `emoji` | `emoji` | |
| `desc` | `description` | Đổi tên cho rõ; mapping 1-1 |
| `bdNote` | `bd_note` | MKT đọc được có chủ đích (C7) — để ở bảng công khai là đúng |
| `buildUrl` | `build_url` | |
| `trailerUrl` | `trailer_url` | |
| `scores` | `scores_bd` (jsonb) | Điểm BD /10 lưu trữ: khóa `Gameplay`, `Đồ họa`, `Monetization`, `Tiềm năng TT`, `Kỹ thuật`; vắng/null → NULL |
| `verdict` | `bd_verdict` | Chỉ partner; vắng → NULL |
| `mktEval` | `mkt_eval` (jsonb) | Nguyên vẹn: `{scores:{market,audience,ua,usp,trend}, verdict, by, at, comment}` hoặc null |

### 3.4 `deals[]` → `deals` + `deal_terms` + `deal_contracts` + `deal_leads`

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `deals.id` | |
| `line` | `line` | CHECK 4 mảng |
| `title` | `title` | |
| `company` | `company_id` | FK `companies`, **nullable**: `''`/vắng (kể cả do `deleteCompany` đã gỡ liên kết trong app) → NULL. Xoá công ty ở DB → `ON DELETE SET NULL`, deal vẫn tồn tại — đúng hành vi app (F1) |
| `game` | `game_id` | Vắng → NULL. FK `games` |
| `stage` | `stage` | Text (giữ stage cũ ngoài danh sách của line) |
| `owner` | `owner_id` | `''` → NULL; không FK (id người cũ được phép không còn trong members) |
| `due` | `due_date` + `due_raw` | ISO → `due_date`; `due_raw` luôn giữ chuỗi gốc |
| `idle` | `idle_days` | |
| `amount` | `amount` | Chỉ deal ai/metaverse; deal game vắng → NULL (không ép 0) |
| `cur` | `currency` | `VND`/`USD`; deal game vắng → NULL |
| `custom` | `custom` (jsonb nguyên vẹn) | Khóa theo line — game_studio: `publisher_regions`, `build_version_sent`; publishing: `support_needed`, `planned_investment` (+ side-key `planned_investment_cur`, `planned_investment_text`); ai: `use_case`, `data_readiness`, `current_systems`, `poc_scope`, `poc_result`; metaverse: `use_case`, `platform_target`, `expected_users`, `hardware_needed`, `concept_url`. Mọi khóa lạ khác nếu có vẫn nằm nguyên trong jsonb — không mất |
| `term.rev_share` | `deal_terms.rev_share_raw` + `rev_share_sava`/`rev_share_partner` | Hai cột số parse theo đúng `parseRevShare()` của index.html (số % kèm chữ "Sava" → sava; số % còn lại → partner; không parse được → NULL, raw còn nguyên). Chỉ tạo dòng `deal_terms` khi deal có `term` |
| `term.advance` | `deal_terms.advance_raw` | Chuỗi hiển thị gốc |
| `term.advance_num` | `deal_terms.advance_num` | App lưu dạng chuỗi số → ép `numeric`; không ép được → để NULL + ghi chuỗi vào `legacy_extra` của dòng term kèm báo cáo |
| `term.advance_cur` | `deal_terms.advance_cur` | |
| `term.territories` | `deal_terms.territories` | Chuỗi multi join `, ` giữ nguyên, không tách |
| `term.duration` | `deal_terms.duration` | |
| `term.exclusivity` | `deal_terms.exclusivity` | |
| `term.marketing` | `deal_terms.marketing` | |
| `term.payment` | `deal_terms.payment` | |
| `contract.status` | `deal_contracts.status` | Chỉ tạo dòng khi deal có `contract` |
| `contract.no` | `deal_contracts.contract_no` | |
| `contract.signed` | `deal_contracts.signed_date` + `signed_raw` | Như quy tắc ngày ở `due` |
| `contract.url` | `deal_contracts.url` | |
| `leads[]` | `deal_leads(deal_id, lead_id)` | **Nguồn sự thật duy nhất** của quan hệ deal↔lead (theo `migrateState`). Mỗi phần tử = 1 dòng. Lead id không tồn tại trong `leads` (dữ liệu hỏng) → bỏ qua + báo cáo, không tự tạo lead |

### 3.5 `leads[]` → `leads`

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `id` | |
| `name` | `name` | Tên **người** đầu mối (sau đợt đổi tên 29/10) |
| `company` | `company_id` | `''` → NULL (đã chủ động gỡ công ty — app cấm tự tạo lại) |
| `person` | `person` | Chuỗi mô tả đầu mối ("Anh Minh — Founder"), khác `name` |
| `line` | `line` | CHECK 4 mảng |
| `source` | `source` | Giữ giá trị cũ ngoài danh sách |
| `status` | `status` | CHECK `new/contacted/qualified/converted` |
| `note` | `note` | |
| `when` | `when_date` + `when_raw` | Seed là chữ ("Hôm nay"…), bản ghi mới là ISO — cặp cột xử lý cả hai |

### 3.6 `tasks[]` → `tasks`

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `id` | |
| `title` | `title` | |
| `assignee` | `assignee_id` | `''` → NULL; không FK (như `owner`) |
| `deal` | `deal_id` | Vắng/`''` → NULL. FK `deals` với `on delete set null` (xóa deal không xóa việc, khớp hành vi app) |
| `due` | `due_label` | Nhãn chữ cũ, chỉ còn fallback hiển thị |
| `dueDate` | `due_date` | `''` → NULL |
| `done` | `done` | |
| `overdue` | `overdue_stored` | Cờ đã lưu; app tính quá hạn **động** theo `dueDate` — cột này chỉ để đối chiếu, giai đoạn 2 không dùng làm sự thật |

### 3.7 `activities[]` → `activities`

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `id` | |
| `deal` | `deal_id` | FK `deals`, cascade khi xóa deal như app |
| `type` | `type` | CHECK theo 7 loại form hiện tại; giá trị lạ → bộ nạp dừng và báo cáo (không tự nới) |
| `who` | `actor_id` | `''` → NULL; không FK |
| `when` | `occurred_date` + `occurred_raw` | Cặp cột ngày như `leads.when` |
| `text` | `text` | |
| `url` | `url` | Có thể vắng → NULL |

## 4. Bảng mapping B — kho `sava_publishing_v1`

Cấu trúc kho: `{version: 1, requests: [...], marketUpdates: [...]}`.
`version` → ghi vào `app_state_meta` (key `sava_publishing_v1`, value chứa
`{version: 1, migrated_at, counts}`); kho CRM tương tự với key
`sava_crm_shared_v1` (kho này không có số version trong app).

### 4.1 `requests[]` → `publishing_requests` (+ private intake)

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `id` | `REV-<uuid>` / `REV-mig-…` / `REV-restored-<i>` giữ nguyên |
| `kind` | `kind` | `game`/`company` (CHECK) |
| `entityId` | `game_id` hoặc `company_id` (+ `entity_id` GENERATED) | Theo `kind`. Entity đã bị xóa khỏi CRM (request mồ côi — app vẫn cho xem nhưng khóa lưu): bộ nạp **báo cáo danh sách mồ côi trước khi nạp**; FK sẽ chặn nạp các dòng này → quyết định xử lý (xóa request mồ côi hay khôi phục entity) phải chốt với Zac trước, không tự ý (mục 8). Hai FK này là `ON DELETE RESTRICT` (F2): sau nạp, giai đoạn 2 xoá game/công ty còn request tham chiếu sẽ bị DB chặn — phải xoá request tường minh trước, không cascade âm thầm |
| `requestedBy` | `requested_by` | `''` → NULL |
| `assignee` | `assignee_id` | `''` → NULL |
| `due` | `due_date` + `due_raw` | Quy tắc ngày như trên |
| `requestNote` | `request_note` | |
| `source` | `source_url` | |
| `build` | `build_label` | |
| `intake` | `intake` (jsonb) **sau khi gỡ `expectations`** | Khóa game: `mechanicId, genre, subGenre, artStyle, coreLoop, gameFeel, platforms, devStage, monetizationModel, targetGeo, metricDownloads, metricRetention, metricCpi, metricRevenue, metricRevenueCur, storeUrl, videoUrl` (+ `expectations` tách riêng). Khóa company: `teamSize, country, mainGenres, mainPlatforms, trackRecord, website`. Giá trị giữ nguyên kiểu app (chuỗi/số/`metricCpi` là số hoặc `''`) — jsonb chứa được cả hai, không ép kiểu |
| `intake.expectations` | `publishing_request_intake_private.expectations` | Chỉ tạo dòng private khi có field này (kể cả chuỗi rỗng thì tạo dòng với `''` để phân biệt "đã tách" với "không có") |
| `status` | `status` | CHECK 4 trạng thái review |
| `requestedAt` | `requested_at` | ISO → timestamptz; rỗng/lạ → NULL (gốc còn trong file JSON sao lưu) |
| `current` | `current_revision_no` | Quy tắc vật hoá ở mục 5.3 |
| `revisions[]` | `publishing_revisions` (+ private) | Mỗi phần tử 1 dòng, `revision_no` = vị trí 1-based (mục 4.2) |
| `revision` | `legacy_revision_counter` | Sau nạp phải bằng số dòng revisions của request — lệch là cờ kiểm tra (mục 7) |
| `migratedFrom` | `migrated_from` | Có thể vắng → NULL |

### 4.2 Phần tử `revisions[]` / `current` → `publishing_revisions` + `publishing_revision_private`

| Field app | Cột DB | Ghi chú |
|---|---|---|
| (vị trí mảng) | `revision_no` | 1-based theo thứ tự mảng gốc |
| `reviewer` | `reviewer_id` | `''` → NULL |
| `role` | `author_role` | `bd`/`mkt`/`''` (CHECK) |
| `status` | `status` | 4 trạng thái review; vắng → NULL |
| `at` | `evaluated_at` | ISO → timestamptz; rỗng → NULL |
| `build` | `build_label` | |
| `entries` | `entries` (jsonb) **sau khi gỡ 2 khóa private** | Game: 8 khóa Market (`size, growth, entry, monetization, ua, economics, rtw, whitespace`) + 6 khóa Prototype (`uaTest, retention, engagement, monetizationTest, gamefeel, tech`). Company: `track, team, capacity, cadence, milestone, liveops, data, collaboration, strategy, pipeline, history` (+ khóa `production` nếu dữ liệu cũ có — giữ nguyên trong jsonb). Mỗi entry `{score, status, note, source}` giữ nguyên |
| `entries.deal` | `publishing_revision_private.deal_entry` | Chỉ company; nguyên vẹn `{score,status,note,source}` |
| `entries.legalEvidence` | `publishing_revision_private.legal_entry` | Chỉ company |
| `gates` | `gates` (jsonb, chỉ `{value}` từng cổng) + `publishing_revision_private.gate_details` (`{note, source}` từng cổng) | Chỉ company. 6 khóa: `legal, ip, conflict, transparency, continuity, integrity`. Dữ liệu cũ dùng khóa `control` thay `continuity` → bộ nạp đổi tên khi ghi cả hai nơi (đúng normalize của app) |
| `gate` | `gate_value` | Chỉ game: `PASS`/`FAIL`/`PENDING` |
| `gateNote` | `publishing_revision_private.game_gate_note` | Chỉ game |
| `gateSource` | `publishing_revision_private.game_gate_source` | Chỉ game |
| `scoresV2` | `scores_v2` (jsonb nguyên vẹn) | `{version, fromMechanicId (hoặc mechanicId ở bản cũ), market{…}, prototype{…}}`; vắng/null → NULL (revision legacy) |
| `quality` | `quality` | Evidence Quality game legacy; vắng → NULL |
| `productionPillarEvidence` | `production_pillar_evidence` (jsonb, chỉ `{status, note}`) + `publishing_revision_private.production_pillar_source` | Chỉ revision company do migration Partner tạo. `source` **tách sang private** (F5) như mọi nguồn xác minh khác; cột công khai chứa `source` sẽ bị CHECK từ chối |
| `reviewDate` | `review_date` + `review_date_raw` | Chỉ revision company do migration tạo |
| `strengths` | `strengths` | |
| `risks` | `risks` | |
| `conditions` | `conditions` | |
| `next` | `next_action` | |
| `comment` | `comment_public` | Nhận xét MKT — công khai giữa BD/MKT như app |
| `bdComment` | `publishing_revision_private.bd_comment` | MKT không thấy kể cả trong lịch sử (D5) |
| `frameworkVersion` | `framework_version` | |
| `legacy` | `is_legacy` | `true` khi revision chốt theo khung workbook cũ; vắng → `false` |
| `migratedFrom` | `migrated_from` | |
| `hardGate` (biến thể cũ thay `gates`, nếu gặp) | `gates` + `gate_details` | Map `status` (`Đạt`→`PASS`, `Không đạt`→`FAIL`, còn lại→`PENDING`) thành `value`; `note` → `gate_details` |
| Mọi khóa khác (vd `scores` ở current cũ) | `legacy_extra` của dòng revision | Không bỏ — nhét nguyên vào `legacy_extra` + liệt kê trong báo cáo nạp |

### 4.3 `marketUpdates[]` → `market_observations` + `market_observation_audit`

| Field app | Cột DB | Ghi chú |
|---|---|---|
| `id` | `market_observations.id` | Trùng id record tĩnh → đồng thời set `record_id = id` (overlay); `OBS-…` → `record_id` NULL |
| `name` | `name` | |
| `category` | `category` | |
| `date` | `snapshot_date` | ISO của input date; rỗng → NULL |
| `geo` | `geo` | |
| `platform` | `platform` | |
| `downloads` | `downloads` | `null` giữ NULL (chưa có ≠ 0) |
| `revenue` | `revenue` | `null` giữ NULL |
| `url` | `source_url` | |
| `by` | `updated_by` | Member id; `''` → NULL |
| `confidence` | `confidence` | Số nguyên 1–5 (CHECK) |
| `evidenceType` | `evidence_type` | Giữ nguyên giá trị sau chuẩn hoá của `read()` (taxonomy `Fact/Proxy/Hypothesis/Internal actual` hoặc giá trị cũ ngoài taxonomy — không CHECK) |
| `note` | `note` | |
| `history` | `history` (jsonb) | Quan sát mới luôn `{}` — giữ đúng |
| `cpi` | `cpi` (jsonb) | Như trên |
| `top1`/`top3`/`top5` | `top1`/`top3`/`top5` | |
| `newcomer` | `newcomer` | |
| `historyNote` | `history_note` | |
| `historyPeriod` | `history_period` | |
| `cpiScope` | `cpi_scope` | |
| `provenance` | `provenance` (jsonb) | Giữ nguyên mảng nguồn gốc (A11/M2) |
| `at` | `updated_at` (+ `created_at` lần nạp đầu) | Mốc cập nhật gần nhất của quan sát |
| `audit[]` | `market_observation_audit` | Mỗi phần tử 1 dòng: `seq` = vị trí 0-based; `date`→`snapshot_date`+`snapshot_raw`; `downloads`, `revenue`, `url`→`source_url`, `note`, `by`→`by_label` (có thể là chữ `Workbook`), `at`→`occurred_at`, `evidenceType`→`evidence_type`, `provenance`, `confidence` |

## 5. Quy tắc chuyển đổi bắt buộc của bộ nạp

1. **Thứ tự nạp** (tôn trọng FK): `members` → (bootstrap `profiles`) →
   `companies` → `company_partner_eval_archive` → `games` → `leads` →
   `deals` → `deal_terms`/`deal_contracts` → `deal_leads` → `tasks` →
   `activities` → (`market_datasets`/`market_records` đã có từ seed) →
   `publishing_requests` → `publishing_revision…`: revisions trước,
   private sau, `publishing_request_intake_private` sau requests →
   `market_observations` → `market_observation_audit` → `app_state_meta`.
   FK vòng tròn `current_revision_no` là DEFERRABLE nên set con trỏ ở
   cuối transaction vẫn hợp lệ.
2. **Chuẩn hoá rỗng**: chuỗi `''` → NULL cho mọi cột FK/người/ngày/số.
   Ngược lại các cột text nội dung (`note`, `text`, nhãn…) giữ nguyên kể
   cả `''` như app.
3. **`current` → `current_revision_no`**: so `current` với phần tử cuối
   của `revisions[]` (so sâu JSON sau khi đã tách field private ở cả hai):
   - Trùng → `current_revision_no` = số phần tử.
   - `revisions[]` rỗng và `current` rỗng/`{}`/null → NULL.
   - Lệch nhau hoặc `revisions[]` rỗng mà `current` có dữ liệu →
     **vật hoá** `current` thành một revision bổ sung ở cuối
     (`revision_no` = count+1, `migrated_from` giữ nguyên nếu có, không
     thì `'current-snapshot'`), rồi trỏ `current_revision_no` vào đó và
     ghi ca này vào báo cáo nạp. Đây là ca duy nhất bộ nạp "tạo thêm" dữ
     liệu — có chủ đích để không mất bản chấm chỉ tồn tại ở `current`.
4. **Tách field nhạy cảm trước khi ghi bảng công khai** (thứ tự: tách
   trước, ghi sau — không ghi bản đầy đủ vào bảng công khai rồi mới xoá):
   `intake.expectations`; `entries.deal`, `entries.legalEvidence`;
   `gates.*.note/source`; `gateNote`, `gateSource`, `bdComment`;
   `productionPillarEvidence.source`; `companies.partnerEval`. Nếu sót,
   các CHECK ở tầng DB (F3/F5 trong `schema.sql`) sẽ **từ chối lệnh ghi**
   ngay — bộ nạp phải coi lỗi CHECK là lỗi tách field và sửa ở bộ nạp,
   không nới CHECK. Sau nạp chạy truy vấn quét rò rỉ ở mục 7.3 — phải
   ra 0 dòng.
5. **Khoá lạ → `legacy_extra`**: bất kỳ khóa nào ở bất kỳ object nào
   không có trong bảng mapping mục 3–4 đều được nhét nguyên vào
   `legacy_extra` của dòng tương ứng và liệt kê trong báo cáo nạp (đường
   dẫn khóa + số lượng). Không ngoại lệ im lặng.
6. **Không tự suy diễn**: không tự tạo company/game/lead còn thiếu, không
   parse ngày từ chữ tự do ("Hôm qua" ở nguyên trong cột `_raw`), không
   đổi giá trị evidence/điểm, không gộp request trùng `kind+entityId`
   (giữ tất cả; app chọn bản cuối mảng — bộ nạp giữ nguyên thứ tự bằng
   `requested_at` + thứ tự xuất hiện trong file và báo cáo danh sách
   trùng để Zac quyết định dọn sau).
7. **Idempotent theo đợt**: bộ nạp chạy trong 1 transaction cho mỗi kho;
   chạy lại từ đầu phải cho kết quả như một lần (xoá dữ liệu đã nạp của
   đợt trước theo danh sách bảng ở mục 8 rồi nạp lại — không upsert từng
   dòng để tránh trạng thái nửa vời). **Ngoại lệ duy nhất là `members`**
   (mục 3.1, F10): upsert theo id, không xoá-nạp-lại, không truncate khi
   rollback.

## 6. Field/khóa bị loại có chủ đích (và lý do)

| Khóa | Lý do không nạp |
|---|---|
| `deal.pubos`, `deal.pubosPending`, `game.pubos`, state `pubosWithdrawals` | Di sản kết nối Publishing OS đã gỡ 28/10/2026; `migrateState()` của app tự xóa mỗi lần nạp kho nên file xuất (sau mục 2 bước 1) vốn đã không còn các khóa này. Nếu vẫn gặp → chúng rơi vào `legacy_extra` theo quy tắc 5.5 chứ không vào cột riêng |
| Hai khóa `sava_crm_shared_v1__corrupt_backup`, `sava_publishing_v1__corrupt_backup` | Bản sao lưu sự cố do app tự ghi khi dữ liệu hỏng — không phải dữ liệu nghiệp vụ. Giữ file riêng để đối chiếu nếu cần khôi phục thủ công |
| `USERS` (hằng trong shared.js) | Không nằm trong kho — chỉ là fallback tên + nguồn khởi tạo members mặc định; members thật đã ở mục 3.1 |
| `PublishingData.framework` tách lẻ | Đã nằm trong `market_datasets.framework` (jsonb) từ seed — không tách bảng riêng vì frontend đọc nguyên khối |
| Trường tính suy diễn (Partner Fit, Final v2, marketAuto…) | Không tồn tại trong kho (JS tính khi hiển thị) → không có gì để nạp; DB không lưu bản sao (DESIGN.md mục 5.7) |

Ngoài danh sách này: **không field nào khác bị loại**.

## 7. Kiểm tra đối chiếu sau nạp (bắt buộc, có số)

### 7.1 Số lượng từng thực thể

So số dòng DB với độ dài mảng trong 2 file JSON gốc:

```sql
select 'members' t, count(*) from public.members
union all select 'companies', count(*) from public.companies
union all select 'games', count(*) from public.games
union all select 'deals', count(*) from public.deals
union all select 'deal_terms', count(*) from public.deal_terms
union all select 'deal_contracts', count(*) from public.deal_contracts
union all select 'leads', count(*) from public.leads
union all select 'deal_leads', count(*) from public.deal_leads
union all select 'tasks', count(*) from public.tasks
union all select 'activities', count(*) from public.activities
union all select 'publishing_requests', count(*) from public.publishing_requests
union all select 'publishing_revisions', count(*) from public.publishing_revisions
union all select 'market_records', count(*) from public.market_records
union all select 'market_observations', count(*) from public.market_observations
union all select 'market_observation_audit', count(*) from public.market_observation_audit;
```

Kỳ vọng: bằng đúng độ dài mảng tương ứng; `deal_terms` = số deal có
`term`; `deal_contracts` = số deal có `contract`; `deal_leads` = tổng độ
dài mọi `deal.leads[]`; `publishing_revisions` = tổng độ dài mọi
`revisions[]` (+ số revision vật hoá từ `current` theo quy tắc 5.3, phải
có danh sách kèm theo); `market_records` = 23 (từ seed).

### 7.2 Liên kết + tính nhất quán

```sql
-- Request nào có legacy_revision_counter lệch số revision thật:
select id, legacy_revision_counter,
       (select count(*) from public.publishing_revisions r where r.request_id = q.id) as actual
from public.publishing_requests q
where legacy_revision_counter <>
      (select count(*) from public.publishing_revisions r where r.request_id = q.id);
-- (Dòng lệch chỉ chấp nhận được nếu thuộc danh sách vật hoá current ở 5.3
--  và đã được ghi vào báo cáo nạp.)

-- Request trùng kind+entity (app lấy bản cuối mảng làm canonical):
select kind, entity_id, count(*) from public.publishing_requests
group by 1, 2 having count(*) > 1;

-- Tổng tiền deal ai/metaverse đối chiếu với JSON (chạy số tương tự phía JSON):
select line, count(*), sum(amount) from public.deals
where amount is not null group by 1;
```

Cộng thêm kiểm tra bằng mắt 3 hồ sơ chuẩn (nếu còn trong dữ liệu nạp):
deal có contract mẫu (`contract_no` dạng `HD-PUB-…`), game partner có
`mkt_eval` mẫu, và một request company đã migrate từ Partner legacy —
mở song song app cũ và truy vấn DB, so từng field theo bảng mapping.

### 7.3 Quét rò rỉ field nhạy cảm vào bảng công khai (phải = 0)

```sql
select count(*) from public.publishing_requests
where intake ? 'expectations';                                    -- phải 0
select count(*) from public.publishing_revisions
where entries ?| array['deal', 'legalEvidence']                   -- phải 0
   or not public.jsonb_gates_public_only(gates)                   -- phải 0 (note/source ở bất kỳ cổng nào)
   or (production_pillar_evidence is not null
       and production_pillar_evidence ? 'source');                -- phải 0 (F5: source nằm ở private)
-- partnerEval chỉ được tồn tại ở bảng archive (admin+bd), companies không
-- có cột nào chứa nó theo thiết kế — kiểm tra số dòng archive bằng đúng số
-- công ty có partnerEval trong file JSON gốc:
select count(*) from public.company_partner_eval_archive;  -- = số công ty có partnerEval trong JSON

-- Đường vòng qua legacy_extra (NF1) — các CHECK tương ứng ở schema.sql
-- cấm đúng các khoá này trong túi dự phòng của bảng công khai; quét ở
-- đây vẫn phải ra 0 như mọi mục trên:
select count(*) from public.publishing_revisions
where legacy_extra ?| array['deal', 'legalEvidence', 'hardGate'];  -- phải 0 (deal/legalEvidence = 2 khoá entries tách sang private; hardGate = biến thể cũ của gates chứa note từng cổng)
select count(*) from public.companies
where legacy_extra ? 'partnerEval';                               -- phải 0 (partnerEval chỉ ở company_partner_eval_archive)
```

Các CHECK tương ứng trong `schema.sql` vốn đã chặn những dữ liệu này từ
lúc ghi, nên quét ở đây là lớp đối chiếu thứ hai (bắt ca dữ liệu lọt qua
đường service_role cũ hoặc schema bị sửa tay), không phải lớp chặn chính.

## 8. Rollback / sao lưu

- **Trước nạp**: giữ 2 file JSON gốc (mục 2) + chụp thêm một bản sao
  project bằng tính năng backup của Supabase (Database → Backups; gói
  Free dùng bản sao logic: xuất SQL toàn bộ schema qua SQL Editor/
  `pg_dump` nếu có CLI). Project lúc nạp đang trống nên rollback đơn
  giản là về trạng thái trống.
- **Nạp hỏng giữa chừng**: bộ nạp chạy theo transaction từng kho nên
  một kho hỏng = kho đó không đổi gì. Nếu phải làm lại toàn bộ: chạy
  đoạn dọn dưới đây (thứ tự con → cha, `service_role`/SQL Editor) rồi
  nạp lại từ 2 file JSON gốc:

```sql
truncate public.market_observation_audit, public.market_observations,
  public.publishing_revision_private, public.publishing_revisions,
  public.publishing_request_intake_private, public.publishing_requests,
  public.company_partner_eval_archive, public.activities, public.tasks,
  public.deal_leads, public.deal_contracts, public.deal_terms,
  public.deals, public.leads, public.games, public.companies,
  public.app_state_meta
restart identity cascade;
-- KHÔNG truncate members/profiles (F10): members đã tạo ở bootstrap và
-- profiles đang trỏ vào; nạp lại members bằng upsert ở mục 3.1 (JSON
-- thật thắng), không xoá-nạp-lại như các bảng trên đây.
-- Cũng không truncate market_datasets/market_records (chạy lại
-- seed-market.sql nếu cần).
```

- **Sau nạp**: localStorage gốc vẫn nguyên trong trình duyệt cho tới khi
  nghiệm thu giai đoạn 2 xong — đó là đường quay lui cuối cùng: tắt
  frontend mới, app cũ chạy lại đúng dữ liệu cũ. Chỉ xóa dữ liệu trình
  duyệt khi Zac xác nhận nghiệm thu.
- **Ca cần Zac quyết định trước khi nạp** (bộ nạp không tự xử lý):
  request mồ côi (entity đã xóa — mục 4.1) và các dòng `legacy_extra`
  phát sinh (mục 5.5) — cả hai đều có danh sách cụ thể trong báo cáo nạp
  để Zac duyệt từng mục.
