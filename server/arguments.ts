import yargs from 'yargs';

const defaultLocalhostUrl = 'http://localhost';

export interface Arguments {
	port: number;
	hostingUrl: string;
	dbType: 'sqlite' | 'mysql' | 'postgres';
	dbHost?: string;
	dbPort?: number;
	dbUsername?: string;
	dbPassword?: string;
	dbDatabase?: string;
	authServer: string;
	authClientId: string;
	authClientSecret: string;
	authPkce: boolean;
	adminSub?: string;
}

export function getArguments(): Arguments {
	const { argv } = yargs.options({
		port: {
			type: 'number',
			default: 3000,
			description: 'Port this server listens on',
		},
		hostingUrl: {
			type: 'string',
			default: defaultLocalhostUrl,
			description: 'Public url of this server',
		},
		dbType: {
			type: 'string',
			default: 'sqlite',
			description: 'Database provider to use',
			choices: ['sqlite', 'mysql', 'postgres'],
		},
		dbHost: {
			type: 'string',
			required: false,
			description: 'Hostname of the database server',
		},
		dbPort: {
			type: 'number',
			required: false,
			description: 'Port of the database server',
		},
		dbUsername: {
			type: 'string',
			required: false,
			description: 'User name for the database server',
		},
		dbPassword: {
			type: 'string',
			required: false,
			description: 'Password for the database server',
		},
		dbDatabase: {
			type: 'string',
			required: false,
			description:
				'For SQLite: location of the database file; for others: database to select',
		},
		authServer: {
			type: 'string',
			required: true,
			description: 'Url of the Auth server',
		},
		authClientId: {
			type: 'string',
			default: 'netlify-gateway-server',
			description: 'client_id for accessing the Auth server',
		},
		authClientSecret: {
			type: 'string',
			description: 'client_secret for accessing the Auth server',
		},
		authPkce: {
			type: 'boolean',
			description: 'Whether PKCE should be used for authentication',
		},
		adminSub: {
			type: 'string',
			description: "A user's `sub` claim to promote as an administrator",
		},
	});

	if (argv.hostingUrl === defaultLocalhostUrl) {
		argv.hostingUrl += `:${argv.port}`;
	}
	return argv as Arguments;
}
