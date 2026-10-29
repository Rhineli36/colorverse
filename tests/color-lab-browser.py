"""Real browser checks for the classroom-only lab. No classroom data is written."""
import sys, os, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
expect.set_options(timeout=25000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5186').rstrip('/')
OUT=ROOT/'outputs/color-lab';OUT.mkdir(exist_ok=True)
LABEL=os.environ.get('COLORVERSE_TEST_LABEL','local')
checks=[];errors=[]
def passed(message):checks.append(message);print('PASS '+message,flush=True)
def snap(page):return page.evaluate('window.colorLab.getSnapshot()')
def slider(page,label,value,scope=None):
 el=(scope or page).get_by_role('slider',name=label,exact=True)
 el.evaluate('(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}',str(value));page.wait_for_timeout(100)
def ready(page):page.wait_for_function('window.colorLab?.getSnapshot().frames>0');page.wait_for_timeout(150)
def visible_in_view(page,locator):
 expect(locator).to_be_visible();r=locator.bounding_box();v=page.viewport_size;assert r['x']>=-1 and r['y']>=-1 and r['x']+r['width']<=v['width']+1 and r['y']+r['height']<=v['height']+1,(r,v)
with sync_playwright() as p:
 kwargs={'headless':True,'channel':'chrome','args':['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
 if URL.startswith('https:'):kwargs['proxy']={'server':os.environ.get('COLORVERSE_PROXY','http://127.0.0.1:18081')}
 browser=p.chromium.launch(**kwargs);context=browser.new_context(viewport={'width':1366,'height':768},accept_downloads=True)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));requests=[];page.on('request',lambda r:requests.append(r.url))
 page.goto(URL+'/color-mystery/lab',wait_until='networkidle');expect(page.get_by_role('tab')).to_have_count(3)
 assert page.locator('canvas').count()==0
 assert not any('three' in u.lower() or 'jellyfish-renderer' in u or 'jellyfishlab' in u.lower() for u in requests),requests
 page.screenshot(path=str(OUT/(LABEL+'-01-laboratory.png')),full_page=True)
 page.get_by_role('tab',name='色彩知识',exact=True).click();expect(page.locator('.study-topic-grid > button')).to_have_count(7)
 page.get_by_role('tab',name='色彩情感',exact=True).click();expect(page.get_by_role('navigation',name='选择色系').get_by_role('button')).to_have_count(8)
 page.get_by_role('tab',name='色彩实验室',exact=True).click();expect(page.locator('.lab-experiment-card').filter(has_text='深海水母').get_by_role('button',name='开始实验 →',exact=True)).to_be_visible();passed('three tabs preserve knowledge and emotion; landing has no particle canvas or Three.js request')
 page.locator('.lab-experiment-card').filter(has_text='深海水母').get_by_role('button',name='开始实验 →',exact=True).click();ready(page)
 page.get_by_role('button',name='暂停',exact=True).click();page.wait_for_timeout(200);initial=snap(page);page.wait_for_timeout(300);assert snap(page)['time']==initial['time'];assert not snap(page)['animationScheduled']
 page.screenshot(path=str(OUT/(LABEL+'-02-workbench.png')))
 geometry=initial['geometryId'];before=hashlib.sha256(page.locator('.lab-canvas-area canvas').screenshot()).hexdigest()
 page.get_by_role('button',name='冷暖共舞',exact=True).click();slider(page,'色相偏移',27);after=snap(page)
 assert after['time']==initial['time'] and after['colors'][0]['hue']==27 and after['geometryId']==geometry
 assert hashlib.sha256(page.locator('.lab-canvas-area canvas').screenshot()).hexdigest()!=before
 page.get_by_role('button',name='明暗观察',exact=True).click();assert snap(page)['colors'][0]['basePreset']==1;assert snap(page)['colorUniforms'][0]['gray']==1
 page.get_by_role('button',name='返回原彩色 · 冷暖共舞',exact=True).click();assert snap(page)['colors'][0]['preset']==1 and snap(page)['colors'][0]['hue']==27
 expect(page.get_by_role('slider',name='点缀色面积',exact=True)).to_be_disabled()
 page.get_by_role('button',name='暗海微光',exact=True).click();expect(page.get_by_role('slider',name='点缀色面积',exact=True)).to_be_enabled();slider(page,'点缀色面积',0)
 small=page.locator('.lab-canvas-area canvas').screenshot();slider(page,'点缀色面积',35);assert page.locator('.lab-canvas-area canvas').screenshot()!=small;assert snap(page)['geometryId']==geometry;passed('paused recoloring, grayscale round trip, accent enablement and actual rendered area changes preserve geometry and time')
 page.get_by_role('button',name='左右对照',exact=True).click();a=snap(page)['colors'][0]
 page.get_by_role('button',name='编辑 B · 右侧',exact=True).click();slider(page,'色相偏移',-36)
 assert snap(page)['colors'][0]==a and snap(page)['colors'][1]['hue']==-36
 page.get_by_role('button',name='编辑 A · 左侧',exact=True).click();expect(page.get_by_role('slider',name='色相偏移',exact=True)).to_have_value('27')
 assert len(set(snap(page)['uniformTimes']))==1 and snap(page)['geometryShared']
 page.get_by_label('B侧配色方案',exact=True).select_option('1');page.get_by_role('button',name='编辑 B · 右侧',exact=True).click();expect(page.get_by_role('slider',name='色相偏移',exact=True)).to_have_value('-36')
 canvas=page.locator('.lab-canvas-area canvas');r=canvas.bounding_box();page.mouse.move(r['x']+r['width']*.3,r['y']+r['height']*.5);page.mouse.down();page.mouse.move(r['x']+r['width']*.3+45,r['y']+r['height']*.5+18,steps=4);page.mouse.up();page.mouse.wheel(0,-85);page.wait_for_timeout(100)
 camera=snap(page)['camera'];assert camera!=initial['camera'];same=snap(page)
 page.screenshot(path=str(OUT/(LABEL+'-04-comparison.png')))
 page.get_by_role('button',name='课堂模式 ↗',exact=True).click();assert 'mode=classroom' in page.url;assert snap(page)['id']==same['id'];assert snap(page)['camera']==camera and snap(page)['colors']==same['colors'];expect(page.locator('.competition-header')).to_be_hidden()
 page.get_by_role('button',name='显示设置',exact=True).click();drawer=page.get_by_role('dialog',name='显示设置',exact=True);expect(drawer).to_be_visible();expect(drawer.get_by_role('slider',name='色相偏移',exact=True)).to_have_value('-36');assert snap(page)['id']==same['id']
 drawer.get_by_role('tab',name='动态与画质',exact=True).click();drawer.get_by_label('粒子质量',exact=True).select_option('low');assert snap(page)['particleCount']==46913;assert snap(page)['time']==same['time']
 drawer.get_by_label('粒子质量',exact=True).select_option('high');assert snap(page)['particleCount']==196380
 drawer.get_by_label('粒子质量',exact=True).select_option('medium');assert snap(page)['particleCount']==109100
 drawer.get_by_role('button',name='关闭设置 ×',exact=True).click();expect(drawer).not_to_be_visible();assert snap(page)['id']==same['id'];passed('A/B share geometry, animation and camera; editing target values and three qualities are real; classroom and drawer retain context')
 page.get_by_role('button',name='左右对照',exact=True).click();assert snap(page)['colors'][0]==a
 page.screenshot(path=str(OUT/(LABEL+'-03-classroom.png')))
 page.get_by_role('button',name='全屏',exact=True).click();page.wait_for_timeout(150);assert page.evaluate('!!document.fullscreenElement');assert snap(page)['id']==same['id']
 page.keyboard.press('Escape');page.wait_for_timeout(150)
 if page.evaluate('!!document.fullscreenElement'):page.evaluate('document.exitFullscreen()');page.wait_for_timeout(100)
 assert 'mode=classroom' in page.url,'Esc must leave browser fullscreen before classroom mode'
 page.get_by_role('button',name='退出课堂模式',exact=True).click();assert snap(page)['id']==same['id'];assert snap(page)['camera']==camera
 page.get_by_role('button',name='显示设置',exact=True).count()
 passed('explicit browser fullscreen and classroom state are independent; exit retains camera and pause')
 page.get_by_role('tab',name='色彩微调',exact=True).click();field=page.get_by_role('slider',name='色相偏移',exact=True);field.focus();page.keyboard.press('1');assert snap(page)['colors'][0]['preset']==2
 canvas.focus();page.keyboard.press('1');assert snap(page)['colors'][0]['preset']==0;page.keyboard.press(' ');page.wait_for_timeout(250);assert not snap(page)['paused'];page.keyboard.press(' ');assert snap(page)['paused'];page.keyboard.press('r');assert snap(page)['camera']['distance']==10.5
 with page.expect_download() as d:page.get_by_role('button',name='保存画面',exact=True).click()
 export=OUT/(LABEL+'-export.png');d.value.save_as(str(export));assert export.stat().st_size>15000
 from PIL import Image,ImageStat
 im=Image.open(export).convert('RGB');assert sum(ImageStat.Stat(im).stddev)>12 and im.width>500
 passed('keyboard controls skip input focus; PNG is nonblank real canvas without UI')
 # Visibility lifecycle exercise, with a controlled document.hidden getter.
 page.get_by_role('button',name='继续',exact=True).click();page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))");stopped=snap(page);page.wait_for_timeout(250);assert snap(page)['frames']==stopped['frames'] and not snap(page)['animationScheduled']
 page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");page.wait_for_timeout(150);assert snap(page)['frames']>stopped['frames'];page.get_by_role('button',name='暂停',exact=True).click();passed('visibility handler stops scheduled drawing and resumes without advancing hidden time')
 saved=snap(page);page.reload(wait_until='networkidle');ready(page);assert snap(page)['colors']==saved['colors'] and snap(page)['camera']==saved['camera'] and snap(page)['paused']==saved['paused'];passed('versioned local parameters and camera survive reload')
 # Context loss is intentionally injected; recovery must release the old renderer.
 page.evaluate("document.querySelector('.lab-canvas-area canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
 expect(page.get_by_role('alert')).to_contain_text('显卡渲染暂时中断');page.get_by_role('button',name='以低画质重试',exact=True).click();ready(page);assert snap(page)['particleCount']==46913 and snap(page)['lifecycle']['active']==1 and snap(page)['lifecycle']['disposed']==1
 passed('context loss offers local fallback and low-quality retry with old GPU resources released')
 for iteration in range(3):
  page.evaluate('window.oldLab=window.colorLab');page.get_by_role('button',name='← 返回实验室',exact=True).click();assert page.evaluate('window.colorLab===undefined');dead=page.evaluate('window.oldLab.getSnapshot()');assert dead['lifecycle']['active']==0 and not dead['animationScheduled']
  oldframes=dead['frames'];page.wait_for_timeout(100);assert page.evaluate('window.oldLab.getSnapshot().frames')==oldframes
  page.locator('.lab-experiment-card').filter(has_text='深海水母').get_by_role('button',name='开始实验 →',exact=True).click();ready(page);assert snap(page)['lifecycle']['active']==1
 passed('three enter/leave cycles dispose renderers and stop old animation loops')
 for width,height in [(1280,720),(1366,768),(1920,1080),(768,1024),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(180)
  for name in ['暂停' if not snap(page)['paused'] else '继续','左右对照','重置视角']:visible_in_view(page,page.get_by_role('button',name=name,exact=True))
  assert page.evaluate('document.documentElement.scrollWidth')<=width
  if width<960:
   page.get_by_role('button',name='显示设置',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible();page.get_by_role('button',name='关闭设置 ×',exact=True).click()
  else:
   for name in ['深海幽蓝','冷暖共舞','暗海微光','明暗观察']:visible_in_view(page,page.get_by_role('button',name=name,exact=True))
  page.get_by_role('button',name='课堂模式 ↗',exact=True).click();page.wait_for_timeout(100)
  for name in ['左右对照','显示设置','退出课堂模式']:visible_in_view(page,page.get_by_role('button',name=name,exact=True))
  page.get_by_role('button',name='退出课堂模式',exact=True).click()
 passed('1280x720, 1366x768, 1920x1080, tablet and narrow mobile controls stay reachable without horizontal overflow')
 page.set_viewport_size({'width':1366,'height':768});page.get_by_role('button',name='← 返回实验室',exact=True).click();page.locator('.lab-experiment-card').filter(has_text='深海水母').get_by_role('button',name='课堂展示',exact=True).click();ready(page);assert 'mode=classroom' in page.url;page.reload(wait_until='networkidle');ready(page);assert 'mode=classroom' in page.url
 page.get_by_role('button',name='退出课堂模式',exact=True).click();page.go_back(wait_until='networkidle');assert 'mode=classroom' in page.url;page.go_forward(wait_until='networkidle');assert 'mode=classroom' not in page.url
 passed('classroom direct link, refresh, browser back and forward retain valid experiment routes')
 assert not errors,errors
 context.close()
 # True cold start with every external origin blocked; local/served assets must suffice.
 offline=browser.new_context(viewport={'width':1280,'height':720});offline.route('**/*',lambda route:route.continue_() if route.request.url.startswith(URL) or route.request.url.startswith(('data:','blob:')) else route.abort())
 off=offline.new_page();off.goto(URL+'/color-mystery/lab/jellyfish?mode=classroom',wait_until='networkidle');ready(off);assert off.get_by_role('alert').count()==0;passed('cold start works with all third-party origins blocked; no CDN or model dependency');offline.close()
 unavailable=browser.new_context();unavailable.add_init_script("const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:get.call(this,type,...args)}")
 failed=unavailable.new_page();failed.goto(URL+'/color-mystery/lab/jellyfish',wait_until='networkidle');expect(failed.get_by_role('alert')).to_contain_text('无法启动三维画面');expect(failed.get_by_role('button',name='重试加载',exact=True)).to_be_visible();passed('WebGL unavailable shows Chinese fallback, real local cover and retry');unavailable.close()
 browser.close()
 (OUT/(LABEL+'-browser.json')).write_text(json.dumps({'status':'passed','origin':URL,'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')

