"""Minimal single-band GeoTIFF reader (numpy only).

Supports what the SoilGrids WCS and WorldClim files use: strips or tiles,
no/deflate/LZW compression, predictor 1/2/3, integer or float samples,
and the ModelPixelScale/ModelTiepoint georeferencing tags.
"""
import struct
import zlib

import numpy as np

_TYPES = {1: 'B', 2: 's', 3: 'H', 4: 'I', 5: 'II', 6: 'b', 8: 'h', 9: 'i',
          11: 'f', 12: 'd', 16: 'Q'}
_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 8: 2, 9: 4, 11: 4, 12: 8, 16: 8}


def _lzw_decode(data):
    """TIFF-flavoured LZW (MSB-first codes, early change)."""
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b'', b'']
    bitpos, nbits, prev = 0, 9, None
    total = len(data) * 8
    while bitpos + nbits <= total:
        byte = bitpos >> 3
        chunk = int.from_bytes(data[byte:byte + 4].ljust(4, b'\0'), 'big')
        code = (chunk >> (32 - (bitpos & 7) - nbits)) & ((1 << nbits) - 1)
        bitpos += nbits
        if code == 256:
            table = table[:258]
            nbits, prev = 9, None
            continue
        if code == 257:
            break
        if prev is None:
            entry = table[code]
        elif code < len(table):
            entry = table[code]
            table.append(prev + entry[:1])
        else:
            entry = prev + prev[:1]
            table.append(entry)
        out += entry
        prev = entry
        n = len(table) + 1
        nbits = 12 if n >= 2048 else 11 if n >= 1024 else 10 if n >= 512 else 9
    return bytes(out)


def read_geotiff(path):
    """Return (array, transform) where transform = (x0, dx, y0, dy) for the
    top-left corner of the top-left pixel; dy is negative for north-up."""
    with open(path, 'rb') as f:
        buf = f.read()
    end = '<' if buf[:2] == b'II' else '>'
    (ifd,) = struct.unpack(end + 'I', buf[4:8])
    (n,) = struct.unpack(end + 'H', buf[ifd:ifd + 2])
    tags = {}
    for i in range(n):
        e = ifd + 2 + 12 * i
        tag, typ, count = struct.unpack(end + 'HHI', buf[e:e + 8])
        size = _SIZES[typ] * count
        off = e + 8 if size <= 4 else struct.unpack(end + 'I', buf[e + 8:e + 12])[0]
        fmt = _TYPES[typ]
        if typ == 2:
            tags[tag] = buf[off:off + count]
        else:
            tags[tag] = struct.unpack(end + fmt * count, buf[off:off + size])

    width, height = tags[256][0], tags[257][0]
    bps = tags[258][0]
    compression = tags.get(259, (1,))[0]
    predictor = tags.get(317, (1,))[0]
    fmt = tags.get(339, (1,))[0]  # 1 uint, 2 int, 3 float
    kind = {1: 'u', 2: 'i', 3: 'f'}[fmt]
    dtype = np.dtype(end + kind + str(bps // 8))

    if 322 in tags:  # tiled
        tw, th = tags[322][0], tags[323][0]
        offsets, counts = tags[324], tags[325]
    else:
        tw, th = width, tags.get(278, (height,))[0]
        offsets, counts = tags[273], tags[279]

    def decode(raw, rows, cols):
        if compression in (8, 32946):
            raw = zlib.decompress(raw)
        elif compression == 5:
            raw = _lzw_decode(raw)
        elif compression != 1:
            raise ValueError('unsupported compression %d' % compression)
        if predictor == 3:  # floating-point predictor: byte-shuffled + differenced
            b = np.frombuffer(raw, np.uint8)[:rows * cols * dtype.itemsize]
            b = b.reshape(rows, cols * dtype.itemsize)
            b = np.cumsum(b, axis=1, dtype=np.uint8)
            b = b.reshape(rows, dtype.itemsize, cols).transpose(0, 2, 1)
            if end == '<':
                b = b[:, :, ::-1]
            return np.ascontiguousarray(b).view(dtype).reshape(rows, cols)
        a = np.frombuffer(raw, dtype)[:rows * cols].reshape(rows, cols).copy()
        if predictor == 2:
            a = np.cumsum(a, axis=1, dtype=a.dtype)
        return a

    out = np.empty((height, width), dtype)
    across = (width + tw - 1) // tw
    for k, (o, c) in enumerate(zip(offsets, counts)):
        r0, c0 = (k // across) * th, (k % across) * tw
        rows = th if 322 in tags else min(th, height - r0)
        block = decode(buf[o:o + c], rows, tw)
        rr, cc = min(rows, height - r0), min(tw, width - c0)
        out[r0:r0 + rr, c0:c0 + cc] = block[:rr, :cc]

    sx, sy = tags[33550][0], tags[33550][1]
    tp = tags[33922]
    x0 = tp[3] - tp[0] * sx
    y0 = tp[4] + tp[1] * sy
    nodata = None
    if 42113 in tags:
        txt = tags[42113].rstrip(b'\0').decode().strip()
        nodata = float(txt) if txt else None
    return out, (x0, sx, y0, -sy), nodata
