use anchor_lang::solana_program::hash::hashv;

/// Length of an Anchor 8 byte discriminator.
pub const DISCRIMINATOR_LEN: usize = 8;

/// Compute the Anchor 8 byte discriminator for a global instruction by name.
///
/// Anchor derives instruction discriminators as
/// `sha256("global:<snake_case_name>")[..8]` for the global namespace, which
/// is the namespace used by every instruction in the kolz program.
pub fn instruction(name: &str) -> [u8; DISCRIMINATOR_LEN] {
    let preimage = format!("global:{}", name);
    let digest = hashv(&[preimage.as_bytes()]);
    let mut out = [0u8; DISCRIMINATOR_LEN];
    out.copy_from_slice(&digest.to_bytes()[..DISCRIMINATOR_LEN]);
    out
}

/// Compute the Anchor 8 byte discriminator for an account struct by name.
///
/// Anchor derives account discriminators as
/// `sha256("account:<PascalCaseName>")[..8]`. The caller passes the exact
/// account struct name in PascalCase as written in the on-chain crate.
pub fn account(name: &str) -> [u8; DISCRIMINATOR_LEN] {
    let preimage = format!("account:{}", name);
    let digest = hashv(&[preimage.as_bytes()]);
    let mut out = [0u8; DISCRIMINATOR_LEN];
    out.copy_from_slice(&digest.to_bytes()[..DISCRIMINATOR_LEN]);
    out
}

/// Format a discriminator as a comma separated hex string for diagnostics.
pub fn fmt(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discriminators_are_deterministic() {
        let a = instruction("init_config");
        let b = instruction("init_config");
        assert_eq!(a, b);
        assert_eq!(a.len(), DISCRIMINATOR_LEN);
    }

    #[test]
    fn instruction_and_account_namespaces_differ() {
        let i = instruction("init_config");
        let a = account("Config");
        assert_ne!(i, a);
    }
}
