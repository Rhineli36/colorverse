"""Project cloud pixels across zoom/pan to detect a fixed background."""
import io,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'work/python-deps'))
from playwright.sync_api import sync_playwright,expect
from PIL import Image,ImageStat
expect.set_options(timeout=15000)
URL=os.environ.get('COLORVERSE_TEST_URL','http://127.0.0.1:5173')
checks,errors=[],[]
def passed(message): checks.append(message);print('PASS:',message,flush=True)
def snapshot(page):
    c=page.locator('canvas')
    return Image.open(io.BytesIO(c.screenshot())).convert('RGB'),json.loads(c.get_attribute('data-camera'))
def mean(image,x,y): return ImageStat.Stat(image.crop((round(x)-3,round(y)-3,round(x)+4,round(y)+4))).mean
def compare(before,after):
    a,c0=before;b,c1=after;base=min(a.width/1600,a.height/900)
    projected,stationary=[],[]
    for y in range(280,660,30):
        for x in range(240,1300,35):
            wx=(x-a.width/2-c0['x']*base)/(base*c0['zoom'])+800
            wy=(y-a.height/2-c0['y']*base)/(base*c0['zoom'])+450
            px=b.width/2+(wx-800)*base*c1['zoom']+c1['x']*base
            py=b.height/2+(wy-450)*base*c1['zoom']+c1['y']*base
            if not(220<px<1350 and 230<py<740):continue
            old=mean(a,x,y)
            if sum(old)<60 or max(old)>110:continue
            projected.append(sum(abs(v-w) for v,w in zip(old,mean(b,px,py)))/3)
            stationary.append(sum(abs(v-w) for v,w in zip(old,mean(b,x,y)))/3)
    assert len(projected)>20,len(projected)
    mapped=sum(projected)/len(projected);fixed=sum(stationary)/len(stationary)
    assert mapped<5 and mapped<fixed*.72,(mapped,fixed)
    return {'mapped_error':round(mapped,3),'fixed_error':round(fixed,3),'samples':len(projected)}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome' if os.name=='nt' else None,args=['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1650,'height':1000},reduced_motion='reduce')
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL);page.wait_for_load_state('networkidle')
    expect(page.locator('canvas')).to_have_attribute('data-scene-ready','true')
    initial=snapshot(page);box=page.locator('canvas').bounding_box()
    generation=page.locator('canvas').get_attribute('data-scene-generation')
    page.mouse.move(box['x']+825,box['y']+460);page.mouse.wheel(0,-230);page.wait_for_timeout(250)
    zoomed=snapshot(page);zoom_pixels=compare(initial,zoomed)
    passed('cloud pixels enlarge with the same world transform as planets')
    page.screenshot(path=str(ROOT/'outputs/COLORVERSE-atmosphere-zoom.png'),full_page=True)
    page.mouse.move(box['x']+100,box['y']+650);page.mouse.down()
    page.mouse.move(box['x']+190,box['y']+605,steps=10);page.mouse.up();page.wait_for_timeout(250)
    pan_pixels=compare(zoomed,snapshot(page))
    passed('cloud pixels translate with the camera during empty-space dragging')
    assert page.locator('canvas').get_attribute('data-scene-generation')==generation
    base=min(box['width']/1600,box['height']/900)
    assert abs(float(page.locator('canvas').get_attribute('data-background-scale'))-base*snapshot(page)[1]['zoom'])<1e-8
    passed('camera navigation keeps the renderer and textures intact')
    page.mouse.wheel(0,1800);page.wait_for_timeout(250)
    assert json.loads(page.locator('canvas').get_attribute('data-camera'))['zoom']>=.04
    assert page.locator('canvas').get_attribute('data-universe-atmosphere')=='true'
    assert not errors,errors
    passed('very distant view remains covered by reusable tiled textures without errors')
    browser.close()
(ROOT/'outputs/COLORVERSE-background-camera-test-report.json').write_text(json.dumps({'checks':checks,'errors':errors,'zoom_pixels':zoom_pixels,'pan_pixels':pan_pixels},ensure_ascii=False,indent=2),encoding='utf-8')
