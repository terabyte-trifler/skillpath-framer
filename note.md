# Submission note

I spent the first hour hitting the API instead of trusting the brief. The
country endpoint fails about half the time, not one in three, so the currency
fallback is the normal case, not an edge case.

Pricing is where I got stuck. The rupee and dollar prices aren't conversions of
each other, so guessing the wrong region shows someone a genuinely wrong price.
When the country call fails I show both prices instead of picking one.

With two more days I'd sort out the Render cold start — the free tier sleeps and
I never caught it waking, so my timeout is a guess. I'd also check the mobile
text sizes on a real phone.

Not happy with: if the country call keeps failing, the price can sit loading for
a while. It's rare but it looks broken.

I used Claude Code as a pair programmer. It wrote a lot of first drafts and I
pushed back on plenty — its first retry version would have changed the price
after clicking retry, and its validation let a null price render as ₹0. I tested
the assumptions myself and made the final calls.
