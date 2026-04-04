"""
railway whoami
cd "D:\University\MIE Project"
railway link
railway ssh
cd /data/results
ls -1
"""




import http.server
import json
import os
import pathlib
import time
import re
from urllib.parse import urlparse


def _safe_token(s: str) -> str:
    """Sanitize a string for use in filenames."""
    s = str(s or "").strip()
    # remove spaces and convert to lowercase to normalize names
    s = s.replace(" ", "")
    # allow only alphanumeric characters and dashes/underscores
    s = re.sub(r"[^A-Za-z0-9_-]", "", s)
    return s or "unknown"


class ResultSavingRequestHandler(http.server.SimpleHTTPRequestHandler):
    """
    Custom request handler that serves static files from the `web` directory
    and persists results and survey responses to CSV files.
    """

    # Serve static files from the `web` directory relative to this file.
    web_dir = pathlib.Path(__file__).resolve().parent / "web"

    def translate_path(self, path: str) -> str:
        """Resolve the requested path into our static directory."""
        parsed = urlparse(path)
        rel = parsed.path.lstrip("/")
        # Default to index.html when requesting the root or an empty path
        if rel == "":
            rel = "index.html"
        return str(self.web_dir / rel)
    
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/download-results":
            file_path = pathlib.Path("/data/results.tar.gz")

            if not file_path.exists():
                self.send_error(404, "results.tar.gz not found")
                return

            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/gzip")
                self.send_header("Content-Disposition", 'attachment; filename="results.tar.gz"')
                self.send_header("Content-Length", str(file_path.stat().st_size))
                self.end_headers()

                with file_path.open("rb") as f:
                    self.wfile.write(f.read())
            except OSError:
                self.send_error(500, "Internal Server Error: unable to read archive")
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/submit":
            self._handle_submit()
            return
        self.send_error(404, "Not Found")

    def _handle_submit(self):
        """Persist survey responses or game results to CSV files."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            self.send_error(400, "Bad Request: missing Content-Length")
            return
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(400, "Bad Request: invalid JSON")
            return

        # Extract common fields and sanitize them
        first_name = _safe_token(data.get("first_name"))
        last_name = _safe_token(data.get("last_name"))
        mode = _safe_token(data.get("mode"))
        attempt = _safe_token(data.get("attempt"))

        # Validate required fields
        if not first_name or not last_name or not mode:
            self.send_error(400, "Bad Request: missing required fields")
            return

        # Determine output directory; use persistent volume if available
        out_dir = pathlib.Path(os.environ.get(
            "RESULTS_DIR",
            pathlib.Path(__file__).resolve().parent / "results"
        ))
        out_dir.mkdir(parents=True, exist_ok=True)

        if mode in {"auditory", "visual"}:
            # Game trial results
            # Ensure attempt is something like 1, 2, 3
            if not attempt:
                attempt = "1"
            filename = f"{first_name}{last_name}_{mode}_trial{attempt}.csv"
            events = data.get("events", [])
            try:
                out_file = out_dir / filename
                # Determine if header is needed
                file_exists = out_file.exists()
                with out_file.open("a", encoding="utf-8") as f:
                    # Write header when creating a new file
                    if not file_exists:
                        f.write(
                            "game_timestamp,first_name,last_name,mode,trial,click_time,status,target_x,target_y,click_x,click_y\n"
                        )
                    game_timestamp = int(time.time())
                    for event in events:
                        line = (
                            f"{game_timestamp},{first_name},{last_name},{mode},{attempt},"
                            f"{event.get('time','')},{event.get('status','')},"
                            f"{event.get('target_x','')},{event.get('target_y','')},"
                            f"{event.get('click_x','')},{event.get('click_y','')}\n"
                        )
                        f.write(line)
            except OSError:
                self.send_error(500, "Internal Server Error: unable to write results")
                return

        elif mode in {"pre_survey", "post_survey"}:
            # Survey responses
            suffix = "pre_survey" if mode == "pre_survey" else "post_survey"
            filename = f"{first_name}{last_name}_{suffix}.csv"
            responses = data.get("responses", {})
            try:
                out_file = out_dir / filename
                # Overwrite survey file each time; keep last submission
                with out_file.open("w", encoding="utf-8") as f:
                    f.write("question,answer\n")
                    for key, value in responses.items():
                        # Escape commas and newlines in values
                        val = str(value).replace("\n", " ").replace(",", ";")
                        f.write(f"{key},{val}\n")
            except OSError:
                self.send_error(500, "Internal Server Error: unable to write survey results")
                return
        else:
            # Unknown mode
            self.send_error(400, "Bad Request: unknown mode")
            return

        # Send a simple success response
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))


def run_server(port: int = 8000):
    """
    Start the HTTP server.  The port can be overridden via the PORT environment
    variable, which is used by many hosting providers (including Railway).
    """
    os.chdir(os.path.dirname(__file__))
    env_port = os.environ.get("PORT")
    try:
        if env_port:
            port = int(env_port)
    except ValueError:
        pass
    server = http.server.HTTPServer(("0.0.0.0", port), ResultSavingRequestHandler)
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
    p = 8000
    if len(sys.argv) > 1:
        try:
            p = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}")
    run_server(p)