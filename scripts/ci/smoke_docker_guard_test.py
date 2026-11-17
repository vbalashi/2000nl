import copy
import unittest
from smoke_docker_guard import snapshot, validate_cleanup


class GuardTest(unittest.TestCase):
    def setUp(self):
        self.project = 'qa164-1234567890abcdef'
        self.network_id = 'n' * 64
        self.labels = {'com.supabase.cli.project': self.project, 'com.docker.compose.project': self.project}
        self.network = {'Id': self.network_id, 'Name': self.project + '-net', 'Labels': {'2000nl.smoke.owner': self.project}, 'Containers': {'c' * 64: {}}}
        self.container = {'Id': 'c' * 64, 'Name': '/supabase_db_' + self.project, 'Config': {'Labels': self.labels}, 'NetworkSettings': {'Networks': {self.project + '-net': {'NetworkID': self.network_id}}}}
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

    def test_replaced_network_is_rejected(self):
        self.network['Id'] = 'different'
        with self.assertRaises(ValueError): self.snap()


if __name__ == '__main__': unittest.main()
