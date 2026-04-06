.PHONY: install build test

# sharp (wrangler v4 dep) fails to find prebuilt binaries on macOS ARM + Node 25.
# SHARP_IGNORE_GLOBAL_LIBVIPS=1 forces it to use bundled libvips instead of a global one.
# See: https://github.com/cloudflare/workers-sdk/issues/3321
install:
	SHARP_IGNORE_GLOBAL_LIBVIPS=1 yarn install

build:
	yarn build

test:
	yarn vitest run
