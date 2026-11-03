/* Phần 1 chống trùng công ty — thư viện thuần window.SavaDedupe (dedupe.js):
   - normalizeWebsite: domain gốc để so (bỏ scheme/www./path/query/fragment/
     port, lowercase; GIỮ subdomain khác www; rỗng/không hợp lệ -> "").
   - normalizeLinkedIn: slug công ty lowercase từ URL linkedin.com/company/…
     (trang cá nhân /in/ + host lạ -> "").
   - normalizeName / nameKey: fold KHÔNG DẤU cùng phép SavaImport.impFold /
     SavaSort.fold (NFD bỏ Mn, đ->d) + bỏ hậu tố/tiền tố pháp lý VN + quốc tế
     + bỏ khoảng trắng -> key so TUYỆT ĐỐI.
   - nameSimilarity: 0.70*Dice token có trọng số (token ngành phổ biến nặng
     0.25, khớp mờ levRatio>=0.8) + 0.15*bigramDice(nameKey) + 0.15*levRatio
     (nameKey); nameKey bằng nhau -> 1. Bốn ca hiệu chỉnh khoá cứng ở dưới.
   - matchCompanies: exact (website | LinkedIn | nameKey) trước, similar
     (similarity > 0.70, kèm % làm tròn) sau; excludeId tự loại chính nó.
   - clusterCompanies: cụm liên thông union-find >= 2, tier A (website/
     LinkedIn) > B (nameKey) > C (chỉ similar), mỗi cạnh kèm bằng chứng.
   Field công ty THẬT: name + website + linkedinUrl (COMPANY_PROFILE_FIELDS
   qua legacy_extra, nằm phẳng trên object công ty — xem shared.js). */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const D = require('../dedupe.js');

/* ================= Nạp module ================= */

test('dedupe: require (Node) và window.SavaDedupe (trình duyệt) cho cùng một API', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'dedupe.js'), 'utf8');
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(src, ctx, { filename: 'dedupe.js' });
  assert.ok(ctx.window.SavaDedupe, 'chạy trong trình duyệt phải đặt window.SavaDedupe');
  for (const fn of ['normalizeWebsite', 'normalizeLinkedIn', 'normalizeName', 'nameKey', 'nameSimilarity', 'matchCompanies', 'clusterCompanies']) {
    assert.equal(typeof D[fn], 'function', 'thiếu hàm ' + fn);
    assert.equal(typeof ctx.window.SavaDedupe[fn], 'function', 'bản trình duyệt thiếu hàm ' + fn);
  }
  assert.equal(D.SIMILARITY_THRESHOLD, 0.70);
  assert.equal(ctx.window.SavaDedupe.normalizeWebsite('https://www.abc.com/about'), 'abc.com');
});

/* ================= normalizeWebsite ================= */

test('normalizeWebsite: mọi biến thể của cùng một site cho cùng một domain gốc', () => {
  const variants = [
    'abc.com', 'www.abc.com', 'www.abc.com/', 'abc.com/', 'ABC.COM',
    'http://abc.com', 'https://abc.com', 'https://www.abc.com/',
    'https://abc.com/about', 'https://abc.com/about/team?x=1#top',
    'http://www.abc.com/a/b/c', '//abc.com/path', '  https://abc.com  ',
    'abc.com:8080/path', 'https://abc.com:443/x', 'abc.com.',
  ];
  for (const v of variants) assert.equal(D.normalizeWebsite(v), 'abc.com', 'sai với: ' + JSON.stringify(v));
});

test('normalizeWebsite: giữ subdomain khác www; subdomain www khác hẳn root', () => {
  assert.equal(D.normalizeWebsite('https://blog.abc.com/post'), 'blog.abc.com');
  assert.equal(D.normalizeWebsite('https://sub.domain.abc.com'), 'sub.domain.abc.com');
  assert.notEqual(D.normalizeWebsite('blog.abc.com'), D.normalizeWebsite('abc.com'));
});

test('normalizeWebsite: rỗng / không hợp lệ -> ""', () => {
  for (const v of ['', '   ', null, undefined, 'http://', 'https://', 'not a url', 'abc', 'a b.com', 'abc..com', '-abc.com', 'abc.c', 'http://exa mple.com/']) {
    assert.equal(D.normalizeWebsite(v), '', 'phải rỗng với: ' + JSON.stringify(v));
  }
});

/* ================= normalizeLinkedIn ================= */

test('normalizeLinkedIn: URL công ty -> slug lowercase (bỏ scheme/www/trailing/query)', () => {
  assert.equal(D.normalizeLinkedIn('https://www.linkedin.com/company/Sava-Meta/'), 'sava-meta');
  assert.equal(D.normalizeLinkedIn('linkedin.com/company/abc-corp?x=1'), 'abc-corp');
  assert.equal(D.normalizeLinkedIn('https://vn.linkedin.com/company/XYZ_Studio#top'), 'xyz_studio');
  assert.equal(D.normalizeLinkedIn('http://linkedin.com/company/abc/'), 'abc');
  assert.equal(D.normalizeLinkedIn('sava-meta'), 'sava-meta', 'slug trần được chấp nhận');
});

test('normalizeLinkedIn: trang cá nhân / host lạ / rỗng -> ""', () => {
  assert.equal(D.normalizeLinkedIn('https://www.linkedin.com/in/john-doe'), '');
  assert.equal(D.normalizeLinkedIn('https://example.com/company/abc'), '');
  assert.equal(D.normalizeLinkedIn('https://www.linkedin.com/company/'), '');
  assert.equal(D.normalizeLinkedIn(''), '');
  assert.equal(D.normalizeLinkedIn(null), '');
});

/* ================= normalizeName / nameKey ================= */

test('normalizeName: bỏ dấu tiếng Việt + lowercase + bỏ dấu câu + gộp khoảng trắng', () => {
  assert.equal(D.normalizeName('Công ty Cổ phần Sava-Meta!'), 'cong ty co phan sava meta');
  assert.equal(D.normalizeName('  Đà   Nẵng — Êch '), 'da nang ech');
  assert.equal(D.normalizeName('SUN* Asterisk'), 'sun asterisk');
  assert.equal(D.normalizeName(''), '');
  assert.equal(D.normalizeName(null), '');
});

test('nameKey: bỏ hậu tố pháp lý VN (TNHH / Cổ phần / CP / Công ty / Tập đoàn / MTV)', () => {
  assert.equal(D.nameKey('Công ty TNHH Sava Meta'), 'savameta');
  assert.equal(D.nameKey('Công ty Cổ phần FPT'), 'fpt');
  assert.equal(D.nameKey('ABC CP'), 'abc');
  assert.equal(D.nameKey('Công ty TNHH MTV ABC'), 'abc');
  assert.equal(D.nameKey('Tập đoàn Vingroup'), 'vingroup');
  assert.equal(D.nameKey('Sava Meta'), 'savameta');
});

test('nameKey: bỏ hậu tố pháp lý quốc tế (JSC / Co., Ltd / Company Limited / Inc / Pte Ltd / LLC / Corp)', () => {
  assert.equal(D.nameKey('SAVA META JSC'), 'savameta');
  assert.equal(D.nameKey('ABC Co., Ltd.'), 'abc');
  assert.equal(D.nameKey('ABC Co Ltd'), 'abc');
  assert.equal(D.nameKey('ABC Company Limited'), 'abc');
  assert.equal(D.nameKey('ABC Ltd'), 'abc');
  assert.equal(D.nameKey('ABC Limited'), 'abc');
  assert.equal(D.nameKey('XYZ Pte Ltd'), 'xyz');
  assert.equal(D.nameKey('XYZ Inc.'), 'xyz');
  assert.equal(D.nameKey('XYZ LLC'), 'xyz');
  assert.equal(D.nameKey('FPT Corporation'), 'fpt');
  assert.equal(D.nameKey('FPT Corp'), 'fpt');
});

test('nameKey: không bao giờ bỏ tới rỗng; token pháp lý ở giữa tên được giữ', () => {
  assert.equal(D.nameKey('TNHH'), 'tnhh');
  assert.equal(D.nameKey('Ltd'), 'ltd');
  assert.equal(D.nameKey('CP Foods'), 'cpfoods', 'CP đứng đầu theo sau là tên riêng khác không bị coi là hậu tố');
  assert.equal(D.nameKey(''), '');
});

/* ================= nameSimilarity — 4 ca hiệu chỉnh bắt buộc ================= */

test('hiệu chỉnh (i): chỉ khác hậu tố pháp lý/dấu/viết hoa -> nameKey BẰNG NHAU, similarity = 1', () => {
  assert.equal(D.nameKey('Công ty TNHH Sava Meta'), D.nameKey('SAVA META JSC'));
  assert.equal(D.nameSimilarity('Công ty TNHH Sava Meta', 'SAVA META JSC'), 1);
  assert.equal(D.nameSimilarity('Công ty Cổ phần FPT', 'FPT Corporation'), 1);
});

test('hiệu chỉnh (ii): đảo thứ tự từ "Sava Meta" vs "Meta Sava" -> >= 0.85', () => {
  const s = D.nameSimilarity('Sava Meta', 'Meta Sava');
  assert.ok(s >= 0.85, 'đo được ' + s);
  assert.ok(s < 1, 'đảo từ không phải trùng tuyệt đối');
});

test('hiệu chỉnh (iii): chỉ chung 1 token phổ biến "ABC Studio" vs "XYZ Studio" -> < 0.70', () => {
  const s = D.nameSimilarity('ABC Studio', 'XYZ Studio');
  assert.ok(s < 0.70, 'đo được ' + s);
});

test('hiệu chỉnh (iv): tên khác hoàn toàn -> < 0.4', () => {
  const s = D.nameSimilarity('Blue Ocean Travel', 'Dragon Fruit Software');
  assert.ok(s < 0.4, 'đo được ' + s);
  assert.ok(D.nameSimilarity('Vinamilk', 'Viettel') < 0.4);
});

test('nameSimilarity: biên — bằng nhau -> 1, rỗng -> 0, lỗi gõ 1 ký tự vẫn cao, luôn trong [0,1]', () => {
  assert.equal(D.nameSimilarity('ABC', 'ABC'), 1);
  assert.equal(D.nameSimilarity('', 'ABC'), 0);
  assert.equal(D.nameSimilarity('ABC', ''), 0);
  assert.equal(D.nameSimilarity('', ''), 0);
  assert.ok(D.nameSimilarity('Savameta', 'Savametta') > 0.8);
  const s = D.nameSimilarity('Nexon Korea', 'Nexon America');
  assert.ok(s >= 0 && s <= 1 && s < 0.7, 'cùng brand khác thị trường không qua ngưỡng, đo được ' + s);
});

/* ================= matchCompanies ================= */

function companiesFixture() {
  return [
    { id: 'c1', name: 'Sava Meta', website: 'https://www.savameta.com/about', linkedinUrl: 'https://www.linkedin.com/company/sava-meta/' },
    { id: 'c2', name: 'ABC Corp', website: '', linkedinUrl: '' },
    { id: 'c3', name: 'Meta Sava', website: 'https://metasava.example.com', linkedinUrl: '' },
    { id: 'c4', name: 'Blue Ocean Travel', website: 'https://blueocean.vn', linkedinUrl: '' },
  ];
}

test('matchCompanies tầng exact theo website: biến thể URL khác nhau vẫn trùng, tên khác hẳn vẫn exact', () => {
  const r = D.matchCompanies({ name: 'Một Tên Khác Hẳn', website: 'savameta.com' }, companiesFixture());
  assert.equal(r.exact.length, 1);
  assert.equal(r.exact[0].company.id, 'c1');
  assert.ok(r.exact[0].reasons.some(x => x.kind === 'website' && x.value === 'savameta.com'));
  assert.equal(r.similar.length, 0);
});

test('matchCompanies tầng exact theo LinkedIn (candidate dùng key linkedin, công ty dùng linkedinUrl)', () => {
  const r = D.matchCompanies({ name: 'Một Tên Khác Hẳn', linkedin: 'linkedin.com/company/sava-meta' }, companiesFixture());
  assert.equal(r.exact.length, 1);
  assert.equal(r.exact[0].company.id, 'c1');
  assert.ok(r.exact[0].reasons.some(x => x.kind === 'linkedin' && x.value === 'sava-meta'));
});

test('matchCompanies tầng exact theo nameKey: chỉ khác hậu tố pháp lý + dấu -> exact, không nằm ở similar', () => {
  const r = D.matchCompanies({ name: 'Công ty TNHH ABC' }, companiesFixture());
  assert.equal(r.exact.length, 1);
  assert.equal(r.exact[0].company.id, 'c2');
  assert.ok(r.exact[0].reasons.some(x => x.kind === 'nameKey'));
  assert.equal(r.similar.length, 0);
});

test('matchCompanies tầng similar: đảo từ -> similar kèm score + % làm tròn; công ty exact không lặp ở similar', () => {
  const r = D.matchCompanies({ name: 'Sava Meta' }, companiesFixture());
  assert.deepEqual(r.exact.map(x => x.company.id), ['c1'], 'trùng tên tuyệt đối -> exact');
  assert.equal(r.similar.length, 1);
  assert.equal(r.similar[0].company.id, 'c3');
  assert.ok(r.similar[0].score > 0.70 && r.similar[0].score >= 0.85, 'score đo được ' + r.similar[0].score);
  assert.equal(r.similar[0].percent, Math.round(r.similar[0].score * 100));
  assert.ok(r.similar[0].reasons.some(x => x.kind === 'nameSimilarity'));
});

test('matchCompanies: một công ty dính nhiều lý do exact chỉ xuất hiện 1 lần, reasons đủ các lý do', () => {
  const r = D.matchCompanies({ name: 'Sava Meta', website: 'https://savameta.com', linkedinUrl: 'https://www.linkedin.com/company/sava-meta' }, companiesFixture());
  const hits = r.exact.filter(x => x.company.id === 'c1');
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0].reasons.map(x => x.kind).sort(), ['linkedin', 'nameKey', 'website']);
});

test('matchCompanies: excludeId tự loại chính nó khi sửa; không excludeId thì chính nó vẫn exact', () => {
  const withEx = D.matchCompanies({ name: 'Sava Meta', excludeId: 'c1' }, companiesFixture());
  assert.ok(!withEx.exact.some(x => x.company.id === 'c1'));
  assert.ok(withEx.similar.some(x => x.company.id === 'c3'), 'các công ty khác vẫn được so');
  const noEx = D.matchCompanies({ name: 'Sava Meta' }, companiesFixture());
  assert.ok(noEx.exact.some(x => x.company.id === 'c1'));
});

test('matchCompanies: chỉ chung token phổ biến / khác hẳn -> không cảnh báo; đầu vào rỗng an toàn; không mutate', () => {
  const companies = companiesFixture();
  const snapshot = JSON.stringify(companies);
  const r = D.matchCompanies({ name: 'XYZ Studio' }, [{ id: 's1', name: 'ABC Studio' }]);
  assert.deepEqual(r, { exact: [], similar: [] }, '"XYZ Studio" vs "ABC Studio" không được cảnh báo');
  assert.deepEqual(D.matchCompanies({}, companies), { exact: [], similar: [] });
  assert.deepEqual(D.matchCompanies(null, companies), { exact: [], similar: [] });
  assert.deepEqual(D.matchCompanies({ name: 'Sava Meta' }, null), { exact: [], similar: [] });
  D.matchCompanies({ name: 'Sava Meta' }, companies);
  assert.equal(JSON.stringify(companies), snapshot, 'không được mutate companies');
});

/* ================= clusterCompanies ================= */

function clusterFixture() {
  return [
    { id: 'a', name: 'Alpha Studio', website: 'alpha.com' },
    { id: 'b', name: 'Beta Games', website: 'https://www.alpha.com/x' },
    { id: 'c', name: 'Games Beta', website: '' },
    { id: 'd', name: 'Delta Corp', website: '' },
    { id: 'e', name: 'Công ty TNHH Delta', website: 'https://delta-different.vn' },
    { id: 'f', name: 'Omega Media', website: '' },
    { id: 'g', name: 'Media Omega', website: '' },
    { id: 'h', name: 'Unique Travel', website: 'https://unique.example.org' },
  ];
}

test('clusterCompanies: liên thông qua công ty trung gian -> 1 cụm dù đầu-cuối không có cạnh trực tiếp', () => {
  const clusters = D.clusterCompanies(clusterFixture());
  const big = clusters.find(cl => cl.companyIds.includes('a'));
  assert.ok(big, 'phải có cụm chứa a');
  assert.deepEqual(big.companyIds.slice().sort(), ['a', 'b', 'c'], 'a~b (website), b~c (similar) -> cả 3 cùng cụm');
  assert.ok(!big.edges.some(e => (e.a === 'a' && e.b === 'c') || (e.a === 'c' && e.b === 'a')), 'a và c không có cạnh trực tiếp');
});

test('clusterCompanies: phân tầng A (website) > B (nameKey) > C (chỉ similar) + bằng chứng từng cạnh', () => {
  const clusters = D.clusterCompanies(clusterFixture());
  assert.equal(clusters.length, 3, 'đo được ' + clusters.map(c => c.id + ':' + c.companyIds.join('+')).join(' '));
  const [ca, cb, cc] = clusters;
  assert.equal(ca.tier, 'A');
  assert.deepEqual(ca.companyIds.slice().sort(), ['a', 'b', 'c']);
  const ab = ca.edges.find(e => e.a === 'a' && e.b === 'b');
  assert.ok(ab && ab.level === 'A' && ab.kinds.includes('website'), 'cạnh a-b phải là tầng A theo website');
  assert.equal(cb.tier, 'B');
  assert.deepEqual(cb.companyIds.slice().sort(), ['d', 'e']);
  assert.ok(cb.edges.length === 1 && cb.edges[0].level === 'B' && cb.edges[0].kinds.includes('nameKey'));
  assert.equal(cc.tier, 'C');
  assert.deepEqual(cc.companyIds.slice().sort(), ['f', 'g']);
  assert.ok(cc.edges.length === 1 && cc.edges[0].level === 'C' && cc.edges[0].score > 0.70 && cc.edges[0].percent === Math.round(cc.edges[0].score * 100));
  assert.ok(!clusters.some(cl => cl.companyIds.includes('h')), 'công ty đơn lẻ không thành cụm');
  for (const cl of clusters) {
    assert.ok(cl.companies.length === cl.companyIds.length && cl.companies.every(c => cl.companyIds.includes(String(c.id))));
    assert.ok(cl.edges.every(e => cl.companyIds.includes(e.a) && cl.companyIds.includes(e.b)));
  }
});

test('clusterCompanies: cạnh LinkedIn cũng là tầng A; đầu vào nhỏ/rỗng -> []; không mutate', () => {
  const input = [
    { id: 'x', name: 'Một Tên', linkedinUrl: 'https://www.linkedin.com/company/abc-co/' },
    { id: 'y', name: 'Tên Khác Hẳn', linkedinUrl: 'linkedin.com/company/abc-co' },
  ];
  const snapshot = JSON.stringify(input);
  const clusters = D.clusterCompanies(input);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].tier, 'A');
  assert.ok(clusters[0].edges[0].kinds.includes('linkedin'));
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(D.clusterCompanies([]), []);
  assert.deepEqual(D.clusterCompanies([{ id: 'solo', name: 'Solo' }]), []);
  assert.deepEqual(D.clusterCompanies(null), []);
});
