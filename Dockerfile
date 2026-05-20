# syntax=docker/dockerfile:1.6

FROM rust:1.78-slim-bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        ca-certificates \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY Cargo.toml Cargo.toml
COPY cli/Cargo.toml cli/Cargo.toml
COPY programs/kolz/Cargo.toml programs/kolz/Cargo.toml
COPY rust-toolchain.toml rust-toolchain.toml
COPY rustfmt.toml rustfmt.toml
COPY clippy.toml clippy.toml

COPY programs programs
COPY cli cli

RUN cargo build --release -p kolz-cli

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 kolz \
    && useradd --system --uid 1000 --gid kolz --create-home --shell /bin/bash kolz

COPY --from=builder /build/target/release/kolz /usr/local/bin/kolz

USER kolz
WORKDIR /home/kolz

ENTRYPOINT ["kolz"]
CMD ["--help"]
