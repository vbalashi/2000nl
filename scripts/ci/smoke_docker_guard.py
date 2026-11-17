"""Fail-closed ownership checks for the disposable smoke's Docker resources."""


def validate_network(network, network_id, project):
    if (network.get('Id') != network_id or network.get('Name') != project + '-net'
            or (network.get('Labels') or {}).get('2000nl.smoke.owner') != project):
        raise ValueError('Network identity or ownership changed')


def snapshot(project, network_id, network, containers, volumes):
    validate_network(network, network_id, project)
    ids = set()
    for container in containers:
        labels = container.get('Config', {}).get('Labels') or {}
        name = container.get('Name', '').lstrip('/')
        networks = container.get('NetworkSettings', {}).get('Networks') or {}
        if (not name.startswith('supabase_') or not name.endswith('_' + project)
                or labels.get('com.supabase.cli.project') != project
                or labels.get('com.docker.compose.project') != project
                or networks.get(project + '-net', {}).get('NetworkID') != network_id):
            raise ValueError('Container ownership cannot be established')
        ids.add(container['Id'])
    if set((network.get('Containers') or {}).keys()) != ids:
        raise ValueError('Network has unexpected attachments')
    fingerprints = {}
    for volume in volumes:
        labels = volume.get('Labels') or {}
        name = volume.get('Name', '')
        if (name not in ('supabase_db_' + project, 'supabase_storage_' + project)
                or labels.get('com.supabase.cli.project') != project
                or labels.get('com.docker.compose.project') != project
                or volume.get('Driver') != 'local' or not volume.get('CreatedAt')):
            raise ValueError('Volume ownership cannot be established')
        fingerprints[name] = (volume['CreatedAt'], volume['Driver'], tuple(sorted(labels.items())))
    return (frozenset(ids), fingerprints)


def validate_cleanup(expected, current):
    if expected is None:
        raise ValueError('Startup did not finish; resource ownership is uncertain')
    if expected != current:
        raise ValueError('Resource inventory changed since startup')
