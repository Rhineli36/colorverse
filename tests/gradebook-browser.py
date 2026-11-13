"""Read-only browser fixtures for teacher cards, real-sized thumbnails and default artwork."""
import base64,json,os,re,sys,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
expect.set_options(timeout=15000)
URL=os.getenv('CLASSROOM_UI_URL','http://127.0.0.1:5187/')
OUT=ROOT/'outputs/student-assignments';OUT.mkdir(parents=True,exist_ok=True)
host=re.search(r'https://([a-z0-9]+\.supabase\.co)',(ROOT/'apps/web/.env.local').read_text()).group(1)
def uid():return str(uuid.uuid4())
subject,cls,actor=uid(),uid(),uid()
def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
user={'id':subject,'email':'teacher-fixture@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
session={'access_token':enc({'alg':'HS256'})+'.'+enc({'sub':subject,'exp':int(time.time())+3600,'role':'authenticated'})+'.fixture','refresh_token':'fixture','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
publications=[]
for i,title in enumerate(['带示范图的色彩作业','没有示范图的课堂练习','示范图读取失败的练习']):
    tid='custom-'+uid()
    publications.append({'id':uid(),'taskId':tid,'definition':{'id':tid,'title':title,'description':'按真实发布对象核对提交记录','steps':[],'deliverables':'一张图片和创作说明','image':f'private:classes/{cls}/learning-tasks/{tid}/image'+('?broken=1' if i==2 else '') if i!=1 else ''},'targetLabel':'虚拟验收班 · 2 人','dueAt':None,'publishedAt':'2026-11-11T00:00:00Z','expected':2,'submitted':1 if i!=1 else 0,'missing':1 if i!=1 else 2,'pending':1 if i==0 else 0,'reviewed':1 if i==2 else 0})
checks,errors,unexpected,images=[],[],[],[]
state={'failSave':True,'failRead':False}
student_a,student_b=uid(),uid()
gradebook={'assignments':[{'id':a['id'],'title':a['definition']['title'],'targetLabel':a['targetLabel'],'publishedAt':a['publishedAt']} for a in publications], 'students':[{'enrollmentId':student_a,'name':'虚拟学生甲','studentNumber':'00001','freeSubmissions':2,'grades':{publications[0]['id']:{'score':0,'workId':uid(),'status':'graded','updated':False},publications[1]['id']:{'score':None,'workId':None,'status':'missing','updated':False},publications[2]['id']:{'score':None,'workId':uid(),'status':'commented','updated':False}}},{'enrollmentId':student_b,'name':'虚拟学生乙','studentNumber':'00002','freeSubmissions':0,'grades':{publications[0]['id']:{'score':None,'workId':None,'status':'not-assigned','updated':False},publications[1]['id']:{'score':None,'workId':uid(),'status':'pending','updated':True},publications[2]['id']:{'score':95,'workId':uid(),'status':'graded','updated':False}}}]}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='reduce')
    context.add_init_script('localStorage.setItem('+json.dumps('colorverse.auth.'+host)+','+json.dumps(json.dumps(session))+')')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def api(route):
        path=route.request.url.split('/api/v1/cloud/')[1].split('?')[0];item=path.split('/')[-1]
        if route.request.method!='GET' and not (item=='content' and route.request.method=='PATCH'):unexpected.append(route.request.method+' '+path);route.abort();return
        if path=='session':data={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'虚拟验收班','timezone':'Asia/Shanghai','role':'teacher'}]}
        elif item=='account':data={'name':'虚拟教师','studentNumber':'','mustChangePassword':False}
        elif item=='gradebook':
            if state['failRead']:route.fulfill(status=503,json={'error':{'message':'模拟成绩读取失败'}});return
            data=gradebook
        elif item=='roster':data={'students':[]}
        elif item=='publications':data={'publications':publications}
        elif item=='content':
            publication=next(a for a in publications if a['id']==path.split('/')[-2])
            if route.request.method=='PATCH':
                raw=route.request.post_data_buffer.decode(errors='ignore')
                metadata=json.loads(re.search(r'name="metadata"\r\n\r\n(.*?)\r\n--',raw,re.S).group(1))
                assert metadata['revision']==publication.get('contentRevision',0)
                assert metadata['keepImageIndices']==[]
                if state['failSave']:route.fulfill(status=503,json={'error':{'message':'模拟保存失败，请重试'}});return
                publication['contentRevision']=publication.get('contentRevision',0)+1
                image=f'private:classes/{cls}/publications/{publication["id"]}/image?revision={publication["contentRevision"]}&index=0'
                publication['definition']={**publication['definition'],**metadata['definition'],'images':[image],'image':image}
            data={'id':publication['id'],'definition':publication['definition'],'revision':publication.get('contentRevision',0)}
        elif '/publications/' in path and item!='image':
            publication=next(a for a in publications if a['id']==item);data={'publication':publication,'students':[]}
        elif item=='planets':data={'actorId':actor,'planets':[]}
        elif item=='learning-tasks':data={'tasks':[]}
        elif item=='unlinked':data={'works':[],'pendingIndependent':[]}
        elif item=='notifications':data={'notifications':[],'readIds':[]}
        elif item=='image':
            images.append(route.request.url)
            if 'broken=1' in route.request.url:route.fulfill(status=503,json={'error':{'message':'暂时无法读取'}});return
            route.fulfill(body=(ROOT/'apps/web/public/assignments/two-moods.webp').read_bytes(),content_type='image/webp');return
        else:unexpected.append(path);route.fulfill(status=404,json={'error':{'message':'unexpected fixture'}});return
        route.fulfill(json=data)
    page.route('**/api/v1/cloud/**',api)
    page.route('**/api/supabase/auth/v1/**',lambda r:r.fulfill(json=user))
    page.goto(URL,wait_until='networkidle')
    page.get_by_role('button',name='成绩管理',exact=True).click()
    panel=page.get_by_role('region',name='班级成绩汇总',exact=True)
    table=panel.get_by_role('table',name='学生作业成绩汇总表',exact=True)
    expect(table.get_by_role('columnheader')).to_have_count(6)
    expect(table.get_by_role('row')).to_have_count(3)
    first=table.get_by_role('row').filter(has=page.get_by_role('rowheader',name='虚拟学生甲',exact=True))
    expect(first).to_contain_text('00001')
    expect(first.get_by_text('0',exact=True)).to_be_visible()
    expect(first).to_contain_text('未提交')
    expect(first).to_contain_text('已有评语 · 待评分')
    expect(panel.get_by_text('未布置',exact=True)).to_be_visible()
    expect(panel.get_by_text('待复核',exact=True)).to_be_visible()
    page.screenshot(path=str(OUT/'gradebook-desktop-fixture.png'),full_page=True)
    panel.get_by_label('搜索成绩名单',exact=True).fill('00002')
    expect(table.get_by_role('row')).to_have_count(2)
    panel.get_by_label('搜索成绩名单',exact=True).fill('不存在')
    expect(panel.get_by_text('没有符合搜索条件的学生。',exact=True)).to_be_visible()
    panel.get_by_label('搜索成绩名单',exact=True).fill('')
    new_id=uid();gradebook['assignments'].append({'id':new_id,'title':'新发布的第四份作业','targetLabel':'全部学生','publishedAt':'2026-11-13T00:00:00Z'})
    for s in gradebook['students']:s['grades'][new_id]={'score':None,'workId':None,'status':'missing','updated':False}
    panel.get_by_role('button',name='刷新成绩',exact=True).click()
    expect(table.get_by_role('columnheader')).to_have_count(7)
    state['failRead']=True;panel.get_by_role('button',name='刷新成绩',exact=True).click()
    expect(panel.get_by_role('alert')).to_contain_text('模拟成绩读取失败')
    expect(table.get_by_role('row')).to_have_count(3)
    state['failRead']=False;panel.get_by_role('button',name='重新读取成绩',exact=True).click()
    expect(panel.get_by_role('alert')).to_have_count(0)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile page overflow'
    scroll=panel.get_by_role('region',name='成绩表，可横向滚动',exact=True)
    before=first.locator('.gradebook-number').bounding_box()['x']
    scroll.evaluate('(el)=>el.scrollLeft=450')
    after=first.locator('.gradebook-number').bounding_box()['x']
    assert abs(before-after)<2,'student number should remain fixed'
    page.screenshot(path=str(OUT/'gradebook-mobile-fixture.png'),full_page=True)
    assert not errors,errors
    assert not unexpected,unexpected
    print(json.dumps({'status':'passed','gradebook':True,'zeroAndStatuses':True,'automaticNewColumn':True,'stickyIdentityOnMobile':True,'readFailureRetainsTable':True,'pageErrors':errors},ensure_ascii=False))
    context.close();browser.close()
