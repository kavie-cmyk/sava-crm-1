/* Local-only browser checks. Synthetic records never enter shipped source data. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const bd=await context.newPage(),errors=[];
 bd.on('pageerror',e=>errors.push(e.message));
 await bd.goto('http://127.0.0.1:8765/publishing.html');
 await bd.evaluate(()=>localStorage.clear());await bd.reload();
 assert.equal(await bd.locator('#screen table:not(.mk-matrix) tbody tr').count(),12);
 await bd.locator('#screen table:not(.mk-matrix)').getByRole('button',{name:'Sort / Flow',exact:true}).click();
 await bd.getByRole('heading',{name:'Sort / Flow',exact:true}).waitFor();
 assert.match(await bd.locator('#editor').innerText(),/5.71/);
 await bd.keyboard.press('Escape');
 await bd.locator('#category').selectOption('Simulation');assert.equal(await bd.locator('#screen table:not(.mk-matrix) tbody tr').count(),11);
 await bd.locator('#category').selectOption('Puzzle');
 await bd.getByRole('button',{name:'+ Thêm quan sát thị trường'}).click();
 const fill=async(page,name,v)=>page.locator(`[name="${name}"]`).fill(String(v));
 /* Người (by/requestedBy/reviewer) nay là <select> chọn member theo id (shared.js S.members) — không fill text được nữa. */
 const sel=async(page,name,v)=>page.locator(`[name="${name}"]`).selectOption(String(v));
 for(const [k,v]of Object.entries({name:'QA Observation',date:'2026-10-28',geo:'US',platform:'Android',downloads:0,url:'https://example.com/qa',by:'linh',confidence:4,note:'Synthetic zero-value browser test'}))k==='by'?await sel(bd,k,v):await fill(bd,k,v);
 await bd.getByRole('button',{name:'Lưu quan sát',exact:true}).click();
 await bd.locator('#screen table:not(.mk-matrix)').getByRole('button',{name:'QA Observation',exact:true}).waitFor();
 await bd.locator('#screen table:not(.mk-matrix)').getByRole('button',{name:'QA Observation',exact:true}).click();
 assert.match(await bd.locator('#editor').innerText(),/Downloads \/ ngày\n0/);
 await bd.getByRole('button',{name:'Bổ sung dữ liệu mới'}).click();
 for(const [k,v]of Object.entries({date:'2026-10-29',downloads:12,url:'https://example.com/qa2',by:'mai',confidence:4,note:'Synthetic revision'}))k==='by'?await sel(bd,k,v):await fill(bd,k,v);
 await bd.getByRole('button',{name:'Lưu quan sát',exact:true}).click();
 const state=await bd.evaluate(()=>JSON.parse(localStorage.getItem('sava_publishing_v1')));
 assert.equal(state.marketUpdates[0].audit[0].downloads,0);
 await bd.getByRole('button',{name:'Theo dõi đánh giá',exact:true}).click();
 assert.match(await bd.locator('#screen').innerText(),/Chưa có yêu cầu đánh giá/);
 // Create both requests from a CRM TEST FIXTURE injected by this script
 // (production no longer seeds CRM data — removed 2026-10-30), not from any workbook record.
 await bd.evaluate(()=>{
  localStorage.setItem('sava_crm_shared_v1', JSON.stringify({
   members:[{id:'zac',name:'Zac',role:'Admin',active:true},{id:'linh',name:'Linh',role:'BD',active:true},{id:'tuan',name:'Tuấn',role:'BD',active:true},{id:'mai',name:'Mai',role:'MKT',active:true}],
   companies:[{id:'c3',name:'Pixel Ant Studio (mẫu)',type:'Game studio',roles:{publishing:'Game studio'},contact:'An — Founder',phone:'',last:'Hôm nay'}],
   games:[{id:'g3',title:'Tiny Farm Story',own:'partner',company:'c3',genre:'Farm / Simulation',platform:'Android',stage:'Beta',emoji:'🌾',desc:'Game của Pixel Ant Studio.',bdNote:'BD (Tuấn) mang về: studio 6 người ở Đà Nẵng.',buildUrl:'https://drive.google.com/',trailerUrl:''}],
   deals:[],leads:[],tasks:[],activities:[]}));
 });
 for(const [kind,id] of [['game','g3'],['company','c3']]){
  await bd.getByRole('button',{name:'+ Gửi yêu cầu đánh giá'}).click();
  await bd.locator('[name=kind]').selectOption(kind);await bd.locator('[name=entityId]').selectOption(id);
  await sel(bd,'requestedBy','linh');await fill(bd,'requestNote','Synthetic request');await bd.getByRole('button',{name:'Gửi MKT',exact:true}).click();
 }
 const mkt=await context.newPage();mkt.on('pageerror',e=>errors.push(e.message));
 await mkt.goto('http://127.0.0.1:8765/mkt.html?tab=reviews');
 assert.equal(await mkt.getByRole('button',{name:'+ Gửi yêu cầu đánh giá'}).count(),0);
 assert.equal(await mkt.locator('.review-card').count(),2);
 const gameCard=mkt.locator('.review-card').filter({has:mkt.getByRole('heading',{name:'Tiny Farm Story',exact:true})});
 await gameCard.getByRole('button',{name:'Mở đánh giá',exact:true}).click();
 assert.equal(await mkt.locator('[name=gate]').count(),0);
 await mkt.locator('details.criterion').evaluateAll(xs=>xs.forEach(x=>x.open=true));
 const keys=await mkt.locator('input[name^=s_]').evaluateAll(xs=>xs.map(x=>x.name.slice(2)));
 for(const k of keys){await fill(mkt,'s_'+k,4);await mkt.locator(`[name=t_${k}]`).selectOption('Đã xác minh');await fill(mkt,'u_'+k,'Synthetic QA source 2026-10-28');await fill(mkt,'n_'+k,'Synthetic test evidence');}
 await sel(mkt,'reviewer','mai');await fill(mkt,'quality',5);await fill(mkt,'comment','Synthetic professional evaluation');await fill(mkt,'build','qa-v1');await mkt.locator('[name=status]').selectOption('Hoàn tất');
 await mkt.getByRole('button',{name:'Lưu đánh giá cho BD',exact:true}).click();
 assert.match(await mkt.locator('#editor').innerText(),/HOLD — Gate pending/);
 assert.match(await mkt.locator('#editor').innerText(),/v1/);
 await mkt.keyboard.press('Escape');
 await bd.reload();const bdGame=bd.locator('.review-card').filter({has:bd.getByRole('heading',{name:'Tiny Farm Story',exact:true})});
 await bdGame.getByRole('button',{name:'Xem kết quả / bổ sung'}).click();
 await bd.locator('details.criterion').evaluateAll(xs=>xs.forEach(x=>x.open=true));
 assert.equal(await bd.locator('input[name^=s_]').count(),0);
 await sel(bd,'reviewer','linh');await bd.locator('[name=gate]').selectOption('PASS');await fill(bd,'gateSource','QA gate source');await fill(bd,'gateNote','QA approved gate evidence');
 await bd.getByRole('button',{name:'Lưu bổ sung BD',exact:true}).click();
 assert.match(await bd.locator('#editor').innerText(),/GREENLIGHT/);
 assert.match(await bd.locator('#editor').innerText(),/v2/);
 await bd.keyboard.press('Escape');
 // New build: keep score history and explicitly queue another MKT pass.
 await bdGame.getByRole('button',{name:'Xem kết quả / bổ sung'}).click();
 await sel(bd,'reviewer','linh');await fill(bd,'build','qa-v2');await bd.getByRole('button',{name:'Gửi MKT đánh giá lại',exact:true}).click();
 await bd.keyboard.press('Escape');
 await mkt.reload();await gameCard.getByRole('button',{name:'Mở đánh giá',exact:true}).click();
 assert.equal(await mkt.locator('[name=status]').inputValue(),'Chờ đánh giá');
 assert.equal(await mkt.locator('[name=build]').inputValue(),'qa-v2');
 assert.match(await mkt.locator('#editor').innerText(),/HOLD — Gate pending/);
 await mkt.keyboard.press('Escape');
 // Company requires all four production subcriteria, even when coverage is high.
 const companyCard=mkt.locator('.review-card').filter({has:mkt.getByRole('heading',{name:'Pixel Ant Studio (mẫu)',exact:true})});
 await companyCard.getByRole('button',{name:'Mở đánh giá',exact:true}).click();
 assert.equal(await mkt.locator('[name=s_deal]').count(),0);
 await mkt.locator('details.criterion').evaluateAll(xs=>xs.forEach(x=>x.open=true));
 const companyKeys=await mkt.locator('input[name^=s_]').evaluateAll(xs=>xs.map(x=>x.name.slice(2)));
 for(const k of companyKeys){await fill(mkt,'s_'+k,4);await mkt.locator(`[name=t_${k}]`).selectOption('Đã xác minh');await fill(mkt,'u_'+k,'Synthetic QA source');await fill(mkt,'n_'+k,'Synthetic evidence');}
 await sel(mkt,'reviewer','mai');await fill(mkt,'comment','Synthetic company capability');await mkt.locator('[name=status]').selectOption('Hoàn tất');
 await mkt.getByRole('button',{name:'Lưu đánh giá cho BD',exact:true}).click();
 assert.match(await mkt.locator('#editor').innerText(),/80/);await mkt.keyboard.press('Escape');
 // Verify cross-tab conflict protection instead of overwriting another user's latest revision.
 await bd.reload();await bdGame.getByRole('button',{name:'Xem kết quả / bổ sung'}).click();
 await bd.evaluate(()=>{const s=JSON.parse(localStorage.getItem('sava_publishing_v1'));s.requests.find(x=>x.kind==='game').revision++;localStorage.setItem('sava_publishing_v1',JSON.stringify(s));});
 await sel(bd,'reviewer','linh');await bd.getByRole('button',{name:'Lưu bổ sung BD',exact:true}).click();
 assert.match(await bd.locator('#formError').innerText(),/tab khác/);await bd.keyboard.press('Escape');
 // Review legacy CRM dossier integration and navigation without external writes.
 await bd.goto('http://127.0.0.1:8765/index.html');
 await bd.evaluate(()=>openGame('g3'));assert.match(await bd.locator('#drawer').innerText(),/Xem kết quả \/ bổ sung BD/);
 await bd.evaluate(()=>openCompany('c3'));assert.match(await bd.locator('#drawer').innerText(),/Năng lực sản xuất · MKT/);
 await bd.goto('http://127.0.0.1:8765/publishing.html');
 await bd.getByRole('button',{name:'Khung quyết định',exact:true}).click();assert.match(await bd.locator('#screen').innerText(),/90 × 100/);
 // Clean screenshots: no synthetic inputs or assessments persist into deliverables.
 await bd.evaluate(()=>localStorage.removeItem('sava_publishing_v1'));await bd.reload();
 await bd.screenshot({path:'/workspace/scratch/be2efdcbf280/publishing-desktop.png',fullPage:true});
 await bd.setViewportSize({width:390,height:844});await bd.reload();
 assert.equal(await bd.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await bd.getByRole('button',{name:'Phân tích thị trường',exact:true}).click();
 await bd.locator('#screen table:not(.mk-matrix)').getByRole('button',{name:'Sort / Flow',exact:true}).click();
 assert.equal(await bd.evaluate(()=>document.querySelector('dialog').getBoundingClientRect().width<=innerWidth),true);
 await bd.keyboard.press('Escape');await bd.screenshot({path:'/workspace/scratch/be2efdcbf280/publishing-mobile.png',fullPage:true});
 await bd.emulateMedia({reducedMotion:'reduce'});await bd.getByRole('button',{name:'Khung quyết định',exact:true}).click();
 assert.deepEqual(errors,[]);console.log('Browser flow passed: market add/revise, BD request, MKT game/company scoring, gates, revisions, conflict protection, CRM dossier, mobile, reduced motion.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
