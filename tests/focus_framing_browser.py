"""Gentle 38% focus, selective image resolution and unchanged navigation."""
import io,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageDraw
expect.set_options(timeout=15000)
checks,errors=[],[]
def passed(text):checks.append(text);print('PASS:',text,flush=True)
fixture=ROOT/'work/focus-artwork.png';image=Image.new('RGB',(2048,2048),'#ec7348');draw=ImageDraw.Draw(image)
for x in range(0,2048,16):draw.rectangle((x,0,x+7,2047),fill='#36aec6')
image.save(fixture)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1650,'height':1000})
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text)if m.type=='error'else None)
    page.goto(URL);page.wait_for_load_state('networkidle');page.get_by_role('button',name='编辑你的星球',exact=True).click()
    page.get_by_label('上传星球绘画',exact=True).set_input_files(str(fixture));expect(page.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible()
    page.get_by_role('button',name='保存',exact=True).click();expect(page.get_by_role('status').filter(has_text='草稿已保存')).to_be_visible()
    page.get_by_label('返回宇宙总览',exact=True).click();expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true');page.get_by_role('button',name='暂停运行',exact=True).click()
    generation=page.locator('canvas').get_attribute('data-scene-generation')
    page.evaluate("""()=>{window.__focusZooms=[];window.__focusSamples=setInterval(()=>window.__focusZooms.push(JSON.parse(document.querySelector('canvas').dataset.camera).zoom),50)}""")
    page.get_by_role('button',name='日落收藏家',exact=True).click()
    page.wait_for_function('Math.abs(JSON.parse(document.querySelector("canvas").dataset.camera).zoom-.38)<.0001')
    samples=page.evaluate('()=>{clearInterval(window.__focusSamples);return window.__focusZooms}')
    assert any(.27<z<.37 for z in samples) and max(samples)<=.38001,samples
    assert all(a<=b+.00001 for a,b in zip(samples,samples[1:]))
    passed('planet click approaches 38% through intermediate scales without overshooting or jumping to 125%')
    expect(page.locator('canvas')).to_have_attribute('data-focused-artwork-variant','display');expect(page.locator('canvas')).to_have_attribute('data-focused-artwork-width','2048')
    assert page.locator('canvas').get_attribute('data-scene-generation')==generation
    passed('only the selected body upgrades to its 2048px display texture without rebuilding the universe')
    canvas=page.locator('canvas');img=Image.open(io.BytesIO(canvas.screenshot())).convert('RGB');base=min(img.width/1600,img.height/900);radius=256*.9*1.18*.38*base
    center=(round(img.width/2),round(img.height/2));inside=img.getpixel((center[0],center[1]));outside=img.getpixel((round(center[0]+radius*1.15),center[1]))
    assert max(inside)>100 and max(abs(inside[i]-outside[i])for i in range(3))>40
    assert radius*2<img.width*.2
    passed('the real rendered planet occupies a restrained part of the view while surrounding space remains visible')
    page.get_by_role('button',name='薄荷来信',exact=True).click();page.wait_for_function('Math.abs(JSON.parse(document.querySelector("canvas").dataset.camera).zoom-.38)<.0001')
    expect(page.locator('.planet-peek h2')).to_have_text('薄荷来信');page.get_by_role('button',name='日落收藏家',exact=True).click()
    expect(canvas).to_have_attribute('data-focused-artwork-width','2048')
    passed('switching selected planets and returning to a cached display texture preserve the 38% framing')
    page.get_by_role('button',name='进入星球内部 ↗',exact=True).click();expect(page.get_by_role('heading',name='日落收藏家',exact=True)).to_be_visible();page.get_by_role('button',name='← 返回宇宙',exact=True).click()
    page.wait_for_function('Math.abs(JSON.parse(document.querySelector("canvas").dataset.camera).zoom-.38)<.0001')
    expect(page.get_by_role('button',name='继续运行',exact=True)).to_be_visible()
    passed('entering the interior and returning preserve focus and pause at the gentler distance')
    # Capture the unchanged demo instead of overwriting the user's actual art.
    page.get_by_role('button',name='编辑你的星球',exact=True).click();page.get_by_role('button',name='复位星球外观',exact=True).click();page.get_by_role('button',name='保存',exact=True).click();expect(page.get_by_role('status').filter(has_text='草稿已保存')).to_be_visible()
    page.get_by_label('返回宇宙总览',exact=True).click();page.get_by_role('button',name='日落收藏家',exact=True).click();page.wait_for_function('Math.abs(JSON.parse(document.querySelector("canvas").dataset.camera).zoom-.38)<.0001')
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-gentle-focus-preview.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    expect(page.get_by_role('button',name='进入星球内部 ↗',exact=True)).to_be_visible()
    passed('mobile retains viewing/entry controls with no horizontal overflow at the new focus distance')
    context.close();browser.close()
assert not errors,errors
(ROOT/'outputs/COLORVERSE-focus-framing-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} focus framing browser checks passed.')
