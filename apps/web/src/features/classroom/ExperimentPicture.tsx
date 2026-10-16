import { useId } from "react";
import {
  KnowledgeExampleImages,
  knowledgeImageFilter,
} from "./knowledge-example-images";
import {
  experimentPalette,
  type KnowledgeExperimentId,
} from "./knowledge-experiment-model";

export function ExperimentPicture({
  id,
  value,
  label,
}: {
  id: KnowledgeExperimentId;
  value: number;
  label: string;
}) {
  const uid = useId(),
    c = experimentPalette(id, value);
  const image = KnowledgeExampleImages[id];
  if (image)
    return (
      <img
        className="experiment-sample-image"
        src={`${import.meta.env.BASE_URL}knowledge-examples/${image.file}.webp`}
        alt={label}
        title={image.description}
        width={1536}
        height={1024}
        decoding="async"
        data-scene-id={id}
        style={{ filter: knowledgeImageFilter(id, value) }}
      />
    );
  const stars = (
    <g fill="#dde8ee" opacity=".7">
      {[
        [22, 24],
        [76, 55],
        [132, 26],
        [274, 35],
        [374, 62],
        [435, 24],
        [454, 99],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 ? 1.4 : 2.3} />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 480 300" role="img" aria-label={label} data-scene-id={id}>
      <defs>
        <linearGradient id={uid + "sky"} x2="0" y2="1">
          <stop stopColor="#081425" />
          <stop offset="1" stopColor="#30495c" />
        </linearGradient>
        <linearGradient id={uid + "sea"} x2="0" y2="1">
          <stop stopColor="#0b4054" />
          <stop offset="1" stopColor="#071d33" />
        </linearGradient>
        <linearGradient id={uid + "glass"} x2="1" y2="1">
          <stop stopColor="#e0f2ed" stopOpacity=".2" />
          <stop offset="1" stopColor="#87c6c5" stopOpacity=".02" />
        </linearGradient>
      </defs>
      {id === "K03" && (
        <>
          <rect width="480" height="300" fill={"url(#" + uid + "sky)"} />
          {stars}
          <circle cx="380" cy="62" r="30" fill="#6e8998" />
          <path
            d="M0 177L66 108L117 173L187 120L265 173L337 123L421 178L480 153V300H0Z"
            fill="#243d50"
          />
          <path d="M0 244Q131 179 239 224T480 223V300H0Z" fill="#172d3b" />
          <path d="M0 278Q190 219 480 265V300H0Z" fill="#0e2332" />
          <ellipse cx="251" cy="250" rx="160" ry="26" fill="#081a28" />
          <g
            data-color-target="orb"
            fill={c.orb}
            stroke="#d5d4e5"
            strokeOpacity=".35"
            strokeWidth="2"
          >
            <path d="M167 223L159 126L192 78L217 127L208 238Z" />
            <path d="M217 237L236 61L266 29L293 83L275 247Z" />
            <path d="M281 244L302 131L333 103L354 146L333 243Z" />
            <path d="M110 244L107 188L129 159L151 188L148 251Z" />
            <path d="M351 254L367 194L388 180L402 208L389 261Z" />
          </g>
          <g fill="none" stroke="#eeeaf5" opacity=".3">
            <path d="M192 78L187 222L208 238M236 61L251 102L266 29M251 102L247 242L275 247M333 103L323 157L333 243M129 159L127 236L148 251" />
            <path d="M160 126L187 145L217 127M302 131L323 157L354 146" />
          </g>
          {[62, 87, 427, 444].map((x, i) => (
            <g key={x}>
              <path
                d={`M${x} 267q-9 -30 4 -46q12 18 -4 32`}
                stroke="#648b91"
                fill="#325b63"
              />
              <circle cx={x + 3} cy={218 - i * 4} r="4" fill="#a1b9ae" />
            </g>
          ))}
          <path
            d="M37 287Q123 260 192 278M298 281Q381 267 449 286"
            fill="none"
            stroke="#4b6c77"
          />
        </>
      )}
      {id === "K04" && (
        <>
          <rect width="480" height="300" fill={c.sky} />
          <circle
            data-color-target="orb"
            cx="365"
            cy="62"
            r="30"
            fill={c.orb}
          />
          <path
            d="M0 168L76 53L150 159L217 93L299 171L378 108L480 161V300H0Z"
            fill={c.far}
          />
          <path
            d="M42 104L76 53L111 104L82 89L66 108Z"
            fill="#d4d9de"
            opacity=".6"
          />
          <path
            d="M0 203L79 144L149 199L237 139L333 196L404 154L480 190V300H0Z"
            fill={c.near}
          />
          <path d="M0 220Q130 190 265 214T480 216V300H0Z" fill={c.ground} />
          <path
            d="M178 211Q290 212 246 237T314 300H480V232Q343 223 286 211Z"
            fill={c.arch}
          />
          <g stroke={c.orb} opacity=".35">
            <path
              d="M237 229H287M216 248H318M275 274H369M351 290H426"
              strokeWidth="2"
            />
          </g>
          <path
            d="M177 235Q225 185 292 224L290 237Q227 204 183 247Z"
            fill={c.arch}
          />
          <path
            d="M178 227Q227 177 295 217"
            fill="none"
            stroke="#ccd4d6"
            strokeWidth="3"
          />
          {[31, 65, 106, 393, 427, 457].map((x, i) => (
            <g key={x}>
              <path
                d={`M${x} ${244 - (i % 2) * 13}v-73`}
                stroke={c.ground}
                strokeWidth="5"
              />
              <path
                d={`M${x} ${151 - (i % 2) * 13}l-21 40h13l-22 31h59l-21-31h13Z`}
                fill={i % 2 ? c.far : c.near}
              />
            </g>
          ))}
          <path d="M0 278Q83 240 178 259L194 300H0Z" fill={c.near} />
          <ellipse cx="114" cy="273" rx="33" ry="11" fill={c.far} />
        </>
      )}
      {id === "K05" && (
        <>
          <rect width="480" height="300" fill={c.sky} />
          <circle cx="378" cy="56" r="31" fill={c.arch} />
          {[20, 74, 120, 410, 455].map((x, i) => (
            <g key={x} fill={i % 2 ? c.far : c.near}>
              <path d={`M${x} 242v-145h7v145Z`} />
              <ellipse cx={x} cy={91 + (i % 2) * 22} rx="33" ry="56" />
            </g>
          ))}
          <path d="M0 255Q120 210 240 248T480 244V300H0Z" fill={c.ground} />
          <path d="M123 229V129L239 58L355 129V229Z" fill={c.far} />
          <path
            d="M123 129L239 58L355 129V229H123Z"
            fill={"url(#" + uid + "glass)"}
          />
          <path
            d="M123 229V129L239 58L355 129V229ZM123 129H355M239 58V229M181 94V229M297 94V229M123 179H355"
            fill="none"
            stroke={c.arch}
            strokeWidth="4"
          />
          <g fill={c.near} stroke={c.arch} strokeWidth="2">
            <path d="M206 229V175A33 33 0 0 1 272 175V229Z" />
          </g>
          {[155, 190, 289, 323].map((x, i) => (
            <g key={x}>
              <path d={`M${x - 13} 211h26l-5 17h-16Z`} fill={c.arch} />
              <path
                d={`M${x} 211v-39m0 23q-30-24-15-32q17 3 15 25m0 9q29-26 17-34q-19 6-17 23`}
                data-color-target={i === 0 ? "orb" : undefined}
                fill={i % 2 ? c.far : c.orb}
                stroke={c.ground}
                strokeWidth="1.5"
              />
            </g>
          ))}
          <path
            d="M213 233Q243 246 189 300H294Q266 247 265 233Z"
            fill={c.arch}
          />
          {[56, 86, 387, 425].map((x, i) => (
            <g key={x}>
              <ellipse
                cx={x}
                cy={257 + (i % 2) * 15}
                rx="24"
                ry="13"
                fill={c.near}
              />
              <path
                d={`M${x} 261v-35q-23-24-25-7q7 14 25 12q20-34 29-20q3 12-29 23`}
                fill={c.far}
              />
            </g>
          ))}
        </>
      )}
      {id === "K06" && (
        <>
          <rect width="480" height="300" fill={c.sky} />
          <path
            d="M49 0L109 0L225 240L167 240ZM291 0H320L345 209H277Z"
            fill={c.arch}
            opacity=".08"
          />
          <path
            d="M0 227L67 204L128 233L206 213L301 235L393 206L480 222V300H0Z"
            fill={c.ground}
          />
          <path
            d="M37 223V89H65V223M89 227V78H115V227M22 89H127V73H22Z"
            fill={c.far}
          />
          <path d="M77 69L131 112L145 101L96 56Z" fill={c.near} />
          <path
            d="M292 231V144H318V231M349 237V144H375V237M287 145A44 44 0 0 1 380 145H365A28 28 0 0 0 302 145Z"
            fill={c.far}
          />
          <g fill={c.near}>
            <ellipse cx="183" cy="252" rx="54" ry="16" />
            <ellipse cx="413" cy="265" rx="71" ry="18" />
          </g>
          <g data-color-target="orb" fill={c.orb}>
            <path d="M162 123Q160 97 190 94H226Q252 94 258 119L283 133L256 146Q241 162 202 158L172 147Z" />
            <rect x="189" y="77" width="28" height="19" rx="5" />
          </g>
          <circle
            cx="226"
            cy="124"
            r="17"
            fill={c.sky}
            stroke="#cedbdc"
            strokeWidth="3"
          />
          <circle cx="224" cy="121" r="10" fill={c.arch} />
          <path
            d="M163 114L144 103V142L164 137M185 153L176 170H211L216 156"
            fill={c.arch}
          />
          <g fill="none" stroke={c.arch} strokeWidth="2" opacity=".6">
            {[
              [271, 104, 5],
              [280, 82, 3],
              [269, 63, 4],
              [146, 163, 3],
              [137, 148, 2],
            ].map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} />
            ))}
          </g>
          <path
            d="M39 294v-34m0 14l-20-11m20 4l19-18M405 300v-47m0 22l-21-16m21 3l22-20M437 300q-12-33 4-54"
            stroke={c.arch}
            strokeWidth="6"
            fill="none"
          />
          {[45, 73, 326, 438].map((x, i) => (
            <path
              key={x}
              d={`M${x} ${170 + (i % 2) * 25}q13-12 26 0q-13 13-26 0l-9 7v-14Z`}
              fill={c.arch}
              opacity=".65"
            />
          ))}
        </>
      )}
      {id === "K07" && (
        <>
          <rect width="480" height="300" fill="#192a3e" />
          <path
            d="M0 0L80 30V252L0 300M480 0L400 30V252L480 300"
            fill="#101f31"
          />
          <path d="M80 252H400L480 300H0Z" fill="#304356" />
          <path
            d="M0 300L180 252M480 300L300 252M55 283H425"
            stroke="#56677a"
            opacity=".5"
          />
          <rect x="98" y="39" width="284" height="190" rx="3" fill="#07131f" />
          <rect x="107" y="48" width="266" height="172" fill="#b8aa92" />
          <svg
            x="115"
            y="54"
            width="250"
            height="160"
            viewBox="0 0 240 160"
            preserveAspectRatio="none"
          >
            <rect width="240" height="160" fill="#416fbc" />
            <rect
              data-area="coral"
              x={240 * (1 - value / 100)}
              width={(240 * value) / 100}
              height="160"
              fill="#ed8d88"
            />
          </svg>
          {[140, 240, 340].map((x) => (
            <g key={x}>
              <path d={`M${x} 0v20`} stroke="#97a7b5" strokeWidth="3" />
              <path d={`M${x - 12} 20h24l9 14h-42Z`} fill="#81949e" />
            </g>
          ))}
          <path d="M77 255V155M403 255V155" stroke="#7793a1" strokeWidth="3" />
          <path
            d="M48 167H108L98 153H57ZM373 167H433L424 153H383Z"
            fill="#6d8190"
          />
          <path d="M180 251H302V266H180Z" fill="#8b877f" />
          <path d="M191 265V283M290 265V283" stroke="#142332" strokeWidth="7" />
          <rect x="213" y="233" width="54" height="7" rx="2" fill="#8b9ba8" />
        </>
      )}
    </svg>
  );
}
