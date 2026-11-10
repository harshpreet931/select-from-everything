import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// share images: a title page. warm paper, cormorant title, italic blurb, a tan hairline.

export const ogSize = { width: 1200, height: 630 };

const font = (f: string) => readFile(join(process.cwd(), "src/assets/fonts", f));
const fonts = Promise.all([
  font("cormorant-300.ttf"),
  font("crimson-400.ttf"),
  font("crimson-italic-400.ttf"),
  font("jetbrains-400.ttf"),
]);

const C = {
  paper: "#fdfbf7",
  hi: "#141210",
  mute: "#6d675f",
  faint: "#8c8579",
  accent: "#8b7355",
  accent2: "#b09a7e",
  line2: "#ddd5c8",
};

export async function renderOg({ address, title, blurb, foot }: { address: string; title: string; blurb: string; foot: string }) {
  const [cormorant, crimson, crimsonItalic, mono] = await fonts;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          background: C.paper,
          padding: "56px 80px 52px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "JetBrains Mono", fontSize: 22, color: C.faint, whiteSpace: "pre" }}>
          {/* the mark: a tiny table, header row and two body rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 22 }}>
            <div style={{ height: 6, background: C.hi }} />
            <div style={{ display: "flex", gap: 2, height: 3 }}>
              <div style={{ width: 6, background: C.mute }} />
              <div style={{ flex: 1, background: C.mute }} />
            </div>
            <div style={{ display: "flex", gap: 2, height: 3 }}>
              <div style={{ width: 6, background: C.line2 }} />
              <div style={{ flex: 1, background: C.line2 }} />
            </div>
          </div>
          <div style={{ display: "flex" }}>
            <span>{"select * from "}</span>
            <span style={{ color: C.hi }}>everything</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, color: C.faint }}>{address}</div>
          <div
            style={{
              marginTop: 26,
              fontFamily: "Cormorant",
              fontWeight: 300,
              fontSize: title.length > 30 ? 74 : 96,
              lineHeight: 1.04,
              color: C.hi,
              maxWidth: 1020,
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: "Crimson",
              fontStyle: "italic",
              fontSize: 32,
              lineHeight: 1.4,
              color: C.mute,
              maxWidth: 900,
            }}
          >
            {blurb}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{ width: 60, height: 1, background: C.accent2 }} />
          <div style={{ display: "flex", gap: 18, fontFamily: "Crimson", fontSize: 24, color: C.faint }}>
            <span>{foot}</span>
            <span style={{ color: C.accent2 }}>·</span>
            <span style={{ fontStyle: "italic", color: C.accent }}>by harshpreet · harshpreet.com</span>
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Cormorant", data: cormorant, weight: 300, style: "normal" },
        { name: "Crimson", data: crimson, weight: 400, style: "normal" },
        { name: "Crimson", data: crimsonItalic, weight: 400, style: "italic" },
        { name: "JetBrains Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
