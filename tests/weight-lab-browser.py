"""P0 acceptance: editable vector still life, visible-area convergence and immutable comparisons."""
import os,sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5186').rstrip('/');LABEL=os.environ.get('COLORVERSE_TEST_LABEL','local');OUT=ROOT/'outputs/weight-lab';OUT.mkdir(exist_ok=True);checks=[];errors=[];convergence=[]
expect.set_options(timeout=30000)
def ok(s):checks.append(s);print('PASS '+s,flush=True)
def ready(p):p.wait_for_function('window.weightLab?.getSnapshot().ready')
def state(p):return p.evaluate('window.weightLab.getSnapshot()')
def slide(p,n):p.get_by_role('slider',name='窗帘展开',exact=True).fill(str(n));ready(p)
def export(p,name):
 with p.expect_download()as dl:p.get_by_role('button',name='导出图片',exact=True).click()
 path=OUT/(LABEL+'-'+name+'.png');dl.value.save_as(str(path));return Image.open(path).convert('RGB')
with sync_playwright()as pw:
 opts={'headless':True,'channel':'chrome'}
 if URL.startswith('https'):opts['proxy']={'server':'http://127.0.0.1:7892'}
 b=pw.chromium.launch(**opts);c=b.new_context(viewport={'width':1366,'height':768},accept_downloads=True);p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));requests=[];p.on('request',lambda r:requests.append(r.url))
 p.goto(URL+'/color-mystery/lab/color-weight',wait_until='networkidle');ready(p);assert p.locator('svg.weight-art path').count()==13;assert not p.locator('canvas').count();assert not any('three.module' in r for r in requests);p.screenshot(path=str(OUT/(LABEL+'-workbench.png')))
 palette=['#EFE5CF','#29445B','#CE694A','#73866A'];assert state(p)['document']['current']['palette']==palette;original=p.locator('svg.weight-art path').evaluate_all('(els)=>els.map(e=>e.getAttribute("d"))');areas=[]
 for n in [12,28,37,48]:
  slide(p,n);paths=p.locator('svg.weight-art path').evaluate_all('(els)=>els.map(e=>e.getAttribute("d"))');assert all(paths[i]==original[i]for i in range(13)if i!=1);assert state(p)['document']['current']['palette']==palette
  a=p.evaluate('window.weightLab.measure(1200)');bb=p.evaluate('window.weightLab.measure(2400)');assert sum(a)==1200*750 and sum(bb)==2400*1500
  differences=[abs(a[i]/sum(a)*100-bb[i]/sum(bb)*100)for i in range(4)];assert max(differences)<.2,differences;convergence.append({'curtain':n,'areaPercent':[x/sum(a)*100 for x in a],'maxPercentagePointDifference':max(differences)});areas.append(a)
 assert all(areas[i][1]<areas[i+1][1]for i in range(3));assert all(areas[i][0]>areas[i+1][0]for i in range(3));ok('13 editable opaque paths; only curtain changes at bounds; locked palette; blue rises and cream falls')
 labels=p.locator('.weight-areas li').all_text_contents();assert abs(sum(float(s.split('约')[1].replace('%',''))for s in labels)-100)<1.e-6;ok('1200x750 vs 2400x1500 converges within 0.2 percentage points at four settings; visible area denominator and rounding total are correct')
 slide(p,12);p.get_by_role('button',name='保存对照',exact=True).click();ready(p);saved=state(p)['document']['saved'][0];slide(p,48);assert state(p)['document']['saved'][0]==saved;assert state(p)['document']['current']['curtain']==48
 p.screenshot(path=str(OUT/(LABEL+'-comparison-screen.png')));im=export(p,'comparison-export');assert im.size==(2400,750);colors=[tuple(bytes.fromhex(h[1:]))for h in palette];classified=[]
 for start in [0,1200]:
  counts=[0]*4
  for count,rgb in im.crop((start,0,start+1200,750)).getcolors(1200*750):
   nearest=min(range(4),key=lambda i:sum((rgb[j]-colors[i][j])**2 for j in range(3)));counts[nearest]+=count
  classified.append(counts)
 snapshot=state(p);assert classified[0]==snapshot['counts'][1] and classified[1]==snapshot['counts'][0];ok('saved parameter snapshot is immutable; exported A/B PNG matches final visible area counts exactly')
 p.get_by_role('button',name='保存对照',exact=True).click();ready(p);assert len(state(p)['document']['saved'])==2;p.get_by_role('button',name='重置当前画面',exact=True).click();ready(p);assert len(state(p)['document']['saved'])==2 and state(p)['document']['current']['curtain']==28
 p.reload(wait_until='networkidle');ready(p);assert len(state(p)['document']['saved'])==2 and state(p)['document']['current']['curtain']==28;assert not state(p)['compare'];im=export(p,'single');assert im.size==(1200,750);ok('reset retains saved comparisons; refresh restores current scene and two snapshots; single PNG has exact art dimensions')
 for width,height in [(1280,720),(1920,1080),(390,844)]:
  p.set_viewport_size({'width':width,'height':height});assert p.evaluate('document.documentElement.scrollWidth')<=width;p.get_by_role('slider',name='窗帘展开',exact=True).scroll_into_view_if_needed();expect(p.get_by_role('slider',name='窗帘展开',exact=True)).to_be_visible()
 p.set_viewport_size({'width':1366,'height':768});p.get_by_role('button',name='课堂模式 ↗',exact=True).click();ready(p);expect(p.locator('.weight-lab.is-classroom')).to_be_visible();p.screenshot(path=str(OUT/(LABEL+'-classroom.png')));p.get_by_role('button',name='退出课堂模式',exact=True).click();p.go_back();ready(p);p.go_forward();ready(p);assert state(p)['animationLoops']==0;ok('responsive controls, classroom route, history and refresh work; no animation loop')
 p.get_by_role('button',name='← 返回实验室',exact=True).click();assert p.get_by_role('heading',name='深海水母',exact=True).count()==1 and p.get_by_role('heading',name='色彩之树',exact=True).count()==1;assert p.get_by_role('heading',name='色彩的分量',exact=True).count()==1;assert p.evaluate('window.weightLab===undefined');assert not errors,errors;c.close();ok('three experiment entries remain present; leaving cleans up debug hook and timers; no page errors')
 f=b.new_context();f.add_init_script('window.originalCanvasContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(){return null;}');fp=f.new_page();fp.goto(URL+'/color-mystery/lab/color-weight',wait_until='networkidle');expect(fp.get_by_role('alert')).to_contain_text('可见面积计算失败');expect(fp.get_by_role('img',name='当前窗边花瓶',exact=True)).to_be_visible();fp.evaluate('() => { HTMLCanvasElement.prototype.getContext=window.originalCanvasContext; }');fp.get_by_role('button',name='重新计算',exact=True).click();ready(fp);f.close();ok('statistics failure preserves editable SVG and retry recovers')
 offline=b.new_context(accept_downloads=True);offline.route('**/*',lambda r:r.continue_()if r.request.url.startswith(URL)else r.abort());op=offline.new_page();op.goto(URL+'/color-mystery/lab/color-weight?mode=classroom',wait_until='networkidle');ready(op);offline.set_offline(True);slide(op,48);op.get_by_role('button',name='保存对照',exact=True).click();ready(op);export(op,'offline');offline.close();b.close();ok('cold classroom route needs no third-party assets; after disconnect slider, measurement, snapshot and export work')
 (OUT/(LABEL+'-browser.json')).write_text(json.dumps({'status':'passed','origin':URL,'checks':checks,'convergence':convergence,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
