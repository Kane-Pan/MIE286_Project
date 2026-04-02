import http.server
import json
import os
import pathlib
import time
import re
from urllib.parse import urlparse


def _safe_token(s: str) -> str:
    """Keep filenames safe."""
    s = str(s or "").strip().lower()
    s = s.replace(" ", "_")
    s = re.sub(r"[^a-z0-9_\-]", "", s)
    return s or "unknown"


class ResultSavingRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Serve static files from the `web` directory relative to this file.
    # If the request is for the root path "/", default to serving index.html.
    web_dir = pathlib.Path(__file__).resolve().parent / "web"

    def translate_path(self, path: str) -> str:
        """Map the incoming request path into our web directory."""
        parsed = urlparse(path)
        rel = parsed.path.lstrip("/")
        if rel == "":
            rel = "index.html"
        return str(self.web_dir / rel)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/submit":
            self._handle_submit()
            return

        self.send_error(404, "Not Found")

    def _handle_submit(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(400, "Bad Request: invalid JSON")
            return

        mode = _safe_token(data.get("mode", ""))
        attempt = _safe_token(data.get("attempt", ""))

        # Example output: auditory_attempt1.csv
        filename = f"{mode}_attempt{attempt}.csv"

        # Use Railway persistent volume if RESULTS_DIR is set;
        # otherwise fall back to the local results folder.
        out_dir = pathlib.Path(
            os.environ.get(
                "RESULTS_DIR",
                pathlib.Path(__file__).resolve().parent / "results"
            )
        )
        out_dir.mkdir(parents=True, exist_ok=True)

        out_file = out_dir / filename
        file_exists = out_file.exists()

        try:
            with out_file.open("a", encoding="utf-8") as f:
                if not file_exists:
                    f.write("game_timestamp,mode,attempt,click_time,status,target_x,target_y,click_x,click_y\n")

                game_timestamp = int(time.time())

                for event in data.get("events", []):
                    line = (
                        f"{game_timestamp},{mode},{attempt},"
                        f"{event.get('time', '')},{event.get('status', '')},"
                        f"{event.get('target_x', '')},{event.get('target_y', '')},"
                        f"{event.get('click_x', '')},{event.get('click_y', '')}\n"
                    )
                    f.write(line)

        except OSError:
            self.send_error(500, "Internal Server Error: unable to write results")
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))


def run_server(port: int = 8000):
    os.chdir(os.path.dirname(__file__))
    handler_class = ResultSavingRequestHandler

    # Allow the port to be overridden by the environment
    env_port = os.environ.get("PORT")
    try:
        if env_port:
            port = int(env_port)
    except ValueError:
        pass

    server = http.server.HTTPServer(("0.0.0.0", port), handler_class)

    print(f"Serving on port {port}...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Keyboard interrupt: shutting down server")
    finally:
        server.server_close()
        print("Server closed.")


if __name__ == "__main__":
    import sys

    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}")
    run_server(port)