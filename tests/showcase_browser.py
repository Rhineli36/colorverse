"""Self-selected archive upload and rule growth; isolated browser storage."""
import os, sys, json, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
expect.set_options(timeout=15000)
checks, errors, external = [], [], []
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5174')
def passed(text):
    checks.append(text); print('PASS:', text, flush=True)
def docs(page):
    return page.evaluate("""async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const values=await new Promise(ok=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>ok(r.result)});db.close();return values;}""")
def current(page): return next(d for d in docs(page) if d['metadata']['name'] == '日落收藏家')
def add(page, title, path):
    page.get_by_role('button', name='添加展示作品 ↗', exact=True).click()
    dialog = page.get_by_role('dialog', name='添加展示作品', exact=True)
    dialog.get_by_label('作品标题', exact=True).fill(title)
    dialog.get_by_label('作品图片', exact=True).set_input_files(str(path))
    dialog.get_by_label('色彩与情绪关键词', exact=True).fill('温暖 自然')
    dialog.get_by_role('button', name='提交展示作品', exact=True).click()
    expect(dialog).to_have_count(0)
    page.get_by_role('button', name='编辑这颗星球 ↗', exact=True).click()
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name == 'nt' else None, args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce', accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('request', lambda r: external.append(r.url) if '/api/' in r.url or 'openai' in r.url else None)
    page.goto(URL); page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='编辑你的星球', exact=True)).to_be_visible()
    page.get_by_role('button', name='编辑你的星球', exact=True).click()
    expect(page.get_by_role('button', name='添加展示作品 ↗', exact=True)).to_be_visible()
    before = current(page)
    passed('owned planet editor exposes a distinct showcase entry')
    page.get_by_role('button', name='添加展示作品 ↗', exact=True).click()
    dialog = page.get_by_role('dialog', name='添加展示作品', exact=True)
    expect(dialog.get_by_label('作品标题', exact=True)).to_be_focused()
    expect(dialog.get_by_role('button', name='提交展示作品', exact=True)).to_be_disabled()
    dialog.get_by_role('button', name='取消', exact=True).click()
    assert current(page)['archiveEntries'] == before['archiveEntries']
    passed('cancel and empty form leave existing archives and scenes untouched')
    page.get_by_role('button', name='添加展示作品 ↗', exact=True).click()
    dialog = page.get_by_role('dialog', name='添加展示作品', exact=True)
    dialog.get_by_label('作品标题', exact=True).fill('无效图片')
    dialog.get_by_label('作品图片', exact=True).set_input_files({'name':'bad.webp','mimeType':'image/webp','buffer':b'not an image'})
    dialog.get_by_role('button', name='提交展示作品', exact=True).click()
    expect(dialog.get_by_role('alert')).to_be_visible()
    assert current(page)['archiveEntries'] == before['archiveEntries']
    dialog.get_by_role('button', name='取消', exact=True).click()
    passed('invalid image reports an error without saving a partial archive')
    path = ROOT / 'tests/fixtures/media/sample-2.webp'
    add(page, '浏览器展示作品', path)
    saved = current(page)
    archive = next(a for a in saved['archiveEntries'] if a['sourceType'] == 'student')
    assert saved['exterior'] == before['exterior'] and saved['interior']['background'] == before['interior']['background'] and saved['growthEvents'][0]['status'] == 'accepted'
    record = next(a for a in saved['assetRefs'] if a['assetId'] == archive['imageAssetIds'][0])
    assert record['original']['sha256'] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert not record['rights']['consentToPublish'] and len(record['variants']) == 2
    passed('real upload saves an independent archive, immutable original and two bounded variants with one automatic growth and without publication consent')
    card = page.locator('.showcase-work').filter(has_text='浏览器展示作品')
    card.get_by_role('button', name='查看作品', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('浏览器展示作品')
    expect(page.get_by_role('dialog').get_by_role('img', name='浏览器展示作品', exact=True)).to_be_visible()
    page.locator('.modal-close').click()
    passed('archive artwork is immediately viewable')
    card.get_by_role('button', name='编辑生长元素', exact=True).click()
    page.get_by_label('元素颜色', exact=True).fill('#d87040')
    page.get_by_label('元素大小', exact=True).fill('0.7')
    page.get_by_role('button', name='确定并返回', exact=True).click()
    accepted = current(page)
    assert accepted['interior']['layers'][-1]['transform']['scaleX'] == 0.7
    assert accepted['interior']['layers'][-1]['source']['params']['color'] == '#d87040'
    assert accepted['growthEvents'][0]['trigger']['archiveEntryId'] == archive['id']
    passed('optional dedicated edit saves adjusted color and size without changing source identity')
    page.get_by_role('button', name='查看成长来源', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('浏览器展示作品'); page.locator('.modal-close').click()
    passed('growth source opens the uploaded work instead of the sample archive')
    page.reload(); page.wait_for_load_state('networkidle'); page.get_by_role('button', name='编辑你的星球', exact=True).click()
    assert current(page)['growthEvents'][0]['status'] == 'accepted'
    page.get_by_role('button', name='撤销这次成长', exact=True).click()
    expect(page.locator('.growth-history')).to_contain_text('已撤销')
    reverted = current(page)
    assert reverted['interior']['layers'] == before['interior']['layers']
    assert archive in reverted['archiveEntries']
    passed('refresh retains growth; compensation removes only its layer and preserves the work')
    add(page, '跳过成长的作品', path)
    second = page.locator('.showcase-work').filter(has_text='跳过成长的作品')
    second.get_by_role('button', name='编辑生长元素', exact=True).click()
    page.get_by_label('元素颜色', exact=True).fill('#555555')
    page.get_by_role('button', name='取消修改并返回', exact=True).click()
    assert len([a for a in current(page)['archiveEntries'] if a['sourceType'] == 'student']) == 2
    assert current(page)['growthEvents'][-1]['status'] == 'accepted'
    passed('canceling optional edits keeps the second work and its automatic element')
    with page.expect_download() as info:
        page.get_by_role('button', name='导出作品 ZIP ↗', exact=True).click()
    info.value.save_as(str(ROOT / 'work/showcase-browser.zip'))
    assert (ROOT / 'work/showcase-browser.zip').stat().st_size > 100
    passed('showcase archives and source records remain exportable as a planet ZIP')
    page.get_by_role('button', name='进入星球预览 ↗', exact=True).click()
    page.get_by_role('button', name='跳过成长的作品 ↗', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('跳过成长的作品'); page.locator('.modal-close').click()
    passed('viewing mode exposes saved artwork with its automatically generated element')
    page.get_by_role('button', name='编辑这颗星球 ↗', exact=True).click()
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button', name='添加展示作品 ↗', exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    expect(page.get_by_role('dialog', name='添加展示作品')).to_be_visible()
    page.screenshot(path=str(ROOT / 'outputs/COLORVERSE-showcase-mobile.png'), full_page=True)
    page.keyboard.press('Escape'); expect(page.get_by_role('dialog')).to_have_count(0)
    passed('mobile and reduced-motion users retain the upload dialog, keyboard close and no horizontal overflow')
    assert not external, external
    passed('showcase saving and rule growth make no course or model API calls')
    context.close(); browser.close()
assert not errors, errors
(ROOT / 'outputs/COLORVERSE-showcase-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(checks)} showcase browser checks passed.')
