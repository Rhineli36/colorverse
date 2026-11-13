// Visual catalogue only. Ownership and unlock conditions must come from the
// classroom service when this prototype is integrated; preview never grants one.
export const framePresets = (
  [
    {
      id: "silver",
      name: "月辉银饰",
      material: "银色 · 星芒花丝",
      description: "冷银双线与细密星纹，清澈而轻盈。",
    },
    {
      id: "gold",
      name: "日冕鎏金",
      material: "金色 · 月桂雕花",
      description: "暖金月桂与日冕徽章，为画面加冕。",
    },
    {
      id: "sapphire",
      name: "蓝宝星穹",
      material: "宝石 · 蓝宝石镶嵌",
      description: "切面蓝宝石嵌入银托，星链连接四角。",
    },
    {
      id: "emerald",
      name: "翡翠秘境",
      material: "宝石 · 翡翠与金丝",
      description: "翠色宝石、垂坠金饰与植物纹样。",
    },
    {
      id: "glass",
      name: "琉璃虹窗",
      material: "彩绘 · 珐琅与彩窗",
      description: "彩色珐琅嵌入细金骨架，像一扇星窗。",
    },
    {
      id: "floral",
      name: "繁花绘梦",
      material: "彩绘 · 花瓣与藤蔓",
      description: "珊瑚、青绿与淡紫的手绘花饰。",
    },
    {
      id: "winter",
      name: "立冬·霜华初绽",
      material: "节气限定 · 霜晶与冬枝",
      description: "银霜窗棂、冰晶垂饰与暖金叶片，收藏初冬。",
    },
  ] as const
).map((p) => ({ ...p, locked: true as const, unlockCondition: null }));
export const frameUnlockLabels = {
  silver: "上传自己的星球外观和内部背景后解锁",
  gold: "有效互动累计达到20次后解锁",
  sapphire: "自己的星球与作品累计获赞达到10次后解锁",
  emerald: "提交课程作业达到5次后解锁",
  glass: "提交课程作业达到10次后解锁",
  floral: "有效互动累计达到50次后解锁",
  winter: "提交指定立冬作业并获得教师评分后解锁 · 指定作业待绑定",
} as const;
export type FrameId = (typeof framePresets)[number]["id"];
export const ringPresets = (
  [
    {
      id: "silver",
      name: "银月丝轨",
      material: "银色 · 星刻与流苏",
      description: "银丝双轨、星芒刻度与小巧垂饰。",
    },
    {
      id: "gold",
      name: "鎏金冠冕",
      material: "金色 · 月桂与珠饰",
      description: "三重金线串起月桂和细小金珠。",
    },
    {
      id: "gem",
      name: "宝石星链",
      material: "宝石 · 镶嵌星链",
      description: "蓝紫切面宝石与珠链环绕星球。",
    },
    {
      id: "enamel",
      name: "虹彩珐琅",
      material: "彩绘 · 分色珐琅",
      description: "彩色弧段、金属包边与星纹铆钉。",
    },
    {
      id: "jellyfish",
      name: "水母·星海巡游",
      material: "实验室主题 · 轻盈水母与星尘",
      description: "三只青蓝、粉紫的小水母，带着微光绕星球游动。",
    },
  ] as const
).map((p) => ({ ...p, locked: true as const, unlockCondition: null }));
export type RingId = (typeof ringPresets)[number]["id"];
export const materials = {
  silver: ["#d7e3f3", "#f6fbff", "#a5c6ee"],
  gold: ["#e6bd72", "#fff0c2", "#cd904e"],
  sapphire: ["#d3e1f7", "#f2f8ff", "#669fee"],
  emerald: ["#e0c27e", "#fff0c9", "#57d2a5"],
  glass: ["#e6c88c", "#fff1d3", "#b3a1ed"],
  floral: ["#edbf9a", "#fff0db", "#b9dbd1"],
  gem: ["#d7daf2", "#fff0fb", "#b997ed"],
  enamel: ["#e9cf92", "#fff4d7", "#92d6d2"],
  winter: ["#c7dfed", "#f5fdff", "#a0cfde"],
  jellyfish: ["#b6dbe9", "#f4efff", "#b3a4ef"],
} as const;

// Optional trial tint; catalogue materials keep their own original colours.
export const paletteMaterials = {
  gold: ["#edcb87", "#fff6d8", "#8edddd"],
  moon: ["#d7e6fa", "#f5fbff", "#99b8ff"],
  rose: ["#edb5dc", "#fff0fc", "#bda5ff"],
} as const;

export const ringUnlockLabels = {
  silver: "首次提交作业并获得教师评分后解锁",
  gold: "第二周三份作业全部提交并获得教师评分后解锁",
  gem: "有1份作业达到90分后解锁",
  enamel: "有3份不同作业达到90分，或1份作业达到95分后解锁",
  jellyfish: "提交第二周水母作业并获得教师评分后解锁",
} as const;
