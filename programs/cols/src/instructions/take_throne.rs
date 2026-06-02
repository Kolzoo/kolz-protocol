//! `take_throne` instruction.
//!
//! Challenger pulls the king NFT into their wallet provided they hold a
//! strictly larger memecoin balance than the current champion. The challenger
//! also re-delegates the king PDA so the next challenger can yank the NFT
//! back out without another signature from the now-displaced champion.

use anchor_lang::prelude::*;
use anchor_spl::token::{
    approve, transfer, Approve, Mint, Token, TokenAccount, Transfer,
};

use crate::constants::{
    CONFIG_SEED, KING_ESCROW_SEED, KING_SEED, LAUNCH_SEED, PET_SEED, SYSTEM_PROGRAM_ID,
    THRONE_SETTLEMENT_SLOTS,
};
use crate::errors::ColsError;
use crate::events::ThroneCaptured;
use crate::state::{Config, KingOfHill, Launch, Pet};

#[derive(Accounts)]
pub struct TakeThrone<'info> {
    /// Wallet that wants to seize the throne. Pays for nothing besides the
    /// transaction fee; the challenger ATA must already exist with their
    /// memecoin balance and a token account for the NFT.
    #[account(mut)]
    pub challenger: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [PET_SEED, pet.owner.as_ref(), pet.kol_name.as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, Pet>,

    #[account(
        seeds = [LAUNCH_SEED, pet.key().as_ref()],
        bump = launch.bump,
        constraint = launch.pet == pet.key() @ ColsError::PetMismatch,
    )]
    pub launch: Account<'info, Launch>,

    #[account(
        mut,
        seeds = [KING_SEED, pet.key().as_ref()],
        bump = king.bump,
        constraint = king.pet == pet.key() @ ColsError::PetMismatch,
    )]
    pub king: Account<'info, KingOfHill>,

    /// The memecoin mint. Cross-checked against the launch state.
    #[account(
        constraint = pump_mint.key() == launch.pump_mint @ ColsError::MintMismatch,
    )]
    pub pump_mint: Account<'info, Mint>,

    /// Challenger's pump token ATA. Used to read their balance.
    #[account(
        constraint = challenger_pump_ata.owner == challenger.key() @ ColsError::AtaOwnerMismatch,
        constraint = challenger_pump_ata.mint == pump_mint.key() @ ColsError::MintMismatch,
    )]
    pub challenger_pump_ata: Account<'info, TokenAccount>,

    /// The NFT mint.
    #[account(
        constraint = nft_mint.key() == king.nft_mint @ ColsError::MintMismatch,
    )]
    pub nft_mint: Account<'info, Mint>,

    /// Escrow vault. Holds the NFT before any capture has occurred. After
    /// the first capture this account is empty but still passed in so the
    /// instruction shape stays uniform.
    #[account(
        mut,
        constraint = escrow_vault.key() == king.nft_escrow_vault @ ColsError::MintMismatch,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA owner of the escrow vault. Only used as a signer.
    #[account(
        seeds = [KING_ESCROW_SEED, king.key().as_ref()],
        bump = king.nft_escrow_vault_bump,
    )]
    pub escrow_owner: UncheckedAccount<'info>,

    /// Challenger's NFT ATA. Will receive the NFT.
    #[account(
        mut,
        constraint = challenger_nft_ata.owner == challenger.key() @ ColsError::AtaOwnerMismatch,
        constraint = challenger_nft_ata.mint == nft_mint.key() @ ColsError::MintMismatch,
    )]
    pub challenger_nft_ata: Account<'info, TokenAccount>,

    /// Previous champion's NFT ATA. Optional in the sense that on the first
    /// capture there is no previous champion, so the caller passes the
    /// escrow vault again as a no-op placeholder. We detect the first-capture
    /// case by reading the king state.
    #[account(mut)]
    pub prev_champion_nft_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<TakeThrone>) -> Result<()> {
    let king = &mut ctx.accounts.king;
    require!(!king.settled, ColsError::SettlementPeriodEnded);

    let clock = Clock::get()?;
    let now = clock.slot;

    // Once a settlement deadline is locked in, late captures are rejected.
    if king.settles_at_slot != 0 && now >= king.settles_at_slot {
        return err!(ColsError::SettlementPeriodEnded);
    }

    let challenger_balance = ctx.accounts.challenger_pump_ata.amount;
    require!(
        challenger_balance > king.champion_balance,
        ColsError::NotTopHolder
    );
    require!(challenger_balance > 0, ColsError::InvalidAmount);

    let pet_key = ctx.accounts.pet.key();
    let king_key = king.key();
    let king_bump = king.bump;
    let escrow_bump = king.nft_escrow_vault_bump;

    let first_capture = king.is_unclaimed();
    let previous_champion = king.current_champion;

    if first_capture {
        // NFT lives in the escrow vault. Move it to the challenger using the
        // escrow PDA as authority.
        let seeds: &[&[u8]] = &[KING_ESCROW_SEED, king_key.as_ref(), &[escrow_bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.challenger_nft_ata.to_account_info(),
            authority: ctx.accounts.escrow_owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        transfer(cpi_ctx, 1)?;
    } else {
        // The previous champion must have been passed in as their actual ATA,
        // not the escrow vault placeholder.
        require!(
            ctx.accounts.prev_champion_nft_ata.key() != ctx.accounts.escrow_vault.key(),
            ColsError::MissingPrevChampionAta
        );
        require_keys_eq!(
            ctx.accounts.prev_champion_nft_ata.owner,
            king.current_champion,
            ColsError::AtaOwnerMismatch
        );
        require!(
            ctx.accounts.prev_champion_nft_ata.amount >= 1,
            ColsError::MissingPrevChampionAta
        );

        // King PDA must already hold delegate authority over the previous
        // champion's ATA (granted during the previous capture).
        let seeds: &[&[u8]] = &[KING_SEED, pet_key.as_ref(), &[king_bump]];
        let signer: &[&[&[u8]]] = &[seeds];
        let cpi_accounts = Transfer {
            from: ctx.accounts.prev_champion_nft_ata.to_account_info(),
            to: ctx.accounts.challenger_nft_ata.to_account_info(),
            authority: ctx.accounts.king.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        transfer(cpi_ctx, 1)?;
    }

    // Challenger now delegates the king PDA over their NFT ATA so the next
    // challenger can yank the NFT without another signature from the new
    // (now current) champion.
    {
        let cpi_accounts = Approve {
            to: ctx.accounts.challenger_nft_ata.to_account_info(),
            delegate: ctx.accounts.king.to_account_info(),
            authority: ctx.accounts.challenger.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        approve(cpi_ctx, 1)?;
    }

    // Update king state.
    king.current_champion = ctx.accounts.challenger.key();
    king.champion_balance = challenger_balance;
    king.last_captured_slot = now;
    king.take_overs = king.take_overs.saturating_add(1);

    if first_capture {
        king.settles_at_slot = now
            .checked_add(THRONE_SETTLEMENT_SLOTS)
            .ok_or(error!(ColsError::SettlementNotReady))?;
    }

    // Sanity: champion must not be the sentinel after a capture.
    require!(
        king.current_champion != SYSTEM_PROGRAM_ID,
        ColsError::AtaOwnerMismatch
    );

    msg!(
        "cols: throne taken pet={} new_champion={} balance={} take_overs={}",
        pet_key,
        king.current_champion,
        king.champion_balance,
        king.take_overs,
    );

    emit!(ThroneCaptured {
        pet: pet_key,
        new_champion: king.current_champion,
        previous_champion,
        champion_balance: king.champion_balance,
        take_overs: king.take_overs,
        slot: now,
        first_capture,
        settles_at_slot: king.settles_at_slot,
    });

    Ok(())
}
