/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
	eslint: {
		// Disable ESLint during `next build` so the production build can succeed.
		// Keep linting locally and in CI; fix lint errors separately.
		ignoreDuringBuilds: true,
	},
};

export default config;
