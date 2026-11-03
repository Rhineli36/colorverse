import os,sys,json
from pathlib import Path
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
URL=os.environ.get('GROWTH_PREVIEW_URL','http://127.0.0.1:5186/growth-preview.html');out=R/os.environ.get('GROWTH_OUTPUT_DIR','outputs/growth-drag');out.mkdir(exist_ok=True)
def xy(el):return [float(el.get_attribute('data-x')),float(el.get_attribute('data-y'))]
def within(el,scene):
 a=el.bounding_box();b=scene.bounding_box();assert a['x']>=b['x']+5 and a['y']>=b['y']+5,(a,b);assert a['x']+a['width']<=b['x']+b['width']-5 and a['y']+a['height']<=b['y']+b['height']-5,(a,b)
with sync_playwright()as w:
 b=w.chromium.launch(headless=True,channel='chrome',proxy=({'server':os.environ['GROWTH_PREVIEW_PROXY']}if os.environ.get('GROWTH_PREVIEW_PROXY')else None))
 p=b.new_page(viewport={'width':1536,'height':1100});errors=[];requests=[]
 p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:requests.append(r.url))
 p.goto(URL,wait_until='networkidle')
 p.get_by_role('button',name='试戴边框：立冬·霜华初绽',exact=True).click()
 scene=p.locator('.gp-room-scene');charm=p.get_by_role('button',name='拖动霜柿小灯',exact=True)
 scene.scroll_into_view_if_needed();p.wait_for_timeout(500)
 start=xy(charm);r=charm.bounding_box();s=scene.bounding_box()
 p.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);p.mouse.down()
 expect(charm).to_have_class('gp-draggable-charm is-dragging')
 assert charm.locator('.gp-float-motion').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
 p.mouse.move(s['x']+s['width']*.4,s['y']+s['height']*.55,steps=12);p.mouse.up()
 moved=xy(charm);assert moved[0]<start[0]-.2 and moved[1]>start[1]+.1,(start,moved)
 within(charm,scene)
 p.get_by_role('radio',name='明显',exact=True).check();expect(charm).to_have_attribute('data-amplitude','expressive')
 assert charm.locator('.gp-float-motion').evaluate('(e)=>getComputedStyle(e).animationName')=='gp-charm-float'
 assert charm.evaluate('(e)=>getComputedStyle(e).getPropertyValue("--charm-travel").trim()')=='12px'
 p.get_by_role('radio',name='静止',exact=True).check()
 assert charm.locator('.gp-float-motion').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
 assert xy(charm)==moved
 r=charm.bounding_box();p.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
 assert xy(charm)==moved
 p.get_by_role('button',name='试戴边框：月辉银饰',exact=True).click()
 other=p.get_by_role('button',name='拖动月牙风铃',exact=True);expect(other).to_have_attribute('data-amplitude','gentle')
 p.get_by_role('radio',name='明显',exact=True).check()
 p.get_by_role('button',name='试戴边框：立冬·霜华初绽',exact=True).click()
 charm=p.get_by_role('button',name='拖动霜柿小灯',exact=True)
 assert xy(charm)==moved;expect(charm).to_have_attribute('data-amplitude','still')
 charm.focus();p.keyboard.press('ArrowLeft');assert xy(charm)[0]<moved[0]
 # Escape cancels an unfinished pointer drag, restoring its starting placement.
 before=xy(charm);r=charm.bounding_box();p.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);p.mouse.down();p.mouse.move(r['x']-50,r['y']+20,steps=4);p.keyboard.press('Escape');p.mouse.up();assert xy(charm)==before
 p.get_by_role('radio',name='轻柔',exact=True).check()
 p.screenshot(path=str(out/'winter-dragged.png'),full_page=True)
 p.locator('.gp-preview-grid').screenshot(path=str(out/'winter-position.png'))
 # Clamp against all sides even when the pointer leaves the scene.
 r=charm.bounding_box();s=scene.bounding_box();p.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);p.mouse.down();p.mouse.move(s['x']-150,s['y']-150,steps=8);p.mouse.up();within(charm,scene)
 p.get_by_role('button',name='复位位置',exact=True).click();assert abs(xy(charm)[0]-.85)<.001
 expect(charm).to_have_attribute('data-amplitude','gentle')
 p.get_by_role('button',name='查看作品：冷暖色练习',exact=True).click();expect(p.get_by_role('status')).to_contain_text('作品入口仍可点击')
 p.set_viewport_size({'width':390,'height':844});scene.scroll_into_view_if_needed();p.wait_for_timeout(150);within(charm,scene)
 assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
 p.screenshot(path=str(out/'mobile.png'),full_page=True)
 p.emulate_media(reduced_motion='reduce');assert charm.locator('.gp-float-motion').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
 # A real touch sequence, rather than a synthetic click, moves the ornament.
 c=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,reduced_motion='reduce');q=c.new_page()
 q.goto(URL,wait_until='networkidle');q.get_by_role('button',name='试戴边框：立冬·霜华初绽',exact=True).click()
 touch=q.get_by_role('button',name='拖动霜柿小灯',exact=True);touch.scroll_into_view_if_needed();q.wait_for_timeout(100)
 a=touch.bounding_box();old=xy(touch);client=c.new_cdp_session(q)
 x=a['x']+a['width']/2;y=a['y']+a['height']/2
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 client.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-80,'y':y+25}]})
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 assert xy(touch)[0]<old[0]-.1,(old,xy(touch));within(touch,q.locator('.gp-room-scene'))
 c.close()
 assert not errors,errors;assert not any('/api/'in u for u in requests)
 (out/'checks.json').write_text(json.dumps({'status':'passed','mouseDrag':True,'dragPausesFloating':True,'clickDoesNotTeleport':True,'amplitudes':['still','gentle','expressive'],'independentPerCharmPlacement':True,'keyboardAdjustment':True,'escapeCancelsDrag':True,'positionReset':True,'boundaryClamping':True,'mobileAndTouch':True,'reducedMotion':True,'workClickThrough':True,'pageErrors':errors,'apiRequests':0,'cloudDeployment':False},ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS: mouse/touch drag, amplitudes, per-charm retention, cancel/reset, boundaries, resize, keyboard, click-through and no API requests')
 b.close()

