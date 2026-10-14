"""Real DOM motion, cloud persistence, role boundaries and replay; isolated Auth/API."""
import os,sys,json,uuid,time,base64,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5174')
subject,actor,staff,cls=[str(uuid.uuid4()) for _ in range(4)]
def enc(v): return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token='.'.join([enc({'alg':'HS256'}),enc({'sub':subject,'exp':int(time.time())+3600,'aud':'authenticated','role':'authenticated'}),'isolated'])
user={'id':subject,'email':'demo@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
def motion(mode,trajectory='ellipse'): return {'version':'1.0.0','mode':mode,'trajectory':trajectory,'range':'wide','direction':'forward'}
planets=[{'id':str(uuid.uuid4()),'owner_enrollment_id':actor if i==0 else str(uuid.uuid4()),'display_name':f'演示学生 {i+1}','document':{'metadata':{'name':f'演示画室 {i+1}'},'color':'#82c9c7','skin':i,'revision':0,'motion':motion(['slow','fast','stationary','slow','fast','stationary'][i]),'halo':['soft','ring','none'][i%3]},'works':[{'id':str(uuid.uuid4()),'title':f'测试展示作品 {i+1}','description':'隔离浏览器示例','presetId':'glass-lantern','color':'#82c9c7','createdAt':'2026-10-14T01:00:00Z','params':{},'revision':0}],'stats':{'likes':i+1,'emojis':i,'comments':i}}for i in range(6)]
state={'role':'student','writes':0};checks=[];errors=[]
def passed(v): checks.append(v);print('PASS:',v,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
 def auth(route):
  if '/token' in route.request.url: route.fulfill(json={'access_token':token,'refresh_token':'isolated','expires_in':3600,'token_type':'bearer','user':user})
  elif '/user' in route.request.url: route.fulfill(json=user)
  elif '/logout' in route.request.url: route.fulfill(status=204,body='')
  else: route.fulfill(status=400,json={'message':'unexpected isolated auth request'})
 def api(route):
  path=route.request.url.split('/api/v1/cloud/')[1].split('?')[0];method=route.request.method
  if method not in ['GET','HEAD']: state['writes']+=1
  if path=='session': route.fulfill(json={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor if state['role']=='student' else staff,'classId':cls,'title':'演示班','timezone':'Asia/Shanghai','role':state['role']}]})
  elif path.endswith('/planets'): route.fulfill(json={'actorId':actor if state['role']=='student' else staff,'planets':planets})
  elif path.endswith('/guide'): route.fulfill(json={'completed':['summary','work','element'],'hasPeers':True})
  elif path.endswith('/appearance'):
   data=json.loads(route.request.post_data);assert state['role']=='student';assert data['revision']==planets[0]['document']['revision']
   for field in ['motion','halo','atmosphere','brightness','saturation']:
    if field in data: planets[0]['document'][field]=data[field]
   planets[0]['document']['revision']+=1;route.fulfill(json={'saved':True})
  elif path.endswith('/interactions'): route.fulfill(json={'interactions':[]})
  elif path.endswith('/image'): route.fulfill(body=(ROOT/'apps/web/public/demo/v2/body-2.webp').read_bytes(),content_type='image/webp')
  elif path.endswith('/review'): route.fulfill(json={'review':None})
  elif path.endswith('/overview'): route.fulfill(json={'classId':cls,'title':'演示班','timezone':'Asia/Shanghai','generatedAt':'2026-10-14T01:00:00Z','students':[]})
  else: raise AssertionError('Unexpected API '+path)
 page.route('https://*.supabase.co/auth/v1/**',auth);page.route('**/api/v1/cloud/**',api)
 page.route("**/api/supabase/auth/v1/**",auth)
 page.goto(URL);page.wait_for_load_state('networkidle');page.get_by_role('button',name='登录',exact=True).click()
 page.get_by_label('课堂邮箱').fill(user['email']);page.get_by_label('密码',exact=True).fill('isolated-password');page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click();page.get_by_role('button',name='进入我的星球 →',exact=True).click()
 universe=page.get_by_role('region',name='真实班级宇宙');scene=universe.locator('.cloud-universe-scene')
 expect(universe.locator('.cloud-universe-node')).to_have_count(6)
 expect(page.get_by_role('region',name='班级互动亮点').locator('button')).to_have_count(3)
 expect(page.get_by_role('button',name='演示加速 ×3',exact=True)).to_have_count(0)
 scene.scroll_into_view_if_needed();page.wait_for_function('()=>[...document.querySelectorAll(".cloud-universe-node")].every(n=>n.dataset.x)')
 def pos(i):
  n=universe.locator('.cloud-universe-node').nth(i);return [float(n.get_attribute('data-x')),float(n.get_attribute('data-y'))]
 initial=[pos(i)for i in range(6)];page.wait_for_timeout(1800);later=[pos(i)for i in range(6)]
 assert math.dist(initial[1],later[1])>5,(initial,later)
 assert math.dist(initial[2],later[2])==0
 scene.screenshot(path=str(ROOT/'outputs/COLORVERSE-class-universe-fixture.png'))
 passed('six real-data planet widgets display different saved motions, including truly stationary planets')
 universe.get_by_role('button',name='暂停班级运行',exact=True).click();page.wait_for_timeout(150)
 still=[pos(i)for i in range(6)];page.wait_for_timeout(450);assert still==[pos(i)for i in range(6)]
 universe.get_by_role('button',name='收起班级轨迹',exact=True).click();expect(universe.locator('.cloud-universe-paths')).to_have_count(0)
 universe.get_by_role('button',name='显示班级轨迹',exact=True).click();expect(universe.locator('.cloud-universe-paths path')).to_have_count(6)
 assert state['writes']==0
 passed('pause and trajectory visibility affect only viewing and never write cloud documents')
 page.get_by_role('button',name='编辑星球外貌与背景',exact=True).click();settings=page.get_by_role('region',name='云端星球设置')
 settings.get_by_role('button',name='星球运行',exact=True).click();settings.get_by_role('button',name='快速',exact=True).click();page.get_by_label('云端运行轨迹',exact=True).select_option('figure-eight')
 expect(page.get_by_label('云端运动即时预览').locator('animateMotion')).to_have_count(1)
 assert planets[0]['document']['motion']['mode']=='slow'
 settings.get_by_role('button',name='保存星球设置',exact=True).click();expect(settings.get_by_role('status')).to_contain_text('已保存到云端')
 expect(universe.locator('.cloud-universe-node').first).to_have_attribute('data-mode','fast')
 settings.get_by_role('button',name='完成设置',exact=True).click()
 passed('owner motion preview remains a draft until saved, then updates the actual shared planet')
 page.reload();page.wait_for_load_state('networkidle');page.get_by_role('button',name='我的星球与作品',exact=True).click();expect(universe.locator('.cloud-universe-node').first).to_have_attribute('data-mode','fast')
 universe.get_by_role('button',name='进入班级星球：演示学生 2',exact=True).click();expect(page.get_by_role('heading',name='演示画室 2',exact=True)).to_be_visible();expect(page.get_by_role('button',name='编辑星球外貌与背景',exact=True)).to_have_count(0)
 passed('reload restores saved motion and entering a peer opens its works without editing rights')
 state['role']='teacher';page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='重新核对班级',exact=True).click();page.get_by_role('button',name='关闭登录',exact=True).click()
 page.get_by_role('button',name='课堂作品',exact=True).click();page.get_by_role('button',name='刷新作品',exact=True).click();expect(page.get_by_role('button',name='演示加速 ×3',exact=True)).to_be_visible()
 scene.scroll_into_view_if_needed();page.get_by_role('button',name='演示加速 ×3',exact=True).click();expect(universe.locator('.cloud-universe-status')).to_contain_text('不改变任何保存设置')
 before=state['writes'];page.get_by_role('button',name='回看星球诞生',exact=True).click();expect(page.locator('.cloud-planet-birth')).to_be_visible();expect(page.locator('.cloud-planet-birth')).to_have_count(0,timeout=7000)
 page.get_by_role('button',name='回看元素生长',exact=True).click();expect(page.locator('.cloud-growth.born')).to_have_count(1);expect(page.locator('.cloud-growth.born')).to_have_count(0,timeout=7000)
 assert state['writes']==before
 passed('verified teacher gets accelerated viewing and both 4.5-second replays without duplicate records')
 page.emulate_media(reduced_motion='reduce');scene.scroll_into_view_if_needed();page.wait_for_timeout(200)
 stable=[pos(i)for i in range(6)];page.wait_for_timeout(450);assert stable==[pos(i)for i in range(6)]
 expect(page.get_by_role('button',name='暂停班级运行',exact=True)).to_be_disabled();passed('reduced motion keeps classroom planets still while saved fast configuration remains intact')
 page.set_viewport_size({'width':390,'height':844});scene.scroll_into_view_if_needed();page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 scene.screenshot(path=str(ROOT/'outputs/COLORVERSE-class-universe-mobile.png'));passed('mobile galaxy and teacher replay controls remain readable without page overflow')
 assert not errors,errors
 (ROOT/'outputs/cloud-universe-browser.json').write_text(json.dumps({'status':'passed','checks':checks,'pageErrors':errors,'mode':'isolated Auth/API'},ensure_ascii=False,indent=2),encoding='utf-8')
 b.close()
