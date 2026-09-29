# Ways the account evaluator can be wrong

Written before `src/evaluate.ts`. Each one is covered in `evaluate.test.ts`.

1. Days arrive unsorted, so the peak and breach date are read in the wrong order.
2. The peak includes the day being checked, so a day that makes a new high and then drops below the old floor is never flagged. (EOD trailing: the floor for day N comes from the peak through day N-1.)
3. A trailing floor keeps rising after it should lock (start, start + X), or locks when the rule says never.
4. A static drawdown moves with the peak.
5. Touching the floor exactly isn't counted as a breach.
6. After a breach, later days "recover" the account.
7. A daily loss limit with `session_lock` blows the account, or one with `breach` doesn't.
8. Fees for fills without commissions are left out, so P&L is too high.
9. Payouts don't reduce the balance, or reduce the trailing peak and make the floor drop.
10. A `profit_since_payout` consistency window includes days from before the last payout.
11. `bestDay: carries` still resets the best day after a payout.
12. `raises_target` consistency blocks passing instead of raising the target, and `blocks_payout` does the opposite.
13. A `profit_target` basis with `blocks_payout` suggests "more profit fixes it" when it can't.
14. Winning days count from before the last payout, or count days below the threshold.
15. Zero or negative total profit reads as consistent.
16. The fastest payout path isn't the one reported, or an eligible path is ranked below an ineligible one.
17. The projection says a payout is reachable with a zero or negative average day.
18. What-if mutates the stored account.
19. `afterFirstPayout` isn't applied, or it's applied before any payout.
20. An account with no days crashes, or reports a best day.
21. A payout is offered that takes the balance to or under the floor (found in review; the withdrawable amount is now capped at the floor, including a floor that jumps after the first payout).
22. A payout lowers the trailing peak. It deliberately doesn't: when a firm is silent, a withdrawal leaves the floor where it was and uses up cushion, which is the strict reading PX Journals uses too.
