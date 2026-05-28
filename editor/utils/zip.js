// Minimal store-only (uncompressed) ZIP reader and writer. Sufficient for
// bundling a handful of small text/JS files for abstract export/import; not a
// general-purpose ZIP implementation (no compression, no encryption, no zip64).

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let crcTable = null;
function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
    }
    return crcTable;
}

function crc32(bytes) {
    const t = getCrcTable();
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
    const d = date || new Date();
    const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >>> 1) & 0x1f);
    const dt = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
    return { time, date: dt };
}

/**
 * Build a ZIP archive (store method) from an array of `{ name, text }` entries.
 * @param {{name: string, text: string}[]} files
 * @returns {Blob} ZIP blob (type `application/zip`).
 */
export function buildZip(files) {
    const { time, date } = dosDateTime();
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    for (const f of files) {
        const nameBytes = textEncoder.encode(f.name);
        const data = textEncoder.encode(f.text);
        const crc = crc32(data);
        const size = data.length;

        const local = new Uint8Array(30 + nameBytes.length + size);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);    // local file header signature
        lv.setUint16(4, 20, true);            // version needed
        lv.setUint16(6, 0, true);             // gp flags
        lv.setUint16(8, 0, true);             // method = store
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);         // compressed size
        lv.setUint32(22, size, true);         // uncompressed size
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);            // extra len
        local.set(nameBytes, 30);
        local.set(data, 30 + nameBytes.length);
        localChunks.push(local);

        const central = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);    // central directory signature
        cv.setUint16(4, 20, true);            // version made by
        cv.setUint16(6, 20, true);            // version needed
        cv.setUint16(8, 0, true);             // gp flags
        cv.setUint16(10, 0, true);            // method = store
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);            // extra len
        cv.setUint16(32, 0, true);            // comment len
        cv.setUint16(34, 0, true);            // disk #
        cv.setUint16(36, 0, true);            // internal attrs
        cv.setUint32(38, 0, true);            // external attrs
        cv.setUint32(42, offset, true);       // local header offset
        central.set(nameBytes, 46);
        centralChunks.push(central);

        offset += local.length;
    }

    const centralSize = centralChunks.reduce((s, c) => s + c.length, 0);
    const centralOffset = offset;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);        // EOCD signature
    ev.setUint16(4, 0, true);                 // disk #
    ev.setUint16(6, 0, true);                 // disk where central starts
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);                // comment len

    return new Blob([...localChunks, ...centralChunks, eocd], { type: 'application/zip' });
}

/**
 * Parse a ZIP archive (store method only) into `{ name, text }` entries.
 * Throws if a compressed entry is encountered.
 * @param {ArrayBuffer} buffer
 * @returns {{name: string, text: string}[]}
 */
export function readZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // Locate End-of-Central-Directory record by scanning backwards (variable
    // length comment field means it can be up to 65557 bytes from EOF).
    let eocdOffset = -1;
    const maxScan = Math.max(0, bytes.length - 22 - 65535);
    for (let i = bytes.length - 22; i >= maxScan; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
    }
    if (eocdOffset < 0) throw new Error('Not a ZIP file (no EOCD found)');

    const numEntries = view.getUint16(eocdOffset + 10, true);
    const centralOffset = view.getUint32(eocdOffset + 16, true);

    const entries = [];
    let p = centralOffset;
    for (let i = 0; i < numEntries; i++) {
        if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
        const method = view.getUint16(p + 10, true);
        const compressedSize = view.getUint32(p + 20, true);
        const uncompressedSize = view.getUint32(p + 24, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localOffset = view.getUint32(p + 42, true);
        const name = textDecoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;

        if (method !== 0) throw new Error(`ZIP entry "${name}" uses unsupported compression`);

        // Read local file header to locate the data payload.
        if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Corrupt ZIP local header');
        const lNameLen = view.getUint16(localOffset + 26, true);
        const lExtraLen = view.getUint16(localOffset + 28, true);
        const dataOffset = localOffset + 30 + lNameLen + lExtraLen;
        const data = bytes.subarray(dataOffset, dataOffset + compressedSize);
        if (data.length !== uncompressedSize) throw new Error(`ZIP entry "${name}" size mismatch`);

        entries.push({ name, text: textDecoder.decode(data) });
    }
    return entries;
}
