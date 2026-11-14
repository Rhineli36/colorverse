"""Student assignment center against isolated HTTP fixtures, without live classroom writes."""
import base64, json, os, re, sys, time, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "work/python-deps"))
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
URL = os.getenv("CLASSROOM_UI_URL", "http://127.0.0.1:5187/")
OUT = ROOT / "outputs/student-assignments"; OUT.mkdir(parents=True, exist_ok=True)
host = re.search(r'https://([a-z0-9]+\.supabase\.co)', (ROOT/'apps/web/.env.local').read_text()).group(1)
subject, cls, actor, planet = [str(uuid.uuid4()) for _ in range(4)]
def uid(): return str(uuid.uuid4())
def enc(v): return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
def iso(dt): return dt.isoformat().replace('+00:00', 'Z')
now = datetime.now(timezone.utc)
titles = ['立冬 · 节气色彩创作', '色彩重构 · 面积与比例', '深海水母 · 配色与造型', '已交课程作业', '重复提交的课程作业']
assignments = []
for i, title in enumerate(titles):
    pid, tid = uid(), 'custom-' + uid()
    definition = {'id':tid,'title':title,'description':'真实任务要求：观察色彩的情感表达。','steps':['观察与设计','上传作品'],'deliverables':'图片与创作说明','image':f'private:classes/{cls}/learning-tasks/{tid}/image?index=0'}
    assignments.append({'id':pid,'taskId':tid,'definition':definition,'dueAt':iso(now+timedelta(days=[-1,1,7,-2,-3][i])),'publishedAt':iso(now-timedelta(days=10)),'latestWorkId':None})
works = []
for i, title in enumerate(['零分反馈作品', '以前提交的版本', '更新后待复核作品', '自由创作作品', '未关联的历史作品']):
    reviewed = i < 2
    works.append({'id':uid(),'planetId':planet,'publicationId':assignments[3 if i==0 else 4]['id'] if i<3 else None,'taskId':assignments[3 if i==0 else 4]['taskId'] if i<3 else 'T01' if i==4 else None,'title':title,'submittedAt':iso(now-timedelta(days=5-i)),'status':'reviewed' if reviewed else 'pending','score':0 if i==0 else 92 if i==1 else None,'comment':'对应版本的教师反馈' if reviewed else '', 'updated':i==2,'withdrawn':False,'submissionRevision':1 if i==2 else 0})
assignments[3]['latestWorkId'] = works[0]['id']; assignments[4]['latestWorkId'] = works[2]['id']
user = {'id':subject,'email':'fixture@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
session = {'access_token':enc({'alg':'HS256'})+'.'+enc({'sub':subject,'exp':int(time.time())+3600,'role':'authenticated'})+'.fixture','refresh_token':'fixture','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
errors, requests, unexpected, checks = [], [], [], []
state = {'fail':False,'hasPlanet':True,'submissionFailure':False}
def gallery_work(w):
    return {'id':w['id'],'title':w['title'],'description':'作品的创作说明','presetId':'crystal','color':'#91c4dd','createdAt':w['submittedAt'],'params':{'x':.5,'y':.6,'size':.65,'motion':'float'},'revision':0,'withdrawn':w['withdrawn']}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True,channel='chrome',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'],proxy={'server':'http://127.0.0.1:7892'} if URL.startswith('https://') else None)
    context = browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce')
    context.add_init_script('localStorage.setItem('+json.dumps('colorverse.auth.'+host)+','+json.dumps(json.dumps(session))+')')
    page = context.new_page(); page.on('pageerror',lambda e: errors.append(str(e)))
    def api(route):
        requests.append(route.request.url)
        path = route.request.url.split('/api/v1/cloud/')[1].split('?')[0]; item=path.split('/')[-1]
        if path=='session': data={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'设计色彩 · 验收班','timezone':'Asia/Shanghai','role':'student'}]}
        elif item=='my-assignments':
            if state['fail']: route.fulfill(status=503,json={'error':{'message':'模拟暂时无法读取作业'}}); return
            data={'planetId':planet if state['hasPlanet'] else None,'assignments':assignments,'works':works}
        elif item=='account': data={'name':'虚拟学生','studentNumber':'00001','mustChangePassword':False}
        elif item=='profile': data={'profile':{'studentNumber':'00001','name':'虚拟学生'}}
        elif item=='planets': data={'actorId':actor,'planets':[{'id':planet,'owner_enrollment_id':actor,'display_name':'虚拟学生','document':{'metadata':{'name':'验收星球'},'skin':0},'works':[gallery_work(w) for w in works]}] if state['hasPlanet'] else []}
        elif item=='learning-tasks': data={'tasks':[{'taskId':a['taskId'],'definition':a['definition'],'published':True,'revision':1,'requireExplanation':True,'allowPeerReview':True,'showIntentToPeers':True} for a in assignments]}
        elif item=='publications': data={'publications':assignments}
        elif item=='notifications': data={'notifications':[],'readIds':[]}
        elif item=='guide': data={'completed':[],'hasPeers':False}
        elif item=='interactions': data={'interactions':[]}
        elif item=='decorations': data={'planetId':planet,'unlocked':[],'progress':{},'bindings':[],'settings':{'frameId':None,'placement':{'x':.85,'y':.35,'amplitude':'gentle'},'options':{'particles':True,'lantern':True},'revision':0}}
        elif item in ['image','original']: route.fulfill(body=(ROOT/'apps/web/public/assignments/two-moods.webp').read_bytes(),content_type='image/webp'); return
        elif item=='content':
            w=next(w for w in works if w['id']==path.split('/')[-2])
            data={'id':w['id'],'title':w['title'],'description':w.get('description','原说明'),'learning':None,'revision':w.get('revision',0),'imageCount':1,'locked':w['score'] is not None,'withdrawn':w['withdrawn']}
        elif item=='visibility' and route.request.method=='PUT':
            w=next(w for w in works if w['id']==path.split('/')[-2]);w['withdrawn']=True
            data={'saved':True,'revision':w.get('revision',0)+1}
        elif item=='review':
            w=next(w for w in works if w['id']==path.split('/')[-2])
            data={'scoreVisible':True,'submissionRevision':w['submissionRevision'],'review':{'id':uid(),'revision':1,'score':w['score'],'comment':w['comment'],'source':'teacher','created_at':w['submittedAt'],'reviewer_name':'验收教师'} if w['status']=='reviewed' else None}
        elif item=='works' and route.request.method=='POST':
            raw=route.request.post_data_buffer.decode(errors='ignore')
            meta=json.loads(re.search(r'name="metadata"\r\n\r\n(.*?)\r\n--',raw,re.S).group(1))
            if 'replaceWorkId=' in route.request.url:
                from urllib.parse import urlparse,parse_qs
                wid=parse_qs(urlparse(route.request.url).query)['replaceWorkId'][0]
                w=next(w for w in works if w['id']==wid)
                if state['submissionFailure']:route.fulfill(status=503,json={'error':{'message':'模拟修改失败，内容已保留'}});return
                w.update(title=meta['title'],description=meta['description'],revision=w.get('revision',0)+1,submissionRevision=w['submissionRevision']+1)
                route.fulfill(json={'id':wid,'created':False,'updated':True});return
            if meta['title']=='从我的作业完成提交':
                assert 'filename="第二张.webp"' in raw and 'filename="第三张.webp"' in raw
                assert raw.count('Content-Type: image/webp')==2
            publication=meta['learning']['publicationId']
            assert publication in [None,assignments[0]['id']]
            if publication is None: assert meta['learning']['taskId'] is None
            if state['submissionFailure']:
                route.fulfill(status=503,json={'error':{'message':'模拟提交失败，内容已保留'}});return
            w={'id':uid(),'planetId':planet,'publicationId':publication,'taskId':meta['learning']['taskId'],'title':meta['title'],'submittedAt':iso(now),'status':'pending','score':None,'comment':'','updated':False,'withdrawn':False,'submissionRevision':0}
            works.append(w)
            if publication: assignments[0]['latestWorkId']=w['id']
            data={'id':w['id'],'presetId':'crystal','created':True}
        else: unexpected.append(path);route.fulfill(status=404,json={'error':{'message':'unexpected fixture'}});return
        route.fulfill(json=data)
    page.route('**/api/v1/cloud/**',api)
    page.route('**/api/supabase/auth/v1/**',lambda r:r.fulfill(json=user))
    page.goto(URL,wait_until='networkidle')
    entry=page.get_by_role('button',name=re.compile(r'^我的作业'))
    expect(entry).to_have_attribute('title','待提交 3 项作业'); entry.click()
    center=page.get_by_role('region',name='我的作业',exact=True)
    expect(center.get_by_role('heading',name='我的作业',exact=True)).to_be_visible()
    expect(center.locator('[data-publication-id]')).to_have_count(3)
    for label in ['已逾期 · 仍可提交','48 小时内截止','其他待提交']: expect(center.get_by_role('region',name=label,exact=True)).to_be_visible()
    expect(center.get_by_role('button',name=re.compile('待提交'))).to_contain_text('3')
    expect(center.get_by_role('button',name=re.compile('已提交'))).to_contain_text('5')
    page.wait_for_function("[...document.querySelectorAll('.student-task-thumbnail img')].filter(i=>i.complete&&i.naturalWidth).length===3")
    assert len([u for u in requests if 'learning-tasks/' in u and 'thumbnail=1' in u])==3
    page.screenshot(path=str(OUT/'pending-desktop.png'),full_page=True)
    checks.append('three real pending assignments grouped by deadline; targeted thumbnails request small variant')
    row=center.locator('[data-publication-id="'+assignments[0]['id']+'"]')
    row.get_by_role('button',name='查看要求 →',exact=True).click()
    expect(page.get_by_role('dialog',name='课堂作业邮件').get_by_role('heading',name=titles[0],exact=True)).to_be_visible()
    page.get_by_role('button',name='关闭作业邮件',exact=True).click()
    center.get_by_role('button',name=re.compile('已提交')).click()
    expect(center.locator('[data-work-id]')).to_have_count(5)
    expect(center.get_by_text('教师评分 0 分',exact=True)).to_be_visible()
    expect(center.get_by_text('已更新，待复核',exact=True)).to_be_visible()
    expect(center.get_by_text('自主上传 · 不计课程作业完成率',exact=True)).to_be_visible()
    zero=center.locator('[data-work-id="'+works[0]['id']+'"]')
    expect(zero.get_by_role('button',name='修改作业',exact=True)).to_have_count(0)
    expect(zero.get_by_role('button',name='撤回作业',exact=True)).to_have_count(0)
    free=center.locator('[data-work-id="'+works[3]['id']+'"]')
    free.get_by_role('button',name='修改作业',exact=True).click()
    editor=page.get_by_role('dialog',name='修改已提交作业',exact=True)
    expect(editor.get_by_label('作品名称',exact=True)).to_have_value('自由创作作品')
    editor.get_by_label('作品名称',exact=True).fill('自由创作修改后')
    editor.get_by_role('button',name='移除原图片 1',exact=True).click()
    editor.get_by_label('添加或替换作品图片',exact=True).set_input_files(str(ROOT/'apps/web/public/assignments/two-moods.webp'))
    expect(editor.locator('.work-image-card')).to_have_count(1)
    editor.get_by_label('添加或替换作品图片',exact=True).set_input_files(str(ROOT/'apps/web/public/assignments/two-moods.webp'))
    expect(editor.locator('.work-image-card')).to_have_count(2)
    editor.get_by_role('button',name='移除作品图片 1',exact=True).click()
    expect(editor.locator('.work-image-card')).to_have_count(1)
    editor.get_by_label('创作说明',exact=True).fill('更新创作说明')
    state['submissionFailure']=True
    editor.get_by_role('button',name='保存修改',exact=True).click()
    expect(editor.get_by_role('alert')).to_contain_text('模拟修改失败')
    expect(editor.get_by_label('作品名称',exact=True)).to_have_value('自由创作修改后')
    state['submissionFailure']=False
    editor.get_by_role('button',name='保存修改',exact=True).click()
    expect(editor).to_have_count(0)
    expect(free.get_by_role('heading',name='自由创作修改后',exact=True)).to_be_visible()
    expect(center.locator('[data-work-id]')).to_have_count(5)
    page.once('dialog',lambda d:d.accept())
    free.get_by_role('button',name='撤回作业',exact=True).click()
    expect(free).to_contain_text('已撤下')
    expect(free.get_by_role('button',name='修改作业',exact=True)).to_have_count(0)
    checks.append('edit text and replace images, failed save retention, same work ID after retry, withdrawal preserves history, zero score hides mutations')
    center.get_by_label('搜索我的作业').fill('零分')
    expect(center.locator('[data-work-id]')).to_have_count(1)
    center.get_by_role('button',name='查看作品与反馈',exact=True).click()
    detail=page.get_by_role('dialog',name='云端作品展示',exact=True)
    expect(detail.get_by_role('heading',name='零分反馈作品',exact=True)).to_be_visible()
    expect(detail.get_by_text('对应版本的教师反馈',exact=True)).to_be_visible()
    detail.locator('button.modal-close').click()
    entry.click(); expect(center.get_by_label('搜索我的作业')).to_have_value('零分')
    center.get_by_label('搜索我的作业').fill('')
    center.get_by_role('button',name=re.compile('待提交')).click()
    row=center.locator('[data-publication-id="'+assignments[0]['id']+'"]')
    page.set_viewport_size({'width':390,'height':844})
    row.get_by_role('button',name='去提交',exact=True).click()
    upload=page.get_by_role('dialog',name='上传云端展示作品',exact=True)
    expect(upload.get_by_label('选择教学任务',exact=True)).to_have_value(assignments[0]['id'])
    upload.get_by_label('作品名称',exact=True).fill('从我的作业完成提交')
    upload.get_by_label('作品图片',exact=True).set_input_files(str(ROOT/'apps/web/public/assignments/two-moods.webp'))
    upload.get_by_label('想表达什么',exact=True).fill('测试真实关联的提交流程')
    picker=upload.get_by_label('作品图片',exact=True)
    expect(upload.locator('.work-image-card')).to_have_count(1)
    picture=(ROOT/'apps/web/public/assignments/two-moods.webp').read_bytes()
    for name in ['第二张.webp','第三张.webp']:
        picker.set_input_files({'name':name,'mimeType':'image/webp','buffer':picture})
        expect(upload.locator('.work-image-card')).to_have_count(2 if name.startswith('第二') else 3)
    picker.set_input_files([{'name':f'超限{i}.webp','mimeType':'image/webp','buffer':picture} for i in range(4)])
    expect(upload.locator('.work-image-error')).to_contain_text('六张')
    expect(upload.locator('.work-image-card')).to_have_count(3)
    picker.set_input_files({'name':'过大.webp','mimeType':'image/webp','buffer':bytes(15*1024*1024+1)})
    expect(upload.locator('.work-image-error')).to_contain_text('15 MB')
    expect(upload.locator('.work-image-card')).to_have_count(3)
    upload.get_by_role('button',name='移除作品图片 1',exact=True).click()
    expect(upload.locator('.work-image-card')).to_have_count(2)
    expect(upload.locator('.work-image-card').first).to_contain_text('第二张.webp')
    expect(upload.get_by_role('img',name='作品图片预览 1',exact=True)).to_be_visible()
    page.wait_for_function("(()=>{const imgs=[...document.querySelectorAll('.work-image-card img')];return imgs.length===2&&imgs.every(i=>i.complete&&i.naturalWidth>0&&i.naturalWidth<=320&&i.naturalHeight<=320)})()")
    upload.locator('.work-image-picker').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT/'incremental-student-mobile.png'),full_page=False)
    expect(upload).to_contain_text('3200 万像素')
    upload.get_by_role('button',name='提交并点亮星球',exact=True).click()
    expect(upload).to_contain_text('图片尚未上传')
    expect(upload.locator('[data-intent-moods] input').first).to_be_focused()
    expect(upload.locator('[data-intent-moods] input').first).to_be_in_viewport()
    assert not any('/works?requestId=' in u and 'replaceWorkId=' not in u for u in requests)
    upload.get_by_label('自己的氛围描述',exact=True).fill('宁静')
    upload.get_by_label('配色理由',exact=True).fill('   ')
    upload.get_by_role('button',name='提交并点亮星球',exact=True).click()
    expect(upload.get_by_label('配色理由',exact=True)).to_be_focused()
    expect(upload.get_by_label('配色理由',exact=True)).to_be_in_viewport()
    expect(upload.get_by_label('配色理由',exact=True)).to_have_attribute('aria-invalid','true')
    expect(upload.get_by_text('请填写配色理由，说明主要颜色怎样表达氛围。',exact=True)).to_be_in_viewport()
    assert not any('/works?requestId=' in u and 'replaceWorkId=' not in u for u in requests)
    page.screenshot(path=str(OUT/'upload-mobile-required.png'),full_page=False)
    upload.get_by_label('配色理由',exact=True).fill('冷色为主，暖色点缀')
    upload.get_by_role('button',name='提交并点亮星球',exact=True).click()
    expect(upload).to_have_count(0)
    expect(entry).to_be_enabled(); expect(entry).to_have_attribute('title','待提交 2 项作业'); entry.click()
    expect(center.locator('[data-publication-id]')).to_have_count(2)
    center.get_by_role('button',name=re.compile('已提交')).click()
    expect(center.locator('[data-work-id]')).to_have_count(6)
    center.get_by_role('button',name='自由提交作业',exact=True).click()
    expect(upload).to_be_visible()
    expect(upload.get_by_label('选择教学任务',exact=True)).to_have_value('')
    expect(upload.get_by_label('作品名称',exact=True)).to_have_value('')
    upload.get_by_label('作品名称',exact=True).fill('我的自由创作')
    upload.get_by_label('作品图片',exact=True).set_input_files(str(ROOT/'apps/web/public/assignments/two-moods.webp'))
    upload.get_by_label('想表达什么',exact=True).fill('独立创作，不关联老师布置的作业')
    state['submissionFailure']=True
    upload.get_by_role('button',name='提交并点亮星球',exact=True).click()
    expect(upload).to_contain_text('模拟提交失败，内容已保留')
    expect(upload.locator('[data-upload-status]')).to_be_in_viewport()
    page.screenshot(path=str(OUT/'upload-mobile-retry.png'),full_page=False)
    expect(upload.get_by_label('作品名称',exact=True)).to_have_value('我的自由创作')
    expect(upload.locator('.work-image-card')).to_have_count(1)
    assert len(works)==6
    state['submissionFailure']=False
    upload.get_by_role('button',name='提交并点亮星球',exact=True).click()
    expect(upload).to_have_count(0)
    expect(entry).to_be_enabled();expect(entry).to_have_attribute('title','待提交 2 项作业');entry.click()
    center.get_by_role('button',name=re.compile('已提交')).click()
    expect(center.locator('[data-work-id]')).to_have_count(7)
    expect(center.locator('[data-work-id]').filter(has=page.get_by_role('heading',name='我的自由创作',exact=True))).to_contain_text('自主上传 · 不计课程作业完成率')
    page.set_viewport_size({'width':1440,'height':1000})
    checks.append('mobile missing mood/rationale is focused and scrolled into view; no upload before validation; server errors beside submit retain selected image and text')
    checks.append('free submit clears previous course association, retains inputs on failure, retries successfully, updates history without completing a course task')
    page.screenshot(path=str(OUT/'submitted-desktop.png'),full_page=True)
    checks.append('history, zero score, free and legacy work, versioned re-review, direct feedback and successful submission update')
    page.set_viewport_size({'width':390,'height':844})
    expect(center.get_by_role('heading',name='我的作业',exact=True)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile overflow'
    page.screenshot(path=str(OUT/'submitted-mobile.png'),full_page=True)
    center.get_by_label('搜索我的作业').fill('不存在的作品')
    expect(center.get_by_role('heading',name='没有符合条件的已交作品',exact=True)).to_be_visible()
    center.get_by_label('搜索我的作业').fill('');state['fail']=True
    center.get_by_role('button',name='刷新作业',exact=True).click()
    expect(center.get_by_role('alert')).to_contain_text('模拟暂时无法读取作业')
    state['fail']=False; center.get_by_role('button',name='重新读取',exact=True).click()
    expect(center.get_by_role('alert')).to_have_count(0)
    state['hasPlanet']=False
    center.get_by_role('button',name=re.compile('待提交')).click()
    center.get_by_role('button',name='刷新作业',exact=True).click()
    expect(center.get_by_role('button',name='创建星球后提交',exact=True)).to_have_count(2)
    center.get_by_role('button',name='自由提交作业',exact=True).click()
    expect(page.get_by_role('heading',name=re.compile('编辑星球'))).to_be_visible()
    expect(page.get_by_text('请先创建自己的星球，再从「我的作业」自由提交作品。',exact=True)).to_be_visible()
    expect(upload).to_have_count(0)
    checks.append('mobile layout, no results, recoverable API failure and not-yet-created planet state')
    assert not errors,errors
    assert not unexpected,unexpected
    print(json.dumps({'status':'passed','checks':checks,'pageErrors':errors},ensure_ascii=False))
    context.close();browser.close()
