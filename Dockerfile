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
COPY programs/cols/Cargo.toml programs/cols/Cargo.toml
COPY rust-toolchain.toml rust-toolchain.toml
COPY rustfmt.toml rustfmt.toml
COPY clippy.toml clippy.toml

COPY programs programs
COPY cli cli

RUN cargo build --release -p cols-cli

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1000 cols \
    && useradd --system --uid 1000 --gid cols --create-home --shell /bin/bash cols

COPY --from=builder /build/target/release/cols /usr/local/bin/cols

USER cols
WORKDIR /home/cols

ENTRYPOINT ["cols"]
CMD ["--help"]
