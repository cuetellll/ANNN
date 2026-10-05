/**
 * آیکون دکمه‌ی اتصال
 * idle: علامت پاور با یه شکاف درخشان بالاش
 * connecting: کمان پاور دور خودش می‌چرخه و خط وسط تپش داره
 * connected: سپر خودش رو می‌کشه و تیک داخلش ظاهر میشه
 */
type Props = { status: 'idle' | 'connecting' | 'connected' };

export default function CoreIcon({ status }: Props) {
  return (
    <svg className={`cicon ${status}`} viewBox="0 0 48 48" key={status} aria-hidden>
      <defs>
        <linearGradient id="cig" gradientUnits="userSpaceOnUse" x1="10" y1="6" x2="38" y2="42">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="currentColor" />
        </linearGradient>
      </defs>
      {status === 'connected' ? (
        <g fill="none" stroke="url(#cig)" strokeLinecap="round" strokeLinejoin="round">
          <path className="ci-shield-fill" d="M24 6l14 5.4v10.2c0 9-6.1 15.6-14 18.4-7.9-2.8-14-9.4-14-18.4V11.4z" fill="currentColor" stroke="none" />
          <path className="ci-shield" pathLength={100} strokeWidth={2.6} d="M24 6l14 5.4v10.2c0 9-6.1 15.6-14 18.4-7.9-2.8-14-9.4-14-18.4V11.4z" />
          <path className="ci-check" pathLength={100} strokeWidth={3.2} d="M17.5 23.5l4.6 4.6 8.8-9.4" />
        </g>
      ) : (
        <g fill="none" stroke="url(#cig)" strokeLinecap="round">
          <g className="ci-arc-wrap">
            <path className="ci-arc" pathLength={100} strokeWidth={3.2} d="M15.2 13.6a15 15 0 1 0 17.6 0" />
          </g>
          <path className="ci-line" pathLength={100} strokeWidth={3.4} d="M24 7.5v15" />
          <circle className="ci-spark" cx="24" cy="7.5" r="1.6" fill="#fff" stroke="none" />
        </g>
      )}
    </svg>
  );
}
