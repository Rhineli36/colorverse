"""Student viewing/editing entry, ownership selection and local demo submission."""
import json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from cloud_teacher_fixture import enable_teacher
expect.set_options(timeout=15000)
checks,errors=[],[]
def passed(text):checks.append(text);print('PASS:',text,flush=True)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
with sync_playwright()as p:
    b=p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    c=b.new_context(viewport={'width':1650,'height':1000},reduced_motion='reduce');page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL);page.wait_for_load_state('networkidle');assert page.get_by_role('button',name='创作工坊',exact=True).count()==0
    expect(page.get_by_role('button',name='编辑你的星球',exact=True)).to_be_visible();assert page.locator('.studio-grid').count()==0
    page.get_by_role('button',name='薄荷来信',exact=True).click();page.get_by_role('button',name='进入星球内部 ↗',exact=True).click()
    expect(page.get_by_role('heading',name='薄荷来信',exact=True)).to_be_visible();expect(page.get_by_text('欣赏模式 · INSIDE THE PLANET',exact=True)).to_be_visible()
    assert page.get_by_role('button',name='编辑这颗星球 ↗',exact=True).count()==0 and page.locator('.studio-grid').count()==0
    passed('normal planet navigation opens viewing mode; another student planet has no edit-this-planet action')
    page.get_by_role('button',name='编辑你的星球',exact=True).click();expect(page.locator('.studio-bar strong')).to_have_text('日落收藏家')
    expect(page.get_by_role('button',name='提交课程作业 ↗',exact=True)).to_be_visible()
    passed('explicit student edit entry opens the owned planet even after viewing another planet and exposes submission')
    expect(page.locator('.layer-list')).to_be_visible();page.get_by_role('tab',name='星球信息',exact=True).click();expect(page.locator('.layer-list')).to_be_visible()
    page.get_by_role('tab',name='装饰',exact=True).click();page.get_by_role('button',name='星环',exact=True).click();expect(page.locator('.layer-list')).to_be_visible()
    expect(page.get_by_role('button',name='隐藏图层',exact=True)).to_be_visible();page.get_by_role('button',name='隐藏图层',exact=True).click();expect(page.get_by_role('button',name='显示图层',exact=True)).to_be_visible()
    passed('layers and nearby hide/delete controls stay visible while switching information and adding decorations')
    page.get_by_role('button',name='提交课程作业 ↗',exact=True).click();expect(page.locator('.course-page')).to_be_visible();expect(page.get_by_role('button',name='接受并保存',exact=True)).to_have_count(0)
    page.get_by_role('button',name='编辑你的星球',exact=True).click();page.get_by_role('button',name='✦ 模拟提交作业',exact=True).click();expect(page.get_by_role('button',name='接受并保存',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='内部空间',exact=True)).to_have_class('selected')
    page.get_by_role('button',name='拒绝',exact=True).click();expect(page.get_by_role('button',name='接受并保存',exact=True)).to_have_count(0)
    passed('course submission opens a separate classroom; the explicit simulated growth action remains independent')
    page.get_by_label('返回宇宙总览',exact=True).click();enable_teacher(page);page.get_by_label('宇宙操作身份',exact=True).select_option('teacher')
    page.get_by_role('button',name='薄荷来信',exact=True).click();page.get_by_role('button',name='进入星球内部 ↗',exact=True).click()
    expect(page.get_by_role('button',name='编辑这颗星球 ↗',exact=True)).to_be_visible();page.get_by_role('button',name='编辑这颗星球 ↗',exact=True).click();expect(page.locator('.studio-bar strong')).to_have_text('薄荷来信')
    passed('teacher role retains the explicit edit action on every viewed planet')
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    expect(page.get_by_role('button',name='编辑你的星球',exact=True)).to_be_visible();expect(page.get_by_role('button',name='提交课程作业 ↗',exact=True)).to_be_visible()
    passed('mobile retains the renamed entry and submission without horizontal overflow')
    c.close();b.close()
assert not errors,errors
(ROOT/'outputs/COLORVERSE-student-entry-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} student entry browser checks passed.')
