"""Deterministic synthetic artwork and media fixtures. No student artwork is claimed."""
from pathlib import Path
import math, random, wave, struct
from PIL import Image, ImageDraw, ImageFilter

root=Path(__file__).resolve().parents[1]
out=root/'apps/web/public/demo'
out.mkdir(parents=True,exist_ok=True)
palettes=[('#F4A76D','#AC5359','#F6E0AB'),('#96D7B9','#335F69','#E1EABB'),('#69B9D7','#234C81','#CCD4E9'),('#B39EDB','#645389','#EFBCDF'),('#ABD3E7','#567D98','#EAEDF3'),('#C2BBB0','#5D646B','#DDE2DB')]
def rgb(h):return tuple(bytes.fromhex(h[1:]))
for i,palette in enumerate(palettes):
    rng=random.Random(420+i); colors=list(map(rgb,palette))
    art=Image.new('RGBA',(512,512));d=ImageDraw.Draw(art)
    d.ellipse((56,54,456,454),fill=(*colors[0],255))
    inside=Image.new('RGBA',(512,512));g=ImageDraw.Draw(inside)
    for y in range(50,460,4):
        t=(y-50)/410;c=tuple(int(colors[0][k]*(1-t)+colors[1][k]*t)for k in range(3))
        g.rectangle((30,y,480,y+4),fill=(*c,255))
    if i==0:
        for j in range(18):
            y=100+j*19;pts=[(x,y+18*math.sin(x*.014+j))for x in range(0,513,12)]+[(512,512),(0,512)]
            g.polygon(pts,fill=(*colors[j%3],rng.randint(35,110)))
        g.ellipse((120,135,295,310),fill=(*colors[2],200))
    elif i==1:
        for j in range(30):
            x=rng.randint(60,460);y=rng.randint(70,450);g.ellipse((x-15,y-80,x+15,y+60),fill=(*colors[j%3],145));g.line((x,y-55,x,y+50),fill=(*colors[2],110),width=2)
    elif i==2:
        for j in range(25):
            y=80+j*14;pts=[(x,y+30*math.sin(x*.019+j*.4))for x in range(0,513,4)]
            g.line(pts,fill=(*colors[j%3],140),width=rng.randint(3,12))
    elif i==3:
        for j in range(25):
            x=rng.randint(10,440);y=rng.randint(40,440);r=rng.randint(20,90);g.ellipse((x-r,y-r,x+r,y+r),fill=(*colors[j%3],75))
        inside=inside.filter(ImageFilter.GaussianBlur(8));g=ImageDraw.Draw(inside)
        for j in range(45):
            x,y=rng.randint(80,440),rng.randint(70,440);g.ellipse((x,y,x+2,y+2),fill=(255,230,245,200))
    elif i==4:
        for j in range(35):
            pts=[(rng.randint(40,480),rng.randint(40,480))for _ in range(3)];g.polygon(pts,fill=(*colors[j%3],rng.randint(35,150)));g.line(pts+[pts[0]],fill=(*colors[2],70),width=1)
    else:
        for j in range(50):
            x,y=rng.randint(30,480),rng.randint(30,480);r=rng.randint(2,25);g.ellipse((x-r,y-r,x+r,y+r),fill=(*colors[1],rng.randint(20,80)))
        g.arc((100,100,425,425),100,320,fill=(*colors[2],140),width=12)
    mask=Image.new('L',(512,512));ImageDraw.Draw(mask).ellipse((56,54,456,454),fill=255)
    art=Image.composite(inside,Image.new('RGBA',(512,512)),mask)
    grain=Image.new('RGBA',(512,512));gd=ImageDraw.Draw(grain)
    for j in range(6000):
        x,y=rng.randrange(512),rng.randrange(512)
        if mask.getpixel((x,y)):gd.point((x,y),fill=(255,255,255,rng.randint(4,25)))
    art=Image.alpha_composite(art,grain)
    if i in (0,2):
        ring=Image.new('RGBA',(512,512));rd=ImageDraw.Draw(ring);rd.ellipse((10,205,502,328),outline=(*colors[2],170),width=6);rd.ellipse((15,209,497,324),outline=(*colors[2],65),width=2)
        art=Image.alpha_composite(art,ring.rotate(-25,resample=Image.Resampling.BICUBIC))
    art.save(out/f'body-{i}.png')
    art.resize((256,256),Image.Resampling.LANCZOS).save(out/f'body-{i}-thumb.webp')
    room=Image.new('RGB',(1600,900));rd=ImageDraw.Draw(room)
    for y in range(900):
        t=y/900;c=tuple(int((7+k*3)*(1-t)+colors[1][k]*t*.6)for k in range(3));rd.line((0,y,1600,y),fill=c)
    rd.ellipse((950,150,1190,390),fill=tuple(int(c*.65)for c in colors[0]))
    for j in range(4):
        y=500+j*90;pts=[(x,y+55*math.sin(x*.004+j+i))for x in range(0,1601,10)]+[(1600,900),(0,900)]
        rd.polygon(pts,fill=tuple(int(c*(.22+j*.07))for c in colors[1]))
    for j in range(250):
        x,y=rng.randrange(1600),rng.randrange(650);rd.ellipse((x,y,x+1,y+1),fill=tuple(int(c*.7)for c in colors[2]))
    room.save(out/f'room-{i}.png')

fixtures=root/'tests/fixtures/media';fixtures.mkdir(parents=True,exist_ok=True)
for i in range(10):
    image=Image.open(out/f'body-{i%6}.png')
    ext=['png','jpg','webp'][i%3]
    if i==9:image=image.resize((2048,2048))
    if ext=='jpg':image=image.convert('RGB')
    image.save(fixtures/f'sample-{i}.{ext}')
with wave.open(str(fixtures/'sample.wav'),'wb')as wav:
    wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000)
    wav.writeframes(b''.join(struct.pack('<h',int(1000*math.sin(2*math.pi*220*n/8000)))for n in range(8000)))
print('Generated 6 distinct demo paintings, interiors, thumbnails, 10 synthetic image fixtures and WAV.')
