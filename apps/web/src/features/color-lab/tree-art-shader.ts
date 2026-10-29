// Region masks are semantic hints. Original image chroma refines fine leaves and sky holes.
export const treeArtFragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uArt, uRegions;
uniform vec2 uFit;
uniform vec3 uPrimary, uAuxiliary, uAccent, uBark, uGround, uBackground, uTarget;
uniform float uAccentArea, uAuxiliaryArea, uTime, uWind, uContext, uExtract;
uniform float uHue, uSaturation, uBrightness;
vec3 hsv(vec3 c) {
  vec4 K=vec4(0.,-1./3.,2./3.,-1.);
  vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y),e=1.e-7;
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);
}
vec3 rgb(vec3 c) {
  vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.);
  return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);
}
vec3 recolor(vec3 original, vec3 target, vec3 reference, float preserve) {
  vec3 a=hsv(original),t=hsv(target),r=hsv(reference);
  float shift=fract(t.x-r.x+.5)-.5;
  float saturation=clamp(a.y+t.y-r.y,0.,1.);
  float value=clamp(a.z*pow(max(t.z,.01)/max(r.z,.01),.65),0.,1.);
  vec3 result=rgb(vec3(fract(a.x+shift+1.),saturation,value));
  return mix(result,original,preserve);
}
vec3 backdrop(vec3 original) {
  vec3 a=hsv(original), t=hsv(uBackground), r=hsv(vec3(41.,67.,93.)/255.);
  float shift=fract(t.x-r.x+.5)-.5;
  a.x=fract(a.x+shift+1.);
  a.y=clamp(a.y*(t.y+.12)/(r.y+.12),0.,1.);
  // Keep cloud highlights and mountain detail instead of clipping their values.
  a.z=clamp(a.z+(t.z-r.z)*a.z*(1.-a.z)*2.,0.,1.);
  return rgb(a);
}
vec3 leaves(vec3 original,vec3 target,vec3 reference) {
  vec3 a=hsv(original),t=hsv(target);
  vec3 tinted=rgb(vec3(fract(t.x+(a.x-.10)*.22+1.),t.y*(.8+.2*a.y),clamp(t.z*pow(max(a.z,.01)/.85,.8),0.,1.)));
  return mix(original,tinted,clamp(length(target-reference)*5.,0.,1.));
}
void main() {
  vec2 uv=(vUv-.5)/uFit+.5;
  vec3 color=vec3(.045,.067,.095);
  bool inside=all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));
  if(inside) {
    vec3 art=texture2D(uArt,uv).rgb, m=texture2D(uRegions,uv).rgb;
    vec3 a=hsv(art);
    float sky=smoothstep(.02,.10,art.b-art.r);
    float canopy=smoothstep(.39,.43,uv.y)*(1.-smoothstep(.83,.86,uv.x))*smoothstep(.12,.15,uv.x);
    float warm=smoothstep(.12,.27,art.r-art.b)*smoothstep(.30,.56,a.y);
    float leaf=clamp(max(m.r,warm*canopy)*warm*canopy,0.,1.);
    float trunk=m.g*(1.-leaf)*(1.-sky);
    float island=m.b*(1.-leaf)*(1.-sky);
    float background=clamp(1.-max(max(m.r,m.g),m.b),0.,1.);
    background=max(background,sky)*(1.-leaf);
    // Stable, softly blended patches follow existing leaf colors and local positions.
    float rank=fract((.15-a.x)*5.+uv.x*1.7+uv.y*2.3+.1*sin(uv.x*93.+sin(uv.y*59.)*2.));
    float accent=1.-smoothstep(uAccentArea-.035,uAccentArea+.035,rank);
    float auxiliary=(1.-accent)*(1.-smoothstep(uAccentArea+uAuxiliaryArea-.035,uAccentArea+uAuxiliaryArea+.035,rank));
    vec3 target=mix(mix(uPrimary,uAuxiliary,auxiliary),uAccent,accent);
    vec3 reference=mix(mix(vec3(.9098,.6784,.2314),vec3(.851,.4588,.1569),auxiliary),vec3(.5843,.3137,.2118),accent);
    // Identity at the default palette keeps the approved autumn artwork untouched.
    vec3 foliage=leaves(art,target,reference);
    vec3 f=hsv(foliage); f.x=fract(f.x+uHue+1.);f.y=clamp(f.y*uSaturation,0.,1.);f.z=clamp(f.z*uBrightness,0.,1.);
    color=mix(art,rgb(f),leaf);
    color=mix(color,recolor(art,uBark,vec3(.4431,.3176,.2314),0.),trunk);
    color=mix(color,recolor(art,uGround,vec3(.4118,.4549,.2863),0.),island);
    color=mix(color,backdrop(art),background);
    if(uTime>0.&&uWind>0.) {
      vec2 grid=uv*vec2(18.,10.); vec2 cell=floor(grid);
      vec2 point=vec2(.5)+.28*sin(cell.yx*3.1+uTime*.22);
      float dust=(1.-smoothstep(.012,.035,length(fract(grid)-point)))*.07*uWind;
      color+=dust;
    }
  }
  if(uExtract>.5) color=vec3(.502);
  if(uContext>.5) {
    // Independent opaque teaching leaf, rendered last; same sRGB on both sides.
    vec2 q=(uv-vec2(.62,.61))/vec2(.017,.031);
    if(uExtract>.5) q=(vUv-.5)/vec2(.035,.055);
    float shape=abs(q.x)+q.y*q.y;
    if(shape<1.16) color=vec3(.94);
    if(shape<1.) color=uTarget;
  }
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;
