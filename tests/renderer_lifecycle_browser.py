"""Inject renderer initialization failure, then verify normal navigation with real WebGL."""
import os,sys,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5174');checks=[]
with sync_playwright()as p:
 b=p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append({'message':e.message,'stack':e.stack}))
 def fail_mount(route):
  response=route.fetch();code=response.text();needle=re.search(r'async mount\([a-zA-Z_$][\w$]*\)\{',code)
  assert needle,'SceneRenderer mount signature absent'
  code=code[:needle.end()]+'throw new Error("Controlled renderer initialization failure");'+code[needle.end():]
  route.fulfill(response=response,body=code)
 page.route('**/assets/App-*.js',fail_mount);page.goto(URL,wait_until='networkidle');expect(page.get_by_role('alert')).to_contain_text('Controlled renderer initialization failure');page.get_by_role('button',name='显示运行轨迹',exact=True).click();page.get_by_role('button',name='聚焦星球',exact=True).click();page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(350);assert not errors,errors;checks.append('failed mount retains its initial error, accessible planet list and view controls without canvas getter errors');page.screenshot(path=str(ROOT/'outputs/renderer-failure-after.png'));page.close()
 page=b.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append({'message':e.message,'stack':e.stack}));page.goto(URL,wait_until='networkidle')
 for _ in range(3):
  page.get_by_role('button',name='编辑你的星球',exact=True).click();page.get_by_role('button',name='宇宙展览',exact=True).click();page.set_viewport_size({'width':1000,'height':800});page.set_viewport_size({'width':1440,'height':1000})
 page.wait_for_selector('canvas[data-scene-ready="true"]',timeout=30000);assert not errors,errors;checks.append('three quick editor/universe transitions and resize recover a ready canvas without runtime errors');b.close()
(ROOT/'outputs/renderer-lifecycle-after.json').write_text(json.dumps({'status':'passed','checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
for c in checks:print('PASS:',c,flush=True)
