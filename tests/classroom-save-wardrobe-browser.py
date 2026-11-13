"""Production UI against isolated API fixtures; no classroom writes."""
import os, sys, json, re, uuid, time, base64
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
URL = os.getenv('CLASSROOM_UI_URL', 'http://127.0.0.1:5187/')
OUT = ROOT / 'outputs/classroom-save-wardrobe'; OUT.mkdir(parents=True, exist_ok=True)
auth_host = re.search(r'https://([a-z0-9]+\.supabase\.co)', (ROOT/'apps/web/.env.local').read_text()).group(1)
subject, cls, owner, teacher, planet = [str(uuid.uuid4()) for _ in range(5)]
tasks, published, checks, errors = [], [], [], []
equipped={'frameId':None,'placement':{'x':.85,'y':.35,'amplitude':'gentle'},'options':{'particles':True,'lantern':True},'revision':0}
unlocked=[]
progress={k:{"current":0,"target":v,"detail":"虚拟验证进度"} for k,v in {"silver":2,"gold":20,"sapphire":10,"emerald":5,"glass":10,"floral":50}.items()}
def enc(v): return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome', proxy={'server':'http://127.0.0.1:7892'} if URL.startswith('https://') else None, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for role in ['teacher', 'student']:
        actor = teacher if role == 'teacher' else owner
        user = {'id':subject,'email':'fixture@example.test','aud':'authenticated','role':'authenticated','app_metadata':{},'user_metadata':{}}
        session = {'access_token':enc({'alg':'HS256'})+'.'+enc({'sub':subject,'exp':int(time.time())+3600,'role':'authenticated'})+'.fixture','refresh_token':'fixture','expires_at':int(time.time())+3600,'expires_in':3600,'token_type':'bearer','user':user}
        ctx = browser.new_context(viewport={'width':1440,'height':960}, reduced_motion='reduce')
        ctx.add_init_script('localStorage.setItem('+json.dumps('colorverse.auth.'+auth_host)+','+json.dumps(json.dumps(session))+')')
        page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        unknown = []
        def api(route):
            path = route.request.url.split('/api/v1/cloud/')[1].split('?')[0]; item = path.split('/')[-1]
            if path == 'session': data = {'identity':{'id':subject,'email':user['email']},'access':'active','database':'connected','cloudWrites':True,'memberships':[{'enrollmentId':actor,'classId':cls,'title':'虚拟验收班','timezone':'Asia/Shanghai','role':role}]}
            elif item == 'decorations':
                if route.request.method=='PUT': equipped.update(route.request.post_data_json); equipped['revision']+=1
                data={'planetId':planet,'unlocked':unlocked,'progress':progress,'bindings':[{'skin_id':'winter','task_id':'T02','title':'绑定立冬作业'}],'settings':equipped}
            elif item == 'image':
                route.fulfill(body=(ROOT/'apps/web/public/assignments/two-moods.webp').read_bytes(),content_type='image/webp');return
            elif item == 'profile': data = {'profile':{'studentNumber':'00001','name':'虚拟学生'}}
            elif item == 'account': data = {'name':'虚拟学生','studentNumber':'00001','mustChangePassword':False}
            elif item == 'planets': data = {'actorId':actor,'planets':[{'id':planet,'owner_enrollment_id':owner,'display_name':'虚拟学生','ringId':equipped['options'].get('ringId'),'document':{'metadata':{'name':'我的验收星球'},'skin':0},'works':[]}]}
            elif item == 'learning-tasks':
                if route.request.method == 'POST':
                    metadata = re.search(r'name="metadata"\r\n\r\n(.*?)\r\n--', route.request.post_data, re.S)
                    v = json.loads(metadata.group(1)); definition = {'images':['private:classes/'+cls+'/learning-tasks/custom-'+v['requestId']+'/image?index='+str(i) for i in range(1+route.request.post_data.count('name="images"'))], 'image':'','imageAlt':'作业示范图片','goal':'','reviewFocus':'','peerPrompt':'','relatedIds':[],**v['definition'], 'id':'custom-'+v['requestId']}
                    tasks.append({'taskId':definition['id'],'published':False,'requireExplanation':True,'allowPeerReview':True,'showIntentToPeers':True,'revision':1,'definition':definition})
                    data = {'tasks':tasks,'taskId':definition['id']}
                else: data = {'tasks':tasks if role == 'teacher' else [t for t in tasks if t['published']]}
            elif item == 'publications':
                if route.request.method == 'POST': published.append(route.request.post_data_json)
                data = {'publications':[]} if route.request.method == 'GET' else {'id':str(uuid.uuid4())}
            elif item == 'my-assignments': data = {'planetId':planet,'assignments':[],'works':[]}
            elif item == 'notifications': data = {'notifications':[],'readIds':[]}
            elif item == 'guide': data = {'completed':[],'hasPeers':False}
            elif item == 'interactions': data = {'interactions':[]}
            elif item == 'unlinked': data = {'works':[]}
            elif item == 'roster': data = {'students':[{'enrollmentId':owner,'userId':str(uuid.uuid4()),'name':'虚拟学生','studentNumber':'00001','planetId':planet,'planetName':'我的验收星球','loggedIn':True,'activated':True,'mustChangePassword':False,'expected':0,'submitted':0,'pending':0,'interactionCount':23}]}
            else:
                unknown.append(path); route.fulfill(status=404, json={'error':{'message':'unexpected fixture'}}); return
            route.fulfill(json=data)
        page.route('**/api/v1/cloud/**', api)
        page.route('**/api/supabase/auth/v1/**', lambda r: r.fulfill(json=user))
        page.goto(URL, wait_until='networkidle')
        if role == 'teacher':
            expect(page.get_by_role('columnheader',name='有效互动',exact=True)).to_be_visible()
            row=page.get_by_role('row').filter(has=page.get_by_role('button',name='查看学生',exact=True));expect(row).to_contain_text('23')
            page.get_by_role('button',name='查看学生',exact=True).click();expect(page.get_by_text('有效互动：23 次',exact=True)).to_be_visible()
            page.get_by_role('button',name='关闭学生详情',exact=True).click()
            page.get_by_role('button', name='发布作业', exact=True).click()
            page.get_by_role('button', name='＋ 新增作业', exact=True).click()
            page.get_by_label('作业标题',exact=True).fill('立冬 · 色彩中的温度（虚拟验收）')
            page.get_by_label('作业要求',exact=True).fill('用冷暖色表达立冬的感受。')
            page.get_by_label('提交内容',exact=True).fill('一张设计作品与创作说明')
            page.get_by_label('上传作业示范图片',exact=True).set_input_files([str(ROOT/'apps/web/public/assignments/two-moods.webp'),str(ROOT/'apps/web/public/assignments/two-seasons.webp')])
            page.get_by_role('button',name='保存作业',exact=True).click()
            expect(page.get_by_text('作业已保存，尚未发布。请选择作业，再确认发布对象。',exact=True)).to_be_visible()
            expect(page.get_by_label('发布的作业')).to_have_value(tasks[0]['taskId'])
            assert not published
            imgs=page.locator('dialog[open] .assignment-brief img');expect(imgs).to_have_count(2)
            page.wait_for_function("[...document.querySelectorAll('dialog[open] .assignment-brief img')].every(i=>i.complete&&i.naturalWidth)")
            a,b=imgs.nth(0).bounding_box(),imgs.nth(1).bounding_box();assert b['y']>=a['y']+a['height']
            page.screenshot(path=str(OUT/'saved-not-published.png'),full_page=True)
            page.get_by_role('button',name='选择发布对象',exact=True).click()
            dialog = page.get_by_role('dialog',name='确认作业发布对象')
            expect(dialog).to_be_visible(); assert not published
            dialog.get_by_role('button',name='取消',exact=True).click()
            page.reload(wait_until='networkidle')
            page.get_by_role('button',name='发布作业',exact=True).click()
            page.get_by_label('发布的作业').select_option(tasks[0]['taskId'])
            page.get_by_role('button',name='选择发布对象',exact=True).click()
            page.get_by_role('dialog',name='确认作业发布对象').get_by_role('button',name='确认发布',exact=True).click()
            expect(page.get_by_role('dialog',name='确认作业发布对象')).to_have_count(0)
            assert len(published)==1 and published[0]['enrollmentIds']==[owner]
            checks.append('save without publication; auto-select; cancel; reload; explicit roster confirmation')
        else:
            entry=page.get_by_role('button',name='装扮星球',exact=True); expect(entry).to_be_visible(); entry.click()
            expect(page.get_by_role('heading',name='装扮星球',exact=True)).to_be_visible()
            annual=page.get_by_role('region',name='2026年度最佳限定套装预览')
            expect(annual).to_be_visible()
            assert annual.get_by_role('button',name='套用',exact=True).count()==0
            annual.get_by_role('button',name='月白钻冕',exact=True).click()
            expect(annual.get_by_role('button',name='月白钻冕',exact=True)).to_have_attribute('aria-pressed','true')
            expect(page.get_by_role('heading',name='我的验收星球',exact=True)).to_be_visible()
            assert page.locator('img[alt="我的星球外观"]').get_attribute('src').endswith('/demo/v2/body-0.webp')
            assert page.locator('[data-locked="true"]').count()==12
            for label in ['有效互动累计达到20次后解锁','自己的星球与作品累计获赞达到10次后解锁','提交课程作业达到5次后解锁','提交课程作业达到10次后解锁','有效互动累计达到50次后解锁']:
                expect(page.get_by_text(label,exact=True)).to_be_visible()
            page.get_by_role('button',name='试戴边框：立冬·霜华初绽',exact=True).click()
            expect(page.locator('.gp-room-scene .gp-frame-preset')).to_have_count(1)
            bounds = page.locator('.gp-exterior-stage > .gp-planet-body').bounding_box()
            assert abs(bounds['width']-bounds['height'])<2, bounds
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(OUT/'wardrobe-winter.png'),full_page=True)
            page.get_by_role('button',name='试戴星环：银月丝轨',exact=True).click()
            expect(page.locator('.gp-exterior-stage .gp-ring-front')).to_have_count(1)
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'narrow overflow'
            page.screenshot(path=str(OUT/'wardrobe-narrow.png'),full_page=True)
            page.get_by_role('button',name='← 返回星球',exact=True).click()
            expect(page.locator('.gp-app')).to_have_count(0)
            page.get_by_role('button',name='装扮星球',exact=True).click()
            expect(page.locator('.gp-room-scene .gp-frame-preset')).to_have_count(0)
            unlocked.append('winter')
            page.get_by_role('button',name='刷新解锁进度',exact=True).click()
            page.get_by_role('button',name='套用边框：立冬·霜华初绽',exact=True).click()
            expect(page.get_by_role('button',name='恢复无装扮',exact=True)).to_be_enabled()
            assert equipped['frameId']=='winter'
            page.reload(wait_until='networkidle');page.get_by_role('button',name='装扮星球',exact=True).click()
            expect(page.locator('.gp-room-scene .gp-frame-preset')).to_have_count(1)
            for skin in ['silver','gold','sapphire','emerald','glass','floral']:
                unlocked.append(skin);progress[skin]['current']=progress[skin]['target']
            page.get_by_role('button',name='刷新解锁进度',exact=True).click()
            expect(page.get_by_role('button',name='套用边框：月辉银饰',exact=True)).to_be_visible()
            expect(page.locator('.gp-unlock-progress progress')).to_have_count(6)
            expect(page.get_by_role('progressbar',name='日冕鎏金解锁进度')).to_have_attribute('value','20')
            expect(page.get_by_role('progressbar',name='繁花绘梦解锁进度')).to_have_attribute('value','50')
            page.get_by_role('button',name='套用边框：翡翠秘境',exact=True).click()
            expect(page.get_by_role('button',name='恢复无装扮',exact=True)).to_be_enabled()
            assert equipped['frameId']=='emerald'
            expect(page.locator('[data-locked="true"]')).to_have_count(5)
            page.screenshot(path=str(OUT/'all-count-skins-unlocked.png'),full_page=True)
            page.get_by_role('button',name='恢复无装扮',exact=True).click()
            expect(page.locator('.gp-room-scene .gp-frame-preset')).to_have_count(0)
            expect(page.locator('.gp-room-scene .gp-draggable-charm')).to_have_count(0)
            assert equipped['frameId'] is None
            page.reload(wait_until='networkidle');page.get_by_role('button',name='装扮星球',exact=True).click()
            expect(page.locator('.gp-room-scene .gp-frame-preset')).to_have_count(0)
            expect(page.get_by_role('button',name='套用边框：翡翠秘境',exact=True)).to_be_visible()
            for ring_id,ring_name in [('silver','银月丝轨'),('gold','鎏金冠冕'),('gem','宝石星链'),('enamel','虹彩珐琅'),('jellyfish','水母·星海巡游')]:
                unlocked.append('ring:'+ring_id)
                page.get_by_role('button',name='刷新解锁进度',exact=True).click()
                page.get_by_role('button',name='套用星环：'+ring_name,exact=True).click()
                expect(page.locator('.gp-exterior-stage .gp-ring-front')).to_have_count(1)
                assert equipped['options']['ringId']==ring_id
            page.reload(wait_until='networkidle');page.get_by_role('button',name='装扮星球',exact=True).click()
            expect(page.locator('.gp-exterior-stage .gp-jelly-orbit')).to_have_count(2)
            page.screenshot(path=str(OUT/'rings-unlocked.png'),full_page=True)
            page.get_by_role('button',name='← 返回星球',exact=True).click()
            expect(page.locator('.equipped-universe-ring[data-ring-id="jellyfish"]')).to_have_count(1)
            page.screenshot(path=str(OUT/'ring-equipped-universe.png'),full_page=True)
            page.get_by_role('button',name='装扮星球',exact=True).click()
            page.get_by_role('button',name='恢复无装扮',exact=True).click()
            assert equipped['options']['ringId'] is None
            checks.append('all five rings apply, reload persistence, jellyfish universe display and reset retaining unlocks')
            checks.append('reset persists without revoking awards; all 6 count progress bars, explicit refresh, unlocked apply and undecided rings remain locked')

        assert not unknown, unknown
        ctx.close()
    assert not errors, errors
    browser.close()
(OUT/'browser.json').write_text(json.dumps({'status':'passed','mode':'production frontend with isolated API fixtures','checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':'passed','checks':checks},ensure_ascii=False))
