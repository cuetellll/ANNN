/** اسم MAHYARVPN با حروفی که موجی بالا پایین میرن و رنگشون جابجا میشه */
export default function WaveName({ text = 'MAHYARVPN', split = 6 }: { text?: string; split?: number }) {
  return (
    <span className="wave" aria-label={text} dir="ltr">
      {text.split('').map((ch, i) => (
        <span key={i} className={`wv ${i >= split ? 'b' : ''}`} style={{ animationDelay: `${i * 0.09}s, ${i * 0.09}s` }}>{ch}</span>
      ))}
    </span>
  );
}
