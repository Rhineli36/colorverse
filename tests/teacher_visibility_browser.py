"""Guest/student/teacher navigation, role revocation and emissive scenery."""
import json, os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from cloud_teacher_fixture import install_identity,login_fixture
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5174')
checks=[];errors=[]
def passed(text): checks.append(text);print('PASS:',text,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)))
 state=install_identity(page,'student')
 page.goto(URL);page.wait_for_load_state('networkidle');expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
 expect(page.get_by_role('button',name='教师演示',exact=True)).to_have_count(0);expect(page.get_by_label('宇宙操作身份')).to_have_count(0)
 passed('guests have no teacher demo or local teacher role selector')
 login_fixture(page)
 expect(page.get_by_role('button',name='我的云端账户',exact=True)).to_be_visible();expect(page.get_by_role('button',name='教师演示',exact=True)).to_have_count(0);expect(page.get_by_label('宇宙操作身份')).to_have_count(0)
 passed('verified students have no teacher UI even with forged teacher user metadata')
 def refresh_identity():
  page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='重新核对班级',exact=True).click()
  expect(page.get_by_role('dialog').get_by_role('button',name='重新核对班级',exact=True)).to_be_enabled()
 state['role']='teacher';refresh_identity();expect(page.get_by_role('button',name='教师演示',exact=True)).to_be_visible();page.get_by_role('button',name='关闭登录',exact=True).click()
 expect(page.get_by_label('宇宙操作身份')).to_be_visible();page.get_by_label('宇宙操作身份').select_option('teacher')
 page.get_by_role('button',name='教师演示',exact=True).click();expect(page.get_by_role('heading',name='汇集每一颗独特的星球。')).to_be_visible()
 passed('server-verified teacher automatically gains the demo entry and local arrangement tools')
 state['role']='student';refresh_identity();expect(page.get_by_role('button',name='教师演示',exact=True)).to_have_count(0);page.get_by_role('button',name='关闭登录',exact=True).click();expect(page.locator('.teacher-main')).to_have_count(0);expect(page.get_by_label('宇宙操作身份')).to_have_count(0)
 page.get_by_role('button',name='薄荷来信',exact=True).click();page.get_by_role('button',name='进入星球内部 ↗',exact=True).click();expect(page.get_by_role('button',name='编辑这颗星球 ↗',exact=True)).to_have_count(0)
 passed('teacher revocation closes the demo and resets local teacher editing permission')
 page.get_by_label('返回宇宙总览',exact=True).click();state['role']='teacher';refresh_identity();expect(page.get_by_role('button',name='教师演示',exact=True)).to_be_visible();page.get_by_role('button',name='关闭登录',exact=True).click()
 page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='退出登录',exact=True).click();expect(page.get_by_role('button',name='教师演示',exact=True)).to_have_count(0);expect(page.get_by_label('宇宙操作身份')).to_have_count(0)
 passed('sign out immediately hides teacher-only controls')
 page.get_by_role('button',name='关闭登录',exact=True).click()
 page.get_by_role('button',name='日落收藏家',exact=True).click();expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true');page.wait_for_timeout(1400)
 canvas=page.locator('canvas');rect=canvas.bounding_box();camera=json.loads(canvas.get_attribute('data-camera'));base=min(rect['width']/1600,rect['height']/900)
 # Place the amber sun and nearby student planets together, with the shared camera's real pan gesture.
 sx=rect['x']+rect['width']/2+(-2100-800)*base*camera['zoom']+camera['x']*base
 sy=rect['y']+rect['height']/2+(400-450)*base*camera['zoom']+camera['y']*base
 dx=rect['x']+rect['width']*.30-sx;dy=rect['y']+rect['height']*.44-sy
 start=(rect['x']+rect['width']*.56,rect['y']+rect['height']*.80)
 page.mouse.move(*start);page.mouse.down();page.mouse.move(start[0]+dx,start[1]+dy,steps=20);page.mouse.up();page.wait_for_timeout(400)
 page.screenshot(path=str(ROOT/'outputs/COLORVERSE-emissive-stars.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});expect(page.get_by_role('button',name='教师演示',exact=True)).to_have_count(0);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 passed('guest mobile navigation stays compact and scenery renders without runtime errors')
 assert not errors,errors
 (ROOT/'outputs/teacher-visibility-browser.json').write_text(json.dumps({'status':'passed','checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
 browser.close()
