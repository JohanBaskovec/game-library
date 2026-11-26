import qrcode from 'qrcode-generator';

/** A QR code as a single SVG path: a unit square for every dark module, on a grid of `size` by `size`. */
export interface QrCode {
  readonly size: number;
  readonly path: string;
}

/**
 * Draws `text` as a QR code, or returns null when it is too long to fit in one. The code is drawn in the
 * page itself (no image, no remote service), so the link never leaves the device (CLAUDE.md rule 5).
 */
export function createQr(text: string): QrCode | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const size = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        if (qr.isDark(row, column)) path += `M${column} ${row}h1v1h-1z`;
      }
    }
    return { size, path };
  } catch {
    return null;
  }
}
