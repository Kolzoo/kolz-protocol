import { PublicKey } from "@solana/web3.js";

/**
 * Hand-rolled little endian borsh writer. We avoid pulling the full
 * @coral-xyz/anchor IDL machinery so the SDK stays slim. Only the
 * subset of borsh that the kolz program actually uses is implemented:
 * fixed sized primitives, fixed length byte arrays, length-prefixed
 * strings, and length-prefixed Vec<[u8;32]>.
 */
export class BorshWriter {
  private chunks: Uint8Array[] = [];
  private total: number = 0;

  public u8(value: number): this {
    const b = new Uint8Array(1);
    b[0] = value & 0xff;
    return this.push(b);
  }

  public u32(value: number): this {
    const b = new Uint8Array(4);
    b[0] = value & 0xff;
    b[1] = (value >>> 8) & 0xff;
    b[2] = (value >>> 16) & 0xff;
    b[3] = (value >>> 24) & 0xff;
    return this.push(b);
  }

  public u64(value: bigint): this {
    if (value < 0n) {
      throw new Error("BorshWriter.u64: negative");
    }
    const b = new Uint8Array(8);
    let v = value;
    for (let i = 0; i < 8; i++) {
      b[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return this.push(b);
  }

  public bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  public fixedBytes(value: Uint8Array, length: number): this {
    if (value.length !== length) {
      throw new Error(
        `BorshWriter.fixedBytes: expected ${length} bytes, got ${value.length}`
      );
    }
    return this.push(value);
  }

  public pubkey(value: PublicKey): this {
    return this.fixedBytes(value.toBytes(), 32);
  }

  public string(value: string): this {
    const bytes = Buffer.from(value, "utf8");
    this.u32(bytes.length);
    return this.push(bytes);
  }

  public vecBytes32(values: Uint8Array[]): this {
    this.u32(values.length);
    for (const v of values) {
      this.fixedBytes(v, 32);
    }
    return this;
  }

  public raw(bytes: Uint8Array): this {
    return this.push(bytes);
  }

  public toBuffer(): Buffer {
    const out = Buffer.alloc(this.total);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  private push(b: Uint8Array): this {
    this.chunks.push(b);
    this.total += b.length;
    return this;
  }
}

/**
 * Hand-rolled little endian borsh reader. Position is tracked
 * internally; callers can inspect `offset` to confirm full consumption.
 */
export class BorshReader {
  public offset: number = 0;

  public constructor(private readonly buf: Uint8Array) {}

  public u8(): number {
    this.require(1);
    const v = this.buf[this.offset];
    this.offset += 1;
    return v;
  }

  public u32(): number {
    this.require(4);
    const o = this.offset;
    const v =
      this.buf[o] |
      (this.buf[o + 1] << 8) |
      (this.buf[o + 2] << 16) |
      (this.buf[o + 3] << 24);
    this.offset += 4;
    return v >>> 0;
  }

  public u64(): bigint {
    this.require(8);
    let v = 0n;
    for (let i = 7; i >= 0; i--) {
      v = (v << 8n) | BigInt(this.buf[this.offset + i]);
    }
    this.offset += 8;
    return v;
  }

  public bool(): boolean {
    const b = this.u8();
    if (b !== 0 && b !== 1) {
      throw new Error(`BorshReader.bool: invalid value ${b}`);
    }
    return b === 1;
  }

  public fixedBytes(length: number): Uint8Array {
    this.require(length);
    const out = this.buf.slice(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  public pubkey(): PublicKey {
    return new PublicKey(this.fixedBytes(32));
  }

  public string(): string {
    const len = this.u32();
    this.require(len);
    const out = Buffer.from(this.buf.slice(this.offset, this.offset + len)).toString("utf8");
    this.offset += len;
    return out;
  }

  public vecBytes32(): Uint8Array[] {
    const len = this.u32();
    const out: Uint8Array[] = [];
    for (let i = 0; i < len; i++) {
      out.push(this.fixedBytes(32));
    }
    return out;
  }

  public remaining(): number {
    return this.buf.length - this.offset;
  }

  private require(n: number): void {
    if (this.offset + n > this.buf.length) {
      throw new Error(
        `BorshReader: out of bounds, need ${n} bytes at offset ${this.offset} of ${this.buf.length}`
      );
    }
  }
}
