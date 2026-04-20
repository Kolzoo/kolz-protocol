use serde::Serialize;
use serde_json::Value;

/// Global output style selector. Defaults to `Table`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Table,
    Json,
}

impl OutputFormat {
    pub fn from_flag(json: bool) -> Self {
        if json {
            OutputFormat::Json
        } else {
            OutputFormat::Table
        }
    }
}

/// Render a key value table to stdout. Each row is left aligned to the
/// width of the longest label so eyes can scan a column of values quickly.
pub fn render_table(title: &str, rows: &[(&str, String)]) {
    let label_width = rows.iter().map(|(k, _)| k.len()).max().unwrap_or(0);
    println!("== {} ==", title);
    for (k, v) in rows {
        println!("{:<width$}  {}", k, v, width = label_width);
    }
}

/// Print any `Serialize` payload as pretty JSON on stdout.
pub fn render_json<T: Serialize>(value: &T) {
    match serde_json::to_string_pretty(value) {
        Ok(json) => println!("{}", json),
        Err(err) => {
            eprintln!("serde error: {}", err);
            let fallback: Value = Value::String(format!("serialize-failure: {}", err));
            println!("{}", fallback);
        }
    }
}

/// Render either as table or JSON based on the requested format.
pub fn render<T: Serialize>(format: OutputFormat, title: &str, rows: &[(&str, String)], value: &T) {
    match format {
        OutputFormat::Table => render_table(title, rows),
        OutputFormat::Json => render_json(value),
    }
}

/// Format a 32 byte hash as a lowercase hex string with no `0x` prefix.
pub fn fmt_hex32(bytes: &[u8; 32]) -> String {
    let mut s = String::with_capacity(64);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Format a slot height as a human readable decimal string.
pub fn fmt_slot(slot: u64) -> String {
    format!("{}", slot)
}

/// Format a lamport amount with both raw and SOL representations.
pub fn fmt_lamports(lamports: u64) -> String {
    let sol = lamports as f64 / 1_000_000_000.0;
    format!("{} lamports ({:.9} SOL)", lamports, sol)
}
