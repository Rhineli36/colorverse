"""Real upload acceptance, restricted to the managed isolated demonstration class."""
import os, sys, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=60000)
journal = json.loads((ROOT / 'work/learning-demo-accounts.json').read_text(encoding='utf-8-sig'))
assert journal['marker'] == 'colorverse-learning-demo-2026-10-14'
actor = journal['accounts'][2]
assert actor['role'] == 'student' and actor['email'].startswith('learning-')
title = '沉浸式新增元素验收（演示）'
checks, errors = [], []

def passed(message):
    checks.append(message)
    print('PASS:', message, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None,
        proxy={'server': 'http://127.0.0.1:7892'},
        args=['--disable-http2', '--disable-quic', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1050})
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(error.message))
    def guard(request):
        if request.method in ['POST', 'PUT', 'DELETE'] and '/api/v1/cloud/classes/' in request.url:
            assert '/classes/' + journal['classId'] + '/' in request.url
    page.on('request', guard)
    page.goto('https://colorverse-dev.2999346.workers.dev/', wait_until='domcontentloaded', timeout=60000)
    page.get_by_role('button', name='登录', exact=True).click()
    page.get_by_label('课堂邮箱').fill(actor['email'])
    page.get_by_label('密码', exact=True).fill(actor['password'])
    page.get_by_role('dialog').get_by_role('button', name='登录', exact=True).click()
    page.get_by_role('button', name='进入我的星球 →', exact=True).click()
    expect(page.locator('.cloud-room')).to_be_visible()
    def placements():
        return page.locator('.cloud-growth').evaluate_all('(items)=>Object.fromEntries(items.map(e=>[e.dataset.workId,{left:e.style.left,top:e.style.top}]))')
    before = placements()
    entry = page.get_by_role('button', name='查看作品 ' + title, exact=True)
    uploaded = entry.count() == 0
    if uploaded:
        page.get_by_role('button', name='＋ 上传展示作品', exact=True).click()
        dialog = page.get_by_role('dialog', name='上传云端展示作品')
        dialog.get_by_label('选择教学任务').select_option('T01')
        dialog.get_by_label('作品名称', exact=True).fill(title)
        dialog.get_by_label('作品图片', exact=True).set_input_files(str(ROOT / 'apps/web/public/competition/student-2-work-3.webp'))
        dialog.get_by_label('宁静', exact=True).check()
        dialog.get_by_label('配色理由', exact=True).fill('隔离验收示例：比较冷暖色面积，观察新作品如何在场景中生长。')
        dialog.get_by_label('版本标记', exact=True).fill('场景元素验收')
        dialog.get_by_role('button', name='提交并点亮星球', exact=True).click()
        expect(page.locator('.cloud-growth.born')).to_be_visible()
        assert '4.5s' in page.locator('.cloud-growth.born').evaluate('(e)=>getComputedStyle(e).animationDuration')
        expect(dialog).not_to_be_visible()
        page.screenshot(path=str(ROOT / 'outputs/exploration-cloud-upload-growth.png'))
        passed('a real multipart upload saves a task/rationale and returns directly to the scene with a 4.5-second birth animation')
    else:
        passed('the previously uploaded isolated acceptance work remains present; no duplicate upload was created')
    expect(entry).to_have_count(1)
    after = placements()
    assert all(after[key] == value for key, value in before.items())
    work_id = entry.get_attribute('data-work-id')
    point = after[work_id]
    x, y = float(point['left'].rstrip('%'))/100, float(point['top'].rstrip('%'))/100
    assert .12 <= x <= .88 and .2 <= y <= .82
    assert len({(v['left'], v['top']) for v in after.values()}) == len(after)
    entry.focus()
    entry.press('Enter')
    dialog = page.get_by_role('dialog', name='云端作品展示')
    expect(dialog.get_by_role('img', name='提交的展示作品')).to_be_visible()
    dialog.get_by_text('教学任务与作者说明', exact=True).click()
    expect(dialog).to_contain_text('隔离验收示例')
    dialog.get_by_role('button', name='×', exact=True).click()
    page.reload(wait_until='domcontentloaded')
    page.get_by_role('button', name='我的云端账户', exact=True).click()
    page.get_by_role('button', name='进入我的星球 →', exact=True).click()
    expect(page.get_by_role('button', name='查看作品 ' + title, exact=True)).to_be_visible()
    assert placements() == after
    passed('unique normalized work placements and existing positions persist after reload, with the correct private image and author rationale')
    assert not errors, errors
    browser.close()
(ROOT / 'outputs/exploration-upload-acceptance.json').write_text(json.dumps({
    'status': 'passed', 'environment': 'real isolated cloud class', 'newUpload': uploaded,
    'checks': checks, 'pageErrors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
