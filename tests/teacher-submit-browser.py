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
state={'failSave':True,'submissionFailure':True,'submitted':False}
student_id,student_user,student_planet=uid(),uid(),uid()
publications=publications[:1]
publications[0].update(expected=1,submitted=0,missing=1,pending=0,reviewed=0)
request_ids=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome',proxy={'server':'http://127.0.0.1:7892'} if URL.startswith('https://') else None,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='reduce')
    context.add_init_script('localStorage.setItem('+json.dumps('colorverse.auth.'+host)+','+json.dumps(json.dumps(session))+')')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def api(route):
        path=route.request.url.split('/api/v1/cloud/')[1].split('?')[0];item=path.split('/')[-1]
        if route.request.method!='GET' and not (item=='content' and route.request.method=='PATCH') and not (item=='works' and route.request.method=='POST'):unexpected.append(route.request.method+' '+path);route.abort();return
        if path=='session':data={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'虚拟验收班','timezone':'Asia/Shanghai','role':'teacher'}]}
        elif item=='account':data={'name':'虚拟教师','studentNumber':'','mustChangePassword':False}
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
            publication=next(a for a in publications if a['id']==item)
            row={'enrollmentId':student_id,'userId':student_user,'name':'虚拟代交学生','studentNumber':'00001','planetId':student_planet,'workId':student_user if state['submitted'] else None,'title':'代交浏览器验收' if state['submitted'] else None,'submittedAt':'2026-11-12T04:00:00Z' if state['submitted'] else None,'score':None,'comment':'','reviewRevision':0,'status':'pending' if state['submitted'] else 'missing','updated':False,'submittedByTeacher':state['submitted']}
            data={'publication':publication,'students':[row]}
        elif item=='planets':data={'actorId':actor,'planets':[]}
        elif item=='learning-tasks':data={'tasks':[{'taskId':publications[0]['taskId'],'definition':publications[0]['definition'],'published':True,'requireExplanation':True,'allowPeerReview':True,'showIntentToPeers':True,'revision':1}]}
        elif item=='unlinked':data={'works':[],'pendingIndependent':[]}
        elif item=='notifications':data={'notifications':[],'readIds':[]}
        elif item=='works' and route.request.method=='POST':
            from urllib.parse import urlparse,parse_qs
            query=parse_qs(urlparse(route.request.url).query)
            assert query['onBehalfOf']==[student_id] and query['publicationId']==[publications[0]['id']]
            request_ids.append(query['requestId'][0])
            raw=route.request.post_data_buffer.decode(errors='ignore')
            meta=json.loads(re.search(r'name="metadata"\r\n\r\n(.*?)\r\n--',raw,re.S).group(1))
            assert meta['learning']['taskId']==publications[0]['taskId'] and meta['learning']['publicationId']==publications[0]['id']
            if state['submissionFailure']:route.fulfill(status=503,json={'error':{'message':'模拟存储失败，输入已保留'}});return
            state['submitted']=True;publications[0].update(submitted=1,missing=0,pending=1)
            data={'id':student_user,'created':True,'presetId':'crystal'}
        elif item=='image':
            images.append(route.request.url)
            if 'broken=1' in route.request.url:route.fulfill(status=503,json={'error':{'message':'暂时无法读取'}});return
            route.fulfill(body=(ROOT/'apps/web/public/assignments/two-moods.webp').read_bytes(),content_type='image/webp');return
        else:unexpected.append(path);route.fulfill(status=404,json={'error':{'message':'unexpected fixture'}});return
        route.fulfill(json=data)
    page.route('**/api/v1/cloud/**',api)
    page.route('**/api/supabase/auth/v1/**',lambda r:r.fulfill(json=user))
    page.goto(URL,wait_until='networkidle')
    page.get_by_role('button',name='作业管理',exact=True).click()
    page.get_by_role('button',name='查看提交 →',exact=True).click()
    page.get_by_role('button',name='未提交',exact=True).click()
    page.get_by_role('button',name='代交作业',exact=True).click()
    modal=page.get_by_role('dialog',name='代交作业',exact=True)
    expect(modal).to_contain_text('虚拟代交学生')
    modal.get_by_label('作品名称',exact=True).fill('代交浏览器验收')
    modal.get_by_label('作品图片',exact=True).set_input_files(str(ROOT/'apps/web/public/assignments/two-moods.webp'))
    modal.get_by_role('button',name='确认代交作业',exact=True).click()
    expect(modal.get_by_role('alert')).to_contain_text('目标氛围与配色理由')
    assert not request_ids
    modal.get_by_label('自己的氛围描述',exact=True).fill('宁静')
    modal.get_by_label('配色理由',exact=True).fill('冷色与暖色点缀的对照')
    modal.get_by_label('创作说明',exact=True).fill('学生提供的创作说明')
    modal.get_by_role('button',name='确认代交作业',exact=True).click()
    expect(modal.get_by_role('alert')).to_contain_text('模拟存储失败')
    expect(modal.get_by_label('作品名称',exact=True)).to_have_value('代交浏览器验收')
    assert modal.get_by_label('作品图片',exact=True).evaluate('(el)=>el.files.length')==1
    page.screenshot(path=str(OUT/'teacher-submit-desktop-fixture.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    state['submissionFailure']=False
    modal.get_by_role('button',name='确认代交作业',exact=True).click()
    expect(modal).to_have_count(0)
    expect(page.get_by_text('没有符合条件的提交记录。',exact=True)).to_be_visible()
    page.get_by_role('button',name='待批改',exact=True).click()
    expect(page.get_by_text('教师代交',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='查看并评分 →',exact=True)).to_be_visible()
    assert len(request_ids)==2 and request_ids[0]==request_ids[1]
    page.set_viewport_size({'width':1440,'height':1000})
    page.screenshot(path=str(OUT/'teacher-submit-result-fixture.png'),full_page=True)
    assert not errors,errors
    assert not unexpected,unexpected
    print(json.dumps({'status':'passed','teacherProxySubmit':True,'retainsInputOnFailure':True,'retrySameRequestId':True,'mobileWidth':390,'pageErrors':errors},ensure_ascii=False))
    context.close();browser.close()
