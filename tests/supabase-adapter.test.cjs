/* Giai đoạn 2b — adapter Supabase (hàm thuần, không mạng):
   - CRM state -> rows -> state giữ nguyên dữ liệu, partnerEval tách archive.
   - Publishing: field nhạy cảm tách private khi ghi (bảng công khai không
     chứa expectations/bdComment/gateNote/entries.deal/gates note/source/
     productionPillarEvidence.source), ghép lại đủ khi đọc cho BD/Admin.
   - MKT đọc (không có private) vẫn ra state hợp lệ, không sập.
   - Request mồ côi + vật hoá current (MIGRATION.md 4.1/5.3). */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../supabase-adapter.js');

const crmFixture = {
  members: [{ id: 'zac', name: 'Zac', role: 'Admin', active: true }, { id: 'mai', name: 'Mai', role: 'MKT', active: true }],
  companies: [{ id: 'c3', name: 'Pixel Ant', type: 'Game studio', roles: { publishing: 'Game studio' }, contact: 'An', phone: '090', last: 'Hôm nay',
    partnerEval: { hardGate: { legal: { status: 'Đạt', note: 'đã ký NDA' } }, scores: { track: 4 }, dealFit: 3, evidence: { track: { status: 'Đã xác minh', note: '' }, productionSubs: {} } } }],
  games: [{ id: 'g3', title: 'Tiny Farm', own: 'partner', company: 'c3', genre: 'Farm', platform: 'Android', stage: 'Beta', emoji: '🌾', desc: 'd', bdNote: 'note', buildUrl: 'https://x', trailerUrl: '', scores: { Gameplay: 8 }, verdict: 'Đang chấm', mktEval: null }],
  deals: [{ id: 'd4', line: 'publishing', title: 'PF Tiny Farm', company: 'c3', game: 'g3', stage: 'build_eval', owner: 'tuan', due: '2026-10-28', idle: 3,
    custom: { support_needed: 'Marketing' }, leads: ['l1'],
    term: { rev_share: 'Studio 50% / Sava 50%', advance: '500tr', advance_num: '500', advance_cur: 'VND', territories: 'VN', duration: '3 năm', exclusivity: '', marketing: '', payment: '' },
    contract: { status: 'Chưa có HĐ', no: '', signed: '', url: '' } }],
  leads: [{ id: 'l1', name: 'Nguyễn Tuấn Minh', company: 'c3', person: 'Anh Minh — Founder', line: 'publishing', source: 'Web', status: 'new', note: 'n', when: 'Hôm nay' },
          { id: 'l2', name: 'Mồ côi', company: '', person: '', line: 'ai', source: '', status: 'new', note: '', when: '2026-10-01' }],
  tasks: [{ id: 't1', title: 'Việc 1', assignee: 'mai', deal: 'd4', due: 'Hôm nay', dueDate: '2026-10-30', done: false, overdue: true }],
  activities: [{ id: 'a1', deal: 'd4', type: 'Note', who: 'tuan', when: 'Hôm qua', text: 'txt' }],
};

test('CRM: round-trip giữ dữ liệu; partnerEval tách sang archive, companies không chứa', () => {
  const rows = A.crmStateToRows(crmFixture);
  assert.equal(JSON.stringify(rows.companies).includes('partnerEval'), false, 'rows companies không được chứa partnerEval (kể cả legacy_extra)');
  assert.equal(rows.company_partner_eval_archive.length, 1);
  assert.equal(rows.company_partner_eval_archive[0].partner_eval.dealFit, 3);
  assert.equal(rows.deal_terms[0].rev_share_sava, 50);
  assert.equal(rows.deal_terms[0].rev_share_partner, 50);
  assert.equal(rows.deal_terms[0].advance_num, 500);
  assert.deepEqual(rows.deal_leads, [{ deal_id: 'd4', lead_id: 'l1' }]);
  const back = A.crmRowsToState(JSON.parse(JSON.stringify(rows)));
  assert.deepEqual(back.companies[0].partnerEval, crmFixture.companies[0].partnerEval);
  assert.equal(back.deals[0].term.rev_share, 'Studio 50% / Sava 50%');
  assert.equal(back.deals[0].term.advance_num, '500');
  assert.deepEqual(back.deals[0].leads, ['l1']);
  assert.equal(back.leads[0].when, 'Hôm qua' in back.leads[0] ? back.leads[0].when : back.leads[0].when);
  assert.equal(back.leads[0].when, 'Hôm nay');
  assert.equal(back.leads[1].company, '');
  assert.equal(back.leads[1].when, '2026-10-01');
  assert.equal(back.tasks[0].dueDate, '2026-10-30');
  assert.equal(back.tasks[0].overdue, true);
  assert.equal(back.activities[0].when, 'Hôm qua');
  assert.equal(back.games[0].desc, 'd');
  assert.equal(back.games[0].company, 'c3');
});

test('CRM: khoá lạ đi vào legacy_extra và quay lại nguyên vẹn', () => {
  const s = { members: [], companies: [{ id: 'c9', name: 'X', type: '', roles: {}, contact: '', phone: '', last: '', truongLa: { a: 1 } }], games: [], deals: [], leads: [], tasks: [], activities: [] };
  const rows = A.crmStateToRows(s);
  assert.deepEqual(rows.companies[0].legacy_extra, { truongLa: { a: 1 } });
  const back = A.crmRowsToState(rows);
  assert.deepEqual(back.companies[0].truongLa, { a: 1 });
});

const pubFixture = {
  version: 1,
  requests: [
    { id: 'REV-g1', kind: 'game', entityId: 'g3', requestedBy: 'linh', assignee: 'mai', due: '2026-11-01', requestNote: 'rn', source: 'https://build', build: 'v1',
      intake: { mechanicId: 'MECH-001', genre: 'Puzzle', expectations: 'Muốn Sava 40% rev share' },
      status: 'Đang đánh giá', requestedAt: '2026-10-29T00:00:00.000Z', revision: 1,
      current: { entries: { size: { score: 4, status: 'Đã xác minh', note: 'n', source: 's' } }, gate: 'PASS', gateNote: 'gate note bí mật', gateSource: 'gate source', bdComment: 'ghi chú BD riêng', strengths: 'st', risks: '', conditions: '', next: '', comment: 'nhận xét chung', reviewer: 'mai', role: 'mkt', status: 'Đang đánh giá', at: '2026-10-29T01:00:00.000Z', build: 'v1', frameworkVersion: 'market-v2' },
      revisions: [] },
    { id: 'REV-c1', kind: 'company', entityId: 'c3', requestedBy: 'zac', assignee: '', due: '', requestNote: '', source: '', build: '',
      intake: { teamSize: '6' }, status: 'Đang đánh giá', requestedAt: '2026-10-29T00:00:00.000Z', revision: 1, current: null,
      revisions: [{ entries: { track: { score: 4, status: 'Đã xác minh', note: '', source: '' }, deal: { score: 3, status: 'Chưa rõ', note: 'deal note', source: '' }, legalEvidence: { score: 2, status: 'Chưa rõ', note: '', source: '' } },
        gates: { legal: { value: 'PASS', note: 'note cổng bí mật', source: 'src cổng' } },
        productionPillarEvidence: { status: 'Đã xác minh', note: 'prod note', source: 'prod source bí mật' },
        strengths: '', risks: '', conditions: '', next: '', comment: '', reviewer: 'zac', role: 'bd', status: 'Đang đánh giá', at: '2026-10-29T02:00:00.000Z' }] },
  ],
  marketUpdates: [
    { id: 'OBS-1', name: 'Quan sát', category: 'Puzzle', date: '2026-10-28', geo: 'US', platform: 'Android', downloads: 100, revenue: null, url: 'https://src', by: 'linh', confidence: 4, evidenceType: 'Fact', note: 'note', history: {}, cpi: {}, top1: null, top3: null, top5: null, newcomer: null, historyNote: '', historyPeriod: '', cpiScope: '', provenance: ['Workbook'], at: '2026-10-28T00:00:00.000Z',
      audit: [{ date: '2026-10-27', downloads: 90, revenue: 10, url: 'https://old', note: 'old', by: 'Workbook', at: null, evidenceType: 'Fact', provenance: [], confidence: 3 }] },
  ],
};
pubFixture.requests[0].revisions = [structuredClone(pubFixture.requests[0].current)];

test('Publishing: ghi tách private — bảng công khai không chứa field nhạy cảm (quét chuỗi)', () => {
  const rows = A.publishingStateToRows(pubFixture, new Set(['MECH-001']));
  const pubJson = JSON.stringify({ r: rows.publishing_requests, v: rows.publishing_revisions });
  for (const secret of ['Muốn Sava 40%', 'gate note bí mật', 'ghi chú BD riêng', 'note cổng bí mật', 'prod source bí mật', 'deal note']) {
    assert.equal(pubJson.includes(secret), false, 'bảng công khai rò field nhạy cảm: ' + secret);
  }
  assert.equal(rows.publishing_requests[0].intake.expectations, undefined);
  assert.equal(rows.publishing_request_intake_private[0].expectations, 'Muốn Sava 40% rev share');
  const privG = rows.publishing_revision_private.find(p => p.request_id === 'REV-g1');
  assert.equal(privG.bd_comment, 'ghi chú BD riêng');
  assert.equal(privG.game_gate_note, 'gate note bí mật');
  const privC = rows.publishing_revision_private.find(p => p.request_id === 'REV-c1');
  assert.deepEqual(privC.deal_entry, { score: 3, status: 'Chưa rõ', note: 'deal note', source: '' });
  assert.equal(privC.gate_details.legal.note, 'note cổng bí mật');
  assert.equal(privC.production_pillar_source, 'prod source bí mật');
  const pubRevC = rows.publishing_revisions.find(p => p.request_id === 'REV-c1');
  assert.deepEqual(pubRevC.gates, { legal: { value: 'PASS' } });
  assert.equal(pubRevC.production_pillar_evidence.source, undefined);
  assert.equal(rows.publishing_requests[0].current_revision_no, 1);
  assert.equal(rows.market_observations[0].record_id, null);
  assert.equal(rows.market_observation_audit[0].seq, 0);
});

test('Publishing: đọc ghép private -> khôi phục state cho BD/Admin', () => {
  const rows = JSON.parse(JSON.stringify(A.publishingStateToRows(pubFixture, new Set())));
  /* entity_id là cột GENERATED ở DB — mô phỏng khi đọc về */
  rows.publishing_requests.forEach(r => { r.entity_id = r.kind === 'game' ? r.game_id : r.company_id; });
  const back = A.publishingRowsToState(rows);
  const g = back.requests.find(r => r.id === 'REV-g1');
  assert.equal(g.intake.expectations, 'Muốn Sava 40% rev share');
  assert.equal(g.current.gateNote, 'gate note bí mật');
  assert.equal(g.current.bdComment, 'ghi chú BD riêng');
  assert.equal(g.current.entries.size.score, 4);
  const c = back.requests.find(r => r.id === 'REV-c1');
  assert.equal(c.revisions[0].entries.deal.score, 3);
  assert.equal(c.revisions[0].entries.legalEvidence.score, 2);
  assert.equal(c.revisions[0].gates.legal.note, 'note cổng bí mật');
  assert.equal(c.revisions[0].productionPillarEvidence.source, 'prod source bí mật');
  assert.equal(back.marketUpdates[0].audit[0].downloads, 90);
  assert.equal(back.marketUpdates[0].revenue, null);
});

test('Publishing: MKT đọc không có private -> state hợp lệ, không field nhạy cảm, không sập', () => {
  const rows = JSON.parse(JSON.stringify(A.publishingStateToRows(pubFixture, new Set())));
  rows.publishing_requests.forEach(r => { r.entity_id = r.kind === 'game' ? r.game_id : r.company_id; });
  rows.publishing_revision_private = [];
  rows.publishing_request_intake_private = [];
  const back = A.publishingRowsToState(rows);
  const g = back.requests.find(r => r.id === 'REV-g1');
  assert.equal('bdComment' in g.current, false);
  assert.equal('gateNote' in g.current, false);
  assert.equal('expectations' in g.intake, false);
  assert.equal(g.current.gate, 'PASS');
  const c = back.requests.find(r => r.id === 'REV-c1');
  assert.equal(c.revisions[0].gates.legal.value, 'PASS');
  assert.equal(c.revisions[0].gates.legal.note, '');
  assert.equal('deal' in c.revisions[0].entries, false);
});

test('Publishing: request mồ côi + vật hoá current lệch revision cuối', () => {
  const crm = { games: [{ id: 'g3' }], companies: [{ id: 'c3' }] };
  const orphans = A.findOrphanRequests({ requests: [
    { id: 'r1', kind: 'game', entityId: 'g3' }, { id: 'r2', kind: 'game', entityId: 'gx' },
    { id: 'r3', kind: 'company', entityId: 'c9' }, { id: 'r4', kind: 'company', entityId: 'c3' },
  ] }, crm);
  assert.deepEqual(orphans.map(r => r.id), ['r2', 'r3']);
  const mat = A.materializeCurrent({ id: 'r9', revisions: [], current: { entries: { size: { score: 3 } }, status: 'Đang đánh giá' } });
  assert.equal(mat.materialized, true);
  assert.equal(mat.revisions.length, 1);
  assert.equal(mat.revisions[0].migratedFrom, 'current-snapshot');
  const same = A.materializeCurrent({ id: 'r9', revisions: [{ entries: { size: { score: 3 } } }], current: { entries: { size: { score: 3 } } } });
  assert.equal(same.materialized, false);
});
