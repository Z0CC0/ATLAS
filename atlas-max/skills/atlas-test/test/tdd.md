# Test first — when the request says TDD, test first, red green

One behaviour at a time. The order is the method; skipping a step removes the proof.

1. **Name the behaviour.** One line: the input and what should happen. If the request holds
   several, list them and take the simplest first. A behaviour that cannot be stated as input
   and outcome is not ready to be built: ask.

2. **Write one test for it.** The smallest that states it. Use the interface you wish existed;
   if it does not exist yet, the test will not compile, and that is the first red.

3. **Run it and watch it fail.** For the right reason: the assertion, or the missing symbol,
   not a typo in the test or a broken import. A test never seen red proves nothing when it goes
   green. Quote the failing line.

4. **Write the least code that makes it pass.** Not the general solution, not the next case.
   A constant is allowed if one test is all there is; the next test will force the logic.

5. **Run the test, then the whole suite.** Green on both, or go back to 4. A test elsewhere
   that turned red is a behaviour you just changed: decide whether that was intended before
   touching it.

6. **Tidy.** Only now, and only with everything green: remove duplication between the new code
   and the old, rename what the test made clear. Run the suite again. No new behaviour in this
   step.

7. **Next behaviour**, from the list in 1. Stop when the list is empty, not when coverage
   reaches a number.

## What breaks the method

Writing three tests then the code: the first green hides which test asked for what.
Writing the code "to see the shape" and the test after: that is not test first, and the test
will mirror the code's mistakes.
A red caused by setup: fix the setup, see the real red, then go on.
Making a test pass by weakening it.

## Report, on top of the usual one

One line per cycle: `red  <test name>  <failing line>` then `green  <what was written>`.
Nothing is committed; the user commits where they want the checkpoints.
