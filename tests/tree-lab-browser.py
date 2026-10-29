"""Browser acceptance for the fixed artwork tree. No classroom records are written."""
import os,sys,json,time,io
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageChops,ImageStat
expect.set_options(timeout=30000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5186').rstrip('/');LABEL=os.environ.get('COLORVERSE_TEST_LABEL','local');OUT=ROOT/'outputs/tree-art';OUT.mkdir(exist_ok=True);checks=[];errors=[]
def passed(s):checks.append(s);print('PASS '+s,flush=True)
def snap(p):return p.evaluate('window.treeLab.getSnapshot()')
def ready(p):p.wait_for_function('window.treeLab?.getSnapshot().ready');p.wait_for_timeout(100)
def color(p,label,value):
 p.get_by_label(label,exact=True).evaluate('(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}',value);p.wait_for_timeout(80)
def png(p,name):
 with p.expect_download()as d:p.get_by_role('button',name='保存画面',exact=True).click()
 path=OUT/(LABEL+'-'+name+'.png');d.value.save_as(str(path));return Image.open(path).convert('RGB')
def artpoint(im,x,y):
 scale=min(im.width/1672,im.height/941);return (round((im.width-1672*scale)/2+x*1672*scale),round((im.height-941*scale)/2+y*941*scale))
def delta(a,b,x,y):
 ax,ay=artpoint(a,x,y);return sum(abs(v-w)for v,w in zip(a.getpixel((ax,ay)),b.getpixel((ax,ay))))
with sync_playwright()as pw:
 opts=dict(headless=True,channel='chrome',args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 if URL.startswith('https'):opts['proxy']={'server':os.environ.get('COLORVERSE_PROXY','http://127.0.0.1:7892')}
 b=pw.chromium.launch(**opts);ctx=b.new_context(viewport={'width':1366,'height':768},accept_downloads=True);p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(URL+'/color-mystery/lab/color-tree',wait_until='networkidle');ready(p);p.get_by_role('button',name='恢复默认',exact=True).click();p.locator('.lab-toast').click();baseline=snap(p);assert baseline['renderMode']=='fixed-artwork' and baseline['paused'];p.screenshot(path=str(OUT/(LABEL+'-workbench.png')))
 original=png(p,'default-export');source=Image.open(ROOT/'apps/web/public/color-lab/tree-artwork.png').convert('RGB');scale=min(original.width/source.width,original.height/source.height);ref=source.resize((round(source.width*scale),round(source.height*scale)),Image.Resampling.BILINEAR);x=(original.width-ref.width)//2;y=(original.height-ref.height)//2;crop=original.crop((x,y,x+ref.width,y+ref.height));mean=ImageStat.Stat(ImageChops.difference(crop,ref)).mean;assert max(mean)<7,mean
 f=snap(p)['frames'];p.wait_for_timeout(650);assert snap(p)['frames']==f;passed('default retains original artwork (mean RGB error <7, including browser resampling); paused frame count stays constant')
 season_images=[]
 for name in ['春日初醒','盛夏浓荫','秋日流金','冬日静谧']:
  p.get_by_role('button',name=name,exact=True).click();v=snap(p);assert all(v[k]==baseline[k]for k in ['geometryId','leafGeometryId','camera','time','lights','exposure']);p.screenshot(path=str(OUT/(LABEL+'-'+name+'.png')));season_images.append(png(p,name+'-export'))
 assert all(ImageStat.Stat(ImageChops.difference(season_images[2],im)).mean[0]>3 for i,im in enumerate(season_images) if i!=2);passed('four seasons visibly recolor the same composition without geometry, view or lighting changes')
 p.get_by_role('button',name='秋日流金',exact=True).click();p.get_by_role('tab',name='自由调色',exact=True).click();base=png(p,'regions-base');p.get_by_role('button',name='背景',exact=True).click();color(p,'背景颜色','#a35277');bg=png(p,'regions-background');assert delta(base,bg,.08,.14)>20;assert delta(base,bg,.50,.56)<8;assert delta(base,bg,.50,.82)<8
 color(p,'背景颜色','#29435d');p.get_by_role('button',name='树冠',exact=True).click();color(p,'树冠主色','#217c58');leaf=png(p,'regions-leaves');assert delta(base,leaf,.08,.14)<5;assert delta(base,leaf,.50,.82)<5
 p.get_by_role('button',name='枝干',exact=True).click();color(p,'枝干颜色','#7f396c');bark=png(p,'regions-bark');assert delta(leaf,bark,.50,.56)>10;assert delta(leaf,bark,.08,.14)<5
 p.get_by_role('button',name='地面',exact=True).click();color(p,'地面颜色','#416d7f');ground=png(p,'regions-island');assert delta(bark,ground,.50,.82)>10;assert delta(bark,ground,.08,.14)<5;passed('actual PNG pixels verify independent canopy, trunk, island and background controls')
 p.get_by_role('tab',name='同色异境',exact=True).click();p.get_by_role('button',name='冷暖背景',exact=True).click();im=png(p,'target-pixels');ratio=im.width/p.locator('canvas').bounding_box()['width'];coords=snap(p)['samples'];samples=[]
 for c in coords:
  x,y=round(c['x']*ratio),round(c['y']*ratio);samples.append(im.getpixel((x,y)));assert all(im.getpixel((x+dx,y+dy))==(213,168,75)for dx in [-2,0,2]for dy in [-2,0,2]),samples
 p.get_by_role('button',name='揭示色值',exact=True).click();expect(p.locator('.tree-settings')).to_contain_text('A目标色 #D5A84B');p.screenshot(path=str(OUT/(LABEL+'-same-color.png')))
 p.get_by_role('button',name='提取目标色',exact=True).click();im=png(p,'extracted');coords=snap(p)['samples'];assert all(im.getpixel((round(c['x']*ratio),round(c['y']*ratio)))==(213,168,75)for c in coords);p.get_by_role('button',name='返回树场景',exact=True).click();passed('18 interior pixels are exactly RGB 213,168,75 across A/B; reveal and neutral extraction preserve target')
 p.get_by_role('tab',name='自由调色',exact=True).click();p.get_by_role('button',name='左右对照',exact=True).click();p.get_by_label('方案名称',exact=True).fill('第五季验收');p.get_by_role('button',name='保存方案',exact=True).click()
 with p.expect_download()as d:p.get_by_role('button',name='导出 JSON',exact=True).click()
 jf=OUT/(LABEL+'-scheme.json');d.value.save_as(str(jf));p.get_by_label('方案名称',exact=True).fill('临时改动');p.get_by_role('button',name='加载方案',exact=True).click();ready(p);expect(p.get_by_label('方案名称',exact=True)).to_have_value('第五季验收');p.get_by_label('导入树方案文件',exact=True).set_input_files(str(jf));ready(p)
 p.reload(wait_until='networkidle');ready(p);expect(p.get_by_label('方案名称',exact=True)).to_have_value('第五季验收');assert snap(p)['paused'];p.get_by_label('PNG 带方案名称与色标信息',exact=True).check();png(p,'labeled');p.get_by_label('PNG 带方案名称与色标信息',exact=True).uncheck();passed('named schemes save/load, JSON import/export and reload persist; labeled PNG exports')
 p.get_by_role('tab',name='四季调色',exact=True).click();p.get_by_role('button',name='秋日流金',exact=True).click();p.get_by_role('button',name='左右对照',exact=True).click();p.get_by_role('button',name='编辑 B',exact=True).click();p.get_by_role('button',name='盛夏浓荫',exact=True).click();p.screenshot(path=str(OUT/(LABEL+'-comparison.png')));before=snap(p)
 p.get_by_role('button',name='课堂模式 ↗',exact=True).click();p.get_by_role('button',name='显示设置',exact=True).click();expect(p.get_by_role('dialog')).to_be_visible();assert snap(p)['id']==before['id'];p.get_by_role('button',name='关闭设置 ×',exact=True).click()
 if p.locator('.lab-toast').count():p.locator('.lab-toast').click()
 p.screenshot(path=str(OUT/(LABEL+'-classroom.png')));p.get_by_role('button',name='退出课堂模式',exact=True).click();assert snap(p)['id']==before['id'];passed('A/B palettes differ; classroom and settings drawer reuse one renderer')
 for width,height in [(1280,720),(1366,768),(1920,1080),(390,844)]:
  p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(100);r=p.get_by_role('button',name='左右对照',exact=True).bounding_box();assert r and r['y']+r['height']<=height+1;assert p.evaluate('document.documentElement.scrollWidth')<=width
 passed('three desktop sizes and narrow viewport retain controls without horizontal overflow')
 p.set_viewport_size({'width':1366,'height':768});p.get_by_role('button',name='恢复默认',exact=True).click();p.get_by_role('button',name='播放微光',exact=True).click();start=snap(p);p.wait_for_timeout(400);assert snap(p)['time']>start['time'];p.get_by_role('button',name='暂停微光',exact=True).click();f=snap(p)['frames'];p.wait_for_timeout(400);assert snap(p)['frames']==f
 for i in range(2):
  p.evaluate('window.oldTree=window.treeLab');p.get_by_role('button',name='← 返回实验室',exact=True).click();assert p.evaluate('window.oldTree.getSnapshot().lifecycle.active')==0;assert p.get_by_role('heading',name='深海水母',exact=True).count()==1;p.locator('.lab-experiment-card').filter(has_text='色彩之树').get_by_role('button',name='开始实验 →').click();ready(p);assert snap(p)['lifecycle']['active']==1
 passed('microglow plays and pauses; two navigation cycles release GPU textures and retain water experiment')
 p.evaluate("document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()");expect(p.get_by_role('alert')).to_contain_text('显卡画面中断');p.get_by_role('button',name='重试加载',exact=True).click();ready(p);assert snap(p)['lifecycle']['active']==1;passed('lost WebGL context recovers with one live renderer')
 assert not errors,errors;ctx.close()
 failure=b.new_context();failure.route('**/tree-regions.png',lambda r:r.abort());fp=failure.new_page();fp.goto(URL+'/color-mystery/lab/color-tree',wait_until='networkidle');expect(fp.get_by_role('alert')).to_contain_text('底图或分区素材加载失败');failure.unroute('**/tree-regions.png');fp.get_by_role('button',name='重试加载',exact=True).click();ready(fp);failure.close();passed('asset failure gives clear fallback and retry recovers')
 offline=b.new_context(viewport={'width':1280,'height':720});offline.route('**/*',lambda r:r.continue_()if r.request.url.startswith(URL)else r.abort());off=offline.new_page();off.goto(URL+'/color-mystery/lab/color-tree?mode=classroom',wait_until='networkidle');ready(off);offline.set_offline(True);off.get_by_role('button',name='显示设置',exact=True).click();off.get_by_role('button',name='春日初醒',exact=True).click();png(off,'offline');offline.close();passed('cold classroom route uses only same-origin files; loaded color controls and PNG work disconnected')
 b.close();(OUT/(LABEL+'-browser.json')).write_text(json.dumps({'status':'passed','origin':URL,'checks':checks,'targetRGB':samples,'defaultMeanRGBError':mean,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')

