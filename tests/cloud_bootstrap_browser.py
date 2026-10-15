"""A failed local demo asset must not remove the cloud login or classroom entry."""
import os,sys,json,uuid,time,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
subject,actor,cls,planet=[str(uuid.uuid4())for _ in range(4)];checks=[];errors=[]
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token='.'.join([enc({'alg':'HS256'}),enc({'sub':subject,'exp':int(time.time())+3600,'aud':'authenticated','role':'authenticated'}),'isolated'])
user={'id':subject,'email':'bootstrap@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
with sync_playwright()as p:
 b=p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None);page=b.new_page();page.on('pageerror',lambda e:errors.append(e.message))
 def auth(route):
  if '/token'in route.request.url:route.fulfill(json={'access_token':token,'refresh_token':'isolated','expires_in':3600,'token_type':'bearer','user':user})
  elif '/user'in route.request.url:route.fulfill(json=user)
  else:route.fulfill(status=204,body='')
 def api(route):
  path=route.request.url
  if path.endswith('/session'):route.fulfill(json={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'启动隔离测试班','timezone':'Asia/Shanghai','role':'student'}]})
  elif path.endswith('/planets'):route.fulfill(json={'actorId':actor,'planets':[{'id':planet,'owner_enrollment_id':actor,'display_name':'启动测试学生','document':{'metadata':{'name':'云端星球'},'media':{}},'works':[]}]})
  elif path.endswith('/learning-tasks'):route.fulfill(json={'tasks':[]})
  elif path.endswith('/guide'):route.fulfill(json={'completed':[],'hasPeers':False})
  elif '/interactions?'in path:route.fulfill(json={'interactions':[]})
  else:raise AssertionError('Unexpected isolated request')
 page.route('**/api/supabase/auth/v1/**',auth);page.route('**/api/v1/cloud/**',api);page.route('**/demo/**',lambda r:r.fulfill(status=503,body='controlled demo asset failure'))
 page.goto(os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5174'),wait_until='domcontentloaded');expect(page.get_by_role('alert')).to_contain_text('本机视觉演示素材暂时无法加载');expect(page.get_by_role('button',name='登录',exact=True)).to_be_visible();checks.append('controlled local demo asset failure leaves the independent cloud login visible')
 page.get_by_role('button',name='登录',exact=True).click();page.get_by_label('课堂邮箱').fill(user['email']);page.get_by_label('密码',exact=True).fill('isolated');page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click();page.get_by_role('button',name='进入我的星球 →',exact=True).click();expect(page.locator('.cloud-room-heading')).to_contain_text('云端星球');expect(page.get_by_role('button',name='＋ 上传展示作品',exact=True)).to_be_visible();checks.append('verified cloud student enters the planet and upload flow even though all local demo asset reads fail');page.screenshot(path=str(ROOT/'outputs/cloud-bootstrap-independent.png'));assert not errors,errors;b.close()
(ROOT/'outputs/cloud-bootstrap-acceptance.json').write_text(json.dumps({'status':'passed','mode':'isolated Auth/API; real frontend with controlled local asset failure','checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
for c in checks:print('PASS:',c,flush=True)
