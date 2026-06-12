#!/usr/bin/env python3
"""Static file server with HTTP Range support — needed for video seeking.

The stdlib `python -m http.server` ignores `Range:` headers and always returns
the whole file (200), so a browser can't seek inside a video that isn't fully
buffered. This serves byte ranges (206 Partial Content) so the playback scrub
bar works locally, matching how GitHub Pages behaves in production.

    python serve.py [port]     # default 8123
"""
import os
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler


class RangeRequestHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        rng = self.headers.get("Range")
        if rng is None:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        try:
            size = os.fstat(f.fileno()).st_size
            start, end = self._parse_range(rng, size)
            if start is None:
                self.send_response(416)  # Range Not Satisfiable
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                f.close()
                return None

            self.send_response(206)  # Partial Content
            ctype = self.guess_type(path)
            self.send_header("Content-Type", ctype)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.end_headers()
            f.seek(start)
            self._remaining = end - start + 1
            return f
        except Exception:
            f.close()
            raise

    def copyfile(self, source, outputfile):
        # honor the byte budget set in send_head for ranged responses
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        self._remaining = None
        while remaining > 0:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

    @staticmethod
    def _parse_range(header, size):
        if not header.startswith("bytes="):
            return None, None
        spec = header[len("bytes="):].split(",")[0].strip()
        if "-" not in spec:
            return None, None
        s, _, e = spec.partition("-")
        try:
            if s == "":  # suffix range: last N bytes
                length = int(e)
                if length <= 0:
                    return None, None
                start = max(0, size - length)
                end = size - 1
            else:
                start = int(s)
                end = int(e) if e else size - 1
        except ValueError:
            return None, None
        end = min(end, size - 1)
        if start > end or start >= size:
            return None, None
        return start, end


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    directory = os.path.dirname(os.path.abspath(__file__))
    handler = partial(RangeRequestHandler, directory=directory)
    httpd = HTTPServer(("0.0.0.0", port), handler)
    print(f"Serving {directory} with Range support at http://127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
