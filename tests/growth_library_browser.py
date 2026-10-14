"""Thirty-four registered choices, legacy rendered presets and durable preview."""
import os, sys, json, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
from playwright.sync_api import sync_playwright, expect
from cloud_teacher_fixture import install_identity, enable_teacher
expect.set_options(timeout=15000)
checks, errors = [], []
URL = os.environ.get('COLORVERSE_TEST_URL', 'http://127.0.0.1:5174')
def passed(text): checks.append(text); print('PASS:', text, flush=True)
def current(page):
    return page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const docs=await new Promise(ok=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>ok(r.result)});db.close();return docs.find(d=>d.metadata.name==='日落收藏家');}""")
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome' if os.name=='nt' else None, args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce', accept_downloads=True)
    page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
    install_identity(page)
    page.goto(URL); page.wait_for_load_state('networkidle')
    enable_teacher(page)
    expect(page.get_by_role('button',name='编辑你的星球',exact=True)).to_be_visible()
    page.get_by_role('button',name='编辑你的星球',exact=True).click()
    page.get_by_role('button',name='添加展示作品 ↗',exact=True).click()
    dialog = page.get_by_role('dialog',name='添加展示作品',exact=True)
    dialog.get_by_label('作品图片',exact=True).set_input_files(str(ROOT/'tests/fixtures/media/sample-2.webp'))
    expect(dialog.get_by_label('作品标题',exact=True)).to_have_value('sample-2')
    expect(dialog.get_by_role('img',name='待上传作品预览',exact=True)).to_be_visible()
    expect(dialog.locator('figcaption')).to_contain_text('MiB')
    passed('file selection offers a real image preview, dimensions, size and editable suggested title')
    dialog.get_by_role('button',name='提交展示作品',exact=True).click(); expect(dialog).to_have_count(0)
    # Model a saved v2 proposal to verify compatibility with yesterday's data.
    page.evaluate("""async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>ok(r.result)});const tx=db.transaction('planets','readwrite'),store=tx.objectStore('planets');const docs=await new Promise(ok=>{const r=store.getAll();r.onsuccess=()=>ok(r.result)});const d=docs.find(d=>d.metadata.name==='日落收藏家'),e=d.growthEvents[0];e.status='proposed';e.acceptedAt=null;e.appliedRevision=null;e.provider.adapter='showcase-rules-v2';e.provider.promptVersion='rules-v2';d.interior.layers=d.interior.layers.filter(l=>l.id!==e.elements[0].layerId);d.revision++;store.put(d,d.planetId);await new Promise(ok=>tx.oncomplete=ok);db.close();}""")
    page.reload();page.wait_for_load_state('networkidle')
    page.get_by_role('button',name='编辑你的星球',exact=True).click()
    page.get_by_role('button',name='继续预览成长',exact=True).click()
    picker=page.get_by_role('group',name='选择成长造型',exact=True)
    expect(picker.get_by_role('button',name='选择',exact=False)).to_have_count(36)
    signatures=set(); canvas=page.locator('canvas')
    for name in ['微光花','晶体','发光叶片','月光蘑菇','彩色云朵','漂浮岛','星光种子','轨道石','星愿纸鹤','月光风铃','光帆飞船','流星风筝','色谱折扇','琉璃灯盏']:
        old=canvas.get_attribute('data-scene-generation')
        button=page.get_by_role('button',name='选择'+name,exact=True);button.click()
        expect(button).to_have_attribute('aria-pressed','true')
        page.wait_for_function('(old)=>{const c=document.querySelector("canvas");return c.dataset.sceneReady==="true"&&c.dataset.sceneGeneration!==old}',arg=old)
        signatures.add(hashlib.sha256(canvas.screenshot()).hexdigest())
    assert len(signatures)==14
    passed('legacy saved v2 proposal retains eight old and six new distinct preview shapes and remains manually confirmable')
    page.get_by_role('button',name='选择月光蘑菇',exact=True).click()
    page.get_by_label('成长大小',exact=True).fill('0.65')
    page.get_by_role('button',name='保存预览调整',exact=True).click()
    doc=current(page);assert doc['growthEvents'][-1]['elements'][0]['presetId']=='moon-mushroom'
    assert len(doc['interior']['layers'])==0
    passed('legacy preview adjustment remains durable without applying a second layer')
    page.reload();page.wait_for_load_state('networkidle');page.get_by_role('button',name='编辑你的星球',exact=True).click()
    page.get_by_role('button',name='继续预览成长',exact=True).click()
    expect(page.get_by_role('button',name='选择月光蘑菇',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_label('成长大小',exact=True)).to_have_value('0.65')
    passed('legacy preview recovers shape and size after refresh')
    page.get_by_role('button',name='接受并保存',exact=True).click()
    assert len(current(page)['interior']['layers'])==1
    expect(page.locator('.layer-list')).to_contain_text('月光蘑菇')
    passed('legacy manual acceptance still adds its own layer without affecting automatic growth')
    page.set_viewport_size({'width':390,'height':650})
    page.get_by_role('button',name='添加展示作品 ↗',exact=True).click()
    dialog=page.get_by_role('dialog',name='添加展示作品',exact=True)
    footer=dialog.locator('.showcase-dialog-footer').bounding_box()
    assert footer and footer['y']>=0 and footer['y']+footer['height']<=650
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    dialog.get_by_label('作品图片',exact=True).set_input_files(str(ROOT/'tests/fixtures/media/sample-2.webp'))
    footer=dialog.locator('.showcase-dialog-footer').bounding_box()
    assert footer['y']+footer['height']<=650
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-showcase-sticky-actions.png'),full_page=False)
    dialog.get_by_role('button',name='取消',exact=True).click()
    passed('upload actions stay inside a 390×650 viewport even after the image preview appears')
    # Nine real student archives exercise paged loading without injecting DB fixtures.
    for i in range(8):
        page.get_by_role('button',name='添加展示作品 ↗',exact=True).click()
        dialog=page.get_by_role('dialog',name='添加展示作品',exact=True)
        dialog.get_by_label('作品标题',exact=True).fill(f'分页作品 {i+1}')
        dialog.get_by_label('作品图片',exact=True).set_input_files(str(ROOT/'tests/fixtures/media/sample-2.webp'))
        dialog.get_by_role('button',name='提交展示作品',exact=True).click(); expect(dialog).to_have_count(0)
        page.get_by_role('button',name='编辑这颗星球 ↗',exact=True).click()
    expect(page.locator('.showcase-work')).to_have_count(8)
    page.get_by_role('button',name='下一页作品',exact=True).click()
    expect(page.locator('.showcase-work')).to_have_count(1)
    expect(page.locator('.showcase-work')).to_contain_text('sample-2')
    passed('gallery loads at most eight archive thumbnails per page and preserves older works')
    context.close(); browser.close()
assert not errors, errors
(ROOT/'outputs/COLORVERSE-growth-library-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} growth library browser checks passed.')
