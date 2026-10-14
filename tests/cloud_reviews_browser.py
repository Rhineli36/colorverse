"""Teacher review editing, demo confirmation, draft protection and student read-only; isolated Auth/API."""
import os,sys,json,uuid,time,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5174')
subject,actor,cls,planet,owner,workid=[str(uuid.uuid4())for _ in range(6)]
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
token='.'.join([enc({'alg':'HS256'}),enc({'sub':subject,'exp':int(time.time())+3600,'aud':'authenticated','role':'authenticated'}),'isolated'])
user={'id':subject,'email':'review@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
state={'role':'student','readFail':True,'postFail':False,'conflict':False,'requests':[],
 'review':{'id':str(uuid.uuid4()),'revision':1,'score':91,'comment':'蓝与红的冷暖关系清楚，建议增加留白。','source':'demo','created_at':'2026-10-14T01:00:00Z','reviewer_name':'教师'}}
checks=[];errors=[]
def passed(s):checks.append(s);print('PASS:',s,flush=True)
with sync_playwright()as p:
 browser=p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)))
 def auth(route):
  if '/token'in route.request.url:route.fulfill(json={'access_token':token,'refresh_token':'isolated','expires_in':3600,'token_type':'bearer','user':user})
  elif '/user'in route.request.url:route.fulfill(json=user)
  elif '/logout'in route.request.url:route.fulfill(status=204,body='')
  else:route.fulfill(status=400,json={'message':'unexpected auth'})
 def api(route):
  path=route.request.url.split('/api/v1/cloud/')[1].split('?')[0];method=route.request.method
  if path=='session':route.fulfill(json={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'点评演示班','timezone':'Asia/Shanghai','role':state['role']}]})
  elif path.endswith('/planets'):route.fulfill(json={'actorId':actor,'planets':[{'id':planet,'owner_enrollment_id':owner,'display_name':'演示学生 01','document':{'metadata':{'name':'点评演示星球'},'color':'#efa568','skin':0},'works':[{'id':workid,'title':'蓝红人物配色','description':'隔离测试作品，原图与教师反馈分开保存。','presetId':'color-fan','color':'#efa568','createdAt':'2026-10-14T01:00:00Z','params':{},'revision':0}]}]})
  elif path.endswith('/guide'):route.fulfill(json={'completed':[],'hasPeers':True})
  elif path.endswith('/interactions'):
   if method=='POST':state['requests'].append({'kind':'social',**json.loads(route.request.post_data)})
   route.fulfill(json={'interactions':[]})
  elif path.endswith('/review'):
   if method=='GET':
    if state['readFail']:route.fulfill(status=503,json={'error':{'message':'点评读取暂不可用'}})
    else:route.fulfill(json={'review':state['review']})
   else:
    assert state['role']=='teacher';data=json.loads(route.request.post_data);state['requests'].append(data)
    if state['postFail']:route.fulfill(status=503,json={'error':{'message':'保存失败，草稿已保留'}})
    elif state['conflict']:
     state['review']={**state['review'],'revision':state['review']['revision']+1,'score':90,'comment':'另一位教师的最新点评','source':'teacher'}
     state['conflict']=False;route.fulfill(status=409,json={'error':{'message':'点评已被其他教师更新。你的草稿已保留，请重新读取后核对再保存'}})
    else:
     assert data['revision']==state['review']['revision'];state['review']={**state['review'],'revision':data['revision']+1,'score':data['score'],'comment':data['comment'],'source':'teacher'};route.fulfill(json={'review':state['review']})
  elif path.endswith('/image'):route.fulfill(body=(ROOT/'apps/web/public/demo/v2/body-0.webp').read_bytes(),content_type='image/webp')
  elif path.endswith('/overview'):
   confirmed=state['review']['source']=='teacher'
   route.fulfill(json={'classId':cls,'title':'点评演示班','timezone':'Asia/Shanghai','generatedAt':'2026-10-14T01:00:00Z','students':[{'enrollment_id':owner,'display_name':'演示学生 01','account_status':'active','enrollment_status':'active','planet_id':planet,'planet_name':'点评演示星球','showcase_count':1,'weekly_showcase_count':1,'course_submission_count':0,'sent_count':6,'weekly_sent_count':6,'received_count':8,'weekly_received_count':8,'last_submission':'2026-10-14T01:00:00Z','reviewed_showcase_count':1 if confirmed else 0,'suggested_review_count':0 if confirmed else 1,'average_showcase_score':state['review']['score']if confirmed else None}]})
  else:raise AssertionError('Unexpected API '+path)
 page.route('https://*.supabase.co/auth/v1/**',auth);page.route('**/api/v1/cloud/**',api)
 page.goto(URL);page.wait_for_load_state('networkidle');page.get_by_role('button',name='登录',exact=True).click();page.get_by_label('课堂邮箱').fill(user['email']);page.get_by_label('密码',exact=True).fill('isolated-password');page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click();page.get_by_role('button',name='进入我的星球 →',exact=True).click()
 page.get_by_role('button',name='演示学生 01',exact=False).filter(has=page.locator('strong')).last.click()
 def open_work():
  page.locator('.cloud-work-list').get_by_role('button',name='蓝红人物配色',exact=False).click();return page.get_by_role('dialog',name='云端作品展示')
 dialog=open_work();review=dialog.get_by_role('region',name='教师点评与评分');expect(review.get_by_role('alert')).to_contain_text('点评读取暂不可用');expect(review.get_by_label('教师评分',exact=True)).to_have_count(0)
 state['readFail']=False;review.get_by_role('button',name='读取最新点评',exact=True).click();expect(review).to_contain_text('演示建议 · 待教师确认');expect(review.get_by_label('教师评分',exact=True)).to_have_count(0)
 dialog.get_by_role('button',name='♡ 点赞作品',exact=True).click();expect(dialog.get_by_role('button',name='♡ 点赞作品',exact=True)).to_be_enabled();dialog.get_by_label('作品留言').fill('红蓝搭配很有张力');dialog.get_by_role('button',name='发送留言',exact=True).click();expect(dialog.get_by_label('作品留言')).to_have_value('');assert len(state['requests'])==2
 passed('students read clearly labeled suggestions and use like/comment without any scoring control')
 dialog.get_by_role('button',name='×',exact=True).click();state['role']='teacher';page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='重新核对班级',exact=True).click();page.get_by_role('button',name='进入班级管理 →',exact=True).click()
 expect(page.get_by_role('table')).to_contain_text('演示建议 1 件');expect(page.get_by_role('table')).to_contain_text('尚无教师确认评分');page.get_by_role('button',name='查看星球与作品 ↗',exact=True).click()
 state['readFail']=True;dialog=open_work();review=dialog.get_by_role('region',name='教师点评与评分');expect(review.get_by_role('alert')).to_be_visible();expect(review.get_by_label('教师评分',exact=True)).to_have_count(0);state['readFail']=False;review.get_by_role('button',name='读取最新点评',exact=True).click();expect(review.get_by_label('教师评分',exact=True)).to_have_value('91');passed('failed initial teacher read cannot create a misleading empty review; retry loads the suggestion')
 review.get_by_label('教师评分',exact=True).fill('101');expect(review.get_by_role('button',name='确认并保存教师点评',exact=True)).to_be_disabled();review.get_by_label('教师评分',exact=True).fill('94');review.get_by_label('教师点评',exact=True).fill('主体色彩鲜明；下一步建议减少背景高饱和色面积。')
 expect(dialog.get_by_role('button',name='×',exact=True)).to_be_disabled();page.keyboard.press('Escape');expect(dialog).to_be_visible();expect(page.get_by_role('button',name='返回班级统计',exact=False)).to_be_disabled();passed('out-of-range scores are blocked and unsaved teacher drafts protect closing and navigation')
 state['postFail']=True;review.get_by_role('button',name='确认并保存教师点评',exact=True).click();expect(review.get_by_role('alert')).to_contain_text('保存失败');expect(review.get_by_label('教师评分',exact=True)).to_have_value('94');state['postFail']=False;review.get_by_role('button',name='确认并保存教师点评',exact=True).click();expect(review.get_by_role('status')).to_contain_text('已保存');assert state['requests'][-2]['requestId']==state['requests'][-1]['requestId'];expect(review).to_contain_text('教师已确认');expect(dialog.get_by_role('button',name='×',exact=True)).to_be_enabled();passed('failed save preserves draft and idempotency key; retry confirms an editable teacher review')
 review.get_by_label('教师评分',exact=True).fill('96');state['conflict']=True;review.get_by_role('button',name='保存点评与评分',exact=True).click();expect(review.get_by_role('alert')).to_contain_text('其他教师更新');review.get_by_role('button',name='读取最新点评（保留草稿）',exact=True).click();expect(review).to_contain_text('另一位教师的最新点评');expect(review.get_by_label('教师评分',exact=True)).to_have_value('96');review.get_by_role('button',name='保存点评与评分',exact=True).click();expect(review.get_by_role('status')).to_contain_text('已保存');assert state['requests'][-1]['revision']==3;passed('version conflict keeps the draft; explicit reload checks latest feedback before a new version saves')
 review.screenshot(path=str(ROOT/'outputs/COLORVERSE-teacher-review-fixture.png'))
 dialog.get_by_role('button',name='×',exact=True).click();page.get_by_role('button',name='返回班级统计',exact=False).click();expect(page.get_by_role('table')).to_contain_text('已确认作品均分 96 / 100');expect(page.get_by_role('table')).not_to_contain_text('演示建议 1 件');page.get_by_label('筛选学生').select_option('unreviewed');expect(page.get_by_role('table').locator('tbody tr')).to_have_count(0);page.get_by_label('筛选学生').select_option('all');passed('teacher overview reports confirmed progress and average, with a pending-review filter')
 state['role']='student';page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='重新核对班级',exact=True).click();page.get_by_role('button',name='进入我的星球 →',exact=True).click();page.get_by_role('button',name='进入班级星球：演示学生 01',exact=True).click();dialog=open_work();review=dialog.get_by_role('region',name='教师点评与评分');expect(review).to_contain_text('教师已确认');expect(review).to_contain_text('96');expect(review.get_by_label('教师评分',exact=True)).to_have_count(0);page.set_viewport_size({'width':390,'height':844});review.scroll_into_view_if_needed();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');review.screenshot(path=str(ROOT/'outputs/COLORVERSE-student-review-mobile.png'));passed('students see confirmed teacher feedback without editing rights, also on mobile')
 assert not errors,errors
 (ROOT/'outputs/cloud-reviews-browser.json').write_text(json.dumps({'status':'passed','checks':checks,'pageErrors':errors,'mode':'isolated Auth/API'},ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
