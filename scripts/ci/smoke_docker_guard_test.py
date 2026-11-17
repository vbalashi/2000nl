import copy
import unittest
from smoke_docker_guard import snapshot, validate_cleanup, reconcile_partial, validate_database, recover_network


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

    def test_partial_start_requires_quiescence_and_valid_inventory(self):
        current = self.snap()
        with self.assertRaises(ValueError): reconcile_partial(current, False)
        self.assertEqual(reconcile_partial(current, True), current)

    def test_wrong_database_binding_is_rejected(self):
        validate_database(self.container, self.container['Id'], self.project, self.network_id, 12345)
        self.container['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort'] = '12346'
        with self.assertRaises(ValueError):
            validate_database(self.container, self.container['Id'], self.project, self.network_id, 12345)

    def test_network_lost_response_recovers_only_matching_nonce(self):
        self.assertEqual(recover_network([self.network], self.project), self.network_id)
        with self.assertRaises(ValueError): recover_network([], self.project)
        with self.assertRaises(ValueError): recover_network([self.network, self.network], self.project)
        self.network['Labels'] = {'2000nl.smoke.owner': 'foreign'}
        with self.assertRaises(ValueError): recover_network([self.network], self.project)

    def test_replaced_network_is_rejected(self):
        self.network['Id'] = 'different'
        with self.assertRaises(ValueError): self.snap()


if __name__ == '__main__': unittest.main()
