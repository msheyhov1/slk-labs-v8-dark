// Карта моушна v8 «Тушь · Рассвет» — зеркалит styles/tokens.css (единая правда).
// ink — тушь оседает в бумагу (ревилы, сборка); stamp — штамп-ханко с овершутом;
// scene — переходы разделов; hero — восход + отрисовка энсо.
export const motion = {
  dur: { micro: 0.15, short: 0.3, base: 0.6, slow: 0.9, hero: 1.4 },
  stagger: 0.07,
  ease: {
    ink: "expo.out",
    stamp: "back.out(1.7)",
    scene: "power4.inOut",
    standard: "power1.inOut",
  },
} as const;
