.PHONY: build test lint format clean deploy-localnet deploy-devnet sdk-build sdk-test cli-build help

help:
	@echo "COLS protocol build targets"
	@echo "  build              Build anchor program and Rust CLI"
	@echo "  test               Run Rust tests and TypeScript SDK tests"
	@echo "  lint               Run cargo clippy across the workspace"
	@echo "  format             Run cargo fmt across the workspace"
	@echo "  clean              Remove build artifacts"
	@echo "  sdk-build          Build the TypeScript SDK only"
	@echo "  sdk-test           Run the TypeScript SDK tests only"
	@echo "  cli-build          Build the Rust CLI binary only"
	@echo "  deploy-localnet    Deploy program to a local validator"
	@echo "  deploy-devnet      Deploy program to Solana devnet"

build:
	anchor build
	cargo build --release -p cols-cli

test:
	cargo test --workspace
	cd sdk && yarn test

lint:
	cargo clippy --workspace --all-targets -- -D warnings

format:
	cargo fmt --all

clean:
	cargo clean
	rm -rf sdk/dist
	rm -rf node_modules
	rm -rf sdk/node_modules
	rm -rf tests/node_modules
	rm -rf examples/node_modules
	rm -rf .anchor
	rm -rf test-ledger

sdk-build:
	cd sdk && yarn install --frozen-lockfile && yarn build

sdk-test:
	cd sdk && yarn test

cli-build:
	cargo build --release -p cols-cli

deploy-localnet:
	anchor deploy --provider.cluster localnet

deploy-devnet:
	anchor deploy --provider.cluster devnet
