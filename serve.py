"""Local dev server for Pixel Places: serves this folder with caching off.
Usage: python3 serve.py [port]   then open http://127.0.0.1:8765/"""
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
