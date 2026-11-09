"""Generate isolated visual QA pages from the actual application HTML.

No Supabase scripts, credentials, real browser storage or network connections.
Synthetic records live only in an in-memory Storage implementation per page.
Production pages never load this fixture or link to this directory.
"""
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / 'tests' / 'visual'
out.mkdir(parents=True, exist_ok=True)
fixture = {
 'members': [{'id':'ui-bd','name':'BD minh họa','role':'BD','active':True},{'id':'ui-mkt','name':'MKT minh họa','role':'MKT','active':True}],
 'companies': [
  {'id':'ui-c1','name':'Atlas Games · minh họa','type':'Publisher','roles':{'game_studio':'Publisher'},'last':'2026-11-01'},
  {'id':'ui-c2','name':'Clover Studio · minh họa','type':'Game studio','roles':{'publishing':'Game studio'},'last':'2026-11-01'},
  {'id':'ui-c3','name':'Aurora Retail · minh họa','type':'Doanh nghiệp','roles':{'ai':'Khách hàng'},'last':'2026-10-31'},
  {'id':'ui-c4','name':'Horizon Group · minh họa','type':'Doanh nghiệp','roles':{'metaverse':'Khách hàng'},'last':'2026-10-31'}],
 'games': [
  {'id':'ui-g1','title':'Color Garden · minh họa','own':'ours','genre':'Puzzle','platform':'iOS, Android','stage':'Prototype','emoji':'◈','desc':'Hồ sơ minh họa để kiểm tra giao diện.'},
  {'id':'ui-g2','title':'Cozy Village · minh họa','own':'partner','company':'ui-c2','genre':'Simulation','platform':'iOS, Android','stage':'Beta','emoji':'◈','desc':'Hồ sơ minh họa để kiểm tra giao diện đánh giá.','buildUrl':'','trailerUrl':''}],
 'deals': [
  {'id':'ui-d1','title':'Color Garden · hợp tác phát hành','company':'ui-c1','game':'ui-g1','line':'game_studio','stage':'pitched','owner':'ui-bd','leads':['ui-l1'],'due':'2026-11-12','idle':2,'term':{'rev_share':'Đang trao đổi'},'custom':{}},
  {'id':'ui-d2','title':'Cozy Village · đánh giá build','company':'ui-c2','game':'ui-g2','line':'publishing','stage':'build_eval','owner':'ui-bd','leads':['ui-l2'],'due':'2026-11-09','idle':5,'term':{'rev_share':'Đang trao đổi'},'custom':{}},
  {'id':'ui-d3','title':'Trợ lý AI chăm sóc khách hàng','company':'ui-c3','line':'ai','stage':'demo','owner':'ui-bd','leads':[],'due':'2026-11-10','idle':1,'amount':850000000,'cur':'VND','custom':{}},
  {'id':'ui-d4','title':'Không gian trải nghiệm sản phẩm 3D','company':'ui-c4','line':'metaverse','stage':'concept','owner':'ui-bd','leads':[],'due':'2026-11-15','idle':1,'amount':1200000000,'cur':'VND','custom':{}}],
 'leads': [
  {'id':'ui-l1','name':'Atlas Games · minh họa','company':'ui-c1','person':'Đầu mối minh họa','line':'game_studio','status':'converted','source':'Sự kiện','note':'Dữ liệu minh họa','when':'2026-11-01'},
  {'id':'ui-l2','name':'Clover Studio · minh họa','company':'ui-c2','person':'Đầu mối minh họa','line':'publishing','status':'converted','source':'Giới thiệu','note':'Dữ liệu minh họa','when':'2026-11-01'},
  {'id':'ui-l3','name':'Yêu cầu demo mới · minh họa','company':'ui-c3','person':'Đầu mối minh họa','line':'ai','status':'new','source':'Website','note':'Dữ liệu minh họa','when':'2026-11-01'}],
 'tasks': [
  {'id':'ui-t1','title':'Chuẩn bị bản giới thiệu game','assignee':'ui-bd','deal':'ui-d1','dueDate':'2026-11-03','due':'2026-11-03','done':False},
  {'id':'ui-t2','title':'Hoàn thiện đánh giá build mới','assignee':'ui-mkt','game':'ui-g2','dueDate':'2026-11-04','due':'2026-11-04','done':False},
  {'id':'ui-t3','title':'Chốt lịch demo với đối tác','assignee':'ui-bd','deal':'ui-d3','dueDate':'2026-11-05','due':'2026-11-05','done':False}],
 'activities': [
  {'id':'ui-a1','deal':'ui-d2','type':'Note','who':'ui-bd','when':'2026-11-01','text':'Đã nhận build để chuyển sang vòng đánh giá. Dữ liệu minh họa.'},
  {'id':'ui-a2','deal':'ui-d1','type':'Email','who':'ui-bd','when':'2026-10-31','text':'Đã gửi thông tin sản phẩm và đề xuất lịch trao đổi. Dữ liệu minh họa.'}],
 'verticals': [], 'leadDealStatusMigrated':True
}
# Keep the isolated visual fixture in the default reporting period.
for group in ('companies', 'leads', 'deals'):
 for i, record in enumerate(fixture[group]):
  record['createdAt']=(datetime.now()-timedelta(days=i+1)).isoformat(timespec='seconds')
for lead in fixture['leads']:
 lead['ownerId']='ui-bd'
for i, activity in enumerate(fixture['activities']):
 activity['when']=(datetime.now()-timedelta(days=i+1)).isoformat(timespec='seconds')
pub={'version':1,'marketUpdates':[],'requests':[
 {'id':'ui-r1','kind':'game','entityId':'ui-g2','requestedBy':'ui-bd','assignee':'ui-mkt','due':'2026-11-04','requestNote':'Yêu cầu minh họa để kiểm tra bố cục và thao tác.','source':'','build':'Preview 1.0','status':'Chờ đánh giá','requestedAt':'2026-11-01T02:00:00.000Z','current':None,'revisions':[],'revision':0},
 {'id':'ui-r2','kind':'company','entityId':'ui-c2','requestedBy':'ui-bd','assignee':'ui-mkt','due':'2026-11-05','requestNote':'Yêu cầu minh họa để kiểm tra form đánh giá Partner.','source':'','build':'','status':'Chờ đánh giá','requestedAt':'2026-11-01T02:00:00.000Z','current':None,'revisions':[],'revision':0}]
}
bootstrap = '''<script>
// Isolated visual fixture: never accesses the real origin's data or backend.
(()=>{const values=new Map(Object.entries(FIXTURE));const memory={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),clear:()=>values.clear(),key:i=>[...values.keys()][i]||null,get length(){return values.size}};Object.defineProperty(window,'localStorage',{value:memory});Object.defineProperty(window,'sessionStorage',{value:memory});})();
</script>'''.replace('FIXTURE',json.dumps({'sava_crm_shared_v1':json.dumps(fixture,ensure_ascii=False),'sava_publishing_v1':json.dumps(pub,ensure_ascii=False)},ensure_ascii=False))
security='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">'
note='<div class="ui-preview-label" role="note">BẢN XEM GIAO DIỆN · DỮ LIỆU MINH HỌA · KHÔNG KẾT NỐI HỆ THỐNG THẬT</div>'
style='<style>.ui-preview-label{position:fixed;z-index:12000;left:0;right:0;top:0;height:27px;display:grid;place-items:center;background:#e8f2f4;color:#4b7c89;font:9px/1.4 system-ui;letter-spacing:.6px;text-align:center;padding:0 6px}.workspace-header,.topbar{top:27px!important}.side{padding-top:48px!important}.main,.layout{padding-top:27px!important}.topbar{margin-top:27px!important}.layout{padding-top:0!important}body>.main{padding-top:27px!important}html.sava-locked #savaAuthRoot{padding-top:70px!important}</style>'
for name in ['index.html','publishing.html','mkt.html']:
 s=(root/name).read_text()
 s=re.sub(r'<script[^>]*src="(?:https://cdn[^\"]+|supabase-[^\"]+)"[^>]*></script>','',s)
 s=re.sub(r'<script>try\{document\.documentElement\.classList\.add\(\'sava-locked\'\);\}catch\(e\)\{\}</script>','',s)
 start=s.index('<div id="savaAuthRoot">');end=s.index('<aside class="side"' if name=='index.html' else '  <a class="skip"',start)
 s=s[:start]+s[end:]
 # Keep app-to-app links local to this fixture; load real presentation/business scripts.
 s=re.sub(r'(src|href)="([^\"]+\.(?:css|js)(?:\?[^\"]*)?)"',r'\1="../../\2"',s)
 s=s.replace('src="assets/', 'src="../../assets/')
 s=s.replace('</head>',security+bootstrap+style+'</head>')
 s=s.replace('CRM nội bộ','Bản xem giao diện')
 s=s.replace('<body class="crm-shell">','<body class="crm-shell">'+note).replace('data-role="bd">','data-role="bd">'+note).replace('data-role="mkt">','data-role="mkt">'+note)
 # Supabase-only explanations belong to the actual app; this is an offline visual fixture.
 s=re.sub(r'<details class="(?:prototype-note|storage-note)">[\s\S]*?</details>','',s,count=1)
 (out/name).write_text(s)
(out/'responsive.html').write_text('''<!doctype html><html lang="vi"><meta charset="utf-8"><title>Workspace · Mobile QA</title><style>body{font:14px system-ui;background:#edf2f6;padding:20px;color:#385465}main{display:flex;gap:24px;flex-wrap:wrap}iframe{width:390px;height:844px;border:1px solid #bdcdd7;border-radius:14px;background:white}h1{font-size:20px}h2{font-size:15px}</style><h1>Workspace · Kiểm thử điện thoại 390 × 844</h1><p>Dữ liệu minh họa · Không kết nối hệ thống thật</p><main><section><h2>CRM BD</h2><iframe title="CRM 390px" src="index.html"></iframe></section><section><h2>Game & Publishing</h2><iframe title="Publishing 390px" src="publishing.html"></iframe></section><section><h2>Marketing</h2><iframe title="MKT 390px" src="mkt.html"></iframe></section></main></html>''')
print('Generated 3 isolated visual QA pages and responsive harness; 0 backend scripts, in-memory fixtures only.')
