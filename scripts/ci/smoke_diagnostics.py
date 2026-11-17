import pathlib
import subprocess


def run_logged(command, log_path, *, tail_bytes=16_384):
    """Run a command into a private log and preserve a bounded failure tail."""
    path = pathlib.Path(log_path)
    with path.open('a+b') as log:
        start = log.tell()
        try:
            return subprocess.run(command, check=True, stdout=log, stderr=log)
        except subprocess.CalledProcessError as error:
            log.flush()
            log.seek(start)
            data = log.read()[-tail_bytes:].decode('utf-8', errors='replace')
            raise RuntimeError(f'{error}\n--- command log tail ---\n{data}') from error
