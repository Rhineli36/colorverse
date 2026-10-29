import os,sys,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageStat
expect.set_options(timeout=40000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5186');LABEL=os.environ.get('COLORVERSE_TEST_LABEL','local');OUT=ROOT/'outputs/tree-lab';OUT.mkdir(exist_ok=True);checks=[];errors=[];metrics=[]
def passed(s):checks.append(s);print('PASS '+s,flush=True)
def snap(p):return p.evaluate('window.treeLab.getSnapshot()')
def ready(p):p.wait_for_function('window.treeLab?.getSnapshot().frames>2');p.wait_for_timeout(300)
with sync_playwright()as pw:
 opts=dict(headless=True,channel='chrome',args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 if URL.startswith('https'):opts['proxy']={'server':'http://127.0.0.1:18081'}
 b=pw.chromium.launch(**opts);ctx=b.new_context(viewport={'width':1366,'height':768},accept_downloads=True);p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(URL+'/color-mystery/lab/color-tree',wait_until='networkidle');ready(p);p.get_by_role('button',name='暂停',exact=True).click();p.wait_for_timeout(150);baseline=snap(p);p.screenshot(path=str(OUT/(LABEL+'-workbench.png')))
 for name in ['春日初醒','盛夏浓荫','秋日流金','冬日静谧']:
  p.get_by_role('button',name=name,exact=True).click();p.wait_for_timeout(1600);v=snap(p)
  assert all(v[k]==baseline[k]for k in ['geometryId','leafGeometryId','leafCount','camera','time','lights','exposure'])
  p.screenshot(path=str(OUT/(LABEL+'-'+name+'.png')))
 passed('four seasons retain geometry, all leaf IDs, camera, lighting and paused time')
 p.get_by_role('tab',name='同色异境',exact=True).click();p.wait_for_timeout(400);assert snap(p)['paused']
 p.get_by_role('button',name='冷暖背景',exact=True).click();p.wait_for_timeout(300)
 with p.expect_download()as d:p.get_by_role('button',name='保存画面',exact=True).click()
 targetpng=OUT/(LABEL+'-target-pixels.png');d.value.save_as(str(targetpng));im=Image.open(targetpng).convert('RGB');box=p.locator('canvas').bounding_box();ratio=im.width/box['width'];coords=snap(p)['samples'];samples=[im.getpixel((round(c['x']*ratio),round(c['y']*ratio)))for c in coords]
 assert len(samples)==2 and samples[0]==samples[1]==(213,168,75),samples
 for c in coords:
  x,y=round(c['x']*ratio),round(c['y']*ratio)
  assert all(im.getpixel((x+dx,y+dy))==(213,168,75) for dx in [-2,0,2] for dy in [-2,0,2])
 p.get_by_role('button',name='揭示色值',exact=True).click();expect(p.locator('.tree-settings')).to_contain_text('A目标色 #D5A84B');p.screenshot(path=str(OUT/(LABEL+'-same-color.png')))
 p.get_by_role('button',name='提取目标色',exact=True).click();p.wait_for_timeout(200);p.screenshot(path=str(OUT/(LABEL+'-extracted.png')));p.get_by_role('button',name='返回树场景',exact=True).click();passed('actual exported target interior pixels match exactly RGB 213,168,75; reveal and neutral extraction work')
 p.get_by_role('tab',name='自由调色',exact=True).click();p.get_by_role('button',name='左右对照',exact=True).click();assert not p.locator('.lab-comparison-labels').is_visible()
 p.get_by_label('方案名称',exact=True).fill('测试第五季');p.get_by_role('button',name='保存方案',exact=True).click()
 with p.expect_download()as d:p.get_by_role('button',name='导出 JSON',exact=True).click()
 jf=OUT/(LABEL+'-scheme.json');d.value.save_as(str(jf));data=json.loads(jf.read_text(encoding='utf-8'));assert data['schemaVersion']==1 and data['name']=='测试第五季'
 p.get_by_label('方案名称',exact=True).fill('临时改名');p.get_by_role('button',name='加载方案',exact=True).click();ready(p);expect(p.get_by_label('方案名称',exact=True)).to_have_value('测试第五季')
 p.get_by_label('导入树方案文件',exact=True).set_input_files(str(jf));ready(p);expect(p.get_by_label('方案名称',exact=True)).to_have_value('测试第五季');passed('free palette saved separately from live parameters and JSON restores validated scheme')
 p.get_by_role('tab',name='四季调色',exact=True).click();p.get_by_role('button',name='秋日流金',exact=True).click();p.get_by_role('button',name='左右对照',exact=True).click();p.get_by_role('button',name='编辑 B',exact=True).click();p.get_by_role('button',name='盛夏浓荫',exact=True).click();p.wait_for_timeout(1600);p.screenshot(path=str(OUT/(LABEL+'-comparison.png')));before=snap(p)
 p.get_by_role('button',name='课堂模式 ↗',exact=True).click();p.get_by_role('button',name='显示设置',exact=True).click();expect(p.get_by_role('dialog')).to_be_visible();assert snap(p)['id']==before['id'];p.get_by_role('button',name='关闭设置 ×',exact=True).click();p.screenshot(path=str(OUT/(LABEL+'-classroom.png')));p.get_by_role('button',name='退出课堂模式',exact=True).click();assert snap(p)['id']==before['id'];passed('A/B separate palettes share scene and classroom/drawer preserve renderer')
 for width,height in [(1280,720),(1366,768),(1920,1080),(390,844)]:
  p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(200)
  for name in ['左右对照','重置视角']:
   button=p.get_by_role('button',name=name,exact=True);r=button.bounding_box();assert r and r['y']+r['height']<=height+1
  assert p.evaluate('document.documentElement.scrollWidth')<=width
 passed('required three desktop sizes and narrow viewport keep core controls visible')
 p.set_viewport_size({'width':1280,'height':720});p.get_by_role('button',name='恢复默认',exact=True).click()
 for quality in ['low','medium','high']:
  p.locator('.tree-settings details').filter(has_text='动态与画质').first.locator('summary').click()if not p.get_by_label('树画质',exact=True).is_visible()else None
  p.get_by_label('树画质',exact=True).select_option(quality);start=snap(p);t=time.monotonic();p.wait_for_timeout(2000);end=snap(p);metrics.append({'quality':quality,'viewport':'1280x720','fps':round((end['frames']-start['frames'])/(time.monotonic()-t),2),'leafCount':end['leafCount']})
 for i in range(2):
  p.evaluate('window.oldTree=window.treeLab');p.get_by_role('button',name='← 返回实验室',exact=True).click();assert p.evaluate('window.oldTree.getSnapshot().lifecycle.active')==0;assert p.get_by_role('heading',name='深海水母',exact=True).count()==1;p.locator('.lab-experiment-card').filter(has_text='色彩之树').get_by_role('button',name='开始实验 →').click();ready(p);assert snap(p)['lifecycle']['active']==1
 passed('two navigation cycles dispose tree resources; both experiment cards remain available')
 p.reload(wait_until='networkidle');ready(p);assert not errors,errors
 # Export cover is a genuine frame, never a reference image.
 p.get_by_role('button',name='恢复默认',exact=True).click();p.get_by_role('button',name='暂停',exact=True).click();p.wait_for_timeout(1500)
 with p.expect_download()as d:p.get_by_role('button',name='保存画面',exact=True).click()
 d.value.save_as(str(OUT/(LABEL+'-cover.png')));assert sum(ImageStat.Stat(Image.open(OUT/(LABEL+'-cover.png')).convert('RGB')).stddev)>15
 p.evaluate("document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
 expect(p.get_by_role('alert')).to_contain_text('显卡画面中断');p.get_by_role('button',name='重试加载',exact=True).click();ready(p);assert snap(p)['lifecycle']['active']==1;passed('lost WebGL context recovers with old renderer disposed')
 ctx.close()
 offline=b.new_context(viewport={'width':1280,'height':720});offline.route('**/*',lambda r:r.continue_() if r.request.url.startswith(URL) else r.abort());off=offline.new_page();off.goto(URL+'/color-mystery/lab/color-tree?mode=classroom',wait_until='networkidle');ready(off);offline.close();passed('cold classroom deep link runs with all external origins blocked')
 b.close();(OUT/(LABEL+'-browser.json')).write_text(json.dumps({'status':'passed','origin':URL,'checks':checks,'targetRGB':samples,'performance':metrics,'environment':'Windows Chrome headless / SwiftShader','errors':errors},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(metrics),flush=True)
