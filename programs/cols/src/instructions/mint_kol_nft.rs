//! `mint_kol_nft` instruction.
//!
//! Creates a fresh 1/1 SPL mint, mints exactly one token into a PDA-owned
//! escrow ATA, then attaches Metaplex Token Metadata V3. The escrow ATA is
//! owned by the king-of-hill PDA so that subsequent `take_throne` calls can
//! pull the NFT out via the standard SPL token transfer with a PDA signer.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
    create_metadata_accounts_v3, CreateMetadataAccountsV3, Metadata as MetadataProgram,
};
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};
use mpl_token_metadata::types::DataV2;

use crate::constants::{
    CONFIG_SEED, KING_ESCROW_SEED, KING_SEED, LAUNCH_SEED, NFT_DECIMALS, NFT_SUPPLY, PET_SEED,
};
use crate::errors::ColsError;
use crate::events::KingMinted;
use crate::state::{Config, KingOfHill, Launch, Pet};
use crate::utils::check_metadata_lengths;

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String)]
pub struct MintKolNft<'info> {
    /// Oracle. Must equal `config.oracle`.
    #[account(mut)]
    pub oracle: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.oracle == oracle.key() @ ColsError::OracleMismatch,
    )]
    pub config: Account<'info, Config>,

    /// The pet whose throne is being created.
    #[account(
        seeds = [PET_SEED, pet.owner.as_ref(), pet.kol_name.as_ref()],
        bump = pet.bump,
    )]
    pub pet: Account<'info, Pet>,

    /// Launch state must already exist or the bonding-curve has not been
    /// observed yet and minting a king NFT would be premature.
    #[account(
        seeds = [LAUNCH_SEED, pet.key().as_ref()],
        bump = launch.bump,
        constraint = launch.pet == pet.key() @ ColsError::PetMismatch,
    )]
    pub launch: Account<'info, Launch>,

    /// The king-of-hill PDA. Initialized fresh here.
    #[account(
        init,
        payer = oracle,
        space = KingOfHill::SIZE,
        seeds = [KING_SEED, pet.key().as_ref()],
        bump,
    )]
    pub king: Account<'info, KingOfHill>,

    /// New mint account for the 1/1 NFT. The mint authority is set to the
    /// king PDA so only this program can mint, and the freeze authority is
    /// set to the same PDA so we can freeze the NFT in any account.
    #[account(
        init,
        payer = oracle,
        mint::decimals = NFT_DECIMALS,
        mint::authority = king,
        mint::freeze_authority = king,
    )]
    pub nft_mint: Account<'info, Mint>,

    /// CHECK: PDA whose only role is to own the escrow ATA so the king PDA
    /// can sign for transfers. We never write data to it.
    #[account(
        seeds = [KING_ESCROW_SEED, king.key().as_ref()],
        bump,
    )]
    pub escrow_owner: UncheckedAccount<'info>,

    /// Escrow ATA holding the freshly minted NFT until the first capture.
    #[account(
        init,
        payer = oracle,
        associated_token::mint = nft_mint,
        associated_token::authority = escrow_owner,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: Metaplex Token Metadata PDA. Address is derived by the
    /// metadata program and validated by the CPI; we only assert it exists
    /// and is writeable.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_metadata_program: Program<'info, MetadataProgram>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<MintKolNft>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    check_metadata_lengths(&name, &symbol, &uri)?;

    // Defensive: the launch must have been bonded to a real mint already.
    require!(
        ctx.accounts.launch.pump_mint != Pubkey::default(),
        ColsError::BondingCurveNotInitialized
    );

    let pet_key = ctx.accounts.pet.key();
    let king_bump = ctx.bumps.king;
    let escrow_bump = ctx.bumps.escrow_owner;

    // Step 1: mint exactly one token to the escrow ATA, signed by the king PDA.
    {
        let seeds: &[&[u8]] = &[KING_SEED, pet_key.as_ref(), &[king_bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.nft_mint.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.king.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        mint_to(cpi_ctx, NFT_SUPPLY)?;
    }

    // Step 2: create Metaplex Token Metadata V3 record. Authority is the king PDA.
    {
        let data = DataV2 {
            name: name.clone(),
            symbol: symbol.clone(),
            uri: uri.clone(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let seeds: &[&[u8]] = &[KING_SEED, pet_key.as_ref(), &[king_bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        let cpi_accounts = CreateMetadataAccountsV3 {
            metadata: ctx.accounts.metadata.to_account_info(),
            mint: ctx.accounts.nft_mint.to_account_info(),
            mint_authority: ctx.accounts.king.to_account_info(),
            payer: ctx.accounts.oracle.to_account_info(),
            update_authority: ctx.accounts.king.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        create_metadata_accounts_v3(cpi_ctx, data, true, true, None)?;
    }

    // Touch invoke_signed reference so unused-import lint stays quiet across
    // both versions of the anchor-spl helper crates.
    let _ = invoke_signed::<&[&[u8]]>;

    // Step 3: persist king state.
    ctx.accounts.king.initialize(
        pet_key,
        ctx.accounts.nft_mint.key(),
        ctx.accounts.escrow_vault.key(),
        king_bump,
        escrow_bump,
    );

    let slot = Clock::get()?.slot;
    msg!(
        "cols: king minted pet={} mint={} name={} symbol={}",
        pet_key,
        ctx.accounts.nft_mint.key(),
        name,
        symbol,
    );

    emit!(KingMinted {
        pet: pet_key,
        nft_mint: ctx.accounts.nft_mint.key(),
        escrow_vault: ctx.accounts.escrow_vault.key(),
        slot,
    });

    Ok(())
}
