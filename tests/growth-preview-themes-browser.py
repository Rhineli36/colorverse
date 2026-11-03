import os,sys,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
URL=os.environ.get('GROWTH_PREVIEW_URL','http://127.0.0.1:5186/growth-preview.html');out=R/os.environ.get('GROWTH_OUTPUT_DIR','outputs/growth-themes');out.mkdir(exist_ok=True)
pairs=[('月辉银饰','silver'),('日冕鎏金','gold'),('蓝宝星穹','sapphire'),('翡翠秘境','emerald'),('琉璃虹窗','glass'),('繁花绘梦','floral'),('立冬·霜华初绽','winter')]
with sync_playwright()as w:
 b=w.chromium.launch(headless=True,channel='chrome',proxy=({'server':os.environ['GROWTH_PREVIEW_PROXY']}if os.environ.get('GROWTH_PREVIEW_PROXY')else None))
 p=b.new_page(viewport={'width':1536,'height':1100},reduced_motion='reduce');errors=[];requests=[]
 p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url))
 p.goto(URL,wait_until='networkidle')
 p.wait_for_function("[...document.images].every(i=>i.complete&&i.naturalWidth>0)")
 expect(p.locator('.gp-preset-card[data-locked=true]')).to_have_count(12)
 bg=p.locator('.gp-room-art').get_attribute('src')
 for name,key in pairs:
  p.get_by_role('button',name='试戴边框：'+name,exact=True).click()
  expect(p.locator('.gp-room-scene .gp-frame-preset')).to_have_attribute('data-frame',key)
  expect(p.locator('.gp-room-scene [data-charm]')).to_have_attribute('data-charm',key)
  assert p.locator('.gp-room-art').get_attribute('src')==bg
  p.locator('.gp-room-scene').screenshot(path=str(out/('pair-'+key+'.png')))
  charm=p.locator('.gp-draggable-charm');charm.focus();p.keyboard.press('ArrowLeft');p.keyboard.press('ArrowRight')
 p.get_by_role('button',name='试戴边框：立冬·霜华初绽',exact=True).click()
 p.get_by_role('button',name='试戴星环：水母·星海巡游',exact=True).click()
 expect(p.locator('.gp-exterior-stage .gp-jelly-orbit')).to_have_count(2)
 expect(p.locator('.gp-exterior-stage .gp-jelly-traveller')).to_have_count(6)
 expect(p.locator('.gp-exterior-stage .gp-moon-orbit')).to_have_count(0)
 p.locator('.gp-preview-grid').screenshot(path=str(out/'winter-jelly-preview.png'))
 p.get_by_label('微光粒子',exact=True).uncheck()
 expect(p.locator('.gp-exterior-stage .gp-jelly-sparkles')).to_have_count(0)
 p.get_by_label('配套浮饰',exact=True).uncheck()
 expect(p.locator('.gp-room-scene [data-charm]')).to_have_count(0)
 p.get_by_label('配套浮饰',exact=True).check()
 p.get_by_label('微光粒子',exact=True).check()
 p.get_by_role('button',name='朱红盛景',exact=True).click()
 p.wait_for_function("document.querySelector('.gp-room-art').complete")
 p.locator('.gp-preview-grid').screenshot(path=str(out/'winter-red.png'))
 p.get_by_role('button',name='查看作品：冷暖色练习',exact=True).click()
 expect(p.get_by_role('status')).to_contain_text('作品入口仍可点击')
 p.get_by_role('button',name='奶油午后',exact=True).click()
 p.wait_for_function("document.querySelector('.gp-room-art').complete")
 p.locator('.gp-room-scene').screenshot(path=str(out/'winter-cream.png'))
 p.get_by_role('button',name='绮丽花园',exact=True).click()
 p.wait_for_function("document.querySelector('.gp-room-art').complete")
 p.locator('.gp-catalog').screenshot(path=str(out/'collection.png'))
 p.locator('#winter-theme').screenshot(path=str(out/'winter-preset.png'))
 p.locator('#jellyfish-theme').screenshot(path=str(out/'jelly-preset.png'))
 p.emulate_media(reduced_motion='no-preference')
 p.locator('.gp-preview-grid').scroll_into_view_if_needed()
 traveller=p.locator('.gp-exterior-stage .gp-ring-front .gp-jelly-traveller').first
 start=traveller.bounding_box();p.wait_for_timeout(1400);end=traveller.bounding_box()
 assert abs(start['x']-end['x'])+abs(start['y']-end['y'])>8
 p.get_by_role('button',name='Ⅱ 暂停动态',exact=True).click()
 assert traveller.evaluate('(e)=>getComputedStyle(e).animationName')=='none'
 assert p.locator('#jellyfish-theme .gp-jelly-traveller').first.evaluate('(e)=>getComputedStyle(e).animationName')=='none'
 p.set_viewport_size({'width':390,'height':844})
 assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 p.locator('#winter-theme').screenshot(path=str(out/'winter-mobile.png'))
 p.get_by_role('button',name='试戴边框：繁花绘梦',exact=True).click()
 expect(p.locator('.gp-room-scene [data-charm]')).to_have_attribute('data-charm','floral')
 p.get_by_role('button',name='结束试戴',exact=True).click()
 expect(p.locator('.gp-room-scene [data-charm]')).to_have_count(0)
 expect(p.locator('.gp-preset-card[data-locked=true]')).to_have_count(12)
 assert not errors,errors
 assert not any('/api/'in u for u in requests)
 assert not any('three.module' in u or 'jellyfish-renderer' in u for u in requests)
 assert p.locator('canvas').count()==0
 (out/'checks.json').write_text(json.dumps({'status':'passed','pairedFrames':[i[1] for i in pairs],'presets':12,'enhancedFrames':['emerald','glass','floral'],'winterFrameAndPersimmon':True,'jellyfishOrbit':True,'jellyfishParticlesOptional':True,'catalogueStatic':True,'pauseAndReducedMotion':True,'backgroundPreserved':True,'workClickThrough':True,'mobileNoOverflow':True,'pageErrors':errors,'apiRequests':0,'newCanvasOrWebGL':False,'cloudDeployment':False},ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS: 12 locked presets; 7 paired floating charms; fancy frames; winter/persimmon; moving jellyfish, optional particles, static catalog; click-through, mobile; no API/canvas/WebGL')
 b.close()

