/*
 * Short browser / platform label for validation records (e.g. "Chrome 129 · Android"), from the user-agent string.
 * Only this summary is kept — never the full user-agent string. The tester can add the device model by hand.
 */
export function browserSummary(userAgent: string): string {
  const ua = userAgent || '';
  const platform = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Mac OS X|Macintosh/i.test(ua)
        ? 'macOS'
        : /Windows/i.test(ua)
          ? 'Windows'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'unknown platform';
  const browsers: [string, RegExp][] = [
    ['Edge', /Edg(?:A|iOS)?\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+)[\d.]* .*Safari/],
  ];
  for (const [name, pattern] of browsers) {
    const match = ua.match(pattern);
    if (match) return `${name} ${match[1]} · ${platform}`;
  }
  return `unknown browser · ${platform}`;
}
