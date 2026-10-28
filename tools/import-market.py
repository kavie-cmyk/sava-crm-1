"""Read-only, allowlisted XLSX import. Usage: python tools/import-market.py source.xlsx.
Never reads partner/deal/candidate sheets. Requires only Python's standard library.
"""
import sys, zipfile, json, re, hashlib
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
source = Path(sys.argv[1])
z = zipfile.ZipFile(source)
strings = []
if 'xl/sharedStrings.xml' in z.namelist():
    strings = [''.join(v.itertext()) for v in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', NS)]
rels = {r.attrib['Id']: r.attrib['Target'].lstrip('/') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
paths = {}
for sh in ET.fromstring(z.read('xl/workbook.xml')).find('s:sheets', NS):
    p = rels[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
    paths[sh.attrib['name']] = p if p.startswith('xl/') else 'xl/' + p
ALLOWED = {'02_MECHANIC_MARKET', '20_ALL_MECHANIC_MARKET_20260815', '28_UA_MECH_SUMMARY', '31_SIM_MARKET_20260825'}

def rows(name):
    assert name in ALLOWED
    out = []
    for row in ET.fromstring(z.read(paths[name])).findall('.//s:sheetData/s:row', NS):
        cells = {}
        for c in row:
            v = c.find('s:v', NS)
            val = v.text if v is not None else None
            t = c.attrib.get('t')
            if t == 's' and val is not None:
                val = strings[int(val)]
            elif t == 'inlineStr':
                val = ''.join(c.find('s:is', NS).itertext())
            elif val is not None and t != 'str':
                try: val = float(val)
                except ValueError: pass
            cells[re.sub(r'\d', '', c.attrib['r'])] = val
        out.append((int(row.attrib['r']), cells))
    return out

def number(x):
    return x if isinstance(x, (int, float)) else None

ua = {r['A']: (n,r) for n,r in rows('28_UA_MECH_SUMMARY') if isinstance(r.get('A'),str) and r['A'].startswith('MECH-')}
market = {r['A']: (n,r) for n,r in rows('02_MECHANIC_MARKET') if isinstance(r.get('A'),str) and r['A'].startswith('MECH-')}
records = []
for n,r in rows('20_ALL_MECHANIC_MARKET_20260815'):
    if not str(r.get('A','')).startswith('MECH-'): continue
    mid = r['A']; hn,h = market.get(mid,(None,{})); un,u = ua.get(mid,(None,{}))
    records.append(dict(id=mid,name=r['B'],category='Puzzle',geo='US',platform='Google Play + iOS',date='2026-08-15',
        downloads=number(r.get('E')),revenue=number(r.get('F')),top1=number(r.get('I')),top3=number(r.get('J')),top5=number(r.get('K')),newcomer=number(r.get('R')),
        freeTitles=number(r.get('C')),grossingTitles=number(r.get('D')),newLaunches=number(r.get('Q')),
        history={k:number(h.get(c)) for k,c in dict(dl30='F',dl90='G',dl12='H',rev30='I',rev90='J',rev12='K',dlGrowth3='L',dlGrowth6='M',revGrowth3='O',revGrowth6='P',rpd='R').items()},
        historyPeriod='30D: Jul 2026; 90D: May–Jul 2026; 12M: theo cohort nguồn (xem ghi chú)',historyNote=h.get('AD',''),
        cpi={k:number(u.get(c)) for k,c in dict(eligible='C',valid='D',coverage='E',p25='I',median='J',p75='K').items()},
        cpiScope='US · Android / Google Play · May–Jul 2026 · paid installs only',
        evidenceType=h.get('AB',''),confidence=number(h.get('AC')),url=h.get('Z') or 'https://appmagic.rocks/',
        provenance=[f'20_ALL_MECHANIC_MARKET_20260815!A{n}:R{n}',f'02_MECHANIC_MARKET!A{hn}:AI{hn}',f'28_UA_MECH_SUMMARY!A{un}:L{un}'],
        note='Top100 snapshot, không phải toàn thị trường. Lịch sử chỉ cohort trong nguồn; thiếu dữ liệu giữ trống. CPI theo title, không chia theo ad network.'))
for n,r in rows('31_SIM_MARKET_20260825'):
    if n<5 or not r.get('A') or not isinstance(r.get('H'),(float,int)): continue
    if 'total' in r['A'].lower(): continue
    records.append(dict(id='SIM-'+str(n),name=r['A'],category='Simulation',geo='US',platform='Google Play + iPhone App Store',date='2026-08-25',
        downloads=number(r.get('H')),revenue=number(r.get('K')),titles=number(r.get('B')),top1=None,top3=None,top5=None,newcomer=None,
        history={},cpi={},evidenceType='PROVISIONAL · Vendor-tag family + manual overrides',confidence=None,url='https://appmagic.rocks/',
        provenance=[f'31_SIM_MARKET_20260825!A{n}:Q{n}'],
        note='Nhóm Simulation phân loại tạm theo tag, cần gameplay QA. Gainers chỉ là tín hiệu quan sát, không phải growth toàn thị trường. '+str(r.get('Q',''))))
payload = dict(version='2026-10-28-v1',source='SAVA_Mobile_Game_Decision.xlsx',sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    importedAt='2026-10-28',allowedSheets=sorted(ALLOWED),records=records)
target = Path(__file__).resolve().parents[1] / 'publishing-data.js'
target.write_text('/* Market-only import; no company, game candidate, lead or deal records. */\nwindow.PublishingData = '+json.dumps(payload,ensure_ascii=False,separators=(',',':'))+';\n')
print(json.dumps({'records':len(records),'categories':{k:sum(r['category']==k for r in records) for k in ['Puzzle','Simulation']},'output':str(target)}))
