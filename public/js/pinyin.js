// Turns tone-number pinyin ("zao3 shang4") into tone marks ("zǎo shàng").
// Parents can type either form in the word list editor.

const TONE = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

const VOWELS = 'aeiouü';

export function pinyinFromNumbered(input) {
  return String(input ?? '')
    .trim()
    .split(/\s+/)
    .map((syllable) => {
      const match = syllable.match(/^([a-zA-ZüÜ:v]+)([0-5])$/);
      if (!match) return syllable;
      const base = match[1]
        .replace(/u:/g, 'ü')
        .replace(/v/g, 'ü')
        .replace(/Ü/g, 'Ü')
        .toLowerCase();
      const tone = Number(match[2]);
      if (tone === 0 || tone === 5) return base;

      let at = -1;
      if (base.includes('a')) at = base.indexOf('a');
      else if (base.includes('e')) at = base.indexOf('e');
      else if (base.includes('ou')) at = base.indexOf('o');
      else {
        for (let i = base.length - 1; i >= 0; i -= 1) {
          if (VOWELS.includes(base[i])) {
            at = i;
            break;
          }
        }
      }
      if (at < 0) return base;
      const vowel = base[at];
      const marked = TONE[vowel]?.[tone - 1] || vowel;
      return `${base.slice(0, at)}${marked}${base.slice(at + 1)}`;
    })
    .join(' ');
}
