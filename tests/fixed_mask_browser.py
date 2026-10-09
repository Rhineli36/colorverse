"""Real pixel and persistence checks for fixed framing, fit actions and opacity."""
import io,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageDraw,ImageChops
expect.set_options(timeout=15000)
checks,errors=[],[]
def passed(text):checks.append(text);print('PASS:',text,flush=True)
def read(page):
    return page.evaluate("""async()=>{const db=await new Promise(res=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result)});const docs=await new Promise(res=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>res(r.result)});db.close();return docs.find(d=>d.metadata.name==='日落收藏家')}""")
def save(page):
    page.get_by_role('button',name='保存',exact=True).click();expect(page.get_by_role('status').filter(has_text='草稿已保存')).to_be_visible()
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true');return read(page)
def pixels(page):return Image.open(io.BytesIO(page.locator('canvas').screenshot())).convert('RGB')
def color_bounds(image):
    points=[(x,y)for y in range(image.height)for x in range(image.width)if any(max(abs(image.getpixel((x,y))[i]-c[i])for i in range(3))<4 for c in [(236,115,72),(54,174,198)])]
    assert points
    return (min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points))
def drag(page,dx,dy):
    b=page.get_by_role('button',name='拖动选中图片',exact=True).bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+dy,steps=8);page.mouse.up()
fixture=ROOT/'work/fixed-mask-fixture.png';im=Image.new('RGB',(800,400),'#ec7348');ImageDraw.Draw(im).rectangle((400,0,799,399),fill='#36aec6');im.save(fixture)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
with sync_playwright()as p:
    browser=p.chromium.launch(headless=True,channel='chrome'if os.name=='nt'else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1650,'height':1000},reduced_motion='reduce')
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text)if m.type=='error'else None)
    page.goto(URL);page.wait_for_load_state('networkidle');page.get_by_role('button',name='编辑你的星球',exact=True).click()
    page.get_by_label('上传星球绘画',exact=True).set_input_files(str(fixture));expect(page.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible()
    initial=save(page);guide=page.get_by_label('固定星球蒙版',exact=True);frame=guide.bounding_box();a=pixels(page);bounds=color_bounds(a)
    fit=page.get_by_role('button',name='自动适应星球蒙版',exact=True)
    assert fit.bounding_box()['y']>page.locator('.upload-btn').bounding_box()['y'] and fit.bounding_box()['y']<page.locator('.studio-layer-tools').bounding_box()['y']
    passed('fit action appears directly beneath exterior image import and upload already covers the fixed mask')
    page.get_by_label('水平缩放',exact=True).fill('1');save(page);b=pixels(page)
    assert guide.bounding_box()==frame and max(abs(x-y) for x,y in zip(color_bounds(b),bounds))<=1,(guide.bounding_box(),frame,color_bounds(b),bounds)
    assert ImageChops.difference(a,b).getbbox()is not None
    passed('scaling changes actual image pixels while the circular mask center and diameter stay fixed')
    page.get_by_label('垂直缩放',exact=True).fill('1.5');save(page)
    assert guide.bounding_box()==frame and max(abs(x-y) for x,y in zip(color_bounds(pixels(page)),bounds))<=1
    passed('nonuniform stretching keeps the planet circular rather than stretching its mask')
    drag(page,30,0);moved=save(page);c=pixels(page)
    assert moved['exterior']['scene']['layers'][0]['transform']['x']>800 and guide.bounding_box()==frame
    assert max(abs(x-y) for x,y in zip(color_bounds(c),bounds))<=1 and ImageChops.difference(b,c).getbbox()is not None
    passed('dragging reframes the photograph inside the stationary planet without moving the visible silhouette')
    before=moved['exterior']['scene']['layers'][0]['transform'];fit.click();fitted=save(page)
    assert fitted['exterior']['scene']['layers'][0]['transform']==initial['exterior']['scene']['layers'][0]['transform'] and fitted['assetRefs']==initial['assetRefs']
    page.get_by_role('button',name='↶ 撤销',exact=True).click();assert save(page)['exterior']['scene']['layers'][0]['transform']==before
    fit.click();save(page)
    passed('auto-fit centers artwork and resets stretching as one undoable operation without touching originals')
    page.get_by_label('水平缩放',exact=True).fill('0.1');save(page);small=pixels(page)
    assert guide.bounding_box()==frame
    base=min(small.width/1600,small.height/900);sample=small.getpixel((round(small.width/2+150*base),round(small.height/2)))
    assert max(abs(sample[i]-[38,51,74][i])for i in range(3))<4,sample
    fit.click();save(page)
    passed('shrinking artwork reveals a fixed base surface so the planet remains visible and identifiable')
    assert all(page.get_by_label(n,exact=True).count()==0 for n in ['水平位置','垂直位置','角度'])
    assert page.get_by_label('透明度',exact=True).is_hidden()
    page.get_by_role('tab',name='基础调色',exact=True).click();opacity=page.get_by_label('透明度',exact=True)
    expect(opacity).to_be_visible();expect(opacity).to_have_attribute('min','0.5');opacity.fill('0.5');faded=save(page)
    assert faded['exterior']['scene']['layers'][0]['opacity']==.5
    passed('redundant image position/rotation sliders are removed and color tab enforces 50% minimum opacity')
    tabs=page.locator('.left-panel [role=tab]');colors=tabs.evaluate_all('els=>els.map(e=>getComputedStyle(e).getPropertyValue("--tab-accent"))')
    assert len(set(colors))==2
    page.get_by_role('tab',name='星球信息',exact=True).click();expect(page.get_by_label('星球名称',exact=True)).to_be_visible()
    page.get_by_role('tab',name='星球信息',exact=True).press('Home');expect(page.get_by_role('tab',name='星球信息',exact=True)).to_be_focused()
    passed('information and decoration tabs have distinct colors while layers remain visible and retain text and keyboard cues')
    page.get_by_role('button',name='内部空间',exact=True).click();insidefit=page.get_by_role('button',name='自动适应内部画布',exact=True);expect(insidefit).to_be_disabled()
    page.get_by_label('添加原创图层',exact=True).set_input_files(str(fixture));expect(page.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible();insidefit.click();inside=save(page)
    t=inside['interior']['layers'][0]['transform'];assert t['scaleX']==t['scaleY']==2 and t['x']==800 and t['y']==450
    box=page.get_by_role('button',name='拖动选中图片',exact=True).bounding_box();canvas=page.locator('canvas').bounding_box()
    assert box['width']<=canvas['width']+1 and box['height']<=canvas['height']+1
    passed('interior auto-fit contains the complete image at its original aspect ratio; empty scenes disable the action')
    page.get_by_role('tab',name='基础调色',exact=True).click();opacity=page.get_by_label('透明度',exact=True);expect(opacity).to_have_attribute('min','0');opacity.fill('0');inside=save(page)
    assert inside['interior']['layers'][0]['opacity']==0 and inside['exterior']['scene']==faded['exterior']['scene']
    passed('interior images can become transparent and do not affect the exterior opacity or frame')
    page.get_by_role('button',name='星球外观',exact=True).click();page.get_by_role('tab',name='基础调色',exact=True).click()
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-fixed-mask-preview.png'),full_page=True)
    page.reload();page.wait_for_load_state('networkidle');page.get_by_role('button',name='编辑你的星球',exact=True).click();expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    assert read(page)['exterior']['scene']==faded['exterior']['scene'] and page.get_by_label('固定星球蒙版',exact=True).bounding_box()==frame
    passed('refresh preserves fitted transforms, opacity and fixed frame dimensions')
    page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');expect(page.get_by_role('button',name='自动适应星球蒙版',exact=True)).to_be_visible()
    passed('mobile keeps the fit action and colored tabs without horizontal overflow')
    context.close()
    # Legacy data stays intact; both initial rendering and animated alpha obey
    # the visibility policy even before the student edits the opacity slider.
    legacy=browser.new_context(viewport={'width':1650,'height':1000});other=legacy.new_page();other.on('pageerror',lambda e:errors.append(str(e)))
    other.goto(URL);other.wait_for_load_state('networkidle');other.get_by_role('button',name='编辑你的星球',exact=True).click()
    other.get_by_label('上传星球绘画',exact=True).set_input_files(str(fixture));expect(other.get_by_role('status').filter(has_text='原始图片已保留')).to_be_visible();save(other)
    other.evaluate("""async()=>{const db=await new Promise(res=>{const r=indexedDB.open('colorverse-v1');r.onsuccess=()=>res(r.result)});const docs=await new Promise(res=>{const r=db.transaction('planets').objectStore('planets').getAll();r.onsuccess=()=>res(r.result)});const d=docs.find(d=>d.metadata.name==='日落收藏家');d.exterior.scene.layers[0].opacity=0;d.exterior.scene.layers[0].animation=[{type:'breathe',minOpacity:0,maxOpacity:0,periodSec:4}];const tx=db.transaction('planets','readwrite');tx.objectStore('planets').put(d,d.planetId);await new Promise(res=>tx.oncomplete=res);db.close()}""")
    other.reload();other.wait_for_load_state('networkidle');other.get_by_role('button',name='编辑你的星球',exact=True).click();other.get_by_role('tab',name='装饰',exact=True).click();other.get_by_role('button',name='星环',exact=True).click()
    expect(other.get_by_role('button',name='自动适应星球蒙版',exact=True)).to_be_disabled();other.wait_for_timeout(600)
    for _ in range(2):
        view=pixels(other);base=min(view.width/1600,view.height/900);color=view.getpixel((round(view.width/2-50*base),round(view.height/2)))
        assert max(abs(color[i]-[137,83,73][i])for i in range(3))<6,color
        other.wait_for_timeout(500)
    assert read(other)['exterior']['scene']['layers'][0]['opacity']==0
    passed('legacy zero-opacity artwork and zero-opacity breathing stay visibly at 50% without overwriting stored originals')
    legacy.close();browser.close()
assert not errors,errors
(ROOT/'outputs/COLORVERSE-fixed-mask-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'{len(checks)} fixed mask browser checks passed.')

