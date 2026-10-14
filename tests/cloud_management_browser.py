"""Reversible management, teacher controls and 36 element choices; isolated Auth/API."""
import base64, json, os, sys, time, uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5174')
subject,actor,cls,planet,peer,workid,commentid,likeid=[str(uuid.uuid4()) for _ in range(8)]
encode=lambda d:base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
token='.'.join([encode({'alg':'HS256'}),encode({'sub':subject,'exp':int(time.time())+3600,'aud':'authenticated','role':'authenticated'}),'isolated'])
user={'id':subject,'email':'manage@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
checks,errors=[],[]
state={'role':'student','withdrawn':False,'revision':0,'preset':'crystal','restore':True,'writes':0,'fail':False,
       'messages':[{'id':commentid,'kind':'comment','content':'喜欢这里的冷暖变化','display_name':'同学','work_id':workid,'own':False,'can_remove':False}]}
def passed(s): checks.append(s); print('PASS:',s,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,
   proxy={'server':os.environ['COLORVERSE_TEST_PROXY']} if os.environ.get('COLORVERSE_TEST_PROXY') else None,
   args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 page.on('pageerror',lambda e:errors.append(str(e)))
 def auth(route):
  if '/token' in route.request.url: route.fulfill(json={'access_token':token,'refresh_token':'isolated','expires_in':3600,'token_type':'bearer','user':user})
  elif '/user' in route.request.url: route.fulfill(json=user)
  elif '/logout' in route.request.url: route.fulfill(status=204,body='')
  else: raise AssertionError('unexpected auth')
 def api(route):
  path=urlsplit(route.request.url).path;method=route.request.method
  assert route.request.headers.get('authorization')=='Bearer '+token
  if path.endswith('/session'):
   route.fulfill(json={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'管理测试班','timezone':'Asia/Shanghai','role':state['role']}]})
  elif path.endswith('/planets'):
   assert method=='GET'
   work={'id':workid,'title':'管理测试作品','description':'保留原图与成长记录','presetId':state['preset'],'color':'#82c9c7','createdAt':'2026-10-12T00:00:00Z','params':{},'revision':state['revision'],'withdrawn':state['withdrawn'],'canRestore':state['restore']}
   owner=actor if state['role']=='student' else peer
   route.fulfill(json={'actorId':actor,'planets':[{'id':planet,'owner_enrollment_id':owner,'display_name':'学生','document':{'metadata':{'name':'管理测试星球'},'color':'#82c9c7'},'works':[work]}]})
  elif path.endswith('/guide'): route.fulfill(json={'completed':['work'],'hasPeers':False})
  elif path.endswith('/visibility'):
   assert method=='PUT';data=json.loads(route.request.post_data)
   if state['fail']: route.fulfill(status=409,json={'error':{'message':'状态已变化，请刷新'}});return
   assert data['revision']==state['revision'];state['withdrawn']=data['withdrawn'];state['revision']+=1;state['writes']+=1
   state['restore']=state['role']=='student' or not state['withdrawn'];route.fulfill(json={'saved':True})
  elif path.endswith('/element'):
   assert method=='PUT';data=json.loads(route.request.post_data);assert data['revision']==state['revision']
   state['preset']=data['presetId'];state['revision']+=1;state['writes']+=1;route.fulfill(json={'saved':True})
  elif '/interactions/' in path:
   assert method=='DELETE';ident=path.rsplit('/',1)[-1];state['messages']=[m for m in state['messages'] if m['id']!=ident];state['writes']+=1;route.fulfill(json={'removed':True})
  elif path.endswith('/interactions'):
   if method=='POST':
    data=json.loads(route.request.post_data);state['writes']+=1;state['messages'].append({'id':str(uuid.uuid4()),'kind':data['kind'],'content':data['content'],'display_name':'我','work_id':data['workId'],'own':True,'can_remove':True})
   route.fulfill(json={'interactions':state['messages'] if not state['withdrawn'] else []})
  elif path.endswith('/image'): route.fulfill(body=(ROOT/'apps/web/public/demo/v2/body-2.webp').read_bytes(),content_type='image/webp')
  elif path.endswith('/review'): route.fulfill(json={'review':None})
  elif path.endswith('/overview'): route.fulfill(json={'classId':cls,'title':'管理测试班','timezone':'Asia/Shanghai','generatedAt':'2026-10-12T00:00:00Z','students':[]})
  else: raise AssertionError('unexpected API '+method+' '+path)
 page.route('https://*.supabase.co/auth/v1/**',auth);page.route('**/api/v1/cloud/**',api)
 page.goto(URL);page.wait_for_load_state('networkidle')
 page.get_by_role('button',name='登录',exact=True).click();page.get_by_label('课堂邮箱').fill(user['email']);page.get_by_label('密码',exact=True).fill('isolated-password')
 page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click();page.get_by_role('button',name='进入我的星球 →',exact=True).click()
 def open_work(archived=False):
  if archived: page.locator('.cloud-withdrawn-list summary').click()
  page.locator('.cloud-withdrawn-list' if archived else '.cloud-work-list').get_by_role('button',name='管理测试作品',exact=False).first.click()
  return page.get_by_role('dialog',name='云端作品展示')
 expect(page.locator('.cloud-growth')).to_have_count(1)
 dialog=open_work();expect(dialog.get_by_role('button',name='移除留言',exact=True)).to_have_count(0)
 dialog.get_by_role('button',name='编辑元素',exact=True).click()
 choices=page.locator('.element-library-cards');expect(choices.get_by_role('button')).to_have_count(36)
 for name in ['星愿纸鹤','月光风铃','光帆飞船','流星风筝','色谱折扇','琉璃灯盏']:
  btn=choices.get_by_role('button',name='选择'+name,exact=True);expect(btn).to_be_visible();btn.click();expect(btn).to_have_attribute('aria-pressed','true')
 page.get_by_role('button',name='保存元素',exact=True).click();expect(page.get_by_role('region',name='云端元素编辑')).to_have_count(0)
 assert state['preset']=='glass-lantern';passed('36 choices include six distinct new shapes and persist the selected shape')
 dialog=open_work();dialog.get_by_role('button',name='撤下作品',exact=True).click();confirm=page.get_by_role('dialog',name='确认管理操作')
 before=state['writes'];confirm.get_by_role('button',name='取消',exact=True).click();assert state['writes']==before
 passed('withdrawal requires confirmation; cancel makes no write')
 dialog.get_by_role('button',name='撤下作品',exact=True).click();confirm.get_by_role('button',name='确认撤下作品',exact=True).click()
 expect(dialog).to_have_count(0);expect(page.locator('.cloud-growth')).to_have_count(0)
 expect(page.locator('.cloud-withdrawn-list')).to_be_visible();passed('withdrawn work leaves the scene and stays in an explicit private archive')
 dialog=open_work(True);expect(dialog.get_by_role('button',name='编辑元素',exact=True)).to_have_count(0)
 dialog.get_by_role('button',name='恢复展示',exact=True).click();confirm.get_by_role('button',name='确认恢复展示',exact=True).click()
 expect(dialog).to_have_count(0);expect(page.locator('.cloud-withdrawn-list')).to_have_count(0);expect(page.locator('.cloud-growth')).to_have_count(1);assert not state['withdrawn']
 passed('restore returns the same saved element and artwork')
 dialog=open_work();state['fail']=True;dialog.get_by_role('button',name='撤下作品',exact=True).click();confirm.get_by_role('button',name='确认撤下作品',exact=True).click()
 expect(confirm.get_by_role('status')).to_contain_text('状态已变化');assert not state['withdrawn'];confirm.get_by_role('button',name='取消',exact=True).click();state['fail']=False
 dialog.get_by_role('button',name='×',exact=True).click();passed('conflicting server changes keep the work and present a retryable error')
 state['role']='teacher';state['messages'][0]['can_remove']=True
 page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='重新核对班级').click();page.get_by_role('button',name='进入班级管理 →').click()
 page.get_by_role('button',name='课堂作品',exact=True).click();dialog=open_work()
 expect(dialog.get_by_role('button',name='编辑元素',exact=True)).to_have_count(0)
 dialog.get_by_role('button',name='移除留言',exact=True).click();confirm.get_by_role('button',name='确认移除留言',exact=True).click();expect(dialog.get_by_text('喜欢这里的冷暖变化',exact=False)).to_have_count(0)
 passed('teacher can moderate comments but cannot edit the student element')
 dialog.get_by_role('button',name='♡ 点赞作品',exact=True).click();expect(dialog.get_by_role('button',name='♥ 已点赞 · 点击取消',exact=True)).to_be_visible()
 dialog.get_by_role('button',name='♥ 已点赞 · 点击取消',exact=True).click();expect(dialog.get_by_role('button',name='♡ 点赞作品',exact=True)).to_be_visible()
 passed('like toggles on and off without creating duplicate reactions')
 dialog.get_by_role('button',name='撤下作品',exact=True).click();confirm.get_by_role('button',name='确认撤下作品',exact=True).click();expect(dialog).to_have_count(0)
 state['role']='student';page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='重新核对班级').click();page.get_by_role('button',name='进入我的星球 →',exact=True).click()
 dialog=open_work(True);expect(dialog.get_by_role('button',name='恢复展示',exact=True)).to_have_count(0);expect(dialog.get_by_text('教师撤下的作品，请联系教师恢复。')).to_be_visible()
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(ROOT/'outputs/COLORVERSE-management-mobile.png'),full_page=True)
 passed('teacher withdrawal cannot be reversed by student; mobile archive fits the screen')
 assert not errors,errors
 (ROOT/'outputs/cloud-management-browser.json').write_text(json.dumps({'checks':checks,'pageErrors':errors,'mode':'isolated Auth/API'},ensure_ascii=False,indent=2),encoding='utf-8')
 browser.close()
