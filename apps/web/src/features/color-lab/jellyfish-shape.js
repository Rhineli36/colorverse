// Adapted without changing the seeded shape or GPU deformation from the supplied
// deep-sea-jellyfish/app.js (2026-10-28). Three.js is distributed under MIT.
import * as THREE from "three";
const TAU = Math.PI * 2;
const vertexShader = /* glsl */ `
  attribute vec4 aShape;
  attribute float aKind;
  attribute float aRandom;
  attribute float aAccentRank;
  attribute float aSize;
  uniform float uTime, uPixelRatio, uViewportHeight, uWaveTime, uGlow;
  uniform vec3 uWave;
  uniform vec2 uMouse;
  varying float vKind, vSeed, vLight, vDepth, vProgress, vAccentRank;
  const float PI=3.14159265359;
  void main(){
    float angle=aShape.x, u=aShape.y, v=aShape.z, seed=aShape.w;
    float t=uTime, k=aKind;
    float cycle=t*1.32;
    float breath=sin(cycle);
    float squeeze=.955-.075*breath;
    vec3 p=vec3(0.);
    float light=1.;
    if(k<.5 || (k>0.5 && k<2.5)){
      float polar=u*PI*.5;
      float radial=2.13*sin(polar);
      float ripple=sin(angle*24.+u*5.+t*.5)*pow(u,7.)*.055;
      float ribs=.022*cos(angle*16.+.08*sin(t));
      radial=(radial+ripple+ribs*sin(polar))*squeeze;
      float y=.25+1.63*cos(polar)*(1.+.065*breath);
      y+=pow(u,10.)*(.055*sin(angle*24.+t*.55)+.018*sin(angle*48.));
      if(k>.5 && k<1.5){radial*=.87; y-=.23+.06*u;}
      if(k>1.5){radial*=.94;y-=.105;light=1.28;}
      radial+=v*.035;
      y+=v*.025;
      p=vec3(cos(angle)*radial,y,sin(angle)*radial);
      light*=.68+.32*pow(abs(cos(angle*8.)),12.);
      light*=.88+.12*sin(cycle-u*.9+angle*.1);
    } else if(k<3.5){
      // Eight folded oral ribbons. Ribbon width, twists and frills remain volumetric.
      float lengthArm=3.1+seed*1.25;
      float lag=cycle-u*2.4;
      float twist=angle+u*5.5+.3*sin(t*.55-u*3.+angle);
      float centerR=.38+u*.48+.23*sin(u*8.+angle+t*.35)*u;
      float width=(.17+.13*sin(u*PI))*(1.-.74*pow(u,3.));
      float fold=sin(u*70.+v*5.+angle)*.045;
      p=vec3(cos(twist)*centerR,-.02-u*lengthArm,sin(twist)*centerR);
      p.x+=sin(lag+angle)*u*u*.38;
      p.z+=cos(t*.65-u*3.+angle)*u*.24;
      p.x+=cos(twist*2.+u*9.)*(v*width+fold);
      p.z+=sin(twist*2.+u*9.)*(v*width+fold);
      p.y+=sin(v*2.5+u*35.)*.065+sin(lag)*.11*u;
      p.x+=.2*sin(t*.42+u*4.)*u;
      light=1.02+.32*abs(v);
    } else if(k<4.5){
      // Delayed waves grow down the length of each independent tentacle.
      float len=3.2+seed*2.;
      float lag=cycle-u*3.7;
      float rootR=2.08*squeeze;
      float r=rootR*(1.-.3*sin(u*PI*.65));
      p=vec3(cos(angle)*r,.23-u*len,sin(angle)*r);
      p.x+=u*(.38*sin(u*8.-t*.65+angle*2.)+.32*sin(lag+angle));
      p.z+=u*(.35*cos(u*7.-t*.5+angle*2.)+.22*cos(lag));
      p.x+=u*u*.42*sin(t*.3+angle*.5);
      p.y+=.09*sin(angle*24.+t*.55)*(1.-u)+u*.12*sin(lag);
      p.x+=v*.009; p.z+=v*.009;
      light=.92+.22*sin(u*14.+seed*20.);
    } else if(k<5.5){
      float r=(2.13+.045*sin(angle*24.+t*.5)+v*.024)*squeeze;
      p=vec3(r*cos(angle),.25+.055*sin(angle*24.+t*.55)+u*.13,r*sin(angle));
      light=1.05;
    } else if(k<6.5){
      float r=(.42+u*1.42)*squeeze;
      p=vec3(r*cos(angle),.36+sin(u*PI)*.3+v*.018,r*sin(angle));
      p.y+=.025*sin(angle*8.+cycle);
      light=.9;
    } else {
      p=position;
      p.x+=.18*sin(t*.13+seed*40.)+.1*sin(t*.4+p.y);
      p.y+=.28*sin(t*.09+seed*100.);
      p.z+=.15*cos(t*.2+seed*20.);
      float nearJelly=exp(-length(p-vec3(0.,-.8,0.))*.65);
      p.xz+=nearJelly*.25*sin(cycle-length(p));
      light=.25+seed*.32;
    }
    if(k<6.5){
      p.x+=.13*sin(t*.36)+uMouse.x*.08;
      p.y+=.14*sin(cycle-.65)+.10*sin(t*.22);
      p.z+=.08*cos(t*.31)+uMouse.y*.04;
      float turn=.06*sin(t*.27);
      p.xz=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*p.xz;
      p.xy=mat2(.994,-.109,.109,.994)*p.xy;
    }
    float age=uTime-uWaveTime;
    if(age>0. && age<5.){
      vec3 delta=p-uWave;
      float dist=length(delta);
      float envelope=exp(-pow((dist-age*2.7)*1.9,2.))*exp(-age*.7);
      p+=normalize(delta+vec3(.0001))*.3*envelope*sin(dist*4.-age*5.);
    }
    vec4 mv=modelViewMatrix*vec4(p,1.);
    gl_Position=projectionMatrix*mv;
    float perspective=11./max(3.,-mv.z);
    float size=aSize*(uViewportHeight/850.)*uPixelRatio*perspective;
    gl_PointSize=clamp(size*2.7,1.5,16.*uPixelRatio);
    vKind=k;vSeed=aRandom;vLight=light;vDepth=-mv.z;vProgress=u;vAccentRank=aAccentRank;
  }
`;
const fragmentShader = /* glsl */ `
  uniform vec3 uColorA,uColorB,uColorC;
  uniform float uAccentMode,uWarmMode,uGray,uAccent,uHue,uSaturation,uBrightness,uGlow,uHalo;
  varying float vKind,vSeed,vLight,vDepth,vProgress,vAccentRank;
  vec3 hueShift(vec3 c,float a){
    vec3 axis=normalize(vec3(1.));
    return max(vec3(0.),c*cos(a)+cross(axis,c)*sin(a)+axis*dot(axis,c)*(1.-cos(a)));
  }
  vec3 linearToSRGB(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
  void main(){
    float radius=length(gl_PointCoord-.5)*2.;
    if(radius>1.)discard;
    float core=exp(-radius*radius*27.);
    float halo=exp(-radius*radius*5.)*.17*uGlow*uHalo;
    float alpha=(core*.73+halo)*vLight;
    vec3 col=uColorA;
    if(vKind<.5)col=mix(uColorA,uColorB,.13+.17*vProgress);
    else if(vKind<2.5)col=mix(uColorB,uColorA,.24);
    else if(vKind<3.5)col=mix(uColorC,uColorB,.18+.18*sin(vProgress*9.));
    else if(vKind<4.5)col=mix(uColorA,uColorC,.35+.5*vSeed);
    else if(vKind<5.5)col=mix(uColorA,uColorC,.2);
    else if(vKind<6.5)col=uColorB;
    else col=vec3(.17,.35,.43);
    if(vKind<2.5)col=mix(col,mix(uColorA,uColorC,.23),uWarmMode);
    if(vKind>2.5 && vKind<3.5)col=mix(col,uColorB,uWarmMode*.94);
    if(vKind>3.5 && vKind<4.5)col=mix(col,mix(uColorA,uColorB,step(.82,vSeed)),uWarmMode);
    if(vKind<6.5){
      vec3 base=mix(uColorA,uColorB,.08+.35*vSeed)*.72;
      // Stable ranked spatial field: highlights gather on oral ribbons, then expand.
      float mask=1.-smoothstep(uAccent-.002,uAccent+.002,vAccentRank);
      if(uAccent<.001)mask=0.;
      col=mix(col,mix(base,uColorC,mask),uAccentMode);
      col=hueShift(col,uHue);
      float lum=dot(col,vec3(.2126,.7152,.0722));
      col=max(vec3(0.),mix(vec3(lum),col,uSaturation));
      col=mix(col,vec3(dot(col,vec3(.2126,.7152,.0722))),uGray);
      col*=uBrightness;
    }
    float fog=exp(-max(vDepth-9.,0.)*.045);
    gl_FragColor=vec4(linearToSRGB(col)*fog,alpha);
  }
`;
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function generateGeometry(scale) {
  const pos = [],
    shape = [],
    kind = [],
    random = [],
    size = [];
  const add = (k, a, u, v, s, r, sz, x = 0, y = 0, z = 0) => {
    pos.push(x, y, z);
    shape.push(a, u, v, s);
    kind.push(k);
    random.push(r);
    size.push(sz);
  };
  for (let k = 0; k < 8; k++) {
    const rand = rng(20261028 + k * 179);
    const count = Math.round(
      [34000, 15000, 10500, 23500, 15000, 5500, 4500, 1100][k] * scale,
    );
    for (let i = 0; i < count; i++) {
      let a = rand() * TAU,
        u = rand(),
        v = rand() * 2 - 1,
        s = rand(),
        r = rand(),
        sz = 0.8 + rand() * 0.8;
      if (k === 0 || k === 1) {
        u = Math.acos(rand()) / (Math.PI * 0.5);
        sz = 0.85 + rand() * 0.75;
      }
      if (k === 2) {
        a = (Math.floor(rand() * 16) / 16) * TAU + (rand() - 0.5) * 0.015;
        u = Math.acos(rand()) / (Math.PI * 0.5);
        sz = 0.9 + rand() * 0.6;
      }
      if (k === 3) {
        const arm = Math.floor(rand() * 8);
        a = (arm / 8) * TAU;
        s = Math.sin(arm * 37.7) * 0.5 + 0.5;
        sz = 1 + rand() * 0.75;
      }
      if (k === 4) {
        const strand = Math.floor(rand() * 56);
        a = (strand / 56) * TAU;
        s = Math.sin(strand * 37.7) * 0.5 + 0.5;
        sz = 1.05 + rand() * 0.65;
      }
      if (k === 5) {
        u = rand() - 0.5;
        sz = 0.9 + rand() * 0.55;
      }
      if (k === 6) {
        u = Math.floor(rand() * 5) / 5;
        sz = 0.7 + rand() * 0.6;
      }
      if (k === 7) {
        add(
          k,
          a,
          u,
          v,
          s,
          r,
          0.6 + rand() * 1.8,
          (rand() - 0.5) * 22,
          (rand() - 0.5) * 18 - 1,
          (rand() - 0.5) * 16,
        );
        continue;
      }
      add(k, a, u, v, s, r, sz);
    }
  }
  const g = new THREE.BufferGeometry();
  // Sort a spatial preference once, then normalize ranks. The threshold therefore
  // controls the actual fraction of jellyfish particles, with no per-frame CPU loop.
  const order = [];
  const scores = new Float32Array(kind.length),
    ranks = new Float32Array(kind.length);
  for (let i = 0; i < kind.length; i++) {
    const k = kind[i],
      u = shape[i * 4 + 1],
      r = random[i];
    scores[i] =
      k === 3
        ? 0.02 + (1 - u) * 0.36 + r * 0.15
        : k === 6
          ? 0.25 + r * 0.22
          : k === 4
            ? 0.35 + r * 0.5
            : 0.52 + r * 0.7;
    ranks[i] = 1;
    if (k !== 7) order.push(i);
  }
  order.sort((a, b) => scores[a] - scores[b]);
  order.forEach((index, rank) => (ranks[index] = (rank + 0.5) / order.length));
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aShape", new THREE.Float32BufferAttribute(shape, 4));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute("aRandom", new THREE.Float32BufferAttribute(random, 1));
  g.setAttribute("aAccentRank", new THREE.Float32BufferAttribute(ranks, 1));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  // Bounds cover all GPU deformation and are identical for both views.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -1, 0), 25);
  return g;
}

export { vertexShader, fragmentShader, generateGeometry };
