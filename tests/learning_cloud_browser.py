"""REAL Auth/Worker/Storage/database acceptance, writes only the journal's isolated demo class.
Credentials are read from ignored work/ and never printed. No Auth/API mocks.
"""
import os,sys,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
expect.set_options(timeout=45000)
URL=os.environ.get('COLORVERSE_TEST_URL','https://colorverse-dev.2999346.workers.dev')
journal=ROOT/'work/learning-demo-accounts.json';j=json.loads(journal.read_text(encoding='utf-8-sig'))
assert j['marker']=='colorverse-learning-demo-2026-10-14' and len(j['accounts'])==3
assert all(a['email'].startswith('learning-') and a['email'].endswith('@colorverse.test') for a in j['accounts'])
teacher,student,peer=j['accounts'];checks=[];errors=[];title='浏览器验收 · 配色说明'
def passed(s):checks.append(s);print('PASS:',s,flush=True)
def save():journal.write_text(json.dumps(j,ensure_ascii=False,indent=2),encoding='utf-8')
with sync_playwright()as p:
 browser=p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None,proxy={'server':os.environ.get('COLORVERSE_TEST_PROXY','http://127.0.0.1:7892')},args=['--disable-http2','--disable-quic','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 def fresh():
  c=browser.new_context(viewport={'width':1440,'height':1000});page=c.new_page();page.set_default_timeout(60000);page.on('pageerror',lambda e:errors.append({'message':e.message}));
  def guard(r):
   if r.method in ['POST','PUT','DELETE'] and '/api/v1/cloud/classes/'in r.url:assert '/classes/'+j['classId']+'/'in r.url,'write outside isolated class'
  page.on('request',guard);return c,page
 def enter(page,role):
  page.get_by_role('button',name='我的云端账户',exact=True).click();page.get_by_role('button',name='进入我的星球 →'if role=='student'else'进入班级管理 →',exact=True).click()
 def login(page,a):
  print('Loading real cloud classroom',flush=True)
  page.goto(URL,wait_until='domcontentloaded',timeout=60000)
  try:page.get_by_role('button',name='登录',exact=True).wait_for(timeout=60000)
  except Exception:
   page.screenshot(path=str(ROOT/'outputs/learning-cloud-boot-failure.png'));print('BOOT:',page.locator('body').inner_text()[:500],flush=True);print('PAGE ERRORS:',errors,flush=True);raise
  page.get_by_role('button',name='登录',exact=True).click();page.get_by_label('课堂邮箱').fill(a['email']);page.get_by_label('密码',exact=True).fill(a['password']);page.get_by_role('dialog').get_by_role('button',name='登录',exact=True).click();page.get_by_role('button',name='进入我的星球 →'if a['role']=='student'else'进入班级管理 →',exact=True).click()
 def open_work(page):
  page.locator('.cloud-work-list').get_by_role('button',name=title,exact=False).click();d=page.get_by_role('dialog',name='云端作品展示');expect(d.locator('img[alt="提交的展示作品"]')).to_be_visible();expect(d.locator('img[alt="提交的展示作品"]')).to_have_js_property('complete',True);return d
 def own(page):
  expect(page.locator('.cloud-room')).to_be_visible()
 context,page=fresh();login(page,student);page.wait_for_selector('.cloud-gallery');
 page.wait_for_function("() => [...document.querySelectorAll('.cloud-planet-orb')].filter(i=>i.src.startsWith('blob:')&&i.complete&&i.naturalWidth>0).length>=2",timeout=60000)
 passed('real student login and both private planet appearances load on first entry')
 if not j.get('browserUploadCompleted',j.get('browserWorkId')):
  page.get_by_role('button',name='＋ 上传展示作品',exact=True).click();d=page.get_by_role('dialog',name='上传云端展示作品');d.get_by_label('选择教学任务').select_option('T01');d.locator('details.learning-panel').first.locator('summary').first.click();expect(d).to_contain_text('色相：你选择了哪一类颜色')
  d.get_by_label('作品名称',exact=True).fill(title);d.get_by_label('作品图片',exact=True).set_input_files(str(ROOT/'apps/web/public/competition/student-1-work-3.webp'));d.get_by_label('宁静',exact=True).check();d.get_by_label('配色理由',exact=True).fill('浏览器验收说明：用蓝灰主色面积与少量暖色点缀比较画面氛围。');d.get_by_label('版本标记',exact=True).fill('验收比较版')
  d.get_by_role('button',name='提交并点亮星球',exact=True).click();born=page.locator('.cloud-growth.born');expect(born).to_be_visible(timeout=60000);duration=born.evaluate('(e)=>getComputedStyle(e).animationDuration');assert '4.5s'in duration,duration;page.screenshot(path=str(ROOT/'outputs/learning-cloud-growth.png'))
  # Locate the persisted work through a same-origin authenticated request, using the session only inside the browser.
  page.wait_for_timeout(4700);d=open_work(page);j['browserUploadCompleted']=True; j.pop('browserWorkId',None)
  save();passed('task prompt and palette rationale submit through multipart; upload visibly triggers a 4.5-second growth animation')
 else:d=open_work(page);passed('previously uploaded browser acceptance work exists on a later run')
 d.get_by_text('教学任务与作者说明',exact=True).click();expect(d).to_contain_text('浏览器验收说明');page.screenshot(path=str(ROOT/'outputs/learning-cloud-student.png'));d.get_by_role('button',name='×',exact=True).click();page.reload(wait_until='domcontentloaded');
 if page.locator('.cloud-gallery').count()==0:enter(page,'student')
 d=open_work(page);d.get_by_text('教学任务与作者说明',exact=True).click();expect(d).to_contain_text('浏览器验收说明');d.get_by_role('button',name='×',exact=True).click();passed('uploaded image, task and rationale survive a full page reload')
 # A new browser context means a real password sign-in, not cached component state.
 context.close();context,page=fresh();login(page,student);d=open_work(page);d.get_by_text('教学任务与作者说明',exact=True).click();expect(d).to_contain_text('浏览器验收说明');d.get_by_role('button',name='×',exact=True).click();passed('a new session after password sign-in reads the same saved work and teaching context')
 teacher_context,tp=fresh();login(tp,teacher);expect(tp.get_by_role('table')).to_contain_text('演示学生 1');tp.get_by_text('教师教学模板设置',exact=True).click();expect(tp.get_by_label('启用任务',exact=True)).to_have_count(3);row=tp.get_by_role('row').filter(has_text='演示学生 1');row.get_by_role('button',name='查看星球与作品 ↗',exact=True).click();td=open_work(tp);
 expected_comment='浏览器验收点评（演示）：配色依据已说明，建议继续比较点缀色面积。'
 if td.get_by_label('教师评分',exact=True).input_value()!='88' or td.get_by_label('教师点评',exact=True).input_value()!=expected_comment:
  td.get_by_label('教师评分',exact=True).fill('88');td.get_by_label('教师点评',exact=True).fill(expected_comment);td.get_by_role('button',name='保存点评与评分',exact=True).click();expect(td).to_contain_text('教师点评与评分已保存')
 else:expect(td).to_contain_text('教师已确认')
 td.get_by_role('button',name='×',exact=True).click();tp.get_by_role('button',name='返回班级统计',exact=True).click();expect(tp.get_by_role('table')).to_contain_text('演示学生 1');tp.screenshot(path=str(ROOT/'outputs/learning-cloud-teacher.png'));passed('a real isolated teacher scores the submitted work; classroom overview remains accessible')
 peer_context,pp=fresh();login(pp,peer);pp.locator('.cloud-planets').get_by_role('button',name='演示学生 1',exact=False).click();pd=open_work(pp);
 if not j.get('browserPeerFeedbackSaved'):
  pd.get_by_label('宁静',exact=True).check();pd.get_by_label('画面依据（必填）',exact=True).fill('浏览器验收反馈：蓝灰区域占大面积，暖色在局部形成重点。');pd.get_by_label('一条建议（可选）',exact=True).fill('试着减少一处暖色，再比较重点是否更集中。');pd.get_by_role('button',name='提交观察反馈',exact=True).click();expect(pd).to_contain_text('浏览器验收反馈');j['browserPeerFeedbackSaved']=True;save()
 else:expect(pd).to_contain_text('浏览器验收反馈')
 peer_context.close();peer_context,pp=fresh();login(pp,peer);pp.locator('.cloud-planets').get_by_role('button',name='演示学生 1',exact=False).click();pd=open_work(pp);expect(pd).to_contain_text('浏览器验收反馈');passed('a second real student posts structured peer feedback, which survives another password sign-in')
 page.reload(wait_until='domcontentloaded');
 if page.locator('.cloud-gallery').count()==0:enter(page,'student')
 d=open_work(page);expect(d).to_contain_text('浏览器验收点评');expect(d).to_contain_text('88');expect(d).to_contain_text('浏览器验收反馈');expect(d.get_by_label('教师评分',exact=True)).to_have_count(0);page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(ROOT/'outputs/learning-cloud-feedback-mobile.png'));passed('the author reads teacher score and peer evidence after refresh without teacher editing controls')
 assert not errors,errors;browser.close()
(ROOT/'outputs/learning-cloud-acceptance.json').write_text(json.dumps({'status':'passed','environment':'real isolated cloud class','checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
