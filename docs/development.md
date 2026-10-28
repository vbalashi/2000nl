# Run your own copy

2000NL can run on your own infrastructure. You choose where to host it,
which dictionaries to load and which optional services to connect.

## What you need

- **The application:** a Node.js environment, or a container built from the
  included Dockerfile.
- **A database and accounts:** PostgreSQL together with Supabase authentication
  and Realtime. The included local Supabase configuration provides these services
  for trying the application on your computer.
- **Dictionary content:** start with the small demonstration fixtures, or load
  content you have permission to use. The open data formats describe the
  supported fields and language-specific details.

Connect the application to these services through its environment settings.
The repository includes an example configuration and a local setup script;
those files are the current reference as the application evolves.

Dictionary names and catalog settings can be supplied through a source profile.
These settings are visible to the browser: use them for labels and catalog
compatibility, never for private prompts or credentials. The importer uses the
installation’s profile too. Choose its identity settings before importing content
and keep them stable when updating an existing dictionary. An existing operator
can supply importer metadata through a server environment setting or a mounted
profile file, and public display settings through the application’s build settings.
Keep those values aligned with the database; changing a code license does not
change dictionary identities. Dictionary content
and access permissions are managed separately.

## Optional connections

**Translation** needs your own compatible AI service credentials and prompt
resources. **Audio** needs a supported text-to-speech service and its credentials.
You can start with the vocabulary and training features, then add these services.

Keep private prompts and credentials on the server. Supply them through
server environment variables or a secret manager such as Vault; prompt files
can also be mounted privately. They do not belong in browser settings or a
public repository. Without the required resources, the related optional feature
will be unavailable.

## Hosting for other people

Before opening an installation to users, configure your domain, secure
connections, account emails and backups. Decide which content people can access
and provide appropriate service and privacy information.

If the server reaches Supabase through an internal address, set
`PUBLIC_SUPABASE_URL` to the browser-accessible HTTPS endpoint and
`PUBLIC_SUPABASE_ANON_KEY` to its public key. Admin Google sign-in uses this
public endpoint for the browser redirect; callback and service requests keep
using the internal server endpoint. Portable builds require this explicit public
URL rather than falling back to a build-time placeholder.

Implementation details, available settings and automated checks live in the
code. This guide describes the connections rather than a fixed deployment recipe.
