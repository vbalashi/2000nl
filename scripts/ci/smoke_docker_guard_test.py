import copy
import io
import pathlib
import sys
import tempfile
import unittest
from smoke_docker_guard import snapshot, validate_cleanup, reconcile_partial, validate_database, require_confirmed_start
from smoke_diagnostics import read_tail, run_logged


class GuardTest(unittest.TestCase):
    def setUp(self):
        self.project = 'qa164-1234567890abcdef'
        self.network_id = 'a' * 64
        self.labels = {'com.supabase.cli.project': self.project, 'com.docker.compose.project': self.project}
        self.network = {'Id': self.network_id, 'Name': self.project + '-net', 'Labels': {'2000nl.smoke.owner': self.project}, 'Containers': {'c' * 64: {}}}
        self.container = {'Id': 'c' * 64, 'Name': '/supabase_db_' + self.project, 'Config': {'Labels': self.labels}, 'NetworkSettings': {'Networks': {self.project + '-net': {'NetworkID': self.network_id}}, 'Ports': {'5432/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '12345'}]}}}
        self.volume = {'Name': 'supabase_db_' + self.project, 'Labels': self.labels, 'Driver': 'local', 'CreatedAt': '2026-01-01T00:00:00Z'}

    def snap(self):
        return snapshot(self.project, self.network_id, self.network, [self.container], [self.volume])

    def test_owned_inventory(self):
        self.assertEqual(self.snap(), self.snap())

    def test_collision_and_foreign_attachment_are_rejected(self):
        self.container['Config']['Labels'] = {'com.supabase.cli.project': 'someone-else'}
        with self.assertRaises(ValueError): self.snap()
        self.container['Config']['Labels'] = self.labels
        self.network['Containers']['foreign'] = {}
        with self.assertRaises(ValueError): self.snap()

    def test_uncertain_start_and_replaced_volume_are_rejected(self):
        original = self.snap()
        with self.assertRaises(ValueError): validate_cleanup(None, original)
        self.volume['CreatedAt'] = '2026-01-02T00:00:00Z'
        with self.assertRaises(ValueError): validate_cleanup(original, self.snap())

    def test_partial_start_requires_confirmation_and_valid_inventory(self):
        current = self.snap()
        with self.assertRaises(ValueError): reconcile_partial(current, False)
        self.assertEqual(reconcile_partial(current, True), current)

    def test_wrong_database_binding_is_rejected(self):
        validate_database(self.container, self.container['Id'], self.project, self.network_id, 12345)
        self.container['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort'] = '12346'
        with self.assertRaises(ValueError):
            validate_database(self.container, self.container['Id'], self.project, self.network_id, 12345)

    def test_late_create_after_failed_start_never_authorizes_cleanup(self):
        initially_empty = (frozenset(), {})
        late_resource = self.snap()
        for inventory in (initially_empty, late_resource):
            with self.assertRaises(ValueError):
                require_confirmed_start(self.network_id, True, False)
            with self.assertRaises(ValueError):
                reconcile_partial(inventory, False)
        with self.assertRaises(ValueError):
            require_confirmed_start(None, False, False)

    def test_replaced_network_is_rejected(self):
        self.network['Id'] = 'different'
        with self.assertRaises(ValueError): self.snap()

    def test_failed_command_preserves_stderr_from_disposable_log(self):
        with tempfile.TemporaryDirectory() as directory:
            log = pathlib.Path(directory) / 'bootstrap.log'
            log.write_text('unrelated earlier command output\n')
            with self.assertRaisesRegex(RuntimeError, 'specific postflight failure'):
                try:
                    run_logged(
                        [sys.executable, '-c', "import sys; print('specific postflight failure', file=sys.stderr); raise SystemExit(3)"],
                        log,
                    )
                except RuntimeError as error:
                    self.assertNotIn('unrelated earlier command output', str(error))
                    raise

    def test_failed_command_reads_only_bounded_tail(self):
        with tempfile.TemporaryDirectory() as directory:
            log = pathlib.Path(directory) / 'large.log'
            command = [
                sys.executable,
                '-c',
                "import os,sys; os.write(2, b'early-marker' + b'x' * 1048576 + b'late-marker'); raise SystemExit(3)",
            ]
            with self.assertRaises(RuntimeError) as caught:
                run_logged(command, log, tail_bytes=128)
            message = str(caught.exception)
            tail = message.split('--- command log tail ---\n', 1)[1]
            self.assertIn('late-marker', tail)
            self.assertNotIn('early-marker', tail)
            self.assertLessEqual(len(tail.encode()), 128)
            self.assertLess(len(message.encode()), 1024)
            self.assertGreater(log.stat().st_size, 1_000_000)

    def test_tail_reader_never_uses_unbounded_read(self):
        class RecordingStream(io.BytesIO):
            def __init__(self, value):
                super().__init__(value)
                self.read_sizes = []

            def read(self, size=-1):
                self.read_sizes.append(size)
                return super().read(size)

        stream = RecordingStream(b'x' * 1_048_576 + b'late-marker')
        stream.seek(0, 2)
        tail = read_tail(stream, 0, 128)
        self.assertEqual(stream.read_sizes, [128])
        self.assertEqual(len(tail), 128)
        self.assertTrue(tail.endswith(b'late-marker'))


if __name__ == '__main__': unittest.main()
