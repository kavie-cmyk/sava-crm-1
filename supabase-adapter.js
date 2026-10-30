/* Sava Meta CRM — Adapter ánh xạ dữ liệu (Giai đoạn 2b).
   Hàm THUẦN (không gọi mạng, không chạm DOM/localStorage): chuyển đổi hai
   chiều giữa hình dạng state mà UI/tính điểm hiện tại đang dùng
     - CRM:        {members, companies, games, deals, leads, tasks, activities}
     - Publishing: {version:1, requests, marketUpdates}
   và các dòng (rows) của các bảng Supabase theo đúng supabase/DESIGN.md +
   supabase/MIGRATION.md:
     - Giữ nguyên id text.
     - Chuỗi '' ở khoá ngoại/người/ngày -> NULL khi ghi; đọc lại trả về ''
       hoặc bỏ khoá (đúng ngữ nghĩa app, xem từng field).
     - Field ngày lẫn chữ tự do: cặp <x>_date (chỉ khi parse được ISO) +
       <x>_raw (giữ nguyên chuỗi gốc); đọc lại ưu tiên _raw.
     - Khoá lạ ở bất kỳ object nào -> legacy_extra khi ghi, gộp lại khi đọc
       (không mất field nào, đúng quy tắc 5.5 của MIGRATION.md).
     - Field NHẠY CẢM tách sang bảng private khi ghi và ghép lại khi đọc
       (chỉ khi có dữ liệu private — phía MKT đọc không có private vẫn ra
       state hợp lệ):
         intake.expectations              -> publishing_request_intake_private
         revision.bdComment               -> publishing_revision_private.bd_comment
         revision.gateNote / gateSource   -> publishing_revision_private.game_gate_note/source
         revision.entries.deal            -> publishing_revision_private.deal_entry
         revision.entries.legalEvidence   -> publishing_revision_private.legal_entry
         revision.gates.<k>.note/source   -> publishing_revision_private.gate_details
         revision.productionPillarEvidence.source
                                          -> publishing_revision_private.production_pillar_source
         company.partnerEval              -> company_partner_eval_archive
   File này chạy được cả trong trình duyệt (window.SavaAdapter) lẫn Node
   (module.exports) để test bằng harness như các vòng trước. */
(function () {
  'use strict';

  /* ---------- tiện ích ---------- */
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) {
    if (v === undefined) return undefined;
    if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch (e) {} }
    return JSON.parse(JSON.stringify(v));
  }
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const ka = Object.keys(a).filter(k => a[k] !== undefined), kb = Object.keys(b).filter(k => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) { if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false; }
    return true;
  }
  function hashStr(s) { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36) + '-' + s.length; }
  /* Ngày: app lưu lẫn lộn ISO ('2026-10-30') và chữ tự do ('Hôm qua'). */
  function isoDatePart(v) {
    if (typeof v !== 'string') return null;
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  function datePair(v) { const raw = v === undefined || v === null ? '' : String(v); return { date: isoDatePart(raw), raw }; }
  function pairBack(date, raw) {
    if (raw !== undefined && raw !== null && raw !== '') return raw;
    return date || '';
  }
  function nullIfEmpty(v) { return v === '' || v === undefined || v === null ? null : v; }
  function emptyIfNull(v) { return v === undefined || v === null ? '' : v; }
  function numOrNull(v) {
    if (v === '' || v === undefined || v === null) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  /* Khoá lạ -> legacy_extra; khi đọc, gộp legacy_extra trở lại object
     (không ghi đè khoá đã có cột riêng). */
  function extrasOf(obj, known) {
    const out = {};
    if (!isObj(obj)) return out;
    for (const k of Object.keys(obj)) {
      if (known.indexOf(k) >= 0) continue;
      if (k === 'legacy_extra') { if (isObj(obj[k])) Object.assign(out, clone(obj[k])); continue; }
      if (obj[k] !== undefined) out[k] = clone(obj[k]);
    }
    return out;
  }
  function mergeExtras(target, row) {
    if (row && isObj(row.legacy_extra)) {
      for (const k of Object.keys(row.legacy_extra)) {
        if (!(k in target) || target[k] === undefined) target[k] = clone(row.legacy_extra[k]);
      }
    }
    return target;
  }
  /* Parse rev share — sao đúng parseRevShare() trong index.html:
     số % đi kèm chữ "Sava" là phía Sava, số % còn lại là phía partner. */
  function parseRevShare(str) {
    const s = String(str || '');
    const nums = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(m => m[1].replace(',', '.'));
    if (!nums.length) return null;
    const savaM = s.match(/Sava\s*(\d+(?:[.,]\d+)?)\s*%/i);
    const sava = savaM ? savaM[1].replace(',', '.') : nums[0];
    let partner = null;
    for (const n of nums) { if (n !== sava) { partner = n; break; } }
    if (partner === null) partner = nums.length > 1 ? nums[1] : null;
    return { sava: numOrNull(sava), partner: numOrNull(partner) };
  }

  /* ==================================================================
     KHO CRM — state -> rows
     ================================================================== */
  const COMPANY_KNOWN = ['id', 'name', 'type', 'roles', 'contact', 'phone', 'last', 'partnerEval', 'partnerEvalMigrated'];
  const GAME_KNOWN = ['id', 'title', 'own', 'company', 'genre', 'platform', 'stage', 'emoji', 'desc', 'bdNote', 'buildUrl', 'trailerUrl', 'scores', 'verdict', 'mktEval'];
  const DEAL_KNOWN = ['id', 'line', 'title', 'company', 'game', 'stage', 'owner', 'due', 'idle', 'amount', 'cur', 'custom', 'term', 'contract', 'leads'];
  const TERM_KNOWN = ['rev_share', 'advance', 'advance_num', 'advance_cur', 'territories', 'duration', 'exclusivity', 'marketing', 'payment'];
  const CONTRACT_KNOWN = ['status', 'no', 'signed', 'url'];
  const LEAD_KNOWN = ['id', 'name', 'company', 'person', 'line', 'source', 'status', 'note', 'when'];
  const TASK_KNOWN = ['id', 'title', 'assignee', 'deal', 'due', 'dueDate', 'done', 'overdue'];
  const ACTIVITY_KNOWN = ['id', 'deal', 'type', 'who', 'when', 'text', 'url'];
  const MEMBER_KNOWN = ['id', 'name', 'role', 'active'];

  function crmStateToRows(state) {
    const s = isObj(state) ? state : {};
    const rows = {
      members: [], companies: [], company_partner_eval_archive: [], games: [],
      deals: [], deal_terms: [], deal_contracts: [], deal_leads: [],
      leads: [], tasks: [], activities: [],
    };
    (Array.isArray(s.members) ? s.members : []).forEach(m => {
      if (!isObj(m) || !m.id) return;
      rows.members.push({ id: m.id, name: String(m.name || ''), role: m.role || 'Khác', active: m.active !== false, legacy_extra: extrasOf(m, MEMBER_KNOWN) });
    });
    (Array.isArray(s.companies) ? s.companies : []).forEach(c => {
      if (!isObj(c) || !c.id) return;
      rows.companies.push({
        id: c.id, name: String(c.name || ''), type: String(c.type || ''),
        roles: isObj(c.roles) ? clone(c.roles) : {},
        contact: String(c.contact || ''), phone: String(c.phone || ''), last_label: String(c.last || ''),
        partner_eval_migrated: !!c.partnerEvalMigrated,
        legacy_extra: extrasOf(c, COMPANY_KNOWN),
      });
      if (c.partnerEval !== undefined && c.partnerEval !== null) {
        rows.company_partner_eval_archive.push({ company_id: c.id, partner_eval: clone(c.partnerEval) });
      }
    });
    (Array.isArray(s.games) ? s.games : []).forEach(g => {
      if (!isObj(g) || !g.id) return;
      rows.games.push({
        id: g.id, title: String(g.title || ''), own: g.own || 'partner',
        company_id: nullIfEmpty(g.company),
        genre: String(g.genre || ''), platform: String(g.platform || ''), stage: String(g.stage || ''),
        emoji: String(g.emoji || ''), description: String(g.desc || ''), bd_note: String(g.bdNote || ''),
        build_url: String(g.buildUrl || ''), trailer_url: String(g.trailerUrl || ''),
        scores_bd: g.scores === undefined ? null : clone(g.scores),
        bd_verdict: g.verdict === undefined ? null : g.verdict,
        mkt_eval: g.mktEval === undefined ? null : clone(g.mktEval),
        legacy_extra: extrasOf(g, GAME_KNOWN),
      });
    });
    (Array.isArray(s.deals) ? s.deals : []).forEach(d => {
      if (!isObj(d) || !d.id) return;
      const due = datePair(d.due);
      rows.deals.push({
        id: d.id, line: d.line, title: String(d.title || ''),
        company_id: nullIfEmpty(d.company), game_id: nullIfEmpty(d.game),
        stage: String(d.stage || ''), owner_id: nullIfEmpty(d.owner),
        due_date: due.date, due_raw: due.raw,
        idle_days: typeof d.idle === 'number' && Number.isFinite(d.idle) ? d.idle : 0,
        amount: numOrNull(d.amount), currency: nullIfEmpty(d.cur),
        custom: isObj(d.custom) ? clone(d.custom) : {},
        legacy_extra: extrasOf(d, DEAL_KNOWN),
      });
      if (isObj(d.term)) {
        const parsed = parseRevShare(d.term.rev_share);
        const advNum = numOrNull(d.term.advance_num);
        const termExtra = extrasOf(d.term, TERM_KNOWN);
        if (d.term.advance_num !== undefined && d.term.advance_num !== '' && d.term.advance_num !== null && advNum === null) {
          termExtra.advance_num_raw = String(d.term.advance_num);
        }
        rows.deal_terms.push({
          deal_id: d.id,
          rev_share_raw: String(d.term.rev_share || ''),
          rev_share_sava: parsed ? parsed.sava : null,
          rev_share_partner: parsed ? parsed.partner : null,
          advance_raw: String(d.term.advance || ''),
          advance_num: advNum, advance_cur: nullIfEmpty(d.term.advance_cur),
          territories: String(d.term.territories || ''), duration: String(d.term.duration || ''),
          exclusivity: String(d.term.exclusivity || ''), marketing: String(d.term.marketing || ''),
          payment: String(d.term.payment || ''),
          legacy_extra: termExtra,
        });
      }
      if (isObj(d.contract)) {
        const signed = datePair(d.contract.signed);
        rows.deal_contracts.push({
          deal_id: d.id, status: String(d.contract.status || ''), contract_no: String(d.contract.no || ''),
          signed_date: signed.date, signed_raw: signed.raw, url: String(d.contract.url || ''),
          legacy_extra: extrasOf(d.contract, CONTRACT_KNOWN),
        });
      }
      if (Array.isArray(d.leads)) d.leads.forEach(lid => { if (lid) rows.deal_leads.push({ deal_id: d.id, lead_id: String(lid) }); });
    });
    (Array.isArray(s.leads) ? s.leads : []).forEach(l => {
      if (!isObj(l) || !l.id) return;
      const when = datePair(l.when);
      rows.leads.push({
        id: l.id, name: String(l.name || ''), company_id: nullIfEmpty(l.company),
        person: String(l.person || ''), line: l.line, source: String(l.source || ''),
        status: l.status || 'new', note: String(l.note || ''),
        when_date: when.date, when_raw: when.raw,
        legacy_extra: extrasOf(l, LEAD_KNOWN),
      });
    });
    (Array.isArray(s.tasks) ? s.tasks : []).forEach(t => {
      if (!isObj(t) || !t.id) return;
      rows.tasks.push({
        id: t.id, title: String(t.title || ''), assignee_id: nullIfEmpty(t.assignee),
        deal_id: nullIfEmpty(t.deal), due_label: String(t.due || ''),
        due_date: isoDatePart(t.dueDate), done: !!t.done, overdue_stored: !!t.overdue,
        legacy_extra: extrasOf(t, TASK_KNOWN),
      });
    });
    (Array.isArray(s.activities) ? s.activities : []).forEach(a => {
      if (!isObj(a) || !a.id) return;
      const when = datePair(a.when);
      rows.activities.push({
        id: a.id, deal_id: a.deal, type: a.type || 'Note', actor_id: nullIfEmpty(a.who),
        occurred_date: when.date, occurred_raw: when.raw,
        text: String(a.text || ''), url: a.url === undefined || a.url === '' ? null : a.url,
        legacy_extra: extrasOf(a, ACTIVITY_KNOWN),
      });
    });
    return rows;
  }

  /* ==================================================================
     KHO CRM — rows -> state
     ================================================================== */
  function crmRowsToState(rows) {
    const r = isObj(rows) ? rows : {};
    const arr = k => Array.isArray(r[k]) ? r[k] : [];
    const archiveByCompany = {};
    arr('company_partner_eval_archive').forEach(x => { if (x && x.company_id) archiveByCompany[x.company_id] = x.partner_eval; });
    const termsByDeal = {}, contractsByDeal = {}, leadsByDeal = {};
    arr('deal_terms').forEach(x => { if (x && x.deal_id) termsByDeal[x.deal_id] = x; });
    arr('deal_contracts').forEach(x => { if (x && x.deal_id) contractsByDeal[x.deal_id] = x; });
    arr('deal_leads').forEach(x => { if (x && x.deal_id) { (leadsByDeal[x.deal_id] = leadsByDeal[x.deal_id] || []).push(x.lead_id); } });

    const state = { members: [], companies: [], games: [], deals: [], leads: [], tasks: [], activities: [] };
    arr('members').forEach(m => {
      const o = { id: m.id, name: m.name, role: m.role, active: !!m.active };
      state.members.push(mergeExtras(o, m));
    });
    arr('companies').forEach(c => {
      const o = {
        id: c.id, name: c.name, type: c.type || '', roles: isObj(c.roles) ? c.roles : {},
        contact: c.contact || '', phone: c.phone || '', last: c.last_label || '',
        partnerEvalMigrated: !!c.partner_eval_migrated,
      };
      if (archiveByCompany[c.id] !== undefined) o.partnerEval = archiveByCompany[c.id];
      state.companies.push(mergeExtras(o, c));
    });
    arr('games').forEach(g => {
      const o = {
        id: g.id, title: g.title, own: g.own, genre: g.genre || '', platform: g.platform || '',
        stage: g.stage || '', emoji: g.emoji || '', desc: g.description || '', bdNote: g.bd_note || '',
        buildUrl: g.build_url || '', trailerUrl: g.trailer_url || '',
      };
      if (g.company_id) o.company = g.company_id;
      if (g.scores_bd !== null && g.scores_bd !== undefined) o.scores = g.scores_bd;
      if (g.bd_verdict !== null && g.bd_verdict !== undefined) o.verdict = g.bd_verdict;
      if (g.mkt_eval !== null && g.mkt_eval !== undefined) o.mktEval = g.mkt_eval;
      state.games.push(mergeExtras(o, g));
    });
    arr('deals').forEach(d => {
      const o = {
        id: d.id, line: d.line, title: d.title, stage: d.stage || '',
        owner: emptyIfNull(d.owner_id), due: pairBack(d.due_date, d.due_raw),
        idle: d.idle_days || 0, custom: isObj(d.custom) ? d.custom : {}, leads: leadsByDeal[d.id] || [],
      };
      if (d.company_id) o.company = d.company_id;
      if (d.game_id) o.game = d.game_id;
      if (d.amount !== null && d.amount !== undefined) o.amount = Number(d.amount);
      if (d.currency !== null && d.currency !== undefined) o.cur = d.currency;
      const t = termsByDeal[d.id];
      if (t) {
        const term = {
          rev_share: t.rev_share_raw || '', advance: t.advance_raw || '',
          territories: t.territories || '', duration: t.duration || '',
          exclusivity: t.exclusivity || '', marketing: t.marketing || '', payment: t.payment || '',
        };
        if (t.advance_num !== null && t.advance_num !== undefined) term.advance_num = String(t.advance_num);
        if (t.advance_cur !== null && t.advance_cur !== undefined) term.advance_cur = t.advance_cur;
        o.term = mergeExtras(term, t);
        if (o.term.advance_num_raw !== undefined && term.advance_num === undefined) { term.advance_num = o.term.advance_num_raw; delete o.term.advance_num_raw; }
      }
      const ct = contractsByDeal[d.id];
      if (ct) {
        o.contract = mergeExtras({ status: ct.status || '', no: ct.contract_no || '', signed: pairBack(ct.signed_date, ct.signed_raw), url: ct.url || '' }, ct);
      }
      state.deals.push(mergeExtras(o, d));
    });
    arr('leads').forEach(l => {
      const o = {
        id: l.id, name: l.name, company: emptyIfNull(l.company_id), person: l.person || '',
        line: l.line, source: l.source || '', status: l.status || 'new', note: l.note || '',
        when: pairBack(l.when_date, l.when_raw),
      };
      state.leads.push(mergeExtras(o, l));
    });
    arr('tasks').forEach(t => {
      const o = {
        id: t.id, title: t.title, assignee: emptyIfNull(t.assignee_id),
        due: t.due_label || '', dueDate: t.due_date || '', done: !!t.done, overdue: !!t.overdue_stored,
      };
      if (t.deal_id) o.deal = t.deal_id;
      state.tasks.push(mergeExtras(o, t));
    });
    arr('activities').forEach(a => {
      const o = {
        id: a.id, deal: a.deal_id, type: a.type, who: emptyIfNull(a.actor_id),
        when: pairBack(a.occurred_date, a.occurred_raw), text: a.text || '',
      };
      if (a.url !== null && a.url !== undefined) o.url = a.url;
      state.activities.push(mergeExtras(o, a));
    });
    return state;
  }

  /* ==================================================================
     KHO PUBLISHING — revision: state -> {pub, priv}
     ================================================================== */
  const REV_KNOWN = ['entries', 'gates', 'hardGate', 'gate', 'gateNote', 'gateSource', 'scoresV2', 'quality',
    'productionPillarEvidence', 'reviewDate', 'strengths', 'risks', 'conditions', 'next', 'comment', 'bdComment',
    'reviewer', 'role', 'status', 'at', 'build', 'frameworkVersion', 'legacy', 'migratedFrom'];
  const GATE_VALUE_MAP = { 'Đạt': 'PASS', 'Không đạt': 'FAIL' };

  function revisionToRows(requestId, rev, revisionNo) {
    const h = isObj(rev) ? rev : {};
    /* entries: gỡ 2 khoá private deal/legalEvidence */
    const entries = isObj(h.entries) ? clone(h.entries) : {};
    const dealEntry = entries.deal !== undefined ? entries.deal : null;
    const legalEntry = entries.legalEvidence !== undefined ? entries.legalEvidence : null;
    delete entries.deal; delete entries.legalEvidence;
    /* gates: công khai chỉ {value}; note/source -> gate_details.
       Biến thể cũ hardGate {status,note} cũng map về cùng hình. */
    let gates = null, gateDetails = null;
    const gateSrc = isObj(h.gates) ? h.gates : (isObj(h.hardGate) ? h.hardGate : null);
    if (gateSrc) {
      gates = {}; gateDetails = {};
      Object.keys(gateSrc).forEach(k => {
        const g = isObj(gateSrc[k]) ? gateSrc[k] : {};
        let value = g.value;
        if (value === undefined && g.status !== undefined) value = GATE_VALUE_MAP[g.status] || 'PENDING';
        gates[k] = { value: value || 'PENDING' };
        gateDetails[k] = { note: String(g.note || ''), source: String(g.source || '') };
      });
    }
    /* productionPillarEvidence: công khai {status, note}; source -> private */
    let ppe = null, ppeSource = null;
    if (isObj(h.productionPillarEvidence)) {
      ppe = clone(h.productionPillarEvidence);
      if (ppe.source !== undefined) { ppeSource = ppe.source === '' ? null : ppe.source; delete ppe.source; }
    }
    const reviewDate = datePair(h.reviewDate);
    const pub = {
      request_id: requestId, revision_no: revisionNo,
      reviewer_id: nullIfEmpty(h.reviewer), author_role: h.role || '',
      status: h.status === undefined ? null : h.status,
      evaluated_at: h.at ? String(h.at) : null,
      build_label: String(h.build || ''),
      entries, gates,
      gate_value: h.gate === undefined || h.gate === '' ? null : h.gate,
      scores_v2: h.scoresV2 === undefined ? null : clone(h.scoresV2),
      quality: numOrNull(h.quality),
      production_pillar_evidence: ppe,
      review_date: (h.reviewDate === undefined ? null : reviewDate.date),
      review_date_raw: h.reviewDate === undefined ? '' : reviewDate.raw,
      strengths: String(h.strengths || ''), risks: String(h.risks || ''),
      conditions: String(h.conditions || ''), next_action: String(h.next || ''),
      comment_public: String(h.comment || ''),
      framework_version: h.frameworkVersion === undefined ? null : h.frameworkVersion,
      is_legacy: !!h.legacy,
      migrated_from: h.migratedFrom === undefined ? null : h.migratedFrom,
      legacy_extra: extrasOf(h, REV_KNOWN),
    };
    const bdComment = h.bdComment === undefined ? null : h.bdComment;
    const gateNote = h.gateNote === undefined ? null : h.gateNote;
    const gateSource = h.gateSource === undefined ? null : h.gateSource;
    const hasPriv = bdComment !== null || gateNote !== null || gateSource !== null ||
      dealEntry !== null || legalEntry !== null || gateDetails !== null || ppeSource !== null;
    const priv = hasPriv ? {
      request_id: requestId, revision_no: revisionNo,
      bd_comment: bdComment, game_gate_note: gateNote, game_gate_source: gateSource,
      deal_entry: dealEntry, legal_entry: legalEntry, gate_details: gateDetails,
      production_pillar_source: ppeSource,
    } : null;
    return { pub, priv };
  }

  function revisionFromRows(pub, priv) {
    const p = pub || {};
    const entries = isObj(p.entries) ? clone(p.entries) : {};
    if (priv) {
      if (priv.deal_entry !== null && priv.deal_entry !== undefined) entries.deal = priv.deal_entry;
      if (priv.legal_entry !== null && priv.legal_entry !== undefined) entries.legalEvidence = priv.legal_entry;
    }
    const h = mergeExtras({}, p);
    h.entries = entries;
    if (p.gates !== null && p.gates !== undefined) {
      const gates = {};
      Object.keys(p.gates).forEach(k => {
        const g = isObj(p.gates[k]) ? p.gates[k] : {};
        const det = priv && isObj(priv.gate_details) && isObj(priv.gate_details[k]) ? priv.gate_details[k] : null;
        gates[k] = { value: g.value || 'PENDING', note: det ? String(det.note || '') : '', source: det ? String(det.source || '') : '' };
      });
      h.gates = gates;
    }
    if (p.gate_value !== null && p.gate_value !== undefined) h.gate = p.gate_value;
    if (priv) {
      if (priv.game_gate_note !== null && priv.game_gate_note !== undefined) h.gateNote = priv.game_gate_note;
      if (priv.game_gate_source !== null && priv.game_gate_source !== undefined) h.gateSource = priv.game_gate_source;
      if (priv.bd_comment !== null && priv.bd_comment !== undefined) h.bdComment = priv.bd_comment;
    }
    if (p.scores_v2 !== null && p.scores_v2 !== undefined) h.scoresV2 = p.scores_v2;
    if (p.quality !== null && p.quality !== undefined) h.quality = Number(p.quality);
    if (p.production_pillar_evidence !== null && p.production_pillar_evidence !== undefined) {
      h.productionPillarEvidence = clone(p.production_pillar_evidence);
      h.productionPillarEvidence.source = priv && priv.production_pillar_source != null ? priv.production_pillar_source : '';
    }
    if ((p.review_date_raw && p.review_date_raw !== '') || p.review_date) h.reviewDate = pairBack(p.review_date, p.review_date_raw);
    h.strengths = p.strengths || ''; h.risks = p.risks || ''; h.conditions = p.conditions || '';
    h.next = p.next_action || ''; h.comment = p.comment_public || '';
    h.reviewer = emptyIfNull(p.reviewer_id); h.role = p.author_role || '';
    if (p.status !== null && p.status !== undefined) h.status = p.status;
    h.at = p.evaluated_at || '';
    h.build = p.build_label || '';
    if (p.framework_version !== null && p.framework_version !== undefined) h.frameworkVersion = p.framework_version;
    if (p.is_legacy) h.legacy = true;
    if (p.migrated_from !== null && p.migrated_from !== undefined) h.migratedFrom = p.migrated_from;
    return h;
  }

  /* ==================================================================
     KHO PUBLISHING — state -> rows / rows -> state
     ================================================================== */
  const REQUEST_KNOWN = ['id', 'kind', 'entityId', 'requestedBy', 'assignee', 'due', 'requestNote', 'source',
    'build', 'intake', 'status', 'requestedAt', 'current', 'revisions', 'revision', 'migratedFrom'];
  const OBS_KNOWN = ['id', 'name', 'category', 'date', 'geo', 'platform', 'downloads', 'revenue', 'url', 'by',
    'confidence', 'evidenceType', 'note', 'history', 'cpi', 'top1', 'top3', 'top5', 'newcomer',
    'historyNote', 'historyPeriod', 'cpiScope', 'provenance', 'at', 'audit'];
  const AUDIT_KNOWN = ['date', 'downloads', 'revenue', 'url', 'note', 'by', 'at', 'evidenceType', 'provenance', 'confidence'];

  /* current lệch revision cuối (hoặc revisions rỗng mà current có dữ liệu)
     -> vật hoá thành revision bổ sung (quy tắc 5.3 MIGRATION.md). Trả về
     {revisions, current, materialized:boolean}. */
  function materializeCurrent(req) {
    const revisions = Array.isArray(req.revisions) ? req.revisions.map(clone) : [];
    const cur = isObj(req.current) ? req.current : null;
    const curHasData = !!cur && Object.keys(cur).length > 0;
    if (!curHasData) return { revisions, current: cur, materialized: false };
    const last = revisions.length ? revisions[revisions.length - 1] : null;
    /* So sâu SAU khi tách private ở cả hai phía: dùng dạng rows công khai+private để so. */
    const sameAsLast = !!last && deepEqual(revisionToRows(req.id || '', cur, 0), revisionToRows(req.id || '', last, 0));
    if (sameAsLast) return { revisions, current: cur, materialized: false };
    const extra = clone(cur);
    if (!extra.migratedFrom) extra.migratedFrom = 'current-snapshot';
    revisions.push(extra);
    return { revisions, current: extra, materialized: true };
  }

  function publishingStateToRows(state, staticRecordIds) {
    const s = isObj(state) ? state : {};
    const staticIds = staticRecordIds instanceof Set ? staticRecordIds : new Set(staticRecordIds || []);
    const rows = {
      publishing_requests: [], publishing_revisions: [], publishing_revision_private: [],
      publishing_request_intake_private: [], market_observations: [], market_observation_audit: [],
      materialized: [],
    };
    (Array.isArray(s.requests) ? s.requests : []).forEach(req => {
      if (!isObj(req) || !req.id) return;
      const mat = materializeCurrent(req);
      if (mat.materialized) rows.materialized.push(req.id);
      const intake = isObj(req.intake) ? clone(req.intake) : {};
      let expectationsRow = null;
      if (Object.prototype.hasOwnProperty.call(intake, 'expectations')) {
        expectationsRow = { request_id: req.id, expectations: intake.expectations === undefined ? null : intake.expectations };
        delete intake.expectations;
      }
      const due = datePair(req.due);
      mat.revisions.forEach((rev, i) => {
        const { pub, priv } = revisionToRows(req.id, rev, i + 1);
        rows.publishing_revisions.push(pub);
        if (priv) rows.publishing_revision_private.push(priv);
      });
      rows.publishing_requests.push({
        id: req.id, kind: req.kind,
        game_id: req.kind === 'game' ? req.entityId : null,
        company_id: req.kind === 'company' ? req.entityId : null,
        requested_by: nullIfEmpty(req.requestedBy), assignee_id: nullIfEmpty(req.assignee),
        due_date: due.date, due_raw: due.raw,
        request_note: String(req.requestNote || ''), source_url: String(req.source || ''),
        build_label: String(req.build || ''), intake,
        status: req.status || 'Chờ đánh giá',
        requested_at: req.requestedAt ? String(req.requestedAt) : null,
        current_revision_no: mat.revisions.length ? mat.revisions.length : null,
        legacy_revision_counter: typeof req.revision === 'number' ? req.revision : mat.revisions.length,
        migrated_from: req.migratedFrom === undefined ? null : req.migratedFrom,
        legacy_extra: extrasOf(req, REQUEST_KNOWN),
      });
      if (expectationsRow) rows.publishing_request_intake_private.push(expectationsRow);
    });
    (Array.isArray(s.marketUpdates) ? s.marketUpdates : []).forEach(u => {
      if (!isObj(u) || !u.id) return;
      rows.market_observations.push({
        id: u.id, record_id: staticIds.has(u.id) ? u.id : null,
        name: String(u.name || ''), category: String(u.category || ''),
        snapshot_date: isoDatePart(u.date), geo: String(u.geo || ''), platform: String(u.platform || ''),
        downloads: numOrNull(u.downloads), revenue: numOrNull(u.revenue),
        source_url: String(u.url || ''), updated_by: nullIfEmpty(u.by),
        confidence: u.confidence === undefined || u.confidence === null || u.confidence === '' ? null : Math.round(Number(u.confidence)) || null,
        evidence_type: u.evidenceType === undefined ? null : u.evidenceType,
        note: String(u.note || ''), history: isObj(u.history) ? clone(u.history) : {}, cpi: isObj(u.cpi) ? clone(u.cpi) : {},
        top1: numOrNull(u.top1), top3: numOrNull(u.top3), top5: numOrNull(u.top5), newcomer: numOrNull(u.newcomer),
        history_note: String(u.historyNote || ''), history_period: String(u.historyPeriod || ''),
        cpi_scope: String(u.cpiScope || ''), provenance: Array.isArray(u.provenance) ? clone(u.provenance) : [],
        updated_at: u.at ? String(u.at) : undefined,
        legacy_extra: extrasOf(u, OBS_KNOWN),
      });
      (Array.isArray(u.audit) ? u.audit : []).forEach((a, i) => {
        if (!isObj(a)) return;
        const ad = datePair(a.date);
        rows.market_observation_audit.push({
          observation_id: u.id, seq: i,
          snapshot_date: ad.date, snapshot_raw: ad.raw,
          downloads: numOrNull(a.downloads), revenue: numOrNull(a.revenue),
          source_url: a.url === undefined ? null : a.url, note: a.note === undefined ? null : a.note,
          by_label: a.by === undefined ? null : a.by,
          occurred_at: a.at ? String(a.at) : null,
          evidence_type: a.evidenceType === undefined ? null : a.evidenceType,
          provenance: a.provenance === undefined ? null : clone(a.provenance),
          confidence: a.confidence === undefined || a.confidence === null ? null : numOrNull(a.confidence),
          legacy_extra: extrasOf(a, AUDIT_KNOWN),
        });
      });
    });
    return rows;
  }

  function publishingRowsToState(rows) {
    const r = isObj(rows) ? rows : {};
    const arr = k => Array.isArray(r[k]) ? r[k] : [];
    const privByKey = {}, intakePrivByReq = {}, revsByReq = {};
    arr('publishing_revision_private').forEach(x => { if (x) privByKey[x.request_id + '#' + x.revision_no] = x; });
    arr('publishing_request_intake_private').forEach(x => { if (x) intakePrivByReq[x.request_id] = x; });
    arr('publishing_revisions').forEach(x => {
      if (!x) return;
      (revsByReq[x.request_id] = revsByReq[x.request_id] || []).push(x);
    });
    Object.values(revsByReq).forEach(list => list.sort((a, b) => a.revision_no - b.revision_no));
    const auditByObs = {};
    arr('market_observation_audit').forEach(x => { if (x) (auditByObs[x.observation_id] = auditByObs[x.observation_id] || []).push(x); });
    Object.values(auditByObs).forEach(list => list.sort((a, b) => a.seq - b.seq));

    const requests = arr('publishing_requests').map(q => {
      const revRows = revsByReq[q.id] || [];
      const revisions = revRows.map(rv => revisionFromRows(rv, privByKey[q.id + '#' + rv.revision_no] || null));
      let current = {};
      if (q.current_revision_no && revisions[q.current_revision_no - 1]) current = clone(revisions[q.current_revision_no - 1]);
      else if (revisions.length) current = clone(revisions[revisions.length - 1]);
      const intake = isObj(q.intake) ? clone(q.intake) : {};
      if (intakePrivByReq[q.id]) intake.expectations = intakePrivByReq[q.id].expectations === null ? '' : intakePrivByReq[q.id].expectations;
      const o = {
        id: q.id, kind: q.kind, entityId: q.entity_id || (q.kind === 'game' ? q.game_id : q.company_id),
        requestedBy: emptyIfNull(q.requested_by), assignee: emptyIfNull(q.assignee_id),
        due: pairBack(q.due_date, q.due_raw), requestNote: q.request_note || '',
        source: q.source_url || '', build: q.build_label || '', intake,
        status: q.status, requestedAt: q.requested_at || '',
        current, revisions, revision: q.legacy_revision_counter || 0,
      };
      if (q.migrated_from !== null && q.migrated_from !== undefined) o.migratedFrom = q.migrated_from;
      return mergeExtras(o, q);
    });
    const marketUpdates = arr('market_observations').map(u => {
      const o = {
        id: u.id, name: u.name, category: u.category || '', date: u.snapshot_date || '',
        geo: u.geo || '', platform: u.platform || '',
        downloads: u.downloads === null || u.downloads === undefined ? null : Number(u.downloads),
        revenue: u.revenue === null || u.revenue === undefined ? null : Number(u.revenue),
        url: u.source_url || '', by: emptyIfNull(u.updated_by),
        confidence: u.confidence === null || u.confidence === undefined ? null : u.confidence,
        note: u.note || '', history: isObj(u.history) ? u.history : {}, cpi: isObj(u.cpi) ? u.cpi : {},
        top1: u.top1 === null || u.top1 === undefined ? null : Number(u.top1),
        top3: u.top3 === null || u.top3 === undefined ? null : Number(u.top3),
        top5: u.top5 === null || u.top5 === undefined ? null : Number(u.top5),
        newcomer: u.newcomer === null || u.newcomer === undefined ? null : Number(u.newcomer),
        historyNote: u.history_note || '', historyPeriod: u.history_period || '', cpiScope: u.cpi_scope || '',
        provenance: Array.isArray(u.provenance) ? u.provenance : [],
        at: u.updated_at || '',
        audit: (auditByObs[u.id] || []).map(a => {
          const ao = {
            date: pairBack(a.snapshot_date, a.snapshot_raw),
            downloads: a.downloads === null || a.downloads === undefined ? null : Number(a.downloads),
            revenue: a.revenue === null || a.revenue === undefined ? null : Number(a.revenue),
            url: a.source_url, note: a.note, by: a.by_label,
            at: a.occurred_at, evidenceType: a.evidence_type,
            provenance: a.provenance, confidence: a.confidence === null || a.confidence === undefined ? null : Number(a.confidence),
          };
          return mergeExtras(ao, a);
        }),
      };
      if (u.evidence_type !== null && u.evidence_type !== undefined) o.evidenceType = u.evidence_type;
      return mergeExtras(o, u);
    });
    return { version: 1, requests, marketUpdates };
  }

  /* Request MỒ CÔI: entityId trỏ tới game/company không còn trong kho CRM.
     Bộ import KHÔNG nạp các request này (chờ Zac chốt — MIGRATION.md 4.1). */
  function findOrphanRequests(pubState, crmState) {
    const gameIds = new Set(((crmState && crmState.games) || []).map(g => g && g.id));
    const companyIds = new Set(((crmState && crmState.companies) || []).map(c => c && c.id));
    return ((pubState && pubState.requests) || []).filter(q => {
      if (!isObj(q)) return false;
      return q.kind === 'game' ? !gameIds.has(q.entityId) : q.kind === 'company' ? !companyIds.has(q.entityId) : true;
    });
  }

  const api = {
    isObj, clone, deepEqual, hashStr, isoDatePart, datePair, pairBack, parseRevShare,
    crmStateToRows, crmRowsToState,
    revisionToRows, revisionFromRows, materializeCurrent,
    publishingStateToRows, publishingRowsToState, findOrphanRequests,
  };
  if (typeof window !== 'undefined') window.SavaAdapter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
