# How a CSV import can go wrong

Written before the importer. Each line says what goes wrong and what `importCsv` does about it.
The tests in this folder are named after these lines.

## The file itself

1. Empty file, or only `CRLF`. Tradovate writes this for a range with no activity. Refuse: the
   file is empty.
2. The file is the single word `undefined`. Tradovate writes this for a broken Performance export.
   Refuse, naming the word.
3. UTF-8 byte-order mark before the first header. TopstepX writes one. Strip it, or `Id` reads as
   `﻿Id` and detection fails.
4. CRLF line endings, LF line endings, a trailing line break, blank lines in the middle or at the
   end. Blank lines are not rows.
5. Header names with stray spaces. Trim them. Matching is otherwise case-sensitive.
6. Quoted fields holding commas: `"49,490.00"`, `"$1,234.00"`. The comma is part of the value.
7. Quoted fields holding `""` (a literal quote) or a line break. Both stay inside the field.
8. Values with a leading space: Tradovate writes `, Buy`, `, Commission`. Trim every value.
9. A row with more or fewer fields than the header. Refuse, naming the line.
10. A header with no rows. Refuse.
11. A file that is not one of the six exports. Refuse and list the six by name.
12. A layout that must be refused: Tradovate Orders (includes orders that never
    filled) and Tradovate Position History (pairs repeat fills). Refuse with the reason.
13. Many bad rows. Report every bad line (capped), not just the first.

## Numbers

14. Money with a dollar sign, thousands separators or accounting parentheses: `$109.00`,
    `$(17.00)`, `"49,490.00"`. Read all three.
15. Prices padded to nine decimals (`28911.000000000`). Same number.
16. A blank price, quantity, P&L or balance. Refuse the row; blank is not zero.
17. A price that is not a number (`abc`, `1e5`). Refuse the row.
18. A negative price. Allowed: crude oil settled below zero in April 2020, and the P&L math
    still holds. A zero or negative quantity is refused.
19. Float drift (`0.1 + 0.2`). All money is `decimal.js`; strings in, strings out.
20. A scratch trade whose P&L is zero. The day still counts, with `0.00`, never `-0.00`.

## Time and trading days

21. A fill at or after 17:00 America/Chicago (18:00 New York) belongs to the next trading day.
    16:59:59 CT is still today.
22. Sunday evening's session open (Sunday 17:00 CT onward) is Monday's trading day.
23. Daylight saving: the 17:00 CT roll is at 22:00 UTC in summer and 23:00 UTC in winter. Use the
    IANA zone, never a fixed offset.
24. Weekends: labelled by the New York clock and the 18:00 roll, with no
    special holiday or weekend calendar.
25. Timestamps with an explicit offset (`09/14/2026 09:24:03 -04:00`), with `Z`
    (`2026-09-14 13:24:03.207Z`), or with no zone at all (Tradovate display columns, which are
    US Eastern). Each layout reads the one its export writes.
26. TopstepX `TradeDay` is written at a fixed `-05:00`. Take its calendar date as written; never
    shift it by its offset.
27. A timestamp that is not a real date (`02/30/2026`) or has no zone where one is required.
    Refuse the row.

## Fills and pairing

28. Rows out of time order. Tradovate sorts Fills by order id, not time. Sort by instant, then by
    fill id, before pairing.
29. Two fills at the same instant. Ties break by fill id so the result is stable.
30. The same fill id twice in one file. Refuse; an export lists each fill once.
31. A sell before any buy. That opens a short; it is not an error.
32. Scale-in: several entries, one exit. Scale-out: one entry, several exits (partial closes).
33. A reversal through zero: one fill closes the position and opens the other side. The fill's
    quantity and fee split between the two.
34. A position still open at the end of the file. Warn, and leave out every fill of that
    unfinished position.
35. Two dated contracts of the same root (`MNQU6`, `MNQZ6`) held at once around a roll. They are
    separate positions, never netted.
36. Two accounts in one file. Paired separately.
37. Unknown symbol. Refuse, naming the symbol: its point value is unknown.
38. A root given without a month (`MNQ`). Accepted; the point value is the same.
39. Realized P&L lands on the trading day of the fill that realized it. A runner closed the next
    day puts only its own part on that day.
40. Fees: a Tradovate fill with a `commission` value is net of it; a blank one counts its
    contracts in `sidesWithoutFees`. TopstepX Orders carry no fees, so every filled contract
    counts.
41. Orders that never filled (TopstepX `Cancelled`, `Rejected`). Skip them and say how many. A
    file where nothing filled is refused.

## Round-trip exports

42. Tradovate Performance names no account: one account with `externalId: null`.
43. Its P&L is gross: `sidesWithoutFees` is 2 x qty per row, on the trading day of the later of
    the two timestamps (a short's buy comes last).
44. One fill id on two Performance rows (one entry closed by two exits). Normal, not a duplicate.
    The same buy and sell pair twice is a duplicate.
45. TopstepX Trades: P&L minus Fees minus Commissions. When a row has neither cost, its contracts
    count in `sidesWithoutFees`. A repeated `Id` is refused.

## Ledgers

46. Balance history: one row per account per day. Daily P&L is the change from that account's
    previous row, by date, whatever order the rows come in. The first row has no previous
    balance: skip it and warn with its date.
47. An account with a single balance row. No P&L can be worked out; warn, return the account
    with no days.
48. Balance rows with no change (weekends, days off). Not trading days; leave them out.
49. The same account and date twice. Refuse.
50. A payout inside the balance-history range shows up as a loss. The file cannot tell them
    apart; this is a known limit, documented, not guessed around.
51. Cash history: `Delta` is the change and `Amount` is the running balance. Reading `Amount` as
    the change would count the whole balance as P&L.
52. Cash history: trade P&L, commission and fee rows sum into the day. Withdrawal or payout rows
    become payouts as positive amounts. Everything else (deposits, resets) is ignored and
    counted in a warning with the type names.
53. Cash history: a zero-P&L pairing writes no `Trade Paired` row, so a scratch day shows only its
    commissions. That is the true net.
54. A repeated `Transaction ID`. Refuse.
