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
state={'failSave':True,'failRemove':True,'removed':False,'removeRequests':0}
role='teacher';pupil,student_planet=uid(),uid()
roster=[{'enrollmentId':pupil,'userId':uid(),'name':'待移出验收学生','studentNumber':'00001','planetId':None,'planetName':None,'loggedIn':False,'activated':False,'mustChangePassword':False,'expected':0,'submitted':0,'pending':0}]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='reduce')
    context.add_init_script('localStorage.setItem('+json.dumps('colorverse.auth.'+host)+','+json.dumps(json.dumps(session))+')')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def api(route):
        path=route.request.url.split('/api/v1/cloud/')[1].split('?')[0];item=path.split('/')[-1]
        if route.request.method!='GET' and not (item=='content' and route.request.method=='PATCH') and item!='remove':unexpected.append(route.request.method+' '+path);route.abort();return
        if path=='session':data={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'虚拟验收班','timezone':'Asia/Shanghai','role':role}]}
        elif item=='account':data={'name':'虚拟教师','studentNumber':'','mustChangePassword':False}
        elif item=='roster':data={'students':roster}
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
        elif item=='remove':
            assert route.request.method=='POST' and path.endswith('/students/'+pupil+'/remove')
            assert route.request.post_data_json=={'confirm':True}
            state['removeRequests']+=1
            if state['failRemove']:route.fulfill(status=503,json={'error':{'message':'模拟移出失败，请重试'}});return
            roster.clear();state['removed']=True;data={'removed':True,'enrollmentId':pupil}
        elif item=='profile':data={'profile':{'studentNumber':'00001','name':'有效学生'}}
        elif item=='my-assignments':data={'planetId':student_planet,'assignments':[],'works':[]}
        elif item=='guide':data={'completed':[],'hasPeers':False}
        elif item=='interactions':data={'interactions':[]}
        elif item=='planets':data={'actorId':actor,'planets':[] if role=='teacher' else [{'id':student_planet,'owner_enrollment_id':actor,'display_name':'有效学生','document':{'metadata':{'name':'有效学生星球'},'skin':0},'works':[]}]}
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
    row=page.get_by_role('row').filter(has=page.get_by_text('待移出验收学生',exact=True))
    expect(row.get_by_role('button',name='移出班级',exact=True)).to_be_visible()
    page.once('dialog',lambda d:d.dismiss())
    row.get_by_role('button',name='移出班级',exact=True).click()
    assert state['removeRequests']==0
    page.once('dialog',lambda d:d.accept())
    row.get_by_role('button',name='移出班级',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('模拟移出失败')
    expect(row).to_have_count(1)
    state['failRemove']=False
    page.once('dialog',lambda d:d.accept())
    row.get_by_role('button',name='移出班级',exact=True).click()
    expect(row).to_have_count(0)
    expect(page.get_by_text('尚无学生，请先导入点名册。',exact=True)).to_be_visible()
    role='student'
    manifest=[]
    page.reload(wait_until='networkidle')
    expect(page.locator('.observatory-labels > div')).to_have_count(1)
    expect(page.get_by_text('有效学生星球',exact=True).first).to_be_visible()
    page.screenshot(path=str(OUT/'classroom-without-default-planets.png'),full_page=True)
    assert not errors,errors
    assert not unexpected,unexpected
    print(json.dumps({'status':'passed','removeConfirmationAndCancel':True,'failureRetainsStudent':True,'successRemovesRow':True,'classroomDefaultSamples':0,'realStudentPlanetRetained':True,'pageErrors':errors},ensure_ascii=False))
    context.close();browser.close()
