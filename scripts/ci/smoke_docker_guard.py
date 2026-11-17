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


def reconcile_partial(current, startup_confirmed):
    if not startup_confirmed:
        raise ValueError('Startup may still be changing the inventory')
    return current


def validate_database(container, container_id, project, network_id, port):
    if container.get('Id') != container_id or container.get('Name') != '/supabase_db_' + project:
        raise ValueError('Database container identity changed')
    labels = container.get('Config', {}).get('Labels') or {}
    network = container.get('NetworkSettings', {}).get('Networks', {}).get(project + '-net', {})
    ports = container.get('NetworkSettings', {}).get('Ports', {}).get('5432/tcp')
    if (labels.get('com.supabase.cli.project') != project or network.get('NetworkID') != network_id
            or ports != [{'HostIp': '127.0.0.1', 'HostPort': str(port)}]):
        raise ValueError('Database binding or ownership mismatch')


def require_confirmed_start(network_id, project_started, startup_confirmed):
    if not network_id:
        raise ValueError('Network creation response was not confirmed')
    if project_started and not startup_confirmed:
        raise ValueError('Supabase startup was not confirmed; resources may still appear')
