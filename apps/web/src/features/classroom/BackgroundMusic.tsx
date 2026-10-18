import { useEffect, useRef, useState } from "react";
const tracks = [
  { id: "quiet-universe", name: "静谧宇宙", description: "舒缓空灵" },
  { id: "light-roaming", name: "轻盈漫游", description: "轻快、富有探索感" },
  { id: "warm-afternoon", name: "温暖午后", description: "柔和温暖" },
];
const key = "colorverse.music.track";
export function BackgroundMusic() {
  const [track, setTrack] = useState(() => {
      try {
        return (
          tracks.find((t) => t.id === localStorage.getItem(key))?.id ??
          tracks[0].id
        );
      } catch {
        return tracks[0].id;
      }
    }),
    [open, setOpen] = useState(false),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  const initialTrack = useRef(track),
    audio = useRef<HTMLAudioElement>(null),
    host = useRef<HTMLDivElement>(null),
    intent = useRef(false),
    generation = useRef(0);
  const play = async () => {
    const a = audio.current;
    if (!a) return;
    const g = ++generation.current;
    intent.current = true;
    setError("");
    a.volume = 0.22;
    try {
      await a.play();
      if (g !== generation.current && !intent.current) a.pause();
    } catch {
      if (g === generation.current) {
        intent.current = false;
        setPlaying(false);
        setError("音乐暂时无法播放，请再试一次。");
      }
    }
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(
    () => () => {
      intent.current = false;
      generation.current++;
    },
    [],
  );
  const choose = (id: string) => {
    if (id === track) return;
    const a = audio.current;
    if (!a) return;
    const resume = intent.current;
    generation.current++;
    a.pause();
    a.src = `${import.meta.env.BASE_URL}music/${id}.wav`;
    setTrack(id);
    setError("");
    try {
      localStorage.setItem(key, id);
    } catch {}
    if (resume) void play();
  };
  return (
    <div className="background-music" ref={host}>
      <audio
        ref={audio}
        src={`${import.meta.env.BASE_URL}music/${initialTrack.current}.wav`}
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          intent.current = false;
          setPlaying(false);
          setError("音乐文件暂不可用，其他功能仍可正常使用。");
        }}
      />
      <button
        aria-label="背景音乐"
        aria-expanded={open}
        title={playing ? "音乐播放中" : "音乐已暂停"}
        onClick={() => setOpen((v) => !v)}
      >
        {playing ? "♫" : "♪"}
        <span className="music-label"> {playing ? "播放中" : "音乐"}</span>
      </button>
      {open && (
        <section
          className="music-panel"
          aria-label="背景音乐设置"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <strong>背景音乐</strong>
          <button
            onClick={() => {
              if (intent.current) {
                intent.current = false;
                generation.current++;
                audio.current?.pause();
              } else void play();
            }}
          >
            {playing ? "暂停音乐" : "播放音乐"}
          </button>
          {tracks.map((t) => (
            <button
              key={t.id}
              className="music-track"
              aria-pressed={track === t.id}
              onClick={() => choose(t.id)}
            >
              <span>
                {t.name}
                {track === t.id ? " ✓" : ""}
              </span>
              <small>{t.description}</small>
            </button>
          ))}
          {error && <p role="status">{error}</p>}
        </section>
      )}
    </div>
  );
}
