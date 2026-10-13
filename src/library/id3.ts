import type { TrackMeta } from '../types';

const V1_GENRES = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop', 'Jazz', 'Metal',
  'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock', 'Techno', 'Industrial',
  'Alternative', 'Ska', 'Death Metal', 'Pranks', 'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk',
  'Fusion', 'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise',
  'AlternRock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic',
  'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream', 'Southern Rock', 'Comedy', 'Cult', 'Gangsta',
  'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychadelic', 'Rave', 'Showtunes',
  'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz', 'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock',
  'Folk', 'Folk-Rock', 'National Folk', 'Swing', 'Fast Fusion', 'Bebob', 'Latin', 'Revival', 'Celtic', 'Bluegrass',
  'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock', 'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening', 'Acoustic',
  'Humour', 'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata', 'Symphony', 'Booty Bass', 'Primus', 'Porn Groove',
  'Satire', 'Slow Jam', 'Club', 'Tango', 'Samba', 'Folklore', 'Ballad', 'Power Ballad', 'Rhythmic Soul', 'Freestyle',
  'Duet', 'Punk Rock', 'Drum Solo', 'A capella', 'Euro-House', 'Dance Hall', 'Goa', 'Drum & Bass', 'Club-House', 'Hardcore',
  'Terror', 'Indie', 'BritPop', 'Negerpunk', 'Polsk Punk', 'Beat', 'Christian Gangsta Rap', 'Heavy Metal', 'Black Metal', 'Crossover',
  'Contemporary Christian', 'Christian Rock', 'Merengue', 'Salsa', 'Thrash Metal', 'Anime', 'JPop', 'Synthpop',
];

function decodeText(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const enc = bytes[0];
  const body = bytes.subarray(1);
  let s: string;
  try {
    if (enc === 1) {
      // UTF-16 with BOM
      const le = body[0] === 0xff && body[1] === 0xfe;
      const be = body[0] === 0xfe && body[1] === 0xff;
      s = new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(le || be ? body.subarray(2) : body);
    } else if (enc === 2) s = new TextDecoder('utf-16be').decode(body);
    else if (enc === 3) s = new TextDecoder('utf-8').decode(body);
    else s = new TextDecoder('latin1').decode(body);
  } catch {
    s = '';
  }
  // v2.4 allows several NUL-separated values; keep the first
  return s.split('\u0000')[0].trim();
}

function genreName(raw: string): string {
  // "(17)", "(17)Rock", "17"
  const m = /^\((\d+)\)(.*)$/.exec(raw) ?? /^(\d+)$/.exec(raw);
  if (m) {
    if (m[2]) return m[2].trim();
    return V1_GENRES[Number(m[1])] ?? raw;
  }
  return raw;
}

/** "1997", "1997-05-01", "1997/98" → 1997 (a plausible release year), else undefined. */
export function parseYear(raw: string): number | undefined {
  const m = /(19|20)\d\d/.exec(raw);
  if (!m) return undefined;
  const y = Number(m[0]);
  return y >= 1900 && y <= 2100 ? y : undefined;
}

function syncsafe(b: Uint8Array, o: number): number {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

function removeUnsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let j = 0;
  for (let i = 0; i < b.length; i++) {
    out[j++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, j);
}

/** Total size of an ID3v2 tag at the start of `head` (header + body), or 0. */
export function id3v2Size(head: Uint8Array): number {
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  const footer = (head[5] & 0x10) !== 0;
  return 10 + syncsafe(head, 6) + (footer ? 10 : 0);
}

export function parseId3v2(tag: Uint8Array): Partial<TrackMeta> {
  const out: Partial<TrackMeta> = {};
  if (id3v2Size(tag) === 0) return out;
  const major = tag[3];
  const flags = tag[5];
  const size = syncsafe(tag, 6);
  let body = tag.subarray(10, Math.min(tag.length, 10 + size));
  if (flags & 0x80 && major < 4) body = removeUnsync(body);
  let p = 0;
  if (flags & 0x40) {
    // extended header
    const ext = major === 4 ? syncsafe(body, 0) : ((body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]) + 4;
    p = ext;
  }
  const idLen = major === 2 ? 3 : 4;
  const hdrLen = major === 2 ? 6 : 10;
  while (p + hdrLen <= body.length) {
    const id = String.fromCharCode(...body.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    let fsize: number;
    if (major === 2) fsize = (body[p + 3] << 16) | (body[p + 4] << 8) | body[p + 5];
    else if (major === 4) fsize = syncsafe(body, p + 4);
    else fsize = ((body[p + 4] << 24) | (body[p + 5] << 16) | (body[p + 6] << 8) | body[p + 7]) >>> 0;
    const start = p + hdrLen;
    const end = start + fsize;
    if (fsize <= 0 || end > body.length) break;
    let data = body.subarray(start, end);
    if (major === 4 && body[p + 9] & 0x02) data = removeUnsync(data);
    switch (id) {
      case 'TIT2': case 'TT2': out.title = decodeText(data); break;
      case 'TPE1': case 'TP1': out.artist = decodeText(data); break;
      case 'TALB': case 'TAL': out.album = decodeText(data); break;
      case 'TCON': case 'TCO': out.genre = genreName(decodeText(data)); break;
      case 'TBPM': case 'TBP': {
        const v = parseFloat(decodeText(data));
        if (v > 30 && v < 300) out.tagBpm = v;
        break;
      }
      case 'TKEY': case 'TKE': out.tagKey = decodeText(data); break;
      case 'TYER': case 'TYE': case 'TDRC': case 'TDOR': case 'TORY': {
        const y = parseYear(decodeText(data));
        if (y && (!out.year || id === 'TDOR' || id === 'TORY')) out.year = y;
        break;
      }
      case 'APIC': case 'PIC': {
        if (out.artwork) break;
        const enc = data[0];
        let q = 1;
        let mime: string;
        if (id === 'PIC') {
          const fmt = String.fromCharCode(data[1], data[2], data[3]).toLowerCase();
          mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
          q = 4;
        } else {
          const z = data.indexOf(0, 1);
          mime = new TextDecoder('latin1').decode(data.subarray(1, z)) || 'image/jpeg';
          if (!mime.includes('/')) mime = `image/${mime.toLowerCase() === 'png' ? 'png' : 'jpeg'}`;
          q = z + 1;
        }
        q += 1; // picture type
        // description, NUL-terminated (two NULs for UTF-16)
        if (enc === 1 || enc === 2) {
          while (q + 1 < data.length && !(data[q] === 0 && data[q + 1] === 0)) q += 2;
          q += 2;
        } else {
          while (q < data.length && data[q] !== 0) q++;
          q += 1;
        }
        if (q < data.length) out.artwork = { mime, data: data.slice(q) };
        break;
      }
    }
    p = end;
  }
  return out;
}

export function parseId3v1(tail: Uint8Array): Partial<TrackMeta> {
  if (tail.length < 128) return {};
  const t = tail.subarray(tail.length - 128);
  if (t[0] !== 0x54 || t[1] !== 0x41 || t[2] !== 0x47) return {};
  const str = (a: number, b: number) => new TextDecoder('latin1').decode(t.subarray(a, b)).replace(/\u0000.*$/, '').trim();
  return {
    title: str(3, 33) || undefined,
    artist: str(33, 63) || undefined,
    album: str(63, 93) || undefined,
    genre: V1_GENRES[t[127]],
    year: parseYear(str(93, 97)),
  };
}

/** "Artist - Title.mp3" → { artist, title } */
export function metaFromFilename(name: string): { artist: string; title: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(base);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: base };
}

/** Read tags from a File, touching only its head and tail. */
export async function readTags(file: File): Promise<TrackMeta> {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  let v2: Partial<TrackMeta> = {};
  const size = id3v2Size(head);
  if (size > 0) {
    // cap at 8 MB (huge embedded artwork is rare but exists)
    const tag = new Uint8Array(await file.slice(0, Math.min(size, 8 * 1024 * 1024)).arrayBuffer());
    v2 = parseId3v2(tag);
  }
  let v1: Partial<TrackMeta> = {};
  if (!v2.title || !v2.artist || !v2.year) {
    v1 = parseId3v1(new Uint8Array(await file.slice(Math.max(0, file.size - 128)).arrayBuffer()));
  }
  const fromName = metaFromFilename(file.name);
  return {
    title: v2.title || v1.title || fromName.title,
    artist: v2.artist || v1.artist || fromName.artist,
    album: v2.album || v1.album || '',
    genre: v2.genre || v1.genre || '',
    year: v2.year ?? v1.year,
    tagBpm: v2.tagBpm,
    tagKey: v2.tagKey,
    artwork: v2.artwork,
  };
}
