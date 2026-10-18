"""Original procedural miniatures; no recordings, samples or borrowed melodies.
CC0-1.0: generated audio and this score may be redistributed with Colorverse.
Requires numpy. Reproducible 32-second stereo loops at 22050 Hz.
"""
from pathlib import Path
import wave,json
import numpy as np
rate=22050;duration=32;n=rate*duration
out=Path('apps/web/public/music');out.mkdir(parents=True,exist_ok=True)
def freq(note):return 440*2**((note-69)/12)
def make(name,chords,melody,pace,kind):
 audio=np.zeros((n,2),dtype=np.float64)
 def note(midi,start,length,gain,pan,pad=False):
  count=int(length*rate);t=np.arange(count)/rate;f=freq(midi)
  attack=1.3 if pad else .025;release=1.8 if pad else .65
  env=np.minimum(t/attack,1)*np.minimum((length-t)/release,1)
  if not pad:env*=np.exp(-t*(1.1 if kind!='warm' else .8))
  tone=(np.sin(2*np.pi*f*t)+.17*np.sin(2*np.pi*f*2*t)+.04*np.sin(2*np.pi*f*3*t))*env*gain
  indexes=(int(start*rate)+np.arange(count))%n
  for delay,wet in [(0,1),(.31,.19),(.62,.08)]:
   audio[(indexes+int(delay*rate))%n,0]+=tone*wet*np.sqrt((1-pan)/2)
   audio[(indexes+int(delay*rate))%n,1]+=tone*wet*np.sqrt((1+pan)/2)
 for bar,chord in enumerate(chords):
  for j,m in enumerate(chord):note(m,bar*8,9,.034,(j-1)*.3,True)
  note(chord[0]-12,bar*8,7.8,.026,0,True)
 for i,m in enumerate(melody):note(m,i*pace,3.5,.07 if kind=='roam' else .053,np.sin(i*1.7)*.35)
 # A periodic mix avoids hard loop boundaries. Conservative headroom plus player volume.
 peak=np.max(np.abs(audio));audio*=.55/max(peak,.55)
 with wave.open(str(out/(name+'.wav')),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((audio*32767).astype('<i2').tobytes())
 return {'file':name+'.wav','duration':duration,'peak':float(np.max(np.abs(audio))),'rms':float(np.sqrt(np.mean(audio**2)))}
results=[
 make('quiet-universe',[[48,55,62],[45,52,59],[41,48,55],[43,50,57]],[74,79,76,71,72,67,74,69],4,'quiet'),
 make('light-roaming',[[50,57,64],[55,62,69],[47,54,62],[45,52,59]],[74,78,81,76,79,83,78,74,71,76,81,78,73,76,69,74],2,'roam'),
 make('warm-afternoon',[[48,55,64],[53,60,67],[45,52,60],[43,50,59]],[72,76,79,74,77,81,76,72,69,72,76,71,74,79,72,67],2,'warm')]
Path('outputs/music-generation.json').write_text(json.dumps(results,indent=2))
print('Generated three original 32-second loops; no third-party samples.')
