"""Production frontend, isolated Auth/API: score privacy and actual planet thumbnails."""
import os, sys, json, uuid, time, base64, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=25000)
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5187')
OUT = ROOT / 'outputs/score-privacy'
OUT.mkdir(parents=True, exist_ok=True)
ids = [str(uuid.uuid4()) for _ in range(10)]
subject, cls, owner, peer, teacher, planet_id, work_id, uploaded_id, media_id, empty_id = ids
auth_host = re.search(r'https://([a-z0-9]+\.supabase\.co)', (ROOT / 'apps/web/.env.local').read_text()).group(1)
checks, errors = [], []

def encode(v):
    return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')

def check(label):
    checks.append(label)
    print('PASS:', label, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome', args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for role in ['peer', 'owner', 'teacher']:
        actor = {'peer': peer, 'owner': owner, 'teacher': teacher}[role]
        token = '.'.join([encode({'alg':'HS256'}), encode({'sub':subject,'exp':int(time.time())+3600,'role':'authenticated'}), 'isolated'])
        user = {'id':subject,'email':'privacy@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
        session = {'access_token':token,'refresh_token':'isolated','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
        ctx = browser.new_context(viewport={'width':1440,'height':960}, reduced_motion='reduce')
        ctx.add_init_script('localStorage.setItem('+json.dumps('colorverse.auth.'+auth_host)+','+json.dumps(json.dumps(session))+')')
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        unknown = []
        def api(route):
            path = route.request.url.split('/api/v1/cloud/')[1].split('?')[0]
            item = path.split('/')[-1]
            current = {'id':str(uuid.uuid4()),'revision':2,'score':None if role=='peer' else 95,'comment':'冷暖关系清楚，建议增加留白。','source':'teacher','created_at':'2026-11-03T01:00:00Z','reviewer_name':'虚拟教师'}
            planets = [
                {'id':planet_id,'owner_enrollment_id':owner,'display_name':'虚拟同学甲','document':{'metadata':{'name':'验证星球'},'skin':0},'works':[{'id':work_id,'title':'测试色彩作品','description':'虚拟验证作品','presetId':'crystal','color':'#efa568','createdAt':'2026-11-03T01:00:00Z','params':{},'revision':0}]},
                {'id':uploaded_id,'owner_enrollment_id':peer,'display_name':'虚拟同学乙','document':{'metadata':{'name':'上传外观星球'},'skin':2,'useDefaultExterior':False,'media':{'exterior':{'id':media_id}},'imagePlacement':{'exterior':{'x':0.2,'y':-0.1,'scale':1.4}}},'works':[]}
            ]
            if path=='session':
                data={'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'虚拟验证班','timezone':'Asia/Shanghai','role':'teacher' if role=='teacher' else 'student'}]}
            elif item=='decorations': data={'planetId':planet_id,'unlocked':[],'bindings':[],'settings':{'frameId':None,'placement':{'x':.85,'y':.35,'amplitude':'gentle'},'options':{'particles':True,'lantern':True},'revision':0}}
            elif item=='profile': data={'profile':{'studentNumber':'00001','name':'虚拟同学'}}
            elif item=='account': data={'name':'虚拟同学','studentNumber':'00001','mustChangePassword':False}
            elif item=='planets': data={'actorId':actor,'planets':planets}
            elif item=='learning-tasks': data={'tasks':[]}
            elif item=='publications': data={'publications':[]}
            elif item=='notifications': data={'notifications':[],'readIds':[]}
            elif item=='guide': data={'completed':[],'hasPeers':True}
            elif item=='interactions': data={'interactions':[]}
            elif item=='unlinked': data={'works':[]}
            elif item=='roster':
                data={'students':[{'enrollmentId':e,'userId':str(uuid.uuid4()),'name':n,'studentNumber':'0000'+str(i),'planetId':pi,'planetName':pn,'loggedIn':i!=2,'activated':True,'mustChangePassword':False,'expected':0,'submitted':0,'pending':0} for i,(e,n,pi,pn) in enumerate([(owner,'虚拟同学甲',planet_id,'验证星球'),(peer,'虚拟同学乙',uploaded_id,'上传外观星球'),(empty_id,'虚拟同学丙',None,None)])]}
            elif item=='review':
                data={'review':current,'scoreVisible':role!='peer','submissionRevision':1,'latestRevision':2,'history':[{'revision':1,'score':None if role=='peer' else 0,'comment':'第一次的教师评语','created_at':'2026-11-02T01:00:00Z','submissionRevision':0,'description':'先前说明'}]}
            elif item in ['image','exterior']:
                route.fulfill(body=(ROOT/'apps/web/public/demo/v2/body-0.webp').read_bytes(), content_type='image/webp')
                return
            else:
                unknown.append(path)
                route.fulfill(status=404, json={'error':{'message':'unexpected fixture path'}})
                return
            route.fulfill(json=data)
        page.route('**/api/v1/cloud/**', api)
        page.route('**/api/supabase/auth/v1/**', lambda r: r.fulfill(json=user))
        page.goto(URL, wait_until='networkidle')
        if role=='teacher':
            expect(page.get_by_role('heading', name='教师管理', exact=True)).to_be_visible()
            expect(page.locator('.roster-planet-thumb')).to_have_count(2)
            expect(page.locator('.roster-planet-empty')).to_have_count(1)
            imgs=page.locator('.roster-planet-thumb img')
            expect(imgs).to_have_count(2)
            page.wait_for_function("[...document.querySelectorAll('.roster-planet-thumb img')].every(i=>i.complete&&i.naturalWidth>0)")
            assert '/demo/v2/body-0.webp' in imgs.nth(0).get_attribute('src')
            assert imgs.nth(1).get_attribute('src').startswith('blob:')
            assert 40 <= page.locator('.roster-planet-thumb .cloud-planet-orb').first.bounding_box()['width'] <= 54
            page.screenshot(path=str(OUT/'teacher-roster-fixture.png'),full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.set_viewport_size({'width':1440,'height':960})
            check('teacher roster renders default/uploaded planet images and explicit no-planet placeholder; narrow page has no overflow')
            page.get_by_role('button',name='查看学生',exact=True).first.click()
            page.get_by_role('button',name='进入「验证星球」→',exact=True).click()
        else:
            page.get_by_text(re.compile('^星球导航 ·')).click()
            page.locator('.observatory-directory').get_by_role('button',name='验证星球',exact=True).click()
            page.get_by_role('button',name='进入星球内部 ↗',exact=True).click()
        page.get_by_role('button',name=re.compile('测试色彩作品')).last.click()
        dialog=page.get_by_role('dialog',name='云端作品展示')
        expect(dialog.locator('.cloud-review-record').get_by_text('冷暖关系清楚，建议增加留白。',exact=True)).to_be_visible()
        history=dialog.locator('details').filter(has=page.get_by_text(re.compile('^历史(评分|评语)')))
        history.locator('summary').click()
        expect(history).to_contain_text('第一次的教师评语')
        if role=='peer':
            expect(dialog.locator('.cloud-review-score')).to_have_count(0)
            expect(history).not_to_contain_text('0 分')
            expect(history).not_to_contain_text('暂无分数')
            expect(dialog.get_by_label('教师评分',exact=True)).to_have_count(0)
            check('classmate sees comments and historical comments without any current/historical score or scoring control')
        else:
            expect(dialog.locator('.cloud-review-score')).to_contain_text('95')
            expect(history).to_contain_text('0 分')
            expect(dialog.get_by_label('教师评分',exact=True)).to_have_count(1 if role=='teacher' else 0)
            check(role+' sees current 95 and historical actual zero; only teacher has editing controls')
        dialog.screenshot(path=str(OUT/(role+'-detail-fixture.png')))
        assert not unknown, unknown
        ctx.close()
    assert not errors, errors
    browser.close()
    (OUT/'browser-fixture.json').write_text(json.dumps({'status':'passed','mode':'production frontend with isolated Auth/API','checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
