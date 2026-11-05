# Cent Trading Accounts (USD-Based) — Phase 1 Requirements

**Document type:** Client requirements specification  
**Format:** Scrum epic and user stories  
**Phase:** 1 (Cent accounts with USD wallet)  
**Status:** Draft — pending client sign-off  
**Last updated:** May 2026  

**Related (internal):** Technical implementation canvas — `.cursor/canvases/usc-currency-phase1.canvas.tsx`  
*(This document is for business validation only; it does not describe system architecture.)*

---

## Sign-off

| Role | Name | Signature | Date | Comments |
|------|------|-----------|------|----------|
| Client / Product owner | | | | |
| Business analyst | | | | |
| Project manager | | | | |
| QA lead | | | | |

**Approval means:** The scope, behaviour, and out-of-scope items below are agreed for Phase 1 delivery.

---

## 1. Executive summary

Today, the CRM treats all trading accounts as **US Dollar (USD)** accounts. Amounts move **one dollar in the wallet = one dollar on the trading platform**.

Brokers often offer **cent accounts** (also called Standard Cent accounts). On the trading platform, these accounts use **US Cent (USC)** — where **$1.00 equals 100 cents** on the platform. Clients still think and operate in **dollars**, but the platform records balances and movements in cents.

**Phase 1** enables a new account type — **Cent\Standard** — so that:

- Clients and staff **always enter and see amounts in US Dollars** in the CRM.
- When money moves to or from a cent account, the CRM **correctly converts** between dollars (wallet / records) and cents (trading platform).
- Clients and staff **see both** the dollar amount and the cent equivalent when dealing with cent accounts — so there is no confusion about how much is actually moving on the platform.
- **Existing USD trading accounts and demo accounts are unchanged.**

The client **wallet remains USD-only** in Phase 1. Multi-currency wallets (EUR, GBP, etc.) are a later phase.

---

## 2. Epic

### EPIC-001 — Enable cent (USC) trading accounts with USD-based CRM experience

**Epic statement**

As a broker, we want clients to open and use **Standard Cent** trading accounts while the CRM continues to operate in **US Dollars**, so that cent account holders have a clear, consistent experience and all financial records remain in dollars for reporting and compliance.

**Epic goals**

1. Launch a new trading group: **Cent\Standard** (Standard Cent).
2. Keep all CRM transaction records and wallet balances in **USD**.
3. Show **dual amounts** (dollars + cents) wherever cent accounts are used in the client portal and admin back-office.
4. Leave all **existing USD accounts** and **demo accounts** working exactly as today.

**Epic success measures**

- A client can transfer $100 from their USD wallet to a new Cent\Standard account and see **10,000 USC** credited on the trading platform.
- The same client can transfer $50 back to the wallet and see **5,000 USC** debited on the platform.
- All CRM records for these movements show **$100** and **$50** (USD).
- Existing USD account holders see no change in behaviour.

---

## 3. Background and business context

### 3.1 What is a cent account?

| Concept | Client / staff view (CRM) | Trading platform view |
|---------|---------------------------|------------------------|
| Standard USD account | $500 | $500 |
| Standard Cent account | $500 | 50,000 USC (cents) |

**Rule of thumb:** 1 USD = 100 USC on the trading platform.

### 3.2 What stays the same in Phase 1?

- Client **wallet** currency: **USD only**
- **Deposits** from payment providers: credited to wallet in **USD**
- **Withdrawals** by clients: from **wallet only** (not directly from trading account — as today)
- **All existing** trading groups and accounts: remain **USD**, one-to-one
- **Demo** trading accounts: remain **USD**, no cent conversion

### 3.3 What is new?

- One new trading group: **Cent\Standard** (display name: **Standard Cent**)
- Clients who are allowed (via their IB / partner setup) can **open** a Cent\Standard live account
- **Transfers** between USD wallet and Cent\Standard accounts use automatic conversion
- **Staff** can perform the same financial actions on cent accounts with dual-currency visibility

---

## 4. User stories

Stories are grouped by audience. Priority: **Must have** for Phase 1 unless marked **Should have**.

---

### 4.1 Client portal (`crm-client`)

#### US-001 — Open a Standard Cent account  
**Priority:** Must have  

**As a** client  
**I want to** open a live **Standard Cent** trading account when my broker allows it  
**So that** I can trade on a cent-denominated account through the same CRM portal  

**Acceptance criteria**

1. Clients whose partner profile includes **Cent\Standard** can select it when opening a new live account.
2. Clients without access do **not** see Cent\Standard as an option.
3. After creation, the account is clearly labelled as a **cent account** (e.g. Standard Cent / USC).
4. Demo account creation is **unchanged** (no cent option on demo).

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |
| 2 | | |

---

#### US-002 — See my cent account balance in dollars and cents  
**Priority:** Must have  

**As a** client  
**I want to** see my cent account balance shown in **dollars** (primary) and **cents** (secondary)  
**So that** I understand both my CRM balance and what appears on the trading platform  

**Acceptance criteria**

1. Account list and account picker show **dollar balance** as the main figure (e.g. **$500.00**).
2. For cent accounts only, a secondary line shows the platform amount (e.g. **50,000 USC**).
3. USD accounts show **only** the dollar balance (no secondary line).

**Example**

| Account type | Display |
|--------------|---------|
| Standard USD | $500.00 |
| Standard Cent | $500.00 *(50,000 USC)* |

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

#### US-003 — Transfer from wallet to cent account in dollars  
**Priority:** Must have  

**As a** client  
**I want to** enter a transfer amount in **US Dollars** from my wallet to my cent account  
**So that** I do not have to calculate cents myself  

**Acceptance criteria**

1. Transfer amount field accepts **USD only** (same as today for USD accounts).
2. Before confirming, the client sees how much will be credited on the platform (e.g. *“$100.00 will credit approximately 10,000 USC to your trading account”*).
3. After a successful transfer, wallet decreases by the entered **dollar** amount.
4. CRM transaction history shows the amount in **USD** (e.g. $100.00).

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

#### US-004 — Transfer from cent account to wallet in dollars  
**Priority:** Must have  

**As a** client  
**I want to** enter how much I wish to receive in **US Dollars** when transferring from my cent account to my wallet  
**So that** the process feels the same as transferring from a USD account  

**Acceptance criteria**

1. Client enters the desired **USD** amount to receive in the wallet.
2. Before confirming, the client sees the platform debit in cents (e.g. *“50,000 USC will be debited from your trading account”* for a $500 transfer).
3. Transfer is blocked if the **dollar equivalent** of the available balance is insufficient.
4. Bonus / non-withdrawable restrictions continue to apply in **dollar** terms (as agreed for Phase 1).

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

#### US-005 — Deposit to wallet and auto-transfer to cent account  
**Priority:** Must have  

**As a** client  
**I want** deposits that auto-transfer to my cent trading account to work correctly  
**So that** funding my cent account after a card or crypto deposit is seamless  

**Acceptance criteria**

1. Deposit credits the **USD wallet** first (unchanged).
2. If the client selected a cent account for auto-transfer, the subsequent wallet-to-account transfer uses **dollar input, cent output** (same rules as US-003).
3. Client sees the correct dual amount on confirmation where applicable.

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

### 4.2 Admin back-office (`crm-admin`)

#### US-006 — See cent account balances in dollars and cents  
**Priority:** Must have  

**As an** admin or finance user  
**I want to** see cent account balances in **both dollars and cents**  
**So that** I can support clients and reconcile amounts without manual calculation  

**Acceptance criteria**

1. Client account lists and financial screens show **dollar balance** as primary for cent accounts.
2. Secondary cent amount shown for cent accounts only.
3. USD accounts unchanged.

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

#### US-007 — Perform transfers and manual deposits to cent accounts in dollars  
**Priority:** Must have  

**As an** admin  
**I want to** enter amounts in **US Dollars** when transferring or manually depositing to a cent account  
**So that** admin workflows stay consistent and records stay in USD  

**Acceptance criteria**

1. Admin amount fields remain **USD** for all account types.
2. When a cent account is selected, admin sees the **cent equivalent** before submitting.
3. CRM transaction records store **USD** amounts.
4. Manual deposit to a cent account credits the correct **cent amount** on the trading platform.

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

#### US-008 — Adjustments and refunds on cent accounts  
**Priority:** Must have  

**As an** admin  
**I want** balance adjustments and refunds on cent accounts to follow the same dollar-based rules  
**So that** support actions are accurate and auditable  

**Acceptance criteria**

1. Admin enters adjustment amounts in **USD**.
2. Platform receives the correct cent equivalent.
3. Transaction records remain in **USD**.

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

### 4.3 Operations and configuration

#### US-009 — Configure which clients can open Cent\Standard  
**Priority:** Must have  

**As an** operations user  
**I want to** control which IB / partner profiles include the **Cent\Standard** group  
**So that** only intended client segments can open cent accounts  

**Acceptance criteria**

1. **Cent\Standard** is added to the trading group catalogue (name: **Cent\Standard**, description: **Standard Cent**).
2. Operations can assign **Cent\Standard** to selected IB commission profiles (manual configuration in Phase 1 — no new admin screen required).
3. Clients under profiles **without** Cent\Standard cannot open cent accounts.

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

#### US-010 — Disable cent account offering without rollback  
**Priority:** Should have  

**As an** operations user  
**I want to** disable the **Cent\Standard** group if needed  
**So that** no new cent accounts can be opened while existing cent accounts continue to work  

**Acceptance criteria**

1. Setting the group to **inactive** prevents **new** cent account creation.
2. **Existing** cent accounts and transfers continue to work.
3. No requirement for full system rollback in Phase 1.

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

### 4.4 Reporting and records

#### US-011 — All CRM financial records remain in USD  
**Priority:** Must have  

**As a** broker  
**I want** all CRM transaction and wallet records to remain in **US Dollars**  
**So that** reporting, reconciliation, and compliance stay consistent  

**Acceptance criteria**

1. Wallet balances: **USD**.
2. Transaction amounts in CRM history: **USD**.
3. Cent amounts appear only as **supplementary display** for cent accounts (not as the primary stored record in Phase 1).

**Client notes / comments**

| # | Comment | Response |
|---|---------|----------|
| 1 | | |

---

## 5. Business rules (Phase 1)

| # | Rule |
|---|------|
| BR-01 | Clients and staff **always enter amounts in USD** in the CRM for transfers, deposits, and adjustments. |
| BR-02 | **1 USD = 100 USC** on the trading platform for Cent\Standard accounts. |
| BR-03 | All **existing** trading groups remain **USD** (one dollar = one dollar on platform). |
| BR-04 | Only accounts on the **Cent\Standard** group use cent conversion. |
| BR-05 | **New cent accounts only** — existing accounts on old groups are not converted or migrated to cent behaviour. |
| BR-06 | **Demo accounts** are excluded — no cent conversion on demo. |
| BR-07 | **Wallet currency** remains USD only in Phase 1. |
| BR-08 | **Dual display** (dollars + cents) is required on client and admin screens whenever the user transacts with or views a cent account. |
| BR-09 | Dollar amounts are shown to **two decimal places** (e.g. $100.00). |
| BR-10 | Non-withdrawable bonus amounts on cent accounts are tracked and enforced in **USD**. |
| BR-11 | A cent account group's currency setting **cannot be changed** after the group is created. |

---

## 6. Example scenarios (for validation)

These scenarios should pass in **QA / staging** before production release.

| ID | Scenario | What the user does | Expected result |
|----|----------|-------------------|-----------------|
| S-01 | Open cent account | Client opens live account on **Standard Cent** | Account created; labelled as cent account |
| S-02 | Wallet → cent | Transfer **$100** from wallet to cent account | Wallet −$100; platform +**10,000 USC**; CRM shows $100 |
| S-03 | Cent → wallet | Transfer **$50** from cent account to wallet | Platform −**5,000 USC**; wallet +$50; CRM shows $50 |
| S-04 | Dual display (client) | Client enters $100 transfer to cent account | Screen shows **$100** and **≈ 10,000 USC** before confirm |
| S-05 | Dual display (admin) | Admin manual deposit **$75** to cent account | Admin sees **$75** and **≈ 7,500 USC**; platform +7,500 USC |
| S-06 | USD account unchanged | Transfer **$100** on existing **USD** account | Platform +$100 (no conversion) |
| S-07 | Demo unchanged | Any action on **demo** account | No cent conversion; behaves as today |
| S-08 | Insufficient funds | Transfer **$600** when cent account shows **$500** available | Transfer blocked with clear message in **dollars** |
| S-09 | Auto-deposit | Deposit with auto-transfer to cent account | Wallet credited USD, then correct cent credit on platform |
| S-10 | IB access control | Client without Cent\Standard in profile tries to open cent account | Cent option not available |

---

## 7. Out of scope — Phase 1

The following are **explicitly excluded** from Phase 1. They may be considered in a future phase.

| Item | Notes |
|------|-------|
| Multi-currency wallets (EUR, GBP, AED, etc.) | Wallet stays USD |
| FX conversion between unrelated currencies | e.g. EUR wallet → USC account |
| Converting or fixing **existing** cent accounts created before this release | New Cent\Standard accounts only |
| Cent / dual-currency on **demo** accounts | Demo stays USD |
| Client withdrawal **directly from trading account** | Unchanged — wallet withdrawals only |
| New admin UI to edit group currency | Configuration via operations / database in Phase 1 |
| Full reporting redesign for cent accounts | CRM records stay USD; platform reports may show USC separately |
| Changing a group's currency after creation | Not permitted |

---

## 8. QA and go-live checklist (non-technical)

Operations and QA to complete before production:

- [ ] **Cent\Standard** group exists and is active on staging and production
- [ ] **Cent\Standard** is assigned to the correct IB / partner profiles
- [ ] Matching group exists on the **trading platform** (same name: Cent\Standard)
- [ ] Test client can open a **Standard Cent** live account
- [ ] Scenarios **S-01 through S-10** pass on staging
- [ ] Regression: existing **USD** account transfer still 1:1
- [ ] Regression: **demo** account behaviour unchanged
- [ ] Client and admin screens show **dual amounts** for cent accounts
- [ ] CRM transaction history shows **USD** amounts only

**If cent accounts must be paused after go-live:** deactivate the **Cent\Standard** group (no new accounts). Existing cent accounts continue to operate.

---

## 9. Story map summary

| ID | Story title | Audience | Priority |
|----|-------------|----------|----------|
| US-001 | Open Standard Cent account | Client | Must |
| US-002 | See balance in dollars and cents | Client | Must |
| US-003 | Wallet → cent transfer in dollars | Client | Must |
| US-004 | Cent → wallet transfer in dollars | Client | Must |
| US-005 | Deposit + auto-transfer to cent | Client | Must |
| US-006 | Admin see dual balances | Admin | Must |
| US-007 | Admin transfers / deposits in dollars | Admin | Must |
| US-008 | Adjustments and refunds | Admin | Must |
| US-009 | Configure IB access to Cent\Standard | Operations | Must |
| US-010 | Disable cent offering | Operations | Should |
| US-011 | CRM records remain USD | Business | Must |

**Epic:** EPIC-001 — Enable cent trading accounts with USD-based CRM experience

---

## 10. Document history

| Date | Version | Author | Change |
|------|---------|--------|--------|
| 2026-05-22 | 0.1 | Project team | Initial client requirements draft from agreed Phase 1 scope |

---

## Appendix A — Glossary

| Term | Meaning |
|------|---------|
| **USD** | US Dollar — used for wallet and all CRM records in Phase 1 |
| **USC** | US Cent — unit used on the trading platform for cent accounts (100 USC = $1.00) |
| **Cent account** | A live trading account on the **Cent\Standard** group |
| **Standard Cent** | User-friendly name for the Cent\Standard account type |
| **Cent\Standard** | Technical name of the new trading group (must match trading platform) |
| **Dual display** | Showing both the dollar amount (CRM) and cent amount (platform) to the user |
| **Wallet** | Client's USD cash balance in the CRM, used for deposits and withdrawals |
| **Trading platform** | MetaTrader live environment where USC balances are held for cent accounts |
