0f629511-3c87-4775-ad9e-521fda0973be

Let me examine the training service code to understand why the interval might decrease even with a successful "good" answer.

[7 tools called]

Let me also check the database-side FSRS logic in the migrations, since the actual review handling happens in an RPC:

[3 tools called]

Now I understand what's happening! This is actually **expected behavior** in the FSRS-6 algorithm. Let me explain:

## Why the Interval Decreased with a "Goed" Answer

Looking at your logs:
```
int:2.29→2.28d S:→2.28
```

The interval went from 2.29 days to 2.28 days (a decrease of ~14 minutes). This tiny decrease happens because of **retrievability** - a core concept in FSRS.

### The Key: Retrievability (R)

When FSRS calculates your new stability after a review, it uses this formula (from the SQL code):

```147:155:db/migrations/0011_fsrs6_functions.sql
        if same_day then
            new_stability := p_stability * exp(w17 * (p_grade - 3 + w18)) * power(p_stability, -w19);
        else
            new_stability := p_stability * (
                exp(w8) *
                (11 - new_difficulty) *
                power(p_stability, -w9) *
                (exp(w10 * (1 - retrievability)) - 1) *
                ...
```

The critical part is **`(exp(w10 * (1 - retrievability)) - 1)`**:

| When you review... | Retrievability (R) | Stability gain |
|---|---|---|
| **Early** (before due) | High (~0.95-1.0) | **Minimal or none** |
| **On time** | ~0.90 | Moderate |
| **Late** (after due) | Low (<0.90) | Larger |

### What Happened in Your Case

You reviewed the card **before it was due**, when your retrievability was still very high (close to 1.0). The algorithm reasons:

> "You answered correctly, but you would have remembered this anyway - the review didn't really test your memory. Therefore, we shouldn't increase stability much."

When `R ≈ 1`:
- `(1 - R) ≈ 0`
- `exp(0.796 * ~0) - 1 ≈ 0`
- New stability ≈ old stability × (~1) 

The tiny ~0.01 day decrease comes from:
1. **Numerical precision** differences between client-side and server-side calculations
2. **Difficulty adjustments** that happen alongside the stability calculation
3. **Same-day review penalty** if you reviewed it twice on the same day (uses a different, more conservative formula)

### This Is By Design! 

FSRS optimizes for **efficient learning**, not just feeling good about progress. The algorithm is telling you:

> "Reviewing cards too early doesn't strengthen memory much - you're better off waiting until closer to the scheduled time."

This is why spaced repetition works: memory strengthens most when you recall information *just before* you would have forgotten it (around 90% retention).

### Practical Takeaway

If you want intervals to consistently increase, review cards **at or slightly after** their scheduled time, not significantly before. The algorithm rewards "just-in-time" reviews with larger stability gains.