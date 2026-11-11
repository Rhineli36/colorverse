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
state={'failSave':True}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome',proxy={'server':'http://127.0.0.1:7892'} if URL.startswith('https://') else None,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1440,'height':1100},reduced_motion='reduce')
    context.add_init_script('localStorage.setItem('+json.dumps('colorverse.auth.'+host)+','+json.dumps(json.dumps(session))+')')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def api(route):
        path=route.request.url.split('/api/v1/cloud/')[1].split('?')[0];item=path.split('/')[-1]
        if route.request.method!='GET' and not (item=='content' and route.request.method=='PATCH'):unexpected.append(route.request.method+' '+path);route.abort();return
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
    page.get_by_role('button',name='作业管理',exact=True).click()
    cards=page.locator('.publication-card');expect(cards).to_have_count(3)
    expect(cards.nth(0).locator('.classroom-thumbnail')).to_have_attribute('data-fallback','false')
    expect(cards.nth(0).get_by_text('1 份待批改',exact=True)).to_be_visible()
    expect(cards.nth(0)).to_have_attribute('data-review-state','pending')
    expect(cards.nth(1).get_by_text('暂无示范图',exact=True)).to_have_count(1)
    expect(cards.nth(1).locator('.classroom-thumbnail-default')).to_have_count(1)
    expect(cards.nth(2).get_by_text('图片暂不可用',exact=True)).to_have_count(1)
    assert len(images)==2 and all('thumbnail=1' in image for image in images),images
    page.screenshot(path=str(OUT/'teacher-cards-fixture.png'),full_page=True)
    cards.nth(0).get_by_role('button',name='查看提交 →',exact=True).click()
    expect(page.get_by_role('heading',name=publications[0]['definition']['title'],exact=True)).to_be_visible()
    expect(cards).to_have_count(0)
    page.get_by_role('button',name='← 返回作业列表',exact=True).click();expect(cards).to_have_count(3)
    checks.append('distinct teacher cards retain actual counts, small private thumbnail, no-image and failed-image artwork, and correct submission entry')
    cards.nth(0).get_by_role('button',name='修改作业',exact=True).click()
    editor=page.get_by_role('dialog',name='修改已发布作业',exact=True)
    expect(editor.get_by_label('作业标题',exact=True)).to_have_value(publications[0]['definition']['title'])
    editor.get_by_label('作业标题',exact=True).fill('修订后的课堂作业')
    def dismiss(dialog):dialog.dismiss()
    page.on('dialog',dismiss)
    editor.get_by_role('button',name='关闭修改作业',exact=True).click()
    expect(editor).to_be_visible()
    page.remove_listener('dialog',dismiss)
    editor.get_by_label('作业要求',exact=True).fill('修订后的要求，保留原提交和评分。')
    editor.get_by_role('button',name='移除参考图片 1',exact=True).click()
    editor.get_by_label('上传作业示范图片',exact=True).set_input_files(str(ROOT/'apps/web/public/assignments/two-seasons.webp'))
    editor.get_by_role('button',name='保存修改',exact=True).click()
    expect(editor.get_by_text('模拟保存失败，请重试',exact=True)).to_be_visible()
    expect(editor.get_by_label('作业标题',exact=True)).to_have_value('修订后的课堂作业')
    expect(editor.get_by_alt_text('新增作业示范预览',exact=True)).to_be_visible()
    state['failSave']=False
    editor.get_by_role('button',name='保存修改',exact=True).click()
    expect(editor).to_have_count(0)
    expect(cards.nth(0).get_by_role('heading',name='修订后的课堂作业',exact=True)).to_be_visible()
    expect(cards.nth(0).get_by_text('1 份待批改',exact=True)).to_be_visible()
    page.reload(wait_until='networkidle');page.get_by_role('button',name='作业管理',exact=True).click()
    cards.nth(0).get_by_role('button',name='修改作业',exact=True).click()
    expect(editor.get_by_label('作业标题',exact=True)).to_have_value('修订后的课堂作业')
    expect(editor.get_by_alt_text('已保存的参考图片 1',exact=True)).to_be_visible()
    editor.get_by_role('button',name='关闭修改作业',exact=True).click()
    checks.append('published edit entry, unsaved-close protection, image removal/replacement, save failure retention, retry and reload persistence')
    page.set_viewport_size({'width':390,'height':844})
    expect(cards.nth(0).get_by_role('button',name='查看提交 →',exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'narrow teacher overflow'
    page.screenshot(path=str(OUT/'teacher-cards-mobile-fixture.png'),full_page=True)
    checks.append('390px teacher cards have readable controls and no horizontal page overflow')
    assert not errors,errors
    assert not unexpected,unexpected
    print(json.dumps({'status':'passed','checks':checks,'pageErrors':errors},ensure_ascii=False))
    context.close();browser.close()
