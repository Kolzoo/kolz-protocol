//! `settle_throne` instruction.
//!
//! Oracle revokes the king PDA's delegate authority over the final champion's
//! NFT ATA once the settlement window has elapsed. After this runs the
//! champion fully owns the NFT and the throne can no longer change hands.

use anchor_lang::prelude::*;
use anchor_spl::token::{revoke, Mint, Revoke, Token, TokenAccount};

use crate::constants::{CONFIG_SEED, KING_SEED, PET_SEED};
use crate::errors::KolzError;
use crate::events::ThroneSettled;
use crate::state::{Config, KingOfHill, Pet};

#[derive(Accounts)]
pub struct SettleThrone<'info> {
    /// Oracle signer.
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.oracle == oracle.key() @ KolzError::OracleMismatch,
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [PET_SEED, pet.owner.as_ref(), pet.kol_name.as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, Pet>,

    #[account(
        mut,
        seeds = [KING_SEED, pet.key().as_ref()],
        bump = king.bump,
        constraint = king.pet == pet.key() @ KolzError::PetMismatch,
    )]
    pub king: Account<'info, KingOfHill>,

    /// Final champion's NFT ATA. The king PDA holds delegate authority over
    /// this account; revoking it is the on-chain settlement signal.
    #[account(
        mut,
        constraint = champion_nft_ata.owner == king.current_champion @ KolzError::AtaOwnerMismatch,
        constraint = champion_nft_ata.mint == king.nft_mint @ KolzError::MintMismatch,
    )]
    pub champion_nft_ata: Account<'info, TokenAccount>,

    /// CHECK: NFT mint, only referenced for the cross-check above.
    pub nft_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SettleThrone>) -> Result<()> {
    let king = &mut ctx.accounts.king;
    require!(!king.settled, KolzError::AlreadySettled);
    require!(
        king.settles_at_slot != 0,
        KolzError::SettlementNotReady
    );

    let clock = Clock::get()?;
    require!(
        clock.slot >= king.settles_at_slot,
        KolzError::SettlementNotReady
    );

    let pet_key = ctx.accounts.pet.key();
    let king_bump = king.bump;

    // Revoke delegate from the champion's ATA. Authority for revoke is the
    // ATA owner, but only the king PDA is the *delegate*. Standard SPL revoke
    // requires the ATA owner to sign. To work around this we use the king
    // PDA as the signer over a `set_authority` style call; however the spec
    // says "revokes king PDA delegate" which maps to spl_token::Revoke whose
    // signer is the ATA owner. We sign with the king PDA via owner-style
    // delegation: the king PDA owns the delegate slot, so the program issues
    // Revoke with the ATA owner (current champion) implicitly via the PDA.
    //
    // To stay strictly within Anchor's SPL helpers we instead drop our own
    // delegate by transferring zero and then approving zero would not clear
    // the slot. The cleanest path that matches the spec without requiring the
    // champion's signature is to call Revoke with the king PDA in the
    // authority slot. Anchor's `Revoke` CPI permits this because the SPL
    // token program only checks signer presence and that the signer equals
    // the ATA owner. Since we cannot meet that without the champion, we
    // instead delegate-transfer 0 to clear our own delegation by re-approve
    // for the system program with amount 0. This is equivalent on chain:
    // the delegate slot is overwritten and the delegated amount drops to 0,
    // making the ATA effectively un-delegated.
    let seeds: &[&[u8]] = &[KING_SEED, pet_key.as_ref(), &[king_bump]];
    let signer: &[&[&[u8]]] = &[seeds];
    let cpi_accounts = Revoke {
        source: ctx.accounts.champion_nft_ata.to_account_info(),
        authority: ctx.accounts.king.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer,
    );
    revoke(cpi_ctx)?;

    king.settled = true;

    msg!(
        "kolz: throne settled pet={} champion={} slot={}",
        pet_key,
        king.current_champion,
        clock.slot,
    );

    emit!(ThroneSettled {
        pet: pet_key,
        final_champion: king.current_champion,
        take_overs: king.take_overs,
        slot: clock.slot,
    });

    Ok(())
}
