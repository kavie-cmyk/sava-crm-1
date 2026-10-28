"""Sinh/cập nhật publishing-data.js từ tools/sheets-data.json (nguồn duy nhất).

Chạy: python3 tools/build-publishing-data.py
- Base records (23 record: 12 Puzzle + 11 Simulation) được giữ nguyên từ
  publishing-data.js hiện tại (tương thích API cũ); script chỉ BỔ SUNG các
  khối dữ liệu mới trích từ sheets-data.json. Chạy lại nhiều lần cho cùng
  kết quả (idempotent): các khối bổ sung luôn được ghi đè từ nguồn.
- Ô trống trong sheets-data.json = null = "chưa có dữ liệu". Không bịa số.
- Chỉ dùng các tab thị trường F1_* liệt kê bên dưới. Không tạo deal /
  candidate / partner nào từ dữ liệu title-level.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'tools' / 'sheets-data.json'
DST = ROOT / 'publishing-data.js'


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def txt(v):
    return v if isinstance(v, str) and v.strip() else None


def rows_by_header(rows, header_pred, key_idx=0):
    """Trả về dict key -> row cho các hàng dữ liệu sau hàng header khớp pred."""
    out = {}
    started = False
    for r in rows:
        if not started:
            if r and header_pred(r):
                started = True
            continue
        if not r or r[key_idx] is None:
            continue
        out[r[key_idx]] = r
    return out


def main():
    data = json.loads(SRC.read_text(encoding='utf-8'))
    gv = lambda r, i: num(r[i]) if len(r) > i else None
    gt = lambda r, i: txt(r[i]) if len(r) > i else None
    base_text = DST.read_text(encoding='utf-8')
    payload = json.loads(base_text.split('=', 1)[1].rstrip().rstrip(';'))
    records = payload['records']

    # --- F1_02: map tên mechanic -> Mechanic_ID (cho Simulation) ---
    f02 = data['F1_02_MECHANIC_MARKET']
    name_to_mid = {}
    for r in f02[3:]:
        if r and r[0] and r[1]:
            name_to_mid[r[1]] = r[0]

    # --- F1_03 ENTRY COMPETITION (header ở hàng index 2) ---
    entry = {}
    for r in data['F1_03_ENTRY_COMPETITION'][3:]:
        if not r or not r[0]:
            continue
        entry[r[0]] = dict(
            window=txt(r[4]), top1RevConc=num(r[5]), top3RevConc=num(r[6]),
            top5RevConc=num(r[7]), top10RevConc=num(r[8]), top5DlConc=num(r[9]),
            publishersTop20=num(r[10]), medianAgeTop20Months=num(r[11]),
            incumbentsOver24m=num(r[12]), newLaunches12m=num(r[13]),
            entrantsTop200=num(r[14]), entrantsTop100=num(r[15]), entrantsTop50=num(r[16]),
            entrantSuccessRate=num(r[17]), d90Survivors=num(r[18]), d90SurvivalRate=num(r[19]),
            d180Survivors=num(r[20]), d180SurvivalRate=num(r[21]),
            newcomerShare=num(r[22]), medianDaysToPeak=num(r[23]),
            medianEntrantRevenueD30=num(r[24]), medianEntrantRevenueD90=num(r[25]),
            medianEntrantRevenueD180=num(r[26]), medianEntrantDownloadsD30=num(r[27]),
            medianEntrantDownloadsD90=num(r[28]), medianEntrantDownloadsD180=num(r[29]),
            evidenceType=txt(r[32]), confidence=num(r[33]), note=txt(r[34]),
        )

    # --- F1_05 UA BENCHMARK (header index 2; CPI chỉ có ở 4/12 mechanic) ---
    ua = {}
    for r in data['F1_05_UA_BENCHMARK'][3:]:
        if not r or not r[0]:
            continue
        ua[r[0]] = dict(
            geo=txt(r[2]), platform=txt(r[3]), period=txt(r[4]),
            cpiP25=num(r[5]), cpiMedian=num(r[6]), cpiP75=num(r[7]),
            cpmMedian=num(r[8]), ctrMedian=num(r[9]), ipmMedian=num(r[10]),
            storeCvrMedian=num(r[11]), roasD7=num(r[12]), roasD30=num(r[13]),
            paybackDaysMedian=num(r[14]), activeCreativesMedian=num(r[15]),
            creativeLifetimeMedianDays=num(r[16]), observedPaidSpend=num(r[17]),
            evidenceType=txt(r[24]), confidence=num(r[25]),
            paidInstallsObserved=num(r[26]), cpiValidTitles=num(r[27]),
            eligibleTitles=num(r[28]), cpiCoverage=num(r[29]),
            weightedCpi=num(r[30]), note=txt(r[31]),
        )

    # --- F1_20 VERIFIED DAILY (header index 3) ---
    verified = {}
    for r in data['F1_20_ALL_MECHANIC_MARKET_20260815'][4:]:
        if not r or not r[0]:
            continue
        verified[r[0]] = dict(
            uniqueFreeTitles=gv(r, 2), uniqueGrossingTitles=gv(r, 3),
            downloadsDay=gv(r, 4), revenueDay=gv(r, 5),
            dlShare=gv(r, 6), revShare=gv(r, 7),
            top1RevConc=gv(r, 8), top3RevConc=gv(r, 9), top5RevConc=gv(r, 10),
            top10RevConc=gv(r, 11), top5DlConc=gv(r, 12),
            publishersTop20=gv(r, 13), medianAgeTop20Months=gv(r, 14),
            incumbentsOver24m=gv(r, 15), newLaunches12m=gv(r, 16),
            newcomerShare=gv(r, 17),
        )

    # --- F1_25 NEW APPS SUMMARY (header index 4) ---
    newapps = {}
    for r in data['F1_25_NEW_APPS_SUMMARY'][5:]:
        if not r or not r[0]:
            continue
        newapps[r[0]] = dict(
            observedNewGainers12m=num(r[2]), observedOnGP=num(r[3]),
            observedOnIOS=num(r[4]), observedFree=num(r[5]),
            observedGrossing=num(r[6]), bothFreeAndGrossing=num(r[7]),
            priorAuditOrQaCount=num(r[8]),
        )

    # --- F1_39 ELIGIBLE METRICS (header index 0, khóa theo TÊN mechanic) ---
    eligible = {}
    for r in data['F1_39_PUZZLE_ELIGIBLE_METRICS'][1:]:
        if not r or not r[0]:
            continue
        g = lambda i: num(r[i]) if len(r) > i else None
        titles = r[2] if len(r) > 2 and isinstance(r[2], str) else None
        eligible[r[0]] = dict(
            titlesWithCoverage=g(1),
            includedTitles=[t.strip() for t in titles.split(';')] if titles else [],
            downloads30d=g(3), downloads90d=g(4), downloads12m=g(5),
            revenue30d=g(6), revenue90d=g(7), revenue12m=g(8), rpd12m=g(9),
            dlGrowth3=g(10), dlGrowth6=g(11), revGrowth3=g(12), revGrowth6=g(13),
        )

    # --- F1_04 TOP TITLES (header index 2) gắn theo Mechanic_ID ---
    titles = {}
    for r in data['F1_04_TOP_TITLES'][3:]:
        if not r or not r[0] or not r[4]:
            continue
        g = lambda i: num(r[i]) if len(r) > i else None
        t = lambda i: txt(r[i]) if len(r) > i else None
        titles.setdefault(r[4], []).append(dict(
            game=r[0], publisher=t(1), launchDate=t(2), ageMonths=g(3),
            mechanic=t(5), gamefeel=t(6), theme=t(7),
            rankFree=g(10), rankGrossing=g(11),
            downloads30d=g(12), downloads90d=g(13), downloads365d=g(14),
            revenue30d=g(15), revenue90d=g(16), revenue365d=g(17),
            rpd90d=g(18), monetizationModel=t(19), cpi=g(23),
            downloadsDay=g(35), revenueDay=g(36),
            gpDownloadsDay=g(41), iosDownloadsDay=g(42),
            gpRevenueDay=g(45), iosRevenueDay=g(46),
            coreClusterFlag=t(50), classificationStatus=t(47),
        ))
    for v in titles.values():
        v.sort(key=lambda x: (-(x['revenueDay'] or -1), -(x['downloadsDay'] or -1), x['game']))

    # --- F1_16 VERIFIED BY STORE (khối STORE-LEVEL, header index 10) ---
    by_store = {}
    in_block = False
    for r in data['F1_16_VERIFIED_MARKET_20260815']:
        if r and r[0] == 'Mechanic_ID' and len(r) > 2 and r[2] == 'Store':
            in_block = True
            continue
        if in_block:
            if not r or not r[0]:
                break
            by_store.setdefault(r[0], []).append(dict(
                store=r[2], freeTitles=num(r[3]), grossingTitles=num(r[4]),
                downloadsDay=num(r[5]), revenueDay=num(r[6]),
                dlShare=num(r[7]), revShare=num(r[8]),
            ))

    # --- F1_17 COHORT HISTORY summary (header index 4; chỉ MECH-001/002 có hàng) ---
    cohort = {}
    for r in data['F1_17_VERIFIED_COHORT_HISTORY'][5:7]:
        if not r or not r[0]:
            continue
        cohort[r[0]] = dict(
            verifiedCoreTitles=num(r[2]),
            downloads30dObserved=num(r[5]), dl30Coverage=num(r[4]),
            downloads90dObserved=num(r[8]), dl90Coverage=num(r[7]),
            downloads12mObserved=num(r[11]), dl12mCoverage=num(r[10]),
            revenue30dObserved=num(r[14]), rev30Coverage=num(r[13]),
            revenue90dObserved=num(r[17]), rev90Coverage=num(r[16]),
            revenue12mObserved=num(r[20]), rev12mCoverage=num(r[19]),
            rpd12m=num(r[22]), coverageStatus=txt(r[23]),
        )

    # --- F1_34 SIM RANGE SUMMARY (header index 3, khóa theo tên family) ---
    sim_range = {}
    for r in data['F1_34_SIM_MECH_RANGE_SUMMARY'][4:]:
        if not r or not r[0]:
            continue
        sim_range[r[0]] = dict(
            uniqueTitles=num(r[1]), noTopFreeValue=num(r[2]),
            dlRanges={'lt100': num(r[3]), 'd100_999': num(r[4]), 'd1k_4_9k': num(r[5]),
                      'd5k_9_9k': num(r[6]), 'd10kPlus': num(r[7])},
            noTopGrossingValue=num(r[8]),
            revRanges={'lt1k': num(r[9]), 'r1k_9_9k': num(r[10]), 'r10k_49_9k': num(r[11]),
                       'r50k_99_9k': num(r[12]), 'r100kPlus': num(r[13])},
            note=txt(r[14]),
        )

    # --- F1_31 SIM store split (cho verifiedByStore của Simulation) ---
    sim_store = {}
    for r in data['F1_31_SIM_MARKET_top'][4:15]:
        if not r or not r[0]:
            continue
        sim_store[r[0]] = [
            dict(store='iPhone App Store', freeTitles=None, grossingTitles=None,
                 downloadsDay=num(r[5]), revenueDay=num(r[8]), dlShare=None, revShare=None),
            dict(store='Google Play', freeTitles=None, grossingTitles=None,
                 downloadsDay=num(r[6]), revenueDay=num(r[9]), dlShare=None, revShare=None),
        ]

    # --- F1_10 SCORECARD: trọng số + rubric ---
    sc = data['F1_10_SCORECARD_top']
    market_w, proto_w, rubric = [], [], []
    for r in sc[3:11]:
        if r and r[0]:
            market_w.append([r[0], num(r[1])])
        if len(r) > 3 and r[3]:
            proto_w.append([r[3], num(r[4])])
        if len(r) > 10 and isinstance(r[10], (int, float)):
            rubric.append([r[10], txt(r[11]) if len(r) > 11 else None,
                           txt(r[12]) if len(r) > 12 else None])

    for rec in records:
        mid = rec['id'] if rec['id'].startswith('MECH-') else name_to_mid.get(rec['name'])
        rec['entry'] = entry.get(mid) if mid else None
        rec['uaBenchmark'] = ua.get(mid) if mid else None
        rec['verifiedDaily'] = verified.get(mid) if mid else None
        rec['newApps'] = newapps.get(mid) if mid else None
        rec['eligible'] = eligible.get(rec['name'])
        rec['cohortHistory'] = cohort.get(mid) if mid else None
        rec['simRange'] = sim_range.get(rec['name']) if rec['category'] == 'Simulation' else None
        rec['topTitles'] = titles.get(mid, []) if mid else []
        if mid and mid in by_store:
            rec['verifiedByStore'] = by_store[mid]
        elif rec['name'] in sim_store:
            rec['verifiedByStore'] = sim_store[rec['name']]
        else:
            rec['verifiedByStore'] = []

    payload['version'] = '2026-10-28-v2'
    payload['enrichment'] = ('Bổ sung entry/uaBenchmark/verifiedDaily/newApps/eligible/'
                             'cohortHistory/simRange/topTitles/verifiedByStore từ '
                             'tools/sheets-data.json qua tools/build-publishing-data.py. '
                             'Ô trống trong nguồn = null.')
    payload['framework'] = dict(marketWeights=market_w, prototypeWeights=proto_w, rubric=rubric,
                                source='F1_10_SCORECARD_top (SAVA_Mobile_Game_Decision)')
    DST.write_text('/* Market-only import; no company, game candidate, lead or deal records. */\n'
                   'window.PublishingData = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n',
                   encoding='utf-8')
    print(json.dumps({'records': len(records),
                      'withEntry': sum(1 for r in records if r['entry']),
                      'withUa': sum(1 for r in records if r['uaBenchmark'] and r['uaBenchmark']['cpiMedian'] is not None),
                      'withTitles': sum(1 for r in records if r['topTitles']),
                      'withStore': sum(1 for r in records if r['verifiedByStore'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
