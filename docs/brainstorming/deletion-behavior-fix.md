Here's what I propose for making the deletion behavior more consistent:

1. Both stopping tracking and deleting from the list should count as a deletion.
2. The deletion should not be immediate, but should have a delay to allow the user to undo it.
3. There should be an undo with a timer to allow the user to undo it.
4. This undo should show both next to the bookmark icon in the player UI and next to/inside the item in the popup at the same time.
5. The undo should show a countdown timer to show the user how much time they have left to undo the deletion.
6. Undo from either should cancel the countdown and the deletion.
7. Once the countdown is done, the deletion should be final.
