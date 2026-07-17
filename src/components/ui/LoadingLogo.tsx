// Self-drawing ("tracer") loader built from the brand mark — the orange rounded
// square + the "F" glyph. Each shape is stroked and animated via stroke-dashoffset
// (pathLength=1 normalises every path), looping like the lottielab tracer template.
// No Lottie dependency; themeable via the `color` prop.

interface LoadingLogoProps {
  size?: number
  /** Stroke colour (brand orange by default). */
  color?: string
}

export function LoadingLogo({ size = 76, color = "#FD5426" }: LoadingLogoProps) {
  return (
    <svg
      className="tracer-logo"
      width={size}
      height={size}
      viewBox="-3 -3 42 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Yuklanmoqda"
      style={{ ["--tracer-color" as string]: color }}
    >
      <rect width="35.1045" height="35.1045" rx="7" pathLength={1} />
      <path
        d="M20.6843 7.94885H14.4203H8.15625V14.3511V20.7533V27.1556H14.4203V20.7533H20.6843V14.3511H26.9484V7.94885H20.6843Z"
        pathLength={1}
        style={{ animationDelay: "0.25s" }}
      />
    </svg>
  )
}
