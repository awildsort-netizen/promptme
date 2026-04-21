// mkdirbook content catalog - references to all texts in the repo
export interface BookText {
  id: string;
  title: string;
  filename: string;
  book: string;
}

export interface Book {
  key: string;
  title: string;
  description: string;
  texts: BookText[];
}

const GITHUB_RAW = "https://raw.githubusercontent.com/awildsort-netizen/mkdirbook/master";

export function getTextUrl(book: string, filename: string): string {
  return `${GITHUB_RAW}/${book}/${encodeURIComponent(filename)}`;
}

export const BOOKS: Book[] = [
  {
    key: "dtune",
    title: "dtune",
    description: "Poems",
    texts: [
      { id: "dtune/sun", title: "A Sun in the Moment", filename: "A Sun in the Moment.md", book: "dtune" },
      { id: "dtune/drift", title: "Drift Becoming", filename: "Drift Becoming.md", book: "dtune" },
      { id: "dtune/zero", title: "For I equals Zero", filename: "For I equals Zero.md", book: "dtune" },
      { id: "dtune/mountains", title: "I Look to the Mountains", filename: "I Look to the Mountains.md", book: "dtune" },
      { id: "dtune/shaker", title: "Shaker Legs Syndrome", filename: "Shaker Legs Syndrome.md", book: "dtune" },
      { id: "dtune/walking", title: "Walking Will", filename: "Walking Will.md", book: "dtune" },
    ]
  },
  {
    key: "free2move",
    title: "free2move",
    description: "Essays & chapters",
    texts: [
      { id: "f2m/prologue", title: "Prologue", filename: "prologue.md", book: "free2move" },
      { id: "f2m/astold", title: "As Told", filename: "astold.md", book: "free2move" },
      { id: "f2m/exit0", title: "Exit 0", filename: "exit0.md", book: "free2move" },
      { id: "f2m/antclock", title: "Ant Clock", filename: "antclock.md", book: "free2move" },
      { id: "f2m/sobelpeace", title: "Sobel Peace", filename: "sobelpeace.md", book: "free2move" },
      { id: "f2m/xroads", title: "Crossroads", filename: "xroads.md", book: "free2move" },
      { id: "f2m/anywayglimmer", title: "Anyway Glimmer", filename: "anywayglimmer.md", book: "free2move" },
      { id: "f2m/iphonesig", title: "iPhone Sig", filename: "iphonesig.md", book: "free2move" },
      { id: "f2m/carwrestling", title: "Car Wrestling", filename: "carwrestling.md", book: "free2move" },
      { id: "f2m/missdad", title: "Miss Dad", filename: "missdadcomplete.md", book: "free2move" },
      { id: "f2m/eye2bridge", title: "Eye to Bridge", filename: "eye2bridge.md", book: "free2move" },
      { id: "f2m/shaman", title: "Shaman", filename: "shaman.md", book: "free2move" },
      { id: "f2m/storm", title: "Storm", filename: "storm.md", book: "free2move" },
      { id: "f2m/ion", title: "Ion", filename: "ion.md", book: "free2move" },
      { id: "f2m/gtabuse", title: "GTA Abuse", filename: "gtabuse.md", book: "free2move" },
      { id: "f2m/unity", title: "Unity", filename: "unity.md", book: "free2move" },
      { id: "f2m/coda", title: "Coda", filename: "coda.md", book: "free2move" },
      { id: "f2m/mcat", title: "MCAT", filename: "mcat.md", book: "free2move" },
      { id: "f2m/zeropercent", title: "Zero Percent", filename: "zeropercent.md", book: "free2move" },
      { id: "f2m/thorair", title: "Thor Air", filename: "thorair.md", book: "free2move" },
      { id: "f2m/vogueair", title: "Vogue Air", filename: "vogueair.md", book: "free2move" },
      { id: "f2m/omgamiokay", title: "Omg Am I Okay", filename: "omgamiokay.md", book: "free2move" },
      { id: "f2m/online", title: "Online", filename: "online.md", book: "free2move" },
      { id: "f2m/cold", title: "Cold", filename: "cold.md", book: "free2move" },
      { id: "f2m/guitarlessons", title: "Guitar Lessons", filename: "guitarlessons.md", book: "free2move" },
      { id: "f2m/longago", title: "Long Ago", filename: "longago.md", book: "free2move" },
      { id: "f2m/safeyn", title: "Safe YN", filename: "safeyn.md", book: "free2move" },
      { id: "f2m/wwtools", title: "WW Tools", filename: "wwtools.md", book: "free2move" },
      { id: "f2m/whalesongs", title: "Whale Songs", filename: "whalesongs.md", book: "free2move" },
      { id: "f2m/shimmer", title: "Shimmer", filename: "shimmer.md", book: "free2move" },
    ]
  },
  {
    key: "newsletters",
    title: "newsletters",
    description: "Newsletter entries",
    texts: [
      { id: "nl/crowplay", title: "Crow Play", filename: "crowplay.md", book: "newsletters" },
      { id: "nl/dxdt", title: "dxdt", filename: "dxdt.md", book: "newsletters" },
      { id: "nl/narcfall", title: "Narc Fall", filename: "narcfall.md", book: "newsletters" },
      { id: "nl/twodads", title: "Two Dads", filename: "twodads.md", book: "newsletters" },
      { id: "nl/barballs", title: "Bar Balls", filename: "barballs.md", book: "newsletters" },
    ]
  },
  {
    key: "aws",
    title: "aws",
    description: "AWS series",
    texts: [
      { id: "aws/bio", title: "Artist Biography", filename: "Artist Biography.md", book: "aws" },
    ]
  },
];

export function getTextById(id: string): BookText | undefined {
  for (const book of BOOKS) {
    const text = book.texts.find(t => t.id === id);
    if (text) return text;
  }
  return undefined;
}
