export const KnowledgeExampleImages: Record<
  string,
  {
    file: string;
    description: string;
    summary: string;
    observation: string;
    analysis: string;
    prompt: string;
  }
> = {
  K01: {
    file: "hue-ribbon",
    description: "青色空间中的多彩曲面与圆球",
    summary: "转动曲面与背景的色相，比较新的颜色联想。",
    observation:
      "曲面从橙红过渡到粉紫，周围是青蓝色背景。先看看你最先注意到哪一段颜色。",
    analysis:
      "曲面的高光和阴影让形体显得立体，橙红与青蓝的差异又让它从背景中跳出来。转动色相后，形状和构图保持不变，整幅画面的颜色组合却会带来新的联想。",
    prompt:
      "试出两组你喜欢的配色，分别为它们取一个心情名字。哪一组适合你的星球入口？说说你看到的颜色依据。",
  },
  K02: {
    file: "lightness-staircase",
    description: "光影交错的旋转阶梯与人物剪影",
    summary: "观察阶梯、亮窗与人物的明暗层次。",
    observation:
      "窗洞附近最明亮，人物剪影很小却很清楚。阶梯边缘的一道道亮部，把目光引向上方。",
    analysis:
      "亮墙、灰色台阶和深色阴影形成不同层次。人物与身后的亮面形成明显的明暗差异，因此不必占很大面积也能被看见。整体变亮或变暗时，也留意高光与暗部的细节是否还清楚。",
    prompt:
      "调节滑竿，比较人物和阶梯在哪个亮度下更容易辨认。设计自己的星球入口时，可以用哪一块亮面引导访客？",
  },
  K03: {
    file: "saturation-portrait",
    description: "灰绿背景前身穿红衣、手持红花的人物",
    summary: "比较红衣与灰调环境的鲜艳程度。",
    observation:
      "红衣和红花颜色鲜明，背景的灰绿叶片与浅色衣裙较为柔和。试着先看红衣，再看人物的脸。",
    analysis:
      "鲜明的红色与较灰的环境拉开了差异，人物更容易成为重点。吸引目光的还包括脸部的明暗、轮廓和位置；颜色鲜艳程度只是其中一个因素。降低整幅图的饱和度后，可以观察这些线索如何继续起作用。",
    prompt:
      "把画面从灰调慢慢调回原色，再稍微增加饱和度。哪一版更符合你想表达的气质？为自己的作品选择一个值得强调的颜色。",
  },
  K04: {
    file: "temperature-window",
    description: "窗外蓝灰湖山与室内橙黄灯光、木桌和书本",
    summary: "比较窗外蓝灰湖山与室内橙黄灯光。",
    observation:
      "窗外是蓝灰色湖山，室内的灯光、木桌和座椅偏橙黄。同一幅画里，冷暖同时存在。",
    analysis:
      "窗框把两个环境连接起来，室内的暖光与室外的冷色相互衬托。它们可能让人联想到安静的远景与亲近的室内空间，也可以有不同感受。整体偏冷或偏暖后，留意窗内外原有的差异是否还鲜明。",
    prompt:
      "试试偏冷与偏暖的版本，你更愿意在哪一种氛围里停留？为星球设计一处休息角落时，可以怎样安排环境色与局部灯光？",
  },
  K05: {
    file: "analogous-leaves",
    description: "青绿色水面、绿叶与浅绿色瓶身组成的静物",
    summary: "在相近的青绿色中，寻找深浅与材质的变化。",
    observation:
      "叶片、瓶身和水面都围绕绿色与青绿色展开，却没有混成同一块颜色。找找最深、最浅和最通透的区域。",
    analysis:
      "相近的色相让画面有联系，深浅、鲜艳程度与材质差异又帮助我们辨认前后层次。深绿叶片托住浅色瓶身，水面和透明弧面带来不同的光感。协调的配色同样需要变化。",
    prompt:
      "为自己的星球选三种相邻的颜色，再安排一个深色区域、一个浅色主体和少量高光。想一想：怎样既保持统一，又让重要元素清楚可见？",
  },
  K06: {
    file: "contrast-bird",
    description: "紫色背景与黄橙色鸟羽、鸢尾花交织的图案",
    summary: "观察紫与黄橙的差异，以及颜色的重复。",
    observation:
      "紫色铺出背景，黄橙色集中在鸟羽、花瓣和枝叶上。你的目光先停在鸟头、长尾，还是右侧花朵？",
    analysis:
      "紫与黄橙之间鲜明的色相差异，让轮廓和装饰纹样更醒目。相同的黄橙色在多个位置重复，又把鸟与花联系起来。对比配色除了制造差异，也可以通过颜色的重复组织画面。",
    prompt:
      "选择一组差异明显的颜色用于星球背景与主要元素。先确定哪里需要最醒目，再考虑其他位置要不要重复一点强调色。",
  },
  K07: {
    file: "area-sailboat",
    description: "大片蓝色湖面和远山中，一艘小小的橙帆船",
    summary: "大片蓝色与一点橙色，怎样安排画面的主次？",
    observation:
      "蓝色湖水与山峦占据大部分画面，橙色帆船只占很小一块，却很容易被发现。天空的浅色区域也会吸引目光。",
    analysis:
      "大面积蓝色建立了整体氛围，小面积橙色成为点缀。帆船的突出还与它和环境的冷暖、鲜艳程度及位置有关，不能只用面积解释。主色与点缀色的面积关系，会影响画面显得安静还是活跃。",
    prompt:
      "想象再增加几艘橙帆船，或者把湖面改成橙色、船帆改成蓝色，画面的感觉会怎样变化？在自己的星球里，先留出大面积环境色，再试着只放一点强调色。",
  },
};

export function knowledgeImageFilter(id: string, value: number) {
  if (id === "K01") return `hue-rotate(${((value % 360) + 360) % 360}deg)`;
  if (id === "K02")
    return `brightness(${Math.max(40, Math.min(160, value)) / 100})`;
  if (id === "K03")
    return `saturate(${Math.max(0, Math.min(200, value)) / 100})`;
  return "none";
}

/** A modest RGB balance shift; 0 preserves the supplied photograph exactly. */
export function temperatureMatrix(value: number) {
  const t = Math.max(-100, Math.min(100, value)) / 100;
  return [
    1 + 0.16 * t,
    0,
    0,
    0,
    0.025 * t,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1 - 0.16 * t,
    0,
    -0.025 * t,
    0,
    0,
    0,
    1,
    0,
  ];
}
