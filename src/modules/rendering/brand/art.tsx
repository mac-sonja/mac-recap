/**
 * MAC's brand pages' artwork as inline SVG, from the Figma frames' exported paths (file
 * `lUcMm0xOxW7Y50M93buTDb`, 2026-11-13). Each page draws one SVG on its 1920×1080 frame
 * (`viewBox="0 0 1920 1080"`): the paths' y values are the frame's, their x values the node's,
 * placed with the node's x. What leaves the frame is clipped.
 */

/** The background: a radial gradient over the whole frame (the same on both pages). */
export const BACKGROUND = {
  transform: "matrix(48.2 -120.7 175 69.883 684.5 1080)",
  r: 10,
  stops: [
    { offset: 0, colour: "#2977FF" },
    { offset: 0.62021, colour: "#1455C7" },
    { offset: 0.98561, colour: "#073C99" },
  ],
} as const;

/** The intro's lime, as fill and as outline. */
export const LIME = "#DEFE56";

/** The star's outline (nodes 1047:316 and 1047:323), drawn twice: at x 1160 and at x 1080. */
export const STAR_OUTLINE =
  "M649.665 -142.5C658.492 -142.5 667.135 -142.127 675.729 -141.474C642.74 38.3764 661.734 200.741 720.325 320.597C778.902 440.423 877.07 517.772 1002.41 527.555C1000.91 535.621 999.412 543.684 997.727 551.807L996.976 555.371C995.109 564.137 993.006 572.856 990.944 581.537C861.204 591.265 729.969 668.828 620.394 788.992C510.782 909.196 422.805 1072.07 379.639 1252.46C370.739 1253.12 361.842 1253.5 352.946 1253.5C344.12 1253.5 335.432 1253.13 326.882 1252.47C360.284 1072.16 341.497 909.325 282.948 789.11C224.421 668.941 126.149 591.351 0.592773 581.553C2.00216 573.996 3.38053 566.48 4.93945 558.907L5.63574 555.58C7.64829 546.181 9.85035 536.875 12.1025 527.566C141.601 517.863 272.594 440.556 382.048 320.75C491.538 200.904 579.514 38.4916 622.923 -141.459C631.87 -142.122 640.768 -142.5 649.665 -142.5Z";
export const STAR_OUTLINE_XS = [1160, 1080] as const;

/** The filled star (node 1047:324), at x 1000. */
export const STAR_FILLED =
  "M1002.95 527.097C752.214 507.903 610.093 218.046 676.322 -141.931C667.534 -142.611 658.697 -143 649.665 -143C640.634 -143 631.603 -142.611 622.523 -141.931C535.804 218.095 270.597 507.952 11.7018 527.097C9.41968 536.524 7.18612 545.951 5.14681 555.476C3.25317 564.368 1.65087 573.164 0 582.008C251.223 601.202 393.344 892.031 326.289 1252.93C335.029 1253.61 343.915 1254 352.946 1254C361.977 1254 371.009 1253.61 380.04 1252.93C466.273 892.031 731.966 601.202 991.347 582.008C993.435 573.212 995.571 564.368 997.465 555.476C999.504 545.951 1001.25 536.524 1003 527.097H1002.95Z";
export const STAR_FILLED_X = 1000;

/** The "Mac" wordmark (node 1045:249), at y 478, with its own gradient in the node's space. */
export const WORDMARK =
  "M177.256 0L346.749 470.408L515.438 0H658.013V20.7744L650.504 21.4355C601.767 25.7322 595.345 46.0823 598.745 113.789L621.271 511.816C624.672 574.707 628.167 602.517 674.825 602.517L674.873 602.423H683.09V623.905H475.438V602.423H483.703C501.318 602.423 513.455 598.645 520.822 590.854C533.243 577.823 534.423 552.327 532.251 512.666L510.244 107.746L325.072 623.953H306.796L120.821 109.257L101.271 472.627C98.3898 527.774 106.796 567.341 125.544 587.077C135.367 597.465 147.977 602.517 163.986 602.517H172.203V624H-0.359375V603.131L7.24414 602.517C53.7613 598.928 65.6619 549.824 69.7705 471.777L88.9912 104.582C92.0608 43.9576 67.2676 27.4326 29.1094 21.3418L22.167 20.2559V0H177.256ZM1579.2 2.73828C1659.63 2.73841 1732.12 43.4854 1770.65 99.0107L1725.36 166.954H1718.56C1695.89 82.0135 1655.14 18.6026 1579.25 18.6025C1470.49 18.6026 1408.2 143.204 1408.2 282.49C1408.2 439.907 1472.75 566.774 1595.12 566.774C1676.67 566.774 1738.96 519.182 1774.1 468.236L1780.9 472.769C1741.28 541.845 1673.27 623.386 1554.31 623.386C1403.66 623.386 1311.9 490.852 1311.9 322.104H1311.86C1311.86 135.225 1433.08 2.73831 1579.2 2.73828ZM1077.32 2.68945C1129.46 2.68944 1170.21 17.4206 1194.01 49.1494L1255.17 9.48828H1260.84L1158.88 493.117C1155.48 507.849 1146.41 546.329 1165.68 546.329C1187.21 546.329 1231.37 501.049 1272.17 445.523L1277.84 450.057V450.104C1221.17 558.841 1158.88 623.385 1104.52 623.385C1046.72 623.385 1052.38 554.308 1063.72 503.315L1092.05 371.915C1026.36 533.864 924.403 623.337 832.644 623.337C759.019 623.337 715.949 564.46 715.949 455.723C715.949 251.846 867.732 2.6897 1077.32 2.68945ZM1881.21 468.805C1882.24 468.805 1883.19 468.805 1884.18 468.899C1876.86 508.749 1892.59 540.808 1920.36 542.933H1920.31C1920.12 544.019 1919.93 545.058 1919.7 546.097C1919.51 547.088 1919.27 548.032 1919.03 549.023C1890.27 551.148 1860.85 583.303 1851.31 623.247C1850.27 623.341 1849.28 623.341 1848.29 623.341C1847.3 623.341 1846.35 623.341 1845.36 623.247C1852.82 583.35 1837.05 551.148 1809.23 549.023C1809.42 548.032 1809.61 547.088 1809.8 546.097C1809.99 545.011 1810.27 543.971 1810.51 542.933C1839.22 540.808 1868.6 508.749 1878.18 468.899C1879.22 468.805 1880.17 468.805 1881.21 468.805ZM1059.23 18.6006C933.471 18.6006 812.289 251.893 812.289 436.506C812.289 521.446 839.492 567.906 884.781 567.906C967.473 567.906 1086.43 403.69 1129.46 193.015C1132.86 173.751 1135.12 155.62 1135.12 131.871C1135.12 68.4607 1118.12 18.6007 1059.23 18.6006Z";
export const WORDMARK_Y = 478;
export const WORDMARK_GRADIENT = {
  transform: "translate(103.5 680.5) rotate(-32.0436) scale(2143 3177.66)",
  stops: [
    { offset: 0, colour: "#0E3372" },
    { offset: 0.411905, colour: "#1B60D8" },
    { offset: 0.831772, colour: "#1549A5" },
  ],
} as const;

/** An SVG id made safe for `url(#…)` from React's `useId` (which may hold `:` or `«»`). */
export const svgId = (id: string, name: string) => `mr-brand-${name}-${id.replace(/[^A-Za-z0-9_-]/g, "")}`;

type Stops = readonly { offset: number; colour: string }[];
const stopsOf = (stops: Stops) => stops.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.colour} />);

/** The frame's SVG: the gradient background, then the page's own art. `uid` keeps its gradient ids unique in the document. */
export function BrandArt({ uid, kind }: { uid: string; kind: "intro" | "outro" }) {
  const bg = svgId(uid, "bg");
  const mark = svgId(uid, "mark");
  return (
    <svg className="mr-brand-art" viewBox="0 0 1920 1080" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id={bg} cx={0} cy={0} r={BACKGROUND.r} gradientUnits="userSpaceOnUse" gradientTransform={BACKGROUND.transform}>
          {stopsOf(BACKGROUND.stops)}
        </radialGradient>
      </defs>
      <rect width={1920} height={1080} fill={`url(#${bg})`} />
      {kind === "intro" ? (
        <>
          {STAR_OUTLINE_XS.map((x) => (
            <path key={x} transform={`translate(${x} 0)`} d={STAR_OUTLINE} stroke={LIME} strokeWidth={1} fill="none" />
          ))}
          <path transform={`translate(${STAR_FILLED_X} 0)`} d={STAR_FILLED} fill={LIME} />
        </>
      ) : (
        <g transform={`translate(0 ${WORDMARK_Y})`}>
          <defs>
            <radialGradient id={mark} cx={0} cy={0} r={1} gradientUnits="userSpaceOnUse" gradientTransform={WORDMARK_GRADIENT.transform}>
              {stopsOf(WORDMARK_GRADIENT.stops)}
            </radialGradient>
          </defs>
          <path d={WORDMARK} fill={`url(#${mark})`} />
        </g>
      )}
    </svg>
  );
}
