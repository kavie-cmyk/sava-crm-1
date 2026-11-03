/* Sava Meta CRM — chống trùng công ty (Phần 1: thư viện thuần dùng chung).
   window.SavaDedupe / module.exports — logic THUẦN, không DOM, không đọc/ghi
   kho, không mạng: dùng được ở trình duyệt (form công ty — Phần 2, quét/gộp
   dữ liệu — Phần 3, panel Admin — Phần 4) lẫn Node test, đúng mẫu UMD của
   publishing-score.js và mẫu logic thuần của window.SavaSort / window.SavaPager
   / window.SavaImport trong shared.js.

   Model dữ liệu công ty (khớp field THẬT của app):
   - Tên công ty là field chính: company.name.
   - Website + LinkedIn công ty nằm trong 17 field hồ sơ qua legacy_extra
     (COMPANY_PROFILE_FIELDS trong shared.js: key "website" và "linkedinUrl"),
     khi nạp vào state chúng nằm PHẲNG trên object công ty (company.website /
     company.linkedinUrl — cùng cách company-profile-fields.test.cjs đọc).
   - Candidate truyền vào matchCompanies dùng dạng { name, website, linkedin }
     (chấp nhận cả bí danh websiteUrl / linkedinUrl cho cả hai phía).

   Tầng so khớp (matchCompanies / clusterCompanies):
   - exact  : trùng website đã chuẩn hoá HOẶC trùng LinkedIn đã chuẩn hoá
              HOẶC nameKey bằng nhau tuyệt đối (chỉ khác dấu/viết hoa/dấu câu/
              hậu tố pháp lý).
   - similar: nameSimilarity > 0.70 (SIMILARITY_THRESHOLD) mà không exact.

   Chuẩn hoá tên TÁI DÙNG đúng phép fold sẵn có của codebase (SavaImport.impFold
   trong shared.js, cũng là phép của SavaSort.fold + combobox không dấu):
   NFD -> bỏ dấu Mn (U+0300–U+036F) -> đ->d, Đ->D -> lowercase. Riêng
   normalizeName thay mọi ký tự không phải [a-z0-9] bằng 1 khoảng trắng (bỏ dấu
   câu, giữ ranh giới từ) rồi gộp khoảng trắng — y hệt impFold. */
(function (root) {
  "use strict";

  /* ================= Hằng số công khai ================= */
  /* Ngưỡng cảnh báo "giống nhau": similarity > 0.70 (so sánh NGHIÊM NGẶT >). */
  const SIMILARITY_THRESHOLD = 0.70;
  /* Token ngành quá phổ biến: trọng số thấp trong Dice theo token để tránh
     dương tính giả kiểu "ABC Studio" ~ "XYZ Studio" chỉ vì cùng chữ Studio. */
  const GENERIC_TOKEN_WEIGHT = 0.25;
  const GENERIC_TOKENS = [
    "studio", "studios", "game", "games", "gaming", "entertainment",
    "media", "production", "productions", "interactive", "digital",
    "technology", "technologies", "tech", "software", "global", "group",
    "labs", "lab", "vietnam",
  ];
  /* Hậu tố/tiền tố pháp lý bị bỏ khi dựng nameKey — dạng HIỂN THỊ (để báo cáo
     và UI tham chiếu). Dạng token đã fold tương ứng nằm ở LEGAL_PREFIX_SEQS /
     LEGAL_SUFFIX_SEQS bên dưới. Quyết định phạm vi:
     - "Công ty" / "Tập đoàn": KHÔNG phải hậu tố pháp lý chặt — "Công ty" là
       tiền tố phổ biến của tên VN ("Công ty TNHH ABC"), "Tập đoàn" là tiền tố
       mô tả ("Tập đoàn ABC"). Cả hai chỉ bị bỏ ở ĐẦU tên (và "Công ty" cả khi
       đứng cuối, vd "ABC Company" đã fold) — xem các seq bên dưới.
     - "CP" chỉ bỏ khi là token đứng cuối độc lập ("ABC CP"), không đụng token
       chứa "cp" ở giữa tên. */
  const LEGAL_SUFFIXES = [
    "TNHH", "MTV (TNHH một thành viên)", "Cổ phần", "CP", "JSC", "Co.", "Ltd", "Co Ltd", "Company Limited",
    "Company", "Limited", "Inc", "Pte Ltd", "Pte", "LLC", "Corp", "Corporation",
    "Công ty", "Tập đoàn",
  ];
  /* Dạng token đã fold (sau normalizeName). Sắp xếp dài -> ngắn để seq nhiều
     token ăn trước seq ít token. Việc bỏ lặp lại tới khi ổn định, và KHÔNG bao
     giờ bỏ tới rỗng (tên chỉ gồm hậu tố -> giữ nguyên token gốc). */
  const LEGAL_PREFIX_SEQS = [
    ["cong", "ty"], ["tap", "doan"], ["co", "phan"], ["tnhh"], ["mtv"],
  ];
  const LEGAL_SUFFIX_SEQS = [
    ["company", "limited"], ["pte", "ltd"], ["co", "ltd"], ["co", "phan"],
    ["cong", "ty"], ["tap", "doan"],
    ["tnhh"], ["mtv"], ["limited"], ["company"], ["ltd"], ["llc"], ["inc"], ["jsc"],
    ["corp"], ["corporation"], ["pte"], ["co"], ["cp"],
  ];

  /* ================= Chuẩn hoá cơ bản ================= */
  function asStr(v) { return v === null || v === undefined ? "" : String(v); }

  /* normalizeName(raw) -> bỏ dấu tiếng Việt (cùng phép impFold/sortFold),
     lowercase, bỏ dấu câu (ký tự ngoài [a-z0-9] thành khoảng trắng), gộp
     khoảng trắng, trim. Vd: "Công ty Cổ phần Sava-Meta!" -> "cong ty co phan
     sava meta". */
  function normalizeName(raw) {
    return asStr(raw)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /* normalizeWebsite(raw) -> domain gốc để so:
     - bỏ scheme http(s):// (và mọi scheme:// khác, // đầu dòng, userinfo@),
     - bỏ "www." ở đầu (CHỈ nhãn www đúng nghĩa; subdomain khác www được GIỮ
       nguyên — quyết định: "blog.abc.com" ≠ "abc.com" vì có thể là entity/site
       khác, còn "www.abc.com" vốn là cùng site với "abc.com"),
     - lowercase, trim, bỏ port, bỏ trailing slash + path/query/fragment
       (chỉ giữ host gốc), bỏ dấu chấm cuối ("abc.com." -> "abc.com").
     "abc.com" = "www.abc.com/" = "https://abc.com/about" -> "abc.com".
     Rỗng / không hợp lệ -> "" (hợp lệ = host có ít nhất 1 dấu chấm, mỗi nhãn
     [a-z0-9-] không bắt đầu/kết thúc bằng "-", nhãn cuối toàn chữ, dài >= 2). */
  function normalizeWebsite(raw) {
    let s = asStr(raw).trim().toLowerCase();
    if (!s) return "";
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); /* scheme:// */
    s = s.replace(/^(?:https?|ftp):/, ""); /* scheme không // (vd http:abc.com) — CHỈ scheme thật, tránh nuốt "abc.com:8080" (host:port) */
    if (s.startsWith("//")) s = s.slice(2);
    const slashAt = s.indexOf("/");
    const atAt = s.lastIndexOf("@");
    if (atAt !== -1 && (slashAt === -1 || atAt < slashAt)) s = s.slice(atAt + 1); /* userinfo */
    s = s.split(/[/?#]/)[0]; /* bỏ path/query/fragment */
    s = s.split(":")[0]; /* bỏ port */
    s = s.replace(/^\.+/, "").replace(/\.+$/, "");
    if (s.startsWith("www.")) s = s.slice(4);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return "";
    const labels = s.split(".");
    if (labels.some(l => !l || l.startsWith("-") || l.endsWith("-"))) return "";
    if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) return "";
    return s;
  }

  /* normalizeLinkedIn(raw) -> slug công ty đã chuẩn hoá (lowercase) để so:
     "https://www.linkedin.com/company/Sava-Meta/" -> "sava-meta".
     - Chấp nhận: URL đầy đủ (mọi subdomain *.linkedin.com, vd vn.linkedin.com),
       dạng rút gọn "linkedin.com/company/<slug>", và slug trần "sava-meta".
     - Bỏ scheme / www / trailing slash / query / fragment.
     - Trang CÁ NHÂN (linkedin.com/in/<...>) -> "" (không phải LinkedIn công
       ty); host khác linkedin.com -> ""; rỗng/không hợp lệ -> "". */
  function normalizeLinkedIn(raw) {
    const s = asStr(raw).trim().toLowerCase();
    if (!s) return "";
    let slug = "";
    const companyAt = s.indexOf("/company/");
    if (s.includes("linkedin.com")) {
      if (companyAt === -1) return ""; /* /in/ hoặc trang khác -> không phải công ty */
      slug = s.slice(companyAt + "/company/".length).split(/[/?#]/)[0];
    } else if (s.startsWith("company/")) {
      slug = s.slice("company/".length).split(/[/?#]/)[0];
    } else if (/^[a-z0-9][a-z0-9-_]*$/.test(s)) {
      slug = s; /* slug trần */
    } else {
      return "";
    }
    try { slug = decodeURIComponent(slug); } catch (e) { /* giữ nguyên nếu không decode được */ }
    slug = slug.replace(/-+$/, "").replace(/^-+/, "");
    return /^[a-z0-9][a-z0-9-_]*$/.test(slug) ? slug : "";
  }

  /* ================= nameKey ================= */
  function seqAt(tokens, seq, atStart) {
    if (seq.length > tokens.length) return false;
    const off = atStart ? 0 : tokens.length - seq.length;
    for (let i = 0; i < seq.length; i++) if (tokens[off + i] !== seq[i]) return false;
    return true;
  }
  /* nameTokens(raw) -> mảng token của normalizeName SAU khi bỏ tiền tố/hậu tố
     pháp lý (lặp tới ổn định, không bao giờ bỏ tới rỗng). */
  function nameTokens(raw) {
    const norm = normalizeName(raw);
    if (!norm) return [];
    let tokens = norm.split(" ");
    let changed = true;
    while (changed) {
      changed = false;
      for (const seq of LEGAL_PREFIX_SEQS) {
        if (tokens.length > seq.length && seqAt(tokens, seq, true)) { tokens = tokens.slice(seq.length); changed = true; }
      }
      for (const seq of LEGAL_SUFFIX_SEQS) {
        if (tokens.length > seq.length && seqAt(tokens, seq, false)) { tokens = tokens.slice(0, tokens.length - seq.length); changed = true; }
      }
    }
    return tokens;
  }
  /* nameKey(raw) -> nameTokens nối liền (bỏ mọi khoảng trắng) để so TUYỆT ĐỐI:
     hai tên chỉ khác dấu / viết hoa / dấu câu / hậu tố pháp lý -> key bằng nhau.
     Vd: "Công ty TNHH Sava Meta" = "SAVA META JSC" -> "savameta". */
  function nameKey(raw) { return nameTokens(raw).join(""); }

  /* ================= Độ giống tên ================= */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function levRatio(a, b) {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }
  function bigramDice(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const counts = new Map();
    for (let i = 0; i < a.length - 1; i++) { const g = a.slice(i, i + 2); counts.set(g, (counts.get(g) || 0) + 1); }
    let common = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const g = b.slice(i, i + 2); const n = counts.get(g) || 0;
      if (n > 0) { common++; counts.set(g, n - 1); }
    }
    return (2 * common) / ((a.length - 1) + (b.length - 1));
  }
  const tokenWeight = t => (GENERIC_TOKENS.includes(t) ? GENERIC_TOKEN_WEIGHT : 1);
  /* Dice theo token CÓ trọng số + khớp mờ: hai token "khớp" khi bằng nhau hoặc
     levRatio >= 0.8 (lỗi gõ 1 ký tự vẫn khớp), ghép tham lam theo ratio giảm
     dần; đóng góp của 1 cặp = trọng số trung bình x ratio. Token phổ biến
     (GENERIC_TOKENS) chỉ nặng 0.25 nên trùng mỗi chữ "Studio" không đủ kéo
     điểm qua ngưỡng. */
  function tokenDice(ta, tb) {
    if (!ta.length || !tb.length) return 0;
    const sumA = ta.reduce((s, t) => s + tokenWeight(t), 0);
    const sumB = tb.reduce((s, t) => s + tokenWeight(t), 0);
    const pairs = [];
    ta.forEach((x, i) => tb.forEach((y, j) => {
      const r = x === y ? 1 : levRatio(x, y);
      if (r >= 0.8) pairs.push({ i, j, r });
    }));
    pairs.sort((p, q) => q.r - p.r);
    const usedA = new Set(), usedB = new Set();
    let matched = 0;
    for (const p of pairs) {
      if (usedA.has(p.i) || usedB.has(p.j)) continue;
      usedA.add(p.i); usedB.add(p.j);
      matched += ((tokenWeight(ta[p.i]) + tokenWeight(tb[p.j])) / 2) * p.r;
    }
    return (2 * matched) / (sumA + sumB);
  }
  /* nameSimilarity(a, b) -> 0..1 (làm tròn 3 chữ số thập phân).
     Công thức (cố định, kiểm chứng bằng test hiệu chỉnh):
       score = 0.70 * tokenDice(nameTokens)      — bắt đảo thứ tự từ
             + 0.15 * bigramDice(nameKey)         — bắt lỗi gõ / dính từ
             + 0.15 * levRatio(nameKey)           — bắt sai khác ký tự nhỏ
     Ngoại lệ: nameKey bằng nhau (và khác rỗng) -> đúng 1; một phía rỗng -> 0.
     Hệ quả đã hiệu chỉnh: đảo từ "Sava Meta"/"Meta Sava" ~0.87 (>= 0.85);
     chỉ chung 1 token phổ biến "ABC Studio"/"XYZ Studio" ~0.33 (< 0.70);
     khác hẳn nhau < 0.4. */
  function nameSimilarity(a, b) {
    const ka = nameKey(a), kb = nameKey(b);
    if (!ka || !kb) return 0;
    if (ka === kb) return 1;
    const score = 0.70 * tokenDice(nameTokens(a), nameTokens(b))
      + 0.15 * bigramDice(ka, kb)
      + 0.15 * levRatio(ka, kb);
    return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;
  }

  /* ================= Trích field công ty ================= */
  /* companyFields(record) -> { name, website, linkedin } NGUYÊN VĂN từ một
     bản ghi công ty của CRM (field phẳng website / linkedinUrl) hoặc từ một
     candidate { name, website, linkedin } / { name, websiteUrl, linkedinUrl }. */
  function companyFields(rec) {
    const r = rec && typeof rec === "object" ? rec : {};
    const prof = r.profile && typeof r.profile === "object" ? r.profile : {};
    return {
      name: asStr(r.name || ""),
      website: asStr(r.website !== undefined && r.website !== null && r.website !== "" ? r.website
        : (r.websiteUrl !== undefined && r.websiteUrl !== null && r.websiteUrl !== "" ? r.websiteUrl : (prof.website || ""))),
      linkedin: asStr(r.linkedinUrl !== undefined && r.linkedinUrl !== null && r.linkedinUrl !== ""
        ? r.linkedinUrl
        : (r.linkedin !== undefined && r.linkedin !== null && r.linkedin !== "" ? r.linkedin : (prof.linkedinUrl || prof.linkedin || ""))),
    };
  }

  /* So 2 bộ field đã trích: trả null nếu không có quan hệ nào, ngược lại
     { kinds, exact, score, percent, reasons } — kinds là mảng con của
     ["website", "linkedin", "nameKey", "nameSimilarity"]; exact=true khi có
     ít nhất 1 kind thuộc tầng exact. score = nameSimilarity (1 khi nameKey
     bằng nhau), percent = làm tròn score*100. */
  function compareFields(fa, fb) {
    const wa = normalizeWebsite(fa.website), wb = normalizeWebsite(fb.website);
    const la = normalizeLinkedIn(fa.linkedin), lb = normalizeLinkedIn(fb.linkedin);
    const ka = nameKey(fa.name), kb = nameKey(fb.name);
    const kinds = [], reasons = [];
    if (wa && wb && wa === wb) { kinds.push("website"); reasons.push({ kind: "website", value: wa }); }
    if (la && lb && la === lb) { kinds.push("linkedin"); reasons.push({ kind: "linkedin", value: la }); }
    let score = 0;
    if (ka && kb) {
      if (ka === kb) { kinds.push("nameKey"); score = 1; reasons.push({ kind: "nameKey", value: ka }); }
      else {
        score = nameSimilarity(fa.name, fb.name);
        if (score > SIMILARITY_THRESHOLD) { kinds.push("nameSimilarity"); reasons.push({ kind: "nameSimilarity", score, percent: Math.round(score * 100) }); }
      }
    }
    if (!kinds.length) return null;
    const exact = kinds.some(k => k === "website" || k === "linkedin" || k === "nameKey");
    return { kinds, exact, score, percent: Math.round(score * 100), reasons };
  }

  /* ================= matchCompanies ================= */
  /* matchCompanies(candidate, companies) ->
     { exact:   [{ company, reasons }],
       similar: [{ company, score, percent, reasons }] }
     - candidate: { name, website, linkedin } (+ bí danh websiteUrl/linkedinUrl),
       có thể kèm excludeId: id bản ghi bị loại khỏi kết quả (khi SỬA chính
       công ty đó — tự loại chính nó). companies: mảng bản ghi CRM.
     - exact: trùng website HOẶC LinkedIn HOẶC nameKey (một công ty dính nhiều
       lý do chỉ xuất hiện 1 lần, reasons gồm mọi lý do). Thứ tự theo companies.
     - similar: chỉ các công ty KHÔNG exact, nameSimilarity > 0.70, sắp xếp
       score giảm dần (hoà: theo thứ tự trong companies); percent = % làm tròn.
     - Không mutate candidate / companies. */
  function matchCompanies(candidate, companies) {
    const out = { exact: [], similar: [] };
    if (!candidate || typeof candidate !== "object") return out;
    const cf = companyFields(candidate);
    if (!cf.name && !cf.website && !cf.linkedin) return out;
    const excludeId = candidate.excludeId !== undefined && candidate.excludeId !== null && candidate.excludeId !== ""
      ? String(candidate.excludeId) : null;
    const list = Array.isArray(companies) ? companies : [];
    const similarTmp = [];
    list.forEach((c, idx) => {
      if (!c || typeof c !== "object") return;
      if (excludeId !== null && c.id !== undefined && c.id !== null && String(c.id) === excludeId) return;
      const cmp = compareFields(cf, companyFields(c));
      if (!cmp) return;
      if (cmp.exact) out.exact.push({ company: c, reasons: cmp.reasons });
      else similarTmp.push({ company: c, score: cmp.score, percent: cmp.percent, reasons: cmp.reasons, _idx: idx });
    });
    similarTmp.sort((a, b) => (b.score - a.score) || (a._idx - b._idx));
    out.similar = similarTmp.map(({ company, score, percent, reasons }) => ({ company, score, percent, reasons }));
    return out;
  }

  /* ================= clusterCompanies ================= */
  const EDGE_LEVEL = kinds => (kinds.includes("website") || kinds.includes("linkedin")) ? "A"
    : kinds.includes("nameKey") ? "B" : "C";
  const TIER_RANK = { A: 0, B: 1, C: 2 };
  /* clusterCompanies(companies) -> mảng cụm liên thông (chỉ cụm >= 2 công ty):
     [{ id: "cluster-1", tier: "A"|"B"|"C", companyIds: [string],
        companies: [bản ghi gốc], edges: [{ a, b, level, kinds, reasons, score, percent }] }]
     - Quan hệ giữa 2 công ty: cùng định nghĩa với matchCompanies (exact theo
       website/LinkedIn/nameKey, hoặc nameSimilarity > 0.70). Liên thông theo
       union-find: A~B và B~C thì {A,B,C} là MỘT cụm dù A≁C trực tiếp.
     - level của 1 cạnh: "A" = trùng website/LinkedIn; "B" = mạnh nhất là
       nameKey tuyệt đối; "C" = chỉ similar > 70%.
     - tier của cụm = level MẠNH NHẤT trong các cạnh của cụm (A > B > C).
     - edges: MỌI cặp trong cụm có quan hệ trực tiếp (không chỉ cạnh nối cây).
     - Sắp xếp cụm: tier mạnh trước, rồi nhiều công ty trước, rồi theo vị trí
       xuất hiện đầu tiên trong mảng vào; id đánh số sau khi sắp xếp.
     - Không mutate mảng vào / bản ghi. */
  function clusterCompanies(companies) {
    const list = (Array.isArray(companies) ? companies : []).filter(c => c && typeof c === "object");
    const n = list.length;
    if (n < 2) return [];
    const fields = list.map(companyFields);
    const parent = list.map((_, i) => i);
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edgesByPair = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const cmp = compareFields(fields[i], fields[j]);
        if (!cmp) continue;
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[rj] = ri;
        edgesByPair.push({ i, j, level: EDGE_LEVEL(cmp.kinds), kinds: cmp.kinds, reasons: cmp.reasons, score: cmp.score, percent: cmp.percent });
      }
    }
    const groups = new Map();
    list.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
    const idOf = idx => (list[idx].id !== undefined && list[idx].id !== null && list[idx].id !== "" ? String(list[idx].id) : "#" + idx);
    const clusters = [];
    groups.forEach(idxs => {
      if (idxs.length < 2) return;
      const inGroup = new Set(idxs);
      const edges = edgesByPair.filter(e => inGroup.has(e.i) && inGroup.has(e.j))
        .map(e => ({ a: idOf(e.i), b: idOf(e.j), level: e.level, kinds: e.kinds.slice(), reasons: e.reasons, score: e.score, percent: e.percent }));
      const tier = edges.reduce((best, e) => (TIER_RANK[e.level] < TIER_RANK[best] ? e.level : best), "C");
      clusters.push({ tier, companies: idxs.map(i => list[i]), companyIds: idxs.map(idOf), edges, _first: idxs[0] });
    });
    clusters.sort((a, b) => (TIER_RANK[a.tier] - TIER_RANK[b.tier]) || (b.companies.length - a.companies.length) || (a._first - b._first));
    return clusters.map((c, i) => ({ id: "cluster-" + (i + 1), tier: c.tier, companyIds: c.companyIds, companies: c.companies, edges: c.edges }));
  }

  /* ================= API công khai ================= */
  const api = {
    SIMILARITY_THRESHOLD,
    GENERIC_TOKENS: GENERIC_TOKENS.slice(),
    GENERIC_TOKEN_WEIGHT,
    LEGAL_SUFFIXES: LEGAL_SUFFIXES.slice(),
    normalizeWebsite,
    normalizeLinkedIn,
    normalizeName,
    nameTokens,
    nameKey,
    nameSimilarity,
    companyFields,
    matchCompanies,
    clusterCompanies,
  };
  root.SavaDedupe = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
