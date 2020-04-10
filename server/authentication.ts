import { Express } from 'express';
import {
	Issuer,
	Strategy,
	TokenSet,
	UserinfoResponse,
	custom,
	StrategyOptions,
	Client,
} from 'openid-client';
import passport from 'passport';
import session from 'express-session';
import { getRepository } from 'typeorm';
import url from 'url';
import createMemoryStore from 'memorystore';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { User, User as AppUser } from './entities/user';
import { Site } from './entities/site';

const MemoryStore = createMemoryStore(session);

interface AuthStrategyOptions {
	server: string;
	clientId: string;
	clientSecret?: string;
	callbackUrl: string;
	usePKCE?: boolean;
	logoutUrl?: string;
	adminSub?: string;
}

export async function getAuthStrategy({
	server,
	clientId,
	clientSecret,
	usePKCE = false,
	callbackUrl,
	logoutUrl,
	adminSub,
}: AuthStrategyOptions) {
	Issuer[custom.http_options] = (options) => ({ ...options, timeout: 10000 });
	const authIssuer = await Issuer.discover(server);
	const authClient = new authIssuer.Client({
		client_id: clientId,
		client_secret: clientSecret,
		redirect_uris: [callbackUrl],
		post_logout_redirect_uris: logoutUrl ? [logoutUrl] : undefined,
		response_types: ['code'],
		token_endpoint_auth_method: clientSecret
			? 'client_secret_basic'
			: 'none',
	});
	authClient[custom.clock_tolerance] = 1;

	const strategyOptions: StrategyOptions<Client> = {
		client: authClient,
		usePKCE,
		params: {
			redirect_uri: callbackUrl,
			scope: 'openid profile email',
			response_type: 'code',
		},
	};
	const verifier = (
		tokenSet: TokenSet,
		profile: UserinfoResponse,
		done: (error?: Error | null, user?: any) => void,
	) => {
		(async () => {
			if (!profile.email_verified) {
				return done(
					new Error(
						"OIDC: the user's email address is not verified.",
					),
				);
			}

			const existingUser = await getRepository(User).findOne({
				where: { email: profile.email },
				select: ['id'],
			});

			if (existingUser && existingUser.id !== profile.sub) {
				return done(
					new Error(
						"OIDC: the user's email address is already in use.",
					),
				);
			}

			const user = {
				id: profile.sub,
				name: profile.name,
				email: profile.email,
				profileImage: profile.picture || '',
				isAdmin:
					existingUser?.isAdmin ||
					(adminSub && profile.sub === adminSub),
			} as User;

			getRepository(User).save(user);

			return done(null, user);
		})();
	};

	return {
		authStrategy: new Strategy(strategyOptions, verifier),
		authClient,
	};
}

interface AuthSetupOptions {
	server: string;
	clientId: string;
	clientSecret?: string;
	usePKCE?: boolean;
	hostingUrl: string;
	adminSub?: string;
}

export async function setupExpressAuth(
	app: Express,
	{
		server,
		clientId,
		clientSecret,
		usePKCE,
		hostingUrl,
		adminSub,
	}: AuthSetupOptions,
) {
	app.use(
		session({
			secret: 'iowjefowiejf',
			resave: false,
			saveUninitialized: true,
			rolling: true,
			cookie: { maxAge: 30 * 60 * 1000 },
			store: new MemoryStore({ checkPeriod: 3600 * 1000 }),
		}),
	);
	app.use(passport.initialize());
	app.use(passport.session());

	const { authStrategy, authClient } = await getAuthStrategy({
		server,
		clientId,
		clientSecret,
		usePKCE,
		callbackUrl: `${hostingUrl}/oidc-callback`,
		logoutUrl: hostingUrl,
		adminSub,
	});
	passport.use('oidc', authStrategy);

	passport.serializeUser<User, string>((user, done) => {
		return done(null, user.id);
	});

	passport.deserializeUser<User, string>((userId, done) => {
		(async () => {
			try {
				const user = await getRepository(User).findOneOrFail(userId);
				return done(null, user);
			} catch (error) {
				return done(error);
			}
		})();
	});

	app.get('/login', (req, res) =>
		passport.authenticate('oidc', { state: req.query.redirectUrl })(
			req,
			res,
		),
	);
	app.get('/logout', (req, res) => {
		req.logout();
		req.session!.destroy(() => {});
		res.redirect(
			authClient.endSessionUrl({ post_logout_redirect_uri: hostingUrl }),
		);
	});

	app.use(
		'/oidc-callback',
		passport.authenticate('oidc', {
			failureRedirect: '/error',
		}),
		async (req, res) => {
			let redirectUrl = req.query.state || '/';
			if (redirectUrl && !redirectUrl.startsWith('/')) {
				const parsedUrl = url.parse(redirectUrl);
				const site = await getRepository(Site).findOne({
					where: { domain: parsedUrl.host },
					relations: ['editors'],
				});
				if (
					!req.user ||
					!site ||
					!site.editors?.find((user) => user.id === req.user!.id)
				) {
					redirectUrl = '/';
				}
			}
			res.redirect(redirectUrl);
		},
	);
}

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		// eslint-disable-next-line @typescript-eslint/no-empty-interface
		interface User extends AppUser {}
	}
}
