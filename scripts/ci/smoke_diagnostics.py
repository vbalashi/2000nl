import pathlib
import subprocess


def read_tail(log, start, tail_bytes):
    end = log.tell()
    length = min(max(end - start, 0), tail_bytes)
    log.seek(end - length)
    return log.read(length)


def run_logged(command, log_path, *, tail_bytes=16_384):
    """Run a command into a private log and preserve a bounded failure tail."""
    path = pathlib.Path(log_path)
    with path.open('a+b') as log:
        start = log.tell()
        try:
            return subprocess.run(command, check=True, stdout=log, stderr=log)
        except subprocess.CalledProcessError as error:
            log.flush()
            data = read_tail(log, start, tail_bytes).decode('utf-8', errors='replace')
            raise RuntimeError(f'{error}\n--- command log tail ---\n{data}') from error
